import React, { useState } from 'react';
import { 
  QrCode, 
  CheckCircle2, 
  XCircle, 
  FileCheck, 
  AlertCircle, 
  Search, 
  Clock, 
  User, 
  FileText, 
  Upload, 
  Check, 
  DollarSign 
} from 'lucide-react';
import { PixPayment, Invoice, PixPaymentStatus } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface PixConferenceProps {
  pixPayments: PixPayment[];
  invoices: Invoice[];
  onPaymentReviewed: (payment: PixPayment, invoice: Invoice) => void;
  onPaymentSubmitted: (payment: PixPayment) => void;
}

export function PixConference({ 
  pixPayments, 
  invoices, 
  onPaymentReviewed, 
  onPaymentSubmitted 
}: PixConferenceProps) {
  const { user, isAdmin } = useAuth();

  const [activeTab, setActiveTab] = useState<'pending' | 'history' | 'simulate_counter'>('pending');
  const [searchTerm, setSearchTerm] = useState('');

  // Review Modal state
  const [reviewingPayment, setReviewingPayment] = useState<PixPayment | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APROVADO' | 'REJEITADO'>('APROVADO');
  const [reviewReason, setReviewReason] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Counter simulation form state (Register on counter)
  const [counterInvoiceId, setCounterInvoiceId] = useState('');
  const [counterAmount, setCounterAmount] = useState<number>(0);
  const [counterRef, setCounterRef] = useState('');
  const [counterPayerName, setCounterPayerName] = useState('');
  const [counterNotes, setCounterNotes] = useState('');
  const [isRegisteringCounter, setIsRegisteringCounter] = useState(false);
  const [counterSuccess, setCounterSuccess] = useState(false);
  const [counterError, setCounterError] = useState<string | null>(null);

  const pendingPayments = pixPayments.filter(p => p.status === 'AGUARDANDO_CONFERENCIA');
  const historyPayments = pixPayments.filter(p => p.status !== 'AGUARDANDO_CONFERENCIA');

  const filteredHistory = historyPayments.filter(p => {
    const q = searchTerm.toLowerCase();
    return !q || (
      p.id.toLowerCase().includes(q) ||
      p.studentName.toLowerCase().includes(q) ||
      p.payerName.toLowerCase().includes(q) ||
      p.invoiceCode.toLowerCase().includes(q) ||
      p.transactionReference.toLowerCase().includes(q)
    );
  });

  const openReviewModal = (payment: PixPayment) => {
    setReviewingPayment(payment);
    setReviewDecision('APROVADO');
    setReviewReason('Crédito identificado no extrato bancário oficial da instituição.');
    setReviewError(null);
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingPayment) return;
    if (!reviewReason.trim()) {
      setReviewError('O motivo ou justificativa da decisão é obrigatório para auditoria.');
      return;
    }

    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      const res = await api.reviewPixPayment(reviewingPayment.id, reviewDecision, reviewReason);
      onPaymentReviewed(res.payment, res.invoice);
      setReviewingPayment(null);
    } catch (err: any) {
      setReviewError(err.message || 'Erro ao processar decisão.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleRegisterCounterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!counterInvoiceId) {
      setCounterError('Selecione a fatura.');
      return;
    }
    if (counterAmount <= 0) {
      setCounterError('Informe um valor válido.');
      return;
    }

    setIsRegisteringCounter(true);
    setCounterError(null);

    try {
      const created = await api.submitPixPayment({
        invoiceId: counterInvoiceId,
        amount: counterAmount,
        transactionReference: counterRef || `PIX-BALCAO-${Date.now().toString().slice(-6)}`,
        receiptNotes: `Recebido no balcão por ${user?.name}. Payer: ${counterPayerName || 'Responsável/Aluno'}`,
        receiptAttachment: 'Comprovante_Apresentado_Balcao.pdf'
      });
      onPaymentSubmitted(created);
      setCounterSuccess(true);
      setTimeout(() => {
        setCounterSuccess(false);
        setActiveTab('pending');
      }, 1000);
    } catch (err: any) {
      setCounterError(err.message || 'Erro ao registrar.');
    } finally {
      setIsRegisteringCounter(false);
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Top Banner */}
      <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-[#8B7CFF]" />
            <h2 className="text-lg font-extrabold text-[#F5F5F5] tracking-tight">
              Conferência & Liquidação de Pagamentos Pix
            </h2>
          </div>
          <p className="text-xs text-[#A1A1AA] mt-1">
            Conferência manual obrigatória contra o extrato bancário oficial antes de abater o saldo devedor.
          </p>
        </div>

        <div className="flex bg-[#151515] p-1 rounded-xl border border-[#282828] text-xs">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'pending' ? 'bg-[#282828] text-[#F5F5F5]' : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
            }`}
          >
            <span>Aguardando Conferência</span>
            {pendingPayments.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[#8B7CFF] text-white font-extrabold">
                {pendingPayments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
              activeTab === 'history' ? 'bg-[#282828] text-[#F5F5F5]' : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
            }`}
          >
            Histórico ({historyPayments.length})
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('simulate_counter')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                activeTab === 'simulate_counter' ? 'bg-[#282828] text-[#F5F5F5]' : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
              }`}
            >
              Registrar no Balcão
            </button>
          )}
        </div>
      </div>

      {activeTab === 'pending' ? (
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[#F5F5F5] text-base">Fila de Conferência Manual</h3>
              <p className="text-xs text-[#A1A1AA]">
                Pagamentos informados por alunos ou responsáveis aguardando validação do crédito
              </p>
            </div>
            <span className="text-xs text-[#71717A] font-mono">
              Total pendente: {pendingPayments.length}
            </span>
          </div>

          {pendingPayments.length === 0 ? (
            <div className="py-12 text-center text-[#71717A] space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400 opacity-60" />
              <p className="text-sm font-bold text-[#F5F5F5]">Fila de conferência limpa!</p>
              <p className="text-xs text-[#71717A]">Todos os comprovantes Pix submetidos já foram analisados.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#242424] border border-[#282828] rounded-xl overflow-hidden">
              {pendingPayments.map(payment => (
                <div key={payment.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#202020] transition">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#8B7CFF]">{payment.id}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        Aguardando Análise
                      </span>
                      <span className="text-xs text-[#71717A] font-mono">Fatura: {payment.invoiceCode}</span>
                    </div>

                    <h4 className="font-extrabold text-[#F5F5F5] text-sm">
                      {payment.studentName}
                    </h4>

                    <p className="text-xs text-[#A1A1AA]">
                      Pagador: <strong className="text-white">{payment.payerName}</strong> ({payment.payerRole === 'RESPONSAVEL' ? 'Responsável' : 'Aluno'})
                    </p>

                    <p className="text-[11px] font-mono text-[#71717A]">
                      ID Transação: {payment.transactionReference} • Enviado em {formatDateTime(payment.registeredAt)}
                    </p>

                    {payment.receiptNotes && (
                      <p className="text-xs text-[#D4D4D8] italic bg-[#151515] p-2 rounded-lg mt-1 border border-[#262626]">
                        "{payment.receiptNotes}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-[#71717A] block">Valor Declarado</span>
                      <span className="text-xl font-black text-[#F5F5F5] font-mono">
                        {formatCurrency(payment.amount)}
                      </span>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => openReviewModal(payment)}
                        className="px-4 py-2 bg-[#F5F5F5] hover:bg-white text-[#101010] rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <FileCheck className="w-4 h-4" />
                        Conferir
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      ) : activeTab === 'history' ? (
        /* History Tab */
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por ID, aluno ou pagador..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#151515] border border-[#282828] rounded-xl text-[#F5F5F5] placeholder-[#71717A] focus:outline-none focus:border-[#8B7CFF]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#151515] text-[#71717A] font-bold uppercase tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3 px-4">Pagamento / Fatura</th>
                  <th className="py-3 px-4">Aluno</th>
                  <th className="py-3 px-4">Pagador</th>
                  <th className="py-3 px-4">Valor Liquidado</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4">Conferido Por</th>
                  <th className="py-3 px-4">Decisão & Justificativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredHistory.map(payment => (
                  <tr key={payment.id} className="hover:bg-[#202020] transition">
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-[#F5F5F5] block">{payment.id}</span>
                      <span className="text-[10px] font-mono text-[#71717A]">{payment.invoiceCode}</span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#F5F5F5]">
                      {payment.studentName}
                    </td>
                    <td className="py-3 px-4 text-[#A1A1AA]">
                      {payment.payerName}
                    </td>
                    <td className="py-3 px-4 font-mono font-extrabold text-[#F5F5F5]">
                      {formatCurrency(payment.amount)}
                    </td>
                    <td className="py-3 px-4">
                      {payment.status === 'CONFIRMADO' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Confirmado & Baixado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Rejeitado
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#A1A1AA]">
                      <span className="block font-medium text-white">{payment.reviewedByUserName || '-'}</span>
                      <span className="text-[10px] text-[#71717A]">{formatDateTime(payment.reviewedAt)}</span>
                    </td>
                    <td className="py-3 px-4 max-w-xs text-[#A1A1AA]">
                      <p className="truncate" title={payment.reviewDecisionReason}>
                        {payment.reviewDecisionReason || '-'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      ) : (
        /* Counter Simulation Form */
        <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] shadow-xs p-6 max-w-xl mx-auto space-y-4">
          <div>
            <h3 className="font-extrabold text-[#F5F5F5] text-base">Registrar Recebimento no Balcão</h3>
            <p className="text-xs text-[#A1A1AA]">
              Utilize para registrar recebimento Pix presencial ou transferência bancária.
            </p>
          </div>

          {counterSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Recebimento registrado com sucesso! Direcionando para a fila de conferência...</span>
            </div>
          )}

          {counterError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl">
              {counterError}
            </div>
          )}

          <form onSubmit={handleRegisterCounterPayment} className="space-y-3 text-xs">
            <div>
              <label className="block font-bold text-[#D4D4D8] mb-1">Selecionar Fatura em Aberto</label>
              <select
                value={counterInvoiceId}
                onChange={(e) => {
                  setCounterInvoiceId(e.target.value);
                  const inv = invoices.find(i => i.id === e.target.value);
                  if (inv) {
                    setCounterAmount(inv.remainingBalance);
                    setCounterPayerName(inv.studentName);
                  }
                }}
                className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none"
                required
              >
                <option value="">Selecione a fatura do aluno...</option>
                {invoices.filter(i => i.remainingBalance > 0 && i.status !== 'CANCELADA').map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.id} — {inv.studentName} ({inv.registrationNumber}) — Saldo: {formatCurrency(inv.remainingBalance)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">Valor Recebido (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={counterAmount || ''}
                  onChange={(e) => setCounterAmount(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">Nome do Pagador</label>
                <input
                  type="text"
                  value={counterPayerName}
                  onChange={(e) => setCounterPayerName(e.target.value)}
                  placeholder="Nome de quem pagou"
                  className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-[#D4D4D8] mb-1">Código / Referência da Transação</label>
              <input
                type="text"
                value={counterRef}
                onChange={(e) => setCounterRef(e.target.value)}
                placeholder="Ex: E1842389120261029..."
                className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] font-mono focus:border-[#8B7CFF] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isRegisteringCounter}
              className="w-full py-3 bg-[#F5F5F5] hover:bg-white text-[#101010] rounded-xl font-bold transition disabled:opacity-40 cursor-pointer"
            >
              {isRegisteringCounter ? 'Registrando...' : 'Submeter para Conferência'}
            </button>
          </form>
        </div>
      )}

      {/* Manual Review Modal */}
      {reviewingPayment && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 border-b border-[#282828] pb-3">
              <h3 className="font-extrabold text-[#F5F5F5] text-base">
                Conferência e Decisão de Pagamento Pix
              </h3>
              <button 
                onClick={() => setReviewingPayment(null)}
                className="text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-3.5 bg-[#141414] rounded-xl border border-[#282828] text-xs space-y-1 mb-4">
              <p className="text-[#A1A1AA]">Pagamento ID: <strong className="text-white font-mono">{reviewingPayment.id}</strong></p>
              <p className="text-[#A1A1AA]">Fatura: <strong className="text-white font-mono">{reviewingPayment.invoiceCode}</strong></p>
              <p className="text-[#A1A1AA]">Aluno: <strong className="text-white">{reviewingPayment.studentName}</strong></p>
              <p className="text-[#A1A1AA]">Pagador: <strong className="text-white">{reviewingPayment.payerName}</strong> ({reviewingPayment.payerRole})</p>
              <p className="text-[#A1A1AA]">Valor Declarado: <strong className="text-sm text-emerald-400 font-mono">{formatCurrency(reviewingPayment.amount)}</strong></p>
              <p className="font-mono text-[11px] text-[#71717A]">Ref: {reviewingPayment.transactionReference}</p>
            </div>

            {reviewError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl">
                {reviewError}
              </div>
            )}

            <form onSubmit={handleConfirmReview} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[#F5F5F5] mb-1.5">Decisão da Conferência:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewDecision('APROVADO');
                      setReviewReason('Crédito identificado no extrato bancário oficial da instituição.');
                    }}
                    className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      reviewDecision === 'APROVADO'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-[#151515] text-[#A1A1AA] border-[#282828]'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Aprovar e Quitar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewDecision('REJEITADO');
                      setReviewReason('Transação não localizada no extrato bancário oficial.');
                    }}
                    className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-1.5 cursor-pointer transition ${
                      reviewDecision === 'REJEITADO'
                        ? 'bg-rose-600 text-white border-rose-500'
                        : 'bg-[#151515] text-[#A1A1AA] border-[#282828]'
                    }`}
                  >
                    <XCircle className="w-4 h-4" />
                    Rejeitar Comprovante
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-[#D4D4D8] mb-1">
                  Justificativa da Decisão (Obrigatório para Auditoria):
                </label>
                <textarea
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  rows={3}
                  className="w-full p-2.5 bg-[#141414] border border-[#282828] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewingPayment(null)}
                  className="flex-1 py-2 px-3 border border-[#303030] text-[#A1A1AA] hover:text-white rounded-xl font-semibold hover:bg-[#222222] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className={`flex-1 py-2 px-3 text-white rounded-xl font-bold transition disabled:opacity-40 cursor-pointer ${
                    reviewDecision === 'APROVADO' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {isSubmittingReview ? 'Gravando...' : 'Confirmar Decisão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
