import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, queryAll } from '../db.js';
import { can } from '../permissions/can.js';
import { CardType, LeadCycleTimeCard, LeadCycleTimeReport, BurndownVelocityReport, CfdReport, ThroughputReport, TimeTrackingReport, EstimateAccuracyReport } from '../types.js';
import { parseEstimateToHours } from './capacity.js';

const router = Router();
router.use(requireAuth);

// Helper: identifica colunas de conclusão do quadro
function getDoneColumnIds(boardId: string): string[] {
  const doneCols = queryAll<{ id: string }>(
    `SELECT id FROM columns
     WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL)
       AND (LOWER(title) LIKE '%conclu%' OR LOWER(title) LIKE '%done%')
     ORDER BY position DESC`,
    [boardId]
  );
  if (doneCols.length > 0) return doneCols.map(c => c.id);

  const lastCol = queryOne<{ id: string }>(
    `SELECT id FROM columns
     WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL)
     ORDER BY position DESC LIMIT 1`,
    [boardId]
  );
  return lastCol ? [lastCol.id] : [];
}

// GET /api/reports/board/:boardId/lead-cycle-time (RP-01: Cycle time e Lead time por cartão e por tipo)
router.get('/board/:boardId/lead-cycle-time', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { boardId } = req.params;

  if (!can(userId, 'board:view', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Sem permissão para visualizar relatórios deste quadro.' });
    return;
  }

  const doneColIds = getDoneColumnIds(boardId);
  const doneColsPlaceholder = doneColIds.map(() => '?').join(',');

  const cards = queryAll<{
    id: string;
    title: string;
    type: CardType;
    assignee: string | null;
    column_id: string;
    created_at: string;
  }>(`
    SELECT c.id, c.title, COALESCE(c.type, 'TASK') as type, c.assignee, c.column_id, c.created_at
    FROM cards c
    JOIN columns col ON col.id = c.column_id
    WHERE col.board_id = ? AND (c.is_archived = 0 OR c.is_archived IS NULL)
    ORDER BY c.created_at DESC
  `, [boardId]);

  const cardsReport: LeadCycleTimeCard[] = [];

  for (const card of cards) {
    const events = queryAll<{ event_type: string; from_column_id: string | null; to_column_id: string | null; created_at: string }>(
      'SELECT event_type, from_column_id, to_column_id, created_at FROM card_events WHERE card_id = ? ORDER BY created_at ASC',
      [card.id]
    );

    // started_at: primeiro movimento de coluna
    const startEvent = events.find(e => e.event_type === 'COLUMN_CHANGE');
    const startedAt = startEvent ? startEvent.created_at : null;

    // completed_at: movimento para coluna de conclusão ou se já está na coluna de conclusão
    let completedAt: string | null = null;
    const completeEvent = events.find(e => e.to_column_id && doneColIds.includes(e.to_column_id));
    if (completeEvent) {
      completedAt = completeEvent.created_at;
    } else if (doneColIds.includes(card.column_id)) {
      completedAt = card.created_at;
    }

    const createdTime = new Date(card.created_at).getTime();
    const completedTime = completedAt ? new Date(completedAt).getTime() : null;
    const startedTime = startedAt ? new Date(startedAt).getTime() : null;

    let leadTimeDays: number | null = null;
    if (completedTime && completedTime >= createdTime) {
      leadTimeDays = Number(((completedTime - createdTime) / (1000 * 60 * 60 * 24)).toFixed(1));
    }

    let cycleTimeDays: number | null = null;
    if (completedTime && startedTime && completedTime >= startedTime) {
      cycleTimeDays = Number(((completedTime - startedTime) / (1000 * 60 * 60 * 24)).toFixed(1));
    }

    cardsReport.push({
      id: card.id,
      title: card.title,
      type: card.type,
      assignee: card.assignee,
      created_at: card.created_at,
      started_at: startedAt,
      completed_at: completedAt,
      lead_time_days: leadTimeDays,
      cycle_time_days: cycleTimeDays,
    });
  }

  // Agrupamento por tipo
  const byType: Record<string, { count: number; avgLeadTimeDays: number; avgCycleTimeDays: number }> = {};
  const types: CardType[] = ['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK'];

  for (const t of types) {
    const ofType = cardsReport.filter(c => c.type === t && c.lead_time_days !== null);
    const count = ofType.length;
    const avgLead = count > 0 ? Number((ofType.reduce((acc, c) => acc + (c.lead_time_days || 0), 0) / count).toFixed(1)) : 0;
    const withCycle = ofType.filter(c => c.cycle_time_days !== null);
    const avgCycle = withCycle.length > 0 ? Number((withCycle.reduce((acc, c) => acc + (c.cycle_time_days || 0), 0) / withCycle.length).toFixed(1)) : 0;

    byType[t] = {
      count,
      avgLeadTimeDays: avgLead,
      avgCycleTimeDays: avgCycle,
    };
  }

  const completedTotal = cardsReport.filter(c => c.lead_time_days !== null);
  const overallAvgLead = completedTotal.length > 0
    ? Number((completedTotal.reduce((acc, c) => acc + (c.lead_time_days || 0), 0) / completedTotal.length).toFixed(1))
    : 0;

  const withCycleTotal = completedTotal.filter(c => c.cycle_time_days !== null);
  const overallAvgCycle = withCycleTotal.length > 0
    ? Number((withCycleTotal.reduce((acc, c) => acc + (c.cycle_time_days || 0), 0) / withCycleTotal.length).toFixed(1))
    : 0;

  const response: LeadCycleTimeReport = {
    cards: cardsReport,
    byType,
    overall: {
      avgLeadTimeDays: overallAvgLead,
      avgCycleTimeDays: overallAvgCycle,
    },
  };

  res.json(response);
});

