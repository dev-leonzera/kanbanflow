-- Migração 006: Notificações, Preferências por Canal/Evento e Nível de Inscrição (Etapa 5)
-- NT-01: Preferências de notificação por tipo de evento e por canal
-- NT-02: Nível de inscrição por cartão ou quadro (ALL, MENTIONS, NONE)

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  event_type TEXT NOT NULL, -- 'COMMENT_ADDED', 'MENTIONED', 'CARD_MOVED', 'CARD_ASSIGNED', 'ATTACHMENT_ADDED'
  board_id TEXT,
  card_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- 'COMMENT_ADDED', 'MENTIONED', 'CARD_MOVED', 'CARD_ASSIGNED', 'ATTACHMENT_ADDED'
  channel_in_app INTEGER NOT NULL DEFAULT 1,
  channel_email INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, event_type),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'BOARD' | 'CARD'
  target_id TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'ALL', -- 'ALL' | 'MENTIONS' | 'NONE'
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, target_type, target_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_target ON subscriptions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
