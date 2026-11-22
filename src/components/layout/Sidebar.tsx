import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import {
  Sidebar as UiSidebar,
  SidebarBody,
  SidebarLink,
  SidebarLinkItem,
} from '../ui/sidebar';
import { getInitialsAvatar } from '../../utils/avatar';
import {
  LayoutGrid,
  ShoppingCart,
  Package,
  Users,
  FileText,
  QrCode,
  MessageSquare,
  ShieldAlert,
  Settings,
  Receipt,
  Plus,
  Mail,
  ChevronRight,
  Lock,
  MoreVertical,
  LogOut,
  ShieldCheck,
  Bus,
  Compass,
  Wallet,
  FileSpreadsheet,
  Sparkles,
} from 'lucide-react';
import { SystemSettings } from '../../types';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  settings: SystemSettings | null;
  pendingPixCount: number;
  lowStockCount: number;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  onOpenQuickSale: () => void;
}

export function Sidebar({
  activeTab,
  setActiveTab,
  settings,
  pendingPixCount,
  lowStockCount,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
  onOpenQuickSale,
}: SidebarProps) {
  const {
    user,
    role,
    isAdmin,
    canManage,
    isCashier,
    isStockist,
    isViewer,
    isStudent,
    isGuardian,
    logout,
  } = useAuth();

  const [isHoverOpen, setIsHoverOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [authExpanded, setAuthExpanded] = useState(false);

  // Expanded when pinned open (!isCollapsed), hovered on desktop, or mobile drawer is open
  const isOpen = !isCollapsed || isHoverOpen || isMobileOpen;

  const handleSidebarOpenChange: React.Dispatch<React.SetStateAction<boolean>> = (next) => {
    const resolved = typeof next === 'function' ? next(isHoverOpen) : next;
    setIsHoverOpen(resolved);
    if (!resolved) {
      setShowUserMenu(false);
    }
  };

  const storeName = settings?.storeName || 'Lojinha do Campus';
  const displayStoreName = storeName === 'Lojinha do Campus' ? 'Lojinha Iceves' : storeName;

  const canAccessPdvPasseios =
    canManage ||
    (isCashier &&
      Boolean(
        settings?.pdvPasseiosPermissions?.cashierCanViewPasseios ||
          settings?.pdvPasseiosPermissions?.cashierCanViewHistory ||
          settings?.pdvPasseiosPermissions?.cashierCanCreatePasseios ||
          settings?.pdvPasseiosPermissions?.cashierCanAddExpenses
      ));

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
  };

  const dashboardLinks: SidebarLinkItem[] = [
    {
      label: isStudent ? 'Meu Dashboard' : 'Visão Geral',
      icon: <LayoutGrid className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('dashboard'),
      isActive: activeTab === 'dashboard',
    },
  ];

  const operationsLinks: SidebarLinkItem[] = [];
  if (canManage || isCashier) {
    operationsLinks.push({
      label: 'PDV & Cupons',
      icon: <ShoppingCart className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('pdv'),
      isActive: activeTab === 'pdv' || activeTab === 'sales_history',
    });
    operationsLinks.push({
      label: 'Recibos & Comprovantes',
      icon: <Receipt className="w-4 h-4 shrink-0 text-emerald-400" />,
      onClick: () => handleSelectTab('receipts'),
      isActive: activeTab === 'receipts',
    });
  }
  if (canAccessPdvPasseios) {
    operationsLinks.push({
      label: 'PDV de Passeios',
      icon: <Compass className="w-4 h-4 shrink-0 text-emerald-400" />,
      onClick: () => handleSelectTab('pdv_passeios'),
      isActive: activeTab === 'pdv_passeios',
    });
  }
  if (canManage || isCashier || isStockist || isViewer) {
    operationsLinks.push({
      label: 'Produtos & Estoque',
      icon: <Package className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('products'),
      isActive: activeTab === 'products',
      badge: lowStockCount,
      badgeTone: 'amber',
    });
  }
  if (canManage) {
    operationsLinks.push({
      label: 'Passeios',
      icon: <Bus className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('passeios'),
      isActive: activeTab === 'passeios',
    });
  }

  const financeLinks: SidebarLinkItem[] = [];
  if (canManage || isCashier || isViewer) {
    financeLinks.push({
      label: 'Caixa & Financeiro',
      icon: <Wallet className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('cash_register'),
      isActive: activeTab === 'cash_register',
    });
  }
  if (canManage) {
    financeLinks.push({
      label: 'Faturas & Fechamento',
      icon: <FileText className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('closing'),
      isActive: activeTab === 'closing',
    });
    financeLinks.push({
      label: 'Conferência Pix',
      icon: <QrCode className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('pix'),
      isActive: activeTab === 'pix',
      badge: pendingPixCount,
      badgeTone: 'blue',
    });
  }
  if (canManage || isViewer) {
    financeLinks.push({
      label: 'Relatórios & Exportação',
      icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('reports'),
      isActive: activeTab === 'reports',
    });
  }

  const aiLinks: SidebarLinkItem[] = [
    {
      label: 'ICEVES Inteligência',
      icon: <Sparkles className="w-4 h-4 shrink-0 text-emerald-400" />,
      onClick: () => handleSelectTab('ai_assistant'),
      isActive: activeTab === 'ai_assistant',
    },
  ];

  const peopleLinks: SidebarLinkItem[] = [];
  if (canManage) {
    peopleLinks.push({
      label: 'Alunos & Famílias',
      icon: <Users className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('students'),
      isActive: activeTab === 'students',
    });
  }
  if (isAdmin || isStudent) {
    peopleLinks.push({
      label: 'Portal do Aluno',
      icon: <Receipt className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('student_portal'),
      isActive: activeTab === 'student_portal',
    });
  }
  if (isAdmin || isGuardian) {
    peopleLinks.push({
      label: 'Portal do Responsável',
      icon: <ShieldCheck className="w-4 h-4 shrink-0" />,
      onClick: () => handleSelectTab('guardian_portal'),
      isActive: activeTab === 'guardian_portal',
    });
  }

  const adminLinks: SidebarLinkItem[] = isAdmin
    ? [
        {
          label: 'WhatsApp & Avisos',
          icon: <MessageSquare className="w-4 h-4 shrink-0" />,
          onClick: () => handleSelectTab('whatsapp'),
          isActive: activeTab === 'whatsapp',
        },
        {
          label: 'Auditoria (LGPD)',
          icon: <ShieldAlert className="w-4 h-4 shrink-0" />,
          onClick: () => handleSelectTab('audit'),
          isActive: activeTab === 'audit',
        },
        {
          label: 'Configurações',
          icon: <Settings className="w-4 h-4 shrink-0" />,
          onClick: () => handleSelectTab('settings'),
          isActive: activeTab === 'settings',
        },
      ]
    : [];

  const renderSection = (title: string, items: SidebarLinkItem[]) => {
    if (items.length === 0) return null;
    return (
      <div>
        {isOpen && (
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2.5 mb-1.5">
            {title}
          </div>
        )}
        <nav className="space-y-0.5">
          {items.map((item) => (
            <SidebarLink key={item.label} link={item} />
          ))}
        </nav>
      </div>
    );
  };

  return (
    <UiSidebar open={isOpen} setOpen={handleSidebarOpenChange} animate>
      <SidebarBody
        hideMobileTrigger
        mobileOpen={isMobileOpen}
        setMobileOpen={setIsMobileOpen}
        className="justify-between gap-4 bg-[#121215]"
      >
        {/* Top Area: Brand Logo + Quick Actions + Navigation */}
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden no-scrollbar animate-blur-in">
          {/* Logo Header */}
          <button
            type="button"
            onClick={() => handleSelectTab('dashboard')}
            className="flex items-center gap-2.5 px-1 pb-3 border-b border-white/[0.08] shrink-0 text-left cursor-pointer"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white p-0.5 ring-2 ring-emerald-500/40 shrink-0 shadow-md shadow-emerald-950/60 overflow-hidden">
              <img
                src="/assets/aistudio/image_e4461e45.png"
                alt="Logo ICEVES"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="min-w-0"
              >
                <span className="font-bold text-sm tracking-tight text-white block truncate leading-tight">
                  {displayStoreName}
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold block truncate">
                  Escola de Cristo • ICEVES
                </span>
              </motion.div>
            )}
          </button>

          {/* Quick Sale Action */}
          {(isAdmin || isCashier) && (
            <div className="pt-3 pb-2 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onOpenQuickSale();
                  if (isMobileOpen) setIsMobileOpen(false);
                }}
                title="Abrir PDV e Registrar Venda"
                className={`flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-xs py-2 rounded-xl transition-all shadow-sm shadow-emerald-950/50 cursor-pointer ${
                  isOpen ? 'px-3' : 'px-0'
                }`}
              >
                <Plus className="w-4 h-4 shrink-0" />
                {isOpen && <span className="whitespace-nowrap">Nova Venda</span>}
              </button>

              {isAdmin && isOpen && (
                <button
                  type="button"
                  onClick={() => handleSelectTab('whatsapp')}
                  title="Automações e Comunicação"
                  className="flex items-center justify-center w-8 h-8 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 transition-colors shrink-0 cursor-pointer"
                >
                  <Mail className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Sections */}
          <div className="mt-3 space-y-4">
            {renderSection('Dashboards', dashboardLinks)}
            {renderSection('Operações', operationsLinks)}
            {renderSection('Financeiro', financeLinks)}
            {renderSection('Inteligência', aiLinks)}
            {renderSection('Pessoas & Portais', peopleLinks)}
            {renderSection('Administração', adminLinks)}

            {/* Segurança / Autenticação */}
            <div>
              {isOpen && (
                <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-2.5 mb-1.5">
                  Segurança
                </div>
              )}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!isOpen) setIsCollapsed(false);
                    setAuthExpanded((prev) => !prev);
                  }}
                  title={!isOpen ? 'Autenticação' : undefined}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Lock className="w-4 h-4 shrink-0" />
                    {isOpen && <span>Autenticação</span>}
                  </div>
                  {isOpen && (
                    <motion.div animate={{ rotate: authExpanded ? 90 : 0 }}>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                    </motion.div>
                  )}
                </button>

                <AnimatePresence>
                  {authExpanded && isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="pl-9 space-y-1 overflow-hidden text-xs text-zinc-400"
                    >
                      <button
                        type="button"
                        onClick={() => logout()}
                        className="block w-full text-left py-1.5 hover:text-white cursor-pointer"
                      >
                        Sair / Trocar Conta
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Area: PWA Install + Profile */}
        <div className="pt-3 border-t border-white/[0.08] space-y-3 shrink-0 animate-blur-in">
          {isOpen && <PWAInstallButton variant="sidebar" />}

          <div className="flex items-center justify-between relative">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={user?.avatar || getInitialsAvatar(user?.name || 'Usuário ICEVES')}
                alt={user?.name || 'Usuário'}
                className="w-8 h-8 rounded-full object-cover border border-white/20 shrink-0"
              />
              {isOpen && (
                <div className="text-left min-w-0">
                  <div className="text-xs font-semibold text-zinc-100 truncate">
                    {user?.name || 'Usuário'}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">{user?.email || role}</div>
                </div>
              )}
            </div>

            {isOpen && (
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="text-zinc-500 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
                title="Opções da Conta"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            )}

            <AnimatePresence>
              {showUserMenu && isOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  className="absolute bottom-full left-0 right-0 mb-2 p-2 bg-[#1B1B20] border border-white/[0.12] rounded-xl shadow-2xl z-50 text-xs space-y-1"
                >
                  <div className="px-2 py-1.5 border-b border-white/[0.08]">
                    <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
                    <div className="text-[10px] text-emerald-400 font-medium">{role}</div>
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        setShowUserMenu(false);
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sair do Sistema</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </SidebarBody>
    </UiSidebar>
  );
}
