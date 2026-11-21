/**
 * The always-visible minimal HUD and the screen-space threat cues.
 *
 * - `Vitals`: energy (yolk for the alevin) and, on the return, fat (strength on the spawning grounds) as two thin
 *   rings in a fixed corner (in the lake a third, the spawning colours coming on), with an early fat warning from the recent rate of burn; on the return a water
 *   temperature chip that shows only when the water is near the heat-stress threshold. Written through HudView,
 *   so the DOM changes only when what is shown changes. The H details panel keeps the rest.
 * - `threatMarkers`: labelled rings and edge arrows for the default view.
 * - `edgeShadow`: Documentary view's cue for a threat off screen, a soft darkening at that edge.
 *
 * Tuning: hudConfig.ts.
 */
import type { World } from '../sim/world';
import type { ActiveThreat } from '../render/threats';
import { threatFocus } from '../render/threats';
import type { HudView, ThreatMarker, VitalRing } from './hudView';
import { alevinView } from '../sim/stages/egg';
import { lakeView } from '../sim/stages/returnLake';
import { returnWaterView } from '../sim/stages/returnWater';
import { smoltView } from '../sim/stages/smolt';
import { spawnState } from '../sim/stages/spawn';
import { EDGE_SHADOW, VITALS } from './hudConfig';

type Project = (x: number, y: number, z: number) => { x: number; y: number; behind: boolean };

export type FatLevel = 'ok' | 'low' | 'critical';

/** Watches the fat store and says how soon it would run out at the recent rate of burn. */
export class FatWatch {
  private last = NaN;
  private rate = 0;
  private watched = 0;

  reset(): void {
    this.last = NaN;
    this.rate = 0;
    this.watched = 0;
  }

  /** Feed the fat level each frame; returns seconds left at the recent burn (Infinity if not burning). */
  update(fat: number, dt: number): number {
    if (dt > 0 && Number.isFinite(this.last)) {
      const burn = Math.max(0, (this.last - fat) / dt);
      this.rate += (burn - this.rate) * (1 - Math.exp(-VITALS.burn.rateFollow * dt));
      this.watched += dt;
    }
    this.last = fat;
    return this.secondsLeft(fat);
  }

  secondsLeft(fat: number): number {
    if (this.watched < VITALS.burn.minWatch || this.rate <= 1e-6) return Infinity;
    return fat / this.rate;
  }
}

/** How worried the fat ring should look, from the level and the time left at the recent burn. */
export function fatLevel(fat: number, secondsLeft: number): FatLevel {
  const b = VITALS.burn;
  if (fat < VITALS.fat.critical || secondsLeft < b.criticalSeconds) return 'critical';
  if (fat < VITALS.fat.low || secondsLeft < b.warnSeconds) return 'low';
  return 'ok';
}

export function energyLevel(v: number): FatLevel {
  return v < VITALS.energy.critical ? 'critical' : v < VITALS.energy.low ? 'low' : 'ok';
}

/** The estuary's water chip: brackish or salt water, and whether the fish is ready for it ('' upstream). */
export function estuaryChip(w: World): string {
  const v = smoltView(w);
  if (!v || v.estuary < VITALS.salt.chipFrom) return '';
  if (v.over > w.p.get('estuary.stressShown')) return 'salt water: not ready';
  if (v.salinity >= VITALS.salt.seaAbove) return 'salt water';
  if (v.salinity >= w.p.get('estuary.brackishMin')) return 'brackish water';
  return 'fresh water';
}

/** The water chip's text, or '' when the water is comfortable (the return's heat, the estuary's salt). */
export function waterChip(w: World): string {
  if (w.stageId === 'smolt') return estuaryChip(w);
  const v = returnWaterView(w);
  if (!v) return '';
  const stressT = w.p.get('return.water.stressTemp');
  const shown = v.temp >= stressT - VITALS.water.showBelow || v.stress > VITALS.water.stressShown || v.oxygen < w.p.get('return.water.o2Low');
  if (!shown) return '';
  const hot = v.temp >= stressT ? ' · warm' : '';
  return `water ${Math.round(v.temp)}°C${hot}`;
}

export class Vitals {
  private fat = new FatWatch();
  private stageKey = '';

  update(hud: HudView, w: World, dt: number, playing: boolean): void {
    const key = `${w.fish.id}|${w.stageIndex}`;
    if (key !== this.stageKey) {
      this.stageKey = key;
      this.fat.reset();
    }
    const rings: VitalRing[] = [];
    const alevin = alevinView(w);
    if (alevin) rings.push({ name: 'yolk', value: w.progress.yolk, level: energyLevel(w.progress.yolk) });
    else rings.push({ name: 'energy', value: w.body.energy, level: energyLevel(w.body.energy) });
    if (w.stageId === 'return') {
      const fat = w.progress.fat;
      const left = this.fat.update(fat, playing ? dt : 0);
      rings.push({ name: 'fat', value: fat, level: fatLevel(fat, left) });
      // In the lake: how far the spawning colours have come on (full when ready to go home).
      const lake = lakeView(w);
      if (lake?.entered) rings.push({ name: 'colours', value: lake.ripe, level: 'ok' });
    }
    // The smolt run's last stretch: readiness for salt water, from the river mouth on.
    const sv = smoltView(w);
    if (sv && sv.estuary >= VITALS.salt.ringFrom) {
      const level = sv.over > w.p.get('estuary.stressShown') ? 'critical' : sv.ready < sv.readyDone ? 'low' : 'ok';
      rings.push({ name: 'salt ready', value: sv.ready / sv.readyDone, level });
    }
    const s = spawnState(w);
    if (s) rings.push({ name: 'strength', value: s.vigour, level: energyLevel(s.vigour) });
    hud.rings('hud-vitals', rings);
    const chip = waterChip(w);
    hud.text('hud-water', chip);
    hud.hidden('hud-water', chip === '');
  }
}

/** Screen position of a world point, clamped to the edge (with an arrow) when off screen. */
function place(project: Project, px: number, py: number, pz: number): { x: number; y: number; off: boolean; angle: number } {
  const s = project(px, py, pz);
  let x = s.x;
  let y = s.y;
  if (s.behind) {
    x = 1 - x;
    y = 1 - y;
  }
  const off = s.behind || x < 0.04 || x > 0.96 || y < 0.06 || y > 0.94;
  const dx = x - 0.5;
  const dy = y - 0.5;
  if (off) {
    const k = 0.44 / Math.max(Math.abs(dx), Math.abs(dy), 1e-3);
    x = 0.5 + dx * k;
    y = 0.5 + dy * k;
  }
  return { x, y, off, angle: Math.atan2(dy, dx) };
}

/** The default view's markers: a labelled ring on each threat, an arrow at the edge for ones off screen. */
export function threatMarkers(list: readonly ActiveThreat[], project: Project): ThreatMarker[] {
  return list.slice(0, 8).map((t) => ({ ...place(project, t.marker.x, t.marker.y, t.marker.z), label: t.label, hot: t.hot, opening: t.opening }));
}

/** Documentary view: a soft shadow at the screen edge toward the most pressing threat, only while it is off screen. */
export function edgeShadow(list: readonly ActiveThreat[], fish: { x: number; y: number; z: number }, project: Project): { angle: number; strength: number } | null {
  const f = threatFocus(list, fish);
  if (!f) return null;
  const p = place(project, f.threat.at.x, f.threat.at.y, f.threat.at.z);
  if (!p.off) return null;
  return { angle: p.angle, strength: f.threat.hot ? EDGE_SHADOW.hot : EDGE_SHADOW.warn };
}
