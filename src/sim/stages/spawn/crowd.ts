/**
 * Spawning grounds: the crowd. Other sockeye spawning around the player, as a
 * light simulation that scales with the run.
 *
 * - How many: `crowdCount` from this year's run and the spawners the fishery
 *   let through (`crowdDensity`): dozens in a typical year, many more in a big
 *   run, a handful in a small one.
 * - Females pick a site (the good gravel patches first, a few redds round the
 *   edge of each; then open bed), dig, spawn with a male beside them, cover
 *   and guard. A late female may dig over a redd whose female is spent.
 * - Large males court a digging female; unpaired males cruise and challenge
 *   paired ones. Fights are quick and settled by `fightWinChance` (size); the
 *   loser flees and cruises again.
 * - Jacks lurk behind paired females and dart in when the males clash.
 * - Every fish loses strength (senescence), fades, dies and becomes a carcass
 *   on the bed that drifts with the current until it lodges. Fresh fish keep
 *   arriving from downstream, fewer late in the season.
 *
 * The crowd ties into the rules the stage already has (see the callers):
 * rival females and males come from the crowd, its density sets how often
 * they come, the bear chooses among the crowd fish near it, a jack gets
 * openings when crowd males fight near him, and good gravel is contested.
 *
 * Pure and deterministic: all chance goes through `w.rng`.
 */
import type { Params } from '../../params';
import { targetCatch } from '../../population';
import type { Entity, EntityKind, Habitat, Vec3, YearConditions } from '../../types';
import { distXZ, v3 } from '../../vec';
import type { World } from '../../world';
import { fightWinChance } from './largeMale';
import { clamp01, spawnRival, st } from './shared';

export type CrowdRole = 'F' | 'M' | 'J';

/** One crowd fish's own numbers (its entity carries position, state and size). */
export interface CrowdFish {
  role: CrowdRole;
  /** Strength left, 0..1; it only falls. */
  vig: number;
  /** Strength lost per second. */
  rate: number;
  /** Female: the male courting her. Male: the female he courts or challenges for. Jack: the female he lurks by. 0 = none. */
  mate: number;
  /** Female: her redd's entity id (0 = none yet). Male in a fight: his opponent. */
  redd: number;
}

export interface CrowdState {
  /** Spawners on the grounds relative to a typical year (crowdDensity). */
  rel: number;
  /** How many fish the grounds held at the start. */
  start: number;
  /** Seconds to the next arrival from downstream, and to the next challenge among the males. */
  arrive: number;
  fight: number;
  /** Per crowd fish, by entity id. */
  fish: Record<string, CrowdFish>;
  /** Open redd sites not yet taken: [x, z, quality]. */
  sites: [number, number, number][];
  /** Times a crowd female dug over another's redd (shown in the debug report). */
  dugOver: number;
  /** Jack role: the crowd female where an opening is (0 = none). */
  openId: number;
}

export const CROWD_FISH: ReadonlySet<EntityKind> = new Set(['crowdFemale', 'crowdMale', 'crowdJack']);
const KIND: Record<CrowdRole, EntityKind> = { F: 'crowdFemale', M: 'crowdMale', J: 'crowdJack' };
const CARCASS_STATE: Record<CrowdRole, string> = { F: 'female', M: 'male', J: 'jack' };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Spawners on the grounds this year, relative to a typical year: the run,
 * thinned by what the fishery took (`spawn.crowd.escapementWeight` sets how
 * much the catch counts; with no population the run alone).
 */
export function crowdDensity(p: Params, c: YearConditions): number {
  const run = Math.max(0.05, c.runSize);
  const typicalHarvest = targetCatch(p, 1);
  const h = c.harvestRate ?? typicalHarvest;
  const escapement = (run * (1 - h)) / Math.max(0.05, 1 - typicalHarvest);
  const k = clamp01(p.get('spawn.crowd.escapementWeight'));
  return Math.pow(run, 1 - k) * Math.pow(Math.max(0.05, escapement), k);
}

/** How many other spawners share the grounds with the player. */
export function crowdCount(p: Params, density: number): number {
  const n = Math.round(p.get('spawn.crowd.typical') * Math.pow(Math.max(0, density), p.get('spawn.crowd.exponent')));
  return clamp(n, p.get('spawn.crowd.min'), p.get('spawn.crowd.max'));
}

/** How much more often rival females come to a redd on gravel of this quality: good patches are contested. */
export function patchContest(p: Params, quality: number): number {
  return clamp(1 + p.get('spawn.crowd.patchContest') * (quality - p.get('spawn.crowd.patchContestRef')), 0.5, 2);
}

