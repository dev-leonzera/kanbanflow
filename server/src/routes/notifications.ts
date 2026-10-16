import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryAll, queryOne, run } from '../db.js';
import {
  NotificationEventType,
  NotificationItem,
  NotificationPreference,
  NotificationSettings,
  Subscription,
  SubscriptionLevel,
} from '../types.js';
import { can } from '../permissions/can.js';

const router = Router();
router.use(requireAuth);

export const NOTIFICATION_EVENT_TYPES: NotificationEventType[] = [
  'COMMENT_ADDED',
  'MENTIONED',
  'CARD_MOVED',
  'CARD_ASSIGNED',
  'ATTACHMENT_ADDED',
];

const preferenceUpdateSchema = z.object({
  preferences: z.array(
    z.object({
      event_type: z.enum(['COMMENT_ADDED', 'MENTIONED', 'CARD_MOVED', 'CARD_ASSIGNED', 'ATTACHMENT_ADDED']),
      channel_in_app: z.boolean(),
      channel_email: z.boolean(),
    })
  ),
});

const subscriptionUpdateSchema = z.object({
  targetType: z.enum(['BOARD', 'CARD']),
  targetId: z.string().min(1),
  level: z.enum(['ALL', 'MENTIONS', 'NONE']),
});

// Garante que o usuário possua preferências inicializadas para todos os tipos de evento (NT-01)
export function getUserPreferences(userId: string): NotificationPreference[] {
  const existing = queryAll<{
    user_id: string;
    event_type: NotificationEventType;
    channel_in_app: number;
    channel_email: number;
  }>('SELECT user_id, event_type, channel_in_app, channel_email FROM notification_preferences WHERE user_id = ?', [
    userId,
  ]);

  const existingMap = new Map(existing.map(p => [p.event_type, p]));
  const result: NotificationPreference[] = [];

  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    const found = existingMap.get(eventType);
    if (found) {
      result.push({
        user_id: userId,
        event_type: eventType,
        channel_in_app: Boolean(found.channel_in_app),
        channel_email: Boolean(found.channel_email),
      });
    } else {
      run(
        'INSERT OR IGNORE INTO notification_preferences (user_id, event_type, channel_in_app, channel_email) VALUES (?, ?, 1, 1)',
        [userId, eventType]
      );
      result.push({
        user_id: userId,
        event_type: eventType,
        channel_in_app: true,
        channel_email: true,
      });
    }
  }

  return result;
}

// Obtém o nível efetivo de inscrição de um usuário para um cartão ou quadro (NT-02)
export function getEffectiveSubscriptionLevel(
  userId: string,
  boardId: string,
  cardId?: string | null,
  isAssigneeOrCreator = false
): SubscriptionLevel {
  if (cardId) {
    const cardSub = queryOne<{ level: SubscriptionLevel }>(
      "SELECT level FROM subscriptions WHERE user_id = ? AND target_type = 'CARD' AND target_id = ?",
      [userId, cardId]
    );
    if (cardSub) return cardSub.level;
  }

  const boardSub = queryOne<{ level: SubscriptionLevel }>(
    "SELECT level FROM subscriptions WHERE user_id = ? AND target_type = 'BOARD' AND target_id = ?",
    [userId, boardId]
  );
  if (boardSub) return boardSub.level;

  // Se o usuário é responsável pelo cartão, por padrão acompanha todas ('ALL'), senão 'MENTIONS'
  return isAssigneeOrCreator ? 'ALL' : 'MENTIONS';
}

