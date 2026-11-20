import { describe, expect, it } from 'vitest';
import captionFile from '../../src/data/captions.json';
import { deathBeatPlan, endCards, endSequenceMs, GORE } from '../../src/render/goreConfig';
import { otherFishLook, senescence, WoundTracker } from '../../src/render/wounds';
import type { DeathCause, SimEvent } from '../../src/sim/types';
import { v3 } from '../../src/sim/vec';
import type { World } from '../../src/sim/world';
import { intent, newWorld } from './helpers';

const CAPTIONS = (captionFile as { captions: Record<string, string> }).captions;
const ev = (type: SimEvent['type'], key?: string): SimEvent => ({ t: 0, type, ...(key ? { key } : {}) });

describe('senescence', () => {
  it('is nothing before the spawning grounds', () => {
    for (const stage of [0, 3, 4]) {
      const { w } = newWorld({ startStage: stage });
      expect(senescence(w)).toBe(0);
    }
  });

  it('rises as strength fades on the grounds, and faster after spawning', () => {
    const { w } = newWorld({ startStage: 5, sex: 'F' });
    const arrive = senescence(w);
    expect(arrive).toBeGreaterThan(0);
    // Strength drained on the grounds, read without playing it out (an idle fish may meet a bear).
    (w.stage as unknown as { vigour: number }).vigour = 0.6;
    w.stageTime = 20;
    const later = senescence(w);
    expect(later).toBeGreaterThan(arrive);
    const s = w.stage as unknown as { spawned: boolean; spawnedAt: number };
    s.spawned = true;
    s.spawnedAt = 20;
    w.stageTime = 30;
    const spawnedOut = senescence(w);
    w.stage = { ...w.stage, spawned: false, spawnedAt: -1 };
    expect(spawnedOut - senescence(w)).toBeGreaterThan(0.1);
    w.stageTime = 1e4;
    w.stage = { ...w.stage, spawned: true, spawnedAt: 0 };
    expect(senescence(w)).toBeLessThanOrEqual(1);
  });
});

describe('wounds', () => {
  it('come from fights, a torn-out hook and a squeeze through a net', () => {
    const { w } = newWorld({ startStage: 4 });
    const t = new WoundTracker();
    t.update(w);
    t.onEvents([ev('graze', 'net'), ev('caption', 'return.unhooked'), ev('caption', 'return.track')], w);
    expect(t.wounds.map((x) => x.kind)).toEqual(['net', 'hook']);
    t.onEvents([ev('caption', 'spawn.fightLost'), ev('caption', 'spawn.fightWonSide')], w);
    expect(t.wounds.map((x) => x.kind)).toEqual(['net', 'hook', 'bite', 'bite']);
    // Losing a fight marks the fish worse than winning one.
    expect(t.wounds[2]!.strength).toBeGreaterThan(t.wounds[3]!.strength);
    for (const wd of t.wounds) expect(wd.fresh).toBe(1);
  });

  it('heal with time, scar across a time skip, and belong to one fish', () => {
    const { w } = newWorld({ startStage: 4 });
    const t = new WoundTracker();
    t.onEvents([ev('caption', 'return.unhooked')], w);
    for (let i = 0; i < 60 * 5; i++) w.step(intent());
    t.update(w);
    const wd = t.wounds[0]!;
    expect(wd.fresh).toBeLessThan(1);
    expect(wd.fresh).toBeGreaterThan(0);
    const before = wd.strength;
    w.debugJumpTo(5);
    t.update(w);
    expect(t.wounds[0]!.fresh).toBe(0);
    expect(t.wounds[0]!.strength).toBeLessThan(before);
    // A sibling starts unmarked.
    w.die('exhaustion');
    w.continueWithSibling('Sib');
    t.update(w);
    expect(t.wounds).toEqual([]);
  });

  it('keep to the shader limit, dropping the faintest', () => {
    const { w } = newWorld({ startStage: 5 });
    const t = new WoundTracker();
    t.onEvents([ev('caption', 'spawn.fightWon')], w);
    for (let i = 0; i < GORE.wounds.max + 3; i++) t.onEvents([ev('caption', 'spawn.fightLost')], w);
    expect(t.wounds.length).toBe(GORE.wounds.max);
    expect(t.wounds.every((x) => x.strength === 1)).toBe(true);
  });

  it('are the same for the same fish and events', () => {
    const a = new WoundTracker();
    const b = new WoundTracker();
    const { w } = newWorld({ startStage: 5, seed: 9 });
    a.onEvents([ev('caption', 'spawn.fightLost')], w);
    b.onEvents([ev('caption', 'spawn.fightLost')], w);
    expect(a.wounds).toEqual(b.wounds);
  });

  function bearStrike(w: World, offset: number): WoundTracker {
    const t = new WoundTracker();
    const fish = w.body.pos;
    const bear = w.spawn('bear', v3(fish.x, 0.8, 8.6), { state: 'warn', timer: 1, home: v3(fish.x + offset, 0, fish.z) });
    t.update(w);
    bear.state = 'strike';
    t.update(w);
    return t;
  }

  it('a bear swipe that just misses leaves claw marks; a far one does not', () => {
    const near = bearStrike(newWorld({ startStage: 5 }).w, 2.6);
    expect(near.wounds.map((x) => x.kind)).toEqual(['claw']);
    const far = bearStrike(newWorld({ startStage: 5 }).w, 9);
    expect(far.wounds).toEqual([]);
  });

  it('a strike that kills leaves no wound (that is the death beat)', () => {
    const { w } = newWorld({ startStage: 5 });
    w.die('bear');
    expect(bearStrike(w, 0.5).wounds).toEqual([]);
  });

  it('a seal lunge that passes close marks the fish once', () => {
    const { w } = newWorld({ startStage: 3 });
    const t = new WoundTracker();
    const fish = w.body.pos;
    const seal = w.spawn('seal', v3(fish.x + 1.8, fish.y, fish.z), { state: 'warn' });
    t.update(w);
    seal.state = 'lunge';
    t.update(w);
    t.update(w);
    expect(t.wounds.map((x) => x.kind)).toEqual(['bite']);
  });

  it('other fish on the grounds get fixed old marks', () => {
    const a = otherFishLook(42, 'rival');
    expect(otherFishLook(42, 'rival')).toEqual(a);
    expect(a.wearFactor).toBeGreaterThan(0.5);
    expect(a.wearFactor).toBeLessThan(1.5);
    expect(a.wounds.length).toBeLessThanOrEqual(2);
  });
});

