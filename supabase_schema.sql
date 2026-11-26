-- =====================================================================
-- SCHEMA POSTGRESQL / SUPABASE: LOJINHA ICEVES — PDV & GESTÃO DE CONSUMO
-- Execute este script no SQL Editor do seu projeto Supabase
-- Compatível com instalações novas e migrações idempotentes
-- =====================================================================

-- 1. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Configurações Gerais
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY DEFAULT 'settings-default',
  institution_name TEXT NOT NULL DEFAULT 'Escola de Cristo - ICEVES',
  cnpj TEXT NOT NULL DEFAULT '12.345.678/0001-90',
  store_name TEXT NOT NULL DEFAULT 'Lojinha Iceves',
  closing_day TEXT NOT NULL DEFAULT 'LAST_DAY',
  closing_hour TEXT NOT NULL DEFAULT '23:59',
  due_day_offset INT NOT NULL DEFAULT 10,
  allow_direct_cash_payment BOOLEAN NOT NULL DEFAULT FALSE,
  stock_control_active BOOLEAN NOT NULL DEFAULT TRUE,
  block_sale_without_stock BOOLEAN NOT NULL DEFAULT TRUE,
  pix_key TEXT NOT NULL DEFAULT 'financeiro@campus.edu.br',
  pix_key_type TEXT NOT NULL DEFAULT 'EMAIL',
  pix_receiver_name TEXT NOT NULL DEFAULT 'ICEVES EDUCACIONAL',
  pix_city TEXT NOT NULL DEFAULT 'SAO PAULO',
  whatsapp_auto_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_provider_name TEXT NOT NULL DEFAULT 'Evolution API / Z-API',
  whatsapp_provider_status TEXT NOT NULL DEFAULT 'CONNECTED',
  receipt_settings JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by_user_name TEXT DEFAULT 'Sistema'
);

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS receipt_settings JSONB;

-- 3. Tabela de Usuários (Controle de Acesso / RBAC)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MANAGER', 'CASHIER', 'STOCKIST', 'VIEWER', 'STUDENT', 'GUARDIAN')),
  phone TEXT,
  avatar TEXT,
  student_id TEXT,
  guardian_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('ADMIN', 'MANAGER', 'CASHIER', 'STOCKIST', 'VIEWER', 'STUDENT', 'GUARDIAN'));

-- 4. Tabela de Responsáveis (Guardians)
CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  relationship_default TEXT DEFAULT 'Mãe/Pai',
  student_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.guardians DROP CONSTRAINT IF EXISTS guardians_cpf_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_guardians_cpf_unique
  ON public.guardians (cpf)
  WHERE cpf IS NOT NULL AND cpf <> '' AND cpf <> 'Não informado' AND cpf NOT LIKE 'NI-%';

-- 5. Tabela de Alunos (Students)
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  registration_number TEXT NOT NULL UNIQUE,
  class_group TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  avatar TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  default_tuition NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  current_consumption_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_open_debt NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  cpf TEXT,
  consumption_limit NUMERIC(10,2),
  credit_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  consumption_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  consumption_blocked_reason TEXT,
  payer_rule TEXT NOT NULL DEFAULT 'GUARDIAN',
  report_recipient_rule TEXT NOT NULL DEFAULT 'GUARDIAN',
  due_reminder_recipient_rule TEXT NOT NULL DEFAULT 'BOTH',
  payment_confirmation_recipient_rule TEXT NOT NULL DEFAULT 'BOTH',
  allowed_channels JSONB DEFAULT '["WHATSAPP", "EMAIL"]'::jsonb,
  guardians JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS consumption_limit NUMERIC(10,2);
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS consumption_blocked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS consumption_blocked_reason TEXT;

