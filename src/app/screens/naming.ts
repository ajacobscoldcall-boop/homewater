/** Naming a fish: a suggested name with accept, reroll, or type your own. */
import { NAMES } from '../../sim/lineage';
import { h } from '../../ui/dom';
import { showScreen } from './screen';

const NAME_POOL: readonly string[] = NAMES;

/** Suggested names in a fixed order for a seed, skipping names already used. */
export function nameSuggester(seed: number, used: readonly string[]): () => string {
  let n = seed;
  return () => {
    n = (n * 1103515245 + 12345) >>> 0;
    const pool = NAME_POOL.filter((x) => !used.includes(x));
    return pool[n % pool.length] ?? 'Alder';
  };
}

/** Show the naming screen; `context` is drawn above it (a death notice, the chosen offspring). */
export function showNaming(seed: number, used: string[], done: (name: string) => void, context?: Node): void {
  const next = nameSuggester(seed, used);
  let suggestion = next();
  const own = h('input', { type: 'text', id: 'own-name', placeholder: 'Or type a name', maxlength: '24' });
  const nameEl = h('h2', { id: 'suggested-name' }, suggestion);
  showScreen(
    h(
      'div',
      { class: 'panel' },
      context ?? null,
      h('p', { class: 'label' }, 'Name this fish'),
      nameEl,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'primary', id: 'btn-accept-name', onclick: () => done((own.value.trim() || suggestion).slice(0, 24)) }, 'Accept'),
        h('button', { id: 'btn-reroll', onclick: () => ((suggestion = next()), (nameEl.textContent = suggestion)) }, 'Another name'),
      ),
      h('div', { class: 'row' }, own),
    ),
  );
  own.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') done((own.value.trim() || suggestion).slice(0, 24));
  });
}
