import React, { useState, useEffect } from 'react';
import {
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
  AlertCircle,
  Check,
  Save,
  Shield,
  KeyRound,
  ShieldCheck,
  Network,
} from 'lucide-react';
import {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  AuditLog,
  WorkspaceTeam,
  WorkspaceTeamMember,
  WorkspaceBoardMetadata,
  WorkspaceCustomRole,
} from '../../types';
import { api } from '../../api/client';

interface WorkspaceSettingsProps {
  activeSubTab:
    | 'general'
    | 'members'
    | 'teams'
    | 'roles'
    | 'hierarchy'
    | 'sso'
    | 'all-boards'
    | 'transfer'
    | 'audit';
  workspace: Workspace | null;
  onRefreshWorkspace?: () => Promise<void>;
  onSaveWorkspace?: (name: string, billingEmail?: string | null) => Promise<void>;
}

export const WorkspaceSettings: React.FC<WorkspaceSettingsProps> = ({
  activeSubTab,
  workspace,
  onRefreshWorkspace,
  onSaveWorkspace,
}) => {
  const userRole = workspace?.role || 'MEMBER';
  const isAdmin = userRole === 'OWNER' || userRole === 'ADMIN';
  const isOwner = userRole === 'OWNER';

  // Geral
  const [name, setName] = useState(workspace?.name || '');
  const [billingEmail, setBillingEmail] = useState(workspace?.billing_email || '');
  const [generalLoading, setGeneralLoading] = useState(false);
  const [generalMsg, setGeneralMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Membros
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<WorkspaceRole>('MEMBER');
  const [memberMsg, setMemberMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Equipes
  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<(WorkspaceTeam & { members: WorkspaceTeamMember[] }) | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [selectedAddMemberUserId, setSelectedAddMemberUserId] = useState('');
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamMsg, setTeamMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Todos os quadros
  const [allBoards, setAllBoards] = useState<WorkspaceBoardMetadata[]>([]);
  const [allBoardsLoading, setAllBoardsLoading] = useState(false);

  // Transferência de Propriedade
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const [transferConfirmationText, setTransferConfirmationText] = useState('');
  const [demoteSelfTo, setDemoteSelfTo] = useState<'ADMIN' | 'OWNER'>('ADMIN');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferMsg, setTransferMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auditoria
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Papéis Customizados (PM-07)
  const [customRoles, setCustomRoles] = useState<WorkspaceCustomRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([
    'card:create',
    'card:edit',
    'card:move',
    'card:comment',
  ]);
  const [roleMsg, setRoleMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Hierarquia de Workspaces (WS-07)
  const [subWorkspaces, setSubWorkspaces] = useState<any[]>([]);
  const [hierarchySummary, setHierarchySummary] = useState<any | null>(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);
  const [newSubWsName, setNewSubWsName] = useState('');
  const [newSubWsEmail, setNewSubWsEmail] = useState('');
  const [creatingSubWs, setCreatingSubWs] = useState(false);
  const [hierarchyMsg, setHierarchyMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // SSO Corporativo e Provisionamento (WS-08)
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoProvider, setSsoProvider] = useState<'GOOGLE' | 'SAML' | 'OIDC' | 'OKTA' | 'AZURE'>('GOOGLE');
  const [ssoDomain, setSsoDomain] = useState('');
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoSaving, setSsoSaving] = useState(false);
  const [ssoMsg, setSsoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testSsoEmail, setTestSsoEmail] = useState('');
  const [testSsoName, setTestSsoName] = useState('');
  const [testSsoLoading, setTestSsoLoading] = useState(false);
  const [testSsoResult, setTestSsoResult] = useState<{ success: boolean; message: string; user?: any; provisionedAs?: string } | null>(null);

  const AVAILABLE_PERMISSIONS: { key: string; label: string; desc: string }[] = [
    { key: 'card:create', label: 'Criar Cartões', desc: 'Permite criar novas tarefas no quadro' },
    { key: 'card:edit', label: 'Editar Cartões', desc: 'Permite alterar título, descrição e campos' },
    { key: 'card:move', label: 'Mover Cartões', desc: 'Permite movimentar tarefas entre colunas' },
    { key: 'card:delete', label: 'Excluir Cartões', desc: 'Permite excluir ou arquivar tarefas' },
    { key: 'card:comment', label: 'Comentar', desc: 'Permite comentar e adicionar anexos' },
    { key: 'card:time_log', label: 'Registrar Horas', desc: 'Permite iniciar timer e lançar horas gastas' },
    { key: 'board:create', label: 'Criar Quadros', desc: 'Permite criar novos quadros no workspace' },
    { key: 'board:edit', label: 'Configurar Quadro', desc: 'Permite gerenciar colunas, WIP e automações' },
    { key: 'board:manage_members', label: 'Membros do Quadro', desc: 'Permite convidar membros para quadros' },
    { key: 'workspace:manage_members', label: 'Governança Workspace', desc: 'Permite gerenciar equipes e membros do workspace' },
  ];

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setBillingEmail(workspace.billing_email || '');

      if (activeSubTab === 'members') loadMembers(workspace.id);
      if (activeSubTab === 'teams') loadTeams(workspace.id);
      if (activeSubTab === 'roles') loadRoles(workspace.id);
      if (activeSubTab === 'hierarchy') loadHierarchy(workspace.id);
      if (activeSubTab === 'sso') loadSso(workspace.id);
      if (activeSubTab === 'all-boards') loadAllBoards(workspace.id);
      if (activeSubTab === 'audit') loadAuditLogs(workspace.id);
      if (activeSubTab === 'transfer') loadMembers(workspace.id);
    }
  }, [workspace?.id, activeSubTab]);

  const loadMembers = async (wsId: string) => {
    try {
      setMembersLoading(true);
      const data = await api.getWorkspaceMembers(wsId);
      setMembers(data);
    } catch (err: any) {
      setMemberMsg({ type: 'error', text: err.message || 'Falha ao carregar membros.' });
    } finally {
      setMembersLoading(false);
    }
  };

  const loadTeams = async (wsId: string) => {
    try {
      setTeamsLoading(true);
      const data = await api.getWorkspaceTeams(wsId);
      setTeams(data);
      if (data.length > 0 && !selectedTeam) {
        loadTeamDetails(data[0].id);
      }
    } catch (err: any) {
      setTeamMsg({ type: 'error', text: err.message || 'Falha ao carregar equipes.' });
    } finally {
      setTeamsLoading(false);
    }
  };

  const loadTeamDetails = async (teamId: string) => {
    try {
      const details = await api.getTeamDetails(teamId);
      setSelectedTeam(details);
    } catch (err: any) {
      setTeamMsg({ type: 'error', text: err.message || 'Falha ao obter detalhes da equipe.' });
    }
  };

  const loadAllBoards = async (wsId: string) => {
    try {
      setAllBoardsLoading(true);
      const data = await api.getWorkspaceAllBoards(wsId);
      setAllBoards(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setAllBoardsLoading(false);
    }
  };

  const loadAuditLogs = async (wsId: string) => {
    try {
      setAuditLoading(true);
      const data = await api.getWorkspaceAuditLogs(wsId);
      setAuditLogs(data);
    } catch (err: any) {
      console.error(err);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setGeneralLoading(true);
      setGeneralMsg(null);
      if (onSaveWorkspace) {
        await onSaveWorkspace(name.trim(), billingEmail.trim() || null);
      }
      setGeneralMsg({ type: 'success', text: 'Workspace atualizado com sucesso!' });
      if (onRefreshWorkspace) onRefreshWorkspace();
    } catch (err: any) {
      setGeneralMsg({ type: 'error', text: err.message || 'Falha ao atualizar workspace.' });
    } finally {
      setGeneralLoading(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !newMemberEmail.trim()) return;
    try {
      setMemberMsg(null);
      await api.addWorkspaceMember(workspace.id, {
        email: newMemberEmail.trim(),
        name: newMemberName.trim() || undefined,
        role: newMemberRole,
      });
      setNewMemberEmail('');
      setNewMemberName('');
      setMemberMsg({ type: 'success', text: 'Membro adicionado com sucesso!' });
      await loadMembers(workspace.id);
    } catch (err: any) {
      setMemberMsg({ type: 'error', text: err.message || 'Falha ao adicionar membro.' });
    }
  };

  const handleChangeMemberRole = async (userId: string, role: WorkspaceRole) => {
    if (!workspace) return;
    try {
      setMemberMsg(null);
      await api.updateWorkspaceMemberRole(workspace.id, userId, role);
      setMemberMsg({ type: 'success', text: 'Papel atualizado com sucesso!' });
      await loadMembers(workspace.id);
    } catch (err: any) {
      setMemberMsg({ type: 'error', text: err.message || 'Falha ao atualizar papel.' });
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!workspace || !window.confirm('Tem certeza que deseja remover este membro do workspace?'))
      return;
    try {
      setMemberMsg(null);
      await api.removeWorkspaceMember(workspace.id, userId);
      setMemberMsg({ type: 'success', text: 'Membro removido com sucesso.' });
      await loadMembers(workspace.id);
    } catch (err: any) {
      setMemberMsg({ type: 'error', text: err.message || 'Falha ao remover membro.' });
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !newTeamName.trim()) return;
    try {
      setTeamMsg(null);
      const created = await api.createWorkspaceTeam(workspace.id, {
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || undefined,
      });
      setNewTeamName('');
      setNewTeamDesc('');
      setTeamMsg({ type: 'success', text: `Equipe "${created.name}" criada com sucesso!` });
      await loadTeams(workspace.id);
      await loadTeamDetails(created.id);
    } catch (err: any) {
      setTeamMsg({ type: 'error', text: err.message || 'Falha ao criar equipe.' });
    }
  };

  const handleAddMemberToTeam = async () => {
    if (!selectedTeam || !selectedAddMemberUserId) return;
    try {
      setTeamMsg(null);
      await api.addTeamMember(selectedTeam.id, { userId: selectedAddMemberUserId });
      setSelectedAddMemberUserId('');
      await loadTeamDetails(selectedTeam.id);
      setTeamMsg({ type: 'success', text: 'Membro vinculado à equipe!' });
    } catch (err: any) {
      setTeamMsg({ type: 'error', text: err.message || 'Falha ao vincular membro.' });
    }
  };

  const handleRemoveMemberFromTeam = async (userId: string) => {
    if (!selectedTeam) return;
    try {
      setTeamMsg(null);
      await api.removeTeamMember(selectedTeam.id, userId);
      await loadTeamDetails(selectedTeam.id);
    } catch (err: any) {
      setTeamMsg({ type: 'error', text: err.message || 'Falha ao desvincular membro.' });
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta equipe?')) return;
    try {
      setTeamMsg(null);
      await api.deleteTeam(teamId);
      setSelectedTeam(null);
      if (workspace) await loadTeams(workspace.id);
      setTeamMsg({ type: 'success', text: 'Equipe excluída com sucesso.' });
    } catch (err: any) {
      setTeamMsg({ type: 'error', text: err.message || 'Falha ao excluir equipe.' });
    }
  };

  const handleTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !transferTargetUserId) return;
    if (transferConfirmationText.trim().toLowerCase() !== workspace.name.trim().toLowerCase()) {
      setTransferMsg({
        type: 'error',
        text: `Digite o nome exato do workspace ("${workspace.name}") para confirmar a transferência.`,
      });
      return;
    }

    try {
      setTransferLoading(true);
      setTransferMsg(null);
      await api.transferWorkspaceOwnership(workspace.id, {
        targetUserId: transferTargetUserId,
        confirmationText: transferConfirmationText.trim(),
        demoteSelfTo,
      });
      setTransferMsg({
        type: 'success',
        text: 'Posse transferida com sucesso! Suas permissões foram atualizadas.',
      });
      if (onRefreshWorkspace) await onRefreshWorkspace();
      await loadMembers(workspace.id);
    } catch (err: any) {
      setTransferMsg({ type: 'error', text: err.message || 'Falha ao transferir propriedade.' });
    } finally {
      setTransferLoading(false);
    }
  };

  const loadRoles = async (wsId: string) => {
    try {
      setRolesLoading(true);
      const data = await api.getWorkspaceCustomRoles(wsId);
      setCustomRoles(data);
    } catch (err: any) {
      setRoleMsg({ type: 'error', text: err.message || 'Falha ao carregar papéis customizados.' });
    } finally {
      setRolesLoading(false);
    }
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !newRoleName.trim()) return;
    try {
      setRoleMsg(null);
      await api.createWorkspaceCustomRole(workspace.id, newRoleName.trim(), newRoleDesc.trim(), selectedPerms);
      setNewRoleName('');
      setNewRoleDesc('');
      setSelectedPerms(['card:create', 'card:edit', 'card:move', 'card:comment']);
      setRoleMsg({ type: 'success', text: 'Papel customizado criado com sucesso!' });
      loadRoles(workspace.id);
    } catch (err: any) {
      setRoleMsg({ type: 'error', text: err.message || 'Erro ao criar papel customizado.' });
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!workspace || !window.confirm('Tem certeza que deseja excluir este papel customizado?')) return;
    try {
      await api.deleteWorkspaceCustomRole(workspace.id, roleId);
      loadRoles(workspace.id);
    } catch (err: any) {
      setRoleMsg({ type: 'error', text: err.message || 'Erro ao excluir papel.' });
    }
  };

  const loadHierarchy = async (wsId: string) => {
    try {
      setHierarchyLoading(true);
      const [subs, summary] = await Promise.all([
        api.getSubWorkspaces(wsId),
        api.getWorkspaceHierarchySummary(wsId),
      ]);
      setSubWorkspaces(subs);
      setHierarchySummary(summary);
    } catch (err: any) {
      setHierarchyMsg({ type: 'error', text: err.message || 'Falha ao carregar hierarquia de workspaces.' });
    } finally {
      setHierarchyLoading(false);
    }
  };

  const handleCreateSubWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !newSubWsName.trim()) return;
    try {
      setCreatingSubWs(true);
      setHierarchyMsg(null);
      await api.createWorkspace({
        name: newSubWsName.trim(),
        parentId: workspace.id,
        billingEmail: newSubWsEmail.trim() || undefined,
      });
      setNewSubWsName('');
      setNewSubWsEmail('');
      setHierarchyMsg({ type: 'success', text: 'Sub-workspace criado com sucesso na hierarquia!' });
      if (onRefreshWorkspace) await onRefreshWorkspace();
      loadHierarchy(workspace.id);
    } catch (err: any) {
      setHierarchyMsg({ type: 'error', text: err.message || 'Erro ao criar sub-workspace.' });
    } finally {
      setCreatingSubWs(false);
    }
  };

  const loadSso = async (wsId: string) => {
    try {
      setSsoLoading(true);
      const data = await api.getWorkspaceSso(wsId);
      setSsoEnabled(Boolean(data.sso_enabled));
      setSsoProvider((data.sso_provider as any) || 'GOOGLE');
      setSsoDomain(data.sso_domain || '');
    } catch (err: any) {
      setSsoMsg({ type: 'error', text: err.message || 'Falha ao carregar configurações de SSO.' });
    } finally {
      setSsoLoading(false);
    }
  };

  const handleSaveSso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace) return;
    try {
      setSsoSaving(true);
      setSsoMsg(null);
      await api.updateWorkspaceSso(workspace.id, {
        ssoEnabled,
        ssoProvider: ssoEnabled ? ssoProvider : null,
        ssoDomain: ssoEnabled ? (ssoDomain.trim() || null) : null,
      });
      setSsoMsg({ type: 'success', text: 'Configurações de SSO salvas com sucesso!' });
      loadSso(workspace.id);
    } catch (err: any) {
      setSsoMsg({ type: 'error', text: err.message || 'Erro ao salvar SSO.' });
    } finally {
      setSsoSaving(false);
    }
  };

  const handleTestSsoLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !testSsoEmail.trim()) return;
    try {
      setTestSsoLoading(true);
      setTestSsoResult(null);
      const res = await api.testSsoLogin(workspace.id, testSsoEmail.trim(), testSsoName.trim() || undefined);
      setTestSsoResult(res);
      loadMembers(workspace.id);
    } catch (err: any) {
      setTestSsoResult({
        success: false,
        message: err.message || 'Falha no teste de autenticação SSO.',
      });
    } finally {
      setTestSsoLoading(false);
    }
  };

  if (!workspace) {
    return (
      <div className="p-8 text-center text-slate-400 text-xs">
        Nenhum workspace selecionado.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Banner de Permissão caso usuário seja Membro ou Convidado */}
      {!isAdmin && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Você possui papel de <strong>{userRole}</strong> neste Workspace. Apenas Administradores e
            Proprietários podem editar configurações e gerenciar permissões.
          </span>
        </div>
      )}

      {/* 1. GERAL */}
      {activeSubTab === 'general' && (
        <form onSubmit={handleSaveGeneral} className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Building className="w-5 h-5 text-indigo-400" />
              Configurações Gerais do Workspace
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Informações institucionais, identificador e faturamento do espaço de trabalho.
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
                Nome do Workspace
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Minha Empresa ou Time de Produto"
                className="w-full bg-slate-900 border border-slate-700 disabled:opacity-50 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Contato / E-mail de Cobrança
              </label>
              <input
                type="email"
                disabled={!isAdmin}
                value={billingEmail}
                onChange={e => setBillingEmail(e.target.value)}
                placeholder="Ex: financeiro@suaempresa.com"
                className="w-full bg-slate-900 border border-slate-700 disabled:opacity-50 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Utilizado para faturas e comunicação administrativa, desacoplado dos e-mails dos owners.
              </p>
            </div>
          </div>

          {isAdmin && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={generalLoading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow"
              >
                <Save className="w-4 h-4" />
                <span>{generalLoading ? 'Salvando...' : 'Salvar Informações'}</span>
              </button>
            </div>
          )}
        </form>
      )}

      {/* 2. MEMBROS */}
      {activeSubTab === 'members' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              Membros e Permissões do Workspace
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Gerencie quem tem acesso a este espaço de trabalho e seus respectivos papéis.
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

          {isAdmin && (
            <form
              onSubmit={handleInviteMember}
              className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                Convidar Novo Membro
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="email"
                  required
                  placeholder="E-mail do membro *"
                  value={newMemberEmail}
                  onChange={e => setNewMemberEmail(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Nome (opcional)"
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <div className="flex gap-2">
                  <select
                    value={newMemberRole}
                    onChange={e => setNewMemberRole(e.target.value as WorkspaceRole)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 flex-1"
                  >
                    <option value="MEMBER">Membro</option>
                    <option value="ADMIN">Administrador</option>
                    <option value="GUEST">Convidado</option>
                    {isOwner && <option value="OWNER">Proprietário (Owner)</option>}
                  </select>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg transition shrink-0"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Membro</span>
              <span>Papel no Workspace</span>
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
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-600" />
                        {m.user_email}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isAdmin ? (
                        <select
                          value={m.role}
                          onChange={e =>
                            handleChangeMemberRole(m.user_id, e.target.value as WorkspaceRole)
                          }
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="OWNER">Owner</option>
                          <option value="ADMIN">Admin</option>
                          <option value="MEMBER">Membro</option>
                          <option value="GUEST">Convidado</option>
                        </select>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium text-[11px]">
                          {m.role}
                        </span>
                      )}

                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(m.user_id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                          title="Remover membro do workspace"
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

      {/* 3. EQUIPES */}
      {activeSubTab === 'teams' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-indigo-400" />
              Equipes do Workspace
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Agrupe membros em equipes (ex: Design, Engenharia, QA) para atribuir permissões coletivas nos quadros.
            </p>
          </div>

          {teamMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                teamMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {teamMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{teamMsg.text}</span>
            </div>
          )}

          {isAdmin && (
            <form
              onSubmit={handleCreateTeam}
              className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-indigo-400" />
                Criar Nova Equipe
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  placeholder="Nome da equipe (ex: Frontend)"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Descrição (opcional)"
                  value={newTeamDesc}
                  onChange={e => setNewTeamDesc(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg transition"
                >
                  Criar Equipe
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Lista de equipes */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-1 md:col-span-1">
              <div className="text-[11px] font-bold uppercase text-slate-500 px-2 py-1">
                Equipes ({teams.length})
              </div>
              {teamsLoading ? (
                <div className="text-xs text-slate-500 italic p-3">Carregando equipes...</div>
              ) : teams.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-3">Nenhuma equipe criada.</div>
              ) : (
                teams.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => loadTeamDetails(t.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between ${
                      selectedTeam?.id === t.id
                        ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="truncate">{t.name}</span>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">
                      {t.members_count || 0}
                    </span>
                  </button>
                ))
              )}
            </div>

            {/* Detalhes da equipe selecionada */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 md:col-span-2 space-y-4">
              {selectedTeam ? (
                <>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <div className="font-bold text-sm text-slate-100">{selectedTeam.name}</div>
                      {selectedTeam.description && (
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {selectedTeam.description}
                        </div>
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTeam(selectedTeam.id)}
                        className="text-xs text-rose-400 hover:text-rose-300 p-1 flex items-center gap-1"
                        title="Excluir esta equipe"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir</span>
                      </button>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedAddMemberUserId}
                        onChange={e => setSelectedAddMemberUserId(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 flex-1"
                      >
                        <option value="">Selecione um membro do workspace...</option>
                        {members
                          .filter(
                            m => !selectedTeam.members?.some(tm => tm.user_id === m.user_id)
                          )
                          .map(m => (
                            <option key={m.user_id} value={m.user_id}>
                              {m.user_name || m.user_email} ({m.user_email})
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddMemberToTeam}
                        disabled={!selectedAddMemberUserId}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                      >
                        Vincular
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold uppercase text-slate-500">
                      Membros da Equipe ({selectedTeam.members?.length || 0})
                    </div>
                    {selectedTeam.members?.length === 0 ? (
                      <div className="text-xs text-slate-500 italic p-2">Nenhum membro vinculado.</div>
                    ) : (
                      selectedTeam.members?.map(tm => (
                        <div
                          key={`${tm.team_id}-${tm.user_id}`}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-xs"
                        >
                          <div>
                            <span className="font-semibold text-slate-200">
                              {tm.user_name || 'Sem nome'}
                            </span>
                            <span className="text-[11px] text-slate-500 ml-2">
                              {tm.user_email}
                            </span>
                          </div>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMemberFromTeam(tm.user_id)}
                              className="text-slate-500 hover:text-rose-400 p-1"
                              title="Desvincular da equipe"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-500 italic p-6 text-center">
                  Selecione uma equipe ao lado para visualizar e gerenciar seus membros.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. TODOS OS QUADROS (PM-02) */}
      {activeSubTab === 'all-boards' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-indigo-400" />
              Governança de Quadros
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Visão consolidada para administradores de todos os quadros existentes no workspace.
            </p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Quadro</span>
              <div className="flex items-center gap-8 pr-2">
                <span>Visibilidade</span>
                <span>Cartões</span>
                <span>Membros</span>
              </div>
            </div>

            {allBoardsLoading ? (
              <div className="p-6 text-center text-slate-400 text-xs">Carregando quadros...</div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {allBoards.map(b => (
                  <div
                    key={b.id}
                    className="px-4 py-3 flex items-center justify-between hover:bg-slate-900/30 transition text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{b.title}</div>
                      <div className="text-[11px] text-slate-500">
                        Criado em {new Date(b.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </div>

                    <div className="flex items-center gap-8 pr-2">
                      <span className="flex items-center gap-1 font-medium text-slate-300">
                        {b.visibility === 'PRIVATE' ? (
                          <>
                            <Lock className="w-3 h-3 text-amber-400" /> Privado
                          </>
                        ) : (
                          <>
                            <Globe className="w-3 h-3 text-emerald-400" /> Workspace
                          </>
                        )}
                      </span>
                      <span className="w-12 text-center text-slate-400">{b.cards_count || 0}</span>
                      <span className="w-12 text-center text-slate-400">{b.members_count || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. TRANSFERÊNCIA DE PROPRIEDADE (WS-05) */}
      {activeSubTab === 'transfer' && (
        <form onSubmit={handleTransferOwnership} className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-amber-400" />
              Transferência de Propriedade do Workspace
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Transfira a titularidade (Owner) deste Workspace para outro membro da organização.
            </p>
          </div>

          {!isOwner ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Apenas o Proprietário (Owner) atual pode transferir a propriedade deste Workspace.</span>
            </div>
          ) : (
            <>
              {transferMsg && (
                <div
                  className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                    transferMsg.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {transferMsg.type === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{transferMsg.text}</span>
                </div>
              )}

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Novo Proprietário
                  </label>
                  <select
                    required
                    value={transferTargetUserId}
                    onChange={e => setTransferTargetUserId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition"
                  >
                    <option value="">Selecione o membro...</option>
                    {members
                      .filter(m => m.role !== 'OWNER')
                      .map(m => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.user_name || m.user_email} ({m.user_email}) - {m.role}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Seu novo papel após a transferência
                  </label>
                  <select
                    value={demoteSelfTo}
                    onChange={e => setDemoteSelfTo(e.target.value as 'ADMIN' | 'OWNER')}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition"
                  >
                    <option value="ADMIN">Permanecer como Administrador</option>
                    <option value="OWNER">Permanecer como Co-proprietário</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Confirmação: digite "{workspace.name}"
                  </label>
                  <input
                    type="text"
                    required
                    value={transferConfirmationText}
                    onChange={e => setTransferConfirmationText(e.target.value)}
                    placeholder={workspace.name}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-rose-500 transition"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={transferLoading || !transferTargetUserId}
                  className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>{transferLoading ? 'Transferindo...' : 'Confirmar Transferência'}</span>
                </button>
              </div>
            </>
          )}
        </form>
      )}

      {/* PAPÉIS CUSTOMIZADOS (PM-07) */}
      {activeSubTab === 'roles' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              Papéis Customizados no Workspace
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Defina perfis com conjuntos granulares de permissões específicas para atribuir aos membros do espaço de trabalho.
            </p>
          </div>

          {roleMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                roleMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {roleMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{roleMsg.text}</span>
            </div>
          )}

          {/* Criar Papel */}
          {isAdmin && (
            <form onSubmit={handleCreateRole} className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                Novo Papel Customizado
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Nome do Papel
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Revisor de Qualidade, Auditor Externo"
                    value={newRoleName}
                    onChange={e => setNewRoleName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Descrição (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Apenas audita tarefas e acompanha tempos"
                    value={newRoleDesc}
                    onChange={e => setNewRoleDesc(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">
                  Permissões Granulares
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-900/60 border border-slate-800 rounded-lg">
                  {AVAILABLE_PERMISSIONS.map(p => {
                    const checked = selectedPerms.includes(p.key);
                    return (
                      <label
                        key={p.key}
                        className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-start gap-2.5 transition ${
                          checked
                            ? 'bg-indigo-600/15 border-indigo-500/50 text-indigo-200'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            if (checked) {
                              setSelectedPerms(selectedPerms.filter(k => k !== p.key));
                            } else {
                              setSelectedPerms([...selectedPerms, p.key]);
                            }
                          }}
                          className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 mt-0.5 shrink-0"
                        />
                        <div>
                          <div className="font-semibold text-slate-200">{p.label}</div>
                          <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{p.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={!newRoleName.trim()}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs px-4 py-2 rounded-xl transition shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>Criar Papel</span>
                </button>
              </div>
            </form>
          )}

          {/* Lista de Papéis */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Papéis Customizados Cadastrados</span>
              <span>{customRoles.length} papel(éis)</span>
            </div>

            {rolesLoading ? (
              <div className="p-6 text-center text-slate-400 text-xs">Carregando papéis...</div>
            ) : customRoles.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Nenhum papel customizado configurado. Os membros utilizam os papéis padrão (OWNER, ADMIN, MEMBER, GUEST).
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {customRoles.map(role => (
                  <div
                    key={role.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-900/30 transition text-xs"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-100 text-sm">{role.name}</span>
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono">
                          ID: {role.id.substring(0, 8)}
                        </span>
                      </div>
                      {role.description && (
                        <p className="text-slate-400 text-[11px]">{role.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {role.permissions.map(perm => (
                          <span
                            key={perm}
                            className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700/60 font-mono"
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRole(role.id)}
                        className="text-slate-500 hover:text-rose-400 p-2 rounded-lg hover:bg-slate-800/50 transition self-start sm:self-center"
                        title="Excluir Papel"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* HIERARQUIA DE WORKSPACES (WS-07) */}
      {activeSubTab === 'hierarchy' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Network className="w-5 h-5 text-indigo-400" />
              Hierarquia & Sub-Workspaces
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Estruturação organizacional em árvore e visão consolidada de métricas e produtividade entre workspaces dependentes.
            </p>
          </div>

          {hierarchyMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                hierarchyMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {hierarchyMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{hierarchyMsg.text}</span>
            </div>
          )}

          {/* Cards de Métricas Consolidadas */}
          {hierarchySummary?.consolidatedMetrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 font-medium">Workspaces</span>
                <div className="text-2xl font-bold text-white mt-1">
                  {hierarchySummary.consolidatedMetrics.totalWorkspaces}
                </div>
                <span className="text-[10px] text-slate-500">1 pai + {hierarchySummary.subWorkspacesCount} filhos</span>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 font-medium">Total de Quadros</span>
                <div className="text-2xl font-bold text-indigo-400 mt-1">
                  {hierarchySummary.consolidatedMetrics.totalBoards}
                </div>
                <span className="text-[10px] text-slate-500">Na hierarquia</span>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 font-medium">Cartões Ativos</span>
                <div className="text-2xl font-bold text-emerald-400 mt-1">
                  {hierarchySummary.consolidatedMetrics.totalActiveCards}
                </div>
                <span className="text-[10px] text-slate-500">Em andamento</span>
              </div>
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 font-medium">Membros Únicos</span>
                <div className="text-2xl font-bold text-cyan-400 mt-1">
                  {hierarchySummary.consolidatedMetrics.totalUniqueMembers}
                </div>
                <span className="text-[10px] text-slate-500">Colaboradores</span>
              </div>
            </div>
          )}

          {/* Formulário para Criar Sub-Workspace */}
          {isAdmin && (
            <form onSubmit={handleCreateSubWorkspace} className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                Criar Novo Sub-Workspace Sob "{workspace.name}"
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Nome do Sub-Workspace
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Engenharia / Squad Alpha, Projeto XPTO"
                    value={newSubWsName}
                    onChange={e => setNewSubWsName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    E-mail de Cobrança / Notificação (Opcional)
                  </label>
                  <input
                    type="email"
                    placeholder="faturamento@empresa.com"
                    value={newSubWsEmail}
                    onChange={e => setNewSubWsEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={creatingSubWs || !newSubWsName.trim()}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs px-4 py-2 rounded-xl transition shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>{creatingSubWs ? 'Criando...' : 'Adicionar Sub-Workspace'}</span>
                </button>
              </div>
            </form>
          )}

          {/* Lista de Sub-workspaces */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Sub-Workspaces Vinculados</span>
              <span>{subWorkspaces.length} sub-workspace(s)</span>
            </div>

            {hierarchyLoading ? (
              <div className="p-6 text-center text-slate-400 text-xs">Carregando hierarquia...</div>
            ) : subWorkspaces.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                Este workspace não possui sub-workspaces vinculados abaixo dele.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {subWorkspaces.map(sub => (
                  <div
                    key={sub.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-900/30 transition text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                        <Building className="w-4 h-4 text-indigo-400" />
                        {sub.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-4">
                        <span>Quadros: <strong className="text-slate-200">{sub.boards_count}</strong></span>
                        <span>Membros: <strong className="text-slate-200">{sub.members_count}</strong></span>
                        {sub.billing_email && (
                          <span className="text-slate-500">Cobrança: {sub.billing_email}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Criado em {new Date(sub.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SSO E PROVISIONAMENTO AUTOMÁTICO (WS-08) */}
      {activeSubTab === 'sso' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-400" />
              Single Sign-On (SSO) & Provisionamento Automático
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Habilite autenticação corporativa via provedores de identidade SAML 2.0, OpenID Connect ou Google Workspace com auto-provisionamento de membros.
            </p>
          </div>

          {ssoMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
                ssoMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {ssoMsg.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{ssoMsg.text}</span>
            </div>
          )}

          {ssoLoading ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Carregando configurações de SSO...
            </div>
          ) : (
            <>
              {/* Configuração de SSO */}
              <form onSubmit={handleSaveSso} className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Configuração de Provedor de Identidade
                </h3>

                <label className="flex items-start gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition">
                  <input
                type="checkbox"
                checked={ssoEnabled}
                onChange={e => setSsoEnabled(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
              />
              <div>
                <div className="font-semibold text-slate-200 text-xs">
                  Ativar Logon Único Corporativo (SSO)
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Exige ou permite que os usuários façam login com suas credenciais corporativas no provedor configurado.
                </div>
              </div>
            </label>

            {ssoEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Provedor de Identidade (IdP)
                  </label>
                  <select
                    value={ssoProvider}
                    onChange={e => setSsoProvider(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition"
                  >
                    <option value="GOOGLE">Google Workspace / GSuite</option>
                    <option value="SAML">SAML 2.0 Corporativo</option>
                    <option value="OIDC">OpenID Connect (OIDC)</option>
                    <option value="OKTA">Okta Identity Cloud</option>
                    <option value="AZURE">Microsoft Entra ID (Azure AD)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Domínio Autorizado para Provisionamento
                  </label>
                  <input
                    type="text"
                    placeholder="ex: empresa.com.br"
                    value={ssoDomain}
                    onChange={e => setSsoDomain(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                  />
                  <span className="text-[10px] text-slate-500">
                    Usuários autenticados com este domínio serão criados e adicionados automaticamente.
                  </span>
                </div>
              </div>
            )}

            {isAdmin && (
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={ssoSaving}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-xs px-4 py-2.5 rounded-xl transition shadow"
                >
                  <Save className="w-4 h-4" />
                  <span>{ssoSaving ? 'Salvando...' : 'Salvar Configuração SSO'}</span>
                </button>
              </div>
            )}
          </form>

          {/* Teste de Provisionamento Automático (SCIM/SSO) */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              Testar Login SSO & Auto-Provisionamento (Just-In-Time)
            </h3>
            <p className="text-xs text-slate-400">
              Simule um fluxo de autenticação corporativa para verificar se novos colaboradores são cadastrados e vinculados ao workspace instantaneamente.
            </p>

            <form onSubmit={handleTestSsoLogin} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="email"
                  required
                  placeholder={`usuario@${ssoDomain || 'empresa.com'}`}
                  value={testSsoEmail}
                  onChange={e => setTestSsoEmail(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
                <input
                  type="text"
                  placeholder="Nome do Colaborador (Opcional)"
                  value={testSsoName}
                  onChange={e => setTestSsoName(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={testSsoLoading || !testSsoEmail.trim() || !ssoEnabled}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-medium text-xs px-4 py-2 rounded-xl border border-slate-700 transition"
                >
                  <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{testSsoLoading ? 'Testando...' : 'Simular Login SSO'}</span>
                </button>
              </div>
            </form>

            {testSsoResult && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  testSsoResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {testSsoResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>{testSsoResult.message}</span>
                </div>
                {testSsoResult.user && (
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300">
                    <div>Usuário: {testSsoResult.user.name} ({testSsoResult.user.email})</div>
                    <div>Papel no Workspace: {testSsoResult.provisionedAs}</div>
                  </div>
                )}
              </div>
            )}
          </div>
            </>
          )}
        </div>
      )}

      {/* 6. LOGS DE AUDITORIA (EV-02) */}
      {activeSubTab === 'audit' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" />
              Log de Auditoria e Governança
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Registro cronológico imutável de ações administrativas realizadas neste Workspace.
            </p>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-900/60 border-b border-slate-800 text-xs font-semibold text-slate-400 flex items-center justify-between">
              <span>Ação & Alvo</span>
              <span>Autor & Data</span>
            </div>

            {auditLoading ? (
              <div className="p-6 text-center text-slate-400 text-xs">Carregando logs...</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs italic">
                Nenhuma ação de auditoria registrada até o momento.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 max-h-96 overflow-y-auto">
                {auditLogs.map(log => (
                  <div
                    key={log.id}
                    className="px-4 py-3 flex items-start justify-between hover:bg-slate-900/30 transition text-xs"
                  >
                    <div>
                      <span className="font-semibold text-indigo-300">{log.action}</span>
                      <span className="text-slate-400 ml-1.5">[{log.target_type}]</span>
                      {log.details && (
                        <div className="text-[11px] text-slate-400 mt-0.5">{log.details}</div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-medium text-slate-300">
                        {log.user_name || log.user_email || 'Sistema'}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
