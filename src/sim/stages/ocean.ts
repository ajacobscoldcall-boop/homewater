/**
 * Stage 4: ocean years. Feed on a herring ball; an orca makes a pass you must
 * dodge. At the end, genes and growth decide maturation (jack or not).
 */
import { adultSize, becomesJack, oceanYearsFor } from '../genetics';
import { swimStep } from '../swim';
import { add, dist, norm, scale, sub, v3 } from '../vec';
import type { World } from '../world';
import type { StageDef } from './index';

interface OceanState {
  ballCenter: { x: number; y: number; z: number };
  orcaAt: number;
  orcaDone: boolean;
  sharkAt: number;
  sharkDone: boolean;
}

const st = (w: World) => w.stage as unknown as OceanState;

function spawnHerring(w: World, n: number): void {
  const c = st(w).ballCenter;
  for (let i = 0; i < n; i++) {
    w.spawn('herring', v3(c.x, c.y, c.z), { radius: 0.2, value: w.rng.range(0, Math.PI * 2), size: v3(w.rng.range(2.5, 6), w.rng.range(-2, 2), w.rng.range(0.6, 1.4)) });
  }
}

/** Decide maturation and adult size from genes and how well the fish fed. */
export function decideMaturation(w: World): void {
  const pr = w.progress;
  const fryRich = pr.fryBites > 0 ? pr.fryRichBites / pr.fryBites : 0.4;
  pr.growthPerf = Math.min(1, Math.max(0, 0.2 + 0.35 * fryRich + 0.45 * Math.min(1, pr.oceanBites / 22)));
  pr.isJack = becomesJack(w.p, w.fish, pr.growthPerf);
  pr.oceanYears = oceanYearsFor(w.p, w.fish, pr.isJack);
  pr.adultSize = adultSize(w.p, w.fish, pr.oceanYears, pr.growthPerf, w.conditions);
}

export const oceanStage: StageDef = {
  id: 'ocean',
  arena: () => ({
    kind: 'ocean',
    // Advisor: sockeye stay within 20-40 m of the surface. The arena is that band.
    min: v3(-70, -30, -70),
    max: v3(70, 0, 70),
    surfaceY: 0,
    water: 'salt',
    floor: () => -30,
    current: () => v3(0.2, 0, 0.1),
  }),
  init(w) {
    w.body.pos = v3(0, -12, -22);
    w.body.yaw = Math.PI / 2;
    w.body.scale = 0.85;
    const dur = w.p.get('ocean.feedDuration');
    const s: OceanState = { ballCenter: v3(0, -12, 0), orcaAt: dur * 0.3, orcaDone: false, sharkAt: dur * 0.65, sharkDone: false };
    w.stage = s as unknown as Record<string, unknown>;
    spawnHerring(w, 70);
    if (w.conditions.oceanCrowding > 1.08) w.emit('caption', 'ocean.crowded');
  },
  step(w, intent, dt) {
    swimStep(w, intent, dt);
    const p = w.p;
    const s = st(w);
    const fish = w.body.pos;
    const t = w.stageTime;
    // The bait ball drifts slowly.
    s.ballCenter.x = Math.sin(t * 0.15) * 8;
    s.ballCenter.z = Math.cos(t * 0.11) * 8;
    for (const h of w.live('herring')) {
      const sz = h.size ?? v3(4, 0, 1);
      const a = (h.value ?? 0) + t * sz.z;
      h.pos = v3(s.ballCenter.x + Math.cos(a) * sz.x, s.ballCenter.y + sz.y + Math.sin(a * 1.7) * 0.6, s.ballCenter.z + Math.sin(a) * sz.x);
      h.yaw = -a;
      if (dist(h.pos, fish) < 1.1) {
        h.alive = false;
        w.progress.oceanBites += 1;
        w.emit('eat');
      }
    }
    if (w.live('herring').length < 40) spawnHerring(w, 10);

    // Orca, then salmon shark: a warning silhouette, then one straight charging pass.
    if (!s.orcaDone && t >= s.orcaAt && w.live('orca').length === 0) {
      const ang = w.rng.range(0, Math.PI * 2);
      const start = add(fish, v3(Math.cos(ang) * 55, w.rng.range(-4, 4), Math.sin(ang) * 55));
      start.y = Math.min(-4, Math.max(-28, start.y));
      w.spawn('orca', start, { radius: 3, state: 'warn', timer: p.get('ocean.orcaWarning') });
      w.emit('warning', 'orca');
      w.emitOnce('caption', 'ocean.orca');
    }
    if (s.orcaDone && !s.sharkDone && t >= s.sharkAt && w.live('shark').length === 0) {
      const ang = w.rng.range(0, Math.PI * 2);
      const start = add(fish, v3(Math.cos(ang) * 30, -10, Math.sin(ang) * 30));
      start.y = Math.max(-28, start.y);
      w.spawn('shark', start, { radius: 1.5, state: 'warn', timer: p.get('ocean.sharkWarning') });
      w.emit('warning', 'shark');
      w.emitOnce('caption', 'ocean.shark');
    }
    for (const o of [...w.live('orca'), ...w.live('shark')]) {
      const orca = o.kind === 'orca';
      o.timer -= dt;
      if (o.state === 'warn') {
        const dir = norm(sub(fish, o.pos));
        o.vel = scale(dir, orca ? 4 : 3);
        if (o.timer <= 0) {
          o.state = 'charge';
          o.vel = scale(norm(sub(fish, o.pos)), p.get(orca ? 'ocean.orcaSpeed' : 'ocean.sharkSpeed'));
          o.timer = 8;
        }
      } else if (o.state === 'charge') {
        if (dist(o.pos, fish) < (orca ? p.get('ocean.orcaCatchRadius') : 1.6)) {
          w.die(orca ? 'orca' : 'shark');
          return;
        }
        if (o.timer <= 0 || dist(o.pos, fish) > p.get('ocean.escapeDistance') * 3) {
          o.alive = false;
          if (orca) s.orcaDone = true;
          else s.sharkDone = true;
          w.emit('caption', orca ? 'ocean.orcaGone' : 'ocean.sharkGone');
        }
      }
      o.yaw = Math.atan2(o.vel.z, o.vel.x);
      o.pos = add(o.pos, scale(o.vel, dt));
      o.pos.y = Math.min(-1.5, Math.max(-29, o.pos.y));
    }

    const busy = w.live('orca').length + w.live('shark').length > 0;
    if (t >= p.get('ocean.feedDuration') && !busy) {
      decideMaturation(w);
      const pr = w.progress;
      const key = w.fish.sex === 'F' ? 'ocean.revealFemale' : pr.isJack ? 'ocean.revealJack' : 'ocean.revealLarge';
      w.emit('reveal', key, { years: pr.oceanYears ?? 2 });
      // Each extra year at sea is survived only with some chance; jacks skip it.
      const extra = (pr.oceanYears ?? 1) - 1;
      if (extra > 0) {
        w.emitOnce('caption', 'ocean.yearsAtSea');
        const survive = Math.pow(Math.min(1, p.get('life.lateOceanSurvival')), extra);
        if (!w.rng.chance(survive)) {
          w.die('sea');
          return;
        }
      }
      w.completeStage();
    }
  },
  debugComplete(w) {
    w.progress.oceanBites = Math.max(w.progress.oceanBites, 16);
    decideMaturation(w);
    w.completeStage();
  },
  fillProgress(w) {
    w.progress.oceanBites = 16;
    decideMaturation(w);
  },
};
