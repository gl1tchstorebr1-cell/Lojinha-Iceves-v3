import type { Plugin } from 'vite';
import { handleApiRoute, type ApiRequest } from './handler.ts';
import { db } from './db.ts';
import { applySecurityHeaders } from './securityHeaders.ts';

export function base44ApiPlugin(): Plugin {
  return {
    name: 'base44-api-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        applySecurityHeaders(req, res);

        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        try {
          // Read request body if present
          let body: any = null;
          if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            if (rawBody.trim()) {
              try {
                body = JSON.parse(rawBody);
              } catch (e) {
                body = rawBody;
              }
            }
          }

          // Resolve User from headers for true server-side RBAC
          const userIdHeader = (req.headers['x-user-id'] as string) || '';
          let currentUser: any = undefined;
          if (userIdHeader) {
            currentUser = db.resolveUserById(userIdHeader);
          }

          const apiReq: ApiRequest = {
            method: req.method || 'GET',
            url: req.url,
            body,
            headers: req.headers as Record<string, string>,
            user: currentUser
          };

          const response = await handleApiRoute(apiReq);

          res.statusCode = response.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(response.data));
        } catch (err: any) {
          console.error('Erro no plugin de API do Campus:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: err.message || 'Erro interno no servidor' }));
        }
      });
    }
  };
}
