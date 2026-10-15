import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
}) {
  const store = new Map<string, RateLimitRecord>();

  // Limpeza periódica de entradas expiradas para evitar vazamento de memória
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of store.entries()) {
      if (now > value.resetAt) {
        store.delete(key);
      }
    }
  }, Math.max(options.windowMs, 60_000));

  function getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
  }

  const limiter = (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req);
    const now = Date.now();
    const record = store.get(ip);

    if (!record || now > record.resetAt) {
      store.set(ip, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return next();
    }

    if (record.count >= options.max) {
      const waitSeconds = Math.ceil((record.resetAt - now) / 1000);
      res.setHeader('Retry-After', waitSeconds.toString());
      res.status(429).json({
        error: options.message || `Muitas tentativas. Tente novamente em ${waitSeconds} segundos.`,
      });
      return;
    }

    record.count += 1;
    next();
  };

  limiter.resetKey = (req: Request) => {
    const ip = getClientIp(req);
    store.delete(ip);
  };

  return limiter;
}

// Limiter para tentativas de login: máximo de 5 tentativas a cada 1 minuto por IP
export const loginRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Limite de tentativas de login excedido. Aguarde 1 minuto para tentar novamente.',
});

// Limiter para cadastro: máximo de 5 cadastros a cada 10 minutos por IP
export const registerRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'Limite de tentativas de cadastro excedido. Aguarde alguns minutos.',
});

