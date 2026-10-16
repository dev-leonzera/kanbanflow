import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  CardType,
  Priority,
  EstimateType,
  CardComment,
  CardAttachment,
  CardRelation,
  CardRelationType,
  CardEvent,
  SubscriptionLevel,
  Sprint,
  CardVisibility,
  CardTimeLog,
  ActiveCardTimer,
} from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
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
  MessageSquare,
  Paperclip,
  Link2,
  ShieldAlert,
  Gauge,
  History,
  Send,
  Download,
  Upload,
  Bell,
  Zap,
  ArrowUpRight,
  Clock,
  Play,
  Square,
  AlertTriangle,
  BarChart2,
  Lock,
} from 'lucide-react';

interface CardModalProps {
  isOpen: boolean;
  mode: 'view' | 'edit';
  columnId: string;
  columnTitle?: string;
  workspaceId?: string;
  estimateType?: EstimateType;
  cardToEdit?: Card | null;
  initialParentId?: string | null;
  initialType?: CardType;
  allBoardCards?: Card[];
  sprints?: Sprint[];
  onClose: () => void;
  onSwitchToEdit: () => void;
  onSwitchToView?: () => void;
  onSave: (data: {
    id?: string;
    columnId: string;
    parentId?: string | null;
    sprintId?: string | null;
    type: CardType;
    title: string;
    description: string;
    priority: Priority;
    tag: string;
    dueDate: string | null;
    assignee: string | null;
    estimate: string | null;
    subtasks: { id?: string; title: string; done: boolean }[];
    visibility?: CardVisibility;
    restrictedToRole?: string | null;
  }) => Promise<void>;
  onToggleSubtask?: (subtaskId: string, done: boolean) => void;
  onOpenCreateChild?: (parentId: string, parentType: CardType) => void;
  onRefreshBoard?: () => Promise<void>;
}

