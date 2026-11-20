import { describe, expect, it } from 'vitest';
import { eggRadius, MODEL_SCALE, smoltMateScale } from '../../src/render/scaleConfig';
import { LINEUP, measure, STAGE_PLAYER, unitsPerMetre, type ScaleStage } from '../../src/render/scaleLineup';
import { newWorld, params } from './helpers';

/**
 * Scale audit: every model drawn in play, at the size it is drawn, against
 * (1) the sizes the sim gives (the player's body scale, entity radii) and
 * (2) the real animal, converted to metres with the stage's length of a world
 * unit (the player's fish sets it; scaleLineup.ts).
 *
 * Real sizes, in metres (min, max), from published sources:
 * - Sockeye eggs, alevins and fry: Burgner (1991), "Life history of sockeye salmon",
 *   in Groot & Margolis (eds), Pacific Salmon Life Histories; Quinn (2018), The Behavior
 *   and Ecology of Pacific Salmon and Trout, 2nd ed. Eggs about 5-6 mm; alevins about
 *   2-2.5 cm near emergence; fry about 3 cm at emergence and 4-8 cm by autumn; smolts 7-12 cm.
 * - Adults: params.json size.* (1.0 is about 750 mm; jacks about 300 mm).
 * - Lake zooplankton eaten by fry (Daphnia, Bosmina, Cyclops): about 0.5-3 mm.
 * - Krill (Euphausia pacifica, Thysanoessa spp.): about 1.5-2.5 cm long; the model's
 *   antennae add about a third. Brinton (1962), Bull. Scripps Inst. Oceanogr. 8.
 * - Small fish and juvenile squid eaten by sockeye at sea: a few cm to about 12 cm
 *   (Pearcy et al. 1988, Fishery Bulletin 86; Brodeur 1990, FRI-UW-9016).
 * - Pink salmon adults: about 42-60 cm (Heard 1991, in Groot & Margolis).
 * - Dolly Varden in lakes: about 25-60 cm (Armstrong & Morrow 1980, in Balon (ed), Charrs).
 * - Common merganser: 54-71 cm long; large gulls: 1.2-1.5 m wingspan; bald eagle:
 *   1.8-2.3 m wingspan (Sibley 2014, The Sibley Guide to Birds, 2nd ed.).
 * - Harbor seal adults: 1.4-1.9 m (Burns 2009, in Encyclopedia of Marine Mammals, 2nd ed.).
 * - Salmon shark: 2-3 m (Goldman & Musick 2006, Fishery Bulletin 104).
 * - Orca: 5.5-8.5 m (Ford 2009, in Encyclopedia of Marine Mammals, 2nd ed.).
 * - Brown bear: 1.5-2.8 m head and body (Schwartz et al. 2003, in Wild Mammals of North America).
 * - Spoon lures 4-12 cm; gillnet floats about 8-18 cm.
 */
const REAL: Record<string, [number, number]> = {
  alevin: [0.018, 0.028],
  brood: [0.016, 0.028],
  egg: [0.0045, 0.0065],
  fry: [0.025, 0.035],
  fryGrown: [0.04, 0.08],
  plankton: [0.0005, 0.003],
  charFry: [0.25, 0.6],
  smolt: [0.07, 0.12],
  smoltBig: [0.08, 0.13],
  smoltMate: [0.07, 0.12],
  charSmolt: [0.25, 0.6],
  merganser: [0.54, 0.71],
  gullPlunge: [1.2, 1.5],
  sealSmolt: [1.4, 1.9],
  ocean: [0.45, 0.7],
  krill: [0.015, 0.035],
  foodFish: [0.03, 0.12],
  squid: [0.04, 0.15],
  pink: [0.42, 0.6],
  sealOcean: [1.4, 1.9],
  shark: [2.0, 3.0],
  orca: [5.5, 8.5],
  adult: [0.6, 0.85],
  jack: [0.25, 0.4],
  female: [0.5, 0.75],
  lure: [0.04, 0.12],
  netFloat: [0.08, 0.18],
  gull: [1.2, 1.5],
  eagle: [1.8, 2.3],
  bear: [1.5, 2.8],
};

