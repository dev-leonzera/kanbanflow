import React, { useEffect, useState, useMemo } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  Board,
  Card,
  CardType,
  Column as ColumnType,
  Priority,
  Workspace,
  BoardSummary,
  BoardVisibility,
  CardVisibility,
  EstimateType,
  SavedFilter,
  Sprint,
} from '../types';
import { api } from '../api/client';
import { Header, SwimlaneGrouping } from './Header';
import { Column } from './Column';
import { CardItem } from './CardItem';
import { CardModal } from './CardModal';
import { ColumnModal } from './ColumnModal';
import { WorkspaceModal } from './WorkspaceModal';
import { BoardModal } from './BoardModal';
import { MyDayModal } from './MyDayModal';
import { NotificationsModal } from './NotificationsModal';
import { SprintsModal } from './SprintsModal';
import { ReportsModal } from './ReportsModal';
import { TreeViewModal } from './TreeViewModal';
import { WorkloadModal } from './WorkloadModal';
import { SettingsModal, SettingsScope } from './SettingsModal';
import {
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  Table,
  Calendar,
  Plus,
  Flame,
  Clock,
} from 'lucide-react';

export const BoardView: React.FC = () => {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workspaces e Múltiplos Quadros (WS-01, WS-02, BD-01)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>('');
  const [boardsList, setBoardsList] = useState<BoardSummary[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<string>('');

  // Modais de Workspace, Quadro, Meu Dia e Notificações
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [workspaceModalMode, setWorkspaceModalMode] = useState<'create' | 'manage'>('create');
  const [isBoardModalOpen, setIsBoardModalOpen] = useState(false);
  const [boardModalMode, setBoardModalMode] = useState<'create' | 'manage'>('create');
  const [isMyDayModalOpen, setIsMyDayModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  // Painel Único de Configurações (CF-01)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsScope, setSettingsScope] = useState<SettingsScope>('user');
  const [settingsTab, setSettingsTab] = useState<string>('profile');

  const handleOpenSettings = (scope: SettingsScope = 'user', tab?: string) => {
    setSettingsScope(scope);
    if (tab) setSettingsTab(tab);
    setIsSettingsModalOpen(true);
  };

  // Sprints & Backlog (SP-01, SP-02, SP-03, SP-04)
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedSprintFilter, setSelectedSprintFilter] = useState<string | 'ALL' | 'BACKLOG'>('ALL');
  const [isSprintsModalOpen, setIsSprintsModalOpen] = useState(false);

  // Filtros e Filtros Salvos (VW-01, BD-09)
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'ALL'>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);

  // Relatórios e Árvore (RP-01 a RP-04, CD-12)
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  const [isTreeModalOpen, setIsTreeModalOpen] = useState(false);

  // Carga & Capacidade (CP-01 a CP-04)
  const [isWorkloadModalOpen, setIsWorkloadModalOpen] = useState(false);

  // Visões Alternativas (VW-03)
  const [viewMode, setViewMode] = useState<'KANBAN' | 'LIST' | 'TABLE' | 'CALENDAR'>('KANBAN');

  // Swimlanes (BD-07)
  const [swimlaneGrouping, setSwimlaneGrouping] = useState<SwimlaneGrouping>('NONE');
  const [collapsedSwimlanes, setCollapsedSwimlanes] = useState<Record<string, boolean>>({});

  // Modais de Cartão e Coluna
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [cardModalMode, setCardModalMode] = useState<'view' | 'edit'>('view');
  const [activeColumnIdForNewCard, setActiveColumnIdForNewCard] = useState<string>('');
  const [cardToEdit, setCardToEdit] = useState<Card | null>(null);
  const [newCardParentId, setNewCardParentId] = useState<string | null>(null);
  const [newCardType, setNewCardType] = useState<CardType | undefined>(undefined);

  // Drag and Drop
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [dragOriginColumnId, setDragOriginColumnId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const loadUnreadNotificationsCount = async () => {
    try {
      const list = await api.getNotifications();
      setUnreadNotificationsCount(list.filter(n => !n.is_read).length);
    } catch {
      // ignore
    }
  };

  const loadSavedFilters = async (boardId: string) => {
    try {
      const list = await api.getSavedFilters(boardId);
      setSavedFilters(list);
    } catch {
      setSavedFilters([]);
    }
  };

  const loadSprints = async (boardId: string) => {
    try {
      const list = await api.getSprints(boardId);
      setSprints(list);
    } catch {
      setSprints([]);
    }
  };

  const handleSelectSprintFilter = async (sprintFilter: string | 'ALL' | 'BACKLOG') => {
    setSelectedSprintFilter(sprintFilter);
    if (board) {
      setLoading(true);
      try {
        const refreshed = await api.getBoard(board.id, currentWorkspaceId, sprintFilter);
        setBoard(refreshed);
      } catch (err: any) {
        setError(err.message || 'Falha ao filtrar por sprint.');
      } finally {
        setLoading(false);
      }
    }
  };

  const refreshCurrentBoard = async () => {
    if (!board) return;
    try {
      const [refreshed, spList] = await Promise.all([
        api.getBoard(board.id, currentWorkspaceId, selectedSprintFilter),
        api.getSprints(board.id),
      ]);
      setBoard(refreshed);
      setSprints(spList);
      await loadUnreadNotificationsCount();
    } catch (err: any) {
      console.error('Falha ao atualizar dados do quadro:', err);
    }
  };

  // Carrega lista de workspaces e quadros
  const loadInitialData = async (preferredWorkspaceId?: string, preferredBoardId?: string) => {
    try {
      setLoading(true);
      setError(null);

      const wsList = await api.getWorkspaces();
      setWorkspaces(wsList);

      const activeWsId = preferredWorkspaceId || (wsList.length > 0 ? wsList[0].id : '');
      setCurrentWorkspaceId(activeWsId);

      const bList = await api.getBoardsList(activeWsId);
      setBoardsList(bList);

      const activeBId = preferredBoardId || (bList.length > 0 ? bList[0].id : '');
      setCurrentBoardId(activeBId);

      const boardData = await api.getBoard(activeBId || undefined, activeWsId || undefined);
      setBoard(boardData);
      if (boardData) {
        setCurrentBoardId(boardData.id);
        if (boardData.workspace_id) setCurrentWorkspaceId(boardData.workspace_id);
        setSelectedSprintFilter('ALL');
        await Promise.all([
          loadSavedFilters(boardData.id),
          loadSprints(boardData.id),
        ]);
      }
      await loadUnreadNotificationsCount();
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar dados do quadro.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Troca de Workspace ativo (WS-02)
  const handleSelectWorkspace = async (workspaceId: string) => {
    try {
      setLoading(true);
      setCurrentWorkspaceId(workspaceId);

      const bList = await api.getBoardsList(workspaceId);
      setBoardsList(bList);

      const firstBoardId = bList.length > 0 ? bList[0].id : '';
      setCurrentBoardId(firstBoardId);

      const boardData = await api.getBoard(firstBoardId || undefined, workspaceId);
      setBoard(boardData);
      if (boardData) {
        setSelectedSprintFilter('ALL');
        await Promise.all([
          loadSavedFilters(boardData.id),
          loadSprints(boardData.id),
        ]);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao alternar workspace.');
    } finally {
      setLoading(false);
    }
  };

  // Criação ou Edição de Workspace (WS-01, WS-06)
  const handleSaveWorkspace = async (name: string, billingEmail?: string | null) => {
    if (workspaceModalMode === 'create') {
      const newWs = await api.createWorkspace({ name, billingEmail });
      await loadInitialData(newWs.id);
    } else if (currentWorkspaceId) {
      await api.updateWorkspace(currentWorkspaceId, { name, billingEmail });
      const wsList = await api.getWorkspaces();
      setWorkspaces(wsList);
    }
  };

  // Troca de Quadro ativo (BD-01)
  const handleSelectBoard = async (boardId: string) => {
    try {
      setLoading(true);
      setCurrentBoardId(boardId);
      const boardData = await api.getBoard(boardId, currentWorkspaceId);
      setBoard(boardData);
      if (boardData) {
        setSelectedSprintFilter('ALL');
        await Promise.all([
          loadSavedFilters(boardData.id),
          loadSprints(boardData.id),
        ]);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar quadro selecionado.');
    } finally {
      setLoading(false);
    }
  };

  // Criação ou Atualização de Quadro (BD-01, BD-03, BD-08, CD-08)
  const handleSaveBoard = async (
    title: string,
    visibility: BoardVisibility,
    estimateType: EstimateType,
    autoArchiveDays?: number | null
  ) => {
    if (boardModalMode === 'create') {
      const newBoard = await api.createBoard({ title, workspaceId: currentWorkspaceId, visibility, estimateType });
      const bList = await api.getBoardsList(currentWorkspaceId);
      setBoardsList(bList);
      setCurrentBoardId(newBoard.id);
      setBoard(newBoard);
      await loadSavedFilters(newBoard.id);
    } else if (currentBoardId) {
      const updated = await api.updateBoard(currentBoardId, { title, visibility, estimateType, autoArchiveDays });
      if (board) {
        setBoard({
          ...board,
          title: updated.title,
          visibility: updated.visibility,
          estimate_type: updated.estimate_type,
          auto_archive_days: updated.auto_archive_days,
        });
      }
      const bList = await api.getBoardsList(currentWorkspaceId);
      setBoardsList(bList);
    }
  };

  // Filtros Salvos (VW-01)
  const handleApplySavedFilter = (sf: SavedFilter) => {
    setSearchQuery(sf.search_query || '');
    setPriorityFilter((sf.priority_filter as Priority | 'ALL') || 'ALL');
    setAssigneeFilter(sf.assignee_filter || 'ALL');
  };

  const handleSaveCurrentFilter = async (name: string) => {
    if (!board) return;
    const created = await api.createSavedFilter(board.id, {
      name,
      searchQuery,
      priorityFilter,
      assigneeFilter,
    });
    setSavedFilters([...savedFilters, created]);
  };

  const handleDeleteSavedFilter = async (filterId: string) => {
    if (!board) return;
    await api.deleteSavedFilter(board.id, filterId);
    setSavedFilters(savedFilters.filter(f => f.id !== filterId));
  };

  // Reordenação de Colunas (BD-01)
  const handleMoveColumn = async (columnIndex: number, direction: 'left' | 'right') => {
    if (!board) return;
    const targetIndex = direction === 'left' ? columnIndex - 1 : columnIndex + 1;
    if (targetIndex < 0 || targetIndex >= board.columns.length) return;

    const newColumns = [...board.columns];
    const [removed] = newColumns.splice(columnIndex, 1);
    newColumns.splice(targetIndex, 0, removed);

    setBoard({
      ...board,
      columns: newColumns,
    });

    try {
      await api.reorderColumns(board.id, newColumns.map(c => c.id));
    } catch (err: any) {
      console.error('Falha ao reordenar colunas:', err);
      const reloaded = await api.getBoard(board.id, currentWorkspaceId);
      setBoard(reloaded);
    }
  };

  // Criar nova coluna
  const handleCreateColumn = async (title: string) => {
    if (!board) return;
    const newCol = await api.createColumn({ title, boardId: board.id });
    setBoard({
      ...board,
      columns: [...board.columns, newCol],
    });
  };

  // Excluir / Arquivar coluna (TD-02)
  const handleDeleteColumn = async (columnId: string) => {
    await api.deleteColumn(columnId);
    if (board) {
      setBoard({
        ...board,
        columns: board.columns.filter(c => c.id !== columnId),
      });
    }
  };

  // Lista plana de todos os cartões para seleção de parentesco e referências (CD-03, CD-04, CD-06)
  const allCards = useMemo(() => board?.columns.flatMap(c => c.cards) || [], [board]);

  // Salvar cartão (Criar ou Editar)
  const handleSaveCard = async (data: {
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
  }) => {
    if (data.id) {
      await api.updateCard(data.id, {
        parentId: data.parentId,
        sprintId: data.sprintId,
        type: data.type,
        title: data.title,
        description: data.description,
        priority: data.priority,
        tag: data.tag,
        dueDate: data.dueDate,
        assignee: data.assignee,
        estimate: data.estimate,
        visibility: data.visibility,
        restricted_to_role: data.restrictedToRole,
      });

      const currentCard = allCards.find(c => c.id === data.id);

      const existingSubtaskIds = new Set(currentCard?.subtasks?.map(s => s.id) || []);
      const newSubtaskItems = data.subtasks.filter(s => !s.id);
      const keptSubtaskIds = new Set(data.subtasks.filter(s => s.id).map(s => s.id));

      for (const oldId of existingSubtaskIds) {
        if (!keptSubtaskIds.has(oldId)) {
          await api.deleteSubtask(oldId);
        }
      }

      for (const item of newSubtaskItems) {
        await api.createSubtask({
          cardId: data.id,
          title: item.title,
          done: item.done,
        });
      }

      for (const item of data.subtasks) {
        if (item.id) {
          const old = currentCard?.subtasks?.find(s => s.id === item.id);
          if (old && (old.title !== item.title || old.done !== item.done)) {
            await api.updateSubtask(item.id, {
              title: item.title,
              done: item.done,
            });
          }
        }
      }
    } else {
      await api.createCard({
        columnId: data.columnId,
        parentId: data.parentId,
        sprintId: data.sprintId,
        type: data.type,
        title: data.title,
        description: data.description,
        priority: data.priority,
        tag: data.tag,
        dueDate: data.dueDate,
        assignee: data.assignee,
        estimate: data.estimate,
        subtasks: data.subtasks.map(s => ({ title: s.title, done: s.done })),
        visibility: data.visibility,
        restricted_to_role: data.restrictedToRole,
      });
    }

    await refreshCurrentBoard();
  };

  // Excluir / Arquivar cartão (TD-02)
  const handleDeleteCard = async (cardId: string) => {
    await api.deleteCard(cardId);
    if (board) {
      setBoard({
        ...board,
        columns: board.columns.map(col => ({
          ...col,
          cards: col.cards.filter(c => c.id !== cardId),
        })),
      });
    }
  };

  // Toggle de subtarefa rápida
  const handleToggleSubtask = async (subtaskId: string, done: boolean) => {
    setBoard(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        columns: prev.columns.map(col => ({
          ...col,
          cards: col.cards.map(card => {
            if (card.subtasks?.some(st => st.id === subtaskId)) {
              return {
                ...card,
                subtasks: card.subtasks.map(st =>
                  st.id === subtaskId ? { ...st, done } : st
                ),
              };
            }
            return card;
          }),
        })),
      };
    });

    try {
      await api.updateSubtask(subtaskId, { done });
    } catch {
      if (board) {
        const refreshed = await api.getBoard(board.id, currentWorkspaceId);
        setBoard(refreshed);
      }
    }
  };

  // Handlers para abrir modais
  const handleOpenNewCardModal = (columnId: string) => {
    setActiveColumnIdForNewCard(columnId);
    setCardToEdit(null);
    setNewCardParentId(null);
    setNewCardType(undefined);
    setCardModalMode('edit');
    setIsCardModalOpen(true);
  };

  const handleOpenCreateChild = (parentId: string, parentType: CardType) => {
    let defaultType: CardType = 'TASK';
    if (parentType === 'EPIC') defaultType = 'STORY';
    else if (parentType === 'STORY') defaultType = 'TASK';
    else if (parentType === 'TASK' || parentType === 'BUG') defaultType = 'SUBTASK';

    const parentCard = allCards.find(c => c.id === parentId);
    if (parentCard) {
      setActiveColumnIdForNewCard(parentCard.column_id);
    } else if (board?.columns.length) {
      setActiveColumnIdForNewCard(board.columns[0].id);
    }

    setNewCardParentId(parentId);
    setNewCardType(defaultType);
    setCardToEdit(null);
    setCardModalMode('edit');
    setIsCardModalOpen(true);
  };

  const handleOpenViewCardModal = (card: Card) => {
    setActiveColumnIdForNewCard(card.column_id);
    setCardToEdit(card);
    setCardModalMode('view');
    setIsCardModalOpen(true);
  };

  const handleOpenEditCardModal = (card: Card) => {
    setActiveColumnIdForNewCard(card.column_id);
    setCardToEdit(card);
    setCardModalMode('edit');
    setIsCardModalOpen(true);
  };

  const activeCardForModal = useMemo(() => {
    if (!board || !cardToEdit) return cardToEdit;
    for (const col of board.columns) {
      const found = col.cards.find(c => c.id === cardToEdit.id);
      if (found) return found;
    }
    return cardToEdit;
  }, [board, cardToEdit]);

  // Drag and Drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const cardData = active.data.current?.card as Card | undefined;
    if (cardData) {
      setActiveCard(cardData);
      setDragOriginColumnId(cardData.column_id);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !board) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const cleanOverId = overId.includes(':::') ? overId.split(':::')[0] : overId;

    if (activeId === overId) return;

    let activeCol: ColumnType | undefined;
    let overCol: ColumnType | undefined;

    for (const col of board.columns) {
      if (col.cards.some(c => c.id === activeId)) activeCol = col;
      if (col.id === cleanOverId || col.cards.some(c => c.id === overId)) overCol = col;
    }

    if (!activeCol || !overCol || activeCol === overCol) return;

    setBoard(prev => {
      if (!prev) return prev;
      const sourceCards = [...activeCol!.cards];
      const targetCards = [...overCol!.cards];

      const activeIndex = sourceCards.findIndex(c => c.id === activeId);
      if (activeIndex === -1) return prev;

      const [movedCard] = sourceCards.splice(activeIndex, 1);
      const updatedCard = { ...movedCard, column_id: overCol!.id };

      const overIndex = targetCards.findIndex(c => c.id === overId);
      if (overIndex >= 0) {
        targetCards.splice(overIndex, 0, updatedCard);
      } else {
        targetCards.push(updatedCard);
      }

      return {
        ...prev,
        columns: prev.columns.map(col => {
          if (col.id === activeCol!.id) return { ...col, cards: sourceCards };
          if (col.id === overCol!.id) return { ...col, cards: targetCards };
          return col;
        }),
      };
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const draggedCard = activeCard;
    const originColId = dragOriginColumnId;
    setActiveCard(null);
    setDragOriginColumnId(null);

    if (!over || !board) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    const cleanOverId = overId.includes(':::') ? overId.split(':::')[0] : overId;
    const targetSwimlaneKey = overId.includes(':::') ? overId.split(':::')[1] : null;

    let targetColumn: ColumnType | undefined;
    for (const col of board.columns) {
      if (col.id === cleanOverId || col.cards.some(c => c.id === overId)) {
        targetColumn = col;
        break;
      }
    }

    if (!targetColumn) return;

    // CD-07: Aviso ao mover cartão bloqueado para outra coluna
    if (
      draggedCard?.is_blocked &&
      originColId &&
      targetColumn.id !== originColId
    ) {
      const blockersNames = draggedCard.blocked_by?.map(b => `"${b.title}"`).join(', ') || 'outra tarefa';
      const proceed = window.confirm(
        `⚠️ Aviso de Bloqueio:\n\nO cartão "${draggedCard.title}" está bloqueado por ${blockersNames}, que ainda não foi concluída.\n\nDeseja mover este cartão para "${targetColumn.title}" mesmo assim?`
      );

      if (!proceed) {
        const reloaded = await api.getBoard(board.id, currentWorkspaceId);
        setBoard(reloaded);
        return;
      }
    }

    let targetCards = [...targetColumn.cards];
    const oldIndex = targetCards.findIndex(c => c.id === activeId);
    let newIndex = targetCards.findIndex(c => c.id === overId);

    if (newIndex === -1) {
      newIndex = targetCards.length;
    }

    if (oldIndex !== -1 && oldIndex !== newIndex) {
      targetCards = arrayMove(targetCards, oldIndex, newIndex);
    }

    setBoard(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        columns: prev.columns.map(col => {
          if (col.id === targetColumn!.id) {
            return { ...col, cards: targetCards };
          }
          return col;
        }),
      };
    });

    try {
      await api.moveCard(activeId, {
        targetColumnId: targetColumn.id,
        newPosition: Math.max(0, newIndex),
      });

      // Atualiza atributo do cartão caso tenha sido arrastado para outra raia (BD-07)
      if (targetSwimlaneKey) {
        if (swimlaneGrouping === 'PRIORITY' && ['HIGH', 'MEDIUM', 'LOW'].includes(targetSwimlaneKey)) {
          await api.updateCard(activeId, { priority: targetSwimlaneKey as Priority });
        } else if (swimlaneGrouping === 'ASSIGNEE') {
          await api.updateCard(activeId, {
            assignee: targetSwimlaneKey === '__UNASSIGNED__' ? null : targetSwimlaneKey,
          });
        } else if (swimlaneGrouping === 'EPIC') {
          await api.updateCard(activeId, {
            parentId: targetSwimlaneKey === '__NO_EPIC__' ? null : targetSwimlaneKey,
          });
        }
      }

      const refreshed = await api.getBoard(board.id, currentWorkspaceId);
      setBoard(refreshed);
    } catch (err: any) {
      // CD-10: Tratamento de fechamento com filhos abertos (409)
      if (err.status === 409 || err.message?.includes('pendentes')) {
        const openList = err.data?.openChildren?.map((c: any) => `• ${c.title}`).join('\n') || '';
        const proceed = window.confirm(
          `⚠️ Regras de Fechamento:\n\nEste cartão ainda possui filhos ou subtarefas pendentes:\n${
            openList ? '\n' + openList + '\n' : ''
          }\nDeseja concluir o cartão pai mesmo assim?`
        );
        if (proceed) {
          try {
            await api.moveCard(activeId, {
              targetColumnId: targetColumn.id,
              newPosition: Math.max(0, newIndex),
              force: true,
            });
            const refreshed = await api.getBoard(board.id, currentWorkspaceId);
            setBoard(refreshed);
            return;
          } catch (forceErr) {
            console.error('Falha ao forçar conclusão:', forceErr);
          }
        }
      }
      if (board) {
        const reloaded = await api.getBoard(board.id, currentWorkspaceId);
        setBoard(reloaded);
      }
    }
  };

  const availableAssignees = useMemo(() => {
    if (!board) return [];
    const set = new Set<string>();
    board.columns.forEach(col => {
      col.cards.forEach(card => {
        if (card.assignee) set.add(card.assignee);
      });
    });
    return Array.from(set).sort();
  }, [board]);

  // BD-09: Operadores de busca avançada
  const matchesSearch = (card: Card, query: string): boolean => {
    if (!query.trim()) return true;
    const tokens = query.trim().split(/\s+/);
    for (const token of tokens) {
      const colonIdx = token.indexOf(':');
      if (colonIdx > 0) {
        const key = token.slice(0, colonIdx).toLowerCase();
        const val = token.slice(colonIdx + 1).toLowerCase();

        if (key === 'responsavel' || key === 'assignee') {
          if (val === 'nenhum' || val === 'none' || val === 'sem') {
            if (card.assignee) return false;
          } else {
            if (!card.assignee || !card.assignee.toLowerCase().includes(val)) return false;
          }
        } else if (key === 'prioridade' || key === 'priority') {
          const normVal =
            val === 'alta' ? 'HIGH' : val === 'media' || val === 'média' ? 'MEDIUM' : val === 'baixa' ? 'LOW' : val.toUpperCase();
          if (card.priority !== normVal) return false;
        } else if (key === 'tipo' || key === 'type') {
          const normVal =
            val === 'epico' || val === 'épico'
              ? 'EPIC'
              : val === 'historia' || val === 'história'
              ? 'STORY'
              : val === 'tarefa'
              ? 'TASK'
              : val === 'subtarefa'
              ? 'SUBTASK'
              : val.toUpperCase();
          if (card.type !== normVal) return false;
        } else if (key === 'tag') {
          if (!card.tag.toLowerCase().includes(val)) return false;
        } else if (key === 'bloqueado' || key === 'blocked') {
          const isBlockedExpected = val === 'sim' || val === 'true' || val === 'yes' || val === '1';
          if (Boolean(card.is_blocked) !== isBlockedExpected) return false;
        } else if (key === 'prazo' || key === 'due') {
          if (!card.due_date) return false;
          const now = new Date();
          const dueDate = new Date(card.due_date);
          if (val === 'atrasado' || val === 'overdue') {
            if (dueDate.getTime() >= now.getTime()) return false;
          } else if (val === 'hoje' || val === 'today') {
            if (dueDate.toDateString() !== now.toDateString()) return false;
          } else if (val.startsWith('<') || val.startsWith('>')) {
            const operator = val[0];
            const daysMatch = val.slice(1).match(/^(\d+)d?$/);
            if (daysMatch) {
              const days = parseInt(daysMatch[1], 10);
              const diffDays = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
              if (operator === '<' && (diffDays < 0 || diffDays > days)) return false;
              if (operator === '>' && diffDays <= days) return false;
            }
          }
        }
      } else {
        const term = token.toLowerCase();
        const matchTitle = card.title.toLowerCase().includes(term);
        const matchDesc = card.description?.toLowerCase().includes(term);
        const matchTag = card.tag.toLowerCase().includes(term);
        const matchAssignee = card.assignee?.toLowerCase().includes(term);
        if (!matchTitle && !matchDesc && !matchTag && !matchAssignee) return false;
      }
    }
    return true;
  };

  // Filtros aplicados às colunas
  const filteredColumns = useMemo(() => {
    if (!board) return [];

    return board.columns.map(col => {
      const cards = col.cards.filter(card => {
        if (!matchesSearch(card, searchQuery)) return false;

        if (priorityFilter !== 'ALL' && card.priority !== priorityFilter) {
          return false;
        }

        if (assigneeFilter === 'UNASSIGNED') {
          if (card.assignee) return false;
        } else if (assigneeFilter !== 'ALL') {
          if (card.assignee !== assigneeFilter) return false;
        }

        return true;
      });

      return {
        ...col,
        cards,
      };
    });
  }, [board, searchQuery, priorityFilter, assigneeFilter]);

  // Lista plana de cartões filtrados para visões alternativas (VW-03) e contagem de caminho crítico (CD-13)
  const allFilteredCards = useMemo(() => {
    return filteredColumns.flatMap(c => c.cards);
  }, [filteredColumns]);

  // BD-07: Agrupamento por Swimlanes (Responsável, Prioridade ou Épico)
  const swimlaneGroups = useMemo(() => {
    if (swimlaneGrouping === 'NONE' || !board) return [];

    if (swimlaneGrouping === 'ASSIGNEE') {
      const groups: { key: string; label: string; icon: string; cards: Card[] }[] = [];
      availableAssignees.forEach(assignee => {
        groups.push({
          key: assignee,
          label: assignee,
          icon: '👤',
          cards: allCards.filter(c => c.assignee === assignee),
        });
      });
      const unassignedCards = allCards.filter(c => !c.assignee);
      if (unassignedCards.length > 0 || groups.length === 0) {
        groups.push({
          key: '__UNASSIGNED__',
          label: 'Sem Responsável',
          icon: '👤',
          cards: unassignedCards,
        });
      }
      return groups;
    }

    if (swimlaneGrouping === 'PRIORITY') {
      return [
        {
          key: 'HIGH',
          label: 'Prioridade Alta',
          icon: '🔴',
          cards: allCards.filter(c => c.priority === 'HIGH'),
        },
        {
          key: 'MEDIUM',
          label: 'Prioridade Média',
          icon: '🟡',
          cards: allCards.filter(c => c.priority === 'MEDIUM'),
        },
        {
          key: 'LOW',
          label: 'Prioridade Baixa',
          icon: '🟢',
          cards: allCards.filter(c => c.priority === 'LOW'),
        },
      ];
    }

    if (swimlaneGrouping === 'EPIC') {
      const epicCards = allCards.filter(c => c.type === 'EPIC');
      const groups: { key: string; label: string; icon: string; cards: Card[] }[] = [];
      epicCards.forEach(epic => {
        groups.push({
          key: epic.id,
          label: `Épico: ${epic.title}`,
          icon: '🟣',
          cards: allCards.filter(c => c.parent_id === epic.id || c.id === epic.id),
        });
      });
      const noEpicCards = allCards.filter(c => c.type !== 'EPIC' && !c.parent_id);
      if (noEpicCards.length > 0 || groups.length === 0) {
        groups.push({
          key: '__NO_EPIC__',
          label: 'Sem Épico / Outros',
          icon: '📁',
          cards: noEpicCards,
        });
      }
      return groups;
    }

    return [];
  }, [swimlaneGrouping, board, availableAssignees, allCards]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm">Carregando quadro...</p>
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md shadow-2xl">
          <p className="text-rose-400 text-sm mb-4">{error || 'Quadro não encontrado.'}</p>
          <button
            onClick={() => loadInitialData()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow transition"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const canEditBoardContent = (board.role || 'OWNER') === 'OWNER' || (board.role || 'OWNER') === 'EDITOR';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      <Header
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        onSelectWorkspace={handleSelectWorkspace}
        onOpenNewWorkspaceModal={() => {
          setWorkspaceModalMode('create');
          setIsWorkspaceModalOpen(true);
        }}
        onOpenManageWorkspaceModal={() => {
          setWorkspaceModalMode('manage');
          setIsWorkspaceModalOpen(true);
        }}
        boardsList={boardsList}
        currentBoardId={currentBoardId}
        currentBoardTitle={board.title}
        currentBoardVisibility={board.visibility || 'WORKSPACE'}
        currentBoardRole={board.role || 'OWNER'}
        onSelectBoard={handleSelectBoard}
        onOpenNewBoardModal={() => {
          setBoardModalMode('create');
          setIsBoardModalOpen(true);
        }}
        onOpenManageBoardModal={() => {
          setBoardModalMode('manage');
          setIsBoardModalOpen(true);
        }}
        onOpenMyDayModal={() => setIsMyDayModalOpen(true)}
        sprints={sprints}
        selectedSprintFilter={selectedSprintFilter}
        onSelectSprintFilter={handleSelectSprintFilter}
        onOpenSprintsModal={() => setIsSprintsModalOpen(true)}
        onOpenReportsModal={() => setIsReportsModalOpen(true)}
        onOpenTreeModal={() => setIsTreeModalOpen(true)}
        swimlaneGrouping={swimlaneGrouping}
        onSwimlaneGroupingChange={setSwimlaneGrouping}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenNotificationsModal={() => setIsNotificationsModalOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        availableAssignees={availableAssignees}
        savedFilters={savedFilters}
        onApplySavedFilter={handleApplySavedFilter}
        onSaveCurrentFilter={handleSaveCurrentFilter}
        onDeleteSavedFilter={handleDeleteSavedFilter}
        onOpenColumnModal={() => setIsColumnModalOpen(true)}
        onOpenSettings={handleOpenSettings}
        onOpenWorkloadModal={() => setIsWorkloadModalOpen(true)}
      />

      {/* Barra de Visões Alternativas e Nova Coluna (VW-03) */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-2 flex items-center justify-center text-xs">
        <div className="flex items-center bg-slate-950 border border-slate-800 p-0.5 rounded-lg gap-1 shadow-sm">
          <button
            type="button"
            onClick={() => setViewMode('KANBAN')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
              viewMode === 'KANBAN'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Kanban</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('LIST')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
              viewMode === 'LIST'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Lista</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('TABLE')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
              viewMode === 'TABLE'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Tabela</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('CALENDAR')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition ${
              viewMode === 'CALENDAR'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Calendário</span>
          </button>

          {canEditBoardContent && (
            <>
              <div className="h-4 w-px bg-slate-800 mx-1" />
              <button
                type="button"
                onClick={() => setIsColumnModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow"
                title="Adicionar uma nova coluna ao quadro"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Coluna</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* RENDERIZAÇÃO CONDICIONAL POR MODO DE VISÃO (VW-03) */}
      {viewMode === 'KANBAN' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {swimlaneGrouping === 'NONE' ? (
            <main className="flex-1 flex gap-6 p-6 overflow-x-auto items-start">
              {filteredColumns.map((column, idx) => (
                <Column
                  key={column.id}
                  column={column}
                  cards={column.cards}
                  estimateType={board.estimate_type || 'POINTS'}
                  onOpenNewCardModal={handleOpenNewCardModal}
                  onViewCard={handleOpenViewCardModal}
                  onEditCard={handleOpenEditCardModal}
                  onDeleteCard={handleDeleteCard}
                  onDeleteColumn={handleDeleteColumn}
                  onToggleSubtask={handleToggleSubtask}
                  onMoveLeft={() => handleMoveColumn(idx, 'left')}
                  onMoveRight={() => handleMoveColumn(idx, 'right')}
                  canMoveLeft={idx > 0}
                  canMoveRight={idx < filteredColumns.length - 1}
                />
              ))}

              {filteredColumns.length === 0 && (
                <div className="m-auto text-center py-16 text-slate-500">
                  <p className="text-sm">Nenhuma coluna encontrada no quadro.</p>
                  <button
                    onClick={() => setIsColumnModalOpen(true)}
                    className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow"
                  >
                    + Criar Primeira Coluna
                  </button>
                </div>
              )}
            </main>
          ) : (
            /* Renderização com Swimlanes (BD-07) */
            <main className="flex-1 p-6 overflow-y-auto space-y-6">
              {swimlaneGroups.map(group => {
                const isCollapsed = collapsedSwimlanes[group.key];
                const groupCardCount = group.cards.length;
                return (
                  <div key={group.key} className="space-y-3">
                    <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-xl sticky left-0 shadow-sm backdrop-blur">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedSwimlanes(prev => ({ ...prev, [group.key]: !prev[group.key] }))
                          }
                          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                        >
                          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <span className="text-sm font-bold text-slate-100 flex items-center gap-2">
                          <span>{group.icon}</span>
                          <span>{group.label}</span>
                        </span>
                      </div>
                      <span className="text-xs bg-slate-800 text-slate-300 font-semibold px-2.5 py-0.5 rounded-full border border-slate-700/60">
                        {groupCardCount} {groupCardCount === 1 ? 'cartão' : 'cartões'}
                      </span>
                    </div>

                    {!isCollapsed && (
                      <div className="flex gap-6 overflow-x-auto items-start pb-2">
                        {filteredColumns.map((col, idx) => {
                          const cardsInColAndGroup = col.cards.filter(c => group.cards.some(gc => gc.id === c.id));
                          return (
                            <Column
                              key={`${col.id}:::${group.key}`}
                              droppableId={`${col.id}:::${group.key}`}
                              column={col}
                              cards={cardsInColAndGroup}
                              estimateType={board.estimate_type || 'POINTS'}
                              onOpenNewCardModal={handleOpenNewCardModal}
                              onViewCard={handleOpenViewCardModal}
                              onEditCard={handleOpenEditCardModal}
                              onDeleteCard={handleDeleteCard}
                              onDeleteColumn={handleDeleteColumn}
                              onToggleSubtask={handleToggleSubtask}
                              onMoveLeft={() => handleMoveColumn(idx, 'left')}
                              onMoveRight={() => handleMoveColumn(idx, 'right')}
                              canMoveLeft={idx > 0}
                              canMoveRight={idx < filteredColumns.length - 1}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </main>
          )}

          <DragOverlay>
            {activeCard ? (
              <div className="rotate-2 scale-105 shadow-2xl">
                <CardItem
                  card={activeCard}
                  columnTitle=""
                  estimateType={board.estimate_type || 'POINTS'}
                  onView={() => {}}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onToggleSubtask={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* VISÃO DE LISTA (VW-03) */}
      {viewMode === 'LIST' && (
        <main className="flex-1 p-6 overflow-y-auto max-w-5xl mx-auto w-full space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span>Exibindo {allFilteredCards.length} tarefas na visão de lista</span>
            <button
              onClick={() => handleOpenNewCardModal(board.columns[0]?.id || '')}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center gap-1.5 transition shadow"
            >
              <span>+ Nova Tarefa</span>
            </button>
          </div>

          {allFilteredCards.length === 0 ? (
            <div className="p-12 text-center text-slate-500 bg-slate-900/40 rounded-xl border border-slate-800">
              Nenhuma tarefa encontrada com os filtros atuais.
            </div>
          ) : (
            <div className="space-y-2">
              {allFilteredCards.map(card => {
                const col = board.columns.find(c => c.id === card.column_id);
                return (
                  <div
                    key={card.id}
                    onClick={() => handleOpenViewCardModal(card)}
                    className="p-3.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-indigo-500/50 rounded-xl flex items-center justify-between gap-4 cursor-pointer transition shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-900/80 text-indigo-300 border border-slate-700 shrink-0">
                        {col?.title || 'Coluna'}
                      </span>
                      <div className="truncate">
                        <div className="font-semibold text-slate-100 flex items-center gap-2 truncate">
                          <span className="truncate">{card.title}</span>
                          {card.is_critical_path && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0">
                              <Flame className="w-3 h-3 text-amber-400" />
                              Crítico
                            </span>
                          )}
                          {card.visibility === 'PRIVATE' && (
                            <span className="text-[10px] text-purple-300 bg-purple-950/40 px-1.5 py-0.2 rounded border border-purple-500/30">
                              Privado
                            </span>
                          )}
                        </div>
                        {card.description && (
                          <p className="text-xs text-slate-400 truncate mt-0.5">{card.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-xs">
                      {card.estimate && (
                        <span className="text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40 font-medium text-[11px]">
                          {card.estimate} {board.estimate_type === 'POINTS' ? 'pts' : 'h'}
                        </span>
                      )}
                      {(card.spent_hours || 0) > 0 && (
                        <span className="text-emerald-300 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40 text-[11px] font-medium flex items-center gap-1">
                          <Clock className="w-3 h-3 text-emerald-400" />
                          {card.spent_hours}h
                        </span>
                      )}
                      {card.due_date && (
                        <span className="text-slate-300 bg-slate-900/60 px-2 py-0.5 rounded border border-slate-700 text-[11px] flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {new Date(card.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                        card.priority === 'HIGH' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                        card.priority === 'MEDIUM' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                        'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}>
                        {card.priority}
                      </span>
                      <span className="text-xs text-slate-300 font-medium">
                        {card.assignee || 'Sem resp.'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* VISÃO DE TABELA (VW-03) */}
      {viewMode === 'TABLE' && (
        <main className="flex-1 p-6 overflow-y-auto max-w-7xl mx-auto w-full">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Tarefa</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Prioridade</th>
                    <th className="py-3 px-4">Responsável</th>
                    <th className="py-3 px-4">Vencimento</th>
                    <th className="py-3 px-4">Estimativa</th>
                    <th className="py-3 px-4">Horas Gastas</th>
                    <th className="py-3 px-4">Caminho Crítico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {allFilteredCards.map(card => {
                    const col = board.columns.find(c => c.id === card.column_id);
                    return (
                      <tr
                        key={card.id}
                        onClick={() => handleOpenViewCardModal(card)}
                        className="hover:bg-slate-800/60 cursor-pointer transition"
                      >
                        <td className="py-3 px-4 font-semibold text-slate-100 max-w-xs truncate">
                          {card.title}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700 text-[11px]">
                            {col?.title || 'Coluna'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{card.type || 'TASK'}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            card.priority === 'HIGH' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' :
                            card.priority === 'MEDIUM' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                            'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {card.priority}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-300">{card.assignee || '-'}</td>
                        <td className="py-3 px-4 text-slate-400">
                          {card.due_date ? new Date(card.due_date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                        </td>
                        <td className="py-3 px-4 text-cyan-300">
                          {card.estimate ? `${card.estimate} ${board.estimate_type === 'POINTS' ? 'pts' : 'h'}` : '-'}
                        </td>
                        <td className="py-3 px-4 text-emerald-300">
                          {card.spent_hours ? `${card.spent_hours}h` : '-'}
                        </td>
                        <td className="py-3 px-4">
                          {card.is_critical_path ? (
                            <span className="text-amber-400 font-bold flex items-center gap-1 text-[11px]">
                              <Flame className="w-3.5 h-3.5" />
                              Sim
                            </span>
                          ) : (
                            <span className="text-slate-600">Não</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* VISÃO DE CALENDÁRIO / PRAZOS (VW-03) */}
      {viewMode === 'CALENDAR' && (
        <main className="flex-1 p-6 overflow-y-auto max-w-6xl mx-auto w-full space-y-6">
          {(() => {
            const todayStr = new Date().toISOString().split('T')[0];
            const overdue = allFilteredCards.filter(c => c.due_date && c.due_date < todayStr);
            const dueToday = allFilteredCards.filter(c => c.due_date === todayStr);
            const next7Days = allFilteredCards.filter(c => {
              if (!c.due_date) return false;
              const d = new Date(c.due_date).getTime();
              const now = new Date(todayStr).getTime();
              const diff = (d - now) / (1000 * 60 * 60 * 24);
              return diff > 0 && diff <= 7;
            });
            const upcoming = allFilteredCards.filter(c => {
              if (!c.due_date) return false;
              const d = new Date(c.due_date).getTime();
              const now = new Date(todayStr).getTime();
              const diff = (d - now) / (1000 * 60 * 60 * 24);
              return diff > 7;
            });
            const noDate = allFilteredCards.filter(c => !c.due_date);

            const sections = [
              { title: 'Atrasadas', list: overdue, color: 'text-rose-400 border-rose-500/40 bg-rose-950/20' },
              { title: 'Vencem Hoje', list: dueToday, color: 'text-amber-400 border-amber-500/40 bg-amber-950/20' },
              { title: 'Próximos 7 Dias', list: next7Days, color: 'text-indigo-400 border-indigo-500/40 bg-indigo-950/20' },
              { title: 'Futuras (> 7 dias)', list: upcoming, color: 'text-cyan-400 border-cyan-500/40 bg-cyan-950/20' },
              { title: 'Sem Data de Vencimento', list: noDate, color: 'text-slate-400 border-slate-700 bg-slate-900/40' },
            ];

            return (
              <div className="space-y-6">
                {sections.map(sec => (
                  <div key={sec.title} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border ${sec.color}`}>
                        {sec.title} ({sec.list.length})
                      </span>
                    </div>

                    {sec.list.length === 0 ? (
                      <div className="p-3 text-slate-500 text-xs italic bg-slate-900/30 rounded-lg border border-slate-800">
                        Nenhuma tarefa nesta categoria.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {sec.list.map(card => (
                          <div
                            key={card.id}
                            onClick={() => handleOpenViewCardModal(card)}
                            className="p-3 bg-slate-800/80 hover:bg-slate-750 border border-slate-700 rounded-xl cursor-pointer transition shadow-sm space-y-2"
                          >
                            <div className="font-semibold text-xs text-slate-100 truncate">
                              {card.title}
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span>{card.assignee || 'Sem resp.'}</span>
                              {card.due_date && (
                                <span className="font-medium text-slate-300">
                                  {new Date(card.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </main>
      )}

      {/* Modal de Relatórios e Métricas (RP-01 a RP-04) */}
      <ReportsModal
        isOpen={isReportsModalOpen}
        onClose={() => setIsReportsModalOpen(false)}
        board={board}
      />

      {/* Modal de Visão em Árvore (CD-12) */}
      <TreeViewModal
        isOpen={isTreeModalOpen}
        onClose={() => setIsTreeModalOpen(false)}
        boardId={board.id}
        boardTitle={board.title}
        onSelectCard={cardId => {
          const card = allCards.find(c => c.id === cardId);
          if (card) handleOpenViewCardModal(card);
        }}
      />

      {/* Modal de Cartão */}
      <CardModal
        isOpen={isCardModalOpen}
        mode={cardModalMode}
        columnId={activeColumnIdForNewCard}
        columnTitle={board?.columns.find(c => c.id === activeColumnIdForNewCard)?.title}
        workspaceId={currentWorkspaceId}
        estimateType={board.estimate_type || 'POINTS'}
        cardToEdit={activeCardForModal}
        initialParentId={newCardParentId}
        initialType={newCardType}
        allBoardCards={allCards}
        sprints={sprints}
        onClose={() => {
          setIsCardModalOpen(false);
          setNewCardParentId(null);
          setNewCardType(undefined);
        }}
        onSwitchToEdit={() => setCardModalMode('edit')}
        onSwitchToView={() => setCardModalMode('view')}
        onSave={async data => {
          await handleSaveCard(data);
          await loadUnreadNotificationsCount();
        }}
        onToggleSubtask={handleToggleSubtask}
        onOpenCreateChild={handleOpenCreateChild}
        onRefreshBoard={refreshCurrentBoard}
      />

      {/* Modal de Sprints e Planejamento (SP-01, SP-02, SP-03, SP-04) */}
      <SprintsModal
        isOpen={isSprintsModalOpen}
        boardId={board.id}
        boardTitle={board.title}
        estimateType={board.estimate_type || 'POINTS'}
        allCards={allCards}
        userRole={board.role || 'OWNER'}
        onClose={() => setIsSprintsModalOpen(false)}
        onRefreshBoard={refreshCurrentBoard}
        onSelectSprintFilter={handleSelectSprintFilter}
      />

      {/* Modal de Coluna */}
      <ColumnModal
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        onSave={handleCreateColumn}
      />

      {/* Modal de Workspace */}
      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        mode={workspaceModalMode}
        workspace={workspaces.find(w => w.id === currentWorkspaceId) || null}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSave={handleSaveWorkspace}
        onRefreshWorkspace={async () => {
          const wsList = await api.getWorkspaces();
          setWorkspaces(wsList);
        }}
      />

      {/* Modal de Quadro */}
      <BoardModal
        isOpen={isBoardModalOpen}
        mode={boardModalMode}
        boardId={board.id}
        workspaceId={currentWorkspaceId}
        initialTitle={boardModalMode === 'manage' ? board.title : ''}
        initialVisibility={boardModalMode === 'manage' ? (board.visibility || 'WORKSPACE') : 'WORKSPACE'}
        initialEstimateType={boardModalMode === 'manage' ? (board.estimate_type || 'POINTS') : 'POINTS'}
        initialAutoArchiveDays={boardModalMode === 'manage' ? (board.auto_archive_days ?? null) : null}
        initialPublicToken={boardModalMode === 'manage' ? (board.public_share_token ?? null) : null}
        initialPublicExpiresAt={boardModalMode === 'manage' ? (board.public_share_expires_at ?? null) : null}
        userBoardRole={board.role || 'OWNER'}
        onClose={() => setIsBoardModalOpen(false)}
        onSave={handleSaveBoard}
      />

      {/* Modal Visão Agregada "Meu Dia" (VW-02) */}
      <MyDayModal
        isOpen={isMyDayModalOpen}
        onClose={() => setIsMyDayModalOpen(false)}
        onNavigateToBoard={(wsId, bId) => loadInitialData(wsId, bId)}
      />

      {/* Modal de Notificações e Preferências (NT-01, NT-02) */}
      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
        onNotificationsUpdated={loadUnreadNotificationsCount}
        onNavigateToCard={async (targetBoardId, targetCardId) => {
          const loadedBoard = await api.getBoard(targetBoardId, currentWorkspaceId);
          setBoard(loadedBoard);
          setCurrentBoardId(loadedBoard.id);
          const foundCard = loadedBoard.columns.flatMap(c => c.cards).find(c => c.id === targetCardId);
          if (foundCard) {
            handleOpenViewCardModal(foundCard);
          }
        }}
      />

      {/* Painel Único de Configurações Hierárquico (CF-01) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        initialScope={settingsScope}
        initialTab={settingsTab}
        workspace={workspaces.find(w => w.id === currentWorkspaceId) || null}
        onRefreshWorkspace={async () => {
          const wsList = await api.getWorkspaces();
          setWorkspaces(wsList);
        }}
        onSaveWorkspace={handleSaveWorkspace}
        board={board}
        currentBoardRole={board.role || 'OWNER'}
        onRefreshBoard={async () => {
          if (board) {
            const b = await api.getBoard(board.id, currentWorkspaceId);
            setBoard(b);
          }
        }}
        onSaveBoard={handleSaveBoard}
        columns={board.columns}
        onMoveColumn={handleMoveColumn}
        onUpdateColumn={async (colId, payload) => {
          await api.updateColumn(colId, payload);
          if (board) {
            const b = await api.getBoard(board.id, currentWorkspaceId);
            setBoard(b);
          }
        }}
        onDeleteColumn={handleDeleteColumn}
        onCreateColumn={async (title, wipLimit) => {
          if (board) {
            const col = await api.createColumn({ title, boardId: board.id, wipLimit });
            setBoard({ ...board, columns: [...board.columns, col] });
          }
        }}
        onNotificationsUpdated={loadUnreadNotificationsCount}
      />

      {/* Modal de Gestão de Carga & Capacidade da Equipe (CP-01 a CP-04) */}
      <WorkloadModal
        isOpen={isWorkloadModalOpen}
        workspaceId={currentWorkspaceId}
        workspaceName={workspaces.find(w => w.id === currentWorkspaceId)?.name}
        onClose={() => setIsWorkloadModalOpen(false)}
        onRefreshBoard={refreshCurrentBoard}
      />
    </div>
  );
};
