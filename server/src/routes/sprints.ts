import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, queryAll, run, db, logAudit } from '../db.js';
import { Sprint, SprintReport, SprintStatus, SprintRetroItem, RetroCategory } from '../types.js';
import { can } from '../permissions/can.js';

const router = Router();
router.use(requireAuth);

const sprintCreateSchema = z.object({
  boardId: z.string().min(1, 'O ID do quadro é obrigatório.'),
  name: z.string().min(1, 'O nome do sprint é obrigatório.'),
  goal: z.string().optional().default(''),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

const sprintUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  goal: z.string().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

const sprintCloseSchema = z.object({
  moveToNextSprintId: z.string().nullable().optional(),
  moveToBacklog: z.boolean().optional().default(true),
});

const assignCardsSchema = z.object({
  sprintId: z.string().nullable(),
  cardIds: z.array(z.string()).min(1, 'Selecione ao menos um cartão.'),
});

function getBoardContext(boardId: string) {
  return queryOne<{ id: string; workspace_id: string; title: string }>(
    'SELECT id, workspace_id, title FROM boards WHERE id = ? AND (is_archived = 0 OR is_archived IS NULL)',
    [boardId]
  );
}

function getSprintContext(sprintId: string) {
  return queryOne<{ id: string; board_id: string; workspace_id: string; status: SprintStatus; name: string }>(
    `SELECT s.id, s.board_id, b.workspace_id, s.status, s.name
     FROM sprints s
     JOIN boards b ON b.id = s.board_id
     WHERE s.id = ?`,
    [sprintId]
  );
}

function getDoneColumnIds(boardId: string): Set<string> {
  const cols = queryAll<{ id: string; title: string; position: number }>(
    'SELECT id, title, position FROM columns WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL) ORDER BY position ASC',
    [boardId]
  );
  const doneIds = new Set(
    cols.filter(c => /conclu[ií]d/i.test(c.title) || /done/i.test(c.title)).map(c => c.id)
  );
  if (doneIds.size === 0 && cols.length > 0) {
    const maxCol = cols.reduce((prev, curr) => (curr.position > prev.position ? curr : prev));
    doneIds.add(maxCol.id);
  }
  return doneIds;
}

// GET /api/sprints?boardId=:boardId (SP-01, SP-02: Lista sprints do quadro com contadores)
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const boardId = req.query.boardId as string;

  if (!boardId) {
    res.status(400).json({ error: 'Parâmetro boardId é obrigatório.' });
    return;
  }

  const boardCtx = getBoardContext(boardId);
  if (!boardCtx || !can(userId, 'board:view', { type: 'board', id: boardId })) {
    res.status(404).json({ error: 'Quadro não encontrado ou sem permissão.' });
    return;
  }

  const doneColIds = getDoneColumnIds(boardId);

  const sprints = queryAll<any>(
    `SELECT id, board_id, name, goal, start_date, end_date, status, created_at, started_at, completed_at
     FROM sprints
     WHERE board_id = ?
     ORDER BY CASE status WHEN 'ACTIVE' THEN 1 WHEN 'PLANNING' THEN 2 ELSE 3 END, created_at DESC`,
    [boardId]
  );

  const cardsInBoard = queryAll<{ id: string; sprint_id: string | null; column_id: string }>(
    'SELECT id, sprint_id, column_id FROM cards WHERE column_id IN (SELECT id FROM columns WHERE board_id = ?) AND (is_archived = 0 OR is_archived IS NULL)',
    [boardId]
  );

  const totalCardsBySprint = new Map<string, number>();
  const completedCardsBySprint = new Map<string, number>();

  for (const c of cardsInBoard) {
    if (c.sprint_id) {
      totalCardsBySprint.set(c.sprint_id, (totalCardsBySprint.get(c.sprint_id) || 0) + 1);
      if (doneColIds.has(c.column_id)) {
        completedCardsBySprint.set(c.sprint_id, (completedCardsBySprint.get(c.sprint_id) || 0) + 1);
      }
    }
  }

  const result: Sprint[] = sprints.map(s => ({
    ...s,
    total_cards: totalCardsBySprint.get(s.id) || 0,
    completed_cards: completedCardsBySprint.get(s.id) || 0,
  }));

  res.json(result);
});

