/**
 * window.__hw: a handle for automated tests and playtesting.
 * Reads state and drives the game without the mouse.
 */
import type { App } from '../app/App';

export interface DebugHandle {
  app: App;
  state(): Record<string, unknown> | null;
  step(n: number): void;
  completeStage(): void;
  click(selector: string): boolean;
  screenText(): string;
}

declare global {
  interface Window {
    __hw?: DebugHandle;
  }
}

export function installDebugHandle(app: App): void {
  window.__hw = {
    app,
    state: () => (app.world ? { mode: app.mode, ...app.world.summary() } : null),
    step: (n) => app.stepSim(n),
    completeStage: () => {
      app.world?.debugComplete();
      app.stepSim(0);
    },
    click: (selector) => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return false;
      el.click();
      return true;
    },
    screenText: () => document.getElementById('screen')?.innerText ?? '',
  };
}
