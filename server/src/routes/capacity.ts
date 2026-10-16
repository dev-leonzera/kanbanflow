import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, queryAll, run } from '../db.js';
import { can } from '../permissions/can.js';
import { MemberWorkloadSummary, WorkspaceMemberCapacity } from '../types.js';

const router = Router();
router.use(requireAuth);

const capacityUpdateSchema = z.object({
  weeklyCapacityHours: z.number().positive('A capacidade semanal em horas deve ser maior que zero.').default(40.0),
  sprintCapacityPoints: z.number().positive('A capacidade de pontos deve ser maior que zero.').default(20.0),
});

// Helper: converte string de estimativa em horas aproximadas
export function parseEstimateToHours(estimate?: string | null): number {
  if (!estimate || !estimate.trim()) return 0;
  const raw = estimate.trim().toLowerCase();

  // Ex: "8h", "8.5h", "8 horas"
  const hoursMatch = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:h|horas?)?$/);
  if (hoursMatch) return parseFloat(hoursMatch[1]);

  // Ex: "2d", "2 dias" (1 dia = 8 horas)
  const daysMatch = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*(?:d|dias?)$/);
  if (daysMatch) return parseFloat(daysMatch[1]) * 8;

  // Ex: "30m", "45min"
  const minsMatch = raw.match(/^([0-9]+)\s*(?:m|min|minutos?)$/);
  if (minsMatch) return parseFloat(minsMatch[1]) / 60;

  // Ex: T-Shirt sizing: P = 4h, M = 8h, G = 16h, GG = 32h
  if (raw === 'p') return 4;
  if (raw === 'm') return 8;
  if (raw === 'g') return 16;
  if (raw === 'gg') return 32;

  // Se for apenas número sem unidade, assume número de pontos (1 ponto ~ 4 horas de referência)
  const num = parseFloat(raw);
  return isNaN(num) ? 0 : num * 4;
}

export function parseEstimateToPoints(estimate?: string | null): number {
  if (!estimate || !estimate.trim()) return 0;
  const raw = estimate.trim().toLowerCase();
  const num = parseFloat(raw);
  if (!isNaN(num) && !raw.includes('h') && !raw.includes('d') && !raw.includes('m')) {
    return num;
  }
  const hours = parseEstimateToHours(estimate);
  return Math.round((hours / 4) * 10) / 10;
}

// GET /api/workspaces/:workspaceId/capacity (CP-01: Lista capacidade configurada dos membros)
router.get('/:workspaceId/capacity', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { workspaceId } = req.params;

  if (!can(userId, 'workspace:view', { type: 'workspace', id: workspaceId })) {
    res.status(403).json({ error: 'Sem permissão para visualizar este workspace.' });
    return;
  }

  const members = queryAll<{
    user_id: string;
    user_name: string;
    user_email: string;
    role: string;
  }>(`
    SELECT wm.user_id, u.name as user_name, u.email as user_email, wm.role
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ?
    ORDER BY u.name ASC
  `, [workspaceId]);

  const capacitiesRaw = queryAll<{
    id: string;
    workspace_id: string;
    user_id: string;
    weekly_capacity_hours: number;
    sprint_capacity_points: number;
    updated_at: string;
  }>(`
    SELECT id, workspace_id, user_id, weekly_capacity_hours, sprint_capacity_points, updated_at
    FROM workspace_member_capacities
    WHERE workspace_id = ?
  `, [workspaceId]);

  const capacityMap = new Map(capacitiesRaw.map(c => [c.user_id, c]));

  const result: WorkspaceMemberCapacity[] = members.map(m => {
    const existing = capacityMap.get(m.user_id);
    return {
      id: existing?.id,
      workspace_id: workspaceId,
      user_id: m.user_id,
      user_name: m.user_name,
      user_email: m.user_email,
      weekly_capacity_hours: existing ? existing.weekly_capacity_hours : 40.0,
      sprint_capacity_points: existing ? existing.sprint_capacity_points : 20.0,
      updated_at: existing?.updated_at,
    };
  });

  res.json(result);
});

