import React, { useState, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardType, Priority, Subtask } from '../types';
import {
  Calendar,
  CheckSquare,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlignLeft,
  Sparkles,
  BookOpen,
  Bug,
  CornerDownRight,
  GitBranch,
} from 'lucide-react';

interface CardItemProps {
  card: Card;
  columnTitle: string;
  onView: (card: Card) => void;
  onEdit: (card: Card) => void;
  onDelete: (cardId: string) => void;
  onToggleSubtask: (subtaskId: string, done: boolean) => void;
}

export const CardItem: React.FC<CardItemProps> = ({
  card,
  columnTitle,
  onView,
  onEdit,
  onDelete,
  onToggleSubtask,
}) => {
  const [showSubtasks, setShowSubtasks] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: {
      type: 'Card',
      card,
    },
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    listeners?.onPointerDown?.(e);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pointerStartRef.current) {
      const dx = Math.abs(e.clientX - pointerStartRef.current.x);
      const dy = Math.abs(e.clientY - pointerStartRef.current.y);
      if (dx > 5 || dy > 5) {
        return;
      }
    }
    if (isDragging) {
      return;
    }
    onView(card);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const subtasks = card.subtasks || [];
  const childrenCards = card.children || [];
  const isCompletedColumn = columnTitle.toLowerCase().includes('conclu') || columnTitle.toLowerCase().includes('done');

  // CD-05: Progresso agregado (checklist + cartões-filho)
  const progress = card.progress || {
    total: subtasks.length + childrenCards.length,
    completed: subtasks.filter(s => s.done).length,
    percent: (subtasks.length + childrenCards.length) > 0
      ? Math.round((subtasks.filter(s => s.done).length / (subtasks.length + childrenCards.length)) * 100)
      : 0,
  };

  const isAllCompleted = (progress.total > 0 && progress.completed === progress.total) || isCompletedColumn;

  // CD-04: Type Badge
  const getTypeBadge = (type: CardType) => {
    switch (type) {
      case 'EPIC':
        return { label: 'Épico', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40', Icon: Sparkles };
      case 'STORY':
        return { label: 'História', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40', Icon: BookOpen };
      case 'BUG':
        return { label: 'Bug', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40', Icon: Bug };
      case 'SUBTASK':
        return { label: 'Subtarefa', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40', Icon: CornerDownRight };
      case 'TASK':
      default:
        return { label: 'Tarefa', color: 'bg-slate-700/60 text-slate-300 border-slate-600/40', Icon: CheckSquare };
    }
  };

  const typeBadge = getTypeBadge(card.type || 'TASK');

  // Priority Badge
  const getPriorityBadge = (priority: Priority) => {
    switch (priority) {
      case 'HIGH':
        return { label: 'Alta', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
      case 'MEDIUM':
        return { label: 'Média', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
      case 'LOW':
        return { label: 'Baixa', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
    }
  };

  const priorityBadge = getPriorityBadge(card.priority);

  // Due Date calculation
  const getDueDateInfo = (dueDateStr: string | null) => {
    if (!dueDateStr) return null;
    const parts = dueDateStr.split('-');
    if (parts.length !== 3) return null;

    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(year, month - 1, day);
    due.setHours(0, 0, 0, 0);

    const formatted = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (isAllCompleted) {
      return { text: formatted, color: 'bg-slate-700/50 text-slate-400 border-slate-600/30' };
    }

    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      const text = absDays === 1 ? 'Ontem (Atrasado)' : `${absDays}d atrasado`;
      return { text, color: 'bg-rose-500/25 text-rose-300 border-rose-500/40 font-semibold' };
    } else if (diffDays === 0) {
      return { text: 'Vence hoje', color: 'bg-amber-500/25 text-amber-300 border-amber-500/40 font-semibold' };
    } else if (diffDays === 1) {
      return { text: 'Amanhã', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
    } else {
      return { text: formatted, color: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const dueDateBadge = getDueDateInfo(card.due_date);

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getAvatarColor = (name: string): string => {
    const colors = [
      'bg-indigo-600',
      'bg-violet-600',
      'bg-emerald-600',
      'bg-amber-600',
      'bg-rose-600',
      'bg-sky-600',
      'bg-teal-600',
      'bg-fuchsia-600',
      'bg-blue-600',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const TypeIcon = typeBadge.Icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={`group relative bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-indigo-500/50 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all duration-150 cursor-pointer active:cursor-grabbing select-none ${
        isDragging ? 'opacity-40 scale-95 border-indigo-500 ring-2 ring-indigo-500/50 cursor-grabbing' : ''
      }`}
    >
      {/* Top row: Badges & Actions */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Tipo do Cartão (CD-04) */}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${typeBadge.color}`}>
            <TypeIcon className="w-3 h-3" />
            <span>{typeBadge.label}</span>
          </span>

          {/* Prioridade */}
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${priorityBadge.color}`}>
            {priorityBadge.label}
          </span>

          {/* Tag */}
          {card.tag && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-700/70 text-slate-300 border border-slate-600/40">
              {card.tag}
            </span>
          )}

          {/* Indicador de cartão filho (CD-03) */}
          {card.parent_id && (
            <span className="text-[10px] text-indigo-400 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-500/30 flex items-center gap-0.5" title="Cartão filho">
              <CornerDownRight className="w-2.5 h-2.5" />
              <span>Filho</span>
            </span>
          )}
        </div>

        {/* Action icons (Edit / Delete) */}
        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              onEdit(card);
            }}
            title="Editar cartão"
            className="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              if (confirm(`Tem certeza que deseja arquivar o cartão "${card.title}"?`)) {
                onDelete(card.id);
              }
            }}
            title="Arquivar cartão"
            className="p-1 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-slate-100 leading-snug mb-2.5 group-hover:text-indigo-200 transition-colors">
        {card.title}
      </h3>

      {/* Progresso Agregado no Pai (CD-05: Checklist + Cartões-Filho) */}
      {progress.total > 0 && (
        <div className="mb-2.5 bg-slate-900/40 p-2 rounded-lg border border-slate-700/50">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                setShowSubtasks(!showSubtasks);
              }}
              className="flex items-center gap-1 hover:text-indigo-400 transition"
            >
              <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                {progress.completed}/{progress.total} concluídos ({progress.percent}%)
              </span>
              {childrenCards.length > 0 && (
                <span className="text-[10px] text-amber-400 ml-1">
                  ({childrenCards.length} filhas)
                </span>
              )}
              {showSubtasks ? (
                <ChevronUp className="w-3 h-3 text-slate-400 ml-0.5" />
              ) : (
                <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
              )}
            </button>
          </div>

          <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                progress.percent === 100 ? 'bg-emerald-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          {/* Subtasks and Children expanded preview */}
          {showSubtasks && (
            <div className="mt-2.5 pt-2 border-t border-slate-700/60 space-y-1.5">
              {/* Checklists inline */}
              {subtasks.map((st: Subtask) => (
                <label
                  key={st.id}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => e.stopPropagation()}
                  className="flex items-center gap-2 text-xs text-slate-300 hover:text-slate-100 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={st.done}
                    onChange={e => onToggleSubtask(st.id, e.target.checked)}
                    className="w-3.5 h-3.5 rounded bg-slate-800 border-slate-600 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className={st.done ? 'line-through text-slate-500' : ''}>
                    {st.title}
                  </span>
                </label>
              ))}

              {/* Child cards preview (CD-03) */}
              {childrenCards.map(child => (
                <div
                  key={child.id}
                  className="flex items-center justify-between text-[11px] text-slate-300 bg-slate-800/80 p-1.5 rounded border border-slate-700/60"
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <CornerDownRight className="w-3 h-3 text-indigo-400 shrink-0" />
                    <span className="truncate">{child.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                    {child.assignee || 'Sem resp.'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom row: Description indicator, Due Date and Assignee */}
      <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-slate-700/40">
        <div className="flex items-center gap-2">
          {card.description && (
            <span title="Este cartão possui descrição detalhada" className="text-slate-400 hover:text-slate-300">
              <AlignLeft className="w-3.5 h-3.5" />
            </span>
          )}

          {childrenCards.length > 0 && (
            <span title={`${childrenCards.length} cartões-filhos vinculados`} className="flex items-center gap-1 text-[11px] text-indigo-300 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-700/40">
              <GitBranch className="w-3 h-3" />
              <span>{childrenCards.length}</span>
            </span>
          )}

          {dueDateBadge && (
            <span
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${dueDateBadge.color}`}
            >
              <Calendar className="w-3 h-3" />
              <span>{dueDateBadge.text}</span>
            </span>
          )}
        </div>

        {card.assignee && (
          <div className="flex items-center gap-1.5" title={`Responsável: ${card.assignee}`}>
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm ring-1 ring-white/10 ${getAvatarColor(
                card.assignee
              )}`}
            >
              {getInitials(card.assignee)}
            </div>
            <span className="text-xs text-slate-300 max-w-[80px] truncate hidden sm:inline">
              {card.assignee}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
