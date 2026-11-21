/**
 * Spawning grounds: egg thieves. Char hang below the redds eating eggs that
 * drift loose; over a shallow redd a gull picks loose eggs from near the
 * surface (game device, open advisor question).
 *
 * - Advisor: females guard against egg predators like trout. The game uses
 *   char (Dolly Varden), as elsewhere.
 * - While the player's eggs are uncovered, the nearest char comes for them
 *   (a warning while it approaches), then eats at `spawn.char.takeRate` times
 *   the share still uncovered. A charge (burst or E) drives it off for a
 *   while. Over a shallow redd (creek, the beach's shallows) a gull settles on
 *   the water and takes eggs too; it can't be chased, only covering stops it.
 * - Covered eggs are out of reach. The share taken lowers egg survival
 *   (`eggSurvival`), up to `spawn.char.maxTake`.
 * - For the other roles the char are only scenery, feeding round the crowd's
 *   fresh redds.
 */
import type { Entity, Intent } from '../../types';
import { dist, distXZ, v3 } from '../../vec';
import type { World } from '../../world';
import { clamp01, reddOf, st } from './shared';

/** Char on the grounds and where they wait: a little downstream of a redd. */
export function addEggThieves(w: World): void {
  const n = Math.round(w.p.get(`spawn.char.count.${w.fish.habitat}`));
  for (let i = 0; i < n; i++) {
    const x = w.rng.range(6, 34);
    const z = w.rng.range(-4, 3);
    w.spawn('trout', v3(x, w.arena.floor(x, z) + 0.5, z), { radius: 0.5, state: 'idle', value: 0, home: v3(x, 0, z), timer: w.rng.range(0, 4) });
  }
}

/** Water over the player's redd is shallow enough for a gull to pick at loose eggs. */
export function gullReach(w: World, redd: Entity): boolean {
  return w.arena.surfaceY - w.arena.floor(redd.pos.x, redd.pos.z) < w.p.get('spawn.gull.maxDepth');
}

