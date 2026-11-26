import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db } from './db.ts';

let cachedClient: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

export function getSupabaseCredentials() {
  const settings = db.getSettings();
  let rawUrl = (
    (settings as any)?.supabaseUrl || 
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL || 
    process.env.VITE_SUPABASE_URL || 
    'https://brjsoaxvqrtxyofwxgkk.supabase.co'
  ).trim();

  // Remove common accidental suffixes like /rest/v1 or trailing slashes
  const url = rawUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');

  const key = (
    (settings as any)?.supabaseServiceRoleKey || 
    (settings as any)?.supabaseAnonKey || 
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.SUPABASE_ANON_KEY || 
    process.env.VITE_SUPABASE_ANON_KEY || 
    'sb_publishable_mEQzWNPKvTxqWvzZ8u6XQA_2wlGfyLR'
  ).trim();

  return { url, key };
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseCredentials();

  if (!url || !key) {
    return null;
  }

  if (cachedClient && lastUsedUrl === url && lastUsedKey === key) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    lastUsedUrl = url;
    lastUsedKey = key;
    return cachedClient;
  } catch (err) {
    console.error('Erro ao inicializar cliente Supabase:', err);
    return null;
  }
}

export interface SupabaseStatus {
  configured: boolean;
  urlProvided: boolean;
  keyProvided: boolean;
  maskedUrl?: string;
  connected?: boolean;
  error?: string;
  tablesFound?: string[];
  recordsCount?: Record<string, number>;
}

export async function checkSupabaseConnection(): Promise<SupabaseStatus> {
  const { url, key } = getSupabaseCredentials();
  const urlProvided = Boolean(url);
  const keyProvided = Boolean(key);

  if (!urlProvided || !keyProvided) {
    return {
      configured: false,
      urlProvided,
      keyProvided,
    };
  }

  const maskedUrl = url.replace(/https?:\/\/([^.]+).*/, 'https://$1...supabase.co');

  try {
    const client = getSupabaseClient();
    if (!client) {
      return {
        configured: false,
        urlProvided,
        keyProvided,
        maskedUrl,
        connected: false,
        error: 'Não foi possível inicializar o cliente Supabase com as credenciais fornecidas.',
      };
    }

    const tableNames = [
      'settings',
      'users',
      'guardians',
      'products',
      'students',
      'stock_movements',
      'invoices',
      'billing_batches',
      'sales',
      'sales_receipts',
      'pix_payments',
      'whatsapp_notifications',
      'audit_logs',
      'passeios',
      'trip_operations',
      'cash_registers',
      'cash_movements',
    ];

    const testQueries = await Promise.allSettled(
      tableNames.map(tbl => client.from(tbl).select('id', { count: 'exact', head: true }))
    );

    const tablesFound: string[] = [];
    const recordsCount: Record<string, number> = {};

    testQueries.forEach((res, idx) => {
      const tbl = tableNames[idx];
      if (res.status === 'fulfilled' && !res.value.error) {
        tablesFound.push(tbl);
        recordsCount[tbl] = res.value.count || 0;
      }
    });

    return {
      configured: true,
      urlProvided,
      keyProvided,
      maskedUrl,
      connected: true,
      tablesFound,
      recordsCount,
    };
  } catch (err: any) {
    return {
      configured: true,
      urlProvided,
      keyProvided,
      maskedUrl,
      connected: false,
      error: err.message || 'Falha ao conectar com o Supabase',
    };
  }
}

// ============================================================================
// DATA MAPPERS (Local CamelCase <-> Supabase Snake_Case)
// ============================================================================

export function mapSettingsToSupabase(s: any) {
  return {
    id: s.id || 'settings-1',
    institution_name: s.institutionName || 'Campus University School',
    cnpj: s.cnpj || '18.423.891/0001-44',
    store_name: s.storeName || 'Lojinha do Campus',
    closing_day: String(s.closingDay || 'LAST_DAY'),
    closing_hour: s.closingHour || '23:59',
    due_day_offset: Number(s.dueDayOffset) || 10,
    allow_direct_cash_payment: Boolean(s.allowDirectCashPayment),
    stock_control_active: s.stockControlActive ?? true,
    block_sale_without_stock: s.blockSaleWithoutStock ?? true,
    pix_key: s.pixKey || '',
    pix_key_type: s.pixKeyType || 'EMAIL',
    pix_receiver_name: s.pixReceiverName || 'CAMPUS EDUCACIONAL',
    pix_city: s.pixCity || 'SAO PAULO',
    whatsapp_auto_enabled: s.whatsappAutoEnabled ?? true,
    whatsapp_provider_name: s.whatsappProviderName || 'Evolution API',
    whatsapp_provider_status: s.whatsappProviderStatus || 'CONNECTED',
    receipt_settings: s.receiptSettings || null,
    updated_at: s.updatedAt || new Date().toISOString(),
    updated_by_user_name: s.updatedByUserName || 'Sistema'
  };
}

function toPostgresDate(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  const dt = new Date(trimmed);
  if (!Number.isNaN(dt.getTime())) {
    return dt.toISOString().substring(0, 10);
  }
  return null;
}

export function mapUserToSupabase(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone || null,
    avatar: u.avatar || null,
    student_id: u.studentId || null,
    guardian_id: u.guardianId || null,
    created_at: u.createdAt || new Date().toISOString(),
    last_login: u.lastLogin || null,
  };
}

export function mapUserFromSupabase(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone || undefined,
    avatar: row.avatar || undefined,
    studentId: row.student_id || undefined,
    guardianId: row.guardian_id || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    lastLogin: row.last_login || undefined,
  };
}

export function mapGuardianToSupabase(g: any) {
  const rawCpf = String(g.cpf || '').trim();
  const isMissingCpf = !rawCpf || rawCpf.toLowerCase() === 'não informado' || rawCpf.toLowerCase() === 'nao informado';
  return {
    id: g.id,
    name: g.name,
    cpf: isMissingCpf ? `NI-${g.id}` : rawCpf,
    email: g.email || `${g.id}@iceves.local`,
    phone: g.phone || '',
    relationship_default: g.relationshipDefault || 'Responsável',
    student_ids: g.studentIds || [],
    created_at: g.createdAt || new Date().toISOString(),
  };
}

