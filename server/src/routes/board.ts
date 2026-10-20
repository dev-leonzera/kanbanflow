import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, queryAll, run, createDefaultBoardForUser, getUserPrimaryWorkspace, logAudit, logCardEvent } from '../db.js';
import { Board, Column, Card, Subtask, BoardRole, BoardVisibility, BoardMember, EstimateType, SavedFilter, MyDayCard, CardVisibility } from '../types.js';
import { can, getEffectiveBoardRole, getEffectiveWorkspaceRole, isLastBoardOwner } from '../permissions/can.js';
import { parseEstimateToHours } from './capacity.js';

const router = Router();

// PM-03: Link público somente leitura com expiração (não exige autenticação)
router.get('/public/:token', (req: Request, res: Response) => {
  const { token } = req.params;
  const boardRow = queryOne<{
    id: string;
    workspace_id: string;
    title: string;
    visibility: BoardVisibility;
    estimate_type: EstimateType;
    public_share_expires_at: string | null;
  }>(
    `SELECT id, workspace_id, title, visibility, estimate_type, public_share_expires_at
     FROM boards
     WHERE public_share_token = ? AND (is_archived = 0 OR is_archived IS NULL)`,
    [token]
  );

  if (!boardRow) {
    res.status(404).json({ error: 'Quadro público não encontrado ou link desativado.' });
    return;
  }

  if (boardRow.public_share_expires_at && new Date(boardRow.public_share_expires_at).getTime() < Date.now()) {
    res.status(410).json({ error: 'O link público deste quadro expirou.' });
    return;
  }

  // Busca dados em modo somente leitura
  const columnsRaw = queryAll<{ id: string; board_id: string; title: string; position: number; wip_limit: number | null }>(
    `SELECT id, board_id, title, position, wip_limit
     FROM columns
     WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL)
     ORDER BY position ASC`,
    [boardRow.id]
  );

  const columnIds = columnsRaw.map(c => c.id);
  const columnMap = new Map(columnsRaw.map(c => [c.id, { ...c, cards: [] as Card[] }]));

  if (columnIds.length > 0) {
    const placeholders = columnIds.map(() => '?').join(',');
    const cardsRaw = queryAll<any>(
      `SELECT id, column_id, parent_id, sprint_id, COALESCE(type, 'TASK') as type, title, description, priority, tag, due_date, position, assignee, estimate
       FROM cards
       WHERE column_id IN (${placeholders}) AND (is_archived = 0 OR is_archived IS NULL)
       ORDER BY position ASC`,
      columnIds
    );

    for (const card of cardsRaw) {
      const col = columnMap.get(card.column_id);
      if (col) {
        col.cards.push({
          ...card,
          subtasks: [],
        });
      }
    }
  }

  res.json({
    id: boardRow.id,
    workspace_id: boardRow.workspace_id,
    title: boardRow.title,
    visibility: boardRow.visibility,
    estimate_type: boardRow.estimate_type,
    isReadOnly: true,
    columns: Array.from(columnMap.values()),
  });
});

router.use(requireAuth);

const boardVisibilityEnum = z.enum(['PRIVATE', 'WORKSPACE']);
const boardRoleEnum = z.enum(['OWNER', 'EDITOR', 'COMMENTER', 'VIEWER']);
const estimateTypeEnum = z.enum(['POINTS', 'HOURS', 'TSHIRT']);

const boardCreateSchema = z.object({
  title: z.string().min(1, 'O título do quadro é obrigatório.'),
  workspaceId: z.string().optional(),
  visibility: boardVisibilityEnum.default('WORKSPACE'),
  estimateType: estimateTypeEnum.default('POINTS'),
});

const boardUpdateSchema = z.object({
  title: z.string().min(1, 'O título do quadro é obrigatório.').optional(),
  visibility: boardVisibilityEnum.optional(),
  estimateType: estimateTypeEnum.optional(),
  autoArchiveDays: z.number().int().min(1).nullable().optional(),
});

const boardMemberAddSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  name: z.string().optional(),
  role: boardRoleEnum.default('EDITOR'),
});

const boardMemberUpdateSchema = z.object({
  role: boardRoleEnum,
});

const savedFilterCreateSchema = z.object({
  name: z.string().min(1, 'O nome do filtro é obrigatório.'),
  searchQuery: z.string().default(''),
  priorityFilter: z.string().default('ALL'),
  assigneeFilter: z.string().default('ALL'),
});

// Lista os quadros visíveis para um usuário dentro de um workspace (BD-02, BD-03, BD-05, CD-08)
export function getAccessibleBoardsInWorkspace(userId: string, workspaceId: string) {
  const candidateBoards = queryAll<{
    id: string;
    workspace_id: string;
    user_id: string | null;
    title: string;
    visibility: BoardVisibility;
    estimate_type: EstimateType;
    created_at: string;
  }>(
    `SELECT id, workspace_id, user_id, title, COALESCE(visibility, 'WORKSPACE') as visibility,
            COALESCE(estimate_type, 'POINTS') as estimate_type, created_at
     FROM boards
     WHERE workspace_id = ? AND (is_archived = 0 OR is_archived IS NULL)
     ORDER BY created_at ASC`,
    [workspaceId]
  );

  return candidateBoards
    .filter(b => can(userId, 'board:view', { type: 'board', id: b.id }))
    .map(b => ({
      ...b,
      role: getEffectiveBoardRole(userId, b.id) || 'VIEWER',
    }));
}

