import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretório para armazenamento do banco de dados SQLite
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'kanbanflow.db');
export const db = new DatabaseSync(dbPath);

// Configurações recomendadas para SQLite
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// Executa migrações e garantia de integridade na inicialização
export function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = path.resolve(__dirname, '../migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      const executed = queryOne<{ name: string }>('SELECT name FROM _migrations WHERE name = ?', [file]);
      if (!executed) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        for (const statement of statements) {
          try {
            db.exec(statement + ';');
          } catch (e: any) {
            if (
              !e.message?.includes('duplicate column name') &&
              !e.message?.includes('already exists')
            ) {
              throw e;
            }
          }
        }
        run('INSERT INTO _migrations (name) VALUES (?)', [file]);
      }
    }
  }

  // TD-01 & TD-02: Migração pós-SQL para esquemas e dados existentes
  migrateSchemaAndExistingData();
}

// Migração segura para dados existentes (Workspaces, Soft Delete e Esquema de Quadros)
function migrateSchemaAndExistingData() {
  // 1. Garante colunas de soft delete na tabela columns (TD-02)
  const colInfo = queryAll<{ name: string }>('PRAGMA table_info(columns)');
  if (colInfo.length > 0) {
    if (!colInfo.some(c => c.name === 'is_archived')) {
      db.exec('ALTER TABLE columns ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;');
    }
    if (!colInfo.some(c => c.name === 'archived_at')) {
      db.exec('ALTER TABLE columns ADD COLUMN archived_at TEXT;');
    }
    if (!colInfo.some(c => c.name === 'wip_limit')) {
      db.exec('ALTER TABLE columns ADD COLUMN wip_limit INTEGER DEFAULT NULL;');
    }
  }

  // 2. Garante colunas de soft delete e assignee na tabela cards (TD-02)
  const cardInfo = queryAll<{ name: string }>('PRAGMA table_info(cards)');
  if (cardInfo.length > 0) {
    if (!cardInfo.some(c => c.name === 'assignee')) {
      db.exec('ALTER TABLE cards ADD COLUMN assignee TEXT;');
    }
    if (!cardInfo.some(c => c.name === 'is_archived')) {
      db.exec('ALTER TABLE cards ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;');
    }
    if (!cardInfo.some(c => c.name === 'archived_at')) {
      db.exec('ALTER TABLE cards ADD COLUMN archived_at TEXT;');
    }
    if (!cardInfo.some(c => c.name === 'parent_id')) {
      db.exec('ALTER TABLE cards ADD COLUMN parent_id TEXT REFERENCES cards(id) ON DELETE CASCADE;');
    }
    if (!cardInfo.some(c => c.name === 'type')) {
      db.exec("ALTER TABLE cards ADD COLUMN type TEXT NOT NULL DEFAULT 'TASK';");
    }
    if (!cardInfo.some(c => c.name === 'estimate')) {
      db.exec('ALTER TABLE cards ADD COLUMN estimate TEXT;');
    }
    if (!cardInfo.some(c => c.name === 'visibility')) {
      db.exec("ALTER TABLE cards ADD COLUMN visibility TEXT NOT NULL DEFAULT 'NORMAL';");
    }
    if (!cardInfo.some(c => c.name === 'restricted_to_role')) {
      db.exec('ALTER TABLE cards ADD COLUMN restricted_to_role TEXT DEFAULT NULL;');
    }
  }

  // Garante colunas de configurações de notificação e timer automático (TM-04)
  const notifSettingsCols = queryAll<{ name: string }>('PRAGMA table_info(user_notification_settings)');
  if (notifSettingsCols.length > 0) {
    if (!notifSettingsCols.some(c => c.name === 'auto_timer_enabled')) {
      db.exec('ALTER TABLE user_notification_settings ADD COLUMN auto_timer_enabled INTEGER NOT NULL DEFAULT 0;');
    }
  }

  // Garante colunas de SSO na tabela workspaces (WS-08)
  const wsCols = queryAll<{ name: string }>('PRAGMA table_info(workspaces)');
  if (wsCols.length > 0) {
    if (!wsCols.some(c => c.name === 'sso_enabled')) {
      db.exec('ALTER TABLE workspaces ADD COLUMN sso_enabled INTEGER NOT NULL DEFAULT 0;');
    }
    if (!wsCols.some(c => c.name === 'sso_provider')) {
      db.exec('ALTER TABLE workspaces ADD COLUMN sso_provider TEXT DEFAULT NULL;');
    }
    if (!wsCols.some(c => c.name === 'sso_domain')) {
      db.exec('ALTER TABLE workspaces ADD COLUMN sso_domain TEXT DEFAULT NULL;');
    }
  }

  // 3. Garante que cada usuário existente possua um Workspace e pertença a ele como OWNER (TD-01)
  const usersWithoutWorkspace = queryAll<{ id: string; name: string }>(`
    SELECT u.id, u.name 
    FROM users u 
    WHERE NOT EXISTS (
      SELECT 1 FROM workspace_members wm WHERE wm.user_id = u.id
    )
  `);

  for (const u of usersWithoutWorkspace) {
    const wsId = crypto.randomUUID();
    const wsName = `Workspace de ${u.name || 'Projetos'}`;
    run('INSERT INTO workspaces (id, name) VALUES (?, ?)', [wsId, wsName]);
    run('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)', [wsId, u.id, 'OWNER']);
  }

  // 4. Migração da tabela boards para incluir workspace_id e remover unicidade de user_id (TD-01)
  const boardCols = queryAll<{ name: string }>('PRAGMA table_info(boards)');
  const hasWorkspaceId = boardCols.some(c => c.name === 'workspace_id');

  if (boardCols.length > 0 && !hasWorkspaceId) {
    db.exec('PRAGMA foreign_keys = OFF;');
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS boards_new (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          user_id TEXT,
          title TEXT NOT NULL,
          visibility TEXT NOT NULL DEFAULT 'WORKSPACE',
          estimate_type TEXT NOT NULL DEFAULT 'POINTS',
          is_archived INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );
      `);

      // Copia dados antigos associando cada quadro ao workspace do respectivo usuário
      const existingBoards = queryAll<{ id: string; user_id: string; title: string; created_at: string }>('SELECT * FROM boards');
      for (const b of existingBoards) {
        // Encontra o workspace do usuário
        let member = queryOne<{ workspace_id: string }>(
          'SELECT workspace_id FROM workspace_members WHERE user_id = ? ORDER BY created_at ASC LIMIT 1',
          [b.user_id]
        );

        let wsId = member?.workspace_id;
        if (!wsId) {
          wsId = crypto.randomUUID();
          run('INSERT INTO workspaces (id, name) VALUES (?, ?)', [wsId, 'Meu Workspace']);
          run('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)', [wsId, b.user_id, 'OWNER']);
        }

        run(
          "INSERT INTO boards_new (id, workspace_id, user_id, title, visibility, estimate_type, is_archived, archived_at, created_at) VALUES (?, ?, ?, ?, 'WORKSPACE', 'POINTS', 0, NULL, ?)",
          [b.id, wsId, b.user_id, b.title, b.created_at || new Date().toISOString()]
        );
      }

      db.exec('DROP TABLE boards;');
      db.exec('ALTER TABLE boards_new RENAME TO boards;');
      db.exec('CREATE INDEX IF NOT EXISTS idx_boards_workspace_id ON boards(workspace_id);');
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }

  if (boardCols.length > 0) {
    // Garante colunas adicionais (inclusive após a reconstrução da tabela acima)
    const boardCols = queryAll<{ name: string }>('PRAGMA table_info(boards)');
    if (!boardCols.some(c => c.name === 'is_archived')) {
      db.exec('ALTER TABLE boards ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;');
    }
    if (!boardCols.some(c => c.name === 'archived_at')) {
      db.exec('ALTER TABLE boards ADD COLUMN archived_at TEXT;');
    }
    if (!boardCols.some(c => c.name === 'visibility')) {
      db.exec("ALTER TABLE boards ADD COLUMN visibility TEXT NOT NULL DEFAULT 'WORKSPACE';");
    }
    if (!boardCols.some(c => c.name === 'estimate_type')) {
      db.exec("ALTER TABLE boards ADD COLUMN estimate_type TEXT NOT NULL DEFAULT 'POINTS';");
    }
    if (!boardCols.some(c => c.name === 'auto_archive_days')) {
      db.exec('ALTER TABLE boards ADD COLUMN auto_archive_days INTEGER DEFAULT NULL;');
    }
    if (!boardCols.some(c => c.name === 'public_share_token')) {
      db.exec('ALTER TABLE boards ADD COLUMN public_share_token TEXT DEFAULT NULL;');
    }
    if (!boardCols.some(c => c.name === 'public_share_expires_at')) {
      db.exec('ALTER TABLE boards ADD COLUMN public_share_expires_at TEXT DEFAULT NULL;');
    }
  }

  // 5. Garante que todo quadro possua pelo menos um OWNER em board_members (BD-02)
  const boardsWithoutMembers = queryAll<{ id: string; user_id: string | null; workspace_id: string }>(`
    SELECT b.id, b.user_id, b.workspace_id
    FROM boards b
    WHERE NOT EXISTS (
      SELECT 1 FROM board_members bm WHERE bm.board_id = b.id
    )
  `);

  for (const b of boardsWithoutMembers) {
    let ownerId = b.user_id;
    if (!ownerId) {
      const wsOwner = queryOne<{ user_id: string }>(
        "SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'OWNER' LIMIT 1",
        [b.workspace_id]
      );
      ownerId = wsOwner?.user_id || null;
    }
    if (ownerId) {
      run('INSERT OR IGNORE INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)', [b.id, ownerId, 'OWNER']);
    }
  }
}

// Helpers para consultas simplificadas
export function queryAll<T = Record<string, any>>(sql: string, params: any[] = []): T[] {
  const sanitized = params.map(p => (p === undefined ? null : p));
  const stmt = db.prepare(sql);
  return stmt.all(...sanitized) as T[];
}

export function queryOne<T = Record<string, any>>(sql: string, params: any[] = []): T | undefined {
  const sanitized = params.map(p => (p === undefined ? null : p));
  const stmt = db.prepare(sql);
  return stmt.get(...sanitized) as T | undefined;
}

export function run(sql: string, params: any[] = []): { changes: number | bigint; lastInsertRowid: number | bigint } {
  const sanitized = params.map(p => (p === undefined ? null : p));
  const stmt = db.prepare(sql);
  return stmt.run(...sanitized);
}

// EV-02: Registro de auditoria básico (quem mudou o quê)
export function logAudit(params: {
  workspaceId?: string | null;
  boardId?: string | null;
  userId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: string | Record<string, any> | null;
}) {
  const auditId = crypto.randomUUID();
  const detailsStr =
    params.details && typeof params.details === 'object'
      ? JSON.stringify(params.details)
      : (params.details as string | null) || null;

  run(
    `INSERT INTO audit_logs (id, workspace_id, board_id, user_id, action, target_type, target_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      auditId,
      params.workspaceId || null,
      params.boardId || null,
      params.userId,
      params.action,
      params.targetType,
      params.targetId || null,
      detailsStr,
    ]
  );
  return auditId;
}

