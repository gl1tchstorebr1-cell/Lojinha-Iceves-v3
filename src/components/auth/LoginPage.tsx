import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

export function LoginPage() {
  const { login, register, setupInitialAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'LOGIN' | 'REGISTER'>('LOGIN');

  // First-run admin setup state (ativo somente quando ADMIN_PASSWORD não está no servidor e nenhuma senha admin foi definida)
  const [checkingBootstrap, setCheckingBootstrap] = useState(true);
  const [adminSetupRequired, setAdminSetupRequired] = useState(false);
  const [showAdminSetupForm, setShowAdminSetupForm] = useState(false);
  const [setupEmail, setSetupEmail] = useState('admin.lojinha@gmail.com');
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [showSetupPassword, setShowSetupPassword] = useState(false);

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  useEffect(() => {
    let active = true;
    api
      .getAuthBootstrapStatus()
      .then((res) => {
        if (!active) return;
        setAdminSetupRequired(Boolean(res.adminSetupRequired));
        setShowAdminSetupForm(Boolean(res.adminSetupRequired));
        if (res.adminEmail) {
          setSetupEmail(res.adminEmail);
        }
      })
      .catch(() => {
        if (!active) return;
        setAdminSetupRequired(false);
        setShowAdminSetupForm(false);
      })
      .finally(() => {
        if (active) setCheckingBootstrap(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmitAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (setupPassword.trim().length < 8) {
      setError('A senha do administrador deve ter no mínimo 8 caracteres.');
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setError('As senhas digitadas não coincidem.');
      return;
    }

    setIsLoading(true);
    try {
      await setupInitialAdmin(setupPassword, setupConfirmPassword, setupEmail);
    } catch (err: any) {
      setError(err.message || 'Não foi possível concluir a configuração inicial do administrador.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      if (err?.adminSetupRequired) {
        setAdminSetupRequired(true);
        setShowAdminSetupForm(true);
      }
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
        phone: regPhone,
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
      setRecoveryError(err.message || 'Não foi possível processar a solicitação de recuperação.');
    }
  };

  return (
    <div className="min-h-screen bg-[#070709] text-[#f4f4f6] flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-emerald-500/30 selection:text-emerald-100 relative overflow-hidden">
      {/* Atmospheric Radial Spotlight Backdrop */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[480px]"
          style={{
            background:
              'radial-gradient(ellipse 60% 55% at 50% 10%, rgba(16, 185, 129, 0.14), rgba(20, 184, 166, 0.04) 45%, transparent 75%)',
          }}
        />
      </div>

      <div className="w-full max-w-[440px] relative z-10 space-y-6">
        {/* Brand Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
          className="text-center space-y-3"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white p-0.5 ring-2 ring-emerald-500/35 shadow-[0_12px_40px_-8px_rgba(16,185,129,0.4)] mb-1 overflow-hidden">
            <img
              src="/assets/aistudio/image_e4461e45.png"
              alt="Logo ICEVES"
              className="w-full h-full rounded-full object-cover"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Lojinha Iceves — Escola de Cristo
          </h1>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
            Acesso Restrito · Autenticação obrigatória para PDV, Estoque, Recibos & Financeiro
          </p>
        </motion.div>

        {/* Main Authentication Card */}
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="executive-surface rounded-2xl p-6 sm:p-7 shadow-[0_28px_80px_-20px_rgba(0,0,0,0.9)] relative overflow-hidden"
        >
          {checkingBootstrap ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-zinc-400 text-xs">
              <div className="w-5 h-5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <span>Verificando segurança da sessão...</span>
            </div>
          ) : adminSetupRequired && showAdminSetupForm ? (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h2 className="text-xs font-bold text-amber-200">
                    Primeiro Acesso — Definir Senha do Administrador
                  </h2>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    O acesso automático foi desativado. Crie agora uma senha forte para proteger a conta administrativa. Após configurada, esta tela é bloqueada permanentemente.
                  </p>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmitAdminSetup} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">E-mail do Administrador</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      value={setupEmail}
                      onChange={(e) => setSetupEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">Nova Senha Administrativa</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type={showSetupPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full pl-9 pr-9 py-2.5 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSetupPassword(!showSetupPassword)}
                      className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    >
                      {showSetupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">Confirmar Senha</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                    <input
                      type={showSetupPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={setupConfirmPassword}
                      onChange={(e) => setSetupConfirmPassword(e.target.value)}
                      placeholder="Repita a senha administrativa"
                      className="w-full pl-9 pr-3 py-2.5 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-xs py-2.5 px-4 rounded-lg transition-all shadow-md shadow-emerald-950/60 cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Salvar Senha e Entrar como Admin</span>
                    </>
                  )}
                </button>

                <div className="pt-2 border-t border-white/[0.06] text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminSetupForm(false);
                      setError(null);
                    }}
                    className="text-xs text-zinc-400 hover:text-emerald-300 cursor-pointer"
                  >
                    Sou aluno ou responsável — ir para Login / Criar Conta
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              {/* Sliding Spring Segmented Control between Login & Register */}
              <div className="grid grid-cols-2 gap-1 bg-black/40 p-1 rounded-xl mb-6 border border-white/[0.06] relative">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('LOGIN');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`relative flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'LOGIN' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {activeTab === 'LOGIN' && (
                    <motion.span
                      layoutId="loginAuthTabIndicator"
                      transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                      className="absolute inset-0 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 shadow-md shadow-emerald-950/50"
                    />
                  )}
                  <LogIn className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">Entrar com Senha</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('REGISTER');
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className={`relative flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === 'REGISTER' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {activeTab === 'REGISTER' && (
                    <motion.span
                      layoutId="loginAuthTabIndicator"
                      transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                      className="absolute inset-0 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 shadow-md shadow-emerald-950/50"
                    />
                  )}
                  <UserPlus className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">Criar Conta</span>
                </button>
              </div>

              {adminSetupRequired && (
                <div className="mb-4 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2 text-[11px] text-amber-200">
                  <span>Senha do administrador ainda não definida.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminSetupForm(true);
                      setError(null);
                    }}
                    className="font-semibold text-amber-300 underline cursor-pointer shrink-0"
                  >
                    Configurar agora
                  </button>
                </div>
              )}

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

              <AnimatePresence mode="wait" initial={false}>
                {activeTab === 'LOGIN' ? (
                  <motion.form
                    key="login-form"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    onSubmit={handleSubmitLogin}
                    className="space-y-4"
                  >
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
                          autoComplete="username"
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
                          autoComplete="current-password"
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

                    {/* Security indicator */}
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                      <span className="inline-flex items-center gap-1.5 text-emerald-400/90">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Sessão verificada no servidor
                      </span>
                      <span className="text-zinc-500">Bloqueio automático ativo</span>
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

                    <div className="pt-3 border-t border-white/[0.06] text-center">
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
                  </motion.form>
                ) : (
                  /* Register / Create Account Form */
                  <motion.form
                    key="register-form"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    onSubmit={handleSubmitRegister}
                    className="space-y-3.5"
                  >
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
                  </motion.form>
                )}
              </AnimatePresence>
            </>
          )}
        </motion.div>

        {/* Footer info & Optional PWA Install */}
        <div className="flex flex-col items-center justify-center gap-2.5 text-center text-[11px] text-zinc-500">
          <PWAInstallButton variant="topbar" />
          <div className="flex items-center justify-center gap-2">
            <img
              src="/assets/aistudio/image_e4461e45.png"
              alt="ICEVES"
              className="w-4 h-4 rounded-full object-cover bg-white ring-1 ring-emerald-500/30"
            />
            <span>Escola de Cristo — ICEVES · Lojinha 10ª Turma</span>
          </div>
        </div>
      </div>

      {/* Recover Password Modal */}
      <AnimatePresence>
        {showForgotModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md rounded-2xl bg-[#111116] border border-white/[0.12] p-5 shadow-2xl space-y-4"
            >
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
                Informe seu e-mail cadastrado para registrar a solicitação de redefinição junto à coordenação.
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
                    <span>Solicitação Registrada</span>
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
                    Enviar Solicitação
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
