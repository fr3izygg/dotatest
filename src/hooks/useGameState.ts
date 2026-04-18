import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, loadState, saveState, subscribeToState, getInitialState } from '../store/gameStore';
import { supabase } from '../lib/supabaseClient';

function loadRoomStateFromLocal(roomId: string): GameState | null {
  try {
    const raw = localStorage.getItem(`dota2quiz_room_${roomId}_state`);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

function saveRoomStateToLocal(roomId: string, state: GameState) {
  try {
    localStorage.setItem(`dota2quiz_room_${roomId}_state`, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function useGameState(roomId: string) {
  const [state, setState] = useState<GameState>(() => {
    // сначала пробуем комнатное состояние, потом старое одиночное
    return loadRoomStateFromLocal(roomId) ?? loadState() ?? getInitialState();
  });

  const roomIdRef = useRef(roomId);
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    // При смене комнаты — загрузить актуальное
    const local = loadRoomStateFromLocal(roomId);
    if (local) setState(local);

    // Poll localStorage every 300ms as fallback (для режима без Supabase)
    const interval = setInterval(() => {
      const s = loadRoomStateFromLocal(roomId);
      if (s && s.lastUpdated !== state.lastUpdated) {
        setState(s);
      }
    }, 300);

    const unsubLocal = subscribeToState((s) => {
      // старый канал между вкладками одной машины
      setState(s);
    });

    // Supabase realtime: одна комната на всех устройствах
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let cancelled = false;

    const bootstrapSupabase = async () => {
      if (!supabase) return;

      const { data } = await supabase.from('rooms').select('state').eq('id', roomId).maybeSingle();
      const next = data?.state as GameState | undefined;
      if (!cancelled && next) {
        setState(next);
        saveRoomStateToLocal(roomId, next);
      }

      channel = supabase
        .channel(`room:${roomId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          (payload) => {
            const row = (payload.new as any) || (payload.old as any);
            const st = row?.state as GameState | undefined;
            if (!st) return;
            setState(st);
            saveRoomStateToLocal(roomId, st);
          }
        )
        .subscribe();
    };

    bootstrapSupabase();

    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubLocal();
      if (channel) supabase?.removeChannel(channel);
    };
  }, [roomId, state.lastUpdated]);

  const updateState = useCallback((updater: (prev: GameState) => GameState) => {
    setState(prev => {
      const next = updater(prev);
      // локально всегда сохраняем (и для офлайна, и чтобы вкладки на одной машине видели сразу)
      saveRoomStateToLocal(roomIdRef.current, next);
      saveState(next);

      // если настроен Supabase — пушим состояние в общую БД
      if (supabase) {
        void supabase
          .from('rooms')
          .upsert({ id: roomIdRef.current, state: next, updated_at: new Date().toISOString() });
      }
      return next;
    });
  }, []);

  return { state, updateState };
}
