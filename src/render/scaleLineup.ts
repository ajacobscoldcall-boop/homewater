/**
 * Every model drawn in play, grouped by stage, at the size it is drawn
 * (scaleConfig.ts), beside the player's fish. Used by the to-scale gallery
 * (?gallery=scale) and by the scale audit (tests/unit/scale.test.ts), which
 * converts each drawn length into metres with the stage's length of a world
 * unit and compares it with the real animal.
 *
 * A stage's length of a unit comes from the player's fish: its drawn length
 * at the sim's starting scale is taken to be the real fish's length at that
 * point of its life (STAGE_METRES).
 */
import * as THREE from 'three';
import { ANIMALS } from './animals';
import { buildEggGeometry } from './eggMesh';
import { buildFishGeometry, type FishLook, type FishShape } from './fishMesh';
import { krillGeometry, squidGeometry } from './krill';
import { MODEL_SCALE } from './scaleConfig';

export type ScaleStage = 'egg' | 'fry' | 'smolt' | 'ocean' | 'adult';

/** The player's fish at the start of each stage: the sim's body scale, and the real length it stands for (m). */
export const STAGE_PLAYER: Record<ScaleStage, { scale: number; metres: number; label: string }> = {
  // Sockeye alevin in the gravel, close to emergence: about 2-2.5 cm.
  egg: { scale: 0.35, metres: 0.022, label: 'alevin, about 2.2 cm' },
  // Newly emerged fry: about 3 cm.
  fry: { scale: 0.4, metres: 0.03, label: 'fry, about 3 cm at emergence' },
  // Smolts leaving the lake: about 8-12 cm; the sim's smallest smolt is the low end.
  smolt: { scale: 0.53, metres: 0.085, label: 'smolt, about 8.5 cm' },
  // At sea and coming home the sim's size unit is about 750 mm (params.json size.oceanYear3).
  ocean: { scale: 0.85, metres: 0.64, label: 'ocean sockeye, about 64 cm' },
  adult: { scale: 1, metres: 0.75, label: 'large adult, about 75 cm' },
};

export interface LineupItem {
  id: string;
  label: string;
  /** The model at its own size (scale 1). */
  make: () => THREE.Object3D;
  /** The scale it is drawn at in play. */
  scale: number;
  /** What to measure: length along the body (x), or wingspan (z). */
  measure?: 'length' | 'span';
}

const fishModel = (look: FishLook, shape: Partial<FishShape> = {}) => () =>
  new THREE.Mesh(buildFishGeometry({ depth: 1, hump: 0, kype: 0, yolk: 0, ...shape }, look), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));
const animal = (name: string) => () => ANIMALS[name]!().root;
const geoModel = (make: () => THREE.BufferGeometry, opacity = 1) => () =>
  new THREE.Mesh(make(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, transparent: opacity < 1, opacity }));
const dot = (color: number) => () => new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color }));
const lure = () => () => new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0).scale(1, 0.375, 0.5), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.9, roughness: 0.2 }));

const grow = (stage: 'fry' | 'smolt', perGrowth: number, growth: number) => STAGE_PLAYER[stage].scale + perGrowth * growth;