// PUT /api/workspaces/:workspaceId/capacity/:targetUserId (CP-01: Configura capacidade de um membro)
router.put('/:workspaceId/capacity/:targetUserId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { workspaceId, targetUserId } = req.params;

  if (!can(userId, 'workspace:manage_members', { type: 'workspace', id: workspaceId })) {
    res.status(403).json({ error: 'Apenas administradores podem configurar a capacidade dos membros.' });
    return;
  }

  const parsed = capacityUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const { weeklyCapacityHours, sprintCapacityPoints } = parsed.data;

  const existing = queryOne<{ id: string }>(
    'SELECT id FROM workspace_member_capacities WHERE workspace_id = ? AND user_id = ?',
    [workspaceId, targetUserId]
  );

  if (existing) {
    run(
      `UPDATE workspace_member_capacities
       SET weekly_capacity_hours = ?, sprint_capacity_points = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [weeklyCapacityHours, sprintCapacityPoints, existing.id]
    );
  } else {
    const id = crypto.randomUUID();
    run(
      `INSERT INTO workspace_member_capacities (id, workspace_id, user_id, weekly_capacity_hours, sprint_capacity_points, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, workspaceId, targetUserId, weeklyCapacityHours, sprintCapacityPoints]
    );
  }

  res.json({
    workspace_id: workspaceId,
    user_id: targetUserId,
    weekly_capacity_hours: weeklyCapacityHours,
    sprint_capacity_points: sprintCapacityPoints,
  });
});

// GET /api/workspaces/:workspaceId/workload (CP-02: Visão de carga por pessoa e CP-04: Conflitos de prazo)
router.get('/:workspaceId/workload', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { workspaceId } = req.params;
  const boardId = typeof req.query.boardId === 'string' ? req.query.boardId : null;

  if (!can(userId, 'workspace:view', { type: 'workspace', id: workspaceId })) {
    res.status(403).json({ error: 'Sem permissão para visualizar carga deste workspace.' });
    return;
  }

  // Membros do workspace
  const members = queryAll<{ user_id: string; user_name: string; user_email: string }>(`
    SELECT wm.user_id, u.name as user_name, u.email as user_email
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ?
    ORDER BY u.name ASC
  `, [workspaceId]);

  // Capacidades configuradas
  const capacities = queryAll<{ user_id: string; weekly_capacity_hours: number; sprint_capacity_points: number }>(`
    SELECT user_id, weekly_capacity_hours, sprint_capacity_points
    FROM workspace_member_capacities
    WHERE workspace_id = ?
  `, [workspaceId]);
  const capMap = new Map(capacities.map(c => [c.user_id, c]));

  // Cartões ativos dos quadros visíveis
  let boardFilter = 'b.workspace_id = ?';
  const params: any[] = [workspaceId];
  if (boardId) {
    boardFilter += ' AND b.id = ?';
    params.push(boardId);
  }

  const activeCards = queryAll<{
    id: string;
    title: string;
    priority: string;
    due_date: string | null;
    estimate: string | null;
    assignee: string | null;
    board_id: string;
    board_title: string;
    column_title: string;
  }>(`
    SELECT c.id, c.title, c.priority, c.due_date, c.estimate, c.assignee,
           b.id as board_id, b.title as board_title, col.title as column_title
    FROM cards c
    JOIN columns col ON col.id = c.column_id
    JOIN boards b ON b.id = col.board_id
    WHERE ${boardFilter}
      AND (c.is_archived = 0 OR c.is_archived IS NULL)
      AND (col.is_archived = 0 OR col.is_archived IS NULL)
      AND NOT (LOWER(col.title) LIKE '%conclu%' OR LOWER(col.title) LIKE '%done%')
      AND c.assignee IS NOT NULL
  `, params);

  const workloadSummaries: MemberWorkloadSummary[] = members.map(m => {
    const userCap = capMap.get(m.user_id);
    const weeklyHours = userCap ? userCap.weekly_capacity_hours : 40.0;
    const sprintPoints = userCap ? userCap.sprint_capacity_points : 20.0;

    // Cartões do membro (comparando por nome do assignee ou email)
    const userCards = activeCards.filter(c => {
      if (!c.assignee) return false;
      const target = c.assignee.trim().toLowerCase();
      return target === m.user_name.trim().toLowerCase() || target === m.user_email.trim().toLowerCase();
    });

    let totalAllocatedHours = 0;
    let totalAllocatedPoints = 0;

    const formattedCards = userCards.map(c => {
      const h = parseEstimateToHours(c.estimate);
      const p = parseEstimateToPoints(c.estimate);
      totalAllocatedHours += h;
      totalAllocatedPoints += p;
      return {
        id: c.id,
        title: c.title,
        board_id: c.board_id,
        board_title: c.board_title,
        column_title: c.column_title,
        priority: c.priority,
        due_date: c.due_date,
        estimate: c.estimate,
        hours_estimate: h,
        points_estimate: p,
      };
    });

    // CP-04: Detecção de conflitos de prazo
    const cardsByDate = new Map<string, typeof formattedCards>();
    formattedCards.forEach(c => {
      if (c.due_date) {
        if (!cardsByDate.has(c.due_date)) {
          cardsByDate.set(c.due_date, []);
        }
        cardsByDate.get(c.due_date)!.push(c);
      }
    });

    const deadlineConflicts: MemberWorkloadSummary['deadline_conflicts'] = [];
    cardsByDate.forEach((cardsOnDate, date) => {
      const dayHours = cardsOnDate.reduce((acc, curr) => acc + curr.hours_estimate, 0);
      // Conflito se mais de 2 tarefas no mesmo dia ou mais de 8 horas combinadas
      if (cardsOnDate.length > 2 || dayHours > 8) {
        deadlineConflicts.push({
          date,
          cards_count: cardsOnDate.length,
          total_hours: Math.round(dayHours * 10) / 10,
          card_titles: cardsOnDate.map(c => c.title),
        });
      }
    });

    const utilization = weeklyHours > 0 ? Math.round((totalAllocatedHours / weeklyHours) * 100) : 0;

    return {
      user_id: m.user_id,
      user_name: m.user_name,
      user_email: m.user_email,
      weekly_capacity_hours: weeklyHours,
      sprint_capacity_points: sprintPoints,
      allocated_hours: Math.round(totalAllocatedHours * 10) / 10,
      allocated_points: Math.round(totalAllocatedPoints * 10) / 10,
      utilization_hours_percent: utilization,
      is_overloaded: totalAllocatedHours > weeklyHours,
      assigned_cards: formattedCards,
      deadline_conflicts: deadlineConflicts,
    };
  });

  res.json(workloadSummaries);
});

