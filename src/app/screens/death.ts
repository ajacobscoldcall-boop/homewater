/**
 * A fish's death: the gore death beat, then a sibling carries on, a stray
 * rescues the line (Field guide), or the line goes extinct (Wild).
 */
import { deathBeatPlan } from '../../render/goreConfig';
import { markExtinct, recordLife, strayRescue, type Lineage } from '../../sim/lineage';
import type { World } from '../../sim/world';
import { addToArchive, readSave } from '../../save/save';
import { $, h } from '../../ui/dom';
import { playDeathBeat } from '../../ui/endSequence';
import { extinctionPanel } from '../../ui/lineageView';
import { caption, DEATH_TITLES, STAGE_TITLES } from '../../ui/text';
import type { App } from '../App';
import { lifeRecord } from '../saving';
import { showNaming } from './naming';
import { showScreen } from './screen';
import { showSetup } from './setup';
import { showStageCard } from './stageCard';
import { showTitle } from './title';

/** The sim reported a death: record and save it, play the death beat if there is one, then the death screen. */
export function onDeath(app: App, w: World): void {
  app.mode = 'menu';
  app.input.releaseLock();
  app.setHudVisible(false);
  // Record the death and save at once, so a reload on the death screen (or during the beat) cannot undo it.
  app.deaths.push({ name: w.fish.name, stage: w.stageId, cause: w.deathCause ?? 'exhaustion' });
  void app.save();
  // Gore: a short, skippable death beat before the death screen, when a predator, a net or a line took the fish.
  const beat = deathBeatPlan(w.deathCause, app.settings.gore);
  if (!beat) return showDeath(app, w);
  app.renderer.gore.startDeathBeat(w, beat);
  void playDeathBeat($('screen'), beat).then(() => {
    if (app.world === w && w.status === 'dead') showDeath(app, w);
  });
}

export function showDeath(app: App, w: World): void {
  const cause = w.deathCause ?? 'exhaustion';
  app.noteJournal([`death.${cause}`]);
  const science = caption(`death.${cause}`) ?? '';
  app.messages.narrate(`death.${cause}`);
  const l = app.lineage;
  if (!l) return;
  if (w.canContinueWithSibling()) {
    const ctx = h(
      'div',
      { style: 'display:grid;gap:12px' },
      h('p', { class: 'label' }, `${w.fish.name} · ${STAGE_TITLES[w.stageId]}`),
      h('h2', {}, DEATH_TITLES[cause]),
      h('p', {}, science),
      h('p', { class: 'muted' }, `A sibling carries on from the last checkpoint. ${w.siblingsLeft} sibling${w.siblingsLeft === 1 ? '' : 's'} left.`),
    );
    showNaming(Math.floor(Math.random() * 1e9), [...l.usedNames, ...app.deaths.map((d) => d.name)], (name) => {
      l.usedNames.push(name);
      w.continueWithSibling(name);
      app.pending = w.drainEvents();
      void app.save();
      showStageCard(app, w);
    }, ctx);
    return;
  }
  // The whole brood is gone.
  const rec = lifeRecord(w, app.deaths, false);
  recordLife(l, rec);
  app.deaths = [];
  if (l.difficulty === 'fieldGuide') {
    showScreen(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, DEATH_TITLES[cause]),
        h('p', {}, science),
        h('p', {}, 'The whole brood is gone. But salmon sometimes stray from other streams, and a stray has found its way into yours.'),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'primary',
              id: 'btn-stray',
              onclick: () =>
                showNaming(Math.floor(Math.random() * 1e9), l.usedNames, (name) => {
                  strayRescue(app.params, l, name);
                  app.startLife(null);
                }),
            },
            'Continue as the stray',
          ),
        ),
      ),
    );
  } else {
    markExtinct(l);
    app.archive = addToArchive(app.archive, l);
    void app.save();
    showExtinction(app, l, `${DEATH_TITLES[cause]}`, science);
  }
}

/** A Wild line is gone: its records, and a stray, a new lineage or the title. */
export function showExtinction(app: App, l: Lineage, deathTitle: string, science: string): void {
  const toTitle = () => void readSave().then((s) => showTitle(app, s));
  showScreen(
    extinctionPanel(app.params, l, {
      deathTitle,
      science,
      archive: app.archive,
      onTitle: toTitle,
      onNewLineage: () => showSetup(app),
      onStray: () => {
        const seed = Math.floor(Math.random() * 2 ** 31);
        showNaming(seed, [], (name) => app.foundFromStray(l, seed, name));
      },
    }),
  );
}

/** After a reload, an extinct line can still be carried on by a stray into the same river. */
export function strayFromTitle(app: App, save: { lineage: Lineage; archive?: Lineage[] }): void {
  const l = save.lineage;
  app.setDifficulty(l.difficulty);
  app.archive = save.archive ?? [];
  const seed = Math.floor(Math.random() * 2 ** 31);
  showNaming(seed, [], (name) => app.foundFromStray(l, seed, name));
}