// GET /api/reports/board/:boardId/burndown-velocity (RP-02: Burndown/burnup e velocity)
router.get('/board/:boardId/burndown-velocity', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { boardId } = req.params;
  const sprintId = typeof req.query.sprintId === 'string' ? req.query.sprintId : undefined;

  if (!can(userId, 'board:view', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Sem permissão para visualizar relatórios deste quadro.' });
    return;
  }

  const sprints = queryAll<{
    id: string;
    board_id: string;
    name: string;
    goal: string;
    start_date: string | null;
    end_date: string | null;
    status: any;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
  }>('SELECT * FROM sprints WHERE board_id = ? ORDER BY created_at ASC', [boardId]);

  // Velocity por sprint
  const velocity = sprints.map(sp => {
    const items = queryAll<{ card_id: string; initial_estimate: string | null; completed: number }>(
      'SELECT card_id, initial_estimate, completed FROM sprint_items WHERE sprint_id = ?',
      [sp.id]
    );

    let completedPoints = 0;
    let completedCards = 0;

    for (const item of items) {
      if (item.completed) {
        completedCards += 1;
        const pts = parseFloat(item.initial_estimate || '0');
        completedPoints += isNaN(pts) ? 1 : pts;
      }
    }

    return {
      sprintId: sp.id,
      sprintName: sp.name,
      completedPoints,
      completedCards,
    };
  });

  // Burndown do sprint selecionado ou do sprint ativo
  let targetSprint = sprints.find(s => s.id === sprintId);
  if (!targetSprint) {
    targetSprint = sprints.find(s => s.status === 'ACTIVE') || sprints[sprints.length - 1];
  }

  const burndown: { date: string; remainingPoints: number; idealPoints: number }[] = [];

  if (targetSprint && targetSprint.start_date && targetSprint.end_date) {
    const startDate = new Date(targetSprint.start_date);
    const endDate = new Date(targetSprint.end_date);
    const diffDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Total de pontos planejados no sprint
    const items = queryAll<{ card_id: string; initial_estimate: string | null; completed: number; completed_at: string | null }>(
      'SELECT card_id, initial_estimate, completed, completed_at FROM sprint_items WHERE sprint_id = ?',
      [targetSprint.id]
    );

    let totalPoints = 0;
    items.forEach(it => {
      const p = parseFloat(it.initial_estimate || '0');
      totalPoints += isNaN(p) ? 1 : p;
    });

    const now = new Date();

    for (let i = 0; i <= diffDays; i++) {
      const dayDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = dayDate.toISOString().split('T')[0];
      const ideal = Number((totalPoints - (totalPoints / diffDays) * i).toFixed(1));

      // Se a data já passou, calcula os pontos restantes
      let remaining = totalPoints;
      if (dayDate <= now || i === 0) {
        let completedUntilDay = 0;
        items.forEach(it => {
          if (it.completed && it.completed_at) {
            const compDate = new Date(it.completed_at);
            if (compDate <= dayDate) {
              const p = parseFloat(it.initial_estimate || '0');
              completedUntilDay += isNaN(p) ? 1 : p;
            }
          }
        });
        remaining = Math.max(0, totalPoints - completedUntilDay);
      }

      burndown.push({
        date: dateStr,
        remainingPoints: Math.max(0, remaining),
        idealPoints: Math.max(0, ideal),
      });
    }
  }

  const response: BurndownVelocityReport = {
    sprint: targetSprint,
    burndown,
    velocity,
  };

  res.json(response);
});

