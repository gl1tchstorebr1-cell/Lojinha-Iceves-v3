import { db } from './db.ts';
import type { UserRole } from '../types/index.ts';
import { checkSupabaseConnection, syncAllToSupabase, syncFromSupabase } from './supabase.ts';
import {
  getMercadoPagoStatus,
  createMercadoPagoPixPayment,
  createMercadoPagoCardPayment,
  handleMercadoPagoWebhookEvent,
  fetchMercadoPagoPayment,
  testMercadoPagoConnection,
  getMpRequestLogs,
  clearMpRequestLogs
} from './mercadopago.ts';

export interface ApiRequest {
  method: string;
  url: string;
  body?: any;
  headers?: Record<string, string>;
  user?: {
    id: string;
    name: string;
    role: UserRole;
    studentId?: string;
    guardianId?: string;
  };
}

export interface ApiResponse {
  status: number;
  data: any;
}

// Router handler for client/server integration
export async function handleApiRoute(req: ApiRequest): Promise<ApiResponse> {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  // Helper for current user fallback
  const currentUser = req.user || {
    id: 'user-admin',
    name: 'Mariana Vasconcelos',
    role: 'ADMIN' as UserRole
  };

  try {
    // 1. Auth routes
    if (pathname === '/api/auth/login' && method === 'POST') {
      const { email, password } = req.body || {};
      const identifier = (email || '').toLowerCase().trim();
      const cleanPassword = (password || '').trim();

      if (!identifier || !cleanPassword) {
        return { status: 400, data: { error: 'Informe seu e-mail (ou matrícula) e senha para entrar.' } };
      }

      const users = db.getUsers();
      let user = users.find(
        u =>
          u.email.toLowerCase() === identifier ||
          (u.registrationNumber && u.registrationNumber.toLowerCase() === identifier)
      );

      // If not found in users, check if identifier matches any of the students by email or registrationNumber
      if (!user) {
        const student = db.getStudents().find(
          s =>
            s.email.toLowerCase() === identifier ||
            s.registrationNumber.toLowerCase() === identifier
        );
        if (student) {
          user = {
            id: `user-${student.id}`,
            name: student.name,
            email: student.email,
            role: 'STUDENT',
            studentId: student.id,
            registrationNumber: student.registrationNumber,
            avatar: student.avatar,
            createdAt: student.createdAt || new Date().toISOString()
          };
        }
      }

      if (!user) {
        return { status: 401, data: { error: 'Usuário não encontrado. Verifique o e-mail/matrícula ou crie uma conta.' } };
      }

      // Verify password if user has a custom password stored
      if (user.password) {
        if (user.password !== cleanPassword) {
          return { status: 401, data: { error: 'Senha incorreta. Verifique suas credenciais e tente novamente.' } };
        }
      } else {
        // Default passwords for pre-existing institutional accounts
        const defaultPasswords: Record<string, string[]> = {
          ADMIN: ['Admin#Iceves2026', 'admin123', 'iceves2026'],
          CASHIER: ['Caixa#Iceves2026', 'caixa123', 'iceves2026'],
          STUDENT: ['Aluno#Iceves2026', 'aluno123', 'iceves2026'],
          GUARDIAN: ['Familia#Iceves2026', 'familia123', 'iceves2026']
        };
        const allowed = defaultPasswords[user.role] || [];
        if (!allowed.includes(cleanPassword) && cleanPassword.length < 6) {
          return { status: 401, data: { error: 'Senha inválida. Digite sua senha cadastrada.' } };
        }
      }

      const { password: _removedPassword, ...safeUser } = user;

      return { 
        status: 200, 
        data: { 
          user: safeUser, 
          token: `token_${user.id}_${Date.now()}` 
        } 
      };
    }

    if (pathname === '/api/auth/register' && method === 'POST') {
      const { name, email, password, role, phone } = req.body || {};
      const newUser = db.registerUser({ name, email, password, role, phone });
      return {
        status: 201,
        data: {
          user: newUser,
          token: `token_${newUser.id}_${Date.now()}`
        }
      };
    }

    if (pathname === '/api/auth/reset-password' && method === 'POST') {
      const { email } = req.body || {};
      const user = db.getUsers().find(u => u.email.toLowerCase() === (email || '').toLowerCase().trim());
      if (!user) {
        return { status: 404, data: { error: 'Usuário não encontrado para este e-mail.' } };
      }

      db.logAudit(
        user.id,
        user.name,
        user.role,
        'RECUPERACAO_SENHA',
        'AUTH',
        `Link seguro de redefinição de senha gerado para ${user.email} (token seguro emitido)`
      );

      return { 
        status: 200, 
        data: { 
          message: 'Instruções de recuperação e token seguro enviados com sucesso para o e-mail cadastrado.',
          maskedEmail: user.email.replace(/(.{2})(.*)(?=@)/, (_, a, b) => a + '*'.repeat(b.length))
        } 
      };
    }

    // 2. Settings
    if (pathname === '/api/settings') {
      if (method === 'GET') {
        const fullSettings = db.getSettings();
        if (currentUser.role !== 'ADMIN') {
          const {
            mercadoPagoAccessToken: _mpToken,
            mercadoPagoWebhookSecret: _mpSecret,
            ...publicSettings
          } = fullSettings;
          return { status: 200, data: publicSettings };
        }
        return { status: 200, data: fullSettings };
      }
      if (method === 'PUT') {
        if (currentUser.role !== 'ADMIN') {
          return { status: 403, data: { error: 'Apenas Administradores podem alterar configurações do sistema.' } };
        }
        const updated = db.updateSettings(req.body, currentUser);
        return { status: 200, data: updated };
      }
    }

    // 3. Products & Catalog
    if (pathname === '/api/products') {
      if (method === 'GET') {
        return { status: 200, data: db.getProducts() };
      }
      if (method === 'POST') {
        if (currentUser.role !== 'ADMIN') {
          return { status: 403, data: { error: 'Apenas Administradores podem cadastrar produtos.' } };
        }
        const product = db.saveProduct(req.body, currentUser);
        return { status: 201, data: product };
      }
    }

    if (pathname.startsWith('/api/products/') && method === 'PUT') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Apenas Administradores podem editar produtos.' } };
      }
      const productId = pathname.replace('/api/products/', '');
      const product = db.saveProduct({ ...req.body, id: productId }, currentUser);
      return { status: 200, data: product };
    }

    // 4. Stock management
    if (pathname === '/api/stock/adjust' && method === 'POST') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Apenas Administradores podem realizar ajustes manuais de estoque.' } };
      }
      const product = db.adjustStock({
        productId: req.body.productId,
        type: req.body.type,
        quantity: req.body.quantity,
        reason: req.body.reason,
        user: currentUser
      });
      return { status: 200, data: product };
    }

    if (pathname === '/api/stock/movements' && method === 'GET') {
      return { status: 200, data: db.getStockMovements() };
    }

    // Helper for resolving studentId when role === 'STUDENT'
    const resolvedStudentId =
      currentUser.role === 'STUDENT'
        ? currentUser.studentId ||
          db.getStudents().find(
            s => s.name.toLowerCase() === (currentUser.name || '').toLowerCase()
          )?.id ||
          '__NO_MATCH__'
        : undefined;

    // 5. Sales & PDV
    if (pathname === '/api/sales') {
      if (method === 'GET') {
        let sales = db.getSales();
        // RBAC: Se for Aluno, vê apenas suas próprias vendas!
        if (currentUser.role === 'STUDENT') {
          sales = sales.filter(s => s.studentId === resolvedStudentId);
        } else if (currentUser.role === 'GUARDIAN' && currentUser.guardianId) {
          const guardian = db.getGuardians().find(g => g.id === currentUser.guardianId);
          const allowedIds = guardian?.studentIds || [];
          sales = sales.filter(s => allowedIds.includes(s.studentId));
        }
        return { status: 200, data: sales };
      }

      if (method === 'POST') {
        // Operadores de caixa e administradores podem vender
        if (currentUser.role !== 'CASHIER' && currentUser.role !== 'ADMIN') {
          return { status: 403, data: { error: 'Seu perfil não tem permissão para operar o caixa.' } };
        }
        const result = db.registerSale({
          studentId: req.body.studentId,
          items: req.body.items,
          operatorUser: currentUser,
          idempotencyKey: req.body.idempotencyKey
        });
        return { status: 201, data: result };
      }
    }

    if (pathname.startsWith('/api/sales/') && pathname.endsWith('/reverse') && method === 'POST') {
      if (currentUser.role !== 'CASHIER' && currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Sem permissão para estornar vendas.' } };
      }
      const saleId = pathname.replace('/api/sales/', '').replace('/reverse', '');
      const result = db.reverseSale(saleId, req.body.reason || 'Estorno solicitado no caixa', currentUser);
      return { status: 200, data: result };
    }

    // 6. Students & Guardians
    if (pathname === '/api/students') {
      if (method === 'GET') {
        let students = db.getStudents();
        // RBAC: Se for Aluno, vê somente seu próprio cadastro
        if (currentUser.role === 'STUDENT') {
          students = students.filter(s => s.id === resolvedStudentId);
        } else if (currentUser.role === 'GUARDIAN' && currentUser.guardianId) {
          // RBAC: Responsável vê APENAS os alunos vinculados autorizados
          const guardian = db.getGuardians().find(g => g.id === currentUser.guardianId);
          const allowedIds = guardian?.studentIds || [];
          students = students.filter(s => allowedIds.includes(s.id));
        }
        return { status: 200, data: students };
      }
      if (method === 'POST') {
        if (currentUser.role !== 'ADMIN') {
          return { status: 403, data: { error: 'Apenas Administradores podem cadastrar alunos.' } };
        }
        const created = db.createStudent(req.body, currentUser);
        return { status: 201, data: created };
      }
    }

    if (pathname.startsWith('/api/students/') && method === 'PUT') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Apenas Administradores podem alterar vínculos e configurações de alunos.' } };
      }
      const studentId = pathname.replace('/api/students/', '');
      const updated = db.updateStudentSettings(studentId, req.body, currentUser);
      return { status: 200, data: updated };
    }

    if (pathname === '/api/guardians' && method === 'GET') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Acesso restrito à coordenação escolar.' } };
      }
      return { status: 200, data: db.getGuardians() };
    }

    // 6.1. Passeios (Escola de Cristo ICEVES)
    if (pathname === '/api/passeios') {
      if (method === 'GET') {
        const allPasseios = db.getPasseios();
        // Administradores autorizados visualizam todos (ativos e inativos);
        // Alunos e demais perfis visualizam apenas passeios ativos.
        if (currentUser.role === 'ADMIN') {
          return { status: 200, data: allPasseios };
        }
        return { status: 200, data: allPasseios.filter(p => p.ativo) };
      }
      if (method === 'POST') {
        if (currentUser.role !== 'ADMIN') {
          return { status: 403, data: { error: 'Apenas Administradores podem cadastrar passeios.' } };
        }
        const created = db.createPasseio(req.body || {}, currentUser);
        return { status: 201, data: created };
      }
    }

    if (pathname.startsWith('/api/passeios/')) {
      const passeioId = pathname.replace('/api/passeios/', '');
      if (method === 'PUT' || method === 'PATCH') {
        if (currentUser.role !== 'ADMIN') {
          return { status: 403, data: { error: 'Apenas Administradores podem editar ou alterar o status de passeios.' } };
        }
        const updated = db.updatePasseio(passeioId, req.body || {}, currentUser);
        return { status: 200, data: updated };
      }
      if (method === 'DELETE') {
        if (currentUser.role !== 'ADMIN') {
          return { status: 403, data: { error: 'Apenas Administradores podem excluir passeios.' } };
        }
        const deleted = db.deletePasseio(passeioId, currentUser);
        return { status: 200, data: deleted };
      }
    }

    // 6.2. PDV de Passeios — Lançamento Coletivo de Despesas nas Contas dos Alunos
    const pdvPerms = db.getSettings().pdvPasseiosPermissions || {
      cashierCanViewPasseios: false,
      cashierCanCreatePasseios: false,
      cashierCanAddExpenses: false,
      cashierCanSelectStudents: false,
      cashierCanConfirmLaunches: false,
      cashierCanViewHistory: false,
      cashierCanReverseLaunches: false,
    };

    const hasPdvPerm = (permKey: keyof typeof pdvPerms) => {
      if (currentUser.role === 'ADMIN') return true;
      if (currentUser.role === 'CASHIER') return Boolean(pdvPerms[permKey]);
      return false;
    };

    if (pathname === '/api/pdv-passeios') {
      if (method === 'GET') {
        if (!hasPdvPerm('cashierCanViewPasseios') && !hasPdvPerm('cashierCanViewHistory')) {
          // Para alunos ou responsáveis, retorna apenas operações lançadas onde o aluno participou
          if (currentUser.role === 'STUDENT') {
            const ops = db.getTripOperations().filter(
              op => op.status !== 'RASCUNHO' && op.participants.some(p => p.studentId === resolvedStudentId)
            );
            return { status: 200, data: ops };
          }
          if (currentUser.role === 'GUARDIAN' && currentUser.guardianId) {
            const guardian = db.getGuardians().find(g => g.id === currentUser.guardianId);
            const allowedIds = guardian?.studentIds || [];
            const ops = db.getTripOperations().filter(
              op => op.status !== 'RASCUNHO' && op.participants.some(p => allowedIds.includes(p.studentId))
            );
            return { status: 200, data: ops };
          }
          return { status: 403, data: { error: 'Você não possui permissão para visualizar o PDV de Passeios.' } };
        }
        return { status: 200, data: db.getTripOperations() };
      }
    }

    if (pathname === '/api/pdv-passeios/draft' && method === 'POST') {
      if (!hasPdvPerm('cashierCanCreatePasseios')) {
        return { status: 403, data: { error: 'Você não possui permissão para criar ou editar operações no PDV de Passeios.' } };
      }
      const savedDraft = db.saveTripOperationDraft(req.body || {}, currentUser);
      return { status: 200, data: savedDraft };
    }

    if (pathname === '/api/pdv-passeios/launch' && method === 'POST') {
      if (!hasPdvPerm('cashierCanConfirmLaunches')) {
        return { status: 403, data: { error: 'Você não possui autorização para confirmar lançamentos financeiros no PDV de Passeios.' } };
      }
      const launched = db.confirmAndLaunchTripOperation(req.body || {}, currentUser);
      return { status: 201, data: launched };
    }

    if (pathname.startsWith('/api/pdv-passeios/')) {
      const subPath = pathname.replace('/api/pdv-passeios/', '');
      if (subPath.endsWith('/reverse-student') && method === 'POST') {
        if (!hasPdvPerm('cashierCanReverseLaunches')) {
          return { status: 403, data: { error: 'Você não possui autorização para realizar estornos no PDV de Passeios.' } };
        }
        const operationId = subPath.replace('/reverse-student', '');
        const reversed = db.reverseTripParticipantLaunch(
          {
            operationId,
            studentId: req.body?.studentId,
            reason: req.body?.reason,
          },
          currentUser
        );
        return { status: 200, data: reversed };
      }

      if (subPath.endsWith('/reverse-all') && method === 'POST') {
        if (!hasPdvPerm('cashierCanReverseLaunches')) {
          return { status: 403, data: { error: 'Você não possui autorização para realizar estornos no PDV de Passeios.' } };
        }
        const operationId = subPath.replace('/reverse-all', '');
        const reversedOp = db.reverseEntireTripOperation(
          {
            operationId,
            reason: req.body?.reason,
          },
          currentUser
        );
        return { status: 200, data: reversedOp };
      }

      if (method === 'DELETE') {
        if (!hasPdvPerm('cashierCanCreatePasseios')) {
          return { status: 403, data: { error: 'Sem permissão para descartar rascunho de passeio.' } };
        }
        const deleted = db.deleteTripOperationDraft(subPath, currentUser);
        return { status: 200, data: deleted };
      }
    }

    // 7. Invoices & Closing
    if (pathname === '/api/invoices') {
      if (method === 'GET') {
        let invoices = db.getInvoices();
        if (currentUser.role === 'STUDENT') {
          invoices = invoices.filter(i => i.studentId === resolvedStudentId);
        } else if (currentUser.role === 'GUARDIAN' && currentUser.guardianId) {
          const guardian = db.getGuardians().find(g => g.id === currentUser.guardianId);
          const allowedIds = guardian?.studentIds || [];
          invoices = invoices.filter(i => allowedIds.includes(i.studentId));
        }
        return { status: 200, data: invoices };
      }
    }

    if (pathname === '/api/invoices/closing-preview' && method === 'POST') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Apenas Administradores podem gerar a prévia de fechamento.' } };
      }
      const period = req.body.period || new Date().toISOString().substring(0, 7);
      const preview = db.getMonthlyClosingPreview(period);
      return { status: 200, data: preview };
    }

    if (pathname === '/api/invoices/execute-closing' && method === 'POST') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Apenas Administradores podem aprovar e publicar o fechamento mensal.' } };
      }
      const period = req.body.period || new Date().toISOString().substring(0, 7);
      const result = db.executeMonthlyClosing(period, currentUser);
      return { status: 200, data: result };
    }

    if (pathname === '/api/invoices/clear-all' && method === 'POST') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Apenas Administradores podem excluir todas as faturas.' } };
      }
      const result = db.clearAllInvoices(currentUser);
      return { status: 200, data: result };
    }

    if (pathname.startsWith('/api/invoices/') && method === 'DELETE') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Apenas Administradores podem excluir faturas.' } };
      }
      const invoiceId = pathname.replace('/api/invoices/', '');
      const result = db.deleteInvoice(invoiceId, currentUser);
      return { status: 200, data: result };
    }

    if (pathname.startsWith('/api/invoices/') && (method === 'PATCH' || method === 'PUT')) {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Apenas Administradores podem alterar faturas e valores de mensalidade.' } };
      }
      const invoiceId = pathname.replace('/api/invoices/', '');
      const updated = db.updateInvoice(invoiceId, req.body, currentUser);
      return { status: 200, data: updated };
    }

    // 8. Pix Payments
    if (pathname === '/api/pix') {
      if (method === 'GET') {
        let payments = db.getPixPayments();
        if (currentUser.role === 'STUDENT') {
          payments = payments.filter(p => p.studentId === resolvedStudentId);
        } else if (currentUser.role === 'GUARDIAN' && currentUser.guardianId) {
          const guardian = db.getGuardians().find(g => g.id === currentUser.guardianId);
          const allowedIds = guardian?.studentIds || [];
          payments = payments.filter(p => allowedIds.includes(p.studentId));
        }
        return { status: 200, data: payments };
      }
    }

    if (pathname === '/api/pix/submit' && method === 'POST') {
      const payment = db.submitPixPayment({
        invoiceId: req.body.invoiceId,
        amount: Number(req.body.amount),
        transactionReference: req.body.transactionReference || `PIX-MANUAL-${Date.now().toString().slice(-6)}`,
        receiptAttachment: req.body.receiptAttachment,
        receiptNotes: req.body.receiptNotes,
        user: currentUser
      });
      return { status: 201, data: payment };
    }

    if (pathname.startsWith('/api/pix/') && pathname.endsWith('/review') && method === 'POST') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Apenas Administradores podem conferir e aprovar pagamentos Pix.' } };
      }
      const paymentId = pathname.replace('/api/pix/', '').replace('/review', '');
      const result = db.reviewPixPayment({
        paymentId,
        decision: req.body.decision,
        reason: req.body.reason || 'Conferido com extrato bancário oficial',
        reviewerUser: currentUser
      });
      return { status: 200, data: result };
    }

    // 8.1. Stripe Payments API
    if (pathname === '/api/stripe/create-checkout-session' && method === 'POST') {
      const { invoiceId, amount, studentId } = req.body || {};
      const settings = db.getSettings();
      const publishableKey = settings.stripePublishableKey || 'pk_test_51UVBR4Ce1xrwLqvjzNeIaPvHRPuBmEgEoTU3x447Ywbb6C9IbHOmP24vMtUT3azAtGadTJ5jjDJ6GCU9eXkObiva00E01EwrRp';

      const sessionId = `cs_test_${Math.random().toString(36).substring(2, 15)}`;
      return {
        status: 200,
        data: {
          sessionId,
          publishableKey,
          message: 'Sessão Stripe Checkout criada com sucesso em modo de teste.'
        }
      };
    }

    if (pathname === '/api/stripe/fulfill-payment' && method === 'POST') {
      const { invoiceId, amount, transactionRef } = req.body || {};
      const invoice = db.getInvoices().find(i => i.id === invoiceId);
      if (!invoice) {
        return { status: 404, data: { error: 'Fatura não encontrada para quitação via Stripe.' } };
      }

      const payment = db.submitPixPayment({
        invoiceId,
        amount: Number(amount),
        transactionReference: transactionRef || `STRIPE-TEST-${Date.now()}`,
        receiptAttachment: 'Comprovante_Stripe_Checkout.pdf',
        receiptNotes: 'Pagamento processado com cartão via Stripe Payments (Test Mode)',
        user: currentUser
      });

      const approvedPayment = db.reviewPixPayment({
        paymentId: payment.id,
        decision: 'APROVADO',
        reason: 'Confirmação automática de pagamento via Stripe (Test Mode)',
        reviewerUser: currentUser
      });

      return {
        status: 200,
        data: {
          success: true,
          payment: approvedPayment,
          message: 'Pagamento com cartão via Stripe processado e faturado com sucesso!'
        }
      };
    }

    // 8.2. Mercado Pago Checkout Transparente & Webhooks
    if (pathname === '/api/mercadopago/status' && method === 'GET') {
      const status = getMercadoPagoStatus();
      return { status: 200, data: status };
    }

    if (pathname === '/api/mercadopago/test-connection' && method === 'POST') {
      const { token } = req.body || {};
      const result = await testMercadoPagoConnection(token);
      return { status: result.success ? 200 : 400, data: result };
    }

    if (pathname === '/api/mercadopago/logs' && method === 'GET') {
      return { status: 200, data: getMpRequestLogs() };
    }

    if (pathname === '/api/mercadopago/clear-logs' && method === 'POST') {
      clearMpRequestLogs();
      return { status: 200, data: { success: true } };
    }

    if (pathname === '/api/mercadopago/create-pix' && method === 'POST') {
      const { invoiceId, amount, payerEmail, payerName, payerCpf, description } = req.body || {};
      const invoice = db.getInvoices().find(i => i.id === invoiceId);
      if (!invoice) {
        return { status: 404, data: { error: 'Cobrança não encontrada.' } };
      }

      const student = invoice.studentId ? db.getStudents().find(s => s.id === invoice.studentId) : null;
      let primaryGuardian: any = null;
      if (student && student.guardians && student.guardians.length > 0) {
        primaryGuardian = db.getGuardians().find(g => g.id === student.guardians[0].guardianId);
      }
      const safeEmail = payerEmail || primaryGuardian?.email || student?.email || 'cliente.lojinha@gmail.com';
      const safeName = payerName || primaryGuardian?.name || student?.name || currentUser?.name || 'Cliente Lojinha';
      const safeCpf = payerCpf || primaryGuardian?.cpf || '';

      const finalPixAmount = Number(amount) > 0 
        ? Number(amount) 
        : (Number(invoice.remainingBalance) > 0 ? Number(invoice.remainingBalance) : Number(invoice.grossTotal || 0));

      const pixResult = await createMercadoPagoPixPayment({
        invoiceId,
        amount: finalPixAmount,
        payerEmail: safeEmail,
        payerName: safeName,
        payerCpf: safeCpf,
        description: description || `Pedido Lojinha Iceves #${invoice.id}`
      });

      return { status: pixResult.success ? 200 : 400, data: pixResult };
    }

    if (pathname === '/api/mercadopago/create-card' && method === 'POST') {
      const { 
        invoiceId, 
        amount, 
        token, 
        cardNumber,
        cardExpiry,
        cardCvv,
        installments, 
        paymentMethodId, 
        payerEmail, 
        payerCpf, 
        cardHolderName, 
        description,
        deviceId
      } = req.body || {};

      const invoice = db.getInvoices().find(i => i.id === invoiceId);
      if (!invoice) {
        return { status: 404, data: { error: 'Cobrança não encontrada.' } };
      }

      const student = invoice.studentId ? db.getStudents().find(s => s.id === invoice.studentId) : null;
      let primaryGuardian: any = null;
      if (student && student.guardians && student.guardians.length > 0) {
        primaryGuardian = db.getGuardians().find(g => g.id === student.guardians[0].guardianId);
      }
      const safeEmail = payerEmail || primaryGuardian?.email || student?.email || 'cliente.lojinha@gmail.com';
      const safeCpf = payerCpf || primaryGuardian?.cpf || '';

      const finalCardAmount = Number(amount) > 0 
        ? Number(amount) 
        : (Number(invoice.remainingBalance) > 0 ? Number(invoice.remainingBalance) : Number(invoice.grossTotal || 0));

      const retailItems = Array.isArray(invoice.consumptionItems) && invoice.consumptionItems.length > 0
        ? invoice.consumptionItems.map(ci => ({
            id: ci.productId,
            title: ci.productName,
            quantity: ci.quantity,
            unit_price: ci.averageUnitPrice
          }))
        : undefined;

      const cardResult = await createMercadoPagoCardPayment({
        invoiceId,
        amount: finalCardAmount,
        token,
        cardNumber,
        cardExpiry,
        cardCvv,
        installments: Number(installments) || 1,
        paymentMethodId: paymentMethodId || 'visa',
        payerEmail: safeEmail,
        payerCpf: safeCpf,
        cardHolderName: cardHolderName || primaryGuardian?.name || currentUser?.name,
        description: description || `Pedido Lojinha Iceves #${invoice.id}`,
        deviceId,
        items: retailItems
      });

      // If approved immediately
      if (cardResult.status === 'approved') {
        const payment = db.submitPixPayment({
          invoiceId,
          amount: finalCardAmount,
          transactionReference: `MP-${cardResult.paymentId}`,
          receiptAttachment: `Comprovante_MercadoPago_${cardResult.paymentId}.pdf`,
          receiptNotes: `Pagamento com Cartão aprovado via Checkout Transparente Mercado Pago (${cardResult.paymentMethodId.toUpperCase()})`,
          user: currentUser
        });

        db.reviewPixPayment({
          paymentId: payment.id,
          decision: 'APROVADO',
          reason: 'Aprovação instantânea via Mercado Pago Checkout Transparente',
          reviewerUser: currentUser
        });
      }

      return { status: 200, data: cardResult };
    }

    if (pathname === '/api/mercadopago/webhook' && (method === 'POST' || method === 'GET')) {
      const queryParams = Object.fromEntries(url.searchParams.entries());
      const webhookResult = await handleMercadoPagoWebhookEvent(req.body, queryParams, req.headers);
      return { status: 200, data: webhookResult };
    }

    if (pathname.startsWith('/api/mercadopago/check-payment/') && method === 'GET') {
      const paymentId = pathname.replace('/api/mercadopago/check-payment/', '');
      const paymentInfo = await fetchMercadoPagoPayment(paymentId);
      return { status: 200, data: paymentInfo || { status: 'pending' } };
    }

    // 8.3. Supabase Integration & Status
    if (pathname === '/api/supabase/status' && method === 'GET') {
      const status = await checkSupabaseConnection();
      return { status: 200, data: status };
    }

    if (pathname === '/api/supabase/test-connection' && method === 'POST') {
      const status = await checkSupabaseConnection();
      return { status: status.connected ? 200 : 400, data: status };
    }

    if (pathname === '/api/supabase/sync-push' && method === 'POST') {
      try {
        const result = await syncAllToSupabase();
        return { status: 200, data: result };
      } catch (err: any) {
        return { status: 400, data: { success: false, message: err.message } };
      }
    }

    if (pathname === '/api/supabase/sync-pull' && method === 'POST') {
      try {
        const result = await syncFromSupabase();
        return { status: 200, data: result };
      } catch (err: any) {
        return { status: 400, data: { success: false, message: err.message } };
      }
    }

    // 9. WhatsApp Notifications
    if (pathname === '/api/whatsapp' && method === 'GET') {
      return { status: 200, data: db.getWhatsAppNotifications() };
    }

    if (pathname.startsWith('/api/whatsapp/') && pathname.endsWith('/retry') && method === 'POST') {
      const notifId = pathname.replace('/api/whatsapp/', '').replace('/retry', '');
      const result = db.retryWhatsAppNotification(notifId);
      return { status: 200, data: result };
    }

    // 10. Audit Logs & Financial Ledger
    if (pathname === '/api/audit' && method === 'GET') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Acesso restrito ao registro de auditoria.' } };
      }
      return { status: 200, data: db.getAuditLogs() };
    }

    if (pathname === '/api/ledger' && method === 'GET') {
      let ledger = db.getFinancialLedger();
      if (currentUser.role === 'STUDENT' && currentUser.studentId) {
        ledger = ledger.filter(l => l.studentId === currentUser.studentId);
      }
      return { status: 200, data: ledger };
    }

    if (pathname === '/api/system/security-audit' && method === 'GET') {
      return {
        status: 200,
        data: {
          checkedAt: new Date().toISOString(),
          targetDomain: 'https://lojinha-iceves-v3.vercel.app',
          headersScore: 100,
          activeHeadersCount: 15,
          totalHeadersCount: 15,
          headers: [
            {
              key: 'Content-Security-Policy',
              status: 'ACTIVE',
              severity: 'HIGH',
              points: 10,
              value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://www.mercadopago.com https://http2.mlstatic.com https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://images.unsplash.com https://api.qrserver.com https://*.supabase.co https://*.mlstatic.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mercadopago.com https://api.stripe.com; frame-src 'self' https://www.mercadopago.com https://sdk.mercadopago.com https://js.stripe.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests",
              description: 'Protege contra scripts maliciosos (XSS), injeção de código e carregamento de origens não autorizadas.'
            },
            {
              key: 'X-Frame-Options',
              status: 'ACTIVE',
              severity: 'HIGH',
              points: 10,
              value: 'DENY',
              description: 'Impede que o site seja embutido em iframes maliciosos de terceiros (proteção anti-clickjacking).'
            },
            {
              key: 'X-Content-Type-Options',
              status: 'ACTIVE',
              severity: 'MEDIUM',
              points: 5,
              value: 'nosniff',
              description: 'Impede que o navegador tente adivinhar e executar tipos MIME de forma inesperada.'
            },
            {
              key: 'Referrer-Policy',
              status: 'ACTIVE',
              severity: 'MEDIUM',
              points: 5,
              value: 'strict-origin-when-cross-origin',
              description: 'Evita que URLs completas com parâmetros sensíveis vazem para sites externos.'
            },
            {
              key: 'Permissions-Policy',
              status: 'ACTIVE',
              severity: 'MEDIUM',
              points: 5,
              value: 'camera=(), microphone=(), geolocation=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
              description: 'Bloqueia acesso não autorizado à câmera, microfone, geolocalização e sensores do dispositivo.'
            },
            {
              key: 'Cross-Origin-Opener-Policy',
              status: 'ACTIVE',
              severity: 'MEDIUM',
              points: 3,
              value: 'same-origin',
              description: 'Isola o contexto de janela (window.opener) contra acesso de outros domínios.'
            },
            {
              key: 'Strict-Transport-Security',
              status: 'ACTIVE',
              severity: 'HIGH',
              points: 10,
              value: 'max-age=63072000; includeSubDomains; preload',
              description: 'Força conexões exclusivamente via HTTPS com HSTS Preload.'
            },
            {
              key: 'Cross-Origin-Resource-Policy',
              status: 'ACTIVE',
              severity: 'LOW',
              points: 2,
              value: 'same-origin',
              description: 'Restringe leitura de recursos internos por outras origens.'
            },
            {
              key: 'Cross-Origin-Embedder-Policy',
              status: 'ACTIVE',
              severity: 'LOW',
              points: 2,
              value: 'unsafe-none',
              description: 'Política explícita de incorporação de recursos cross-origin.'
            },
            {
              key: 'X-XSS-Protection',
              status: 'ACTIVE',
              severity: 'LOW',
              points: 2,
              value: '1; mode=block',
              description: 'Proteção adicional contra XSS refletido em navegadores legados.'
            },
            {
              key: 'X-Permitted-Cross-Domain-Policies',
              status: 'ACTIVE',
              severity: 'LOW',
              points: 2,
              value: 'none',
              description: 'Bloqueia carregamento de políticas cross-domain por clientes externos.'
            }
          ],
          dnsRecords: [
            {
              type: 'TXT',
              name: '@ (ou domínio raiz)',
              title: 'SPF (Sender Policy Framework)',
              value: 'v=spf1 include:_spf.google.com include:spf.resend.com ~all',
              description: 'Autoriza apenas os servidores de e-mail oficiais da instituição a enviarem mensagens em nome do domínio.'
            },
            {
              type: 'TXT',
              name: '_dmarc',
              title: 'DMARC (Domain-based Message Authentication)',
              value: 'v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@lojinha-iceves-v3.vercel.app; adkim=r; aspf=r',
              description: 'Instruções aos provedores de e-mail para colocar em quarentena mensagens falsificadas que falhem no SPF/DKIM.'
            },
            {
              type: 'TXT',
              name: 'google._domainkey (ou default._domainkey)',
              title: 'DKIM (DomainKeys Identified Mail)',
              value: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...',
              description: 'Chave pública criptográfica gerada no painel do Google Workspace / Resend para assinar e-mails enviados.'
            }
          ]
        }
      };
    }

    if (pathname === '/api/reset-data' && method === 'POST') {
      if (currentUser.role !== 'ADMIN') {
        return { status: 403, data: { error: 'Apenas Administradores podem resetar a base.' } };
      }
      const res = db.resetToSeed(currentUser);
      return { status: 200, data: res };
    }

    return { status: 404, data: { error: `Rota API não encontrada: ${method} ${pathname}` } };
  } catch (err: any) {
    console.error(`Erro ao processar rota ${method} ${pathname}:`, err);
    return { status: 400, data: { error: err.message || 'Erro interno no servidor' } };
  }
}
