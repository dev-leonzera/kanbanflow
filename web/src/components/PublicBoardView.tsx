import React, { useEffect, useState } from 'react';
import { Board, Card } from '../types';
import { api } from '../api/client';
import { CardItem } from './CardItem';
import { Globe, Lock, AlertCircle, ArrowLeft } from 'lucide-react';
import { CardModal } from './CardModal';

interface PublicBoardViewProps {
  token: string;
  onExitPublicView?: () => void;
}

export const PublicBoardView: React.FC<PublicBoardViewProps> = ({ token, onExitPublicView }) => {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  useEffect(() => {
    loadPublicBoard();
  }, [token]);

  const loadPublicBoard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPublicBoard(token);
      setBoard(data);
    } catch (err: any) {
      setError(err.message || 'Este link público é inválido ou expirou.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Carregando quadro público...</p>
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-300">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md shadow-2xl space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-white">Acesso Indisponível</h2>
          <p className="text-xs text-rose-300">{error || 'Link não encontrado ou expirado.'}</p>
          {onExitPublicView && (
            <button
              onClick={onExitPublicView}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Ir para a Plataforma</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
      {/* Read-only Header */}
      <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-lg text-white shadow">
            K
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white leading-none">{board.title}</h1>
              <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                <Globe className="w-3 h-3" />
                Leitura Pública
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Visualização somente leitura compartilhada
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onExitPublicView && (
            <button
              onClick={onExitPublicView}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium transition"
            >
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Acessar Minha Conta</span>
            </button>
          )}
        </div>
      </header>

      {/* Columns & Cards */}
      <main className="flex-1 flex gap-6 p-6 overflow-x-auto items-start">
        {board.columns.map(column => (
          <section
            key={column.id}
            className="flex-shrink-0 w-80 max-h-full flex flex-col bg-slate-900/70 border border-slate-800 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm"
          >
            <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between gap-2 bg-slate-800/40">
              <h2 className="font-bold text-sm text-slate-100 tracking-wide truncate">
                {column.title}
              </h2>
              <span className="text-xs font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full">
                {column.cards.length}
              </span>
            </div>

            <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[150px]">
              {column.cards.map(card => (
                <CardItem
                  key={card.id}
                  card={card}
                  columnTitle={column.title}
                  estimateType={board.estimate_type || 'POINTS'}
                  onView={() => setSelectedCard(card)}
                  onEdit={() => setSelectedCard(card)}
                  onDelete={() => {}}
                  onToggleSubtask={() => {}}
                />
              ))}

              {column.cards.length === 0 && (
                <div className="py-8 text-center text-slate-600 text-xs">
                  Sem cartões nesta coluna
                </div>
              )}
            </div>
          </section>
        ))}
      </main>

      {/* Read-only view modal */}
      {selectedCard && (
        <CardModal
          isOpen={Boolean(selectedCard)}
          mode="view"
          columnId={selectedCard.column_id}
          columnTitle={board.columns.find(c => c.id === selectedCard.column_id)?.title}
          estimateType={board.estimate_type || 'POINTS'}
          cardToEdit={selectedCard}
          allBoardCards={board.columns.flatMap(c => c.cards)}
          onClose={() => setSelectedCard(null)}
          onSwitchToEdit={() => {}}
          onSwitchToView={() => {}}
          onSave={async () => {}}
          onToggleSubtask={() => {}}
          onRefreshBoard={async () => {}}
        />
      )}
    </div>
  );
};

