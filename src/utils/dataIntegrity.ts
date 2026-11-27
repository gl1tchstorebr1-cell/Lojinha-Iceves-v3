import type {
  FinancialTransaction,
  Invoice,
  Product,
  Sale,
  SalesReceipt,
  StockMovement,
  Student,
} from '../types/index.ts';

export class IntegrityError extends Error {
  public readonly code: string;
  constructor(message: string, code = 'INTEGRITY_ERROR') {
    super(message);
    this.name = 'IntegrityError';
    this.code = code;
  }
}

export type IntegritySeverity = 'ERROR' | 'WARNING';

export type IntegrityIssueCode =
  | 'RECEIPT_ACTIVE_WITHOUT_COMPLETED_SALE'
  | 'COMPLETED_SALE_WITHOUT_ACTIVE_RECEIPT'
  | 'SALE_POINTING_TO_MISSING_RECEIPT'
  | 'RECEIPT_POINTING_TO_MISSING_SALE'
  | 'NEGATIVE_PRODUCT_STOCK'
  | 'STOCK_MOVEMENT_INCONSISTENT'
  | 'CONSUMPTION_WITHOUT_VALID_SALE'
  | 'MISSING_FINANCIAL_LEDGER_ENTRY'
  | 'STUDENT_CONSUMPTION_MISMATCH'
  | 'DUPLICATE_IDEMPOTENCY_KEY'
  | 'SALE_TOTAL_MISMATCH'
  | 'RECEIPT_SALE_DIVERGENCE'
  | 'RECEIPT_STUDENT_MISMATCH'
  | 'RECEIPT_ITEMS_MISMATCH'
  | 'STALE_PENDING_SALE';

