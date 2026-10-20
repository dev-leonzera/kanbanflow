import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Priority, Workspace, BoardSummary, BoardVisibility, BoardRole, SavedFilter, Sprint } from '../types';
import { SettingsScope } from './SettingsModal';
import { formatSprintName } from './SprintsModal';
import {
  LogOut,
  Search,
  User,
  Users,
  Building,
  LayoutDashboard,
  Settings,
  Lock,
  Globe,
  Sun,
  Bookmark,
  Trash2,
  Bell,
  Zap,
  BarChart2,
  FolderTree,
  Rows,
  Filter,
  X,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';

export type SwimlaneGrouping = 'NONE' | 'ASSIGNEE' | 'PRIORITY' | 'EPIC';

interface HeaderProps {
  // Workspaces
  workspaces: Workspace[];
  currentWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenNewWorkspaceModal: () => void;
  onOpenManageWorkspaceModal?: () => void;
  onOpenWorkloadModal?: () => void;

  // Quadros (Boards)
  boardsList: BoardSummary[];
  currentBoardId: string;
  currentBoardTitle?: string;
  currentBoardVisibility?: BoardVisibility;
  currentBoardRole?: BoardRole;
  onSelectBoard: (id: string) => void;
  onOpenNewBoardModal: () => void;
  onOpenManageBoardModal?: () => void;

  // Visão Meu Dia (VW-02)
  onOpenMyDayModal: () => void;
  // Sprints & Backlog (SP-01, SP-02, SP-03, SP-04)
  sprints: Sprint[];
  selectedSprintFilter: string | 'ALL' | 'BACKLOG';
  onSelectSprintFilter: (sprintId: string | 'ALL' | 'BACKLOG') => void;
  onOpenSprintsModal: () => void;

  // Relatórios & Métricas (RP-01 a RP-04)
  onOpenReportsModal: () => void;

  // Árvore Hierárquica (CD-12)
  onOpenTreeModal: () => void;

  // Swimlanes (BD-07)
  swimlaneGrouping: SwimlaneGrouping;
  onSwimlaneGroupingChange: (grouping: SwimlaneGrouping) => void;

  // Notificações e Preferências (NT-01, NT-02)
  unreadNotificationsCount: number;
  onOpenNotificationsModal: () => void;

  // Filtros e Filtros Salvos (VW-01, BD-09)
  searchQuery: string;
  onSearchChange: (q: string) => void;
  priorityFilter: Priority | 'ALL';
  onPriorityFilterChange: (p: Priority | 'ALL') => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (a: string) => void;
  availableAssignees: string[];
  savedFilters: SavedFilter[];
  onApplySavedFilter: (filter: SavedFilter) => void;
  onSaveCurrentFilter: (name: string) => Promise<void>;
  onDeleteSavedFilter: (filterId: string) => Promise<void>;

  onOpenColumnModal?: () => void;
  onOpenSettings?: (scope: SettingsScope, tab?: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  workspaces,
  currentWorkspaceId,
  onSelectWorkspace,
  onOpenNewWorkspaceModal,
  boardsList,
  currentBoardId,
  currentBoardVisibility = 'WORKSPACE',
  onSelectBoard,
  onOpenNewBoardModal,
  onOpenMyDayModal,
  sprints,
  selectedSprintFilter,
  onSelectSprintFilter,
  onOpenSprintsModal,
  onOpenReportsModal,
  onOpenTreeModal,
  onOpenWorkloadModal,
  swimlaneGrouping,
  onSwimlaneGroupingChange,
  unreadNotificationsCount,
  onOpenNotificationsModal,
  searchQuery,
  onSearchChange,
  priorityFilter,
  onPriorityFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  availableAssignees,
  savedFilters,
  onApplySavedFilter,
  onSaveCurrentFilter,
  onDeleteSavedFilter,
  onOpenSettings,
}) => {
  const { user, logout } = useAuth();
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
        setIsFilterPopoverOpen(false);
      }
    };
    if (isFilterPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterPopoverOpen]);

  const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);
  const canCreateBoard = currentWorkspace?.role !== 'GUEST';

  const activeFiltersCount =
    (priorityFilter !== 'ALL' ? 1 : 0) +
    (assigneeFilter !== 'ALL' ? 1 : 0) +
    (selectedSprintFilter !== 'ALL' ? 1 : 0) +
    (swimlaneGrouping !== 'NONE' ? 1 : 0);

  const hasAnyActiveFilter = Boolean(searchQuery.trim()) || activeFiltersCount > 0;

  const handleClearFilters = () => {
    onSearchChange('');
    onPriorityFilterChange('ALL');
    onAssigneeFilterChange('ALL');
    onSwimlaneGroupingChange('NONE');
    if (selectedSprintFilter !== 'ALL') {
      onSelectSprintFilter('ALL');
    }
  };

  const handleSaveFilterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilterName.trim()) return;
    await onSaveCurrentFilter(newFilterName.trim());
    setNewFilterName('');
  };

  return (
    <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-2.5 sticky top-0 z-20">
      <div className="w-full flex items-center justify-between gap-3 flex-wrap xl:flex-nowrap">
        {/* 1. Marca (Logo) */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow text-sm">
            K
          </div>
          <span className="font-bold text-white tracking-tight text-base leading-none hidden sm:inline">
            KanbanFlow
          </span>
        </div>

        {/* 2. Grupo de Contexto: Workspace & Quadro */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 gap-2 text-xs shrink-0">
          {/* Workspace */}
          <div className="flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <select
              value={currentWorkspaceId}
              onChange={e => {
                if (e.target.value === '__NEW__') {
                  onOpenNewWorkspaceModal();
                } else {
                  onSelectWorkspace(e.target.value);
                }
              }}
              className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer w-28 sm:w-32 truncate"
              title="Selecionar Workspace"
            >
              {workspaces.map(ws => (
                <option key={ws.id} value={ws.id} className="bg-slate-900 text-slate-200">
                  {ws.name} ({ws.role})
                </option>
              ))}
              <option value="__NEW__" className="bg-slate-900 text-indigo-400 font-semibold">
                + Novo Workspace...
              </option>
            </select>
          </div>

          <div className="h-4 w-[1px] bg-slate-800" />

          {/* Quadro */}
          <div className="flex items-center gap-1.5">
            <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <select
              value={currentBoardId}
              onChange={e => {
                if (e.target.value === '__NEW__') {
                  onOpenNewBoardModal();
                } else {
                  onSelectBoard(e.target.value);
                }
              }}
              className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer w-28 sm:w-32 truncate"
              title="Selecionar Quadro"
            >
              {boardsList.map(b => (
                <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                  {b.title}
                </option>
              ))}
              {canCreateBoard && (
                <option value="__NEW__" className="bg-slate-900 text-emerald-400 font-semibold">
                  + Novo Quadro...
                </option>
              )}
            </select>

            <span
              title={
                currentBoardVisibility === 'PRIVATE'
                  ? 'Quadro Privado'
                  : 'Quadro Visível ao Workspace'
              }
              className="shrink-0"
            >
              {currentBoardVisibility === 'PRIVATE' ? (
                <Lock className="w-3 h-3 text-amber-400" />
              ) : (
                <Globe className="w-3 h-3 text-emerald-400" />
              )}
            </span>
          </div>
        </div>

        {/* 3. Grupo de Visões (Meu Dia, Sprints, Relatórios, Árvore) */}
        <nav
          className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-lg gap-1 shrink-0"
          aria-label="Visões do Projeto"
        >
          <button
            type="button"
            onClick={onOpenMyDayModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-amber-300 hover:bg-amber-500/15 transition"
            title="Visão Meu Dia"
          >
            <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Meu Dia</span>
          </button>

          <button
            type="button"
            onClick={onOpenSprintsModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-indigo-300 hover:bg-indigo-500/15 transition"
            title="Sprints e Backlog"
          >
            <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Sprints</span>
          </button>

          <button
            type="button"
            onClick={onOpenReportsModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-cyan-300 hover:bg-cyan-500/15 transition"
            title="Relatórios e Métricas"
          >
            <BarChart2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Relatórios</span>
          </button>

          <button
            type="button"
            onClick={onOpenTreeModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-purple-300 hover:bg-purple-500/15 transition"
            title="Árvore Hierárquica"
          >
            <FolderTree className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>Árvore</span>
          </button>

          {onOpenWorkloadModal && (
            <button
              type="button"
              onClick={onOpenWorkloadModal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-emerald-300 hover:bg-emerald-500/15 transition"
              title="Carga & Capacidade da Equipe"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Capacidade</span>
            </button>
          )}
        </nav>

        {/* 4. Grupo de Busca, Filtros e Raias */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1 gap-1 shrink-0">
          {/* Campo de Busca */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar cartões..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="bg-transparent pl-8 pr-6 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none w-36 sm:w-44"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-1.5 text-slate-500 hover:text-slate-300 p-0.5"
                title="Limpar busca"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="h-4 w-[1px] bg-slate-800" />

          {/* Menu Agrupado de Filtros e Exibição */}
          <div className="relative" ref={filterPopoverRef}>
            <button
              type="button"
              onClick={() => setIsFilterPopoverOpen(!isFilterPopoverOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
                activeFiltersCount > 0 || isFilterPopoverOpen
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
              title="Filtros, Raias e Filtros Salvos"
            >
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span>Filtros</span>
              {activeFiltersCount > 0 && (
                <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isFilterPopoverOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 z-50 space-y-3.5 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-white text-sm">Filtros e Visualização</span>
                  {hasAnyActiveFilter && (
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 font-medium"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Limpar tudo
                    </button>
                  )}
                </div>

                {/* Agrupamento em Raias */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                    <Rows className="w-3 h-3 text-indigo-400" />
                    Agrupar em Raias (Swimlanes)
                  </label>
                  <select
                    value={swimlaneGrouping}
                    onChange={e => onSwimlaneGroupingChange(e.target.value as SwimlaneGrouping)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="NONE">Sem raias</option>
                    <option value="ASSIGNEE">Por Responsável</option>
                    <option value="PRIORITY">Por Prioridade</option>
                    <option value="EPIC">Por Épico</option>
                  </select>
                </div>

                {/* Filtro por Sprint */}
                {sprints.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">Sprint</label>
                    <select
                      value={selectedSprintFilter}
                      onChange={e => onSelectSprintFilter(e.target.value as any)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="ALL">Todas as Sprints</option>
                      {sprints.find(s => s.status === 'ACTIVE') && (
                        <option value={sprints.find(s => s.status === 'ACTIVE')!.id}>
                          🟢 Ativa: {formatSprintName(sprints.find(s => s.status === 'ACTIVE')!.name)}
                        </option>
                      )}
                      <option value="BACKLOG">📦 Apenas Backlog</option>
                      {sprints
                        .filter(s => s.status !== 'ACTIVE')
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {formatSprintName(s.name)} ({s.status === 'PLANNING' ? 'Planejamento' : 'Concluído'})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Filtro por Prioridade */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Prioridade</label>
                  <select
                    value={priorityFilter}
                    onChange={e => onPriorityFilterChange(e.target.value as Priority | 'ALL')}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="ALL">Todas as Prioridades</option>
                    <option value="HIGH">🔴 Alta</option>
                    <option value="MEDIUM">🟡 Média</option>
                    <option value="LOW">🔵 Baixa</option>
                  </select>
                </div>

                {/* Filtro por Responsável */}
                {availableAssignees.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400">Responsável</label>
                    <select
                      value={assigneeFilter}
                      onChange={e => onAssigneeFilterChange(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="ALL">Todos os Responsáveis</option>
                      <option value="UNASSIGNED">Sem Responsável</option>
                      {availableAssignees.map(name => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Filtros Salvos */}
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                    <Bookmark className="w-3 h-3 text-indigo-400" />
                    <span>Filtros Salvos ({savedFilters.length})</span>
                  </div>

                  <form onSubmit={handleSaveFilterSubmit} className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Salvar filtro atual como..."
                      value={newFilterName}
                      onChange={e => setNewFilterName(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
                    >
                      Salvar
                    </button>
                  </form>

                  {savedFilters.length > 0 && (
                    <div className="space-y-1 max-h-36 overflow-y-auto pt-1">
                      {savedFilters.map(sf => (
                        <div
                          key={sf.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onApplySavedFilter(sf);
                              setIsFilterPopoverOpen(false);
                            }}
                            className="text-left flex-1 truncate font-medium text-slate-200 hover:text-indigo-300"
                          >
                            {sf.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteSavedFilter(sf.id)}
                            className="p-1 text-slate-500 hover:text-rose-400"
                            title="Remover filtro salvo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 5. Grupo de Ações e Usuário */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Notificações */}
          <button
            type="button"
            onClick={onOpenNotificationsModal}
            className="relative p-2 bg-slate-950 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-300 rounded-lg transition"
            title="Notificações"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold px-1.5 rounded-full min-w-[16px] text-center leading-tight">
                {unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* Painel Único de Configurações (Settings Hub) */}
          <button
            type="button"
            onClick={() => onOpenSettings?.('user', 'profile')}
            className="p-2 bg-slate-950 border border-slate-800 hover:border-indigo-500/50 text-slate-300 hover:text-indigo-300 rounded-lg transition"
            title="Painel Único de Configurações"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Usuário e Logout */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 gap-1.5">
            <button
              type="button"
              onClick={() => onOpenSettings?.('user', 'profile')}
              className="flex items-center gap-1.5 text-left text-xs font-medium text-slate-200 hover:text-indigo-300 transition"
              title="Minha Conta / Perfil"
            >
              <User className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="max-w-[90px] truncate hidden md:inline">
                {user?.name}
              </span>
            </button>
            <button
              type="button"
              onClick={logout}
              title="Sair da conta"
              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition ml-0.5"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
