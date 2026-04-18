import { Player, GameState } from '../store/gameStore';
import { useState, useEffect, useRef } from 'react';

interface Props {
  state: GameState;
  currentPlayer: Player;
}

export default function LobbyScreen({ state, currentPlayer }: Props) {
  const sorted = [...state.players].sort((a, b) => a.joinedAt - b.joinedAt);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyserNodes, setAnalyserNodes] = useState<AnalyserNode[]>([]);
  const [frequencyData, setFrequencyData] = useState<Uint8Array[]>([]);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null]);
  const animationRef = useRef<number | null>(null);

  const videos = [
    'IMG_3305.MP4',
    'IMG_3302.MP4',
    'IMG_3299.MP4',
  ];

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const initAudio = (videoIndex: number) => {
    const video = videoRefs.current[videoIndex];
    if (!video || audioContext === null) return;

    try {
      const source = audioContext.createMediaElementAudioSource(video);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      const newAnalysers = [...analyserNodes];
      newAnalysers[videoIndex] = analyser;
      setAnalyserNodes(newAnalysers);

      const newFreqData = [...frequencyData];
      newFreqData[videoIndex] = new Uint8Array(analyser.frequencyBinCount);
      setFrequencyData(newFreqData);
    } catch (e) {
      console.log('Audio init skipped (autoplay policy)', e);
    }
  };

  const startAudioVisualization = () => {
    if (audioContext === null) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      setAudioContext(ctx);
      return;
    }

    if (analyserNodes.length === 0) {
      videos.forEach((_, i) => initAudio(i));
    }

    const animate = () => {
      if (analyserNodes.length > 0) {
        const newFreqData = [...frequencyData];
        analyserNodes.forEach((analyser, i) => {
          if (analyser) {
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            newFreqData[i] = data;
          }
        });
        setFrequencyData(newFreqData);
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();
  };

  const handleVideoPlay = (index: number) => {
    startAudioVisualization();
    initAudio(index);
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
              <div className="text-center py-8 text-gray-600">
                Ожидание игроков...
              </div>
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

        {/* Audio Test Section */}
        <div className="mt-6 bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-2xl">
          <h3 className="text-white font-bold text-lg mb-4">🔊 Тест звука</h3>
          <p className="text-gray-400 text-sm mb-4">Нажми на видео и проверь звук в наушниках</p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            {videos.map((videoFile, idx) => (
              <div key={idx} className="relative group">
                <video
                  ref={el => videoRefs.current[idx] = el}
                  src={`/media/${videoFile}`}
                  controls
                  className="w-full h-32 rounded-lg bg-black border border-gray-700 group-hover:border-red-600/50 transition-all"
                  onPlay={() => handleVideoPlay(idx)}
                  crossOrigin="anonymous"
                />
              </div>
            ))}
          </div>

          {/* Equalizer Visualization */}
          <div className="mt-4 p-4 bg-[#0d1117] rounded-lg border border-gray-800">
            <p className="text-gray-500 text-xs mb-3 font-bold uppercase">Визуализация</p>
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map((videoIdx) => (
                <div key={videoIdx} className="flex flex-col-reverse items-center gap-1 h-24">
                  {frequencyData[videoIdx] &&
                    Array.from({ length: 12 }).map((_, barIdx) => {
                      const dataIndex = Math.floor(
                        (barIdx / 12) * frequencyData[videoIdx].length
                      );
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
