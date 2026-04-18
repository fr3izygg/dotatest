// ============================================================
// DOTA 2 QUIZ — Shared state via localStorage + BroadcastChannel
// No backend needed — works across tabs on the same browser
// ============================================================

export type QuestionType = 'text' | 'image';
export type Difficulty = 'easy' | 'medium' | 'hard';
/** open — свободный ответ; choice — тест с вариантами */
export type QuestionResponseMode = 'open' | 'choice';

export type QuestionMediaKind = 'image' | 'video';

export interface QuestionMediaItem {
  kind: QuestionMediaKind;
  url: string;
  /**
   * Для прямых видео (mp4/webm): во время раунда «Вопрос» видео остановится на этом таймкоде (секунды).
   * На перерыве ограничение снимается и видео можно смотреть полностью.
   */
  stopAtSeconds?: number;
}

export interface Question {
  id: string;
  text: string;
  /** Несколько фото/видео в любом порядке (приоритет над устаревшими imageUrl/videoUrl) */
  media?: QuestionMediaItem[];
  /** @deprecated используйте media */
  imageUrl?: string;
  /** @deprecated используйте media */
  videoUrl?: string;
  correctAnswer: string;
  /** Допустимые формулировки для подсказки админу и авто-подсветки «похоже» (строки через перенос или |) */
  acceptableAnswers?: string;
  difficulty: Difficulty;
  type: QuestionType;
  category: string;
  /** Если задано (≥0), начисляется при верном ответе вместо стандарта по сложности */
  pointsOverride?: number;
  responseMode?: QuestionResponseMode;
  /** Варианты для режима теста (показываются игроку) */
  choices?: string[];
}

const DEFAULT_POINTS_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 100,
  medium: 200,
  hard: 300,
};

export function getQuestionPoints(q: Question): number {
  if (typeof q.pointsOverride === 'number' && Number.isFinite(q.pointsOverride) && q.pointsOverride >= 0) {
    return Math.round(q.pointsOverride);
  }
  return DEFAULT_POINTS_BY_DIFFICULTY[q.difficulty];
}

/** Все медиа вопроса: новый массив или обратная совместимость с imageUrl/videoUrl */
export function getQuestionMediaItems(q: Question): QuestionMediaItem[] {
  if (q.media && q.media.length > 0) {
    return q.media.filter(m => m.url?.trim());
  }
  const legacy: QuestionMediaItem[] = [];
  if (q.imageUrl?.trim()) legacy.push({ kind: 'image', url: q.imageUrl.trim() });
  if (q.videoUrl?.trim()) legacy.push({ kind: 'video', url: q.videoUrl.trim() });
  return legacy;
}

/**
 * Начисляет очки за завершённый вопрос (один раз на ответ).
 * Вызывать при переходе к следующему раунду (след. вопрос или конец игры), не в момент проверки админом.
 */
export function applyPendingPointsForQuestion(state: GameState, questionId: string): GameState {
  const q = state.questions.find(qq => qq.id === questionId);
  if (!q) return state;

  const list = state.allAnswers[questionId] || [];
  let players = state.players;
  let anyApplied = false;

  const newList = list.map(a => {
    if (!a.checkedByAdmin || a.pointsApplied) return a;
    anyApplied = true;
    const pts = a.isCorrect === true ? getQuestionPoints(q) : 0;
    if (pts > 0) {
      players = players.map(p => (p.id === a.playerId ? { ...p, score: p.score + pts } : p));
    }
    return { ...a, pointsApplied: true };
  });

  if (!anyApplied) return state;

  const curQ = state.questions[state.currentQuestionIndex];
  const syncAnswers =
    curQ?.id === questionId
      ? state.answers.map(a => {
          const u = newList.find(x => x.playerId === a.playerId);
          return u ? { ...a, pointsApplied: true } : a;
        })
      : state.answers;

  return {
    ...state,
    players,
    allAnswers: { ...state.allAnswers, [questionId]: newList },
    answers: syncAnswers,
  };
}

export interface PlayerAnswer {
  playerId: string;
  playerName: string;
  answer: string;
  submittedAt: number;
  isCorrect?: boolean; // set by admin
  checkedByAdmin: boolean;
  /** Очки за этот ответ уже перенесены в счёт игрока (после начала следующего раунда) */
  pointsApplied?: boolean;
  /** Скрыто в панели «ответы в реальном времени» у админа после проверки (игрок всё ещё видит результат) */
  clearedFromAdminLive?: boolean;
  fadeOut?: boolean;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  joinedAt: number;
  isConnected: boolean;
  lastSeen: number;
}

