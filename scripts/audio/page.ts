/**
 * The offline renderer's page side: runs the real AudioEngine on an
 * OfflineAudioContext with made-up scenes, one clip at a time, and hands
 * back the samples, levels and a spectrogram. Bundled and loaded into a
 * Playwright page by scripts/audio-render.mjs; never part of the game.
 */
import type { Cue } from '../../src/audio/config';
import { AudioEngine } from '../../src/audio/engine';
import type { Phase, Place } from '../../src/audio/mood';
import { emptyScene, type AudioScene } from '../../src/audio/scene';

const SR = 16000;
/** Control steps: a multiple of the render quantum (128 frames). */
const STEP = (128 * 20) / SR;

interface Clip {
  name: string;
  group: 'ambience' | 'music' | 'cue' | 'mix';
  seconds: number;
  /** What to listen for (goes in the README). */
  note: string;
  mix?: { world?: number; score?: boolean; sfx?: number };
  phase?: Phase;
  /** The scene at time t (seconds into the clip); null for the title. */
  scene?: (t: number) => Partial<AudioScene> & { place?: Place } | null;
  /** Things to do at times: cues, ducking, rain. */
  at?: [number, (e: AudioEngine) => void][];
  /** Seconds to run before recording starts, so a place has settled. */
  warm?: number;
}

const place = (p: Place) => ({ place: p });
const ambience = (name: string, note: string, p: Place | ((t: number) => Place), seconds = 10, extra: Partial<Clip> = {}): Clip => ({
  name: `ambience-${name}`,
  group: 'ambience',
  seconds,
  note,
  mix: { score: false, sfx: 0 },
  scene: (t) => place(typeof p === 'function' ? p(t) : p),
  ...extra,
});
const music = (slot: string, stage: Place['stage'] | null, note: string, extra: Partial<Clip> = {}): Clip => ({
  name: slot.replace('.', '-'),
  group: 'music',
  seconds: 14,
  note,
  mix: { world: 0, sfx: 0 },
  scene: () => (stage ? place({ stage }) : null),
  phase: stage ? 'playing' : 'title',
  warm: 0.5,
  ...extra,
});
const cue = (c: Cue, stage: Place['stage'], note: string, seconds = 3): Clip => ({
  name: `cue-${c}`,
  group: 'cue',
  seconds,
  note,
  mix: { world: 0, score: false },
  scene: () => place({ stage }),
  at: [[0.3, (e) => e.cue(c)]],
});

