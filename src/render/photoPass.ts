/**
 * Photo mode's picture pass: the scene drawn into an off-screen target, then
 * one full-screen pass for the look (colour grade), the focus blur (a cheap
 * depth-of-field gather, off on Low) and the letterbox. The same pass draws
 * the screen while photo mode is open and the captured picture, so what the
 * player sees is what they save.
 *
 * Render only. Used only in photo mode, when the game is stopped, so the
 * extra pass costs nothing while playing. Its materials live as long as the
 * page (nothing to release to the ProgramKeeper); targets are freed on leave.
 */
import * as THREE from 'three';
import { FOCUS_MAX_BLUR, FOCUS_RANGE, GRADES, LETTERBOX_ASPECT, type Look } from './photoConfig';

export interface PassOptions {
  look: Look;
  /** Taps of the focus blur; 0 is off. */
  focusTaps: number;
  /** Distance from the camera kept sharp (m). */
  focusDistance: number;
  letterbox: boolean;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 uSize;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uRange;
uniform float uMaxBlur;
uniform float uSat;
uniform float uContrast;
uniform vec3 uTint;
uniform float uLift;
uniform float uBars;
varying vec2 vUv;

float viewDist(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(d, uNear, uFar);
}

// 0 in focus, 1 fully blurred.
float coc(float z) {
  return clamp(abs(z - uFocus) / max(0.001, uFocus * uRange) - 1.0, 0.0, 1.0);
}

vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
#if TAPS > 0
  float c0 = coc(viewDist(vUv));
  if (c0 > 0.0) {
    // Golden-angle disc gather, radius set by this pixel's blur; taps nearer than
    // the focus (the fish) barely count, so the sharp fish doesn't smear outwards.
    vec2 r = vec2(uMaxBlur * uSize.y / uSize.x, uMaxBlur) * c0;
    vec3 sum = col;
    float wsum = 1.0;
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i) + 0.5;
      float a = fi * 2.39996;
      float rad = sqrt(fi / float(TAPS));
      vec2 uv = vUv + vec2(cos(a), sin(a)) * rad * r;
      float z = viewDist(uv);
      float w = z < uFocus * (1.0 - uRange) ? 0.15 : max(0.15, coc(z));
      sum += texture2D(tScene, uv).rgb * w;
      wsum += w;
    }
    col = sum / wsum;
  }
#endif
  col = toSRGB(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  col = col * uTint + uLift;
  col = clamp(col, 0.0, 1.0);
  if (abs(vUv.y - 0.5) > 0.5 - uBars) col = vec3(0.0);
  gl_FragColor = vec4(col, 1.0);
}`;

interface Targets {
  scene: THREE.WebGLRenderTarget;
  width: number;
  height: number;
}

export class PhotoPass {
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;
  private readonly post = new THREE.Scene();
  private readonly ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private screenTargets: Targets | null = null;
  private readonly size = new THREE.Vector2();

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: { TAPS: 0 },
      uniforms: {
        tScene: { value: null },
        tDepth: { value: null },
        uSize: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.05 },
        uFar: { value: 400 },
        uFocus: { value: 2 },
        uRange: { value: FOCUS_RANGE },
        uMaxBlur: { value: FOCUS_MAX_BLUR },
        uSat: { value: 1 },
        uContrast: { value: 1 },
        uTint: { value: new THREE.Vector3(1, 1, 1) },
        uLift: { value: 0 },
        uBars: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.post.add(this.quad);
  }

  /** Draw the scene through the pass to the screen. */
  renderToScreen(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, o: PassOptions): void {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.floor(this.size.x));
    const hh = Math.max(1, Math.floor(this.size.y));
    if (!this.screenTargets || this.screenTargets.width !== w || this.screenTargets.height !== hh) {
      this.screenTargets?.scene.dispose();
      this.screenTargets = makeTargets(renderer, w, hh);
    }
    this.draw(renderer, scene, camera, o, this.screenTargets, null);
  }

  /**
   * Draw the scene through the pass at width × height and read the pixels back,
   * top row first, as RGBA bytes in display colour.
   */
  capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, o: PassOptions, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
    const t = makeTargets(renderer, width, height);
    const out = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, depthBuffer: false });
    try {
      this.draw(renderer, scene, camera, o, t, out);
      const raw = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(out, 0, 0, width, height, raw);
      // WebGL reads bottom row first: flip.
      const img = new Uint8ClampedArray(width * height * 4);
      const row = width * 4;
      for (let y = 0; y < height; y++) img.set(raw.subarray((height - 1 - y) * row, (height - y) * row), y * row);
      return img;
    } finally {
      renderer.setRenderTarget(null);
      t.scene.dispose();
      out.dispose();
    }
  }

  /** Free the screen-sized target (on leaving photo mode). */
  release(): void {
    this.screenTargets?.scene.dispose();
    this.screenTargets = null;
  }

  private draw(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, o: PassOptions, t: Targets, out: THREE.WebGLRenderTarget | null): void {
    const u = this.material.uniforms;
    const taps = o.focusTaps;
    if (this.material.defines.TAPS !== taps) {
      this.material.defines.TAPS = taps;
      this.material.needsUpdate = true;
    }
    const g = GRADES[o.look];
    u.tScene!.value = t.scene.texture;
    u.tDepth!.value = t.scene.depthTexture;
    (u.uSize!.value as THREE.Vector2).set(t.width, t.height);
    u.uNear!.value = camera.near;
    u.uFar!.value = camera.far;
    u.uFocus!.value = Math.max(0.05, o.focusDistance);
    u.uSat!.value = g.saturation;
    u.uContrast!.value = g.contrast;
    (u.uTint!.value as THREE.Vector3).set(...g.tint);
    u.uLift!.value = g.lift;
    u.uBars!.value = o.letterbox ? letterboxBar(t.width, t.height) : 0;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(t.scene);
    renderer.render(scene, camera);
    renderer.setRenderTarget(out);
    renderer.render(this.post, this.ortho);
    renderer.setRenderTarget(prev);
  }
}

/** Each letterbox bar's height as a share of the picture's height (0 when the picture is already wide enough). */
export function letterboxBar(width: number, height: number): number {
  return Math.max(0, (1 - (width * LETTERBOX_ASPECT) / Math.max(1, height)) / 2);
}

function makeTargets(renderer: THREE.WebGLRenderer, width: number, height: number): Targets {
  // Half float keeps the dark water free of banding before the grade; fall back to bytes where it can't be drawn into.
  const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const depthTexture = new THREE.DepthTexture(width, height);
  depthTexture.type = THREE.UnsignedIntType;
  const scene = new THREE.WebGLRenderTarget(width, height, {
    type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthBuffer: true,
    depthTexture,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  return { scene, width, height };
}
