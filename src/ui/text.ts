/** Player-facing wording for traits, stages and results. */
import captionsFile from '../data/captions.json';
import { describeZ, yearFavours } from '../sim/genetics';
import { withKeys } from '../input/bindings';
import type { DeathCause, FishIdentity, Habitat, StageId, TraitValues, YearConditions } from '../sim/types';

const CAPTIONS = (captionsFile as { captions: Record<string, string> }).captions;

export function caption(id: string, vars: Record<string, string | number> = {}): string | null {
  const text = CAPTIONS[id];
  if (!text) return null;
  // Key placeholders ({key:burst}) show the player's own keys; see src/input/bindings.ts.
  return withKeys(text).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export const STAGE_TITLES: Record<StageId, string> = {
  egg: 'Egg and alevin',
  fry: 'Fry in the lake',
  smolt: 'The smolt run',
  ocean: 'Ocean years',
  return: 'The return',
  spawn: 'Spawning',
};

export function stageCardLine(stage: StageId, oceanYears: number | null, habitat?: Habitat): string {
  switch (stage) {
    case 'egg':
      return 'Autumn. An egg in the gravel.';
    case 'fry':
      return 'Spring. Out of the gravel and into the lake.';
    case 'smolt':
      return 'Spring. Out of the lake by night, to the estuary at first light.';
    case 'ocean':
      return 'Past the estuary, out into the open sea.';
    case 'return':
      return `${oceanYears ?? 2} year${oceanYears === 1 ? '' : 's'} at sea. Summer, and the pull of home.`;
    case 'spawn':
      return habitat === 'beach' ? 'Late summer. Across the lake, the beach where it hatched.' : habitat === 'river' ? 'Late summer. Across the lake and up the river where it hatched.' : 'Late summer. Across the lake and up the creek where it hatched.';
  }
}

/** Objectives with key placeholders ({key:dive}); read through OBJECTIVES, which fills in the player's keys. */
const OBJECTIVE_TEXT: Record<StageId, string> = {
  egg: 'Face into the current {key:steer}. Stay low {key:dive} in surges, and deep through the flood. When the yolk is nearly used, swim up {key:rise}.',
  fry: 'Live the lake days: deep by day, up at dusk and dawn to feed. Dart into the weeds when a Dolly Varden chases; dive deep from a merganser. Rest through the winter. In spring, follow the current out or stay another year.',
  smolt: 'Ride the current to the sea with the school. Go deep for birds, burst from mergansers, swim across a seal\'s path. In the estuary, hold in the brackish water until you are ready for salt.',
  ocean: 'Feed where the food gathers. When an orca or shark charges, swim across its path.',
  return: 'Follow the faint magnetic track to the coast. Slip through the nets, find the right river mouth, then swim upstream and follow the scent across the lake. Wait there until the spawning colours come on.',
  spawn: 'Spawn before your strength runs out. It will not come back.',
};

export const OBJECTIVES: Readonly<Record<StageId, string>> = Object.defineProperties(
  {} as Record<StageId, string>,
  Object.fromEntries((Object.keys(OBJECTIVE_TEXT) as StageId[]).map((s) => [s, { enumerable: true, get: () => withKeys(OBJECTIVE_TEXT[s]) }])),
);

export const DEATH_TITLES: Record<DeathCause, string> = {
  silt: 'Smothered',
  scour: 'Washed out',
  yolk: 'Out of yolk',
  exposed: 'Seen and eaten',
  char: 'Taken by a char',
  merganser: 'Taken by a merganser',
  seal: 'Taken by a seal',
  sea: 'Lost at sea',
  shark: 'Taken by a salmon shark',
  angler: 'Landed by an angler',
  trout: 'Taken by a Dolly Varden',
  bird: 'Taken by a bird',
  orca: 'Taken by an orca',
  gillnet: 'Caught in a net',
  bear: 'Taken by a bear',
  exhaustion: 'Exhausted',
  noSpawn: 'No spawn',
  heat: 'Heat stress',
  gull: 'Taken by a gull',
};

export function traitLines(fish: FishIdentity, z: TraitValues = fish.z): string[] {
  const home = fish.habitat === 'beach' ? 'lake beach' : fish.habitat;
  const lines = [
    `Home: ${home}`,
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
  return yearFavours(c)
    .map((id) => caption(id) ?? '')
    .filter(Boolean)
    .join(' ');
}

export const sexSymbol = (s: 'F' | 'M') => (s === 'F' ? '♀ female' : '♂ male');
