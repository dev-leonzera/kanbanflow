import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, queryAll, run, createDefaultBoardForUser, logAudit, db } from '../db.js';
import { Workspace, WorkspaceRole, WorkspaceMember, AuditLog, WorkspaceCustomRole } from '../types.js';
import { can, isLastWorkspaceOwner, getEffectiveWorkspaceRole } from '../permissions/can.js';

const router = Router();
router.use(requireAuth);

const workspaceRoleEnum = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'GUEST']);

const workspaceCreateSchema = z.object({
  name: z.string().min(1, 'O nome do workspace é obrigatório.'),
  parentId: z.string().nullable().optional(),
  billingEmail: z.string().email('E-mail de cobrança inválido.').nullable().optional().or(z.literal('')),
});

const workspaceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  billingEmail: z.string().email('E-mail de cobrança inválido.').nullable().optional().or(z.literal('')),
});

const memberAddSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  name: z.string().optional(),
  role: workspaceRoleEnum.default('MEMBER'),
});

const memberUpdateRoleSchema = z.object({
  role: workspaceRoleEnum,
});

const transferOwnershipSchema = z.object({
  targetUserId: z.string().min(1, 'Selecione o usuário destino.'),
  confirmationText: z.string().min(1, 'A confirmação textual é obrigatória.'),
  demoteSelfTo: z.enum(['OWNER', 'ADMIN']).default('ADMIN'),
});

// GET /api/workspaces - Lista workspaces dos quais o usuário autenticado é membro (WS-02, WS-03, WS-06)
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const workspaces = queryAll<Workspace & { role: WorkspaceRole }>(
    `SELECT w.id, w.name, w.parent_id, pw.name as parent_name, w.billing_email,
            COALESCE(w.sso_enabled, 0) as sso_enabled, w.sso_provider, w.sso_domain,
            w.created_at, wm.role
     FROM workspaces w
     LEFT JOIN workspaces pw ON pw.id = w.parent_id
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = ?
     ORDER BY w.created_at ASC`,
    [userId]
  );

  res.json(workspaces.map(w => ({
    ...w,
    sso_enabled: Boolean(w.sso_enabled),
  })));
});

// GET /api/workspaces/:id - Detalhes do workspace
router.get('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'workspace:view', { type: 'workspace', id })) {
    res.status(404).json({ error: 'Workspace não encontrado.' });
    return;
  }

  const workspace = queryOne<Workspace & { role: WorkspaceRole }>(
    `SELECT w.id, w.name, w.parent_id, w.billing_email, w.created_at, wm.role
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE w.id = ? AND wm.user_id = ?`,
    [id, userId]
  );

  if (!workspace) {
    res.status(404).json({ error: 'Workspace não encontrado.' });
    return;
  }

  res.json(workspace);
});

// POST /api/workspaces - Cria um novo workspace e define o criador como OWNER (WS-01, WS-02, WS-06)
router.post('/', (req: Request, res: Response) => {
  const result = workspaceCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { name, parentId, billingEmail } = result.data;
  const workspaceId = crypto.randomUUID();
  const sanitizedBilling = billingEmail && billingEmail.trim() !== '' ? billingEmail.trim() : req.user!.email;

  run(
    `INSERT INTO workspaces (id, name, parent_id, billing_email, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [workspaceId, name.trim(), parentId || null, sanitizedBilling]
  );

  run(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES (?, ?, 'OWNER', datetime('now'))`,
    [workspaceId, userId]
  );

  // Inicializa um quadro padrão no novo workspace
  createDefaultBoardForUser(userId, workspaceId);

  logAudit({
    workspaceId,
    userId,
    action: 'WORKSPACE_CREATED',
    targetType: 'WORKSPACE',
    targetId: workspaceId,
    details: { name: name.trim(), billingEmail: sanitizedBilling },
  });

  res.status(201).json({
    id: workspaceId,
    name: name.trim(),
    parent_id: parentId || null,
    billing_email: sanitizedBilling,
    role: 'OWNER',
  });
});

