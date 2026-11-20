/**
 * Model gallery (?gallery=1): every fish look and animal side by side on a
 * neutral background, with labels, slowly turning, so screenshots can be sent
 * for review. It replaces the game for that page load and touches nothing else.
 *
 * URL options:
 *   gallery=1 | all      everything
 *   gallery=salmon       the salmon life stages
 *   gallery=animals      predators and other species
 *   gallery=return       the return as a sequence: sea, river mouth, up the river, grounds (rows: male, female, jack)
 *   gallery=<item id>    one item, large (e.g. gallery=spawnMale)
 *   spin=<rad/s>         turning speed (default 0.25; 0 holds still)
 *   angle=<rad>          starting angle (0 = side view, head to the right)
 *   tilt=<rad>           camera elevation (default 0.12)
 *   cols=<n>             columns in the grid (default: fitted to the window; 6 for the return sequence)
 */
import * as THREE from 'three';
import { ANIMALS, fishAnimal, type Animal, type AnimalPose } from './animals';
import { bodyLook, type BodyRole, type BodyState } from './bodyChange';
import type { FishLook, FishShape } from './fishMesh';
import { krillGeometry, squidGeometry } from './krill';

interface Item {
  id: string;
  label: string;
  note: string;
  group: 'salmon' | 'animals' | 'return';
  make: () => Animal;
  pose?: (t: number) => AnimalPose;
}

const fish = (id: string, look: FishLook, shape: Partial<FishShape>, label: string, note: string): Item => ({
  id,
  label,
  note,
  group: 'salmon',
  make: () => fishAnimal(id, look, { depth: 1, hump: 0, kype: 0, yolk: 0, ...shape }),
});

/** The return, step by step (bodyChange.ts): where the fish is and how much fat it has left. */
const RETURN_STEPS: { id: string; label: string; place: BodyState['place']; upstream: number; fat: number }[] = [
  { id: 'Sea', label: 'at sea', place: 'sea', upstream: 0, fat: 1 },
  { id: 'Mouth', label: 'river mouth', place: 'river', upstream: 0, fat: 0.85 },
  { id: 'Lower', label: 'lower river', place: 'river', upstream: 0.35, fat: 0.7 },
  { id: 'Upper', label: 'upper river', place: 'river', upstream: 0.7, fat: 0.55 },
  { id: 'Top', label: 'top of the river', place: 'river', upstream: 1, fat: 0.45 },
  { id: 'Grounds', label: 'on the grounds', place: 'grounds', upstream: 1, fat: 0.45 },
];
const RETURN_ROLES: { role: BodyRole; name: string }[] = [
  { role: 'largeMale', name: 'Male' },
  { role: 'female', name: 'Female' },
  { role: 'jack', name: 'Jack' },
];
const returnItems = (): Item[] =>
  RETURN_ROLES.flatMap(({ role, name }) =>
    RETURN_STEPS.map((st) => {
      const { look, shape } = bodyLook({ role, bodyDepth: 0, fat: st.fat, place: st.place, upstream: st.upstream });
      const id = `return${name}${st.id}`;
      const note = `fat ${Math.round(st.fat * 100)}%${shape.dress ? `, dress ${Math.round(shape.dress * 100)}%` : ''}${role === 'jack' ? ' (drawn enlarged)' : ''}`;
      return { id, label: `${name}: ${st.label}`, note, group: 'return' as const, make: () => fishAnimal(id, look, shape) };
    }),
  );

/** A static prey model (krill, squid) wrapped as a gallery animal. */
function preyModel(kind: string, geo: THREE.BufferGeometry, opacity: number): Animal {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, transparent: true, opacity })));
  return { kind, root, update: () => {} };
}

/** Where the bear's strike reaches in the gallery: ahead and below its feet, as if into a river. */
const BEAR_TARGET = new THREE.Vector3(1.9, -0.45, 0);

/** The bear with a spawning sockeye in its jaws, as in the death beat (gore.ts places it the same way). */
function bearWithFish(): Animal {
  const bear = ANIMALS.bear!();
  const fishA = fishAnimal('fish', 'spawnMale', { depth: 1.15, hump: 1, kype: 1, yolk: 0 });
  const mouth = bear.root.getObjectByName('mouth')!;
  fishA.root.rotation.set(0, Math.PI / 2, 0.25);
  fishA.root.position.set(0, 0, -0.05);
  mouth.add(fishA.root);
  return { kind: 'bearCatch', root: bear.root, update: (p) => { bear.update(p); fishA.update({ mode: 'swim', t: p.t, phase: p.t * 20, amp: 0.06 }); } };
}

