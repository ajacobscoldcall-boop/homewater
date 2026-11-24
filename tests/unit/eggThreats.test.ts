/**
 * The egg stage's threats besides the flood (Track 2.5, src/sim/stages/eggThreats.ts): the low-oxygen pocket, the
 * sculpin and the silt, crawling between the stones, and the stage's length in a first and a later life.
 */
import { describe, expect, it } from 'vitest';
import { alevinView, gravelFlowAt, type AlevinView } from '../../src/sim/stages/egg';
import { crawl, gravelFlow, layStones, planThreats, stoneCover, type EggThreatState } from '../../src/sim/stages/eggThreats';
import { wrapAngle } from '../../src/sim/vec';
import { World } from '../../src/sim/world';
import type { Intent } from '../../src/sim/types';
import { intent, newWorld } from './helpers';

const SEC = 60;

function world(seed: number, firstLife: boolean, difficulty: 'fieldGuide' | 'wild' = 'fieldGuide'): World {
  const { w: w0, p } = newWorld({ seed, difficulty });
  return new World(p, { fish: w0.fish, conditions: w0.conditions, difficulty, siblings: 0, seed: seed * 31 + 7, firstLife });
}

const threats = (w: World) => (w.stage as unknown as { threats: EggThreatState }).threats;

/** Face the current, stay deep, rise when ready. */
function steady(w: World): Intent {
  const v = alevinView(w);
  if (!v || v.phase === 'egg') return intent();
  const d = wrapAngle(v.currentAngle + Math.PI - w.body.yaw);
  return intent({ turn: Math.abs(d) > 0.1 ? Math.max(-1, Math.min(1, d * 3)) : 0, rise: v.ready, dive: !v.ready && v.height > 0.01 });
}

/** Turn toward a point and crawl to it. */
function goTo(w: World, x: number, z: number): Intent {
  const d = wrapAngle(Math.atan2(z - w.body.pos.z, x - w.body.pos.x) - w.body.yaw);
  const far = Math.hypot(x - w.body.pos.x, z - w.body.pos.z) > 0.05;
  return intent({ turn: Math.max(-1, Math.min(1, d * 4)), forward: far && Math.abs(d) < 0.4 ? 1 : 0 });
}

/** Sit still, deep, against the nearest stone from the moment it comes. */
function hide(w: World): Intent {
  const v = alevinView(w)!;
  if (v.threat !== 'sculpin') return steady(w);
  const near = [...v.stones].sort((a, b) => Math.hypot(a.x - w.body.pos.x, a.z - w.body.pos.z) - Math.hypot(b.x - w.body.pos.x, b.z - w.body.pos.z))[0]!;
  const a = Math.atan2(w.body.pos.z - near.z, w.body.pos.x - near.x);
  const tx = near.x + Math.cos(a) * (near.r + 0.07);
  const tz = near.z + Math.sin(a) * (near.r + 0.07);
  const probing = w.live('sculpin').some((e) => e.state !== 'warn');
  const go = probing ? intent() : goTo(w, tx, tz);
  return { ...go, dive: v.height > 0.01 };
}

function runUntil(w: World, done: (v: AlevinView) => boolean, policy: (w: World) => Intent = steady, max = 200 * SEC): void {
  for (let i = 0; i < max && w.status === 'playing'; i++) {
    const v = alevinView(w);
    if (v && done(v)) return;
    w.step(policy(w));
    w.drainEvents();
  }
}

