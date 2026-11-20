/**
 * Photo mode, screen side: the options panel, the corner hint, the mark,
 * mouse, keyboard and gamepad control of the free camera, and capture to a
 * PNG (download, and copy to the clipboard where the browser allows it).
 *
 * App opens and closes it (App.openPhoto / closePhoto) and stops the
 * simulation while it is open; the camera and picture pass are in
 * src/render/photoRig.ts. Options are kept per browser in localStorage
 * (`homewater.photo`), not in the save.
 */
import { bindings, k, type Action } from '../input/bindings';
import { deadzone, PAD, pollPad } from '../input/gamepad';
import { captureSize, photoFileName } from '../render/photoCamera';
import { CAPTURE_MAX_PIXELS, CAPTURE_MAX_SCALE, LOOK_LABELS, LOOKS, MARK, PHOTO, type Look } from '../render/photoConfig';
import { letterboxBar } from '../render/photoPass';
import { DEFAULT_PHOTO_OPTIONS, type PhotoOptions } from '../render/photoRig';
import { quality } from '../render/quality';
import type { Renderer } from '../render/Renderer';
import { h } from './dom';
import './photoMode.css';

export const PHOTO_STORAGE_KEY = 'homewater.photo';

/** Rebuild photo options from stored data; anything malformed falls back to the defaults. */
export function parsePhotoOptions(raw: unknown): PhotoOptions {
  const o: PhotoOptions = { ...DEFAULT_PHOTO_OPTIONS };
  if (!raw || typeof raw !== 'object') return o;
  const r = raw as Record<string, unknown>;
  if (typeof r.look === 'string' && (LOOKS as readonly string[]).includes(r.look)) o.look = r.look as Look;
  if (typeof r.fov === 'number' && Number.isFinite(r.fov)) o.fov = Math.min(PHOTO.fovMax, Math.max(PHOTO.fovMin, Math.round(r.fov)));
  for (const key of ['focus', 'showFish', 'letterbox', 'mark'] as const) if (typeof r[key] === 'boolean') o[key] = r[key];
  if (r.scale === 1 || r.scale === 2) o.scale = r.scale;
  return o;
}

function loadOptions(): PhotoOptions {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(PHOTO_STORAGE_KEY);
    return raw ? parsePhotoOptions(JSON.parse(raw)) : { ...DEFAULT_PHOTO_OPTIONS };
  } catch {
    return { ...DEFAULT_PHOTO_OPTIONS };
  }
}

function saveOptions(o: PhotoOptions): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PHOTO_STORAGE_KEY, JSON.stringify(o));
  } catch {
    // Storage is optional; the options still apply for this visit.
  }
}

/** Whether this browser lets the page put a PNG on the clipboard. */
export function canCopyImage(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
}

export interface PhotoHost {
  renderer: Renderer;
  /** The stage being photographed, for the file name. */
  stageId(): string;
  /** The player asked to leave (the Leave button or the gamepad's B). */
  leave(): void;
}

const MOVE_ACTIONS: Action[] = ['steerLeft', 'steerRight', 'forward', 'easeOff', 'rise', 'dive', 'burst'];

