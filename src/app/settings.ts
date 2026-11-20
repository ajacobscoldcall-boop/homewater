/**
 * Player settings kept per browser in localStorage (`homewater.settings`), not
 * in the save: gore, volume, mute and the graphics preset.
 */
import { AUDIO } from '../audio/config';
import { isQualitySetting, type QualitySetting } from '../render/quality';

export interface Settings {
  gore: 'unflinching' | 'documentary';
  /** Sound volume, 0..1. */
  volume: number;
  muted: boolean;
  /** Graphics preset (src/render/quality.ts). */
  quality: QualitySetting;
}

const KEY = 'homewater.settings';
export const DEFAULT_VOLUME: number = AUDIO.master.defaultVolume;
/** ?quality=low|medium|high|auto overrides the saved graphics setting for one load. */
export const QUALITY_URL_PARAM = 'quality';

/** Settings from their stored JSON (null when nothing is stored); anything missing or invalid takes its default. */
export function parseSettings(raw: string | null): Settings {
  try {
    const s = JSON.parse(raw ?? '{}') as Partial<Settings>;
    const volume = typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1 ? s.volume : DEFAULT_VOLUME;
    return { gore: s.gore === 'documentary' ? 'documentary' : 'unflinching', volume, muted: s.muted === true, quality: isQualitySetting(s.quality) ? s.quality : 'auto' };
  } catch {
    return { gore: 'unflinching', volume: DEFAULT_VOLUME, muted: false, quality: 'auto' };
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
