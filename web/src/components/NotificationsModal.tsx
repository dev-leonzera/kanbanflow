import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Bell,
  Check,
  CheckCheck,
  Sliders,
  MessageSquare,
  AtSign,
  ArrowRightLeft,
  UserCheck,
  Paperclip,
  ExternalLink,
  Moon,
  VolumeX,
  FileText,
  Clock,
  Layers,
  Filter,
} from 'lucide-react';
import {
  NotificationItem,
  NotificationPreference,
  NotificationEventType,
  NotificationSettings,
  NotificationDigest,
} from '../types';
import { api } from '../api/client';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToCard?: (boardId: string, cardId: string) => Promise<void>;
  onNotificationsUpdated?: () => void;
}

const EVENT_TYPE_META: Record<
  NotificationEventType,
  { label: string; description: string; Icon: React.FC<{ className?: string }> }
> = {
  COMMENT_ADDED: {
    label: 'Novos Comentários',
    description: 'Quando alguém comenta em um cartão que você acompanha.',
    Icon: MessageSquare,
  },
  MENTIONED: {
    label: 'Menções (@nome)',
    description: 'Quando alguém menciona seu nome ou e-mail em comentários ou descrições.',
    Icon: AtSign,
  },
  CARD_MOVED: {
    label: 'Mudança de Coluna',
    description: 'Quando um cartão acompanhado avança ou muda de coluna no quadro.',
    Icon: ArrowRightLeft,
  },
  CARD_ASSIGNED: {
    label: 'Atribuição de Responsável',
    description: 'Quando um cartão é atribuído a você ou muda de responsável.',
    Icon: UserCheck,
  },
  ATTACHMENT_ADDED: {
    label: 'Novos Anexos',
    description: 'Quando arquivos ou links são anexados a um cartão acompanhado.',
    Icon: Paperclip,
  },
  CARD_UNBLOCKED: {
    label: 'Cartão Desbloqueado',
    description: 'Quando as tarefas que bloqueavam seu cartão são concluídas.',
    Icon: CheckCheck,
  },
};

