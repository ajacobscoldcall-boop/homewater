/** Spawning grounds: the life's result, and how the season ends. */
import type { SpawnResult } from '../../types';
import type { World } from '../../world';
import { eggSurvival } from './female';
import { st } from './shared';

export function meanEggs(w: World): number {
  return w.p.get('spawn.eggCountBase') * w.p.get('spawn.meanEggShare');
}

export function result(w: World): SpawnResult {
  const p = w.p;
  const s = st(w);
  const base = p.get('spawn.eggCountBase');
  if (s.role === 'female') {
    const t = Math.max(-1, Math.min(1, w.fish.z.eggTradeoff / 2)) * p.get('spawn.eggTradeoffStrength');
    const eggs = Math.round(base * (1 - t));
    const survival = eggSurvival(p, s.quality, s.burial, s.superimposed, s.eggsTaken);
    const young = eggs * (1 + t) * survival;
    const dug = s.superimposed + s.steals;
    const taken = Math.round(s.eggsTaken * 100);
    return {
      eggs,
      young,
      relativeFitness: young / meanEggs(w),
      detail: `Redd quality ${(s.quality * 100).toFixed(0)}%, eggs covered ${(s.burial * 100).toFixed(0)}%, ${dug === 0 ? 'never dug into' : `dug into ${dug === 1 ? 'once' : `${dug} times`}`}${taken > 0 ? `, ${taken}% of the eggs taken by char and gulls` : ''}`,
    };
  }
  const share = s.role === 'largeMale' ? s.firstShare + s.secondShare : s.share;
  const eggs = Math.round(meanEggs(w) * share);
  const detail =
    s.role === 'jack'
      ? `${s.sneaks} successful sneak${s.sneaks === 1 ? '' : 's'}${s.jacksBeat ? `, ${s.jacksBeat} lost to other jacks` : ''}; jacks ${(s.jackFraction * 100).toFixed(1)}% of males`
      : `Fights won ${s.fightsWon}, lost ${s.fightsLost}; spawned with ${s.secondShare > 0 ? 'two females' : 'one female'}`;
  return { eggs, young: eggs, relativeFitness: eggs / meanEggs(w), detail };
}

/** The season ends when strength runs out, or at the latest when the stage's time is up. */
export function seasonOver(w: World, spent: boolean): boolean {
  return spent || w.stageTime >= w.p.get('spawn.duration');
}

export function endLife(w: World, caption: string): void {
  const s = st(w);
  if (s.spawned) {
    w.emit('caption', caption);
    w.finishLife(result(w));
  } else w.die('noSpawn');
}
