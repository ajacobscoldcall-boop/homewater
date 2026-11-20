/**
 * Text diet tuning (presentation, not simulation): which captions are
 * warnings, which teach the player what to do, the short on-screen version of
 * long lines, and the caption queue's timing. Everything not listed is a
 * science line. See src/app/captionQueue.ts and docs/feel.md.
 */

export type CaptionTier = 'warning' | 'guide' | 'science';

/** Lines about a threat or a change that needs action now. They jump the queue. */
export const WARNING_CAPTIONS: readonly string[] = [
  'egg.flow',
  'egg.loosening',
  'egg.floodComing',
  'egg.flood',
  'egg.tooEarly',
  'fry.trout',
  'fry.starving',
  'smolt.char',
  'smolt.bird',
  'smolt.merganser',
  'smolt.gulls',
  'smolt.seal',
  'smolt.alone',
  'ocean.orca',
  'ocean.shark',
  'ocean.seal',
  'return.bear',
  'return.lowFat',
  'return.heatStress',
  'return.hooked',
  'return.angler',
  'return.lostTrack',
  'return.wrongBranch',
  'return.wrongRiver',
  'return.overshoot',
  'spawn.rivalFemale',
  'spawn.rivalMale',
  'spawn.bear',
  'spawn.jackWindow',
  'spawn.femaleReady',
  'spawn.superimposed',
  'spawn.jackSpotTaken',
  'spawn.needGravel',
];

/** Lines that tell the player what to do (guide-critical). They come before science lines. */
export const GUIDE_CAPTIONS: readonly string[] = [
  'help.mouseLock',
  'egg.ready',
  'fry.controls',
  'fry.lesson',
  'fry.dusk',
  'fry.winterHint',
  'fry.decide',
  'fry.second',
  'imprint.fryHint',
  'imprint.smolt',
  'smolt.intro',
  'smolt.nearMiss',
  'ocean.intro',
  'return.track',
  'return.fatHint',
  'return.pastNets',
  'return.heat',
  'return.coolSeep',
  'return.coolPool',
  'return.rapids',
  'return.eddy',
  'return.falls',
  'return.leapFail',
  'return.sideChannel',
  'spawn.female',
  'spawn.largeMale',
  'spawn.jack',
  'spawn.jackBeach',
  'spawn.cobbleLarge',
  'spawn.cobbleSmall',
  'spawn.reddReady',
  'spawn.waitMale',
  'spawn.bury',
  'spawn.buried',
  'spawn.secondFemale',
  'spawn.senescence',
];

/**
 * Long lines and the short line shown on screen in their place. The short
 * line has its own caption ID (and its own recording); the full line is one
 * click away ("more") and always in the journal's "This life" page.
 */
export const SHORT_CAPTIONS: Readonly<Record<string, string>> = Object.fromEntries(
  [
    'egg.intro',
    'egg.hatch',
    'egg.floodComing',
    'egg.floodOver',
    'imprint.egg',
    'imprint.fryHint',
    'imprint.smolt',
    'fry.controls',
    'fry.lesson',
    'fry.dusk',
    'fry.winterHint',
    'fry.decide',
    'smolt.intro',
    'smolt.char',
    'smolt.nearMiss',
    'smolt.salt',
    'ocean.intro',
    'ocean.orca',
    'ocean.revealJack',
    'ocean.yearsAtSea',
    'ocean.crowded',
    'ocean.autumnMale',
    'return.netSlip',
    'return.bear',
    'return.heat',
    'return.coolSeep',
    'return.coolPool',
    'return.track',
    'return.overshoot',
    'return.scent.weak',
    'return.migrants',
    'return.rapids',
    'return.falls',
    'return.firstLeap',
    'return.leapFail',
    'return.sideChannel',
    'spawn.female',
    'spawn.largeMale',
    'spawn.jack',
    'spawn.jackBeach',
    'spawn.jackSuccess',
    'spawn.bear',
    'spawn.habitat.creek',
    'spawn.habitat.river',
    'spawn.habitat.beach',
    'spawn.femaleChoice',
    'spawn.superimposed',
    'spawn.senescence',
    'spawn.spentFemale',
    'spawn.secondFemale',
    'spawn.jackCommon',
    'spawn.jackRare',
  ].map((id) => [id, `${id}.short`]),
);

export const CAPTION_QUEUE = {
  /** How long a caption stays, by its length: base + per character, capped (ms). */
  baseMs: 3000,
  perCharMs: 42,
  maxMs: 9000,
  /** With lines waiting, the one showing gives way after this share of its time, but never before minShowMs. */
  busyShare: 0.6,
  minShowMs: 2200,
  /** A warning stays at least this long, even with another waiting. */
  warningMinMs: 2500,
  /** Pause between one caption and the next, so the change reads (ms). */
  gapMs: 350,
  /** How long a line may wait before it goes to the journal instead (warnings past this are stale and dropped). */
  maxWaitMs: { warning: 2500, guide: 10000, science: 8000 } as Record<CaptionTier, number>,
  /** At most this many lines wait; the lowest and oldest goes to the journal first. */
  maxWaiting: 4,
  /** A line cut short by a warning goes back to the front of the queue if it had shown for less than this. */
  requeueUnderMs: 2000,
  /** Fade-out time; matches the CSS transition on .caption (ms). */
  fadeMs: 500,
} as const;

export type CaptionQueueConfig = typeof CAPTION_QUEUE;

const WARN = new Set(WARNING_CAPTIONS);
const GUIDE = new Set(GUIDE_CAPTIONS);

export function captionTier(id: string): CaptionTier {
  return WARN.has(id) ? 'warning' : GUIDE.has(id) ? 'guide' : 'science';
}
