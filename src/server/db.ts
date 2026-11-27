import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { hashPassword, isAdminEnvPasswordConfigured, isScryptHash } from './auth.ts';
import type { 
  User, 
  UserRole,
  Student, 
  Guardian, 
  Product, 
  Sale, 
  SaleItem,
  Invoice, 
  PixPayment, 
  StockMovement, 
  FinancialTransaction, 
  WhatsAppNotification, 
  AuditLog, 
  SystemSettings,
  MonthlyClosingPreview,
  ProductCategory,
  Passeio,
  TripOperation,
  TripExpenseItem,
  TripParticipantAllocation,
  TripParticipantAllocationItem,
  TripDistributionMethod,
  PdvPasseiosPermissions,
  PaymentMethod,
  CashRegisterSession,
  CashMovement,
  CashMovementType,
  BillingBatch,
  BillingBatchType,
  BillingBatchPreview,
  BillingPreviewSale,
  BillingPreviewSaleItem,
  BillingStudentPreviewItem,
  IndividualInvoicePayload,
  IndividualSaleSelection,
  InvoiceHistoryEntry,
  InvoiceSaleItemLink,
  PeriodBillingPayload,
  ReceiptItemSnapshot,
  ReceiptPaymentLine,
  ReceiptReversalRecord,
  ReceiptSettings,
  ReceiptStatus,
  SaleAllocatedItem,
  SaleBillingStatus,
  SaleInvoiceAllocation,
  SalePaymentEntry,
  SalesReceipt,
  UnbilledConsumptionOverview
} from '../types/index.ts';
import { generateBacenPixPayload } from '../utils/pix.ts';
import { getInitialsAvatar } from '../utils/avatar.ts';
import {
  IntegrityError,
  buildIntegrityReport,
  getInconsistentSales,
  isSaleConsistent,
  validateDataIntegrity,
  type IntegrityReport,
  type IntegritySnapshot,
} from '../utils/dataIntegrity.ts';
import { 
  initialUsers, 
  initialGuardians, 
  initialStudents, 
  initialProducts, 
  initialStockMovements, 
  initialSales, 
  initialFinancialLedger, 
  initialInvoices, 
  initialPixPayments, 
  initialWhatsAppNotifications, 
  initialAuditLogs, 
  initialSettings,
  initialPasseios,
  CATALOG_VERSION,
  OFFICIAL_GUARDIAN_ASSIGNMENTS
} from './seedData.ts';

export type SaleFaultInjectionStage =
  | 'CREATE_SALE'
  | 'DEDUCT_STOCK'
  | 'UPDATE_STUDENT'
  | 'CREATE_RECEIPT'
  | 'PERSIST_STORAGE';

export interface DatabaseServiceOptions {
  dbFilePath?: string;
  disableDisk?: boolean;
  disableSupabase?: boolean;
}

const VALID_PAYMENT_METHODS = new Set<PaymentMethod>([
  'CONTA_ALUNO',
  'DINHEIRO',
  'PIX',
  'CARTAO_CREDITO',
  'CARTAO_DEBITO',
  'MERCADO_PAGO',
]);

