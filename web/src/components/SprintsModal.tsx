import React, { useState, useEffect } from 'react';
import {
  X,
  Zap,
  Play,
  CheckCircle2,
  Calendar,
  Target,
  Plus,
  Pencil,
  Trash2,
  BarChart3,
  Layers,
  AlertCircle,
  ChevronRight,
  Inbox,
  Check,
  ThumbsUp,
  MessageSquare,
  Clock,
} from 'lucide-react';
import { Card, Sprint, SprintReport, EstimateType, BoardRole, RetroCategory, SprintRetroItem } from '../types';
import { api } from '../api/client';

interface SprintsModalProps {
  isOpen: boolean;
  boardId: string;
  boardTitle: string;
  estimateType: EstimateType;
  allCards: Card[];
  userRole?: BoardRole;
  onClose: () => void;
  onRefreshBoard: () => Promise<void>;
  onSelectSprintFilter?: (sprintId: string | 'ALL' | 'BACKLOG') => void;
}

export const SprintsModal: React.FC<SprintsModalProps> = ({
  isOpen,
  boardId,
  boardTitle,
  estimateType,
  allCards,
  userRole = 'OWNER',
  onClose,
  onRefreshBoard,
  onSelectSprintFilter,
}) => {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // SP-05: Aba ativa ('sprints' ou 'retrospective')
  const [modalTab, setModalTab] = useState<'sprints' | 'retrospective'>('sprints');

  // Retrospectiva do Sprint (SP-05)
  const [selectedRetroSprintId, setSelectedRetroSprintId] = useState<string>('');
  const [retroItems, setRetroItems] = useState<SprintRetroItem[]>([]);
  const [loadingRetro, setLoadingRetro] = useState(false);
  const [newRetroInputs, setNewRetroInputs] = useState<{
    WENT_WELL: string;
    TO_IMPROVE: string;
    ACTION_ITEM: string;
  }>({
    WENT_WELL: '',
    TO_IMPROVE: '',
    ACTION_ITEM: '',
  });

  // Modais internos: Criar/Editar Sprint (SP-01), Encerramento Guiado (SP-03), Relatório (SP-04)
  const [isSprintFormOpen, setIsSprintFormOpen] = useState(false);
  const [editingSprint, setEditingSprint] = useState<Sprint | null>(null);
  const [formName, setFormName] = useState('');
  const [formGoal, setFormGoal] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [savingSprint, setSavingSprint] = useState(false);

  // Encerramento Guiado (SP-03)
  const [closingSprint, setClosingSprint] = useState<Sprint | null>(null);
  const [moveToNextSprintId, setMoveToNextSprintId] = useState<string>('');
  const [isClosingAction, setIsClosingAction] = useState(false);

  // Relatório de Sprint (SP-04)
  const [reportingSprintId, setReportingSprintId] = useState<string | null>(null);
  const [sprintReport, setSprintReport] = useState<SprintReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const canEdit = userRole === 'OWNER' || userRole === 'EDITOR';

  useEffect(() => {
    if (isOpen && boardId) {
      loadSprints();
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, boardId]);

  const loadSprints = async () => {
    try {
      setLoading(true);
      const list = await api.getSprints(boardId);
      setSprints(list);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar sprints.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Separação de Sprints e Backlog (SP-02)
  const activeSprint = sprints.find(s => s.status === 'ACTIVE');
  const planningSprints = sprints.filter(s => s.status === 'PLANNING');
  const completedSprints = sprints.filter(s => s.status === 'COMPLETED');

  // Cartões no Backlog (sem sprint_id ou cujo sprint foi deletado)
  const sprintIdSet = new Set(sprints.map(s => s.id));
  const backlogCards = allCards.filter(c => !c.sprint_id || !sprintIdSet.has(c.sprint_id));

  // Cartões por Sprint
  const getCardsForSprint = (sprintId: string) => {
    return allCards.filter(c => c.sprint_id === sprintId);
  };

  // Handlers de formulário de Sprint (SP-01)
  const handleOpenCreateSprint = () => {
    const nextNumber = sprints.length + 1;
    setEditingSprint(null);
    setFormName(`Sprint ${nextNumber}`);
    setFormGoal('');
    const today = new Date().toISOString().split('T')[0];
    const nextTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setFormStartDate(today);
    setFormEndDate(nextTwoWeeks);
    setIsSprintFormOpen(true);
    setError(null);
  };

  const handleOpenEditSprint = (s: Sprint) => {
    setEditingSprint(s);
    setFormName(s.name);
    setFormGoal(s.goal || '');
    setFormStartDate(s.start_date || '');
    setFormEndDate(s.end_date || '');
    setIsSprintFormOpen(true);
    setError(null);
  };

  const handleSaveSprintForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('O nome do sprint é obrigatório.');
      return;
    }

    try {
      setSavingSprint(true);
      setError(null);
      if (editingSprint) {
        await api.updateSprint(editingSprint.id, {
          name: formName.trim(),
          goal: formGoal.trim(),
          startDate: formStartDate || null,
          endDate: formEndDate || null,
        });
        setSuccessMsg('Sprint atualizado com sucesso!');
      } else {
        await api.createSprint({
          boardId,
          name: formName.trim(),
          goal: formGoal.trim(),
          startDate: formStartDate || null,
          endDate: formEndDate || null,
        });
        setSuccessMsg('Sprint criado em planejamento!');
      }
      setIsSprintFormOpen(false);
      await loadSprints();
      await onRefreshBoard();
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar sprint.');
    } finally {
      setSavingSprint(false);
    }
  };

  const handleDeleteSprint = async (sprintId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este sprint? Os cartões voltarão para o backlog.')) return;
    try {
      await api.deleteSprint(sprintId);
      setSuccessMsg('Sprint excluído.');
      await loadSprints();
      await onRefreshBoard();
    } catch (err: any) {
      setError(err.message || 'Falha ao excluir sprint.');
    }
  };

  const handleStartSprint = async (sprintId: string) => {
    try {
      setError(null);
      await api.startSprint(sprintId);
      setSuccessMsg('Sprint iniciado com sucesso!');
      await loadSprints();
      await onRefreshBoard();
    } catch (err: any) {
      setError(err.message || 'Falha ao iniciar sprint.');
    }
  };

  // Encerramento Guiado (SP-03)
  const handleOpenCloseModal = (s: Sprint) => {
    setClosingSprint(s);
    const otherPlanning = planningSprints.filter(p => p.id !== s.id);
    setMoveToNextSprintId(otherPlanning.length > 0 ? otherPlanning[0].id : '');
    setError(null);
  };

  const handleConfirmCloseSprint = async () => {
    if (!closingSprint) return;
    try {
      setIsClosingAction(true);
      setError(null);
      const res = await api.closeSprint(closingSprint.id, {
        moveToNextSprintId: moveToNextSprintId || null,
        moveToBacklog: !moveToNextSprintId,
      });
      setSuccessMsg(`Sprint "${closingSprint.name}" encerrado! ${res.completedCount} entregues, ${res.incompleteCount} movidos para ${res.destination === 'NEXT_SPRINT' ? 'o próximo sprint' : 'o backlog'}.`);
      setClosingSprint(null);
      await loadSprints();
      await onRefreshBoard();
    } catch (err: any) {
      setError(err.message || 'Falha ao encerrar sprint.');
    } finally {
      setIsClosingAction(false);
    }
  };

  // Relatório de Sprint (SP-04)
  const handleOpenReport = async (sprintId: string) => {
    try {
      setReportingSprintId(sprintId);
      setLoadingReport(true);
      const report = await api.getSprintReport(sprintId);
      setSprintReport(report);
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar relatório do sprint.');
    } finally {
      setLoadingReport(false);
    }
  };

  // Mover cartão para um sprint ou para o backlog (SP-02)
  const handleMoveCardToSprint = async (cardId: string, targetSprintId: string | null) => {
    try {
      await api.assignCardsToSprint({
        cardIds: [cardId],
        sprintId: targetSprintId,
      });
      await loadSprints();
      await onRefreshBoard();
    } catch (err: any) {
      setError(err.message || 'Falha ao mover cartão.');
    }
  };

  // SP-05: Ciclos leves / rápidos (Semanal / Mensal)
  const handleCreateQuickCycle = async (cycleType: 'WEEKLY' | 'MONTHLY') => {
    try {
      setLoading(true);
      setError(null);
      await api.createQuickCycleSprint(boardId, cycleType === 'WEEKLY' ? 'WEEK' : 'MONTH');
      await loadSprints();
      if (onRefreshBoard) await onRefreshBoard();
      setSuccessMsg(`Ciclo ${cycleType === 'WEEKLY' ? 'semanal (7 dias)' : 'mensal (30 dias)'} criado com sucesso!`);
    } catch (err: any) {
      setError(err.message || 'Falha ao criar ciclo rápido.');
    } finally {
      setLoading(false);
    }
  };

  // SP-05: Retrospectiva do Sprint
  const loadRetro = async (sprintId: string) => {
    if (!sprintId) return;
    try {
      setLoadingRetro(true);
      const items = await api.getSprintRetrospective(sprintId);
      setRetroItems(items);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar retrospectiva.');
    } finally {
      setLoadingRetro(false);
    }
  };

  const handleSelectRetroSprint = (sprintId: string) => {
    setSelectedRetroSprintId(sprintId);
    loadRetro(sprintId);
  };

  const handleAddRetroItem = async (category: RetroCategory) => {
    const text = newRetroInputs[category].trim();
    if (!text || !selectedRetroSprintId) return;
    try {
      await api.addSprintRetroItem(selectedRetroSprintId, category, text);
      setNewRetroInputs(prev => ({ ...prev, [category]: '' }));
      await loadRetro(selectedRetroSprintId);
    } catch (err: any) {
      alert(err.message || 'Falha ao adicionar item.');
    }
  };

  const handleVoteRetro = async (itemId: string) => {
    if (!selectedRetroSprintId) return;
    try {
      await api.voteSprintRetroItem(selectedRetroSprintId, itemId);
      await loadRetro(selectedRetroSprintId);
    } catch (err: any) {
      alert(err.message || 'Falha ao votar no item.');
    }
  };

  const handleDeleteRetro = async (itemId: string) => {
    if (!selectedRetroSprintId) return;
    try {
      await api.deleteSprintRetroItem(selectedRetroSprintId, itemId);
      await loadRetro(selectedRetroSprintId);
    } catch (err: any) {
      alert(err.message || 'Falha ao remover item.');
    }
  };

  const handleConvertActionToCard = async (item: SprintRetroItem) => {
    try {
      await api.createCard({
        title: `[Ação Retro] ${item.content}`,
        columnId: allCards[0]?.column_id || '',
        sprintId: selectedRetroSprintId,
        type: 'TASK',
        priority: 'HIGH',
      });
      if (onRefreshBoard) await onRefreshBoard();
      setSuccessMsg('Plano de ação convertido em tarefa no quadro!');
    } catch (err: any) {
      alert(err.message || 'Falha ao converter em tarefa.');
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header Modal */}
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <span>Planejamento de Sprints & Backlog</span>
                <span className="text-xs font-normal text-slate-400">({boardTitle})</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Ciclos ágeis, movimentação de itens, relatórios e retrospectiva
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => handleCreateQuickCycle('WEEKLY')}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 text-xs font-semibold rounded-lg transition shadow-sm"
                  title="Criar ciclo rápido de 1 semana"
                >
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>+ Ciclo Semanal</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCreateQuickCycle('MONTHLY')}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-semibold rounded-lg transition shadow-sm"
                  title="Criar ciclo rápido de 1 mês"
                >
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>+ Ciclo Mensal</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenCreateSprint}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo Sprint</span>
                </button>
              </>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Abas: Sprints & Backlog vs Retrospectiva do Sprint (SP-05) */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-6 gap-3">
          <button
            type="button"
            onClick={() => setModalTab('sprints')}
            className={`py-3 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              modalTab === 'sprints'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Sprints & Backlog</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setModalTab('retrospective');
              const defaultId = selectedRetroSprintId || activeSprint?.id || sprints[0]?.id;
              if (defaultId) {
                setSelectedRetroSprintId(defaultId);
                loadRetro(defaultId);
              }
            }}
            className={`py-3 px-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              modalTab === 'retrospective'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Retrospectiva do Sprint</span>
          </button>
        </div>

        {/* Mensagens de Alerta */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-white ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center justify-between">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Conteúdo Principal */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm">Carregando sprints do quadro...</div>
          ) : modalTab === 'sprints' ? (
            <>
              {/* SEÇÃO 1: SPRINT ATIVO (SP-01, SP-02, SP-03, SP-04) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Sprint Ativo em Andamento
                    </h4>
                  </div>
                  {activeSprint && onSelectSprintFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSprintFilter(activeSprint.id);
                        onClose();
                      }}
                      className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <span>Ver no Quadro Kanban</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {!activeSprint ? (
                  <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center justify-between">
                    <span>Nenhum sprint ativo no momento. Inicie um dos sprints planejados abaixo para focar sua equipe.</span>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950/60 border border-emerald-500/30 rounded-xl space-y-3 shadow-lg shadow-emerald-500/5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{activeSprint.name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase">
                            Ativo
                          </span>
                        </div>
                        {activeSprint.goal && (
                          <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span>Meta: {activeSprint.goal}</span>
                          </p>
                        )}
                        {(activeSprint.start_date || activeSprint.end_date) && (
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>
                              {activeSprint.start_date || 'Início'} até {activeSprint.end_date || 'Término'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenReport(activeSprint.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
                          title="Visualizar relatório planejado vs entregue"
                        >
                          <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Relatório</span>
                        </button>

                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => handleOpenCloseModal(activeSprint)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow transition"
                            title="Encerrar este sprint de forma guiada"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Encerrar Sprint</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Lista de cartões do Sprint Ativo */}
                    {(() => {
                      const cards = getCardsForSprint(activeSprint.id);
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span>Cartões neste Sprint ({cards.length})</span>
                            <span className="text-[11px] text-emerald-400">
                              {activeSprint.completed_cards || 0} de {cards.length} concluídos
                            </span>
                          </div>

                          {cards.length === 0 ? (
                            <p className="text-xs text-slate-500 italic py-2">
                              Nenhum cartão alocado neste sprint. Adicione cartões do backlog abaixo.
                            </p>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {cards.map(card => (
                                <div
                                  key={card.id}
                                  className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between gap-3 text-xs"
                                >
                                  <div className="min-w-0 flex items-center gap-2">
                                    <span className="font-semibold text-slate-200 truncate">{card.title}</span>
                                    {card.estimate && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shrink-0">
                                        {card.estimate} {estimateType === 'POINTS' ? 'pts' : estimateType === 'HOURS' ? 'h' : ''}
                                      </span>
                                    )}
                                  </div>

                                  {canEdit && (
                                    <button
                                      type="button"
                                      onClick={() => handleMoveCardToSprint(card.id, null)}
                                      className="text-[11px] text-slate-400 hover:text-rose-300 transition shrink-0"
                                      title="Remover do sprint e enviar para o backlog"
                                    >
                                      Mover para Backlog
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* SEÇÃO 2: SPRINTS EM PLANEJAMENTO (SP-01, SP-02) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                    <Layers className="w-4 h-4" />
                    <span>Sprints Futuros em Planejamento ({planningSprints.length})</span>
                  </h4>
                </div>

                {planningSprints.length === 0 ? (
                  <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl text-xs text-slate-500 text-center py-6">
                    Nenhum sprint futuro em planejamento. Clique em "+ Novo Sprint" acima para criar um.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {planningSprints.map(sprint => {
                      const sprintCards = getCardsForSprint(sprint.id);

                      return (
                        <div
                          key={sprint.id}
                          className="p-4 bg-slate-950/50 border border-slate-800 hover:border-slate-700 rounded-xl space-y-3 transition"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-white">{sprint.name}</span>
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                                  Planejamento
                                </span>
                              </div>
                              {sprint.goal && (
                                <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5">
                                  <Target className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                  <span>{sprint.goal}</span>
                                </p>
                              )}
                              {(sprint.start_date || sprint.end_date) && (
                                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-500" />
                                  <span>
                                    {sprint.start_date || 'Início'} até {sprint.end_date || 'Término'}
                                  </span>
                                </div>
                              )}
                            </div>

                            {canEdit && (
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={Boolean(activeSprint)}
                                  onClick={() => handleStartSprint(sprint.id)}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition"
                                  title={
                                    activeSprint
                                      ? 'Conclua o sprint ativo antes de iniciar outro'
                                      : 'Iniciar este sprint'
                                  }
                                >
                                  <Play className="w-3.5 h-3.5" />
                                  <span>Iniciar Sprint</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleOpenEditSprint(sprint)}
                                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                                  title="Editar dados do sprint"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteSprint(sprint.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition"
                                  title="Excluir sprint"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Cartões alocados neste sprint */}
                          <div className="space-y-1.5">
                            <div className="text-xs text-slate-400 flex items-center justify-between">
                              <span>Itens alocados ({sprintCards.length})</span>
                            </div>

                            {sprintCards.length === 0 ? (
                              <p className="text-xs text-slate-500 italic py-1">
                                Nenhum cartão alocado. Selecione cartões do backlog abaixo.
                              </p>
                            ) : (
                              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                {sprintCards.map(card => (
                                  <div
                                    key={card.id}
                                    className="p-2 bg-slate-900 border border-slate-800/80 rounded-lg flex items-center justify-between gap-2 text-xs"
                                  >
                                    <div className="min-w-0 flex items-center gap-2">
                                      <span className="text-slate-200 truncate">{card.title}</span>
                                      {card.estimate && (
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shrink-0">
                                          {card.estimate} {estimateType === 'POINTS' ? 'pts' : estimateType === 'HOURS' ? 'h' : ''}
                                        </span>
                                      )}
                                    </div>
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => handleMoveCardToSprint(card.id, null)}
                                        className="text-[11px] text-slate-400 hover:text-rose-300 transition shrink-0"
                                      >
                                        Mover para Backlog
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SEÇÃO 3: BACKLOG DO QUADRO (SP-02) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Inbox className="w-4 h-4 text-slate-400" />
                    <span>Backlog do Quadro ({backlogCards.length} tarefas sem sprint)</span>
                  </h4>
                  {onSelectSprintFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSprintFilter('BACKLOG');
                        onClose();
                      }}
                      className="text-xs font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1"
                    >
                      <span>Ver Backlog no Kanban</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl space-y-2">
                  {backlogCards.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4 text-center">
                      O backlog está vazio. Todos os cartões estão alocados em sprints.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {backlogCards.map(card => (
                        <div
                          key={card.id}
                          className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="font-medium text-slate-200 truncate">{card.title}</span>
                            {card.estimate && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shrink-0">
                                {card.estimate}
                              </span>
                            )}
                          </div>

                          {canEdit && sprints.length > 0 && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-slate-500">Mover para:</span>
                              {activeSprint && (
                                <button
                                  type="button"
                                  onClick={() => handleMoveCardToSprint(card.id, activeSprint.id)}
                                  className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded text-[11px] font-semibold transition"
                                >
                                  Sprint Ativo
                                </button>
                              )}
                              {planningSprints.map(ps => (
                                <button
                                  key={ps.id}
                                  type="button"
                                  onClick={() => handleMoveCardToSprint(card.id, ps.id)}
                                  className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded text-[11px] font-semibold transition"
                                >
                                  {ps.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SEÇÃO 4: SPRINTS ANTERIORES CONCLUÍDOS (SP-04) */}
              {completedSprints.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Sprints Concluídos ({completedSprints.length})</span>
                  </h4>

                  <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/30">
                    {completedSprints.map(cs => (
                      <div key={cs.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200">{cs.name}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                              Concluído
                            </span>
                          </div>
                          {cs.goal && <p className="text-[11px] text-slate-400 mt-0.5">{cs.goal}</p>}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenReport(cs.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 text-xs font-semibold rounded-lg transition"
                        >
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span>Ver Relatório</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* RETROSPECTIVA DO SPRINT (SP-05) */
            <div className="space-y-4">
              {/* Seletor de Sprint para Retrospectiva */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-300">Sprint em Análise:</span>
                  <select
                    value={selectedRetroSprintId}
                    onChange={e => handleSelectRetroSprint(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 font-medium cursor-pointer"
                  >
                    {sprints.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.status === 'ACTIVE' ? '🟢 Ativo' : s.status === 'COMPLETED' ? '⚪ Concluído' : '🟡 Planejamento'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-[11px] text-slate-400">
                  Total de itens: <strong className="text-slate-200">{retroItems.length}</strong>
                </div>
              </div>

              {loadingRetro ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Carregando retrospectiva do sprint...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  {/* COLUNA 1: O que funcionou bem (WENT_WELL) */}
                  <div className="bg-slate-950/40 border border-emerald-500/30 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>O que funcionou bem</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {retroItems.filter(i => i.category === 'WENT_WELL').length}
                      </span>
                    </div>

                    {/* Form para adicionar */}
                    <div className="space-y-1.5">
                      <textarea
                        rows={2}
                        placeholder="Ex: Comunicação rápida da equipe..."
                        value={newRetroInputs.WENT_WELL}
                        onChange={e => setNewRetroInputs(prev => ({ ...prev, WENT_WELL: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddRetroItem('WENT_WELL')}
                        className="w-full py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition"
                      >
                        + Adicionar
                      </button>
                    </div>

                    {/* Lista */}
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {retroItems
                        .filter(i => i.category === 'WENT_WELL')
                        .map(item => (
                          <div
                            key={item.id}
                            className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2 text-xs shadow-sm"
                          >
                            <p className="text-slate-100 whitespace-pre-wrap">{item.content}</p>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-500">
                              <span>Por {item.author_name || 'Usuário'}</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleVoteRetro(item.id)}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 font-bold transition"
                                  title="Votar neste item"
                                >
                                  <ThumbsUp className="w-3 h-3" />
                                  <span>{item.votes}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRetro(item.id)}
                                  className="p-1 text-slate-500 hover:text-rose-400 transition"
                                  title="Remover"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* COLUNA 2: O que pode ser melhorado (TO_IMPROVE) */}
                  <div className="bg-slate-950/40 border border-amber-500/30 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-amber-500/20">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-amber-400">
                        <AlertCircle className="w-4 h-4" />
                        <span>A melhorar</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {retroItems.filter(i => i.category === 'TO_IMPROVE').length}
                      </span>
                    </div>

                    {/* Form para adicionar */}
                    <div className="space-y-1.5">
                      <textarea
                        rows={2}
                        placeholder="Ex: Demora nas revisões de código..."
                        value={newRetroInputs.TO_IMPROVE}
                        onChange={e => setNewRetroInputs(prev => ({ ...prev, TO_IMPROVE: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddRetroItem('TO_IMPROVE')}
                        className="w-full py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-semibold transition"
                      >
                        + Adicionar
                      </button>
                    </div>

                    {/* Lista */}
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {retroItems
                        .filter(i => i.category === 'TO_IMPROVE')
                        .map(item => (
                          <div
                            key={item.id}
                            className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2 text-xs shadow-sm"
                          >
                            <p className="text-slate-100 whitespace-pre-wrap">{item.content}</p>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-500">
                              <span>Por {item.author_name || 'Usuário'}</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleVoteRetro(item.id)}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 font-bold transition"
                                  title="Votar neste item"
                                >
                                  <ThumbsUp className="w-3 h-3" />
                                  <span>{item.votes}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRetro(item.id)}
                                  className="p-1 text-slate-500 hover:text-rose-400 transition"
                                  title="Remover"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* COLUNA 3: Plano de Ação (ACTION_ITEM) */}
                  <div className="bg-slate-950/40 border border-indigo-500/30 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-indigo-500/20">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-400">
                        <Target className="w-4 h-4" />
                        <span>Plano de Ação</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {retroItems.filter(i => i.category === 'ACTION_ITEM').length}
                      </span>
                    </div>

                    {/* Form para adicionar */}
                    <div className="space-y-1.5">
                      <textarea
                        rows={2}
                        placeholder="Ex: Agendar daily de 15 minutos às 9h..."
                        value={newRetroInputs.ACTION_ITEM}
                        onChange={e => setNewRetroInputs(prev => ({ ...prev, ACTION_ITEM: e.target.value }))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddRetroItem('ACTION_ITEM')}
                        className="w-full py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold transition"
                      >
                        + Adicionar Ação
                      </button>
                    </div>

                    {/* Lista com conversão em cartão */}
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {retroItems
                        .filter(i => i.category === 'ACTION_ITEM')
                        .map(item => (
                          <div
                            key={item.id}
                            className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2 text-xs shadow-sm"
                          >
                            <p className="text-slate-100 whitespace-pre-wrap">{item.content}</p>
                            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-500">
                              <button
                                type="button"
                                onClick={() => handleConvertActionToCard(item)}
                                className="px-2 py-0.5 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-semibold flex items-center gap-1 transition"
                                title="Converter em cartão no quadro Kanban"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Criar Tarefa</span>
                              </button>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleVoteRetro(item.id)}
                                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 font-bold transition"
                                  title="Votar neste item"
                                >
                                  <ThumbsUp className="w-3 h-3" />
                                  <span>{item.votes}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRetro(item.id)}
                                  className="p-1 text-slate-500 hover:text-rose-400 transition"
                                  title="Remover"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: CRIAR / EDITAR SPRINT (SP-01) */}
      {isSprintFormOpen && (
        <div
          onClick={() => setIsSprintFormOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-white text-sm">
                {editingSprint ? 'Editar Sprint' : 'Novo Sprint'}
              </h4>
              <button
                type="button"
                onClick={() => setIsSprintFormOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSprintForm} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome do Sprint *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Ex: Sprint 1"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Meta do Sprint (Opcional)</label>
                <input
                  type="text"
                  value={formGoal}
                  onChange={e => setFormGoal(e.target.value)}
                  placeholder="Ex: Entregar o fluxo de autenticação e tela de perfil"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Data de Início</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Data de Término</label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={e => setFormEndDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSprintFormOpen(false)}
                  className="px-3.5 py-2 text-slate-400 hover:text-white rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingSprint}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow"
                >
                  {savingSprint ? 'Salvando...' : 'Salvar Sprint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ENCERRAMENTO GUIADO DE SPRINT (SP-03) */}
      {closingSprint && (
        <div
          onClick={() => setClosingSprint(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-amber-400" />
                <h4 className="font-bold text-white text-sm">
                  Encerramento Guiado: {closingSprint.name}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setClosingSprint(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Ao concluir o sprint, os cartões finalizados serão registrados como entregues no histórico de métricas.
              Escolha o que fazer com as tarefas que ainda não foram concluídas:
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1.5">
                  Destino dos cartões incompletos:
                </label>
                <select
                  value={moveToNextSprintId}
                  onChange={e => setMoveToNextSprintId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Mover de volta para o Backlog do Quadro</option>
                  {planningSprints
                    .filter(p => p.id !== closingSprint.id)
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        Mover para o próximo sprint: {p.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-200">
                💡 <strong>Dica ágil:</strong> Você poderá visualizar o comparativo completo de escopo planejado versus entregue a qualquer momento pelo relatório do sprint.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClosingSprint(null)}
                className="px-3.5 py-2 text-slate-400 hover:text-white text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isClosingAction}
                onClick={handleConfirmCloseSprint}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg shadow"
              >
                {isClosingAction ? 'Concluindo...' : 'Confirmar e Encerrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: RELATÓRIO PLANEJADO VS ENTREGUE (SP-04) */}
      {reportingSprintId && (
        <div
          onClick={() => {
            setReportingSprintId(null);
            setSprintReport(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                <div>
                  <h4 className="font-bold text-white text-sm">
                    Relatório de Sprint: Planejado vs. Entregue
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    {sprintReport?.sprint.name}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReportingSprintId(null);
                  setSprintReport(null);
                }}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
              {loadingReport || !sprintReport ? (
                <div className="text-center py-12 text-slate-500">Calculando métricas do sprint...</div>
              ) : (
                <>
                  {/* Resumo Métrico */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Escopo Total</div>
                      <div className="text-xl font-extrabold text-white mt-1">
                        {sprintReport.summary.plannedCount + sprintReport.summary.addedDuringSprintCount}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">cartões no ciclo</div>
                    </div>

                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase font-bold text-indigo-400">Planejados</div>
                      <div className="text-xl font-extrabold text-indigo-300 mt-1">
                        {sprintReport.summary.plannedCount}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">no início do sprint</div>
                    </div>

                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase font-bold text-emerald-400">Entregues</div>
                      <div className="text-xl font-extrabold text-emerald-300 mt-1">
                        {sprintReport.summary.completedCount}
                      </div>
                      <div className="text-[10px] text-emerald-500/80 mt-0.5">
                        {sprintReport.summary.completionRatePercent}% de conclusão
                      </div>
                    </div>

                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div className="text-[10px] uppercase font-bold text-amber-400">Não Entregues</div>
                      <div className="text-xl font-extrabold text-amber-300 mt-1">
                        {sprintReport.summary.incompleteCount}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">incompletos</div>
                    </div>
                  </div>

                  {/* Barra de Progresso */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-semibold text-slate-300">
                      <span>Taxa de Entrega</span>
                      <span>{sprintReport.summary.completionRatePercent}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${sprintReport.summary.completionRatePercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Detalhamento das listas */}
                  <div className="space-y-4 pt-2">
                    {/* Entregues */}
                    <div>
                      <div className="font-bold text-slate-200 mb-2 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Cartões Entregues com Sucesso ({sprintReport.completedCards.length})</span>
                      </div>
                      {sprintReport.completedCards.length === 0 ? (
                        <p className="text-slate-500 italic pl-2">Nenhum cartão concluído.</p>
                      ) : (
                        <div className="space-y-1">
                          {sprintReport.completedCards.map(c => (
                            <div
                              key={c.id}
                              className="p-2 rounded bg-slate-950/40 border border-slate-800 flex items-center justify-between text-slate-300"
                            >
                              <span className="truncate">{c.title}</span>
                              {c.estimate && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300">
                                  {c.estimate}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Scope Change: Adicionados durante o Sprint */}
                    {sprintReport.addedDuringSprintCards.length > 0 && (
                      <div>
                        <div className="font-bold text-amber-300 mb-2 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                          <span>Adicionados Durante a Execução / Scope Change ({sprintReport.addedDuringSprintCards.length})</span>
                        </div>
                        <div className="space-y-1">
                          {sprintReport.addedDuringSprintCards.map(c => (
                            <div
                              key={c.id}
                              className="p-2 rounded bg-slate-950/40 border border-amber-500/20 flex items-center justify-between text-slate-300"
                            >
                              <span className="truncate">{c.title}</span>
                              {c.estimate && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300">
                                  {c.estimate}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Não entregues */}
                    {sprintReport.incompleteCards.length > 0 && (
                      <div>
                        <div className="font-bold text-rose-300 mb-2 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Cartões Não Entregues / Pendentes ({sprintReport.incompleteCards.length})</span>
                        </div>
                        <div className="space-y-1">
                          {sprintReport.incompleteCards.map(c => (
                            <div
                              key={c.id}
                              className="p-2 rounded bg-slate-950/40 border border-slate-800 flex items-center justify-between text-slate-400"
                            >
                              <span className="truncate">{c.title}</span>
                              {c.estimate && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                                  {c.estimate}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
