import React, { useState, useEffect, useMemo } from 'react';
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
  ArrowLeft,
  Lock,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Invoice } from '../../types';
import { api } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { QrCodeDisplay } from '../common/QrCodeDisplay';

const MERCADO_PAGO_LOGO_URL =
  'https://cdn.worldvectorlogo.com/logos/cd4804d4-fa18-4481-8595-e4fff80e6ce8/mercado-pago-1.svg';

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
  onPaymentSuccess,
}: MercadoPagoCheckoutModalProps) {
  const [activeTab, setActiveTab] = useState<'pix' | 'card'>('pix');
  const [mpLogoError, setMpLogoError] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<{
    configured: boolean;
    isProduction: boolean;
    publicKeyAvailable?: boolean;
    publicKey?: string;
    maskedToken?: string;
  } | null>(null);

  // Calcula valor seguro a liquidar (mínimo R$ 1,00 para o Mercado Pago)
  const invoiceAmount = useMemo(() => {
    const rem = Number(invoice.remainingBalance);
    if (!isNaN(rem) && rem > 0) return Number(rem.toFixed(2));
    const gross = Number(invoice.grossTotal);
    if (!isNaN(gross) && gross > 0) return Number(gross.toFixed(2));
    return 0;
  }, [invoice.remainingBalance, invoice.grossTotal]);

  const grossAmount = useMemo(() => {
    const gross = Number(invoice.grossTotal);
    return !isNaN(gross) && gross > 0 ? Number(gross.toFixed(2)) : invoiceAmount;
  }, [invoice.grossTotal, invoiceAmount]);

  const alreadyPaidAmount = useMemo(() => {
    const diff = grossAmount - invoiceAmount;
    return diff > 0.01 ? Number(diff.toFixed(2)) : 0;
  }, [grossAmount, invoiceAmount]);

  // Regra Mercado Pago Brasil: Cada parcela no cartão deve ser de no mínimo R$ 5,00
  const availableInstallments = useMemo(() => {
    if (invoiceAmount < 5.0) return [1];
    return [1, 2, 3, 4, 5, 6, 10, 12].filter((n) => invoiceAmount / n >= 5.0);
  }, [invoiceAmount]);

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

  // Sanitiza e-mail inicial para evitar domínios fictícios (.edu)
  const initialCleanEmail = useMemo(() => {
    const raw = (payerEmail || '').trim().toLowerCase();
    if (!raw || raw.endsWith('.edu') || raw.includes('@campus.')) {
      const local = raw.split('@')[0]?.replace(/[^a-z0-9._-]/g, '') || 'cliente.lojinha';
      return `${local}@gmail.com`;
    }
    return raw;
  }, [payerEmail]);

  // Card state
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState(payerName || '');
  const [cardEmail, setCardEmail] = useState(initialCleanEmail);
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardCpf, setCardCpf] = useState(payerCpf || '');
  const [installments, setInstallments] = useState(1);
  const [isProcessingCard, setIsProcessingCard] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isHighRisk, setIsHighRisk] = useState(false);

  // Success state
  const [paymentApproved, setPaymentApproved] = useState(false);
  const [approvedDetails, setApprovedDetails] = useState<{
    id: string;
    method: string;
  } | null>(null);

  // Close on Escape key when idle
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessingCard) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, isProcessingCard]);

  useEffect(() => {
    api
      .getMercadoPagoStatus()
      .then((status) => {
        setGatewayStatus(status);
      })
      .catch(() => {
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
            method: 'Pix Instantâneo',
          });
          clearInterval(interval);
        }
      } catch {
        // quiet polling error
      }
    }, 4000);

    return () => {
      clearInterval(interval);
      setIsPollingPix(false);
    };
  }, [pixData?.paymentId, paymentApproved, activeTab]);

  const handleGeneratePix = async () => {
    if (invoiceAmount < 1.0) {
      setErrorMessage(
        'O valor deste pedido é inferior ao valor mínimo de R$ 1,00 exigido pelo Mercado Pago.'
      );
      setPixData(null);
      return;
    }
    setIsGeneratingPix(true);
    setErrorMessage(null);
    try {
      const res = await api.createMercadoPagoPix({
        invoiceId: invoice.id,
        amount: invoiceAmount,
        payerEmail: cardEmail || initialCleanEmail,
        payerName,
        payerCpf: cardCpf || payerCpf || '',
        description: `Pedido Lojinha Iceves #${invoice.id}`,
      });

      if (!res.success || !res.qrCode) {
        setErrorMessage(
          res.error || 'Não foi possível gerar a cobrança Pix via API do Mercado Pago.'
        );
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
        collectorHelp: res.collectorHelp,
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

  const translateMpError = (statusDetail?: string, fallbackMessage?: string) => {
    const map: Record<string, string> = {
      cc_rejected_bad_filled_card_number:
        'Número do cartão inválido. Verifique os dígitos informados.',
      cc_rejected_bad_filled_date: 'Data de vencimento incorreta ou cartão expirado.',
      cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) incorreto.',
      cc_rejected_bad_filled_other:
        'Dados do cartão incorretos. Verifique as informações informadas.',
      cc_rejected_insufficient_amount: 'Cartão com saldo ou limite insuficiente.',
      cc_rejected_call_for_authorize:
        'Transação não autorizada. Ligue para o banco emissor do cartão para liberar a compra.',
      cc_rejected_card_disabled:
        'Cartão bloqueado ou inativo. Entre em contato com seu banco.',
      cc_rejected_duplicated_payment:
        'Pagamento duplicado. Verifique se o pagamento já não foi processado.',
      cc_rejected_high_risk:
        'Pagamento recusado pelas regras de segurança do Mercado Pago. Importante: o Mercado Pago bloqueia automaticamente compras feitas com cartão, CPF ou e-mail do próprio dono da conta Mercado Pago (autocompra). Use um cartão/CPF/e-mail de terceiro ou pague via Pix.',
      cc_rejected_max_attempts:
        'Número máximo de tentativas excedido. Tente novamente mais tarde ou use outro cartão.',
      collector_is_payer:
        'O titular da conta Mercado Pago não pode realizar pagamentos para si próprio (autocompra bloqueada pelo antifraude).',
      invalid_users: 'A conta de origem e destino são incompatíveis.',
      pending_contingency:
        'O pagamento está sendo processado pelo Mercado Pago. Aguarde a confirmação.',
      pending_review_manual: 'O pagamento está em análise manual pelo Mercado Pago.',
      '3003':
        'Dados do cartão recusados na tokenização. Verifique os números informados.',
      '3034':
        'Número do cartão inválido perante o emissor. Por favor, revise os números digitados.',
      '4037':
        'Valor da transação inválido (o valor mínimo aceito pelo Mercado Pago é R$ 1,00 e cada parcela do cartão deve ser de pelo menos R$ 5,00).',
      'Invalid transaction_amount':
        'Valor da transação inválido. O valor mínimo é R$ 1,00 e cada parcela deve ser de pelo menos R$ 5,00 no cartão.',
      '10114':
        'Parcelamento não permitido para cartões internacionais. Selecione pagamento à vista (1x).',
    };
    if (statusDetail) {
      if (map[statusDetail]) return map[statusDetail];
      for (const [key, msg] of Object.entries(map)) {
        if (statusDetail.includes(key)) return msg;
      }
    }
    if (fallbackMessage) {
      for (const [key, msg] of Object.entries(map)) {
        if (fallbackMessage.includes(key)) return msg;
      }
    }
    return fallbackMessage || `Pagamento não aprovado (${statusDetail || 'recusado pelo emissor'}).`;
  };

  const handleProcessCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessingCard(true);
    setErrorMessage(null);
    setIsHighRisk(false);

    if (invoiceAmount < 1.0) {
      setErrorMessage(
        'O valor deste pedido é inferior ao valor mínimo de R$ 1,00 exigido pelo Mercado Pago.'
      );
      setIsProcessingCard(false);
      return;
    }

    const cleanNumber = cardNumber.replace(/\D/g, '');
    if (cleanNumber.length < 13) {
      setErrorMessage('Por favor, informe um número de cartão válido.');
      setIsProcessingCard(false);
      return;
    }

    const cleanExpiry = cardExpiry.replace(/\s+/g, '');
    if (!cleanExpiry.includes('/') || cleanExpiry.length < 4) {
      setErrorMessage('Por favor, informe a validade no formato MM/AA.');
      setIsProcessingCard(false);
      return;
    }

    const cleanCvv = cardCvv.replace(/\D/g, '');
    if (cleanCvv.length < 3) {
      setErrorMessage('Por favor, informe um código de segurança (CVV) válido.');
      setIsProcessingCard(false);
      return;
    }

    const cleanCpf = cardCpf.replace(/\D/g, '');
    const maxInst = Math.max(1, Math.floor(invoiceAmount / 5.0));
    const safeInst = Math.min(Number(installments) || 1, maxInst);

    try {
      const brand = detectCardBrand(cleanNumber);

      // Tokenizar direto no navegador via MercadoPago.js V2 para incluir Device Fingerprint e IP do cliente
      let browserCardToken: string | undefined = undefined;
      const mpGlobal = (window as any).MercadoPago;
      if (mpGlobal && gatewayStatus?.publicKey && cleanCpf.length === 11) {
        try {
          const [rawM, rawY] = cleanExpiry.split('/');
          const expMonth = String(parseInt(rawM || '12', 10)).padStart(2, '0');
          let expYearNum = parseInt(rawY || '2028', 10);
          if (expYearNum < 100) expYearNum += 2000;
          const mp = new mpGlobal(gatewayStatus.publicKey, { locale: 'pt-BR' });
          const tokenObj = await mp.createCardToken({
            cardNumber: cleanNumber,
            cardholderName: (cardHolder || 'CLIENTE LOJINHA').trim().toUpperCase(),
            cardExpirationMonth: expMonth,
            cardExpirationYear: String(expYearNum),
            securityCode: cleanCvv,
            identificationType: 'CPF',
            identificationNumber: cleanCpf,
          });
          if (tokenObj && tokenObj.id) {
            browserCardToken = tokenObj.id;
          }
        } catch {
          // Se falhar no navegador, o backend gera o token automaticamente
        }
      }

      const deviceId = (window as any).MP_DEVICE_SESSION_ID || undefined;

      const res = await api.createMercadoPagoCardPayment({
        invoiceId: invoice.id,
        amount: invoiceAmount,
        token: browserCardToken,
        cardNumber: cleanNumber,
        cardExpiry: cleanExpiry,
        cardCvv: cleanCvv,
        installments: safeInst,
        paymentMethodId: brand,
        payerEmail: cardEmail || initialCleanEmail,
        payerCpf: cleanCpf,
        cardHolderName: cardHolder,
        description: `Pedido Lojinha Iceves #${invoice.id}`,
        deviceId,
      });

      if (res.status === 'approved') {
        setPaymentApproved(true);
        setApprovedDetails({
          id: res.paymentId,
          method: `Cartão de Crédito (${brand.toUpperCase()} em ${safeInst}x)`,
        });
      } else if (res.status === 'in_process') {
        setPaymentApproved(true);
        setApprovedDetails({
          id: res.paymentId,
          method: `Cartão (${brand.toUpperCase()}) - Em análise pelo Mercado Pago`,
        });
      } else {
        const detail = res.statusDetail || '';
        const errStr = res.error || '';
        if (
          detail.includes('high_risk') ||
          errStr.includes('high_risk') ||
          detail === 'collector_is_payer' ||
          errStr.includes('collector_is_payer')
        ) {
          setIsHighRisk(true);
        } else {
          setIsHighRisk(false);
        }
        setErrorMessage(translateMpError(res.statusDetail, res.error));
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('high_risk') || msg.includes('collector_is_payer')) {
        setIsHighRisk(true);
        setErrorMessage(
          'Pagamento recusado pelas regras de segurança do Mercado Pago (antifraude).'
        );
      } else if (msg.includes('3003')) {
        setErrorMessage(
          'Dados do cartão rejeitados pelo serviço de validação do Mercado Pago. Verifique os números digitados.'
        );
      } else {
        setErrorMessage(msg || 'Falha ao processar pagamento com cartão no Mercado Pago.');
      }
    } finally {
      setIsProcessingCard(false);
    }
  };

  const handleFinish = () => {
    onPaymentSuccess();
    onClose();
  };

  const detectedBrand = detectCardBrand(cardNumber);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Checkout Transparente Lojinha Iceves"
      className="fixed inset-0 z-50 bg-[#0B0C0F] text-[#F4F4F5] flex flex-col overflow-hidden animate-modal-blur-in"
    >
      {/* Top Bar — Full-Screen Figma Checkout Header */}
      <header className="h-16 shrink-0 border-b border-white/[0.08] bg-[#0E0F13]/95 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] text-xs font-medium text-zinc-300 hover:text-white transition cursor-pointer shrink-0 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Voltar</span>
          </button>

          <div className="h-5 w-px bg-white/[0.08] hidden sm:block" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white p-0.5 ring-1 ring-emerald-500/40 shrink-0 overflow-hidden">
              <img
                src="/assets/aistudio/image_e4461e45.png"
                alt="Logo Lojinha Iceves"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white tracking-tight truncate">
                Lojinha Iceves
              </div>
              <div className="text-[11px] text-zinc-400 truncate">
                Escola de Cristo · Checkout Transparente
              </div>
            </div>
          </div>
        </div>

        {/* Right: Small Mercado Pago Lockup + Close */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-zinc-400">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ambiente Seguro</span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            {!mpLogoError ? (
              <span className="inline-flex items-center rounded-md bg-white/95 px-2 py-1 shadow-xs">
                <img
                  src={MERCADO_PAGO_LOGO_URL}
                  alt="Mercado Pago"
                  referrerPolicy="no-referrer"
                  onError={() => setMpLogoError(true)}
                  className="h-3.5 w-auto object-contain"
                />
              </span>
            ) : (
              <span className="font-semibold text-[#009EE3]">Mercado Pago</span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar checkout"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white transition cursor-pointer whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            <span>Fechar</span>
          </button>
        </div>
      </header>

      {/* Main Full-Viewport Split Workspace */}
      <div className="flex-1 overflow-y-auto">
        <div className="min-h-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT COLUMN (5 cols): Order Summary & Merchant Details */}
          <aside className="lg:col-span-5 bg-[#0E0F13] border-b lg:border-b-0 lg:border-r border-white/[0.08] p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-8">
            <div className="space-y-8">
              {/* Mobile Mercado Pago Lockup */}
              <div className="flex sm:hidden items-center justify-between text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  Pagamento Criptografado
                </span>
                {!mpLogoError ? (
                  <span className="inline-flex items-center rounded-md bg-white/95 px-2 py-0.5">
                    <img
                      src={MERCADO_PAGO_LOGO_URL}
                      alt="Mercado Pago"
                      referrerPolicy="no-referrer"
                      onError={() => setMpLogoError(true)}
                      className="h-3 w-auto object-contain"
                    />
                  </span>
                ) : (
                  <span className="font-semibold text-[#009EE3]">Mercado Pago</span>
                )}
              </div>

              {/* Hero Amount Block */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-zinc-400">
                  Total a pagar agora
                </div>
                <div className="text-4xl sm:text-5xl font-bold tracking-tight text-white tabular-nums">
                  {formatCurrency(invoiceAmount)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400 pt-1">
                  <span className="font-mono text-zinc-200">{invoice.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {gatewayStatus?.isProduction ? 'Produção' : 'Ambiente de Testes'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400 font-medium">Baixa automática</span>
                </div>
              </div>

              {/* Clean Hairline Order Breakdown (Zero Nested Cards) */}
              <div className="border-t border-white/[0.08] divide-y divide-white/[0.06] text-xs">
                <div className="py-3.5 flex items-center justify-between gap-4">
                  <span className="text-zinc-400">Favorecido</span>
                  <span className="font-medium text-zinc-100 text-right">
                    Lojinha Iceves · Escola de Cristo
                  </span>
                </div>

                {invoice.billingPeriod && (
                  <div className="py-3.5 flex items-center justify-between gap-4">
                    <span className="text-zinc-400">Competência</span>
                    <span className="font-mono text-zinc-200 tabular-nums">
                      {invoice.billingPeriod}
                    </span>
                  </div>
                )}

                <div className="py-3.5 flex items-center justify-between gap-4">
                  <span className="text-zinc-400">Pagador</span>
                  <span className="font-medium text-zinc-100 text-right truncate max-w-[220px]">
                    {payerName || 'Aluno / Responsável'}
                  </span>
                </div>

                <div className="py-3.5 flex items-center justify-between gap-4">
                  <span className="text-zinc-400">E-mail de recibo</span>
                  <span className="text-zinc-300 truncate max-w-[220px]">
                    {cardEmail || initialCleanEmail}
                  </span>
                </div>

                {alreadyPaidAmount > 0 && (
                  <>
                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <span className="text-zinc-400">Valor original</span>
                      <span className="font-mono text-zinc-300 tabular-nums">
                        {formatCurrency(grossAmount)}
                      </span>
                    </div>
                    <div className="py-3.5 flex items-center justify-between gap-4">
                      <span className="text-zinc-400">Já amortizado</span>
                      <span className="font-mono text-emerald-400 tabular-nums">
                        − {formatCurrency(alreadyPaidAmount)}
                      </span>
                    </div>
                  </>
                )}

                <div className="pt-4 pb-1 flex items-center justify-between gap-4 text-sm">
                  <span className="font-semibold text-zinc-200">Saldo a liquidar</span>
                  <span className="font-mono font-bold text-emerald-400 tabular-nums text-base">
                    {formatCurrency(invoiceAmount)}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Security & Mercado Pago Lockup */}
            <div className="pt-6 border-t border-white/[0.08] flex items-center justify-between gap-4 text-[11px] text-zinc-500">
              <div className="flex items-center gap-2 leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-[#009EE3] shrink-0" />
                <span>
                  Processamento criptografado PCI-DSS com conciliação automática via Webhook.
                </span>
              </div>
              {!mpLogoError && (
                <span className="hidden lg:inline-flex items-center rounded-md bg-white/95 px-2 py-1 shrink-0 shadow-xs">
                  <img
                    src={MERCADO_PAGO_LOGO_URL}
                    alt="Mercado Pago"
                    referrerPolicy="no-referrer"
                    onError={() => setMpLogoError(true)}
                    className="h-3.5 w-auto object-contain"
                  />
                </span>
              )}
            </div>
          </aside>

          {/* RIGHT COLUMN (7 cols): Interactive Payment Surface */}
          <section className="lg:col-span-7 bg-[#131419] p-6 sm:p-8 lg:p-10 flex flex-col justify-between">
            <div className="max-w-xl w-full mx-auto space-y-6">
              {invoiceAmount < 1.0 && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    Esta fatura já se encontra liquidada ou com saldo inferior a R$ 1,00 (mínimo
                    exigido pelo Mercado Pago).
                  </span>
                </div>
              )}

              {paymentApproved ? (
                /* Approved Full-Screen Confirmation State */
                <div className="py-10 text-center space-y-6 animate-blur-in">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                      Pagamento Confirmado!
                    </h2>
                    <p className="text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
                      Sua fatura foi liquidada e conciliada automaticamente no sistema da Lojinha
                      Iceves.
                    </p>
                  </div>

                  {approvedDetails && (
                    <div className="border-y border-white/[0.08] divide-y divide-white/[0.06] text-xs max-w-sm mx-auto text-left">
                      <div className="py-3 flex justify-between text-zinc-400">
                        <span>Transação</span>
                        <span className="font-mono text-white tabular-nums">
                          {approvedDetails.id}
                        </span>
                      </div>
                      <div className="py-3 flex justify-between text-zinc-400">
                        <span>Forma</span>
                        <span className="text-emerald-400 font-medium">
                          {approvedDetails.method}
                        </span>
                      </div>
                      <div className="py-3 flex justify-between text-zinc-400">
                        <span>Valor pago</span>
                        <span className="font-mono font-semibold text-white tabular-nums">
                          {formatCurrency(invoiceAmount)}
                        </span>
                      </div>
                      <div className="py-3 flex justify-between text-zinc-400">
                        <span>Situação</span>
                        <span className="text-emerald-400 font-semibold">Aprovado</span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleFinish}
                    className="w-full max-w-sm mx-auto py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition shadow-lg cursor-pointer"
                  >
                    Concluir e Atualizar Faturas
                  </button>
                </div>
              ) : (
                <>
                  {/* Method Header & Segmented Selector */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold text-white tracking-tight">
                        Escolha como deseja pagar
                      </h2>
                      <span className="text-[11px] text-zinc-500">
                        Confirmação em tempo real
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-1 bg-[#0C0D11] rounded-xl border border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('pix');
                          setErrorMessage(null);
                        }}
                        className={`py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap ${
                          activeTab === 'pix'
                            ? 'bg-[#009EE3] text-white shadow-sm'
                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
                        }`}
                      >
                        <QrCode className="w-4 h-4 shrink-0" />
                        <span>Pix Instantâneo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('card');
                          setErrorMessage(null);
                        }}
                        className={`py-2.5 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer whitespace-nowrap ${
                          activeTab === 'card'
                            ? 'bg-[#009EE3] text-white shadow-sm'
                            : 'text-zinc-400 hover:text-white hover:bg-white/[0.03]'
                        }`}
                      >
                        <CreditCard className="w-4 h-4 shrink-0" />
                        <span>Cartão de Crédito</span>
                      </button>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="p-4 bg-red-950/35 border border-red-500/30 rounded-xl text-xs text-red-200 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1 leading-relaxed">{errorMessage}</div>
                      </div>
                      {isHighRisk && (
                        <div className="pt-2.5 border-t border-red-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                          <span className="text-[11px] text-zinc-300">
                            Dica: o Pix aprova na hora sem bloqueios antifraude.
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('pix');
                              setErrorMessage(null);
                              setIsHighRisk(false);
                            }}
                            className="w-full sm:w-auto px-3.5 py-2 bg-[#009EE3] hover:bg-[#008CC9] text-white font-semibold rounded-lg text-xs cursor-pointer transition flex items-center justify-center gap-1.5 shrink-0"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Mudar para Pix</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PIX COPIA E COLA WORKSPACE */}
                  {activeTab === 'pix' && (
                    <div className="space-y-6 animate-blur-in">
                      {isGeneratingPix ? (
                        <div className="py-16 text-center space-y-3 border border-white/[0.06] rounded-2xl bg-[#0E0F13]">
                          <Loader2 className="w-8 h-8 text-[#009EE3] animate-spin mx-auto" />
                          <p className="text-xs text-zinc-400">
                            Gerando QR Code e código Copia e Cola via Mercado Pago...
                          </p>
                        </div>
                      ) : pixData ? (
                        <div className="space-y-5">
                          {pixData.isCollectorKeyMissing && (
                            <div className="p-4 bg-amber-950/30 border border-amber-500/30 rounded-xl text-xs text-amber-200 space-y-2">
                              <div className="flex items-center gap-2 font-semibold text-amber-300">
                                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                                <span>Chave Pix da conta recebedora pendente</span>
                              </div>
                              <p className="text-[11px] text-zinc-300 leading-relaxed">
                                {pixData.collectorHelp ||
                                  'A conta do Mercado Pago precisa ter uma Chave Pix cadastrada para gerar cobranças dinâmicas via API.'}
                              </p>
                              <div className="pt-1 flex items-center justify-between text-[11px] text-amber-300">
                                <span>QR Code oficial da instituição ativado abaixo.</span>
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('card')}
                                  className="underline font-semibold text-white hover:text-amber-200 cursor-pointer ml-2"
                                >
                                  Usar Cartão →
                                </button>
                              </div>
                            </div>
                          )}

                          {pixData.mockNotice && !pixData.isCollectorKeyMissing && (
                            <div className="p-3 bg-blue-950/30 border border-blue-500/25 rounded-xl text-[11px] text-blue-300 flex items-center gap-2.5">
                              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                              <span>{pixData.mockNotice}</span>
                            </div>
                          )}

                          {/* Live Payment Detection Header */}
                          <div className="flex items-center justify-between text-xs pb-3 border-b border-white/[0.06]">
                            <div className="flex items-center gap-2 text-zinc-300">
                              {isPollingPix ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                                  <span>Aguardando pagamento · verificação automática</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                                  <span>Pix pronto para pagamento</span>
                                </>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={handleGeneratePix}
                              className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-white transition cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Atualizar QR</span>
                            </button>
                          </div>

                          {/* Centered QR Stage */}
                          <div className="flex flex-col items-center justify-center py-2 space-y-3">
                            <div className="p-4 rounded-2xl bg-white shadow-xl ring-1 ring-white/15">
                              {pixData.qrCodeBase64 ? (
                                <img
                                  src={
                                    pixData.qrCodeBase64.startsWith('data:')
                                      ? pixData.qrCodeBase64
                                      : `data:image/png;base64,${pixData.qrCodeBase64}`
                                  }
                                  alt="QR Code Pix Mercado Pago"
                                  className="w-44 h-44 sm:w-48 sm:h-48 object-contain"
                                />
                              ) : pixData.qrCode ? (
                                <QrCodeDisplay
                                  value={pixData.qrCode}
                                  size={184}
                                  alt="QR Code Pix"
                                />
                              ) : (
                                <div className="w-44 h-44 flex flex-col items-center justify-center text-zinc-800">
                                  <QrCode className="w-16 h-16 text-[#009EE3]" />
                                  <span className="text-[10px] mt-1 font-medium">
                                    Pix Copia e Cola
                                  </span>
                                </div>
                              )}
                            </div>
                            <span className="text-xs text-zinc-400">
                              Aponte a câmera do app do seu banco para o QR Code
                            </span>
                          </div>

                          {/* Dedicated Full-Width Copia e Cola Box (Zero Overlap / Crisp Figma Layout) */}
                          <div className="rounded-2xl bg-[#0D0E12] border border-white/[0.09] p-4 sm:p-5 space-y-3.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-white">
                                Código Pix Copia e Cola
                              </span>
                              <span className="text-[11px] text-zinc-500">
                                Toque no botão para copiar
                              </span>
                            </div>

                            <div
                              onClick={handleCopyPix}
                              title="Clique para copiar o código Pix"
                              className="w-full rounded-xl bg-[#16181F] border border-white/[0.07] px-3.5 py-3 font-mono text-[11px] leading-relaxed text-zinc-300 break-all max-h-24 overflow-y-auto cursor-pointer hover:border-[#009EE3]/40 transition select-all"
                            >
                              {pixData.qrCode || ''}
                            </div>

                            <button
                              type="button"
                              onClick={handleCopyPix}
                              className={`w-full py-3 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-sm ${
                                copiedPix
                                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                  : 'bg-[#009EE3] hover:bg-[#008CC9] text-white'
                              }`}
                            >
                              {copiedPix ? (
                                <>
                                  <Check className="w-4 h-4" />
                                  <span>Código Pix Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-4 h-4" />
                                  <span>Copiar Código Pix</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* 3-Step Clean Instructions */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 text-[11px] text-zinc-400">
                            <div className="border-t border-white/[0.06] pt-2.5">
                              <span className="font-semibold text-zinc-200 block mb-0.5">
                                1. Copie o código
                              </span>
                              Use o botão acima ou escaneie o QR Code.
                            </div>
                            <div className="border-t border-white/[0.06] pt-2.5">
                              <span className="font-semibold text-zinc-200 block mb-0.5">
                                2. Pague no banco
                              </span>
                              Acesse <strong>Pix → Copia e Cola</strong> e confirme.
                            </div>
                            <div className="border-t border-white/[0.06] pt-2.5">
                              <span className="font-semibold text-zinc-200 block mb-0.5">
                                3. Liberação imediata
                              </span>
                              A fatura é quitada automaticamente na hora.
                            </div>
                          </div>

                          {/* Sandbox Simulator */}
                          {!gatewayStatus?.isProduction && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#0D0E12] rounded-xl border border-white/[0.07] text-xs">
                              <span className="text-zinc-400 text-[11px]">
                                Modo Sandbox: simular confirmação automática do Webhook
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setPaymentApproved(true);
                                  setApprovedDetails({
                                    id: pixData.paymentId || 'MP-SIMULATED-01',
                                    method: 'Pix Mercado Pago (Webhook Aprovado)',
                                  });
                                }}
                                className="px-3.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/35 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0"
                              >
                                Simular Aprovação
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-12 text-center space-y-4 border border-white/[0.06] rounded-2xl bg-[#0E0F13] px-6">
                          <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center mx-auto border border-red-500/20">
                            <AlertCircle className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">
                              Não foi possível carregar o Pix via API
                            </p>
                            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto leading-relaxed">
                              {errorMessage ||
                                'Verifique se o Access Token do Mercado Pago está ativo nas Configurações do Sistema.'}
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-center gap-2.5">
                            <button
                              type="button"
                              onClick={handleGeneratePix}
                              className="px-4 py-2 bg-[#009EE3] hover:bg-[#008CC9] text-white rounded-xl text-xs font-semibold cursor-pointer transition flex items-center gap-2"
                            >
                              <QrCode className="w-4 h-4" />
                              <span>Tentar Novamente</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('card')}
                              className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 rounded-xl text-xs font-semibold cursor-pointer transition"
                            >
                              Pagar com Cartão
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* CREDIT CARD WORKSPACE */}
                  {activeTab === 'card' && (
                    <form
                      onSubmit={handleProcessCard}
                      className="space-y-4 text-xs animate-blur-in"
                    >
                      {/* Clean Card Brand Indicator Strip */}
                      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#0D0E12] border border-white/[0.08]">
                        <div className="flex items-center gap-2.5">
                          <CreditCard className="w-4 h-4 text-[#009EE3]" />
                          <span className="font-mono text-zinc-300 tabular-nums">
                            {cardNumber
                              ? `•••• •••• •••• ${cardNumber.replace(/\D/g, '').slice(-4).padStart(4, '•')}`
                              : '•••• •••• •••• ••••'}
                          </span>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-[#009EE3] uppercase">
                          {detectedBrand}
                        </span>
                      </div>

                      <div>
                        <label className="block text-zinc-300 font-medium mb-1.5">
                          Número do Cartão
                        </label>
                        <input
                          type="text"
                          required
                          value={cardNumber}
                          onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                          placeholder="0000 0000 0000 0000"
                          className="w-full px-3.5 py-2.5 bg-[#0D0E12] border border-white/[0.1] rounded-xl text-sm text-white font-mono tracking-wider focus:border-[#009EE3] focus:outline-none transition"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-zinc-300 font-medium mb-1.5">
                            Nome Impresso no Cartão
                          </label>
                          <input
                            type="text"
                            required
                            value={cardHolder}
                            onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                            placeholder="COMO ESTÁ NO CARTÃO"
                            className="w-full px-3.5 py-2.5 bg-[#0D0E12] border border-white/[0.1] rounded-xl text-xs text-white uppercase focus:border-[#009EE3] focus:outline-none transition"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-300 font-medium mb-1.5">
                            E-mail do Comprador
                          </label>
                          <input
                            type="email"
                            required
                            value={cardEmail}
                            onChange={(e) => setCardEmail(e.target.value)}
                            placeholder="comprador@email.com"
                            className="w-full px-3.5 py-2.5 bg-[#0D0E12] border border-white/[0.1] rounded-xl text-xs text-white focus:border-[#009EE3] focus:outline-none transition"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-zinc-300 font-medium mb-1.5">
                            Validade (MM/AA)
                          </label>
                          <input
                            type="text"
                            required
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                            placeholder="12/28"
                            className="w-full px-3.5 py-2.5 bg-[#0D0E12] border border-white/[0.1] rounded-xl text-xs text-white font-mono tabular-nums focus:border-[#009EE3] focus:outline-none transition"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-300 font-medium mb-1.5">
                            Código de Segurança (CVV)
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={4}
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                            placeholder="123"
                            className="w-full px-3.5 py-2.5 bg-[#0D0E12] border border-white/[0.1] rounded-xl text-xs text-white font-mono tabular-nums focus:border-[#009EE3] focus:outline-none transition"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-zinc-300 font-medium mb-1.5">
                            CPF do Titular do Cartão
                          </label>
                          <input
                            type="text"
                            required
                            value={cardCpf}
                            onChange={(e) => setCardCpf(formatCpf(e.target.value))}
                            placeholder="000.000.000-00"
                            className="w-full px-3.5 py-2.5 bg-[#0D0E12] border border-white/[0.1] rounded-xl text-xs text-white font-mono tabular-nums focus:border-[#009EE3] focus:outline-none transition"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-zinc-300 font-medium">
                              Parcelamento
                            </label>
                            <span className="text-[10px] text-zinc-500">Mín. R$ 5,00/parcela</span>
                          </div>
                          <select
                            value={installments}
                            onChange={(e) => setInstallments(Number(e.target.value))}
                            className="w-full px-3.5 py-2.5 bg-[#0D0E12] border border-white/[0.1] rounded-xl text-xs text-white tabular-nums focus:border-[#009EE3] focus:outline-none transition"
                          >
                            {availableInstallments.map((n) => (
                              <option key={n} value={n}>
                                {n === 1
                                  ? `1x de ${formatCurrency(invoiceAmount)} (à vista)`
                                  : `${n}x de ${formatCurrency(invoiceAmount / n)}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={isProcessingCard || invoiceAmount < 1.0}
                          className="w-full py-3.5 px-4 bg-[#009EE3] hover:bg-[#008CC9] text-white font-semibold rounded-xl text-sm transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {isProcessingCard ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Processando Pagamento...</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-4 h-4" />
                              <span>Pagar {formatCurrency(invoiceAmount)} com Segurança</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
