// Synthesized sound: rain, engine, sirens, gunfire. No audio files, everything is WebAudio.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.rainGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.started = false;
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  ensure() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.started = true;
      this.startRain();
      this.startEngine();
      this.startSiren();
    } catch (e) {
      // Headless or no audio device: the game plays silent.
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.suspend();
    if (!m && this.ctx) this.ctx.resume();
  }

  /** Looping filtered noise = rain on the windshield. */
  startRain() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    this.rainGain = gain;
  }

  /** Engine hum: pitch follows speed. */
  startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(ctx.destination);
    this.engineOsc.start();
  }

  /** Two-tone police siren, quiet until a chase starts. */
  startSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'sine';
    this.sirenOsc.frequency.value = 750;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    this.sirenLfo.connect(lfoGain).connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain).connect(ctx.destination);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  /** Per-frame: engine pitch by speed, siren loudness by wanted level. */
  update(speed, wantedLevel, driving) {
    if (!this.ctx || this.muted) return;
    if (!Number.isFinite(speed)) speed = 0;
    const t = this.ctx.currentTime;
    if (this.engineGain) {
      const target = driving ? 0.045 + Math.min(0.05, Math.abs(speed) / 7000) : 0.012;
      this.engineGain.gain.setTargetAtTime(target, t, 0.1);
      this.engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 0.45, t, 0.08);
    }
    if (this.sirenGain) {
      this.sirenGain.gain.setTargetAtTime(wantedLevel > 0 ? 0.02 + wantedLevel * 0.006 : 0, t, 0.3);
    }
  }

  blip() { this.tone(880, 0.09, 'sine', 0.12); }
  cash() { this.tone(1320, 0.12, 'sine', 0.14); this.tone(1760, 0.16, 'sine', 0.1); }

  missionComplete() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.16), i * 110));
  }

  missionFail() {
    const notes = [392, 330, 262];
    notes.forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.1), i * 160));
  }

  gunshot() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 0.12;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  thud() { this.tone(70, 0.18, 'sine', 0.4); }

  tone(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.12;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }
}