// POST /api/sprints (SP-01: Cria novo sprint em PLANNING)
router.post('/', (req: Request, res: Response) => {
  const result = sprintCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { boardId, name, goal, startDate, endDate } = result.data;

  const boardCtx = getBoardContext(boardId);
  if (!boardCtx) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Você não tem permissão para criar sprints neste quadro.' });
    return;
  }

  const sprintId = crypto.randomUUID();
  run(
    `INSERT INTO sprints (id, board_id, name, goal, start_date, end_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PLANNING', datetime('now'))`,
    [sprintId, boardId, name.trim(), goal?.trim() || '', startDate || null, endDate || null]
  );

  logAudit({
    workspaceId: boardCtx.workspace_id,
    boardId,
    userId,
    action: 'SPRINT_CREATED',
    targetType: 'SPRINT',
    targetId: sprintId,
    details: { name: name.trim(), goal, startDate, endDate },
  });

  const created: Sprint = {
    id: sprintId,
    board_id: boardId,
    name: name.trim(),
    goal: goal?.trim() || '',
    start_date: startDate || null,
    end_date: endDate || null,
    status: 'PLANNING',
    created_at: new Date().toISOString(),
    total_cards: 0,
    completed_cards: 0,
  };

  res.status(201).json(created);
});

// PATCH /api/sprints/:id (SP-01: Atualiza detalhes do sprint)
router.patch('/:id', (req: Request, res: Response) => {
  const result = sprintUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const sprintId = req.params.id;

  const sprintCtx = getSprintContext(sprintId);
  if (!sprintCtx) {
    res.status(404).json({ error: 'Sprint não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: sprintCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para editar sprints neste quadro.' });
    return;
  }

  const current = queryOne<any>('SELECT * FROM sprints WHERE id = ?', [sprintId]);
  const newName = result.data.name !== undefined ? result.data.name.trim() : current.name;
  const newGoal = result.data.goal !== undefined ? result.data.goal.trim() : current.goal;
  const newStart = result.data.startDate !== undefined ? (result.data.startDate || null) : current.start_date;
  const newEnd = result.data.endDate !== undefined ? (result.data.endDate || null) : current.end_date;

  run(
    'UPDATE sprints SET name = ?, goal = ?, start_date = ?, end_date = ? WHERE id = ?',
    [newName, newGoal, newStart, newEnd, sprintId]
  );

  logAudit({
    workspaceId: sprintCtx.workspace_id,
    boardId: sprintCtx.board_id,
    userId,
    action: 'SPRINT_UPDATED',
    targetType: 'SPRINT',
    targetId: sprintId,
    details: { name: newName, goal: newGoal },
  });

  res.json({
    ...current,
    name: newName,
    goal: newGoal,
    start_date: newStart,
    end_date: newEnd,
  });
});

// DELETE /api/sprints/:id (SP-01: Exclui sprint e retorna cartões ao backlog)
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const sprintId = req.params.id;

  const sprintCtx = getSprintContext(sprintId);
  if (!sprintCtx) {
    res.status(404).json({ error: 'Sprint não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: sprintCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para remover sprints neste quadro.' });
    return;
  }

  run('UPDATE cards SET sprint_id = NULL WHERE sprint_id = ?', [sprintId]);
  run('DELETE FROM sprints WHERE id = ?', [sprintId]);

  logAudit({
    workspaceId: sprintCtx.workspace_id,
    boardId: sprintCtx.board_id,
    userId,
    action: 'SPRINT_DELETED',
    targetType: 'SPRINT',
    targetId: sprintId,
    details: { name: sprintCtx.name },
  });

  res.json({ message: 'Sprint excluído com sucesso.' });
});

