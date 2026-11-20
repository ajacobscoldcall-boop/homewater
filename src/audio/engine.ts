/**
 * Procedural sound with the Web Audio API: per-stage ambience, event cues,
 * the fish's own movement and heartbeat, and a calm adaptive score built
 * from named music slots. It reads simulation state the app hands it and
 * never writes it.
 *
 * The AudioContext is created only from a user gesture (unlock). If Web
 * Audio is missing or fails, every method quietly does nothing.
 */
import { returnLayout, isRiffle } from '../sim/stages/return';
import { smoltSection } from '../sim/stages/smolt';
import type { SimEvent, StageId } from '../sim/types';
import type { World } from '../sim/world';
import { AUDIO, type AmbienceProfile, type MusicSlot, type PadMood } from './config';
import { ambienceFor, chooseMusic, cueForEvent, cueForStrike, dangerLevel, heartInterval, PREDATORS, weakness, type Cue, type Phase, type Place } from './mood';

/** Where recorded music comes from (the narration manifest). */
export interface RecordingSource {
  has(id: string): boolean;
  url(id: string): string;
}

interface Graph {
  ctx: AudioContext;
  noise: AudioBuffer;
  master: GainNode;
  phase: GainNode;
  world: BiquadFilterNode;
  ambBus: GainNode;
  ambDuck: GainNode;
  sfx: GainNode;
  music: GainNode;
  musicDuck: GainNode;
  wash: { filter: BiquadFilterNode; gain: GainNode };
  texture: { filter: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode; depth: GainNode };
  drone: { osc: OscillatorNode; gain: GainNode };
  swim: { filter: BiquadFilterNode; gain: GainNode };
  pad: { voices: { osc: OscillatorNode; gain: GainNode }[]; filter: BiquadFilterNode; gain: GainNode };
  danger: { gain: GainNode; lfo: OscillatorNode };
}

