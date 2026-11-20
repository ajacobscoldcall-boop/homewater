/** The title screen: continue or start a lineage, files, journal, records, and the options. */
import { addToArchive, exportSave, importSave, writeSave, type SaveFile } from '../../save/save';
import { titleLinks } from '../../ui/about';
import { h } from '../../ui/dom';
import type { App } from '../App';
import { saveSettings, type Settings } from '../settings';
import { openJournal } from './journal';
import { showLineages } from './lineages';
import { graphicsControls, optionButtons, soundControls } from './options';
import { alertBox, showScreen } from './screen';
import { showSetup } from './setup';
import { strayFromTitle } from './death';

export function showTitle(app: App, save: SaveFile | null): void {
  app.renderer.cinematics.stop();
  app.titleSave = save;
  app.mode = 'menu';
  app.atTitle = true;
  app.ending = false;
  app.input.releaseLock();
  app.setHudVisible(false);
  const again = () => showTitle(app, save);
  const goreBtn = (g: Settings['gore'], label: string, desc: string) =>
    h(
      'button',
      {
        class: 'choice',
        'aria-pressed': String(app.settings.gore === g),
        onclick: () => {
          app.settings.gore = g;
          app.renderer.gore.mode = g;
          saveSettings(app.settings);
          again();
        },
      },
      label,
      h('span', {}, desc),
    );
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'import-file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const s = await importSave(file);
      if (save && save.lineage.id !== s.lineage.id && save.lineage.records.length) s.archive = addToArchive(s.archive, save.lineage);
      await writeSave(s);
      // The imported line replaces whatever was loaded here, so a New lineage archives it, not a stale one.
      app.lineage = null;
      app.world = null;
      app.archive = s.archive ?? [];
      showTitle(app, s);
    } catch (e) {
      alertBox(`Couldn't import that file: ${(e as Error).message}`, again);
    }
  });
  showScreen(
    h(
      'div',
      { class: 'panel' },
      h('p', { class: 'label' }, 'A sockeye salmon lifecycle simulator'),
      h('h1', {}, 'Home', h('span', {}, 'water')),
      h('p', {}, 'Live one sockeye’s whole life, from an egg in the gravel to its death on the spawning grounds. Then carry on as one of its offspring.'),
      h(
        'p',
        { class: 'warning-box' },
        'Content warning: this game shows predation, deaths from fishing, wounds and decay. Unflinching shows them plainly, with blood in the water; Documentary cuts away before the worst. You can change this below at any time.',
      ),
      save && !save.lineage.extinct
        ? h(
            'div',
            { class: 'row' },
            h('button', { class: 'primary', id: 'btn-continue', onclick: () => app.continueSave(save) }, !save.life && save.pendingOffspring?.length ? `Continue: choose ${save.lineage.current.name}’s offspring` : `Continue: ${save.lineage.current.name}, generation ${save.lineage.generation}`),
            h('button', { id: 'btn-new', onclick: () => showSetup(app) }, 'New lineage'),
          )
        : h(
            'div',
            { class: 'row' },
            save?.lineage.extinct ? h('button', { class: 'primary', id: 'btn-stray-title', onclick: () => strayFromTitle(app, save) }, 'A stray from this river') : null,
            h('button', { class: save?.lineage.extinct ? '' : 'primary', id: 'btn-new', onclick: () => showSetup(app) }, 'New lineage'),
          ),
      h(
        'div',
        { class: 'row' },
        h('button', { onclick: () => fileInput.click() }, 'Import lineage file'),
        save ? h('button', { onclick: () => exportSave(save) }, 'Export lineage file') : null,
        h('button', { id: 'btn-journal', onclick: () => openJournal(app, again) }, 'Field journal'),
        h('button', { id: 'btn-lineages', onclick: () => showLineages(app, save) }, 'Lineages and records'),
        ...optionButtons(app, again),
        fileInput,
      ),
      titleLinks((panel) => showScreen(panel), again),
      h('p', { class: 'label' }, 'Gore'),
      h('div', { class: 'grid3' }, goreBtn('unflinching', 'Unflinching', 'Predation and decay shown plainly.'), goreBtn('documentary', 'Documentary', 'Deaths cut away before the worst of it.')),
      h('p', { class: 'label' }, 'Sound'),
      soundControls(app),
      h('p', { class: 'label' }, 'Graphics'),
      graphicsControls(app),
      h('p', { class: 'muted' }, 'Prototype build. Saves stay in this browser; export your lineage to keep it safe.'),
    ),
  );
}