export interface IntegrityIssue {
  code: IntegrityIssueCode;
  severity: IntegritySeverity;
  entityType: 'SALE' | 'RECEIPT' | 'PRODUCT' | 'STOCK_MOVEMENT' | 'LEDGER' | 'STUDENT';
  entityId: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface IntegritySnapshot {
  sales: Sale[];
  receipts: SalesReceipt[];
  products: Product[];
  students: Student[];
  stockMovements?: StockMovement[];
  financialLedger?: FinancialTransaction[];
  invoices?: Invoice[];
}

export interface IntegrityReport {
  checkedAt: string;
  healthy: boolean;
  errorCount: number;
  warningCount: number;
  issues: IntegrityIssue[];
  inconsistentSaleIds: string[];
  summary: {
    totalSales: number;
    completedSales: number;
    validCompletedSales: number;
    inconsistentSales: number;
    reversedSales: number;
    cancelledSales: number;
    totalReceipts: number;
    activeReceipts: number;
    productsCount: number;
    negativeStockProducts: number;
  };
}

function roundCurrency(val: number): number {
  return Math.round((Number(val) || 0) * 100) / 100;
}

/**
 * Verifica se uma venda COMPLETED / PARTIALLY_REVERSED possui recibo ATIVO correspondente
 * e 100% consistente em aluno, itens e total.
 */
export function isSaleConsistent(
  sale: Sale,
  receipts: SalesReceipt[]
): { valid: boolean; reason?: string; receipt?: SalesReceipt } {
  if (!sale) return { valid: false, reason: 'Venda indefinida.' };
  if (sale.status === 'CANCELLED' || sale.status === 'FAILED' || sale.status === 'INCONSISTENTE' || sale.status === 'PENDING') {
    return { valid: false, reason: sale.integrityReason || `Status inválido (${sale.status}).` };
  }
  if (sale.status === 'REVERSED') {
    const revReceipt = (receipts || []).find(r => r.saleId === sale.id);
    if (revReceipt && revReceipt.status === 'ATIVO') {
      return { valid: false, reason: `Recibo ${revReceipt.receiptCode} permanece ATIVO em venda estornada.` };
    }
    return { valid: true, receipt: revReceipt };
  }

  const list = Array.isArray(receipts) ? receipts : [];
  const matchingReceipt = list.find(
    r => r.saleId === sale.id && (r.status === 'ATIVO' || r.status === 'PARCIALMENTE_ESTORNADO')
  );

  if (!matchingReceipt) {
    return {
      valid: false,
      reason: `Venda concluída ${sale.id} não possui recibo ATIVO correspondente.`,
    };
  }

  if (sale.receiptId && matchingReceipt.id !== sale.receiptId) {
    const pointed = list.find(r => r.id === sale.receiptId);
    if (!pointed) {
      return {
        valid: false,
        reason: `Venda ${sale.id} aponta para recibo inexistente (${sale.receiptId}).`,
      };
    }
  }

  if (matchingReceipt.studentSnapshot?.studentId && matchingReceipt.studentSnapshot.studentId !== sale.studentId) {
    return {
      valid: false,
      reason: `Aluno do recibo (${matchingReceipt.studentSnapshot.studentId}) diverge da venda (${sale.studentId}).`,
    };
  }

  const receiptTotal = roundCurrency(matchingReceipt.financialSummary?.saleTotal ?? 0);
  const saleTotal = roundCurrency(sale.total);
  if (Math.abs(receiptTotal - saleTotal) > 0.02) {
    return {
      valid: false,
      reason: `Total do recibo (R$ ${receiptTotal.toFixed(2)}) diverge do total da venda (R$ ${saleTotal.toFixed(2)}).`,
    };
  }

  const saleItems = Array.isArray(sale.items) ? sale.items : [];
  const receiptItems = Array.isArray(matchingReceipt.items) ? matchingReceipt.items : [];
  if (saleItems.length !== receiptItems.length) {
    return {
      valid: false,
      reason: `Quantidade de itens no recibo (${receiptItems.length}) diverge da venda (${saleItems.length}).`,
    };
  }

  for (let i = 0; i < saleItems.length; i++) {
    const sItem = saleItems[i];
    const rItem = receiptItems.find(ri => ri.productId === sItem.productId) || receiptItems[i];
    if (
      !rItem ||
      rItem.productId !== sItem.productId ||
      Number(rItem.quantity) !== Number(sItem.quantity) ||
      Math.abs(roundCurrency(rItem.unitPrice) - roundCurrency(sItem.unitPrice)) > 0.02 ||
      Math.abs(roundCurrency(rItem.subtotal) - roundCurrency(sItem.subtotal)) > 0.02
    ) {
      return {
        valid: false,
        reason: `Item "${sItem.name}" diverge entre venda ${sale.id} e recibo ${matchingReceipt.receiptCode}.`,
      };
    }
  }

  return { valid: true, receipt: matchingReceipt };
}

/**
 * Retorna exclusivamente vendas concluídas válidas (com recibo ATIVO consistente).
 * Usado por Dashboard, Relatórios e indicadores financeiros para nunca contar vendas órfãs.
 */
export function getValidCompletedSales(sales: Sale[], receipts: SalesReceipt[]): Sale[] {
  const safeSales = Array.isArray(sales) ? sales : [];
  const safeReceipts = Array.isArray(receipts) ? receipts : [];
  return safeSales.filter(sale => {
    if (sale.status !== 'COMPLETED' && sale.status !== 'PARTIALLY_REVERSED') return false;
    return isSaleConsistent(sale, safeReceipts).valid;
  });
}

/**
 * Retorna vendas marcadas como concluídas que falham na validação de integridade (órfãs/inconsistentes).
 */
export function getInconsistentSales(
  sales: Sale[],
  receipts: SalesReceipt[]
): Array<{ sale: Sale; reason: string }> {
  const safeSales = Array.isArray(sales) ? sales : [];
  const safeReceipts = Array.isArray(receipts) ? receipts : [];
  const result: Array<{ sale: Sale; reason: string }> = [];

  for (const sale of safeSales) {
    if (sale.status === 'INCONSISTENTE') {
      result.push({
        sale,
        reason: sale.integrityReason || `Venda ${sale.id} marcada como inconsistente.`,
      });
      continue;
    }
    if (sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REVERSED') {
      const check = isSaleConsistent(sale, safeReceipts);
      if (!check.valid) {
        result.push({
          sale,
          reason: check.reason || `Venda ${sale.id} inconsistente com recibo.`,
        });
      }
    }
  }
  return result;
}

/**
 * Valida a integridade referencial, financeira e de estoque de todo o snapshot do sistema.
 */
export function validateDataIntegrity(snapshot: IntegritySnapshot): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const sales = Array.isArray(snapshot.sales) ? snapshot.sales : [];
  const receipts = Array.isArray(snapshot.receipts) ? snapshot.receipts : [];
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const students = Array.isArray(snapshot.students) ? snapshot.students : [];
  const stockMovements = Array.isArray(snapshot.stockMovements) ? snapshot.stockMovements : [];
  const financialLedger = Array.isArray(snapshot.financialLedger) ? snapshot.financialLedger : [];