/** The crowd's state, or null before it exists (other stages, tests building state by hand). */
export const crowdOf = (w: World): CrowdState | null => (st(w) as { crowd?: CrowdState }).crowd ?? null;

/** Crowd fish's role, for the bear and the renderer. */
export function crowdRole(kind: EntityKind): CrowdRole | null {
  return kind === 'crowdFemale' ? 'F' : kind === 'crowdMale' ? 'M' : kind === 'crowdJack' ? 'J' : null;
}

/** Crowd density for the rules that read it (1 when the crowd is missing). */
export const crowdRel = (w: World): number => crowdOf(w)?.rel ?? w.conditions.runSize;

const bedY = (w: World, x: number, z: number) => w.arena.floor(x, z) + 0.6;
const zRange = (h: Habitat): [number, number] => (h === 'beach' ? [-1.5, 5.5] : [-5.5, 4.5]);

/** Redd sites: a few round the edge of each gravel patch (best first), then open bed. Keeps clear of the player's own places. */
function buildSites(w: World, avoid: readonly Vec3[]): [number, number, number][] {
  const p = w.p;
  const spacing = p.get('spawn.crowd.reddSpacing');
  const patches = w.live('gravelPatch').sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const sites: [number, number, number][] = [];
  const clear = (x: number, z: number, gap: number) => avoid.every((a) => Math.hypot(a.x - x, a.z - z) > gap) && sites.every((s) => Math.hypot(s[0] - x, s[1] - z) > spacing);
  const per = Math.round(p.get('spawn.crowd.patchMaxRedds'));
  for (const g of patches) {
    // Round the edge, leaving the middle of each patch open for the player.
    const a0 = w.rng.range(0, Math.PI * 2);
    for (let i = 0; i < per; i++) {
      const a = a0 + (i * Math.PI * 2) / Math.max(1, per) + w.rng.range(-0.4, 0.4);
      const x = g.pos.x + Math.cos(a) * (g.radius + 0.45);
      const z = g.pos.z + Math.sin(a) * (g.radius + 0.45);
      // Never inside another patch that overlaps this one.
      const offPatches = patches.every((o) => Math.hypot(o.pos.x - x, o.pos.z - z) > o.radius + 0.3);
      if (offPatches && clear(x, z, 2.5)) sites.push([x, z, g.value ?? 0.5]);
    }
  }
  // Open bed between the patches, in a loose grid.
  const [z0, z1] = zRange(w.fish.habitat);
  const open: [number, number, number][] = [];
  for (let x = 2.5; x < 38; x += spacing * 1.25) {
    for (let z = z0; z <= z1; z += spacing * 1.2) {
      const jx = x + w.rng.range(-0.5, 0.5);
      const jz = z + w.rng.range(-0.4, 0.4);
      if (patches.some((g) => Math.hypot(g.pos.x - jx, g.pos.z - jz) < g.radius + 0.6)) continue;
      open.push([jx, jz, p.get('spawn.crowd.openQuality')]);
    }
  }
  // Shuffle the open bed so fish do not fill it row by row.
  for (let i = open.length - 1; i > 0; i--) {
    const j = w.rng.int(0, i + 1);
    [open[i], open[j]] = [open[j]!, open[i]!];
  }
  for (const s of open) if (clear(s[0], s[1], 2.5)) sites.push(s);
  return sites;
}

function addFish(w: World, c: CrowdState, role: CrowdRole, pos: Vec3, vig: number, state: string): Entity {
  const p = w.p;
  const size = role === 'J' ? p.get('spawn.crowd.jackSize') * w.rng.range(0.85, 1.15) : role === 'M' ? Math.max(0.55, p.get('spawn.rivalSizeMean') + w.rng.normal(0, p.get('spawn.rivalSizeSd'))) : w.rng.range(0.85, 1.05);
  const e = w.spawn(KIND[role], pos, { radius: 0.5, state, value: size, yaw: w.rng.range(-0.4, 0.4) });
  const rate = p.get('spawn.senescenceRate') * p.get('spawn.crowd.senescenceScale') * w.rng.range(0.7, 1.3);
  c.fish[String(e.id)] = { role, vig, rate, mate: 0, redd: 0 };
  return e;
}

function rollRole(w: World): CrowdRole {
  const s = st(w);
  if (w.rng.chance(w.p.get('spawn.crowd.femaleShare'))) return 'F';
  return w.rng.chance(s.jackFraction) ? 'J' : 'M';
}

