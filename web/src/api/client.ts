import { Board, Column, Card, Subtask, User, Workspace, BoardSummary } from '../types';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(endpoint, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Ocorreu um erro na requisição.');
  }

  return data as T;
}

export const api = {
  // Auth
  register: (payload: { name: string; email: string; password: string }) =>
    request<{ user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<{ user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () =>
    request<{ message: string }>('/api/auth/logout', {
      method: 'POST',
    }),

  getMe: () =>
    request<{ user: User }>('/api/auth/me'),

  // Workspaces (WS-01, WS-02)
  getWorkspaces: () =>
    request<Workspace[]>('/api/workspaces'),

  createWorkspace: (payload: { name: string; parentId?: string | null; billingEmail?: string | null }) =>
    request<Workspace>('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateWorkspace: (id: string, payload: { name?: string; billingEmail?: string | null }) =>
    request<Workspace>(`/api/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Board (BD-01)
  getBoardsList: (workspaceId?: string) => {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return request<BoardSummary[]>(`/api/board/list${query}`);
  },

  getBoard: (boardId?: string, workspaceId?: string) => {
    const params = new URLSearchParams();
    if (boardId) params.set('boardId', boardId);
    if (workspaceId) params.set('workspaceId', workspaceId);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<Board>(`/api/board${queryString}`);
  },

  createBoard: (payload: { title: string; workspaceId?: string }) =>
    request<Board>('/api/board', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBoard: (boardId: string, payload: { title: string }) =>
    request<{ id: string; title: string; workspace_id: string }>(`/api/board/${boardId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteBoard: (boardId: string) =>
    request<{ message: string }>(`/api/board/${boardId}`, {
      method: 'DELETE',
    }),

  resetBoard: (workspaceId?: string) => {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return request<Board>(`/api/board/reset${query}`, {
      method: 'POST',
    });
  },

  // Columns (BD-01)
  createColumn: (payload: { title: string; boardId?: string }) =>
    request<Column>('/api/columns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateColumn: (columnId: string, payload: { title: string }) =>
    request<Column>(`/api/columns/${columnId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteColumn: (columnId: string, permanent?: boolean) =>
    request<{ message: string }>(`/api/columns/${columnId}${permanent ? '?permanent=true' : ''}`, {
      method: 'DELETE',
    }),

  restoreColumn: (columnId: string) =>
    request<{ message: string }>(`/api/columns/${columnId}/restore`, {
      method: 'POST',
    }),

  reorderColumns: (boardId: string, columnIds: string[]) =>
    request<{ success: boolean; columnIds: string[] }>('/api/columns/reorder', {
      method: 'POST',
      body: JSON.stringify({ boardId, columnIds }),
    }),

  // Cards (CD-03, CD-04)
  createCard: (payload: {
    columnId: string;
    parentId?: string | null;
    type?: import('../types').CardType;
    title: string;
    description?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    tag?: string;
    dueDate?: string | null;
    assignee?: string | null;
    subtasks?: { title: string; done: boolean }[];
  }) =>
    request<Card>('/api/cards', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCard: (
    cardId: string,
    payload: {
      parentId?: string | null;
      type?: import('../types').CardType;
      title?: string;
      description?: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH';
      tag?: string;
      dueDate?: string | null;
      assignee?: string | null;
    }
  ) =>
    request<Card>(`/api/cards/${cardId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getCardChildren: (cardId: string) =>
    request<Card[]>(`/api/cards/${cardId}/children`),

  deleteCard: (cardId: string, permanent?: boolean) =>
    request<{ message: string }>(`/api/cards/${cardId}${permanent ? '?permanent=true' : ''}`, {
      method: 'DELETE',
    }),

  restoreCard: (cardId: string) =>
    request<{ message: string }>(`/api/cards/${cardId}/restore`, {
      method: 'POST',
    }),

  getCardEvents: (cardId: string) =>
    request<import('../types').CardEvent[]>(`/api/cards/${cardId}/events`),

  moveCard: (cardId: string, payload: { targetColumnId: string; newPosition: number }) =>
    request<{ success: boolean; cardId: string; targetColumnId: string; newPosition: number }>(
      `/api/cards/${cardId}/move`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  // Subtasks
  createSubtask: (payload: { cardId: string; title: string; done?: boolean }) =>
    request<Subtask>('/api/subtasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSubtask: (subtaskId: string, payload: { title?: string; done?: boolean }) =>
    request<Subtask>(`/api/subtasks/${subtaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteSubtask: (subtaskId: string) =>
    request<{ message: string }>(`/api/subtasks/${subtaskId}`, {
      method: 'DELETE',
    }),
};
