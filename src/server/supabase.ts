import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { db } from './db.ts';

let cachedClient: SupabaseClient | null = null;
let lastUsedUrl = '';
let lastUsedKey = '';

export function getSupabaseCredentials() {
  const settings = db.getSettings();
  let rawUrl = (
    (settings as any)?.supabaseUrl || 
    process.env.SUPABASE_URL || 
    process.env.VITE_SUPABASE_URL || 
    ''
  ).trim();

  // Remove common accidental suffixes like /rest/v1 or trailing slashes
  const url = rawUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');

  const key = (
    (settings as any)?.supabaseServiceRoleKey || 
    (settings as any)?.supabaseAnonKey || 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.SUPABASE_ANON_KEY || 
    process.env.VITE_SUPABASE_ANON_KEY || 
    ''
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

    const testQueries = await Promise.allSettled([
      client.from('settings').select('id', { count: 'exact', head: true }),
      client.from('products').select('id', { count: 'exact', head: true }),
      client.from('students').select('id', { count: 'exact', head: true }),
      client.from('invoices').select('id', { count: 'exact', head: true }),
      client.from('sales').select('id', { count: 'exact', head: true }),
    ]);

    const tablesFound: string[] = [];
    const recordsCount: Record<string, number> = {};

    const tableNames = ['settings', 'products', 'students', 'invoices', 'sales'];
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
    updated_at: s.updatedAt || new Date().toISOString(),
    updated_by_user_name: s.updatedByUserName || 'Sistema'
  };
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

export function mapGuardianToSupabase(g: any) {
  return {
    id: g.id,
    name: g.name,
    cpf: g.cpf,
    email: g.email,
    phone: g.phone,
    relationship_default: g.relationshipDefault || 'Responsável',
    student_ids: g.studentIds || [],
    created_at: g.createdAt || new Date().toISOString(),
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
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: Number(p.price) || 0,
    internal_code: p.internalCode,
    barcode: p.barcode || null,
    current_stock: Number(p.currentStock) || 0,
    min_stock: Number(p.minStock) || 0,
    status: p.status || 'ACTIVE',
    image_url: p.imageUrl || null,
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
    total: Number(sa.total) || 0,
    operator_user_id: sa.operatorUserId,
    operator_user_name: sa.operatorUserName,
    status: sa.status || 'COMPLETED',
    reversed_reason: sa.reversedReason || null,
    reversed_by_user_name: sa.reversedByUserName || null,
    reversed_at: sa.reversedAt || null,
    billing_period: sa.billingPeriod,
    invoice_id: sa.invoiceId || null,
    idempotency_key: sa.idempotencyKey || null,
    created_at: sa.createdAt || new Date().toISOString(),
  };
}

export function mapInvoiceToSupabase(inv: any) {
  return {
    id: inv.id,
    student_id: inv.studentId,
    student_name: inv.studentName,
    registration_number: inv.registrationNumber,
    billing_period: inv.billingPeriod,
    tuition_amount: Number(inv.tuitionAmount) || 0,
    canteen_consumption_total: Number(inv.canteenConsumptionTotal) || 0,
    previous_balance: Number(inv.previousBalance) || 0,
    adjustments_total: Number(inv.adjustmentsTotal) || 0,
    gross_total: Number(inv.grossTotal) || 0,
    paid_total: Number(inv.paidTotal) || 0,
    remaining_balance: Number(inv.remainingBalance) || 0,
    closing_date: inv.closingDate,
    due_date: inv.dueDate,
    status: inv.status || 'PUBLICADA',
    sales_ids: inv.salesIds || [],
    consumption_items: inv.consumptionItems || [],
    payment_allocations: inv.paymentAllocations || [],
    pix_copy_paste_code: inv.pixCopyPasteCode || null,
    pix_qr_code_payload: inv.pixQrCodePayload || null,
    approved_by_user_name: inv.approvedByUserName || null,
    approved_at: inv.approvedAt || null,
    published_at: inv.publishedAt || null,
    notes: inv.notes || null,
    created_at: inv.createdAt || new Date().toISOString(),
    updated_at: inv.updatedAt || new Date().toISOString(),
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

// ============================================================================
// SINGLE RECORD ASYNC SYNC HELPER (Auto-Sync)
// ============================================================================

export async function syncRecordToSupabase(
  table: string,
  record: any,
  mapper?: (item: any) => any
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
    const payload = mapper ? mapper(record) : record;
    const { error } = await client.from(table).upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn(`[Supabase Auto-Sync] Erro ao sincronizar ${table}:`, error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[Supabase Auto-Sync] Falha ao enviar para ${table}:`, err.message);
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
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase não configurado. Preencha SUPABASE_URL e SUPABASE_ANON_KEY nas configurações ou .env.');
  }

  const results: Record<string, { count: number; status: 'OK' | 'ERROR'; error?: string }> = {};
  let totalCount = 0;

  // 1. Settings
  try {
    const settingsRow = mapSettingsToSupabase(db.getSettings());
    const { error } = await client.from('settings').upsert([settingsRow], { onConflict: 'id' });
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
      const { error } = await client.from('users').upsert(usersRows, { onConflict: 'id' });
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
      const { error } = await client.from('guardians').upsert(guardiansRows, { onConflict: 'id' });
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
      const { error } = await client.from('students').upsert(studentsRows, { onConflict: 'id' });
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
      const { error } = await client.from('products').upsert(productsRows, { onConflict: 'id' });
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
      const { error } = await client.from('stock_movements').upsert(movementsRows, { onConflict: 'id' });
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
      const { error } = await client.from('sales').upsert(salesRows, { onConflict: 'id' });
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
      const { error } = await client.from('invoices').upsert(invoicesRows, { onConflict: 'id' });
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
      const { error } = await client.from('pix_payments').upsert(paymentsRows, { onConflict: 'id' });
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
      const { error } = await client.from('whatsapp_notifications').upsert(notifRows, { onConflict: 'id' });
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
      const { error } = await client.from('audit_logs').upsert(logsRows, { onConflict: 'id' });
      if (error) throw error;
    }
    results['audit_logs'] = { count: logsRows.length, status: 'OK' };
    totalCount += logsRows.length;
  } catch (e: any) {
    results['audit_logs'] = { count: 0, status: 'ERROR', error: e.message };
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
      const mapped = {
        id: row.id,
        name: row.name,
        category: row.category,
        price: Number(row.price),
        internalCode: row.internal_code,
        barcode: row.barcode,
        currentStock: Number(row.current_stock),
        minStock: Number(row.min_stock),
        status: row.status,
        imageUrl: row.image_url,
        unit: row.unit || 'un',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      if (idx >= 0) localProds[idx] = mapped;
      else localProds.push(mapped);
    }
    counts['products'] = prodData.length;
    total += prodData.length;
  }

  // 2. Students
  const { data: stuData } = await client.from('students').select('*');
  if (stuData && stuData.length > 0) {
    const localStudents = db.getStudents();
    for (const row of stuData) {
      const idx = localStudents.findIndex(s => s.id === row.id);
      const mapped = {
        id: row.id,
        name: row.name,
        registrationNumber: row.registration_number,
        classGroup: row.class_group,
        email: row.email,
        phone: row.phone,
        avatar: row.avatar,
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
        notes: row.notes,
        createdAt: row.created_at,
      };
      if (idx >= 0) localStudents[idx] = mapped as any;
      else localStudents.push(mapped as any);
    }
    counts['students'] = stuData.length;
    total += stuData.length;
  }

  // 3. Invoices
  const { data: invData } = await client.from('invoices').select('*');
  if (invData && invData.length > 0) {
    const localInvoices = db.getInvoices();
    for (const row of invData) {
      const idx = localInvoices.findIndex(i => i.id === row.id);
      const mapped = {
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
        pixCopyPasteCode: row.pix_copy_paste_code,
        pixQrCodePayload: row.pix_qr_code_payload,
        approvedByUserName: row.approved_by_user_name,
        approvedAt: row.approved_at,
        publishedAt: row.published_at,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      if (idx >= 0) localInvoices[idx] = mapped as any;
      else localInvoices.push(mapped as any);
    }
    counts['invoices'] = invData.length;
    total += invData.length;
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