/** A female takes the next free site and starts digging there (a redd begun at `progress`). */
function settleFemale(w: World, c: CrowdState, f: Entity, rec: CrowdFish, progress: number): void {
  // Never on top of the player's own redd.
  const own = w.live('redd');
  const gap = w.p.get('spawn.crowd.reddSpacing');
  let site = c.sites.shift();
  while (site && own.some((r) => Math.hypot(r.pos.x - site![0], r.pos.z - site![1]) < gap)) site = c.sites.shift();
  if (!site) {
    f.state = 'fade';
    return;
  }
  f.home = v3(site[0], 0, site[1]);
  const redd = w.spawn('crowdRedd', v3(site[0], w.arena.floor(site[0], site[1]), site[1]), { radius: 1, state: 'dug', value: progress });
  rec.redd = redd.id;
}

/** Fill the grounds at the start of the stage. `avoid` are the player's places (start, mate, patches' middles). */
export function initCrowd(w: World, avoid: readonly Vec3[]): CrowdState {
  const p = w.p;
  const s = st(w);
  const rel = crowdDensity(p, w.conditions);
  const n = crowdCount(p, rel);
  const c: CrowdState = { rel, start: n, arrive: 0, fight: 0, fish: {}, sites: [], dugOver: 0, openId: 0 };
  (s as { crowd?: CrowdState }).crowd = c;
  c.sites = buildSites(w, avoid);
  const [z0, z1] = zRange(w.fish.habitat);
  const vMin = p.get('spawn.crowd.startVigourMin');
  const females: Entity[] = [];
  const males: Entity[] = [];
  const jacks: Entity[] = [];
  for (let i = 0; i < n; i++) {
    const role = rollRole(w);
    const x = w.rng.range(3, 37);
    const z = w.rng.range(z0, z1);
    const vig = w.rng.range(vMin, 1);
    const e = addFish(w, c, role, v3(x, bedY(w, x, z), z), vig, role === 'F' ? 'dig' : role === 'M' ? 'cruise' : 'lurk');
    (role === 'F' ? females : role === 'M' ? males : jacks).push(e);
  }
  // Females: the freshest are still digging; earlier ones have spawned and guard a covered redd; the oldest are fading.
  const fadeAt = p.get('spawn.crowd.fadeAt');
  for (const f of females) {
    const rec = c.fish[String(f.id)]!;
    const fresh = clamp01((rec.vig - p.get('spawn.crowd.guardBelow')) / Math.max(0.01, 1 - p.get('spawn.crowd.guardBelow')));
    settleFemale(w, c, f, rec, fresh > 0 ? 1 - fresh : 1);
    if (!f.home) continue;
    f.pos = v3(f.home.x, bedY(w, f.home.x, f.home.z), f.home.z);
    const redd = c.fish[String(f.id)]!.redd;
    const r = w.entities.find((e) => e.id === redd);
    if (fresh <= 0 && r) {
      f.state = 'guard';
      r.state = 'buried';
      r.value = 1;
    } else f.timer = (1 - fresh) * p.get('spawn.crowd.digTime');
    if (rec.vig < fadeAt) {
      f.state = 'fade';
      if (r) r.state = r.value === 1 ? 'left' : r.state;
    }
  }
  // Males court the digging females first; the rest cruise.
  const digging = females.filter((f) => f.state === 'dig');
  for (const m of males) {
    const rec = c.fish[String(m.id)]!;
    if (rec.vig < fadeAt) {
      m.state = 'fade';
      continue;
    }
    const f = digging.shift();
    if (f) pair(c, m, f);
    m.home = v3(w.rng.range(3, 37), 0, w.rng.range(z0, z1));
  }
  for (const j of jacks) {
    const rec = c.fish[String(j.id)]!;
    const f = females.length ? females[w.rng.int(0, females.length)] : undefined;
    rec.mate = f?.id ?? 0;
    if (rec.vig < fadeAt) j.state = 'fade';
  }
  // Some have already died: carcasses on the bed, more in a big run.
  const dead = Math.round(n * p.get('spawn.crowd.carcassStart'));
  for (let i = 0; i < dead; i++) {
    const x = w.rng.range(1, 39);
    const z = w.rng.range(z0 - 1.5, z1 + 1.5);
    addCarcass(w, rollRole(w), v3(x, 0, z), w.rng.range(0.8, 1.05), p.get('spawn.crowd.carcassDriftTime'));
  }
  c.arrive = p.get('spawn.crowd.arrivalInterval') / Math.max(0.2, rel);
  c.fight = p.get('spawn.crowd.fightInterval') * w.rng.range(0.3, 1) / Math.max(0.25, rel);
  return c;
}

