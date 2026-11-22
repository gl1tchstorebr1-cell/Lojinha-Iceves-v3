import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  FileText,
  Calendar,
  AlertTriangle,
  Search,
  Download,
  Eye,
  Sliders,
  Trash2,
  ChevronDown,
  FileSpreadsheet,
  UserPlus,
  Layers,
  History,
  LayoutGrid,
  ArrowRight,
  Clock,
  CheckCircle2
} from 'lucide-react';
import {
  Invoice,
  InvoiceStatus,
  Student,
  Sale,
  SystemSettings,
  WhatsAppNotification,
  BillingBatch,
  UnbilledConsumptionOverview
} from '../../types';
import { formatCurrency, formatDate, formatPeriod } from '../../utils/formatters';
import {
  buildCombinedFinancialBackupCsvRows,
  buildInvoicesOnlyCsvRows,
  buildSalesOnlyCsvRows,
  downloadCsvFile,
  getExportDateSlug
} from '../../utils/csvExport';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { IndividualBillingWizard } from './IndividualBillingWizard';
import { PeriodBatchBillingPanel } from './PeriodBatchBillingPanel';
import { BillingBatchesHistory } from './BillingBatchesHistory';
import { InvoiceStatementModal } from './InvoiceStatementModal';

interface InvoicesAndClosingProps {
  invoices: Invoice[];
  students: Student[];
  sales?: Sale[];
  settings?: SystemSettings | null;
  whatsappNotifications?: WhatsAppNotification[];
  onInvoicesUpdated: () => void;
}

type MainSectionTab = 'overview' | 'issue' | 'closing' | 'batches';

