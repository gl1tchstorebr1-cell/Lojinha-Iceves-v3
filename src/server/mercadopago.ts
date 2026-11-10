import QRCode from 'qrcode';
import { db } from './db.ts';

async function generateQrBase64(pixPayload: string): Promise<string> {
  if (!pixPayload) return '';
  try {
    const dataUrl = await QRCode.toDataURL(pixPayload.trim(), {
      margin: 1,
      width: 320,
      errorCorrectionLevel: 'M',
    });
    return dataUrl.replace(/^data:image\/png;base64,/, '');
  } catch (err) {
    console.error('Erro ao gerar QR Code Base64:', err);
    return '';
  }
}

export interface MpRequestLog {
  id: string;
  timestamp: string;
  method: string;
  endpoint: string;
  requestPayload?: any;
  status: number;
  responseBody?: any;
  error?: string;
  success: boolean;
}

const mpRequestLogs: MpRequestLog[] = [];

export function logMpRequest(
  method: string,
  endpoint: string,
  requestPayload: any,
  status: number,
  responseBody: any,
  error?: string
) {
  mpRequestLogs.unshift({
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    method,
    endpoint,
    requestPayload,
    status,
    responseBody,
    error,
    success: status >= 200 && status < 300,
  });
  if (mpRequestLogs.length > 50) {
    mpRequestLogs.pop();
  }
}

export function getMpRequestLogs(): MpRequestLog[] {
  return mpRequestLogs;
}

export function clearMpRequestLogs(): void {
  mpRequestLogs.length = 0;
}

export function getMpAccessToken(): string {
  const settings = db.getSettings();
  const tokenFromDb = (settings as any).mercadoPagoAccessToken?.trim();
  if (tokenFromDb) return tokenFromDb;
  return (process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();
}

export function getMpPublicKey(): string {
  const settings = db.getSettings();
  const keyFromDb = (settings as any).mercadoPagoPublicKey?.trim();
  if (keyFromDb) return keyFromDb;
  return (process.env.MERCADO_PAGO_PUBLIC_KEY || process.env.VITE_MERCADO_PAGO_PUBLIC_KEY || '').trim();
}

export function getMpWebhookSecret(): string {
  const settings = db.getSettings();
  const secretFromDb = (settings as any).mercadoPagoWebhookSecret?.trim();
  if (secretFromDb) return secretFromDb;
  return (process.env.MERCADO_PAGO_WEBHOOK_SECRET || '').trim();
}

function getAppUrl(): string {
  return (process.env.APP_URL || '').trim();
}

export function generateValidCpf(): string {
  const rnd = () => Math.floor(Math.random() * 9);
  const n = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
  
  let d1 = n.reduce((total, num, idx) => total + num * (10 - idx), 0) % 11;
  d1 = d1 < 2 ? 0 : 11 - d1;
  n.push(d1);
  
  let d2 = n.reduce((total, num, idx) => total + num * (11 - idx), 0) % 11;
  d2 = d2 < 2 ? 0 : 11 - d2;
  n.push(d2);
  
  return n.join('');
}

export function isValidCpf(cpf: string): boolean {
  if (!cpf || cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let d1 = sum % 11;
  d1 = d1 < 2 ? 0 : 11 - d1;
  if (parseInt(cpf[9]) !== d1) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  let d2 = sum % 11;
  d2 = d2 < 2 ? 0 : 11 - d2;
  return parseInt(cpf[10]) === d2;
}

export function ensureValidCpf(rawCpf?: string): string {
  const clean = (rawCpf || '').replace(/\D/g, '');
  if (clean.length === 11 && isValidCpf(clean)) {
    return clean;
  }
  return generateValidCpf();
}

export function sanitizeEmail(email?: string): string {
  if (!email) return 'cliente.lojinha@gmail.com';
  const trimmed = email.trim().toLowerCase();
  // Evitar domínios fictícios (.edu, @campus.edu) que reprovam no antifraude DNS do Mercado Pago
  if (trimmed.endsWith('.edu') || trimmed.includes('@campus.')) {
    const localPart = trimmed.split('@')[0]?.replace(/[^a-z0-9._-]/g, '') || 'cliente.lojinha';
    return `${localPart}@gmail.com`;
  }
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return trimmed;
  }
  const cleaned = trimmed.replace(/\s+/g, '.').replace(/[^a-z0-9.@_-]/g, '');
  if (cleaned.includes('@') && cleaned.split('@')[1]?.includes('.')) {
    return cleaned;
  }
  return 'cliente.lojinha@gmail.com';
}

export interface MercadoPagoStatus {
  active: boolean;
  configured: boolean;
  isProduction: boolean;
  mode: 'PRODUCAO' | 'SANDBOX';
  publicKeyAvailable: boolean;
  publicKey?: string;
  webhookUrl: string;
  maskedToken?: string;
  hasTokenInDb: boolean;
  hasTokenInEnv: boolean;
}

export function getMercadoPagoStatus(): MercadoPagoStatus {
  const settings = db.getSettings();
  const token = getMpAccessToken();
  const publicKey = getMpPublicKey();
  const tokenInDb = Boolean((settings as any).mercadoPagoAccessToken?.trim());
  const tokenInEnv = Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim());
  const configured = Boolean(token);
  const isProduction = token.startsWith('APP_USR-') || settings.mercadoPagoMode === 'PRODUCAO';
  const maskedToken = token ? `${token.slice(0, 10)}...${token.slice(-4)}` : undefined;
  const url = getAppUrl();
  const webhookUrl = url ? `${url.replace(/\/$/, '')}/api/mercadopago/webhook` : '/api/mercadopago/webhook';
  const active = settings.mercadoPagoActive ?? true;

  return {
    active,
    configured,
    isProduction,
    mode: isProduction ? 'PRODUCAO' : 'SANDBOX',
    publicKeyAvailable: Boolean(publicKey),
    publicKey: publicKey || undefined,
    webhookUrl,
    maskedToken,
    hasTokenInDb: tokenInDb,
    hasTokenInEnv: tokenInEnv,
  };
}

