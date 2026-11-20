/** Menu navigation tuning (src/ui/menuNav.ts): presentation only, not simulation. */
export const MENU_NAV = {
  /** A control must be at least this many pixels further along the direction to count as "next". */
  minStep: 4,
  /** Distance across the direction counts this many times more than distance along it. */
  acrossWeight: 2,
  /** Left stick deflection that counts as a D-pad press. */
  stick: 0.55,
  /** Holding a direction on the pad repeats after this long (ms)... */
  repeatDelay: 420,
  /** ...then every this many ms. */
  repeatEvery: 160,
} as const;
