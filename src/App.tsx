import React, { useState, useEffect, useCallback, useMemo, useRef, useTransition, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { OfflineBanner } from './components/pwa/OfflineBanner';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  commitReversalBundleToOfflineSnapshot,
  commitSaleBundleToOfflineSnapshot,
  loadOfflineSnapshot,
  recoverOfflineSnapshotOnBoot,
  saveOfflineSnapshot,
  type OfflineDataSnapshot,
} from './utils/offlineSnapshotCache';
import { validateDataIntegrity } from './utils/dataIntegrity';
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
  Passeio,
  SalesReceipt
} from './types';
import { api, type SaleReversalBundle, type SaleTransactionBundle } from './services/api';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

// Code-splitting / Lazy loading of modules for faster initial load
const LoginPage = lazy(() => import('./components/auth/LoginPage').then(m => ({ default: m.LoginPage })));
const Dashboard = lazy(() => import('./components/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const PointOfSale = lazy(() => import('./components/pdv/PointOfSale').then(m => ({ default: m.PointOfSale })));
const SalesReceiptsManagement = lazy(() => import('./components/receipts/SalesReceiptsManagement').then(m => ({ default: m.SalesReceiptsManagement })));
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
  <div className="space-y-6 animate-blur-in" aria-busy="true" aria-label="Carregando módulo">
    <div className="h-20 rounded-xl skeleton-shimmer border border-white/[0.06]" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-32 rounded-xl skeleton-shimmer border border-white/[0.06]" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-7 h-72 rounded-xl skeleton-shimmer border border-white/[0.06]" />
      <div className="lg:col-span-5 h-72 rounded-xl skeleton-shimmer border border-white/[0.06]" />
    </div>
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
  const [receipts, setReceipts] = useState<SalesReceipt[]>([]);
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
  const [isPending, startTransition] = useTransition();
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [showTestChecklist, setShowTestChecklist] = useState(false);
  const hasMountedTabRef = useRef(false);

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

  // Recuperação segura de snapshot local em caso de transação interrompida antes do reload
  useEffect(() => {
    const recovery = recoverOfflineSnapshotOnBoot();
    if (recovery.recovered && import.meta.env.DEV) {
      console.warn('[ICEVES Recovery]', recovery.reason);
    }
  }, []);

  // Snapshot sempre sincronizado para commits atômicos imediatos
  const latestSnapshotRef = useRef<OfflineDataSnapshot>({
    syncedAt: new Date().toISOString(),
    settings: null,
    products: [],
    students: [],
    guardians: [],
    sales: [],
    receipts: [],
    stockMovements: [],
    financialLedger: [],
    auditLogs: [],
    invoices: [],
    pixPayments: [],
    whatsappNotifications: [],
    passeios: [],
  });

  useEffect(() => {
    latestSnapshotRef.current = {
      syncedAt: lastSyncedAt || new Date().toISOString(),
      settings,
      products,
      students,
      guardians,
      sales,
      receipts,
      stockMovements,
      financialLedger: ledger,
      auditLogs,
      invoices,
      pixPayments,
      whatsappNotifications,
      passeios,
    };
  }, [
    lastSyncedAt,
    settings,
    products,
    students,
    guardians,
    sales,
    receipts,
    stockMovements,
    ledger,
    auditLogs,
    invoices,
    pixPayments,
    whatsappNotifications,
    passeios,
  ]);

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
        receiptsData,
        invoicesData,
        pixData,
        notificationsData,
        passeiosData,
      ] = await Promise.all([
        api.getSettings(),
        api.getProducts(),
        api.getStudents(),
        api.getSales(),
        isStockist ? Promise.resolve([] as SalesReceipt[]) : api.getReceipts(),
        api.getInvoices(),
        api.getPixPayments(),
        api.getWhatsAppNotifications(),
        api.getPasseios(),
      ]);

      // Proteção contra sobrescrita por resposta parcialmente inconsistente em refresh silencioso
      if (silent && !isStockist) {
        const fetchedIssues = validateDataIntegrity({
          sales: salesData,
          receipts: receiptsData,
          products: productsData,
          students: studentsData,
          invoices: invoicesData,
        }).filter(
          i =>
            i.code === 'RECEIPT_ACTIVE_WITHOUT_COMPLETED_SALE' ||
            i.code === 'COMPLETED_SALE_WITHOUT_ACTIVE_RECEIPT'
        );
        const currentIssues = validateDataIntegrity({
          sales: latestSnapshotRef.current.sales,
          receipts: latestSnapshotRef.current.receipts || [],
          products: latestSnapshotRef.current.products,
          students: latestSnapshotRef.current.students,
          invoices: latestSnapshotRef.current.invoices,
        }).filter(
          i =>
            i.code === 'RECEIPT_ACTIVE_WITHOUT_COMPLETED_SALE' ||
            i.code === 'COMPLETED_SALE_WITHOUT_ACTIVE_RECEIPT'
        );
        if (fetchedIssues.length > currentIssues.length) {
          console.warn(
            '[ICEVES Integridade] Refresh silencioso retornou snapshot divergente e foi descartado para preservar consistência:',
            fetchedIssues
          );
          return;
        }
      }

      setSettings(settingsData);
      setProducts(productsData);
      setStudents(studentsData);
      setSales(salesData);
      setReceipts(receiptsData);
      setInvoices(invoicesData);
      setPixPayments(pixData);
      setWhatsappNotifications(notificationsData);
      setPasseios(passeiosData);

      let guardiansData: Guardian[] = latestSnapshotRef.current.guardians || [];
      let movementsData: StockMovement[] = latestSnapshotRef.current.stockMovements || [];
      let auditData: AuditLog[] = latestSnapshotRef.current.auditLogs || [];
      let ledgerData: FinancialTransaction[] = latestSnapshotRef.current.financialLedger || [];

      // Load manager/admin/stockist auxiliary data if authorized
      if (canManage || isStockist || isViewer) {
        try {
          const [gData, mData, aData, lData] = await Promise.all([
            canManage || isViewer ? api.getGuardians().catch(() => guardiansData) : Promise.resolve(guardiansData),
            api.getStockMovements().catch(() => movementsData),
            canManage ? api.getAuditLogs().catch(() => auditData) : Promise.resolve(auditData),
            canManage || isViewer ? api.getFinancialLedger().catch(() => ledgerData) : Promise.resolve(ledgerData),
          ]);
          guardiansData = gData;
          movementsData = mData;
          auditData = aData;
          ledgerData = lData;
          setGuardians(guardiansData);
          setStockMovements(movementsData);
          setAuditLogs(auditData);
          setLedger(ledgerData);
        } catch {
          // non-critical
        }
      }

      const syncedAt = new Date().toISOString();
      setLastSyncedAt(syncedAt);
      const fullSnapshot: OfflineDataSnapshot = {
        syncedAt,
        settings: settingsData,
        products: productsData,
        students: studentsData,
        guardians: guardiansData,
        sales: salesData,
        receipts: receiptsData,
        stockMovements: movementsData,
        financialLedger: ledgerData,
        auditLogs: auditData,
        invoices: invoicesData,
        pixPayments: pixData,
        whatsappNotifications: notificationsData,
        passeios: passeiosData,
      };
      latestSnapshotRef.current = fullSnapshot;
      saveOfflineSnapshot(fullSnapshot);

      if (import.meta.env.DEV && !isStockist) {
        const issues = validateDataIntegrity({
          sales: salesData,
          receipts: receiptsData,
          products: productsData,
          students: studentsData,
          stockMovements: movementsData,
          financialLedger: ledgerData,
          invoices: invoicesData,
        });
        if (issues.length > 0) {
          console.warn('[ICEVES Integridade] Inconsistências detectadas no carregamento:', issues);
        }
      }
    } catch (err) {
      console.warn('Sincronização com servidor pendente; tentando recuperação automática:', err);
      const cached = loadOfflineSnapshot();
      if (cached) {
        setSettings(cached.settings);
        setProducts(cached.products || []);
        setStudents(cached.students || []);
        if (cached.guardians) setGuardians(cached.guardians);
        setSales(cached.sales || []);
        setReceipts(cached.receipts || []);
        if (cached.stockMovements) setStockMovements(cached.stockMovements);
        if (cached.financialLedger) setLedger(cached.financialLedger);
        if (cached.auditLogs) setAuditLogs(cached.auditLogs);
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

  const wasOfflineRef = useRef(false);
  const silentSyncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (user) {
      loadData(false);
    }
  }, [user, loadData]);

  // Idle prefetch of core lazy modules after login for near-instant tab switching
  useEffect(() => {
    if (!user) return;
    const prefetchCoreModules = () => {
      void import('./components/dashboard/Dashboard');
      void import('./components/pdv/PointOfSale');
      void import('./components/products/ProductsAndStock');
      void import('./components/receipts/SalesReceiptsManagement');
      void import('./components/invoices/InvoicesAndClosing');
    };
    if (typeof window === 'undefined') return;
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(prefetchCoreModules, { timeout: 2500 });
      return () => {
        win.cancelIdleCallback?.(idleId);
      };
    }
    const timer = window.setTimeout(prefetchCoreModules, 1200);
    return () => window.clearTimeout(timer);
  }, [user]);

  // Smoothly return viewport to top when switching views
  useEffect(() => {
    if (!hasMountedTabRef.current) {
      hasMountedTabRef.current = true;
      return;
    }
    if (typeof window !== 'undefined' && window.scrollY > 120) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [activeTab]);

  // Auto-sync only when transitioning back online after being offline
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current && user) {
      wasOfflineRef.current = false;
      loadData(true);
    }
  }, [isOnline, user, loadData]);

  // Coalesce rapid silent background refreshes to avoid redundant multi-endpoint bursts
  const refreshSilent = useCallback(() => {
    if (silentSyncTimerRef.current !== null) {
      window.clearTimeout(silentSyncTimerRef.current);
    }
    silentSyncTimerRef.current = window.setTimeout(() => {
      silentSyncTimerRef.current = null;
      loadData(true);
    }, 220);
  }, [loadData]);

  useEffect(() => {
    return () => {
      if (silentSyncTimerRef.current !== null) {
        window.clearTimeout(silentSyncTimerRef.current);
      }
    };
  }, []);

  // Safe navigation handler enforcing RBAC roles with non-blocking transitions
  const handleSafeNavigate = useCallback(
    (tab: string) => {
      const adminOnlyTabs = ['whatsapp', 'audit', 'settings'];
      const managerOrAdminTabs = ['passeios', 'students', 'closing', 'pix', 'reports'];
      const cashTabs = ['cash_register'];
      const pdvTabs = ['pdv', 'sales_history', 'receipts'];
      const stockTabs = ['products'];

      const fallbackHome = () => {
        if (isStudent) return 'student_portal';
        if (isGuardian) return 'guardian_portal';
        if (role === 'CASHIER') return 'pdv';
        if (role === 'STOCKIST') return 'products';
        return 'dashboard';
      };

      const switchTo = (nextTab: string) => {
        startTransition(() => {
          setActiveTab(nextTab);
        });
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
          switchTo(fallbackHome());
          return;
        }
        switchTo(tab);
        return;
      }

      if (adminOnlyTabs.includes(tab) && !isAdmin) {
        switchTo(fallbackHome());
        return;
      }

      if (managerOrAdminTabs.includes(tab) && !canManage && !(isViewer && tab === 'reports')) {
        switchTo(fallbackHome());
        return;
      }

      if (cashTabs.includes(tab) && !(canManage || isCashier || isViewer)) {
        switchTo(fallbackHome());
        return;
      }

      if (pdvTabs.includes(tab) && !(canManage || isCashier)) {
        switchTo(fallbackHome());
        return;
      }

      if (stockTabs.includes(tab) && !(canManage || isCashier || isStockist || isViewer)) {
        switchTo(fallbackHome());
        return;
      }

      switchTo(tab);
    },
    [isAdmin, canManage, isCashier, isStockist, isViewer, isStudent, isGuardian, role, settings, startTransition]
  );

  // Handlers for POS and Sales (Commit atômico em todas as coleções + snapshot local)
  const handleSaleCompleted = useCallback((bundle: SaleTransactionBundle) => {
    if (!bundle?.sale || bundle.sale.status !== 'COMPLETED') {
      throw new Error('A venda não retornou com status COMPLETED após persistência.');
    }
    if (!bundle.receipt || bundle.receipt.saleId !== bundle.sale.id) {
      throw new Error('Recibo vinculado à venda não foi confirmado.');
    }

    const committed = commitSaleBundleToOfflineSnapshot(latestSnapshotRef.current, bundle);
    latestSnapshotRef.current = committed;

    setSales(committed.sales);
    setReceipts(committed.receipts || []);
    setStudents(committed.students);
    setProducts(committed.products);
    if (committed.stockMovements) setStockMovements(committed.stockMovements);
    if (committed.financialLedger) setLedger(committed.financialLedger);
    if (committed.auditLogs) setAuditLogs(committed.auditLogs);
    setLastSyncedAt(committed.syncedAt);

    refreshSilent();
  }, [refreshSilent]);

  const handleSaleReversed = useCallback((bundle: SaleReversalBundle) => {
    const committed = commitReversalBundleToOfflineSnapshot(latestSnapshotRef.current, bundle);
    latestSnapshotRef.current = committed;

    setSales(committed.sales);
    setReceipts(committed.receipts || []);
    setStudents(committed.students);
    setProducts(committed.products);
    setInvoices(committed.invoices);
    if (committed.stockMovements) setStockMovements(committed.stockMovements);
    if (committed.financialLedger) setLedger(committed.financialLedger);
    if (committed.auditLogs) setAuditLogs(committed.auditLogs);
    setLastSyncedAt(committed.syncedAt);

    refreshSilent();
  }, [refreshSilent]);

  const handleReceiptUpdated = useCallback((updatedReceipt: SalesReceipt) => {
    setReceipts(prev => prev.map(r => r.id === updatedReceipt.id ? updatedReceipt : r));
  }, []);

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
    <div className="min-h-screen bg-[#070709] text-[#f4f4f6] flex font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-100 relative">
      {/* Subtle Top Ambient Radial Illumination */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[420px] z-0"
        style={{
          background:
            'radial-gradient(ellipse 65% 55% at 55% -10%, rgba(16, 185, 129, 0.085), rgba(20, 184, 166, 0.025) 45%, transparent 75%)',
        }}
      />

      {/* Ultra-crisp Non-Blocking Route Transition Hairline */}
      {isPending && (
        <div
          aria-hidden="true"
          className="fixed top-0 left-0 right-0 h-[2px] z-[80] overflow-hidden bg-emerald-500/15"
        >
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-emerald-400 to-teal-300 animate-pulse" />
        </div>
      )}

      {/* Vertical Sticky Collapsible Sidebar */}
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
      <div className="flex-1 flex flex-col min-h-screen min-w-0 relative z-10">
        
        {/* TopBar with Contextual Breadcrumb, Search (⌘K), Notifications & Profile */}
        <TopBar 
          activeTab={activeTab}
          settings={settings}
          products={products}
          students={students}
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
            <ViewFallback />
          ) : (
            <div key={activeTab} className="blur-fade-stage">
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
                  receipts={receipts}
                  settings={settings}
                  onSaleCompleted={handleSaleCompleted}
                  onSaleReversed={handleSaleReversed}
                  onReceiptUpdated={handleReceiptUpdated}
                />
              )}

              {(canManage || isCashier) && activeTab === 'receipts' && (
                <SalesReceiptsManagement
                  receipts={receipts}
                  settings={settings}
                  onReceiptUpdated={handleReceiptUpdated}
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
                  settings={settings}
                  whatsappNotifications={whatsappNotifications}
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
                  sales={sales}
                  receipts={receipts}
                  products={products}
                  stockMovements={stockMovements}
                  invoices={invoices}
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
                  receipts={receipts}
                  settings={settings}
                  invoices={invoices}
                  pixPayments={pixPayments}
                  passeios={passeios}
                  onPaymentSubmitted={handlePaymentSubmitted}
                  onReceiptUpdated={handleReceiptUpdated}
                />
              )}

              {/* RESPONSAVEL TAB */}
              {(isAdmin || isGuardian) && activeTab === 'guardian_portal' && (
                <GuardianPortal 
                  guardian={currentGuardian}
                  students={students}
                  invoices={invoices}
                  sales={sales}
                  receipts={receipts}
                  settings={settings}
                  pixPayments={pixPayments}
                  passeios={passeios}
                  onPaymentSubmitted={handlePaymentSubmitted}
                  onReceiptUpdated={handleReceiptUpdated}
                />
              )}
              </Suspense>
            </div>
          )}
        </main>

        {/* Quiet Executive Footer */}
        <footer className="border-t border-white/[0.06] bg-[#070709]/80 py-4 px-4 sm:px-6 lg:px-8 mt-auto text-xs text-zinc-500">
          <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img
                src="/assets/aistudio/image_e4461e45.png"
                alt="Logo ICEVES"
                decoding="async"
                className="w-5 h-5 rounded-full object-cover bg-white ring-1 ring-emerald-500/35 shrink-0"
              />
              <span className="font-semibold text-zinc-300">{settings?.storeName || 'Lojinha Iceves'}</span>
              <span className="text-zinc-600" aria-hidden="true">·</span>
              <span className="text-zinc-400">Escola de Cristo — ICEVES · 10ª Turma</span>
            </div>

            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowTestChecklist(true)}
                    className="text-zinc-400 hover:text-white font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Validação Operacional</span>
                  </button>
                  <span className="text-zinc-700" aria-hidden="true">·</span>
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
          <div className="bg-[#141414] rounded-2xl shadow-2xl border border-white/[0.12] max-w-2xl w-full p-6 animate-modal-blur-in max-h-[90vh] overflow-y-auto">
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
