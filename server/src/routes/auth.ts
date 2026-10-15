import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { queryOne, run, createDefaultBoardForUser } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { loginRateLimiter, registerRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres.'),
  email: z.string().email('E-mail inválido.'),
  password: z
    .string()
    .min(8, 'A senha deve ter pelo menos 8 caracteres.')
    .regex(/[A-Za-z]/, 'A senha deve conter pelo menos uma letra.')
    .regex(/[0-9]/, 'A senha deve conter pelo menos um número.'),
});

const loginSchema = z.object({
  email: z.string().email('E-mail inválido.'),
  password: z.string().min(1, 'A senha é obrigatória.'),
});

function setAuthCookie(res: Response, token: string) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    path: '/',
  });
}

// POST /api/auth/register
router.post('/register', registerRateLimiter, (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const { name, email, password } = result.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = queryOne('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) {
    res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
    return;
  }

  const userId = crypto.randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);

  run('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)', [
    userId,
    normalizedEmail,
    passwordHash,
    name.trim(),
  ]);

  // Cria quadro inicial com cartões de exemplo para o novo usuário
  createDefaultBoardForUser(userId);

  const token = signToken({ userId, email: normalizedEmail });
  setAuthCookie(res, token);

  res.status(201).json({
    user: { id: userId, email: normalizedEmail, name: name.trim() },
    token,
  });
});

// POST /api/auth/login
router.post('/login', loginRateLimiter, (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const { email, password } = result.data;
  const normalizedEmail = email.toLowerCase().trim();

  const user = queryOne<{ id: string; email: string; name: string; password_hash: string }>(
    'SELECT id, email, name, password_hash FROM users WHERE email = ?',
    [normalizedEmail]
  );

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    return;
  }

  // Sucesso no login reseta contador de tentativas
  loginRateLimiter.resetKey(req);

  const token = signToken({ userId: user.id, email: user.email });
  setAuthCookie(res, token);

  res.json({
    user: { id: user.id, email: user.email, name: user.name },
    token,
  });
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Sessão encerrada com sucesso.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

export default router;