// POST /api/sprints/:id/start (SP-01, SP-02, SP-04: Inicia sprint e registra snapshot planejado)
router.post('/:id/start', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const sprintId = req.params.id;

  const sprintCtx = getSprintContext(sprintId);
  if (!sprintCtx) {
    res.status(404).json({ error: 'Sprint não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: sprintCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para iniciar sprints neste quadro.' });
    return;
  }

  if (sprintCtx.status === 'ACTIVE') {
    res.status(400).json({ error: 'Este sprint já está ativo.' });
    return;
  }

  if (sprintCtx.status === 'COMPLETED') {
    res.status(400).json({ error: 'Este sprint já foi concluído e não pode ser reiniciado.' });
    return;
  }

  const existingActive = queryOne<{ id: string; name: string }>(
    "SELECT id, name FROM sprints WHERE board_id = ? AND status = 'ACTIVE' AND id != ?",
    [sprintCtx.board_id, sprintId]
  );
  if (existingActive) {
    res.status(400).json({
      error: `Já existe um sprint ativo neste quadro ("${existingActive.name}"). Conclua o sprint ativo antes de iniciar outro.`,
    });
    return;
  }

  db.exec('BEGIN TRANSACTION');
  try {
    run(
      "UPDATE sprints SET status = 'ACTIVE', started_at = datetime('now') WHERE id = ?",
      [sprintId]
    );

    // Registra os cartões presentes no momento do início como planejados (planned = 1) para SP-04
    const cards = queryAll<{ id: string; estimate: string | null }>(
      'SELECT id, estimate FROM cards WHERE sprint_id = ? AND (is_archived = 0 OR is_archived IS NULL)',
      [sprintId]
    );

    for (const card of cards) {
      run(
        `INSERT INTO sprint_items (sprint_id, card_id, planned, initial_estimate, completed, added_at)
         VALUES (?, ?, 1, ?, 0, datetime('now'))
         ON CONFLICT(sprint_id, card_id) DO UPDATE SET
           planned = 1,
           initial_estimate = excluded.initial_estimate`,
        [sprintId, card.id, card.estimate || null]
      );
    }

    logAudit({
      workspaceId: sprintCtx.workspace_id,
      boardId: sprintCtx.board_id,
      userId,
      action: 'SPRINT_STARTED',
      targetType: 'SPRINT',
      targetId: sprintId,
      details: { name: sprintCtx.name, cardsCount: cards.length },
    });

    db.exec('COMMIT');
    res.json({ message: 'Sprint iniciado com sucesso.', sprintId });
  } catch (err: any) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err.message || 'Falha ao iniciar sprint.' });
  }
});

// POST /api/sprints/:id/close (SP-03: Encerramento guiado de sprint)
router.post('/:id/close', (req: Request, res: Response) => {
  const result = sprintCloseSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const sprintId = req.params.id;
  const { moveToNextSprintId, moveToBacklog } = result.data;

  const sprintCtx = getSprintContext(sprintId);
  if (!sprintCtx) {
    res.status(404).json({ error: 'Sprint não encontrado.' });
    return;
  }

  if (!can(userId, 'board:edit_content', { type: 'board', id: sprintCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para encerrar sprints neste quadro.' });
    return;
  }

  if (sprintCtx.status === 'COMPLETED') {
    res.status(400).json({ error: 'Este sprint já foi encerrado.' });
    return;
  }

  if (moveToNextSprintId) {
    const nextSprint = queryOne<{ id: string; board_id: string }>(
      'SELECT id, board_id FROM sprints WHERE id = ?',
      [moveToNextSprintId]
    );
    if (!nextSprint || nextSprint.board_id !== sprintCtx.board_id) {
      res.status(400).json({ error: 'O sprint de destino especificado não é válido.' });
      return;
    }
  }

  const doneColIds = getDoneColumnIds(sprintCtx.board_id);

  db.exec('BEGIN TRANSACTION');
  try {
    const sprintCards = queryAll<{ id: string; column_id: string; estimate: string | null }>(
      'SELECT id, column_id, estimate FROM cards WHERE sprint_id = ? AND (is_archived = 0 OR is_archived IS NULL)',
      [sprintId]
    );

    let completedCount = 0;
    let incompleteCount = 0;

    for (const card of sprintCards) {
      const isDone = doneColIds.has(card.column_id);

      if (isDone) {
        completedCount++;
        run(
          `INSERT INTO sprint_items (sprint_id, card_id, planned, initial_estimate, completed, completed_at)
           VALUES (?, ?, 0, ?, 1, datetime('now'))
           ON CONFLICT(sprint_id, card_id) DO UPDATE SET
             completed = 1,
             completed_at = datetime('now')`,
          [sprintId, card.id, card.estimate || null]
        );
      } else {
        incompleteCount++;
        run(
          `INSERT INTO sprint_items (sprint_id, card_id, planned, initial_estimate, completed)
           VALUES (?, ?, 0, ?, 0)
           ON CONFLICT(sprint_id, card_id) DO UPDATE SET
             completed = 0`,
          [sprintId, card.id, card.estimate || null]
        );

        // SP-03: Move cartões incompletos para o próximo sprint ou de volta para o backlog
        if (moveToNextSprintId) {
          run('UPDATE cards SET sprint_id = ? WHERE id = ?', [moveToNextSprintId, card.id]);
        } else {
          run('UPDATE cards SET sprint_id = NULL WHERE id = ?', [card.id]);
        }
      }
    }

    run(
      "UPDATE sprints SET status = 'COMPLETED', completed_at = datetime('now') WHERE id = ?",
      [sprintId]
    );

    logAudit({
      workspaceId: sprintCtx.workspace_id,
      boardId: sprintCtx.board_id,
      userId,
      action: 'SPRINT_COMPLETED',
      targetType: 'SPRINT',
      targetId: sprintId,
      details: {
        name: sprintCtx.name,
        completedCount,
        incompleteCount,
        destination: moveToNextSprintId ? `Sprint ${moveToNextSprintId}` : 'Backlog',
      },
    });

    db.exec('COMMIT');
    res.json({
      message: 'Sprint concluído com sucesso.',
      completedCount,
      incompleteCount,
      destination: moveToNextSprintId ? 'NEXT_SPRINT' : 'BACKLOG',
    });
  } catch (err: any) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: err.message || 'Falha ao encerrar sprint.' });
  }
});