export type GamePhase =
  | 'lobby'       // waiting for players
  | 'question'    // question is shown, players answer
  | 'paused'      // admin paused (question still visible)
  | 'break'       // 5-sec leaderboard break between questions
  | 'finished';   // game over

export interface GameState {
  phase: GamePhase;
  currentQuestionIndex: number;
  questions: Question[];
  players: Player[];
  answers: PlayerAnswer[]; // answers for current question
  allAnswers: { [questionId: string]: PlayerAnswer[] }; // history
  questionStartedAt: number;
  breakStartedAt: number;
  breakDuration: number; // ms
  gameStartedAt: number;
  lastUpdated: number;
  adminSkipBreak: boolean;
  /**
   * Версия состояния (растёт при полном сбросе). Нужна, чтобы старые вкладки/устройства
   * не затирали новое состояние в Supabase после «Сброс».
   */
  gameEpoch: number;
}

const STORAGE_KEY = 'dota2quiz_state';
const CHANNEL_NAME = 'dota2quiz_channel';

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel {
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/** Старые сохранения без gameEpoch */
export function withGameEpochDefaults(state: GameState): GameState {
  return { ...state, gameEpoch: state.gameEpoch ?? 0 };
}

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return withGameEpochDefaults(JSON.parse(raw) as GameState);
  } catch {
    return null;
  }
}