function pair(c: CrowdState, m: Entity, f: Entity): void {
  const mr = c.fish[String(m.id)];
  const fr = c.fish[String(f.id)];
  if (!mr || !fr) return;
  if (fr.mate) {
    const old = c.fish[String(fr.mate)];
    if (old && old.mate === f.id) old.mate = 0;
  }
  mr.mate = f.id;
  fr.mate = m.id;
  m.state = 'court';
}

export function addCarcass(w: World, role: CrowdRole, at: Vec3, size: number, timer = 0): Entity {
  const e = w.spawn('crowdCarcass', v3(at.x, w.arena.floor(at.x, at.z), at.z), { radius: size, state: CARCASS_STATE[role], value: size, timer, yaw: w.rng.range(0, Math.PI * 2) });
  // Keep the bed from filling up: the oldest wash away.
  const max = p0(w, 'spawn.crowd.maxCarcasses');
  let count = 0;
  let oldest: Entity | undefined;
  for (const o of w.entities) {
    if (!o.alive || o.kind !== 'crowdCarcass') continue;
    count++;
    if (!oldest || o.id < oldest.id) oldest = o;
  }
  if (count > max && oldest) oldest.alive = false;
  return e;
}

const p0 = (w: World, id: string) => w.p.get(id);

/** Remove a crowd fish from the crowd (taken by a bear, or turned into a rival for the player). Its redd, if any, is left. */
export function releaseCrowdFish(w: World, e: Entity): void {
  const c = crowdOf(w);
  e.alive = false;
  if (!c) return;
  const rec = c.fish[String(e.id)];
  if (rec) {
    const r = rec.redd ? w.entities.find((o) => o.id === rec.redd && o.alive) : undefined;
    if (r && rec.role === 'F') r.state = 'left';
    const mate = rec.mate ? c.fish[String(rec.mate)] : undefined;
    if (mate && mate.mate === e.id) mate.mate = 0;
  }
  delete c.fish[String(e.id)];
  if (c.openId === e.id) c.openId = 0;
}

/**
 * Take a crowd fish to become one of the player's rivals: the nearest unpaired
 * male (cruising) or seeking female to `near`. Returns its position and size, or null.
 */
export function takeFromCrowd(w: World, role: 'F' | 'M', near: Vec3): { pos: Vec3; size: number } | null {
  const c = crowdOf(w);
  if (!c) return null;
  let best: Entity | undefined;
  let bd = Infinity;
  for (const e of w.entities) {
    if (!e.alive) continue;
    const ok = role === 'M' ? e.kind === 'crowdMale' && (e.state === 'cruise' || e.state === 'flee') : e.kind === 'crowdFemale' && e.state === 'seek';
    if (!ok) continue;
    const d = distXZ(e.pos, near);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (!best) return null;
  const out = { pos: { ...best.pos }, size: best.value ?? 1 };
  if (role === 'F') {
    // Her site goes back to the pool.
    const rec = c.fish[String(best.id)];
    if (best.home && rec && !rec.redd) c.sites.unshift([best.home.x, best.home.z, w.p.get('spawn.crowd.openQuality')]);
  }
  releaseCrowdFish(w, best);
  return out;
}

/** Is there a crowd redd in use within `r` of this point (a female can't start hers on top of it)? */
export function crowdReddNear(w: World, at: Vec3, r: number): boolean {
  for (const e of w.entities) if (e.alive && e.kind === 'crowdRedd' && e.state !== 'left' && distXZ(e.pos, at) < r) return true;
  return false;
}

/** Where the jack's crowd opening is, if there is one. */
export function crowdOpening(w: World): Entity | null {
  const c = crowdOf(w);
  if (!c?.openId || w.stageTime >= st(w).windowUntil) return null;
  return w.entities.find((e) => e.id === c.openId && e.alive) ?? null;
}

/** Steer a crowd fish toward (x, z) at `speed`, turning its yaw with it. */
function moveTo(e: Entity, x: number, z: number, speed: number, dt: number): number {
  const dx = x - e.pos.x;
  const dz = z - e.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > 1e-3) {
    const k = Math.min(d, speed * dt) / d;
    e.vel.x = (dx / d) * speed;
    e.vel.z = (dz / d) * speed;
    e.pos.x += dx * k;
    e.pos.z += dz * k;
    if (d > 0.05) e.yaw = Math.atan2(dz, dx);
  } else {
    e.vel.x = 0;
    e.vel.z = 0;
  }
  return d;
}