// EV-01: Registro central de eventos em cartões
export function logCardEvent(params: {
  cardId: string;
  userId: string;
  eventType: string;
  fromColumnId?: string | null;
  toColumnId?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
}) {
  const eventId = crypto.randomUUID();
  run(
    `INSERT INTO card_events (id, card_id, user_id, event_type, from_column_id, to_column_id, from_value, to_value, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      eventId,
      params.cardId,
      params.userId,
      params.eventType,
      params.fromColumnId || null,
      params.toColumnId || null,
      params.fromValue || null,
      params.toValue || null,
    ]
  );
  return eventId;
}

// Retorna ou cria o workspace padrão do usuário
export function getUserPrimaryWorkspace(userId: string): { id: string; name: string } {
  let ws = queryOne<{ id: string; name: string }>(
    `SELECT w.id, w.name 
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = ?
     ORDER BY wm.created_at ASC
     LIMIT 1`,
    [userId]
  );

  if (!ws) {
    const user = queryOne<{ name: string; email?: string }>('SELECT name, email FROM users WHERE id = ?', [userId]);
    const wsId = crypto.randomUUID();
    const wsName = `Workspace de ${user?.name || 'Projetos'}`;
    run('INSERT INTO workspaces (id, name, billing_email) VALUES (?, ?, ?)', [wsId, wsName, user?.email || null]);
    run('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)', [wsId, userId, 'OWNER']);
    ws = { id: wsId, name: wsName };
  }

  return ws;
}

// Inicializa dados de demonstração para um novo usuário / workspace
export function createDefaultBoardForUser(userId: string, targetWorkspaceId?: string): string {
  const workspace = targetWorkspaceId
    ? { id: targetWorkspaceId, name: '' }
    : getUserPrimaryWorkspace(userId);

  const boardId = crypto.randomUUID();
  run(
    "INSERT INTO boards (id, workspace_id, user_id, title, visibility) VALUES (?, ?, ?, ?, 'WORKSPACE')",
    [boardId, workspace.id, userId, 'Meu Quadro']
  );
  run(
    "INSERT OR IGNORE INTO board_members (board_id, user_id, role) VALUES (?, ?, 'OWNER')",
    [boardId, userId]
  );

  const colTodoId = crypto.randomUUID();
  const colDoingId = crypto.randomUUID();
  const colDoneId = crypto.randomUUID();

  run('INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)', [colTodoId, boardId, 'A Fazer', 0]);
  run('INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)', [colDoingId, boardId, 'Em Andamento', 1]);
  run('INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)', [colDoneId, boardId, 'Concluído', 2]);

  // Função auxiliar para datas relativas
  const getOffsetDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const user = queryOne<{ name: string }>('SELECT name FROM users WHERE id = ?', [userId]);
  const currentUserName = user?.name || 'Leonardo Hora';

  // Card 1
  const card1Id = crypto.randomUUID();
  run(
    'INSERT INTO cards (id, column_id, title, description, priority, tag, due_date, position, assignee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [card1Id, colTodoId, 'Implementar autenticação JWT', 'Configurar cookies HttpOnly e hash com bcrypt.', 'HIGH', 'Backend', getOffsetDate(2), 0, currentUserName]
  );
  run('INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), card1Id, 'Criar rotas de registro e login', 1, 0]);
  run('INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), card1Id, 'Configurar middleware requireAuth', 1, 1]);
  run('INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), card1Id, 'Integrar com o frontend React', 0, 2]);
  logCardEvent({ cardId: card1Id, userId, eventType: 'CARD_CREATED' });

  // Card 2
  const card2Id = crypto.randomUUID();
  run(
    'INSERT INTO cards (id, column_id, title, description, priority, tag, due_date, position, assignee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [card2Id, colTodoId, 'Criar Landing Page Responsiva', 'Garantir boa usabilidade em dispositivos móveis.', 'MEDIUM', 'Frontend', getOffsetDate(5), 1, 'Mariana Costa']
  );
  run('INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), card2Id, 'Hero section e CTA', 0, 0]);
  run('INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), card2Id, 'Grid de benefícios', 0, 1]);
  logCardEvent({ cardId: card2Id, userId, eventType: 'CARD_CREATED' });

  // Card 3
  const card3Id = crypto.randomUUID();
  run(
    'INSERT INTO cards (id, column_id, title, description, priority, tag, due_date, position, assignee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [card3Id, colDoingId, 'Arrastar e Soltar com @dnd-kit', 'Permitir reordenar cartões e mover entre colunas.', 'HIGH', 'Frontend', getOffsetDate(1), 0, currentUserName]
  );
  run('INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), card3Id, 'Configurar DndContext e SortableContext', 1, 0]);
  run('INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), card3Id, 'Atualização otimista no estado', 0, 1]);
  logCardEvent({ cardId: card3Id, userId, eventType: 'CARD_CREATED' });

  // Card 4
  const card4Id = crypto.randomUUID();
  run(
    'INSERT INTO cards (id, column_id, title, description, priority, tag, due_date, position, assignee) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [card4Id, colDoneId, 'Definição do Banco de Dados SQLite', 'Estruturação das tabelas e chaves estrangeiras com cascata.', 'LOW', 'Database', getOffsetDate(-1), 0, 'Carlos Eduardo']
  );
  run('INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), card4Id, 'Escrever migrations SQL', 1, 0]);
  run('INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), card4Id, 'Testar integridade referencial', 1, 1]);
  logCardEvent({ cardId: card4Id, userId, eventType: 'CARD_CREATED' });

  return boardId;
}
