export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';
export type BoardRole = 'OWNER' | 'EDITOR' | 'COMMENTER' | 'VIEWER';
export type BoardVisibility = 'PRIVATE' | 'WORKSPACE';
export type EstimateType = 'POINTS' | 'HOURS' | 'TSHIRT';
export type CardRelationType = 'BLOCKS' | 'RELATED' | 'DUPLICATE';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
  parent_id?: string | null;
  parent_name?: string | null;
  billing_email?: string | null;
  role?: WorkspaceRole;
  sso_enabled?: boolean;
  sso_provider?: string | null;
  sso_domain?: string | null;
  created_at?: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  role: WorkspaceRole;
  created_at?: string;
}

export interface BoardMember {
  board_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  role: BoardRole;
  created_at?: string;
}

export interface AuditLog {
  id: string;
  workspace_id?: string | null;
  board_id?: string | null;
  user_id: string;
  user_name?: string;
  user_email?: string;
  action: string;
  target_type: string;
  target_id?: string | null;
  details?: string | null;
  created_at: string;
}

export interface BoardSummary {
  id: string;
  workspace_id: string;
  title: string;
  visibility?: BoardVisibility;
  estimate_type?: EstimateType;
  role?: BoardRole;
  created_at?: string;
}

export interface CardEvent {
  id: string;
  card_id: string;
  user_id: string;
  user_name?: string;
  event_type: string;
  from_column_id?: string | null;
  from_column_title?: string | null;
  to_column_id?: string | null;
  to_column_title?: string | null;
  from_value?: string | null;
  to_value?: string | null;
  created_at: string;
}

export interface CardComment {
  id: string;
  card_id: string;
  user_id: string;
  user_name?: string;
  content: string;
  created_at: string;
}

export interface CardAttachment {
  id: string;
  card_id: string;
  user_id: string;
  user_name?: string;
  name: string;
  url: string;
  size_bytes?: number;
  mime_type?: string;
  created_at: string;
}

export interface CardRelation {
  id: string;
  source_card_id: string;
  source_card_title?: string;
  target_card_id: string;
  target_card_title?: string;
  target_column_title?: string;
  relation_type: CardRelationType;
  created_at?: string;
}

export interface SavedFilter {
  id: string;
  board_id: string;
  user_id: string;
  name: string;
  search_query: string;
  priority_filter: string;
  assignee_filter: string;
  created_at?: string;
}

export interface Subtask {
  id: string;
  card_id: string;
  title: string;
  done: boolean;
  position: number;
}

export type CardType = 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'SUBTASK';
export type CardVisibility = 'NORMAL' | 'RESTRICTED' | 'PRIVATE';

export interface CardTimeLog {
  id: string;
  card_id: string;
  user_id: string;
  user_name?: string;
  duration_seconds: number;
  hours?: number;
  notes: string;
  description?: string;
  log_date: string;
  logged_at?: string;
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
}

export interface ActiveCardTimer {
  id: string;
  card_id: string;
  card_title?: string;
  board_id?: string;
  user_id: string;
  started_at: string;
}

export interface Card {
  id: string;
  column_id: string;
  parent_id?: string | null;
  sprint_id?: string | null;
  type: CardType;
  visibility?: CardVisibility;
  restricted_to_role?: string | null;
  title: string;
  description: string;
  priority: Priority;
  tag: string;
  due_date: string | null;
  position: number;
  assignee: string | null;
  estimate?: string | null;
  subtasks: Subtask[];
  children?: Card[];
  progress?: {
    total: number;
    completed: number;
    percent: number;
  };
  comments_count?: number;
  attachments_count?: number;
  is_blocked?: boolean;
  blocked_by?: { id: string; title: string; column_title?: string }[];
  blocks?: { id: string; title: string }[];
  total_time_spent_seconds?: number;
  spent_hours?: number;
  time_logs_count?: number;
  active_timer?: ActiveCardTimer | null;
  deviation_hours?: number | null;
  deviation_percent?: number | null;
  is_critical_path?: boolean;
  is_archived?: boolean;
  archived_at?: string | null;
  created_at?: string;
}

