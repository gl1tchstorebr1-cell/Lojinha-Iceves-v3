import type { IncomingMessage, ServerResponse } from 'http';

export function getSecurityHeaders(req?: IncomingMessage | { headers?: Record<string, string | string[] | undefined> }): Record<string, string> {
  const host = String(req?.headers?.['host'] || '');
  const xForwardedHost = String(req?.headers?.['x-forwarded-host'] || '');
  const isVercel = Boolean(process.env.VERCEL) || host.includes('vercel.app') || xForwardedHost.includes('vercel.app');

  if (!isVercel) {
    // No ambiente de Preview do AI Studio (que roda dentro de um iframe cross-origin),
    // NÃO devemos enviar X-Frame-Options: DENY, frame-ancestors 'none', COOP ou CORP restritivos,
    // pois o navegador bloquearia a exibição do iframe de preview.
    return {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-XSS-Protection': '1; mode=block',
      'X-Permitted-Cross-Domain-Policies': 'none',
      'X-DNS-Prefetch-Control': 'off'
    };
  }

  // No ambiente de produção da Vercel (lojinha-iceves-v3.vercel.app), aplica todos os headers estritos
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sdk.mercadopago.com https://www.mercadopago.com https://http2.mlstatic.com https://js.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mercadopago.com https://api.stripe.com",
    "frame-src 'self' https://www.mercadopago.com https://sdk.mercadopago.com https://js.stripe.com",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests"
  ].join('; ');

  return {
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'Content-Security-Policy': cspDirectives,
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cross-Origin-Embedder-Policy': 'unsafe-none',
    'X-XSS-Protection': '1; mode=block',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'X-DNS-Prefetch-Control': 'off'
  };
}

export function applySecurityHeaders(req: IncomingMessage, res: ServerResponse): void {
  res.removeHeader('X-Powered-By');
  const headers = getSecurityHeaders(req);
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}
