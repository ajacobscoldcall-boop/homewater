/**
 * The magnetic track's glows (render only; reads the sim's `track` entities, never writes them). One
 * instanced draw of camera-facing soft sprites, additive, each instance's colour carrying its brightness
 * (fade in and out over its life, how close to the track's centre the fish is, distance from the camera).
 * The default view's glows are smaller and brighter with a twinkle; Documentary view's are larger and
 * softer. Tuning in trackConfig.ts.
 */
import * as THREE from 'three';
import type { Entity } from '../sim/types';
import type { World } from '../sim/world';
import { TRACK_LOOK } from './trackConfig';

/** A bright core inside a soft halo. */
function glowTexture(): THREE.DataTexture {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.min(1, Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2);
      const halo = Math.pow(1 - r, 2.2);
      const core = Math.exp(-(r * r) / 0.025);
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * Math.min(1, 0.55 * halo + 0.75 * core));
    }
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.needsUpdate = true;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  return t;
}

const camPos = new THREE.Vector3();
const base = new THREE.Color();

export class TrackGlow {
  readonly geometry = new THREE.PlaneGeometry(1, 1);
  readonly material = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

  /** Pose one glow: facing the camera, sized and coloured (the colour is its brightness). */
  pose(w: World, e: Entity, camera: THREE.Camera, doc: boolean, p: THREE.Vector3, q: THREE.Quaternion, s: THREE.Vector3, c: THREE.Color): void {
    const L = TRACK_LOOK;
    const look = doc ? L.soft : L.marker;
    const life = Math.max(0, Math.min(1, e.timer / L.life));
    const fade = Math.sin(Math.PI * life);
    const sense = L.faintFloor + (1 - L.faintFloor) * Math.max(0, Math.min(1, e.value ?? 0));
    camera.getWorldPosition(camPos);
    const d = camPos.distanceTo(p);
    const far = 1 - smooth(L.fadeNear, L.fadeFar, d);
    const twinkle = doc ? 1 : 1 - L.twinkle.depth * (0.5 + 0.5 * Math.sin(w.time * L.twinkle.speed + e.id * 2.1));
    q.copy(camera.quaternion);
    s.setScalar(Math.max(look.size * sense, L.minAngle * d) * (0.35 + 0.65 * fade));
    c.copy(base.setHex(look.colour)).multiplyScalar(look.bright * fade * sense * far * twinkle);
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
