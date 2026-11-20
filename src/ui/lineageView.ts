/**
 * Lineage depth on screen: the drawn family tree, the hall of records, the
 * lineage score line, the trait-drift chart, the extinction screen and the
 * Lineages page. Pure DOM and inline SVG; reads saved lineages only.
 */
import { runSection } from './populationView';
import { yearFavours } from '../sim/genetics';
import { lineageName, type LifeRecord, type Lineage } from '../sim/lineage';
import type { Params } from '../sim/params';
import { hallOfRecords, lineageScore, summarize, traitDrift, traitHistory, yearTally, type RecordHolder } from '../sim/records';
import { TRAIT_IDS, type TraitId } from '../sim/types';
import { h } from './dom';
import { caption, DEATH_TITLES, STAGE_TITLES } from './text';

/** Above this many generations the tree switches to one line per generation. */
const COMPACT_FROM = 12;

const HABITAT_LABEL = { creek: 'creek', river: 'river', beach: 'lake beach' } as const;
const DIFFICULTY_LABEL = { fieldGuide: 'Field guide', wild: 'Wild' } as const;

export const TRAIT_LABELS: Record<TraitId, [string, string, string]> = {
  size: ['Size', 'small', 'large'],
  jack: ['Jack tendency', 'large male', 'jack'],
  runTiming: ['Run timing', 'early', 'late'],
  oceanAge: ['Sea years', 'fewer', 'more'],
  homing: ['Homing', 'wanders', 'faithful'],
  bodyDepth: ['Body', 'streamlined', 'deep'],
  eggTradeoff: ['Eggs', 'many, small', 'few, large'],
};

const YEAR_LABEL: Record<string, string> = {
  'year.warm': 'warm',
  'year.cool': 'cool',
  'year.highWater': 'high water',
  'year.lowWater': 'low water',
  'year.bigRun': 'big run',
  'year.smallRun': 'small run',
  'year.crowded': 'crowded ocean',
  'year.ordinary': 'ordinary',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const sym = (s: 'F' | 'M') => (s === 'F' ? '♀' : '♂');

function kindOf(r: LifeRecord): string {
  if (r.sex === 'F') return 'female';
  if (r.isJack === true) return 'jack';
  if (r.isJack === false) return 'large male';
  return 'male';
}

function fateOf(r: LifeRecord): string {
  if (r.spawned && r.result) return `spawned · ${r.result.eggs.toLocaleString()} eggs · ${r.result.relativeFitness.toFixed(2)}×`;
  const d = r.deaths.at(-1);
  return d ? `${DEATH_TITLES[d.cause].toLowerCase()} · ${STAGE_TITLES[d.stage].toLowerCase()}` : 'no spawn';
}

// ---------- Family tree ----------

/**
 * One node per generation's played fish, top (founder) to bottom (newest).
 * Siblings lost are small marks; offspring not chosen branch off faintly.
 * Long lines switch to compact rows and scroll, opening at the newest.
 */
export function familyTree(l: Lineage): HTMLElement {
  const recs = l.records;
  const lastGen = recs.at(-1)?.generation ?? 0;
  const living = !l.extinct && l.current.generation > lastGen;
  const count = recs.length + (living ? 1 : 0);
  const compact = count > COMPACT_FROM;
  const rows: HTMLElement[] = recs.map((r, i) => {
    const next = recs[i + 1];
    const endsHere = i === recs.length - 1 && !living;
    const cls = ['gen', r.spawned ? 'spawned' : 'died', r.isStray ? 'stray' : '', i === 0 ? 'first' : '', endsHere ? 'last' : '', next?.isStray ? 'branch-end' : ''];
    const lost = r.deaths.filter((_, j) => r.spawned || j < r.deaths.length - 1);
    const unchosen = r.offspring.filter((o) => o.id !== r.chosenId);
    const chosen = r.offspring.find((o) => o.id === r.chosenId);
    return h(
      'li',
      { class: cls.filter(Boolean).join(' '), 'data-gen': String(r.generation) },
      h('span', { class: 'gen-no' }, `G${r.generation}`),
      h('span', { class: 'spine', 'aria-hidden': 'true' }, h('i', { class: 'node' })),
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'who' },
          h('b', {}, r.name),
          h('span', { class: 'sex' }, sym(r.sex)),
          h('span', { class: 'tag' }, kindOf(r)),
          h('span', { class: 'tag' }, HABITAT_LABEL[r.habitat]),
          r.isStray ? h('span', { class: 'tag stray-tag' }, 'stray') : null,
        ),
        h('div', { class: 'fate' }, fateOf(r)),
      ),
      h(
        'div',
        { class: 'lost', title: lost.length ? `Siblings lost: ${lost.map((d) => `${d.name} (${DEATH_TITLES[d.cause].toLowerCase()})`).join(', ')}` : 'No siblings lost' },
        ...lost.map((d) => h('i', { class: 'mark', 'data-cause': d.cause })),
        lost.length && !compact ? h('span', { class: 'lost-n' }, `${lost.length} lost`) : null,
      ),
      r.offspring.length
        ? h(
            'div',
            { class: 'brood', title: `Offspring offered: ${r.offspring.map((o) => `${o.name} ${sym(o.sex)}`).join(', ')}` },
            ...(compact
              ? unchosen.map((o) => h('i', { class: 'kid-dot' }, sym(o.sex)))
              : unchosen.map((o) => h('span', { class: 'kid' }, `${sym(o.sex)} ${o.name}`))),
            chosen && !compact ? h('span', { class: 'kid chosen' }, `→ ${chosen.name}`) : null,
          )
        : h('div', { class: 'brood' }),
    );
  });
  if (living) {
    const c = l.current;
    rows.push(
      h(
        'li',
        { class: `gen living${recs.length ? '' : ' first'}${c.isStray ? ' stray' : ''} last`, 'data-gen': String(c.generation) },
        h('span', { class: 'gen-no' }, `G${c.generation}`),
        h('span', { class: 'spine', 'aria-hidden': 'true' }, h('i', { class: 'node' })),
        h(
          'div',
          { class: 'card' },
          h('div', { class: 'who' }, h('b', {}, c.name), h('span', { class: 'sex' }, sym(c.sex)), h('span', { class: 'tag' }, HABITAT_LABEL[c.habitat]), c.isStray ? h('span', { class: 'tag stray-tag' }, 'stray') : null),
          h('div', { class: 'fate' }, 'living'),
        ),
        h('div', { class: 'lost' }),
        h('div', { class: 'brood' }),
      ),
    );
  }
  const head = l.ancestor ? h('p', { class: 'tree-note muted' }, `Founded by a stray after the ${l.ancestor.name} line died out here.`) : null;
  const list = h('ol', { class: 'ftree-list' }, ...rows);
  const box = h('div', { class: `ftree${compact ? ' compact' : ''}`, id: 'family-tree', 'data-generations': String(count) }, head, rows.length ? list : h('p', { class: 'muted' }, 'No completed lives yet.'));
  // Open long trees at the newest generation once on screen.
  requestAnimationFrame(() => (box.scrollTop = box.scrollHeight));
  return box;
}