function deepCloneData<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export interface DatabaseSchema {
  settings: SystemSettings;
  users: User[];
  guardians: Guardian[];
  students: Student[];
  products: Product[];
  stockMovements: StockMovement[];
  sales: Sale[];
  financialLedger: FinancialTransaction[];
  invoices: Invoice[];
  billingBatches?: BillingBatch[];
  receipts?: SalesReceipt[];
  pixPayments: PixPayment[];
  whatsappNotifications: WhatsAppNotification[];
  auditLogs: AuditLog[];
  passeios: Passeio[];
  tripOperations: TripOperation[];
  cashSessions?: CashRegisterSession[];
  cashMovements?: CashMovement[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'base44_db.json');

export class DatabaseService {
  private data: DatabaseSchema;
  private readonly dbFilePath: string;
  private readonly dataDir: string;
  private readonly disableDisk: boolean;
  private readonly disableSupabase: boolean;
  private saveQueued = false;
  private supabaseModPromise: Promise<typeof import('./supabase.ts')> | null = null;
  private pendingUpserts = new Map<string, Map<string, { record: any; mapperName: string }>>();
  private pendingDeletes = new Map<string, Set<string>>();
  private lastFlushErrors: Array<{ table: string; error: string }> = [];
  private activeFlushPromise: Promise<void> | null = null;
  private scheduledFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private hasHydratedFromSupabase = false;
  private lastHydratedAt = 0;
  private hydrationPromise: Promise<void> | null = null;

  constructor(options?: DatabaseServiceOptions) {
    this.dbFilePath = options?.dbFilePath || DB_FILE;
    this.dataDir = path.dirname(this.dbFilePath);
    this.disableDisk = Boolean(options?.disableDisk);
    this.disableSupabase = Boolean(options?.disableSupabase);
    this.data = this.loadDatabase();
    if (this.disableSupabase) {
      this.data.settings = { ...this.data.settings, supabaseActive: false };
    }
    this.ensureReceiptsForExistingSales();
  }

  public takeSnapshot(): DatabaseSchema {
    return deepCloneData(this.data);
  }

  public restoreSnapshot(snapshot: DatabaseSchema): void {
    this.data = deepCloneData(snapshot);
    this.writeDatabaseSync(this.data);
  }

  public getIntegritySnapshot(): IntegritySnapshot {
    return {
      sales: this.data.sales || [],
      receipts: this.data.receipts || [],
      products: this.data.products || [],
      students: this.data.students || [],
      stockMovements: this.data.stockMovements || [],
      financialLedger: this.data.financialLedger || [],
      invoices: this.data.invoices || [],
    };
  }

  public validateIntegrity(): IntegrityReport {
    return buildIntegrityReport(this.getIntegritySnapshot());
  }

  public reconcileOrphanSale(
    saleId: string,
    strategy: 'CANCEL_INVALID' | 'RECOVER_RECEIPT',
    user: { id: string; name: string; role: any }
  ): {
    sale: Sale;
    receipt?: SalesReceipt;
    student?: Student;
    auditLog: AuditLog;
  } {
    const rollbackSnapshot = this.takeSnapshot();
    const prevPendingUpserts = this.clonePendingUpserts();
    const prevPendingDeletes = this.clonePendingDeletes();

    try {
      const sale = this.data.sales.find(s => s.id === saleId);
      if (!sale) {
        throw new IntegrityError(`Venda ${saleId} não encontrada para correção.`);
      }

      const nowIso = new Date().toISOString();
      let createdReceipt: SalesReceipt | undefined;
      let auditDetails = '';

      if (strategy === 'CANCEL_INVALID') {
        sale.status = 'CANCELLED';
        sale.billingStatus = 'CANCELADA';
        sale.integrityReason = 'Venda órfã/inconsistente cancelada por ausência de recibo ativo correspondente.';
        sale.reversedReason = sale.integrityReason;
        sale.reversedByUserName = user.name;
        sale.reversedAt = nowIso;
        sale.receiptId = undefined;
        sale.receiptCode = undefined;

        for (const r of this.data.receipts || []) {
          if (r.saleId === sale.id && r.status === 'ATIVO') {
            r.status = 'CANCELADO';
            r.updatedAt = nowIso;
            this.triggerSupabaseSync('sales_receipts', r, 'mapReceiptToSupabase');
          }
        }

        auditDetails = `Venda inconsistente ${sale.id} (${sale.studentName} • R$ ${Number(sale.total).toFixed(2)}) cancelada (CANCELLED) pela rotina de integridade e excluída dos indicadores.`;
      } else {
        const existingActive = (this.data.receipts || []).find(
          r => r.saleId === sale.id && (r.status === 'ATIVO' || r.status === 'PARCIALMENTE_ESTORNADO')
        );
        if (existingActive) {
          createdReceipt = existingActive;
          sale.status = 'COMPLETED';
          sale.receiptId = existingActive.id;
          sale.receiptCode = existingActive.receiptCode;
          sale.integrityReason = undefined;
        } else {
          sale.status = 'COMPLETED';
          sale.integrityReason = undefined;
          const studentRef = this.data.students.find(s => s.id === sale.studentId);
          createdReceipt = this.createReceiptForSale(sale, studentRef, user, { skipSave: true });
        }

        const check = isSaleConsistent(sale, this.data.receipts || []);
        if (!check.valid) {
          throw new IntegrityError(`Falha ao validar recibo recuperado para ${sale.id}: ${check.reason}`);
        }
        auditDetails = `Venda ${sale.id} recuperada com emissão retroativa consistente do recibo ${createdReceipt.receiptCode}.`;
      }

      const student = this.data.students.find(s => s.id === sale.studentId);
      if (student) {
        this.recalculateStudentBalances(student);
        this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
      }

      const auditLog: AuditLog = {
        id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: nowIso,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'CORRECAO_VENDA_INCONSISTENTE',
        module: 'SISTEMA',
        referenceId: sale.id,
        details: auditDetails,
        status: 'SUCESSO',
      };
      this.data.auditLogs.unshift(auditLog);
      if (this.data.auditLogs.length > 500) {
        this.data.auditLogs = this.data.auditLogs.slice(0, 500);
      }

      this.writeDatabaseSync(this.data, true);
      this.triggerSupabaseSync('sales', sale, 'mapSaleToSupabase');
      if (createdReceipt) {
        this.triggerSupabaseSync('sales_receipts', createdReceipt, 'mapReceiptToSupabase');
      }
      this.triggerSupabaseSync('audit_logs', auditLog, 'mapAuditLogToSupabase');

      return { sale, receipt: createdReceipt, student, auditLog };
    } catch (err: any) {
      this.data = rollbackSnapshot;
      this.pendingUpserts = prevPendingUpserts;
      this.pendingDeletes = prevPendingDeletes;
      throw err instanceof Error ? err : new Error(String(err || 'Erro ao reconciliar venda inconsistente.'));
    }
  }

  public reconcileAllOrphanSales(
    strategy: 'CANCEL_INVALID' | 'RECOVER_RECEIPT',
    user: { id: string; name: string; role: any }
  ): { reconciledIds: string[] } {
    const inconsistent = getInconsistentSales(this.data.sales || [], this.data.receipts || []);
    const reconciledIds: string[] = [];
    for (const item of inconsistent) {
      this.reconcileOrphanSale(item.sale.id, strategy, user);
      reconciledIds.push(item.sale.id);
    }
    return { reconciledIds };
  }

  private clonePendingUpserts() {
    const cloned = new Map<string, Map<string, { record: any; mapperName: string }>>();
    for (const [table, map] of this.pendingUpserts.entries()) {
      const inner = new Map<string, { record: any; mapperName: string }>();
      for (const [key, val] of map.entries()) {
        inner.set(key, { record: deepCloneData(val.record), mapperName: val.mapperName });
      }
      cloned.set(table, inner);
    }
    return cloned;
  }

  private clonePendingDeletes() {
    const cloned = new Map<string, Set<string>>();
    for (const [table, set] of this.pendingDeletes.entries()) {
      cloned.set(table, new Set(set));
    }
    return cloned;
  }

  private normalizeCategory(cat?: string | null): ProductCategory {
    const raw = (cat || '').trim();
    const valid: ProductCategory[] = [
      'Livros e Literatura Cristã',
      'Alimentos e Snacks',
      'Produtos Naturais e Saúde',
      'Papelaria',
      'Higiene e Cuidados Pessoais',
      'Limpeza',
    ];
    if ((valid as string[]).includes(raw)) {
      return raw as ProductCategory;
    }
    const lower = raw.toLowerCase();
    if (lower.includes('livro') || lower.includes('literatura') || lower.includes('crist')) {
      return 'Livros e Literatura Cristã';
    }
    if (lower.includes('natural') || lower.includes('saúde') || lower.includes('saude')) {
      return 'Produtos Naturais e Saúde';
    }
    if (lower.includes('papel')) {
      return 'Papelaria';
    }
    if (lower.includes('higiene') || lower.includes('cosm') || lower.includes('pessoal') || lower.includes('pessoais')) {
      return 'Higiene e Cuidados Pessoais';
    }
    if (lower.includes('limpeza')) {
      return 'Limpeza';
    }
    return 'Alimentos e Snacks';
  }

  private parseNumericPrice(raw: any): number | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const str = String(raw).trim();
    if (!str) return null;
    let cleaned = str.replace(/[R$\s]/g, '');
    if (cleaned.includes(',') && cleaned.includes('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (cleaned.includes(',')) {
      cleaned = cleaned.replace(',', '.');
    }
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  private isPricePending(product?: { price?: number | null; priceStatus?: string } | null): boolean {
    if (!product) return true;
    const num = this.parseNumericPrice(product.price);
    if (num !== null && num > 0) return false;
    return true;
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (!this.disableDisk) {
        if (!fs.existsSync(this.dataDir)) {
          fs.mkdirSync(this.dataDir, { recursive: true });
        }

        if (fs.existsSync(this.dbFilePath)) {
          const raw = fs.readFileSync(this.dbFilePath, 'utf-8');
          const parsed = JSON.parse(raw);

        // Verificar se a base ainda contém os alunos fictícios antigos (ex: Lucas Andrade) e migrar para os 17 alunos da 10ª Turma
        const existingStudents: Student[] = Array.isArray(parsed.students) ? parsed.students : [];
        const hasOldFictionalStudents = existingStudents.some(s => s.name === 'Lucas Andrade' || s.name === 'Sofia Andrade');
        const hasAllDecimaTurma = initialStudents.every(seedSt =>
          existingStudents.some(s => s.name.toLowerCase() === seedSt.name.toLowerCase())
        );

        let finalStudents = existingStudents;
        let finalSales = parsed.sales || initialSales;
        let finalInvoices = parsed.invoices || initialInvoices;
        let finalLedger = parsed.financialLedger || initialFinancialLedger;
        let needsSave = false;

        if (hasOldFictionalStudents || !hasAllDecimaTurma) {
          finalStudents = initialStudents.map(seedSt => {
            const match = existingStudents.find(s => s.name.toLowerCase() === seedSt.name.toLowerCase());
            if (match) {
              return {
                ...seedSt,
                ...match,
                name: seedSt.name,
                registrationNumber: seedSt.registrationNumber,
                classGroup: '10ª Turma • Escola de Cristo (Formatura 27 a 30)',
                avatar: match.avatar || seedSt.avatar,
              };
            }
            return seedSt;
          });
          if (hasOldFictionalStudents) {
            finalSales = [];
            finalInvoices = [];
            finalLedger = [];
          }
          needsSave = true;
        }

        // Atualizar avatares SVG antigos que ainda tinham cores roxas/indigo para o degradê verde ICEVES
        finalStudents = finalStudents.map(st => {
          if (
            !st.avatar ||
            (st.avatar.startsWith('data:image/svg+xml') &&
              (st.avatar.includes('6366F1') || st.avatar.includes('8B5CF6') || st.avatar.includes('4F46E5') || st.avatar.includes('7C3AED')))
          ) {
            needsSave = true;
            return {
              ...st,
              avatar: getInitialsAvatar(st.name),
            };
          }
          return st;
        });

        const loadedSettings: SystemSettings = {
          ...initialSettings,
          ...(parsed.settings || {}),
          institutionName:
            !parsed.settings?.institutionName || parsed.settings.institutionName === 'Lojinha Iceves' || parsed.settings.institutionName.includes('Campus')
              ? 'Escola de Cristo - ICEVES'
              : parsed.settings.institutionName,
          storeName: parsed.settings?.storeName || 'Lojinha Iceves',
          tuitionBillingActive: false,
          defaultTuitionAmount: 0,
          receiptSettings: {
            ...initialSettings.receiptSettings!,
            ...(parsed.settings?.receiptSettings || {}),
          },
        };

        // Atualização Controlada do Catálogo Oficial (6 categorias e 70 produtos)
        let finalAuditLogs: AuditLog[] = Array.isArray(parsed.auditLogs)
          ? [...parsed.auditLogs]
          : [...initialAuditLogs];

        let finalProducts: Product[] = Array.isArray(parsed.products) ? parsed.products : [];
        let productsNeedsSave = false;

        if (parsed.settings?.catalogVersion !== CATALOG_VERSION) {
          // ETAPA 1 — Backup completo antes de qualquer alteração
          const backupsDir = path.join(DATA_DIR, 'backups');
          if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
          }
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = path.join(backupsDir, `base44_db.pre-catalog-${CATALOG_VERSION}-${stamp}.json`);
          fs.writeFileSync(backupPath, raw, 'utf-8');

          // Identificar produtos antigos com vínculo histórico (vendas, movimentações, faturas, passeios)
          const historicalProductIds = new Set<string>();
          for (const sale of Array.isArray(finalSales) ? finalSales : []) {
            for (const item of Array.isArray(sale.items) ? sale.items : []) {
              if (item?.productId) historicalProductIds.add(item.productId);
            }
          }
          const parsedMovements: StockMovement[] = Array.isArray(parsed.stockMovements) ? parsed.stockMovements : [];
          for (const mov of parsedMovements) {
            if (mov?.productId) historicalProductIds.add(mov.productId);
          }
          for (const inv of Array.isArray(finalInvoices) ? finalInvoices : []) {
            for (const item of Array.isArray(inv.items) ? inv.items : []) {
              if ((item as any)?.productId) historicalProductIds.add((item as any).productId);
            }
          }
          const parsedTrips: TripOperation[] = Array.isArray(parsed.tripOperations) ? parsed.tripOperations : [];
          for (const trip of parsedTrips) {
            for (const item of Array.isArray(trip.items) ? trip.items : []) {
              if (item?.storeProductId) historicalProductIds.add(item.storeProductId);
            }
          }

          const seedProductIds = new Set(initialProducts.map(p => p.id));
          const nowIso = new Date().toISOString();
          const archivedOldProducts: Product[] = [];
          const removedOldNames: string[] = [];
          const archivedOldNames: string[] = [];
          const oldCategoriesFound = new Set<string>();

          for (const oldProd of finalProducts) {
            if (oldProd?.category) oldCategoriesFound.add(String(oldProd.category));
            if (seedProductIds.has(oldProd.id)) continue;

            if (historicalProductIds.has(oldProd.id)) {
              archivedOldProducts.push({
                ...oldProd,
                status: 'INACTIVE',
                archived: true,
                archivedAt: nowIso,
                archivedReason: 'Substituído na atualização oficial do catálogo (preservado para histórico)',
                updatedAt: nowIso,
              });
              archivedOldNames.push(`${oldProd.name} (${oldProd.id})`);
            } else {
              removedOldNames.push(`${oldProd.name} (${oldProd.id})`);
            }
          }

          const freshCatalogProducts: Product[] = initialProducts.map(p => ({
            ...p,
            images: Array.isArray(p.images) ? p.images.filter(Boolean).slice(0, 3) : (p.imageUrl ? [p.imageUrl] : []),
            imageUrl: p.imageUrl || (Array.isArray(p.images) ? p.images[0] : undefined),
          }));

          finalProducts = [...freshCatalogProducts, ...archivedOldProducts];
          loadedSettings.catalogVersion = CATALOG_VERSION;

          finalAuditLogs.unshift({
            id: `AUD-${Date.now()}-CATALOG`,
            timestamp: nowIso,
            userId: 'system',
            userName: 'Sistema (Migração Controlada)',
            userRole: 'ADMIN',
            action: 'ATUALIZACAO_CATALOGO_ESTOQUE',
            module: 'ESTOQUE',
            details: `Catálogo atualizado (${CATALOG_VERSION}). Backup: ${path.basename(backupPath)}. Removidos sem histórico: ${removedOldNames.length}. Arquivados com histórico: ${archivedOldNames.length} [${archivedOldNames.join(', ')}]. Categorias anteriores: [${Array.from(oldCategoriesFound).join(', ')}]. Cadastrados: ${freshCatalogProducts.length} produtos em 6 categorias oficiais.`,
            status: 'SUCESSO'
          });

          productsNeedsSave = true;
        } else {
          // Normalizar estrutura de imagens, preços pendentes e unicidade sem perder arquivados
          const seedById = new Map(initialProducts.map(sp => [sp.id, sp]));
          const seenProductIds = new Set<string>();
          const uniqueProducts: Product[] = [];
          for (const p of finalProducts) {
            let images: string[] = Array.isArray(p.images) && p.images.length > 0
              ? p.images.filter(Boolean).slice(0, 3)
              : (p.imageUrl ? [p.imageUrl] : []);

            let resolvedImageUrl = images[0] || p.imageUrl || undefined;
            if (!p.archived && images.length === 0 && !resolvedImageUrl) {
              const seedMatch = seedById.get(p.id);
              if (seedMatch && (seedMatch.imageUrl || (seedMatch.images && seedMatch.images.length > 0))) {
                images = seedMatch.images && seedMatch.images.length > 0
                  ? [...seedMatch.images]
                  : [seedMatch.imageUrl!];
                resolvedImageUrl = images[0];
                productsNeedsSave = true;
              }
            }

            const parsedPrice = this.parseNumericPrice(p.price);
            const isPending = parsedPrice === null || parsedPrice <= 0;
            if (!isPending && p.priceStatus === 'PENDING') {
              productsNeedsSave = true;
            }
            const normalizedCategory = p.archived
              ? p.category
              : this.normalizeCategory(p.category);

            if (!p.archived && p.category !== normalizedCategory) {
              productsNeedsSave = true;
            }

            let productId = p.id;
            if (seenProductIds.has(productId)) {
              let counter = 1;
              while (seenProductIds.has(`${productId}-alt-${counter}`)) {
                counter++;
              }
              productId = `${productId}-alt-${counter}`;
              productsNeedsSave = true;
            }
            seenProductIds.add(productId);

            uniqueProducts.push({
              ...p,
              id: productId,
              category: normalizedCategory,
              price: isPending ? null : Math.round(parsedPrice * 100) / 100,
              priceStatus: isPending ? 'PENDING' : 'DEFINED',
              images,
              imageUrl: resolvedImageUrl,
            });
          }
          finalProducts = uniqueProducts;
        }

        if (productsNeedsSave) {
          needsSave = true;
        }

        let finalPasseios: Passeio[] = Array.isArray(parsed.passeios)
          ? parsed.passeios
          : initialPasseios;
        if (!Array.isArray(parsed.passeios)) {
          needsSave = true;
        }

        const finalTripOperations: TripOperation[] = Array.isArray(parsed.tripOperations)
          ? parsed.tripOperations
          : [];

        if (!loadedSettings.pdvPasseiosPermissions) {
          loadedSettings.pdvPasseiosPermissions = {
            cashierCanViewPasseios: false,
            cashierCanCreatePasseios: false,
            cashierCanAddExpenses: false,
            cashierCanSelectStudents: false,
            cashierCanConfirmLaunches: false,
            cashierCanViewHistory: false,
            cashierCanReverseLaunches: false,
          };
        }

        // Sincronizar os Pais e Responsáveis oficiais (17 estudantes — 8 alunas e 9 meninos, 16 responsáveis únicos com Bill Stanley vinculado a 2 alunos) sem duplicar cadastros e preservando todos os dados existentes dos estudantes
        let finalGuardians: Guardian[] = Array.isArray(parsed.guardians)
          ? parsed.guardians.filter((g: Guardian) => g.id !== 'guardian-1' && g.name !== 'Responsável / Família ICEVES')
          : [...initialGuardians];

        const normalizeText = (val: string) =>
          (val || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

        // Mapear todos os alunos esperados para cada responsável oficial (ex: Bill Stanley -> ['student-1', 'student-9'])
        const expectedStudentIdsByGuardian = new Map<string, string[]>();
        for (const assign of OFFICIAL_GUARDIAN_ASSIGNMENTS) {
          const list = expectedStudentIdsByGuardian.get(assign.guardianId) || [];
          if (!list.includes(assign.studentId)) {
            list.push(assign.studentId);
          }
          expectedStudentIdsByGuardian.set(assign.guardianId, list);
        }

        for (const assign of OFFICIAL_GUARDIAN_ASSIGNMENTS) {
          const targetStudent = finalStudents.find(
            s =>
              s.id === assign.studentId ||
              normalizeText(s.name) === normalizeText(assign.studentDatabaseName) ||
              normalizeText(s.name) === normalizeText(assign.informedStudentName)
          );

          if (!targetStudent) continue;

          // Verificar se o responsável já existe (por ID ou nome normalizado) para evitar duplicação
          let guardianRecord = finalGuardians.find(
            g => g.id === assign.guardianId || normalizeText(g.name) === normalizeText(assign.guardianName)
          );

          const slugEmail =
            assign.guardianName
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, '')
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .join('.') + '@gmail.com';

          const expectedStudentIds = expectedStudentIdsByGuardian.get(assign.guardianId) || [targetStudent.id];

          if (!guardianRecord) {
            guardianRecord = {
              id: assign.guardianId,
              name: assign.guardianName,
              cpf: 'Não informado',
              email: slugEmail,
              phone: assign.guardianPhone,
              relationshipDefault: assign.relationship || 'Responsável',
              studentIds: [...expectedStudentIds],
              needsPhoneReview: assign.needsPhoneReview,
              phoneReviewNote: assign.phoneReviewNote,
              createdAt: '2026-11-01T08:00:00Z'
            };
            finalGuardians.push(guardianRecord);
            needsSave = true;
          } else {
            const mergedStudentIds = Array.from(new Set([...expectedStudentIds, ...guardianRecord.studentIds.filter(id => expectedStudentIds.includes(id) || id === targetStudent.id)]));
            const idsChanged =
              mergedStudentIds.length !== guardianRecord.studentIds.length ||
              mergedStudentIds.some((id, idx) => guardianRecord!.studentIds[idx] !== id);

            if (
              guardianRecord.id !== assign.guardianId ||
              guardianRecord.phone !== assign.guardianPhone ||
              guardianRecord.relationshipDefault !== (assign.relationship || 'Responsável') ||
              idsChanged ||
              guardianRecord.needsPhoneReview !== assign.needsPhoneReview
            ) {
              guardianRecord.id = assign.guardianId;
              guardianRecord.phone = assign.guardianPhone;
              guardianRecord.relationshipDefault = assign.relationship || 'Responsável';
              guardianRecord.studentIds = mergedStudentIds;
              guardianRecord.needsPhoneReview = assign.needsPhoneReview;
              guardianRecord.phoneReviewNote = assign.phoneReviewNote;
              needsSave = true;
            }
          }

          // Vincular ao estudante correspondente sem apagar outros dados do estudante
          if (!Array.isArray(targetStudent.guardians)) {
            targetStudent.guardians = [];
          }
          const existingLinkIdx = targetStudent.guardians.findIndex(
            lk => lk.guardianId === guardianRecord!.id || normalizeText(lk.guardianName || '') === normalizeText(assign.guardianName)
          );
          const linkObj = {
            guardianId: guardianRecord.id,
            guardianName: guardianRecord.name,
            guardianPhone: guardianRecord.phone,
            relationship: assign.relationship || 'Responsável',
            isPrimaryPayer: true,
            canAccessPortal: true,
            needsPhoneReview: assign.needsPhoneReview,
            phoneReviewNote: assign.phoneReviewNote,
            matchNote: assign.matchNote
          };

          if (existingLinkIdx === -1) {
            targetStudent.guardians = [linkObj];
            needsSave = true;
          } else {
            const curr = targetStudent.guardians[existingLinkIdx];
            if (
              curr.guardianId !== linkObj.guardianId ||
              curr.guardianName !== linkObj.guardianName ||
              curr.guardianPhone !== linkObj.guardianPhone ||
              curr.relationship !== linkObj.relationship ||
              curr.needsPhoneReview !== linkObj.needsPhoneReview ||
              curr.matchNote !== linkObj.matchNote
            ) {
              targetStudent.guardians[existingLinkIdx] = linkObj;
              needsSave = true;
            }
          }
        }

        // Garantir desduplicação absoluta de finalGuardians por nome normalizado
        const uniqueGuardiansMap = new Map<string, Guardian>();
        for (const g of finalGuardians) {
          const key = normalizeText(g.name);
          const existing = uniqueGuardiansMap.get(key);
          if (!existing) {
            uniqueGuardiansMap.set(key, g);
          } else {
            existing.studentIds = Array.from(new Set([...existing.studentIds, ...g.studentIds]));
            needsSave = true;
          }
        }
        finalGuardians = Array.from(uniqueGuardiansMap.values());

        const loadedData: DatabaseSchema = {
          settings: loadedSettings,
          users: hasOldFictionalStudents ? initialUsers : (parsed.users || initialUsers),
          guardians: finalGuardians,
          students: finalStudents,
          products: finalProducts,
          stockMovements: parsed.stockMovements || initialStockMovements,
          sales: finalSales,
          financialLedger: finalLedger,
          invoices: finalInvoices,
          billingBatches: Array.isArray(parsed.billingBatches) ? parsed.billingBatches : [],
          receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [],
          pixPayments: parsed.pixPayments || initialPixPayments,
          whatsappNotifications: parsed.whatsappNotifications || initialWhatsAppNotifications,
          auditLogs: finalAuditLogs,
          passeios: finalPasseios,
          tripOperations: finalTripOperations,
          cashSessions: Array.isArray(parsed.cashSessions) ? parsed.cashSessions : [],
          cashMovements: Array.isArray(parsed.cashMovements) ? parsed.cashMovements : [],
        };

        if (needsSave) {
          this.saveDatabase(loadedData, true);
        }

        return loadedData;
        }
      }
    } catch (err) {
      console.error('Erro ao ler base de dados JSON, iniciando com dados semente:', err);
    }

    const defaultData: DatabaseSchema = {
      settings: deepCloneData(initialSettings),
      users: deepCloneData(initialUsers),
      guardians: deepCloneData(initialGuardians),
      students: deepCloneData(initialStudents),
      products: deepCloneData(initialProducts),
      stockMovements: deepCloneData(initialStockMovements),
      sales: deepCloneData(initialSales),
      financialLedger: deepCloneData(initialFinancialLedger),
      invoices: deepCloneData(initialInvoices),
      billingBatches: [],
      receipts: [],
      pixPayments: deepCloneData(initialPixPayments),
      whatsappNotifications: deepCloneData(initialWhatsAppNotifications),
      auditLogs: deepCloneData(initialAuditLogs),
      passeios: deepCloneData(initialPasseios),
      tripOperations: [],
      cashSessions: [],
      cashMovements: [],
    };

    this.saveDatabase(defaultData, true);
    return defaultData;
  }

  private writeDatabaseSync(dataToSave: DatabaseSchema, strict = false) {
    if (this.disableDisk) return;
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      // Atomic write via temp file
      const tempPath = `${this.dbFilePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.dbFilePath);
    } catch (err: any) {
      const code = err?.code;
      const isReadOnlyServerless = process.env.VERCEL === '1' && (code === 'EROFS' || code === 'EACCES' || code === 'ENOENT');
      if (strict && !isReadOnlyServerless) {
        throw new Error(`Falha ao gravar base de dados local: ${err?.message || 'erro de disco'}`);
      }
      if (!isReadOnlyServerless) {
        console.error('Falha ao persistir base de dados:', err);
      }
    }
  }

  private saveDatabase(dataToSave?: DatabaseSchema, immediate = false) {
    if (this.disableDisk) return;
    if (immediate || dataToSave) {
      this.writeDatabaseSync(dataToSave || this.data);
      return;
    }
    if (!this.saveQueued) {
      this.saveQueued = true;
      queueMicrotask(() => {
        this.saveQueued = false;
        this.writeDatabaseSync(this.data);
      });
    }
  }

  // Helper de auditoria
  public logAudit(
    userId: string, 
    userName: string, 
    userRole: any, 
    action: string, 
    module: any, 
    details: string, 
    status: 'SUCESSO' | 'FALHA' = 'SUCESSO',
    referenceId?: string
  ): AuditLog {
    const log: AuditLog = {
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      userId,
      userName,
      userRole,
      action,
      module,
      referenceId,
      details,
      status
    };
    this.data.auditLogs.unshift(log);
    // Keep max 500 audit logs
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.saveDatabase();
    this.triggerSupabaseSync('audit_logs', log, 'mapAuditLogToSupabase');
    return log;
  }

  private static readonly SUPABASE_UPSERT_TIERS: string[][] = [
    ['settings', 'users', 'guardians', 'passeios'],
    ['products', 'students', 'cash_registers', 'billing_batches', 'trip_operations'],
    ['sales', 'invoices', 'stock_movements', 'cash_movements', 'customer_account_movements'],
    ['sales_receipts', 'pix_payments', 'whatsapp_notifications', 'audit_logs'],
  ];

  private scheduleAutoFlush() {
    if (this.scheduledFlushTimer) return;
    this.scheduledFlushTimer = setTimeout(() => {
      this.scheduledFlushTimer = null;
      void this.flushSupabaseSync(12000);
    }, 35);
    if (typeof (this.scheduledFlushTimer as any)?.unref === 'function') {
      (this.scheduledFlushTimer as any).unref();
    }
  }

  public markHydrated() {
    this.hasHydratedFromSupabase = true;
    this.lastHydratedAt = Date.now();
  }

  public async ensureHydratedFromSupabase(opts?: { force?: boolean; maxAgeMs?: number }): Promise<void> {
    if (this.disableSupabase) return;
    const settings = this.data?.settings;
    if (settings && settings.supabaseActive === false) {
      return;
    }

    // Se houver escritas locais pendentes, envie-as primeiro antes de puxar do Supabase
    if (this.pendingUpserts.size > 0 || this.pendingDeletes.size > 0) {
      await this.flushSupabaseSync(10000);
    }

    const defaultTtl = process.env.VERCEL === '1' ? 8000 : 30000;
    const ttlMs = opts?.maxAgeMs ?? defaultTtl;
    const isFresh = this.hasHydratedFromSupabase && !opts?.force && Date.now() - this.lastHydratedAt < ttlMs;
    if (isFresh) {
      return;
    }

    if (this.hydrationPromise) {
      return this.hydrationPromise;
    }

    this.hydrationPromise = (async () => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        if (!this.supabaseModPromise) {
          this.supabaseModPromise = import('./supabase.ts');
        }
        const supabaseMod = await this.supabaseModPromise;
        await Promise.race([
          supabaseMod.syncFromSupabase(this),
          new Promise<void>(resolve => {
            timer = setTimeout(resolve, 8000);
          }),
        ]);
        this.hasHydratedFromSupabase = true;
        this.lastHydratedAt = Date.now();
      } catch (e: any) {
        console.warn('[Supabase Hydration] Aviso ao hidratar dados iniciais:', e?.message || e);
      } finally {
        if (timer) clearTimeout(timer);
        this.hydrationPromise = null;
      }
    })();

    return this.hydrationPromise;
  }

  public triggerSupabaseSync(table: string, record: any, mapperName: string) {
    if (this.disableSupabase || !record) return;
    if (this.data?.settings?.supabaseActive === false) return;
    const key = String(record.id || '__singleton__');
    let tableMap = this.pendingUpserts.get(table);
    if (!tableMap) {
      tableMap = new Map();
      this.pendingUpserts.set(table, tableMap);
    }
    tableMap.set(key, { record: { ...record }, mapperName });
    const delSet = this.pendingDeletes.get(table);
    if (delSet) {
      delSet.delete(key);
      if (delSet.size === 0) this.pendingDeletes.delete(table);
    }
    this.scheduleAutoFlush();
  }

  public triggerSupabaseDelete(table: string, id: string) {
    if (this.disableSupabase || !id) return;
    if (this.data?.settings?.supabaseActive === false) return;
    const tableMap = this.pendingUpserts.get(table);
    if (tableMap) {
      tableMap.delete(id);
      if (tableMap.size === 0) this.pendingUpserts.delete(table);
    }
    let delSet = this.pendingDeletes.get(table);
    if (!delSet) {
      delSet = new Set();
      this.pendingDeletes.set(table, delSet);
    }
    delSet.add(id);
    this.scheduleAutoFlush();
  }

  private async drainSupabaseQueue(): Promise<void> {
    if (this.disableSupabase || this.data?.settings?.supabaseActive === false) {
      this.pendingUpserts.clear();
      this.pendingDeletes.clear();
      return;
    }

    if (!this.supabaseModPromise) {
      this.supabaseModPromise = import('./supabase.ts');
    }
    const supabaseMod = await this.supabaseModPromise;
    const batchErrors: Array<{ table: string; error: string }> = [];

    while (this.pendingUpserts.size > 0 || this.pendingDeletes.size > 0) {
      // Snapshot & clear queues so new mutations arriving mid-flush are captured for the next pass
      const upsertsSnapshot = new Map(this.pendingUpserts);
      this.pendingUpserts.clear();
      const deletesSnapshot = new Map(this.pendingDeletes);
      this.pendingDeletes.clear();

      // 1. Upserts em lotes por tabela respeitando rigorosamente a ordem de Foreign Keys (pais -> filhos)
      const handledTables = new Set<string>();
      for (const tier of DatabaseService.SUPABASE_UPSERT_TIERS) {
        const tierTasks: Promise<any>[] = [];
        for (const table of tier) {
          handledTables.add(table);
          const entries = upsertsSnapshot.get(table);
          if (!entries || entries.size === 0) continue;
          const items = Array.from(entries.values());
          const mapperName = items[0].mapperName;
          const mapper = (supabaseMod as any)[mapperName];
          const records = items.map(i => i.record);
          tierTasks.push(
            supabaseMod.syncBatchToSupabase(table, records, mapper)
              .then((ok: boolean) => {
                if (!ok) {
                  batchErrors.push({ table, error: `Falha ao sincronizar tabela "${table}" no Supabase.` });
                }
              })
              .catch((e: any) => {
                const msg = e?.message || String(e);
                batchErrors.push({ table, error: msg });
                console.warn(`[Supabase Auto-Sync] Falha ao sincronizar lote em ${table}:`, msg);
              })
          );
        }
        if (tierTasks.length > 0) {
          await Promise.allSettled(tierTasks);
        }
      }

      // Quaisquer tabelas extras fora da lista explícita
      const extraTasks: Promise<any>[] = [];
      for (const [table, entries] of upsertsSnapshot.entries()) {
        if (handledTables.has(table) || entries.size === 0) continue;
        const items = Array.from(entries.values());
        const mapper = (supabaseMod as any)[items[0].mapperName];
        extraTasks.push(
          supabaseMod.syncBatchToSupabase(table, items.map(i => i.record), mapper)
            .then((ok: boolean) => {
              if (!ok) {
                batchErrors.push({ table, error: `Falha ao sincronizar tabela "${table}" no Supabase.` });
              }
            })
            .catch((e: any) => {
              const msg = e?.message || String(e);
              batchErrors.push({ table, error: msg });
              console.warn(`[Supabase Auto-Sync] Falha ao sincronizar lote em ${table}:`, msg);
            })
        );
      }
      if (extraTasks.length > 0) {
        await Promise.allSettled(extraTasks);
      }

      // 2. Exclusões em ordem inversa de Foreign Keys (filhos -> pais)
      const reversedTiers = [...DatabaseService.SUPABASE_UPSERT_TIERS].reverse();
      const handledDeletes = new Set<string>();
      for (const tier of reversedTiers) {
        const delTasks: Promise<any>[] = [];
        for (const table of tier) {
          handledDeletes.add(table);
          const ids = deletesSnapshot.get(table);
          if (!ids || ids.size === 0) continue;
          delTasks.push(
            supabaseMod.deleteBatchFromSupabase(table, Array.from(ids)).catch((e: any) => {
              const msg = e?.message || String(e);
              batchErrors.push({ table, error: msg });
              console.warn(`[Supabase Auto-Sync] Falha ao excluir lote em ${table}:`, msg);
            })
          );
        }
        if (delTasks.length > 0) {
          await Promise.allSettled(delTasks);
        }
      }
      for (const [table, ids] of deletesSnapshot.entries()) {
        if (handledDeletes.has(table) || ids.size === 0) continue;
        await supabaseMod.deleteBatchFromSupabase(table, Array.from(ids)).catch(() => {});
      }
    }

    this.lastFlushErrors = batchErrors;

    if (this.hasHydratedFromSupabase) {
      this.lastHydratedAt = Date.now();
    }
  }

  public async flushSupabaseSync(timeoutMs = 12000): Promise<void> {
    if (this.disableSupabase || this.data?.settings?.supabaseActive === false) {
      this.pendingUpserts.clear();
      this.pendingDeletes.clear();
      this.lastFlushErrors = [];
      return;
    }

    if (this.scheduledFlushTimer) {
      clearTimeout(this.scheduledFlushTimer);
      this.scheduledFlushTimer = null;
    }
    if (this.pendingUpserts.size === 0 && this.pendingDeletes.size === 0 && !this.activeFlushPromise) {
      return;
    }

    const runDrain = () => {
      if (!this.activeFlushPromise) {
        this.activeFlushPromise = this.drainSupabaseQueue().finally(() => {
          this.activeFlushPromise = null;
        });
      }
      return this.activeFlushPromise;
    };

    const deadline = Date.now() + timeoutMs;
    while (this.pendingUpserts.size > 0 || this.pendingDeletes.size > 0 || this.activeFlushPromise) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      let timer: ReturnType<typeof setTimeout> | null = null;
      try {
        await Promise.race([
          runDrain(),
          new Promise<void>(resolve => {
            timer = setTimeout(resolve, remaining);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (Date.now() >= deadline) break;
    }
  }

  public async flushSupabaseSyncStrict(
    timeoutMs = 12000,
    criticalTables: string[] = ['sales', 'sales_receipts', 'products', 'students']
  ): Promise<{ ok: boolean; failedTables: string[]; errors: string[]; timedOut: boolean }> {
    if (this.disableSupabase || this.data?.settings?.supabaseActive === false) {
      return { ok: true, failedTables: [], errors: [], timedOut: false };
    }
    this.lastFlushErrors = [];
    await this.flushSupabaseSync(timeoutMs);
    const timedOut = this.pendingUpserts.size > 0 || this.pendingDeletes.size > 0;
    const failedCritical = this.lastFlushErrors.filter(e => criticalTables.includes(e.table));
    const failedTables = Array.from(new Set(failedCritical.map(e => e.table)));
    const errors = failedCritical.map(e => e.error);
    if (timedOut) {
      errors.push('Tempo limite excedido ao confirmar persistência no servidor remoto.');
    }
    return {
      ok: failedTables.length === 0 && !timedOut,
      failedTables,
      errors,
      timedOut,
    };
  }

  // --- GETTERS ---
  public getSettings(): SystemSettings {
    return this.data.settings;
  }

  public getUsers(): User[] {
    return this.data.users;
  }

  public resolveUserById(userId: string): User | undefined {
    if (!userId) return undefined;
    const found = this.data.users.find(u => u.id === userId);
    if (found) {
      if (found.role === 'STUDENT' && !found.studentId) {
        const matchedStudent = this.data.students.find(
          s =>
            s.email.toLowerCase() === found.email.toLowerCase() ||
            s.name.toLowerCase() === found.name.toLowerCase()
        );
        if (matchedStudent) {
          found.studentId = matchedStudent.id;
          found.registrationNumber = matchedStudent.registrationNumber;
        }
      }
      return found;
    }

    if (userId.startsWith('user-student-') || userId.startsWith('student-')) {
      const rawStudentId = userId.replace(/^user-/, '');
      const student = this.data.students.find(s => s.id === rawStudentId);
      if (student) {
        return {
          id: `user-${student.id}`,
          name: student.name,
          email: student.email,
          role: 'STUDENT',
          studentId: student.id,
          registrationNumber: student.registrationNumber,
          avatar: student.avatar,
          createdAt: student.createdAt || new Date().toISOString()
        };
      }
    }

    return undefined;
  }

  public getStudents(): Student[] {
    return this.data.students;
  }

  public getGuardians(): Guardian[] {
    return this.data.guardians;
  }

  public getProducts(): Product[] {
    return this.data.products;
  }

  public getSales(): Sale[] {
    return this.data.sales;
  }

  public getStockMovements(): StockMovement[] {
    return this.data.stockMovements;
  }

  public getInvoices(): Invoice[] {
    return this.data.invoices;
  }

  public getBillingBatches(): BillingBatch[] {
    if (!Array.isArray(this.data.billingBatches)) {
      this.data.billingBatches = [];
    }
    return this.data.billingBatches;
  }

  public getReceipts(): SalesReceipt[] {
    if (!Array.isArray(this.data.receipts)) {
      this.data.receipts = [];
    }
    return this.data.receipts;
  }

  public getReceiptById(receiptId: string): SalesReceipt | undefined {
    return this.getReceipts().find(r => r.id === receiptId || r.receiptCode === receiptId);
  }

  public getReceiptBySaleId(saleId: string): SalesReceipt | undefined {
    return this.getReceipts().find(r => r.saleId === saleId);
  }

  public getPixPayments(): PixPayment[] {
    return this.data.pixPayments;
  }

  public getWhatsAppNotifications(): WhatsAppNotification[] {
    return this.data.whatsappNotifications;
  }

  public getAuditLogs(): AuditLog[] {
    return this.data.auditLogs;
  }

  public getFinancialLedger(): FinancialTransaction[] {
    return this.data.financialLedger;
  }

  public getPasseios(): Passeio[] {
    if (!Array.isArray(this.data.passeios)) {
      this.data.passeios = [...initialPasseios];
    }
    return this.data.passeios;
  }

  public getTripOperations(): TripOperation[] {
    if (!Array.isArray(this.data.tripOperations)) {
      this.data.tripOperations = [];
    }
    return this.data.tripOperations;
  }

  // --- REGRAS DE NEGÓCIO ---

  // 1. Atualizar configurações
  public updateSettings(newSettings: Partial<SystemSettings>, user: { id: string; name: string; role: any }) {
    const mergedReceiptSettings: ReceiptSettings | undefined =
      newSettings.receiptSettings || this.data.settings.receiptSettings
        ? {
            ...(initialSettings.receiptSettings as ReceiptSettings),
            ...(this.data.settings.receiptSettings || {}),
            ...(newSettings.receiptSettings || {}),
          }
        : undefined;

    this.data.settings = {
      ...this.data.settings,
      ...newSettings,
      receiptSettings: mergedReceiptSettings,
      updatedAt: new Date().toISOString(),
      updatedByUserName: user.name
    };
    this.logAudit(user.id, user.name, user.role, 'ATUALIZAR_CONFIGURACOES', 'CONFIGURACOES', 'Parâmetros de fechamento e sistema atualizados');
    this.saveDatabase();
    this.triggerSupabaseSync('settings', this.data.settings, 'mapSettingsToSupabase');
    return this.data.settings;
  }

  // 2. Operação Atômica e Idempotente de Venda no PDV (Caixa Rápido)
  public registerSale(params: {
    studentId: string;
    items: { productId: string; quantity: number; discountAmount?: number }[];
    operatorUser: { id: string; name: string; role: any };
    idempotencyKey?: string;
    paymentMethod?: PaymentMethod;
    payments?: SalePaymentEntry[];
    amountPaid?: number;
    creditUsed?: number;
    terminalId?: string;
    discountAmount?: number;
    notes?: string;
    __testFaultStage?: SaleFaultInjectionStage;
  }): {
    sale: Sale;
    student: Student;
    receipt: SalesReceipt;
    updatedProducts: Product[];
    stockMovements: StockMovement[];
    ledgerEntries: FinancialTransaction[];
    auditLog?: AuditLog;
    idempotentReplay?: boolean;
  } {
    const {
      studentId,
      items,
      operatorUser,
      idempotencyKey,
      paymentMethod = 'CONTA_ALUNO',
      payments,
      amountPaid,
      creditUsed = 0,
      terminalId,
      discountAmount = 0,
      notes,
      __testFaultStage,
    } = params;

    // 1. Verificação de idempotência ANTES de qualquer mutação
    const trimmedIdempotencyKey = (idempotencyKey || '').trim();
    if (trimmedIdempotencyKey) {
      const existingSale = this.data.sales.find(s => s.idempotencyKey === trimmedIdempotencyKey);
      if (existingSale) {
        const existingStudent = this.data.students.find(s => s.id === existingSale.studentId);
        const existingReceipt = this.getReceiptBySaleId(existingSale.id);
        if (!existingStudent || !existingReceipt) {
          throw new Error(
            `Registro inconsistente encontrado para a chave de idempotência "${trimmedIdempotencyKey}". Solicite auditoria antes de tentar novamente.`
          );
        }
        const existingProducts = existingSale.items
          .map(it => this.data.products.find(p => p.id === it.productId))
          .filter(Boolean) as Product[];
        const existingMovements = this.data.stockMovements.filter(
          m => m.saleId === existingSale.id || m.referenceId === existingSale.id
        );
        const existingLedger = this.data.financialLedger.filter(
          l => l.saleId === existingSale.id || l.documentRef === existingSale.id
        );
        return {
          sale: existingSale,
          student: existingStudent,
          receipt: existingReceipt,
          updatedProducts: existingProducts,
          stockMovements: existingMovements,
          ledgerEntries: existingLedger,
          idempotentReplay: true,
        };
      }
    }

    // 2. Regras rígidas de pré-validação (antes de abrir a transação)
    if (!studentId || typeof studentId !== 'string') {
      throw new Error('Selecione um aluno válido antes de confirmar a venda.');
    }

    const student = this.data.students.find(s => s.id === studentId);
    if (!student) {
      throw new Error(`Aluno com ID ${studentId} não encontrado.`);
    }

    if (student.status !== 'ACTIVE') {
      throw new Error(`O aluno ${student.name} está inativo e não pode realizar compras.`);
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('O carrinho está vazio. Adicione pelo menos 1 item antes de confirmar a venda.');
    }

    if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
      throw new Error(`Forma de pagamento inválida: "${String(paymentMethod)}".`);
    }

    const hasExplicitPayments = Array.isArray(payments) && payments.length > 0;
    const effectiveMethods: SalePaymentEntry[] = hasExplicitPayments
      ? payments.map(p => {
          if (!VALID_PAYMENT_METHODS.has(p.method)) {
            throw new Error(`Forma de pagamento inválida: "${String(p.method)}".`);
          }
          return {
            method: p.method,
            amount: Math.round((Number(p.amount) || 0) * 100) / 100,
            transactionId: p.transactionId,
            confirmedAt: p.confirmedAt,
          };
        })
      : [];

    const usesAccountPayment = hasExplicitPayments
      ? effectiveMethods.some(p => p.method === 'CONTA_ALUNO')
      : paymentMethod === 'CONTA_ALUNO';

    if (usesAccountPayment && student.consumptionBlocked) {
      throw new Error(
        `Consumo temporariamente bloqueado para ${student.name}${student.consumptionBlockedReason ? `: ${student.consumptionBlockedReason}` : '.'}`
      );
    }

    // Conferência rigorosa de identificadores, preço, status e estoque
    const aggregatedQuantities = new Map<string, { quantity: number; discountAmount: number }>();
    for (const item of items) {
      if (!item || !item.productId || typeof item.productId !== 'string') {
        throw new Error('Identificador de produto inválido no carrinho.');
      }
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error('Quantidade inválida no carrinho. Todos os itens devem ter quantidade maior que zero.');
      }
      const prev = aggregatedQuantities.get(item.productId) || { quantity: 0, discountAmount: 0 };
      aggregatedQuantities.set(item.productId, {
        quantity: prev.quantity + item.quantity,
        discountAmount: Math.round((prev.discountAmount + Math.max(0, Number(item.discountAmount) || 0)) * 100) / 100,
      });
    }

    const saleItems: Sale['items'] = [];
    let subtotalBeforeDiscount = 0;
    let itemLevelDiscountTotal = 0;

    for (const [productId, agg] of aggregatedQuantities.entries()) {
      const totalQty = agg.quantity;
      const product = this.data.products.find(p => p.id === productId);
      if (!product) {
        throw new Error(`Produto com identificador "${productId}" não encontrado.`);
      }

      if (product.archived || product.status !== 'ACTIVE') {
        throw new Error(`O produto "${product.name}" está inativo/arquivado e não pode ser vendido.`);
      }

      if (this.isPricePending(product)) {
        throw new Error('Este produto não possui preço definido e não pode ser vendido.');
      }

      if (this.data.settings.blockSaleWithoutStock !== false && product.currentStock < totalQty) {
        throw new Error(
          `Estoque insuficiente para o produto "${product.name}". Disponível: ${product.currentStock}. Solicitado: ${totalQty}.`
        );
      }

      const unitPrice = Number(product.price);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        throw new Error('Este produto não possui preço definido e não pode ser vendido.');
      }

      const rawSubtotal = Math.round((unitPrice * totalQty) * 100) / 100;
      const itemDisc = Math.min(rawSubtotal, agg.discountAmount);
      if (itemDisc > 0 && operatorUser.role !== 'ADMIN' && operatorUser.role !== 'MANAGER') {
        throw new Error('Descontos exigem autorização de Administrador ou Gerente.');
      }
      const subtotal = Math.max(0, Math.round((rawSubtotal - itemDisc) * 100) / 100);
      subtotalBeforeDiscount += rawSubtotal;
      itemLevelDiscountTotal = Math.round((itemLevelDiscountTotal + itemDisc) * 100) / 100;

      saleItems.push({
        productId: product.id,
        internalCode: product.internalCode,
        barcode: product.barcode,
        name: product.name,
        category: product.category,
        unit: product.unit || 'un',
        unitPrice, // PRESERVA PREÇO HISTÓRICO
        quantity: totalQty,
        discountAmount: itemDisc > 0 ? itemDisc : undefined,
        subtotal,
      });
    }

    subtotalBeforeDiscount = Math.round(subtotalBeforeDiscount * 100) / 100;
    const orderDiscount = Math.max(0, Math.round((Number(discountAmount) || 0) * 100) / 100);
    const cleanDiscount = Math.round((itemLevelDiscountTotal + orderDiscount) * 100) / 100;
    if (cleanDiscount > 0) {
      if (operatorUser.role !== 'ADMIN' && operatorUser.role !== 'MANAGER') {
        throw new Error('Descontos exigem autorização de Administrador ou Gerente.');
      }
      if (cleanDiscount > subtotalBeforeDiscount) {
        throw new Error('O desconto não pode ser maior que o subtotal da venda.');
      }
    }

    const totalAfterDiscount = Math.max(0, Math.round((subtotalBeforeDiscount - cleanDiscount) * 100) / 100);
    if (totalAfterDiscount <= 0) {
      throw new Error('O total da venda deve ser maior que zero.');
    }

    // Créditos do aluno (se solicitados)
    const cleanCreditUsed = Math.max(0, Math.round((Number(creditUsed) || 0) * 100) / 100);
    if (cleanCreditUsed > 0) {
      const availableCredit = Math.round((Number(student.creditBalance) || 0) * 100) / 100;
      if (cleanCreditUsed > availableCredit + 0.001) {
        throw new Error(`Crédito insuficiente para ${student.name}. Disponível: R$ ${availableCredit.toFixed(2)}.`);
      }
      if (cleanCreditUsed > totalAfterDiscount + 0.001) {
        throw new Error('O valor de crédito utilizado não pode exceder o total da venda.');
      }
    }

    const saleTotal = Math.max(0, Math.round((totalAfterDiscount - cleanCreditUsed) * 100) / 100);
    if (saleTotal <= 0 && cleanCreditUsed <= 0) {
      throw new Error('O total da venda deve ser maior que zero.');
    }

    // Normalizar estrutura de pagamento (único ou múltiplas formas) + troco
    const nowIso = new Date().toISOString();
    let finalPayments: SalePaymentEntry[] = [];
    let resolvedPrimaryMethod: PaymentMethod = paymentMethod;
    let totalAccountCharge = 0;
    let totalTenderedUpfront = 0;
    let changeAmount = 0;
    let effectiveAmountPaid = 0;

    if (hasExplicitPayments) {
      for (const entry of effectiveMethods) {
        if (!Number.isFinite(entry.amount) || entry.amount <= 0) {
          throw new Error('Cada forma de pagamento informada deve ter valor maior que zero.');
        }
      }
      const sumEntries = Math.round(effectiveMethods.reduce((acc, p) => acc + p.amount, 0) * 100) / 100;
      if (sumEntries + 0.009 < saleTotal) {
        throw new Error(`Soma das formas de pagamento (R$ ${sumEntries.toFixed(2)}) é menor que o total líquido da venda (R$ ${saleTotal.toFixed(2)}).`);
      }
      const hasCash = effectiveMethods.some(p => p.method === 'DINHEIRO');
      if (sumEntries > saleTotal + 0.01 && !hasCash) {
        throw new Error('Pagamento excedente só é permitido quando há pagamento em Dinheiro para cálculo de troco.');
      }
      changeAmount = hasCash ? Math.max(0, Math.round((sumEntries - saleTotal) * 100) / 100) : 0;

      finalPayments = effectiveMethods.map(p => ({
        ...p,
        confirmedAt: p.method === 'CONTA_ALUNO' ? undefined : (p.confirmedAt || nowIso),
        transactionId: p.transactionId || (p.method !== 'CONTA_ALUNO' && p.method !== 'DINHEIRO' ? `TX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}` : undefined),
      }));

      totalAccountCharge = Math.round(
        finalPayments.filter(p => p.method === 'CONTA_ALUNO').reduce((acc, p) => acc + p.amount, 0) * 100
      ) / 100;
      totalTenderedUpfront = Math.round(
        finalPayments.filter(p => p.method !== 'CONTA_ALUNO').reduce((acc, p) => acc + p.amount, 0) * 100
      ) / 100;
      effectiveAmountPaid = Math.max(0, Math.round((totalTenderedUpfront - changeAmount) * 100) / 100);
      resolvedPrimaryMethod = finalPayments.find(p => p.method === 'CONTA_ALUNO')
        ? (totalAccountCharge > 0 && totalTenderedUpfront === 0 ? 'CONTA_ALUNO' : finalPayments[0].method)
        : finalPayments[0].method;
    } else {
      if (paymentMethod === 'CONTA_ALUNO') {
        totalAccountCharge = saleTotal;
        finalPayments = [{ method: 'CONTA_ALUNO', amount: saleTotal }];
        effectiveAmountPaid = 0;
        changeAmount = 0;
      } else {
        const tendered = amountPaid !== undefined && Number(amountPaid) > 0
          ? Math.round(Number(amountPaid) * 100) / 100
          : saleTotal;
        if (paymentMethod === 'DINHEIRO' && tendered + 0.009 < saleTotal) {
          throw new Error(`Valor recebido em dinheiro (R$ ${tendered.toFixed(2)}) é menor que o total da venda (R$ ${saleTotal.toFixed(2)}).`);
        }
        changeAmount = paymentMethod === 'DINHEIRO' ? Math.max(0, Math.round((tendered - saleTotal) * 100) / 100) : 0;
        totalTenderedUpfront = paymentMethod === 'DINHEIRO' ? tendered : saleTotal;
        effectiveAmountPaid = saleTotal;
        finalPayments = [{
          method: paymentMethod,
          amount: totalTenderedUpfront,
          confirmedAt: nowIso,
          transactionId: paymentMethod !== 'DINHEIRO' ? `TX-${Date.now()}-${Math.floor(100 + Math.random() * 900)}` : undefined,
        }];
      }
    }

    // Enforce individual consumption limit if charging to student account
    if (
      totalAccountCharge > 0 &&
      typeof student.consumptionLimit === 'number' &&
      student.consumptionLimit > 0
    ) {
      const projectedBalance = Math.round((student.currentConsumptionBalance + totalAccountCharge) * 100) / 100;
      if (projectedBalance > student.consumptionLimit) {
        throw new Error(
          `Compra excede o limite de consumo de ${student.name} (Limite: R$ ${student.consumptionLimit.toFixed(2)} • Saldo projetado: R$ ${projectedBalance.toFixed(2)}).`
        );
      }
    }

    const currentPeriod = this.toSaoPauloPeriod(nowIso);
    let saleId = `VEN-${Date.now().toString().slice(-6)}`;
    const existingSaleIds = new Set(this.data.sales.map(s => s.id));
    while (existingSaleIds.has(saleId)) {
      saleId = `VEN-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    }
    const resolvedIdempotencyKey =
      trimmedIdempotencyKey || `IDEMP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // =========================================================================
    // TRANSAÇÃO ATÔMICA COM SNAPSHOT PRÉVIO E ROLLBACK INTEGRAL EM CASO DE FALHA
    // =========================================================================
    const rollbackSnapshot = this.takeSnapshot();
    const prevPendingUpserts = this.clonePendingUpserts();
    const prevPendingDeletes = this.clonePendingDeletes();

    try {
      const txStudent = this.data.students.find(s => s.id === studentId)!;
      const activeSession = this.getActiveCashSession();

      // Etapa 1: Criar registro de venda inicialmente como PENDING
      if (__testFaultStage === 'CREATE_SALE') {
        throw new Error('Falha simulada ao gravar registro da venda.');
      }

      const newSale: Sale = {
        id: saleId,
        studentId: txStudent.id,
        studentName: txStudent.name,
        registrationNumber: txStudent.registrationNumber,
        items: saleItems,
        subtotal: subtotalBeforeDiscount,
        discountTotal: cleanDiscount,
        total: saleTotal,
        subtotalBeforeDiscount,
        discountAmount: cleanDiscount > 0 ? cleanDiscount : undefined,
        creditUsed: cleanCreditUsed > 0 ? cleanCreditUsed : undefined,
        paymentMethod: resolvedPrimaryMethod,
        payments: finalPayments,
        amountPaid: effectiveAmountPaid,
        changeAmount: changeAmount > 0 ? changeAmount : undefined,
        terminalId: terminalId || (activeSession ? `PDV-BALCAO-${activeSession.id.slice(-4)}` : 'PDV-BALCAO-01'),
        cashSessionId: activeSession?.id,
        notes: notes?.trim() || undefined,
        operatorUserId: operatorUser.id,
        operatorUserName: operatorUser.name,
        status: 'PENDING',
        billingPeriod: currentPeriod,
        billingStatus: totalAccountCharge > 0 ? 'AGUARDANDO_FATURAMENTO' : undefined,
        idempotencyKey: resolvedIdempotencyKey,
        origin: 'LOJINHA',
        createdAt: nowIso,
      };

      // Etapa 2: Baixa de estoque atômica (proíbe estoque negativo)
      const updatedProducts: Product[] = [];
      const createdMovements: StockMovement[] = [];
      const createdNotifications: WhatsAppNotification[] = [];

      for (let idx = 0; idx < saleItems.length; idx++) {
        const item = saleItems[idx];
        const product = this.data.products.find(p => p.id === item.productId);
        if (!product) {
          throw new Error(`Produto ${item.productId} não encontrado durante a baixa de estoque.`);
        }
        const prevStock = Number(product.currentStock);
        const nextStock = prevStock - item.quantity;
        if (nextStock < 0) {
          throw new Error(
            `Estoque insuficiente para o produto "${product.name}". Disponível: ${prevStock}. Solicitado: ${item.quantity}.`
          );
        }

        if (__testFaultStage === 'DEDUCT_STOCK' && idx === saleItems.length - 1) {
          throw new Error(`Falha simulada na baixa de estoque do produto "${product.name}".`);
        }

        product.currentStock = nextStock;
        product.updatedAt = nowIso;
        updatedProducts.push(product);

        const movement: StockMovement = {
          id: `MOV-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
          productId: product.id,
          productName: product.name,
          saleId: newSale.id,
          type: 'SAIDA_VENDA',
          quantity: -item.quantity,
          previousStock: prevStock,
          newStock: product.currentStock,
          resultingStock: product.currentStock,
          reason: `Venda ${newSale.id} (${resolvedPrimaryMethod}) - Aluno: ${txStudent.name}`,
          performedByUserId: operatorUser.id,
          performedByUserName: operatorUser.name,
          referenceId: newSale.id,
          timestamp: nowIso,
        };
        this.data.stockMovements.unshift(movement);
        createdMovements.push(movement);

        if (product.currentStock <= product.minStock) {
          const lowStockNotif: WhatsAppNotification = {
            id: `NOTIF-${Date.now()}-${idx}-${Math.floor(Math.random() * 100)}`,
            type: 'ALERTA_ESTOQUE',
            recipientName: 'Coordenação Lojinha',
            recipientPhone: '(11) 98765-4321',
            recipientRole: 'ADMIN',
            studentName: 'Estoque da Lojinha',
            messageText: `⚠️ Atenção: O item "${product.name}" atingiu ${product.currentStock} ${product.unit} (estoque mínimo: ${product.minStock}).`,
            status: 'ENTREGUE',
            scheduledFor: nowIso,
            sentAt: nowIso,
            attemptsCount: 1,
          };
          this.data.whatsappNotifications.unshift(lowStockNotif);
          createdNotifications.push(lowStockNotif);
        }
      }

      // Etapa 3: Atualizar consumo / saldo do aluno e livro financeiro (vinculado a saleId)
      if (__testFaultStage === 'UPDATE_STUDENT') {
        throw new Error('Falha simulada ao atualizar o saldo de consumo do aluno.');
      }

      const createdLedgerEntries: FinancialTransaction[] = [];

      if (cleanCreditUsed > 0) {
        txStudent.creditBalance = Math.max(0, Math.round(((txStudent.creditBalance || 0) - cleanCreditUsed) * 100) / 100);
        const creditEntry: FinancialTransaction = {
          id: `LED-${Date.now()}-CRD-${Math.floor(Math.random() * 1000)}`,
          timestamp: nowIso,
          studentId: txStudent.id,
          saleId: newSale.id,
          type: 'CREDITO',
          category: 'AJUSTE_CREDITO',
          amount: cleanCreditUsed,
          description: `Uso de crédito em conta na venda ${newSale.id}`,
          documentRef: newSale.id,
          performedByUserName: operatorUser.name,
        };
        this.data.financialLedger.unshift(creditEntry);
        createdLedgerEntries.push(creditEntry);
      }

      if (totalAccountCharge > 0) {
        txStudent.currentConsumptionBalance = Math.round((txStudent.currentConsumptionBalance + totalAccountCharge) * 100) / 100;
        txStudent.totalOpenDebt = Math.round((txStudent.totalOpenDebt + totalAccountCharge) * 100) / 100;

        const debitEntry: FinancialTransaction = {
          id: `LED-${Date.now()}-DEB-${Math.floor(Math.random() * 1000)}`,
          timestamp: nowIso,
          studentId: txStudent.id,
          saleId: newSale.id,
          type: 'DEBITO',
          category: 'CONSUMO_LOJINHA',
          amount: totalAccountCharge,
          description: `Consumo Lojinha - Venda ${newSale.id} (${saleItems.length} itens)`,
          documentRef: newSale.id,
          performedByUserName: operatorUser.name,
        };
        this.data.financialLedger.unshift(debitEntry);
        createdLedgerEntries.push(debitEntry);
      }

      if (effectiveAmountPaid > 0) {
        const paidMethodsLabel = finalPayments
          .filter(p => p.method !== 'CONTA_ALUNO')
          .map(p => p.method)
          .join(' + ');
        const paidEntry: FinancialTransaction = {
          id: `LED-${Date.now()}-PG-${Math.floor(Math.random() * 1000)}`,
          timestamp: nowIso,
          studentId: txStudent.id,
          saleId: newSale.id,
          type: 'CREDITO',
          category: 'PAGAMENTO_PIX',
          amount: effectiveAmountPaid,
          description: `Venda paga no ato (${paidMethodsLabel}) - ${newSale.id} (${saleItems.length} itens)`,
          documentRef: newSale.id,
          performedByUserName: operatorUser.name,
        };
        this.data.financialLedger.unshift(paidEntry);
        createdLedgerEntries.push(paidEntry);
      }

      // Etapa 4: Registrar movimentação no Caixa se houver sessão aberta
      const createdCashMovements: CashMovement[] = [];
      if (activeSession) {
        if (!Array.isArray(this.data.cashMovements)) this.data.cashMovements = [];
        const movTypeMap: Record<PaymentMethod, CashMovementType> = {
          DINHEIRO: 'VENDA_DINHEIRO',
          PIX: 'VENDA_PIX',
          CARTAO_CREDITO: 'VENDA_CARTAO',
          CARTAO_DEBITO: 'VENDA_CARTAO',
          MERCADO_PAGO: 'VENDA_MERCADO_PAGO',
          CONTA_ALUNO: 'VENDA_CONTA_ALUNO',
        };
        for (const pLine of finalPayments) {
          const netLineAmount =
            pLine.method === 'DINHEIRO' ? Math.max(0, Math.round((pLine.amount - changeAmount) * 100) / 100) : pLine.amount;
          if (netLineAmount <= 0) continue;
          const cashMov: CashMovement = {
            id: `CMOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            sessionId: activeSession.id,
            type: movTypeMap[pLine.method] || 'VENDA_CONTA_ALUNO',
            paymentMethod: pLine.method,
            amount: netLineAmount,
            description: `Venda ${newSale.id} (${txStudent.name}) — ${pLine.method}`,
            referenceId: newSale.id,
            performedByUserId: operatorUser.id,
            performedByUserName: operatorUser.name,
            timestamp: nowIso,
          };
          this.data.cashMovements.unshift(cashMov);
          createdCashMovements.push(cashMov);
        }
      }

      // Etapa 5: Inserir venda e criar recibo vinculado
      this.data.sales.unshift(newSale);

      if (__testFaultStage === 'CREATE_RECEIPT') {
        throw new Error('Falha simulada ao gerar o recibo vinculado à venda.');
      }

      // Marcar venda como COMPLETED somente quando todos os artefatos puderem ser vinculados
      newSale.status = 'COMPLETED';
      newSale.completedAt = nowIso;

      const receipt = this.createReceiptForSale(newSale, txStudent, operatorUser, {
        terminalId: newSale.terminalId,
        activeSession,
        skipSave: true,
      });

      if (!receipt || receipt.saleId !== newSale.id || receipt.status !== 'ATIVO') {
        throw new Error('Falha de integridade: o recibo não pôde ser vinculado corretamente à venda.');
      }

      // Etapa 6: Validar integridade dos registros gerados nesta transação
      const txIssues = validateDataIntegrity(this.getIntegritySnapshot()).filter(
        issue =>
          issue.severity === 'ERROR' &&
          (issue.entityId.includes(newSale.id) ||
            issue.entityId.includes(receipt.id) ||
            updatedProducts.some(p => p.id === issue.entityId))
      );
      if (txIssues.length > 0) {
        throw new Error(`Violação de integridade detectada na transação: ${txIssues[0].message}`);
      }

      // Etapa 7: Registro de auditoria vinculado ao saleId
      const auditLog: AuditLog = {
        id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: nowIso,
        userId: operatorUser.id,
        userName: operatorUser.name,
        userRole: operatorUser.role,
        action: 'REGISTRO_VENDA_PDV',
        module: 'VENDAS',
        referenceId: newSale.id,
        details: `Venda ${newSale.id} (Recibo ${receipt.receiptCode} • R$ ${saleTotal.toFixed(2)}) para ${txStudent.name} via ${finalPayments.map(p => p.method).join(' + ')}${cleanDiscount > 0 ? ` (desconto R$ ${cleanDiscount.toFixed(2)})` : ''}.`,
        status: 'SUCESSO',
      };
      this.data.auditLogs.unshift(auditLog);
      if (this.data.auditLogs.length > 500) {
        this.data.auditLogs = this.data.auditLogs.slice(0, 500);
      }

      // Etapa 8: Persistência única e imediata do estado final
      if (__testFaultStage === 'PERSIST_STORAGE') {
        throw new Error('Falha simulada ao persistir a transação no armazenamento.');
      }
      this.writeDatabaseSync(this.data, true);

      // Etapa 9: Enfileirar sincronização Supabase na ordem correta (pais -> filhos)
      for (const prod of updatedProducts) {
        this.triggerSupabaseSync('products', prod, 'mapProductToSupabase');
      }
      this.triggerSupabaseSync('students', txStudent, 'mapStudentToSupabase');
      this.triggerSupabaseSync('sales', newSale, 'mapSaleToSupabase');
      for (const mov of createdMovements) {
        this.triggerSupabaseSync('stock_movements', mov, 'mapStockMovementToSupabase');
      }
      for (const cm of createdCashMovements) {
        this.triggerSupabaseSync('cash_movements', cm, 'mapCashMovementToSupabase');
      }
      this.triggerSupabaseSync('sales_receipts', receipt, 'mapReceiptToSupabase');
      for (const notif of createdNotifications) {
        this.triggerSupabaseSync('whatsapp_notifications', notif, 'mapNotificationToSupabase');
      }
      this.triggerSupabaseSync('audit_logs', auditLog, 'mapAuditLogToSupabase');

      return {
        sale: newSale,
        student: txStudent,
        receipt,
        updatedProducts,
        stockMovements: createdMovements,
        ledgerEntries: createdLedgerEntries,
        auditLog,
      };
    } catch (err: any) {
      // ROLLBACK INTEGRAL: restaura snapshot anterior e filas pendentes
      this.data = rollbackSnapshot;
      this.pendingUpserts = prevPendingUpserts;
      this.pendingDeletes = prevPendingDeletes;

      // Registrar falha em auditoria sem corromper vendas, recibos, estoque ou saldo
      try {
        this.logAudit(
          operatorUser.id,
          operatorUser.name,
          operatorUser.role,
          'FALHA_VENDA_PDV',
          'VENDAS',
          `Transação da venda ${saleId} revertida integralmente (rollback). Motivo: ${err?.message || 'Erro desconhecido'}`,
          'FALHA',
          saleId
        );
      } catch {
        // Nunca mascarar erro principal da transação
      }

      throw err instanceof Error ? err : new Error(String(err || 'Não foi possível concluir a venda.'));
    }
  }

  // 3. Estorno Atômico e Idempotente de Venda no PDV
  public reverseSale(
    saleId: string,
    reason: string,
    user: { id: string; name: string; role: any },
    options?: { idempotencyKey?: string }
  ): {
    sale: Sale;
    student: Student;
    receipt?: SalesReceipt;
    updatedProducts: Product[];
    stockMovements: StockMovement[];
    updatedInvoices: Invoice[];
    ledgerEntries: FinancialTransaction[];
    auditLog?: AuditLog;
    idempotentReplay?: boolean;
  } {
    const cleanReason = (reason || '').trim();
    if (!cleanReason) {
      throw new Error('O motivo do estorno é obrigatório.');
    }

    const existingSale = this.data.sales.find(s => s.id === saleId);
    if (!existingSale) {
      throw new Error(`Venda ${saleId} não encontrada.`);
    }

    const studentRef = this.data.students.find(s => s.id === existingSale.studentId);
    if (!studentRef) {
      throw new Error('Aluno associado à venda não encontrado.');
    }

    // Idempotência do estorno: se já estornada com a mesma chave, retorna estado atual sem duplicar
    if (existingSale.status === 'REVERSED') {
      const reqKey = (options?.idempotencyKey || '').trim();
      if (reqKey && existingSale.reversalIdempotencyKey === reqKey) {
        const receipt = this.getReceiptBySaleId(existingSale.id);
        const updatedProducts = existingSale.items
          .map(it => this.data.products.find(p => p.id === it.productId))
          .filter(Boolean) as Product[];
        return {
          sale: existingSale,
          student: studentRef,
          receipt,
          updatedProducts,
          stockMovements: this.data.stockMovements.filter(
            m => (m.saleId === existingSale.id || m.referenceId === existingSale.id) && m.type === 'ESTORNO_VENDA'
          ),
          updatedInvoices: [],
          ledgerEntries: this.data.financialLedger.filter(
            l => (l.saleId === existingSale.id || l.documentRef === existingSale.id) && l.category === 'ESTORNO_VENDA'
          ),
          idempotentReplay: true,
        };
      }
      throw new Error(`A venda ${saleId} já foi estornada anteriormente e não pode ser estornada novamente.`);
    }

    if (
      existingSale.status === 'CANCELLED' ||
      existingSale.status === 'INCONSISTENTE' ||
      existingSale.status === 'FAILED' ||
      existingSale.status === 'PENDING'
    ) {
      throw new IntegrityError(
        `A venda ${saleId} está com status "${existingSale.status}" e não pode ser estornada diretamente.`
      );
    }

    const preCheck = isSaleConsistent(existingSale, this.data.receipts || []);
    if (!preCheck.valid || !preCheck.receipt) {
      throw new IntegrityError(
        `Venda ${saleId} está inconsistente (${preCheck.reason || 'sem recibo ATIVO correspondente'}) e não pode ser estornada diretamente. Utilize a opção de correção de integridade (Cancelar Venda Inválida ou Recuperar Recibo).`
      );
    }

    const rollbackSnapshot = this.takeSnapshot();
    const prevPendingUpserts = this.clonePendingUpserts();
    const prevPendingDeletes = this.clonePendingDeletes();

    try {
      const nowIso = new Date().toISOString();
      const sale = this.data.sales.find(s => s.id === saleId)!;
      const student = this.data.students.find(s => s.id === sale.studentId)!;
      const updatedProducts: Product[] = [];
      const createdMovements: StockMovement[] = [];
      const updatedInvoices: Invoice[] = [];

      // Calcular quantidades já estornadas parcialmente (se houver) para não devolver estoque em dobro
      const alreadyReversedByProduct = new Map<string, number>();
      for (const m of this.data.stockMovements) {
        if ((m.saleId === sale.id || m.referenceId === sale.id) && m.type === 'ESTORNO_VENDA') {
          alreadyReversedByProduct.set(
            m.productId,
            (alreadyReversedByProduct.get(m.productId) || 0) + Math.abs(Number(m.quantity) || 0)
          );
        }
      }

      // 1. Reverter estoque dos itens restantes
      for (let idx = 0; idx < sale.items.length; idx++) {
        const item = sale.items[idx];
        const product = this.data.products.find(p => p.id === item.productId);
        if (!product) continue;

        const alreadyReturned = alreadyReversedByProduct.get(item.productId) || 0;
        const qtyToRestore = Math.max(0, item.quantity - alreadyReturned);
        if (qtyToRestore <= 0) continue;

        const prevStock = Number(product.currentStock);
        product.currentStock = prevStock + qtyToRestore;
        product.updatedAt = nowIso;
        updatedProducts.push(product);

        const revMovement: StockMovement = {
          id: `MOV-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
          productId: product.id,
          productName: product.name,
          saleId: sale.id,
          type: 'ESTORNO_VENDA',
          quantity: qtyToRestore,
          previousStock: prevStock,
          newStock: product.currentStock,
          resultingStock: product.currentStock,
          reason: `Estorno de venda ${sale.id}: ${cleanReason}`,
          performedByUserId: user.id,
          performedByUserName: user.name,
          referenceId: sale.id,
          timestamp: nowIso,
        };
        this.data.stockMovements.unshift(revMovement);
        createdMovements.push(revMovement);
      }

      // 2. Ajustar ou desvincular faturas em aberto que contenham esta venda
      const saleMethod = sale.paymentMethod || 'CONTA_ALUNO';
      let creditedFromPaidInvoice = 0;

      for (const inv of this.data.invoices) {
        const hasInSalesIds = Array.isArray(inv.salesIds) && inv.salesIds.includes(sale.id);
        const hasInLinks = Array.isArray(inv.saleItemLinks) && inv.saleItemLinks.some(l => l.saleId === sale.id);
        if (!hasInSalesIds && !hasInLinks) continue;

        if (inv.status === 'PAGA') {
          const allocated = (sale.invoiceAllocations || [])
            .filter(a => a.invoiceId === inv.id)
            .reduce((acc, a) => acc + a.amount, 0);
          creditedFromPaidInvoice = this.roundCurrency(creditedFromPaidInvoice + (allocated > 0 ? allocated : sale.total));
          continue;
        }

        if (inv.status === 'CANCELADA') continue;

        inv.salesIds = (inv.salesIds || []).filter(id => id !== sale.id);
        if (Array.isArray(inv.saleItemLinks)) {
          inv.saleItemLinks = inv.saleItemLinks.filter(l => l.saleId !== sale.id);
          inv.consumptionItems = this.buildConsumptionSummaryItems(inv.saleItemLinks);
          inv.canteenConsumptionTotal = this.roundCurrency(
            inv.saleItemLinks.reduce((acc, l) => acc + Number(l.subtotal || 0), 0)
          );
        } else {
          inv.canteenConsumptionTotal = Math.max(0, this.roundCurrency(inv.canteenConsumptionTotal - sale.total));
        }

        inv.grossTotal = Math.max(
          0,
          this.roundCurrency(
            inv.tuitionAmount + inv.canteenConsumptionTotal + inv.previousBalance + inv.adjustmentsTotal - (inv.creditApplied || 0)
          )
        );
        inv.remainingBalance = Math.max(0, this.roundCurrency(inv.grossTotal - inv.paidTotal));
        inv.updatedAt = nowIso;
        if (!Array.isArray(inv.history)) inv.history = [];
        inv.history.unshift({
          id: `INV-HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: nowIso,
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: 'AJUSTE_POR_ESTORNO_VENDA',
          details: `Venda ${sale.id} removida da fatura devido a estorno. Motivo: ${cleanReason}`,
        });

        if (inv.grossTotal <= 0 && inv.paidTotal <= 0 && inv.salesIds.length === 0) {
          inv.status = 'CANCELADA';
          inv.canceledAt = nowIso;
          inv.canceledByUserName = user.name;
          inv.canceledReason = `Cancelada automaticamente após estorno da venda ${sale.id}.`;
        }
        updatedInvoices.push(inv);
      }

      // 3. Reverter crédito utilizado ou devolver crédito caso fatura já estivesse paga
      if ((sale.creditUsed || 0) > 0) {
        student.creditBalance = this.roundCurrency((student.creditBalance || 0) + Number(sale.creditUsed || 0));
      }
      if (creditedFromPaidInvoice > 0) {
        student.creditBalance = this.roundCurrency((student.creditBalance || 0) + creditedFromPaidInvoice);
      }

      // 4. Atualizar status da venda
      const remainingToReverse = Math.max(0, this.roundCurrency(sale.total - (sale.reversedAmount || 0)));
      sale.status = 'REVERSED';
      sale.reversedAmount = sale.total;
      sale.billingStatus = 'ESTORNADA';
      sale.reversedReason = cleanReason;
      sale.reversedByUserName = user.name;
      sale.reversedAt = nowIso;
      sale.invoiceId = undefined;
      sale.invoiceAllocations = [];
      sale.billedAmount = 0;
      sale.reversalIdempotencyKey =
        (options?.idempotencyKey || '').trim() || `REV-${sale.id}-${Date.now()}`;

      // 5. Recalcular saldo do aluno a partir das vendas e faturas persistidas
      this.recalculateStudentBalances(student);

      // 6. Registro no livro financeiro vinculado a saleId
      const revLedger: FinancialTransaction = {
        id: `LED-${Date.now()}-EST-${Math.floor(Math.random() * 1000)}`,
        timestamp: nowIso,
        studentId: student.id,
        saleId: sale.id,
        type: 'CREDITO',
        category: 'ESTORNO_VENDA',
        amount: remainingToReverse > 0 ? remainingToReverse : sale.total,
        description: `Estorno de venda ${sale.id} (${saleMethod}) - Motivo: ${cleanReason}`,
        documentRef: sale.id,
        performedByUserName: user.name,
      };
      this.data.financialLedger.unshift(revLedger);

      // 7. Movimentação no Caixa se houver sessão aberta
      const createdCashMovements: CashMovement[] = [];
      const activeSession = this.getActiveCashSession();
      if (activeSession) {
        if (!Array.isArray(this.data.cashMovements)) this.data.cashMovements = [];
        const revCashMov: CashMovement = {
          id: `CMOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          sessionId: activeSession.id,
          type: 'ESTORNO',
          paymentMethod: saleMethod,
          amount: remainingToReverse > 0 ? remainingToReverse : sale.total,
          description: `Estorno venda ${sale.id} (${student.name}): ${cleanReason}`,
          referenceId: sale.id,
          performedByUserId: user.id,
          performedByUserName: user.name,
          timestamp: nowIso,
        };
        this.data.cashMovements.unshift(revCashMov);
        createdCashMovements.push(revCashMov);
      }

      // 8. Atualizar recibo para ESTORNADO
      const receipt = this.appendReceiptReversal(sale, {
        type: 'ESTORNO_TOTAL',
        reason: cleanReason,
        user,
        reversedAmount: remainingToReverse > 0 ? remainingToReverse : sale.total,
        transactionId: sale.payments?.find(p => p.transactionId)?.transactionId,
      });

      // 9. Verificar integridade após estorno
      const postIssues = validateDataIntegrity(this.getIntegritySnapshot()).filter(
        issue =>
          issue.severity === 'ERROR' &&
          (issue.entityId.includes(sale.id) || (receipt && issue.entityId.includes(receipt.id)))
      );
      if (postIssues.length > 0) {
        throw new Error(`Violação de integridade detectada no estorno: ${postIssues[0].message}`);
      }

      // 10. Auditoria vinculada a saleId
      const auditLog: AuditLog = {
        id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: nowIso,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'ESTORNO_VENDA_PDV',
        module: 'VENDAS',
        referenceId: sale.id,
        details: `Estorno integral da venda ${sale.id} (R$ ${sale.total.toFixed(2)}) de ${student.name}. Motivo: ${cleanReason}`,
        status: 'SUCESSO',
      };
      this.data.auditLogs.unshift(auditLog);
      if (this.data.auditLogs.length > 500) {
        this.data.auditLogs = this.data.auditLogs.slice(0, 500);
      }

      // 11. Persistir atomicamente e enfileirar Supabase
      this.writeDatabaseSync(this.data, true);

      for (const prod of updatedProducts) {
        this.triggerSupabaseSync('products', prod, 'mapProductToSupabase');
      }
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
      this.triggerSupabaseSync('sales', sale, 'mapSaleToSupabase');
      for (const inv of updatedInvoices) {
        this.triggerSupabaseSync('invoices', inv, 'mapInvoiceToSupabase');
      }
      for (const mov of createdMovements) {
        this.triggerSupabaseSync('stock_movements', mov, 'mapStockMovementToSupabase');
      }
      for (const cm of createdCashMovements) {
        this.triggerSupabaseSync('cash_movements', cm, 'mapCashMovementToSupabase');
      }
      if (receipt) {
        this.triggerSupabaseSync('sales_receipts', receipt, 'mapReceiptToSupabase');
      }
      this.triggerSupabaseSync('audit_logs', auditLog, 'mapAuditLogToSupabase');

      return {
        sale,
        student,
        receipt,
        updatedProducts,
        stockMovements: createdMovements,
        updatedInvoices,
        ledgerEntries: [revLedger],
        auditLog,
      };
    } catch (err: any) {
      this.data = rollbackSnapshot;
      this.pendingUpserts = prevPendingUpserts;
      this.pendingDeletes = prevPendingDeletes;

      try {
        this.logAudit(
          user.id,
          user.name,
          user.role,
          'FALHA_ESTORNO_VENDA_PDV',
          'VENDAS',
          `Falha ao estornar venda ${saleId} (alterações revertidas). Motivo: ${err?.message || 'Erro desconhecido'}`,
          'FALHA',
          saleId
        );
      } catch {
        // ignore
      }

      throw err instanceof Error ? err : new Error(String(err || 'Erro ao estornar venda.'));
    }
  }

  public partialReverseSale(
    saleId: string,
    params: {
      items: Array<{ productId: string; quantity: number }>;
      reason: string;
    },
    user: { id: string; name: string; role: any }
  ): { sale: Sale; student: Student; receipt?: SalesReceipt; reversedAmount: number } {
    const cleanReason = (params.reason || '').trim();
    if (!cleanReason) {
      throw new Error('O motivo do estorno parcial é obrigatório.');
    }

    const sale = this.data.sales.find(s => s.id === saleId);
    if (!sale) throw new Error(`Venda ${saleId} não encontrada.`);
    if (sale.status === 'REVERSED') {
      throw new Error(`A venda ${saleId} já foi estornada integralmente.`);
    }

    const student = this.data.students.find(s => s.id === sale.studentId);
    if (!student) throw new Error('Aluno associado à venda não encontrado.');

    if (!Array.isArray(params.items) || params.items.length === 0) {
      throw new Error('Informe ao menos um item para estorno parcial.');
    }

    const existingReceipt = this.getReceiptBySaleId(sale.id);
    const alreadyReversedQtyByProduct = new Map<string, number>();
    for (const rev of existingReceipt?.reversals || []) {
      for (const rItem of rev.items || []) {
        alreadyReversedQtyByProduct.set(
          rItem.productId,
          (alreadyReversedQtyByProduct.get(rItem.productId) || 0) + rItem.quantity
        );
      }
    }

    const nowIso = new Date().toISOString();
    const factor = this.getItemNetFactor(sale);
    let reversedAmount = 0;
    const reversedItemsDetail: Array<{ productId: string; name: string; quantity: number; amount: number }> = [];

    for (const reqItem of params.items) {
      const saleItem = sale.items.find(i => i.productId === reqItem.productId);
      if (!saleItem) {
        throw new Error(`Produto ${reqItem.productId} não pertence à venda ${sale.id}.`);
      }
      const alreadyRevQty = alreadyReversedQtyByProduct.get(reqItem.productId) || 0;
      const availableToReverse = saleItem.quantity - alreadyRevQty;
      const qty = Number(reqItem.quantity);
      if (!Number.isFinite(qty) || qty <= 0 || qty > availableToReverse) {
        throw new Error(`Quantidade inválida para estorno de "${saleItem.name}". Disponível: ${availableToReverse}.`);
      }

      const itemAmount = this.roundCurrency(qty * saleItem.unitPrice * factor);
      reversedAmount = this.roundCurrency(reversedAmount + itemAmount);
      reversedItemsDetail.push({
        productId: saleItem.productId,
        name: saleItem.name,
        quantity: qty,
        amount: itemAmount,
      });

      const product = this.data.products.find(p => p.id === saleItem.productId);
      if (product) {
        const prevStock = product.currentStock;
        product.currentStock += qty;
        product.updatedAt = nowIso;
        const partialMov: StockMovement = {
          id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          productId: product.id,
          productName: product.name,
          type: 'ESTORNO_VENDA',
          quantity: qty,
          previousStock: prevStock,
          newStock: product.currentStock,
          reason: `Estorno parcial venda ${sale.id}: ${cleanReason}`,
          performedByUserId: user.id,
          performedByUserName: user.name,
          referenceId: sale.id,
          timestamp: nowIso
        };
        this.data.stockMovements.unshift(partialMov);
        this.triggerSupabaseSync('products', product, 'mapProductToSupabase');
        this.triggerSupabaseSync('stock_movements', partialMov, 'mapStockMovementToSupabase');
      }
    }

    const totalReversedAfter = Math.min(sale.total, this.roundCurrency((sale.reversedAmount || 0) + reversedAmount));
    const isNowFullyReversed = totalReversedAfter >= sale.total - 0.01;
    reversedAmount = isNowFullyReversed
      ? this.roundCurrency(sale.total - (sale.reversedAmount || 0))
      : reversedAmount;

    const saleMethod = sale.paymentMethod || 'CONTA_ALUNO';
    if (saleMethod === 'CONTA_ALUNO') {
      student.currentConsumptionBalance = Math.max(0, this.roundCurrency(student.currentConsumptionBalance - reversedAmount));
      student.totalOpenDebt = Math.max(0, this.roundCurrency(student.totalOpenDebt - reversedAmount));
    }

    this.data.financialLedger.unshift({
      id: `LED-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      timestamp: nowIso,
      studentId: student.id,
      type: 'CREDITO',
      category: 'ESTORNO_VENDA',
      amount: reversedAmount,
      description: `Estorno parcial venda ${sale.id} (${saleMethod}) - Motivo: ${cleanReason}`,
      documentRef: sale.id,
      performedByUserName: user.name
    });

    const activeSession = this.getActiveCashSession();
    if (activeSession) {
      if (!Array.isArray(this.data.cashMovements)) this.data.cashMovements = [];
      const partialCashMov: CashMovement = {
        id: `CMOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        sessionId: activeSession.id,
        type: 'ESTORNO',
        paymentMethod: saleMethod,
        amount: reversedAmount,
        description: `Estorno parcial venda ${sale.id} (${student.name}): ${cleanReason}`,
        referenceId: sale.id,
        performedByUserId: user.id,
        performedByUserName: user.name,
        timestamp: nowIso
      };
      this.data.cashMovements.unshift(partialCashMov);
      this.triggerSupabaseSync('cash_movements', partialCashMov, 'mapCashMovementToSupabase');
    }

    sale.reversedAmount = totalReversedAfter;
    sale.reversedReason = cleanReason;
    sale.reversedByUserName = user.name;
    sale.reversedAt = nowIso;
    if (isNowFullyReversed) {
      sale.status = 'REVERSED';
      sale.billingStatus = 'ESTORNADA';
    }

    const receipt = this.appendReceiptReversal(sale, {
      type: isNowFullyReversed ? 'ESTORNO_TOTAL' : 'ESTORNO_PARCIAL',
      reason: cleanReason,
      user,
      reversedAmount,
      transactionId: sale.payments?.find(p => p.transactionId)?.transactionId,
      items: reversedItemsDetail,
    });

    this.logAudit(
      user.id,
      user.name,
      user.role,
      isNowFullyReversed ? 'ESTORNO_VENDA_PDV' : 'ESTORNO_PARCIAL_VENDA_PDV',
      'RECIBOS',
      `Estorno ${isNowFullyReversed ? 'integral' : 'parcial'} da venda ${sale.id} (R$ ${reversedAmount.toFixed(2)}) de ${student.name}. Motivo: ${cleanReason}`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('sales', sale, 'mapSaleToSupabase');
    if (receipt) this.triggerSupabaseSync('sales_receipts', receipt, 'mapReceiptToSupabase');
    this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    return { sale, student, receipt, reversedAmount };
  }

  private toSaoPauloTime(isoOrDate?: string | null): string {
    if (!isoOrDate) return '00:00:00';
    const dt = new Date(isoOrDate);
    if (Number.isNaN(dt.getTime())) return '00:00:00';
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(dt);
  }

  private formatPaymentMethodLabel(method: PaymentMethod): string {
    const map: Record<PaymentMethod, string> = {
      CONTA_ALUNO: 'Conta do Aluno (Faturamento Posterior)',
      DINHEIRO: 'Dinheiro',
      PIX: 'Pix',
      CARTAO_CREDITO: 'Cartão de Crédito',
      CARTAO_DEBITO: 'Cartão de Débito',
      MERCADO_PAGO: 'Mercado Pago',
    };
    return map[method] || method;
  }

  private generateNextReceiptCode(): string {
    const receipts = this.getReceipts();
    const sales = this.getSales();
    let maxNum = 0;
    const usedCodes = new Set<string>();
    const registerCode = (code?: string) => {
      if (!code) return;
      usedCodes.add(code);
      const match = /^ICE-(\d+)$/i.exec(code);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    };
    for (const r of receipts) registerCode(r.receiptCode);
    for (const s of sales) registerCode(s.receiptCode);
    let next = maxNum + 1;
    let code = `ICE-${String(next).padStart(6, '0')}`;
    while (usedCodes.has(code)) {
      next += 1;
      code = `ICE-${String(next).padStart(6, '0')}`;
    }
    return code;
  }

  public createReceiptForSale(
    sale: Sale,
    student?: Student,
    operatorUser?: { id: string; name: string; role: any },
    opts?: { terminalId?: string; activeSession?: CashRegisterSession | null; skipSave?: boolean }
  ): SalesReceipt {
    const existing = this.getReceiptBySaleId(sale.id);
    if (existing) {
      if (!sale.receiptId || !sale.receiptCode) {
        sale.receiptId = existing.id;
        sale.receiptCode = existing.receiptCode;
      }
      return existing;
    }

    const resolvedStudent = student || this.data.students.find(s => s.id === sale.studentId);
    const settings = this.data.settings;
    const receiptSettings = settings.receiptSettings || initialSettings.receiptSettings!;
    const nowIso = sale.createdAt || new Date().toISOString();
    const receiptCode = this.generateNextReceiptCode();
    const receiptId = `REC-${receiptCode}`;

    const primaryGuardian = resolvedStudent?.guardians?.find(g => g.isPrimaryPayer && g.guardianName)
      || resolvedStudent?.guardians?.find(g => g.guardianName);

    const itemsSnapshot: ReceiptItemSnapshot[] = (sale.items || []).map((item, idx) => {
      const prod = this.data.products.find(p => p.id === item.productId);
      const rawSubtotal = this.roundCurrency(Number(item.unitPrice) * Number(item.quantity));
      const itemDisc = this.roundCurrency(item.discountAmount || 0);
      return {
        itemIndex: idx,
        productId: item.productId,
        internalCode: item.internalCode || prod?.internalCode,
        barcode: item.barcode || prod?.barcode,
        name: item.name,
        category: item.category,
        unit: item.unit || prod?.unit || 'un',
        unitPrice: this.roundCurrency(item.unitPrice),
        quantity: Number(item.quantity),
        individualDiscount: itemDisc,
        subtotal: rawSubtotal,
        total: this.roundCurrency(item.subtotal),
      };
    });

    const productsSubtotal = this.roundCurrency(
      sale.subtotalBeforeDiscount !== undefined
        ? sale.subtotalBeforeDiscount
        : itemsSnapshot.reduce((acc, it) => acc + it.subtotal, 0)
    );
    const discountTotal = this.roundCurrency(sale.discountAmount || 0);
    const creditUsed = this.roundCurrency(sale.creditUsed || 0);

    const rawPayments: SalePaymentEntry[] = Array.isArray(sale.payments) && sale.payments.length > 0
      ? sale.payments
      : [{
          method: sale.paymentMethod || 'CONTA_ALUNO',
          amount: this.roundCurrency(sale.total),
          confirmedAt: (sale.paymentMethod && sale.paymentMethod !== 'CONTA_ALUNO') ? nowIso : undefined,
        }];

    const paymentLines: ReceiptPaymentLine[] = rawPayments.map(p => ({
      method: p.method,
      label: this.formatPaymentMethodLabel(p.method),
      amount: this.roundCurrency(p.amount),
      status: sale.status === 'REVERSED'
        ? 'ESTORNADO'
        : p.method === 'CONTA_ALUNO'
          ? 'LANCADO_EM_CONTA'
          : 'CONFIRMADO',
      transactionId: p.transactionId,
      confirmedAt: p.method === 'CONTA_ALUNO' ? undefined : (p.confirmedAt || nowIso),
    }));

    const amountPaid = sale.amountPaid !== undefined
      ? this.roundCurrency(sale.amountPaid)
      : this.roundCurrency(
          paymentLines
            .filter(p => p.status === 'CONFIRMADO')
            .reduce((acc, p) => acc + p.amount, 0) - (sale.changeAmount || 0)
        );

    const reversals: ReceiptReversalRecord[] = sale.status === 'REVERSED'
      ? [{
          id: `EST-REC-${Date.now()}-${Math.floor(Math.random() * 900)}`,
          originalSaleId: sale.id,
          type: 'ESTORNO_TOTAL',
          reason: sale.reversedReason || 'Estorno registrado no histórico',
          operatorUserId: operatorUser?.id || sale.operatorUserId,
          operatorUserName: sale.reversedByUserName || operatorUser?.name || sale.operatorUserName,
          timestamp: sale.reversedAt || nowIso,
          reversedAmount: this.roundCurrency(sale.reversedAmount || sale.total),
          transactionId: paymentLines.find(p => p.transactionId)?.transactionId,
        }]
      : [];

    const receipt: SalesReceipt = {
      id: receiptId,
      receiptCode,
      saleId: sale.id,
      version: 1,
      status: sale.status === 'REVERSED' ? 'ESTORNADO' : 'ATIVO',
      institution: {
        storeName: settings.storeName || 'Lojinha ICEVES',
        institutionName: settings.institutionName || 'Escola de Cristo — ICEVES',
        cnpj: settings.cnpj || undefined,
        unitName: settings.currentCohortName || 'Unidade ICEVES • 10ª Turma',
        logoUrl: '/assets/aistudio/image_e4461e45.png',
      },
      saleSnapshot: {
        saleId: sale.id,
        createdAt: nowIso,
        saoPauloDate: this.toSaoPauloDate(nowIso),
        saoPauloTime: this.toSaoPauloTime(nowIso),
        timezone: 'America/Sao_Paulo',
        origin: sale.origin || 'LOJINHA',
        saleStatus: sale.status === 'REVERSED' ? 'REVERSED' : 'COMPLETED',
        transactionId: paymentLines.find(p => p.transactionId)?.transactionId || sale.id,
        billingPeriod: sale.billingPeriod,
        notes: sale.notes,
      },
      studentSnapshot: {
        studentId: sale.studentId,
        name: resolvedStudent?.name || sale.studentName,
        registrationNumber: resolvedStudent?.registrationNumber || sale.registrationNumber,
        classGroup: resolvedStudent?.classGroup || undefined,
        guardianName: primaryGuardian?.guardianName || undefined,
        guardianRelationship: primaryGuardian?.relationship || undefined,
      },
      items: itemsSnapshot,
      financialSummary: {
        productsSubtotal,
        discountTotal,
        creditUsed,
        saleTotal: this.roundCurrency(sale.total),
        amountPaid: Math.max(0, amountPaid),
        changeAmount: this.roundCurrency(sale.changeAmount || 0),
      },
      payments: paymentLines,
      operational: {
        operatorUserId: sale.operatorUserId || operatorUser?.id || 'system',
        operatorUserName: sale.operatorUserName || operatorUser?.name || 'Operador',
        cashSessionId: sale.cashSessionId || opts?.activeSession?.id || undefined,
        cashRegisterLabel: sale.cashSessionId || opts?.activeSession?.id
          ? `Caixa ${(sale.cashSessionId || opts?.activeSession?.id || '').slice(-6)}`
          : 'Lançamento Direto',
        terminalId: opts?.terminalId || sale.terminalId || (sale.origin === 'PDV_PASSEIOS' ? 'PDV-PASSEIOS' : 'PDV-BALCAO-01'),
        operationTimestamp: nowIso,
      },
      reversals,
      reprintCount: 0,
      customHeaderSnapshot: receiptSettings.customHeader || undefined,
      customFooterSnapshot: receiptSettings.customFooter || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (!Array.isArray(this.data.receipts)) this.data.receipts = [];
    this.data.receipts.unshift(receipt);
    sale.receiptId = receipt.id;
    sale.receiptCode = receipt.receiptCode;

    if (!opts?.skipSave) {
      this.saveDatabase();
      this.triggerSupabaseSync('sales_receipts', receipt, 'mapReceiptToSupabase');
      this.triggerSupabaseSync('sales', sale, 'mapSaleToSupabase');
    }

    return receipt;
  }

  private appendReceiptReversal(
    sale: Sale,
    info: {
      type: 'CANCELAMENTO' | 'ESTORNO_PARCIAL' | 'ESTORNO_TOTAL';
      reason: string;
      user: { id: string; name: string; role: any };
      reversedAmount: number;
      transactionId?: string;
      items?: Array<{ productId: string; name: string; quantity: number; amount: number }>;
    }
  ): SalesReceipt | undefined {
    const receipt = this.getReceiptBySaleId(sale.id) || this.createReceiptForSale(sale, undefined, info.user, { skipSave: true });
    if (!receipt) return undefined;

    const nowIso = sale.reversedAt || new Date().toISOString();
    const record: ReceiptReversalRecord = {
      id: `EST-REC-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      originalSaleId: sale.id,
      type: info.type,
      reason: info.reason,
      operatorUserId: info.user.id,
      operatorUserName: info.user.name,
      timestamp: nowIso,
      reversedAmount: this.roundCurrency(info.reversedAmount),
      transactionId: info.transactionId,
      items: info.items,
    };

    if (!Array.isArray(receipt.reversals)) receipt.reversals = [];
    receipt.reversals.unshift(record);
    receipt.version = (receipt.version || 1) + 1;
    receipt.updatedAt = nowIso;

    if (info.type === 'ESTORNO_TOTAL' || info.type === 'CANCELAMENTO' || sale.status === 'REVERSED') {
      receipt.status = info.type === 'CANCELAMENTO' ? 'CANCELADO' : 'ESTORNADO';
      receipt.saleSnapshot.saleStatus = 'REVERSED';
      receipt.payments = receipt.payments.map(p => ({ ...p, status: 'ESTORNADO' }));
    } else {
      receipt.status = 'PARCIALMENTE_ESTORNADO';
      receipt.saleSnapshot.saleStatus = 'PARTIALLY_REVERSED';
    }

    return receipt;
  }

  private ensureReceiptsForExistingSales() {
    if (!Array.isArray(this.data.receipts)) this.data.receipts = [];
    let modified = false;
    // Process oldest to newest so sequential codes ICE-000001... follow chronological order
    const chronological = [...(this.data.sales || [])].sort((a, b) =>
      (a.createdAt || '').localeCompare(b.createdAt || '')
    );
    for (const sale of chronological) {
      if (!this.data.receipts.some(r => r.saleId === sale.id)) {
        this.createReceiptForSale(sale, undefined, undefined, { skipSave: true });
        modified = true;
      }
    }
    if (modified) {
      this.saveDatabase(this.data, true);
    }
  }

  public recordReceiptAction(
    receiptId: string,
    actionType: 'PRINT' | 'PDF' | 'REPRINT',
    user: { id: string; name: string; role: UserRole; studentId?: string; guardianId?: string }
  ): SalesReceipt {
    const receipt = this.getReceiptById(receiptId);
    if (!receipt) {
      throw new Error('Recibo não encontrado.');
    }

    const receiptSettings = this.data.settings.receiptSettings || initialSettings.receiptSettings!;
    const allowedRoles = receiptSettings.secondCopyAllowedRoles || ['ADMIN', 'MANAGER', 'CASHIER', 'VIEWER', 'STUDENT', 'GUARDIAN'];
    if (actionType === 'REPRINT' && !allowedRoles.includes(user.role)) {
      throw new Error(`O perfil ${user.role} não possui permissão para emitir segunda via de recibo.`);
    }

    if (user.role === 'STUDENT' && user.studentId && receipt.studentSnapshot.studentId !== user.studentId) {
      throw new Error('Acesso negado: você só pode acessar os seus próprios comprovantes.');
    }
    if (user.role === 'GUARDIAN' && user.guardianId) {
      const guardian = this.data.guardians.find(g => g.id === user.guardianId);
      if (!guardian?.studentIds.includes(receipt.studentSnapshot.studentId)) {
        throw new Error('Acesso negado: este comprovante pertence a um aluno não vinculado à sua conta.');
      }
    }

    const nowIso = new Date().toISOString();
    if (actionType === 'REPRINT' || actionType === 'PRINT' || actionType === 'PDF') {
      if (actionType === 'REPRINT' || receipt.reprintCount > 0 || actionType === 'PRINT') {
        receipt.reprintCount = (receipt.reprintCount || 0) + (actionType === 'PDF' && receipt.reprintCount === 0 ? 0 : 1);
      }
      receipt.lastReprintedAt = nowIso;
      receipt.lastReprintedByUserName = user.name;
      receipt.updatedAt = nowIso;
    }

    const actionMap = {
      PRINT: 'IMPRESSAO_RECIBO',
      REPRINT: 'REIMPRESSAO_SEGUNDA_VIA_RECIBO',
      PDF: 'EXPORTACAO_PDF_RECIBO',
    } as const;

    this.logAudit(
      user.id,
      user.name,
      user.role,
      actionMap[actionType],
      'RECIBOS',
      `${actionType === 'PDF' ? 'Exportação PDF' : actionType === 'REPRINT' ? 'Emissão de 2ª via' : 'Impressão'} do recibo ${receipt.receiptCode} (Venda ${receipt.saleId} • Aluno ${receipt.studentSnapshot.name}).`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('sales_receipts', receipt, 'mapReceiptToSupabase');
    return receipt;
  }

  // 4. Ajuste manual de estoque (Entrada/Ajuste/Perda e Avaria)
  public adjustStock(params: {
    productId: string;
    type: 'ENTRADA' | 'AJUSTE_MANUAL' | 'PERDA_AVARIA';
    quantity: number; // For ENTRADA & PERDA_AVARIA: positive delta amount. For AJUSTE_MANUAL: absolute new stock
    reason: string;
    user: { id: string; name: string; role: any };
  }) {
    const { productId, type, quantity, reason, user } = params;
    const product = this.data.products.find(p => p.id === productId);
    if (!product) {
      throw new Error(`Produto não encontrado.`);
    }
    if (product.archived) {
      throw new Error(`Produto "${product.name}" está arquivado no histórico e não pode receber ajuste de estoque.`);
    }
    if (!reason || reason.trim().length < 3) {
      throw new Error('Informe uma justificativa clara para a movimentação de estoque.');
    }

    const prevStock = product.currentStock;
    let newStock = prevStock;
    let diff = 0;

    if (type === 'ENTRADA') {
      if (quantity <= 0) throw new Error('Quantidade de entrada deve ser maior que zero.');
      newStock = prevStock + quantity;
      diff = quantity;
    } else if (type === 'PERDA_AVARIA') {
      if (quantity <= 0) throw new Error('Quantidade de perda/avaria deve ser maior que zero.');
      if (quantity > prevStock) throw new Error(`Quantidade de baixa (${quantity}) supera o estoque atual (${prevStock}).`);
      newStock = prevStock - quantity;
      diff = -quantity;
    } else {
      if (quantity < 0) throw new Error('Estoque não pode ser negativo.');
      newStock = quantity;
      diff = newStock - prevStock;
    }

    product.currentStock = newStock;
    product.updatedAt = new Date().toISOString();

    const stockMov: StockMovement = {
      id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      productId: product.id,
      productName: product.name,
      type: type,
      quantity: diff,
      previousStock: prevStock,
      newStock: newStock,
      reason: reason.trim(),
      performedByUserId: user.id,
      performedByUserName: user.name,
      timestamp: new Date().toISOString()
    };
    this.data.stockMovements.unshift(stockMov);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      type === 'PERDA_AVARIA' ? 'BAIXA_PERDA_AVARIA' : 'AJUSTE_ESTOQUE',
      'ESTOQUE',
      `${type === 'PERDA_AVARIA' ? 'Perda/avaria registrada' : 'Ajuste manual de estoque'} no produto ${product.name}: ${prevStock} -> ${newStock} (${diff >= 0 ? '+' : ''}${diff}). Motivo: ${reason}`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('products', product, 'mapProductToSupabase');
    this.triggerSupabaseSync('stock_movements', stockMov, 'mapStockMovementToSupabase');
    return product;
  }

  // --- CONTROLE DE CAIXA & FINANCEIRO ---
  public getCashSessions(): CashRegisterSession[] {
    if (!Array.isArray(this.data.cashSessions)) this.data.cashSessions = [];
    return this.data.cashSessions;
  }

  public getActiveCashSession(): CashRegisterSession | null {
    if (!Array.isArray(this.data.cashSessions)) this.data.cashSessions = [];
    return this.data.cashSessions.find(s => s.status === 'ABERTO') || null;
  }

  public getCashMovements(): CashMovement[] {
    if (!Array.isArray(this.data.cashMovements)) this.data.cashMovements = [];
    return this.data.cashMovements;
  }

  public openCashSession(
    openingBalance: number,
    notes: string | undefined,
    user: { id: string; name: string; role: any }
  ): CashRegisterSession {
    if (!Array.isArray(this.data.cashSessions)) this.data.cashSessions = [];
    if (!Array.isArray(this.data.cashMovements)) this.data.cashMovements = [];

    const existing = this.getActiveCashSession();
    if (existing) {
      throw new Error(`Já existe um caixa aberto (${existing.id}) desde ${new Date(existing.openedAt).toLocaleString('pt-BR')}.`);
    }

    const cleanOpening = Math.max(0, Math.round((Number(openingBalance) || 0) * 100) / 100);
    const session: CashRegisterSession = {
      id: `CX-${Date.now().toString().slice(-6)}`,
      status: 'ABERTO',
      openedAt: new Date().toISOString(),
      openedByUserId: user.id,
      openedByUserName: user.name,
      openingBalance: cleanOpening,
      notes: notes?.trim() || undefined
    };

    this.data.cashSessions.unshift(session);
    const openingMov: CashMovement = {
      id: `CMOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sessionId: session.id,
      type: 'ABERTURA',
      paymentMethod: 'DINHEIRO',
      amount: cleanOpening,
      description: `Abertura de caixa (${session.id}) com saldo inicial`,
      referenceId: session.id,
      performedByUserId: user.id,
      performedByUserName: user.name,
      timestamp: session.openedAt
    };
    this.data.cashMovements.unshift(openingMov);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'ABERTURA_CAIXA',
      'CAIXA',
      `Caixa ${session.id} aberto com saldo inicial de R$ ${cleanOpening.toFixed(2)}.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('cash_registers', session, 'mapCashRegisterToSupabase');
    this.triggerSupabaseSync('cash_movements', openingMov, 'mapCashMovementToSupabase');
    return session;
  }

  public addCashMovement(params: {
    type: 'SUPRIMENTO' | 'SANGRIA' | 'DESPESA' | 'RECEITA';
    amount: number;
    description: string;
    paymentMethod?: PaymentMethod;
    user: { id: string; name: string; role: any };
  }): CashMovement {
    if (!Array.isArray(this.data.cashMovements)) this.data.cashMovements = [];
    const active = this.getActiveCashSession();
    if (!active) {
      throw new Error('Abra o caixa antes de registrar suprimentos, sangrias, receitas ou despesas.');
    }

    const cleanAmount = Math.round((Number(params.amount) || 0) * 100) / 100;
    if (cleanAmount <= 0) {
      throw new Error('O valor da movimentação deve ser maior que zero.');
    }
    const cleanDesc = (params.description || '').trim();
    if (cleanDesc.length < 3) {
      throw new Error('Informe uma descrição/justificativa para a movimentação.');
    }

    const mov: CashMovement = {
      id: `CMOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sessionId: active.id,
      type: params.type,
      paymentMethod: params.paymentMethod || 'DINHEIRO',
      amount: cleanAmount,
      description: cleanDesc,
      referenceId: active.id,
      performedByUserId: params.user.id,
      performedByUserName: params.user.name,
      timestamp: new Date().toISOString()
    };

    this.data.cashMovements.unshift(mov);
    this.logAudit(
      params.user.id,
      params.user.name,
      params.user.role,
      `CAIXA_${params.type}`,
      'CAIXA',
      `${params.type} de R$ ${cleanAmount.toFixed(2)} no caixa ${active.id}: ${cleanDesc}`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('cash_movements', mov, 'mapCashMovementToSupabase');
    return mov;
  }

  public closeCashSession(
    countedBalance: number,
    notes: string | undefined,
    user: { id: string; name: string; role: any }
  ): CashRegisterSession {
    const active = this.getActiveCashSession();
    if (!active) {
      throw new Error('Nenhum caixa aberto para fechamento.');
    }
    if (!Array.isArray(this.data.cashMovements)) this.data.cashMovements = [];

    const sessionMovs = this.data.cashMovements.filter(m => m.sessionId === active.id);
    let expectedCash = active.openingBalance;
    for (const m of sessionMovs) {
      if (m.type === 'SUPRIMENTO' || m.type === 'RECEITA' || m.type === 'VENDA_DINHEIRO') {
        expectedCash += m.amount;
      } else if (m.type === 'SANGRIA' || m.type === 'DESPESA') {
        expectedCash -= m.amount;
      } else if (m.type === 'ESTORNO' && m.paymentMethod === 'DINHEIRO') {
        expectedCash -= m.amount;
      }
    }

    expectedCash = Math.round(expectedCash * 100) / 100;
    const cleanCounted = Math.max(0, Math.round((Number(countedBalance) || 0) * 100) / 100);
    const difference = Math.round((cleanCounted - expectedCash) * 100) / 100;

    active.status = 'FECHADO';
    active.closedAt = new Date().toISOString();
    active.closedByUserId = user.id;
    active.closedByUserName = user.name;
    active.expectedBalance = expectedCash;
    active.countedBalance = cleanCounted;
    active.difference = difference;
    if (notes?.trim()) {
      active.notes = active.notes ? `${active.notes} | Fechamento: ${notes.trim()}` : notes.trim();
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'FECHAMENTO_CAIXA',
      'CAIXA',
      `Caixa ${active.id} fechado. Esperado em espécie: R$ ${expectedCash.toFixed(2)} • Conferido: R$ ${cleanCounted.toFixed(2)} • Diferença: R$ ${difference.toFixed(2)}.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('cash_registers', active, 'mapCashRegisterToSupabase');
    return active;
  }

  public adjustStudentAccountBalance(params: {
    studentId: string;
    operation: 'CREDITO' | 'DEBITO';
    amount: number;
    reason: string;
    user: { id: string; name: string; role: any };
  }): Student {
    const student = this.data.students.find(s => s.id === params.studentId);
    if (!student) throw new Error('Aluno/cliente não encontrado.');
    const cleanAmount = Math.round((Number(params.amount) || 0) * 100) / 100;
    if (cleanAmount <= 0) throw new Error('Informe um valor maior que zero.');
    const cleanReason = (params.reason || '').trim();
    if (cleanReason.length < 3) throw new Error('Informe o motivo do lançamento.');

    if (params.operation === 'CREDITO') {
      const currentCredit = Number(student.creditBalance) || 0;
      if (student.currentConsumptionBalance > 0) {
        const appliedToDebt = Math.min(student.currentConsumptionBalance, cleanAmount);
        student.currentConsumptionBalance = Math.round((student.currentConsumptionBalance - appliedToDebt) * 100) / 100;
        student.totalOpenDebt = Math.max(0, Math.round((student.totalOpenDebt - appliedToDebt) * 100) / 100);
        const leftover = Math.round((cleanAmount - appliedToDebt) * 100) / 100;
        student.creditBalance = Math.round((currentCredit + leftover) * 100) / 100;
      } else {
        student.creditBalance = Math.round((currentCredit + cleanAmount) * 100) / 100;
      }
    } else {
      student.currentConsumptionBalance = Math.round((student.currentConsumptionBalance + cleanAmount) * 100) / 100;
      student.totalOpenDebt = Math.round((student.totalOpenDebt + cleanAmount) * 100) / 100;
    }

    const nowIso = new Date().toISOString();
    const accountMovId = `CAM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    this.data.financialLedger.unshift({
      id: `LED-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      timestamp: nowIso,
      studentId: student.id,
      type: params.operation,
      category: params.operation === 'CREDITO' ? 'AJUSTE_CREDITO' : 'AJUSTE_DEBITO',
      amount: cleanAmount,
      description: `${params.operation === 'CREDITO' ? 'Crédito em conta' : 'Débito avulso'} - ${cleanReason}`,
      performedByUserName: params.user.name
    });

    this.logAudit(
      params.user.id,
      params.user.name,
      params.user.role,
      params.operation === 'CREDITO' ? 'CREDITO_CONTA_ALUNO' : 'DEBITO_CONTA_ALUNO',
      'VENDAS',
      `${params.operation} de R$ ${cleanAmount.toFixed(2)} para ${student.name}. Motivo: ${cleanReason}`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    this.triggerSupabaseSync(
      'customer_account_movements',
      {
        id: accountMovId,
        studentId: student.id,
        operation: params.operation,
        amount: cleanAmount,
        reason: cleanReason,
        performedByUserId: params.user.id,
        performedByUserName: params.user.name,
        createdAt: nowIso,
      },
      'mapCustomerAccountMovementToSupabase'
    );
    return student;
  }

  // 5. Salvar / Editar produto (garante que preços de vendas passadas não se alteram)
  public saveProduct(productData: Partial<Product>, user: { id: string; name: string; role: any }) {
    const parsePriceFields = (rawPrice: any, rawStatus?: any): { price: number | null; priceStatus: 'DEFINED' | 'PENDING' } => {
      const numeric = this.parseNumericPrice(rawPrice);

      // If a valid positive price was provided, always mark as DEFINED (even if a stale PENDING status came along)
      if (numeric !== null && numeric > 0) {
        return { price: Math.round(numeric * 100) / 100, priceStatus: 'DEFINED' };
      }

      if (numeric !== null && numeric < 0) {
        throw new Error('O preço do produto não pode ser negativo.');
      }

      if (rawStatus === 'PENDING' || rawPrice === null || rawPrice === undefined || rawPrice === '') {
        return { price: null, priceStatus: 'PENDING' };
      }

      if (numeric === 0) {
        throw new Error('Informe um preço maior que R$ 0,00 ou marque o produto como "Preço não definido".');
      }

      throw new Error('Informe um preço válido maior que R$ 0,00 ou marque o produto como "Preço não definido".');
    };

    const formatPriceLabel = (val: number | null | undefined, _status?: string) => {
      const num = this.parseNumericPrice(val);
      if (num === null || num <= 0) {
        return 'Preço não definido';
      }
      return `R$ ${num.toFixed(2)}`;
    };

    if (productData.id) {
      const idx = this.data.products.findIndex(p => p.id === productData.id);
      if (idx === -1) throw new Error('Produto não encontrado');

      const existing = this.data.products[idx];
      const oldPrice = existing.price;
      const oldPriceStatus = existing.priceStatus;
      const oldStock = existing.currentStock;

      const resolvedPrice =
        productData.price !== undefined || productData.priceStatus !== undefined
          ? parsePriceFields(
              productData.price !== undefined ? productData.price : existing.price,
              productData.priceStatus
            )
          : {
              price: existing.price,
              priceStatus: existing.priceStatus || (this.isPricePending(existing) ? 'PENDING' : 'DEFINED'),
            };

      const nextStock =
        productData.currentStock !== undefined ? Number(productData.currentStock) : existing.currentStock;
      if (Number.isNaN(nextStock) || nextStock < 0) {
        throw new Error('O estoque do produto não pode ser negativo.');
      }
      const nextMinStock =
        productData.minStock !== undefined ? Math.max(1, Number(productData.minStock) || 1) : existing.minStock;

      const images: string[] = Array.isArray(productData.images)
        ? productData.images.filter(Boolean).slice(0, 3)
        : (existing.images || (productData.imageUrl ? [productData.imageUrl] : []));

      const nextCategory = productData.category
        ? this.normalizeCategory(productData.category)
        : existing.category;

      this.data.products[idx] = {
        ...existing,
        ...productData,
        category: nextCategory,
        price: resolvedPrice.price,
        priceStatus: resolvedPrice.priceStatus,
        currentStock: nextStock,
        minStock: nextMinStock,
        images,
        imageUrl: images[0] || productData.imageUrl || existing.imageUrl || undefined,
        updatedAt: new Date().toISOString()
      };

      let editStockMov: StockMovement | null = null;
      if (nextStock !== oldStock) {
        editStockMov = {
          id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          productId: existing.id,
          productName: this.data.products[idx].name,
          type: 'AJUSTE_MANUAL',
          quantity: nextStock - oldStock,
          previousStock: oldStock,
          newStock: nextStock,
          reason: 'Atualização via edição de cadastro do produto',
          performedByUserId: user.id,
          performedByUserName: user.name,
          timestamp: new Date().toISOString()
        };
        this.data.stockMovements.unshift(editStockMov);
      }

      this.logAudit(
        user.id,
        user.name,
        user.role,
        'EDITAR_PRODUTO',
        'ESTOQUE',
        `Produto ${this.data.products[idx].name} editado. Preço anterior: ${formatPriceLabel(oldPrice, oldPriceStatus)}, Novo preço: ${formatPriceLabel(this.data.products[idx].price, this.data.products[idx].priceStatus)}`
      );

      this.saveDatabase();
      this.triggerSupabaseSync('products', this.data.products[idx], 'mapProductToSupabase');
      if (editStockMov) {
        this.triggerSupabaseSync('stock_movements', editStockMov, 'mapStockMovementToSupabase');
      }
      return this.data.products[idx];
    } else {
      const resolvedPrice = parsePriceFields(productData.price, productData.priceStatus);
      const initialStock = Number(productData.currentStock) || 0;
      if (initialStock < 0) {
        throw new Error('O estoque inicial não pode ser negativo.');
      }
      const minStock = Math.max(1, Number(productData.minStock) || 5);

      const images: string[] = Array.isArray(productData.images)
        ? productData.images.filter(Boolean).slice(0, 3)
        : (productData.imageUrl ? [productData.imageUrl] : []);

      let generatedId = `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      while (this.data.products.some(p => p.id === generatedId)) {
        generatedId = `prod-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      }

      const newProduct: Product = {
        id: generatedId,
        name: productData.name?.trim() || 'Novo Produto',
        category: this.normalizeCategory(productData.category),
        price: resolvedPrice.price,
        priceStatus: resolvedPrice.priceStatus,
        internalCode: productData.internalCode || `INT-${Math.floor(Math.random() * 9000 + 1000)}`,
        barcode: productData.barcode || undefined,
        currentStock: initialStock,
        minStock,
        status: productData.status || 'ACTIVE',
        archived: false,
        images,
        imageUrl: images[0] || productData.imageUrl || undefined,
        unit: productData.unit || 'un',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.data.products.push(newProduct);
      this.logAudit(
        user.id,
        user.name,
        user.role,
        'CRIAR_PRODUTO',
        'ESTOQUE',
        `Novo produto cadastrado: ${newProduct.name} (${formatPriceLabel(newProduct.price, newProduct.priceStatus)}) com estoque inicial de ${newProduct.currentStock}`
      );

      this.saveDatabase();
      this.triggerSupabaseSync('products', newProduct, 'mapProductToSupabase');
      return newProduct;
    }
  }

  // ============================================================================
  // 6. MOTOR UNIFICADO DE FATURAMENTO (INDIVIDUAL, PERÍODO PERSONALIZADO E FECHAMENTO MENSAL)
  // ============================================================================

  private roundCurrency(value: number): number {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  private toSaoPauloDate(isoOrDate?: string | null): string {
    if (!isoOrDate) return '';
    const trimmed = String(isoOrDate).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const dt = new Date(trimmed);
    if (Number.isNaN(dt.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(dt);
  }

  private toSaoPauloPeriod(isoOrDate?: string | null): string {
    const spDate = this.toSaoPauloDate(isoOrDate);
    return spDate ? spDate.slice(0, 7) : '';
  }

  private getMonthBounds(period: string): { periodStart: string; periodEnd: string } {
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new Error(`Competência mensal inválida: "${period}". Utilize o formato AAAA-MM.`);
    }
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (month < 1 || month > 12) {
      throw new Error(`Mês inválido na competência "${period}".`);
    }
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      periodStart: `${yearStr}-${monthStr}-01`,
      periodEnd: `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`
    };
  }

  private computeDefaultDueDate(periodEnd: string, mode: BillingBatchType, billingPeriod?: string): string {
    const offset = Math.max(1, Math.min(28, Number(this.data.settings.dueDayOffset) || 10));
    if (mode === 'FECHAMENTO_MENSAL' && billingPeriod && /^\d{4}-\d{2}$/.test(billingPeriod)) {
      const [yStr, mStr] = billingPeriod.split('-');
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const nextMonth = m === 12 ? 1 : m + 1;
      const nextYear = m === 12 ? y + 1 : y;
      const lastDayNext = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
      return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(Math.min(offset, lastDayNext)).padStart(2, '0')}`;
    }
    const base = new Date(`${periodEnd}T12:00:00Z`);
    if (Number.isNaN(base.getTime())) {
      return this.toSaoPauloDate(new Date(Date.now() + offset * 86400000).toISOString());
    }
    base.setUTCDate(base.getUTCDate() + offset);
    return base.toISOString().slice(0, 10);
  }

  private getClosedPeriodsSet(): Set<string> {
    const set = new Set<string>();
    for (const batch of this.getBillingBatches()) {
      if (batch.type === 'FECHAMENTO_MENSAL' && batch.status !== 'CANCELADO' && batch.billingPeriod) {
        set.add(batch.billingPeriod);
      }
    }
    for (const inv of this.data.invoices) {
      if (inv.status !== 'CANCELADA' && (!inv.billingType || inv.billingType === 'FECHAMENTO_MENSAL') && inv.billingPeriod) {
        set.add(inv.billingPeriod);
      }
    }
    return set;
  }

  private getActiveInvoiceAllocations(sale: Sale): SaleInvoiceAllocation[] {
    const activeInvoiceIds = new Set(
      this.data.invoices.filter(i => i.status !== 'CANCELADA').map(i => i.id)
    );

    if (Array.isArray(sale.invoiceAllocations) && sale.invoiceAllocations.length > 0) {
      return sale.invoiceAllocations.filter(alloc => activeInvoiceIds.has(alloc.invoiceId));
    }

    // Compatibilidade com vendas faturadas antes do rastreamento granular
    if (sale.invoiceId && activeInvoiceIds.has(sale.invoiceId)) {
      return [
        {
          invoiceId: sale.invoiceId,
          amount: this.roundCurrency(sale.total),
          items: (sale.items || []).map((item, idx) => ({
            itemIndex: idx,
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: this.roundCurrency(item.subtotal)
          })),
          allocatedAt: sale.createdAt
        }
      ];
    }

    return [];
  }

  private getItemNetFactor(sale: Sale): number {
    const rawItemsSum = (sale.items || []).reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0);
    if (rawItemsSum <= 0) return 1;
    const netTarget = Math.max(0, Number(sale.total) || 0);
    if (Math.abs(rawItemsSum - netTarget) < 0.01) return 1;
    return netTarget / rawItemsSum;
  }

  public evaluateSaleBilling(sale: Sale): BillingPreviewSale {
    const saoPauloDate = this.toSaoPauloDate(sale.createdAt) || this.toSaoPauloDate(new Date().toISOString());
    const paymentMethod: PaymentMethod = sale.paymentMethod || 'CONTA_ALUNO';
    const isAccountSale = paymentMethod === 'CONTA_ALUNO';
    const reversedAmount = sale.status === 'REVERSED' ? this.roundCurrency(sale.total) : this.roundCurrency(sale.reversedAmount || 0);
    const activeAllocations = this.getActiveInvoiceAllocations(sale);
    const factor = this.getItemNetFactor(sale);

    const billedQtyByItemIndex = new Map<number, number>();
    let alreadyBilledAmount = 0;

    for (const alloc of activeAllocations) {
      alreadyBilledAmount = this.roundCurrency(alreadyBilledAmount + alloc.amount);
      for (const allocItem of alloc.items || []) {
        const prev = billedQtyByItemIndex.get(allocItem.itemIndex) || 0;
        billedQtyByItemIndex.set(allocItem.itemIndex, prev + allocItem.quantity);
      }
    }

    const previewItems: BillingPreviewSaleItem[] = (sale.items || []).map((item, idx) => {
      const origQty = Number(item.quantity) || 0;
      const billedQty = Math.min(origQty, billedQtyByItemIndex.get(idx) || 0);
      const remQty = Math.max(0, origQty - billedQty);
      const effectiveUnitPrice = this.roundCurrency((Number(item.unitPrice) || 0) * factor);
      const origSub = this.roundCurrency((Number(item.subtotal) || origQty * Number(item.unitPrice || 0)) * factor);
      const remAmt = remQty === origQty
        ? origSub
        : remQty === 0
          ? 0
          : this.roundCurrency(remQty * effectiveUnitPrice);
      return {
        itemIndex: idx,
        productId: item.productId,
        name: item.name,
        category: item.category,
        unitPrice: effectiveUnitPrice,
        originalQuantity: origQty,
        alreadyBilledQuantity: billedQty,
        remainingQuantity: remQty,
        originalSubtotal: origSub,
        remainingAmount: remAmt
      };
    });

    if (
      sale.status === 'CANCELLED' ||
      sale.status === 'INCONSISTENTE' ||
      sale.status === 'FAILED' ||
      sale.status === 'PENDING'
    ) {
      return {
        saleId: sale.id,
        createdAt: sale.createdAt,
        saoPauloDate,
        billingPeriod: this.toSaoPauloPeriod(sale.createdAt) || sale.billingPeriod,
        origin: sale.origin || 'LOJINHA',
        paymentMethod,
        billingStatus: 'CANCELADA',
        originalTotal: this.roundCurrency(sale.total),
        reversedAmount: 0,
        alreadyBilledAmount: 0,
        remainingBillableAmount: 0,
        isEligible: false,
        ineligibleReason: sale.integrityReason || `Status ${sale.status} (inelegível para faturamento)`,
        items: previewItems.map(it => ({ ...it, remainingQuantity: 0, remainingAmount: 0 }))
      };
    }

    if (sale.status === 'REVERSED') {
      return {
        saleId: sale.id,
        createdAt: sale.createdAt,
        saoPauloDate,
        billingPeriod: this.toSaoPauloPeriod(sale.createdAt) || sale.billingPeriod,
        origin: sale.origin || 'LOJINHA',
        paymentMethod,
        billingStatus: 'ESTORNADA',
        originalTotal: this.roundCurrency(sale.total),
        reversedAmount,
        alreadyBilledAmount: 0,
        remainingBillableAmount: 0,
        isEligible: false,
        ineligibleReason: `Estornada no PDV${sale.reversedReason ? `: ${sale.reversedReason}` : ''}`,
        items: previewItems.map(it => ({ ...it, remainingQuantity: 0, remainingAmount: 0 }))
      };
    }

    if (!isAccountSale) {
      return {
        saleId: sale.id,
        createdAt: sale.createdAt,
        saoPauloDate,
        billingPeriod: this.toSaoPauloPeriod(sale.createdAt) || sale.billingPeriod,
        origin: sale.origin || 'LOJINHA',
        paymentMethod,
        billingStatus: 'TOTALMENTE_FATURADA',
        originalTotal: this.roundCurrency(sale.total),
        reversedAmount: 0,
        alreadyBilledAmount: this.roundCurrency(sale.total),
        remainingBillableAmount: 0,
        isEligible: false,
        ineligibleReason: `Pago no ato (${paymentMethod})`,
        items: previewItems.map(it => ({ ...it, remainingQuantity: 0, remainingAmount: 0 }))
      };
    }

    const maxRemainingNet = Math.max(0, this.roundCurrency(sale.total - reversedAmount - alreadyBilledAmount));
    const hasRemainingQty = previewItems.some(it => it.remainingQuantity > 0);
    const remainingBillableAmount = hasRemainingQty ? maxRemainingNet : 0;

    let billingStatus: SaleBillingStatus = 'AGUARDANDO_FATURAMENTO';
    if (remainingBillableAmount <= 0 && alreadyBilledAmount > 0) {
      billingStatus = 'TOTALMENTE_FATURADA';
    } else if (remainingBillableAmount > 0 && alreadyBilledAmount > 0) {
      billingStatus = 'PARCIALMENTE_FATURADA';
    } else if (sale.total <= 0) {
      billingStatus = 'CANCELADA';
    }

    // Ajustar arredondamento do último item remanescente para fechar exatamente com remainingBillableAmount
    if (remainingBillableAmount > 0) {
      const remItems = previewItems.filter(it => it.remainingQuantity > 0);
      const sumRem = this.roundCurrency(remItems.reduce((acc, it) => acc + it.remainingAmount, 0));
      const diff = this.roundCurrency(remainingBillableAmount - sumRem);
      if (remItems.length > 0 && Math.abs(diff) > 0 && Math.abs(diff) <= 0.1) {
        remItems[remItems.length - 1].remainingAmount = this.roundCurrency(
          Math.max(0, remItems[remItems.length - 1].remainingAmount + diff)
        );
      }
    }

    return {
      saleId: sale.id,
      createdAt: sale.createdAt,
      saoPauloDate,
      billingPeriod: this.toSaoPauloPeriod(sale.createdAt) || sale.billingPeriod,
      origin: sale.origin || 'LOJINHA',
      paymentMethod,
      billingStatus,
      originalTotal: this.roundCurrency(sale.total),
      reversedAmount,
      alreadyBilledAmount,
      remainingBillableAmount,
      isEligible: remainingBillableAmount > 0,
      ineligibleReason:
        remainingBillableAmount <= 0
          ? billingStatus === 'TOTALMENTE_FATURADA'
            ? 'Venda já faturada integralmente'
            : 'Sem saldo faturável'
          : undefined,
      items: previewItems
    };
  }

  private syncSaleBillingState(sale: Sale) {
    const activeAllocs = this.getActiveInvoiceAllocations(sale);
    const totalBilled = this.roundCurrency(activeAllocs.reduce((acc, a) => acc + a.amount, 0));
    sale.invoiceAllocations = activeAllocs.length > 0 ? activeAllocs : undefined;
    sale.billedAmount = totalBilled > 0 ? totalBilled : undefined;

    if (sale.status === 'REVERSED') {
      sale.billingStatus = 'ESTORNADA';
      sale.invoiceId = undefined;
      return;
    }

    const remaining = Math.max(0, this.roundCurrency(sale.total - (sale.reversedAmount || 0) - totalBilled));
    if (remaining <= 0 && totalBilled > 0) {
      sale.billingStatus = 'TOTALMENTE_FATURADA';
      sale.invoiceId = activeAllocs[activeAllocs.length - 1]?.invoiceId;
    } else if (remaining > 0 && totalBilled > 0) {
      sale.billingStatus = 'PARCIALMENTE_FATURADA';
      sale.invoiceId = undefined;
    } else {
      sale.billingStatus = 'AGUARDANDO_FATURAMENTO';
      sale.invoiceId = undefined;
    }
  }

  private recalculateStudentBalances(student: Student) {
    let unbilledTotal = 0;
    for (const sale of this.data.sales) {
      if (sale.studentId !== student.id) continue;
      const evalSale = this.evaluateSaleBilling(sale);
      if (evalSale.isEligible) {
        unbilledTotal = this.roundCurrency(unbilledTotal + evalSale.remainingBillableAmount);
      }
    }
    student.currentConsumptionBalance = unbilledTotal;

    const openInvoicesTotal = this.data.invoices
      .filter(i => i.studentId === student.id && i.status !== 'CANCELADA' && i.status !== 'PAGA')
      .reduce((acc, inv) => acc + inv.remainingBalance, 0);
    student.totalOpenDebt = this.roundCurrency(openInvoicesTotal + unbilledTotal);
  }

  private buildConsumptionSummaryItems(links: InvoiceSaleItemLink[]): Invoice['consumptionItems'] {
    const itemMap = new Map<string, { product: Product | undefined; name: string; category: any; qty: number; total: number }>();
    for (const link of links) {
      const sale = this.data.sales.find(s => s.id === link.saleId);
      const isTripSale = sale?.origin === 'PDV_PASSEIOS';
      const formattedTripDate = sale?.tripDate ? sale.tripDate.split('-').reverse().join('/') : '';
      const tripPrefix = isTripSale && sale?.tripName
        ? `[${sale.tripName}${formattedTripDate ? ` — ${formattedTripDate}` : ''}] `
        : '';
      const saleItem = sale?.items?.[link.itemIndex];
      const baseCategory = saleItem?.category || 'Alimentos e Snacks';
      const key = isTripSale ? `${link.saleId}_${link.productId}_${link.itemIndex}` : link.productId;
      const displayName = `${tripPrefix}${link.productName}`;
      const current = itemMap.get(key) || {
        product: this.data.products.find(p => p.id === link.productId),
        name: displayName,
        category: isTripSale ? `PDV de Passeios • ${baseCategory}` : baseCategory,
        qty: 0,
        total: 0
      };
      current.qty += link.quantity;
      current.total = this.roundCurrency(current.total + link.subtotal);
      itemMap.set(key, current);
    }

    return Array.from(itemMap.entries()).map(([productId, data]) => ({
      productId,
      productName: data.name,
      category: data.category,
      quantity: data.qty,
      averageUnitPrice: data.qty > 0 ? this.roundCurrency(data.total / data.qty) : 0,
      totalAmount: this.roundCurrency(data.total)
    }));
  }

  private generateUniqueInvoiceId(prefixPeriod: string, registrationNumber: string): string {
    const cleanReg = (registrationNumber || 'ALUNO').replace(/[^a-zA-Z0-9]/g, '');
    const base = `FAT-${prefixPeriod.replace(/[^0-9]/g, '')}-${cleanReg}`;
    const existingIds = new Set(this.data.invoices.map(i => i.id));
    if (!existingIds.has(base)) return base;
    let seq = 2;
    while (existingIds.has(`${base}-${String(seq).padStart(2, '0')}`)) {
      seq += 1;
    }
    return `${base}-${String(seq).padStart(2, '0')}`;
  }

  private generateBatchId(type: BillingBatchType): string {
    const prefixMap: Record<BillingBatchType, string> = {
      INDIVIDUAL: 'LOT-IND',
      PERIODO_PERSONALIZADO: 'LOT-PER',
      FECHAMENTO_MENSAL: 'LOT-MES'
    };
    const dateSlug = this.toSaoPauloDate(new Date().toISOString()).replace(/-/g, '');
    const seq = String(this.getBillingBatches().length + 1).padStart(3, '0');
    const rand = Math.floor(100 + Math.random() * 900);
    return `${prefixMap[type]}-${dateSlug}-${seq}-${rand}`;
  }

  public getUnbilledConsumptionOverview(): UnbilledConsumptionOverview {
    const closedPeriodsSet = this.getClosedPeriodsSet();
    const closedPeriods = Array.from(closedPeriodsSet).sort().reverse();

    let totalUnbilledAmount = 0;
    let totalPartiallyBilledAmount = 0;
    let unbilledSalesCount = 0;
    let partiallyBilledSalesCount = 0;
    let billedSalesCount = 0;
    let reversedOrCanceledSalesCount = 0;
    let retroactiveClosedPeriodSalesCount = 0;
    let retroactiveClosedPeriodAmount = 0;

    const studentAgg = new Map<string, UnbilledConsumptionOverview['byStudent'][number]>();
    const unbilledSales: BillingPreviewSale[] = [];

    for (const sale of this.data.sales) {
      const paymentMethod = sale.paymentMethod || 'CONTA_ALUNO';
      if (sale.status === 'REVERSED') {
        reversedOrCanceledSalesCount += 1;
        continue;
      }
      if (paymentMethod !== 'CONTA_ALUNO') {
        continue;
      }

      const evalSale = this.evaluateSaleBilling(sale);
      if (evalSale.billingStatus === 'TOTALMENTE_FATURADA') {
        billedSalesCount += 1;
        continue;
      }
      if (evalSale.billingStatus === 'CANCELADA') {
        reversedOrCanceledSalesCount += 1;
        continue;
      }
      if (!evalSale.isEligible) {
        continue;
      }

      unbilledSales.push(evalSale);
      if (evalSale.billingStatus === 'PARCIALMENTE_FATURADA') {
        partiallyBilledSalesCount += 1;
        totalPartiallyBilledAmount = this.roundCurrency(totalPartiallyBilledAmount + evalSale.remainingBillableAmount);
      } else {
        unbilledSalesCount += 1;
      }
      totalUnbilledAmount = this.roundCurrency(totalUnbilledAmount + evalSale.remainingBillableAmount);

      const saleSpPeriod = evalSale.saoPauloDate.slice(0, 7);
      const isRetroactive = closedPeriodsSet.has(saleSpPeriod);
      if (isRetroactive) {
        retroactiveClosedPeriodSalesCount += 1;
        retroactiveClosedPeriodAmount = this.roundCurrency(retroactiveClosedPeriodAmount + evalSale.remainingBillableAmount);
      }

      const student = this.data.students.find(s => s.id === sale.studentId);
      const existing = studentAgg.get(sale.studentId) || {
        studentId: sale.studentId,
        studentName: student?.name || sale.studentName,
        registrationNumber: student?.registrationNumber || sale.registrationNumber,
        classGroup: student?.classGroup || '10ª Turma',
        hasGuardian: Boolean(student && student.guardians && student.guardians.length > 0),
        unbilledSalesCount: 0,
        unbilledAmount: 0,
        oldestSaleDate: evalSale.saoPauloDate,
        newestSaleDate: evalSale.saoPauloDate,
        hasRetroactiveClosedPeriodSale: false
      };

      existing.unbilledSalesCount += 1;
      existing.unbilledAmount = this.roundCurrency(existing.unbilledAmount + evalSale.remainingBillableAmount);
      if (evalSale.saoPauloDate < existing.oldestSaleDate) existing.oldestSaleDate = evalSale.saoPauloDate;
      if (evalSale.saoPauloDate > existing.newestSaleDate) existing.newestSaleDate = evalSale.saoPauloDate;
      if (isRetroactive) existing.hasRetroactiveClosedPeriodSale = true;
      studentAgg.set(sale.studentId, existing);
    }

    const byStudent = Array.from(studentAgg.values()).sort((a, b) => b.unbilledAmount - a.unbilledAmount);

    return {
      totalUnbilledAmount,
      totalPartiallyBilledAmount,
      unbilledSalesCount,
      partiallyBilledSalesCount,
      billedSalesCount,
      reversedOrCanceledSalesCount,
      studentsWithUnbilledCount: byStudent.length,
      retroactiveClosedPeriodSalesCount,
      retroactiveClosedPeriodAmount,
      closedPeriods,
      byStudent,
      unbilledSales
    };
  }

  public previewPeriodBilling(payload: PeriodBillingPayload): BillingBatchPreview {
    const mode = payload.mode || 'FECHAMENTO_MENSAL';
    let billingPeriod = payload.billingPeriod || this.toSaoPauloPeriod(new Date().toISOString());
    let periodStart = payload.periodStart || '';
    let periodEnd = payload.periodEnd || '';

    if (mode === 'FECHAMENTO_MENSAL') {
      const bounds = this.getMonthBounds(billingPeriod);
      periodStart = bounds.periodStart;
      periodEnd = bounds.periodEnd;
    } else {
      if (!periodStart || !periodEnd) {
        throw new Error('Informe a data inicial e a data final do período de consumo.');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
        throw new Error('Datas de período inválidas. Use o formato AAAA-MM-DD.');
      }
      if (periodStart > periodEnd) {
        throw new Error('A data inicial não pode ser posterior à data final.');
      }
      billingPeriod = payload.billingPeriod || periodEnd.slice(0, 7);
    }

    const dueDate = payload.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)
      ? payload.dueDate
      : this.computeDefaultDueDate(periodEnd, mode, billingPeriod);

    const scope = payload.scope || 'ALL_STUDENTS';
    const activeStudents = this.data.students.filter(s => s.status === 'ACTIVE');

    let targetStudents: Student[] = activeStudents;
    if (scope === 'CLASS_GROUP' && payload.classGroup) {
      targetStudents = activeStudents.filter(s => s.classGroup === payload.classGroup);
    } else if (scope === 'MANUAL_SELECTION') {
      const allowedSet = new Set(payload.studentIds || []);
      targetStudents = activeStudents.filter(s => allowedSet.has(s.id));
    } else if (scope === 'EXCLUDE_STUDENTS') {
      const excludedSet = new Set(payload.excludedStudentIds || []);
      targetStudents = activeStudents.filter(s => !excludedSet.has(s.id));
    }

    const closedPeriodsSet = this.getClosedPeriodsSet();
    const closedPeriodAlreadyProcessed = mode === 'FECHAMENTO_MENSAL' && closedPeriodsSet.has(billingPeriod);
    const existingMonthlyInvoices = this.data.invoices.filter(
      i =>
        i.billingPeriod === billingPeriod &&
        i.status !== 'CANCELADA' &&
        (!i.billingType || i.billingType === 'FECHAMENTO_MENSAL')
    );

    const isTuitionEnabled = Boolean(this.data.settings.tuitionBillingActive);
    const inconsistencies: BillingBatchPreview['inconsistencies'] = [];
    const studentsPreview: BillingStudentPreviewItem[] = [];

    let totalTuitions = 0;
    let totalConsumptions = 0;
    let grossPurchasesTotal = 0;
    let reversalsTotal = 0;
    let alreadyBilledTotal = 0;
    let netBillableTotal = 0;
    let validSalesCount = 0;
    let alreadyBilledSalesCount = 0;
    let ineligibleSalesCount = 0;
    let invoicesToCreateCount = 0;
    let studentsWithBillableConsumptionCount = 0;
    let retroactiveSalesInClosedPeriodCount = 0;
    let studentsMissingGuardianCount = 0;

    for (const student of targetStudents) {
      const salesInPeriod = this.data.sales
        .filter(s => {
          if (s.studentId !== student.id) return false;
          const spDate = this.toSaoPauloDate(s.createdAt);
          return spDate >= periodStart && spDate <= periodEnd;
        })
        .map(s => this.evaluateSaleBilling(s));

      let studentGross = 0;
      let studentReversals = 0;
      let studentAlreadyBilled = 0;
      let studentNet = 0;
      let studentEligibleCount = 0;
      let studentAlreadyCount = 0;
      let studentIneligibleCount = 0;

      for (const sEval of salesInPeriod) {
        if (sEval.billingStatus === 'ESTORNADA') {
          studentReversals = this.roundCurrency(studentReversals + sEval.reversedAmount);
          studentIneligibleCount += 1;
          continue;
        }
        if (sEval.paymentMethod !== 'CONTA_ALUNO') {
          studentIneligibleCount += 1;
          continue;
        }
        studentGross = this.roundCurrency(studentGross + sEval.originalTotal);
        studentAlreadyBilled = this.roundCurrency(studentAlreadyBilled + sEval.alreadyBilledAmount);

        if (sEval.isEligible) {
          studentNet = this.roundCurrency(studentNet + sEval.remainingBillableAmount);
          studentEligibleCount += 1;
          const spMonth = sEval.saoPauloDate.slice(0, 7);
          if (closedPeriodsSet.has(spMonth)) {
            retroactiveSalesInClosedPeriodCount += 1;
          }
        } else if (sEval.billingStatus === 'TOTALMENTE_FATURADA') {
          studentAlreadyCount += 1;
        } else {
          studentIneligibleCount += 1;
        }
      }

      const existingMonthly = mode === 'FECHAMENTO_MENSAL'
        ? existingMonthlyInvoices.find(i => i.studentId === student.id)
        : undefined;

      const tuitionAmount = isTuitionEnabled ? (Number(student.defaultTuition) || 0) : 0;
      const grossToBill = this.roundCurrency(tuitionAmount + studentNet);
      const willGenerateInvoice =
        grossToBill > 0 &&
        !(mode === 'FECHAMENTO_MENSAL' && existingMonthly);

      const warnings: string[] = [];
      const blockers: string[] = [];

      if (existingMonthly && mode === 'FECHAMENTO_MENSAL') {
        const msg = studentNet > 0
          ? `Já possui fatura de fechamento mensal (${existingMonthly.id}) em ${billingPeriod}, mas há R$ ${studentNet.toFixed(2)} de consumo retroativo não faturado. Use Lançar Fatura ou Período Personalizado para cobrança complementar.`
          : `O aluno já possui cobrança de fechamento mensal gerada para ${billingPeriod} (${existingMonthly.id}). Não será duplicada.`;
        warnings.push(msg);
        inconsistencies.push({
          studentId: student.id,
          studentName: student.name,
          severity: 'WARNING',
          message: msg
        });
      }

      const hasGuardian = Boolean(student.guardians && student.guardians.length > 0);
      if (!hasGuardian) {
        studentsMissingGuardianCount += 1;
        const requiresGuardian = student.payerRule === 'GUARDIAN' || student.payerRule === 'GUARDIAN_ONLY';
        if (requiresGuardian && (willGenerateInvoice || mode === 'FECHAMENTO_MENSAL')) {
          const msg = `Aluno configurado como 'Pagamento Exclusivo pelo Responsável', mas não possui responsável vinculado.`;
          blockers.push(msg);
          inconsistencies.push({
            studentId: student.id,
            studentName: student.name,
            severity: 'BLOCKER',
            message: msg
          });
        } else if (willGenerateInvoice) {
          const msg = `Aluno sem responsável financeiro vinculado — cobrança será emitida diretamente para o aluno.`;
          warnings.push(msg);
          inconsistencies.push({
            studentId: student.id,
            studentName: student.name,
            severity: 'WARNING',
            message: msg
          });
        }
      }

      if (studentNet > 0) studentsWithBillableConsumptionCount += 1;
      if (willGenerateInvoice) {
        invoicesToCreateCount += 1;
        totalTuitions = this.roundCurrency(totalTuitions + tuitionAmount);
        totalConsumptions = this.roundCurrency(totalConsumptions + studentNet);
        netBillableTotal = this.roundCurrency(netBillableTotal + studentNet);
      }

      grossPurchasesTotal = this.roundCurrency(grossPurchasesTotal + studentGross);
      reversalsTotal = this.roundCurrency(reversalsTotal + studentReversals);
      alreadyBilledTotal = this.roundCurrency(alreadyBilledTotal + studentAlreadyBilled);
      validSalesCount += studentEligibleCount;
      alreadyBilledSalesCount += studentAlreadyCount;
      ineligibleSalesCount += studentIneligibleCount;

      const guardiansSummary = hasGuardian
        ? student.guardians.map(g => `${g.guardianName || 'Responsável'} (${g.relationship})`).join(', ')
        : 'Sem responsável vinculado';

      studentsPreview.push({
        studentId: student.id,
        studentName: student.name,
        registrationNumber: student.registrationNumber,
        classGroup: student.classGroup,
        guardiansSummary,
        hasGuardian,
        payerRule: student.payerRule,
        tuitionAmount,
        grossPurchasesTotal: studentGross,
        reversalsTotal: studentReversals,
        alreadyBilledTotal: studentAlreadyBilled,
        netConsumptionToBill: studentNet,
        grossTotalToBill: grossToBill,
        eligibleSalesCount: studentEligibleCount,
        alreadyBilledSalesCount: studentAlreadyCount,
        ineligibleSalesCount: studentIneligibleCount,
        sales: salesInPeriod,
        willGenerateInvoice,
        existingInvoiceId: existingMonthly?.id,
        warnings,
        blockers
      });
    }

    const totalGrossToBill = this.roundCurrency(totalTuitions + totalConsumptions);

    return {
      mode,
      billingPeriod,
      periodStart,
      periodEnd,
      dueDate,
      billingLabel: payload.billingLabel,
      scope,
      studentsCount: targetStudents.length,
      studentsWithBillableConsumptionCount,
      invoicesToCreateCount,
      validSalesCount,
      alreadyBilledSalesCount,
      ineligibleSalesCount,
      grossPurchasesTotal,
      reversalsTotal,
      alreadyBilledTotal,
      netBillableTotal,
      totalTuitions,
      totalConsumptions,
      totalGrossToBill,
      existingInvoicesCount: existingMonthlyInvoices.length,
      closedPeriodAlreadyProcessed,
      retroactiveSalesInClosedPeriodCount,
      studentsMissingGuardianCount,
      students: studentsPreview,
      inconsistencies,
      canProceed: !inconsistencies.some(inc => inc.severity === 'BLOCKER')
    };
  }

  public executePeriodBilling(
    payload: PeriodBillingPayload,
    user: { id: string; name: string; role: any }
  ): {
    batch: BillingBatch;
    invoicesCreated: number;
    invoices: Invoice[];
    period: string;
    deduplicated?: boolean;
  } {
    // 1. Idempotência por chave de lote
    if (payload.idempotencyKey) {
      const existingBatch = this.getBillingBatches().find(b => b.idempotencyKey === payload.idempotencyKey);
      if (existingBatch) {
        const existingInvs = this.data.invoices.filter(i => existingBatch.invoiceIds.includes(i.id));
        return {
          batch: existingBatch,
          invoicesCreated: existingInvs.length,
          invoices: existingInvs,
          period: existingBatch.billingPeriod,
          deduplicated: true
        };
      }
    }

    const preview = this.previewPeriodBilling(payload);
    if (!preview.canProceed) {
      const firstBlocker = preview.inconsistencies.find(i => i.severity === 'BLOCKER');
      throw new Error(firstBlocker?.message || 'Não é possível emitir o faturamento devido a inconsistências impeditivas.');
    }

    const candidates = preview.students.filter(s => s.willGenerateInvoice && s.grossTotalToBill > 0);
    if (candidates.length === 0) {
      throw new Error(
        `Nenhuma cobrança com saldo positivo elegível encontrada no período ${preview.periodStart} a ${preview.periodEnd}.`
      );
    }

    const batchId = this.generateBatchId(preview.mode);
    const nowIso = new Date().toISOString();
    const createdInvoices: Invoice[] = [];
    let totalBatchSalesCount = 0;

    for (const studentPreview of candidates) {
      const student = this.data.students.find(s => s.id === studentPreview.studentId);
      if (!student) continue;

      const eligibleSales = studentPreview.sales.filter(s => s.isEligible && s.remainingBillableAmount > 0);
      const itemLinks: InvoiceSaleItemLink[] = [];
      const salesIds: string[] = [];

      const invoiceId = this.generateUniqueInvoiceId(
        preview.mode === 'FECHAMENTO_MENSAL' ? preview.billingPeriod : preview.periodEnd,
        student.registrationNumber
      );

      for (const sEval of eligibleSales) {
        const sale = this.data.sales.find(x => x.id === sEval.saleId);
        if (!sale) continue;

        const allocItems: SaleAllocatedItem[] = [];
        for (const it of sEval.items) {
          if (it.remainingQuantity <= 0) continue;
          allocItems.push({
            itemIndex: it.itemIndex,
            productId: it.productId,
            name: it.name,
            quantity: it.remainingQuantity,
            unitPrice: it.unitPrice,
            amount: it.remainingAmount
          });
          itemLinks.push({
            saleId: sale.id,
            saleDate: sale.createdAt,
            itemIndex: it.itemIndex,
            productId: it.productId,
            productName: it.name,
            quantity: it.remainingQuantity,
            unitPrice: it.unitPrice,
            subtotal: it.remainingAmount
          });
        }

        if (allocItems.length > 0) {
          if (!Array.isArray(sale.invoiceAllocations)) sale.invoiceAllocations = [];
          sale.invoiceAllocations.push({
            invoiceId,
            batchId,
            amount: sEval.remainingBillableAmount,
            items: allocItems,
            allocatedAt: nowIso
          });
          salesIds.push(sale.id);
        }
      }

      totalBatchSalesCount += salesIds.length;
      const consumptionItems = this.buildConsumptionSummaryItems(itemLinks);

      const pixCode = generateBacenPixPayload({
        pixKey: this.data.settings.pixKey,
        receiverName: this.data.settings.pixReceiverName,
        city: this.data.settings.pixCity,
        amount: studentPreview.grossTotalToBill,
        txId: invoiceId
      });

      const historyEntry: InvoiceHistoryEntry = {
        id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: nowIso,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: preview.mode === 'FECHAMENTO_MENSAL' ? 'EMISSAO_FECHAMENTO_MENSAL' : 'EMISSAO_LOTE_PERIODO',
        details: `Fatura emitida no lote ${batchId} (${preview.periodStart} a ${preview.periodEnd}) com ${salesIds.length} venda(s) totalizando R$ ${studentPreview.grossTotalToBill.toFixed(2)}.`
      };

      const invoice: Invoice = {
        id: invoiceId,
        studentId: student.id,
        studentName: student.name,
        registrationNumber: student.registrationNumber,
        classGroup: student.classGroup,
        billingPeriod: preview.billingPeriod,
        billingType: preview.mode,
        batchId,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        billingLabel: preview.billingLabel || (preview.mode === 'PERIODO_PERSONALIZADO' ? `${preview.periodStart} a ${preview.periodEnd}` : undefined),
        tuitionAmount: studentPreview.tuitionAmount,
        canteenConsumptionTotal: studentPreview.netConsumptionToBill,
        previousBalance: 0,
        adjustmentsTotal: 0,
        grossTotal: studentPreview.grossTotalToBill,
        paidTotal: 0,
        remainingBalance: studentPreview.grossTotalToBill,
        closingDate: preview.periodEnd,
        dueDate: preview.dueDate,
        status: 'PUBLICADA',
        salesIds,
        saleItemLinks: itemLinks,
        consumptionItems,
        paymentAllocations: [],
        pixCopyPasteCode: pixCode,
        pixQrCodePayload: pixCode,
        approvedByUserName: user.name,
        approvedAt: nowIso,
        publishedAt: nowIso,
        notes: payload.notes?.trim() || undefined,
        history: [historyEntry],
        createdAt: nowIso,
        updatedAt: nowIso
      };

      createdInvoices.push(invoice);
      this.data.invoices.unshift(invoice);

      for (const sId of salesIds) {
        const allocatedSale = this.data.sales.find(s => s.id === sId);
        if (allocatedSale) {
          this.syncSaleBillingState(allocatedSale);
          this.triggerSupabaseSync('sales', allocatedSale, 'mapSaleToSupabase');
        }
      }

      this.recalculateStudentBalances(student);
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');

      // Desacoplado: falha na notificação nunca impede emissão nem duplica fatura
      this.scheduleInvoiceNotificationsSafe(invoice, student);
    }

    const totalAmount = this.roundCurrency(createdInvoices.reduce((acc, i) => acc + i.grossTotal, 0));
    const batch: BillingBatch = {
      id: batchId,
      type: preview.mode,
      billingPeriod: preview.billingPeriod,
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
      billingLabel: preview.billingLabel,
      dueDate: preview.dueDate,
      scope: preview.scope,
      classGroupFilter: payload.classGroup,
      studentsCount: createdInvoices.length,
      invoicesCount: createdInvoices.length,
      salesCount: totalBatchSalesCount,
      totalAmount,
      invoiceIds: createdInvoices.map(i => i.id),
      createdByUserId: user.id,
      createdByUserName: user.name,
      status: 'CONCLUIDO',
      idempotencyKey: payload.idempotencyKey,
      notes: payload.notes,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    if (!Array.isArray(this.data.billingBatches)) this.data.billingBatches = [];
    this.data.billingBatches.unshift(batch);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      preview.mode === 'FECHAMENTO_MENSAL' ? 'FECHAMENTO_MENSAL_EXECUTADO' : 'FATURAMENTO_PERIODO_EXECUTADO',
      preview.mode === 'FECHAMENTO_MENSAL' ? 'FECHAMENTO' : 'FATURAS',
      `Lote ${batch.id} (${preview.mode}) emitido para ${preview.periodStart} a ${preview.periodEnd}. ${createdInvoices.length} fatura(s) gerada(s) totalizando R$ ${totalAmount.toFixed(2)}.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('billing_batches', batch, 'mapBillingBatchToSupabase');
    createdInvoices.forEach(inv => this.triggerSupabaseSync('invoices', inv, 'mapInvoiceToSupabase'));

    return {
      batch,
      invoicesCreated: createdInvoices.length,
      invoices: createdInvoices,
      period: preview.billingPeriod
    };
  }

  public getStudentIndividualBillingContext(
    studentId: string,
    periodStart?: string,
    periodEnd?: string
  ) {
    const student = this.data.students.find(s => s.id === studentId);
    if (!student) throw new Error('Aluno não encontrado.');

    if (periodStart && periodEnd && periodStart > periodEnd) {
      throw new Error('A data inicial não pode ser maior que a data final.');
    }

    const salesEval = this.data.sales
      .filter(s => {
        if (s.studentId !== studentId) return false;
        const spDate = this.toSaoPauloDate(s.createdAt);
        if (periodStart && spDate < periodStart) return false;
        if (periodEnd && spDate > periodEnd) return false;
        return true;
      })
      .map(s => this.evaluateSaleBilling(s));

    const studentInvoices = this.data.invoices.filter(i => i.studentId === studentId);
    const guardians = (student.guardians || []).map(g => {
      const full = this.data.guardians.find(x => x.id === g.guardianId);
      return {
        ...g,
        guardianName: full?.name || g.guardianName || 'Responsável',
        guardianPhone: full?.phone || g.guardianPhone || '',
        guardianEmail: full?.email || ''
      };
    });

    const eligibleSalesTotal = this.roundCurrency(
      salesEval.filter(s => s.isEligible).reduce((acc, s) => acc + s.remainingBillableAmount, 0)
    );

    return {
      student,
      guardians,
      sales: salesEval,
      eligibleSalesTotal,
      studentInvoices
    };
  }

  public previewIndividualInvoice(payload: IndividualInvoicePayload) {
    const student = this.data.students.find(s => s.id === payload.studentId);
    if (!student) throw new Error('Aluno não encontrado.');

    if (!payload.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)) {
      throw new Error('Data de vencimento inválida. Informe no formato AAAA-MM-DD.');
    }

    const hasGuardian = Boolean(student.guardians && student.guardians.length > 0);
    const requiresGuardian = student.payerRule === 'GUARDIAN' || student.payerRule === 'GUARDIAN_ONLY';
    if (!hasGuardian && requiresGuardian) {
      throw new Error(`O aluno ${student.name} está configurado para cobrança exclusiva pelo responsável, mas não possui responsável vinculado.`);
    }

    const tuitionAmount = Math.max(0, this.roundCurrency(Number(payload.tuitionAmount) || 0));
    const discountAmount = Math.max(0, this.roundCurrency(Number(payload.discountAmount) || 0));
    const creditAmount = Math.max(0, this.roundCurrency(Number(payload.creditAmount) || 0));
    const totalAdjustments = this.roundCurrency(discountAmount + creditAmount);

    if (totalAdjustments > 0 && (!payload.discountReason || payload.discountReason.trim().length < 3)) {
      throw new Error('Informe a justificativa para aplicar desconto ou crédito autorizado na fatura.');
    }

    const selections = Array.isArray(payload.selections) ? payload.selections : [];
    if (selections.length === 0 && tuitionAmount <= 0) {
      throw new Error('Selecione ao menos uma compra/item elegível para compor a fatura individual.');
    }

    const allocatedLinks: InvoiceSaleItemLink[] = [];
    const saleAllocationsPlan: Array<{
      sale: Sale;
      amount: number;
      items: SaleAllocatedItem[];
    }> = [];

    let canteenConsumptionTotal = 0;

    for (const sel of selections) {
      const sale = this.data.sales.find(s => s.id === sel.saleId);
      if (!sale) throw new Error(`Venda ${sel.saleId} não encontrada.`);
      if (sale.studentId !== student.id) {
        throw new Error(`A venda ${sel.saleId} pertence a outro aluno e não pode ser faturada para ${student.name}.`);
      }

      const evalSale = this.evaluateSaleBilling(sale);
      if (!evalSale.isEligible) {
        throw new Error(`A venda ${sale.id} não é elegível para faturamento (${evalSale.ineligibleReason || evalSale.billingStatus}).`);
      }

      const requestedItems = Array.isArray(sel.items) && sel.items.length > 0
        ? sel.items
        : evalSale.items.filter(it => it.remainingQuantity > 0).map(it => ({
            itemIndex: it.itemIndex,
            quantity: it.remainingQuantity
          }));

      if (requestedItems.length === 0) {
        throw new Error(`Nenhum item com saldo disponível selecionado na venda ${sale.id}.`);
      }

      const seenItemIndexes = new Set<number>();
      const saleItemsToAllocate: SaleAllocatedItem[] = [];
      let saleAllocatedAmount = 0;

      for (const reqIt of requestedItems) {
        if (seenItemIndexes.has(reqIt.itemIndex)) {
          throw new Error(`Item duplicado detectado na seleção da venda ${sale.id}.`);
        }
        seenItemIndexes.add(reqIt.itemIndex);

        const evalItem = evalSale.items.find(it => it.itemIndex === reqIt.itemIndex);
        if (!evalItem) {
          throw new Error(`Item ${reqIt.itemIndex} não pertence à venda ${sale.id}.`);
        }
        const qty = Number(reqIt.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new Error(`Quantidade inválida para o item "${evalItem.name}" na venda ${sale.id}.`);
        }
        if (qty > evalItem.remainingQuantity) {
          throw new Error(
            `Quantidade solicitada (${qty}) do item "${evalItem.name}" na venda ${sale.id} excede o saldo não faturado (${evalItem.remainingQuantity}).`
          );
        }

        const itemAmount = qty === evalItem.remainingQuantity
          ? evalItem.remainingAmount
          : this.roundCurrency(qty * evalItem.unitPrice);

        saleItemsToAllocate.push({
          itemIndex: evalItem.itemIndex,
          productId: evalItem.productId,
          name: evalItem.name,
          quantity: qty,
          unitPrice: evalItem.unitPrice,
          amount: itemAmount
        });
        allocatedLinks.push({
          saleId: sale.id,
          saleDate: sale.createdAt,
          itemIndex: evalItem.itemIndex,
          productId: evalItem.productId,
          productName: evalItem.name,
          quantity: qty,
          unitPrice: evalItem.unitPrice,
          subtotal: itemAmount
        });
        saleAllocatedAmount = this.roundCurrency(saleAllocatedAmount + itemAmount);
      }

      if (saleAllocatedAmount > evalSale.remainingBillableAmount + 0.05) {
        throw new Error(`Valor selecionado na venda ${sale.id} ultrapassa o saldo pendente.`);
      }
      saleAllocatedAmount = Math.min(saleAllocatedAmount, evalSale.remainingBillableAmount);
      canteenConsumptionTotal = this.roundCurrency(canteenConsumptionTotal + saleAllocatedAmount);
      saleAllocationsPlan.push({
        sale,
        amount: saleAllocatedAmount,
        items: saleItemsToAllocate
      });
    }

    const subtotal = this.roundCurrency(tuitionAmount + canteenConsumptionTotal);
    if (totalAdjustments > subtotal) {
      throw new Error(`O total de descontos/créditos (R$ ${totalAdjustments.toFixed(2)}) não pode exceder o valor bruto (R$ ${subtotal.toFixed(2)}).`);
    }

    const grossTotal = this.roundCurrency(subtotal - totalAdjustments);
    if (grossTotal <= 0) {
      throw new Error('O valor líquido final da fatura individual deve ser maior que R$ 0,00.');
    }

    const consumptionItems = this.buildConsumptionSummaryItems(allocatedLinks);
    const derivedPeriodStart = payload.periodStart || (
      allocatedLinks.length > 0
        ? allocatedLinks.map(l => this.toSaoPauloDate(l.saleDate)).sort()[0]
        : this.toSaoPauloDate(new Date().toISOString())
    );
    const derivedPeriodEnd = payload.periodEnd || (
      allocatedLinks.length > 0
        ? allocatedLinks.map(l => this.toSaoPauloDate(l.saleDate)).sort().slice(-1)[0]
        : this.toSaoPauloDate(new Date().toISOString())
    );
    const billingPeriod = derivedPeriodEnd.slice(0, 7);

    return {
      student,
      hasGuardian,
      warnings: !hasGuardian
        ? ['Aluno sem responsável vinculado — cobrança será emitida diretamente para o aluno.']
        : [],
      billingPeriod,
      periodStart: derivedPeriodStart,
      periodEnd: derivedPeriodEnd,
      dueDate: payload.dueDate,
      tuitionAmount,
      canteenConsumptionTotal,
      discountAmount,
      creditAmount,
      totalAdjustments,
      grossTotal,
      salesCount: saleAllocationsPlan.length,
      consumptionItems,
      allocatedLinks,
      saleAllocationsPlan
    };
  }

  public createIndividualInvoice(
    payload: IndividualInvoicePayload,
    user: { id: string; name: string; role: any }
  ): { batch: BillingBatch; invoice: Invoice; deduplicated?: boolean } {
    if (payload.idempotencyKey) {
      const existingBatch = this.getBillingBatches().find(b => b.idempotencyKey === payload.idempotencyKey);
      if (existingBatch) {
        const existingInv = this.data.invoices.find(i => existingBatch.invoiceIds.includes(i.id));
        if (existingInv) {
          return { batch: existingBatch, invoice: existingInv, deduplicated: true };
        }
      }
    }

    const plan = this.previewIndividualInvoice(payload);
    const nowIso = new Date().toISOString();
    const batchId = this.generateBatchId('INDIVIDUAL');
    const invoiceId = this.generateUniqueInvoiceId(plan.periodEnd, plan.student.registrationNumber);

    const pixCode = generateBacenPixPayload({
      pixKey: this.data.settings.pixKey,
      receiverName: this.data.settings.pixReceiverName,
      city: this.data.settings.pixCity,
      amount: plan.grossTotal,
      txId: invoiceId
    });

    const historyEntry: InvoiceHistoryEntry = {
      id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'EMISSAO_INDIVIDUAL',
      details: `Fatura individual emitida para ${plan.student.name} (${plan.periodStart} a ${plan.periodEnd}), ${plan.salesCount} venda(s), total líquido R$ ${plan.grossTotal.toFixed(2)}.${plan.totalAdjustments > 0 ? ` Desconto/crédito: R$ ${plan.totalAdjustments.toFixed(2)} (${payload.discountReason}).` : ''}`
    };

    const invoice: Invoice = {
      id: invoiceId,
      studentId: plan.student.id,
      studentName: plan.student.name,
      registrationNumber: plan.student.registrationNumber,
      classGroup: plan.student.classGroup,
      billingPeriod: plan.billingPeriod,
      billingType: 'INDIVIDUAL',
      batchId,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      billingLabel: payload.billingLabel?.trim() || `Avulsa (${plan.periodStart} a ${plan.periodEnd})`,
      tuitionAmount: plan.tuitionAmount,
      canteenConsumptionTotal: plan.canteenConsumptionTotal,
      previousBalance: 0,
      adjustmentsTotal: plan.totalAdjustments,
      creditApplied: plan.creditAmount,
      discountReason: payload.discountReason?.trim() || undefined,
      grossTotal: plan.grossTotal,
      paidTotal: 0,
      remainingBalance: plan.grossTotal,
      closingDate: plan.periodEnd,
      dueDate: plan.dueDate,
      status: 'PUBLICADA',
      salesIds: plan.saleAllocationsPlan.map(p => p.sale.id),
      saleItemLinks: plan.allocatedLinks,
      consumptionItems: plan.consumptionItems,
      paymentAllocations: [],
      pixCopyPasteCode: pixCode,
      pixQrCodePayload: pixCode,
      approvedByUserName: user.name,
      approvedAt: nowIso,
      publishedAt: nowIso,
      notes: payload.notes?.trim() || undefined,
      history: [historyEntry],
      createdAt: nowIso,
      updatedAt: nowIso
    };

    this.data.invoices.unshift(invoice);

    for (const itemPlan of plan.saleAllocationsPlan) {
      if (!Array.isArray(itemPlan.sale.invoiceAllocations)) {
        itemPlan.sale.invoiceAllocations = [];
      }
      itemPlan.sale.invoiceAllocations.push({
        invoiceId,
        batchId,
        amount: itemPlan.amount,
        items: itemPlan.items,
        allocatedAt: nowIso
      });
      this.syncSaleBillingState(itemPlan.sale);
      this.triggerSupabaseSync('sales', itemPlan.sale, 'mapSaleToSupabase');
    }

    this.recalculateStudentBalances(plan.student);
    this.triggerSupabaseSync('students', plan.student, 'mapStudentToSupabase');

    const batch: BillingBatch = {
      id: batchId,
      type: 'INDIVIDUAL',
      billingPeriod: plan.billingPeriod,
      periodStart: plan.periodStart,
      periodEnd: plan.periodEnd,
      billingLabel: invoice.billingLabel,
      dueDate: plan.dueDate,
      scope: 'SINGLE_STUDENT',
      studentsCount: 1,
      invoicesCount: 1,
      salesCount: plan.salesCount,
      totalAmount: plan.grossTotal,
      invoiceIds: [invoice.id],
      createdByUserId: user.id,
      createdByUserName: user.name,
      status: 'CONCLUIDO',
      idempotencyKey: payload.idempotencyKey,
      notes: payload.notes?.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    if (!Array.isArray(this.data.billingBatches)) this.data.billingBatches = [];
    this.data.billingBatches.unshift(batch);

    // Notificação segura/desacoplada
    this.scheduleInvoiceNotificationsSafe(invoice, plan.student);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'EMITIR_FATURA_INDIVIDUAL',
      'FATURAS',
      `Fatura individual ${invoice.id} emitida para ${plan.student.name} no valor de R$ ${invoice.grossTotal.toFixed(2)} (${plan.salesCount} venda(s)).`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('billing_batches', batch, 'mapBillingBatchToSupabase');
    this.triggerSupabaseSync('invoices', invoice, 'mapInvoiceToSupabase');

    return { batch, invoice };
  }

  // 6.1 Prévia de Fechamento Mensal (Compatível com API legada + motor unificado)
  public getMonthlyClosingPreview(period: string): MonthlyClosingPreview {
    const batchPreview = this.previewPeriodBilling({
      mode: 'FECHAMENTO_MENSAL',
      billingPeriod: period,
      scope: 'ALL_STUDENTS',
      onlyUnbilled: true
    });

    return {
      period: batchPreview.billingPeriod,
      studentsCount: batchPreview.studentsCount,
      totalTuitions: batchPreview.totalTuitions,
      totalConsumptions: batchPreview.totalConsumptions,
      totalPreviousBalances: 0,
      totalGrossToBill: batchPreview.totalGrossToBill,
      pendingUnpaidSalesCount: batchPreview.validSalesCount,
      existingInvoicesCount: batchPreview.existingInvoicesCount,
      inconsistencies: batchPreview.inconsistencies,
      canProceed: batchPreview.canProceed,
      batchPreview
    };
  }

  // 7. Executar Fechamento Mensal e Publicar Faturas (Delega ao motor unificado)
  public executeMonthlyClosing(
    period: string,
    user: { id: string; name: string; role: any },
    options?: Partial<PeriodBillingPayload>
  ) {
    const res = this.executePeriodBilling(
      {
        mode: 'FECHAMENTO_MENSAL',
        billingPeriod: period,
        scope: options?.scope || 'ALL_STUDENTS',
        classGroup: options?.classGroup,
        studentIds: options?.studentIds,
        excludedStudentIds: options?.excludedStudentIds,
        dueDate: options?.dueDate,
        billingLabel: options?.billingLabel,
        notes: options?.notes,
        idempotencyKey: options?.idempotencyKey
      },
      user
    );

    return {
      period: res.period,
      batch: res.batch,
      invoicesCreated: res.invoicesCreated,
      invoices: res.invoices,
      deduplicated: res.deduplicated
    };
  }

  // 7.0 Cancelamento controlado de fatura (Preserva histórico, auditoria e devolve consumo não pago)
  public cancelInvoice(invoiceId: string, reason: string, user: { id: string; name: string; role: any }) {
    const cleanReason = (reason || '').trim();
    if (cleanReason.length < 3) {
      throw new Error('Informe uma justificativa clara (mínimo 3 caracteres) para cancelar a fatura.');
    }

    const invoice = this.data.invoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');
    if (invoice.status === 'CANCELADA') {
      throw new Error('Esta fatura já se encontra cancelada.');
    }
    if (invoice.paidTotal > 0) {
      throw new Error('Não é possível cancelar uma fatura que já possui pagamentos confirmados.');
    }

    const nowIso = new Date().toISOString();
    invoice.status = 'CANCELADA';
    invoice.canceledAt = nowIso;
    invoice.canceledByUserName = user.name;
    invoice.canceledReason = cleanReason;
    invoice.remainingBalance = 0;
    invoice.updatedAt = nowIso;

    if (!Array.isArray(invoice.history)) invoice.history = [];
    invoice.history.unshift({
      id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'CANCELAMENTO_CONTROLADO',
      details: `Fatura cancelada por ${user.name}. Motivo: ${cleanReason}`
    });

    // Devolver compras/itens alocados para status aguardando faturamento
    for (const sale of this.data.sales) {
      let touched = false;
      if (sale.invoiceId === invoiceId) {
        sale.invoiceId = undefined;
        touched = true;
      }
      if (Array.isArray(sale.invoiceAllocations) && sale.invoiceAllocations.some(a => a.invoiceId === invoiceId)) {
        sale.invoiceAllocations = sale.invoiceAllocations.filter(a => a.invoiceId !== invoiceId);
        touched = true;
      }
      if (touched) {
        this.syncSaleBillingState(sale);
        this.triggerSupabaseSync('sales', sale, 'mapSaleToSupabase');
      }
    }

    // Atualizar status do lote associado
    if (invoice.batchId) {
      const batch = this.getBillingBatches().find(b => b.id === invoice.batchId);
      if (batch) {
        const batchInvoices = this.data.invoices.filter(i => batch.invoiceIds.includes(i.id));
        const allCanceled = batchInvoices.length > 0 && batchInvoices.every(i => i.status === 'CANCELADA');
        const anyCanceled = batchInvoices.some(i => i.status === 'CANCELADA');
        batch.status = allCanceled ? 'CANCELADO' : anyCanceled ? 'PARCIALMENTE_CANCELADO' : 'CONCLUIDO';
        batch.updatedAt = nowIso;
        this.triggerSupabaseSync('billing_batches', batch, 'mapBillingBatchToSupabase');
      }
    }

    // Recalcular saldos do aluno
    const student = this.data.students.find(s => s.id === invoice.studentId);
    if (student) {
      this.recalculateStudentBalances(student);
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'CANCELAR_FATURA',
      'FATURAS',
      `Fatura ${invoice.id} (${invoice.studentName}) cancelada controladamente. Motivo: ${cleanReason}. Consumo devolvido à fila de faturamento.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('invoices', invoice, 'mapInvoiceToSupabase');
    return invoice;
  }

  // 7.1 Excluir uma fatura individual (Mantido para compatibilidade administrativa)
  public deleteInvoice(invoiceId: string, user: { id: string; name: string; role: any }) {
    const idx = this.data.invoices.findIndex(i => i.id === invoiceId);
    if (idx === -1) throw new Error('Cobrança não encontrada.');

    const deleted = this.data.invoices.splice(idx, 1)[0];

    // Desvincular vendas e alocações que apontavam para esta fatura
    for (const sale of this.data.sales) {
      let touched = false;
      if (sale.invoiceId === invoiceId) {
        sale.invoiceId = undefined;
        touched = true;
      }
      if (Array.isArray(sale.invoiceAllocations) && sale.invoiceAllocations.some(a => a.invoiceId === invoiceId)) {
        sale.invoiceAllocations = sale.invoiceAllocations.filter(a => a.invoiceId !== invoiceId);
        touched = true;
      }
      if (touched) {
        this.syncSaleBillingState(sale);
        this.triggerSupabaseSync('sales', sale, 'mapSaleToSupabase');
      }
    }

    if (deleted.batchId) {
      const batch = this.getBillingBatches().find(b => b.id === deleted.batchId);
      if (batch) {
        batch.invoiceIds = batch.invoiceIds.filter(id => id !== deleted.id);
        batch.invoicesCount = batch.invoiceIds.length;
        if (batch.invoicesCount === 0) {
          batch.status = 'CANCELADO';
        }
        batch.updatedAt = new Date().toISOString();
        this.triggerSupabaseSync('billing_batches', batch, 'mapBillingBatchToSupabase');
      }
    }

    const student = this.data.students.find(s => s.id === deleted.studentId);
    if (student) {
      this.recalculateStudentBalances(student);
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'EXCLUIR_FATURA',
      'FATURAS',
      `Cobrança ${deleted.id} do aluno ${deleted.studentName} foi excluída.`
    );

    this.saveDatabase();
    this.triggerSupabaseDelete('invoices', invoiceId);
    return { success: true, deletedId: invoiceId };
  }

  // 7.2 Excluir todas as faturas antigas de todos os estudantes (Deixar a base limpa)
  public clearAllInvoices(user: { id: string; name: string; role: any }) {
    const deletedInvoiceIds = this.data.invoices.map(inv => inv.id);
    const deletedBatchIds = (this.data.billingBatches || []).map(b => b.id);
    const totalDeleted = deletedInvoiceIds.length;
    this.data.invoices = [];
    this.data.billingBatches = [];

    for (const sale of this.data.sales) {
      const hadBillingLink = Boolean(sale.invoiceId || (sale.invoiceAllocations && sale.invoiceAllocations.length > 0));
      sale.invoiceId = undefined;
      sale.invoiceAllocations = undefined;
      sale.billedAmount = undefined;
      this.syncSaleBillingState(sale);
      if (hadBillingLink) {
        this.triggerSupabaseSync('sales', sale, 'mapSaleToSupabase');
      }
    }

    for (const invId of deletedInvoiceIds) {
      this.triggerSupabaseDelete('invoices', invId);
    }
    for (const batchId of deletedBatchIds) {
      this.triggerSupabaseDelete('billing_batches', batchId);
    }

    for (const student of this.data.students) {
      this.recalculateStudentBalances(student);
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'LIMPAR_TODAS_FATURAS',
      'FATURAS',
      `Todas as ${totalDeleted} faturas foram excluídas de todos os estudantes com sucesso. Saldos de consumo da Lojinha restaurados.`
    );

    this.saveDatabase();
    return { success: true, totalDeleted };
  }

  private scheduleInvoiceNotificationsSafe(invoice: Invoice, student: Student) {
    try {
      this.scheduleInvoiceNotifications(invoice, student);
    } catch (err: any) {
      // Falha de notificação nunca bloqueia ou reverte emissão da fatura
      const failNotif: WhatsAppNotification = {
        id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'NOVA_FATURA',
        recipientName: student.name,
        recipientPhone: student.phone || '',
        recipientRole: 'ALUNO',
        studentName: student.name,
        studentId: student.id,
        invoiceId: invoice.id,
        messageText: `Fatura ${invoice.id} emitida (R$ ${invoice.grossTotal.toFixed(2)}).`,
        status: 'FALHA',
        scheduledFor: new Date().toISOString(),
        attemptsCount: 1,
        lastErrorMessage: err?.message || 'Erro ao agendar notificação'
      };
      this.data.whatsappNotifications.unshift(failNotif);
      this.triggerSupabaseSync('whatsapp_notifications', failNotif, 'mapNotificationToSupabase');
    }
  }

  public retryInvoiceNotification(invoiceId: string, user: { id: string; name: string; role: any }) {
    const invoice = this.data.invoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');
    if (invoice.status === 'PAGA' || invoice.status === 'CANCELADA' || invoice.remainingBalance <= 0) {
      throw new Error('Faturas já quitadas ou canceladas não devem receber reenvio de cobrança.');
    }

    const student = this.data.students.find(s => s.id === invoice.studentId);
    if (!student) throw new Error('Aluno da fatura não encontrado.');

    const pendingNotifs = this.data.whatsappNotifications.filter(
      n => n.invoiceId === invoice.id && (n.status === 'FALHA' || n.status === 'PROGRAMADO')
    );

    const processed: WhatsAppNotification[] = [];
    if (pendingNotifs.length > 0) {
      for (const notif of pendingNotifs) {
        processed.push(this.retryWhatsAppNotification(notif.id));
      }
    } else {
      const prevAuto = this.data.settings.whatsappAutoEnabled;
      this.data.settings.whatsappAutoEnabled = true;
      try {
        const beforeCount = this.data.whatsappNotifications.length;
        this.scheduleInvoiceNotifications(invoice, student);
        const createdCount = this.data.whatsappNotifications.length - beforeCount;
        for (let idx = 0; idx < createdCount; idx++) {
          processed.push(this.data.whatsappNotifications[idx]);
        }
      } finally {
        this.data.settings.whatsappAutoEnabled = prevAuto;
      }
    }

    if (!Array.isArray(invoice.history)) invoice.history = [];
    invoice.history.unshift({
      id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'REENVIO_NOTIFICACAO',
      details: `Notificação da fatura reprocessada sem duplicar cobrança (${processed.length} envio(s)).`
    });

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'REENVIAR_NOTIFICACAO_FATURA',
      'NOTIFICACOES',
      `Notificações da fatura ${invoice.id} reenviadas com sucesso (${processed.length} mensagem(ns)).`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('invoices', invoice, 'mapInvoiceToSupabase');
    return { invoiceId: invoice.id, notifications: processed };
  }

  // Programar notificações WhatsApp respeitando quem deve receber
  private scheduleInvoiceNotifications(invoice: Invoice, student: Student) {
    if (!this.data.settings.whatsappAutoEnabled) return;

    const sendToStudent = student.reportRecipientRule === 'STUDENT' || student.reportRecipientRule === 'STUDENT_ONLY' || student.reportRecipientRule === 'BOTH';
    const sendToGuardian = student.reportRecipientRule === 'GUARDIAN' || student.reportRecipientRule === 'GUARDIAN_ONLY' || student.reportRecipientRule === 'BOTH';

    const detailsText = invoice.tuitionAmount > 0
      ? `(Mensalidade: R$ ${invoice.tuitionAmount.toFixed(2)} + Lojinha: R$ ${invoice.canteenConsumptionTotal.toFixed(2)})`
      : `(Consumo Lojinha Iceves: R$ ${invoice.canteenConsumptionTotal.toFixed(2)})`;

    if (sendToStudent && student.phone) {
      const studentNotif: WhatsAppNotification = {
        id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'NOVA_FATURA',
        recipientName: student.name,
        recipientPhone: student.phone,
        recipientRole: 'ALUNO',
        studentName: student.name,
        studentId: student.id,
        invoiceId: invoice.id,
        messageText: `Olá, ${student.name}! Sua fatura da Lojinha Iceves (${invoice.billingLabel || invoice.billingPeriod}) foi emitida. Valor Total: R$ ${invoice.grossTotal.toFixed(2)} ${detailsText}. Vencimento: ${invoice.dueDate}.`,
        status: 'ENTREGUE',
        scheduledFor: new Date().toISOString(),
        sentAt: new Date().toISOString(),
        attemptsCount: 1
      };
      this.data.whatsappNotifications.unshift(studentNotif);
      this.triggerSupabaseSync('whatsapp_notifications', studentNotif, 'mapNotificationToSupabase');
    }

    if (sendToGuardian) {
      for (const link of student.guardians) {
        const guardian = this.data.guardians.find(g => g.id === link.guardianId);
        if (guardian && guardian.phone) {
          const guardianNotif: WhatsAppNotification = {
            id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'NOVA_FATURA',
            recipientName: guardian.name,
            recipientPhone: guardian.phone,
            recipientRole: 'RESPONSAVEL',
            studentName: student.name,
            studentId: student.id,
            invoiceId: invoice.id,
            messageText: `Prezado(a) ${guardian.name}, a fatura de consumo da Lojinha Iceves de ${student.name} (${invoice.billingLabel || invoice.billingPeriod}) está disponível. Total: R$ ${invoice.grossTotal.toFixed(2)}. Vencimento: ${invoice.dueDate}.`,
            status: 'ENTREGUE',
            scheduledFor: new Date().toISOString(),
            sentAt: new Date().toISOString(),
            attemptsCount: 1
          };
          this.data.whatsappNotifications.unshift(guardianNotif);
          this.triggerSupabaseSync('whatsapp_notifications', guardianNotif, 'mapNotificationToSupabase');
        }
      }
    }
  }

  // 8. Registro de Intenção de Pagamento via Pix (Aluno ou Responsável envia comprovante)
  public submitPixPayment(params: {
    invoiceId: string;
    amount: number;
    transactionReference: string;
    receiptAttachment?: string;
    receiptNotes?: string;
    user: { id: string; name: string; role: any };
  }) {
    const { invoiceId, amount, transactionReference, receiptAttachment, receiptNotes, user } = params;

    const invoice = this.data.invoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');

    if (amount <= 0) throw new Error('Valor do pagamento deve ser positivo.');
    if (amount > invoice.remainingBalance) {
      throw new Error(`Valor informado (R$ ${amount.toFixed(2)}) é maior que o saldo restante da fatura (R$ ${invoice.remainingBalance.toFixed(2)}).`);
    }

    const payerRole = user.role === 'GUARDIAN' ? 'RESPONSAVEL' : 'ALUNO';

    const pixPayment: PixPayment = {
      id: `PIX-${Date.now().toString().slice(-6)}`,
      invoiceId: invoice.id,
      invoiceCode: invoice.id,
      studentId: invoice.studentId,
      studentName: invoice.studentName,
      payerName: user.name,
      payerRole: payerRole as any,
      amount: Math.round(amount * 100) / 100,
      transactionReference,
      receiptAttachment: receiptAttachment || 'Comprovante_Pix_Enviado.pdf',
      receiptNotes,
      status: 'AGUARDANDO_CONFERENCIA',
      registeredByUserId: user.id,
      registeredByUserName: user.name,
      registeredAt: new Date().toISOString()
    };

    this.data.pixPayments.unshift(pixPayment);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'ENVIO_COMPROVANTE_PIX',
      'PAGAMENTOS',
      `Comprovante de pagamento Pix ${pixPayment.id} enviado para fatura ${invoice.id} (R$ ${amount.toFixed(2)}) aguardando conferência administrativa.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('pix_payments', pixPayment, 'mapPixPaymentToSupabase');
    return pixPayment;
  }

  // 9. Conferência e Aprovação de Pagamento Pix (Administrador)
  public reviewPixPayment(params: {
    paymentId: string;
    decision: 'APROVADO' | 'REJEITADO';
    reason: string;
    reviewerUser: { id: string; name: string; role: any };
  }) {
    const { paymentId, decision, reason, reviewerUser } = params;
    const payment = this.data.pixPayments.find(p => p.id === paymentId);
    if (!payment) throw new Error('Pagamento não encontrado.');

    if (payment.status !== 'AGUARDANDO_CONFERENCIA') {
      throw new Error(`Este pagamento já foi ${payment.status.toLowerCase()} anteriormente.`);
    }

    const invoice = this.data.invoices.find(i => i.id === payment.invoiceId);
    if (!invoice) throw new Error('Fatura relacionada não encontrada.');

    payment.reviewedByUserId = reviewerUser.id;
    payment.reviewedByUserName = reviewerUser.name;
    payment.reviewedAt = new Date().toISOString();
    payment.reviewDecisionReason = reason;

    if (decision === 'APROVADO') {
      payment.status = 'CONFIRMADO';

      // Atualizar fatura
      invoice.paidTotal = Math.round((invoice.paidTotal + payment.amount) * 100) / 100;
      invoice.remainingBalance = Math.max(0, Math.round((invoice.grossTotal - invoice.paidTotal) * 100) / 100);

      if (invoice.remainingBalance <= 0) {
        invoice.status = 'PAGA';
      } else {
        invoice.status = 'PARCIALMENTE_PAGA';
      }
      invoice.updatedAt = new Date().toISOString();

      // Registrar alocação na fatura
      invoice.paymentAllocations.push({
        paymentId: payment.id,
        amount: payment.amount,
        payerName: payment.payerName,
        payerType: payment.payerRole,
        date: new Date().toISOString()
      });

      // Atualizar saldo total do aluno
      const student = this.data.students.find(s => s.id === invoice.studentId);
      if (student) {
        student.totalOpenDebt = Math.max(0, Math.round((student.totalOpenDebt - payment.amount) * 100) / 100);
        this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
      }

      // Registro no livro financeiro
      this.data.financialLedger.unshift({
        id: `LED-${Date.now()}-${Math.floor(Math.random() * 100)}`,
        timestamp: new Date().toISOString(),
        studentId: invoice.studentId,
        type: 'CREDITO',
        category: 'PAGAMENTO_PIX',
        amount: payment.amount,
        description: `Recebimento Pix ${payment.id} confirmado para fatura ${invoice.id}`,
        invoiceId: invoice.id,
        documentRef: payment.transactionReference,
        performedByUserName: reviewerUser.name
      });

      // Programar confirmação WhatsApp
      if (this.data.settings.whatsappAutoEnabled) {
        const confirmNotif: WhatsAppNotification = {
          id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: 'CONFIRMACAO_PAGAMENTO',
          recipientName: payment.payerName,
          recipientPhone: student?.phone || '(11) 98111-2233',
          recipientRole: payment.payerRole,
          studentName: invoice.studentName,
          studentId: invoice.studentId,
          invoiceId: invoice.id,
          messageText: `Recebimento confirmado! O valor de R$ ${payment.amount.toFixed(2)} foi processado na fatura ${invoice.id}. Saldo restante da fatura: R$ ${invoice.remainingBalance.toFixed(2)}. Obrigado!`,
          status: 'ENTREGUE',
          scheduledFor: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          attemptsCount: 1
        };
        this.data.whatsappNotifications.unshift(confirmNotif);
        this.triggerSupabaseSync('whatsapp_notifications', confirmNotif, 'mapNotificationToSupabase');
      }

      this.logAudit(
        reviewerUser.id,
        reviewerUser.name,
        reviewerUser.role,
        'APROVACAO_PIX',
        'PAGAMENTOS',
        `Pagamento Pix ${payment.id} de R$ ${payment.amount.toFixed(2)} aprovado para a fatura ${invoice.id}. Novo saldo da fatura: R$ ${invoice.remainingBalance.toFixed(2)}`
      );
    } else {
      payment.status = 'REJEITADO';

      this.logAudit(
        reviewerUser.id,
        reviewerUser.name,
        reviewerUser.role,
        'REJEICAO_PIX',
        'PAGAMENTOS',
        `Pagamento Pix ${payment.id} de R$ ${payment.amount.toFixed(2)} REJEITADO. Motivo: ${reason}`
      );
    }

    this.saveDatabase();
    this.triggerSupabaseSync('pix_payments', payment, 'mapPixPaymentToSupabase');
    if (invoice) this.triggerSupabaseSync('invoices', invoice, 'mapInvoiceToSupabase');
    return { payment, invoice };
  }

  // 10. Atualização de Cadastro, Foto de Perfil e Regras de Aluno
  public updateStudentSettings(studentId: string, updates: Partial<Student>, user: { id: string; name: string; role: any }) {
    const student = this.data.students.find(s => s.id === studentId);
    if (!student) throw new Error('Aluno não encontrado.');

    Object.assign(student, updates);

    // Se foram enviados vínculos de responsáveis (student.guardians), sincronizar também com a coleção global de guardians sem duplicar
    if (Array.isArray(updates.guardians)) {
      for (const lk of student.guardians) {
        if (!lk.guardianName) continue;
        let gRecord = this.data.guardians.find(
          g => g.id === lk.guardianId || g.name.trim().toLowerCase() === lk.guardianName!.trim().toLowerCase()
        );
        if (!gRecord) {
          const newGuardianId = lk.guardianId || `guardian-${Date.now().toString().slice(-6)}`;
          gRecord = {
            id: newGuardianId,
            name: lk.guardianName.trim(),
            cpf: 'Não informado',
            email: `${lk.guardianName.trim().toLowerCase().replace(/[^a-z0-9]/g, '.')}@gmail.com`,
            phone: (lk.guardianPhone || '').trim(),
            relationshipDefault: lk.relationship || 'Responsável',
            studentIds: [student.id],
            needsPhoneReview: lk.needsPhoneReview,
            phoneReviewNote: lk.phoneReviewNote,
            createdAt: new Date().toISOString()
          };
          this.data.guardians.push(gRecord);
          lk.guardianId = gRecord.id;
        } else {
          gRecord.name = lk.guardianName.trim();
          if (lk.guardianPhone !== undefined) gRecord.phone = lk.guardianPhone.trim();
          if (lk.relationship) gRecord.relationshipDefault = lk.relationship;
          if (!gRecord.studentIds.includes(student.id)) {
            gRecord.studentIds.push(student.id);
          }
          lk.guardianId = gRecord.id;
        }
        this.triggerSupabaseSync('guardians', gRecord, 'mapGuardianToSupabase');
      }
    }

    // Sincronizar nome e avatar caso exista usuário vinculado ao aluno
    for (const u of this.data.users) {
      if (u.studentId === student.id) {
        let userChanged = false;
        if (updates.name && u.name !== updates.name) { u.name = updates.name; userChanged = true; }
        if (updates.avatar && u.avatar !== updates.avatar) { u.avatar = updates.avatar; userChanged = true; }
        if (updates.email && u.email !== updates.email) { u.email = updates.email; userChanged = true; }
        if (userChanged) {
          this.triggerSupabaseSync('users', u, 'mapUserToSupabase');
        }
      }
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'ATUALIZAR_CADASTRO_ALUNO',
      'CONFIGURACOES',
      `Cadastro, foto de perfil, responsáveis ou regras do aluno ${student.name} foram atualizados.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    return student;
  }

  public createStudent(studentData: Partial<Student>, user: { id: string; name: string; role: any }) {
    const nextNum = this.data.students.length + 1;
    const regCode = studentData.registrationNumber || `EC10-${String(nextNum).padStart(3, '0')}`;
    const fullName = (studentData.name || 'Novo Aluno').trim();

    const newStudent: Student = {
      id: `student-${Date.now().toString().slice(-5)}`,
      name: fullName,
      registrationNumber: regCode,
      classGroup: studentData.classGroup || '10ª Turma • Escola de Cristo (Formatura 27 a 30)',
      email: studentData.email || `aluno.${nextNum}@gmail.com`,
      phone: studentData.phone || '(11) 99100-0000',
      avatar: studentData.avatar || initialStudents[0]?.avatar,
      status: 'ACTIVE',
      defaultTuition: 0,
      currentConsumptionBalance: 0,
      totalOpenDebt: 0,
      payerRule: studentData.payerRule || 'BOTH',
      reportRecipientRule: studentData.reportRecipientRule || 'BOTH',
      dueReminderRecipientRule: 'BOTH',
      paymentConfirmationRecipientRule: 'BOTH',
      allowedChannels: studentData.allowedChannels || ['WHATSAPP', 'EMAIL'],
      guardians: studentData.guardians || [],
      notes: studentData.notes || '10ª Turma - Escola de Cristo ICEVES (Formatura: 27 a 30)',
      createdAt: new Date().toISOString()
    };

    this.data.students.push(newStudent);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'CADASTRAR_ALUNO',
      'CONFIGURACOES',
      `Aluno ${newStudent.name} (${newStudent.registrationNumber}) adicionado à 10ª Turma.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('students', newStudent, 'mapStudentToSupabase');
    return newStudent;
  }

  public registerUser(userData: {
    name: string;
    email: string;
    password: string;
    role?: any;
    phone?: string;
  }) {
    const cleanEmail = (userData.email || '').trim().toLowerCase();
    const cleanName = (userData.name || '').trim();
    const cleanPassword = (userData.password || '').trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      throw new Error('Nome, e-mail e senha são obrigatórios para criar a conta.');
    }
    if (cleanPassword.length < 6) {
      throw new Error('A senha deve possuir no mínimo 6 caracteres.');
    }

    const existing = this.data.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      throw new Error('Já existe uma conta cadastrada com este e-mail. Utilize a aba "Entrar com Senha".');
    }

    // No cadastro público, apenas Aluno (STUDENT) ou Responsável Financeiro (GUARDIAN) são permitidos
    const role: User['role'] = userData.role === 'GUARDIAN' ? 'GUARDIAN' : 'STUDENT';
    let studentId: string | undefined;
    let guardianId: string | undefined;
    let registrationNumber: string | undefined;

    if (role === 'STUDENT') {
      // Verifica se já corresponde a um dos alunos da 10ª Turma pelo nome ou e-mail
      let matchedStudent = this.data.students.find(
        s => s.email.toLowerCase() === cleanEmail || s.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (!matchedStudent) {
        matchedStudent = this.createStudent(
          {
            name: cleanName,
            email: cleanEmail,
            phone: userData.phone || '(11) 99100-0000',
            avatar: getInitialsAvatar(cleanName)
          },
          { id: 'system', name: cleanName, role: 'ADMIN' }
        );
      }
      studentId = matchedStudent.id;
      registrationNumber = matchedStudent.registrationNumber;
    } else if (role === 'GUARDIAN') {
      guardianId = this.data.guardians[0]?.id || 'guardian-1';
    }

    const newUser: User = {
      id: `user-${Date.now().toString().slice(-6)}`,
      name: cleanName,
      email: cleanEmail,
      password: hashPassword(cleanPassword),
      role,
      phone: userData.phone || undefined,
      avatar: getInitialsAvatar(cleanName),
      studentId,
      guardianId,
      registrationNumber,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };

    this.data.users.push(newUser);

    this.logAudit(
      newUser.id,
      newUser.name,
      newUser.role,
      'CRIAR_CONTA_USUARIO',
      'AUTH',
      `Nova conta criada via tela de login: ${newUser.name} (${newUser.email}) com perfil ${newUser.role}.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('users', newUser, 'mapUserToSupabase');
    return newUser;
  }

  public hasAdminClaimedPassword(): boolean {
    return this.data.users.some(u => u.role === 'ADMIN' && Boolean(u.password && u.password.trim()));
  }

  public getPrimaryAdminEmail(): string {
    const adminWithPassword = this.data.users.find(
      u => u.role === 'ADMIN' && Boolean(u.password && u.password.trim())
    );
    const admin =
      adminWithPassword ||
      this.data.users.find(u => u.id === 'user-admin') ||
      this.data.users.find(u => u.role === 'ADMIN');
    return admin?.email || 'admin.lojinha@gmail.com';
  }

  public claimInitialAdminPassword(plainPassword: string, email?: string): User {
    if (isAdminEnvPasswordConfigured()) {
      const err = new Error(
        'A senha do administrador já está protegida pela variável de ambiente ADMIN_PASSWORD no servidor. Utilize a tela de login.'
      ) as Error & { statusCode?: number };
      err.statusCode = 403;
      throw err;
    }
    if (this.hasAdminClaimedPassword()) {
      const err = new Error(
        'A senha inicial do administrador já foi configurada. Utilize a tela de login.'
      ) as Error & { statusCode?: number };
      err.statusCode = 403;
      throw err;
    }
    const cleanPassword = (plainPassword || '').trim();
    if (cleanPassword.length < 8) {
      const err = new Error('A senha do administrador deve possuir no mínimo 8 caracteres.') as Error & {
        statusCode?: number;
      };
      err.statusCode = 400;
      throw err;
    }

    let admin = this.data.users.find(u => u.id === 'user-admin') || this.data.users.find(u => u.role === 'ADMIN');
    if (!admin) {
      const err = new Error('Conta administrativa principal não encontrada.') as Error & { statusCode?: number };
      err.statusCode = 500;
      throw err;
    }

    const rawEmail = (email || '').trim();
    if (rawEmail) {
      const cleanEmail = rawEmail.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        const err = new Error('Informe um endereço de e-mail válido para o administrador.') as Error & {
          statusCode?: number;
        };
        err.statusCode = 400;
        throw err;
      }

      const existingWithEmail = this.data.users.find(u => u.email.toLowerCase() === cleanEmail);
      if (existingWithEmail && existingWithEmail.id !== admin.id) {
        if (existingWithEmail.role === 'ADMIN') {
          // Se o e-mail informado já pertence a uma conta administrativa existente, configura a senha diretamente nela
          admin = existingWithEmail;
        } else {
          const err = new Error(
            `O e-mail ${cleanEmail} já está em uso por outra conta (${existingWithEmail.role}). Informe outro e-mail ou utilize ${admin.email}.`
          ) as Error & { statusCode?: number };
          err.statusCode = 409;
          throw err;
        }
      } else {
        admin.email = cleanEmail;
      }
    }

    admin.password = hashPassword(cleanPassword);
    admin.lastLogin = new Date().toISOString();

    this.logAudit(
      admin.id,
      admin.name,
      admin.role,
      'CONFIGURAR_SENHA_ADMIN_INICIAL',
      'AUTH',
      `Senha administrativa inicial configurada com hash seguro para ${admin.email}.`
    );
    this.writeDatabaseSync(this.data, true);
    this.triggerSupabaseSync('users', admin, 'mapUserToSupabase');
    return admin;
  }

  public upgradeUserPasswordToScrypt(userId: string, plainPassword: string): void {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) return;
    if (isScryptHash(user.password)) return;
    user.password = hashPassword(plainPassword);
    this.writeDatabaseSync(this.data, true);
    this.triggerSupabaseSync('users', user, 'mapUserToSupabase');
  }

  public setUserPassword(
    targetUserId: string,
    newPlainPassword: string,
    actor: { id: string; name: string; role: any }
  ): User {
    const cleanPassword = (newPlainPassword || '').trim();
    if (cleanPassword.length < 8) {
      throw new Error('A nova senha deve possuir no mínimo 8 caracteres.');
    }
    const target = this.data.users.find(u => u.id === targetUserId);
    if (!target) {
      throw new Error('Usuário não encontrado.');
    }
    target.password = hashPassword(cleanPassword);
    this.logAudit(
      actor.id,
      actor.name,
      actor.role,
      'ALTERAR_SENHA_USUARIO',
      'AUTH',
      `Senha atualizada com hash seguro para ${target.email} (${target.role}).`
    );
    this.writeDatabaseSync(this.data, true);
    this.triggerSupabaseSync('users', target, 'mapUserToSupabase');
    return target;
  }

  // 10.1 Atualização flexível de Mensalidade e Ajustes na Fatura
  public updateInvoice(
    invoiceId: string, 
    updates: { tuitionAmount?: number; adjustmentsTotal?: number; dueDate?: string; discountReason?: string; notes?: string }, 
    user: { id: string; name: string; role: any }
  ) {
    const invoice = this.data.invoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');
    if (invoice.status === 'CANCELADA') {
      throw new Error('Fatura cancelada não pode ser editada.');
    }

    const prevTuition = invoice.tuitionAmount;
    const prevAdj = invoice.adjustmentsTotal || 0;
    const prevDue = invoice.dueDate;

    if (updates.tuitionAmount !== undefined) {
      invoice.tuitionAmount = Math.max(0, Number(updates.tuitionAmount) || 0);
    }
    if (updates.adjustmentsTotal !== undefined) {
      invoice.adjustmentsTotal = Math.max(0, Number(updates.adjustmentsTotal) || 0);
    }
    if (updates.dueDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(updates.dueDate)) {
      invoice.dueDate = updates.dueDate;
    }
    if (updates.discountReason !== undefined) {
      invoice.discountReason = updates.discountReason;
    }
    if (updates.notes !== undefined) {
      invoice.notes = updates.notes;
    }

    // Recalcular total bruto e saldo devedor
    invoice.grossTotal = Math.max(
      0, 
      Math.round((invoice.tuitionAmount + invoice.canteenConsumptionTotal - (invoice.adjustmentsTotal || 0)) * 100) / 100
    );
    invoice.remainingBalance = Math.max(
      0, 
      Math.round((invoice.grossTotal - invoice.paidTotal) * 100) / 100
    );

    // Ajustar status se quitada ou pendente
    if (invoice.remainingBalance === 0 && invoice.grossTotal > 0 && invoice.paidTotal >= invoice.grossTotal) {
      invoice.status = 'PAGA';
    } else if (invoice.remainingBalance === 0 && invoice.grossTotal === 0) {
      invoice.status = 'PAGA';
    } else if (invoice.remainingBalance > 0 && invoice.paidTotal > 0) {
      invoice.status = 'PARCIALMENTE_PAGA';
    } else if (invoice.remainingBalance > 0 && invoice.status === 'PAGA') {
      invoice.status = 'PUBLICADA';
    }

    // Regerar payload Pix se houver saldo restante a pagar
    if (invoice.remainingBalance > 0) {
      invoice.pixCopyPasteCode = generateBacenPixPayload({
        pixKey: this.data.settings.pixKey,
        receiverName: this.data.settings.pixReceiverName,
        city: this.data.settings.pixCity,
        amount: invoice.remainingBalance,
        txId: invoice.id
      });
      invoice.pixQrCodePayload = invoice.pixCopyPasteCode;
    }

    const nowIso = new Date().toISOString();
    invoice.updatedAt = nowIso;

    if (!Array.isArray(invoice.history)) invoice.history = [];
    invoice.history.unshift({
      id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'AJUSTE_MANUAL_FATURA',
      details: `Mensalidade: R$ ${prevTuition.toFixed(2)} → R$ ${invoice.tuitionAmount.toFixed(2)} | Descontos: R$ ${prevAdj.toFixed(2)} → R$ ${(invoice.adjustmentsTotal || 0).toFixed(2)} | Vencimento: ${prevDue} → ${invoice.dueDate}.${invoice.discountReason || invoice.notes ? ` Obs: ${invoice.discountReason || invoice.notes}` : ''}`
    });

    const student = this.data.students.find(s => s.id === invoice.studentId);
    if (student) {
      this.recalculateStudentBalances(student);
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'AJUSTAR_MENSALIDADE_FATURA',
      'FATURAS',
      `Fatura ${invoice.id} (${invoice.studentName}) teve sua mensalidade ajustada para R$ ${invoice.tuitionAmount.toFixed(2)} e ajustes para R$ ${(invoice.adjustmentsTotal || 0).toFixed(2)}. Novo total: R$ ${invoice.grossTotal.toFixed(2)}.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('invoices', invoice, 'mapInvoiceToSupabase');
    return invoice;
  }

  // 11. Simulação e reprocessamento da fila de WhatsApp
  public retryWhatsAppNotification(notificationId: string) {
    const notif = this.data.whatsappNotifications.find(n => n.id === notificationId);
    if (!notif) throw new Error('Notificação não encontrada.');

    // Regra crítica de negócio: Se a fatura relacionada já estiver quitada, não envia cobrança!
    if (notif.invoiceId) {
      const invoice = this.data.invoices.find(i => i.id === notif.invoiceId);
      if (invoice && (invoice.status === 'PAGA' || invoice.status === 'CANCELADA' || invoice.remainingBalance <= 0)) {
        notif.status = 'CANCELADO_FATURA_QUITADA';
        notif.lastErrorMessage = 'Envio cancelado: fatura já se encontra quitada no sistema.';
        this.saveDatabase();
        this.triggerSupabaseSync('whatsapp_notifications', notif, 'mapNotificationToSupabase');
        return notif;
      }
    }

    notif.status = 'ENTREGUE';
    notif.sentAt = new Date().toISOString();
    notif.attemptsCount += 1;
    notif.lastErrorMessage = undefined;

    this.saveDatabase();
    this.triggerSupabaseSync('whatsapp_notifications', notif, 'mapNotificationToSupabase');
    return notif;
  }

  // 12. Gerenciamento de Passeios (Centralizado para todos os Alunos)
  public createPasseio(
    data: { nome: string; valor: number; descricao?: string | null; dataPasseio?: string | null; ativo?: boolean },
    user: { id: string; name: string; role: any }
  ): Passeio {
    const nome = (data.nome || '').trim();
    if (!nome) {
      throw new Error('O nome do passeio é obrigatório.');
    }
    const valor = Number(data.valor);
    if (isNaN(valor) || valor < 0) {
      throw new Error('O valor do passeio deve ser um número válido maior ou igual a zero.');
    }

    const now = new Date().toISOString();
    const newPasseio: Passeio = {
      id: crypto.randomUUID(),
      nome,
      valor: Math.round(valor * 100) / 100,
      descricao: data.descricao ? String(data.descricao).trim() : null,
      dataPasseio: data.dataPasseio ? String(data.dataPasseio).trim() : null,
      ativo: data.ativo !== undefined ? Boolean(data.ativo) : true,
      createdAt: now,
      updatedAt: now
    };

    if (!Array.isArray(this.data.passeios)) {
      this.data.passeios = [];
    }

    this.data.passeios.unshift(newPasseio);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'CADASTRAR_PASSEIO',
      'PASSEIOS',
      `Passeio "${newPasseio.nome}" (R$ ${newPasseio.valor.toFixed(2)}) cadastrado e disponibilizado automaticamente para todos os alunos.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('passeios', newPasseio, 'mapPasseioToSupabase');
    return newPasseio;
  }

  public updatePasseio(
    id: string,
    updates: Partial<{ nome: string; valor: number; descricao?: string | null; dataPasseio?: string | null; ativo: boolean }>,
    user: { id: string; name: string; role: any }
  ): Passeio {
    if (!Array.isArray(this.data.passeios)) {
      this.data.passeios = [];
    }
    const passeio = this.data.passeios.find(p => p.id === id);
    if (!passeio) {
      throw new Error('Passeio não encontrado.');
    }

    if (updates.nome !== undefined) {
      const trimmed = String(updates.nome).trim();
      if (!trimmed) throw new Error('O nome do passeio não pode ficar vazio.');
      passeio.nome = trimmed;
    }

    if (updates.valor !== undefined) {
      const val = Number(updates.valor);
      if (isNaN(val) || val < 0) throw new Error('O valor do passeio é inválido.');
      passeio.valor = Math.round(val * 100) / 100;
    }

    if (updates.descricao !== undefined) {
      passeio.descricao = updates.descricao ? String(updates.descricao).trim() : null;
    }

    if (updates.dataPasseio !== undefined) {
      passeio.dataPasseio = updates.dataPasseio ? String(updates.dataPasseio).trim() : null;
    }

    if (updates.ativo !== undefined) {
      passeio.ativo = Boolean(updates.ativo);
    }

    passeio.updatedAt = new Date().toISOString();

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'ATUALIZAR_PASSEIO',
      'PASSEIOS',
      `Passeio "${passeio.nome}" atualizado (Valor: R$ ${passeio.valor.toFixed(2)} | Status: ${passeio.ativo ? 'Ativo' : 'Inativo'}).`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('passeios', passeio, 'mapPasseioToSupabase');
    return passeio;
  }

  public deletePasseio(
    id: string,
    user: { id: string; name: string; role: any }
  ): { success: boolean; deletedId: string } {
    if (!Array.isArray(this.data.passeios)) {
      this.data.passeios = [];
    }
    const idx = this.data.passeios.findIndex(p => p.id === id);
    if (idx === -1) {
      throw new Error('Passeio não encontrado para exclusão.');
    }

    const removed = this.data.passeios[idx];
    this.data.passeios.splice(idx, 1);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'EXCLUIR_PASSEIO',
      'PASSEIOS',
      `Passeio "${removed.nome}" (R$ ${removed.valor.toFixed(2)}) excluído pelo administrador.`
    );

    this.saveDatabase();
    this.triggerSupabaseDelete('passeios', id);
    return { success: true, deletedId: id };
  }

  // 13. PDV de Passeios — Lançamento Coletivo de Despesas e Produtos em Passeios
  private mapTripCategoryToProductCategory(tripCategory: string): ProductCategory {
    const lower = (tripCategory || '').toLowerCase();
    if (lower.includes('livro') || lower.includes('bíblia') || lower.includes('biblia') || lower.includes('literatura')) {
      return 'Livros e Literatura Cristã';
    }
    if (lower.includes('natural') || lower.includes('saúde') || lower.includes('saude')) {
      return 'Produtos Naturais e Saúde';
    }
    if (lower.includes('papel') || lower.includes('material') || lower.includes('apostila') || lower.includes('kit')) {
      return 'Papelaria';
    }
    if (lower.includes('higiene') || lower.includes('cosm') || lower.includes('protetor') || lower.includes('repelente')) {
      return 'Higiene e Cuidados Pessoais';
    }
    if (lower.includes('limpeza')) {
      return 'Limpeza';
    }
    return 'Alimentos e Snacks';
  }

  public saveTripOperationDraft(
    payload: {
      id?: string;
      catalogPasseioId?: string;
      name: string;
      description?: string;
      tripDate: string;
      destination: string;
      notes?: string;
      responsibleUserId?: string;
      responsibleUserName?: string;
      selectionMode: 'ALL_STUDENTS' | 'SPECIFIC_STUDENTS';
      distributionMethod: TripDistributionMethod;
      fixedValuePerStudent?: number;
      items: TripExpenseItem[];
      participants: TripParticipantAllocation[];
    },
    user: { id: string; name: string; role: any }
  ): TripOperation {
    if (!Array.isArray(this.data.tripOperations)) {
      this.data.tripOperations = [];
    }

    const cleanName = (payload.name || '').trim();
    if (!cleanName) {
      throw new Error('O nome da operação de passeio é obrigatório.');
    }

    const cleanDate = (payload.tripDate || '').trim() || new Date().toISOString().substring(0, 10);
    const cleanDest = (payload.destination || '').trim() || 'Destino Externo ICEVES';

    // Sanitizar itens com precisão em centavos
    const sanitizedItems: TripExpenseItem[] = (payload.items || []).map((it, idx) => {
      const qty = Math.max(1, Number(it.quantity) || 1);
      const unitCents = Math.max(0, Math.round((Number(it.unitPrice) || 0) * 100));
      const totalCents = qty * unitCents;
      return {
        id: it.id || `ITEM-${Date.now()}-${idx}`,
        name: (it.name || 'Item de Passeio').trim(),
        description: it.description ? String(it.description).trim() : '',
        category: (it.category || 'Alimentação').trim(),
        itemType: it.itemType || 'DESPESA_OPERACIONAL',
        storeProductId: it.storeProductId || undefined,
        deductFromStock: Boolean(it.deductFromStock),
        quantity: qty,
        unitPrice: unitCents / 100,
        totalAmount: totalCents / 100,
        notes: it.notes ? String(it.notes).trim() : '',
      };
    });

    const totalExpensesCents = sanitizedItems.reduce(
      (acc, it) => acc + Math.round(it.totalAmount * 100),
      0
    );

    const sanitizedParticipants: TripParticipantAllocation[] = (payload.participants || []).map(p => {
      const cents = Math.max(0, Math.round((Number(p.allocatedAmount) || 0) * 100));
      return {
        studentId: p.studentId,
        studentName: p.studentName,
        registrationNumber: p.registrationNumber,
        classGroup: p.classGroup || '10ª Turma • Escola de Cristo',
        allocatedAmount: cents / 100,
        allocatedCents: cents,
        items: (p.items || []).map(pi => ({
          expenseItemId: pi.expenseItemId,
          name: pi.name,
          category: pi.category,
          itemType: pi.itemType || 'DESPESA_OPERACIONAL',
          quantity: Number(pi.quantity) || 1,
          unitPrice: Math.round((Number(pi.unitPrice) || 0) * 100) / 100,
          amount: Math.round((Number(pi.amount) || 0) * 100) / 100,
          description: pi.description || '',
          notes: pi.notes || '',
        })),
        status: 'PENDENTE',
      };
    });

    const totalDistributedCents = sanitizedParticipants.reduce(
      (acc, p) => acc + p.allocatedCents,
      0
    );

    const now = new Date().toISOString();

    if (payload.id) {
      const existing = this.data.tripOperations.find(op => op.id === payload.id);
      if (!existing) {
        throw new Error('Operação de passeio não encontrada.');
      }
      if (existing.status !== 'RASCUNHO') {
        throw new Error('Apenas operações em rascunho podem ser editadas diretamente. Para operações já lançadas, utilize a função de estorno auditável.');
      }

      existing.catalogPasseioId = payload.catalogPasseioId;
      existing.name = cleanName;
      existing.description = (payload.description || '').trim();
      existing.tripDate = cleanDate;
      existing.destination = cleanDest;
      existing.notes = (payload.notes || '').trim();
      existing.responsibleUserId = payload.responsibleUserId || user.id;
      existing.responsibleUserName = (payload.responsibleUserName || user.name).trim();
      existing.selectionMode = payload.selectionMode || 'ALL_STUDENTS';
      existing.distributionMethod = payload.distributionMethod || 'IGUALITARIA';
      existing.fixedValuePerStudent = payload.fixedValuePerStudent;
      existing.items = sanitizedItems;
      existing.participants = sanitizedParticipants;
      existing.totalExpenses = totalExpensesCents / 100;
      existing.totalDistributed = totalDistributedCents / 100;
      existing.updatedAt = now;

      existing.history.unshift({
        id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: now,
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        action: 'RASCUNHO_ATUALIZADO',
        details: `Rascunho "${existing.name}" atualizado (${sanitizedItems.length} itens, ${sanitizedParticipants.length} alunos, Total R$ ${existing.totalExpenses.toFixed(2)}).`,
      });

      this.logAudit(
        user.id,
        user.name,
        user.role,
        'ATUALIZAR_RASCUNHO_PDV_PASSEIO',
        'PDV_PASSEIOS',
        `Rascunho de passeio "${existing.name}" (${existing.id}) atualizado.`
      );

      this.saveDatabase();
      this.triggerSupabaseSync('trip_operations', existing, 'mapTripOperationToSupabase');
      return existing;
    }

    const opId = `PDV-PAS-${Date.now().toString().slice(-6)}`;
    const newOp: TripOperation = {
      id: opId,
      catalogPasseioId: payload.catalogPasseioId,
      name: cleanName,
      description: (payload.description || '').trim(),
      tripDate: cleanDate,
      destination: cleanDest,
      notes: (payload.notes || '').trim(),
      responsibleUserId: payload.responsibleUserId || user.id,
      responsibleUserName: (payload.responsibleUserName || user.name).trim(),
      status: 'RASCUNHO',
      selectionMode: payload.selectionMode || 'ALL_STUDENTS',
      distributionMethod: payload.distributionMethod || 'IGUALITARIA',
      fixedValuePerStudent: payload.fixedValuePerStudent,
      items: sanitizedItems,
      participants: sanitizedParticipants,
      totalExpenses: totalExpensesCents / 100,
      totalDistributed: totalDistributedCents / 100,
      history: [
        {
          id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          timestamp: now,
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: 'RASCUNHO_CRIADO',
          details: `Operação "${cleanName}" salva como rascunho (${sanitizedItems.length} itens, ${sanitizedParticipants.length} alunos).`,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.data.tripOperations.unshift(newOp);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'CRIAR_RASCUNHO_PDV_PASSEIO',
      'PDV_PASSEIOS',
      `Rascunho de passeio "${newOp.name}" (${newOp.id}) criado com ${sanitizedParticipants.length} participantes.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('trip_operations', newOp, 'mapTripOperationToSupabase');
    return newOp;
  }

  public deleteTripOperationDraft(
    operationId: string,
    user: { id: string; name: string; role: any }
  ): { success: boolean; deletedId: string } {
    if (!Array.isArray(this.data.tripOperations)) {
      this.data.tripOperations = [];
    }
    const idx = this.data.tripOperations.findIndex(op => op.id === operationId);
    if (idx === -1) {
      throw new Error('Operação de passeio não encontrada.');
    }
    const target = this.data.tripOperations[idx];
    if (target.status !== 'RASCUNHO') {
      throw new Error('Operações já lançadas no financeiro não podem ser excluídas silenciosamente. Utilize o estorno auditável.');
    }

    this.data.tripOperations.splice(idx, 1);

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'EXCLUIR_RASCUNHO_PDV_PASSEIO',
      'PDV_PASSEIOS',
      `Rascunho de passeio "${target.name}" (${target.id}) descartado antes do lançamento financeiro.`
    );

    this.saveDatabase();
    this.triggerSupabaseDelete('trip_operations', operationId);
    return { success: true, deletedId: operationId };
  }

  public confirmAndLaunchTripOperation(
    payload: {
      id?: string;
      catalogPasseioId?: string;
      name: string;
      description?: string;
      tripDate: string;
      destination: string;
      notes?: string;
      responsibleUserId?: string;
      responsibleUserName?: string;
      selectionMode: 'ALL_STUDENTS' | 'SPECIFIC_STUDENTS';
      distributionMethod: TripDistributionMethod;
      fixedValuePerStudent?: number;
      items: TripExpenseItem[];
      participants: TripParticipantAllocation[];
      idempotencyKey?: string;
    },
    user: { id: string; name: string; role: any }
  ): { operation: TripOperation; salesCreated: Sale[]; updatedStudents: Student[] } {
    if (!Array.isArray(this.data.tripOperations)) {
      this.data.tripOperations = [];
    }

    // 1. Verificar idempotência para evitar lançamentos duplicados
    if (payload.idempotencyKey) {
      const alreadyLaunched = this.data.tripOperations.find(
        op => op.idempotencyKey === payload.idempotencyKey && op.status === 'LANCADO'
      );
      if (alreadyLaunched) {
        const existingSales = this.data.sales.filter(s => s.tripOperationId === alreadyLaunched.id);
        const existingStudents = this.data.students.filter(st =>
          alreadyLaunched.participants.some(p => p.studentId === st.id)
        );
        return {
          operation: alreadyLaunched,
          salesCreated: existingSales,
          updatedStudents: existingStudents,
        };
      }
    }

    if (payload.id) {
      const existingById = this.data.tripOperations.find(op => op.id === payload.id);
      if (existingById && existingById.status === 'LANCADO') {
        throw new Error(`A operação ${existingById.id} ("${existingById.name}") já foi confirmada e lançada nas contas anteriormente.`);
      }
    }

    // 2. Salvar/atualizar como rascunho validado antes de executar a transação
    const draftOp = this.saveTripOperationDraft(payload, user);

    if (draftOp.items.length === 0) {
      throw new Error('Adicione pelo menos 1 produto ou despesa ao passeio antes de confirmar o lançamento.');
    }

    if (draftOp.participants.length === 0) {
      throw new Error('Selecione pelo menos 1 aluno participante antes de confirmar o lançamento.');
    }

    // 3. Validar precisão em centavos e ausência de divergência financeira silenciosa
    const totalExpensesCents = draftOp.items.reduce(
      (acc, it) => acc + Math.round(it.totalAmount * 100),
      0
    );
    const totalDistributedCents = draftOp.participants.reduce(
      (acc, p) => acc + Math.round(p.allocatedAmount * 100),
      0
    );

    if (totalDistributedCents <= 0) {
      throw new Error('O valor total distribuído aos alunos deve ser maior que R$ 0,00.');
    }

    if (totalExpensesCents !== totalDistributedCents) {
      const diffReais = ((totalDistributedCents - totalExpensesCents) / 100).toFixed(2);
      throw new Error(
        `Divergência financeira detectada: Total das Despesas (R$ ${(totalExpensesCents / 100).toFixed(2)}) difere do Total Distribuído aos Alunos (R$ ${(totalDistributedCents / 100).toFixed(2)}) em R$ ${diffReais}. Ajuste os valores antes de concluir.`
      );
    }

    // 4. Validar elegibilidade dos alunos selecionados e estoque (se houver produto físico do estoque)
    const targetStudentRecords: { participant: TripParticipantAllocation; student: Student }[] = [];
    for (const part of draftOp.participants) {
      if (part.allocatedCents <= 0) {
        throw new Error(`O participante ${part.studentName} está com valor R$ 0,00. Remova-o da seleção ou atribua um valor válido.`);
      }
      const st = this.data.students.find(s => s.id === part.studentId);
      if (!st) {
        throw new Error(`Aluno participante "${part.studentName}" não encontrado no cadastro.`);
      }
      if (st.status !== 'ACTIVE') {
        throw new Error(`O aluno "${st.name}" está INATIVO e não é elegível para receber lançamentos.`);
      }
      targetStudentRecords.push({ participant: part, student: st });
    }

    // Verificar estoque para itens físicos vinculados ao estoque da lojinha
    for (const item of draftOp.items) {
      if (item.storeProductId && item.deductFromStock) {
        const product = this.data.products.find(p => p.id === item.storeProductId);
        if (!product) {
          throw new Error(`Produto do estoque vinculado "${item.name}" não encontrado.`);
        }
        if (product.archived || product.status !== 'ACTIVE') {
          throw new Error(`O produto "${product.name}" está arquivado/inativo e não pode ser baixado do estoque.`);
        }
        if (product.currentStock < item.quantity) {
          throw new Error(
            `Estoque insuficiente para "${product.name}". Disponível: ${product.currentStock}, Necessário no passeio: ${item.quantity}.`
          );
        }
      }
    }

    // 5. Execução Transacional: Baixar estoque (se aplicável) + Gerar lançamentos individuais nas contas dos alunos
    const now = new Date().toISOString();
    const billingPeriod = (draftOp.tripDate && draftOp.tripDate.length >= 7)
      ? draftOp.tripDate.substring(0, 7)
      : now.substring(0, 7);

    for (const item of draftOp.items) {
      if (item.storeProductId && item.deductFromStock) {
        const product = this.data.products.find(p => p.id === item.storeProductId)!;
        const prevStock = product.currentStock;
        product.currentStock = Math.max(0, product.currentStock - item.quantity);
        product.updatedAt = now;

        const movement: StockMovement = {
          id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          productId: product.id,
          productName: product.name,
          type: 'SAIDA_VENDA',
          quantity: -item.quantity,
          previousStock: prevStock,
          newStock: product.currentStock,
          reason: `PDV de Passeios (${draftOp.id} - ${draftOp.name})`,
          performedByUserId: user.id,
          performedByUserName: user.name,
          referenceId: draftOp.id,
          timestamp: now,
        };
        this.data.stockMovements.unshift(movement);
        this.triggerSupabaseSync('products', product, 'mapProductToSupabase');
        this.triggerSupabaseSync('stock_movements', movement, 'mapStockMovementToSupabase');
      }
    }

    const salesCreated: Sale[] = [];
    const updatedStudents: Student[] = [];

    targetStudentRecords.forEach(({ participant, student }, idx) => {
      const saleId = `PAS-${Date.now().toString().slice(-6)}-${String(idx + 1).padStart(2, '0')}`;

      // Garantir que cada aluno tenha os itens detalhados na sua conta
      const rawItems = participant.items && participant.items.length > 0
        ? participant.items
        : draftOp.items.map(it => {
            const ratio = totalExpensesCents > 0 ? participant.allocatedCents / totalExpensesCents : 1 / targetStudentRecords.length;
            const itemAmount = Math.round(it.totalAmount * ratio * 100) / 100;
            return {
              expenseItemId: it.id,
              name: it.name,
              category: it.category,
              itemType: it.itemType,
              quantity: 1,
              unitPrice: itemAmount,
              amount: itemAmount,
              description: it.description,
              notes: it.notes,
            };
          });

      const saleItems: SaleItem[] = rawItems.map(pi => ({
        productId: pi.expenseItemId || `trip-item-${draftOp.id}`,
        name: `${pi.name} (${draftOp.name})`,
        category: this.mapTripCategoryToProductCategory(pi.category),
        unitPrice: Math.round(pi.unitPrice * 100) / 100,
        quantity: pi.quantity || 1,
        subtotal: Math.round(pi.amount * 100) / 100,
        tripItemType: pi.itemType,
        tripCategory: pi.category,
        description: pi.description || draftOp.description,
        notes: pi.notes,
      }));

      // Ajuste fino de centavos no último item caso o detalhamento proporcional tenha 1 centavo de diferença para fechar exatamente com allocatedAmount
      const sumSaleItemsCents = saleItems.reduce((acc, si) => acc + Math.round(si.subtotal * 100), 0);
      if (saleItems.length > 0 && sumSaleItemsCents !== participant.allocatedCents) {
        const diffCents = participant.allocatedCents - sumSaleItemsCents;
        const lastItem = saleItems[saleItems.length - 1];
        lastItem.subtotal = Math.round((lastItem.subtotal * 100 + diffCents)) / 100;
        if (lastItem.quantity === 1) {
          lastItem.unitPrice = lastItem.subtotal;
        }
      }

      const saleTotal = participant.allocatedCents / 100;

      const newSale: Sale = {
        id: saleId,
        studentId: student.id,
        studentName: student.name,
        registrationNumber: student.registrationNumber,
        items: saleItems,
        total: saleTotal,
        operatorUserId: draftOp.responsibleUserId || user.id,
        operatorUserName: draftOp.responsibleUserName || user.name,
        status: 'COMPLETED',
        billingPeriod,
        idempotencyKey: payload.idempotencyKey ? `${payload.idempotencyKey}-${student.id}` : undefined,
        origin: 'PDV_PASSEIOS',
        tripOperationId: draftOp.id,
        tripName: draftOp.name,
        tripDate: draftOp.tripDate,
        tripDestination: draftOp.destination,
        createdAt: now,
      };

      // Atualizar saldo de consumo aberto e dívida total na conta individual do aluno
      student.currentConsumptionBalance = Math.round((student.currentConsumptionBalance + saleTotal) * 100) / 100;
      student.totalOpenDebt = Math.round((student.totalOpenDebt + saleTotal) * 100) / 100;

      // Registrar no Livro Razão Financeiro (Ledger)
      const itemsBreakdownText = rawItems
        .map(ri => `${ri.name}: R$ ${ri.amount.toFixed(2)}`)
        .join(' | ');

      this.data.financialLedger.unshift({
        id: `LED-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
        timestamp: now,
        studentId: student.id,
        type: 'DEBITO',
        category: 'PDV_PASSEIOS',
        amount: saleTotal,
        description: `PDV de Passeios: ${draftOp.name} (${draftOp.tripDate}) — [${itemsBreakdownText}]`,
        documentRef: newSale.id,
        performedByUserName: draftOp.responsibleUserName || user.name,
      });

      this.data.sales.unshift(newSale);

      const tripReceipt = this.createReceiptForSale(newSale, student, user, {
        terminalId: 'PDV-PASSEIOS',
        skipSave: true
      });

      participant.saleId = newSale.id;
      participant.status = 'LANCADO';

      salesCreated.push(newSale);
      updatedStudents.push(student);

      this.triggerSupabaseSync('sales', newSale, 'mapSaleToSupabase');
      this.triggerSupabaseSync('sales_receipts', tripReceipt, 'mapReceiptToSupabase');
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    });

    draftOp.status = 'LANCADO';
    draftOp.idempotencyKey = payload.idempotencyKey || `IDEMP-${draftOp.id}`;
    draftOp.launchedAt = now;
    draftOp.launchedByUserName = user.name;
    draftOp.updatedAt = now;

    draftOp.history.unshift({
      id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: now,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'LANCAMENTO_CONFIRMADO',
      details: `Lançamento financeiro confirmado para ${salesCreated.length} aluno(s). Total distribuído: R$ ${draftOp.totalDistributed.toFixed(2)}.`,
    });

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'CONFIRMAR_LANCAMENTO_PDV_PASSEIOS',
      'PDV_PASSEIOS',
      `Passeio "${draftOp.name}" (${draftOp.id}) lançado nas contas de ${salesCreated.length} aluno(s). Valor total: R$ ${draftOp.totalDistributed.toFixed(2)}.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('trip_operations', draftOp, 'mapTripOperationToSupabase');
    return {
      operation: draftOp,
      salesCreated,
      updatedStudents,
    };
  }

  public reverseTripParticipantLaunch(
    params: {
      operationId: string;
      studentId: string;
      reason: string;
    },
    user: { id: string; name: string; role: any }
  ): { operation: TripOperation; reversedSale?: Sale; updatedStudent?: Student } {
    const cleanReason = (params.reason || '').trim();
    if (!cleanReason) {
      throw new Error('A justificativa é obrigatória para realizar o estorno.');
    }

    const op = this.getTripOperations().find(o => o.id === params.operationId);
    if (!op) {
      throw new Error('Operação de passeio não encontrada.');
    }

    const participant = op.participants.find(p => p.studentId === params.studentId);
    if (!participant) {
      throw new Error('Participante não encontrado nesta operação de passeio.');
    }

    if (participant.status === 'ESTORNADO') {
      throw new Error(`O lançamento do aluno ${participant.studentName} já foi estornado anteriormente.`);
    }

    if (participant.status !== 'LANCADO' || !participant.saleId) {
      throw new Error('Este participante ainda não possui lançamento financeiro efetivado.');
    }

    const now = new Date().toISOString();
    const sale = this.data.sales.find(s => s.id === participant.saleId);
    const student = this.data.students.find(s => s.id === participant.studentId);

    if (sale && sale.status !== 'REVERSED') {
      sale.status = 'REVERSED';
      sale.reversedReason = `Estorno PDV de Passeios (${op.name}): ${cleanReason}`;
      sale.reversedByUserName = user.name;
      sale.reversedAt = now;

      if (student) {
        if (!sale.invoiceId) {
          // Lançamento ainda em consumo aberto mensal
          student.currentConsumptionBalance = Math.max(
            0,
            Math.round((student.currentConsumptionBalance - sale.total) * 100) / 100
          );
          student.totalOpenDebt = Math.max(
            0,
            Math.round((student.totalOpenDebt - sale.total) * 100) / 100
          );

          this.data.financialLedger.unshift({
            id: `LED-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: now,
            studentId: student.id,
            type: 'CREDITO',
            category: 'ESTORNO_VENDA',
            amount: sale.total,
            description: `Estorno PDV de Passeios (${op.name} - ${sale.id}) — Motivo: ${cleanReason}`,
            documentRef: sale.id,
            performedByUserName: user.name,
          });
        } else {
          // Se já houver fatura emitida, aplica ajuste de crédito auditável sem apagar documento histórico
          const invoice = this.data.invoices.find(inv => inv.id === sale.invoiceId);
          if (invoice && invoice.status !== 'CANCELADA') {
            invoice.adjustmentsTotal = Math.round(((invoice.adjustmentsTotal || 0) + sale.total) * 100) / 100;
            invoice.grossTotal = Math.max(
              0,
              Math.round((invoice.tuitionAmount + invoice.canteenConsumptionTotal - invoice.adjustmentsTotal) * 100) / 100
            );
            invoice.remainingBalance = Math.max(
              0,
              Math.round((invoice.grossTotal - invoice.paidTotal) * 100) / 100
            );
            if (invoice.remainingBalance === 0 && invoice.grossTotal > 0) {
              invoice.status = 'PAGA';
            }
            invoice.notes = `${invoice.notes ? invoice.notes + ' | ' : ''}Ajuste de estorno PDV de Passeios (${op.name}): -R$ ${sale.total.toFixed(2)} (${cleanReason})`;
            invoice.updatedAt = now;
            this.triggerSupabaseSync('invoices', invoice, 'mapInvoiceToSupabase');
          }

          student.totalOpenDebt = Math.max(
            0,
            Math.round((student.totalOpenDebt - sale.total) * 100) / 100
          );

          this.data.financialLedger.unshift({
            id: `LED-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: now,
            studentId: student.id,
            type: 'CREDITO',
            category: 'AJUSTE_CREDITO',
            amount: sale.total,
            invoiceId: sale.invoiceId,
            description: `Ajuste de Crédito por Estorno PDV de Passeios (${op.name}) em Fatura Emitida (${sale.invoiceId}) — Motivo: ${cleanReason}`,
            documentRef: sale.id,
            performedByUserName: user.name,
          });
        }
        this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
      }
      this.triggerSupabaseSync('sales', sale, 'mapSaleToSupabase');
      const tripRevReceipt = this.appendReceiptReversal(sale, {
        type: 'ESTORNO_TOTAL',
        reason: cleanReason,
        user,
        reversedAmount: sale.total,
      });
      if (tripRevReceipt) {
        this.triggerSupabaseSync('sales_receipts', tripRevReceipt, 'mapReceiptToSupabase');
      }
    }

    participant.status = 'ESTORNADO';
    participant.reversedReason = cleanReason;
    participant.reversedByUserName = user.name;
    participant.reversedAt = now;

    // Recalcular total distribuído ativo e status da operação
    const activeParticipants = op.participants.filter(p => p.status === 'LANCADO');
    op.totalDistributed =
      activeParticipants.reduce((acc, p) => acc + p.allocatedCents, 0) / 100;

    if (activeParticipants.length === 0) {
      op.status = 'ESTORNADO';
    } else {
      op.status = 'PARCIALMENTE_ESTORNADO';
    }
    op.updatedAt = now;

    op.history.unshift({
      id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: now,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'ESTORNO_INDIVIDUAL',
      details: `Estornado lançamento de R$ ${participant.allocatedAmount.toFixed(2)} do aluno ${participant.studentName}. Motivo: ${cleanReason}`,
    });

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'ESTORNAR_LANCAMENTO_PASSEIO_ALUNO',
      'PDV_PASSEIOS',
      `Estorno no passeio "${op.name}" (${op.id}) para o aluno ${participant.studentName} (R$ ${participant.allocatedAmount.toFixed(2)}). Motivo: ${cleanReason}`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('trip_operations', op, 'mapTripOperationToSupabase');
    return { operation: op, reversedSale: sale, updatedStudent: student };
  }

  public reverseEntireTripOperation(
    params: {
      operationId: string;
      reason: string;
    },
    user: { id: string; name: string; role: any }
  ): TripOperation {
    const cleanReason = (params.reason || '').trim();
    if (!cleanReason) {
      throw new Error('A justificativa é obrigatória para estornar a operação de passeio.');
    }

    const op = this.getTripOperations().find(o => o.id === params.operationId);
    if (!op) {
      throw new Error('Operação de passeio não encontrada.');
    }

    const activeParticipants = op.participants.filter(p => p.status === 'LANCADO');
    if (activeParticipants.length === 0) {
      throw new Error('Todos os lançamentos desta operação já se encontram estornados.');
    }

    for (const part of activeParticipants) {
      this.reverseTripParticipantLaunch(
        {
          operationId: op.id,
          studentId: part.studentId,
          reason: cleanReason,
        },
        user
      );
    }

    // Reverter estoque de itens físicos vinculados, se houver
    const now = new Date().toISOString();
    for (const item of op.items) {
      if (item.storeProductId && item.deductFromStock) {
        const product = this.data.products.find(p => p.id === item.storeProductId);
        if (product) {
          const prevStock = product.currentStock;
          product.currentStock += item.quantity;
          product.updatedAt = now;
          const reversalMovement: StockMovement = {
            id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            productId: product.id,
            productName: product.name,
            type: 'ESTORNO_VENDA',
            quantity: item.quantity,
            previousStock: prevStock,
            newStock: product.currentStock,
            reason: `Estorno integral PDV de Passeios (${op.id} - ${op.name}): ${cleanReason}`,
            performedByUserId: user.id,
            performedByUserName: user.name,
            referenceId: op.id,
            timestamp: now,
          };
          this.data.stockMovements.unshift(reversalMovement);
          this.triggerSupabaseSync('products', product, 'mapProductToSupabase');
          this.triggerSupabaseSync('stock_movements', reversalMovement, 'mapStockMovementToSupabase');
        }
      }
    }

    op.status = 'ESTORNADO';
    op.totalDistributed = 0;
    op.updatedAt = now;

    op.history.unshift({
      id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: now,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'ESTORNO_INTEGRAL_OPERACAO',
      details: `Operação "${op.name}" integralmente estornada (${activeParticipants.length} lançamentos revertidos). Motivo: ${cleanReason}`,
    });

    this.saveDatabase();
    this.triggerSupabaseSync('trip_operations', op, 'mapTripOperationToSupabase');
    return op;
  }

  public resetToSeed(
    user: { id: string; name: string; role: any },
    options?: { simulateFailure?: boolean }
  ) {
    const backupSnapshot = this.takeSnapshot();
    const prevPendingUpserts = this.clonePendingUpserts();
    const prevPendingDeletes = this.clonePendingDeletes();

    try {
      const nextSettings = deepCloneData(initialSettings);
      if (this.disableSupabase) {
        nextSettings.supabaseActive = false;
      }

      const preservedPasswordsById = new Map<string, string>();
      for (const prevUser of backupSnapshot.users || []) {
        if (prevUser.password) {
          preservedPasswordsById.set(prevUser.id, prevUser.password);
        }
      }

      const restoredUsers = deepCloneData(initialUsers).map(u => {
        const prevHash = preservedPasswordsById.get(u.id);
        return prevHash ? { ...u, password: prevHash } : u;
      });

      this.data = {
        settings: nextSettings,
        users: restoredUsers,
        guardians: deepCloneData(initialGuardians),
        students: deepCloneData(initialStudents),
        products: deepCloneData(initialProducts),
        stockMovements: deepCloneData(initialStockMovements),
        sales: deepCloneData(initialSales),
        financialLedger: deepCloneData(initialFinancialLedger),
        invoices: deepCloneData(initialInvoices),
        billingBatches: [],
        receipts: [],
        pixPayments: deepCloneData(initialPixPayments),
        whatsappNotifications: deepCloneData(initialWhatsAppNotifications),
        auditLogs: deepCloneData(initialAuditLogs),
        passeios: deepCloneData(initialPasseios),
        tripOperations: [],
        cashSessions: [],
        cashMovements: [],
      };

      this.ensureReceiptsForExistingSales();

      if (options?.simulateFailure) {
        throw new Error('Falha simulada durante a restauração dos dados iniciais.');
      }

      const integrity = this.validateIntegrity();
      if (!integrity.healthy) {
        throw new Error(`Estado restaurado falhou na verificação de integridade: ${integrity.issues[0]?.message || 'inconsistência detectada'}`);
      }

      this.logAudit(
        user.id,
        user.name,
        user.role,
        'RESET_BASE_DE_DADOS',
        'SISTEMA',
        'Base de dados restaurada com sucesso para o estado inicial de teste (backup prévio criado).'
      );
      this.writeDatabaseSync(this.data, true);

      return {
        success: true,
        backupCreated: true,
        restoredAt: new Date().toISOString(),
        counts: {
          students: this.data.students.length,
          products: this.data.products.length,
          sales: this.data.sales.length,
          receipts: (this.data.receipts || []).length,
          invoices: this.data.invoices.length,
          passeios: this.data.passeios.length,
        },
      };
    } catch (err: any) {
      // Restaura integralmente o backup temporário em caso de erro
      this.data = backupSnapshot;
      this.pendingUpserts = prevPendingUpserts;
      this.pendingDeletes = prevPendingDeletes;
      this.writeDatabaseSync(this.data);
      throw new Error(
        `Falha ao restaurar os dados iniciais (o estado anterior foi preservado via backup): ${err?.message || 'erro interno'}`
      );
    }
  }
}

export const db = new DatabaseService();

