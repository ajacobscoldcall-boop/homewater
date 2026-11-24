/**
 * The ocean map (Track 2.6), pure layout: the route of the years at sea drawn
 * as a small schematic of the North Pacific. The river mouth and coast are on
 * the right; the first summer runs along the coast, the first autumn over the
 * shelf edge, then one loop offshore for each year (spring north, summer and
 * autumn west, winter far out to the south-west), and the turn for home runs
 * back to the mouth. Shown during the ocean's time skips (oceanMapView.ts).
 * The geography is schematic, a game device, not a real track.
 */
import type { SeasonPlan, Warmth } from '../sim/stages/oceanRoute';

export const OCEAN_MAP_W = 320;
export const OCEAN_MAP_H = 190;

export interface MapPt {
  x: number;
  y: number;
}

export interface MapStop extends MapPt {
  /** 'done' behind the fish, 'now' the season being played or coming up, 'next' still ahead. */
  state: 'done' | 'now' | 'next';
  label: string;
  plan: SeasonPlan;
}

export interface OceanMapLayout {
  mouth: MapPt;
  /** The coast as a polyline (land to its right). */
  coast: MapPt[];
  stops: MapStop[];
  /** The route through every stop, from the mouth. */
  route: MapPt[];
  /** The years at sea are not decided yet: a faint "2 or 3 years" loop is drawn. */
  undecided: boolean;
  /** One line under the map: year, season and place. */
  title: string;
  /** What the season holds: food and warmth. */
  sub: string;
}

const MOUTH: MapPt = { x: 286, y: 70 };
const COAST: MapPt[] = [
  { x: 250, y: -10 },
  { x: 262, y: 30 },
  { x: 286, y: 62 },
  { x: 292, y: 78 },
  { x: 300, y: 120 },
  { x: 316, y: 200 },
];

const PLACE_LABEL: Record<SeasonPlan['place'], string> = {
  coast: 'along the coast',
  shelf: 'the shelf edge',
  offshore: 'open North Pacific',
  gyre: 'far out',
  homeward: 'turning for home',
};

/** Where a season sits on the map: the first year near the coast, later loops further out each year. */
export function stopAt(plan: SeasonPlan): MapPt {
  if (plan.place === 'coast') return { x: 262, y: 92 };
  if (plan.place === 'shelf') return { x: 226, y: 104 };
  if (plan.place === 'homeward') return { x: 240, y: 66 };
  // A loop per year, further west each year: spring north, summer west, autumn south-west, winter far south.
  const k = Math.max(0, plan.year - 1);
  const cx = 160 - 26 * Math.min(k, 2);
  const cy = 96;
  const r = 40 + 4 * Math.min(k, 2);
  const a = { spring: 0.5, summer: 1, autumn: 1.25, winter: 1.5 }[plan.season] * Math.PI;
  return { x: cx + Math.cos(a) * r * 1.35, y: cy - Math.sin(a) * r * 0.95 };
}

/** A smooth SVG path through the points (Catmull-Rom as cubic Beziers). */
export function smoothPath(p: readonly MapPt[]): string {
  if (p.length < 2) return '';
  const f = (n: number) => n.toFixed(1);
  let d = `M ${f(p[0]!.x)} ${f(p[0]!.y)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)]!;
    const b = p[i]!;
    const c = p[i + 1]!;
    const e = p[Math.min(p.length - 1, i + 2)]!;
    d += ` C ${f(b.x + (c.x - a.x) / 6)} ${f(b.y + (c.y - a.y) / 6)} ${f(c.x - (e.x - b.x) / 6)} ${f(c.y - (e.y - b.y) / 6)} ${f(c.x)} ${f(c.y)}`;
  }
  return d;
}

export function foodWord(food: number): string {
  return food >= 1.05 ? 'plenty of food' : food >= 0.85 ? 'food as usual' : food >= 0.6 ? 'thin food' : 'little food';
}

export function oceanMapLayout(plan: readonly SeasonPlan[], index: number, years: number | null, food: number, warmth: Warmth, crowded: boolean): OceanMapLayout {
  const stops: MapStop[] = plan.map((p, i) => ({ ...stopAt(p), state: i < index ? 'done' : i === index ? 'now' : 'next', label: `${p.season}`, plan: p }));
  const route: MapPt[] = [MOUTH, ...stops.map((s) => ({ x: s.x, y: s.y }))];
  if (years !== null) route.push(MOUTH);
  const now = plan[Math.min(index, plan.length - 1)];
  const title = now ? `Year ${now.year} at sea · ${now.season} · ${PLACE_LABEL[now.place]}` : '';
  const bits = [now?.place === 'homeward' ? '' : foodWord(food), warmth === 'warm' ? 'a warm year' : warmth === 'cool' ? 'a cool year' : '', crowded && now && (now.season === 'summer' || now.season === 'autumn') ? 'pink salmon about' : ''];
  return { mouth: MOUTH, coast: COAST, stops, route, undecided: years === null, title, sub: bits.filter(Boolean).join(' · ') };
}
