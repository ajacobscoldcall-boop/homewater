/**
 * The life route map's layout: one life's route drawn as an illustrated map
 * (gravel nest, nursery lake, river, estuary, a loop at sea for each year
 * there, the coast and nets, the home river with its falls and fork, and back
 * to the spawning grounds), with how far the fish got, the years passing,
 * where things happened and where siblings died.
 *
 * Pure: plain numbers in, plain shapes out (lifeMapView.ts draws them as SVG),
 * so unit tests can check it. The geography is illustrative, not a real river:
 * a lake with the home creek or river feeding it (or its beach), an outlet
 * river down to the sea. Coordinates are in a 1000 × 560 view box.
 */
import type { LifeRecord } from '../sim/lineage';
import { STAGE_IDS, type DeathCause, type Habitat, type Sex, type StageId } from '../sim/types';

export const MAP_W = 1000;
export const MAP_H = 560;

export interface Pt {
  x: number;
  y: number;
}

/** What the map needs to know about a life. */
export interface MapInput {
  habitat: Habitat;
  sex: Sex;
  isJack: boolean | null;
  /** Years at sea, once decided (end of the ocean stage); null draws the usual two, uncertain. */
  oceanYears: number | null;
  /** Years in the lake once the fish has left it; null counts as one. */
  lakeYears: number | null;
  /** The stage the life is at (in progress) or ended in. */
  stage: StageId;
  /** 'playing': about to start `stage`; 'spawned': the life is complete; 'died': the brood died in `stage`. */
  state: 'playing' | 'spawned' | 'died';
  /** Fish of this life that died, in order (the last one ended a 'died' life). */
  deaths: readonly { name: string; stage: StageId; cause: DeathCause; where?: 'lake' }[];
  /** Eggs laid or fertilized, for a life that spawned. */
  eggs?: number | null;
  /** The fish's name, for the marker. */
  name?: string;
}

export type StopId = 'nest' | 'inlet' | 'lake' | 'outlet' | 'fork' | 'falls' | 'rapids' | 'mouth' | 'sea' | 'nets' | 'grounds';

export interface Stop {
  id: StopId;
  label: string;
  at: Pt;
  /** Where the label block starts (its first line's baseline) and how it is anchored. */
  labelAt: Pt;
  anchor: 'start' | 'middle' | 'end';
  /** Lines under the label: when this place was reached, and what happened there (events show on the recap only). */
  sub: { text: string; kind: 'year' | 'event' }[];
}

export interface MapMark {
  kind: 'death' | 'event';
  at: Pt;
  /** Short text: the event, or the sibling and what took it. */
  label: string;
  stage: StageId;
  /** The fish that ended the life (died lives only). */
  final?: boolean;
}

export interface YearLabel {
  at: Pt;
  text: string;
}

export interface TimelinePart {
  id: 'gravel' | 'lake' | 'sea' | 'home';
  label: string;
  /** Length in years (gravel and home are part-years). */
  years: number;
  /** 0..1 of this part already lived. */
  done: number;
  uncertain?: boolean;
}

export interface MapLayout {
  habitat: Habitat;
  /** The whole route as a polyline, nest to grounds. */
  route: Pt[];
  /** Route indices where each stage begins and ends. */
  spans: Record<StageId, [number, number]>;
  /** Route index the fish has reached (the trail is drawn up to here). */
  reached: number;
  /** Where the fish is now, or where the life ended. */
  fish: Pt;
  stops: Stop[];
  marks: MapMark[];
  years: YearLabel[];
  /** One ring per year at sea: centre and radii (drawn under the route). */
  seaLaps: { cx: number; cy: number; rx: number; ry: number }[];
  seaUncertain: boolean;
  timeline: TimelinePart[];
  /** Years from the egg to spawning (or to now). */
  totalYears: number;
}

// ---------- Geography (illustrative) ----------

/** The lake, as an ellipse. */
export const LAKE = { cx: 300, cy: 200, rx: 128, ry: 62 };
/** The coastline: land to the left, sea to the right (an SVG path; the view draws it). */
export const COAST = 'M 590 560 C 640 490 680 455 694 405 C 708 352 748 312 762 258 C 778 196 772 120 792 60 C 798 38 806 18 812 0 L 1000 0 L 1000 560 Z';
/** Scenery rivers that are not on the route (wrong rivers on the coast, the other inlets). */
export const OTHER_RIVERS = [
  'M 620 535 C 590 520 560 515 520 498 C 490 486 470 470 440 470',
  'M 760 262 C 735 250 712 228 690 196 C 672 170 660 150 640 120',
];
/** The wrong branch at the fork. */
export const WRONG_BRANCH = 'M 470 238 C 488 205 500 175 528 150 C 548 132 560 112 576 86';

