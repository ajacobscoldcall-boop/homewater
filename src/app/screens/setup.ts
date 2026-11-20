/**
 * Starting a lineage: preset, sex, custom traits, home spawning ground and difficulty. Before the very
 * first life (first-run setup) it also shows the content warning and the gore choice, once; after that
 * they live in Settings, Content.
 */
import type { Difficulty } from '../../sim/params';
import type { StartPreset } from '../../sim/lineage';
import { TRAIT_IDS, type Habitat, type Sex, type TraitValues } from '../../sim/types';
import { readSave } from '../../save/save';
import { h } from '../../ui/dom';
import { sexSymbol } from '../../ui/text';
import type { App } from '../App';
import { showNaming } from './naming';
import { showScreen } from './screen';
import { showTitle } from './title';
import { saveSettings } from '../settings';
import { CONTENT_WARNING, goreChoice } from './settings';

const TRAIT_LABELS: Record<string, [string, string, string]> = {
  size: ['Size', 'small', 'large'],
  jack: ['Jack tendency', 'large male', 'jack'],
  runTiming: ['Run timing', 'early', 'late'],
  oceanAge: ['Sea years', 'fewer', 'more'],
  homing: ['Homing', 'wanders', 'faithful'],
  bodyDepth: ['Body', 'streamlined', 'deep'],
  eggTradeoff: ['Eggs', 'many, small', 'few, large'],
};

export function showSetup(app: App): void {
  let preset: StartPreset = 'quick';
  let sex: Sex = 'F';
  let difficulty: Difficulty = 'fieldGuide';
  let habitat: Habitat = 'creek';
  const custom: TraitValues = Object.fromEntries(TRAIT_IDS.map((t) => [t, 0])) as TraitValues;
  // First run: the content warning and gore choice come first, once (kept with the settings, not the save).
  const firstRun = !app.settings.contentSeen;
  const render = () => {
    const choice = (value: StartPreset, title: string, desc: string) =>
      h('button', { class: 'choice', 'aria-pressed': String(preset === value), 'data-preset': value, onclick: () => ((preset = value), render()) }, title, h('span', {}, desc));
    const sexBtn = (s: Sex) => h('button', { class: 'choice', 'aria-pressed': String(sex === s), disabled: preset === 'jack', onclick: () => ((sex = s), render()) }, sexSymbol(s));
    const habBtn = (hb: Habitat, title: string, desc: string) =>
      h('button', { class: 'choice', 'aria-pressed': String(habitat === hb), 'data-habitat': hb, onclick: () => ((habitat = hb), render()) }, title, h('span', {}, desc));
    const diffBtn = (d: Difficulty, title: string, desc: string) =>
      h('button', { class: 'choice', 'aria-pressed': String(difficulty === d), onclick: () => ((difficulty = d), render()) }, title, h('span', {}, desc));
    const sliders =
      preset === 'custom'
        ? h(
            'div',
            { class: 'sliders' },
            ...TRAIT_IDS.map((t) => {
              const [name, lo, hi] = TRAIT_LABELS[t] ?? [t, 'low', 'high'];
              const out = h('output', {}, custom[t] === 0 ? 'average' : custom[t] < 0 ? lo : hi);
              const input = h('input', { type: 'range', min: '-2', max: '2', step: '0.25', value: String(custom[t]), 'aria-label': name });
              input.addEventListener('input', () => {
                custom[t] = Number(input.value);
                out.textContent = custom[t] === 0 ? 'average' : custom[t] < 0 ? lo : hi;
              });
              return h('label', { class: 'slider' }, name, input, out);
            }),
          )
        : null;
    showScreen(
      h(
        'div',
        { class: 'panel' },
        h('h2', {}, 'Start a lineage'),
        firstRun
          ? h(
              'section',
              { class: 'first-run', id: 'first-run-content' },
              h('p', { class: 'label' }, 'Before you start'),
              h('p', { class: 'warning-box' }, `Content warning: ${CONTENT_WARNING}`),
              goreChoice(app, render),
              h('p', { class: 'muted small' }, 'You can change this at any time in Settings, under Content.'),
            )
          : null,
        h('div', { class: 'grid3' }, choice('quick', 'Quick start', 'A typical young sockeye.'), choice('custom', 'Custom', 'Set the starting traits yourself.'), choice('jack', 'Start as a jack', 'A male locked into early maturation: small, quick, a sneaker.')),
        h('p', { class: 'label' }, 'Sex'),
        h('div', { class: 'grid3' }, sexBtn('F'), sexBtn('M')),
        sliders,
        h('p', { class: 'label' }, 'Home spawning ground'),
        h(
          'div',
          { class: 'grid3' },
          habBtn('creek', 'Small creek', 'Shallow, with bank cover. Jacks are commonest here, and bears catch fish most easily.'),
          habBtn('river', 'River', 'Deeper and faster. Larger, deeper-bodied fish, and bears catch fewer.'),
          habBtn('beach', 'Lake beach', 'Still water on a lake shore. The largest fish; little cover.'),
        ),
        h('p', { class: 'label' }, 'Difficulty'),
        h('div', { class: 'grid3' }, diffBtn('fieldGuide', 'Field guide', 'Forgiving. Five siblings per life. Recommended.'), diffBtn('wild', 'Wild', 'Harsher, closer to real odds. Three siblings.')),
        h(
          'div',
          { class: 'row' },
          h('button', { id: 'btn-setup-back', 'data-back': true, onclick: () => void readSave().then((s) => showTitle(app, s)) }, 'Back'),
          h(
            'button',
            {
              class: 'primary',
              id: 'btn-setup-next',
              onclick: () => {
                if (firstRun) {
                  app.settings.contentSeen = true;
                  saveSettings(app.settings);
                }
                const seed = Math.floor(Math.random() * 2 ** 31);
                showNaming(seed, [], (name) => {
                  app.foundLineage({ preset, sex: preset === 'jack' ? ('M' as Sex) : sex, name, difficulty, seed, habitat, ...(preset === 'custom' ? { custom } : {}) });
                });
              },
            },
            'Next',
          ),
        ),
      ),
    );
  };
  render();
}
