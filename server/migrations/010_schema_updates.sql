-- 010_schema_updates.sql
-- Soft Delete, Visibilidade por Papel, Campos de SSO e Timer Automático

-- Soft delete em colunas
ALTER TABLE columns ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE columns ADD COLUMN archived_at TEXT;

-- Soft delete, visibilidade restrita por papel em cartões
ALTER TABLE cards ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN archived_at TEXT;
ALTER TABLE cards ADD COLUMN visibility TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE cards ADD COLUMN restricted_to_role TEXT DEFAULT NULL;

-- Configuração de timer automático de notificações (TM-04)
ALTER TABLE user_notification_settings ADD COLUMN auto_timer_enabled INTEGER NOT NULL DEFAULT 0;

-- Campos de SSO em Workspaces (WS-08)
ALTER TABLE workspaces ADD COLUMN sso_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN sso_provider TEXT DEFAULT NULL;
ALTER TABLE workspaces ADD COLUMN sso_domain TEXT DEFAULT NULL;

-- Soft delete em quadros
ALTER TABLE boards ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE boards ADD COLUMN archived_at TEXT;