interface Recorded {
  el: HTMLAudioElement;
  gain: GainNode;
  stopTimer: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class AudioEngine {
  private g: Graph | null = null;
  private failed = false;
  private volume: number = AUDIO.master.defaultVolume;
  private muted = false;
  private ducked = false;

  // What the app last asked for (kept even before unlock, applied after).
  private phase: Phase = 'title';
  private place: Place | null = null;
  private placeKey = '';
  private readonly profile: AmbienceProfile = { ...AUDIO.ambience.egg };
  private readonly applied: AmbienceProfile = { ...AUDIO.ambience.egg };
  private ambOn = false;

  private danger = 0;
  private control = 0;
  private xfadeUntil = 0;
  private muffleHoldUntil = 0;
  private bubbleRate = 0;
  private heartTimer = 0;
  private wasBurst = false;
  private swimLevel = 0;
  private swimFreq: number = AUDIO.swim.freq;

  private baseSlot: MusicSlot | null = null;
  private padMood: PadMood | null = null;
  private padTimer = 0;
  private padChord = -1;
  private padLevel = 0;
  private dangerApplied = -1;
  private readonly recorded = new Map<MusicSlot, Recorded>();

  private readonly states = new Map<number, string>();
  private statesFor: World | null = null;
  private statesStage = '';

  constructor(private readonly recordings: RecordingSource) {}

  get available(): boolean {
    return !!this.g;
  }

  /** Create or resume the AudioContext. Call from a user gesture only. */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.g) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
          this.failed = true;
          return;
        }
        this.g = this.build(new Ctor());
        this.applyMaster();
      }
      const ctx = this.g.ctx;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    } catch {
      this.failed = true;
      this.g = null;
    }
  }

  setVolume(v: number): void {
    this.volume = clamp01(v);
    this.applyMaster();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyMaster();
  }

  /** Lower music and ambience while narration speaks. */
  setDucked(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    this.safe((g) => {
      const now = g.ctx.currentTime;
      const level = on ? AUDIO.duck.level : 1;
      const tc = (on ? AUDIO.duck.attack : AUDIO.duck.release) / 3;
      for (const p of [g.ambDuck.gain, g.musicDuck.gain]) {
        p.cancelScheduledValues(now);
        p.setTargetAtTime(level, now, tc);
      }
    });
  }

  /** Per frame, from the app. `world` may be null on the title screen. */
  update(dt: number, world: World | null, phase: Phase): void {
    if (phase !== this.phase) {
      this.phase = phase;
      this.safe((g) => this.applyPhase(g));
    }
    const playing = phase === 'playing' && !!world && world.status === 'playing';
    const target = playing && world ? dangerLevel(world.entities) : 0;
    const tc = target > this.danger ? AUDIO.danger.attack : AUDIO.danger.release;
    this.danger += (target - this.danger) * (1 - Math.exp(-dt / tc));

    const g = this.g;
    if (!g) return;
    try {
      if (playing && world) {
        this.watchStrikes(world);
        this.tickBubbles(g, dt);
        this.tickHeart(g, dt, world);
      } else {
        this.heartTimer = 0;
      }
      this.tickPad(g, dt);
      this.control -= dt;
      if (this.control <= 0) {
        this.control = AUDIO.controlInterval;
        if (world && phase !== 'title') this.setPlace(g, this.placeOf(world));
        else this.setAmbienceOn(g, false);
        this.controlUpdate(g, playing ? world : null);
      }
    } catch {
      // Sound is optional; never let it break the game.
    }
  }

  /** One-shot cues for a batch of simulation events. */
  onEvents(events: readonly SimEvent[]): void {
    const g = this.g;
    if (!g || !events.length) return;
    try {
      for (const ev of events) {
        const cue = cueForEvent(ev);
        if (cue) this.play(g, cue, 1);
      }
    } catch {
      // ignore
    }
  }

  private lastNearMiss = -Infinity;

  /** Feel pass: a near miss or a mark on the fish (App calls this when the renderer's wound tracker counts one). */
  nearMiss(): void {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    if (now - this.lastNearMiss < AUDIO.cue.nearMiss.minGap) return;
    this.lastNearMiss = now;
    try {
      this.play(g, 'nearMiss', 1);
    } catch {
      // ignore
    }
  }

  // ---------- Graph ----------

  private build(ctx: AudioContext): Graph {
    const gain = (v: number, to: AudioNode | AudioParam) => {
      const n = ctx.createGain();
      n.gain.value = v;
      if (to instanceof AudioParam) n.connect(to);
      else n.connect(to);
      return n;
    };
    const filter = (type: BiquadFilterType, freq: number, to: AudioNode, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      f.connect(to);
      return f;
    };
    const len = Math.floor(ctx.sampleRate * AUDIO.noiseSeconds);
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const loop = (to: AudioNode, offset: number) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.connect(to);
      s.start(0, offset);
      return s;
    };

    const master = gain(0, ctx.destination);
    const phase = gain(AUDIO.phase.menu, master);
    const world = filter('lowpass', AUDIO.ambience.egg.muffle, phase);
    const ambDuck = gain(1, world);
    const ambBus = gain(0, ambDuck);
    const sfx = gain(AUDIO.bus.sfx, world);
    const musicFilter = filter('lowpass', AUDIO.musicMuffle, phase);
    const musicDuck = gain(1, musicFilter);
    const music = gain(AUDIO.bus.music, musicDuck);

    const washGain = gain(0, ambBus);
    const washFilter = filter('lowpass', AUDIO.ambience.egg.washCutoff, washGain);
    loop(washFilter, 0);

    const texGain = gain(0, ambBus);
    const texFilter = filter('bandpass', AUDIO.ambience.egg.textureFreq, texGain, AUDIO.ambience.egg.textureQ);
    loop(texFilter, AUDIO.noiseSeconds / 2);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = AUDIO.ambience.egg.wobbleRate;
    const depth = gain(0, texGain.gain);
    lfo.connect(depth);
    lfo.start();

    const droneGain = gain(0, ambBus);
    const drone = ctx.createOscillator();
    drone.frequency.value = AUDIO.ambience.egg.droneFreq;
    drone.connect(droneGain);
    drone.start();

    const swimGain = gain(0, sfx);
    const swimFilter = filter('bandpass', AUDIO.swim.freq, swimGain, AUDIO.swim.q);
    loop(swimFilter, AUDIO.noiseSeconds / 3);

    const padGain = gain(0, music);
    const padFilter = filter('lowpass', AUDIO.pad['music.title']?.cutoff ?? AUDIO.musicMuffle, padGain);
    const voices = Array.from({ length: AUDIO.padVoice.count }, (_, i) => {
      const vg = gain(0, padFilter);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.detune.value = (i % 2 ? 1 : -1) * AUDIO.padVoice.detune;
      osc.connect(vg);
      osc.start();
      return { osc, gain: vg };
    });

    const d = AUDIO.dangerLayer;
    const dGain = gain(0, music);
    const trem = gain(0.5, dGain);
    const dFilter = filter('lowpass', d.cutoff, trem);
    for (const f of [d.freq, d.freq * d.interval]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(dFilter);
      o.start();
    }
    const dLfo = ctx.createOscillator();
    dLfo.frequency.value = d.tremoloRate;
    const dDepth = gain(0.5, trem.gain);
    dLfo.connect(dDepth);
    dLfo.start();

    return {
      ctx,
      noise,
      master,
      phase,
      world,
      ambBus,
      ambDuck,
      sfx,
      music,
      musicDuck,
      wash: { filter: washFilter, gain: washGain },
      texture: { filter: texFilter, gain: texGain, lfo, depth },
      drone: { osc: drone, gain: droneGain },
      swim: { filter: swimFilter, gain: swimGain },
      pad: { voices, filter: padFilter, gain: padGain },
      danger: { gain: dGain, lfo: dLfo },
    };
  }

  private safe(fn: (g: Graph) => void): void {
    const g = this.g;
    if (!g) return;
    try {
      fn(g);
    } catch {
      // ignore
    }
  }

  private applyMaster(): void {
    this.safe((g) => {
      const now = g.ctx.currentTime;
      g.master.gain.cancelScheduledValues(now);
      g.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * AUDIO.master.level, now, 0.05);
    });
  }

  private applyPhase(g: Graph): void {
    const lv = AUDIO.phase;
    const level = this.phase === 'playing' ? lv.playing : this.phase === 'paused' ? lv.paused : this.phase === 'end' ? lv.end : lv.menu;
    const now = g.ctx.currentTime;
    g.phase.gain.cancelScheduledValues(now);
    g.phase.gain.setTargetAtTime(level, now, lv.fade / 3);
  }

  // ---------- Ambience ----------

  private placeOf(w: World): Place {
    const stage: StageId = w.stageId;
    if (stage === 'return') {
      const lay = returnLayout(w);
      const x = w.body.pos.x;
      const inRiver = !!lay && x > lay.coast;
      return { stage, inRiver, riffle: inRiver && isRiffle(x) };
    }
    if (stage === 'smolt') return { stage, mouth: smoltSection(w) === 'mouth' };
    return { stage };
  }

  private setAmbienceOn(g: Graph, on: boolean): void {
    if (on === this.ambOn) return;
    this.ambOn = on;
    const now = g.ctx.currentTime;
    g.ambBus.gain.cancelScheduledValues(now);
    g.ambBus.gain.setTargetAtTime(on ? AUDIO.bus.world : 0, now, AUDIO.crossfade.time / 4);
    if (!on) this.placeKey = '';
  }

  private setPlace(g: Graph, place: Place): void {
    const key = `${place.stage}:${place.inRiver ? 1 : 0}:${place.riffle ? 1 : 0}:${place.mouth ? 1 : 0}`;
    if (key === this.placeKey && this.ambOn) return;
    const stageChanged = !this.place || this.place.stage !== place.stage || !this.ambOn;
    this.placeKey = key;
    this.place = place;
    ambienceFor(place, this.profile);
    const now = g.ctx.currentTime;
    if (stageChanged) {
      // Dip, morph to the new stage's sound at the bottom of the dip, come back up.
      const x = AUDIO.crossfade;
      const half = x.time / 2;
      const bus = g.ambBus.gain;
      bus.cancelScheduledValues(now);
      bus.setValueAtTime(bus.value, now);
      bus.linearRampToValueAtTime(this.ambOn ? x.dip * AUDIO.bus.world : 0, now + half);
      bus.linearRampToValueAtTime(AUDIO.bus.world, now + x.time);
      this.ambOn = true;
      this.applyProfile(g, now + half, half / 3, true);
      this.xfadeUntil = now + x.time;
    } else {
      this.applyProfile(g, now, AUDIO.smoothing, false);
    }
    this.bubbleRate = this.profile.bubbleRate;
  }

  private applyProfile(g: Graph, at: number, tc: number, force: boolean): void {
    const p = this.profile;
    const a = this.applied;
    const set = (param: AudioParam, v: number, prev: number) => {
      if (force || Math.abs(v - prev) > 1e-4) param.setTargetAtTime(v, at, tc);
    };
    set(g.wash.gain.gain, p.washLevel, a.washLevel);
    set(g.wash.filter.frequency, p.washCutoff, a.washCutoff);
    // The wobble swings the texture between (1 - depth) and 1 of its level.
    set(g.texture.gain.gain, p.textureLevel * (1 - p.wobbleDepth / 2), a.textureLevel * (1 - a.wobbleDepth / 2));
    set(g.texture.depth.gain, (p.textureLevel * p.wobbleDepth) / 2, (a.textureLevel * a.wobbleDepth) / 2);
    set(g.texture.filter.frequency, p.textureFreq, a.textureFreq);
    set(g.texture.filter.Q, p.textureQ, a.textureQ);
    set(g.texture.lfo.frequency, p.wobbleRate, a.wobbleRate);
    set(g.drone.gain.gain, p.droneLevel, a.droneLevel);
    set(g.drone.osc.frequency, p.droneFreq, a.droneFreq);
    if (at >= this.muffleHoldUntil) set(g.world.frequency, p.muffle, a.muffle);
    Object.assign(a, p);
  }

  private tickBubbles(g: Graph, dt: number): void {
    if (this.bubbleRate <= 0 || Math.random() >= this.bubbleRate * dt) return;
    const b = AUDIO.bubble;
    this.bubble(g, b.minFreq + Math.random() * (b.maxFreq - b.minFreq), b.level, 0);
  }

  // ---------- The fish ----------

  private tickHeart(g: Graph, dt: number, w: World): void {
    const fat = w.stageId === 'return' ? w.progress.fat : 1;
    const interval = heartInterval(weakness(w.body.energy, fat));
    if (interval === null) {
      this.heartTimer = 0;
      return;
    }
    this.heartTimer -= dt;
    if (this.heartTimer > 0) return;
    this.heartTimer = interval;
    const h = AUDIO.heart;
    const now = g.ctx.currentTime;
    this.tone(g, g.sfx, 'sine', h.freq, h.level, h.length, now, h.freq * 0.8);
    this.tone(g, g.sfx, 'sine', h.freq, h.level * 0.7, h.length, now + h.gap, h.freq * 0.8);
  }

  private controlUpdate(g: Graph, w: World | null): void {
    const now = g.ctx.currentTime;
    const s = AUDIO.swim;
    // Swimming: a soft rush that follows speed, brighter and louder in a burst.
    let level = 0;
    let freq: number = s.freq;
    if (w && w.stageId !== 'egg') {
      const v = w.body.vel;
      const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      const k = clamp01(speed / s.speedForFull) * (0.4 + 0.6 * w.body.thrust);
      level = (w.body.burst ? s.burstLevel : s.level) * k;
      freq = w.body.burst ? s.burstFreq : s.freq;
      if (w.body.burst && !this.wasBurst) this.noiseBurst(g, g.sfx, 'bandpass', s.freq, s.burstFreq * 1.6, s.whooshLevel, s.whooshLength, now);
      this.wasBurst = w.body.burst;
    } else {
      this.wasBurst = false;
    }
    if (Math.abs(level - this.swimLevel) > 1e-3) g.swim.gain.gain.setTargetAtTime(level, now, AUDIO.smoothing / 2);
    if (freq !== this.swimFreq) g.swim.filter.frequency.setTargetAtTime(freq, now, AUDIO.smoothing);
    this.swimLevel = level;
    this.swimFreq = freq;

    if (this.ambOn && now >= this.xfadeUntil) this.applyProfile(g, now, AUDIO.smoothing, false);

    // The score.
    const choice = chooseMusic(this.phase, this.place?.stage ?? null, this.danger);
    this.setBaseSlot(g, choice.base);
    this.setDanger(g, choice.danger);
  }

  // ---------- Strikes ----------

  private watchStrikes(w: World): void {
    if (this.statesFor !== w || this.statesStage !== `${w.stageIndex}:${w.fish.id}`) {
      this.states.clear();
      this.statesFor = w;
      this.statesStage = `${w.stageIndex}:${w.fish.id}`;
    }
    const g = this.g;
    if (!g) return;
    const fish = w.body.pos;
    for (const e of w.entities) {
      if (!e.alive || !PREDATORS.has(e.kind)) continue;
      const prev = this.states.get(e.id);
      if (prev === e.state) continue;
      this.states.set(e.id, e.state);
      const cue = cueForStrike(e.kind, prev, e.state);
      if (!cue) continue;
      const dx = e.pos.x - fish.x;
      const dz = e.pos.z - fish.z;
      const h = AUDIO.hearing;
      this.play(g, cue, Math.max(h.min, 1 - Math.sqrt(dx * dx + dz * dz) / h.range));
    }
  }

  // ---------- Score ----------

  private setBaseSlot(g: Graph, slot: MusicSlot | null): void {
    if (slot === this.baseSlot) return;
    const old = this.baseSlot;
    this.baseSlot = slot;
    if (old) this.fadeRecorded(g, old, 0);
    if (slot && this.recordings.has(slot)) {
      this.padMood = null;
      this.padTimer = 0;
      this.setPadLevel(g, 0, AUDIO.padVoice.release);
      this.fadeRecorded(g, slot, 1);
    } else {
      this.padMood = slot ? AUDIO.pad[slot] ?? null : null;
      this.padTimer = 0; // next phrase now
      if (!this.padMood) this.setPadLevel(g, 0, AUDIO.padVoice.release);
    }
  }

  private setDanger(g: Graph, level: number): void {
    const slot: MusicSlot = 'music.danger';
    const v = Math.round(level * 50) / 50;
    if (v === this.dangerApplied) return;
    this.dangerApplied = v;
    const now = g.ctx.currentTime;
    if (this.recordings.has(slot)) {
      g.danger.gain.gain.setTargetAtTime(0, now, AUDIO.smoothing);
      this.fadeRecorded(g, slot, v);
    } else {
      g.danger.gain.gain.setTargetAtTime(v * AUDIO.dangerLayer.level, now, AUDIO.smoothing);
    }
  }

  private tickPad(g: Graph, dt: number): void {
    const mood = this.padMood;
    if (!mood) return;
    this.padTimer -= dt;
    if (this.padTimer > 0) return;
    this.padTimer = mood.hold * (0.8 + Math.random() * 0.4);
    if (this.padLevel > 0 && Math.random() < mood.restChance) {
      this.setPadLevel(g, 0, AUDIO.padVoice.release);
      return;
    }
    let next = Math.floor(Math.random() * mood.chords.length);
    if (next === this.padChord && mood.chords.length > 1) next = (next + 1) % mood.chords.length;
    this.padChord = next;
    const chord = mood.chords[next] ?? [0];
    const now = g.ctx.currentTime;
    const glide = AUDIO.padVoice.attack / 3;
    g.pad.voices.forEach((v, i) => {
      const semis = chord[i];
      if (semis === undefined) {
        v.gain.gain.setTargetAtTime(0, now, glide);
        return;
      }
      v.osc.frequency.setTargetAtTime(mood.root * 2 ** (semis / 12), now, glide);
      v.gain.gain.setTargetAtTime(1 / chord.length, now, glide);
    });
    g.pad.filter.frequency.setTargetAtTime(mood.cutoff, now, glide);
    this.setPadLevel(g, mood.level, AUDIO.padVoice.attack);
  }

  private setPadLevel(g: Graph, level: number, time: number): void {
    this.padLevel = level;
    const now = g.ctx.currentTime;
    g.pad.gain.gain.cancelScheduledValues(now);
    g.pad.gain.gain.setTargetAtTime(level, now, time / 3);
  }

  /** Fade a recorded slot to a level (0 stops it after the fade). */
  private fadeRecorded(g: Graph, slot: MusicSlot, level: number): void {
    let r = this.recorded.get(slot);
    if (!r && level <= 0) return;
    if (!r) {
      const el = new Audio(this.recordings.url(slot));
      el.loop = true;
      const src = g.ctx.createMediaElementSource(el);
      const gain = g.ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(g.music);
      r = { el, gain, stopTimer: 0 };
      this.recorded.set(slot, r);
    }
    const rec = r;
    window.clearTimeout(rec.stopTimer);
    const now = g.ctx.currentTime;
    rec.gain.gain.cancelScheduledValues(now);
    rec.gain.gain.setTargetAtTime(level, now, AUDIO.recordedFade / 3);
    if (level > 0) {
      if (rec.el.paused) void rec.el.play().catch(() => undefined);
    } else {
      rec.stopTimer = window.setTimeout(() => rec.el.pause(), AUDIO.recordedFade * 2000);
    }
  }

  // ---------- Cues ----------

  private play(g: Graph, cue: Cue, gain: number): void {
    const c = AUDIO.cue;
    const now = g.ctx.currentTime;
    const out = g.sfx;
    switch (cue) {
      case 'sting': {
        const s = c.sting;
        this.tone(g, out, 'triangle', s.freq, s.level * gain, s.length, now);
        this.tone(g, out, 'triangle', s.freq * s.interval, s.level * gain * 0.8, s.length, now + 0.06);
        break;
      }
      case 'pulse': {
        const p = c.pulse;
        for (let i = 0; i < p.repeats; i++) this.tone(g, out, 'sine', p.freq, p.level * gain, p.length, now + i * p.gap, p.freq * 0.85);
        break;
      }
      case 'splash': {
        const s = c.splash;
        this.noiseBurst(g, out, 'bandpass', s.startFreq, s.endFreq, s.level * gain, s.length, now);
        break;
      }
      case 'surge': {
        const s = c.surge;
        this.noiseBurst(g, out, 'lowpass', s.startFreq, s.endFreq, s.level * gain, s.length, now, true);
        break;
      }
      case 'eat': {
        const b = AUDIO.bubble;
        for (let i = 0; i < c.eat.bubbles; i++) this.bubble(g, b.minFreq + Math.random() * (b.maxFreq - b.minFreq), b.level * 2 * gain, Math.random() * c.eat.spread);
        // A small gulp, so a bite is felt as well as heard.
        this.tone(g, out, 'sine', c.eat.gulpFreq, c.eat.gulpLevel * gain, c.eat.gulpLength, now, c.eat.gulpEnd);
        break;
      }
      case 'nearMiss': {
        const s = c.nearMiss;
        this.noiseBurst(g, out, 'bandpass', s.startFreq, s.endFreq, s.level * gain, s.length, now);
        this.tone(g, out, 'sine', s.thumpFreq, s.thumpLevel * gain, s.thumpLength, now, s.thumpEnd);
        break;
      }
      case 'wriggle': {
        const s = c.wriggle;
        this.noiseBurst(g, out, 'lowpass', s.freq, s.freq / 2, s.level * gain, s.length, now);
        break;
      }
      case 'opening': {
        const s = c.opening;
        this.tone(g, out, 'sine', s.freq, s.level * gain, s.length, now);
        this.tone(g, out, 'sine', s.freq * s.ratio, s.level * gain * 0.6, s.length, now + 0.12);
        break;
      }
      case 'spawned': {
        const s = c.spawned;
        s.ratios.forEach((r, i) => this.tone(g, g.music, 'sine', s.freq * r, s.level * gain, s.length, now + i * 0.35));
        break;
      }
      case 'stageComplete': {
        const s = c.stageComplete;
        this.tone(g, g.music, 'sine', s.freq, s.level * gain, s.length, now);
        this.tone(g, g.music, 'sine', s.freq * s.ratio, s.level * gain, s.length, now + 0.3);
        break;
      }
      case 'death': {
        const s = c.death;
        this.tone(g, out, 'sine', s.startFreq, s.level * gain, s.length, now, s.endFreq);
        // Everything sinks under a heavy muffle for a moment.
        this.muffleHoldUntil = now + s.length;
        g.world.frequency.cancelScheduledValues(now);
        g.world.frequency.setTargetAtTime(s.muffle, now, 0.15);
        g.world.frequency.setTargetAtTime(this.applied.muffle, now + s.length, s.length / 3);
        break;
      }
    }
  }

  /** A short enveloped oscillator, optionally gliding to `endFreq`. */
  private tone(g: Graph, out: AudioNode, type: OscillatorType, freq: number, level: number, length: number, at: number, endFreq?: number): void {
    const ctx = g.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + Math.min(0.05, length / 4));
    env.gain.setTargetAtTime(0, at + length / 4, length / 4);
    osc.connect(env);
    env.connect(out);
    osc.start(at);
    osc.stop(at + length * 1.5);
    osc.onended = () => env.disconnect();
  }

  /** Filtered noise with a sweeping filter: splashes, whooshes, surges. */
  private noiseBurst(g: Graph, out: AudioNode, type: BiquadFilterType, from: number, to: number, level: number, length: number, at: number, swell = false): void {
    const ctx = g.ctx;
    const src = ctx.createBufferSource();
    src.buffer = g.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, at);
    f.frequency.exponentialRampToValueAtTime(to, at + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + (swell ? length / 2 : 0.015));
    env.gain.linearRampToValueAtTime(0, at + length);
    src.connect(f);
    f.connect(env);
    env.connect(out);
    src.start(at, Math.random() * AUDIO.noiseSeconds * 0.5);
    src.stop(at + length + 0.05);
    src.onended = () => env.disconnect();
  }

  /** One bubble: a sine whose pitch rises as it fades. */
  private bubble(g: Graph, freq: number, level: number, delay: number): void {
    const b = AUDIO.bubble;
    this.tone(g, g.sfx, 'sine', freq, level, b.length, g.ctx.currentTime + delay, freq * b.rise);
  }
}
