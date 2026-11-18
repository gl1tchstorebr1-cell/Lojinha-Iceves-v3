import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DB_FILE = path.resolve(process.cwd(), 'data', 'base44_db.json');

async function runTests() {
  const originalDbExists = fs.existsSync(DB_FILE);
  const originalDbSnapshot = originalDbExists ? fs.readFileSync(DB_FILE, 'utf-8') : null;

  try {
    const { db } = await import('../src/server/db.ts');
    const { handleApiRoute } = await import('../src/server/handler.ts');

    const adminUser = { id: 'user-admin', name: 'Admin Teste', role: 'ADMIN' as const };
    const managerUser = { id: 'user-manager', name: 'Gerente Teste', role: 'MANAGER' as const };
    const viewerUser = { id: 'user-viewer', name: 'Leitor Teste', role: 'VIEWER' as const };
    const cashierUser = { id: 'user-cashier', name: 'Caixa Teste', role: 'CASHIER' as const };

    const activeProducts = db.getProducts().filter(p => !p.archived && p.status === 'ACTIVE' && (p.price || 0) > 0 && p.currentStock >= 3);
    assert.ok(activeProducts.length > 0, 'Deve existir pelo menos 1 produto ativo com estoque >= 3 e preço definido');
    const targetProduct = activeProducts[0];
    const initialStock = targetProduct.currentStock;

    const activeStudents = db.getStudents().filter(s => s.status === 'ACTIVE');
    assert.ok(activeStudents.length > 0, 'Deve existir pelo menos 1 aluno ativo');
    const targetStudent = activeStudents[0];
    const initialBalance = targetStudent.currentConsumptionBalance;

    // 1. Venda PDV + baixa de estoque + idempotência + estorno
    const idempKey = `test-idemp-${Date.now()}`;
    const saleRes1 = db.registerSale({
      studentId: targetStudent.id,
      items: [{ productId: targetProduct.id, quantity: 2 }],
      paymentMethod: 'CONTA_ALUNO',
      operatorUser: adminUser,
      idempotencyKey: idempKey,
    });

    assert.equal(saleRes1.sale.status, 'COMPLETED');
    assert.equal(targetProduct.currentStock, initialStock - 2, 'Estoque deve baixar em 2 unidades');
    assert.equal(
      targetStudent.currentConsumptionBalance,
      Math.round((initialBalance + saleRes1.sale.total) * 100) / 100,
      'Saldo de consumo do aluno deve somar o valor da venda'
    );

    const saleRes2 = db.registerSale({
      studentId: targetStudent.id,
      items: [{ productId: targetProduct.id, quantity: 2 }],
      paymentMethod: 'CONTA_ALUNO',
      operatorUser: adminUser,
      idempotencyKey: idempKey,
    });
    assert.equal(saleRes2.sale.id, saleRes1.sale.id, 'Chave de idempotência deve evitar venda duplicada');
    assert.equal(targetProduct.currentStock, initialStock - 2, 'Estoque não pode baixar duas vezes para mesma chave');

    const revRes = db.reverseSale(saleRes1.sale.id, 'Teste automatizado de estorno', adminUser);
    assert.equal(revRes.sale.status, 'REVERSED');
    assert.equal(targetProduct.currentStock, initialStock, 'Estorno deve restaurar estoque original');
    assert.equal(targetStudent.currentConsumptionBalance, initialBalance, 'Estorno deve restaurar saldo do aluno');

    // 2. Bloqueio de consumo e limite individual
    const unitPrice = Number(targetProduct.price);
    db.updateStudentSettings(
      targetStudent.id,
      {
        consumptionLimit: Math.max(0.01, Math.round((initialBalance + unitPrice * 0.5) * 100) / 100),
      },
      adminUser
    );
    assert.throws(
      () =>
        db.registerSale({
          studentId: targetStudent.id,
          items: [{ productId: targetProduct.id, quantity: 1 }],
          paymentMethod: 'CONTA_ALUNO',
          operatorUser: cashierUser,
        }),
      /limite de consumo/i,
      'Deve bloquear compra na conta que ultrapassa o consumptionLimit'
    );

    db.updateStudentSettings(
      targetStudent.id,
      {
        consumptionLimit: null,
        consumptionBlocked: true,
        consumptionBlockedReason: 'Teste de bloqueio',
      },
      adminUser
    );
    assert.throws(
      () =>
        db.registerSale({
          studentId: targetStudent.id,
          items: [{ productId: targetProduct.id, quantity: 1 }],
          paymentMethod: 'CONTA_ALUNO',
          operatorUser: cashierUser,
        }),
      /bloqueado/i,
      'Deve bloquear compra na conta quando consumptionBlocked=true'
    );
    db.updateStudentSettings(
      targetStudent.id,
      { consumptionBlocked: false, consumptionBlockedReason: '' },
      adminUser
    );

    // 3. Baixa de estoque por Perda / Avaria
    const stockBeforeLoss = targetProduct.currentStock;
    db.adjustStock({
      productId: targetProduct.id,
      type: 'PERDA_AVARIA',
      quantity: 1,
      reason: 'Embalagem avariada em teste',
      user: adminUser,
    });
    assert.equal(targetProduct.currentStock, stockBeforeLoss - 1, 'PERDA_AVARIA deve reduzir estoque em 1');
    const lossMov = db.getStockMovements()[0];
    assert.equal(lossMov.type, 'PERDA_AVARIA');

    // 4. Fluxo completo de Caixa (Abertura -> Suprimento -> Sangria -> Fechamento)
    const opened = db.openCashSession(100, 'Abertura teste', cashierUser);
    assert.equal(opened.status, 'ABERTO');
    db.addCashMovement({ type: 'SUPRIMENTO', amount: 50, description: 'Troco adicional', user: cashierUser });
    db.addCashMovement({ type: 'SANGRIA', amount: 30, description: 'Retirada cofre', user: cashierUser });
    const closed = db.closeCashSession(120, 'Conferência exata', cashierUser);
    assert.equal(closed.status, 'FECHADO');
    assert.equal(closed.expectedBalance, 120, 'Saldo esperado em espécie deve ser 100 + 50 - 30 = 120');
    assert.equal(closed.difference, 0, 'Diferença deve ser R$ 0,00');

    // 5. Validação de RBAC nas rotas da API
    const viewerSaleAttempt = await handleApiRoute({
      method: 'POST',
      url: '/api/sales',
      body: { studentId: targetStudent.id, items: [{ productId: targetProduct.id, quantity: 1 }] },
      user: viewerUser,
    });
    assert.equal(viewerSaleAttempt.status, 403, 'VIEWER não pode registrar venda no PDV');

    const cashierSettingsAttempt = await handleApiRoute({
      method: 'PUT',
      url: '/api/settings',
      body: { storeName: 'Alterado Indevidamente' },
      user: cashierUser,
    });
    assert.equal(cashierSettingsAttempt.status, 403, 'CASHIER não pode alterar configurações');

    const managerCashGet = await handleApiRoute({
      method: 'GET',
      url: '/api/cash',
      user: managerUser,
    });
    assert.equal(managerCashGet.status, 200, 'MANAGER pode consultar módulo de Caixa');

    console.log('✅ Todos os 5 grupos de testes críticos (PDV/Idempotência/Estorno, Limite/Bloqueio, Perda/Avaria, Caixa e RBAC) passaram com sucesso!');
  } finally {
    // Aguardar microtasks pendentes de persistência antes de restaurar snapshot original
    await new Promise(resolve => setTimeout(resolve, 100));
    if (originalDbExists && originalDbSnapshot !== null) {
      fs.writeFileSync(DB_FILE, originalDbSnapshot, 'utf-8');
    }
  }
}

runTests().catch(err => {
  console.error('❌ Falha nos testes críticos:', err);
  process.exit(1);
});
