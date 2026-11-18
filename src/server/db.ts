import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { 
  User, 
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
  CashMovementType
} from '../types/index.ts';
import { generateBacenPixPayload } from '../utils/pix.ts';
import { getInitialsAvatar } from '../utils/avatar.ts';
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

class DatabaseService {
  private data: DatabaseSchema;
  private saveQueued = false;
  private supabaseModPromise: Promise<typeof import('./supabase.ts')> | null = null;

  constructor() {
    this.data = this.loadDatabase();
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

  private isPricePending(product?: { price?: number | null; priceStatus?: string } | null): boolean {
    if (!product) return true;
    if (product.priceStatus === 'PENDING') return true;
    if (product.price === null || product.price === undefined) return true;
    const num = Number(product.price);
    return Number.isNaN(num) || num <= 0;
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
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

            const isPending = p.priceStatus === 'PENDING' || p.price === null || p.price === undefined || Number(p.price) <= 0;
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
              price: isPending ? null : Number(p.price),
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
    } catch (err) {
      console.error('Erro ao ler base de dados JSON, iniciando com dados semente:', err);
    }

    const defaultData: DatabaseSchema = {
      settings: initialSettings,
      users: initialUsers,
      guardians: initialGuardians,
      students: initialStudents,
      products: initialProducts,
      stockMovements: initialStockMovements,
      sales: initialSales,
      financialLedger: initialFinancialLedger,
      invoices: initialInvoices,
      pixPayments: initialPixPayments,
      whatsappNotifications: initialWhatsAppNotifications,
      auditLogs: initialAuditLogs,
      passeios: initialPasseios,
      tripOperations: [],
      cashSessions: [],
      cashMovements: [],
    };

    this.saveDatabase(defaultData, true);
    return defaultData;
  }

