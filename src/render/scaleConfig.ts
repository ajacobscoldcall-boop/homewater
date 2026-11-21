/**
 * How big every model is drawn: presentation tuning, read by the Renderer, the
 * ocean food swarm, the scavengers, the model gallery's to-scale view
 * (?gallery=scale) and the scale audit (tests/unit/scale.test.ts), which checks
 * each one against the sim's sizes and real animals.
 *
 * World units are not the same length in every stage: the camera frames a
 * 2 cm alevin and a 60 cm adult alike. Each stage's length of a unit comes from
 * the player's fish (see STAGE_METRES in scaleLineup.ts). A model's scale is
 * the factor applied to its geometry, which is about one unit long (fish and
 * animals) unless noted.
 */
export const MODEL_SCALE = {
  /** Egg stage: an egg's radius, and how much eggs vary (± share). */
  eggRadius: 0.045,
  eggVary: 0.08,
  /** Brood-mates after hatching (the player's alevin is the sim's 0.35). */
  brood: 0.28,

  /** Fry stage: plankton drawn as small swarms; each speck's size, and how far the swarm spreads round the sim's food point. */
  planktonSpeck: 0.028,
  planktonCloud: 0.32,
  /** Specks per food point at each scenery detail level (Low, Medium, High). */
  planktonSpecks: [5, 8, 11] as readonly number[],

  /** Smolt run: school-mates are drawn at the player's own size times this range (a little smaller on average, so the player stands out). */
  smoltMateMin: 0.84,
  smoltMateMax: 1.0,

  /** Dolly Varden / char, the same model in the lake and at the outlet. */
  char: 3.2,
  /** The same char on the spawning grounds, eating loose eggs below the redds (adult-stage units). */
  charGrounds: 0.6,
  /** Common merganser: on the smolt run, and over the lake (where a world unit is a fry's length, so it is drawn larger). */
  merganser: 3.4,
  merganserFry: 7.6,
  /** A gull plunging at the smolt school. */
  gullPlunge: 3.8,
  /** Harbor seal: in the river (smolt run) and at sea. */
  sealSmolt: 10,
  sealOcean: 2.4,
  orca: 9,
  shark: 3.3,
  /** Pink salmon in a crowded year. */
  pink: 0.72,

  /** Ocean food: one krill (geometry about 1.65 long with its antennae), the small fish and squid among them. */
  krill: 0.021,
  foodFish: 0.11,
  squid: 0.13,
  /** Krill drawn round each food point at each scenery detail level (Low, Medium, High), and the cloud's radius. */
  krillPer: [12, 18, 24] as readonly number[],
  krillCloud: 0.5,
  /** More krill round each food point drawn as soft points (a swarm is dense; meshes for all would be too many), and their size. */
  krillHaze: [18, 30, 42] as readonly number[],
  krillSpeck: 0.03,

  /** Return and grounds. */
  jack: 0.42,
  lure: 0.32,
  netFloat: 0.08,
  /** Gillnet mesh square, world units. */
  netMesh: 0.17,
  /** Scavengers on the grounds (scavengersConfig.ts reads these). */
  gull: 0.85,
  eagle: 1.0,
  bear: 1.0,
} as const;

/** A school-mate's drawn scale: the player's size times a fixed share per fish id, so it never changes frame to frame. */
export function smoltMateScale(playerScale: number, id: number): number {
  const h = Math.sin(id * 12.9898 + 4.1414) * 43758.5453;
  const f = h - Math.floor(h);
  return playerScale * (MODEL_SCALE.smoltMateMin + (MODEL_SCALE.smoltMateMax - MODEL_SCALE.smoltMateMin) * f);
}

/** An egg's drawn radius: the configured size, varied a little per egg. */
export function eggRadius(id: number): number {
  const h = Math.sin(id * 78.233 + 1.7) * 43758.5453;
  const f = h - Math.floor(h);
  return MODEL_SCALE.eggRadius * (1 + MODEL_SCALE.eggVary * (2 * f - 1));
}
