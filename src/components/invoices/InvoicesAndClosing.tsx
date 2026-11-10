import React, { useState } from 'react';
import { 
  FileText, 
  Calendar, 
  CheckCircle, 
  AlertTriangle, 
  ArrowRight, 
  Search, 
  Printer, 
  QrCode, 
  Copy, 
  Download, 
  Eye, 
  Check, 
  Clock, 
  Sparkles,
  ExternalLink,
  CreditCard,
  Sliders,
  Edit3,
  Save,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { Invoice, MonthlyClosingPreview, InvoiceStatus, Student } from '../../types';
import { formatCurrency, formatDate, formatDateTime, formatPeriod } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { QrCodeDisplay } from '../common/QrCodeDisplay';
import { MercadoPagoCheckoutModal } from '../payment/MercadoPagoCheckoutModal';

interface InvoicesAndClosingProps {
  invoices: Invoice[];
  students: Student[];
  onInvoicesUpdated: () => void;
}

export function InvoicesAndClosing({ 
  invoices, 
  students, 
  onInvoicesUpdated 
}: InvoicesAndClosingProps) {
  const { user, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'closing_engine' | 'invoices_list'>('closing_engine');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-10');
  
  // Preview state
  const [preview, setPreview] = useState<MonthlyClosingPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isExecutingClosing, setIsExecutingClosing] = useState(false);
  const [closingResult, setClosingResult] = useState<{ count: number; period: string } | null>(null);
  const [closingError, setClosingError] = useState<string | null>(null);

  // Invoices list filters
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODAS');
  
  // Invoice detailed statement modal & editing
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  // Flexible Tuition & Adjustment editing on Invoice
  const [isEditingInvoice, setIsEditingInvoice] = useState(false);
  const [editTuition, setEditTuition] = useState<number>(0);
  const [editAdjustments, setEditAdjustments] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [invoiceSaveSuccess, setInvoiceSaveSuccess] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const openInvoiceDetails = (invoice: Invoice, startEditing = false) => {
    setSelectedInvoice(invoice);
    setEditTuition(invoice.tuitionAmount);
    setEditAdjustments(invoice.adjustmentsTotal || 0);
    setEditNotes(invoice.notes || '');
    setIsEditingInvoice(startEditing);
    setInvoiceSaveSuccess(false);
  };

  const handleSaveInvoiceAdjustments = async () => {
    if (!selectedInvoice) return;
    setIsSavingInvoice(true);
    try {
      const updated = await api.updateInvoice(selectedInvoice.id, {
        tuitionAmount: Number(editTuition) || 0,
        adjustmentsTotal: Number(editAdjustments) || 0,
        notes: editNotes
      });
      setSelectedInvoice(updated);
      setIsEditingInvoice(false);
      setInvoiceSaveSuccess(true);
      onInvoicesUpdated();
      setTimeout(() => setInvoiceSaveSuccess(false), 2500);
    } catch (err: any) {
      alert(`Erro ao salvar ajustes: ${err.message}`);
    } finally {
      setIsSavingInvoice(false);
    }
  };

  const handleClearAllInvoices = async () => {
    if (!window.confirm('Atenção: Deseja realmente excluir TODAS as faturas emitidas de todos os estudantes? Esta ação limpará o histórico e deixará a base de faturamento 100% limpa.')) {
      return;
    }
    setIsClearingAll(true);
    try {
      const res = await api.clearAllInvoices();
      onInvoicesUpdated();
      setSelectedInvoice(null);
      alert(`Todas as faturas antigas foram excluídas com sucesso (${res.totalDeleted} faturas removidas). A base está limpa.`);
    } catch (err: any) {
      alert(`Erro ao excluir faturas: ${err.message}`);
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId: string, studentName: string) => {
    if (!window.confirm(`Deseja excluir permanentemente a fatura ${invoiceId} do aluno ${studentName}?`)) {
      return;
    }
    try {
      await api.deleteInvoice(invoiceId);
      if (selectedInvoice?.id === invoiceId) {
        setSelectedInvoice(null);
      }
      onInvoicesUpdated();
    } catch (err: any) {
      alert(`Erro ao excluir fatura: ${err.message}`);
    }
  };

  // Generate closing preview
  const handleGeneratePreview = async () => {
    setIsLoadingPreview(true);
    setClosingError(null);
    setClosingResult(null);
    try {
      const data = await api.getClosingPreview(selectedPeriod);
      setPreview(data);
    } catch (err: any) {
      setClosingError(err.message || 'Erro ao gerar prévia de fechamento.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Execute closing and publish invoices
  const handleExecuteClosing = async () => {
    if (!preview || !preview.canProceed) return;

    setIsExecutingClosing(true);
    setClosingError(null);
    try {
      const res = await api.executeMonthlyClosing(selectedPeriod);
      setClosingResult({ count: res.invoicesCreated, period: res.period });
      setPreview(null);
      onInvoicesUpdated();
      setActiveTab('invoices_list');
    } catch (err: any) {
      setClosingError(err.message || 'Erro ao executar fechamento.');
    } finally {
      setIsExecutingClosing(false);
    }
  };

  // Filter invoices
  const filteredInvoices = invoices.filter(inv => {
    const q = invoiceSearch.toLowerCase();
    const matchesSearch = !q || (
      inv.id.toLowerCase().includes(q) ||
      inv.studentName.toLowerCase().includes(q) ||
      inv.registrationNumber.toLowerCase().includes(q)
    );
    const matchesStatus = statusFilter === 'TODAS' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: InvoiceStatus) => {
    switch (status) {
      case 'PAGA':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Quitada / Paga</span>;
      case 'PARCIALMENTE_PAGA':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Parcialmente Paga</span>;
      case 'PUBLICADA':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#8B7CFF]/10 text-[#8B7CFF] border border-[#8B7CFF]/20">Publicada (Em Aberto)</span>;
      case 'VENCIDA':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">Vencida</span>;
      case 'AGUARDANDO_APROVACAO':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">Aguardando Aprovação</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#222222] text-[#A1A1AA]">{status}</span>;
    }
  };

  const copyPixCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2000);
  };

  return (
    <div className="space-y-5">
      
      {/* Top Banner */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#8B7CFF]" />
            <h2 className="text-lg font-extrabold text-[#F5F5F5] tracking-tight">
              Faturas & Fechamento Mensal
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Motor financeiro que consolida consumo da lojinha, mensalidade e saldos com garantia de idempotência.
          </p>
        </div>

        <div className="flex bg-[#151515] p-1 rounded-xl border border-[#282828] text-xs">
          <button
            onClick={() => setActiveTab('closing_engine')}
            className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
              activeTab === 'closing_engine' ? 'bg-[#282828] text-[#F5F5F5]' : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
            }`}
          >
            Rotina de Fechamento
          </button>
          <button
            onClick={() => setActiveTab('invoices_list')}
            className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
              activeTab === 'invoices_list' ? 'bg-[#282828] text-[#F5F5F5]' : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
            }`}
          >
            Faturas Emitidas ({invoices.length})
          </button>
        </div>
      </div>

      {activeTab === 'closing_engine' ? (
        <div className="space-y-6">
          
          {/* ULTRA-INTUITIVE 1-CLICK CLOSING WIZARD CARD */}
          <div className="bg-gradient-to-br from-[#1F1B2C] to-[#161616] rounded-2xl border border-[#8B7CFF]/30 p-6 shadow-xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-[#8B7CFF]/20 text-[#8B7CFF] border border-[#8B7CFF]/40 mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Assistente Inteligente de Fechamento & Faturamento
                </span>
                <h3 className="text-xl font-black text-white tracking-tight">
                  Geração de Faturas da Competência
                </h3>
                <p className="text-xs text-[#A1A1AA] mt-1 max-w-xl">
                  Consolide a mensalidade escolar e o consumo da lojinha de todos os alunos ativos em um único clique, com geração automática do Pix Copia e Cola e notificação por WhatsApp.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={selectedPeriod}
                  onChange={(e) => {
                    setSelectedPeriod(e.target.value);
                    setPreview(null);
                    setClosingResult(null);
                  }}
                  className="px-4 py-2.5 border border-[#3A3A3A] rounded-xl text-xs font-bold bg-[#151515] text-white focus:border-[#8B7CFF] focus:outline-none shadow-sm"
                >
                  <option value="2026-10">Outubro / 2026 (Competência Atual)</option>
                  <option value="2026-11">Novembro / 2026</option>
                  <option value="2026-09">Setembro / 2026</option>
                </select>

                {!preview ? (
                  <button
                    type="button"
                    disabled={isLoadingPreview}
                    onClick={handleGeneratePreview}
                    className="px-5 py-2.5 bg-[#8B7CFF] hover:bg-[#7A6AEE] text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-lg disabled:opacity-40 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    {isLoadingPreview ? 'Calculando Prévia...' : 'Gerar Faturas do Mês'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isExecutingClosing || !preview.canProceed}
                    onClick={handleExecuteClosing}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center gap-2 shadow-lg disabled:opacity-40 cursor-pointer animate-pulse"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {isExecutingClosing ? 'Publicando...' : 'Confirmar & Publicar'}
                  </button>
                )}
              </div>
            </div>

            {/* Error or Success banner */}
            {closingError && (
              <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{closingError}</span>
              </div>
            )}

            {closingResult && (
              <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs rounded-xl space-y-1">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
                  <CheckCircle className="w-4 h-4" />
                  <span>Fechamento de {formatPeriod(closingResult.period)} concluído com sucesso!</span>
                </div>
                <p>
                  Foram emitidas e publicadas <strong>{closingResult.count} faturas</strong> oficiais. Os responsáveis e alunos já podem acessar o portal para efetuar o pagamento.
                </p>
              </div>
            )}
          </div>

          {/* Generated Preview Block */}
          {preview && (
            <div className="bg-[#1B1B1B] rounded-2xl border border-[#3A3A3A] shadow-2xl p-6 space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#262626] pb-4">
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-1">
                    Prévia Calculada com Sucesso
                  </span>
                  <h3 className="text-lg font-black text-white">
                    Resumo do Fechamento — {formatPeriod(preview.period)}
                  </h3>
                  <p className="text-xs text-[#A1A1AA]">
                    Verifique abaixo os valores consolidados. Clique em "Confirmar & Publicar" para disponibilizar as faturas.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="px-4 py-2 bg-[#252525] hover:bg-[#303030] text-[#A1A1AA] hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Cancelar Prévia
                  </button>
                  <button
                    type="button"
                    disabled={isExecutingClosing || !preview.canProceed}
                    onClick={handleExecuteClosing}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition shadow-md flex items-center gap-2 disabled:opacity-40 cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {isExecutingClosing ? 'Publicando...' : 'Confirmar & Publicar Faturas'}
                  </button>
                </div>
              </div>

              {/* Preview KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-[#141414] rounded-xl border border-[#262626]">
                  <span className="text-[10px] font-bold text-[#71717A] uppercase">Alunos Elegíveis</span>
                  <span className="block text-xl font-black text-white mt-1">{preview.studentsCount} alunos</span>
                </div>
                <div className="p-4 bg-[#141414] rounded-xl border border-[#262626]">
                  <span className="text-[10px] font-bold text-[#71717A] uppercase">Mensalidades Base</span>
                  <span className="block text-xl font-black text-white font-mono mt-1">{formatCurrency(preview.totalTuitions)}</span>
                </div>
                <div className="p-4 bg-[#141414] rounded-xl border border-[#262626]">
                  <span className="text-[10px] font-bold text-[#71717A] uppercase">Consumo na Lojinha</span>
                  <span className="block text-xl font-black text-[#8B7CFF] font-mono mt-1">{formatCurrency(preview.totalConsumptions)}</span>
                </div>
                <div className="p-4 bg-[#1C182C] rounded-xl border border-[#483B80]">
                  <span className="text-[10px] font-bold text-[#8B7CFF] uppercase">Total Geral a Faturar</span>
                  <span className="block text-xl font-black text-white font-mono mt-1">{formatCurrency(preview.totalGrossToBill)}</span>
                </div>
              </div>

              {/* Inconsistencies or Warnings Box */}
              {preview.inconsistencies.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-[#A1A1AA] uppercase">Avisos e Pendências Identificadas:</h4>
                  <div className="space-y-1.5">
                    {preview.inconsistencies.map((inc, i) => (
                      <div 
                        key={i} 
                        className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                          inc.severity === 'BLOCKER' 
                            ? 'bg-rose-500/15 border-rose-500/30 text-rose-300' 
                            : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span><strong>{inc.studentName}:</strong> {inc.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* List of students preview */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2.5">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Detalhamento por Aluno</h4>
                  <span className="text-[11px] text-zinc-400">
                    Altere ou remova a mensalidade em <strong className="text-zinc-200">Alunos & Responsáveis</strong> ou desative globalmente em <strong className="text-zinc-200">Configurações</strong>.
                  </span>
                </div>
                <div className="divide-y divide-[#242424] border border-[#262626] rounded-xl overflow-hidden text-xs bg-[#141414]">
                  {students.filter(s => s.status === 'ACTIVE').map(student => {
                    const studentTuition = preview.totalTuitions === 0 ? 0 : (student.defaultTuition || 0);
                    const studentTotal = studentTuition + student.currentConsumptionBalance;
                    return (
                      <div key={student.id} className="p-3.5 flex items-center justify-between hover:bg-[#1C1C1C] transition">
                        <div>
                          <span className="font-bold text-white text-sm">{student.name}</span>
                          <span className="text-[#8B7CFF] font-mono ml-2 text-xs">({student.registrationNumber})</span>
                          <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                            Mensalidade: {studentTuition === 0 ? <span className="text-amber-400 font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded text-[10px]">Isento / R$ 0,00</span> : formatCurrency(studentTuition)} • Consumo Lojinha: <strong className="text-white">{formatCurrency(student.currentConsumptionBalance)}</strong>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-white font-mono text-base block">
                            {formatCurrency(studentTotal)}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                            Pronto para Faturar
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* Quick Info Cards when no preview is active */}
          {!preview && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#151515] rounded-2xl p-5 border border-[#282828] space-y-2">
                <span className="w-8 h-8 rounded-xl bg-[#8B7CFF]/15 text-[#8B7CFF] flex items-center justify-center font-black text-xs">1</span>
                <h4 className="font-bold text-white text-sm">Clique em Gerar Faturas</h4>
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  O sistema agrupa automaticamente todos os produtos consumidos no balcão e soma à mensalidade fixa do mês.
                </p>
              </div>

              <div className="bg-[#151515] rounded-2xl p-5 border border-[#282828] space-y-2">
                <span className="w-8 h-8 rounded-xl bg-[#8B7CFF]/15 text-[#8B7CFF] flex items-center justify-center font-black text-xs">2</span>
                <h4 className="font-bold text-white text-sm">Conferência com 1 Clique</h4>
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  Analise a prévia detalhada com valores por aluno, avisos de pendência e totalizadores antes de aprovar.
                </p>
              </div>

              <div className="bg-[#151515] rounded-2xl p-5 border border-[#282828] space-y-2">
                <span className="w-8 h-8 rounded-xl bg-[#8B7CFF]/15 text-[#8B7CFF] flex items-center justify-center font-black text-xs">3</span>
                <h4 className="font-bold text-white text-sm">Pix & Notificação WhatsApp</h4>
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  Ao publicar, cada fatura recebe um QR Code Pix Copia e Cola único e um aviso automático no WhatsApp da família.
                </p>
              </div>
            </div>
          )}

        </div>
      ) : (
        /* Invoices List Tab */
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs p-5 space-y-4">
          
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-2.5" />
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="Buscar por código ou aluno..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-[#8B7CFF]"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
              <div className="flex items-center gap-1.5">
                {['TODAS', 'PUBLICADA', 'PARCIALMENTE_PAGA', 'PAGA', 'VENCIDA'].map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                      statusFilter === st ? 'bg-[#282828] text-[#F5F5F5] border border-[#3A3A3A]' : 'bg-[#151515] text-[#A1A1AA] hover:text-[#F5F5F5]'
                    }`}
                  >
                    {st === 'TODAS' ? 'Todas' : st.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {isAdmin && invoices.length > 0 && (
                <button
                  type="button"
                  disabled={isClearingAll}
                  onClick={handleClearAllInvoices}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 cursor-pointer disabled:opacity-50 shrink-0 ml-auto"
                  title="Excluir todas as faturas de todos os estudantes"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {isClearingAll ? 'Limpando...' : 'Limpar Todas as Faturas'}
                </button>
              )}
            </div>
          </div>

          {/* Invoices Table or Empty Clean State */}
          {filteredInvoices.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3 bg-[#151515] rounded-xl border border-[#242424] my-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-white text-sm">Nenhuma Fatura no Momento (Base 100% Limpa)</h4>
                <p className="text-xs text-zinc-400 max-w-md mx-auto">
                  Todas as faturas antigas foram removidas. Os saldos e extratos de todos os estudantes estão zerados e prontos para novos fechamentos.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('closing_engine')}
                className="px-4 py-2 bg-[#8B7CFF] hover:bg-[#7A6AE6] text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm inline-flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                Ir para Fechamento Mensal
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Identificador</th>
                  <th className="py-3 px-4">Aluno / Matrícula</th>
                  <th className="py-3 px-4">Competência</th>
                  <th className="py-3 px-4">Mensalidade</th>
                  <th className="py-3 px-4">Lojinha</th>
                  <th className="py-3 px-4">Total Faturado</th>
                  <th className="py-3 px-4">Saldo Pendente</th>
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-right">Extrato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredInvoices.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-[#202020] transition">
                    <td className="py-3 px-4 font-mono font-bold text-[#F5F5F5]">
                      {invoice.id}
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-semibold text-[#F5F5F5] block">{invoice.studentName}</span>
                      <span className="text-[10px] font-mono text-[#71717A]">{invoice.registrationNumber}</span>
                    </td>

                    <td className="py-3 px-4 text-[#A1A1AA]">
                      {formatPeriod(invoice.billingPeriod)}
                    </td>

                    <td className="py-3 px-4 font-mono text-[#A1A1AA]">
                      {formatCurrency(invoice.tuitionAmount)}
                    </td>

                    <td className="py-3 px-4 font-mono font-semibold text-[#8B7CFF]">
                      {formatCurrency(invoice.canteenConsumptionTotal)}
                    </td>

                    <td className="py-3 px-4 font-mono font-extrabold text-[#F5F5F5]">
                      {formatCurrency(invoice.grossTotal)}
                    </td>

                    <td className="py-3 px-4 font-mono font-extrabold">
                      <span className={invoice.remainingBalance === 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {formatCurrency(invoice.remainingBalance)}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono text-[#71717A]">
                      {formatDate(invoice.dueDate)}
                    </td>

                    <td className="py-3 px-4">
                      {getStatusBadge(invoice.status)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isAdmin && (
                          <button
                            onClick={() => openInvoiceDetails(invoice, true)}
                            className="px-2 py-1 rounded-lg bg-[#222222] hover:bg-[#2A2A2A] text-amber-300 text-[11px] font-bold border border-amber-500/20 transition flex items-center gap-1 cursor-pointer"
                            title="Ajustar ou remover mensalidade"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                            Ajustar
                          </button>
                        )}
                        <button
                          onClick={() => openInvoiceDetails(invoice, false)}
                          className="px-2.5 py-1 rounded-lg bg-[#222222] hover:bg-[#2A2A2A] text-[#8B7CFF] text-[11px] font-bold border border-[#303030] transition flex items-center gap-1 cursor-pointer"
                          title="Abrir extrato detalhado"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Extrato
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteInvoice(invoice.id, invoice.studentName)}
                            className="p-1 rounded-lg bg-[#222222] hover:bg-rose-500/20 text-[#71717A] hover:text-rose-400 border border-[#303030] hover:border-rose-500/30 transition cursor-pointer"
                            title="Excluir fatura"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

        </div>
      )}

      {/* Invoice Detailed Statement Modal */}
      {selectedInvoice && (() => {
        const calcGross = Math.max(
          0,
          Math.round(((Number(editTuition) || 0) + selectedInvoice.canteenConsumptionTotal - (Number(editAdjustments) || 0)) * 100) / 100
        );
        const calcRemaining = Math.max(
          0,
          Math.round((calcGross - selectedInvoice.paidTotal) * 100) / 100
        );

        return (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-2xl w-full p-6 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
              
              <div className="flex items-center justify-between border-b border-[#282828] pb-4">
                <div>
                  <span className="text-[10px] font-mono text-[#71717A]">DOCUMENTO OFICIAL DE COBRANÇA</span>
                  <h3 className="font-extrabold text-[#F5F5F5] text-lg">
                    Fatura & Prestação de Contas — {formatPeriod(selectedInvoice.billingPeriod)}
                  </h3>
                  <p className="text-xs text-[#A1A1AA] font-mono">
                    Código: <strong className="text-white">{selectedInvoice.id}</strong> • Aluno: <strong className="text-white">{selectedInvoice.studentName}</strong> ({selectedInvoice.registrationNumber})
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {isAdmin && !isEditingInvoice && (
                    <button
                      type="button"
                      onClick={() => setIsEditingInvoice(true)}
                      className="px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      title="Editar ou zerar mensalidade"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      Ajustar Mensalidade
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteInvoice(selectedInvoice.id, selectedInvoice.studentName)}
                      className="p-2 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition cursor-pointer"
                      title="Excluir esta fatura permanentemente"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="p-2 rounded-lg border border-[#303030] hover:bg-[#222222] text-[#A1A1AA] hover:text-white cursor-pointer"
                    title="Imprimir"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => { setSelectedInvoice(null); setIsEditingInvoice(false); }}
                    className="text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {invoiceSaveSuccess && (
                <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Fatura e valores de mensalidade atualizados com sucesso! Código Pix regerado.</span>
                </div>
              )}

              {/* Financial Summary Breakdown (View Mode vs Edit Mode) */}
              {!isEditingInvoice ? (
                <div className="mt-4 p-4 rounded-xl bg-[#141414] border border-[#262626] text-xs space-y-2">
                  <div className="flex justify-between items-center text-[#A1A1AA]">
                    <span>Mensalidade Fixa Escolar:</span>
                    <div className="flex items-center gap-2">
                      {selectedInvoice.tuitionAmount === 0 ? (
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-bold">
                          Isento (R$ 0,00)
                        </span>
                      ) : null}
                      <span className="font-semibold text-[#F5F5F5] font-mono">{formatCurrency(selectedInvoice.tuitionAmount)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-[#A1A1AA]">
                    <span>Total de Consumo da Lojinha:</span>
                    <span className="font-semibold text-[#8B7CFF] font-mono">{formatCurrency(selectedInvoice.canteenConsumptionTotal)}</span>
                  </div>
                  {selectedInvoice.adjustmentsTotal > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Descontos / Ajustes Aplicados:</span>
                      <span className="font-semibold font-mono">- {formatCurrency(selectedInvoice.adjustmentsTotal)}</span>
                    </div>
                  )}
                  {selectedInvoice.previousBalance > 0 && (
                    <div className="flex justify-between text-[#A1A1AA]">
                      <span>Saldo Devedor Anterior:</span>
                      <span className="font-semibold text-amber-400 font-mono">{formatCurrency(selectedInvoice.previousBalance)}</span>
                    </div>
                  )}
                  {selectedInvoice.notes && (
                    <div className="text-[11px] text-zinc-400 bg-[#1A1A1A] p-2 rounded-lg border border-[#262626] mt-1">
                      <strong className="text-zinc-300">Observações:</strong> {selectedInvoice.notes}
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-extrabold text-[#F5F5F5] pt-2 border-t border-[#262626]">
                    <span>TOTAL DA FATURA:</span>
                    <span className="text-[#8B7CFF] font-mono">{formatCurrency(selectedInvoice.grossTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-emerald-400 font-semibold">
                    <span>Pagamentos Confirmados:</span>
                    <span className="font-mono">- {formatCurrency(selectedInvoice.paidTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-rose-400 pt-1 border-t border-[#262626]">
                    <span>SALDO RESTANTE A PAGAR:</span>
                    <span className="font-mono">{formatCurrency(selectedInvoice.remainingBalance)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-[#71717A] pt-1">
                    <span>Data de Vencimento:</span>
                    <span className="font-bold text-[#F5F5F5]">{formatDate(selectedInvoice.dueDate)}</span>
                  </div>
                </div>
              ) : (
                /* Interactive Tuition & Adjustments Editor */
                <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-[#1C1810] to-[#141414] border border-amber-500/30 text-xs space-y-3.5">
                  <div className="flex items-center justify-between border-b border-[#2D2820] pb-2">
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                      <Sliders className="w-4 h-4" />
                      <span>Ajustes Flexíveis de Mensalidade & Fatura</span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">Modo Administrador</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-zinc-200 block">
                        Valor da Mensalidade Escolar (R$)
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400 font-mono font-bold">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editTuition}
                          onChange={(e) => setEditTuition(Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full p-2 bg-[#1A1A1A] border border-[#3A3A3A] focus:border-amber-400 rounded-lg text-white font-mono font-bold text-xs outline-none"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditTuition(0)}
                          className="px-2 py-0.5 bg-[#252525] hover:bg-[#303030] text-amber-300 rounded text-[10px] font-bold border border-amber-500/30 cursor-pointer"
                        >
                          Zerar / Isento (R$ 0)
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditTuition(375)}
                          className="px-2 py-0.5 bg-[#252525] hover:bg-[#303030] text-purple-300 rounded text-[10px] font-bold border border-purple-500/30 cursor-pointer"
                        >
                          Bolsa 50% (R$ 375)
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditTuition(750)}
                          className="px-2 py-0.5 bg-[#252525] hover:bg-[#303030] text-emerald-300 rounded text-[10px] font-bold border border-emerald-500/30 cursor-pointer"
                        >
                          Padrão (R$ 750)
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-zinc-200 block">
                        Desconto / Ajuste Especial (R$)
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400 font-mono font-bold">- R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editAdjustments}
                          onChange={(e) => setEditAdjustments(Math.max(0, parseFloat(e.target.value) || 0))}
                          placeholder="0.00"
                          className="w-full p-2 bg-[#1A1A1A] border border-[#3A3A3A] focus:border-amber-400 rounded-lg text-white font-mono font-bold text-xs outline-none"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-400 pt-1">
                        Abate diretamente do valor final da fatura.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-zinc-200 block">
                      Motivo do Ajuste / Observações
                    </label>
                    <input
                      type="text"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Ex: Bolsa parcial autorizada pela diretoria, isenção de mensalidade..."
                      className="w-full p-2 bg-[#1A1A1A] border border-[#3A3A3A] focus:border-amber-400 rounded-lg text-white text-xs outline-none"
                    />
                  </div>

                  {/* Pré-visualização do Cálculo */}
                  <div className="p-3 bg-[#131313] rounded-xl border border-[#2A2A2A] space-y-1.5 font-mono text-xs">
                    <div className="flex justify-between text-zinc-400">
                      <span>Consumo da Lojinha:</span>
                      <span>{formatCurrency(selectedInvoice.canteenConsumptionTotal)}</span>
                    </div>
                    <div className="flex justify-between text-amber-300">
                      <span>Nova Mensalidade:</span>
                      <span>+ {formatCurrency(Number(editTuition) || 0)}</span>
                    </div>
                    {Number(editAdjustments) > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Desconto Aplicado:</span>
                        <span>- {formatCurrency(Number(editAdjustments) || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-white border-t border-[#2A2A2A] pt-1 text-sm">
                      <span>Novo Total da Fatura:</span>
                      <span className="text-[#8B7CFF]">{formatCurrency(calcGross)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-rose-400 text-xs">
                      <span>Novo Saldo Restante a Pagar:</span>
                      <span>{formatCurrency(calcRemaining)}</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSavingInvoice}
                      onClick={() => setIsEditingInvoice(false)}
                      className="px-3.5 py-2 rounded-xl border border-[#3A3A3A] text-zinc-300 hover:text-white hover:bg-[#252525] text-xs font-semibold cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={isSavingInvoice}
                      onClick={handleSaveInvoiceAdjustments}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {isSavingInvoice ? 'Salvando...' : 'Salvar Alterações da Fatura'}
                    </button>
                  </div>
                </div>
              )}

            {/* Itemized Canteen Consumption */}
            <div className="mt-5 space-y-2">
              <h4 className="font-bold text-[#F5F5F5] text-xs uppercase tracking-wider">
                Extrato Itemizado do Consumo na Lojinha ({selectedInvoice.consumptionItems.length} itens)
              </h4>

              {selectedInvoice.consumptionItems.length === 0 ? (
                <p className="text-xs text-[#71717A] py-3 text-center">Nenhum consumo no caixa registrado nesta competência.</p>
              ) : (
                <div className="border border-[#282828] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-2 px-3">Produto</th>
                        <th className="py-2 px-3">Categoria</th>
                        <th className="py-2 px-3 text-center">Qtd</th>
                        <th className="py-2 px-3 text-right">Preço Unit.</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#242424]">
                      {selectedInvoice.consumptionItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-[#202020]">
                          <td className="py-2 px-3 font-semibold text-[#F5F5F5]">{item.productName}</td>
                          <td className="py-2 px-3 text-[#71717A] text-[11px]">{item.category}</td>
                          <td className="py-2 px-3 text-center font-bold text-[#A1A1AA]">{item.quantity}</td>
                          <td className="py-2 px-3 text-right font-mono text-[#A1A1AA]">{formatCurrency(item.averageUnitPrice)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-[#F5F5F5]">{formatCurrency(item.totalAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pix Payment Code Box */}
            {selectedInvoice.remainingBalance > 0 && (
              <div className="mt-5 p-4 rounded-xl bg-[#151515] border border-[#2E2E2E] space-y-3">
                <div className="flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[#8B7CFF]" />
                  <h4 className="font-bold text-[#F5F5F5] text-xs uppercase tracking-wider">
                    Instruções para Pagamento via Pix
                  </h4>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <QrCodeDisplay 
                    value={selectedInvoice.pixCopyPasteCode || selectedInvoice.pixQrCodePayload} 
                    size={96} 
                    className="shrink-0"
                    alt={`QR Code Pix Fatura ${selectedInvoice.id}`}
                  />
                  <div className="flex-1 space-y-1.5 w-full">
                    <label className="block text-[11px] font-bold text-[#A1A1AA]">
                      Código Pix Copia e Cola:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={selectedInvoice.pixCopyPasteCode}
                        className="w-full p-2 text-[10px] font-mono bg-[#111111] border border-[#282828] rounded-lg text-[#A1A1AA] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => copyPixCode(selectedInvoice.pixCopyPasteCode)}
                        className="px-3 py-2 bg-[#F5F5F5] hover:bg-white text-[#101010] rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedPix ? 'Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              {selectedInvoice.remainingBalance > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(true)}
                  className="w-full sm:w-auto px-4 py-2.5 bg-[#009EE3] hover:bg-[#008CC9] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <CreditCard className="w-4 h-4" />
                  Gerar / Pagar via Mercado Pago (Pix / Cartão)
                </button>
              ) : <div />}

              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="w-full sm:w-auto px-4 py-2 bg-[#252525] hover:bg-[#303030] text-[#F5F5F5] rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Fechar Extrato
              </button>
            </div>

          </div>
        </div>
      )})()}

      {showCheckoutModal && selectedInvoice && (
        <MercadoPagoCheckoutModal
          invoice={selectedInvoice}
          payerName={(() => {
            const student = students.find(s => s.id === selectedInvoice.studentId);
            return student?.name || selectedInvoice.studentName;
          })()}
          payerEmail={(() => {
            const student = students.find(s => s.id === selectedInvoice.studentId);
            return student?.email || 'contato.aluno@gmail.com';
          })()}
          payerCpf=""
          onClose={() => setShowCheckoutModal(false)}
          onPaymentSuccess={() => {
            setShowCheckoutModal(false);
            setSelectedInvoice(null);
            onInvoicesUpdated();
          }}
        />
      )}

    </div>
  );
}