// PATCH /api/workspaces/:id - Atualiza dados do workspace (WS-06: Contato de cobrança separado do owner)
router.patch('/:id', (req: Request, res: Response) => {
  const result = workspaceUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'workspace:edit', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Você não tem permissão para editar este workspace.' });
    return;
  }

  const current = queryOne<Workspace>('SELECT * FROM workspaces WHERE id = ?', [id]);
  if (!current) {
    res.status(404).json({ error: 'Workspace não encontrado.' });
    return;
  }

  const member = queryOne<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [id, userId]
  );

  const newName = result.data.name !== undefined ? result.data.name.trim() : current.name;
  const newParentId = result.data.parentId !== undefined ? (result.data.parentId || null) : current.parent_id;
  const newBillingEmail =
    result.data.billingEmail !== undefined
      ? (result.data.billingEmail && result.data.billingEmail.trim() !== '' ? result.data.billingEmail.trim() : null)
      : current.billing_email;

  run(
    `UPDATE workspaces SET name = ?, parent_id = ?, billing_email = ? WHERE id = ?`,
    [newName, newParentId, newBillingEmail, id]
  );

  logAudit({
    workspaceId: id,
    userId,
    action: 'WORKSPACE_UPDATED',
    targetType: 'WORKSPACE',
    targetId: id,
    details: {
      oldName: current.name,
      newName,
      oldBillingEmail: current.billing_email,
      newBillingEmail,
    },
  });

  res.json({
    id,
    name: newName,
    parent_id: newParentId,
    billing_email: newBillingEmail,
    role: member?.role || 'OWNER',
  });
});

// GET /api/workspaces/:id/members - Lista todos os membros do workspace com seus papéis (WS-03, WS-04)
router.get('/:id/members', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'workspace:view', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Sem permissão para visualizar membros deste workspace.' });
    return;
  }

  const members = queryAll<WorkspaceMember>(
    `SELECT wm.workspace_id, wm.user_id, u.name as user_name, u.email as user_email, wm.role, wm.created_at
     FROM workspace_members wm
     JOIN users u ON u.id = wm.user_id
     WHERE wm.workspace_id = ?
     ORDER BY CASE wm.role
       WHEN 'OWNER' THEN 1
       WHEN 'ADMIN' THEN 2
       WHEN 'MEMBER' THEN 3
       ELSE 4
     END, u.name ASC`,
    [id]
  );

  res.json(members);
});

// POST /api/workspaces/:id/members - Adiciona ou convida membro ao workspace com papel (WS-03, WS-04)
router.post('/:id/members', (req: Request, res: Response) => {
  const result = memberAddSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;
  const { email, name, role } = result.data;

  if (!can(userId, 'workspace:manage_members', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Apenas Owners e Admins podem gerenciar membros do workspace.' });
    return;
  }

  const callerMember = queryOne<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [id, userId]
  );

  // Apenas um OWNER pode promover outro usuário a OWNER (WS-04)
  if (role === 'OWNER' && callerMember?.role !== 'OWNER') {
    res.status(403).json({ error: 'Apenas um Owner pode adicionar outro Owner ao workspace.' });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  let targetUser = queryOne<{ id: string; name: string; email: string }>(
    'SELECT id, name, email FROM users WHERE email = ?',
    [normalizedEmail]
  );

  // Se o usuário ainda não existe no sistema, cria um registro para permitir testes e colaboração imediata
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

  const existingMember = queryOne<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [id, targetUser.id]
  );

  if (existingMember) {
    res.status(400).json({ error: 'Este usuário já é membro deste workspace.' });
    return;
  }

  run(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [id, targetUser.id, role]
  );

  logAudit({
    workspaceId: id,
    userId,
    action: 'WORKSPACE_MEMBER_ADDED',
    targetType: 'USER',
    targetId: targetUser.id,
    details: { email: targetUser.email, name: targetUser.name, role },
  });

  res.status(201).json({
    workspace_id: id,
    user_id: targetUser.id,
    user_name: targetUser.name,
    user_email: targetUser.email,
    role,
  });
});