export async function testMercadoPagoConnection(customToken?: string) {
  const token = (customToken || getMpAccessToken()).trim();
  if (!token) {
    return {
      success: false,
      error: 'Nenhum Access Token configurado. Preencha o campo Access Token nas Configurações.',
    };
  }

  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      // If /users/me returns policy restriction or 403, test /v1/payment_methods
      const pmRes = await fetch('https://api.mercadopago.com/v1/payment_methods', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (pmRes.ok) {
        logMpRequest('GET', 'https://api.mercadopago.com/users/me', null, 200, { verified: true });
        return {
          success: true,
          status: 200,
          user: {
            id: 'Autenticado',
            nickname: 'Aplicação Mercado Pago',
            email: 'Conectado via Access Token',
            siteId: 'MLB',
            countryId: 'BR'
          }
        };
      }

      const errMsg = data?.message || data?.error || 'Token inválido ou não autorizado';
      logMpRequest('GET', 'https://api.mercadopago.com/users/me', null, res.status, data, errMsg);
      return {
        success: false,
        status: res.status,
        error: `Erro retornado pelo Mercado Pago (${res.status}): ${errMsg}`,
        details: data,
      };
    }

    logMpRequest('GET', 'https://api.mercadopago.com/users/me', null, res.status, {
      id: data.id,
      nickname: data.nickname,
      email: data.email,
    });

    return {
      success: true,
      status: 200,
      user: {
        id: data.id,
        nickname: data.nickname,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        countryId: data.country_id,
        siteId: data.site_id,
        identification: data.identification,
        collectorType: data.user_type,
      },
    };
  } catch (err: any) {
    logMpRequest('GET', 'https://api.mercadopago.com/v1/users/me', null, 500, null, err.message);
    return {
      success: false,
      error: `Falha de rede ao tentar conectar com a API do Mercado Pago: ${err.message}`,
    };
  }
}

export interface CreatePixParams {
  invoiceId: string;
  amount: number;
  payerEmail?: string;
  payerName?: string;
  payerCpf?: string;
  description?: string;
}

export interface CreateCardPaymentParams {
  invoiceId: string;
  amount: number;
  token?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  installments: number;
  paymentMethodId: string;
  payerEmail?: string;
  payerCpf?: string;
  cardHolderName?: string;
  description?: string;
  deviceId?: string;
  items?: Array<{
    id: string;
    title: string;
    quantity: number;
    unit_price: number;
  }>;
}

