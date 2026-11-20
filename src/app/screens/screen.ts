/**
 * The menu layer (#screen) that every screen draws into: one screen at a time.
 * Each screen module has a `show…` function that replaces what is there;
 * `hideScreen` clears it when play resumes.
 */
import { $, h, show } from '../../ui/dom';

export function showScreen(...nodes: Node[]): void {
  show($('screen'), ...nodes);
}

export function hideScreen(): void {
  $('screen').replaceChildren();
}

/** A message with an OK button. */
export function alertBox(message: string, back: () => void): void {
  showScreen(h('div', { class: 'panel' }, h('p', {}, message), h('div', { class: 'row' }, h('button', { class: 'primary', onclick: back }, 'OK'))));
}

/** One term and value in a stats list. */
export function stat(label: string, value: string): HTMLElement {
  return h('div', {}, h('dt', {}, label), h('dd', {}, value));
}
