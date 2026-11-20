/**
 * Auto graphics quality: watches frame times while the game is being played
 * and steps quality down when it stays below the target. Pure logic (no
 * three.js, no DOM), so it is unit tested.
 *
 * Hysteresis: it only ever steps down during a session, one step per measuring
 * window, and each step is followed by a fresh warm-up and window. So it can
 * never flip up and down. The first step lowers the preset (High, Medium, Low);
 * at Low it lowers the resolution scale until a floor.
 */

export type QualityLevel = 'low' | 'medium' | 'high';
export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

export interface AutoConfig {
  /** Step down when the median frame rate over a window is below this. */
  minFps: number;
  /** Seconds ignored after starting, a stage change, a pause or a step (shader compiles, loading); wall-clock time. */
  warmup: number;
  /** Seconds of frames measured before deciding. */
  window: number;
  /**
   * A gap longer than this between played frames (paused, menus, a hidden tab)
   * restarts the warm-up. Long enough that a very slow machine (a frame a
   * second) is still measured, so it can step down.
   */
  gap: number;
  /** At Low, Auto multiplies the resolution scale by this each step, down to minScale (on top of Low's own scale). */
  scaleStep: number;
  minScale: number;
}

export const AUTO_DEFAULTS: AutoConfig = {
  // A little under 50 fps so a steady 50 Hz display does not count as slow.
  minFps: 48,
  warmup: 2,
  window: 2.5,
  gap: 5,
  scaleStep: 0.85,
  minScale: 0.7,
};

export interface AutoState {
  level: QualityLevel;
  scale: number;
}

export type AutoChange = { kind: 'level'; level: QualityLevel } | { kind: 'scale'; scale: number };

export class AutoQuality {
  level: QualityLevel;
  scale: number;
  /** Median fps of the last finished window (for the debug panel), or 0. */
  lastFps = 0;
  private warm = 0;
  private measured = 0;
  private times: number[] = [];
  private lastAt = -Infinity;
  private key: unknown = undefined;

  constructor(start: AutoState, private readonly cfg: AutoConfig = AUTO_DEFAULTS) {
    this.level = start.level;
    this.scale = Math.max(cfg.minScale, Math.min(1, start.scale));
  }

  /** Nothing lower to step to. */
  get atFloor(): boolean {
    return this.level === 'low' && this.scale <= this.cfg.minScale + 1e-6;
  }

  /** Start measuring afresh (after a step, a stage change or a pause). */
  restart(): void {
    this.warm = 0;
    this.measured = 0;
    this.times.length = 0;
  }

  /**
   * One played frame. now: a clock in seconds (frame times are measured
   * between calls, unclamped); key: anything that changes when the scene
   * changes (the stage). Returns a change to apply, or null.
   */
  frame(now: number, key?: unknown): AutoChange | null {
    const dt = now - this.lastAt;
    this.lastAt = now;
    if (dt > this.cfg.gap || dt <= 0 || key !== this.key) {
      // First frame after a pause, a menu or a new stage: no frame time to use yet.
      this.key = key;
      this.restart();
      return null;
    }
    if (this.atFloor) return null;
    if (this.warm < this.cfg.warmup) {
      this.warm += dt;
      return null;
    }
    this.times.push(dt);
    this.measured += dt;
    if (this.measured < this.cfg.window) return null;
    const sorted = [...this.times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    this.lastFps = median > 0 ? 1 / median : 0;
    this.restart();
    if (this.lastFps >= this.cfg.minFps) return null;
    return this.stepDown();
  }

  private stepDown(): AutoChange | null {
    const i = QUALITY_LEVELS.indexOf(this.level);
    if (i > 0) {
      this.level = QUALITY_LEVELS[i - 1] as QualityLevel;
      return { kind: 'level', level: this.level };
    }
    const next = Math.max(this.cfg.minScale, this.scale * this.cfg.scaleStep);
    if (next >= this.scale) return null;
    this.scale = next;
    return { kind: 'scale', scale: next };
  }
}
