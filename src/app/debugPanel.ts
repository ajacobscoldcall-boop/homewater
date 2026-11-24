/** The ?debug=1 playtest panel: stats, stage select, complete stage / kill fish, run report, the year's run size and water, trait editor. */
import { TRAIT_IDS } from '../sim/types';
import { $, h } from '../ui/dom';
import type { App } from './App';

/** Debug panel water presets: name, flow, temperature (YearConditions). */
const DEBUG_WATER: [string, number, number][] = [
  ['ordinary', 1, 1],
  ['warm', 0.85, 1.15],
  ['hot', 0.7, 1.25],
];

export class DebugPanel {
  private el: HTMLElement | null = null;
  private last = 0;

  constructor(private readonly app: App) {}

  update(): void {
    const app = this.app;
    const el = $('debug');
    el.hidden = false;
    if (!this.el) {
      this.el = el;
      const w = () => app.world;
      el.append(
        h('div', { id: 'dbg-stats' }),
        h('div', { class: 'row' }, ...['egg', 'fry', 'smolt', 'ocean', 'return', 'spawn'].map((s, i) => h('button', { onclick: () => app.debugJump(i) }, s))),
        h(
          'div',
          { class: 'row' },
          h('button', { onclick: () => (w()?.debugComplete(), w() && app.afterStatus(w()!)) }, 'Complete stage'),
          h('button', { onclick: () => (w()?.die('exhaustion'), w() && app.afterStatus(w()!)) }, 'Kill fish'),
          h('button', { onclick: () => void this.copyReport() }, 'Copy run report'),
        ),
        h(
          'div',
          { class: 'row' },
          // The year's run (1 = typical; the spawning grounds fill for it when the stage starts, e.g. after Stage select).
          h('span', {}, 'Run'),
          ...[0.4, 1, 2.4].map((r) =>
            h('button', { onclick: () => { if (w()) { w()!.conditions.runSize = r; delete w()!.conditions.harvestRate; } } }, r === 0.4 ? 'small' : r === 1 ? 'typical' : 'big'),
          ),
        ),
        h(
          'div',
          { class: 'row' },
          // Weather (render only, src/render/weather.ts): the year's own, or fixed for a look.
          h('span', {}, 'Weather'),
          ...(
            [
              ['year', null],
              ['clear', { overcast: 0, rain: 0, wind: 0.1 }],
              ['grey', { overcast: 0.9, rain: 0, wind: 0.3 }],
              ['rain', { overcast: 1, rain: 1, wind: 0.4 }],
              ['wind', { overcast: 0.4, rain: 0, wind: 1 }],
            ] as const
          ).map(([label, wx]) => h('button', { onclick: () => (app.renderer.weatherOverride = wx ? { ...wx } : null) }, label)),
          // The year's water (flow, temperature): ordinary, a warm low-water year, or an extreme hot one. Takes effect when a stage starts.
          h('span', {}, 'Water'),
          ...DEBUG_WATER.map(([name, flow, temperature]) =>
            h('button', { onclick: () => { if (w()) Object.assign(w()!.conditions, { flow, temperature }); } }, name),
          ),
        ),
        h('div', { id: 'dbg-traits' }),
      );
    }
    const now = performance.now();
    if (now - this.last < 250) return;
    this.last = now;
    const w = app.world;
    const stats = $('dbg-stats');
    stats.textContent = `fps ${app.fps.toFixed(0)} · draw calls ${app.renderer.drawCalls} · graphics ${app.graphics.describe()}${w ? ` · ${w.stageId} t=${w.stageTime.toFixed(1)} · ${w.status}` : ''}`;
    const traits = $('dbg-traits');
    if (w && traits.dataset.fish !== w.fish.id) {
      traits.dataset.fish = w.fish.id;
      traits.replaceChildren(
        h('div', {}, 'Trait editor (z-scores)'),
        ...TRAIT_IDS.map((t) => {
          const input = h('input', { type: 'number', step: '0.25', value: w.fish.z[t].toFixed(2) });
          input.addEventListener('change', () => (w.fish.z[t] = Number(input.value)));
          return h('label', {}, t, input);
        }),
      );
    }
  }

  private async copyReport(): Promise<void> {
    const app = this.app;
    const w = app.world;
    const report = JSON.stringify({ build: import.meta.env.MODE, fps: Math.round(app.fps), drawCalls: app.renderer.drawCalls, graphics: app.graphics.describe(), run: w?.summary(), generation: app.lineage?.generation }, null, 2);
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      console.log(report);
    }
  }
}
