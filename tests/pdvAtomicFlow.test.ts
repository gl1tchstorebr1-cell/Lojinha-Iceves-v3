import assert from 'node:assert/strict';
import {
  clearDiagnosticLogs,
  createSaleAtomic,
  getDiagnosticLogs,
  recoverOrphanSaleAtomic,
  reverseSaleAtomic,
} from '../src/services/posTransactionEngine.ts';
import {
  SNAPSHOT_BACKUP_KEY,
  SNAPSHOT_KEY,
  SNAPSHOT_TX_JOURNAL_KEY,
  inspectPrincipalSnapshot,
  loadOfflineSnapshot,
  restorePrincipalFromBackupExplicit,
  saveOfflineSnapshotAtomic,
  type OfflineDataSnapshot,
  type StorageLike,
} from '../src/utils/offlineSnapshotCache.ts';
import {
  buildIntegrityReport,
  getInconsistentSales,
  getValidCompletedSales,
  isSaleConsistent,
  validateDataIntegrity,
} from '../src/utils/dataIntegrity.ts';
import { DatabaseService } from '../src/server/db.ts';
import { initialProducts, initialSettings, initialStudents } from '../src/server/seedData.ts';
import type { FinancialTransaction, Product, Sale, StockMovement, Student } from '../src/types/index.ts';

process.env.NODE_ENV = 'test';

class MemoryStorage implements StorageLike {
  public map = new Map<string, string>();
  public failNextSetKey: string | null = null;
  public failError: Error = new Error('QuotaExceededError: Armazenamento local cheio');

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.failNextSetKey && key === this.failNextSetKey) {
      this.failNextSetKey = null;
      throw this.failError;
    }
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

const ADMIN_ACTOR = {
  id: 'admin-1',
  name: 'Administrador ICEVES',
  role: 'ADMIN' as const,
};

