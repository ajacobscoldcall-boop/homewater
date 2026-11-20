/**
 * The Lineages and records page (drawn by src/ui/lineageView.ts), with lineage files:
 * import one, or export the line in this browser.
 */
import { addToArchive, exportSave, importSave, writeSave, type SaveFile } from '../../save/save';
import { h } from '../../ui/dom';
import { lineagesPanel } from '../../ui/lineageView';
import type { App } from '../App';
import { alertBox, showScreen } from './screen';
import { showTitle } from './title';

export function showLineages(app: App, save: SaveFile | null): void {
  const again = () => showLineages(app, save);
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'import-file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const s = await importSave(file);
      if (save && save.lineage.id !== s.lineage.id && save.lineage.records.length) s.archive = addToArchive(s.archive, save.lineage);
      await writeSave(s);
      // The imported line replaces whatever was loaded here, so a New lineage archives it, not a stale one.
      app.lineage = null;
      app.world = null;
      app.archive = s.archive ?? [];
      app.titleSave = s;
      showLineages(app, s);
    } catch (e) {
      alertBox(`Couldn't import that file: ${(e as Error).message}`, again);
    }
  });
  const panel = lineagesPanel(app.params, save?.lineage ?? null, save?.archive ?? app.archive, () => showTitle(app, save));
  const files = h(
    'section',
    { class: 'panel wide files', id: 'lineage-files' },
    h('p', { class: 'label' }, 'Lineage files'),
    h('p', { class: 'muted small' }, 'Saves stay in this browser. Export your line to keep it safe or move it to another computer; importing a file makes it the line you continue (the one here is kept in the records).'),
    h(
      'div',
      { class: 'row' },
      h('button', { id: 'btn-import', onclick: () => fileInput.click() }, 'Import lineage file'),
      save ? h('button', { id: 'btn-export', onclick: () => exportSave(save) }, 'Export lineage file') : null,
      fileInput,
    ),
  );
  showScreen(h('div', { class: 'lineages-page' }, panel, files));
}
