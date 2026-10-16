import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Column as ColumnType, Card, EstimateType } from '../types';
import { CardItem } from './CardItem';
import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

interface ColumnProps {
  column: ColumnType;
  cards: Card[];
  droppableId?: string;
  estimateType?: EstimateType;
  onOpenNewCardModal: (columnId: string) => void;
  onViewCard: (card: Card) => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (cardId: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onToggleSubtask: (subtaskId: string, done: boolean) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
}

export const Column: React.FC<ColumnProps> = ({
  column,
  cards,
  droppableId,
  estimateType = 'POINTS',
  onOpenNewCardModal,
  onViewCard,
  onEditCard,
  onDeleteCard,
  onDeleteColumn,
  onToggleSubtask,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId || column.id,
    data: {
      type: 'Column',
      column,
    },
  });

  const cardIds = cards.map(c => c.id);

  const isWipExceeded = Boolean(column.wip_limit && cards.length > column.wip_limit);

  return (
    <section
      className={`flex-shrink-0 w-80 max-h-full flex flex-col bg-slate-900/70 border rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm transition-all ${
        isWipExceeded
          ? 'border-rose-500/60 shadow-rose-950/30 ring-1 ring-rose-500/30'
          : 'border-slate-800'
      }`}
    >
      {/* Column Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between gap-2 bg-slate-800/40">
        <div className="flex items-center gap-2">
          {/* Reorder Buttons (BD-01) */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={onMoveLeft}
              disabled={!canMoveLeft}
              title="Mover coluna para a esquerda"
              className="p-0.5 text-slate-500 hover:text-indigo-400 disabled:opacity-20 disabled:hover:text-slate-500 transition rounded"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onMoveRight}
              disabled={!canMoveRight}
              title="Mover coluna para a direita"
              className="p-0.5 text-slate-500 hover:text-indigo-400 disabled:opacity-20 disabled:hover:text-slate-500 transition rounded"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <h2 className="font-bold text-sm text-slate-100 tracking-wide truncate max-w-[130px]">
            {column.title}
          </h2>
          {column.wip_limit ? (
            <span
              title={
                cards.length > column.wip_limit
                  ? `Limite WIP excedido! Máximo recomendado: ${column.wip_limit}`
                  : `Limite WIP: ${column.wip_limit}`
              }
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${
                cards.length > column.wip_limit
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                  : cards.length === column.wip_limit
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700/60'
              }`}
            >
              <span>{cards.length}/{column.wip_limit}</span>
              {cards.length > column.wip_limit && <span className="text-[9px]">WIP!</span>}
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/60">
              {cards.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onOpenNewCardModal(column.id)}
            title="Adicionar tarefa nesta coluna"
            className="p-1 hover:bg-slate-700/60 text-slate-400 hover:text-white rounded-md transition"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Tem certeza que deseja arquivar a coluna "${column.title}" e suas tarefas?`)) {
                onDeleteColumn(column.id);
              }
            }}
            title="Arquivar coluna"
            className="p-1 hover:bg-slate-700/60 text-slate-400 hover:text-rose-400 rounded-md transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cards List / Droppable area */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-3 space-y-3 overflow-y-auto min-h-[140px] transition-colors rounded-b-2xl ${
          isOver ? 'bg-indigo-950/20 ring-1 ring-inset ring-indigo-500/40' : ''
        }`}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {cards.map(card => (
            <CardItem
              key={card.id}
              card={card}
              columnTitle={column.title}
              estimateType={estimateType}
              onView={onViewCard}
              onEdit={onEditCard}
              onDelete={onDeleteCard}
              onToggleSubtask={onToggleSubtask}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div className="h-28 border border-dashed border-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-500 text-center px-4">
            Nenhuma tarefa nesta coluna. Arraste uma ou clique em + para criar.
          </div>
        )}
      </div>

      {/* Quick Add Button */}
      <div className="p-2.5 pt-0">
        <button
          onClick={() => onOpenNewCardModal(column.id)}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 rounded-xl border border-transparent hover:border-slate-700/60 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Adicionar Tarefa</span>
        </button>
      </div>
    </section>
  );
};
