import { useEffect, useMemo, useRef } from 'react';
import type { QuestionMediaItem } from '../store/gameStore';

/** Извлекает id ролика YouTube из распространённых форматов URL */
export function parseYoutubeVideoId(url: string): string | null {
  const u = url.trim();
  const m =
    u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/) ||
    u.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}

function normalizeLocalUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;

  let normalizedPath = u;
  if (normalizedPath.startsWith('/media/')) normalizedPath = normalizedPath.slice('/media'.length);
  if (normalizedPath.startsWith('media/')) normalizedPath = normalizedPath.slice('media'.length);
  if (!normalizedPath.startsWith('/')) normalizedPath = `/${normalizedPath}`;

  const base = import.meta.env.BASE_URL ?? '/';
  return `${base.replace(/\/$/, '')}${normalizedPath}`;
}

function OneVideo({ url, stopAtSeconds, limitPlayback, autoPlay, muted, fill }: { url: string; stopAtSeconds?: number; limitPlayback: boolean; autoPlay?: boolean; muted?: boolean; fill?: boolean }) {
  const yt = parseYoutubeVideoId(url);
  const normalized = normalizeLocalUrl(url);
  const isDirect = /\.(mp4|webm|ogg)(\?.*)?$/i.test(normalized);
  const ref = useRef<HTMLVideoElement | null>(null);

  if (yt) {
    const isShort = url.includes('shorts');
    const aspectClass = isShort ? 'aspect-square' : 'aspect-video';
    const params = new URLSearchParams({
      autoplay: (autoPlay && muted) ? '1' : '0', // Autoplay only if muted
      mute: muted ? '1' : '0',
      controls: '0',
      modestbranding: '1',
      rel: '0',
      showinfo: '0',
    });
    return (
      <div className={`rounded-xl overflow-hidden border border-gray-800 ${fill ? 'h-full' : aspectClass} bg-black relative`}>
        <iframe
          title="Видео к вопросу"
          src={`https://www.youtube.com/embed/${yt}?${params.toString()}`}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: 'cover' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!limitPlayback || typeof stopAtSeconds !== 'number' || !Number.isFinite(stopAtSeconds) || stopAtSeconds <= 0) return;

    const onTime = () => {
      if (el.currentTime >= stopAtSeconds) {
        el.currentTime = stopAtSeconds;
        el.pause();
      }
    };
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [limitPlayback, stopAtSeconds]);

  if (isDirect) {
    return (
      <div className={`rounded-xl overflow-hidden border border-gray-800 bg-black relative ${fill ? 'h-full' : ''}`}>
        <video
          ref={ref}
          src={normalized}
          autoPlay={autoPlay}
          muted={muted}
          preload="metadata"
          className="w-full h-full object-cover min-h-0"
          playsInline
        >
          Видео не поддерживается
        </video>
      </div>
    );
  }
  return (
    <a
      href={normalized}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 underline"
    >
      Открыть видео по ссылке
    </a>
  );
}

interface Props {
  items: QuestionMediaItem[];
  /** Если true: во время раунда ограничиваем видео по stopAtSeconds */
  limitPlayback?: boolean;
  /** Если true: видео автостартует */
  autoPlay?: boolean;
  /** Если true: видео без звука */
  muted?: boolean;
  /** Если true: видео растягивается по контейнеру */
  fill?: boolean;
  className?: string;
}

export default function QuestionMedia({ items, limitPlayback = false, autoPlay = false, muted = false, fill = false, className = '' }: Props) {
  const list = useMemo(() => items.filter(m => m.url?.trim()), [items]);
  const wrapperClass = `${className} min-h-0 overflow-hidden`;

  if (list.length === 0) return null;

  return (
    <div className={wrapperClass}>
      <div className="grid grid-cols-1 gap-3 min-h-0">
        {list.map((m, idx) => {
          const key = `${m.kind}-${idx}-${m.url.slice(0, 24)}`;
          if (m.kind === 'image') {
            return (
              <div key={key} className="rounded-xl overflow-hidden border border-gray-800">
                <img
                  src={normalizeLocalUrl(m.url)}
                  alt={`Иллюстрация ${idx + 1}`}
                  className="w-full max-h-80 object-contain bg-black/40"
                />
              </div>
            );
          }

          return (
            <div key={key} className="rounded-3xl overflow-hidden border border-gray-800 bg-black h-full">
              <OneVideo
                url={m.url}
                stopAtSeconds={m.stopAtSeconds}
                limitPlayback={limitPlayback}
                autoPlay={autoPlay}
                muted={muted}
                fill
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
