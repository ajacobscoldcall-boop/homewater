/**
 * The field journal page, from the title screen or the pause menu.
 * Journal unlocks are kept per browser (src/ui/journal.ts), not in the save.
 */
import { journalPanel, journalStartPage, type JournalOptions } from '../../ui/journal';
import type { App } from '../App';
import { showScreen } from './screen';

/** Open the journal; `back` reopens the screen it came from (also on Esc, see App.onKey). */
export function openJournal(app: App, back: () => void): void {
  app.journalBack = () => {
    app.journalBack = null;
    back();
  };
  // In a life, the "This life" page holds every caption line in full (src/app/messages.ts); new entries are marked.
  const opts: JournalOptions = { fresh: new Set(app.messages.fresh), ...(app.world && !app.atTitle ? { life: app.messages.log } : {}) };
  app.messages.journalOpened();
  app.messages.journalSeen();
  showScreen(journalPanel(app.journal, app.journalBack, journalStartPage(app.journal, opts), opts));
}
