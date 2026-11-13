import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleApiRoute, type ApiRequest } from './src/server/handler';
import { db } from './src/server/db';
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
  try {
    const userIdHeader = (req.headers['x-user-id'] as string) || '';
    let currentUser: any = undefined;
    if (userIdHeader) {
      currentUser = db.resolveUserById(userIdHeader);
    }

    const apiReq: ApiRequest = {
      method: req.method,
      url: req.originalUrl || req.url,
      body: req.body,
      headers: req.headers as Record<string, string>,
      user: currentUser
    };

    const response = await handleApiRoute(apiReq);
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro interno no servidor' });
  }
});

// Serve frontend static assets from dist
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Base44 Campus SaaS Server running on port ${PORT}`);
});
