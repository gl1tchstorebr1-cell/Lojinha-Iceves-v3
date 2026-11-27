import crypto from 'node:crypto';
import type { UserRole } from '../types/index.ts';

const SCRYPT_PREFIX = 'scrypt$';
const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

// Segredo de assinatura de sessão em memória quando não definido em variável de ambiente
const RUNTIME_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const configured = (process.env.SESSION_SECRET || process.env.AUTH_SESSION_SECRET || '').trim();
  return configured || RUNTIME_FALLBACK_SECRET;
}

// Controle de tokens revogados (logout explícito)
const revokedJtis = new Map<string, number>();

function pruneRevokedJtis() {
  const now = Date.now();
  for (const [jti, exp] of revokedJtis.entries()) {
    if (exp <= now) {
      revokedJtis.delete(jti);
    }
  }
}

// Proteção contra força bruta no login (10 falhas por 15 minutos por identificador)
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 10;
const loginFailures = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry) return { allowed: true };
  if (entry.resetAt <= now) {
    loginFailures.delete(key);
    return { allowed: true };
  }
  if (entry.count >= MAX_LOGIN_FAILURES) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { allowed: true };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry || entry.resetAt <= now) {
    loginFailures.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
    loginFailures.set(key, entry);
  }
}

export function clearLoginFailures(key: string): void {
  loginFailures.delete(key);
}

/**
 * Gera hash criptográfico seguro da senha com scrypt + salt aleatório de 16 bytes.
 */
export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN).toString('hex');
  return `${SCRYPT_PREFIX}${salt}$${derived}`;
}

export function isScryptHash(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(SCRYPT_PREFIX) && value.split('$').length === 3;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Executa comparação de tamanho fixo para evitar vazamento de comprimento
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifica uma senha contra um hash scrypt (ou texto legado em migração).
 */
export function verifyPassword(plainPassword: string, storedPassword?: string | null): boolean {
  if (!plainPassword || !storedPassword) return false;

  if (isScryptHash(storedPassword)) {
    const parts = storedPassword.split('$');
    const salt = parts[1];
    const expectedHex = parts[2];
    if (!salt || !expectedHex) return false;
    try {
      const derivedBuf = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN);
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      if (derivedBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(derivedBuf, expectedBuf);
    } catch {
      return false;
    }
  }

  // Compatibilidade temporária para contas criadas antes da migração para scrypt
  return timingSafeEqualString(plainPassword, storedPassword);
}

/**
 * Verifica se a senha administrativa via variável de ambiente (process.env.ADMIN_PASSWORD) está definida.
 * Quando definida, SEMPRE prevalece sobre qualquer hash salvo localmente.
 */
export function isAdminEnvPasswordConfigured(): boolean {
  return Boolean((process.env.ADMIN_PASSWORD || '').trim());
}

export function verifyAdminEnvPassword(plainPassword: string): boolean {
  const envPass = (process.env.ADMIN_PASSWORD || '').trim();
  if (!envPass || !plainPassword) return false;
  return timingSafeEqualString(plainPassword, envPass);
}

export interface SessionTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
  iat: number;
  exp: number;
  jti: string;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function signPayloadSegment(payloadSegment: string): string {
  return base64UrlEncode(
    crypto.createHmac('sha256', getSessionSecret()).update(payloadSegment).digest()
  );
}

/**
 * Emite um token Bearer assinado (HMAC-SHA256) com expiração de 8 horas.
 */
export function issueSessionToken(user: {
  id: string;
  role: UserRole;
  email: string;
}): { token: string; expiresAt: string } {
  const now = Date.now();
  const exp = now + SESSION_TTL_MS;
  const payload: SessionTokenPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
    iat: now,
    exp,
    jti: crypto.randomBytes(16).toString('hex'),
  };
  const payloadSegment = base64UrlEncode(JSON.stringify(payload));
  const signatureSegment = signPayloadSegment(payloadSegment);
  return {
    token: `${payloadSegment}.${signatureSegment}`,
    expiresAt: new Date(exp).toISOString(),
  };
}

export function extractBearerToken(authorizationHeader?: string | string[]): string | null {
  if (!authorizationHeader) return null;
  const raw = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/^Bearer\s+([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/i);
  return match ? match[1] : null;
}

/**
 * Valida assinatura HMAC-SHA256, expiração e revogação de um token Bearer.
 */
export function verifySessionToken(authorizationHeader?: string | string[]): SessionTokenPayload | null {
  const token = extractBearerToken(authorizationHeader);
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadSegment, providedSig] = parts;
  if (!payloadSegment || !providedSig) return null;

  const expectedSig = signPayloadSegment(payloadSegment);
  if (!timingSafeEqualString(providedSig, expectedSig)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payloadSegment)) as SessionTokenPayload;
    if (!parsed || !parsed.sub || !parsed.role || !parsed.exp || !parsed.jti) {
      return null;
    }
    if (Date.now() >= parsed.exp) {
      return null;
    }
    pruneRevokedJtis();
    if (revokedJtis.has(parsed.jti)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function revokeSessionToken(authorizationHeader?: string | string[]): void {
  const payload = verifySessionToken(authorizationHeader);
  if (payload) {
    revokedJtis.set(payload.jti, payload.exp);
  }
}
