/**
 * Procedural sound with the Web Audio API: per-place ambience, event cues,
 * the fish's own movement and heartbeat, and a calm adaptive score built
 * from named music slots. It reads simulation state the app hands it and
 * never writes it.
 *
 * The AudioContext is created only from a user gesture (unlock). If Web
 * Audio is missing or fails, every method quietly does nothing. `attach`
 * runs the same engine on any context, such as an OfflineAudioContext for
 * the offline renderer (scripts/audio-render.mjs).
 *
 * The graph (about 70 nodes) is built once; a place only retunes it. One-shot
 * sounds come from `Synth`, which caps how many play at once.
 */
import type { SimEvent } from '../sim/types';
import type { World } from '../sim/world';
import { AUDIO, type AmbienceProfile, type Cue, type MusicSlot } from './config';
import { ambienceFor, brownNoise, chooseMusic, cueForEvent, cueForStrike, heartInterval, seamless, weakness, type Phase } from './mood';
import { emptyScene, readScene, type AudioScene } from './scene';
import { glide, Score } from './score';
import { Synth } from './synth';

/** Where recorded music comes from (the narration manifest). */
export interface RecordingSource {
  has(id: string): boolean;
  url(id: string): string;
}

interface Layer {
  filter: BiquadFilterNode;
  gain: GainNode;
}

interface Graph {
  ctx: BaseAudioContext;
  white: AudioBuffer;
  master: GainNode;
  phase: GainNode;
  world: BiquadFilterNode;
  ambBus: GainNode;
  ambDuck: GainNode;
  sfx: GainNode;
  alert: GainNode;
  music: GainNode;
  musicDuck: GainNode;
  send: GainNode;
  wash: Layer;
  texture: Layer & { lfo: OscillatorNode; depth: GainNode; drift: GainNode };
  drone: { osc: OscillatorNode; gain: GainNode };
  swell: Layer & { lfo: OscillatorNode; depth: GainNode };
  roar: Layer;
  rain: Layer;
  swim: Layer;
  synth: Synth;
  score: Score;
  persistent: number;
}

interface Recorded {
  el: HTMLAudioElement;
  gain: GainNode;
  stopTimer: number;
}

