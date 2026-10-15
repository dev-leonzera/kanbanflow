import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Priority, Workspace, BoardSummary } from '../types';
import { Plus, LogOut, Search, User, Building, LayoutDashboard, Edit2 } from 'lucide-react';

interface HeaderProps {
  // Workspaces
  workspaces: Workspace[];
  currentWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onOpenNewWorkspaceModal: () => void;

  // Quadros (Boards)
  boardsList: BoardSummary[];
  currentBoardId: string;
  currentBoardTitle: string;
  onSelectBoard: (id: string) => void;
  onOpenNewBoardModal: () => void;
  onOpenRenameBoardModal: () => void;

  // Filtros
  searchQuery: string;
  onSearchChange: (q: string) => void;
  priorityFilter: Priority | 'ALL';
  onPriorityFilterChange: (p: Priority | 'ALL') => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (a: string) => void;
  availableAssignees: string[];
  onOpenColumnModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  workspaces,
  currentWorkspaceId,
  onSelectWorkspace,
  onOpenNewWorkspaceModal,
  boardsList,
  currentBoardId,
  currentBoardTitle,
  onSelectBoard,
  onOpenNewBoardModal,
  onOpenRenameBoardModal,
  searchQuery,
  onSearchChange,
  priorityFilter,
  onPriorityFilterChange,
  assigneeFilter,
  onAssigneeFilterChange,
  availableAssignees,
  onOpenColumnModal,
}) => {
  const { user, logout } = useAuth();

  return (
    <header className="bg-slate-800/90 backdrop-blur border-b border-slate-700 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20">
      {/* Lado Esquerdo: Logo, Seletor de Workspace e Seletor de Quadro */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-lg text-white shadow">
            K
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white leading-none">KanbanFlow</h1>
            <span className="text-[10px] text-slate-400">Gestão Ágil</span>
          </div>
        </div>

        {/* Separador */}
        <div className="h-6 w-[1px] bg-slate-700 hidden sm:block" />

        {/* Seletor de Workspace (WS-01, WS-02) */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs">
          <Building className="w-3.5 h-3.5 text-indigo-400" />
          <select
            value={currentWorkspaceId}
            onChange={e => {
              if (e.target.value === '__NEW__') {
                onOpenNewWorkspaceModal();
              } else {
                onSelectWorkspace(e.target.value);
              }
            }}
            className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[140px] truncate"
          >
            {workspaces.map(ws => (
              <option key={ws.id} value={ws.id} className="bg-slate-900 text-slate-200">
                {ws.name}
              </option>
            ))}
            <option value="__NEW__" className="bg-slate-900 text-indigo-400 font-semibold">
              + Novo Workspace...
            </option>
          </select>
        </div>

        {/* Seletor de Quadro (BD-01) */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs">
          <LayoutDashboard className="w-3.5 h-3.5 text-emerald-400" />
          <select
            value={currentBoardId}
            onChange={e => {
              if (e.target.value === '__NEW__') {
                onOpenNewBoardModal();
              } else {
                onSelectBoard(e.target.value);
              }
            }}
            className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer max-w-[140px] truncate"
          >
            {boardsList.map(b => (
              <option key={b.id} value={b.id} className="bg-slate-900 text-slate-200">
                {b.title}
              </option>
            ))}
            <option value="__NEW__" className="bg-slate-900 text-emerald-400 font-semibold">
              + Novo Quadro...
            </option>
          </select>

          <button
            onClick={onOpenRenameBoardModal}
            title={`Renomear quadro "${currentBoardTitle}"`}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition ml-0.5"
          >
            <Edit2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Lado Direito: Filtros, Nova Coluna e Usuário */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar tarefa ou tag..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition w-36 sm:w-48"
          />
        </div>

        <select
          value={priorityFilter}
          onChange={e => onPriorityFilterChange(e.target.value as Priority | 'ALL')}
          className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
        >
          <option value="ALL">Prioridades</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Média</option>
          <option value="LOW">Baixa</option>
        </select>

        {availableAssignees.length > 0 && (
          <select
            value={assigneeFilter}
            onChange={e => onAssigneeFilterChange(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer max-w-[130px] truncate"
          >
            <option value="ALL">Responsáveis</option>
            <option value="UNASSIGNED">Sem Responsável</option>
            {availableAssignees.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={onOpenColumnModal}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition shadow"
          title="Adicionar uma nova coluna ao quadro"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nova Coluna</span>
        </button>

        {/* Usuário e Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
          <div className="flex items-center gap-1.5 bg-slate-900/60 py-1 px-2.5 rounded-lg border border-slate-700/60 text-xs text-slate-300">
            <User className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-medium max-w-[100px] truncate">{user?.name}</span>
          </div>

          <button
            onClick={logout}
            title="Sair da conta"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded-lg transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