/** One step of the crowd. Runs after the player's role, so rivals it hands over are placed this step. */
export function stepCrowd(w: World, dt: number): void {
  const c = crowdOf(w);
  if (!c) return;
  const p = w.p;
  const s = st(w);
  const t = w.stageTime;
  const byId = new Map<number, Entity>();
  const fish: Entity[] = [];
  const carcasses: Entity[] = [];
  for (const e of w.entities) {
    if (!e.alive) continue;
    if (CROWD_FISH.has(e.kind)) {
      byId.set(e.id, e);
      fish.push(e);
    } else if (e.kind === 'crowdRedd') byId.set(e.id, e);
    else if (e.kind === 'crowdCarcass') carcasses.push(e);
  }
  const fadeAt = p.get('spawn.crowd.fadeAt');
  const end = p.get('spawn.senescenceEnd');
  const cur = w.arena.current(v3(20, -1.5, 0));
  const curX = cur.x;
  const mainFemale = w.live('female')[0];
  // Fish holding station face into the current (on the still beach, each keeps its own heading).
  const facing = (e: Entity) => (Math.hypot(cur.x, cur.z) > 0.3 ? Math.atan2(-cur.z, -cur.x) : (e.id * 2.399) % (Math.PI * 2));

  for (const e of fish) {
    const rec = c.fish[String(e.id)];
    if (!rec) continue;
    rec.vig -= rec.rate * dt;
    if (rec.vig <= end) {
      // Spent: it dies where it is.
      releaseCrowdFish(w, e);
      addCarcass(w, rec.role, e.pos, e.value ?? 1);
      continue;
    }
    if (rec.vig < fadeAt && e.state !== 'fade' && e.state !== 'fight') {
      if (rec.role === 'F' && rec.redd) {
        const r = byId.get(rec.redd);
        if (r) r.state = 'left';
      }
      const mate = rec.mate ? c.fish[String(rec.mate)] : undefined;
      if (mate && mate.mate === e.id) mate.mate = 0;
      rec.mate = 0;
      e.state = 'fade';
    }
    const sway = Math.sin(t * 1.3 + e.id * 1.7);
    switch (e.state) {
      case 'seek': {
        // A newcomer swims up to her site; a spent female's redd there is dug over.
        const h = e.home;
        if (!h) {
          e.state = 'fade';
          break;
        }
        if (moveTo(e, h.x, h.z, p.get('spawn.crowd.swimSpeed'), dt) < 0.3) {
          e.state = 'dig';
          e.timer = 0;
        }
        break;
      }
      case 'dig': {
        const h = e.home ?? e.pos;
        moveTo(e, h.x + 0.25 * sway, h.z, 1, dt);
        e.yaw = facing(e) + 0.15 * sway;
        const r = byId.get(rec.redd);
        e.timer += dt;
        const digTime = p.get('spawn.crowd.digTime');
        if (r) r.value = clamp01(e.timer / digTime);
        if (e.timer >= digTime) {
          const m = rec.mate ? byId.get(rec.mate) : undefined;
          if (m && m.state === 'court' && distXZ(m.pos, e.pos) < 2.5) {
            e.state = 'spawn';
            e.timer = 0;
          }
        }
        break;
      }
      case 'spawn': {
        // The pair side by side over the redd for a moment; then she covers the eggs and guards.
        e.timer += dt;
        e.yaw = facing(e);
        if (e.timer >= p.get('spawn.crowd.spawnTime')) {
          e.state = 'guard';
          const r = byId.get(rec.redd);
          if (r) {
            r.state = 'buried';
            r.value = 1;
            r.timer = t;
          }
          const m = rec.mate ? byId.get(rec.mate) : undefined;
          const mr = m ? c.fish[String(m.id)] : undefined;
          if (m && mr) {
            mr.mate = 0;
            m.state = 'cruise';
            m.home = v3(w.rng.range(3, 37), 0, m.pos.z);
          }
          rec.mate = 0;
        }
        break;
      }
      case 'guard': {
        const h = e.home ?? e.pos;
        moveTo(e, h.x + 0.5 * sway, h.z + 0.4 * Math.cos(t * 0.9 + e.id), 0.8, dt);
        e.yaw = facing(e) + 0.25 * sway;
        break;
      }
      case 'court': {
        const f = rec.mate ? byId.get(rec.mate) : undefined;
        if (!f || (f.state !== 'dig' && f.state !== 'spawn')) {
          rec.mate = 0;
          e.state = 'cruise';
          break;
        }
        // Beside her and a little behind, quivering.
        const side = e.id % 2 ? 1 : -1;
        const fy = facing(f);
        moveTo(e, f.pos.x - Math.cos(fy) * 0.6 - Math.sin(fy) * side * 0.7, f.pos.z - Math.sin(fy) * 0.6 + Math.cos(fy) * side * 0.7, 2.2, dt);
        e.yaw = fy + 0.1 * sway;
        break;
      }
      case 'challenge': {
        const f = rec.mate ? byId.get(rec.mate) : undefined;
        const holder = f ? byId.get(c.fish[String(f.id)]?.mate ?? 0) : undefined;
        if (!f || !holder || holder.state !== 'court') {
          // She is free: court her himself, or go back to cruising.
          if (f && (f.state === 'dig' || f.state === 'spawn') && !c.fish[String(f.id)]?.mate) pair(c, e, f);
          else {
            e.state = 'cruise';
            rec.mate = 0;
          }
          break;
        }
        if (moveTo(e, holder.pos.x, holder.pos.z, p.get('spawn.crowd.chargeSpeed'), dt) < 1.4) {
          e.state = 'fight';
          holder.state = 'fight';
          e.timer = holder.timer = p.get('spawn.crowd.fightTime');
          rec.redd = holder.id;
          const hr = c.fish[String(holder.id)];
          if (hr) hr.redd = e.id;
          openForJacks(w, c, f, fish);
        }
        break;
      }
      case 'fight': {
        const other = byId.get(rec.redd);
        const orec = other ? c.fish[String(other.id)] : undefined;
        if (!other || !orec || other.state !== 'fight') {
          e.state = 'cruise';
          rec.redd = 0;
          break;
        }
        e.pos.x += Math.sin(t * 9 + e.id) * 2 * dt;
        e.pos.z += Math.cos(t * 7 + e.id) * 2 * dt;
        e.yaw = Math.atan2(other.pos.z - e.pos.z, other.pos.x - e.pos.x) + 1.2 * Math.sin(t * 6 + e.id);
        e.timer -= dt;
        if (e.timer <= 0 && e.id < other.id) {
          // Settled mostly by size (the same rule as the player's fights, side-on and timing even).
          const wins = w.rng.chance(fightWinChance(p, e.value ?? 1, other.value ?? 1, 0.5, 0.5));
          const [winner, loser] = wins ? [e, other] : [other, e];
          const wr = c.fish[String(winner.id)]!;
          const lr = c.fish[String(loser.id)]!;
          // The female they fought over: the challenger's target, which the holder courted.
          const fId = rec.mate || orec.mate;
          const f = byId.get(fId);
          wr.redd = 0;
          lr.redd = 0;
          lr.mate = 0;
          loser.state = 'flee';
          loser.timer = p.get('spawn.crowd.fleeTime');
          loser.home = v3(loser.pos.x + (loser.pos.x > 20 ? -8 : 8), 0, -loser.pos.z * 0.5);
          if (f && (f.state === 'dig' || f.state === 'spawn')) pair(c, winner, f);
          else {
            winner.state = 'cruise';
            wr.mate = 0;
          }
        }
        break;
      }
      case 'flee': {
        e.timer -= dt;
        const h = e.home ?? e.pos;
        moveTo(e, h.x, h.z, p.get('spawn.crowd.chargeSpeed'), dt);
        if (e.timer <= 0) e.state = 'cruise';
        break;
      }
      case 'cruise': {
        // Unpaired males roam the bed, and take any digging female who has no male.
        const h = e.home ?? (e.home = v3(w.rng.range(3, 37), 0, e.pos.z));
        if (moveTo(e, h.x, h.z, p.get('spawn.crowd.swimSpeed'), dt) < 0.5) e.home = v3(w.rng.range(3, 37), 0, w.rng.range(...zRange(w.fish.habitat)));
        if (((t * 60) | 0) % 30 === e.id % 30) {
          for (const f of fish) {
            if (f.kind !== 'crowdFemale' || (f.state !== 'dig' && f.state !== 'spawn')) continue;
            const fr = c.fish[String(f.id)];
            if (fr && !fr.mate && distXZ(f.pos, e.pos) < 8) {
              pair(c, e, f);
              break;
            }
          }
        }
        break;
      }
      case 'lurk': {
        // A jack keeps low a little way behind a pair, waiting.
        const f = rec.mate ? byId.get(rec.mate) : undefined;
        if (!f || f.state === 'fade') {
          const options = fish.filter((o) => o.kind === 'crowdFemale' && (o.state === 'dig' || o.state === 'spawn'));
          rec.mate = options.length ? options[w.rng.int(0, options.length)]!.id : 0;
          if (!rec.mate) moveTo(e, e.pos.x + sway, e.pos.z, 0.6, dt);
          break;
        }
        const side = e.id % 2 ? 1 : -1;
        const fy = facing(f);
        moveTo(e, f.pos.x - Math.cos(fy) * 3 + 0.4 * sway, f.pos.z - Math.sin(fy) * 3 + side * 2.2, 1.4, dt);
        e.yaw = fy;
        break;
      }
      case 'dart': {
        const f = rec.mate ? byId.get(rec.mate) : undefined;
        e.timer -= dt;
        if (f) moveTo(e, f.pos.x - 0.4, f.pos.z, p.get('spawn.jackAISpeed'), dt);
        // At the player's opening, a crowd jack that gets there first takes it.
        if (f && c.openId === f.id && t < s.windowUntil && distXZ(e.pos, f.pos) < 1.2) {
          s.windowUntil = t;
          s.jacksBeat += 1;
          w.emit('caption', 'spawn.jackBeaten');
        }
        if (e.timer <= 0 || !f) e.state = 'lurk';
        break;
      }
      case 'fade':
      default: {
        // Spent fish drift slowly with the current, keeping to the bed.
        e.pos.x += (curX * 0.15 + 0.12 * sway) * dt;
        e.pos.z += 0.1 * Math.cos(t * 0.5 + e.id) * dt;
        break;
      }
    }
    e.pos.x = clamp(e.pos.x, 0.5, 39.5);
    e.pos.z = clamp(e.pos.z, -7.4, 7.4);
    e.pos.y = bedY(w, e.pos.x, e.pos.z) - (e.state === 'fade' ? 0.25 : 0);
  }

  // Challenges: now and then an unpaired male takes on one that is courting (not beside the player's own female).
  c.fight -= dt;
  if (c.fight <= 0) {
    c.fight = (p.get('spawn.crowd.fightInterval') * w.rng.range(0.6, 1.4)) / Math.max(0.25, c.rel);
    const cruisers = fish.filter((e) => e.kind === 'crowdMale' && e.state === 'cruise');
    if (cruisers.length) {
      const m = cruisers[w.rng.int(0, cruisers.length)]!;
      let target: Entity | undefined;
      let bd = p.get('spawn.crowd.challengeRange');
      for (const f of fish) {
        if (f.kind !== 'crowdFemale' || (f.state !== 'dig' && f.state !== 'spawn')) continue;
        const holder = byId.get(c.fish[String(f.id)]?.mate ?? 0);
        if (!holder || holder.state !== 'court') continue;
        if (mainFemale && distXZ(mainFemale.pos, f.pos) < 5) continue;
        const d = distXZ(f.pos, m.pos);
        if (d < bd) {
          bd = d;
          target = f;
        }
      }
      if (target) {
        m.state = 'challenge';
        c.fish[String(m.id)]!.mate = target.id;
      }
    }
  }

  // Newcomers from downstream, fewer late in the season.
  const season = clamp01(t / p.get('spawn.duration'));
  const want = c.start * (1 - p.get('spawn.crowd.arrivalLate') * season);
  c.arrive -= dt;
  if (c.arrive <= 0) {
    c.arrive = (p.get('spawn.crowd.arrivalInterval') * w.rng.range(0.6, 1.4)) / Math.max(0.2, c.rel);
    if (fish.length < want && fish.length < p.get('spawn.crowd.max')) {
      const role = rollRole(w);
      const [z0, z1] = zRange(w.fish.habitat);
      const z = w.rng.range(z0, z1);
      const x = curX < 0 ? 0.8 : curX > 0 ? 39.2 : w.rng.chance(0.5) ? 0.8 : 39.2;
      const e = addFish(w, c, role, v3(x, bedY(w, x, z), z), w.rng.range(0.85, 1), role === 'F' ? 'seek' : role === 'M' ? 'cruise' : 'lurk');
      if (role === 'F') {
        const rec = c.fish[String(e.id)]!;
        // A late female may take a spent female's redd and dig it over.
        const own = w.live('redd');
        const left = w.entities.find((r) => r.alive && r.kind === 'crowdRedd' && r.state === 'left' && own.every((o) => distXZ(o.pos, r.pos) > p.get('spawn.crowd.reddSpacing')));
        if (left && w.rng.chance(p.get('spawn.crowd.digOverChance'))) {
          left.state = 'dug';
          left.value = 0;
          rec.redd = left.id;
          e.home = v3(left.pos.x, 0, left.pos.z);
          c.dugOver += 1;
        } else settleFemale(w, c, e, rec, 0);
        if (e.state !== 'fade') e.state = 'seek';
      }
    }
  }

  // Carcasses drift along the bed with the current for a while, then lodge; any carried past the end wash away.
  const drift = p.get('spawn.crowd.carcassDrift');
  const driftTime = p.get('spawn.crowd.carcassDriftTime');
  const ashore = p.get('spawn.crowd.carcassAshore');
  const edge = p.get('spawn.crowd.carcassEdge');
  for (const k of carcasses) {
    k.timer += dt;
    const toEdge = w.fish.habitat === 'beach' ? 1 : Math.sign(k.pos.z) || 1;
    if (k.timer < driftTime && k.pos.z * toEdge < edge) {
      const slow = 1 - k.timer / driftTime;
      k.pos.x += curX * drift * dt * slow;
      // Rolling along the bed, they wash toward the edges and lodge there.
      k.pos.z += (cur.z * drift + toEdge * ashore) * dt * slow;
      k.yaw += 0.05 * dt * (k.id % 2 ? 1 : -1);
    }
    if (k.pos.x < 0.2 || k.pos.x > 39.8) k.alive = false;
    k.pos.y = w.arena.floor(k.pos.x, k.pos.z);
  }
}

