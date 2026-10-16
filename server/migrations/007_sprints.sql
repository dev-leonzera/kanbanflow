-- 007_sprints.sql
-- Sprints (SP-01, SP-02, SP-03, SP-04)

CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT DEFAULT '',
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNING', -- 'PLANNING', 'ACTIVE', 'COMPLETED'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sprints_board ON sprints(board_id);
CREATE INDEX IF NOT EXISTS idx_sprints_status ON sprints(board_id, status);

-- Itens e histórico do Sprint (para relatório de planejado vs entregue SP-04)
CREATE TABLE IF NOT EXISTS sprint_items (
  sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  planned INTEGER NOT NULL DEFAULT 1, -- 1 se estava no sprint ao iniciar, 0 se adicionado depois
  initial_estimate TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  PRIMARY KEY (sprint_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_sprint_items_sprint ON sprint_items(sprint_id);
CREATE INDEX IF NOT EXISTS idx_sprint_items_card ON sprint_items(card_id);

-- Campo sprint_id nos cartões
ALTER TABLE cards ADD COLUMN sprint_id TEXT REFERENCES sprints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cards_sprint ON cards(sprint_id);

