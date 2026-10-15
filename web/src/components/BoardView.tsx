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
import { Board, Card, CardType, Column as ColumnType, Priority, Workspace, BoardSummary } from '../types';
import { api } from '../api/client';
import { Header } from './Header';
import { Column } from './Column';
import { CardItem } from './CardItem';
import { CardModal } from './CardModal';
import { ColumnModal } from './ColumnModal';
import { WorkspaceModal } from './WorkspaceModal';
import { BoardModal } from './BoardModal';

export const BoardView: React.FC = () => {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workspaces e Múltiplos Quadros (WS-01, WS-02, BD-01)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>('');
  const [boardsList, setBoardsList] = useState<BoardSummary[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<string>('');

  // Modais de Workspace e Quadro
  const [isWorkspaceModalOpen, setIsWorkspaceModalOpen] = useState(false);
  const [isBoardModalOpen, setIsBoardModalOpen] = useState(false);
  const [boardModalMode, setBoardModalMode] = useState<'create' | 'rename'>('create');

  // Filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'ALL'>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');

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

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Carrega lista de workspaces e quadros
  const loadInitialData = async (preferredWorkspaceId?: string, preferredBoardId?: string) => {
    try {
      setLoading(true);
      setError(null);

      // 1. Busca workspaces do usuário
      const wsList = await api.getWorkspaces();
      setWorkspaces(wsList);

      const activeWsId = preferredWorkspaceId || (wsList.length > 0 ? wsList[0].id : '');
      setCurrentWorkspaceId(activeWsId);

      // 2. Busca quadros desse workspace
      const bList = await api.getBoardsList(activeWsId);
      setBoardsList(bList);

      const activeBId = preferredBoardId || (bList.length > 0 ? bList[0].id : '');
      setCurrentBoardId(activeBId);

      // 3. Carrega o quadro ativo completo
      const boardData = await api.getBoard(activeBId || undefined, activeWsId || undefined);
      setBoard(boardData);
      if (boardData) {
        setCurrentBoardId(boardData.id);
        if (boardData.workspace_id) setCurrentWorkspaceId(boardData.workspace_id);
      }
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
    } catch (err: any) {
      setError(err.message || 'Falha ao alternar workspace.');
    } finally {
      setLoading(false);
    }
  };

  // Criação de novo Workspace (WS-01)
  const handleCreateWorkspace = async (name: string) => {
    const newWs = await api.createWorkspace({ name });
    await loadInitialData(newWs.id);
  };

  // Troca de Quadro ativo (BD-01)
  const handleSelectBoard = async (boardId: string) => {
    try {
      setLoading(true);
      setCurrentBoardId(boardId);
      const boardData = await api.getBoard(boardId, currentWorkspaceId);
      setBoard(boardData);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar quadro selecionado.');
    } finally {
      setLoading(false);
    }
  };

  // Criação de novo Quadro (BD-01)
  const handleCreateBoard = async (title: string) => {
    const newBoard = await api.createBoard({ title, workspaceId: currentWorkspaceId });
    const bList = await api.getBoardsList(currentWorkspaceId);
    setBoardsList(bList);
    setCurrentBoardId(newBoard.id);
    setBoard(newBoard);
  };

  // Renomeação do Quadro ativo (BD-01)
  const handleRenameBoard = async (title: string) => {
    if (!currentBoardId) return;
    await api.updateBoard(currentBoardId, { title });
    if (board) {
      setBoard({ ...board, title });
    }
    const bList = await api.getBoardsList(currentWorkspaceId);
    setBoardsList(bList);
  };

  // Reordenação de Colunas (BD-01)
  const handleMoveColumn = async (columnIndex: number, direction: 'left' | 'right') => {
    if (!board) return;
    const targetIndex = direction === 'left' ? columnIndex - 1 : columnIndex + 1;
    if (targetIndex < 0 || targetIndex >= board.columns.length) return;

    const newColumns = [...board.columns];
    const [removed] = newColumns.splice(columnIndex, 1);
    newColumns.splice(targetIndex, 0, removed);

    // Atualização otimista
    setBoard({
      ...board,
      columns: newColumns,
    });

    try {
      await api.reorderColumns(board.id, newColumns.map(c => c.id));
    } catch (err: any) {
      console.error('Falha ao reordenar colunas:', err);
      // Reverte recarregando
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

  // Lista plana de todos os cartões para seleção de parentesco e referências (CD-03, CD-04)
  const allCards = useMemo(() => board?.columns.flatMap(c => c.cards) || [], [board]);

  // Salvar cartão (Criar ou Editar)
  const handleSaveCard = async (data: {
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
  }) => {
    if (data.id) {
      // Editar
      await api.updateCard(data.id, {
        parentId: data.parentId,
        type: data.type,
        title: data.title,
        description: data.description,
        priority: data.priority,
        tag: data.tag,
        dueDate: data.dueDate,
        assignee: data.assignee,
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
      // Criar novo cartão
      await api.createCard({
        columnId: data.columnId,
        parentId: data.parentId,
        type: data.type,
        title: data.title,
        description: data.description,
        priority: data.priority,
        tag: data.tag,
        dueDate: data.dueDate,
        assignee: data.assignee,
        subtasks: data.subtasks.map(s => ({ title: s.title, done: s.done })),
      });
    }

    if (board) {
      const refreshedBoard = await api.getBoard(board.id, currentWorkspaceId);
      setBoard(refreshedBoard);
    }
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
    // Atualização otimista
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
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !board) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    let activeCol: ColumnType | undefined;
    let overCol: ColumnType | undefined;

    for (const col of board.columns) {
      if (col.cards.some(c => c.id === activeId)) activeCol = col;
      if (col.id === overId || col.cards.some(c => c.id === overId)) overCol = col;
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
    setActiveCard(null);

    if (!over || !board) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    let targetColumn: ColumnType | undefined;
    for (const col of board.columns) {
      if (col.id === overId || col.cards.some(c => c.id === overId)) {
        targetColumn = col;
        break;
      }
    }

    if (!targetColumn) return;

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
    } catch {
      if (board) {
        const reloaded = await api.getBoard(board.id, currentWorkspaceId);
        setBoard(reloaded);
      }
    }
  };

  // Filtros aplicados às colunas
  const filteredColumns = useMemo(() => {
    if (!board) return [];

    return board.columns.map(col => {
      const cards = col.cards.filter(card => {
        // Filtro por texto
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchTitle = card.title.toLowerCase().includes(q);
          const matchTag = card.tag.toLowerCase().includes(q);
          const matchAssignee = card.assignee?.toLowerCase().includes(q) || false;
          if (!matchTitle && !matchTag && !matchAssignee) return false;
        }

        // Filtro por prioridade
        if (priorityFilter !== 'ALL' && card.priority !== priorityFilter) {
          return false;
        }

        // Filtro por responsável
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

  // Lista única de responsáveis para o dropdown
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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      <Header
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        onSelectWorkspace={handleSelectWorkspace}
        onOpenNewWorkspaceModal={() => setIsWorkspaceModalOpen(true)}
        boardsList={boardsList}
        currentBoardId={currentBoardId}
        currentBoardTitle={board.title}
        onSelectBoard={handleSelectBoard}
        onOpenNewBoardModal={() => {
          setBoardModalMode('create');
          setIsBoardModalOpen(true);
        }}
        onOpenRenameBoardModal={() => {
          setBoardModalMode('rename');
          setIsBoardModalOpen(true);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        assigneeFilter={assigneeFilter}
        onAssigneeFilterChange={setAssigneeFilter}
        availableAssignees={availableAssignees}
        onOpenColumnModal={() => setIsColumnModalOpen(true)}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <main className="flex-1 flex gap-6 p-6 overflow-x-auto items-start">
          {filteredColumns.map((column, idx) => (
            <Column
              key={column.id}
              column={column}
              cards={column.cards}
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

        <DragOverlay>
          {activeCard ? (
            <div className="rotate-2 scale-105 shadow-2xl">
              <CardItem
                card={activeCard}
                columnTitle=""
                onView={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
                onToggleSubtask={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Modal de Cartão */}
      <CardModal
        isOpen={isCardModalOpen}
        mode={cardModalMode}
        columnId={activeColumnIdForNewCard}
        columnTitle={board?.columns.find(c => c.id === activeColumnIdForNewCard)?.title}
        cardToEdit={activeCardForModal}
        initialParentId={newCardParentId}
        initialType={newCardType}
        allBoardCards={allCards}
        onClose={() => {
          setIsCardModalOpen(false);
          setNewCardParentId(null);
          setNewCardType(undefined);
        }}
        onSwitchToEdit={() => setCardModalMode('edit')}
        onSwitchToView={() => setCardModalMode('view')}
        onSave={handleSaveCard}
        onToggleSubtask={handleToggleSubtask}
        onOpenCreateChild={handleOpenCreateChild}
      />

      {/* Modal de Coluna */}
      <ColumnModal
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
        onSave={handleCreateColumn}
      />

      {/* Modal de Workspace (WS-01) */}
      <WorkspaceModal
        isOpen={isWorkspaceModalOpen}
        onClose={() => setIsWorkspaceModalOpen(false)}
        onSave={handleCreateWorkspace}
      />

      {/* Modal de Quadro (BD-01: Criar ou Renomear) */}
      <BoardModal
        isOpen={isBoardModalOpen}
        title={boardModalMode === 'create' ? 'Criar Novo Quadro' : 'Renomear Quadro'}
        initialTitle={boardModalMode === 'rename' ? board.title : ''}
        onClose={() => setIsBoardModalOpen(false)}
        onSave={boardModalMode === 'create' ? handleCreateBoard : handleRenameBoard}
      />
    </div>
  );
};
