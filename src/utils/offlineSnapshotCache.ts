import type {
  AuditLog,
  FinancialTransaction,
  Guardian,
  Invoice,
  Passeio,
  PixPayment,
  Product,
  Sale,
  SalesReceipt,
  StockMovement,
  Student,
  SystemSettings,
  WhatsAppNotification,
} from '../types/index.ts';
import { validateDataIntegrity } from './dataIntegrity.ts';

export const SNAPSHOT_KEY = 'iceves_offline_snapshot_v1';
export const SNAPSHOT_BACKUP_KEY = 'iceves_offline_snapshot_v1_backup';
export const SNAPSHOT_TX_JOURNAL_KEY = 'iceves_offline_tx_journal_v1';

export interface OfflineDataSnapshot {
  version?: number;
  syncedAt: string;
  settings: SystemSettings | null;
  products: Product[];
  students: Student[];
  guardians?: Guardian[];
  sales: Sale[];
  receipts?: SalesReceipt[];
  stockMovements?: StockMovement[];
  financialLedger?: FinancialTransaction[];
  auditLogs?: AuditLog[];
  invoices: Invoice[];
  pixPayments: PixPayment[];
  whatsappNotifications: WhatsAppNotification[];
  passeios: Passeio[];
}

interface SnapshotTxJournal {
  txId: string;
  operation: string;
  startedAt: string;
  status: 'IN_PROGRESS' | 'COMMITTED';
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Gravação atômica no localStorage com backup prévio, journal de transação,
 * leitura de verificação (readback) e rollback automático em caso de falha (ex.: QuotaExceededError).
 */
export function saveOfflineSnapshotAtomic(
  snapshot: OfflineDataSnapshot,
  options?: {
    storage?: StorageLike;
    operation?: string;
    txId?: string;
    validateBeforeCommit?: boolean;
  }
): { ok: true } {
  const store = resolveStorage(options?.storage);
  if (!store) {
    return { ok: true };
  }

  if (options?.validateBeforeCommit) {
    const issues = validateDataIntegrity({
      sales: snapshot.sales || [],
      receipts: snapshot.receipts || [],
      products: snapshot.products || [],
      students: snapshot.students || [],
      stockMovements: snapshot.stockMovements || [],
      financialLedger: snapshot.financialLedger || [],
      invoices: snapshot.invoices || [],
    });
    const critical = issues.filter(i => i.severity === 'ERROR');
    if (critical.length > 0) {
      throw new Error(`Validação de integridade falhou antes da persistência local: ${critical[0].message}`);
    }
  }

  const txId = options?.txId || `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const previousRaw = store.getItem(SNAPSHOT_KEY);
  const payload: OfflineDataSnapshot = {
    ...snapshot,
    version: (snapshot.version || 0) + 1,
    syncedAt: snapshot.syncedAt || new Date().toISOString(),
  };
  const serialized = JSON.stringify(payload);

  try {
    // 1. Grava backup do snapshot anterior (se existir)
    if (previousRaw) {
      store.setItem(SNAPSHOT_BACKUP_KEY, previousRaw);
    }

    // 2. Marca início da transação no journal (para detectar interrupções no reload)
    const journal: SnapshotTxJournal = {
      txId,
      operation: options?.operation || 'SAVE_SNAPSHOT',
      startedAt: new Date().toISOString(),
      status: 'IN_PROGRESS',
    };
    store.setItem(SNAPSHOT_TX_JOURNAL_KEY, JSON.stringify(journal));

    // 3. Persistência única do estado final
    store.setItem(SNAPSHOT_KEY, serialized);

    // 4. Verificação de leitura (garante integridade da escrita)
    const readback = store.getItem(SNAPSHOT_KEY);
    if (!readback || readback.length !== serialized.length) {
      throw new Error('Falha na verificação de integridade após gravação no armazenamento local.');
    }

    // 5. Commit concluído — limpa journal de pendência
    store.removeItem(SNAPSHOT_TX_JOURNAL_KEY);
    return { ok: true };
  } catch (err: any) {
    // Rollback completo para o snapshot anterior
    try {
      if (previousRaw !== null) {
        if (store.getItem(SNAPSHOT_KEY) !== previousRaw) {
          store.setItem(SNAPSHOT_KEY, previousRaw);
        }
      } else {
        store.removeItem(SNAPSHOT_KEY);
      }
    } catch {
      // Storage indisponível durante restauração da chave principal
    }
    try {
      store.removeItem(SNAPSHOT_TX_JOURNAL_KEY);
    } catch {
      // Ignora erro ao limpar journal
    }
    throw new Error(
      `Falha ao persistir os dados localmente (alterações revertidas com segurança): ${err?.message || 'erro de armazenamento'}`
    );
  }
}

/**
 * Mantém compatibilidade com chamadas não críticas de cache de leitura,
 * preservando segurança atômica sem quebrar leitura silenciosa.
 */
export function saveOfflineSnapshot(snapshot: OfflineDataSnapshot, storage?: StorageLike): boolean {
  try {
    saveOfflineSnapshotAtomic(snapshot, { storage, operation: 'SYNC_CACHE' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detecta operações interrompidas (journal pendente) ou snapshot corrompido ao recarregar a página
 * e restaura automaticamente o último backup íntegro.
 */
export function recoverOfflineSnapshotOnBoot(storage?: StorageLike): {
  recovered: boolean;
  reason?: string;
  snapshot: OfflineDataSnapshot | null;
} {
  const store = resolveStorage(storage);
  if (!store) {
    return { recovered: false, snapshot: null };
  }

  const journalRaw = store.getItem(SNAPSHOT_TX_JOURNAL_KEY);
  const currentRaw = store.getItem(SNAPSHOT_KEY);
  const backupRaw = store.getItem(SNAPSHOT_BACKUP_KEY);

  let interrupted = false;
  if (journalRaw) {
    try {
      const parsedJournal = JSON.parse(journalRaw) as SnapshotTxJournal;
      if (parsedJournal?.status === 'IN_PROGRESS') {
        interrupted = true;
      }
    } catch {
      interrupted = true;
    }
  }

  const parseSnapshot = (raw: string | null): OfflineDataSnapshot | null => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as OfflineDataSnapshot;
    } catch {
      return null;
    }
  };

  const currentSnap = parseSnapshot(currentRaw);
  const backupSnap = parseSnapshot(backupRaw);

  if (interrupted || (currentRaw && !currentSnap)) {
    if (backupSnap) {
      try {
        store.setItem(SNAPSHOT_KEY, JSON.stringify(backupSnap));
        store.removeItem(SNAPSHOT_TX_JOURNAL_KEY);
      } catch {
        // ignore
      }
      return {
        recovered: true,
        reason: interrupted
          ? 'Transação local interrompida detectada; último snapshot consistente restaurado.'
          : 'Snapshot local corrompido; backup consistente restaurado.',
        snapshot: backupSnap,
      };
    }

    try {
      store.removeItem(SNAPSHOT_TX_JOURNAL_KEY);
    } catch {
      // ignore
    }
    return {
      recovered: Boolean(currentSnap),
      reason: 'Journal pendente limpo após recarregamento.',
      snapshot: currentSnap,
    };
  }

  return { recovered: false, snapshot: currentSnap };
}

export function loadOfflineSnapshot(storage?: StorageLike): OfflineDataSnapshot | null {
  const { snapshot } = recoverOfflineSnapshotOnBoot(storage);
  return snapshot;
}

/**
 * Aplica de forma atômica o resultado completo de uma venda ao snapshot offline,
 * garantindo atualização sincronizada de vendas, recibos, estoque, movimentações, aluno, ledger e auditoria.
 */
export function commitSaleBundleToOfflineSnapshot(
  current: OfflineDataSnapshot,
  bundle: {
    sale: Sale;
    student: Student;
    receipt: SalesReceipt;
    updatedProducts?: Product[];
    stockMovements?: StockMovement[];
    ledgerEntries?: FinancialTransaction[];
    auditLog?: AuditLog;
  },
  storage?: StorageLike
): OfflineDataSnapshot {
  const next = deepClone(current);
  next.syncedAt = new Date().toISOString();

  // 1. Venda (idempotente por ID)
  next.sales = [bundle.sale, ...(next.sales || []).filter(s => s.id !== bundle.sale.id)];

  // 2. Recibo vinculado à venda
  next.receipts = [bundle.receipt, ...(next.receipts || []).filter(r => r.id !== bundle.receipt.id && r.saleId !== bundle.sale.id)];

  // 3. Aluno atualizado
  next.students = (next.students || []).map(s => (s.id === bundle.student.id ? bundle.student : s));

  // 4. Produtos com estoque atualizado
  if (Array.isArray(bundle.updatedProducts) && bundle.updatedProducts.length > 0) {
    const byId = new Map(bundle.updatedProducts.map(p => [p.id, p]));
    next.products = (next.products || []).map(p => byId.get(p.id) || p);
  }

  // 5. Movimentações de estoque
  if (Array.isArray(bundle.stockMovements) && bundle.stockMovements.length > 0) {
    const existingIds = new Set(bundle.stockMovements.map(m => m.id));
    next.stockMovements = [
      ...bundle.stockMovements,
      ...(next.stockMovements || []).filter(m => !existingIds.has(m.id)),
    ];
  }

  // 6. Livro financeiro
  if (Array.isArray(bundle.ledgerEntries) && bundle.ledgerEntries.length > 0) {
    const existingIds = new Set(bundle.ledgerEntries.map(l => l.id));
    next.financialLedger = [
      ...bundle.ledgerEntries,
      ...(next.financialLedger || []).filter(l => !existingIds.has(l.id)),
    ];
  }

  // 7. Auditoria
  if (bundle.auditLog) {
    next.auditLogs = [bundle.auditLog, ...(next.auditLogs || []).filter(a => a.id !== bundle.auditLog!.id)];
  }

  saveOfflineSnapshotAtomic(next, {
    storage,
    operation: `SALE_COMMIT:${bundle.sale.id}`,
    txId: bundle.sale.idempotencyKey || bundle.sale.id,
    validateBeforeCommit: true,
  });

  return next;
}

/**
 * Aplica de forma atômica o resultado completo de um estorno ao snapshot offline.
 */
export function commitReversalBundleToOfflineSnapshot(
  current: OfflineDataSnapshot,
  bundle: {
    sale: Sale;
    student: Student;
    receipt?: SalesReceipt;
    updatedProducts?: Product[];
    stockMovements?: StockMovement[];
    updatedInvoices?: Invoice[];
    ledgerEntries?: FinancialTransaction[];
    auditLog?: AuditLog;
  },
  storage?: StorageLike
): OfflineDataSnapshot {
  const next = deepClone(current);
  next.syncedAt = new Date().toISOString();

  next.sales = (next.sales || []).map(s => (s.id === bundle.sale.id ? bundle.sale : s));

  if (bundle.receipt) {
    const exists = (next.receipts || []).some(r => r.id === bundle.receipt!.id);
    next.receipts = exists
      ? (next.receipts || []).map(r => (r.id === bundle.receipt!.id ? bundle.receipt! : r))
      : [bundle.receipt, ...(next.receipts || [])];
  }

  next.students = (next.students || []).map(s => (s.id === bundle.student.id ? bundle.student : s));

  if (Array.isArray(bundle.updatedProducts) && bundle.updatedProducts.length > 0) {
    const byId = new Map(bundle.updatedProducts.map(p => [p.id, p]));
    next.products = (next.products || []).map(p => byId.get(p.id) || p);
  }

  if (Array.isArray(bundle.updatedInvoices) && bundle.updatedInvoices.length > 0) {
    const invById = new Map(bundle.updatedInvoices.map(i => [i.id, i]));
    next.invoices = (next.invoices || []).map(i => invById.get(i.id) || i);
  }

  if (Array.isArray(bundle.stockMovements) && bundle.stockMovements.length > 0) {
    const existingIds = new Set(bundle.stockMovements.map(m => m.id));
    next.stockMovements = [
      ...bundle.stockMovements,
      ...(next.stockMovements || []).filter(m => !existingIds.has(m.id)),
    ];
  }

  if (Array.isArray(bundle.ledgerEntries) && bundle.ledgerEntries.length > 0) {
    const existingIds = new Set(bundle.ledgerEntries.map(l => l.id));
    next.financialLedger = [
      ...bundle.ledgerEntries,
      ...(next.financialLedger || []).filter(l => !existingIds.has(l.id)),
    ];
  }

  if (bundle.auditLog) {
    next.auditLogs = [bundle.auditLog, ...(next.auditLogs || []).filter(a => a.id !== bundle.auditLog!.id)];
  }

  saveOfflineSnapshotAtomic(next, {
    storage,
    operation: `SALE_REVERSAL:${bundle.sale.id}`,
    txId: bundle.sale.reversalIdempotencyKey || `REV-${bundle.sale.id}`,
    validateBeforeCommit: true,
  });

  return next;
}