// PATCH /api/workspaces/:id/members/:targetUserId - Altera papel de um membro (WS-03, WS-04: Regra do último owner)
router.patch('/:id/members/:targetUserId', (req: Request, res: Response) => {
  const result = memberUpdateRoleSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Papel inválido.' });
    return;
  }

  const userId = req.user!.id;
  const { id, targetUserId } = req.params;
  const { role: newRole } = result.data;

  if (!can(userId, 'workspace:manage_members', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Sem permissão para alterar papéis neste workspace.' });
    return;
  }

  const callerMember = queryOne<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [id, userId]
  );

  const targetMember = queryOne<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [id, targetUserId]
  );

  if (!targetMember) {
    res.status(404).json({ error: 'Membro não encontrado neste workspace.' });
    return;
  }

  // Apenas OWNER pode alterar papel de um OWNER ou promover alguém a OWNER
  if ((targetMember.role === 'OWNER' || newRole === 'OWNER') && callerMember?.role !== 'OWNER') {
    res.status(403).json({ error: 'Apenas um Owner pode gerenciar permissões de Owner.' });
    return;
  }

  // WS-04: Regra do último owner — não permite rebaixar o último OWNER do workspace
  if (targetMember.role === 'OWNER' && newRole !== 'OWNER') {
    if (isLastWorkspaceOwner(id, targetUserId)) {
      res.status(400).json({
        error: 'Operação bloqueada (Regra do Último Owner): o workspace deve ter pelo menos um Owner. Promova outro membro a Owner antes de alterar este papel.',
      });
      return;
    }
  }

  run(
    'UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?',
    [newRole, id, targetUserId]
  );

  const targetUser = queryOne<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [targetUserId]);

  logAudit({
    workspaceId: id,
    userId,
    action: 'WORKSPACE_MEMBER_ROLE_CHANGED',
    targetType: 'USER',
    targetId: targetUserId,
    details: {
      userName: targetUser?.name,
      userEmail: targetUser?.email,
      fromRole: targetMember.role,
      toRole: newRole,
    },
  });

  res.json({
    workspace_id: id,
    user_id: targetUserId,
    user_name: targetUser?.name,
    user_email: targetUser?.email,
    role: newRole,
  });
});

// DELETE /api/workspaces/:id/members/:targetUserId - Remove membro do workspace (WS-04: Regra do último owner)
router.delete('/:id/members/:targetUserId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, targetUserId } = req.params;

  // Permite que o próprio usuário saia ou que um gestor remova
  const isSelf = userId === targetUserId;
  if (!isSelf && !can(userId, 'workspace:manage_members', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Sem permissão para remover membros deste workspace.' });
    return;
  }

  const targetMember = queryOne<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [id, targetUserId]
  );

  if (!targetMember) {
    res.status(404).json({ error: 'Membro não encontrado neste workspace.' });
    return;
  }

  const callerMember = queryOne<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [id, userId]
  );

  if (targetMember.role === 'OWNER' && callerMember?.role !== 'OWNER') {
    res.status(403).json({ error: 'Apenas um Owner pode remover outro Owner.' });
    return;
  }

  // WS-04: Regra do último owner — não permite remover o último OWNER
  if (targetMember.role === 'OWNER' && isLastWorkspaceOwner(id, targetUserId)) {
    res.status(400).json({
      error: 'Operação bloqueada (Regra do Último Owner): não é possível remover o único Owner do workspace. Transfira a propriedade ou adicione outro Owner primeiro.',
    });
    return;
  }

  const targetUser = queryOne<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [targetUserId]);

  run('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [id, targetUserId]);

  logAudit({
    workspaceId: id,
    userId,
    action: 'WORKSPACE_MEMBER_REMOVED',
    targetType: 'USER',
    targetId: targetUserId,
    details: {
      userName: targetUser?.name,
      userEmail: targetUser?.email,
      previousRole: targetMember.role,
    },
  });

  res.json({ message: 'Membro removido do workspace com sucesso.' });
});