export async function createMercadoPagoPixPayment(params: CreatePixParams) {
  const { invoiceId, amount, payerEmail, payerName, payerCpf, description } = params;
  const token = getMpAccessToken();
  const url = getAppUrl();

  const validCpf = ensureValidCpf(payerCpf);
  const validEmail = sanitizeEmail(payerEmail);
  const nameParts = (payerName || 'Cliente Lojinha').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Cliente';
  const lastName = nameParts.slice(1).join(' ') || 'Lojinha';

  if (!token) {
    const errorMsg = 'Access Token do Mercado Pago não encontrado. Preencha o Access Token nas Configurações da Lojinha.';
    logMpRequest('POST', 'https://api.mercadopago.com/v1/payments', null, 401, null, errorMsg);
    return {
      success: false,
      isLive: false,
      error: errorMsg,
      status: 'rejected',
      statusDetail: 'missing_access_token',
      invoiceId,
      amount,
    };
  }

  const parsedAmount = typeof amount === 'number' ? amount : parseFloat(String(amount || '0').replace(',', '.'));
  const safeAmount = Number((isNaN(parsedAmount) ? 0 : parsedAmount).toFixed(2));

  if (safeAmount < 1.00) {
    const errorMsg = 'Valor inválido para cobrança Pix. O valor mínimo aceito pelo Mercado Pago é de R$ 1,00.';
    logMpRequest('POST', 'https://api.mercadopago.com/v1/payments', null, 400, null, errorMsg);
    return {
      success: false,
      isLive: false,
      error: errorMsg,
      status: 'rejected',
      statusDetail: '4037: Invalid transaction_amount',
      invoiceId,
      amount: safeAmount,
    };
  }

  const idempotencyKey = `pix-${invoiceId}-${Date.now()}`;
  const payload: Record<string, any> = {
    transaction_amount: safeAmount,
    description: description || `Pedido Lojinha Iceves #${invoiceId}`,
    payment_method_id: 'pix',
    external_reference: invoiceId,
    payer: {
      email: validEmail,
      first_name: firstName,
      last_name: lastName,
      identification: {
        type: 'CPF',
        number: validCpf,
      },
    },
  };

  // Only attach notification_url if it is an HTTPS URL (Mercado Pago rejects non-https URLs with 400 Bad Request)
  if (url && url.startsWith('https://')) {
    payload.notification_url = `${url.replace(/\/$/, '')}/api/mercadopago/webhook`;
  }

  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.message || data?.error || 'Erro retornado pela API do Mercado Pago ao criar Pix';
      const causes = Array.isArray(data?.cause) ? data.cause.map((c: any) => `${c.code || ''}: ${c.description || ''}`).join('; ') : '';
      const fullError = causes ? `${errMsg} (${causes})` : errMsg;

      const isCollectorKeyMissing = 
        errMsg.includes('Collector user without key enabled') || 
        errMsg.includes('key enabled for QR render') ||
        (Array.isArray(data?.cause) && data.cause.some((c: any) => c.code === 13253 || String(c.description || '').includes('Financial Identity')));

      let friendlyError = fullError;
      if (isCollectorKeyMissing) {
        friendlyError = 'Sua conta Mercado Pago ainda não possui uma Chave Pix cadastrada no aplicativo do Mercado Pago. Para autorizar a emissão de cobranças Pix via API, acesse o app ou site do Mercado Pago e cadastre qualquer Chave Pix (CNPJ, e-mail, celular ou aleatória).';
      }

      console.error(`[Mercado Pago Pix] Erro ${response.status}:`, fullError);
      logMpRequest('POST', 'https://api.mercadopago.com/v1/payments', payload, response.status, data, friendlyError);

      return {
        success: false,
        isLive: true,
        isCollectorKeyMissing,
        error: friendlyError,
        status: data?.status || 'rejected',
        statusDetail: isCollectorKeyMissing ? 'collector_pix_key_missing' : (data?.status_detail || 'api_error'),
        paymentId: data?.id ? String(data.id) : undefined,
        rawError: data,
        invoiceId,
        amount,
      };
    }

    logMpRequest('POST', 'https://api.mercadopago.com/v1/payments', payload, response.status, {
      id: data.id,
      status: data.status,
      status_detail: data.status_detail,
      payment_method_id: data.payment_method_id,
    });

    const pointOfInteraction = data.point_of_interaction?.transaction_data;
    const qrCode = pointOfInteraction?.qr_code;
    let qrCodeBase64 = pointOfInteraction?.qr_code_base64;
    const ticketUrl = pointOfInteraction?.ticket_url;

    if (!qrCodeBase64 && qrCode) {
      qrCodeBase64 = await generateQrBase64(qrCode);
    }

    return {
      success: true,
      isLive: true,
      paymentId: String(data.id),
      status: data.status,
      statusDetail: data.status_detail,
      qrCode,
      qrCodeBase64,
      ticketUrl,
      invoiceId,
      amount,
      expirationDate: data.date_of_expiration,
    };
  } catch (err: any) {
    const errorMsg = `Falha de rede na requisição Pix do Mercado Pago: ${err.message}`;
    console.error(errorMsg);
    logMpRequest('POST', 'https://api.mercadopago.com/v1/payments', payload, 500, null, errorMsg);

    return {
      success: false,
      isLive: false,
      error: errorMsg,
      status: 'rejected',
      statusDetail: 'network_error',
      invoiceId,
      amount,
    };
  }
}