// Helper para obter o quadro completo do usuário logado (com suporte a permissões, estimativas, bloqueios, contadores e filtro por sprint)
export function getUserBoard(userId: string, targetBoardId?: string, targetWorkspaceId?: string, sprintId?: string | null): Board | null {
  let workspaceId = targetWorkspaceId;

  if (!workspaceId && !targetBoardId) {
    const ws = getUserPrimaryWorkspace(userId);
    workspaceId = ws.id;
  }

  let board: {
    id: string;
    workspace_id: string;
    user_id?: string;
    title: string;
    visibility: BoardVisibility;
    estimate_type: EstimateType;
    auto_archive_days?: number | null;
    public_share_token?: string | null;
    public_share_expires_at?: string | null;
  } | undefined;

  if (targetBoardId) {
    if (can(userId, 'board:view', { type: 'board', id: targetBoardId })) {
      board = queryOne(
        `SELECT id, workspace_id, user_id, title, COALESCE(visibility, 'WORKSPACE') as visibility,
                COALESCE(estimate_type, 'POINTS') as estimate_type, auto_archive_days, public_share_token, public_share_expires_at
         FROM boards
         WHERE id = ? AND (is_archived = 0 OR is_archived IS NULL)`,
        [targetBoardId]
      );
    }
  }

  if (!board && workspaceId) {
    const accessible = getAccessibleBoardsInWorkspace(userId, workspaceId);
    if (accessible.length > 0) {
      const first = accessible[0];
      board = queryOne(
        `SELECT id, workspace_id, user_id, title, COALESCE(visibility, 'WORKSPACE') as visibility,
                COALESCE(estimate_type, 'POINTS') as estimate_type, auto_archive_days, public_share_token, public_share_expires_at
         FROM boards WHERE id = ?`,
        [first.id]
      );
    }
  }

  if (!board) {
    const wsRole = workspaceId ? getEffectiveWorkspaceRole(userId, workspaceId) : null;
    if (wsRole === 'GUEST') {
      return null;
    }

    const defaultWs = workspaceId ? { id: workspaceId, name: '' } : getUserPrimaryWorkspace(userId);
    const existingAny = queryOne<{ id: string }>(
      'SELECT id FROM boards WHERE workspace_id = ? AND (is_archived = 0 OR is_archived IS NULL) LIMIT 1',
      [defaultWs.id]
    );
    if (!existingAny && can(userId, 'workspace:create_board', { type: 'workspace', id: defaultWs.id })) {
      const boardId = createDefaultBoardForUser(userId, defaultWs.id);
      board = {
        id: boardId,
        workspace_id: defaultWs.id,
        user_id: userId,
        title: 'Meu Quadro',
        visibility: 'WORKSPACE',
        estimate_type: 'POINTS',
      };
    } else {
      return null;
    }
  }

  const effectiveRole = getEffectiveBoardRole(userId, board.id) || 'VIEWER';

  // Busca colunas não arquivadas (TD-02, BD-06)
  const columnsRaw = queryAll<{ id: string; board_id: string; title: string; position: number; wip_limit: number | null }>(
    `SELECT id, board_id, title, position, wip_limit 
     FROM columns 
     WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL)
     ORDER BY position ASC`,
    [board.id]
  );

  const columnIds = columnsRaw.map(c => c.id);
  const columnMap = new Map(columnsRaw.map(c => [c.id, c]));

  // Identifica colunas de conclusão ("Concluído", "Done") para cálculo de progresso agregado (CD-05) e desbloqueio (CD-07)
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
    sprint_id: string | null;
    type: any;
    visibility?: CardVisibility;
    restricted_to_role?: string | null;
    title: string;
    description: string;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    tag: string;
    due_date: string | null;
    position: number;
    assignee: string | null;
    estimate: string | null;
  }[] = [];

  if (columnIds.length > 0) {
    const placeholders = columnIds.map(() => '?').join(',');
    let sprintFilterSql = '';
    const queryParams: any[] = [...columnIds];

    if (sprintId === 'BACKLOG') {
      sprintFilterSql = "AND (sprint_id IS NULL OR sprint_id = '')";
    } else if (sprintId && sprintId !== 'ALL') {
      sprintFilterSql = 'AND sprint_id = ?';
      queryParams.push(sprintId);
    }

    cardsRaw = queryAll(
      `SELECT id, column_id, parent_id, sprint_id, COALESCE(type, 'TASK') as type,
              COALESCE(visibility, 'NORMAL') as visibility, restricted_to_role,
              title, description, priority, tag, due_date, position, assignee, estimate
       FROM cards 
       WHERE column_id IN (${placeholders}) ${sprintFilterSql} AND (is_archived = 0 OR is_archived IS NULL)
       ORDER BY position ASC`,
      queryParams
    );
  }

  const cardIds = cardsRaw.map(c => c.id);
  const cardById = new Map(cardsRaw.map(c => [c.id, c]));

  let subtasksRaw: {
    id: string;
    card_id: string;
    title: string;
    done: number;
    position: number;
  }[] = [];

  // Contadores de comentários e anexos (CD-02)
  const commentsCountByCard = new Map<string, number>();
  const attachmentsCountByCard = new Map<string, number>();

  // Relações e bloqueios (CD-06, CD-07)
  const blockedByMap = new Map<string, { id: string; title: string; column_title?: string }[]>();
  const blocksMap = new Map<string, { id: string; title: string }[]>();

  // TM-01, TM-02, CD-13: Mapas de tempo e caminho crítico
  const timeSpentByCard = new Map<string, { totalSeconds: number; count: number }>();
  const activeTimerByCard = new Map<string, { id: string; card_id: string; user_id: string; started_at: string }>();
  const criticalPathIds = new Set<string>();

  if (cardIds.length > 0) {
    const placeholders = cardIds.map(() => '?').join(',');
    subtasksRaw = queryAll(
      `SELECT id, card_id, title, done, position 
       FROM subtasks 
       WHERE card_id IN (${placeholders}) 
       ORDER BY position ASC`,
      cardIds
    );

    const commentCounts = queryAll<{ card_id: string; count: number }>(
      `SELECT card_id, COUNT(*) as count FROM card_comments WHERE card_id IN (${placeholders}) GROUP BY card_id`,
      cardIds
    );
    for (const row of commentCounts) {
      commentsCountByCard.set(row.card_id, Number(row.count));
    }

    const attachmentCounts = queryAll<{ card_id: string; count: number }>(
      `SELECT card_id, COUNT(*) as count FROM card_attachments WHERE card_id IN (${placeholders}) GROUP BY card_id`,
      cardIds
    );
    for (const row of attachmentCounts) {
      attachmentsCountByCard.set(row.card_id, Number(row.count));
    }

    // Busca relações de bloqueio ativas (source_card_id BLOCKS target_card_id)
    const relations = queryAll<{
      source_card_id: string;
      target_card_id: string;
      relation_type: string;
    }>(
      `SELECT source_card_id, target_card_id, relation_type
       FROM card_relations
       WHERE (source_card_id IN (${placeholders}) OR target_card_id IN (${placeholders}))
         AND relation_type = 'BLOCKS'`,
      [...cardIds, ...cardIds]
    );

    for (const rel of relations) {
      const blocker = cardById.get(rel.source_card_id);
      const blocked = cardById.get(rel.target_card_id);

      if (blocker && blocked) {
        // Um cartão só é considerado bloqueado de fato se o bloqueador NÃO estiver na coluna Concluído (CD-07)
        const isBlockerDone = doneColIds.has(blocker.column_id);
        if (!isBlockerDone) {
          if (!blockedByMap.has(blocked.id)) {
            blockedByMap.set(blocked.id, []);
          }
          blockedByMap.get(blocked.id)!.push({
            id: blocker.id,
            title: blocker.title,
            column_title: columnMap.get(blocker.column_id)?.title,
          });
        }

        if (!blocksMap.has(blocker.id)) {
          blocksMap.set(blocker.id, []);
        }
        blocksMap.get(blocker.id)!.push({
          id: blocked.id,
          title: blocked.title,
        });
      }
    }

    // TM-01 & TM-02: Total de tempo gasto e cronômetro ativo por cartão
    const timeLogCounts = queryAll<{ card_id: string; total_sec: number; cnt: number }>(
      `SELECT card_id, COALESCE(SUM(duration_seconds), 0) as total_sec, COUNT(*) as cnt
       FROM card_time_logs
       WHERE card_id IN (${placeholders})
       GROUP BY card_id`,
      cardIds
    );
    for (const row of timeLogCounts) {
      timeSpentByCard.set(row.card_id, { totalSeconds: Number(row.total_sec), count: Number(row.cnt) });
    }

    const activeTimersRaw = queryAll<{ id: string; card_id: string; started_at: string }>(
      `SELECT id, card_id, started_at FROM active_card_timers WHERE user_id = ? AND card_id IN (${placeholders})`,
      [userId, ...cardIds]
    );
    for (const t of activeTimersRaw) {
      activeTimerByCard.set(t.card_id, { ...t, user_id: userId });
    }

    // CD-13: Visão de caminho crítico (CPM no grafo de dependências BLOCKS)
    if (relations.length > 0) {
      const successors = new Map<string, string[]>();
      const predecessors = new Map<string, string[]>();
      for (const rel of relations) {
        if (!successors.has(rel.source_card_id)) successors.set(rel.source_card_id, []);
        successors.get(rel.source_card_id)!.push(rel.target_card_id);
        if (!predecessors.has(rel.target_card_id)) predecessors.set(rel.target_card_id, []);
        predecessors.get(rel.target_card_id)!.push(rel.source_card_id);
      }

      const durationMap = new Map<string, number>();
      cardsRaw.forEach(c => {
        const estH = parseEstimateToHours(c.estimate);
        durationMap.set(c.id, estH > 0 ? estH : 1);
      });

      const maxDist = new Map<string, number>();
      const bestNext = new Map<string, string>();

      function getLongestPath(nodeId: string, visited: Set<string>): number {
        if (visited.has(nodeId)) return 0;
        if (maxDist.has(nodeId)) return maxDist.get(nodeId)!;
        visited.add(nodeId);
        const nodeDur = durationMap.get(nodeId) || 1;
        const nextNodes = successors.get(nodeId) || [];
        let maxChildDist = 0;
        let bestChildId: string | null = null;
        for (const nextId of nextNodes) {
          const childDist = getLongestPath(nextId, new Set(visited));
          if (childDist > maxChildDist) {
            maxChildDist = childDist;
            bestChildId = nextId;
          }
        }
        visited.delete(nodeId);
        const totalDist = nodeDur + maxChildDist;
        maxDist.set(nodeId, totalDist);
        if (bestChildId) bestNext.set(nodeId, bestChildId);
        return totalDist;
      }

      let overallMaxDist = 0;
      let criticalStartId: string | null = null;
      for (const c of cardsRaw) {
        const preds = predecessors.get(c.id) || [];
        if (preds.length === 0) {
          const d = getLongestPath(c.id, new Set());
          if (d > overallMaxDist) {
            overallMaxDist = d;
            criticalStartId = c.id;
          }
        }
      }

      if (criticalStartId && successors.has(criticalStartId)) {
        let curr: string | undefined = criticalStartId;
        while (curr) {
          criticalPathIds.add(curr);
          curr = bestNext.get(curr);
        }
      }
    }
  }

  const currentUser = queryOne<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [userId]);

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
        visibility: (card.visibility as CardVisibility) || 'NORMAL',
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

    const totalChecklist = cardSubtasks.length;
    const doneChecklist = cardSubtasks.filter(s => s.done).length;
    const totalChildren = cardChildren.length;
    const doneChildren = cardChildren.filter(c => doneColIds.has(c.column_id)).length;

    const totalItems = totalChecklist + totalChildren;
    const completedItems = doneChecklist + doneChildren;
    const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    const activeBlockers = blockedByMap.get(card.id) || [];

    // TM-01 & TM-02: Dados de tempo e desvio
    const timeSpent = timeSpentByCard.get(card.id) || { totalSeconds: 0, count: 0 };
    const estHours = parseEstimateToHours(card.estimate);
    const spentHours = timeSpent.totalSeconds / 3600;

    let deviationHours: number | null = null;
    let deviationPercent: number | null = null;
    if (estHours > 0) {
      deviationHours = Math.round((spentHours - estHours) * 10) / 10;
      deviationPercent = Math.round(((spentHours - estHours) / estHours) * 100);
    }

    // PM-04: Visibilidade por cartão (NORMAL, RESTRICTED, PRIVATE)
    const isAssignee = card.assignee && (
      card.assignee.trim().toLowerCase() === currentUser?.name?.trim().toLowerCase() ||
      card.assignee.trim().toLowerCase() === currentUser?.email?.trim().toLowerCase()
    );
    const isPrivileged = effectiveRole === 'OWNER' || Boolean(isAssignee);

    let displayTitle = card.title;
    let displayDesc = card.description;
    let displaySubtasks = cardSubtasks;
    let displayChildren = cardChildren;

    if (card.visibility === 'PRIVATE' && !isPrivileged) {
      displayTitle = '🔒 Cartão Privado';
      displayDesc = 'Conteúdo restrito apenas aos responsáveis ou proprietários.';
      displaySubtasks = [];
      displayChildren = [];
    }

    // PM-05: Campos restritos por papel (esconder estimativa e horas para VIEWER)
    let displayEstimate = card.estimate;
    let displaySpentSec = timeSpent.totalSeconds;
    if ((effectiveRole === 'VIEWER' || effectiveRole === 'COMMENTER') && card.restricted_to_role) {
      displayEstimate = null;
      displaySpentSec = 0;
      deviationHours = null;
      deviationPercent = null;
    }

    cardsByCol.get(card.column_id)!.push({
      ...card,
      visibility: (card.visibility as CardVisibility) || 'NORMAL',
      title: displayTitle,
      description: displayDesc,
      estimate: displayEstimate,
      subtasks: displaySubtasks,
      children: displayChildren,
      progress: {
        total: totalItems,
        completed: completedItems,
        percent,
      },
      comments_count: commentsCountByCard.get(card.id) || 0,
      attachments_count: attachmentsCountByCard.get(card.id) || 0,
      is_blocked: activeBlockers.length > 0,
      blocked_by: activeBlockers,
      blocks: blocksMap.get(card.id) || [],
      total_time_spent_seconds: displaySpentSec,
      time_logs_count: timeSpent.count,
      active_timer: activeTimerByCard.get(card.id) || null,
      deviation_hours: deviationHours,
      deviation_percent: deviationPercent,
      is_critical_path: criticalPathIds.has(card.id),
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
    visibility: board.visibility,
    estimate_type: board.estimate_type,
    auto_archive_days: board.auto_archive_days,
    public_share_token: board.public_share_token,
    public_share_expires_at: board.public_share_expires_at,
    role: effectiveRole,
    columns,
  };
}

