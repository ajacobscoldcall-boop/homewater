/**
 * Photo mode, render side: owns the free camera (photoCamera.ts), the picture
 * pass (photoPass.ts) and the picture options the photo panel sets. The
 * Renderer calls it instead of its play camera while photo mode is open, so
 * the play camera's own state is left exactly as it was and comes back on
 * leaving. Reads the world; never writes it.
 */
import * as THREE from 'three';
import { alevinView } from '../sim/stages/egg';
import type { World } from '../sim/world';
import { NO_MOVE, PhotoCamera, type PhotoBounds, type PhotoMove } from './photoCamera';
import { FOCUS_TAPS, PHOTO, PHOTO_LIMITS, type Look } from './photoConfig';
import { PhotoPass } from './photoPass';
import { quality } from './quality';

export interface PhotoOptions {
  look: Look;
  fov: number;
  focus: boolean;
  showFish: boolean;
  letterbox: boolean;
  mark: boolean;
  /** Capture size multiplier (1 or 2), kept within the quality preset when capturing. */
  scale: number;
}

export const DEFAULT_PHOTO_OPTIONS: Readonly<PhotoOptions> = Object.freeze({ look: 'natural', fov: PHOTO.fovDefault, focus: true, showFish: true, letterbox: false, mark: true, scale: 2 });

const tmp = new THREE.Vector3();

export class PhotoRig {
  active = false;
  readonly camera = new PhotoCamera();
  options: PhotoOptions = { ...DEFAULT_PHOTO_OPTIONS };
  private readonly pass = new PhotoPass();
  private pending: PhotoMove = { ...NO_MOVE };
  private savedFov = 65;
  private bounds: PhotoBounds | null = null;
  private focusDistance = 2;
  private readonly startPos = new THREE.Vector3();

  /** Focus blur is drawn only where the quality preset allows it (never on Low). */
  get focusAvailable(): boolean {
    return FOCUS_TAPS[quality.level] > 0;
  }

  /** How fast the orbit point flies here (m/s). */
  get moveSpeed(): number {
    return (this.bounds?.limits ?? PHOTO_LIMITS.open).moveSpeed;
  }

  begin(cam: THREE.PerspectiveCamera, w: World, ground: (x: number, z: number) => number): void {
    this.active = true;
    this.savedFov = cam.fov;
    this.bounds = boundsFor(w, ground);
    this.startPos.copy(cam.position);
    this.camera.begin(cam.position, this.bounds);
    this.pending = { ...NO_MOVE };
  }

  /** Leave: the play camera's field of view comes back; the pass frees its target. */
  end(cam: THREE.PerspectiveCamera): void {
    this.active = false;
    cam.fov = this.savedFov;
    cam.updateProjectionMatrix();
    this.pass.release();
    this.bounds = null;
  }

  /** Add camera input for the next frame (the photo panel calls this). */
  nudge(m: Partial<PhotoMove>): void {
    const p = this.pending;
    p.yaw += m.yaw ?? 0;
    p.pitch += m.pitch ?? 0;
    p.zoom += m.zoom ?? 0;
    p.right += m.right ?? 0;
    p.up += m.up ?? 0;
    p.forward += m.forward ?? 0;
  }

  /** Back to the view photo mode opened with. */
  reset(): void {
    if (this.bounds) this.camera.begin(this.startPos, this.bounds);
  }

  /** Each frame in photo mode, in place of the play camera. */
  place(cam: THREE.PerspectiveCamera, w: World, player: THREE.Object3D | null): void {
    const b = this.bounds;
    if (!b) return;
    this.camera.move(this.pending, b);
    this.pending = { ...NO_MOVE };
    const v = this.camera.view(b);
    cam.position.set(v.position.x, v.position.y, v.position.z);
    cam.lookAt(v.target.x, v.target.y, v.target.z);
    if (cam.fov !== this.options.fov) {
      cam.fov = this.options.fov;
      cam.updateProjectionMatrix();
    }
    this.focusDistance = cam.position.distanceTo(tmp.set(w.body.pos.x, w.body.pos.y, w.body.pos.z));
    if (player) player.visible = this.options.showFish && !(w.stageId === 'egg' && alevinView(w)?.phase === 'egg');
  }

  private passOptions() {
    return { look: this.options.look, focusTaps: this.options.focus ? FOCUS_TAPS[quality.level] : 0, focusDistance: this.focusDistance, letterbox: this.options.letterbox };
  }

  draw(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera): void {
    this.pass.renderToScreen(r, scene, cam, this.passOptions());
  }

  capture(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
    return this.pass.capture(r, scene, cam, this.passOptions(), width, height);
  }
}

function boundsFor(w: World, ground: (x: number, z: number) => number): PhotoBounds {
  const b = w.body.pos;
  return {
    fish: { x: b.x, y: b.y, z: b.z },
    surfaceY: w.arena.surfaceY,
    ground,
    limits: w.arena.kind === 'gravel' ? PHOTO_LIMITS.redd : PHOTO_LIMITS.open,
  };
}
