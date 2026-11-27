import type {
  FinancialTransaction,
  Invoice,
  Product,
  Sale,
  SalesReceipt,
  StockMovement,
  Student,
} from '../types/index.ts';

export type IntegritySeverity = 'ERROR' | 'WARNING';

export type IntegrityIssueCode =
  | 'RECEIPT_ACTIVE_WITHOUT_COMPLETED_SALE'
  | 'COMPLETED_SALE_WITHOUT_ACTIVE_RECEIPT'
  | 'NEGATIVE_PRODUCT_STOCK'
  | 'STOCK_MOVEMENT_INCONSISTENT'
  | 'CONSUMPTION_WITHOUT_VALID_SALE'
  | 'DUPLICATE_IDEMPOTENCY_KEY'
  | 'SALE_TOTAL_MISMATCH'
  | 'RECEIPT_SALE_DIVERGENCE'
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
  summary: {
    totalSales: number;
    completedSales: number;
    reversedSales: number;
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
 * Valida a integridade referencial, financeira e de estoque do snapshot do sistema.
 * Retorna uma lista de inconsistências detectadas (vazia quando o estado está 100% consistente).
 */
export function validateDataIntegrity(snapshot: IntegritySnapshot): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const sales = Array.isArray(snapshot.sales) ? snapshot.sales : [];
  const receipts = Array.isArray(snapshot.receipts) ? snapshot.receipts : [];
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const stockMovements = Array.isArray(snapshot.stockMovements) ? snapshot.stockMovements : [];
  const financialLedger = Array.isArray(snapshot.financialLedger) ? snapshot.financialLedger : [];

  const saleById = new Map<string, Sale>();
  const idempotencyMap = new Map<string, string[]>();

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

    if (sale.idempotencyKey) {
      const list = idempotencyMap.get(sale.idempotencyKey) || [];
      list.push(sale.id);
      idempotencyMap.set(sale.idempotencyKey, list);
    }

    // 7. Validação de divergência de total da venda
    if (Array.isArray(sale.items) && sale.items.length > 0 && sale.status !== 'FAILED') {
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

      // Compatível tanto com desconto por item já abatido no subtotal quanto desconto geral
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

  // 6. Vendas duplicadas por idempotencyKey
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

    // 1. Recibo ATIVO sem venda COMPLETED correspondente
    if (receipt.status === 'ATIVO') {
      if (!linkedSale || (linkedSale.status !== 'COMPLETED' && linkedSale.status !== 'PARTIALLY_REVERSED')) {
        issues.push({
          code: 'RECEIPT_ACTIVE_WITHOUT_COMPLETED_SALE',
          severity: 'ERROR',
          entityType: 'RECEIPT',
          entityId: receipt.id,
          message: `Recibo ativo ${receipt.receiptCode} (${receipt.id}) não possui venda COMPLETED correspondente (saleId: ${receipt.saleId || 'indefinido'}).`,
          details: { receiptId: receipt.id, receiptCode: receipt.receiptCode, saleId: receipt.saleId, saleStatus: linkedSale?.status || 'INEXISTENTE' },
        });
      }
    }

    // 8. Divergência entre recibo e venda
    if (linkedSale) {
      if (linkedSale.status === 'REVERSED' && receipt.status === 'ATIVO') {
        issues.push({
          code: 'RECEIPT_SALE_DIVERGENCE',
          severity: 'ERROR',
          entityType: 'RECEIPT',
          entityId: receipt.id,
          message: `Recibo ${receipt.receiptCode} permanece ATIVO apesar da venda ${linkedSale.id} estar estornada.`,
        });
      }

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

      const saleItemsCount = Array.isArray(linkedSale.items) ? linkedSale.items.length : 0;
      const receiptItemsCount = Array.isArray(receipt.items) ? receipt.items.length : 0;
      if (saleItemsCount !== receiptItemsCount) {
        issues.push({
          code: 'RECEIPT_SALE_DIVERGENCE',
          severity: 'ERROR',
          entityType: 'RECEIPT',
          entityId: receipt.id,
          message: `Quantidade de itens no recibo ${receipt.receiptCode} (${receiptItemsCount}) diverge da venda ${linkedSale.id} (${saleItemsCount}).`,
        });
      }
    }
  }

  // 2. Venda COMPLETED sem recibo ATIVO correspondente
  for (const sale of sales) {
    if (sale.status === 'COMPLETED') {
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

  // 3. Estoque negativo em produtos
  const productById = new Map<string, Product>();
  for (const product of products) {
    productById.set(product.id, product);
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

  // 4. Movimentação de estoque inconsistente
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

  // 5. Consumo no livro financeiro sem venda correspondente válida
  for (const entry of financialLedger) {
    if (entry.category === 'CONSUMO_LOJINHA' || entry.category === 'PDV_PASSEIOS') {
      const refSaleId = entry.saleId || entry.documentRef;
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

  return issues;
}

export function buildIntegrityReport(snapshot: IntegritySnapshot): IntegrityReport {
  const issues = validateDataIntegrity(snapshot);
  const errorCount = issues.filter(i => i.severity === 'ERROR').length;
  const warningCount = issues.filter(i => i.severity === 'WARNING').length;
  const sales = Array.isArray(snapshot.sales) ? snapshot.sales : [];
  const receipts = Array.isArray(snapshot.receipts) ? snapshot.receipts : [];
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];

  return {
    checkedAt: new Date().toISOString(),
    healthy: errorCount === 0,
    errorCount,
    warningCount,
    issues,
    summary: {
      totalSales: sales.length,
      completedSales: sales.filter(s => s.status === 'COMPLETED' || s.status === 'PARTIALLY_REVERSED').length,
      reversedSales: sales.filter(s => s.status === 'REVERSED').length,
      totalReceipts: receipts.length,
      activeReceipts: receipts.filter(r => r.status === 'ATIVO' || r.status === 'PARCIALMENTE_ESTORNADO').length,
      productsCount: products.length,
      negativeStockProducts: products.filter(p => Number(p.currentStock) < 0).length,
    },
  };
}