// GET /api/board
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const targetBoardId = typeof req.query.boardId === 'string' ? req.query.boardId : undefined;
  const targetWorkspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  const targetSprintId = typeof req.query.sprintId === 'string' ? req.query.sprintId : undefined;
  const board = getUserBoard(userId, targetBoardId, targetWorkspaceId, targetSprintId);

  if (!board) {
    res.status(403).json({ error: 'Nenhum quadro acessível encontrado para o seu perfil neste workspace.' });
    return;
  }

  res.json(board);
});

// GET /api/board/list - Lista todos os quadros acessíveis do workspace especificado (BD-01, BD-03, BD-05)
router.get('/list', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const targetWorkspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;

  let workspaceId = targetWorkspaceId;
  if (!workspaceId) {
    const ws = getUserPrimaryWorkspace(userId);
    workspaceId = ws.id;
  }

  const boards = getAccessibleBoardsInWorkspace(userId, workspaceId);
  res.json(boards);
});

// GET /api/board/my-day - Tela agregada "Meu Dia", com cartões de todos os quadros acessíveis (VW-02)
router.get('/my-day', (req: Request, res: Response) => {
  const userId = req.user!.id;

  const workspaces = queryAll<{ id: string; name: string }>(
    `SELECT w.id, w.name
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = ?`,
    [userId]
  );

  const allMyDayCards: MyDayCard[] = [];

  for (const ws of workspaces) {
    const accessibleBoards = getAccessibleBoardsInWorkspace(userId, ws.id);
    for (const b of accessibleBoards) {
      const boardFull = getUserBoard(userId, b.id, ws.id);
      if (!boardFull) continue;

      const maxPos = boardFull.columns.length > 0
        ? Math.max(...boardFull.columns.map(c => c.position))
        : -1;

      for (const col of boardFull.columns) {
        const isDoneCol =
          /conclu[ií]d/i.test(col.title) ||
          /done/i.test(col.title) ||
          (col.position === maxPos && boardFull.columns.length > 1);

        for (const card of col.cards) {
          allMyDayCards.push({
            ...card,
            board_id: boardFull.id,
            board_title: boardFull.title,
            workspace_id: ws.id,
            workspace_name: ws.name,
            column_title: col.title,
            is_done_column: isDoneCol,
          });
        }
      }
    }
  }

  res.json(allMyDayCards);
});

