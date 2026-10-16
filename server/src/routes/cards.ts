import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, queryAll, run, db, logCardEvent, logAudit } from '../db.js';
import { Card, CardType, Subtask, CardComment, CardAttachment, CardRelation } from '../types.js';
import { can } from '../permissions/can.js';
import { dispatchCardEventNotifications } from './notifications.js';
import { parseEstimateToHours } from './capacity.js';

const router = Router();
router.use(requireAuth);

const cardTypeEnum = z.enum(['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK']);
const relationTypeEnum = z.enum(['BLOCKS', 'RELATED', 'DUPLICATE']);
const cardVisibilityEnum = z.enum(['NORMAL', 'RESTRICTED', 'PRIVATE']);

const cardCreateSchema = z.object({
  columnId: z.string(),
  parentId: z.string().nullable().optional(),
  sprintId: z.string().nullable().optional(),
  type: cardTypeEnum.default('TASK'),
  visibility: cardVisibilityEnum.default('NORMAL'),
  restrictedToRole: z.string().nullable().optional(),
  title: z.string().min(1, 'O título é obrigatório.'),
  description: z.string().default(''),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  tag: z.string().default(''),
  dueDate: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  estimate: z.string().nullable().optional(),
  subtasks: z.array(z.object({
    title: z.string().min(1),
    done: z.boolean().default(false),
  })).optional(),
});

const cardUpdateSchema = z.object({
  parentId: z.string().nullable().optional(),
  sprintId: z.string().nullable().optional(),
  type: cardTypeEnum.optional(),
  visibility: cardVisibilityEnum.optional(),
  restrictedToRole: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  tag: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  assignee: z.string().nullable().optional(),
  estimate: z.string().nullable().optional(),
});

const timeLogCreateSchema = z.object({
  durationSeconds: z.number().int().positive('A duração deve ser maior que zero segundos.'),
  notes: z.string().optional().default(''),
  logDate: z.string().optional(),
});

const timerStopSchema = z.object({
  notes: z.string().optional().default(''),
});

const cardMoveSchema = z.object({
  targetColumnId: z.string(),
  newPosition: z.number().int().min(0),
  force: z.boolean().optional().default(false),
});

const commentCreateSchema = z.object({
  content: z.string().min(1, 'O comentário não pode estar vazio.'),
});

const attachmentCreateSchema = z.object({
  name: z.string().min(1, 'O nome do anexo é obrigatório.'),
  url: z.string().min(1, 'O conteúdo ou URL do anexo é obrigatório.'),
  sizeBytes: z.number().int().nonnegative().optional().default(0),
  mimeType: z.string().optional().default('application/octet-stream'),
});

