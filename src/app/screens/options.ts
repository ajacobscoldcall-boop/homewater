/**
 * Option controls for the Settings screen (screens/settings.ts): sound and the graphics preset.
 * Key bindings, gamepad, hold/toggle (src/input/bindings.ts, gamepad.ts, src/ui/controls.ts) and
 * readability options (src/ui/accessibility.ts) are kept per browser in localStorage, not in the save.
 */
import { k } from '../../input/bindings';
import type { Graphics, QualitySetting } from '../../render/quality';
import { h } from '../../ui/dom';
import { setNarrationVolume } from '../../ui/narration';
import type { App } from '../App';
import { saveSettings } from '../settings';

const muteLabel = (muted: boolean) => (muted ? `Sound off (${k('sound')})` : `Sound on (${k('sound')})`);

/** Apply the saved volume and mute to the sound engine, the narration and any mute buttons on screen. */
export function applySound(app: App): void {
  const { volume, muted, narrationVolume } = app.settings;
  app.audio.setVolume(volume);
  app.audio.setMuted(muted);
  setNarrationVolume(muted ? 0 : volume * narrationVolume);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-sound-mute]')) {
    b.setAttribute('aria-pressed', String(muted));
    b.textContent = muteLabel(muted);
  }
}

/** Narration volume slider (on top of the sound volume). */
export function narrationControls(app: App): HTMLElement {
  const v = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(app.settings.narrationVolume), 'aria-label': 'Narration volume', id: 'narration-volume' });
  v.addEventListener('input', () => {
    app.settings.narrationVolume = Number(v.value);
    saveSettings(app.settings);
    applySound(app);
  });
  return h('div', { class: 'row sound' }, h('label', { class: 'volume' }, 'Narration', v));
}

/** Volume slider and mute toggle. */
export function soundControls(app: App): HTMLElement {
  const muted = app.settings.muted;
  const volume = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(app.settings.volume), 'aria-label': 'Volume', id: 'sound-volume' });
  volume.addEventListener('input', () => {
    app.settings.volume = Number(volume.value);
    saveSettings(app.settings);
    applySound(app);
  });
  const mute = h('button', { 'data-sound-mute': true, 'aria-pressed': String(muted), onclick: () => app.toggleMute() }, muteLabel(muted));
  return h('div', { class: 'row sound' }, mute, h('label', { class: 'volume' }, 'Volume', volume));
}

/** Graphics preset buttons. */
export function graphicsControls(app: App): HTMLElement {
  const pick = (q: QualitySetting) => {
    app.settings.quality = q;
    saveSettings(app.settings);
    app.graphics.set(q);
    refreshGraphicsControls(app.graphics);
  };
  const labels: Record<QualitySetting, string> = { auto: 'Auto', low: 'Low', medium: 'Medium', high: 'High' };
  const buttons = (['auto', 'low', 'medium', 'high'] as const).map((q) =>
    h('button', { 'data-quality': q, 'aria-pressed': String(app.graphics.setting === q), onclick: () => pick(q) }, labels[q]),
  );
  const row = h('div', { class: 'row graphics' }, ...buttons, h('span', { class: 'muted', 'data-quality-note': true }));
  queueMicrotask(() => refreshGraphicsControls(app.graphics));
  return row;
}

/** Bring any graphics buttons on screen up to date (also called when Auto steps down). */
export function refreshGraphicsControls(graphics: Graphics): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-quality]')) b.setAttribute('aria-pressed', String(b.dataset.quality === graphics.setting));
  const note = graphics.setting === 'auto' ? `Now ${graphics.current()}. Steps down if the game runs slowly.` : '';
  const aa = graphics.antialiasPending ? ' Smoother edges change the next time the game loads.' : '';
  for (const el of document.querySelectorAll<HTMLElement>('[data-quality-note]')) el.textContent = (note + aa).trim();
}
