/**
 * The field journal page, from the title screen or the pause menu.
 * Journal unlocks are kept per browser (src/ui/journal.ts), not in the save.
 */
import { journalPanel } from '../../ui/journal';
import type { App } from '../App';
import { showScreen } from './screen';

/** Open the journal; `back` reopens the screen it came from (also on Esc, see App.onKey). */
export function openJournal(app: App, back: () => void): void {
  app.journalBack = () => {
    app.journalBack = null;
    back();
  };
  showScreen(journalPanel(app.journal, app.journalBack));
}