// POST /api/board - Cria um novo quadro dentro de um workspace (BD-01, BD-02, BD-03, CD-08)
router.post('/', (req: Request, res: Response) => {
  const result = boardCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  let workspaceId = result.data.workspaceId;
  const visibility = result.data.visibility || 'WORKSPACE';
  const estimateType = result.data.estimateType || 'POINTS';

  if (!workspaceId) {
    const ws = getUserPrimaryWorkspace(userId);
    workspaceId = ws.id;
  }

  if (!can(userId, 'workspace:create_board', { type: 'workspace', id: workspaceId })) {
    res.status(403).json({ error: 'Você não tem permissão para criar quadros neste workspace (Convidados não podem criar quadros).' });
    return;
  }

  const boardId = crypto.randomUUID();
  const title = result.data.title.trim();

  run(
    `INSERT INTO boards (id, workspace_id, user_id, title, visibility, estimate_type, is_archived, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
    [boardId, workspaceId, userId, title, visibility, estimateType]
  );

  run(
    `INSERT OR IGNORE INTO board_members (board_id, user_id, role, created_at)
     VALUES (?, ?, 'OWNER', datetime('now'))`,
    [boardId, userId]
  );

  const colTodoId = crypto.randomUUID();
  const colDoingId = crypto.randomUUID();
  const colDoneId = crypto.randomUUID();

  run('INSERT INTO columns (id, board_id, title, position, is_archived) VALUES (?, ?, ?, ?, 0)', [colTodoId, boardId, 'A Fazer', 0]);
  run('INSERT INTO columns (id, board_id, title, position, is_archived) VALUES (?, ?, ?, ?, 0)', [colDoingId, boardId, 'Em Andamento', 1]);
  run('INSERT INTO columns (id, board_id, title, position, is_archived) VALUES (?, ?, ?, ?, 0)', [colDoneId, boardId, 'Concluído', 2]);

  logAudit({
    workspaceId,
    boardId,
    userId,
    action: 'BOARD_CREATED',
    targetType: 'BOARD',
    targetId: boardId,
    details: { title, visibility, estimateType },
  });

  const newBoard = getUserBoard(userId, boardId, workspaceId);
  res.status(201).json(newBoard);
});

// PATCH /api/board/:id - Renomeia um quadro, altera visibilidade ou unidade de estimativa (BD-01, BD-03, CD-08)
router.patch('/:id', (req: Request, res: Response) => {
  const result = boardUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'board:edit', { type: 'board', id })) {
    res.status(403).json({ error: 'Apenas o Owner do quadro pode alterar configurações ou renomear o quadro.' });
    return;
  }

  const board = queryOne<{ id: string; workspace_id: string; title: string; visibility: BoardVisibility; estimate_type: EstimateType; auto_archive_days: number | null }>(
    `SELECT id, workspace_id, title, COALESCE(visibility, 'WORKSPACE') as visibility,
            COALESCE(estimate_type, 'POINTS') as estimate_type, auto_archive_days
     FROM boards
     WHERE id = ? AND (is_archived = 0 OR is_archived IS NULL)`,
    [id]
  );

  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  const newTitle = result.data.title !== undefined ? result.data.title.trim() : board.title;
  const newVisibility = result.data.visibility !== undefined ? result.data.visibility : board.visibility;
  const newEstimateType = result.data.estimateType !== undefined ? result.data.estimateType : board.estimate_type;
  const newAutoArchiveDays = result.data.autoArchiveDays !== undefined ? result.data.autoArchiveDays : board.auto_archive_days;

  run('UPDATE boards SET title = ?, visibility = ?, estimate_type = ?, auto_archive_days = ? WHERE id = ?', [
    newTitle,
    newVisibility,
    newEstimateType,
    newAutoArchiveDays,
    id,
  ]);

  logAudit({
    workspaceId: board.workspace_id,
    boardId: id,
    userId,
    action: 'BOARD_UPDATED',
    targetType: 'BOARD',
    targetId: id,
    details: {
      oldTitle: board.title,
      newTitle,
      oldVisibility: board.visibility,
      newVisibility,
      oldEstimateType: board.estimate_type,
      newEstimateType,
      autoArchiveDays: newAutoArchiveDays,
    },
  });

  res.json({
    id,
    title: newTitle,
    visibility: newVisibility,
    estimate_type: newEstimateType,
    auto_archive_days: newAutoArchiveDays,
    workspace_id: board.workspace_id,
    role: getEffectiveBoardRole(userId, id) || 'OWNER',
  });
});

// POST /api/board/:id/auto-archive (BD-08: Arquivamento automático de concluídos após N dias)
router.post('/:id/auto-archive', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'board:edit_content', { type: 'board', id })) {
    res.status(403).json({ error: 'Sem permissão para arquivar cartões neste quadro.' });
    return;
  }

  const board = queryOne<{ id: string; workspace_id: string; auto_archive_days: number | null }>(
    'SELECT id, workspace_id, auto_archive_days FROM boards WHERE id = ?',
    [id]
  );
  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  const days = req.body?.days ? Number(req.body.days) : (board.auto_archive_days || 7);

  const doneCols = queryAll<{ id: string }>(
    `SELECT id FROM columns
     WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL)
       AND (LOWER(title) LIKE '%conclu%' OR LOWER(title) LIKE '%done%')`,
    [id]
  );

  if (doneCols.length === 0) {
    res.json({ archivedCount: 0, message: 'Nenhuma coluna de conclusão encontrada neste quadro.' });
    return;
  }

  const colPlaceholders = doneCols.map(() => '?').join(',');
  const dateCutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const toArchive = queryAll<{ id: string; title: string }>(`
    SELECT id, title FROM cards
    WHERE column_id IN (${colPlaceholders})
      AND (is_archived = 0 OR is_archived IS NULL)
      AND (created_at < ? OR (
        SELECT COALESCE(MAX(created_at), cards.created_at) FROM card_events WHERE card_id = cards.id
      ) < ?)
  `, [...doneCols.map(c => c.id), dateCutoff, dateCutoff]);

  for (const c of toArchive) {
    run("UPDATE cards SET is_archived = 1, archived_at = datetime('now') WHERE id = ?", [c.id]);
    logCardEvent({ cardId: c.id, userId, eventType: 'AUTO_ARCHIVED' });
  }

  if (toArchive.length > 0) {
    logAudit({
      workspaceId: board.workspace_id,
      boardId: id,
      userId,
      action: 'CARDS_AUTO_ARCHIVED',
      targetType: 'BOARD',
      targetId: id,
      details: { archivedCount: toArchive.length, days },
    });
  }

  res.json({ archivedCount: toArchive.length, message: `${toArchive.length} cartões arquivados automaticamente.` });
});

// POST /api/board/:id/public-link (PM-03: Gerar link público somente leitura com expiração)
router.post('/:id/public-link', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'board:manage_members', { type: 'board', id }) && !can(userId, 'board:edit', { type: 'board', id })) {
    res.status(403).json({ error: 'Apenas administradores do quadro podem gerar links públicos.' });
    return;
  }

  const expiresInDays = req.body?.expiresInDays ? Number(req.body.expiresInDays) : 7;
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  run('UPDATE boards SET public_share_token = ?, public_share_expires_at = ? WHERE id = ?', [
    token,
    expiresAt,
    id,
  ]);

  res.json({
    public_share_token: token,
    public_share_expires_at: expiresAt,
  });
});

// DELETE /api/board/:id/public-link (PM-03: Revogar link público)
router.delete('/:id/public-link', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'board:manage_members', { type: 'board', id }) && !can(userId, 'board:edit', { type: 'board', id })) {
    res.status(403).json({ error: 'Sem permissão para revogar o link público.' });
    return;
  }

  run('UPDATE boards SET public_share_token = NULL, public_share_expires_at = NULL WHERE id = ?', [id]);
  res.json({ message: 'Link público revogado com sucesso.' });
});

// POST /api/board/:id/self-promote (PM-02: Owner do workspace se autopromove a membro/owner do quadro com registro em auditoria)
router.post('/:id/self-promote', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const board = queryOne<{ id: string; workspace_id: string; title: string }>('SELECT id, workspace_id, title FROM boards WHERE id = ?', [id]);
  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  const wsRole = getEffectiveWorkspaceRole(userId, board.workspace_id);
  if (wsRole !== 'OWNER') {
    res.status(403).json({ error: 'Apenas Owners do Workspace podem se autopromover a membro de quadros.' });
    return;
  }

  run(
    `INSERT INTO board_members (board_id, user_id, role, created_at)
     VALUES (?, ?, 'OWNER', datetime('now'))
     ON CONFLICT(board_id, user_id) DO UPDATE SET role = 'OWNER'`,
    [id, userId]
  );

  logAudit({
    workspaceId: board.workspace_id,
    boardId: id,
    userId,
    action: 'WORKSPACE_OWNER_SELF_PROMOTED',
    targetType: 'BOARD',
    targetId: id,
    details: { boardTitle: board.title, promotedTo: 'OWNER' },
  });

  res.json({ message: 'Promovido a Owner do quadro com sucesso.', role: 'OWNER' });
});

// GET /api/board/:id/tree (CD-12: Visão em árvore hierárquica)
router.get('/:id/tree', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'board:view', { type: 'board', id })) {
    res.status(403).json({ error: 'Sem permissão para visualizar este quadro.' });
    return;
  }

  const allCards = queryAll<{
    id: string;
    title: string;
    type: any;
    column_id: string;
    column_title: string;
    assignee: string | null;
    estimate: string | null;
    parent_id: string | null;
    position: number;
  }>(`
    SELECT c.id, c.title, COALESCE(c.type, 'TASK') as type, c.column_id, col.title as column_title,
           c.assignee, c.estimate, c.parent_id, c.position
    FROM cards c
    JOIN columns col ON col.id = c.column_id
    WHERE col.board_id = ? AND (c.is_archived = 0 OR c.is_archived IS NULL)
    ORDER BY c.position ASC
  `, [id]);

  const map = new Map<string, any>();
  allCards.forEach(c => {
    map.set(c.id, { ...c, children: [] });
  });

  const roots: any[] = [];
  allCards.forEach(c => {
    const node = map.get(c.id);
    if (c.parent_id && map.has(c.parent_id)) {
      map.get(c.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  });

  res.json(roots);
});

// GET /api/board/:id/saved-filters - Lista filtros salvos e nomeados do usuário neste quadro (VW-01)
router.get('/:id/saved-filters', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'board:view', { type: 'board', id })) {
    res.status(403).json({ error: 'Sem permissão para visualizar este quadro.' });
    return;
  }

  const filters = queryAll<SavedFilter>(
    `SELECT id, board_id, user_id, name, search_query, priority_filter, assignee_filter, created_at
     FROM saved_filters
     WHERE board_id = ? AND user_id = ?
     ORDER BY created_at ASC`,
    [id, userId]
  );

  res.json(filters);
});

// POST /api/board/:id/saved-filters - Salva e nomeia um novo filtro para o quadro (VW-01)
router.post('/:id/saved-filters', (req: Request, res: Response) => {
  const result = savedFilterCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'board:view', { type: 'board', id })) {
    res.status(403).json({ error: 'Sem permissão para acessar este quadro.' });
    return;
  }

  const filterId = crypto.randomUUID();
  const { name, searchQuery, priorityFilter, assigneeFilter } = result.data;

  run(
    `INSERT INTO saved_filters (id, board_id, user_id, name, search_query, priority_filter, assignee_filter, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [filterId, id, userId, name.trim(), searchQuery.trim(), priorityFilter, assigneeFilter]
  );

  res.status(201).json({
    id: filterId,
    board_id: id,
    user_id: userId,
    name: name.trim(),
    search_query: searchQuery.trim(),
    priority_filter: priorityFilter,
    assignee_filter: assigneeFilter,
  });
});

