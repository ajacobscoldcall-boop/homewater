/**
 * The card before each stage: where and when, one plain line about this year,
 * and Begin/Continue. The full year effects (bet hedging, the river's run)
 * sit behind a "This year" link (src/ui/yearView.ts). In a guided first life
 * the Field guide teaches the stage, so the card leaves the objective out.
 */
import type { World } from '../../sim/world';
import { h } from '../../ui/dom';
import { OBJECTIVES, STAGE_TITLES, stageCardLine } from '../../ui/text';
import { stageYearLine, yearEffects } from '../../ui/yearView';
import type { App } from '../App';
import { showScreen } from './screen';
import { stageCardMap } from './stageMap';

/** `note` is the last caption of the stage before, carried onto the card. */
export function showStageCard(app: App, w: World, note: string | null = null): void {
  app.messages.clearCaptions();
  app.mode = 'menu';
  app.input.releaseLock();
  app.setHudVisible(false);
  const details = yearEffects(app.params, w.conditions, { stage: w.stageId });
  details.hidden = true;
  const toggle = h('button', { class: 'link', id: 'btn-this-year', 'aria-expanded': 'false', 'aria-controls': 'year-effects' }, 'This year');
  toggle.addEventListener('click', () => {
    details.hidden = !details.hidden;
    toggle.setAttribute('aria-expanded', String(!details.hidden));
    toggle.textContent = details.hidden ? 'This year' : 'Hide the year';
  });
  showScreen(
    h(
      'div',
      { class: 'panel stage-card' },
      note ? h('p', { class: 'muted', id: 'stage-note' }, note) : null,
      h('p', { class: 'label' }, `Stage ${w.stageIndex + 1} of 6 · ${w.fish.name}`),
      h('h2', {}, STAGE_TITLES[w.stageId]),
      h('p', { id: 'card-place' }, stageCardLine(w.stageId, w.progress.oceanYears)),
      h('p', { class: 'muted', id: 'card-year' }, stageYearLine(app.params, w.stageId, w.conditions), ' ', toggle),
      stageCardMap(app, w),
      details,
      app.guided(w) ? null : h('p', { class: 'muted small', id: 'card-objective' }, OBJECTIVES[w.stageId]),
      h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-play', onclick: () => app.play() }, w.stageIndex === 0 ? 'Begin' : 'Continue')),
    ),
  );
}
