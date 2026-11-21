/**
 * How the crowd on the spawning grounds is drawn (presentation only; the
 * crowd's rules and numbers are in src/sim/stages/spawn/crowd.ts and params.json).
 */
export const CROWD_FX = {
  /**
   * Share of the crowd's fish and carcasses drawn at each graphics preset (chosen by id, so the same fish stay drawn).
   * The sim keeps them all; this only thins the drawing on slower machines.
   */
  drawn: { low: 0.35, medium: 0.6, high: 1 } as Readonly<Record<string, number>>,
  /** Graphics presets that shade the crowd with Lambert instead of the standard material. */
  lambertOn: ['low'] as readonly string[],
  /** Graphics presets that draw the crowd with the detailed fish model; the others use the simple one. */
  detailedOn: ['high'] as readonly string[],
  /** Most instances drawn per kind (the sim caps the crowd at spawn.crowd.max). */
  max: { crowdFemale: 80, crowdMale: 80, crowdJack: 16, crowdCarcass: 50, crowdRedd: 90 },
  /** Drawn size relative to the sim's size value (the player's female and guard male use the same factors). */
  scale: { F: 0.95, M: 1.05, J: 1 },
  /** Tail beat: wave speed of the shared clock, and the bend by what the fish is doing. */
  swimRate: 6.5,
  amp: { hold: 0.045, swim: 0.07, court: 0.06, dig: 0.11, fight: 0.15, fade: 0.025 },
  /** A digging female rolls onto her side to beat her tail on the gravel: how far (rad), how often (rad/s), how sharp the pulse. */
  digRoll: 1.15,
  digRate: 2.1,
  digSharp: 3,
  /** A fighting male's roll and a spent fish's list (rad). */
  fightRoll: 0.35,
  fadeList: 0.55,
  /** Tint for a spent fish (multiplies the spawning colours), reached as its strength runs out. */
  fadeTint: [0.62, 0.6, 0.58] as const,
  /** A dead fish: dull red going grey-brown over `carcassAge` seconds, lying on its side. */
  carcassFresh: [0.62, 0.42, 0.38] as const,
  carcassOld: [0.5, 0.47, 0.42] as const,
  carcassAge: 40,
  /**
   * Redds: a darker pit inside a pale rim of cleaned gravel (colours, then tints by state: brightest while
   * being dug, dulling once spent), stretched along the stream; drawn just above the bed.
   */
  redd: { radius: 1.05, stretch: 1.35, pit: 0x5c5444, rim: 0xc9bc9c, alpha: 0.9, dug: [1.08, 1.06, 1.02] as const, buried: [1, 1, 1] as const, left: [0.86, 0.85, 0.82] as const, lift: 0.04 },
} as const;
