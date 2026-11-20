/**
 * The Play log tab of Settings (title screen and pause menu): switch the opt-in local
 * log on or off, see how many lives it holds, export it as a file, clear it.
 * Self-contained so a later settings redesign can move it as one piece.
 */
import { PLAYLOG } from '../telemetry/config';
import type { PlayLog } from '../telemetry/playLog';
import { h } from './dom';

function download(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function playLogPanel(log: PlayLog, back: () => void): HTMLElement {
  const panel = h('div', { class: 'panel options', id: 'playlog-panel' });
  let confirmClear = false;
  const render = () => {
    const lives = log.lives();
    const attempts = lives.reduce((n, l) => n + l.attempts.length, 0);
    const toggle = (on: boolean) => {
      log.setEnabled(on);
      render();
    };
    panel.replaceChildren(
      h('h2', {}, 'Play log'),
      h(
        'p',
        {},
        'The play log helps tune the game for real players. While it is on, the game notes how each life goes: how long each stage takes, where and how fish die, close calls and warnings, a rough path of where you swam, and settings such as difficulty, game speed and graphics.',
      ),
      h(
        'p',
        { class: 'muted small' },
        'It stays in this browser and is never sent anywhere. Nothing about you is in it: no name, no address, only the game. If you want to help, export it and send the file to whoever asked you to playtest. It starts off.',
      ),
      h(
        'div',
        { class: 'opt-row' },
        h('span', { class: 'opt-label' }, 'Keep a play log'),
        h(
          'div',
          { class: 'seg', role: 'group', 'aria-label': 'Keep a play log' },
          h('button', { 'aria-pressed': String(!log.enabled), id: 'btn-playlog-off', onclick: () => toggle(false) }, 'Off'),
          h('button', { 'aria-pressed': String(log.enabled), id: 'btn-playlog-on', onclick: () => toggle(true) }, 'On'),
        ),
      ),
      h(
        'p',
        { id: 'playlog-count' },
        lives.length === 0
          ? 'No lives logged yet.'
          : `${lives.length} ${lives.length === 1 ? 'life' : 'lives'} logged (${attempts} stage ${attempts === 1 ? 'attempt' : 'attempts'}).`,
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            id: 'btn-playlog-export',
            disabled: lives.length === 0,
            onclick: () => download(`homewater-playlog-${stamp(new Date())}.json`, JSON.stringify(log.file())),
          },
          'Export play log',
        ),
        h(
          'button',
          {
            id: 'btn-playlog-clear',
            disabled: lives.length === 0,
            onclick: () => {
              if (confirmClear) log.clear();
              confirmClear = !confirmClear;
              render();
            },
          },
          confirmClear ? 'Really clear it?' : 'Clear play log',
        ),
      ),
      h('p', { class: 'muted small' }, `Up to the last ${PLAYLOG.maxLives} lives are kept; older ones are dropped. Clearing cannot be undone.`),
      h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-playlog-back', onclick: back }, 'Back')),
    );
  };
  render();
  return panel;
}
