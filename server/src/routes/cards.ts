import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, queryAll, run, db, logCardEvent } from '../db.js';
import { Card, CardType, Subtask } from '../types.js';

const router = Router();
router.use(requireAuth);

const cardTypeEnum = z.enum(['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK']);

const cardCreateSchema = z.object({
  columnId: z.string(),
  parentId: z.string().nullable().optional(),
  type: cardTypeEnum.default('TASK'),
  title: z.string().min(1, 'O título é obrigatório.'),
  description: z.string().default(''),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  tag: z.string().default(''),
  dueDate: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  subtasks: z.array(z.object({
    title: z.string().min(1),
    done: z.boolean().default(false),
  })).optional(),
});

const cardUpdateSchema = z.object({
  parentId: z.string().nullable().optional(),
  type: cardTypeEnum.optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  tag: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
});

const cardMoveSchema = z.object({
  targetColumnId: z.string(),
  newPosition: z.number().int().min(0),
});

// CD-04: Validador de regras de parentesco e detecção de ciclos
function validateParentRelationship(cardType: CardType, parentId?: string | null, currentCardId?: string): { valid: boolean; error?: string } {
  if (cardType === 'EPIC' && parentId) {
    return { valid: false, error: 'Um Épico não pode ter cartão pai.' };
  }

  if (cardType === 'SUBTASK' && !parentId) {
    return { valid: false, error: 'Uma Subtarefa deve obrigatoriamente ter um cartão pai.' };
  }

  if (parentId) {
    if (currentCardId && parentId === currentCardId) {
      return { valid: false, error: 'Um cartão não pode ser pai de si mesmo.' };
    }

    const parent = queryOne<{ id: string; type: CardType; parent_id: string | null }>(
      'SELECT id, type, parent_id FROM cards WHERE id = ? AND (is_archived = 0 OR is_archived IS NULL)',
      [parentId]
    );

    if (!parent) {
      return { valid: false, error: 'Cartão pai especificado não foi encontrado.' };
    }

    // Regras de compatibilidade de tipos
    if (cardType === 'STORY' && parent.type !== 'EPIC') {
      return { valid: false, error: 'Uma História só pode ser filha de um Épico.' };
    }

    if ((cardType === 'TASK' || cardType === 'BUG') && !['EPIC', 'STORY'].includes(parent.type)) {
      return { valid: false, error: 'Tarefas e Bugs só podem ser filhos de Épicos ou Histórias.' };
    }

    if (cardType === 'SUBTASK' && !['TASK', 'BUG', 'STORY'].includes(parent.type)) {
      return { valid: false, error: 'Subtarefas só podem ser filhas de Tarefas, Bugs ou Histórias.' };
    }

    // Detecção de ciclos em profundidade
    if (currentCardId) {
      let currentAncestorId = parent.parent_id;
      let depth = 0;
      while (currentAncestorId && depth < 20) {
        if (currentAncestorId === currentCardId) {
          return { valid: false, error: 'Ciclo de parentesco detectado: dependência circular inválida.' };
        }
        const ancestor = queryOne<{ parent_id: string | null }>(
          'SELECT parent_id FROM cards WHERE id = ?',
          [currentAncestorId]
        );
        currentAncestorId = ancestor?.parent_id || null;
        depth++;
      }
    }
  }

  return { valid: true };
}

// Verifica se a coluna pertence a um quadro do workspace do usuário autenticado
function verifyColumnOwnership(columnId: string, userId: string) {
  return queryOne<{ id: string }>(
    `SELECT c.id FROM columns c
     JOIN boards b ON b.id = c.board_id
     JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
     WHERE c.id = ? AND wm.user_id = ? AND (c.is_archived = 0 OR c.is_archived IS NULL)`,
    [columnId, userId]
  );
}

// Verifica se o cartão pertence a um quadro do workspace do usuário autenticado
function verifyCardOwnership(cardId: string, userId: string, includeArchived = false) {
  return queryOne<{ id: string; column_id: string; position: number }>(
    `SELECT cd.id, cd.column_id, cd.position FROM cards cd
     JOIN columns c ON c.id = cd.column_id
     JOIN boards b ON b.id = c.board_id
     JOIN workspace_members wm ON wm.workspace_id = b.workspace_id
     WHERE cd.id = ? AND wm.user_id = ? ${includeArchived ? '' : 'AND (cd.is_archived = 0 OR cd.is_archived IS NULL)'}`,
    [cardId, userId]
  );
}

