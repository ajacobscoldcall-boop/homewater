/**
 * The egg stage's silt and low-oxygen pocket, drawn (render only; rules in
 * src/sim/stages/eggThreats.ts, read through `alevinView`):
 * - silt: the water clouds and dims, fine specks drift down, and a pale layer
 *   of silt spreads over the bed as it settles, then thins as it is flushed;
 * - the pocket: a dark film on the bed where the water has stopped, and murky
 *   olive water while the camera is in it.
 * The flecks that show the flow are the Renderer's; they move by
 * `gravelFlowAt`, so they slow in silt and stop in the pocket. Tuning in
 * reddThreatsConfig.ts.
 */
import * as THREE from 'three';
import { alevinView } from '../sim/stages/egg';
import type { World } from '../sim/world';
import { quality } from './quality';
import { REDD_FX } from './reddThreatsConfig';

const tmpC = new THREE.Color();

/** A soft round alpha texture, white in the middle and clear at the rim. */
function softDisc(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

export class ReddThreats {
  private layer: THREE.Mesh;
  private film: THREE.Mesh;
  private specks: THREE.Points;
  private speckPos: Float32Array;
  private bed: number;

  constructor(group: THREE.Group, w: World) {
    const fx = REDD_FX;
    this.bed = w.arena.floor(0, 0);
    const disc = softDisc();
    this.layer = new THREE.Mesh(
      new THREE.CircleGeometry(fx.silt.spread + 0.6, 40),
      new THREE.MeshBasicMaterial({ color: fx.silt.layer, map: disc, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.layer.rotation.x = -Math.PI / 2;
    this.layer.position.y = this.bed + fx.silt.layerLift;
    this.layer.visible = false;
    this.film = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: fx.pocket.film, map: disc, transparent: true, opacity: 0, depthWrite: false }));
    this.film.rotation.x = -Math.PI / 2;
    this.film.visible = false;
    const n = fx.silt.specks[quality.envDetail] ?? fx.silt.specks[1]!;
    this.speckPos = new Float32Array(n * 3);
    let seed = 9127;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * fx.silt.spread;
      this.speckPos.set([Math.cos(a) * r, this.bed + rnd() * 1.1, Math.sin(a) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.speckPos, 3));
    this.specks = new THREE.Points(geo, new THREE.PointsMaterial({ color: fx.silt.colour, size: fx.silt.speckSize, transparent: true, opacity: 0, depthWrite: false }));
    this.specks.frustumCulled = false;
    this.specks.visible = false;
    group.add(this.layer, this.film, this.specks);
  }

  /** Per frame: the silt and the pocket's look, and the fog's colour and density for them (after the flood's). */
  update(w: World, dt: number, fog: THREE.FogExp2, cam: THREE.Vector3): { dim: number } {
    const v = alevinView(w);
    if (!v) return { dim: 0 };
    const fx = REDD_FX;
    const cloud = v.siltCloud;
    // Silt: cloudy, dimmer water; specks drifting down with the current; a pale layer spreading over the bed.
    fog.color.lerp(tmpC.setHex(fx.silt.colour), fx.silt.fogMix * cloud);
    fog.density *= 1 + (fx.silt.density - 1) * cloud;
    const sm = this.specks.material as THREE.PointsMaterial;
    sm.opacity = 0.65 * cloud;
    this.specks.visible = cloud > 0.01;
    if (this.specks.visible) {
      const cx = Math.cos(v.currentAngle) * 0.05;
      const cz = Math.sin(v.currentAngle) * 0.05;
      const pos = this.speckPos;
      for (let i = 0; i < pos.length; i += 3) {
        pos[i] = pos[i]! + cx * dt;
        pos[i + 1] = pos[i + 1]! - fx.silt.fall * dt * (0.6 + 0.8 * (((i * 7919) % 97) / 97));
        pos[i + 2] = pos[i + 2]! + cz * dt;
        if (pos[i + 1]! < this.bed) pos[i + 1] = this.bed + 1.1;
        if (Math.hypot(pos[i]!, pos[i + 2]!) > fx.silt.spread) {
          pos[i] = -pos[i]! * 0.9;
          pos[i + 2] = -pos[i + 2]! * 0.9;
        }
      }
      (this.specks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    const lm = this.layer.material as THREE.MeshBasicMaterial;
    lm.opacity = fx.silt.layerOpacity * v.silt.level;
    this.layer.visible = v.silt.level > 0.01;
    // The pocket: a dark film on the bed where the water is still; murky water with the camera inside it.
    const p = v.pocket;
    this.film.visible = p.level > 0.01;
    if (this.film.visible) {
      this.film.position.set(p.x, this.bed + 0.008, p.z);
      this.film.scale.setScalar(p.radius * 1.25);
      (this.film.material as THREE.MeshBasicMaterial).opacity = fx.pocket.filmOpacity * p.level;
      const inside = Math.max(0, Math.min(1, (p.radius * 1.4 - Math.hypot(cam.x - p.x, cam.z - p.z)) / (p.radius * 0.6)));
      const fishIn = Math.max(0, Math.min(1, (p.radius - Math.hypot(w.body.pos.x - p.x, w.body.pos.z - p.z)) / (p.radius * 0.3)));
      const k = p.level * Math.max(inside * 0.6, fishIn);
      fog.color.lerp(tmpC.setHex(fx.pocket.colour), fx.pocket.fogMix * k);
      fog.density *= 1 + (fx.pocket.density - 1) * k;
    }
    return { dim: fx.silt.dim * cloud };
  }
}