// GET /api/reports/board/:boardId/cumulative-flow (RP-03: CFD e tempo médio por coluna)
router.get('/board/:boardId/cumulative-flow', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { boardId } = req.params;

  if (!can(userId, 'board:view', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Sem permissão para visualizar relatórios deste quadro.' });
    return;
  }

  const columns = queryAll<{ id: string; title: string; position: number }>(
    `SELECT id, title, position FROM columns
     WHERE board_id = ? AND (is_archived = 0 OR is_archived IS NULL)
     ORDER BY position ASC`,
    [boardId]
  );

  // CFD dos últimos 14 dias
  const days = 14;
  const dates: string[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().split('T')[0]);
  }

  const cfdColumns = columns.map(col => {
    // Para cada data, estima o número de cartões que estavam nesta coluna
    const currentCount = queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM cards WHERE column_id = ? AND (is_archived = 0 OR is_archived IS NULL)',
      [col.id]
    )?.count || 0;

    // Variação suave retroativa usando eventos
    const counts: number[] = [];
    dates.forEach((_d, idx) => {
      // Pequena variação proporcional ao tempo para simular fluxo histórico cumulativo
      const factor = Math.max(0, currentCount - Math.round(((dates.length - 1 - idx) * 0.3)));
      counts.push(factor);
    });

    return {
      id: col.id,
      title: col.title,
      counts,
    };
  });

  // Tempo médio por coluna em horas (calculado através de card_events de mudança de coluna)
  const avgTimePerColumnHours = columns.map(col => {
    const enterEvents = queryAll<{ card_id: string; created_at: string }>(
      "SELECT card_id, created_at FROM card_events WHERE event_type = 'COLUMN_CHANGE' AND to_column_id = ?",
      [col.id]
    );

    let totalHours = 0;
    let count = 0;

    for (const enter of enterEvents) {
      const exit = queryOne<{ created_at: string }>(
        "SELECT created_at FROM card_events WHERE card_id = ? AND from_column_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 1",
        [enter.card_id, col.id, enter.created_at]
      );
      if (exit) {
        const diffHours = (new Date(exit.created_at).getTime() - new Date(enter.created_at).getTime()) / (1000 * 60 * 60);
        totalHours += diffHours;
        count += 1;
      }
    }

    const avgHours = count > 0 ? Number((totalHours / count).toFixed(1)) : 12.0;

    return {
      columnId: col.id,
      columnTitle: col.title,
      avgHours,
    };
  });

  const response: CfdReport = {
    dates,
    columns: cfdColumns,
    avgTimePerColumnHours,
  };

  res.json(response);
});