const CLIPS: Clip[] = [
  ambience('egg-gravel', 'In the redd: creek water through stones, a trickle between them, now and then a stone knocking.', { stage: 'egg' }),
  ambience('egg-flood', 'The flood coming: a deep rumble rises and stones roll (flood level 0 to 1 over the clip).', (t) => ({ stage: 'egg', flood: Math.min(1, t / 8) }), 12),
  ambience('fry-lake-day', 'The lake by day: a still hush, faint lapping far above, soft plops at the surface.', { stage: 'fry', light: 1, depth: 2 }),
  ambience('fry-lake-night', 'The lake at night: quieter, fewer plops.', { stage: 'fry', light: 0, depth: 2 }),
  ambience('smolt-river-night', 'The night river: a steady rush with bubbles.', { stage: 'smolt' }),
  ambience('smolt-estuary', 'From the river mouth into the estuary: the river fades and surf swells in toward the sea.', (t) => (t < 3 ? { stage: 'smolt', mouth: true } : { stage: 'smolt', estuary: Math.min(1, (t - 3) / 10) }), 14),
  ambience('ocean-open', 'The open ocean: low and vast, long swells overhead, and far off, now and then, an orca calling.', { stage: 'ocean', depth: 3 }, 16, { at: [[6, (e) => e.cue('farCall')]] }),
  ambience('return-coast', 'The coast on the way home: swell and a low wash.', { stage: 'return', inRiver: false, depth: 3 }),
  ambience('return-river', 'Inside the home river: a brighter rush.', { stage: 'return', inRiver: true }),
  ambience('return-riffle', 'Over a riffle: louder and more turbulent.', { stage: 'return', inRiver: true, riffle: true }),
  ambience('return-falls-approach', 'Swimming up to the falls: the roar rises from nothing to a thunder, through the rapids into the plunge pool.', (t) => {
    const dist = Math.max(0, 50 - t * 3.4);
    const near = Math.pow(Math.max(0, 1 - dist / 45), 1.7);
    return { stage: 'return', inRiver: true, falls: near, rapids: dist > 8 && dist < 20 };
  }, 16),
  ambience('return-lake', 'Crossing the nursery lake at the end of the return: quiet again.', { stage: 'return', inRiver: true, lake: true, light: 1 }),
  ambience('spawn-small-run', 'The spawning grounds in a small run (8 others): a babbling creek and a few splashes.', { stage: 'spawn', crowd: 8 }),
  ambience('spawn-big-run', 'The spawning grounds in a big run (100 others): splashing all around.', { stage: 'spawn', crowd: 100 }),
  ambience('rain', 'Rain on the lake (the weather hook at full): a hiss and drops from above.', { stage: 'fry', light: 0.7, depth: 1 }, 10, { at: [[0, (e) => e.setRain(1)]] }),

  music('music.title', null, 'Title: sparse, minor, a few bells.'),
  music('music.egg', 'egg', 'Egg: low, slow and close.'),
  music('music.fry', 'fry', 'Fry: open and light, the most melodic.'),
  music('music.smolt', 'smolt', 'Smolt: hushed and unsettled.'),
  music('music.ocean', 'ocean', 'Ocean: wide and deep, long notes far apart.'),
  music('music.return', 'return', 'Return: hopeful and a little warmer.'),
  music('music.spawn', 'spawn', 'Spawning grounds: bright and full.'),
  music('music.end', null, 'End of a life: slow and warm (starts with the life-end bells).', { phase: 'end' }),
  music('music.danger', 'ocean', 'The ocean score with danger: a predator warns at 5 s and strikes at 9 s; the danger layer rises, the bells stop, then it eases off after 13 s.', {
    seconds: 20,
    scene: (t) => ({ place: { stage: 'ocean' }, danger: t < 5 ? 0 : t < 9 ? 0.6 : t < 13 ? 1 : 0 }),
  }),

  cue('warnChar', 'fry', 'Char or trout warning: two low, woody notes rising, with a swish.'),
  cue('warnBird', 'smolt', 'Birds above the smolt run: three soft wingbeats, then a high falling note.'),
  cue('warnGull', 'spawn', 'A gull: two short high notes, falling.'),
  cue('warnMerganser', 'fry', 'A merganser: four paddling ticks.'),
  cue('warnSeal', 'smolt', 'A seal: a rising swoosh over a falling tone.'),
  cue('warnOrca', 'ocean', 'An orca: a deep double pulse and a faint whistle.', 4),
  cue('warnShark', 'ocean', 'A salmon shark: lower, slower, rougher, no whistle.', 4),
  cue('warnBear', 'return', 'A bear: two heavy footfalls on gravel.'),
  cue('warnHook', 'return', 'An angler\'s lure takes hold: a reel\'s ratchet.'),
  cue('warnRival', 'spawn', 'A rival male: two mid knocks.'),
  cue('surge', 'egg', 'A surge of flow (or the flood starting): a swell of water.'),
  cue('opening', 'spawn', 'A jack\'s opening: a soft bright tone.'),
  cue('strikeBird', 'smolt', 'A bird or merganser strikes the water.'),
  cue('strikeBear', 'spawn', 'A bear strikes: a big low splash.'),
  cue('strikeSeal', 'smolt', 'A seal lunges: a rushing swoosh, then a splash.'),
  cue('chargeDeep', 'ocean', 'An orca or shark charges: a deep pulse.'),
  cue('nearMiss', 'fry', 'A strike that just missed: a rush of water past the fish and a thump.'),
  cue('eat', 'fry', 'Eating: a small snap, a gulp and bubbles.', 2),
  cue('wriggle', 'egg', 'An alevin wriggling in the gravel.', 2),
  cue('leap', 'return', 'A leap at the falls: a rush up, then the splash back.'),
  cue('spawned', 'spawn', 'Spawning: four rising bells.', 6),
  cue('stageComplete', 'fry', 'A stage completed: two bells.', 4),
  cue('death', 'fry', 'Death: a soft low fall with the world muffled; clear, not a shock.', 5),
  cue('lifeEnd', 'spawn', 'The end of a life: a slow, warm rising chord of bells.', 7),
  {
    name: 'cue-heartbeat',
    group: 'cue',
    seconds: 9,
    note: 'The weak-fish heartbeat: energy falls from 40% to nothing, and the lub-dub comes in and quickens.',
    mix: { world: 0, score: false },
    scene: (t) => ({ place: { stage: 'fry' }, energy: Math.max(0, 0.4 - t * 0.05) }),
  },
  {
    name: 'cue-swim-burst',
    group: 'cue',
    seconds: 6,
    note: 'Swimming: a soft rush that follows speed; a whoosh as a burst starts at 2 s, ending at 3.5 s.',
    mix: { world: 0, score: false },
    scene: (t) => ({ place: { stage: 'fry' }, swims: true, speed: Math.min(2.5, t), thrust: 1, burst: t > 2 && t < 3.5 }),
  },

  {
    name: 'mix-fry-duck',
    group: 'mix',
    seconds: 16,
    note: 'The lake as played: ambience and score; a narration line starts at 4 s and ends at 10 s, and music and ambience dip smoothly under it (the warning cue at 7 s is not ducked).',
    scene: () => ({ place: { stage: 'fry', light: 1, depth: 2 } }),
    warm: 1,
    at: [
      [4, (e) => e.setDucked(true)],
      [7, (e) => e.cue('warnChar')],
      [10, (e) => e.setDucked(false)],
    ],
  },
  {
    name: 'mix-falls',
    group: 'mix',
    seconds: 18,
    note: 'Up the rapids to the falls as played: score, roar rising, a bear warning at 8 s, a leap at 14 s.',
    scene: (t) => {
      const dist = Math.max(0, 45 - t * 3);
      return { place: { stage: 'return', inRiver: true, falls: Math.pow(Math.max(0, 1 - dist / 45), 1.7), rapids: dist > 8 && dist < 20 }, swims: true, speed: 2, thrust: 1, leaping: t > 14 && t < 15 };
    },
    warm: 1,
    at: [[8, (e) => e.cue('warnBear')]],
  },
];

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashName(n: string): number {
  let h = 2166136261;
  for (let i = 0; i < n.length; i++) h = Math.imul(h ^ n.charCodeAt(i), 16777619);
  return h >>> 0;
}

