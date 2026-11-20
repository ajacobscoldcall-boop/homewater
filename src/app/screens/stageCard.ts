/** The card before each stage: its title, what it is about, and Begin/Continue. */
import type { World } from '../../sim/world';
import { h } from '../../ui/dom';
import { populationCardLine } from '../../ui/populationView';
import { OBJECTIVES, STAGE_TITLES, stageCardLine, yearLine } from '../../ui/text';
import type { App } from '../App';
import { showScreen } from './screen';

/** `note` is the last caption of the stage before, carried onto the card. */
export function showStageCard(app: App, w: World, note: string | null = null): void {
  app.messages.clearCaptions();
  app.mode = 'menu';
  app.input.releaseLock();
  app.setHudVisible(false);
  const l = app.lineage;
  showScreen(
    h(
      'div',
      { class: 'panel' },
      note ? h('p', { class: 'muted', id: 'stage-note' }, note) : null,
      h('p', { class: 'label' }, `Stage ${w.stageIndex + 1} of 6 · ${w.fish.name}`),
      h('h2', {}, STAGE_TITLES[w.stageId]),
      h('p', {}, stageCardLine(w.stageId, w.progress.oceanYears)),
      w.stageIndex === 0 && l ? h('p', { class: 'muted' }, yearLine(l.conditions)) : null,
      populationCardLine(app.params, w.stageId, w.conditions),
      h('p', { class: 'muted' }, OBJECTIVES[w.stageId]),
      h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-play', onclick: () => app.play() }, w.stageIndex === 0 ? 'Begin' : 'Continue')),
    ),
  );
}
