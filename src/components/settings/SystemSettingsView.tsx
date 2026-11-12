import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Save, 
  RotateCcw, 
  Check, 
  AlertTriangle, 
  AlertCircle,
  Calendar, 
  Store,
  Database,
  Copy,
  CheckCircle2,
  RefreshCw,
  FileCode,
  Eye,
  EyeOff,
  Activity,
  Terminal,
  Trash2,
  UploadCloud,
  DownloadCloud,
  Server,
  Camera,
  Users,
  Search,
  Link2
} from 'lucide-react';
import { SystemSettings, Student } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getInitialsAvatar, compressImageFileToDataUrl } from '../../utils/avatar';

interface SystemSettingsViewProps {
  settings: SystemSettings | null;
  students?: Student[];
  onStudentUpdated?: (student: Student) => void;
  onSettingsSaved: (settings: SystemSettings) => void;
  onResetData: () => void;
}

export function SystemSettingsView({ 
  settings, 
  students = [],
  onStudentUpdated,
  onSettingsSaved, 
  onResetData 
}: SystemSettingsViewProps) {
  const { isAdmin } = useAuth();

  const [formData, setFormData] = useState<Partial<SystemSettings>>({
    institutionName: settings?.institutionName || 'Escola de Cristo - ICEVES',
    storeName: settings?.storeName || 'Lojinha Iceves',
    cnpj: settings?.cnpj || '18.423.891/0001-44',
    closingDay: settings?.closingDay || 'LAST_DAY',
    closingHour: settings?.closingHour || '23:59',
    dueDayOffset: settings?.dueDayOffset || 10,
    allowDirectCashPayment: settings?.allowDirectCashPayment ?? false,
    stockControlActive: settings?.stockControlActive ?? true,
    blockSaleWithoutStock: settings?.blockSaleWithoutStock ?? true,
    whatsappAutoEnabled: settings?.whatsappAutoEnabled ?? true,
    mercadoPagoActive: settings?.mercadoPagoActive ?? true,
    mercadoPagoMode: settings?.mercadoPagoMode || 'PRODUCAO',
    mercadoPagoAccessToken: (settings as any)?.mercadoPagoAccessToken || '',
    mercadoPagoPublicKey: (settings as any)?.mercadoPagoPublicKey || '',
    mercadoPagoWebhookSecret: (settings as any)?.mercadoPagoWebhookSecret || '',
    supabaseActive: settings?.supabaseActive ?? true,
    supabaseUrl: (settings as any)?.supabaseUrl || '',
    supabaseAnonKey: (settings as any)?.supabaseAnonKey || '',
    supabaseServiceRoleKey: (settings as any)?.supabaseServiceRoleKey || '',
    tuitionBillingActive: settings?.tuitionBillingActive ?? false,
    defaultTuitionAmount: settings?.defaultTuitionAmount ?? 0,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showSbKey, setShowSbKey] = useState(false);

  // Supabase Sync state
  const [isSyncingPush, setIsSyncingPush] = useState(false);
  const [isSyncingPull, setIsSyncingPull] = useState(false);
  const [pushSyncResult, setPushSyncResult] = useState<{
    success: boolean;
    timestamp: string;
    tables: Record<string, { count: number; status: 'OK' | 'ERROR'; error?: string }>;
    totalRecordsSynced: number;
    message: string;
  } | null>(null);
  const [pullSyncResult, setPullSyncResult] = useState<{
    success: boolean;
    totalPulled: number;
    tables: Record<string, number>;
    message: string;
  } | null>(null);

  const [mpStatus, setMpStatus] = useState<{
    configured: boolean;
    isProduction: boolean;
    publicKeyAvailable: boolean;
    webhookUrl: string;
    maskedToken?: string;
    hasTokenInDb?: boolean;
    hasTokenInEnv?: boolean;
  } | null>(null);

  const [supabaseStatus, setSupabaseStatus] = useState<{
    configured: boolean;
    urlProvided: boolean;
    keyProvided: boolean;
    maskedUrl?: string;
    connected?: boolean;
    error?: string;
    tablesFound?: string[];
    recordsCount?: Record<string, number>;
  } | null>(null);

  // MP Testing & Logs
  const [isTestingMp, setIsTestingMp] = useState(false);
  const [mpTestResult, setMpTestResult] = useState<{
    success: boolean;
    user?: any;
    error?: string;
    status?: number;
    details?: any;
  } | null>(null);

  const [mpLogs, setMpLogs] = useState<Array<{
    id: string;
    timestamp: string;
    method: string;
    endpoint: string;
    requestPayload?: any;
    status: number;
    responseBody?: any;
    error?: string;
    success: boolean;
  }>>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const [isTestingSupabase, setIsTestingSupabase] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Student Profile Photo Manager state
  const [photoSearch, setPhotoSearch] = useState('');
  const [uploadingStudentId, setUploadingStudentId] = useState<string | null>(null);
  const [savedStudentId, setSavedStudentId] = useState<string | null>(null);
  const [editingUrlStudentId, setEditingUrlStudentId] = useState<string | null>(null);
  const [customPhotoUrl, setCustomPhotoUrl] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);

  const filteredPhotoStudents = students.filter(st => {
    const q = photoSearch.trim().toLowerCase();
    if (!q) return true;
    return st.name.toLowerCase().includes(q) || st.registrationNumber.toLowerCase().includes(q);
  });

  const handleStudentPhotoFile = async (student: Student, file?: File) => {
    if (!file) return;
    setUploadingStudentId(student.id);
    setPhotoError(null);
    try {
      const dataUrl = await compressImageFileToDataUrl(file, 320);
      const updated = await api.updateStudent(student.id, { avatar: dataUrl });
      if (onStudentUpdated) onStudentUpdated(updated);
      setSavedStudentId(student.id);
      setTimeout(() => setSavedStudentId(prev => (prev === student.id ? null : prev)), 2500);
    } catch (err: any) {
      setPhotoError(err.message || 'Erro ao enviar foto de perfil.');
    } finally {
      setUploadingStudentId(null);
    }
  };

  const handleSaveStudentPhotoUrl = async (student: Student) => {
    const trimmed = customPhotoUrl.trim();
    if (!trimmed) return;
    setUploadingStudentId(student.id);
    setPhotoError(null);
    try {
      const updated = await api.updateStudent(student.id, { avatar: trimmed });
      if (onStudentUpdated) onStudentUpdated(updated);
      setEditingUrlStudentId(null);
      setCustomPhotoUrl('');
      setSavedStudentId(student.id);
      setTimeout(() => setSavedStudentId(prev => (prev === student.id ? null : prev)), 2500);
    } catch (err: any) {
      setPhotoError(err.message || 'Erro ao salvar link da foto.');
    } finally {
      setUploadingStudentId(null);
    }
  };

  const handleResetStudentPhoto = async (student: Student) => {
    setUploadingStudentId(student.id);
    setPhotoError(null);
    try {
      const defaultAvatar = getInitialsAvatar(student.name);
      const updated = await api.updateStudent(student.id, { avatar: defaultAvatar });
      if (onStudentUpdated) onStudentUpdated(updated);
      setSavedStudentId(student.id);
      setTimeout(() => setSavedStudentId(prev => (prev === student.id ? null : prev)), 2500);
    } catch (err: any) {
      setPhotoError(err.message || 'Erro ao restaurar foto.');
    } finally {
      setUploadingStudentId(null);
    }
  };

  useEffect(() => {
    loadIntegrationsStatus();
  }, []);

  const loadIntegrationsStatus = async () => {
    try {
      const [mp, sb] = await Promise.all([
        api.getMercadoPagoStatus().catch(() => null),
        api.getSupabaseStatus().catch(() => null)
      ]);
      setMpStatus(mp);
      setSupabaseStatus(sb);
    } catch (e) {
      // ignore
    }
  };

  const handleTestMercadoPago = async () => {
    setIsTestingMp(true);
    setMpTestResult(null);
    try {
      const res = await api.testMercadoPagoConnection(formData.mercadoPagoAccessToken);
      setMpTestResult(res);
      const updatedStatus = await api.getMercadoPagoStatus().catch(() => null);
      if (updatedStatus) setMpStatus(updatedStatus);
      // Auto-refresh logs after testing
      const logs = await api.getMercadoPagoLogs().catch(() => []);
      setMpLogs(logs);
    } catch (err: any) {
      setMpTestResult({
        success: false,
        error: err.message || 'Falha de comunicação com a API'
      });
    } finally {
      setIsTestingMp(false);
    }
  };

  const handleFetchMpLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const logs = await api.getMercadoPagoLogs();
      setMpLogs(logs);
      setShowLogs(true);
    } catch (e) {
      // ignore
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleClearMpLogs = async () => {
    try {
      await api.clearMercadoPagoLogs();
      setMpLogs([]);
    } catch (e) {
      // ignore
    }
  };

  const handleTestSupabase = async () => {
    setIsTestingSupabase(true);
    try {
      // First save to make sure updated credentials in form are used
      if (formData.supabaseUrl || formData.supabaseAnonKey) {
        await api.updateSettings(formData);
      }
      const res = await api.testSupabaseConnection();
      setSupabaseStatus(res);
      if (res.connected) {
        alert('Conexão com o Supabase testada com sucesso!');
      } else {
        alert(`Status: ${res.error || 'Aguardando configuração de SUPABASE_URL e SUPABASE_ANON_KEY'}`);
      }
    } finally {
      setIsTestingSupabase(false);
    }
  };

  const handleSyncPush = async () => {
    setIsSyncingPush(true);
    setPushSyncResult(null);
    setPullSyncResult(null);
    try {
      // Save settings first so credentials are persisted
      await api.updateSettings(formData);
      const res = await api.syncAllToSupabase();
      setPushSyncResult(res);
      await loadIntegrationsStatus();
    } catch (err: any) {
      alert(`Erro na sincronização com Supabase: ${err.message}`);
    } finally {
      setIsSyncingPush(false);
    }
  };

  const handleSyncPull = async () => {
    if (!window.confirm('Deseja puxar e atualizar todos os dados locais com as informações do Supabase?')) {
      return;
    }
    setIsSyncingPull(true);
    setPushSyncResult(null);
    setPullSyncResult(null);
    try {
      const res = await api.syncFromSupabase();
      setPullSyncResult(res);
      await loadIntegrationsStatus();
    } catch (err: any) {
      alert(`Erro ao puxar dados do Supabase: ${err.message}`);
    } finally {
      setIsSyncingPull(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const updated = await api.updateSettings(formData);
      onSettingsSaved(updated);
      setSaveSuccess(true);
      await loadIntegrationsStatus();
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      alert(`Erro ao salvar configurações: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Atenção: Deseja restaurar todos os dados para o estado semente inicial? Isso reiniciará o estoque, as vendas e as faturas de teste.')) {
      return;
    }

    setIsResetting(true);
    try {
      await api.resetData();
      onResetData();
      alert('Dados restaurados com sucesso para os valores padrão de teste!');
    } catch (err: any) {
      alert(`Erro ao resetar: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      
      {/* Top Banner */}
      <div className="bg-[#1B1B1B] rounded-2xl p-6 border border-[#282828] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-[#F5F5F5] tracking-tight">
              Configurações Operacionais & Integrações
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Gestão do fechamento mensal, regras de caixa, credenciais de API do Mercado Pago e banco PostgreSQL.
          </p>
        </div>

        {saveSuccess && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-400" />
            Configurações Salvas com Sucesso!
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* 1. Identificação da Loja & Instituição */}
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#242424] pb-3">
            <div className="flex items-center gap-2.5">
              <img
                src="/assets/aistudio/image_e4461e45.png"
                alt="Logo ICEVES"
                className="w-7 h-7 rounded-full object-cover bg-white p-0.5 ring-1 ring-emerald-500/40 shrink-0"
              />
              <h3 className="font-semibold text-[#F5F5F5] text-sm">
                1. Identificação da Loja e Instituição (Escola de Cristo - ICEVES)
              </h3>
            </div>
            <span className="text-[11px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold">
              10ª Turma Vigente • Formatura: Dia 27 ao Dia 30
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#151515] border border-[#282828] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">Regime de Turmas</span>
              <span className="text-[#F5F5F5] font-semibold mt-0.5 block">1 turma por vez (1 turma por semestre)</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">Turma Atual</span>
              <span className="text-emerald-400 font-extrabold mt-0.5 block">10ª Turma — Escola de Cristo ICEVES</span>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#71717A] font-bold block">Período de Formatura</span>
              <span className="text-emerald-400 font-bold mt-0.5 block">Início dia 27 • Término dia 30</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-medium text-[#F5F5F5] mb-1">Nome da Lojinha</label>
              <input
                type="text"
                value={formData.storeName || ''}
                onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-medium text-[#F5F5F5] mb-1">Instituição</label>
              <input
                type="text"
                value={formData.institutionName || ''}
                onChange={(e) => setFormData({ ...formData, institutionName: e.target.value })}
                className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-medium text-[#F5F5F5] mb-1">CNPJ da Instituição</label>
              <input
                type="text"
                value={formData.cnpj || ''}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* 1.B Fotos de Perfil dos Alunos da 10ª Turma */}
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242424] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                <h3 className="font-semibold text-[#F5F5F5] text-sm">
                  Fotos de Perfil dos Alunos — 10ª Turma ({students.length} alunos)
                </h3>
              </div>
              <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                Adicione ou atualize a foto de perfil de cada aluno da 10ª Turma enviando uma imagem do dispositivo ou colando um link.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-2.5" />
              <input
                type="text"
                value={photoSearch}
                onChange={(e) => setPhotoSearch(e.target.value)}
                placeholder="Buscar aluno por nome ou código..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#151515] border border-[#303030] rounded-xl text-xs text-[#F5F5F5] placeholder-[#71717A] focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {photoError && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{photoError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto pr-1">
            {filteredPhotoStudents.map((st) => {
              const isUploading = uploadingStudentId === st.id;
              const isSaved = savedStudentId === st.id;
              const isEditingUrl = editingUrlStudentId === st.id;
              const avatarSrc = st.avatar || getInitialsAvatar(st.name);
              const isCustomPhoto = Boolean(st.avatar && !st.avatar.startsWith('data:image/svg+xml'));

              return (
                <div
                  key={st.id}
                  className="p-3 rounded-xl bg-[#151515] border border-[#282828] hover:border-[#383838] transition flex flex-col justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <label
                      className="relative group cursor-pointer shrink-0"
                      title="Clique para enviar foto do dispositivo"
                    >
                      <img
                        src={avatarSrc}
                        alt={st.name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-[#303030] group-hover:border-emerald-500 transition"
                      />
                      <span className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <Camera className="w-4 h-4 text-white" />
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleStudentPhotoFile(st, file);
                          e.target.value = '';
                        }}
                      />
                    </label>

                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-[#F5F5F5] text-xs truncate" title={st.name}>
                        {st.name}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-[#A1A1AA] bg-[#202020] px-1.5 py-0.5 rounded border border-[#2C2C2C]">
                          {st.registrationNumber}
                        </span>
                        {isSaved && (
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Foto salva!
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isEditingUrl ? (
                    <div className="space-y-1.5 pt-1 border-t border-[#222222]">
                      <input
                        type="url"
                        value={customPhotoUrl}
                        onChange={(e) => setCustomPhotoUrl(e.target.value)}
                        placeholder="https://exemplo.com/foto.jpg"
                        className="w-full p-1.5 bg-[#101010] border border-[#303030] rounded-lg text-[11px] text-white focus:border-emerald-500 focus:outline-none"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleSaveStudentPhotoUrl(st)}
                          disabled={isUploading || !customPhotoUrl.trim()}
                          className="flex-1 py-1 px-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-lg text-[10px] font-bold cursor-pointer disabled:opacity-50"
                        >
                          Salvar Link
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUrlStudentId(null);
                            setCustomPhotoUrl('');
                          }}
                          className="py-1 px-2 bg-[#222222] text-zinc-400 hover:text-white rounded-lg text-[10px] cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 pt-1 border-t border-[#222222]">
                      <label className="flex-1 py-1.5 px-2 bg-[#222222] hover:bg-[#2C2C2C] text-[#F5F5F5] border border-[#333333] rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition">
                        <Camera className="w-3 h-3 text-emerald-400" />
                        <span>{isUploading ? 'Salvando...' : 'Enviar Foto'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={isUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleStudentPhotoFile(st, file);
                            e.target.value = '';
                          }}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingUrlStudentId(st.id);
                          setCustomPhotoUrl(isCustomPhoto && st.avatar?.startsWith('http') ? st.avatar : '');
                        }}
                        className="py-1.5 px-2 bg-[#1C1C1C] hover:bg-[#282828] text-[#A1A1AA] hover:text-white border border-[#2C2C2C] rounded-lg text-[10px] font-medium flex items-center gap-1 cursor-pointer transition"
                        title="Colar link (URL) de imagem"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>URL</span>
                      </button>

                      {isCustomPhoto && (
                        <button
                          type="button"
                          onClick={() => handleResetStudentPhoto(st)}
                          className="py-1.5 px-2 bg-[#1C1C1C] hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 border border-[#2C2C2C] rounded-lg text-[10px] cursor-pointer transition"
                          title="Restaurar avatar com iniciais"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Fechamento Mensal e Vencimento */}
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-[#242424] pb-3">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-[#F5F5F5] text-sm">
              2. Fechamento Mensal & Vencimento de Faturas
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-medium text-[#F5F5F5] mb-1">Dia do Fechamento Mensal</label>
              <select
                value={formData.closingDay}
                onChange={(e) => setFormData({ ...formData, closingDay: e.target.value as any })}
                className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] focus:border-emerald-500 focus:outline-none"
              >
                <option value="LAST_DAY">Último dia de cada mês (Padrão)</option>
                <option value="25">Dia 25 de cada mês</option>
                <option value="28">Dia 28 de cada mês</option>
              </select>
              <p className="text-[10px] text-[#A1A1AA] mt-1">Consolida consumo e lançamentos até esta data.</p>
            </div>

            <div>
              <label className="block font-medium text-[#F5F5F5] mb-1">Horário de Fechamento</label>
              <input
                type="text"
                value={formData.closingHour || '23:59'}
                onChange={(e) => setFormData({ ...formData, closingHour: e.target.value })}
                className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] font-mono focus:border-emerald-500 focus:outline-none"
              />
              <p className="text-[10px] text-[#A1A1AA] mt-1">Horário limite do corte mensal.</p>
            </div>

            <div>
              <label className="block font-medium text-[#F5F5F5] mb-1">Dia do Vencimento (Offset Subsequente)</label>
              <input
                type="number"
                min={1}
                max={28}
                value={formData.dueDayOffset}
                onChange={(e) => setFormData({ ...formData, dueDayOffset: parseInt(e.target.value) || 10 })}
                className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] font-mono focus:border-emerald-500 focus:outline-none"
              />
              <p className="text-[10px] text-[#A1A1AA] mt-1">Ex: 10 = todo dia 10 do mês seguinte.</p>
            </div>
          </div>

          {/* Mensalidade Escolar Integrada nas Faturas */}
          <div className="pt-3 border-t border-[#242424] space-y-3">
            <div className="p-3.5 bg-[#151515] rounded-xl border border-[#282828] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="font-semibold text-[#F5F5F5] block">
                  Cobrança de Mensalidade Escolar Integrada {formData.tuitionBillingActive !== false ? 'ATIVA' : 'DESATIVADA'}
                </span>
                <span className="text-[#A1A1AA] text-[11px] block">
                  {formData.tuitionBillingActive !== false
                    ? 'O fechamento mensal soma a mensalidade do aluno ao consumo na lojinha.'
                    : 'Desativada: O fechamento mensal gerará faturas cobrando estritamente o consumo da lojinha/cantina (sem mensalidade escolar).'}
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formData.tuitionBillingActive ?? true}
                  onChange={(e) => setFormData({ ...formData, tuitionBillingActive: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-[#282828] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            {formData.tuitionBillingActive !== false && (
              <div className="p-3 bg-[#151515] rounded-xl border border-[#242424] flex items-center justify-between gap-3">
                <div>
                  <span className="font-medium text-[#F5F5F5] text-xs block">Valor Base Padrão da Mensalidade Escolar (R$)</span>
                  <span className="text-[10px] text-[#A1A1AA] block">Valor base aplicado para novos alunos (customizável individualmente em Alunos & Responsáveis).</span>
                </div>
                <div className="w-40 flex items-center gap-1.5 shrink-0">
                  <span className="text-zinc-500 font-mono text-xs">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.defaultTuitionAmount ?? 750}
                    onChange={(e) => setFormData({ ...formData, defaultTuitionAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 bg-[#1A1A1A] border border-[#303030] rounded-lg text-[#F5F5F5] font-mono text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Políticas Comerciais & Regras do PDV */}
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
          <div className="border-b border-[#242424] pb-3">
            <h3 className="font-semibold text-[#F5F5F5] text-sm">
              3. Políticas Comerciais & Regras do PDV
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3.5 bg-[#151515] rounded-xl border border-[#282828]">
              <div>
                <span className="font-semibold text-[#F5F5F5] block">Consumo da Lojinha na Conta Mensal</span>
                <span className="text-[#A1A1AA] text-[11px]">
                  Toda venda para aluno no balcão entra diretamente na fatura mensal, sem exigir pagamento no ato.
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                Ativo Obrigatório
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-[#151515] rounded-xl border border-[#282828]">
              <div>
                <span className="font-semibold text-[#F5F5F5] block">Controle de Estoque Automático</span>
                <span className="text-[#A1A1AA] text-[11px]">
                  Vendas no PDV reduzem instantaneamente o estoque com geração de movimentação auditada.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.stockControlActive}
                  onChange={(e) => setFormData({ ...formData, stockControlActive: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-[#282828] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-3.5 bg-[#151515] rounded-xl border border-[#282828]">
              <div>
                <span className="font-semibold text-[#F5F5F5] block">Bloqueio de Venda Sem Estoque</span>
                <span className="text-[#A1A1AA] text-[11px]">
                  Impede que produtos esgotados (estoque 0) sejam adicionados ao carrinho no caixa.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.blockSaleWithoutStock}
                  onChange={(e) => setFormData({ ...formData, blockSaleWithoutStock: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-[#282828] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
          </div>
        </div>

        {/* 4. Gateway Mercado Pago — Checkout Transparente & Webhooks (Dados 100% via API) */}
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242424] pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-[#009EE3]/20 text-[#009EE3] border border-[#009EE3]/30 flex items-center justify-center font-bold text-xs">
                MP
              </div>
              <div>
                <h3 className="font-semibold text-[#F5F5F5] text-sm flex items-center gap-2">
                  4. Mercado Pago — Checkout Transparente & Webhooks
                  <span className="text-[10px] bg-[#009EE3]/15 text-[#009EE3] border border-[#009EE3]/30 px-2 py-0.5 rounded-full font-semibold">
                    Cobranças Dinâmicas via API
                  </span>
                </h3>
                <p className="text-[11px] text-[#A1A1AA]">
                  Gera cobranças Pix instantâneas e Cartão via API do Mercado Pago sem necessidade de chave Pix estática.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {mpStatus?.configured ? (
                <span className={`text-[11px] px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5 ${
                  mpStatus.isProduction
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                }`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {mpStatus.isProduction ? 'Produção Ativa' : 'Ambiente Sandbox'}
                </span>
              ) : (
                <span className="text-[11px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Aguardando Access Token
                </span>
              )}

              <button
                type="button"
                disabled={isTestingMp || !formData.mercadoPagoAccessToken}
                onClick={handleTestMercadoPago}
                className="px-3 py-1 bg-[#009EE3] hover:bg-[#008CC9] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingMp ? 'animate-spin' : ''}`} />
                Testar Credencial via API
              </button>
            </div>
          </div>

          {/* Test Result Message Box */}
          {mpTestResult && (
            <div className={`p-4 rounded-xl text-xs space-y-2 border ${
              mpTestResult.success 
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' 
                : 'bg-red-950/30 border-red-500/30 text-red-300'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {mpTestResult.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Conexão com Mercado Pago confirmada com sucesso!</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span>Falha na verificação de credencial Mercado Pago:</span>
                  </>
                )}
              </div>

              {mpTestResult.success && mpTestResult.user ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 font-mono text-[11px] text-zinc-300">
                  <div className="p-2 bg-black/40 rounded-lg">
                    <span className="text-zinc-500 block text-[10px]">Titular da Conta:</span>
                    <strong className="text-white">{mpTestResult.user.nickname || `${mpTestResult.user.firstName || ''} ${mpTestResult.user.lastName || ''}`.trim() || 'Titular'}</strong>
                  </div>
                  <div className="p-2 bg-black/40 rounded-lg">
                    <span className="text-zinc-500 block text-[10px]">E-mail Coletor:</span>
                    <strong className="text-white truncate block">{mpTestResult.user.email}</strong>
                  </div>
                  <div className="p-2 bg-black/40 rounded-lg">
                    <span className="text-zinc-500 block text-[10px]">ID do Usuário:</span>
                    <strong className="text-white">{mpTestResult.user.id}</strong>
                  </div>
                  <div className="p-2 bg-black/40 rounded-lg">
                    <span className="text-zinc-500 block text-[10px]">País / Site:</span>
                    <strong className="text-white">{mpTestResult.user.siteId || 'MLB'} ({mpTestResult.user.countryId || 'BR'})</strong>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] space-y-1">
                  <p className="font-semibold text-red-200">{mpTestResult.error}</p>
                  <p className="text-zinc-400">
                    Dica: Verifique se o token começa com <code className="text-white font-mono">APP_USR-...</code> (Produção) ou <code className="text-white font-mono">TEST-...</code> (Sandbox) obtido no Mercado Pago Developers.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            
            {/* Access Token Input */}
            <div className="p-3.5 bg-[#151515] rounded-xl border border-[#2A2A2A] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[#F5F5F5] font-semibold block">
                  Mercado Pago Access Token
                </label>
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="text-zinc-400 hover:text-white flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  {showToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showToken ? 'Ocultar' : 'Exibir'}
                </button>
              </div>

              <input
                type={showToken ? 'text' : 'password'}
                value={formData.mercadoPagoAccessToken || ''}
                onChange={(e) => setFormData({ ...formData, mercadoPagoAccessToken: e.target.value.trim() })}
                placeholder="APP_USR-0000000000000000-000000-..."
                className="w-full p-2.5 bg-[#1E1E1E] border border-[#303030] rounded-xl text-white font-mono text-xs focus:border-[#009EE3] focus:outline-none"
              />

              <p className="text-[10px] text-[#A1A1AA]">
                Cole aqui o Access Token da sua aplicação Mercado Pago. Salve para persistir no banco.
              </p>
            </div>

            {/* Public Key (Opcional para checkout JS) */}
            <div className="p-3.5 bg-[#151515] rounded-xl border border-[#2A2A2A] space-y-2">
              <label className="text-[#F5F5F5] font-semibold block">
                Mercado Pago Public Key (Chave Pública)
              </label>

              <input
                type="text"
                value={formData.mercadoPagoPublicKey || ''}
                onChange={(e) => setFormData({ ...formData, mercadoPagoPublicKey: e.target.value.trim() })}
                placeholder="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full p-2.5 bg-[#1E1E1E] border border-[#303030] rounded-xl text-white font-mono text-xs focus:border-[#009EE3] focus:outline-none"
              />

              <p className="text-[10px] text-[#A1A1AA]">
                Utilizada para tokenização de cartões e SDK transparente no navegador.
              </p>
            </div>

            {/* Webhook Endpoint */}
            <div className="p-3.5 bg-[#151515] rounded-xl border border-[#2A2A2A] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[#A1A1AA] text-[11px] font-medium">URL do Webhook Mercado Pago (Notificações)</span>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Pronto para Receber
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={mpStatus?.webhookUrl ? (mpStatus.webhookUrl.startsWith('http') ? mpStatus.webhookUrl : `${window.location.origin}${mpStatus.webhookUrl}`) : `${window.location.origin}/api/mercadopago/webhook`}
                  className="w-full p-2 text-[10px] font-mono bg-[#1E1E1E] border border-[#303030] rounded-lg text-[#F5F5F5] select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    const url = mpStatus?.webhookUrl ? (mpStatus.webhookUrl.startsWith('http') ? mpStatus.webhookUrl : `${window.location.origin}${mpStatus.webhookUrl}`) : `${window.location.origin}/api/mercadopago/webhook`;
                    navigator.clipboard.writeText(url);
                    setCopiedWebhook(true);
                    setTimeout(() => setCopiedWebhook(false), 2000);
                  }}
                  className="px-3 py-1.5 bg-[#009EE3] hover:bg-[#008CC9] text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition"
                >
                  {copiedWebhook ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedWebhook ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="text-[10px] text-[#808080]">
                Cadastre em: <em>Mercado Pago Developers &gt; Notificações Webhook &gt; Evento de Pagamentos</em>.
              </p>
            </div>

            {/* Webhook Secret Signature (Opcional) */}
            <div className="p-3.5 bg-[#151515] rounded-xl border border-[#2A2A2A] space-y-2">
              <label className="text-[#F5F5F5] font-semibold block">
                Segredo de Assinatura Webhook (Opcional)
              </label>

              <input
                type="text"
                value={formData.mercadoPagoWebhookSecret || ''}
                onChange={(e) => setFormData({ ...formData, mercadoPagoWebhookSecret: e.target.value.trim() })}
                placeholder="Insira a chave secreta gerada no painel de webhooks"
                className="w-full p-2.5 bg-[#1E1E1E] border border-[#303030] rounded-xl text-white font-mono text-xs focus:border-[#009EE3] focus:outline-none"
              />

              <p className="text-[10px] text-[#A1A1AA]">
                Utilizado para verificar a assinatura de integridade <code className="text-zinc-400">x-signature</code>.
              </p>
            </div>

            {/* Activation and Mode Row */}
            <div className="col-span-1 md:col-span-2 p-3.5 bg-[#151515] rounded-xl border border-[#2A2A2A] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.mercadoPagoActive ?? true}
                    onChange={(e) => setFormData({ ...formData, mercadoPagoActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-[#282828] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#009EE3]"></div>
                </label>
                <div>
                  <span className="font-semibold text-white text-xs block">
                    Integração Mercado Pago {formData.mercadoPagoActive ? 'ATIVA' : 'DESATIVADA'}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Habilita o checkout para faturas, gerando requisições diretas na API do Mercado Pago
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400 font-medium">Modo:</span>
                  <select
                    value={formData.mercadoPagoMode || 'PRODUCAO'}
                    onChange={(e) => setFormData({ ...formData, mercadoPagoMode: e.target.value as any })}
                    className="p-1.5 bg-[#1E1E1E] border border-[#303030] rounded-lg text-white text-xs font-semibold focus:border-[#009EE3] focus:outline-none"
                  >
                    <option value="PRODUCAO">Produção (Live)</option>
                    <option value="SANDBOX">Sandbox (Testes)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleFetchMpLogs}
                  disabled={isLoadingLogs}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Terminal className="w-3.5 h-3.5 text-[#009EE3]" />
                  {showLogs ? 'Atualizar Logs da API' : 'Ver Logs de Requisições'}
                </button>
              </div>
            </div>

            {/* Diagnostic Logs Panel */}
            {showLogs && (
              <div className="col-span-1 md:col-span-2 p-4 bg-[#111111] rounded-xl border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#009EE3]" />
                    <span className="font-bold text-white text-xs">
                      Histórico em Tempo Real de Requisições à API do Mercado Pago ({mpLogs.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleClearMpLogs}
                      className="text-zinc-500 hover:text-red-400 text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpar Logs
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowLogs(false)}
                      className="text-zinc-500 hover:text-white text-[11px] cursor-pointer ml-2"
                    >
                      Fechar
                    </button>
                  </div>
                </div>

                {mpLogs.length === 0 ? (
                  <p className="text-zinc-500 text-xs py-3 text-center">
                    Nenhuma requisição registrada ainda. Ao gerar um pagamento Pix ou testar credenciais, os detalhes aparecerão aqui em tempo real.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {mpLogs.map((log) => (
                      <div 
                        key={log.id} 
                        className={`p-2.5 rounded-lg border text-[11px] font-mono ${
                          log.success 
                            ? 'bg-zinc-900/80 border-emerald-500/30' 
                            : 'bg-red-950/20 border-red-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.method === 'GET' ? 'bg-blue-900 text-blue-300' : 'bg-emerald-900 text-emerald-300'
                            }`}>
                              {log.method}
                            </span>
                            <span className="text-white font-semibold">{log.endpoint}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                              HTTP {log.status}
                            </span>
                            <span className="text-zinc-500 text-[10px]">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>

                        {log.error && (
                          <div className="mt-1.5 text-red-300 text-[10px] bg-red-950/40 p-1.5 rounded">
                            <strong>Motivo/Erro:</strong> {log.error}
                          </div>
                        )}

                        {log.requestPayload && (
                          <div className="mt-1.5 text-zinc-400 text-[10px] truncate">
                            <strong>Payload:</strong> {JSON.stringify(log.requestPayload)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>

        {/* 5. Banco de Dados Supabase (PostgreSQL Externo) */}
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242424] pb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                <Database className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="font-semibold text-[#F5F5F5] text-sm">
                  5. Banco de Dados Supabase (PostgreSQL)
                </h3>
                <p className="text-[11px] text-[#A1A1AA]">
                  Conexão com PostgreSQL, Realtime e sincronização bidirecional de dados
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {supabaseStatus?.connected ? (
                <span className="text-[11px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Conectado ao Supabase
                </span>
              ) : (
                <span className="text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700 px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5">
                  {supabaseStatus?.urlProvided ? 'Chave Incompleta / Não Conectado' : 'Aguardando Credenciais'}
                </span>
              )}

              <button
                type="button"
                disabled={isTestingSupabase}
                onClick={handleTestSupabase}
                className="px-3 py-1 bg-[#282828] hover:bg-[#323232] text-[#F5F5F5] rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingSupabase ? 'animate-spin text-emerald-400' : ''}`} />
                Testar Conexão
              </button>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {/* Activation Row */}
            <div className="p-3.5 bg-[#151515] rounded-xl border border-[#2A2A2A] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.supabaseActive ?? true}
                    onChange={(e) => setFormData({ ...formData, supabaseActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-6 bg-[#282828] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
                <div>
                  <span className="font-semibold text-white text-xs block">
                    Conexão e Sincronização Supabase {formData.supabaseActive ? 'ATIVA' : 'DESATIVADA'}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Com a opção ativa, todas as vendas, alterações de produtos, faturas e estoque sincronizam automaticamente em tempo real com o PostgreSQL.
                  </span>
                </div>
              </div>
            </div>

            {/* Credenciais Supabase Editáveis */}
            <div className="p-4 bg-[#151515] rounded-xl border border-[#2A2A2A] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-[#F5F5F5] block text-xs">
                    Credenciais do Projeto Supabase:
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Insira aqui as credenciais do seu Dashboard Supabase (Project Settings &gt; API) ou configure nas variáveis de ambiente.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSbKey(!showSbKey)}
                  className="text-[11px] text-[#A1A1AA] hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  {showSbKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showSbKey ? 'Ocultar Chaves' : 'Exibir Chaves'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-300 block">
                    Project URL (SUPABASE_URL)
                  </label>
                  <input
                    type="url"
                    value={formData.supabaseUrl || ''}
                    onChange={(e) => setFormData({ ...formData, supabaseUrl: e.target.value })}
                    placeholder="https://exemplo-seu-id.supabase.co"
                    className="w-full bg-[#1E1E1E] border border-[#303030] focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none transition font-mono"
                  />
                  <span className="text-[10px] text-zinc-500 block">
                    Ativo: {supabaseStatus?.maskedUrl || 'Não configurado'}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-300 block">
                    Anon / Public Key (SUPABASE_ANON_KEY)
                  </label>
                  <input
                    type={showSbKey ? 'text' : 'password'}
                    value={formData.supabaseAnonKey || ''}
                    onChange={(e) => setFormData({ ...formData, supabaseAnonKey: e.target.value })}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full bg-[#1E1E1E] border border-[#303030] focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none transition font-mono"
                  />
                  <span className="text-[10px] text-zinc-500 block">
                    Status: {supabaseStatus?.keyProvided ? 'Chave salva' : 'Não informada'}
                  </span>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <label className="text-[11px] font-medium text-zinc-300 block">
                  Service Role Key (SUPABASE_SERVICE_ROLE_KEY) - <span className="text-zinc-500">Opcional para bypass RLS</span>
                </label>
                <input
                  type={showSbKey ? 'text' : 'password'}
                  value={formData.supabaseServiceRoleKey || ''}
                  onChange={(e) => setFormData({ ...formData, supabaseServiceRoleKey: e.target.value })}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (Opcional)"
                  className="w-full bg-[#1E1E1E] border border-[#303030] focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none transition font-mono"
                />
              </div>
            </div>

            {/* Ações de Sincronização em Massa (Push e Pull) */}
            <div className="p-4 bg-gradient-to-br from-[#181818] to-[#141414] rounded-xl border border-[#2E2E2E] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-white text-xs flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-emerald-400" />
                    Sincronização Completa de Tabelas
                  </h4>
                  <p className="text-[11px] text-zinc-400">
                    Sincroniza todas as 11 tabelas do sistema: configurações, usuários, responsáveis, alunos, produtos, estoque, vendas, faturas, pagamentos pix, whatsapp e logs de auditoria.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isSyncingPush}
                    onClick={handleSyncPush}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-sm"
                  >
                    <UploadCloud className={`w-4 h-4 ${isSyncingPush ? 'animate-bounce' : ''}`} />
                    {isSyncingPush ? 'Sincronizando Push...' : 'Sincronizar Todas as Tabelas -> Supabase'}
                  </button>

                  <button
                    type="button"
                    disabled={isSyncingPull}
                    onClick={handleSyncPull}
                    className="px-3.5 py-2 bg-[#282828] hover:bg-[#323232] text-[#F5F5F5] rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer disabled:opacity-50 border border-[#3A3A3A]"
                  >
                    <DownloadCloud className={`w-4 h-4 ${isSyncingPull ? 'animate-bounce' : ''}`} />
                    {isSyncingPull ? 'Puxando...' : 'Puxar do Supabase'}
                  </button>
                </div>
              </div>

              {/* Resultado do Push */}
              {pushSyncResult && (
                <div className={`p-3.5 rounded-xl border text-xs space-y-2.5 ${pushSyncResult.success ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-red-950/20 border-red-500/30'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {pushSyncResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      )}
                      <span className={`font-semibold ${pushSyncResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
                        {pushSyncResult.message}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {pushSyncResult.timestamp ? new Date(pushSyncResult.timestamp).toLocaleTimeString() : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pt-1">
                    {Object.entries(pushSyncResult.tables || {}).map(([tableName, info]) => (
                      <div key={tableName} className="p-2 bg-[#1A1A1A] rounded-lg border border-[#2E2E2E] flex items-center justify-between">
                        <div>
                          <span className="font-mono text-[10px] text-zinc-400 block truncate max-w-[120px]">
                            {tableName}
                          </span>
                          <span className="text-[11px] font-bold text-white">
                            {info.count} regs
                          </span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${info.status === 'OK' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {info.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resultado do Pull */}
              {pullSyncResult && (
                <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${pullSyncResult.success ? 'bg-blue-950/20 border-blue-500/30' : 'bg-red-950/20 border-red-500/30'}`}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-400" />
                    <span className="font-semibold text-blue-300">
                      {pullSyncResult.message}
                    </span>
                  </div>
                  <div className="flex gap-4 text-[11px] text-zinc-400 pt-1 font-mono">
                    {Object.entries(pullSyncResult.tables || {}).map(([t, c]) => (
                      <span key={t}>{t}: <b className="text-white">{c}</b></span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Supabase Schema Script helper */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-950/30 to-[#151515] rounded-xl border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                  <FileCode className="w-4 h-4" />
                  <span>Script SQL das Tabelas & Correção de Permissões RLS (supabase_schema.sql)</span>
                </div>
                <p className="text-[11px] text-[#A1A1AA]">
                  Arquivo pronto com todas as 12 tabelas e permissões <code className="text-emerald-300 font-mono">GRANT ALL</code> para corrigir erros <code className="text-amber-300 font-mono">permission denied for table users / audit_logs</code>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const fixSql = `-- 1. CRIA A TABELA PASSEIOS CASO AINDA NÃO EXISTA NO SUPABASE
CREATE TABLE IF NOT EXISTS public.passeios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  valor NUMERIC(10,2) NOT NULL DEFAULT 0,
  descricao TEXT,
  data_passeio DATE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CORREÇÃO DE PERMISSÕES SUPABASE (users, audit_logs, passeios e demais tabelas)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;

DO $$ 
DECLARE
  tbl text;
  tbls text[] := ARRAY['settings', 'users', 'guardians', 'students', 'products', 'stock_movements', 'sales', 'invoices', 'pix_payments', 'whatsapp_notifications', 'audit_logs', 'passeios'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO anon, authenticated, service_role;', tbl);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "Permitir acesso total à aplicação" ON public.%I;', tbl);
      EXECUTE format('CREATE POLICY "Permitir acesso total à aplicação" ON public.%I FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);', tbl);
    END IF;
  END LOOP;
END $$;`;
                    navigator.clipboard.writeText(fixSql);
                    setCopiedSql(true);
                    setTimeout(() => setCopiedSql(false), 2500);
                  }}
                  className="px-3.5 py-2 bg-amber-600/90 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSql ? 'SQL Copiado!' : 'Copiar SQL Correção Permissões'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    fetch('/supabase_schema.sql')
                      .then(res => res.text())
                      .then(sql => {
                        navigator.clipboard.writeText(sql);
                        setCopiedSql(true);
                        setTimeout(() => setCopiedSql(false), 2500);
                      })
                      .catch(() => alert('Script gerado na raiz do projeto como supabase_schema.sql'));
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSql ? 'SQL Copiado!' : 'Copiar Script Completo'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {isAdmin && (
            <button
              type="button"
              disabled={isResetting}
              onClick={handleReset}
              className="px-4 py-2.5 bg-[#222222] border border-[#303030] text-red-400 hover:bg-[#2A2A2A] rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restaurar Dados Iniciais de Teste
            </button>
          )}

          {isAdmin && (
            <button
              type="submit"
              disabled={isSaving}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          )}
        </div>

      </form>

    </div>
  );
}
