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
import {
  IntegrityError,
  buildIntegrityReport,
  isSaleConsistent,
  validateDataIntegrity,
  type IntegrityReport,
} from './dataIntegrity.ts';

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

export function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
    return globalThis.localStorage;
  }
  return null;
}

export function deepCloneSnapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function parseSnapshotJson(raw: string | null): OfflineDataSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.sales) || !Array.isArray(parsed.products) || !Array.isArray(parsed.students)) {
      return null;
    }
    return parsed as OfflineDataSnapshot;
  } catch {
    return null;
  }
}

/**
 * Gravação atômica única no localStorage (iceves_offline_snapshot_v1) com:
 * - cópia de segurança prévia em iceves_offline_snapshot_v1_backup (mesmo modelo de dados);
 * - journal de transação para detecção de interrupções no reload;
 * - leitura real de verificação (readback) após persistir;
 * - rollback integral em caso de qualquer erro (inclusive QuotaExceededError).
 */
export function saveOfflineSnapshotAtomic(
  snapshot: OfflineDataSnapshot,
  options?: {
    storage?: StorageLike;
    operation?: string;
    txId?: string;
    validateBeforeCommit?: boolean;
    validateEntityIds?: string[];
    readbackVerify?: (persisted: OfflineDataSnapshot) => void;
    previousSnapshotOverride?: OfflineDataSnapshot;
  }
): { ok: true; persisted: OfflineDataSnapshot } {
  const store = resolveStorage(options?.storage);
  const payload: OfflineDataSnapshot = {
    ...snapshot,
    receipts: Array.isArray(snapshot.receipts) ? snapshot.receipts : [],
    stockMovements: Array.isArray(snapshot.stockMovements) ? snapshot.stockMovements : [],
    financialLedger: Array.isArray(snapshot.financialLedger) ? snapshot.financialLedger : [],
    auditLogs: Array.isArray(snapshot.auditLogs) ? snapshot.auditLogs : [],
    version: (snapshot.version || 0) + 1,
    syncedAt: snapshot.syncedAt || new Date().toISOString(),
  };

  if (options?.validateBeforeCommit) {
    const allIssues = validateDataIntegrity({
      sales: payload.sales || [],
      receipts: payload.receipts || [],
      products: payload.products || [],
      students: payload.students || [],
      stockMovements: payload.stockMovements || [],
      financialLedger: payload.financialLedger || [],
      invoices: payload.invoices || [],
    });

    const entityIds = options.validateEntityIds;
    const critical = allIssues.filter(issue => {
      if (issue.severity !== 'ERROR') return false;
      if (Array.isArray(entityIds) && entityIds.length > 0) {
        return entityIds.some(id => issue.entityId.includes(id));
      }
      return true;
    });

    if (critical.length > 0) {
      throw new IntegrityError(
        `Validação de integridade falhou antes da persistência local: ${critical[0].message}`,
        critical[0].code
      );
    }
  }

  if (!store) {
    return { ok: true, persisted: payload };
  }

  const txId = options?.txId || `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const previousRaw = options?.previousSnapshotOverride
    ? JSON.stringify(options.previousSnapshotOverride)
    : store.getItem(SNAPSHOT_KEY);
  const serialized = JSON.stringify(payload);

  try {
    // 1. Cria backup do estado anterior no mesmo schema (apenas cópia de segurança)
    if (previousRaw) {
      store.setItem(SNAPSHOT_BACKUP_KEY, previousRaw);
    }

    // 2. Marca início da transação no journal (para detecção de crash/reload)
    const journal: SnapshotTxJournal = {
      txId,
      operation: options?.operation || 'SAVE_SNAPSHOT',
      startedAt: new Date().toISOString(),
      status: 'IN_PROGRESS',
    };
    store.setItem(SNAPSHOT_TX_JOURNAL_KEY, JSON.stringify(journal));

    // 3. Persistência única do snapshot completo
    store.setItem(SNAPSHOT_KEY, serialized);

    // 4. Leitura real do snapshot persistido (readback) e revalidação
    const readbackRaw = store.getItem(SNAPSHOT_KEY);
    if (!readbackRaw || readbackRaw.length !== serialized.length) {
      throw new IntegrityError('Falha na verificação de integridade após gravação no armazenamento local.');
    }
    const persisted = parseSnapshotJson(readbackRaw);
    if (!persisted) {
      throw new IntegrityError('Snapshot persistido retornou estrutura JSON inválida após gravação.');
    }

    if (options?.readbackVerify) {
      options.readbackVerify(persisted);
    }

    // 5. Commit concluído — limpa journal de pendência
    store.removeItem(SNAPSHOT_TX_JOURNAL_KEY);
    return { ok: true, persisted };
  } catch (err: any) {
    // Rollback verdadeiro: restaura integralmente o snapshot anterior
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

    if (err instanceof IntegrityError) {
      throw err;
    }
    throw new Error(
      `Falha ao persistir os dados localmente (alterações revertidas com segurança): ${err?.message || 'erro de armazenamento'}`
    );
  }
}

export function saveOfflineSnapshot(snapshot: OfflineDataSnapshot, storage?: StorageLike): boolean {
  try {
    saveOfflineSnapshotAtomic(snapshot, { storage, operation: 'SYNC_CACHE' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Inspeciona o snapshot principal (única fonte oficial) e verifica se há backup disponível.
 * NUNCA mistura silenciosamente arrays do backup com arrays do snapshot principal.
 */
export function inspectPrincipalSnapshot(storage?: StorageLike): {
  principal: OfflineDataSnapshot | null;
  hasValidBackup: boolean;
  backupSyncedAt: string | null;
  integrityReport: IntegrityReport | null;
} {
  const store = resolveStorage(storage);
  if (!store) {
    return { principal: null, hasValidBackup: false, backupSyncedAt: null, integrityReport: null };
  }

  const principal = parseSnapshotJson(store.getItem(SNAPSHOT_KEY));
  const backup = parseSnapshotJson(store.getItem(SNAPSHOT_BACKUP_KEY));

  const integrityReport = principal
    ? buildIntegrityReport({
        sales: principal.sales || [],
        receipts: principal.receipts || [],
        products: principal.products || [],
        students: principal.students || [],
        stockMovements: principal.stockMovements || [],
        financialLedger: principal.financialLedger || [],
        invoices: principal.invoices || [],
      })
    : null;

  return {
    principal,
    hasValidBackup: Boolean(backup),
    backupSyncedAt: backup?.syncedAt || null,
    integrityReport,
  };
}

/**
 * Restaura explicitamente o snapshot principal a partir do backup seguro,
 * registrando o evento em auditoria (sem misturar arrays).
 */
export function restorePrincipalFromBackupExplicit(
  actor: { id: string; name: string; role: any },
  storage?: StorageLike
): OfflineDataSnapshot {
  const store = resolveStorage(storage);
  if (!store) {
    throw new Error('Armazenamento local indisponível neste ambiente.');
  }
  const backup = parseSnapshotJson(store.getItem(SNAPSHOT_BACKUP_KEY));
  if (!backup) {
    throw new Error('Nenhum backup válido encontrado em iceves_offline_snapshot_v1_backup.');
  }

  const nowIso = new Date().toISOString();
  const auditEntry: AuditLog = {
    id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: nowIso,
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'RECUPERACAO_BACKUP_SNAPSHOT',
    module: 'SISTEMA',
    details: `Snapshot principal restaurado explicitamente a partir do backup de ${backup.syncedAt || 'data anterior'}.`,
    status: 'SUCESSO',
  };

  const restored: OfflineDataSnapshot = {
    ...deepCloneSnapshot(backup),
    syncedAt: nowIso,
    auditLogs: [auditEntry, ...(backup.auditLogs || [])].slice(0, 500),
  };

  store.setItem(SNAPSHOT_KEY, JSON.stringify(restored));
  store.removeItem(SNAPSHOT_TX_JOURNAL_KEY);
  return restored;
}

/**
 * Detecta operações interrompidas (journal IN_PROGRESS) ou JSON corrompido ao recarregar a página.
 * Só restaura automaticamente o backup quando houve interrupção física da escrita (crash/JSON inválido).
 * Nunca substitui silenciosamente um snapshot principal íntegro em formato JSON por dados antigos do backup.
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

  const currentSnap = parseSnapshotJson(currentRaw);
  const backupSnap = parseSnapshotJson(backupRaw);

  if (interrupted || (currentRaw && !currentSnap)) {
    if (backupSnap) {
      try {
        const nowIso = new Date().toISOString();
        const recoveryLog: AuditLog = {
          id: `AUD-REC-${Date.now()}`,
          timestamp: nowIso,
          userId: 'system',
          userName: 'Sistema de Integridade',
          userRole: 'ADMIN',
          action: 'RECUPERACAO_CRASH_SNAPSHOT',
          module: 'SISTEMA',
          details: interrupted
            ? 'Transação local interrompida detectada no boot; snapshot restaurado a partir do backup pré-transação.'
            : 'Snapshot JSON corrompido detectado no boot; backup consistente restaurado.',
          status: 'SUCESSO',
        };
        const restored: OfflineDataSnapshot = {
          ...deepCloneSnapshot(backupSnap),
          auditLogs: [recoveryLog, ...(backupSnap.auditLogs || [])].slice(0, 500),
        };
        store.setItem(SNAPSHOT_KEY, JSON.stringify(restored));
        store.removeItem(SNAPSHOT_TX_JOURNAL_KEY);
        return {
          recovered: true,
          reason: recoveryLog.details,
          snapshot: restored,
        };
      } catch {
        // ignore
      }
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
 * Aplica atomicamente um bundle completo de venda ao snapshot principal,
 * validando especificamente a consistência entre a nova venda, recibo ATIVO,
 * estoque, consumo do aluno e lançamento financeiro, seguido de readback real.
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
  if (!bundle?.sale || bundle.sale.status !== 'COMPLETED') {
    throw new IntegrityError('Venda não está em estado COMPLETED para confirmação local.');
  }
  if (!bundle?.receipt || bundle.receipt.saleId !== bundle.sale.id || bundle.receipt.status !== 'ATIVO') {
    throw new IntegrityError('Venda não pode ser concluída sem recibo ativo correspondente.');
  }

  const next = deepCloneSnapshot(current);
  next.syncedAt = new Date().toISOString();

  // Garantir referência bidirecional exata entre venda e recibo
  const linkedSale: Sale = {
    ...bundle.sale,
    receiptId: bundle.receipt.id,
    receiptCode: bundle.receipt.receiptCode,
  };
  const linkedReceipt: SalesReceipt = {
    ...bundle.receipt,
    saleId: linkedSale.id,
  };

  next.sales = [linkedSale, ...(next.sales || []).filter(s => s.id !== linkedSale.id)];
  next.receipts = [
    linkedReceipt,
    ...(next.receipts || []).filter(r => r.id !== linkedReceipt.id && r.saleId !== linkedSale.id),
  ];
  next.students = (next.students || []).map(s => (s.id === bundle.student.id ? bundle.student : s));

  if (Array.isArray(bundle.updatedProducts) && bundle.updatedProducts.length > 0) {
    const byId = new Map(bundle.updatedProducts.map(p => [p.id, p]));
    next.products = (next.products || []).map(p => byId.get(p.id) || p);
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

  // Valida consistência exata entre a venda e o recibo ANTES de persistir
  const saleCheck = isSaleConsistent(linkedSale, next.receipts);
  if (!saleCheck.valid) {
    throw new IntegrityError(saleCheck.reason || 'Inconsistência detectada entre venda e recibo.');
  }

  const scopedEntityIds = [
    linkedSale.id,
    linkedReceipt.id,
    bundle.student.id,
    ...(bundle.updatedProducts || []).map(p => p.id),
    ...(bundle.stockMovements || []).map(m => m.id),
    ...(bundle.ledgerEntries || []).map(l => l.id),
  ];

  const { persisted } = saveOfflineSnapshotAtomic(next, {
    storage,
    operation: `SALE_COMMIT:${linkedSale.id}`,
    txId: linkedSale.idempotencyKey || linkedSale.id,
    validateBeforeCommit: true,
    validateEntityIds: scopedEntityIds,
    previousSnapshotOverride: current,
    readbackVerify: (readSnap) => {
      const pSale = (readSnap.sales || []).find(s => s.id === linkedSale.id);
      const pReceipt = (readSnap.receipts || []).find(r => r.saleId === linkedSale.id && r.status === 'ATIVO');
      if (!pSale || pSale.status !== 'COMPLETED') {
        throw new IntegrityError(`Verificação pós-gravação falhou: venda ${linkedSale.id} não encontrada como COMPLETED.`);
      }
      if (!pReceipt || pReceipt.id !== linkedReceipt.id) {
        throw new IntegrityError(`Verificação pós-gravação falhou: recibo ATIVO de ${linkedSale.id} não persistido.`);
      }
      const postCheck = isSaleConsistent(pSale, readSnap.receipts || []);
      if (!postCheck.valid) {
        throw new IntegrityError(`Verificação pós-gravação falhou: ${postCheck.reason}`);
      }
    },
  });

  return persisted;
}

/**
 * Aplica atomicamente o resultado completo de um estorno ao snapshot principal,
 * com validação escopada à transação e readback real obrigatório.
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
  const next = deepCloneSnapshot(current);
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

  const scopedEntityIds = [
    bundle.sale.id,
    ...(bundle.receipt ? [bundle.receipt.id] : []),
    bundle.student.id,
    ...(bundle.updatedProducts || []).map(p => p.id),
    ...(bundle.stockMovements || []).map(m => m.id),
    ...(bundle.ledgerEntries || []).map(l => l.id),
  ];

  const { persisted } = saveOfflineSnapshotAtomic(next, {
    storage,
    operation: `SALE_REVERSAL:${bundle.sale.id}`,
    txId: bundle.sale.reversalIdempotencyKey || `REV-${bundle.sale.id}`,
    validateBeforeCommit: true,
    validateEntityIds: scopedEntityIds,
    previousSnapshotOverride: current,
    readbackVerify: (readSnap) => {
      const pSale = (readSnap.sales || []).find(s => s.id === bundle.sale.id);
      if (!pSale || pSale.status !== bundle.sale.status) {
        throw new IntegrityError(
          `Verificação pós-estorno falhou: venda ${bundle.sale.id} não foi persistida com status ${bundle.sale.status}.`
        );
      }
      if (bundle.sale.status === 'REVERSED') {
        const activeReceipt = (readSnap.receipts || []).find(
          r => r.saleId === bundle.sale.id && r.status === 'ATIVO'
        );
        if (activeReceipt) {
          throw new IntegrityError(
            `Verificação pós-estorno falhou: recibo ${activeReceipt.receiptCode} permaneceu ATIVO.`
          );
        }
      }
    },
  });

  return persisted;
}