function buildProductionBaselineSnapshot(options?: {
  withLegacyOrphan?: boolean;
}): { snapshot: OfflineDataSnapshot; storage: MemoryStorage; biblia: Product; ana: Student } {
  const storage = new MemoryStorage();
  const students: Student[] = JSON.parse(JSON.stringify(initialStudents));
  const products: Product[] = JSON.parse(JSON.stringify(initialProducts));

  const ana = students.find(s => s.id === 'student-1')!;
  assert.ok(ana, 'Aluna student-1 (Ana Vitória Lisboa) deve existir na base');
  ana.name = 'Ana Vitória Lisboa';
  ana.registrationNumber = 'EC10-001';
  ana.currentConsumptionBalance = 25;
  ana.totalOpenDebt = 25;

  const biblia = products.find(p => p.id === 'prod-liv-001')!;
  assert.ok(biblia, 'Produto prod-liv-001 (Bíblia pequena) deve existir na base');
  biblia.name = 'Bíblia pequena';
  biblia.internalCode = 'LIV-001';
  biblia.price = 25;
  biblia.priceStatus = 'DEFINED';
  biblia.currentStock = 5;

  const baseSales: Sale[] = [];
  const baseReceipts: any[] = [];
  const baseMovements: StockMovement[] = [];
  const baseLedger: FinancialTransaction[] = [];

  if (options?.withLegacyOrphan) {
    // Reproduz o cenário exato reportado: 134 vendas (incluindo VEN-610628), 0 recibos,
    // 11 stockMovements, 1 financialLedger, estoque da Bíblia = 5, Ana consumo/dívida = 25
    const orphanVen610628: Sale = {
      id: 'VEN-610628',
      status: 'COMPLETED',
      total: 25,
      subtotal: 25,
      studentId: 'student-1',
      studentName: 'Ana Vitória Lisboa',
      registrationNumber: 'EC10-001',
      receiptId: 'REC-ICE-000002',
      receiptCode: 'ICE-000002',
      paymentMethod: 'CONTA_ALUNO',
      operatorUserId: 'admin-1',
      operatorUserName: 'Administrador ICEVES',
      billingPeriod: '2026-11',
      origin: 'LOJINHA',
      createdAt: '2026-11-26T14:00:00.000Z',
      items: [
        {
          productId: 'prod-liv-001',
          internalCode: 'LIV-001',
          name: 'Bíblia pequena',
          category: 'Livros e Literatura Cristã',
          quantity: 1,
          unitPrice: 25,
          subtotal: 25,
        },
      ],
    };
    baseSales.push(orphanVen610628);

    // Preenche demais 133 vendas históricas (REVERSED para manter foco na análise ou COMPLETED legadas)
    for (let i = 1; i <= 133; i++) {
      baseSales.push({
        id: `VEN-LEG-${String(i).padStart(4, '0')}`,
        status: 'REVERSED',
        total: 10,
        subtotal: 10,
        studentId: 'student-2',
        studentName: 'Aluno Histórico',
        registrationNumber: 'EC10-002',
        paymentMethod: 'CONTA_ALUNO',
        operatorUserId: 'admin-1',
        operatorUserName: 'Administrador ICEVES',
        billingPeriod: '2026-10',
        origin: 'LOJINHA',
        createdAt: '2026-10-15T10:00:00.000Z',
        reversedReason: 'Histórico migrado',
        items: [
          {
            productId: 'prod-liv-001',
            internalCode: 'LIV-001',
            name: 'Bíblia pequena',
            category: 'Livros e Literatura Cristã',
            quantity: 1,
            unitPrice: 10,
            subtotal: 10,
          },
        ],
      });
    }

    for (let i = 1; i <= 11; i++) {
      baseMovements.push({
        id: `MOV-HIST-${i}`,
        productId: 'prod-liv-001',
        productName: 'Bíblia pequena',
        type: 'ENTRADA',
        quantity: 1,
        previousStock: 4,
        newStock: 5,
        reason: 'Histórico',
        performedByUserId: 'admin-1',
        performedByUserName: 'Administrador ICEVES',
        timestamp: '2026-11-01T10:00:00.000Z',
      });
    }

    baseLedger.push({
      id: 'LED-HIST-1',
      timestamp: '2026-11-01T10:00:00.000Z',
      studentId: 'student-1',
      type: 'DEBITO',
      category: 'AJUSTE_DEBITO',
      amount: 25,
      description: 'Saldo anterior consolidado',
      performedByUserName: 'Administrador ICEVES',
    });
  } else {
    for (let i = 1; i <= 11; i++) {
      baseMovements.push({
        id: `MOV-BASE-${i}`,
        productId: 'prod-liv-001',
        productName: 'Bíblia pequena',
        type: 'ENTRADA',
        quantity: 1,
        previousStock: 4,
        newStock: 5,
        reason: 'Reposição base',
        performedByUserId: 'admin-1',
        performedByUserName: 'Administrador ICEVES',
        timestamp: '2026-11-01T10:00:00.000Z',
      });
    }
    baseLedger.push({
      id: 'LED-BASE-1',
      timestamp: '2026-11-01T10:00:00.000Z',
      studentId: 'student-1',
      type: 'DEBITO',
      category: 'AJUSTE_DEBITO',
      amount: 25,
      description: 'Saldo inicial antes do teste',
      performedByUserName: 'Administrador ICEVES',
    });
  }

  const snapshot: OfflineDataSnapshot = {
    version: 1,
    syncedAt: '2026-11-26T15:00:00.000Z',
    settings: JSON.parse(JSON.stringify(initialSettings)),
    products,
    students,
    guardians: [],
    sales: baseSales,
    receipts: baseReceipts,
    stockMovements: baseMovements,
    financialLedger: baseLedger,
    auditLogs: [],
    invoices: [],
    pixPayments: [],
    whatsappNotifications: [],
    passeios: [],
  };

  storage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  return { snapshot, storage, biblia, ana };
}

