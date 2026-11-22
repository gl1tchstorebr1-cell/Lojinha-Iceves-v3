import React, { useState, useMemo } from 'react';
import {
  History,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  FileText,
  Calendar,
  Users,
  Layers
} from 'lucide-react';
import { BillingBatch, BillingBatchType, Invoice } from '../../types';
import { formatCurrency, formatDate, formatDateTime, formatPeriod } from '../../utils/formatters';

interface BillingBatchesHistoryProps {
  batches: BillingBatch[];
  invoices: Invoice[];
  onInspectInvoice: (invoice: Invoice) => void;
}

export function BillingBatchesHistory({
  batches,
  invoices,
  onInspectInvoice
}: BillingBatchesHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'TODOS' | BillingBatchType>('TODOS');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | BillingBatch['status']>('TODOS');
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);

  const filteredBatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return batches.filter(b => {
      if (typeFilter !== 'TODOS' && b.type !== typeFilter) return false;
      if (statusFilter !== 'TODOS' && b.status !== statusFilter) return false;
      if (!q) return true;
      const relatedInvs = invoices.filter(i => b.invoiceIds.includes(i.id));
      const matchesInv = relatedInvs.some(
        i => i.id.toLowerCase().includes(q) || i.studentName.toLowerCase().includes(q)
      );
      return (
        b.id.toLowerCase().includes(q) ||
        b.billingPeriod.toLowerCase().includes(q) ||
        (b.billingLabel || '').toLowerCase().includes(q) ||
        b.createdByUserName.toLowerCase().includes(q) ||
        matchesInv
      );
    });
  }, [batches, invoices, searchQuery, typeFilter, statusFilter]);

  const getTypeBadge = (type: BillingBatchType) => {
    switch (type) {
      case 'INDIVIDUAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            Individual
          </span>
        );
      case 'PERIODO_PERSONALIZADO':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20">
            Período Personalizado
          </span>
        );
      case 'FECHAMENTO_MENSAL':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Fechamento Mensal
          </span>
        );
    }
  };

  const getStatusBadge = (status: BillingBatch['status']) => {
    switch (status) {
      case 'CANCELADO':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Cancelado
          </span>
        );
      case 'PARCIALMENTE_CANCELADO':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Parcialmente Cancelado
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Concluído
          </span>
        );
    }
  };

  return (
    <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-[#F5F5F5] flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            Histórico de Operações e Lotes de Faturamento ({filteredBatches.length})
          </h3>
          <p className="text-xs text-[#A1A1AA] mt-0.5">
            Rastreabilidade completa de lançamentos individuais, lotes por período personalizado e fechamentos mensais.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar lote, aluno, responsável..."
              className="pl-8 pr-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5] w-56 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs font-semibold text-[#F5F5F5]"
          >
            <option value="TODOS">Todos os Tipos</option>
            <option value="INDIVIDUAL">Individual</option>
            <option value="PERIODO_PERSONALIZADO">Período Personalizado</option>
            <option value="FECHAMENTO_MENSAL">Fechamento Mensal</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs font-semibold text-[#F5F5F5]"
          >
            <option value="TODOS">Todos os Status</option>
            <option value="CONCLUIDO">Concluído</option>
            <option value="PARCIALMENTE_CANCELADO">Parcialmente Cancelado</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
      </div>

      {filteredBatches.length === 0 ? (
        <div className="py-12 text-center text-xs text-[#71717A] border border-dashed border-[#2C2C2C] rounded-xl">
          Nenhum lote de faturamento registrado ainda para os filtros selecionados.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredBatches.map(batch => {
            const isExpanded = expandedBatchId === batch.id;
            const batchInvoices = invoices.filter(i => batch.invoiceIds.includes(i.id));

            return (
              <div key={batch.id} className="rounded-xl bg-[#141414] border border-[#262626] overflow-hidden">
                <div
                  onClick={() => setExpandedBatchId(isExpanded ? null : batch.id)}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-[#191919] transition"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-[#F5F5F5]">{batch.id}</span>
                      {getTypeBadge(batch.type)}
                      {getStatusBadge(batch.status)}
                      {batch.billingLabel && (
                        <span className="text-[11px] text-emerald-300 font-semibold">• {batch.billingLabel}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#A1A1AA]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#71717A]" />
                        {batch.periodStart && batch.periodEnd
                          ? `${formatDate(batch.periodStart)} a ${formatDate(batch.periodEnd)}`
                          : formatPeriod(batch.billingPeriod)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-[#71717A]" />
                        {batch.studentsCount} aluno(s) • {batch.invoicesCount} fatura(s) • {batch.salesCount} venda(s)
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-[#71717A]" />
                        Por: <strong className="text-[#E4E4E7]">{batch.createdByUserName}</strong> em {formatDateTime(batch.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-3">
                    <div className="text-right">
                      <span className="text-[10px] uppercase text-[#71717A] block">Valor Total do Lote</span>
                      <span className="font-mono text-sm font-black text-emerald-400 tabular-nums">
                        {formatCurrency(batch.totalAmount)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg bg-[#222222] text-[#A1A1AA] hover:text-white"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-[#242424] bg-[#101010] space-y-2">
                    <span className="text-[11px] font-bold text-[#A1A1AA] block">
                      Faturas emitidas neste lote ({batchInvoices.length}):
                    </span>
                    {batchInvoices.length === 0 ? (
                      <p className="text-xs text-[#71717A]">Faturas deste lote foram removidas ou não estão mais listadas.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {batchInvoices.map(inv => (
                          <div
                            key={inv.id}
                            className="p-2.5 rounded-xl bg-[#161616] border border-[#262626] flex items-center justify-between gap-2"
                          >
                            <div>
                              <div className="flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="font-mono text-xs font-bold text-[#F5F5F5]">{inv.id}</span>
                                <span className="text-[10px] text-[#71717A]">({inv.status})</span>
                              </div>
                              <span className="text-[11px] text-[#A1A1AA] block mt-0.5">
                                {inv.studentName} • {inv.salesIds.length} venda(s) • Venc: {formatDate(inv.dueDate)}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
                                {formatCurrency(inv.grossTotal)}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onInspectInvoice(inv);
                                }}
                                className="px-2 py-1 rounded-lg bg-[#222222] hover:bg-[#2C2C2C] text-emerald-400 text-[10px] font-bold flex items-center gap-1 border border-[#303030] cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                Ver
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