// Dispara notificações respeitando nível de inscrição (NT-02) e preferências de canal/evento (NT-01)
export function dispatchCardEventNotifications(params: {
  actorId: string;
  actorName: string;
  eventType: NotificationEventType;
  boardId: string;
  cardId: string;
  cardTitle: string;
  cardAssignee?: string | null;
  title: string;
  message: string;
  contentForMentions?: string;
}) {
  const {
    actorId,
    actorName,
    eventType,
    boardId,
    cardId,
    cardAssignee,
    title,
    message,
    contentForMentions,
  } = params;

  // Busca todos os usuários que pertencem ao workspace deste quadro ou são membros explícitos do quadro
  const board = queryOne<{ workspace_id: string }>('SELECT workspace_id FROM boards WHERE id = ?', [boardId]);
  if (!board) return;

  const candidates = queryAll<{ id: string; name: string; email: string }>(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM users u
     LEFT JOIN workspace_members wm ON wm.user_id = u.id AND wm.workspace_id = ?
     LEFT JOIN board_members bm ON bm.user_id = u.id AND bm.board_id = ?
     WHERE wm.user_id IS NOT NULL OR bm.user_id IS NOT NULL`,
    [board.workspace_id, boardId]
  );

  const textLower = (contentForMentions || message || '').toLowerCase();

  for (const user of candidates) {
    // Verifica se o usuário tem acesso de visualização ao quadro
    if (!can(user.id, 'board:view', { type: 'board', id: boardId })) continue;

    const firstNameLower = user.name.split(/\s+/)[0].toLowerCase();
    const isMentioned =
      textLower.includes(`@${firstNameLower}`) ||
      textLower.includes(`@${user.name.toLowerCase()}`) ||
      textLower.includes(user.email.toLowerCase());

    const isAssigned =
      Boolean(cardAssignee && cardAssignee.toLowerCase().includes(user.name.toLowerCase()));

    const subLevel = getEffectiveSubscriptionLevel(user.id, boardId, cardId, isAssigned);

    // NT-02: Filtra pelo nível de inscrição no cartão ou quadro (ALL, MENTIONS, NONE)
    if (subLevel === 'NONE') continue;

    const effectiveEvent: NotificationEventType = isMentioned ? 'MENTIONED' : eventType;

    if (subLevel === 'MENTIONS' && !isMentioned && effectiveEvent !== 'CARD_ASSIGNED') {
      continue;
    }

    // Se o próprio autor executou a ação e não se inscreveu explicitamente como ALL no cartão, evita ruído
    if (user.id === actorId) {
      const explicitCardSub = queryOne<{ level: SubscriptionLevel }>(
        "SELECT level FROM subscriptions WHERE user_id = ? AND target_type = 'CARD' AND target_id = ? AND level = 'ALL'",
        [user.id, cardId]
      );
      if (!explicitCardSub && !isMentioned) continue;
    }

    // NT-05: Horário de silêncio e modo Não Perturbe
    const settings = getUserNotificationSettings(user.id);
    if (settings.dnd_enabled) {
      continue;
    }
    if (settings.quiet_hours_enabled) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = (settings.quiet_hours_start || '22:00').split(':').map(Number);
      const [endH, endM] = (settings.quiet_hours_end || '08:00').split(':').map(Number);
      const startMinutes = (startH || 0) * 60 + (startM || 0);
      const endMinutes = (endH || 0) * 60 + (endM || 0);

      const inQuiet = startMinutes <= endMinutes
        ? (currentMinutes >= startMinutes && currentMinutes <= endMinutes)
        : (currentMinutes >= startMinutes || currentMinutes <= endMinutes);

      if (inQuiet) {
        continue;
      }
    }

    // NT-01: Verifica preferências de canal e tipo de evento do destinatário
    const prefs = getUserPreferences(user.id);
    const pref = prefs.find(p => p.event_type === effectiveEvent);

    if (pref && pref.channel_in_app) {
      const notifId = crypto.randomUUID();
      run(
        `INSERT INTO notifications (id, user_id, actor_id, actor_name, event_type, board_id, card_id, title, message, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
        [notifId, user.id, actorId, actorName, effectiveEvent, boardId, cardId, title, message]
      );
    }
  }
}

