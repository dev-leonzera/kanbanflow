import React, { useState, useEffect } from 'react';
import {
  User,
  Key,
  Bell,
  Check,
  AlertCircle,
  Save,
  Moon,
  Volume2,
  Mail,
  MessageSquare,
  AtSign,
  ArrowRightLeft,
  UserCheck,
  Paperclip,
  CheckCheck,
  Clock,
} from 'lucide-react';
import {
  NotificationPreference,
  NotificationEventType,
  NotificationSettings,
  NotificationDigest,
} from '../../types';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface UserSettingsProps {
  activeSubTab: 'profile' | 'notifications' | 'digest';
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
    description: 'Quando tarefas ou bloqueios que travavam seu cartão são concluídos.',
    Icon: CheckCheck,
  },
};

export const UserSettings: React.FC<UserSettingsProps> = ({
  activeSubTab,
  onNotificationsUpdated,
}) => {
  const { user, refreshUser } = useAuth();

  // Profile Form State
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notification Preferences State
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMsg, setNotifMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Digest State
  const [digestPeriod, setDigestPeriod] = useState<'daily' | 'weekly'>('daily');
  const [digestData, setDigestData] = useState<NotificationDigest | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);

  useEffect(() => {
    if (user?.name) {
      setName(user.name);
    }
  }, [user]);

  useEffect(() => {
    if (activeSubTab === 'notifications' || activeSubTab === 'digest') {
      loadNotifData();
    }
  }, [activeSubTab]);

  const loadNotifData = async () => {
    try {
      setNotifLoading(true);
      const [prefs, stg] = await Promise.all([
        api.getNotificationPreferences(),
        api.getNotificationSettings(),
      ]);
      setPreferences(prefs);
      setNotifSettings(stg);
      if (activeSubTab === 'digest') {
        loadDigest(digestPeriod);
      }
    } catch (err: any) {
      setNotifMsg({ type: 'error', text: err.message || 'Falha ao carregar preferências de notificação.' });
    } finally {
      setNotifLoading(false);
    }
  };

  const loadDigest = async (period: 'daily' | 'weekly') => {
    try {
      setDigestLoading(true);
      const data = await api.getNotificationDigest(period);
      setDigestData(data);
    } catch (err: any) {
      console.error('Falha ao carregar digest:', err);
    } finally {
      setDigestLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);

    if (newPassword && newPassword !== confirmPassword) {
      setProfileMsg({ type: 'error', text: 'A confirmação da nova senha não confere.' });
      return;
    }

    try {
      setProfileLoading(true);
      await api.updateProfile({
        name: name.trim(),
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });
      await refreshUser();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setProfileMsg({ type: 'success', text: 'Perfil atualizado com sucesso!' });
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err.message || 'Erro ao atualizar perfil.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleToggleChannel = (eventType: NotificationEventType, channel: 'in_app' | 'email') => {
    setPreferences(prev =>
      prev.map(p => {
        if (p.event_type === eventType) {
          return {
            ...p,
            channel_in_app: channel === 'in_app' ? !p.channel_in_app : p.channel_in_app,
            channel_email: channel === 'email' ? !p.channel_email : p.channel_email,
          };
        }
        return p;
      })
    );
  };

  const handleSavePreferences = async () => {
    try {
      setNotifSaving(true);
      setNotifMsg(null);
      await api.saveNotificationPreferences(
        preferences.map(p => ({
          event_type: p.event_type,
          channel_in_app: p.channel_in_app,
          channel_email: p.channel_email,
        }))
      );
      if (notifSettings) {
        await api.updateNotificationSettings(notifSettings);
      }
      setNotifMsg({ type: 'success', text: 'Preferências de notificação salvas com sucesso!' });
      if (onNotificationsUpdated) onNotificationsUpdated();
    } catch (err: any) {
      setNotifMsg({ type: 'error', text: err.message || 'Falha ao salvar preferências.' });
    } finally {
      setNotifSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* 1. ABA PERFIL */}
      {activeSubTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <User className="w-5 h-5 text-indigo-400" />
              Perfil & Minha Conta
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Atualize seus dados cadastrais e credenciais de acesso.
            </p>
          </div>

          {profileMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                profileMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {profileMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{profileMsg.text}</span>
            </div>
          )}

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                E-mail (Identificador)
              </label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-400 cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                O e-mail é utilizado para login e identificação nos workspaces.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Nome de Exibição
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Seu nome completo ou apelido"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <Key className="w-4 h-4 text-amber-400" />
              Alterar Senha de Acesso
            </h3>
            <p className="text-[11px] text-slate-400">
              Deixe em branco caso não queira alterar sua senha atual.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Senha Atual
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Nova Senha
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres (letras e números)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Confirmar Nova Senha
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={profileLoading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow"
            >
              <Save className="w-4 h-4" />
              <span>{profileLoading ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </form>
      )}

      {/* 2. ABA NOTIFICAÇÕES */}
      {activeSubTab === 'notifications' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-indigo-400" />
              Canais e Eventos de Notificação
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Escolha detalhadamente como e quando deseja receber alertas para cada tipo de atividade.
            </p>
          </div>

          {notifMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                notifMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {notifMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{notifMsg.text}</span>
            </div>
          )}

          {notifLoading ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Carregando preferências...
            </div>
          ) : (
            <div className="space-y-5">
              {/* Tabela de Eventos */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-400">
                  <span>Tipo de Atividade</span>
                  <div className="flex items-center gap-6 pr-2">
                    <span className="w-16 text-center">No App</span>
                    <span className="w-16 text-center">E-mail</span>
                  </div>
                </div>

                <div className="divide-y divide-slate-800/60">
                  {preferences.map(pref => {
                    const meta = EVENT_TYPE_META[pref.event_type] || {
                      label: pref.event_type,
                      description: '',
                      Icon: Bell,
                    };
                    const IconComponent = meta.Icon;

                    return (
                      <div
                        key={pref.event_type}
                        className="px-4 py-3 flex items-center justify-between hover:bg-slate-900/30 transition"
                      >
                        <div className="flex items-start gap-3 max-w-md">
                          <div className="p-2 rounded-lg bg-slate-800/60 text-indigo-400 shrink-0 mt-0.5">
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-slate-200">
                              {meta.label}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {meta.description}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 pr-2">
                          <label className="w-16 flex justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={pref.channel_in_app}
                              onChange={() => handleToggleChannel(pref.event_type, 'in_app')}
                              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                            />
                          </label>
                          <label className="w-16 flex justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={pref.channel_email}
                              onChange={() => handleToggleChannel(pref.event_type, 'email')}
                              className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Configurações Globais de Notificação */}
              {notifSettings && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Não Perturbe & Horário de Silêncio (NT-05)
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition">
                      <input
                        type="checkbox"
                        checked={notifSettings.dnd_enabled}
                        onChange={e =>
                          setNotifSettings({ ...notifSettings, dnd_enabled: e.target.checked })
                        }
                        className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <div>
                        <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                          Modo Não Perturbe (DND)
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Pausa temporariamente o envio de alertas visuais e e-mails.
                        </div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition">
                      <input
                        type="checkbox"
                        checked={notifSettings.quiet_hours_enabled}
                        onChange={e =>
                          setNotifSettings({
                            ...notifSettings,
                            quiet_hours_enabled: e.target.checked,
                          })
                        }
                        className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <div>
                        <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                          <Moon className="w-3.5 h-3.5 text-indigo-400" />
                          Horário Silencioso
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Silenciar alertas entre {notifSettings.quiet_hours_start || '22:00'} e {notifSettings.quiet_hours_end || '08:00'}.
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* TM-04: Cronômetro Automático ao Mover Cartão */}
                  <div className="pt-3 border-t border-slate-800/80">
                    <label className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition">
                      <input
                        type="checkbox"
                        checked={Boolean(notifSettings.auto_timer_enabled)}
                        onChange={e =>
                          setNotifSettings({
                            ...notifSettings,
                            auto_timer_enabled: e.target.checked,
                          })
                        }
                        className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
                      />
                      <div>
                        <div className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          Cronômetro Automático ao Mover Tarefas (TM-04)
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Inicia automaticamente o cronômetro do cartão quando você mover uma tarefa atribuída a você para uma coluna em progresso, e encerra o cronômetro salvando as horas quando movida para conclusão.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSavePreferences}
                  disabled={notifSaving}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow"
                >
                  <Save className="w-4 h-4" />
                  <span>{notifSaving ? 'Salvando...' : 'Salvar Preferências'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. ABA DIGEST */}
      {activeSubTab === 'digest' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-400" />
              Resumo Periódico (Digest)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Receba um compilado consolidado com os principais acontecimentos dos seus quadros.
            </p>
          </div>

          {notifSettings && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-xs font-bold text-slate-200">
                    Frequência de Envio por E-mail
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Selecione a frequência do envio consolidado.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {(['NONE', 'DAILY', 'WEEKLY'] as const).map(freq => (
                  <label
                    key={freq}
                    className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition ${
                      notifSettings.digest_frequency === freq
                        ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300 font-bold'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="digestFreq"
                      checked={notifSettings.digest_frequency === freq}
                      onChange={async () => {
                        const updated = {
                          ...notifSettings,
                          digest_frequency: freq,
                        };
                        setNotifSettings(updated);
                        await api.updateNotificationSettings(updated);
                      }}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      {freq === 'NONE' && 'Desativado'}
                      {freq === 'DAILY' && 'Diário (Manhã)'}
                      {freq === 'WEEKLY' && 'Semanal (Segunda)'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Prévia do Digest */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Prévia do Conteúdo Consolidado
              </h3>
              <div className="flex items-center bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setDigestPeriod('daily');
                    loadDigest('daily');
                  }}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    digestPeriod === 'daily'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Diário (24h)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDigestPeriod('weekly');
                    loadDigest('weekly');
                  }}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    digestPeriod === 'weekly'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Semanal (7d)
                </button>
              </div>
            </div>

            {digestLoading ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                Gerando prévia do digest...
              </div>
            ) : digestData ? (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                    <div className="text-slate-400 text-[11px]">Total Eventos</div>
                    <div className="text-lg font-bold text-white mt-0.5">
                      {digestData.summary.totalNotifications}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                    <div className="text-slate-400 text-[11px]">Menções</div>
                    <div className="text-lg font-bold text-amber-400 mt-0.5">
                      {digestData.summary.mentionsCount}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                    <div className="text-slate-400 text-[11px]">Movimentações</div>
                    <div className="text-lg font-bold text-indigo-400 mt-0.5">
                      {digestData.summary.movesCount}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                    <div className="text-slate-400 text-[11px]">Comentários</div>
                    <div className="text-lg font-bold text-emerald-400 mt-0.5">
                      {digestData.summary.commentsCount}
                    </div>
                  </div>
                </div>

                {digestData.highlights && digestData.highlights.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Destaques Recentes ({digestData.highlights.length})
                    </div>
                    <div className="divide-y divide-slate-800 bg-slate-900/40 border border-slate-800 rounded-lg max-h-40 overflow-y-auto">
                      {digestData.highlights.map(h => (
                        <div key={h.id} className="p-2.5 text-[11px]">
                          <div className="font-semibold text-slate-200">{h.title}</div>
                          <div className="text-slate-400">{h.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic p-3 text-center">
                Nenhum dado recente encontrado para este período.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
