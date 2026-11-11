import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
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
  Download, 
  X,
  Bell,
  CheckCircle2,
  AlertTriangle,
  LogOut
} from 'lucide-react';
import { SystemSettings, Product, PixPayment } from '../../types';

interface TopBarProps {
  settings: SystemSettings | null;
  products: Product[];
  pixPayments: PixPayment[];
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  onOpenMobileMenu: () => void;
  onNavigate: (tab: string) => void;
}

export function TopBar({
  settings,
  products,
  pixPayments,
  isCollapsed,
  setIsCollapsed,
  onOpenMobileMenu,
  onNavigate
}: TopBarProps) {
  const { user, logout } = useAuth();
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);

  const pendingPix = pixPayments.filter(p => p.status === 'AGUARDANDO_CONFERENCIA');
  const lowStock = products.filter(p => p.currentStock <= p.minStock);
  const totalNotifications = pendingPix.length + lowStock.length;

  // Keyboard shortcut ⌘K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(prev => !prev);
      }
      if (e.key === 'Escape' && cmdOpen) {
        setCmdOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cmdOpen]);

  // Command palette navigation items
  const commandItems = [
    { name: 'Visão Geral (Dashboard)', icon: LayoutGrid, section: 'Navegação', tab: 'dashboard' },
    { name: 'Ponto de Venda & Cupons (PDV)', icon: ShoppingCart, section: 'Operações', tab: 'pdv' },
    { name: 'Produtos & Estoque', icon: Package, section: 'Operações', tab: 'products' },
    { name: 'Faturas & Fechamento Mensal', icon: FileText, section: 'Financeiro', tab: 'closing' },
    { name: 'Conferência Pix', icon: QrCode, section: 'Financeiro', tab: 'pix' },
    { name: 'Alunos & Responsáveis', icon: Users, section: 'Pessoas', tab: 'students' },
    { name: 'Portal do Aluno', icon: LayoutGrid, section: 'Portais', tab: 'student_portal' },
    { name: 'Portal do Responsável', icon: Users, section: 'Portais', tab: 'guardian_portal' },
    { name: 'WhatsApp & Comunicação', icon: MessageSquare, section: 'Administração', tab: 'whatsapp' },
    { name: 'Auditoria & Livro-Razão (LGPD)', icon: ShieldAlert, section: 'Administração', tab: 'audit' },
    { name: 'Configurações do Sistema', icon: Settings, section: 'Administração', tab: 'settings' },
  ].filter(i => i.name.toLowerCase().includes(cmdQuery.toLowerCase()));

  return (
    <>
      <header className="h-14 border-b border-white/[0.08] flex items-center justify-between px-4 shrink-0 bg-[#0a0a0a] sticky top-0 z-30">
        
        {/* Left: Collapse toggle and Command search bar */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (window.innerWidth < 1024) {
                onOpenMobileMenu();
              } else {
                setIsCollapsed(!isCollapsed);
              }
            }}
            className="p-1.5 rounded-lg border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Alternar Menu Lateral"
          >
            {isCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>

          {/* Search Trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-400 hover:border-white/[0.16] hover:text-zinc-200 transition-all w-48 sm:w-64 justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Buscar no sistema...</span>
            </div>
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[10px] text-zinc-400 font-mono shrink-0">⌘K</kbd>
          </button>
        </div>

        {/* Right: Institutional Badge, Notifications, Settings, Profile */}
        <div className="flex items-center gap-2 relative">
          {/* ICEVES Institutional Pill */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 mr-1">
            <img
              src="/assets/aistudio/image_e4461e45.png"
              alt="Logo ICEVES"
              className="w-5 h-5 rounded-full object-cover bg-white ring-1 ring-emerald-500/40 shrink-0"
            />
            <span className="text-[11px] font-semibold text-emerald-300 tracking-tight">
              ICEVES • 10ª Turma
            </span>
          </div>
          
          {/* Notifications Button */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-lg border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer relative"
              title="Notificações e Avisos"
            >
              <Bell className="w-4 h-4" />
              {totalNotifications > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>

            {/* Notifications Dropdown */}
            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-[#141414] border border-white/[0.12] shadow-2xl p-3 z-50 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
                    <span className="font-semibold text-white">Central de Avisos</span>
                    <span className="text-[10px] text-zinc-400 font-mono">{totalNotifications} pendente(s)</span>
                  </div>

                  {totalNotifications === 0 ? (
                    <div className="py-4 text-center text-zinc-500 text-xs">
                      Tudo em dia! Sem pendências.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {pendingPix.length > 0 && (
                        <button
                          onClick={() => {
                            onNavigate('pix');
                            setShowNotifications(false);
                          }}
                          className="w-full text-left p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition flex items-start gap-2 text-zinc-300"
                        >
                          <QrCode className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-medium text-white">{pendingPix.length} Pix para conferir</div>
                            <div className="text-[10px] text-zinc-400">Comprovantes aguardando baixa</div>
                          </div>
                        </button>
                      )}

                      {lowStock.length > 0 && (
                        <button
                          onClick={() => {
                            onNavigate('products');
                            setShowNotifications(false);
                          }}
                          className="w-full text-left p-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition flex items-start gap-2 text-zinc-300"
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-medium text-white">{lowStock.length} produtos em estoque baixo</div>
                            <div className="text-[10px] text-zinc-400">Abaixo do estoque mínimo</div>
                          </div>
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Settings */}
          <button
            onClick={() => onNavigate('settings')}
            className="p-2 rounded-lg border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Configurações Operacionais"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* User Profile & Logout */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-white/[0.08]">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-xs font-semibold text-zinc-200 max-w-[140px] truncate">
                {user?.name}
              </span>
              <span className="text-[10px] text-emerald-400 font-medium">
                {user?.registrationNumber || user?.role}
              </span>
            </div>
            <img
              src={user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
              alt={user?.name || 'Perfil'}
              className="w-7 h-7 rounded-full object-cover border border-white/20 shrink-0"
              title={`${user?.name} (${user?.role})`}
            />
            <button
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer text-xs font-medium"
              title="Encerrar sessão e voltar ao login"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Command Palette Modal (Matching Reference) */}
      <AnimatePresence>
        {cmdOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCmdOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-xl rounded-xl bg-[#141414] border border-white/[0.12] shadow-2xl overflow-hidden z-10"
            >
              <div className="flex items-center border-b border-white/[0.08] px-4 py-3">
                <Search className="w-4 h-4 text-zinc-400 mr-3 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  value={cmdQuery}
                  onChange={(e) => setCmdQuery(e.target.value)}
                  placeholder="Digite um comando, tela ou recurso..."
                  className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
                />
                <button
                  onClick={() => setCmdOpen(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="max-h-80 overflow-y-auto p-2">
                {commandItems.length === 0 ? (
                  <p className="p-4 text-xs text-zinc-500 text-center">Nenhum resultado encontrado.</p>
                ) : (
                  commandItems.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={index}
                        onClick={() => {
                          onNavigate(item.tab);
                          setCmdOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors text-left cursor-pointer"
                      >
                        <Icon className="w-4 h-4 text-zinc-400" />
                        <span className="flex-1">{item.name}</span>
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{item.section}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="border-t border-white/[0.08] px-4 py-2 flex items-center justify-between text-[11px] text-zinc-500 bg-[#111]">
                <span>Navegue com teclado ou clique</span>
                <span>ESC para fechar</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
