/**
 * The life route map drawn as inline SVG (layout in lifeMap.ts): land, the
 * lake, the rivers, the sea with a loop for each year there, the route lived
 * so far, the fish, the years, and marks for what happened and who died
 * where. Drawn in code; no images to download.
 */
import { yearFavours } from '../sim/genetics';
import type { YearConditions } from '../sim/types';
import { h } from './dom';
import { COAST, INLETS, LAKE, layoutLifeMap, MAP_H, MAP_W, OTHER_RIVERS, RIVER_DOWN, WRONG_BRANCH, type MapInput, type MapLayout, type Pt } from './lifeMap';
import { YEAR_LABEL } from './yearWords';
import './recap.css';

const SVG = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kids: (SVGElement | string | null)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const k of kids) if (k !== null) el.append(k);
  return el;
}

const pts = (list: Pt[]) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/** Conifers scattered on the land, fixed so every map looks the same. */
const TREES: Pt[] = [
  [60, 90], [90, 60], [240, 70], [270, 40], [330, 60], [380, 100], [420, 140], [440, 60], [600, 60], [640, 200], [600, 250],
  [40, 330], [100, 300], [160, 350], [230, 300], [300, 330], [360, 300], [420, 330], [470, 380], [380, 430], [300, 470],
  [200, 430], [120, 480], [60, 420], [520, 400], [560, 440], [470, 520], [700, 60], [720, 120], [250, 520], [40, 520],
].map(([x, y]) => ({ x: x!, y: y! }));

export interface LifeMapOptions {
  /** Event labels drawn on the map (the recap); off on stage cards, where only stops and years show. */
  events?: boolean;
  /** The year the life lived through, shown in a corner. */
  conditions?: YearConditions;
  id?: string;
}

