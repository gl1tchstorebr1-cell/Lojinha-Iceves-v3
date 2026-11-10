// Types and interfaces for Campus Store SaaS

export type UserRole = 'ADMIN' | 'CASHIER' | 'STUDENT' | 'GUARDIAN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
  studentId?: string; // If role is STUDENT
  guardianId?: string; // If role is GUARDIAN
  createdAt: string;
  lastLogin?: string;
}

export type PayerOption = 'STUDENT' | 'GUARDIAN' | 'BOTH' | 'STUDENT_ONLY' | 'GUARDIAN_ONLY';
export type RecipientOption = 'STUDENT' | 'GUARDIAN' | 'BOTH' | 'STUDENT_ONLY' | 'GUARDIAN_ONLY';

export interface StudentGuardianLink {
  guardianId: string;
  relationship: string; // 'Mãe', 'Pai', 'Tutor Legal', etc.
  isPrimaryPayer: boolean;
  canAccessPortal: boolean;
}

export interface Student {
  id: string;
  name: string;
  registrationNumber: string; // Matrícula
  classGroup: string; // Turma / Ano (ex: '3º Ano E.M. - A')
  email: string;
  phone: string;
  avatar?: string;
  status: 'ACTIVE' | 'INACTIVE';
  defaultTuition: number; // Mensalidade base (ex: 750.00)
  currentConsumptionBalance: number; // Consumo acumulado não fechado
  totalOpenDebt: number; // Saldo devedor total em faturas abertas
  
  // Regras de configuração individual
  payerRule: PayerOption;
  reportRecipientRule: RecipientOption;
  dueReminderRecipientRule: RecipientOption;
  paymentConfirmationRecipientRule: RecipientOption;
  allowedChannels: ('WHATSAPP' | 'EMAIL')[];
  guardians: StudentGuardianLink[];
  
  notes?: string;
  createdAt: string;
}

export interface Guardian {
  id: string;
  name: string;
  cpf: string;
  email: string;
  phone: string;
  relationshipDefault: string;
  studentIds: string[];
  createdAt: string;
}

export type ProductCategory = 
  | 'Alimentícios' 
  | 'Papelaria' 
  | 'Produtos de Limpeza' 
  | 'Cosméticos';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  internalCode: string;
  barcode?: string;
  currentStock: number;
  minStock: number;
  status: 'ACTIVE' | 'INACTIVE';
  imageUrl?: string;
  images?: string[]; // Até 3 imagens por produto
  unit: string; // 'un', 'pct', etc.
  createdAt: string;
  updatedAt: string;
}

export type StockMovementType = 
  | 'ENTRADA' 
  | 'SAIDA_VENDA' 
  | 'ESTORNO_VENDA' 
  | 'AJUSTE_MANUAL';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  quantity: number; // Positive or negative
  previousStock: number;
  newStock: number;
  reason: string;
  performedByUserId: string;
  performedByUserName: string;
  referenceId?: string; // saleId, etc.
  timestamp: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  category: ProductCategory;
  unitPrice: number; // Historical price preserved
  quantity: number;
  subtotal: number;
}

export interface Sale {
  id: string; // e.g. VEN-2026-1049
  studentId: string;
  studentName: string;
  registrationNumber: string;
  items: SaleItem[];
  total: number;
  operatorUserId: string;
  operatorUserName: string;
  status: 'COMPLETED' | 'REVERSED';
  reversedReason?: string;
  reversedByUserName?: string;
  reversedAt?: string;
  billingPeriod: string; // '2026-10'
  invoiceId?: string; // Populated once consolidated into an invoice
  idempotencyKey?: string;
  createdAt: string;
}

export type FinancialTransactionType = 'DEBITO' | 'CREDITO';
export type FinancialCategory = 
  | 'MENSALIDADE' 
  | 'CONSUMO_LOJINHA' 
  | 'PAGAMENTO_PIX' 
  | 'AJUSTE_CREDITO' 
  | 'AJUSTE_DEBITO' 
  | 'ESTORNO_VENDA';

export interface FinancialTransaction {
  id: string;
  timestamp: string;
  studentId: string;
  type: FinancialTransactionType;
  category: FinancialCategory;
  amount: number;
  description: string;
  invoiceId?: string;
  documentRef?: string;
  performedByUserName: string;
}

export type InvoiceStatus = 
  | 'RASCUNHO' 
  | 'AGUARDANDO_APROVACAO' 
  | 'PUBLICADA' 
  | 'PARCIALMENTE_PAGA' 
  | 'PAGA' 
  | 'VENCIDA' 
  | 'CANCELADA';

export interface InvoiceConsumptionSummaryItem {
  productId: string;
  productName: string;
  category: ProductCategory;
  quantity: number;
  averageUnitPrice: number;
  totalAmount: number;
}

export interface Invoice {
  id: string; // e.g. FAT-2026-10-001
  studentId: string;
  studentName: string;
  registrationNumber: string;
  billingPeriod: string; // '2026-10' (Outubro/2026)
  
  // Financeiro consolidado
  tuitionAmount: number; // Mensalidade fixa
  canteenConsumptionTotal: number; // Total consumo cantina
  previousBalance: number; // Saldo anterior não quitado
  adjustmentsTotal: number; // Ajustes / Descontos / Créditos
  grossTotal: number; // Total faturado
  paidTotal: number; // Pagamentos confirmados
  remainingBalance: number; // Saldo devedor pendente
  