export class PhotoMode {
  open = false;
  private root: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private hint: HTMLElement | null = null;
  private mark: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private held = new Set<string>();
  private hintLeft = 0;
  private uiHidden = false;
  private drag: { x: number; y: number; pan: boolean } | null = null;
  private padPrev = new Set<number>();
  private lastUrl: string | null = null;
  /** Captures finished this visit (tests read it). */
  captures = 0;
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];

  constructor(private readonly host: PhotoHost) {
    host.renderer.photo.options = loadOptions();
  }

  private get options(): PhotoOptions {
    return this.host.renderer.photo.options;
  }

  /** Show the panel and start listening; App has already opened the camera. */
  show(): void {
    if (this.open) return;
    this.open = true;
    this.held.clear();
    this.drag = null;
    this.uiHidden = false;
    this.hintLeft = PHOTO.hintTime;
    this.padPrev = padButtons();
    this.build();
    const canvas = this.host.renderer.renderer.domElement;
    this.on(window, 'keydown', (e) => this.keyDown(e as KeyboardEvent));
    this.on(window, 'keyup', (e) => this.held.delete((e as KeyboardEvent).code));
    this.on(window, 'blur', () => this.held.clear());
    this.on(canvas, 'pointerdown', (e) => this.pointerDown(e as PointerEvent));
    this.on(window, 'pointermove', (e) => this.pointerMove(e as PointerEvent));
    this.on(window, 'pointerup', () => (this.drag = null));
    this.on(canvas, 'wheel', (e) => this.wheel(e as WheelEvent), { passive: false });
    this.on(canvas, 'contextmenu', (e) => e.preventDefault());
  }

  /** Remove the panel and every listener. */
  hide(): void {
    if (!this.open) return;
    this.open = false;
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts);
    this.listeners.length = 0;
    this.root?.remove();
    this.root = this.panel = this.hint = this.mark = this.status = null;
    this.held.clear();
    if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
    this.lastUrl = null;
  }

  /** H: hide or show the panel and hint, for a clean look at the picture. */
  toggleUi(): void {
    this.uiHidden = !this.uiHidden;
    if (!this.uiHidden) this.hintLeft = PHOTO.hintTime;
    this.refreshVisibility();
  }

  /** Each frame while open: held keys and the gamepad move the camera; the hint fades. */
  frame(dt: number): void {
    if (!this.open) return;
    const rig = this.host.renderer.photo;
    const b = bindings();
    const has = (a: Action) => b[a].some((c) => this.held.has(c));
    const axis = (neg: Action, pos: Action) => (has(pos) ? 1 : 0) - (has(neg) ? 1 : 0);
    const lr = axis('steerLeft', 'steerRight');
    const fb = axis('easeOff', 'forward');
    const ud = axis('dive', 'rise');
    const speed = rig.moveSpeed;
    if (has('burst')) {
      // Held burst turns the movement keys into orbit and zoom.
      rig.nudge({ yaw: lr * PHOTO.orbitSpeed * dt, pitch: ud * PHOTO.orbitSpeed * dt, zoom: fb * PHOTO.zoomSpeed * dt });
    } else {
      rig.nudge({ right: lr * speed * dt, forward: fb * speed * dt, up: ud * speed * dt });
    }
    this.pollGamepad(dt, speed);
    if (this.hintLeft > 0) {
      this.hintLeft -= dt;
      if (this.hintLeft <= 0) this.refreshVisibility();
    }
    this.placeMark();
  }

  private pollGamepad(dt: number, speed: number): void {
    const p = pollPad();
    if (!p) return;
    const s = p.snap;
    const rig = this.host.renderer.photo;
    const ax = (i: number) => deadzone(s.axes[i] ?? 0);
    const val = (i: number) => s.buttons[i]?.value ?? 0;
    const pressed = (i: number) => !!s.buttons[i] && (s.buttons[i]!.pressed || s.buttons[i]!.value > 0.5);
    rig.nudge({
      right: ax(0) * speed * dt,
      forward: -ax(1) * speed * dt,
      up: ((pressed(PAD.rb) ? 1 : 0) - (pressed(PAD.lb) ? 1 : 0)) * speed * dt,
      yaw: ax(2) * PHOTO.orbitSpeed * dt,
      pitch: -ax(3) * PHOTO.orbitSpeed * dt,
      zoom: (val(PAD.rt) - val(PAD.lt)) * PHOTO.zoomSpeed * dt,
    });
    const now = padButtons();
    const edge = (i: number) => now.has(i) && !this.padPrev.has(i);
    if (edge(PAD.a)) void this.capture();
    if (edge(PAD.y)) rig.reset();
    if (edge(PAD.x)) this.toggleUi();
    const leave = edge(PAD.b);
    this.padPrev = now;
    if (leave) this.host.leave();
  }

  private keyDown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement | null)?.tagName === 'INPUT' && e.code !== 'Enter') return;
    const b = bindings();
    if (MOVE_ACTIONS.some((a) => b[a].includes(e.code))) {
      this.held.add(e.code);
      e.preventDefault();
    }
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      void this.capture();
    } else if (b.act.includes(e.code)) {
      this.host.renderer.photo.reset();
    }
  }

  private pointerDown(e: PointerEvent): void {
    this.drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
  }

  private pointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    const rig = this.host.renderer.photo;
    if (d.pan) {
      const k = PHOTO.dragPan * rig.camera.dist;
      rig.nudge({ right: -dx * k, up: dy * k });
    } else {
      rig.nudge({ yaw: -dx * PHOTO.dragOrbit, pitch: dy * PHOTO.dragOrbit });
    }
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    this.host.renderer.photo.nudge({ zoom: -e.deltaY * PHOTO.wheelZoom });
  }

  private on(t: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    t.addEventListener(type, fn, opts);
    this.listeners.push([t, type, fn, opts]);
  }

  // ---------- Panel ----------

  private build(): void {
    const app = document.getElementById('app') ?? document.body;
    this.root?.remove();
    this.mark = h('div', { id: 'photo-mark', 'aria-hidden': 'true' }, MARK.text);
    this.hint = h('div', { id: 'photo-hint' }, ...hintLines().map((l) => h('div', {}, l)));
    this.status = h('p', { id: 'photo-status', class: 'muted', 'aria-live': 'polite' });
    this.panel = h('div', { id: 'photo-panel', role: 'dialog', 'aria-label': 'Photo mode' });
    this.root = h('div', { id: 'photo' }, this.mark, this.hint, this.panel);
    app.append(this.root);
    this.fillPanel();
    this.refreshVisibility();
    this.placeMark();
  }

  private fillPanel(): void {
    const p = this.panel;
    if (!p) return;
    const o = this.options;
    const rig = this.host.renderer.photo;
    const set = (patch: Partial<PhotoOptions>) => {
      Object.assign(o, patch);
      saveOptions(o);
      this.fillPanel();
      this.placeMark();
    };
    const toggle = (id: keyof PhotoOptions & ('focus' | 'showFish' | 'letterbox' | 'mark'), label: string, disabled = false) =>
      h('button', { class: 'photo-toggle', 'data-photo': id, 'aria-pressed': String(!!o[id] && !disabled), disabled, onclick: (e: Event) => (blur(e), set({ [id]: !o[id] })) }, label);
    const maxScale = CAPTURE_MAX_SCALE[quality.level];
    const size = (s: number) => this.captureDims(s);
    const fov = h('input', { id: 'photo-fov', type: 'range', min: String(PHOTO.fovMin), max: String(PHOTO.fovMax), step: '1', value: String(o.fov), 'aria-label': 'Field of view' });
    const fovOut = h('span', { class: 'photo-value' }, `${o.fov}°`);
    fov.addEventListener('input', () => {
      o.fov = Number(fov.value);
      fovOut.textContent = `${o.fov}°`;
      saveOptions(o);
    });
    p.replaceChildren(
      h('div', { class: 'photo-head' }, h('h2', {}, 'Photo mode'), h('span', { class: 'label' }, 'Game paused')),
      h('div', { class: 'photo-group' }, h('span', { class: 'label' }, 'Look'), h('div', { class: 'photo-row' }, ...LOOKS.map((l) => h('button', { 'data-look': l, 'aria-pressed': String(o.look === l), onclick: (e: Event) => (blur(e), set({ look: l })) }, LOOK_LABELS[l])))),
      h('div', { class: 'photo-group' }, h('label', { class: 'label', for: 'photo-fov' }, 'Field of view'), h('div', { class: 'photo-row photo-slider' }, fov, fovOut)),
      h(
        'div',
        { class: 'photo-group' },
        h('span', { class: 'label' }, 'Frame'),
        h('div', { class: 'photo-row' }, toggle('focus', 'Focus on the fish', !rig.focusAvailable), toggle('showFish', 'Show the fish'), toggle('letterbox', 'Letterbox'), toggle('mark', 'Homewater mark')),
        rig.focusAvailable ? null : h('p', { class: 'muted photo-note' }, 'Focus blur is off on Low graphics.'),
      ),
      h(
        'div',
        { class: 'photo-group' },
        h('span', { class: 'label' }, 'Picture size'),
        h(
          'div',
          { class: 'photo-row' },
          ...[1, 2].map((s) => {
            const d = size(s);
            const same = s > 1 && d.width === size(1).width; // the preset keeps it to 1×: nothing to choose
            return h('button', { 'data-scale': String(s), 'aria-pressed': String(!same && size(o.scale).width === d.width), disabled: same, onclick: (e: Event) => (blur(e), set({ scale: s })) }, `${s}× · ${d.width}×${d.height}`);
          }),
        ),
        maxScale < 2 ? h('p', { class: 'muted photo-note' }, `Pictures are kept to ${maxScale}× on ${quality.level === 'low' ? 'Low' : 'Medium'} graphics.`) : null,
      ),
      h(
        'div',
        { class: 'photo-row photo-actions' },
        h('button', { class: 'primary', id: 'photo-capture', onclick: (e: Event) => (blur(e), void this.capture()) }, 'Take picture (Enter)'),
        canCopyImage() ? h('button', { id: 'photo-copy', onclick: (e: Event) => (blur(e), this.copy()) }, 'Copy picture') : null,
        h('button', { id: 'photo-reset', onclick: (e: Event) => (blur(e), rig.reset()) }, `Reset view (${k('act')})`),
        h('button', { id: 'photo-hide', onclick: (e: Event) => (blur(e), this.toggleUi()) }, `Hide panel (${k('details')})`),
        h('button', { id: 'photo-leave', onclick: (e: Event) => (blur(e), this.host.leave()) }, `Leave (${k('photo')})`),
      ),
      this.status ?? h('p', {}),
    );
  }

  private captureDims(scale: number): { width: number; height: number } {
    const gl = this.host.renderer.renderer;
    return captureSize(window.innerWidth, window.innerHeight, scale, CAPTURE_MAX_SCALE[quality.level], gl.capabilities.maxTextureSize, CAPTURE_MAX_PIXELS);
  }

  private refreshVisibility(): void {
    if (this.panel) this.panel.hidden = this.uiHidden;
    if (this.hint) this.hint.classList.toggle('fade', this.uiHidden || this.hintLeft <= 0);
  }

  /** The on-screen mark sits where the captured one will: bottom right of the picture, inside any letterbox. */
  private placeMark(): void {
    const m = this.mark;
    if (!m) return;
    m.hidden = !this.options.mark;
    const H = window.innerHeight;
    const bar = this.options.letterbox ? letterboxBar(window.innerWidth, H) : 0;
    m.style.fontSize = `${MARK.size * H}px`;
    m.style.right = `${MARK.inset * H}px`;
    m.style.bottom = `${(bar + MARK.inset) * H}px`;
    m.style.opacity = String(MARK.alpha);
  }

  // ---------- Capture ----------

  /** Draw the picture at the chosen size, with the mark, as a PNG. */
  private render(): Promise<{ blob: Blob; name: string }> {
    const { width, height } = this.captureDims(this.options.scale);
    const px = this.host.renderer.capturePhoto(width, height);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    if (!ctx) return Promise.reject(new Error('no 2d canvas'));
    ctx.putImageData(new ImageData(px, width, height), 0, 0);
    if (this.options.mark) drawMark(ctx, width, height, this.options.letterbox ? letterboxBar(width, height) : 0);
    const name = photoFileName(this.host.stageId(), new Date());
    return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve({ blob: b, name }) : reject(new Error('PNG encoding failed'))), 'image/png'));
  }

  /** Take the picture and offer it as a download. */
  async capture(): Promise<void> {
    if (!this.open) return;
    this.say('Taking the picture…');
    try {
      const { blob, name } = await this.render();
      if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
      const url = URL.createObjectURL(blob);
      this.lastUrl = url;
      const link = h('a', { href: url, download: name, id: 'photo-download' }, `Save ${name} again`);
      link.click();
      this.captures++;
      this.status?.replaceChildren(`Saved ${name}. `, link);
    } catch (err) {
      this.say(`The picture couldn't be made (${(err as Error).message}).`);
    }
  }

  /** Put the picture on the clipboard (browsers that allow it, from a click). */
  private copy(): void {
    this.say('Copying the picture…');
    const png = this.render().then((r) => r.blob);
    navigator.clipboard
      .write([new ClipboardItem({ 'image/png': png })])
      .then(() => this.say('Picture copied. Paste it anywhere that takes images.'))
      .catch(() => this.say('This browser would not copy the picture. Take picture saves it instead.'));
  }

  private say(text: string): void {
    this.status?.replaceChildren(text);
  }
}

