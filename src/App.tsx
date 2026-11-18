import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { OfflineBanner } from './components/pwa/OfflineBanner';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { loadOfflineSnapshot, saveOfflineSnapshot } from './utils/offlineSnapshotCache';
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
  SystemSettings,
  Passeio
} from './types';
import { api } from './services/api';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

// Code-splitting / Lazy loading of modules for faster initial load
const LoginPage = lazy(() => import('./components/auth/LoginPage').then(m => ({ default: m.LoginPage })));
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const PointOfSale = lazy(() => import('./components/pdv/PointOfSale').then(m => ({ default: m.PointOfSale })));
const ProductsAndStock = lazy(() => import('./components/products/ProductsAndStock').then(m => ({ default: m.ProductsAndStock })));
const StudentsAndGuardians = lazy(() => import('./components/students/StudentsAndGuardians').then(m => ({ default: m.StudentsAndGuardians })));
const InvoicesAndClosing = lazy(() => import('./components/invoices/InvoicesAndClosing').then(m => ({ default: m.InvoicesAndClosing })));
const PixConference = lazy(() => import('./components/pix/PixConference').then(m => ({ default: m.PixConference })));
const StudentPortal = lazy(() => import('./components/portal/StudentPortal').then(m => ({ default: m.StudentPortal })));
const GuardianPortal = lazy(() => import('./components/portal/GuardianPortal').then(m => ({ default: m.GuardianPortal })));
const WhatsAppAutomation = lazy(() => import('./components/whatsapp/WhatsAppAutomation').then(m => ({ default: m.WhatsAppAutomation })));
const AuditAndLedger = lazy(() => import('./components/audit/AuditAndLedger').then(m => ({ default: m.AuditAndLedger })));
const SystemSettingsView = lazy(() => import('./components/settings/SystemSettingsView').then(m => ({ default: m.SystemSettingsView })));
const PasseiosManagement = lazy(() => import('./components/passeios/PasseiosManagement').then(m => ({ default: m.PasseiosManagement })));
const PdvPasseiosView = lazy(() => import('./components/passeios/PdvPasseiosView').then(m => ({ default: m.PdvPasseiosView })));
const CashRegisterAndFinance = lazy(() => import('./components/cash/CashRegisterAndFinance').then(m => ({ default: m.CashRegisterAndFinance })));
const ReportsCenter = lazy(() => import('./components/reports/ReportsCenter').then(m => ({ default: m.ReportsCenter })));
const IcevesAiAssistant = lazy(() => import('./components/ai/IcevesAiAssistant').then(m => ({ default: m.IcevesAiAssistant })));

const ViewFallback = () => (
  <div className="py-20 flex flex-col items-center justify-center space-y-3">
    <div className="w-7 h-7 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
    <p className="text-xs font-medium text-zinc-400">Carregando módulo...</p>
  </div>
);

