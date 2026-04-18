import { GameState, Player } from '../store/gameStore';

interface Props {
  state: GameState;
  currentPlayer: Player;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function FinishedScreen({ state, currentPlayer }: Props) {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const myRank = sorted.findIndex(p => p.id === currentPlayer.id) + 1;
  const winner = sorted[0];

  const getPlayerMessage = () => {
    if (myRank === 1) return '🎉 Поздравляем! Ты лучший знаток Доты!';
    if (myRank === 2) return '🥈 Отличный результат! Серебро — тоже победа!';
    if (myRank === 3) return '🥉 Бронза! Неплохо для мирдалера!';
    return '💪 Хорошая попытка! В следующий раз повезёт!';
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-yellow-900/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-orange-900/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-950/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Winner banner */}
        {winner && (
          <div className="text-center mb-8">
            <div className="text-6xl mb-3">🏆</div>
            <h1 className="text-3xl font-black text-white">Игра окончена!</h1>
            <p className="text-yellow-400 font-bold text-lg mt-1">
              Победитель: {winner.name} ({winner.score} очков)
            </p>
            <p className="text-gray-400 text-sm mt-2">{getPlayerMessage()}</p>
          </div>
        )}

        {/* My result */}
        <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 border border-red-700/40 rounded-2xl p-4 mb-5 flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">Твой результат</p>
            <p className="text-white font-bold text-lg">{currentPlayer.name}</p>
          </div>
          <div className="text-right">
            <p className="text-yellow-400 font-black text-2xl">{currentPlayer.score}</p>
            <p className="text-gray-500 text-xs">очков · {myRank} место</p>
          </div>
        </div>

        {/* Full leaderboard */}
        <div className="bg-[#161b22] border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="text-white font-bold">Финальная таблица</h2>
          </div>
          <div className="divide-y divide-gray-800">
            {sorted.map((player, idx) => {
              const isMe = player.id === currentPlayer.id;
              const rank = idx + 1;
              const maxScore = sorted[0]?.score || 1;
              const pct = maxScore > 0 ? (player.score / maxScore) * 100 : 0;

              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 px-5 py-3.5 ${isMe ? 'bg-red-600/10' : ''}`}
                >
                  <div className="w-8 text-center text-lg">
                    {rank <= 3 ? MEDALS[rank - 1] : `${rank}.`}
                  </div>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center text-white font-bold text-xs">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-medium truncate ${isMe ? 'text-red-300' : 'text-gray-200'}`}>
                        {player.name}
                      </span>
                      {isMe && <span className="text-red-500 text-xs">(ты)</span>}
                    </div>
                    <div className="h-1 bg-gray-800 rounded-full mt-1">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-yellow-600 to-orange-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-yellow-400 font-bold text-sm">{player.score}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-center text-gray-600 text-xs mt-4">
          Спасибо за игру! • Dota 2 Quiz
        </p>
      </div>
    </div>
  );
}
