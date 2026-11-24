import { beforeAll, describe, expect, it } from 'vitest';
import { AUDIO, type Cue } from '../../src/audio/config';
import { AudioEngine } from '../../src/audio/engine';
import { emptyScene, readScene, type AudioScene } from '../../src/audio/scene';
import { STAGE_IDS, type StageId } from '../../src/sim/types';
import { newWorld } from './helpers';

/**
 * The sound graph on a fake AudioContext: counts nodes, runs one-shot
 * sources to their stop time, and records any value the real Web Audio API
 * would reject (the engine swallows errors, so the fake keeps them).
 */
const errors: string[] = [];
const check = (what: string, v: number) => {
  if (!Number.isFinite(v)) errors.push(`${what}: ${v}`);
};

class FakeParam {
  constructor(public value = 0) {}
  setValueAtTime(v: number) {
    check('setValueAtTime', v);
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number) {
    check('linearRamp', v);
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number) {
    check('expRamp', v);
    if (!(v > 0)) errors.push(`expRamp to ${v}`);
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    check('setTarget', v);
    check('setTarget time', t);
    if (!(tc > 0)) errors.push(`setTarget tc ${tc}`);
    this.value = v;
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
  cancelAndHoldAtTime() {
    return this;
  }
}

class FakeNode {
  onended: (() => void) | null = null;
  constructor(readonly ctx: FakeContext) {
    ctx.created++;
  }
  connect<T>(to: T): T {
    return to;
  }
  disconnect() {}
  start(at = 0) {
    check('start', at);
  }
  stop(at: number) {
    check('stop', at);
    this.ctx.pending.push({ node: this, at });
  }
}

class FakeContext {
  currentTime = 0;
  sampleRate = 8000;
  created = 0;
  pending: { node: FakeNode; at: number }[] = [];
  destination = {} as unknown;
  advance(dt: number) {
    this.currentTime += dt;
    const due = this.pending.filter((p) => p.at <= this.currentTime);
    this.pending = this.pending.filter((p) => p.at > this.currentTime);
    for (const p of due) p.node.onended?.();
  }
  private node<T extends object>(extra: T): FakeNode & T {
    return Object.assign(new FakeNode(this), extra);
  }
  createGain() {
    return this.node({ gain: new FakeParam(1) });
  }
  createBiquadFilter() {
    return this.node({ type: 'lowpass', frequency: new FakeParam(350), Q: new FakeParam(1) });
  }
  createOscillator() {
    return this.node({ type: 'sine', frequency: new FakeParam(440), detune: new FakeParam(0) });
  }
  createBufferSource() {
    return this.node({ buffer: null, loop: false, loopStart: 0, loopEnd: 0, playbackRate: new FakeParam(1) });
  }
  createDelay() {
    return this.node({ delayTime: new FakeParam(0) });
  }
  createDynamicsCompressor() {
    return this.node({ threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() });
  }
  createBuffer(_ch: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return { length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
  }
}

/** A seeded random for repeatable runs. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const NO_RECORDINGS = { has: () => false, url: () => '' };

/** A busy scene for each stage: every place feature at once. */
function busyScene(stage: StageId, t: number): AudioScene {
  const sc = emptyScene();
  sc.key = stage;
  sc.place = { stage, depth: 2, flood: 1, light: 0.5, estuary: 0.8, mouth: true, inRiver: true, rapids: true, falls: 1, crowd: 110 };
  sc.swims = stage !== 'egg';
  sc.speed = 3;
  sc.thrust = 1;
  sc.burst = Math.floor(t) % 3 === 0;
  sc.energy = 0.1;
  sc.fat = 0.1;
  sc.danger = 1;
  const states = ['warn', 'strike', 'lunge', 'charge', 'dive', 'idle'];
  sc.predators = (['birdShadow', 'bear', 'seal', 'orca', 'shark', 'merganser'] as const).map((kind, i) => ({ id: i, kind, state: states[(Math.floor(t * 2) + i) % states.length] as string, dist: 5 }));
  return sc;
}

describe('sound graph', () => {
  beforeAll(() => {
    (globalThis as unknown as { AudioParam: unknown }).AudioParam = FakeParam;
  });

  it('stays inside its node budget in every stage, even when everything happens at once', () => {
    const cues: Cue[] = ['warnChar', 'warnBird', 'warnGull', 'warnMerganser', 'warnSeal', 'warnOrca', 'warnShark', 'warnBear', 'warnHook', 'warnRival', 'eat', 'nearMiss', 'surge', 'leap'];
    for (const stage of STAGE_IDS) {
      errors.length = 0;
      const ctx = new FakeContext();
      const engine = new AudioEngine(NO_RECORDINGS, seeded(7));
      engine.attach(ctx as unknown as BaseAudioContext);
      const built = ctx.created;
      expect(engine.stats().persistent).toBe(built);
      expect(built).toBeLessThanOrEqual(AUDIO.budget.persistent);
      engine.setRain(1);
      const dt = 1 / 60;
      for (let i = 0; i < 60 * 40; i++) {
        const t = i * dt;
        engine.drive(dt, busyScene(stage, t), 'playing');
        // A warning every second and a meal twice a second: far busier than play.
        if (i % 60 === 0) engine.cue(cues[(i / 60) % cues.length] as Cue);
        if (i % 30 === 0) engine.cue('eat');
        ctx.advance(dt);
      }
      engine.drive(dt, busyScene(stage, 0), 'end');
      for (let i = 0; i < 600; i++) {
        engine.drive(dt, null, 'end');
        ctx.advance(dt);
      }
      const s = engine.stats();
      expect(s.peakNodes, stage).toBeLessThanOrEqual(AUDIO.budget.transient);
      // Every one-shot voice ended and was released.
      for (let i = 0; i < 600; i++) ctx.advance(dt);
      expect(engine.stats().voices, stage).toBe(0);
      expect(engine.stats().nodes, stage).toBe(0);
      expect(errors, stage).toEqual([]);
    }
  });

  it('plays every cue without an invalid value', () => {
    errors.length = 0;
    const ctx = new FakeContext();
    const engine = new AudioEngine(NO_RECORDINGS, seeded(3));
    engine.attach(ctx as unknown as BaseAudioContext);
    const all: Cue[] = ['sting', 'warnChar', 'warnBird', 'warnGull', 'warnMerganser', 'warnSeal', 'warnOrca', 'warnShark', 'warnBear', 'warnHook', 'warnRival', 'strikeBird', 'strikeBear', 'strikeSeal', 'chargeDeep', 'surge', 'eat', 'wriggle', 'opening', 'leap', 'spawned', 'stageComplete', 'death', 'nearMiss', 'lifeEnd', 'farCall'];
    for (const c of all) {
      engine.cue(c);
      ctx.advance(0.5);
    }
    expect(errors).toEqual([]);
    expect(engine.stats().peakVoices).toBeGreaterThan(0);
  });

  it('reads a scene from a real world in every stage', () => {
    for (let i = 0; i < STAGE_IDS.length; i++) {
      const { w } = newWorld({ startStage: i, seed: 5 });
      const sc = readScene(w, emptyScene());
      expect(sc.place.stage).toBe(STAGE_IDS[i]);
      expect(Number.isFinite(sc.speed)).toBe(true);
      expect(Number.isFinite(sc.place.depth ?? 0)).toBe(true);
      if (sc.place.stage === 'spawn') expect(sc.place.crowd ?? 0).toBeGreaterThan(0);
    }
  });
});
