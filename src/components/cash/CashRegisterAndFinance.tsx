import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wallet,
  LockOpen,
  Lock,
  PlusCircle,
  MinusCircle,
  Printer,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Receipt
} from 'lucide-react';
import { CashMovement, CashRegisterSession, PaymentMethod, Sale } from '../../types';
import { api } from '../../services/api';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

interface CashRegisterAndFinanceProps {
  sales: Sale[];
  onCashUpdated?: () => void;
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CONTA_ALUNO: 'Conta do Aluno',
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_CREDITO: 'Cartão Crédito',
  CARTAO_DEBITO: 'Cartão Débito',
  MERCADO_PAGO: 'Mercado Pago',
};

export function CashRegisterAndFinance({ sales, onCashUpdated }: CashRegisterAndFinanceProps) {
  const { isViewer } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [activeSession, setActiveSession] = useState<CashRegisterSession | null>(null);
  const [sessions, setSessions] = useState<CashRegisterSession[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Open Cash Modal/Form
  const [openingBalance, setOpeningBalance] = useState('0');
  const [openingNotes, setOpeningNotes] = useState('');
  const [isOpening, setIsOpening] = useState(false);

  // Movement Form
  const [movType, setMovType] = useState<'SUPRIMENTO' | 'SANGRIA' | 'RECEITA' | 'DESPESA'>('SUPRIMENTO');
  const [movAmount, setMovAmount] = useState('');
  const [movMethod, setMovMethod] = useState<PaymentMethod>('DINHEIRO');
  const [movDesc, setMovDesc] = useState('');
  const [isAddingMov, setIsAddingMov] = useState(false);

  // Close Cash Form
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [countedBalance, setCountedBalance] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  const loadCash = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getCashState();
      setActiveSession(data.activeSession);
      setSessions(data.sessions || []);
      setMovements(data.movements || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar informações de caixa.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCash();
  }, [loadCash]);

  const activeMovements = useMemo(() => {
    if (!activeSession) return [];
    return movements.filter(m => m.sessionId === activeSession.id);
  }, [activeSession, movements]);

  const activeSummary = useMemo(() => {
    if (!activeSession) {
      return {
        expectedCash: 0,
        suprimentos: 0,
        sangrias: 0,
        receitas: 0,
        despesas: 0,
        byMethod: {} as Record<PaymentMethod, number>,
        totalSessionSales: 0,
      };
    }

    let expectedCash = Number(activeSession.openingBalance) || 0;
    let suprimentos = 0;
    let sangrias = 0;
    let receitas = 0;
    let despesas = 0;
    const byMethod: Record<PaymentMethod, number> = {
      CONTA_ALUNO: 0,
      DINHEIRO: 0,
      PIX: 0,
      CARTAO_CREDITO: 0,
      CARTAO_DEBITO: 0,
      MERCADO_PAGO: 0,
    };

    for (const m of activeMovements) {
      if (m.type === 'SUPRIMENTO') {
        suprimentos += m.amount;
        if (m.paymentMethod === 'DINHEIRO') expectedCash += m.amount;
      } else if (m.type === 'RECEITA') {
        receitas += m.amount;
        if (m.paymentMethod === 'DINHEIRO') expectedCash += m.amount;
      } else if (m.type === 'SANGRIA') {
        sangrias += m.amount;
        if (m.paymentMethod === 'DINHEIRO') expectedCash -= m.amount;
      } else if (m.type === 'DESPESA') {
        despesas += m.amount;
        if (m.paymentMethod === 'DINHEIRO') expectedCash -= m.amount;
      } else if (m.type === 'VENDA_DINHEIRO') {
        expectedCash += m.amount;
        byMethod.DINHEIRO += m.amount;
      } else if (m.type === 'VENDA_PIX') {
        byMethod.PIX += m.amount;
      } else if (m.type === 'VENDA_CARTAO') {
        if (m.paymentMethod === 'CARTAO_DEBITO') byMethod.CARTAO_DEBITO += m.amount;
        else byMethod.CARTAO_CREDITO += m.amount;
      } else if (m.type === 'VENDA_MERCADO_PAGO') {
        byMethod.MERCADO_PAGO += m.amount;
      } else if (m.type === 'VENDA_CONTA_ALUNO') {
        byMethod.CONTA_ALUNO += m.amount;
      } else if (m.type === 'ESTORNO') {
        if (m.paymentMethod === 'DINHEIRO') expectedCash -= m.amount;
        if (m.paymentMethod && byMethod[m.paymentMethod] !== undefined) {
          byMethod[m.paymentMethod] = Math.max(0, byMethod[m.paymentMethod] - m.amount);
        }
      }
    }

    const totalSessionSales = Object.values(byMethod).reduce((a, b) => a + b, 0);

    return {
      expectedCash: Math.round(expectedCash * 100) / 100,
      suprimentos: Math.round(suprimentos * 100) / 100,
      sangrias: Math.round(sangrias * 100) / 100,
      receitas: Math.round(receitas * 100) / 100,
      despesas: Math.round(despesas * 100) / 100,
      byMethod,
      totalSessionSales: Math.round(totalSessionSales * 100) / 100,
    };
  }, [activeSession, activeMovements]);

  // Consolidated payment distribution for completed sales today / all time
  const todayPaymentTotals = useMemo(() => {
    const todayStr = new Date().toISOString().substring(0, 10);
    const todaySales = sales.filter(s => s.status === 'COMPLETED' && s.createdAt.startsWith(todayStr));
    const map: Record<PaymentMethod, { count: number; total: number }> = {
      CONTA_ALUNO: { count: 0, total: 0 },
      DINHEIRO: { count: 0, total: 0 },
      PIX: { count: 0, total: 0 },
      CARTAO_CREDITO: { count: 0, total: 0 },
      CARTAO_DEBITO: { count: 0, total: 0 },
      MERCADO_PAGO: { count: 0, total: 0 },
    };
    for (const s of todaySales) {
      const pm = s.paymentMethod || 'CONTA_ALUNO';
      map[pm].count += 1;
      map[pm].total = Math.round((map[pm].total + s.total) * 100) / 100;
    }
    return map;
  }, [sales]);

  const handleOpenCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || isViewer) return;
    setIsOpening(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const val = parseFloat(openingBalance.replace(',', '.')) || 0;
      await api.openCashSession({ openingBalance: val, notes: openingNotes });
      setOpeningBalance('0');
      setOpeningNotes('');
      setSuccessMsg('Caixa aberto com sucesso! Todas as vendas já estão vinculadas a esta sessão.');
      await loadCash();
      onCashUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Erro ao abrir caixa.');
    } finally {
      setIsOpening(false);
    }
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || isViewer) return;
    setIsAddingMov(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const val = parseFloat(movAmount.replace(',', '.')) || 0;
      await api.addCashMovement({
        type: movType,
        amount: val,
        description: movDesc,
        paymentMethod: movMethod,
      });
      setMovAmount('');
      setMovDesc('');
      setSuccessMsg(`${movType} registrado com sucesso.`);
      await loadCash();
      onCashUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar movimentação.');
    } finally {
      setIsAddingMov(false);
    }
  };

  const handleCloseCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline || isViewer) return;
    setIsClosing(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const val = parseFloat(countedBalance.replace(',', '.')) || 0;
      await api.closeCashSession({ countedBalance: val, notes: closingNotes });
      setShowCloseModal(false);
      setCountedBalance('');
      setClosingNotes('');
      setSuccessMsg('Caixa fechado e conferido com sucesso!');
      await loadCash();
      onCashUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Erro ao fechar caixa.');
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Wallet className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-extrabold text-[#F5F5F5] tracking-tight">
              Caixa & Financeiro — Abertura, Sangria, Suprimento & Fechamento
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Controle de turno, conferência de espécie, despesas, receitas e fechamento diário auditado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-xl bg-[#222222] hover:bg-[#2B2B2B] border border-[#323232] text-xs font-bold text-[#F5F5F5] flex items-center gap-1.5 cursor-pointer transition"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-400" />
            Imprimir Fechamento Diário
          </button>

          <button
            type="button"
            onClick={loadCash}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-[#151515] hover:bg-[#222222] border border-[#2C2C2C] text-xs font-semibold text-[#A1A1AA] hover:text-white flex items-center gap-1.5 cursor-pointer transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Active Session Status Card OR Open Cash Form */}
      {activeSession ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Active Summary (7 cols) */}
          <div className="lg:col-span-7 card-borda-conica">
            <div className="conteudo bg-[#1B1B1B] border border-emerald-500/30 p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#262626] pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <LockOpen className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-white">Caixa Aberto — {activeSession.id}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      EM OPERAÇÃO
                    </span>
                  </div>
                  <p className="text-[11px] text-[#A1A1AA]">
                    Aberto por {activeSession.openedByUserName} em {formatDateTime(activeSession.openedAt)}
                  </p>
                </div>
              </div>

              {!isViewer && (
                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={() => {
                    setCountedBalance(activeSummary.expectedCash.toFixed(2));
                    setShowCloseModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 no-print"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Fechar Caixa
                </button>
              )}
            </div>

            {/* Cash Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#141414] border border-[#262626]">
                <span className="text-[10px] uppercase font-bold text-[#71717A] block">Saldo Inicial</span>
                <span className="text-base font-extrabold text-white font-mono mt-0.5 block">
                  {formatCurrency(activeSession.openingBalance)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#141414] border border-emerald-500/25">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block">Esperado em Espécie</span>
                <span className="text-base font-extrabold text-emerald-300 font-mono mt-0.5 block">
                  {formatCurrency(activeSummary.expectedCash)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#141414] border border-[#262626]">
                <span className="text-[10px] uppercase font-bold text-[#71717A] block">Vendas no Turno</span>
                <span className="text-base font-extrabold text-white font-mono mt-0.5 block">
                  {formatCurrency(activeSummary.totalSessionSales)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#141414] border border-[#262626]">
                <span className="text-[10px] uppercase font-bold text-teal-400 block">Suprimentos + Receitas</span>
                <span className="text-sm font-bold text-teal-300 font-mono mt-0.5 block">
                  + {formatCurrency(activeSummary.suprimentos + activeSummary.receitas)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#141414] border border-[#262626]">
                <span className="text-[10px] uppercase font-bold text-rose-400 block">Sangrias + Despesas</span>
                <span className="text-sm font-bold text-rose-300 font-mono mt-0.5 block">
                  - {formatCurrency(activeSummary.sangrias + activeSummary.despesas)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#141414] border border-[#262626]">
                <span className="text-[10px] uppercase font-bold text-[#71717A] block">Lançamentos</span>
                <span className="text-sm font-bold text-white font-mono mt-0.5 block">
                  {activeMovements.length} mov.
                </span>
              </div>
            </div>

            {/* Totals by payment method in active session */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#D4D4D8] uppercase tracking-wider">
                Total por Forma de Pagamento (Turno Atual)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(pm => (
                  <div key={pm} className="p-2.5 rounded-xl bg-[#141414] border border-[#252525] flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#A1A1AA] truncate">{PAYMENT_METHOD_LABELS[pm]}</span>
                    <span className="font-mono font-bold text-white shrink-0">
                      {formatCurrency(activeSummary.byMethod[pm] || 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            </div>
          </div>

          {/* Add Cash Movement (5 cols) */}
          <div className="lg:col-span-5 bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4 no-print">
            <div className="flex items-center gap-2 border-b border-[#262626] pb-3">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">Nova Movimentação Financeira</h3>
            </div>

            <form onSubmit={handleAddMovement} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'SUPRIMENTO', label: '+ Suprimento', cls: 'border-emerald-500 bg-emerald-500/15 text-emerald-300' },
                    { id: 'SANGRIA', label: '- Sangria', cls: 'border-rose-500 bg-rose-500/15 text-rose-300' },
                    { id: 'RECEITA', label: '+ Receita Avulsa', cls: 'border-teal-500 bg-teal-500/15 text-teal-300' },
                    { id: 'DESPESA', label: '- Despesa', cls: 'border-amber-500 bg-amber-500/15 text-amber-300' },
                  ] as const
                ).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMovType(opt.id)}
                    className={`p-2 rounded-xl border font-bold text-center cursor-pointer transition ${
                      movType === opt.id
                        ? opt.cls
                        : 'bg-[#141414] border-[#282828] text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-[#D4D4D8] mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={movAmount}
                    onChange={(e) => setMovAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-white font-mono font-bold focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#D4D4D8] mb-1">Meio</label>
                  <select
                    value={movMethod}
                    onChange={(e) => setMovMethod(e.target.value as PaymentMethod)}
                    className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="DINHEIRO">Dinheiro (Espécie)</option>
                    <option value="PIX">PIX</option>
                    <option value="CARTAO_DEBITO">Cartão Débito</option>
                    <option value="CARTAO_CREDITO">Cartão Crédito</option>
                    <option value="MERCADO_PAGO">Mercado Pago</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#D4D4D8] mb-1">Justificativa / Descrição</label>
                <input
                  type="text"
                  required
                  value={movDesc}
                  onChange={(e) => setMovDesc(e.target.value)}
                  placeholder="Ex: Reforço de troco / Compra de embalagens..."
                  className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isAddingMov || !isOnline || isViewer}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold transition cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {movType === 'SUPRIMENTO' || movType === 'RECEITA' ? (
                  <PlusCircle className="w-4 h-4" />
                ) : (
                  <MinusCircle className="w-4 h-4" />
                )}
                <span>{isAddingMov ? 'Registrando...' : `Lançar ${movType}`}</span>
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* Open Cash Panel */
        <div className="card-borda-conica max-w-xl">
          <div className="conteudo bg-[#1B1B1B] border border-[#282828] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">Nenhum Caixa Aberto no Momento</h3>
              <p className="text-xs text-[#A1A1AA]">
                Abra um novo turno informando o fundo de troco inicial em espécie para iniciar a conferência diária.
              </p>
            </div>
          </div>

          <form onSubmit={handleOpenCash} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[#D4D4D8] mb-1">Fundo de Troco Inicial (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-white font-mono font-bold focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#D4D4D8] mb-1">Observações da Abertura</label>
                <input
                  type="text"
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  placeholder="Turno manhã / conferência inicial..."
                  className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isOpening || !isOnline || isViewer}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-40"
            >
              <LockOpen className="w-4 h-4" />
              <span>{isOpening ? 'Abrindo Caixa...' : 'Abrir Caixa Agora'}</span>
            </button>
          </form>
          </div>
        </div>
      )}

      {/* Today's Payment Totals Consolidated */}
      <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-3">
        <h3 className="font-bold text-sm text-white">Consolidado do Dia por Forma de Pagamento (Vendas Hoje)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(pm => (
            <div key={pm} className="p-3 rounded-xl bg-[#141414] border border-[#252525]">
              <span className="text-[10px] font-bold text-[#71717A] uppercase block truncate">
                {PAYMENT_METHOD_LABELS[pm]}
              </span>
              <span className="text-base font-extrabold text-white font-mono mt-1 block">
                {formatCurrency(todayPaymentTotals[pm].total)}
              </span>
              <span className="text-[10px] text-emerald-400">
                {todayPaymentTotals[pm].count} venda(s)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-white">Extrato de Movimentações de Caixa</h3>
            <p className="text-xs text-[#A1A1AA]">
              Registro completo de aberturas, vendas, suprimentos, sangrias, despesas e estornos.
            </p>
          </div>
          <span className="text-xs font-mono text-[#71717A]">{movements.length} registros</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
              <tr>
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Sessão</th>
                <th className="py-3 px-4">Tipo</th>
                <th className="py-3 px-4">Meio</th>
                <th className="py-3 px-4">Descrição</th>
                <th className="py-3 px-4">Responsável</th>
                <th className="py-3 px-4 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#242424]">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#71717A]">
                    Nenhuma movimentação de caixa registrada até o momento.
                  </td>
                </tr>
              ) : (
                movements.slice(0, 60).map(m => {
                  const isOutflow = m.type === 'SANGRIA' || m.type === 'DESPESA' || m.type === 'ESTORNO';
                  return (
                    <tr key={m.id} className="hover:bg-[#202020] transition">
                      <td className="py-2.5 px-4 font-mono text-[#A1A1AA]">{formatDateTime(m.timestamp)}</td>
                      <td className="py-2.5 px-4 font-mono text-[#71717A]">{m.sessionId}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isOutflow
                              ? 'bg-rose-500/10 text-rose-300 border-rose-500/25'
                              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                          }`}
                        >
                          {isOutflow ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                          {m.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-[#D4D4D8]">{(m.paymentMethod && PAYMENT_METHOD_LABELS[m.paymentMethod]) || m.paymentMethod || 'Dinheiro'}</td>
                      <td className="py-2.5 px-4 text-[#D4D4D8] max-w-xs truncate" title={m.description}>
                        {m.description}
                      </td>
                      <td className="py-2.5 px-4 text-[#A1A1AA]">{m.performedByUserName}</td>
                      <td className={`py-2.5 px-4 text-right font-mono font-bold ${isOutflow ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isOutflow ? '-' : '+'} {formatCurrency(m.amount)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Closed Sessions History */}
      {sessions.length > 0 && (
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h3 className="font-bold text-sm text-white">Histórico de Sessões de Caixa ({sessions.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-2.5 px-4">Sessão</th>
                  <th className="py-2.5 px-4">Abertura</th>
                  <th className="py-2.5 px-4">Fechamento</th>
                  <th className="py-2.5 px-4">Inicial</th>
                  <th className="py-2.5 px-4">Esperado</th>
                  <th className="py-2.5 px-4">Conferido</th>
                  <th className="py-2.5 px-4">Diferença</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {sessions.map(s => (
                  <tr key={s.id} className="hover:bg-[#202020]">
                    <td className="py-2.5 px-4 font-mono font-bold text-white">{s.id}</td>
                    <td className="py-2.5 px-4 text-[#A1A1AA]">
                      {formatDateTime(s.openedAt)} ({s.openedByUserName})
                    </td>
                    <td className="py-2.5 px-4 text-[#A1A1AA]">
                      {s.closedAt ? `${formatDateTime(s.closedAt)} (${s.closedByUserName})` : 'Em aberto'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-white">{formatCurrency(s.openingBalance)}</td>
                    <td className="py-2.5 px-4 font-mono text-white">
                      {s.expectedBalance !== undefined ? formatCurrency(s.expectedBalance) : '—'}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-white">
                      {s.countedBalance !== undefined ? formatCurrency(s.countedBalance) : '—'}
                    </td>
                    <td className={`py-2.5 px-4 font-mono font-bold ${
                      (s.difference || 0) === 0 ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {s.difference !== undefined ? formatCurrency(s.difference) : '—'}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        s.status === 'ABERTO'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-zinc-700/40 text-zinc-300 border border-zinc-600/40'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Close Cash Modal */}
      {showCloseModal && activeSession && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-[#1A1A1A] rounded-2xl border border-[#303030] max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#282828] pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-400" />
                <h3 className="font-bold text-white text-base">Fechar Caixa ({activeSession.id})</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="text-zinc-400 hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-zinc-400">Saldo Esperado em Espécie:</span>
                <strong className="font-mono text-emerald-400">{formatCurrency(activeSummary.expectedCash)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Total de Vendas no Turno:</span>
                <strong className="font-mono text-white">{formatCurrency(activeSummary.totalSessionSales)}</strong>
              </div>
            </div>

            <form onSubmit={handleCloseCash} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">Valor Contado em Espécie na Gaveta (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={countedBalance}
                  onChange={(e) => setCountedBalance(e.target.value)}
                  className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-white font-mono font-bold focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">Observações de Conferência</label>
                <textarea
                  rows={2}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Conferido sem divergências..."
                  className="w-full p-2.5 bg-[#141414] border border-[#2C2C2C] rounded-xl text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="flex-1 py-2 px-3 rounded-xl border border-[#303030] text-zinc-300 hover:bg-[#222222] cursor-pointer font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isClosing}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isClosing ? 'Fechando...' : 'Confirmar Fechamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
