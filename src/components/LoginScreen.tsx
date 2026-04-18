import { useState } from 'react';
import { GameState, Player, generateId } from '../store/gameStore';

interface Props {
  state: GameState;
  onJoin: (player: Player) => void;
  onAdminLogin: () => void;
}

const ADMIN_PASSWORD = 'gigantic536wall';

export default function LoginScreen({ state, onJoin, onAdminLogin }: Props) {
  const [nick, setNick] = useState('');
  const [adminMode, setAdminMode] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  const [error, setError] = useState('');
  const [passError, setPassError] = useState('');

  const handleJoin = () => {
    const trimmed = nick.trim();
    if (!trimmed) { setError('Введи свой ник!'); return; }
    if (trimmed.length > 20) { setError('Ник не должен превышать 20 символов'); return; }
    if (state.phase !== 'lobby') { setError('Игра уже началась, дождись следующей'); return; }
    const exists = state.players.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) { setError('Этот ник уже занят, выбери другой'); return; }

    const player: Player = {
      id: generateId(),
      name: trimmed,
      score: 0,
      joinedAt: Date.now(),
      isConnected: true,
      lastSeen: Date.now(),
    };
    onJoin(player);
  };

  const handleAdminLogin = () => {
    if (adminPass === ADMIN_PASSWORD) {
      onAdminLogin();
    } else {
      setPassError('Неверный пароль');
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decorative */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-red-900/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-orange-900/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-950/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-red-600 to-orange-500 shadow-2xl shadow-red-900/50 mb-4">
            <span className="text-4xl">🎮</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight">
            DOTA 2 <span className="text-red-500">QUIZ</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm">Викторина для настоящих знатоков Доты</p>
        </div>

        {/* Status badge */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`w-2 h-2 rounded-full ${state.phase === 'lobby' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
          <span className="text-sm text-gray-400">
            {state.phase === 'lobby' ? `Лобби · ${state.players.length} игроков` : 'Игра идёт · Подождите следующую'}
          </span>
        </div>

        {!adminMode ? (
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Войти в игру</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Твой игровой ник</label>
                <input
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all"
                  placeholder="Введи ник..."
                  value={nick}
                  onChange={e => { setNick(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  maxLength={20}
                />
                {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
              </div>

              <button
                onClick={handleJoin}
                disabled={state.phase !== 'lobby'}
                className="w-full bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-900/30 active:scale-95"
              >
                {state.phase === 'lobby' ? '⚔️ Играть' : '⏳ Игра идёт...'}
              </button>
            </div>

            {/* Players in lobby */}
            {state.players.length > 0 && (
              <div className="mt-5 pt-5 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider">Уже в лобби</p>
                <div className="flex flex-wrap gap-2">
                  {state.players.map(p => (
                    <span key={p.id} className="bg-[#0d1117] border border-gray-700 text-gray-300 text-xs px-3 py-1 rounded-full">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-gray-800 text-center">
              <button
                onClick={() => setAdminMode(true)}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Вход для администратора
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">Панель администратора</h2>
            <p className="text-xs text-gray-500 mb-4">Только для организатора игры</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Пароль администратора</label>
                <input
                  type="password"
                  className="w-full bg-[#0d1117] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all"
                  placeholder="Введи пароль..."
                  value={adminPass}
                  onChange={e => { setAdminPass(e.target.value); setPassError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
                />
                {passError && <p className="text-red-400 text-xs mt-1.5">{passError}</p>}
              </div>

              <button
                onClick={handleAdminLogin}
                className="w-full bg-gradient-to-r from-purple-700 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95"
              >
                🔑 Войти как администратор
              </button>

              <button
                onClick={() => setAdminMode(false)}
                className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors"
              >
                ← Назад
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-700 mt-6">
          Можно открыть в нескольких вкладках браузера для теста
        </p>
      </div>
    </div>
  );
}