async function runTests() {
  let passed = 0;
  const results: string[] = [];

  async function test(name: string, fn: () => void | Promise<void>) {
    clearDiagnosticLogs();
    await fn();
    passed++;
    results.push(`PASS: ${name}`);
    console.log(`✓ ${name}`);
  }

  // =========================================================================
  // TESTE 1 — Venda normal completa (Ana Vitória Lisboa + Bíblia pequena R$ 25,00)
  // =========================================================================
  await test('Teste 1 — Venda normal completa persiste venda, recibo ATIVO, estoque, consumo, dívida, ledger e auditoria em 1 operação atômica', () => {
    const { snapshot, storage } = buildProductionBaselineSnapshot();

    const beforeSales = snapshot.sales.length;
    const beforeReceipts = snapshot.receipts!.length;
    const beforeStock = snapshot.products.find(p => p.id === 'prod-liv-001')!.currentStock;
    const beforeConsumption = snapshot.students.find(s => s.id === 'student-1')!.currentConsumptionBalance;
    const beforeDebt = snapshot.students.find(s => s.id === 'student-1')!.totalOpenDebt;
    const beforeMovs = snapshot.stockMovements!.length;
    const beforeLedger = snapshot.financialLedger!.length;

    assert.equal(beforeStock, 5);
    assert.equal(beforeConsumption, 25);
    assert.equal(beforeDebt, 25);
    assert.equal(beforeMovs, 11);
    assert.equal(beforeLedger, 1);

    const res = createSaleAtomic(
      snapshot,
      {
        studentId: 'student-1',
        items: [{ productId: 'prod-liv-001', quantity: 1 }],
        paymentMethod: 'CONTA_ALUNO',
        idempotencyKey: 'TEST1-KEY-001',
        operatorUser: ADMIN_ACTOR,
      },
      { storage }
    );

    assert.equal(res.idempotentReplay, false);
    assert.equal(res.sale.status, 'COMPLETED');
    assert.equal(res.sale.total, 25);
    assert.equal(res.receipt.saleId, res.sale.id);
    assert.equal(res.receipt.status, 'ATIVO');
    assert.equal(res.sale.receiptId, res.receipt.id);
    assert.equal(res.sale.receiptCode, res.receipt.receiptCode);

    // Ler diretamente do localStorage (readback real)
    const persisted = JSON.parse(storage.getItem(SNAPSHOT_KEY)!) as OfflineDataSnapshot;
    assert.equal(persisted.sales.length, beforeSales + 1);
    assert.equal(persisted.receipts!.length, beforeReceipts + 1);
    assert.equal(persisted.products.find(p => p.id === 'prod-liv-001')!.currentStock, 4);
    assert.equal(persisted.students.find(s => s.id === 'student-1')!.currentConsumptionBalance, 50);
    assert.equal(persisted.students.find(s => s.id === 'student-1')!.totalOpenDebt, 50);
    assert.equal(persisted.stockMovements!.length, beforeMovs + 1);
    assert.equal(persisted.financialLedger!.length, beforeLedger + 1);
    assert.equal(persisted.auditLogs![0].status, 'SUCESSO');
    assert.equal(persisted.auditLogs![0].referenceId, res.sale.id);

    // Backup criado no mesmo schema antes da transação
    const backup = JSON.parse(storage.getItem(SNAPSHOT_BACKUP_KEY)!) as OfflineDataSnapshot;
    assert.equal(backup.sales.length, beforeSales);
    assert.equal(backup.products.find(p => p.id === 'prod-liv-001')!.currentStock, 5);
    assert.equal(storage.getItem(SNAPSHOT_TX_JOURNAL_KEY), null);

    // Validação global = 0 erros
    const report = buildIntegrityReport({
      sales: persisted.sales,
      receipts: persisted.receipts!,
      products: persisted.products,
      students: persisted.students,
      stockMovements: persisted.stockMovements,
      financialLedger: persisted.financialLedger,
    });
    assert.equal(report.healthy, true);
    assert.equal(report.errorCount, 0);

    // Verificar logs estruturados de diagnóstico emitidos na ordem do fluxo
    const events = getDiagnosticLogs().map(l => l.event);
    for (const expected of [
      'SALE_TRANSACTION_STARTED',
      'SALE_VALIDATION_PASSED',
      'SALE_STOCK_PREPARED',
      'SALE_STUDENT_BALANCE_PREPARED',
      'SALE_LEDGER_PREPARED',
      'SALE_RECEIPT_CREATED',
      'SALE_SNAPSHOT_COMMITTED',
      'SALE_PERSISTENCE_VERIFIED',
      'SALE_TRANSACTION_COMPLETED',
    ] as const) {
      assert.ok(events.includes(expected), `Evento de diagnóstico ${expected} deve ter sido emitido`);
    }
  });

  // =========================================================================
  // TESTE 2 — Duplo clique / Idempotência
  // =========================================================================
  await test('Teste 2 — Duplo clique com mesma idempotencyKey não duplica venda, recibo, estoque, consumo ou livro financeiro', () => {
    const { snapshot, storage } = buildProductionBaselineSnapshot();

    const first = createSaleAtomic(
      snapshot,
      {
        studentId: 'student-1',
        items: [{ productId: 'prod-liv-001', quantity: 1 }],
        paymentMethod: 'CONTA_ALUNO',
        idempotencyKey: 'DUP-CLICK-KEY-002',
        operatorUser: ADMIN_ACTOR,
      },
      { storage }
    );

    const second = createSaleAtomic(
      first.snapshot,
      {
        studentId: 'student-1',
        items: [{ productId: 'prod-liv-001', quantity: 1 }],
        paymentMethod: 'CONTA_ALUNO',
        idempotencyKey: 'DUP-CLICK-KEY-002',
        operatorUser: ADMIN_ACTOR,
      },
      { storage }
    );

    assert.equal(second.idempotentReplay, true);
    assert.equal(second.sale.id, first.sale.id);
    assert.equal(second.receipt.id, first.receipt.id);

    const persisted = JSON.parse(storage.getItem(SNAPSHOT_KEY)!) as OfflineDataSnapshot;
    assert.equal(persisted.sales.length, 1);
    assert.equal(persisted.receipts!.length, 1);
    assert.equal(persisted.products.find(p => p.id === 'prod-liv-001')!.currentStock, 4);
    assert.equal(persisted.students.find(s => s.id === 'student-1')!.currentConsumptionBalance, 50);
    assert.equal(persisted.students.find(s => s.id === 'student-1')!.totalOpenDebt, 50);
    assert.equal(persisted.stockMovements!.length, 12);
    assert.equal(persisted.financialLedger!.length, 2);
  });

  // =========================================================================
  // TESTE 3 — Falha simulada antes do commit (BEFORE_COMMIT e RECEIPT_MISSING)
  // =========================================================================
  await test('Teste 3 — Falha simulada antes do commit ou sem recibo gera rollback integral sem gravar venda/recibo/auditoria SUCESSO', () => {
    for (const faultStage of ['BEFORE_COMMIT', 'RECEIPT_MISSING'] as const) {
      clearDiagnosticLogs();
      const { snapshot, storage } = buildProductionBaselineSnapshot();

      assert.throws(
        () =>
          createSaleAtomic(
            snapshot,
            {
              studentId: 'student-1',
              items: [{ productId: 'prod-liv-001', quantity: 1 }],
              paymentMethod: 'CONTA_ALUNO',
              idempotencyKey: `FAULT-${faultStage}`,
              operatorUser: ADMIN_ACTOR,
            },
            { storage, __faultStage: faultStage }
          ),
        /Falha simulada|recibo ativo/i
      );

      const persisted = JSON.parse(storage.getItem(SNAPSHOT_KEY)!) as OfflineDataSnapshot;
      assert.equal(persisted.sales.length, 0);
      assert.equal(persisted.receipts!.length, 0);
      assert.equal(persisted.products.find(p => p.id === 'prod-liv-001')!.currentStock, 5);
      assert.equal(persisted.students.find(s => s.id === 'student-1')!.currentConsumptionBalance, 25);
      assert.equal(persisted.students.find(s => s.id === 'student-1')!.totalOpenDebt, 25);
      assert.equal(persisted.stockMovements!.length, 11);
      assert.equal(persisted.financialLedger!.length, 1);
      assert.equal(
        (persisted.auditLogs || []).filter(a => a.status === 'SUCESSO').length,
        0,
        'Não pode existir auditoria SUCESSO após falha'
      );

      const events = getDiagnosticLogs().map(l => l.event);
      assert.ok(events.includes('SALE_TRANSACTION_FAILED'));
      assert.ok(events.includes('SALE_ROLLBACK_STARTED'));
      assert.ok(events.includes('SALE_ROLLBACK_COMPLETED'));
    }
  });

  // =========================================================================
  // TESTE 4 — Falha na escrita do localStorage (QuotaExceededError)
  // =========================================================================
  await test('Teste 4 — Falha em localStorage.setItem (QuotaExceededError) restaura snapshot anterior intacto sem estado parcial', () => {
    const { snapshot, storage } = buildProductionBaselineSnapshot();
    const rawBefore = storage.getItem(SNAPSHOT_KEY)!;

    // Simula erro real na escrita da chave principal iceves_offline_snapshot_v1
    storage.failNextSetKey = SNAPSHOT_KEY;

    assert.throws(
      () =>
        createSaleAtomic(
          snapshot,
          {
            studentId: 'student-1',
            items: [{ productId: 'prod-liv-001', quantity: 1 }],
            paymentMethod: 'CONTA_ALUNO',
            idempotencyKey: 'QUOTA-FAIL-004',
            operatorUser: ADMIN_ACTOR,
          },
          { storage }
        ),
      /QuotaExceededError|Falha ao persistir/i
    );

    const rawAfter = storage.getItem(SNAPSHOT_KEY)!;
    assert.equal(rawAfter, rawBefore, 'Snapshot principal deve permanecer idêntico ao estado pré-transação');
    assert.equal(storage.getItem(SNAPSHOT_TX_JOURNAL_KEY), null, 'Journal de transação deve ser limpo após rollback');

    const persisted = JSON.parse(rawAfter) as OfflineDataSnapshot;
    assert.equal(persisted.sales.length, 0);
    assert.equal(persisted.receipts!.length, 0);
    assert.equal(persisted.products.find(p => p.id === 'prod-liv-001')!.currentStock, 5);
    assert.equal(persisted.students.find(s => s.id === 'student-1')!.currentConsumptionBalance, 25);
  });

  // =========================================================================
  // TESTE 5 — Estorno completo de venda válida
  // =========================================================================
  await test('Teste 5 — Estorno completo altera venda para REVERSED, recibo para ESTORNADO, restaura estoque/consumo/dívida e registra reversão', () => {
    const { snapshot, storage } = buildProductionBaselineSnapshot();

    const saleRes = createSaleAtomic(
      snapshot,
      {
        studentId: 'student-1',
        items: [{ productId: 'prod-liv-001', quantity: 1 }],
        paymentMethod: 'CONTA_ALUNO',
        idempotencyKey: 'REV-TEST-005',
        operatorUser: ADMIN_ACTOR,
      },
      { storage }
    );

    // Conferir estado intermediário (após venda, antes do estorno)
    assert.equal(saleRes.snapshot.products.find(p => p.id === 'prod-liv-001')!.currentStock, 4);
    assert.equal(saleRes.snapshot.students.find(s => s.id === 'student-1')!.currentConsumptionBalance, 50);
    assert.equal(saleRes.snapshot.students.find(s => s.id === 'student-1')!.totalOpenDebt, 50);

    const revRes = reverseSaleAtomic(
      saleRes.snapshot,
      saleRes.sale.id,
      {
        reason: 'Lançamento realizado por engano no caixa',
        idempotencyKey: 'REV-IDEMP-005',
        operatorUser: ADMIN_ACTOR,
      },
      { storage }
    );

    assert.equal(revRes.alreadyReversed, false);
    assert.equal(revRes.sale.status, 'REVERSED');
    assert.equal(revRes.receipt?.status, 'ESTORNADO');
    assert.equal(revRes.receipt?.reversals.length, 1);
    assert.equal(revRes.receipt?.reversals[0].reason, 'Lançamento realizado por engano no caixa');

    const persisted = JSON.parse(storage.getItem(SNAPSHOT_KEY)!) as OfflineDataSnapshot;
    assert.equal(persisted.products.find(p => p.id === 'prod-liv-001')!.currentStock, 5);
    assert.equal(persisted.students.find(s => s.id === 'student-1')!.currentConsumptionBalance, 25);
    assert.equal(persisted.students.find(s => s.id === 'student-1')!.totalOpenDebt, 25);
    assert.equal(persisted.stockMovements!.filter(m => m.type === 'ESTORNO_VENDA').length, 1);
    assert.equal(persisted.financialLedger!.filter(l => l.category === 'ESTORNO_VENDA').length, 1);
    assert.equal(persisted.auditLogs![0].action, 'ESTORNO_VENDA_PDV');
    assert.equal(persisted.auditLogs![0].status, 'SUCESSO');

    const validDashboardSales = getValidCompletedSales(persisted.sales, persisted.receipts!);
    assert.equal(validDashboardSales.length, 0);
  });

  // =========================================================================
  // TESTE 6 — Tentativa de segundo estorno (Idempotência)
  // =========================================================================
  await test('Teste 6 — Segundo estorno da mesma venda é idempotente e não duplica estoque, financeiro ou comprovante de estorno', () => {
    const { snapshot, storage } = buildProductionBaselineSnapshot();

    const saleRes = createSaleAtomic(
      snapshot,
      {
        studentId: 'student-1',
        items: [{ productId: 'prod-liv-001', quantity: 1 }],
        paymentMethod: 'CONTA_ALUNO',
        idempotencyKey: 'REV2-TEST-006',
        operatorUser: ADMIN_ACTOR,
      },
      { storage }
    );

    const firstRev = reverseSaleAtomic(
      saleRes.snapshot,
      saleRes.sale.id,
      { reason: 'Primeiro estorno', operatorUser: ADMIN_ACTOR },
      { storage }
    );

    const secondRev = reverseSaleAtomic(
      firstRev.snapshot,
      saleRes.sale.id,
      { reason: 'Tentativa duplicada', operatorUser: ADMIN_ACTOR },
      { storage }
    );

    assert.equal(secondRev.alreadyReversed, true);
    assert.equal(secondRev.stockMovements.length, 0);
    assert.equal(secondRev.ledgerEntries.length, 0);

    const persisted = JSON.parse(storage.getItem(SNAPSHOT_KEY)!) as OfflineDataSnapshot;
    assert.equal(persisted.products.find(p => p.id === 'prod-liv-001')!.currentStock, 5);
    assert.equal(persisted.students.find(s => s.id === 'student-1')!.currentConsumptionBalance, 25);
    assert.equal(persisted.students.find(s => s.id === 'student-1')!.totalOpenDebt, 25);
    assert.equal(persisted.receipts![0].reversals.length, 1);
  });

  // =========================================================================
  // TESTE 7 — Recarregamento da página e consistência entre módulos
  // =========================================================================
  await test('Teste 7 — Após reload simulado, Dashboard, Histórico, Recibos, Produtos, Alunos e Relatórios refletem o mesmo estado persistido e permitem estorno', () => {
    const { snapshot, storage } = buildProductionBaselineSnapshot();

    const saleRes = createSaleAtomic(
      snapshot,
      {
        studentId: 'student-1',
        items: [{ productId: 'prod-liv-001', quantity: 1 }],
        paymentMethod: 'CONTA_ALUNO',
        idempotencyKey: 'RELOAD-TEST-007',
        operatorUser: ADMIN_ACTOR,
      },
      { storage }
    );

    // Simula reload total da página: nenhuma variável em memória é reutilizada, tudo é relido de iceves_offline_snapshot_v1
    const reloaded = loadOfflineSnapshot(storage)!;
    assert.ok(reloaded, 'Snapshot deve ser carregado do localStorage após reload');

    // Dashboard & Relatórios (vendas válidas)
    const dashboardSales = getValidCompletedSales(reloaded.sales, reloaded.receipts!);
    assert.equal(dashboardSales.length, 1);
    assert.equal(dashboardSales[0].id, saleRes.sale.id);
    assert.equal(dashboardSales[0].total, 25);

    // Histórico
    const histSale = reloaded.sales.find(s => s.id === saleRes.sale.id)!;
    assert.equal(isSaleConsistent(histSale, reloaded.receipts!).valid, true);

    // Recibos
    const rec = reloaded.receipts!.find(r => r.saleId === saleRes.sale.id)!;
    assert.equal(rec.status, 'ATIVO');
    assert.equal(rec.studentSnapshot.name, 'Ana Vitória Lisboa');

    // Produtos
    assert.equal(reloaded.products.find(p => p.id === 'prod-liv-001')!.currentStock, 4);

    // Alunos
    assert.equal(reloaded.students.find(s => s.id === 'student-1')!.currentConsumptionBalance, 50);
    assert.equal(reloaded.students.find(s => s.id === 'student-1')!.totalOpenDebt, 50);

    // Backup explícito nunca se mistura silenciosamente
    const inspection = inspectPrincipalSnapshot(storage);
    assert.equal(inspection.hasValidBackup, true);
    assert.equal(inspection.principal!.sales.length, 1);

    // Estorno após reload funciona perfeitamente
    const revAfterReload = reverseSaleAtomic(
      reloaded,
      saleRes.sale.id,
      { reason: 'Estorno pós-reload', operatorUser: ADMIN_ACTOR },
      { storage }
    );
    assert.equal(revAfterReload.sale.status, 'REVERSED');
    assert.equal(revAfterReload.receipt?.status, 'ESTORNADO');
    assert.equal(revAfterReload.snapshot.products.find(p => p.id === 'prod-liv-001')!.currentStock, 5);
    assert.equal(revAfterReload.snapshot.students.find(s => s.id === 'student-1')!.currentConsumptionBalance, 25);

    // Teste adicional de restauração explícita do backup (sem mistura silenciosa)
    const restored = restorePrincipalFromBackupExplicit(ADMIN_ACTOR, storage);
    assert.equal(restored.sales[0].status, 'COMPLETED');
    assert.equal(restored.auditLogs![0].action, 'RECUPERACAO_BACKUP_SNAPSHOT');
  });

  // =========================================================================
  // TESTE 8 — Recuperação de venda órfã legada (VEN-610628 no cenário exato)
  // =========================================================================
  await test('Teste 8 — Detecção e recuperação de venda órfã legada VEN-610628 (Opção B CANCEL_INVALID e Opção A RECOVER_RECEIPT) + novas vendas não são bloqueadas', () => {
    // 8A: Cenário exato com VEN-610628 (sales: 134, receipts: 0, stock: 5, consumo: 25, dívida: 25)
    const { snapshot: legacySnap, storage: storageB } = buildProductionBaselineSnapshot({
      withLegacyOrphan: true,
    });

    assert.equal(legacySnap.sales.length, 134);
    assert.equal(legacySnap.receipts!.length, 0);

    // 1. Detecção global identifica VEN-610628 como inconsistente e a exclui do Dashboard
    const inconsistentBefore = getInconsistentSales(legacySnap.sales, legacySnap.receipts!);
    assert.equal(inconsistentBefore.length, 1);
    assert.equal(inconsistentBefore[0].sale.id, 'VEN-610628');
    assert.equal(getValidCompletedSales(legacySnap.sales, legacySnap.receipts!).length, 0);

    // 2. Estorno direto de VEN-610628 é bloqueado com erro claro (nunca corrompe dados)
    assert.throws(
      () =>
        reverseSaleAtomic(
          legacySnap,
          'VEN-610628',
          { reason: 'Tentativa de estornar venda órfã', operatorUser: ADMIN_ACTOR },
          { storage: storageB }
        ),
      /inconsistente|recibo ATIVO/i
    );

    // 3. Mesmo antes de corrigir VEN-610628, uma NOVA venda válida NÃO é bloqueada pelo legado!
    const newSaleAlongsideOrphan = createSaleAtomic(
      legacySnap,
      {
        studentId: 'student-1',
        items: [{ productId: 'prod-liv-001', quantity: 1 }],
        paymentMethod: 'CONTA_ALUNO',
        idempotencyKey: 'NEW-SALE-WITH-ORPHAN-PRESENT',
        operatorUser: ADMIN_ACTOR,
      },
      { storage: storageB }
    );
    assert.equal(newSaleAlongsideOrphan.sale.status, 'COMPLETED');
    assert.equal(newSaleAlongsideOrphan.receipt.status, 'ATIVO');
    assert.equal(newSaleAlongsideOrphan.snapshot.sales.length, 135);
    assert.equal(newSaleAlongsideOrphan.snapshot.receipts!.length, 1);

    // 4. Opção B (CANCEL_INVALID): marca VEN-610628 como CANCELLED e zera inconsistências globais
    const cancelRes = recoverOrphanSaleAtomic(
      newSaleAlongsideOrphan.snapshot,
      'VEN-610628',
      'CANCEL_INVALID',
      ADMIN_ACTOR,
      storageB
    );
    assert.equal(cancelRes.sale.status, 'CANCELLED');
    assert.equal(cancelRes.sale.receiptId, undefined);
    assert.equal(cancelRes.auditLog.action, 'CORRECAO_VENDA_INCONSISTENTE');
    assert.equal(getInconsistentSales(cancelRes.snapshot.sales, cancelRes.snapshot.receipts!).length, 0);

    const globalErrorsAfterCancel = validateDataIntegrity({
      sales: cancelRes.snapshot.sales,
      receipts: cancelRes.snapshot.receipts!,
      products: cancelRes.snapshot.products,
      students: cancelRes.snapshot.students,
      stockMovements: cancelRes.snapshot.stockMovements,
      financialLedger: cancelRes.snapshot.financialLedger,
    }).filter(i => i.severity === 'ERROR');
    assert.equal(globalErrorsAfterCancel.length, 0, 'Zero erros globais após cancelar VEN-610628');

    // 5. Opção A (RECOVER_RECEIPT): em outro snapshot com VEN-610628, emite recibo consistente REC-ICE-000002
    const { snapshot: legacySnapA, storage: storageA } = buildProductionBaselineSnapshot({
      withLegacyOrphan: true,
    });
    const recoverRes = recoverOrphanSaleAtomic(
      legacySnapA,
      'VEN-610628',
      'RECOVER_RECEIPT',
      ADMIN_ACTOR,
      storageA
    );
    assert.equal(recoverRes.sale.status, 'COMPLETED');
    assert.equal(recoverRes.receipt?.id, 'REC-ICE-000002');
    assert.equal(recoverRes.receipt?.saleId, 'VEN-610628');
    assert.equal(recoverRes.receipt?.status, 'ATIVO');
    assert.equal(isSaleConsistent(recoverRes.sale, recoverRes.snapshot.receipts!).valid, true);
    assert.equal(getInconsistentSales(recoverRes.snapshot.sales, recoverRes.snapshot.receipts!).length, 0);

    // Após Opção A, a venda recuperada pode inclusive ser estornada normalmente!
    const revRecovered = reverseSaleAtomic(
      recoverRes.snapshot,
      'VEN-610628',
      { reason: 'Estorno após recuperação de recibo', operatorUser: ADMIN_ACTOR },
      { storage: storageA }
    );
    assert.equal(revRecovered.sale.status, 'REVERSED');
    assert.equal(revRecovered.receipt?.status, 'ESTORNADO');
  });

  // =========================================================================
  // TESTE BÔNUS (BACKEND): DatabaseService.reconcileOrphanSale & guard em reverseSale
  // =========================================================================
  await test('Teste 9 (Backend) — DatabaseService bloqueia estorno de venda órfã e reconcilia via CANCEL_INVALID com auditoria', () => {
    const db = new DatabaseService({ disableDisk: true, disableSupabase: true });
    // Injeta venda órfã sem recibo diretamente no estado para simular hidratação legada do Supabase
    const saleOrphan: Sale = {
      id: 'VEN-610628',
      status: 'COMPLETED',
      total: 25,
      subtotal: 25,
      studentId: 'student-1',
      studentName: 'Ana Vitória Lisboa',
      registrationNumber: 'EC10-001',
      receiptId: 'REC-ICE-000002',
      receiptCode: 'ICE-000002',
      paymentMethod: 'CONTA_ALUNO',
      operatorUserId: 'admin-1',
      operatorUserName: 'Administrador ICEVES',
      billingPeriod: '2026-11',
      origin: 'LOJINHA',
      createdAt: '2026-11-26T14:00:00.000Z',
      items: [
        {
          productId: 'prod-liv-001',
          internalCode: 'LIV-001',
          name: 'Bíblia pequena',
          category: 'Livros e Literatura Cristã',
          quantity: 1,
          unitPrice: 25,
          subtotal: 25,
        },
      ],
    };
    db.getSales().unshift(saleOrphan);

    // reverseSale recusa estornar venda inconsistente
    assert.throws(
      () => db.reverseSale('VEN-610628', 'Teste estorno órfã', ADMIN_ACTOR),
      /inconsistente|recibo ATIVO/i
    );

    // reconcileOrphanSale corrige de forma limpa e auditada
    const rec = db.reconcileOrphanSale('VEN-610628', 'CANCEL_INVALID', ADMIN_ACTOR);
    assert.equal(rec.sale.status, 'CANCELLED');
    assert.equal(rec.auditLog.action, 'CORRECAO_VENDA_INCONSISTENTE');
    assert.equal(db.validateIntegrity().healthy, true);
  });

  console.log(`\n========================================`);
  console.log(`TODOS OS ${passed} TESTES ATÔMICOS PASSARAM!`);
  console.log(`========================================`);
}

runTests().catch(err => {
  console.error('FALHA NA SUÍTE DE TESTES:', err);
  process.exit(1);
});