export const LINEUP: Record<ScaleStage, LineupItem[]> = {
  egg: [
    { id: 'alevin', label: 'Alevin (player)', make: fishModel('alevin', { depth: 0.8, yolk: 1 }), scale: STAGE_PLAYER.egg.scale },
    { id: 'brood', label: 'Brood-mate alevin', make: fishModel('alevin', { depth: 0.8, yolk: 1 }), scale: MODEL_SCALE.brood },
    { id: 'egg', label: 'Egg', make: geoModel(() => buildEggGeometry(), 0.8), scale: MODEL_SCALE.eggRadius },
    { id: 'sculpin', label: 'Sculpin', make: animal('sculpin'), scale: MODEL_SCALE.sculpin },
  ],
  fry: [
    { id: 'fry', label: 'Fry at emergence (player)', make: fishModel('fry', { depth: 0.95 }), scale: STAGE_PLAYER.fry.scale },
    // fry.startScale + fry.scalePerGrowth × fry.fullLakeGrowth (params.json).
    { id: 'fryGrown', label: 'Fry after a good summer', make: fishModel('fry', { depth: 0.95 }), scale: grow('fry', 0.07, 2) },
    { id: 'plankton', label: 'Zooplankton (one speck)', make: dot(0xd8e6c4), scale: MODEL_SCALE.planktonSpeck },
    { id: 'charFry', label: 'Dolly Varden', make: animal('char'), scale: MODEL_SCALE.char },
    { id: 'merganserFry', label: 'Common merganser over the lake', make: animal('mergFemale'), scale: MODEL_SCALE.merganserFry },
  ],
  smolt: [
    { id: 'smolt', label: 'Smolt (player)', make: fishModel('smolt', { depth: 0.95 }), scale: STAGE_PLAYER.smolt.scale },
    // smolt.baseScale + smolt.scalePerLakeGrowth × fry.fullLakeGrowth (params.json).
    { id: 'smoltBig', label: 'Smolt after two lake years', make: fishModel('smolt', { depth: 0.95 }), scale: grow('smolt', 0.07, 2) },
    { id: 'smoltMate', label: 'School-mate (largest)', make: fishModel('smolt', { depth: 0.95 }), scale: STAGE_PLAYER.smolt.scale * MODEL_SCALE.smoltMateMax },
    { id: 'charSmolt', label: 'Dolly Varden at the outlet', make: animal('char'), scale: MODEL_SCALE.char },
    { id: 'merganser', label: 'Common merganser', make: animal('mergFemale'), scale: MODEL_SCALE.merganser },
    { id: 'gullPlunge', label: 'Gull (wingspan)', make: animal('gull'), scale: MODEL_SCALE.gullPlunge, measure: 'span' },
    { id: 'sealSmolt', label: 'Harbor seal', make: animal('seal'), scale: MODEL_SCALE.sealSmolt },
  ],
  ocean: [
    { id: 'ocean', label: 'Sockeye at sea (player)', make: fishModel('ocean'), scale: STAGE_PLAYER.ocean.scale },
    { id: 'krill', label: 'Krill', make: geoModel(() => krillGeometry(), 0.8), scale: MODEL_SCALE.krill },
    { id: 'foodFish', label: 'Small fish', make: fishModel('herring', { depth: 0.9 }), scale: MODEL_SCALE.foodFish },
    { id: 'squid', label: 'Small squid', make: geoModel(() => squidGeometry()), scale: MODEL_SCALE.squid },
    { id: 'pink', label: 'Pink salmon', make: fishModel('pink', { depth: 0.95 }), scale: MODEL_SCALE.pink },
    { id: 'sealOcean', label: 'Harbor seal', make: animal('seal'), scale: MODEL_SCALE.sealOcean },
    { id: 'shark', label: 'Salmon shark', make: animal('shark'), scale: MODEL_SCALE.shark },
    { id: 'orca', label: 'Orca', make: animal('orca'), scale: MODEL_SCALE.orca },
  ],
  adult: [
    { id: 'adult', label: 'Large male (player)', make: fishModel('spawnMale', { depth: 1.15, hump: 1, kype: 1 }), scale: STAGE_PLAYER.adult.scale },
    { id: 'jack', label: 'Jack', make: fishModel('spawnJack', { hump: 0.3, kype: 0.4 }), scale: MODEL_SCALE.jack },
    { id: 'female', label: 'Female rival', make: fishModel('spawnFemale', { depth: 1.05, hump: 0.15 }), scale: 0.95 },
    { id: 'charGrounds', label: 'Dolly Varden at the redds', make: animal('char'), scale: MODEL_SCALE.charGrounds },
    { id: 'lure', label: 'Spoon lure', make: lure(), scale: MODEL_SCALE.lure },
    { id: 'netFloat', label: 'Gillnet float', make: dot(0xff7a1a), scale: MODEL_SCALE.netFloat * 2 },
    { id: 'gull', label: 'Gull (wingspan)', make: animal('gull'), scale: MODEL_SCALE.gull, measure: 'span' },
    { id: 'eagle', label: 'Bald eagle (wingspan)', make: animal('eagle'), scale: MODEL_SCALE.eagle, measure: 'span' },
    { id: 'bear', label: 'Brown bear', make: animal('bear'), scale: MODEL_SCALE.bear },
  ],
};

/** World units per metre in a stage. */
export const unitsPerMetre = (stage: ScaleStage, playerLength: number): number => (playerLength * STAGE_PLAYER[stage].scale) / STAGE_PLAYER[stage].metres;

/** A model's measured size at scale 1: body length along x, or wingspan along z. */
export function measure(obj: THREE.Object3D, what: 'length' | 'span' = 'length'): number {
  obj.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  return what === 'span' ? size.z : size.x;
}
