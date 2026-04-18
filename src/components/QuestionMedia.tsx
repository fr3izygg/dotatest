import { useMemo } from 'react';
import type { QuestionMediaItem } from '../store/gameStore';

/** Извлекает id ролика YouTube из распространённых форматов URL */
export function parseYoutubeVideoId(url: string): string | null {
  const u = url.trim();
  const m =
    u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/) ||
    u.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}

function OneVideo({ url }: { url: string }) {
  const yt = parseYoutubeVideoId(url);
  const isDirect = /\.(mp4|webm|ogg)(\?.*)?$/i.test(url.trim());

  if (yt) {
    return (
      <div className="mb-4 rounded-xl overflow-hidden border border-gray-800 aspect-video bg-black">
        <iframe
          title="Видео к вопросу"
          src={`https://www.youtube.com/embed/${yt}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  if (isDirect) {
    return (
      <div className="mb-4 rounded-xl overflow-hidden border border-gray-800 bg-black">
        <video src={url.trim()} controls className="w-full max-h-72" playsInline>
          Видео не поддерживается
        </video>
      </div>
    );
  }
  return (
    <a
      href={url.trim()}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-4 inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline"
    >
      Открыть видео по ссылке
    </a>
  );
}

interface Props {
  items: QuestionMediaItem[];
  className?: string;
}

export default function QuestionMedia({ items, className = '' }: Props) {
  const list = useMemo(() => items.filter(m => m.url?.trim()), [items]);

  if (list.length === 0) return null;

  return (
    <div className={className}>
      {list.map((m, idx) => {
        const key = `${m.kind}-${idx}-${m.url.slice(0, 24)}`;
        if (m.kind === 'image') {
          return (
            <div key={key} className="mb-4 rounded-xl overflow-hidden border border-gray-800">
              <img
                src={m.url.trim()}
                alt={`Иллюстрация ${idx + 1}`}
                className="w-full max-h-72 object-contain bg-black/40"
              />
            </div>
          );
        }
        return <OneVideo key={key} url={m.url} />;
      })}
    </div>
  );
}