/** Where a char hangs while feeding round the crowd: below a fresh redd, else where it was. */
function idleSpot(w: World, ch: Entity): void {
  let best: Entity | undefined;
  let bd = Infinity;
  for (const r of w.entities) {
    if (!r.alive || r.kind !== 'crowdRedd' || r.state === 'dug') continue;
    const d = distXZ(r.pos, ch.pos) + (w.stageTime - (r.timer || 0)) * 0.2;
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  const down = Math.sign(w.arena.current(ch.pos).x) || 1;
  if (best) ch.home = v3(best.pos.x + down * 1.4, 0, best.pos.z + (ch.id % 2 ? 0.5 : -0.5));
}

/** One step of the char (and the gull). `charges` is the player's charge this step (female role). */
export function stepEggThieves(w: World, intent: Intent, dt: number): void {
  const p = w.p;
  const s = st(w);
  const t = w.stageTime;
  const fish = w.body.pos;
  const redd = s.role === 'female' ? reddOf(w) : undefined;
  const exposed = !!redd && s.spawned && s.burial < 1 && s.eggsTaken < p.get('spawn.char.maxTake');
  const charging = intent.burst || intent.actionPressed;
  const uncovered = 1 - clamp01(s.burial);
  if (exposed) s.exposedFor += dt;
  for (const ch of w.live('trout')) {
    ch.timer -= dt;
    const speed = p.get('spawn.char.speed');
    switch (ch.state) {
      case 'idle': {
        if (ch.timer <= 0) {
          idleSpot(w, ch);
          ch.timer = 4 + (ch.id % 3);
        }
        const h = ch.home ?? ch.pos;
        approach(ch, h.x + 0.4 * Math.sin(t * 0.7 + ch.id), h.z + 0.3 * Math.cos(t * 0.5 + ch.id), speed * 0.35, dt);
        // The nearest char comes for the player's loose eggs.
        if (exposed && redd && s.exposedFor >= p.get('spawn.char.delay') && !w.live('trout').some((o) => o.state === 'warn' || o.state === 'strike')) {
          const nearest = w.live('trout').filter((o) => o.state === 'idle').sort((a, b) => distXZ(a.pos, redd.pos) - distXZ(b.pos, redd.pos))[0];
          if (nearest === ch) {
            ch.state = 'warn';
            w.emit('warning', 'char');
            w.emitOnce('caption', 'spawn.charEggs');
          }
        }
        break;
      }
      case 'warn': {
        if (!exposed || !redd) {
          ch.state = 'idle';
          break;
        }
        // In along the bed, from downstream, to just below the redd.
        const down = Math.sign(w.arena.current(redd.pos).x) || 1;
        if (approach(ch, redd.pos.x + down * 0.8, redd.pos.z, speed, dt) < 0.4) ch.state = 'strike';
        break;
      }
      case 'strike': {
        if (!exposed || !redd) {
          ch.state = 'idle';
          if (redd && s.burial >= 1) w.emitOnce('caption', 'spawn.eggsSafe');
          break;
        }
        const down = Math.sign(w.arena.current(redd.pos).x) || 1;
        approach(ch, redd.pos.x + down * 0.6 + 0.3 * Math.sin(t * 5), redd.pos.z + 0.3 * Math.cos(t * 4), speed * 0.6, dt);
        s.eggsTaken = Math.min(p.get('spawn.char.maxTake'), s.eggsTaken + p.get('spawn.char.takeRate') * uncovered * dt);
        break;
      }
      case 'flee': {
        const h = ch.home ?? ch.pos;
        approach(ch, h.x, h.z, speed * 1.4, dt);
        if (ch.timer <= 0) {
          ch.state = 'idle';
          ch.timer = 0;
        }
        break;
      }
      default:
        ch.state = 'idle';
    }
    // Driven off by a charge close by.
    if ((ch.state === 'warn' || ch.state === 'strike') && charging && dist(ch.pos, fish) < p.get('spawn.chargeRadius')) {
      ch.state = 'flee';
      ch.timer = p.get('spawn.char.chaseTime');
      // Away downstream, out of the way.
      const down = Math.sign(w.arena.current(ch.pos).x) || 1;
      ch.home = v3(Math.max(2, Math.min(38, ch.pos.x + down * 7)), 0, ch.pos.z + (ch.pos.z > fish.z ? 3 : -3));
      w.emitOnce('caption', 'spawn.charDriven');
    }
    ch.pos.x = Math.max(0.5, Math.min(39.5, ch.pos.x));
    ch.pos.z = Math.max(-7.4, Math.min(7.4, ch.pos.z));
    ch.pos.y = w.arena.floor(ch.pos.x, ch.pos.z) + 0.5;
  }

  // The gull, over a shallow redd only.
  if (!redd) return;
  let gull = w.live('gull')[0];
  const reach = gullReach(w, redd);
  if (!gull) {
    if (!exposed || !reach || s.exposedFor < p.get('spawn.gull.delay') || s.gullCame) return;
    s.gullCame = true;
    gull = w.spawn('gull', v3(redd.pos.x + 9, w.arena.surfaceY + 4, redd.pos.z + 4), { radius: 0.6, state: 'warn', timer: p.get('spawn.gull.warning') });
    w.emit('warning', 'gull');
    w.emitOnce('caption', 'spawn.gullEggs');
  }
  gull.timer -= dt;
  const over = v3(redd.pos.x + 0.6, w.arena.surfaceY, redd.pos.z + 0.4);
  if (gull.state === 'warn') {
    // Circling down to the water over the redd.
    const k = clamp01(gull.timer / p.get('spawn.gull.warning'));
    const a = t * 1.6;
    gull.pos = v3(over.x + Math.cos(a) * 3 * k, over.y + 0.05 + 4 * k, over.z + Math.sin(a) * 3 * k);
    gull.yaw = a + Math.PI / 2;
    if (gull.timer <= 0) gull.state = exposed ? 'strike' : 'leave';
  } else if (gull.state === 'strike') {
    gull.pos = v3(over.x + 0.2 * Math.sin(t * 0.8), over.y, over.z);
    s.eggsTaken = Math.min(p.get('spawn.char.maxTake'), s.eggsTaken + p.get('spawn.gull.takeRate') * uncovered * dt);
    if (!exposed) {
      gull.state = 'leave';
      gull.timer = 3;
    }
  } else {
    // Off and away.
    gull.pos = v3(gull.pos.x + 4 * dt, gull.pos.y + 2.5 * dt, gull.pos.z + 1.5 * dt);
    if (gull.pos.y > w.arena.surfaceY + 12) gull.alive = false;
  }
}

/** Move toward (x, z) along the bed at `speed`; returns the distance left. */
function approach(e: Entity, x: number, z: number, speed: number, dt: number): number {
  const dx = x - e.pos.x;
  const dz = z - e.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > 1e-3) {
    const k = Math.min(d, speed * dt) / d;
    e.vel = v3((dx / d) * speed, 0, (dz / d) * speed);
    e.pos.x += dx * k;
    e.pos.z += dz * k;
    if (d > 0.05) e.yaw = Math.atan2(dz, dx);
  } else e.vel = v3();
  return d;
}
