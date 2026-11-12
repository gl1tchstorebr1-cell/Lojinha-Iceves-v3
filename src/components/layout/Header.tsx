import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { 
  Building2, 
  UserCheck, 
  LogOut, 
  KeyRound, 
  ChevronDown, 
  Store, 
  Bell, 
  ShieldCheck, 
  RefreshCw 
} from 'lucide-react';
import { api } from '../../services/api';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onRefreshData?: () => void;
}

export function Header({ activeTab, setActiveTab, onRefreshData }: HeaderProps) {
  const { user, role, logout, login } = useAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const getRoleBadge = (r: string | null) => {
    switch (r) {
      case 'ADMIN':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Administrador</span>;
      case 'CASHIER':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 border border-teal-200">Operador do Caixa</span>;
      case 'STUDENT':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">Aluno</span>;
      case 'GUARDIAN':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">Responsável Financeiro</span>;
      default:
        return null;
    }
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      await login(loginEmail, loginPassword);
      setShowLoginModal(false);
      setLoginEmail('');
      setLoginPassword('');
    } catch (err: any) {
      setLoginError(err.message || 'Erro ao realizar login.');
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetStatus(null);
    try {
      const res = await api.resetPassword(resetEmail);
      setResetStatus(res.message);
    } catch (err: any) {
      setResetStatus(`Erro: ${err.message}`);
    }
  };

  return (
    <>
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white p-0.5 ring-2 ring-emerald-500/40 flex items-center justify-center shadow-md overflow-hidden shrink-0">
                <img
                  src="/assets/aistudio/image_e4461e45.png"
                  alt="Logo ICEVES"
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base sm:text-lg tracking-tight text-white">Lojinha Iceves</span>
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 font-medium px-2 py-0.5 rounded border border-emerald-500/30">
                    Escola de Cristo
                  </span>
                </div>
                <p className="text-xs text-slate-400 hidden sm:block">
                  10ª Turma (Formatura: 27 a 30) • Gestão Integrada de Caixa, Estoque e Pix
                </p>
              </div>
            </div>

            {/* User Info & Controls */}
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 text-xs sm:text-sm">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-white max-w-[140px] truncate">{user?.name}</span>
              </div>

              {/* Current Role badge */}
              <div className="hidden lg:flex items-center gap-2">
                {getRoleBadge(role)}
              </div>

              {/* Logout button */}
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-medium transition cursor-pointer"
                title="Sair do Sistema"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sair</span>
              </button>

              {/* Refresh data button */}
              {onRefreshData && (
                <button
                  onClick={onRefreshData}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  title="Atualizar dados do servidor"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}

            </div>
          </div>
        </div>
      </header>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-900">Acesso por Login e Senha</h3>
              </div>
              <button 
                onClick={() => setShowLoginModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Autenticação individual com segregação de perfis para Alunos, Responsáveis, Operadores de Caixa e Administradores.
            </p>

            {loginError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                {loginError}
              </div>
            )}

            <form onSubmit={handleCustomLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">E-mail Cadastrado</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="ex: admin@campus.edu ou resp.claudia@gmail.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Senha Segura</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowLoginModal(false);
                    setShowResetModal(true);
                  }}
                  className="text-xs text-emerald-600 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg text-xs font-medium hover:from-emerald-400 hover:to-teal-500"
                >
                  Entrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-900">Recuperação Segura de Senha</h3>
              </div>
              <button 
                onClick={() => {
                  setShowResetModal(false);
                  setResetStatus(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Conforme as diretrizes de segurança e LGPD, a recuperação emite um token individual de validação enviado exclusivamente para o canal cadastrado, sem revelar credenciais prévias.
            </p>

            {resetStatus && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-lg">
                {resetStatus}
              </div>
            )}

            <form onSubmit={handlePasswordReset} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Informe o seu E-mail Cadastrado</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="ex: aluno.lucas@campus.edu ou resp.claudia@gmail.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetModal(false);
                    setResetStatus(null);
                  }}
                  className="flex-1 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-50"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg text-xs font-medium hover:from-emerald-400 hover:to-teal-500"
                >
                  Enviar Instruções
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
