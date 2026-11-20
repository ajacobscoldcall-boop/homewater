/**
 * The river's run on screen: a short line for stage cards and the recap,
 * and a chart of run size over the generations (src/sim/population.ts).
 */
import type { Lineage } from '../sim/lineage';
import type { Params } from '../sim/params';
import { escapementGoal, harvestRate, populationCaptions, recapCaptions, type PopulationYear } from '../sim/population';
import type { YearConditions } from '../sim/types';
import { h } from './dom';
import { caption } from './text';

const SVG = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kids: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const k of kids) el.append(k);
  return el;
}

const text = (ids: string[]): string =>
  ids
    .map((id) => caption(id) ?? '')
    .filter(Boolean)
    .join(' ');

/** The population line on a stage card (the lake on the fry card, the fishery on the return card), or null. */
export function populationCardLine(p: Params, stage: string, c: YearConditions): HTMLElement | null {
  const t = text(populationCaptions(p, stage, c));
  return t ? h('p', { class: 'muted', id: 'pop-line' }, t) : null;
}

/** The recap's population lines: the lake this life grew up in and the fishery it came home through. */
export function populationRecapLine(p: Params, c: YearConditions): HTMLElement | null {
  const t = text(recapCaptions(p, c));
  return t ? h('p', { class: 'muted', id: 'pop-recap' }, t) : null;
}

const times = (v: number) => `${v.toFixed(v < 1 ? 2 : 1)}×`;

function yearTitle(y: PopulationYear): string {
  const who = y.generation <= 0 ? 'Before this line' : `Generation ${y.generation}`;
  return `${who}: run ${times(y.run)} typical · fishery took ${Math.round(harvestRate(y) * 100)}% · ${times(y.spawners)} typical run reached the grounds · fry in the lake ${times(y.fry)} typical`;
}

/** Run size by generation: the share that spawned and the share the fishery took, against the escapement goal. */
export function runChart(p: Params, l: Lineage): HTMLElement {
  const hist = l.population?.history ?? [];
  if (!hist.length) return h('p', { class: 'muted', id: 'run-chart' }, 'No run history was kept for this river.');
  const W = 360;
  const H = 96;
  const pad = 4;
  const top = Math.max(1.5, ...hist.map((y) => y.run)) * 1.05;
  const step = (W - 2 * pad) / hist.length;
  const bw = Math.max(2, Math.min(18, step * 0.72));
  const y = (v: number) => H - pad - (v / top) * (H - 2 * pad);
  const goal = escapementGoal(p);
  const bars = hist.map((yr, i) => {
    const cx = pad + step * (i + 0.5);
    const x = cx - bw / 2;
    const before = yr.generation <= 0;
    const now = yr.generation === l.generation;
    return s(
      'g',
      { class: `run-bar${before ? ' before' : ''}${now ? ' now' : ''}` },
      s('rect', { x, y: y(yr.spawners), width: bw, height: Math.max(0.5, y(0) - y(yr.spawners)), class: 'spawners' }),
      yr.catch > 0 ? s('rect', { x, y: y(yr.run), width: bw, height: Math.max(0.5, y(yr.spawners) - y(yr.run)), class: 'catch' }) : s('g'),
      s('rect', { x: cx - step / 2, y: 0, width: step, height: H, class: 'hit' }, s('title', {}, yearTitle(yr))),
    );
  });
  const svg = s(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'spark run-spark', role: 'img', 'aria-label': 'Run size by generation: fish that spawned and fish the fishery took' },
    s('line', { x1: 0, x2: W, y1: y(1), y2: y(1), class: 'zero' }),
    s('line', { x1: 0, x2: W, y1: y(goal), y2: y(goal), class: 'goal' }),
    ...bars,
  );
  const first = hist[0]?.generation ?? 1;
  const last = hist.at(-1)?.generation ?? first;
  const label = (g: number) => (g <= 0 ? 'before' : `G${g}`);
  const latest = hist.at(-1);
  return h(
    'figure',
    { class: 'run-chart', id: 'run-chart' },
    h(
      'figcaption',
      {},
      h('b', {}, 'Run size'),
      latest ? h('span', {}, `this year ${times(latest.run)} typical · fishery ${Math.round(harvestRate(latest) * 100)}%`) : null,
    ),
    svg,
    h(
      'div',
      { class: 'axis' },
      h('span', {}, label(first)),
      h('span', { class: 'key' }, h('i', { class: 'k-spawners' }), 'spawned ', h('i', { class: 'k-catch' }), 'caught ', h('i', { class: 'k-goal' }), 'let through to spawn ', h('i', { class: 'k-typical' }), 'typical run'),
      h('span', {}, label(last)),
    ),
  );
}

/** The run chart with its heading and note, for the recap and the Lineages page. */
export function runSection(p: Params, l: Lineage): Node[] {
  return [h('p', { class: 'label' }, "The river's run"), h('p', { class: 'muted small' }, caption('pop.runHistory') ?? ''), runChart(p, l)];
}
