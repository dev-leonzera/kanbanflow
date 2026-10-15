import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogIn, Sparkles } from 'lucide-react';

interface LoginProps {
  onSwitchToRegister: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSwitchToRegister }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Falha ao fazer login.');
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setEmail('test@example.com');
    setPassword('password123');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950 selection:bg-indigo-500 selection:text-white">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-2xl text-white mx-auto mb-3 shadow-lg shadow-indigo-500/30">
            K
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Bem-vindo ao KanbanFlow</h1>
          <p className="text-sm text-slate-400 mt-1">Entre com sua conta para gerenciar seus projetos</p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              E-mail
            </label>
            <input
              type="email"
              required
              placeholder="seu.email@exemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-850 border border-slate-750 bg-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Senha
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-750 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2 mt-2"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'Entrando...' : 'Entrar na Conta'}</span>
          </button>
        </form>

        {/* Demo account autofill button - Apenas em desenvolvimento (TD-03) */}
        {import.meta.env.DEV && (
          <div className="mt-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={handleFillDemo}
              className="w-full py-2 px-3 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-indigo-300 text-xs font-medium rounded-xl border border-slate-750 transition flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Preencher com conta de teste demo (Dev)</span>
            </button>
          </div>
        )}

        {/* Switch to Register */}
        <div className="mt-6 text-center text-xs text-slate-400">
          Não tem uma conta?{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="text-indigo-400 hover:text-indigo-300 font-semibold transition"
          >
            Criar conta gratuita
          </button>
        </div>
      </div>
    </div>
  );
};

