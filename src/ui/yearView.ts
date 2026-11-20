/**
 * The year in words: one plain line for a stage card, and the full year
 * effects (bet hedging and the river's population) behind a "This year" link.
 *
 * Recap hook: `yearEffects(p, conditions, opts)` builds the full section as a
 * standalone element, so the recap can show the bet-hedging explanation next
 * to what happened (pass `{ stage: null, heading: 'The year' }` for every
 * line rather than one stage's).
 */
import { yearFavours } from '../sim/genetics';
import type { Params } from '../sim/params';
import { populationCaptions, recapCaptions } from '../sim/population';
import type { StageId, YearConditions } from '../sim/types';
import { h } from './dom';
import { caption } from './text';

/** Plain lines for the year headline on a card: `card.<year id>` and `card.<pop id>` in captions.json. */
const cardId = (id: string) => `card.${id}`;

/** The year's headline in a few plain words, at most two conditions. */
export function yearPlainLine(c: YearConditions): string {
  return yearFavours(c)
    .slice(0, 2)
    .map((id) => caption(cardId(id)) ?? '')
    .filter(Boolean)
    .join(' ');
}

/** The card's one plain line about this year: the year, plus the lake (fry) or the fishery (return) where it matters. */
export function stageYearLine(p: Params, stage: StageId, c: YearConditions): string {
  const pop = populationCaptions(p, stage, c)
    .map((id) => caption(cardId(id)) ?? '')
    .filter(Boolean);
  return [yearPlainLine(c), ...pop].filter(Boolean).join(' ');
}

export interface YearEffectsOptions {
  /** Population lines for this stage only (stage card); null for the lake and the fishery together (recap). */
  stage?: StageId | null;
  heading?: string;
}

/** The full year effects: what the year favours, the river's run, and why variety pays (bet hedging). */
export function yearEffects(p: Params, c: YearConditions, opts: YearEffectsOptions = {}): HTMLElement {
  const stage = opts.stage ?? null;
  const favours = yearFavours(c)
    .map((id) => caption(id))
    .filter((t): t is string => !!t);
  const popIds = stage ? populationCaptions(p, stage, c) : recapCaptions(p, c);
  const pop = popIds.map((id) => caption(id)).filter((t): t is string => !!t);
  return h(
    'section',
    { class: 'year-effects', id: 'year-effects' },
    h('h3', {}, opts.heading ?? 'This year'),
    h('ul', {}, ...favours.map((t) => h('li', {}, t))),
    pop.length ? h('p', { class: 'muted' }, pop.join(' ')) : null,
    h('p', { class: 'muted small' }, caption('year.betHedging') ?? ''),
  );
}