// POST /api/workspaces/:id/transfer-ownership - Transferência de propriedade com confirmação explícita (WS-05)
router.post('/:id/transfer-ownership', (req: Request, res: Response) => {
  const result = transferOwnershipSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;
  const { targetUserId, confirmationText, demoteSelfTo } = result.data;

  if (!can(userId, 'workspace:transfer_ownership', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Apenas um Owner atual pode transferir a propriedade do workspace.' });
    return;
  }

  const workspace = queryOne<Workspace>('SELECT * FROM workspaces WHERE id = ?', [id]);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace não encontrado.' });
    return;
  }

  // Valida texto de confirmação (deve corresponder ao nome do workspace ou "TRANSFERIR")
  const expectedName = workspace.name.trim().toLowerCase();
  const provided = confirmationText.trim().toLowerCase();
  if (provided !== expectedName && provided !== 'transferir') {
    res.status(400).json({
      error: `Confirmação inválida. Digite exatamente o nome do workspace ("${workspace.name}") ou "TRANSFERIR" para confirmar.`,
    });
    return;
  }

  if (targetUserId === userId) {
    res.status(400).json({ error: 'Você já é Owner deste workspace.' });
    return;
  }

  const targetMember = queryOne<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [id, targetUserId]
  );

  if (!targetMember) {
    res.status(404).json({ error: 'O usuário destino precisa ser membro do workspace para receber a propriedade.' });
    return;
  }

  const targetUser = queryOne<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [targetUserId]);

  db.exec('BEGIN TRANSACTION');
  try {
    // Promove o destinatário para OWNER
    run(
      "UPDATE workspace_members SET role = 'OWNER' WHERE workspace_id = ? AND user_id = ?",
      [id, targetUserId]
    );

    // Atualiza o papel do próprio remetente (para ADMIN ou mantém co-OWNER)
    run(
      'UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?',
      [demoteSelfTo, id, userId]
    );

    logAudit({
      workspaceId: id,
      userId,
      action: 'WORKSPACE_OWNERSHIP_TRANSFERRED',
      targetType: 'WORKSPACE',
      targetId: id,
      details: {
        fromUserId: userId,
        toUserId: targetUserId,
        toUserName: targetUser?.name,
        toUserEmail: targetUser?.email,
        previousOwnerNewRole: demoteSelfTo,
      },
    });

    db.exec('COMMIT');
    res.json({
      message: `Propriedade transferida com sucesso para ${targetUser?.name || targetUserId}.`,
      newOwnerId: targetUserId,
      myNewRole: demoteSelfTo,
    });
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'Falha ao transferir propriedade do workspace.' });
  }
});

// GET /api/workspaces/:id/audit-logs - Lista o log de auditoria do workspace (EV-02)
router.get('/:id/audit-logs', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'workspace:view', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Sem permissão para acessar este workspace.' });
    return;
  }

  const logs = queryAll<AuditLog>(
    `SELECT a.id, a.workspace_id, a.board_id, a.user_id, u.name as user_name, u.email as user_email,
            a.action, a.target_type, a.target_id, a.details, a.created_at
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.workspace_id = ?
     ORDER BY a.created_at DESC
     LIMIT 100`,
    [id]
  );

  res.json(logs);
});

// GET /api/workspaces/:id/all-boards (PM-02: Owner do workspace vê lista e metadados de todos os quadros)
router.get('/:id/all-boards', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const role = getEffectiveWorkspaceRole(userId, id);
  if (role !== 'OWNER' && role !== 'ADMIN') {
    res.status(403).json({ error: 'Apenas Administradores e Owners do Workspace podem ver a listagem completa de metadados.' });
    return;
  }

  const boards = queryAll<{
    id: string;
    title: string;
    visibility: string;
    estimate_type: string;
    created_at: string;
    members_count: number;
    cards_count: number;
    user_is_member: number;
  }>(`
    SELECT b.id, b.title, b.visibility, b.estimate_type, b.created_at,
           (SELECT COUNT(*) FROM board_members bm WHERE bm.board_id = b.id) as members_count,
           (SELECT COUNT(*) FROM cards c JOIN columns col ON col.id = c.column_id WHERE col.board_id = b.id AND (c.is_archived = 0 OR c.is_archived IS NULL)) as cards_count,
           (SELECT COUNT(*) FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = ?) as user_is_member
    FROM boards b
    WHERE b.workspace_id = ? AND (b.is_archived = 0 OR b.is_archived IS NULL)
    ORDER BY b.created_at ASC
  `, [userId, id]);

  res.json(boards.map(b => ({
    ...b,
    user_is_member: Boolean(b.user_is_member),
  })));
});

// GET /api/workspaces/:id/sub-workspaces (WS-07: Lista sub-workspaces)
router.get('/:id/sub-workspaces', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'workspace:view', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Sem permissão para acessar este workspace.' });
    return;
  }

  const subWorkspaces = queryAll<{
    id: string;
    name: string;
    parent_id: string;
    billing_email: string | null;
    created_at: string;
    members_count: number;
    boards_count: number;
  }>(`
    SELECT w.id, w.name, w.parent_id, w.billing_email, w.created_at,
           (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) as members_count,
           (SELECT COUNT(*) FROM boards b WHERE b.workspace_id = w.id AND (b.is_archived = 0 OR b.is_archived IS NULL)) as boards_count
    FROM workspaces w
    WHERE w.parent_id = ?
    ORDER BY w.name ASC
  `, [id]);

  res.json(subWorkspaces);
});

