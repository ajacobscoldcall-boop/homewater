/**
 * Graphics quality: presets, the live `quality` object render code reads, and
 * the controller that applies the player's setting (Low, Medium, High or Auto).
 *
 * This is presentation, not simulation, so it lives here and not in
 * src/data/params.json (like audio tuning in src/audio/config.ts). Nothing here
 * changes the simulation: fewer school fish are drawn on Low, but the world
 * keeps every one of them.
 *
 * Render code reads `quality` when it builds a scene. When a setting that
 * shapes the scene changes, the renderer rebuilds the stage, so anything built
 * in Renderer.buildStage picks the new values up. For new environment art,
 * read `quality.envDetail` (0 sparse, 1 some, 2 full).
 */
import { AutoQuality, QUALITY_LEVELS, type AutoState, type QualityLevel } from './autoQuality';

export { QUALITY_LEVELS, type QualityLevel };
export type QualitySetting = 'auto' | QualityLevel;
export const QUALITY_SETTINGS: readonly QualitySetting[] = ['auto', 'low', 'medium', 'high'];

export interface Quality {
  level: QualityLevel;
  /** Highest device pixel ratio drawn (HiDPI screens cost the square of this). */
  maxPixelRatio: number;
  /** Multiplier on the pixel ratio: below 1 draws fewer pixels and lets the browser scale up. Auto lowers it further at Low. */
  resolutionScale: number;
  /** Multisampled edges. Fixed when the WebGL context is made, so a change shows after the next load. */
  antialias: boolean;
  /** Bottom shading: 'standard' (physically based) or 'lambert' (cheaper, nearly the same on rough gravel). */
  floorShading: 'standard' | 'lambert';
  /** Moving caustic light on the bottom: 0 none, 1 a cheaper two-step pattern, 2 full. The costliest effect. */
  caustics: 0 | 1 | 2;
  /** Number of light shafts hanging from the surface (0 to 10). */
  lightShafts: number;
  /** Number of drifting marine snow particles (0 to 700). */
  marineSnow: number;
  /** Share of instanced school fish (herring, smolts, pinks) drawn. Render only. */
  schoolFraction: number;
  /** Geometry detail of fish other than the player (rivals, mates, char, school fish). */
  fishDetail: 'high' | 'low';
  /** Environment art detail for rocks, logs, weed beds and banks: 0 sparse, 1 some, 2 full. */
  envDetail: 0 | 1 | 2;
  /** Fog density multiplier. Above 1 shortens the view a little. */
  fogScale: number;
  /** Far clip, in multiples of the distance where fog is all but opaque (fog density x distance = 2.5). 0 keeps the default far plane. */
  fogClip: number;
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, Readonly<Quality>>> = {
  high: {
    level: 'high',
    maxPixelRatio: 1.5,
    resolutionScale: 1,
    antialias: true,
    floorShading: 'standard',
    caustics: 2,
    lightShafts: 10,
    marineSnow: 700,
    schoolFraction: 1,
    fishDetail: 'high',
    envDetail: 2,
    fogScale: 1,
    fogClip: 0,
  },
  medium: {
    level: 'medium',
    maxPixelRatio: 1,
    resolutionScale: 1,
    antialias: true,
    floorShading: 'lambert',
    caustics: 1,
    lightShafts: 5,
    marineSnow: 400,
    schoolFraction: 0.75,
    fishDetail: 'high',
    envDetail: 1,
    fogScale: 1,
    fogClip: 1.2,
  },
  low: {
    level: 'low',
    maxPixelRatio: 1,
    resolutionScale: 0.8,
    antialias: false,
    floorShading: 'lambert',
    caustics: 0,
    lightShafts: 0,
    marineSnow: 200,
    schoolFraction: 0.5,
    fishDetail: 'low',
    envDetail: 0,
    fogScale: 1.12,
    fogClip: 1,
  },
};

/** The live quality. Read it; only the Graphics controller writes it. */
export const quality: Quality = { ...QUALITY_PRESETS.high };

/** Fields that change what Renderer.buildStage makes: changing one rebuilds the stage. */
const SCENE_FIELDS: (keyof Quality)[] = ['floorShading', 'caustics', 'schoolFraction', 'fishDetail', 'envDetail'];

const AUTO_KEY = 'homewater.quality.auto';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Where Auto ended up last time, so the next load starts there (with the right antialiasing). */
export function loadAutoMemory(): AutoState | null {
  try {
    const s = JSON.parse(storage()?.getItem(AUTO_KEY) ?? 'null') as Partial<AutoState> | null;
    if (!s || !QUALITY_LEVELS.includes(s.level as QualityLevel)) return null;
    const scale = typeof s.scale === 'number' && s.scale > 0 && s.scale <= 1 ? s.scale : 1;
    return { level: s.level as QualityLevel, scale };
  } catch {
    return null;
  }
}

function saveAutoMemory(s: AutoState): void {
  try {
    storage()?.setItem(AUTO_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

export function isQualitySetting(v: unknown): v is QualitySetting {
  return typeof v === 'string' && (QUALITY_SETTINGS as readonly string[]).includes(v);
}

export interface QualityChange {
  /** The stage must be rebuilt (materials or geometry depend on a changed field). */
  rebuild: boolean;
}

/** Applies the player's setting to `quality`, and runs Auto. */
export class Graphics {
  setting: QualitySetting;
  /** Antialiasing of the WebGL context, fixed when it was made. */
  readonly contextAntialias: boolean;
  /** Called after `quality` changes. */
  onChange: ((q: Quality, change: QualityChange) => void) | null = null;
  private auto: AutoQuality | null = null;

  /**
   * autoStart: where Auto begins when it has no remembered level (High, or Low
   * when the browser draws with software GL; see detectSoftwareGL).
   */
  constructor(
    setting: QualitySetting,
    private readonly autoStart: QualityLevel = 'high',
  ) {
    this.setting = setting;
    this.resolve();
    this.contextAntialias = quality.antialias;
  }

  /** The player picked a setting. */
  set(setting: QualitySetting): void {
    if (setting === this.setting) return;
    this.setting = setting;
    this.resolve();
  }

  /** One frame of play (not menus or pauses), at time now (seconds). Auto may step down. */
  frame(now: number, key: unknown): void {
    const auto = this.auto;
    if (!auto) return;
    const change = auto.frame(now, key);
    if (!change) return;
    saveAutoMemory({ level: auto.level, scale: auto.scale });
    this.apply(auto.level, auto.scale);
  }

  /** Antialiasing differs from what the page loaded with, so it changes on the next load. */
  get antialiasPending(): boolean {
    return quality.antialias !== this.contextAntialias;
  }

  /** The level in use: "High", "Low (80%)" with the resolution scale when below full. */
  current(): string {
    const name = quality.level[0]!.toUpperCase() + quality.level.slice(1);
    return quality.resolutionScale < 1 ? `${name} (${Math.round(quality.resolutionScale * 100)}% resolution)` : name;
  }

  /** For the debug panel: "Auto: Medium", "Low (80% resolution)". */
  describe(): string {
    return this.setting === 'auto' ? `Auto: ${this.current()}` : this.current();
  }

  /** Median fps Auto last measured (0 before the first window). */
  get measuredFps(): number {
    return this.auto?.lastFps ?? 0;
  }

  private resolve(): void {
    if (this.setting === 'auto') {
      const start = loadAutoMemory() ?? { level: this.autoStart, scale: 1 };
      this.auto = new AutoQuality(start);
      this.apply(this.auto.level, this.auto.scale);
    } else {
      this.auto = null;
      this.apply(this.setting, 1);
    }
  }

  private apply(level: QualityLevel, scale: number): void {
    const before = { ...quality };
    Object.assign(quality, QUALITY_PRESETS[level]);
    // Auto's scale multiplies the preset's own.
    quality.resolutionScale = QUALITY_PRESETS[level].resolutionScale * scale;
    const rebuild = SCENE_FIELDS.some((f) => before[f] !== quality[f]);
    this.onChange?.(quality, { rebuild });
  }
}
