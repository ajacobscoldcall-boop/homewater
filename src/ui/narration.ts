/**
 * Plays recorded narration for captions. A line plays only if its file is
 * listed in public/audio/manifest.json, so missing recordings never cause
 * failed requests. Captions with a value in them (for example {years}) play
 * a variant file named <id>--<value>.mp3 when one exists.
 */
let available: Set<string> | null = null;
let current: HTMLAudioElement | null = null;
let enabled = true;

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
  current = new Audio(`${base()}audio/${file}.mp3`);
  current.volume = 0.9;
  void current.play().catch(() => undefined);
}