  const saleById = new Map<string, Sale>();
  const receiptById = new Map<string, SalesReceipt>();
  const idempotencyMap = new Map<string, string[]>();

  for (const receipt of receipts) {
    receiptById.set(receipt.id, receipt);
  }

  for (const sale of sales) {
    saleById.set(sale.id, sale);

    if (sale.status === 'PENDING') {
      issues.push({
        code: 'STALE_PENDING_SALE',
        severity: 'ERROR',
        entityType: 'SALE',
        entityId: sale.id,
        message: `Venda ${sale.id} permaneceu em estado PENDING (transação interrompida).`,
      });
    }

    if (sale.status === 'INCONSISTENTE') {
      issues.push({
        code: 'COMPLETED_SALE_WITHOUT_ACTIVE_RECEIPT',
        severity: 'ERROR',
        entityType: 'SALE',
        entityId: sale.id,
        message: sale.integrityReason || `Venda ${sale.id} está marcada como INCONSISTENTE e requer correção.`,
      });
    }

    if (sale.idempotencyKey && sale.status !== 'CANCELLED' && sale.status !== 'FAILED') {
      const list = idempotencyMap.get(sale.idempotencyKey) || [];
      list.push(sale.id);
      idempotencyMap.set(sale.idempotencyKey, list);
    }

    // Venda apontando para recibo inexistente
    if (
      sale.receiptId &&
      (sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REVERSED') &&
      !receiptById.has(sale.receiptId)
    ) {
      issues.push({
        code: 'SALE_POINTING_TO_MISSING_RECEIPT',
        severity: 'ERROR',
        entityType: 'SALE',
        entityId: sale.id,
        message: `Venda ${sale.id} referencia o recibo inexistente "${sale.receiptId}".`,
        details: { receiptId: sale.receiptId, receiptCode: sale.receiptCode },
      });
    }

    // Divergência de total da venda
    if (
      Array.isArray(sale.items) &&
      sale.items.length > 0 &&
      sale.status !== 'FAILED' &&
      sale.status !== 'CANCELLED'
    ) {
      const sumItemSubtotals = roundCurrency(
        sale.items.reduce((acc, item) => acc + roundCurrency(item.subtotal), 0)
      );
      const rawSubtotal = roundCurrency(
        sale.items.reduce((acc, item) => acc + roundCurrency(Number(item.unitPrice) * Number(item.quantity)), 0)
      );
      const itemLevelDiscounts = roundCurrency(
        sale.items.reduce((acc, item) => acc + roundCurrency(item.discountAmount || 0), 0)
      );
      const totalDiscount = roundCurrency(sale.discountTotal ?? sale.discountAmount ?? itemLevelDiscounts);
      const creditUsed = roundCurrency(sale.creditUsed || 0);

      const expectedFromRaw = Math.max(0, roundCurrency(rawSubtotal - totalDiscount - creditUsed));
      const expectedFromSub = Math.max(
        0,
        roundCurrency(sumItemSubtotals - Math.max(0, totalDiscount - itemLevelDiscounts) - creditUsed)
      );
      const actualTotal = roundCurrency(sale.total);

      if (
        Math.abs(actualTotal - expectedFromRaw) > 0.02 &&
        Math.abs(actualTotal - expectedFromSub) > 0.02
      ) {
        issues.push({
          code: 'SALE_TOTAL_MISMATCH',
          severity: 'ERROR',
          entityType: 'SALE',
          entityId: sale.id,
          message: `Divergência no total da venda ${sale.id}: registrado R$ ${actualTotal.toFixed(2)}, esperado R$ ${expectedFromRaw.toFixed(2)}.`,
          details: { actualTotal, expectedFromRaw, rawSubtotal, totalDiscount, creditUsed },
        });
      }
    }
  }

  // Vendas duplicadas por idempotencyKey
  for (const [key, saleIds] of idempotencyMap.entries()) {
    if (saleIds.length > 1) {
      issues.push({
        code: 'DUPLICATE_IDEMPOTENCY_KEY',
        severity: 'ERROR',
        entityType: 'SALE',
        entityId: saleIds.join(', '),
        message: `Chave de idempotência duplicada "${key}" encontrada em ${saleIds.length} vendas (${saleIds.join(', ')}).`,
        details: { idempotencyKey: key, saleIds },
      });
    }
  }

  const receiptsBySaleId = new Map<string, SalesReceipt[]>();
  for (const receipt of receipts) {
    const list = receiptsBySaleId.get(receipt.saleId) || [];
    list.push(receipt);
    receiptsBySaleId.set(receipt.saleId, list);

    const linkedSale = saleById.get(receipt.saleId);

    // Recibo apontando para venda inexistente
    if (!linkedSale) {
      issues.push({
        code: receipt.status === 'ATIVO' ? 'RECEIPT_ACTIVE_WITHOUT_COMPLETED_SALE' : 'RECEIPT_POINTING_TO_MISSING_SALE',
        severity: receipt.status === 'ATIVO' ? 'ERROR' : 'WARNING',
        entityType: 'RECEIPT',
        entityId: receipt.id,
        message: `Recibo ${receipt.receiptCode} (${receipt.id}) aponta para venda inexistente (saleId: ${receipt.saleId || 'indefinido'}).`,
        details: { receiptId: receipt.id, receiptCode: receipt.receiptCode, saleId: receipt.saleId, status: receipt.status },
      });
      continue;
    }

    // Recibo ATIVO sem venda COMPLETED correspondente
    if (receipt.status === 'ATIVO') {
      if (linkedSale.status !== 'COMPLETED' && linkedSale.status !== 'PARTIALLY_REVERSED') {
        issues.push({
          code: 'RECEIPT_ACTIVE_WITHOUT_COMPLETED_SALE',
          severity: 'ERROR',
          entityType: 'RECEIPT',
          entityId: receipt.id,
          message: `Recibo ativo ${receipt.receiptCode} (${receipt.id}) não possui venda COMPLETED correspondente (status da venda ${linkedSale.id}: ${linkedSale.status}).`,
          details: { receiptId: receipt.id, receiptCode: receipt.receiptCode, saleId: receipt.saleId, saleStatus: linkedSale.status },
        });
      }
    }

    // Divergência de aluno entre recibo e venda
    if (receipt.studentSnapshot?.studentId && receipt.studentSnapshot.studentId !== linkedSale.studentId) {
      issues.push({
        code: 'RECEIPT_STUDENT_MISMATCH',
        severity: 'ERROR',
        entityType: 'RECEIPT',
        entityId: receipt.id,
        message: `Aluno do recibo ${receipt.receiptCode} (${receipt.studentSnapshot.studentId}) diverge do aluno da venda ${linkedSale.id} (${linkedSale.studentId}).`,
      });
    }

    // Divergência de total entre recibo e venda
    const receiptTotal = roundCurrency(receipt.financialSummary?.saleTotal ?? 0);
    const saleTotal = roundCurrency(linkedSale.total);
    if (Math.abs(receiptTotal - saleTotal) > 0.02) {
      issues.push({
        code: 'RECEIPT_SALE_DIVERGENCE',
        severity: 'ERROR',
        entityType: 'RECEIPT',
        entityId: receipt.id,
        message: `Valor do recibo ${receipt.receiptCode} (R$ ${receiptTotal.toFixed(2)}) diverge do total da venda ${linkedSale.id} (R$ ${saleTotal.toFixed(2)}).`,
        details: { receiptTotal, saleTotal, saleId: linkedSale.id },
      });
    }

    // Divergência de itens entre recibo e venda
    const saleItems = Array.isArray(linkedSale.items) ? linkedSale.items : [];
    const receiptItems = Array.isArray(receipt.items) ? receipt.items : [];
    if (saleItems.length !== receiptItems.length) {
      issues.push({
        code: 'RECEIPT_ITEMS_MISMATCH',
        severity: 'ERROR',
        entityType: 'RECEIPT',
        entityId: receipt.id,
        message: `Quantidade de itens no recibo ${receipt.receiptCode} (${receiptItems.length}) diverge da venda ${linkedSale.id} (${saleItems.length}).`,
      });
    } else {
      for (let i = 0; i < saleItems.length; i++) {
        const sItem = saleItems[i];
        const rItem = receiptItems.find(ri => ri.productId === sItem.productId) || receiptItems[i];
        if (
          !rItem ||
          rItem.productId !== sItem.productId ||
          Number(rItem.quantity) !== Number(sItem.quantity) ||
          Math.abs(roundCurrency(rItem.subtotal) - roundCurrency(sItem.subtotal)) > 0.02
        ) {
          issues.push({
            code: 'RECEIPT_ITEMS_MISMATCH',
            severity: 'ERROR',
            entityType: 'RECEIPT',
            entityId: receipt.id,
            message: `Item "${sItem.name}" no recibo ${receipt.receiptCode} diverge da venda ${linkedSale.id}.`,
          });
          break;
        }
      }
    }
  }

  // Venda COMPLETED sem recibo ATIVO correspondente
  for (const sale of sales) {
    if (sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REVERSED') {
      const saleReceipts = receiptsBySaleId.get(sale.id) || [];
      const activeReceipts = saleReceipts.filter(r => r.status === 'ATIVO' || r.status === 'PARCIALMENTE_ESTORNADO');
      if (activeReceipts.length === 0) {
        issues.push({
          code: 'COMPLETED_SALE_WITHOUT_ACTIVE_RECEIPT',
          severity: 'ERROR',
          entityType: 'SALE',
          entityId: sale.id,
          message: `Venda concluída ${sale.id} não possui recibo ATIVO correspondente.`,
        });
      }
    }
  }

  // Estoque negativo em produtos
  for (const product of products) {
    if (Number(product.currentStock) < 0) {
      issues.push({
        code: 'NEGATIVE_PRODUCT_STOCK',
        severity: 'ERROR',
        entityType: 'PRODUCT',
        entityId: product.id,
        message: `Produto "${product.name}" (${product.internalCode}) está com estoque negativo (${product.currentStock}).`,
      });
    }
  }

  // Movimentação de estoque inconsistente
  for (const mov of stockMovements) {
    const prev = Number(mov.previousStock);
    const qty = Number(mov.quantity);
    const next = Number(mov.newStock);
    if (next < 0) {
      issues.push({
        code: 'STOCK_MOVEMENT_INCONSISTENT',
        severity: 'ERROR',
        entityType: 'STOCK_MOVEMENT',
        entityId: mov.id,
        message: `Movimentação ${mov.id} resultou em estoque negativo (${next}) para "${mov.productName}".`,
      });
    }
    if (Math.abs(prev + qty - next) > 0.001) {
      issues.push({
        code: 'STOCK_MOVEMENT_INCONSISTENT',
        severity: 'ERROR',
        entityType: 'STOCK_MOVEMENT',
        entityId: mov.id,
        message: `Movimentação ${mov.id} de "${mov.productName}" inconsistente: anterior (${prev}) + variação (${qty}) ≠ posterior (${next}).`,
      });
    }
    const linkedSaleId = mov.saleId || mov.referenceId;
    if ((mov.type === 'SAIDA_VENDA' || mov.type === 'ESTORNO_VENDA') && linkedSaleId && !saleById.has(linkedSaleId)) {
      issues.push({
        code: 'STOCK_MOVEMENT_INCONSISTENT',
        severity: 'WARNING',
        entityType: 'STOCK_MOVEMENT',
        entityId: mov.id,
        message: `Movimentação de venda ${mov.id} referencia venda inexistente (${linkedSaleId}).`,
      });
    }
  }

  // Consumo no livro financeiro sem venda correspondente válida
  const ledgerSaleRefs = new Set<string>();
  for (const entry of financialLedger) {
    const refSaleId = entry.saleId || entry.documentRef;
    if (refSaleId) ledgerSaleRefs.add(refSaleId);
    if (entry.category === 'CONSUMO_LOJINHA' || entry.category === 'PDV_PASSEIOS') {
      if (!refSaleId || !saleById.has(refSaleId)) {
        issues.push({
          code: 'CONSUMPTION_WITHOUT_VALID_SALE',
          severity: 'ERROR',
          entityType: 'LEDGER',
          entityId: entry.id,
          message: `Lançamento de consumo ${entry.id} (R$ ${roundCurrency(entry.amount).toFixed(2)}) não está vinculado a uma venda existente (ref: ${refSaleId || 'ausente'}).`,
        });
      }
    }
  }

  // Alerta de lançamento financeiro ausente para vendas válidas em CONTA_ALUNO (quando ledger está carregado)
  if (financialLedger.length > 0) {
    for (const sale of sales) {
      if (
        (sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REVERSED') &&
        (sale.paymentMethod === 'CONTA_ALUNO' || !sale.paymentMethod) &&
        sale.total > 0 &&
        !ledgerSaleRefs.has(sale.id)
      ) {
        issues.push({
          code: 'MISSING_FINANCIAL_LEDGER_ENTRY',
          severity: 'WARNING',
          entityType: 'SALE',
          entityId: sale.id,
          message: `Venda ${sale.id} em CONTA_ALUNO não possui lançamento correspondente no livro financeiro.`,
        });
      }
    }
  }

  // Alerta de saldo de consumo negativo no aluno
  for (const st of students) {
    if (Number(st.currentConsumptionBalance) < -0.01 || Number(st.totalOpenDebt) < -0.01) {
      issues.push({
        code: 'STUDENT_CONSUMPTION_MISMATCH',
        severity: 'ERROR',
        entityType: 'STUDENT',
        entityId: st.id,
        message: `Saldo financeiro do aluno "${st.name}" está negativo (consumo: R$ ${Number(st.currentConsumptionBalance).toFixed(2)}, dívida: R$ ${Number(st.totalOpenDebt).toFixed(2)}).`,
      });
    }
  }

  return issues;
}

export function buildIntegrityReport(snapshot: IntegritySnapshot): IntegrityReport {
  const issues = validateDataIntegrity(snapshot);
  const errorCount = issues.filter(i => i.severity === 'ERROR').length;
  const warningCount = issues.filter(i => i.severity === 'WARNING').length;
  const sales = Array.isArray(snapshot.sales) ? snapshot.sales : [];
  const receipts = Array.isArray(snapshot.receipts) ? snapshot.receipts : [];
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const validCompleted = getValidCompletedSales(sales, receipts);
  const inconsistent = getInconsistentSales(sales, receipts);

  return {
    checkedAt: new Date().toISOString(),
    healthy: errorCount === 0,
    errorCount,
    warningCount,
    issues,
    inconsistentSaleIds: inconsistent.map(i => i.sale.id),
    summary: {
      totalSales: sales.length,
      completedSales: sales.filter(s => s.status === 'COMPLETED' || s.status === 'PARTIALLY_REVERSED').length,
      validCompletedSales: validCompleted.length,
      inconsistentSales: inconsistent.length,
      reversedSales: sales.filter(s => s.status === 'REVERSED').length,
      cancelledSales: sales.filter(s => s.status === 'CANCELLED').length,
      totalReceipts: receipts.length,
      activeReceipts: receipts.filter(r => r.status === 'ATIVO' || r.status === 'PARCIALMENTE_ESTORNADO').length,
      productsCount: products.length,
      negativeStockProducts: products.filter(p => Number(p.currentStock) < 0).length,
    },
  };
}
