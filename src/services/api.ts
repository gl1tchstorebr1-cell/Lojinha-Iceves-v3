import { 
  User, 
  UserRole,
  Product, 
  Sale, 
  Student, 
  Guardian, 
  Invoice, 
  PixPayment, 
  StockMovement, 
  FinancialTransaction, 
  WhatsAppNotification, 
  AuditLog, 
  SystemSettings, 
  MonthlyClosingPreview,
  Passeio,
  TripOperation,
  TripExpenseItem,
  TripParticipantAllocation,
  TripDistributionMethod,
  PaymentMethod,
  CashRegisterSession,
  CashMovement,
  BillingBatch,
  BillingBatchPreview,
  BillingPreviewSale,
  IndividualInvoicePayload,
  PeriodBillingPayload,
  UnbilledConsumptionOverview,
  InvoiceConsumptionSummaryItem,
  InvoiceSaleItemLink,
  StudentGuardianLink,
  SalesReceipt,
  SalePaymentEntry
} from '../types';
import type { IntegrityReport } from '../utils/dataIntegrity';

export interface SaleTransactionBundle {
  sale: Sale;
  student: Student;
  receipt: SalesReceipt;
  updatedProducts?: Product[];
  stockMovements?: StockMovement[];
  ledgerEntries?: FinancialTransaction[];
  auditLog?: AuditLog;
  idempotentReplay?: boolean;
}

export interface SaleReversalBundle {
  sale: Sale;
  student: Student;
  receipt?: SalesReceipt;
  updatedProducts?: Product[];
  stockMovements?: StockMovement[];
  updatedInvoices?: Invoice[];
  ledgerEntries?: FinancialTransaction[];
  auditLog?: AuditLog;
  idempotentReplay?: boolean;
}

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setApiAuthToken(token: string | null) {
  authToken = token && token.trim() ? token.trim() : null;
}

export function getApiAuthToken(): string | null {
  return authToken;
}

