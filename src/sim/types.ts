/** Shared simulation types. Plain data only, so state can be saved and inspected. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const TRAIT_IDS = ['size', 'jack', 'runTiming', 'oceanAge', 'homing', 'bodyDepth', 'eggTradeoff'] as const;
export type TraitId = (typeof TRAIT_IDS)[number];
export type TraitValues = Record<TraitId, number>;

export type Sex = 'F' | 'M';
export const HABITATS = ['creek', 'river', 'beach'] as const;
export type Habitat = (typeof HABITATS)[number];

export const STAGE_IDS = ['egg', 'fry', 'smolt', 'ocean', 'return', 'spawn'] as const;
export type StageId = (typeof STAGE_IDS)[number];

/** Who the fish is: inherited and fixed for its life. */
export interface FishIdentity {
  id: string;
  name: string;
  sex: Sex;
  generation: number;
  /** Breeding values (standardized, population mean 0). */
  bv: TraitValues;
  /** Expressed values: breeding value plus environment (standardized). */
  z: TraitValues;
  habitat: Habitat;
  /** Male whose jack life history is locked in (the "start as a jack" preset). */
  lockedJack: boolean;
  isStray: boolean;
  parentId?: string;
}

export interface YearConditions {
  /** Multipliers around 1.0. */
  flow: number;
  temperature: number;
  oceanCrowding: number;
  runSize: number;
  /**
   * From the river's population (src/sim/population.ts, saves schema 4).
   * Optional: a world built without a population plays a typical year.
   */
  /** Food per fry in the lake, relative to a typical year. */
  lakeFood?: number;
  /** Fry in the lake, relative to a typical cohort. */
  fryCrowding?: number;
  /** Share of this year's run the fishery takes. */
  harvestRate?: number;
}

/** Things that change over the course of one life. Snapshotted at checkpoints. */
export interface LifeProgress {
  yolk: number;
  fryBites: number;
  fryRichBites: number;
  oceanBites: number;
  /** 0..1, how well the fish fed overall. */
  growthPerf: number;
  isJack: boolean | null;
  oceanYears: number | null;
  /** Size at return, in size units (about 1 = typical adult). */
  adultSize: number | null;
  fat: number;
  /** 0..1, how well the fish learned the smell of home as a young fish (imprint.ts; saves schema 4). */
  imprint: number;
}

export type EntityKind =
  | 'plankton'
  | 'weed'
  | 'trout'
  | 'birdShadow'
  | 'herring'
  | 'orca'
  | 'netLine'
  | 'netGap'
  | 'bear'
  | 'scent'
  | 'wall'
  | 'gravelPatch'
  | 'rival'
  | 'female'
  | 'guardMale'
  | 'cover'
  | 'redd'
  | 'eggs'
  | 'smolt'
  | 'merganser'
  | 'seal'
  | 'shark'
  | 'track'
  | 'jackAI'
  | 'lure'
  /** Lake ice in winter (fry stage). */
  | 'ice'
  /** Pink salmon competing for food in a crowded ocean year. */
  | 'pink'
  /** Brood-mates hatched in the same redd (egg stage): 'hidden' in the gravel, or 'washed' out by the flow. */
  | 'brood'
  /** Other returning sockeye travelling the home river with the player; 'leap' while in the air at the falls. */
  | 'migrant';

export interface Entity {
  id: number;
  kind: EntityKind;
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  radius: number;
  /** Free-form state label: 'idle', 'warn', 'chase', 'strike', 'flee', ... */
  state: string;
  timer: number;
  /** Size/extent for boxes, lines, etc. */
  size?: Vec3;
  /** Anchor point for patrols and returns. */
  home?: Vec3;
  /** 0..1 strength or quality, kind-specific. */
  value?: number;
  alive: boolean;
}

export type SimEventType =
  | 'caption'
  | 'warning'
  | 'death'
  | 'stageComplete'
  | 'checkpoint'
  | 'reveal'
  | 'eat'
  | 'wriggle'
  | 'spawned'
  | 'lifeComplete'
  /** A near miss that would leave a mark (key: 'net'). Drawn as a wound; changes nothing in the sim. */
  | 'graze';

export interface SimEvent {
  t: number;
  type: SimEventType;
  /** Caption id (see captions.json) or warning kind. */
  key?: string;
  /** Values to fill into the caption text. */
  vars?: Record<string, string | number>;
}

export interface Intent {
  /** 0..1 forward thrust. */
  forward: number;
  /** Hold position against the current. */
  hold: boolean;
  /** -1..1 keyboard turn (left negative). */
  turn: number;
  /** Mouse deltas in pixels since last step. */
  mouseX: number;
  mouseY: number;
  rise: boolean;
  dive: boolean;
  burst: boolean;
  action: boolean;
  /** Edge flags: true only on the step the key went down. */
  actionPressed: boolean;
  risePressed: boolean;
  /** Burst key went down this step (also in toggle mode, where `burst` can turn off on a press). */
  burstPressed?: boolean;
}

export const NO_INTENT: Intent = {
  forward: 0,
  hold: false,
  turn: 0,
  mouseX: 0,
  mouseY: 0,
  rise: false,
  dive: false,
  burst: false,
  action: false,
  actionPressed: false,
  risePressed: false,
};

export type DeathCause = 'silt' | 'scour' | 'exposed' | 'char' | 'merganser' | 'seal' | 'sea' | 'shark' | 'angler' | 'trout' | 'bird' | 'orca' | 'gillnet' | 'bear' | 'exhaustion' | 'yolk' | 'noSpawn' | 'heat';

export interface SpawnResult {
  /** Eggs laid (female) or eggs fertilized (male). */
  eggs: number;
  /** Expected young surviving to emerge, for scoring. */
  young: number;
  /** Young relative to the average spawner of the same sex this year. */
  relativeFitness: number;
  detail: string;
}
