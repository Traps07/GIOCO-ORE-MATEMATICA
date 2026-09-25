import { Play, RotateCcw, Home, Trophy, Frown, Handshake, ChevronRight } from 'lucide-react';
import type { Difficulty } from '../game/engine';

const DIFF_INFO: { id: Difficulty; label: string; desc: string }[] = [
  { id: 'easy', label: 'FACILE', desc: 'avversari rilassati' },
  { id: 'normal', label: 'NORMALE', desc: 'partita equilibrata' },
  { id: 'hard', label: 'DIFFICILE', desc: 'pressing feroce' },
];

export function MenuScreen({
  difficulty,
  setDifficulty,
  onStart,
}: {
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  onStart: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gradient-to-b from-[#02040ad9] via-[#02040a8c] to-[#02040ae6] backdrop-blur-[2px]">
      <div className="menu-stagger flex flex-col items-center px-6 text-center">
        <div className="mb-3 flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300 animate-pulse" />
          <span className="font-display text-[10px] tracking-[0.4em] text-sky-200">PARTITA LAMPO · 90 SECONDI</span>
        </div>

        <h1 className="font-display leading-[0.9] tracking-tight">
          <span className="block text-[clamp(3rem,10vw,6.5rem)] text-white">STREET</span>
          <span className="block text-[clamp(3rem,10vw,6.5rem)] text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-cyan-200 to-rose-300 glow-soft">
            SOCCER 3v3
          </span>
        </h1>

        <p className="mt-4 max-w-md text-sm sm:text-base text-white/60">
          Tre contro tre, ritmo altissimo. Guida la squadra <span className="text-sky-300 font-semibold">BLU</span>,
          dribbla, passa e trafigli la <span className="text-rose-300 font-semibold">ROSSA</span> prima che scada il tempo.
        </p>

        <div className="mt-7 flex gap-2 sm:gap-3">
          {DIFF_INFO.map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              className={`group flex flex-col items-center rounded-2xl border px-4 sm:px-6 py-3 transition-all duration-200 ${
                difficulty === d.id
                  ? 'border-sky-300/70 bg-sky-400/15 shadow-[0_0_30px_rgba(56,189,248,0.25)]'
                  : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
              }`}
            >
              <span className={`font-display text-xs tracking-[0.2em] ${difficulty === d.id ? 'text-sky-200' : 'text-white/75'}`}>
                {d.label}
              </span>
              <span className="mt-1 text-[10px] text-white/40">{d.desc}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onStart}
          className="btn-play group mt-8 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-300 px-10 py-4 font-display text-lg tracking-[0.15em] text-[#031524] transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          <Play size={22} className="fill-current" />
          GIOCA ORA
        </button>

        <div className="mt-8 hidden grid-cols-5 gap-2 sm:grid">
          {[
            ['WASD · Frecce', 'movimento'],
            ['Shift', 'scatto'],
            ['Spazio', 'tiro'],
            ['C', 'passaggio'],
            ['Q · Tab', 'cambia giocatore'],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5">
              <span className="font-display text-[11px] text-sky-200 tracking-wide">{k}</span>
              <span className="text-[10px] text-white/45">{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[11px] text-white/35 sm:hidden">Su mobile: joystick a sinistra, pulsanti a destra</p>
      </div>
    </div>
  );
}

export function PauseScreen({
  onResume,
  onRestart,
  onMenu,
}: {
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#02040ab3] backdrop-blur-md">
      <div className="menu-stagger flex flex-col items-center text-center px-6">
        <h2 className="font-display text-[clamp(2.5rem,8vw,5rem)] text-white leading-none">PAUSA</h2>
        <p className="mt-2 text-sm text-white/50 tracking-wide">Prendi fiato, la partita ti aspetta.</p>
        <div className="mt-8 flex flex-col gap-3 w-64">
          <button
            onClick={onResume}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-300 px-6 py-3.5 font-display text-sm tracking-[0.15em] text-[#031524] transition hover:scale-[1.03] active:scale-95"
          >
            <ChevronRight size={18} className="fill-current" /> RIPRENDI
          </button>
          <button
            onClick={onRestart}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-6 py-3 font-display text-sm tracking-[0.15em] text-white/85 transition hover:bg-white/15 active:scale-95"
          >
            <RotateCcw size={16} /> RICOMINCIA
          </button>
          <button
            onClick={onMenu}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-6 py-3 font-display text-sm tracking-[0.15em] text-white/85 transition hover:bg-white/15 active:scale-95"
          >
            <Home size={16} /> MENU
          </button>
        </div>
      </div>
    </div>
  );
}

export function EndScreen({
  winner,
  score,
  shots,
  onRematch,
  onMenu,
}: {
  winner: number;
  score: [number, number];
  shots: [number, number];
  onRematch: () => void;
  onMenu: () => void;
}) {
  const win = winner === 0;
  const draw = winner === -1;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#02040ab8] backdrop-blur-md">
      <div className="menu-stagger flex flex-col items-center text-center px-6">
        <div className={`mb-4 rounded-full p-4 ${win ? 'bg-sky-400/15 text-sky-300' : draw ? 'bg-white/10 text-white/70' : 'bg-rose-400/15 text-rose-300'}`}>
          {win ? <Trophy size={40} /> : draw ? <Handshake size={40} /> : <Frown size={40} />}
        </div>
        <h2
          className={`font-display text-[clamp(2.6rem,9vw,5.5rem)] leading-none ${
            win ? 'text-sky-300 glow-sky-strong' : draw ? 'text-white' : 'text-rose-300 glow-rose-strong'
          }`}
        >
          {win ? 'VITTORIA!' : draw ? 'PAREGGIO' : 'SCONFITTA'}
        </h2>
        <div className="mt-5 flex items-center gap-4 rounded-2xl border border-white/10 bg-black/50 px-8 py-3 backdrop-blur-md">
          <span className="font-display text-5xl text-sky-300 tabular-nums">{score[0]}</span>
          <span className="font-display text-2xl text-white/30">—</span>
          <span className="font-display text-5xl text-rose-300 tabular-nums">{score[1]}</span>
        </div>
        <p className="mt-3 text-xs tracking-[0.3em] text-white/40 font-display">
          TIRI {shots[0]} · {shots[1]}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <button
            onClick={onRematch}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-300 px-8 py-3.5 font-display text-sm tracking-[0.15em] text-[#031524] transition hover:scale-[1.03] active:scale-95"
          >
            <RotateCcw size={17} /> RIVINCITA
          </button>
          <button
            onClick={onMenu}
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-8 py-3.5 font-display text-sm tracking-[0.15em] text-white/85 transition hover:bg-white/15 active:scale-95"
          >
            <Home size={16} /> MENU
          </button>
        </div>
      </div>
    </div>
  );
}
