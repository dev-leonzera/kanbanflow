-- Migração 003: Hierarquia de Trabalho e Tipos de Cartão (Etapa 2)
-- CD-03: Subtarefa como cartão completo (parent_id)
-- CD-04: Tipos de cartão (EPIC, STORY, TASK, BUG, SUBTASK)
-- CD-05: Progresso agregado no pai

ALTER TABLE cards ADD COLUMN parent_id TEXT REFERENCES cards(id) ON DELETE CASCADE;
ALTER TABLE cards ADD COLUMN type TEXT NOT NULL DEFAULT 'TASK';

CREATE INDEX IF NOT EXISTS idx_cards_parent_id ON cards(parent_id);
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);

