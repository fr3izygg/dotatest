import { Player, GameState } from '../store/gameStore';
import { useState, useEffect, useRef } from 'react';

const TEST_VIDEOS = ['IMG_3305.MP4', 'IMG_3302.MP4', 'IMG_3299.MP4'];

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

interface Props {
  state: GameState;
  currentPlayer: Player;
}

export default function LobbyScreen({ state, currentPlayer }: Props) {
  const sorted = [...state.players].sort((a, b) => a.joinedAt - b.joinedAt);
  const [frequencyData, setFrequencyData] = useState<Uint8Array[]>(
    Array.from({ length: TEST_VIDEOS.length }, () => new Uint8Array(128))
  );
  const [volume, setVolume] = useState(0.6);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRefs = useRef<(AnalyserNode | null)[]>([]);
  const animationRef = useRef<number | null>(null);

  const setVideoVolume = (vol: number) => {
    videoRefs.current.forEach(video => {
      if (!video) return;
      video.volume = vol;
      video.muted = false;
    });
  };

  useEffect(() => {
    setVideoVolume(volume);
  }, [volume]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audioContextRef.current?.close();
    };
  }, []);

  const createAudioContext = () => {
    if (audioContextRef.current) return audioContextRef.current;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = ctx;
    return ctx;
  };

  const initAudio = (videoIndex: number) => {
    const video = videoRefs.current[videoIndex];
    if (!video) return;

    const audioContext = createAudioContext();
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    try {
      const source = audioContext.createMediaElementSource(video);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      analyserRefs.current[videoIndex] = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      setFrequencyData(prev => {
        const next = [...prev];
        next[videoIndex] = data;
        return next;
      });
    } catch (error) {
      console.log('Audio init skipped', error);
    }
  };

  const animateFrequency = () => {
    const analysers = analyserRefs.current;
    if (!analysers.some(Boolean)) return;

    const update = () => {
      const nextData = [...frequencyData];
      analysers.forEach((analyser, idx) => {
        if (!analyser) return;
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        nextData[idx] = data;
      });
      setFrequencyData(nextData);
      animationRef.current = requestAnimationFrame(update);
    };

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(update);
  };

  const handleVideoPlay = (index: number) => {
    initAudio(index);
    animateFrequency();
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-red-900/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-orange-900/20 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-orange-500 shadow-2xl shadow-red-900/50 mb-4">
            <span className="text-3xl">🎮</span>
          </div>
          <h1 className="text-3xl font-black text-white">DOTA 2 <span className="text-red-500">QUIZ</span></h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-gray-400 text-sm">Ожидание начала игры...</span>
          </div>
        </div>

        <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-lg">Игроки в лобби</h2>
            <span className="bg-red-600/20 text-red-400 text-sm font-bold px-3 py-1 rounded-full border border-red-600/30">
              {state.players.length} чел.
            </span>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {sorted.map((player, idx) => (
              <div
                key={player.id}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                  player.id === currentPlayer.id
                    ? 'bg-red-600/20 border border-red-600/40'
                    : 'bg-[#0d1117] border border-gray-800'
                }`}
              >
                <span className="text-gray-600 text-sm w-5 text-center">{idx + 1}</span>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center text-white font-bold text-sm">
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <span className={`font-medium ${player.id === currentPlayer.id ? 'text-red-300' : 'text-gray-300'}`}>
                  {player.name}
                  {player.id === currentPlayer.id && <span className="text-red-500 text-xs ml-2">(ты)</span>}
                </span>
                <div className="ml-auto w-2 h-2 rounded-full bg-green-400" />
              </div>
            ))}

            {state.players.length === 0 && (
              <div className="text-center py-8 text-gray-600">Ожидание игроков...</div>
            )}
          </div>
        </div>

        <div className="mt-4 bg-[#161b22] border border-gray-800 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-400 flex items-center justify-center text-white font-bold">
              {currentPlayer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white font-semibold">{currentPlayer.name}</p>
              <p className="text-gray-500 text-xs">Ты в лобби · Ждём начала от организатора</p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-gray-700 mt-4">
          Вопросов в игре: {state.questions.length} · Таймер не ограничен
        </p>

        <div className="mt-6 bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4 gap-4">
            <div>
              <h3 className="text-white font-bold text-lg">🔊 Тест звука</h3>
              <p className="text-gray-400 text-sm">Нажми на видео и проверь звук</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">Громкость</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={e => setVolume(Number(e.target.value))}
                className="w-36 accent-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {TEST_VIDEOS.map((videoFile, idx) => (
              <div key={idx} className="relative rounded-2xl overflow-hidden border border-gray-800 bg-black">
                <video
                  ref={el => (videoRefs.current[idx] = el)}
                  src={normalizeLocalUrl(`/media/${videoFile}`)}
                  controls
                  className="w-full h-40 object-cover bg-black"
                  onPlay={() => handleVideoPlay(idx)}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 bg-[#0d1117] rounded-lg border border-gray-800">
            <p className="text-gray-500 text-xs mb-3 font-bold uppercase">Визуализация</p>
            <div className="grid grid-cols-3 gap-4">
              {TEST_VIDEOS.map((_, videoIdx) => (
                <div key={videoIdx} className="flex flex-col-reverse items-center gap-1 h-24">
                  {frequencyData[videoIdx] &&
                    Array.from({ length: 12 }).map((_, barIdx) => {
                      const dataIndex = Math.floor((barIdx / 12) * frequencyData[videoIdx].length);
                      const height = frequencyData[videoIdx][dataIndex] || 0;
                      return (
                        <div
                          key={barIdx}
                          className="w-2 rounded-full bg-gradient-to-t from-red-600 to-orange-400 transition-all"
                          style={{
                            height: `${(height / 255) * 100}%`,
                            minHeight: '2px',
                          }}
                        />
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
