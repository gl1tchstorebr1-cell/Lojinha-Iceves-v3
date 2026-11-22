import React, { useState } from 'react';
import {
  Sliders,
  Trash2,
  Printer,
  Check,
  QrCode,
  Copy,
  CreditCard,
  Save,
  Ban,
  MessageSquare,
  History,
  AlertTriangle
} from 'lucide-react';
import { Invoice, Student, WhatsAppNotification } from '../../types';
import { api } from '../../services/api';
import { formatCurrency, formatDate, formatDateTime, formatPeriod } from '../../utils/formatters';
import { QrCodeDisplay } from '../common/QrCodeDisplay';
import { MercadoPagoCheckoutModal } from '../payment/MercadoPagoCheckoutModal';

interface InvoiceStatementModalProps {
  invoice: Invoice;
  students: Student[];
  whatsappNotifications?: WhatsAppNotification[];
  canEditOrCancel: boolean;
  isAdmin: boolean;
  initialEditing?: boolean;
  onClose: () => void;
  onInvoiceUpdated: (updated: Invoice) => void;
  onInvoiceDeleted: (deletedId: string) => void;
  onRefreshAll: () => void;
}

export function InvoiceStatementModal({
  invoice,
  students,
  whatsappNotifications = [],
  canEditOrCancel,
  isAdmin,
  initialEditing = false,
  onClose,
  onInvoiceUpdated,
  onInvoiceDeleted,
  onRefreshAll
}: InvoiceStatementModalProps) {
  const [isEditingInvoice, setIsEditingInvoice] = useState(initialEditing);
  const [editTuition, setEditTuition] = useState<number>(invoice.tuitionAmount);
  const [editAdjustments, setEditAdjustments] = useState<number>(invoice.adjustmentsTotal || 0);
  const [editDueDate, setEditDueDate] = useState<string>(invoice.dueDate);
  const [editNotes, setEditNotes] = useState<string>(invoice.notes || '');
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [copiedPix, setCopiedPix] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);

  // Controlled Cancellation state
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCanceling, setIsCanceling] = useState(false);

  // Notification retry
  const [isRetryingNotif, setIsRetryingNotif] = useState(false);

  // Delete confirmation inline (avoiding window.confirm)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const calcGross = Math.max(
    0,
    Math.round(((Number(editTuition) || 0) + invoice.canteenConsumptionTotal - (Number(editAdjustments) || 0)) * 100) / 100
  );
  const calcRemaining = Math.max(
    0,
    Math.round((calcGross - invoice.paidTotal) * 100) / 100
  );

  const relatedNotifs = whatsappNotifications.filter(n => n.invoiceId === invoice.id);

  const handleSaveAdjustments = async () => {
    setIsSavingInvoice(true);
    setFeedbackMsg(null);
    try {
      const updated = await api.updateInvoice(invoice.id, {
        tuitionAmount: Number(editTuition) || 0,
        adjustmentsTotal: Number(editAdjustments) || 0,
        dueDate: editDueDate,
        notes: editNotes
      });
      setIsEditingInvoice(false);
      setFeedbackMsg({ type: 'success', text: 'Fatura atualizada com sucesso e histórico auditado!' });
      onInvoiceUpdated(updated);
      onRefreshAll();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro ao salvar ajustes.' });
    } finally {
      setIsSavingInvoice(false);
    }
  };

  const handleControlledCancel = async () => {
    if (cancelReason.trim().length < 3) {
      setFeedbackMsg({ type: 'error', text: 'Informe uma justificativa com pelo menos 3 caracteres para cancelar a fatura.' });
      return;
    }
    setIsCanceling(true);
    setFeedbackMsg(null);
    try {
      const canceled = await api.cancelInvoice(invoice.id, cancelReason.trim());
      setShowCancelPrompt(false);
      setFeedbackMsg({ type: 'success', text: 'Fatura cancelada controladamente. Consumo devolvido para fila de faturamento.' });
      onInvoiceUpdated(canceled);
      onRefreshAll();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro ao cancelar fatura.' });
    } finally {
      setIsCanceling(false);
    }
  };

  const handleRetryNotification = async () => {
    setIsRetryingNotif(true);
    setFeedbackMsg(null);
    try {
      const res = await api.retryInvoiceNotification(invoice.id);
      setFeedbackMsg({
        type: 'success',
        text: `Notificação processada sem duplicar fatura (${res.notifications.length} envio(s)).`
      });
      onRefreshAll();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro ao reenviar notificação.' });
    } finally {
      setIsRetryingNotif(false);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await api.deleteInvoice(invoice.id);
      onInvoiceDeleted(invoice.id);
      onRefreshAll();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro ao excluir fatura.' });
    } finally {
      setIsDeleting(false);
    }
  };

  const copyPixCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2000);
  };

  const student = students.find(s => s.id === invoice.studentId);

  return (
    <>
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-[#1A1A1A] rounded-2xl shadow-2xl border border-[#303030] max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto space-y-4">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#282828] pb-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-white p-0.5 ring-2 ring-emerald-500/40 shadow-md shrink-0 overflow-hidden">
                <img
                  src="/assets/aistudio/image_e4461e45.png"
                  alt="Logo ICEVES"
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
              <div>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold block">
                  DOCUMENTO OFICIAL DE COBRANÇA • ESCOLA DE CRISTO ICEVES
                </span>
                <h3 className="font-extrabold text-[#F5F5F5] text-lg">
                  Fatura & Prestação de Contas — {invoice.billingLabel || formatPeriod(invoice.billingPeriod)}
                </h3>
                <p className="text-xs text-[#A1A1AA] font-mono">
                  Código: <strong className="text-white">{invoice.id}</strong> • Aluno: <strong className="text-white">{invoice.studentName}</strong> ({invoice.registrationNumber})
                  {invoice.batchId && <span className="text-emerald-400"> • Lote {invoice.batchId}</span>}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {canEditOrCancel && invoice.status !== 'CANCELADA' && !isEditingInvoice && (
                <button
                  type="button"
                  onClick={() => setIsEditingInvoice(true)}
                  className="px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Ajustar
                </button>
              )}
              {canEditOrCancel && invoice.status !== 'CANCELADA' && invoice.status !== 'PAGA' && invoice.remainingBalance > 0 && (
                <button
                  type="button"
                  disabled={isRetryingNotif}
                  onClick={handleRetryNotification}
                  className="px-2.5 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Reenviar notificação WhatsApp sem duplicar fatura"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {isRetryingNotif ? 'Enviando...' : 'Notificar'}
                </button>
              )}
              {canEditOrCancel && invoice.status !== 'CANCELADA' && invoice.paidTotal === 0 && (
                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(prev => !prev)}
                  className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title="Cancelar fatura preservando histórico e devolvendo consumo"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(prev => !prev)}
                  className="p-2 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
                  title="Excluir fatura permanentemente"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => window.print()}
                className="p-2 rounded-lg border border-[#303030] hover:bg-[#222222] text-[#A1A1AA] hover:text-white cursor-pointer"
                title="Imprimir / Salvar PDF"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-2 text-[#71717A] hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>
          </div>

          {feedbackMsg && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
              }`}
            >
              {feedbackMsg.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          {/* Controlled Cancel Prompt */}
          {showCancelPrompt && (
            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/35 space-y-2.5">
              <h4 className="text-xs font-extrabold text-rose-300 flex items-center gap-1.5">
                <Ban className="w-4 h-4" />
                Cancelamento Controlado da Fatura
              </h4>
              <p className="text-[11px] text-rose-200/80">
                O registro e a auditoria serão preservados como CANCELADA, e as compras vinculadas voltarão automaticamente para <strong>Consumo Aguardando Faturamento</strong>.
              </p>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Informe o motivo obrigatório do cancelamento..."
                className="w-full px-3 py-2 bg-[#121212] border border-rose-500/35 rounded-xl text-xs text-white"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelPrompt(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#303030] text-xs text-[#A1A1AA] hover:text-white cursor-pointer"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={isCanceling}
                  onClick={handleControlledCancel}
                  className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isCanceling ? 'Cancelando...' : 'Confirmar Cancelamento'}
                </button>
              </div>
            </div>
          )}

          {/* Inline Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-500/40 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-rose-200">
                Confirmar exclusão permanente da fatura <strong>{invoice.id}</strong>?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#303030] text-xs text-zinc-300 cursor-pointer"
                >
                  Não
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
                >
                  {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
                </button>
              </div>
            </div>
          )}

          {invoice.status === 'CANCELADA' && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              <strong>FATURA CANCELADA</strong> em {invoice.canceledAt ? formatDateTime(invoice.canceledAt) : '-'} por{' '}
              {invoice.canceledByUserName || 'Administrador'}. Motivo: {invoice.canceledReason || 'Não informado'}.
            </div>
          )}

          {/* Summary or Edit Mode */}
          {!isEditingInvoice ? (
            <div className="p-4 rounded-xl bg-[#141414] border border-[#262626] text-xs space-y-2">
              <div className="flex justify-between text-[#A1A1AA]">
                <span>Modalidade / Competência:</span>
                <span className="font-semibold text-[#F5F5F5]">
                  {invoice.billingType || 'FECHAMENTO_MENSAL'} • {invoice.periodStart && invoice.periodEnd ? `${formatDate(invoice.periodStart)} a ${formatDate(invoice.periodEnd)}` : formatPeriod(invoice.billingPeriod)}
                </span>
              </div>
              <div className="flex justify-between items-center text-[#A1A1AA]">
                <span>Mensalidade Fixa Escolar:</span>
                <span className="font-semibold text-[#F5F5F5] font-mono tabular-nums">{formatCurrency(invoice.tuitionAmount)}</span>
              </div>
              <div className="flex justify-between text-[#A1A1AA]">
                <span>Total de Consumo da Lojinha:</span>
                <span className="font-semibold text-emerald-400 font-mono tabular-nums">{formatCurrency(invoice.canteenConsumptionTotal)}</span>
              </div>
              {invoice.adjustmentsTotal > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Descontos / Créditos Aplicados{invoice.discountReason ? ` (${invoice.discountReason})` : ''}:</span>
                  <span className="font-semibold font-mono tabular-nums">- {formatCurrency(invoice.adjustmentsTotal)}</span>
                </div>
              )}
              {invoice.notes && (
                <div className="text-[11px] text-zinc-400 bg-[#1A1A1A] p-2 rounded-lg border border-[#262626]">
                  <strong className="text-zinc-300">Observações:</strong> {invoice.notes}
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold text-[#F5F5F5] pt-2 border-t border-[#262626]">
                <span>TOTAL DA FATURA:</span>
                <span className="text-emerald-400 font-mono tabular-nums">{formatCurrency(invoice.grossTotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-emerald-400 font-semibold">
                <span>Pagamentos Confirmados:</span>
                <span className="font-mono tabular-nums">- {formatCurrency(invoice.paidTotal)}</span>
              </div>
              <div className="flex justify-between text-sm font-black text-rose-400 pt-1 border-t border-[#262626]">
                <span>SALDO RESTANTE A PAGAR:</span>
                <span className="font-mono tabular-nums">{formatCurrency(invoice.remainingBalance)}</span>
              </div>
              <div className="flex justify-between text-xs text-[#71717A] pt-1">
                <span>Data de Vencimento:</span>
                <span className="font-bold text-[#F5F5F5]">{formatDate(invoice.dueDate)}</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-gradient-to-br from-[#1C1810] to-[#141414] border border-amber-500/30 text-xs space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#2D2820] pb-2">
                <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                  <Sliders className="w-4 h-4" />
                  <span>Ajustes de Fatura & Vencimento</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-zinc-200 block mb-1">Mensalidade (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editTuition}
                    onChange={(e) => setEditTuition(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full p-2 bg-[#1A1A1A] border border-[#3A3A3A] rounded-lg text-white font-mono font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-200 block mb-1">Desconto / Ajuste (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editAdjustments}
                    onChange={(e) => setEditAdjustments(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full p-2 bg-[#1A1A1A] border border-[#3A3A3A] rounded-lg text-white font-mono font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-zinc-200 block mb-1">Vencimento</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full p-2 bg-[#1A1A1A] border border-[#3A3A3A] rounded-lg text-white text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-200 block mb-1">Justificativa / Observações</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Informe o motivo do ajuste ou observação da cobrança"
                  className="w-full p-2 bg-[#1A1A1A] border border-[#3A3A3A] rounded-lg text-white text-xs"
                />
              </div>

              <div className="p-3 bg-[#131313] rounded-xl border border-[#2A2A2A] font-mono text-xs flex justify-between">
                <span className="text-zinc-300">Novo Total / Restante:</span>
                <span className="text-emerald-400 font-bold">
                  {formatCurrency(calcGross)} / {formatCurrency(calcRemaining)}
                </span>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingInvoice(false)}
                  className="px-3.5 py-2 rounded-xl border border-[#3A3A3A] text-zinc-300 text-xs font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isSavingInvoice}
                  onClick={handleSaveAdjustments}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSavingInvoice ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          )}

          {/* Itemized Consumption */}
          <div className="space-y-2">
            <h4 className="font-bold text-[#F5F5F5] text-xs uppercase tracking-wider">
              Extrato Itemizado do Consumo ({invoice.consumptionItems.length} itens • {invoice.salesIds.length} venda(s))
            </h4>
            {invoice.consumptionItems.length === 0 ? (
              <p className="text-xs text-[#71717A] py-3 text-center">Nenhum consumo de produtos vinculado a esta fatura.</p>
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
                    {invoice.consumptionItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-[#202020]">
                        <td className="py-2 px-3 font-semibold text-[#F5F5F5]">{item.productName}</td>
                        <td className="py-2 px-3 text-[#71717A] text-[11px]">{item.category}</td>
                        <td className="py-2 px-3 text-center font-bold text-[#A1A1AA]">{item.quantity}</td>
                        <td className="py-2 px-3 text-right font-mono text-[#A1A1AA] tabular-nums">
                          {formatCurrency(item.averageUnitPrice)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-[#F5F5F5] tabular-nums">
                          {formatCurrency(item.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pix Code */}
          {invoice.remainingBalance > 0 && invoice.status !== 'CANCELADA' && (
            <div className="p-4 rounded-xl bg-[#151515] border border-[#2E2E2E] space-y-3">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                <h4 className="font-bold text-[#F5F5F5] text-xs uppercase tracking-wider">
                  Instruções para Pagamento via Pix
                </h4>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <QrCodeDisplay
                  value={invoice.pixCopyPasteCode || invoice.pixQrCodePayload}
                  size={96}
                  className="shrink-0"
                  alt={`QR Code Pix Fatura ${invoice.id}`}
                />
                <div className="flex-1 space-y-1.5 w-full">
                  <label className="block text-[11px] font-bold text-[#A1A1AA]">Código Pix Copia e Cola:</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={invoice.pixCopyPasteCode}
                      className="w-full p-2 text-[10px] font-mono bg-[#111111] border border-[#282828] rounded-lg text-[#A1A1AA]"
                    />
                    <button
                      type="button"
                      onClick={() => copyPixCode(invoice.pixCopyPasteCode)}
                      className="px-3 py-2 bg-[#F5F5F5] hover:bg-white text-[#101010] rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedPix ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notification Status & Invoice Audit History */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] space-y-1.5">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA] flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                Notificações Vinculadas ({relatedNotifs.length})
              </h5>
              {relatedNotifs.length === 0 ? (
                <p className="text-[11px] text-[#71717A]">Nenhuma notificação registrada para esta fatura.</p>
              ) : (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {relatedNotifs.map(n => (
                    <div key={n.id} className="text-[11px] flex justify-between text-[#D4D4D8]">
                      <span>{n.recipientName} ({n.recipientRole})</span>
                      <span className={n.status === 'FALHA' ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                        {n.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-[#141414] border border-[#262626] space-y-1.5">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-[#A1A1AA] flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-emerald-400" />
                Histórico da Fatura ({invoice.history?.length || 0})
              </h5>
              {!invoice.history || invoice.history.length === 0 ? (
                <p className="text-[11px] text-[#71717A]">Emitida em {formatDateTime(invoice.createdAt)}.</p>
              ) : (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {invoice.history.map(h => (
                    <div key={h.id} className="text-[10px] text-[#A1A1AA] border-l-2 border-emerald-500/40 pl-2">
                      <span className="text-[#F5F5F5] font-semibold">{h.action}</span> • {h.userName} ({formatDateTime(h.timestamp)})
                      <span className="block text-[#71717A]">{h.details}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
            {invoice.remainingBalance > 0 && invoice.status !== 'CANCELADA' ? (
              <button
                type="button"
                onClick={() => setShowCheckoutModal(true)}
                className="w-full sm:w-auto px-4 py-2.5 bg-[#009EE3] hover:bg-[#008CC9] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <CreditCard className="w-4 h-4" />
                Gerar / Pagar via Mercado Pago (Pix / Cartão)
              </button>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 bg-[#252525] hover:bg-[#303030] text-[#F5F5F5] rounded-xl text-xs font-bold cursor-pointer"
            >
              Fechar Extrato
            </button>
          </div>
        </div>
      </div>

      {showCheckoutModal && (
        <MercadoPagoCheckoutModal
          invoice={invoice}
          payerName={student?.name || invoice.studentName}
          payerEmail={student?.email || 'contato.aluno@gmail.com'}
          payerCpf=""
          onClose={() => setShowCheckoutModal(false)}
          onPaymentSuccess={() => {
            setShowCheckoutModal(false);
            onClose();
            onRefreshAll();
          }}
        />
      )}
    </>
  );
}
