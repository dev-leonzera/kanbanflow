import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, run } from '../db.js';
import { can } from '../permissions/can.js';

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

function getSubtaskContext(subtaskId: string) {
  return queryOne<{ id: string; card_id: string; board_id: string }>(
    `SELECT s.id, s.card_id, c.board_id
     FROM subtasks s
     JOIN cards cd ON cd.id = s.card_id
     JOIN columns c ON c.id = cd.column_id
     WHERE s.id = ?`,
    [subtaskId]
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

  const card = queryOne<{ id: string; board_id: string }>(
    `SELECT cd.id, c.board_id
     FROM cards cd
     JOIN columns c ON c.id = cd.column_id
     WHERE cd.id = ?`,
    [cardId]
  );

  if (!card) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: card.board_id })) {
    res.status(403).json({ error: 'Você não tem permissão para editar subtarefas neste quadro.' });
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

  const subtask = getSubtaskContext(id);
  if (!subtask) {
    res.status(404).json({ error: 'Subtarefa não encontrada.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: subtask.board_id })) {
    res.status(403).json({ error: 'Sem permissão para atualizar subtarefas neste quadro.' });
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

  const subtask = getSubtaskContext(id);
  if (!subtask) {
    res.status(404).json({ error: 'Subtarefa não encontrada.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: subtask.board_id })) {
    res.status(403).json({ error: 'Sem permissão para excluir subtarefas neste quadro.' });
    return;
  }

  run('DELETE FROM subtasks WHERE id = ?', [id]);
  res.json({ message: 'Subtarefa excluída com sucesso.' });
});

// POST /api/subtasks/:id/promote (CD-09: Checklist promovível a cartão)
router.post('/:id/promote', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const subtask = queryOne<{ id: string; card_id: string; title: string; done: number }>(
    'SELECT id, card_id, title, done FROM subtasks WHERE id = ?',
    [id]
  );

  if (!subtask) {
    res.status(404).json({ error: 'Subtarefa não encontrada.' });
    return;
  }

  const parentCard = queryOne<{ id: string; column_id: string; board_id: string; workspace_id: string; priority: string; tag: string }>(
    `SELECT cd.id, cd.column_id, c.board_id, b.workspace_id, cd.priority, cd.tag
     FROM cards cd
     JOIN columns c ON c.id = cd.column_id
     JOIN boards b ON b.id = c.board_id
     WHERE cd.id = ?`,
    [subtask.card_id]
  );

  if (!parentCard) {
    res.status(404).json({ error: 'Cartão pai não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: parentCard.board_id })) {
    res.status(403).json({ error: 'Sem permissão para promover subtarefa neste quadro.' });
    return;
  }

  // Se a subtarefa estava concluída e existe coluna concluída, coloca nela; senão na coluna do pai
  let targetColumnId = parentCard.column_id;
  if (subtask.done) {
    const doneCol = queryOne<{ id: string }>(
      `SELECT id FROM columns 
       WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL)
       AND (LOWER(title) LIKE '%conclu%' OR LOWER(title) LIKE '%done%')
       ORDER BY position DESC LIMIT 1`,
      [parentCard.board_id]
    );
    if (doneCol) {
      targetColumnId = doneCol.id;
    }
  }

  const maxPosRow = queryOne<{ nextPos: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS nextPos FROM cards WHERE column_id = ? AND (is_archived = 0 OR is_archived IS NULL)',
    [targetColumnId]
  );
  const position = maxPosRow?.nextPos ?? 0;
  const newCardId = crypto.randomUUID();

  // Cria cartão completo como SUBTASK com parent_id apontando para o cartão de origem
  run(
    `INSERT INTO cards (id, column_id, parent_id, type, title, description, priority, tag, position, assignee, is_archived, created_at)
     VALUES (?, ?, ?, 'SUBTASK', ?, '', ?, ?, ?, NULL, 0, datetime('now'))`,
    [newCardId, targetColumnId, parentCard.id, subtask.title.trim(), parentCard.priority, parentCard.tag, position]
  );

  // Remove o item do checklist promovido
  run('DELETE FROM subtasks WHERE id = ?', [id]);

  res.status(201).json({
    message: 'Subtarefa promovida a cartão com sucesso.',
    cardId: newCardId,
    parentId: parentCard.id,
    columnId: targetColumnId,
    title: subtask.title.trim(),
  });
});

export default router;
