/**
 * The pause menu: Resume, Settings, Field journal, Photo mode, Save and quit, over the dimmed scene
 * (body.paused in styles.css hides captions, toasts and the guide while paused).
 */
import { k } from '../../input/bindings';
import { readSave } from '../../save/save';
import { controlsSummary } from '../../ui/controls';
import { h } from '../../ui/dom';
import type { App } from '../App';
import { openJournal } from './journal';
import { showScreen } from './screen';
import { showSettings } from './settings';
import { showTitle } from './title';

export function showPauseMenu(app: App): void {
  const again = () => showPauseMenu(app);
  const item = (id: string, label: string, key: string | null, onclick: () => void, extra: Record<string, string | boolean> = {}) =>
    h('button', { class: 'menu-item', id, onclick, ...extra }, label, key ? h('kbd', {}, key) : null);
  const resume = item('btn-resume', 'Resume', k('pause'), () => app.resume(), { 'data-back': true });
  resume.classList.add('primary');
  showScreen(
    h(
      'div',
      { class: 'panel pause', id: 'pause' },
      h('h2', {}, 'Paused'),
      h(
        'nav',
        { class: 'menu', 'aria-label': 'Pause menu' },
        resume,
        item('btn-pause-settings', 'Settings', null, () => showSettings(app, again)),
        item('btn-pause-journal', 'Field journal', k('journal'), () => openJournal(app, again)),
        item('btn-photo', 'Photo mode', k('photo'), () => app.openPhoto()),
        item('btn-quit', 'Save and quit', null, () => void app.save().then(() => readSave()).then((s) => showTitle(app, s))),
      ),
      h('p', { class: 'muted small' }, controlsSummary()),
    ),
  );
}
