/**
 * The title screen: Continue (when there is a save), New lineage, Lineages and records, Field journal,
 * Settings, and About with How to play beside it. Lineage files are imported and exported on the
 * Lineages page; the content warning and gore choice are in first-run setup and Settings, Content.
 */
import type { SaveFile } from '../../save/save';
import { aboutPanel, howToPlayPanel } from '../../ui/about';
import { h } from '../../ui/dom';
import type { App } from '../App';
import { strayFromTitle } from './death';
import { openJournal } from './journal';
import { showLineages } from './lineages';
import { showScreen } from './screen';
import { showSettings } from './settings';
import { showSetup } from './setup';

export function showTitle(app: App, save: SaveFile | null): void {
  app.renderer.cinematics.stop();
  app.titleSave = save;
  app.mode = 'menu';
  app.atTitle = true;
  app.ending = false;
  app.input.releaseLock();
  app.setHudVisible(false);
  const again = () => showTitle(app, save);
  const live = save && !save.lineage.extinct ? save : null;
  const item = (id: string, label: string, onclick: () => void, sub: string | null = null, primary = false) =>
    h('button', { class: `menu-item${primary ? ' primary' : ''}`, id, onclick }, label, sub ? h('span', {}, sub) : null);
  showScreen(
    h(
      'div',
      { class: 'panel title', id: 'title' },
      h('p', { class: 'label' }, 'A sockeye salmon lifecycle simulator'),
      h('h1', {}, 'Home', h('span', {}, 'water')),
      h('p', {}, 'Live one sockeye’s whole life, from an egg in the gravel to its death on the spawning grounds. Then carry on as one of its offspring.'),
      h(
        'nav',
        { class: 'menu', 'aria-label': 'Main menu' },
        live
          ? item(
              'btn-continue',
              'Continue',
              () => app.continueSave(live),
              !live.life && live.pendingOffspring?.length ? `Choose ${live.lineage.current.name}’s offspring` : `${live.lineage.current.name}, generation ${live.lineage.generation}`,
              true,
            )
          : null,
        save?.lineage.extinct ? item('btn-stray-title', 'A stray from this river', () => strayFromTitle(app, save), 'Carry on the extinct line', true) : null,
        item('btn-new', 'New lineage', () => showSetup(app), live ? 'Start a new line; this one is kept in Lineages and records' : null, !save),
        item('btn-lineages', 'Lineages and records', () => showLineages(app, save), 'Family trees, records, and lineage files'),
        item('btn-journal', 'Field journal', () => openJournal(app, again)),
        item('btn-settings', 'Settings', () => showSettings(app, again)),
        h('div', { class: 'menu-pair' }, item('btn-about', 'About', () => showScreen(aboutPanel(again))), item('btn-howto', 'How to play', () => showScreen(howToPlayPanel(again)))),
      ),
      h('p', { class: 'muted small' }, 'Prototype build. Saves stay in this browser; export your lineage from Lineages and records to keep it safe.'),
    ),
  );
}
