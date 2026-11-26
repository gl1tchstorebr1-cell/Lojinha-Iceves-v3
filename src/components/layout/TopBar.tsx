import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { getInitialsAvatar } from '../../utils/avatar';
import { formatProductPrice } from '../../utils/formatters';
import {
  Search,
  Settings,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  LayoutGrid,
  ShoppingCart,
  Package,
  Users,
  FileText,
  QrCode,
  MessageSquare,
  ShieldAlert,
  X,
  Bell,
  AlertTriangle,
  LogOut,
  Wallet,
  FileSpreadsheet,
  Sparkles,
  Receipt,
  Compass,
  Bus,
  ChevronRight,
  CornerDownLeft,
} from 'lucide-react';
import { SystemSettings, Product, PixPayment, Student } from '../../types';

interface TopBarProps {
  activeTab: string;
  settings: SystemSettings | null;
  products: Product[];
  students?: Student[];
  pixPayments: PixPayment[];
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  onOpenMobileMenu: () => void;
  onNavigate: (tab: string) => void;
}

const TAB_BREADCRUMBS: Record<string, { section: string; label: string }> = {
  dashboard: { section: 'Visão Geral', label: 'Dashboard' },
  pdv: { section: 'Operações', label: 'PDV & Cupons' },
  sales_history: { section: 'Operações', label: 'Vendas & Estornos' },
  receipts: { section: 'Operações', label: 'Recibos & Comprovantes' },
  pdv_passeios: { section: 'Operações', label: 'PDV de Passeios' },
  products: { section: 'Operações', label: 'Produtos & Estoque' },
  passeios: { section: 'Gestão', label: 'Passeios' },
  cash_register: { section: 'Financeiro', label: 'Caixa & Financeiro' },
  closing: { section: 'Financeiro', label: 'Faturas & Fechamento' },
  pix: { section: 'Financeiro', label: 'Conferência Pix' },
  reports: { section: 'Financeiro', label: 'Relatórios & Exportação' },
  ai_assistant: { section: 'Inteligência', label: 'ICEVES Inteligência' },
  students: { section: 'Pessoas', label: 'Alunos & Famílias' },
  student_portal: { section: 'Portais', label: 'Portal do Aluno' },
  student_invoices: { section: 'Portais', label: 'Minhas Faturas' },
  guardian_portal: { section: 'Portais', label: 'Portal do Responsável' },
  whatsapp: { section: 'Administração', label: 'WhatsApp & Avisos' },
  audit: { section: 'Administração', label: 'Auditoria (LGPD)' },
  settings: { section: 'Administração', label: 'Configurações' },
};

