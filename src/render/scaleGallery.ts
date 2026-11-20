/**
 * The to-scale gallery (?gallery=scale, or ?gallery=scale-ocean for one row):
 * each stage's models in a row at the size they are drawn in play, beside the
 * player's fish, labelled with the real length that size stands for. Each row
 * has its own zoom (an orca and a krill share the ocean row), shown at its end.
 * For reviewing the scale audit (tests/unit/scale.test.ts); render only.
 */
import * as THREE from 'three';
import { LINEUP, measure, STAGE_PLAYER, unitsPerMetre, type ScaleStage } from './scaleLineup';

const ROW_TITLE: Record<ScaleStage, string> = {
  egg: 'In the gravel',
  fry: 'The lake (fry)',
  smolt: 'The smolt run',
  ocean: 'At sea',
  adult: 'The return and the grounds',
};

export function startScaleGallery(canvas: HTMLCanvasElement, which: string): void {
  document.body.classList.add('gallery');
  for (const id of ['vignette', 'flash', 'hud', 'screen', 'debug']) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
  const only = which.startsWith('scale-') ? (which.slice(6) as ScaleStage) : null;
  const stages = (Object.keys(LINEUP) as ScaleStage[]).filter((s) => !only || s === only);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8d969b);
  scene.add(new THREE.HemisphereLight(0xf2f4f6, 0x5a5650, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 6, 5);
  scene.add(sun);

  const W = 21;
  const rowH = 2.2;
  const labels = document.createElement('div');
  labels.className = 'gallery-labels';
  document.body.appendChild(labels);
  const style = document.createElement('style');
  style.textContent = `
    body.gallery { background: #8d969b; }
    .gallery-labels { position: fixed; inset: 0; pointer-events: none; font-family: 'Instrument Sans', system-ui, sans-serif; color: #f7f8f8; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
    .scale-row { position: absolute; left: 14px; font-size: 14px; font-weight: 600; }
    .scale-row span { display: block; font-size: 11px; font-weight: 400; opacity: 0.85; }
    .scale-item { position: absolute; transform: translate(-50%, 0); text-align: center; white-space: nowrap; font-size: 11px; }
  `;
  document.head.appendChild(style);
  const place: { el: HTMLElement; at: THREE.Vector3 }[] = [];
  const label = (cls: string, html: string, at: THREE.Vector3) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    labels.appendChild(el);
    place.push({ el, at });
  };

  stages.forEach((stage, r) => {
    const items = LINEUP[stage];
    const perMetre = unitsPerMetre(stage, measure(items[0]!.make()));
    const sized = items.map((it) => {
      const obj = it.make();
      obj.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      return { it, obj, len: size.x * it.scale, high: size.y * it.scale, metres: (measure(obj, it.measure) * it.scale) / perMetre };
    });
    // One zoom for the row: each model gets a slot at least wide enough for its label, and the row fits
    // across the page and inside its height. Found by halving, since small models take the minimum slot.
    const slot = 1.6;
    const gap = 0.25;
    const width = (z: number) => sized.reduce((sum, s) => sum + Math.max(slot, s.len * z) + gap, 0);
    let lo = 0;
    let hi = 1e4;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (width(mid) <= W - 1.5) lo = mid;
      else hi = mid;
    }
    const zoom = Math.min(lo, (rowH * 0.5) / Math.max(...sized.map((s) => s.high)));
    const y = ((stages.length - 1) / 2 - r) * rowH;
    let x = -W / 2 + 1.5;
    for (const s of sized) {
      const w = Math.max(slot, s.len * zoom);
      const holder = new THREE.Group();
      holder.scale.setScalar(s.it.scale * zoom);
      holder.add(s.obj);
      s.obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(s.obj);
      const c = box.getCenter(new THREE.Vector3());
      s.obj.position.sub(c);
      holder.position.set(x + w / 2, y + 0.12, 0);
      scene.add(holder);
      const cm = s.metres >= 1 ? `${s.metres.toFixed(1)} m` : s.metres >= 0.01 ? `${(s.metres * 100).toFixed(1)} cm` : `${(s.metres * 1000).toFixed(1)} mm`;
      label('scale-item', `${s.it.label}<br>${cm}`, new THREE.Vector3(x + w / 2, y - 0.55, 0));
      x += w + gap;
    }
    label('scale-row', `${ROW_TITLE[stage]}<span>${STAGE_PLAYER[stage].label}; this row shown at ${zoom.toFixed(2)}× its size in play</span>`, new THREE.Vector3(-W / 2, y + 1.08, 0));
  });

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const a = w / Math.max(1, h);
    const halfH = Math.max((stages.length * rowH) / 2 + 0.3, (W / 2 + 0.6) / a);
    camera.left = -halfH * a;
    camera.right = halfH * a;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const v = new THREE.Vector3();
    for (const p of place) {
      v.copy(p.at).project(camera);
      const left = ((v.x + 1) / 2) * w;
      p.el.style.left = p.el.className === 'scale-row' ? `${Math.max(14, left)}px` : `${left}px`;
      p.el.style.top = `${((1 - v.y) / 2) * h}px`;
    }
  };
  window.addEventListener('resize', resize);
  resize();
  const frame = () => {
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__gallery = { ready: true, items: stages, setAngle: () => {} };
}