// GET /api/workspaces/:workspaceId/check-assignment (CP-03: Alerta de sobrecarga ao atribuir)
router.get('/:workspaceId/check-assignment', (req: Request, res: Response) => {
  const { workspaceId } = req.params;
  const assigneeName = typeof req.query.assignee === 'string' ? req.query.assignee.trim() : '';
  const cardEstimate = typeof req.query.estimate === 'string' ? req.query.estimate : '';
  const currentCardId = typeof req.query.cardId === 'string' ? req.query.cardId : '';

  if (!assigneeName) {
    res.json({ willOverload: false, message: '' });
    return;
  }

  // Encontra usuário por nome ou email
  const member = queryOne<{ user_id: string; name: string }>(`
    SELECT wm.user_id, u.name
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    WHERE wm.workspace_id = ? AND (LOWER(u.name) = LOWER(?) OR LOWER(u.email) = LOWER(?))
    LIMIT 1
  `, [workspaceId, assigneeName, assigneeName]);

  const cap = member
    ? queryOne<{ weekly_capacity_hours: number }>(
        'SELECT weekly_capacity_hours FROM workspace_member_capacities WHERE workspace_id = ? AND user_id = ?',
        [workspaceId, member.user_id]
      )
    : null;

  const weeklyCapacity = cap ? cap.weekly_capacity_hours : 40.0;

  // Soma horas já atribuídas ativas
  const existingCards = queryAll<{ id: string; estimate: string | null }>(`
    SELECT c.id, c.estimate
    FROM cards c
    JOIN columns col ON col.id = c.column_id
    JOIN boards b ON b.id = col.board_id
    WHERE b.workspace_id = ?
      AND (c.is_archived = 0 OR c.is_archived IS NULL)
      AND NOT (LOWER(col.title) LIKE '%conclu%' OR LOWER(col.title) LIKE '%done%')
      AND LOWER(c.assignee) = LOWER(?)
      AND c.id != ?
  `, [workspaceId, assigneeName, currentCardId || '']);

  let currentHours = 0;
  for (const c of existingCards) {
    currentHours += parseEstimateToHours(c.estimate);
  }

  const newCardHours = parseEstimateToHours(cardEstimate);
  const totalAfter = currentHours + newCardHours;
  const willOverload = totalAfter > weeklyCapacity;

  let message = '';
  if (willOverload) {
    message = `⚠️ Alerta de Sobrecarga: ${assigneeName} já possui ${Math.round(currentHours * 10) / 10}h alocadas. Com esta tarefa (${Math.round(newCardHours * 10) / 10}h), totalizará ${Math.round(totalAfter * 10) / 10}h (Capacidade semanal: ${weeklyCapacity}h).`;
  }

  res.json({
    willOverload,
    currentHours: Math.round(currentHours * 10) / 10,
    newCardHours: Math.round(newCardHours * 10) / 10,
    capacityHours: weeklyCapacity,
    totalAfter: Math.round(totalAfter * 10) / 10,
    message,
  });
});

export default router;

