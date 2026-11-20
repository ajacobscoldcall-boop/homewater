/**
 * The end of a life that spawned: the post-spawn sequence, then the recap and
 * the choice of the next generation (reopened from the save after a reload).
 */
import { endCards } from '../../render/goreConfig';
import { yearFavours } from '../../sim/genetics';
import { advanceGeneration, offerOffspring, recordLife, type LifeRecord } from '../../sim/lineage';
import type { FishIdentity } from '../../sim/types';
import type { World } from '../../sim/world';
import { $, h } from '../../ui/dom';
import { playEndSequence } from '../../ui/endSequence';
import { familyTree, recapLineage } from '../../ui/lineageView';
import { populationRecapLine } from '../../ui/populationView';
import { caption, sexSymbol, traitLines, yearLine } from '../../ui/text';
import type { App } from '../App';
import { lifeRecord } from '../saving';
import { showNaming } from './naming';
import { showScreen, stat } from './screen';

export async function onLifeComplete(app: App, w: World): Promise<void> {
  app.mode = 'menu';
  app.ending = true;
  app.input.releaseLock();
  app.setHudVisible(false);
  const l = app.lineage;
  if (!l) return;
  // Record the life and save the offspring on offer first, so a reload during the sequence reopens the choice.
  const rec = lifeRecord(w, app.deaths, true);
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
  showOffspringChoice(app, rec, kids);
}

/** The recap of a finished life and the choice of the next generation. Built from the saved record, so it can reopen after a reload. */
export function showOffspringChoice(app: App, rec: LifeRecord, kids: FishIdentity[]): void {
  const l = app.lineage;
  if (!l) return;
  app.mode = 'menu';
  app.ending = true;
  app.noteJournal(['year.betHedging', ...yearFavours(rec.conditions)]);
  const r = rec.result;
  const role = rec.sex === 'F' ? 'eggs laid' : 'eggs fertilized';
  showScreen(
    h(
      'div',
      { class: 'panel wide' },
      h('p', { class: 'label' }, `Generation ${rec.generation} · ${rec.name}`),
      h('h2', {}, `${r ? r.relativeFitness.toFixed(2) : '0'}× an average spawner`),
      h(
        'dl',
        { class: 'stats' },
        stat(role, r ? r.eggs.toLocaleString() : '0'),
        stat('Life history', rec.sex === 'F' ? `${rec.oceanYears ?? '?'} years at sea` : rec.isJack ? 'Jack, 1 year at sea' : `Large male, ${rec.oceanYears ?? '?'} years at sea`),
        stat('Siblings lost', String(rec.deaths.length)),
        stat('Notes', r?.detail ?? ''),
      ),
      h('p', { class: 'muted' }, yearLine(rec.conditions)),
      populationRecapLine(app.params, rec.conditions),
      h('p', { class: 'muted' }, caption('year.betHedging') ?? ''),
      recapLineage(app.params, l, app.archive),
      h('p', { class: 'label' }, 'Choose the next generation'),
      h(
        'div',
        { class: 'grid3' },
        ...kids.map((k, i) =>
          h(
            'button',
            {
              class: 'choice',
              'data-offspring': String(i),
              onclick: () => chooseOffspring(app, k, kids),
            },
            `${k.name} · ${sexSymbol(k.sex)}`,
            h('span', { class: 'kid-traits' }, ...traitLines(k).map((t) => h('span', {}, t))),
          ),
        ),
      ),
      h('p', { class: 'label' }, 'Family tree'),
      familyTree(l),
    ),
  );
}

function chooseOffspring(app: App, kid: FishIdentity, kids: FishIdentity[]): void {
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
    h('p', {}, `${sexSymbol(kid.sex)}. ${traitLines(kid).join(' · ')}`),
  );
}
