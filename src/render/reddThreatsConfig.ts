/**
 * Presentation tuning for the egg stage's silt, low-oxygen pocket and sculpin
 * (reddThreats.ts, sculpin.ts). Not simulation: the rules are in
 * src/sim/stages/eggThreats.ts and their numbers in params.json (`alevin.*`).
 */
export const REDD_FX = {
  silt: {
    /** Cloud colour the water takes as fine silt hangs in it (linear-ish hex), and how far the fog moves to it at full cloud. */
    colour: 0x7a6a4a,
    fogMix: 0.6,
    /** Fog density multiplier at full cloud (on top of the flood's). */
    density: 2.2,
    /** Light lost at full cloud. */
    dim: 0.2,
    /** Falling silt specks: count at each scenery detail level, fall speed (units/s), size, spread round the nest. */
    specks: [180, 320, 480] as readonly number[],
    fall: 0.07,
    speckSize: 0.012,
    spread: 2.4,
    /** The silt layer on the bed: colour, peak opacity, and how far it is lifted off the bed. */
    layer: 0xa08d66,
    layerOpacity: 0.55,
    layerLift: 0.012,
    /** Stones dust over with silt toward this colour, by this much at full silt. */
    stoneDust: 0.45,
  },
  pocket: {
    /** Still, oxygen-poor water: murky olive, how far the fog moves to it with the camera in the pocket, and the dark film on the bed. */
    colour: 0x3c4630,
    fogMix: 0.32,
    density: 1.25,
    film: 0x1e2416,
    filmOpacity: 0.5,
  },
  /**
   * The sculpin (drawn length MODEL_SCALE.sculpin). The sim's gravel top sits above the drawn stones, so it is drawn lying
   * on the stones (`restY`) and its head goes down toward the bed (`probeY`) as the sim's head goes down; the nose tips
   * down by up to `maxPitch`.
   */
  sculpinRestY: -1.3,
  sculpinProbeY: -1.5,
  sculpinMaxPitch: 0.32,
} as const;