describe('egg threats: the plan', () => {
  it('a first life meets the pocket, the sculpin, the flood and the silt; a later life the flood and one other', () => {
    expect(planThreats(world(1, true))).toEqual(['pocket', 'sculpin', 'flood', 'silt']);
    const seen = new Set<string>();
    for (let s = 1; s <= 30; s++) {
      const plan = planThreats(world(s, false));
      expect(plan).toHaveLength(2);
      expect(plan).toContain('flood');
      // The silt always follows the flood; the pocket and the sculpin come before it.
      expect(plan.indexOf('flood')).toBe(plan.includes('silt') ? 0 : 1);
      seen.add(plan.join(','));
    }
    expect(seen.size).toBe(3);
  });

  it('laying the stones and planning draws no numbers from the world stream', () => {
    const w = world(3, true);
    const before = w.rng.state;
    layStones(w);
    planThreats(w);
    expect(w.rng.state).toBe(before);
  });

  it('the stones sit apart inside the hollow, half with their open gap low and half higher up', () => {
    for (let s = 1; s <= 10; s++) {
      const w = world(s, true);
      const stones = threats(w).stones;
      expect(stones.length).toBeGreaterThanOrEqual(4);
      for (const a of stones) {
        expect(Math.hypot(a.x, a.z)).toBeLessThan(w.p.get('alevin.crawlRadius'));
        for (const b of stones) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.r + b.r);
      }
      expect(stones.some((a) => a.gap < 0.3)).toBe(true);
      expect(stones.some((a) => a.gap > 0.5)).toBe(true);
    }
  });
});

describe('egg threats: crawling', () => {
  it('forward crawls along the heading, never into a large stone or out of the hollow', () => {
    const w = world(2, true);
    const t = threats(w);
    const max = w.p.get('alevin.crawlRadius');
    for (let k = 0; k < 8; k++) {
      w.body.yaw = (k / 8) * Math.PI * 2;
      for (let i = 0; i < 20 * SEC; i++) crawl(w, t, 1, 1 / SEC);
      expect(Math.hypot(w.body.pos.x, w.body.pos.z)).toBeLessThanOrEqual(max + 1e-6);
      for (const s of t.stones) expect(Math.hypot(w.body.pos.x - s.x, w.body.pos.z - s.z)).toBeGreaterThanOrEqual(s.r);
    }
  });
});

describe('egg threats: the low-oxygen pocket', () => {
  it('the water stops where the alevin lies; staying weakens it, crawling out to moving water restores it', () => {
    const stay = world(4, true);
    runUntil(stay, (v) => v.pocket.phase === 'still');
    const p = alevinView(stay)!.pocket;
    expect(gravelFlowAt(stay, p.x, p.z, stay.body.pos.y)).toBeLessThan(0.05);
    expect(gravelFlowAt(stay, p.x + p.radius * 2, p.z, stay.body.pos.y)).toBe(1);
    runUntil(stay, (v) => v.pocket.phase !== 'still');
    expect(stay.body.energy).toBeLessThan(0.75);

    const leave = world(4, true);
    runUntil(leave, (v) => v.pocket.phase === 'forming');
    const q = alevinView(leave)!.pocket;
    // Out past the pocket's edge, away from the stones.
    const stones = threats(leave).stones;
    let target = { x: q.x, z: q.z };
    for (let a = 0; a < 16; a++) {
      const x = q.x + Math.cos((a / 16) * Math.PI * 2) * (q.radius + 0.3);
      const z = q.z + Math.sin((a / 16) * Math.PI * 2) * (q.radius + 0.3);
      if (Math.hypot(x, z) < 1.3 && !stones.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 0.1)) {
        target = { x, z };
        break;
      }
    }
    runUntil(leave, (v) => v.pocket.phase === 'clearing', (w) => goTo(w, target.x, target.z));
    expect(alevinView(leave)!.o2).toBeGreaterThan(0.9);
    expect(leave.body.energy).toBeGreaterThan(0.95);
  });

  it('an alevin left in still water long enough is smothered', () => {
    const w = world(5, true, 'wild');
    runUntil(w, (v) => v.pocket.phase === 'still');
    // Hold the pocket still: the water never comes back.
    threats(w).pocket.left = 1e6;
    runUntil(w, () => false, steady, 120 * SEC);
    expect(w.status).toBe('dead');
    expect(w.deathCause).toBe('silt');
  });
});