// DELETE /api/board/:id/saved-filters/:filterId - Remove um filtro salvo (VW-01)
router.delete('/:id/saved-filters/:filterId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, filterId } = req.params;

  run('DELETE FROM saved_filters WHERE id = ? AND board_id = ? AND user_id = ?', [filterId, id, userId]);
  res.json({ message: 'Filtro salvo removido com sucesso.' });
});

// GET /api/board/:id/members - Lista os membros explícitos do quadro (BD-02)
router.get('/:id/members', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'board:view', { type: 'board', id })) {
    res.status(403).json({ error: 'Sem permissão para visualizar este quadro.' });
    return;
  }

  const members = queryAll<BoardMember>(
    `SELECT bm.board_id, bm.user_id, u.name as user_name, u.email as user_email, bm.role, bm.created_at
     FROM board_members bm
     JOIN users u ON u.id = bm.user_id
     WHERE bm.board_id = ?
     ORDER BY CASE bm.role
       WHEN 'OWNER' THEN 1
       WHEN 'EDITOR' THEN 2
       WHEN 'COMMENTER' THEN 3
       ELSE 4
     END, u.name ASC`,
    [id]
  );

  res.json(members);
});

// POST /api/board/:id/members - Adiciona ou compartilha quadro com um usuário (BD-02, BD-05)
router.post('/:id/members', (req: Request, res: Response) => {
  const result = boardMemberAddSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;
  const { email, name, role } = result.data;

  if (!can(userId, 'board:manage_members', { type: 'board', id })) {
    res.status(403).json({ error: 'Apenas o Owner do quadro pode gerenciar membros do quadro.' });
    return;
  }

  const board = queryOne<{ id: string; workspace_id: string; title: string }>(
    'SELECT id, workspace_id, title FROM boards WHERE id = ?',
    [id]
  );

  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  let targetUser = queryOne<{ id: string; name: string; email: string }>(
    'SELECT id, name, email FROM users WHERE email = ?',
    [normalizedEmail]
  );

  if (!targetUser) {
    const newUserId = crypto.randomUUID();
    const defaultName = name?.trim() || normalizedEmail.split('@')[0];
    const defaultPassHash = bcrypt.hashSync('Kanban123', 10);
    run('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)', [
      newUserId,
      normalizedEmail,
      defaultPassHash,
      defaultName,
    ]);
    targetUser = { id: newUserId, name: defaultName, email: normalizedEmail };
  }

  const wsMembership = queryOne<{ role: string }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [board.workspace_id, targetUser.id]
  );

  if (!wsMembership) {
    run(
      `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
       VALUES (?, ?, 'GUEST', datetime('now'))`,
      [board.workspace_id, targetUser.id]
    );
  }

  run(
    `INSERT INTO board_members (board_id, user_id, role, created_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(board_id, user_id) DO UPDATE SET role = excluded.role`,
    [id, targetUser.id, role]
  );

  logAudit({
    workspaceId: board.workspace_id,
    boardId: id,
    userId,
    action: 'BOARD_MEMBER_ADDED',
    targetType: 'USER',
    targetId: targetUser.id,
    details: {
      boardTitle: board.title,
      userEmail: targetUser.email,
      userName: targetUser.name,
      role,
      addedAsWorkspaceGuest: !wsMembership,
    },
  });

  res.status(201).json({
    board_id: id,
    user_id: targetUser.id,
    user_name: targetUser.name,
    user_email: targetUser.email,
    role,
  });
});

