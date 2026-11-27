import type { IncomingMessage, ServerResponse } from 'http';
import { handleApiRoute, type ApiRequest } from '../src/server/handler.ts';
import { db } from '../src/server/db.ts';
import { verifySessionToken } from '../src/server/auth.ts';
import { applySecurityHeaders } from '../src/server/securityHeaders.ts';

export default async function vercelApiHandler(req: IncomingMessage & { body?: any; originalUrl?: string }, res: ServerResponse) {
  applySecurityHeaders(req, res);

  try {
    let body: any = req.body ?? null;
    if (!body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const rawBody = Buffer.concat(chunks).toString('utf-8');
      if (rawBody.trim()) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          body = rawBody;
        }
      }
    }

    const reqUrl = req.originalUrl || req.url || '/api';
    const isSyncControlRoute = reqUrl.startsWith('/api/supabase/status') || reqUrl.startsWith('/api/supabase/sync-all');
    if (!isSyncControlRoute) {
      const isMutation = (req.method || 'GET').toUpperCase() !== 'GET' && (req.method || 'GET').toUpperCase() !== 'HEAD' && (req.method || 'GET').toUpperCase() !== 'OPTIONS';
      await db.ensureHydratedFromSupabase({ maxAgeMs: isMutation ? 2000 : 8000 });
    }

    const tokenPayload = verifySessionToken(req.headers['authorization']);
    const currentUser = tokenPayload ? db.resolveUserById(tokenPayload.sub) : undefined;

    const apiReq: ApiRequest = {
      method: req.method || 'GET',
      url: reqUrl,
      body,
      headers: req.headers as Record<string, string>,
      user: currentUser,
    };

    const response = await handleApiRoute(apiReq);
    if (apiReq.method !== 'GET' && apiReq.method !== 'HEAD' && apiReq.method !== 'OPTIONS') {
      await db.flushSupabaseSync(12000);
    }
    res.statusCode = response.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(response.data));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: err.message || 'Erro interno no servidor' }));
  }
}