// ---------- Score and records ----------

export function scoreLine(p: Params, l: Lineage): HTMLElement {
  const s = lineageScore(p, l);
  return h(
    'p',
    { class: 'score-line', id: 'lineage-score' },
    h('b', {}, `Lineage score ${s.total.toLocaleString()}`),
    ` = ${p.get('lineage.score.perSpawn')} for each generation that spawned (${s.spawns.toLocaleString()}) + ${p.get('lineage.score.perFitness')} × each spawn’s fitness against the average spawner (${s.fitness.toLocaleString()}).`,
  );
}

const holderText = (r: RecordHolder | null, fmt: (v: number) => string) => (r ? `${fmt(r.value)} · ${r.fish ? `${r.fish}, ` : ''}${r.lineage} line` : '—');

/** The hall of records across every lineage in this browser's save. */
export function recordsBlock(p: Params, lineages: readonly Lineage[], highlight?: string): HTMLElement {
  const hall = hallOfRecords(p, lineages);
  const gens = (v: number) => plural(v, 'generation');
  const item = (label: string, r: RecordHolder | null, fmt: (v: number) => string) =>
    h('div', { class: r && r.lineageId === highlight ? 'held' : '' }, h('dt', {}, label), h('dd', {}, holderText(r, fmt)));
  return h(
    'dl',
    { class: 'stats records', id: 'records' },
    item('Longest line', hall.longestLine, gens),
    item('Most eggs in one life', hall.mostEggs, (v) => v.toLocaleString()),
    item('Largest fish', hall.largestFish, (v) => `${v.toFixed(2)}× a typical adult`),
    item('Most jacks in a line', hall.mostJacks, (v) => plural(v, 'jack')),
    item('Best lineage score', hall.bestScore, (v) => v.toLocaleString()),
    item('Longest on Field guide', hall.byDifficulty.fieldGuide, gens),
    item('Longest on Wild', hall.byDifficulty.wild, gens),
  );
}