const relationCreateSchema = z.object({
  targetCardId: z.string().min(1, 'Selecione o cartão relacionado.'),
  relationType: relationTypeEnum,
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

    if (cardType === 'STORY' && parent.type !== 'EPIC') {
      return { valid: false, error: 'Uma História só pode ser filha de um Épico.' };
    }

    if ((cardType === 'TASK' || cardType === 'BUG') && !['EPIC', 'STORY'].includes(parent.type)) {
      return { valid: false, error: 'Tarefas e Bugs só podem ser filhos de Épicos ou Histórias.' };
    }

    if (cardType === 'SUBTASK' && !['TASK', 'BUG', 'STORY'].includes(parent.type)) {
      return { valid: false, error: 'Subtarefas só podem ser filhas de Tarefas, Bugs ou Histórias.' };
    }

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

// CD-06: Detecção de ciclos em relações de bloqueio (BFS no grafo direcionado BLOCKS)
function hasBlockingCycle(sourceCardId: string, targetCardId: string): boolean {
  if (sourceCardId === targetCardId) return true;

  const visited = new Set<string>();
  const queue: string[] = [targetCardId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === sourceCardId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const nextTargets = queryAll<{ target_card_id: string }>(
      "SELECT target_card_id FROM card_relations WHERE source_card_id = ? AND relation_type = 'BLOCKS'",
      [current]
    );

    for (const row of nextTargets) {
      if (!visited.has(row.target_card_id)) {
        queue.push(row.target_card_id);
      }
    }
  }

  return false;
}

function getColumnContext(columnId: string) {
  return queryOne<{ id: string; board_id: string; workspace_id: string; title: string }>(
    `SELECT c.id, c.board_id, b.workspace_id, c.title
     FROM columns c
     JOIN boards b ON b.id = c.board_id
     WHERE c.id = ? AND (c.is_archived = 0 OR c.is_archived IS NULL)`,
    [columnId]
  );
}

function getCardContext(cardId: string, includeArchived = false) {
  return queryOne<{ id: string; column_id: string; position: number; board_id: string; workspace_id: string; title: string; assignee: string | null }>(
    `SELECT cd.id, cd.column_id, cd.position, c.board_id, b.workspace_id, cd.title, cd.assignee
     FROM cards cd
     JOIN columns c ON c.id = cd.column_id
     JOIN boards b ON b.id = c.board_id
     WHERE cd.id = ? ${includeArchived ? '' : 'AND (cd.is_archived = 0 OR cd.is_archived IS NULL)'}`,
    [cardId]
  );
}

// POST /api/cards (CD-03, CD-04, CD-08, BD-04)
router.post('/', (req: Request, res: Response) => {
  const result = cardCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { columnId, parentId, sprintId, type, visibility, restrictedToRole, title, description, priority, tag, dueDate, assignee, estimate, subtasks } = result.data;

  const colCtx = getColumnContext(columnId);
  if (!colCtx) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: colCtx.board_id })) {
    res.status(403).json({ error: 'Você não tem permissão para criar cartões neste quadro.' });
    return;
  }

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
  const sanitizedEstimate = estimate !== undefined && estimate !== null && estimate.trim() !== '' ? estimate.trim() : null;
  const sanitizedSprintId = sprintId !== undefined && sprintId !== null && sprintId.trim() !== '' ? sprintId.trim() : null;
  const sanitizedVisibility = visibility || 'NORMAL';
  const sanitizedRestrictedRole = restrictedToRole !== undefined && restrictedToRole !== null && restrictedToRole.trim() !== '' ? restrictedToRole.trim() : null;

  run(
    `INSERT INTO cards (id, column_id, parent_id, sprint_id, type, visibility, restricted_to_role, title, description, priority, tag, due_date, position, assignee, estimate, is_archived)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [cardId, columnId, parentId || null, sanitizedSprintId, type, sanitizedVisibility, sanitizedRestrictedRole, title.trim(), description.trim(), priority, tag.trim(), dueDate || null, position, sanitizedAssignee, sanitizedEstimate]
  );

  // Se o sprint de destino estiver ACTIVE, registra em sprint_items
  if (sanitizedSprintId) {
    const sCtx = queryOne<{ status: string }>('SELECT status FROM sprints WHERE id = ?', [sanitizedSprintId]);
    if (sCtx && sCtx.status === 'ACTIVE') {
      run(
        `INSERT INTO sprint_items (sprint_id, card_id, planned, initial_estimate, completed, added_at)
         VALUES (?, ?, 0, ?, 0, datetime('now'))
         ON CONFLICT(sprint_id, card_id) DO NOTHING`,
        [sanitizedSprintId, cardId, sanitizedEstimate]
      );
    }
  }

  logCardEvent({ cardId, userId, eventType: 'CARD_CREATED' });

  logAudit({
    workspaceId: colCtx.workspace_id,
    boardId: colCtx.board_id,
    userId,
    action: 'CARD_CREATED',
    targetType: 'CARD',
    targetId: cardId,
    details: { title: title.trim(), type, priority, estimate: sanitizedEstimate, sprintId: sanitizedSprintId },
  });

  if (sanitizedAssignee) {
    dispatchCardEventNotifications({
      actorId: userId,
      actorName: req.user!.name,
      eventType: 'CARD_ASSIGNED',
      boardId: colCtx.board_id,
      cardId,
      cardTitle: title.trim(),
      cardAssignee: sanitizedAssignee,
      title: `Novo cartão atribuído: ${title.trim()}`,
      message: `${req.user!.name} criou o cartão "${title.trim()}" e atribuiu a ${sanitizedAssignee}.`,
      contentForMentions: `${title} ${description}`,
    });
  }

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
    sprint_id: sanitizedSprintId,
    type,
    title: title.trim(),
    description: description.trim(),
    priority,
    tag: tag.trim(),
    due_date: dueDate || null,
    position,
    assignee: sanitizedAssignee,
    estimate: sanitizedEstimate,
    subtasks: createdSubtasks,
    children: [],
    progress: {
      total: createdSubtasks.length,
      completed: createdSubtasks.filter(s => s.done).length,
      percent: createdSubtasks.length > 0
        ? Math.round((createdSubtasks.filter(s => s.done).length / createdSubtasks.length) * 100)
        : 0,
    },
    comments_count: 0,
    attachments_count: 0,
    is_blocked: false,
    blocked_by: [],
    blocks: [],
    is_archived: false,
    archived_at: null,
  };

  res.status(201).json(newCard);
});

// PATCH /api/cards/:id (CD-03, CD-04, CD-08, BD-04, SP-02)
router.patch('/:id', (req: Request, res: Response) => {
  const result = cardUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id);
  if (!cardCtx) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Você não tem permissão para editar cartões neste quadro.' });
    return;
  }

  const current = queryOne<any>('SELECT * FROM cards WHERE id = ?', [id]);
  const newType: CardType = result.data.type !== undefined ? result.data.type : (current.type || 'TASK');
  const newParentId = result.data.parentId !== undefined ? (result.data.parentId || null) : current.parent_id;
  const newSprintId = result.data.sprintId !== undefined
    ? (result.data.sprintId && result.data.sprintId.trim() !== '' ? result.data.sprintId.trim() : null)
    : current.sprint_id;

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
  const newEstimate = result.data.estimate !== undefined
    ? (result.data.estimate && result.data.estimate.trim() !== '' ? result.data.estimate.trim() : null)
    : current.estimate;
  const newVisibility = result.data.visibility !== undefined ? result.data.visibility : (current.visibility || 'NORMAL');
  const newRestrictedToRole = result.data.restrictedToRole !== undefined
    ? (result.data.restrictedToRole && result.data.restrictedToRole.trim() !== '' ? result.data.restrictedToRole.trim() : null)
    : current.restricted_to_role;

  run(
    `UPDATE cards 
     SET title = ?, description = ?, priority = ?, tag = ?, due_date = ?, assignee = ?, estimate = ?, type = ?, visibility = ?, restricted_to_role = ?, parent_id = ?, sprint_id = ?
     WHERE id = ?`,
    [newTitle, newDesc, newPriority, newTag, newDueDate, newAssignee, newEstimate, newType, newVisibility, newRestrictedToRole, newParentId, newSprintId, id]
  );

  // Se foi atribuído a um sprint ACTIVE durante o sprint, adiciona no snapshot
  if (newSprintId && newSprintId !== current.sprint_id) {
    const sCtx = queryOne<{ status: string }>('SELECT status FROM sprints WHERE id = ?', [newSprintId]);
    if (sCtx && sCtx.status === 'ACTIVE') {
      run(
        `INSERT INTO sprint_items (sprint_id, card_id, planned, initial_estimate, completed, added_at)
         VALUES (?, ?, 0, ?, 0, datetime('now'))
         ON CONFLICT(sprint_id, card_id) DO NOTHING`,
        [newSprintId, id, newEstimate]
      );
    }
  }

  logAudit({
    workspaceId: cardCtx.workspace_id,
    boardId: cardCtx.board_id,
    userId,
    action: 'CARD_UPDATED',
    targetType: 'CARD',
    targetId: id,
    details: { title: newTitle, type: newType, priority: newPriority, assignee: newAssignee, estimate: newEstimate, sprintId: newSprintId, visibility: newVisibility },
  });

  if (newAssignee && newAssignee !== current.assignee) {
    dispatchCardEventNotifications({
      actorId: userId,
      actorName: req.user!.name,
      eventType: 'CARD_ASSIGNED',
      boardId: cardCtx.board_id,
      cardId: id,
      cardTitle: newTitle,
      cardAssignee: newAssignee,
      title: `Cartão atribuído: ${newTitle}`,
      message: `${req.user!.name} atribuiu o cartão "${newTitle}" a ${newAssignee}.`,
      contentForMentions: newDesc,
    });
  }

  const updatedSubtasks = queryAll<{ id: string; card_id: string; title: string; done: number; position: number }>(
    'SELECT id, card_id, title, done, position FROM subtasks WHERE card_id = ? ORDER BY position ASC',
    [id]
  ).map(st => ({ ...st, done: Boolean(st.done) }));

  res.json({
    id,
    column_id: current.column_id,
    parent_id: newParentId,
    sprint_id: newSprintId,
    type: newType,
    visibility: newVisibility,
    restricted_to_role: newRestrictedToRole,
    title: newTitle,
    description: newDesc,
    priority: newPriority,
    tag: newTag,
    due_date: newDueDate,
    position: current.position,
    assignee: newAssignee,
    estimate: newEstimate,
    subtasks: updatedSubtasks,
    is_archived: Boolean(current.is_archived),
    archived_at: current.archived_at,
  });
});

// GET /api/cards/timer/active (TM-01: Timer ativo do usuário)
router.get('/timer/active', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const activeTimer = queryOne<{
    id: string;
    card_id: string;
    started_at: string;
    card_title: string;
    board_id: string;
  }>(`
    SELECT t.id, t.card_id, t.started_at, c.title as card_title, col.board_id
    FROM active_card_timers t
    JOIN cards c ON c.id = t.card_id
    JOIN columns col ON col.id = c.column_id
    WHERE t.user_id = ?
    LIMIT 1
  `, [userId]);

  res.json(activeTimer || null);
});

// GET /api/cards/:id/time-logs (TM-01 & TM-02: Lista registros de horas e cálculo de desvio)
router.get('/:id/time-logs', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id, true);
  if (!cardCtx || !can(userId, 'board:view', { type: 'board', id: cardCtx.board_id })) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const logs = queryAll<{
    id: string;
    card_id: string;
    user_id: string;
    user_name: string;
    duration_seconds: number;
    notes: string;
    log_date: string;
    started_at: string | null;
    ended_at: string | null;
    created_at: string;
  }>(`
    SELECT tl.id, tl.card_id, tl.user_id, u.name as user_name, tl.duration_seconds,
           tl.notes, tl.log_date, tl.started_at, tl.ended_at, tl.created_at
    FROM card_time_logs tl
    JOIN users u ON u.id = tl.user_id
    WHERE tl.card_id = ?
    ORDER BY tl.created_at DESC
  `, [id]);

  const totalSeconds = logs.reduce((acc, curr) => acc + curr.duration_seconds, 0);
  const totalHours = totalSeconds / 3600;

  const card = queryOne<{ estimate: string | null }>('SELECT estimate FROM cards WHERE id = ?', [id]);
  const estimatedHours = parseEstimateToHours(card?.estimate);

  let deviationHours: number | null = null;
  let deviationPercent: number | null = null;
  if (estimatedHours > 0) {
    deviationHours = Math.round((totalHours - estimatedHours) * 10) / 10;
    deviationPercent = Math.round(((totalHours - estimatedHours) / estimatedHours) * 100);
  }

  const activeTimer = queryOne<{ id: string; card_id: string; user_id: string; started_at: string }>(
    'SELECT id, card_id, user_id, started_at FROM active_card_timers WHERE card_id = ? AND user_id = ?',
    [id, userId]
  );

  res.json({
    logs,
    totalSeconds,
    totalHours: Math.round(totalHours * 100) / 100,
    estimatedHours,
    deviationHours,
    deviationPercent,
    activeTimer: activeTimer || null,
  });
});

// POST /api/cards/:id/time-logs (TM-01: Lançamento manual de horas)
router.post('/:id/time-logs', (req: Request, res: Response) => {
  const parsed = timeLogCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;
  const { durationSeconds, notes, logDate } = parsed.data;

  const cardCtx = getCardContext(id);
  if (!cardCtx || !can(userId, 'board:edit_content', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para registrar tempo neste cartão.' });
    return;
  }

  const logId = crypto.randomUUID();
  const dateStr = logDate || new Date().toISOString().split('T')[0];

  run(
    `INSERT INTO card_time_logs (id, card_id, user_id, duration_seconds, notes, log_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    [logId, id, userId, durationSeconds, notes || '', dateStr]
  );

  const hoursStr = (durationSeconds / 3600).toFixed(1);
  logCardEvent({
    cardId: id,
    userId,
    eventType: 'TIME_LOGGED',
    toValue: `${hoursStr}h lançadas: ${notes || 'Sem descrição'}`,
  });

  logAudit({
    workspaceId: cardCtx.workspace_id,
    boardId: cardCtx.board_id,
    userId,
    action: 'TIME_LOGGED',
    targetType: 'CARD',
    targetId: id,
    details: { durationSeconds, hours: hoursStr, notes },
  });

  res.status(201).json({
    id: logId,
    card_id: id,
    user_id: userId,
    user_name: req.user!.name,
    duration_seconds: durationSeconds,
    notes: notes || '',
    log_date: dateStr,
    created_at: new Date().toISOString(),
  });
});

