import React, { useState, useEffect } from 'react';
import {
  X,
  Building,
  Users,
  ShieldAlert,
  History,
  Mail,
  UserPlus,
  Trash2,
  ArrowRightLeft,
  FolderKanban,
  UserCheck,
  Plus,
  Lock,
  Globe,
} from 'lucide-react';
import {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  AuditLog,
  WorkspaceTeam,
  WorkspaceTeamMember,
  WorkspaceBoardMetadata,
} from '../types';
import { api } from '../api/client';

interface WorkspaceModalProps {
  isOpen: boolean;
  mode?: 'create' | 'manage';
  workspace?: Workspace | null;
  onClose: () => void;
  onSave: (name: string, billingEmail?: string | null) => Promise<void>;
  onRefreshWorkspace?: () => Promise<void>;
}

export const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
  isOpen,
  mode = 'create',
  workspace,
  onClose,
  onSave,
  onRefreshWorkspace,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'teams' | 'all-boards' | 'transfer' | 'audit'>('general');

  // Aba Geral (WS-01, WS-06)
  const [name, setName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Aba Membros (WS-03, WS-04)
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<WorkspaceRole>('MEMBER');
  const [membersLoading, setMembersLoading] = useState(false);

  // Aba Equipes (PM-01)
  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<(WorkspaceTeam & { members: WorkspaceTeamMember[] }) | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [selectedAddMemberUserId, setSelectedAddMemberUserId] = useState('');

  // Aba Todos os Quadros (PM-02)
  const [allBoards, setAllBoards] = useState<WorkspaceBoardMetadata[]>([]);
  const [allBoardsLoading, setAllBoardsLoading] = useState(false);

  // Aba Transferência de Propriedade (WS-05)
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const [transferConfirmationText, setTransferConfirmationText] = useState('');
  const [demoteSelfTo, setDemoteSelfTo] = useState<'ADMIN' | 'OWNER'>('ADMIN');

  // Aba Log de Auditoria (EV-02)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessMsg(null);
      setActiveTab('general');
      if (mode === 'manage' && workspace) {
        setName(workspace.name);
        setBillingEmail(workspace.billing_email || '');
        loadMembers(workspace.id);
        loadTeams(workspace.id);
        loadAuditLogs(workspace.id);
        if (workspace.role === 'OWNER' || workspace.role === 'ADMIN') {
          loadAllBoards(workspace.id);
        }
      } else {
        setName('');
        setBillingEmail('');
      }
    }
  }, [isOpen, mode, workspace]);

  const loadMembers = async (wsId: string) => {
    try {
      setMembersLoading(true);
      const list = await api.getWorkspaceMembers(wsId);
      setMembers(list);
    } catch (err: any) {
      console.error('Erro ao carregar membros do workspace:', err);
    } finally {
      setMembersLoading(false);
    }
  };

  const loadTeams = async (wsId: string) => {
    try {
      const list = await api.getWorkspaceTeams(wsId);
      setTeams(list);
      if (list.length > 0 && (!selectedTeam || !list.some(t => t.id === selectedTeam.id))) {
        await loadTeamDetails(list[0].id);
      }
    } catch (err: any) {
      console.error('Erro ao carregar equipes:', err);
    }
  };

  const loadTeamDetails = async (teamId: string) => {
    try {
      const details = await api.getTeamDetails(teamId);
      setSelectedTeam(details);
    } catch (err: any) {
      console.error('Erro ao carregar detalhes da equipe:', err);
    }
  };

  const loadAllBoards = async (wsId: string) => {
    try {
      setAllBoardsLoading(true);
      const list = await api.getWorkspaceAllBoards(wsId);
      setAllBoards(list);
    } catch (err: any) {
      console.error('Erro ao carregar todos os quadros:', err);
    } finally {
      setAllBoardsLoading(false);
    }
  };

  const loadAuditLogs = async (wsId: string) => {
    try {
      setAuditLoading(true);
      const logs = await api.getWorkspaceAuditLogs(wsId);
      setAuditLogs(logs);
    } catch (err: any) {
      console.error('Erro ao carregar logs de auditoria:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  if (!isOpen) return null;

  const canEditWorkspace = mode === 'create' || workspace?.role === 'OWNER' || workspace?.role === 'ADMIN';
  const isOwner = workspace?.role === 'OWNER';

  const handleSubmitGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome do workspace é obrigatório.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);
      await onSave(name.trim(), billingEmail.trim() || null);
      if (mode === 'create') {
        onClose();
      } else {
        setSuccessMsg('Configurações e contato de cobrança salvos com sucesso!');
        if (workspace) loadAuditLogs(workspace.id);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar workspace.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !newMemberEmail.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);
      await api.addWorkspaceMember(workspace.id, {
        email: newMemberEmail.trim(),
        name: newMemberName.trim() || undefined,
        role: newMemberRole,
      });
      setNewMemberEmail('');
      setNewMemberName('');
      setNewMemberRole('MEMBER');
      await loadMembers(workspace.id);
      await loadAuditLogs(workspace.id);
      setSuccessMsg('Membro adicionado ao workspace com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Erro ao adicionar membro.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: WorkspaceRole) => {
    if (!workspace) return;
    try {
      setError(null);
      setSuccessMsg(null);
      await api.updateWorkspaceMemberRole(workspace.id, userId, newRole);
      await loadMembers(workspace.id);
      await loadAuditLogs(workspace.id);
      setSuccessMsg('Papel do membro atualizado com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar papel do membro.');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!workspace) return;
    try {
      setError(null);
      setSuccessMsg(null);
      await api.removeWorkspaceMember(workspace.id, userId);
      await loadMembers(workspace.id);
      await loadAuditLogs(workspace.id);
      setSuccessMsg('Membro removido do workspace.');
    } catch (err: any) {
      setError(err.message || 'Erro ao remover membro.');
    }
  };

  // Equipes (PM-01)
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !newTeamName.trim()) return;
    try {
      setError(null);
      setSuccessMsg(null);
      const created = await api.createWorkspaceTeam(workspace.id, {
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || undefined,
      });
      setNewTeamName('');
      setNewTeamDesc('');
      await loadTeams(workspace.id);
      await loadTeamDetails(created.id);
      setSuccessMsg('Equipe criada com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Falha ao criar equipe.');
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!workspace) return;
    try {
      setError(null);
      setSuccessMsg(null);
      await api.deleteTeam(teamId);
      setSelectedTeam(null);
      await loadTeams(workspace.id);
      setSuccessMsg('Equipe removida.');
    } catch (err: any) {
      setError(err.message || 'Falha ao remover equipe.');
    }
  };

  const handleAddMemberToTeam = async () => {
    if (!selectedTeam || !selectedAddMemberUserId) return;
    try {
      setError(null);
      setSuccessMsg(null);
      await api.addTeamMember(selectedTeam.id, { userId: selectedAddMemberUserId });
      await loadTeamDetails(selectedTeam.id);
      setSelectedAddMemberUserId('');
      setSuccessMsg('Membro adicionado à equipe!');
    } catch (err: any) {
      setError(err.message || 'Falha ao adicionar membro à equipe.');
    }
  };

  const handleRemoveMemberFromTeam = async (userId: string) => {
    if (!selectedTeam) return;
    try {
      setError(null);
      setSuccessMsg(null);
      await api.removeTeamMember(selectedTeam.id, userId);
      await loadTeamDetails(selectedTeam.id);
      setSuccessMsg('Membro removido da equipe.');
    } catch (err: any) {
      setError(err.message || 'Falha ao remover membro da equipe.');
    }
  };

  // PM-02: Self-promote to board
  const handleSelfPromote = async (boardId: string) => {
    if (!workspace) return;
    try {
      setError(null);
      setSuccessMsg(null);
      await api.selfPromoteToBoard(boardId);
      await loadAllBoards(workspace.id);
      await loadAuditLogs(workspace.id);
      if (onRefreshWorkspace) await onRefreshWorkspace();
      setSuccessMsg('Você se promoveu a Owner do quadro com registro em auditoria!');
    } catch (err: any) {
      setError(err.message || 'Falha ao se promover no quadro.');
    }
  };

  const handleTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace) return;

    if (!transferTargetUserId) {
      setError('Selecione o membro que receberá a propriedade.');
      return;
    }

    if (transferConfirmationText.trim().toLowerCase() !== workspace.name.trim().toLowerCase()) {
      setError(`Digite exatamente o nome do workspace ("${workspace.name}") para confirmar a transferência.`);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);
      await api.transferWorkspaceOwnership(workspace.id, {
        targetUserId: transferTargetUserId,
        confirmationText: transferConfirmationText,
        demoteSelfTo,
      });

      setSuccessMsg('Propriedade do workspace transferida com sucesso!');
      if (onRefreshWorkspace) await onRefreshWorkspace();
      await loadMembers(workspace.id);
      await loadAuditLogs(workspace.id);
    } catch (err: any) {
      setError(err.message || 'Falha ao transferir propriedade.');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeColor = (role: WorkspaceRole) => {
    switch (role) {
      case 'OWNER':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'ADMIN':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      case 'MEMBER':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'GUEST':
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  const formatAuditDetails = (log: AuditLog) => {
    if (!log.details) return '';
    try {
      const parsed = JSON.parse(log.details);
      return Object.entries(parsed)
        .filter(([_, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
    } catch {
      return log.details;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">
                {mode === 'create' ? 'Novo Workspace' : `Configurações: ${workspace?.name}`}
              </h3>
              {mode === 'manage' && workspace?.role && (
                <span className="text-[11px] text-slate-400">
                  Seu papel no workspace: <strong className="text-indigo-400">{workspace.role}</strong>
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

        {/* Abas no modo Gerenciamento */}
        {mode === 'manage' && (
          <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => { setActiveTab('general'); setError(null); setSuccessMsg(null); }}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'general'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Building className="w-3.5 h-3.5" />
              <span>Geral & Cobrança</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('members'); setError(null); setSuccessMsg(null); }}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'members'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Membros ({members.length})</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('teams'); setError(null); setSuccessMsg(null); }}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'teams'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Equipes ({teams.length})</span>
            </button>

            {(isOwner || workspace?.role === 'ADMIN') && (
              <button
                type="button"
                onClick={() => { setActiveTab('all-boards'); setError(null); setSuccessMsg(null); }}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'all-boards'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderKanban className="w-3.5 h-3.5" />
                <span>Todos os Quadros ({allBoards.length})</span>
              </button>
            )}

            {isOwner && (
              <button
                type="button"
                onClick={() => { setActiveTab('transfer'); setError(null); setSuccessMsg(null); }}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'transfer'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Transferir Propriedade</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => { setActiveTab('audit'); setError(null); setSuccessMsg(null); }}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'audit'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Auditoria ({auditLogs.length})</span>
            </button>
          </div>
        )}

        {/* Conteúdo das Abas */}
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

          {/* ABA 1: GERAL E COBRANÇA */}
          {(mode === 'create' || activeTab === 'general') && (
            <form onSubmit={handleSubmitGeneral} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Nome do Workspace
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  disabled={!canEditWorkspace}
                  placeholder="Ex: Engenharia de Software, Marketing 2026..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 disabled:opacity-60 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Contato de Cobrança (Faturamento)</span>
                </label>
                <input
                  type="email"
                  disabled={!canEditWorkspace}
                  placeholder="Ex: financeiro@empresa.com"
                  value={billingEmail}
                  onChange={e => setBillingEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 disabled:opacity-60 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
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
                {canEditWorkspace && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition"
                  >
                    {loading ? 'Salvando...' : mode === 'create' ? 'Criar Workspace' : 'Salvar Alterações'}
                  </button>
                )}
              </div>
            </form>
          )}

          {/* ABA 2: MEMBROS E PAPÉIS */}
          {mode === 'manage' && activeTab === 'members' && (
            <div className="space-y-4">
              {canEditWorkspace && (
                <form onSubmit={handleAddMember} className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-400">
                    <UserPlus className="w-4 h-4" />
                    <span>Convidar Novo Membro</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="email"
                      required
                      placeholder="E-mail do usuário..."
                      value={newMemberEmail}
                      onChange={e => setNewMemberEmail(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      placeholder="Nome completo (se novo)..."
                      value={newMemberName}
                      onChange={e => setNewMemberName(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newMemberRole}
                        onChange={e => setNewMemberRole(e.target.value as WorkspaceRole)}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="MEMBER">Membro (Padrão)</option>
                        <option value="ADMIN">Administrador</option>
                        <option value="GUEST">Convidado</option>
                      </select>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition shrink-0"
                      >
                        Convidar
                      </button>
                    </div>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-400 px-1">
                  Membros Registrados ({members.length})
                </div>

                {membersLoading ? (
                  <div className="text-center py-6 text-xs text-slate-500">Carregando membros...</div>
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
                          {canEditWorkspace && m.role !== 'OWNER' ? (
                            <select
                              value={m.role}
                              onChange={e => handleRoleChange(m.user_id, e.target.value as WorkspaceRole)}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            >
                              <option value="ADMIN">Administrador</option>
                              <option value="MEMBER">Membro</option>
                              <option value="GUEST">Convidado</option>
                            </select>
                          ) : (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRoleBadgeColor(m.role)}`}>
                              {m.role}
                            </span>
                          )}

                          {canEditWorkspace && m.role !== 'OWNER' && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.user_id)}
                              title="Remover do Workspace"
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

          {/* ABA 3: EQUIPES DO WORKSPACE (PM-01) */}
          {mode === 'manage' && activeTab === 'teams' && (
            <div className="space-y-4">
              {canEditWorkspace && (
                <form onSubmit={handleCreateTeam} className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-400">
                    <Plus className="w-4 h-4" />
                    <span>Criar Nova Equipe</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Nome da equipe (ex: Frontend, QA, Design)..."
                      value={newTeamName}
                      onChange={e => setNewTeamName(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Descrição opcional..."
                        value={newTeamDesc}
                        onChange={e => setNewTeamDesc(e.target.value)}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                      />
                      <button
                        type="submit"
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
                      >
                        Criar
                      </button>
                    </div>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Lista de equipes */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400 px-1">Equipes Registradas ({teams.length})</span>
                  {teams.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                      Nenhuma equipe criada neste workspace.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {teams.map(t => (
                        <div
                          key={t.id}
                          onClick={() => loadTeamDetails(t.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                            selectedTeam?.id === t.id
                              ? 'bg-indigo-500/15 border-indigo-500/50 text-white'
                              : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800 text-slate-300'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold">{t.name}</div>
                            {t.description && <div className="text-[11px] text-slate-400">{t.description}</div>}
                          </div>
                          <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400 border border-slate-700">
                            {t.members_count || 0} membros
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Detalhes da equipe selecionada */}
                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                  {selectedTeam ? (
                    <>
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <div>
                          <div className="text-xs font-bold text-white">{selectedTeam.name}</div>
                          <div className="text-[10px] text-slate-400">{selectedTeam.description || 'Sem descrição'}</div>
                        </div>
                        {canEditWorkspace && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTeam(selectedTeam.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition"
                            title="Excluir equipe"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Adicionar membro à equipe */}
                      {canEditWorkspace && (
                        <div className="flex gap-2">
                          <select
                            value={selectedAddMemberUserId}
                            onChange={e => setSelectedAddMemberUserId(e.target.value)}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                          >
                            <option value="">Selecione um membro do workspace...</option>
                            {members
                              .filter(m => !selectedTeam.members.some(tm => tm.user_id === m.user_id))
                              .map(m => (
                                <option key={m.user_id} value={m.user_id}>
                                  {m.user_name || m.user_email}
                                </option>
                              ))}
                          </select>
                          <button
                            type="button"
                            onClick={handleAddMemberToTeam}
                            disabled={!selectedAddMemberUserId}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition"
                          >
                            Adicionar
                          </button>
                        </div>
                      )}

                      {/* Lista de membros da equipe */}
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                        {selectedTeam.members.length === 0 ? (
                          <div className="text-center py-4 text-xs text-slate-500">
                            Nenhum membro nesta equipe ainda.
                          </div>
                        ) : (
                          selectedTeam.members.map(tm => (
                            <div
                              key={tm.user_id}
                              className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                            >
                              <span className="text-slate-200">{tm.user_name || tm.user_email}</span>
                              {canEditWorkspace && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMemberFromTeam(tm.user_id)}
                                  className="text-slate-500 hover:text-rose-400 p-1"
                                  title="Remover da equipe"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-10 text-xs text-slate-500">
                      Selecione uma equipe ao lado para ver e gerenciar os membros.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ABA 4: TODOS OS QUADROS DO WORKSPACE (PM-02) */}
          {mode === 'manage' && activeTab === 'all-boards' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Lista completa e metadados de todos os quadros deste workspace (incluindo quadros privados)</span>
                <button
                  type="button"
                  onClick={() => workspace && loadAllBoards(workspace.id)}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold"
                >
                  Atualizar
                </button>
              </div>

              {allBoardsLoading ? (
                <div className="text-center py-8 text-xs text-slate-500">Carregando todos os quadros...</div>
              ) : allBoards.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                  Nenhum quadro encontrado no workspace.
                </div>
              ) : (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 max-h-80 overflow-y-auto">
                  {allBoards.map(b => (
                    <div key={b.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{b.title}</span>
                          <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            b.visibility === 'PRIVATE'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {b.visibility === 'PRIVATE' ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                            {b.visibility === 'PRIVATE' ? 'Privado' : 'Workspace'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-3">
                          <span>{b.members_count} membros</span>
                          <span>•</span>
                          <span>{b.cards_count} cartões</span>
                          <span>•</span>
                          <span>Criado em {new Date(b.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {b.user_is_member ? (
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                            Membro do Quadro
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelfPromote(b.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg transition shadow"
                            title="Promover-se a membro deste quadro com registro em auditoria"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Promover-se a Membro</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ABA 5: TRANSFERÊNCIA DE PROPRIEDADE (WS-05) */}
          {mode === 'manage' && activeTab === 'transfer' && isOwner && (
            <form onSubmit={handleTransferOwnership} className="space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Transferência Irreversível de Propriedade</span>
                </div>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Ao transferir o workspace, você deixará de ser o Owner principal. O novo Owner terá controle total sobre cobrança, exclusão do workspace e gerenciamento de permissões.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Novo Proprietário (Owner)
                </label>
                <select
                  value={transferTargetUserId}
                  onChange={e => setTransferTargetUserId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">Selecione um membro do workspace...</option>
                  {members
                    .filter(m => m.role !== 'OWNER' && m.role !== 'GUEST')
                    .map(m => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.user_name || m.user_email} ({m.user_email}) — {m.role}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Seu novo papel após a transferência
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDemoteSelfTo('ADMIN')}
                    className={`p-2.5 rounded-xl border text-xs font-bold text-left transition ${
                      demoteSelfTo === 'ADMIN'
                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Administrador (ADMIN)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoteSelfTo('OWNER')}
                    className={`p-2.5 rounded-xl border text-xs font-bold text-left transition ${
                      demoteSelfTo === 'OWNER'
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    Co-proprietário (OWNER adicional)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Confirmação de Segurança (digite o nome do workspace)
                </label>
                <input
                  type="text"
                  placeholder={`Digite ${workspace?.name} para confirmar...`}
                  value={transferConfirmationText}
                  onChange={e => setTransferConfirmationText(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading || !transferTargetUserId || !transferConfirmationText.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition"
                >
                  {loading ? 'Transferindo...' : 'Confirmar Transferência de Propriedade'}
                </button>
              </div>
            </form>
          )}

          {/* ABA 6: LOG DE AUDITORIA BÁSICO (EV-02) */}
          {mode === 'manage' && activeTab === 'audit' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Registro histórico de quem mudou o quê neste workspace</span>
                <button
                  type="button"
                  onClick={() => workspace && loadAuditLogs(workspace.id)}
                  className="text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  Atualizar
                </button>
              </div>

              {auditLoading ? (
                <div className="text-center py-6 text-xs text-slate-500">Carregando log de auditoria...</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-6 text-center bg-slate-950/40 rounded-xl border border-slate-800 text-xs text-slate-500">
                  Nenhum evento de auditoria registrado ainda.
                </div>
              ) : (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 max-h-80 overflow-y-auto">
                  {auditLogs.map(log => (
                    <div key={log.id} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-indigo-300">{log.action}</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </span>
                      </div>
                      <div className="text-slate-300">
                        Autor: <strong className="text-white">{log.user_name || log.user_email || log.user_id}</strong>{' '}
                        • Alvo: <span className="text-slate-400">{log.target_type}</span>
                      </div>
                      {log.details && (
                        <div className="text-[11px] text-slate-400 font-mono bg-slate-900/80 px-2 py-1 rounded border border-slate-800 truncate">
                          {formatAuditDetails(log)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
