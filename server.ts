import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApiRoute, type ApiRequest } from './src/server/handler';
import { db } from './src/server/db';
import { verifySessionToken } from './src/server/auth';
import { applySecurityHeaders } from './src/server/securityHeaders';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use((req, res, next) => {
  applySecurityHeaders(req, res);
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API middleware handler
app.all('/api/*', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const reqUrl = req.originalUrl || req.url || '/api';
    const isSyncControlRoute =
      reqUrl.startsWith('/api/supabase/status') || reqUrl.startsWith('/api/supabase/sync-all');
    if (!isSyncControlRoute) {
      await db.ensureHydratedFromSupabase();
    }

    const tokenPayload = verifySessionToken(req.headers['authorization']);
    const currentUser = tokenPayload ? db.resolveUserById(tokenPayload.sub) : undefined;

    const apiReq: ApiRequest = {
      method: req.method,
      url: reqUrl,
      body: req.body,
      headers: req.headers as Record<string, string>,
      user: currentUser
    };

    const response = await handleApiRoute(apiReq);
    if (apiReq.method !== 'GET' && apiReq.method !== 'HEAD' && apiReq.method !== 'OPTIONS') {
      await db.flushSupabaseSync(12000);
    }
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro interno no servidor' });
  }
});

// Serve hashed Vite assets with immutable 1-year cache
app.use('/assets', express.static(path.join(__dirname, 'dist', 'assets'), {
  maxAge: '1y',
  immutable: true,
}));

// Serve remaining static files from dist with short cache and no-cache for HTML
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Fallback to index.html for SPA routing
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Base44 Campus SaaS Server running on port ${PORT}`);
});