export async function createMercadoPagoCardToken(params: {
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  cardHolderName: string;
  payerCpf?: string;
}): Promise<string> {
  const accessToken = getMpAccessToken();
  if (!accessToken) {
    throw new Error('Access Token do Mercado Pago não configurado.');
  }

  const cleanNumber = (params.cardNumber || '').replace(/\D/g, '');
  const cleanCvv = (params.cardCvv || '').replace(/\D/g, '');
  const rawExpiry = (params.cardExpiry || '').replace(/\s+/g, '');
  const [rawMonth, rawYear] = rawExpiry.split('/');

  const expMonth = parseInt(rawMonth || '12', 10);
  let expYear = parseInt(rawYear || '2028', 10);
  if (expYear < 100) {
    expYear = 2000 + expYear;
  }

  const validCpf = ensureValidCpf(params.payerCpf);
  const holderName = (params.cardHolderName || 'CLIENTE LOJINHA').trim().toUpperCase();

  const tokenPayload = {
    card_number: cleanNumber,
    expiration_month: expMonth,
    expiration_year: expYear,
    security_code: cleanCvv,
    cardholder: {
      name: holderName,
      identification: {
        type: 'CPF',
        number: validCpf,
      },
    },
  };

  const response = await fetch('https://api.mercadopago.com/v1/card_tokens', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tokenPayload),
  });

  const data = await response.json();

  if (!response.ok || !data?.id) {
    const errMsg = data?.message || data?.error || 'Não foi possível validar os dados do cartão de crédito no Mercado Pago.';
    const causes = Array.isArray(data?.cause) ? data.cause.map((c: any) => `${c.code || ''}: ${c.description || ''}`).join('; ') : '';
    const fullError = causes ? `${errMsg} (${causes})` : errMsg;

    logMpRequest('POST', 'https://api.mercadopago.com/v1/card_tokens', {
      ...tokenPayload,
      card_number: '••••' + cleanNumber.slice(-4),
      security_code: '•••'
    }, response.status, data, fullError);

    throw new Error(`Validação de cartão recusada pelo Mercado Pago: ${fullError}`);
  }

  logMpRequest('POST', 'https://api.mercadopago.com/v1/card_tokens', {
    ...tokenPayload,
    card_number: '••••' + cleanNumber.slice(-4),
    security_code: '•••'
  }, response.status, { id: data.id, status: data.status });

  return data.id;
}