describe('egg threats: silt', () => {
  it('silt clogs the open gravel but water still moves beside a large stone at its gap height', () => {
    const w = world(6, true);
    runUntil(w, (v) => v.silt.phase === 'settled', hide, 300 * SEC);
    expect(w.status).toBe('playing');
    const t = threats(w);
    const st = t.stones[0]!;
    const ax = st.x + (st.r + 0.06) * Math.cos(0.3);
    const az = st.z + (st.r + 0.06) * Math.sin(0.3);
    expect(gravelFlow(w, t, ax, az, st.gap)).toBeGreaterThan(0.6);
    expect(gravelFlow(w, t, ax, az, st.gap > 0.5 ? 0 : 1)).toBeLessThan(0.3);
    // Far from every stone: clogged.
    expect(gravelFlow(w, t, 0, 0, 0.5)).toBeLessThanOrEqual(w.p.get('alevin.siltResidual') + 0.15);
    // The flecks slow for the renderer too.
    expect(gravelFlowAt(w, 0, 0, -1.3)).toBeLessThan(0.3);
  });

  it('after the silt the caption says how many of the brood are left', () => {
    const w = world(7, true);
    const keys: string[] = [];
    for (let i = 0; i < 300 * SEC && w.status === 'playing'; i++) {
      w.step(hide(w));
      for (const e of w.drainEvents()) if (e.key === 'egg.siltOver') keys.push(`${e.vars?.left}/${e.vars?.total}`);
    }
    expect(keys).toHaveLength(1);
  });
});

describe('egg threats: the sculpin', () => {
  it('still and deep against a stone, the alevin is not found', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = world(seed, true);
      runUntil(w, (v) => v.threat === 'sculpin');
      runUntil(w, (v) => v.threat !== 'sculpin', hide);
      expect(w.status, `seed ${seed}: ${w.deathCause}`).toBe('playing');
      expect(stoneCover(threats(w), w.body.pos.x, w.body.pos.z, w.p.get('alevin.sculpinCoverReach'))).toBeGreaterThan(0.9);
    }
  });

  it('an alevin that keeps moving while it probes is found and taken', () => {
    let taken = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const w = world(seed, true);
      runUntil(w, (v) => v.threat === 'sculpin');
      // Fidget: turn back and forth, up and down.
      runUntil(w, (v) => v.threat !== 'sculpin', (ww) => intent({ turn: Math.sin(ww.stageTime * 3), rise: Math.sin(ww.stageTime * 2) > 0, dive: Math.sin(ww.stageTime * 2) <= 0 }));
      if (w.deathCause === 'sculpin') taken++;
    }
    expect(taken).toBeGreaterThanOrEqual(5);
  });

  it('the sculpin is marked from its first warning; it comes in over the gravel and leaves again', () => {
    const w = world(2, true);
    const states = new Set<string>();
    runUntil(w, (v) => v.threat === 'sculpin');
    runUntil(w, (v) => {
      for (const e of w.live('sculpin')) states.add(e.state);
      return v.threat !== 'sculpin';
    }, (ww) => ({ ...hide(ww) }));
    expect([...states]).toEqual(expect.arrayContaining(['warn', 'probe', 'leave']));
    expect(w.live('sculpin')).toHaveLength(0);
  });
});

describe('egg threats: length and the brood', () => {
  it('a first life lasts about two minutes and a later life under a minute, both with the flood', () => {
    for (const first of [true, false]) {
      for (const seed of [1, 2, 3]) {
        const w = world(seed, first);
        let flood = false;
        runUntil(w, (v) => ((flood ||= v.flood === 'flood'), false), hide, 300 * SEC);
        expect(flood).toBe(true);
        expect(w.status).toBe('stageComplete');
        if (first) {
          expect(w.stageTime).toBeGreaterThan(90);
          expect(w.stageTime).toBeLessThan(150);
        } else expect(w.stageTime).toBeLessThan(60);
      }
    }
  });

  it("the brood-mates' losses still tell the advisor's egg-to-fry survival (about 10-20%)", () => {
    for (const first of [true, false]) {
      let left = 0;
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const w = world(seed, first);
        let counted = false;
        for (let i = 0; i < 300 * SEC && w.status === 'playing' && !counted; i++) {
          w.step(hide(w));
          w.drainEvents();
          const v = alevinView(w);
          if (v?.ready) {
            counted = true;
            left += w.live('brood').filter((b) => b.state === 'hidden').length;
            total += v.broodTotal;
          }
        }
      }
      expect(total).toBeGreaterThan(0);
      expect(left / total, first ? 'first life' : 'later life').toBeGreaterThan(0.08);
      expect(left / total, first ? 'first life' : 'later life').toBeLessThan(0.24);
    }
  });
});
