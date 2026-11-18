import { GoogleGenAI } from '@google/genai';
import { db } from './db.ts';
import type { UserRole } from '../types/index.ts';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY não configurada no servidor. Configure a variável em Settings > Secrets antes de usar o ICEVES Inteligência.'
    );
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

export interface AiChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AiAssistantParams {
  question: string;
  history?: AiChatMessage[];
  user: {
    id: string;
    name: string;
    role: UserRole;
    studentId?: string;
    guardianId?: string;
  };
}

function buildRoleScopedContext(user: AiAssistantParams['user']): string {
  const now = new Date();
  const todayStr = now.toISOString().substring(0, 10);
  const monthStr = now.toISOString().substring(0, 7);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const allProducts = db.getProducts().filter(p => !p.archived && p.status === 'ACTIVE');
  const allSales = db.getSales();
  const allInvoices = db.getInvoices();
  const allStudents = db.getStudents();
  const allPix = db.getPixPayments();

  // Strictly scope data by user role (read-only)
  if (user.role === 'STUDENT') {
    const student =
      allStudents.find(s => s.id === user.studentId) ||
      allStudents.find(s => s.name.toLowerCase() === user.name.toLowerCase());
    if (!student) {
      return JSON.stringify({ scope: 'STUDENT', message: 'Cadastro do aluno não localizado.' });
    }
    const mySales = allSales.filter(s => s.studentId === student.id && s.status === 'COMPLETED');
    const myInvoices = allInvoices.filter(i => i.studentId === student.id && i.status !== 'CANCELADA');
    return JSON.stringify({
      scope: 'STUDENT_ONLY',
      generatedAt: now.toISOString(),
      student: {
        name: student.name,
        registrationNumber: student.registrationNumber,
        currentConsumptionBalance: student.currentConsumptionBalance,
        creditBalance: student.creditBalance || 0,
        consumptionLimit: student.consumptionLimit || null,
        totalOpenDebt: student.totalOpenDebt,
      },
      recentPurchases: mySales.slice(0, 15).map(s => ({
        id: s.id,
        date: s.createdAt,
        total: s.total,
        paymentMethod: s.paymentMethod || 'CONTA_ALUNO',
        items: s.items.map(i => `${i.quantity}x ${i.name}`),
      })),
      invoices: myInvoices.map(i => ({
        id: i.id,
        period: i.billingPeriod,
        status: i.status,
        grossTotal: i.grossTotal,
        paidTotal: i.paidTotal,
        remainingBalance: i.remainingBalance,
        dueDate: i.dueDate,
      })),
    });
  }

  if (user.role === 'GUARDIAN') {
    const guardian = db.getGuardians().find(g => g.id === user.guardianId);
    const allowedIds = guardian?.studentIds || [];
    const linkedStudents = allStudents.filter(s => allowedIds.includes(s.id));
    const linkedSales = allSales.filter(s => allowedIds.includes(s.studentId) && s.status === 'COMPLETED');
    const linkedInvoices = allInvoices.filter(i => allowedIds.includes(i.studentId) && i.status !== 'CANCELADA');

    return JSON.stringify({
      scope: 'GUARDIAN_LINKED_STUDENTS',
      generatedAt: now.toISOString(),
      guardianName: guardian?.name || user.name,
      linkedStudents: linkedStudents.map(s => ({
        name: s.name,
        registrationNumber: s.registrationNumber,
        currentConsumptionBalance: s.currentConsumptionBalance,
        creditBalance: s.creditBalance || 0,
        totalOpenDebt: s.totalOpenDebt,
      })),
      recentPurchases: linkedSales.slice(0, 20).map(s => ({
        id: s.id,
        studentName: s.studentName,
        date: s.createdAt,
        total: s.total,
        paymentMethod: s.paymentMethod || 'CONTA_ALUNO',
        items: s.items.map(i => `${i.quantity}x ${i.name}`),
      })),
      invoices: linkedInvoices.map(i => ({
        id: i.id,
        studentName: i.studentName,
        period: i.billingPeriod,
        status: i.status,
        grossTotal: i.grossTotal,
        paidTotal: i.paidTotal,
        remainingBalance: i.remainingBalance,
        dueDate: i.dueDate,
      })),
    });
  }

  // Operational / Staff / Admin / Manager / Stockist / Cashier / Viewer
  const completedSales = allSales.filter(s => s.status === 'COMPLETED');
  const todaySales = completedSales.filter(s => s.createdAt.startsWith(todayStr));
  const weekSales = completedSales.filter(s => s.createdAt >= weekAgo);
  const monthSales = completedSales.filter(s => s.createdAt.startsWith(monthStr));

  const sumTotals = (list: typeof completedSales) =>
    Math.round(list.reduce((acc, s) => acc + (Number(s.total) || 0), 0) * 100) / 100;

  // Product sales ranking (last 30 days / all completed)
  const productPerf = new Map<string, { name: string; category: string; qtySold: number; revenue: number; stock: number }>();
  for (const p of allProducts) {
    productPerf.set(p.id, {
      name: p.name,
      category: p.category,
      qtySold: 0,
      revenue: 0,
      stock: p.currentStock,
    });
  }
  for (const sale of completedSales) {
    for (const item of sale.items) {
      const existing = productPerf.get(item.productId) || {
        name: item.name,
        category: item.category,
        qtySold: 0,
        revenue: 0,
        stock: 0,
      };
      existing.qtySold += item.quantity;
      existing.revenue = Math.round((existing.revenue + item.subtotal) * 100) / 100;
      productPerf.set(item.productId, existing);
    }
  }

  const perfArray = Array.from(productPerf.values());
  const topProducts = [...perfArray]
    .filter(p => p.qtySold > 0)
    .sort((a, b) => b.qtySold - a.qtySold)
    .slice(0, 12);
  const slowOrNoTurnProducts = [...perfArray]
    .filter(p => p.stock > 0 && p.qtySold === 0)
    .slice(0, 15);

  const lowStockProducts = allProducts
    .filter(p => p.currentStock > 0 && p.currentStock <= p.minStock)
    .map(p => ({ name: p.name, category: p.category, currentStock: p.currentStock, minStock: p.minStock }));
  const outOfStockProducts = allProducts
    .filter(p => p.currentStock === 0)
    .map(p => ({ name: p.name, category: p.category, minStock: p.minStock }));

  const paymentBreakdown: Record<string, { count: number; total: number }> = {};
  for (const s of monthSales) {
    const pm = s.paymentMethod || 'CONTA_ALUNO';
    if (!paymentBreakdown[pm]) paymentBreakdown[pm] = { count: 0, total: 0 };
    paymentBreakdown[pm].count += 1;
    paymentBreakdown[pm].total = Math.round((paymentBreakdown[pm].total + s.total) * 100) / 100;
  }

  const baseOperationalContext: Record<string, unknown> = {
    scope: user.role,
    generatedAt: now.toISOString(),
    catalogSummary: {
      totalActiveProducts: allProducts.length,
      totalUnitsInStock: allProducts.reduce((acc, p) => acc + p.currentStock, 0),
      pendingPriceCount: allProducts.filter(p => p.priceStatus === 'PENDING' || p.price == null).length,
      lowStockCount: lowStockProducts.length,
      outOfStockCount: outOfStockProducts.length,
    },
    lowStockProducts: lowStockProducts.slice(0, 20),
    outOfStockProducts: outOfStockProducts.slice(0, 20),
    topSellingProducts: topProducts,
    zeroTurnProductsSample: slowOrNoTurnProducts,
    salesSummary: {
      todayCount: todaySales.length,
      todayTotal: sumTotals(todaySales),
      last7DaysCount: weekSales.length,
      last7DaysTotal: sumTotals(weekSales),
      monthCount: monthSales.length,
      monthTotal: sumTotals(monthSales),
      monthAverageTicket:
        monthSales.length > 0 ? Math.round((sumTotals(monthSales) / monthSales.length) * 100) / 100 : 0,
      monthPaymentBreakdown: paymentBreakdown,
    },
  };

  // Financial & customer-debt details reserved for ADMIN, MANAGER, CASHIER, VIEWER (hidden from pure STOCKIST)
  if (user.role !== 'STOCKIST') {
    const openStudents = allStudents
      .filter(s => s.currentConsumptionBalance > 0 || s.totalOpenDebt > 0)
      .sort((a, b) => b.totalOpenDebt - a.totalOpenDebt)
      .map(s => ({
        name: s.name,
        registrationNumber: s.registrationNumber,
        currentConsumptionBalance: s.currentConsumptionBalance,
        creditBalance: s.creditBalance || 0,
        totalOpenDebt: s.totalOpenDebt,
        consumptionBlocked: Boolean(s.consumptionBlocked),
      }));

    const openInvoices = allInvoices.filter(
      i => i.status !== 'PAGA' && i.status !== 'CANCELADA' && i.remainingBalance > 0
    );

    const activeCash = db.getActiveCashSession();
    const cashMovs = activeCash
      ? db.getCashMovements().filter(m => m.sessionId === activeCash.id)
      : [];

    baseOperationalContext.individualConsumption = {
      studentsWithOpenBalanceCount: openStudents.length,
      totalUnbilledConsumption: Math.round(
        allStudents.reduce((acc, s) => acc + (Number(s.currentConsumptionBalance) || 0), 0) * 100
      ) / 100,
      topDebtors: openStudents.slice(0, 15),
    };

    baseOperationalContext.invoicesAndPix = {
      openInvoicesCount: openInvoices.length,
      openInvoicesTotalRemaining: Math.round(
        openInvoices.reduce((acc, i) => acc + i.remainingBalance, 0) * 100
      ) / 100,
      pendingPixReviewCount: allPix.filter(p => p.status === 'AGUARDANDO_CONFERENCIA').length,
    };

    baseOperationalContext.cashRegister = activeCash
      ? {
          status: 'ABERTO',
          sessionId: activeCash.id,
          openedAt: activeCash.openedAt,
          openedBy: activeCash.openedByUserName,
          openingBalance: activeCash.openingBalance,
          movementsCount: cashMovs.length,
        }
      : { status: 'FECHADO' };
  }

  return JSON.stringify(baseOperationalContext);
}

