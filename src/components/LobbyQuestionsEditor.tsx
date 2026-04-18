import { useState, useMemo } from 'react';
import type { Difficulty, Question, QuestionMediaItem, QuestionResponseMode } from '../store/gameStore';
import { generateId, getQuestionMediaItems, getQuestionPoints } from '../store/gameStore';
import QuestionMedia from './QuestionMedia';

interface Props {
  questions: Question[];
  onApply: (next: Question[]) => void;
  onClose: () => void;
}

const DIFF_OPTIONS: { v: Difficulty; l: string }[] = [
  { v: 'easy', l: 'Лёгкий' },
  { v: 'medium', l: 'Средний' },
  { v: 'hard', l: 'Сложный' },
];

function emptyQuestion(): Question {
  return {
    id: generateId(),
    text: '',
    correctAnswer: '',
    difficulty: 'easy',
    type: 'text',
    category: 'Свои',
    responseMode: 'open',
    choices: ['', '', '', ''],
  };
}

function normalizeQuestion(q: Question): Question {
  const mode: QuestionResponseMode = q.responseMode === 'choice' ? 'choice' : 'open';
  let choices: string[] | undefined;
  if (mode === 'choice') {
    const raw = q.choices?.length ? [...q.choices] : ['', '', '', ''];
    choices = raw.some(c => c.trim()) ? raw.map(c => c) : ['', '', '', ''];
  }
  let pointsOverride: number | undefined;
  if (q.pointsOverride !== undefined && q.pointsOverride !== null && String(q.pointsOverride) !== '') {
    const n = Number(q.pointsOverride);
    if (!Number.isNaN(n)) pointsOverride = Math.max(0, Math.round(n));
  }
  return {
    ...q,
    responseMode: mode,
    choices,
    pointsOverride,
  };
}

