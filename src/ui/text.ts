/** Player-facing wording for traits, stages and results. */
import captionsFile from '../data/captions.json';
import { describeZ } from '../sim/genetics';
import type { DeathCause, FishIdentity, StageId, TraitValues, YearConditions } from '../sim/types';

const CAPTIONS = (captionsFile as { captions: Record<string, string> }).captions;

export function caption(id: string, vars: Record<string, string | number> = {}): string | null {
  const text = CAPTIONS[id];
  if (!text) return null;
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export const STAGE_TITLES: Record<StageId, string> = {
  egg: 'Egg and alevin',
  fry: 'Fry in the lake',
  smolt: 'The smolt run',
  ocean: 'Ocean years',
  return: 'The return',
  spawn: 'Spawning',
};

export function stageCardLine(stage: StageId, oceanYears: number | null): string {
  switch (stage) {
    case 'egg':
      return 'Autumn. An egg in the creek gravel.';
    case 'fry':
      return 'Spring. Out of the gravel and into the lake.';
    case 'smolt':
      return 'A year later, the fry is ready to leave.';
    case 'ocean':
      return 'Out past the estuary, into the open sea.';
    case 'return':
      return `${oceanYears ?? 2} year${oceanYears === 1 ? '' : 's'} at sea. Summer, and the pull of home.`;
    case 'spawn':
      return 'Late summer. The gravel where it all began.';
  }
}

export const OBJECTIVES: Record<StageId, string> = {
  egg: 'Face into the current (A/D or mouse). Stay low (C) in surges. When the yolk is nearly used, swim up (Space).',
  fry: 'Feed on plankton until you have grown enough. The weeds are safe from Dolly Varden.',
  smolt: 'Ride the current to the sea with the school. Go deep for birds, burst from mergansers, swim across a seal\'s path.',
  ocean: 'Feed on the herring. When an orca or shark charges, swim across its path.',
  return: 'Follow the faint magnetic track to the coast. Slip through the nets, find the right river mouth, then swim upstream and follow the scent.',
  spawn: 'Spawn before the season ends.',
};

export const DEATH_TITLES: Record<DeathCause, string> = {
  silt: 'Smothered',
  scour: 'Washed out',
  exposed: 'Seen and eaten',
  char: 'Taken by a char',
  merganser: 'Taken by a merganser',
  seal: 'Taken by a seal',
  sea: 'Lost at sea',
  shark: 'Taken by a salmon shark',
  trout: 'Taken by a Dolly Varden',
  bird: 'Taken by a bird',
  orca: 'Taken by an orca',
  gillnet: 'Caught in a net',
  bear: 'Taken by a bear',
  exhaustion: 'Exhausted',
  noSpawn: 'No spawn',
};

export function traitLines(fish: FishIdentity, z: TraitValues = fish.z): string[] {
  const lines = [
    `Size: ${describeZ(z.size, 'small', 'average', 'large')}`,
    `Body: ${describeZ(z.bodyDepth, 'streamlined', 'average depth', 'deep-bodied')}`,
    `Run timing: ${describeZ(z.runTiming, 'early', 'mid-season', 'late')}`,
    `Homing: ${describeZ(z.homing, 'prone to wander', 'steady', 'very faithful')}`,
  ];
  if (fish.sex === 'M') {
    lines.unshift(fish.lockedJack ? 'Strategy: jack (locked)' : `Strategy: ${describeZ(z.jack, 'likely large male', 'could go either way', 'jack-leaning')}`);
    lines.push(`Sea years: ${describeZ(z.oceanAge, 'tends to fewer', 'average', 'tends to more')}`);
  } else {
    lines.push(`Eggs: ${describeZ(z.eggTradeoff, 'many and small', 'balanced', 'fewer and larger')}`);
    lines.push(`Sea years: ${describeZ(z.oceanAge, 'tends to fewer', 'average', 'tends to more')}`);
  }
  return lines;
}

export function yearLine(c: YearConditions): string {
  const w = (v: number, lo: string, hi: string) => (v < 0.88 ? lo : v > 1.12 ? hi : '');
  const parts = [w(c.flow, 'low water', 'high water'), w(c.temperature, 'a cool year', 'a warm year'), w(c.oceanCrowding, 'an open ocean', 'a crowded ocean'), w(c.runSize, 'a small run', 'a big run')].filter(Boolean);
  return parts.length ? `This year: ${parts.join(', ')}.` : 'An ordinary year.';
}

export const sexSymbol = (s: 'F' | 'M') => (s === 'F' ? '♀ female' : '♂ male');
