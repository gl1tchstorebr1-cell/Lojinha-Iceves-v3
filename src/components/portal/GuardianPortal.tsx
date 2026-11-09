import React, { useState } from 'react';
import { 
  Users, 
  FileText, 
  QrCode, 
  Check, 
  Copy, 
  Upload, 
  Printer, 
  Calendar, 
  AlertCircle, 
  ShieldCheck, 
  CreditCard,
  ChevronRight,
  Eye
} from 'lucide-react';
import { Guardian, Student, Invoice, Sale, PixPayment } from '../../types';
import { formatCurrency, formatDate, formatDateTime, formatPeriod } from '../../utils/formatters';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { MercadoPagoCheckoutModal } from '../payment/MercadoPagoCheckoutModal';
import { QrCodeDisplay } from '../common/QrCodeDisplay';

interface GuardianPortalProps {
  guardian: Guardian;
  students: Student[];
  invoices: Invoice[];
  sales: Sale[];
  pixPayments: PixPayment[];
  onPaymentSubmitted: (payment: PixPayment) => void;
}

export function GuardianPortal({ 
  guardian, 
  students, 
  invoices, 
  sales, 
  pixPayments, 
  onPaymentSubmitted 
}: GuardianPortalProps) {
  const { user } = useAuth();

  // STRICT RBAC: Authorized students ONLY
  const authorizedStudents = students.filter(s => guardian.studentIds.includes(s.id));
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    authorizedStudents[0]?.id || ''
  );

  const selectedStudent = authorizedStudents.find(s => s.id === selectedStudentId);

  // Invoices of the selected student
  const studentInvoices = invoices.filter(
    i => i.studentId === selectedStudentId && i.status !== 'CANCELADA'
  );

  // Sales of the selected student
  const studentSales = sales.filter(s => s.studentId === selectedStudentId);

  // Pix payment state
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [transactionRef, setTransactionRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isSubmittingPix, setIsSubmittingPix] = useState(false);
  const [pixSuccess, setPixSuccess] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);
  const [copiedPixId, setCopiedPixId] = useState<string | null>(null);
  const [mpCheckoutInvoice, setMpCheckoutInvoice] = useState<Invoice | null>(null);

  // Stripe Checkout Modal state
  const [stripeModalInvoice, setStripeModalInvoice] = useState<Invoice | null>(null);
  const [isStripeLoading, setIsStripeLoading] = useState(false);

  // View detailed consumption modal
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  const copyPix = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedPixId(id);
    setTimeout(() => setCopiedPixId(null), 2000);
  };

  const openPaymentModal = (invoice: Invoice) => {
    setSelectedInvoiceForPayment(invoice);
    setPaymentAmount(invoice.remainingBalance);
    setTransactionRef(`E18423891202610${Date.now().toString().slice(-6)}`);
    setPaymentNotes('');
    setPixError(null);
    setPixSuccess(false);
  };

  const handleSubmitPixPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceForPayment) return;
    if (paymentAmount <= 0) {
      setPixError('O valor informado deve ser maior que zero.');
      return;
    }

    setIsSubmittingPix(true);
    setPixError(null);

    try {
      const created = await api.submitPixPayment({
        invoiceId: selectedInvoiceForPayment.id,
        amount: paymentAmount,
        transactionReference: transactionRef,
        receiptNotes: paymentNotes || `Comprovante enviado pelo Responsável Financeiro (${guardian.name})`,
        receiptAttachment: 'Comprovante_Responsavel.pdf'
      });
      onPaymentSubmitted(created);
      setPixSuccess(true);
      setTimeout(() => {
        setSelectedInvoiceForPayment(null);
        setPixSuccess(false);
      }, 1500);
    } catch (err: any) {
      setPixError(err.message || 'Erro ao submeter comprovante.');
    } finally {
      setIsSubmittingPix(false);
    }
  };

  const handleStartStripe = (invoice: Invoice) => {
    setStripeModalInvoice(invoice);
  };

  const handleConfirmStripePayment = async () => {
    if (!stripeModalInvoice || !selectedStudent) return;
    setIsStripeLoading(true);
    try {
      await api.createStripeCheckoutSession({
        invoiceId: stripeModalInvoice.id,
        amount: stripeModalInvoice.remainingBalance,
        studentId: selectedStudent.id
      });

      await api.fulfillStripePayment({
        invoiceId: stripeModalInvoice.id,
        amount: stripeModalInvoice.remainingBalance,
        transactionRef: `ch_test_${Math.random().toString(36).substring(2, 12)}`
      });

      alert('Pagamento processado com sucesso via Stripe Payments (Test Mode)! Fatura quitada.');
      setStripeModalInvoice(null);
      window.location.reload();
    } catch (err: any) {
      alert(`Erro no pagamento Stripe: ${err.message}`);
    } finally {
      setIsStripeLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Guardian Welcome Header - Dark Theme */}
      <div className="bg-[#1B1B1B] rounded-2xl p-6 border border-[#282828] relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] bg-[#8B7CFF]/15 text-[#8B7CFF] font-semibold px-2.5 py-0.5 rounded-md border border-[#8B7CFF]/30 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Portal da Família / Responsável Financeiro
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#F5F5F5] tracking-tight">
              {guardian.name}
            </h2>
            <p className="text-xs text-[#A1A1AA]">
              CPF: <span className="font-mono text-[#F5F5F5]">{guardian.cpf}</span> • Contato: {guardian.phone} • {guardian.email}
            </p>
          </div>

          <div className="bg-[#151515] p-3.5 rounded-xl border border-[#282828] text-xs max-w-sm">
            <span className="text-[#A1A1AA] block text-[10px] uppercase font-semibold tracking-wider">Acesso Seguro (LGPD):</span>
            <p className="text-[#D4D4D8] text-xs mt-0.5">
              Visualização restrita aos <strong className="text-[#8B7CFF]">{authorizedStudents.length} dependente(s)</strong> sob sua responsabilidade financeira.
            </p>
          </div>
        </div>

        {/* Student Selector Switcher */}
        <div className="mt-6 pt-4 border-t border-[#242424] flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[#A1A1AA] font-medium mr-1">Selecione o Dependente:</span>
          {authorizedStudents.map(st => {
            const isSelected = st.id === selectedStudentId;
            return (
              <button
                key={st.id}
                onClick={() => setSelectedStudentId(st.id)}
                className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                  isSelected
                    ? 'bg-[#8B7CFF] text-white border-[#8B7CFF] shadow-sm'
                    : 'bg-[#151515] text-[#A1A1AA] hover:text-[#F5F5F5] hover:bg-[#222222] border-[#282828]'
                }`}
              >
                <img 
                  src={st.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} 
                  alt={st.name} 
                  className="w-5 h-5 rounded-full object-cover"
                />
                <span>{st.name}</span>
                <span className="text-[10px] opacity-75 font-mono">({st.registrationNumber})</span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedStudent ? (
        <div className="space-y-6">
          
          {/* Dependent Financial Highlights Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828]">
              <span className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Mensalidade Escolar Fixa</span>
              <span className="block text-xl font-bold text-[#F5F5F5] mt-1.5">{formatCurrency(selectedStudent.defaultTuition)}</span>
              <span className="text-[11px] text-[#71717A] mt-0.5 block">Turma: {selectedStudent.classGroup}</span>
            </div>

            <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828]">
              <span className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Consumo da Lojinha (Mês Vigente)</span>
              <span className="block text-xl font-bold text-[#8B7CFF] mt-1.5">{formatCurrency(selectedStudent.currentConsumptionBalance)}</span>
              <span className="text-[11px] text-[#71717A] mt-0.5 block">Será consolidado no fechamento mensal</span>
            </div>

            <div className="bg-[#1B1B1B] rounded-2xl p-5 border border-[#282828]">
              <span className="text-[10px] font-semibold text-[#A1A1AA] uppercase tracking-wider">Saldo Devedor em Faturas</span>
              <span className="block text-xl font-bold text-red-400 mt-1.5">{formatCurrency(selectedStudent.totalOpenDebt)}</span>
              <span className="text-[11px] text-[#71717A] mt-0.5 block">Total pendente de liquidação</span>
            </div>
          </div>

          {/* Invoices List */}
          <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
            <div>
              <h3 className="font-bold text-[#F5F5F5] text-base">Faturas Emitidas de {selectedStudent.name}</h3>
              <p className="text-xs text-[#A1A1AA]">
                Consolidação de mensalidades escolares e extratos de consumo na lojinha do campus
              </p>
            </div>

            <div className="space-y-4">
              {studentInvoices.length === 0 ? (
                <div className="py-12 text-center text-[#A1A1AA] text-xs">
                  Nenhuma fatura fechada para este aluno ainda. O consumo vigente entrará no próximo fechamento mensal.
                </div>
              ) : (
                studentInvoices.map(invoice => (
                  <div 
                    key={invoice.id}
                    className="p-5 rounded-2xl border border-[#282828] bg-[#151515] hover:border-[#383838] transition space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#242424] pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-[#8B7CFF]">{invoice.id}</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                            invoice.status === 'PAGA' 
                              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40' 
                              : invoice.status === 'PARCIALMENTE_PAGA' 
                              ? 'bg-blue-950/60 text-blue-400 border-blue-800/40' 
                              : 'bg-[#222222] text-[#F5F5F5] border-[#383838]'
                          }`}>
                            {invoice.status === 'PAGA' ? 'Quitada' : invoice.status === 'PARCIALMENTE_PAGA' ? 'Parcialmente Paga' : 'Publicada (Em Aberto)'}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-[#F5F5F5] mt-1">
                          Fatura de {formatPeriod(invoice.billingPeriod)}
                        </h4>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[10px] text-[#A1A1AA] uppercase tracking-wider block font-semibold">Vencimento</span>
                          <span className="text-xs font-bold text-[#F5F5F5] font-mono">{formatDate(invoice.dueDate)}</span>
                        </div>
                        <button
                          onClick={() => setViewingInvoice(invoice)}
                          className="px-3.5 py-1.5 bg-[#222222] border border-[#303030] hover:bg-[#2A2A2A] text-[#F5F5F5] rounded-xl text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#8B7CFF]" />
                          Ver Extrato
                        </button>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#1E1E1E] p-3.5 rounded-xl border border-[#282828]">
                      <div>
                        <span className="text-[10px] text-[#A1A1AA] block">Mensalidade:</span>
                        <span className="font-semibold text-[#F5F5F5]">{formatCurrency(invoice.tuitionAmount)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#A1A1AA] block">Consumo Lojinha:</span>
                        <span className="font-semibold text-[#8B7CFF]">{formatCurrency(invoice.canteenConsumptionTotal)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#A1A1AA] block">Total Faturado:</span>
                        <span className="font-semibold text-[#F5F5F5]">{formatCurrency(invoice.grossTotal)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#A1A1AA] block">Saldo Restante:</span>
                        <span className={`font-bold text-sm ${invoice.remainingBalance === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCurrency(invoice.remainingBalance)}
                        </span>
                      </div>
                    </div>

                    {/* Payment options if remainingBalance > 0 */}
                    {invoice.remainingBalance > 0 && (
                      <div className="space-y-4">
                        {/* Stripe Checkout button banner */}
                        <div className="p-4 bg-gradient-to-r from-indigo-950/70 via-slate-900 to-indigo-950/70 rounded-xl border border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
                              <CreditCard className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-semibold text-white text-xs">Pagar com Mercado Pago (Checkout Transparente)</p>
                              <p className="text-[11px] text-zinc-400">Pix Instantâneo (QR Code Dinâmico) ou Cartão de Crédito</p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setMpCheckoutInvoice(invoice)}
                            className="px-5 py-2.5 bg-[#009EE3] hover:bg-[#008CC9] text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2 shrink-0 cursor-pointer"
                          >
                            <CreditCard className="w-4 h-4" />
                            Pagar com Mercado Pago (R$ {invoice.remainingBalance.toFixed(2)})
                          </button>
                        </div>

                        {/* Pix Payment box */}
                        <div className="p-4 bg-[#1E1E1E] rounded-xl border border-[#282828] flex flex-col sm:flex-row items-center gap-4">
                          <QrCodeDisplay 
                            value={invoice.pixQrCodePayload} 
                            size={96} 
                            className="shrink-0"
                          />
                          <div className="flex-1 space-y-2 w-full text-xs">
                            <p className="font-semibold text-[#F5F5F5]">
                              Pagar com Pix da Instituição:
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                readOnly
                                value={invoice.pixCopyPasteCode}
                                className="w-full p-2 text-[10px] font-mono bg-[#151515] border border-[#303030] rounded-lg text-[#D4D4D8] focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => copyPix(invoice.pixCopyPasteCode, invoice.id)}
                                className="px-3.5 py-2 bg-[#8B7CFF] hover:bg-[#7A6AE6] text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 shrink-0 cursor-pointer"
                              >
                                {copiedPixId === invoice.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedPixId === invoice.id ? 'Copiado!' : 'Copiar'}
                              </button>
                            </div>

                            <div className="pt-1 flex gap-2">
                              <button
                                type="button"
                                onClick={() => openPaymentModal(invoice)}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                Informar Comprovante Pix
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Current Month Purchases in Store */}
          <div className="bg-[#1B1B1B] rounded-2xl border border-[#282828] p-5 space-y-4">
            <div>
              <h3 className="font-bold text-[#F5F5F5] text-base">Consumo do Mês no Balcão da Lojinha</h3>
              <p className="text-xs text-[#A1A1AA]">
                Extrato detalhado de todos os lanches e itens adquiridos por {selectedStudent.name}
              </p>
            </div>

            <div className="divide-y divide-[#242424] border border-[#282828] rounded-xl overflow-hidden bg-[#151515]">
              {studentSales.length === 0 ? (
                <div className="py-8 text-center text-[#A1A1AA] text-xs">
                  Nenhum consumo registrado neste mês.
                </div>
              ) : (
                studentSales.map(sale => (
                  <div key={sale.id} className="p-3.5 flex items-center justify-between hover:bg-[#1A1A1A] text-xs transition">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-[#8B7CFF]">{sale.id}</span>
                        <span className="text-[10px] text-[#A1A1AA]">{formatDateTime(sale.createdAt)}</span>
                      </div>
                      <p className="text-[#D4D4D8] mt-1">
                        {sale.items.map(i => `${i.quantity}x ${i.name} (${formatCurrency(i.unitPrice)} un.)`).join(', ')}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-[#F5F5F5] block">{formatCurrency(sale.total)}</span>
                      <span className="text-[10px] text-[#A1A1AA]">Conta Mensal</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      ) : null}

      {/* Stripe Test Checkout Modal */}
      {stripeModalInvoice && selectedStudent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#141414] rounded-2xl shadow-2xl border border-white/[0.12] max-w-md w-full p-6 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">S</div>
                <h3 className="font-bold text-white text-base">Stripe Checkout (Test Mode)</h3>
              </div>
              <button 
                onClick={() => setStripeModalInvoice(null)}
                className="text-zinc-400 hover:text-white text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-3 bg-indigo-950/40 rounded-xl border border-indigo-500/20 text-xs space-y-1 text-zinc-300">
              <p>Fatura: <strong className="text-white font-mono">{stripeModalInvoice.id}</strong></p>
              <p>Dependente: <strong className="text-white">{selectedStudent.name}</strong></p>
              <p>Valor a Pagar: <strong className="text-emerald-400 text-sm font-bold">{formatCurrency(stripeModalInvoice.remainingBalance)}</strong></p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 font-medium mb-1">E-mail do Responsável</label>
                <input
                  type="email"
                  readOnly
                  value={guardian.email}
                  className="w-full p-2.5 bg-[#18181b] border border-white/[0.1] rounded-xl text-zinc-300 font-mono"
                />
              </div>

              <div>
                <label className="block text-zinc-400 font-medium mb-1">Número do Cartão (Stripe Test)</label>
                <input
                  type="text"
                  defaultValue="4242 4242 4242 4242"
                  className="w-full p-2.5 bg-[#18181b] border border-white/[0.1] rounded-xl text-white font-mono tracking-wider"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">Validade (MM/AA)</label>
                  <input
                    type="text"
                    defaultValue="12/28"
                    className="w-full p-2.5 bg-[#18181b] border border-white/[0.1] rounded-xl text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 font-medium mb-1">CVC / CVV</label>
                  <input
                    type="text"
                    defaultValue="123"
                    className="w-full p-2.5 bg-[#18181b] border border-white/[0.1] rounded-xl text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-300 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Modo de Teste Stripe conectado via chave <code className="font-mono">pk_test_...</code></span>
              </div>
            </div>

            <div className="pt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setStripeModalInvoice(null)}
                className="flex-1 py-2.5 px-3 bg-[#222] border border-white/[0.1] text-zinc-300 rounded-xl font-medium hover:text-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isStripeLoading}
                onClick={handleConfirmStripePayment}
                className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition disabled:opacity-50 cursor-pointer shadow-lg"
              >
                {isStripeLoading ? 'Processando...' : `Pagar ${formatCurrency(stripeModalInvoice.remainingBalance)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mercado Pago Checkout Transparente Modal */}
      {mpCheckoutInvoice && (
        <MercadoPagoCheckoutModal
          invoice={mpCheckoutInvoice}
          payerName={guardian.name}
          payerEmail={guardian.email}
          payerCpf={guardian.cpf}
          onClose={() => setMpCheckoutInvoice(null)}
          onPaymentSuccess={() => {
            window.location.reload();
          }}
        />
      )}

      {/* Invoice Details Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1B1B1B] rounded-2xl shadow-2xl border border-[#282828] max-w-xl w-full p-6 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#282828] pb-3">
              <div>
                <h3 className="font-bold text-[#F5F5F5] text-base">Extrato Itemizado de Cobrança</h3>
                <p className="text-xs text-[#A1A1AA] font-mono">Fatura: {viewingInvoice.id} • {formatPeriod(viewingInvoice.billingPeriod)}</p>
              </div>
              <button 
                onClick={() => setViewingInvoice(null)}
                className="text-[#A1A1AA] hover:text-[#F5F5F5] text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <div className="p-3.5 bg-[#151515] rounded-xl border border-[#282828] space-y-1.5 text-[#D4D4D8]">
                <div className="flex justify-between"><span>Mensalidade Fixa:</span><span className="font-semibold text-[#F5F5F5]">{formatCurrency(viewingInvoice.tuitionAmount)}</span></div>
                <div className="flex justify-between"><span>Consumo Cantina:</span><span className="font-semibold text-[#8B7CFF]">{formatCurrency(viewingInvoice.canteenConsumptionTotal)}</span></div>
                <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-[#282828] text-[#F5F5F5]"><span>Total:</span><span>{formatCurrency(viewingInvoice.grossTotal)}</span></div>
                <div className="flex justify-between text-emerald-400 font-semibold"><span>Total Pago:</span><span>{formatCurrency(viewingInvoice.paidTotal)}</span></div>
                <div className="flex justify-between text-red-400 font-bold"><span>Saldo Restante:</span><span>{formatCurrency(viewingInvoice.remainingBalance)}</span></div>
              </div>

              <h4 className="font-semibold text-[#A1A1AA] uppercase tracking-wider text-[11px] pt-2">Itens de Consumo da Lojinha:</h4>
              <div className="border border-[#282828] rounded-xl overflow-hidden divide-y divide-[#242424] bg-[#151515]">
                {viewingInvoice.consumptionItems.length === 0 ? (
                  <div className="p-3 text-center text-[#A1A1AA]">Nenhum item consumido no balcão.</div>
                ) : (
                  viewingInvoice.consumptionItems.map((item, idx) => (
                    <div key={idx} className="p-3 flex justify-between">
                      <div>
                        <span className="font-semibold text-[#F5F5F5]">{item.quantity}x {item.productName}</span>
                        <span className="text-[#A1A1AA] block text-[10px]">{item.category} • Preço unit: {formatCurrency(item.averageUnitPrice)}</span>
                      </div>
                      <span className="font-bold text-[#F5F5F5]">{formatCurrency(item.totalAmount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-[#222222] border border-[#303030] hover:bg-[#2A2A2A] text-[#F5F5F5] rounded-xl text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#A1A1AA]" />
                Imprimir
              </button>
              <button
                type="button"
                onClick={() => setViewingInvoice(null)}
                className="px-4 py-2 bg-[#8B7CFF] hover:bg-[#7A6AE6] text-white rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Pix Proof Modal */}
      {selectedInvoiceForPayment && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#1B1B1B] rounded-2xl shadow-2xl border border-[#282828] max-w-md w-full p-6 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#282828]">
              <h3 className="font-bold text-[#F5F5F5] text-base">
                Enviar Comprovante Pix
              </h3>
              <button 
                onClick={() => setSelectedInvoiceForPayment(null)}
                className="text-[#A1A1AA] hover:text-[#F5F5F5] text-xl font-bold cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-3 bg-[#151515] rounded-xl border border-[#282828] text-xs space-y-1 mb-4 text-[#A1A1AA]">
              <p>Fatura: <strong className="text-[#F5F5F5]">{selectedInvoiceForPayment.id}</strong></p>
              <p>Competência: <strong className="text-[#F5F5F5]">{formatPeriod(selectedInvoiceForPayment.billingPeriod)}</strong></p>
              <p>Aluno: <strong className="text-[#F5F5F5]">{selectedInvoiceForPayment.studentName}</strong></p>
              <p>Saldo Restante: <strong className="text-[#8B7CFF]">{formatCurrency(selectedInvoiceForPayment.remainingBalance)}</strong></p>
            </div>

            {pixSuccess && (
              <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-800/50 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Comprovante enviado com sucesso! Está na fila de conferência administrativa da escola.</span>
              </div>
            )}

            {pixError && (
              <div className="mb-4 p-3 bg-red-950/60 border border-red-800/50 text-red-300 text-xs rounded-xl">
                {pixError}
              </div>
            )}

            <form onSubmit={handleSubmitPixPayment} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-[#F5F5F5] mb-1">Valor do Pagamento (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedInvoiceForPayment.remainingBalance}
                  value={paymentAmount || ''}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-[#F5F5F5] mb-1">ID da Transação do Banco</label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={(e) => setTransactionRef(e.target.value)}
                  placeholder="Ex: E1842389120261029..."
                  className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl font-mono text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-[#F5F5F5] mb-1">Observações ou Banco Emissor</label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Ex: Pagamento efetuado via Santander às 15:30..."
                  rows={2}
                  className="w-full p-2.5 bg-[#151515] border border-[#303030] rounded-xl text-[#F5F5F5] focus:border-[#8B7CFF] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceForPayment(null)}
                  className="flex-1 py-2 px-3 bg-[#222222] border border-[#303030] text-[#A1A1AA] rounded-xl font-medium hover:text-[#F5F5F5] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPix}
                  className="flex-1 py-2 px-3 bg-[#8B7CFF] hover:bg-[#7A6AE6] text-white rounded-xl font-semibold transition disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingPix ? 'Enviando...' : 'Enviar Comprovante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
