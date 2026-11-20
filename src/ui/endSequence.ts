/**
 * The DOM side of the gore setting: the death beat's overlay (Documentary
 * fades to black on the strike) and the post-spawn sequence, a series of
 * captioned fades over the 3D view or simple painted cards. Both are short
 * and skippable with any key or click. Plans and timings: src/render/goreConfig.ts.
 */
import { GORE, type DeathBeatPlan, type EndCard, type EndScene } from '../render/goreConfig';
import { h, show } from './dom';
import { caption } from './text';
import './endSequence.css';

/** Keys held down right now, so a key the player was already holding (to swim, burst or dig) never counts as a skip. */
const held = new Set<string>();
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => held.add(e.code), true);
  window.addEventListener('keyup', (e) => held.delete(e.code), true);
  window.addEventListener('blur', () => held.clear());
}

/** Wait, or stop early on a fresh key press or a click. Resolves true if skipped. */
function skippableWait(ms: number, signal: { skipped: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.skipped) return resolve(true);
    // Keys already down when the wait began (and their auto-repeat) are not a skip.
    const heldAtStart = new Set(held);
    let timer = 0;
    const done = (skipped: boolean) => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onSkip, true);
      window.removeEventListener('keyup', onRelease, true);
      window.removeEventListener('click', onSkip, true);
      if (skipped) signal.skipped = true;
      resolve(skipped);
    };
    // Click, not pointerdown: the click is over before the next screen is drawn, so it cannot land on it.
    const onSkip = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.repeat || heldAtStart.has(e.code))) return;
      e.stopPropagation();
      done(true);
    };
    // Once a held key is let go, pressing it again is a real skip.
    const onRelease = (e: KeyboardEvent) => heldAtStart.delete(e.code);
    timer = window.setTimeout(() => done(false), ms);
    window.addEventListener('keydown', onSkip, true);
    window.addEventListener('keyup', onRelease, true);
    window.addEventListener('click', onSkip, true);
  });
}

/** The death beat's overlay. Unflinching: only a skip hint. Documentary: a fade to black on the strike. */
export async function playDeathBeat(host: HTMLElement, plan: DeathBeatPlan): Promise<void> {
  const veil = h('div', { class: 'gore-veil' });
  veil.style.transitionDuration = `${plan.fadeMs}ms`;
  const root = h('div', { class: 'gore-beat', 'data-gore-beat': plan.mode }, veil, h('p', { class: 'gore-skip' }, 'Any key to skip'));
  show(host, root);
  const signal = { skipped: false };
  if (plan.fadeAtMs !== null) {
    if (!(await skippableWait(plan.fadeAtMs, signal))) {
      veil.classList.add('on');
      await skippableWait(plan.ms - plan.fadeAtMs, signal);
    }
  } else {
    await skippableWait(plan.ms, signal);
  }
  root.remove();
}

/** Painted backgrounds for the cards that leave the grounds. */
function sceneArt(scene: EndScene): HTMLElement | null {
  if (scene === 'forest' || scene === 'seasons') {
    // A line of conifers on the bank above the stream.
    const trees = Array.from({ length: 14 }, (_, i) => {
      const x = i * 7.5 + ((i * 37) % 5);
      const ht = 26 + ((i * 53) % 18);
      return `<polygon points="${x - 4},100 ${x},${100 - ht} ${x + 4},100" />`;
    }).join('');
    const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><g class="trees">${trees}</g><rect class="stream" x="0" y="86" width="100" height="14" /></svg>`;
    const art = h('div', { class: `end-art ${scene}` });
    art.innerHTML = svg;
    return art;
  }
  if (scene === 'eggs') {
    // Eggs among the stones, eyed, about to hatch.
    // A clutch packed in a pocket of the gravel.
    const eggs = Array.from({ length: 26 }, (_, i) => {
      const r = 2.3 * Math.sqrt(i + 0.5);
      const x = (50 + Math.cos(i * 2.4) * r * 1.5).toFixed(1);
      const y = (44 + Math.sin(i * 2.4) * r * 0.75).toFixed(1);
      const a = i * 1.3;
      return `<circle class="egg" cx="${x}" cy="${y}" r="1.9" /><circle class="eye" cx="${(Number(x) + 0.7 * Math.cos(a)).toFixed(2)}" cy="${(Number(y) + 0.5 * Math.sin(a)).toFixed(2)}" r="0.5" />`;
    }).join('');
    const stones = Array.from({ length: 34 }, (_, i) => {
      const x = (i * 37.3) % 104;
      const y = 20 + ((i * 53.7) % 64);
      const near = Math.hypot((x - 50) / 1.5, (y - 44) / 0.75) < 16;
      if (near) return '';
      return `<ellipse class="stone" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(4 + ((i * 7) % 6)).toFixed(1)}" ry="${(2.5 + ((i * 5) % 4)).toFixed(1)}" transform="rotate(${(i * 23) % 40 - 20} ${x.toFixed(1)} ${y.toFixed(1)})" style="opacity:${(0.45 + ((i * 13) % 50) / 100).toFixed(2)}" />`;
    }).join('');
    const art = h('div', { class: 'end-art eggs' });
    art.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${stones}${eggs}</svg>`;
    return art;
  }
  return null;
}

/**
 * Play the post-spawn sequence. onCard is called as each card starts (to
 * narrate it and move the 3D view). Fast mode (tests, debug) keeps it brief.
 */
export async function playEndSequence(host: HTMLElement, cards: readonly EndCard[], opts: { fast: boolean; onCard?: (card: EndCard, index: number) => void }): Promise<void> {
  const e = GORE.end;
  const cardMs = opts.fast ? e.fastCardMs : e.cardMs;
  const fadeMs = opts.fast ? e.fastFadeMs : e.fadeMs;
  const stage = h('div', { class: 'end-stage' });
  const root = h('div', { class: 'end-seq', style: `--fade:${fadeMs}ms` }, stage, h('p', { class: 'gore-skip' }, 'Any key to skip'));
  show(host, root);
  const signal = { skipped: false };
  for (const [i, card] of cards.entries()) {
    opts.onCard?.(card, i);
    const art = sceneArt(card.scene);
    const layer = h('div', { class: `end-card scene-${card.scene}${art ? ' painted' : ''}` }, art, h('p', { class: 'fade-line', 'data-caption-id': card.id }, caption(card.id) ?? ''));
    // The last card fades out as this one fades in.
    for (const old of stage.children) old.classList.remove('in');
    stage.append(layer);
    // Let the previous card fade out under the new one.
    requestAnimationFrame(() => layer.classList.add('in'));
    for (const old of [...stage.children].slice(0, -2)) old.remove();
    if (await skippableWait(cardMs + fadeMs, signal)) break;
  }
  root.remove();
}
