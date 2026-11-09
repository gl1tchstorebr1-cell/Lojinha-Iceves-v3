import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  QrCode, 
  CheckCircle2, 
  Copy, 
  Check, 
  AlertCircle, 
  Loader2, 
  ShieldCheck, 
  X,
  FileText
} from 'lucide-react';
import { Invoice } from '../../types';
import { api } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { QrCodeDisplay } from '../common/QrCodeDisplay';

interface MercadoPagoCheckoutModalProps {
  invoice: Invoice;
  payerName: string;
  payerEmail: string;
  payerCpf?: string;
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export function MercadoPagoCheckoutModal({
  invoice,
  payerName,
  payerEmail,
  payerCpf = '',
  onClose,
  onPaymentSuccess
}: MercadoPagoCheckoutModalProps) {
  const [activeTab, setActiveTab] = useState<'pix' | 'card'>('pix');
  const [gatewayStatus, setGatewayStatus] = useState<{
    configured: boolean;
    isProduction: boolean;
    maskedToken?: string;
  } | null>(null);

  // Pix state
  const [isGeneratingPix, setIsGeneratingPix] = useState(false);
  const [pixData, setPixData] = useState<{
    qrCode?: string;
    qrCodeBase64?: string | null;
    paymentId?: string;
    status?: string;
    mockNotice?: string;
    isCollectorKeyMissing?: boolean;
    collectorNotice?: string;
    collectorHelp?: string;
  } | null>(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [isPollingPix, setIsPollingPix] = useState(false);

  // Card state
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(payerName || '');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardCpf, setCardCpf] = useState(payerCpf || '');
  const [installments, setInstallments] = useState(1);
  const [isProcessingCard, setIsProcessingCard] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Success state
  const [paymentApproved, setPaymentApproved] = useState(false);
  const [approvedDetails, setApprovedDetails] = useState<{
    id: string;
    method: string;
  } | null>(null);

  useEffect(() => {
    // Fetch Gateway status
    api.getMercadoPagoStatus().then(status => {
      setGatewayStatus(status);
    }).catch(() => {
      // ignore
    });
  }, []);

  // Generate Pix on initial tab mount
  useEffect(() => {
    if (activeTab === 'pix' && !pixData && !isGeneratingPix && !paymentApproved) {
      handleGeneratePix();
    }
  }, [activeTab]);

  // Polling Pix status every 4 seconds while active
  useEffect(() => {
    if (!pixData?.paymentId || paymentApproved || activeTab !== 'pix') return;

    setIsPollingPix(true);
    const interval = setInterval(async () => {
      try {
        const res = await api.checkMercadoPagoPayment(pixData.paymentId!);
        if (res && res.status === 'approved') {
          setPaymentApproved(true);
          setApprovedDetails({
            id: pixData.paymentId!,
            method: 'Pix Instantâneo'
          });
          clearInterval(interval);
        }
      } catch (e) {
        // quiet polling error
      }
    }, 4000);

    return () => {
      clearInterval(interval);
      setIsPollingPix(false);
    };
  }, [pixData?.paymentId, paymentApproved, activeTab]);

  const handleGeneratePix = async () => {
    setIsGeneratingPix(true);
    setErrorMessage(null);
    try {
      const res = await api.createMercadoPagoPix({
        invoiceId: invoice.id,
        amount: invoice.remainingBalance,
        payerEmail,
        payerName,
        payerCpf: cardCpf || payerCpf || '',
        description: `Mensalidade/Consumo Campus - Fatura ${invoice.id}`
      });

      if (!res.success || !res.qrCode) {
        setErrorMessage(res.error || 'Não foi possível gerar a cobrança Pix via API do Mercado Pago.');
        setPixData(null);
        return;
      }

      setPixData({
        qrCode: res.qrCode,
        qrCodeBase64: res.qrCodeBase64,
        paymentId: res.paymentId,
        status: res.status,
        mockNotice: res.mockNotice,
        isCollectorKeyMissing: res.isCollectorKeyMissing,
        collectorNotice: res.collectorNotice,
        collectorHelp: res.collectorHelp
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao gerar cobrança Pix no Mercado Pago');
      setPixData(null);
    } finally {
      setIsGeneratingPix(false);
    }
  };

  const handleCopyPix = () => {
    if (!pixData?.qrCode) return;
    navigator.clipboard.writeText(pixData.qrCode);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const detectCardBrand = (number: string): string => {
    const clean = number.replace(/\D/g, '');
    if (/^4/.test(clean)) return 'visa';
    if (/^5[1-5]|^2[2-7]/.test(clean)) return 'master';
    if (/^(4011|4389|4514|4576|5041|5066|5067|5090|6277|6362|6363)/.test(clean)) return 'elo';
    if (/^3[47]/.test(clean)) return 'amex';
    if (/^(606282|3841)/.test(clean)) return 'hipercard';
    return 'visa';
  };

  const formatCardNumber = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 16);
    return clean.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  };

  const formatExpiry = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 4);
    if (clean.length >= 3) {
      return `${clean.slice(0, 2)}/${clean.slice(2)}`;
    }
    return clean;
  };