export function saveState(state: GameState): void {
  const updated = { ...state, lastUpdated: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  // Notify other tabs
  try {
    getChannel().postMessage({ type: 'STATE_UPDATE', state: updated });
  } catch {
    // ignore
  }
}

export function subscribeToState(callback: (state: GameState) => void): () => void {
  const ch = getChannel();
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'STATE_UPDATE') {
      callback(event.data.state as GameState);
    }
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ============================================================
// DEFAULT QUESTIONS (Dota 2)
// ============================================================
export const DEFAULT_QUESTIONS: Question[] = [
  // --- EASY ---
  {
    id: 'q1',
    text: 'Какой герой носит название «Ледяной дракон» в русскоязычном сообществе и замораживает врагов своими способностями?',
    correctAnswer: 'Лич / Lich',
    difficulty: 'easy',
    type: 'text',
    category: 'Герои',
  },
  {
    id: 'q2',
    text: 'Как называются две фракции (команды), противостоящие друг другу в Dota 2?',
    correctAnswer: 'Силы Света (Radiant) и Силы Тьмы (Dire)',
    difficulty: 'easy',
    type: 'text',
    category: 'Основы',
  },
  {
    id: 'q3',
    text: 'Сколько игроков в одной команде в стандартном матче Dota 2?',
    correctAnswer: '5',
    difficulty: 'easy',
    type: 'text',
    category: 'Основы',
  },
  {
    id: 'q4',
    text: 'Как называется главный объект каждой команды, который нужно уничтожить чтобы победить?',
    correctAnswer: 'Трон / Ancient / Крепость',
    difficulty: 'easy',
    type: 'text',
    category: 'Основы',
  },
  {
    id: 'q5',
    text: 'Назови имя нейтрального монстра в лесу, за убийство которого вся команда получает опыт и золото. Он возрождается каждые 5 минут.',
    correctAnswer: 'Рошан / Roshan',
    difficulty: 'easy',
    type: 'text',
    category: 'Монстры',
  },
  {
    id: 'q6',
    text: 'Какой предмет выпадает с Рошана и дает возможность возродиться на месте смерти?',
    correctAnswer: 'Аегис / Aegis of the Immortal',
    difficulty: 'easy',
    type: 'text',
    category: 'Предметы',
  },
  {
    id: 'q7',
    text: 'Как зовут героя, способность которого «Omnislash» является его ультимативной атакой?',
    correctAnswer: 'Джаггернаут / Juggernaut',
    difficulty: 'easy',
    type: 'text',
    category: 'Герои',
  },
  {
    id: 'q8',
    text: 'Какая способность героя Axe наносит урон всем ближайшим врагам и заставляет их атаковать его?',
    correctAnswer: 'Berserker\'s Call / Зов берсерка',
    difficulty: 'easy',
    type: 'text',
    category: 'Способности',
  },
  // --- MEDIUM ---
  {
    id: 'q9',
    text: 'Как называется способность Invoker, при которой он призывает солнечный удар с огненным уроном по одной цели?',
    correctAnswer: 'Sun Strike / Солнечный удар',
    difficulty: 'medium',
    type: 'text',
    category: 'Способности',
  },
  {
    id: 'q10',
    text: 'Какой герой имеет пассивную способность «Momento» и может перейти в другую форму после смерти, продолжая сражаться?',
    correctAnswer: 'Wraith King / Король-призрак',
    difficulty: 'medium',
    type: 'text',
    category: 'Герои',
  },
  {
    id: 'q11',
    text: 'Сколько заклинаний может скомбинировать Invoker всего (уникальных)?',
    correctAnswer: '14',
    difficulty: 'medium',
    type: 'text',
    category: 'Герои',
  },
  {
    id: 'q12',
    text: 'Как называется предмет, который телепортирует героя в любую точку карты через 3 секунды каста?',
    correctAnswer: 'Town Portal Scroll / ТП / Свиток телепортации',
    difficulty: 'medium',
    type: 'text',
    category: 'Предметы',
  },
  {
    id: 'q13',
    text: 'Какой предмет дает герою невидимость при стоянии на месте и называется «Серп» в народе?',
    correctAnswer: 'Shadow Blade / Клинок тени',
    difficulty: 'medium',
    type: 'text',
    category: 'Предметы',
  },
  {
    id: 'q14',
    text: 'Как называется механика когда ваш герой атакует крипа последним ударом чтобы получить золото?',
    correctAnswer: 'Ласт хит / Last hit',
    difficulty: 'medium',
    type: 'text',
    category: 'Механики',
  },
  {
    id: 'q15',
    text: 'Какой герой известен своей ультой «Black Hole», засасывающей всех врагов в одну точку?',
    correctAnswer: 'Enigma / Энигма',
    difficulty: 'medium',
    type: 'text',
    category: 'Герои',
  },
  {
    id: 'q16',
    text: 'Что такое «Creep skip» или «Pull» и зачем это делают?',
    correctAnswer: 'Затягивание крипов в лагерь нейтралов чтобы союзные крипы не получали опыт / лишение противника фарма',
    difficulty: 'medium',
    type: 'text',
    category: 'Механики',
  },
  // --- HARD ---
  {
    id: 'q17',
    text: 'Как называется механика «стека» нейтральных крипов и сколько крипов нужно в стеке чтобы получить максимальную выгоду от одного лагеря?',
    correctAnswer: 'Stack / стек, нет ограничения — чем больше тем лучше, обычно 5-10',
    difficulty: 'hard',
    type: 'text',
    category: 'Механики',
  },
  {
    id: 'q18',
    text: 'Что такое «Linkens Sphere» и какую механику она блокирует? Назови 2 исключения когда она НЕ работает.',
    correctAnswer: 'Блокирует одно целевое заклинание. Не работает против AOE и против заклинаний без цели (напр. Black Hole, Epicenter)',
    difficulty: 'hard',
    type: 'text',
    category: 'Предметы',
  },
  {
    id: 'q19',
    text: 'Сколько секунд длится Aegis of Immortal (время до исчезновения если не умер)?',
    correctAnswer: '5 минут / 300 секунд',
    difficulty: 'hard',
    type: 'text',
    category: 'Механики',
  },
  {
    id: 'q20',
    text: 'Как называется баг/механика когда Meepo копии получают опыт за убийство и смерть друг друга при правильном использовании?',
    correctAnswer: 'Meepo XP exploit / каждая копия Meepo делит опыт между всеми',
    difficulty: 'hard',
    type: 'text',
    category: 'Герои',
  },
  {
    id: 'q21',
    text: 'Назови трёх героев, у которых есть встроенный в способность «Break» (отключение пассивных способностей врага).',
    correctAnswer: 'Bristleback (Quill Spray), Silencer (Last Word), Necrophos / другие варианты принимаются',
    difficulty: 'hard',
    type: 'text',
    category: 'Герои',
  },
  {
    id: 'q22',
    text: 'Что происходит с героем Pudge когда он использует «Dismember» на вражеском Омникнайте с активной способностью Repel?',
    correctAnswer: 'Dismember не применится / заблокируется, т.к. Repel дает магическую неуязвимость',
    difficulty: 'hard',
    type: 'text',
    category: 'Механики',
  },
];

export function getInitialState(): GameState {
  return {
    phase: 'lobby',
    currentQuestionIndex: 0,
    questions: DEFAULT_QUESTIONS,
    players: [],
    answers: [],
    allAnswers: {},
    questionStartedAt: 0,
    breakStartedAt: 0,
    breakDuration: 8000,
    gameStartedAt: 0,
    lastUpdated: Date.now(),
    adminSkipBreak: false,
    gameEpoch: 0,
  };
}
