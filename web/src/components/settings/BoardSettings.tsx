import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Lock,
  Globe,
  Users,
  UserPlus,
  Trash2,
  Gauge,
  Bell,
  Archive,
  Share2,
  Copy,
  Check,
  AlertCircle,
  Save,
  Shield,
  Clock,
} from 'lucide-react';
import {
  Board,
  BoardMember,
  BoardRole,
  BoardVisibility,
  EstimateType,
  SubscriptionLevel,
  WorkspaceTeam,
  BoardTeamPermission,
} from '../../types';
import { api } from '../../api/client';

interface BoardSettingsProps {
  activeSubTab: 'general' | 'visibility' | 'members' | 'automations';
  board: Board | null;
  workspaceId?: string;
  userBoardRole?: BoardRole;
  onRefreshBoard?: () => Promise<void>;
  onSaveBoard?: (
    title: string,
    visibility: BoardVisibility,
    estimateType: EstimateType,
    autoArchiveDays?: number | null
  ) => Promise<void>;
}

export const BoardSettings: React.FC<BoardSettingsProps> = ({
  activeSubTab,
  board,
  workspaceId,
  userBoardRole = 'OWNER',
  onRefreshBoard,
  onSaveBoard,
}) => {
  const canEdit = userBoardRole === 'OWNER' || userBoardRole === 'EDITOR';
  const isOwner = userBoardRole === 'OWNER';

  // Geral
  const [title, setTitle] = useState(board?.title || '');
  const [visibility, setVisibility] = useState<BoardVisibility>(board?.visibility || 'WORKSPACE');
  const [estimateType, setEstimateType] = useState<EstimateType>(board?.estimate_type || 'POINTS');
  const [subscriptionLevel, setSubscriptionLevel] = useState<SubscriptionLevel>('MENTIONS');
  const [autoArchiveDays, setAutoArchiveDays] = useState<string>(
    board?.auto_archive_days !== null && board?.auto_archive_days !== undefined
      ? String(board.auto_archive_days)
      : ''
  );
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalMsg, setGeneralMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Membros do Quadro
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<BoardRole>('EDITOR');
  const [memberMsg, setMemberMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Equipes vinculadas ao Quadro (PM-01)
  const [boardTeams, setBoardTeams] = useState<BoardTeamPermission[]>([]);
  const [workspaceTeams, setWorkspaceTeams] = useState<WorkspaceTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedTeamRole, setSelectedTeamRole] = useState<BoardRole>('EDITOR');
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamMsg, setTeamMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Compartilhamento Público (PM-03)
  const [publicToken, setPublicToken] = useState<string | null>(board?.public_share_token || null);
  const [publicExpiresAt, setPublicExpiresAt] = useState<string | null>(board?.public_share_expires_at || null);
  const [publicExpiresDays, setPublicExpiresDays] = useState<number>(7);
  const [publicLoading, setPublicLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [publicMsg, setPublicMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Automação (BD-08)
  const [archivingLoading, setArchivingLoading] = useState(false);
  const [archiveMsg, setArchiveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (board) {
      setTitle(board.title);
      setVisibility(board.visibility || 'WORKSPACE');
      setEstimateType(board.estimate_type || 'POINTS');
      setAutoArchiveDays(
        board.auto_archive_days !== null && board.auto_archive_days !== undefined
          ? String(board.auto_archive_days)
          : ''
      );
      setPublicToken(board.public_share_token || null);
      setPublicExpiresAt(board.public_share_expires_at || null);

      if (activeSubTab === 'general') {
        loadSubscription(board.id);
      }
      if (activeSubTab === 'members') {
        loadMembers(board.id);
        if (workspaceId) loadTeams(board.id, workspaceId);
      }
    }
  }, [board?.id, activeSubTab]);

  const loadSubscription = async (bId: string) => {
    try {
      const sub = await api.getSubscription('BOARD', bId);
      if (sub?.level) setSubscriptionLevel(sub.level);
    } catch {
      // Ignora erro se não houver inscrição
    }
  };

  const loadMembers = async (bId: string) => {
    try {
      setMembersLoading(true);
      const data = await api.getBoardMembers(bId);
      setMembers(data);
    } catch (err: any) {
      setMemberMsg({ type: 'error', text: err.message || 'Falha ao carregar membros do quadro.' });
    } finally {
      setMembersLoading(false);
    }
  };

  const loadTeams = async (bId: string, wsId: string) => {
    try {
      setTeamsLoading(true);
      const [bTeams, wsTeams] = await Promise.all([
        api.getBoardTeams(bId),
        api.getWorkspaceTeams(wsId),
      ]);
      setBoardTeams(bTeams);
      setWorkspaceTeams(wsTeams);
    } catch (err: any) {
      setTeamMsg({ type: 'error', text: err.message || 'Falha ao carregar equipes do quadro.' });
    } finally {
      setTeamsLoading(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !board) return;
    try {
      setGeneralLoading(true);
      setGeneralMsg(null);
      const days = autoArchiveDays.trim() ? parseInt(autoArchiveDays, 10) : null;
      if (onSaveBoard) {
        await onSaveBoard(title.trim(), visibility, estimateType, isNaN(days as any) ? null : days);
      }
      // Salva nível de inscrição
      await api.saveSubscription('BOARD', board.id, subscriptionLevel);
      setGeneralMsg({ type: 'success', text: 'Configurações do quadro salvas com sucesso!' });
      if (onRefreshBoard) onRefreshBoard();
    } catch (err: any) {
      setGeneralMsg({ type: 'error', text: err.message || 'Falha ao salvar quadro.' });
    } finally {
      setGeneralLoading(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!board || !newMemberEmail.trim()) return;
    try {
      setMemberMsg(null);
      await api.addBoardMember(board.id, {
        email: newMemberEmail.trim(),
        name: newMemberName.trim() || undefined,
        role: newMemberRole,
      });
      setNewMemberEmail('');
      setNewMemberName('');
      setMemberMsg({ type: 'success', text: 'Membro adicionado ao quadro!' });
      await loadMembers(board.id);
    } catch (err: any) {
      setMemberMsg({ type: 'error', text: err.message || 'Falha ao adicionar membro ao quadro.' });
    }
  };

  const handleChangeMemberRole = async (userId: string, role: BoardRole) => {
    if (!board) return;
    try {
      setMemberMsg(null);
      await api.updateBoardMemberRole(board.id, userId, role);
      setMemberMsg({ type: 'success', text: 'Papel no quadro atualizado!' });
      await loadMembers(board.id);
    } catch (err: any) {
      setMemberMsg({ type: 'error', text: err.message || 'Falha ao alterar papel.' });
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!board || !window.confirm('Tem certeza que deseja remover este membro do quadro?')) return;
    try {
      setMemberMsg(null);
      await api.removeBoardMember(board.id, userId);
      setMemberMsg({ type: 'success', text: 'Membro removido do quadro.' });
      await loadMembers(board.id);
    } catch (err: any) {
      setMemberMsg({ type: 'error', text: err.message || 'Falha ao remover membro.' });
    }
  };

  const handleSetTeamRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!board || !selectedTeamId) return;
    try {
      setTeamMsg(null);
      await api.assignBoardTeam(board.id, {
        teamId: selectedTeamId,
        role: selectedTeamRole,
      });
      setSelectedTeamId('');
      setTeamMsg({ type: 'success', text: 'Permissão da equipe concedida no quadro!' });
      if (workspaceId) await loadTeams(board.id, workspaceId);
    } catch (err: any) {
      setTeamMsg({ type: 'error', text: err.message || 'Falha ao vincular equipe.' });
    }
  };

  const handleRemoveBoardTeam = async (teamId: string) => {
    if (!board || !window.confirm('Remover acesso desta equipe ao quadro?')) return;
    try {
      setTeamMsg(null);
      await api.removeBoardTeam(board.id, teamId);
      setTeamMsg({ type: 'success', text: 'Acesso da equipe revogado.' });
      if (workspaceId) await loadTeams(board.id, workspaceId);
    } catch (err: any) {
      setTeamMsg({ type: 'error', text: err.message || 'Falha ao remover equipe do quadro.' });
    }
  };

  const handleGeneratePublicToken = async () => {
    if (!board) return;
    try {
      setPublicLoading(true);
      setPublicMsg(null);
      const res = await api.createPublicLink(board.id, publicExpiresDays);
      setPublicToken(res.public_share_token);
      setPublicExpiresAt(res.public_share_expires_at);
      setPublicMsg({ type: 'success', text: 'Link público gerado com sucesso!' });
      if (onRefreshBoard) onRefreshBoard();
    } catch (err: any) {
      setPublicMsg({ type: 'error', text: err.message || 'Falha ao gerar link público.' });
    } finally {
      setPublicLoading(false);
    }
  };

  const handleRevokePublicToken = async () => {
    if (!board || !window.confirm('Deseja realmente revogar o link público? O acesso externo será bloqueado imediatamente.'))
      return;
    try {
      setPublicLoading(true);
      setPublicMsg(null);
      await api.revokePublicLink(board.id);
      setPublicToken(null);
      setPublicExpiresAt(null);
      setPublicMsg({ type: 'success', text: 'Link público revogado com sucesso.' });
      if (onRefreshBoard) onRefreshBoard();
    } catch (err: any) {
      setPublicMsg({ type: 'error', text: err.message || 'Falha ao revogar link.' });
    } finally {
      setPublicLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!publicToken) return;
    const url = `${window.location.origin}/public/${publicToken}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleRunAutoArchive = async () => {
    if (!board) return;
    try {
      setArchivingLoading(true);
      setArchiveMsg(null);
      const days = autoArchiveDays.trim() ? parseInt(autoArchiveDays, 10) : undefined;
      const res = await api.autoArchiveCards(board.id, days);
      setArchiveMsg({
        type: 'success',
        text: `Rotina executada: ${res.archivedCount} cartão(ões) arquivado(s).`,
      });
      if (onRefreshBoard) onRefreshBoard();
    } catch (err: any) {
      setArchiveMsg({ type: 'error', text: err.message || 'Falha ao executar arquivamento.' });
    } finally {
      setArchivingLoading(false);
    }
  };

  if (!board) {
    return (
      <div className="p-8 text-center text-slate-400 text-xs">
        Nenhum quadro selecionado.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {!canEdit && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Você possui papel de <strong>{userBoardRole}</strong> neste Quadro. Apenas Proprietários e
            Editores podem modificar estas configurações.
          </span>
        </div>
      )}

      {/* 1. GERAL */}
      {activeSubTab === 'general' && (
        <form onSubmit={handleSaveGeneral} className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-emerald-400" />
              Geral & Estimativas do Quadro
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Defina o nome do projeto, padrão de esforço (pontos/horas) e sua inscrição de notificações.
            </p>
          </div>

          {generalMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                generalMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {generalMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{generalMsg.text}</span>
            </div>
          )}

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Título do Quadro
              </label>
              <input
                type="text"
                required
                disabled={!canEdit}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Sprint 12, Roadmap Q3, Kanban Operacional"
                className="w-full bg-slate-900 border border-slate-700 disabled:opacity-50 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  Métrica de Estimativa
                </label>
                <select
                  disabled={!canEdit}
                  value={estimateType}
                  onChange={e => setEstimateType(e.target.value as EstimateType)}
                  className="w-full bg-slate-900 border border-slate-700 disabled:opacity-50 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="POINTS">Story Points (1, 2, 3, 5, 8, 13...)</option>
                  <option value="HOURS">Horas de Esforço (ex: 4h, 8h)</option>
                  <option value="TSHIRT">Tamanhos de Camiseta (PP, P, M, G, GG)</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Altera a unidade de esforço exibida nos cartões deste quadro.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  Sua Inscrição no Quadro
                </label>
                <select
                  value={subscriptionLevel}
                  onChange={e => setSubscriptionLevel(e.target.value as SubscriptionLevel)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ALL">Todas as atividades deste quadro</option>
                  <option value="MENTIONS">Apenas quando eu for mencionado ou atribuído</option>
                  <option value="NONE">Não receber notificações deste quadro</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Filtro pessoal de notificações para este quadro específico.
                </p>
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={generalLoading}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow"
              >
                <Save className="w-4 h-4" />
                <span>{generalLoading ? 'Salvando...' : 'Salvar Informações'}</span>
              </button>
            </div>
          )}
        </form>
      )}

      {/* 2. VISIBILIDADE E COMPARTILHAMENTO PÚBLICO */}
      {activeSubTab === 'visibility' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Share2 className="w-5 h-5 text-emerald-400" />
              Visibilidade & Compartilhamento Externo
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Controle quem tem acesso dentro do workspace e configure links somente-leitura para clientes e parceiros externos.
            </p>
          </div>

          {publicMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                publicMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {publicMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{publicMsg.text}</span>
            </div>
          )}

          {/* Visibilidade Interna (BD-03) */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Visibilidade Interna no Workspace
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                  visibility === 'WORKSPACE'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="visibility"
                  disabled={!canEdit}
                  checked={visibility === 'WORKSPACE'}
                  onChange={() => setVisibility('WORKSPACE')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="font-bold flex items-center gap-1.5 text-slate-100">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" /> Visível ao Workspace
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Qualquer membro do workspace pode ver e acessar este quadro.
                  </div>
                </div>
              </label>

              <label
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition ${
                  visibility === 'PRIVATE'
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="visibility"
                  disabled={!canEdit}
                  checked={visibility === 'PRIVATE'}
                  onChange={() => setVisibility('PRIVATE')}
                  className="mt-0.5 text-amber-500 focus:ring-amber-500"
                />
                <div>
                  <div className="font-bold flex items-center gap-1.5 text-slate-100">
                    <Lock className="w-3.5 h-3.5 text-amber-400" /> Quadro Privado
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Apenas membros convidados explicitamente têm acesso a este quadro.
                  </div>
                </div>
              </label>
            </div>

            {canEdit && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    if (onSaveBoard) {
                      await onSaveBoard(title, visibility, estimateType);
                      setPublicMsg({ type: 'success', text: 'Visibilidade atualizada com sucesso!' });
                    }
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                >
                  Salvar Visibilidade
                </button>
              </div>
            )}
          </div>

          {/* Link Público Somente-Leitura (PM-03) */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-400" />
                  Link Público Somente-Leitura
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Permite que partes interessadas externas acompanhem o progresso em tempo real sem precisar de login.
                </p>
              </div>
              {publicToken && (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Link Ativo
                </span>
              )}
            </div>

            {publicToken ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/public/${publicToken}`}
                    className="bg-transparent text-slate-200 text-xs w-full focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-2.5 py-1 rounded transition shrink-0"
                  >
                    {copiedLink ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedLink ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Expira em:{' '}
                    <strong className="text-slate-200">
                      {publicExpiresAt
                        ? new Date(publicExpiresAt).toLocaleDateString('pt-BR')
                        : 'Nunca'}
                    </strong>
                  </span>
                  {isOwner && (
                    <button
                      type="button"
                      disabled={publicLoading}
                      onClick={handleRevokePublicToken}
                      className="text-rose-400 hover:text-rose-300 underline font-medium"
                    >
                      Revogar link público
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-400">Duração do link:</label>
                  <select
                    value={publicExpiresDays}
                    onChange={e => setPublicExpiresDays(Number(e.target.value))}
                    disabled={!isOwner}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value={1}>1 dia</option>
                    <option value={7}>7 dias (1 semana)</option>
                    <option value={30}>30 dias (1 mês)</option>
                    <option value={90}>90 dias (3 meses)</option>
                  </select>
                  {isOwner && (
                    <button
                      type="button"
                      disabled={publicLoading}
                      onClick={handleGeneratePublicToken}
                      className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg transition"
                    >
                      {publicLoading ? 'Gerando...' : 'Gerar Link Público'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. MEMBROS E EQUIPES DO QUADRO */}
      {activeSubTab === 'members' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              Membros e Equipes do Quadro
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Atribua papéis individuais e permissões por equipe para este quadro.
            </p>
          </div>

          {memberMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                memberMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {memberMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{memberMsg.text}</span>
            </div>
          )}

          {canEdit && (
            <form
              onSubmit={handleInviteMember}
              className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
                Adicionar Membro ao Quadro
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="email"
                  required
                  placeholder="E-mail do membro *"
                  value={newMemberEmail}
                  onChange={e => setNewMemberEmail(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Nome (opcional)"
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <div className="flex gap-2">
                  <select
                    value={newMemberRole}
                    onChange={e => setNewMemberRole(e.target.value as BoardRole)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 flex-1"
                  >
                    <option value="EDITOR">Editor</option>
                    <option value="COMMENTER">Comentarista</option>
                    <option value="VIEWER">Leitor</option>
                    {isOwner && <option value="OWNER">Owner</option>}
                  </select>
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg transition shrink-0"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Lista de Membros */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Membro</span>
              <span>Papel no Quadro</span>
            </div>

            {membersLoading ? (
              <div className="p-6 text-center text-slate-400 text-xs">Carregando membros...</div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {members.map(m => (
                  <div
                    key={m.user_id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-slate-900/30 transition text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">
                        {m.user_name || 'Sem nome'}
                      </div>
                      <div className="text-[11px] text-slate-500">{m.user_email}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isOwner ? (
                        <select
                          value={m.role}
                          onChange={e =>
                            handleChangeMemberRole(m.user_id, e.target.value as BoardRole)
                          }
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="OWNER">Owner</option>
                          <option value="EDITOR">Editor</option>
                          <option value="COMMENTER">Comentarista</option>
                          <option value="VIEWER">Leitor</option>
                        </select>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium text-[11px]">
                          {m.role}
                        </span>
                      )}

                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.user_id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                          title="Remover do quadro"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Equipes vinculadas (PM-01) */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Equipes com Acesso ao Quadro
            </h3>

            {teamMsg && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  teamMsg.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <span>{teamMsg.text}</span>
              </div>
            )}

            {isOwner && workspaceTeams.length > 0 && (
              <form onSubmit={handleSetTeamRole} className="flex gap-2">
                <select
                  value={selectedTeamId}
                  onChange={e => setSelectedTeamId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 flex-1"
                >
                  <option value="">Selecione uma equipe do workspace...</option>
                  {workspaceTeams
                    .filter(wt => !boardTeams.some(bt => bt.team_id === wt.id))
                    .map(wt => (
                      <option key={wt.id} value={wt.id}>
                        {wt.name} ({wt.members_count || 0} membros)
                      </option>
                    ))}
                </select>
                <select
                  value={selectedTeamRole}
                  onChange={e => setSelectedTeamRole(e.target.value as BoardRole)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="EDITOR">Editor</option>
                  <option value="COMMENTER">Comentarista</option>
                  <option value="VIEWER">Leitor</option>
                </select>
                <button
                  type="submit"
                  disabled={!selectedTeamId}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg transition shrink-0"
                >
                  Conceder Acesso
                </button>
              </form>
            )}

            <div className="space-y-2">
              {teamsLoading ? (
                <div className="p-3 text-center text-slate-400 text-xs">Carregando equipes...</div>
              ) : boardTeams.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-3 text-center">
                  Nenhuma equipe atribuída diretamente a este quadro.
                </div>
              ) : (
                boardTeams.map(bt => (
                  <div
                    key={bt.team_id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{bt.team_name || 'Equipe'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-emerald-400 font-semibold text-[10px]">
                        {bt.role}
                      </span>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleRemoveBoardTeam(bt.team_id)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                          title="Remover acesso da equipe"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. AUTOMAÇÕES */}
      {activeSubTab === 'automations' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Archive className="w-5 h-5 text-emerald-400" />
              Automações & Limpeza
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Mantenha o quadro limpo arquivando tarefas concluídas após determinado período.
            </p>
          </div>

          {archiveMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                archiveMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {archiveMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{archiveMsg.text}</span>
            </div>
          )}

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Arquivamento Automático de Concluídos
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  Arquivar cartões da coluna de conclusão após (dias):
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    disabled={!canEdit}
                    placeholder="Ex: 30 (deixe em branco para desativar)"
                    value={autoArchiveDays}
                    onChange={e => setAutoArchiveDays(e.target.value)}
                    className="w-48 bg-slate-900 border border-slate-700 disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={async () => {
                        const days = autoArchiveDays.trim() ? parseInt(autoArchiveDays, 10) : null;
                        if (onSaveBoard) {
                          await onSaveBoard(title, visibility, estimateType, isNaN(days as any) ? null : days);
                          setArchiveMsg({ type: 'success', text: 'Regra de arquivamento salva!' });
                        }
                      }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                    >
                      Salvar Regra
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Cartões arquivados continuam acessíveis através do mecanismo de busca global.
                </p>
              </div>

              {canEdit && (
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">
                      Executar Limpeza Imediata
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Dispara a rotina agora para arquivar cartões elegíveis.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={archivingLoading}
                    onClick={handleRunAutoArchive}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                  >
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{archivingLoading ? 'Executando...' : 'Executar Agora'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
