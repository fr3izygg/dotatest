import { useState, useEffect, useRef, useCallback } from 'react';
import {
  GameState,
  PlayerAnswer,
  getInitialState,
  getQuestionPoints,
  getQuestionMediaItems,
  applyPendingPointsForQuestion,
  type Question,
} from '../store/gameStore';
import LobbyQuestionsEditor from './LobbyQuestionsEditor';
import PresetManager from './PresetManager';
import QuestionMedia from './QuestionMedia';

interface Props {
  state: GameState;
  updateState: (updater: (prev: GameState) => GameState) => void;
  onLogout: () => void;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'text-green-400 bg-green-900/30 border-green-700/50',
  medium: 'text-yellow-400 bg-yellow-900/30 border-yellow-700/50',
  hard: 'text-red-400 bg-red-900/30 border-red-700/50',
};
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Лёгкий',
  medium: 'Средний',
  hard: 'Сложный',
};
/** После выбора ✓/✕ — столько миллисекунд ответ остаётся на экране у админа, можно сменить решение; затем строка уходит из списка «в реальном времени» */
const ADMIN_REVIEW_GRACE_MS = 1800;

function similarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^а-яёa-z0-9]/gi, ' ').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const wordsA = na.split(/\s+/);
  const wordsB = nb.split(/\s+/);
  const matches = wordsA.filter(w => wordsB.some(wb => wb.includes(w) || w.includes(wb))).length;
  return matches / Math.max(wordsA.length, wordsB.length);
}

function referenceStringsForQuestion(q: Question): string[] {
  const parts: string[] = [];
  if (q.correctAnswer?.trim()) parts.push(q.correctAnswer.trim());
  if (q.acceptableAnswers?.trim()) {
    q.acceptableAnswers
      .split(/[\n|]/)
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(s => parts.push(s));
  }
  if (q.responseMode === 'choice' && q.choices?.length) {
    q.choices.forEach(c => {
      const t = c.trim();
      if (t) parts.push(t);
    });
  }
  return parts.length ? parts : [''];
}

function maxSimilarityForAnswer(answerText: string, q: Question): number {
  return Math.max(...referenceStringsForQuestion(q).map(ref => similarity(answerText, ref)));
}