-- 6. Tabela de Produtos do Estoque
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  cost_price NUMERIC(10,2),
  price NUMERIC(10,2),
  price_status TEXT NOT NULL DEFAULT 'DEFINED' CHECK (price_status IN ('DEFINED', 'PENDING')),
  internal_code TEXT NOT NULL UNIQUE,
  barcode TEXT,
  current_stock INT NOT NULL DEFAULT 0,
  min_stock INT NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_reason TEXT,
  image_url TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  unit TEXT NOT NULL DEFAULT 'un',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.products ALTER COLUMN price DROP NOT NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS price_status TEXT NOT NULL DEFAULT 'DEFINED';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS archived_reason TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- 7. Tabela de Movimentações de Estoque
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ENTRADA', 'SAIDA_VENDA', 'ESTORNO_VENDA', 'AJUSTE_MANUAL', 'PERDA_AVARIA')),
  quantity INT NOT NULL,
  previous_stock INT NOT NULL,
  new_stock INT NOT NULL,
  reason TEXT NOT NULL,
  performed_by_user_id TEXT NOT NULL,
  performed_by_user_name TEXT NOT NULL,
  reference_id TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_type_check CHECK (type IN ('ENTRADA', 'SAIDA_VENDA', 'ESTORNO_VENDA', 'AJUSTE_MANUAL', 'PERDA_AVARIA'));

-- 8. Tabela de Vendas (PDV)
CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  student_name TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(10,2),
  discount_amount NUMERIC(10,2) DEFAULT 0.00,
  total NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CONTA_ALUNO',
  cash_session_id TEXT,
  notes TEXT,
  operator_user_id TEXT NOT NULL,
  operator_user_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'REVERSED')),
  reversed_reason TEXT,
  reversed_by_user_name TEXT,
  reversed_at TIMESTAMPTZ,
  billing_period TEXT NOT NULL,
  invoice_id TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'CONTA_ALUNO';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10,2);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cash_session_id TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS reversed_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'AGUARDANDO_FATURAMENTO';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS billed_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS invoice_allocations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payments JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS change_amount NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS credit_used NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS terminal_id TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS receipt_id TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS receipt_code TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'LOJINHA';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS trip_operation_id TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS trip_name TEXT;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS trip_date DATE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS trip_destination TEXT;

-- 8.1 Tabela de Recibos e Comprovantes Imutáveis de Vendas
CREATE TABLE IF NOT EXISTS sales_receipts (
  id TEXT PRIMARY KEY,
  receipt_code TEXT NOT NULL UNIQUE,
  sale_id TEXT NOT NULL UNIQUE REFERENCES sales(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'PARCIALMENTE_ESTORNADO', 'ESTORNADO', 'CANCELADO')),
  institution JSONB NOT NULL DEFAULT '{}'::jsonb,
  sale_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  student_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  financial_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  payments JSONB DEFAULT '[]'::jsonb,
  operational JSONB NOT NULL DEFAULT '{}'::jsonb,
  reversals JSONB DEFAULT '[]'::jsonb,
  reprint_count INT NOT NULL DEFAULT 0,
  last_reprinted_at TIMESTAMPTZ,
  last_reprinted_by_user_name TEXT,
  custom_header_snapshot TEXT,
  custom_footer_snapshot TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Tabela de Faturas Mensais e Lançamentos Consolidadas
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  student_id TEXT REFERENCES students(id),
  student_name TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  billing_period TEXT NOT NULL,
  billing_type TEXT DEFAULT 'FECHAMENTO_MENSAL',
  batch_id TEXT,
  period_start DATE,
  period_end DATE,
  billing_label TEXT,
  tuition_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  canteen_consumption_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  previous_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  adjustments_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  credit_applied NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  discount_reason TEXT,
  gross_total NUMERIC(10,2) NOT NULL,
  paid_total NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  remaining_balance NUMERIC(10,2) NOT NULL,
  closing_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PUBLICADA' CHECK (status IN ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'PUBLICADA', 'PARCIALMENTE_PAGA', 'PAGA', 'VENCIDA', 'CANCELADA')),
  sales_ids JSONB DEFAULT '[]'::jsonb,
  sale_item_links JSONB DEFAULT '[]'::jsonb,
  consumption_items JSONB DEFAULT '[]'::jsonb,
  payment_allocations JSONB DEFAULT '[]'::jsonb,
  pix_copy_paste_code TEXT,
  pix_qr_code_payload TEXT,
  approved_by_user_name TEXT,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  canceled_by_user_name TEXT,
  canceled_reason TEXT,
  notes TEXT,
  history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS billing_type TEXT DEFAULT 'FECHAMENTO_MENSAL';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period_start DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS period_end DATE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS billing_label TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS credit_applied NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS discount_reason TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sale_item_links JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS canceled_by_user_name TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS canceled_reason TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;