// DELETE /api/cards/:id/time-logs/:logId (TM-01: Excluir registro de horas)
router.delete('/:id/time-logs/:logId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, logId } = req.params;

  const cardCtx = getCardContext(id);
  if (!cardCtx) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const log = queryOne<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM card_time_logs WHERE id = ? AND card_id = ?',
    [logId, id]
  );

  if (!log) {
    res.status(404).json({ error: 'Registro de tempo não encontrado.' });
    return;
  }

  if (log.user_id !== userId && !can(userId, 'board:edit_content', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para excluir este registro de tempo.' });
    return;
  }

  run('DELETE FROM card_time_logs WHERE id = ?', [logId]);
  res.json({ message: 'Registro de tempo removido com sucesso.' });
});

// POST /api/cards/:id/timer/start (TM-01: Iniciar cronômetro no cartão)
router.post('/:id/timer/start', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id);
  if (!cardCtx || !can(userId, 'board:edit_content', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para acionar timer neste cartão.' });
    return;
  }

  // Se já houver timer rodando em outro cartão, fecha e salva automaticamente
  const existingTimer = queryOne<{ id: string; card_id: string; started_at: string }>(
    'SELECT id, card_id, started_at FROM active_card_timers WHERE user_id = ?',
    [userId]
  );

  if (existingTimer) {
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - new Date(existingTimer.started_at).getTime()) / 1000));
    if (elapsedSeconds >= 10) {
      run(
        `INSERT INTO card_time_logs (id, card_id, user_id, duration_seconds, notes, log_date, started_at, ended_at, created_at)
         VALUES (?, ?, ?, ?, ?, date('now'), ?, datetime('now'), datetime('now'))`,
        [crypto.randomUUID(), existingTimer.card_id, userId, elapsedSeconds, 'Registro automático ao trocar de timer', existingTimer.started_at]
      );
    }
    run('DELETE FROM active_card_timers WHERE id = ?', [existingTimer.id]);
  }

  const timerId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  run(
    'INSERT INTO active_card_timers (id, card_id, user_id, started_at) VALUES (?, ?, ?, ?)',
    [timerId, id, userId, startedAt]
  );

  res.json({
    active: true,
    timerId,
    cardId: id,
    cardTitle: cardCtx.title,
    startedAt,
  });
});

