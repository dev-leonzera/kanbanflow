import { queryOne } from '../db.js';
import { WorkspaceRole, BoardRole, BoardVisibility } from '../types.js';

// BD-04: Ações de permissão por recurso
export type WorkspaceAction =
  | 'workspace:view'
  | 'workspace:edit'
  | 'workspace:manage_members'
  | 'workspace:transfer_ownership'
  | 'workspace:create_board'
  | 'workspace:view_audit';

export type BoardAction =
  | 'board:view'
  | 'board:edit'
  | 'board:delete'
  | 'board:manage_members'
  | 'board:edit_content' // criar/editar/mover/arquivar colunas, cartões e subtarefas
  | 'board:comment'      // comentar no quadro/cartão
  | 'card:move'
  | 'card:delete'
  | 'card:archive'
  | 'card:change_due_date';

export type PermissionAction = WorkspaceAction | BoardAction;

// Conjuntos de permissões por papel do Workspace (WS-03, BD-04)
export const WORKSPACE_ROLE_PERMISSIONS: Record<WorkspaceRole, WorkspaceAction[]> = {
  OWNER: [
    'workspace:view',
    'workspace:edit',
    'workspace:manage_members',
    'workspace:transfer_ownership',
    'workspace:create_board',
    'workspace:view_audit',
  ],
  ADMIN: [
    'workspace:view',
    'workspace:edit',
    'workspace:manage_members',
    'workspace:create_board',
    'workspace:view_audit',
  ],
  MEMBER: [
    'workspace:view',
    'workspace:create_board',
  ],
  GUEST: [
    'workspace:view', // Restrito apenas aos quadros compartilhados (BD-05)
  ],
};

// Conjuntos de permissões por papel do Quadro (BD-02, BD-04, PM-06)
export const BOARD_ROLE_PERMISSIONS: Record<BoardRole, BoardAction[]> = {
  OWNER: [
    'board:view',
    'board:edit',
    'board:delete',
    'board:manage_members',
    'board:edit_content',
    'board:comment',
    'card:move',
    'card:delete',
    'card:archive',
    'card:change_due_date',
  ],
  EDITOR: [
    'board:view',
    'board:edit_content',
    'board:comment',
    'card:move',
    'card:delete',
    'card:archive',
    'card:change_due_date',
  ],
  COMMENTER: [
    'board:view',
    'board:comment',
  ],
  VIEWER: [
    'board:view',
  ],
};

export interface PermissionResource {
  type: 'workspace' | 'board';
  id: string;
  workspaceId?: string;
}

/**
 * Obtém o papel efetivo do usuário em um workspace (WS-03).
 */
export function getEffectiveWorkspaceRole(userId: string, workspaceId: string): WorkspaceRole | null {
  const row = queryOne<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [workspaceId, userId]
  );
  return row?.role || null;
}

/**
 * Obtém o papel efetivo do usuário em um quadro (BD-02, BD-03, BD-05).
 * Regra:
 * 1. Se o usuário está em board_members, seu papel explícito prevalece (ou combina com papel superior de workspace).
 * 2. Se o usuário é GUEST no workspace (BD-05), ele SÓ tem acesso aos quadros em que está explicitamente em board_members.
 * 3. Se o quadro tem visibilidade 'PRIVATE' (BD-03), apenas membros explícitos em board_members (ou OWNER do quadro) têm acesso.
 * 4. Se o quadro tem visibilidade 'WORKSPACE' (BD-03):
 *    - Workspace OWNER / ADMIN -> tem acesso equivalente a OWNER/EDITOR no quadro (se não tiver papel explícito maior).
 *    - Workspace MEMBER -> tem acesso como EDITOR por padrão nos quadros visíveis ao workspace (ou conforme board_members).
 */
