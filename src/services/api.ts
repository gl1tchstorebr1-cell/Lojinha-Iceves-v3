import { 
  User, 
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
  MonthlyClosingPreview 
} from '../types';

let currentUserId: string = 'user-admin';

export function setApiUserId(id: string) {
  currentUserId = id;
}

export function getApiUserId() {
  return currentUserId;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': currentUserId,
    ...(options.headers as Record<string, string> || {})
  };

  const res = await fetch(endpoint, {
    ...options,
    headers
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Erro na requisição (${res.status})`);
  }

  return data as T;
}

export const api = {
  // Auth
  async login(email: string, password?: string) {
    return request<{ user: User; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  async register(userData: { email: string; password: string; name: string; role?: string; phone?: string }) {
    return request<{ user: User; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  async resetPassword(email: string) {
    return request<{ message: string; maskedEmail: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email })
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

  async adjustStock(params: { productId: string; type: 'ENTRADA' | 'AJUSTE_MANUAL'; quantity: number; reason: string }) {
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

  async createSale(params: { studentId: string; items: { productId: string; quantity: number }[]; idempotencyKey?: string }) {
    return request<{ sale: Sale; student: Student }>('/api/sales', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async reverseSale(saleId: string, reason: string) {
    return request<{ sale: Sale; student: Student }>(`/api/sales/${saleId}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason })
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

  async getGuardians() {
    return request<Guardian[]>('/api/guardians');
  },

  // Invoices & Closing
  async getInvoices() {
    return request<Invoice[]>('/api/invoices');
  },

  async getClosingPreview(period?: string) {
    return request<MonthlyClosingPreview>('/api/invoices/closing-preview', {
      method: 'POST',
      body: JSON.stringify({ period })
    });
  },

  async executeMonthlyClosing(period?: string) {
    return request<{ period: string; invoicesCreated: number; invoices: Invoice[] }>('/api/invoices/execute-closing', {
      method: 'POST',
      body: JSON.stringify({ period })
    });
  },

  async updateInvoice(id: string, updates: { tuitionAmount?: number; adjustmentsTotal?: number; notes?: string }) {
    return request<Invoice>(`/api/invoices/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
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

  // Reset database to seed
  async resetData() {
    return request<{ success: boolean }>('/api/reset-data', {
      method: 'POST'
    });
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
  }
};
