import { useRef, useState } from 'react';
import { Zap, Send, RefreshCw } from 'lucide-react';
import type { GameEngine } from '../game/engine';

const STICK_R = 60;

export default function TouchControls({ engine }: { engine: GameEngine | null }) {
  const [stick, setStick] = useState<{ ox: number; oy: number; dx: number; dy: number; active: boolean }>({
    ox: 0,
    oy: 0,
    dx: 0,
    dy: 0,
    active: false,
  });
  const pointerId = useRef<number | null>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  const moveStick = (clientX: number, clientY: number) => {
    let dx = clientX - stick.ox;
    let dy = clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) {
      dx = (dx / d) * STICK_R;
      dy = (dy / d) * STICK_R;
    }
    setStick((s) => ({ ...s, dx, dy }));
    engine?.setStick(dx / STICK_R, dy / STICK_R, true);
  };

  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none">
      {/* joystick zone */}
      <div
        ref={zoneRef}
        className="pointer-events-auto absolute left-0 bottom-0 h-[55%] w-[45%]"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (pointerId.current !== null) return;
          pointerId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          setStick({ ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, active: true });
          engine?.setStick(0, 0, true);
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== pointerId.current) return;
          moveStick(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.pointerId !== pointerId.current) return;
          pointerId.current = null;
          setStick((s) => ({ ...s, active: false, dx: 0, dy: 0 }));
          engine?.setStick(0, 0, false);
        }}
        onPointerCancel={(e) => {
          if (e.pointerId !== pointerId.current) return;
          pointerId.current = null;
          setStick((s) => ({ ...s, active: false, dx: 0, dy: 0 }));
          engine?.setStick(0, 0, false);
        }}
      >
        {stick.active ? (
          <>
            <div
              className="absolute rounded-full border-2 border-white/25 bg-white/5 backdrop-blur-sm"
              style={{ left: stick.ox - STICK_R, top: stick.oy - STICK_R, width: STICK_R * 2, height: STICK_R * 2 }}
            />
            <div
              className="absolute rounded-full bg-sky-300/80 shadow-[0_0_20px_rgba(56,189,248,0.7)]"
              style={{
                left: stick.ox + stick.dx - 26,
                top: stick.oy + stick.dy - 26,
                width: 52,
                height: 52,
              }}
            />
          </>
        ) : (
          <div className="absolute left-8 bottom-10 flex h-28 w-28 items-center justify-center rounded-full border border-dashed border-white/20 text-[10px] font-display tracking-widest text-white/30">
            MUOVI
          </div>
        )}
      </div>

      {/* pulsanti azione */}
      <div className="pointer-events-auto absolute right-4 bottom-8 flex items-end gap-3">
        <button
          className="flex h-14 w-14 flex-col items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/85 backdrop-blur-md active:bg-white/25"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.preventDefault();
            engine?.touchSwitch();
          }}
        >
          <RefreshCw size={20} />
        </button>
        <button
          className="flex h-16 w-16 flex-col items-center justify-center rounded-full border border-sky-200/40 bg-sky-400/25 text-sky-100 backdrop-blur-md active:bg-sky-400/50"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.preventDefault();
            engine?.touchPass();
          }}
        >
          <Send size={22} />
        </button>
        <button
          className="flex h-20 w-20 flex-col items-center justify-center rounded-full border border-rose-200/50 bg-rose-400/30 text-rose-50 backdrop-blur-md shadow-[0_0_25px_rgba(251,113,133,0.35)] active:bg-rose-400/60"
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.preventDefault();
            engine?.touchShoot();
          }}
        >
          <Zap size={28} className="fill-current" />
        </button>
      </div>
    </div>
  );
}
