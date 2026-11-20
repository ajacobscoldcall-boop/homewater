/**
 * Per-frame HUD writes without needless DOM work: elements are looked up once,
 * and text, styles and children are written only when they change. Threat
 * markers are kept in a pool and updated in place instead of being rebuilt each
 * frame (which also lets their CSS pulse run, instead of restarting every frame).
 *
 * The markup is the same as App built before: `.threat[.hot][.opening]` with
 * either an `.arrow` or a `.ring`, then a `span` label; `.bar[.low]` rows with
 * `i > b` meters.
 */
import { $, h } from './dom';
import { VITALS } from './hudConfig';

/** One ring of the always-visible minimal HUD (vitals.ts). */
export interface VitalRing {
  name: string;
  value: number;
  level: 'ok' | 'low' | 'critical';
}

const SVG = 'http://www.w3.org/2000/svg';

export interface ThreatMarker {
  x: number;
  y: number;
  label: string;
  hot: boolean;
  opening?: boolean;
  off: boolean;
  angle: number;
}

interface MarkerEl {
  el: HTMLElement;
  icon: HTMLElement;
  label: HTMLElement;
  cls: string;
  left: string;
  top: string;
  off: boolean | null;
  rot: string;
  text: string;
}

export class HudView {
  private els = new Map<string, HTMLElement>();
  private last = new Map<string, string>();
  private markers: MarkerEl[] = [];
  private shown = 0;
  private barKey = '';
  private barEls: { row: HTMLElement; fill: HTMLElement; cls: string; width: string }[] = [];
  private ringKey = '';
  private ringEls: { row: HTMLElement; arc: SVGCircleElement; cls: string; dash: string }[] = [];

  /** The element with this id, looked up once. */
  el(id: string): HTMLElement {
    let el = this.els.get(id);
    if (!el || !el.isConnected) {
      el = $(id);
      this.els.set(id, el);
    }
    return el;
  }

  /** True when `value` differs from what was last written under `key` (and remembers it). */
  private changed(key: string, value: string): boolean {
    if (this.last.get(key) === value) return false;
    this.last.set(key, value);
    return true;
  }

  text(id: string, value: string): void {
    if (this.changed(`text:${id}`, value)) this.el(id).textContent = value;
  }

  style(id: string, prop: 'opacity', value: string): void {
    if (this.changed(`style:${id}:${prop}`, value)) this.el(id).style[prop] = value;
  }

  hidden(id: string, hidden: boolean): void {
    if (this.changed(`hidden:${id}`, String(hidden))) this.el(id).hidden = hidden;
  }

  /** Replace an element's children only when `key` (what they show) changes. */
  children(id: string, key: string, build: () => (Node | string)[]): void {
    if (this.changed(`children:${id}`, key)) this.el(id).replaceChildren(...build());
  }

  /** Meter rows: rebuilt when the set of rows changes, otherwise only widths and the low flag. */
  bars(id: string, rows: { name: string; value: number; low: boolean }[]): void {
    const key = rows.map((r) => r.name).join('|');
    if (key !== this.barKey || this.barEls.length !== rows.length) {
      this.barKey = key;
      this.barEls = rows.map((r) => {
        const fill = h('b', { style: 'width:0%' });
        const row = h('div', { class: 'bar' }, r.name, h('i', {}, fill));
        return { row, fill, cls: 'bar', width: '0%' };
      });
      this.el(id).replaceChildren(...this.barEls.map((b) => b.row));
    }
    rows.forEach((r, i) => {
      const b = this.barEls[i]!;
      const cls = `bar${r.low ? ' low' : ''}`;
      if (cls !== b.cls) b.row.className = b.cls = cls;
      const width = `${Math.round(Math.max(0, Math.min(1, r.value)) * 100)}%`;
      if (width !== b.width) b.fill.style.width = b.width = width;
    });
  }