export interface WorkspaceMemberCapacity {
  id?: string;
  workspace_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  weekly_capacity_hours: number;
  sprint_capacity_points: number;
  allocated_hours?: number;
  allocated_points?: number;
  utilization_percent?: number;
  updated_at?: string;
}

export interface MemberWorkloadSummary {
  user_id: string;
  user_name: string;
  user_email?: string;
  is_registered?: boolean;
  weekly_capacity_hours: number;
  sprint_capacity_points: number;
  allocated_hours: number;
  allocated_points: number;
  utilization_hours_percent: number;
  is_overloaded: boolean;
  assigned_cards: {
    id: string;
    title: string;
    board_id: string;
    board_title: string;
    column_title: string;
    priority: string;
    due_date: string | null;
    estimate: string | null;
    hours_estimate: number;
    points_estimate: number;
  }[];
  deadline_conflicts: {
    date: string;
    cards_count: number;
    total_hours: number;
    card_titles: string[];
  }[];
}

export type RetroCategory = 'WENT_WELL' | 'TO_IMPROVE' | 'ACTION_ITEM';

export interface SprintRetroItem {
  id: string;
  sprint_id: string;
  author_id: string;
  author_name?: string;
  category: RetroCategory;
  content: string;
  votes: number;
  created_at: string;
}

export interface WorkspaceCustomRole {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  permissions: string[];
  created_at: string;
}

export interface TimeTrackingReport {
  totalSeconds: number;
  totalHours: number;
  byUser: { userId: string; userName: string; userEmail?: string; totalSeconds: number; totalHours?: number; logsCount: number }[];
  byBoard: { boardId: string; boardTitle: string; totalSeconds: number }[];
  byDate: { date: string; totalSeconds: number }[];
  byCard: { cardId: string; cardTitle: string; columnTitle: string; totalHours: number; estimate?: string | null }[];
  logs: (CardTimeLog & { card_title: string; board_title: string })[];
}

export interface EstimateAccuracyReport {
  overallAccuracyPercent: number;
  totalEstimatedHours: number;
  totalActualHours: number;
  accuracyRatePercent: number;
  averageDeviationHours: number;
  averageDeviationPercent: number;
  totalCardsWithEstimate: number;
  cardsWithinEstimate: number;
  cards: {
    cardId: string;
    cardTitle: string;
    estimatedHours: number;
    actualHours: number;
    deviationHours: number;
    deviationPercent: number;
    withinEstimate: boolean;
    status?: string;
  }[];
  byType: {
    type: CardType;
    count: number;
    estimatedHours: number;
    actualHours: number;
    accuracyPercent: number;
    avgDeviationHours: number;
  }[];
  byUser: {
    userId: string;
    userName: string;
    count: number;
    estimatedHours: number;
    actualHours: number;
    accuracyPercent: number;
  }[];
}

export type SprintStatus = 'PLANNING' | 'ACTIVE' | 'COMPLETED';

export interface Sprint {
  id: string;
  board_id: string;
  name: string;
  goal?: string;
  start_date?: string | null;
  end_date?: string | null;
  status: SprintStatus;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  total_cards?: number;
  completed_cards?: number;
}

export interface SprintReport {
  sprint: Sprint;
  plannedCards: Card[];
  completedCards: Card[];
  incompleteCards: Card[];
  addedDuringSprintCards: Card[];
  summary: {
    plannedCount: number;
    completedCount: number;
    incompleteCount: number;
    addedDuringSprintCount: number;
    completionRatePercent: number;
  };
}

export interface Column {
  id: string;
  board_id: string;
  title: string;
  position: number;
  wip_limit?: number | null;
  cards: Card[];
  is_archived?: boolean;
  archived_at?: string | null;
}

