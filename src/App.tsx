import { useState, useEffect, useRef } from 'react';
import { useGameState } from './hooks/useGameState';
import { Player, saveState, getInitialState, applyPendingPointsForQuestion } from './store/gameStore';
import LoginScreen from './components/LoginScreen';
import LobbyScreen from './components/LobbyScreen';
import QuestionScreen from './components/QuestionScreen';
import BreakScreen from './components/BreakScreen';
import FinishedScreen from './components/FinishedScreen';
import AdminPanel from './components/AdminPanel';

type AppMode = 'login' | 'player' | 'admin';

const BREAK_DURATION = 8000; // 8 seconds

export default function App() {
  const { state, updateState } = useGameState();
  const [mode, setMode] = useState<AppMode>('login');
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);

  // Heartbeat: keep player alive
  useEffect(() => {
    if (!currentPlayer || mode !== 'player') return;
    const interval = setInterval(() => {
      updateState(prev => ({
        ...prev,
        players: prev.players.map(p =>
          p.id === currentPlayer.id ? { ...p, lastSeen: Date.now(), isConnected: true } : p
        ),
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, [currentPlayer, mode, updateState]);

  // Auto-advance break → next question (ADMIN only to avoid multiple tabs racing)
  const breakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mode !== 'admin') return;
    if (state.phase === 'break') {
      if (breakTimerRef.current) clearTimeout(breakTimerRef.current);
      breakTimerRef.current = setTimeout(() => {
        updateState(prev => {
          if (prev.phase !== 'break') return prev;
          const qId = prev.questions[prev.currentQuestionIndex]?.id;
          const s = qId ? applyPendingPointsForQuestion(prev, qId) : prev;
          const nextIdx = s.currentQuestionIndex + 1;
          if (nextIdx >= s.questions.length) {
            return { ...s, phase: 'finished' };
          }
          return {
            ...s,
            phase: 'question',
            currentQuestionIndex: nextIdx,
            answers: [],
            questionStartedAt: Date.now(),
            adminSkipBreak: false,
          };
        });
      }, BREAK_DURATION);
    } else {
      if (breakTimerRef.current) clearTimeout(breakTimerRef.current);
    }
    return () => {
      if (breakTimerRef.current) clearTimeout(breakTimerRef.current);
    };
  }, [state.phase, state.breakStartedAt, mode]);

  // Initialize state if needed
  useEffect(() => {
    const existing = localStorage.getItem('dota2quiz_state');
    if (!existing) {
      const fresh = getInitialState();
      saveState(fresh);
    }
  }, []);

  const handleJoin = (player: Player) => {
    updateState(prev => ({
      ...prev,
      players: [...prev.players.filter(p => p.id !== player.id), player],
    }));
    setCurrentPlayer(player);
    setMode('player');
  };

  const handleAdminLogin = () => {
    setMode('admin');
  };

  const handleAdminLogout = () => {
    setMode('login');
  };

  // ADMIN MODE
  if (mode === 'admin') {
    return <AdminPanel state={state} updateState={updateState} onLogout={handleAdminLogout} />;
  }

  // LOGIN
  if (mode === 'login') {
    return (
      <LoginScreen
        state={state}
        onJoin={handleJoin}
        onAdminLogin={handleAdminLogin}
      />
    );
  }

  // PLAYER MODE
  if (!currentPlayer) {
    return <LoginScreen state={state} onJoin={handleJoin} onAdminLogin={handleAdminLogin} />;
  }

  // Sync currentPlayer score from state
  const syncedPlayer = state.players.find(p => p.id === currentPlayer.id) ?? currentPlayer;

  switch (state.phase) {
    case 'lobby':
      return <LobbyScreen state={state} currentPlayer={syncedPlayer} />;
    case 'question':
    case 'paused':
      return (
        <QuestionScreen
          state={state}
          currentPlayer={syncedPlayer}
          updateState={updateState}
        />
      );
    case 'break':
      return <BreakScreen state={state} currentPlayer={syncedPlayer} />;
    case 'finished':
      return <FinishedScreen state={state} currentPlayer={syncedPlayer} />;
    default:
      return <LobbyScreen state={state} currentPlayer={syncedPlayer} />;
  }
}
