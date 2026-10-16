import React, { useEffect, useState, useMemo } from 'react';
import { MyDayCard } from '../types';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  X,
  Sun,
  Calendar,
  Building,
  LayoutDashboard,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  User as UserIcon,
  ExternalLink,
} from 'lucide-react';

interface MyDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToBoard: (workspaceId: string, boardId: string) => void;
}

export const MyDayModal: React.FC<MyDayModalProps> = ({
  isOpen,
  onClose,
  onNavigateToBoard,
}) => {
  const { user } = useAuth();
  const [cards, setCards] = useState<MyDayCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterMode, setFilterMode] = useState<'MY_CARDS' | 'DUE_SOON' | 'ALL_OPEN'>('MY_CARDS');

  useEffect(() => {
    if (isOpen) {
      loadMyDay();
    }
  }, [isOpen]);

  const loadMyDay = async () => {
    try {
      setLoading(true);
      const list = await api.getMyDayCards();
      setCards(list);
    } catch (err) {
      console.error('Erro ao carregar Meu Dia:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCards = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return cards.filter(card => {
      if (card.is_done_column) return false;

      if (filterMode === 'MY_CARDS') {
        const isAssignedToMe =
          card.assignee &&
          user?.name &&
          card.assignee.toLowerCase().includes(user.name.toLowerCase());

        if (isAssignedToMe) return true;

        // Inclui também cartões que vencem hoje ou estão atrasados
        if (card.due_date) {
          const parts = card.due_date.split('-');
          if (parts.length === 3) {
            const due = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            if (due <= today) return true;
          }
        }
        return false;
      }

      if (filterMode === 'DUE_SOON') {
        if (!card.due_date) return false;
        const parts = card.due_date.split('-');
        if (parts.length !== 3) return false;
        const due = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 3;
      }

      return true;
    });
  }, [cards, filterMode, user]);

  if (!isOpen) return null;

  const stats = {
    totalOpen: cards.filter(c => !c.is_done_column).length,
    assignedToMe: cards.filter(
      c => !c.is_done_column && c.assignee && user?.name && c.assignee.toLowerCase().includes(user.name.toLowerCase())
    ).length,
    blocked: cards.filter(c => !c.is_done_column && c.is_blocked).length,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-slate-900">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <Sun className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Meu Dia — Visão Agregada</h2>
              <p className="text-xs text-slate-400">
                Consolidação de tarefas pendentes em todos os seus workspaces e quadros acessíveis.
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

        {/* Resumo e Filtros Rápidos */}
        <div className="px-6 py-3.5 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterMode('MY_CARDS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterMode === 'MY_CARDS'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              Para Mim & Urgentes ({stats.assignedToMe})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('DUE_SOON')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterMode === 'DUE_SOON'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              Vencendo em até 3 dias
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('ALL_OPEN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filterMode === 'ALL_OPEN'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              Todas Abertas ({stats.totalOpen})
            </button>
          </div>

          {stats.blocked > 0 && (
            <span className="text-xs text-rose-300 bg-rose-500/20 border border-rose-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1 font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{stats.blocked} bloqueada(s)</span>
            </span>
          )}
        </div>

        {/* Lista de Cartões */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-xs text-slate-400">
              Carregando cartões de todos os quadros...
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto opacity-80" />
              <p className="text-sm font-semibold text-slate-200">Tudo em dia por aqui!</p>
              <p className="text-xs text-slate-500">
                Nenhum cartão pendente encontrado para este filtro.
              </p>
            </div>
          ) : (
            filteredCards.map(card => (
              <div
                key={card.id}
                className={`p-4 rounded-xl border bg-slate-800/80 hover:bg-slate-800 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  card.is_blocked ? 'border-rose-500/50' : 'border-slate-700/80'
                }`}
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1 text-indigo-300 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-500/30">
                      <Building className="w-3 h-3" />
                      <span>{card.workspace_name}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-300 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-500/30">
                      <LayoutDashboard className="w-3 h-3" />
                      <span>{card.board_title}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                      Coluna: <strong>{card.column_title}</strong>
                    </span>
                    {card.is_blocked && (
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Bloqueado</span>
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-white truncate">{card.title}</h4>

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    {card.due_date && (
                      <span className="flex items-center gap-1 text-amber-300">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Prazo: {card.due_date}</span>
                      </span>
                    )}
                    {card.assignee && (
                      <span className="flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{card.assignee}</span>
                      </span>
                    )}
                    {card.estimate && (
                      <span className="text-cyan-300 font-medium">Est: {card.estimate}</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onNavigateToBoard(card.workspace_id, card.board_id);
                    onClose();
                  }}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shrink-0 self-start sm:self-center transition shadow"
                >
                  <span>Ir ao Quadro</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
