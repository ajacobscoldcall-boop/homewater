/** Keyboard and mouse to Intent. Mouse steering uses pointer lock on the canvas. */
import { NO_INTENT, type Intent } from '../sim/types';

export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  locked = false;
  /** Called for one-shot UI keys (V, H, Esc). */
  onKey: (code: string) => void = () => undefined;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (['Space', 'ShiftLeft', 'ShiftRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyC', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.onKey(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseX += e.movementX;
      this.mouseY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
  }

  requestLock(): void {
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      r?.catch?.(() => undefined);
    } catch {
      // Pointer lock is optional; keyboard steering still works.
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Intent for one simulation step. Edge flags and mouse deltas are consumed. */
  consume(): Intent {
    const k = (c: string) => this.down.has(c);
    const i: Intent = {
      ...NO_INTENT,
      forward: k('KeyW') || k('ArrowUp') ? 1 : 0,
      hold: k('KeyS') || k('ArrowDown'),
      turn: (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0),
      mouseX: this.mouseX,
      mouseY: this.mouseY,
      rise: k('Space'),
      dive: k('KeyC') || k('ControlLeft'),
      burst: k('ShiftLeft') || k('ShiftRight'),
      action: k('KeyE'),
      actionPressed: this.pressed.has('KeyE'),
      risePressed: this.pressed.has('Space'),
    };
    this.mouseX = 0;
    this.mouseY = 0;
    this.pressed.clear();
    return i;
  }

  clear(): void {
    this.down.clear();
    this.pressed.clear();
    this.mouseX = this.mouseY = 0;
  }
}
