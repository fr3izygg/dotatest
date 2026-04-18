import { useState, useEffect, useCallback } from 'react';
import { GameState, loadState, saveState, subscribeToState, getInitialState } from '../store/gameStore';

export function useGameState() {
  const [state, setState] = useState<GameState>(() => {
    return loadState() ?? getInitialState();
  });

  useEffect(() => {
    // Poll localStorage every 300ms as fallback
    const interval = setInterval(() => {
      const s = loadState();
      if (s && s.lastUpdated !== state.lastUpdated) {
        setState(s);
      }
    }, 300);

    const unsub = subscribeToState((s) => {
      setState(s);
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [state.lastUpdated]);

  const updateState = useCallback((updater: (prev: GameState) => GameState) => {
    setState(prev => {
      const next = updater(prev);
      saveState(next);
      return next;
    });
  }, []);

  return { state, updateState };
}
