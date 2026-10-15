import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { queryOne, queryAll, run, createDefaultBoardForUser } from '../db.js';
import { Workspace, WorkspaceRole } from '../types.js';

const router = Router();
router.use(requireAuth);

const workspaceCreateSchema = z.object({
  name: z.string().min(1, 'O nome do workspace é obrigatório.'),
  parentId: z.string().nullable().optional(),
  billingEmail: z.string().email('E-mail de cobrança inválido.').nullable().optional(),
});

const workspaceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
});

// GET /api/workspaces - Lista workspaces dos quais o usuário autenticado é membro (WS-02)
router.get('/', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const workspaces = queryAll<Workspace & { role: WorkspaceRole }>(
    `SELECT w.id, w.name, w.parent_id, w.billing_email, w.created_at, wm.role
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.user_id = ?
     ORDER BY w.created_at ASC`,
    [userId]
  );

  res.json(workspaces);
});

// GET /api/workspaces/:id - Detalhes do workspace
router.get('/:id', (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

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

// POST /api/workspaces - Cria um novo workspace e define o criador como OWNER (WS-01, WS-02)
router.post('/', (req: Request, res: Response) => {
  const result = workspaceCreateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { name, parentId, billingEmail } = result.data;
  const workspaceId = crypto.randomUUID();

  run(
    `INSERT INTO workspaces (id, name, parent_id, billing_email, created_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [workspaceId, name.trim(), parentId || null, billingEmail || null]
  );

  run(
    `INSERT INTO workspace_members (workspace_id, user_id, role, created_at)
     VALUES (?, ?, 'OWNER', datetime('now'))`,
    [workspaceId, userId]
  );

  // Inicializa um quadro padrão no novo workspace
  createDefaultBoardForUser(userId, workspaceId);

  res.status(201).json({
    id: workspaceId,
    name: name.trim(),
    parent_id: parentId || null,
    billing_email: billingEmail || null,
    role: 'OWNER',
  });
});

// PATCH /api/workspaces/:id - Atualiza dados do workspace (requer papel OWNER ou ADMIN)
router.patch('/:id', (req: Request, res: Response) => {
  const result = workspaceUpdateSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0]?.message || 'Dados inválidos.' });
    return;
  }

  const userId = req.user!.id;
  const { id } = req.params;

  const member = queryOne<{ role: string }>(
    `SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?`,
    [id, userId]
  );

  if (!member || !['OWNER', 'ADMIN'].includes(member.role)) {
    res.status(403).json({ error: 'Você não tem permissão para editar este workspace.' });
    return;
  }

  const current = queryOne<Workspace>('SELECT * FROM workspaces WHERE id = ?', [id]);
  if (!current) {
    res.status(404).json({ error: 'Workspace não encontrado.' });
    return;
  }

  const newName = result.data.name !== undefined ? result.data.name.trim() : current.name;
  const newParentId = result.data.parentId !== undefined ? (result.data.parentId || null) : current.parent_id;
  const newBillingEmail = result.data.billingEmail !== undefined ? (result.data.billingEmail || null) : current.billing_email;

  run(
    `UPDATE workspaces SET name = ?, parent_id = ?, billing_email = ? WHERE id = ?`,
    [newName, newParentId, newBillingEmail, id]
  );

  res.json({
    id,
    name: newName,
    parent_id: newParentId,
    billing_email: newBillingEmail,
    role: member.role,
  });
});

export default router;

