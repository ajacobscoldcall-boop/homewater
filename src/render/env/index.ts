/**
 * Procedural places, one builder per arena. The renderer calls
 * buildEnvironment() when a stage starts and update() every frame; nothing
 * here writes to the simulation. Gameplay geometry (floors, walls, weed and
 * cover positions, gravel patches, hiding spots) is read from the sim so what
 * the player sees matches what the fish collides with.
 */
import * as THREE from 'three';
import type { EntityKind } from '../../sim/types';
import type { World } from '../../sim/world';
import { buildCoast } from './coast';
import { buildGrounds } from './grounds';
import { FogCull, type Detail } from './kit';
import { buildLake } from './lake';
import { buildOcean } from './ocean';
import { buildRedd } from './redd';
import { buildRiver } from './river';

export type { Detail } from './kit';
export { buildGravelPatch } from './gravel';

export interface EnvScene {
  readonly group: THREE.Group;
  /** Entity kinds this scene draws itself; the renderer skips them. */
  readonly handles: ReadonlySet<EntityKind>;
  /** Where an animal standing at (x, z) has its feet: banks included. */
  ground(x: number, z: number): number;
  update(w: World, dt: number, camera: THREE.Camera): void;
}

export interface EnvOptions {
  /** 0 = low, 1 = medium, 2 = high. */
  detail: Detail;
  /** The scene fog, whose colour changes with depth and light. */
  fog: THREE.FogExp2;
}

/** What each arena builder fills in. */
export interface EnvParts {
  group: THREE.Group;
  handles?: EntityKind[];
  ground?: (x: number, z: number) => number;
  update?: (w: World, dt: number, camera: THREE.Camera) => void;
  /** How dark the water gets looking straight down, as a share of the fog colour. */
  down?: number;
}

export function buildEnvironment(w: World, opts: EnvOptions): EnvScene {
  const kind = w.arena.kind;
  let parts: EnvParts;
  switch (kind) {
    case 'gravel':
      parts = buildRedd(w, opts.detail);
      break;
    case 'lake':
      parts = buildLake(w, opts.detail);
      break;
    case 'river':
      parts = buildRiver(w, opts.detail);
      break;
    case 'ocean':
      parts = buildOcean(w, opts.detail, opts.fog);
      break;
    case 'bayCreek':
      parts = buildCoast(w, opts.detail);
      break;
    default:
      parts = buildGrounds(w, opts.detail);
  }
  const group = parts.group;
  group.name = `env-${kind}`;
  const dome = kind === 'gravel' ? null : depthDome(opts.fog, parts.down ?? 0.6);
  if (dome) group.add(dome);
  // Everything that can be lost in the fog is skipped when it is.
  const cull = new FogCull();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (o === group || !mesh.isMesh || !o.frustumCulled || o === dome) return;
    mesh.geometry.computeBoundingSphere();
    cull.add(o);
  });
  const floor = (x: number, z: number) => w.arena.floor(x, z);
  return {
    group,
    handles: new Set(parts.handles ?? []),
    ground: parts.ground ?? floor,
    update(world, dt, camera) {
      if (dome) dome.position.copy(camera.position);
      cull.update(camera, opts.fog.density);
      parts.update?.(world, dt, camera);
    },
  };
}

/**
 * The water around the camera: brighter toward the surface, darker below, the
 * fog colour at the horizon so distant scenery fades into it seamlessly.
 */
function depthDome(fog: THREE.FogExp2, down: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    uniforms: { uFog: { value: fog.color }, uDown: { value: down }, uUp: { value: 1.35 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog; uniform float uDown; uniform float uUp;
      varying vec3 vDir;
      void main() {
        float y = normalize(vDir).y;
        float k = y < 0.0 ? mix(1.0, uDown, smoothstep(0.0, 0.85, -y)) : mix(1.0, uUp, smoothstep(0.05, 0.9, y));
        gl_FragColor = vec4(uFog * k, 1.0);
        // Match the fog on lit materials, which are converted to the output colour space.
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), mat);
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  dome.name = 'depthDome';
  return dome;
}
