import { SFX } from './sound';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Phase = 'demo' | 'countdown' | 'play' | 'goal' | 'over';

export interface Snapshot {
  phase: Phase;
  score: [number, number];
  shots: [number, number];
  timeLeft: number;
  countdown: number;
  lastGoalTeam: number;
  winner: number; // -2 = non finita, -1 = pareggio
  muted: boolean;
  controlled: number;
}

export type EngineEvent =
  | { type: 'goal'; team: number; score: [number, number] }
  | { type: 'end'; winner: number; score: [number, number] }
  | { type: 'pause' }
  | { type: 'resume' };

const W = 1200;
const H = 700;
const GOAL_HALF = 100;
const GOAL_DEPTH = 32;
const P_R = 17;
const B_R = 9;
const MATCH_TIME = 90;
const KICK_RANGE = P_R + B_R + 22;

const TEAM_COLORS = ['#38bdf8', '#fb7185'];
const TEAM_GLOW = ['rgba(56,189,248,', 'rgba(251,113,133,'];

const FORMATION: { x: number; y: number }[][] = [
  [
    { x: 80, y: 350 },
    { x: 330, y: 235 },
    { x: 330, y: 465 },
  ],
  [
    { x: W - 80, y: 350 },
    { x: W - 330, y: 235 },
    { x: W - 330, y: 465 },
  ],
];

interface DiffCfg {
  speed: number;
  shootRange: number;
  shootErr: number;
  passErr: number;
  minHold: number;
}

const DIFFS: Record<Difficulty, DiffCfg> = {
  easy: { speed: 218, shootRange: 300, shootErr: 0.17, passErr: 0.24, minHold: 0.85 },
  normal: { speed: 252, shootRange: 385, shootErr: 0.1, passErr: 0.14, minHold: 0.5 },
  hard: { speed: 284, shootRange: 450, shootErr: 0.055, passErr: 0.08, minHold: 0.3 },
};

const DEMO_CFG: DiffCfg = { speed: 195, shootRange: 340, shootErr: 0.14, passErr: 0.2, minHold: 0.7 };

const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

class Player {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  faceX = 1;
  faceY = 0;
  tx = 0;
  ty = 0;
  hasBall = false;
  kickCd = 0;
  holdT = 0;
  number: number;
  constructor(public team: number, public idx: number) {
    const f = FORMATION[team][idx];
    this.x = f.x;
    this.y = f.y;
    this.tx = f.x;
    this.ty = f.y;
    this.number = team === 0 ? [1, 7, 10][idx] : [1, 9, 11][idx];
    this.faceX = team === 0 ? 1 : -1;
  }
  reset() {
    const f = FORMATION[this.team][this.idx];
    this.x = f.x;
    this.y = f.y;
    this.vx = 0;
    this.vy = 0;
    this.hasBall = false;
    this.holdT = 0;
    this.kickCd = 0;
    this.faceX = this.team === 0 ? 1 : -1;
    this.faceY = 0;
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
  grav: number;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private lastT = 0;
  private paused = false;
  private disposed = false;
  inputEnabled = false;

  phase: Phase = 'demo';
  private players: Player[] = [];
  private controlledIdx = 1;
  private ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, lastTouch: -1 };
  private trail: { x: number; y: number }[] = [];
  private particles: Particle[] = [];
  private score: [number, number] = [0, 0];
  private shots: [number, number] = [0, 0];
  private timeLeft = MATCH_TIME;
  private countdown = 0;
  private countdownShown = -1;
  private goalT = 0;
  private lastGoalTeam = -1;
  private goalSide: -1 | 1 = 1;
  private winner = -2;
  private diff: Difficulty = 'normal';
  private shake = 0;
  private time = 0;
  private lastWholeSec = -1;
  private goalFlash = 0;

  private keys = new Set<string>();
  private stick = { x: 0, y: 0, active: false };
  private shootQ = false;
  private passQ = false;
  private switchQ = false;

  private sfx = new SFX();
  private demo = true;
  private listener: ((e: EngineEvent) => void) | null = null;

  private vw = 1;
  private vh = 1;
  private dpr = 1;
  private bgCanvas: HTMLCanvasElement | null = null;
  private resizeObs: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;

