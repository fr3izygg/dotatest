import { useState, useEffect } from 'react';
import type { Question } from '../store/gameStore';
import { loadQuestionPresets, saveQuestionPreset, deleteQuestionPreset, initializeDefaultPresets, type QuestionPreset } from '../lib/supabaseClient';

interface Props {
  currentQuestions: Question[];
  onLoadPreset: (questions: Question[]) => void;
  onClose: () => void;
}

export default function PresetManager({ currentQuestions, onLoadPreset, onClose }: Props) {
  const [presets, setPresets] = useState<QuestionPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    setLoading(true);
    await initializeDefaultPresets();
    const data = await loadQuestionPresets();
    setPresets(data);
    setLoading(false);
  };

  const handleSaveAsPreset = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const id = `preset_${Date.now()}`;
    const success = await saveQuestionPreset(id, newName.trim(), currentQuestions);
    if (success) {
      await loadPresets();
      setNewName('');
    }
    setSaving(false);
  };

  const handleLoadPreset = (preset: QuestionPreset) => {
    onLoadPreset(preset.questions);
    onClose();
  };

  const handleDeletePreset = async (id: string) => {
    if (!confirm('Удалить этот пресет?')) return;
    await deleteQuestionPreset(id);
    await loadPresets();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 sm:p-6">
      <div className="bg-[#161b22] border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-lg">Пресеты вопросов</h2>
            <p className="text-gray-500 text-xs mt-1">
              Сохраняйте и загружайте наборы вопросов. Пресеты сохраняются в базе данных.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none px-2">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Save current as preset */}
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-3">Сохранить текущий набор</h3>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Название пресета"
                className="flex-1 bg-[#161b22] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
              />
              <button
                onClick={handleSaveAsPreset}
                disabled={!newName.trim() || saving}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>

          {/* Load presets */}
          <div className="bg-[#0d1117] border border-gray-800 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-3">Загрузить пресет</h3>
            {loading ? (
              <p className="text-gray-500 text-sm">Загрузка...</p>
            ) : presets.length === 0 ? (
              <p className="text-gray-500 text-sm">Нет сохранённых пресетов.</p>
            ) : (
              <div className="space-y-2">
                {presets.map(preset => (
                  <div key={preset.id} className="flex items-center gap-3 bg-[#161b22] border border-gray-700 rounded-lg p-3">
                    <div className="flex-1">
                      <div className="text-white font-medium">{preset.name}</div>
                      <div className="text-gray-500 text-xs">
                        {preset.questions.length} вопросов · Обновлено {new Date(preset.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleLoadPreset(preset)}
                      className="bg-blue-700 hover:bg-blue-600 text-white text-sm font-bold px-3 py-1.5 rounded-lg"
                    >
                      Загрузить
                    </button>
                    <button
                      onClick={() => handleDeletePreset(preset.id)}
                      className="text-red-400 hover:text-red-300 text-sm font-bold px-2"
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end px-4 py-3 border-t border-gray-800 flex-shrink-0 bg-[#0d1117]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-gray-400 hover:text-white text-sm font-bold">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}