// POST /api/cards/:id/timer/stop (TM-01: Parar cronômetro no cartão)
router.post('/:id/timer/stop', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const parsed = timerStopSchema.safeParse(req.body);
  const notes = parsed.success ? parsed.data.notes : '';

  const activeTimer = queryOne<{ id: string; started_at: string }>(
    'SELECT id, started_at FROM active_card_timers WHERE card_id = ? AND user_id = ?',
    [id, userId]
  );

  if (!activeTimer) {
    res.status(400).json({ error: 'Nenhum timer ativo para este cartão.' });
    return;
  }

  const elapsedSeconds = Math.max(1, Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 1000));
  const logId = crypto.randomUUID();

  run(
    `INSERT INTO card_time_logs (id, card_id, user_id, duration_seconds, notes, log_date, started_at, ended_at, created_at)
     VALUES (?, ?, ?, ?, ?, date('now'), ?, datetime('now'), datetime('now'))`,
    [logId, id, userId, elapsedSeconds, notes || 'Tempo gravado pelo cronômetro', activeTimer.started_at]
  );

  run('DELETE FROM active_card_timers WHERE id = ?', [activeTimer.id]);

  res.json({
    stopped: true,
    durationSeconds: elapsedSeconds,
    logId,
  });
});

// GET /api/cards/:id/children (CD-03: Lista cartões-filhos de um cartão)
router.get('/:id/children', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id, true);
  if (!cardCtx || !can(userId, 'board:view', { type: 'board', id: cardCtx.board_id })) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const children = queryAll<any>(
    `SELECT cd.id, cd.column_id, cd.parent_id, cd.type, cd.title, cd.description, cd.priority,
            cd.tag, cd.due_date, cd.position, cd.assignee, cd.estimate, col.title as column_title
     FROM cards cd
     JOIN columns col ON col.id = cd.column_id
     WHERE cd.parent_id = ? AND (cd.is_archived = 0 OR cd.is_archived IS NULL)
     ORDER BY cd.position ASC`,
    [id]
  );

  res.json(children);
});

