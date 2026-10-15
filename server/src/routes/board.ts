import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, queryAll, run, createDefaultBoardForUser, getUserPrimaryWorkspace } from '../db.js';
import { Board, Column, Card, Subtask } from '../types.js';

const router = Router();
router.use(requireAuth);

const boardCreateSchema = z.object({
  title: z.string().min(1, 'O título do quadro é obrigatório.'),
  workspaceId: z.string().optional(),
});

const boardUpdateSchema = z.object({
  title: z.string().min(1, 'O título do quadro é obrigatório.'),
});

// Helper para obter o quadro completo do usuário logado (com suporte a workspace e soft delete)
export function getUserBoard(userId: string, targetBoardId?: string, targetWorkspaceId?: string): Board {
  let workspaceId = targetWorkspaceId;

  if (!workspaceId && !targetBoardId) {
    const ws = getUserPrimaryWorkspace(userId);
    workspaceId = ws.id;
  }

  let board: { id: string; workspace_id: string; user_id?: string; title: string } | undefined;

  if (targetBoardId) {
    board = queryOne<{ id: string; workspace_id: string; user_id?: string; title: string }>(
      `SELECT b.id, b.workspace_id, b.user_id, b.title 
       FROM boards b
       JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
       WHERE b.id = ? AND wm.user_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)`,
      [targetBoardId, userId]
    );
  }

  if (!board && workspaceId) {
    // Busca o primeiro quadro ativo no workspace especificado
    board = queryOne<{ id: string; workspace_id: string; user_id?: string; title: string }>(
      `SELECT b.id, b.workspace_id, b.user_id, b.title 
       FROM boards b
       JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
       WHERE b.workspace_id = ? AND wm.user_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)
       ORDER BY b.created_at ASC 
       LIMIT 1`,
      [workspaceId, userId]
    );
  }

  if (!board) {
    // Se ainda assim não encontrou, busca em qualquer workspace do usuário
    board = queryOne<{ id: string; workspace_id: string; user_id?: string; title: string }>(
      `SELECT b.id, b.workspace_id, b.user_id, b.title 
       FROM boards b
       JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
       WHERE wm.user_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)
       ORDER BY b.created_at ASC 
       LIMIT 1`,
      [userId]
    );
  }

  if (!board) {
    const defaultWs = getUserPrimaryWorkspace(userId);
    const boardId = createDefaultBoardForUser(userId, defaultWs.id);
    board = { id: boardId, workspace_id: defaultWs.id, user_id: userId, title: 'Meu Quadro' };
  }

  // Busca colunas não arquivadas (TD-02)
  const columnsRaw = queryAll<{ id: string; board_id: string; title: string; position: number }>(
    `SELECT id, board_id, title, position 
     FROM columns 
     WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL)
     ORDER BY position ASC`,
    [board.id]
  );

  const columnIds = columnsRaw.map(c => c.id);

  // Identifica colunas de conclusão ("Concluído", "Done") para cálculo de progresso agregado (CD-05)
  const doneColIds = new Set(
    columnsRaw
      .filter(c => /conclu[ií]d/i.test(c.title) || /done/i.test(c.title))
      .map(c => c.id)
  );
  if (doneColIds.size === 0 && columnsRaw.length > 0) {
    const maxPosCol = columnsRaw.reduce((prev, curr) => (curr.position > prev.position ? curr : prev));
    doneColIds.add(maxPosCol.id);
  }

  let cardsRaw: {
    id: string;
    column_id: string;
    parent_id: string | null;
    type: any;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    tag: string;
    due_date: string | null;
    position: number;
    assignee: string | null;
  }[] = [];

  // Busca cartões não arquivados incluindo type e parent_id (CD-03, CD-04)
  if (columnIds.length > 0) {
    const placeholders = columnIds.map(() => '?').join(',');
    cardsRaw = queryAll(
      `SELECT id, column_id, parent_id, COALESCE(type, 'TASK') as type, title, description, priority, tag, due_date, position, assignee 
       FROM cards 
       WHERE column_id IN (${placeholders}) AND (is_archived = 0 OR is_archived IS NULL)
       ORDER BY position ASC`,
      columnIds
    );
  }

  const cardIds = cardsRaw.map(c => c.id);
  let subtasksRaw: {
    id: string;
    card_id: string;
    title: string;
    done: number;
    position: number;
  }[] = [];

  if (cardIds.length > 0) {
    const placeholders = cardIds.map(() => '?').join(',');
    subtasksRaw = queryAll(
      `SELECT id, card_id, title, done, position 
       FROM subtasks 
       WHERE card_id IN (${placeholders}) 
       ORDER BY position ASC`,
      cardIds
    );
  }

  const subtasksByCard = new Map<string, Subtask[]>();
  for (const st of subtasksRaw) {
    if (!subtasksByCard.has(st.card_id)) {
      subtasksByCard.set(st.card_id, []);
    }
    subtasksByCard.get(st.card_id)!.push({
      id: st.id,
      card_id: st.card_id,
      title: st.title,
      done: Boolean(st.done),
      position: st.position,
    });
  }

  // Mapeia cartões para organizar parentesco (CD-03)
  const childrenByParent = new Map<string, Card[]>();
  for (const card of cardsRaw) {
    if (card.parent_id) {
      if (!childrenByParent.has(card.parent_id)) {
        childrenByParent.set(card.parent_id, []);
      }
      childrenByParent.get(card.parent_id)!.push({
        ...card,
        subtasks: subtasksByCard.get(card.id) || [],
      });
    }
  }

  const cardsByCol = new Map<string, Card[]>();
  for (const card of cardsRaw) {
    if (!cardsByCol.has(card.column_id)) {
      cardsByCol.set(card.column_id, []);
    }

    const cardChildren = childrenByParent.get(card.id) || [];
    const cardSubtasks = subtasksByCard.get(card.id) || [];

    // Cálculo do progresso agregado no pai (CD-05)
    const totalChecklist = cardSubtasks.length;
    const doneChecklist = cardSubtasks.filter(s => s.done).length;
    const totalChildren = cardChildren.length;
    const doneChildren = cardChildren.filter(c => doneColIds.has(c.column_id)).length;

    const totalItems = totalChecklist + totalChildren;
    const completedItems = doneChecklist + doneChildren;
    const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    cardsByCol.get(card.column_id)!.push({
      ...card,
      subtasks: cardSubtasks,
      children: cardChildren,
      progress: {
        total: totalItems,
        completed: completedItems,
        percent,
      },
    });
  }

  const columns: Column[] = columnsRaw.map(col => ({
    ...col,
    cards: cardsByCol.get(col.id) || [],
  }));

  return {
    id: board.id,
    workspace_id: board.workspace_id,
    user_id: board.user_id,
    title: board.title,
    columns,
  };
}