/** Two crowd males clash beside `f`: jacks lurking there dart in, and a player jack close by gets an opening. */
function openForJacks(w: World, c: CrowdState, f: Entity, fish: readonly Entity[]): void {
  const p = w.p;
  const s = st(w);
  for (const j of fish) {
    if (j.kind !== 'crowdJack' || j.state !== 'lurk') continue;
    const jr = c.fish[String(j.id)];
    if (jr?.mate === f.id && w.rng.chance(p.get('spawn.crowd.jackDart'))) {
      j.state = 'dart';
      j.timer = p.get('spawn.jackWindow') * 0.6;
    }
  }
  if (s.role !== 'jack' || w.stageTime < s.windowUntil) return;
  if (distXZ(w.body.pos, f.pos) > p.get('spawn.crowd.jackOpenRange')) return;
  c.openId = f.id;
  s.windowUntil = w.stageTime + p.get('spawn.jackWindow');
  w.emit('warning', 'opening');
  w.emitOnce('caption', 'spawn.crowdOpening');
}

/** Bear's view of the crowd: fish within `spawn.crowd.bearView` along the bank of the bear, on its side of the stream. */
export function crowdInBearView(w: World, e: Entity, bear: Entity, side: number): boolean {
  if (Math.abs(e.pos.x - bear.pos.x) > w.p.get('spawn.crowd.bearView')) return false;
  return w.fish.habitat === 'beach' || e.pos.z * side > -w.p.get('spawn.crowd.bearAcross');
}