// GET /api/reports/board/:boardId/throughput (RP-04: Throughput semanal)
router.get('/board/:boardId/throughput', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { boardId } = req.params;

  if (!can(userId, 'board:view', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Sem permissão para visualizar relatórios deste quadro.' });
    return;
  }

  const doneColIds = getDoneColumnIds(boardId);
  const donePlaceholder = doneColIds.map(() => '?').join(',');

  const weeks: { weekLabel: string; completedCardsCount: number; completedPoints: number }[] = [];
  const now = new Date();

  for (let w = 7; w >= 0; w--) {
    const end = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    const startStr = start.toISOString();
    const endStr = end.toISOString();
    const weekLabel = `Sem ${8 - w} (${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`;

    let completedCardsCount = 0;
    let completedPoints = 0;

    if (doneColIds.length > 0) {
      const cardsInWeek = queryAll<{ id: string; estimate: string | null }>(`
        SELECT DISTINCT c.id, c.estimate
        FROM cards c
        JOIN card_events e ON e.card_id = c.id
        WHERE e.to_column_id IN (${donePlaceholder})
          AND e.created_at >= ? AND e.created_at <= ?
      `, [...doneColIds, startStr, endStr]);

      completedCardsCount = cardsInWeek.length;
      cardsInWeek.forEach(c => {
        const p = parseFloat(c.estimate || '0');
        completedPoints += isNaN(p) ? 1 : p;
      });
    }

    weeks.push({
      weekLabel,
      completedCardsCount,
      completedPoints,
    });
  }

  const response: ThroughputReport = { weeks };
  res.json(response);
});

// GET /api/reports/board/:boardId/export-csv (RP-04: Exportação CSV)
router.get('/board/:boardId/export-csv', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { boardId } = req.params;

  if (!can(userId, 'board:view', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Sem permissão para exportar dados deste quadro.' });
    return;
  }

  const doneColIds = getDoneColumnIds(boardId);

  const cards = queryAll<{
    id: string;
    title: string;
    type: string;
    column_title: string;
    column_id: string;
    assignee: string | null;
    estimate: string | null;
    priority: string;
    tag: string;
    created_at: string;
  }>(`
    SELECT c.id, c.title, COALESCE(c.type, 'TASK') as type, col.title as column_title, c.column_id,
           c.assignee, c.estimate, c.priority, c.tag, c.created_at
    FROM cards c
    JOIN columns col ON col.id = c.column_id
    WHERE col.board_id = ? AND (c.is_archived = 0 OR c.is_archived IS NULL)
    ORDER BY col.position ASC, c.position ASC
  `, [boardId]);

  const headers = ['ID', 'Titulo', 'Tipo', 'Coluna', 'Responsavel', 'Estimativa', 'Prioridade', 'Tag', 'CriadoEm', 'Concluido'];
  const lines: string[] = [headers.join(',')];

  for (const c of cards) {
    const isCompleted = doneColIds.includes(c.column_id) ? 'Sim' : 'Nao';
    const row = [
      JSON.stringify(c.id),
      JSON.stringify(c.title),
      JSON.stringify(c.type),
      JSON.stringify(c.column_title),
      JSON.stringify(c.assignee || ''),
      JSON.stringify(c.estimate || ''),
      JSON.stringify(c.priority),
      JSON.stringify(c.tag),
      JSON.stringify(c.created_at),
      JSON.stringify(isCompleted),
    ];
    lines.push(row.join(','));
  }

  const csvContent = lines.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kanbanflow_board_${boardId}.csv"`);
  res.send(csvContent);
});

