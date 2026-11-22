import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Users,
  Filter,
  ArrowRight,
  Lock
} from 'lucide-react';
import {
  Student,
  BillingBatch,
  BillingBatchPreview,
  Invoice
} from '../../types';
import { api } from '../../services/api';
import { formatCurrency, formatDate, formatDateTime, formatPeriod } from '../../utils/formatters';

interface PeriodBatchBillingPanelProps {
  mode: 'PERIODO_PERSONALIZADO' | 'FECHAMENTO_MENSAL';
  students: Student[];
  onBatchExecuted: (result: { batch?: BillingBatch; invoicesCreated: number; invoices: Invoice[]; period: string }) => void;
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

export function PeriodBatchBillingPanel({
  mode,
  students,
  onBatchExecuted
}: PeriodBatchBillingPanelProps) {
  const todaySp = useMemo(() => getTodaySaoPaulo(), []);
  const currentMonth = todaySp.slice(0, 7);

  // Inputs
  const [selectedPeriod, setSelectedPeriod] = useState(currentMonth);
  const [periodStart, setPeriodStart] = useState(`${currentMonth}-01`);
  const [periodEnd, setPeriodEnd] = useState(todaySp);
  const [dueDate, setDueDate] = useState(addDaysIso(todaySp, 10));
  const [billingLabel, setBillingLabel] = useState('');
  const [scope, setScope] = useState<'ALL_STUDENTS' | 'CLASS_GROUP' | 'MANUAL_SELECTION' | 'EXCLUDE_STUDENTS'>('ALL_STUDENTS');
  const [classGroup, setClassGroup] = useState<string>('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [excludedStudentIds, setExcludedStudentIds] = useState<string[]>([]);
  const [onlyUnbilled, setOnlyUnbilled] = useState(true);
  const [notes, setNotes] = useState('');

  // Preview & Execution state
  const [preview, setPreview] = useState<BillingBatchPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});
  const [showZeroStudents, setShowZeroStudents] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => `${mode}-${Date.now()}`);

  const activeStudents = useMemo(() => students.filter(s => s.status === 'ACTIVE'), [students]);
  const classGroups = useMemo(
    () => Array.from(new Set(activeStudents.map(s => s.classGroup).filter(Boolean))),
    [activeStudents]
  );

  const toggleManualStudent = (id: string) => {
    setPreview(null);
    setSelectedStudentIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const toggleExcludedStudent = (id: string) => {
    setPreview(null);
    setExcludedStudentIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleGeneratePreview = async () => {
    setIsLoadingPreview(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload = {
        mode,
        billingPeriod: mode === 'FECHAMENTO_MENSAL' ? selectedPeriod : periodEnd.slice(0, 7),
        periodStart: mode === 'PERIODO_PERSONALIZADO' ? periodStart : undefined,
        periodEnd: mode === 'PERIODO_PERSONALIZADO' ? periodEnd : undefined,
        dueDate: dueDate || undefined,
        billingLabel: billingLabel.trim() || undefined,
        scope,
        classGroup: scope === 'CLASS_GROUP' ? classGroup || classGroups[0] : undefined,
        studentIds: scope === 'MANUAL_SELECTION' ? selectedStudentIds : undefined,
        excludedStudentIds: scope === 'EXCLUDE_STUDENTS' ? excludedStudentIds : undefined,
        onlyUnbilled,
        notes: notes.trim() || undefined
      };
      const data = await api.previewPeriodBilling(payload);
      setPreview(data);
      setIdempotencyKey(`${mode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao calcular prévia do faturamento.');
      setPreview(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleExecuteBatch = async () => {
    if (!preview || !preview.canProceed || preview.invoicesToCreateCount === 0) return;
    setIsExecuting(true);
    setErrorMsg(null);
    try {
      const payload = {
        mode,
        billingPeriod: mode === 'FECHAMENTO_MENSAL' ? selectedPeriod : periodEnd.slice(0, 7),
        periodStart: mode === 'PERIODO_PERSONALIZADO' ? periodStart : undefined,
        periodEnd: mode === 'PERIODO_PERSONALIZADO' ? periodEnd : undefined,
        dueDate: preview.dueDate,
        billingLabel: billingLabel.trim() || undefined,
        scope,
        classGroup: scope === 'CLASS_GROUP' ? classGroup || classGroups[0] : undefined,
        studentIds: scope === 'MANUAL_SELECTION' ? selectedStudentIds : undefined,
        excludedStudentIds: scope === 'EXCLUDE_STUDENTS' ? excludedStudentIds : undefined,
        onlyUnbilled,
        notes: notes.trim() || undefined,
        idempotencyKey
      };
      const res = await api.executePeriodBilling(payload);
      setSuccessMsg(
        `Lote ${res.batch.id} concluído! ${res.invoicesCreated} fatura(s) emitida(s) totalizando ${formatCurrency(res.batch.totalAmount)}.`
      );
      setPreview(null);
      onBatchExecuted(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao confirmar emissão do lote.');
    } finally {
      setIsExecuting(false);
    }
  };

  const displayedStudents = useMemo(() => {
    if (!preview) return [];
    if (showZeroStudents) return preview.students;
    return preview.students.filter(s => s.grossTotalToBill > 0 || s.sales.length > 0 || s.warnings.length > 0 || s.blockers.length > 0);
  }, [preview, showZeroStudents]);

  return (
    <div className="space-y-5">
      {/* Configuration Panel */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-[#F5F5F5] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              {mode === 'FECHAMENTO_MENSAL'
                ? 'Fechamento Mensal Automático (Competência Completa)'
                : 'Faturamento em Lote por Período Personalizado'}
            </h3>
            <p className="text-xs text-[#A1A1AA] mt-0.5">
              {mode === 'FECHAMENTO_MENSAL'
                ? 'Consolida exatamente do 1º ao último dia do mês selecionado em America/Sao_Paulo, bloqueando duplicidades.'
                : 'Consolida compras em aberto dentro do intervalo exato em America/Sao_Paulo (semanal, quinzenal ou datas específicas).'}
            </p>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
            Fuso: America/Sao_Paulo
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {mode === 'FECHAMENTO_MENSAL' ? (
            <div>
              <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Competência Mensal *</label>
              <input
                type="month"
                value={selectedPeriod}
                onChange={(e) => { setSelectedPeriod(e.target.value); setPreview(null); }}
                className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs font-semibold text-[#F5F5F5]"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Data Inicial *</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => { setPeriodStart(e.target.value); setPreview(null); }}
                  className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5]"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Data Final *</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => { setPeriodEnd(e.target.value); setPreview(null); }}
                  className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5]"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Data de Vencimento</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => { setDueDate(e.target.value); setPreview(null); }}
              className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5]"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Rótulo do Lote (Opcional)</label>
            <input
              type="text"
              value={billingLabel}
              onChange={(e) => { setBillingLabel(e.target.value); setPreview(null); }}
              placeholder={mode === 'FECHAMENTO_MENSAL' ? 'Ex: Fechamento Novembro' : 'Ex: Semana 01 a 15'}
              className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5]"
            />
          </div>
        </div>

        {/* Scope Selector */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-[#262626]">
          <div className="md:col-span-4">
            <label className="text-[11px] font-bold text-[#A1A1AA] flex items-center gap-1.5 mb-1">
              <Filter className="w-3.5 h-3.5 text-emerald-400" />
              Escopo de Alunos
            </label>
            <select
              value={scope}
              onChange={(e) => { setScope(e.target.value as any); setPreview(null); }}
              className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs font-semibold text-[#F5F5F5]"
            >
              <option value="ALL_STUDENTS">Todos os alunos ativos ({activeStudents.length})</option>
              <option value="CLASS_GROUP">Filtrar por Turma específica</option>
              <option value="MANUAL_SELECTION">Selecionar alunos manualmente</option>
              <option value="EXCLUDE_STUDENTS">Todos exceto alunos marcados</option>
            </select>
          </div>

          <div className="md:col-span-4">
            <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Observação do Lote</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotação administrativa interna ou das faturas"
              className="w-full px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5]"
            />
          </div>

          <div className="md:col-span-4 flex flex-col justify-end">
            <label className="flex items-center gap-2 text-xs text-[#E4E4E7] pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyUnbilled}
                onChange={(e) => { setOnlyUnbilled(e.target.checked); setPreview(null); }}
                className="rounded border-[#383838] bg-[#121212] text-emerald-500"
              />
              <span>Apenas compras ainda não faturadas (Anti-duplicidade)</span>
            </label>
          </div>
        </div>

        {scope === 'CLASS_GROUP' && (
          <div>
            <label className="text-[11px] font-bold text-[#A1A1AA] block mb-1">Turma Alvo</label>
            <select
              value={classGroup || classGroups[0] || ''}
              onChange={(e) => { setClassGroup(e.target.value); setPreview(null); }}
              className="w-full sm:w-96 px-3 py-2 bg-[#121212] border border-[#2E2E2E] rounded-xl text-xs text-[#F5F5F5]"
            >
              {classGroups.map(cg => (
                <option key={cg} value={cg}>{cg}</option>
              ))}
            </select>
          </div>
        )}

        {(scope === 'MANUAL_SELECTION' || scope === 'EXCLUDE_STUDENTS') && (
          <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] space-y-2">
            <span className="text-[11px] font-bold text-[#A1A1AA] block">
              {scope === 'MANUAL_SELECTION'
                ? `Selecione os alunos que entrarão neste faturamento (${selectedStudentIds.length} marcados):`
                : `Marque os alunos que deseja EXCLUIR deste faturamento (${excludedStudentIds.length} excluídos):`}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
              {activeStudents.map(st => {
                const checked = scope === 'MANUAL_SELECTION'
                  ? selectedStudentIds.includes(st.id)
                  : excludedStudentIds.includes(st.id);
                return (
                  <label
                    key={st.id}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer border ${
                      checked
                        ? scope === 'MANUAL_SELECTION'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        : 'bg-[#1B1B1B] border-[#262626] text-[#D4D4D8]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        scope === 'MANUAL_SELECTION' ? toggleManualStudent(st.id) : toggleExcludedStudent(st.id)
                      }
                      className="rounded"
                    />
                    <span className="truncate">{st.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={isLoadingPreview}
            onClick={handleGeneratePreview}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-[#0A0A0A] rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {isLoadingPreview ? 'Calculando Prévia...' : '1. Gerar Prévia Obrigatória do Lote'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Preview Breakdown */}
      {preview && (
        <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#262626] pb-3">
            <div>
              <h4 className="text-sm font-extrabold text-[#F5F5F5]">
                Prévia Consolidada • {formatDate(preview.periodStart)} a {formatDate(preview.periodEnd)}
              </h4>
              <p className="text-[11px] text-[#A1A1AA]">
                Vencimento configurado: <strong className="text-white">{formatDate(preview.dueDate)}</strong> • Competência ref.: {formatPeriod(preview.billingPeriod)}
              </p>
            </div>
            {preview.closedPeriodAlreadyProcessed && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                Competência já fechada anteriormente (protegida contra duplicidade)
              </span>
            )}
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-3 rounded-xl bg-[#141414] border border-[#252525]">
              <span className="text-[10px] font-bold uppercase text-[#71717A] block">Alunos Avaliados</span>
              <span className="text-lg font-extrabold text-[#F5F5F5] tabular-nums">{preview.studentsCount}</span>
              <span className="text-[10px] text-emerald-400 block">{preview.invoicesToCreateCount} fatura(s) a gerar</span>
            </div>
            <div className="p-3 rounded-xl bg-[#141414] border border-[#252525]">
              <span className="text-[10px] font-bold uppercase text-[#71717A] block">Compras Válidas</span>
              <span className="text-lg font-extrabold text-[#F5F5F5] tabular-nums">{preview.validSalesCount}</span>
              <span className="text-[10px] text-[#71717A] block">{preview.alreadyBilledSalesCount} já faturada(s)</span>
            </div>
            <div className="p-3 rounded-xl bg-[#141414] border border-[#252525]">
              <span className="text-[10px] font-bold uppercase text-[#71717A] block">Bruto no Período</span>
              <span className="text-lg font-extrabold text-[#F5F5F5] font-mono tabular-nums">
                {formatCurrency(preview.grossPurchasesTotal)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#141414] border border-[#252525]">
              <span className="text-[10px] font-bold uppercase text-[#71717A] block">Estornos / Já Fat.</span>
              <span className="text-lg font-extrabold text-amber-300 font-mono tabular-nums">
                {formatCurrency(preview.reversalsTotal + preview.alreadyBilledTotal)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-[#141414] border border-[#252525]">
              <span className="text-[10px] font-bold uppercase text-[#71717A] block">Sem Responsável</span>
              <span className="text-lg font-extrabold text-amber-300 tabular-nums">{preview.studentsMissingGuardianCount}</span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
              <span className="text-[10px] font-bold uppercase text-emerald-300 block">Líquido a Faturar</span>
              <span className="text-lg font-extrabold text-emerald-400 font-mono tabular-nums">
                {formatCurrency(preview.totalGrossToBill)}
              </span>
            </div>
          </div>

          {preview.retroactiveSalesInClosedPeriodCount > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Atenção: {preview.retroactiveSalesInClosedPeriodCount} compra(s) elegível(is) neste intervalo pertencem a competência mensal já fechada (consumo retroativo).
              </span>
            </div>
          )}

          {preview.inconsistencies.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {preview.inconsistencies.map((inc, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    inc.severity === 'BLOCKER'
                      ? 'bg-rose-500/10 border border-rose-500/25 text-rose-300'
                      : 'bg-amber-500/10 border border-amber-500/25 text-amber-300'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    <strong>{inc.studentName}:</strong> {inc.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Expandable Per-Student Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-extrabold text-[#F5F5F5] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                Detalhamento por Aluno ({displayedStudents.length})
              </h5>
              <label className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showZeroStudents}
                  onChange={(e) => setShowZeroStudents(e.target.checked)}
                />
                <span>Mostrar alunos sem saldo no período</span>
              </label>
            </div>

            {displayedStudents.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#71717A] border border-dashed border-[#2A2A2A] rounded-xl">
                Nenhum aluno possui consumo elegível pendente dentro do período selecionado.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {displayedStudents.map(st => {
                  const isOpen = Boolean(expandedStudents[st.studentId]);
                  return (
                    <div key={st.studentId} className="rounded-xl bg-[#141414] border border-[#262626] overflow-hidden">
                      <div
                        onClick={() => setExpandedStudents(p => ({ ...p, [st.studentId]: !isOpen }))}
                        className="p-3 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-[#191919]"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#F5F5F5]">{st.studentName}</span>
                            <span className="text-[10px] font-mono text-[#71717A]">{st.registrationNumber}</span>
                            {st.willGenerateInvoice ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Emitirá fatura
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-700/40 text-zinc-400">
                                Ignorado
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-[#71717A] block mt-0.5">
                            Resp: {st.guardiansSummary} • {st.eligibleSalesCount} compra(s) elegível(is)
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-extrabold text-emerald-400 tabular-nums">
                            {formatCurrency(st.grossTotalToBill)}
                          </span>
                          {isOpen ? <ChevronUp className="w-4 h-4 text-[#71717A]" /> : <ChevronDown className="w-4 h-4 text-[#71717A]" />}
                        </div>
                      </div>

                      {isOpen && (
                        <div className="px-3 pb-3 pt-2 border-t border-[#222222] space-y-1.5 bg-[#111111]">
                          {st.sales.length === 0 ? (
                            <span className="text-[11px] text-[#71717A]">Sem compras registradas neste intervalo.</span>
                          ) : (
                            st.sales.map(s => (
                              <div key={s.saleId} className="text-[11px] p-2 rounded-lg bg-[#171717] border border-[#242424]">
                                <div className="flex justify-between font-semibold">
                                  <span className="font-mono text-[#E4E4E7]">
                                    {s.saleId} • {formatDateTime(s.createdAt)}
                                  </span>
                                  <span className={s.isEligible ? 'text-emerald-400 font-mono' : 'text-[#71717A] font-mono'}>
                                    {s.isEligible
                                      ? formatCurrency(s.remainingBillableAmount)
                                      : s.ineligibleReason || s.billingStatus}
                                  </span>
                                </div>
                                <div className="text-[10px] text-[#A1A1AA] mt-1">
                                  {s.items.map(it => `${it.remainingQuantity || it.originalQuantity}x ${it.name}`).join(' • ')}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-[#262626]">
            <button
              type="button"
              disabled={!preview.canProceed || preview.invoicesToCreateCount === 0 || isExecuting}
              onClick={handleExecuteBatch}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-[#0A0A0A] rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isExecuting
                ? 'Emitindo Lote e Notificando...'
                : `2. Confirmar e Emitir ${preview.invoicesToCreateCount} Fatura(s)`}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
