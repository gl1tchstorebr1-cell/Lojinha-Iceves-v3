// Types and interfaces for Campus Store SaaS

export type UserRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'CASHIER'
  | 'STOCKIST'
  | 'VIEWER'
  | 'STUDENT'
  | 'GUARDIAN';

export type PaymentMethod =
  | 'CONTA_ALUNO'
  | 'DINHEIRO'
  | 'PIX'
  | 'CARTAO_CREDITO'
  | 'CARTAO_DEBITO'
  | 'MERCADO_PAGO';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  phone?: string;
  avatar?: string;
  studentId?: string; // If role is STUDENT
  guardianId?: string; // If role is GUARDIAN
  registrationNumber?: string;
  createdAt: string;
  lastLogin?: string;
}

export type PayerOption = 'STUDENT' | 'GUARDIAN' | 'BOTH' | 'STUDENT_ONLY' | 'GUARDIAN_ONLY';
export type RecipientOption = 'STUDENT' | 'GUARDIAN' | 'BOTH' | 'STUDENT_ONLY' | 'GUARDIAN_ONLY';

export interface StudentGuardianLink {
  guardianId: string;
  guardianName?: string;
  guardianPhone?: string;
  relationship: string; // 'Responsável', 'Mãe', 'Pai', 'Tutor Legal', etc.
  isPrimaryPayer: boolean;
  canAccessPortal: boolean;
  needsPhoneReview?: boolean;
  phoneReviewNote?: string;
  matchNote?: string;
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
  cpf?: string;
  consumptionLimit?: number | null;
  creditBalance?: number;
  consumptionBlocked?: boolean;
  consumptionBlockedReason?: string;
  
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
  needsPhoneReview?: boolean;
  phoneReviewNote?: string;
  createdAt: string;
}

export type ProductCategory =
  | 'Livros e Literatura Cristã'
  | 'Alimentos e Snacks'
  | 'Produtos Naturais e Saúde'
  | 'Papelaria'
  | 'Higiene e Cuidados Pessoais'
  | 'Limpeza';

export interface Product {
  id: string;
  name: string;
  description?: string;
  category: ProductCategory;
  costPrice?: number;
  price: number | null;
  priceStatus?: 'DEFINED' | 'PENDING';
  internalCode: string;
  barcode?: string;
  currentStock: number;
  minStock: number;
  status: 'ACTIVE' | 'INACTIVE';
  archived?: boolean;
  archivedAt?: string;
  archivedReason?: string;
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
  | 'AJUSTE_MANUAL'
  | 'PERDA_AVARIA';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  saleId?: string;
  type: StockMovementType;
  quantity: number; // Positive or negative
  previousStock: number;
  newStock: number;
  resultingStock?: number;
  reason: string;
  performedByUserId: string;
  performedByUserName: string;
  referenceId?: string; // saleId, etc.
  timestamp: string;
}

export type TripExpenseItemType = 'PRODUTO_FISICO' | 'SERVICO' | 'DESPESA_OPERACIONAL';

export interface SaleItem {
  productId: string;
  internalCode?: string;
  barcode?: string;
  name: string;
  category: ProductCategory;
  unit?: string;
  unitPrice: number; // Historical price preserved
  quantity: number;
  discountAmount?: number;
  subtotal: number;
  tripItemType?: TripExpenseItemType;
  tripCategory?: string;
  description?: string;
  notes?: string;
}

export interface SalePaymentEntry {
  method: PaymentMethod;
  amount: number;
  transactionId?: string;
  confirmedAt?: string;
}

export type SaleBillingStatus =
  | 'AGUARDANDO_FATURAMENTO'
  | 'PARCIALMENTE_FATURADA'
  | 'TOTALMENTE_FATURADA'
  | 'CANCELADA'
  | 'ESTORNADA';