function blur(e: Event): void {
  (e.currentTarget as HTMLElement | null)?.blur();
}

function padButtons(): Set<number> {
  const p = pollPad();
  const out = new Set<number>();
  if (!p) return out;
  p.snap.buttons.forEach((b, i) => {
    if (b.pressed || b.value > 0.5) out.add(i);
  });
  return out;
}

/** The corner hint, in the player's own keys. */
function hintLines(): string[] {
  return [
    'Drag: orbit · Right-drag: move · Wheel: zoom',
    `${k('steer')} ${k('forward')}/${k('easeOff')}: move · ${k('rise')}/${k('dive')}: up/down`,
    `Hold ${k('burst')}: orbit and zoom with the same keys`,
    `Enter: take picture · ${k('act')}: reset · ${k('details')}: hide panel · ${k('photo')}: leave`,
    'Gamepad: sticks move and orbit · triggers zoom · A picture · B leave',
  ];
}

/** The small "Homewater" mark in the bottom-right corner of the picture. */
function drawMark(ctx: CanvasRenderingContext2D, width: number, height: number, bar: number): void {
  const size = Math.round(MARK.size * height);
  const inset = MARK.inset * height;
  ctx.save();
  ctx.font = `600 ${size}px 'Bricolage Grotesque', 'Arial Narrow', system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.globalAlpha = MARK.alpha;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = size * 0.25;
  ctx.fillStyle = '#e6efec';
  ctx.fillText(MARK.text, width - inset, height - (bar * height + inset));
  ctx.restore();
}
