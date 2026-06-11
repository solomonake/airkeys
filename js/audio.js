// ── AirKeys audio: a lightweight synthesized grand piano ────────────
// No samples, no downloads — every note is synthesized in real time
// with layered partials, a hammer transient, key-tracked decay and a
// generated-impulse hall reverb. Designed to stay under ~3% CPU.

import { TUNING } from './config.js';

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const midiToName = (m) => NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);

class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = [];   // active piano voices for stealing
    this.started = false;
  }

  // Must be called from a user gesture.
  init() {
    if (this.ctx) return this.resume();
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.22;

    // hall reverb from a generated stereo impulse (no file needed)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.9, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.16;

    this.master.connect(comp);
    this.master.connect(this.reverb);
    this.reverb.connect(this.wet);
    this.wet.connect(comp);
    comp.connect(ctx.destination);

    // shared hammer-noise buffer
    this.noiseBuf = this.makeNoise(0.05);
    this.started = true;
    return this.resume();
  }

  resume() { return this.ctx && this.ctx.state !== 'running' ? this.ctx.resume() : Promise.resolve(); }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ── the piano voice ───────────────────────────────────────────────
  // vel 0..1, dur in seconds (sustain hint), when = absolute ctx time
  piano(midi, vel = 0.8, when = 0, dur = 0.8) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = Math.max(when || ctx.currentTime, ctx.currentTime);
    vel = Math.min(1, Math.max(0.05, vel));
    const f = midiToFreq(midi);

    // voice management: steal oldest when over budget
    if (this.voices.length >= TUNING.maxVoices) {
      const v = this.voices.shift();
      try { v.kill(t); } catch (_) {}
    }

    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.0001;
    // brighter when struck harder, darker on low keys
    const bright = 1800 + vel * 5200 + Math.max(0, midi - 60) * 60;
    lp.frequency.setValueAtTime(Math.min(bright, 11000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(700, f * 1.8), t + 0.7);
    out.connect(lp);
    lp.connect(this.master);

    // key-tracked decay: low notes ring much longer
    const ring = Math.max(0.9, 6.4 - (midi - 36) * 0.062);
    const hold = Math.min(ring, Math.max(0.35, dur * 1.15));
    const peak = 0.16 * vel * (1 - Math.max(0, midi - 84) * 0.012);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.0035);
    env.gain.setTargetAtTime(peak * 0.32, t + 0.0035, 0.18);          // initial strike bloom
    env.gain.setTargetAtTime(0.0001, t + hold, 0.28);                 // release
    env.connect(out);

    const stopAt = t + hold + 1.8;
    const oscs = [];
    const addPartial = (mult, type, gain, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(env);
      o.start(t);
      o.stop(stopAt);
      oscs.push(o);
    };
    // slightly stretched upper partials = piano-like inharmonicity
    addPartial(1, 'triangle', 1.0);
    addPartial(2.001, 'sine', 0.36 * (0.4 + vel * 0.6));
    addPartial(3.006, 'sine', 0.14 * vel);
    if (midi < 60) addPartial(0.5, 'sine', 0.22);                      // sub warmth on bass keys

    // hammer transient
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = Math.min(9000, f * 5);
    nf.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.12 * vel, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    n.connect(nf); nf.connect(ng); ng.connect(this.master);
    n.start(t); n.stop(t + 0.05);

    const voice = {
      kill: (at) => {
        env.gain.cancelScheduledValues(at);
        env.gain.setTargetAtTime(0.0001, at, 0.05);
      },
    };
    this.voices.push(voice);
    const drop = () => {
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
    };
    oscs[0].onended = drop;
    return voice;
  }

  // soft accompaniment voice (the game's "left hand")
  pad(midi, vel = 0.5, when = 0, dur = 1.2) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = Math.max(when || ctx.currentTime, ctx.currentTime);
    const f = midiToFreq(midi);
    const env = ctx.createGain();
    const peak = 0.075 * vel;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.025);
    env.gain.setTargetAtTime(peak * 0.5, t + 0.03, 0.3);
    env.gain.setTargetAtTime(0.0001, t + Math.max(0.4, dur), 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(2400, f * 4);
    env.connect(lp); lp.connect(this.master);
    const stopAt = t + Math.max(0.4, dur) + 1.4;
    for (const [mult, type, g] of [[1, 'triangle', 1], [0.5, 'sine', 0.5], [2.0015, 'sine', 0.12]]) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f * mult;
      const gg = ctx.createGain(); gg.gain.value = g;
      o.connect(gg); gg.connect(env);
      o.start(t); o.stop(stopAt);
    }
  }

  // dull thud for a missed tile
  miss(when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = Math.max(when || ctx.currentTime, ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.18);
  }

  // muted pluck for a tap that hit no tile
  ghost(when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = Math.max(when || ctx.currentTime, ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.08);
  }

  // count-in tick (accented on the first)
  tick(when, accent = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = Math.max(when || ctx.currentTime, ctx.currentTime);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = accent ? 1320 : 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(accent ? 0.1 : 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.1);
  }

  uiClick() {
    if (!this.ctx) return;
    this.tick(this.now, false);
  }
}

export const audio = new Audio();
