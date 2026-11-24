/**
 * The world above the water, seen from below through Snell's window (render only).
 *
 * Nothing above the surface is drawn as geometry. The surface shader (water.ts)
 * refracts each view ray out of the water and looks it up here:
 * - a sky gradient, blended from day, dusk, night and winter looks by the stage's light;
 * - the shore: a skyline height map (ground plus a tree line set back from the
 *   water's edge) built once per stage from the scenery's own ground, which the
 *   refracted ray marches through; far hills round open water;
 * - bodies above the water as capsules: the two nearest bears (torso and head), and
 *   the gillnet skiffs and the people in them on the return's coast (boats.ts), so
 *   their shapes show above the water when overhead, and darken the surface under them;
 * - weather and season (weather.ts): cloud, rain and wind are read by the surface
 *   shader through `uWeather`; alder and willow along the banks (the skyline map's
 *   blue channel) take the season's leaf colour, and in winter snow lies on the banks.
 * Outside the window the surface is a mirror (total internal reflection).
 *
 * Quality: Low draws the sky gradient only; Medium marches the shore in fewer steps.
 */
import * as THREE from 'three';
import type { World } from '../sim/world';
import { SHORE, SKY, type SkyLook } from './aboveConfig';
import { BOATS, FOLIAGE, WEATHER_LOOK, type Season } from './weatherConfig';
import type { Weather } from './weather';
import { noise2 } from './env/kit';
import { quality } from './quality';

export interface AboveUniforms {
  uZenith: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uGlow: { value: THREE.Color };
  uGlowDir: { value: THREE.Vector2 };
  uTrees: { value: THREE.Color };
  uHills: { value: THREE.Color };
  uStars: { value: number };
  uSkyLight: { value: number };
  uSkyline: { value: THREE.Texture };
  /** Skyline map placement: x0, z0, 1/width, 1/depth. */
  uSkyBox: { value: THREE.Vector4 };
  uSkyMax: { value: number };
  /** Far hills: height and distance (m); height 0 for none. */
  uFar: { value: THREE.Vector2 };
  /**
   * Bodies above the water: capsules as pairs (a.xyz, radius) and (b.xyz, kind); radius 0 is none.
   * Kind 0 bear, 1 a person's coat, 2 a skiff's hull, 3 a head. Slots 0-3: two bears; 4-13: two skiffs (hull, two people).
   */
  uBody: { value: THREE.Vector4[] };
  /** Capsules in use: the surface's loops stop here (most frames have none or a bear's two). */
  uBodyCount: { value: number };
  /** Weather now: overcast, rain, wind, ice (weather.ts). */
  uWeather: { value: THREE.Vector4 };
  /** Cloud colour (linear), mixed from fair-weather to rain cloud by the cover. */
  uCloud: { value: THREE.Color };
  /** The season's alder and willow leaves on the banks (linear), and snow lying (0..1). */
  uLeaf: { value: THREE.Color };
  uSnow: { value: number };
  /** Coat and hull colours (linear). */
  uCoat: { value: THREE.Color };
  uHull: { value: THREE.Color };
}

/** Capsules in uBody (pairs of vec4). */
export const BODY_CAPSULES = 14;
const BEAR_SLOTS = 2;

const EMPTY = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
EMPTY.needsUpdate = true;

/**
 * The march out through the shore, by quality: steps, first step (m), growth per step and
 * longest step (m). Steps grow from the surface outwards but never so long that they jump a tree.
 */
export function shoreSteps(level: 0 | 1 | 2): [number, number, number, number] {
  return level === 2 ? [20, 0.5, 1.4, 2.5] : level === 1 ? [10, 0.8, 1.8, 5] : [0, 0, 0, 0];
}

/** Blend two sky looks into the uniforms (colours converted to linear). */
const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
function mixInto(out: THREE.Color, a: number, b: number, k: number): void {
  out.copy(tmpA.setHex(a)).lerp(tmpB.setHex(b), k);
}

