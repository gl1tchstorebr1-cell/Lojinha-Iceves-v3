import React, { useState } from 'react';
import { 
  MessageSquare, 
  Send, 
  Pause, 
  Play, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  Filter, 
  Search, 
  CheckCheck,
  ShieldCheck,
  SlidersHorizontal,
  Phone
} from 'lucide-react';
import { WhatsAppNotification, SystemSettings, NotificationType, Invoice } from '../../types';
import { formatDateTime } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface WhatsAppAutomationProps {
  notifications: WhatsAppNotification[];
  settings: SystemSettings | null;
  invoices: Invoice[];
  onNotificationUpdated: (notif: WhatsAppNotification) => void;
  onSettingsUpdated: (settings: SystemSettings) => void;
}

export function WhatsAppAutomation({ 
  notifications, 
  settings, 
  invoices, 
  onNotificationUpdated, 
  onSettingsUpdated 
}: WhatsAppAutomationProps) {
  const { user, isAdmin } = useAuth();

  const [typeFilter, setTypeFilter] = useState<string>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');
  const [isTogglingProvider, setIsTogglingProvider] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Toggle pause / resume automation
  const handleToggleAutomation = async () => {
    if (!settings || !isAdmin) return;
    setIsTogglingProvider(true);
    try {
      const newStatus = settings.whatsappProviderStatus === 'CONNECTED' ? 'PAUSED' : 'CONNECTED';
      const updated = await api.updateSettings({
        whatsappProviderStatus: newStatus,
        whatsappAutoEnabled: newStatus === 'CONNECTED'
      });
      onSettingsUpdated(updated);
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsTogglingProvider(false);
    }
  };

  // Retry sending a notification with the critical pre-check:
  // If invoice is already settled, it marks CANCELADO_FATURA_QUITADA and prevents disturbing the user!
  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await api.retryWhatsAppNotification(id);
      onNotificationUpdated(res);
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    const matchesType = typeFilter === 'TODOS' || n.type === typeFilter;
    const q = searchTerm.toLowerCase();
    const matchesSearch = !q || (
      n.recipientName.toLowerCase().includes(q) ||
      n.recipientPhone.includes(q) ||
      n.studentName.toLowerCase().includes(q) ||
      n.messageText.toLowerCase().includes(q)
    );
    return matchesType && matchesSearch;
  });

  const getStatusBadge = (status: WhatsAppNotification['status']) => {
    switch (status) {
      case 'ENTREGUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
            <CheckCheck className="w-3 h-3 text-emerald-400" />
            Entregue
          </span>
        );
      case 'ENVIADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-950/60 text-blue-400 border border-blue-800/40">
            <Send className="w-3 h-3 text-blue-400" />
            Enviado ao Provedor
          </span>
        );
      case 'PROGRAMADO':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/60 text-amber-400 border border-amber-800/40">
            <Clock className="w-3 h-3 text-amber-400" />
            Programado
          </span>
        );
      case 'CANCELADO_FATURA_QUITADA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/40" title="Verificado saldo antes do envio: Fatura já liquidada, lembrete cancelado!">
            <ShieldCheck className="w-3 h-3 text-[#8B7CFF]" />
            Cancelado (Fatura Quitada)
          </span>
        );
      case 'FALHA':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-950/60 text-red-400 border border-red-800/40">
            <AlertCircle className="w-3 h-3 text-red-400" />
            Falha no Disparo
          </span>
        );
      default:
        return null;
    }
  };

  const getTypeLabel = (t: NotificationType) => {
    switch (t) {
      case 'NOVA_FATURA': return 'Nova Fatura';
      case 'RELATORIO_MENSAL': return 'Relatório Mensal';
      case 'LEMBRETE_ANTES_VENCIMENTO': return 'Lembrete Pré-Vencimento';
      case 'LEMBRETE_APOS_VENCIMENTO': return 'Lembrete Cobrança';
      case 'CONFIRMACAO_PAGAMENTO': return 'Confirmação de Pagamento';
      case 'ALERTA_ESTOQUE': return 'Alerta de Estoque Baixo';
      default: return t;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner and Provider Status */}
      <div className="bg-[#1B1B1B] rounded-2xl p-6 border border-[#282828] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-5 h-5 text-[#8B7CFF]" />
            <h2 className="text-xl font-bold text-[#F5F5F5] tracking-tight">
              Automação de WhatsApp & Mensagens
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Plataforma oficial WhatsApp Cloud API. Antes de enviar lembretes, o saldo da fatura é revalidado para evitar cobrança de contas quitadas.
          </p>
        </div>

        {/* Integration Switch Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 bg-[#151515] px-3.5 py-2 rounded-xl border border-[#282828] text-xs">
            <span className="font-medium text-[#A1A1AA]">Cloud API:</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1.5 border ${
              settings?.whatsappProviderStatus === 'CONNECTED'
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                : 'bg-amber-950/60 text-amber-400 border-amber-800/40'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${settings?.whatsappProviderStatus === 'CONNECTED' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              {settings?.whatsappProviderStatus === 'CONNECTED' ? 'Ativo & Conectado' : 'Pausado'}
            </span>
          </div>

          {isAdmin && (
            <button
              onClick={handleToggleAutomation}
              disabled={isTogglingProvider}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
                settings?.whatsappProviderStatus === 'CONNECTED'
                  ? 'bg-[#222222] hover:bg-[#2A2A2A] text-amber-400 border border-[#303030]'
                  : 'bg-[#8B7CFF] hover:bg-[#7A6AE6] text-white'
              }`}
            >
              {settings?.whatsappProviderStatus === 'CONNECTED' ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  Pausar Fila
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Retomar Automação
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Rules Notice */}
      <div className="p-4 bg-[#1E1E1E] border border-[#282828] rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#D4D4D8]">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-[#8B7CFF] shrink-0" />
          <span>
            <strong className="text-[#F5F5F5]">Proteção Anti-Incômodo Ativa:</strong> O sistema checa se a fatura já possui status <em className="text-emerald-400">Quitada</em> antes de realizar qualquer disparo de cobrança ou lembrete.
          </span>
        </div>
        <span className="text-[11px] text-[#A1A1AA] font-mono whitespace-nowrap">
          {notifications.length} envios registrados
        </span>
      </div>

      {/* Main Table Card */}
      <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-[#A1A1AA] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por destinatário, telefone ou texto..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:border-[#8B7CFF] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
            {['TODOS', 'NOVA_FATURA', 'RELATORIO_MENSAL', 'CONFIRMACAO_PAGAMENTO', 'ALERTA_ESTOQUE'].map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap border ${
                  typeFilter === t ? 'bg-[#8B7CFF] text-white border-[#8B7CFF]' : 'bg-[#151515] text-[#A1A1AA] border-[#282828] hover:text-[#F5F5F5]'
                }`}
              >
                {t === 'TODOS' ? 'Todos os Tipos' : getTypeLabel(t as NotificationType)}
              </button>
            ))}
          </div>
        </div>

        {/* Message Logs */}
        <div className="divide-y divide-[#242424] border border-[#282828] rounded-xl overflow-hidden bg-[#151515] text-xs">
          {filteredNotifications.length === 0 ? (
            <div className="py-12 text-center text-[#A1A1AA]">
              Nenhuma mensagem encontrada com os filtros selecionados.
            </div>
          ) : (
            filteredNotifications.map(notif => (
              <div key={notif.id} className="p-4 hover:bg-[#1A1A1A] transition space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-[#8B7CFF]">{notif.id}</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#222222] text-[#D4D4D8] border border-[#303030]">
                      {getTypeLabel(notif.type)}
                    </span>
                    {getStatusBadge(notif.status)}
                  </div>

                  <div className="flex items-center gap-3 text-[#A1A1AA] text-[11px]">
                    <span>Agendado: {formatDateTime(notif.scheduledFor)}</span>
                    {notif.sentAt && <span>• Enviado: {formatDateTime(notif.sentAt)}</span>}
                  </div>
                </div>

                {/* Message Payload */}
                <div className="bg-[#1E1E1E] p-3 rounded-xl border border-[#282828] font-sans text-xs text-[#D4D4D8]">
                  <p className="whitespace-pre-line leading-relaxed">{notif.messageText}</p>
                </div>

                {/* Recipient info & Retry */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2 text-[11px] text-[#A1A1AA]">
                    <Phone className="w-3 h-3 text-[#8B7CFF]" />
                    <span>Destinatário: <strong className="text-[#F5F5F5]">{notif.recipientName}</strong> ({notif.recipientPhone}) • Papel: {notif.recipientRole}</span>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => handleRetry(notif.id)}
                      disabled={retryingId === notif.id}
                      className="px-2.5 py-1 text-[11px] font-medium text-[#8B7CFF] hover:text-white bg-[#222222] hover:bg-[#2A2A2A] border border-[#303030] rounded-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${retryingId === notif.id ? 'animate-spin' : ''}`} />
                      Revalidar Saldo e Reenviar
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

      </div>

    </div>
  );
}
