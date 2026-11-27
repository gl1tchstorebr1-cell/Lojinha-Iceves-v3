import type {
  AuditLog,
  FinancialTransaction,
  Invoice,
  PaymentMethod,
  Product,
  ReceiptItemSnapshot,
  ReceiptReversalRecord,
  Sale,
  SaleItem,
  SalesReceipt,
  StockMovement,
  Student,
  UserRole,
} from '../types/index.ts';
import {
  IntegrityError,
  getInconsistentSales,
  isSaleConsistent,
  validateDataIntegrity,
} from '../utils/dataIntegrity.ts';
import {
  SNAPSHOT_KEY,
  deepCloneSnapshot,
  resolveStorage,
  saveOfflineSnapshotAtomic,
  type OfflineDataSnapshot,
  type StorageLike,
} from '../utils/offlineSnapshotCache.ts';

export type DiagnosticEventName =
  | 'SALE_TRANSACTION_STARTED'
  | 'SALE_VALIDATION_PASSED'
  | 'SALE_RECEIPT_CREATED'
  | 'SALE_STOCK_PREPARED'
  | 'SALE_STUDENT_BALANCE_PREPARED'
  | 'SALE_LEDGER_PREPARED'
  | 'SALE_SNAPSHOT_COMMITTED'
  | 'SALE_PERSISTENCE_VERIFIED'
  | 'SALE_TRANSACTION_COMPLETED'
  | 'SALE_TRANSACTION_FAILED'
  | 'SALE_ROLLBACK_STARTED'
  | 'SALE_ROLLBACK_COMPLETED';

export interface DiagnosticLogEntry {
  timestamp: string;
  event: DiagnosticEventName;
  saleId?: string;
  idempotencyKey?: string;
  aluno?: string;
  total?: number;
  produto?: string;
  etapa?: string;
  motivo?: string;
  estadoFinal?: string;
}

const MAX_DIAGNOSTIC_LOGS = 200;
const diagnosticLogs: DiagnosticLogEntry[] = [];

export function emitDiagnosticLog(entry: Omit<DiagnosticLogEntry, 'timestamp'>): void {
  const full: DiagnosticLogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  diagnosticLogs.unshift(full);
  if (diagnosticLogs.length > MAX_DIAGNOSTIC_LOGS) {
    diagnosticLogs.length = MAX_DIAGNOSTIC_LOGS;
  }
  if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
    const level = entry.event.includes('FAILED') || entry.event.includes('ROLLBACK') ? 'warn' : 'info';
    if (typeof console !== 'undefined' && typeof console[level] === 'function') {
      console[level](`[PDV-TX] ${entry.event}`, {
        saleId: entry.saleId,
        idempotencyKey: entry.idempotencyKey,
        aluno: entry.aluno,
        total: entry.total,
        produto: entry.produto,
        etapa: entry.etapa,
        motivo: entry.motivo,
        estadoFinal: entry.estadoFinal,
      });
    }
  }
}

export function getDiagnosticLogs(): DiagnosticLogEntry[] {
  return [...diagnosticLogs];
}

export function clearDiagnosticLogs(): void {
  diagnosticLogs.length = 0;
}

const VALID_PAYMENT_METHODS = new Set<PaymentMethod>([
  'CONTA_ALUNO',
  'DINHEIRO',
  'PIX',
  'CARTAO_CREDITO',
  'CARTAO_DEBITO',
  'MERCADO_PAGO',
]);

function roundCurrency(val: number): number {
  return Math.round((Number(val) || 0) * 100) / 100;
}

function toSaoPauloDate(iso: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(iso));
    const y = parts.find(p => p.type === 'year')?.value || iso.slice(0, 4);
    const m = parts.find(p => p.type === 'month')?.value || iso.slice(5, 7);
    const d = parts.find(p => p.type === 'day')?.value || iso.slice(8, 10);
    return `${y}-${m}-${d}`;
  } catch {
    return iso.slice(0, 10);
  }
}

function toSaoPauloTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 19);
  }
}

function getNextReceiptNumbers(receipts: SalesReceipt[]): { sequenceNumber: number; id: string; receiptCode: string } {
  let maxSeq = 0;
  for (const r of receipts || []) {
    const m = String(r.receiptCode || r.id || '').match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    }
  }
  const nextSeq = maxSeq + 1;
  const padded = String(nextSeq).padStart(6, '0');
  return {
    sequenceNumber: nextSeq,
    id: `REC-ICE-${padded}`,
    receiptCode: `ICE-${padded}`,
  };
}

export interface CreateSaleAtomicInput {
  studentId: string;
  items: Array<{ productId: string; quantity: number; discountAmount?: number }>;
  paymentMethod?: PaymentMethod;
  discountAmount?: number;
  amountPaid?: number;
  notes?: string;
  idempotencyKey: string;
  operatorUser: { id: string; name: string; role: UserRole };
  terminalId?: string;
}

export interface CreateSaleAtomicOptions {
  storage?: StorageLike;
  __faultStage?: 'BEFORE_COMMIT' | 'RECEIPT_MISSING' | 'STORAGE_WRITE' | 'READBACK_MISMATCH';
}

export interface CreateSaleAtomicResult {
  sale: Sale;
  receipt: SalesReceipt;
  student: Student;
  updatedProducts: Product[];
  stockMovements: StockMovement[];
  ledgerEntries: FinancialTransaction[];
  auditLog?: AuditLog;
  snapshot: OfflineDataSnapshot;
  idempotentReplay: boolean;
}

/**
 * Transação única e atômica de venda no PDV (modo offline-first / snapshot principal).
 * Fluxo: validar entrada -> backup -> montar registros em memória -> validar consistência ->
 * persistir 1 única vez -> reler snapshot -> revalidar -> retornar sucesso (ou rollback integral).
 */
