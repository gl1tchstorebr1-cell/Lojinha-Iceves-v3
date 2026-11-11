import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { 
  Command, 
  LayoutGrid, 
  ShoppingCart, 
  Package, 
  Users, 
  DollarSign, 
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
  Folder, 
  MoreVertical, 
  LogOut, 
  KeyRound, 
  ShieldCheck, 
  Boxes, 
  Calendar,
  X,
  CreditCard,
  Building2,
  Store,
  UserCheck
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
  onOpenQuickSale
}: SidebarProps) {
  const { user, role, isAdmin, isCashier, isStudent, isGuardian, switchPersona, allDemoUsers, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [authExpanded, setAuthExpanded] = useState(false);

  const storeName = settings?.storeName || 'Lojinha do Campus';

  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Main Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-[#111111] border-r border-white/[0.08] flex flex-col transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-[68px]' : 'w-[240px]'
        } ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Header */}
        <div className="p-3.5 flex items-center justify-between border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white p-0.5 ring-2 ring-emerald-500/40 shrink-0 shadow-md shadow-emerald-950/60 overflow-hidden">
              <img
                src="/assets/aistudio/image_e4461e45.png"
                alt="Logo ICEVES"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <span className="font-bold text-sm tracking-tight text-white block truncate leading-tight">
                  {storeName === 'Lojinha do Campus' ? 'Lojinha Iceves' : storeName}
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold block truncate">
                  Escola de Cristo • ICEVES
                </span>
              </div>
            )}
          </div>
          {isMobileOpen && (
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden text-zinc-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Action Buttons (ICEVES Green Gradient) */}
        <div className="px-3 py-2.5 flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              onOpenQuickSale();
              if (isMobileOpen) setIsMobileOpen(false);
            }}
            title="Abrir PDV e Registrar Venda"
            className={`flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-xs py-2 px-3 rounded-lg transition-all shadow-sm shadow-emerald-950/50 cursor-pointer ${
              isCollapsed ? 'p-2' : ''
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Nova Venda</span>}
          </button>

          <button
            onClick={() => handleSelectTab('whatsapp')}
            title="Automações e Comunicação"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/15 transition-colors shrink-0 cursor-pointer"
          >
            <Mail className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-5 scrollbar-thin">
          
          {/* Section: Dashboards */}
          <div>
            {!isCollapsed && (
              <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-2 mb-1.5">
                Dashboards
              </div>
            )}
            <nav className="space-y-1">
              <button
                onClick={() => handleSelectTab('dashboard')}
                className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                }`}
              >
                {activeTab === 'dashboard' && (
                  <motion.div
                    layoutId="activeTabBadge"
                    className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <LayoutGrid className="w-4 h-4 shrink-0 z-10" />
                {!isCollapsed && <span className="z-10">Visão Geral</span>}
              </button>
            </nav>
          </div>

          {/* Section: Operações (Vendas e cupons unificada com PDV conforme solicitação) */}
          {(isAdmin || isCashier) && (
            <div>
              {!isCollapsed && (
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-2 mb-1.5">
                  Operações
                </div>
              )}
              <nav className="space-y-1">
                {/* Unified PDV & Cupons */}
                <button
                  onClick={() => handleSelectTab('pdv')}
                  className={`relative w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'pdv' || activeTab === 'sales_history'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {(activeTab === 'pdv' || activeTab === 'sales_history') && (
                    <motion.div
                      layoutId="activeTabBadge"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <div className="flex items-center gap-3 z-10">
                    <ShoppingCart className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span>PDV & Cupons</span>}
                  </div>
                </button>

                {/* Produtos & Estoque */}
                <button
                  onClick={() => handleSelectTab('products')}
                  className={`relative w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'products'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {activeTab === 'products' && (
                    <motion.div
                      layoutId="activeTabBadge"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <div className="flex items-center gap-3 z-10">
                    <Package className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span>Produtos & Estoque</span>}
                  </div>
                  {!isCollapsed && lowStockCount > 0 && (
                    <span className="z-10 text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {lowStockCount}
                    </span>
                  )}
                </button>
              </nav>
            </div>
          )}

          {/* Section: Financeiro */}
          {isAdmin && (
            <div>
              {!isCollapsed && (
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-2 mb-1.5">
                  Financeiro
                </div>
              )}
              <nav className="space-y-1">
                <button
                  onClick={() => handleSelectTab('closing')}
                  className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'closing'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {activeTab === 'closing' && (
                    <motion.div
                      layoutId="activeTabBadge"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <FileText className="w-4 h-4 shrink-0 z-10" />
                  {!isCollapsed && <span className="z-10">Faturas & Fechamento</span>}
                </button>

                <button
                  onClick={() => handleSelectTab('pix')}
                  className={`relative w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'pix'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {activeTab === 'pix' && (
                    <motion.div
                      layoutId="activeTabBadge"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <div className="flex items-center gap-3 z-10">
                    <QrCode className="w-4 h-4 shrink-0" />
                    {!isCollapsed && <span>Conferência Pix</span>}
                  </div>
                  {!isCollapsed && pendingPixCount > 0 && (
                    <span className="z-10 text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {pendingPixCount}
                    </span>
                  )}
                </button>
              </nav>
            </div>
          )}

          {/* Section: Pessoas & Portais */}
          <div>
            {!isCollapsed && (
              <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-2 mb-1.5">
                Pessoas & Portais
              </div>
            )}
            <nav className="space-y-1">
              {isAdmin && (
                <button
                  onClick={() => handleSelectTab('students')}
                  className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'students'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {activeTab === 'students' && (
                    <motion.div
                      layoutId="activeTabBadge"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Users className="w-4 h-4 shrink-0 z-10" />
                  {!isCollapsed && <span className="z-10">Alunos & Famílias</span>}
                </button>
              )}

              {(isAdmin || isStudent) && (
                <button
                  onClick={() => handleSelectTab('student_portal')}
                  className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'student_portal'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {activeTab === 'student_portal' && (
                    <motion.div
                      layoutId="activeTabBadge"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Receipt className="w-4 h-4 shrink-0 z-10" />
                  {!isCollapsed && <span className="z-10">Portal do Aluno</span>}
                </button>
              )}

              {(isAdmin || isGuardian) && (
                <button
                  onClick={() => handleSelectTab('guardian_portal')}
                  className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'guardian_portal'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {activeTab === 'guardian_portal' && (
                    <motion.div
                      layoutId="activeTabBadge"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <ShieldCheck className="w-4 h-4 shrink-0 z-10" />
                  {!isCollapsed && <span className="z-10">Portal do Responsável</span>}
                </button>
              )}
            </nav>
          </div>

          {/* Section: Sistema & Auditoria */}
          {isAdmin && (
            <div>
              {!isCollapsed && (
                <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-2 mb-1.5">
                  Administração
                </div>
              )}
              <nav className="space-y-1">
                <button
                  onClick={() => handleSelectTab('whatsapp')}
                  className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'whatsapp'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {activeTab === 'whatsapp' && (
                    <motion.div
                      layoutId="activeTabBadge"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <MessageSquare className="w-4 h-4 shrink-0 z-10" />
                  {!isCollapsed && <span className="z-10">WhatsApp & Avisos</span>}
                </button>

                <button
                  onClick={() => handleSelectTab('audit')}
                  className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'audit'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {activeTab === 'audit' && (
                    <motion.div
                      layoutId="activeTabBadge"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <ShieldAlert className="w-4 h-4 shrink-0 z-10" />
                  {!isCollapsed && <span className="z-10">Auditoria (LGPD)</span>}
                </button>

                <button
                  onClick={() => handleSelectTab('settings')}
                  className={`relative w-full flex items-center gap-3 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    activeTab === 'settings'
                      ? 'text-white'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                  }`}
                >
                  {activeTab === 'settings' && (
                    <motion.div
                      layoutId="activeTabBadge"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-600/10 border border-emerald-500/25 rounded-lg"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Settings className="w-4 h-4 shrink-0 z-10" />
                  {!isCollapsed && <span className="z-10">Configurações</span>}
                </button>
              </nav>
            </div>
          )}

          {/* Collapsible Authentication Navigation matching Reference */}
          <div>
            {!isCollapsed && (
              <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider px-2 mb-1.5">
                Segurança
              </div>
            )}
            <div className="space-y-1">
              <button
                onClick={() => setAuthExpanded(!authExpanded)}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span>Autenticação</span>}
                </div>
                {!isCollapsed && (
                  <motion.div animate={{ rotate: authExpanded ? 90 : 0 }}>
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  </motion.div>
                )}
              </button>

              <AnimatePresence>
                {authExpanded && !isCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="pl-9 space-y-1 overflow-hidden text-xs text-zinc-500"
                  >
                    <button
                      onClick={() => logout()}
                      className="block w-full text-left py-1.5 hover:text-zinc-300 cursor-pointer"
                    >
                      Tela de Login
                    </button>
                    <button
                      onClick={() => setShowUserMenu(true)}
                      className="block w-full text-left py-1.5 hover:text-zinc-300 cursor-pointer"
                    >
                      Trocar Perfil
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>

        {/* Footer Card & Profile (Reference Style) */}
        {!isCollapsed && (
          <div className="p-3 border-t border-white/[0.08] space-y-3 shrink-0 bg-[#111111]">
            <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-950/30 to-white/[0.02] border border-emerald-500/20 text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                <img
                  src="/assets/aistudio/image_e4461e45.png"
                  alt="ICEVES"
                  className="w-5 h-5 rounded-full object-cover bg-white ring-1 ring-emerald-500/40 shrink-0"
                />
                <div className="font-bold text-emerald-300 text-xs truncate">Escola de Cristo • ICEVES</div>
              </div>
              <div className="text-zinc-400 leading-relaxed text-[11px]">
                10ª Turma (Formatura: 27 a 30) • Gestão integrada e persistência ativa.
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 relative">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                  alt={user?.name || 'Usuário'}
                  className="w-8 h-8 rounded-full object-cover border border-white/20 shrink-0"
                />
                <div className="text-left min-w-0">
                  <div className="text-xs font-semibold text-zinc-200 truncate">
                    {user?.name || 'Carlos Silva'}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {user?.email || 'admin@campus.edu.br'}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
                title="Opções da Conta"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* User Account & Logout Popover */}
              <AnimatePresence>
                {showUserMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute bottom-full left-0 right-0 mb-2 p-3 bg-[#18181b] border border-white/[0.12] rounded-xl shadow-2xl z-50 text-xs space-y-2.5"
                  >
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Sessão Ativa
                      </div>
                      <div className="font-semibold text-white truncate text-xs">{user?.name}</div>
                      <div className="text-[11px] text-zinc-400 truncate">{user?.email}</div>
                      <div className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {user?.role === 'ADMIN' ? 'Administrador' :
                         user?.role === 'CASHIER' ? 'Operador de Caixa' :
                         user?.role === 'STUDENT' ? 'Aluno (10ª Turma)' : 'Responsável'}
                      </div>
                    </div>

                    <div className="border-t border-white/[0.08] pt-2">
                      <button
                        onClick={() => {
                          logout();
                          setShowUserMenu(false);
                        }}
                        className="w-full text-left px-2.5 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg flex items-center gap-2 cursor-pointer font-medium transition"
                      >
                        <LogOut className="w-4 h-4 shrink-0" />
                        <span>Encerrar Sessão (Sair)</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