// POST /api/sprints/assign-cards (SP-02: Move cartões entre Sprints ou para o Backlog)
router.post('/assign-cards', (req: Request, res: Response) => {
  const result = assignCardsSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { sprintId, cardIds } = result.data;

  let boardId: string | null = null;
  let sprintStatus: SprintStatus = 'PLANNING';

  if (sprintId) {
    const sCtx = getSprintContext(sprintId);
    if (!sCtx) {
      res.status(404).json({ error: 'Sprint não encontrado.' });
      return;
    }
    boardId = sCtx.board_id;
    sprintStatus = sCtx.status;
    if (!can(userId, 'board:edit_content', { type: 'board', id: boardId })) {
      res.status(403).json({ error: 'Sem permissão para editar cartões neste quadro.' });
      return;
    }
  }

  for (const cardId of cardIds) {
    const card = queryOne<{ id: string; board_id: string; estimate: string | null }>(
      `SELECT cd.id, col.board_id, cd.estimate
       FROM cards cd
       JOIN columns col ON col.id = cd.column_id
       WHERE cd.id = ?`,
      [cardId]
    );
    if (!card) continue;

    if (!boardId) {
      boardId = card.board_id;
    }

    if (!can(userId, 'board:edit_content', { type: 'board', id: card.board_id })) {
      continue;
    }

    run('UPDATE cards SET sprint_id = ? WHERE id = ?', [sprintId, cardId]);

    // Se o sprint já está ativo e um novo cartão é inserido, conta como escopo adicionado durante o sprint (planned = 0 para SP-04)
    if (sprintId && sprintStatus === 'ACTIVE') {
      run(
        `INSERT INTO sprint_items (sprint_id, card_id, planned, initial_estimate, completed, added_at)
         VALUES (?, ?, 0, ?, 0, datetime('now'))
         ON CONFLICT(sprint_id, card_id) DO NOTHING`,
        [sprintId, cardId, card.estimate || null]
      );
    }
  }

  res.json({ success: true, sprintId, count: cardIds.length });
});