interface PaletteResult {
  id: string;
  name: string;
  subtitle?: string;
  section: string;
  tab: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const TopBar = React.memo(function TopBar({
  activeTab,
  settings,
  products,
  students = [],
  pixPayments,
  isCollapsed,
  setIsCollapsed,
  onOpenMobileMenu,
  onNavigate,
}: TopBarProps) {
  const { user, isAdmin, canManage, isCashier, isStockist, isViewer, isStudent, isGuardian, logout } = useAuth();
  const { isLight, toggleTheme } = useTheme();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifContainerRef = useRef<HTMLDivElement>(null);

  const pendingPix = useMemo(
    () => (canManage ? pixPayments.filter((p) => p.status === 'AGUARDANDO_CONFERENCIA') : []),
    [canManage, pixPayments]
  );
  const lowStock = useMemo(
    () =>
      canManage || isCashier || isStockist
        ? products.filter((p) => p.status === 'ACTIVE' && !p.archived && p.currentStock <= p.minStock)
        : [],
    [canManage, isCashier, isStockist, products]
  );
  const totalNotifications = pendingPix.length + lowStock.length;

  const currentBreadcrumb = TAB_BREADCRUMBS[activeTab] || { section: 'Lojinha', label: 'Painel' };

  // Close notifications on click outside
  useEffect(() => {
    if (!showNotifications) return;
    const handleOutside = (e: MouseEvent) => {
      if (notifContainerRef.current && !notifContainerRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showNotifications]);

  // Global keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((prev) => {
          if (!prev) {
            setCmdQuery('');
            setSelectedIndex(0);
          }
          return !prev;
        });
      }
      if (e.key === 'Escape') {
        setCmdOpen(false);
        setShowNotifications(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Unified Command Palette results (Modules + Live Products & Students search)
  const commandItems = useMemo<PaletteResult[]>(() => {
    const canAccessPdvPasseios =
      canManage ||
      (isCashier &&
        Boolean(
          settings?.pdvPasseiosPermissions?.cashierCanViewPasseios ||
            settings?.pdvPasseiosPermissions?.cashierCanViewHistory ||
            settings?.pdvPasseiosPermissions?.cashierCanCreatePasseios ||
            settings?.pdvPasseiosPermissions?.cashierCanAddExpenses
        ));

    const navItems = [
      { id: 'nav-dash', name: isStudent ? 'Meu Dashboard' : 'Visão Geral (Dashboard)', icon: LayoutGrid, section: 'Navegação', tab: 'dashboard', allowed: true },
      { id: 'nav-pdv', name: 'Ponto de Venda & Cupons (PDV)', icon: ShoppingCart, section: 'Operações', tab: 'pdv', allowed: canManage || isCashier },
      { id: 'nav-receipts', name: 'Recibos & Comprovantes de Vendas', icon: Receipt, section: 'Operações', tab: 'receipts', allowed: canManage || isCashier },
      { id: 'nav-pdv-passeios', name: 'PDV de Passeios', icon: Compass, section: 'Operações', tab: 'pdv_passeios', allowed: canAccessPdvPasseios },
      { id: 'nav-products', name: 'Produtos & Estoque', icon: Package, section: 'Operações', tab: 'products', allowed: canManage || isCashier || isStockist || isViewer },
      { id: 'nav-passeios', name: 'Gestão de Passeios', icon: Bus, section: 'Operações', tab: 'passeios', allowed: canManage },
      { id: 'nav-cash', name: 'Caixa & Financeiro', icon: Wallet, section: 'Financeiro', tab: 'cash_register', allowed: canManage || isCashier || isViewer },
      { id: 'nav-closing', name: 'Faturas & Fechamento Mensal', icon: FileText, section: 'Financeiro', tab: 'closing', allowed: canManage },
      { id: 'nav-pix', name: 'Conferência Pix', icon: QrCode, section: 'Financeiro', tab: 'pix', allowed: canManage },
      { id: 'nav-reports', name: 'Central de Relatórios (CSV / Excel / PDF)', icon: FileSpreadsheet, section: 'Financeiro', tab: 'reports', allowed: canManage || isViewer },
      { id: 'nav-ai', name: 'ICEVES Inteligência (Assistente IA)', icon: Sparkles, section: 'Inteligência', tab: 'ai_assistant', allowed: true },
      { id: 'nav-students', name: 'Alunos & Responsáveis', icon: Users, section: 'Pessoas', tab: 'students', allowed: canManage },
      { id: 'nav-student-portal', name: 'Portal do Aluno', icon: LayoutGrid, section: 'Portais', tab: 'student_portal', allowed: isAdmin || isStudent },
      { id: 'nav-guardian-portal', name: 'Portal do Responsável', icon: Users, section: 'Portais', tab: 'guardian_portal', allowed: isAdmin || isGuardian },
      { id: 'nav-whatsapp', name: 'WhatsApp & Comunicação', icon: MessageSquare, section: 'Administração', tab: 'whatsapp', allowed: isAdmin },
      { id: 'nav-audit', name: 'Auditoria & Livro-Razão (LGPD)', icon: ShieldAlert, section: 'Administração', tab: 'audit', allowed: isAdmin },
      { id: 'nav-settings', name: 'Configurações do Sistema', icon: Settings, section: 'Administração', tab: 'settings', allowed: isAdmin },
    ];

    const q = cmdQuery.trim().toLowerCase();
    const matchedNav: PaletteResult[] = navItems
      .filter((i) => i.allowed && (!q || i.name.toLowerCase().includes(q) || i.section.toLowerCase().includes(q)))
      .map(({ id, name, icon, section, tab }) => ({ id, name, icon, section, tab }));

    if (q.length < 2) return matchedNav;

    const extras: PaletteResult[] = [];
    if (canManage || isCashier || isStockist || isViewer) {
      const matchedProducts = products
        .filter(
          (p) =>
            p.status === 'ACTIVE' &&
            !p.archived &&
            (p.name.toLowerCase().includes(q) || p.internalCode.toLowerCase().includes(q))
        )
        .slice(0, 4);
      for (const p of matchedProducts) {
        extras.push({
          id: `prod-${p.id}`,
          name: p.name,
          subtitle: `${formatProductPrice(p.price, p.priceStatus)} · Estoque: ${p.currentStock} ${p.unit}`,
          section: 'Produto',
          tab: 'products',
          icon: Package,
        });
      }
    }

    if (canManage) {
      const matchedStudents = students
        .filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.registrationNumber.toLowerCase().includes(q)
        )
        .slice(0, 4);
      for (const s of matchedStudents) {
        extras.push({
          id: `stu-${s.id}`,
          name: s.name,
          subtitle: `Matrícula ${s.registrationNumber}`,
          section: 'Aluno',
          tab: 'students',
          icon: Users,
        });
      }
    }

    return [...matchedNav, ...extras];
  }, [
    isStudent,
    canManage,
    isCashier,
    isStockist,
    isViewer,
    isAdmin,
    isGuardian,
    settings,
    cmdQuery,
    products,
    students,
  ]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [cmdQuery, cmdOpen]);

  const handlePaletteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (commandItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % commandItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + commandItems.length) % commandItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = commandItems[selectedIndex];
      if (target) {
        onNavigate(target.tab);
        setCmdOpen(false);
      }
    }
  };