// GET /api/workspaces/:id/hierarchy-summary (WS-07: Visão consolidada da hierarquia de workspaces)
router.get('/:id/hierarchy-summary', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'workspace:view', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Sem permissão para acessar este workspace.' });
    return;
  }

  const current = queryOne<{ id: string; name: string; parent_id: string | null }>(
    'SELECT id, name, parent_id FROM workspaces WHERE id = ?',
    [id]
  );

  if (!current) {
    res.status(404).json({ error: 'Workspace não encontrado.' });
    return;
  }

  const subWorkspaces = queryAll<{ id: string; name: string }>(
    'SELECT id, name FROM workspaces WHERE parent_id = ?',
    [id]
  );

  const allWorkspaceIds = [id, ...subWorkspaces.map(s => s.id)];
  const placeholders = allWorkspaceIds.map(() => '?').join(',');

  const totalBoards = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM boards WHERE workspace_id IN (${placeholders}) AND (is_archived = 0 OR is_archived IS NULL)`,
    allWorkspaceIds
  )?.count || 0;

  const totalCards = queryOne<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM cards c
     JOIN columns col ON col.id = c.column_id
     JOIN boards b ON b.id = col.board_id
     WHERE b.workspace_id IN (${placeholders})
       AND (c.is_archived = 0 OR c.is_archived IS NULL)
       AND (col.is_archived = 0 OR col.is_archived IS NULL)
       AND NOT (LOWER(col.title) LIKE '%conclu%' OR LOWER(col.title) LIKE '%done%')`,
    allWorkspaceIds
  )?.count || 0;

  const totalMembers = queryOne<{ count: number }>(
    `SELECT COUNT(DISTINCT user_id) as count FROM workspace_members WHERE workspace_id IN (${placeholders})`,
    allWorkspaceIds
  )?.count || 0;

  res.json({
    workspaceId: id,
    workspaceName: current.name,
    subWorkspacesCount: subWorkspaces.length,
    subWorkspaces,
    consolidatedMetrics: {
      totalWorkspaces: allWorkspaceIds.length,
      totalBoards,
      totalActiveCards: totalCards,
      totalUniqueMembers: totalMembers,
    },
  });
});

// GET /api/workspaces/:id/custom-roles (PM-07: Lista papéis customizados)
router.get('/:id/custom-roles', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'workspace:view', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Sem permissão.' });
    return;
  }

  const roles = queryAll<{
    id: string;
    workspace_id: string;
    name: string;
    description: string;
    permissions_json: string;
    created_at: string;
  }>('SELECT id, workspace_id, name, description, permissions_json, created_at FROM workspace_custom_roles WHERE workspace_id = ? ORDER BY name ASC', [id]);

  const formatted: WorkspaceCustomRole[] = roles.map(r => {
    let permissions: string[] = [];
    try {
      permissions = JSON.parse(r.permissions_json || '[]');
    } catch {
      permissions = [];
    }
    return {
      id: r.id,
      workspace_id: r.workspace_id,
      name: r.name,
      description: r.description,
      permissions,
      created_at: r.created_at,
    };
  });

  res.json(formatted);
});

// POST /api/workspaces/:id/custom-roles (PM-07: Cria papel customizado)
const customRoleCreateSchema = z.object({
  name: z.string().min(1, 'O nome do papel é obrigatório.'),
  description: z.string().optional().default(''),
  permissions: z.array(z.string()).default([]),
});

