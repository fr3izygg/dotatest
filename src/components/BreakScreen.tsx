import { useEffect, useState, useMemo } from 'react';
import { GameState, Player } from '../store/gameStore';

interface Props {
  state: GameState;
  currentPlayer: Player;
}

export default function BreakScreen({ state, currentPlayer }: Props) {
  const [countdown, setCountdown] = useState(Math.ceil(state.breakDuration / 1000));
  const synced = useMemo(
    () => state.players.find(p => p.id === currentPlayer.id) ?? currentPlayer,
    [state.players, currentPlayer]
  );
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  const question = state.questions[state.currentQuestionIndex];
  const myRow = question
    ? (state.allAnswers[question.id] || []).find(a => a.playerId === currentPlayer.id)
    : undefined;

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - state.breakStartedAt;
      const remaining = Math.max(0, Math.ceil((state.breakDuration - elapsed) / 1000));
      setCountdown(remaining);
    }, 200);
    return () => clearInterval(interval);
  }, [state.breakStartedAt, state.breakDuration]);

  const myRank = sorted.findIndex(p => p.id === currentPlayer.id) + 1;

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}.`;
  };

  const verdict = myRow?.checkedByAdmin
    ? myRow.isCorrect === true
      ? 'correct'
      : 'wrong'
    : myRow
      ? 'pending'
      : 'none';

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-900/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-lg mx-auto w-full flex flex-col gap-4">
        {/* Итог только на перерыве: зелёный / красный экран */}
        <div
          className={`rounded-2xl min-h-[30vh] flex flex-col items-center justify-center text-center px-6 py-10 border-2 shadow-2xl ${
            verdict === 'correct'
              ? 'bg-gradient-to-b from-green-600 to-green-900 border-green-400/60'
              : verdict === 'wrong'
                ? 'bg-gradient-to-b from-red-700 to-red-950 border-red-500/60'
                : verdict === 'pending'
                  ? 'bg-gradient-to-b from-amber-900/80 to-[#161b22] border-amber-600/40'
                  : 'bg-[#161b22] border-gray-700'
          }`}
        >
          {verdict === 'correct' && (
            <>
              <span className="text-6xl mb-3 drop-shadow-lg">✅</span>
              <p className="text-white text-2xl font-black tracking-tight">Верно!</p>
              <p className="text-green-100/90 text-sm mt-2 max-w-xs">
                Очки за этот вопрос добавятся к счёту с началом следующего раунда.
              </p>
            </>
          )}
          {verdict === 'wrong' && (
            <>
              <span className="text-6xl mb-3 drop-shadow-lg">❌</span>
              <p className="text-white text-2xl font-black tracking-tight">Неверно</p>
              <p className="text-red-100/85 text-sm mt-2 max-w-xs">
                Следующий вопрос — новый шанс. Баллы за прошлый раунд уже зафиксированы у ведущего.
              </p>
            </>
          )}
          {verdict === 'pending' && (
            <>
              <span className="text-5xl mb-3">⏳</span>
              <p className="text-amber-100 text-xl font-bold">Ответ ждёт проверки</p>
              <p className="text-amber-200/70 text-sm mt-2">Ведущий ещё не выставил вердикт по твоему ответу.</p>
            </>
          )}
          {verdict === 'none' && (
            <>
              <span className="text-4xl mb-3">—</span>
              <p className="text-gray-300 text-lg font-bold">Нет ответа</p>
              <p className="text-gray-500 text-sm mt-2">На этот вопрос ты не отправлял ответ.</p>
            </>
          )}
        </div>

        {/* Header */}
        <div className="text-center">
          <div className="text-4xl mb-2">🏆</div>
          <h2 className="text-2xl font-black text-white">Таблица лидеров</h2>
          {countdown > 0 ? (
            <p className="text-gray-400 text-sm mt-1">
              Следующий вопрос через <span className="text-white font-bold">{countdown}</span> сек.
            </p>
          ) : (
            <p className="text-gray-400 text-sm mt-1">Загружаем следующий вопрос...</p>
          )}
        </div>

        {myRank > 0 && (
          <div className="bg-gradient-to-r from-red-900/40 to-orange-900/40 border border-red-700/40 rounded-xl p-3 flex items-center justify-between">
            <span className="text-gray-300 text-sm">Твоя позиция</span>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{getRankIcon(myRank)}</span>
              <span className="text-white font-bold">{synced.score} очков</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {sorted.map((player, idx) => {
            const isMe = player.id === currentPlayer.id;
            const rank = idx + 1;
            return (
              <div
                key={player.id}
                className={`flex items-center gap-3 rounded-xl px-4 py-3.5 border transition-all ${
                  isMe
                    ? 'bg-red-600/20 border-red-600/40'
                    : rank <= 3
                      ? 'bg-[#161b22] border-yellow-700/30'
                      : 'bg-[#161b22] border-gray-800'
                }`}
              >
                <div className="w-8 text-center text-lg font-bold">{getRankIcon(rank)}</div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <span className={`flex-1 font-medium ${isMe ? 'text-red-300' : 'text-gray-200'}`}>
                  {player.name}
                  {isMe && <span className="text-red-500 text-xs ml-1">(ты)</span>}
                </span>
                <span className="text-yellow-400 font-bold">{player.score}</span>
              </div>
            );
          })}
        </div>

        {countdown > 0 && (
          <div className="mt-1">
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-600 to-orange-500 transition-all duration-1000"
                style={{ width: `${(countdown / Math.ceil(state.breakDuration / 1000)) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="text-center text-gray-600 text-xs pb-2">
          {state.currentQuestionIndex < state.questions.length
            ? `Завершён вопрос ${state.currentQuestionIndex + 1} из ${state.questions.length}`
            : 'Последний вопрос пройден'}
        </div>
      </div>
    </div>
  );
}