export interface AudioStats {
  /** Nodes built once. */
  persistent: number;
  /** One-shot voices and their nodes alive now, and the most at once since start. */
  voices: number;
  peakVoices: number;
  nodes: number;
  peakNodes: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class AudioEngine {
  private g: Graph | null = null;
  private failed = false;
  private volume: number = AUDIO.master.defaultVolume;
  private muted = false;
  private ducked = false;
  private readonly rnd: () => number;

  // What the app last asked for (kept even before unlock, applied after).
  private phase: Phase = 'title';
  private stage: string | null = null;
  private readonly scene: AudioScene = emptyScene();
  private hasScene = false;
  private readonly profile: AmbienceProfile = { ...AUDIO.ambience.egg };
  private readonly applied: AmbienceProfile = { ...AUDIO.ambience.egg };
  private ambOn = false;

  private danger = 0;
  private control = 0;
  private xfadeUntil = 0;
  private muffleHoldUntil = 0;
  private heartTimer = 0;
  private wasBurst = false;
  private wasLeaping = false;
  private swimLevel = 0;
  private swimFreq: number = AUDIO.swim.freq;
  private rain = 0;
  private rainApplied = -1;

  private baseSlot: MusicSlot | null = null;
  private scoreOff = false;
  private sprinklesOff = false;
  private dangerApplied = -1;
  private readonly recorded = new Map<MusicSlot, Recorded>();

  private readonly states = new Map<number, string>();
  private statesKey = '';
  private lastNearMiss = -Infinity;

  constructor(
    private readonly recordings: RecordingSource,
    random: () => number = Math.random,
  ) {
    this.rnd = random;
  }

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
        this.attach(new Ctor());
      }
      const ctx = this.g?.ctx as AudioContext | undefined;
      if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') void ctx.resume().catch(() => undefined);
    } catch {
      this.failed = true;
      this.g = null;
    }
  }

  /** Build the graph on a given context (the offline renderer and tests use this). */
  attach(ctx: BaseAudioContext): void {
    this.g = this.build(ctx);
    this.applyMaster();
    this.applyPhase(this.g);
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
      glide(g.ambDuck.gain, level, now, tc);
      glide(g.musicDuck.gain, level, now, tc);
    });
  }

  /**
   * Rain on the surface, 0..1. A hook for the weather: nothing calls it until
   * the weather stream lands, and then it is one line where the weather is
   * read each frame. It fades with the fish's depth.
   */
  setRain(level: number): void {
    this.rain = clamp01(level);
  }

  /**
   * For the offline renderer, to hear one part alone: the world bus level
   * (ambience) and the one-shot level (1 is normal), and whether the
   * generated score plays. The game never calls this.
   */
  setMix(mix: { world?: number; score?: boolean; sfx?: number }): void {
    if (mix.score !== undefined) {
      this.scoreOff = !mix.score;
      this.baseSlot = null;
    }
    if (mix.world !== undefined) this.sprinklesOff = mix.world <= 0;
    this.safe((g) => {
      const now = g.ctx.currentTime;
      if (mix.world !== undefined) glide(g.ambDuck.gain, mix.world, now, 0.01);
      if (mix.sfx !== undefined) glide(g.sfx.gain, mix.sfx * AUDIO.bus.sfx, now, 0.01);
    });
  }

  stats(): AudioStats {
    const g = this.g;
    if (!g) return { persistent: 0, voices: 0, peakVoices: 0, nodes: 0, peakNodes: 0 };
    const s = g.synth;
    return { persistent: g.persistent, voices: s.voices, peakVoices: s.peakVoices, nodes: s.nodes, peakNodes: s.peakNodes };
  }

  /** Per frame, from the app. `world` may be null on the title screen. */
  update(dt: number, world: World | null, phase: Phase): void {
    if (world) {
      readScene(world, this.scene);
      this.hasScene = true;
    } else this.hasScene = false;
    const playing = phase === 'playing' && !!world && world.status === 'playing';
    this.frame(dt, phase, playing);
  }

  /** Per frame, with a made-up scene (the offline renderer). `scene` null: no world (title). */
  drive(dt: number, scene: AudioScene | null, phase: Phase): void {
    if (scene) {
      Object.assign(this.scene, scene);
      this.hasScene = true;
    } else this.hasScene = false;
    this.frame(dt, phase, phase === 'playing' && !!scene);
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

  /** Play one cue now (tests, the offline renderer). */
  cue(cue: Cue, gain = 1): void {
    this.safe((g) => this.play(g, cue, gain));
  }

  /** Feel pass: a near miss or a mark on the fish (App calls this when the renderer's wound tracker counts one). */
  nearMiss(): void {
    const g = this.g;
    if (!g) return;
    const now = g.ctx.currentTime;
    if (now - this.lastNearMiss < AUDIO.cue.nearMiss.minGap) return;
    this.lastNearMiss = now;
    this.safe((gr) => this.play(gr, 'nearMiss', 1));
  }

  // ---------- Frame ----------

  private frame(dt: number, phase: Phase, playing: boolean): void {
    if (phase !== this.phase) {
      const was = this.phase;
      this.phase = phase;
      this.safe((g) => {
        this.applyPhase(g);
        if (phase === 'end' && was !== 'end') this.play(g, 'lifeEnd', 1);
      });
    }
    const sc = this.scene;
    const target = playing ? sc.danger : 0;
    const tc = target > this.danger ? AUDIO.danger.attack : AUDIO.danger.release;
    this.danger += (target - this.danger) * (1 - Math.exp(-dt / tc));

    const g = this.g;
    if (!g) return;
    try {
      if (playing) {
        this.watchStrikes(g);
        this.tickSprinkles(g, dt);
        this.tickHeart(g, dt);
        if (sc.leaping && !this.wasLeaping) this.play(g, 'leap', 1);
        this.wasLeaping = sc.leaping;
      } else {
        this.heartTimer = 0;
      }
      g.score.tick(dt);
      this.control -= dt;
      if (this.control <= 0) {
        this.control = AUDIO.controlInterval;
        if (this.hasScene && phase !== 'title') this.setPlace(g);
        else this.setAmbienceOn(g, false);
        this.controlUpdate(g, playing);
      }
    } catch {
      // Sound is optional; never let it break the game.
    }
  }

  // ---------- Graph ----------

  private build(ctx: BaseAudioContext): Graph {
    let n = 0;
    const gain = (v: number, to: AudioNode | AudioParam) => {
      const g = ctx.createGain();
      g.gain.value = v;
      if (to instanceof AudioParam) g.connect(to);
      else g.connect(to);
      n++;
      return g;
    };
    const filter = (type: BiquadFilterType, freq: number, to: AudioNode, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      f.connect(to);
      n++;
      return f;
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
    const seam = Math.floor(ctx.sampleRate * AUDIO.noiseSeam);
    const makeNoise = (brown: boolean) => {
      const len = Math.floor(ctx.sampleRate * AUDIO.noiseSeconds);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      if (brown) brownNoise(data, this.rnd);
      else for (let i = 0; i < len; i++) data[i] = this.rnd() * 2 - 1;
      seamless(data, seam);
      return buf;
    };
    const white = makeNoise(false);
    const brown = makeNoise(true);
    const loop = (buf: AudioBuffer, to: AudioNode, offset: number, rate: number) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.loopStart = 0;
      s.loopEnd = (buf.length - seam) / ctx.sampleRate;
      // Slightly different speeds, so the layers never line up into an audible repeat.
      s.playbackRate.value = rate;
      s.connect(to);
      s.start(0, offset);
      n++;
      return s;
    };

    const L = AUDIO.limiter;
    const limiter = ctx.createDynamicsCompressor();
    n++;
    limiter.threshold.value = L.threshold;
    limiter.knee.value = L.knee;
    limiter.ratio.value = L.ratio;
    limiter.attack.value = L.attack;
    limiter.release.value = L.release;
    limiter.connect(ctx.destination);
    const master = gain(0, limiter);
    const phase = gain(AUDIO.phase.menu, master);
    const world = filter('lowpass', AUDIO.ambience.egg.muffle, phase);
    const ambDuck = gain(1, world);
    const ambBus = gain(0, ambDuck);
    const sfx = gain(AUDIO.bus.sfx, world);
    const musicFilter = filter('lowpass', AUDIO.musicMuffle, phase);
    const musicDuck = gain(1, musicFilter);
    const music = gain(AUDIO.bus.music, musicDuck);
    const alert = gain(AUDIO.bus.alert, filter('lowpass', AUDIO.alertMuffle, phase));

    // The echo: score bells and far-off sounds ring into it; it returns under the music's duck.
    const sp = AUDIO.space;
    const send = ctx.createGain();
    const delay = ctx.createDelay(1);
    n += 2;
    delay.delayTime.value = sp.delay;
    const damp = filter('lowpass', sp.damp, gain(sp.level, musicDuck));
    const fb = gain(sp.feedback, delay);
    send.connect(delay);
    delay.connect(damp);
    damp.connect(fb);

    const E = AUDIO.ambience.egg;
    const washGain = gain(0, ambBus);
    const washFilter = filter('lowpass', E.washCutoff, washGain);
    loop(brown, washFilter, 0, 1);

    const texGain = gain(0, ambBus);
    const texFilter = filter('bandpass', E.textureFreq, texGain, E.textureQ);
    loop(white, texFilter, AUDIO.noiseSeconds / 2, 0.97);
    const texDepth = gain(0, texGain.gain);
    const texLfo = osc('sine', E.wobbleRate, texDepth);
    // A slower wobble of the wobble's rate (set per place), so babble drifts instead of pulsing.
    const drift = gain(0, texLfo.frequency);
    osc('sine', AUDIO.wobbleDrift.rate, drift);

    const droneGain = gain(0, ambBus);
    const drone = osc('sine', E.droneFreq, droneGain);

    const swellGain = gain(0, ambBus);
    const swellFilter = filter('lowpass', 300, swellGain);
    loop(brown, swellFilter, AUDIO.noiseSeconds / 3, 1.04);
    const swellDepth = gain(0, swellGain.gain);
    const swellLfo = osc('sine', 0.1, swellDepth);

    const roarGain = gain(0, ambBus);
    const roarFilter = filter('lowpass', 1200, roarGain, 0.5);
    loop(white, roarFilter, AUDIO.noiseSeconds / 5, 1.02);

    const rainGain = gain(0, ambBus);
    const rainFilter = filter('highpass', AUDIO.rain.cutoff, rainGain);
    loop(white, rainFilter, AUDIO.noiseSeconds / 7, 0.95);

    const swimGain = gain(0, sfx);
    const swimFilter = filter('bandpass', AUDIO.swim.freq, swimGain, AUDIO.swim.q);
    loop(white, swimFilter, AUDIO.noiseSeconds / 3, 1.01);

    const synth = new Synth({ ctx, white, send }, this.rnd);
    const score = new Score(ctx, music, synth);

    return {
      ctx,
      white,
      master,
      phase,
      world,
      ambBus,
      ambDuck,
      sfx,
      alert,
      music,
      musicDuck,
      send,
      wash: { filter: washFilter, gain: washGain },
      texture: { filter: texFilter, gain: texGain, lfo: texLfo, depth: texDepth, drift },
      drone: { osc: drone, gain: droneGain },
      swell: { filter: swellFilter, gain: swellGain, lfo: swellLfo, depth: swellDepth },
      roar: { filter: roarFilter, gain: roarGain },
      rain: { filter: rainFilter, gain: rainGain },
      swim: { filter: swimFilter, gain: swimGain },
      synth,
      score,
      persistent: n + score.nodeCount,
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
    this.safe((g) => glide(g.master.gain, this.muted ? 0 : this.volume * AUDIO.master.level, g.ctx.currentTime, 0.05));
  }

  private applyPhase(g: Graph): void {
    const lv = AUDIO.phase;
    const level = this.phase === 'playing' ? lv.playing : this.phase === 'paused' ? lv.paused : this.phase === 'end' ? lv.end : lv.menu;
    glide(g.phase.gain, level, g.ctx.currentTime, lv.fade / 3);
  }

  // ---------- Ambience ----------

  private setAmbienceOn(g: Graph, on: boolean): void {
    if (on === this.ambOn) return;
    this.ambOn = on;
    glide(g.ambBus.gain, on ? AUDIO.bus.world : 0, g.ctx.currentTime, AUDIO.crossfade.time / 4);
    if (!on) this.stage = null;
  }

  private setPlace(g: Graph): void {
    const place = this.scene.place;
    ambienceFor(place, this.profile);
    const now = g.ctx.currentTime;
    if (place.stage !== this.stage || !this.ambOn) {
      // A new stage: dip, morph to its sound at the bottom of the dip, come back up.
      const x = AUDIO.crossfade;
      const half = x.time / 2;
      const bus = g.ambBus.gain;
      bus.cancelScheduledValues(now);
      bus.setValueAtTime(bus.value, now);
      bus.linearRampToValueAtTime(this.ambOn ? x.dip * AUDIO.bus.world : 0, now + half);
      bus.linearRampToValueAtTime(AUDIO.bus.world, now + x.time);
      this.ambOn = true;
      this.stage = place.stage;
      this.applyProfile(g, now + half, half / 3, true);
      this.xfadeUntil = now + x.time;
    } else if (now >= this.xfadeUntil) {
      this.applyProfile(g, now, AUDIO.smoothing, false);
    }
  }

  private applyProfile(g: Graph, at: number, tc: number, force: boolean): void {
    const p = this.profile;
    const a = this.applied;
    const set = (param: AudioParam, v: number, prev: number) => {
      if (force || Math.abs(v - prev) > 1e-4 * Math.max(1, Math.abs(v))) param.setTargetAtTime(v, at, tc);
    };
    set(g.wash.gain.gain, p.washLevel, a.washLevel);
    set(g.wash.filter.frequency, p.washCutoff, a.washCutoff);
    // The wobble swings the texture between (1 - depth) and 1 of its level.
    set(g.texture.gain.gain, p.textureLevel * (1 - p.wobbleDepth / 2), a.textureLevel * (1 - a.wobbleDepth / 2));
    set(g.texture.depth.gain, (p.textureLevel * p.wobbleDepth) / 2, (a.textureLevel * a.wobbleDepth) / 2);
    set(g.texture.filter.frequency, p.textureFreq, a.textureFreq);
    set(g.texture.filter.Q, p.textureQ, a.textureQ);
    set(g.texture.lfo.frequency, p.wobbleRate, a.wobbleRate);
    set(g.texture.drift.gain, p.wobbleRate * AUDIO.wobbleDrift.depth, a.wobbleRate * AUDIO.wobbleDrift.depth);
    set(g.drone.gain.gain, p.droneLevel, a.droneLevel);
    set(g.drone.osc.frequency, p.droneFreq, a.droneFreq);
    // The swell rises and falls between (1 - depth) and 1 of its level.
    set(g.swell.gain.gain, p.swellLevel * (1 - p.swellDepth / 2), a.swellLevel * (1 - a.swellDepth / 2));
    set(g.swell.depth.gain, (p.swellLevel * p.swellDepth) / 2, (a.swellLevel * a.swellDepth) / 2);
    set(g.swell.filter.frequency, p.swellCutoff, a.swellCutoff);
    set(g.swell.lfo.frequency, p.swellRate, a.swellRate);
    set(g.roar.gain.gain, p.roarLevel, a.roarLevel);
    set(g.roar.filter.frequency, p.roarCutoff, a.roarCutoff);
    if (at >= this.muffleHoldUntil) set(g.world.frequency, p.muffle, a.muffle);
    Object.assign(a, p);
  }

  /** Rain's level at the fish: fades with depth. */
  private rainHeard(): number {
    if (this.rain <= 0 || !this.hasScene) return 0;
    const depth = this.scene.place.depth ?? 0;
    return this.rain * Math.max(0, 1 - depth / AUDIO.rain.depthFade);
  }

  /** Small one-shot sounds over the ambience, at the place's rates. */
  private tickSprinkles(g: Graph, dt: number): void {
    if (this.sprinklesOff) return;
    const p = this.applied;
    const s = g.synth;
    const r = this.rnd;
    const now = g.ctx.currentTime;
    const out = g.ambBus;
    const sp = AUDIO.sprinkle;
    const hit = (rate: number) => rate > 0 && r() < rate * dt && s.room();
    if (hit(p.bubbleRate)) {
      const b = AUDIO.bubble;
      s.bubble(out, s.between(b.minFreq, b.maxFreq), b.level, now);
    }
    if (hit(p.trickleRate)) {
      const t = sp.trickle;
      s.bubble(out, s.between(t.minFreq, t.maxFreq), t.level, now, t.length, t.rise);
    }
    if (hit(p.gravelRate)) {
      const gr = sp.gravel;
      const count = Math.round(s.between(gr.clicks[0], gr.clicks[1]));
      for (let i = 0; i < count; i++) s.click(out, s.between(gr.freqLow, gr.freqHigh), gr.level * (1 - 0.15 * i), gr.length, now + i * gr.gap * s.between(0.6, 1.4));
    }
    if (hit(p.plopRate)) {
      const pl = sp.plop;
      s.tone(out, 'sine', s.between(pl.minFreq, pl.maxFreq), pl.level, pl.length, now, pl.maxFreq * 1.6, 0.005, pl.send);
    }
    if (hit(p.splashRate)) {
      const sl = sp.splash;
      const len = s.between(sl.minLength, sl.maxLength);
      const lv = s.between(sl.minLevel, sl.maxLevel);
      s.noise(out, 'bandpass', sl.from, sl.to, lv, len, now, false, sl.send);
      if (r() < sl.doubleChance && s.room()) s.noise(out, 'bandpass', sl.from * 0.8, sl.to, lv * 0.7, len * 0.8, now + len * 0.6, false, sl.send);
    }
    if (hit(p.callRate)) this.farCall(g, now);
    const rain = this.rainHeard();
    if (hit(rain * AUDIO.rain.dropRate)) {
      const pl = sp.plop;
      s.tone(out, 'sine', s.between(pl.maxFreq, pl.maxFreq * 2.5), AUDIO.rain.dropLevel * rain, pl.length * 0.6, now, pl.maxFreq * 4, 0.003);
    }
  }

  /** A far-off orca call: a whistle that rises and falls, mostly heard through the echo. */
  private farCall(g: Graph, at: number): void {
    const s = g.synth;
    const c = AUDIO.sprinkle.call;
    s.whistle(g.ambBus, s.between(c.from[0], c.from[1]), c.peak, c.end, c.level, s.between(c.length[0], c.length[1]), at, c.vibrato, c.vibratoDepth, c.send);
  }

  // ---------- The fish ----------

  private tickHeart(g: Graph, dt: number): void {
    const interval = heartInterval(weakness(this.scene.energy, this.scene.fat));
    if (interval === null) {
      this.heartTimer = 0;
      return;
    }
    this.heartTimer -= dt;
    if (this.heartTimer > 0) return;
    this.heartTimer = interval;
    const h = AUDIO.heart;
    const s = g.synth;
    const now = g.ctx.currentTime;
    // Lub-dub: a low sine with a soft thump of noise under each beat.
    s.tone(g.sfx, 'sine', h.freq, h.level, h.length, now, h.freq * 0.8, 0.01);
    s.noise(g.sfx, 'lowpass', 180, 60, h.thump, h.length, now);
    s.tone(g.sfx, 'sine', h.freq * 0.94, h.level * 0.7, h.length, now + h.gap, h.freq * 0.75, 0.01);
  }

  private controlUpdate(g: Graph, playing: boolean): void {
    const now = g.ctx.currentTime;
    const s = AUDIO.swim;
    const sc = this.scene;
    // Swimming: a soft rush that follows speed, brighter and louder in a burst.
    let level = 0;
    let freq: number = s.freq;
    if (playing && sc.swims) {
      const k = clamp01(sc.speed / s.speedForFull) * (0.4 + 0.6 * sc.thrust);
      level = (sc.burst ? s.burstLevel : s.level) * k;
      freq = sc.burst ? s.burstFreq : s.freq;
      if (sc.burst && !this.wasBurst) g.synth.noise(g.sfx, 'bandpass', s.freq, s.burstFreq * 1.6, s.whooshLevel, s.whooshLength, now);
      this.wasBurst = sc.burst;
    } else {
      this.wasBurst = false;
    }
    if (Math.abs(level - this.swimLevel) > 1e-3) g.swim.gain.gain.setTargetAtTime(level, now, AUDIO.smoothing / 2);
    if (freq !== this.swimFreq) g.swim.filter.frequency.setTargetAtTime(freq, now, AUDIO.smoothing);
    this.swimLevel = level;
    this.swimFreq = freq;

    const rain = Math.round(this.rainHeard() * 50) / 50;
    if (rain !== this.rainApplied) {
      this.rainApplied = rain;
      glide(g.rain.gain.gain, rain * AUDIO.rain.level, now, AUDIO.rain.smoothing);
    }

    // The score.
    const choice = chooseMusic(this.phase, this.hasScene ? sc.place.stage : null, this.danger);
    this.setBaseSlot(g, choice.base);
    this.setDanger(g, choice.danger);
  }

  // ---------- Strikes ----------

  private watchStrikes(g: Graph): void {
    const sc = this.scene;
    if (this.statesKey !== sc.key) {
      this.states.clear();
      this.statesKey = sc.key;
    }
    const h = AUDIO.hearing;
    for (const e of sc.predators) {
      const prev = this.states.get(e.id);
      if (prev === e.state) continue;
      this.states.set(e.id, e.state);
      const cue = cueForStrike(e.kind, prev, e.state);
      if (cue) this.play(g, cue, Math.max(h.min, 1 - e.dist / h.range));
    }
  }

  // ---------- Score ----------

  private setBaseSlot(g: Graph, slot: MusicSlot | null): void {
    if (slot === this.baseSlot) return;
    const old = this.baseSlot;
    this.baseSlot = slot;
    if (old) this.fadeRecorded(g, old, 0);
    const recorded = !!slot && this.recordings.has(slot);
    g.score.setMood(slot && !this.scoreOff ? AUDIO.pad[slot] ?? null : null, recorded);
    if (slot && recorded) this.fadeRecorded(g, slot, 1);
  }

  private setDanger(g: Graph, level: number): void {
    const slot: MusicSlot = 'music.danger';
    const v = Math.round(level * 50) / 50;
    if (v === this.dangerApplied) return;
    this.dangerApplied = v;
    const recorded = this.recordings.has(slot);
    g.score.setDanger(v, recorded);
    if (recorded) this.fadeRecorded(g, slot, v);
  }

  /** Fade a recorded slot to a level (0 stops it after the fade). Live contexts only. */
  private fadeRecorded(g: Graph, slot: MusicSlot, level: number): void {
    const ctx = g.ctx as AudioContext;
    if (typeof ctx.createMediaElementSource !== 'function') return;
    let r = this.recorded.get(slot);
    if (!r && level <= 0) return;
    if (!r) {
      const el = new Audio(this.recordings.url(slot));
      el.loop = true;
      const src = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(g.music);
      r = { el, gain, stopTimer: 0 };
      this.recorded.set(slot, r);
    }
    const rec = r;
    window.clearTimeout(rec.stopTimer);
    glide(rec.gain.gain, level, ctx.currentTime, AUDIO.recordedFade / 3);
    if (level > 0) {
      if (rec.el.paused) void rec.el.play().catch(() => undefined);
    } else {
      rec.stopTimer = window.setTimeout(() => rec.el.pause(), AUDIO.recordedFade * 2000);
    }
  }

  // ---------- Cues ----------

  private play(g: Graph, cue: Cue, gain: number): void {
    const c = AUDIO.cue;
    const s = g.synth;
    const now = g.ctx.currentTime;
    const out = g.sfx;
    switch (cue) {
      case 'sting': {
        const k = c.sting;
        s.tone(g.alert, 'triangle', k.freq, k.level * gain, k.length, now);
        s.tone(g.alert, 'triangle', k.freq * k.interval, k.level * gain * 0.8, k.length, now + 0.06);
        break;
      }
      case 'warnChar': {
        const k = c.warnChar;
        s.tone(g.alert, 'sine', k.freq, k.level * gain, k.length, now, k.freq * 0.97, 0.01);
        s.tone(g.alert, 'sine', k.freq * k.ratio, k.level * gain, k.length, now + k.gap, k.freq * k.ratio * 0.97, 0.01);
        s.noise(g.alert, 'lowpass', 500, 180, k.swish * gain, k.length, now, true);
        break;
      }
      case 'warnBird': {
        const k = c.warnBird;
        for (let i = 0; i < k.beats; i++) s.noise(g.alert, 'bandpass', k.beatFreq, k.beatFreq * 0.6, k.beatLevel * gain, 0.06, now + i * k.beatGap, false, 0, 1.2);
        s.tone(g.alert, 'triangle', k.freq, k.level * gain, k.length, now + k.beats * k.beatGap, k.end);
        break;
      }
      case 'warnGull': {
        const k = c.warnGull;
        k.freqs.forEach((f, i) => s.tone(g.alert, 'triangle', f, k.level * gain, k.length, now + i * k.gap, f * 0.92, 0.008));
        break;
      }
      case 'warnMerganser': {
        const k = c.warnMerganser;
        for (let i = 0; i < k.ticks; i++) s.noise(g.alert, 'bandpass', k.freq * (i % 2 ? 0.85 : 1), k.freq * 0.5, k.level * gain, k.length, now + i * k.gap, false, 0, 1.5);
        break;
      }
      case 'warnSeal': {
        const k = c.warnSeal;
        s.noise(g.alert, 'lowpass', k.from, k.to, k.level * gain, k.length, now, true);
        s.tone(g.alert, 'sine', k.toneFrom, k.toneLevel * gain, k.length, now, k.toneTo, 0.1);
        break;
      }
      case 'warnOrca': {
        const k = c.warnOrca;
        for (let i = 0; i < k.repeats; i++) s.tone(g.alert, 'sine', k.freq, k.level * gain, k.length, now + i * k.gap, k.freq * 0.85);
        const w = AUDIO.sprinkle.call;
        s.whistle(g.alert, k.whistle, w.peak, w.end, k.whistleLevel * gain, 1.2, now + 0.2, w.vibrato, w.vibratoDepth, w.send);
        break;
      }
      case 'warnShark': {
        const k = c.warnShark;
        for (let i = 0; i < k.repeats; i++) {
          s.tone(g.alert, 'sine', k.freq, k.level * gain, k.length, now + i * k.gap, k.freq * 0.9);
          s.tone(g.alert, 'triangle', k.freq * k.overtone, k.overtoneLevel * gain, k.length * 0.7, now + i * k.gap, k.freq * k.overtone * 0.85);
        }
        break;
      }
      case 'warnBear': {
        const k = c.warnBear;
        for (let i = 0; i < 2; i++) {
          s.tone(g.alert, 'sine', k.freq, k.level * gain * (i ? 0.85 : 1), k.length, now + i * k.gap, k.end, 0.005);
          s.noise(g.alert, 'lowpass', k.thud, k.thud * 0.5, k.thudLevel * gain, k.length * 0.6, now + i * k.gap);
        }
        break;
      }
      case 'warnHook': {
        const k = c.warnHook;
        for (let i = 0; i < k.clicks; i++) s.click(g.alert, k.freq, k.clickLevel * gain, 0.01, now + i * k.gap);
        s.tone(g.alert, 'triangle', k.tone, k.toneLevel * gain, k.length, now, k.tone * 1.05);
        break;
      }
      case 'warnRival': {
        const k = c.warnRival;
        for (let i = 0; i < 2; i++) {
          s.tone(g.alert, 'sine', k.freq, k.level * gain, k.length, now + i * k.gap, k.end, 0.004);
          s.noise(g.alert, 'bandpass', k.knock, k.knock * 0.7, k.knockLevel * gain, 0.06, now + i * k.gap, false, 0, 2);
        }
        break;
      }
      case 'strikeBird': {
        const k = c.strikeBird;
        s.noise(out, 'bandpass', k.startFreq, k.endFreq, k.level * gain, k.length, now);
        break;
      }
      case 'strikeBear': {
        const k = c.strikeBear;
        s.noise(out, 'lowpass', k.startFreq, k.endFreq, k.level * gain, k.length, now);
        s.tone(out, 'sine', k.thump, k.thumpLevel * gain, k.length * 0.5, now, k.thump * 0.6, 0.005);
        break;
      }
      case 'strikeSeal': {
        const k = c.strikeSeal;
        s.noise(out, 'bandpass', k.startFreq, k.endFreq, k.level * gain, k.length, now, true);
        s.noise(out, 'bandpass', 2200, 500, k.splash * gain, 0.4, now + k.length * 0.8);
        break;
      }
      case 'chargeDeep': {
        const k = c.chargeDeep;
        for (let i = 0; i < k.repeats; i++) s.tone(out, 'sine', k.freq, k.level * gain, k.length, now + i * k.gap, k.freq * 0.85);
        break;
      }
      case 'surge': {
        const k = c.surge;
        s.noise(g.alert, 'lowpass', k.startFreq, k.endFreq, k.level * gain, k.length, now, true);
        break;
      }
      case 'eat': {
        const k = c.eat;
        const b = AUDIO.bubble;
        s.click(out, k.snapFreq, k.snapLevel * gain, k.snapLength, now);
        s.tone(out, 'sine', k.gulpFreq, k.gulpLevel * gain, k.gulpLength, now, k.gulpEnd, 0.008);
        for (let i = 0; i < k.bubbles; i++) s.bubble(out, s.between(b.minFreq, b.maxFreq), b.level * 1.6 * gain, now + 0.05 + s.rnd() * k.spread);
        break;
      }
      case 'nearMiss': {
        const k = c.nearMiss;
        s.noise(out, 'bandpass', k.startFreq, k.endFreq, k.level * gain, k.length, now);
        s.tone(out, 'sine', k.thumpFreq, k.thumpLevel * gain, k.thumpLength, now, k.thumpEnd);
        break;
      }
      case 'wriggle': {
        const k = c.wriggle;
        s.noise(out, 'lowpass', k.freq, k.freq / 2, k.level * gain, k.length, now);
        break;
      }
      case 'opening': {
        const k = c.opening;
        s.tone(g.alert, 'sine', k.freq, k.level * gain, k.length, now);
        s.tone(g.alert, 'sine', k.freq * k.ratio, k.level * gain * 0.6, k.length, now + 0.12);
        break;
      }
      case 'leap': {
        const k = c.leap;
        s.noise(out, 'bandpass', 500, 2400, k.level * gain, k.up, now, true);
        s.noise(out, 'lowpass', 2600, 300, k.splashLevel * gain, 0.6, now + k.splashDelay);
        break;
      }
      case 'spawned': {
        const k = c.spawned;
        k.ratios.forEach((r, i) => s.bell(g.music, k.freq * r, k.level * gain, now + i * k.gap, 4));
        break;
      }
      case 'stageComplete': {
        const k = c.stageComplete;
        s.bell(g.music, k.freq, k.level * gain, now, 2.4);
        s.bell(g.music, k.freq * k.ratio, k.level * gain, now + k.gap, 2.8);
        break;
      }
      case 'lifeEnd': {
        const k = c.lifeEnd;
        k.ratios.forEach((r, i) => s.bell(g.music, k.freq * r, k.level * gain * (1 - 0.1 * i), now + 0.4 + i * k.gap, 5));
        break;
      }
      case 'farCall':
        this.farCall(g, now);
        break;
      case 'death': {
        const k = c.death;
        // A soft fall on the music bus, so it is not muffled with the world.
        s.tone(g.music, 'sine', k.startFreq, k.level * gain, k.length, now, k.endFreq, k.attack, 0.6);
        s.tone(g.music, 'triangle', k.startFreq * k.fifth, k.fifthLevel * gain, k.length, now + 0.1, k.endFreq * k.fifth, k.attack, 0.6);
        // Everything in the world sinks under a heavy muffle for a moment.
        this.muffleHoldUntil = now + k.length;
        glide(g.world.frequency, k.muffle, now, 0.15);
        g.world.frequency.setTargetAtTime(this.applied.muffle, now + k.length, k.length / 3);
        break;
      }
    }
  }
}
