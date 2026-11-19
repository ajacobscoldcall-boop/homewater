/** Stage 2: fry in the lake. Feed on plankton; open water is rich but trout hunt there. */
import { swimStep } from '../swim';
import type { Entity } from '../types';
import { dist, norm, sub, v3 } from '../vec';
import type { World } from '../world';
import type { StageDef } from './index';

const WEED_EDGE = -19;

interface FryState {
  growth: number;
}

const st = (w: World) => w.stage as unknown as FryState;

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function spawnPatch(w: World, rich: boolean): void {
  const cx = rich ? w.rng.range(-6, 24) : w.rng.range(-18, -10);
  const cz = w.rng.range(-20, 20);
  const cy = w.rng.range(-8, -2);
  const n = 12;
  for (let i = 0; i < n; i++) {
    w.spawn('plankton', v3(cx + w.rng.range(-2.5, 2.5), cy + w.rng.range(-1.5, 1.5), cz + w.rng.range(-2.5, 2.5)), {
      radius: 0.15,
      value: rich ? 1 : 0,
    });
  }
}

function inWeeds(x: number): boolean {
  return x < WEED_EDGE;
}

function stepTrout(w: World, t: Entity, dt: number): void {
  const p = w.p;
  const fish = w.body.pos;
  const d = dist(t.pos, fish);
  const hidden = inWeeds(fish.x);
  t.timer -= dt;
  if (t.state === 'patrol') {
    // Slow circling around a home point.
    const home = t.home ?? v3();
    t.yaw += 0.5 * dt;
    const target = v3(home.x + Math.cos(t.yaw) * 7, home.y, home.z + Math.sin(t.yaw) * 7);
    const dir = norm(sub(target, t.pos));
    t.vel = v3(dir.x * 2.2, dir.y * 2.2, dir.z * 2.2);
    if (!hidden && d < p.get('fry.troutDetect')) {
      t.state = 'warn';
      t.timer = p.get('fry.troutWarning');
      w.emit('warning', 'trout');
      w.emitOnce('caption', 'fry.trout');
    }
  } else if (t.state === 'warn') {
    const dir = norm(sub(fish, t.pos));
    t.vel = v3(dir.x * 1.5, dir.y * 1.5, dir.z * 1.5);
    if (t.timer <= 0) {
      t.state = 'chase';
      t.timer = 6;
    }
  } else if (t.state === 'chase') {
    const dir = norm(sub(fish, t.pos));
    const sp = p.get('fry.troutSpeed');
    t.vel = v3(dir.x * sp, dir.y * sp, dir.z * sp);
    if (d < p.get('fry.catchRadius')) {
      w.die('trout');
      return;
    }
    if (hidden || t.timer <= 0) {
      t.state = 'patrol';
      if (hidden) w.emitOnce('caption', 'fry.safeWeeds');
    }
  }
  t.pos.x += t.vel.x * dt;
  t.pos.y += t.vel.y * dt;
  t.pos.z += t.vel.z * dt;
  // Trout will not enter the weed bed.
  if (t.pos.x < WEED_EDGE + 1) t.pos.x = WEED_EDGE + 1;
  t.pos.y = Math.min(-0.8, Math.max(w.arena.floor(t.pos.x, t.pos.z) + 0.5, t.pos.y));
}

export const fryStage: StageDef = {
  id: 'fry',
  arena: () => ({
    kind: 'lake',
    min: v3(-30, -12, -30),
    max: v3(30, 0, 30),
    surfaceY: 0,
    water: 'fresh',
    floor: (x, z) => {
      const edge = Math.max(Math.abs(x), Math.abs(z));
      const shelf = x < WEED_EDGE ? 5 : 0;
      return -11 + 7 * smooth(20, 30, edge) + shelf;
    },
    current: () => v3(),
  }),
  init(w) {
    w.body.pos = v3(-25, -3, 0);
    w.body.yaw = 0;
    w.body.scale = 0.45;
    w.body.energy = Math.min(1, 0.6 + 0.4 * w.progress.yolk);
    w.stage = { growth: 0 } as unknown as Record<string, unknown>;
    for (let i = 0; i < 46; i++) {
      w.spawn('weed', v3(w.rng.range(-30, WEED_EDGE), -6, w.rng.range(-29, 29)), { radius: 0.3, value: w.rng.range(0.5, 1) });
    }
    spawnPatch(w, false);
    spawnPatch(w, false);
    spawnPatch(w, true);
    spawnPatch(w, true);
    spawnPatch(w, true);
    const n = w.p.get('fry.troutCount');
    for (let i = 0; i < n; i++) {
      const home = v3(w.rng.range(0, 18), -5, w.rng.range(-15, 15));
      w.spawn('trout', v3(home.x + 7, home.y, home.z), { radius: 0.8, state: 'patrol', home, yaw: w.rng.range(0, 6) });
    }
    if (w.firstLife) w.emit('caption', 'fry.controls');
  },
  step(w, intent, dt) {
    swimStep(w, intent, dt);
    const s = st(w);
    const fish = w.body.pos;
    const p = w.p;
    for (const e of w.entities) {
      if (!e.alive) continue;
      if (e.kind === 'plankton' && dist(e.pos, fish) < 0.9) {
        e.alive = false;
        const rich = e.value === 1;
        s.growth += p.get('fry.planktonGrowth') * (rich ? p.get('fry.richPatchMultiplier') : 1);
        w.progress.fryBites += 1;
        if (rich) w.progress.fryRichBites += 1;
        w.emit('eat');
      } else if (e.kind === 'plankton') {
        // Gentle drift.
        e.pos.y += Math.sin(w.stageTime * 0.7 + e.id) * 0.004;
      }
    }
    for (const t of w.live('trout')) {
      stepTrout(w, t, dt);
      if (w.status !== 'playing') return;
    }
    // Keep food available.
    const left = w.live('plankton');
    if (left.filter((e) => e.value === 1).length < 6) spawnPatch(w, true);
    if (left.filter((e) => e.value === 0).length < 6) spawnPatch(w, false);

    if (s.growth >= p.get('fry.growthTarget')) {
      w.emit('caption', 'fry.winter');
      w.completeStage();
    }
  },
  debugComplete(w) {
    w.progress.fryBites = 14;
    w.progress.fryRichBites = 8;
    w.completeStage();
  },
  fillProgress(w) {
    w.progress.fryBites = 14;
    w.progress.fryRichBites = 8;
  },
};

export const fryGrowth = (w: World): number => (w.stageId === 'fry' ? st(w).growth / w.p.get('fry.growthTarget') : 0);
