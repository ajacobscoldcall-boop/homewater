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
type Page = 'facts' | 'life' | StageId;
let lastPage: Page = 'facts';

/** A caption line of the current life (src/app/messages.ts `LifeLine`). */
export interface JournalLifeLine {
  stage: StageId | null;
  text: string;
  how: 'shown' | 'guide' | 'missed';
}

export interface JournalOptions {
  /** This life's caption lines: the "This life" page, with every line in full, including those that never reached the screen. */
  life?: readonly JournalLifeLine[];
  /** Entries unlocked since the journal was last opened: marked "new", and the journal opens on their page. */
  fresh?: ReadonlySet<string>;
}

/** The page to open on: the page of the newest unseen entry, else the last page looked at. */
export function journalStartPage(journal: FieldJournal, opts: JournalOptions = {}): Page {
  const fresh = journal.data.entries.filter((e) => opts.fresh?.has(e.id)).at(-1);
  if (fresh) return fresh.stage;
  if (lastPage === 'life' && !opts.life) return 'facts';
  return lastPage;
}

const HOW_NOTE: Record<JournalLifeLine['how'], string> = {
  shown: '',
  guide: 'in the Field guide',
  missed: 'not shown: too much at once',
};

/** The journal panel. `onBack` returns to whatever opened it (title or pause). */
export function journalPanel(journal: FieldJournal, onBack: () => void, page: Page = journalStartPage(journal), opts: JournalOptions = {}): HTMLElement {
  lastPage = page;
  const panel = h('div', { class: 'panel wide journal', id: 'journal' });
  const go = (p: Page) => panel.replaceWith(journalPanel(journal, onBack, p, opts));
  const tab = (p: Page, label: string, count?: string) =>
    h('button', { class: 'tab', 'aria-pressed': String(page === p), 'data-journal-page': p, onclick: () => go(p) }, label, count ? h('span', {}, count) : null);
  const stageCount = (s: StageId) => {
    const all = journal.data.entries.filter((e) => e.stage === s);
    return `${all.filter((e) => journal.unlocked.has(e.id)).length}/${all.length}`;
  };

  let body: HTMLElement;
  if (page === 'life') {
    const lines = opts.life ?? [];
    body = h(
      'div',
      { class: 'journal-body life-log' },
      h('p', { class: 'muted' }, 'Every line of this life so far, newest first and in full, including any that were left off the screen.'),
      lines.length
        ? h(
            'ol',
            { class: 'life-lines' },
            ...[...lines].reverse().map((l) =>
              h('li', { class: `life-line ${l.how}` }, l.stage ? h('span', { class: 'label' }, STAGE_TITLES[l.stage]) : null, h('p', {}, l.text), HOW_NOTE[l.how] ? h('span', { class: 'how' }, HOW_NOTE[l.how]) : null),
            ),
          )
        : h('p', { class: 'muted' }, 'Nothing yet.'),
    );
  } else if (page === 'facts') {
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
          ? h('article', { class: `entry${opts.fresh?.has(e.id) ? ' fresh' : ''}`, 'data-entry': e.id }, h('h3', {}, e.title, opts.fresh?.has(e.id) ? h('span', { class: 'new-badge' }, 'new') : null), h('p', {}, e.text))
          : h('article', { class: 'entry locked', 'data-entry': e.id }, h('h3', {}, 'Not yet seen'), h('p', {}, 'Live through it to fill in this page.')),
      ),
    );
  }

  panel.append(
    h('p', { class: 'label' }, `Field journal · ${journal.count} of ${journal.total} entries`),
    h('h2', {}, page === 'facts' ? journal.data.facts.title : page === 'life' ? 'This life' : STAGE_TITLES[page]),
    h(
      'nav',
      { class: 'tabs', 'aria-label': 'Journal pages' },
      tab('facts', 'Facts to remember'),
      opts.life ? tab('life', 'This life', String(opts.life.length)) : null,
      ...STAGES.map((s) => tab(s, STAGE_TITLES[s], stageCount(s))),
    ),
    body,
    h('div', { class: 'row' }, h('button', { class: 'primary', id: 'btn-journal-back', onclick: onBack }, 'Back')),
  );
  return panel;
}
