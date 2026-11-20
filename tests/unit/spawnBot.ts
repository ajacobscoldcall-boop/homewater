/** A simple, sensible spawning-stage bot, shared by the spawning tests. */
import { spawnState } from '../../src/sim/stages/spawn';
import type { Habitat } from '../../src/sim/types';
import type { World } from '../../src/sim/world';
import { intent, newWorld, run, steerTo } from './helpers';

const SEC = 60;

/** Play a spawning stage with a simple, sensible bot. Returns the outcome. */
export function playSpawn(
  role: 'female' | 'largeMale' | 'jack',
  seed: number,
  habitat: Habitat = 'creek',
  opts: {
    leave?: boolean;
    bury?: boolean;
    runSize?: number;
    /** Stop guarding once the eggs are covered. */
    idleAfterBurial?: boolean;
    /** Use this world instead of a new one. */
    world?: World;
    /** Called every step before the bot acts. */
    each?: (w: World) => void;
  } = {},
): { status: string; cause: string | null; detail?: string; w: World } {
  const sex = role === 'female' ? { sex: 'F' as const } : role === 'jack' ? { sex: 'M' as const, preset: 'jack' as const } : { sex: 'M' as const };
  const w = opts.world ?? newWorld({ ...sex, seed, startStage: 5, habitat }).w;
  if (opts.runSize !== undefined) (w as unknown as { conditions: { runSize: number } }).conditions.runSize = opts.runSize;
  if (role === 'largeMale' || opts.runSize !== undefined) {
    if (role === 'largeMale') {
      w.progress.isJack = false;
      w.progress.adultSize = 0.9;
    }
    w.startStage(5, 0);
  }
  const leave = opts.leave ?? true;
  const bury = opts.bury ?? true;
  const bot = (ww: World) => {
    opts.each?.(ww);
    const s = spawnState(ww);
    const bear = ww.live('bear').find((b) => b.state === 'warn');
    if (bear?.home && Math.hypot(bear.home.x - ww.body.pos.x, bear.home.z - ww.body.pos.z) < 3.5) {
      return steerTo(ww, ww.body.pos.x + (bear.home.x > ww.body.pos.x ? -6 : 6), ww.body.pos.z > 0 ? -2 : 2, { burst: true });
    }
    const near = (x: number, z: number) => Math.hypot(x - ww.body.pos.x, z - ww.body.pos.z);
    if (role === 'female') {
      const redd = ww.live('redd')[0];
      const rival = ww.live('rival').find((r) => r.state === 'approach');
      const guarding = s?.spawned && (!bury || (s?.burial ?? 0) >= 1);
      if (guarding && opts.idleAfterBurial) return intent({ hold: true });
      if (rival && guarding) return steerTo(ww, rival.pos.x, rival.pos.z, { burst: near(rival.pos.x, rival.pos.z) < 2 });
      const best = ww.live('gravelPatch').sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
      const target = redd ?? best;
      if (!target) return intent();
      const d = near(target.pos.x, target.pos.z);
      if (d > 1.0) return steerTo(ww, target.pos.x, target.pos.z, { forward: Math.max(0.5, Math.min(1, d / 3)) });
      // Dig, then wait over the redd, then cover the eggs (unless told not to).
      const act = !s?.spawned || bury;
      return intent({ action: act, hold: true });
    }
    let female = ww.live('female')[0];
    if (role === 'largeMale' && s) {
      const second = s.secondId ? ww.live('female').find((f) => f.id === s.secondId) : undefined;
      const first = ww.live('female').find((f) => f.id === s.mateId);
      female = s.phase === 'seeking' || (s.phase === 'decide' && second && leave) ? second : first;
    }
    if (!female) return intent();
    if (role === 'largeMale') {
      const rival = ww.live('rival').find((r) => r.state === 'approach');
      if (rival && (s?.phase === 'first' || s?.phase === 'seeking')) {
        // Meet him side-on, between him and the female.
        const tx = (rival.pos.x + female.pos.x) / 2;
        const tz = (rival.pos.z + female.pos.z) / 2 + 1.5;
        const close = near(rival.pos.x, rival.pos.z) < 2;
        return steerTo(ww, close ? rival.pos.x : tx, close ? rival.pos.z : tz, { burst: close });
      }
      const d = near(female.pos.x, female.pos.z);
      return d > 1.8 ? steerTo(ww, female.pos.x - 1, female.pos.z) : intent({ hold: true });
    }
    // Jack: claim a spot (charging out a holder), dart in during the opening.
    const open = (s?.windowUntil ?? 0) > ww.stageTime;
    if (open) return steerTo(ww, female.pos.x, female.pos.z, { burst: true, actionPressed: near(female.pos.x, female.pos.z) < 2.2 });
    const spots = s?.spots ?? [];
    const mine = s?.owners.indexOf(0) ?? -1;
    const target = spots[mine >= 0 ? mine : 0];
    if (!target) return intent();
    const d = near(target.x, target.z);
    return d > 0.8 ? steerTo(ww, target.x, target.z, { burst: mine < 0 && d < 1.3 }) : intent({ hold: true, burst: mine < 0 });
  };
  run(w, 200 * SEC, bot);
  return { status: w.status, cause: w.deathCause, detail: w.spawnResult?.detail, w };
}