export interface SaleAllocatedItem {
  itemIndex: number;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface SaleInvoiceAllocation {
  invoiceId: string;
  batchId?: string;
  amount: number;
  items: SaleAllocatedItem[];
  allocatedAt: string;
}

export interface Sale {
  id: string; // e.g. VEN-2026-1049 or PAS-2026-1049
  studentId: string;
  studentName: string;
  registrationNumber: string;
  items: SaleItem[];
  subtotal?: number;
  discountTotal?: number;
  total: number;
  operatorUserId: string;
  operatorUserName: string;
  status: 'PENDING' | 'COMPLETED' | 'PARTIALLY_REVERSED' | 'REVERSED' | 'FAILED';
  reversedReason?: string;
  reversedByUserName?: string;
  reversedAt?: string;
  reversedAmount?: number; // Para estorno parcial ou rastreio
  reversalIdempotencyKey?: string;
  billingPeriod: string; // '2026-10'
  invoiceId?: string; // Populated once 100% consolidated into an invoice
  invoiceAllocations?: SaleInvoiceAllocation[]; // Rastreamento granular por item/fatura
  billedAmount?: number;
  billingStatus?: SaleBillingStatus;
  idempotencyKey?: string;
  origin?: 'LOJINHA' | 'PDV_PASSEIOS';
  paymentMethod?: PaymentMethod;
  payments?: SalePaymentEntry[];
  amountPaid?: number;
  changeAmount?: number;
  creditUsed?: number;
  terminalId?: string;
  receiptId?: string;
  receiptCode?: string;
  subtotalBeforeDiscount?: number;
  discountAmount?: number;
  cashSessionId?: string;
  notes?: string;
  tripOperationId?: string;
  tripName?: string;
  tripDate?: string;
  tripDestination?: string;
  createdAt: string;
  completedAt?: string;
}

export type ReceiptPrintFormat = '58mm' | '80mm' | 'A4';

export type ReceiptStatus = 'ATIVO' | 'PARCIALMENTE_ESTORNADO' | 'ESTORNADO' | 'CANCELADO';

export interface ReceiptItemSnapshot {
  itemIndex: number;
  productId: string;
  internalCode?: string;
  barcode?: string;
  name: string;
  category: ProductCategory;
  unit: string;
  unitPrice: number;
  quantity: number;
  individualDiscount: number;
  subtotal: number;
  total: number;
}

export interface ReceiptPaymentLine {
  method: PaymentMethod;
  label: string;
  amount: number;
  status: 'CONFIRMADO' | 'LANCADO_EM_CONTA' | 'ESTORNADO';
  transactionId?: string;
  confirmedAt?: string;
}

export interface ReceiptReversalRecord {
  id: string;
  originalSaleId: string;
  type: 'CANCELAMENTO' | 'ESTORNO_PARCIAL' | 'ESTORNO_TOTAL';
  reason: string;
  operatorUserId: string;
  operatorUserName: string;
  timestamp: string;
  reversedAmount: number;
  transactionId?: string;
  items?: Array<{ productId: string; name: string; quantity: number; amount: number }>;
}

export interface SalesReceipt {
  id: string;
  receiptCode: string; // e.g. ICE-000001
  saleId: string;
  version: number;
  status: ReceiptStatus;
  institution: {
    storeName: string;
    institutionName: string;
    cnpj?: string;
    unitName?: string;
    logoUrl: string;
  };
  saleSnapshot: {
    saleId: string;
    createdAt: string;
    saoPauloDate: string; // YYYY-MM-DD
    saoPauloTime: string; // HH:mm:ss
    timezone: 'America/Sao_Paulo';
    origin: 'LOJINHA' | 'PDV_PASSEIOS';
    saleStatus: 'COMPLETED' | 'REVERSED' | 'PARTIALLY_REVERSED';
    transactionId?: string;
    billingPeriod: string;
    notes?: string;
  };
  studentSnapshot: {
    studentId: string;
    name: string;
    registrationNumber: string;
    classGroup?: string;
    guardianName?: string;
    guardianRelationship?: string;
  };
  items: ReceiptItemSnapshot[];
  financialSummary: {
    productsSubtotal: number;
    discountTotal: number;
    creditUsed: number;
    saleTotal: number;
    amountPaid: number;
    changeAmount: number;
  };
  payments: ReceiptPaymentLine[];
  operational: {
    operatorUserId: string;
    operatorUserName: string;
    cashSessionId?: string;
    cashRegisterLabel?: string;
    terminalId?: string;
    operationTimestamp: string;
  };
  reversals: ReceiptReversalRecord[];
  reprintCount: number;
  lastReprintedAt?: string;
  lastReprintedByUserName?: string;
  customHeaderSnapshot?: string;
  customFooterSnapshot?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptSettings {
  autoPrintOnSale: boolean;
  defaultPrintFormat: ReceiptPrintFormat;
  customHeader: string;
  customFooter: string;
  showOperator: boolean;
  showClassGroup: boolean;
  showGuardian: boolean;
  showUnitCodeSku: boolean;
  showTerminalInfo: boolean;
  secondCopyAllowedRoles: UserRole[];
}

export type FinancialTransactionType = 'DEBITO' | 'CREDITO';
export type FinancialCategory = 
  | 'MENSALIDADE' 
  | 'CONSUMO_LOJINHA' 
  | 'PDV_PASSEIOS'
  | 'PAGAMENTO_PIX' 
  | 'AJUSTE_CREDITO' 
  | 'AJUSTE_DEBITO' 
  | 'ESTORNO_VENDA';

export interface FinancialTransaction {
  id: string;
  timestamp: string;
  studentId: string;
  saleId?: string;
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

export type BillingBatchType = 'INDIVIDUAL' | 'PERIODO_PERSONALIZADO' | 'FECHAMENTO_MENSAL';

export interface InvoiceHistoryEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
}

export interface InvoiceSaleItemLink {
  saleId: string;
  saleDate: string;
  itemIndex: number;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

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
  classGroup?: string;
  billingPeriod: string; // '2026-10' (Outubro/2026) ou competência de referência
  billingType?: BillingBatchType;
  batchId?: string;
  periodStart?: string; // YYYY-MM-DD
  periodEnd?: string; // YYYY-MM-DD
  billingLabel?: string;
  
