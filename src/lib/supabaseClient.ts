import { createClient } from '@supabase/supabase-js';
import type { Question } from '../store/gameStore';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

export interface QuestionPreset {
  id: string;
  name: string;
  questions: Question[];
  created_at: string;
  updated_at: string;
}

export async function loadQuestionPresets(): Promise<QuestionPreset[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('question_presets')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('Error loading presets:', error);
    return [];
  }
  return data || [];
}

export async function saveQuestionPreset(id: string, name: string, questions: Question[]): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('question_presets')
    .upsert({
      id,
      name,
      questions,
      updated_at: new Date().toISOString(),
    });
  if (error) {
    console.error('Error saving preset:', error);
    return false;
  }
  return true;
}

export async function deleteQuestionPreset(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('question_presets')
    .delete()
    .eq('id', id);
  if (error) {
    console.error('Error deleting preset:', error);
    return false;
  }
  return true;
}

export async function initializeDefaultPresets(): Promise<void> {
  if (!supabase) return;
  const existing = await loadQuestionPresets();
  if (existing.length > 0) return; // Уже есть пресеты

  // Импорт дефолтных вопросов
  const { DEFAULT_QUESTIONS } = await import('../store/gameStore');

  // Создать тест пресет (первые 5 вопросов)
  await saveQuestionPreset('default_test', 'Тест (первые 5 вопросов)', DEFAULT_QUESTIONS.slice(0, 5));

  // Создать основной пресет (все вопросы)
  await saveQuestionPreset('default_main', 'Основной (все вопросы)', DEFAULT_QUESTIONS);
}

