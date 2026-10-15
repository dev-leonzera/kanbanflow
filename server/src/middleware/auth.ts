import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db.js';
import { User, AuthTokenPayload } from '../types.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'kanbanflow-secret-key-development-mode-2026';

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    let token = req.cookies?.token;

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      res.status(401).json({ error: 'Não autorizado. Faça login para continuar.' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    const user = queryOne<{ id: string; email: string; name: string }>(
      'SELECT id, email, name FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      res.status(401).json({ error: 'Usuário não encontrado ou sessão expirada.' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
}

