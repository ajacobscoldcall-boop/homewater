/**
 * The one Settings screen, from the title and the pause menu: tabs for Gameplay, Controls, Readability,
 * Graphics, Audio, Content and Play log. Each tab reuses its existing panel; where each setting is kept
 * is unchanged (homewater.settings, homewater.access, homewater.controls, homewater.playlog.on, all
 * localStorage, none in the save). Back (or Esc) leaves Settings for the screen it was opened from.
 */
import { hasNarration } from '../../ui/narration';
import { accessPanel, gameplayPanel } from '../../ui/accessibility';
import { controlsPanel } from '../../ui/controls';
import { h } from '../../ui/dom';
import { playLogPanel } from '../../ui/playLogPanel';
import type { App } from '../App';
import { saveSettings, type Settings } from '../settings';
import { graphicsControls, narrationControls, soundControls } from './options';
import { showScreen } from './screen';

export type SettingsTab = 'gameplay' | 'controls' | 'readability' | 'graphics' | 'audio' | 'content' | 'playlog';

/** Tab order, labels and button ids. Controls, Readability and Play log keep the ids their old buttons had. */
export const SETTINGS_TABS: { tab: SettingsTab; label: string; id: string }[] = [
  { tab: 'gameplay', label: 'Gameplay', id: 'tab-gameplay' },
  { tab: 'controls', label: 'Controls', id: 'btn-controls' },
  { tab: 'readability', label: 'Readability', id: 'btn-access' },
  { tab: 'graphics', label: 'Graphics', id: 'tab-graphics' },
  { tab: 'audio', label: 'Audio', id: 'tab-audio' },
  { tab: 'content', label: 'Content', id: 'tab-content' },
  { tab: 'playlog', label: 'Play log', id: 'btn-playlog' },
];

/** The tab Settings opens on: the last one used this session. */
let lastTab: SettingsTab = 'gameplay';

/** The content warning, shared by Settings (Content) and first-run setup (screens/setup.ts). */
export const CONTENT_WARNING =
  'this game shows predation, deaths from fishing, wounds and decay. Unflinching shows them plainly, with blood in the water; Documentary cuts away before the worst.';

/** The two gore choices; picking one saves it and calls `changed`. */
export function goreChoice(app: App, changed: () => void): HTMLElement {
  const btn = (g: Settings['gore'], label: string, desc: string) =>
    h(
      'button',
      {
        class: 'choice',
        'data-gore': g,
        'aria-pressed': String(app.settings.gore === g),
        onclick: () => {
          app.settings.gore = g;
          app.renderer.gore.mode = g;
          saveSettings(app.settings);
          changed();
        },
      },
      label,
      h('span', {}, desc),
    );
  return h('div', { class: 'grid3', role: 'group', 'aria-label': 'Gore' }, btn('unflinching', 'Unflinching', 'Predation and decay shown plainly.'), btn('documentary', 'Documentary', 'Deaths cut away before the worst of it.'));
}

/** A simple tab body with a heading, content and the shared Back button. */
function page(id: string, title: string, back: () => void, ...content: (HTMLElement | null)[]): HTMLElement {
  return h('div', { class: 'panel options', id }, h('h2', {}, title), ...content, h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-settings-back', 'data-back': true, onclick: back }, 'Back')));
}

/** Open Settings on `tab` (default: the last tab used). `back` reopens the screen it was opened from. */
export function showSettings(app: App, back: () => void, tab: SettingsTab = lastTab): void {
  lastTab = tab;
  const again = () => showSettings(app, back, tab);
  let body: HTMLElement;
  switch (tab) {
    case 'gameplay': {
      const w = app.world;
      const skip =
        w && app.mode === 'paused' && app.guided(w)
          ? h('div', { class: 'row' }, h('button', { id: 'btn-skip-guide-life', onclick: () => (app.skipGuide(), again()) }, 'Skip the steps for this life'))
          : null;
      body = gameplayPanel(back, skip);
      break;
    }
    case 'controls':
      body = controlsPanel(back);
      break;
    case 'readability':
      body = accessPanel(back);
      break;
    case 'graphics':
      body = page(
        'graphics-panel',
        'Graphics',
        back,
        graphicsControls(app),
        h(
          'p',
          { class: 'muted small' },
          'Auto picks a starting level for this machine and steps down (High, Medium, Low, then a lower resolution) if the game runs slowly while you play. It never steps back up by itself, so it doesn’t flicker between levels, and it remembers its level for next time. Pick a level to fix it.',
        ),
        h('p', { class: 'muted small' }, 'Low draws less scenery and fewer fish in a school; the game itself is the same at every level.'),
      );
      break;
    case 'audio':
      body = page(
        'audio-panel',
        'Audio',
        back,
        h('p', { class: 'label' }, 'Sound'),
        soundControls(app),
        h('p', { class: 'label' }, 'Narration'),
        narrationControls(app),
        h('p', { class: 'muted small' }, hasNarration() ? 'Recorded narration plays under the captions. Music and ambience dip while it speaks.' : 'No narration is recorded yet; this sets its level for when it is.'),
      );
      break;
    case 'content':
      body = page(
        'content-panel',
        'Content',
        back,
        h('p', { class: 'warning-box' }, `Content warning: ${CONTENT_WARNING}`),
        h('p', { class: 'label' }, 'Gore'),
        goreChoice(app, again),
        h('p', { class: 'muted small' }, 'Deaths caused by people show scales, never blood, in both.'),
      );
      break;
    case 'playlog':
      body = playLogPanel(app.playLog, back);
      break;
  }
  showScreen(
    h(
      'div',
      { class: 'panel wide settings', id: 'settings' },
      h('p', { class: 'label' }, 'Settings'),
      h(
        'div',
        { class: 'tabs', role: 'tablist', 'aria-label': 'Settings' },
        ...SETTINGS_TABS.map((t) =>
          h('button', { class: 'tab', role: 'tab', id: t.id, 'data-settings-tab': t.tab, 'aria-selected': String(t.tab === tab), 'aria-pressed': String(t.tab === tab), onclick: () => showSettings(app, back, t.tab) }, t.label),
        ),
      ),
      h('div', { class: 'settings-body', role: 'tabpanel' }, body),
    ),
  );
}
