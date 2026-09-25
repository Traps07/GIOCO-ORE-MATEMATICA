import { Volume2, VolumeX, Pause } from 'lucide-react';
import type { Snapshot } from '../game/engine';

interface Props {
  snap: Snapshot | null;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  goalBanner: { team: number; id: number } | null;
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export default function HUD({ snap, muted, onToggleMute, onPause, goalBanner }: Props) {
  if (!snap) return null;
  const urgent = snap.timeLeft <= 10 && snap.phase === 'play';
  const progress = snap.timeLeft / 90;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
      {/* tabellone */}
      <div className="flex items-start justify-between px-4 pt-4 sm:px-6">
        <div className="w-24" />
        <div className="score-pill flex flex-col items-center">
          <div className="flex items-center gap-3 sm:gap-4 rounded-2xl border border-white/10 bg-black/55 px-5 py-2.5 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
            <span className="hidden sm:block font-display text-[11px] tracking-[0.25em] text-sky-300">BLU</span>
            <span className="h-7 w-2.5 rounded-full bg-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.9)] sm:hidden" />
            <span className="font-display text-3xl sm:text-4xl text-sky-300 glow-sky leading-none tabular-nums">{snap.score[0]}</span>
            <span className="font-display text-xl text-white/30 leading-none">—</span>
            <span className="font-display text-3xl sm:text-4xl text-rose-300 glow-rose leading-none tabular-nums">{snap.score[1]}</span>
            <span className="h-7 w-2.5 rounded-full bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.9)] sm:hidden" />
            <span className="hidden sm:block font-display text-[11px] tracking-[0.25em] text-rose-300">ROS</span>
          </div>
          <div className={`mt-2 flex w-56 items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 backdrop-blur-md`}>
            <span className={`font-display text-sm tabular-nums leading-none ${urgent ? 'text-amber-300 animate-pulse' : 'text-white/85'}`}>
              {fmt(snap.timeLeft)}
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] duration-150 ${urgent ? 'bg-amber-400' : 'bg-gradient-to-r from-sky-400 to-rose-400'}`}
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        </div>
        <div className="pointer-events-auto flex w-24 justify-end gap-2">
          <button
            onClick={onToggleMute}
            className="rounded-xl border border-white/10 bg-black/50 p-2.5 text-white/80 backdrop-blur-md transition hover:bg-white/15 hover:text-white"
            aria-label="Audio"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            onClick={onPause}
            className="rounded-xl border border-white/10 bg-black/50 p-2.5 text-white/80 backdrop-blur-md transition hover:bg-white/15 hover:text-white"
            aria-label="Pausa"
          >
            <Pause size={18} />
          </button>
        </div>
      </div>

      {/* banner GOL */}
      {goalBanner && (
        <div key={goalBanner.id} className="absolute inset-0 flex items-center justify-center">
          <div className="goal-banner text-center">
            <div
              className={`font-display text-[clamp(3.5rem,13vw,9rem)] leading-none tracking-tight ${
                goalBanner.team === 0 ? 'text-sky-300 glow-sky-strong' : 'text-rose-300 glow-rose-strong'
              }`}
            >
              GOOOL!
            </div>
            <div className="mt-2 font-display text-sm sm:text-base tracking-[0.4em] text-white/70">
              {goalBanner.team === 0 ? 'RETE DELLA SQUADRA BLU' : 'RETE DELLA SQUADRA ROSSA'}
            </div>
          </div>
        </div>
      )}

      {/* countdown */}
      {snap.phase === 'countdown' && snap.countdown > 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="font-display text-sm tracking-[0.5em] text-white/60">CALCIO D'INIZIO</div>
          <div key={snap.countdown} className="count-pop font-display text-[clamp(5rem,18vw,11rem)] leading-none text-white glow-white">
            {snap.countdown}
          </div>
        </div>
      )}

      {/* controlli a fondo pagina (desktop) */}
      <div className="mt-auto hidden justify-center pb-4 md:flex">
        <div className="flex items-center gap-4 rounded-full border border-white/10 bg-black/40 px-6 py-2 text-[11px] font-medium tracking-wide text-white/55 backdrop-blur-md">
          <span><kbd>WASD</kbd> / <kbd>Frecce</kbd> muoviti</span>
          <span className="text-white/20">•</span>
          <span><kbd>Shift</kbd> scatto</span>
          <span className="text-white/20">•</span>
          <span><kbd>Spazio</kbd> tiro</span>
          <span className="text-white/20">•</span>
          <span><kbd>C</kbd> passaggio</span>
          <span className="text-white/20">•</span>
          <span><kbd>Q</kbd> cambia</span>
          <span className="text-white/20">•</span>
          <span><kbd>Esc</kbd> pausa</span>
        </div>
      </div>
    </div>
  );
}