// PATCH /api/board/:id/members/:targetUserId - Altera o papel de um membro no quadro (BD-02)
router.patch('/:id/members/:targetUserId', (req: Request, res: Response) => {
  const result = boardMemberUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Papel inválido.' });
    return;
  }

  const userId = req.user!.id;
  const { id, targetUserId } = req.params;
  const { role: newRole } = result.data;

  if (!can(userId, 'board:manage_members', { type: 'board', id })) {
    res.status(403).json({ error: 'Sem permissão para alterar papéis neste quadro.' });
    return;
  }

  const board = queryOne<{ id: string; workspace_id: string }>('SELECT id, workspace_id FROM boards WHERE id = ?', [id]);
  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  const currentMember = queryOne<{ role: BoardRole }>(
    'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?',
    [id, targetUserId]
  );

  if (!currentMember) {
    res.status(404).json({ error: 'Membro não encontrado neste quadro.' });
    return;
  }

  if (currentMember.role === 'OWNER' && newRole !== 'OWNER' && isLastBoardOwner(id, targetUserId)) {
    res.status(400).json({
      error: 'O quadro deve ter pelo menos um Owner. Promova outro membro a Owner do quadro antes de alterar este papel.',
    });
    return;
  }

  run('UPDATE board_members SET role = ? WHERE board_id = ? AND user_id = ?', [newRole, id, targetUserId]);

  const targetUser = queryOne<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [targetUserId]);

  logAudit({
    workspaceId: board.workspace_id,
    boardId: id,
    userId,
    action: 'BOARD_MEMBER_ROLE_CHANGED',
    targetType: 'USER',
    targetId: targetUserId,
    details: {
      userName: targetUser?.name,
      userEmail: targetUser?.email,
      fromRole: currentMember.role,
      toRole: newRole,
    },
  });

  res.json({
    board_id: id,
    user_id: targetUserId,
    user_name: targetUser?.name,
    user_email: targetUser?.email,
    role: newRole,
  });
});