// NT-05 & TM-04: Obtém configurações de Não Perturbe, Horário de Silêncio, Digest e Timer Automático
export function getUserNotificationSettings(userId: string): NotificationSettings {
  const row = queryOne<any>(
    'SELECT user_id, dnd_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, digest_frequency, auto_timer_enabled FROM user_notification_settings WHERE user_id = ?',
    [userId]
  );
  if (row) {
    return {
      user_id: row.user_id,
      dnd_enabled: Boolean(row.dnd_enabled),
      quiet_hours_enabled: Boolean(row.quiet_hours_enabled),
      quiet_hours_start: row.quiet_hours_start || '22:00',
      quiet_hours_end: row.quiet_hours_end || '08:00',
      digest_frequency: row.digest_frequency || 'NONE',
      auto_timer_enabled: Boolean(row.auto_timer_enabled),
    };
  }

  run(
    "INSERT OR IGNORE INTO user_notification_settings (user_id, dnd_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, digest_frequency, auto_timer_enabled) VALUES (?, 0, 0, '22:00', '08:00', 'NONE', 0)",
    [userId]
  );
  return {
    user_id: userId,
    dnd_enabled: false,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
    digest_frequency: 'NONE',
    auto_timer_enabled: false,
  };
}

// GET /api/notifications - Lista notificações do usuário logado com filtros e agrupamento (NT-04)
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const filter = typeof req.query.filter === 'string' ? req.query.filter : 'ALL';
  const boardId = typeof req.query.boardId === 'string' ? req.query.boardId : undefined;

  let sql = `
    SELECT id, user_id, actor_id, actor_name, event_type, board_id, card_id, title, message, is_read, created_at
    FROM notifications
    WHERE user_id = ?
  `;
  const params: any[] = [userId];

  if (filter === 'UNREAD') {
    sql += ' AND is_read = 0';
  } else if (filter === 'MENTIONS') {
    sql += " AND event_type = 'MENTIONED'";
  }

  if (boardId) {
    sql += ' AND board_id = ?';
    params.push(boardId);
  }

  sql += ' ORDER BY created_at DESC LIMIT 100';

  const rows = queryAll<any>(sql, params);

  const items: NotificationItem[] = rows.map(r => ({
    ...r,
    is_read: Boolean(r.is_read),
  }));

  res.json(items);
});

// PATCH /api/notifications/:id/read - Marca notificação como lida
router.patch('/:id/read', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
  res.json({ success: true });
});

// POST /api/notifications/read-all - Marca todas as notificações como lidas
router.post('/read-all', (req: Request, res: Response) => {
  const userId = req.user!.id;
  run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
  res.json({ success: true });
});

// GET /api/notifications/preferences - Obtém preferências de notificação por evento e canal (NT-01)
router.get('/preferences', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const prefs = getUserPreferences(userId);
  res.json(prefs);
});

// PUT /api/notifications/preferences - Salva preferências de notificação por tipo de evento e por canal (NT-01)
router.put('/preferences', (req: Request, res: Response) => {
  const result = preferenceUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  for (const item of result.data.preferences) {
    run(
      `INSERT INTO notification_preferences (user_id, event_type, channel_in_app, channel_email)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, event_type) DO UPDATE SET
         channel_in_app = excluded.channel_in_app,
         channel_email = excluded.channel_email`,
      [userId, item.event_type, item.channel_in_app ? 1 : 0, item.channel_email ? 1 : 0]
    );
  }

  res.json(getUserPreferences(userId));
});

// GET /api/notifications/subscription - Obtém nível de inscrição em um cartão ou quadro (NT-02)
router.get('/subscription', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const targetType = req.query.targetType === 'CARD' ? 'CARD' : 'BOARD';
  const targetId = typeof req.query.targetId === 'string' ? req.query.targetId : '';

  if (!targetId) {
    res.status(400).json({ error: 'Informe targetId.' });
    return;
  }

  const sub = queryOne<{ id: string; level: SubscriptionLevel; updated_at: string }>(
    'SELECT id, level, updated_at FROM subscriptions WHERE user_id = ? AND target_type = ? AND target_id = ?',
    [userId, targetType, targetId]
  );

  const response: Subscription = {
    id: sub?.id,
    user_id: userId,
    target_type: targetType,
    target_id: targetId,
    level: sub?.level || 'MENTIONS',
    updated_at: sub?.updated_at,
  };

  res.json(response);
});