export const CardModal: React.FC<CardModalProps> = ({
  isOpen,
  mode,
  columnId,
  columnTitle,
  workspaceId,
  estimateType = 'POINTS',
  cardToEdit,
  initialParentId,
  initialType,
  allBoardCards = [],
  sprints = [],
  onClose,
  onSwitchToEdit,
  onSave,
  onToggleSubtask,
  onOpenCreateChild,
  onRefreshBoard,
}) => {
  const { user } = useAuth();

  // Estados do formulário de edição (CD-03, CD-04, CD-08, SP-02, PM-04)
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CardType>('TASK');
  const [parentId, setParentId] = useState<string | null>(null);
  const [sprintId, setSprintId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [tag, setTag] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [estimate, setEstimate] = useState('');
  const [visibility, setVisibility] = useState<CardVisibility>('NORMAL');
  const [restrictedToRole, setRestrictedToRole] = useState('');
  const [subtasks, setSubtasks] = useState<{ id?: string; title: string; done: boolean }[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overloadWarning, setOverloadWarning] = useState<string | null>(null);

  // Estados no modo visualização: abas de Detalhes, Comentários/Anexos, Relações, Histórico e Tempo
  const [viewTab, setViewTab] = useState<'details' | 'comments' | 'relations' | 'events' | 'time'>('details');

  // CD-02: Comentários e Anexos
  const [comments, setComments] = useState<CardComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [attachments, setAttachments] = useState<CardAttachment[]>([]);
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');

  // CD-06: Relações entre cartões
  const [relations, setRelations] = useState<CardRelation[]>([]);
  const [targetRelationCardId, setTargetRelationCardId] = useState('');
  const [relationType, setRelationType] = useState<CardRelationType>('BLOCKS');
  const [relationError, setRelationError] = useState<string | null>(null);

  // EV-01: Eventos do cartão
  const [events, setEvents] = useState<CardEvent[]>([]);

  // NT-02: Nível de inscrição no cartão
  const [cardSubscription, setCardSubscription] = useState<SubscriptionLevel>('MENTIONS');

  // TM-01, TM-02: Tempo e Estimativas
  const [timeLogs, setTimeLogs] = useState<CardTimeLog[]>([]);
  const [activeTimer, setActiveTimer] = useState<ActiveCardTimer | null>(null);
  const [timeLogHours, setTimeLogHours] = useState('');
  const [timeLogDesc, setTimeLogDesc] = useState('');
  const [timeLogDate, setTimeLogDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [timerSeconds, setTimerSeconds] = useState(0);

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
      setSprintId(cardToEdit.sprint_id || null);
      setDescription(cardToEdit.description || '');
      setPriority(cardToEdit.priority);
      setTag(cardToEdit.tag || '');
      setDueDate(cardToEdit.due_date || '');
      setAssignee(cardToEdit.assignee || '');
      setEstimate(cardToEdit.estimate || '');
      setVisibility(cardToEdit.visibility || 'NORMAL');
      setRestrictedToRole(cardToEdit.restricted_to_role || '');
      setSubtasks(
        cardToEdit.subtasks?.map(s => ({ id: s.id, title: s.title, done: s.done })) || []
      );

      if (isOpen && mode === 'view') {
        loadCardExtraDetails(cardToEdit.id);
      }
    } else {
      setTitle('');
      setType(initialType || 'TASK');
      setParentId(initialParentId || null);
      setSprintId(null);
      setDescription('');
      setPriority('MEDIUM');
      setTag('');
      setDueDate('');
      setAssignee('');
      setEstimate('');
      setVisibility('NORMAL');
      setRestrictedToRole('');
      setSubtasks([]);
    }
    setNewSubtaskTitle('');
    setError(null);
    setOverloadWarning(null);
    setRelationError(null);
    setViewTab('details');
  }, [cardToEdit, isOpen, initialType, initialParentId, mode]);

  // Cronômetro ativo ticker
  useEffect(() => {
    if (!activeTimer) {
      setTimerSeconds(0);
      return;
    }
    const update = () => {
      const start = new Date(activeTimer.started_at).getTime();
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setTimerSeconds(diff);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  const loadCardExtraDetails = async (cardId: string) => {
    try {
      const [cmList, attList, relList, evList, subInfo, logsList, actTimer] = await Promise.all([
        api.getCardComments(cardId),
        api.getCardAttachments(cardId),
        api.getCardRelations(cardId),
        api.getCardEvents(cardId),
        api.getSubscription('CARD', cardId),
        api.getCardTimeLogs(cardId),
        api.getActiveTimer().catch(() => null),
      ]);
      setComments(cmList);
      setAttachments(attList);
      setRelations(relList);
      setEvents(evList);
      setCardSubscription(subInfo.level || 'MENTIONS');
      setTimeLogs(logsList?.logs || []);
      if (actTimer && actTimer.card_id === cardId) {
        setActiveTimer(actTimer);
      } else {
        setActiveTimer(null);
      }
    } catch (err) {
      console.error('Falha ao carregar detalhes extras do cartão:', err);
    }
  };

  const handleCardSubscriptionChange = async (level: SubscriptionLevel) => {
    if (!cardToEdit) return;
    try {
      await api.saveSubscription('CARD', cardToEdit.id, level);
      setCardSubscription(level);
    } catch (err) {
      console.error('Erro ao salvar inscrição do cartão:', err);
    }
  };

  // Lista de candidatos a cartão pai válidos baseado nas regras de parentesco (CD-04)
  const eligibleParents = useMemo(() => {
    if (type === 'EPIC') return [];

    return allBoardCards.filter(candidate => {
      if (cardToEdit && candidate.id === cardToEdit.id) return false;
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

  // Handlers de Comentários e Anexos (CD-02)
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardToEdit || !newCommentText.trim()) return;
    try {
      const created = await api.addCardComment(cardToEdit.id, newCommentText.trim());
      setComments([...comments, created]);
      setNewCommentText('');
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      alert(err.message || 'Falha ao enviar comentário.');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!cardToEdit) return;
    try {
      await api.deleteCardComment(cardToEdit.id, commentId);
      setComments(comments.filter(c => c.id !== commentId));
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      alert(err.message || 'Falha ao excluir comentário.');
    }
  };

  const handleAddLinkAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardToEdit || !attachmentName.trim() || !attachmentUrl.trim()) return;
    try {
      const created = await api.addCardAttachment(cardToEdit.id, {
        name: attachmentName.trim(),
        url: attachmentUrl.trim(),
        sizeBytes: 0,
        mimeType: 'text/uri-list',
      });
      setAttachments([created, ...attachments]);
      setAttachmentName('');
      setAttachmentUrl('');
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      alert(err.message || 'Falha ao adicionar anexo.');
    }
  };

  const handleFileUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cardToEdit) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('O arquivo excede o limite de 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const created = await api.addCardAttachment(cardToEdit.id, {
          name: file.name,
          url: dataUrl,
          sizeBytes: file.size,
          mimeType: file.type || 'application/octet-stream',
        });
        setAttachments([created, ...attachments]);
        if (onRefreshBoard) await onRefreshBoard();
      } catch (err: any) {
        alert(err.message || 'Falha ao anexar arquivo.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!cardToEdit) return;
    try {
      await api.deleteCardAttachment(cardToEdit.id, attachmentId);
      setAttachments(attachments.filter(a => a.id !== attachmentId));
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      alert(err.message || 'Falha ao excluir anexo.');
    }
  };

  // Handlers de Relações entre Cartões (CD-06)
  const handleAddRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardToEdit || !targetRelationCardId) return;
    try {
      setRelationError(null);
      const created = await api.addCardRelation(cardToEdit.id, {
        targetCardId: targetRelationCardId,
        relationType,
      });
      setRelations([created, ...relations]);
      setTargetRelationCardId('');
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      setRelationError(err.message || 'Falha ao criar relação.');
    }
  };

  const handleDeleteRelation = async (relationId: string) => {
    if (!cardToEdit) return;
    try {
      setRelationError(null);
      await api.deleteCardRelation(cardToEdit.id, relationId);
      setRelations(relations.filter(r => r.id !== relationId));
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      setRelationError(err.message || 'Falha ao remover relação.');
    }
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

  const handlePromoteSubtask = async (subtaskId: string) => {
    try {
      setLoading(true);
      await api.promoteSubtask(subtaskId);
      setSubtasks(prev => prev.filter(s => s.id !== subtaskId));
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      alert(err.message || 'Falha ao promover subtarefa a cartão.');
    } finally {
      setLoading(false);
    }
  };

  // TM-01, TM-02: Funções de Tempo e Cronômetro
  const handleStartTimer = async () => {
    if (!cardToEdit) return;
    try {
      const timer = await api.startCardTimer(cardToEdit.id);
      setActiveTimer(
        timer
          ? {
              id: timer.timerId,
              card_id: timer.cardId,
              card_title: timer.cardTitle,
              user_id: '',
              started_at: timer.startedAt,
            }
          : null
      );
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      alert(err.message || 'Falha ao iniciar cronômetro.');
    }
  };

  const handleStopTimer = async () => {
    if (!cardToEdit) return;
    try {
      await api.stopCardTimer(cardToEdit.id);
      setActiveTimer(null);
      const updatedLogs = await api.getCardTimeLogs(cardToEdit.id);
      setTimeLogs(updatedLogs?.logs || []);
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      alert(err.message || 'Falha ao parar cronômetro.');
    }
  };

  const handleAddTimeLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardToEdit) return;
    const hours = parseFloat(timeLogHours);
    if (isNaN(hours) || hours <= 0) {
      alert('Informe um número válido de horas (> 0).');
      return;
    }
    try {
      await api.createCardTimeLog(cardToEdit.id, {
        hours,
        description: timeLogDesc.trim() || undefined,
        loggedAt: timeLogDate,
      });
      setTimeLogHours('');
      setTimeLogDesc('');
      const updatedLogs = await api.getCardTimeLogs(cardToEdit.id);
      setTimeLogs(updatedLogs?.logs || []);
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      alert(err.message || 'Falha ao lançar horas.');
    }
  };

  const handleDeleteTimeLog = async (logId: string) => {
    if (!cardToEdit) return;
    if (!confirm('Deseja excluir este lançamento de horas?')) return;
    try {
      await api.deleteCardTimeLog(cardToEdit.id, logId);
      const updatedLogs = await api.getCardTimeLogs(cardToEdit.id);
      setTimeLogs(updatedLogs?.logs || []);
      if (onRefreshBoard) await onRefreshBoard();
    } catch (err: any) {
      alert(err.message || 'Falha ao excluir lançamento.');
    }
  };

  // CP-03: Verificação de sobrecarga ao atribuir
  const handleAssigneeChange = async (newAssignee: string) => {
    setAssignee(newAssignee);
    if (!newAssignee.trim() || !workspaceId) {
      setOverloadWarning(null);
      return;
    }
    try {
      const res = await api.checkAssigneeOverload(workspaceId, newAssignee.trim());
      if (res.willOverload) {
        setOverloadWarning(res.message);
      } else {
        setOverloadWarning(null);
      }
    } catch {
      setOverloadWarning(null);
    }
  };

  const formatTimerDigits = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
        sprintId: sprintId || null,
        type,
        title: title.trim(),
        description: description.trim(),
        priority,
        tag: tag.trim(),
        dueDate: dueDate || null,
        assignee: assignee.trim() || null,
        estimate: estimate.trim() || null,
        subtasks,
        visibility,
        restrictedToRole: visibility === 'RESTRICTED' ? restrictedToRole : null,
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

    const cardSprint = cardToEdit.sprint_id
      ? sprints.find(s => s.id === cardToEdit.sprint_id)
      : null;

    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      >
        <div
          onClick={e => e.stopPropagation()}
          className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header Visualização */}
          <div className="px-6 py-4 border-b border-slate-700 flex items-start justify-between gap-4 bg-slate-800/80">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                {/* CD-07: Indicador visual de bloqueio */}
                {cardToEdit.is_blocked && (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-rose-500/25 text-rose-300 border border-rose-500/50 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Bloqueado</span>
                  </span>
                )}

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

                {cardSprint && (
                  <span className="text-xs text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>Sprint: <strong className="text-amber-200">{cardSprint.name}</strong></span>
                  </span>
                )}

                {parentCard && (
                  <span className="text-xs text-slate-300 bg-slate-900/60 px-2.5 py-0.5 rounded-md border border-slate-700 flex items-center gap-1">
                    <CornerDownRight className="w-3 h-3 text-indigo-400" />
                    <span>Pai: <strong className="text-slate-100">{parentCard.title}</strong></span>
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-slate-100 leading-snug break-words">
                {cardToEdit.title}
              </h2>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {/* NT-02: Inscrição por cartão (Todas, Só menções, Nenhuma) */}
              <div
                className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs"
                title="Definir nível de inscrição neste cartão"
              >
                <Bell className="w-3.5 h-3.5 text-indigo-400" />
                <select
                  value={cardSubscription}
                  onChange={e => handleCardSubscriptionChange(e.target.value as SubscriptionLevel)}
                  className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer text-[11px]"
                >
                  <option value="ALL" className="bg-slate-900 text-slate-200">
                    Inscrito: Todas
                  </option>
                  <option value="MENTIONS" className="bg-slate-900 text-slate-200">
                    Inscrito: Só Menções
                  </option>
                  <option value="NONE" className="bg-slate-900 text-slate-200">
                    Inscrito: Nenhuma
                  </option>
                </select>
              </div>

              <button
                type="button"
                onClick={onSwitchToEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition"
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

          {/* Abas de Visualização */}
          <div className="flex border-b border-slate-700 bg-slate-900/60 px-6 gap-3 overflow-x-auto">
            <button
              type="button"
              onClick={() => setViewTab('details')}
              className={`py-2.5 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                viewTab === 'details'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Detalhes & Checklist</span>
            </button>

            <button
              type="button"
              onClick={() => setViewTab('comments')}
              className={`py-2.5 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                viewTab === 'comments'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Comentários ({comments.length}) & Anexos ({attachments.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewTab('relations')}
              className={`py-2.5 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                viewTab === 'relations'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Relações & Bloqueios ({relations.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewTab('events')}
              className={`py-2.5 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                viewTab === 'events'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Histórico ({events.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewTab('time')}
              className={`py-2.5 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                viewTab === 'time'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Tempo & Horas ({timeLogs.length})</span>
              {activeTimer && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
            </button>
          </div>

          {/* Body Visualização */}
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            {viewTab === 'details' && (
              <>
                {/* Alerta de bloqueio ativo (CD-07) */}
                {cardToEdit.is_blocked && cardToEdit.blocked_by && cardToEdit.blocked_by.length > 0 && (
                  <div className="p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-200 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-rose-300">
                      <ShieldAlert className="w-4 h-4" />
                      <span>Este cartão está bloqueado pelas seguintes tarefas abertas:</span>
                    </div>
                    <ul className="list-disc list-inside text-rose-200/90 pl-1">
                      {cardToEdit.blocked_by.map(b => (
                        <li key={b.id}>
                          <strong>{b.title}</strong> {b.column_title ? `(Coluna: ${b.column_title})` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Metadados / Badges */}
                <div className="flex flex-wrap items-center gap-2.5 p-3 bg-slate-900/60 rounded-xl border border-slate-700/60">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400">Prioridade:</span>
                    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${priorityBadge.color}`}>
                      {priorityBadge.label}
                    </span>
                  </div>

                  {cardToEdit.estimate && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400">Estimativa:</span>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                        <Gauge className="w-3 h-3" />
                        <span>
                          {cardToEdit.estimate}{' '}
                          {estimateType === 'POINTS' ? 'pts' : estimateType === 'HOURS' ? 'h' : ''}
                        </span>
                      </span>
                    </div>
                  )}

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
                        <div
                          key={st.id}
                          className="flex items-center justify-between gap-2 p-2.5 bg-slate-900/50 hover:bg-slate-900/80 rounded-lg border border-slate-700/60 transition group"
                        >
                          <label className="flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={st.done}
                              onChange={e => onToggleSubtask && onToggleSubtask(st.id, e.target.checked)}
                              className="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer shrink-0"
                            />
                            <span className={`truncate ${st.done ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                              {st.title}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handlePromoteSubtask(st.id)}
                            title="Promover item de checklist a cartão completo"
                            className="opacity-0 group-hover:opacity-100 px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 hover:text-white rounded border border-indigo-500/30 transition text-[11px] font-medium flex items-center gap-1 shrink-0"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>Promover a cartão</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ABA 2: COMENTÁRIOS E ANEXOS (CD-02) */}
            {viewTab === 'comments' && (
              <div className="space-y-6">
                {/* Seção de Comentários */}
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-400">
                    <MessageSquare className="w-4 h-4" />
                    <span>Comentários ({comments.length})</span>
                  </div>

                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Escreva um comentário sobre esta tarefa..."
                      value={newCommentText}
                      onChange={e => setNewCommentText(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Comentar</span>
                    </button>
                  </form>

                  {comments.length === 0 ? (
                    <div className="p-4 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-xs text-slate-500">
                      Nenhum comentário ainda. Seja o primeiro a comentar!
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                      {comments.map(cm => (
                        <div key={cm.id} className="p-3 bg-slate-900/70 border border-slate-700/70 rounded-xl text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-indigo-300">{cm.user_name || 'Usuário'}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500">
                                {new Date(cm.created_at).toLocaleString('pt-BR')}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(cm.id)}
                                className="text-slate-500 hover:text-rose-400"
                                title="Remover comentário"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{cm.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Seção de Anexos */}
                <div className="space-y-3 pt-4 border-t border-slate-700/70">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                      <Paperclip className="w-4 h-4" />
                      <span>Anexos ({attachments.length})</span>
                    </div>

                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold transition">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Enviar Arquivo</span>
                      <input type="file" className="hidden" onChange={handleFileUploadAttachment} />
                    </label>
                  </div>

                  <form onSubmit={handleAddLinkAttachment} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Nome do link ou documento..."
                      value={attachmentName}
                      onChange={e => setAttachmentName(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="url"
                      placeholder="https://..."
                      value={attachmentUrl}
                      onChange={e => setAttachmentUrl(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold rounded-lg transition"
                    >
                      + Anexar Link
                    </button>
                  </form>

                  {attachments.length === 0 ? (
                    <div className="p-4 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-xs text-slate-500">
                      Nenhum anexo vinculado a este cartão.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {attachments.map(att => (
                        <div
                          key={att.id}
                          className="p-2.5 bg-slate-900/70 border border-slate-700/70 rounded-xl flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <div className="truncate">
                              <a
                                href={att.url}
                                download={att.name}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-slate-100 hover:text-emerald-400 underline truncate block"
                              >
                                {att.name}
                              </a>
                              <span className="text-[10px] text-slate-500">
                                Por {att.user_name || 'Usuário'} • {new Date(att.created_at).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={att.url}
                              download={att.name}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-slate-400 hover:text-emerald-400"
                              title="Baixar / Abrir anexo"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDeleteAttachment(att.id)}
                              className="p-1 text-slate-400 hover:text-rose-400"
                              title="Remover anexo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 3: RELAÇÕES ENTRE CARTÕES E DETECÇÃO DE CICLOS (CD-06, CD-07) */}
            {viewTab === 'relations' && (
              <div className="space-y-4">
                {relationError && (
                  <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs">
                    {relationError}
                  </div>
                )}

                <form onSubmit={handleAddRelation} className="p-4 bg-slate-900/70 border border-slate-700/70 rounded-xl space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4" />
                    <span>Adicionar Relação entre Cartões</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={relationType}
                      onChange={e => setRelationType(e.target.value as CardRelationType)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="BLOCKS">Este cartão BLOQUEIA...</option>
                      <option value="RELATED">Relacionado com...</option>
                      <option value="DUPLICATE">Duplicado de...</option>
                    </select>

                    <select
                      value={targetRelationCardId}
                      onChange={e => setTargetRelationCardId(e.target.value)}
                      required
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Selecione o cartão...</option>
                      {allBoardCards
                        .filter(c => c.id !== cardToEdit.id)
                        .map(c => (
                          <option key={c.id} value={c.id}>
                            [{c.type}] {c.title}
                          </option>
                        ))}
                    </select>

                    <button
                      type="submit"
                      className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
                    >
                      Vincular Cartão
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    O sistema valida automaticamente dependências circulares de bloqueio (detecção de ciclos em grafo).
                  </p>
                </form>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-400">
                    Relações Registradas ({relations.length})
                  </div>

                  {relations.length === 0 ? (
                    <div className="p-4 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-xs text-slate-500">
                      Nenhuma relação com outros cartões.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {relations.map(rel => {
                        const isOutgoing = rel.source_card_id === cardToEdit.id;
                        let badgeText = 'Relacionado';
                        let badgeStyle = 'bg-blue-500/20 text-blue-300 border-blue-500/40';

                        if (rel.relation_type === 'BLOCKS') {
                          badgeText = isOutgoing ? 'Bloqueia' : 'Bloqueado por';
                          badgeStyle = isOutgoing
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-rose-500/25 text-rose-300 border-rose-500/40';
                        } else if (rel.relation_type === 'DUPLICATE') {
                          badgeText = 'Duplicado';
                          badgeStyle = 'bg-slate-700 text-slate-300 border-slate-600';
                        }

                        const otherTitle = isOutgoing ? rel.target_card_title : rel.source_card_title;

                        return (
                          <div
                            key={rel.id}
                            className="p-3 bg-slate-900/70 border border-slate-700/70 rounded-xl flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className={`px-2 py-0.5 rounded font-semibold border text-[10px] ${badgeStyle}`}>
                                {badgeText}
                              </span>
                              <span className="font-medium text-slate-100 truncate">{otherTitle}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteRelation(rel.id)}
                              className="p-1 text-slate-400 hover:text-rose-400"
                              title="Remover relação"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 4: HISTÓRICO DE EVENTOS DO CARTÃO (EV-01) */}
            {viewTab === 'events' && (
              <div className="space-y-2.5">
                {events.length === 0 ? (
                  <div className="p-4 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-xs text-slate-500">
                    Nenhum evento registrado para este cartão.
                  </div>
                ) : (
                  events.map(ev => (
                    <div key={ev.id} className="p-3 bg-slate-900/60 border border-slate-700/60 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-indigo-300">{ev.event_type}</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(ev.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="text-slate-300">
                        Autor: <strong>{ev.user_name || 'Usuário'}</strong>
                        {ev.from_column_title && ev.to_column_title && (
                          <span>
                            {' '}• Moveu de <strong>{ev.from_column_title}</strong> para <strong>{ev.to_column_title}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ABA 5: TEMPO & ESTIMATIVAS (TM-01, TM-02) */}
            {viewTab === 'time' && (
              <div className="space-y-4">
                {/* Cronômetro ao Vivo */}
                <div className="p-4 bg-slate-900/80 border border-slate-700/80 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-full border ${activeTimer ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                        {activeTimer ? 'Cronômetro em Execução' : 'Cronômetro Parado'}
                      </div>
                      <div className="text-2xl font-mono font-bold text-slate-100">
                        {activeTimer ? formatTimerDigits(timerSeconds) : '00:00:00'}
                      </div>
                      {activeTimer && (
                        <div className="text-[11px] text-emerald-400">
                          Iniciado em {new Date(activeTimer.started_at).toLocaleTimeString('pt-BR')}
                        </div>
                      )}
                    </div>
                  </div>

                  {activeTimer ? (
                    <button
                      type="button"
                      onClick={handleStopTimer}
                      className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-xl shadow flex items-center gap-2 transition"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>Parar Cronômetro e Registrar</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartTimer}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow flex items-center gap-2 transition"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>Iniciar Cronômetro</span>
                    </button>
                  )}
                </div>

                {/* Desvio: Estimado vs Realizado (TM-02) */}
                {(() => {
                  const totalLogged = timeLogs.reduce((acc, l) => acc + (l.duration_seconds / 3600), 0);
                  const parsedEst = parseFloat(cardToEdit.estimate || '0') || 0;
                  const deviation = totalLogged - parsedEst;
                  const pct = parsedEst > 0 ? Math.min(100, Math.round((totalLogged / parsedEst) * 100)) : 0;
                  const isOver = parsedEst > 0 && totalLogged > parsedEst;
                  return (
                    <div className="p-4 bg-slate-900/60 border border-slate-700/60 rounded-xl space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                        <div className="flex items-center gap-1.5 text-indigo-400">
                          <BarChart2 className="w-4 h-4" />
                          <span>Estimado vs. Realizado</span>
                        </div>
                        {parsedEst > 0 && (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                            isOver
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          }`}>
                            {isOver
                              ? `Desvio: +${deviation.toFixed(1)}h (+${Math.round((deviation / parsedEst) * 100)}%)`
                              : `Dentro do previsto (${(parsedEst - totalLogged).toFixed(1)}h restantes)`}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/50">
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">Estimado</div>
                          <div className="text-base font-bold text-cyan-300">{parsedEst > 0 ? `${parsedEst}h` : 'Não informado'}</div>
                        </div>
                        <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/50">
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">Realizado</div>
                          <div className="text-base font-bold text-indigo-300">{totalLogged.toFixed(1)}h</div>
                        </div>
                        <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/50">
                          <div className="text-[10px] text-slate-400 uppercase font-semibold">Desvio</div>
                          <div className={`text-base font-bold ${isOver ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {parsedEst > 0 ? `${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}h` : '-'}
                          </div>
                        </div>
                      </div>

                      {parsedEst > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-slate-400">
                            <span>Consumo da estimativa ({pct}%)</span>
                            <span>{totalLogged.toFixed(1)}h de {parsedEst}h</span>
                          </div>
                          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                            <div
                              className={`h-full transition-all duration-300 ${
                                isOver ? 'bg-rose-500' : 'bg-indigo-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Formulário de Lançamento Manual (TM-01) */}
                <form onSubmit={handleAddTimeLog} className="p-4 bg-slate-900/70 border border-slate-700/70 rounded-xl space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Plus className="w-4 h-4" />
                    <span>Lançar Horas Manualmente</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Horas gastas</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        required
                        placeholder="Ex: 1.5"
                        value={timeLogHours}
                        onChange={e => setTimeLogHours(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Data</label>
                      <input
                        type="date"
                        required
                        value={timeLogDate}
                        onChange={e => setTimeLogDate(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Descrição</label>
                      <input
                        type="text"
                        placeholder="Ex: Reunião, refatoração..."
                        value={timeLogDesc}
                        onChange={e => setTimeLogDesc(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shadow"
                    >
                      Lançar Horas
                    </button>
                  </div>
                </form>

                {/* Lista de Horas Lançadas */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-400">
                    Histórico de Apontamentos ({timeLogs.length})
                  </div>

                  {timeLogs.length === 0 ? (
                    <div className="p-4 text-center bg-slate-900/40 rounded-xl border border-slate-800 text-xs text-slate-500">
                      Nenhuma hora lançada neste cartão ainda.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {timeLogs.map(log => (
                        <div
                          key={log.id}
                          className="p-2.5 bg-slate-900/60 border border-slate-700/60 rounded-xl flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-bold text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-700/40 text-[11px]">
                              {((log.hours ?? log.duration_seconds / 3600)).toFixed(1)}h
                            </span>
                            <span className="text-slate-300 font-medium truncate">
                              {log.notes || log.description || 'Sem descrição'}
                            </span>
                            <span className="text-[10px] text-slate-500 shrink-0">
                              por {log.user_name || 'Usuário'} • {new Date(log.log_date || log.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteTimeLog(log.id)}
                            className="p-1 text-slate-400 hover:text-rose-400 transition"
                            title="Remover apontamento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Visualização */}
          <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between gap-3 bg-slate-800/80">
            <span className="text-xs text-slate-400">
              Para fazer alterações nos campos principais desta tarefa, clique em Editar.
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

          {/* Tipo de Cartão, Cartão Pai (CD-03, CD-04) e Sprint (SP-01, SP-02) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/60">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Tipo de Cartão
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

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-amber-400 mb-1.5 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                <span>Sprint</span>
              </label>
              <select
                value={sprintId || ''}
                onChange={e => setSprintId(e.target.value || null)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 transition cursor-pointer"
              >
                <option value="">Backlog (Sem sprint)</option>
                {sprints
                  .filter(s => s.status !== 'COMPLETED' || s.id === sprintId)
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {s.status === 'ACTIVE' ? '🟢 ' : s.status === 'COMPLETED' ? '⚪ ' : '🟡 '}
                      {s.name} ({s.status === 'ACTIVE' ? 'Ativo' : s.status === 'COMPLETED' ? 'Concluído' : 'Planejamento'})
                    </option>
                  ))}
              </select>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
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

            {/* CD-08: Campo de Estimativa Configurável */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-1.5">
                Estimativa ({estimateType === 'POINTS' ? 'Pontos' : estimateType === 'HOURS' ? 'Horas' : 'P/M/G'})
              </label>
              {estimateType === 'TSHIRT' ? (
                <select
                  value={estimate}
                  onChange={e => setEstimate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="">Sem estimativa</option>
                  <option value="P">P (Pequeno)</option>
                  <option value="M">M (Médio)</option>
                  <option value="G">G (Grande)</option>
                  <option value="GG">GG (Extra Grande)</option>
                </select>
              ) : estimateType === 'POINTS' ? (
                <select
                  value={estimate}
                  onChange={e => setEstimate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="">Sem estimativa</option>
                  <option value="1">1 ponto</option>
                  <option value="2">2 pontos</option>
                  <option value="3">3 pontos</option>
                  <option value="5">5 pontos</option>
                  <option value="8">8 pontos</option>
                  <option value="13">13 pontos</option>
                  <option value="21">21 pontos</option>
                </select>
              ) : (
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Ex: 4 (horas)"
                  value={estimate}
                  onChange={e => setEstimate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Tag
              </label>
              <input
                type="text"
                placeholder="Ex: Backend, UI..."
                value={tag}
                onChange={e => setTag(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                    onClick={() => handleAssigneeChange(user.name)}
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
                  onChange={e => handleAssigneeChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              {/* CP-03: Alerta de sobrecarga em tempo real */}
              {overloadWarning && (
                <div className="mt-1.5 p-2 bg-amber-500/20 border border-amber-500/40 rounded-lg text-amber-300 text-[11px] flex items-start gap-1.5 animate-fade-in">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{overloadWarning}</span>
                </div>
              )}
            </div>
          </div>

          {/* PM-04, PM-05: Visibilidade e Restrição por Papel */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-700/60 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Visibilidade e Permissões do Cartão</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Nível de Visibilidade</label>
                <select
                  value={visibility}
                  onChange={e => setVisibility(e.target.value as CardVisibility)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="NORMAL">Normal (Todos do quadro)</option>
                  <option value="RESTRICTED">Restrito a Papel</option>
                  <option value="PRIVATE">Privado (Apenas você e Admins)</option>
                </select>
              </div>

              {visibility === 'RESTRICTED' && (
                <div>
                  <label className="block text-[11px] text-indigo-300 mb-1">Papel Requerido</label>
                  <input
                    type="text"
                    placeholder="Ex: ADMIN, TECH_LEAD, etc."
                    value={restrictedToRole}
                    onChange={e => setRestrictedToRole(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              {visibility === 'NORMAL' && 'Qualquer usuário com acesso ao quadro pode ver este cartão.'}
              {visibility === 'RESTRICTED' && 'Apenas membros com o papel especificado (ou administradores) podem ver.'}
              {visibility === 'PRIVATE' && 'Cartões privados só aparecem para o autor e administradores do workspace.'}
            </p>
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
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar</span>
              </button>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-700 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-lg shadow-indigo-600/25 transition"
            >
              {loading ? 'Salvando...' : cardToEdit ? 'Salvar Alterações' : 'Criar Tarefa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
