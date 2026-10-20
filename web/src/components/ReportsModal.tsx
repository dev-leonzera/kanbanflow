import React, { useState, useEffect } from 'react';
import {
  X,
  BarChart3,
  TrendingDown,
  Activity,
  Download,
  Clock,
  AlertCircle,
  Layers,
  Target,
  Users,
} from 'lucide-react';
import { api } from '../api/client';
import {
  Board,
  LeadCycleTimeReport,
  BurndownVelocityReport,
  CfdReport,
  ThroughputReport,
  TimeTrackingReport,
  EstimateAccuracyReport,
} from '../types';

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: Board;
}

type ReportTab = 'lead-cycle' | 'burndown' | 'cfd' | 'throughput' | 'timesheet' | 'accuracy';

const formatToDayMonth = (dateStr: string | null | undefined) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length >= 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
};

const formatSprintName = (name: string | null | undefined) => {
  if (!name) return '';
  return name.replace(
    /\((\d{2})-(\d{2})\s+a\s+(\d{2})-(\d{2})\)/g,
    (_match, m1, d1, m2, d2) => `(${d1}/${m1} a ${d2}/${m2})`
  );
};

export const ReportsModal: React.FC<ReportsModalProps> = ({ isOpen, onClose, board }) => {
  const [activeTab, setActiveTab] = useState<ReportTab>('lead-cycle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados dos relatórios
  const [leadReport, setLeadReport] = useState<LeadCycleTimeReport | null>(null);
  const [burndownReport, setBurndownReport] = useState<BurndownVelocityReport | null>(null);
  const [cfdReport, setCfdReport] = useState<CfdReport | null>(null);
  const [throughputReport, setThroughputReport] = useState<ThroughputReport | null>(null);
  const [timeReport, setTimeReport] = useState<TimeTrackingReport | null>(null);
  const [accuracyReport, setAccuracyReport] = useState<EstimateAccuracyReport | null>(null);

  useEffect(() => {
    if (!isOpen || !board?.id) return;
    loadActiveReport(activeTab);
  }, [isOpen, board?.id, activeTab]);

  const loadActiveReport = async (tab: ReportTab) => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'lead-cycle') {
        const data = await api.getLeadCycleTimeReport(board.id);
        setLeadReport(data);
      } else if (tab === 'burndown') {
        const data = await api.getBurndownVelocityReport(board.id);
        setBurndownReport(data);
      } else if (tab === 'cfd') {
        const data = await api.getCfdReport(board.id);
        setCfdReport(data);
      } else if (tab === 'throughput') {
        const data = await api.getThroughputReport(board.id);
        setThroughputReport(data);
      } else if (tab === 'timesheet') {
        const data = await api.getTimeTrackingReport(board.id);
        setTimeReport(data);
      } else if (tab === 'accuracy') {
        const data = await api.getEstimateAccuracyReport(board.id);
        setAccuracyReport(data);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar métricas.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Relatórios & Métricas Ágeis</h2>
              <p className="text-xs text-slate-400">
                Indicadores de fluxo, tempo de entrega e velocidade no quadro "{board.title}"
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Abas */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('lead-cycle')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'lead-cycle'
                ? 'border-indigo-500 text-indigo-300 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Lead & Cycle Time
          </button>
          <button
            onClick={() => setActiveTab('burndown')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'burndown'
                ? 'border-indigo-500 text-indigo-300 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            Burndown & Velocity
          </button>
          <button
            onClick={() => setActiveTab('cfd')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'cfd'
                ? 'border-indigo-500 text-indigo-300 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            Fluxo Cumulativo (CFD)
          </button>
          <button
            onClick={() => setActiveTab('throughput')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'throughput'
                ? 'border-indigo-500 text-indigo-300 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-4 h-4" />
            Throughput
          </button>
          <button
            onClick={() => setActiveTab('timesheet')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'timesheet'
                ? 'border-indigo-500 text-indigo-300 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Timesheet & Horas
          </button>
          <button
            onClick={() => setActiveTab('accuracy')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              activeTab === 'accuracy'
                ? 'border-indigo-500 text-indigo-300 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-4 h-4" />
            Precisão de Estimativas
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Calculando métricas em tempo real...</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* ABA 1: LEAD & CYCLE TIME (RP-01) */}
              {activeTab === 'lead-cycle' && leadReport && (
                <div className="space-y-6">
                  {/* KPIs Superiores */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="text-[11px] text-slate-400 font-medium">Lead Time Médio</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-indigo-300">
                          {leadReport.overall.avgLeadTimeDays}
                        </span>
                        <span className="text-xs text-slate-400">dias</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Desde a criação até a entrega final</p>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="text-[11px] text-slate-400 font-medium">Cycle Time Médio</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-emerald-300">
                          {leadReport.overall.avgCycleTimeDays}
                        </span>
                        <span className="text-xs text-slate-400">dias</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">Desde o início da execução até a entrega</p>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="text-[11px] text-slate-400 font-medium">Cartões Analisados</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-100">
                          {leadReport.cards.length}
                        </span>
                        <span className="text-xs text-slate-400">itens</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {leadReport.cards.filter(c => c.lead_time_days !== null).length} concluídos
                      </p>
                    </div>
                  </div>

                  {/* Agrupamento por Tipo de Cartão */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      Médias por Tipo de Cartão
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="pb-2 font-semibold">Tipo</th>
                            <th className="pb-2 font-semibold">Concluídos</th>
                            <th className="pb-2 font-semibold">Lead Time Médio</th>
                            <th className="pb-2 font-semibold">Cycle Time Médio</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {Object.entries(leadReport.byType).map(([typeKey, data]) => (
                            <tr key={typeKey} className="hover:bg-slate-900/40">
                              <td className="py-2.5 font-medium text-slate-200">{typeKey}</td>
                              <td className="py-2.5 text-slate-400">{data.count}</td>
                              <td className="py-2.5 text-indigo-300 font-medium">
                                {data.avgLeadTimeDays > 0 ? `${data.avgLeadTimeDays} dias` : '-'}
                              </td>
                              <td className="py-2.5 text-emerald-300 font-medium">
                                {data.avgCycleTimeDays > 0 ? `${data.avgCycleTimeDays} dias` : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Tabela de Cartões Detalhada */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h3 className="text-xs font-bold text-slate-300">Tempo de Ciclo por Cartão</h3>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/50">
                      {leadReport.cards.map(card => (
                        <div key={card.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-200 truncate">{card.title}</div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[9px]">
                                {card.type}
                              </span>
                              {card.assignee && <span>Resp: {card.assignee}</span>}
                              <span>Criado em: {new Date(card.created_at).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 text-right">
                            <div>
                              <div className="text-[10px] text-slate-500">Lead Time</div>
                              <div className="font-semibold text-indigo-300">
                                {card.lead_time_days !== null ? `${card.lead_time_days}d` : 'Em aberto'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-slate-500">Cycle Time</div>
                              <div className="font-semibold text-emerald-300">
                                {card.cycle_time_days !== null ? `${card.cycle_time_days}d` : '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 2: BURNDOWN & VELOCITY (RP-02) */}
              {activeTab === 'burndown' && burndownReport && (
                <div className="space-y-6">
                  {burndownReport.sprint ? (
                    <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-indigo-400" />
                            Burndown do Sprint: {formatSprintName(burndownReport.sprint.name)}
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {formatToDayMonth(burndownReport.sprint.start_date) || 'Início'} até{' '}
                            {formatToDayMonth(burndownReport.sprint.end_date) || 'Término'}
                          </p>
                        </div>
                        <span className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {burndownReport.sprint.status}
                        </span>
                      </div>

                      {/* Visualização de Burndown em Gráfico Simulado */}
                      <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                          <span>Pontos Restantes vs. Linha Ideal</span>
                          <div className="flex items-center gap-4 text-[10px]">
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-0.5 bg-slate-500 border border-dashed border-slate-400" />
                              <span>Ideal</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-2 bg-indigo-500 rounded-sm" />
                              <span>Real</span>
                            </div>
                          </div>
                        </div>

                        {burndownReport.burndown.length > 0 ? (
                          <div className="flex items-end gap-2 h-40 pt-4 border-b border-l border-slate-700 px-2">
                            {burndownReport.burndown.map((point, idx) => {
                              const maxVal = Math.max(
                                ...burndownReport.burndown.map(p => Math.max(p.remainingPoints, p.idealPoints, 10))
                              );
                              const realHeight = `${Math.min(100, (point.remainingPoints / maxVal) * 100)}%`;
                              const idealHeight = `${Math.min(100, (point.idealPoints / maxVal) * 100)}%`;

                              return (
                                <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                                  <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 px-2 py-1 rounded text-[10px] text-white border border-slate-700 pointer-events-none z-10 whitespace-nowrap">
                                    {formatToDayMonth(point.date)}: Real {point.remainingPoints} pts / Ideal {point.idealPoints} pts
                                  </div>
                                  <div className="w-full flex items-end justify-center gap-1 h-full">
                                    <div
                                      style={{ height: idealHeight }}
                                      className="w-1.5 bg-slate-600/60 rounded-t border-t border-dashed border-slate-400"
                                    />
                                    <div
                                      style={{ height: realHeight }}
                                      className="w-3 bg-indigo-500 rounded-t hover:bg-indigo-400 transition-all"
                                    />
                                  </div>
                                  <span className="text-[9px] text-slate-500 mt-2 truncate w-full text-center">
                                    {formatToDayMonth(point.date)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-xs text-slate-500">
                            Datas de início e fim ainda não configuradas para este sprint.
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800 text-xs text-slate-500">
                      Nenhum sprint cadastrado ainda neste quadro. Crie um sprint para visualizar o burndown.
                    </div>
                  )}

                  {/* Velocity Histórico */}
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-emerald-400" />
                      Velocidade (Velocity) por Sprint
                    </h3>
                    {burndownReport.velocity.length === 0 ? (
                      <p className="text-xs text-slate-500">Nenhum dado de velocidade registrado.</p>
                    ) : (
                      <div className="space-y-2">
                        {burndownReport.velocity.map((v, i) => (
                          <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs">
                            <span className="font-medium text-slate-200">{v.sprintName}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-slate-400">{v.completedCards} cartões entregues</span>
                              <span className="font-bold text-emerald-300 px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                                {v.completedPoints} pts entregues
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABA 3: FLUXO CUMULATIVO (CFD) & TEMPO POR COLUNA (RP-03) */}
              {activeTab === 'cfd' && cfdReport && (
                <div className="space-y-6">
                  {/* Tempo Médio por Coluna */}
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-400" />
                      Tempo Médio de Permanência por Coluna
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {cfdReport.avgTimePerColumnHours.map(c => (
                        <div key={c.columnId} className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                          <div className="text-[11px] font-semibold text-slate-300 truncate">{c.columnTitle}</div>
                          <div className="mt-1 text-lg font-bold text-indigo-300">
                            {c.avgHours < 24 ? `${c.avgHours}h` : `${(c.avgHours / 24).toFixed(1)} dias`}
                          </div>
                          <p className="text-[9px] text-slate-500 mt-0.5">Média de permanência</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* CFD Visualização */}
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold text-white flex items-center gap-2">
                          <Activity className="w-4 h-4 text-indigo-400" />
                          Diagrama de Fluxo Cumulativo (Últimos 14 dias)
                        </h3>
                        <p className="text-[11px] text-slate-400">Distribuição do trabalho em progresso ao longo do tempo</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="pb-2 font-semibold">Coluna / Etapa</th>
                            {cfdReport.dates.map(d => (
                              <th key={d} className="pb-2 text-center text-[10px] font-mono">
                                {formatToDayMonth(d)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-center">
                          {cfdReport.columns.map(col => (
                            <tr key={col.id} className="hover:bg-slate-900/40">
                              <td className="py-2.5 font-sans font-medium text-left text-slate-200">{col.title}</td>
                              {col.counts.map((cnt, i) => (
                                <td key={i} className="py-2.5 text-indigo-300">
                                  {cnt}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 4: THROUGHPUT & EXPORTAÇÃO (RP-04) */}
              {activeTab === 'throughput' && throughputReport && (
                <div className="space-y-6">
                  {/* Throughput Semanal */}
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-4">
                    <div>
                      <h3 className="text-xs font-bold text-white flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-emerald-400" />
                        Throughput Semanal (Últimas 8 semanas)
                      </h3>
                      <p className="text-[11px] text-slate-400">Quantidade de entregas finalizadas por semana</p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-2">
                      {throughputReport.weeks.map((wk, idx) => (
                        <div key={idx} className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-col items-center text-center">
                          <span className="text-[10px] text-slate-400 font-medium truncate w-full">{wk.weekLabel}</span>
                          <span className="text-xl font-bold text-emerald-400 mt-2">{wk.completedCardsCount}</span>
                          <span className="text-[10px] text-slate-500">cartões</span>
                          <span className="text-[9px] text-indigo-300 mt-1">{wk.completedPoints} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Exportação CSV */}
                  <div className="bg-slate-950/50 p-6 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Download className="w-4 h-4 text-indigo-400" />
                        Exportar Relatório Completo em Planilha CSV
                      </h4>
                      <p className="text-xs text-slate-400 max-w-lg">
                        Gere e baixe instantaneamente um arquivo CSV compatível com Excel e Google Sheets com todos os cartões,
                        responsáveis, prazos, estimativas e métricas de Lead Time e Cycle Time.
                      </p>
                    </div>
                    <a
                      href={api.getExportCsvUrl(board.id)}
                      download
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors flex items-center gap-2 shrink-0 shadow-lg shadow-indigo-600/20"
                    >
                      <Download className="w-4 h-4" />
                      Baixar Planilha (.csv)
                    </a>
                  </div>
                </div>
              )}

              {/* ABA: TIMESHEET & HORAS (TM-03) */}
              {activeTab === 'timesheet' && timeReport && (
                <div className="space-y-6">
                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                        Horas Totais Lançadas
                      </div>
                      <div className="text-2xl font-bold text-cyan-300">
                        {timeReport.totalHours.toFixed(1)}h
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Em {timeReport.logs.length} lançamentos registrados
                      </span>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                        Pessoas Envolvidas
                      </div>
                      <div className="text-2xl font-bold text-indigo-300">
                        {timeReport.byUser.length}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Membros com apontamento ativo
                      </span>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 flex flex-col justify-between">
                      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                        Exportação
                      </div>
                      <a
                        href={api.getTimeTrackingCsvUrl(board.id)}
                        download
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 shadow"
                      >
                        <Download className="w-4 h-4" />
                        <span>Exportar Timesheet (.csv)</span>
                      </a>
                    </div>
                  </div>

                  {/* Horas por Membro da Equipe */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-400" />
                      <span>Alocação de Horas por Pessoa</span>
                    </h4>

                    {timeReport.byUser.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4 text-center">Nenhum apontamento por usuário.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {timeReport.byUser.map(u => {
                          const uHours = u.totalHours ?? (u.totalSeconds / 3600);
                          const tHours = timeReport.totalHours ?? (timeReport.totalSeconds / 3600);
                          const pct = tHours > 0 ? Math.round((uHours / tHours) * 100) : 0;
                          return (
                            <div key={u.userId} className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-slate-200">
                                  {u.userName}{u.userEmail ? ` (${u.userEmail})` : ''}
                                </span>
                                <span className="font-bold text-cyan-300">
                                  {uHours.toFixed(1)}h ({pct}%)
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Horas por Cartão */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-cyan-400" />
                      <span>Horas por Cartão</span>
                    </h4>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold text-[10px] uppercase">
                          <tr>
                            <th className="py-2.5 px-3">Cartão</th>
                            <th className="py-2.5 px-3">Coluna</th>
                            <th className="py-2.5 px-3">Horas Gastas</th>
                            <th className="py-2.5 px-3">Estimativa</th>
                            <th className="py-2.5 px-3">Desvio</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {timeReport.byCard.map(c => {
                            const est = parseFloat(c.estimate || '0') || 0;
                            const dev = c.totalHours - est;
                            const isOver = est > 0 && dev > 0;
                            return (
                              <tr key={c.cardId} className="hover:bg-slate-900/50">
                                <td className="py-2.5 px-3 font-medium text-slate-200">{c.cardTitle}</td>
                                <td className="py-2.5 px-3 text-slate-400">{c.columnTitle}</td>
                                <td className="py-2.5 px-3 font-bold text-cyan-300">{c.totalHours.toFixed(1)}h</td>
                                <td className="py-2.5 px-3 text-slate-400">{est > 0 ? `${est}h` : '-'}</td>
                                <td className="py-2.5 px-3">
                                  {est > 0 ? (
                                    <span className={`font-semibold ${isOver ? 'text-rose-400' : 'text-emerald-400'}`}>
                                      {dev > 0 ? `+${dev.toFixed(1)}h` : `${dev.toFixed(1)}h`}
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA: HISTÓRICO DE PRECISÃO DE ESTIMATIVAS (RP-05) */}
              {activeTab === 'accuracy' && accuracyReport && (
                <div className="space-y-6">
                  {/* Top Accuracy Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                        Taxa de Precisão
                      </div>
                      <div className="text-2xl font-bold text-emerald-300">
                        {accuracyReport.accuracyRatePercent}%
                      </div>
                      <span className="text-[11px] text-slate-500">Dentro da margem prevista</span>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                        Desvio Médio
                      </div>
                      <div className="text-2xl font-bold text-amber-300">
                        {accuracyReport.averageDeviationHours}h
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Variação de {accuracyReport.averageDeviationPercent}%
                      </span>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                        Tarefas com Estimativa
                      </div>
                      <div className="text-2xl font-bold text-indigo-300">
                        {accuracyReport.totalCardsWithEstimate}
                      </div>
                      <span className="text-[11px] text-slate-500">Amostragem histórica</span>
                    </div>

                    <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                        No Prazo / Concluídas
                      </div>
                      <div className="text-2xl font-bold text-cyan-300">
                        {accuracyReport.cardsWithinEstimate}
                      </div>
                      <span className="text-[11px] text-slate-500">Sem estouro de horas</span>
                    </div>
                  </div>

                  {/* Tabela de Precisão por Tarefa */}
                  <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-400" />
                      <span>Precisão das Tarefas Avaliadas</span>
                    </h4>

                    {accuracyReport.cards.length === 0 ? (
                      <p className="text-xs text-slate-500 py-6 text-center">
                        Nenhuma tarefa com horas estimadas e apontamentos concluídos ainda.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold text-[10px] uppercase">
                            <tr>
                              <th className="py-2.5 px-3">Tarefa</th>
                              <th className="py-2.5 px-3">Estimado</th>
                              <th className="py-2.5 px-3">Realizado</th>
                              <th className="py-2.5 px-3">Desvio</th>
                              <th className="py-2.5 px-3">Resultado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {accuracyReport.cards.map(c => {
                              const isOver = c.deviationHours > 0;
                              return (
                                <tr key={c.cardId} className="hover:bg-slate-900/50">
                                  <td className="py-2.5 px-3 font-semibold text-slate-200">{c.cardTitle}</td>
                                  <td className="py-2.5 px-3 text-cyan-300">{c.estimatedHours}h</td>
                                  <td className="py-2.5 px-3 text-indigo-300">{c.actualHours}h</td>
                                  <td className="py-2.5 px-3">
                                    <span className={`font-bold ${isOver ? 'text-rose-400' : 'text-emerald-400'}`}>
                                      {c.deviationHours > 0 ? `+${c.deviationHours}h` : `${c.deviationHours}h`} ({c.deviationPercent}%)
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {c.withinEstimate ? (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                        No Prazo
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                        Subestimado
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
          <span>Dados calculados com base no log de eventos do KanbanFlow</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
