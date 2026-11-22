import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  ShieldCheck,
  AlertCircle,
  User as UserIcon,
  Trash2,
  TrendingUp,
  PackageSearch,
  BarChart3,
  Wallet,
  FileSpreadsheet,
  ArrowUpRight,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { PromptInput } from '../ui/ai-chat-input';

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  model?: string;
  effort?: string;
  attachmentNames?: string[];
}

interface QuickPromptCard {
  title: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
}

const QUICK_PROMPTS_STAFF: QuickPromptCard[] = [
  {
    title: 'Desempenho de Vendas',
    prompt: 'Quanto vendemos hoje e qual foi o ticket médio do mês?',
    icon: TrendingUp,
  },
  {
    title: 'Alertas de Estoque',
    prompt: 'Quais produtos estão com estoque baixo ou sem estoque?',
    icon: PackageSearch,
  },
  {
    title: 'Giro de Produtos',
    prompt: 'Quais são os produtos mais vendidos e os sem giro?',
    icon: BarChart3,
  },
  {
    title: 'Pendências & Consumo',
    prompt: 'Quem tem pagamento ou consumo pendente no momento?',
    icon: Wallet,
  },
  {
    title: 'Resumo Executivo',
    prompt: 'Gere um resumo financeiro geral da Lojinha Iceves agora.',
    icon: FileSpreadsheet,
  },
];

const QUICK_PROMPTS_PORTAL: QuickPromptCard[] = [
  {
    title: 'Meu Consumo Atual',
    prompt: 'Qual é o meu saldo atual de consumo na Lojinha?',
    icon: Wallet,
  },
  {
    title: 'Faturas em Aberto',
    prompt: 'Tenho faturas em aberto ou pendentes?',
    icon: FileSpreadsheet,
  },
  {
    title: 'Histórico Recente',
    prompt: 'Quais foram as compras mais recentes registradas?',
    icon: TrendingUp,
  },
];

function renderFormattedText(text: string) {
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <React.Fragment key={lineIdx}>
        {parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
              <strong key={pIdx} className="font-semibold text-white">
                {part.slice(2, -2)}
              </strong>
            );
          }
          return <React.Fragment key={pIdx}>{part}</React.Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

