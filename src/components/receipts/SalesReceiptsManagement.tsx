import React, { useMemo, useState } from 'react';
import {
  FileText,
  Search,
  Printer,
  Download,
  Eye,
  RotateCcw,
  Filter,
  CopyCheck,
  Receipt as ReceiptIcon,
  Calendar,
} from 'lucide-react';
import { PaymentMethod, ReceiptStatus, SalesReceipt, SystemSettings } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { ReceiptPreviewModal } from './ReceiptPreviewModal';
import { downloadReceiptPdf } from '../../utils/receiptPdf';
import { api } from '../../services/api';

interface SalesReceiptsManagementProps {
  receipts: SalesReceipt[];
  settings: SystemSettings | null;
  onReceiptUpdated: (receipt: SalesReceipt) => void;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CONTA_ALUNO: 'Conta do Aluno',
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  CARTAO_CREDITO: 'Cartão Crédito',
  CARTAO_DEBITO: 'Cartão Débito',
  MERCADO_PAGO: 'Mercado Pago',
};

export function SalesReceiptsManagement({
  receipts,
  settings,
  onReceiptUpdated,
}: SalesReceiptsManagementProps) {
  const [search, setSearch] = useState('');
  const [classGroupFilter, setClassGroupFilter] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [previewState, setPreviewState] = useState<{
    receipt: SalesReceipt;
    isSecondCopy: boolean;
    mode: 'SALE' | 'REVERSAL';
  } | null>(null);

  const uniqueOperators = useMemo(
    () => Array.from(new Set(receipts.map((r) => r.operational.operatorUserName))).sort(),
    [receipts]
  );

  const uniqueClassGroups = useMemo(
    () =>
      Array.from(
        new Set(receipts.map((r) => r.studentSnapshot.classGroup).filter(Boolean) as string[])
      ).sort(),
    [receipts]
  );

  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter((r) => {
      if (q) {
        const hit =
          r.receiptCode.toLowerCase().includes(q) ||
          r.saleId.toLowerCase().includes(q) ||
          r.studentSnapshot.name.toLowerCase().includes(q) ||
          r.studentSnapshot.registrationNumber.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (classGroupFilter && r.studentSnapshot.classGroup !== classGroupFilter) return false;
      if (operatorFilter && r.operational.operatorUserName !== operatorFilter) return false;
      if (paymentMethodFilter && !r.payments.some((p) => p.method === paymentMethodFilter)) {
        return false;
      }
      if (statusFilter && r.status !== statusFilter) return false;
      if (startDate && r.saleSnapshot.saoPauloDate < startDate) return false;
      if (endDate && r.saleSnapshot.saoPauloDate > endDate) return false;
      return true;
    });
  }, [receipts, search, classGroupFilter, operatorFilter, paymentMethodFilter, statusFilter, startDate, endDate]);

  const metrics = useMemo(() => {
    const active = filteredReceipts.filter((r) => r.status === 'ATIVO');
    const reversed = filteredReceipts.filter((r) => r.status !== 'ATIVO');
    const totalValue = filteredReceipts.reduce(
      (acc, r) => acc + (r.status === 'ESTORNADO' || r.status === 'CANCELADO' ? 0 : r.financialSummary.saleTotal),
      0
    );
    const totalReprints = filteredReceipts.reduce((acc, r) => acc + (r.reprintCount || 0), 0);
    return {
      total: filteredReceipts.length,
      activeCount: active.length,
      reversedCount: reversed.length,
      totalValue,
      totalReprints,
    };
  }, [filteredReceipts]);

  const handleQuickPdf = async (receipt: SalesReceipt) => {
    try {
      const updated = await api.recordReceiptAction(receipt.id, 'PDF');
      onReceiptUpdated(updated);
    } catch {
      // ignore if offline
    }
    await downloadReceiptPdf(receipt, settings, {
      isSecondCopy: receipt.reprintCount > 0,
      mode: 'SALE',
    });
  };

  const renderStatusPill = (status: ReceiptStatus) => {
    const styles: Record<ReceiptStatus, string> = {
      ATIVO: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
      PARCIALMENTE_ESTORNADO: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
      ESTORNADO: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
      CANCELADO: 'bg-zinc-700/30 text-zinc-300 border-zinc-600/40',
    };
    const labels: Record<ReceiptStatus, string> = {
      ATIVO: 'Ativo',
      PARCIALMENTE_ESTORNADO: 'Estorno Parcial',
      ESTORNADO: 'Estornado',
      CANCELADO: 'Cancelado',
    };
    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const clearFilters = () => {
    setSearch('');
    setClassGroupFilter('');
    setOperatorFilter('');
    setPaymentMethodFilter('');
    setStatusFilter('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-[#111111] p-5 rounded-2xl border border-white/[0.08] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <ReceiptIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Recibos de Vendas & Comprovantes
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Histórico imutável de comprovantes emitidos no PDV, reimpressão de 2ª via, PDFs e comprovantes de estorno.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[#161619] p-4 rounded-xl border border-white/[0.07]">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold block">
            Recibos Emitidos
          </span>
          <span className="text-xl font-bold text-white font-mono tabular-nums mt-1 block">
            {metrics.total}
          </span>
          <span className="text-[11px] text-zinc-500">{metrics.activeCount} ativos</span>
        </div>

        <div className="bg-[#161619] p-4 rounded-xl border border-white/[0.07]">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold block">
            Volume Comprovado
          </span>
          <span className="text-xl font-bold text-emerald-400 font-mono tabular-nums mt-1 block">
            {formatCurrency(metrics.totalValue)}
          </span>
          <span className="text-[11px] text-zinc-500">Vendas ativas no filtro</span>
        </div>

        <div className="bg-[#161619] p-4 rounded-xl border border-white/[0.07]">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold block">
            Estornos / Cancelamentos
          </span>
          <span className="text-xl font-bold text-rose-400 font-mono tabular-nums mt-1 block">
            {metrics.reversedCount}
          </span>
          <span className="text-[11px] text-zinc-500">Com histórico preservado</span>
        </div>

        <div className="bg-[#161619] p-4 rounded-xl border border-white/[0.07]">
          <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold block">
            Reimpressões (2ª Via)
          </span>
          <span className="text-xl font-bold text-zinc-100 font-mono tabular-nums mt-1 block">
            {metrics.totalReprints}
          </span>
          <span className="text-[11px] text-zinc-500">Auditadas em log</span>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#161619] p-4 rounded-2xl border border-white/[0.08] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
            <Filter className="w-3.5 h-3.5 text-emerald-400" />
            <span>Filtros de Pesquisa</span>
          </div>
          {(search || classGroupFilter || operatorFilter || paymentMethodFilter || statusFilter || startDate || endDate) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Código recibo, venda, aluno..."
              className="w-full pl-8 pr-3 py-2 bg-[#111114] border border-white/[0.08] rounded-xl text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={classGroupFilter}
            onChange={(e) => setClassGroupFilter(e.target.value)}
            className="px-3 py-2 bg-[#111114] border border-white/[0.08] rounded-xl text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Todas as turmas</option>
            {uniqueClassGroups.map((cg) => (
              <option key={cg} value={cg}>
                {cg}
              </option>
            ))}
          </select>

          <select
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(e.target.value)}
            className="px-3 py-2 bg-[#111114] border border-white/[0.08] rounded-xl text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Todos os operadores</option>
            {uniqueOperators.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>

          <select
            value={paymentMethodFilter}
            onChange={(e) => setPaymentMethodFilter(e.target.value)}
            className="px-3 py-2 bg-[#111114] border border-white/[0.08] rounded-xl text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Todas as formas de pagamento</option>
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((pm) => (
              <option key={pm} value={pm}>
                {PAYMENT_LABELS[pm]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[#111114] border border-white/[0.08] rounded-xl text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Todos os status</option>
            <option value="ATIVO">Ativo</option>
            <option value="PARCIALMENTE_ESTORNADO">Parcialmente Estornado</option>
            <option value="ESTORNADO">Estornado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>

          <div className="flex items-center gap-2 bg-[#111114] border border-white/[0.08] rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="text-[11px] text-zinc-400 shrink-0">De:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-zinc-200 text-xs w-full focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 bg-[#111114] border border-white/[0.08] rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="text-[11px] text-zinc-400 shrink-0">Até:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-zinc-200 text-xs w-full focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#161619] rounded-2xl border border-white/[0.08] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111114] text-zinc-400 font-semibold uppercase tracking-wider border-b border-white/[0.08]">
              <tr>
                <th className="py-3 px-4">Recibo / Venda</th>
                <th className="py-3 px-4">Aluno / Turma</th>
                <th className="py-3 px-4">Data / Hora (BRT)</th>
                <th className="py-3 px-4">Operador</th>
                <th className="py-3 px-4">Pagamento</th>
                <th className="py-3 px-4 text-right">Valor</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredReceipts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500">
                    <FileText className="w-7 h-7 mx-auto mb-2 text-zinc-600" />
                    Nenhum recibo encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredReceipts.map((rec) => (
                  <tr key={rec.id} className="hover:bg-white/[0.02] transition">
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-emerald-400 block">{rec.receiptCode}</span>
                      <span className="font-mono text-[11px] text-zinc-400">{rec.saleId}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-white block">{rec.studentSnapshot.name}</span>
                      <span className="text-[11px] text-zinc-400">
                        {rec.studentSnapshot.registrationNumber}
                        {rec.studentSnapshot.classGroup ? ` • ${rec.studentSnapshot.classGroup}` : ''}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <span className="text-zinc-200 block">{rec.saleSnapshot.saoPauloDate.split('-').reverse().join('/')}</span>
                      <span className="text-[11px] text-zinc-500">{rec.saleSnapshot.saoPauloTime}</span>
                    </td>
                    <td className="py-3 px-4 text-zinc-300">{rec.operational.operatorUserName}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-1">
                        {rec.payments.map((p, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 rounded bg-white/[0.05] text-zinc-200 text-[10px] font-medium"
                          >
                            {PAYMENT_LABELS[p.method] || p.method}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                      <span className={rec.status === 'ESTORNADO' ? 'line-through text-zinc-500' : 'text-white'}>
                        {formatCurrency(rec.financialSummary.saleTotal)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        {renderStatusPill(rec.status)}
                        {rec.reprintCount > 0 && (
                          <span className="block text-[10px] text-zinc-500 font-mono">
                            {rec.reprintCount} reimpressão(ões)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewState({ receipt: rec, isSecondCopy: false, mode: 'SALE' })
                          }
                          title="Abrir Recibo"
                          className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewState({ receipt: rec, isSecondCopy: true, mode: 'SALE' })
                          }
                          title="Reimprimir 2ª Via"
                          className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-emerald-500/20 text-emerald-400 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickPdf(rec)}
                          title="Baixar PDF"
                          className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {rec.reversals.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewState({ receipt: rec, isSecondCopy: false, mode: 'REVERSAL' })
                            }
                            title="Comprovante de Estorno"
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewState && (
        <ReceiptPreviewModal
          receipt={previewState.receipt}
          settings={settings}
          isSecondCopy={previewState.isSecondCopy}
          initialMode={previewState.mode}
          onReceiptUpdated={onReceiptUpdated}
          onClose={() => setPreviewState(null)}
        />
      )}
    </div>
  );
}