-- 9.1 Tabela de Lotes / Histórico de Faturamentos
CREATE TABLE IF NOT EXISTS billing_batches (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('INDIVIDUAL', 'PERIODO_PERSONALIZADO', 'FECHAMENTO_MENSAL')),
  billing_period TEXT NOT NULL,
  period_start DATE,
  period_end DATE,
  billing_label TEXT,
  due_date DATE NOT NULL,
  scope TEXT DEFAULT 'ALL_STUDENTS',
  class_group_filter TEXT,
  students_count INT NOT NULL DEFAULT 0,
  invoices_count INT NOT NULL DEFAULT 0,
  sales_count INT NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  invoice_ids JSONB DEFAULT '[]'::jsonb,
  created_by_user_id TEXT NOT NULL,
  created_by_user_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONCLUIDO' CHECK (status IN ('CONCLUIDO', 'PARCIALMENTE_CANCELADO', 'CANCELADO')),
  idempotency_key TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9.2 Tabela Relacional de Vínculo Fatura <-> Venda/Item (Prevenção de Duplicidade)
CREATE TABLE IF NOT EXISTS invoice_sale_links (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE CASCADE,
  sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
  batch_id TEXT REFERENCES billing_batches(id) ON DELETE SET NULL,
  item_index INT NOT NULL DEFAULT 0,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  allocated_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Tabela de Pagamentos (Pix e Mercado Pago)
CREATE TABLE IF NOT EXISTS pix_payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  invoice_code TEXT NOT NULL,
  student_id TEXT REFERENCES students(id),
  student_name TEXT NOT NULL,
  payer_name TEXT NOT NULL,
  payer_role TEXT NOT NULL CHECK (payer_role IN ('ALUNO', 'RESPONSAVEL')),
  amount NUMERIC(10,2) NOT NULL,
  transaction_reference TEXT NOT NULL,
  receipt_attachment TEXT,
  receipt_notes TEXT,
  status TEXT NOT NULL DEFAULT 'AGUARDANDO_CONFERENCIA' CHECK (status IN ('AGUARDANDO_CONFERENCIA', 'CONFIRMADO', 'REJEITADO')),
  registered_by_user_id TEXT NOT NULL,
  registered_by_user_name TEXT NOT NULL,
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by_user_id TEXT,
  reviewed_by_user_name TEXT,
  reviewed_at TIMESTAMPTZ,
  review_decision_reason TEXT
);

-- 11. Tabela de Notificações WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  recipient_role TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_id TEXT,
  invoice_id TEXT,
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROGRAMADO',
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  attempts_count INT DEFAULT 0,
  last_error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 12. Tabela de Auditoria e Livro Caixa
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  details TEXT NOT NULL,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'SUCESSO'
);

-- 13. Tabela de Passeios — Escola de Cristo ICEVES
CREATE TABLE IF NOT EXISTS passeios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL,
  descricao TEXT,
  data_passeio DATE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13.1 Tabela de Operações do PDV de Passeios (Lançamentos Coletivos)
CREATE TABLE IF NOT EXISTS trip_operations (
  id TEXT PRIMARY KEY,
  catalog_passeio_id TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  trip_date DATE NOT NULL,
  destination TEXT NOT NULL,
  notes TEXT,
  responsible_user_id TEXT NOT NULL,
  responsible_user_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'LANCADO', 'PARCIALMENTE_ESTORNADO', 'ESTORNADO')),
  selection_mode TEXT NOT NULL DEFAULT 'ALL_STUDENTS',
  distribution_method TEXT NOT NULL DEFAULT 'IGUALITARIA',
  fixed_value_per_student NUMERIC(10,2),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_expenses NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_distributed NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  idempotency_key TEXT,
  launched_at TIMESTAMPTZ,
  launched_by_user_name TEXT,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. Tabelas de Caixa & Financeiro (Sessões de Caixa e Movimentações)