const ITEMS: Item[] = [
  fish('alevin', 'alevin', { depth: 0.8, yolk: 1 }, 'Alevin', 'yolk sac, large eye, fin fold'),
  fish('fry', 'fry', { depth: 0.95 }, 'Fry', 'faint parr marks, deep fork'),
  fish('smolt', 'smolt', { depth: 0.95 }, 'Smolt', 'silver, dark back, no spots'),
  fish('ocean', 'ocean', { depth: 1 }, 'Ocean adult', 'steel-blue back, silver, no spots'),
  fish('returnSilver', 'returnSilver', { depth: 1.02 }, 'Return (sea)', 'still silver'),
  fish('returnBlush', 'returnBlush', { depth: 1.08, hump: 0.3, kype: 0.3 }, 'Return (fresh water)', 'first blush'),
  fish('spawnMale', 'spawnMale', { depth: 1.15, hump: 1, kype: 1 }, 'Spawning male', 'hump, hooked kype, teeth'),
  fish('spawnFemale', 'spawnFemale', { depth: 1.05, hump: 0.15 }, 'Spawning female', 'red body, green head, no hump'),
  fish('spawnJack', 'spawnJack', { depth: 1, hump: 0.3, kype: 0.4 }, 'Jack', '~300 mm in life; drawn enlarged here'),
  fish('pink', 'pink', { depth: 0.95 }, 'Pink salmon (at sea)', 'large oval spots on back and both tail lobes'),
  fish('herring', 'herring', { depth: 0.9 }, 'Small forage fish', 'slim, forked tail, blue-green back, no adipose fin'),
  ...returnItems(),
  { id: 'krill', label: 'Krill', note: 'main food at sea; drawn larger than life in play', group: 'animals', make: () => preyModel('krill', krillGeometry(), 0.78) },
  { id: 'squid', label: 'Small squid', note: 'occasional food at sea', group: 'animals', make: () => preyModel('squid', squidGeometry(), 0.85) },
  { id: 'char', label: 'Dolly Varden (char)', note: 'pale spots on dark, white fin edges', group: 'animals', make: ANIMALS.char! },
  { id: 'orca', label: 'Orca', note: 'tall dorsal fin, eye and flank patches', group: 'animals', make: ANIMALS.orca! },
  { id: 'shark', label: 'Salmon shark', note: 'stocky, crescent tail, white belly', group: 'animals', make: ANIMALS.shark! },
  { id: 'seal', label: 'Harbor seal', note: 'round head, short muzzle, whiskers, spotted grey', group: 'animals', make: ANIMALS.seal! },
  { id: 'bear', label: 'Brown bear', note: 'shaggy coat, shaped legs, long front claws', group: 'animals', make: ANIMALS.bear!, pose: (t) => ({ mode: 'idle', t }) },
  {
    id: 'bearStrike',
    label: 'Brown bear: strike',
    note: 'head and forepaws plunge into the water',
    group: 'animals',
    make: ANIMALS.bear!,
    pose: (t) => ({ mode: 'strike', t, k: 0.75 + 0.25 * Math.sin(t * 1.2), target: BEAR_TARGET }),
  },
  {
    id: 'bearCatch',
    label: 'Brown bear: catch',
    note: 'a sockeye held in its jaws (death beat)',
    group: 'animals',
    make: () => bearWithFish(),
    pose: (t) => ({ mode: 'strike', t, k: 1, target: BEAR_TARGET, jaw: 0.32 }),
  },
  { id: 'gull', label: 'Gull', note: 'flying', group: 'animals', make: ANIMALS.gull!, pose: (t) => ({ mode: 'fly', t }) },
  { id: 'gullDive', label: 'Gull: diving', note: "the 'strike' pose", group: 'animals', make: ANIMALS.gull!, pose: (t) => ({ mode: 'strike', t }) },
  { id: 'gullFloat', label: 'Gull: scavenging', note: 'floating, pecking at a carcass', group: 'animals', make: ANIMALS.gull!, pose: (t) => ({ mode: 'float', t, pitch: 0.5 + 0.4 * Math.sin(t * 3) }) },
  { id: 'eagle', label: 'Bald eagle', note: 'white head and tail, yellow hooked bill and feet', group: 'animals', make: ANIMALS.eagle!, pose: (t) => ({ mode: 'glide', t }) },
  { id: 'eagleFly', label: 'Bald eagle: flying', note: 'slow, deep wingbeats', group: 'animals', make: ANIMALS.eagle!, pose: (t) => ({ mode: 'fly', t }) },
  { id: 'eaglePerch', label: 'Bald eagle: at a carcass', note: 'perched, tearing', group: 'animals', make: ANIMALS.eagle!, pose: (t) => ({ mode: 'perch', t, pitch: 0.25 + 0.2 * Math.sin(t * 2) }) },
  { id: 'eagleGrab', label: 'Bald eagle: snatch', note: 'feet forward to take a floating fish', group: 'animals', make: ANIMALS.eagle!, pose: (t) => ({ mode: 'grab', t }) },
  { id: 'mergMale', label: 'Common merganser (male)', note: 'floating', group: 'animals', make: ANIMALS.mergMale!, pose: (t) => ({ mode: 'float', t }) },
  { id: 'mergFemale', label: 'Common merganser (female)', note: 'floating', group: 'animals', make: ANIMALS.mergFemale!, pose: (t) => ({ mode: 'float', t }) },
  { id: 'mergChase', label: 'Merganser: underwater chase', note: 'neck out, feet kicking', group: 'animals', make: ANIMALS.mergFemale!, pose: (t) => ({ mode: 'chase', t, pitch: 0 }) },
];

