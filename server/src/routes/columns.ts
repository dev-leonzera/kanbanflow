import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, run, db, logAudit } from '../db.js';
import { can } from '../permissions/can.js';

const router = Router();
router.use(requireAuth);

const columnSchema = z.object({
  title: z.string().min(1, 'O título da coluna é obrigatório.'),
  boardId: z.string().optional(),
  wipLimit: z.number().int().min(0).nullable().optional(),
});

const columnPatchSchema = z.object({
  title: z.string().min(1, 'O título da coluna é obrigatório.').optional(),
  wipLimit: z.number().int().min(0).nullable().optional(),
});

const columnReorderSchema = z.object({
  boardId: z.string(),
  columnIds: z.array(z.string()).min(1, 'A lista de colunas não pode estar vazia.'),
});

function getColumnWithBoard(columnId: string, includeArchived = false) {
  return queryOne<{ id: string; board_id: string; workspace_id: string; title: string; wip_limit: number | null }>(
    `SELECT c.id, c.board_id, b.workspace_id, c.title, c.wip_limit
     FROM columns c
     JOIN boards b ON b.id = c.board_id
     WHERE c.id = ? ${includeArchived ? '' : 'AND (c.is_archived = 0 OR c.is_archived IS NULL)'}`,
    [columnId]
  );
}

// POST /api/columns
router.post('/', (req: Request, res: Response) => {
  const result = columnSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const boardId = result.data.boardId;

  let board: { id: string; workspace_id: string } | undefined;
  if (boardId) {
    board = queryOne<{ id: string; workspace_id: string }>(
      `SELECT id, workspace_id FROM boards
       WHERE id = ? AND (is_archived = 0 OR is_archived IS NULL)`,
      [boardId]
    );
  } else {
    board = queryOne<{ id: string; workspace_id: string }>(
      `SELECT b.id, b.workspace_id FROM boards b
       JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
       WHERE wm.user_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)
       ORDER BY b.created_at ASC LIMIT 1`,
      [userId]
    );
  }

  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: board.id })) {
    res.status(403).json({ error: 'Você não tem permissão de edição neste quadro.' });
    return;
  }

  const maxPosRow = queryOne<{ nextPos: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS nextPos FROM columns WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL)',
    [board.id]
  );
  const position = maxPosRow?.nextPos ?? 0;
  const columnId = crypto.randomUUID();
  const title = result.data.title.trim();
  const wipLimit = result.data.wipLimit !== undefined ? result.data.wipLimit : null;

  run('INSERT INTO columns (id, board_id, title, position, wip_limit, is_archived) VALUES (?, ?, ?, ?, ?, 0)', [
    columnId,
    board.id,
    title,
    position,
    wipLimit,
  ]);

  logAudit({
    workspaceId: board.workspace_id,
    boardId: board.id,
    userId,
    action: 'COLUMN_CREATED',
    targetType: 'COLUMN',
    targetId: columnId,
    details: { title, wipLimit },
  });

  res.status(201).json({
    id: columnId,
    board_id: board.id,
    title,
    position,
    wip_limit: wipLimit,
    cards: [],
  });
});

// POST /api/columns/reorder (BD-01: Reordenar colunas no quadro)
router.post('/reorder', (req: Request, res: Response) => {
  const result = columnReorderSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { boardId, columnIds } = result.data;

  const board = queryOne<{ id: string; workspace_id: string }>(
    `SELECT id, workspace_id FROM boards
     WHERE id = ? AND (is_archived = 0 OR is_archived IS NULL)`,
    [boardId]
  );

  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Você não tem permissão para reordenar colunas neste quadro.' });
    return;
  }

  db.exec('BEGIN TRANSACTION');
  try {
    columnIds.forEach((colId, idx) => {
      run('UPDATE columns SET position = ? WHERE id = ? AND board_id = ?', [idx, colId, boardId]);
    });
    db.exec('COMMIT');
    res.json({ success: true, columnIds });
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Falha ao reordenar colunas.' });
  }
});

// PATCH /api/columns/:id
router.patch('/:id', (req: Request, res: Response) => {
  const result = columnPatchSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  const col = getColumnWithBoard(id);
  if (!col) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: col.board_id })) {
    res.status(403).json({ error: 'Sem permissão para editar colunas neste quadro.' });
    return;
  }

  const newTitle = result.data.title !== undefined ? result.data.title.trim() : col.title;
  const newWipLimit = result.data.wipLimit !== undefined ? result.data.wipLimit : col.wip_limit;

  run('UPDATE columns SET title = ?, wip_limit = ? WHERE id = ?', [newTitle, newWipLimit, id]);

  logAudit({
    workspaceId: col.workspace_id,
    boardId: col.board_id,
    userId,
    action: 'COLUMN_UPDATED',
    targetType: 'COLUMN',
    targetId: id,
    details: { oldTitle: col.title, newTitle, oldWipLimit: col.wip_limit, newWipLimit },
  });

  res.json({ id, title: newTitle, wip_limit: newWipLimit });
});

// DELETE /api/columns/:id (TD-02: Soft delete / Arquivamento padrão)
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const permanent = req.query.permanent === 'true';

  const col = getColumnWithBoard(id, true);
  if (!col) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: col.board_id })) {
    res.status(403).json({ error: 'Sem permissão para arquivar ou excluir colunas neste quadro.' });
    return;
  }

  if (permanent) {
    run('DELETE FROM columns WHERE id = ?', [id]);
    logAudit({
      workspaceId: col.workspace_id,
      boardId: col.board_id,
      userId,
      action: 'COLUMN_DELETED',
      targetType: 'COLUMN',
      targetId: id,
      details: { title: col.title },
    });
    res.json({ message: 'Coluna excluída permanentemente.' });
  } else {
    run("UPDATE columns SET is_archived = 1, archived_at = datetime('now') WHERE id = ?", [id]);
    run("UPDATE cards SET is_archived = 1, archived_at = datetime('now') WHERE column_id = ?", [id]);
    logAudit({
      workspaceId: col.workspace_id,
      boardId: col.board_id,
      userId,
      action: 'COLUMN_ARCHIVED',
      targetType: 'COLUMN',
      targetId: id,
      details: { title: col.title },
    });
    res.json({ message: 'Coluna e seus cartões arquivados com sucesso.' });
  }
});

// POST /api/columns/:id/restore (TD-02: Restaurar coluna arquivada)
router.post('/:id/restore', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const col = getColumnWithBoard(id, true);
  if (!col) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: col.board_id })) {
    res.status(403).json({ error: 'Sem permissão para restaurar colunas neste quadro.' });
    return;
  }

  run('UPDATE columns SET is_archived = 0, archived_at = NULL WHERE id = ?', [id]);
  run('UPDATE cards SET is_archived = 0, archived_at = NULL WHERE column_id = ?', [id]);
  res.json({ message: 'Coluna e seus cartões restaurados com sucesso.' });
});

export default router;