router.post('/:id/custom-roles', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'workspace:manage_members', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Apenas administradores podem criar papéis customizados.' });
    return;
  }

  const parsed = customRoleCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const roleId = crypto.randomUUID();
  const { name, description, permissions } = parsed.data;

  run(
    `INSERT INTO workspace_custom_roles (id, workspace_id, name, description, permissions_json, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [roleId, id, name.trim(), description.trim(), JSON.stringify(permissions)]
  );

  res.status(201).json({
    id: roleId,
    workspace_id: id,
    name: name.trim(),
    description: description.trim(),
    permissions,
    created_at: new Date().toISOString(),
  });
});

// DELETE /api/workspaces/:id/custom-roles/:roleId (PM-07: Remove papel customizado)
router.delete('/:id/custom-roles/:roleId', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id, roleId } = req.params;

  if (!can(userId, 'workspace:manage_members', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Sem permissão.' });
    return;
  }

  run('DELETE FROM workspace_custom_roles WHERE id = ? AND workspace_id = ?', [roleId, id]);
  res.json({ message: 'Papel customizado removido com sucesso.' });
});

// GET /api/workspaces/:id/sso (WS-08: Configuração de SSO corporativo)
router.get('/:id/sso', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'workspace:view', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Sem permissão.' });
    return;
  }

  const ws = queryOne<{ sso_enabled: number; sso_provider: string | null; sso_domain: string | null }>(
    'SELECT COALESCE(sso_enabled, 0) as sso_enabled, sso_provider, sso_domain FROM workspaces WHERE id = ?',
    [id]
  );

  res.json({
    sso_enabled: Boolean(ws?.sso_enabled),
    sso_provider: ws?.sso_provider || null,
    sso_domain: ws?.sso_domain || null,
  });
});

// PUT /api/workspaces/:id/sso (WS-08: Atualiza configuração de SSO)
const ssoUpdateSchema = z.object({
  ssoEnabled: z.boolean(),
  ssoProvider: z.string().nullable().optional(),
  ssoDomain: z.string().nullable().optional(),
});

router.put('/:id/sso', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  if (!can(userId, 'workspace:edit', { type: 'workspace', id })) {
    res.status(403).json({ error: 'Apenas proprietários podem gerenciar configurações de SSO.' });
    return;
  }

  const parsed = ssoUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const { ssoEnabled, ssoProvider, ssoDomain } = parsed.data;

  run(
    'UPDATE workspaces SET sso_enabled = ?, sso_provider = ?, sso_domain = ? WHERE id = ?',
    [ssoEnabled ? 1 : 0, ssoProvider || null, ssoDomain || null, id]
  );

  logAudit({
    workspaceId: id,
    userId,
    action: 'WORKSPACE_SSO_UPDATED',
    targetType: 'WORKSPACE',
    targetId: id,
    details: { ssoEnabled, ssoProvider, ssoDomain },
  });

  res.json({
    sso_enabled: ssoEnabled,
    sso_provider: ssoProvider || null,
    sso_domain: ssoDomain || null,
  });
});

// POST /api/workspaces/:id/sso/test-login (WS-08: Simulação de login SSO e provisionamento automático SCIM)
router.post('/:id/sso/test-login', (req: Request, res: Response) => {
  const { id } = req.params;
  const { email, name } = req.body;

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Informe um e-mail válido para testar o login SSO.' });
    return;
  }

  const ws = queryOne<{ id: string; name: string; sso_enabled: number; sso_domain: string | null }>(
    'SELECT id, name, COALESCE(sso_enabled, 0) as sso_enabled, sso_domain FROM workspaces WHERE id = ?',
    [id]
  );

  if (!ws || !ws.sso_enabled) {
    res.status(400).json({ error: 'O SSO corporativo não está ativado neste workspace.' });
    return;
  }

  // Verifica domínio se configurado
  if (ws.sso_domain && !email.toLowerCase().endsWith(`@${ws.sso_domain.toLowerCase()}`)) {
    res.status(400).json({ error: `O e-mail deve pertencer ao domínio corporativo @${ws.sso_domain}.` });
    return;
  }

  // Provisiona usuário se não existir
  let user = queryOne<{ id: string; name: string; email: string }>('SELECT id, name, email FROM users WHERE email = ?', [email]);
  if (!user) {
    const newUserId = crypto.randomUUID();
    run('INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)', [newUserId, name || email.split('@')[0], email, 'SSO_MANAGED_ACCOUNT']);
    user = { id: newUserId, name: name || email.split('@')[0], email };
  }

  // Provisiona membro no workspace se não for membro
  const member = queryOne<{ role: string }>('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?', [id, user.id]);
  if (!member) {
    run('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, "MEMBER")', [id, user.id]);
  }

  res.json({
    success: true,
    message: `Autenticação SSO bem-sucedida e usuário provisionado automaticamente no workspace "${ws.name}".`,
    user,
    provisionedAs: member?.role || 'MEMBER',
  });
});

export default router;
