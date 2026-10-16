-- 008_v2_features.sql
-- Relatórios, Limite WIP, Swimlanes, Arquivamento automático, Equipes, Compartilhamento público, Configurações de notificação

-- BD-06: Limite de WIP na coluna
ALTER TABLE columns ADD COLUMN wip_limit INTEGER DEFAULT NULL;

-- BD-08: Arquivamento automático de concluídos após N dias
ALTER TABLE boards ADD COLUMN auto_archive_days INTEGER DEFAULT NULL;

-- PM-03: Link público somente leitura com expiração
ALTER TABLE boards ADD COLUMN public_share_token TEXT DEFAULT NULL;
ALTER TABLE boards ADD COLUMN public_share_expires_at TEXT DEFAULT NULL;

-- PM-01: Equipes/Grupos no Workspace
CREATE TABLE IF NOT EXISTS workspace_teams (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_teams_ws ON workspace_teams(workspace_id);

CREATE TABLE IF NOT EXISTS workspace_team_members (
  team_id TEXT NOT NULL REFERENCES workspace_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user ON workspace_team_members(user_id);

CREATE TABLE IF NOT EXISTS board_team_permissions (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES workspace_teams(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'EDITOR', -- 'OWNER', 'EDITOR', 'COMMENTER', 'VIEWER'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (board_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_board_teams_board ON board_team_permissions(board_id);

-- NT-05 & NT-03: Configurações de notificação (DND, horário de silêncio, digest)
CREATE TABLE IF NOT EXISTS user_notification_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dnd_enabled INTEGER NOT NULL DEFAULT 0,
  quiet_hours_enabled INTEGER NOT NULL DEFAULT 0,
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '08:00',
  digest_frequency TEXT NOT NULL DEFAULT 'NONE', -- 'NONE', 'DAILY', 'WEEKLY'
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