/** Counts for tests, the debug report and the renderer's caption. */
export function crowdCounts(w: World): { female: number; male: number; jack: number; carcass: number; redd: number } {
  const out = { female: 0, male: 0, jack: 0, carcass: 0, redd: 0 };
  for (const e of w.entities) {
    if (!e.alive) continue;
    if (e.kind === 'crowdFemale') out.female++;
    else if (e.kind === 'crowdMale') out.male++;
    else if (e.kind === 'crowdJack') out.jack++;
    else if (e.kind === 'crowdCarcass') out.carcass++;
    else if (e.kind === 'crowdRedd') out.redd++;
  }
  return out;
}

/** A crowd fish's strength (for the renderer's fading look), 1 when unknown. */
export function crowdVigour(w: World, id: number): number {
  return crowdOf(w)?.fish[String(id)]?.vig ?? 1;
}

/** A rival for the player: out of the crowd when one is free (an unpaired male, a female still looking for a site), else from the edge. */
export function rivalFromCrowd(w: World, towards: Entity | undefined, role: 'F' | 'M', size: number): void {
  const got = takeFromCrowd(w, role, towards?.pos ?? w.body.pos);
  spawnRival(w, towards, role === 'M' && got ? got.size : size, got?.pos);
}

/** A male for the player's redd (female role): an unpaired crowd male when there is one. Returns his size and where he comes from. */
export function maleFromCrowd(w: World, near: Vec3): { pos: Vec3; size: number } | null {
  return takeFromCrowd(w, 'M', near);
}
