/** The pause menu. */
import { k } from '../../input/bindings';
import { exportSave, readSave } from '../../save/save';
import { controlsSummary } from '../../ui/controls';
import { h } from '../../ui/dom';
import type { App } from '../App';
import { openJournal } from './journal';
import { graphicsControls, optionButtons, soundControls } from './options';
import { showScreen } from './screen';
import { showTitle } from './title';

export function showPauseMenu(app: App): void {
  const save = app.currentSave();
  const w = app.world;
  const again = () => showPauseMenu(app);
  showScreen(
    h(
      'div',
      { class: 'panel' },
      h('h2', {}, 'Paused'),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'primary', onclick: () => app.resume() }, 'Resume'),
        h('button', { onclick: () => app.toggleView() }, `Switch view (${k('view')})`),
        h('button', { onclick: () => (app.hudDetailed = !app.hudDetailed) }, `Detailed HUD (${k('details')})`),
        h('button', { id: 'btn-photo', onclick: () => app.openPhoto() }, `Photo mode (${k('photo')})`),
        h('button', { id: 'btn-pause-journal', onclick: () => openJournal(app, again) }, `Field journal (${k('journal')})`),
        w && app.guided(w) ? h('button', { onclick: () => (app.skipGuide(), again()) }, `Skip guidance (${k('guide')})`) : null,
        ...optionButtons(app, again),
        save ? h('button', { onclick: () => exportSave(save) }, 'Export lineage file') : null,
        h('button', { onclick: () => void app.save().then(() => readSave()).then((s) => showTitle(app, s)) }, 'Save and quit to title'),
      ),
      soundControls(app),
      graphicsControls(app),
      h('p', { class: 'muted' }, controlsSummary()),
    ),
  );
}