// GET /api/sprints/:id/report (SP-04: Relatório de sprint planejado vs entregue)
router.get('/:id/report', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const sprintId = req.params.id;

  const sprintCtx = getSprintContext(sprintId);
  if (!sprintCtx || !can(userId, 'board:view', { type: 'board', id: sprintCtx.board_id })) {
    res.status(404).json({ error: 'Sprint não encontrado.' });
    return;
  }

  const sprint = queryOne<any>('SELECT * FROM sprints WHERE id = ?', [sprintId]);
  const doneColIds = getDoneColumnIds(sprintCtx.board_id);

  // Busca itens registrados no sprint_items
  const items = queryAll<{
    sprint_id: string;
    card_id: string;
    planned: number;
    initial_estimate: string | null;
    completed: number;
  }>('SELECT sprint_id, card_id, planned, initial_estimate, completed FROM sprint_items WHERE sprint_id = ?', [
    sprintId,
  ]);

  const itemsMap = new Map(items.map(i => [i.card_id, i]));

  // Busca todos os cartões que estiveram no sprint ou ainda estão
  const allCardIds = Array.from(new Set([...items.map(i => i.card_id)]));
  
  // Se ainda estiver ativo ou em planning, pega também os cartões com sprint_id = sprintId atual
  const currentSprintCards = queryAll<{ id: string }>(
    'SELECT id FROM cards WHERE sprint_id = ? AND (is_archived = 0 OR is_archived IS NULL)',
    [sprintId]
  );
  for (const c of currentSprintCards) {
    if (!itemsMap.has(c.id)) {
      allCardIds.push(c.id);
    }
  }

  let cards: any[] = [];
  if (allCardIds.length > 0) {
    const placeholders = allCardIds.map(() => '?').join(',');
    cards = queryAll(
      `SELECT cd.*, col.title as column_title
       FROM cards cd
       JOIN columns col ON col.id = cd.column_id
       WHERE cd.id IN (${placeholders})`,
      allCardIds
    );
  }

  const plannedCards: any[] = [];
  const addedDuringSprintCards: any[] = [];
  const completedCards: any[] = [];
  const incompleteCards: any[] = [];

  for (const card of cards) {
    const item = itemsMap.get(card.id);
    const isCompleted = item ? Boolean(item.completed) : doneColIds.has(card.column_id);
    const isPlanned = item ? Boolean(item.planned) : (sprint.status === 'PLANNING');

    if (isPlanned) {
      plannedCards.push(card);
    } else {
      addedDuringSprintCards.push(card);
    }

    if (isCompleted) {
      completedCards.push(card);
    } else {
      incompleteCards.push(card);
    }
  }

  const totalScope = plannedCards.length + addedDuringSprintCards.length;
  const completionRatePercent = totalScope > 0
    ? Math.round((completedCards.length / totalScope) * 100)
    : 0;

  const report: SprintReport = {
    sprint: {
      ...sprint,
      total_cards: totalScope,
      completed_cards: completedCards.length,
    },
    plannedCards,
    completedCards,
    incompleteCards,
    addedDuringSprintCards,
    summary: {
      plannedCount: plannedCards.length,
      completedCount: completedCards.length,
      incompleteCount: incompleteCards.length,
      addedDuringSprintCount: addedDuringSprintCards.length,
      completionRatePercent,
    },
  };

  res.json(report);
});

// GET /api/sprints/:id/retrospective (SP-05: Lista itens da retrospectiva do sprint)
router.get('/:id/retrospective', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const sprintCtx = getSprintContext(id);
  if (!sprintCtx || !can(userId, 'board:view', { type: 'board', id: sprintCtx.board_id })) {
    res.status(404).json({ error: 'Sprint não encontrado ou sem permissão.' });
    return;
  }

  const items = queryAll<SprintRetroItem>(`
    SELECT r.id, r.sprint_id, r.author_id, u.name as author_name, r.category, r.content, r.votes, r.created_at
    FROM sprint_retrospectives r
    JOIN users u ON u.id = r.author_id
    WHERE r.sprint_id = ?
    ORDER BY r.votes DESC, r.created_at ASC
  `, [id]);

  res.json(items);
});

// POST /api/sprints/:id/retrospective (SP-05: Adiciona item na retrospectiva)
const retroItemCreateSchema = z.object({
  category: z.enum(['WENT_WELL', 'TO_IMPROVE', 'ACTION_ITEM']),
  content: z.string().min(1, 'O conteúdo do item é obrigatório.'),
});

