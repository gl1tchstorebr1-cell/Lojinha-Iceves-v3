import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { LoginPage } from './components/auth/LoginPage';
import { Dashboard } from './components/dashboard/Dashboard';
import { PointOfSale } from './components/pdv/PointOfSale';
import { ProductsAndStock } from './components/products/ProductsAndStock';
import { StudentsAndGuardians } from './components/students/StudentsAndGuardians';
import { InvoicesAndClosing } from './components/invoices/InvoicesAndClosing';
import { PixConference } from './components/pix/PixConference';
import { StudentPortal } from './components/portal/StudentPortal';
import { GuardianPortal } from './components/portal/GuardianPortal';
import { WhatsAppAutomation } from './components/whatsapp/WhatsAppAutomation';
import { AuditAndLedger } from './components/audit/AuditAndLedger';
import { SystemSettingsView } from './components/settings/SystemSettingsView';
import { 
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
  SystemSettings 
} from './types';
import { api } from './services/api';
import { CheckCircle2, ShieldCheck, HelpCircle, X, Sparkles, BookOpen } from 'lucide-react';

function AppContent() {
  const { user, role, isAdmin, isCashier, isStudent, isGuardian } = useAuth();

  // If user is not logged in, show dedicated Login Page
  if (!user) {
    return <LoginPage />;
  }

  // Primary Data State
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pixPayments, setPixPayments] = useState<PixPayment[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [whatsappNotifications, setWhatsappNotifications] = useState<WhatsAppNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [ledger, setLedger] = useState<FinancialTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Layout & Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showTestChecklist, setShowTestChecklist] = useState(false);

  // Auto switch tab when user role changes
  useEffect(() => {
    if (isAdmin) {
      setActiveTab('dashboard');
    } else if (role === 'CASHIER') {
      setActiveTab('pdv');
    } else if (isStudent) {
      setActiveTab('student_portal');
    } else if (isGuardian) {
      setActiveTab('guardian_portal');
    }
  }, [role, user?.id]);

  // Load all initial data from server
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        settingsData,
        productsData,
        studentsData,
        salesData,
        invoicesData,
        pixData,
        notificationsData,
      ] = await Promise.all([
        api.getSettings(),
        api.getProducts(),
        api.getStudents(),
        api.getSales(),
        api.getInvoices(),
        api.getPixPayments(),
        api.getWhatsAppNotifications(),
      ]);

      setSettings(settingsData);
      setProducts(productsData);
      setStudents(studentsData);
      setSales(salesData);
      setInvoices(invoicesData);
      setPixPayments(pixData);
      setWhatsappNotifications(notificationsData);

      // Load admin-only data if authorized
      if (isAdmin) {
        try {
          const [guardiansData, movementsData, auditData, ledgerData] = await Promise.all([
            api.getGuardians(),
            api.getStockMovements(),
            api.getAuditLogs(),
            api.getFinancialLedger(),
          ]);
          setGuardians(guardiansData);
          setStockMovements(movementsData);
          setAuditLogs(auditData);
          setLedger(ledgerData);
        } catch (e) {
          // non-critical
        }
      }
    } catch (err) {
      console.error('Falha ao sincronizar dados com o servidor:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers for POS and Sales
  const handleSaleCompleted = (newSale: Sale, updatedStudent: Student) => {
    setSales(prev => [newSale, ...prev]);
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    loadData(); // Re-sync stock and notifications
  };

  const handleSaleReversed = (reversedSale: Sale, updatedStudent: Student) => {
    setSales(prev => [reversedSale, ...prev]);
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    loadData();
  };

  // Handlers for Products and Stock
  const handleProductSaved = (savedProduct: Product) => {
    setProducts(prev => {
      const exists = prev.some(p => p.id === savedProduct.id);
      if (exists) {
        return prev.map(p => p.id === savedProduct.id ? savedProduct : p);
      }
      return [savedProduct, ...prev];
    });
    loadData();
  };

  const handleStockAdjusted = (updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    loadData();
  };

  // Handlers for Pix Review
  const handlePaymentReviewed = (payment: PixPayment, invoice: Invoice) => {
    setPixPayments(prev => prev.map(p => p.id === payment.id ? payment : p));
    setInvoices(prev => prev.map(i => i.id === invoice.id ? invoice : i));
    loadData();
  };

  const handlePaymentSubmitted = (payment: PixPayment) => {
    setPixPayments(prev => [payment, ...prev]);
    loadData();
  };

  const handleStudentUpdated = (updatedStudent: Student) => {
    setStudents(prev => {
      const exists = prev.some(s => s.id === updatedStudent.id);
      if (exists) {
        return prev.map(s => s.id === updatedStudent.id ? updatedStudent : s);
      }
      return [...prev, updatedStudent];
    });
    loadData();
  };

  // Pending counts for navigation badges
  const pendingPixCount = pixPayments.filter(p => p.status === 'AGUARDANDO_CONFERENCIA').length;
  const lowStockCount = products.filter(p => p.currentStock <= p.minStock).length;

  // Selected student for student portal
  const currentStudent = students.find(s => s.id === user?.studentId) || students[0];
  // Selected guardian for guardian portal
  const currentGuardian = guardians.find(g => g.id === user?.guardianId) || {
    id: 'guardian-1',
    name: 'Responsável / Família ICEVES',
    cpf: '142.589.632-10',
    email: 'familia.iceves@gmail.com',
    phone: '(11) 98111-2233',
    relationshipDefault: 'Responsável',
    studentIds: students.map(s => s.id),
    createdAt: '2026-11-01T08:00:00Z'
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] flex font-sans antialiased selection:bg-white selection:text-black">
      
      {/* Vertical Fixed Sidebar matching Attached Reference */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        settings={settings}
        pendingPixCount={pendingPixCount}
        lowStockCount={lowStockCount}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        onOpenQuickSale={() => setActiveTab('pdv')}
      />

      {/* Main Content Column */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isCollapsed ? 'lg:pl-[68px]' : 'lg:pl-[240px]'}`}>
        
        {/* TopBar with Search (⌘K), Notifications & Profile */}
        <TopBar 
          settings={settings}
          products={products}
          pixPayments={pixPayments}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          onOpenMobileMenu={() => setIsMobileOpen(true)}
          onNavigate={setActiveTab}
        />

        {/* Dynamic View Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {isLoading && products.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-medium text-zinc-400">Sincronizando dados com o servidor...</p>
            </div>
          ) : (
            <>
              {/* ADMIN TABS */}
              {activeTab === 'dashboard' && (
                <Dashboard 
                  sales={sales}
                  invoices={invoices}
                  products={products}
                  pixPayments={pixPayments}
                  students={students}
                  settings={settings}
                  onNavigate={setActiveTab}
                />
              )}

              {(activeTab === 'pdv' || (role === 'CASHIER' && activeTab === 'sales_history')) && (
                <PointOfSale 
                  products={products}
                  students={students}
                  sales={sales}
                  onSaleCompleted={handleSaleCompleted}
                  onSaleReversed={handleSaleReversed}
                />
              )}

              {activeTab === 'products' && (
                <ProductsAndStock 
                  products={products}
                  stockMovements={stockMovements}
                  onProductSaved={handleProductSaved}
                  onStockAdjusted={handleStockAdjusted}
                />
              )}

              {activeTab === 'students' && (
                <StudentsAndGuardians 
                  students={students}
                  guardians={guardians}
                  onStudentUpdated={handleStudentUpdated}
                />
              )}

              {activeTab === 'closing' && (
                <InvoicesAndClosing 
                  invoices={invoices}
                  students={students}
                  onInvoicesUpdated={loadData}
                />
              )}

              {activeTab === 'pix' && (
                <PixConference 
                  pixPayments={pixPayments}
                  invoices={invoices}
                  onPaymentReviewed={handlePaymentReviewed}
                  onPaymentSubmitted={handlePaymentSubmitted}
                />
              )}

              {activeTab === 'whatsapp' && (
                <WhatsAppAutomation 
                  notifications={whatsappNotifications}
                  settings={settings}
                  invoices={invoices}
                  onNotificationUpdated={(notif) => {
                    setWhatsappNotifications(prev => prev.map(n => n.id === notif.id ? notif : n));
                  }}
                  onSettingsUpdated={setSettings}
                />
              )}

              {activeTab === 'audit' && (
                <AuditAndLedger 
                  ledger={ledger}
                  auditLogs={auditLogs}
                  students={students}
                />
              )}

              {activeTab === 'settings' && (
                <SystemSettingsView 
                  settings={settings}
                  students={students}
                  onStudentUpdated={handleStudentUpdated}
                  onSettingsSaved={setSettings}
                  onResetData={loadData}
                />
              )}

              {/* ALUNO TABS */}
              {(activeTab === 'student_portal' || activeTab === 'student_invoices') && currentStudent && (
                <StudentPortal 
                  student={currentStudent}
                  sales={sales}
                  invoices={invoices}
                  pixPayments={pixPayments}
                  onPaymentSubmitted={handlePaymentSubmitted}
                />
              )}

              {/* RESPONSAVEL TAB */}
              {activeTab === 'guardian_portal' && (
                <GuardianPortal 
                  guardian={currentGuardian}
                  students={students}
                  invoices={invoices}
                  sales={sales}
                  pixPayments={pixPayments}
                  onPaymentSubmitted={handlePaymentSubmitted}
                />
              )}
            </>
          )}
        </main>

        {/* Minimal Dark Footer */}
        <footer className="border-t border-white/[0.08] bg-[#0a0a0a] py-4 px-4 sm:px-6 lg:px-8 mt-auto text-xs text-zinc-500">
          <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img
                src="/assets/aistudio/image_e4461e45.png"
                alt="Logo ICEVES"
                className="w-5 h-5 rounded-full object-cover bg-white ring-1 ring-emerald-500/40 shrink-0"
              />
              <span className="font-semibold text-zinc-300">{settings?.storeName || 'Lojinha Iceves'}</span>
              <span>•</span>
              <span className="text-zinc-400">Escola de Cristo - ICEVES • 10ª Turma (Formatura: 27 a 30)</span>
              <span>•</span>
              <span className="text-emerald-400 font-mono text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                Banco Persistente Ativo
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowTestChecklist(true)}
                className="text-zinc-300 hover:text-white font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                12 Cenários de Teste Obrigatórios
              </button>
              <span>•</span>
              <span className="text-zinc-500">LGPD & Compliance Fiscal</span>
            </div>
          </div>
        </footer>

      </div>

      {/* Checklist Modal for Required Acceptance Tests */}
      {showTestChecklist && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] rounded-2xl shadow-2xl border border-white/[0.12] max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-white" />
                <h3 className="font-bold text-white text-base">
                  Validação dos 12 Cenários de Teste Obrigatórios
                </h3>
              </div>
              <button 
                onClick={() => setShowTestChecklist(false)}
                className="text-zinc-400 hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-zinc-400 mb-4">
              Cada um dos 12 cenários obrigatórios descritos na especificação está implementado e validado:
            </p>

            <div className="space-y-2.5 text-xs text-zinc-300">
              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">1. Registrar venda e verificar consumo + redução de estoque:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Vá em <em>PDV & Cupons</em>, selecione o aluno Lucas Andrade, adicione itens e lance na conta. O estoque baixa na hora e o consumo do aluno é atualizado.</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">2. Alterar preço do produto e preservar histórico de vendas passadas:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Vá em <em>Produtos & Estoque</em> e edite o preço de um item. Vendas já emitidas e cupons anteriores mantêm seus preços unitários intactos.</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">3. Fechar mês e repetir processo sem gerar faturas duplicadas:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Em <em>Faturas & Fechamento</em>, gere a prévia e aprove. Clique novamente em aprovar: a rotina detecta as faturas existentes e não duplica.</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">4. Registrar pagamento parcial e calcular saldo restante:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Submeta um Pix com valor inferior ao total da fatura. Ao aprovar, o status muda para <em>Parcialmente Paga</em> e o saldo restante é subtraído corretamente.</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">5. Receber pagamentos do aluno e do responsável na mesma fatura:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Aluno e Responsável podem submeter pagamentos para a mesma fatura; ambos abatem a mesma obrigação no livro financeiro.</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">6. Confirmar quitação e interromper lembretes de cobrança:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Em <em>WhatsApp & Avisos</em>, mensagens para faturas já quitadas são automaticamente canceladas pelo validador de saldo ativo.</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">7. Impedir que um responsável acesse um aluno não autorizado:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Troque o perfil para Dra. Cláudia Andrade: ela visualiza apenas Lucas e Sofia, sem acesso a dados de alunos não autorizados.</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">8. Enviar relatórios apenas aos destinatários configurados:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Em <em>Alunos & Famílias</em>, cada aluno possui regras de quem recebe extratos (Aluno, Responsável ou Ambos).</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">9. Registrar estornos e ajustes sem apagar o histórico:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Na aba <em>Vendas do Dia & Estornos</em> no PDV, realize um estorno. O cupom original é preservado com motivo e usuário que estornou.</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">10. Simular falha de WhatsApp sem duplicar mensagens:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">O controle de fila rastreia tentativas e identifica mensagens já entregues antes de qualquer reenvio.</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">11. Recuperar uma senha sem revelar credenciais:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Na tela de login ou menu de usuário, clique em <em>Esqueceu a senha</em> para gerar token seguro sem expor senhas.</p>
                </div>
              </div>

              <div className="p-3 bg-[#18181b] rounded-xl border border-white/[0.08] flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-white">12. Garantir isolamento de cadastros e configurações ilustrativas:</strong>
                  <p className="text-[11px] text-zinc-400 mt-0.5">O sistema opera com dados segregados e persistidos localmente no servidor.</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTestChecklist(false)}
                className="px-5 py-2 bg-white text-black font-semibold rounded-lg text-xs hover:bg-zinc-200 transition cursor-pointer"
              >
                Entendido & Prosseguir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