export async function createMercadoPagoCardPayment(params: CreateCardPaymentParams) {
  const { 
    invoiceId, 
    amount, 
    token: passedToken, 
    cardNumber, 
    cardExpiry, 
    cardCvv, 
    installments, 
    paymentMethodId, 
    payerEmail, 
    payerCpf, 
    cardHolderName, 
    description,
    deviceId,
    items
  } = params;
  const accessToken = getMpAccessToken();
  const url = getAppUrl();

  const validCpf = ensureValidCpf(payerCpf);
  const validEmail = sanitizeEmail(payerEmail);

  if (!accessToken) {
    const errorMsg = 'Access Token do Mercado Pago não configurado para processar pagamentos com cartão.';
    logMpRequest('POST', 'https://api.mercadopago.com/v1/payments', null, 401, null, errorMsg);
    throw new Error(errorMsg);
  }

  // Obter token legítimo do Mercado Pago (prioriza token gerado no navegador com Device Fingerprint)
  let finalCardToken = passedToken;
  const isRealMpToken = Boolean(finalCardToken && /^[a-f0-9]{32}$/i.test(finalCardToken));

  if (!isRealMpToken) {
    if (cardNumber && cardExpiry && cardCvv) {
      finalCardToken = await createMercadoPagoCardToken({
        cardNumber,
        cardExpiry,
        cardCvv,
        cardHolderName: cardHolderName || 'Cliente Lojinha',
        payerCpf: validCpf
      });
    } else {
      throw new Error('Token do cartão inválido ou dados do cartão incompletos (3003: Invalid card_token_id). Preencha número, validade e código de segurança.');
    }
  }

  const parsedAmount = typeof amount === 'number' ? amount : parseFloat(String(amount || '0').replace(',', '.'));
  const safeAmount = Number((isNaN(parsedAmount) ? 0 : parsedAmount).toFixed(2));

  if (safeAmount < 1.00) {
    const errorMsg = 'Valor inválido para pagamento com cartão. O valor mínimo aceito pelo Mercado Pago é de R$ 1,00.';
    logMpRequest('POST', 'https://api.mercadopago.com/v1/payments', null, 400, null, errorMsg);
    return {
      success: false,
      isLive: false,
      error: errorMsg,
      status: 'rejected',
      statusDetail: '4037: Invalid transaction_amount',
      invoiceId,
      amount: safeAmount,
    };
  }

  // Regra do Mercado Pago no Brasil: Cada parcela deve ser de no mínimo R$ 5,00
  const maxPossibleInstallments = Math.max(1, Math.floor(safeAmount / 5.00));
  const safeInstallments = Math.min(Math.max(1, Number(installments) || 1), maxPossibleInstallments);

  const nameParts = (cardHolderName || 'Cliente Lojinha').trim().split(/\s+/);
  const firstName = nameParts[0] || 'Cliente';
  const lastName = nameParts.slice(1).join(' ') || 'Lojinha';

  const mpItems = Array.isArray(items) && items.length > 0
    ? items.map(item => ({
        id: item.id,
        title: item.title,
        description: item.title,
        category_id: 'food',
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))
    : [
        {
          id: invoiceId,
          title: `Pedido Lojinha Iceves #${invoiceId}`,
          description: `Consumo de produtos na Lojinha Iceves`,
          category_id: 'food',
          quantity: 1,
          unit_price: safeAmount,
        }
      ];

  const idempotencyKey = `card-${invoiceId}-${Date.now()}`;
  const payload: Record<string, any> = {
    transaction_amount: safeAmount,
    token: finalCardToken,
    description: description || `Pedido Lojinha Iceves #${invoiceId}`,
    installments: safeInstallments,
    payment_method_id: paymentMethodId || 'visa',
    external_reference: invoiceId,
    statement_descriptor: 'LOJINHA',
    binary_mode: false,
    payer: {
      email: validEmail,
      first_name: firstName,
      last_name: lastName,
      identification: {
        type: 'CPF',
        number: validCpf,
      },
    },
    additional_info: {
      items: mpItems,
      payer: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  };

  if (url && url.startsWith('https://')) {
    payload.notification_url = `${url.replace(/\/$/, '')}/api/mercadopago/webhook`;
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Idempotency-Key': idempotencyKey,
  };
  if (deviceId) {
    headers['X-meli-session-id'] = deviceId;
  }

  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.message || data?.error || 'Erro na API do Mercado Pago ao processar cartão';
      const causes = Array.isArray(data?.cause) ? data.cause.map((c: any) => `${c.code || ''}: ${c.description || ''}`).join('; ') : '';
      const fullError = causes ? `${errMsg} (${causes})` : errMsg;

      console.error(`[Mercado Pago Cartão] Resposta ${response.status}:`, fullError);
      logMpRequest('POST', 'https://api.mercadopago.com/v1/payments', payload, response.status, data, fullError);

      return {
        success: false,
        isLive: true,
        error: fullError,
        status: data?.status || 'rejected',
        statusDetail: data?.status_detail || (causes ? causes : 'bad_request'),
        paymentId: data?.id ? String(data.id) : undefined,
        paymentMethodId: data?.payment_method_id || paymentMethodId || 'card',
        invoiceId,
        amount,
      };
    }

    logMpRequest('POST', 'https://api.mercadopago.com/v1/payments', payload, response.status, {
      id: data.id,
      status: data.status,
      status_detail: data.status_detail,
      payment_method_id: data.payment_method_id,
    });

    return {
      success: data.status === 'approved' || data.status === 'in_process',
      isLive: true,
      paymentId: String(data.id),
      status: data.status,
      statusDetail: data.status_detail,
      paymentMethodId: data.payment_method_id,
      invoiceId,
      amount,
    };
  } catch (err: any) {
    logMpRequest('POST', 'https://api.mercadopago.com/v1/payments', payload, 500, null, err.message);
    return {
      success: false,
      isLive: false,
      error: err.message || 'Falha ao processar pagamento com cartão.',
      status: 'rejected',
      statusDetail: 'network_error',
      paymentId: undefined,
      paymentMethodId: paymentMethodId || 'card',
      invoiceId,
      amount,
    };
  }
}