// GET /api/cards/:id/comments (CD-02: Lista comentários do cartão)
router.get('/:id/comments', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id, true);
  if (!cardCtx || !can(userId, 'board:view', { type: 'board', id: cardCtx.board_id })) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const comments = queryAll<CardComment>(
    `SELECT cm.id, cm.card_id, cm.user_id, u.name as user_name, cm.content, cm.created_at
     FROM card_comments cm
     JOIN users u ON u.id = cm.user_id
     WHERE cm.card_id = ?
     ORDER BY cm.created_at ASC`,
    [id]
  );

  res.json(comments);
});

// POST /api/cards/:id/comments (CD-02: Adiciona comentário no cartão - permitido para OWNER, EDITOR e COMMENTER)
router.post('/:id/comments', (req: Request, res: Response) => {
  const result = commentCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Comentário inválido.' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id);
  if (!cardCtx) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  if (!can(userId, 'board:comment', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Seu papel neste quadro (Leitor) não permite adicionar comentários.' });
    return;
  }

  const commentId = crypto.randomUUID();
  const content = result.data.content.trim();

  run(
    `INSERT INTO card_comments (id, card_id, user_id, content, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [commentId, id, userId, content]
  );

  logCardEvent({ cardId: id, userId, eventType: 'COMMENT_ADDED', toValue: content.substring(0, 80) });

  dispatchCardEventNotifications({
    actorId: userId,
    actorName: req.user!.name,
    eventType: 'COMMENT_ADDED',
    boardId: cardCtx.board_id,
    cardId: id,
    cardTitle: cardCtx.title,
    cardAssignee: cardCtx.assignee,
    title: `Comentário em "${cardCtx.title}"`,
    message: `${req.user!.name} comentou: "${content.substring(0, 120)}"`,
    contentForMentions: content,
  });

  res.status(201).json({
    id: commentId,
    card_id: id,
    user_id: userId,
    user_name: req.user!.name,
    content,
    created_at: new Date().toISOString(),
  });
});

// DELETE /api/cards/:id/comments/:commentId (CD-02: Remove comentário)
router.delete('/:id/comments/:commentId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, commentId } = req.params;

  const cardCtx = getCardContext(id);
  if (!cardCtx) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const comment = queryOne<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM card_comments WHERE id = ? AND card_id = ?',
    [commentId, id]
  );

  if (!comment) {
    res.status(404).json({ error: 'Comentário não encontrado.' });
    return;
  }

  if (comment.user_id !== userId && !can(userId, 'board:edit_content', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para excluir este comentário.' });
    return;
  }

  run('DELETE FROM card_comments WHERE id = ?', [commentId]);
  res.json({ message: 'Comentário removido com sucesso.' });
});

// GET /api/cards/:id/attachments (CD-02: Lista anexos do cartão)
router.get('/:id/attachments', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id, true);
  if (!cardCtx || !can(userId, 'board:view', { type: 'board', id: cardCtx.board_id })) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const attachments = queryAll<CardAttachment>(
    `SELECT att.id, att.card_id, att.user_id, u.name as user_name, att.name, att.url, att.size_bytes, att.mime_type, att.created_at
     FROM card_attachments att
     JOIN users u ON u.id = att.user_id
     WHERE att.card_id = ?
     ORDER BY att.created_at DESC`,
    [id]
  );

  res.json(attachments);
});

// POST /api/cards/:id/attachments (CD-02: Adiciona anexo ao cartão)
router.post('/:id/attachments', (req: Request, res: Response) => {
  const result = attachmentCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados de anexo inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id);
  if (!cardCtx) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  if (!can(userId, 'board:comment', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para adicionar anexos neste cartão.' });
    return;
  }

  const attachmentId = crypto.randomUUID();
  const { name, url, sizeBytes, mimeType } = result.data;

  run(
    `INSERT INTO card_attachments (id, card_id, user_id, name, url, size_bytes, mime_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [attachmentId, id, userId, name.trim(), url, sizeBytes, mimeType]
  );

  logCardEvent({ cardId: id, userId, eventType: 'ATTACHMENT_ADDED', toValue: name.trim() });

  dispatchCardEventNotifications({
    actorId: userId,
    actorName: req.user!.name,
    eventType: 'ATTACHMENT_ADDED',
    boardId: cardCtx.board_id,
    cardId: id,
    cardTitle: cardCtx.title,
    cardAssignee: cardCtx.assignee,
    title: `Anexo adicionado em "${cardCtx.title}"`,
    message: `${req.user!.name} anexou "${name.trim()}" ao cartão "${cardCtx.title}".`,
  });

  res.status(201).json({
    id: attachmentId,
    card_id: id,
    user_id: userId,
    user_name: req.user!.name,
    name: name.trim(),
    url,
    size_bytes: sizeBytes,
    mime_type: mimeType,
    created_at: new Date().toISOString(),
  });
});

// DELETE /api/cards/:id/attachments/:attachmentId (CD-02: Remove anexo do cartão)
router.delete('/:id/attachments/:attachmentId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, attachmentId } = req.params;

  const cardCtx = getCardContext(id);
  if (!cardCtx) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para remover anexos neste quadro.' });
    return;
  }

  run('DELETE FROM card_attachments WHERE id = ? AND card_id = ?', [attachmentId, id]);
  res.json({ message: 'Anexo removido com sucesso.' });
});