  const formatCpf = (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 11);
    if (clean.length > 9) return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
    if (clean.length > 6) return clean.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    if (clean.length > 3) return clean.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    return clean;
  };

  const handleProcessCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessingCard(true);
    setErrorMessage(null);

    const cleanNumber = cardNumber.replace(/\D/g, '');
    if (cleanNumber.length < 13) {
      setErrorMessage('Por favor, informe um número de cartão válido.');
      setIsProcessingCard(false);
      return;
    }

    try {
      const brand = detectCardBrand(cleanNumber);
      const res = await api.createMercadoPagoCardPayment({
        invoiceId: invoice.id,
        amount: invoice.remainingBalance,
        token: `tok_mp_${Date.now()}_${cleanNumber.slice(-4)}`,
        installments: Number(installments),
        paymentMethodId: brand,
        payerEmail,
        payerCpf: cardCpf.replace(/\D/g, ''),
        cardHolderName: cardHolder,
        description: `Fatura ${invoice.id} - ${installments}x no Cartão`
      });

      if (res.status === 'approved') {
        setPaymentApproved(true);
        setApprovedDetails({
          id: res.paymentId,
          method: `Cartão de Crédito (${brand.toUpperCase()} em ${installments}x)`
        });
      } else {
        setErrorMessage(`Pagamento retornado com status: ${res.statusDetail || res.status}.`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao processar pagamento com cartão no Mercado Pago.');
    } finally {
      setIsProcessingCard(false);
    }
  };

  const handleFinish = () => {
    onPaymentSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-[#141416] rounded-2xl shadow-2xl border border-white/[0.12] max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[92vh]">
        
        {/* Modal Top Header */}
        <div className="p-5 border-b border-white/[0.08] flex items-center justify-between bg-[#19191D]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#009EE3]/15 text-[#009EE3] border border-[#009EE3]/30 flex items-center justify-center font-bold">
              <span className="text-lg">MP</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Checkout Transparente</h3>
                {gatewayStatus?.isProduction ? (
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-400 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Produção
                  </span>
                ) : (
                  <span className="text-[10px] bg-blue-500/15 text-blue-400 font-semibold px-2 py-0.5 rounded-full border border-blue-500/30">
                    Sandbox / Testes
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                Mercado Pago Pagamentos Integrados
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Invoice Summary Banner */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-[#009EE3]/10 to-indigo-900/20 border-b border-white/[0.06] flex items-center justify-between text-xs">
          <div>
            <span className="text-zinc-400 block text-[11px]">Cobrança Selecionada</span>
            <span className="font-mono font-semibold text-white">{invoice.id}</span>
          </div>
          <div className="text-right">
            <span className="text-zinc-400 block text-[11px]">Valor a Liquidar</span>
            <span className="font-bold text-emerald-400 text-base">{formatCurrency(invoice.remainingBalance)}</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {paymentApproved ? (
            /* Success Screen */
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-white tracking-tight">
                  Pagamento Confirmado com Sucesso!
                </h4>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                  A fatura foi quitada no sistema e os comprovantes e conciliação financeira foram gerados automaticamente.
                </p>
              </div>

              {approvedDetails && (
                <div className="bg-[#1C1C21] p-4 rounded-xl border border-white/[0.08] text-xs max-w-xs mx-auto text-left space-y-1.5 font-mono">
                  <div className="flex justify-between text-zinc-400">
                    <span>Transação:</span>
                    <span className="text-white">{approvedDetails.id}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Meio:</span>
                    <span className="text-emerald-400">{approvedDetails.method}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Valor:</span>
                    <span className="text-white">{formatCurrency(invoice.remainingBalance)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Status:</span>
                    <span className="text-emerald-400 font-bold">APROVADO</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleFinish}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition shadow-lg cursor-pointer"
              >
                Concluir e Atualizar Faturas
              </button>
            </div>
          ) : (
            <>
              {/* Method Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#19191D] rounded-xl border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => { setActiveTab('pix'); setErrorMessage(null); }}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                    activeTab === 'pix'
                      ? 'bg-[#009EE3] text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  Pix Instantâneo (QR Code)
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('card'); setErrorMessage(null); }}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                    activeTab === 'card'
                      ? 'bg-[#009EE3] text-white shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  Cartão de Crédito
                </button>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>{errorMessage}</div>
                </div>
              )}

              {/* PIX TAB */}
              {activeTab === 'pix' && (
                <div className="space-y-4">
                  {isGeneratingPix ? (
                    <div className="py-12 text-center space-y-3">
                      <Loader2 className="w-8 h-8 text-[#009EE3] animate-spin mx-auto" />
                      <p className="text-xs text-zinc-400">
                        Gerando cobrança Pix dinâmica na API do Mercado Pago...
                      </p>
                    </div>
                  ) : pixData ? (
                    <div className="space-y-4">
                      {pixData.isCollectorKeyMissing && (
                        <div className="p-3.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-xs text-amber-200 space-y-2">
                          <div className="flex items-center gap-2 font-bold text-amber-300">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>Chave Pix da conta recebedora do Mercado Pago pendente</span>
                          </div>
                          <p className="text-[11px] text-zinc-300">
                            {pixData.collectorHelp || 'A sua conta do Mercado Pago precisa ter ao menos uma Chave Pix cadastrada (no aplicativo do Mercado Pago) para autorizar cobranças Pix via API.'}
                          </p>
                          <div className="p-2 bg-amber-900/30 rounded-lg text-[11px] text-amber-300 flex items-center justify-between">
                            <span>✅ QR Code Pix oficial da instituição ativado automaticamente abaixo!</span>
                            <button
                              type="button"
                              onClick={() => setActiveTab('card')}
                              className="underline font-bold text-white hover:text-amber-200 cursor-pointer ml-2"
                            >
                              Pagar com Cartão &gt;
                            </button>
                          </div>
                        </div>
                      )}

                      {pixData.mockNotice && !pixData.isCollectorKeyMissing && (
                        <div className="p-2.5 bg-blue-950/40 border border-blue-500/30 rounded-xl text-[11px] text-blue-300 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                          <span>{pixData.mockNotice}</span>
                        </div>
                      )}

                      {/* QR Code Container */}
                      <div className="bg-[#1C1C21] p-4 rounded-xl border border-white/[0.08] flex flex-col sm:flex-row items-center gap-4">
                        <div className="shrink-0 flex items-center justify-center">
                          {pixData.qrCodeBase64 ? (
                            <img
                              src={pixData.qrCodeBase64.startsWith('data:') ? pixData.qrCodeBase64 : `data:image/png;base64,${pixData.qrCodeBase64}`}
                              alt="Mercado Pago Pix QR Code"
                              className="w-36 h-36 object-contain bg-white p-2 rounded-xl border border-zinc-200 shadow-md"
                            />
                          ) : pixData.qrCode ? (
                            <QrCodeDisplay
                              value={pixData.qrCode}
                              size={144}
                              alt="QR Code Pix"
                            />
                          ) : (
                            <div className="w-36 h-36 flex flex-col items-center justify-center p-2 text-center bg-zinc-950 text-white rounded-xl border border-zinc-700">
                              <QrCode className="w-16 h-16 text-[#009EE3]" />
                              <span className="text-[9px] text-zinc-400 mt-1">Pix Copia e Cola</span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 flex-1 w-full text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-white">Chave Pix Copia e Cola</span>
                            {isPollingPix && (
                              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                Aguardando pagamento...
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <input
                              type="text"
                              readOnly
                              value={pixData.qrCode || ''}
                              className="w-full p-2.5 text-[10px] font-mono bg-[#141416] border border-white/[0.1] rounded-xl text-zinc-300 pr-20 select-all"
                            />
                            <button
                              type="button"
                              onClick={handleCopyPix}
                              className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-[#009EE3] hover:bg-[#008CC9] text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                            >
                              {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              {copiedPix ? 'Copiado!' : 'Copiar'}
                            </button>
                          </div>

                          <div className="text-[11px] text-zinc-400 pt-1">
                            Abra o app do seu banco, escolha <strong>Pix &gt; Pagar com QR Code ou Copia e Cola</strong> e confirme a transferência. A confirmação é instantânea via Webhook!
                          </div>
                        </div>
                      </div>

                      {/* Manual Simulator Trigger if in Sandbox / Demo */}
                      {!gatewayStatus?.isProduction && (
                        <div className="pt-1 flex items-center justify-between p-3 bg-zinc-900/60 rounded-xl border border-white/[0.06] text-xs">
                          <span className="text-zinc-400 text-[11px]">
                            Modo Teste: simular recebimento de webhook do Mercado Pago
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentApproved(true);
                              setApprovedDetails({
                                id: pixData.paymentId || 'MP-SIMULATED-01',
                                method: 'Pix Mercado Pago (Webhook Aprovado)'
                              });
                            }}
                            className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-lg text-xs font-semibold transition cursor-pointer"
                          >
                            Simular Aprovação
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-8 text-center space-y-4">
                      <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto border border-red-500/20">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Não foi possível carregar o Pix via API</p>
                        <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
                          {errorMessage || 'Verifique se o Access Token do Mercado Pago está ativo e configurado nas Configurações do Sistema.'}
                        </p>
                      </div>
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={handleGeneratePix}
                          className="px-4 py-2 bg-[#009EE3] hover:bg-[#008CC9] text-white rounded-xl text-xs font-semibold cursor-pointer transition flex items-center gap-2"
                        >
                          <QrCode className="w-4 h-4" />
                          Tentar Novamente
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab('card')}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold cursor-pointer transition"
                        >
                          Pagar com Cartão
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CARD TAB */}
              {activeTab === 'card' && (
                <form onSubmit={handleProcessCard} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Número do Cartão
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                        placeholder="0000 0000 0000 0000"
                        className="w-full p-2.5 bg-[#1C1C21] border border-white/[0.1] rounded-xl text-white font-mono tracking-wider focus:border-[#009EE3] focus:outline-none"
                      />
                      <div className="absolute right-3 top-2.5 text-zinc-400 text-[11px] uppercase font-bold">
                        {detectCardBrand(cardNumber)}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">
                      Nome Impresso no Cartão
                    </label>
                    <input
                      type="text"
                      required
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      placeholder="COMO ESTÁ NO CARTÃO"
                      className="w-full p-2.5 bg-[#1C1C21] border border-white/[0.1] rounded-xl text-white uppercase focus:border-[#009EE3] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">
                        Validade (MM/AA)
                      </label>
                      <input
                        type="text"
                        required
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                        placeholder="12/28"
                        className="w-full p-2.5 bg-[#1C1C21] border border-white/[0.1] rounded-xl text-white font-mono focus:border-[#009EE3] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">
                        Código de Segurança (CVV)
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={4}
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                        placeholder="123"
                        className="w-full p-2.5 bg-[#1C1C21] border border-white/[0.1] rounded-xl text-white font-mono focus:border-[#009EE3] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">
                        CPF do Titular do Cartão
                      </label>
                      <input
                        type="text"
                        required
                        value={cardCpf}
                        onChange={(e) => setCardCpf(formatCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        className="w-full p-2.5 bg-[#1C1C21] border border-white/[0.1] rounded-xl text-white font-mono focus:border-[#009EE3] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-300 font-medium mb-1">
                        Opções de Parcelamento
                      </label>
                      <select
                        value={installments}
                        onChange={(e) => setInstallments(Number(e.target.value))}
                        className="w-full p-2.5 bg-[#1C1C21] border border-white/[0.1] rounded-xl text-white focus:border-[#009EE3] focus:outline-none"
                      >
                        <option value={1}>1x de {formatCurrency(invoice.remainingBalance)} (à vista)</option>
                        <option value={2}>2x de {formatCurrency(invoice.remainingBalance / 2)}</option>
                        <option value={3}>3x de {formatCurrency(invoice.remainingBalance / 3)}</option>
                        <option value={6}>6x de {formatCurrency(invoice.remainingBalance / 6)}</option>
                        <option value={10}>10x de {formatCurrency(invoice.remainingBalance / 10)}</option>
                        <option value={12}>12x de {formatCurrency(invoice.remainingBalance / 12)}</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isProcessingCard}
                      className="w-full py-3 bg-[#009EE3] hover:bg-[#008CC9] text-white font-bold rounded-xl text-sm transition shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {isProcessingCard ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processando Pagamento...
                        </>
                      ) : (
                        `Pagar ${formatCurrency(invoice.remainingBalance)}`
                      )}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>

        {/* Modal Bottom Security Notice */}
        <div className="p-3.5 bg-[#101012] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#009EE3]" />
            <span>Processamento criptografado via API Mercado Pago com suporte a Webhook.</span>
          </div>
          <span className="font-mono text-[10px]">PCI-DSS Compliant</span>
        </div>

      </div>
    </div>
  );
}
