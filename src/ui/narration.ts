/**
 * Plays recorded narration for captions. A line plays only if its file is
 * listed in public/audio/manifest.json, so missing recordings never cause
 * failed requests. Captions with a value in them (for example {years}) play
 * a variant file named <id>--<value>.mp3 when one exists.
 *
 * The same manifest lists recorded music slots (music.<slot>.mp3); the audio
 * engine plays those in place of its generated score (see docs/audio.md).
 */
let available: Set<string> | null = null;
let current: HTMLAudioElement | null = null;
let enabled = true;
let volume = 1;
const NARRATION_LEVEL = 0.9;
let speaking: (on: boolean) => void = () => undefined;

/** Called with true while a line is playing and false when it stops (for ducking). */
export function onSpeaking(cb: (on: boolean) => void): void {
  speaking = cb;
}

/** Player volume for narration (0 when muted). */
export function setNarrationVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (current) current.volume = NARRATION_LEVEL * volume;
}

/** True if a recording with this id is listed in the manifest (narration lines and music slots). */
export function hasRecording(id: string): boolean {
  return !!available && available.has(id);
}

export function recordingUrl(id: string): string {
  return `${base()}audio/${id}.mp3`;
}

const notify = (): void => speaking(!!current && !current.paused && !current.ended);

const base = (): string => import.meta.env.BASE_URL ?? '/';

export async function loadNarration(): Promise<void> {
  try {
    const res = await fetch(`${base()}audio/manifest.json`, { cache: 'no-cache' });
    const data = (await res.json()) as { lines?: string[] };
    available = new Set(data.lines ?? []);
  } catch {
    available = new Set();
  }
}

export function setNarration(on: boolean): void {
  enabled = on;
  if (!on) current?.pause();
  notify();
}

export function narrationEnabled(): boolean {
  return enabled;
}

export function hasNarration(): boolean {
  return !!available && available.size > 0;
}

/** Play the recording for a caption, interrupting any line already playing. */
export function narrate(id: string, vars: Record<string, string | number> = {}): void {
  if (!enabled || !available) return;
  const values = Object.values(vars);
  const file = values.length ? `${id}--${values.join('-')}` : id;
  if (!available.has(file)) return;
  current?.pause();
  const el = new Audio(recordingUrl(file));
  current = el;
  el.volume = NARRATION_LEVEL * volume;
  for (const type of ['playing', 'pause', 'ended', 'error']) el.addEventListener(type, notify);
  void el.play().then(notify, notify);
}