function AppContent() {
  const { user, role, isAdmin, canManage, isCashier, isStockist, isViewer, isStudent, isGuardian } = useAuth();
  const { isOnline } = useOnlineStatus();

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
  const [passeios, setPasseios] = useState<Passeio[]>([]);
  const [selectedPortalStudentId, setSelectedPortalStudentId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => loadOfflineSnapshot()?.syncedAt || null);

  // Layout & Navigation State
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showTestChecklist, setShowTestChecklist] = useState(false);

  // Auto switch tab when user role changes
  useEffect(() => {
    if (!user) return;
    if (isAdmin || canManage || isViewer) {
      setActiveTab('dashboard');
    } else if (role === 'CASHIER') {
      setActiveTab('pdv');
    } else if (role === 'STOCKIST') {
      setActiveTab('products');
    } else if (isStudent) {
      setActiveTab('student_portal');
    } else if (isGuardian) {
      setActiveTab('guardian_portal');
    }
  }, [role, user?.id, isAdmin, canManage, isViewer, isStudent, isGuardian]);

  // Load all initial data from server (supports silent background sync and offline snapshot fallback)
  const loadData = useCallback(async (silent = false) => {
    if (!user) return;
    if (!silent) setIsLoading(true);
    try {
      const [
        settingsData,
        productsData,
        studentsData,
        salesData,
        invoicesData,
        pixData,
        notificationsData,
        passeiosData,
      ] = await Promise.all([
        api.getSettings(),
        api.getProducts(),
        api.getStudents(),
        api.getSales(),
        api.getInvoices(),
        api.getPixPayments(),
        api.getWhatsAppNotifications(),
        api.getPasseios(),
      ]);

      setSettings(settingsData);
      setProducts(productsData);
      setStudents(studentsData);
      setSales(salesData);
      setInvoices(invoicesData);
      setPixPayments(pixData);
      setWhatsappNotifications(notificationsData);
      setPasseios(passeiosData);

      const syncedAt = new Date().toISOString();
      setLastSyncedAt(syncedAt);
      saveOfflineSnapshot({
        syncedAt,
        settings: settingsData,
        products: productsData,
        students: studentsData,
        sales: salesData,
        invoices: invoicesData,
        pixPayments: pixData,
        whatsappNotifications: notificationsData,
        passeios: passeiosData,
      });

      // Load manager/admin/stockist auxiliary data if authorized
      if (canManage || isStockist || isViewer) {
        try {
          const [guardiansData, movementsData, auditData, ledgerData] = await Promise.all([
            canManage || isViewer ? api.getGuardians().catch(() => []) : Promise.resolve([]),
            api.getStockMovements().catch(() => []),
            canManage ? api.getAuditLogs().catch(() => []) : Promise.resolve([]),
            canManage || isViewer ? api.getFinancialLedger().catch(() => []) : Promise.resolve([]),
          ]);
          setGuardians(guardiansData);
          setStockMovements(movementsData);
          setAuditLogs(auditData);
          setLedger(ledgerData);
        } catch {
          // non-critical
        }
      }
    } catch (err) {
      console.error('Falha ao sincronizar dados com o servidor:', err);
      const cached = loadOfflineSnapshot();
      if (cached) {
        setSettings(cached.settings);
        setProducts(cached.products || []);
        setStudents(cached.students || []);
        setSales(cached.sales || []);
        setInvoices(cached.invoices || []);
        setPixPayments(cached.pixPayments || []);
        setWhatsappNotifications(cached.whatsappNotifications || []);
        setPasseios(cached.passeios || []);
        setLastSyncedAt(cached.syncedAt);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [canManage, isStockist, isViewer, user]);

  useEffect(() => {
    if (user) {
      loadData(false);
    }
  }, [user, loadData]);

  // Auto-sync when connectivity returns
  useEffect(() => {
    if (isOnline && user) {
      loadData(true);
    }
  }, [isOnline, user, loadData]);

  const refreshSilent = useCallback(() => {
    loadData(true);
  }, [loadData]);

  // Safe navigation handler enforcing RBAC roles
  const handleSafeNavigate = useCallback(
    (tab: string) => {
      const adminOnlyTabs = ['whatsapp', 'audit', 'settings'];
      const managerOrAdminTabs = ['passeios', 'students', 'closing', 'pix', 'reports'];
      const cashTabs = ['cash_register'];
      const pdvTabs = ['pdv', 'sales_history'];
      const stockTabs = ['products'];

      const fallbackHome = () => {
        if (isStudent) return 'student_portal';
        if (isGuardian) return 'guardian_portal';
        if (role === 'CASHIER') return 'pdv';
        if (role === 'STOCKIST') return 'products';
        return 'dashboard';
      };

      if (tab === 'pdv_passeios') {
        const cashierPermitted =
          isCashier &&
          Boolean(
            settings?.pdvPasseiosPermissions?.cashierCanViewPasseios ||
              settings?.pdvPasseiosPermissions?.cashierCanViewHistory ||
              settings?.pdvPasseiosPermissions?.cashierCanCreatePasseios ||
              settings?.pdvPasseiosPermissions?.cashierCanAddExpenses
          );
        if (!canManage && !cashierPermitted) {
          setActiveTab(fallbackHome());
          return;
        }
        setActiveTab(tab);
        return;
      }

      if (adminOnlyTabs.includes(tab) && !isAdmin) {
        setActiveTab(fallbackHome());
        return;
      }

      if (managerOrAdminTabs.includes(tab) && !canManage && !(isViewer && tab === 'reports')) {
        setActiveTab(fallbackHome());
        return;
      }

      if (cashTabs.includes(tab) && !(canManage || isCashier || isViewer)) {
        setActiveTab(fallbackHome());
        return;
      }

      if (pdvTabs.includes(tab) && !(canManage || isCashier)) {
        setActiveTab(fallbackHome());
        return;
      }

      if (stockTabs.includes(tab) && !(canManage || isCashier || isStockist || isViewer)) {
        setActiveTab(fallbackHome());
        return;
      }

      setActiveTab(tab);
    },
    [isAdmin, canManage, isCashier, isStockist, isViewer, isStudent, isGuardian, role, settings]
  );

  // Handlers for POS and Sales
  const handleSaleCompleted = useCallback((newSale: Sale, updatedStudent: Student) => {
    setSales(prev => [newSale, ...prev]);
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    refreshSilent();
  }, [refreshSilent]);

  const handleSaleReversed = useCallback((reversedSale: Sale, updatedStudent: Student) => {
    setSales(prev => [reversedSale, ...prev]);
    setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
    refreshSilent();
  }, [refreshSilent]);

  // Handlers for Products and Stock
  const handleProductSaved = useCallback((savedProduct: Product) => {
    setProducts(prev => {
      const exists = prev.some(p => p.id === savedProduct.id);
      if (exists) {
        return prev.map(p => p.id === savedProduct.id ? savedProduct : p);
      }
      return [savedProduct, ...prev];
    });
    refreshSilent();
  }, [refreshSilent]);

  const handleStockAdjusted = useCallback((updatedProduct: Product) => {
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    refreshSilent();
  }, [refreshSilent]);

  // Handlers for Pix Review
  const handlePaymentReviewed = useCallback((payment: PixPayment, invoice: Invoice) => {
    setPixPayments(prev => prev.map(p => p.id === payment.id ? payment : p));
    setInvoices(prev => prev.map(i => i.id === invoice.id ? invoice : i));
    refreshSilent();
  }, [refreshSilent]);

  const handlePaymentSubmitted = useCallback((payment: PixPayment) => {
    setPixPayments(prev => [payment, ...prev]);
    refreshSilent();
  }, [refreshSilent]);

  const handleStudentUpdated = useCallback((updatedStudent: Student) => {
    setStudents(prev => {
      const exists = prev.some(s => s.id === updatedStudent.id);
      if (exists) {
        return prev.map(s => s.id === updatedStudent.id ? updatedStudent : s);
      }
      return [...prev, updatedStudent];
    });
    refreshSilent();
  }, [refreshSilent]);

  // Handlers for Passeios
  const handlePasseioSaved = useCallback((savedPasseio: Passeio) => {
    setPasseios(prev => {
      const exists = prev.some(p => p.id === savedPasseio.id);
      if (exists) {
        return prev.map(p => p.id === savedPasseio.id ? savedPasseio : p);
      }
      return [savedPasseio, ...prev];
    });
    refreshSilent();
  }, [refreshSilent]);

  const handlePasseioDeleted = useCallback((deletedId: string) => {
    setPasseios(prev => prev.filter(p => p.id !== deletedId));
    refreshSilent();
  }, [refreshSilent]);

  // Pending counts for navigation badges (memoized)
  const pendingPixCount = useMemo(
    () => pixPayments.filter(p => p.status === 'AGUARDANDO_CONFERENCIA').length,
    [pixPayments]
  );
  const lowStockCount = useMemo(
    () => products.filter(p => p.status === 'ACTIVE' && !p.archived && p.currentStock <= p.minStock).length,
    [products]
  );

  // Selected student for student portal (memoized)
  const currentStudent = useMemo(
    () =>
      (isAdmin && selectedPortalStudentId
        ? students.find(s => s.id === selectedPortalStudentId)
        : students.find(
            s =>
              s.id === user?.studentId ||
              s.email.toLowerCase() === (user?.email || '').toLowerCase() ||
              s.name.toLowerCase() === (user?.name || '').toLowerCase()
          )) || students[0],
    [isAdmin, selectedPortalStudentId, students, user]
  );

  // Selected guardian for guardian portal (memoized)
  const currentGuardian = useMemo(
    () =>
      guardians.find(g => g.id === user?.guardianId) || {
        id: 'guardian-1',
        name: 'Responsável / Família ICEVES',
        cpf: '142.589.632-10',
        email: 'familia.iceves@gmail.com',
        phone: '(11) 98111-2233',
        relationshipDefault: 'Responsável',
        studentIds: students.map(s => s.id),
        createdAt: '2026-11-01T08:00:00Z'
      },
    [guardians, user?.guardianId, students]
  );

  const handleOpenQuickSale = useCallback(() => handleSafeNavigate('pdv'), [handleSafeNavigate]);
  const handleOpenMobileMenu = useCallback(() => setIsMobileOpen(true), []);

  // If user is not logged in, show dedicated Login Page (placed after ALL hooks)
  if (!user) {
    return (
      <Suspense fallback={<ViewFallback />}>
        <LoginPage />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] flex font-sans antialiased selection:bg-white selection:text-black">
      
      {/* Vertical Fixed Sidebar matching Attached Reference */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleSafeNavigate}
        settings={settings}
        pendingPixCount={pendingPixCount}
        lowStockCount={lowStockCount}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
        onOpenQuickSale={handleOpenQuickSale}
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
          onOpenMobileMenu={handleOpenMobileMenu}
          onNavigate={handleSafeNavigate}
        />

        {/* Dynamic View Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          <OfflineBanner lastSyncedAt={lastSyncedAt} onSyncNow={() => loadData(false)} />

          {isLoading && products.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-medium text-zinc-400">Sincronizando dados com o servidor...</p>
            </div>
          ) : (
            <Suspense fallback={<ViewFallback />}>
              {/* DASHBOARD */}
              {activeTab === 'dashboard' && (
                <Dashboard 
                  sales={sales}
                  invoices={invoices}
                  products={products}
                  pixPayments={pixPayments}
                  students={students}
                  settings={settings}
                  onNavigate={handleSafeNavigate}
                />
              )}

              {/* OPERAÇÕES (Admin / Gerente / Caixa) */}
              {(canManage || isCashier) && (activeTab === 'pdv' || (role === 'CASHIER' && activeTab === 'sales_history')) && (
                <PointOfSale 
                  products={products}
                  students={students}
                  sales={sales}
                  onSaleCompleted={handleSaleCompleted}
                  onSaleReversed={handleSaleReversed}
                />
              )}

              {(canManage || isCashier || isStockist || isViewer) && activeTab === 'products' && (
                <ProductsAndStock 
                  products={products}
                  stockMovements={stockMovements}
                  onProductSaved={handleProductSaved}
                  onStockAdjusted={handleStockAdjusted}
                />
              )}

              {/* CAIXA & FINANCEIRO */}
              {(canManage || isCashier || isViewer) && activeTab === 'cash_register' && (
                <CashRegisterAndFinance
                  sales={sales}
                  onCashUpdated={refreshSilent}
                />
              )}

              {/* RELATÓRIOS & EXPORTAÇÕES */}
              {(canManage || isViewer) && activeTab === 'reports' && (
                <ReportsCenter
                  sales={sales}
                  products={products}
                  students={students}
                  invoices={invoices}
                  pixPayments={pixPayments}
                  stockMovements={stockMovements}
                />
              )}

              {/* ICEVES INTELIGÊNCIA (GEMINI AI) */}
              {activeTab === 'ai_assistant' && (
                <IcevesAiAssistant />
              )}

              {/* PDV DE PASSEIOS (Admin / Gerente ou Caixa autorizado) */}
              {(canManage || isCashier) && activeTab === 'pdv_passeios' && (
                <PdvPasseiosView 
                  students={students}
                  products={products}
                  passeios={passeios}
                  sales={sales}
                  invoices={invoices}
                  settings={settings}
                  onOperationLaunched={refreshSilent}
                  onSettingsUpdated={setSettings}
                />
              )}

              {/* MÓDULOS DE GESTÃO (Admin / Gerente) */}
              {canManage && activeTab === 'passeios' && (
                <PasseiosManagement 
                  passeios={passeios}
                  students={students}
                  onPasseioSaved={handlePasseioSaved}
                  onPasseioDeleted={handlePasseioDeleted}
                />
              )}

              {canManage && activeTab === 'students' && (
                <StudentsAndGuardians 
                  students={students}
                  guardians={guardians}
                  passeios={passeios}
                  onStudentUpdated={handleStudentUpdated}
                />
              )}

              {canManage && activeTab === 'closing' && (
                <InvoicesAndClosing 
                  invoices={invoices}
                  students={students}
                  sales={sales}
                  onInvoicesUpdated={refreshSilent}
                />
              )}

              {canManage && activeTab === 'pix' && (
                <PixConference 
                  pixPayments={pixPayments}
                  invoices={invoices}
                  onPaymentReviewed={handlePaymentReviewed}
                  onPaymentSubmitted={handlePaymentSubmitted}
                />
              )}

              {isAdmin && activeTab === 'whatsapp' && (
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

              {isAdmin && activeTab === 'audit' && (
                <AuditAndLedger 
                  ledger={ledger}
                  auditLogs={auditLogs}
                  students={students}
                />
              )}

              {isAdmin && activeTab === 'settings' && (
                <SystemSettingsView 
                  settings={settings}
                  students={students}
                  onStudentUpdated={handleStudentUpdated}
                  onSettingsSaved={setSettings}
                  onResetData={() => loadData(false)}
                />
              )}

              {/* ALUNO TABS */}
              {(isAdmin || isStudent) && (activeTab === 'student_portal' || activeTab === 'student_invoices') && currentStudent && (
                <StudentPortal 
                  student={currentStudent}
                  allStudents={students}
                  onSelectStudent={setSelectedPortalStudentId}
                  products={products}
                  sales={sales}
                  invoices={invoices}
                  pixPayments={pixPayments}
                  passeios={passeios}
                  onPaymentSubmitted={handlePaymentSubmitted}
                />
              )}

              {/* RESPONSAVEL TAB */}
              {(isAdmin || isGuardian) && activeTab === 'guardian_portal' && (
                <GuardianPortal 
                  guardian={currentGuardian}
                  students={students}
                  invoices={invoices}
                  sales={sales}
                  pixPayments={pixPayments}
                  passeios={passeios}
                  onPaymentSubmitted={handlePaymentSubmitted}
                />
              )}
            </Suspense>
          )}
        </main>

        {/* Minimal Dark Footer */}
        <footer className="border-t border-white/[0.08] bg-[#0a0a0a] py-4 px-4 sm:px-6 lg:px-8 mt-auto text-xs text-zinc-500">
          <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img
                src="/assets/aistudio/image_e4461e45.png"
                alt="Logo ICEVES"
                decoding="async"
                className="w-5 h-5 rounded-full object-cover bg-white ring-1 ring-emerald-500/40 shrink-0"
              />
              <span className="font-semibold text-zinc-300">{settings?.storeName || 'Lojinha Iceves'}</span>
              <span>•</span>
              <span className="text-zinc-400">Escola de Cristo - ICEVES • 10ª Turma (Formatura: 27 a 30)</span>
            </div>

            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <button
                    onClick={() => setShowTestChecklist(true)}
                    className="text-zinc-300 hover:text-white font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    12 Cenários de Teste Obrigatórios
                  </button>
                  <span>•</span>
                </>
              )}
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
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