export default function AdminPanel({ state, updateState, onLogout }: Props) {
  const question = state.questions[state.currentQuestionIndex];
  const sorted = [...state.players].sort((a, b) => b.score - a.score);

  /** Локально: игрок → выбранное решение, пока не применилось к state */
  const [pendingChoice, setPendingChoice] = useState<Record<string, boolean>>({});
  const pendingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearPendingTimers = useCallback(() => {
    Object.values(pendingTimersRef.current).forEach(t => clearTimeout(t));
    pendingTimersRef.current = {};
    setPendingChoice({});
  }, []);

  useEffect(() => {
    clearPendingTimers();
  }, [state.currentQuestionIndex, clearPendingTimers]);

  useEffect(() => {
    if (state.phase === 'lobby' || state.phase === 'break' || state.phase === 'finished') {
      clearPendingTimers();
    }
  }, [state.phase, clearPendingTimers]);

  useEffect(() => () => clearPendingTimers(), [clearPendingTimers]);

  // Автоматическая пауза через 2 секунды после проверки всех ответов админом
  useEffect(() => {
    if (state.phase !== 'question') return;
    if (state.answers.length !== state.players.length) return; // Не все ответили
    if (!state.answers.every(a => a.checkedByAdmin)) return; // Не все проверены

    const timer = setTimeout(() => {
      updateState(prev => {
        if (prev.phase !== 'question') return prev; // Проверка на случай изменения фазы

        const q = prev.questions[prev.currentQuestionIndex];
        let breakDuration = 8000; // Дефолт 8 секунд

        if (q) {
          const media = getQuestionMediaItems(q);
          const video = media.find(m => m.kind === 'video');
          if (video && video.stopAtSeconds) {
            // Предполагаем длительность видео 60 секунд, если не указано
            const assumedTotal = 60; // Можно улучшить, но пока так
            const remaining = Math.max(0, assumedTotal - video.stopAtSeconds);
            breakDuration = (remaining + 10) * 1000; // Оставшееся + 10 секунд
          }
        }

        return {
          ...prev,
          phase: 'break',
          breakStartedAt: Date.now(),
          breakDuration,
          adminSkipBreak: false,
        };
      });
    }, 2000); // 2 секунды

    return () => clearTimeout(timer);
  }, [state.phase, state.answers, state.players.length, state.currentQuestionIndex, updateState]);

  const commitAnswerCheck = useCallback(
    (playerId: string, isCorrect: boolean) => {
      updateState(prev => {
        const q = prev.questions[prev.currentQuestionIndex];
        if (!q) return prev;
        const stillThere = prev.answers.some(a => a.playerId === playerId && !a.checkedByAdmin);
        if (!stillThere) return prev;

        const newAnswers = prev.answers.map(a =>
          a.playerId === playerId
            ? {
                ...a,
                isCorrect,
                checkedByAdmin: true,
                clearedFromAdminLive: true,
                pointsApplied: false,
              }
            : a
        );

        const qId = q.id;
        const allPrev = prev.allAnswers[qId] || [];
        const updatedAnswer = newAnswers.find(a => a.playerId === playerId)!;
        const allUpdated = [...allPrev.filter(a => a.playerId !== playerId), updatedAnswer];

        return {
          ...prev,
          answers: newAnswers,
          allAnswers: { ...prev.allAnswers, [qId]: allUpdated },
        };
      });
    },
    [updateState]
  );

  const schedulePendingCheck = (playerId: string, isCorrect: boolean) => {
    const existing = pendingTimersRef.current[playerId];
    if (existing) clearTimeout(existing);
    setPendingChoice(prev => ({ ...prev, [playerId]: isCorrect }));
    pendingTimersRef.current[playerId] = setTimeout(() => {
      commitAnswerCheck(playerId, isCorrect);
      setPendingChoice(prev => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
      delete pendingTimersRef.current[playerId];
    }, ADMIN_REVIEW_GRACE_MS);
  };

  /** Ответы, видимые в колонке «в реальном времени» (проверенные и убранные — только в истории) */
  const liveAnswers = state.answers.filter(a => !a.clearedFromAdminLive);
  const allCurrentAnswers = state.answers;

  const adjustPlayerScore = (playerId: string, delta: number) => {
    updateState(prev => ({
      ...prev,
      players: prev.players.map(p =>
        p.id === playerId ? { ...p, score: Math.max(0, p.score + delta) } : p
      ),
    }));
  };

  const regradeHistoryAnswer = (q: Question, playerId: string, newCorrect: boolean) => {
    const pts = getQuestionPoints(q);
    updateState(prev => {
      const list = prev.allAnswers[q.id] || [];
      const entry = list.find(a => a.playerId === playerId);
      if (!entry || !entry.checkedByAdmin) return prev;
      const wasCorrect = entry.isCorrect === true;
      if (wasCorrect === newCorrect) return prev;

      const applied = entry.pointsApplied === true;
      const scoreDelta = applied ? (newCorrect ? pts : 0) - (wasCorrect ? pts : 0) : 0;
      const updatedEntry: PlayerAnswer = { ...entry, isCorrect: newCorrect };
      const newList = list.map(a => (a.playerId === playerId ? updatedEntry : a));

      const curQ = prev.questions[prev.currentQuestionIndex];
      const syncAnswers =
        curQ?.id === q.id
          ? prev.answers.map(a => (a.playerId === playerId ? { ...a, isCorrect: newCorrect } : a))
          : prev.answers;

      return {
        ...prev,
        players:
          applied && scoreDelta !== 0
            ? prev.players.map(p =>
                p.id === playerId ? { ...p, score: Math.max(0, p.score + scoreDelta) } : p
              )
            : prev.players,
        allAnswers: { ...prev.allAnswers, [q.id]: newList },
        answers: syncAnswers,
      };
    });
  };

  const startGame = () => {
    if (state.questions.length === 0) {
      alert('Добавьте хотя бы один вопрос: кнопка «Вопросы квиза» в лобби.');
      return;
    }
    updateState(prev => ({
      ...prev,
      phase: 'question',
      currentQuestionIndex: 0,
      answers: [],
      gameStartedAt: Date.now(),
      questionStartedAt: Date.now(),
    }));
  };

  const nextQuestion = () => {
    updateState(prev => {
      const qId = prev.questions[prev.currentQuestionIndex]?.id;
      let s =
        qId && (prev.phase === 'question' || prev.phase === 'paused' || prev.phase === 'break')
          ? applyPendingPointsForQuestion(prev, qId)
          : prev;
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
  };

  const startBreak = () => {
    updateState(prev => ({
      ...prev,
      phase: 'break',
      breakStartedAt: Date.now(),
      adminSkipBreak: false,
    }));
  };

  const skipBreak = () => {
    updateState(prev => ({
      ...prev,
      adminSkipBreak: true,
    }));
    setTimeout(() => nextQuestion(), 200);
  };

  const pauseGame = () => {
    updateState(prev => ({ ...prev, phase: 'paused' }));
  };

  const resumeGame = () => {
    updateState(prev => ({ ...prev, phase: 'question' }));
  };

  const resetGame = () => {
    if (!confirm('Сбросить игру полностью? Все данные будут удалены, но вопросы останутся.')) return;
    updateState(prev => {
      const fresh = getInitialState();
      return { ...fresh, questions: prev.questions, gameEpoch: (prev.gameEpoch ?? 0) + 1 };
    });
  };

  const finishGame = () => {
    if (!confirm('Завершить игру?')) return;
    updateState(prev => {
      const qId = prev.questions[prev.currentQuestionIndex]?.id;
      const s =
        qId && (prev.phase === 'question' || prev.phase === 'paused' || prev.phase === 'break')
          ? applyPendingPointsForQuestion(prev, qId)
          : prev;
      return { ...s, phase: 'finished' };
    });
  };

  const [showHistory, setShowHistory] = useState(false);
  const [showScores, setShowScores] = useState(false);
  const [showQuestionEditor, setShowQuestionEditor] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="bg-[#161b22] border-b border-gray-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl font-black text-white">DOTA <span className="text-red-500">QUIZ</span></span>
          <span className="bg-purple-700/30 border border-purple-600/40 text-purple-300 text-xs font-bold px-2.5 py-1 rounded-full">
            АДМИН
          </span>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
            state.phase === 'lobby' ? 'text-blue-400 bg-blue-900/20 border-blue-700/40' :
            state.phase === 'question' ? 'text-green-400 bg-green-900/20 border-green-700/40' :
            state.phase === 'paused' ? 'text-yellow-400 bg-yellow-900/20 border-yellow-700/40' :
            state.phase === 'break' ? 'text-purple-400 bg-purple-900/20 border-purple-700/40' :
            'text-red-400 bg-red-900/20 border-red-700/40'
          }`}>
            {{
              lobby: '🕐 Лобби',
              question: '❓ Вопрос',
              paused: '⏸ Пауза',
              break: '⏱ Перерыв',
              finished: '🏁 Конец',
            }[state.phase]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {state.phase === 'lobby' && state.players.length > 0 && state.questions.length > 0 && (
            <button onClick={startGame} className="bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all active:scale-95">
              ▶ Начать игру
            </button>
          )}
          {state.phase === 'question' && (
            <>
              <button onClick={pauseGame} className="bg-yellow-600/80 hover:bg-yellow-500/80 text-white text-sm font-bold px-3 py-2 rounded-xl transition-all">
                ⏸ Пауза
              </button>
              <button onClick={startBreak} className="bg-purple-700/80 hover:bg-purple-600/80 text-white text-sm font-bold px-3 py-2 rounded-xl transition-all">
                → Перерыв
              </button>
              <button onClick={nextQuestion} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-3 py-2 rounded-xl transition-all">
                ⏭ Следующий
              </button>
            </>
          )}
          {state.phase === 'paused' && (
            <button onClick={resumeGame} className="bg-green-600 hover:bg-green-500 text-white text-sm font-bold px-3 py-2 rounded-xl transition-all">
              ▶ Продолжить
            </button>
          )}
          {state.phase === 'break' && (
            <button onClick={skipBreak} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-3 py-2 rounded-xl transition-all">
              ⏭ Пропустить паузу
            </button>
          )}
          <button onClick={finishGame} className="bg-red-900/60 hover:bg-red-800/60 text-red-300 text-sm font-bold px-3 py-2 rounded-xl transition-all">
            🏁 Завершить
          </button>
          <button onClick={resetGame} className="bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm font-bold px-3 py-2 rounded-xl transition-all">
            🔄 Сброс
          </button>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="bg-indigo-900/70 hover:bg-indigo-800/70 text-indigo-200 text-sm font-bold px-3 py-2 rounded-xl transition-all border border-indigo-700/40"
          >
            📜 История ответов
          </button>
          <button
            type="button"
            onClick={() => setShowScores(true)}
            className="bg-amber-900/60 hover:bg-amber-800/60 text-amber-200 text-sm font-bold px-3 py-2 rounded-xl transition-all border border-amber-700/40"
          >
            ⚖️ Баллы
          </button>
          <button onClick={onLogout} className="text-gray-600 hover:text-gray-400 text-xs px-2 py-2 rounded-xl transition-all">
            Выйти
          </button>
        </div>
      </div>

      {/* Main content: left = question, right = answers */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Question info */}
        <div className="w-1/2 border-r border-gray-800 overflow-y-auto p-4 flex flex-col gap-4">

          {/* Lobby state */}
          {state.phase === 'lobby' && (
            <div>
              <h3 className="text-white font-bold text-lg mb-3">Лобби</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setShowPresetManager(true)}
                  className="bg-blue-700 hover:bg-blue-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all border border-blue-600/40"
                >
                  📚 Пресеты вопросов
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuestionEditor(true)}
                  className="bg-purple-700 hover:bg-purple-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-all border border-purple-600/40"
                >
                  📝 Вопросы квиза ({state.questions.length})
                </button>
              </div>
              <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4 mb-3">
                <p className="text-gray-400 text-sm mb-2">Игроков в лобби: <span className="text-white font-bold">{state.players.length}</span></p>
                <div className="space-y-1.5">
                  {state.players.map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center text-white font-bold text-xs">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-gray-300">{p.name}</span>
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400" />
                    </div>
                  ))}
                  {state.players.length === 0 && (
                    <p className="text-gray-600 text-sm">Ожидание игроков...</p>
                  )}
                </div>
              </div>
              {state.players.length > 0 && state.questions.length > 0 && (
                <button onClick={startGame} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-all active:scale-95">
                  ▶ Начать игру ({state.players.length} игроков)
                </button>
              )}
              {state.players.length > 0 && state.questions.length === 0 && (
                <p className="text-amber-500/90 text-sm text-center">Сначала добавьте вопросы через «Вопросы квиза».</p>
              )}
            </div>
          )}

          {/* Active question */}
          {(state.phase === 'question' || state.phase === 'paused') && question && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-gray-500 text-sm">Вопрос {state.currentQuestionIndex + 1}/{state.questions.length}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${DIFFICULTY_COLORS[question.difficulty]}`}>
                  {DIFFICULTY_LABELS[question.difficulty]} · +{getQuestionPoints(question)} очков
                </span>
                <span className="text-xs text-gray-600 bg-[#161b22] border border-gray-800 px-2 py-0.5 rounded-full">{question.category}</span>
              </div>

              <div className="bg-[#161b22] border border-gray-800 rounded-xl p-4 mb-3">
                <QuestionMedia items={getQuestionMediaItems(question)} />
                <p className="text-white font-medium leading-relaxed">{question.text}</p>
                {question.responseMode === 'choice' && question.choices && question.choices.some(c => c.trim()) && (
                  <p className="text-blue-400/90 text-xs mt-2">Тест: варианты — {question.choices.filter(c => c.trim()).join(' · ')}</p>
                )}
              </div>

              <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-3 mb-3">
                <p className="text-[10px] text-green-600/90 mb-2">
                  Очки у игроков появятся в начале следующего раунда (после перерыва или перехода к след. вопросу). На перерыве им покажется верно/неверно.
                </p>
                <p className="text-xs text-green-500 mb-1 font-bold uppercase tracking-wider">Правильный ответ (подсказка)</p>
                <p className="text-green-300 text-sm whitespace-pre-wrap">{question.correctAnswer}</p>
                {question.acceptableAnswers?.trim() && (
                  <div className="mt-2 pt-2 border-t border-green-800/40">
                    <p className="text-[10px] text-green-600 font-bold uppercase mb-1">Допустимые формулировки</p>
                    <p className="text-green-200/80 text-xs whitespace-pre-wrap">{question.acceptableAnswers}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 bg-[#161b22] border border-gray-800 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-gray-500 text-xs">Ответили</span>
                  <span className="text-white font-bold text-sm">{allCurrentAnswers.length}/{state.players.length}</span>
                </div>
                <div className="flex-1 bg-[#161b22] border border-gray-800 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-gray-500 text-xs">Проверено</span>
                  <span className="text-white font-bold text-sm">
                    {allCurrentAnswers.filter(a => a.checkedByAdmin).length}/{allCurrentAnswers.length}
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="grid grid-cols-2 gap-2">
                {state.phase === 'question' ? (
                  <button onClick={pauseGame} className="bg-yellow-600/70 hover:bg-yellow-600 text-white text-sm font-bold py-2.5 rounded-xl transition-all">
                    ⏸ Пауза
                  </button>
                ) : (
                  <button onClick={resumeGame} className="bg-green-700 hover:bg-green-600 text-white text-sm font-bold py-2.5 rounded-xl transition-all">
                    ▶ Продолжить
                  </button>
                )}
                <button onClick={startBreak} className="bg-purple-800/70 hover:bg-purple-700/70 text-white text-sm font-bold py-2.5 rounded-xl transition-all">
                  → Перерыв
                </button>
                <button onClick={nextQuestion} className="col-span-2 bg-blue-700 hover:bg-blue-600 text-white text-sm font-bold py-2.5 rounded-xl transition-all">
                  ⏭ Следующий вопрос
                </button>
              </div>
            </div>
          )}

          {/* Break state */}
          {state.phase === 'break' && (
            <div>
              <h3 className="text-white font-bold text-lg mb-3">⏱ Перерыв</h3>
              <p className="text-gray-400 text-sm mb-3">Показывается таблица лидеров у игроков</p>
              <button onClick={skipBreak} className="w-full bg-blue-700 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all mb-2">
                ⏭ Пропустить и следующий вопрос
              </button>
              <button onClick={nextQuestion} className="w-full bg-gray-800 hover:bg-gray-700 text-white text-sm font-bold py-2.5 rounded-xl transition-all">
                ⏭ Следующий вопрос сразу
              </button>
            </div>
          )}

          {state.phase === 'finished' && (
            <div>
              <h3 className="text-white font-bold text-lg mb-3">🏁 Игра завершена</h3>
              <button onClick={resetGame} className="w-full bg-red-800 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all">
                🔄 Новая игра
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: Live answers */}
        <div className="w-1/2 overflow-y-auto p-4">
          <h3 className="text-white font-bold text-base mb-3 flex items-center gap-2">
            Ответы в реальном времени
            {(state.phase === 'question' || state.phase === 'paused') && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </h3>

          {liveAnswers.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-600 text-sm">
              Ожидание ответов…
            </div>
          ) : (
            <div className="space-y-2">
              {liveAnswers.map(answer => {
                const isChecked = answer.checkedByAdmin;
                const pending = pendingChoice[answer.playerId];
                const sim = question ? maxSimilarityForAnswer(answer.answer, question) : 0;
                const bgHint = sim > 0.6 ? 'border-green-600/50 bg-green-900/20' :
                               sim > 0.3 ? 'border-yellow-600/40 bg-yellow-900/10' :
                               'border-gray-700 bg-[#161b22]';
                const pendingRing =
                  pending === true ? 'ring-2 ring-green-500/70 shadow-[0_0_12px_rgba(34,197,94,0.25)]' :
                  pending === false ? 'ring-2 ring-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.2)]' :
                  '';

                return (
                  <div
                    key={answer.playerId}
                    className={`rounded-xl border p-3 answer-slide-in transition-all duration-300 ${bgHint} ${pendingRing} ${
                      isChecked && pending === undefined ? 'opacity-40' : 'opacity-100'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mt-0.5">
                        {answer.playerName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                          <span className="text-gray-300 text-xs font-medium">{answer.playerName}</span>
                          {sim > 0.6 && (
                            <span className="text-xs text-green-400 bg-green-900/30 border border-green-700/40 px-1.5 py-0.5 rounded-full">похоже</span>
                          )}
                          {sim > 0.3 && sim <= 0.6 && (
                            <span className="text-xs text-yellow-400 bg-yellow-900/30 border border-yellow-700/40 px-1.5 py-0.5 rounded-full">частично</span>
                          )}
                          {pending !== undefined && (
                            <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                              применится через ~{Math.round(ADMIN_REVIEW_GRACE_MS / 1000)} с — можно сменить
                            </span>
                          )}
                        </div>
                        <p className="text-white text-sm break-words">{answer.answer}</p>
                      </div>

                      {!isChecked ? (
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => schedulePendingCheck(answer.playerId, true)}
                              className={`w-9 h-9 rounded-lg border flex items-center justify-center text-white text-lg transition-all active:scale-90 ${
                                pending === true
                                  ? 'bg-green-600 border-green-400 scale-105'
                                  : 'bg-green-700/60 hover:bg-green-600 border-green-600/60'
                              }`}
                              title="Правильно"
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => schedulePendingCheck(answer.playerId, false)}
                              className={`w-9 h-9 rounded-lg border flex items-center justify-center text-white text-lg transition-all active:scale-90 ${
                                pending === false
                                  ? 'bg-red-600 border-red-400 scale-105'
                                  : 'bg-red-800/60 hover:bg-red-700 border-red-700/60'
                              }`}
                              title="Неверно"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${
                          answer.isCorrect ? 'bg-green-700/40 text-green-400' : 'bg-red-800/40 text-red-400'
                        }`}>
                          {answer.isCorrect ? '✓' : '✕'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Scoreboard */}
      <div className="bg-[#161b22] border-t border-gray-800 px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-gray-600 text-xs flex-shrink-0 mr-1">Счёт:</span>
          {sorted.map((player, idx) => (
            <div key={player.id} className="flex items-center gap-1.5 bg-[#0d1117] border border-gray-800 rounded-lg px-3 py-1.5 flex-shrink-0">
              <span className="text-gray-500 text-xs">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}</span>
              <span className="text-gray-300 text-xs font-medium max-w-20 truncate">{player.name}</span>
              <span className="text-yellow-400 text-xs font-bold">{player.score}</span>
            </div>
          ))}
          {sorted.length === 0 && (
            <span className="text-gray-700 text-xs">Нет игроков</span>
          )}
        </div>
      </div>

      {showScores && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="presentation"
          onClick={() => setShowScores(false)}
        >
          <div
            role="dialog"
            aria-labelledby="scores-title"
            className="bg-[#161b22] border border-gray-700 rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <h2 id="scores-title" className="text-white font-bold text-lg">
                Баллы игроков
              </h2>
              <button
                type="button"
                onClick={() => setShowScores(false)}
                className="text-gray-500 hover:text-white text-xl leading-none px-2"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-gray-500 text-xs">
                Ручная корректировка счёта. Изменения сразу видны всем вкладкам.
              </p>
              {state.players.length === 0 ? (
                <p className="text-gray-600 text-sm">Пока нет игроков.</p>
              ) : (
                state.players.map(p => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-2 bg-[#0d1117] border border-gray-800 rounded-xl px-3 py-2.5"
                  >
                    <span className="text-gray-200 text-sm font-medium flex-1 min-w-[120px]">{p.name}</span>
                    <span className="text-yellow-400 font-bold tabular-nums">{p.score}</span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {[-100, -50, -10, 10, 50, 100].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => adjustPlayerScore(p.id, d)}
                          className={`text-xs font-bold px-2 py-1 rounded-lg border transition-all ${
                            d > 0
                              ? 'bg-green-900/40 border-green-700/50 text-green-300 hover:bg-green-800/50'
                              : 'bg-red-900/40 border-red-800/50 text-red-300 hover:bg-red-800/50'
                          }`}
                        >
                          {d > 0 ? `+${d}` : d}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="presentation"
          onClick={() => setShowHistory(false)}
        >
          <div
            role="dialog"
            aria-labelledby="history-title"
            className="bg-[#161b22] border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 flex-shrink-0">
              <h2 id="history-title" className="text-white font-bold text-lg">
                История ответов
              </h2>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="text-gray-500 hover:text-white text-xl leading-none px-2"
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4 flex-1">
              <p className="text-gray-500 text-xs">
                Проверенные ответы по вопросам. Можно переклассифицировать — баллы пересчитаются по настройкам вопроса (свои баллы или сложность).
              </p>
              {state.questions.map((q, qi) => {
                const rows = state.allAnswers[q.id] || [];
                const checkedRows = rows.filter(r => r.checkedByAdmin);
                if (checkedRows.length === 0) return null;
                return (
                  <div key={q.id} className="border border-gray-800 rounded-xl overflow-hidden">
                    <div className="bg-[#0d1117] px-3 py-2 border-b border-gray-800">
                      <span className="text-gray-500 text-xs">Вопрос {qi + 1}</span>
                      <p className="text-gray-200 text-sm font-medium mt-0.5 line-clamp-2">{q.text}</p>
                      <span className="text-xs text-gray-600 mt-1 inline-block">
                        +{getQuestionPoints(q)} · {DIFFICULTY_LABELS[q.difficulty]}
                      </span>
                    </div>
                    <ul className="divide-y divide-gray-800/80">
                      {checkedRows.map(row => (
                        <li key={row.playerId} className="px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-gray-300 text-sm font-medium">{row.playerName}</span>
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  row.isCorrect
                                    ? 'bg-green-900/50 text-green-400'
                                    : 'bg-red-900/50 text-red-400'
                                }`}
                              >
                                {row.isCorrect ? '✓ верно' : '✕ неверно'}
                              </span>
                            </div>
                            <p className="text-gray-400 text-xs break-words mt-0.5">{row.answer}</p>
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            {!row.isCorrect && (
                              <button
                                type="button"
                                onClick={() => regradeHistoryAnswer(q, row.playerId, true)}
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-green-900/50 border border-green-700/50 text-green-300 hover:bg-green-800/60"
                              >
                                → Засчитать верно
                              </button>
                            )}
                            {row.isCorrect && (
                              <button
                                type="button"
                                onClick={() => regradeHistoryAnswer(q, row.playerId, false)}
                                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-red-900/50 border border-red-800/50 text-red-300 hover:bg-red-800/60"
                              >
                                → Засчитать неверно
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {state.questions.every(q => (state.allAnswers[q.id] || []).filter(r => r.checkedByAdmin).length === 0) && (
                <p className="text-gray-600 text-sm">Пока нет проверенных ответов в истории.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showQuestionEditor && (
        <LobbyQuestionsEditor
          questions={state.questions}
          onApply={qs => updateState(prev => ({ ...prev, questions: qs }))}
          onClose={() => setShowQuestionEditor(false)}
        />
      )}

      {showPresetManager && (
        <PresetManager
          currentQuestions={state.questions}
          onLoadPreset={qs => updateState(prev => ({ ...prev, questions: qs }))}
          onClose={() => setShowPresetManager(false)}
        />
      )}
    </div>
  );
}