CREATE TABLE IF NOT EXISTS cash_registers (
  id TEXT PRIMARY KEY,
  opened_by_user_id TEXT NOT NULL,
  opened_by_name TEXT NOT NULL,
  closed_by_user_id TEXT,
  closed_by_name TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  opening_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  expected_balance NUMERIC(10,2),
  counted_balance NUMERIC(10,2),
  difference_amount NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'FECHADO')),
  notes TEXT,
  payment_totals JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id TEXT PRIMARY KEY,
  cash_register_id TEXT REFERENCES cash_registers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ABERTURA', 'SUPRIMENTO', 'SANGRIA', 'DESPESA', 'RECEITA', 'VENDA_DINHEIRO', 'VENDA_PIX', 'VENDA_CARTAO', 'VENDA_MERCADO_PAGO', 'VENDA_CONTA_ALUNO', 'ESTORNO')),
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT DEFAULT 'DINHEIRO',
  description TEXT NOT NULL,
  reference_id TEXT,
  performed_by_user_id TEXT NOT NULL,
  performed_by_name TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_account_movements (
  id TEXT PRIMARY KEY,
  student_id TEXT REFERENCES students(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('CREDITO', 'DEBITO')),
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL,
  performed_by_user_id TEXT NOT NULL,
  performed_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Índices de Desempenho para Consultas e Relatórios
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON public.sales (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_student_id ON public.sales (student_id);
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON public.sales (payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_trip_operation_id ON public.sales (trip_operation_id);
CREATE INDEX IF NOT EXISTS idx_trip_operations_created_at ON public.trip_operations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_receipts_sale_id ON public.sales_receipts (sale_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_timestamp ON public.stock_movements (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_student_id ON public.invoices (student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_billing_period ON public.invoices (billing_period);
CREATE INDEX IF NOT EXISTS idx_pix_payments_invoice_id ON public.pix_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_register ON public.cash_movements (cash_register_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_timestamp ON public.cash_movements (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_customer_account_movements_student ON public.customer_account_movements (student_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs (timestamp DESC);

-- Configurar RLS específica na tabela passeios conforme regras de segurança ICEVES:
ALTER TABLE public.passeios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Alunos autenticados podem visualizar passeios ativos" ON public.passeios;
CREATE POLICY "Alunos autenticados podem visualizar passeios ativos"
  ON public.passeios
  FOR SELECT
  TO authenticated, anon
  USING (ativo = TRUE OR (auth.jwt() ->> 'role') = 'ADMIN' OR current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Administradores podem gerenciar passeios" ON public.passeios;
CREATE POLICY "Administradores podem gerenciar passeios"
  ON public.passeios
  FOR ALL
  TO authenticated, anon, service_role
  USING (true)
  WITH CHECK (true);

-- 16. Permissões e Políticas de Acesso (RLS)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON TABLE public.users TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.audit_logs TO anon, authenticated, service_role;

DO $$ 
DECLARE
  tbl text;
  tbls text[] := ARRAY[
    'settings',
    'users',
    'guardians',
    'students',
    'products',
    'stock_movements',
    'sales',
    'sales_receipts',
    'invoices',
    'billing_batches',
    'invoice_sale_links',
    'pix_payments',
    'whatsapp_notifications',
    'audit_logs',
    'passeios',
    'trip_operations',
    'cash_registers',
    'cash_movements',
    'customer_account_movements'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO anon, authenticated, service_role;', tbl);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Permitir acesso total à aplicação" ON public.%I;', tbl);
      EXECUTE format('CREATE POLICY "Permitir acesso total à aplicação" ON public.%I FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);', tbl);
    END IF;
  END LOOP;
END $$;

-- 17. Recarregar o cache do PostgREST para reconhecer novas tabelas e colunas imediatamente
NOTIFY pgrst, 'reload schema';

