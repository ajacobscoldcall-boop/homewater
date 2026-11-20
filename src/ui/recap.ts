/**
 * The recap of a finished life, in pages: Your life (the route map), Your
 * river (the year, the run and the fishery, and why every year favours
 * different fish), Your line (score, family tree, trait drift, records), and
 * the choice of the next generation (portraits, trait bars against the
 * river's average, what the coming year means for each, and on Field guide a
 * suggestion). Built from the saved record, so it reopens after a reload.
 */
import { fishPortrait, portraitRole } from '../render/portrait';
import { yearFavours } from '../sim/genetics';
import type { LifeRecord, Lineage } from '../sim/lineage';
import type { Params } from '../sim/params';
import type { FishIdentity, TraitId, YearConditions } from '../sim/types';
import { h } from './dom';
import { mapFromRecord } from './lifeMap';
import { lifeMap } from './lifeMapView';
import { familyTree, recordsBlock, scoreLine, traitChart, TRAIT_LABELS, yearsStrip } from './lineageView';
import { fitFor, shownTraits, suggestOffspring, traitScore } from './offspringFit';
import { pagedView } from './pages';
import { populationRecapLine, runSection } from './populationView';
import { RECAP } from './recapConfig';
import { caption, DEATH_TITLES, sexSymbol, STAGE_TITLES, yearLine } from './text';
import { YEAR_LABEL } from './yearWords';

export type RecapStart = 'life' | 'river' | 'line' | 'next';

export interface RecapInput {
  p: Params;
  l: Lineage;
  rec: LifeRecord;
  kids: FishIdentity[];
  archive: readonly Lineage[];
  /** The year the next generation will live through (lineage.peekNextYear). */
  coming: YearConditions;
  /** Field guide: show the Suggested badge. */
  suggest: boolean;
  start?: RecapStart;
  onChoose: (kid: FishIdentity) => void;
}

const stat = (k: string, v: string) => h('div', {}, h('dt', {}, k), h('dd', {}, v));
const yearWords = (c: YearConditions) => yearFavours(c).map((k) => YEAR_LABEL[k] ?? k).join(', ');

export function recapPanel(i: RecapInput): HTMLElement {
  const { rec } = i;
  const r = rec.result;
  const pages = pagedView(
    'recap',
    [
      { id: 'life', title: 'Your life', body: lifePage(i) },
      { id: 'river', title: 'Your river', body: riverPage(i) },
      { id: 'line', title: 'Your line', body: linePage(i) },
      { id: 'next', title: 'Next generation', body: nextPage(i) },
    ],
    i.start ?? 'life',
  );
  return h(
    'div',
    { class: 'panel wide recap', id: 'recap' },
    h('p', { class: 'label' }, `Generation ${rec.generation} · ${rec.name}`),
    h('h2', {}, `${r ? r.relativeFitness.toFixed(2) : '0'}× an average spawner`),
    pages.root,
  );
}

// ---------- Your life ----------

function lifePage(i: RecapInput): Node[] {
  const { rec } = i;
  const r = rec.result;
  const role = rec.sex === 'F' ? 'Eggs laid' : 'Eggs fertilized';
  const lost = rec.deaths;
  return [
    h(
      'dl',
      { class: 'stats' },
      stat(role, r ? r.eggs.toLocaleString() : '0'),
      stat('Life history', rec.sex === 'F' ? `${rec.oceanYears ?? '?'} years at sea` : rec.isJack ? 'Jack, 1 year at sea' : `Large male, ${rec.oceanYears ?? '?'} years at sea`),
      stat('Years in the lake', rec.lakeYears ? String(rec.lakeYears) : '1'),
      stat('Siblings lost', String(lost.length)),
    ),
    r?.detail ? h('p', { class: 'muted' }, r.detail) : null,
    lifeMap(mapFromRecord(rec), { events: true, conditions: rec.conditions, id: 'recap-map' }),
    h('p', { class: 'muted small' }, caption('recap.mapNote') ?? ''),
    lost.length
      ? h('ul', { class: 'losses', id: 'recap-losses' }, ...lost.map((d) => h('li', {}, h('b', {}, d.name), ` · ${DEATH_TITLES[d.cause].toLowerCase()} · ${STAGE_TITLES[d.stage].toLowerCase()}`)))
      : null,
  ].filter((n): n is HTMLElement => n !== null);
}

// ---------- Your river ----------

