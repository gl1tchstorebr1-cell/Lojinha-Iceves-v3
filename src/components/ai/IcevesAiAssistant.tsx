import React, { useState } from 'react';
import { Sparkles, Send, ShieldCheck, AlertCircle, Bot, User as UserIcon, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  model?: string;
}

const QUICK_PROMPTS_STAFF = [
  'Quanto vendemos hoje e qual foi o ticket médio do mês?',
  'Quais produtos estão com estoque baixo ou sem estoque?',
  'Quais são os produtos mais vendidos e os sem giro?',
  'Quem tem pagamento ou consumo pendente no momento?',
  'Gere um resumo financeiro geral da Lojinha Iceves agora.',
];

const QUICK_PROMPTS_PORTAL = [
  'Qual é o meu saldo atual de consumo na Lojinha?',
  'Tenho faturas em aberto ou pendentes?',
  'Quais foram as compras mais recentes registradas?',
];

export function IcevesAiAssistant() {
  const { user, isStudent, isGuardian } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quickPrompts = isStudent || isGuardian ? QUICK_PROMPTS_PORTAL : QUICK_PROMPTS_STAFF;

  const handleSend = async (promptText?: string) => {
    const question = (promptText ?? input).trim();
    if (!question || isLoading) return;

    if (!isOnline) {
      setError('O assistente ICEVES Inteligência requer conexão ativa com o servidor.');
      return;
    }

    setError(null);
    if (!promptText) setInput('');

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: question,
      timestamp: new Date().toISOString(),
    };

    const nextMessages = [...messages, userTurn];
    setMessages(nextMessages);
    setIsLoading(true);

    try {
      const historyPayload = messages.slice(-6).map(m => ({ role: m.role, text: m.text }));
      const res = await api.askIcevesAi({
        question,
        history: historyPayload,
      });

      const modelTurn: ChatTurn = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: res.answer,
        timestamp: res.generatedAt,
        model: res.model,
      };
      setMessages(prev => [...prev, modelTurn]);
    } catch (err: any) {
      setError(err.message || 'Não foi possível consultar o ICEVES Inteligência.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-teal-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-[#F5F5F5] tracking-tight">
                ICEVES INTELIGÊNCIA
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Somente Leitura • Escopo {user?.role}
              </span>
            </div>
            <p className="text-xs text-[#A1A1AA] mt-0.5">
              Consulte vendas, estoque baixo, consumo individual e indicadores em linguagem natural com base exclusiva nos dados autorizados do sistema.
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            className="px-3 py-1.5 rounded-xl bg-[#222222] hover:bg-[#2C2C2C] border border-[#303030] text-xs font-semibold text-zinc-300 flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar conversa
          </button>
        )}
      </div>

      {/* Quick Prompts */}
      <div className="flex flex-wrap gap-2">
        {quickPrompts.map((q) => (
          <button
            key={q}
            type="button"
            disabled={isLoading}
            onClick={() => handleSend(q)}
            className="px-3 py-1.5 rounded-xl bg-[#181818] hover:bg-emerald-500/15 border border-[#2C2C2C] hover:border-emerald-500/35 text-xs text-zinc-200 transition cursor-pointer disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Conversation Area */}
      <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] flex flex-col min-h-[420px] max-h-[600px]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto text-emerald-400">
                <Bot className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="font-bold text-sm text-white">Pronto para analisar a Lojinha Iceves</h3>
                <p className="text-xs text-[#A1A1AA]">
                  Clique em uma pergunta sugerida acima ou escreva sua dúvida abaixo. Todas as respostas usam apenas dados reais permitidos para o seu perfil e nunca alteram registros.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Processamento seguro via servidor • Consultas auditadas</span>
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'model' && (
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white font-medium'
                      : 'bg-[#141414] border border-[#2C2C2C] text-zinc-200'
                  }`}
                >
                  {msg.text}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-[#252525] border border-[#353535] flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Sparkles className="w-4 h-4 animate-pulse" />
              </div>
              <span className="animate-pulse">Consultando dados autorizados e gerando análise...</span>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-3.5 border-t border-[#262626] flex items-center gap-2 bg-[#141414] rounded-b-2xl"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre vendas, estoque baixo, consumo ou fechamento..."
            disabled={isLoading || !isOnline}
            className="flex-1 px-3.5 py-2.5 bg-[#1B1B1B] border border-[#2E2E2E] rounded-xl text-xs text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim() || !isOnline}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Consultar</span>
          </button>
        </form>
      </div>
    </div>
  );
}
