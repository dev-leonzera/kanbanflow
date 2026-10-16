import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, queryAll, run, logAudit } from '../db.js';
import { can, getEffectiveWorkspaceRole } from '../permissions/can.js';
import { BoardRole, WorkspaceTeam, WorkspaceTeamMember, BoardTeamPermission } from '../types.js';

const router = Router();
router.use(requireAuth);

const teamCreateSchema = z.object({
  name: z.string().min(1, 'O nome da equipe é obrigatório.'),
  description: z.string().optional().default(''),
});

const teamUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

const teamMemberAddSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
});

const boardTeamAssignSchema = z.object({
  teamId: z.string().min(1, 'Selecione a equipe.'),
  role: z.enum(['OWNER', 'EDITOR', 'COMMENTER', 'VIEWER']).default('EDITOR'),
});

// GET /api/teams/workspace/:workspaceId (PM-01: Lista equipes do workspace)
router.get('/workspace/:workspaceId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { workspaceId } = req.params;

  if (!can(userId, 'workspace:view', { type: 'workspace', id: workspaceId })) {
    res.status(403).json({ error: 'Sem permissão para visualizar este workspace.' });
    return;
  }

  const teams = queryAll<WorkspaceTeam>(`
    SELECT t.id, t.workspace_id, t.name, t.description, t.created_at,
           (SELECT COUNT(*) FROM workspace_team_members tm WHERE tm.team_id = t.id) as members_count
    FROM workspace_teams t
    WHERE t.workspace_id = ?
    ORDER BY t.name ASC
  `, [workspaceId]);

  res.json(teams);
});

// POST /api/teams/workspace/:workspaceId (PM-01: Cria equipe no workspace)
router.post('/workspace/:workspaceId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { workspaceId } = req.params;

  const wsRole = getEffectiveWorkspaceRole(userId, workspaceId);
  if (wsRole !== 'OWNER' && wsRole !== 'ADMIN') {
    res.status(403).json({ error: 'Apenas Administradores ou Owners podem criar equipes no workspace.' });
    return;
  }

  const result = teamCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const teamId = crypto.randomUUID();
  const { name, description } = result.data;

  run(
    'INSERT INTO workspace_teams (id, workspace_id, name, description, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
    [teamId, workspaceId, name.trim(), description.trim()]
  );

  // Adiciona o criador como primeiro membro da equipe
  run('INSERT INTO workspace_team_members (team_id, user_id, created_at) VALUES (?, ?, datetime(\'now\'))', [
    teamId,
    userId,
  ]);

  logAudit({
    workspaceId,
    userId,
    action: 'TEAM_CREATED',
    targetType: 'TEAM',
    targetId: teamId,
    details: { name: name.trim() },
  });

  res.status(201).json({
    id: teamId,
    workspace_id: workspaceId,
    name: name.trim(),
    description: description.trim(),
    created_at: new Date().toISOString(),
    members_count: 1,
  });
});

// GET /api/teams/:id (PM-01: Detalhes da equipe e seus membros)
router.get('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const team = queryOne<WorkspaceTeam>('SELECT * FROM workspace_teams WHERE id = ?', [id]);
  if (!team) {
    res.status(404).json({ error: 'Equipe não encontrada.' });
    return;
  }

  if (!can(userId, 'workspace:view', { type: 'workspace', id: team.workspace_id })) {
    res.status(403).json({ error: 'Sem permissão para visualizar esta equipe.' });
    return;
  }

  const members = queryAll<WorkspaceTeamMember>(`
    SELECT tm.team_id, tm.user_id, u.name as user_name, u.email as user_email, tm.created_at
    FROM workspace_team_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = ?
    ORDER BY u.name ASC
  `, [id]);

  res.json({
    ...team,
    members,
  });
});

// PATCH /api/teams/:id (PM-01: Atualiza dados da equipe)
router.patch('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const team = queryOne<WorkspaceTeam>('SELECT * FROM workspace_teams WHERE id = ?', [id]);
  if (!team) {
    res.status(404).json({ error: 'Equipe não encontrada.' });
    return;
  }

  const wsRole = getEffectiveWorkspaceRole(userId, team.workspace_id);
  if (wsRole !== 'OWNER' && wsRole !== 'ADMIN') {
    res.status(403).json({ error: 'Apenas Administradores ou Owners podem editar equipes.' });
    return;
  }

  const result = teamUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const name = result.data.name !== undefined ? result.data.name.trim() : team.name;
  const description = result.data.description !== undefined ? result.data.description.trim() : team.description;

  run('UPDATE workspace_teams SET name = ?, description = ? WHERE id = ?', [name, description, id]);

  res.json({
    ...team,
    name,
    description,
  });
});