export function getEffectiveBoardRole(userId: string, boardId: string): BoardRole | null {
  const board = queryOne<{ id: string; workspace_id: string; user_id: string | null; visibility: BoardVisibility; is_archived: number }>(
    "SELECT id, workspace_id, user_id, COALESCE(visibility, 'WORKSPACE') as visibility, COALESCE(is_archived, 0) as is_archived FROM boards WHERE id = ?",
    [boardId]
  );

  if (!board) return null;

  const wsMember = queryOne<{ role: WorkspaceRole }>(
    'SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?',
    [board.workspace_id, userId]
  );

  const boardMember = queryOne<{ role: BoardRole }>(
    'SELECT role FROM board_members WHERE board_id = ? AND user_id = ?',
    [boardId, userId]
  );

  // Se o usuário é membro explícito do quadro (BD-02)
  if (boardMember) {
    return boardMember.role;
  }

  // PM-01: Equipes/Grupos como nível intermediário de acesso
  const teamRoles = queryOne<{ role: BoardRole }>(`
    SELECT btp.role
    FROM board_team_permissions btp
    JOIN workspace_team_members wtm ON wtm.team_id = btp.team_id
    WHERE btp.board_id = ? AND wtm.user_id = ?
    ORDER BY CASE btp.role
      WHEN 'OWNER' THEN 1
      WHEN 'EDITOR' THEN 2
      WHEN 'COMMENTER' THEN 3
      WHEN 'VIEWER' THEN 4
      ELSE 5
    END ASC
    LIMIT 1
  `, [boardId, userId]);

  if (teamRoles) {
    return teamRoles.role;
  }

  // Se o usuário foi o criador original do quadro e ainda pertence ao workspace
  if (board.user_id && board.user_id === userId && wsMember) {
    return 'OWNER';
  }

  // Se não pertence ao workspace e não está em board_members, sem acesso
  if (!wsMember) {
    return null;
  }

  // BD-05: Convidado externo (GUEST) restrito exclusivamente aos quadros em que foi adicionado em board_members
  if (wsMember.role === 'GUEST') {
    return null;
  }

  // BD-03: Quadro privado só é acessível por membros explícitos do quadro (board_members)
  if (board.visibility === 'PRIVATE') {
    return null;
  }

  // Quadro com visibilidade WORKSPACE para membros do workspace (OWNER, ADMIN, MEMBER)
  if (wsMember.role === 'OWNER' || wsMember.role === 'ADMIN') {
    return 'OWNER';
  }

  if (wsMember.role === 'MEMBER') {
    return 'EDITOR';
  }

  return null;
}

/**
 * BD-04: Função central can(user, action, resource), onde papéis são conjuntos de permissões.
 */
export function can(
  user: { id: string } | string | null | undefined,
  action: PermissionAction,
  resource: PermissionResource
): boolean {
  if (!user) return false;
  const userId = typeof user === 'string' ? user : user.id;
  if (!userId) return false;

  if (resource.type === 'workspace') {
    const wsRole = getEffectiveWorkspaceRole(userId, resource.id);
    if (!wsRole) return false;
    const allowedActions = WORKSPACE_ROLE_PERMISSIONS[wsRole] || [];
    return allowedActions.includes(action as WorkspaceAction);
  }

  if (resource.type === 'board') {
    const boardRole = getEffectiveBoardRole(userId, resource.id);
    if (!boardRole) return false;
    const allowedActions = BOARD_ROLE_PERMISSIONS[boardRole] || [];
    return allowedActions.includes(action as BoardAction);
  }

  return false;
}

/**
 * WS-04: Verifica se o usuário é o último OWNER do workspace.
 */
export function isLastWorkspaceOwner(workspaceId: string, userId: string): boolean {
  const owners = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM workspace_members WHERE workspace_id = ? AND role = 'OWNER'",
    [workspaceId]
  );
  const isTargetOwner = queryOne<{ role: string }>(
    "SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND role = 'OWNER'",
    [workspaceId, userId]
  );

  return Boolean(isTargetOwner && (owners?.count ?? 0) <= 1);
}

/**
 * Verifica se o usuário é o último OWNER do quadro.
 */
export function isLastBoardOwner(boardId: string, userId: string): boolean {
  const owners = queryOne<{ count: number }>(
    "SELECT COUNT(*) as count FROM board_members WHERE board_id = ? AND role = 'OWNER'",
    [boardId]
  );
  const isTargetOwner = queryOne<{ role: string }>(
    "SELECT role FROM board_members WHERE board_id = ? AND user_id = ? AND role = 'OWNER'",
    [boardId, userId]
  );

  return Boolean(isTargetOwner && (owners?.count ?? 0) <= 1);
}
