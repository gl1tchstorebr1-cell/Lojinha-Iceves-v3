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
    const {
      mapSaleToSupabase,
      mapInvoiceToSupabase,
      mapBillingBatchToSupabase
    } = await import('../src/server/supabase.ts');

    const adminUser = { id: 'user-admin', name: 'Admin Teste', role: 'ADMIN' as const };
    const managerUser = { id: 'user-manager', name: 'Gerente Teste', role: 'MANAGER' as const };
    const viewerUser = { id: 'user-viewer', name: 'Leitor Teste', role: 'VIEWER' as const };
    const cashierUser = { id: 'user-cashier', name: 'Caixa Teste', role: 'CASHIER' as const };
    const stockistUser = { id: 'user-stockist', name: 'Estoquista Teste', role: 'STOCKIST' as const };

    const activeProducts = db.getProducts().filter(p => !p.archived && p.status === 'ACTIVE' && (p.price || 0) > 0 && p.currentStock >= 10);
    assert.ok(activeProducts.length >= 2, 'Devem existir pelo menos 2 produtos ativos com estoque >= 10');
    const targetProduct = activeProducts[0];
    const secondProduct = activeProducts[1];
    const initialStock = targetProduct.currentStock;

    const activeStudents = db.getStudents().filter(s => s.status === 'ACTIVE');
    assert.ok(activeStudents.length >= 3, 'Devem existir pelo menos 3 alunos ativos');
    const targetStudent = activeStudents[0];
    const student2 = activeStudents[1];
    const student3 = activeStudents[2];
    const initialBalance = targetStudent.currentConsumptionBalance;

    // =========================================================================
    // GRUPO 1: PDV, Idempotência, Estorno, Limite, Perda/Avaria, Caixa e RBAC
    // =========================================================================
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

    // Bloqueio de consumo e limite individual
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
      /limite de consumo/i
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
      /bloqueado/i
    );
    db.updateStudentSettings(
      targetStudent.id,
      { consumptionBlocked: false, consumptionBlockedReason: '' },
      adminUser
    );

    // Perda/Avaria
    const stockBeforeLoss = targetProduct.currentStock;
    db.adjustStock({
      productId: targetProduct.id,
      type: 'PERDA_AVARIA',
      quantity: 1,
      reason: 'Embalagem avariada em teste',
      user: adminUser,
    });
    assert.equal(targetProduct.currentStock, stockBeforeLoss - 1);

    // Caixa
    const opened = db.openCashSession(100, 'Abertura teste', cashierUser);
    assert.equal(opened.status, 'ABERTO');
    db.addCashMovement({ type: 'SUPRIMENTO', amount: 50, description: 'Troco adicional', user: cashierUser });
    db.addCashMovement({ type: 'SANGRIA', amount: 30, description: 'Retirada cofre', user: cashierUser });
    const closed = db.closeCashSession(120, 'Conferência exata', cashierUser);
    assert.equal(closed.expectedBalance, 120);
    assert.equal(closed.difference, 0);

    // =========================================================================
    // GRUPO 2: MÓDULO AVANÇADO DE FATURAMENTO (INDIVIDUAL, PERÍODO E FECHAMENTO)
    // =========================================================================
    // Limpar faturas e vendas de teste em memória para isolar o cenário de faturamento
    db.clearAllInvoices(adminUser);

    // Criar vendas controladas com timestamps em America/Sao_Paulo
    const sA = db.registerSale({
      studentId: targetStudent.id,
      items: [
        { productId: targetProduct.id, quantity: 3 },
        { productId: secondProduct.id, quantity: 1 }
      ],
      paymentMethod: 'CONTA_ALUNO',
      operatorUser: adminUser,
      idempotencyKey: `fat-sA-${Date.now()}`
    }).sale;
    // 23:45 BRT do dia 2026-10-10 = 2026-10-11T02:45:00.000Z
    sA.createdAt = '2026-10-11T02:45:00.000Z';
    sA.billingPeriod = '2026-10';

    const sB = db.registerSale({
      studentId: targetStudent.id,
      items: [{ productId: secondProduct.id, quantity: 2 }],
      paymentMethod: 'CONTA_ALUNO',
      operatorUser: adminUser,
      idempotencyKey: `fat-sB-${Date.now()}`
    }).sale;
    // 00:15 BRT do dia 2026-10-11 = 2026-10-11T03:15:00.000Z
    sB.createdAt = '2026-10-11T03:15:00.000Z';
    sB.billingPeriod = '2026-10';

    // Venda paga no ato (PIX) NÃO deve entrar como consumo em aberto faturável
    const sPixUpfront = db.registerSale({
      studentId: student2.id,
      items: [{ productId: targetProduct.id, quantity: 1 }],
      paymentMethod: 'PIX',
      operatorUser: cashierUser,
      idempotencyKey: `fat-sPix-${Date.now()}`
    }).sale;
    sPixUpfront.createdAt = '2026-10-10T15:00:00.000Z';

    // Venda estornada para student2 NÃO deve entrar como consumo faturável
    const sReversed = db.registerSale({
      studentId: student2.id,
      items: [{ productId: targetProduct.id, quantity: 2 }],
      paymentMethod: 'CONTA_ALUNO',
      operatorUser: cashierUser,
      idempotencyKey: `fat-sRev-${Date.now()}`
    }).sale;
    sReversed.createdAt = '2026-10-10T16:00:00.000Z';
    db.reverseSale(sReversed.id, 'Estorno antes de faturar', adminUser);

    // Venda válida para student2 no dia 2026-10-10
    const sStudent2 = db.registerSale({
      studentId: student2.id,
      items: [{ productId: targetProduct.id, quantity: 2 }],
      paymentMethod: 'CONTA_ALUNO',
      operatorUser: cashierUser,
      idempotencyKey: `fat-s2-${Date.now()}`
    }).sale;
    sStudent2.createdAt = '2026-10-10T17:00:00.000Z';

    // Venda válida para student3 no dia 2026-10-15
    const sStudent3 = db.registerSale({
      studentId: student3.id,
      items: [{ productId: secondProduct.id, quantity: 2 }],
      paymentMethod: 'CONTA_ALUNO',
      operatorUser: cashierUser,
      idempotencyKey: `fat-s3-${Date.now()}`
    }).sale;
    sStudent3.createdAt = '2026-10-15T14:00:00.000Z';

    // Cenário 1 & 2: Faturamento Individual com seleção parcial de item (1 de 3 unidades do produto 1) + desconto justificado
    assert.throws(
      () =>
        db.createIndividualInvoice(
          {
            studentId: targetStudent.id,
            dueDate: '2026-10-20',
            discountAmount: 1,
            selections: [{ saleId: sA.id, items: [{ itemIndex: 0, quantity: 1 }] }]
          },
          adminUser
        ),
      /justificativa/i,
      'Desconto sem justificativa deve ser bloqueado'
    );

    const indRes1 = db.createIndividualInvoice(
      {
        studentId: targetStudent.id,
        dueDate: '2026-10-20',
        discountAmount: 0.5,
        discountReason: 'Crédito autorizado em teste',
        billingLabel: 'Fatura Parcial 1',
        selections: [{ saleId: sA.id, items: [{ itemIndex: 0, quantity: 1 }] }],
        idempotencyKey: 'ind-key-1'
      },
      adminUser
    );
    assert.equal(indRes1.batch.type, 'INDIVIDUAL');
    assert.equal(indRes1.invoice.billingType, 'INDIVIDUAL');
    assert.equal(sA.billingStatus, 'PARCIALMENTE_FATURADA', 'Venda sA deve ficar parcialmente faturada');

    // Cenário 3: Bloqueio de quantidade excedente/duplicada em item parcialmente faturado
    assert.throws(
      () =>
        db.createIndividualInvoice(
          {
            studentId: targetStudent.id,
            dueDate: '2026-10-25',
            selections: [{ saleId: sA.id, items: [{ itemIndex: 0, quantity: 3 }] }]
          },
          adminUser
        ),
      /excede o saldo não faturado/i,
      'Não pode faturar 3 unidades se 1 já foi faturada'
    );

    // Cenário 4: Segunda fatura individual para o mesmo aluno com saldo restante da sA
    const indRes2 = db.createIndividualInvoice(
      {
        studentId: targetStudent.id,
        dueDate: '2026-10-25',
        billingLabel: 'Fatura Parcial 2',
        selections: [
          {
            saleId: sA.id,
            items: [
              { itemIndex: 0, quantity: 2 },
              { itemIndex: 1, quantity: 1 }
            ]
          }
        ]
      },
      adminUser
    );
    assert.notEqual(indRes2.invoice.id, indRes1.invoice.id);
    assert.equal(sA.billingStatus, 'TOTALMENTE_FATURADA', 'Venda sA deve atingir 100% faturada');

    // Tentar faturar sA novamente após 100% faturada deve falhar
    assert.throws(
      () =>
        db.createIndividualInvoice(
          {
            studentId: targetStudent.id,
            dueDate: '2026-10-28',
            selections: [{ saleId: sA.id }]
          },
          adminUser
        ),
      /não é elegível/i
    );

    // Cenário 5 & 8: Período Personalizado respeitando fuso America/Sao_Paulo (2026-10-10 a 2026-10-10)
    // sB ocorreu às 00:15 BRT de 2026-10-11, portanto NÃO deve entrar em 2026-10-10..2026-10-10!
    // sStudent2 ocorreu em 2026-10-10, sPixUpfront (PIX) e sReversed (REVERSED) são ignoradas!
    const periodPrev10 = db.previewPeriodBilling({
      mode: 'PERIODO_PERSONALIZADO',
      periodStart: '2026-10-10',
      periodEnd: '2026-10-10',
      dueDate: '2026-10-22',
      scope: 'ALL_STUDENTS'
    });
    assert.equal(periodPrev10.invoicesToCreateCount, 1, 'Somente student2 deve ter consumo elegível em 2026-10-10');
    const st2Preview = periodPrev10.students.find(s => s.studentId === student2.id)!;
    assert.equal(st2Preview.netConsumptionToBill, sStudent2.total);
    assert.equal(st2Preview.reversalsTotal, sReversed.total);

    // Cenário 6 & 10: Lote por Período Personalizado com seleção/exclusão e idempotência
    const batchIdemp = `batch-per-${Date.now()}`;
    const execPer1 = db.executePeriodBilling(
      {
        mode: 'PERIODO_PERSONALIZADO',
        periodStart: '2026-10-10',
        periodEnd: '2026-10-12',
        dueDate: '2026-10-25',
        scope: 'EXCLUDE_STUDENTS',
        excludedStudentIds: [student3.id],
        idempotencyKey: batchIdemp
      },
      managerUser
    );
    assert.equal(execPer1.invoicesCreated, 2, 'Deve gerar faturas para targetStudent (sB) e student2 (sStudent2)');
    assert.equal(execPer1.batch.type, 'PERIODO_PERSONALIZADO');

    const execPerRepeat = db.executePeriodBilling(
      {
        mode: 'PERIODO_PERSONALIZADO',
        periodStart: '2026-10-10',
        periodEnd: '2026-10-12',
        dueDate: '2026-10-25',
        scope: 'EXCLUDE_STUDENTS',
        excludedStudentIds: [student3.id],
        idempotencyKey: batchIdemp
      },
      managerUser
    );
    assert.equal(execPerRepeat.deduplicated, true, 'Reprocessamento com mesma chave de idempotência não deve duplicar lote');
    assert.equal(execPerRepeat.batch.id, execPer1.batch.id);

    // Cenário 7: Fechamento Mensal unificado e detecção de consumo retroativo em período fechado
    const closingPrevOct = db.getMonthlyClosingPreview('2026-10');
    assert.equal(closingPrevOct.batchPreview?.invoicesToCreateCount, 1, 'Apenas student3 (sStudent3) segue em aberto em 2026-10');
    const closingExecOct = db.executeMonthlyClosing('2026-10', adminUser);
    assert.equal(closingExecOct.invoicesCreated, 1);

    // Inserir compra retroativa dentro do mês fechado 2026-10 para student3
    const sRetro = db.registerSale({
      studentId: student3.id,
      items: [{ productId: targetProduct.id, quantity: 1 }],
      paymentMethod: 'CONTA_ALUNO',
      operatorUser: adminUser,
      idempotencyKey: `fat-retro-${Date.now()}`
    }).sale;
    sRetro.createdAt = '2026-10-18T12:00:00.000Z';
    const unbilledOverview = db.getUnbilledConsumptionOverview();
    assert.ok(unbilledOverview.retroactiveClosedPeriodSalesCount >= 1, 'Deve alertar compra retroativa em competência fechada');
    assert.ok(unbilledOverview.closedPeriods.includes('2026-10'));

    // Cenário 9: Aluno sem responsável vinculado com regra GUARDIAN_ONLY bloqueia
    const originalGuardians = [...student3.guardians];
    const originalPayerRule = student3.payerRule;
    db.updateStudentSettings(student3.id, { guardians: [], payerRule: 'GUARDIAN_ONLY' }, adminUser);
    assert.throws(
      () =>
        db.createIndividualInvoice(
          {
            studentId: student3.id,
            dueDate: '2026-10-30',
            selections: [{ saleId: sRetro.id }]
          },
          adminUser
        ),
      /não possui responsável vinculado/i
    );
    db.updateStudentSettings(student3.id, { guardians: originalGuardians, payerRule: originalPayerRule }, adminUser);

    // Cenário 11: Cancelamento controlado preserva histórico e devolve compra à fila
    const invToCancel = closingExecOct.invoices[0];
    const canceledInv = db.cancelInvoice(invToCancel.id, 'Cancelamento de teste para devolução de itens', adminUser);
    assert.equal(canceledInv.status, 'CANCELADA');
    assert.equal(sStudent3.billingStatus, 'AGUARDANDO_FATURAMENTO', 'Venda devolvida deve voltar a aguardar faturamento');
    assert.equal(sStudent3.invoiceId, undefined);

    // Cenário 12 & 13: Reenvio de notificação desacoplado + Pagamento Pix quitando fatura
    const notifRetryRes = db.retryInvoiceNotification(indRes1.invoice.id, adminUser);
    assert.equal(notifRetryRes.invoiceId, indRes1.invoice.id);

    const pixPay = db.submitPixPayment({
      invoiceId: indRes1.invoice.id,
      amount: indRes1.invoice.remainingBalance,
      transactionReference: 'E2E-TESTE-PIX-001',
      user: adminUser
    });
    const reviewRes = db.reviewPixPayment({
      paymentId: pixPay.id,
      decision: 'APROVADO',
      reason: 'Confirmado em teste',
      reviewerUser: adminUser
    });
    assert.equal(reviewRes.invoice.status, 'PAGA');
    assert.equal(reviewRes.invoice.remainingBalance, 0);

    // Notificação de cobrança não deve ser reenviada após quitação
    assert.throws(
      () => db.retryInvoiceNotification(indRes1.invoice.id, adminUser),
      /quitadas ou canceladas/i
    );

    // Cenário 14: RBAC Completo para módulo de faturas
    const viewerSaleAttempt = await handleApiRoute({
      method: 'POST',
      url: '/api/sales',
      body: { studentId: targetStudent.id, items: [{ productId: targetProduct.id, quantity: 1 }] },
      user: viewerUser,
    });
    assert.equal(viewerSaleAttempt.status, 403);

    const cashierSettingsAttempt = await handleApiRoute({
      method: 'PUT',
      url: '/api/settings',
      body: { storeName: 'Alterado Indevidamente' },
      user: cashierUser,
    });
    assert.equal(cashierSettingsAttempt.status, 403);

    const managerCashGet = await handleApiRoute({ method: 'GET', url: '/api/cash', user: managerUser });
    assert.equal(managerCashGet.status, 200);

    const stockistInvAttempt = await handleApiRoute({ method: 'GET', url: '/api/invoices', user: stockistUser });
    assert.equal(stockistInvAttempt.status, 403, 'STOCKIST não pode acessar faturas individuais de alunos');

    const cashierOverviewGet = await handleApiRoute({ method: 'GET', url: '/api/invoices/overview', user: cashierUser });
    assert.equal(cashierOverviewGet.status, 200, 'CASHIER pode fazer consulta básica');

    const cashierEmitAttempt = await handleApiRoute({
      method: 'POST',
      url: '/api/invoices/period-execute',
      body: { mode: 'PERIODO_PERSONALIZADO', periodStart: '2026-10-01', periodEnd: '2026-10-31' },
      user: cashierUser
    });
    assert.equal(cashierEmitAttempt.status, 403, 'CASHIER não pode emitir lotes de faturamento');

    const viewerEmitAttempt = await handleApiRoute({
      method: 'POST',
      url: '/api/invoices/individual',
      body: { studentId: student3.id, dueDate: '2026-10-30', selections: [] },
      user: viewerUser
    });
    assert.equal(viewerEmitAttempt.status, 403, 'VIEWER não pode emitir fatura individual');

    const studentInvoicesGet = await handleApiRoute({
      method: 'GET',
      url: '/api/invoices',
      user: { id: `user-${targetStudent.id}`, name: targetStudent.name, role: 'STUDENT', studentId: targetStudent.id }
    });
    assert.equal(studentInvoicesGet.status, 200);
    assert.ok(
      (studentInvoicesGet.data as any[]).every(i => i.studentId === targetStudent.id),
      'STUDENT só pode visualizar suas próprias faturas'
    );

    // Cenário 15: Mapeamento Supabase consistente
    const mappedSale = mapSaleToSupabase(sA);
    assert.equal(mappedSale.billing_status, 'TOTALMENTE_FATURADA');
    const mappedInv = mapInvoiceToSupabase(indRes1.invoice);
    assert.equal(mappedInv.billing_type, 'INDIVIDUAL');
    const mappedBatch = mapBillingBatchToSupabase(execPer1.batch);
    assert.equal(mappedBatch.type, 'PERIODO_PERSONALIZADO');

    console.log('✅ Todos os cenários críticos (PDV, Caixa, Faturamento Individual/Parcial, Período BRT, Fechamento Unificado, Cancelamento Controlado, Notificações, Pix, RBAC e Supabase) passaram com sucesso!');
  } finally {
    // Aguardar microtasks pendentes de persistência antes de restaurar snapshot original
    await new Promise(resolve => setTimeout(resolve, 150));
    if (originalDbExists && originalDbSnapshot !== null) {
      fs.writeFileSync(DB_FILE, originalDbSnapshot, 'utf-8');
    }
  }
}

runTests().catch(err => {
  console.error('❌ Falha nos testes críticos:', err);
  process.exit(1);
});