// DELETE /api/teams/:id (PM-01: Exclui equipe)
router.delete('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const team = queryOne<WorkspaceTeam>('SELECT * FROM workspace_teams WHERE id = ?', [id]);
  if (!team) {
    res.status(404).json({ error: 'Equipe não encontrada.' });
    return;
  }

  const wsRole = getEffectiveWorkspaceRole(userId, team.workspace_id);
  if (wsRole !== 'OWNER' && wsRole !== 'ADMIN') {
    res.status(403).json({ error: 'Apenas Administradores ou Owners podem excluir equipes.' });
    return;
  }

  run('DELETE FROM workspace_teams WHERE id = ?', [id]);
  res.json({ message: 'Equipe excluída com sucesso.' });
});

// POST /api/teams/:id/members (PM-01: Adiciona membro à equipe)
router.post('/:id/members', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const team = queryOne<WorkspaceTeam>('SELECT * FROM workspace_teams WHERE id = ?', [id]);
  if (!team) {
    res.status(404).json({ error: 'Equipe não encontrada.' });
    return;
  }

  const wsRole = getEffectiveWorkspaceRole(userId, team.workspace_id);
  if (wsRole !== 'OWNER' && wsRole !== 'ADMIN') {
    res.status(403).json({ error: 'Sem permissão para gerenciar membros de equipe.' });
    return;
  }

  const result = teamMemberAddSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  let targetUserId = result.data.userId;
  if (!targetUserId && result.data.email) {
    const user = queryOne<{ id: string }>('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [result.data.email]);
    if (user) targetUserId = user.id;
  }

  if (!targetUserId) {
    res.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }

  // Verifica se o usuário pertence ao workspace
  const isWsMember = queryOne<{ user_id: string }>(
    'SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [team.workspace_id, targetUserId]
  );
  if (!isWsMember) {
    res.status(400).json({ error: 'O usuário deve ser membro do Workspace antes de entrar na equipe.' });
    return;
  }

  run('INSERT OR IGNORE INTO workspace_team_members (team_id, user_id, created_at) VALUES (?, ?, datetime(\'now\'))', [
    id,
    targetUserId,
  ]);

  res.status(201).json({ success: true, message: 'Membro adicionado à equipe.' });
});

// DELETE /api/teams/:id/members/:targetUserId (PM-01: Remove membro da equipe)
router.delete('/:id/members/:targetUserId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, targetUserId } = req.params;

  const team = queryOne<WorkspaceTeam>('SELECT * FROM workspace_teams WHERE id = ?', [id]);
  if (!team) {
    res.status(404).json({ error: 'Equipe não encontrada.' });
    return;
  }

  const wsRole = getEffectiveWorkspaceRole(userId, team.workspace_id);
  if (wsRole !== 'OWNER' && wsRole !== 'ADMIN' && userId !== targetUserId) {
    res.status(403).json({ error: 'Sem permissão para remover este membro da equipe.' });
    return;
  }

  run('DELETE FROM workspace_team_members WHERE team_id = ? AND user_id = ?', [id, targetUserId]);
  res.json({ message: 'Membro removido da equipe com sucesso.' });
});

// GET /api/teams/board/:boardId (PM-01: Lista permissões de equipe para o quadro)
router.get('/board/:boardId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { boardId } = req.params;

  if (!can(userId, 'board:view', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Sem permissão para visualizar este quadro.' });
    return;
  }

  const permissions = queryAll<BoardTeamPermission>(`
    SELECT btp.board_id, btp.team_id, t.name as team_name, btp.role, btp.created_at
    FROM board_team_permissions btp
    JOIN workspace_teams t ON t.id = btp.team_id
    WHERE btp.board_id = ?
    ORDER BY t.name ASC
  `, [boardId]);

  res.json(permissions);
});

// POST /api/teams/board/:boardId (PM-01: Atribui ou altera permissão de equipe no quadro)
router.post('/board/:boardId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { boardId } = req.params;

  if (!can(userId, 'board:manage_members', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Apenas administradores do quadro podem gerenciar equipes.' });
    return;
  }

  const result = boardTeamAssignSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos' });
    return;
  }

  const { teamId, role } = result.data;

  run(`
    INSERT INTO board_team_permissions (board_id, team_id, role, created_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(board_id, team_id) DO UPDATE SET role = excluded.role
  `, [boardId, teamId, role]);

  res.json({ success: true, boardId, teamId, role });
});

// DELETE /api/teams/board/:boardId/:teamId (PM-01: Remove acesso da equipe ao quadro)
router.delete('/board/:boardId/:teamId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { boardId, teamId } = req.params;

  if (!can(userId, 'board:manage_members', { type: 'board', id: boardId })) {
    res.status(403).json({ error: 'Apenas administradores do quadro podem remover equipes.' });
    return;
  }

  run('DELETE FROM board_team_permissions WHERE board_id = ? AND team_id = ?', [boardId, teamId]);
  res.json({ message: 'Permissão da equipe removida do quadro.' });
});

export default router;