// DELETE /api/board/:id/members/:targetUserId - Remove membro de um quadro (BD-02)
router.delete('/:id/members/:targetUserId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, targetUserId } = req.params;

  if (!can(userId, 'board:manage_members', { type: 'board', id })) {
    res.status(403).json({ error: 'Sem permissão para remover membros deste quadro.' });
    return;
  }

  const board = queryOne<{ id: string; workspace_id: string }>('SELECT id, workspace_id FROM boards WHERE id = ?', [id]);
  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  const currentMember = queryOne<{ role: BoardRole }>(
    'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?',
    [id, targetUserId]
  );

  if (!currentMember) {
    res.status(404).json({ error: 'Membro não encontrado neste quadro.' });
    return;
  }

  if (currentMember.role === 'OWNER' && isLastBoardOwner(id, targetUserId)) {
    res.status(400).json({
      error: 'Não é possível remover o único Owner do quadro.',
    });
    return;
  }

  const targetUser = queryOne<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [targetUserId]);

  run('DELETE FROM board_members WHERE board_id = ? AND user_id = ?', [id, targetUserId]);

  logAudit({
    workspaceId: board.workspace_id,
    boardId: id,
    userId,
    action: 'BOARD_MEMBER_REMOVED',
    targetType: 'USER',
    targetId: targetUserId,
    details: {
      userName: targetUser?.name,
      userEmail: targetUser?.email,
      previousRole: currentMember.role,
    },
  });

  res.json({ message: 'Membro removido do quadro com sucesso.' });
});

// DELETE /api/board/:id - Arquiva um quadro (Soft delete)
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'board:delete', { type: 'board', id })) {
    res.status(403).json({ error: 'Apenas o Owner pode arquivar ou excluir este quadro.' });
    return;
  }

  const board = queryOne<{ id: string; workspace_id: string; title: string }>(
    `SELECT id, workspace_id, title FROM boards
     WHERE id = ? AND (is_archived = 0 OR is_archived IS NULL)`,
    [id]
  );

  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  run("UPDATE boards SET is_archived = 1, archived_at = datetime('now') WHERE id = ?", [id]);

  logAudit({
    workspaceId: board.workspace_id,
    boardId: id,
    userId,
    action: 'BOARD_ARCHIVED',
    targetType: 'BOARD',
    targetId: id,
    details: { title: board.title },
  });

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