// GET /api/board
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const targetBoardId = typeof req.query.boardId === 'string' ? req.query.boardId : undefined;
  const targetWorkspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  const board = getUserBoard(userId, targetBoardId, targetWorkspaceId);
  res.json(board);
});

// GET /api/board/list - Lista todos os quadros ativos do workspace especificado ou primário (BD-01)
router.get('/list', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const targetWorkspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;

  let workspaceId = targetWorkspaceId;
  if (!workspaceId) {
    const ws = getUserPrimaryWorkspace(userId);
    workspaceId = ws.id;
  }

  const boards = queryAll<{ id: string; workspace_id: string; title: string; created_at: string }>(
    `SELECT b.id, b.workspace_id, b.title, b.created_at
     FROM boards b
     JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
     WHERE wm.user_id = ? AND b.workspace_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)
     ORDER BY b.created_at ASC`,
    [userId, workspaceId]
  );
  res.json(boards);
});

// POST /api/board - Cria um novo quadro dentro de um workspace (BD-01)
router.post('/', (req: Request, res: Response) => {
  const result = boardCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  let workspaceId = result.data.workspaceId;

  if (!workspaceId) {
    const ws = getUserPrimaryWorkspace(userId);
    workspaceId = ws.id;
  } else {
    // Valida se o usuário pertence a este workspace
    const member = queryOne(
      'SELECT workspace_id FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
      [workspaceId, userId]
    );
    if (!member) {
      res.status(403).json({ error: 'Você não tem permissão para criar quadros neste workspace.' });
      return;
    }
  }

  const boardId = crypto.randomUUID();
  const title = result.data.title.trim();

  run(
    `INSERT INTO boards (id, workspace_id, user_id, title, is_archived, created_at)
     VALUES (?, ?, ?, ?, 0, datetime('now'))`,
    [boardId, workspaceId, userId, title]
  );

  // Inicializa colunas padrão do novo quadro
  const colTodoId = crypto.randomUUID();
  const colDoingId = crypto.randomUUID();
  const colDoneId = crypto.randomUUID();

  run('INSERT INTO columns (id, board_id, title, position, is_archived) VALUES (?, ?, ?, ?, 0)', [colTodoId, boardId, 'A Fazer', 0]);
  run('INSERT INTO columns (id, board_id, title, position, is_archived) VALUES (?, ?, ?, ?, 0)', [colDoingId, boardId, 'Em Andamento', 1]);
  run('INSERT INTO columns (id, board_id, title, position, is_archived) VALUES (?, ?, ?, ?, 0)', [colDoneId, boardId, 'Concluído', 2]);

  const newBoard = getUserBoard(userId, boardId, workspaceId);
  res.status(201).json(newBoard);
});