  closingDate: string;
  dueDate: string;
  status: InvoiceStatus;
  
  // Itens detalhados de consumo para prestação de contas
  salesIds: string[];
  consumptionItems: InvoiceConsumptionSummaryItem[];
  
  // Pagamentos alocados
  paymentAllocations: {
    paymentId: string;
    amount: number;
    payerName: string;
    payerType: 'ALUNO' | 'RESPONSAVEL';
    date: string;
  }[];
  
  // Pix
  pixCopyPasteCode: string;
  pixQrCodePayload: string;
  
  approvedByUserName?: string;
  approvedAt?: string;
  publishedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PixPaymentStatus = 'AGUARDANDO_CONFERENCIA' | 'CONFIRMADO' | 'REJEITADO';

export interface PixPayment {
  id: string; // e.g. PIX-2026-0812
  invoiceId: string;
  invoiceCode: string;
  studentId: string;
  studentName: string;
  payerName: string;
  payerRole: 'ALUNO' | 'RESPONSAVEL';
  amount: number;
  transactionReference: string; // End-to-end ID or user reference
  receiptAttachment?: string; // Text / filename / receipt proof
  receiptNotes?: string;
  status: PixPaymentStatus;
  registeredByUserId: string;
  registeredByUserName: string;
  registeredAt: string;
  reviewedByUserId?: string;
  reviewedByUserName?: string;
  reviewedAt?: string;
  reviewDecisionReason?: string;
}

export type NotificationType = 
  | 'NOVA_FATURA' 
  | 'RELATORIO_MENSAL' 
  | 'LEMBRETE_ANTES_VENCIMENTO' 
  | 'LEMBRETE_APOS_VENCIMENTO' 
  | 'CONFIRMACAO_PAGAMENTO' 
  | 'ALERTA_ESTOQUE';

export type NotificationStatus = 
  | 'PROGRAMADO' 
  | 'ENVIADO' 
  | 'ENTREGUE' 
  | 'FALHA' 
  | 'CANCELADO_FATURA_QUITADA';

export interface WhatsAppNotification {
  id: string;
  type: NotificationType;
  recipientName: string;
  recipientPhone: string;
  recipientRole: 'ALUNO' | 'RESPONSAVEL' | 'ADMIN';
  studentName: string;
  studentId?: string;
  invoiceId?: string;
  messageText: string;
  status: NotificationStatus;
  scheduledFor: string;
  sentAt?: string;
  attemptsCount: number;
  lastErrorMessage?: string;
  metadata?: Record<string, any>;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  module: 'VENDAS' | 'ESTOQUE' | 'FATURAS' | 'PAGAMENTOS' | 'FECHAMENTO' | 'CONFIGURACOES' | 'AUTH' | 'NOTIFICACOES';
  details: string;
  ipAddress?: string;
  status: 'SUCESSO' | 'FALHA';
}

export interface SystemSettings {
  id: string;
  institutionName: string;
  cnpj: string;
  storeName: string;
  currentCohortName?: string; // ex: '10ª Turma'
  cohortsPerSemester?: number; // ex: 2 (1 turma por vez)
  graduationStartDay?: number; // ex: 27
  graduationEndDay?: number; // ex: 30
  closingDay: 'LAST_DAY' | number; // 'LAST_DAY' ou número de 1 a 30
  closingHour: string; // e.g. '23:59'
  dueDayOffset: number; // e.g. 10 (10º dia do mês subsequente)
  allowDirectCashPayment: boolean; // default false
  stockControlActive: boolean; // default true
  blockSaleWithoutStock: boolean; // default true
  pixKey?: string;
  pixKeyType?: 'CNPJ' | 'EMAIL' | 'PHONE' | 'RANDOM';
  pixReceiverName?: string;
  pixCity?: string;
  whatsappAutoEnabled: boolean;
  whatsappProviderName: string;
  whatsappProviderStatus: 'CONNECTED' | 'PAUSED' | 'DISCONNECTED';
  mercadoPagoActive?: boolean;
  mercadoPagoMode?: 'PRODUCAO' | 'SANDBOX';
  mercadoPagoAccessToken?: string;
  mercadoPagoPublicKey?: string;
  mercadoPagoWebhookSecret?: string;
  tuitionBillingActive?: boolean; // Se false, faturamento mensal cobra apenas consumo da lojinha
  defaultTuitionAmount?: number; // Valor padrão sugerido da mensalidade escolar
  supabaseActive?: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  stripePublishableKey?: string;
  updatedAt: string;
  updatedByUserName: string;
}

export interface MonthlyClosingPreview {
  period: string; // e.g. '2026-10'
  studentsCount: number;
  totalTuitions: number;
  totalConsumptions: number;
  totalPreviousBalances: number;
  totalGrossToBill: number;
  pendingUnpaidSalesCount: number;
  existingInvoicesCount: number;
  inconsistencies: {
    studentId: string;
    studentName: string;
    severity: 'WARNING' | 'BLOCKER';
    message: string;
  }[];
  canProceed: boolean;
}
