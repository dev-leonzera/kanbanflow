import { Request, Response, NextFunction } from 'express';

// Middleware de proteção contra Cross-Site Request Forgery (CSRF)
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Métodos seguros não necessitam de validação CSRF
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

  // Se não houver origin nem referer (ex: chamadas diretas de ferramentas ou mesmo host sem header),
  // valida sec-fetch-site caso o browser forneça
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite && secFetchSite === 'cross-site') {
    res.status(403).json({ error: 'Acesso rejeitado por proteção CSRF.' });
    return;
  }

  if (origin) {
    try {
      const originUrl = new URL(origin);
      const allowedOriginUrl = new URL(clientOrigin);

      // Em ambiente de desenvolvimento, aceita localhost em qualquer porta (Vite 5173, backend 3001, etc.)
      const isLocalhost =
        originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';

      const isAllowed =
        originUrl.origin === allowedOriginUrl.origin ||
        (process.env.NODE_ENV !== 'production' && isLocalhost);

      if (!isAllowed) {
        res.status(403).json({ error: 'Origem da requisição não autorizada.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Origem de requisição inválida.' });
      return;
    }
  }

  next();
}

