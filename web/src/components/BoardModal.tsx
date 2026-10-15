import React, { useState, useEffect } from 'react';
import { X, LayoutDashboard } from 'lucide-react';

interface BoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
  initialTitle?: string;
  title?: string;
}

export const BoardModal: React.FC<BoardModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTitle = '',
  title = 'Novo Quadro',
}) => {
  const [boardTitle, setBoardTitle] = useState(initialTitle);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setBoardTitle(initialTitle);
      setError(null);
    }
  }, [isOpen, initialTitle]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardTitle.trim()) {
      setError('O título do quadro é obrigatório.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await onSave(boardTitle.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar quadro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-lg">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-base">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Título do Quadro
            </label>
            <input
              type="text"
              autoFocus
              placeholder="Ex: Sprint 1, Roadmap 2026, Tarefas da Semana..."
              value={boardTitle}
              onChange={e => setBoardTitle(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center gap-2"
            >
              {loading ? 'Salvando...' : 'Salvar Quadro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

