import React, { useState, useEffect } from 'react';
import {
  X,
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
} from 'lucide-react';
import {
  BoardMember,
  BoardRole,
  BoardVisibility,
  EstimateType,
  SubscriptionLevel,
  WorkspaceTeam,
  BoardTeamPermission,
} from '../types';
import { api } from '../api/client';

interface BoardModalProps {
  isOpen: boolean;
  mode?: 'create' | 'manage';
  boardId?: string;
  workspaceId?: string;
  initialTitle?: string;
  initialVisibility?: BoardVisibility;
  initialEstimateType?: EstimateType;
  initialAutoArchiveDays?: number | null;
  initialPublicToken?: string | null;
  initialPublicExpiresAt?: string | null;
  userBoardRole?: BoardRole;
  onClose: () => void;
  onSave: (
    title: string,
    visibility: BoardVisibility,
    estimateType: EstimateType,
    autoArchiveDays?: number | null
  ) => Promise<void>;
}

export const BoardModal: React.FC<BoardModalProps> = ({
  isOpen,
  mode = 'create',
  boardId,
  workspaceId,
  initialTitle = '',
  initialVisibility = 'WORKSPACE',
  initialEstimateType = 'POINTS',
  initialAutoArchiveDays = null,
  initialPublicToken = null,
  initialPublicExpiresAt = null,
  userBoardRole = 'OWNER',
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'public'>('general');
  const [boardTitle, setBoardTitle] = useState(initialTitle);
  const [visibility, setVisibility] = useState<BoardVisibility>(initialVisibility);
  const [estimateType, setEstimateType] = useState<EstimateType>(initialEstimateType);
  const [subscriptionLevel, setSubscriptionLevel] = useState<SubscriptionLevel>('MENTIONS');
  const [autoArchiveDays, setAutoArchiveDays] = useState<string>(
    initialAutoArchiveDays !== null && initialAutoArchiveDays !== undefined ? String(initialAutoArchiveDays) : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Membros Usuários do Quadro (BD-02, BD-05)
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<BoardRole>('EDITOR');

  // Equipes com acesso ao Quadro (PM-01)
  const [boardTeams, setBoardTeams] = useState<BoardTeamPermission[]>([]);
  const [workspaceTeams, setWorkspaceTeams] = useState<WorkspaceTeam[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedTeamRole, setSelectedTeamRole] = useState<BoardRole>('EDITOR');

  // Compartilhamento Público (PM-03)
  const [publicToken, setPublicToken] = useState<string | null>(initialPublicToken);
  const [publicExpiresAt, setPublicExpiresAt] = useState<string | null>(initialPublicExpiresAt);
  const [publicExpiresDays, setPublicExpiresDays] = useState<number>(7);
  const [publicLoading, setPublicLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Arquivamento Automático (BD-08)
  const [archivingLoading, setArchivingLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setBoardTitle(initialTitle);
      setVisibility(initialVisibility || 'WORKSPACE');
      setEstimateType(initialEstimateType || 'POINTS');
      setAutoArchiveDays(
        initialAutoArchiveDays !== null && initialAutoArchiveDays !== undefined
          ? String(initialAutoArchiveDays)
          : ''
      );
      setPublicToken(initialPublicToken);
      setPublicExpiresAt(initialPublicExpiresAt);
      setError(null);
      setSuccessMsg(null);
      setActiveTab('general');
      if (mode === 'manage' && boardId) {
        loadBoardMembers(boardId);
        loadBoardSubscription(boardId);
        loadTeamsData(boardId, workspaceId);
      }
    }
  }, [
    isOpen,
    initialTitle,
    initialVisibility,
    initialEstimateType,
    initialAutoArchiveDays,
    initialPublicToken,
    initialPublicExpiresAt,
    mode,
    boardId,
    workspaceId,
  ]);

  const loadBoardMembers = async (bId: string) => {
    try {
      setMembersLoading(true);
      const list = await api.getBoardMembers(bId);
      setMembers(list);
    } catch (err) {
      console.error('Erro ao carregar membros do quadro:', err);
    } finally {
      setMembersLoading(false);
    }
  };

  const loadBoardSubscription = async (bId: string) => {
    try {
      const sub = await api.getSubscription('BOARD', bId);
      setSubscriptionLevel(sub.level || 'MENTIONS');
    } catch (err) {
      console.error('Erro ao carregar inscrição do quadro:', err);
    }
  };

  const loadTeamsData = async (bId: string, wsId?: string) => {
    try {
      const bTeams = await api.getBoardTeams(bId);
      setBoardTeams(bTeams);
      if (wsId) {
        const wsTeams = await api.getWorkspaceTeams(wsId);
        setWorkspaceTeams(wsTeams);
        if (wsTeams.length > 0) {
          setSelectedTeamId(wsTeams[0].id);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar equipes do quadro:', err);
    }
  };

  const handleBoardSubscriptionChange = async (level: SubscriptionLevel) => {
    if (!boardId) return;
    try {
      setError(null);
      setSuccessMsg(null);
      await api.saveSubscription('BOARD', boardId, level);
      setSubscriptionLevel(level);
      setSuccessMsg('Nível de inscrição neste quadro atualizado!');
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar inscrição no quadro.');
    }
  };

  const handleTriggerAutoArchive = async () => {
    if (!boardId) return;
    setArchivingLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const days = autoArchiveDays.trim() ? parseInt(autoArchiveDays.trim(), 10) : undefined;
      const res = await api.autoArchiveCards(boardId, days);
      setSuccessMsg(`Sucesso! ${res.archivedCount} cartão(ões) arquivado(s).`);
    } catch (err: any) {
      setError(err.message || 'Falha ao executar arquivamento.');
    } finally {
      setArchivingLoading(false);
    }
  };

  const handleGeneratePublicLink = async () => {
    if (!boardId) return;
    setPublicLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.createPublicLink(boardId, publicExpiresDays > 0 ? publicExpiresDays : undefined);
      setPublicToken(res.public_share_token);
      setPublicExpiresAt(res.public_share_expires_at);
      setSuccessMsg('Link público somente leitura gerado com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Falha ao gerar link público.');
    } finally {
      setPublicLoading(false);
    }
  };

  const handleRevokePublicLink = async () => {
    if (!boardId) return;
    setPublicLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api.revokePublicLink(boardId);
      setPublicToken(null);
      setPublicExpiresAt(null);
      setSuccessMsg('Link público revogado.');
    } catch (err: any) {
      setError(err.message || 'Falha ao revogar link público.');
    } finally {
      setPublicLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!publicToken) return;
    const fullUrl = `${window.location.origin}/?publicToken=${publicToken}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleAssignTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardId || !selectedTeamId) return;
    setError(null);
    setSuccessMsg(null);
    try {
      await api.assignBoardTeam(boardId, {
        teamId: selectedTeamId,
        role: selectedTeamRole,
      });
      const bTeams = await api.getBoardTeams(boardId);
      setBoardTeams(bTeams);
      setSuccessMsg('Permissão de equipe atribuída ao quadro!');
    } catch (err: any) {
      setError(err.message || 'Falha ao atribuir permissão à equipe.');
    }
  };

  const handleRemoveBoardTeam = async (teamId: string) => {
    if (!boardId) return;
    setError(null);
    setSuccessMsg(null);
    try {
      await api.removeBoardTeam(boardId, teamId);
      setBoardTeams(boardTeams.filter(t => t.team_id !== teamId));
      setSuccessMsg('Permissão da equipe removida deste quadro.');
    } catch (err: any) {
      setError(err.message || 'Falha ao remover permissão da equipe.');
    }
  };

  if (!isOpen) return null;

  const canManageBoard = mode === 'create' || userBoardRole === 'OWNER';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardTitle.trim()) {
      setError('O título do quadro é obrigatório.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);
      const parsedArchiveDays = autoArchiveDays.trim() ? parseInt(autoArchiveDays.trim(), 10) : null;
      await onSave(boardTitle.trim(), visibility, estimateType, parsedArchiveDays);
      if (mode === 'create') {
        onClose();
      } else {
        setSuccessMsg('Configurações do quadro atualizadas!');
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar quadro.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBoardMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardId || !newMemberEmail.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);
      await api.addBoardMember(boardId, {
        email: newMemberEmail.trim(),
        name: newMemberName.trim() || undefined,
        role: newMemberRole,
      });
      setNewMemberEmail('');
      setNewMemberName('');
      setNewMemberRole('EDITOR');
      await loadBoardMembers(boardId);
      setSuccessMsg('Membro adicionado ao quadro com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Falha ao adicionar membro ao quadro.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeMemberRole = async (userId: string, role: BoardRole) => {
    if (!boardId) return;
    try {
      setError(null);
      setSuccessMsg(null);
      await api.updateBoardMemberRole(boardId, userId, role);
      await loadBoardMembers(boardId);
      setSuccessMsg('Papel no quadro atualizado!');
    } catch (err: any) {
      setError(err.message || 'Falha ao alterar papel no quadro.');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!boardId) return;
    try {
      setError(null);
      setSuccessMsg(null);
      await api.removeBoardMember(boardId, userId);
      await loadBoardMembers(boardId);
      setSuccessMsg('Membro removido do quadro.');
    } catch (err: any) {
      setError(err.message || 'Falha ao remover membro do quadro.');
    }
  };

  const getRoleLabel = (role: BoardRole) => {
    switch (role) {
      case 'OWNER':
        return 'Owner';
      case 'EDITOR':
        return 'Editor';
      case 'COMMENTER':
        return 'Comentarista';
      case 'VIEWER':
        return 'Leitor';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600/20 text-emerald-400 rounded-lg">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                {mode === 'create' ? 'Criar Novo Quadro' : `Configurações do Quadro`}
              </h3>
              {mode === 'manage' && (
                <span className="text-[11px] text-slate-400">
                  Seu papel neste quadro: <strong className="text-emerald-400">{getRoleLabel(userBoardRole)}</strong>
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas em modo manage */}
        {mode === 'manage' && (
          <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setActiveTab('general'); setError(null); setSuccessMsg(null); }}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'general'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Geral & Arquivamento</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('members'); setError(null); setSuccessMsg(null); }}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'members'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Membros & Equipes ({members.length})</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('public'); setError(null); setSuccessMsg(null); }}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
                activeTab === 'public'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Link Público</span>
            </button>
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs">
              {successMsg}
            </div>
          )}

          {/* ABA 1: TÍTULO, VISIBILIDADE, ESTIMATIVA & ARQUIVAMENTO */}
          {(mode === 'create' || activeTab === 'general') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Título do Quadro
                </label>
                <input
                  type="text"
                  autoFocus
                  disabled={!canManageBoard}
                  placeholder="Ex: Sprint 1, Roadmap 2026, Tarefas da Semana..."
                  value={boardTitle}
                  onChange={e => setBoardTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 disabled:opacity-60 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              {/* Estimativa configurável */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Unidade de Estimativa dos Cartões</span>
                </label>
                <select
                  disabled={!canManageBoard}
                  value={estimateType}
                  onChange={e => setEstimateType(e.target.value as EstimateType)}
                  className="w-full bg-slate-800 border border-slate-700 disabled:opacity-60 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                >
                  <option value="POINTS">Pontos de História (Fibonacci: 1, 2, 3, 5, 8, 13, 21)</option>
                  <option value="HOURS">Horas Estimadas (ex: 2, 4, 8, 16h)</option>
                  <option value="TSHIRT">Camiseta / Porte (P, M, G, GG)</option>
                </select>
              </div>

              {/* BD-08: Arquivamento Automático */}
              {mode === 'manage' && boardId && (
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Archive className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Arquivamento Automático de Concluídos</span>
                  </label>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Arquiva automaticamente cartões concluídos há mais de N dias para manter o quadro limpo e focado.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      placeholder="Dias (ex: 15, 30)..."
                      value={autoArchiveDays}
                      onChange={e => setAutoArchiveDays(e.target.value)}
                      disabled={!canManageBoard}
                      className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-400">dias</span>

                    {canManageBoard && (
                      <button
                        type="button"
                        onClick={handleTriggerAutoArchive}
                        disabled={archivingLoading}
                        className="ml-auto px-3 py-1.5 bg-slate-800 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold rounded-lg transition"
                      >
                        {archivingLoading ? 'Arquivando...' : 'Executar Agora'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Nível de Inscrição no Quadro */}
              {mode === 'manage' && boardId && (
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Minha Inscrição neste Quadro</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'ALL' as SubscriptionLevel, label: 'Todas', desc: 'Todos os eventos' },
                      { value: 'MENTIONS' as SubscriptionLevel, label: 'Só Menções', desc: '@menções e atribuições' },
                      { value: 'NONE' as SubscriptionLevel, label: 'Nenhuma', desc: 'Silenciar quadro' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleBoardSubscriptionChange(opt.value)}
                        className={`p-2 rounded-lg border text-left transition ${
                          subscriptionLevel === opt.value
                            ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200'
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="text-xs font-bold">{opt.label}</div>
                        <div className="text-[10px] opacity-80">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Visibilidade do Quadro
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={!canManageBoard}
                    onClick={() => setVisibility('WORKSPACE')}
                    className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                      visibility === 'WORKSPACE'
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-slate-100'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold">Visível ao Workspace</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Todos os membros regulares do workspace podem visualizar e colaborar.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={!canManageBoard}
                    onClick={() => setVisibility('PRIVATE')}
                    className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 ${
                      visibility === 'PRIVATE'
                        ? 'bg-amber-500/15 border-amber-500/50 text-slate-100'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold">Privado</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Apenas usuários e equipes convidadas explicitamente têm acesso.
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition"
                >
                  Fechar
                </button>
                {canManageBoard && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition"
                  >
                    {loading ? 'Salvando...' : mode === 'create' ? 'Criar Quadro' : 'Salvar Alterações'}
                  </button>
                )}
              </div>
            </form>
          )}

          {/* ABA 2: PAPÉIS DO QUADRO, MEMBROS E EQUIPES (BD-02, BD-05, PM-01) */}
          {mode === 'manage' && activeTab === 'members' && (
            <div className="space-y-5">
              {/* Seção 1: Equipes com Permissão no Quadro (PM-01) */}
              <div className="space-y-3 p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-400">
                  <Users className="w-4 h-4" />
                  <span>Equipes do Workspace com Acesso</span>
                </div>

                {canManageBoard && workspaceTeams.length > 0 && (
                  <form onSubmit={handleAssignTeam} className="flex gap-2">
                    <select
                      value={selectedTeamId}
                      onChange={e => setSelectedTeamId(e.target.value)}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      {workspaceTeams.map(t => (
                        <option key={t.id} value={t.id}>
                          Equipe: {t.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={selectedTeamRole}
                      onChange={e => setSelectedTeamRole(e.target.value as BoardRole)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                    >
                      <option value="OWNER">Owner</option>
                      <option value="EDITOR">Editor</option>
                      <option value="COMMENTER">Comentarista</option>
                      <option value="VIEWER">Leitor</option>
                    </select>

                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
                    >
                      Vincular Equipe
                    </button>
                  </form>
                )}

                {boardTeams.length === 0 ? (
                  <p className="text-[11px] text-slate-500 py-1">
                    Nenhuma equipe vinculada diretamente a este quadro.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800/80 border border-slate-800/80 rounded-lg bg-slate-900/60">
                    {boardTeams.map(bt => (
                      <div key={bt.team_id} className="p-2.5 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">{bt.team_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                            {getRoleLabel(bt.role)}
                          </span>
                          {canManageBoard && (
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
                    ))}
                  </div>
                )}
              </div>

              {/* Seção 2: Membros Usuários */}
              {canManageBoard && (
                <form onSubmit={handleAddBoardMember} className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                    <UserPlus className="w-4 h-4" />
                    <span>Convidar Usuário / Definir Papel</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="email"
                      required
                      placeholder="E-mail do usuário..."
                      value={newMemberEmail}
                      onChange={e => setNewMemberEmail(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      placeholder="Nome (se novo usuário)..."
                      value={newMemberName}
                      onChange={e => setNewMemberName(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newMemberRole}
                        onChange={e => setNewMemberRole(e.target.value as BoardRole)}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="OWNER">Owner</option>
                        <option value="EDITOR">Editor</option>
                        <option value="COMMENTER">Comentarista</option>
                        <option value="VIEWER">Leitor</option>
                      </select>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shrink-0"
                      >
                        Convidar
                      </button>
                    </div>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-400 px-1">
                  Membros Explícitos deste Quadro ({members.length})
                </div>

                {membersLoading ? (
                  <div className="text-center py-6 text-xs text-slate-500">Carregando membros do quadro...</div>
                ) : (
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/30">
                    {members.map(m => (
                      <div key={m.user_id} className="p-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-100 truncate">
                            {m.user_name || 'Usuário'}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{m.user_email}</div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {canManageBoard ? (
                            <select
                              value={m.role}
                              onChange={e => handleChangeMemberRole(m.user_id, e.target.value as BoardRole)}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                            >
                              <option value="OWNER">Owner</option>
                              <option value="EDITOR">Editor</option>
                              <option value="COMMENTER">Comentarista</option>
                              <option value="VIEWER">Leitor</option>
                            </select>
                          ) : (
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {getRoleLabel(m.role)}
                            </span>
                          )}

                          {canManageBoard && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.user_id)}
                              title="Remover acesso explícito ao quadro"
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition"
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
            </div>
          )}

          {/* ABA 3: COMPARTILHAMENTO PÚBLICO SOMENTE LEITURA (PM-03) */}
          {mode === 'manage' && activeTab === 'public' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">
                  <Share2 className="w-4 h-4" />
                  <span>Link Público Somente Leitura</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Permite que qualquer pessoa acesse e visualize este quadro em modo de leitura, sem precisar de conta ou login.
                </p>

                {publicToken ? (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 p-2.5 rounded-xl">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/?publicToken=${publicToken}`}
                        className="bg-transparent text-xs text-slate-200 flex-1 outline-none truncate font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shrink-0"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                      <span>
                        Expira em:{' '}
                        <strong className="text-slate-300">
                          {publicExpiresAt ? new Date(publicExpiresAt).toLocaleDateString() : 'Nunca (sem expiração)'}
                        </strong>
                      </span>

                      {canManageBoard && (
                        <button
                          type="button"
                          onClick={handleRevokePublicLink}
                          disabled={publicLoading}
                          className="text-rose-400 hover:text-rose-300 hover:underline"
                        >
                          Revogar Link Público
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 space-y-3">
                    {canManageBoard ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={publicExpiresDays}
                          onChange={e => setPublicExpiresDays(Number(e.target.value))}
                          className="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-2"
                        >
                          <option value={1}>Expira em 1 dia</option>
                          <option value={7}>Expira em 7 dias</option>
                          <option value={30}>Expira em 30 dias</option>
                          <option value={0}>Sem expiração</option>
                        </select>
                        <button
                          type="button"
                          onClick={handleGeneratePublicLink}
                          disabled={publicLoading}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
                        >
                          {publicLoading ? 'Gerando...' : 'Gerar Link Público'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Apenas o Owner do quadro pode gerar links públicos de compartilhamento.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
