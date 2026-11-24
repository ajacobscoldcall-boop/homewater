/**
 * One-shot voices for the sound engine: enveloped tones, bells, filtered
 * noise bursts, clicks and far-off whistles. Every voice is a handful of
 * short-lived nodes that disconnect when they finish. A voice limiter keeps
 * the number alive at once under `AUDIO.voices.max`: background sprinkles
 * wait when it is full, event cues always play.
 */
import { AUDIO } from './config';

export interface SynthHost {
  ctx: BaseAudioContext;
  /** Looping noise: white for hiss and splashes. */
  white: AudioBuffer;
  /** The echo send for far-off sounds and the score. */
  send: AudioNode;
}

export class Synth {
  /** One-shot voices alive now, the most at once, and nodes alive now. */
  voices = 0;
  peakVoices = 0;
  nodes = 0;
  peakNodes = 0;

  constructor(
    private readonly h: SynthHost,
    readonly rnd: () => number,
  ) {}

  /** May a background sprinkle start now? */
  room(): boolean {
    return this.voices < AUDIO.voices.max;
  }

  private begin(nodes: number): void {
    this.voices++;
    this.nodes += nodes;
    this.peakVoices = Math.max(this.peakVoices, this.voices);
    this.peakNodes = Math.max(this.peakNodes, this.nodes);
  }

  private end(nodes: number, last: AudioNode): void {
    this.voices--;
    this.nodes -= nodes;
    try {
      last.disconnect();
    } catch {
      // already gone
    }
  }

  /** A short enveloped oscillator, optionally gliding to `endFreq`. `attack` defaults to quick. */
  tone(out: AudioNode, type: OscillatorType, freq: number, level: number, length: number, at: number, endFreq?: number, attack?: number, send = 0): void {
    const ctx = this.h.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + length);
    const env = ctx.createGain();
    const a = attack ?? Math.min(0.05, length / 4);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + a);
    env.gain.setTargetAtTime(0, at + Math.max(a, length / 4), length / 4);
    osc.connect(env);
    env.connect(out);
    let n = 2;
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      env.connect(s);
      s.connect(this.h.send);
      n++;
    }
    this.begin(n);
    osc.start(at);
    osc.stop(at + length * 1.6);
    osc.onended = () => this.end(n, env);
  }

  /** A bell: a sine with one inharmonic partial, a soft strike and a long ring. */
  bell(out: AudioNode, freq: number, level: number, at: number, ring: number = AUDIO.bell.ring, send: number = AUDIO.bell.send): void {
    const ctx = this.h.ctx;
    const b = AUDIO.bell;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.012);
    env.gain.setTargetAtTime(0, at + 0.02, ring / 4);
    const o1 = ctx.createOscillator();
    o1.frequency.value = freq;
    o1.connect(env);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(b.partialLevel, at);
    pg.gain.setTargetAtTime(0, at, ring / 10);
    const o2 = ctx.createOscillator();
    o2.frequency.value = freq * b.partial;
    o2.connect(pg);
    pg.connect(env);
    env.connect(out);
    const s = ctx.createGain();
    s.gain.value = send;
    env.connect(s);
    s.connect(this.h.send);
    const n = 5;
    this.begin(n);
    o1.start(at);
    o2.start(at);
    o1.stop(at + ring * 1.2);
    o2.stop(at + ring * 1.2);
    o1.onended = () => this.end(n, env);
  }

  /** Filtered noise with a sweeping filter: splashes, whooshes, surges, thuds. */
  noise(out: AudioNode, type: BiquadFilterType, from: number, to: number, level: number, length: number, at: number, swell = false, send = 0, q = 0.7): void {
    const ctx = this.h.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.h.white;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(from, at);
    f.frequency.exponentialRampToValueAtTime(to, at + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + (swell ? length / 2 : Math.min(0.015, length / 3)));
    env.gain.linearRampToValueAtTime(0, at + length);
    src.connect(f);
    f.connect(env);
    env.connect(out);
    let n = 3;
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      env.connect(s);
      s.connect(this.h.send);
      n++;
    }
    this.begin(n);
    src.start(at, this.rnd() * this.h.white.duration * 0.8);
    src.stop(at + length + 0.05);
    src.onended = () => this.end(n, env);
  }

  /** A tiny click: a very short band of noise (stones, ratchets, beaks). */
  click(out: AudioNode, freq: number, level: number, length: number, at: number): void {
    this.noise(out, 'bandpass', freq, freq * 0.8, level, length, at, false, 0, 2.5);
  }

  /** A far-off whistle that rises then falls, with vibrato (an orca call heard from far away). */
  whistle(out: AudioNode, from: number, peak: number, end: number, level: number, length: number, at: number, vibrato: number, depth: number, send: number): void {
    const ctx = this.h.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(from * peak, at + length * 0.35);
    osc.frequency.exponentialRampToValueAtTime(from * end, at + length);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = vibrato;
    const lg = ctx.createGain();
    lg.gain.value = depth;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + length * 0.25);
    env.gain.linearRampToValueAtTime(level * 0.7, at + length * 0.7);
    env.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(env);
    env.connect(out);
    const s = ctx.createGain();
    s.gain.value = send;
    env.connect(s);
    s.connect(this.h.send);
    const n = 5;
    this.begin(n);
    osc.start(at);
    lfo.start(at);
    osc.stop(at + length + 0.05);
    lfo.stop(at + length + 0.05);
    osc.onended = () => {
      try {
        lg.disconnect();
      } catch {
        // gone
      }
      this.end(n, env);
    };
  }

  /** One bubble: a sine whose pitch rises as it fades. */
  bubble(out: AudioNode, freq: number, level: number, at: number, length: number = AUDIO.bubble.length, rise: number = AUDIO.bubble.rise): void {
    this.tone(out, 'sine', freq, level, length, at, freq * rise);
  }

  /** Uniform in [a, b). */
  between(a: number, b: number): number {
    return a + this.rnd() * (b - a);
  }
}