export class AboveWater {
  readonly uniforms: AboveUniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uGlowDir: { value: new THREE.Vector2(0.89, 0.45) },
    uTrees: { value: new THREE.Color() },
    uHills: { value: new THREE.Color() },
    uStars: { value: 0 },
    uSkyLight: { value: 1 },
    uSkyline: { value: EMPTY },
    uSkyBox: { value: new THREE.Vector4(0, 0, 1, 1) },
    uSkyMax: { value: SHORE.maxHeight },
    uFar: { value: new THREE.Vector2(0, 1) },
    uBody: { value: Array.from({ length: BODY_CAPSULES * 2 }, () => new THREE.Vector4()) },
    uBodyCount: { value: 0 },
    uWeather: { value: new THREE.Vector4() },
    uCloud: { value: new THREE.Color() },
    uLeaf: { value: new THREE.Color() },
    uSnow: { value: 0 },
    uCoat: { value: new THREE.Color(BOATS.coat) },
    uHull: { value: new THREE.Color(BOATS.hull) },
  };
  private texture: THREE.DataTexture | null = null;
  /** The bears kept this frame: distance² to the camera per bear slot. */
  private bearNear = [Infinity, Infinity];

  constructor() {
    this.setSky('day', 'day', 0);
    this.setWeather({ overcast: 0, rain: 0, wind: 0, ice: 0, season: 'summer' });
  }

  /** The weather now (weather.ts): the surface shader's cloud, rain, wind and ice, and the season on the banks. */
  setWeather(wx: Weather): void {
    const u = this.uniforms;
    u.uWeather.value.set(wx.overcast, wx.rain, wx.wind, wx.ice);
    u.uCloud.value.setHex(WEATHER_LOOK.cloud).lerp(tmpB.setHex(WEATHER_LOOK.rainCloud), Math.max(wx.rain, Math.max(0, wx.overcast - 0.6) * 2));
    this.setSeason(wx.season);
  }

  private season: Season | null = null;
  private setSeason(s: Season): void {
    if (s === this.season) return;
    this.season = s;
    this.uniforms.uLeaf.value.setHex(FOLIAGE[s].leaf);
    this.uniforms.uSnow.value = FOLIAGE[s].snow;
  }

  /** Build the shore for a stage from the scenery's ground (heights in world units). */
  build(w: World, ground: (x: number, z: number) => number): void {
    this.texture?.dispose();
    this.texture = null;
    const u = this.uniforms;
    u.uSkyline.value = EMPTY;
    const kind = w.arena.kind;
    const far = SHORE.farHills[kind];
    u.uFar.value.set(far?.[0] ?? 0, far?.[1] ?? 1);
    // Open sea and the inside of the redd have no shore; Low draws only the sky.
    if (kind === 'ocean' || kind === 'gravel' || quality.aboveWater === 0) return;
    const a = w.arena;
    const s = a.surfaceY;
    const x0 = a.min.x - SHORE.margin;
    const z0 = a.min.z - SHORE.margin;
    const sx = a.max.x - a.min.x + 2 * SHORE.margin;
    const sz = a.max.z - a.min.z + 2 * SHORE.margin;
    const cell = Math.max(sx, sz) / SHORE.cells;
    const nx = Math.max(2, Math.round(sx / cell));
    const nz = Math.max(2, Math.round(sz / cell));
    const land = new Float32Array(nx * nz);
    const dist = new Float32Array(nx * nz);
    let any = false;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const g = ground(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell) - s;
        const k = j * nx + i;
        land[k] = g;
        dist[k] = g > 0.05 ? 1e6 : 0;
        if (g > 0.05) any = true;
      }
    }
    if (!any) return;
    // Distance from the water's edge (two-pass chamfer, in cells).
    const D = Math.SQRT2;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (i > 0) dist[k] = Math.min(dist[k]!, dist[k - 1]! + 1);
        if (j > 0) {
          dist[k] = Math.min(dist[k]!, dist[k - nx]! + 1);
          if (i > 0) dist[k] = Math.min(dist[k]!, dist[k - nx - 1]! + D);
          if (i < nx - 1) dist[k] = Math.min(dist[k]!, dist[k - nx + 1]! + D);
        }
      }
    for (let j = nz - 1; j >= 0; j--)
      for (let i = nx - 1; i >= 0; i--) {
        const k = j * nx + i;
        if (i < nx - 1) dist[k] = Math.min(dist[k]!, dist[k + 1]! + 1);
        if (j < nz - 1) {
          dist[k] = Math.min(dist[k]!, dist[k + nx]! + 1);
          if (i < nx - 1) dist[k] = Math.min(dist[k]!, dist[k + nx + 1]! + D);
          if (i > 0) dist[k] = Math.min(dist[k]!, dist[k + nx - 1]! + D);
        }
      }
    const data = new Uint8Array(nx * nz * 4);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = x0 + (i + 0.5) * cell;
        const z = z0 + (j + 0.5) * cell;
        const g = Math.max(0, land[k]!);
        const back = dist[k]! * cell;
        // Conifers: spires on a jittered grid, each its own height, over a denser canopy.
        const grow = Math.min(1, Math.max(0, (back - SHORE.treeSetback * 0.5) / SHORE.treeSetback));
        let canopy = 0;
        if (grow > 0) {
          const gx = Math.floor(x / SPIRE);
          const gz = Math.floor(z / SPIRE);
          for (let dj = -1; dj <= 1; dj++)
            for (let di = -1; di <= 1; di++) {
              const cx = (gx + di + 0.2 + 0.6 * hash(gx + di, gz + dj, 1)) * SPIRE;
              const cz = (gz + dj + 0.2 + 0.6 * hash(gx + di, gz + dj, 2)) * SPIRE;
              const th = 1 - SHORE.treeVary + 2 * SHORE.treeVary * (0.5 * hash(gx + di, gz + dj, 3) + 0.5 * noise2(cx * 0.06, cz * 0.06, 7));
              const r = Math.hypot(x - cx, z - cz) / (SPIRE * 0.7);
              canopy = Math.max(canopy, th * (1 - 0.65 * Math.min(1, r)));
            }
        }
        // Stands of broadleaf trees (birch, cottonwood) break the conifers in places.
        const dn = noise2(x * SHORE.broadleafScale, z * SHORE.broadleafScale, 5);
        const dec = Math.min(1, Math.max(0, (dn - SHORE.broadleafFrom) / 0.12));
        const conifers = SHORE.treeHeight * grow * canopy * (1 - 0.85 * dec);
        // Alder and willow: a low, rounded band along the water's edge, in front of the conifers; taller and deeper in a broadleaf stand.
        const reach = SHORE.alderTo * (1 + 3 * dec);
        const band = Math.min(1, Math.max(0, (back - SHORE.alderFrom) / SHORE.alderFrom)) * Math.max(0, 1 - Math.max(0, back - reach) / SHORE.alderTo);
        const alder = band > 0 ? SHORE.alderHeight * (1 + dec) * band * (0.55 + 0.45 * noise2(x * 0.35, z * 0.35, 11)) : 0;
        const trees = Math.max(conifers, alder);
        const h = Math.min(SHORE.maxHeight, g + trees);
        data[k * 4] = Math.round((h / SHORE.maxHeight) * 255);
        data[k * 4 + 1] = Math.round(Math.min(1, trees / 2) * 255);
        data[k * 4 + 2] = alder > conifers ? 255 : 0;
        data[k * 4 + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.texture = tex;
    u.uSkyline.value = tex;
    u.uSkyBox.value.set(x0, z0, 1 / (nx * cell), 1 / (nz * cell));
  }

  /** The sky between two looks (k 0..1), its brightness (time skips darken it), and stars at night. */
  setSky(a: keyof typeof SKY, b: keyof typeof SKY, k: number, light = 1): void {
    const u = this.uniforms;
    const A: SkyLook = SKY[a];
    const B: SkyLook = SKY[b];
    mixInto(u.uZenith.value, A.zenith, B.zenith, k);
    mixInto(u.uHorizon.value, A.horizon, B.horizon, k);
    mixInto(u.uGlow.value, A.glow, B.glow, k);
    u.uGlow.value.multiplyScalar(A.glowStrength + (B.glowStrength - A.glowStrength) * k);
    mixInto(u.uTrees.value, A.trees, B.trees, k);
    mixInto(u.uHills.value, A.hills, B.hills, k);
    u.uStars.value = (a === 'night' ? 1 - k : 0) + (b === 'night' ? k : 0);
    u.uSkyLight.value = light;
  }

  /** Start of a frame's bodies: forget last frame's bears (boats are set each frame by boats.ts). */
  beginBears(): void {
    this.bearNear[0] = this.bearNear[1] = Infinity;
    for (let i = 0; i < BEAR_SLOTS * 4; i++) this.uniforms.uBody.value[i]!.set(0, 0, 0, 0);
  }

  /** A bear's body (torso and head capsules), kept if it is one of the two nearest to the camera so far. */
  trackBear(bear: THREE.Object3D, camera: THREE.Camera): void {
    const rig = bear.getObjectByName('rig');
    const head = bear.getObjectByName('head');
    if (!rig || !head) return;
    const d = bear.getWorldPosition(tmpV).distanceToSquared(camera.position);
    const near = this.bearNear;
    const body = this.uniforms.uBody.value;
    let slot: number;
    if (d < near[0]!) {
      // The old nearest moves to the second slot.
      for (let i = 0; i < 4; i++) body[4 + i]!.copy(body[i]!);
      near[1] = near[0]!;
      near[0] = d;
      slot = 0;
    } else if (d < near[1]!) {
      near[1] = d;
      slot = 1;
    } else return;
    const o = slot * 4;
    const put = (out: THREE.Vector4, obj: THREE.Object3D, x: number, y: number, r: number) => {
      tmpV.set(x, y, 0).applyMatrix4(obj.matrixWorld);
      out.set(tmpV.x, tmpV.y, tmpV.z, r);
    };
    put(body[o]!, rig, -0.8, 1.0, 0.44);
    put(body[o + 1]!, rig, 0.62, 1.12, 0);
    put(body[o + 2]!, head, -0.05, 0.0, 0.2);
    put(body[o + 3]!, head, 0.5, -0.07, 0);
  }

  /** A capsule in a boat slot (0-9): from a to b, radius r, kind 1 coat, 2 hull or 3 head; r 0 clears it. */
  setBoatCapsule(slot: number, a: THREE.Vector3, b: THREE.Vector3, r: number, kind: 1 | 2 | 3): void {
    const body = this.uniforms.uBody.value;
    const i = (BEAR_SLOTS * 2 + slot) * 2;
    if (!body[i]) return;
    body[i]!.set(a.x, a.y, a.z, r);
    body[i + 1]!.set(b.x, b.y, b.z, kind);
  }

  /** After the frame's bears and boats are set: how many capsule slots the surface needs to look at. */
  countBodies(): void {
    const body = this.uniforms.uBody.value;
    let n = 0;
    for (let i = 0; i < BODY_CAPSULES; i++) if (body[i * 2]!.w > 0) n = i + 1;
    this.uniforms.uBodyCount.value = n;
  }

  clearBoats(): void {
    const body = this.uniforms.uBody.value;
    for (let i = BEAR_SLOTS * 4; i < body.length; i++) body[i]!.set(0, 0, 0, 0);
  }
}

const tmpV = new THREE.Vector3();
/** Spacing (m) of the tallest conifers along the shore. */
const SPIRE = 2.8;
function hash(x: number, z: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