router.post('/:id/retrospective', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const sprintCtx = getSprintContext(id);
  if (!sprintCtx || !can(userId, 'board:edit_content', { type: 'board', id: sprintCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para adicionar itens de retrospectiva.' });
    return;
  }

  const parsed = retroItemCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const itemId = crypto.randomUUID();
  const { category, content } = parsed.data;

  run(
    `INSERT INTO sprint_retrospectives (id, sprint_id, author_id, category, content, votes, created_at)
     VALUES (?, ?, ?, ?, ?, 0, datetime('now'))`,
    [itemId, id, userId, category, content.trim()]
  );

  res.status(201).json({
    id: itemId,
    sprint_id: id,
    author_id: userId,
    author_name: req.user!.name,
    category,
    content: content.trim(),
    votes: 0,
    created_at: new Date().toISOString(),
  });
});

// POST /api/sprints/:id/retrospective/:itemId/vote (SP-05: Votar em item de retrospectiva)
router.post('/:id/retrospective/:itemId/vote', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, itemId } = req.params;

  const sprintCtx = getSprintContext(id);
  if (!sprintCtx || !can(userId, 'board:view', { type: 'board', id: sprintCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão.' });
    return;
  }

  run('UPDATE sprint_retrospectives SET votes = votes + 1 WHERE id = ? AND sprint_id = ?', [itemId, id]);
  const updated = queryOne<SprintRetroItem>(
    `SELECT r.id, r.sprint_id, r.author_id, u.name as author_name, r.category, r.content, r.votes, r.created_at
     FROM sprint_retrospectives r
     JOIN users u ON u.id = r.author_id
     WHERE r.id = ?`,
    [itemId]
  );

  res.json(updated);
});

// DELETE /api/sprints/:id/retrospective/:itemId (SP-05: Remover item de retrospectiva)
router.delete('/:id/retrospective/:itemId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, itemId } = req.params;

  const sprintCtx = getSprintContext(id);
  if (!sprintCtx) {
    res.status(404).json({ error: 'Sprint não encontrado.' });
    return;
  }

  const item = queryOne<{ author_id: string }>('SELECT author_id FROM sprint_retrospectives WHERE id = ? AND sprint_id = ?', [itemId, id]);
  if (!item) {
    res.status(404).json({ error: 'Item não encontrado.' });
    return;
  }

  if (item.author_id !== userId && !can(userId, 'board:edit', { type: 'board', id: sprintCtx.board_id })) {
    res.status(403).json({ error: 'Sem permissão para excluir este item.' });
    return;
  }

  run('DELETE FROM sprint_retrospectives WHERE id = ?', [itemId]);
  res.json({ message: 'Item removido com sucesso.' });
});

// POST /api/sprints/quick-cycle (SP-05: Ciclos leves de 1 semana ou 1 mês)
const quickCycleSchema = z.object({
  boardId: z.string(),
  type: z.enum(['WEEK', 'MONTH']),
  name: z.string().optional(),
});

router.post('/quick-cycle', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const parsed = quickCycleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const { boardId, type, name } = parsed.data;
  const boardCtx = getBoardContext(boardId);
  if (!boardCtx || !can(userId, 'board:edit_content', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Sem permissão para criar ciclos neste quadro.' });
    return;
  }

  const now = new Date();
  const startStr = now.toISOString().split('T')[0];

  const endDate = new Date(now);
  if (type === 'WEEK') {
    endDate.setDate(endDate.getDate() + 7);
  } else {
    endDate.setDate(endDate.getDate() + 30);
  }
  const endStr = endDate.toISOString().split('T')[0];

  const formatDayMonth = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      return `${parts[2]}/${parts[1]}`;
    }
    return dateStr;
  };

  const defaultName = type === 'WEEK'
    ? `Ciclo Semanal (${formatDayMonth(startStr)} a ${formatDayMonth(endStr)})`
    : `Ciclo Mensal (${now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })})`;

  const sprintId = crypto.randomUUID();
  const sprintName = name && name.trim() ? name.trim() : defaultName;

  run(
    `INSERT INTO sprints (id, board_id, name, goal, start_date, end_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PLANNING', datetime('now'))`,
    [sprintId, boardId, sprintName, `Ciclo leve de ${type === 'WEEK' ? '1 semana' : '1 mês'}`, startStr, endStr]
  );

  res.status(201).json({
    id: sprintId,
    board_id: boardId,
    name: sprintName,
    goal: `Ciclo leve de ${type === 'WEEK' ? '1 semana' : '1 mês'}`,
    start_date: startStr,
    end_date: endStr,
    status: 'PLANNING',
    created_at: new Date().toISOString(),
  });
});

export default router;

