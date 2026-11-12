import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  CheckCircle2, 
  KeyRound, 
  UserPlus,
  LogIn,
  X,
  User,
  Phone,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

export function LoginPage() {
  const { login, register } = useAuth();

  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regRole, setRegRole] = useState<'STUDENT' | 'GUARDIAN'>('STUDENT');
  const [regPhone, setRegPhone] = useState('');

  // Password recovery modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Falha na autenticação. Verifique seu e-mail/matrícula e senha.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (regPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setError('As senhas digitadas não coincidem.');
      return;
    }

    setIsLoading(true);

    try {
      await register({
        name: regName,
        email: regEmail,
        password: regPassword,
        role: regRole,
        phone: regPhone
      });
      setSuccessMessage('Conta criada e autenticada com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta. Verifique os dados informados.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecoverPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail) return;
    setRecoverySuccess(null);
    setRecoveryError(null);

    try {
      const res = await api.resetPassword(recoveryEmail);
      setRecoverySuccess(res.message);
    } catch (err: any) {
      setRecoveryError(err.message || 'Não foi possível localizar uma conta com este e-mail.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-emerald-500 selection:text-black">
      
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[380px] bg-gradient-to-tr from-emerald-500/15 via-teal-500/10 to-transparent blur-[130px] rounded-full" />
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
          <p className="text-xs text-zinc-400 max-w-sm mx-auto">
            10ª Turma (Formatura: 27 a 30) • Ponto de Venda, Estoque, Passeios & Faturamento
          </p>
        </div>

        {/* Main Authentication Card */}
        <div className="rounded-2xl bg-[#111111] border border-white/[0.08] p-6 sm:p-7 shadow-2xl relative overflow-hidden">
          
          {/* Navigation Tabs between Login & Register */}
          <div className="flex items-center gap-1 bg-[#18181b] p-1 rounded-xl mb-6 border border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setActiveTab('LOGIN');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'LOGIN'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Entrar com Senha</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('REGISTER');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'REGISTER'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Criar Conta</span>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {activeTab === 'LOGIN' ? (
            <form onSubmit={handleSubmitLogin} className="space-y-4">
              
              {/* Email / Matrícula */}
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
                    placeholder="seu.email@gmail.com ou EC10-001"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-zinc-300">
                    Senha de Acesso
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
                    placeholder="Digite sua senha"
                    className="w-full pl-9 pr-9 py-2.5 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
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
                  <span>Manter conectado</span>
                </label>
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/90">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Acesso Seguro
                </span>
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

              <div className="pt-4 border-t border-white/[0.06] text-center">
                <p className="text-xs text-zinc-400">
                  Ainda não possui uma conta?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('REGISTER');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer hover:underline"
                  >
                    Criar conta agora
                  </button>
                </p>
              </div>
            </form>
          ) : (
            /* Register / Create Account Form */
            <form onSubmit={handleSubmitRegister} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">Nome Completo</label>
                <div className="relative">
                  <User className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Digite seu nome completo"
                    className="w-full pl-9 pr-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">E-mail</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="seu.email@gmail.com"
                    className="w-full pl-9 pr-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">Perfil de Acesso</label>
                  <select
                    value={regRole}
                    onChange={(e) => setRegRole(e.target.value as 'STUDENT' | 'GUARDIAN')}
                    className="w-full px-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer"
                  >
                    <option value="STUDENT">Aluno (10ª Turma)</option>
                    <option value="GUARDIAN">Responsável Financeiro</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">Telefone / WhatsApp</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="(11) 98765-4321"
                      className="w-full pl-8 pr-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">Criar Senha</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-8 pr-8 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    >
                      {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">Confirmar Senha</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      placeholder="Repita a senha"
                      className="w-full pl-8 pr-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-xs py-2.5 px-4 rounded-lg transition-all shadow-md shadow-emerald-950/60 cursor-pointer disabled:opacity-50 mt-3"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Criar Conta e Acessar</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-3 border-t border-white/[0.06] text-center">
                <p className="text-xs text-zinc-400">
                  Já possui uma conta cadastrada?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('LOGIN');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer hover:underline"
                  >
                    Entrar com senha
                  </button>
                </p>
              </div>
            </form>
          )}

        </div>

        {/* Footer info */}
        <div className="flex items-center justify-center gap-2 text-center text-[11px] text-zinc-500">
          <img
            src="/assets/aistudio/image_e4461e45.png"
            alt="ICEVES"
            className="w-4 h-4 rounded-full object-cover bg-white ring-1 ring-emerald-500/30"
          />
          <span>Escola de Cristo — ICEVES • Lojinha 10ª Turma</span>
        </div>

      </div>

      {/* Recover Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-[#141414] border border-white/[0.12] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-sm text-white">Recuperação de Senha</h3>
              </div>
              <button 
                onClick={() => {
                  setShowForgotModal(false);
                  setRecoverySuccess(null);
                  setRecoveryError(null);
                }} 
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Informe seu e-mail cadastrado para receber as instruções de redefinição de senha.
            </p>

            {recoveryError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg">
                {recoveryError}
              </div>
            )}

            {recoverySuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Solicitação Enviada!</span>
                </div>
                <p className="text-[11px] text-zinc-300">{recoverySuccess}</p>
              </div>
            )}

            <form onSubmit={handleRecoverPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  E-mail cadastrado
                </label>
                <input
                  type="email"
                  required
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="seu.email@gmail.com"
                  className="w-full px-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotModal(false);
                    setRecoverySuccess(null);
                    setRecoveryError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-white/[0.1] text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 cursor-pointer"
                >
                  Enviar Instruções
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