function riverPage(i: RecapInput): Node[] {
  const { p, l, rec } = i;
  // The parent's own traits against its year: run timing and body only (whether it became a jack is already known).
  const own = rec.bv ? fitFor(p, { sex: 'F', bv: rec.bv, habitat: rec.habitat }, rec.conditions) : null;
  const ownLine = own ? (own.line === 'offspring.fit.ordinary' ? 'recap.fit.ordinary' : own.line === 'offspring.fit.neutral' ? 'recap.fit.neutral' : own.line) : null;
  return [
    h('p', { class: 'label' }, `This year: ${yearWords(rec.conditions)}`),
    h('p', {}, yearLine(rec.conditions)),
    ownLine ? h('p', { class: 'muted', id: 'recap-own-fit' }, h('b', {}, `${rec.name}: `), caption(ownLine) ?? '') : null,
    populationRecapLine(p, rec.conditions),
    h('p', { class: 'label' }, 'Every year favours different fish'),
    h('p', { class: 'muted', id: 'recap-bet-hedging' }, caption('year.betHedging') ?? ''),
    yearsStrip(l),
    ...runSection(p, l),
  ].filter((n): n is HTMLElement => n !== null);
}

// ---------- Your line ----------

function linePage(i: RecapInput): Node[] {
  const { p, l } = i;
  return [
    scoreLine(p, l),
    h('p', { class: 'label' }, 'Family tree'),
    familyTree(l),
    h('p', { class: 'label' }, 'How the traits drifted'),
    h('p', { class: 'muted small' }, caption('lineage.traitDrift') ?? ''),
    traitChart(l),
    h('p', { class: 'label' }, 'Records'),
    recordsBlock(p, [l, ...i.archive], l.id),
  ];
}

// ---------- Next generation ----------

function nextPage(i: RecapInput): Node[] {
  const { p, kids, coming } = i;
  const pick = i.suggest ? suggestOffspring(p, kids, coming) : null;
  return [
    h('p', { class: 'label', id: 'coming-year' }, `The coming year: ${yearWords(coming)}`),
    h('p', { class: 'muted' }, caption('offspring.intro') ?? ''),
    h('div', { class: 'grid3 kid-cards' }, ...kids.map((k, n) => kidCard(i, k, n, pick?.index === n ? pick.reason : null))),
  ];
}

/** Words for a bar's value, for its tooltip and screen readers. */
function barWords(t: TraitId, v: number): string {
  const [, lo, hi] = TRAIT_LABELS[t];
  const a = Math.abs(v);
  if (a < 0.3) return 'about average';
  return `${a < 1 ? 'a little toward ' : ''}${v < 0 ? lo : hi}`;
}

export function traitBars(p: Params, kid: Pick<FishIdentity, 'sex' | 'bv' | 'habitat'>): HTMLElement {
  const lim = RECAP.fit.barLimit;
  return h(
    'div',
    { class: 'trait-bars' },
    ...shownTraits(kid.sex).map((t) => {
      const v = traitScore(p, kid.bv, kid.habitat, t);
      const [name, lo, hi] = TRAIT_LABELS[t];
      const w = (Math.abs(v) / lim) * 50;
      const words = barWords(t, v);
      return h(
        'div',
        { class: 'tbar', 'data-trait': t, title: `${name}: ${words}`, 'aria-label': `${name}: ${words}` },
        h('span', { class: 'tbar-name' }, name),
        h('span', { class: 'tbar-ends' }, h('span', {}, `← ${lo}`), h('span', {}, `${hi} →`)),
        h('span', { class: 'tbar-track' }, h('i', { class: `tbar-fill${v < 0 ? ' neg' : ''}`, style: `${v < 0 ? 'right:50%' : 'left:50%'};width:${w.toFixed(1)}%` })),
      );
    }),
  );
}

function kidCard(i: RecapInput, k: FishIdentity, n: number, suggested: string | null): HTMLElement {
  const fit = fitFor(i.p, k, i.coming);
  const img = h('img', { class: 'kid-portrait', alt: `${k.name}, as a ${k.sex === 'F' ? 'female' : 'male'} at spawning age`, width: String(RECAP.portrait.width), height: String(RECAP.portrait.height) });
  // Draw the portrait after the page is on screen; the card works without it.
  requestAnimationFrame(() => {
    const url = fishPortrait(portraitRole(k.sex, traitScore(i.p, k.bv, k.habitat, 'jack')), k.z.bodyDepth);
    if (url) img.src = url;
    else img.classList.add('none');
  });
  return h(
    'button',
    { class: `choice kid-card${suggested ? ' suggested' : ''}`, 'data-offspring': String(n), type: 'button', onclick: () => i.onChoose(k) },
    suggested ? h('span', { class: 'badge', id: 'suggested-badge' }, 'Suggested for the coming year') : null,
    h('span', { class: 'kid-head' }, h('b', {}, k.name), h('span', {}, sexSymbol(k.sex))),
    h('span', { class: 'kid-frame' }, img),
    traitBars(i.p, k),
    h('span', { class: 'kid-fit', 'data-fit': fit.line }, caption(fit.line) ?? ''),
    suggested && suggested !== fit.line ? h('span', { class: 'kid-why' }, `Why: ${caption(suggested) ?? ''}`) : null,
  );
}