export interface Board {
  id: string;
  workspace_id?: string;
  user_id?: string;
  title: string;
  visibility?: BoardVisibility;
  estimate_type?: EstimateType;
  auto_archive_days?: number | null;
  public_share_token?: string | null;
  public_share_expires_at?: string | null;
  role?: BoardRole;
  columns: Column[];
  is_archived?: boolean;
  archived_at?: string | null;
}

export type SwimlaneGrouping = 'NONE' | 'ASSIGNEE' | 'PRIORITY' | 'EPIC';

export interface MyDayCard extends Card {
  board_id: string;
  board_title: string;
  workspace_id: string;
  workspace_name: string;
  column_title: string;
  is_done_column: boolean;
}

export type NotificationEventType =
  | 'COMMENT_ADDED'
  | 'MENTIONED'
  | 'CARD_MOVED'
  | 'CARD_ASSIGNED'
  | 'ATTACHMENT_ADDED'
  | 'CARD_UNBLOCKED';

export type SubscriptionLevel = 'ALL' | 'MENTIONS' | 'NONE';

export interface NotificationItem {
  id: string;
  user_id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  event_type: NotificationEventType;
  board_id?: string | null;
  card_id?: string | null;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface NotificationPreference {
  user_id: string;
  event_type: NotificationEventType;
  channel_in_app: boolean;
  channel_email: boolean;
}

export interface NotificationSettings {
  user_id: string;
  dnd_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  digest_frequency: 'NONE' | 'DAILY' | 'WEEKLY';
  auto_timer_enabled?: boolean;
  updated_at?: string;
}

export interface NotificationDigest {
  period: 'daily' | 'weekly';
  hours: number;
  summary: {
    totalNotifications: number;
    commentsCount: number;
    mentionsCount: number;
    movesCount: number;
    assignmentsCount: number;
    unblockedCount: number;
  };
  highlights: NotificationItem[];
}

export interface Subscription {
  id?: string;
  user_id: string;
  target_type: 'BOARD' | 'CARD';
  target_id: string;
  level: SubscriptionLevel;
  updated_at?: string;
}

export interface WorkspaceTeam {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  created_at: string;
  members_count?: number;
}

export interface WorkspaceTeamMember {
  team_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  created_at?: string;
}

export interface BoardTeamPermission {
  board_id: string;
  team_id: string;
  team_name?: string;
  role: BoardRole;
  created_at?: string;
}

export interface WorkspaceBoardMetadata {
  id: string;
  title: string;
  visibility: string;
  estimate_type: string;
  created_at: string;
  members_count: number;
  cards_count: number;
  user_is_member: boolean;
}

export interface LeadCycleTimeCard {
  id: string;
  title: string;
  type: CardType;
  assignee: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  lead_time_days: number | null;
  cycle_time_days: number | null;
}

export interface LeadCycleTimeReport {
  cards: LeadCycleTimeCard[];
  byType: Record<string, { count: number; avgLeadTimeDays: number; avgCycleTimeDays: number }>;
  overall: { avgLeadTimeDays: number; avgCycleTimeDays: number };
}

export interface BurndownVelocityReport {
  sprint?: Sprint;
  burndown: { date: string; remainingPoints: number; idealPoints: number }[];
  velocity: { sprintId: string; sprintName: string; completedPoints: number; completedCards: number }[];
}

export interface CfdReport {
  dates: string[];
  columns: { id: string; title: string; counts: number[] }[];
  avgTimePerColumnHours: { columnId: string; columnTitle: string; avgHours: number }[];
}

export interface ThroughputReport {
  weeks: { weekLabel: string; completedCardsCount: number; completedPoints: number }[];
}

export interface CardTreeNode {
  id: string;
  title: string;
  type: CardType;
  column_id: string;
  column_title?: string;
  assignee: string | null;
  estimate: string | null;
  parent_id: string | null;
  position: number;
  children: CardTreeNode[];
}

