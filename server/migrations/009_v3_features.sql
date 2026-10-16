-- 009_v3_features.sql
-- V3 Features: Tempo, Estimativas x Realizado, Capacidade de Equipe, Retrospectivas, Papéis Customizados, SSO e Hierarquia

-- TM-01 & TM-02: Lançamento de horas e cronômetro ativo
CREATE TABLE IF NOT EXISTS card_time_logs (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_seconds INTEGER NOT NULL,
  notes TEXT DEFAULT '',
  log_date TEXT NOT NULL DEFAULT (date('now')),
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_card_time_logs_card ON card_time_logs(card_id);
CREATE INDEX IF NOT EXISTS idx_card_time_logs_user ON card_time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_card_time_logs_date ON card_time_logs(log_date);

CREATE TABLE IF NOT EXISTS active_card_timers (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_active_timers_card ON active_card_timers(card_id);

-- CP-01: Capacidade configurável por pessoa e período
CREATE TABLE IF NOT EXISTS workspace_member_capacities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekly_capacity_hours REAL NOT NULL DEFAULT 40.0,
  sprint_capacity_points REAL NOT NULL DEFAULT 20.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_member_capacity_ws ON workspace_member_capacities(workspace_id);

-- SP-05: Retrospectiva do Sprint e ciclos leves
CREATE TABLE IF NOT EXISTS sprint_retrospectives (
  id TEXT PRIMARY KEY,
  sprint_id TEXT NOT NULL REFERENCES sprints(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'WENT_WELL', 'TO_IMPROVE', 'ACTION_ITEM'
  content TEXT NOT NULL,
  votes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sprint_retro_sprint ON sprint_retrospectives(sprint_id);

-- PM-07: Papéis customizados no Workspace
CREATE TABLE IF NOT EXISTS workspace_custom_roles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  permissions_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_ws ON workspace_custom_roles(workspace_id);

