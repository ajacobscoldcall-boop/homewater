/**
 * Play: the HUD wiring while a stage is being played (who, objective, hint,
 * vignette, threat markers, detailed bars) and the near-miss hit cue.
 * The fixed-step loop itself is in App.frame.
 */
import { imprintOf } from '../../sim/imprint';
import { alevinView } from '../../sim/stages/egg';
import { fryGrowth } from '../../sim/stages/fry';
import { returnWaterView } from '../../sim/stages/returnWater';
import { smoltView } from '../../sim/stages/smolt';
import type { World } from '../../sim/world';
import { hudHint } from '../../ui/controls';
import { h } from '../../ui/dom';
import { HudView } from '../../ui/hudView';
import { OBJECTIVES, sexSymbol, STAGE_TITLES } from '../../ui/text';
import { waterBars } from '../../ui/waterHud';
import type { App } from '../App';
import { activeThreats } from '../../render/threats';
import { access } from '../../ui/accessibility';
import { edgeShadow, threatMarkers, Vitals } from '../../ui/vitals';

export class PlayHud {
  /** HUD elements and the values last written to them (src/ui/hudView.ts). */
  private readonly hud = new HudView();
  private hitsHeard = 0;
  /** Always-visible minimal HUD (src/ui/vitals.ts): energy and fat rings, water temperature when it matters. */
  private readonly vitals = new Vitals();

  /** Feel pass: a near miss or a fresh mark (the renderer's wound tracker) gets a sound and a short edge flash; the camera shakes (cameraRig.ts). */
  feelHits(app: App, w: World): void {
    const hits = app.renderer.gore.tracker.hits;
    if (hits === this.hitsHeard) return;
    this.hitsHeard = hits;
    if (app.mode !== 'playing' || w.status !== 'playing') return;
    app.audio.nearMiss();
    app.messages.flash('hit');
  }

  update(app: App, w: World, frameDt: number): void {
    // Performance: HudView writes to the DOM only when something shown has changed.
    const hud = this.hud;
    const f = w.fish;
    const sibs = '◆'.repeat(Math.max(0, w.siblingsLeft));
    const who = ` · ${sexSymbol(f.sex)} · generation ${f.generation} · ${STAGE_TITLES[w.stageId]}`;
    const sibText = `siblings ${sibs || 'none'}`;
    hud.children('hud-who', `${f.name}|${who}|${sibText}`, () => [h('b', {}, f.name), who, h('br'), sibText]);
    const guided = w.firstLife && app.lineage?.difficulty === 'fieldGuide';
    app.messages.guideFrame(w, frameDt, app.mode === 'playing' && w.status === 'playing' && app.guided(w), () => app.skipGuide());
    hud.text('hud-objective', (guided && !app.guided(w)) || app.hudDetailed ? OBJECTIVES[w.stageId] : '');
    hud.text('hud-hint', app.mode === 'playing' ? hudHint(app.input.locked) : '');

    // Immersive state: the edges darken as the fish weakens.
    const alevin = alevinView(w);
    const fat = w.stageId === 'return' ? w.progress.fat : 1;
    const danger = alevin ? Math.max(alevin.exposure, alevin.drift) : 0;
    const weakness = Math.max(1 - w.body.energy, danger, 1 - fat * 2.2);
    hud.style('vignette', 'opacity', String(Math.max(0, Math.min(0.95, (weakness - 0.35) * 1.4))));

    // Markers on threats that are warning or attacking; arrows at the edge for ones off screen (src/render/threats.ts).
    // In Documentary view, a shadow at the edge instead (src/ui/vitals.ts).
    const playing = app.mode === 'playing' && w.status === 'playing';
    const threats = playing ? activeThreats(w) : [];
    const project = (x: number, y: number, z: number) => app.renderer.project(x, y, z);
    hud.threats('threats', access().documentaryView ? [] : threatMarkers(threats, project));
    hud.edgeShadow('edge-shadow', access().documentaryView ? edgeShadow(threats, w.body.pos, project) : null);
    this.vitals.update(hud, w, frameDt, playing);

    hud.hidden('hud-bars', !app.hudDetailed);
    if (app.hudDetailed) {
      const rows: [string, number][] = [];
      // Energy, yolk and fat are always shown by the rings (vitals.ts); the details panel keeps the rest.
      if (alevin) rows.push(['hold', 1 - alevin.drift], ['daylight', alevin.light]);
      if (w.stageId === 'fry') rows.push(['growth', fryGrowth(w)]);
      // The smolt run: readiness for salt water, and the salinity around the fish (src/sim/stages/estuary.ts).
      const smolt = smoltView(w);
      if (smolt) rows.push(['salt ready', smolt.ready], ['salinity', smolt.salinity]);
      // Imprinting (src/sim/imprint.ts): how well the fish has learned the smell of home.
      if (w.stageId !== 'ocean' && w.stageId !== 'spawn') rows.push(['home scent', imprintOf(w.p, w.progress)]);
      if (!alevin) rows.push(['depth', Math.min(1, (w.arena.surfaceY - w.body.pos.y) / 8)]);
      const bars = rows.map(([name, value]) => ({ name, value, low: value < 0.25 && name !== 'depth' && name !== 'daylight' && name !== 'salinity' }));
      const water = returnWaterView(w);
      if (water) bars.push(...waterBars(w.p, water));
      hud.bars('hud-bars', bars);
    }
  }
}
