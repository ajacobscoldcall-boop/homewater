import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { seasonOf, weatherFor, weatherHash, type WeatherInput } from '../../src/render/weather';
import { WEATHER } from '../../src/render/weatherConfig';
import { skiffGeometry } from '../../src/render/boats';
import { LINEUP, measure, unitsPerMetre } from '../../src/render/scaleLineup';
import { STAGE_IDS } from '../../src/sim/types';

const typical = (stage: WeatherInput['stage'], extra: Partial<WeatherInput> = {}): WeatherInput => ({ stage, flow: 1, temperature: 1, t: 0, ...extra });

describe('weather (render only)', () => {
  it('is the same for the same year and stage, and stays in range', () => {
    for (const stage of STAGE_IDS)
      for (let i = 0; i < 40; i++) {
        const input = typical(stage, { flow: 0.6 + i * 0.02, temperature: 1.4 - i * 0.02, t: i * 7.3 });
        const a = weatherFor(input);
        expect(weatherFor(input)).toEqual(a);
        for (const k of ['overcast', 'rain', 'wind', 'ice'] as const) {
          expect(a[k]).toBeGreaterThanOrEqual(0);
          expect(a[k]).toBeLessThanOrEqual(1);
        }
      }
  });

  it('a wet year is cloudier than a typical one, a warm low-water year clearer', () => {
    for (const stage of STAGE_IDS) {
      const mean = (flow: number, temperature: number) => {
        let sum = 0;
        // Average over many years near these conditions, so the per-year variety averages out.
        for (let i = 0; i < 200; i++) sum += weatherFor(typical(stage, { flow: flow + (i % 20) * 0.001, temperature: temperature + Math.floor(i / 20) * 0.001 })).overcast;
        return sum / 200;
      };
      expect(mean(1.3, 1)).toBeGreaterThan(mean(1, 1));
      expect(mean(0.9, 1.35)).toBeLessThan(mean(1, 1));
    }
  });

  it('rains only under heavy cloud, and showers come and go', () => {
    let rained = 0;
    for (let y = 0; y < 300; y++) {
      const flow = 0.7 + (y % 30) * 0.02;
      const temperature = 0.7 + Math.floor(y / 30) * 0.06;
      let seen = false;
      let dry = false;
      for (let t = 0; t < WEATHER.showerPeriod; t += 2) {
        const wx = weatherFor(typical('return', { flow, temperature, t }));
        if (wx.rain > 0) {
          expect(wx.overcast).toBeGreaterThan(WEATHER.rainFrom);
          seen = true;
        } else dry = true;
      }
      if (seen) {
        rained++;
        expect(dry, 'a shower stops within its cycle').toBe(true);
      }
    }
    // Some years rain, most don't.
    expect(rained).toBeGreaterThan(10);
    expect(rained).toBeLessThan(250);
  });

  it('the fry winter is under ice, with no rain or wind on the surface', () => {
    const wx = weatherFor(typical('fry', { fryPhase: 'winter', flow: 1.4 }));
    expect(wx.ice).toBe(1);
    expect(wx.rain).toBe(0);
    expect(wx.wind).toBe(0);
    expect(wx.season).toBe('winter');
    expect(weatherFor(typical('fry', { fryPhase: 'summer' })).ice).toBe(0);
  });

  it('the egg flood comes with rain', () => {
    expect(weatherFor(typical('egg', { flood: 0.8, flow: 0.8, temperature: 1.3 })).rain).toBeGreaterThanOrEqual(0.8);
  });

  it('the open sea is windier on average than the spawning grounds', () => {
    let sea = 0;
    let grounds = 0;
    for (let i = 0; i < 200; i++) {
      const extra = { flow: 0.8 + i * 0.002, temperature: 1.2 - i * 0.002, t: i };
      sea += weatherFor(typical('ocean', extra)).wind;
      grounds += weatherFor(typical('spawn', extra)).wind;
    }
    expect(sea).toBeGreaterThan(grounds);
  });

  it('seasons follow the life: spring smolts, summer at sea and on the return, autumn on the grounds', () => {
    expect(seasonOf({ stage: 'smolt' })).toBe('spring');
    expect(seasonOf({ stage: 'ocean' })).toBe('summer');
    expect(seasonOf({ stage: 'ocean', oceanMoment: 'reveal' })).toBe('autumn');
    expect(seasonOf({ stage: 'return' })).toBe('summer');
    expect(seasonOf({ stage: 'spawn' })).toBe('autumn');
    expect(seasonOf({ stage: 'fry', fryPhase: 'decide' })).toBe('spring');
  });

  it('hash is spread over 0..1', () => {
    let lo = 0;
    for (let i = 0; i < 1000; i++) if (weatherHash(1 + i * 0.001, 1, 3) < 0.5) lo++;
    expect(lo).toBeGreaterThan(400);
    expect(lo).toBeLessThan(600);
  });
});

describe('the gillnet skiff is drawn at a real size', () => {
  it('is about 5-10 m long, like a Bristol Bay set-net skiff or drift boat', () => {
    const player = LINEUP.adult[0]!;
    const perMetre = unitsPerMetre('adult', measure(player.make()));
    const size = new THREE.Box3().setFromBufferAttribute(skiffGeometry().getAttribute('position') as THREE.BufferAttribute).getSize(new THREE.Vector3());
    const metres = size.z / perMetre;
    expect(metres).toBeGreaterThan(5 / 1.3);
    expect(metres).toBeLessThan(10 * 1.3);
    const beam = size.x / perMetre;
    expect(beam).toBeGreaterThan(1.5 / 1.3);
    expect(beam).toBeLessThan(3.5 * 1.3);
  });
});