const P = (x: number, y: number): Pt => ({ x, y });

/** Where each habitat's nest is, and the route from it to the lake. */
const NEST: Record<Habitat, Pt[]> = {
  creek: [P(130, 48), P(136, 74), P(146, 100), P(166, 126), P(196, 148), P(226, 160)],
  river: [P(52, 226), P(92, 214), P(130, 208), P(158, 204), P(176, 202)],
  beach: [P(318, 146), P(312, 152)],
};
/** Where the nest's label block sits, by habitat, clear of the route. */
const NEST_LABEL: Record<Habitat, { at: Pt; anchor: Stop['anchor'] }> = {
  creek: { at: P(146, 44), anchor: 'start' },
  river: { at: P(30, 254), anchor: 'start' },
  beach: { at: P(318, 82), anchor: 'middle' },
};
export const INLETS: Record<Exclude<Habitat, 'beach'>, string> = {
  creek: 'M 126 22 C 130 48 138 80 146 100 C 158 120 176 138 196 148 C 208 154 218 157 226 160',
  river: 'M 0 236 C 40 226 90 214 130 208 C 150 205 166 203 176 202',
};

const OUTLET = P(424, 206);
const FORK = P(470, 238);
const FALLS = P(520, 284);
const RAPIDS = P(578, 330);
const MOUTH = P(690, 408);
const NETS = P(712, 468);
const SEA = { cx: 888, cy: 300, rx: 78, ry: 158 };

/** The river from the lake's outlet down to the mouth, as waypoints. */
export const RIVER_DOWN = [OUTLET, P(448, 222), FORK, P(496, 262), FALLS, P(548, 306), RAPIDS, P(616, 356), P(652, 384), MOUTH];