export function InvoicesAndClosing({
  invoices,
  students,
  sales = [],
  whatsappNotifications = [],
  onInvoicesUpdated
}: InvoicesAndClosingProps) {
  const { user, isAdmin, canManage } = useAuth();

  const [activeArea, setActiveArea] = useState<MainSectionTab>('overview');
  const [issueMode, setIssueMode] = useState<'INDIVIDUAL' | 'PERIODO'>('INDIVIDUAL');
  const [preselectedStudentId, setPreselectedStudentId] = useState<string | null>(null);

  // Overview & Batches state
  const [unbilledOverview, setUnbilledOverview] = useState<UnbilledConsumptionOverview | null>(null);
  const [batches, setBatches] = useState<BillingBatch[]>([]);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);

  // Invoices list filters (inside Fechamento em Lote / Visão Geral)
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODAS');
  const [typeFilter, setTypeFilter] = useState<string>('TODOS');

  // Statement modal
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [startEditingModal, setStartEditingModal] = useState(false);

  // Clear all confirmation modal (no window.confirm)
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [globalNotice, setGlobalNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Offline CSV Backup Export state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  const loadOverviewAndBatches = useCallback(async () => {
    setIsLoadingOverview(true);
    try {
      const data = await api.getInvoicesOverview();
      setUnbilledOverview(data.unbilledOverview);
      setBatches(data.batches || []);
    } catch {
      // silent fallback
    } finally {
      setIsLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    loadOverviewAndBatches();
  }, [loadOverviewAndBatches, invoices.length, sales.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const refreshEverything = useCallback(() => {
    onInvoicesUpdated();
    loadOverviewAndBatches();
  }, [onInvoicesUpdated, loadOverviewAndBatches]);

  const openInvoiceDetails = (invoice: Invoice, startEditing = false) => {
    setSelectedInvoice(invoice);
    setStartEditingModal(startEditing);
  };

  const handleLaunchIndividualForStudent = (studentId: string) => {
    setPreselectedStudentId(studentId);
    setIssueMode('INDIVIDUAL');
    setActiveArea('issue');
  };

  const handleClearAllInvoices = async () => {
    setIsClearingAll(true);
    setGlobalNotice(null);
    try {
      const res = await api.clearAllInvoices();
      setShowClearAllConfirm(false);
      setSelectedInvoice(null);
      setGlobalNotice({
        type: 'success',
        text: `Todas as ${res.totalDeleted} faturas foram removidas e os saldos de consumo foram restaurados.`
      });
      refreshEverything();
    } catch (err: any) {
      setGlobalNotice({ type: 'error', text: err.message || 'Erro ao limpar faturas.' });
    } finally {
      setIsClearingAll(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return invoices.filter(inv => {
      const matchesSearch =
        !q ||
        inv.id.toLowerCase().includes(q) ||
        inv.studentName.toLowerCase().includes(q) ||
        inv.registrationNumber.toLowerCase().includes(q) ||
        (inv.batchId || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'TODAS' || inv.status === statusFilter;
      const invType = inv.billingType || 'FECHAMENTO_MENSAL';
      const matchesType = typeFilter === 'TODOS' || invType === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [invoices, invoiceSearch, statusFilter, typeFilter]);

  const summaryMetrics = useMemo(() => {
    const active = invoices.filter(i => i.status !== 'CANCELADA');
    const totalBilled = active.reduce((acc, i) => acc + i.grossTotal, 0);
    const totalPaid = active.reduce((acc, i) => acc + i.paidTotal, 0);
    const totalOpen = active.reduce((acc, i) => acc + i.remainingBalance, 0);
    return {
      activeCount: active.length,
      totalBilled: Math.round(totalBilled * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalOpen: Math.round(totalOpen * 100) / 100
    };
  }, [invoices]);

  const getStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case 'PAGA':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Quitada</span>;
      case 'PARCIALMENTE_PAGA':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Parcial</span>;
      case 'PUBLICADA':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Em Aberto</span>;
      case 'VENCIDA':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">Vencida</span>;
      case 'CANCELADA':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/25">Cancelada</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#222222] text-[#A1A1AA]">{status}</span>;
    }
  };

  const hasActiveInvoiceFilters = invoiceSearch.trim().length > 0 || statusFilter !== 'TODAS' || typeFilter !== 'TODOS';

  const handleExportCsv = (mode: 'COMBINED' | 'INVOICES' | 'INVOICES_FILTERED' | 'SALES') => {
    if (!isAdmin) return;
    const dateSlug = getExportDateSlug();
    let filename = '';
    let rows: unknown[][] = [];
    let feedbackMsg = '';
    let auditInvoicesCount = invoices.length;
    let auditSalesCount = sales.length;

    if (mode === 'COMBINED') {
      filename = `backup-faturas-vendas-${dateSlug}.csv`;
      rows = buildCombinedFinancialBackupCsvRows({
        invoices,
        sales,
        students,
        exportedBy: user?.name || 'Administrador'
      });
      feedbackMsg = `Backup offline exportado: ${invoices.length} fatura(s) e ${sales.length} venda(s) em ${filename}.`;
    } else if (mode === 'INVOICES') {
      filename = `relatorio-faturas-${dateSlug}.csv`;
      rows = buildInvoicesOnlyCsvRows(invoices, students);
      auditSalesCount = 0;
      feedbackMsg = `Relatório de faturas exportado: ${invoices.length} registro(s) em ${filename}.`;
    } else if (mode === 'INVOICES_FILTERED') {
      filename = `relatorio-faturas-filtradas-${dateSlug}.csv`;
      rows = buildInvoicesOnlyCsvRows(filteredInvoices, students);
      auditInvoicesCount = filteredInvoices.length;
      auditSalesCount = 0;
      feedbackMsg = `Relatório filtrado exportado: ${filteredInvoices.length} fatura(s) em ${filename}.`;
    } else {
      filename = `relatorio-vendas-${dateSlug}.csv`;
      rows = buildSalesOnlyCsvRows(sales, students);
      auditInvoicesCount = 0;
      feedbackMsg = `Relatório de vendas exportado: ${sales.length} registro(s) em ${filename}.`;
    }

    downloadCsvFile(filename, rows);
    setShowExportMenu(false);
    setExportFeedback(feedbackMsg);
    setTimeout(() => setExportFeedback(null), 5000);

    api
      .logFinancialCsvExport({
        exportType: mode,
        invoicesCount: auditInvoicesCount,
        salesCount: auditSalesCount
      })
      .catch(() => {});
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Navigation */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-extrabold text-[#F5F5F5] tracking-tight">
              Faturas, Lançamentos & Fechamento Mensal
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Faturamento individual por aluno, lotes por período personalizado e fechamento mensal automático em America/Sao_Paulo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && (
            <div className="relative" ref={exportMenuRef}>
              <div className="inline-flex rounded-xl border border-emerald-500/35 bg-emerald-500/10 shadow-xs overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleExportCsv('COMBINED')}
                  className="px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Exportar CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowExportMenu(prev => !prev)}
                  aria-label="Opções de exportação CSV"
                  aria-expanded={showExportMenu}
                  className="px-2 py-2 border-l border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition flex items-center cursor-pointer"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {showExportMenu && (
                <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#161616] border border-[#303030] shadow-2xl p-1.5 z-30 space-y-1">
                  <div className="px-2.5 py-1.5 border-b border-[#242424]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] block">
                      Backup Offline Financeiro (.CSV)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportCsv('COMBINED')}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#222222] transition flex items-start gap-2.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-[#F5F5F5] block">Backup Completo (Faturas + Vendas)</span>
                      <span className="text-[10px] text-[#71717A]">Tudo consolidado com totais gerais</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportCsv('INVOICES')}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#222222] transition flex items-start gap-2.5 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-[#F5F5F5] block">Somente Faturas ({invoices.length})</span>
                      <span className="text-[10px] text-[#71717A]">Mensalidades, consumo, saldos e status</span>
                    </div>
                  </button>
                  {hasActiveInvoiceFilters && (
                    <button
                      type="button"
                      onClick={() => handleExportCsv('INVOICES_FILTERED')}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#222222] transition flex items-start gap-2.5 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-bold text-[#F5F5F5] block">Faturas Filtradas ({filteredInvoices.length})</span>
                        <span className="text-[10px] text-[#71717A]">Apenas os registros visíveis na busca</span>
                      </div>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleExportCsv('SALES')}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#222222] transition flex items-start gap-2.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-[#F5F5F5] block">Somente Vendas ({sales.length})</span>
                      <span className="text-[10px] text-[#71717A]">Consumo PDV itemizado</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 4 Main Module Areas */}
          <div className="flex flex-wrap gap-1.5 bg-[#121212] p-1 rounded-xl border border-[#2A2A2A]">
            <button
              type="button"
              onClick={() => setActiveArea('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeArea === 'overview'
                  ? 'bg-emerald-500 text-[#0A0A0A] shadow-xs'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Visão Geral
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => setActiveArea('issue')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeArea === 'issue'
                    ? 'bg-emerald-500 text-[#0A0A0A] shadow-xs'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Lançar Fatura
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveArea('closing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeArea === 'closing'
                  ? 'bg-emerald-500 text-[#0A0A0A] shadow-xs'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Fechamento em Lote
            </button>
            <button
              type="button"
              onClick={() => setActiveArea('batches')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                activeArea === 'batches'
                  ? 'bg-emerald-500 text-[#0A0A0A] shadow-xs'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Histórico de Faturamentos
            </button>
          </div>
        </div>
      </div>

      {exportFeedback && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{exportFeedback}</span>
        </div>
      )}

      {globalNotice && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            globalNotice.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
          }`}
        >
          {globalNotice.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{globalNotice.text}</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ÁREA 1: VISÃO GERAL                                                  */}
      {/* ==================================================================== */}
      {activeArea === 'overview' && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-[#1B1B1B] border border-[#282828]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA] block">
                Consumo Aguardando Faturamento
              </span>
              <span className="text-2xl font-black text-amber-400 font-mono tabular-nums mt-1 block">
                {formatCurrency(unbilledOverview?.totalUnbilledAmount || 0)}
              </span>
              <span className="text-[11px] text-[#71717A] mt-1 block">
                {(unbilledOverview?.unbilledSalesCount || 0) + (unbilledOverview?.partiallyBilledSalesCount || 0)} venda(s) •{' '}
                {unbilledOverview?.studentsWithUnbilledCount || 0} aluno(s)
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#1B1B1B] border border-[#282828]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA] block">
                Total Faturado Ativo
              </span>
              <span className="text-2xl font-black text-[#F5F5F5] font-mono tabular-nums mt-1 block">
                {formatCurrency(summaryMetrics.totalBilled)}
              </span>
              <span className="text-[11px] text-[#71717A] mt-1 block">
                {summaryMetrics.activeCount} fatura(s) emitida(s)
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#1B1B1B] border border-[#282828]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA] block">
                Recebido / Liquidado
              </span>
              <span className="text-2xl font-black text-emerald-400 font-mono tabular-nums mt-1 block">
                {formatCurrency(summaryMetrics.totalPaid)}
              </span>
              <span className="text-[11px] text-[#71717A] mt-1 block">
                Saldo em aberto: {formatCurrency(summaryMetrics.totalOpen)}
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#1B1B1B] border border-[#282828]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA] block">
                Lotes & Fechamentos Executados
              </span>
              <span className="text-2xl font-black text-[#F5F5F5] font-mono tabular-nums mt-1 block">
                {batches.length}
              </span>
              <span className="text-[11px] text-[#71717A] mt-1 block">
                {unbilledOverview?.billedSalesCount || 0} vendas faturadas • {unbilledOverview?.reversedOrCanceledSalesCount || 0} estornadas
              </span>
            </div>
          </div>

          {/* Retroactive Closed Period Alert */}
          {(unbilledOverview?.retroactiveClosedPeriodSalesCount || 0) > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-extrabold text-amber-300">
                    Alerta de Consumo Retroativo em Competência Já Fechada
                  </h4>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    Existem <strong>{unbilledOverview?.retroactiveClosedPeriodSalesCount}</strong> compra(s) totalizando{' '}
                    <strong className="font-mono">{formatCurrency(unbilledOverview?.retroactiveClosedPeriodAmount || 0)}</strong>{' '}
                    lançadas em meses que já tiveram fechamento mensal. Fature manualmente via Lançamento Individual ou Período Personalizado sem alterar faturas já fechadas.
                  </p>
                </div>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setIssueMode('PERIODO');
                    setActiveArea('issue');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0A0A0A] text-xs font-extrabold shrink-0 cursor-pointer"
                >
                  Faturar Retroativos
                </button>
              )}
            </div>
          )}

          {/* 3 Launch Modalities Shortcuts */}
          {canManage && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-[#1B1B1B] border border-[#282828] hover:border-emerald-500/35 transition flex flex-col justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Modalidade 1</span>
                  <h3 className="text-sm font-extrabold text-[#F5F5F5] mt-1">Lançamento Individual por Aluno</h3>
                  <p className="text-xs text-[#A1A1AA] mt-1">
                    Escolha o aluno, selecione compras ou quantidades parciais de itens, aplique descontos e emita imediatamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIssueMode('INDIVIDUAL');
                    setActiveArea('issue');
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#222222] hover:bg-emerald-500 hover:text-[#0A0A0A] text-emerald-400 text-xs font-extrabold border border-[#303030] transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Lançar Fatura Individual <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-5 rounded-2xl bg-[#1B1B1B] border border-[#282828] hover:border-emerald-500/35 transition flex flex-col justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400">Modalidade 2</span>
                  <h3 className="text-sm font-extrabold text-[#F5F5F5] mt-1">Lote por Período Personalizado</h3>
                  <p className="text-xs text-[#A1A1AA] mt-1">
                    Defina data inicial e final, filtre turma ou alunos específicos e gere cobranças semanais ou quinzenais em lote.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIssueMode('PERIODO');
                    setActiveArea('issue');
                  }}
                  className="w-full py-2.5 rounded-xl bg-[#222222] hover:bg-emerald-500 hover:text-[#0A0A0A] text-emerald-400 text-xs font-extrabold border border-[#303030] transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Faturar por Período <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-5 rounded-2xl bg-[#1B1B1B] border border-[#282828] hover:border-emerald-500/35 transition flex flex-col justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Modalidade 3</span>
                  <h3 className="text-sm font-extrabold text-[#F5F5F5] mt-1">Fechamento Mensal Automático</h3>
                  <p className="text-xs text-[#A1A1AA] mt-1">
                    Consolidação mensal padrão da competência com trava anti-duplicidade e notificação automática aos responsáveis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveArea('closing')}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0A0A0A] text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Executar Fechamento Mensal <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Consumo Aguardando Faturamento (Control Panel) */}
          <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[#F5F5F5] flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Consumo Aguardando Faturamento (Controle Faturado vs Não Faturado)
                </h3>
                <p className="text-xs text-[#A1A1AA] mt-0.5">
                  Alunos com vendas na conta ainda não incluídas integralmente em nenhuma fatura ativa.
                </p>
              </div>
              {isLoadingOverview && <span className="text-[11px] text-[#71717A]">Atualizando...</span>}
            </div>

            {!unbilledOverview || unbilledOverview.byStudent.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#71717A] border border-dashed border-[#2A2A2A] rounded-xl">
                Todo o consumo elegível na conta dos alunos já foi faturado.
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#282828] rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#141414] text-[#71717A] font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">Aluno</th>
                      <th className="py-2.5 px-3">Turma</th>
                      <th className="py-2.5 px-3 text-center">Vendas Pendentes</th>
                      <th className="py-2.5 px-3">Período das Compras</th>
                      <th className="py-2.5 px-3 text-right">Saldo a Faturar</th>
                      {canManage && <th className="py-2.5 px-3 text-right">Ação</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#242424]">
                    {unbilledOverview.byStudent.map(item => (
                      <tr key={item.studentId} className="hover:bg-[#202020]">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#F5F5F5]">{item.studentName}</span>
                            {!item.hasGuardian && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                Sem Resp.
                              </span>
                            )}
                            {item.hasRetroactiveClosedPeriodSale && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                Retroativo
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-[#71717A]">{item.registrationNumber}</span>
                        </td>
                        <td className="py-2.5 px-3 text-[#A1A1AA]">{item.classGroup}</td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-[#F5F5F5]">
                          {item.unbilledSalesCount}
                        </td>
                        <td className="py-2.5 px-3 text-[#A1A1AA] font-mono text-[11px]">
                          {item.oldestSaleDate === item.newestSaleDate
                            ? formatDate(item.oldestSaleDate)
                            : `${formatDate(item.oldestSaleDate)} a ${formatDate(item.newestSaleDate)}`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-extrabold text-amber-400 tabular-nums">
                          {formatCurrency(item.unbilledAmount)}
                        </td>
                        {canManage && (
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleLaunchIndividualForStudent(item.studentId)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-[#0A0A0A] text-[11px] font-bold border border-emerald-500/30 transition cursor-pointer"
                            >
                              Faturar Aluno
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ÁREA 2: LANÇAR FATURA (INDIVIDUAL OU PERÍODO PERSONALIZADO)          */}
      {/* ==================================================================== */}
      {activeArea === 'issue' && canManage && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 bg-[#1B1B1B] p-2 rounded-2xl border border-[#282828] w-fit">
            <button
              type="button"
              onClick={() => setIssueMode('INDIVIDUAL')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                issueMode === 'INDIVIDUAL'
                  ? 'bg-emerald-500 text-[#0A0A0A]'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              Lançamento Individual por Aluno
            </button>
            <button
              type="button"
              onClick={() => setIssueMode('PERIODO')}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                issueMode === 'PERIODO'
                  ? 'bg-emerald-500 text-[#0A0A0A]'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              Faturamento em Lote por Período Personalizado
            </button>
          </div>

          {issueMode === 'INDIVIDUAL' ? (
            <IndividualBillingWizard
              students={students}
              initialStudentId={preselectedStudentId}
              onInvoiceCreated={() => refreshEverything()}
              onOpenInvoiceModal={(inv) => openInvoiceDetails(inv, false)}
            />
          ) : (
            <PeriodBatchBillingPanel
              mode="PERIODO_PERSONALIZADO"
              students={students}
              onBatchExecuted={() => refreshEverything()}
            />
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* ÁREA 3: FECHAMENTO EM LOTE & FATURAS EMITIDAS                        */}
      {/* ==================================================================== */}
      {activeArea === 'closing' && (
        <div className="space-y-6">
          {canManage && (
            <PeriodBatchBillingPanel
              mode="FECHAMENTO_MENSAL"
              students={students}
              onBatchExecuted={() => refreshEverything()}
            />
          )}

          {/* Issued Invoices Table */}
          <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[#282828] flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="w-4 h-4 text-[#71717A] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    placeholder="Buscar código, aluno, matrícula ou lote..."
                    className="w-full pl-9 pr-3 py-2 bg-[#141414] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5] focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-2 bg-[#141414] border border-[#2E2E2E] rounded-xl text-xs font-semibold text-[#F5F5F5]"
                >
                  <option value="TODOS">Todas Modalidades</option>
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="PERIODO_PERSONALIZADO">Período Personalizado</option>
                  <option value="FECHAMENTO_MENSAL">Fechamento Mensal</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-[#141414] border border-[#2E2E2E] rounded-xl text-xs font-semibold text-[#F5F5F5]"
                >
                  <option value="TODAS">Todos Status ({invoices.length})</option>
                  <option value="PUBLICADA">Em Aberto</option>
                  <option value="PARCIALMENTE_PAGA">Parcialmente Paga</option>
                  <option value="PAGA">Quitada</option>
                  <option value="VENCIDA">Vencida</option>
                  <option value="CANCELADA">Cancelada</option>
                </select>
              </div>

              {isAdmin && invoices.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClearAllConfirm(prev => !prev)}
                  className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpar Base de Faturas
                </button>
              )}
            </div>

            {showClearAllConfirm && (
              <div className="p-4 bg-rose-950/30 border-b border-rose-500/30 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-rose-200">
                  Atenção: Deseja excluir permanentemente todas as <strong>{invoices.length}</strong> faturas e restaurar os saldos das vendas para em aberto?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowClearAllConfirm(false)}
                    className="px-3 py-1.5 rounded-lg border border-[#303030] text-xs text-zinc-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isClearingAll}
                    onClick={handleClearAllInvoices}
                    className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                  >
                    {isClearingAll ? 'Excluindo...' : 'Confirmar Exclusão Total'}
                  </button>
                </div>
              </div>
            )}

            {filteredInvoices.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <FileText className="w-8 h-8 text-emerald-500/40 mx-auto" />
                <h3 className="text-sm font-bold text-[#F5F5F5]">Nenhuma fatura encontrada</h3>
                <p className="text-xs text-[#71717A] max-w-md mx-auto">
                  Ajuste os filtros acima ou lance uma nova fatura individual, por período ou fechamento mensal.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#151515] border-b border-[#282828] text-[10px] font-bold text-[#71717A] uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Fatura / Modalidade</th>
                      <th className="py-3 px-4">Aluno</th>
                      <th className="py-3 px-4">Período / Vencimento</th>
                      <th className="py-3 px-4 text-right">Consumo</th>
                      <th className="py-3 px-4 text-right">Total Líq.</th>
                      <th className="py-3 px-4 text-right">Restante</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#242424] text-xs">
                    {filteredInvoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-[#222222]/50 transition">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-[#F5F5F5] block">{inv.id}</span>
                          <span className="text-[10px] text-[#71717A]">
                            {inv.billingType || 'FECHAMENTO_MENSAL'}
                            {inv.batchId ? ` • ${inv.batchId}` : ''}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-[#F5F5F5] block">{inv.studentName}</span>
                          <span className="text-[10px] font-mono text-[#71717A]">{inv.registrationNumber}</span>
                        </td>
                        <td className="py-3 px-4 text-[#A1A1AA]">
                          <span className="block text-[11px] font-semibold text-[#E4E4E7]">
                            {inv.billingLabel || formatPeriod(inv.billingPeriod)}
                          </span>
                          <span className="text-[10px] font-mono">Venc: {formatDate(inv.dueDate)}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-400 tabular-nums">
                          {formatCurrency(inv.canteenConsumptionTotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-[#F5F5F5] tabular-nums">
                          {formatCurrency(inv.grossTotal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-400 tabular-nums">
                          {formatCurrency(inv.remainingBalance)}
                        </td>
                        <td className="py-3 px-4 text-center">{getStatusBadge(inv.status)}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {canManage && inv.status !== 'CANCELADA' && (
                              <button
                                type="button"
                                onClick={() => openInvoiceDetails(inv, true)}
                                className="px-2 py-1 rounded-lg bg-[#222222] hover:bg-[#2A2A2A] text-amber-300 text-[11px] font-bold border border-amber-500/20 transition flex items-center gap-1 cursor-pointer"
                              >
                                <Sliders className="w-3 h-3" />
                                Ajustar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openInvoiceDetails(inv, false)}
                              className="px-2.5 py-1 rounded-lg bg-[#222222] hover:bg-[#2A2A2A] text-emerald-400 text-[11px] font-bold border border-[#303030] transition flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              Extrato
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* ÁREA 4: HISTÓRICO DE FATURAMENTOS (LOTES)                            */}
      {/* ==================================================================== */}
      {activeArea === 'batches' && (
        <BillingBatchesHistory
          batches={batches}
          invoices={invoices}
          onInspectInvoice={(inv) => openInvoiceDetails(inv, false)}
        />
      )}

      {/* Detailed Invoice Modal */}
      {selectedInvoice && (
        <InvoiceStatementModal
          invoice={selectedInvoice}
          students={students}
          whatsappNotifications={whatsappNotifications}
          canEditOrCancel={canManage}
          isAdmin={isAdmin}
          initialEditing={startEditingModal}
          onClose={() => {
            setSelectedInvoice(null);
            setStartEditingModal(false);
          }}
          onInvoiceUpdated={(updated) => setSelectedInvoice(updated)}
          onInvoiceDeleted={() => setSelectedInvoice(null)}
          onRefreshAll={refreshEverything}
        />
      )}
    </div>
  );
}
