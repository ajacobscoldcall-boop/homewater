/**
 * Presentation tuning for the offspring cards, the paged recap and the life
 * route map (src/ui/offspringFit.ts, recap.ts, lifeMap.ts). Not game logic:
 * nothing here changes the simulation, so it lives next to the UI, not in params.json.
 */
export const RECAP = {
  fit: {
    /** A trait (in population standard deviations of the inherited value) must lean at least this far for its card line. */
    lineMin: 0.4,
    /** The best fit must score at least this much for the Suggested badge... */
    suggestMin: 0.5,
    /** ...and beat the next offspring by this much, or no badge is shown. */
    suggestMargin: 0.25,
    /** Trait bars run from -limit to +limit population standard deviations. */
    barLimit: 2,
  },
  portrait: {
    /** Portrait size in CSS pixels (drawn at this × the pixel ratio below). */
    width: 240,
    height: 120,
    /** Pixel ratio by graphics level: Low draws small and without antialiasing. */
    ratio: { low: 1, medium: 1.5, high: 2 } as Record<'low' | 'medium' | 'high', number>,
    /** Fat left on the spawning grounds, for the portrait's body (bodyChange.ts). */
    fat: 0.5,
    /** A male whose inherited jack leaning is above this (population SDs) is drawn as a jack. */
    jackFrom: 1,
    background: 0x123a42,
  },
} as const;
