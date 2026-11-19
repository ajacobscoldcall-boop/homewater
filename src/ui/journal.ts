/**
 * The field journal: short entries of deeper science that unlock the first
 * time the player experiences something (a predator, a death, a stage, a
 * life-history turn). Entries live in src/data/journal.json. Which ones are
 * unlocked is kept per browser in localStorage, not in the save file, so it
 * carries across lineages and needs no save migration. Everything works
 * without storage; unlocks then last only for the session.
 */
import journalFile from '../data/journal.json';
import type { SimEvent, StageId } from '../sim/types';
import { h } from './dom';
import { STAGE_TITLES } from './text';

export interface JournalEntry {
  id: string;
  stage: StageId;
  title: string;
  text: string;
  /** Trigger keys; any one of them unlocks the entry. */
  unlock: string[];
}

export interface JournalFact {
  title: string;
  text: string;
}

export interface JournalData {
  facts: { title: string; intro: string; items: JournalFact[] };
  entries: JournalEntry[];
}

export const JOURNAL = journalFile as unknown as JournalData;

const STORAGE_KEY = 'homewater.journal';

/**
 * The trigger keys an event stands for. Captions, reveals and spawns use
 * their caption id; warnings become 'warning.<kind>'; deaths keep their
 * 'death.<cause>' key; a spawn also gives 'spawned.<habitat>'; the end of a
 * life gives 'life.complete'.
 */
export function triggersFor(ev: SimEvent, ctx: { habitat?: string } = {}): string[] {
  switch (ev.type) {
    case 'caption':
    case 'reveal':
    case 'death':
      return ev.key ? [ev.key] : [];
    case 'spawned':
      return [...(ev.key ? [ev.key] : []), ...(ctx.habitat ? [`spawned.${ctx.habitat}`] : [])];
    case 'warning':
      return ev.key ? [`warning.${ev.key}`] : [];
    case 'lifeComplete':
      return ['life.complete'];
    default:
      return [];
  }
}

/** Entries that the triggers unlock and that are not unlocked yet, in journal order. */
export function newlyUnlocked(entries: readonly JournalEntry[], unlocked: ReadonlySet<string>, triggers: Iterable<string>): JournalEntry[] {
  const fired = new Set(triggers);
  if (fired.size === 0) return [];
  return entries.filter((e) => !unlocked.has(e.id) && e.unlock.some((t) => fired.has(t)));
}

/** Minimal storage interface, so tests can pass a fake and the game can pass none. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export class FieldJournal {
  readonly unlocked = new Set<string>();
  private readonly store: KeyValueStore | null;

  constructor(
    store: KeyValueStore | null | undefined = undefined,
    readonly data: JournalData = JOURNAL,
  ) {
    this.store = store === undefined ? defaultStore() : store;
    try {
      const raw = this.store?.getItem(STORAGE_KEY);
      const ids = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') this.unlocked.add(id);
    } catch {
      // Unreadable or blocked storage: start empty.
    }
  }

  /** Unlock whatever these triggers unlock. Returns the entries that are new. */
  record(triggers: Iterable<string>): JournalEntry[] {
    const fresh = newlyUnlocked(this.data.entries, this.unlocked, triggers);
    if (!fresh.length) return fresh;
    for (const e of fresh) this.unlocked.add(e.id);
    try {
      this.store?.setItem(STORAGE_KEY, JSON.stringify([...this.unlocked]));
    } catch {
      // Storage full or blocked: keep the unlocks for this session only.
    }
    return fresh;
  }

  /** Feed simulation events; returns newly unlocked entries. */
  recordEvents(events: readonly SimEvent[], ctx: { habitat?: string } = {}): JournalEntry[] {
    return this.record(events.flatMap((ev) => triggersFor(ev, ctx)));
  }

  get total(): number {
    return this.data.entries.length;
  }

  get count(): number {
    return this.data.entries.filter((e) => this.unlocked.has(e.id)).length;
  }
}

// ---------- Screens ----------

const STAGES: StageId[] = ['egg', 'fry', 'smolt', 'ocean', 'return', 'spawn'];
type Page = 'facts' | StageId;
let lastPage: Page = 'facts';

/** The journal panel. `onBack` returns to whatever opened it (title or pause). */
export function journalPanel(journal: FieldJournal, onBack: () => void, page: Page = lastPage): HTMLElement {
  lastPage = page;
  const panel = h('div', { class: 'panel wide journal', id: 'journal' });
  const go = (p: Page) => panel.replaceWith(journalPanel(journal, onBack, p));
  const tab = (p: Page, label: string, count?: string) =>
    h('button', { class: 'tab', 'aria-pressed': String(page === p), 'data-journal-page': p, onclick: () => go(p) }, label, count ? h('span', {}, count) : null);
  const stageCount = (s: StageId) => {
    const all = journal.data.entries.filter((e) => e.stage === s);
    return `${all.filter((e) => journal.unlocked.has(e.id)).length}/${all.length}`;
  };

  let body: HTMLElement;
  if (page === 'facts') {
    const f = journal.data.facts;
    body = h(
      'div',
      { class: 'journal-body' },
      h('p', { class: 'muted' }, f.intro),
      h('ol', { class: 'facts' }, ...f.items.map((it) => h('li', {}, h('h3', {}, it.title), h('p', {}, it.text)))),
    );
  } else {
    const entries = journal.data.entries.filter((e) => e.stage === page);
    body = h(
      'div',
      { class: 'journal-body entries' },
      ...entries.map((e) =>
        journal.unlocked.has(e.id)
          ? h('article', { class: 'entry', 'data-entry': e.id }, h('h3', {}, e.title), h('p', {}, e.text))
          : h('article', { class: 'entry locked', 'data-entry': e.id }, h('h3', {}, 'Not yet seen'), h('p', {}, 'Live through it to fill in this page.')),
      ),
    );
  }

  panel.append(
    h('p', { class: 'label' }, `Field journal · ${journal.count} of ${journal.total} entries`),
    h('h2', {}, page === 'facts' ? journal.data.facts.title : STAGE_TITLES[page]),
    h('nav', { class: 'tabs', 'aria-label': 'Journal pages' }, tab('facts', 'Facts to remember'), ...STAGES.map((s) => tab(s, STAGE_TITLES[s], stageCount(s)))),
    body,
    h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-journal-back', onclick: onBack }, 'Back')),
  );
  return panel;
}

/** A brief note, over everything, that a journal entry was unlocked. Never blocks clicks. */
export function showJournalToast(entries: readonly JournalEntry[]): void {
  if (!entries.length || typeof document === 'undefined') return;
  const root = document.getElementById('app');
  if (!root) return;
  let box = document.getElementById('journal-toasts');
  if (!box) {
    box = h('div', { id: 'journal-toasts', 'aria-live': 'polite' });
    root.append(box);
  }
  for (const e of entries) {
    const el = h('div', { class: 'journal-toast' }, h('span', { class: 'label' }, 'New in the field journal'), e.title);
    box.append(el);
    setTimeout(() => el.classList.add('fade'), 3800);
    setTimeout(() => el.remove(), 4500);
  }
  while (box.children.length > 3) box.firstElementChild?.remove();
}
