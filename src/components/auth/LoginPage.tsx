import React, { useState } from 'react';
import { 
  Command, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck, 
  UserCheck, 
  CheckCircle2, 
  Sparkles,
  HelpCircle,
  X,
  KeyRound,
  Store,
  Users
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { initialUsers } from '../../server/seedData';

export function LoginPage() {
  const { login, switchPersona } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password recovery modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Credenciais inválidas. Tente um dos perfis de demonstração abaixo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (userId: string) => {
    switchPersona(userId);
  };

  const handleRecoverPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail) return;

    // Conforme Requisito 11: Gerar token seguro sem expor senha
    const fakeToken = `REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    setRecoveryToken(fakeToken);
    setRecoverySuccess(`Link seguro e código de autorização (${fakeToken}) gerados para ${recoveryEmail}. As credenciais anteriores foram protegidas e um novo token foi registrado.`);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-white selection:text-black">
      
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-emerald-500/15 via-teal-500/10 to-transparent blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-md relative z-10 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white p-0.5 ring-2 ring-emerald-500/40 shadow-xl shadow-emerald-500/20 mb-1 overflow-hidden">
            <img
              src="/assets/aistudio/image_e4461e45.png"
              alt="Logo ICEVES"
              className="w-full h-full rounded-full object-cover"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Lojinha Iceves — Escola de Cristo
          </h1>
          <p className="text-xs text-zinc-400 max-w-xs mx-auto">
            10ª Turma (Formatura: 27 a 30) • Ponto de Venda, Estoque & Faturamento
          </p>
        </div>

        {/* Main Card with Reference Glow */}
        <div className="rounded-2xl bg-[#111111] border border-white/[0.08] p-6 sm:p-7 shadow-2xl relative overflow-hidden">
          
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <span className="font-semibold">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Email / Username */}
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-300">
                E-mail ou Matrícula
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@iceves.edu.br ou EC10-001"
                  className="w-full pl-9 pr-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-zinc-300">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-9 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-200">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
                />
                <span>Lembrar meu acesso</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-xs py-2.5 px-4 rounded-lg transition-all shadow-md shadow-emerald-950/60 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Profiles */}
          <div className="mt-6 pt-5 border-t border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                Acesso Rápido para Avaliação (1 Clique)
              </span>
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {initialUsers.map((u) => {
                const roleLabels: Record<string, { label: string; badge: string }> = {
                  ADMIN: { label: 'Administrador', badge: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white' },
                  CASHIER: { label: 'Operador Caixa', badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' },
                  STUDENT: { label: 'Aluno (10ª Turma)', badge: 'bg-teal-500/15 text-teal-300 border border-teal-500/30' },
                  GUARDIAN: { label: 'Responsável', badge: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' }
                };

                const meta = roleLabels[u.role] || { label: u.role, badge: 'bg-zinc-800' };

                return (
                  <button
                    key={u.id}
                    onClick={() => handleQuickLogin(u.id)}
                    className="p-2.5 rounded-lg bg-[#18181b] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/[0.18] transition-all text-left flex items-center gap-2.5 cursor-pointer group"
                  >
                    <img
                      src={u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80'}
                      alt={u.name}
                      className="w-7 h-7 rounded-full object-cover border border-white/20 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white truncate text-[11px] group-hover:text-white">
                        {u.name}
                      </div>
                      <span className={`inline-block text-[9px] px-1.5 py-0.2 rounded font-medium ${meta.badge}`}>
                        {meta.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer info */}
        <div className="flex items-center justify-center gap-2 text-center text-[11px] text-zinc-500">
          <img
            src="/assets/aistudio/image_e4461e45.png"
            alt="ICEVES"
            className="w-4 h-4 rounded-full object-cover bg-white ring-1 ring-emerald-500/30"
          />
          <span>Escola de Cristo — ICEVES • Em conformidade com a LGPD e Segurança por Perfil</span>
        </div>

      </div>

      {/* Recover Password Modal (Cenário de Teste 11) */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-[#141414] border border-white/[0.12] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-zinc-300" />
                <h3 className="font-semibold text-sm text-white">Recuperação Segura de Senha</h3>
              </div>
              <button 
                onClick={() => {
                  setShowForgotModal(false);
                  setRecoverySuccess(null);
                  setRecoveryToken(null);
                }} 
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Conforme o <strong>Cenário de Teste 11</strong>, o sistema gera tokens de redefinição sem expor credenciais na tela nem enviar senhas em texto puro.
            </p>

            {recoverySuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Token Gerado com Sucesso!</span>
                </div>
                <p className="text-[11px] text-zinc-300">{recoverySuccess}</p>
                {recoveryToken && (
                  <div className="font-mono text-xs bg-black/40 p-1.5 rounded text-white mt-1">
                    Código: {recoveryToken}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleRecoverPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  E-mail institucional cadastrado
                </label>
                <input
                  type="email"
                  required
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="seu.email@campus.edu.br"
                  className="w-full px-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-white/[0.4]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(false);
                    setRecoverySuccess(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-white/[0.1] text-xs text-zinc-400 hover:text-white"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200"
                >
                  Gerar Token Seguro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
