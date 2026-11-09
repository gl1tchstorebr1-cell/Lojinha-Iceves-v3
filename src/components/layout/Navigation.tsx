import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Users, 
  FileText, 
  QrCode, 
  MessageSquare, 
  ShieldAlert, 
  Settings,
  Receipt,
  UserCheck
} from 'lucide-react';

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingPixCount?: number;
  lowStockCount?: number;
}

export function Navigation({ activeTab, setActiveTab, pendingPixCount = 0, lowStockCount = 0 }: NavigationProps) {
  const { role, isStudent, isGuardian, isCashier, isAdmin } = useAuth();

  let navItems: { id: string; label: string; icon: any; badge?: number; badgeColor?: string }[] = [];

  if (isAdmin) {
    navItems = [
      { id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard },
      { id: 'pdv', label: 'Caixa Rápido (PDV)', icon: ShoppingCart },
      { 
        id: 'products', 
        label: 'Produtos & Estoque', 
        icon: Package, 
        badge: lowStockCount > 0 ? lowStockCount : undefined,
        badgeColor: 'bg-amber-500'
      },
      { id: 'students', label: 'Alunos & Responsáveis', icon: Users },
      { id: 'closing', label: 'Faturas & Fechamento', icon: FileText },
      { 
        id: 'pix', 
        label: 'Conferência Pix', 
        icon: QrCode, 
        badge: pendingPixCount > 0 ? pendingPixCount : undefined,
        badgeColor: 'bg-indigo-600'
      },
      { id: 'whatsapp', label: 'Automação WhatsApp', icon: MessageSquare },
      { id: 'audit', label: 'Auditoria & Livro Razão', icon: ShieldAlert },
      { id: 'settings', label: 'Configurações', icon: Settings },
    ];
  } else if (role === 'CASHIER') {
    navItems = [
      { id: 'pdv', label: 'Caixa Rápido (PDV)', icon: ShoppingCart },
      { 
        id: 'products', 
        label: 'Consulta de Produtos', 
        icon: Package,
        badge: lowStockCount > 0 ? lowStockCount : undefined,
        badgeColor: 'bg-amber-500'
      },
      { id: 'sales_history', label: 'Histórico & Comprovantes', icon: Receipt },
    ];
  } else if (isStudent) {
    navItems = [
      { id: 'student_portal', label: 'Meu Consumo & Extrato', icon: Receipt },
      { id: 'student_invoices', label: 'Minhas Faturas & Pix', icon: QrCode },
    ];
  } else if (isGuardian) {
    navItems = [
      { id: 'guardian_portal', label: 'Faturas & Dependentes Autorizados', icon: UserCheck },
    ];
  }

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-16 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span className={`text-[10px] font-bold text-white px-1.5 py-0.2 rounded-full ${item.badgeColor || 'bg-rose-500'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