  /** The minimal HUD's rings: rebuilt when the set of rings changes, otherwise only the arc and the level class. */
  rings(id: string, rows: readonly VitalRing[]): void {
    const { r, stroke } = VITALS.ring;
    const c = 2 * Math.PI * r;
    const key = rows.map((x) => x.name).join('|');
    if (key !== this.ringKey || this.ringEls.length !== rows.length) {
      this.ringKey = key;
      this.ringEls = rows.map((x) => {
        const svg = document.createElementNS(SVG, 'svg');
        const size = 2 * (r + stroke);
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.setAttribute('aria-hidden', 'true');
        const track = document.createElementNS(SVG, 'circle');
        const arc = document.createElementNS(SVG, 'circle');
        for (const el of [track, arc]) {
          el.setAttribute('cx', String(size / 2));
          el.setAttribute('cy', String(size / 2));
          el.setAttribute('r', String(r));
          el.setAttribute('stroke-width', String(stroke));
        }
        track.setAttribute('class', 'track');
        arc.setAttribute('class', 'arc');
        arc.setAttribute('stroke-dasharray', `${c.toFixed(2)} ${c.toFixed(2)}`);
        arc.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
        svg.append(track, arc);
        const row = h('div', { class: 'vital', 'data-vital': x.name }, svg, h('span', {}, x.name));
        return { row, arc, cls: 'vital', dash: '' };
      });
      this.el(id).replaceChildren(...this.ringEls.map((x) => x.row));
    }
    rows.forEach((x, i) => {
      const e = this.ringEls[i]!;
      const cls = `vital${x.level === 'ok' ? '' : ` ${x.level}`}`;
      if (cls !== e.cls) e.row.className = e.cls = cls;
      const v = Math.round(Math.max(0, Math.min(1, x.value)) * 100) / 100;
      const dash = (c * (1 - v)).toFixed(2);
      if (dash !== e.dash) {
        e.arc.setAttribute('stroke-dashoffset', dash);
        e.dash = dash;
        e.row.setAttribute('aria-label', `${x.name} ${Math.round(v * 100)}%`);
      }
    });
  }

  /** Documentary view: a soft shadow at the screen edge toward an off-screen threat, or none. */
  edgeShadow(id: string, cue: { angle: number; strength: number } | null): void {
    const value = cue ? `${cue.angle.toFixed(2)}|${cue.strength.toFixed(2)}` : '';
    if (!this.changed(`edge:${id}`, value)) return;
    const el = this.el(id);
    if (!cue) {
      el.style.opacity = '0';
      return;
    }
    // Centre of the shadow on the edge, in the threat's direction from the middle of the screen.
    const dx = Math.cos(cue.angle);
    const dy = Math.sin(cue.angle);
    const k = 0.5 / Math.max(Math.abs(dx), Math.abs(dy), 1e-3);
    el.style.setProperty('--ex', `${((0.5 + dx * k) * 100).toFixed(1)}%`);
    el.style.setProperty('--ey', `${((0.5 + dy * k) * 100).toFixed(1)}%`);
    el.style.opacity = cue.strength.toFixed(2);
  }

  /** Threat markers, updated in place. */
  threats(id: string, items: readonly ThreatMarker[]): void {
    const layer = this.el(id);
    while (this.markers.length < items.length) {
      const icon = h('div', { class: 'ring' });
      const label = h('span', {});
      const el = h('div', { class: 'threat' }, icon, label);
      this.markers.push({ el, icon, label, cls: 'threat', left: '', top: '', off: false, rot: '', text: '' });
    }
    items.forEach((t, i) => {
      const m = this.markers[i]!;
      const cls = `threat${t.hot ? ' hot' : ''}${t.opening ? ' opening' : ''}`;
      if (cls !== m.cls) m.el.className = m.cls = cls;
      const left = `${(t.x * 100).toFixed(1)}%`;
      const top = `${(t.y * 100).toFixed(1)}%`;
      if (left !== m.left) m.el.style.left = m.left = left;
      if (top !== m.top) m.el.style.top = m.top = top;
      if (t.off !== m.off) {
        const icon = t.off ? h('div', { class: 'arrow' }) : h('div', { class: 'ring' });
        m.icon.replaceWith(icon);
        m.icon = icon;
        m.off = t.off;
        m.rot = '';
      }
      if (t.off) {
        const rot = `rotate(${(t.angle + Math.PI / 2).toFixed(2)}rad)`;
        if (rot !== m.rot) m.icon.style.transform = m.rot = rot;
      }
      if (t.label !== m.text) m.label.textContent = m.text = t.label;
      if (i >= this.shown || m.el.parentNode !== layer) layer.append(m.el);
    });
    for (let i = items.length; i < this.shown; i++) this.markers[i]?.el.remove();
    this.shown = items.length;
  }
}