export function lifeMap(input: MapInput, o: LifeMapOptions = {}): HTMLElement {
  const m = layoutLifeMap(input);
  const svg = s('svg', { viewBox: `0 0 ${MAP_W} ${MAP_H}`, class: 'life-map-svg', role: 'img', 'aria-label': describe(input, m) });
  svg.append(s('rect', { x: -MAP_W, y: -MAP_H, width: MAP_W * 3, height: MAP_H * 3, class: 'lm-land' }));
  for (const t of TREES) svg.append(s('path', { d: `M ${t.x} ${t.y - 9} L ${t.x + 6} ${t.y + 5} L ${t.x - 6} ${t.y + 5} Z`, class: 'lm-tree' }));
  svg.append(s('path', { d: `${COAST} M 1000 -560 L 2000 -560 L 2000 1120 L 1000 1120 Z M 590 560 L 1000 560 L 1000 1120 L 560 1120 Z M 812 0 L 812 -560 L 1000 -560 L 1000 0 Z`, class: 'lm-sea' }));
  svg.append(s('path', { d: COAST.replace(/ L 1000 0 L 1000 560 Z$/, ''), class: 'lm-coast' }));
  for (const d of OTHER_RIVERS) svg.append(s('path', { d, class: 'lm-river other' }));
  svg.append(s('path', { d: WRONG_BRANCH, class: 'lm-river other' }));
  for (const [hab, d] of Object.entries(INLETS)) svg.append(s('path', { d, class: `lm-river inlet${hab === m.habitat ? ' home' : ''}` }));
  svg.append(s('polyline', { points: pts(RIVER_DOWN), class: 'lm-river main' }));
  svg.append(s('ellipse', { cx: LAKE.cx, cy: LAKE.cy, rx: LAKE.rx, ry: LAKE.ry, class: 'lm-lake' }));
  if (m.habitat === 'beach') svg.append(s('path', { d: 'M 266 146 Q 316 132 366 148', class: 'lm-beach' }));
  // Falls (a step across the river), rapids (ripples) and the nets (a float line).
  const falls = m.stops.find((x) => x.id === 'falls')!.at;
  svg.append(s('path', { d: `M ${falls.x - 9} ${falls.y + 8} L ${falls.x + 9} ${falls.y - 8}`, class: 'lm-falls' }));
  const rap = m.stops.find((x) => x.id === 'rapids')!.at;
  svg.append(s('path', { d: `M ${rap.x - 12} ${rap.y - 4} q 4 -4 8 0 t 8 0 t 8 0`, class: 'lm-rapids' }));
  svg.append(s('path', { d: `M ${rap.x - 4} ${rap.y + 6} q 4 -4 8 0 t 8 0`, class: 'lm-rapids' }));
  const nets = m.stops.find((x) => x.id === 'nets')!.at;
  svg.append(s('path', { d: `M ${nets.x - 26} ${nets.y + 14} L ${nets.x + 26} ${nets.y - 14}`, class: 'lm-net' }));
  for (let i = -2; i <= 2; i++) svg.append(s('circle', { cx: nets.x + i * 11, cy: nets.y - i * 6, r: 2.6, class: 'lm-float' }));
  // A ring for each year at sea.
  for (const l of m.seaLaps) svg.append(s('ellipse', { cx: l.cx, cy: l.cy, rx: l.rx, ry: l.ry, class: `lm-lap${m.seaUncertain ? ' uncertain' : ''}` }));

  // The route: all of it faint, the part lived bold.
  svg.append(s('polyline', { points: pts(m.route), class: 'lm-route ahead' }));
  svg.append(s('polyline', { points: pts(m.route.slice(0, m.reached + 1)), class: 'lm-route done', 'data-reached': m.reached }));

  // Stops, with when the fish got there and (on the recap) what happened there.
  for (const st of m.stops) {
    svg.append(s('circle', { cx: st.at.x, cy: st.at.y, r: 4, class: `lm-stop stop-${st.id}` }));
    const lines = st.sub.filter((x) => o.events || x.kind === 'year');
    const t = s('text', { x: st.labelAt.x, y: st.labelAt.y, 'text-anchor': st.anchor, class: 'lm-stop-label', 'data-stop': st.id }, st.label);
    for (const line of lines) t.append(s('tspan', { x: st.labelAt.x, dy: '1.25em', class: line.kind === 'year' ? 'lm-sub-year' : 'lm-sub-event' }, line.text));
    svg.append(t);
  }
  for (const y of m.years) svg.append(s('text', { x: y.at.x, y: y.at.y, 'text-anchor': 'middle', class: 'lm-year' }, y.text));

  // What happened, and who died where.
  const marks = s('g', { class: 'lm-marks' });
  for (const k of m.marks) {
    if (k.kind === 'death') {
      const g = s('g', { class: `lm-death${k.final ? ' final' : ''}`, 'data-stage': k.stage, transform: `translate(${k.at.x.toFixed(1)} ${k.at.y.toFixed(1)})` }, s('title', {}, k.label));
      g.append(s('circle', { r: 7, class: 'lm-death-bg' }), s('path', { d: 'M -3.6 -3.6 L 3.6 3.6 M 3.6 -3.6 L -3.6 3.6', class: 'lm-death-x' }));
      marks.append(g);
    } else if (o.events) {
      marks.append(s('path', { d: 'M 0 -6 L 6 0 L 0 6 L -6 0 Z', class: 'lm-event-dot', 'data-stage': k.stage, transform: `translate(${k.at.x.toFixed(1)} ${k.at.y.toFixed(1)})` }, s('title', {}, k.label)));
    }
  }
  svg.append(marks);

  // The fish, heading along the route.
  const a = m.route[Math.max(0, m.reached - 1)]!;
  const b = m.route[Math.min(m.route.length - 1, m.reached + 1)]!;
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const ended = input.state !== 'playing';
  svg.append(
    s(
      'g',
      { class: `lm-fish${input.state === 'died' ? ' dead' : ''}`, transform: `translate(${m.fish.x.toFixed(1)} ${m.fish.y.toFixed(1)}) rotate(${ang.toFixed(0)})` },
      s('title', {}, input.name ? `${input.name}${ended ? '' : ': here now'}` : 'The fish'),
      s('path', { d: 'M 13 0 C 8 -6 -4 -6 -8 -1 L -15 -6 L -13 0 L -15 6 L -8 1 C -4 6 8 6 13 0 Z', class: 'lm-fish-body' }),
      s('circle', { cx: 8, cy: -1.2, r: 1.3, class: 'lm-fish-eye' }),
    ),
  );
  if (o.conditions) {
    const kinds = yearFavours(o.conditions).map((k) => YEAR_LABEL[k] ?? k);
    svg.append(s('text', { x: 18, y: MAP_H - 18, class: 'lm-year-kind' }, `The year: ${kinds.join(', ')}`));
  }

  return h('figure', { class: 'life-map', id: o.id ?? 'life-map', 'data-state': input.state, 'data-stage': input.stage }, h('div', { class: 'lm-frame' }, svg), timeline(m));
}

/** The years as a bar: gravel, lake, sea and home, filled as far as the fish has lived. */
function timeline(m: MapLayout): HTMLElement {
  const total = m.timeline.reduce((t, x) => t + x.years, 0);
  return h(
    'div',
    { class: 'lm-timeline', 'aria-hidden': 'true' },
    ...m.timeline.map((p) =>
      h(
        'div',
        { class: `lm-part part-${p.id}${p.uncertain ? ' uncertain' : ''}`, style: `flex-grow:${(p.years / total).toFixed(3)}` },
        h('span', { class: 'lm-fill', style: `width:${Math.round(p.done * 100)}%` }),
        h('b', {}, p.label),
      ),
    ),
    h('span', { class: 'lm-total' }, `About ${m.totalYears} years from egg to spawning`),
  );
}

function describe(input: MapInput, m: MapLayout): string {
  const home = input.habitat === 'beach' ? 'a lake beach' : `a ${input.habitat}`;
  const deaths = m.marks.filter((k) => k.kind === 'death').map((k) => k.label);
  const where = input.state === 'spawned' ? 'The fish came home and spawned.' : input.state === 'died' ? 'The life ended on the way.' : `The fish is at the ${input.stage} stage.`;
  return `Route map of one life: from ${home}, through the lake, down the river to the sea and home. ${where}${deaths.length ? ` Lost: ${deaths.join('; ')}.` : ''}`;
}
