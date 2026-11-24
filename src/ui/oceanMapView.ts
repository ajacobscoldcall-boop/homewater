/** Draws the ocean map (oceanMap.ts) as inline SVG for the ocean's time skips. */
import type { OceanView } from '../sim/stages/ocean';
import { h } from './dom';
import { OCEAN_MAP_H, OCEAN_MAP_W, oceanMapLayout, smoothPath, type MapPt } from './oceanMap';
import './oceanMap.css';

const SVG = 'http://www.w3.org/2000/svg';
function s(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}
const pts = (p: readonly MapPt[]) => p.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');

/** A key for what the map shows, so the HUD redraws it only when that changes. */
export const oceanMapKey = (v: OceanView): string => `${v.index}|${v.years}|${v.plan.length}|${v.warmth}|${v.food.toFixed(2)}|${v.moment === 'reveal'}`;

export function oceanMapNodes(v: OceanView): Node[] {
  const L = oceanMapLayout(v.plan, v.index, v.years, v.food, v.warmth, v.crowded);
  const svg = s('svg', { viewBox: `0 0 ${OCEAN_MAP_W} ${OCEAN_MAP_H}`, class: 'om-svg', role: 'img', 'aria-label': `${L.title}. ${L.sub}` });
  svg.append(s('rect', { x: 0, y: 0, width: OCEAN_MAP_W, height: OCEAN_MAP_H, class: 'om-sea' }));
  svg.append(s('polygon', { points: pts([...L.coast, { x: 330, y: 200 }, { x: 330, y: -10 }]), class: 'om-land' }));
  // The route so far is solid, the rest dashed.
  const at = L.stops.findIndex((x) => x.state === 'now');
  const split = at < 0 ? L.route.length : at + 2;
  svg.append(s('path', { d: smoothPath(L.route), class: 'om-route' }));
  svg.append(s('path', { d: smoothPath(L.route.slice(0, split)), class: 'om-done-route' }));
  if (L.undecided) svg.append(s('ellipse', { cx: 150, cy: 100, rx: 62, ry: 42, class: 'om-maybe' }));
  svg.append(s('circle', { cx: L.mouth.x, cy: L.mouth.y, r: 3.5, class: 'om-mouth' }));
  for (const st of L.stops) {
    const c = s('circle', { cx: st.x, cy: st.y, r: st.state === 'now' ? 6 : 3.5, class: `om-stop om-${st.state} om-${st.plan.season}` });
    svg.append(c);
  }
  const now = L.stops.find((x) => x.state === 'now');
  if (now) svg.append(s('circle', { cx: now.x, cy: now.y, r: 10, class: 'om-ring' }));
  if (L.undecided) {
    const t = s('text', { x: 150, y: 104, class: 'om-maybe-label', 'text-anchor': 'middle' });
    t.textContent = '2 or 3 years?';
    svg.append(t);
  }
  return [svg, h('div', { class: 'om-title' }, L.title), h('div', { class: 'om-sub' }, L.sub)];
}
