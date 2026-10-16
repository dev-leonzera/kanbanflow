import React, { useState, useEffect } from 'react';
import { MemberWorkloadSummary } from '../types';
import { api } from '../api/client';
import {
  X,
  Users,
  AlertTriangle,
  Calendar,
  CheckCircle,
  ShieldAlert,
  Sliders,
} from 'lucide-react';

interface WorkloadModalProps {
  isOpen: boolean;
  workspaceId: string;
  workspaceName?: string;
  onClose: () => void;
  onRefreshBoard?: () => Promise<void>;
}

export const WorkloadModal: React.FC<WorkloadModalProps> = ({
  isOpen,
  workspaceId,
  workspaceName,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workloads, setWorkloads] = useState<MemberWorkloadSummary[]>([]);
  const [activeTab, setActiveTab] = useState<'workload' | 'conflicts'>('workload');

  // Estado para edição de capacidade de um membro (CP-01)
  const [editingMember, setEditingMember] = useState<MemberWorkloadSummary | null>(null);
  const [weeklyHours, setWeeklyHours] = useState('40');
  const [sprintPoints, setSprintPoints] = useState('20');
  const [savingCapacity, setSavingCapacity] = useState(false);

  useEffect(() => {
    if (isOpen && workspaceId) {
      loadData();
    }
  }, [isOpen, workspaceId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getWorkspaceWorkload(workspaceId);
      setWorkloads(data);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar capacidade do time.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditCapacity = (member: MemberWorkloadSummary) => {
    setEditingMember(member);
    setWeeklyHours(String(member.weekly_capacity_hours || 40));
    setSprintPoints(String(member.sprint_capacity_points || 20));
  };

  const handleSaveCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    try {
      setSavingCapacity(true);
      await api.updateWorkspaceCapacity(
        workspaceId,
        editingMember.user_id,
        parseFloat(weeklyHours) || 40,
        parseFloat(sprintPoints) || 20
      );
      setEditingMember(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Falha ao salvar capacidade.');
    } finally {
      setSavingCapacity(false);
    }
  };

  if (!isOpen) return null;

  const totalConflicts = workloads.reduce((acc, m) => acc + (m.deadline_conflicts?.length || 0), 0);
  const overloadedCount = workloads.filter(m => m.is_overloaded).length;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/90">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>Carga & Capacidade da Equipe</span>
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-normal">
                  {workspaceName || 'Workspace'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Acompanhamento de alocação de horas, prevenção de sobrecarga (CP-02, CP-03) e agenda de conflitos (CP-04).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo do Time */}
        <div className="px-6 py-3 bg-slate-900/60 border-b border-slate-700/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Membros:</span>
              <strong className="text-slate-100">{workloads.length}</strong>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Sobrecarregados:</span>
              <strong className={overloadedCount > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                {overloadedCount}
              </strong>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Conflitos de Prazo:</span>
              <strong className={totalConflicts > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                {totalConflicts}
              </strong>
            </div>
          </div>

          {/* Abas */}
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('workload')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'workload'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Visão de Carga</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('conflicts')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                activeTab === 'conflicts'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Conflitos de Prazo</span>
              {totalConflicts > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/30 text-amber-300 font-bold">
                  {totalConflicts}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mensagem de Erro */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Conteúdo Principal */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Carregando dados de capacidade do time...
            </div>
          ) : activeTab === 'workload' ? (
            <div className="space-y-3">
              {workloads.length === 0 ? (
                <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-700/60 text-slate-400 text-sm">
                  Nenhum membro encontrado no workspace ativo.
                </div>
              ) : (
                workloads.map(member => {
                  const isOverloaded = member.is_overloaded;
                  const isOptimal = !isOverloaded && member.utilization_hours_percent >= 50 && member.utilization_hours_percent <= 100;
                  const pct = Math.min(100, member.utilization_hours_percent);

                  return (
                    <div
                      key={member.user_id}
                      className={`p-4 bg-slate-900/70 border rounded-xl transition ${
                        isOverloaded
                          ? 'border-rose-500/60 bg-rose-950/15 ring-1 ring-rose-500/30'
                          : 'border-slate-700/70 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow">
                            {member.user_name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-100 flex items-center gap-2">
                              <span>{member.user_name}</span>
                              {isOverloaded && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/25 text-rose-300 border border-rose-500/50 flex items-center gap-1 animate-pulse">
                                  <ShieldAlert className="w-3 h-3" />
                                  Sobrecarregado
                                </span>
                              )}
                              {isOptimal && (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Carga Ideal
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">{member.user_email}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenEditCapacity(member)}
                            className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1.5 transition"
                            title="Configurar capacidade deste membro"
                          >
                            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Ajustar Capacidade</span>
                          </button>
                        </div>
                      </div>

                      {/* Métricas e Barra de Progresso */}
                      <div className="space-y-2 bg-slate-800/60 p-3 rounded-lg border border-slate-700/40">
                        <div className="flex items-center justify-between text-xs text-slate-300">
                          <div className="flex items-center gap-4">
                            <span>
                              Horas Alocadas:{' '}
                              <strong className="text-slate-100 font-bold">{member.allocated_hours}h</strong>
                              <span className="text-slate-400 font-normal"> / {member.weekly_capacity_hours}h sem.</span>
                            </span>
                            <span>
                              Cartões:{' '}
                              <strong className="text-cyan-300 font-semibold">{member.assigned_cards.length}</strong>
                            </span>
                            {member.allocated_points > 0 && (
                              <span>
                                Pontos:{' '}
                                <strong className="text-indigo-300 font-semibold">{member.allocated_points} pts</strong>
                              </span>
                            )}
                          </div>
                          <div>
                            <span className={`font-bold ${isOverloaded ? 'text-rose-400' : 'text-slate-200'}`}>
                              {member.utilization_hours_percent}% de capacidade
                            </span>
                          </div>
                        </div>

                        {/* Barra visual de alocação */}
                        <div className="w-full h-2.5 bg-slate-700 rounded-full overflow-hidden border border-slate-600/50">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isOverloaded
                                ? 'bg-rose-500'
                                : isOptimal
                                ? 'bg-emerald-500'
                                : 'bg-indigo-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Conflitos de prazo do membro */}
                      {member.deadline_conflicts && member.deadline_conflicts.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-rose-500/30 flex items-center gap-2 text-xs text-rose-300">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>
                            {member.deadline_conflicts.length} conflito(s) de prazo no mesmo dia com múltiplas tarefas atribuídas.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* ABA DE CONFLITOS DE PRAZO (CP-04) */
            <div className="space-y-3">
              {totalConflicts === 0 ? (
                <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-700/60 text-slate-400 text-sm flex flex-col items-center gap-2">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                  <span className="font-semibold text-slate-200">Nenhum conflito de prazo detectado!</span>
                  <span className="text-xs text-slate-500">
                    Nenhum membro possui múltiplas entregas sobrecarregadas agendadas para a mesma data.
                  </span>
                </div>
              ) : (
                workloads.flatMap(member =>
                  (member.deadline_conflicts || []).map((conflict, idx) => (
                    <div
                      key={`${member.user_id}-${conflict.date}-${idx}`}
                      className="p-4 bg-slate-900/80 border border-amber-500/40 rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/40 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {conflict.date ? new Date(conflict.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Sem data'}
                          </span>
                          <span className="font-semibold text-slate-200">
                            Responsável: {member.user_name}
                          </span>
                        </div>
                        <span className="text-slate-400 text-xs">
                          {conflict.cards_count} tarefas ({conflict.total_hours}h estimadas)
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 pt-1">
                        <div className="font-medium text-slate-400 mb-1">Tarefas concorrentes para esta data:</div>
                        <ul className="list-disc list-inside space-y-0.5">
                          {conflict.card_titles.map((title, i) => (
                            <li key={i} className="text-slate-200">{title}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          )}
        </div>

        {/* Modal de Configuração de Capacidade (CP-01) */}
        {editingMember && (
          <div
            onClick={() => setEditingMember(null)}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-700 pb-3">
                <h3 className="font-bold text-slate-100 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Definir Capacidade de {editingMember.user_name}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveCapacity} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Capacidade Semanal (Horas)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    step="0.5"
                    required
                    value={weeklyHours}
                    onChange={e => setWeeklyHours(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                    placeholder="Ex: 40"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Padrão de mercado: 40 horas semanais.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Capacidade de Sprint (Pontos)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    required
                    value={sprintPoints}
                    onChange={e => setSprintPoints(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                    placeholder="Ex: 20"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Utilizado no planejamento e balanceamento de sprints ágeis.
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
                  <button
                    type="button"
                    onClick={() => setEditingMember(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-700/60 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingCapacity}
                    className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow transition disabled:opacity-50"
                  >
                    {savingCapacity ? 'Salvando...' : 'Salvar Capacidade'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-700 flex justify-between items-center bg-slate-800/90">
          <span className="text-xs text-slate-500">
            A capacidade permite prever desvios e balancear tarefas antes de iniciar sprints.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
