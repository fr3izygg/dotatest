import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GameState,
  loadState,
  saveState,
  subscribeToState,
  getInitialState,
  withGameEpochDefaults,
} from '../store/gameStore';
import { supabase } from '../lib/supabaseClient';

function loadRoomStateFromLocal(roomId: string): GameState | null {
  try {
    const raw = localStorage.getItem(`dota2quiz_room_${roomId}_state`);
    if (!raw) return null;
    return withGameEpochDefaults(JSON.parse(raw) as GameState);
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
    return loadRoomStateFromLocal(roomId) ?? loadState() ?? getInitialState();
  });

  const roomIdRef = useRef(roomId);
  const lastAppliedRef = useRef<number>(state.lastUpdated);
  /** Макс. известная версия состояния с сервера — отсекает устаревшие записи с других вкладок */
  const remoteEpochRef = useRef<number>(state.gameEpoch ?? 0);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    lastAppliedRef.current = state.lastUpdated;
  }, [state.lastUpdated]);

  useEffect(() => {
    remoteEpochRef.current = 0;
    const local = loadRoomStateFromLocal(roomId);
    if (local) {
      setState(local);
      remoteEpochRef.current = local.gameEpoch ?? 0;
    }

    const interval = setInterval(() => {
      const s = loadRoomStateFromLocal(roomId);
      if (s && s.lastUpdated !== lastAppliedRef.current) {
        lastAppliedRef.current = s.lastUpdated;
        setState(s);
      }
    }, 300);

    const unsubLocal = subscribeToState((s) => {
      const n = withGameEpochDefaults(s);
      if ((n.gameEpoch ?? 0) < remoteEpochRef.current) return;
      remoteEpochRef.current = Math.max(remoteEpochRef.current, n.gameEpoch ?? 0);
      lastAppliedRef.current = n.lastUpdated;
      setState(n);
    });

    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let cancelled = false;

    const applyRemote = (st: GameState) => {
      const n = withGameEpochDefaults(st);
      if ((n.gameEpoch ?? 0) < remoteEpochRef.current) return;
      remoteEpochRef.current = Math.max(remoteEpochRef.current, n.gameEpoch ?? 0);
      lastAppliedRef.current = n.lastUpdated;
      setState(n);
      saveRoomStateToLocal(roomId, n);
    };

    const bootstrapSupabase = async () => {
      if (!supabase) return;

      const { data, error } = await supabase.from('rooms').select('state').eq('id', roomId).maybeSingle();
      if (error) {
        console.error('[supabase] rooms select error', error);
        return;
      }
      const next = data?.state as GameState | undefined;
      if (!cancelled && next) {
        applyRemote(next);
      }

      channel = supabase
        .channel(`room:${roomId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          (payload) => {
            const row = (payload.new as Record<string, unknown>) || (payload.old as Record<string, unknown>);
            const st = row?.state as GameState | undefined;
            if (!st) return;
            if (!cancelled) applyRemote(st);
          }
        )
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('[supabase] realtime channel', status, err);
          }
        });
    };

    bootstrapSupabase();

    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubLocal();
      if (channel) supabase?.removeChannel(channel);
    };
  }, [roomId]);

  const updateState = useCallback((updater: (prev: GameState) => GameState) => {
    setState(prev => {
      let next = withGameEpochDefaults(updater(prev));
      const nextE = next.gameEpoch ?? 0;
      if (nextE < remoteEpochRef.current) {
        return prev;
      }

      saveRoomStateToLocal(roomIdRef.current, next);
      saveState(next);

      if (supabase) {
        const client = supabase;
        void client
          .rpc('upsert_room_state', { p_id: roomIdRef.current, p_state: next })
          .then(({ error }) => {
            if (error) {
              console.warn('[supabase] upsert_room_state RPC failed, fallback upsert', error);
              void client
                .from('rooms')
                .upsert({
                  id: roomIdRef.current,
                  state: next,
                  updated_at: new Date().toISOString(),
                })
                .then(({ error: e2 }) => {
                  if (e2) console.error('[supabase] rooms upsert error', e2);
                  else remoteEpochRef.current = Math.max(remoteEpochRef.current, next.gameEpoch ?? 0);
                });
            } else {
              remoteEpochRef.current = Math.max(remoteEpochRef.current, next.gameEpoch ?? 0);
            }
          });
      } else {
        remoteEpochRef.current = Math.max(remoteEpochRef.current, nextE);
      }
      return next;
    });
  }, []);

  return { state, updateState };
}