export function createSaleAtomic(
  currentSnapshot: OfflineDataSnapshot,
  input: CreateSaleAtomicInput,
  options?: CreateSaleAtomicOptions
): CreateSaleAtomicResult {
  const store = resolveStorage(options?.storage);
  const previousSnapshot = deepCloneSnapshot(currentSnapshot);
  const idempotencyKey = (input.idempotencyKey || '').trim();
  const paymentMethod: PaymentMethod = input.paymentMethod || 'CONTA_ALUNO';

  emitDiagnosticLog({
    event: 'SALE_TRANSACTION_STARTED',
    idempotencyKey,
    etapa: 'INICIO',
  });

  // 1. Idempotência: se já existe venda COMPLETED com esta chave, retorna sem duplicar
  if (idempotencyKey) {
    const existingSale = (currentSnapshot.sales || []).find(
      s => s.idempotencyKey === idempotencyKey && s.status === 'COMPLETED'
    );
    if (existingSale) {
      const existingReceipt = (currentSnapshot.receipts || []).find(
        r => r.saleId === existingSale.id && r.status === 'ATIVO'
      );
      const existingStudent = (currentSnapshot.students || []).find(s => s.id === existingSale.studentId);
      if (existingReceipt && existingStudent) {
        emitDiagnosticLog({
          event: 'SALE_TRANSACTION_COMPLETED',
          saleId: existingSale.id,
          idempotencyKey,
          aluno: existingStudent.name,
          total: existingSale.total,
          etapa: 'IDEMPOTENT_REPLAY',
          estadoFinal: 'COMPLETED',
        });
        return {
          sale: existingSale,
          receipt: existingReceipt,
          student: existingStudent,
          updatedProducts: existingSale.items
            .map(i => (currentSnapshot.products || []).find(p => p.id === i.productId))
            .filter(Boolean) as Product[],
          stockMovements: (currentSnapshot.stockMovements || []).filter(
            m => m.saleId === existingSale.id || m.referenceId === existingSale.id
          ),
          ledgerEntries: (currentSnapshot.financialLedger || []).filter(
            l => l.saleId === existingSale.id || l.documentRef === existingSale.id
          ),
          snapshot: currentSnapshot,
          idempotentReplay: true,
        };
      }
    }
  }

  let saleId = '';
  let alunoName = '';
  let totalValue = 0;
  let produtoSummary = '';
  let currentStage = 'VALIDACAO';

  try {
    // 2. Validação completa em memória ANTES de qualquer mutação
    if (!idempotencyKey) {
      throw new IntegrityError('Chave de idempotência obrigatória para confirmar a venda.');
    }
    if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
      throw new IntegrityError(`Forma de pagamento inválida: "${String(paymentMethod)}".`);
    }

    const studentRef = (currentSnapshot.students || []).find(s => s.id === input.studentId);
    if (!studentRef) {
      throw new IntegrityError('Selecione um aluno válido antes de confirmar a venda.');
    }
    if (studentRef.status !== 'ACTIVE') {
      throw new IntegrityError(`O aluno ${studentRef.name} está inativo e não pode realizar compras.`);
    }
    alunoName = studentRef.name;

    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new IntegrityError('O carrinho está vazio. Adicione pelo menos 1 item antes de confirmar a venda.');
    }

    // Agrega quantidades por produto para validação real de estoque
    const qtyByProduct = new Map<string, { quantity: number; discountAmount: number }>();
    for (const rawItem of input.items) {
      if (!rawItem?.productId) {
        throw new IntegrityError('Identificador de produto inválido no carrinho.');
      }
      if (!Number.isFinite(rawItem.quantity) || rawItem.quantity <= 0) {
        throw new IntegrityError('Quantidade inválida no carrinho. Todos os itens devem ter quantidade maior que zero.');
      }
      const prev = qtyByProduct.get(rawItem.productId) || { quantity: 0, discountAmount: 0 };
      qtyByProduct.set(rawItem.productId, {
        quantity: prev.quantity + rawItem.quantity,
        discountAmount: roundCurrency(prev.discountAmount + Math.max(0, Number(rawItem.discountAmount) || 0)),
      });
    }

    const saleItems: SaleItem[] = [];
    let subtotalBeforeDiscount = 0;
    let itemDiscountTotal = 0;

    for (const [productId, agg] of qtyByProduct.entries()) {
      const prod = (currentSnapshot.products || []).find(p => p.id === productId);
      if (!prod) {
        throw new IntegrityError(`Produto "${productId}" não encontrado no catálogo.`);
      }
      if (prod.archived || prod.status !== 'ACTIVE') {
        throw new IntegrityError(`O produto "${prod.name}" está inativo/arquivado e não pode ser vendido.`);
      }
      if (prod.price === null || prod.price === undefined || !Number.isFinite(Number(prod.price)) || Number(prod.price) <= 0 || prod.priceStatus === 'PENDING') {
        throw new IntegrityError('Este produto não possui preço definido e não pode ser vendido.');
      }
      if (currentSnapshot.settings?.blockSaleWithoutStock !== false && Number(prod.currentStock) < agg.quantity) {
        throw new IntegrityError(
          `Estoque insuficiente para o produto "${prod.name}". Disponível: ${prod.currentStock}. Solicitado: ${agg.quantity}.`
        );
      }

      const unitPrice = roundCurrency(Number(prod.price));
      const rawSub = roundCurrency(unitPrice * agg.quantity);
      const itemDisc = Math.min(rawSub, agg.discountAmount);
      const sub = Math.max(0, roundCurrency(rawSub - itemDisc));
      subtotalBeforeDiscount = roundCurrency(subtotalBeforeDiscount + rawSub);
      itemDiscountTotal = roundCurrency(itemDiscountTotal + itemDisc);

      saleItems.push({
        productId: prod.id,
        internalCode: prod.internalCode,
        barcode: prod.barcode,
        name: prod.name,
        category: prod.category,
        unit: prod.unit || 'un',
        unitPrice,
        quantity: agg.quantity,
        discountAmount: itemDisc > 0 ? itemDisc : undefined,
        subtotal: sub,
      });
    }

    produtoSummary = saleItems.map(i => `${i.quantity}x ${i.name}`).join(', ');

    const orderDiscount = Math.max(0, roundCurrency(Number(input.discountAmount) || 0));
    const discountTotal = roundCurrency(itemDiscountTotal + orderDiscount);
    if (discountTotal > subtotalBeforeDiscount) {
      throw new IntegrityError('O desconto não pode ser maior que o subtotal da venda.');
    }

    const saleTotal = Math.max(0, roundCurrency(subtotalBeforeDiscount - discountTotal));
    if (saleTotal <= 0) {
      throw new IntegrityError('O total da venda deve ser maior que zero.');
    }
    totalValue = saleTotal;

    const existingSaleIds = new Set((currentSnapshot.sales || []).map(s => s.id));
    saleId = `VEN-${Date.now().toString().slice(-6)}`;
    while (existingSaleIds.has(saleId)) {
      saleId = `VEN-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    }

    emitDiagnosticLog({
      event: 'SALE_VALIDATION_PASSED',
      saleId,
      idempotencyKey,
      aluno: alunoName,
      total: totalValue,
      produto: produtoSummary,
      etapa: 'VALIDACAO',
    });

    // 3. Montar novo estado completo em memória (sem mutar currentSnapshot)
    const nextState = deepCloneSnapshot(currentSnapshot);
    const nowIso = new Date().toISOString();
    const billingPeriod = nowIso.slice(0, 7);

    // 3a. Preparar baixa de estoque
    currentStage = 'STOCK_PREPARE';
    const updatedProducts: Product[] = [];
    const createdMovements: StockMovement[] = [];
    for (let idx = 0; idx < saleItems.length; idx++) {
      const item = saleItems[idx];
      const prod = nextState.products.find(p => p.id === item.productId)!;
      const prevStock = Number(prod.currentStock);
      const nextStock = prevStock - item.quantity;
      if (nextStock < 0) {
        throw new IntegrityError(
          `Estoque insuficiente para o produto "${prod.name}". Disponível: ${prevStock}. Solicitado: ${item.quantity}.`
        );
      }
      prod.currentStock = nextStock;
      prod.updatedAt = nowIso;
      updatedProducts.push(prod);

      const mov: StockMovement = {
        id: `MOV-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
        productId: prod.id,
        productName: prod.name,
        saleId,
        type: 'SAIDA_VENDA',
        quantity: -item.quantity,
        previousStock: prevStock,
        newStock: nextStock,
        resultingStock: nextStock,
        reason: `Venda ${saleId} (${paymentMethod}) - Aluno: ${studentRef.name}`,
        performedByUserId: input.operatorUser.id,
        performedByUserName: input.operatorUser.name,
        referenceId: saleId,
        timestamp: nowIso,
      };
      createdMovements.push(mov);
    }
    nextState.stockMovements = [...createdMovements, ...(nextState.stockMovements || [])];

    emitDiagnosticLog({
      event: 'SALE_STOCK_PREPARED',
      saleId,
      idempotencyKey,
      aluno: alunoName,
      total: totalValue,
      produto: produtoSummary,
      etapa: currentStage,
    });

    // 3b. Preparar consumo e dívida do aluno
    currentStage = 'STUDENT_BALANCE_PREPARE';
    const txStudent = nextState.students.find(s => s.id === input.studentId)!;
    const isAccountPayment = paymentMethod === 'CONTA_ALUNO';
    if (isAccountPayment) {
      txStudent.currentConsumptionBalance = roundCurrency(
        (Number(txStudent.currentConsumptionBalance) || 0) + saleTotal
      );
      txStudent.totalOpenDebt = roundCurrency((Number(txStudent.totalOpenDebt) || 0) + saleTotal);
    }

    emitDiagnosticLog({
      event: 'SALE_STUDENT_BALANCE_PREPARED',
      saleId,
      idempotencyKey,
      aluno: alunoName,
      total: totalValue,
      produto: produtoSummary,
      etapa: currentStage,
    });

    // 3c. Preparar livro financeiro
    currentStage = 'LEDGER_PREPARE';
    const ledgerEntry: FinancialTransaction = {
      id: `LED-${Date.now()}-${isAccountPayment ? 'DEB' : 'PG'}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      studentId: txStudent.id,
      saleId,
      type: isAccountPayment ? 'DEBITO' : 'CREDITO',
      category: isAccountPayment ? 'CONSUMO_LOJINHA' : 'PAGAMENTO_PIX',
      amount: saleTotal,
      description: isAccountPayment
        ? `Consumo Lojinha - Venda ${saleId} (${saleItems.length} itens)`
        : `Venda paga no ato (${paymentMethod}) - ${saleId} (${saleItems.length} itens)`,
      documentRef: saleId,
      performedByUserName: input.operatorUser.name,
    };
    nextState.financialLedger = [ledgerEntry, ...(nextState.financialLedger || [])];

    emitDiagnosticLog({
      event: 'SALE_LEDGER_PREPARED',
      saleId,
      idempotencyKey,
      aluno: alunoName,
      total: totalValue,
      produto: produtoSummary,
      etapa: currentStage,
    });

    // 3d. Preparar venda + recibo vinculados com os mesmos identificadores
    currentStage = 'RECEIPT_CREATE';
    if (options?.__faultStage === 'BEFORE_COMMIT') {
      throw new IntegrityError('Falha simulada antes do commit da transação de venda.');
    }

    const receiptNum = getNextReceiptNumbers(nextState.receipts || []);
    const receiptItems: ReceiptItemSnapshot[] = saleItems.map((it, idx) => ({
      itemIndex: idx + 1,
      productId: it.productId,
      internalCode: it.internalCode,
      barcode: it.barcode,
      name: it.name,
      category: it.category || 'Alimentos e Snacks',
      unit: it.unit || 'un',
      unitPrice: it.unitPrice,
      quantity: it.quantity,
      individualDiscount: it.discountAmount || 0,
      subtotal: roundCurrency(it.unitPrice * it.quantity),
      total: it.subtotal,
    }));

    const changeAmount =
      paymentMethod === 'DINHEIRO' && input.amountPaid && input.amountPaid > saleTotal
        ? roundCurrency(input.amountPaid - saleTotal)
        : 0;
    const effectiveAmountPaid = isAccountPayment ? 0 : saleTotal;

    const newSale: Sale = {
      id: saleId,
      studentId: txStudent.id,
      studentName: txStudent.name,
      registrationNumber: txStudent.registrationNumber,
      items: saleItems,
      subtotal: subtotalBeforeDiscount,
      subtotalBeforeDiscount,
      discountTotal,
      discountAmount: discountTotal > 0 ? discountTotal : undefined,
      total: saleTotal,
      operatorUserId: input.operatorUser.id,
      operatorUserName: input.operatorUser.name,
      status: 'COMPLETED',
      billingPeriod,
      billingStatus: isAccountPayment ? 'AGUARDANDO_FATURAMENTO' : undefined,
      idempotencyKey,
      origin: 'LOJINHA',
      paymentMethod,
      payments: [{ method: paymentMethod, amount: isAccountPayment ? saleTotal : (input.amountPaid || saleTotal) }],
      amountPaid: effectiveAmountPaid,
      changeAmount: changeAmount > 0 ? changeAmount : undefined,
      terminalId: input.terminalId || 'PDV-BALCAO-01',
      receiptId: receiptNum.id,
      receiptCode: receiptNum.receiptCode,
      notes: input.notes?.trim() || undefined,
      createdAt: nowIso,
      completedAt: nowIso,
    };

    const newReceipt: SalesReceipt = {
      id: receiptNum.id,
      receiptCode: receiptNum.receiptCode,
      saleId: newSale.id,
      version: 1,
      status: 'ATIVO',
      institution: {
        storeName: nextState.settings?.storeName || 'Lojinha ICEVES',
        institutionName: nextState.settings?.institutionName || 'Escola de Cristo - ICEVES',
        cnpj: nextState.settings?.cnpj || undefined,
        unitName: nextState.settings?.currentCohortName || 'Unidade ICEVES • 10ª Turma',
        logoUrl: '/assets/aistudio/image_e4461e45.png',
      },
      saleSnapshot: {
        saleId: newSale.id,
        createdAt: nowIso,
        saoPauloDate: toSaoPauloDate(nowIso),
        saoPauloTime: toSaoPauloTime(nowIso),
        timezone: 'America/Sao_Paulo',
        origin: 'LOJINHA',
        saleStatus: 'COMPLETED',
        transactionId: newSale.id,
        billingPeriod,
        notes: newSale.notes,
      },
      studentSnapshot: {
        studentId: txStudent.id,
        name: txStudent.name,
        registrationNumber: txStudent.registrationNumber,
        classGroup: txStudent.classGroup,
        guardianName: txStudent.guardians?.[0]?.guardianName,
        guardianRelationship: txStudent.guardians?.[0]?.relationship,
      },
      items: receiptItems,
      financialSummary: {
        productsSubtotal: subtotalBeforeDiscount,
        discountTotal,
        creditUsed: 0,
        saleTotal,
        amountPaid: effectiveAmountPaid,
        changeAmount,
      },
      payments: [
        {
          method: paymentMethod,
          label: paymentMethod === 'CONTA_ALUNO' ? 'Conta do Aluno (Fatura Mensal)' : paymentMethod,
          amount: isAccountPayment ? saleTotal : (input.amountPaid || saleTotal),
          status: isAccountPayment ? 'LANCADO_EM_CONTA' : 'CONFIRMADO',
          confirmedAt: nowIso,
        },
      ],
      operational: {
        operatorUserId: input.operatorUser.id,
        operatorUserName: input.operatorUser.name,
        terminalId: newSale.terminalId || 'PDV-BALCAO-01',
        cashRegisterLabel: 'Lançamento Direto',
        operationTimestamp: nowIso,
      },
      reversals: [],
      reprintCount: 0,
      customHeaderSnapshot: nextState.settings?.receiptSettings?.customHeader || undefined,
      customFooterSnapshot: nextState.settings?.receiptSettings?.customFooter || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    nextState.sales = [newSale, ...(nextState.sales || [])];
    if (options?.__faultStage !== 'RECEIPT_MISSING') {
      nextState.receipts = [newReceipt, ...(nextState.receipts || [])];
    }

    // 4. Validação obrigatória de consistência venda <-> recibo ANTES de persistir
    const activeReceiptInNext = (nextState.receipts || []).find(
      r => r.saleId === newSale.id && r.status === 'ATIVO'
    );
    if (!activeReceiptInNext) {
      throw new IntegrityError('Venda não pode ser concluída sem recibo ativo correspondente.');
    }

    const consistency = isSaleConsistent(newSale, nextState.receipts || []);
    if (!consistency.valid) {
      throw new IntegrityError(consistency.reason || 'Inconsistência detectada antes da persistência.');
    }

    emitDiagnosticLog({
      event: 'SALE_RECEIPT_CREATED',
      saleId: newSale.id,
      idempotencyKey,
      aluno: alunoName,
      total: totalValue,
      produto: produtoSummary,
      etapa: currentStage,
    });

    // 5. Auditoria de sucesso (só entrará no snapshot se a persistência e readback confirmarem)
    const auditLog: AuditLog = {
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      userId: input.operatorUser.id,
      userName: input.operatorUser.name,
      userRole: input.operatorUser.role,
      action: 'REGISTRO_VENDA_PDV',
      module: 'VENDAS',
      referenceId: newSale.id,
      details: `Venda ${newSale.id} (Recibo ${newReceipt.receiptCode} • R$ ${saleTotal.toFixed(2)}) para ${txStudent.name} via ${paymentMethod}.`,
      status: 'SUCESSO',
    };
    nextState.auditLogs = [auditLog, ...(nextState.auditLogs || [])].slice(0, 500);
    nextState.syncedAt = nowIso;

    // 6. Persistência única + leitura real + validação pós-gravação
    currentStage = 'SNAPSHOT_COMMIT';
    if (options?.__faultStage === 'STORAGE_WRITE') {
      throw new Error('QuotaExceededError simulado durante localStorage.setItem');
    }

    const scopedIds = [
      newSale.id,
      newReceipt.id,
      txStudent.id,
      ...updatedProducts.map(p => p.id),
      ...createdMovements.map(m => m.id),
      ledgerEntry.id,
    ];

    const { persisted } = saveOfflineSnapshotAtomic(nextState, {
      storage: store || undefined,
      operation: `SALE_ATOMIC:${newSale.id}`,
      txId: idempotencyKey,
      validateBeforeCommit: true,
      validateEntityIds: scopedIds,
      previousSnapshotOverride: previousSnapshot,
      readbackVerify: (readSnap) => {
        if (options?.__faultStage === 'READBACK_MISMATCH') {
          throw new IntegrityError('Divergência simulada na releitura do snapshot persistido.');
        }
        const persistedSale = (readSnap.sales || []).find(s => s.id === newSale.id);
        const persistedReceipt = (readSnap.receipts || []).find(
          r => r.saleId === newSale.id && r.status === 'ATIVO'
        );
        if (!persistedSale || persistedSale.status !== 'COMPLETED') {
          throw new IntegrityError(`Persistência não confirmada: venda ${newSale.id} ausente no snapshot salvo.`);
        }
        if (!persistedReceipt || persistedReceipt.id !== newReceipt.id) {
          throw new IntegrityError(`Persistência não confirmada: recibo ATIVO de ${newSale.id} ausente no snapshot salvo.`);
        }
        for (const up of updatedProducts) {
          const pProd = (readSnap.products || []).find(p => p.id === up.id);
          if (!pProd || Number(pProd.currentStock) !== Number(up.currentStock)) {
            throw new IntegrityError(`Persistência não confirmada: estoque de "${up.name}" diverge após gravação.`);
          }
        }
        const pStudent = (readSnap.students || []).find(s => s.id === txStudent.id);
        if (
          !pStudent ||
          Math.abs(roundCurrency(pStudent.currentConsumptionBalance) - roundCurrency(txStudent.currentConsumptionBalance)) > 0.01
        ) {
          throw new IntegrityError(`Persistência não confirmada: consumo de "${txStudent.name}" diverge após gravação.`);
        }
        const pLedger = (readSnap.financialLedger || []).find(l => l.id === ledgerEntry.id);
        if (!pLedger) {
          throw new IntegrityError(`Persistência não confirmada: lançamento financeiro de ${newSale.id} ausente.`);
        }
      },
    });

    emitDiagnosticLog({
      event: 'SALE_SNAPSHOT_COMMITTED',
      saleId: newSale.id,
      idempotencyKey,
      aluno: alunoName,
      total: totalValue,
      produto: produtoSummary,
      etapa: 'SNAPSHOT_COMMIT',
    });

    emitDiagnosticLog({
      event: 'SALE_PERSISTENCE_VERIFIED',
      saleId: newSale.id,
      idempotencyKey,
      aluno: alunoName,
      total: totalValue,
      produto: produtoSummary,
      etapa: 'READBACK_VERIFY',
      estadoFinal: 'COMPLETED',
    });

    emitDiagnosticLog({
      event: 'SALE_TRANSACTION_COMPLETED',
      saleId: newSale.id,
      idempotencyKey,
      aluno: alunoName,
      total: totalValue,
      produto: produtoSummary,
      etapa: 'CONCLUIDO',
      estadoFinal: 'COMPLETED',
    });

    return {
      sale: newSale,
      receipt: newReceipt,
      student: txStudent,
      updatedProducts,
      stockMovements: createdMovements,
      ledgerEntries: [ledgerEntry],
      auditLog,
      snapshot: persisted,
      idempotentReplay: false,
    };
  } catch (err: any) {
    const errorReason = err?.message || 'Erro desconhecido na transação de venda.';

    emitDiagnosticLog({
      event: 'SALE_TRANSACTION_FAILED',
      saleId: saleId || undefined,
      idempotencyKey,
      aluno: alunoName || undefined,
      total: totalValue || undefined,
      produto: produtoSummary || undefined,
      etapa: currentStage,
      motivo: errorReason,
      estadoFinal: 'FAILED',
    });

    emitDiagnosticLog({
      event: 'SALE_ROLLBACK_STARTED',
      saleId: saleId || undefined,
      idempotencyKey,
      etapa: currentStage,
      motivo: errorReason,
    });

    // Rollback verdadeiro para o snapshot anterior
    if (store) {
      try {
        store.setItem(SNAPSHOT_KEY, JSON.stringify(previousSnapshot));
      } catch {
        // Storage indisponível
      }
    }

    emitDiagnosticLog({
      event: 'SALE_ROLLBACK_COMPLETED',
      saleId: saleId || undefined,
      idempotencyKey,
      aluno: alunoName || undefined,
      total: totalValue || undefined,
      produto: produtoSummary || undefined,
      etapa: 'ROLLBACK',
      motivo: errorReason,
      estadoFinal: 'ROLLED_BACK',
    });

    throw err instanceof Error ? err : new Error(errorReason);
  }
}

export const processSaleTransaction = createSaleAtomic;

export interface ReverseSaleAtomicInput {
  reason: string;
  idempotencyKey?: string;
  operatorUser: { id: string; name: string; role: UserRole };
}

export interface ReverseSaleAtomicResult {
  alreadyReversed: boolean;
  sale: Sale;
  receipt?: SalesReceipt;
  student: Student;
  updatedProducts: Product[];
  stockMovements: StockMovement[];
  updatedInvoices: Invoice[];
  ledgerEntries: FinancialTransaction[];
  auditLog?: AuditLog;
  snapshot: OfflineDataSnapshot;
}

/**
 * Estorno atômico e idempotente de venda sobre o snapshot principal.
 * Exige venda COMPLETED consistente com recibo ATIVO, reverte estoque/consumo/dívida/fatura,
 * gera comprovante de estorno e valida readback real.
 */
export function reverseSaleAtomic(
  currentSnapshot: OfflineDataSnapshot,
  saleId: string,
  input: ReverseSaleAtomicInput,
  options?: { storage?: StorageLike }
): ReverseSaleAtomicResult {
  const store = resolveStorage(options?.storage);
  const previousSnapshot = deepCloneSnapshot(currentSnapshot);
  const existingSale = (currentSnapshot.sales || []).find(s => s.id === saleId);

  if (!existingSale) {
    throw new IntegrityError(`Venda ${saleId} não encontrada.`);
  }

  // Idempotência: venda já estornada retorna sem duplicar movimentos
  if (existingSale.status === 'REVERSED') {
    const existingStudent = (currentSnapshot.students || []).find(s => s.id === existingSale.studentId)!;
    const existingReceipt = (currentSnapshot.receipts || []).find(r => r.saleId === existingSale.id);
    return {
      alreadyReversed: true,
      sale: existingSale,
      receipt: existingReceipt,
      student: existingStudent,
      updatedProducts: [],
      stockMovements: [],
      updatedInvoices: [],
      ledgerEntries: [],
      snapshot: currentSnapshot,
    };
  }

  if (existingSale.status !== 'COMPLETED' && existingSale.status !== 'PARTIALLY_REVERSED') {
    throw new IntegrityError(
      `A venda ${saleId} possui status "${existingSale.status}" e não pode ser estornada diretamente.`
    );
  }

  const cleanReason = (input.reason || '').trim();
  if (!cleanReason) {
    throw new IntegrityError('O motivo do estorno é obrigatório.');
  }

  // Verificar consistência venda <-> recibo antes de estornar
  const saleCheck = isSaleConsistent(existingSale, currentSnapshot.receipts || []);
  if (!saleCheck.valid || !saleCheck.receipt) {
    throw new IntegrityError(
      saleCheck.reason || `Venda ${saleId} está inconsistente (sem recibo ATIVO) e requer correção antes do estorno.`
    );
  }

  const nextState = deepCloneSnapshot(currentSnapshot);
  const nowIso = new Date().toISOString();
  const sale = nextState.sales.find(s => s.id === saleId)!;
  const student = nextState.students.find(s => s.id === sale.studentId);
  const receipt = (nextState.receipts || []).find(
    r => r.saleId === sale.id && (r.status === 'ATIVO' || r.status === 'PARCIALMENTE_ESTORNADO')
  );

  if (!student) {
    throw new IntegrityError('Aluno vinculado à venda não encontrado.');
  }
  if (!receipt) {
    throw new IntegrityError(`Recibo ativo correspondente à venda ${sale.id} não encontrado.`);
  }

  try {
    // 1. Reverter estoque
    const updatedProducts: Product[] = [];
    const createdMovements: StockMovement[] = [];
    for (let idx = 0; idx < sale.items.length; idx++) {
      const item = sale.items[idx];
      const product = nextState.products.find(p => p.id === item.productId);
      if (!product) continue;
      const prevStock = Number(product.currentStock);
      const nextStock = prevStock + item.quantity;
      product.currentStock = nextStock;
      product.updatedAt = nowIso;
      updatedProducts.push(product);

      const mov: StockMovement = {
        id: `MOV-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
        productId: product.id,
        productName: product.name,
        saleId: sale.id,
        type: 'ESTORNO_VENDA',
        quantity: item.quantity,
        previousStock: prevStock,
        newStock: nextStock,
        resultingStock: nextStock,
        reason: `Estorno de venda ${sale.id}: ${cleanReason}`,
        performedByUserId: input.operatorUser.id,
        performedByUserName: input.operatorUser.name,
        referenceId: sale.id,
        timestamp: nowIso,
      };
      createdMovements.push(mov);
    }
    nextState.stockMovements = [...createdMovements, ...(nextState.stockMovements || [])];

    // 2. Reverter consumo e dívida do aluno (quando CONTA_ALUNO)
    const remainingToReverse = Math.max(0, roundCurrency(sale.total - (sale.reversedAmount || 0)));
    if ((sale.paymentMethod || 'CONTA_ALUNO') === 'CONTA_ALUNO') {
      student.currentConsumptionBalance = Math.max(
        0,
        roundCurrency((Number(student.currentConsumptionBalance) || 0) - remainingToReverse)
      );
      student.totalOpenDebt = Math.max(
        0,
        roundCurrency((Number(student.totalOpenDebt) || 0) - remainingToReverse)
      );
    }

    // 3. Ajustar faturas em aberto vinculadas à venda
    const updatedInvoices: Invoice[] = [];
    for (const inv of nextState.invoices || []) {
      if (inv.status === 'PAGA' || inv.status === 'CANCELADA') continue;
      const linked =
        (Array.isArray(inv.salesIds) && inv.salesIds.includes(sale.id)) ||
        (Array.isArray(inv.saleItemLinks) && inv.saleItemLinks.some(l => l.saleId === sale.id));
      if (!linked) continue;

      inv.salesIds = (inv.salesIds || []).filter(id => id !== sale.id);
      if (Array.isArray(inv.saleItemLinks)) {
        inv.saleItemLinks = inv.saleItemLinks.filter(l => l.saleId !== sale.id);
      }
      inv.canteenConsumptionTotal = Math.max(0, roundCurrency(inv.canteenConsumptionTotal - remainingToReverse));
      inv.grossTotal = Math.max(
        0,
        roundCurrency(inv.tuitionAmount + inv.canteenConsumptionTotal + inv.previousBalance + inv.adjustmentsTotal - (inv.creditApplied || 0))
      );
      inv.remainingBalance = Math.max(0, roundCurrency(inv.grossTotal - inv.paidTotal));
      inv.updatedAt = nowIso;
      if (inv.grossTotal <= 0 && inv.paidTotal <= 0 && inv.salesIds.length === 0) {
        inv.status = 'CANCELADA';
      }
      updatedInvoices.push(inv);
    }

    // 4. Atualizar status da venda
    sale.status = 'REVERSED';
    sale.reversedAmount = sale.total;
    sale.billingStatus = 'ESTORNADA';
    sale.reversedReason = cleanReason;
    sale.reversedByUserName = input.operatorUser.name;
    sale.reversedAt = nowIso;
    sale.reversalIdempotencyKey = (input.idempotencyKey || '').trim() || `REV-${sale.id}-${Date.now()}`;

    // 5. Atualizar recibo para ESTORNADO + comprovante de estorno
    const revRecord: ReceiptReversalRecord = {
      id: `RREV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      originalSaleId: sale.id,
      timestamp: nowIso,
      type: 'ESTORNO_TOTAL',
      reason: cleanReason,
      operatorUserId: input.operatorUser.id,
      operatorUserName: input.operatorUser.name,
      reversedAmount: remainingToReverse,
      items: sale.items.map(it => ({
        productId: it.productId,
        name: it.name,
        quantity: it.quantity,
        amount: it.subtotal,
      })),
    };
    receipt.status = 'ESTORNADO';
    receipt.version = (receipt.version || 1) + 1;
    receipt.reversals = [revRecord, ...(receipt.reversals || [])];
    receipt.payments = (receipt.payments || []).map(p => ({ ...p, status: 'ESTORNADO' }));
    receipt.saleSnapshot.saleStatus = 'REVERSED';
    receipt.updatedAt = nowIso;

    // 6. Lançamento financeiro de reversão
    const revLedger: FinancialTransaction = {
      id: `LED-${Date.now()}-EST-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      studentId: student.id,
      saleId: sale.id,
      type: 'CREDITO',
      category: 'ESTORNO_VENDA',
      amount: remainingToReverse,
      description: `Estorno de venda ${sale.id} (${sale.paymentMethod || 'CONTA_ALUNO'}) - Motivo: ${cleanReason}`,
      documentRef: sale.id,
      performedByUserName: input.operatorUser.name,
    };
    nextState.financialLedger = [revLedger, ...(nextState.financialLedger || [])];

    // 7. Auditoria de sucesso do estorno
    const auditLog: AuditLog = {
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      userId: input.operatorUser.id,
      userName: input.operatorUser.name,
      userRole: input.operatorUser.role,
      action: 'ESTORNO_VENDA_PDV',
      module: 'VENDAS',
      referenceId: sale.id,
      details: `Estorno integral da venda ${sale.id} (Recibo ${receipt.receiptCode} → ESTORNADO • R$ ${remainingToReverse.toFixed(2)}) de ${student.name}. Motivo: ${cleanReason}`,
      status: 'SUCESSO',
    };
    nextState.auditLogs = [auditLog, ...(nextState.auditLogs || [])].slice(0, 500);
    nextState.syncedAt = nowIso;

    const scopedIds = [
      sale.id,
      receipt.id,
      student.id,
      ...updatedProducts.map(p => p.id),
      ...createdMovements.map(m => m.id),
      revLedger.id,
    ];

    const { persisted } = saveOfflineSnapshotAtomic(nextState, {
      storage: store || undefined,
      operation: `SALE_REVERSAL_ATOMIC:${sale.id}`,
      txId: sale.reversalIdempotencyKey,
      validateBeforeCommit: true,
      validateEntityIds: scopedIds,
      previousSnapshotOverride: previousSnapshot,
      readbackVerify: (readSnap) => {
        const pSale = (readSnap.sales || []).find(s => s.id === sale.id);
        const pRec = (readSnap.receipts || []).find(r => r.id === receipt.id);
        if (!pSale || pSale.status !== 'REVERSED') {
          throw new IntegrityError(`Readback falhou: venda ${sale.id} não foi persistida como REVERSED.`);
        }
        if (!pRec || pRec.status !== 'ESTORNADO') {
          throw new IntegrityError(`Readback falhou: recibo ${receipt.receiptCode} não foi persistido como ESTORNADO.`);
        }
      },
    });

    return {
      alreadyReversed: false,
      sale,
      receipt,
      student,
      updatedProducts,
      stockMovements: createdMovements,
      updatedInvoices,
      ledgerEntries: [revLedger],
      auditLog,
      snapshot: persisted,
    };
  } catch (err: any) {
    if (store) {
      try {
        store.setItem(SNAPSHOT_KEY, JSON.stringify(previousSnapshot));
      } catch {
        // ignore
      }
    }
    throw err instanceof Error ? err : new Error(String(err || 'Erro ao executar estorno atômico.'));
  }
}

