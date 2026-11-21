/**
 * Player skill profiles for the balance bots.
 *
 * A profile models a human, not an optimal controller: how long a new threat
 * takes to register, how wobbly the steering is, how often a threat is missed
 * outright, attention lapses, and a handful of strategy habits per stage.
 * The numbers here are about players, not salmon, so they live with the
 * simulator and not in src/data/params.json.
 */
export type SkillName = 'novice' | 'average' | 'skilled';

export interface Skill {
  name: SkillName;
  /** Seconds before a newly visible threat (or a change in the current) is acted on. */
  reaction: number;
  /** Standard deviation of the slow heading wander, radians. */
  steerNoise: number;
  /** Chance that a given threat is never noticed. */
  missChance: number;
  /** Attention lapses per second of play, and how long each lasts (the last input is held). */
  lapseRate: number;
  lapseDur: number;
  /** Mouse steering (faster turns) with this cap in rad/s; otherwise keyboard A/D. */
  mouse: boolean;
  maxTurnRate: number;
  /** Energy kept back: bursts stop below this (0 = bursts until exhausted). */
  burstReserve: number;
  /** Extra clearance the player tries to keep from a strike zone, in world units. */
  margin: number;
  /** Chance of panicking and fleeing straight away from a charging predator instead of across its path. */
  panicChance: number;

  // Stage habits.
  /** Alevin: chance this fish rises before the yolk is used up. */
  earlyRiseChance: number;
  /** Alevin: only turn when misaligned by more than this (saves yolk). */
  alevinDeadband: number;
  /** Fry: preference for rich plankton, and penalty for food near a patrolling trout (in units of distance). */
  fryRichBonus: number;
  fryRisk: number;
  /** Fry: burst only when the trout is this close (units); Infinity = bursts as soon as it notices. */
  fryBurstDist: number;
  /** Fry: chance, at each turn of the lake day, of doing what the time of day asks (deep by day and night, up at dusk and dawn). */
  fryCycle: number;
  /** Smolt: cruising depth (y, negative is down). Bird strikes reach about 2.2 below the surface. */
  smoltDepth: number;
  /**
   * Estuary: hold in the brackish band until readiness for salt water reaches this share of "ready"
   * (0 rushes straight out to sea).
   */
  estuaryPatience: number;
  /** Smolt: sprint past a seal while it is still a dark shape, before it lunges. */
  sealSprint: boolean;
  /** Smolt: dodging a lunge by swimming across its path, or by changing speed along the river. */
  sealDodge: 'across' | 'speed';
  /** Return: chance of taking the wrong branch at the fork first. */
  forkMistake: number;
  /** Return falls: how far across the river (units) the chosen launch spot is from the low step. */
  fallsAim: number;
  /** Return falls: how far (units) the moment of the leap wanders from the standing wave. */
  leapTiming: number;
  /** Return falls: energy waited for in the plunge pool before a run at the falls. */
  fallsRest: number;
  /** Return: bursts to hurry upstream whenever energy allows. */
  riverBurst: boolean;
  /** Return: depth kept in the river (y; bears reach about 2 below the surface). */
  riverDepth: number;
  /** Return: swims in the slower water near the banks. */
  bankSwim: boolean;
  /** Spawn (female): noise when judging cobble quality. */
  judgeNoise: number;
  /** Spawn (female): drives rivals off before the redd is finished, not only after. */
  defendEarly: boolean;
  /** Spawn (large male): meets rivals side-on and early, rather than charging straight at them. */
  sideOn: boolean;
}

export const SKILLS: Record<SkillName, Skill> = {
  novice: {
    name: 'novice',
    reaction: 0.55,
    steerNoise: 0.3,
    missChance: 0.12,
    lapseRate: 1 / 25,
    lapseDur: 1.2,
    mouse: false,
    maxTurnRate: 2.4,
    burstReserve: 0,
    margin: 0.3,
    panicChance: 0.5,
    earlyRiseChance: 0.35,
    alevinDeadband: 0.35,
    fryRichBonus: 0,
    fryRisk: 0,
    fryBurstDist: Infinity,
    fryCycle: 0.4,
    smoltDepth: -2.0,
    estuaryPatience: 0,
    sealSprint: false,
    sealDodge: 'across',
    forkMistake: 0.35,
    fallsAim: 3.5,
    leapTiming: 1.4,
    fallsRest: 0.55,
    riverBurst: true,
    riverDepth: -1.5,
    bankSwim: false,
    judgeNoise: 0.3,
    defendEarly: false,
    sideOn: false,
  },
  average: {
    name: 'average',
    reaction: 0.32,
    steerNoise: 0.12,
    missChance: 0.04,
    lapseRate: 1 / 60,
    lapseDur: 0.8,
    mouse: true,
    maxTurnRate: 3.5,
    burstReserve: 0.15,
    margin: 0.8,
    panicChance: 0.15,
    earlyRiseChance: 0.1,
    alevinDeadband: 0.2,
    fryRichBonus: 4,
    fryRisk: 8,
    fryBurstDist: 5,
    fryCycle: 0.75,
    smoltDepth: -2.8,
    estuaryPatience: 0.6,
    sealSprint: false,
    sealDodge: 'across',
    forkMistake: 0.1,
    fallsAim: 1.4,
    leapTiming: 0.7,
    fallsRest: 0.75,
    riverBurst: false,
    riverDepth: -3,
    bankSwim: false,
    judgeNoise: 0.15,
    defendEarly: false,
    sideOn: true,
  },
  skilled: {
    name: 'skilled',
    reaction: 0.18,
    steerNoise: 0.04,
    missChance: 0,
    lapseRate: 0,
    lapseDur: 0,
    mouse: true,
    maxTurnRate: 5,
    burstReserve: 0.25,
    margin: 1.2,
    panicChance: 0,
    earlyRiseChance: 0,
    alevinDeadband: 0.1,
    fryRichBonus: 8,
    fryRisk: 20,
    fryBurstDist: 3.5,
    fryCycle: 0.95,
    smoltDepth: -3.6,
    estuaryPatience: 1,
    sealSprint: true,
    sealDodge: 'speed',
    forkMistake: 0,
    fallsAim: 0.4,
    leapTiming: 0.3,
    fallsRest: 0.9,
    riverBurst: true,
    riverDepth: -4.5,
    bankSwim: true,
    judgeNoise: 0.04,
    defendEarly: true,
    sideOn: true,
  },
};

export const SKILL_NAMES: SkillName[] = ['novice', 'average', 'skilled'];
