/**
 * Pages behind tabs, for the recap and the extinction screen: a tab list
 * (Left/Right/Home/End move between tabs, as the ARIA tabs pattern asks) and
 * one panel per page, with a "Next" button at the foot of each page but the
 * last. Every page is built up front, so its content is in the DOM while hidden.
 */
import { h } from './dom';
import './recap.css';

export interface Page {
  id: string;
  title: string;
  body: Node[];
}

export interface Paged {
  root: HTMLElement;
  select: (id: string, focus?: boolean) => void;
}

export function pagedView(prefix: string, pages: Page[], start: string = pages[0]?.id ?? ''): Paged {
  const tabs = pages.map((pg) =>
    h('button', { class: 'page-tab', role: 'tab', id: `${prefix}-tab-${pg.id}`, 'aria-controls': `${prefix}-page-${pg.id}`, 'aria-selected': 'false', tabindex: '-1', type: 'button' }, pg.title),
  );
  const panels = pages.map((pg, i) => {
    const next = pages[i + 1];
    return h(
      'section',
      { class: 'page', role: 'tabpanel', id: `${prefix}-page-${pg.id}`, 'aria-labelledby': `${prefix}-tab-${pg.id}`, hidden: true, 'data-page': pg.id },
      ...pg.body,
      next ? h('div', { class: 'row page-next' }, h('button', { class: 'primary', type: 'button', id: `${prefix}-next-${pg.id}`, onclick: () => select(next.id, true) }, `Next: ${next.title} →`)) : null,
    );
  });
  const list = h('div', { class: 'page-tabs', role: 'tablist', 'aria-label': 'Pages' }, ...tabs);
  function select(id: string, focus = false): void {
    pages.forEach((pg, i) => {
      const on = pg.id === id;
      tabs[i]!.setAttribute('aria-selected', String(on));
      tabs[i]!.tabIndex = on ? 0 : -1;
      panels[i]!.hidden = !on;
      if (on && focus) tabs[i]!.focus();
    });
    root.dataset.page = id;
    if (focus) list.scrollIntoView({ block: 'nearest' });
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(pages[i]!.id));
    t.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      const to = k === 'ArrowRight' ? i + 1 : k === 'ArrowLeft' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? pages.length - 1 : null;
      if (to === null) return;
      e.preventDefault();
      e.stopPropagation();
      select(pages[(to + pages.length) % pages.length]!.id, true);
    });
  });
  const root = h('div', { class: 'paged', id: `${prefix}-pages` }, list, ...panels);
  select(pages.some((p) => p.id === start) ? start : (pages[0]?.id ?? ''));
  return { root, select };
}
