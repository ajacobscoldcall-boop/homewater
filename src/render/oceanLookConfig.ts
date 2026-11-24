/**
 * The open-water look by place and season along the ocean route (Track 2.6).
 * Presentation tuning only; the sim's light levels come from oceanView().
 */
export const OCEAN_LOOK = {
  /** Fog (water) colour by place: green coastal water, clear offshore blue, dark winter water far out. */
  fog: {
    coast: 0x1f5248,
    shelf: 0x1a4a5a,
    offshore: 0x123d5a,
    gyre: 0x123a52,
    homeward: 0x15465a,
  },
  /** Fog density multiplier by place: coastal water is murkier, offshore water clearer. */
  density: { coast: 1.45, shelf: 1.15, offshore: 0.9, gyre: 1.0, homeward: 1.0 },
  /** Light shafts by season (multiplier on the ocean's own strength). */
  shafts: { spring: 1.1, summer: 1.15, autumn: 0.8, winter: 0.4 },
  /** Winter water is a little greyer. */
  winterGrey: 0.2,
  /** A warm year tints the water a touch greener and hazier. */
  warmTint: 0x245a4c,
  warmMix: 0.32,
  /** Distant schools (the far shimmer) by season: plenty in spring and summer, few in winter. */
  schools: { spring: 1.2, summer: 1.0, autumn: 0.75, winter: 0.3 },
  /** How fast the look eases toward a new place (per second), so cuts out of a skip are soft. */
  ease: 2.5,
} as const;
