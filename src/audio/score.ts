/**
 * The generated score: a slow pad of chords with a soft bass under it, a
 * sparse bell melody that wanders a stage's scale and rings into the echo,
 * and a danger layer on top. Nothing repeats on a fixed loop: chords, rests,
 * phrases and notes are chosen as it plays. Recorded music slots replace
 * the pad, bass and melody (see engine.ts).
 */
import { AUDIO, type PadMood } from './config';
import { nextDegree } from './mood';
import type { Synth } from './synth';

/** Set a parameter smoothly from now, holding its current value first. */
export function glide(param: AudioParam, value: number, now: number, tc: number): void {
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(now);
  else param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, Math.max(0.001, tc));
}

export class Score {
  private readonly voices: { osc: OscillatorNode; gain: GainNode }[];
  private readonly padFilter: BiquadFilterNode;
  private readonly padGain: GainNode;
  private readonly sweep: GainNode;
  private readonly bass: { osc: OscillatorNode; gain: GainNode };
  private readonly dangerGain: GainNode;

  private mood: PadMood | null = null;
  private padTimer = 0;
  private chord = -1;
  private padLevel = 0;
  private melodyTimer = 0;
  private degree = 2;
  private danger = 0;
  /** While a recording plays the slot, the generated score is silent. */
  private silent = false;

  /** Persistent nodes built here (for the budget). */
  readonly nodeCount: number;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
    private readonly synth: Synth,
  ) {
    let n = 0;
    const gain = (v: number, to: AudioNode | AudioParam) => {
      const g = ctx.createGain();
      g.gain.value = v;
      if (to instanceof AudioParam) g.connect(to);
      else g.connect(to);
      n++;
      return g;
    };
    const osc = (type: OscillatorType, freq: number, to: AudioNode | AudioParam) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      if (to instanceof AudioParam) o.connect(to);
      else o.connect(to);
      o.start();
      n++;
      return o;
    };
    this.padGain = gain(0, out);
    this.padFilter = ctx.createBiquadFilter();
    n++;
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 700;
    this.padFilter.connect(this.padGain);
    // A slow sweep of the pad's filter, so long chords keep moving.
    this.sweep = gain(0, this.padFilter.frequency);
    osc('sine', AUDIO.padVoice.sweepRate, this.sweep);
    this.voices = Array.from({ length: AUDIO.padVoice.count }, (_, i) => {
      const vg = gain(0, this.padFilter);
      const o = osc('triangle', 110, vg);
      o.detune.value = (i % 2 ? 1 : -1) * AUDIO.padVoice.detune;
      return { osc: o, gain: vg };
    });
    const bg = gain(0, out);
    this.bass = { osc: osc('sine', 55, bg), gain: bg };

    const d = AUDIO.dangerLayer;
    this.dangerGain = gain(0, out);
    const trem = gain(0.5, this.dangerGain);
    const dFilter = ctx.createBiquadFilter();
    n++;
    dFilter.type = 'lowpass';
    dFilter.frequency.value = d.cutoff;
    dFilter.connect(trem);
    for (const f of [d.freq, d.freq * d.interval]) osc('sawtooth', f, dFilter);
    const depth = gain(0.5, trem.gain);
    osc('sine', d.tremoloRate, depth);
    this.nodeCount = n;
  }

  /** The calm slot's mood, or null for none. `recorded`: a recording plays it instead. */
  setMood(mood: PadMood | null, recorded: boolean): void {
    if (mood === this.mood && recorded === this.silent) return;
    this.mood = mood;
    this.silent = recorded;
    this.padTimer = 0; // next phrase now
    this.melodyTimer = mood ? mood.gap[0] / 2 : 0;
    if (!mood || recorded) this.setPadLevel(0, AUDIO.padVoice.release);
  }

  /** 0..1 danger: the danger layer's level, and the calm score thins under it. */
  setDanger(level: number, recordedDanger: boolean): void {
    this.danger = level;
    glide(this.dangerGain.gain, recordedDanger ? 0 : level * AUDIO.dangerLayer.level, this.ctx.currentTime, AUDIO.smoothing);
    if (this.mood && !this.silent && this.padLevel > 0) this.setPadLevel(this.mood.level * this.thin(), AUDIO.smoothing * 3);
  }

  private thin(): number {
    return 1 - AUDIO.danger.thinPad * this.danger;
  }

  tick(dt: number): void {
    const mood = this.mood;
    if (!mood || this.silent) return;
    this.tickPad(mood, dt);
    this.tickMelody(mood, dt);
  }

  private tickPad(mood: PadMood, dt: number): void {
    this.padTimer -= dt;
    if (this.padTimer > 0) return;
    const rnd = this.synth.rnd;
    this.padTimer = mood.hold * (0.8 + rnd() * 0.4);
    if (this.padLevel > 0 && rnd() < mood.restChance) {
      this.setPadLevel(0, AUDIO.padVoice.release);
      return;
    }
    let next = Math.floor(rnd() * mood.chords.length);
    if (next === this.chord && mood.chords.length > 1) next = (next + 1) % mood.chords.length;
    this.chord = next;
    const chord = mood.chords[next] ?? [0];
    const now = this.ctx.currentTime;
    const tc = AUDIO.padVoice.attack / 3;
    this.voices.forEach((v, i) => {
      const semis = chord[i];
      if (semis === undefined) {
        glide(v.gain.gain, 0, now, tc);
        return;
      }
      glide(v.osc.frequency, mood.root * 2 ** (semis / 12), now, tc);
      glide(v.gain.gain, 1 / chord.length, now, tc);
    });
    const low = Math.min(...chord);
    glide(this.bass.osc.frequency, (mood.root / 2) * 2 ** (low / 12), now, tc);
    glide(this.bass.gain.gain, mood.bass, now, tc);
    glide(this.padFilter.frequency, mood.cutoff, now, tc);
    glide(this.sweep.gain, mood.cutoff * AUDIO.padVoice.sweepDepth, now, tc);
    this.setPadLevel(mood.level * this.thin(), AUDIO.padVoice.attack);
  }

  private tickMelody(mood: PadMood, dt: number): void {
    this.melodyTimer -= dt;
    if (this.melodyTimer > 0) return;
    const s = this.synth;
    this.melodyTimer = s.between(mood.gap[0], mood.gap[1]);
    // Danger thins the music: no melody while a predator is close.
    if (this.danger > AUDIO.danger.thinMelody || mood.melody <= 0) return;
    const count = Math.round(s.between(mood.notes[0], mood.notes[1] + 0.999));
    let t = this.ctx.currentTime + 0.05;
    const size = mood.scale.length;
    this.degree = Math.max(0, Math.min(size - 1, this.degree));
    for (let i = 0; i < count; i++) {
      const semis = mood.scale[this.degree] ?? 0;
      const f = mood.root * mood.octave * 2 ** (semis / 12) / 2;
      // Later notes in a phrase are a little softer; the last rings longest.
      const lv = mood.melody * (1 - 0.12 * i);
      s.bell(this.out, f, lv, t, i === count - 1 ? AUDIO.bell.ring * 1.5 : AUDIO.bell.ring);
      t += mood.step * (s.rnd() < 0.25 ? 1.5 : 1);
      this.degree = nextDegree(this.degree, size, s.rnd());
    }
  }

  private setPadLevel(level: number, time: number): void {
    this.padLevel = level;
    const now = this.ctx.currentTime;
    glide(this.padGain.gain, level, now, time / 3);
    if (level === 0) glide(this.bass.gain.gain, 0, now, time / 3);
  }
}
