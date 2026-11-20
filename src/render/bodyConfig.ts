/**
 * Gradual body change on the return (presentation only, so it lives here and
 * not in src/data/params.json). The sim supplies how far up the home river
 * the fish has come (returnUpstream), its fat and its role; this sets how the
 * body and colours follow. Advisor: a blush on the freshwater return, full
 * spawning colours only on the grounds, so the top of the river stops short
 * of full dress.
 */
export const BODY_CHANGE = {
  /** Dress (and hump and jaw) change in this many steps up the river; each step rebuilds the player's mesh once. */
  steps: 8,
  /** Ease of the change up the river (>1: slow at first, faster near the grounds). */
  curve: 1.25,
  /** Body depth lost between full and empty fat reserves, as a fraction of depth. */
  fatThin: 0.22,
  /** Depth is rounded to this, so thinning rebuilds the mesh only now and then. */
  depthStep: 0.02,
  /** By role: dress at the top of the river (0 = first blush, 1 = full spawning colours), hump and hooked jaw at the river mouth and at the top, and extra body depth at the top. */
  male: { dressTop: 0.82, hump: [0.3, 0.82], kype: [0.3, 0.8], depthGain: 0.11 },
  /** Females darken less and grow no hump to speak of. */
  female: { dressTop: 0.6, hump: [0.02, 0.1], kype: [0, 0], depthGain: 0.03 },
  /** Jacks stay small (sim scale) and change more subtly. */
  jack: { dressTop: 0.65, hump: [0.05, 0.24], kype: [0.08, 0.32], depthGain: 0.0 },
} as const;

/** Scent specks on the return and in the lake's home-water plume are drawn this much larger than other drifting specks, so how clear the smell is reads at a glance. */
export const SCENT_SCALE = 1.8;
/** Even the faintest scent speck keeps this share of full size, so a poorly imprinted fish's scent is faint and patchy, not invisible. */
export const SCENT_FLOOR = 0.45;