  return (
    <>
      <header className="h-14 border-b border-white/[0.07] flex items-center justify-between gap-4 px-4 sm:px-6 shrink-0 bg-[#08080b]/80 backdrop-blur-xl sticky top-0 z-30">
        {/* Left Zone: Sidebar toggle + Contextual Breadcrumb + Quick Command Trigger */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (window.innerWidth < 1024) {
                onOpenMobileMenu();
              } else {
                setIsCollapsed(!isCollapsed);
              }
            }}
            className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors cursor-pointer shrink-0"
            aria-label="Alternar Menu Lateral"
          >
            {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>

          {/* Clean Contextual Breadcrumb Trail */}
          <nav
            aria-label="Localização atual"
            className="hidden xl:flex items-center gap-1.5 text-xs text-zinc-500 whitespace-nowrap shrink-0 pr-2 border-r border-white/[0.07]"
          >
            <span className="text-zinc-400 font-medium">{currentBreadcrumb.section}</span>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
            <span className="text-zinc-100 font-semibold tracking-tight">{currentBreadcrumb.label}</span>
          </nav>

          {/* Command Palette Trigger */}
          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-400 hover:border-emerald-500/30 hover:bg-white/[0.05] hover:text-zinc-200 transition-all w-44 sm:w-64 justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
              <span className="truncate">Buscar telas, produtos, alunos...</span>
            </div>
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.07] border border-white/[0.08] text-[10px] text-zinc-400 font-mono shrink-0">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Right Zone: PWA, Theme, Notifications, Settings, Profile */}
        <div className="flex items-center gap-2 relative shrink-0">
          <PWAInstallButton variant="topbar" />

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title={isLight ? 'Alternar para Tema Escuro' : 'Alternar para Tema Claro'}
            aria-label={isLight ? 'Alternar para Tema Escuro' : 'Alternar para Tema Claro'}
          >
            {isLight ? <Moon className="w-4 h-4 text-amber-400" /> : <Sun className="w-4 h-4 text-amber-300" />}
          </button>

