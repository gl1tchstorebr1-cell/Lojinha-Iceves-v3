import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  UserCheck,
  Calendar,
  CheckSquare,
  Square,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Send,
  Receipt,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileText,
  Clock
} from 'lucide-react';
import {
  Student,
  Invoice,
  BillingPreviewSale,
  IndividualSaleSelection,
  InvoiceConsumptionSummaryItem,
  StudentGuardianLink
} from '../../types';
import { api } from '../../services/api';
import { formatCurrency, formatDate, formatDateTime, formatPeriod } from '../../utils/formatters';

interface IndividualBillingWizardProps {
  students: Student[];
  initialStudentId?: string | null;
  onInvoiceCreated: (invoice: Invoice) => void;
  onOpenInvoiceModal?: (invoice: Invoice) => void;
}

function getTodaySaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function addDaysIso(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return isoDate;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function IndividualBillingWizard({
  students,
  initialStudentId,
  onInvoiceCreated,
  onOpenInvoiceModal
}: IndividualBillingWizardProps) {
  const todaySp = useMemo(() => getTodaySaoPaulo(), []);
  const defaultDue = useMemo(() => addDaysIso(todaySp, 10), [todaySp]);

  const [studentQuery, setStudentQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>(initialStudentId || '');
  const [useDateFilter, setUseDateFilter] = useState(false);
  const [periodStart, setPeriodStart] = useState(`${todaySp.slice(0, 7)}-01`);
  const [periodEnd, setPeriodEnd] = useState(todaySp);

  // Loaded student context
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [guardians, setGuardians] = useState<Array<StudentGuardianLink & { guardianEmail?: string }>>([]);
  const [sales, setSales] = useState<BillingPreviewSale[]>([]);
  const [studentInvoices, setStudentInvoices] = useState<Invoice[]>([]);

  // Itemized selection state: map saleId -> map itemIndex -> selectedQty
  const [selectedItemsMap, setSelectedItemsMap] = useState<Record<string, Record<number, number>>>({});
  const [expandedSales, setExpandedSales] = useState<Record<string, boolean>>({});

  // Financial fields
  const [dueDate, setDueDate] = useState(defaultDue);
  const [billingLabel, setBillingLabel] = useState('');
  const [tuitionAmount, setTuitionAmount] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [creditAmount, setCreditAmount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState('');
  const [notes, setNotes] = useState('');

  // Mandatory Preview before emit
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{
    student: Student;
    hasGuardian: boolean;
    warnings: string[];
    billingPeriod: string;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    tuitionAmount: number;
    canteenConsumptionTotal: number;
    discountAmount: number;
    creditAmount: number;
    totalAdjustments: number;
    grossTotal: number;
    salesCount: number;
    consumptionItems: InvoiceConsumptionSummaryItem[];
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<Invoice | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `IND-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

  useEffect(() => {
    if (initialStudentId && initialStudentId !== selectedStudentId) {
      setSelectedStudentId(initialStudentId);
    }
  }, [initialStudentId]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    const active = students.filter(s => s.status === 'ACTIVE');
    if (!q) return active;
    return active.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.registrationNumber.toLowerCase().includes(q) ||
        s.classGroup.toLowerCase().includes(q)
    );
  }, [students, studentQuery]);

  const selectedStudent = useMemo(
    () => students.find(s => s.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const loadContext = async (studentId: string) => {
    if (!studentId) return;
    setIsLoadingContext(true);
    setContextError(null);
    setPreviewData(null);
    setSubmitSuccess(null);
    setSubmitError(null);
    try {
      const data = await api.getStudentIndividualBillingContext(
        studentId,
        useDateFilter ? periodStart : undefined,
        useDateFilter ? periodEnd : undefined
      );
      setGuardians(data.guardians || []);
      setSales(data.sales || []);
      setStudentInvoices(data.studentInvoices || []);

      // Auto-select all eligible items by default
      const nextMap: Record<string, Record<number, number>> = {};
      for (const s of data.sales || []) {
        if (!s.isEligible) continue;
        const itemMap: Record<number, number> = {};
        for (const it of s.items) {
          if (it.remainingQuantity > 0) {
            itemMap[it.itemIndex] = it.remainingQuantity;
          }
        }
        if (Object.keys(itemMap).length > 0) {
          nextMap[s.saleId] = itemMap;
        }
      }
      setSelectedItemsMap(nextMap);
      setIdempotencyKey(`IND-${studentId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    } catch (err: any) {
      setContextError(err.message || 'Erro ao carregar consumo do aluno.');
    } finally {
      setIsLoadingContext(false);
    }
  };

  useEffect(() => {
    if (selectedStudentId) {
      loadContext(selectedStudentId);
    } else {
      setSales([]);
      setGuardians([]);
      setStudentInvoices([]);
      setSelectedItemsMap({});
      setPreviewData(null);
    }
  }, [selectedStudentId, useDateFilter, periodStart, periodEnd]);

  const eligibleSales = useMemo(() => sales.filter(s => s.isEligible), [sales]);

  const toggleSaleSelection = (sale: BillingPreviewSale) => {
    if (!sale.isEligible) return;
    setPreviewData(null);
    setSelectedItemsMap(prev => {
      const next = { ...prev };
      const current = next[sale.saleId];
      if (current && Object.keys(current).length > 0) {
        delete next[sale.saleId];
      } else {
        const allItems: Record<number, number> = {};
        for (const it of sale.items) {
          if (it.remainingQuantity > 0) allItems[it.itemIndex] = it.remainingQuantity;
        }
        next[sale.saleId] = allItems;
      }
      return next;
    });
  };

  const updateItemQuantity = (sale: BillingPreviewSale, itemIndex: number, maxQty: number, qty: number) => {
    setPreviewData(null);
    const clamped = Math.max(0, Math.min(maxQty, Math.floor(Number(qty) || 0)));
    setSelectedItemsMap(prev => {
      const next = { ...prev };
      const saleItems = { ...(next[sale.saleId] || {}) };
      if (clamped <= 0) {
        delete saleItems[itemIndex];
      } else {
        saleItems[itemIndex] = clamped;
      }
      if (Object.keys(saleItems).length === 0) {
        delete next[sale.saleId];
      } else {
        next[sale.saleId] = saleItems;
      }
      return next;
    });
  };

  const selectAllEligible = () => {
    setPreviewData(null);
    const next: Record<string, Record<number, number>> = {};
    for (const s of eligibleSales) {
      const map: Record<number, number> = {};
      for (const it of s.items) {
        if (it.remainingQuantity > 0) map[it.itemIndex] = it.remainingQuantity;
      }
      if (Object.keys(map).length > 0) next[s.saleId] = map;
    }
    setSelectedItemsMap(next);
  };

  const clearSelection = () => {
    setPreviewData(null);
    setSelectedItemsMap({});
  };

  const selectionsPayload: IndividualSaleSelection[] = useMemo(() => {
    const out: IndividualSaleSelection[] = [];
    for (const [saleId, itemsRec] of Object.entries(selectedItemsMap)) {
      const items = Object.entries(itemsRec)
        .filter(([, q]) => q > 0)
        .map(([idx, q]) => ({ itemIndex: Number(idx), quantity: q }));
      if (items.length > 0) {
        out.push({ saleId, items });
      }
    }
    return out;
  }, [selectedItemsMap]);

  const draftTotals = useMemo(() => {
    let selectedConsumption = 0;
    let selectedItemsCount = 0;
    for (const sel of selectionsPayload) {
      const sale = sales.find(s => s.saleId === sel.saleId);
      if (!sale) continue;
      for (const reqIt of sel.items || []) {
        const evalIt = sale.items.find(i => i.itemIndex === reqIt.itemIndex);
        if (!evalIt) continue;
        selectedItemsCount += reqIt.quantity;
        const amt = reqIt.quantity === evalIt.remainingQuantity
          ? evalIt.remainingAmount
          : Math.round(reqIt.quantity * evalIt.unitPrice * 100) / 100;
        selectedConsumption = Math.round((selectedConsumption + amt) * 100) / 100;
      }
    }
    const gross = Math.round((selectedConsumption + (Number(tuitionAmount) || 0)) * 100) / 100;
    const totalDiscount = Math.round(((Number(discountAmount) || 0) + (Number(creditAmount) || 0)) * 100) / 100;
    const net = Math.max(0, Math.round((gross - totalDiscount) * 100) / 100);
    return {
      selectedSalesCount: selectionsPayload.length,
      selectedItemsCount,
      selectedConsumption,
      gross,
      totalDiscount,
      net
    };
  }, [selectionsPayload, sales, tuitionAmount, discountAmount, creditAmount]);

  const handleGeneratePreview = async () => {
    if (!selectedStudentId) return;
    setIsLoadingPreview(true);
    setSubmitError(null);
    setPreviewData(null);
    try {
      const data = await api.previewIndividualInvoice({
        studentId: selectedStudentId,
        periodStart: useDateFilter ? periodStart : undefined,
        periodEnd: useDateFilter ? periodEnd : undefined,
        dueDate,
        billingLabel: billingLabel.trim() || undefined,
        tuitionAmount: Number(tuitionAmount) || 0,
        discountAmount: Number(discountAmount) || 0,
        creditAmount: Number(creditAmount) || 0,
        discountReason: discountReason.trim() || undefined,
        notes: notes.trim() || undefined,
        selections: selectionsPayload
      });
      setPreviewData(data);
    } catch (err: any) {
      setSubmitError(err.message || 'Erro ao gerar prévia da fatura individual.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleConfirmEmit = async () => {
    if (!selectedStudentId || !previewData) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.createIndividualInvoice({
        studentId: selectedStudentId,
        periodStart: useDateFilter ? periodStart : undefined,
        periodEnd: useDateFilter ? periodEnd : undefined,
        dueDate,
        billingLabel: billingLabel.trim() || undefined,
        tuitionAmount: Number(tuitionAmount) || 0,
        discountAmount: Number(discountAmount) || 0,
        creditAmount: Number(creditAmount) || 0,
        discountReason: discountReason.trim() || undefined,
        notes: notes.trim() || undefined,
        selections: selectionsPayload,
        idempotencyKey
      });
      setSubmitSuccess(res.invoice);
      setPreviewData(null);
      setDiscountAmount(0);
      setCreditAmount(0);
      setDiscountReason('');
      setTuitionAmount(0);
      setNotes('');
      setBillingLabel('');
      onInvoiceCreated(res.invoice);
      await loadContext(selectedStudentId);
    } catch (err: any) {
      setSubmitError(err.message || 'Falha ao emitir fatura individual.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSaleBadge = (s: BillingPreviewSale) => {
    if (s.billingStatus === 'ESTORNADA') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">Estornada</span>;
    }
    if (s.paymentMethod !== 'CONTA_ALUNO') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-700/40 text-zinc-300 border border-zinc-600/40">Quitada no ato ({s.paymentMethod})</span>;
    }
    if (s.billingStatus === 'TOTALMENTE_FATURADA') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Já Faturada</span>;
    }
    if (s.billingStatus === 'PARCIALMENTE_FATURADA') {
      return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Parcialmente Faturada</span>;
    }
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">Aguardando Faturamento</span>;
  };

  return (
    <div className="space-y-5">
      {/* Step 1: Student Search & Selection */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-[#F5F5F5] flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              1. Selecionar Aluno & Período de Consumo
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-0.5">
              Pesquise um aluno para visualizar turma, responsável financeiro e selecionar compras ou itens específicos.
            </p>
          </div>
          {selectedStudent && (
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
              {selectedStudent.registrationNumber}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-5 relative">
            <Search className="w-4 h-4 text-[#71717A] absolute left-3 top-3" />
            <input
              type="text"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Pesquisar aluno por nome, matrícula ou turma..."
              className="w-full pl-9 pr-3 py-2.5 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5] focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="lg:col-span-7">
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="w-full px-3 py-2.5 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs font-semibold text-[#F5F5F5] focus:outline-none focus:border-emerald-500"
            >
              <option value="">-- Selecione um aluno ({filteredStudents.length} disponíveis) --</option>
              {filteredStudents.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.registrationNumber}) — Em aberto: {formatCurrency(st.currentConsumptionBalance)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedStudent && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-[#262626]">
            <div className="p-3 rounded-xl bg-[#141414] border border-[#252525]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] block">Aluno & Turma</span>
              <span className="text-xs font-bold text-[#F5F5F5] block mt-0.5">{selectedStudent.name}</span>
              <span className="text-[11px] text-[#A1A1AA] block mt-0.5">{selectedStudent.classGroup}</span>
            </div>

            <div className="p-3 rounded-xl bg-[#141414] border border-[#252525]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] block">Responsável Financeiro</span>
              {guardians.length > 0 ? (
                <div className="mt-0.5 space-y-0.5">
                  {guardians.map((g, idx) => (
                    <div key={idx} className="text-xs text-[#F5F5F5] font-semibold">
                      {g.guardianName} <span className="text-[10px] text-emerald-400 font-normal">({g.relationship})</span>
                      {g.guardianPhone && <span className="text-[10px] text-[#71717A] block font-mono">{g.guardianPhone}</span>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-0.5 flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Sem responsável vinculado ({selectedStudent.payerRule})</span>
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-[#141414] border border-[#252525]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#71717A] block">Filtro de Período (America/Sao_Paulo)</span>
              <label className="mt-1 flex items-center gap-2 text-xs text-[#F5F5F5] cursor-pointer">
                <input
                  type="checkbox"
                  checked={useDateFilter}
                  onChange={(e) => setUseDateFilter(e.target.checked)}
                  className="rounded border-[#383838] bg-[#121212] text-emerald-500"
                />
                <span>Filtrar por intervalo de datas</span>
              </label>
              {useDateFilter && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="px-2 py-1 bg-[#1B1B1B] border border-[#2E2E2E] rounded-lg text-[11px] text-[#F5F5F5]"
                  />
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="px-2 py-1 bg-[#1B1B1B] border border-[#2E2E2E] rounded-lg text-[11px] text-[#F5F5F5]"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {submitSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-extrabold text-emerald-300">
                Fatura Individual {submitSuccess.id} Emitida com Sucesso!
              </h4>
              <p className="text-[11px] text-emerald-200/80 mt-0.5">
                Valor líquido: <strong className="font-mono">{formatCurrency(submitSuccess.grossTotal)}</strong> • Vencimento: {formatDate(submitSuccess.dueDate)} • {submitSuccess.salesIds.length} compra(s) vinculada(s).
              </p>
            </div>
          </div>
          {onOpenInvoiceModal && (
            <button
              type="button"
              onClick={() => onOpenInvoiceModal(submitSuccess)}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0A0A0A] text-xs font-bold transition cursor-pointer shrink-0"
            >
              Abrir Extrato & Pix
            </button>
          )}
        </div>
      )}

      {(contextError || submitError) && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{contextError || submitError}</span>
        </div>
      )}

      {selectedStudent && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Step 2: Purchases & Items Selection */}
          <div className="xl:col-span-7 bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[#F5F5F5] flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  2. Compras e Itens no Período ({sales.length})
                </h3>
                <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                  Marque compras inteiras ou ajuste quantidades por item. Itens já faturados ficam bloqueados contra duplicidade.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllEligible}
                  className="px-2.5 py-1 rounded-lg bg-[#232323] hover:bg-[#2C2C2C] text-emerald-400 text-[11px] font-bold border border-[#303030] cursor-pointer"
                >
                  Selecionar Elegíveis
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="px-2.5 py-1 rounded-lg bg-[#232323] hover:bg-[#2C2C2C] text-[#A1A1AA] text-[11px] font-bold border border-[#303030] cursor-pointer"
                >
                  Limpar
                </button>
              </div>
            </div>

            {isLoadingContext ? (
              <div className="py-10 text-center text-xs text-[#A1A1AA]">Carregando compras do aluno...</div>
            ) : sales.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#71717A] border border-dashed border-[#2C2C2C] rounded-xl">
                Nenhuma compra encontrada para este aluno no filtro selecionado.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
                {sales.map(sale => {
                  const selRec = selectedItemsMap[sale.saleId] || {};
                  const isSelected = Object.keys(selRec).length > 0;
                  const isExpanded = expandedSales[sale.saleId] ?? sale.isEligible;

                  return (
                    <div
                      key={sale.saleId}
                      className={`rounded-xl border transition ${
                        !sale.isEligible
                          ? 'bg-[#141414] border-[#242424] opacity-70'
                          : isSelected
                            ? 'bg-emerald-950/15 border-emerald-500/35'
                            : 'bg-[#161616] border-[#2A2A2A]'
                      }`}
                    >
                      <div className="p-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            disabled={!sale.isEligible}
                            onClick={() => toggleSaleSelection(sale)}
                            className="text-emerald-400 disabled:text-zinc-600 cursor-pointer disabled:cursor-not-allowed"
                          >
                            {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-[#F5F5F5]">{sale.saleId}</span>
                              {getSaleBadge(sale)}
                              {sale.origin === 'PDV_PASSEIOS' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20">
                                  Passeio
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[#71717A] block mt-0.5">
                              {formatDateTime(sale.createdAt)} • Data BRT: {formatDate(sale.saoPauloDate)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right font-mono">
                            <span className="text-xs font-extrabold text-[#F5F5F5] tabular-nums block">
                              {formatCurrency(sale.isEligible ? sale.remainingBillableAmount : sale.originalTotal)}
                            </span>
                            {sale.alreadyBilledAmount > 0 && (
                              <span className="text-[10px] text-blue-400 block">
                                Já faturado: {formatCurrency(sale.alreadyBilledAmount)}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedSales(p => ({ ...p, [sale.saleId]: !isExpanded }))}
                            className="p-1 rounded-lg bg-[#222222] text-[#A1A1AA] hover:text-white cursor-pointer"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-3 pb-3 pt-2 border-t border-[#242424] space-y-1.5">
                          {sale.items.map(item => {
                            const pickedQty = selRec[item.itemIndex] || 0;
                            const canPick = sale.isEligible && item.remainingQuantity > 0;
                            return (
                              <div
                                key={item.itemIndex}
                                className="flex flex-wrap items-center justify-between gap-2 text-[11px] py-1 px-2 rounded-lg bg-[#121212]"
                              >
                                <div className="flex-1 min-w-[160px]">
                                  <span className="font-semibold text-[#E4E4E7]">{item.name}</span>
                                  <span className="text-[#71717A] block text-[10px]">
                                    Unit: {formatCurrency(item.unitPrice)} • Original: {item.originalQuantity}x
                                    {item.alreadyBilledQuantity > 0 && ` • Já faturado: ${item.alreadyBilledQuantity}x`}
                                  </span>
                                </div>

                                {canPick ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-[#71717A]">Qtd faturar:</span>
                                    <input
                                      type="number"
                                      min={0}
                                      max={item.remainingQuantity}
                                      value={pickedQty}
                                      onChange={(e) =>
                                        updateItemQuantity(sale, item.itemIndex, item.remainingQuantity, Number(e.target.value))
                                      }
                                      className="w-16 px-2 py-1 bg-[#1B1B1B] border border-[#303030] rounded text-center font-mono text-xs text-white"
                                    />
                                    <span className="text-[10px] text-[#71717A]">/ {item.remainingQuantity}</span>
                                    <span className="font-mono font-bold text-emerald-400 w-20 text-right tabular-nums">
                                      {formatCurrency(
                                        pickedQty === item.remainingQuantity
                                          ? item.remainingAmount
                                          : pickedQty * item.unitPrice
                                      )}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-[#71717A] font-mono">
                                    {sale.ineligibleReason || 'Item já faturado'}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3: Adjustments, Due Date & Mandatory Preview */}
          <div className="xl:col-span-5 space-y-4">
            <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] space-y-4">
              <h3 className="text-sm font-extrabold text-[#F5F5F5] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                3. Vencimento, Descontos & Prévia
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Data de Vencimento *</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => { setDueDate(e.target.value); setPreviewData(null); }}
                    className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Identificação / Rótulo</label>
                  <input
                    type="text"
                    value={billingLabel}
                    onChange={(e) => { setBillingLabel(e.target.value); setPreviewData(null); }}
                    placeholder="Ex: Consumo Semana 1"
                    className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Mensalidade (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={tuitionAmount}
                    onChange={(e) => { setTuitionAmount(Math.max(0, Number(e.target.value) || 0)); setPreviewData(null); }}
                    className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs font-mono text-[#F5F5F5]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Desconto (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => { setDiscountAmount(Math.max(0, Number(e.target.value) || 0)); setPreviewData(null); }}
                    className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs font-mono text-emerald-400"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Crédito Aplicado (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={creditAmount}
                    onChange={(e) => { setCreditAmount(Math.max(0, Number(e.target.value) || 0)); setPreviewData(null); }}
                    className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs font-mono text-emerald-400"
                  />
                </div>
              </div>

              {(discountAmount > 0 || creditAmount > 0) && (
                <div>
                  <label className="text-[11px] font-bold text-amber-300 block mb-1">
                    Justificativa de Desconto / Crédito *
                  </label>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => { setDiscountReason(e.target.value); setPreviewData(null); }}
                    placeholder="Obrigatório quando houver desconto ou crédito autorizado"
                    className="w-full px-3 py-2 bg-[#121212] border border-amber-500/40 rounded-xl text-xs text-[#F5F5F5]"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Observações da Fatura</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => { setNotes(e.target.value); setPreviewData(null); }}
                  placeholder="Informações exibidas no extrato do aluno/responsável"
                  className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5]"
                />
              </div>

              {/* Live Summary Box */}
              <div className="p-3.5 rounded-xl bg-[#131313] border border-[#272727] space-y-1.5 text-xs">
                <div className="flex justify-between text-[#A1A1AA]">
                  <span>Compras selecionadas ({draftTotals.selectedSalesCount}):</span>
                  <span className="font-mono font-semibold text-[#F5F5F5] tabular-nums">
                    {formatCurrency(draftTotals.selectedConsumption)}
                  </span>
                </div>
                {tuitionAmount > 0 && (
                  <div className="flex justify-between text-[#A1A1AA]">
                    <span>Mensalidade adicionada:</span>
                    <span className="font-mono text-[#F5F5F5] tabular-nums">+ {formatCurrency(tuitionAmount)}</span>
                  </div>
                )}
                {draftTotals.totalDiscount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Descontos / Créditos:</span>
                    <span className="font-mono tabular-nums">- {formatCurrency(draftTotals.totalDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-[#252525] text-sm font-extrabold text-[#F5F5F5]">
                  <span>Total Líquido Estimado:</span>
                  <span className="font-mono text-emerald-400 tabular-nums">{formatCurrency(draftTotals.net)}</span>
                </div>
              </div>

              <button
                type="button"
                disabled={isLoadingPreview || (selectionsPayload.length === 0 && tuitionAmount <= 0)}
                onClick={handleGeneratePreview}
                className="w-full py-2.5 bg-[#232323] hover:bg-[#2E2E2E] border border-emerald-500/35 text-emerald-300 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Eye className="w-4 h-4" />
                {isLoadingPreview ? 'Validando Prévia...' : 'Gerar Prévia Obrigatória da Fatura'}
              </button>
            </div>

            {/* Mandatory Preview Panel */}
            {previewData && (
              <div className="bg-emerald-950/15 rounded-2xl p-5 border border-emerald-500/35 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-emerald-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    Prévia Validada — Pronta para Emissão
                  </span>
                  <span className="text-[11px] font-mono text-[#A1A1AA]">
                    {formatDate(previewData.periodStart)} a {formatDate(previewData.periodEnd)}
                  </span>
                </div>

                {previewData.warnings.map((w, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}

                <div className="max-h-36 overflow-y-auto border border-[#26332D] rounded-xl bg-[#121212] divide-y divide-[#202020] text-[11px]">
                  {previewData.consumptionItems.map((ci, idx) => (
                    <div key={idx} className="px-3 py-1.5 flex items-center justify-between">
                      <span className="text-[#E4E4E7]">{ci.quantity}x {ci.productName}</span>
                      <span className="font-mono font-bold text-[#F5F5F5] tabular-nums">{formatCurrency(ci.totalAmount)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-sm font-black text-white pt-1">
                  <span>Valor Final da Fatura:</span>
                  <span className="font-mono text-emerald-400 tabular-nums">{formatCurrency(previewData.grossTotal)}</span>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmEmit}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-[#0A0A0A] font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-lg disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {isSubmitting ? 'Emitindo Fatura Individual...' : 'Confirmar e Emitir Fatura Individual'}
                </button>
              </div>
            )}

            {/* Inline Student Invoice History */}
            <div className="bg-[#1B1B1B] rounded-2xl p-4 border border-[#282828] space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-[#F5F5F5] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  Histórico de Faturas do Aluno ({studentInvoices.length})
                </h4>
              </div>
              {studentInvoices.length === 0 ? (
                <p className="text-[11px] text-[#71717A]">Nenhuma fatura emitida anteriormente para este aluno.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {studentInvoices.map(inv => (
                    <div
                      key={inv.id}
                      onClick={() => onOpenInvoiceModal?.(inv)}
                      className="p-2.5 rounded-xl bg-[#141414] hover:bg-[#1E1E1E] border border-[#262626] flex items-center justify-between gap-2 cursor-pointer transition"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-mono text-xs font-bold text-[#F5F5F5]">{inv.id}</span>
                          <span className="text-[10px] text-[#71717A]">{inv.billingLabel || formatPeriod(inv.billingPeriod)}</span>
                        </div>
                        <span className="text-[10px] text-[#71717A] block mt-0.5">
                          Venc: {formatDate(inv.dueDate)} • Status: {inv.status}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-emerald-400 tabular-nums">
                        {formatCurrency(inv.grossTotal)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
