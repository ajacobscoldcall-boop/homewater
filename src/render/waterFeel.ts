/**
 * The water's feel on the return, render only: in a warm year, cool refuges
 * look slightly clearer and bluer and hot shallows hazier (a fog tint eased
 * from the sim's reading at the fish), and spring seeps show a faint shimmer
 * of fine sand rising from the bed so the player can find them.
 * Reads `returnWaterView` and `seeps`; never writes the sim.
 * Tuning is in waterFeelConfig.ts (presentation, not params.json).
 */
import * as THREE from 'three';
import { returnWaterView, riverWarmth, seeps } from '../sim/stages/returnWater';
import type { World } from '../sim/world';
import { quality } from './quality';
import { softDisc } from './splash';
import { WATER_FEEL } from './waterFeelConfig';


const COOL = new THREE.Color(WATER_FEEL.cool);
const WARM = new THREE.Color(WATER_FEEL.warm);

export class WaterFeel {
  private feel = 0;
  private points: THREE.Points | null = null;
  private builtFor: unknown = null;
  private phase: Float32Array = new Float32Array(0);
  private base: Float32Array = new Float32Array(0);
  /** One material for the renderer's life, so its program is never recompiled. */
  private readonly mat = new THREE.PointsMaterial({
    color: WATER_FEEL.color,
    size: WATER_FEEL.size,
    map: softDisc(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });

  constructor(private readonly scene: THREE.Scene) {}

  /** Tint the fog for the water at the fish. Call after the stage's own fog is set. */
  tint(fog: THREE.FogExp2, w: World, frameDt: number): void {
    const v = returnWaterView(w);
    const target = v ? v.feel : 0;
    this.feel += (target - this.feel) * (1 - Math.pow(0.5, frameDt / WATER_FEEL.ease));
    const f = this.feel;
    if (Math.abs(f) < 0.002) return;
    if (f < 0) {
      fog.color.lerp(COOL, -f * WATER_FEEL.coolTint);
      fog.density *= 1 + (WATER_FEEL.coolClear - 1) * -f;
    } else {
      fog.color.lerp(WARM, f * WATER_FEEL.warmTint);
      fog.density *= 1 + (WATER_FEEL.warmHaze - 1) * f;
    }
  }

  /** Seep shimmer: rebuilt when the arena changes, hidden off the return or in cool years. */
  update(w: World, frameDt: number): void {
    if (this.builtFor !== w.arena) this.build(w);
    const pts = this.points;
    if (!pts) return;
    if (pts.parent !== this.scene) this.scene.add(pts);
    const warmth = riverWarmth(w);
    this.mat.opacity = WATER_FEEL.opacity * Math.min(1, warmth * 1.5);
    pts.visible = this.mat.opacity > 0.01;
    if (!pts.visible) return;
    const pos = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < this.phase.length; i++) {
      let ph = (this.phase[i] ?? 0) + (frameDt * WATER_FEEL.speed) / WATER_FEEL.rise;
      if (ph > 1) ph -= 1;
      this.phase[i] = ph;
      const b = i * 3;
      arr[b] = (this.base[b] ?? 0) + Math.sin(ph * 9 + i) * 0.15;
      arr[b + 1] = (this.base[b + 1] ?? 0) + ph * WATER_FEEL.rise;
      arr[b + 2] = (this.base[b + 2] ?? 0) + Math.cos(ph * 7 + i) * 0.15;
    }
    pos.needsUpdate = true;
  }

  private build(w: World): void {
    this.builtFor = w.arena;
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      this.points = null;
    }
    const list = w.stageId === 'return' ? seeps(w) : [];
    if (!list.length) return;
    const per = WATER_FEEL.motes[quality.envDetail];
    const n = list.length * per;
    this.base = new Float32Array(n * 3);
    this.phase = new Float32Array(n);
    let k = 0;
    // A fixed scatter (not the sim's rng): motes are decoration.
    for (const s of list) {
      for (let i = 0; i < per; i++, k++) {
        const a = (k * 2.399963) % (Math.PI * 2);
        const r = 1.6 * Math.sqrt(((k * 0.618034) % 1) + 0.02);
        const x = s.x + Math.cos(a) * r;
        const z = s.z + Math.sin(a) * r;
        this.base.set([x, w.arena.floor(x, z) + 0.05, z], k * 3);
        this.phase[k] = (k * 0.381966) % 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.base), 3));
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }
}