type InboxFilter = 'ALL' | 'UNREAD' | 'MENTIONS' | 'ASSIGNMENTS' | 'MOVES';
type GroupingMode = 'NONE' | 'DATE' | 'CARD';

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  onNavigateToCard,
  onNotificationsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'preferences' | 'digest'>('inbox');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  // NT-04: Filtros e agrupamento
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('ALL');
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('NONE');

  // NT-03: Digest
  const [digestPeriod, setDigestPeriod] = useState<'daily' | 'weekly'>('daily');
  const [digestData, setDigestData] = useState<NotificationDigest | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSuccessMsg(null);
      loadData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'digest') {
      loadDigest(digestPeriod);
    }
  }, [isOpen, activeTab, digestPeriod]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [notifList, prefList, notifSettings] = await Promise.all([
        api.getNotifications(),
        api.getNotificationPreferences(),
        api.getNotificationSettings(),
      ]);
      setNotifications(notifList);
      setPreferences(prefList);
      setSettings(notifSettings);
    } catch (err) {
      console.error('Erro ao carregar notificações e preferências:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDigest = async (period: 'daily' | 'weekly') => {
    try {
      setDigestLoading(true);
      const data = await api.getNotificationDigest(period);
      setDigestData(data);
    } catch (err) {
      console.error('Erro ao carregar digest:', err);
    } finally {
      setDigestLoading(false);
    }
  };

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
      if (onNotificationsUpdated) onNotificationsUpdated();
    } catch (err) {
      console.error('Falha ao marcar notificação como lida:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      if (onNotificationsUpdated) onNotificationsUpdated();
    } catch (err) {
      console.error('Falha ao marcar todas como lidas:', err);
    }
  };

  const handleTogglePreference = (
    eventType: NotificationEventType,
    channel: 'channel_in_app' | 'channel_email'
  ) => {
    setPreferences(prev =>
      prev.map(p =>
        p.event_type === eventType ? { ...p, [channel]: !p[channel] } : p
      )
    );
    setSuccessMsg(null);
  };

  const handleSavePreferences = async () => {
    try {
      setSavingPrefs(true);
      setSuccessMsg(null);
      const [updatedPrefs, updatedSettings] = await Promise.all([
        api.saveNotificationPreferences(
          preferences.map(p => ({
            event_type: p.event_type,
            channel_in_app: p.channel_in_app,
            channel_email: p.channel_email,
          }))
        ),
        settings ? api.updateNotificationSettings(settings) : Promise.resolve(null),
      ]);
      setPreferences(updatedPrefs);
      if (updatedSettings) setSettings(updatedSettings);
      setSuccessMsg('Preferências, modo Não Perturbe e horários salvos com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar preferências:', err);
    } finally {
      setSavingPrefs(false);
    }
  };

  // NT-04: Filtragem da Inbox
  const filteredNotifications = useMemo(() => {
    return notifications.filter(notif => {
      if (inboxFilter === 'UNREAD') return !notif.is_read;
      if (inboxFilter === 'MENTIONS') return notif.event_type === 'MENTIONED';
      if (inboxFilter === 'ASSIGNMENTS') return notif.event_type === 'CARD_ASSIGNED';
      if (inboxFilter === 'MOVES') return notif.event_type === 'CARD_MOVED';
      return true;
    });
  }, [notifications, inboxFilter]);

  // NT-04: Agrupamento
  const groupedNotifications = useMemo(() => {
    if (groupingMode === 'NONE') {
      return [{ groupTitle: '', items: filteredNotifications }];
    }

    if (groupingMode === 'DATE') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const groups: Record<string, NotificationItem[]> = {
        Hoje: [],
        Ontem: [],
        'Esta Semana': [],
        Anteriores: [],
      };

      const nowTime = today.getTime();
      const weekStart = nowTime - 6 * 24 * 60 * 60 * 1000;

      filteredNotifications.forEach(n => {
        const d = new Date(n.created_at);
        const t = d.getTime();
        if (t >= nowTime) {
          groups['Hoje'].push(n);
        } else if (t >= yesterday.getTime()) {
          groups['Ontem'].push(n);
        } else if (t >= weekStart) {
          groups['Esta Semana'].push(n);
        } else {
          groups['Anteriores'].push(n);
        }
      });

      return Object.entries(groups)
        .filter(([_, items]) => items.length > 0)
        .map(([groupTitle, items]) => ({ groupTitle, items }));
    }

    if (groupingMode === 'CARD') {
      const groups: Record<string, NotificationItem[]> = {};
      filteredNotifications.forEach(n => {
        const key = n.card_id ? `Cartão: ${n.title.split(':')[0] || 'Cartão'}` : 'Gerais';
        if (!groups[key]) groups[key] = [];
        groups[key].push(n);
      });

      return Object.entries(groups).map(([groupTitle, items]) => ({ groupTitle, items }));
    }

    return [{ groupTitle: '', items: filteredNotifications }];
  }, [filteredNotifications, groupingMode]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="w-2.5 h-2.5 bg-rose-500 rounded-full absolute -top-0.5 -right-0.5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">
                  Central de Notificações
                </h3>
                {settings?.dnd_enabled && (
                  <span className="flex items-center gap-1 bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    <VolumeX className="w-3 h-3" />
                    Não Perturbe Ativo
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Caixa de entrada com filtros, resumo periódico e configuração de silêncio
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/40 px-4 flex-wrap gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('inbox');
                setSuccessMsg(null);
              }}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'inbox'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Caixa de Entrada ({unreadCount} não lidas)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('digest');
                setSuccessMsg(null);
              }}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'digest'
                  ? 'border-cyan-500 text-cyan-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Resumo Periódico (Digest)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('preferences');
                setSuccessMsg(null);
              }}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'preferences'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Canais, DND & Silêncio</span>
            </button>
          </div>

          {activeTab === 'inbox' && unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 transition py-1 px-2 rounded hover:bg-slate-800"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar todas como lidas</span>
            </button>
          )}
        </div>

        {/* Conteúdo */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="text-center py-12 text-xs text-slate-500">
              Carregando central de notificações...
            </div>
          ) : activeTab === 'inbox' ? (
            <div className="space-y-4">
              {/* Barra de Filtros e Agrupamento (NT-04) */}
              <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-950/40 p-2.5 rounded-xl border border-slate-800">
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className="text-slate-500 text-[11px] flex items-center gap-1 mr-1">
                    <Filter className="w-3 h-3" /> Filtro:
                  </span>
                  {[
                    { key: 'ALL' as InboxFilter, label: 'Todas' },
                    { key: 'UNREAD' as InboxFilter, label: 'Não Lidas' },
                    { key: 'MENTIONS' as InboxFilter, label: 'Menções (@)' },
                    { key: 'ASSIGNMENTS' as InboxFilter, label: 'Atribuições' },
                    { key: 'MOVES' as InboxFilter, label: 'Movimentações' },
                  ].map(f => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setInboxFilter(f.key)}
                      className={`px-2 py-1 rounded-lg transition font-medium text-[11px] ${
                        inboxFilter === f.key
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-slate-500 text-[11px] flex items-center gap-1">
                    <Layers className="w-3 h-3" /> Agrupar:
                  </span>
                  <select
                    value={groupingMode}
                    onChange={e => setGroupingMode(e.target.value as GroupingMode)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2 py-1 text-xs"
                  >
                    <option value="NONE">Sem agrupamento</option>
                    <option value="DATE">Por Data (Hoje / Esta Semana)</option>
                    <option value="CARD">Por Cartão</option>
                  </select>
                </div>
              </div>

              {filteredNotifications.length === 0 ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <Bell className="w-8 h-8 mx-auto text-slate-600 stroke-1" />
                  <p className="text-sm font-medium text-slate-400">
                    Nenhuma notificação encontrada com o filtro selecionado.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedNotifications.map((group, gIdx) => (
                    <div key={gIdx} className="space-y-2">
                      {group.groupTitle && (
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1 pt-2">
                          {group.groupTitle}
                        </div>
                      )}

                      <div className="space-y-2">
                        {group.items.map(notif => {
                          const meta = EVENT_TYPE_META[notif.event_type] || EVENT_TYPE_META.COMMENT_ADDED;
                          const EventIcon = meta.Icon;

                          return (
                            <div
                              key={notif.id}
                              className={`p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                                notif.is_read
                                  ? 'bg-slate-950/30 border-slate-800/80 text-slate-400'
                                  : 'bg-indigo-950/20 border-indigo-500/40 text-slate-100'
                              }`}
                            >
                              <div className="flex items-start gap-3 min-w-0">
                                <div
                                  className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                                    notif.is_read
                                      ? 'bg-slate-800 text-slate-400'
                                      : 'bg-indigo-500/20 text-indigo-300'
                                  }`}
                                >
                                  <EventIcon className="w-4 h-4" />
                                </div>

                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-bold text-slate-100">
                                      {notif.title}
                                    </span>
                                    {!notif.is_read && (
                                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                        Nova
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-300 break-words">
                                    {notif.message}
                                  </p>
                                  <div className="text-[10px] text-slate-500">
                                    {new Date(notif.created_at).toLocaleString('pt-BR')}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {notif.card_id && notif.board_id && onNavigateToCard && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!notif.is_read) handleMarkRead(notif.id);
                                      onNavigateToCard(notif.board_id!, notif.card_id!);
                                      onClose();
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition"
                                    title="Ir para o cartão"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </button>
                                )}

                                {!notif.is_read && (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkRead(notif.id)}
                                    className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition"
                                    title="Marcar como lida"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'digest' ? (
            /* ABA RESUMO PERIÓDICO / DIGEST (NT-03) */
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-white">Resumo Periódico de Atividades</h4>
                  <p className="text-[11px] text-slate-400">
                    Consolidado de eventos e atividades dos cartões e quadros que você acompanha
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDigestPeriod('daily')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      digestPeriod === 'daily'
                        ? 'bg-cyan-600 text-white shadow'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Diário (24h)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDigestPeriod('weekly')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      digestPeriod === 'weekly'
                        ? 'bg-cyan-600 text-white shadow'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Semanal (7 dias)
                  </button>
                </div>
              </div>

              {digestLoading ? (
                <div className="text-center py-12 text-xs text-slate-500">
                  Gerando consolidado de atividades...
                </div>
              ) : digestData ? (
                <div className="space-y-4">
                  {/* Cards de Métricas do Digest */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div className="text-[11px] text-slate-400">Total de Eventos</div>
                      <div className="text-xl font-bold text-cyan-400 mt-1">{digestData.summary.totalNotifications}</div>
                    </div>
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div className="text-[11px] text-slate-400">Cartões Movidos</div>
                      <div className="text-xl font-bold text-emerald-400 mt-1">
                        {digestData.summary.movesCount}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div className="text-[11px] text-slate-400">Comentários</div>
                      <div className="text-xl font-bold text-indigo-400 mt-1">
                        {digestData.summary.commentsCount}
                      </div>
                    </div>
                    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div className="text-[11px] text-slate-400">Menções a Você</div>
                      <div className="text-xl font-bold text-amber-400 mt-1">
                        {digestData.summary.mentionsCount}
                      </div>
                    </div>
                  </div>

                  {/* Destaques Recentes */}
                  <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Destaques de Atividades no Período ({digestData.highlights.length})
                    </div>
                    {digestData.highlights.length === 0 ? (
                      <p className="text-xs text-slate-500 py-2">Sem movimentações relevantes no período.</p>
                    ) : (
                      <div className="divide-y divide-slate-800/80 max-h-48 overflow-y-auto">
                        {digestData.highlights.map(h => (
                          <div key={h.id} className="py-2 text-xs space-y-0.5">
                            <div className="flex items-center justify-between text-slate-200">
                              <span className="font-semibold">{h.title}</span>
                              <span className="text-[10px] text-slate-500">
                                {new Date(h.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">{h.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            /* ABA PREFERÊNCIAS, CANAIS, DND E SILÊNCIO (NT-01, NT-05) */
            <div className="space-y-5">
              {successMsg && (
                <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs">
                  {successMsg}
                </div>
              )}

              {/* NT-05: Seção de Horário de Silêncio e Modo Não Perturbe */}
              {settings && (
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                    <Moon className="w-4 h-4" />
                    <span>Modo Não Perturbe & Horário de Silêncio</span>
                  </div>

                  <div className="space-y-3">
                    {/* DND Toggle */}
                    <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl">
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5">
                          <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                          <span>Modo Não Perturbe (DND)</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Pausa temporariamente o envio de todas as notificações na plataforma e por e-mail.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.dnd_enabled}
                        onChange={e => setSettings({ ...settings, dnd_enabled: e.target.checked })}
                        className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                      />
                    </div>

                    {/* Horário de Silêncio */}
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Horário de Silêncio Programado</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Silencia alertas automáticos diariamente durante a janela configurada.
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.quiet_hours_enabled}
                          onChange={e => setSettings({ ...settings, quiet_hours_enabled: e.target.checked })}
                          className="w-4 h-4 rounded text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                        />
                      </div>

                      {settings.quiet_hours_enabled && (
                        <div className="flex items-center gap-3 pt-2 border-t border-slate-800 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">De:</span>
                            <input
                              type="time"
                              value={settings.quiet_hours_start}
                              onChange={e => setSettings({ ...settings, quiet_hours_start: e.target.value })}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400">Até:</span>
                            <input
                              type="time"
                              value={settings.quiet_hours_end}
                              onChange={e => setSettings({ ...settings, quiet_hours_end: e.target.value })}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-200"
                            />
                          </div>
                          <span className="text-[10px] text-slate-500 ml-auto">(horário local)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* NT-01: Tabela de Preferências por Evento & Canal */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                  Preferências por Evento e Canal
                </div>

                <div className="border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800 bg-slate-950/40">
                  {preferences.map(pref => {
                    const meta = EVENT_TYPE_META[pref.event_type] || {
                      label: pref.event_type,
                      description: '',
                      Icon: Bell,
                    };
                    const EventIcon = meta.Icon;

                    return (
                      <div
                        key={pref.event_type}
                        className="p-3.5 flex items-center justify-between gap-4 text-xs"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="p-1.5 bg-slate-800 text-indigo-400 rounded-lg mt-0.5">
                            <EventIcon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-200">{meta.label}</div>
                            <div className="text-[11px] text-slate-400">{meta.description}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
                            <input
                              type="checkbox"
                              checked={pref.channel_in_app}
                              onChange={() => handleTogglePreference(pref.event_type, 'channel_in_app')}
                              className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>No App</span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
                            <input
                              type="checkbox"
                              checked={pref.channel_email}
                              onChange={() => handleTogglePreference(pref.event_type, 'channel_email')}
                              className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>E-mail</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSavePreferences}
                  disabled={savingPrefs}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition"
                >
                  {savingPrefs ? 'Salvando...' : 'Salvar Preferências'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
