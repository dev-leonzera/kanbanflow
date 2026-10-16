import {
  Board,
  Column,
  Card,
  Subtask,
  User,
  Workspace,
  BoardSummary,
  WorkspaceMember,
  WorkspaceRole,
  BoardMember,
  BoardRole,
  BoardVisibility,
  EstimateType,
  AuditLog,
  CardComment,
  CardAttachment,
  CardRelation,
  CardRelationType,
  SavedFilter,
  MyDayCard,
  NotificationItem,
  NotificationPreference,
  NotificationEventType,
  NotificationSettings,
  NotificationDigest,
  Subscription,
  SubscriptionLevel,
  Sprint,
  SprintReport,
  WorkspaceTeam,
  WorkspaceTeamMember,
  BoardTeamPermission,
  WorkspaceBoardMetadata,
  LeadCycleTimeReport,
  BurndownVelocityReport,
  CfdReport,
  ThroughputReport,
  CardTreeNode,
  CardTimeLog,
  ActiveCardTimer,
  WorkspaceMemberCapacity,
  MemberWorkloadSummary,
  SprintRetroItem,
  RetroCategory,
  WorkspaceCustomRole,
  TimeTrackingReport,
  EstimateAccuracyReport,
} from '../types';

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

  updateProfile: (payload: { name?: string; currentPassword?: string; newPassword?: string }) =>
    request<{ user: User; message: string }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Workspaces (WS-01, WS-02, WS-03, WS-04, WS-05, WS-06, EV-02)
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

  getWorkspaceMembers: (workspaceId: string) =>
    request<WorkspaceMember[]>(`/api/workspaces/${workspaceId}/members`),

  addWorkspaceMember: (workspaceId: string, payload: { email: string; name?: string; role: WorkspaceRole }) =>
    request<WorkspaceMember>(`/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateWorkspaceMemberRole: (workspaceId: string, userId: string, role: WorkspaceRole) =>
    request<WorkspaceMember>(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  removeWorkspaceMember: (workspaceId: string, userId: string) =>
    request<{ message: string }>(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: 'DELETE',
    }),

  transferWorkspaceOwnership: (
    workspaceId: string,
    payload: { targetUserId: string; confirmationText: string; demoteSelfTo?: 'OWNER' | 'ADMIN' }
  ) =>
    request<{ message: string; newOwnerId: string; myNewRole: string }>(
      `/api/workspaces/${workspaceId}/transfer-ownership`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getWorkspaceAuditLogs: (workspaceId: string) =>
    request<AuditLog[]>(`/api/workspaces/${workspaceId}/audit-logs`),

  // Board (BD-01, BD-02, BD-03, BD-05, CD-08, VW-01, VW-02)
  getBoardsList: (workspaceId?: string) => {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return request<BoardSummary[]>(`/api/board/list${query}`);
  },

  getBoard: (boardId?: string, workspaceId?: string, sprintId?: string) => {
    const params = new URLSearchParams();
    if (boardId) params.set('boardId', boardId);
    if (workspaceId) params.set('workspaceId', workspaceId);
    if (sprintId) params.set('sprintId', sprintId);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return request<Board>(`/api/board${queryString}`);
  },

  getMyDayCards: () =>
    request<MyDayCard[]>('/api/board/my-day'),

  createBoard: (payload: { title: string; workspaceId?: string; visibility?: BoardVisibility; estimateType?: EstimateType }) =>
    request<Board>('/api/board', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBoard: (boardId: string, payload: { title?: string; visibility?: BoardVisibility; estimateType?: EstimateType; autoArchiveDays?: number | null }) =>
    request<{ id: string; title: string; visibility: BoardVisibility; estimate_type: EstimateType; auto_archive_days?: number | null; workspace_id: string; role: BoardRole }>(
      `/api/board/${boardId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  autoArchiveCards: (boardId: string, days?: number) =>
    request<{ archivedCount: number; message: string }>(`/api/board/${boardId}/auto-archive`, {
      method: 'POST',
      body: JSON.stringify({ days }),
    }),

  createPublicLink: (boardId: string, expiresInDays?: number) =>
    request<{ public_share_token: string; public_share_expires_at: string }>(`/api/board/${boardId}/public-link`, {
      method: 'POST',
      body: JSON.stringify({ expiresInDays }),
    }),

  revokePublicLink: (boardId: string) =>
    request<{ message: string }>(`/api/board/${boardId}/public-link`, {
      method: 'DELETE',
    }),

  getPublicBoard: (token: string) =>
    request<Board & { isReadOnly: boolean }>(`/api/board/public/${token}`),

  selfPromoteToBoard: (boardId: string) =>
    request<{ message: string; role: BoardRole }>(`/api/board/${boardId}/self-promote`, {
      method: 'POST',
    }),

  getBoardTree: (boardId: string) =>
    request<CardTreeNode[]>(`/api/board/${boardId}/tree`),

  getWorkspaceAllBoards: (workspaceId: string) =>
    request<WorkspaceBoardMetadata[]>(`/api/workspaces/${workspaceId}/all-boards`),

  getSavedFilters: (boardId: string) =>
    request<SavedFilter[]>(`/api/board/${boardId}/saved-filters`),

  createSavedFilter: (
    boardId: string,
    payload: { name: string; searchQuery: string; priorityFilter: string; assigneeFilter: string }
  ) =>
    request<SavedFilter>(`/api/board/${boardId}/saved-filters`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteSavedFilter: (boardId: string, filterId: string) =>
    request<{ message: string }>(`/api/board/${boardId}/saved-filters/${filterId}`, {
      method: 'DELETE',
    }),

  getBoardMembers: (boardId: string) =>
    request<BoardMember[]>(`/api/board/${boardId}/members`),

  addBoardMember: (boardId: string, payload: { email: string; name?: string; role: BoardRole }) =>
    request<BoardMember>(`/api/board/${boardId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBoardMemberRole: (boardId: string, userId: string, role: BoardRole) =>
    request<BoardMember>(`/api/board/${boardId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  removeBoardMember: (boardId: string, userId: string) =>
    request<{ message: string }>(`/api/board/${boardId}/members/${userId}`, {
      method: 'DELETE',
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

  // Columns (BD-01, BD-06)
  createColumn: (payload: { title: string; boardId?: string; wipLimit?: number | null }) =>
    request<Column>('/api/columns', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateColumn: (columnId: string, payload: { title?: string; wipLimit?: number | null }) =>
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

  // Cards (CD-02, CD-03, CD-04, CD-06, CD-08, SP-02, PM-04, PM-05)
  createCard: (payload: {
    columnId: string;
    parentId?: string | null;
    sprintId?: string | null;
    type?: import('../types').CardType;
    visibility?: import('../types').CardVisibility;
    restricted_to_role?: string | null;
    title: string;
    description?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    tag?: string;
    dueDate?: string | null;
    assignee?: string | null;
    estimate?: string | null;
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
      sprintId?: string | null;
      type?: import('../types').CardType;
      visibility?: import('../types').CardVisibility;
      restricted_to_role?: string | null;
      title?: string;
      description?: string;
      priority?: 'LOW' | 'MEDIUM' | 'HIGH';
      tag?: string;
      dueDate?: string | null;
      assignee?: string | null;
      estimate?: string | null;
    }
  ) =>
    request<Card>(`/api/cards/${cardId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  getCardChildren: (cardId: string) =>
    request<Card[]>(`/api/cards/${cardId}/children`),

  getCardComments: (cardId: string) =>
    request<CardComment[]>(`/api/cards/${cardId}/comments`),

  addCardComment: (cardId: string, content: string) =>
    request<CardComment>(`/api/cards/${cardId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  deleteCardComment: (cardId: string, commentId: string) =>
    request<{ message: string }>(`/api/cards/${cardId}/comments/${commentId}`, {
      method: 'DELETE',
    }),

  getCardAttachments: (cardId: string) =>
    request<CardAttachment[]>(`/api/cards/${cardId}/attachments`),

  addCardAttachment: (
    cardId: string,
    payload: { name: string; url: string; sizeBytes?: number; mimeType?: string }
  ) =>
    request<CardAttachment>(`/api/cards/${cardId}/attachments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteCardAttachment: (cardId: string, attachmentId: string) =>
    request<{ message: string }>(`/api/cards/${cardId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    }),

  getCardRelations: (cardId: string) =>
    request<CardRelation[]>(`/api/cards/${cardId}/relations`),

  addCardRelation: (cardId: string, payload: { targetCardId: string; relationType: CardRelationType }) =>
    request<CardRelation>(`/api/cards/${cardId}/relations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteCardRelation: (cardId: string, relationId: string) =>
    request<{ message: string }>(`/api/cards/${cardId}/relations/${relationId}`, {
      method: 'DELETE',
    }),

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

  moveCard: (cardId: string, payload: { targetColumnId: string; newPosition: number; force?: boolean }) =>
    request<{ success: boolean; cardId: string; targetColumnId: string; newPosition: number }>(
      `/api/cards/${cardId}/move`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getOpenChildren: (cardId: string) =>
    request<{ hasOpenChildren: boolean; count: number; openChildren: any[]; message?: string }>(
      `/api/cards/${cardId}/open-children`
    ),

  // Subtasks (CD-09)
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

  promoteSubtask: (subtaskId: string) =>
    request<{ message: string; cardId: string; parentId: string; columnId: string; title: string }>(
      `/api/subtasks/${subtaskId}/promote`,
      {
        method: 'POST',
      }
    ),

  // Notifications & Subscriptions (NT-01, NT-02, NT-03, NT-04, NT-05)
  getNotifications: (params?: { filter?: string; boardId?: string }) => {
    const q = new URLSearchParams();
    if (params?.filter) q.set('filter', params.filter);
    if (params?.boardId) q.set('boardId', params.boardId);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return request<NotificationItem[]>(`/api/notifications${qs}`);
  },

  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`/api/notifications/${id}/read`, {
      method: 'PATCH',
    }),

  markAllNotificationsRead: () =>
    request<{ success: boolean }>('/api/notifications/read-all', {
      method: 'POST',
    }),

  getNotificationPreferences: () =>
    request<NotificationPreference[]>('/api/notifications/preferences'),

  saveNotificationPreferences: (
    preferences: { event_type: NotificationEventType; channel_in_app: boolean; channel_email: boolean }[]
  ) =>
    request<NotificationPreference[]>('/api/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    }),

  getNotificationSettings: () =>
    request<NotificationSettings>('/api/notifications/settings'),

  updateNotificationSettings: (payload: Partial<NotificationSettings>) =>
    request<NotificationSettings>('/api/notifications/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getNotificationDigest: (period: 'daily' | 'weekly' = 'daily') =>
    request<NotificationDigest>(`/api/notifications/digest?period=${period}`),

  getSubscription: (targetType: 'BOARD' | 'CARD', targetId: string) =>
    request<Subscription>(
      `/api/notifications/subscription?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`
    ),

  saveSubscription: (targetType: 'BOARD' | 'CARD', targetId: string, level: SubscriptionLevel) =>
    request<Subscription>('/api/notifications/subscription', {
      method: 'PUT',
      body: JSON.stringify({ targetType, targetId, level }),
    }),

  // Teams (PM-01)
  getWorkspaceTeams: (workspaceId: string) =>
    request<WorkspaceTeam[]>(`/api/teams/workspace/${workspaceId}`),

  createWorkspaceTeam: (workspaceId: string, payload: { name: string; description?: string }) =>
    request<WorkspaceTeam>(`/api/teams/workspace/${workspaceId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getTeamDetails: (teamId: string) =>
    request<WorkspaceTeam & { members: WorkspaceTeamMember[] }>(`/api/teams/${teamId}`),

  updateTeam: (teamId: string, payload: { name?: string; description?: string }) =>
    request<WorkspaceTeam>(`/api/teams/${teamId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteTeam: (teamId: string) =>
    request<{ message: string }>(`/api/teams/${teamId}`, {
      method: 'DELETE',
    }),

  addTeamMember: (teamId: string, payload: { userId?: string; email?: string }) =>
    request<{ success: boolean; message: string }>(`/api/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  removeTeamMember: (teamId: string, userId: string) =>
    request<{ message: string }>(`/api/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
    }),

  getBoardTeams: (boardId: string) =>
    request<BoardTeamPermission[]>(`/api/teams/board/${boardId}`),

  assignBoardTeam: (boardId: string, payload: { teamId: string; role: BoardRole }) =>
    request<{ success: boolean }>(`/api/teams/board/${boardId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  removeBoardTeam: (boardId: string, teamId: string) =>
    request<{ message: string }>(`/api/teams/board/${boardId}/${teamId}`, {
      method: 'DELETE',
    }),

  // Reports (RP-01, RP-02, RP-03, RP-04)
  getLeadCycleTimeReport: (boardId: string) =>
    request<LeadCycleTimeReport>(`/api/reports/board/${boardId}/lead-cycle-time`),

  getBurndownVelocityReport: (boardId: string, sprintId?: string) => {
    const qs = sprintId ? `?sprintId=${encodeURIComponent(sprintId)}` : '';
    return request<BurndownVelocityReport>(`/api/reports/board/${boardId}/burndown-velocity${qs}`);
  },

  getCfdReport: (boardId: string) =>
    request<CfdReport>(`/api/reports/board/${boardId}/cumulative-flow`),

  getThroughputReport: (boardId: string) =>
    request<ThroughputReport>(`/api/reports/board/${boardId}/throughput`),

  getExportCsvUrl: (boardId: string) =>
    `/api/reports/board/${boardId}/export-csv`,

  // Sprints (SP-01, SP-02, SP-03, SP-04)
  getSprints: (boardId: string) =>
    request<Sprint[]>(`/api/sprints?boardId=${encodeURIComponent(boardId)}`),

  createSprint: (payload: {
    boardId: string;
    name: string;
    goal?: string;
    startDate?: string | null;
    endDate?: string | null;
  }) =>
    request<Sprint>('/api/sprints', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSprint: (
    id: string,
    payload: {
      name?: string;
      goal?: string;
      startDate?: string | null;
      endDate?: string | null;
    }
  ) =>
    request<Sprint>(`/api/sprints/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteSprint: (id: string) =>
    request<{ message: string }>(`/api/sprints/${id}`, {
      method: 'DELETE',
    }),

  startSprint: (id: string) =>
    request<{ message: string; sprintId: string }>(`/api/sprints/${id}/start`, {
      method: 'POST',
    }),

  closeSprint: (
    id: string,
    payload: { moveToNextSprintId?: string | null; moveToBacklog?: boolean }
  ) =>
    request<{
      message: string;
      completedCount: number;
      incompleteCount: number;
      destination: string;
    }>(`/api/sprints/${id}/close`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSprintReport: (id: string) =>
    request<SprintReport>(`/api/sprints/${id}/report`),

  assignCardsToSprint: (payload: { sprintId: string | null; cardIds: string[] }) =>
    request<{ success: boolean; sprintId: string | null; count: number }>(
      '/api/sprints/assign-cards',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  // TM-01 & TM-02: Time Tracking
  getActiveTimer: () =>
    request<ActiveCardTimer | null>('/api/cards/timer/active'),

  getCardTimeLogs: (cardId: string) =>
    request<{
      logs: CardTimeLog[];
      totalSeconds: number;
      totalHours: number;
      estimatedHours: number;
      deviationHours: number | null;
      deviationPercent: number | null;
      activeTimer: ActiveCardTimer | null;
    }>(`/api/cards/${cardId}/time-logs`),

  addCardTimeLog: (cardId: string, durationSeconds: number, notes?: string, logDate?: string) =>
    request<CardTimeLog>(`/api/cards/${cardId}/time-logs`, {
      method: 'POST',
      body: JSON.stringify({ durationSeconds, notes, logDate }),
    }),

  createCardTimeLog: (cardId: string, payload: { hours: number; description?: string; loggedAt?: string }) =>
    request<CardTimeLog>(`/api/cards/${cardId}/time-logs`, {
      method: 'POST',
      body: JSON.stringify({
        durationSeconds: Math.round(payload.hours * 3600),
        notes: payload.description,
        logDate: payload.loggedAt,
      }),
    }),

  deleteCardTimeLog: (cardId: string, logId: string) =>
    request<{ message: string }>(`/api/cards/${cardId}/time-logs/${logId}`, {
      method: 'DELETE',
    }),

  startCardTimer: (cardId: string) =>
    request<{ active: boolean; timerId: string; cardId: string; cardTitle: string; startedAt: string }>(
      `/api/cards/${cardId}/timer/start`,
      { method: 'POST' }
    ),

  stopCardTimer: (cardId: string, notes?: string) =>
    request<{ stopped: boolean; durationSeconds: number; logId: string }>(
      `/api/cards/${cardId}/timer/stop`,
      {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }
    ),

  // TM-03 & RP-05: Time Reports
  getTimeTrackingReport: (params?: { boardId?: string; workspaceId?: string; from?: string; to?: string; userId?: string } | string) => {
    const q = new URLSearchParams();
    if (typeof params === 'string') {
      q.append('boardId', params);
    } else if (params) {
      if (params.boardId) q.append('boardId', params.boardId);
      if (params.workspaceId) q.append('workspaceId', params.workspaceId);
      if (params.from) q.append('from', params.from);
      if (params.to) q.append('to', params.to);
      if (params.userId) q.append('userId', params.userId);
    }
    return request<TimeTrackingReport>(`/api/reports/time-tracking?${q.toString()}`);
  },

  getTimeTrackingCsvUrl: (params?: { boardId?: string; workspaceId?: string } | string) => {
    const q = new URLSearchParams();
    if (typeof params === 'string') {
      q.append('boardId', params);
    } else if (params) {
      if (params.boardId) q.append('boardId', params.boardId);
      if (params.workspaceId) q.append('workspaceId', params.workspaceId);
    }
    return `/api/reports/time-tracking/export-csv?${q.toString()}`;
  },

  getEstimateAccuracyReport: (boardId: string) =>
    request<EstimateAccuracyReport>(`/api/reports/board/${boardId}/estimate-accuracy`),

  // CP-01, CP-02, CP-03, CP-04: Capacidade e Carga
  getWorkspaceCapacity: (workspaceId: string) =>
    request<WorkspaceMemberCapacity[]>(`/api/capacity/${workspaceId}/capacity`),

  updateWorkspaceCapacity: (workspaceId: string, targetUserId: string, weeklyCapacityHours: number, sprintCapacityPoints: number) =>
    request<WorkspaceMemberCapacity>(`/api/capacity/${workspaceId}/capacity/${targetUserId}`, {
      method: 'PUT',
      body: JSON.stringify({ weeklyCapacityHours, sprintCapacityPoints }),
    }),

  getWorkspaceWorkload: (workspaceId: string, boardId?: string) => {
    const q = boardId ? `?boardId=${boardId}` : '';
    return request<MemberWorkloadSummary[]>(`/api/capacity/${workspaceId}/workload${q}`);
  },

  checkAssigneeOverload: (workspaceId: string, assignee: string, estimate?: string, cardId?: string) => {
    const q = new URLSearchParams();
    q.append('assignee', assignee);
    if (estimate) q.append('estimate', estimate);
    if (cardId) q.append('cardId', cardId);
    return request<{ willOverload: boolean; currentHours: number; newCardHours: number; capacityHours: number; totalAfter: number; message: string }>(
      `/api/capacity/${workspaceId}/check-assignment?${q.toString()}`
    );
  },

  // SP-05: Retrospectivas e Ciclos Leves
  getSprintRetrospective: (sprintId: string) =>
    request<SprintRetroItem[]>(`/api/sprints/${sprintId}/retrospective`),

  addSprintRetroItem: (sprintId: string, category: RetroCategory, content: string) =>
    request<SprintRetroItem>(`/api/sprints/${sprintId}/retrospective`, {
      method: 'POST',
      body: JSON.stringify({ category, content }),
    }),

  voteSprintRetroItem: (sprintId: string, itemId: string) =>
    request<SprintRetroItem>(`/api/sprints/${sprintId}/retrospective/${itemId}/vote`, {
      method: 'POST',
    }),

  deleteSprintRetroItem: (sprintId: string, itemId: string) =>
    request<{ message: string }>(`/api/sprints/${sprintId}/retrospective/${itemId}`, {
      method: 'DELETE',
    }),

  createQuickCycleSprint: (boardId: string, type: 'WEEK' | 'MONTH', name?: string) =>
    request<Sprint>('/api/sprints/quick-cycle', {
      method: 'POST',
      body: JSON.stringify({ boardId, type, name }),
    }),

  // WS-07: Hierarquia de Workspaces
  getSubWorkspaces: (workspaceId: string) =>
    request<any[]>(`/api/workspaces/${workspaceId}/sub-workspaces`),

  getWorkspaceHierarchySummary: (workspaceId: string) =>
    request<any>(`/api/workspaces/${workspaceId}/hierarchy-summary`),

  // PM-07: Papéis Customizados
  getWorkspaceCustomRoles: (workspaceId: string) =>
    request<WorkspaceCustomRole[]>(`/api/workspaces/${workspaceId}/custom-roles`),

  createWorkspaceCustomRole: (workspaceId: string, name: string, description: string, permissions: string[]) =>
    request<WorkspaceCustomRole>(`/api/workspaces/${workspaceId}/custom-roles`, {
      method: 'POST',
      body: JSON.stringify({ name, description, permissions }),
    }),

  deleteWorkspaceCustomRole: (workspaceId: string, roleId: string) =>
    request<{ message: string }>(`/api/workspaces/${workspaceId}/custom-roles/${roleId}`, {
      method: 'DELETE',
    }),

  // WS-08: SSO Corporativo
  getWorkspaceSso: (workspaceId: string) =>
    request<{ sso_enabled: boolean; sso_provider: string | null; sso_domain: string | null }>(
      `/api/workspaces/${workspaceId}/sso`
    ),

  updateWorkspaceSso: (workspaceId: string, data: { ssoEnabled: boolean; ssoProvider?: string | null; ssoDomain?: string | null }) =>
    request<any>(`/api/workspaces/${workspaceId}/sso`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  testSsoLogin: (workspaceId: string, email: string, name?: string) =>
    request<any>(`/api/workspaces/${workspaceId}/sso/test-login`, {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    }),
};