export function IcevesAiAssistant() {
  const { user, isStudent, isGuardian } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = isStudent || isGuardian ? QUICK_PROMPTS_PORTAL : QUICK_PROMPTS_STAFF;

  useEffect(() => {
    if (messages.length > 0 || isLoading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isLoading]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleSend = async (
    promptText?: string,
    meta?: { model: string; effort: string; attachments: File[] }
  ) => {
    const rawText = (promptText ?? input).trim();
    const attachmentNames = meta?.attachments?.map((f) => f.name) || [];
    const baseQuestion =
      rawText ||
      (attachmentNames.length > 0
        ? `Analise minha solicitação considerando os anexos de referência: ${attachmentNames.join(', ')}.`
        : '');

    if (!baseQuestion || isLoading) return;

    if (!isOnline) {
      setError('O assistente ICEVES Inteligência requer conexão ativa com o servidor.');
      return;
    }

    setError(null);
    if (!promptText) setInput('');

    const styleInstruction = meta
      ? ` [Modo: ${meta.model} | Profundidade: ${meta.effort}${
          attachmentNames.length > 0 ? ` | Anexos: ${attachmentNames.join(', ')}` : ''
        }]`
      : '';

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: baseQuestion,
      timestamp: new Date().toISOString(),
      model: meta?.model,
      effort: meta?.effort,
      attachmentNames: attachmentNames.length > 0 ? attachmentNames : undefined,
    };

    setMessages((prev) => [...prev, userTurn]);
    setIsLoading(true);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));
      const res = await api.askIcevesAi({
        question: `${baseQuestion}${styleInstruction}`,
        history: historyPayload,
      });

      const modelTurn: ChatTurn = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: res.answer,
        timestamp: res.generatedAt,
        model: meta?.model || res.model,
        effort: meta?.effort,
      };
      setMessages((prev) => [...prev, modelTurn]);
    } catch (err: any) {
      setError(err.message || 'Não foi possível consultar o ICEVES Inteligência.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Unified Chat Workspace */}
      <div className="bg-[#17171A] rounded-3xl border border-[#28282E] shadow-2xl flex flex-col min-h-[580px] h-[calc(100vh-11.5rem)] max-h-[780px] overflow-hidden">
        {/* Top Bar */}
        <div className="px-5 sm:px-7 py-4 border-b border-[#242429] bg-[#1B1B1F]/90 backdrop-blur-md flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-[#F5F5F5] tracking-tight truncate">
                  ICEVES Inteligência
                </h2>
                <span className="text-[11px] font-medium text-emerald-400/90 whitespace-nowrap">
                  · Somente Leitura · {user?.role}
                </span>
              </div>
              <p className="text-xs text-[#9CA3AF] truncate">
                Análise em linguagem natural com base exclusiva nos dados autorizados do sistema.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-[#232328] hover:bg-[#2C2C32] border border-[#323238] text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">Nova conversa</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Conversation Area */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center max-w-3xl mx-auto py-4">
              {/* Hero Welcome */}
              <div className="relative text-center space-y-3 mb-7">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 w-56 h-32 rounded-full bg-emerald-500/[0.08] blur-2xl"
                />
                <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/5 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-950/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="space-y-1.5 relative">
                  <h3 className="text-lg sm:text-xl font-bold text-[#F5F5F5] tracking-tight">
                    Como posso ajudar na Lojinha hoje?
                  </h3>
                  <p className="text-xs sm:text-[13px] text-[#A1A1AA] max-w-lg mx-auto leading-relaxed">
                    Selecione um atalho analítico abaixo ou pergunte diretamente no campo inteligente por texto, voz ou imagem de referência.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-400/90 pt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Processamento seguro via servidor · Consultas auditadas</span>
                </div>
              </div>

              {/* Suggestion Cards Grid */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {quickPrompts.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.prompt}
                      type="button"
                      disabled={isLoading || !isOnline}
                      onClick={() => handleSend(item.prompt)}
                      className="group text-left p-3.5 rounded-2xl bg-[#1D1D21] hover:bg-[#232328] border border-[#2B2B31] hover:border-emerald-500/40 transition-all duration-200 cursor-pointer disabled:opacity-50 flex flex-col justify-between gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                          <Icon className="w-3.5 h-3.5" />
                          {item.title}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-[#71717A] group-hover:text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                      </div>
                      <p className="text-xs text-[#D4D4D8] group-hover:text-white leading-relaxed line-clamp-2">
                        {item.prompt}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((msg) => {
                const timeLabel = new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                if (msg.role === 'user') {
                  return (
                    <div key={msg.id} className="flex items-start justify-end gap-3 animate-blur-in">
                      <div className="max-w-[82%] sm:max-w-[75%] space-y-1 text-right">
                        <div className="inline-block text-left rounded-2xl rounded-tr-sm px-4 py-3 text-[13px] leading-relaxed bg-emerald-600 text-white font-medium shadow-sm">
                          {msg.text}
                          {msg.attachmentNames && msg.attachmentNames.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-white/20 text-[11px] text-emerald-50/90">
                              Anexos: {msg.attachmentNames.join(', ')}
                            </div>
                          )}
                        </div>
                        <div className="text-[10px] text-[#71717A] font-mono tabular-nums pr-1">
                          Você · {timeLabel}
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-[#25252A] border border-[#34343B] flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                        <UserIcon className="w-4 h-4" />
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="flex items-start justify-start gap-3 animate-blur-in">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="max-w-[86%] sm:max-w-[82%] space-y-1.5">
                      <div className="rounded-2xl rounded-tl-sm px-4 sm:px-5 py-3.5 text-[13px] leading-relaxed bg-[#1E1E23] border border-[#2D2D34] text-[#E4E4E7]">
                        {renderFormattedText(msg.text)}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-[#71717A] pl-1">
                        <span className="font-mono tabular-nums">
                          {msg.model || 'ICEVES Inteligência'}
                          {msg.effort ? ` · ${msg.effort}` : ''} · {timeLabel}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.text)}
                          className="inline-flex items-center gap-1 hover:text-zinc-300 transition cursor-pointer"
                          title="Copiar resposta"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copiar</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {isLoading && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm px-4 py-3 bg-[#1E1E23] border border-[#2D2D34] text-xs text-zinc-400 flex items-center gap-2">
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:-0.2s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:-0.1s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" />
                    </span>
                    <span>Consultando dados autorizados e gerando análise...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Dismissible Error Notice */}
        {error && (
          <div className="px-4 sm:px-8 pb-2 shrink-0">
            <div className="max-w-3xl mx-auto px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="truncate">{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="p-1 rounded-lg hover:bg-rose-500/20 text-rose-300 transition cursor-pointer shrink-0"
                aria-label="Fechar aviso"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Composer Dock */}
        <div className="px-4 sm:px-6 pt-3 pb-4 border-t border-[#242429] bg-[#141417]/95 flex flex-col items-center gap-2 shrink-0">
          <PromptInput
            value={input}
            onChange={setInput}
            onSubmit={(val, meta) => handleSend(val, meta)}
            onVoiceError={(msg) => setError(msg)}
            placeholder="Pergunte sobre vendas, estoque ou consumo..."
            models={['Gemini ICEVES', 'Análise Rápida', 'Resumo Executivo']}
            efforts={['Objetiva', 'Equilibrada', 'Detalhada']}
            disabled={isLoading || !isOnline}
            collapsedMaxWidth={460}
            expandedMaxWidth={680}
          />
          <p className="text-[11px] text-[#71717A] text-center">
            Enter para enviar · Shift + Enter para quebrar linha · Somente leitura
          </p>
        </div>
      </div>
    </div>
  );
}
