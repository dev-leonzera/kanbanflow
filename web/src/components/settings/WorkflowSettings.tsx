import React, { useState } from 'react';
import {
  Columns,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Gauge,
  Check,
  AlertCircle,
  Save,
  Shield,
} from 'lucide-react';
import { Board, Column, BoardRole } from '../../types';
import { api } from '../../api/client';

interface WorkflowSettingsProps {
  board: Board | null;
  columns?: Column[];
  userBoardRole?: BoardRole;
  onRefreshBoard?: () => Promise<void>;
  onMoveColumn?: (columnIndex: number, direction: 'left' | 'right') => Promise<void>;
  onUpdateColumn?: (columnId: string, payload: { title?: string; wipLimit?: number | null }) => Promise<void>;
  onDeleteColumn?: (columnId: string) => Promise<void>;
  onCreateColumn?: (title: string, wipLimit?: number | null) => Promise<void>;
}

export const WorkflowSettings: React.FC<WorkflowSettingsProps> = ({
  board,
  columns = [],
  userBoardRole = 'OWNER',
  onRefreshBoard,
  onMoveColumn,
  onUpdateColumn,
  onDeleteColumn,
  onCreateColumn,
}) => {
  const canEdit = userBoardRole === 'OWNER' || userBoardRole === 'EDITOR';

  // Nova Coluna
  const [newTitle, setNewTitle] = useState('');
  const [newWip, setNewWip] = useState('');
  const [creating, setCreating] = useState(false);

  // Edição de colunas existentes
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editWip, setEditWip] = useState('');
  const [savingColId, setSavingColId] = useState<string | null>(null);

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleStartEdit = (col: Column) => {
    setEditingColId(col.id);
    setEditTitle(col.title);
    setEditWip(col.wip_limit !== null && col.wip_limit !== undefined ? String(col.wip_limit) : '');
  };

  const handleCancelEdit = () => {
    setEditingColId(null);
    setEditTitle('');
    setEditWip('');
  };

  const handleSaveEdit = async (colId: string) => {
    if (!editTitle.trim()) return;
    try {
      setSavingColId(colId);
      setMsg(null);
      const parsedWip = editWip.trim() ? parseInt(editWip, 10) : null;
      if (onUpdateColumn) {
        await onUpdateColumn(colId, {
          title: editTitle.trim(),
          wipLimit: isNaN(parsedWip as any) ? null : parsedWip,
        });
      } else {
        await api.updateColumn(colId, {
          title: editTitle.trim(),
          wipLimit: isNaN(parsedWip as any) ? null : parsedWip,
        });
      }
      setEditingColId(null);
      setMsg({ type: 'success', text: 'Coluna atualizada com sucesso!' });
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Falha ao atualizar coluna.' });
    } finally {
      setSavingColId(null);
    }
  };

  const handleCreateNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      setCreating(true);
      setMsg(null);
      const parsedWip = newWip.trim() ? parseInt(newWip, 10) : null;
      const wipValue = isNaN(parsedWip as any) ? null : parsedWip;

      if (onCreateColumn) {
        await onCreateColumn(newTitle.trim(), wipValue);
      } else if (board) {
        await api.createColumn({
          boardId: board.id,
          title: newTitle.trim(),
          wipLimit: wipValue,
        });
      }
      setNewTitle('');
      setNewWip('');
      setMsg({ type: 'success', text: 'Nova coluna adicionada com sucesso!' });
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Falha ao criar coluna.' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (col: Column) => {
    const cardCount = col.cards ? col.cards.length : 0;
    const confirmText =
      cardCount > 0
        ? `A coluna "${col.title}" contém ${cardCount} cartão(ões). Tem certeza que deseja excluí-la? Os cartões vinculados serão arquivados.`
        : `Deseja realmente excluir a coluna "${col.title}"?`;

    if (!window.confirm(confirmText)) return;

    try {
      setMsg(null);
      if (onDeleteColumn) {
        await onDeleteColumn(col.id);
      } else {
        await api.deleteColumn(col.id);
      }
      setMsg({ type: 'success', text: 'Coluna removida com sucesso.' });
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Falha ao excluir coluna.' });
    }
  };

  if (!board) {
    return (
      <div className="p-8 text-center text-slate-400 text-xs">
        Nenhum quadro selecionado.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Columns className="w-5 h-5 text-indigo-400" />
          Fluxo de Trabalho & Colunas Kanban
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure as etapas do fluxo no quadro <strong className="text-slate-200">{board.title}</strong>,
          reordene colunas e defina limites de trabalho em progresso (WIP limits).
        </p>
      </div>

      {!canEdit && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Você possui papel de <strong>{userBoardRole}</strong> neste Quadro. Apenas Proprietários e
            Editores podem alterar o fluxo e colunas.
          </span>
        </div>
      )}

      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            msg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {msg.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Adicionar Coluna */}
      {canEdit && (
        <form
          onSubmit={handleCreateNew}
          className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3"
        >
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-indigo-400" />
            Adicionar Nova Etapa ao Fluxo
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              required
              placeholder="Nome da coluna (ex: Code Review) *"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 sm:col-span-2"
            />
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                placeholder="Limite WIP (opcional)"
                value={newWip}
                onChange={e => setNewWip(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg transition shrink-0"
              >
                {creating ? 'Criando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Lista e Reordenação das Colunas */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 text-xs font-semibold text-slate-400 flex items-center justify-between">
          <span>Ordem & Etapa</span>
          <div className="flex items-center gap-8 pr-2">
            <span>Limite WIP</span>
            <span>Ações</span>
          </div>
        </div>

        {columns.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs italic">
            Nenhuma coluna encontrada neste quadro.
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {columns.map((col, idx) => {
              const isEditing = editingColId === col.id;

              return (
                <div
                  key={col.id}
                  className="px-4 py-3 flex items-center justify-between hover:bg-slate-900/30 transition text-xs"
                >
                  {/* Lado Esquerdo: Posição, Reordenação e Título */}
                  <div className="flex items-center gap-3">
                    {canEdit && (
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveColumn && onMoveColumn(idx, 'left')}
                          className="p-0.5 text-slate-500 hover:text-indigo-400 disabled:opacity-20 transition"
                          title="Mover coluna para a esquerda / cima"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === columns.length - 1}
                          onClick={() => onMoveColumn && onMoveColumn(idx, 'right')}
                          className="p-0.5 text-slate-500 hover:text-indigo-400 disabled:opacity-20 transition"
                          title="Mover coluna para a direita / baixo"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <span className="w-6 text-center font-bold text-slate-500 text-[11px]">
                      #{idx + 1}
                    </span>

                    {isEditing ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                        autoFocus
                      />
                    ) : (
                      <div>
                        <span className="font-semibold text-slate-100">{col.title}</span>
                        {col.cards && (
                          <span className="text-[11px] text-slate-500 ml-2">
                            ({col.cards.length} cartões)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Lado Direito: WIP limit e Botões */}
                  <div className="flex items-center gap-6 pr-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Gauge className="w-3.5 h-3.5 text-slate-500" />
                        <input
                          type="number"
                          min="1"
                          placeholder="Sem limite"
                          value={editWip}
                          onChange={e => setEditWip(e.target.value)}
                          className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    ) : (
                      <span className="w-24 text-center">
                        {col.wip_limit ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-bold text-[10px]">
                            <Gauge className="w-3 h-3 text-cyan-400" />
                            {col.wip_limit}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic text-[11px]">Ilimitado</span>
                        )}
                      </span>
                    )}

                    <div className="flex items-center gap-1.5 w-16 justify-end">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(col.id)}
                            disabled={savingColId === col.id}
                            className="p-1 text-emerald-400 hover:text-emerald-300"
                            title="Salvar alterações"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="p-1 text-slate-500 hover:text-slate-300"
                            title="Cancelar edição"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartEdit(col)}
                              className="text-[11px] text-slate-400 hover:text-indigo-300 px-1 py-0.5"
                              title="Editar coluna"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(col)}
                              className="p-1 text-slate-500 hover:text-rose-400"
                              title="Excluir coluna"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
