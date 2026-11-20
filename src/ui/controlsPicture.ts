/**
 * A small picture of the controls for the Field guide's onboarding steps:
 * keycaps drawn in HTML with the player's own keys (src/input/bindings.ts),
 * and a mouse drawn in SVG. The keys the current step asks for are lit.
 */
import { bindings, primaryKey, type Action } from '../input/bindings';
import { h } from './dom';
import type { GuideKey } from './tutorial';

const SVG = 'http://www.w3.org/2000/svg';

function cap(a: Action, lit: boolean): HTMLElement {
  const name = primaryKey(bindings(), a);
  return h('span', { class: `keycap${lit ? ' lit' : ''}${name.length > 2 ? ' wide' : ''}`, 'data-action': a }, name);
}

function group(lit: boolean, label: string, ...caps: Node[]): HTMLElement {
  return h('span', { class: `ctl${lit ? ' lit' : ''}` }, h('span', { class: 'caps' }, ...caps), h('span', { class: 'ctl-label' }, label));
}

function mouse(lit: boolean): HTMLElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 34');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<rect x="2" y="2" width="20" height="30" rx="10" class="m-body"/>' +
    '<line x1="12" y1="2" x2="12" y2="13" class="m-line"/>' +
    '<rect x="2" y="2" width="10" height="11" rx="5" class="m-left"/>' +
    '<path d="M-2 22 h-6 m3 -3 l-3 3 l3 3 M26 22 h6 m-3 -3 l3 3 l-3 3" class="m-arrows"/>';
  svg.setAttribute('overflow', 'visible');
  return group(lit, 'click, then move', h('span', { class: 'mouse' }, svg));
}

/** The controls picture, with `lit` keys highlighted. Always shows swimming, steering, depth and burst. */
export function controlsPicture(lit: readonly GuideKey[]): HTMLElement {
  const on = (k: GuideKey) => lit.includes(k);
  const parts: HTMLElement[] = [
    group(on('forward'), 'swim', cap('forward', on('forward'))),
    group(on('steer'), 'steer', cap('steerLeft', on('steer')), cap('steerRight', on('steer'))),
    group(on('dive') || on('rise'), 'dive · rise', cap('dive', on('dive')), cap('rise', on('rise'))),
    group(on('burst'), 'burst', cap('burst', on('burst'))),
  ];
  if (on('act')) parts.push(group(true, 'act', cap('act', true)));
  if (on('mouse')) parts.push(mouse(true));
  return h('div', { class: 'controls-picture', 'aria-label': 'Controls' }, ...parts);
}
