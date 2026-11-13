import type { IncomingMessage, ServerResponse } from 'http';
import { handleApiRoute, type ApiRequest } from '../src/server/handler.ts';
import { db } from '../src/server/db.ts';
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

    const userIdHeader = (req.headers['x-user-id'] as string) || '';
    let currentUser: any = undefined;
    if (userIdHeader) {
      currentUser = db.resolveUserById(userIdHeader);
    }

    const apiReq: ApiRequest = {
      method: req.method || 'GET',
      url: req.originalUrl || req.url || '/api',
      body,
      headers: req.headers as Record<string, string>,
      user: currentUser,
    };

    const response = await handleApiRoute(apiReq);
    res.statusCode = response.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(response.data));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: err.message || 'Erro interno no servidor' }));
  }
}
