import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  User,
  Bell,
  Mail,
  Building,
  Users,
  UserCheck,
  FolderKanban,
  ArrowRightLeft,
  History,
  LayoutDashboard,
  Globe,
  Archive,
  Columns,
  ChevronRight,
  ShieldCheck,
  Network,
  KeyRound,
} from 'lucide-react';
import {
  Workspace,
  Board,
  BoardRole,
  Column,
  BoardVisibility,
  EstimateType,
} from '../types';
import { useAuth } from '../context/AuthContext';
import { UserSettings } from './settings/UserSettings';
import { WorkspaceSettings } from './settings/WorkspaceSettings';
import { BoardSettings } from './settings/BoardSettings';
import { WorkflowSettings } from './settings/WorkflowSettings';

export type SettingsScope = 'user' | 'workspace' | 'board' | 'workflow';

export type SettingsTabId =
  // User
  | 'user-profile'
  | 'user-notifications'
  | 'user-digest'
  // Workspace
  | 'workspace-general'
  | 'workspace-members'
  | 'workspace-teams'
  | 'workspace-roles'
  | 'workspace-hierarchy'
  | 'workspace-sso'
  | 'workspace-all-boards'
  | 'workspace-transfer'
  | 'workspace-audit'
  // Board
  | 'board-general'
  | 'board-visibility'
  | 'board-members'
  | 'board-automations'
  // Workflow
  | 'workflow-columns';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialScope?: SettingsScope;
  initialTab?: string;

  // Workspace
  workspace?: Workspace | null;
  onRefreshWorkspace?: () => Promise<void>;
  onSaveWorkspace?: (name: string, billingEmail?: string | null) => Promise<void>;

  // Quadro
  board?: Board | null;
  currentBoardRole?: BoardRole;
  onRefreshBoard?: () => Promise<void>;
  onSaveBoard?: (
    title: string,
    visibility: BoardVisibility,
    estimateType: EstimateType,
    autoArchiveDays?: number | null
  ) => Promise<void>;

  // Colunas
  columns?: Column[];
  onMoveColumn?: (columnIndex: number, direction: 'left' | 'right') => Promise<void>;
  onUpdateColumn?: (columnId: string, payload: { title?: string; wipLimit?: number | null }) => Promise<void>;
  onDeleteColumn?: (columnId: string) => Promise<void>;
  onCreateColumn?: (title: string, wipLimit?: number | null) => Promise<void>;

  // Notificações
  onNotificationsUpdated?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialScope = 'user',
  initialTab,
  workspace = null,
  onRefreshWorkspace,
  onSaveWorkspace,
  board = null,
  currentBoardRole = 'OWNER',
  onRefreshBoard,
  onSaveBoard,
  columns = [],
  onMoveColumn,
  onUpdateColumn,
  onDeleteColumn,
  onCreateColumn,
  onNotificationsUpdated,
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTabId>('user-profile');

  // Inicializa a aba ativa quando o modal é aberto
  useEffect(() => {
    if (isOpen) {
      if (initialScope === 'workspace') {
        const tabMap: Record<string, SettingsTabId> = {
          general: 'workspace-general',
          members: 'workspace-members',
          teams: 'workspace-teams',
          roles: 'workspace-roles',
          hierarchy: 'workspace-hierarchy',
          sso: 'workspace-sso',
          'all-boards': 'workspace-all-boards',
          transfer: 'workspace-transfer',
          audit: 'workspace-audit',
        };
        setActiveTab(tabMap[initialTab || ''] || 'workspace-general');
      } else if (initialScope === 'board') {
        const tabMap: Record<string, SettingsTabId> = {
          general: 'board-general',
          visibility: 'board-visibility',
          members: 'board-members',
          automations: 'board-automations',
        };
        setActiveTab(tabMap[initialTab || ''] || 'board-general');
      } else if (initialScope === 'workflow') {
        setActiveTab('workflow-columns');
      } else {
        const tabMap: Record<string, SettingsTabId> = {
          profile: 'user-profile',
          notifications: 'user-notifications',
          digest: 'user-digest',
        };
        setActiveTab(tabMap[initialTab || ''] || 'user-profile');
      }
    }
  }, [isOpen, initialScope, initialTab]);

  // Tecla ESC para fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isWorkspaceAdmin = workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const isWorkspaceOwner = workspace?.role === 'OWNER';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[88vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="px-6 py-3.5 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                Painel Único de Configurações
              </h1>
              <p className="text-[11px] text-slate-400">
                Gerencie opções de Usuário, Workspace, Quadro e Fluxo de acordo com seus níveis de acesso.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Sidebar + Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Esquerda */}
          <aside className="w-64 sm:w-72 bg-slate-950/90 border-r border-slate-800/80 p-3.5 flex flex-col gap-5 overflow-y-auto shrink-0 select-none">
            {/* 1. SEÇÃO USUÁRIO */}
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>Minha Conta</span>
                <span className="text-[10px] text-indigo-400 lowercase font-normal truncate max-w-[100px]">
                  {user?.name}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('user-profile')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'user-profile'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <User className="w-4 h-4 shrink-0" />
                  <span>Perfil & Acesso</span>
                </div>
                {activeTab === 'user-profile' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('user-notifications')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'user-notifications'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 shrink-0" />
                  <span>Notificações & Alertas</span>
                </div>
                {activeTab === 'user-notifications' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('user-digest')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'user-digest'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>Resumo Digest</span>
                </div>
                {activeTab === 'user-digest' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="h-[1px] bg-slate-800/80 mx-1" />

            {/* 2. SEÇÃO WORKSPACE */}
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span className="truncate max-w-[120px]">
                  {workspace?.name || 'Workspace'}
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                  {workspace?.role || 'MEMBER'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('workspace-general')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'workspace-general'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Building className="w-4 h-4 shrink-0" />
                  <span>Geral & Cobrança</span>
                </div>
                {activeTab === 'workspace-general' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('workspace-members')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'workspace-members'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 shrink-0" />
                  <span>Membros & Papéis</span>
                </div>
                {activeTab === 'workspace-members' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('workspace-teams')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'workspace-teams'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 shrink-0" />
                  <span>Equipes (Teams)</span>
                </div>
                {activeTab === 'workspace-teams' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('workspace-roles')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'workspace-roles'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>Papéis Customizados</span>
                </div>
                {activeTab === 'workspace-roles' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('workspace-hierarchy')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'workspace-hierarchy'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Network className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>Hierarquia & Rollup</span>
                </div>
                {activeTab === 'workspace-hierarchy' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {isWorkspaceAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab('workspace-sso')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                    activeTab === 'workspace-sso'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <KeyRound className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>SSO & Provisionamento</span>
                  </div>
                  {activeTab === 'workspace-sso' && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}

              {isWorkspaceAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab('workspace-all-boards')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                    activeTab === 'workspace-all-boards'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FolderKanban className="w-4 h-4 shrink-0" />
                    <span>Todos os Quadros</span>
                  </div>
                  {activeTab === 'workspace-all-boards' && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}

              {isWorkspaceOwner && (
                <button
                  type="button"
                  onClick={() => setActiveTab('workspace-transfer')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                    activeTab === 'workspace-transfer'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <ArrowRightLeft className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>Transferir Posse</span>
                  </div>
                  {activeTab === 'workspace-transfer' && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}

              {isWorkspaceAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab('workspace-audit')}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                    activeTab === 'workspace-audit'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <History className="w-4 h-4 shrink-0" />
                    <span>Log de Auditoria</span>
                  </div>
                  {activeTab === 'workspace-audit' && <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            <div className="h-[1px] bg-slate-800/80 mx-1" />

            {/* 3. SEÇÃO QUADRO */}
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span className="truncate max-w-[120px]">
                  {board?.title || 'Quadro Atual'}
                </span>
                <span className="text-[10px] bg-slate-800 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                  {currentBoardRole}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('board-general')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'board-general'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <LayoutDashboard className="w-4 h-4 shrink-0" />
                  <span>Geral & Estimativas</span>
                </div>
                {activeTab === 'board-general' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('board-visibility')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'board-visibility'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 shrink-0" />
                  <span>Visibilidade & Público</span>
                </div>
                {activeTab === 'board-visibility' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('board-members')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'board-members'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 shrink-0" />
                  <span>Membros & Equipes</span>
                </div>
                {activeTab === 'board-members' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('board-automations')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'board-automations'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Archive className="w-4 h-4 shrink-0" />
                  <span>Automações & Limpeza</span>
                </div>
                {activeTab === 'board-automations' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="h-[1px] bg-slate-800/80 mx-1" />

            {/* 4. SEÇÃO FLUXO & COLUNAS */}
            <div className="space-y-1">
              <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Processo & Kanban
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('workflow-columns')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  activeTab === 'workflow-columns'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Columns className="w-4 h-4 shrink-0" />
                  <span>Colunas & Limites WIP</span>
                </div>
                {activeTab === 'workflow-columns' && <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </aside>

          {/* Painel Principal de Conteúdo */}
          <main className="flex-1 bg-slate-900/90 overflow-y-auto">
            {/* Usuário */}
            {activeTab === 'user-profile' && (
              <UserSettings
                activeSubTab="profile"
                onNotificationsUpdated={onNotificationsUpdated}
              />
            )}
            {activeTab === 'user-notifications' && (
              <UserSettings
                activeSubTab="notifications"
                onNotificationsUpdated={onNotificationsUpdated}
              />
            )}
            {activeTab === 'user-digest' && (
              <UserSettings
                activeSubTab="digest"
                onNotificationsUpdated={onNotificationsUpdated}
              />
            )}

            {/* Workspace */}
            {activeTab === 'workspace-general' && (
              <WorkspaceSettings
                activeSubTab="general"
                workspace={workspace}
                onRefreshWorkspace={onRefreshWorkspace}
                onSaveWorkspace={onSaveWorkspace}
              />
            )}
            {activeTab === 'workspace-members' && (
              <WorkspaceSettings
                activeSubTab="members"
                workspace={workspace}
                onRefreshWorkspace={onRefreshWorkspace}
              />
            )}
            {activeTab === 'workspace-teams' && (
              <WorkspaceSettings
                activeSubTab="teams"
                workspace={workspace}
                onRefreshWorkspace={onRefreshWorkspace}
              />
            )}
            {activeTab === 'workspace-roles' && (
              <WorkspaceSettings
                activeSubTab="roles"
                workspace={workspace}
                onRefreshWorkspace={onRefreshWorkspace}
              />
            )}
            {activeTab === 'workspace-hierarchy' && (
              <WorkspaceSettings
                activeSubTab="hierarchy"
                workspace={workspace}
                onRefreshWorkspace={onRefreshWorkspace}
              />
            )}
            {activeTab === 'workspace-sso' && (
              <WorkspaceSettings
                activeSubTab="sso"
                workspace={workspace}
                onRefreshWorkspace={onRefreshWorkspace}
              />
            )}
            {activeTab === 'workspace-all-boards' && (
              <WorkspaceSettings
                activeSubTab="all-boards"
                workspace={workspace}
                onRefreshWorkspace={onRefreshWorkspace}
              />
            )}
            {activeTab === 'workspace-transfer' && (
              <WorkspaceSettings
                activeSubTab="transfer"
                workspace={workspace}
                onRefreshWorkspace={onRefreshWorkspace}
              />
            )}
            {activeTab === 'workspace-audit' && (
              <WorkspaceSettings
                activeSubTab="audit"
                workspace={workspace}
                onRefreshWorkspace={onRefreshWorkspace}
              />
            )}

            {/* Quadro */}
            {activeTab === 'board-general' && (
              <BoardSettings
                activeSubTab="general"
                board={board}
                workspaceId={workspace?.id}
                userBoardRole={currentBoardRole}
                onRefreshBoard={onRefreshBoard}
                onSaveBoard={onSaveBoard}
              />
            )}
            {activeTab === 'board-visibility' && (
              <BoardSettings
                activeSubTab="visibility"
                board={board}
                workspaceId={workspace?.id}
                userBoardRole={currentBoardRole}
                onRefreshBoard={onRefreshBoard}
                onSaveBoard={onSaveBoard}
              />
            )}
            {activeTab === 'board-members' && (
              <BoardSettings
                activeSubTab="members"
                board={board}
                workspaceId={workspace?.id}
                userBoardRole={currentBoardRole}
                onRefreshBoard={onRefreshBoard}
              />
            )}
            {activeTab === 'board-automations' && (
              <BoardSettings
                activeSubTab="automations"
                board={board}
                workspaceId={workspace?.id}
                userBoardRole={currentBoardRole}
                onRefreshBoard={onRefreshBoard}
                onSaveBoard={onSaveBoard}
              />
            )}

            {/* Workflow */}
            {activeTab === 'workflow-columns' && (
              <WorkflowSettings
                board={board}
                columns={columns}
                userBoardRole={currentBoardRole}
                onRefreshBoard={onRefreshBoard}
                onMoveColumn={onMoveColumn}
                onUpdateColumn={onUpdateColumn}
                onDeleteColumn={onDeleteColumn}
                onCreateColumn={onCreateColumn}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
