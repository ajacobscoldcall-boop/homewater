/**
 * The "How to play" and "About" panels, reached from the title screen's menu.
 * Plain UI text, not science captions: the science itself lives in captions.json.
 */
import { k } from '../input/bindings';
import { h } from './dom';

/** The key table, built when shown so it names the player's own bindings. */
function keys(): [string, string][] {
  return [
    ['Click the game', `Capture the mouse for steering (${k('pause')} releases it and pauses)`],
    [`Mouse or ${k('steer')}`, 'Steer'],
    [k('forward'), 'Swim forward'],
    [k('easeOff'), 'Ease off and hold position against the current'],
    [`${k('rise')} / ${k('dive')}`, `Rise / dive (in the egg stage, ${k('rise')} wriggles)`],
    [k('burst'), 'Burst: fast, but burns energy (and fat on the return)'],
    [k('act'), 'Act: dig or cover the redd, or dart in as a jack'],
    [k('view'), 'Switch between third- and first-person'],
    [k('details'), 'Show details: energy, fat, growth and depth, and on the return the water temperature, oxygen and heat stress'],
    [k('sound'), 'Sound on or off'],
    [k('pause'), `Pause (${k('journal')} opens the field journal while paused)`],
    [k('guide'), 'Skip the step-by-step guide on a first life'],
    ['Arrow keys, Enter, Esc', 'Move through menus, choose, and go back (a gamepad’s D-pad, A and B do the same)'],
  ];
}

const STAGES: [string, string][] = [
  ['Egg and alevin', 'Hatch in the gravel, face the current, then swim up toward the light.'],
  ['Fry in the lake', 'A year of short scenes: hide in the weeds, feed at dusk, wait out the winter.'],
  ['The smolt run', 'Leave the lake at night with your school, past char, birds and a seal.'],
  ['Ocean years', 'Feed where the krill gather, and dodge orca, seal and salmon shark.'],
  ['The return', 'Follow the magnetic track home, thread the nets, smell your river, slip past bears and anglers.'],
  ['Spawning', 'Dig a redd, fight for a mate, or sneak in as a jack.'],
];

export function howToPlayPanel(back: () => void): HTMLElement {
  return h(
    'div',
    { class: 'panel info-panel', id: 'panel-howto' },
    h('p', { class: 'label' }, 'How to play'),
    h('h2', {}, 'One life, egg to spawning'),
    h(
      'p',
      {},
      'You are one sockeye salmon. Each stage asks one thing of you: hide, feed, flee, find your way, or win a mate. If you die, a sibling carries on. If you spawn, choose one of your offspring and play the next generation.',
    ),
    h(
      'table',
      { class: 'keys' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Key'), h('th', {}, 'Action'))),
      h('tbody', {}, ...keys().map(([key, a]) => h('tr', {}, h('td', {}, h('kbd', {}, key)), h('td', {}, a)))),
    ),
    h('p', { class: 'label' }, 'The six stages'),
    h('ol', { class: 'stage-list' }, ...STAGES.map(([t, d]) => h('li', {}, h('b', {}, t), ' ', d))),
    h('p', { class: 'muted' }, 'A whole life takes about 8 to 10 minutes. Best on a desktop or laptop with a keyboard, in Chrome, Edge or Firefox.'),
    h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-info-back', onclick: back }, 'Back')),
  );
}

export function aboutPanel(back: () => void): HTMLElement {
  return h(
    'div',
    { class: 'panel info-panel', id: 'panel-about' },
    h('p', { class: 'label' }, 'About'),
    h('h2', {}, 'Homewater'),
    h(
      'p',
      {},
      'Homewater is a free, original game about the life of a sockeye salmon: from an egg in the gravel, through a year in a lake and years at sea, back to the stream where it hatched. Your fish carries genes, and its offspring inherit them, so a bloodline changes over the generations.',
    ),
    h(
      'p',
      { class: 'warning-box' },
      'Content warning: this game shows predation, deaths from fishing, and decay. The Gore setting (Settings, Content) can cut away before the worst of it.',
    ),
    h('p', { class: 'label' }, 'The science'),
    h(
      'p',
      {},
      'The biology follows published research on sockeye salmon: how they grow, migrate, find their home stream and spawn, and why some males return early as small "jacks". Some numbers are simplified or tuned so the game plays well. The field journal collects what you learn along the way.',
    ),
    h('p', { class: 'label' }, 'Credits'),
    h(
      'ul',
      { class: 'credits' },
      h('li', {}, 'Built with ', h('a', { href: 'https://threejs.org/', target: '_blank', rel: 'noopener' }, 'three.js'), ' (MIT licence), TypeScript and Vite.'),
      h('li', {}, 'Type: Bricolage Grotesque, Instrument Sans and IBM Plex Mono, from Google Fonts (SIL Open Font License).'),
      h('li', {}, 'Every fish and animal is built in code; sound and music are generated live in the browser.'),
      h('li', {}, 'Science from published research on sockeye salmon.'),
    ),
    h('p', { class: 'muted' }, 'A passion project, made for fun and free to play. Saves stay in this browser.'),
    h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-info-back', onclick: back }, 'Back')),
  );
}