  private writeDatabaseSync(dataToSave: DatabaseSchema) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Atomic write via temp file
      const tempPath = `${DB_FILE}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(dataToSave, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Falha ao persistir base de dados:', err);
    }
  }

  private saveDatabase(dataToSave?: DatabaseSchema, immediate = false) {
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
    status: 'SUCESSO' | 'FALHA' = 'SUCESSO'
  ) {
    const log: AuditLog = {
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      userId,
      userName,
      userRole,
      action,
      module,
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
  }

  public triggerSupabaseSync(table: string, record: any, mapperName: string) {
    setTimeout(async () => {
      try {
        if (!this.supabaseModPromise) {
          this.supabaseModPromise = import('./supabase.ts');
        }
        const supabaseMod = await this.supabaseModPromise;
        const mapper = (supabaseMod as any)[mapperName];
        await supabaseMod.syncRecordToSupabase(table, record, mapper);
      } catch (e) {
        // quiet background auto-sync
      }
    }, 0);
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

  public triggerSupabaseDelete(table: string, id: string) {
    setTimeout(async () => {
      try {
        const supabaseMod = await import('./supabase.ts');
        await supabaseMod.deleteRecordFromSupabase(table, id);
      } catch (e) {
        // quiet background delete
      }
    }, 0);
  }

  // --- REGRAS DE NEGÓCIO ---

  // 1. Atualizar configurações
  public updateSettings(newSettings: Partial<SystemSettings>, user: { id: string; name: string; role: any }) {
    this.data.settings = {
      ...this.data.settings,
      ...newSettings,
      updatedAt: new Date().toISOString(),
      updatedByUserName: user.name
    };
    this.logAudit(user.id, user.name, user.role, 'ATUALIZAR_CONFIGURACOES', 'CONFIGURACOES', 'Parâmetros de fechamento e sistema atualizados');
    this.saveDatabase();
    this.triggerSupabaseSync('settings', this.data.settings, 'mapSettingsToSupabase');
    return this.data.settings;
  }

  // 2. Operação de Venda no PDV (Caixa Rápido)
  public registerSale(params: {
    studentId: string;
    items: { productId: string; quantity: number }[];
    operatorUser: { id: string; name: string; role: any };
    idempotencyKey?: string;
    paymentMethod?: PaymentMethod;
    discountAmount?: number;
    notes?: string;
  }): { sale: Sale; student: Student } {
    const {
      studentId,
      items,
      operatorUser,
      idempotencyKey,
      paymentMethod = 'CONTA_ALUNO',
      discountAmount = 0,
      notes
    } = params;

    // Idempotency check
    if (idempotencyKey) {
      const existingSale = this.data.sales.find(s => s.idempotencyKey === idempotencyKey);
      if (existingSale) {
        const student = this.data.students.find(s => s.id === studentId)!;
        return { sale: existingSale, student };
      }
    }

    const student = this.data.students.find(s => s.id === studentId);
    if (!student) {
      throw new Error(`Aluno com ID ${studentId} não encontrado.`);
    }

    if (student.status !== 'ACTIVE') {
      throw new Error(`O aluno ${student.name} está inativo e não pode realizar compras.`);
    }

    if (paymentMethod === 'CONTA_ALUNO' && student.consumptionBlocked) {
      throw new Error(
        `Consumo temporariamente bloqueado para ${student.name}${student.consumptionBlockedReason ? `: ${student.consumptionBlockedReason}` : '.'}`
      );
    }

    if (!items || items.length === 0) {
      throw new Error('A venda deve conter pelo menos 1 item.');
    }

    // Conferência rigorosa de preço, status e bloqueio de estoque
    const aggregatedQuantities = new Map<string, number>();
    for (const item of items) {
      if (!item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error('Quantidade inválida no carrinho. Todos os itens devem ter quantidade maior que zero.');
      }
      aggregatedQuantities.set(item.productId, (aggregatedQuantities.get(item.productId) || 0) + item.quantity);
    }

    const saleItems: Sale['items'] = [];
    let subtotalBeforeDiscount = 0;

    for (const [productId, totalQty] of aggregatedQuantities.entries()) {
      const product = this.data.products.find(p => p.id === productId);
      if (!product) {
        throw new Error(`Produto ID ${productId} não encontrado.`);
      }

      if (product.archived || product.status !== 'ACTIVE') {
        throw new Error(`O produto "${product.name}" está inativo/arquivado e não pode ser vendido.`);
      }

      if (this.isPricePending(product)) {
        throw new Error(`O produto "${product.name}" está com preço não definido e está bloqueado para venda até definição pelo administrador.`);
      }

      if (this.data.settings.blockSaleWithoutStock !== false && product.currentStock < totalQty) {
        throw new Error(`Estoque insuficiente para o produto "${product.name}". Disponível: ${product.currentStock}, Solicitado: ${totalQty}`);
      }

      const unitPrice = Number(product.price);
      const subtotal = Math.round((unitPrice * totalQty) * 100) / 100;
      subtotalBeforeDiscount += subtotal;

      saleItems.push({
        productId: product.id,
        name: product.name,
        category: product.category,
        unitPrice, // PRESERVA PREÇO HISTÓRICO
        quantity: totalQty,
        subtotal
      });
    }

    subtotalBeforeDiscount = Math.round(subtotalBeforeDiscount * 100) / 100;
    const cleanDiscount = Math.max(0, Math.round((Number(discountAmount) || 0) * 100) / 100);
    if (cleanDiscount > 0) {
      if (operatorUser.role !== 'ADMIN' && operatorUser.role !== 'MANAGER') {
        throw new Error('Descontos exigem autorização de Administrador ou Gerente.');
      }
      if (cleanDiscount > subtotalBeforeDiscount) {
        throw new Error('O desconto não pode ser maior que o subtotal da venda.');
      }
    }

    const saleTotal = Math.max(0, Math.round((subtotalBeforeDiscount - cleanDiscount) * 100) / 100);

    // Enforce individual consumption limit if charging to student account
    if (
      paymentMethod === 'CONTA_ALUNO' &&
      typeof student.consumptionLimit === 'number' &&
      student.consumptionLimit > 0
    ) {
      const projectedBalance = Math.round((student.currentConsumptionBalance + saleTotal) * 100) / 100;
      if (projectedBalance > student.consumptionLimit) {
        throw new Error(
          `Compra excede o limite de consumo de ${student.name} (Limite: R$ ${student.consumptionLimit.toFixed(2)} • Saldo projetado: R$ ${projectedBalance.toFixed(2)}).`
        );
      }
    }

    const currentPeriod = new Date().toISOString().substring(0, 7); // e.g. '2026-10'
    const saleId = `VEN-${Date.now().toString().slice(-6)}`;
    const activeSession = this.getActiveCashSession();

    // Criar registro de venda
    const newSale: Sale = {
      id: saleId,
      studentId: student.id,
      studentName: student.name,
      registrationNumber: student.registrationNumber,
      items: saleItems,
      total: saleTotal,
      subtotalBeforeDiscount,
      discountAmount: cleanDiscount > 0 ? cleanDiscount : undefined,
      paymentMethod,
      cashSessionId: activeSession?.id,
      notes: notes?.trim() || undefined,
      operatorUserId: operatorUser.id,
      operatorUserName: operatorUser.name,
      status: 'COMPLETED',
      billingPeriod: currentPeriod,
      idempotencyKey,
      createdAt: new Date().toISOString()
    };

    // Atualizar estoque e gerar movimentações
    for (const item of saleItems) {
      const product = this.data.products.find(p => p.id === item.productId)!;
      const prevStock = product.currentStock;
      product.currentStock = Math.max(0, product.currentStock - item.quantity);
      product.updatedAt = new Date().toISOString();

      const movement: StockMovement = {
        id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        productId: product.id,
        productName: product.name,
        type: 'SAIDA_VENDA',
        quantity: -item.quantity,
        previousStock: prevStock,
        newStock: product.currentStock,
        reason: `Venda ${newSale.id} (${paymentMethod}) - Aluno: ${student.name}`,
        performedByUserId: operatorUser.id,
        performedByUserName: operatorUser.name,
        referenceId: newSale.id,
        timestamp: new Date().toISOString()
      };
      this.data.stockMovements.unshift(movement);

      // Checar se disparar alerta de estoque baixo
      if (product.currentStock <= product.minStock) {
        this.data.whatsappNotifications.unshift({
          id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 100)}`,
          type: 'ALERTA_ESTOQUE',
          recipientName: 'Coordenação Lojinha',
          recipientPhone: '(11) 98765-4321',
          recipientRole: 'ADMIN',
          studentName: 'Estoque da Lojinha',
          messageText: `⚠️ Atenção: O item "${product.name}" atingiu ${product.currentStock} ${product.unit} (estoque mínimo: ${product.minStock}).`,
          status: 'ENTREGUE',
          scheduledFor: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          attemptsCount: 1
        });
      }
    }

    if (paymentMethod === 'CONTA_ALUNO') {
      // Atualizar saldo do aluno (consumo na conta mensal)
      student.currentConsumptionBalance = Math.round((student.currentConsumptionBalance + saleTotal) * 100) / 100;
      student.totalOpenDebt = Math.round((student.totalOpenDebt + saleTotal) * 100) / 100;

      // Criar lançamento no livro financeiro
      this.data.financialLedger.unshift({
        id: `LED-${Date.now()}-${Math.floor(Math.random() * 100)}`,
        timestamp: new Date().toISOString(),
        studentId: student.id,
        type: 'DEBITO',
        category: 'CONSUMO_LOJINHA',
        amount: saleTotal,
        description: `Consumo Lojinha - Venda ${newSale.id} (${saleItems.length} itens)`,
        documentRef: newSale.id,
        performedByUserName: operatorUser.name
      });
    } else {
      // Venda paga no ato (Dinheiro, PIX, Cartão, Mercado Pago): registrar quitação no livro financeiro
      this.data.financialLedger.unshift({
        id: `LED-${Date.now()}-${Math.floor(Math.random() * 100)}`,
        timestamp: new Date().toISOString(),
        studentId: student.id,
        type: 'CREDITO',
        category: 'PAGAMENTO_PIX',
        amount: saleTotal,
        description: `Venda paga à vista (${paymentMethod}) - ${newSale.id} (${saleItems.length} itens)`,
        documentRef: newSale.id,
        performedByUserName: operatorUser.name
      });
    }

    // Registrar movimentação no Caixa se houver sessão aberta
    if (activeSession) {
      if (!Array.isArray(this.data.cashMovements)) this.data.cashMovements = [];
      const movTypeMap: Record<PaymentMethod, CashMovementType> = {
        DINHEIRO: 'VENDA_DINHEIRO',
        PIX: 'VENDA_PIX',
        CARTAO_CREDITO: 'VENDA_CARTAO',
        CARTAO_DEBITO: 'VENDA_CARTAO',
        MERCADO_PAGO: 'VENDA_MERCADO_PAGO',
        CONTA_ALUNO: 'VENDA_CONTA_ALUNO'
      };
      this.data.cashMovements.unshift({
        id: `CMOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        sessionId: activeSession.id,
        type: movTypeMap[paymentMethod] || 'VENDA_CONTA_ALUNO',
        paymentMethod,
        amount: saleTotal,
        description: `Venda ${newSale.id} (${student.name}) — ${paymentMethod}`,
        referenceId: newSale.id,
        performedByUserId: operatorUser.id,
        performedByUserName: operatorUser.name,
        timestamp: new Date().toISOString()
      });
    }

    this.data.sales.unshift(newSale);

    this.logAudit(
      operatorUser.id,
      operatorUser.name,
      operatorUser.role,
      'REGISTRO_VENDA_PDV',
      'VENDAS',
      `Venda ${newSale.id} (R$ ${saleTotal.toFixed(2)}) para ${student.name} via ${paymentMethod}${cleanDiscount > 0 ? ` (desconto R$ ${cleanDiscount.toFixed(2)})` : ''}.`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('sales', newSale, 'mapSaleToSupabase');
    this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    return { sale: newSale, student };
  }

  // 3. Estorno de Venda no PDV
  public reverseSale(saleId: string, reason: string, user: { id: string; name: string; role: any }) {
    const sale = this.data.sales.find(s => s.id === saleId);
    if (!sale) {
      throw new Error(`Venda ${saleId} não encontrada.`);
    }

    if (sale.status === 'REVERSED') {
      throw new Error(`A venda ${saleId} já foi estornada anteriormente.`);
    }

    const student = this.data.students.find(s => s.id === sale.studentId);
    if (!student) {
      throw new Error(`Aluno associado à venda não encontrado.`);
    }

    // Reverter estoque
    for (const item of sale.items) {
      const product = this.data.products.find(p => p.id === item.productId);
      if (product) {
        const prevStock = product.currentStock;
        product.currentStock += item.quantity;
        product.updatedAt = new Date().toISOString();

        this.data.stockMovements.unshift({
          id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          productId: product.id,
          productName: product.name,
          type: 'ESTORNO_VENDA',
          quantity: item.quantity,
          previousStock: prevStock,
          newStock: product.currentStock,
          reason: `Estorno de venda ${sale.id}: ${reason}`,
          performedByUserId: user.id,
          performedByUserName: user.name,
          referenceId: sale.id,
          timestamp: new Date().toISOString()
        });
      }
    }

    const saleMethod = sale.paymentMethod || 'CONTA_ALUNO';
    if (saleMethod === 'CONTA_ALUNO') {
      // Abater do consumo acumulado
      student.currentConsumptionBalance = Math.max(0, Math.round((student.currentConsumptionBalance - sale.total) * 100) / 100);
      student.totalOpenDebt = Math.max(0, Math.round((student.totalOpenDebt - sale.total) * 100) / 100);
    }

    // Registro no livro financeiro
    this.data.financialLedger.unshift({
      id: `LED-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      timestamp: new Date().toISOString(),
      studentId: student.id,
      type: 'CREDITO',
      category: 'ESTORNO_VENDA',
      amount: sale.total,
      description: `Estorno de venda ${sale.id} (${saleMethod}) - Motivo: ${reason}`,
      documentRef: sale.id,
      performedByUserName: user.name
    });

    const activeSession = this.getActiveCashSession();
    if (activeSession) {
      if (!Array.isArray(this.data.cashMovements)) this.data.cashMovements = [];
      this.data.cashMovements.unshift({
        id: `CMOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        sessionId: activeSession.id,
        type: 'ESTORNO',
        paymentMethod: saleMethod,
        amount: sale.total,
        description: `Estorno venda ${sale.id} (${student.name}): ${reason}`,
        referenceId: sale.id,
        performedByUserId: user.id,
        performedByUserName: user.name,
        timestamp: new Date().toISOString()
      });
    }

    sale.status = 'REVERSED';
    sale.reversedReason = reason;
    sale.reversedByUserName = user.name;
    sale.reversedAt = new Date().toISOString();

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'ESTORNO_VENDA_PDV',
      'VENDAS',
      `Estorno da venda ${sale.id} (R$ ${sale.total.toFixed(2)}) de ${student.name}. Motivo: ${reason}`
    );

    this.saveDatabase();
    this.triggerSupabaseSync('sales', sale, 'mapSaleToSupabase');
    this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    return { sale, student };
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

    this.data.stockMovements.unshift({
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
    });

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
    this.data.cashMovements.unshift({
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
    });

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'ABERTURA_CAIXA',
      'CAIXA',
      `Caixa ${session.id} aberto com saldo inicial de R$ ${cleanOpening.toFixed(2)}.`
    );

    this.saveDatabase();
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

    this.data.financialLedger.unshift({
      id: `LED-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      timestamp: new Date().toISOString(),
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
    return student;
  }

  // 5. Salvar / Editar produto (garante que preços de vendas passadas não se alteram)
  public saveProduct(productData: Partial<Product>, user: { id: string; name: string; role: any }) {
    const parsePriceFields = (rawPrice: any, rawStatus?: any): { price: number | null; priceStatus: 'DEFINED' | 'PENDING' } => {
      if (rawStatus === 'PENDING' || rawPrice === null || rawPrice === undefined || rawPrice === '') {
        return { price: null, priceStatus: 'PENDING' };
      }
      const numeric = Number(rawPrice);
      if (Number.isNaN(numeric) || numeric < 0) {
        throw new Error('O preço do produto não pode ser negativo.');
      }
      if (numeric === 0) {
        throw new Error('Informe um preço maior que R$ 0,00 ou marque o produto como "Preço não definido".');
      }
      return { price: Math.round(numeric * 100) / 100, priceStatus: 'DEFINED' };
    };

    const formatPriceLabel = (val: number | null | undefined, status?: string) => {
      if (status === 'PENDING' || val === null || val === undefined || Number.isNaN(Number(val)) || Number(val) <= 0) {
        return 'Preço não definido';
      }
      return `R$ ${Number(val).toFixed(2)}`;
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

      if (nextStock !== oldStock) {
        this.data.stockMovements.unshift({
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
        });
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

  // 6. Prévia de Fechamento Mensal
  public getMonthlyClosingPreview(period: string): MonthlyClosingPreview {
    // period e.g. '2026-10'
    const eligibleStudents = this.data.students.filter(s => s.status === 'ACTIVE');
    const existingInvoices = this.data.invoices.filter(i => i.billingPeriod === period && i.status !== 'CANCELADA');

    let totalTuitions = 0;
    let totalConsumptions = 0;
    let pendingUnpaidSalesCount = 0;
    const inconsistencies: MonthlyClosingPreview['inconsistencies'] = [];

    // Checar vendas em aberto (não faturadas)
    const unbilledSales = this.data.sales.filter(s => s.status === 'COMPLETED' && !s.invoiceId);
    pendingUnpaidSalesCount = unbilledSales.length;

    const isTuitionEnabled = Boolean(this.data.settings.tuitionBillingActive);

    for (const student of eligibleStudents) {
      const studentTuition = isTuitionEnabled ? (Number(student.defaultTuition) || 0) : 0;
      totalTuitions += studentTuition;

      // Calcular consumo em aberto do aluno na Lojinha
      const studentSales = unbilledSales.filter(s => s.studentId === student.id);
      const salesSum = studentSales.reduce((acc, sale) => acc + sale.total, 0);
      const studentConsumption = Math.max(salesSum, Number(student.currentConsumptionBalance) || 0);
      totalConsumptions += studentConsumption;

      // Inconsistências
      const alreadyHasInvoice = existingInvoices.some(i => i.studentId === student.id);
      if (alreadyHasInvoice) {
        inconsistencies.push({
          studentId: student.id,
          studentName: student.name,
          severity: 'WARNING',
          message: `O aluno já possui cobrança gerada para ${period}. Não será duplicada.`
        });
      }

      if (student.guardians.length === 0 && (student.payerRule === 'GUARDIAN' || student.payerRule === 'GUARDIAN_ONLY')) {
        inconsistencies.push({
          studentId: student.id,
          studentName: student.name,
          severity: 'BLOCKER',
          message: `Aluno configurado como 'Pagamento Exclusivo pelo Responsável', mas não possui responsável vinculado.`
        });
      }
    }

    const totalGrossToBill = Math.round((totalTuitions + totalConsumptions) * 100) / 100;

    return {
      period,
      studentsCount: eligibleStudents.length,
      totalTuitions: Math.round(totalTuitions * 100) / 100,
      totalConsumptions: Math.round(totalConsumptions * 100) / 100,
      totalPreviousBalances: 0,
      totalGrossToBill,
      pendingUnpaidSalesCount,
      existingInvoicesCount: existingInvoices.length,
      inconsistencies,
      canProceed: !inconsistencies.some(inc => inc.severity === 'BLOCKER')
    };
  }

  // 7. Executar Fechamento Mensal e Publicar Faturas
  public executeMonthlyClosing(period: string, user: { id: string; name: string; role: any }) {
    const preview = this.getMonthlyClosingPreview(period);
    if (!preview.canProceed) {
      throw new Error('Não é possível fechar o mês devido a inconsistências impeditivas.');
    }

    const eligibleStudents = this.data.students.filter(s => s.status === 'ACTIVE');
    const createdInvoices: Invoice[] = [];
    const now = new Date();

    // Data de vencimento baseada no offset de configurações
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10); // 1-12
    
    // Mês seguinte para vencimento
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const dueDay = this.data.settings.dueDayOffset;
    const dueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
    const closingDate = `${year}-${String(month).padStart(2, '0')}-28`;

    const isTuitionEnabled = Boolean(this.data.settings.tuitionBillingActive);

    for (const student of eligibleStudents) {
      // PREVENÇÃO DE DUPLICIDADE (Idempotência estrita)
      const existing = this.data.invoices.find(
        i => i.studentId === student.id && i.billingPeriod === period && i.status !== 'CANCELADA'
      );
      if (existing) {
        continue; // Não gerar faturas duplicadas!
      }

      // Vendas não faturadas para este aluno
      const studentSales = this.data.sales.filter(
        s => s.studentId === student.id && s.status === 'COMPLETED' && !s.invoiceId
      );

      const salesSum = studentSales.reduce((acc, s) => acc + s.total, 0);
      const consumptionTotal = Math.max(salesSum, Number(student.currentConsumptionBalance) || 0);
      const tuitionAmount = isTuitionEnabled ? (Number(student.defaultTuition) || 0) : 0;
      const grossTotal = Math.round((tuitionAmount + consumptionTotal) * 100) / 100;

      // Não gerar cobrança zerada (R$ 0,00)
      if (grossTotal <= 0) {
        continue;
      }

      // Agrupar itens de consumo para o extrato da cobrança
      const itemMap = new Map<string, { product: Product | undefined; name: string; category: any; qty: number; total: number }>();
      for (const sale of studentSales) {
        const isTripSale = sale.origin === 'PDV_PASSEIOS';
        const formattedTripDate = sale.tripDate ? sale.tripDate.split('-').reverse().join('/') : '';
        const tripPrefix = isTripSale && sale.tripName
          ? `[${sale.tripName}${formattedTripDate ? ` — ${formattedTripDate}` : ''}] `
          : '';
        for (const item of sale.items) {
          const key = isTripSale ? `${sale.id}_${item.productId}` : item.productId;
          const displayName = `${tripPrefix}${item.name}`;
          const current = itemMap.get(key) || {
            product: this.data.products.find(p => p.id === item.productId),
            name: displayName,
            category: isTripSale ? `PDV de Passeios • ${item.category}` : item.category,
            qty: 0,
            total: 0
          };
          current.qty += item.quantity;
          current.total += item.subtotal;
          itemMap.set(key, current);
        }
      }

      const consumptionItems = Array.from(itemMap.entries()).map(([productId, data]) => ({
        productId,
        productName: data.name,
        category: data.category,
        quantity: data.qty,
        averageUnitPrice: data.qty > 0 ? Math.round((data.total / data.qty) * 100) / 100 : 0,
        totalAmount: Math.round(data.total * 100) / 100
      }));

      const invoiceId = `FAT-${period.replace('-', '')}-${student.registrationNumber.replace('-', '')}`;

      // Vincular vendas a esta cobrança
      for (const sale of studentSales) {
        sale.invoiceId = invoiceId;
      }

      // Montar código Pix Copia e Cola no padrão oficial Bacen EMV
      const pixCode = generateBacenPixPayload({
        pixKey: this.data.settings.pixKey,
        receiverName: this.data.settings.pixReceiverName,
        city: this.data.settings.pixCity,
        amount: grossTotal,
        txId: invoiceId
      });

      const invoice: Invoice = {
        id: invoiceId,
        studentId: student.id,
        studentName: student.name,
        registrationNumber: student.registrationNumber,
        billingPeriod: period,
        tuitionAmount,
        canteenConsumptionTotal: Math.round(consumptionTotal * 100) / 100,
        previousBalance: 0,
        adjustmentsTotal: 0,
        grossTotal,
        paidTotal: 0,
        remainingBalance: grossTotal,
        closingDate,
        dueDate,
        status: 'PUBLICADA',
        salesIds: studentSales.map(s => s.id),
        consumptionItems,
        paymentAllocations: [],
        pixCopyPasteCode: pixCode,
        pixQrCodePayload: pixCode,
        approvedByUserName: user.name,
        approvedAt: now.toISOString(),
        publishedAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      createdInvoices.push(invoice);
      this.data.invoices.unshift(invoice);

      // Zerar o saldo de consumo aberto do aluno pois agora está faturado nesta cobrança
      student.currentConsumptionBalance = 0;
      const openInvoicesTotal = this.data.invoices
        .filter(i => i.studentId === student.id && i.status !== 'CANCELADA' && i.status !== 'PAGA')
        .reduce((acc, inv) => acc + inv.remainingBalance, 0);
      student.totalOpenDebt = Math.round(openInvoicesTotal * 100) / 100;

      // Disparar Notificações WhatsApp conforme preferências do Aluno
      this.scheduleInvoiceNotifications(invoice, student);
    }

    if (createdInvoices.length === 0) {
      throw new Error(`Nenhuma cobrança com saldo positivo pendente para gerar na competência ${period}.`);
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'FECHAMENTO_MENSAL_EXECUTADO',
      'FECHAMENTO',
      `Fechamento de ${period} concluído com sucesso. ${createdInvoices.length} cobranças geradas e publicadas.`
    );

    this.saveDatabase();
    createdInvoices.forEach(inv => this.triggerSupabaseSync('invoices', inv, 'mapInvoiceToSupabase'));
    return {
      period,
      invoicesCreated: createdInvoices.length,
      invoices: createdInvoices
    };
  }

  // 7.1 Excluir uma fatura individual
  public deleteInvoice(invoiceId: string, user: { id: string; name: string; role: any }) {
    const idx = this.data.invoices.findIndex(i => i.id === invoiceId);
    if (idx === -1) throw new Error('Cobrança não encontrada.');

    const deleted = this.data.invoices.splice(idx, 1)[0];

    // Desvincular vendas que apontavam para esta fatura
    for (const sale of this.data.sales) {
      if (sale.invoiceId === invoiceId) {
        sale.invoiceId = undefined;
      }
    }

    // Recalcular saldo de consumo aberto e dívida total do aluno
    const student = this.data.students.find(s => s.id === deleted.studentId);
    if (student) {
      const unbilledSalesTotal = this.data.sales
        .filter(s => s.studentId === student.id && s.status === 'COMPLETED' && !s.invoiceId)
        .reduce((acc, s) => acc + s.total, 0);
      student.currentConsumptionBalance = Math.round(unbilledSalesTotal * 100) / 100;

      const remainingOpenInvoices = this.data.invoices.filter(
        i => i.studentId === student.id && i.status !== 'CANCELADA' && i.status !== 'PAGA'
      );
      const openInvoicesTotal = remainingOpenInvoices.reduce((acc, inv) => acc + inv.remainingBalance, 0);
      student.totalOpenDebt = Math.round((openInvoicesTotal + student.currentConsumptionBalance) * 100) / 100;
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'EXCLUIR_FATURA',
      'FATURAMENTO',
      `Cobrança ${deleted.id} do aluno ${deleted.studentName} foi excluída permanentemente.`
    );

    this.saveDatabase();
    return { success: true, deletedId: invoiceId };
  }

  // 7.2 Excluir todas as faturas antigas de todos os estudantes (Deixar a base limpa)
  public clearAllInvoices(user: { id: string; name: string; role: any }) {
    const totalDeleted = this.data.invoices.length;
    this.data.invoices = [];

    // Limpar invoiceId de todas as vendas para que voltem a ser consumo em aberto na Lojinha
    for (const sale of this.data.sales) {
      sale.invoiceId = undefined;
    }

    // Recalcular currentConsumptionBalance e totalOpenDebt de todos os estudantes com base nas vendas reais
    for (const student of this.data.students) {
      const unbilledSalesTotal = this.data.sales
        .filter(s => s.studentId === student.id && s.status === 'COMPLETED' && !s.invoiceId)
        .reduce((acc, s) => acc + s.total, 0);
      student.currentConsumptionBalance = Math.round(unbilledSalesTotal * 100) / 100;
      student.totalOpenDebt = student.currentConsumptionBalance;
      this.triggerSupabaseSync('students', student, 'mapStudentToSupabase');
    }

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'LIMPAR_TODAS_FATURAS',
      'FATURAMENTO',
      `Todas as ${totalDeleted} faturas foram excluídas de todos os estudantes com sucesso. Saldos de consumo da Lojinha restaurados.`
    );

    this.saveDatabase();
    return { success: true, totalDeleted };
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
      this.data.whatsappNotifications.unshift({
        id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'NOVA_FATURA',
        recipientName: student.name,
        recipientPhone: student.phone,
        recipientRole: 'ALUNO',
        studentName: student.name,
        studentId: student.id,
        invoiceId: invoice.id,
        messageText: `Olá, ${student.name}! Seu fechamento da Lojinha Iceves ref. a ${invoice.billingPeriod} foi emitido. Valor Total: R$ ${invoice.grossTotal.toFixed(2)} ${detailsText}. Vencimento: ${invoice.dueDate}.`,
        status: 'ENTREGUE',
        scheduledFor: new Date().toISOString(),
        sentAt: new Date().toISOString(),
        attemptsCount: 1
      });
    }

    if (sendToGuardian) {
      for (const link of student.guardians) {
        const guardian = this.data.guardians.find(g => g.id === link.guardianId);
        if (guardian && guardian.phone) {
          this.data.whatsappNotifications.unshift({
            id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type: 'NOVA_FATURA',
            recipientName: guardian.name,
            recipientPhone: guardian.phone,
            recipientRole: 'RESPONSAVEL',
            studentName: student.name,
            studentId: student.id,
            invoiceId: invoice.id,
            messageText: `Prezado(a) ${guardian.name}, o fechamento de consumo da Lojinha Iceves de ${student.name} referente a ${invoice.billingPeriod} está disponível. Total: R$ ${invoice.grossTotal.toFixed(2)}. Vencimento: ${invoice.dueDate}.`,
            status: 'ENTREGUE',
            scheduledFor: new Date().toISOString(),
            sentAt: new Date().toISOString(),
            attemptsCount: 1
          });
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
        this.data.whatsappNotifications.unshift({
          id: `NOTIF-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type: 'CONFIRMACAO_PAGAMENTO',
          recipientName: payment.payerName,
          recipientPhone: '(11) 98111-2233',
          recipientRole: payment.payerRole,
          studentName: invoice.studentName,
          studentId: invoice.studentId,
          invoiceId: invoice.id,
          messageText: `Recebimento confirmado! O valor de R$ ${payment.amount.toFixed(2)} foi processado na fatura ${invoice.id}. Saldo restante da fatura: R$ ${invoice.remainingBalance.toFixed(2)}. Obrigado!`,
          status: 'ENTREGUE',
          scheduledFor: new Date().toISOString(),
          sentAt: new Date().toISOString(),
          attemptsCount: 1
        });
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
        if (updates.name) u.name = updates.name;
        if (updates.avatar) u.avatar = updates.avatar;
        if (updates.email) u.email = updates.email;
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
      password: cleanPassword,
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

  // 10.1 Atualização flexível de Mensalidade e Ajustes na Fatura
  public updateInvoice(
    invoiceId: string, 
    updates: { tuitionAmount?: number; adjustmentsTotal?: number; notes?: string }, 
    user: { id: string; name: string; role: any }
  ) {
    const invoice = this.data.invoices.find(i => i.id === invoiceId);
    if (!invoice) throw new Error('Fatura não encontrada.');

    if (updates.tuitionAmount !== undefined) {
      invoice.tuitionAmount = Math.max(0, Number(updates.tuitionAmount) || 0);
    }
    if (updates.adjustmentsTotal !== undefined) {
      invoice.adjustmentsTotal = Number(updates.adjustmentsTotal) || 0;
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
    }

    invoice.updatedAt = new Date().toISOString();

    this.logAudit(
      user.id,
      user.name,
      user.role,
      'AJUSTAR_MENSALIDADE_FATURA',
      'FATURAMENTO',
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
        return notif;
      }
    }

    notif.status = 'ENTREGUE';
    notif.sentAt = new Date().toISOString();
    notif.attemptsCount += 1;
    notif.lastErrorMessage = undefined;

    this.saveDatabase();
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

      participant.saleId = newSale.id;
      participant.status = 'LANCADO';

      salesCreated.push(newSale);
      updatedStudents.push(student);

      this.triggerSupabaseSync('sales', newSale, 'mapSaleToSupabase');
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
          this.data.stockMovements.unshift({
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
          });
          this.triggerSupabaseSync('products', product, 'mapProductToSupabase');
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
    return op;
  }

  public resetToSeed(user: { id: string; name: string; role: any }) {
    this.data = {
      settings: initialSettings,
      users: initialUsers,
      guardians: initialGuardians,
      students: initialStudents,
      products: initialProducts,
      stockMovements: initialStockMovements,
      sales: initialSales,
      financialLedger: initialFinancialLedger,
      invoices: initialInvoices,
      pixPayments: initialPixPayments,
      whatsappNotifications: initialWhatsAppNotifications,
      auditLogs: initialAuditLogs,
      passeios: initialPasseios,
      tripOperations: [],
      cashSessions: [],
      cashMovements: [],
    };
    this.logAudit(user.id, user.name, user.role, 'RESET_BASE_DE_DADOS', 'SISTEMA', 'Base de dados resetada para estado semente.');
    this.saveDatabase();
    return { success: true };
  }
}

export const db = new DatabaseService();

