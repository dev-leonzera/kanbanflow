import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, run } from '../db.js';

const router = Router();
router.use(requireAuth);

const subtaskCreateSchema = z.object({
  cardId: z.string(),
  title: z.string().min(1, 'O título da subtarefa é obrigatório.'),
  done: z.boolean().default(false),
});

const subtaskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  done: z.boolean().optional(),
});

function verifySubtaskOwnership(subtaskId: string, userId: string) {
  return queryOne<{ id: string; card_id: string }>(
    `SELECT s.id, s.card_id FROM subtasks s
     JOIN cards cd ON cd.id = s.card_id
     JOIN columns c ON c.id = cd.column_id
     JOIN boards b ON b.id = c.board_id
     JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
     WHERE s.id = ? AND wm.user_id = ?`,
    [subtaskId, userId]
  );
}

// POST /api/subtasks
router.post('/', (req: Request, res: Response) => {
  const result = subtaskCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { cardId, title, done } = result.data;

  const card = queryOne<{ id: string }>(
    `SELECT cd.id FROM cards cd
     JOIN columns c ON c.id = cd.column_id
     JOIN boards b ON b.id = c.board_id
     JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
     WHERE cd.id = ? AND wm.user_id = ?`,
    [cardId, userId]
  );

  if (!card) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const maxPosRow = queryOne<{ nextPos: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS nextPos FROM subtasks WHERE card_id = ?',
    [cardId]
  );
  const position = maxPosRow?.nextPos ?? 0;
  const subtaskId = crypto.randomUUID();

  run(
    'INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)',
    [subtaskId, cardId, title.trim(), done ? 1 : 0, position]
  );

  res.status(201).json({
    id: subtaskId,
    card_id: cardId,
    title: title.trim(),
    done,
    position,
  });
});

// PATCH /api/subtasks/:id
router.patch('/:id', (req: Request, res: Response) => {
  const result = subtaskUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  const subtask = verifySubtaskOwnership(id, userId);
  if (!subtask) {
    res.status(404).json({ error: 'Subtarefa não encontrada.' });
    return;
  }

  const current = queryOne<any>('SELECT * FROM subtasks WHERE id = ?', [id]);
  const newTitle = result.data.title !== undefined ? result.data.title.trim() : current.title;
  const newDone = result.data.done !== undefined ? (result.data.done ? 1 : 0) : current.done;

  run('UPDATE subtasks SET title = ?, done = ? WHERE id = ?', [newTitle, newDone, id]);

  res.json({
    id,
    card_id: current.card_id,
    title: newTitle,
    done: Boolean(newDone),
    position: current.position,
  });
});

// DELETE /api/subtasks/:id
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const subtask = verifySubtaskOwnership(id, userId);
  if (!subtask) {
    res.status(404).json({ error: 'Subtarefa não encontrada.' });
    return;
  }

  run('DELETE FROM subtasks WHERE id = ?', [id]);
  res.json({ message: 'Subtarefa excluída com sucesso.' });
});

export default router;