export function mapGuardianFromSupabase(row: any) {
  const rawCpf = String(row.cpf || '').trim();
  return {
    id: row.id,
    name: row.name,
    cpf: !rawCpf || rawCpf.startsWith('NI-') ? 'Não informado' : rawCpf,
    email: row.email || '',
    phone: row.phone || '',
    relationshipDefault: row.relationship_default || 'Responsável',
    studentIds: Array.isArray(row.student_ids) ? row.student_ids : [],
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapStudentToSupabase(st: any) {
  return {
    id: st.id,
    name: st.name,
    registration_number: st.registrationNumber,
    class_group: st.classGroup,
    email: st.email,
    phone: st.phone,
    avatar: st.avatar || null,
    status: st.status || 'ACTIVE',
    default_tuition: Number(st.defaultTuition) || 0,
    current_consumption_balance: Number(st.currentConsumptionBalance) || 0,
    total_open_debt: Number(st.totalOpenDebt) || 0,
    cpf: st.cpf || null,
    consumption_limit: st.consumptionLimit !== undefined && st.consumptionLimit !== null ? Number(st.consumptionLimit) : null,
    credit_balance: Number(st.creditBalance) || 0,
    consumption_blocked: Boolean(st.consumptionBlocked),
    consumption_blocked_reason: st.consumptionBlockedReason || null,
    payer_rule: st.payerRule || 'GUARDIAN',
    report_recipient_rule: st.reportRecipientRule || 'GUARDIAN',
    due_reminder_recipient_rule: st.dueReminderRecipientRule || 'BOTH',
    payment_confirmation_recipient_rule: st.paymentConfirmationRecipientRule || 'BOTH',
    allowed_channels: st.allowedChannels || ['WHATSAPP', 'EMAIL'],
    guardians: st.guardians || [],
    notes: st.notes || null,
    created_at: st.createdAt || new Date().toISOString(),
  };
}

export function mapProductToSupabase(p: any) {
  const parsedPrice = p.price === null || p.price === undefined || p.price === '' ? NaN : Number(p.price);
  const hasValidPrice = !Number.isNaN(parsedPrice) && parsedPrice > 0;
  return {
    id: p.id,
    name: p.name,
    description: p.description || null,
    category: p.category,
    cost_price: p.costPrice !== undefined && p.costPrice !== null ? Number(p.costPrice) : null,
    price: hasValidPrice ? Math.round(parsedPrice * 100) / 100 : 0,
    price_status: p.priceStatus || (hasValidPrice ? 'DEFINED' : 'PENDING'),
    internal_code: p.internalCode,
    barcode: p.barcode || null,
    current_stock: Number(p.currentStock) || 0,
    min_stock: Number(p.minStock) || 0,
    status: p.status || 'ACTIVE',
    archived: Boolean(p.archived),
    archived_at: p.archivedAt || null,
    archived_reason: p.archivedReason || null,
    image_url: p.imageUrl || (Array.isArray(p.images) ? p.images[0] : null) || null,
    images: Array.isArray(p.images) ? p.images : [],
    unit: p.unit || 'un',
    created_at: p.createdAt || new Date().toISOString(),
    updated_at: p.updatedAt || new Date().toISOString(),
  };
}

export function mapStockMovementToSupabase(m: any) {
  return {
    id: m.id,
    product_id: m.productId,
    product_name: m.productName,
    type: m.type,
    quantity: Number(m.quantity) || 0,
    previous_stock: Number(m.previousStock) || 0,
    new_stock: Number(m.newStock) || 0,
    reason: m.reason,
    performed_by_user_id: m.performedByUserId,
    performed_by_user_name: m.performedByUserName,
    reference_id: m.referenceId || null,
    timestamp: m.timestamp || new Date().toISOString(),
  };
}

export function mapSaleToSupabase(sa: any) {
  return {
    id: sa.id,
    student_id: sa.studentId,
    student_name: sa.studentName,
    registration_number: sa.registrationNumber,
    items: sa.items || [],
    subtotal: sa.subtotalBeforeDiscount !== undefined ? Number(sa.subtotalBeforeDiscount) : Number(sa.total) || 0,
    discount_amount: sa.discountAmount !== undefined ? Number(sa.discountAmount) : 0,
    total: Number(sa.total) || 0,
    operator_user_id: sa.operatorUserId,
    operator_user_name: sa.operatorUserName,
    status: sa.status || 'COMPLETED',
    reversed_reason: sa.reversedReason || null,
    reversed_by_user_name: sa.reversedByUserName || null,
    reversed_at: sa.reversedAt || null,
    reversed_amount: sa.reversedAmount !== undefined ? Number(sa.reversedAmount) : 0,
    billing_period: sa.billingPeriod,
    invoice_id: sa.invoiceId || null,
    billing_status: sa.billingStatus || 'AGUARDANDO_FATURAMENTO',
    billed_amount: sa.billedAmount !== undefined ? Number(sa.billedAmount) : 0,
    invoice_allocations: sa.invoiceAllocations || [],
    payment_method: sa.paymentMethod || 'CONTA_ALUNO',
    payments: sa.payments || [],
    amount_paid: sa.amountPaid !== undefined ? Number(sa.amountPaid) : 0,
    change_amount: sa.changeAmount !== undefined ? Number(sa.changeAmount) : 0,
    credit_used: sa.creditUsed !== undefined ? Number(sa.creditUsed) : 0,
    cash_session_id: sa.cashSessionId || null,
    notes: sa.notes || null,
    terminal_id: sa.terminalId || null,
    receipt_id: sa.receiptId || null,
    receipt_code: sa.receiptCode || null,
    origin: sa.origin || (String(sa.id || '').startsWith('PAS-') ? 'PDV_PASSEIOS' : 'LOJINHA'),
    trip_operation_id: sa.tripOperationId || null,
    trip_name: sa.tripName || null,
    trip_date: toPostgresDate(sa.tripDate),
    trip_destination: sa.tripDestination || null,
    idempotency_key: sa.idempotencyKey || null,
    created_at: sa.createdAt || new Date().toISOString(),
  };
}

export function mapSaleFromSupabase(row: any) {
  const isTrip = row.origin === 'PDV_PASSEIOS' || String(row.id || '').startsWith('PAS-');
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    registrationNumber: row.registration_number,
    items: Array.isArray(row.items) ? row.items : [],
    subtotalBeforeDiscount: row.subtotal !== null && row.subtotal !== undefined ? Number(row.subtotal) : undefined,
    discountAmount: row.discount_amount !== null && row.discount_amount !== undefined ? Number(row.discount_amount) : undefined,
    total: Number(row.total) || 0,
    operatorUserId: row.operator_user_id,
    operatorUserName: row.operator_user_name,
    status: row.status || 'COMPLETED',
    reversedReason: row.reversed_reason || undefined,
    reversedByUserName: row.reversed_by_user_name || undefined,
    reversedAt: row.reversed_at || undefined,
    reversedAmount: row.reversed_amount !== null && row.reversed_amount !== undefined ? Number(row.reversed_amount) : undefined,
    billingPeriod: row.billing_period,
    invoiceId: row.invoice_id || undefined,
    billingStatus: row.billing_status || undefined,
    billedAmount: row.billed_amount !== null && row.billed_amount !== undefined ? Number(row.billed_amount) : undefined,
    invoiceAllocations: Array.isArray(row.invoice_allocations) ? row.invoice_allocations : undefined,
    paymentMethod: row.payment_method || undefined,
    payments: Array.isArray(row.payments) ? row.payments : undefined,
    amountPaid: row.amount_paid !== null && row.amount_paid !== undefined ? Number(row.amount_paid) : undefined,
    changeAmount: row.change_amount !== null && row.change_amount !== undefined ? Number(row.change_amount) : undefined,
    creditUsed: row.credit_used !== null && row.credit_used !== undefined ? Number(row.credit_used) : undefined,
    cashSessionId: row.cash_session_id || undefined,
    notes: row.notes || undefined,
    terminalId: row.terminal_id || undefined,
    receiptId: row.receipt_id || undefined,
    receiptCode: row.receipt_code || undefined,
    origin: (isTrip ? 'PDV_PASSEIOS' : 'LOJINHA') as 'LOJINHA' | 'PDV_PASSEIOS',
    tripOperationId: row.trip_operation_id || undefined,
    tripName: row.trip_name || undefined,
    tripDate: row.trip_date || undefined,
    tripDestination: row.trip_destination || undefined,
    idempotencyKey: row.idempotency_key || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

export function mapReceiptToSupabase(rec: any) {
  return {
    id: rec.id,
    receipt_code: rec.receiptCode,
    sale_id: rec.saleId,
    version: Number(rec.version) || 1,
    status: rec.status || 'ATIVO',
    institution: rec.institution || {},
    sale_snapshot: rec.saleSnapshot || {},
    student_snapshot: rec.studentSnapshot || {},
    items: rec.items || [],
    financial_summary: rec.financialSummary || {},
    payments: rec.payments || [],
    operational: rec.operational || {},
    reversals: rec.reversals || [],
    reprint_count: Number(rec.reprintCount) || 0,
    last_reprinted_at: rec.lastReprintedAt || null,
    last_reprinted_by_user_name: rec.lastReprintedByUserName || null,
    custom_header_snapshot: rec.customHeaderSnapshot || null,
    custom_footer_snapshot: rec.customFooterSnapshot || null,
    created_at: rec.createdAt || new Date().toISOString(),
    updated_at: rec.updatedAt || new Date().toISOString(),
  };
}

export function mapInvoiceToSupabase(inv: any) {
  const fallbackDate = new Date().toISOString().substring(0, 10);
  return {
    id: inv.id,
    student_id: inv.studentId,
    student_name: inv.studentName,
    registration_number: inv.registrationNumber,
    billing_period: inv.billingPeriod,
    billing_type: inv.billingType || 'FECHAMENTO_MENSAL',
    batch_id: inv.batchId || null,
    period_start: toPostgresDate(inv.periodStart),
    period_end: toPostgresDate(inv.periodEnd),
    billing_label: inv.billingLabel || null,
    tuition_amount: Number(inv.tuitionAmount) || 0,
    canteen_consumption_total: Number(inv.canteenConsumptionTotal) || 0,
    previous_balance: Number(inv.previousBalance) || 0,
    adjustments_total: Number(inv.adjustmentsTotal) || 0,
    credit_applied: Number(inv.creditApplied) || 0,
    discount_reason: inv.discountReason || null,
    gross_total: Number(inv.grossTotal) || 0,
    paid_total: Number(inv.paidTotal) || 0,
    remaining_balance: Number(inv.remainingBalance) || 0,
    closing_date: toPostgresDate(inv.closingDate) || fallbackDate,
    due_date: toPostgresDate(inv.dueDate) || fallbackDate,
    status: inv.status || 'PUBLICADA',
    sales_ids: inv.salesIds || [],
    sale_item_links: inv.saleItemLinks || [],
    consumption_items: inv.consumptionItems || [],
    payment_allocations: inv.paymentAllocations || [],
    pix_copy_paste_code: inv.pixCopyPasteCode || null,
    pix_qr_code_payload: inv.pixQrCodePayload || null,
    approved_by_user_name: inv.approvedByUserName || null,
    approved_at: inv.approvedAt || null,
    published_at: inv.publishedAt || null,
    canceled_at: inv.canceledAt || null,
    canceled_by_user_name: inv.canceledByUserName || null,
    canceled_reason: inv.canceledReason || null,
    notes: inv.notes || null,
    history: inv.history || [],
    created_at: inv.createdAt || new Date().toISOString(),
    updated_at: inv.updatedAt || new Date().toISOString(),
  };
}

export function mapBillingBatchToSupabase(b: any) {
  const fallbackDate = new Date().toISOString().substring(0, 10);
  return {
    id: b.id,
    type: b.type,
    billing_period: b.billingPeriod,
    period_start: toPostgresDate(b.periodStart),
    period_end: toPostgresDate(b.periodEnd),
    billing_label: b.billingLabel || null,
    due_date: toPostgresDate(b.dueDate) || fallbackDate,
    scope: b.scope || 'ALL_STUDENTS',
    class_group_filter: b.classGroupFilter || null,
    students_count: Number(b.studentsCount) || 0,
    invoices_count: Number(b.invoicesCount) || 0,
    sales_count: Number(b.salesCount) || 0,
    total_amount: Number(b.totalAmount) || 0,
    invoice_ids: b.invoiceIds || [],
    created_by_user_id: b.createdByUserId,
    created_by_user_name: b.createdByUserName,
    status: b.status || 'CONCLUIDO',
    idempotency_key: b.idempotencyKey || null,
    notes: b.notes || null,
    created_at: b.createdAt || new Date().toISOString(),
    updated_at: b.updatedAt || new Date().toISOString(),
  };
}

export function mapPixPaymentToSupabase(pay: any) {
  return {
    id: pay.id,
    invoice_id: pay.invoiceId,
    invoice_code: pay.invoiceCode || pay.invoiceId,
    student_id: pay.studentId,
    student_name: pay.studentName,
    payer_name: pay.payerName,
    payer_role: pay.payerRole || 'RESPONSAVEL',
    amount: Number(pay.amount) || 0,
    transaction_reference: pay.transactionReference,
    receipt_attachment: pay.receiptAttachment || null,
    receipt_notes: pay.receiptNotes || null,
    status: pay.status || 'AGUARDANDO_CONFERENCIA',
    registered_by_user_id: pay.registeredByUserId,
    registered_by_user_name: pay.registeredByUserName,
    registered_at: pay.registeredAt || new Date().toISOString(),
    reviewed_by_user_id: pay.reviewedByUserId || null,
    reviewed_by_user_name: pay.reviewedByUserName || null,
    reviewed_at: pay.reviewedAt || null,
    review_decision_reason: pay.reviewDecisionReason || null,
  };
}

export function mapNotificationToSupabase(n: any) {
  return {
    id: n.id,
    type: n.type,
    recipient_name: n.recipientName,
    recipient_phone: n.recipientPhone,
    recipient_role: n.recipientRole,
    student_name: n.studentName,
    student_id: n.studentId || null,
    invoice_id: n.invoiceId || null,
    message_text: n.messageText,
    status: n.status || 'PROGRAMADO',
    scheduled_for: n.scheduledFor || new Date().toISOString(),
    sent_at: n.sentAt || null,
    attempts_count: Number(n.attemptsCount) || 0,
    last_error_message: n.lastErrorMessage || null,
    metadata: n.metadata || {},
  };
}

export function mapAuditLogToSupabase(a: any) {
  return {
    id: a.id,
    timestamp: a.timestamp || new Date().toISOString(),
    user_id: a.userId,
    user_name: a.userName,
    user_role: a.userRole,
    action: a.action,
    module: a.module,
    details: a.details,
    ip_address: a.ipAddress || null,
    status: a.status || 'SUCESSO',
  };
}

export function mapPasseioToSupabase(p: any) {
  return {
    id: p.id,
    nome: p.nome,
    valor: Number(p.valor) || 0,
    descricao: p.descricao || null,
    data_passeio: toPostgresDate(p.dataPasseio || p.data_passeio),
    ativo: p.ativo !== undefined ? Boolean(p.ativo) : true,
    created_at: p.createdAt || p.created_at || new Date().toISOString(),
    updated_at: p.updatedAt || p.updated_at || new Date().toISOString(),
  };
}

export function mapPasseioFromSupabase(row: any) {
  return {
    id: row.id,
    nome: row.nome,
    valor: Number(row.valor) || 0,
    descricao: row.descricao || null,
    dataPasseio: row.data_passeio || null,
    ativo: row.ativo !== undefined ? Boolean(row.ativo) : true,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function mapTripOperationToSupabase(op: any) {
  return {
    id: op.id,
    catalog_passeio_id: op.catalogPasseioId || null,
    name: op.name,
    description: op.description || '',
    trip_date: toPostgresDate(op.tripDate) || new Date().toISOString().substring(0, 10),
    destination: op.destination,
    notes: op.notes || null,
    responsible_user_id: op.responsibleUserId,
    responsible_user_name: op.responsibleUserName,
    status: op.status || 'RASCUNHO',
    selection_mode: op.selectionMode || 'ALL_STUDENTS',
    distribution_method: op.distributionMethod || 'IGUALITARIA',
    fixed_value_per_student: op.fixedValuePerStudent !== undefined && op.fixedValuePerStudent !== null ? Number(op.fixedValuePerStudent) : null,
    items: op.items || [],
    participants: op.participants || [],
    total_expenses: Number(op.totalExpenses) || 0,
    total_distributed: Number(op.totalDistributed) || 0,
    idempotency_key: op.idempotencyKey || null,
    launched_at: op.launchedAt || null,
    launched_by_user_name: op.launchedByUserName || null,
    history: op.history || [],
    created_at: op.createdAt || new Date().toISOString(),
    updated_at: op.updatedAt || new Date().toISOString(),
  };
}

export function mapTripOperationFromSupabase(row: any) {
  return {
    id: row.id,
    catalogPasseioId: row.catalog_passeio_id || undefined,
    name: row.name,
    description: row.description || '',
    tripDate: row.trip_date,
    destination: row.destination,
    notes: row.notes || undefined,
    responsibleUserId: row.responsible_user_id,
    responsibleUserName: row.responsible_user_name,
    status: row.status || 'RASCUNHO',
    selectionMode: row.selection_mode || 'ALL_STUDENTS',
    distributionMethod: row.distribution_method || 'IGUALITARIA',
    fixedValuePerStudent: row.fixed_value_per_student !== null && row.fixed_value_per_student !== undefined ? Number(row.fixed_value_per_student) : undefined,
    items: Array.isArray(row.items) ? row.items : [],
    participants: Array.isArray(row.participants) ? row.participants : [],
    totalExpenses: Number(row.total_expenses) || 0,
    totalDistributed: Number(row.total_distributed) || 0,
    idempotencyKey: row.idempotency_key || undefined,
    launchedAt: row.launched_at || undefined,
    launchedByUserName: row.launched_by_user_name || undefined,
    history: Array.isArray(row.history) ? row.history : [],
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function mapCashRegisterToSupabase(s: any) {
  return {
    id: s.id,
    opened_by_user_id: s.openedByUserId,
    opened_by_name: s.openedByUserName,
    closed_by_user_id: s.closedByUserId || null,
    closed_by_name: s.closedByUserName || null,
    opened_at: s.openedAt || new Date().toISOString(),
    closed_at: s.closedAt || null,
    opening_balance: Number(s.openingBalance) || 0,
    expected_balance: s.expectedBalance !== undefined && s.expectedBalance !== null ? Number(s.expectedBalance) : null,
    counted_balance: s.countedBalance !== undefined && s.countedBalance !== null ? Number(s.countedBalance) : null,
    difference_amount: s.difference !== undefined && s.difference !== null ? Number(s.difference) : null,
    status: s.status || 'ABERTO',
    notes: s.notes || null,
    payment_totals: s.paymentTotals || {},
  };
}

export function mapCashRegisterFromSupabase(row: any) {
  return {
    id: row.id,
    status: row.status || 'ABERTO',
    openedAt: row.opened_at,
    openedByUserId: row.opened_by_user_id,
    openedByUserName: row.opened_by_name,
    openingBalance: Number(row.opening_balance) || 0,
    closedAt: row.closed_at || undefined,
    closedByUserId: row.closed_by_user_id || undefined,
    closedByUserName: row.closed_by_name || undefined,
    expectedBalance: row.expected_balance !== null && row.expected_balance !== undefined ? Number(row.expected_balance) : undefined,
    countedBalance: row.counted_balance !== null && row.counted_balance !== undefined ? Number(row.counted_balance) : undefined,
    difference: row.difference_amount !== null && row.difference_amount !== undefined ? Number(row.difference_amount) : undefined,
    notes: row.notes || undefined,
  };
}

export function mapCashMovementToSupabase(m: any) {
  return {
    id: m.id,
    cash_register_id: m.sessionId,
    type: m.type,
    amount: Number(m.amount) || 0,
    payment_method: m.paymentMethod || 'DINHEIRO',
    description: m.description,
    reference_id: m.referenceId || null,
    performed_by_user_id: m.performedByUserId,
    performed_by_name: m.performedByUserName,
    timestamp: m.timestamp || new Date().toISOString(),
  };
}

export function mapCashMovementFromSupabase(row: any) {
  return {
    id: row.id,
    sessionId: row.cash_register_id,
    type: row.type,
    paymentMethod: row.payment_method || 'DINHEIRO',
    amount: Number(row.amount) || 0,
    description: row.description,
    referenceId: row.reference_id || undefined,
    performedByUserId: row.performed_by_user_id,
    performedByUserName: row.performed_by_name,
    timestamp: row.timestamp || new Date().toISOString(),
  };
}

export function mapCustomerAccountMovementToSupabase(m: any) {
  return {
    id: m.id,
    student_id: m.studentId,
    operation: m.operation,
    amount: Number(m.amount) || 0,
    reason: m.reason,
    performed_by_user_id: m.performedByUserId,
    performed_by_name: m.performedByUserName,
    created_at: m.createdAt || new Date().toISOString(),
  };
}

export function mapStockMovementFromSupabase(row: any) {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    type: row.type,
    quantity: Number(row.quantity) || 0,
    previousStock: Number(row.previous_stock) || 0,
    newStock: Number(row.new_stock) || 0,
    reason: row.reason,
    performedByUserId: row.performed_by_user_id,
    performedByUserName: row.performed_by_user_name,
    referenceId: row.reference_id || undefined,
    timestamp: row.timestamp || new Date().toISOString(),
  };
}

export function mapPixPaymentFromSupabase(row: any) {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    invoiceCode: row.invoice_code || row.invoice_id,
    studentId: row.student_id,
    studentName: row.student_name,
    payerName: row.payer_name,
    payerRole: row.payer_role || 'RESPONSAVEL',
    amount: Number(row.amount) || 0,
    transactionReference: row.transaction_reference,
    receiptAttachment: row.receipt_attachment || undefined,
    receiptNotes: row.receipt_notes || undefined,
    status: row.status || 'AGUARDANDO_CONFERENCIA',
    registeredByUserId: row.registered_by_user_id,
    registeredByUserName: row.registered_by_user_name,
    registeredAt: row.registered_at || new Date().toISOString(),
    reviewedByUserId: row.reviewed_by_user_id || undefined,
    reviewedByUserName: row.reviewed_by_user_name || undefined,
    reviewedAt: row.reviewed_at || undefined,
    reviewDecisionReason: row.review_decision_reason || undefined,
  };
}

export function mapNotificationFromSupabase(row: any) {
  return {
    id: row.id,
    type: row.type,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    recipientRole: row.recipient_role,
    studentName: row.student_name,
    studentId: row.student_id || undefined,
    invoiceId: row.invoice_id || undefined,
    messageText: row.message_text,
    status: row.status || 'PROGRAMADO',
    scheduledFor: row.scheduled_for || new Date().toISOString(),
    sentAt: row.sent_at || undefined,
    attemptsCount: Number(row.attempts_count) || 0,
    lastErrorMessage: row.last_error_message || undefined,
    metadata: row.metadata || undefined,
  };
}

export function mapBillingBatchFromSupabase(row: any) {
  return {
    id: row.id,
    type: row.type,
    billingPeriod: row.billing_period,
    periodStart: row.period_start || undefined,
    periodEnd: row.period_end || undefined,
    billingLabel: row.billing_label || undefined,
    dueDate: row.due_date,
    scope: row.scope || 'ALL_STUDENTS',
    classGroupFilter: row.class_group_filter || undefined,
    studentsCount: Number(row.students_count) || 0,
    invoicesCount: Number(row.invoices_count) || 0,
    salesCount: Number(row.sales_count) || 0,
    totalAmount: Number(row.total_amount) || 0,
    invoiceIds: Array.isArray(row.invoice_ids) ? row.invoice_ids : [],
    createdByUserId: row.created_by_user_id,
    createdByUserName: row.created_by_user_name,
    status: row.status || 'CONCLUIDO',
    idempotencyKey: row.idempotency_key || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export function mapReceiptFromSupabase(row: any) {
  return {
    id: row.id,
    receiptCode: row.receipt_code,
    saleId: row.sale_id,
    version: Number(row.version) || 1,
    status: row.status || 'ATIVO',
    institution: row.institution || {},
    saleSnapshot: row.sale_snapshot || {},
    studentSnapshot: row.student_snapshot || {},
    items: Array.isArray(row.items) ? row.items : [],
    financialSummary: row.financial_summary || {},
    payments: Array.isArray(row.payments) ? row.payments : [],
    operational: row.operational || {},
    reversals: Array.isArray(row.reversals) ? row.reversals : [],
    reprintCount: Number(row.reprint_count) || 0,
    lastReprintedAt: row.last_reprinted_at || undefined,
    lastReprintedByUserName: row.last_reprinted_by_user_name || undefined,
    customHeaderSnapshot: row.custom_header_snapshot || undefined,
    customFooterSnapshot: row.custom_footer_snapshot || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

// ============================================================================
// SINGLE RECORD ASYNC SYNC HELPER (Auto-Sync)
// ============================================================================

const permissionDeniedBackoff = new Map<string, number>();
const missingColumnsCache = new Map<string, Set<string>>();

function stripExtendedColumns(table: string, row: Record<string, any>): Record<string, any> | null {
  if (table === 'products') {
    const {
      images,
      description,
      cost_price,
      price_status,
      archived,
      archived_at,
      archived_reason,
      ...rest
    } = row;
    return rest;
  }
  if (table === 'students') {
    const {
      cpf,
      consumption_limit,
      credit_balance,
      consumption_blocked,
      consumption_blocked_reason,
      ...rest
    } = row;
    return rest;
  }
  if (table === 'settings' && 'receipt_settings' in row) {
    const { receipt_settings, ...rest } = row;
    return rest;
  }
  if (table === 'sales') {
    const {
      subtotal,
      discount_amount,
      payment_method,
      cash_session_id,
      notes,
      reversed_amount,
      billing_status,
      billed_amount,
      invoice_allocations,
      payments,
      amount_paid,
      change_amount,
      credit_used,
      terminal_id,
      receipt_id,
      receipt_code,
      origin,
      trip_operation_id,
      trip_name,
      trip_date,
      trip_destination,
      ...rest
    } = row;
    return rest;
  }
  if (table === 'invoices') {
    const {
      billing_type,
      batch_id,
      period_start,
      period_end,
      billing_label,
      credit_applied,
      discount_reason,
      sale_item_links,
      canceled_at,
      canceled_by_user_name,
      canceled_reason,
      history,
      ...rest
    } = row;
    return rest;
  }
  return null;
}

function extractMissingColumn(errorMessage?: string): string | null {
  if (!errorMessage) return null;
  const schemaCacheMatch = errorMessage.match(/Could not find the '([^']+)' column of '[^']+' in the schema cache/i);
  if (schemaCacheMatch) return schemaCacheMatch[1];
  const pgColumnMatch = errorMessage.match(/column "([^"]+)" of relation "[^"]+" does not exist/i);
  if (pgColumnMatch) return pgColumnMatch[1];
  return null;
}

function omitKeys(row: Record<string, any>, keysToOmit: Set<string>): Record<string, any> {
  if (keysToOmit.size === 0) return row;
  const next: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (!keysToOmit.has(k)) {
      next[k] = v;
    }
  }
  return next;
}

function applyLegacyConstraintFallback(
  table: string,
  rows: Record<string, any>[],
  errorMessage?: string
): boolean {
  const msg = String(errorMessage || '');
  if (table === 'stock_movements' && msg.includes('stock_movements_type_check')) {
    let changed = false;
    for (const row of rows) {
      if (row.type === 'PERDA_AVARIA') {
        row.type = 'AJUSTE_MANUAL';
        if (typeof row.reason === 'string' && !row.reason.startsWith('[PERDA/AVARIA]')) {
          row.reason = `[PERDA/AVARIA] ${row.reason}`;
        }
        changed = true;
      }
    }
    return changed;
  }
  if (table === 'users' && msg.includes('users_role_check')) {
    let changed = false;
    for (const row of rows) {
      if (row.role === 'MANAGER') {
        row.role = 'ADMIN';
        changed = true;
      } else if (row.role === 'STOCKIST' || row.role === 'VIEWER') {
        row.role = 'CASHIER';
        changed = true;
      }
    }
    return changed;
  }
  return false;
}

async function upsertWithSchemaFallback(
  client: SupabaseClient,
  table: string,
  payload: Record<string, any> | Record<string, any>[]
): Promise<{ error: any }> {
  const isArray = Array.isArray(payload);
  let rows: Record<string, any>[] = isArray
    ? payload.map(r => ({ ...r }))
    : [{ ...payload }];

  const knownMissing = missingColumnsCache.get(table);
  if (knownMissing && knownMissing.size > 0) {
    rows = rows.map(r => omitKeys(r, knownMissing));
  }

  let appliedBulkStrip = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const body = isArray ? rows : rows[0];
    const { error } = await client.from(table).upsert(body, { onConflict: 'id' });
    if (!error) {
      return { error: null };
    }

    if (applyLegacyConstraintFallback(table, rows, error.message)) {
      continue;
    }

    const missingCol = extractMissingColumn(error.message);
    if (!missingCol) {
      return { error };
    }

    let colSet = missingColumnsCache.get(table);
    if (!colSet) {
      colSet = new Set<string>();
      missingColumnsCache.set(table, colSet);
    }
    colSet.add(missingCol);

    if (!appliedBulkStrip) {
      appliedBulkStrip = true;
      const sampleStripped = stripExtendedColumns(table, rows[0]);
      if (sampleStripped) {
        for (const key of Object.keys(rows[0])) {
          if (!(key in sampleStripped)) {
            colSet.add(key);
          }
        }
      }
    }

    const prevKeyCount = Object.keys(rows[0] || {}).length;
    rows = rows.map(r => omitKeys(r, colSet!));
    const nextKeyCount = Object.keys(rows[0] || {}).length;
    if (nextKeyCount === prevKeyCount || nextKeyCount === 0) {
      return { error };
    }
  }

  return { error: { message: `Excedido o limite de tentativas de compatibilidade de schema na tabela "${table}".` } };
}

export async function syncRecordToSupabase(
  table: string,
  record: any,
  mapper?: (item: any) => any
): Promise<boolean> {
  const settings = db.getSettings();
  if (settings.supabaseActive === false) {
    return false;
  }

  // Evita spam no console caso o usuário ainda não tenha executado o SQL/GRANT no Supabase SQL Editor
  const blockedUntil = permissionDeniedBackoff.get(table);
  if (blockedUntil && Date.now() < blockedUntil) {
    return false;
  }

  const client = getSupabaseClient();
  if (!client) {
    return false;
  }

  try {
    const payload = mapper ? mapper(record) : record;
    const { error } = await upsertWithSchemaFallback(client, table, payload);
    if (error) {
      const msg = String(error.message || '');
      const msgLower = msg.toLowerCase();
      if (msgLower.includes('permission denied')) {
        permissionDeniedBackoff.set(table, Date.now() + 5 * 60 * 1000);
        console.warn(
          `[Supabase Auto-Sync] Permissão pendente na tabela "${table}" (${msg}). Execute no SQL Editor do Supabase: GRANT ALL PRIVILEGES ON TABLE public.${table} TO anon, authenticated, service_role;`
        );
      } else if (msgLower.includes('could not find the table') || msgLower.includes('does not exist')) {
        permissionDeniedBackoff.set(table, Date.now() + 5 * 60 * 1000);
        console.warn(
          `[Supabase Auto-Sync] Tabela "${table}" ainda não criada no Supabase (${msg}). Execute o script supabase_schema.sql no SQL Editor do Supabase.`
        );
      } else {
        console.warn(`[Supabase Auto-Sync] Erro ao sincronizar ${table}:`, msg);
      }
      return false;
    }
    permissionDeniedBackoff.delete(table);
    return true;
  } catch (err: any) {
    console.warn(`[Supabase Auto-Sync] Falha ao enviar para ${table}:`, err.message);
    return false;
  }
}

export async function deleteRecordFromSupabase(
  table: string,
  id: string
): Promise<boolean> {
  const settings = db.getSettings();
  if (settings.supabaseActive === false) {
    return false;
  }

  const client = getSupabaseClient();
  if (!client) {
    return false;
  }

  try {
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) {
      console.warn(`[Supabase Auto-Sync] Erro ao excluir em ${table}:`, error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[Supabase Auto-Sync] Falha ao excluir em ${table}:`, err.message);
    return false;
  }
}

// ============================================================================
// COMPLETE PUSH SYNC: Sincroniza todas as tabelas locais com o Supabase
// ============================================================================

export interface FullSyncResult {
  success: boolean;
  timestamp: string;
  tables: Record<string, { count: number; status: 'OK' | 'ERROR'; error?: string }>;
  totalRecordsSynced: number;
  message: string;
}

export async function syncAllToSupabase(): Promise<FullSyncResult> {
  // Limpa backoff e cache de colunas para re-testar todas as tabelas imediatamente após o usuário rodar o SQL
  permissionDeniedBackoff.clear();
  missingColumnsCache.clear();

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase não configurado. Preencha SUPABASE_URL e SUPABASE_ANON_KEY nas configurações ou .env.');
  }

  const results: Record<string, { count: number; status: 'OK' | 'ERROR'; error?: string }> = {};
  let totalCount = 0;

  // 1. Settings
  try {
    const settingsRow = mapSettingsToSupabase(db.getSettings());
    const { error } = await upsertWithSchemaFallback(client, 'settings', [settingsRow]);
    if (error) throw error;
    results['settings'] = { count: 1, status: 'OK' };
    totalCount += 1;
  } catch (e: any) {
    results['settings'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 2. Users
  try {
    const usersRows = db.getUsers().map(mapUserToSupabase);
    if (usersRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'users', usersRows);
      if (error) throw error;
    }
    results['users'] = { count: usersRows.length, status: 'OK' };
    totalCount += usersRows.length;
  } catch (e: any) {
    results['users'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 3. Guardians
  try {
    const guardiansRows = db.getGuardians().map(mapGuardianToSupabase);
    if (guardiansRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'guardians', guardiansRows);
      if (error) throw error;
    }
    results['guardians'] = { count: guardiansRows.length, status: 'OK' };
    totalCount += guardiansRows.length;
  } catch (e: any) {
    results['guardians'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 4. Students
  try {
    const studentsRows = db.getStudents().map(mapStudentToSupabase);
    if (studentsRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'students', studentsRows);
      if (error) throw error;
    }
    results['students'] = { count: studentsRows.length, status: 'OK' };
    totalCount += studentsRows.length;
  } catch (e: any) {
    results['students'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 5. Products
  try {
    const productsRows = db.getProducts().map(mapProductToSupabase);
    if (productsRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'products', productsRows);
      if (error) throw error;
    }
    results['products'] = { count: productsRows.length, status: 'OK' };
    totalCount += productsRows.length;
  } catch (e: any) {
    results['products'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 6. Stock Movements
  try {
    const movementsRows = db.getStockMovements().map(mapStockMovementToSupabase);
    if (movementsRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'stock_movements', movementsRows);
      if (error) throw error;
    }
    results['stock_movements'] = { count: movementsRows.length, status: 'OK' };
    totalCount += movementsRows.length;
  } catch (e: any) {
    results['stock_movements'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 7. Sales
  try {
    const salesRows = db.getSales().map(mapSaleToSupabase);
    if (salesRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'sales', salesRows);
      if (error) throw error;
    }
    results['sales'] = { count: salesRows.length, status: 'OK' };
    totalCount += salesRows.length;
  } catch (e: any) {
    results['sales'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 8. Invoices
  try {
    const invoicesRows = db.getInvoices().map(mapInvoiceToSupabase);
    if (invoicesRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'invoices', invoicesRows);
      if (error) throw error;
    }
    results['invoices'] = { count: invoicesRows.length, status: 'OK' };
    totalCount += invoicesRows.length;
  } catch (e: any) {
    results['invoices'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 9. Pix Payments
  try {
    const paymentsRows = db.getPixPayments().map(mapPixPaymentToSupabase);
    if (paymentsRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'pix_payments', paymentsRows);
      if (error) throw error;
    }
    results['pix_payments'] = { count: paymentsRows.length, status: 'OK' };
    totalCount += paymentsRows.length;
  } catch (e: any) {
    results['pix_payments'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 10. WhatsApp Notifications
  try {
    const notifRows = db.getWhatsAppNotifications().map(mapNotificationToSupabase);
    if (notifRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'whatsapp_notifications', notifRows);
      if (error) throw error;
    }
    results['whatsapp_notifications'] = { count: notifRows.length, status: 'OK' };
    totalCount += notifRows.length;
  } catch (e: any) {
    results['whatsapp_notifications'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 11. Audit Logs
  try {
    const logsRows = db.getAuditLogs().map(mapAuditLogToSupabase);
    if (logsRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'audit_logs', logsRows);
      if (error) throw error;
    }
    results['audit_logs'] = { count: logsRows.length, status: 'OK' };
    totalCount += logsRows.length;
  } catch (e: any) {
    results['audit_logs'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 12. Passeios
  try {
    const passeiosRows = db.getPasseios().map(mapPasseioToSupabase);
    if (passeiosRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'passeios', passeiosRows);
      if (error) throw error;
    }
    results['passeios'] = { count: passeiosRows.length, status: 'OK' };
    totalCount += passeiosRows.length;
  } catch (e: any) {
    results['passeios'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 13. Billing Batches
  try {
    const batchesRows = db.getBillingBatches().map(mapBillingBatchToSupabase);
    if (batchesRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'billing_batches', batchesRows);
      if (error) throw error;
    }
    results['billing_batches'] = { count: batchesRows.length, status: 'OK' };
    totalCount += batchesRows.length;
  } catch (e: any) {
    results['billing_batches'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 14. Sales Receipts
  try {
    const receiptsRows = db.getReceipts().map(mapReceiptToSupabase);
    if (receiptsRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'sales_receipts', receiptsRows);
      if (error) throw error;
    }
    results['sales_receipts'] = { count: receiptsRows.length, status: 'OK' };
    totalCount += receiptsRows.length;
  } catch (e: any) {
    results['sales_receipts'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 15. Trip Operations (PDV de Passeios)
  try {
    const tripOpsRows = db.getTripOperations().map(mapTripOperationToSupabase);
    if (tripOpsRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'trip_operations', tripOpsRows);
      if (error) throw error;
    }
    results['trip_operations'] = { count: tripOpsRows.length, status: 'OK' };
    totalCount += tripOpsRows.length;
  } catch (e: any) {
    results['trip_operations'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 16. Cash Registers (Sessões de Caixa)
  try {
    const cashSessionsRows = db.getCashSessions().map(mapCashRegisterToSupabase);
    if (cashSessionsRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'cash_registers', cashSessionsRows);
      if (error) throw error;
    }
    results['cash_registers'] = { count: cashSessionsRows.length, status: 'OK' };
    totalCount += cashSessionsRows.length;
  } catch (e: any) {
    results['cash_registers'] = { count: 0, status: 'ERROR', error: e.message };
  }

  // 17. Cash Movements (Movimentações de Caixa)
  try {
    const cashMovsRows = db.getCashMovements().map(mapCashMovementToSupabase);
    if (cashMovsRows.length > 0) {
      const { error } = await upsertWithSchemaFallback(client, 'cash_movements', cashMovsRows);
      if (error) throw error;
    }
    results['cash_movements'] = { count: cashMovsRows.length, status: 'OK' };
    totalCount += cashMovsRows.length;
  } catch (e: any) {
    results['cash_movements'] = { count: 0, status: 'ERROR', error: e.message };
  }

  const hasErrors = Object.values(results).some(r => r.status === 'ERROR');

  return {
    success: !hasErrors,
    timestamp: new Date().toISOString(),
    tables: results,
    totalRecordsSynced: totalCount,
    message: hasErrors 
      ? 'Algumas tabelas não puderam ser sincronizadas. Execute o script supabase_schema.sql no SQL Editor do seu Supabase para criar as tabelas ausentes.' 
      : `Sincronização completa realizada com sucesso! ${totalCount} registros sincronizados no Supabase.`,
  };
}

// ============================================================================
// COMPLETE PULL SYNC: Puxa todos os dados do Supabase para o banco local
// ============================================================================

function mergePreservingLocal<T extends Record<string, any>>(existing: T | null, incoming: Partial<T>): T {
  if (!existing) return incoming as T;
  const merged: Record<string, any> = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== undefined) {
      merged[k] = v;
    }
  }
  return merged as T;
}

export async function syncFromSupabase(): Promise<{
  success: boolean;
  totalPulled: number;
  tables: Record<string, number>;
  message: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase não conectado. Configure as credenciais primeiro.');
  }

  const counts: Record<string, number> = {};
  let total = 0;

  // 1. Products
  const { data: prodData } = await client.from('products').select('*');
  if (prodData && prodData.length > 0) {
    const localProds = db.getProducts();
    for (const row of prodData) {
      const idx = localProds.findIndex(p => p.id === row.id);
      const existingLocal = idx >= 0 ? localProds[idx] : null;
      const parsedPrice =
        row.price === null || row.price === undefined ? NaN : Number(row.price);
      const hasValidPrice = !Number.isNaN(parsedPrice) && parsedPrice > 0;
      const mapped: Record<string, any> = {
        id: row.id,
        name: row.name,
        category: row.category,
        price: hasValidPrice ? Math.round(parsedPrice * 100) / 100 : null,
        priceStatus: (row.price_status || (hasValidPrice ? 'DEFINED' : 'PENDING')) as 'PENDING' | 'DEFINED',
        internalCode: row.internal_code,
        barcode: row.barcode || undefined,
        currentStock: Number(row.current_stock),
        minStock: Number(row.min_stock),
        status: row.status,
        imageUrl: row.image_url || undefined,
        unit: row.unit || 'un',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      if (row.description !== undefined) mapped.description = row.description || undefined;
      if (row.cost_price !== undefined && row.cost_price !== null) mapped.costPrice = Number(row.cost_price);
      if (Array.isArray(row.images)) mapped.images = row.images;
      if (row.archived !== undefined) mapped.archived = Boolean(row.archived);
      if (row.archived_at !== undefined) mapped.archivedAt = row.archived_at || undefined;
      if (row.archived_reason !== undefined) mapped.archivedReason = row.archived_reason || undefined;

      if (idx >= 0) localProds[idx] = mergePreservingLocal(existingLocal as any, mapped) as any;
      else localProds.push(mapped as any);
    }
    counts['products'] = prodData.length;
    total += prodData.length;
  }

  // 2. Guardians
  const { data: guardData } = await client.from('guardians').select('*');
  if (guardData && guardData.length > 0) {
    const localGuardians = db.getGuardians();
    for (const row of guardData) {
      const idx = localGuardians.findIndex(g => g.id === row.id);
      const mapped = mapGuardianFromSupabase(row);
      if (idx >= 0) localGuardians[idx] = mergePreservingLocal(localGuardians[idx] as any, mapped) as any;
      else localGuardians.push(mapped as any);
    }
    counts['guardians'] = guardData.length;
    total += guardData.length;
  }

  // 3. Students
  const { data: stuData } = await client.from('students').select('*');
  if (stuData && stuData.length > 0) {
    const localStudents = db.getStudents();
    for (const row of stuData) {
      const idx = localStudents.findIndex(s => s.id === row.id);
      const existingLocal = idx >= 0 ? localStudents[idx] : null;
      const mapped: Record<string, any> = {
        id: row.id,
        name: row.name,
        registrationNumber: row.registration_number,
        classGroup: row.class_group,
        email: row.email,
        phone: row.phone,
        avatar: row.avatar || undefined,
        status: row.status,
        defaultTuition: Number(row.default_tuition),
        currentConsumptionBalance: Number(row.current_consumption_balance),
        totalOpenDebt: Number(row.total_open_debt),
        payerRule: row.payer_rule,
        reportRecipientRule: row.report_recipient_rule,
        dueReminderRecipientRule: row.due_reminder_recipient_rule,
        paymentConfirmationRecipientRule: row.payment_confirmation_recipient_rule,
        allowedChannels: row.allowed_channels || ['WHATSAPP', 'EMAIL'],
        guardians: row.guardians || [],
        notes: row.notes || undefined,
        createdAt: row.created_at,
      };
      if (row.cpf !== undefined) mapped.cpf = row.cpf || undefined;
      if (row.consumption_limit !== undefined) mapped.consumptionLimit = row.consumption_limit !== null ? Number(row.consumption_limit) : undefined;
      if (row.credit_balance !== undefined) mapped.creditBalance = Number(row.credit_balance) || 0;
      if (row.consumption_blocked !== undefined) mapped.consumptionBlocked = Boolean(row.consumption_blocked);
      if (row.consumption_blocked_reason !== undefined) mapped.consumptionBlockedReason = row.consumption_blocked_reason || undefined;

      if (idx >= 0) localStudents[idx] = mergePreservingLocal(existingLocal as any, mapped) as any;
      else localStudents.push(mapped as any);
    }
    counts['students'] = stuData.length;
    total += stuData.length;
  }

  // 4. Invoices
  const { data: invData } = await client.from('invoices').select('*');
  if (invData && invData.length > 0) {
    const localInvoices = db.getInvoices();
    for (const row of invData) {
      const idx = localInvoices.findIndex(i => i.id === row.id);
      const existingLocal = idx >= 0 ? localInvoices[idx] : null;
      const mapped: Record<string, any> = {
        id: row.id,
        studentId: row.student_id,
        studentName: row.student_name,
        registrationNumber: row.registration_number,
        billingPeriod: row.billing_period,
        tuitionAmount: Number(row.tuition_amount),
        canteenConsumptionTotal: Number(row.canteen_consumption_total),
        previousBalance: Number(row.previous_balance),
        adjustmentsTotal: Number(row.adjustments_total),
        grossTotal: Number(row.gross_total),
        paidTotal: Number(row.paid_total),
        remainingBalance: Number(row.remaining_balance),
        closingDate: row.closing_date,
        dueDate: row.due_date,
        status: row.status,
        salesIds: row.sales_ids || [],
        consumptionItems: row.consumption_items || [],
        paymentAllocations: row.payment_allocations || [],
        pixCopyPasteCode: row.pix_copy_paste_code || undefined,
        pixQrCodePayload: row.pix_qr_code_payload || undefined,
        approvedByUserName: row.approved_by_user_name || undefined,
        approvedAt: row.approved_at || undefined,
        publishedAt: row.published_at || undefined,
        notes: row.notes || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      if (row.billing_type !== undefined) mapped.billingType = row.billing_type;
      if (row.batch_id !== undefined) mapped.batchId = row.batch_id || undefined;
      if (row.period_start !== undefined) mapped.periodStart = row.period_start || undefined;
      if (row.period_end !== undefined) mapped.periodEnd = row.period_end || undefined;
      if (row.billing_label !== undefined) mapped.billingLabel = row.billing_label || undefined;
      if (row.credit_applied !== undefined) mapped.creditApplied = Number(row.credit_applied) || 0;
      if (row.discount_reason !== undefined) mapped.discountReason = row.discount_reason || undefined;
      if (Array.isArray(row.sale_item_links)) mapped.saleItemLinks = row.sale_item_links;
      if (row.canceled_at !== undefined) mapped.canceledAt = row.canceled_at || undefined;
      if (row.canceled_by_user_name !== undefined) mapped.canceledByUserName = row.canceled_by_user_name || undefined;
      if (row.canceled_reason !== undefined) mapped.canceledReason = row.canceled_reason || undefined;
      if (Array.isArray(row.history)) mapped.history = row.history;

      if (idx >= 0) localInvoices[idx] = mergePreservingLocal(existingLocal as any, mapped) as any;
      else localInvoices.push(mapped as any);
    }
    counts['invoices'] = invData.length;
    total += invData.length;
  }

  // 5. Passeios
  const { data: passData } = await client.from('passeios').select('*').order('created_at', { ascending: false });
  if (passData && passData.length > 0) {
    const localPasseios = db.getPasseios();
    for (const row of passData) {
      const idx = localPasseios.findIndex(p => p.id === row.id);
      const mapped = mapPasseioFromSupabase(row);
      if (idx >= 0) localPasseios[idx] = mapped;
      else localPasseios.push(mapped);
    }
    counts['passeios'] = passData.length;
    total += passData.length;
  }

  // 6. Sales (including PDV de Passeios launches)
  const { data: salesData } = await client.from('sales').select('*').order('created_at', { ascending: false });
  if (salesData && salesData.length > 0) {
    const localSales = db.getSales();
    for (const row of salesData) {
      const idx = localSales.findIndex(s => s.id === row.id);
      const mapped = mapSaleFromSupabase(row);
      if (idx >= 0) localSales[idx] = mergePreservingLocal(localSales[idx] as any, mapped) as any;
      else localSales.push(mapped as any);
    }
    counts['sales'] = salesData.length;
    total += salesData.length;
  }

  // 7. Stock Movements
  const { data: movData } = await client.from('stock_movements').select('*').order('timestamp', { ascending: false }).limit(500);
  if (movData && movData.length > 0) {
    const localMovs = db.getStockMovements();
    for (const row of movData) {
      const idx = localMovs.findIndex(m => m.id === row.id);
      const mapped = mapStockMovementFromSupabase(row);
      if (idx >= 0) localMovs[idx] = mergePreservingLocal(localMovs[idx] as any, mapped) as any;
      else localMovs.push(mapped as any);
    }
    counts['stock_movements'] = movData.length;
    total += movData.length;
  }

  // 8. Pix Payments
  const { data: pixData } = await client.from('pix_payments').select('*').order('registered_at', { ascending: false });
  if (pixData && pixData.length > 0) {
    const localPix = db.getPixPayments();
    for (const row of pixData) {
      const idx = localPix.findIndex(p => p.id === row.id);
      const mapped = mapPixPaymentFromSupabase(row);
      if (idx >= 0) localPix[idx] = mergePreservingLocal(localPix[idx] as any, mapped) as any;
      else localPix.push(mapped as any);
    }
    counts['pix_payments'] = pixData.length;
    total += pixData.length;
  }

  // 9. WhatsApp Notifications
  const { data: notifData } = await client.from('whatsapp_notifications').select('*').order('scheduled_for', { ascending: false }).limit(300);
  if (notifData && notifData.length > 0) {
    const localNotifs = db.getWhatsAppNotifications();
    for (const row of notifData) {
      const idx = localNotifs.findIndex(n => n.id === row.id);
      const mapped = mapNotificationFromSupabase(row);
      if (idx >= 0) localNotifs[idx] = mergePreservingLocal(localNotifs[idx] as any, mapped) as any;
      else localNotifs.push(mapped as any);
    }
    counts['whatsapp_notifications'] = notifData.length;
    total += notifData.length;
  }

  // 10. Trip Operations (PDV de Passeios)
  const { data: tripOpsData, error: tripOpsError } = await client
    .from('trip_operations')
    .select('*')
    .order('created_at', { ascending: false });
  if (!tripOpsError && tripOpsData && tripOpsData.length > 0) {
    const localTripOps = db.getTripOperations();
    for (const row of tripOpsData) {
      const idx = localTripOps.findIndex(op => op.id === row.id);
      const mapped = mapTripOperationFromSupabase(row);
      if (idx >= 0) localTripOps[idx] = mapped as any;
      else localTripOps.push(mapped as any);
    }
    counts['trip_operations'] = tripOpsData.length;
    total += tripOpsData.length;
  }

  // 11. Sales Receipts (when table exists)
  const { data: receiptsData, error: receiptsError } = await client
    .from('sales_receipts')
    .select('*')
    .order('created_at', { ascending: false });
  if (!receiptsError && receiptsData && receiptsData.length > 0) {
    const localReceipts = db.getReceipts();
    for (const row of receiptsData) {
      const idx = localReceipts.findIndex(r => r.id === row.id);
      const mapped = mapReceiptFromSupabase(row);
      if (idx >= 0) localReceipts[idx] = mergePreservingLocal(localReceipts[idx] as any, mapped) as any;
      else localReceipts.push(mapped as any);
    }
    counts['sales_receipts'] = receiptsData.length;
    total += receiptsData.length;
  }

  // 12. Billing Batches (when table exists)
  const { data: batchesData, error: batchesError } = await client
    .from('billing_batches')
    .select('*')
    .order('created_at', { ascending: false });
  if (!batchesError && batchesData && batchesData.length > 0) {
    const localBatches = db.getBillingBatches();
    for (const row of batchesData) {
      const idx = localBatches.findIndex(b => b.id === row.id);
      const mapped = mapBillingBatchFromSupabase(row);
      if (idx >= 0) localBatches[idx] = mergePreservingLocal(localBatches[idx] as any, mapped) as any;
      else localBatches.push(mapped as any);
    }
    counts['billing_batches'] = batchesData.length;
    total += batchesData.length;
  }

  // 13. Cash Registers & Movements (when tables exist)
  const { data: cashRegData, error: cashRegError } = await client
    .from('cash_registers')
    .select('*')
    .order('opened_at', { ascending: false });
  if (!cashRegError && cashRegData && cashRegData.length > 0) {
    const localSessions = db.getCashSessions();
    for (const row of cashRegData) {
      const idx = localSessions.findIndex(s => s.id === row.id);
      const mapped = mapCashRegisterFromSupabase(row);
      if (idx >= 0) localSessions[idx] = mergePreservingLocal(localSessions[idx] as any, mapped) as any;
      else localSessions.push(mapped as any);
    }
    counts['cash_registers'] = cashRegData.length;
    total += cashRegData.length;
  }

  const { data: cashMovData, error: cashMovError } = await client
    .from('cash_movements')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(500);
  if (!cashMovError && cashMovData && cashMovData.length > 0) {
    const localMovs = db.getCashMovements();
    for (const row of cashMovData) {
      const idx = localMovs.findIndex(m => m.id === row.id);
      const mapped = mapCashMovementFromSupabase(row);
      if (idx >= 0) localMovs[idx] = mergePreservingLocal(localMovs[idx] as any, mapped) as any;
      else localMovs.push(mapped as any);
    }
    counts['cash_movements'] = cashMovData.length;
    total += cashMovData.length;
  }

  // Persist locally
  (db as any).saveDatabase?.();

  return {
    success: true,
    totalPulled: total,
    tables: counts,
    message: `${total} registros atualizados a partir do Supabase com sucesso.`,
  };
}