// GET /api/cards/:id/relations (CD-06: Lista relações de entrada e saída do cartão)
router.get('/:id/relations', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id, true);
  if (!cardCtx || !can(userId, 'board:view', { type: 'board', id: cardCtx.board_id })) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const relations = queryAll<CardRelation>(
    `SELECT r.id, r.source_card_id, c1.title as source_card_title,
            r.target_card_id, c2.title as target_card_title,
            col2.title as target_column_title,
            r.relation_type, r.created_at
     FROM card_relations r
     JOIN cards c1 ON c1.id = r.source_card_id
     JOIN cards c2 ON c2.id = r.target_card_id
     LEFT JOIN columns col2 ON col2.id = c2.column_id
     WHERE r.source_card_id = ? OR r.target_card_id = ?
     ORDER BY r.created_at DESC`,
    [id, id]
  );

  res.json(relations);
});

// POST /api/cards/:id/relations (CD-06: Cria relação entre cartões com detecção de ciclos em bloqueios)
router.post('/:id/relations', (req: Request, res: Response) => {
  const result = relationCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const sourceCardId = req.params.id;
  const { targetCardId, relationType } = result.data;

  if (sourceCardId === targetCardId) {
    res.status(400).json({ error: 'Um cartão não pode ter relação consigo mesmo.' });
    return;
  }

  const sourceCtx = getCardContext(sourceCardId);
  const targetCtx = getCardContext(targetCardId);

  if (!sourceCtx || !targetCtx) {
    res.status(404).json({ error: 'Cartão de origem ou destino não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: sourceCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para criar relações neste quadro.' });
    return;
  }

  // CD-06: Detecção de ciclos se a relação for de bloqueio (BLOCKS)
  if (relationType === 'BLOCKS') {
    if (hasBlockingCycle(sourceCardId, targetCardId)) {
      res.status(400).json({
        error: 'Ciclo de bloqueio detectado: esta relação criaria uma dependência circular de bloqueio entre os cartões.',
      });
      return;
    }
  }

  const existing = queryOne<{ id: string }>(
    'SELECT id FROM card_relations WHERE source_card_id = ? AND target_card_id = ? AND relation_type = ?',
    [sourceCardId, targetCardId, relationType]
  );

  if (existing) {
    res.status(400).json({ error: 'Esta relação entre os cartões já existe.' });
    return;
  }

  const relationId = crypto.randomUUID();
  run(
    `INSERT INTO card_relations (id, source_card_id, target_card_id, relation_type, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [relationId, sourceCardId, targetCardId, relationType, userId]
  );

  logAudit({
    workspaceId: sourceCtx.workspace_id,
    boardId: sourceCtx.board_id,
    userId,
    action: 'CARD_RELATION_ADDED',
    targetType: 'CARD_RELATION',
    targetId: relationId,
    details: {
      sourceCardTitle: sourceCtx.title,
      targetCardTitle: targetCtx.title,
      relationType,
    },
  });

  res.status(201).json({
    id: relationId,
    source_card_id: sourceCardId,
    source_card_title: sourceCtx.title,
    target_card_id: targetCardId,
    target_card_title: targetCtx.title,
    relation_type: relationType,
  });
});

// CD-11: Desbloqueio automático com notificação ao responsável
function checkAndNotifyUnblockedCard(targetCardId: string, actorId: string, actorName: string, boardId: string) {
  const targetCard = queryOne<{ id: string; title: string; assignee: string | null }>(
    'SELECT id, title, assignee FROM cards WHERE id = ? AND (is_archived = 0 OR is_archived IS NULL)',
    [targetCardId]
  );
  if (!targetCard) return;

  const remainingBlockers = queryAll<{ id: string; title: string }>(`
    SELECT c.id, c.title
    FROM card_relations r
    JOIN cards c ON c.id = r.source_card_id
    JOIN columns col ON col.id = c.column_id
    WHERE r.target_card_id = ?
      AND r.relation_type = 'BLOCKS'
      AND (c.is_archived = 0 OR c.is_archived IS NULL)
      AND NOT (LOWER(col.title) LIKE '%conclu%' OR LOWER(col.title) LIKE '%done%')
  `, [targetCardId]);

  if (remainingBlockers.length === 0) {
    logCardEvent({
      cardId: targetCard.id,
      userId: actorId,
      eventType: 'CARD_UNBLOCKED',
      toValue: 'Desbloqueado automaticamente',
    });

    dispatchCardEventNotifications({
      actorId,
      actorName,
      eventType: 'CARD_UNBLOCKED',
      boardId,
      cardId: targetCard.id,
      cardTitle: targetCard.title,
      cardAssignee: targetCard.assignee,
      title: `Cartão Desbloqueado: ${targetCard.title}`,
      message: `O cartão "${targetCard.title}" foi desbloqueado pois as dependências de bloqueio foram resolvidas.`,
    });
  }
}

function checkAndNotifyAllUnblockedByCard(completedCardId: string, actorId: string, actorName: string, boardId: string) {
  const relations = queryAll<{ target_card_id: string }>(
    "SELECT target_card_id FROM card_relations WHERE source_card_id = ? AND relation_type = 'BLOCKS'",
    [completedCardId]
  );
  for (const rel of relations) {
    checkAndNotifyUnblockedCard(rel.target_card_id, actorId, actorName, boardId);
  }
}

// DELETE /api/cards/:id/relations/:relationId (CD-06: Remove relação entre cartões)
router.delete('/:id/relations/:relationId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, relationId } = req.params;

  const cardCtx = getCardContext(id);
  if (!cardCtx) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para remover relações neste quadro.' });
    return;
  }

  const existingRel = queryOne<{ target_card_id: string; relation_type: string }>(
    'SELECT target_card_id, relation_type FROM card_relations WHERE id = ?',
    [relationId]
  );

  run('DELETE FROM card_relations WHERE id = ? AND (source_card_id = ? OR target_card_id = ?)', [relationId, id, id]);

  // CD-11: Se era relação de bloqueio, verifica se o cartão destino foi desbloqueado
  if (existingRel && existingRel.relation_type === 'BLOCKS') {
    checkAndNotifyUnblockedCard(existingRel.target_card_id, userId, req.user!.name, cardCtx.board_id);
  }

  res.json({ message: 'Relação removida com sucesso.' });
});

// DELETE /api/cards/:id (TD-02: Soft delete / Arquivamento padrão)
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const permanent = req.query.permanent === 'true';

  const cardCtx = getCardContext(id, true);
  if (!cardCtx) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para arquivar ou excluir cartões neste quadro.' });
    return;
  }

  if (permanent) {
    run('DELETE FROM cards WHERE id = ?', [id]);
    logAudit({
      workspaceId: cardCtx.workspace_id,
      boardId: cardCtx.board_id,
      userId,
      action: 'CARD_DELETED',
      targetType: 'CARD',
      targetId: id,
      details: { title: cardCtx.title },
    });
    res.json({ message: 'Cartão excluído permanentemente.' });
  } else {
    run("UPDATE cards SET is_archived = 1, archived_at = datetime('now') WHERE id = ?", [id]);
    logCardEvent({ cardId: id, userId, eventType: 'ARCHIVED' });
    logAudit({
      workspaceId: cardCtx.workspace_id,
      boardId: cardCtx.board_id,
      userId,
      action: 'CARD_ARCHIVED',
      targetType: 'CARD',
      targetId: id,
      details: { title: cardCtx.title },
    });
    res.json({ message: 'Cartão arquivado com sucesso.' });
  }
});

// POST /api/cards/:id/restore (TD-02: Restaurar cartão arquivado)
router.post('/:id/restore', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id, true);
  if (!cardCtx) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para restaurar cartões neste quadro.' });
    return;
  }

  run('UPDATE cards SET is_archived = 0, archived_at = NULL WHERE id = ?', [id]);
  logCardEvent({ cardId: id, userId, eventType: 'RESTORED' });
  res.json({ message: 'Cartão restaurado com sucesso.' });
});

// GET /api/cards/:id/open-children (CD-10: Verifica filhos em aberto antes de fechar)
router.get('/:id/open-children', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const cardCtx = getCardContext(id);
  if (!cardCtx || !can(userId, 'board:view', { type: 'board', id: cardCtx.board_id })) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const openChildren = queryAll<{ id: string; title: string; column_title: string; type: string }>(`
    SELECT cd.id, cd.title, c.title as column_title, cd.type
    FROM cards cd
    JOIN columns c ON c.id = cd.column_id
    WHERE cd.parent_id = ? 
      AND (cd.is_archived = 0 OR cd.is_archived IS NULL)
      AND NOT (LOWER(c.title) LIKE '%conclu%' OR LOWER(c.title) LIKE '%done%')
  `, [id]);

  res.json({
    hasOpenChildren: openChildren.length > 0,
    count: openChildren.length,
    openChildren,
  });
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
  const { targetColumnId, newPosition, force } = result.data;

  const cardCtx = getCardContext(id);
  if (!cardCtx) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const targetCol = getColumnContext(targetColumnId);
  if (!targetCol) {
    res.status(404).json({ error: 'Coluna destino não encontrada.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: cardCtx.board_id })) {
    res.status(403).json({ error: 'Você não tem permissão para mover cartões neste quadro.' });
    return;
  }

  const isDoneColumn = /conclu[ií]d/i.test(targetCol.title) || /done/i.test(targetCol.title);

  // CD-10: Regras de fechamento do pai (avisar ou bloquear com filhos abertos)
  if (isDoneColumn && !force) {
    const openChildren = queryAll<{ id: string; title: string; column_title: string }>(`
      SELECT cd.id, cd.title, c.title as column_title
      FROM cards cd
      JOIN columns c ON c.id = cd.column_id
      WHERE cd.parent_id = ? 
        AND (cd.is_archived = 0 OR cd.is_archived IS NULL)
        AND NOT (LOWER(c.title) LIKE '%conclu%' OR LOWER(c.title) LIKE '%done%')
    `, [id]);

    if (openChildren.length > 0) {
      res.status(409).json({
        error: 'Existem cartões filhos em aberto.',
        requiresConfirmation: true,
        openChildren,
        message: `Este cartão possui ${openChildren.length} item(ns) filho(s) ainda não concluído(s): ${openChildren.map(c => c.title).slice(0, 3).join(', ')}${openChildren.length > 3 ? '...' : ''}. Deseja fechar mesmo assim?`,
      });
      return;
    }
  }

  db.exec('BEGIN TRANSACTION');
  try {
    const isSameColumn = cardCtx.column_id === targetColumnId;

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
        [cardCtx.column_id, id]
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

      logCardEvent({
        cardId: id,
        userId,
        eventType: 'COLUMN_CHANGE',
        fromColumnId: cardCtx.column_id,
        toColumnId: targetColumnId,
      });

      logAudit({
        workspaceId: cardCtx.workspace_id,
        boardId: cardCtx.board_id,
        userId,
        action: 'CARD_MOVED',
        targetType: 'CARD',
        targetId: id,
        details: { title: cardCtx.title, fromColumnId: cardCtx.column_id, toColumnId: targetColumnId },
      });

      dispatchCardEventNotifications({
        actorId: userId,
        actorName: req.user!.name,
        eventType: 'CARD_MOVED',
        boardId: cardCtx.board_id,
        cardId: id,
        cardTitle: cardCtx.title,
        cardAssignee: cardCtx.assignee,
        title: `Cartão movido: ${cardCtx.title}`,
        message: `${req.user!.name} moveu "${cardCtx.title}" para a coluna "${targetCol.title}".`,
      });

      // CD-11: Se movido para coluna de conclusão, verifica se desbloqueia cartões dependentes
      if (isDoneColumn) {
        checkAndNotifyAllUnblockedByCard(id, userId, req.user!.name, cardCtx.board_id);
      }

      // TM-04: Timer automático opcional (opt-in)
      const notifSettings = queryOne<{ auto_timer_enabled: number }>(
        'SELECT auto_timer_enabled FROM user_notification_settings WHERE user_id = ?',
        [userId]
      );

      if (notifSettings && notifSettings.auto_timer_enabled) {
        const isDoingCol = /andamento/i.test(targetCol.title) || /doing/i.test(targetCol.title) || /progress/i.test(targetCol.title) || /progresso/i.test(targetCol.title);
        if (isDoingCol) {
          const hasTimer = queryOne<{ id: string }>(
            'SELECT id FROM active_card_timers WHERE user_id = ? AND card_id = ?',
            [userId, id]
          );
          if (!hasTimer) {
            run(
              'INSERT OR REPLACE INTO active_card_timers (id, card_id, user_id, started_at) VALUES (?, ?, ?, datetime("now"))',
              [crypto.randomUUID(), id, userId]
            );
          }
        } else if (isDoneColumn) {
          const activeTimer = queryOne<{ id: string; started_at: string }>(
            'SELECT id, started_at FROM active_card_timers WHERE user_id = ? AND card_id = ?',
            [userId, id]
          );
          if (activeTimer) {
            const elapsed = Math.max(1, Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 1000));
            run(
              `INSERT INTO card_time_logs (id, card_id, user_id, duration_seconds, notes, log_date, started_at, ended_at, created_at)
               VALUES (?, ?, ?, ?, 'Finalizado automaticamente ao concluir', date('now'), ?, datetime('now'), datetime('now'))`,
              [crypto.randomUUID(), id, userId, elapsed, activeTimer.started_at]
            );
            run('DELETE FROM active_card_timers WHERE id = ?', [activeTimer.id]);
          }
        }
      }
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

  const cardCtx = getCardContext(id, true);
  if (!cardCtx || !can(userId, 'board:view', { type: 'board', id: cardCtx.board_id })) {
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
