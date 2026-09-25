import { useCallback, useEffect, useRef, useState } from 'react';
import { GameEngine, type Difficulty, type Snapshot } from './game/engine';
import HUD from './components/HUD';
import TouchControls from './components/TouchControls';
import { MenuScreen, PauseScreen, EndScreen } from './components/Menus';

type Screen = 'menu' | 'playing' | 'paused' | 'over';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const bannerTimer = useRef<number | null>(null);
  const endTimer = useRef<number | null>(null);

  const [screen, setScreen] = useState<Screen>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [muted, setMuted] = useState(false);
  const [goalBanner, setGoalBanner] = useState<{ team: number; id: number } | null>(null);
  const [result, setResult] = useState<{ winner: number; score: [number, number]; shots: [number, number] } | null>(null);
  const [isTouch] = useState(
    () => window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window,
  );

  const screenRef = useRef<Screen>('menu');
  screenRef.current = screen;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new GameEngine(canvas);
    engineRef.current = engine;
    engine.inputEnabled = false;

    engine.on((e) => {
      if (e.type === 'goal') {
        setGoalBanner({ team: e.team, id: Date.now() });
        if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
        bannerTimer.current = window.setTimeout(() => setGoalBanner(null), 1900);
      } else if (e.type === 'end') {
        const s = engine.getSnapshot();
        const res = { winner: e.winner, score: e.score, shots: [...s.shots] as [number, number] };
        endTimer.current = window.setTimeout(() => {
          setResult(res);
          setScreen('over');
          engine.inputEnabled = false;
        }, 1100);
      } else if (e.type === 'pause') {
        setScreen('paused');
      } else if (e.type === 'resume') {
        setScreen('playing');
      }
    });

    const poll = window.setInterval(() => setSnap(engine.getSnapshot()), 120);

    const onBlur = () => {
      if (screenRef.current === 'playing') {
        engine.setPaused(true);
        setScreen('paused');
      }
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onBlur);
      if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
      if (endTimer.current) window.clearTimeout(endTimer.current);
      engine.dispose();
    };
  }, []);

  const startGame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.unlockAudio();
    engine.startMatch(difficulty);
    engine.inputEnabled = true;
    engine.setPaused(false);
    setResult(null);
    setGoalBanner(null);
    setScreen('playing');
  }, [difficulty]);

  const pauseGame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || screenRef.current !== 'playing') return;
    engine.setPaused(true);
    setScreen('paused');
  }, []);

  const resumeGame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPaused(false);
    setScreen('playing');
  }, []);

  const toMenu = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.inputEnabled = false;
    engine.setPaused(false);
    engine.startDemo();
    setGoalBanner(null);
    setResult(null);
    setScreen('menu');
  }, []);

  const toggleMute = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.unlockAudio();
    const next = !muted;
    engine.setMuted(next);
    setMuted(next);
  }, [muted]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#02040a]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {screen !== 'menu' && (
        <HUD
          snap={snap}
          muted={muted}
          onToggleMute={toggleMute}
          onPause={pauseGame}
          goalBanner={goalBanner}
        />
      )}

      {screen === 'playing' && isTouch && <TouchControls engine={engineRef.current} />}

      {screen === 'menu' && (
        <MenuScreen difficulty={difficulty} setDifficulty={setDifficulty} onStart={startGame} />
      )}
      {screen === 'paused' && (
        <PauseScreen onResume={resumeGame} onRestart={startGame} onMenu={toMenu} />
      )}
      {screen === 'over' && result && (
        <EndScreen
          winner={result.winner}
          score={result.score}
          shots={result.shots}
          onRematch={startGame}
          onMenu={toMenu}
        />
      )}
    </div>
  );
}