    for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) this.players.push(new Player(t, i));

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    this.resize();
    this.startDemo();
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  on(fn: (e: EngineEvent) => void) {
    this.listener = fn;
  }

  private emit(e: EngineEvent) {
    this.listener?.(e);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.resizeObs.disconnect();
  }

  // ---------- input ----------
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
      return;
    }
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (this.phase === 'play' || this.phase === 'countdown' || this.phase === 'goal') {
        if (this.paused) {
          this.setPaused(false);
          this.emit({ type: 'resume' });
        } else {
          this.setPaused(true);
          this.emit({ type: 'pause' });
        }
      }
      return;
    }
    if (!this.inputEnabled || this.paused) return;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
    this.keys.add(e.code);
    if (e.code === 'Space') this.shootQ = true;
    if (e.code === 'KeyC' || e.code === 'KeyJ' || e.code === 'KeyX') this.passQ = true;
    if (e.code === 'KeyQ' || e.code === 'Tab') this.switchQ = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  setStick(x: number, y: number, active: boolean) {
    this.stick = { x, y, active };
  }

  touchShoot() {
    if (this.inputEnabled && !this.paused) this.shootQ = true;
  }
  touchPass() {
    if (this.inputEnabled && !this.paused) this.passQ = true;
  }
  touchSwitch() {
    if (this.inputEnabled && !this.paused) this.switchQ = true;
  }

  setPaused(p: boolean) {
    this.paused = p;
  }
  setMuted(m: boolean) {
    this.sfx.setMuted(m);
  }
  unlockAudio() {
    this.sfx.ensure();
  }
  get muted() {
    return this.sfx.muted;
  }

  // ---------- flusso partita ----------
  startDemo() {
    this.phase = 'demo';
    this.demo = true;
    this.score = [0, 0];
    this.shots = [0, 0];
    this.timeLeft = MATCH_TIME;
    this.winner = -2;
    this.players.forEach((p) => p.reset());
    this.newBall();
  }

  startMatch(diff: Difficulty) {
    this.diff = diff;
    this.demo = false;
    this.sfx.ensure();
    this.score = [0, 0];
    this.shots = [0, 0];
    this.timeLeft = MATCH_TIME;
    this.winner = -2;
    this.lastGoalTeam = -1;
    this.controlledIdx = 1;
    this.kickoff();
  }

  private kickoff() {
    this.players.forEach((p) => p.reset());
    this.newBall();
    this.controlledIdx = 1;
    this.countdown = 3.4;
    this.countdownShown = 4;
    this.phase = 'countdown';
    this.keys.clear();
  }

  private newBall() {
    this.ball.x = W / 2;
    this.ball.y = H / 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.lastTouch = -1;
    this.trail = [];
  }

  private goal(team: number) {
    this.score[team]++;
    this.lastGoalTeam = team;
    this.phase = 'goal';
    this.goalT = team === 0 ? 2.6 : 2.2;
    this.goalFlash = 1;
    this.goalSide = team === 0 ? 1 : -1;
    this.shake = 16;
    this.sfx.goal();
    const gx = team === 0 ? W : 0;
    this.spawnConfetti(gx, H / 2, team === 0 ? -1 : 1, 130);
    this.emit({ type: 'goal', team, score: [...this.score] });
    if (this.demo) this.goalT = 1.6;
  }

  private endMatch() {
    this.phase = 'over';
    this.timeLeft = 0;
    this.winner = this.score[0] > this.score[1] ? 0 : this.score[1] > this.score[0] ? 1 : -1;
    this.sfx.whistle(true);
    if (this.winner === 0) setTimeout(() => this.sfx.cheer(), 400);
    this.emit({ type: 'end', winner: this.winner, score: [...this.score] });
  }

  // ---------- update ----------
  private frame = (t: number) => {
    if (this.disposed) return;
    const dt = clamp((t - this.lastT) / 1000, 0, 0.033);
    this.lastT = t;
    if (!this.paused) this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 40 - this.shake * 4 * dt);
    this.goalFlash = Math.max(0, this.goalFlash - dt * 1.6);
    this.updateParticles(dt);
    this.players.forEach((p) => (p.kickCd = Math.max(0, p.kickCd - dt)));

    if (this.phase === 'countdown') {
      this.shootQ = false;
      this.passQ = false;
      this.switchQ = false;
      this.countdown -= dt;
      const c = Math.ceil(this.countdown);
      if (c !== this.countdownShown && c > 0) {
        this.countdownShown = c;
        this.sfx.count(false);
      }
      if (this.countdown <= 0) {
        this.phase = 'play';
        this.sfx.whistle(false);
      }
      return;
    }

    if (this.phase === 'goal') {
      this.shootQ = false;
      this.passQ = false;
      this.switchQ = false;
      this.goalT -= dt;
      // palla che si assesta in rete
      this.ball.vx *= Math.exp(-4 * dt);
      this.ball.vy *= Math.exp(-4 * dt);
      this.ball.x = clamp(this.ball.x + this.ball.vx * dt, -GOAL_DEPTH + 7, W + GOAL_DEPTH - 7);
      this.ball.y = clamp(this.ball.y + this.ball.vy * dt, H / 2 - GOAL_HALF + 8, H / 2 + GOAL_HALF - 8);
      if (this.goalT <= 0) {
        if (this.demo) {
          this.players.forEach((p) => p.reset());
          this.newBall();
          this.phase = 'demo';
        } else {
          this.kickoff();
        }
      }
      return;
    }

    if (this.phase === 'over') return;

    if (this.phase === 'play') {
      this.timeLeft -= dt;
      const whole = Math.ceil(this.timeLeft);
      if (whole !== this.lastWholeSec) {
        this.lastWholeSec = whole;
        if (whole <= 5 && whole > 0) this.sfx.count(false);
        if (whole <= 0) {
          this.endMatch();
          return;
        }
      }
    }

    const isDemo = this.phase === 'demo';

    // ---------- controlli ----------
    for (const p of this.players) {
      p.hasBall = false;
      const isHuman = !isDemo && p.team === 0 && p.idx === this.controlledIdx;
      if (isHuman && this.phase === 'play') {
        this.humanControl(p, dt);
      } else {
        const cfg = isDemo ? DEMO_CFG : p.team === 1 ? DIFFS[this.diff] : { ...DIFFS.normal, speed: 262 };
        this.aiControl(p, dt, cfg);
      }
      this.integratePlayer(p, dt);
    }

    this.separatePlayers();

    for (const p of this.players) this.contactBall(p, dt);

    this.updateBall(dt, isDemo);

    // dribble magnet
    for (const p of this.players) {
      if (!p.hasBall || p.kickCd > 0) continue;
      const bs = Math.hypot(this.ball.vx, this.ball.vy);
      if (bs > 260) continue;
      const k = Math.min(1, 12 * dt);
      this.ball.vx += (p.vx * 1.02 + p.faceX * 46 - this.ball.vx) * k;
      this.ball.vy += (p.vy * 1.02 + p.faceY * 46 - this.ball.vy) * k;
      p.holdT += dt;
    }

    // trail palla
    const bs = Math.hypot(this.ball.vx, this.ball.vy);
    if (bs > 210) {
      this.trail.push({ x: this.ball.x, y: this.ball.y });
      if (this.trail.length > 14) this.trail.shift();
    } else if (this.trail.length > 0) {
      this.trail.shift();
    }

    // queue input uomini
    if (this.phase === 'play' && !isDemo) {
      const me = this.getControlled();
      if (this.switchQ) {
        this.controlledIdx = (this.controlledIdx + 1) % 3;
        this.sfx.swap();
      }
      if (this.shootQ && me.kickCd <= 0 && dist(me.x, me.y, this.ball.x, this.ball.y) < KICK_RANGE) {
        this.shoot(me, 0.05);
      }
      if (this.passQ && me.kickCd <= 0 && dist(me.x, me.y, this.ball.x, this.ball.y) < KICK_RANGE) {
        this.pass(me, 0.05, true);
      }
    }
    this.shootQ = false;
    this.passQ = false;
    this.switchQ = false;
  }

  private getControlled() {
    return this.players[this.controlledIdx];
  }

  private inputDir() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.stick.active && (Math.abs(this.stick.x) > 0.12 || Math.abs(this.stick.y) > 0.12)) {
      x = this.stick.x;
      y = this.stick.y;
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y, len: Math.min(1, l) };
  }

  private humanControl(p: Player, dt: number) {
    const dir = this.inputDir();
    const sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const maxS = (sprint ? 352 : 296) * (dir.len || 0);
    const dvx = dir.x * maxS - p.vx;
    const dvy = dir.y * maxS - p.vy;
    const accel = 1900 * dt;
    const dl = Math.hypot(dvx, dvy);
    if (dl > 0) {
      const k = Math.min(1, accel / dl);
      p.vx += dvx * k;
      p.vy += dvy * k;
    }
    if (dir.len > 0.15) {
      p.faceX = dir.x / (dir.len || 1);
      p.faceY = dir.y / (dir.len || 1);
    } else {
      const d = dist(p.x, p.y, this.ball.x, this.ball.y);
      if (d > 1) {
        p.faceX = (this.ball.x - p.x) / d;
        p.faceY = (this.ball.y - p.y) / d;
      }
    }
  }

  private ownGoalX(team: number) {
    return team === 0 ? 0 : W;
  }
  private oppGoalX(team: number) {
    return team === 0 ? W : 0;
  }

  private aiControl(p: Player, dt: number, cfg: DiffCfg) {
    const ball = this.ball;
    const ownX = this.ownGoalX(p.team);
    const oppX = this.oppGoalX(p.team);
    const isKeeper = p.idx === 0;
    const opps = this.players.filter((q) => q.team !== p.team);
    const myTeamPossession = ball.lastTouch === p.team;
    const meHas = dist(p.x, p.y, ball.x, ball.y) < P_R + B_R + 3;
    let tx = p.tx;
    let ty = p.ty;
    let maxS = cfg.speed;

    // chi è il più vicino al pallone nella mia squadra (escluso portiere salvo emergenze)
    const field = this.players.filter((q) => q.team === p.team && q.idx !== 0);
    const sorted = [...field].sort(
      (a, b) => dist(a.x, a.y, ball.x, ball.y) - dist(b.x, b.y, ball.x, ball.y),
    );
    const chaser = sorted[0];
    // il pallone è "libero" se nessun giocatore lo sta toccando
    const loose = !this.players.some(
      (q) => dist(q.x, q.y, ball.x, ball.y) < P_R + B_R + 6,
    );

    if (meHas) {
      // ---- ho la palla ----
      const dGoal = dist(ball.x, ball.y, oppX, H / 2);
      const pressure = Math.min(...opps.map((o) => dist(o.x, o.y, p.x, p.y)));
      const dOwn = dist(p.x, p.y, ownX, H / 2);

      if (p.kickCd <= 0 && p.holdT > cfg.minHold * (isKeeper ? 1.6 : 1)) {
        if (isKeeper || dOwn < 240) {
          // rinvio
          if (pressure < 120 || p.holdT > 1.6) this.clear(p);
        } else if (dGoal < cfg.shootRange) {
          this.aiShoot(p, cfg);
        } else if (pressure < 100 || p.holdT > 1.7) {
          this.aiPass(p, cfg);
        }
      }
      // dribbling verso la porta con curvatura
      const gy = H / 2 + Math.sin(this.time * 1.3 + p.idx * 2.1) * 90;
      const dx = oppX - ball.x;
      const dy = gy - ball.y;
      const dl = Math.hypot(dx, dy) || 1;
      let sideX = 0;
      let sideY = 0;
      if (pressure < 130) {
        // aggira il difensore
        const op = opps.reduce((a, b) =>
          dist(a.x, a.y, p.x, p.y) < dist(b.x, b.y, p.x, p.y) ? a : b,
        );
        sideX = -(op.y - p.y) * 0.5;
        sideY = (op.x - p.x) * 0.5;
      }
      tx = ball.x + (dx / dl) * 70 + sideX;
      ty = ball.y + (dy / dl) * 70 + sideY;
      maxS = cfg.speed * 0.92;
    } else if (isKeeper) {
      // ---- portiere ----
      const gx = ownX;
      const dx = ball.x - gx;
      const dy = ball.y - H / 2;
      const d = Math.hypot(dx, dy) || 1;
      const ballComing =
        Math.sign(ball.vx) === (p.team === 0 ? -1 : 1) && Math.abs(ball.vx) > 220;
      let hold = clamp(d * (ballComing ? 0.55 : 0.34), 42, 250);
      if (d < 170) hold = d; // uscita
      tx = gx + (dx / d) * hold;
      tx = p.team === 0 ? clamp(tx, 46, 270) : clamp(tx, W - 270, W - 46);
      ty = clamp(H / 2 + (dy / d) * hold, H / 2 - 190, H / 2 + 190);
      maxS = cfg.speed * 1.05;
    } else if (p === chaser && (!myTeamPossession || loose)) {
      // ---- presso il pallone ----
      tx = ball.x + ball.vx * 0.22;
      ty = ball.y + ball.vy * 0.22;
      maxS = cfg.speed * 1.06;
    } else if (!myTeamPossession && ball.lastTouch !== p.team) {
      // ---- copertura difensiva ----
      const gx = ownX;
      const dx = ball.x - gx;
      const dy = ball.y - H / 2;
      const wob = p.idx === 1 ? -120 : 120;
      tx = gx + dx * 0.38;
      ty = H / 2 + dy * 0.55 + wob * 0.4;
      tx = p.team === 0 ? clamp(tx, 90, W * 0.62) : clamp(tx, W * 0.38, W - 90);
      ty = clamp(ty, 70, H - 70);
    } else {
      // ---- supporto in attacco ----
      const form = FORMATION[p.team][p.idx];
      const dir = p.team === 0 ? 1 : -1;
      const spread = p.idx === 1 ? -1 : 1;
      const adv = clamp(p.team === 0 ? ball.x - form.x : form.x - ball.x, 0, 260);
      tx = form.x + dir * (60 + adv * 0.5);
      ty = clamp(ball.y + spread * 190, 90, H - 90);
      // non sovrapporsi al portatore
      const carrier = this.players.find(
        (q) => q.team === p.team && q !== p && dist(q.x, q.y, ball.x, ball.y) < P_R + B_R + 4,
      );
      if (carrier && dist(tx, ty, carrier.x, carrier.y) < 150) {
        ty = carrier.y + spread * 220;
      }
      ty = clamp(ty, 80, H - 80);
    }

    p.tx = tx;
    p.ty = ty;

    // movimento
    const dxt = tx - p.x;
    const dyt = ty - p.y;
    const dtg = Math.hypot(dxt, dyt);
    let dvx = 0;
    let dvy = 0;
    if (dtg > 6) {
      const want = maxS * clamp(dtg / 90, 0.35, 1);
      dvx = (dxt / dtg) * want - p.vx;
      dvy = (dyt / dtg) * want - p.vy;
      p.faceX = dxt / dtg;
      p.faceY = dyt / dtg;
    } else {
      dvx = -p.vx;
      dvy = -p.vy;
    }
    const accel = 1700 * dt;
    const dl = Math.hypot(dvx, dvy);
    if (dl > 0) {
      const k = Math.min(1, accel / dl);
      p.vx += dvx * k;
      p.vy += dvy * k;
    }
  }

  private integratePlayer(p: Player, dt: number) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.exp(-0.4 * dt);
    p.vy *= Math.exp(-0.4 * dt);
    p.x = clamp(p.x, P_R, W - P_R);
    p.y = clamp(p.y, P_R, H - P_R);
  }

  private separatePlayers() {
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i];
        const b = this.players[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = P_R * 2 + 2;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          // piccolo scambio di momento
          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const imp = (rvx * nx + rvy * ny) * 0.28;
          a.vx += nx * imp;
          a.vy += ny * imp;
          b.vx -= nx * imp;
          b.vy -= ny * imp;
        }
      }
    }
  }

  private contactBall(p: Player, dt: number) {
    const ball = this.ball;
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const d = Math.hypot(dx, dy);
    const min = P_R + B_R;
    if (d < min && d > 0.01) {
      const nx = dx / d;
      const ny = dy / d;
      ball.x = p.x + nx * (min + 0.5);
      ball.y = p.y + ny * (min + 0.5);
      const rvx = ball.vx - p.vx;
      const rvy = ball.vy - p.vy;
      const approach = rvx * nx + rvy * ny;
      if (approach < 0) {
        ball.vx -= nx * approach * 1.35;
        ball.vy -= ny * approach * 1.35;
      }
      ball.vx += p.vx * 0.18;
      ball.vy += p.vy * 0.18;
      p.hasBall = true;
      ball.lastTouch = p.team;
      void dt;
    }
  }

  private updateBall(dt: number, isDemo: boolean) {
    const ball = this.ball;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const drag = Math.exp(-0.5 * dt);
    ball.vx *= drag;
    ball.vy *= drag;
    if (Math.hypot(ball.vx, ball.vy) < 6) {
      ball.vx = 0;
      ball.vy = 0;
    }

    // pareti alto/basso
    if (ball.y < B_R) {
      ball.y = B_R;
      ball.vy = Math.abs(ball.vy) * 0.62;
    } else if (ball.y > H - B_R) {
      ball.y = H - B_R;
      ball.vy = -Math.abs(ball.vy) * 0.62;
    }

    const inMouth = Math.abs(ball.y - H / 2) < GOAL_HALF - 4;

    // gol?
    if (inMouth) {
      if (ball.x < 0) {
        this.goal(1);
        return;
      }
      if (ball.x > W) {
        this.goal(0);
        return;
      }
    } else {
      if (ball.x < B_R) {
        ball.x = B_R;
        ball.vx = Math.abs(ball.vx) * 0.62;
      } else if (ball.x > W - B_R) {
        ball.x = W - B_R;
        ball.vx = -Math.abs(ball.vx) * 0.62;
      }
    }

    // dentro la porta (prima del gol vero e proprio)
    if (Math.abs(ball.y - H / 2) < GOAL_HALF) {
      if (ball.x < -GOAL_DEPTH + B_R) {
        ball.x = -GOAL_DEPTH + B_R;
        ball.vx = Math.abs(ball.vx) * 0.5;
      } else if (ball.x > W + GOAL_DEPTH - B_R) {
        ball.x = W + GOAL_DEPTH - B_R;
        ball.vx = -Math.abs(ball.vx) * 0.5;
      }
    }

    // pali
    const posts = [
      { x: 0, y: H / 2 - GOAL_HALF },
      { x: 0, y: H / 2 + GOAL_HALF },
      { x: W, y: H / 2 - GOAL_HALF },
      { x: W, y: H / 2 + GOAL_HALF },
    ];
    for (const post of posts) {
      const dx = ball.x - post.x;
      const dy = ball.y - post.y;
      const d = Math.hypot(dx, dy);
      if (d < B_R + 5 && d > 0.01) {
        const nx = dx / d;
        const ny = dy / d;
        ball.x = post.x + nx * (B_R + 5.5);
        ball.y = post.y + ny * (B_R + 5.5);
        const vdot = ball.vx * nx + ball.vy * ny;
        if (vdot < 0) {
          ball.vx -= 1.75 * vdot * nx;
          ball.vy -= 1.75 * vdot * ny;
          if (!isDemo) this.sfx.block();
          this.shake = Math.min(this.shake + 2, 10);
        }
      }
    }
  }

  // ---------- calci ----------
  private shoot(p: Player, errRange: number) {
    const oppX = this.oppGoalX(p.team);
    const dir = p.team === 0 ? this.inputDir() : { x: 0, y: 0, len: 0 };
    const aimY = H / 2 + (dir.len > 0.2 ? dir.y * 80 : (Math.random() - 0.5) * 130) + (Math.random() - 0.5) * errRange * 300;
    const dx = oppX - p.x;
    const dy = aimY - p.y;
    const dl = Math.hypot(dx, dy) || 1;
    const power = 820 + Math.random() * 60;
    this.ball.vx = (dx / dl) * power + p.vx * 0.25;
    this.ball.vy = (dy / dl) * power + p.vy * 0.25;
    this.ball.lastTouch = p.team;
    p.kickCd = 0.3;
    p.hasBall = false;
    p.holdT = 0;
    this.shots[p.team]++;
    this.shake = Math.min(this.shake + 5, 14);
    this.sfx.kick(1);
    this.spawnKick(p.x + (dx / dl) * 22, p.y + (dy / dl) * 22, dx / dl, dy / dl, TEAM_COLORS[p.team]);
  }

  private pass(p: Player, errRange: number, humanSwitch: boolean) {
    const mates = this.players.filter((q) => q.team === p.team && q !== p);
    const dir = p.team === 0 ? this.inputDir() : { x: p.faceX, y: p.faceY, len: 1 };
    const useDir = dir.len > 0.2 ? dir : { x: p.faceX, y: p.faceY, len: 1 };

    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const m of mates) {
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const align = (dx / d) * useDir.x + (dy / d) * useDir.y;
      const forward = p.team === 0 ? m.x / W : (W - m.x) / W;
      const openness = Math.min(
        ...this.players.filter((o) => o.team !== p.team).map((o) => dist(o.x, o.y, m.x, m.y)),
      );
      let s = align * 1.6 + openness / 200 + d / 600;
      if (dir.len <= 0.2) s = forward * 2 + openness / 200;
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
    }
    if (!best) return;
    const d = dist(p.x, p.y, best.x, best.y);
    const power = clamp(400 + d * 0.62, 420, 700);
    const lead = (d / power) * 0.72;
    let tx = best.x + best.vx * lead + (Math.random() - 0.5) * errRange * 220;
    let ty = best.y + best.vy * lead + (Math.random() - 0.5) * errRange * 220;
    const dx = tx - this.ball.x;
    const dy = ty - this.ball.y;
    const dl = Math.hypot(dx, dy) || 1;
    this.ball.vx = (dx / dl) * power;
    this.ball.vy = (dy / dl) * power;
    this.ball.lastTouch = p.team;
    p.kickCd = 0.25;
    p.holdT = 0;
    this.sfx.pass();
    this.spawnKick(this.ball.x, this.ball.y, dx / dl, dy / dl, '#ffffff');
    if (humanSwitch && p.team === 0) {
      this.controlledIdx = best.idx;
      this.sfx.swap();
    }
    void tx;
    void ty;
  }

  private aiShoot(p: Player, cfg: DiffCfg) {
    this.shoot.call(this, p, cfg.shootErr);
  }

  private aiPass(p: Player, cfg: DiffCfg) {
    this.pass.call(this, p, cfg.passErr, false);
  }

  private clear(p: Player) {
    const oppX = this.oppGoalX(p.team);
    const side = Math.random() > 0.5 ? 0.22 : 0.78;
    const dx = oppX - p.x;
    const dy = H * side - p.y;
    const dl = Math.hypot(dx, dy) || 1;
    this.ball.vx = (dx / dl) * 680;
    this.ball.vy = (dy / dl) * 680;
    this.ball.lastTouch = p.team;
    p.kickCd = 0.35;
    p.holdT = 0;
    this.sfx.kick(0.8);
    this.spawnKick(this.ball.x, this.ball.y, dx / dl, dy / dl, TEAM_COLORS[p.team]);
  }

  // ---------- particelle ----------
  private spawnKick(x: number, y: number, dx: number, dy: number, color: string) {
    for (let i = 0; i < 10; i++) {
      const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.1;
      const s = 120 + Math.random() * 240;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.28 + Math.random() * 0.18,
        maxLife: 0.45,
        size: 2 + Math.random() * 2.5,
        color,
        drag: 4,
        grav: 0,
      });
    }
  }

  private spawnConfetti(x: number, y: number, dirX: number, n: number) {
    const colors = ['#38bdf8', '#fb7185', '#fbbf24', '#ffffff', '#4ade80', '#e879f9'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 420;
      this.particles.push({
        x: x + dirX * 6,
        y: y + (Math.random() - 0.5) * GOAL_HALF * 1.6,
        vx: Math.cos(a) * s * 0.6 + dirX * (60 + Math.random() * 180),
        vy: Math.sin(a) * s * 0.8 - 120,
        life: 1.1 + Math.random() * 1.1,
        maxLife: 2.2,
        size: 2.5 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        drag: 1.4,
        grav: 340,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // ---------- rendering ----------
  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = Math.max(1, rect.width);
    this.vh = Math.max(1, rect.height);
    this.canvas.width = Math.round(this.vw * this.dpr);
    this.canvas.height = Math.round(this.vh * this.dpr);
    this.buildBackground();
  }

  private buildBackground() {
    const c = document.createElement('canvas');
    c.width = Math.round(this.vw * this.dpr);
    c.height = Math.round(this.vh * this.dpr);
    const g = c.getContext('2d');
    if (!g) return;
    const w = c.width;
    const h = c.height;
    const grad = g.createRadialGradient(w / 2, h * 0.36, h * 0.1, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, '#0b1220');
    grad.addColorStop(0.55, '#060b16');
    grad.addColorStop(1, '#02040a');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // pubblico bokeh
    const crowdColors = ['56,189,248', '251,113,133', '251,191,36', '148,163,184'];
    for (let i = 0; i < 260; i++) {
      const col = crowdColors[Math.floor(Math.random() * crowdColors.length)];
      const alpha = 0.03 + Math.random() * 0.09;
      const r = (2 + Math.random() * 7) * this.dpr;
      g.fillStyle = `rgba(${col},${alpha})`;
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
      g.fill();
    }
    // fari agli angoli
    for (const [fx, fy] of [
      [0.08, 0.05],
      [0.92, 0.05],
      [0.08, 0.95],
      [0.92, 0.95],
    ]) {
      const beam = g.createRadialGradient(w * fx, h * fy, 0, w * fx, h * fy, h * 0.75);
      beam.addColorStop(0, 'rgba(180,210,255,0.10)');
      beam.addColorStop(1, 'rgba(180,210,255,0)');
      g.fillStyle = beam;
      g.fillRect(0, 0, w, h);
    }
    this.bgCanvas = c;
  }

  private render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const vw = this.vw;
    const vh = this.vh;

    if (this.bgCanvas) ctx.drawImage(this.bgCanvas, 0, 0, vw, vh);

    const margin = 34;
    const s = Math.min((vw - margin * 2) / W, (vh - margin * 2) / H);
    const ox = (vw - W * s) / 2;
    const oy = (vh - H * s) / 2 + 8;

    const shakeX = (Math.random() - 0.5) * this.shake;
    const shakeY = (Math.random() - 0.5) * this.shake;

    ctx.save();
    ctx.translate(ox + shakeX, oy + shakeY);
    ctx.scale(s, s);

    this.drawPitch(ctx);
    this.drawGoals(ctx);

    // ombre
    for (const p of this.players) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(p.x + 3, p.y + 7, P_R * 0.95, P_R * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(this.ball.x + 2, this.ball.y + 6, B_R, B_R * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // scia palla
    if (this.trail.length > 1) {
      for (let i = 0; i < this.trail.length; i++) {
        const t = i / this.trail.length;
        ctx.fillStyle = `rgba(226,240,255,${t * 0.16})`;
        ctx.beginPath();
        ctx.arc(this.trail[i].x, this.trail[i].y, B_R * (0.35 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const p of this.players) this.drawPlayer(ctx, p);
    this.drawBall(ctx);
    this.drawParticles(ctx);

    // flash gol
    if (this.goalFlash > 0) {
      const gx = this.goalSide === 1 ? W : 0;
      const fg = ctx.createRadialGradient(gx, H / 2, 0, gx, H / 2, 420);
      fg.addColorStop(0, `rgba(255,255,255,${this.goalFlash * 0.45})`);
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(-60, H / 2 - 430, W + 120, 860);
    }

    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.42, vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);
  }

  private drawPitch(ctx: CanvasRenderingContext2D) {
    ctx.save();
    // base + strisce erba
    ctx.fillStyle = '#0c4a30';
    ctx.fillRect(0, 0, W, H);
    const bands = 12;
    for (let i = 0; i < bands; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect((i * W) / bands, 0, W / bands, H);
      }
    }
    const sheen = ctx.createLinearGradient(0, 0, 0, H);
    sheen.addColorStop(0, 'rgba(190,235,255,0.05)');
    sheen.addColorStop(0.5, 'rgba(0,0,0,0)');
    sheen.addColorStop(1, 'rgba(0,20,10,0.16)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);

    // linee
    ctx.strokeStyle = 'rgba(240,252,255,0.85)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(160,230,255,0.55)';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.strokeRect(0, 0, W, H);
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.moveTo(W / 2 + 92, H / 2);
    ctx.arc(W / 2, H / 2, 92, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeRect(0, H / 2 - 160, 150, 320);
    ctx.strokeRect(W - 150, H / 2 - 160, 150, 320);
    ctx.strokeRect(0, H / 2 - 95, 62, 190);
    ctx.strokeRect(W - 62, H / 2 - 95, 62, 190);
    ctx.beginPath();
    ctx.arc(112, H / 2, 78, -Math.PI / 3.1, Math.PI / 3.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W - 112, H / 2, 78, Math.PI - Math.PI / 3.1, Math.PI + Math.PI / 3.1);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(240,252,255,0.9)';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 5, 0, Math.PI * 2);
    ctx.arc(112, H / 2, 4, 0, Math.PI * 2);
    ctx.arc(W - 112, H / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawGoals(ctx: CanvasRenderingContext2D) {
    for (const side of [-1, 1]) {
      const gx = side === -1 ? 0 : W;
      const x0 = side === -1 ? -GOAL_DEPTH : W;
      ctx.save();
      // rete
      ctx.strokeStyle = 'rgba(220,240,255,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= GOAL_DEPTH; i += 7) {
        const x = x0 + i;
        ctx.moveTo(x, H / 2 - GOAL_HALF);
        ctx.lineTo(x, H / 2 + GOAL_HALF);
      }
      for (let y = H / 2 - GOAL_HALF; y <= H / 2 + GOAL_HALF; y += 7) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + GOAL_DEPTH, y);
      }
      ctx.stroke();
      // telaio
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(gx, H / 2 - GOAL_HALF);
      ctx.lineTo(x0 + (side === -1 ? 0 : GOAL_DEPTH), H / 2 - GOAL_HALF);
      ctx.lineTo(x0 + (side === -1 ? 0 : GOAL_DEPTH), H / 2 + GOAL_HALF);
      ctx.lineTo(gx, H / 2 + GOAL_HALF);
      ctx.stroke();
      // pali
      ctx.fillStyle = '#ffffff';
      for (const py of [H / 2 - GOAL_HALF, H / 2 + GOAL_HALF]) {
        ctx.beginPath();
        ctx.arc(gx, py, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, p: Player) {
    const color = TEAM_COLORS[p.team];
    const isHuman = this.phase !== 'demo' && p.team === 0 && p.idx === this.controlledIdx;

    if (isHuman) {
      const pulse = 1 + Math.sin(this.time * 6) * 0.08;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (P_R + 7) * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      const ay = p.y - P_R - 22 + Math.sin(this.time * 5) * 3;
      ctx.beginPath();
      ctx.moveTo(p.x, ay + 10);
      ctx.lineTo(p.x - 8, ay);
      ctx.lineTo(p.x + 8, ay);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = TEAM_GLOW[p.team] + '0.8)';
    ctx.shadowBlur = isHuman ? 22 : 14;
    const grad = ctx.createRadialGradient(p.x - 5, p.y - 7, 2, p.x, p.y, P_R + 2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.28, color);
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, P_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(2,8,20,0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // indicatore direzione
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x + p.faceX * (P_R - 4), p.y + p.faceY * (P_R - 4));
    ctx.lineTo(p.x + p.faceX * (P_R + 1), p.y + p.faceY * (P_R + 1));
    ctx.stroke();

    // numero
    ctx.fillStyle = 'rgba(3,10,25,0.85)';
    ctx.font = '800 13px "Archivo Black", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.number), p.x, p.y + 0.5);
    ctx.restore();
  }

  private drawBall(ctx: CanvasRenderingContext2D) {
    const b = this.ball;
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(b.x, b.y, B_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(15,23,42,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(15,23,42,0.5)';
    const spin = this.time * 3;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + spin;
      ctx.beginPath();
      ctx.arc(b.x + Math.cos(a) * B_R * 0.5, b.y + Math.sin(a) * B_R * 0.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    if (this.particles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- snapshot ----------
  getSnapshot(): Snapshot {
    return {
      phase: this.phase,
      score: [...this.score],
      shots: [...this.shots],
      timeLeft: Math.max(0, this.timeLeft),
      countdown: Math.max(0, Math.ceil(this.countdown)),
      lastGoalTeam: this.lastGoalTeam,
      winner: this.winner,
      muted: this.sfx.muted,
      controlled: this.controlledIdx,
    };
  }
}