/** Drawn sizes may stray this far outside the real range (models are not exact, and a little licence helps them read). */
const SLACK = 1.3;

describe('scale audit: models against real animals', () => {
  for (const stage of Object.keys(LINEUP) as ScaleStage[]) {
    const items = LINEUP[stage];
    const player = items[0]!;
    const perMetre = unitsPerMetre(stage, measure(player.make()));
    for (const item of items) {
      it(`${stage}: ${item.label}`, () => {
        const real = REAL[item.id];
        expect(real, `no real size for ${item.id}`).toBeDefined();
        const metres = (measure(item.make(), item.measure) * item.scale) / perMetre;
        const [lo, hi] = real!;
        expect(metres, `${item.id} is drawn ${(metres * 100).toFixed(1)} cm; real ${lo * 100}-${hi * 100} cm`).toBeGreaterThanOrEqual(lo / SLACK);
        expect(metres, `${item.id} is drawn ${(metres * 100).toFixed(1)} cm; real ${lo * 100}-${hi * 100} cm`).toBeLessThanOrEqual(hi * SLACK);
      });
    }
  }
});

describe('scale audit: models against the sim', () => {
  it("each stage's player fish is the sim's own size", () => {
    const p = params();
    expect(STAGE_PLAYER.fry.scale).toBeCloseTo(p.get('fry.startScale'));
    expect(STAGE_PLAYER.smolt.scale).toBeCloseTo(p.get('smolt.baseScale'));
    // The grown fry and smolt in the lineup follow the sim's growth parameters.
    const fryGrown = LINEUP.fry.find((i) => i.id === 'fryGrown')!.scale;
    expect(fryGrown).toBeCloseTo(p.get('fry.startScale') + p.get('fry.scalePerGrowth') * p.get('fry.fullLakeGrowth'));
    const smoltBig = LINEUP.smolt.find((i) => i.id === 'smoltBig')!.scale;
    expect(smoltBig).toBeCloseTo(p.get('smolt.baseScale') + p.get('smolt.scalePerLakeGrowth') * p.get('fry.fullLakeGrowth'));
    expect(newWorld({ startStage: 0 }).w.body.scale).toBeCloseTo(STAGE_PLAYER.egg.scale);
    expect(newWorld({ startStage: 1 }).w.body.scale).toBeCloseTo(STAGE_PLAYER.fry.scale);
    expect(newWorld({ startStage: 3 }).w.body.scale).toBeCloseTo(STAGE_PLAYER.ocean.scale);
    expect(p.get('size.oceanYear3')).toBeCloseTo(STAGE_PLAYER.adult.scale);
  });

  it('eggs are drawn inside the space the sim gives them, and smaller than the alevin', () => {
    const { w } = newWorld({ startStage: 0 });
    const eggs = w.live('eggs');
    expect(eggs.length).toBeGreaterThan(0);
    for (const e of eggs) {
      expect(eggRadius(e.id)).toBeLessThanOrEqual(e.radius);
      expect(eggRadius(e.id) * 2).toBeLessThan(w.body.scale * 0.4);
    }
    expect(MODEL_SCALE.brood).toBeLessThan(w.body.scale);
  });

  it("smolt school-mates are never drawn bigger than the player's own smolt", () => {
    for (const playerScale of [0.53, 0.6, 0.67]) {
      for (let id = 0; id < 200; id++) {
        const s = smoltMateScale(playerScale, id);
        expect(s).toBeLessThanOrEqual(playerScale);
        expect(s).toBeGreaterThanOrEqual(playerScale * MODEL_SCALE.smoltMateMin);
      }
    }
  });

  it('food is drawn within reach of where the sim eats it', () => {
    // Fry eat plankton within 0.9 of the fish (fry.ts); a swarm round the point stays well inside.
    expect(MODEL_SCALE.planktonCloud).toBeLessThan(0.9 * 0.5);
    // Ocean food: the krill cloud round each food point stays inside the sim's food spacing.
    const { w } = newWorld({ startStage: 3 });
    const food = w.live('herring');
    expect(food.length).toBeGreaterThan(0);
    expect(MODEL_SCALE.krillCloud).toBeLessThanOrEqual(0.6);
  });
});