  // Financeiro consolidado
  tuitionAmount: number; // Mensalidade fixa
  canteenConsumptionTotal: number; // Total consumo cantina
  previousBalance: number; // Saldo anterior não quitado
  adjustmentsTotal: number; // Ajustes / Descontos / Créditos
  creditApplied?: number;
  discountReason?: string;
  grossTotal: number; // Total faturado
  paidTotal: number; // Pagamentos confirmados
  remainingBalance: number; // Saldo devedor pendente
  
  closingDate: string;
  dueDate: string;
  status: InvoiceStatus;
  
  // Itens detalhados de consumo para prestação de contas
  salesIds: string[];
  saleItemLinks?: InvoiceSaleItemLink[];
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
  canceledAt?: string;
  canceledByUserName?: string;
  canceledReason?: string;
  notes?: string;
  history?: InvoiceHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface BillingBatch {
  id: string; // e.g. LOT-20261118-001
  type: BillingBatchType;
  billingPeriod: string;
  periodStart?: string;
  periodEnd?: string;
  billingLabel?: string;
  dueDate: string;
  scope?: 'ALL_STUDENTS' | 'CLASS_GROUP' | 'MANUAL_SELECTION' | 'EXCLUDE_STUDENTS' | 'SINGLE_STUDENT';
  classGroupFilter?: string;
  studentsCount: number;
  invoicesCount: number;
  salesCount: number;
  totalAmount: number;
  invoiceIds: string[];
  createdByUserId: string;
  createdByUserName: string;
  status: 'CONCLUIDO' | 'PARCIALMENTE_CANCELADO' | 'CANCELADO';
  idempotencyKey?: string;
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
  module: 'VENDAS' | 'ESTOQUE' | 'FATURAS' | 'PAGAMENTOS' | 'FECHAMENTO' | 'CONFIGURACOES' | 'AUTH' | 'NOTIFICACOES' | 'PASSEIOS' | 'PDV_PASSEIOS' | 'CAIXA' | 'IA_GEMINI' | 'RELATORIOS' | 'RECIBOS' | 'SISTEMA';
  referenceId?: string;
  details: string;
  ipAddress?: string;
  status: 'SUCESSO' | 'FALHA';
}

export interface CashRegisterSession {
  id: string;
  status: 'ABERTO' | 'FECHADO';
  openedAt: string;
  openedByUserId: string;
  openedByUserName: string;
  openingBalance: number;
  closedAt?: string;
  closedByUserId?: string;
  closedByUserName?: string;
  expectedBalance?: number;
  countedBalance?: number;
  difference?: number;
  notes?: string;
}

export type CashMovementType =
  | 'ABERTURA'
  | 'SUPRIMENTO'
  | 'SANGRIA'
  | 'DESPESA'
  | 'RECEITA'
  | 'VENDA_DINHEIRO'
  | 'VENDA_PIX'
  | 'VENDA_CARTAO'
  | 'VENDA_MERCADO_PAGO'
  | 'VENDA_CONTA_ALUNO'
  | 'ESTORNO';

export interface CashMovement {
  id: string;
  sessionId?: string;
  type: CashMovementType;
  paymentMethod?: PaymentMethod;
  amount: number;
  description: string;
  referenceId?: string;
  performedByUserId: string;
  performedByUserName: string;
  timestamp: string;
}

export interface Passeio {
  id: string;
  nome: string;
  valor: number;
  descricao?: string | null;
  dataPasseio?: string | null;
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TripDistributionMethod =
  | 'IGUALITARIA'
  | 'PERSONALIZADA'
  | 'POR_ITEM'
  | 'VALOR_FIXO';

export type TripOperationStatus =
  | 'RASCUNHO'
  | 'LANCADO'
  | 'PARCIALMENTE_ESTORNADO'
  | 'ESTORNADO';

export interface TripExpenseItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  itemType: TripExpenseItemType;
  storeProductId?: string;
  deductFromStock?: boolean;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  notes?: string;
}

export interface TripParticipantAllocationItem {
  expenseItemId: string;
  name: string;
  category: string;
  itemType: TripExpenseItemType;
  quantity: number;
  unitPrice: number;
  amount: number;
  description?: string;
  notes?: string;
}

export interface TripParticipantAllocation {
  studentId: string;
  studentName: string;
  registrationNumber: string;
  classGroup: string;
  allocatedAmount: number;
  allocatedCents: number;
  items: TripParticipantAllocationItem[];
  saleId?: string;
  status: 'PENDENTE' | 'LANCADO' | 'ESTORNADO';
  reversedReason?: string;
  reversedByUserName?: string;
  reversedAt?: string;
}

export interface TripHistoryEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  details: string;
}

export interface TripOperation {
  id: string;
  catalogPasseioId?: string;
  name: string;
  description: string;
  tripDate: string;
  destination: string;
  notes?: string;
  responsibleUserId: string;
  responsibleUserName: string;
  status: TripOperationStatus;
  selectionMode: 'ALL_STUDENTS' | 'SPECIFIC_STUDENTS';
  distributionMethod: TripDistributionMethod;
  fixedValuePerStudent?: number;
  items: TripExpenseItem[];
  participants: TripParticipantAllocation[];
  totalExpenses: number;
  totalDistributed: number;
  idempotencyKey?: string;
  launchedAt?: string;
  launchedByUserName?: string;
  history: TripHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface PdvPasseiosPermissions {
  cashierCanViewPasseios: boolean;
  cashierCanCreatePasseios: boolean;
  cashierCanAddExpenses: boolean;
  cashierCanSelectStudents: boolean;
  cashierCanConfirmLaunches: boolean;
  cashierCanViewHistory: boolean;
  cashierCanReverseLaunches: boolean;
}

export interface SystemSettings {
  id: string;
  institutionName: string;
  cnpj: string;
  storeName: string;
  currentCohortName?: string; // ex: '10ª Turma'
  cohortsPerSemester?: number; // ex: 1 (1 turma por semestre / 1 turma por vez)
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
  pdvPasseiosPermissions?: PdvPasseiosPermissions;
  receiptSettings?: ReceiptSettings;
  catalogVersion?: string;
  updatedAt: string;
  updatedByUserName: string;
}

export interface BillingPreviewSaleItem {
  itemIndex: number;
  productId: string;
  name: string;
  category: ProductCategory;
  unitPrice: number;
  originalQuantity: number;
  alreadyBilledQuantity: number;
  remainingQuantity: number;
  originalSubtotal: number;
  remainingAmount: number;
}

export interface BillingPreviewSale {
  saleId: string;
  createdAt: string;
  saoPauloDate: string; // YYYY-MM-DD in America/Sao_Paulo
  billingPeriod: string;
  origin: 'LOJINHA' | 'PDV_PASSEIOS';
  paymentMethod: PaymentMethod;
  billingStatus: SaleBillingStatus;
  originalTotal: number;
  reversedAmount: number;
  alreadyBilledAmount: number;
  remainingBillableAmount: number;
  isEligible: boolean;
  ineligibleReason?: string;
  items: BillingPreviewSaleItem[];
}

export interface BillingStudentPreviewItem {
  studentId: string;
  studentName: string;
  registrationNumber: string;
  classGroup: string;
  guardiansSummary: string;
  hasGuardian: boolean;
  payerRule: PayerOption;
  tuitionAmount: number;
  grossPurchasesTotal: number;
  reversalsTotal: number;
  alreadyBilledTotal: number;
  netConsumptionToBill: number;
  grossTotalToBill: number;
  eligibleSalesCount: number;
  alreadyBilledSalesCount: number;
  ineligibleSalesCount: number;
  sales: BillingPreviewSale[];
  willGenerateInvoice: boolean;
  existingInvoiceId?: string;
  warnings: string[];
  blockers: string[];
}

export interface BillingBatchPreview {
  mode: BillingBatchType;
  billingPeriod: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  billingLabel?: string;
  scope: 'ALL_STUDENTS' | 'CLASS_GROUP' | 'MANUAL_SELECTION' | 'EXCLUDE_STUDENTS' | 'SINGLE_STUDENT';
  studentsCount: number;
  studentsWithBillableConsumptionCount: number;
  invoicesToCreateCount: number;
  validSalesCount: number;
  alreadyBilledSalesCount: number;
  ineligibleSalesCount: number;
  grossPurchasesTotal: number;
  reversalsTotal: number;
  alreadyBilledTotal: number;
  netBillableTotal: number;
  totalTuitions: number;
  totalConsumptions: number;
  totalGrossToBill: number;
  existingInvoicesCount: number;
  closedPeriodAlreadyProcessed: boolean;
  retroactiveSalesInClosedPeriodCount: number;
  studentsMissingGuardianCount: number;
  students: BillingStudentPreviewItem[];
  inconsistencies: {
    studentId: string;
    studentName: string;
    severity: 'WARNING' | 'BLOCKER';
    message: string;
  }[];
  canProceed: boolean;
}

export interface IndividualSaleSelection {
  saleId: string;
  items?: {
    itemIndex: number;
    quantity: number;
  }[];
}

export interface IndividualInvoicePayload {
  studentId: string;
  periodStart?: string;
  periodEnd?: string;
  dueDate: string;
  billingLabel?: string;
  tuitionAmount?: number;
  discountAmount?: number;
  creditAmount?: number;
  discountReason?: string;
  notes?: string;
  selections: IndividualSaleSelection[];
  idempotencyKey?: string;
}

export interface PeriodBillingPayload {
  mode: 'PERIODO_PERSONALIZADO' | 'FECHAMENTO_MENSAL';
  billingPeriod?: string; // e.g. '2026-11'
  periodStart?: string; // YYYY-MM-DD
  periodEnd?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  billingLabel?: string;
  scope?: 'ALL_STUDENTS' | 'CLASS_GROUP' | 'MANUAL_SELECTION' | 'EXCLUDE_STUDENTS';
  classGroup?: string;
  studentIds?: string[];
  excludedStudentIds?: string[];
  onlyUnbilled?: boolean;
  notes?: string;
  idempotencyKey?: string;
}

export interface UnbilledConsumptionOverview {
  totalUnbilledAmount: number;
  totalPartiallyBilledAmount: number;
  unbilledSalesCount: number;
  partiallyBilledSalesCount: number;
  billedSalesCount: number;
  reversedOrCanceledSalesCount: number;
  studentsWithUnbilledCount: number;
  retroactiveClosedPeriodSalesCount: number;
  retroactiveClosedPeriodAmount: number;
  closedPeriods: string[];
  byStudent: {
    studentId: string;
    studentName: string;
    registrationNumber: string;
    classGroup: string;
    hasGuardian: boolean;
    unbilledSalesCount: number;
    unbilledAmount: number;
    oldestSaleDate: string;
    newestSaleDate: string;
    hasRetroactiveClosedPeriodSale: boolean;
  }[];
  unbilledSales: BillingPreviewSale[];
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
  batchPreview?: BillingBatchPreview;
}
