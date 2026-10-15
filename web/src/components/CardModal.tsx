import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardType, Priority } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  X,
  Plus,
  Trash2,
  CheckSquare,
  User as UserIcon,
  Pencil,
  Calendar,
  FileText,
  Sparkles,
  BookOpen,
  Bug,
  CornerDownRight,
  GitBranch,
} from 'lucide-react';

interface CardModalProps {
  isOpen: boolean;
  mode: 'view' | 'edit';
  columnId: string;
  columnTitle?: string;
  cardToEdit?: Card | null;
  initialParentId?: string | null;
  initialType?: CardType;
  allBoardCards?: Card[];
  onClose: () => void;
  onSwitchToEdit: () => void;
  onSwitchToView?: () => void;
  onSave: (data: {
    id?: string;
    columnId: string;
    parentId?: string | null;
    type: CardType;
    title: string;
    description: string;
    priority: Priority;
    tag: string;
    dueDate: string | null;
    assignee: string | null;
    subtasks: { id?: string; title: string; done: boolean }[];
  }) => Promise<void>;
  onToggleSubtask?: (subtaskId: string, done: boolean) => void;
  onOpenCreateChild?: (parentId: string, parentType: CardType) => void;
}

export const CardModal: React.FC<CardModalProps> = ({
  isOpen,
  mode,
  columnId,
  columnTitle,
  cardToEdit,
  initialParentId,
  initialType,
  allBoardCards = [],
  onClose,
  onSwitchToEdit,
  onSwitchToView,
  onSave,
  onToggleSubtask,
  onOpenCreateChild,
}) => {
  const { user } = useAuth();

  // Estados do formulário de edição (CD-03, CD-04)
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CardType>('TASK');
  const [parentId, setParentId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [tag, setTag] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [subtasks, setSubtasks] = useState<{ id?: string; title: string; done: boolean }[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fecha no Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Sincroniza dados com o card selecionado
  useEffect(() => {
    if (cardToEdit) {
      setTitle(cardToEdit.title);
      setType(cardToEdit.type || 'TASK');
      setParentId(cardToEdit.parent_id || null);
      setDescription(cardToEdit.description || '');
      setPriority(cardToEdit.priority);
      setTag(cardToEdit.tag || '');
      setDueDate(cardToEdit.due_date || '');
      setAssignee(cardToEdit.assignee || '');
      setSubtasks(
        cardToEdit.subtasks?.map(s => ({ id: s.id, title: s.title, done: s.done })) || []
      );
    } else {
      setTitle('');
      setType(initialType || 'TASK');
      setParentId(initialParentId || null);
      setDescription('');
      setPriority('MEDIUM');
      setTag('');
      setDueDate('');
      setAssignee('');
      setSubtasks([]);
    }
    setNewSubtaskTitle('');
    setError(null);
  }, [cardToEdit, isOpen, initialType, initialParentId]);

  // Lista de candidatos a cartão pai válidos baseado nas regras de parentesco (CD-04)
  const eligibleParents = useMemo(() => {
    if (type === 'EPIC') return [];

    return allBoardCards.filter(candidate => {
      // Não pode ser ele mesmo
      if (cardToEdit && candidate.id === cardToEdit.id) return false;
      // Não pode ser subtarefa
      if (candidate.type === 'SUBTASK') return false;

      if (type === 'STORY') {
        return candidate.type === 'EPIC';
      }
      if (type === 'TASK' || type === 'BUG') {
        return candidate.type === 'EPIC' || candidate.type === 'STORY';
      }
      if (type === 'SUBTASK') {
        return candidate.type === 'TASK' || candidate.type === 'BUG' || candidate.type === 'STORY';
      }
      return true;
    });
  }, [allBoardCards, type, cardToEdit]);

  if (!isOpen) return null;

  const getTypeBadge = (cardType: CardType) => {
    switch (cardType) {
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

  const getPriorityBadge = (p: Priority) => {
    switch (p) {
      case 'HIGH':
        return { label: 'Alta', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' };
      case 'MEDIUM':
        return { label: 'Média', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' };
      case 'LOW':
        return { label: 'Baixa', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' };
    }
  };

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

  // Funções de manipulação de subtarefas em modo edição
  const handleAddSubtask = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    setSubtasks([...subtasks, { title: newSubtaskTitle.trim(), done: false }]);
    setNewSubtaskTitle('');
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, idx) => idx !== index));
  };

  const handleToggleSubtask = (index: number) => {
    setSubtasks(
      subtasks.map((st, idx) => (idx === index ? { ...st, done: !st.done } : st))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('O título é obrigatório.');
      return;
    }

    if (type === 'SUBTASK' && !parentId) {
      setError('Uma subtarefa deve obrigatoriamente estar vinculada a um cartão pai.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSave({
        id: cardToEdit?.id,
        columnId,
        parentId: type === 'EPIC' ? null : (parentId || null),
        type,
        title: title.trim(),
        description: description.trim(),
        priority,
        tag: tag.trim(),
        dueDate: dueDate || null,
        assignee: assignee.trim() || null,
        subtasks,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar a tarefa.');
    } finally {
      setLoading(false);
    }
  };

  // MODO VISUALIZAÇÃO
  if (mode === 'view' && cardToEdit) {
    const typeBadge = getTypeBadge(cardToEdit.type || 'TASK');
    const TypeIcon = typeBadge.Icon;
    const priorityBadge = getPriorityBadge(cardToEdit.priority);
    const dueDateBadge = getDueDateInfo(cardToEdit.due_date);
    const viewSubtasks = cardToEdit.subtasks || [];
    const childrenCards = cardToEdit.children || [];

    // Progresso agregado no pai (CD-05)
    const progress = cardToEdit.progress || {
      total: viewSubtasks.length + childrenCards.length,
      completed: viewSubtasks.filter(s => s.done).length,
      percent: (viewSubtasks.length + childrenCards.length) > 0
        ? Math.round((viewSubtasks.filter(s => s.done).length / (viewSubtasks.length + childrenCards.length)) * 100)
        : 0,
    };

    const parentCard = cardToEdit.parent_id
      ? allBoardCards.find(c => c.id === cardToEdit.parent_id)
      : null;

    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      >
        <div
          onClick={e => e.stopPropagation()}
          className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header Visualização */}
          <div className="px-6 py-4 border-b border-slate-700 flex items-start justify-between gap-4 bg-slate-800/80">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                {/* Tipo de Cartão (CD-04) */}
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border flex items-center gap-1.5 ${typeBadge.color}`}>
                  <TypeIcon className="w-3.5 h-3.5" />
                  <span>{typeBadge.label}</span>
                </span>

                {columnTitle && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    Coluna: {columnTitle}
                  </span>
                )}

                {/* Cartão Pai Vinculado (CD-03) */}
                {parentCard && (
                  <span className="text-xs text-slate-300 bg-slate-900/60 px-2.5 py-0.5 rounded-md border border-slate-700 flex items-center gap-1" title="Vinculado ao cartão pai">
                    <CornerDownRight className="w-3 h-3 text-indigo-400" />
                    <span>Pai: <strong className="text-slate-100">{parentCard.title}</strong></span>
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-100 leading-snug break-words">
                {cardToEdit.title}
              </h2>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={onSwitchToEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition"
                title="Editar esta tarefa"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-700/60 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body Visualização */}
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            {/* Metadados / Badges */}
            <div className="flex flex-wrap items-center gap-2.5 p-3 bg-slate-900/60 rounded-xl border border-slate-700/60">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">Prioridade:</span>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${priorityBadge.color}`}>
                  {priorityBadge.label}
                </span>
              </div>

              {cardToEdit.tag && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Tag:</span>
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
                    {cardToEdit.tag}
                  </span>
                </div>
              )}

              {dueDateBadge && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">Vencimento:</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs ${dueDateBadge.color}`}>
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{dueDateBadge.text}</span>
                  </span>
                </div>
              )}

              {cardToEdit.assignee && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-slate-400">Responsável:</span>
                  <div className="inline-flex items-center gap-1.5 bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm flex-shrink-0 ${getAvatarColor(
                        cardToEdit.assignee
                      )}`}
                    >
                      {getInitials(cardToEdit.assignee)}
                    </span>
                    <span>{cardToEdit.assignee}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Descrição Completa */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span>Descrição Completa</span>
              </div>
              {cardToEdit.description && cardToEdit.description.trim() ? (
                <div className="p-4 bg-slate-900/70 rounded-xl border border-slate-700/70 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap select-text">
                  {cardToEdit.description}
                </div>
              ) : (
                <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 text-xs italic text-slate-500">
                  Nenhuma descrição informada para esta tarefa.
                </div>
              )}
            </div>

            {/* Progresso Agregado no Pai (CD-05) */}
            {progress.total > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  <div className="flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-indigo-400" />
                    <span>
                      Progresso Agregado ({progress.completed}/{progress.total})
                    </span>
                  </div>
                  <span className="text-indigo-400 font-semibold">{progress.percent}%</span>
                </div>

                <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full transition-all duration-300 ${
                      progress.percent === 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Cartões-Filhos / Subtarefas completas (CD-03) */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                <div className="flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4 text-indigo-400" />
                  <span>Cartões Filhos ({childrenCards.length})</span>
                </div>

                {onOpenCreateChild && (
                  <button
                    type="button"
                    onClick={() => onOpenCreateChild(cardToEdit.id, cardToEdit.type || 'TASK')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 normal-case font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Filho</span>
                  </button>
                )}
              </div>

              {childrenCards.length > 0 ? (
                <div className="space-y-2">
                  {childrenCards.map(child => {
                    const cType = getTypeBadge(child.type || 'SUBTASK');
                    const CIcon = cType.Icon;
                    return (
                      <div
                        key={child.id}
                        className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-xl border border-slate-700/60 text-xs text-slate-200"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 ${cType.color}`}>
                            <CIcon className="w-2.5 h-2.5" />
                            <span>{cType.label}</span>
                          </span>
                          <span className="font-medium truncate">{child.title}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                            {child.assignee || 'Sem resp.'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 bg-slate-900/30 rounded-xl border border-slate-800 text-xs italic text-slate-500">
                  Nenhum cartão filho vinculado.
                </div>
              )}
            </div>

            {/* Checklist Inline */}
            {viewSubtasks.length > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  <div className="flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-indigo-400" />
                    <span>Checklist Rápido ({viewSubtasks.filter(s => s.done).length}/{viewSubtasks.length})</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {viewSubtasks.map(st => (
                    <label
                      key={st.id}
                      className="flex items-center gap-2.5 p-2.5 bg-slate-900/50 hover:bg-slate-900/80 rounded-lg border border-slate-700/60 text-sm text-slate-200 cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={st.done}
                        onChange={e => onToggleSubtask && onToggleSubtask(st.id, e.target.checked)}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <span className={st.done ? 'line-through text-slate-500' : 'text-slate-200'}>
                        {st.title}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Visualização */}
          <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between gap-3 bg-slate-800/80">
            <span className="text-xs text-slate-400">
              Para fazer alterações nesta tarefa, clique em Editar.
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 rounded-xl transition"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={onSwitchToEdit}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow flex items-center gap-1.5 transition"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar Tarefa</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MODO EDIÇÃO / CRIAÇÃO
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              {cardToEdit ? 'Editar Tarefa' : 'Nova Tarefa'}
            </h2>
            {columnTitle && (
              <p className="text-xs text-slate-400 mt-0.5">
                Coluna: <span className="text-indigo-400 font-medium">{columnTitle}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Tipo de Cartão e Cartão Pai (CD-03, CD-04) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/60">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Tipo de Cartão (CD-04)
              </label>
              <select
                value={type}
                onChange={e => {
                  const newType = e.target.value as CardType;
                  setType(newType);
                  if (newType === 'EPIC') setParentId(null);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
              >
                <option value="TASK">Tarefa (Padrão)</option>
                <option value="BUG">Bug / Defeito</option>
                <option value="STORY">História de Usuário</option>
                <option value="EPIC">Épico (Sem pai)</option>
                <option value="SUBTASK">Subtarefa (Requer pai)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Cartão Pai {type === 'SUBTASK' ? '(Obrigatório)' : '(Opcional)'}
              </label>
              {type === 'EPIC' ? (
                <div className="text-xs text-slate-500 italic py-2.5">
                  Épicos são topo da hierarquia e não possuem pai.
                </div>
              ) : (
                <select
                  value={parentId || ''}
                  onChange={e => setParentId(e.target.value || null)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  <option value="">Nenhum (Cartão Raiz)</option>
                  {eligibleParents.map(parent => (
                    <option key={parent.id} value={parent.id}>
                      [{parent.type}] {parent.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Título
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Implementar autenticação JWT"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Descrição
            </label>
            <textarea
              rows={3}
              placeholder="Detalhes técnicos, critérios de aceite..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition resize-y min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Prioridade
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as Priority)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
              >
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Tag
              </label>
              <input
                type="text"
                placeholder="Ex: Backend, Frontend, UI..."
                value={tag}
                onChange={e => setTag(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Vencimento
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Responsável
                </label>
                {user?.name && assignee !== user.name && (
                  <button
                    type="button"
                    onClick={() => setAssignee(user.name)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium transition cursor-pointer"
                  >
                    Atribuir a mim
                  </button>
                )}
              </div>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Nome do responsável..."
                  value={assignee}
                  onChange={e => setAssignee(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>
          </div>

          {/* Checklist de Subtarefas Rápidas */}
          <div className="pt-3 border-t border-slate-700/80">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              <CheckSquare className="w-4 h-4 text-indigo-400" />
              <span>Checklist Rápido</span>
            </div>

            <div className="space-y-2 mb-3">
              {subtasks.map((st, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 bg-slate-900/60 rounded-lg border border-slate-700/60"
                >
                  <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={st.done}
                      onChange={() => handleToggleSubtask(idx)}
                      className="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className={`truncate ${st.done ? 'line-through text-slate-500' : ''}`}>
                      {st.title}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleRemoveSubtask(idx)}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Input para adicionar subtarefa */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Nova subtarefa de checklist..."
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <button
                type="button"
                onClick={() => handleAddSubtask()}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium rounded-lg transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar</span>
              </button>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
            {cardToEdit && onSwitchToView ? (
              <button
                type="button"
                onClick={onSwitchToView}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 rounded-xl transition"
              >
                Voltar à Visualização
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 rounded-xl transition"
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow transition flex items-center gap-2"
            >
              {loading ? 'Salvando...' : cardToEdit ? 'Atualizar Tarefa' : 'Criar Tarefa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