export function setApiUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers as Record<string, string> || {})
  };

  const method = (options.method || 'GET').toUpperCase();
  const maxAttempts = method === 'GET' ? 3 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(endpoint, {
        ...options,
        headers
      });

      const rawText = await res.text();
      let data: any = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = { error: rawText };
        }
      }

      if (!res.ok) {
        if (res.status === 401 && !endpoint.startsWith('/api/auth/')) {
          authToken = null;
          unauthorizedHandler?.();
        }
        if (method === 'GET' && res.status >= 502 && res.status <= 504 && attempt < maxAttempts - 1) {
          await sleep(350 * (attempt + 1));
          continue;
        }
        const err = new Error(data.error || `Erro na requisição (${res.status})`) as Error & {
          status?: number;
          adminSetupRequired?: boolean;
        };
        err.status = res.status;
        if (data.adminSetupRequired) err.adminSetupRequired = true;
        throw err;
      }

      return data as T;
    } catch (err: any) {
      lastError = err;
      const isNetworkFailure =
        err instanceof TypeError ||
        (typeof err?.message === 'string' && /failed to fetch|networkerror|load failed/i.test(err.message));

      if (method === 'GET' && isNetworkFailure && attempt < maxAttempts - 1) {
        await sleep(350 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha de comunicação com o servidor');
}

export const api = {
  // Auth
  async getAuthBootstrapStatus() {
    return request<{ adminSetupRequired: boolean; adminEmail: string }>('/api/auth/bootstrap-status');
  },

  async setupInitialAdmin(password: string, confirmPassword: string, email?: string) {
    return request<{ user: User; token: string; expiresAt: string }>('/api/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify({ password, confirmPassword, email })
    });
  },

  async login(email: string, password: string) {
    return request<{ user: User; token: string; expiresAt: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  async register(userData: { name: string; email: string; password: string; role?: UserRole; phone?: string }) {
    return request<{ user: User; token: string; expiresAt: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  async logout() {
    try {
      await request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignora erro de rede ao encerrar sessão local
    }
  },

  async resetPassword(email: string) {
    return request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  },

  async changePassword(payload: { targetUserId?: string; currentPassword?: string; newPassword: string }) {
    return request<{ ok: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  // Settings
  async getSettings() {
    return request<SystemSettings>('/api/settings');
  },

  async updateSettings(settings: Partial<SystemSettings>) {
    return request<SystemSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  // Products & Stock
  async getProducts() {
    return request<Product[]>('/api/products');
  },

  async createProduct(product: Partial<Product>) {
    return request<Product>('/api/products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
  },

  async updateProduct(id: string, product: Partial<Product>) {
    return request<Product>(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product)
    });
  },

  async adjustStock(params: {
    productId: string;
    type: 'ENTRADA' | 'AJUSTE_MANUAL' | 'PERDA_AVARIA';
    quantity: number;
    reason: string;
  }) {
    return request<Product>('/api/stock/adjust', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async getStockMovements() {
    return request<StockMovement[]>('/api/stock/movements');
  },

  // Sales
  async getSales() {
    return request<Sale[]>('/api/sales');
  },

  async createSale(params: {
    studentId: string;
    items: { productId: string; quantity: number; discountAmount?: number }[];
    paymentMethod?: PaymentMethod;
    payments?: SalePaymentEntry[];
    amountPaid?: number;
    creditUsed?: number;
    terminalId?: string;
    discountAmount?: number;
    notes?: string;
    idempotencyKey?: string;
  }) {
    return request<SaleTransactionBundle>('/api/sales', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async reverseSale(saleId: string, reason: string, idempotencyKey?: string) {
    return request<SaleReversalBundle>(`/api/sales/${saleId}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason, idempotencyKey })
    });
  },

  async partialReverseSale(
    saleId: string,
    params: { items: Array<{ productId: string; quantity: number }>; reason: string }
  ) {
    return request<{ sale: Sale; student: Student; receipt?: SalesReceipt; reversedAmount: number }>(
      `/api/sales/${saleId}/partial-reverse`,
      {
        method: 'POST',
        body: JSON.stringify(params)
      }
    );
  },

  // Sales Receipts & Vouchers
  async getReceipts(filters?: {
    search?: string;
    studentId?: string;
    classGroup?: string;
    operator?: string;
    paymentMethod?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    saleCode?: string;
  }) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
    }
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<SalesReceipt[]>(`/api/receipts${qs}`);
  },

  async getReceiptById(receiptId: string) {
    return request<SalesReceipt>(`/api/receipts/${receiptId}`);
  },

  async getReceiptBySaleId(saleId: string) {
    return request<SalesReceipt>(`/api/receipts/by-sale/${saleId}`);
  },

  async recordReceiptAction(receiptId: string, actionType: 'PRINT' | 'PDF' | 'REPRINT') {
    return request<SalesReceipt>(`/api/receipts/${receiptId}/reprint`, {
      method: 'POST',
      body: JSON.stringify({ actionType })
    });
  },

  // Cash Register
  async getCashState() {
    return request<{
      activeSession: CashRegisterSession | null;
      sessions: CashRegisterSession[];
      movements: CashMovement[];
    }>('/api/cash');
  },

  async openCashSession(params: { openingBalance: number; notes?: string }) {
    return request<CashRegisterSession>('/api/cash/open', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async addCashMovement(params: {
    type: 'SUPRIMENTO' | 'SANGRIA' | 'DESPESA' | 'RECEITA';
    amount: number;
    description: string;
    paymentMethod?: PaymentMethod;
  }) {
    return request<CashMovement>('/api/cash/movement', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async closeCashSession(params: { countedBalance: number; notes?: string }) {
    return request<CashRegisterSession>('/api/cash/close', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  // Students & Guardians
  async getStudents() {
    return request<Student[]>('/api/students');
  },

  async createStudent(studentData: Partial<Student>) {
    return request<Student>('/api/students', {
      method: 'POST',
      body: JSON.stringify(studentData)
    });
  },

  async updateStudent(id: string, updates: Partial<Student>) {
    return request<Student>(`/api/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  async adjustStudentBalance(
    studentId: string,
    params: { operation: 'CREDITO' | 'DEBITO'; amount: number; reason: string }
  ) {
    return request<Student>(`/api/students/${studentId}/balance`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async getGuardians() {
    return request<Guardian[]>('/api/guardians');
  },

  // Passeios
  async getPasseios() {
    return request<Passeio[]>('/api/passeios');
  },

  async createPasseio(passeioData: {
    nome: string;
    valor: number;
    descricao?: string | null;
    dataPasseio?: string | null;
    ativo?: boolean;
  }) {
    return request<Passeio>('/api/passeios', {
      method: 'POST',
      body: JSON.stringify(passeioData)
    });
  },

  async updatePasseio(
    id: string,
    updates: Partial<{
      nome: string;
      valor: number;
      descricao?: string | null;
      dataPasseio?: string | null;
      ativo: boolean;
    }>
  ) {
    return request<Passeio>(`/api/passeios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  async deletePasseio(id: string) {
    return request<{ success: boolean; deletedId: string }>(`/api/passeios/${id}`, {
      method: 'DELETE'
    });
  },

  // PDV de Passeios (Operações Coletivas de Passeio)
  async getTripOperations() {
    return request<TripOperation[]>('/api/pdv-passeios');
  },

  async saveTripOperationDraft(payload: {
    id?: string;
    catalogPasseioId?: string;
    name: string;
    description?: string;
    tripDate: string;
    destination: string;
    notes?: string;
    responsibleUserId?: string;
    responsibleUserName?: string;
    selectionMode: 'ALL_STUDENTS' | 'SPECIFIC_STUDENTS';
    distributionMethod: TripDistributionMethod;
    fixedValuePerStudent?: number;
    items: TripExpenseItem[];
    participants: TripParticipantAllocation[];
  }) {
    return request<TripOperation>('/api/pdv-passeios/draft', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async launchTripOperation(payload: {
    id?: string;
    catalogPasseioId?: string;
    name: string;
    description?: string;
    tripDate: string;
    destination: string;
    notes?: string;
    responsibleUserId?: string;
    responsibleUserName?: string;
    selectionMode: 'ALL_STUDENTS' | 'SPECIFIC_STUDENTS';
    distributionMethod: TripDistributionMethod;
    fixedValuePerStudent?: number;
    items: TripExpenseItem[];
    participants: TripParticipantAllocation[];
    idempotencyKey?: string;
  }) {
    return request<{
      operation: TripOperation;
      salesCreated: Sale[];
      updatedStudents: Student[];
    }>('/api/pdv-passeios/launch', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async deleteTripOperationDraft(operationId: string) {
    return request<{ success: boolean; deletedId: string }>(`/api/pdv-passeios/${operationId}`, {
      method: 'DELETE'
    });
  },

  async reverseTripParticipant(operationId: string, studentId: string, reason: string) {
    return request<{
      operation: TripOperation;
      reversedSale?: Sale;
      updatedStudent?: Student;
    }>(`/api/pdv-passeios/${operationId}/reverse-student`, {
      method: 'POST',
      body: JSON.stringify({ studentId, reason })
    });
  },

  async reverseEntireTripOperation(operationId: string, reason: string) {
    return request<TripOperation>(`/api/pdv-passeios/${operationId}/reverse-all`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  // Invoices, Individual/Period Billing & Monthly Closing
  async getInvoices() {
    return request<Invoice[]>('/api/invoices');
  },

  async getInvoicesOverview() {
    return request<{
      unbilledOverview: UnbilledConsumptionOverview;
      batches: BillingBatch[];
    }>('/api/invoices/overview');
  },

  async getBillingBatches() {
    return request<BillingBatch[]>('/api/invoices/batches');
  },

  async getStudentIndividualBillingContext(studentId: string, periodStart?: string, periodEnd?: string) {
    const params = new URLSearchParams();
    if (periodStart) params.set('periodStart', periodStart);
    if (periodEnd) params.set('periodEnd', periodEnd);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<{
      student: Student;
      guardians: Array<StudentGuardianLink & { guardianEmail?: string }>;
      sales: BillingPreviewSale[];
      eligibleSalesTotal: number;
      studentInvoices: Invoice[];
    }>(`/api/invoices/student-context/${studentId}${qs}`);
  },

  async previewIndividualInvoice(payload: IndividualInvoicePayload) {
    return request<{
      student: Student;
      hasGuardian: boolean;
      warnings: string[];
      billingPeriod: string;
      periodStart: string;
      periodEnd: string;
      dueDate: string;
      tuitionAmount: number;
      canteenConsumptionTotal: number;
      discountAmount: number;
      creditAmount: number;
      totalAdjustments: number;
      grossTotal: number;
      salesCount: number;
      consumptionItems: InvoiceConsumptionSummaryItem[];
      allocatedLinks: InvoiceSaleItemLink[];
    }>('/api/invoices/individual-preview', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async createIndividualInvoice(payload: IndividualInvoicePayload) {
    return request<{ batch: BillingBatch; invoice: Invoice; deduplicated?: boolean }>('/api/invoices/individual', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async previewPeriodBilling(payload: PeriodBillingPayload) {
    return request<BillingBatchPreview>('/api/invoices/period-preview', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async executePeriodBilling(payload: PeriodBillingPayload) {
    return request<{
      batch: BillingBatch;
      invoicesCreated: number;
      invoices: Invoice[];
      period: string;
      deduplicated?: boolean;
    }>('/api/invoices/period-execute', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getClosingPreview(period?: string) {
    return request<MonthlyClosingPreview>('/api/invoices/closing-preview', {
      method: 'POST',
      body: JSON.stringify({ period })
    });
  },

  async executeMonthlyClosing(period?: string, options?: Partial<PeriodBillingPayload>) {
    return request<{ period: string; batch?: BillingBatch; invoicesCreated: number; invoices: Invoice[]; deduplicated?: boolean }>(
      '/api/invoices/execute-closing',
      {
        method: 'POST',
        body: JSON.stringify({ period, ...(options || {}) })
      }
    );
  },

  async updateInvoice(
    id: string,
    updates: { tuitionAmount?: number; adjustmentsTotal?: number; dueDate?: string; discountReason?: string; notes?: string }
  ) {
    return request<Invoice>(`/api/invoices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  },

  async cancelInvoice(id: string, reason: string) {
    return request<Invoice>(`/api/invoices/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  async retryInvoiceNotification(id: string) {
    return request<{ invoiceId: string; notifications: WhatsAppNotification[] }>(`/api/invoices/${id}/retry-notification`, {
      method: 'POST'
    });
  },

  async deleteInvoice(id: string) {
    return request<{ success: boolean; deletedId: string }>(`/api/invoices/${id}`, {
      method: 'DELETE'
    });
  },

  async clearAllInvoices() {
    return request<{ success: boolean; totalDeleted: number }>('/api/invoices/clear-all', {
      method: 'POST'
    });
  },

  async logFinancialCsvExport(params: { exportType: string; invoicesCount: number; salesCount: number }) {
    return request<{ success: boolean }>('/api/invoices/export-log', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  // Pix Payments
  async getPixPayments() {
    return request<PixPayment[]>('/api/pix');
  },

  async submitPixPayment(params: {
    invoiceId: string;
    amount: number;
    transactionReference?: string;
    receiptAttachment?: string;
    receiptNotes?: string;
  }) {
    return request<PixPayment>('/api/pix/submit', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async reviewPixPayment(paymentId: string, decision: 'APROVADO' | 'REJEITADO', reason: string) {
    return request<{ payment: PixPayment; invoice: Invoice }>(`/api/pix/${paymentId}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason })
    });
  },

  // WhatsApp Automation
  async getWhatsAppNotifications() {
    return request<WhatsAppNotification[]>('/api/whatsapp');
  },

  async retryWhatsAppNotification(id: string) {
    return request<WhatsAppNotification>(`/api/whatsapp/${id}/retry`, {
      method: 'POST'
    });
  },

  // Audit Logs & Ledger
  async getAuditLogs() {
    return request<AuditLog[]>('/api/audit');
  },

  async getFinancialLedger() {
    return request<FinancialTransaction[]>('/api/ledger');
  },

  async getIntegrityReport() {
    return request<IntegrityReport>('/api/integrity');
  },

  async reconcileIntegrity(payload: { saleId?: string; strategy: 'CANCEL_INVALID' | 'RECOVER_RECEIPT' }) {
    return request<{
      reconciledIds: string[];
      strategy: 'CANCEL_INVALID' | 'RECOVER_RECEIPT';
      sales: Sale[];
      receipts: SalesReceipt[];
      students: Student[];
      auditLogs: AuditLog[];
      integrityReport: IntegrityReport;
    }>('/api/integrity/reconcile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Reset database to seed (com timeout seguro)
  async resetData(timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await request<{
        success: boolean;
        backupCreated?: boolean;
        restoredAt?: string;
        counts?: {
          students: number;
          products: number;
          sales: number;
          receipts: number;
          invoices: number;
          passeios: number;
        };
      }>('/api/reset-data', {
        method: 'POST',
        signal: controller.signal
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Tempo limite excedido ao restaurar os dados iniciais. Tente novamente.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  // Stripe Payments
  async createStripeCheckoutSession(params: { invoiceId: string; amount: number; studentId: string }) {
    return request<{ sessionId: string; publishableKey: string; message: string }>('/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async fulfillStripePayment(params: { invoiceId: string; amount: number; transactionRef?: string }) {
    return request<{ success: boolean; payment: PixPayment; message: string }>('/api/stripe/fulfill-payment', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  // Mercado Pago Checkout Transparente & Webhook
  async getMercadoPagoStatus() {
    return request<{
      configured: boolean;
      isProduction: boolean;
      publicKeyAvailable: boolean;
      publicKey?: string;
      webhookUrl: string;
      maskedToken?: string;
    }>('/api/mercadopago/status');
  },

  async createMercadoPagoPix(params: {
    invoiceId: string;
    amount: number;
    payerEmail?: string;
    payerName?: string;
    payerCpf?: string;
    description?: string;
  }) {
    return request<{
      success: boolean;
      isLive: boolean;
      error?: string;
      mockNotice?: string;
      isCollectorKeyMissing?: boolean;
      collectorNotice?: string;
      collectorHelp?: string;
      paymentId: string;
      status: string;
      statusDetail: string;
      qrCode?: string;
      qrCodeBase64?: string | null;
      ticketUrl?: string;
      invoiceId: string;
      amount: number;
      expirationDate?: string;
    }>('/api/mercadopago/create-pix', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async createMercadoPagoCardPayment(params: {
    invoiceId: string;
    amount: number;
    token?: string;
    cardNumber?: string;
    cardExpiry?: string;
    cardCvv?: string;
    installments: number;
    paymentMethodId: string;
    payerEmail?: string;
    payerCpf?: string;
    cardHolderName?: string;
    description?: string;
    deviceId?: string;
  }) {
    return request<{
      success: boolean;
      isLive: boolean;
      mockNotice?: string;
      paymentId: string;
      status: string;
      statusDetail: string;
      paymentMethodId: string;
      invoiceId: string;
      amount: number;
      error?: string;
    }>('/api/mercadopago/create-card', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async testMercadoPagoConnection(token?: string) {
    return request<{
      success: boolean;
      status?: number;
      user?: any;
      error?: string;
      details?: any;
    }>('/api/mercadopago/test-connection', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
  },

  async getMercadoPagoLogs() {
    return request<Array<{
      id: string;
      timestamp: string;
      method: string;
      endpoint: string;
      requestPayload?: any;
      status: number;
      responseBody?: any;
      error?: string;
      success: boolean;
    }>>('/api/mercadopago/logs');
  },

  async clearMercadoPagoLogs() {
    return request<{ success: boolean }>('/api/mercadopago/clear-logs', {
      method: 'POST'
    });
  },

  async checkMercadoPagoPayment(paymentId: string) {
    return request<any>(`/api/mercadopago/check-payment/${paymentId}`);
  },

  // Supabase
  async getSupabaseStatus() {
    return request<{
      configured: boolean;
      urlProvided: boolean;
      keyProvided: boolean;
      maskedUrl?: string;
      connected?: boolean;
      error?: string;
      tablesFound?: string[];
      recordsCount?: Record<string, number>;
    }>('/api/supabase/status');
  },

  async testSupabaseConnection() {
    return request<{
      configured: boolean;
      urlProvided: boolean;
      keyProvided: boolean;
      maskedUrl?: string;
      connected?: boolean;
      error?: string;
      tablesFound?: string[];
    }>('/api/supabase/test-connection', {
      method: 'POST'
    });
  },

  async syncAllToSupabase() {
    return request<{
      success: boolean;
      timestamp: string;
      tables: Record<string, { count: number; status: 'OK' | 'ERROR'; error?: string }>;
      totalRecordsSynced: number;
      message: string;
    }>('/api/supabase/sync-push', {
      method: 'POST'
    });
  },

  async syncFromSupabase() {
    return request<{
      success: boolean;
      totalPulled: number;
      tables: Record<string, number>;
      message: string;
    }>('/api/supabase/sync-pull', {
      method: 'POST'
    });
  },

  // ICEVES Inteligência (Gemini AI)
  async askIcevesAi(params: {
    question: string;
    history?: Array<{ role: 'user' | 'model'; text: string }>;
  }) {
    return request<{ answer: string; model: string; generatedAt: string }>('/api/ai/assistant', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }
};