async function render(name: string): Promise<{ sampleRate: number; pcm: string; peak: number; rms: number; seconds: number; peakVoices: number; persistent: number; spectrogram: string }> {
  const clip = CLIPS.find((c) => c.name === name);
  if (!clip) throw new Error(`no clip ${name}`);
  const warm = clip.warm ?? 3;
  const total = warm + clip.seconds;
  const ctx = new OfflineAudioContext(1, Math.ceil(total * SR), SR);
  const engine = new AudioEngine({ has: () => false, url: () => '' }, seeded(hashName(name)));
  engine.attach(ctx);
  engine.setVolume(0.7);
  if (clip.mix) engine.setMix(clip.mix);
  const phase = clip.phase ?? 'playing';
  const pending = (clip.at ?? []).map(([t, fn]) => ({ t: t + warm, fn, done: false }));
  const step = (t: number) => {
    const s = clip.scene ? clip.scene(Math.max(0, t - warm)) : null;
    const sc = s ? { ...emptyScene(), key: name, ...s } : null;
    engine.drive(STEP, sc, phase);
    for (const p of pending) if (!p.done && t >= p.t) {
      p.done = true;
      p.fn(engine);
    }
  };
  let t = 0;
  const schedule = (at: number) => {
    void ctx.suspend(at).then(() => {
      step(at);
      t = at + STEP;
      if (t < total - STEP) schedule(t);
      void ctx.resume();
    });
  };
  schedule(STEP);
  step(0);
  const buf = await ctx.startRendering();
  const all = buf.getChannelData(0);
  const data = all.subarray(Math.floor(warm * SR));
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] as number;
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const rms = Math.sqrt(sum / data.length);
  const pcm16 = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) pcm16[i] = Math.max(-32768, Math.min(32767, Math.round((data[i] as number) * 32767)));
  const bytes = new Uint8Array(pcm16.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const st = engine.stats();
  return { sampleRate: SR, pcm: btoa(bin), peak, rms, seconds: clip.seconds, peakVoices: st.peakVoices, persistent: st.persistent, spectrogram: spectrogram(data, name) };
}

/** A log-magnitude spectrogram (0 to 8 kHz, log frequency) as a PNG data URL. */
function spectrogram(data: Float32Array, title: string): string {
  const N = 1024;
  const W = 900;
  const H = 260;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H + 18;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H + 18);
  const img = g.createImageData(W, H);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const fMin = 30;
  const fMax = 8000;
  for (let x = 0; x < W; x++) {
    const start = Math.floor((x / W) * Math.max(1, data.length - N));
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = (data[start + i] ?? 0) * w;
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < H; y++) {
      const f = fMin * Math.pow(fMax / fMin, 1 - y / H);
      const k = Math.min(N / 2 - 1, Math.round((f / SR) * N));
      const mag = Math.hypot(re[k] as number, im[k] as number) / (N / 4);
      const db = 20 * Math.log10(mag + 1e-9);
      const v = Math.max(0, Math.min(1, (db + 90) / 80));
      const o = (y * W + x) * 4;
      img.data[o] = Math.round(255 * Math.min(1, v * 1.8));
      img.data[o + 1] = Math.round(255 * Math.max(0, v * 1.6 - 0.6));
      img.data[o + 2] = Math.round(255 * Math.max(0, 0.6 - Math.abs(v - 0.3) * 2));
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#ccc';
  g.font = '12px sans-serif';
  g.fillText(`${title}   (30 Hz to 8 kHz, log; −90 to −10 dB)`, 6, H + 13);
  return canvas.toDataURL('image/png');
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < len / 2; j++) {
        const wr = Math.cos(ang * j);
        const wi = Math.sin(ang * j);
        const a = i + j;
        const b = a + len / 2;
        const xr = (re[b] as number) * wr - (im[b] as number) * wi;
        const xi = (re[b] as number) * wi + (im[b] as number) * wr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
      }
    }
  }
}

(window as unknown as { hwAudio: unknown }).hwAudio = {
  clips: () => CLIPS.map((c) => ({ name: c.name, group: c.group, seconds: c.seconds, note: c.note })),
  render,
};