function ellipse(cx: number, cy: number, rx: number, ry: number, from: number, to: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    out.push(P(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return out;
}

/** The ring for year k (0-based) of `n` at sea: nested, each a little smaller. */
function lap(k: number): { cx: number; cy: number; rx: number; ry: number } {
  const s = 1 - 0.2 * k;
  return { cx: SEA.cx + 6 * k, cy: SEA.cy + 4 * k, rx: SEA.rx * s, ry: SEA.ry * s };
}

/**
 * The way home across the lake: from the outlet, out over open water (a bow
 * through the lake's southern water) to the inlet of the home stream or the home beach.
 */
export function lakeCrossing(to: Pt): Pt[] {
  const from = OUTLET;
  const mid = P((from.x + to.x) / 2, (from.y + to.y) / 2);
  // The curve's middle passes through the lake's southern water, clear of the fry's loop.
  const want = P(LAKE.cx + (mid.x - LAKE.cx) * 0.3, LAKE.cy + LAKE.ry * 0.7);
  const bow = P(2 * want.x - mid.x, 2 * want.y - mid.y);
  const out: Pt[] = [];
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const u = 1 - t;
    out.push(P(u * u * from.x + 2 * u * t * bow.x + t * t * to.x, u * u * from.y + 2 * u * t * bow.y + t * t * to.y));
  }
  return out;
}

/** A point on the lake's fry loop facing a place (the inlet), so the loop starts and ends toward it. */
function loopAngle(to: Pt): number {
  return Math.atan2((to.y - LAKE.cy) / LAKE.ry, (to.x - LAKE.cx) / LAKE.rx);
}

// ---------- Layout ----------

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export function seasonYears(m: Pick<MapInput, 'lakeYears' | 'oceanYears' | 'isJack'>): { lake: number; sea: number; seaKnown: boolean } {
  const lake = clampInt(m.lakeYears ?? 1, 1, 2);
  const seaKnown = m.oceanYears !== null || m.isJack === true;
  const sea = clampInt(m.oceanYears ?? (m.isJack ? 1 : 2), 1, 3);
  return { lake, sea, seaKnown };
}

export function layoutLifeMap(m: MapInput): MapLayout {
  const { lake, sea, seaKnown } = seasonYears(m);
  const route: Pt[] = [];
  const spans = {} as Record<StageId, [number, number]>;
  const push = (pts: Pt[]) => {
    for (const p of pts) {
      const last = route.at(-1);
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.5) route.push(p);
    }
  };
  const span = (stage: StageId, f: () => void) => {
    const start = Math.max(0, route.length - 1);
    f();
    spans[stage] = [start, route.length - 1];
  };
  const nestPath = NEST[m.habitat];
  const nest = nestPath[0]!;
  const inlet = nestPath.at(-1)!;
  // Egg: the nest itself.
  span('egg', () => push([nest]));
  // Fry: down to the lake and round it once a year.
  span('fry', () => {
    push(nestPath);
    const a = loopAngle(inlet);
    for (let y = 0; y < lake; y++) {
      const r = 1 - 0.28 * y;
      push(ellipse(LAKE.cx, LAKE.cy, LAKE.rx * 0.62 * r, LAKE.ry * 0.5 * r, a, a + Math.PI * 2, 28));
    }
  });
  // Smolt: across the lake, out and down the river to the sea.
  span('smolt', () => push(RIVER_DOWN));
  // Ocean: out to the open sea, a loop for each year, and back toward the coast.
  span('ocean', () => {
    push([P(722, 420), P(770, 410)]);
    for (let k = 0; k < sea; k++) {
      const l = lap(k);
      push(ellipse(l.cx, l.cy, l.rx, l.ry, Math.PI * 0.8, Math.PI * 2.8, 40));
    }
    push([P(764, 470)]);
  });
  // Return: the coast and nets, the mouth, up the home river past the falls and the fork, then across the lake to home.
  const crossing = lakeCrossing(inlet);
  span('return', () => push([NETS, ...[...RIVER_DOWN].reverse(), ...crossing]));
  // Spawn: up to the grounds where it hatched.
  span('spawn', () => push([...nestPath].reverse()));

  const nestLabel = NEST_LABEL[m.habitat];
  const L = (x: number, y: number) => P(x, y);
  const stops: Stop[] = [
    { id: 'nest', label: m.habitat === 'beach' ? 'Lake beach: the nest' : m.habitat === 'river' ? 'River gravel: the nest' : 'Creek gravel: the nest', at: nest, labelAt: nestLabel.at, anchor: nestLabel.anchor, sub: [{ text: 'autumn: an egg', kind: 'year' }] },
    { id: 'lake', label: 'Nursery lake', at: P(LAKE.cx, LAKE.cy + LAKE.ry), labelAt: L(LAKE.cx, LAKE.cy + LAKE.ry + 22), anchor: 'middle', sub: [{ text: lake === 2 ? 'spring, years 1 and 2' : 'spring, year 1', kind: 'year' }] },
    { id: 'fork', label: 'The fork', at: FORK, labelAt: L(FORK.x + 10, FORK.y + 2), anchor: 'start', sub: [] },
    { id: 'falls', label: 'The falls', at: FALLS, labelAt: L(FALLS.x - 12, FALLS.y + 4), anchor: 'end', sub: [] },
    { id: 'rapids', label: 'Rapids', at: RAPIDS, labelAt: L(RAPIDS.x - 12, RAPIDS.y + 4), anchor: 'end', sub: [] },
    { id: 'mouth', label: 'Estuary', at: MOUTH, labelAt: L(MOUTH.x - 12, MOUTH.y + 2), anchor: 'end', sub: [{ text: `spring, year ${1 + lake}: to sea`, kind: 'year' }] },
    { id: 'nets', label: 'Coast and nets', at: NETS, labelAt: L(NETS.x + 12, NETS.y + 16), anchor: 'start', sub: [{ text: `summer, year ${1 + lake + sea}${seaKnown ? '' : '?'}: home`, kind: 'year' }] },
    { id: 'sea', label: 'Open sea', at: P(SEA.cx, SEA.cy - SEA.ry), labelAt: L(SEA.cx, SEA.cy - SEA.ry - 34), anchor: 'middle', sub: [] },
  ];
  const stop = (id: StopId) => stops.find((x) => x.id === id)!;

  // How far the fish has got.
  const order = STAGE_IDS.indexOf(m.stage);
  const s0 = spans[m.stage][0];
  const marks: MapMark[] = [];
  const stagePoint = (stage: StageId, id: StopId | number): { i: number; at: Pt } => {
    const [a, b] = spans[stage];
    if (typeof id === 'number') {
      const i = Math.round(a + (b - a) * Math.max(0, Math.min(1, id)));
      return { i, at: route[i]! };
    }
    const target = id === 'nest' || id === 'grounds' ? nest : stops.find((s) => s.id === id)?.at ?? route[a]!;
    let best = a;
    for (let i = a; i <= b; i++) if (dist(route[i]!, target) < dist(route[best]!, target)) best = i;
    return { i: best, at: route[best]! };
  };
  let reached: number;
  if (m.state === 'spawned') reached = route.length - 1;
  else if (m.state === 'died') {
    const last = m.deaths.at(-1);
    reached = last ? deathPoint(last, 0).i : s0;
  } else reached = s0;
  function deathPoint(d: { stage: StageId; cause: DeathCause; where?: 'lake' }, k: number) {
    // On the lake crossing: spread along it.
    if (d.stage === 'return' && d.where === 'lake') {
      const at = crossing[Math.min(crossing.length - 1, 2 + ((k * 3) % Math.max(1, crossing.length - 3)))]!;
      const [a, b] = spans.return;
      let best = a;
      for (let i = a; i <= b; i++) if (dist(route[i]!, at) < dist(route[best]!, at)) best = i;
      return { i: best, at: route[best]! };
    }
    const where = DEATH_PLACE[d.stage]?.(d.cause, k);
    return stagePoint(d.stage, where ?? 0.5);
  }

  // Deaths: spread fish that died at the same place.
  const seen = new Map<string, number>();
  m.deaths.forEach((d, j) => {
    const sameStage = m.deaths.slice(0, j).filter((x) => x.stage === d.stage).length;
    const p = deathPoint(d, sameStage);
    const key = `${Math.round(p.at.x / 8)},${Math.round(p.at.y / 8)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const final = m.state === 'died' && j === m.deaths.length - 1;
    marks.push({ kind: 'death', at: P(p.at.x + (n % 3) * 13 - (n > 0 ? 6 : 0), p.at.y - Math.floor(n / 3) * 13 - (n > 0 ? 8 : 0)), label: `${d.name}: ${DEATH_LABEL[d.cause]}`, stage: d.stage, final });
  });

  // Things that happened, once the fish got past them: a mark on the route, and a line under the nearest place's label.
  const past = (stage: StageId) => (m.state === 'spawned' ? true : STAGE_IDS.indexOf(stage) < order);
  const event = (stage: StageId, at: Pt, label: string, place: StopId) => {
    marks.push({ kind: 'event', at, label, stage });
    stop(place).sub.push({ text: label, kind: 'event' });
  };
  const la = loopAngle(inlet);
  const secondLoop = P(LAKE.cx + LAKE.rx * 0.62 * 0.72 * Math.cos(la), LAKE.cy + LAKE.ry * 0.5 * 0.72 * Math.sin(la));
  if (past('fry') && lake === 2) event('fry', secondLoop, 'Stayed a second year', 'lake');
  // Through the estuary at first light, ready for salt water (the end of the smolt run).
  if (past('smolt')) event('smolt', MOUTH, 'To sea at first light', 'mouth');
  if (past('ocean')) event('ocean', route[spans.ocean[1] - 1]!, m.isJack ? 'Home early, after 1 year: a jack' : `Home after ${sea} years`, 'sea');
  if (past('return')) {
    event('return', FALLS, 'Past the falls', 'falls');
    event('return', crossing[Math.floor(crossing.length / 2)]!, 'Home across the lake', 'lake');
  }
  if (m.state === 'spawned') event('spawn', nest, m.eggs ? `Spawned: ${m.eggs.toLocaleString('en')} eggs` : 'Spawned', 'nest');

  // A label inside the top of each ring at sea.
  const years: YearLabel[] = Array.from({ length: sea }, (_, k) => {
    const l = lap(k);
    return { at: P(l.cx, l.cy - l.ry + 17), text: `sea year ${k + 1}${seaKnown ? '' : '?'}` };
  });

  // The timeline under the map: gravel (a winter), lake years, sea years, the summer home.
  // Share of a part lived: whole stages before the one the fish is at (a died life counts its last stage as half).
  const doneOf = (part: StageId[]) => {
    const first = STAGE_IDS.indexOf(part[0]!);
    if (m.state === 'spawned') return 1;
    const at = order + (m.state === 'died' ? 0.5 : 0);
    return Math.max(0, Math.min(1, (at - first) / part.length));
  };
  const timeline: TimelinePart[] = [
    { id: 'gravel', label: 'Gravel', years: 0.5, done: doneOf(['egg']) },
    { id: 'lake', label: lake === 2 ? 'Lake, 2 years' : 'Lake, 1 year', years: lake, done: doneOf(['fry']) },
    { id: 'sea', label: seaKnown ? `Sea, ${sea} year${sea === 1 ? '' : 's'}` : 'Sea, 2 or 3 years', years: sea, done: doneOf(['smolt', 'ocean']), uncertain: !seaKnown },
    { id: 'home', label: 'Home', years: 0.5, done: doneOf(['return', 'spawn']) },
  ];

  return {
    habitat: m.habitat,
    route,
    spans,
    reached,
    fish: route[reached]!,
    stops,
    marks,
    years,
    seaLaps: Array.from({ length: sea }, (_, k) => lap(k)),
    seaUncertain: !seaKnown,
    timeline,
    totalYears: lake + sea + 1,
  };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Where on its stage's stretch of the route a death is marked: a stop, or a fraction along the stage. */
const DEATH_PLACE: Partial<Record<StageId, (cause: DeathCause, k: number) => StopId | number>> = {
  egg: () => 'nest',
  fry: (_c, k) => 0.55 + 0.1 * (k % 4),
  smolt: (c) => (c === 'merganser' ? 'fork' : c === 'bird' ? 'rapids' : c === 'seal' || c === 'gull' ? 'mouth' : 'falls'),
  // Hunters meet the fish in any season at sea (oceanRoute.ts), so their marks spread along the loops; the unseen
  // roll at the turn of a later year sits in the later loops.
  ocean: (c, k) => (c === 'sea' ? 0.55 + ((k * 0.13) % 0.35) : 0.08 + ((k * 0.17 + (c === 'shark' ? 0.3 : c === 'orca' ? 0.15 : 0)) % 0.8)),
  return: (c) => (c === 'gillnet' || c === 'seal' ? 'nets' : c === 'angler' || c === 'heat' ? 'rapids' : c === 'sea' ? 'mouth' : 'falls'),
  spawn: () => 'grounds',
};

/** Short words for a death on the map (the death screen has the full title). */
export const DEATH_LABEL: Record<DeathCause, string> = {
  silt: 'smothered',
  scour: 'washed out',
  yolk: 'out of yolk',
  exposed: 'seen and eaten',
  char: 'a char',
  merganser: 'a merganser',
  seal: 'a seal',
  sea: 'lost at sea',
  shark: 'a salmon shark',
  angler: 'an angler',
  trout: 'a Dolly Varden',
  bird: 'a bird',
  orca: 'an orca',
  gillnet: 'a net',
  bear: 'a bear',
  exhaustion: 'exhausted',
  noSpawn: 'no spawn',
  heat: 'heat stress',
  gull: 'a gull',
  prespawn: 'died before spawning',
  sculpin: 'a sculpin',
};

// ---------- Inputs ----------

/** The map for a finished life, from its saved record. */
export function mapFromRecord(rec: LifeRecord): MapInput {
  const last = rec.deaths.at(-1);
  return {
    habitat: rec.habitat,
    sex: rec.sex,
    isJack: rec.isJack,
    oceanYears: rec.oceanYears,
    lakeYears: rec.lakeYears ?? null,
    stage: rec.spawned ? 'spawn' : (last?.stage ?? 'egg'),
    state: rec.spawned ? 'spawned' : 'died',
    deaths: rec.deaths,
    eggs: rec.result?.eggs ?? null,
    name: rec.name,
  };
}

/** The map for a life in progress, at the start of its current stage (stage cards). */
export function mapFromLife(
  w: { fish: { habitat: Habitat; sex: Sex; name: string }; progress: { isJack: boolean | null; oceanYears: number | null }; stageId: StageId; checkpoint: { marker: number } },
  deaths: MapInput['deaths'],
  lakeYears: number | null,
): MapInput {
  // A sibling resuming in the second lake year is already into its second year.
  const lake = lakeYears ?? (w.stageId === 'fry' && w.checkpoint.marker >= 2 ? 2 : null);
  return {
    habitat: w.fish.habitat,
    sex: w.fish.sex,
    isJack: w.progress.isJack,
    oceanYears: w.progress.oceanYears,
    lakeYears: lake,
    stage: w.stageId,
    state: 'playing',
    deaths,
    name: w.fish.name,
  };
}
