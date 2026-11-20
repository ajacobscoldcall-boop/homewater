/**
 * Solid scenery the camera must not clip into: rocks, logs, roots and other
 * rigid meshes built by the env builders (src/render/env/). Terrain is left
 * out (the camera tests the scenery's ground function for that), and so are
 * swaying plants (passing through a weed is fine), transparent decals and
 * anything drawn without depth.
 *
 * One ray per frame, only against meshes whose bounds come near the camera's
 * boom, so it stays cheap on Low.
 */
import * as THREE from 'three';
import type { V3 } from './cameraRig';
import { CAMERA } from './cameraConfig';

interface Solid {
  mesh: THREE.Mesh;
  centre: THREE.Vector3;
  radius: number;
}

const ray = new THREE.Raycaster();
const hits: THREE.Intersection[] = [];
const vFrom = new THREE.Vector3();
const vDir = new THREE.Vector3();
const vMid = new THREE.Vector3();

/** True for a material that sways (plants) or does not occlude. */
function soft(m: THREE.Material): boolean {
  const defs = (m as unknown as { defines?: Record<string, string> }).defines;
  if (defs && 'HW_SWAY' in defs) return true;
  return m.transparent || !m.depthWrite || !m.depthTest || m.visible === false;
}

export class SceneryProbe {
  private solids: Solid[] = [];
  private near: THREE.Mesh[] = [];

  /** Collect the solid meshes of a freshly built scene (its matrices must be up to date). */
  build(group: THREE.Object3D | null): void {
    this.solids = [];
    if (!group) return;
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o.userData.terrain || o.userData.cameraPass) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.some(soft)) return;
      // Skip anything not lying in world space at a fixed spot (the dome follows the camera).
      if (!o.frustumCulled) return;
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const inst = mesh as THREE.InstancedMesh;
      const bs = inst.isInstancedMesh ? (inst.boundingSphere ?? (inst.computeBoundingSphere(), inst.boundingSphere)) : mesh.geometry.boundingSphere;
      if (!bs) return;
      const sphere = bs.clone().applyMatrix4(mesh.matrixWorld);
      this.solids.push({ mesh, centre: sphere.center, radius: sphere.radius });
    });
  }

  get count(): number {
    return this.solids.length;
  }

  /** Distance from `from` along unit `dir` to the first solid mesh within `max`, or Infinity. */
  rayHit(from: V3, dir: V3, max: number): number {
    if (!this.solids.length) return Infinity;
    vFrom.set(from.x, from.y, from.z);
    vDir.set(dir.x, dir.y, dir.z);
    vMid.copy(vDir).multiplyScalar(max / 2).add(vFrom);
    this.near.length = 0;
    for (const s of this.solids) {
      if (!s.mesh.visible) continue;
      if (s.centre.distanceTo(vMid) < s.radius + max / 2) this.near.push(s.mesh);
    }
    if (!this.near.length) return Infinity;
    ray.set(vFrom, vDir);
    // A fish nosing into a rock (the sim has no rocks): ignore what is touching it, or the camera would sit inside the fish.
    ray.near = CAMERA.rayNear;
    ray.far = max;
    hits.length = 0;
    ray.intersectObjects(this.near, false, hits);
    return hits.length ? hits[0]!.distance : Infinity;
  }
}