// ---------- Trait drift chart ----------

const SVG = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...kids: (SVGElement | string)[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const k of kids) el.append(k);
  return el;
}

/** Small multiples: one panel per trait, mean breeding value per generation, on a shared -2..2 scale. */
export function traitChart(l: Lineage): HTMLElement {
  const hist = traitHistory(l);
  if (!hist.length) return h('p', { class: 'muted', id: 'trait-chart' }, 'No trait history was kept for this line.');
  const drift = traitDrift(hist);
  const W = 180;
  const H = 64;
  const pad = 4;
  const lim = 2;
  const g0 = hist[0]?.generation ?? 1;
  const g1 = hist.at(-1)?.generation ?? g0;
  const x = (g: number) => (g1 === g0 ? W / 2 : pad + ((g - g0) / (g1 - g0)) * (W - 2 * pad));
  const y = (v: number) => H / 2 - (Math.max(-lim, Math.min(lim, v)) / lim) * (H / 2 - pad);
  const panels = TRAIT_IDS.map((t) => {
    const [name, lo, hi] = TRAIT_LABELS[t];
    const d = drift[t];
    const pts = hist.map((pt) => `${x(pt.generation).toFixed(1)},${y(pt.mean[t]).toFixed(1)}`).join(' ');
    const last = hist.at(-1);
    const svg = s(
      'svg',
      { viewBox: `0 0 ${W} ${H}`, class: 'spark', role: 'img', 'aria-label': `${name}: mean breeding value by generation` },
      s('line', { x1: 0, x2: W, y1: y(0), y2: y(0), class: 'zero' }),
      hist.length > 1 ? s('polyline', { points: pts, class: 'trend' }) : s('g'),
      ...hist.map((pt) => s('circle', { cx: x(pt.generation), cy: y(pt.mean[t]), r: 6, class: 'hit' }, s('title', {}, `Generation ${pt.generation}: ${pt.mean[t] >= 0 ? '+' : ''}${pt.mean[t].toFixed(2)} (${plural(pt.n, 'fish', 'fish')})`))),
      last ? s('circle', { cx: x(last.generation), cy: y(last.mean[t]), r: 3, class: 'end' }) : s('g'),
    );
    const dir = Math.abs(d) < 0.15 ? 'little change' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} toward ${d > 0 ? hi : lo}`;
    return h('figure', { class: 'trait-panel' }, h('figcaption', {}, h('b', {}, name), h('span', {}, dir)), svg, h('div', { class: 'axis' }, h('span', {}, `G${g0}`), h('span', {}, `${lo} ↓ · ↑ ${hi}`), h('span', {}, `G${g1}`)));
  });
  return h('div', { class: 'trait-chart', id: 'trait-chart' }, ...panels);
}

// ---------- Years ----------

export function yearsStrip(l: Lineage): HTMLElement {
  const tally = yearTally(l.records.map((r) => r.conditions));
  const summary = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${YEAR_LABEL[id] ?? id} ×${n}`)
    .join(' · ');
  return h(
    'div',
    { class: 'years', id: 'years' },
    h('p', { class: 'muted' }, summary || 'No years lived.'),
    h(
      'ol',
      { class: 'year-strip' },
      ...l.records.map((r) => {
        const kinds = yearFavours(r.conditions);
        return h('li', { title: `Generation ${r.generation}: ${kinds.map((k) => YEAR_LABEL[k] ?? k).join(', ')}`, 'data-year': kinds[0] ?? '' }, h('span', {}, `G${r.generation}`), h('b', {}, kinds.map((k) => YEAR_LABEL[k] ?? k).join(', ')));
      }),
    ),
  );
}

// ---------- Line summary (extinction screen and the Lineages page) ----------

function lineFacts(p: Params, l: Lineage): HTMLElement {
  const sm = summarize(l);
  const best = sm.bestFish;
  return h(
    'dl',
    { class: 'stats' },
    h('div', {}, h('dt', {}, 'Lasted'), h('dd', {}, plural(sm.generations, 'generation'))),
    h('div', {}, h('dt', {}, 'Lives that spawned'), h('dd', {}, String(sm.spawned))),
    h('div', {}, h('dt', {}, 'Eggs, all lives'), h('dd', {}, sm.totalEggs.toLocaleString())),
    h('div', {}, h('dt', {}, 'Best fish'), h('dd', {}, best?.result ? `${best.name}, G${best.generation} · ${best.result.relativeFitness.toFixed(2)}×` : '—')),
    h('div', {}, h('dt', {}, 'Siblings lost'), h('dd', {}, String(sm.siblingsLost))),
    h('div', {}, h('dt', {}, 'Score'), h('dd', {}, lineageScore(p, l).total.toLocaleString())),
  );
}

