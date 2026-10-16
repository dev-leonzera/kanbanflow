import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { BoardView } from './components/BoardView';
import { PublicBoardView } from './components/PublicBoardView';

export const App: React.FC = () => {
  const { user, loading } = useAuth();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const publicTokenFromUrl =
    new URLSearchParams(window.location.search).get('publicToken') ||
    (window.location.pathname.startsWith('/public/')
      ? window.location.pathname.replace('/public/', '')
      : null);

  if (publicTokenFromUrl) {
    return (
      <PublicBoardView
        token={publicTokenFromUrl}
        onExitPublicView={() => {
          window.location.href = window.location.pathname.startsWith('/public/') ? '/' : window.location.pathname;
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-slate-300">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium">Iniciando KanbanFlow...</p>
      </div>
    );
  }

  if (!user) {
    return authMode === 'login' ? (
      <Login onSwitchToRegister={() => setAuthMode('register')} />
    ) : (
      <Register onSwitchToLogin={() => setAuthMode('login')} />
    );
  }

  return <BoardView />;
};