// PUT /api/notifications/subscription - Define nível de inscrição por cartão ou quadro (todas, só menções, nenhuma - NT-02)
router.put('/subscription', (req: Request, res: Response) => {
  const result = subscriptionUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { targetType, targetId, level } = result.data;
  const id = crypto.randomUUID();

  run(
    `INSERT INTO subscriptions (id, user_id, target_type, target_id, level, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET
       level = excluded.level,
       updated_at = datetime('now')`,
    [id, userId, targetType, targetId, level]
  );

  res.json({
    user_id: userId,
    target_type: targetType,
    target_id: targetId,
    level,
  });
});

// GET /api/notifications/settings (NT-05: Configurações de DND e Horário de Silêncio)
router.get('/settings', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const settings = getUserNotificationSettings(userId);
  res.json(settings);
});

// PUT /api/notifications/settings (NT-05 & TM-04: Atualiza DND, Horário de Silêncio e Timer Automático)
router.put('/settings', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { dnd_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, digest_frequency, auto_timer_enabled } = req.body;

  const current = getUserNotificationSettings(userId);

  const newDnd = dnd_enabled !== undefined ? (dnd_enabled ? 1 : 0) : (current.dnd_enabled ? 1 : 0);
  const newQuiet = quiet_hours_enabled !== undefined ? (quiet_hours_enabled ? 1 : 0) : (current.quiet_hours_enabled ? 1 : 0);
  const newStart = quiet_hours_start || current.quiet_hours_start;
  const newEnd = quiet_hours_end || current.quiet_hours_end;
  const newDigest = digest_frequency || current.digest_frequency;
  const newAutoTimer = auto_timer_enabled !== undefined ? (auto_timer_enabled ? 1 : 0) : (current.auto_timer_enabled ? 1 : 0);

  run(`
    INSERT INTO user_notification_settings (user_id, dnd_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, digest_frequency, auto_timer_enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      dnd_enabled = excluded.dnd_enabled,
      quiet_hours_enabled = excluded.quiet_hours_enabled,
      quiet_hours_start = excluded.quiet_hours_start,
      quiet_hours_end = excluded.quiet_hours_end,
      digest_frequency = excluded.digest_frequency,
      auto_timer_enabled = excluded.auto_timer_enabled,
      updated_at = datetime('now')
  `, [userId, newDnd, newQuiet, newStart, newEnd, newDigest, newAutoTimer]);

  res.json(getUserNotificationSettings(userId));
});

// GET /api/notifications/digest (NT-03: Digest de atividades diário ou semanal)
router.get('/digest', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const period = req.query.period === 'weekly' ? 'weekly' : 'daily';
  const hours = period === 'weekly' ? 24 * 7 : 24;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Busca notificações e eventos recentes direcionados ao usuário
  const notifs = queryAll<NotificationItem>(`
    SELECT id, user_id, actor_id, actor_name, event_type, board_id, card_id, title, message, is_read, created_at
    FROM notifications
    WHERE user_id = ? AND created_at >= ?
    ORDER BY created_at DESC
  `, [userId, cutoff]);

  const commentsCount = notifs.filter(n => n.event_type === 'COMMENT_ADDED').length;
  const mentionsCount = notifs.filter(n => n.event_type === 'MENTIONED').length;
  const movesCount = notifs.filter(n => n.event_type === 'CARD_MOVED').length;
  const assignmentsCount = notifs.filter(n => n.event_type === 'CARD_ASSIGNED').length;
  const unblockedCount = notifs.filter(n => n.event_type === 'CARD_UNBLOCKED').length;

  res.json({
    period,
    hours,
    summary: {
      totalNotifications: notifs.length,
      commentsCount,
      mentionsCount,
      movesCount,
      assignmentsCount,
      unblockedCount,
    },
    highlights: notifs.slice(0, 10),
  });
});

export default router;
