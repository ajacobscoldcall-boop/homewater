/**
 * Player settings kept per browser in localStorage (`homewater.settings`), not
 * in the save: gore, volume, mute, narration volume, the graphics preset, and
 * whether the content warning has been shown (first-run setup, screens/setup.ts).
 */
import { AUDIO } from '../audio/config';
import { isQualitySetting, type QualitySetting } from '../render/quality';

export interface Settings {
  gore: 'unflinching' | 'documentary';
  /** Sound volume, 0..1. */
  volume: number;
  muted: boolean;
  /** Narration volume, 0..1, on top of the sound volume (Settings, Audio). */
  narrationVolume: number;
  /** Graphics preset (src/render/quality.ts). */
  quality: QualitySetting;
  /** The content warning and gore choice were shown before a first life (then they live in Settings, Content). */
  contentSeen: boolean;
}

const KEY = 'homewater.settings';
export const DEFAULT_VOLUME: number = AUDIO.master.defaultVolume;
/** ?quality=low|medium|high|auto overrides the saved graphics setting for one load. */
export const QUALITY_URL_PARAM = 'quality';

const unit = (v: unknown, d: number): number => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);

/** Settings from their stored JSON (null when nothing is stored); anything missing or invalid takes its default. */
export function parseSettings(raw: string | null): Settings {
  try {
    const s = JSON.parse(raw ?? '{}') as Partial<Settings>;
    return {
      gore: s.gore === 'documentary' ? 'documentary' : 'unflinching',
      volume: unit(s.volume, DEFAULT_VOLUME),
      muted: s.muted === true,
      narrationVolume: unit(s.narrationVolume, 1),
      quality: isQualitySetting(s.quality) ? s.quality : 'auto',
      contentSeen: s.contentSeen === true,
    };
  } catch {
    return { gore: 'unflinching', volume: DEFAULT_VOLUME, muted: false, narrationVolume: 1, quality: 'auto', contentSeen: false };
  }
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return parseSettings(null);
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
