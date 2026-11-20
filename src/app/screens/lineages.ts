/** The Lineages and records page (drawn by src/ui/lineageView.ts). */
import type { SaveFile } from '../../save/save';
import { lineagesPanel } from '../../ui/lineageView';
import type { App } from '../App';
import { showScreen } from './screen';
import { showTitle } from './title';

export function showLineages(app: App, save: SaveFile | null): void {
  showScreen(lineagesPanel(app.params, save?.lineage ?? null, save?.archive ?? app.archive, () => showTitle(app, save)));
}
