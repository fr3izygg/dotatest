import { useState, useEffect, useRef } from 'react';
import { GameState, Player, PlayerAnswer, getQuestionMediaItems, getQuestionPoints } from '../store/gameStore';
import QuestionMedia from './QuestionMedia';

interface Props {
  state: GameState;
  currentPlayer: Player;
  updateState: (updater: (prev: GameState) => GameState) => void;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Лёгкий',
  medium: 'Средний',
  hard: 'Сложный',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'text-green-400 border-green-700/50 bg-green-900/20',
  medium: 'text-yellow-400 border-yellow-700/50 bg-yellow-900/20',
  hard: 'text-red-400 border-red-700/50 bg-red-900/20',
};

export default function QuestionScreen({ state, currentPlayer, updateState }: Props) {
  const question = state.questions[state.currentQuestionIndex];
  const [answer, setAnswer] = useState('');
  const [savedAnswer, setSavedAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Пока true — не перезаписываем поле из state.answers (иначе опрос ~300 мс сбрасывает режим «Изменить») */
  const [isEditingAnswer, setIsEditingAnswer] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevQuestionIndex = useRef(state.currentQuestionIndex);

  const [timeLeft, setTimeLeft] = useState(20);

  const isChoice = question?.responseMode === 'choice' && (question.choices?.filter(c => c.trim()).length ?? 0) > 0;

  // Reset when question changes
  useEffect(() => {
    if (prevQuestionIndex.current !== state.currentQuestionIndex) {
      setAnswer('');
      setSavedAnswer('');
      setSubmitted(false);
      setIsEditingAnswer(false);
      setTimeLeft(20);
      prevQuestionIndex.current = state.currentQuestionIndex;
    }
  }, [state.currentQuestionIndex]);

  // Timer for question
  useEffect(() => {
    if (state.phase !== 'question' || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [state.phase, timeLeft]);

  // Focus input
  useEffect(() => {
    if (!submitted && state.phase === 'question') {
      inputRef.current?.focus();
    }
  }, [submitted, state.phase]);

  // Синхронизация с сервером / другими вкладками (только когда игрок не в режиме правки)
  useEffect(() => {
    if (isEditingAnswer) return;
    const myAnswer = state.answers.find(a => a.playerId === currentPlayer.id);
    if (myAnswer) {
      setSubmitted(true);
      setSavedAnswer(myAnswer.answer);
      setAnswer(myAnswer.answer);
    } else {
      setSubmitted(false);
    }
  }, [state.answers, currentPlayer.id, state.currentQuestionIndex, isEditingAnswer]);

  const handleSubmit = () => {
    const trimmed = answer.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);

    const newAnswer: PlayerAnswer = {
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      answer: trimmed,
      submittedAt: Date.now(),
      checkedByAdmin: false,
    };

    updateState(prev => {
      const filtered = prev.answers.filter(a => a.playerId !== currentPlayer.id);
      return {
        ...prev,
        answers: [...filtered, newAnswer],
      };
    });

    setSavedAnswer(trimmed);
    setSubmitted(true);
    setIsEditingAnswer(false);
    setIsSubmitting(false);
  };

  const handleEdit = () => {
    const my = state.answers.find(a => a.playerId === currentPlayer.id);
    setIsEditingAnswer(true);
    setSubmitted(false);
    setAnswer(my?.answer ?? savedAnswer);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!question) return null;

  const myAnswer = state.answers.find(a => a.playerId === currentPlayer.id);
  const answeredCount = state.answers.length;
  const totalPlayers = state.players.length;
  const pointsIfCorrect = getQuestionPoints(question);
  const sortedByScore = [...state.players].sort((a, b) => b.score - a.score);

  const choiceList = (question.choices ?? []).map(c => c.trim()).filter(Boolean);

  const limitPlayback = state.phase === 'question';
  const autoPlay = state.phase === 'question' || state.phase === 'break';
  const muted = false;

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-red-900/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-orange-900/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="text-2xl font-black text-white">
            DOTA <span className="text-red-500">QUIZ</span>
          </div>
          {state.phase === 'question' && (
            <div className="bg-red-600/20 border border-red-600/40 text-red-400 text-sm font-bold px-3 py-1 rounded-full">
              ⏱ {timeLeft}s
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-[#161b22] border border-gray-800 rounded-xl px-3 py-1.5 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center text-white font-bold text-xs">
              {currentPlayer.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-gray-300 text-sm font-medium">{currentPlayer.name}</span>
          </div>
          <div className="bg-[#161b22] border border-gray-800 rounded-xl px-3 py-1.5">
            <span className="text-yellow-400 font-bold text-sm">{currentPlayer.score} очков</span>
          </div>
        </div>
      </div>

      {/* Question card */}
      <div className="relative z-10 flex-1 w-full max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 flex flex-col gap-4">
        {/* Meta */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-gray-500 text-sm font-medium">
            Вопрос {state.currentQuestionIndex + 1} из {state.questions.length}
          </span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${DIFFICULTY_COLORS[question.difficulty]}`}>
            {DIFFICULTY_LABELS[question.difficulty]}
          </span>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full border border-yellow-700/40 bg-yellow-900/20 text-yellow-400">
            +{pointsIfCorrect} очков
          </span>
          <span className="text-xs text-gray-600 bg-[#161b22] border border-gray-800 px-2.5 py-1 rounded-full">{question.category}</span>
          {isChoice && (
            <span className="text-xs text-blue-400 bg-blue-900/25 border border-blue-800/40 px-2.5 py-1 rounded-full">Тест</span>
          )}
        </div>

            {/* Question text */}
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 mb-4 shadow-xl">
              {state.phase === 'break' ? (
                <>
                  <QuestionMedia items={question.breakMedia || []} limitPlayback={false} autoPlay={autoPlay} muted={muted} className="h-[62vh] mb-4" />
                  <p className="text-white text-lg font-medium leading-relaxed text-center">Перерыв между вопросами...</p>
                </>
              ) : (
                <>
                  <QuestionMedia items={getQuestionMediaItems(question)} limitPlayback={limitPlayback} autoPlay={autoPlay} muted={muted} className="h-[62vh] mb-4" />
                  <p className="text-white text-lg font-medium leading-relaxed">{question.text}</p>
                </>
              )}
            </div>

            {/* Progress + таблица счёта */}
            <div className="mt-4 bg-[#161b22] border border-gray-800 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-500 text-sm">Ответили</span>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {state.players.map(p => {
                      const answered = state.answers.find(a => a.playerId === p.id);
                      return (
                        <div
                          key={p.id}
                          className={`w-2 h-2 rounded-full transition-all ${answered ? 'bg-green-400' : 'bg-gray-700'}`}
                          title={p.name}
                        />
                      );
                    })}
                  </div>
                  <span className="text-white font-bold text-sm">
                    {answeredCount}/{totalPlayers}
                  </span>
                </div>
              </div>
              <div className="border-t border-gray-800 pt-3">
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">Таблица счёта</p>
                <div className="rounded-lg border border-gray-800 overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#0d1117] text-gray-500 text-left">
                        <th className="px-2 py-1.5 w-8">#</th>
                        <th className="px-2 py-1.5">Игрок</th>
                        <th className="px-2 py-1.5 text-right">Очки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedByScore.map((p, idx) => {
                        const isMe = p.id === currentPlayer.id;
                        return (
                          <tr
                            key={p.id}
                            className={`border-t border-gray-800/80 ${isMe ? 'bg-red-900/15' : ''}`}
                          >
                            <td className="px-2 py-1.5 text-gray-500 tabular-nums">{idx + 1}</td>
                            <td className={`px-2 py-1.5 truncate max-w-[180px] ${isMe ? 'text-red-300 font-medium' : 'text-gray-300'}`}>
                              {p.name}
                              {isMe && <span className="text-red-500/80 text-[10px] ml-1">(ты)</span>}
                            </td>
                            <td className="px-2 py-1.5 text-right text-yellow-400 font-bold tabular-nums">{p.score}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {sortedByScore.length === 0 && (
                    <p className="text-gray-600 text-xs px-2 py-3 text-center">Пока нет игроков</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* Answer section */}
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 shadow-xl">
          {state.phase === 'paused' && !submitted && (
            <div className="flex items-center gap-2 mb-3 text-yellow-400 text-sm">
              <span>⏸</span>
              <span>Организатор поставил паузу. Можешь прочитать вопрос.</span>
            </div>
          )}

          {!submitted ? (
            <div>
              {isChoice ? (
                <>
                  <p className="text-sm text-gray-400 mb-3">Выбери вариант и нажми «Отправить»</p>
                  <div className="grid gap-2 mb-4">
                    {choiceList.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAnswer(opt)}
                        className={`text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                          answer === opt
                            ? 'border-red-500 bg-red-900/30 text-white ring-1 ring-red-500/50'
                            : 'border-gray-700 bg-[#0d1117] text-gray-200 hover:border-gray-600'
                        }`}
                      >
                        <span className="text-gray-500 mr-2">{String.fromCharCode(65 + idx)}.</span>
                        {opt}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleSubmit}
                    disabled={!answer.trim() || isSubmitting}
                    className="w-full bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all active:scale-[0.99]"
                  >
                    Отправить
                  </button>
                </>
              ) : (
                <>
                  <label className="block text-sm text-gray-400 mb-2">Твой ответ</label>
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      className="flex-1 bg-[#0d1117] border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/50 transition-all"
                      placeholder="Введи ответ и нажми Enter..."
                      value={answer}
                      onChange={e => setAnswer(e.target.value)}
                      onKeyDown={handleKeyDown}
                      maxLength={200}
                    />
                    <button
                      onClick={handleSubmit}
                      disabled={!answer.trim() || isSubmitting}
                      className="bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-5 py-3 rounded-xl transition-all active:scale-95 whitespace-nowrap"
                    >
                      Отправить
                    </button>
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-xs text-gray-600">Enter для отправки</span>
                    <span className="text-xs text-gray-600">{answer.length}/200</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </div>
                <span className="text-green-400 text-sm font-medium">Ответ отправлен!</span>
              </div>
              <div className="bg-[#0d1117] rounded-xl px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-gray-300 font-medium break-words">{savedAnswer}</span>
                {myAnswer && !myAnswer.checkedByAdmin && (
                  <button
                    type="button"
                    onClick={handleEdit}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-3 whitespace-nowrap flex-shrink-0"
                  >
                    ✏️ Изменить
                  </button>
                )}
              </div>
              {myAnswer?.checkedByAdmin && (
                <p className="mt-3 text-sm text-gray-500">
                  Результат проверки покажем на перерыве между вопросами. Очки начислятся в следующем раунде.
                </p>
              )}
            </div>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
