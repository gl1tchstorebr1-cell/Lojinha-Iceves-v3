import assert from 'node:assert/strict';
import { DatabaseService } from '../src/server/db.ts';
import { initialProducts, initialStudents } from '../src/server/seedData.ts';
import { buildIntegrityReport, validateDataIntegrity } from '../src/utils/dataIntegrity.ts';
import {
  SNAPSHOT_BACKUP_KEY,
  SNAPSHOT_KEY,
  SNAPSHOT_TX_JOURNAL_KEY,
  commitReversalBundleToOfflineSnapshot,
  commitSaleBundleToOfflineSnapshot,
  recoverOfflineSnapshotOnBoot,
  saveOfflineSnapshotAtomic,
  type OfflineDataSnapshot,
  type StorageLike,
} from '../src/utils/offlineSnapshotCache.ts';

const ADMIN_USER = {
  id: 'user-admin',
  name: 'Coordenação ICEVES',
  role: 'ADMIN' as const,
};

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  public failOnKey: string | null = null;
  public failErrorMessage = 'QuotaExceededError: armazenamento local cheio';

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    if (this.failOnKey && key === this.failOnKey) {
      throw new Error(this.failErrorMessage);
    }
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function createIsolatedDb(): DatabaseService {
  return new DatabaseService({
    disableDisk: true,
    disableSupabase: true,
  });
}

function buildOfflineSnapshotFromDb(db: DatabaseService): OfflineDataSnapshot {
  return {
    version: 1,
    syncedAt: new Date().toISOString(),
    settings: db.getSettings(),
    products: JSON.parse(JSON.stringify(db.getProducts())),
    students: JSON.parse(JSON.stringify(db.getStudents())),
    guardians: JSON.parse(JSON.stringify(db.getGuardians())),
    sales: JSON.parse(JSON.stringify(db.getSales())),
    receipts: JSON.parse(JSON.stringify(db.getReceipts())),
    stockMovements: JSON.parse(JSON.stringify(db.getStockMovements())),
    financialLedger: JSON.parse(JSON.stringify(db.getFinancialLedger())),
    auditLogs: JSON.parse(JSON.stringify(db.getAuditLogs())),
    invoices: JSON.parse(JSON.stringify(db.getInvoices())),
    pixPayments: JSON.parse(JSON.stringify(db.getPixPayments())),
    whatsappNotifications: JSON.parse(JSON.stringify(db.getWhatsAppNotifications())),
    passeios: JSON.parse(JSON.stringify(db.getPasseios())),
  };
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`✅ [PASS] ${name}`);
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
    console.error(`❌ [FAIL] ${name}: ${err?.message || err}`);
  }
}

