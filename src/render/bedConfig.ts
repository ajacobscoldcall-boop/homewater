/**
 * Fish resting on the drawn bed (bedRest.ts): presentation tuning, render only.
 */
export const BED = {
  /** Slices along the body when finding its lowest points (fins included). */
  slices: 9,
  /**
   * How high the drawn cobble stands above the sim's floor, as a multiple of the patch's cobble size.
   * env/gravel.ts sets stones 0.2 × size above the floor at 0.7-1.2 × the cobble, on rocks about 0.7 of their
   * radius tall: the tallest stand about 1.05 × the cobble.
   */
  stoneTop: 1.05,
  /** Fraction of a patch's radius inside which its stones stand full height; they ease off to the edge. */
  rim: 0.8,
  /** The scenery's ground counts as the bed only where it is within this of the sim's floor (not a bank top or overhang). */
  groundStep: 0.5,
  /** Gap left between the lowest point of the body and the drawn bed (world units). */
  margin: 0.02,
  /** Never lift a fish more than this (world units): a larger gap means something else is wrong. */
  maxLift: 0.6,
  /** Easing rates (1/s): rising out of the bed fast, settling back slowly. */
  rise: 18,
  settle: 4,
} as const;