function lineSections(p: Params, l: Lineage): Node[] {
  return [
    lineFacts(p, l),
    h('p', { class: 'label' }, 'How the traits drifted'),
    h('p', { class: 'muted small' }, caption('lineage.traitDrift') ?? ''),
    traitChart(l),
    h('p', { class: 'label' }, 'The years'),
    yearsStrip(l),
    ...runSection(p, l),
    h('p', { class: 'label' }, 'Family tree'),
    familyTree(l),
  ];
}

export interface ExtinctionOptions {
  deathTitle: string;
  science: string;
  archive: readonly Lineage[];
  onNewLineage: () => void;
  onStray: () => void;
  onTitle: () => void;
}

/** The ending screen for a line whose last sibling has died. */
export function extinctionPanel(p: Params, l: Lineage, o: ExtinctionOptions): HTMLElement {
  return h(
    'div',
    { class: 'panel wide line-end', id: 'extinction' },
    h('p', { class: 'label' }, `${DIFFICULTY_LABEL[l.difficulty]} · ${HABITAT_LABEL[l.current.habitat]}`),
    h('h2', {}, `The ${lineageName(l)} line ends`),
    h('p', {}, h('b', {}, o.deathTitle), o.science.startsWith(o.deathTitle) ? o.science.slice(o.deathTitle.length) : ` ${o.science}`),
    h('p', { class: 'muted' }, caption('lineage.extinct') ?? ''),
    ...lineSections(p, l),
    h('p', { class: 'label' }, 'Records'),
    recordsBlock(p, [l, ...o.archive], l.id),
    h('p', { class: 'muted' }, caption('lineage.strayOffer') ?? ''),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'primary', id: 'btn-stray-line', onclick: o.onStray }, 'A stray from this river'),
      h('button', { id: 'btn-new-lineage', onclick: o.onNewLineage }, 'New lineage'),
      h('button', { onclick: o.onTitle }, 'Back to title'),
    ),
  );
}

/** Title screen page: the hall of records and every lineage kept in this save. */
export function lineagesPanel(p: Params, current: Lineage | null, archive: readonly Lineage[], back: () => void): HTMLElement {
  const all = current ? [current, ...archive.filter((a) => a.id !== current.id)] : [...archive];
  const root = h('div', { class: 'panel wide', id: 'lineages' });
  const list = () => {
    root.replaceChildren(
      h('h2', {}, 'Lineages'),
      h('p', { class: 'label' }, 'Hall of records'),
      recordsBlock(p, all),
      h('p', { class: 'label' }, 'Lines'),
      all.length
        ? h(
            'div',
            { class: 'line-list' },
            ...all.map((l, i) => {
              const sm = summarize(l);
              const status = l.extinct ? 'extinct' : l === current ? 'current' : 'set aside';
              return h(
                'button',
                { class: 'choice line-row', 'data-lineage': String(i), onclick: () => detail(l) },
                h('span', { class: 'line-name' }, `The ${sm.name} line`),
                h('span', {}, `${DIFFICULTY_LABEL[l.difficulty]} · ${HABITAT_LABEL[l.current.habitat]} · ${plural(sm.generations, 'generation')} · score ${lineageScore(p, l).total.toLocaleString()} · ${status}`),
              );
            }),
          )
        : h('p', { class: 'muted' }, 'No lineages yet. Start one from the title screen.'),
      h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-lineages-back', onclick: back }, 'Back')),
    );
  };
  const detail = (l: Lineage) => {
    root.replaceChildren(
      h('p', { class: 'label' }, `${DIFFICULTY_LABEL[l.difficulty]} · ${HABITAT_LABEL[l.current.habitat]}${l.extinct ? ' · extinct' : ''}`),
      h('h2', {}, `The ${lineageName(l)} line`),
      ...lineSections(p, l),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: list }, 'All lineages')),
    );
    root.scrollIntoView({ block: 'start' });
  };
  list();
  return root;
}

/** The recap's lineage block: score line and the records this save holds. */
export function recapLineage(p: Params, l: Lineage, archive: readonly Lineage[]): HTMLElement {
  return h('div', { class: 'recap-lineage' }, scoreLine(p, l), ...runSection(p, l), h('p', { class: 'label' }, 'Records'), recordsBlock(p, [l, ...archive], l.id));
}