// PATCH /api/board/:id - Renomeia um quadro existente (BD-01)
router.patch('/:id', (req: Request, res: Response) => {
  const result = boardUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  const board = queryOne<{ id: string; workspace_id: string }>(
    `SELECT b.id, b.workspace_id FROM boards b
     JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
     WHERE b.id = ? AND wm.user_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)`,
    [id, userId]
  );

  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  const newTitle = result.data.title.trim();
  run('UPDATE boards SET title = ? WHERE id = ?', [newTitle, id]);

  res.json({ id, title: newTitle, workspace_id: board.workspace_id });
});

// DELETE /api/board/:id - Arquiva um quadro (Soft delete)
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const board = queryOne<{ id: string }>(
    `SELECT b.id FROM boards b
     JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
     WHERE b.id = ? AND wm.user_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)`,
    [id, userId]
  );

  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  run("UPDATE boards SET is_archived = 1, archived_at = datetime('now') WHERE id = ?", [id]);
  res.json({ message: 'Quadro arquivado com sucesso.' });
});

// POST /api/board/reset - Disponível apenas em desenvolvimento (TD-03)
router.post('/reset', (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'Endpoint de reset disponível apenas em ambiente de desenvolvimento.' });
    return;
  }

  const userId = req.user!.id;
  const targetWorkspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  const workspace = targetWorkspaceId ? { id: targetWorkspaceId, name: '' } : getUserPrimaryWorkspace(userId);

  // Busca o primeiro quadro ativo no workspace
  const board = queryOne<{ id: string }>(
    `SELECT b.id FROM boards b
     JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
     WHERE wm.user_id = ? AND b.workspace_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)
     ORDER BY b.created_at ASC LIMIT 1`,
    [userId, workspace.id]
  );

  if (board) {
    run('DELETE FROM columns WHERE board_id = ?', [board.id]);
    run('DELETE FROM boards WHERE id = ?', [board.id]);
  }

  createDefaultBoardForUser(userId, workspace.id);
  const updatedBoard = getUserBoard(userId, undefined, workspace.id);
  res.json(updatedBoard);
});

export default router;
