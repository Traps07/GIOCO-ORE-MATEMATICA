// Sintetizzatore audio via WebAudio: nessun file esterno necessario.
export class SFX {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  ensure() {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.45, this.ctx.currentTime, 0.02);
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
    when = 0,
  ) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    }
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, filterFreq: number, when = 0, sweepTo?: number) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    }
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  kick(power = 1) {
    this.tone(150, 0.12, 'sine', 0.7 * power, 45);
    this.noise(0.06, 0.25 * power, 900);
  }

  pass() {
    this.tone(340, 0.09, 'sine', 0.4, 140);
    this.noise(0.04, 0.12, 1400);
  }

  swap() {
    this.tone(880, 0.06, 'triangle', 0.25);
  }

  uiClick() {
    this.tone(620, 0.07, 'triangle', 0.3);
    this.tone(930, 0.05, 'triangle', 0.18, undefined, 0.05);
  }

  count(final = false) {
    this.tone(final ? 1320 : 660, final ? 0.5 : 0.15, 'square', final ? 0.35 : 0.3);
  }

  whistle(long = false) {
    const dur = long ? 0.9 : 0.35;
    for (let i = 0; i < (long ? 2 : 1); i++) {
      const w = i * (dur + 0.15);
      this.tone(2350, dur, 'square', 0.16, undefined, w);
      this.tone(2450, dur, 'square', 0.12, undefined, w);
      this.noise(dur, 0.05, 2400, w);
    }
  }

  goal() {
    // arpeggio di festa + tifo
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((n, i) => this.tone(n, 0.35, 'triangle', 0.35, undefined, i * 0.09));
    this.noise(1.6, 0.3, 700, 0, 2200);
    this.noise(1.2, 0.18, 300, 0.15, 900);
    this.tone(180, 0.4, 'sine', 0.5, 60);
  }

  cheer() {
    this.noise(2.2, 0.32, 600, 0, 1800);
    this.tone(392, 0.5, 'triangle', 0.22, undefined, 0.1);
    this.tone(523, 0.6, 'triangle', 0.25, undefined, 0.25);
    this.tone(784, 0.8, 'triangle', 0.22, undefined, 0.45);
  }

  block() {
    this.noise(0.08, 0.14, 400);
    this.tone(110, 0.07, 'sine', 0.25, 60);
  }
}
