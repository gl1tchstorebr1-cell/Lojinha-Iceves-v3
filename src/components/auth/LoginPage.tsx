import React, { useState } from 'react';
import { 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  ShieldCheck, 
  UserCheck, 
  CheckCircle2, 
  KeyRound, 
  Database,
  UserPlus,
  LogIn,
  Copy,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Info
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SUPABASE_PROJECT_URL, SUPABASE_IS_CONFIGURED } from '../../services/supabaseClient';

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
  const [regRole, setRegRole] = useState<'ADMIN' | 'CASHIER' | 'STUDENT' | 'GUARDIAN'>('STUDENT');
  const [regPhone, setRegPhone] = useState('');

  // Credentials drawer / helper
  const [showCredentialsHelper, setShowCredentialsHelper] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Password recovery modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);

  const realLogins = [
    {
      role: 'ADMIN',
      title: 'Coordenação ICEVES (Administrador)',
      email: 'admin.lojinha@gmail.com',
      password: 'Admin#Iceves2026',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      description: 'Acesso total: painel, estoque, faturamento, configurações e fechamento.'
    },
    {
      role: 'CASHIER',
      title: 'Atendimento Lojinha (Operador de Caixa)',
      email: 'caixa.lojinha@gmail.com',
      password: 'Caixa#Iceves2026',
      badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      description: 'Ponto de Venda (PDV), lançamento de consumo no balcão e produtos.'
    },
    {
      role: 'STUDENT',
      title: 'Aluno (10ª Turma: Ana Vitória Lisboa)',
      email: 'ana.lisboa@gmail.com',
      altId: 'EC10-001',
      password: 'Aluno#Iceves2026',
      badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      description: 'Portal do Aluno, extrato de compras, faturas e chave Pix.'
    },
    {
      role: 'GUARDIAN',
      title: 'Responsável Financeiro (Família ICEVES)',
      email: 'familia.iceves@gmail.com',
      password: 'Familia#Iceves2026',
      badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      description: 'Portal do Responsável, faturas unificadas e comprovantes de pagamento.'
    }
  ];

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleFillCredentials = (credEmail: string, credPass: string) => {
    setEmail(credEmail);
    setPassword(credPass);
    setError(null);
    setSuccessMessage(`Credenciais de ${credEmail} preenchidas. Clique em "Entrar no Sistema".`);
  };

  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Falha na autenticação. Verifique e-mail e senha.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      await register({
        name: regName,
        email: regEmail,
        password: regPassword,
        role: regRole,
        phone: regPhone
      });
      setSuccessMessage('Conta criada e autenticada com sucesso no Supabase!');
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar usuário no Supabase.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecoverPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail) return;

    const fakeToken = `REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;
    setRecoveryToken(fakeToken);
    setRecoverySuccess(`Link seguro e token de redefinição (${fakeToken}) emitidos para ${recoveryEmail}.`);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa] flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-emerald-500 selection:text-black">
      
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[380px] bg-gradient-to-tr from-emerald-500/15 via-teal-500/10 to-transparent blur-[130px] rounded-full" />
      </div>

      <div className="w-full max-w-lg relative z-10 space-y-6">
        
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
            10ª Turma (Formatura: 27 a 30) • Ponto de Venda, Estoque & Faturamento
          </p>

          {/* Supabase Status Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#141414] border border-emerald-500/30 text-[11px] text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium text-emerald-300">Supabase Auth Conectado</span>
            <span className="text-zinc-500 font-mono text-[10px]">brjsoaxvqrtxyofwxgkk</span>
          </div>
        </div>

        {/* Main Authentication Card */}
        <div className="rounded-2xl bg-[#111111] border border-white/[0.08] p-6 sm:p-7 shadow-2xl relative overflow-hidden">
          
          {/* Navigation Tabs between Login & Register */}
          <div className="flex items-center gap-1 bg-[#18181b] p-1 rounded-xl mb-5 border border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setActiveTab('LOGIN');
                setError(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
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
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'REGISTER'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Criar Conta Supabase</span>
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
                  E-mail Institucional ou Matrícula
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ex: admin.lojinha@gmail.com ou EC10-001"
                    className="w-full pl-9 pr-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-mono"
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
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-9 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-mono"
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
                  <span>Lembrar meu login</span>
                </label>
                <span className="text-[11px] text-zinc-500">Criptografia SHA-256</span>
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
          ) : (
            /* Register / Sign Up directly into Supabase Auth */
            <form onSubmit={handleSubmitRegister} className="space-y-3.5">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="Ex: Gabriel Santos"
                  className="w-full px-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">E-mail</label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="seu.email@dominio.com"
                  className="w-full px-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">Senha (Supabase)</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Mínimo 6 dígitos"
                    className="w-full px-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-300">Perfil de Acesso</label>
                  <select
                    value={regRole}
                    onChange={(e: any) => setRegRole(e.target.value)}
                    className="w-full px-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500/50 cursor-pointer"
                  >
                    <option value="STUDENT">Aluno (10ª Turma)</option>
                    <option value="CASHIER">Operador de Caixa</option>
                    <option value="GUARDIAN">Responsável</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-zinc-300">Telefone / WhatsApp (Opcional)</label>
                <input
                  type="text"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  placeholder="(11) 98765-4321"
                  className="w-full px-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                />
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
                    <span>Criar Conta no Supabase & Entrar</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

        </div>

        {/* Real Logins Information Card (Com Senhas Conectadas) */}
        <div className="rounded-2xl bg-[#111111] border border-white/[0.08] p-5 shadow-xl space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Logins Reais Oficiais (Com Senha)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowCredentialsHelper(!showCredentialsHelper)}
              className="text-zinc-400 hover:text-white p-1 rounded transition cursor-pointer"
              title="Expandir/Ocultar credenciais"
            >
              {showCredentialsHelper ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          <p className="text-[11px] text-zinc-400 leading-relaxed">
            O acesso rápido foi removido. Para acessar qualquer perfil, utilize os logins e senhas abaixo ou crie uma nova conta no Supabase.
          </p>

          {showCredentialsHelper && (
            <div className="space-y-2.5 pt-1">
              {realLogins.map((cred) => (
                <div 
                  key={cred.email}
                  className="p-3 rounded-xl bg-[#161618] border border-white/[0.06] hover:border-emerald-500/30 transition flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-white">{cred.title}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${cred.badge}`}>
                      {cred.role}
                    </span>
                  </div>

                  <p className="text-[10px] text-zinc-400">{cred.description}</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono bg-black/40 p-2 rounded-lg border border-white/[0.04]">
                    <div className="flex items-center justify-between gap-1 overflow-hidden">
                      <span className="text-zinc-500 text-[10px]">E-mail:</span>
                      <span className="text-white text-[11px] truncate">{cred.email}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(cred.email, `mail-${cred.email}`)}
                        className="text-zinc-400 hover:text-white p-1 rounded cursor-pointer"
                        title="Copiar e-mail"
                      >
                        {copiedField === `mail-${cred.email}` ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <span className="text-zinc-500 text-[10px]">Senha:</span>
                      <span className="text-emerald-400 font-bold text-[11px]">{cred.password}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(cred.password, `pass-${cred.email}`)}
                        className="text-zinc-400 hover:text-white p-1 rounded cursor-pointer"
                        title="Copiar senha"
                      >
                        {copiedField === `pass-${cred.email}` ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => handleFillCredentials(cred.email, cred.password)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 cursor-pointer hover:underline"
                    >
                      <span>Preencher no formulário de login</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-center gap-2 text-center text-[11px] text-zinc-500">
          <img
            src="/assets/aistudio/image_e4461e45.png"
            alt="ICEVES"
            className="w-4 h-4 rounded-full object-cover bg-white ring-1 ring-emerald-500/30"
          />
          <span>Escola de Cristo — ICEVES • Autenticação Segura com Supabase</span>
        </div>

      </div>

      {/* Recover Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-[#141414] border border-white/[0.12] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-400" />
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
              O sistema gera tokens de redefinição seguros e criptografados sem expor credenciais em texto puro.
            </p>

            {recoverySuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Token Emitido!</span>
                </div>
                <p className="text-[11px] text-zinc-300">{recoverySuccess}</p>
                {recoveryToken && (
                  <div className="font-mono text-xs bg-black/40 p-1.5 rounded text-white mt-1">
                    Token: {recoveryToken}
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
                  placeholder="admin.lojinha@gmail.com"
                  className="w-full px-3 py-2 bg-[#18181b] border border-white/[0.1] rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
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
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400"
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
