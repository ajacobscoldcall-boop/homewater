/**
 * The opt-in play log (Track 0 of docs/IMPROVEMENT_PLAN.md): what App hooks
 * into. Off by default. When on, each life's stage attempts are kept in this
 * browser's localStorage (src/telemetry/store.ts) and can be exported as a
 * JSON file from the Play log page (src/ui/playLogPanel.ts). There is no
 * network code here or anywhere in the log: nothing is ever sent.
 *
 * App's one hook: `playLog.observe(world, events, hits)` wherever it handles
 * drained SimEvents. Format: src/telemetry/types.ts. Summaries:
 * scripts/playlog/ (`npm run playlog -- <files>`), see docs/playtesting.md.
 */
import type { SimEvent } from '../sim/types';
import type { World } from '../sim/world';
import { PLAYLOG } from './config';
import { PlayLogRecorder } from './recorder';
import { clearLives, exportFile, readEnabled, readLives, upsertLife, writeEnabled, type KeyValueStore } from './store';
import type { LifeLog, PlayLogFile, PlayLogSettings } from './types';

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export class PlayLog {
  private on: boolean;
  private recorder: PlayLogRecorder;
  private lastFlush = 0;
  private dirty: LifeLog | null = null;

  constructor(
    settings: () => PlayLogSettings,
    private readonly store: KeyValueStore | null = browserStore(),
    private readonly now: () => number = () => Date.now(),
  ) {
    this.on = readEnabled(store);
    this.recorder = new PlayLogRecorder({
      now,
      settings,
      onChange: (life, ended) => {
        this.dirty = life;
        if (ended || now() - this.lastFlush > PLAYLOG.flushEvery * 1000) this.flush();
      },
    });
    // Keep the attempt in progress if the tab is closed or reloaded.
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.flush());
  }

  get enabled(): boolean {
    return this.on;
  }

  setEnabled(on: boolean): void {
    if (on === this.on) return;
    if (!on) {
      this.recorder.finish();
      this.flush();
    }
    this.on = on;
    writeEnabled(this.store, on);
  }

  /** The hook: call with each batch of drained SimEvents and the renderer's near-miss count. */
  observe(world: World | null, events: SimEvent[], hits = 0): void {
    if (this.on) this.recorder.observe(world, events, hits);
  }

  lives(): LifeLog[] {
    this.flush();
    return readLives(this.store);
  }

  file(): PlayLogFile {
    return exportFile(this.lives());
  }

  clear(): void {
    this.recorder.finish();
    this.dirty = null;
    clearLives(this.store);
  }

  private flush(): void {
    const life = this.dirty;
    this.dirty = null;
    this.lastFlush = this.now();
    if (life) upsertLife(this.store, life);
  }
}
