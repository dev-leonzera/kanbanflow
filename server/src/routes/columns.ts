import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, run, db } from '../db.js';

const router = Router();
router.use(requireAuth);

const columnSchema = z.object({
  title: z.string().min(1, 'O título da coluna é obrigatório.'),
  boardId: z.string().optional(),
});

const columnReorderSchema = z.object({
  boardId: z.string(),
  columnIds: z.array(z.string()).min(1, 'A lista de colunas não pode estar vazia.'),
});

function verifyColumnOwnership(columnId: string, userId: string, includeArchived = false) {
  return queryOne<{ id: string }>(
    `SELECT c.id FROM columns c
     JOIN boards b ON b.id = c.board_id
     JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
     WHERE c.id = ? AND wm.user_id = ? ${includeArchived ? '' : 'AND (c.is_archived = 0 OR c.is_archived IS NULL)'}`,
    [columnId, userId]
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

  let board: { id: string } | undefined;
  if (boardId) {
    board = queryOne<{ id: string }>(
      `SELECT b.id FROM boards b
       JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
       WHERE b.id = ? AND wm.user_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)`,
      [boardId, userId]
    );
  } else {
    board = queryOne<{ id: string }>(
      `SELECT b.id FROM boards b
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

  const maxPosRow = queryOne<{ nextPos: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS nextPos FROM columns WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL)',
    [board.id]
  );
  const position = maxPosRow?.nextPos ?? 0;
  const columnId = crypto.randomUUID();

  run('INSERT INTO columns (id, board_id, title, position, is_archived) VALUES (?, ?, ?, ?, 0)', [
    columnId,
    board.id,
    result.data.title.trim(),
    position,
  ]);

  res.status(201).json({
    id: columnId,
    board_id: board.id,
    title: result.data.title.trim(),
    position,
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

  const board = queryOne<{ id: string }>(
    `SELECT b.id FROM boards b
     JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
     WHERE b.id = ? AND wm.user_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)`,
    [boardId, userId]
  );

  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
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
  const result = columnSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  const col = verifyColumnOwnership(id, userId);
  if (!col) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }

  run('UPDATE columns SET title = ? WHERE id = ?', [result.data.title.trim(), id]);
  res.json({ id, title: result.data.title.trim() });
});

// DELETE /api/columns/:id (TD-02: Soft delete / Arquivamento padrão)
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const permanent = req.query.permanent === 'true';

  const col = verifyColumnOwnership(id, userId, true);
  if (!col) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }

  if (permanent) {
    run('DELETE FROM columns WHERE id = ?', [id]);
    res.json({ message: 'Coluna excluída permanentemente.' });
  } else {
    run("UPDATE columns SET is_archived = 1, archived_at = datetime('now') WHERE id = ?", [id]);
    run("UPDATE cards SET is_archived = 1, archived_at = datetime('now') WHERE column_id = ?", [id]);
    res.json({ message: 'Coluna e seus cartões arquivados com sucesso.' });
  }
});

// POST /api/columns/:id/restore (TD-02: Restaurar coluna arquivada)
router.post('/:id/restore', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const col = verifyColumnOwnership(id, userId, true);
  if (!col) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }

  run('UPDATE columns SET is_archived = 0, archived_at = NULL WHERE id = ?', [id]);
  run('UPDATE cards SET is_archived = 0, archived_at = NULL WHERE column_id = ?', [id]);
  res.json({ message: 'Coluna e seus cartões restaurados com sucesso.' });
});

export default router;