describe('gillnets', () => {
  it('a fish that squeezes through a net is grazed; a caught one is not', () => {
    let grazed = 0;
    let caught = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const { w } = newWorld({ startStage: 4, seed });
      // Right in the mesh's slip band: about even odds.
      w.progress.adultSize = w.p.get('return.meshSize');
      const s = w.stage as unknown as { netXs: number[]; prevX: number };
      const x = s.netXs[0]!;
      const gaps = w.live('netGap').filter((g) => Math.abs(g.pos.x - x) < 0.5);
      let z = -20;
      while (gaps.some((g) => Math.abs(g.pos.z - z) < g.radius + 1)) z += 1;
      w.body.pos = v3(x - 0.5, -3, z);
      w.body.yaw = 0;
      s.prevX = w.body.pos.x;
      w.drainEvents();
      const events: SimEvent[] = [];
      for (let i = 0; i < 120 && w.status === 'playing' && w.body.pos.x < x + 1; i++) {
        w.step(intent({ forward: 1 }));
        events.push(...w.drainEvents());
      }
      const graze = events.some((e) => e.type === 'graze' && e.key === 'net');
      if (w.status === 'dead') {
        expect(w.deathCause).toBe('gillnet');
        expect(graze).toBe(false);
        caught++;
      } else if (graze) grazed++;
    }
    expect(grazed).toBeGreaterThan(0);
    expect(caught).toBeGreaterThan(0);
  });
});

describe('death beats', () => {
  const predators: DeathCause[] = ['trout', 'char', 'merganser', 'seal', 'orca', 'shark', 'bird', 'bear'];

  it('play for predators, nets and lines, not for floods, exhaustion or the sea', () => {
    for (const c of [...predators, 'angler', 'gillnet'] as DeathCause[]) expect(deathBeatPlan(c, 'unflinching')).not.toBeNull();
    for (const c of ['scour', 'silt', 'exposed', 'exhaustion', 'noSpawn', 'sea'] as DeathCause[]) expect(deathBeatPlan(c, 'unflinching')).toBeNull();
    expect(deathBeatPlan(null, 'unflinching')).toBeNull();
  });

  it('are short; Documentary fades to black on the strike and shows no blood', () => {
    for (const c of predators) {
      const u = deathBeatPlan(c, 'unflinching')!;
      const d = deathBeatPlan(c, 'documentary')!;
      expect(u.ms).toBeGreaterThanOrEqual(1000);
      expect(u.ms).toBeLessThanOrEqual(2000);
      expect(u.blood).toBe(true);
      expect(d.ms).toBeLessThanOrEqual(u.ms);
      expect(d.blood).toBe(false);
      expect(d.fadeAtMs).not.toBeNull();
      expect(d.fadeAtMs! + d.fadeMs).toBeLessThan(d.ms);
    }
  });

  it('human-caused deaths are no more graphic than natural ones', () => {
    for (const c of ['angler', 'gillnet'] as DeathCause[]) expect(deathBeatPlan(c, 'unflinching')!.blood).toBe(false);
  });
});

describe('post-spawn sequence', () => {
  it('has captions for every card, and Documentary skips the decay close-up', () => {
    for (const sex of ['F', 'M'] as const) {
      const u = endCards(sex, 'unflinching');
      const d = endCards(sex, 'documentary');
      for (const c of [...u, ...d]) expect(CAPTIONS[c.id], c.id).toBeTruthy();
      expect(u.some((c) => c.scene === 'carcass')).toBe(true);
      expect(d.some((c) => c.scene === 'carcass')).toBe(false);
      expect(u.at(-1)!.id).toBe('end.hatch');
    }
    expect(endCards('F', 'unflinching')[0]!.id).toBe('end.spentFemale');
    expect(endCards('M', 'unflinching')[0]!.id).toBe('end.spentMale');
  });

  it('is short: well under the smoke test budget when fast, and a few seconds a card in play', () => {
    const cards = endCards('F', 'unflinching');
    expect(endSequenceMs(cards, true)).toBeLessThan(4000);
    expect(endSequenceMs(cards, false)).toBeLessThan(20000);
  });
});
