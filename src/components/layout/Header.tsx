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
  const { user, role, switchPersona, allDemoUsers, logout, login } = useAuth();
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
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
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">Administrador</span>;
      case 'CASHIER':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Operador do Caixa</span>;
      case 'STUDENT':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">Aluno</span>;
      case 'GUARDIAN':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">Responsável Financeiro</span>;
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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-md font-bold text-white text-lg tracking-wider">
                B44
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base sm:text-lg tracking-tight text-white">Lojinha do Campus</span>
                  <span className="text-xs bg-indigo-500/20 text-indigo-300 font-medium px-2 py-0.5 rounded border border-indigo-500/30">
                    SaaS Lojinha
                  </span>
                </div>
                <p className="text-xs text-slate-400 hidden sm:block">
                  Gestão Integrada de Caixa, Estoque, Mensalidades e Pix
                </p>
              </div>
            </div>

            {/* Persona Switcher & Controls */}
            <div className="flex items-center gap-2 sm:gap-4">
              
              {/* Persona Switcher for Instant Testing */}
              <div className="relative">
                <button
                  onClick={() => setShowPersonaMenu(!showPersonaMenu)}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700/80 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 text-xs sm:text-sm font-medium transition cursor-pointer"
                  title="Trocar perfil de acesso (Simulação de Perfis / Personas)"
                >
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span className="hidden md:inline font-medium">Trocar Perfil:</span>
                  <span className="font-semibold text-white max-w-[130px] truncate">{user?.name}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {showPersonaMenu && (
                  <div className="absolute right-0 mt-2 w-72 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Simulador de Perfis (RBAC)</p>
                      <p className="text-xs text-slate-600 mt-0.5">Selecione para testar o sistema com cada nível de permissão:</p>
                    </div>

                    <div className="max-h-72 overflow-y-auto py-1">
                      {allDemoUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => {
                            switchPersona(u.id);
                            setShowPersonaMenu(false);
                            if (onRefreshData) onRefreshData();
                          }}
                          className={`w-full text-left px-4 py-2.5 hover:bg-indigo-50 flex items-center gap-3 transition ${
                            user?.id === u.id ? 'bg-indigo-50/80 font-medium' : ''
                          }`}
                        >
                          <img 
                            src={u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} 
                            alt={u.name} 
                            className="w-8 h-8 rounded-full object-cover border border-slate-200"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-900 truncate">{u.name}</span>
                              {user?.id === u.id && (
                                <span className="text-[10px] text-indigo-600 font-bold bg-indigo-100 px-1.5 py-0.5 rounded">Ativo</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {getRoleBadge(u.role)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="border-t border-slate-100 pt-2 px-3 flex gap-2">
                      <button
                        onClick={() => {
                          setShowPersonaMenu(false);
                          setShowLoginModal(true);
                        }}
                        className="flex-1 text-center py-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded"
                      >
                        Entrar com senha
                      </button>
                      <button
                        onClick={() => {
                          setShowPersonaMenu(false);
                          setShowResetModal(true);
                        }}
                        className="flex-1 text-center py-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 hover:bg-slate-50 rounded"
                      >
                        Esqueci a senha
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Current Role badge */}
              <div className="hidden lg:flex items-center gap-2">
                {getRoleBadge(role)}
              </div>

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
                <KeyRound className="w-5 h-5 text-indigo-600" />
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowLoginModal(false);
                    setShowResetModal(true);
                  }}
                  className="text-xs text-indigo-600 hover:underline"
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
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"
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
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
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
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"
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
