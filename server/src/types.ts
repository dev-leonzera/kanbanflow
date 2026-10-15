export interface User {
  id: string;
  email: string;
  name: string;
  created_at?: string;
}

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';

export interface Workspace {
  id: string;
  name: string;
  parent_id?: string | null;
  billing_email?: string | null;
  created_at?: string;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
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

export interface Subtask {
  id: string;
  card_id: string;
  title: string;
  done: boolean;
  position: number;
  created_at?: string;
}

export type CardType = 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'SUBTASK';

export interface Card {
  id: string;
  column_id: string;
  parent_id?: string | null;
  type: CardType;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  tag: string;
  due_date: string | null;
  position: number;
  assignee: string | null;
  subtasks: Subtask[];
  children?: Card[];
  progress?: {
    total: number;
    completed: number;
    percent: number;
  };
  is_archived?: boolean;
  archived_at?: string | null;
  created_at?: string;
}

export interface Column {
  id: string;
  board_id: string;
  title: string;
  position: number;
  cards: Card[];
  is_archived?: boolean;
  archived_at?: string | null;
  created_at?: string;
}

export interface Board {
  id: string;
  workspace_id: string;
  user_id?: string;
  title: string;
  columns: Column[];
  is_archived?: boolean;
  archived_at?: string | null;
  created_at?: string;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