async function main() {
  console.log('\n=====================================================================');
  console.log('SUÍTE DE TESTES TRANSACIONAIS & INTEGRIDADE — LOJINHA ICEVES PDV');
  console.log('=====================================================================\n');

  // -------------------------------------------------------------------------
  // T1: Venda simples completa (Cenário exato da reprodução do bug)
  // -------------------------------------------------------------------------
  await runTest('T1 — Venda simples atômica (Ana Vitória Lisboa + Bíblia pequena R$ 25,00)', () => {
    const db = createIsolatedDb();
    const anaBefore = db.getStudents().find(s => s.registrationNumber === 'EC10-001');
    const bibliaBefore = db.getProducts().find(p => p.internalCode === 'LIV-001');
    assert.ok(anaBefore, 'Aluna Ana Vitória Lisboa (EC10-001) deve existir no seed');
    assert.ok(bibliaBefore, 'Produto Bíblia pequena (LIV-001) deve existir no seed');

    assert.equal(anaBefore.name, 'Ana Vitória Lisboa');
    assert.equal(bibliaBefore.price, 25);
    assert.equal(bibliaBefore.currentStock, 6);
    assert.equal(anaBefore.currentConsumptionBalance, 0);

    const salesBefore = db.getSales().length;
    const receiptsBefore = db.getReceipts().length;

    const idempotencyKey = `IDEMP-${Date.now()}-T1`;
    const bundle = db.registerSale({
      studentId: anaBefore.id,
      items: [{ productId: bibliaBefore.id, quantity: 1 }],
      operatorUser: ADMIN_USER,
      paymentMethod: 'CONTA_ALUNO',
      idempotencyKey,
    });

    assert.equal(bundle.sale.status, 'COMPLETED');
    assert.equal(bundle.sale.total, 25);
    assert.equal(bundle.sale.subtotal, 25);
    assert.equal(bundle.sale.idempotencyKey, idempotencyKey);
    assert.ok(bundle.sale.completedAt, 'completedAt deve estar preenchido');
    assert.equal(bundle.receipt.saleId, bundle.sale.id);
    assert.equal(bundle.receipt.status, 'ATIVO');
    assert.equal(bundle.sale.receiptId, bundle.receipt.id);
    assert.equal(bundle.sale.receiptCode, bundle.receipt.receiptCode);

    assert.equal(db.getSales().length, salesBefore + 1);
    assert.equal(db.getReceipts().length, receiptsBefore + 1);

    const bibliaAfter = db.getProducts().find(p => p.id === bibliaBefore.id)!;
    const anaAfter = db.getStudents().find(s => s.id === anaBefore.id)!;
    assert.equal(bibliaAfter.currentStock, 5);
    assert.equal(anaAfter.currentConsumptionBalance, 25);
    assert.equal(anaAfter.totalOpenDebt, 25);

    const mov = db.getStockMovements().find(m => m.saleId === bundle.sale.id);
    assert.ok(mov, 'Movimentação de estoque deve estar vinculada ao saleId');
    assert.equal(mov.previousStock, 6);
    assert.equal(mov.newStock, 5);
    assert.equal(mov.resultingStock, 5);
    assert.equal(mov.quantity, -1);

    const ledger = db.getFinancialLedger().find(l => l.saleId === bundle.sale.id && l.category === 'CONSUMO_LOJINHA');
    assert.ok(ledger, 'Lançamento de consumo no livro financeiro deve estar vinculado ao saleId');
    assert.equal(ledger.amount, 25);

    const audit = db.getAuditLogs().find(a => a.referenceId === bundle.sale.id && a.action === 'REGISTRO_VENDA_PDV');
    assert.ok(audit, 'Registro de auditoria deve estar vinculado via referenceId');

    const issues = validateDataIntegrity(db.getIntegritySnapshot());
    assert.equal(issues.length, 0, `Esperado 0 inconsistências, obtido: ${JSON.stringify(issues)}`);
  });

  // -------------------------------------------------------------------------
  // T2: Venda com múltiplos itens e baixa múltipla de estoque
  // -------------------------------------------------------------------------
  await runTest('T2 — Venda com múltiplos itens (Bíblia pequena x2 + Paçocas x5)', () => {
    const db = createIsolatedDb();
    const ana = db.getStudents().find(s => s.id === 'student-1')!;
    const biblia = db.getProducts().find(p => p.id === 'prod-liv-001')!;
    const pacoca = db.getProducts().find(p => p.id === 'prod-ali-001')!;

    const bibliaStockBefore = biblia.currentStock;
    const pacocaStockBefore = pacoca.currentStock;

    const res = db.registerSale({
      studentId: ana.id,
      items: [
        { productId: biblia.id, quantity: 2 }, // R$ 50,00
        { productId: pacoca.id, quantity: 5 }, // R$ 3,00
      ],
      operatorUser: ADMIN_USER,
      paymentMethod: 'CONTA_ALUNO',
      idempotencyKey: `IDEMP-${Date.now()}-T2`,
    });

    assert.equal(res.sale.total, 53);
    assert.equal(res.sale.items.length, 2);
    assert.equal(res.receipt.items.length, 2);
    assert.equal(res.receipt.financialSummary.saleTotal, 53);
    assert.equal(db.getProducts().find(p => p.id === biblia.id)!.currentStock, bibliaStockBefore - 2);
    assert.equal(db.getProducts().find(p => p.id === pacoca.id)!.currentStock, pacocaStockBefore - 5);
    assert.equal(db.getStudents().find(s => s.id === ana.id)!.currentConsumptionBalance, 53);
    assert.equal(res.stockMovements.length, 2);
    assert.equal(validateDataIntegrity(db.getIntegritySnapshot()).length, 0);
  });

  // -------------------------------------------------------------------------
  // T3: Clique duplo / Idempotência com mesma chave
  // -------------------------------------------------------------------------
  await runTest('T3 — Idempotência (clique duplo / replay não duplica venda, recibo, estoque nem consumo)', () => {
    const db = createIsolatedDb();
    const key = `IDEMP-${Date.now()}-DUP`;

    const first = db.registerSale({
      studentId: 'student-1',
      items: [{ productId: 'prod-liv-001', quantity: 1 }],
      operatorUser: ADMIN_USER,
      paymentMethod: 'CONTA_ALUNO',
      idempotencyKey: key,
    });

    const second = db.registerSale({
      studentId: 'student-1',
      items: [{ productId: 'prod-liv-001', quantity: 1 }],
      operatorUser: ADMIN_USER,
      paymentMethod: 'CONTA_ALUNO',
      idempotencyKey: key,
    });

    assert.equal(second.idempotentReplay, true);
    assert.equal(second.sale.id, first.sale.id);
    assert.equal(second.receipt.id, first.receipt.id);
    assert.equal(db.getSales().length, 1);
    assert.equal(db.getReceipts().length, 1);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 5);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.currentConsumptionBalance, 25);
    assert.equal(validateDataIntegrity(db.getIntegritySnapshot()).length, 0);
  });

  // -------------------------------------------------------------------------
  // T4: Bloqueio de produto sem preço definido (Livro Tempo de Sair)
  // -------------------------------------------------------------------------
  await runTest('T4 — Bloqueio de venda para produto sem preço (Livro Tempo de Sair)', () => {
    const db = createIsolatedDb();
    const prod = db.getProducts().find(p => p.id === 'prod-liv-002')!;
    assert.equal(prod.price, null);
    const stockBefore = prod.currentStock;

    assert.throws(
      () =>
        db.registerSale({
          studentId: 'student-1',
          items: [{ productId: 'prod-liv-002', quantity: 1 }],
          operatorUser: ADMIN_USER,
          paymentMethod: 'CONTA_ALUNO',
        }),
      /Este produto não possui preço definido e não pode ser vendido\./
    );

    assert.equal(db.getSales().length, 0);
    assert.equal(db.getReceipts().length, 0);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-002')!.currentStock, stockBefore);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.currentConsumptionBalance, 0);
  });

  // -------------------------------------------------------------------------
  // T5: Bloqueio de estoque insuficiente com mensagem exata em pt-BR
  // -------------------------------------------------------------------------
  await runTest('T5 — Bloqueio de venda por estoque insuficiente (mensagem exata em pt-BR)', () => {
    const db = createIsolatedDb();
    assert.throws(
      () =>
        db.registerSale({
          studentId: 'student-1',
          items: [{ productId: 'prod-liv-001', quantity: 99 }],
          operatorUser: ADMIN_USER,
          paymentMethod: 'CONTA_ALUNO',
        }),
      /Estoque insuficiente para o produto "Bíblia pequena"\. Disponível: 6\. Solicitado: 99\./
    );

    assert.equal(db.getSales().length, 0);
    assert.equal(db.getReceipts().length, 0);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 6);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.currentConsumptionBalance, 0);
  });

  // -------------------------------------------------------------------------
  // T6: Rollback em falha na etapa CREATE_SALE
  // -------------------------------------------------------------------------
  await runTest('T6 — Rollback integral em falha simulada na criação da venda (CREATE_SALE)', () => {
    const db = createIsolatedDb();
    assert.throws(
      () =>
        db.registerSale({
          studentId: 'student-1',
          items: [{ productId: 'prod-liv-001', quantity: 1 }],
          operatorUser: ADMIN_USER,
          paymentMethod: 'CONTA_ALUNO',
          __testFaultStage: 'CREATE_SALE',
        }),
      /Falha simulada ao gravar registro da venda/
    );

    assert.equal(db.getSales().length, 0);
    assert.equal(db.getReceipts().length, 0);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 6);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.currentConsumptionBalance, 0);
    assert.ok(db.getAuditLogs().some(a => a.action === 'FALHA_VENDA_PDV' && a.status === 'FALHA'));
    assert.equal(validateDataIntegrity(db.getIntegritySnapshot()).length, 0);
  });

  // -------------------------------------------------------------------------
  // T7: Rollback em falha na etapa DEDUCT_STOCK (baixa parcial revertida)
  // -------------------------------------------------------------------------
  await runTest('T7 — Rollback integral em falha na baixa de estoque do 2º item (DEDUCT_STOCK)', () => {
    const db = createIsolatedDb();
    const pacocaBefore = db.getProducts().find(p => p.id === 'prod-ali-001')!.currentStock;

    assert.throws(
      () =>
        db.registerSale({
          studentId: 'student-1',
          items: [
            { productId: 'prod-liv-001', quantity: 2 },
            { productId: 'prod-ali-001', quantity: 3 },
          ],
          operatorUser: ADMIN_USER,
          paymentMethod: 'CONTA_ALUNO',
          __testFaultStage: 'DEDUCT_STOCK',
        }),
      /Falha simulada na baixa de estoque/
    );

    // O primeiro item (Bíblia) que já havia sido decrementado na loop DEVE ter voltado para 6
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 6);
    assert.equal(db.getProducts().find(p => p.id === 'prod-ali-001')!.currentStock, pacocaBefore);
    assert.equal(db.getSales().length, 0);
    assert.equal(db.getReceipts().length, 0);
    assert.equal(db.getStockMovements().length, 0);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.currentConsumptionBalance, 0);
    assert.equal(validateDataIntegrity(db.getIntegritySnapshot()).length, 0);
  });

  // -------------------------------------------------------------------------
  // T8: Rollback em falha na etapa CREATE_RECEIPT (sem recibo órfão ou venda parcial)
  // -------------------------------------------------------------------------
  await runTest('T8 — Rollback integral em falha ao gerar recibo (CREATE_RECEIPT)', () => {
    const db = createIsolatedDb();
    assert.throws(
      () =>
        db.registerSale({
          studentId: 'student-1',
          items: [{ productId: 'prod-liv-001', quantity: 1 }],
          operatorUser: ADMIN_USER,
          paymentMethod: 'CONTA_ALUNO',
          __testFaultStage: 'CREATE_RECEIPT',
        }),
      /Falha simulada ao gerar o recibo/
    );

    assert.equal(db.getSales().length, 0);
    assert.equal(db.getReceipts().length, 0);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 6);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.currentConsumptionBalance, 0);
    assert.equal(db.getFinancialLedger().length, 0);
    assert.equal(validateDataIntegrity(db.getIntegritySnapshot()).length, 0);
  });

  // -------------------------------------------------------------------------
  // T9: Rollback em falha na etapa PERSIST_STORAGE
  // -------------------------------------------------------------------------
  await runTest('T9 — Rollback integral em falha de persistência (PERSIST_STORAGE)', () => {
    const db = createIsolatedDb();
    assert.throws(
      () =>
        db.registerSale({
          studentId: 'student-1',
          items: [{ productId: 'prod-liv-001', quantity: 1 }],
          operatorUser: ADMIN_USER,
          paymentMethod: 'CONTA_ALUNO',
          __testFaultStage: 'PERSIST_STORAGE',
        }),
      /Falha simulada ao persistir/
    );

    assert.equal(db.getSales().length, 0);
    assert.equal(db.getReceipts().length, 0);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 6);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.currentConsumptionBalance, 0);
    assert.equal(validateDataIntegrity(db.getIntegritySnapshot()).length, 0);
  });

  // -------------------------------------------------------------------------
  // T10: Falha de localStorage (QuotaExceededError) com rollback atômico do snapshot
  // -------------------------------------------------------------------------
  await runTest('T10 — Rollback atômico do snapshot offline em QuotaExceededError', () => {
    const db = createIsolatedDb();
    const storage = new MemoryStorage();
    const initialSnap = buildOfflineSnapshotFromDb(db);
    saveOfflineSnapshotAtomic(initialSnap, { storage, operation: 'INIT' });

    const bundle = db.registerSale({
      studentId: 'student-1',
      items: [{ productId: 'prod-liv-001', quantity: 1 }],
      operatorUser: ADMIN_USER,
      paymentMethod: 'CONTA_ALUNO',
      idempotencyKey: `IDEMP-${Date.now()}-T10`,
    });

    // Simula erro de escrita exatamente ao gravar SNAPSHOT_KEY
    storage.failOnKey = SNAPSHOT_KEY;
    assert.throws(
      () => commitSaleBundleToOfflineSnapshot(initialSnap, bundle, storage),
      /Falha ao persistir os dados localmente/
    );

    // Libera falha e valida que o snapshot salvo permanece exatamente no estado anterior íntegro
    storage.failOnKey = null;
    const restoredRaw = storage.getItem(SNAPSHOT_KEY);
    assert.ok(restoredRaw, 'Snapshot anterior deve continuar íntegro');
    const restored = JSON.parse(restoredRaw) as OfflineDataSnapshot;
    assert.equal(restored.sales.length, 0);
    assert.equal((restored.receipts || []).length, 0);
    assert.equal(restored.products.find(p => p.id === 'prod-liv-001')!.currentStock, 6);
    assert.equal(storage.getItem(SNAPSHOT_TX_JOURNAL_KEY), null);
  });

  // -------------------------------------------------------------------------
  // T11: Estorno atômico completo + ajuste de fatura + bloqueio de estorno duplicado + idempotência
  // -------------------------------------------------------------------------
  await runTest('T11 — Estorno atômico completo, reversão de estoque/consumo/recibo/fatura e idempotência', () => {
    const db = createIsolatedDb();
    const saleBundle = db.registerSale({
      studentId: 'student-1',
      items: [{ productId: 'prod-liv-001', quantity: 1 }],
      operatorUser: ADMIN_USER,
      paymentMethod: 'CONTA_ALUNO',
      idempotencyKey: `IDEMP-${Date.now()}-T11`,
    });

    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 5);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.currentConsumptionBalance, 25);

    // Tenta estornar sem motivo (deve bloquear)
    assert.throws(
      () => db.reverseSale(saleBundle.sale.id, '   ', ADMIN_USER),
      /motivo do estorno é obrigatório/
    );

    const revKey = `REV-IDEMP-${Date.now()}`;
    const revBundle = db.reverseSale(
      saleBundle.sale.id,
      'Teste de validação transacional e estorno integral',
      ADMIN_USER,
      { idempotencyKey: revKey }
    );

    assert.equal(revBundle.sale.status, 'REVERSED');
    assert.equal(revBundle.receipt?.status, 'ESTORNADO');
    assert.equal(db.getReceipts().filter(r => r.status === 'ATIVO').length, 0);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 6);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.currentConsumptionBalance, 0);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.totalOpenDebt, 0);

    // Replay idempotente com a MESMA chave não devolve estoque duas vezes
    const revReplay = db.reverseSale(
      saleBundle.sale.id,
      'Teste de validação transacional e estorno integral',
      ADMIN_USER,
      { idempotencyKey: revKey }
    );
    assert.equal(revReplay.idempotentReplay, true);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 6);

    // Novo estorno com outra chave DEVE ser bloqueado
    assert.throws(
      () =>
        db.reverseSale(saleBundle.sale.id, 'Tentativa duplicada', ADMIN_USER, {
          idempotencyKey: `REV-NEW-${Date.now()}`,
        }),
      /já foi estornada anteriormente/
    );

    assert.equal(validateDataIntegrity(db.getIntegritySnapshot()).length, 0);
  });

  // -------------------------------------------------------------------------
  // T12: Recuperação após recarregamento de página / transação interrompida
  // -------------------------------------------------------------------------
  await runTest('T12 — Recuperação segura no boot após transação interrompida e snapshot corrompido', () => {
    const db = createIsolatedDb();
    const storage = new MemoryStorage();
    const baseSnap = buildOfflineSnapshotFromDb(db);
    const saleBundle = db.registerSale({
      studentId: 'student-1',
      items: [{ productId: 'prod-liv-001', quantity: 1 }],
      operatorUser: ADMIN_USER,
      paymentMethod: 'CONTA_ALUNO',
    });

    const committedSnap = commitSaleBundleToOfflineSnapshot(baseSnap, saleBundle, storage);
    assert.equal(committedSnap.sales.length, 1);

    // Simula queda de energia/reload no meio de uma escrita seguinte
    storage.setItem(SNAPSHOT_BACKUP_KEY, JSON.stringify(committedSnap));
    storage.setItem(
      SNAPSHOT_TX_JOURNAL_KEY,
      JSON.stringify({ txId: 'TX-CRASH', operation: 'SALE_COMMIT', startedAt: new Date().toISOString(), status: 'IN_PROGRESS' })
    );
    storage.setItem(SNAPSHOT_KEY, '{"corrupted_json": true');

    const recovery = recoverOfflineSnapshotOnBoot(storage);
    assert.equal(recovery.recovered, true);
    assert.ok(recovery.snapshot, 'Snapshot deve ser recuperado a partir do backup íntegro');
    assert.equal(recovery.snapshot.sales.length, 1);
    assert.equal((recovery.snapshot.receipts || []).length, 1);
    assert.equal(recovery.snapshot.products.find(p => p.id === 'prod-liv-001')!.currentStock, 5);
    assert.equal(storage.getItem(SNAPSHOT_TX_JOURNAL_KEY), null);
  });

  // -------------------------------------------------------------------------
  // T13: Consistência entre módulos + detector de integridade (8 invariantes)
  // -------------------------------------------------------------------------
  await runTest('T13 — Validador de integridade detecta corrupções reais (recibo órfão, estoque negativo, duplicidade)', () => {
    const db = createIsolatedDb();
    const bundle = db.registerSale({
      studentId: 'student-1',
      items: [{ productId: 'prod-liv-001', quantity: 1 }],
      operatorUser: ADMIN_USER,
      paymentMethod: 'CONTA_ALUNO',
      idempotencyKey: 'IDEMP-INTEGRITY-1',
    });

    // Snapshot íntegro -> 0 problemas
    const healthyReport = buildIntegrityReport(db.getIntegritySnapshot());
    assert.equal(healthyReport.healthy, true);
    assert.equal(healthyReport.errorCount, 0);

    // Simula exatamente o bug antigo reportado em produção (recibo ativo sem venda correspondente)
    const corruptedSnap = db.getIntegritySnapshot();
    corruptedSnap.receipts = [
      ...corruptedSnap.receipts,
      {
        ...bundle.receipt,
        id: 'REC-ICE-ORPHAN',
        receiptCode: 'REC-ICE-000099',
        saleId: 'VEN-INEXISTENTE',
        status: 'ATIVO',
      },
    ];
    corruptedSnap.products = corruptedSnap.products.map(p =>
      p.id === 'prod-liv-001' ? { ...p, currentStock: -2 } : p
    );
    corruptedSnap.sales = [
      ...corruptedSnap.sales,
      { ...bundle.sale, id: 'VEN-DUP-KEY' }, // mesma idempotencyKey + sem recibo ativo
    ];

    const issues = validateDataIntegrity(corruptedSnap);
    const codes = new Set(issues.map(i => i.code));
    assert.ok(codes.has('RECEIPT_ACTIVE_WITHOUT_COMPLETED_SALE'), 'Deve detectar recibo ativo órfão');
    assert.ok(codes.has('NEGATIVE_PRODUCT_STOCK'), 'Deve detectar estoque negativo');
    assert.ok(codes.has('DUPLICATE_IDEMPOTENCY_KEY'), 'Deve detectar idempotencyKey duplicada');
    assert.ok(codes.has('COMPLETED_SALE_WITHOUT_ACTIVE_RECEIPT'), 'Deve detectar venda concluída sem recibo ativo');
  });

  // -------------------------------------------------------------------------
  // T14: Reset seguro com backup/rollback e sem mutar constantes de seed
  // -------------------------------------------------------------------------
  await runTest('T14 — Reset seguro (Restaurar Dados Iniciais) preserva backup em falha e restaura seed íntegro', () => {
    const db = createIsolatedDb();
    db.registerSale({
      studentId: 'student-1',
      items: [{ productId: 'prod-liv-001', quantity: 2 }],
      operatorUser: ADMIN_USER,
      paymentMethod: 'CONTA_ALUNO',
    });
    assert.equal(db.getSales().length, 1);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 4);

    // Falha durante reset -> rollback automático preserva a venda e o estoque anterior
    assert.throws(
      () => db.resetToSeed(ADMIN_USER, { simulateFailure: true }),
      /estado anterior foi preservado via backup/
    );
    assert.equal(db.getSales().length, 1);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 4);

    // Reset normal -> restaura seed limpo e íntegro sem mutar initialProducts/initialStudents
    const resetRes = db.resetToSeed(ADMIN_USER);
    assert.equal(resetRes.success, true);
    assert.equal(resetRes.backupCreated, true);
    assert.equal(db.getSales().length, 0);
    assert.equal(db.getReceipts().length, 0);
    assert.equal(db.getProducts().find(p => p.id === 'prod-liv-001')!.currentStock, 6);
    assert.equal(db.getStudents().find(s => s.id === 'student-1')!.currentConsumptionBalance, 0);
    assert.equal(initialProducts.find(p => p.id === 'prod-liv-001')!.currentStock, 6);
    assert.equal(initialStudents.find(s => s.id === 'student-1')!.currentConsumptionBalance, 0);
    assert.equal(validateDataIntegrity(db.getIntegritySnapshot()).length, 0);
  });

  // =========================================================================
  // VERIFICAÇÃO OBRIGATÓRIA FINAL (REPRODUÇÃO EXATA + ESTORNO)
  // =========================================================================
  console.log('\n---------------------------------------------------------------------');
  console.log('VERIFICAÇÃO OBRIGATÓRIA FINAL — CENÁRIO ANA VITÓRIA + BÍBLIA PEQUENA');
  console.log('---------------------------------------------------------------------');

  const verifyDb = createIsolatedDb();
  const verifyStorage = new MemoryStorage();
  let offlineSnap = buildOfflineSnapshotFromDb(verifyDb);
  saveOfflineSnapshotAtomic(offlineSnap, { storage: verifyStorage, operation: 'VERIFY_INIT' });

  // Cria 1 venda prévia de outra aluna (como no cenário de produção que começava com 1 venda)
  const preSale = verifyDb.registerSale({
    studentId: 'student-2', // Beatriz Gomes Ramos
    items: [{ productId: 'prod-pap-001', quantity: 6 }], // R$ 24,00
    operatorUser: ADMIN_USER,
    paymentMethod: 'CONTA_ALUNO',
    idempotencyKey: `IDEMP-SEED-PRE-${Date.now()}`,
  });
  offlineSnap = commitSaleBundleToOfflineSnapshot(offlineSnap, preSale, verifyStorage);

  const beforeSalesCount = verifyDb.getSales().length;
  const beforeReceiptsCount = verifyDb.getReceipts().length;
  const beforeBibliaStock = verifyDb.getProducts().find(p => p.internalCode === 'LIV-001')!.currentStock;
  const beforeAnaBalance = verifyDb.getStudents().find(s => s.registrationNumber === 'EC10-001')!.currentConsumptionBalance;

  // Passo 1: Venda exata — Ana Vitória Lisboa (EC10-001) + Bíblia pequena (LIV-001), qtd 1, R$ 25,00
  const anaSale = verifyDb.registerSale({
    studentId: 'student-1',
    items: [{ productId: 'prod-liv-001', quantity: 1 }],
    operatorUser: ADMIN_USER,
    paymentMethod: 'CONTA_ALUNO',
    idempotencyKey: `IDEMP-VERIFY-ANA-${Date.now()}`,
  });
  offlineSnap = commitSaleBundleToOfflineSnapshot(offlineSnap, anaSale, verifyStorage);

  const afterSalesCount = verifyDb.getSales().length;
  const afterReceiptsCount = verifyDb.getReceipts().length;
  const afterActiveReceiptsCount = verifyDb.getReceipts().filter(r => r.status === 'ATIVO').length;
  const afterBibliaStock = verifyDb.getProducts().find(p => p.internalCode === 'LIV-001')!.currentStock;
  const afterAnaBalance = verifyDb.getStudents().find(s => s.registrationNumber === 'EC10-001')!.currentConsumptionBalance;
  const afterIntegrity = validateDataIntegrity(verifyDb.getIntegritySnapshot());
  const offlineAfterSale = JSON.parse(verifyStorage.getItem(SNAPSHOT_KEY)!) as OfflineDataSnapshot;

  assert.equal(afterSalesCount, beforeSalesCount + 1);
  assert.equal(afterReceiptsCount, beforeReceiptsCount + 1);
  assert.equal(afterBibliaStock, beforeBibliaStock - 1);
  assert.equal(afterAnaBalance, beforeAnaBalance + 25);
  assert.equal(afterIntegrity.length, 0);
  assert.equal(offlineAfterSale.sales.length, afterSalesCount);
  assert.equal((offlineAfterSale.receipts || []).length, afterReceiptsCount);
  assert.equal(offlineAfterSale.products.find(p => p.internalCode === 'LIV-001')!.currentStock, 5);
  assert.equal(offlineAfterSale.students.find(s => s.registrationNumber === 'EC10-001')!.currentConsumptionBalance, 25);

  console.log('[ANTES DA VENDA]');
  console.log(`  Vendas: ${beforeSalesCount} | Recibos: ${beforeReceiptsCount} | Estoque Bíblia pequena (LIV-001): ${beforeBibliaStock} | Consumo Ana Vitória (EC10-001): R$ ${beforeAnaBalance.toFixed(2)}`);
  console.log('[APÓS CONFIRMAR VENDA — ANA VITÓRIA + BÍBLIA PEQUENA R$ 25,00]');
  console.log(`  ID da Venda: ${anaSale.sale.id} (status: ${anaSale.sale.status})`);
  console.log(`  ID/Código do Recibo: ${anaSale.receipt.id} / ${anaSale.receipt.receiptCode} (saleId: ${anaSale.receipt.saleId}, status: ${anaSale.receipt.status})`);
  console.log(`  Vendas: ${afterSalesCount} | Recibos: ${afterReceiptsCount} (Ativos: ${afterActiveReceiptsCount}) | Estoque Bíblia pequena: ${afterBibliaStock} | Consumo Ana Vitória: R$ ${afterAnaBalance.toFixed(2)}`);
  console.log(`  Snapshot offline (iceves_offline_snapshot_v1): sales=${offlineAfterSale.sales.length}, receipts=${(offlineAfterSale.receipts || []).length}, estoque=${offlineAfterSale.products.find(p => p.internalCode === 'LIV-001')!.currentStock}, consumo=R$ ${offlineAfterSale.students.find(s => s.registrationNumber === 'EC10-001')!.currentConsumptionBalance.toFixed(2)}`);
  console.log(`  Inconsistências detectadas: ${afterIntegrity.length}`);

  // Passo 2: Estorno completo da venda de Ana Vitória
  const anaReversal = verifyDb.reverseSale(
    anaSale.sale.id,
    'Verificação obrigatória de estorno integral',
    ADMIN_USER,
    { idempotencyKey: `REV-VERIFY-ANA-${Date.now()}` }
  );
  offlineSnap = commitReversalBundleToOfflineSnapshot(offlineSnap, anaReversal, verifyStorage);

  const postRevSalesCompleted = verifyDb.getSales().filter(s => s.status === 'COMPLETED').length;
  const postRevActiveReceipts = verifyDb.getReceipts().filter(r => r.status === 'ATIVO').length;
  const postRevBibliaStock = verifyDb.getProducts().find(p => p.internalCode === 'LIV-001')!.currentStock;
  const postRevAnaBalance = verifyDb.getStudents().find(s => s.registrationNumber === 'EC10-001')!.currentConsumptionBalance;
  const postRevIntegrity = validateDataIntegrity(verifyDb.getIntegritySnapshot());
  const offlineAfterRev = JSON.parse(verifyStorage.getItem(SNAPSHOT_KEY)!) as OfflineDataSnapshot;

  assert.equal(anaReversal.sale.status, 'REVERSED');
  assert.equal(anaReversal.receipt?.status, 'ESTORNADO');
  assert.equal(postRevSalesCompleted, 1);
  assert.equal(postRevActiveReceipts, 1);
  assert.equal(postRevBibliaStock, 6);
  assert.equal(postRevAnaBalance, 0);
  assert.equal(postRevIntegrity.length, 0);
  assert.equal(offlineAfterRev.products.find(p => p.internalCode === 'LIV-001')!.currentStock, 6);
  assert.equal(offlineAfterRev.students.find(s => s.registrationNumber === 'EC10-001')!.currentConsumptionBalance, 0);

  console.log('[APÓS ESTORNO DA VENDA DE ANA VITÓRIA]');
  console.log(`  Status Venda: ${anaReversal.sale.status} | Status Recibo: ${anaReversal.receipt?.status}`);
  console.log(`  Vendas COMPLETED: ${postRevSalesCompleted} | Recibos ATIVOS: ${postRevActiveReceipts} | Estoque Bíblia pequena: ${postRevBibliaStock} | Consumo Ana Vitória: R$ ${postRevAnaBalance.toFixed(2)}`);
  console.log(`  Snapshot offline após estorno: estoque=${offlineAfterRev.products.find(p => p.internalCode === 'LIV-001')!.currentStock}, consumo=R$ ${offlineAfterRev.students.find(s => s.registrationNumber === 'EC10-001')!.currentConsumptionBalance.toFixed(2)}`);
  console.log(`  Inconsistências detectadas: ${postRevIntegrity.length}`);

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log('\n=====================================================================');
  console.log(`RESUMO FINAL: ${passedCount}/${results.length} TESTES APROVADOS (${failedCount} FALHAS)`);
  console.log('=====================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Erro fatal na suíte de testes:', err);
  process.exit(1);
});
