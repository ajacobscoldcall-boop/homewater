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
  | 'pink';

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
  | 'lifeComplete';

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

export type DeathCause = 'silt' | 'scour' | 'exposed' | 'char' | 'merganser' | 'seal' | 'sea' | 'shark' | 'angler' | 'trout' | 'bird' | 'orca' | 'gillnet' | 'bear' | 'exhaustion' | 'noSpawn';

export interface SpawnResult {
  /** Eggs laid (female) or eggs fertilized (male). */
  eggs: number;
  /** Expected young surviving to emerge, for scoring. */
  young: number;
  /** Young relative to the average spawner of the same sex this year. */
  relativeFitness: number;
  detail: string;
}