declare global {
  interface Window {
    __gallery?: { ready: boolean; items: string[]; setAngle(a: number): void };
  }
}

export function startGallery(canvas: HTMLCanvasElement, which: string, params: URLSearchParams): void {
  document.body.classList.add('gallery');
  for (const id of ['vignette', 'flash', 'hud', 'screen', 'debug']) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
  // The return sequence is its own view (?gallery=return); "all" stays the one-of-each overview.
  const items = ITEMS.filter((it) => ((which === '1' || which === 'all' || which === '') && it.group !== 'return') || it.group === which || it.id === which);
  const list = items.length ? items : ITEMS;
  // URL options (read through a helper: these are not game parameters).
  const opt = (key: string, fallback: number) => Number(params.get(key) ?? fallback);
  const spin = opt('spin', 0.25);
  let angle = opt('angle', 0.35);
  const tilt = opt('tilt', 0.12);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8d969b);
  scene.add(new THREE.HemisphereLight(0xf2f4f6, 0x5a5650, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 6, 5);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe8f0, 0.5);
  fill.position.set(-4, -1, 3);
  scene.add(fill);

  const n = list.length;
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const cols = Math.max(1, Math.min(n, opt('cols', which === 'return' ? RETURN_STEPS.length : Math.round(Math.sqrt(n * aspect * 0.75)))));
  const rows = Math.ceil(n / cols);
  const cellW = 2.2;
  const cellH = 1.55;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

  const labelLayer = document.createElement('div');
  labelLayer.className = 'gallery-labels';
  document.body.appendChild(labelLayer);
  const title = document.createElement('div');
  title.className = 'gallery-title';
  title.textContent = 'Homewater model gallery: built in code, for review';
  labelLayer.appendChild(title);

  const entries = list.map((it, i) => {
    const animal = it.make();
    const holder = new THREE.Group();
    const c = i % cols;
    const r = Math.floor(i / cols);
    holder.position.set((c - (cols - 1) / 2) * cellW, ((rows - 1) / 2 - r) * cellH + 0.12, 0);
    // Fit the model into its cell.
    animal.update(it.pose ? it.pose(0) : { mode: 'swim', t: 0, amp: 0.03 });
    animal.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(animal.root);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const fit = Math.min((cellW * 0.82) / Math.max(size.x, size.z * 0.8, 1e-3), (cellH * 0.68) / Math.max(size.y, 1e-3));
    const pivot = new THREE.Group();
    pivot.scale.setScalar(fit);
    animal.root.position.sub(centre);
    pivot.add(animal.root);
    holder.add(pivot);
    scene.add(holder);
    const label = document.createElement('div');
    label.className = 'gallery-label';
    label.innerHTML = `<strong></strong><span></span>`;
    label.querySelector('strong')!.textContent = it.label;
    label.querySelector('span')!.textContent = it.note;
    labelLayer.appendChild(label);
    return { it, animal, holder, pivot, label };
  });

  const style = document.createElement('style');
  style.textContent = `
    body.gallery { background: #8d969b; }
    .gallery-labels { position: fixed; inset: 0; pointer-events: none; font-family: 'Instrument Sans', system-ui, sans-serif; color: #f7f8f8; }
    .gallery-title { position: absolute; left: 16px; top: 10px; font-size: 13px; letter-spacing: 0.02em; opacity: 0.85; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
    .gallery-label { position: absolute; transform: translate(-50%, 0); text-align: center; white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
    .gallery-label strong { display: block; font-size: 14px; font-weight: 600; }
    .gallery-label span { display: block; font-size: 11.5px; opacity: 0.85; }
  `;
  document.head.appendChild(style);

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const worldW = cols * cellW;
    const worldH = rows * cellH + 0.25;
    const a = w / Math.max(1, h);
    const halfH = Math.max(worldH / 2, worldW / 2 / a);
    camera.left = -halfH * a;
    camera.right = halfH * a;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.position.set(0, Math.sin(tilt) * 20, Math.cos(tilt) * 20);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const v = new THREE.Vector3();
  let last = performance.now();
  let t = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    angle += spin * dt;
    for (const e of entries) {
      e.pivot.rotation.y = angle;
      e.animal.update(e.it.pose ? e.it.pose(t) : { mode: 'swim', t, phase: t * 5, amp: 0.03 });
      v.set(e.holder.position.x, e.holder.position.y - cellH * 0.43, 0).project(camera);
      e.label.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
      e.label.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.__gallery = {
    ready: true,
    items: list.map((e) => e.id),
    setAngle: (a) => {
      angle = a;
    },
  };
}