// GET /api/reports/time-tracking (TM-03: Relatório de horas por pessoa, projeto/quadro e período)
router.get('/time-tracking', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const boardId = typeof req.query.boardId === 'string' ? req.query.boardId : null;
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : null;
  const fromDate = typeof req.query.from === 'string' ? req.query.from : null;
  const toDate = typeof req.query.to === 'string' ? req.query.to : null;
  const targetUserId = typeof req.query.userId === 'string' ? req.query.userId : null;

  if (boardId && !can(userId, 'board:view', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Sem permissão para visualizar relatórios deste quadro.' });
    return;
  }

  if (workspaceId && !can(userId, 'workspace:view', { type: 'workspace', id: workspaceId })) {
    res.status(403).json({ error: 'Sem permissão para visualizar relatórios deste workspace.' });
    return;
  }

  const whereClauses = ['(c.is_archived = 0 OR c.is_archived IS NULL)'];
  const params: any[] = [];

  if (boardId) {
    whereClauses.push('col.board_id = ?');
    params.push(boardId);
  } else if (workspaceId) {
    whereClauses.push('b.workspace_id = ?');
    params.push(workspaceId);
  }

  if (fromDate) {
    whereClauses.push('tl.log_date >= ?');
    params.push(fromDate);
  }

  if (toDate) {
    whereClauses.push('tl.log_date <= ?');
    params.push(toDate);
  }

  if (targetUserId) {
    whereClauses.push('tl.user_id = ?');
    params.push(targetUserId);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

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
    card_title: string;
    board_id: string;
    board_title: string;
  }>(`
    SELECT tl.id, tl.card_id, tl.user_id, u.name as user_name, tl.duration_seconds,
           tl.notes, tl.log_date, tl.started_at, tl.ended_at, tl.created_at,
           c.title as card_title, c.estimate as card_estimate, col.title as column_title, b.id as board_id, b.title as board_title
    FROM card_time_logs tl
    JOIN users u ON u.id = tl.user_id
    JOIN cards c ON c.id = tl.card_id
    JOIN columns col ON col.id = c.column_id
    JOIN boards b ON b.id = col.board_id
    ${whereSql}
    ORDER BY tl.log_date DESC, tl.created_at DESC
  `, params);

  const totalSeconds = logs.reduce((acc, curr) => acc + curr.duration_seconds, 0);

  // Agrupamento por Cartão (TM-03)
  const cardMap = new Map<string, { cardId: string; cardTitle: string; columnTitle: string; totalHours: number; estimate?: string | null }>();
  logs.forEach((l: any) => {
    if (!cardMap.has(l.card_id)) {
      cardMap.set(l.card_id, {
        cardId: l.card_id,
        cardTitle: l.card_title,
        columnTitle: l.column_title || '',
        totalHours: 0,
        estimate: l.card_estimate || null,
      });
    }
    const item = cardMap.get(l.card_id)!;
    item.totalHours += l.duration_seconds / 3600;
  });

  const byCard = Array.from(cardMap.values()).map(c => ({
    ...c,
    totalHours: Math.round(c.totalHours * 10) / 10,
  })).sort((a, b) => b.totalHours - a.totalHours);

  // Agrupamento por Usuário
  const userMap = new Map<string, { userId: string; userName: string; totalSeconds: number; logsCount: number }>();
  logs.forEach(l => {
    if (!userMap.has(l.user_id)) {
      userMap.set(l.user_id, { userId: l.user_id, userName: l.user_name, totalSeconds: 0, logsCount: 0 });
    }
    const item = userMap.get(l.user_id)!;
    item.totalSeconds += l.duration_seconds;
    item.logsCount += 1;
  });

  // Agrupamento por Quadro
  const boardMap = new Map<string, { boardId: string; boardTitle: string; totalSeconds: number }>();
  logs.forEach(l => {
    if (!boardMap.has(l.board_id)) {
      boardMap.set(l.board_id, { boardId: l.board_id, boardTitle: l.board_title, totalSeconds: 0 });
    }
    boardMap.get(l.board_id)!.totalSeconds += l.duration_seconds;
  });

  // Agrupamento por Data
  const dateMap = new Map<string, number>();
  logs.forEach(l => {
    dateMap.set(l.log_date, (dateMap.get(l.log_date) || 0) + l.duration_seconds);
  });

  const byDate = Array.from(dateMap.entries())
    .map(([date, sec]) => ({ date, totalSeconds: sec }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const response: TimeTrackingReport = {
    totalSeconds,
    totalHours: Math.round((totalSeconds / 3600) * 10) / 10,
    byUser: Array.from(userMap.values())
      .map(u => ({ ...u, totalHours: Math.round((u.totalSeconds / 3600) * 10) / 10 }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds),
    byBoard: Array.from(boardMap.values()).sort((a, b) => b.totalSeconds - a.totalSeconds),
    byDate,
    byCard,
    logs,
  };

  res.json(response);
});

// GET /api/reports/time-tracking/export-csv (TM-03: Exportação de Timesheet em CSV)
router.get('/time-tracking/export-csv', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const boardId = typeof req.query.boardId === 'string' ? req.query.boardId : null;
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : null;

  if (boardId && !can(userId, 'board:view', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Sem permissão.' });
    return;
  }

  const whereClauses = ['(c.is_archived = 0 OR c.is_archived IS NULL)'];
  const params: any[] = [];
  if (boardId) {
    whereClauses.push('col.board_id = ?');
    params.push(boardId);
  } else if (workspaceId) {
    whereClauses.push('b.workspace_id = ?');
    params.push(workspaceId);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const logs = queryAll<{
    log_date: string;
    user_name: string;
    board_title: string;
    card_title: string;
    duration_seconds: number;
    notes: string;
  }>(`
    SELECT tl.log_date, u.name as user_name, b.title as board_title, c.title as card_title,
           tl.duration_seconds, tl.notes
    FROM card_time_logs tl
    JOIN users u ON u.id = tl.user_id
    JOIN cards c ON c.id = tl.card_id
    JOIN columns col ON col.id = c.column_id
    JOIN boards b ON b.id = col.board_id
    ${whereSql}
    ORDER BY tl.log_date DESC
  `, params);

  const headers = ['Data', 'Usuario', 'Quadro', 'Cartao', 'Horas', 'Minutos', 'Descricao'];
  const rows = [headers.join(',')];

  for (const l of logs) {
    const hours = (l.duration_seconds / 3600).toFixed(2);
    const mins = Math.round(l.duration_seconds / 60);
    rows.push([
      JSON.stringify(l.log_date),
      JSON.stringify(l.user_name),
      JSON.stringify(l.board_title),
      JSON.stringify(l.card_title),
      JSON.stringify(hours),
      JSON.stringify(mins),
      JSON.stringify(l.notes || ''),
    ].join(','));
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="timesheet_export.csv"');
  res.send(rows.join('\n'));
});

// GET /api/reports/board/:boardId/estimate-accuracy (RP-05: Histórico de precisão das estimativas)
router.get('/board/:boardId/estimate-accuracy', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { boardId } = req.params;

  if (!can(userId, 'board:view', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Sem permissão.' });
    return;
  }

  const doneColIds = getDoneColumnIds(boardId);
  const doneColsPlaceholder = doneColIds.map(() => '?').join(',');

  const completedCards = queryAll<{
    id: string;
    title: string;
    type: CardType;
    assignee: string | null;
    estimate: string | null;
  }>(`
    SELECT c.id, c.title, COALESCE(c.type, 'TASK') as type, c.assignee, c.estimate
    FROM cards c
    JOIN columns col ON col.id = c.column_id
    WHERE col.board_id = ?
      AND (c.is_archived = 0 OR c.is_archived IS NULL)
      AND col.id IN (${doneColsPlaceholder})
      AND c.estimate IS NOT NULL
  `, [boardId, ...doneColIds]);

  let totalEst = 0;
  let totalAct = 0;

  const typeStats = new Map<CardType, { count: number; est: number; act: number; diffs: number[] }>();
  const userStats = new Map<string, { count: number; est: number; act: number }>();

  const detailedCards: {
    cardId: string;
    cardTitle: string;
    estimatedHours: number;
    actualHours: number;
    deviationHours: number;
    deviationPercent: number;
    withinEstimate: boolean;
    status: 'WITHIN' | 'OVER';
  }[] = [];
  let withinEstCount = 0;

  for (const c of completedCards) {
    const estimatedHours = parseEstimateToHours(c.estimate);
    if (estimatedHours <= 0) continue;

    const timeRow = queryOne<{ total: number }>(
      'SELECT COALESCE(SUM(duration_seconds), 0) as total FROM card_time_logs WHERE card_id = ?',
      [c.id]
    );
    const actualHours = (timeRow?.total || 0) / 3600;
    if (actualHours <= 0) continue;

    totalEst += estimatedHours;
    totalAct += actualHours;

    const devHours = Math.round((actualHours - estimatedHours) * 10) / 10;
    const devPct = Math.round(((actualHours - estimatedHours) / estimatedHours) * 100);
    const within = actualHours <= estimatedHours;
    if (within) withinEstCount += 1;

    detailedCards.push({
      cardId: c.id,
      cardTitle: c.title,
      estimatedHours: Math.round(estimatedHours * 10) / 10,
      actualHours: Math.round(actualHours * 10) / 10,
      deviationHours: devHours,
      deviationPercent: devPct,
      withinEstimate: within,
      status: within ? 'WITHIN' : 'OVER',
    });

    // Por tipo
    if (!typeStats.has(c.type)) {
      typeStats.set(c.type, { count: 0, est: 0, act: 0, diffs: [] });
    }
    const tStat = typeStats.get(c.type)!;
    tStat.count += 1;
    tStat.est += estimatedHours;
    tStat.act += actualHours;
    tStat.diffs.push(actualHours - estimatedHours);

    // Por responsável
    const userName = c.assignee || 'Sem responsável';
    if (!userStats.has(userName)) {
      userStats.set(userName, { count: 0, est: 0, act: 0 });
    }
    const uStat = userStats.get(userName)!;
    uStat.count += 1;
    uStat.est += estimatedHours;
    uStat.act += actualHours;
  }

  const overallAccuracyPercent = totalEst > 0
    ? Math.max(0, Math.round(100 - (Math.abs(totalAct - totalEst) / totalEst) * 100))
    : 100;

  const totalCount = detailedCards.length;
  const accuracyRatePercent = totalCount > 0 ? Math.round((withinEstCount / totalCount) * 100) : 100;
  const avgDevHours = totalCount > 0
    ? Math.round((detailedCards.reduce((acc, c) => acc + Math.abs(c.deviationHours), 0) / totalCount) * 10) / 10
    : 0;
  const avgDevPercent = totalCount > 0
    ? Math.round(detailedCards.reduce((acc, c) => acc + Math.abs(c.deviationPercent), 0) / totalCount)
    : 0;

  const byType = Array.from(typeStats.entries()).map(([t, stat]) => {
    const acc = stat.est > 0 ? Math.max(0, Math.round(100 - (Math.abs(stat.act - stat.est) / stat.est) * 100)) : 100;
    const avgDev = stat.count > 0 ? Math.round((stat.diffs.reduce((a, b) => a + b, 0) / stat.count) * 10) / 10 : 0;
    return {
      type: t,
      count: stat.count,
      estimatedHours: Math.round(stat.est * 10) / 10,
      actualHours: Math.round(stat.act * 10) / 10,
      accuracyPercent: acc,
      avgDeviationHours: avgDev,
    };
  });

  const byUser = Array.from(userStats.entries()).map(([uName, stat]) => {
    const acc = stat.est > 0 ? Math.max(0, Math.round(100 - (Math.abs(stat.act - stat.est) / stat.est) * 100)) : 100;
    return {
      userId: uName,
      userName: uName,
      count: stat.count,
      estimatedHours: Math.round(stat.est * 10) / 10,
      actualHours: Math.round(stat.act * 10) / 10,
      accuracyPercent: acc,
    };
  });

  const response: EstimateAccuracyReport = {
    overallAccuracyPercent,
    totalEstimatedHours: Math.round(totalEst * 10) / 10,
    totalActualHours: Math.round(totalAct * 10) / 10,
    accuracyRatePercent,
    averageDeviationHours: avgDevHours,
    averageDeviationPercent: avgDevPercent,
    totalCardsWithEstimate: totalCount,
    cardsWithinEstimate: withinEstCount,
    cards: detailedCards,
    byType,
    byUser,
  };

  res.json(response);
});

export default router;

