/**
 * The river's run on screen: a short line for stage cards and the recap,
 * and a chart of run size over the generations (src/sim/population.ts).
 */
import { lineageName, type Lineage } from '../sim/lineage';
import { summarizeChange, type ChangeYear } from '../sim/riverChange';
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

/** What had changed in one year, in a few words for the chart's tooltip. */
function changeWords(p: Params, c: ChangeYear | undefined): string {
  if (!c) return '';
  const out: string[] = [];
  if (c.warming > 0) out.push(`river ${(c.warming * p.get('return.water.yearTemp')).toFixed(1)} °C warmer`);
  if (c.silt) out.push('silt in the gravel');
  if (c.hatchery > 0) out.push(`hatchery strays ${Math.round(c.hatchery * 100)}% of the run`);
  if (c.setNets > 0) out.push(`set nets: ${c.setNets} more line${c.setNets === 1 ? '' : 's'}`);
  return out.length ? ` · ${out.join(' · ')}` : '';
}

function yearTitle(p: Params, y: PopulationYear): string {
  const who = y.generation <= 0 ? 'Before this line' : `Generation ${y.generation}`;
  return `${who}: run ${times(y.run)} typical · fishery took ${Math.round(harvestRate(y) * 100)}% · ${times(y.spawners)} typical run reached the grounds · fry in the lake ${times(y.fry)} typical${changeWords(p, y.change)}`;
}

/** Marks under one bar for a changing river's year: warmer, silt, hatchery strays, set nets (one small row each). */
function changeMarks(p: Params, c: ChangeYear | undefined, cx: number, bw: number, top: number): SVGElement[] {
  if (!c) return [];
  const row = (i: number) => top + 2 + i * 4;
  const out: SVGElement[] = [];
  const warm = c.warming / Math.max(1e-6, p.get('change.warmingMax'));
  if (warm > 0) out.push(s('rect', { x: cx - bw / 2, y: row(0), width: bw, height: 3, class: 'chg-warm', 'fill-opacity': (0.25 + 0.75 * Math.min(1, warm)).toFixed(2) }));
  if (c.silt) out.push(s('rect', { x: cx - bw / 2, y: row(1), width: bw, height: 3, class: 'chg-silt' }));
  if (c.hatchery > 0) out.push(s('rect', { x: cx - bw / 2, y: row(2), width: Math.max(1, bw * Math.min(1, c.hatchery / Math.max(1e-6, p.get('change.hatcheryMax')))), height: 3, class: 'chg-hatch' }));
  if (c.setNets > 0) out.push(s('rect', { x: cx - bw / 2, y: row(3), width: bw, height: 3, class: 'chg-nets' }));
  return out;
}

/** Run size by generation: the share that spawned and the share the fishery took, against the escapement goal. */
export function runChart(p: Params, l: Lineage): HTMLElement {
  const hist = l.population?.history ?? [];
  if (!hist.length) return h('p', { class: 'muted', id: 'run-chart' }, 'No run history was kept for this river.');
  const W = 360;
  const changing = l.riverMode === 'changing';
  // A changing river gets a strip of marks under the bars.
  const H = 96;
  const HM = changing ? H + 18 : H;
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
      ...changeMarks(p, yr.change, cx, bw, H),
      s('rect', { x: cx - step / 2, y: 0, width: step, height: HM, class: 'hit' }, s('title', {}, yearTitle(p, yr))),
    );
  });
  const svg = s(
    'svg',
    {
      viewBox: `0 0 ${W} ${HM}`,
      preserveAspectRatio: 'none',
      class: `spark run-spark${changing ? ' changing' : ''}`,
      role: 'img',
      'aria-label': `Run size by generation: fish that spawned and fish the fishery took${changing ? ", with marks for the river's changes" : ''}`,
    },
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
    changing
      ? h(
          'div',
          { class: 'axis change-key' },
          h('span', { class: 'key' }, h('i', { class: 'k-warm' }), 'warmer ', h('i', { class: 'k-silt' }), 'silt ', h('i', { class: 'k-hatch' }), 'hatchery strays ', h('i', { class: 'k-nets' }), 'set nets'),
        )
      : null,
  );
}

/**
 * A changing river: one plain line of what has changed since the line was
 * founded (null on a healthy river). Years before the line began never changed.
 */
export function changeSinceLine(p: Params, l: Lineage): HTMLElement | null {
  if (l.riverMode !== 'changing') return null;
  const sum = summarizeChange(p, (l.population?.history ?? []).filter((y) => y.generation >= 1).map((y) => y.change));
  const years = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`;
  const parts: string[] = [];
  if (sum) {
    if (sum.warmerC >= 0.05) parts.push(caption('change.sinceWarm', { deg: sum.warmerC.toFixed(1) }) ?? '');
    if (sum.siltYears > 0) parts.push(caption('change.sinceSilt', { n: years(sum.siltYears) }) ?? '');
    if (sum.hatchery > 0) parts.push(caption('change.sinceHatchery', { pct: Math.round(sum.hatchery * 100) }) ?? '');
    if (sum.setNetYears > 0) parts.push(caption('change.sinceNets', { n: years(sum.setNetYears) }) ?? '');
    if (sum.easedYears > 0) parts.push(caption('change.sinceEased', { n: sum.easedYears === 1 ? 'once' : `${sum.easedYears} times` }) ?? '');
  }
  const list = parts.filter(Boolean);
  const gens = sum?.generations ?? 0;
  const text = caption('change.since', {
    name: lineageName(l),
    gens: `${gens} ${gens === 1 ? 'generation' : 'generations'}`,
    list: list.length ? list.join(', ') : (caption('change.sinceNothing') ?? ''),
  });
  return h('p', { class: 'change-since', id: 'change-since' }, h('b', {}, 'Changing river. '), text ?? '');
}

/** The run chart with its heading and note, for the recap and the Lineages page. */
export function runSection(p: Params, l: Lineage): Node[] {
  const since = changeSinceLine(p, l);
  return [
    h('p', { class: 'label' }, "The river's run"),
    ...(since ? [since] : []),
    h('p', { class: 'muted small' }, caption('pop.runHistory') ?? ''),
    runChart(p, l),
    ...(since ? [h('p', { class: 'muted small' }, caption('change.chartKey') ?? '')] : []),
  ];
}
