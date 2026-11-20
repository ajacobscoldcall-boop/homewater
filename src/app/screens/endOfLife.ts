/**
 * The end of a life that spawned: the post-spawn sequence, then the recap and
 * the choice of the next generation (reopened from the save after a reload).
 */
import { endCards } from '../../render/goreConfig';
import { yearFavours } from '../../sim/genetics';
import { advanceGeneration, offerOffspring, peekNextYear, recordLife, type LifeRecord } from '../../sim/lineage';
import type { FishIdentity, YearConditions } from '../../sim/types';
import type { World } from '../../sim/world';
import { $, h } from '../../ui/dom';
import { playEndSequence } from '../../ui/endSequence';
import { fitFor } from '../../ui/offspringFit';
import { recapPanel, traitBars, type RecapStart } from '../../ui/recap';
import { caption, sexSymbol } from '../../ui/text';
import type { App } from '../App';
import { lifeRecord } from '../saving';
import { showNaming } from './naming';
import { showScreen } from './screen';

export async function onLifeComplete(app: App, w: World): Promise<void> {
  app.mode = 'menu';
  app.ending = true;
  app.input.releaseLock();
  app.setHudVisible(false);
  const l = app.lineage;
  if (!l) return;
  // Record the life and save the offspring on offer first, so a reload during the sequence reopens the choice.
  const rec = lifeRecord(w, app.deaths, true, app.lakeYears);
  recordLife(l, rec);
  app.deaths = [];
  const kids = offerOffspring(app.params, l, w.fish);
  app.pendingKids = kids;
  void app.save();
  // Gore: the post-spawn sequence, a series of fades (skippable); the renderer shows the spent fish and its carcass.
  await playEndSequence($('screen'), endCards(w.fish.sex, app.settings.gore), {
    fast: app.debug || navigator.webdriver,
    onCard: (card) => {
      app.messages.narrate(card.id);
      app.renderer.gore.setEnding(w, card.scene);
    },
  });
  showOffspringChoice(app, rec, kids, 'life');
}

/**
 * The recap of a finished life, in pages, ending with the choice of the next generation (src/ui/recap.ts).
 * Built from the saved record, so it can reopen after a reload; then it opens on the choice.
 */
export function showOffspringChoice(app: App, rec: LifeRecord, kids: FishIdentity[], start: RecapStart = 'next'): void {
  const l = app.lineage;
  if (!l) return;
  app.mode = 'menu';
  app.ending = true;
  app.noteJournal(['year.betHedging', ...yearFavours(rec.conditions)]);
  const coming = peekNextYear(app.params, l, (kids[0]?.generation ?? l.generation + 1));
  showScreen(
    recapPanel({
      p: app.params,
      l,
      rec,
      kids,
      archive: app.archive,
      coming,
      suggest: l.difficulty === 'fieldGuide',
      start,
      onChoose: (k) => chooseOffspring(app, k, kids, coming),
    }),
  );
}

function chooseOffspring(app: App, kid: FishIdentity, kids: FishIdentity[], coming: YearConditions): void {
  const l = app.lineage;
  if (!l) return;
  const used = [...l.usedNames, ...kids.filter((k) => k !== kid).map((k) => k.name)];
  showNaming(
    Math.floor(Math.random() * 1e9),
    used,
    (name) => {
      advanceGeneration(app.params, l, kid, name);
      app.pendingKids = null;
      app.startLife(null);
    },
    h('div', { class: 'naming-kid' }, h('p', {}, `${sexSymbol(kid.sex)}. ${caption(fitFor(app.params, kid, coming).line) ?? ''}`), traitBars(app.params, kid)),
  );
}