          {/* Notifications Button */}
          {(canManage || isCashier || isStockist) && (
            <div ref={notifContainerRef} className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer relative"
                title="Notificações e Avisos"
                aria-label="Notificações e Avisos"
              >
                <Bell className="w-4 h-4" />
                {totalNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-[#09090b] text-[10px] font-mono font-bold flex items-center justify-center leading-none">
                    {totalNotifications > 9 ? '9+' : totalNotifications}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-[#111116]/98 backdrop-blur-2xl border border-white/[0.11] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)] p-3 z-50 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                      <span className="font-semibold text-white">Central de Avisos</span>
                      <span className="text-[11px] text-zinc-400 font-mono tabular-nums">
                        {totalNotifications} pendente(s)
                      </span>
                    </div>

                    {totalNotifications === 0 ? (
                      <div className="py-5 text-center text-zinc-500 text-xs">
                        Tudo em dia. Nenhuma pendência no momento.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {canManage && pendingPix.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              onNavigate('pix');
                              setShowNotifications(false);
                            }}
                            className="w-full text-left p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition flex items-start gap-2.5 text-zinc-300 cursor-pointer"
                          >
                            <QrCode className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-medium text-white">{pendingPix.length} Pix para conferir</div>
                              <div className="text-[11px] text-zinc-400">Comprovantes aguardando validação</div>
                            </div>
                          </button>
                        )}

                        {lowStock.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              onNavigate('products');
                              setShowNotifications(false);
                            }}
                            className="w-full text-left p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition flex items-start gap-2.5 text-zinc-300 cursor-pointer"
                          >
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <div className="font-medium text-white">{lowStock.length} produto(s) em estoque baixo</div>
                              <div className="text-[11px] text-zinc-400">Abaixo do nível mínimo cadastrado</div>
                            </div>
                          </button>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Quick Settings - Exclusivo para Administradores */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Configurações do Sistema"
              aria-label="Configurações do Sistema"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* User Profile & Logout */}
          <div className="flex items-center gap-2.5 pl-2.5 ml-0.5 border-l border-white/[0.08]">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-xs font-semibold text-zinc-100 max-w-[140px] truncate">
                {user?.name}
              </span>
              <span className="text-[10px] text-zinc-400 font-medium">
                {user?.registrationNumber || user?.role}
              </span>
            </div>
            <img
              src={user?.avatar || getInitialsAvatar(user?.name || 'Usuário ICEVES')}
              alt={user?.name || 'Perfil'}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-full object-cover border border-white/15 shrink-0"
              title={`${user?.name} (${user?.role})`}
            />
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.08] text-red-400 hover:bg-red-500/15 hover:text-red-300 transition-colors cursor-pointer text-xs font-medium whitespace-nowrap shrink-0"
              title="Encerrar sessão e voltar ao login"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Raycast / Linear-Grade Command Palette Modal */}
      <AnimatePresence>
        {cmdOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setCmdOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.965, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.965, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-xl rounded-2xl bg-[#111116]/98 backdrop-blur-2xl border border-white/[0.12] shadow-[0_24px_80px_-16px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] overflow-hidden z-10"
            >
              <div className="flex items-center border-b border-white/[0.08] px-4 py-3.5">
                <Search className="w-4 h-4 text-emerald-400 mr-3 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={cmdQuery}
                  onChange={(e) => setCmdQuery(e.target.value)}
                  onKeyDown={handlePaletteKeyDown}
                  placeholder="Digite um módulo, produto ou aluno..."
                  className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:shadow-none"
                />
                <button
                  type="button"
                  onClick={() => setCmdOpen(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded-md hover:bg-white/[0.06] cursor-pointer transition-colors"
                  aria-label="Fechar busca rápida"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
                {commandItems.length === 0 ? (
                  <p className="p-6 text-xs text-zinc-500 text-center">
                    Nenhum módulo, produto ou aluno encontrado para "{cmdQuery}".
                  </p>
                ) : (
                  commandItems.map((item, index) => {
                    const Icon = item.icon;
                    const isSelected = index === selectedIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseEnter={() => setSelectedIndex(index)}
                        onClick={() => {
                          onNavigate(item.tab);
                          setCmdOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-colors text-left cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/15 text-white border border-emerald-500/25'
                            : 'text-zinc-300 border border-transparent hover:bg-white/[0.05] hover:text-white'
                        }`}
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-zinc-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.name}</div>
                          {item.subtitle && (
                            <div className="text-[11px] text-zinc-400 font-mono truncate">{item.subtitle}</div>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500 font-medium shrink-0">{item.section}</span>
                        {isSelected && <CornerDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="border-t border-white/[0.08] px-4 py-2.5 flex items-center justify-between text-[11px] text-zinc-500 bg-black/30">
                <span className="flex items-center gap-2">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.07] font-mono text-[10px] text-zinc-300">↑↓</kbd>
                  <span>navegar</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.07] font-mono text-[10px] text-zinc-300">↵</kbd>
                  <span>abrir</span>
                </span>
                <span>ESC para fechar</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
});