export default function LobbyQuestionsEditor({ questions, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<Question[]>(() =>
    questions.map(q => {
      const items = getQuestionMediaItems(q);
      return normalizeQuestion({
        ...q,
        media: items.length > 0 ? items : q.media,
      });
    })
  );
  const [expandedId, setExpandedId] = useState<string | null>(questions[0]?.id ?? null);

  const summary = useMemo(
    () =>
      draft.map((q, i) => ({
        i,
        q,
        preview: q.text.trim() || '(без текста)',
        pts: getQuestionPoints(q),
      })),
    [draft]
  );

  const patchAt = (index: number, patch: Partial<Question>) => {
    setDraft(prev => {
      const next = [...prev];
      next[index] = normalizeQuestion({ ...next[index], ...patch });
      return next;
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= draft.length) return;
    setDraft(prev => {
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const removeAt = (index: number) => {
    if (!confirm('Удалить этот вопрос?')) return;
    setDraft(prev => prev.filter((_, i) => i !== index));
  };

  const addNew = () => {
    const q = emptyQuestion();
    setDraft(prev => [...prev, q]);
    setExpandedId(q.id);
  };

  const handleSave = () => {
    const cleaned = draft.map((q, idx) => {
      const n = normalizeQuestion(q);
      const media = (n.media || []).filter(m => m.url.trim());
      return {
        ...n,
        text: n.text.trim() || `Вопрос ${idx + 1}`,
        correctAnswer: n.correctAnswer.trim(),
        media: media.length > 0 ? media : undefined,
        imageUrl: media.length > 0 ? undefined : n.imageUrl?.trim() || undefined,
        videoUrl: media.length > 0 ? undefined : n.videoUrl?.trim() || undefined,
      };
    });
    onApply(cleaned);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 sm:p-6">
      <div className="bg-[#161b22] border border-gray-700 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Вопросы квиза</h2>
            <p className="text-gray-500 text-xs mt-1">
              Редактирование только в лобби. Изменения сохраняются в игре (localStorage или Supabase).
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none px-2">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addNew}
              className="bg-green-700 hover:bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-xl"
            >
              + Добавить вопрос
            </button>
            <span className="text-gray-500 text-sm self-center">Всего: {draft.length}</span>
          </div>

          {draft.length === 0 && (
            <p className="text-gray-500 text-sm">Добавьте хотя бы один вопрос перед началом игры.</p>
          )}

          {summary.map(({ q, i, preview, pts }) => {
            const open = expandedId === q.id;
            return (
              <div key={q.id} className="border border-gray-800 rounded-xl overflow-hidden bg-[#0d1117]">
                <button
                  type="button"
                  onClick={() => setExpandedId(open ? null : q.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-800/40 transition-colors"
                >
                  <span className="text-gray-500 text-xs font-mono w-6">{i + 1}.</span>
                  <span className="text-gray-200 text-sm flex-1 truncate">{preview}</span>
                  <span className="text-yellow-500/90 text-xs font-bold">+{pts}</span>
                  <span className="text-gray-600 text-xs">{open ? '▼' : '▶'}</span>
                </button>
                {open && (
                  <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-800/80">
                    <label className="block">
                      <span className="text-gray-500 text-xs">Текст вопроса</span>
                      <textarea
                        value={q.text}
                        onChange={e => patchAt(i, { text: e.target.value })}
                        rows={3}
                        className="mt-1 w-full bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-600 focus:outline-none resize-y min-h-[72px]"
                      />
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-gray-500 text-xs">Категория</span>
                        <input
                          value={q.category}
                          onChange={e => patchAt(i, { category: e.target.value })}
                          className="mt-1 w-full bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="text-gray-500 text-xs">Сложность (если нет своих баллов)</span>
                        <select
                          value={q.difficulty}
                          onChange={e => patchAt(i, { difficulty: e.target.value as Difficulty })}
                          className="mt-1 w-full bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                        >
                          {DIFF_OPTIONS.map(o => (
                            <option key={o.v} value={o.v}>
                              {o.l}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-gray-500 text-xs">Свои баллы за верный ответ (пусто = по сложности)</span>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={q.pointsOverride ?? ''}
                        onChange={e => {
                          const v = e.target.value;
                          if (v === '') {
                            patchAt(i, { pointsOverride: undefined });
                            return;
                          }
                          const n = Number(v);
                          patchAt(i, { pointsOverride: Number.isNaN(n) ? undefined : Math.max(0, n) });
                        }}
                        placeholder={`По умолчанию: ${getQuestionPoints({ ...q, pointsOverride: undefined })}`}
                        className="mt-1 w-full bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-gray-500 text-xs">Основной правильный ответ (для подсказки админу)</span>
                      <input
                        value={q.correctAnswer}
                        onChange={e => patchAt(i, { correctAnswer: e.target.value })}
                        className="mt-1 w-full bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                      />
                    </label>
                    <label className="block">
                      <span className="text-gray-500 text-xs">Допустимые ответы (для себя), с новой строки или через |</span>
                      <textarea
                        value={q.acceptableAnswers ?? ''}
                        onChange={e => patchAt(i, { acceptableAnswers: e.target.value || undefined })}
                        rows={2}
                        placeholder="Lich&#10;лич&#10;лич"
                        className="mt-1 w-full bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm resize-y"
                      />
                    </label>
                    <div>
                      <span className="text-gray-500 text-xs font-bold uppercase tracking-wide">Медиа к вопросу</span>
                      <p className="text-gray-600 text-[11px] mt-0.5 mb-2">
                        Любое количество блоков: фото (URL картинки) и видео (YouTube или mp4/webm). Порядок = порядок показа у игроков.
                      </p>
                      <div className="flex gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => alert('Медиа файлы (изображения, видео) можно:\n\n1. Разместить на внешнем хостинге (Imgur, YouTube и т.д.) и вставить прямую ссылку.\n\n2. Загрузить на сервер в папку /media/ и использовать путь вида /media/filename.jpg или /media/video.mp4\n\nДля локальной разработки положите файлы в public/media/')}
                          className="text-xs font-bold text-blue-400 hover:text-blue-300 underline"
                        >
                          ? Где взять медиа
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(q.media ?? []).map((m, mi) => (
                          <div key={mi} className="flex flex-wrap gap-2 items-center bg-[#161b22] border border-gray-800 rounded-lg p-2">
                            <select
                              value={m.kind}
                              onChange={e => {
                                const next = [...(q.media ?? [])];
                                next[mi] = { ...next[mi], kind: e.target.value as QuestionMediaItem['kind'] };
                                patchAt(i, { media: next });
                              }}
                              className="bg-[#0d1117] border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs"
                            >
                              <option value="image">Фото</option>
                              <option value="video">Видео</option>
                            </select>
                            <input
                              value={m.url}
                              onChange={e => {
                                const next = [...(q.media ?? [])];
                                next[mi] = { ...next[mi], url: e.target.value };
                                patchAt(i, { media: next });
                              }}
                              placeholder="https://... или /vids/ролик.mp4"
                              className="flex-1 min-w-[160px] bg-[#0d1117] border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm"
                            />
                            {m.kind === 'video' && (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600 text-xs">стоп (сек)</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={m.stopAtSeconds ?? ''}
                                  onChange={e => {
                                    const v = e.target.value;
                                    const next = [...(q.media ?? [])];
                                    if (v === '') {
                                      next[mi] = { ...next[mi], stopAtSeconds: undefined };
                                    } else {
                                      const n = Number(v);
                                      next[mi] = { ...next[mi], stopAtSeconds: Number.isNaN(n) ? undefined : Math.max(0, n) };
                                    }
                                    patchAt(i, { media: next });
                                  }}
                                  className="w-24 bg-[#0d1117] border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs"
                                  title="Во время вопроса видео остановится на этом таймкоде. На перерыве ограничение снимается."
                                />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const next = (q.media ?? []).filter((_, j) => j !== mi);
                                patchAt(i, { media: next.length ? next : undefined });
                              }}
                              className="text-red-400 hover:text-red-300 text-xs font-bold px-2"
                            >
                              Удалить
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            patchAt(i, {
                              media: [...(q.media ?? []), { kind: 'image', url: '' }],
                            })
                          }
                          className="text-xs font-bold text-purple-400 hover:text-purple-300"
                        >
                          + Добавить фото или видео
                        </button>
                      </div>
                    </div>
                    {(q.media ?? []).some(m => m.url.trim()) && (
                      <div className="rounded-lg border border-gray-800 p-2 bg-black/20">
                        <p className="text-gray-600 text-[10px] uppercase mb-2">Предпросмотр</p>
                        <QuestionMedia items={(q.media ?? []).filter(m => m.url.trim())} />
                      </div>
                    )}
                    <fieldset className="space-y-2">
                      <legend className="text-gray-500 text-xs">Тип ответа</legend>
                      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="radio"
                          name={`mode-${q.id}`}
                          checked={q.responseMode !== 'choice'}
                          onChange={() => patchAt(i, { responseMode: 'open', choices: undefined })}
                        />
                        Свободный ввод
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input
                          type="radio"
                          name={`mode-${q.id}`}
                          checked={q.responseMode === 'choice'}
                          onChange={() =>
                            patchAt(i, {
                              responseMode: 'choice',
                              choices: q.choices?.length ? q.choices : ['', '', '', ''],
                            })
                          }
                        />
                        Тест: варианты ответа
                      </label>
                    </fieldset>
                    {q.responseMode === 'choice' && (
                      <div className="space-y-2 pl-1">
                        {(q.choices ?? ['', '', '', '']).map((c, ci) => (
                          <div key={ci} className="flex gap-2 items-center">
                            <span className="text-gray-600 text-xs w-5">{ci + 1}.</span>
                            <input
                              value={c}
                              onChange={e => {
                                const next = [...(q.choices ?? ['', '', '', ''])];
                                next[ci] = e.target.value;
                                patchAt(i, { choices: next });
                              }}
                              className="flex-1 bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
                              placeholder={`Вариант ${ci + 1}`}
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => patchAt(i, { choices: [...(q.choices ?? []), ''] })}
                          className="text-xs text-purple-400 hover:text-purple-300"
                        >
                          + ещё вариант
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800/80">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-30"
                      >
                        Вверх
                      </button>
                      <button
                        type="button"
                        disabled={i >= draft.length - 1}
                        onClick={() => move(i, 1)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-30"
                      >
                        Вниз
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAt(i)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-900/50 text-red-300 ml-auto"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 justify-end px-4 py-3 border-t border-gray-800 flex-shrink-0 bg-[#0d1117]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-gray-400 hover:text-white text-sm font-bold">
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={draft.length === 0}
            className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-sm font-bold"
          >
            Сохранить и закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
