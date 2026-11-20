/**
 * The Controls page (title screen and pause menu): every action with its
 * keys, click to rebind, reset to defaults, hold or toggle for swimming and
 * bursting, and the gamepad layout. Also the key hints shown in the HUD and
 * the pause menu, built from the current bindings.
 */
import { ACTION_LABELS, ACTIONS, bindings, defaultBindings, FIXED_PAUSE, isReserved, k, keyName, rebind, setBindings, SLOTS, unbind, unboundActions, type Action } from '../input/bindings';
import { PAD_LAYOUT, padStatus } from '../input/gamepad';
import { access, setAccess, type PressMode } from './accessibility';
import { h } from './dom';

/** The hint line at the bottom right of the HUD. */
export function hudHint(locked: boolean): string {
  const keys = `${k('forward')} swim · ${k('view')} view · ${k('details')} details · ${k('sound')} sound · ${k('pause')} pause`;
  return locked ? keys : `Click to steer with the mouse · ${keys}`;
}

/** One-line summary of the swimming keys, for the pause menu. */
export function controlsSummary(): string {
  return [
    `${k('forward')} swim`,
    `${k('easeOff')} hold against the current`,
    `${k('steer')} or mouse steer`,
    `${k('rise')}/${k('dive')} rise/dive`,
    `${k('burst')} burst`,
    `${k('act')} act`,
    `${k('view')} view`,
    `${k('details')} details`,
    `${k('sound')} sound`,
  ].join(' · ');
}

/** The Controls page. `back` returns to the screen that opened it. */
export function controlsPanel(back: () => void): HTMLElement {
  const panel = h('div', { class: 'panel wide options', id: 'controls-panel' });
  let capture: { action: Action; slot: number } | null = null;
  let message = '';

  // While the page is open: Esc goes back (or cancels a rebind), and a rebind swallows the next key.
  const onKey = (e: KeyboardEvent) => {
    if (!panel.isConnected) {
      window.removeEventListener('keydown', onKey, true);
      return;
    }
    if (!capture && e.code !== FIXED_PAUSE) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!capture) {
      window.removeEventListener('keydown', onKey, true);
      back();
      return;
    }
    const { action, slot } = capture;
    capture = null;
    if (e.code === FIXED_PAUSE) {
      message = 'Cancelled.';
    } else if (e.code === 'Backspace' || e.code === 'Delete') {
      setBindings(unbind(bindings(), action, slot));
      message = `Cleared a key from ${ACTION_LABELS[action]}.`;
    } else if (isReserved(e.code)) {
      message = `${keyName(e.code)} can't be bound.`;
    } else {
      const r = rebind(bindings(), action, slot, e.code);
      setBindings(r.bindings);
      message = r.displaced
        ? `${keyName(e.code)} moved from ${ACTION_LABELS[r.displaced]} to ${ACTION_LABELS[action]}.${r.bindings[r.displaced].length ? '' : ` ${ACTION_LABELS[r.displaced]} has no key now.`}`
        : `${ACTION_LABELS[action]}: ${keyName(e.code)}.`;
    }
    render();
  };
  window.addEventListener('keydown', onKey, true);

  const modeRow = (label: string, value: PressMode, set: (m: PressMode) => void, id: string) =>
    h(
      'div',
      { class: 'opt-row' },
      h('span', { class: 'opt-label' }, label),
      h(
        'div',
        { class: 'seg', role: 'group', 'aria-label': label },
        ...(['hold', 'toggle'] as const).map((m) => h('button', { 'aria-pressed': String(value === m), 'data-opt': `${id}:${m}`, onclick: () => (set(m), render()) }, m === 'hold' ? 'Hold' : 'Toggle')),
      ),
    );

  const render = () => {
    const b = bindings();
    const rows = ACTIONS.map((a) => {
      const slots = Array.from({ length: SLOTS }, (_, s) => {
        const listening = capture?.action === a && capture.slot === s;
        const code = b[a][s];
        return h(
          'button',
          { class: `keycap${listening ? ' listening' : ''}${code ? '' : ' empty'}`, 'data-bind': `${a}:${s}`, 'aria-label': `${ACTION_LABELS[a]}, key ${s + 1}: ${code ? keyName(code) : 'none'}. Click to change.`, onclick: () => ((capture = { action: a, slot: s }), (message = ''), render()) },
          listening ? 'Press a key…' : code ? keyName(code) : '—',
        );
      });
      const note = a === 'pause' ? h('span', { class: 'muted small' }, 'Esc always pauses') : null;
      return h('div', { class: 'bind-row', 'data-action': a }, h('span', {}, ACTION_LABELS[a]), ...slots, note);
    });
    const missing = unboundActions(b);
    const pad = padStatus();
    const o = access();
    panel.replaceChildren(
      h('h2', {}, 'Controls'),
      h('p', { class: 'muted' }, 'Click a key to change it, then press the new key. Esc cancels; Backspace clears it. A key can only do one thing, so taking it moves it from its old action.'),
      h('div', { class: 'bind-grid', id: 'bind-grid' }, ...rows),
      h('p', { class: 'muted', id: 'bind-message', 'aria-live': 'polite' }, capture ? `Press a key for ${ACTION_LABELS[capture.action]}. Esc cancels.` : message),
      ...(missing.length ? [h('p', { class: 'warning-box', id: 'bind-missing' }, `No key for: ${missing.map((a) => ACTION_LABELS[a]).join(', ')}.`)] : []),
      h('div', { class: 'row' }, h('button', { id: 'btn-bind-reset', onclick: () => (setBindings(defaultBindings()), (message = 'Keys reset to the defaults.'), (capture = null), render()) }, 'Reset to defaults')),
      h('p', { class: 'label' }, 'Swimming'),
      modeRow('Swim forward', o.forwardMode, (m) => setAccess({ forwardMode: m }), 'forwardMode'),
      modeRow('Burst', o.burstMode, (m) => setAccess({ burstMode: m }), 'burstMode'),
      h('p', { class: 'muted small' }, `Toggle: press once to start, again to stop. ${k('easeOff')} (ease off) also stops.`),
      h('p', { class: 'label' }, 'Gamepad'),
      h('p', { class: 'muted', id: 'pad-status' }, pad ? (pad.standard ? `Connected: ${pad.name}` : `Connected, but its layout isn't recognised: ${pad.name}`) : 'No gamepad found. Connect one and press any button on it.'),
      h('div', { class: 'pad-grid' }, ...PAD_LAYOUT.map((p) => h('div', { class: 'pad-row' }, h('span', {}, p.action === 'steer' ? 'Steer' : ACTION_LABELS[p.action]), h('span', { class: 'muted' }, p.pad)))),
      h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-controls-back', onclick: () => (window.removeEventListener('keydown', onKey, true), back()) }, 'Back')),
    );
  };
  render();
  return panel;
}