export type OrphanRecoveryStrategy = 'CANCEL_INVALID' | 'RECOVER_RECEIPT';

/**
 * Rotina segura de migração/recuperação para vendas órfãs legadas (ex.: VEN-610628).
 * - CANCEL_INVALID (Opção B): altera status para CANCELLED, limpa receiptId quebrado, remove dos indicadores e audita.
 * - RECOVER_RECEIPT (Opção A): cria recibo consistente vinculado à venda, valida todos os campos e audita.
 */
export function recoverOrphanSaleAtomic(
  currentSnapshot: OfflineDataSnapshot,
  saleId: string,
  strategy: OrphanRecoveryStrategy,
  actor: { id: string; name: string; role: UserRole },
  storage?: StorageLike
): {
  sale: Sale;
  receipt?: SalesReceipt;
  auditLog: AuditLog;
  snapshot: OfflineDataSnapshot;
} {
  const store = resolveStorage(storage);
  const previousSnapshot = deepCloneSnapshot(currentSnapshot);
  const nextState = deepCloneSnapshot(currentSnapshot);
  const nowIso = new Date().toISOString();

  const sale = (nextState.sales || []).find(s => s.id === saleId);
  if (!sale) {
    throw new IntegrityError(`Venda ${saleId} não encontrada para recuperação.`);
  }

  let createdReceipt: SalesReceipt | undefined;
  let auditDetails = '';

  if (strategy === 'CANCEL_INVALID') {
    sale.status = 'CANCELLED';
    sale.billingStatus = 'CANCELADA';
    sale.integrityReason = 'Venda órfã/inconsistente cancelada por ausência de recibo ativo correspondente.';
    sale.reversedReason = sale.integrityReason;
    sale.reversedByUserName = actor.name;
    sale.reversedAt = nowIso;
    sale.receiptId = undefined;
    sale.receiptCode = undefined;

    // Se houver algum recibo corrompido apontando para esta venda, marca como CANCELADO
    for (const r of nextState.receipts || []) {
      if (r.saleId === sale.id && r.status === 'ATIVO') {
        r.status = 'CANCELADO';
        r.updatedAt = nowIso;
      }
    }

    auditDetails = `Venda inconsistente ${sale.id} (${sale.studentName} • R$ ${Number(sale.total).toFixed(2)}) cancelada (status CANCELLED) pela rotina de integridade e removida dos indicadores.`;
  } else {
    // Opção A: Recuperar criando o recibo exato vinculado à venda
    const student = (nextState.students || []).find(s => s.id === sale.studentId);
    const receiptNum = getNextReceiptNumbers(nextState.receipts || []);
    const targetReceiptId =
      sale.receiptId && !(nextState.receipts || []).some(r => r.id === sale.receiptId)
        ? sale.receiptId
        : receiptNum.id;
    const targetReceiptCode =
      sale.receiptCode && !(nextState.receipts || []).some(r => r.receiptCode === sale.receiptCode)
        ? sale.receiptCode
        : receiptNum.receiptCode;

    const grossSubtotal = roundCurrency(
      (sale.items || []).reduce((acc, it) => acc + roundCurrency(it.unitPrice * it.quantity), 0)
    );
    const totalDiscount = roundCurrency(sale.discountTotal ?? sale.discountAmount ?? 0);
    const isAccount = (sale.paymentMethod || 'CONTA_ALUNO') === 'CONTA_ALUNO';

    const saleTs = sale.createdAt || nowIso;
    createdReceipt = {
      id: targetReceiptId,
      receiptCode: targetReceiptCode,
      saleId: sale.id,
      version: 1,
      status: 'ATIVO',
      institution: {
        storeName: nextState.settings?.storeName || 'Lojinha ICEVES',
        institutionName: nextState.settings?.institutionName || 'Escola de Cristo - ICEVES',
        cnpj: nextState.settings?.cnpj || undefined,
        unitName: nextState.settings?.currentCohortName || 'Unidade ICEVES • 10ª Turma',
        logoUrl: '/assets/aistudio/image_e4461e45.png',
      },
      saleSnapshot: {
        saleId: sale.id,
        createdAt: saleTs,
        saoPauloDate: toSaoPauloDate(saleTs),
        saoPauloTime: toSaoPauloTime(saleTs),
        timezone: 'America/Sao_Paulo',
        origin: sale.origin || 'LOJINHA',
        saleStatus: 'COMPLETED',
        transactionId: sale.id,
        billingPeriod: sale.billingPeriod || nowIso.slice(0, 7),
        notes: sale.notes,
      },
      studentSnapshot: {
        studentId: sale.studentId,
        name: sale.studentName,
        registrationNumber: sale.registrationNumber,
        classGroup: student?.classGroup || '10ª Turma',
        guardianName: student?.guardians?.[0]?.guardianName,
        guardianRelationship: student?.guardians?.[0]?.relationship,
      },
      items: (sale.items || []).map((it, idx) => ({
        itemIndex: idx + 1,
        productId: it.productId,
        internalCode: it.internalCode,
        barcode: it.barcode,
        name: it.name,
        category: it.category || 'Alimentos e Snacks',
        unit: it.unit || 'un',
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        individualDiscount: it.discountAmount || 0,
        subtotal: roundCurrency(it.unitPrice * it.quantity),
        total: it.subtotal,
      })),
      financialSummary: {
        productsSubtotal: grossSubtotal,
        discountTotal: totalDiscount,
        creditUsed: sale.creditUsed || 0,
        saleTotal: roundCurrency(sale.total),
        amountPaid: isAccount ? 0 : roundCurrency(sale.total),
        changeAmount: sale.changeAmount || 0,
      },
      payments: [
        {
          method: sale.paymentMethod || 'CONTA_ALUNO',
          label: (sale.paymentMethod || 'CONTA_ALUNO') === 'CONTA_ALUNO' ? 'Conta do Aluno (Fatura Mensal)' : String(sale.paymentMethod),
          amount: roundCurrency(sale.total),
          status: isAccount ? 'LANCADO_EM_CONTA' : 'CONFIRMADO',
          confirmedAt: saleTs,
        },
      ],
      operational: {
        operatorUserId: sale.operatorUserId,
        operatorUserName: sale.operatorUserName,
        terminalId: sale.terminalId || 'PDV-BALCAO-01',
        cashRegisterLabel: 'Recuperação de Integridade',
        operationTimestamp: saleTs,
      },
      reversals: [],
      reprintCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    sale.status = 'COMPLETED';
    sale.receiptId = createdReceipt.id;
    sale.receiptCode = createdReceipt.receiptCode;
    sale.integrityReason = undefined;
    nextState.receipts = [
      createdReceipt,
      ...(nextState.receipts || []).filter(r => r.saleId !== sale.id && r.id !== createdReceipt!.id),
    ];

    const check = isSaleConsistent(sale, nextState.receipts);
    if (!check.valid) {
      throw new IntegrityError(`Falha ao validar recibo recuperado para ${sale.id}: ${check.reason}`);
    }

    auditDetails = `Venda ${sale.id} recuperada com emissão retroativa consistente do recibo ${createdReceipt.receiptCode}.`;
  }

  const auditLog: AuditLog = {
    id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: nowIso,
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'CORRECAO_VENDA_INCONSISTENTE',
    module: 'SISTEMA',
    referenceId: sale.id,
    details: auditDetails,
    status: 'SUCESSO',
  };
  nextState.auditLogs = [auditLog, ...(nextState.auditLogs || [])].slice(0, 500);
  nextState.syncedAt = nowIso;

  const { persisted } = saveOfflineSnapshotAtomic(nextState, {
    storage: store || undefined,
    operation: `RECOVER_ORPHAN:${sale.id}:${strategy}`,
    txId: `REC-${sale.id}-${Date.now()}`,
    validateBeforeCommit: true,
    validateEntityIds: createdReceipt ? [sale.id, createdReceipt.id] : [sale.id],
    previousSnapshotOverride: previousSnapshot,
    readbackVerify: (readSnap) => {
      const pSale = (readSnap.sales || []).find(s => s.id === sale.id);
      if (!pSale) throw new IntegrityError(`Readback falhou: venda ${sale.id} ausente.`);
      if (strategy === 'CANCEL_INVALID' && pSale.status !== 'CANCELLED') {
        throw new IntegrityError(`Readback falhou: venda ${sale.id} não foi marcada como CANCELLED.`);
      }
      if (strategy === 'RECOVER_RECEIPT') {
        const check = isSaleConsistent(pSale, readSnap.receipts || []);
        if (!check.valid) {
          throw new IntegrityError(`Readback falhou: venda ${sale.id} continua inconsistente (${check.reason}).`);
        }
      }
    },
  });

  return {
    sale,
    receipt: createdReceipt,
    auditLog,
    snapshot: persisted,
  };
}

/**
 * Reconcilia todas as vendas inconsistentes encontradas no snapshot (incluindo VEN-610628).
 */
export function reconcileAllOrphanSalesAtomic(
  currentSnapshot: OfflineDataSnapshot,
  strategy: OrphanRecoveryStrategy,
  actor: { id: string; name: string; role: UserRole },
  storage?: StorageLike
): {
  reconciledIds: string[];
  snapshot: OfflineDataSnapshot;
} {
  const orphans = getInconsistentSales(currentSnapshot.sales || [], currentSnapshot.receipts || []);
  let snap = currentSnapshot;
  const reconciledIds: string[] = [];

  for (const item of orphans) {
    const res = recoverOrphanSaleAtomic(snap, item.sale.id, strategy, actor, storage);
    snap = res.snapshot;
    reconciledIds.push(item.sale.id);
  }

  return { reconciledIds, snapshot: snap };
}

/**
 * Executa verificação global de integridade sobre o snapshot principal persistido.
 */
export function verifyGlobalSnapshotIntegrity(snapshot: OfflineDataSnapshot) {
  return validateDataIntegrity({
    sales: snapshot.sales || [],
    receipts: snapshot.receipts || [],
    products: snapshot.products || [],
    students: snapshot.students || [],
    stockMovements: snapshot.stockMovements || [],
    financialLedger: snapshot.financialLedger || [],
    invoices: snapshot.invoices || [],
  });
}