// POST /api/cards (CD-03, CD-04)
router.post('/', (req: Request, res: Response) => {
  const result = cardCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { columnId, parentId, type, title, description, priority, tag, dueDate, assignee, subtasks } = result.data;

  const validColumn = verifyColumnOwnership(columnId, userId);
  if (!validColumn) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }

  // Validação de regras de parentesco (CD-04)
  const validation = validateParentRelationship(type, parentId);
  if (!validation.valid) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const maxPosRow = queryOne<{ nextPos: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS nextPos FROM cards WHERE column_id = ? AND (is_archived = 0 OR is_archived IS NULL)',
    [columnId]
  );
  const position = maxPosRow?.nextPos ?? 0;
  const cardId = crypto.randomUUID();
  const sanitizedAssignee = assignee !== undefined && assignee !== null && assignee.trim() !== '' ? assignee.trim() : null;

  run(
    `INSERT INTO cards (id, column_id, parent_id, type, title, description, priority, tag, due_date, position, assignee, is_archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [cardId, columnId, parentId || null, type, title.trim(), description.trim(), priority, tag.trim(), dueDate || null, position, sanitizedAssignee]
  );

  // EV-01: Log de criação de cartão
  logCardEvent({ cardId, userId, eventType: 'CARD_CREATED' });

  const createdSubtasks: Subtask[] = [];
  if (subtasks && subtasks.length > 0) {
    subtasks.forEach((st, idx) => {
      const stId = crypto.randomUUID();
      run(
        'INSERT INTO subtasks (id, card_id, title, done, position) VALUES (?, ?, ?, ?, ?)',
        [stId, cardId, st.title.trim(), st.done ? 1 : 0, idx]
      );
      createdSubtasks.push({
        id: stId,
        card_id: cardId,
        title: st.title.trim(),
        done: Boolean(st.done),
        position: idx,
      });
    });
  }

  const newCard: Card = {
    id: cardId,
    column_id: columnId,
    parent_id: parentId || null,
    type,
    title: title.trim(),
    description: description.trim(),
    priority,
    tag: tag.trim(),
    due_date: dueDate || null,
    position,
    assignee: sanitizedAssignee,
    subtasks: createdSubtasks,
    children: [],
    progress: {
      total: createdSubtasks.length,
      completed: createdSubtasks.filter(s => s.done).length,
      percent: createdSubtasks.length > 0
        ? Math.round((createdSubtasks.filter(s => s.done).length / createdSubtasks.length) * 100)
        : 0,
    },
    is_archived: false,
    archived_at: null,
  };

  res.status(201).json(newCard);
});

// PATCH /api/cards/:id (CD-03, CD-04)
router.patch('/:id', (req: Request, res: Response) => {
  const result = cardUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  const existingCard = verifyCardOwnership(id, userId);
  if (!existingCard) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const current = queryOne<any>('SELECT * FROM cards WHERE id = ?', [id]);
  const newType: CardType = result.data.type !== undefined ? result.data.type : (current.type || 'TASK');
  const newParentId = result.data.parentId !== undefined ? (result.data.parentId || null) : current.parent_id;

  // Validação de parentesco e ciclos (CD-04)
  if (result.data.type !== undefined || result.data.parentId !== undefined) {
    const validation = validateParentRelationship(newType, newParentId, id);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }
  }

  const newTitle = result.data.title !== undefined ? result.data.title.trim() : current.title;
  const newDesc = result.data.description !== undefined ? result.data.description.trim() : current.description;
  const newPriority = result.data.priority !== undefined ? result.data.priority : current.priority;
  const newTag = result.data.tag !== undefined ? result.data.tag.trim() : current.tag;
  const newDueDate = result.data.dueDate !== undefined ? (result.data.dueDate || null) : current.due_date;
  const newAssignee = result.data.assignee !== undefined
    ? (result.data.assignee && result.data.assignee.trim() !== '' ? result.data.assignee.trim() : null)
    : current.assignee;

  run(
    `UPDATE cards 
     SET title = ?, description = ?, priority = ?, tag = ?, due_date = ?, assignee = ?, type = ?, parent_id = ?
     WHERE id = ?`,
    [newTitle, newDesc, newPriority, newTag, newDueDate, newAssignee, newType, newParentId, id]
  );

  const updatedSubtasks = queryAll<{ id: string; card_id: string; title: string; done: number; position: number }>(
    'SELECT id, card_id, title, done, position FROM subtasks WHERE card_id = ? ORDER BY position ASC',
    [id]
  ).map(st => ({ ...st, done: Boolean(st.done) }));

  res.json({
    id,
    column_id: current.column_id,
    parent_id: newParentId,
    type: newType,
    title: newTitle,
    description: newDesc,
    priority: newPriority,
    tag: newTag,
    due_date: newDueDate,
    position: current.position,
    assignee: newAssignee,
    subtasks: updatedSubtasks,
    is_archived: Boolean(current.is_archived),
    archived_at: current.archived_at,
  });
});

// GET /api/cards/:id/children (CD-03: Lista cartões-filhos de um cartão)
router.get('/:id/children', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const card = verifyCardOwnership(id, userId, true);
  if (!card) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const children = queryAll<any>(
    `SELECT cd.id, cd.column_id, cd.parent_id, cd.type, cd.title, cd.description, cd.priority,
            cd.tag, cd.due_date, cd.position, cd.assignee, col.title as column_title
     FROM cards cd
     JOIN columns col ON col.id = cd.column_id
     WHERE cd.parent_id = ? AND (cd.is_archived = 0 OR cd.is_archived IS NULL)
     ORDER BY cd.position ASC`,
    [id]
  );

  res.json(children);
});

// DELETE /api/cards/:id (TD-02: Soft delete / Arquivamento padrão)
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const permanent = req.query.permanent === 'true';

  const existingCard = verifyCardOwnership(id, userId, true);
  if (!existingCard) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  if (permanent) {
    run('DELETE FROM cards WHERE id = ?', [id]);
    res.json({ message: 'Cartão excluído permanentemente.' });
  } else {
    run("UPDATE cards SET is_archived = 1, archived_at = datetime('now') WHERE id = ?", [id]);
    logCardEvent({ cardId: id, userId, eventType: 'ARCHIVED' });
    res.json({ message: 'Cartão arquivado com sucesso.' });
  }
});

// POST /api/cards/:id/restore (TD-02: Restaurar cartão arquivado)
router.post('/:id/restore', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const existingCard = verifyCardOwnership(id, userId, true);
  if (!existingCard) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  run('UPDATE cards SET is_archived = 0, archived_at = NULL WHERE id = ?', [id]);
  logCardEvent({ cardId: id, userId, eventType: 'RESTORED' });
  res.json({ message: 'Cartão restaurado com sucesso.' });
});

// POST /api/cards/:id/move (EV-01: Log de mudança de coluna com autor e data/hora)
router.post('/:id/move', (req: Request, res: Response) => {
  const result = cardMoveSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;
  const { targetColumnId, newPosition } = result.data;

  const card = verifyCardOwnership(id, userId);
  if (!card) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const targetCol = verifyColumnOwnership(targetColumnId, userId);
  if (!targetCol) {
    res.status(404).json({ error: 'Coluna destino não encontrada.' });
    return;
  }

  db.exec('BEGIN TRANSACTION');
  try {
    const isSameColumn = card.column_id === targetColumnId;

    if (isSameColumn) {
      const otherCards = queryAll<{ id: string }>(
        'SELECT id FROM cards WHERE column_id = ? AND id != ? AND (is_archived = 0 OR is_archived IS NULL) ORDER BY position ASC',
        [targetColumnId, id]
      );

      const reorderedIds = otherCards.map(c => c.id);
      reorderedIds.splice(newPosition, 0, id);

      reorderedIds.forEach((cId, idx) => {
        run('UPDATE cards SET position = ? WHERE id = ?', [idx, cId]);
      });
    } else {
      const sourceOthers = queryAll<{ id: string }>(
        'SELECT id FROM cards WHERE column_id = ? AND id != ? AND (is_archived = 0 OR is_archived IS NULL) ORDER BY position ASC',
        [card.column_id, id]
      );
      sourceOthers.forEach((item, idx) => {
        run('UPDATE cards SET position = ? WHERE id = ?', [idx, item.id]);
      });

      const targetCards = queryAll<{ id: string }>(
        'SELECT id FROM cards WHERE column_id = ? AND (is_archived = 0 OR is_archived IS NULL) ORDER BY position ASC',
        [targetColumnId]
      );
      const targetIds = targetCards.map(c => c.id);
      targetIds.splice(newPosition, 0, id);

      targetIds.forEach((cId, idx) => {
        if (cId === id) {
          run('UPDATE cards SET column_id = ?, position = ? WHERE id = ?', [targetColumnId, idx, id]);
        } else {
          run('UPDATE cards SET position = ? WHERE id = ?', [idx, cId]);
        }
      });

      // EV-01: Log de evento atômico da mudança de coluna
      logCardEvent({
        cardId: id,
        userId,
        eventType: 'COLUMN_CHANGE',
        fromColumnId: card.column_id,
        toColumnId: targetColumnId,
      });
    }

    db.exec('COMMIT');
    res.json({ success: true, cardId: id, targetColumnId, newPosition });
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Falha ao mover cartão.' });
  }
});

// GET /api/cards/:id/events (EV-01: Histórico de eventos do cartão)
router.get('/:id/events', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const card = verifyCardOwnership(id, userId, true);
  if (!card) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const events = queryAll<{
    id: string;
    card_id: string;
    user_id: string;
    user_name: string;
    event_type: string;
    from_column_id: string | null;
    from_column_title: string | null;
    to_column_id: string | null;
    to_column_title: string | null;
    from_value: string | null;
    to_value: string | null;
    created_at: string;
  }>(
    `SELECT e.id, e.card_id, e.user_id, u.name as user_name, e.event_type,
            e.from_column_id, c1.title as from_column_title,
            e.to_column_id, c2.title as to_column_title,
            e.from_value, e.to_value, e.created_at
     FROM card_events e
     LEFT JOIN users u ON u.id = e.user_id
     LEFT JOIN columns c1 ON c1.id = e.from_column_id
     LEFT JOIN columns c2 ON c2.id = e.to_column_id
     WHERE e.card_id = ?
     ORDER BY e.created_at DESC`,
    [id]
  );

  res.json(events);
});

export default router;
