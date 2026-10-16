-- Migração 005: Cartões, Estimativas, Relações, Comentários, Anexos e Visões (Etapa 4)
-- CD-02: Comentários e anexos nos cartões
-- CD-08: Campo de estimativa configurável (pontos, horas ou P/M/G)
-- CD-06: Relações entre cartões (bloqueia, relacionado, duplicado)
-- VW-01: Salvar e nomear filtros

ALTER TABLE boards ADD COLUMN estimate_type TEXT NOT NULL DEFAULT 'POINTS';
ALTER TABLE cards ADD COLUMN estimate TEXT;

CREATE TABLE IF NOT EXISTS card_comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_card_comments_card_id ON card_comments(card_id);

CREATE TABLE IF NOT EXISTS card_attachments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  size_bytes INTEGER DEFAULT 0,
  mime_type TEXT DEFAULT 'application/octet-stream',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_card_attachments_card_id ON card_attachments(card_id);

CREATE TABLE IF NOT EXISTS card_relations (
  id TEXT PRIMARY KEY,
  source_card_id TEXT NOT NULL,
  target_card_id TEXT NOT NULL,
  relation_type TEXT NOT NULL, -- 'BLOCKS', 'RELATED', 'DUPLICATE'
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_card_id, target_card_id, relation_type),
  FOREIGN KEY (source_card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (target_card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_card_relations_source ON card_relations(source_card_id);
CREATE INDEX IF NOT EXISTS idx_card_relations_target ON card_relations(target_card_id);

CREATE TABLE IF NOT EXISTS saved_filters (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  search_query TEXT NOT NULL DEFAULT '',
  priority_filter TEXT NOT NULL DEFAULT 'ALL',
  assignee_filter TEXT NOT NULL DEFAULT 'ALL',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_saved_filters_board_user ON saved_filters(board_id, user_id);