export async function askIcevesAssistant(params: AiAssistantParams): Promise<{
  answer: string;
  model: string;
  generatedAt: string;
}> {
  const question = (params.question || '').trim();
  if (!question) {
    throw new Error('Digite uma pergunta para o assistente ICEVES Inteligência.');
  }

  const ai = getGeminiClient();
  const contextJson = buildRoleScopedContext(params.user);

  const systemInstruction = `Você é o "ICEVES Inteligência", assistente analítico oficial da Lojinha ICEVES (Escola de Cristo - ICEVES).
REGRAS ESTRITAS:
1. Responda exclusivamente em português brasileiro claro, profissional, objetivo e amigável.
2. Baseie todas as respostas ÚNICA E EXCLUSIVAMENTE nos dados reais fornecidos no contexto JSON abaixo. Nunca invente números, produtos, alunos ou faturamentos.
3. Você é estritamente SOMENTE LEITURA: nunca afirme que alterou saldos, fechou caixa, criou vendas ou modificou estoque. Se o usuário pedir alterações, oriente em qual módulo do sistema fazer (PDV, Estoque, Caixa ou Alunos).
4. Formate valores monetários em Real (R$ 0,00) e destaque métricas importantes em listas objetivas quando útil.
5. Se uma informação solicitada não constar no contexto autorizado para o perfil (${params.user.role}), informe com transparência que o dado não está disponível para o seu perfil ou não possui registros no período.

CONTEXTO REAL AUTORIZADO DO SISTEMA:
${contextJson}`;

  const historyText = Array.isArray(params.history) && params.history.length > 0
    ? params.history
        .slice(-6)
        .map(h => `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.text}`)
        .join('\n')
    : '';

  const promptContents = historyText
    ? `Histórico recente:\n${historyText}\n\nPergunta atual do usuário (${params.user.name} - Perfil ${params.user.role}):\n${question}`
    : `Pergunta do usuário (${params.user.name} - Perfil ${params.user.role}):\n${question}`;

  const model = 'gemini-4-hydrogen';
  const response = await ai.models.generateContent({
    model,
    contents: promptContents,
    config: {
      systemInstruction,
    },
  });

  const answer = (response.text || '').trim();
  if (!answer) {
    throw new Error('O modelo não retornou resposta textual. Tente reformular a pergunta.');
  }

  db.logAudit(
    params.user.id,
    params.user.name,
    params.user.role,
    'CONSULTA_IA',
    'IA_GEMINI',
    `Consulta ao ICEVES Inteligência (${model}): "${question.slice(0, 120)}${question.length > 120 ? '...' : ''}"`
  );

  return {
    answer,
    model,
    generatedAt: new Date().toISOString(),
  };
}
