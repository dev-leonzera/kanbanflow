import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import boardRoutes from './routes/board.js';
import columnsRoutes from './routes/columns.js';
import cardsRoutes from './routes/cards.js';
import subtasksRoutes from './routes/subtasks.js';
import workspaceRoutes from './routes/workspaces.js';

import { csrfProtection } from './middleware/csrf.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());
app.use(csrfProtection);

// Rotas da API
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/board', boardRoutes);
app.use('/api/columns', columnsRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/subtasks', subtasksRoutes);

// Servir frontend compilado em produção (se a pasta dist existir)
const webDistPath = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Tratamento de erro 404 para rotas de API não encontradas
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado.' });
});

// Middleware global de tratamento de erros
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERRO SERVER]:', err);
  res.status(500).json({ error: 'Erro interno no servidor.' });
});