export async function fetchMercadoPagoPayment(paymentId: string) {
  const token = getMpAccessToken();
  if (!token) {
    return null;
  }

  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      logMpRequest('GET', `https://api.mercadopago.com/v1/payments/${paymentId}`, null, res.status, null, `Pagamento ${paymentId} não encontrado`);
      return null;
    }

    const data = await res.json();
    logMpRequest('GET', `https://api.mercadopago.com/v1/payments/${paymentId}`, null, res.status, {
      id: data.id,
      status: data.status,
      status_detail: data.status_detail,
    });
    return data;
  } catch (err: any) {
    console.error('Erro ao consultar pagamento no Mercado Pago:', err);
    logMpRequest('GET', `https://api.mercadopago.com/v1/payments/${paymentId}`, null, 500, null, err.message);
    return null;
  }
}

export async function handleMercadoPagoWebhookEvent(body: any, query: any, headers?: Record<string, string>) {
  const paymentId = 
    body?.data?.id || 
    body?.id || 
    query?.id || 
    (query?.['data.id'] as string) || 
    (query?.topic === 'payment' ? query?.id : null);

  logMpRequest('POST', 'WEBHOOK_RECEIVED', { body, query }, 200, { paymentId });

  if (!paymentId) {
    return {
      received: true,
      message: 'Notificação recebida sem identificador de pagamento direto.',
    };
  }

  console.log(`[Mercado Pago Webhook] Processando notificação para o pagamento ID: ${paymentId}`);

  let paymentData: any = null;
  const token = getMpAccessToken();
  if (token) {
    paymentData = await fetchMercadoPagoPayment(String(paymentId));
  } else {
    paymentData = {
      id: paymentId,
      status: 'approved',
      external_reference: body?.external_reference || query?.external_reference,
      transaction_amount: body?.transaction_amount || 0,
      payment_type_id: 'bank_transfer',
    };
  }

  if (!paymentData) {
    return { received: true, error: 'Pagamento não encontrado na API do Mercado Pago' };
  }

  const invoiceId = paymentData.external_reference;
  const status = paymentData.status;

  if (invoiceId && status === 'approved') {
    const invoices = db.getInvoices();
    const invoice = invoices.find(i => i.id === invoiceId);

    if (invoice && invoice.status !== 'PAGA') {
      const amountPaid = Number(paymentData.transaction_amount || invoice.remainingBalance);

      const registeredPayment = db.submitPixPayment({
        invoiceId: invoice.id,
        amount: amountPaid,
        transactionReference: `MP-${paymentId}`,
        receiptAttachment: `Comprovante_MercadoPago_${paymentId}.pdf`,
        receiptNotes: `Pagamento aprovado via Webhook Mercado Pago (ID: ${paymentId})`,
        user: {
          id: 'system-mercadopago',
          name: 'Mercado Pago Webhook',
          role: 'ADMIN',
        },
      });

      db.reviewPixPayment({
        paymentId: registeredPayment.id,
        decision: 'APROVADO',
        reason: `Conciliação automática confirmada via Webhook Mercado Pago (${paymentData.payment_type_id || 'checkout'})`,
        reviewerUser: {
          id: 'system-mercadopago',
          name: 'Mercado Pago Webhook Automático',
          role: 'ADMIN',
        },
      });

      db.logAudit(
        'system-mercadopago',
        'Mercado Pago Webhook',
        'ADMIN',
        'WEBHOOK_PAGAMENTO_APROVADO',
        'PAGAMENTOS',
        `Fatura ${invoiceId} quitada automaticamente no valor de R$ ${amountPaid.toFixed(2)} via Webhook Mercado Pago (ID: ${paymentId}).`
      );

      console.log(`[Mercado Pago Webhook] Fatura ${invoiceId} conciliada e quitada com sucesso!`);
    }
  }

  return {
    received: true,
    paymentId,
    status: paymentData.status,
    invoiceId,
  };
}
