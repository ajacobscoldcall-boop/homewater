import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTIONS,
  actionFor,
  bindings,
  DEFAULT_BINDINGS,
  defaultBindings,
  fillKeys,
  isReserved,
  keyName,
  parse,
  rebind,
  serialize,
  setBindings,
  stripKeys,
  unbind,
  unboundActions,
  CONTROLS_VERSION,
} from '../../src/input/bindings';
import { deadzone, PAD, readPad, type PadSnapshot } from '../../src/input/gamepad';
import { defaultAccess, parseAccess } from '../../src/ui/accessibility';
import { caption, OBJECTIVES } from '../../src/ui/text';
import { guideText } from '../../src/ui/tutorial';

afterEach(() => setBindings(defaultBindings()));

describe('default bindings', () => {
  it('give every action a key, and no key two actions', () => {
    const b = defaultBindings();
    const seen = new Map<string, string>();
    for (const a of ACTIONS) {
      expect(b[a].length, a).toBeGreaterThan(0);
      for (const c of b[a]) {
        expect(seen.get(c), `${c} bound to ${seen.get(c)} and ${a}`).toBeUndefined();
        seen.set(c, a);
      }
    }
  });

  it('match the keys the game always had', () => {
    const b = defaultBindings();
    expect(actionFor(b, 'KeyW')).toBe('forward');
    expect(actionFor(b, 'Space')).toBe('rise');
    expect(actionFor(b, 'ShiftLeft')).toBe('burst');
    expect(actionFor(b, 'KeyE')).toBe('act');
    expect(actionFor(b, 'Escape')).toBe('pause');
    expect(unboundActions(b)).toEqual([]);
  });

  it('returns a fresh copy each time', () => {
    const b = defaultBindings();
    b.forward.push('KeyQ');
    expect(DEFAULT_BINDINGS.forward).toEqual(['KeyW', 'ArrowUp']);
    expect(defaultBindings().forward).toEqual(['KeyW', 'ArrowUp']);
  });
});

describe('rebinding', () => {
  it('replaces the key in a slot without changing the input', () => {
    const b = defaultBindings();
    const r = rebind(b, 'forward', 0, 'KeyI');
    expect(r.bindings.forward).toEqual(['KeyI', 'ArrowUp']);
    expect(r.displaced).toBeNull();
    expect(b.forward).toEqual(['KeyW', 'ArrowUp']);
  });

  it('moves a key that another action had, and reports it', () => {
    const r = rebind(defaultBindings(), 'forward', 0, 'Space');
    expect(r.bindings.forward[0]).toBe('Space');
    expect(r.displaced).toBe('rise');
    expect(r.bindings.rise).toEqual([]);
    expect(actionFor(r.bindings, 'Space')).toBe('forward');
    expect(unboundActions(r.bindings)).toEqual(['rise']);
  });

  it('swapping a key between the slots of one action keeps one copy', () => {
    const r = rebind(defaultBindings(), 'forward', 1, 'KeyW');
    expect(r.bindings.forward).toEqual(['ArrowUp', 'KeyW']);
    expect(r.displaced).toBeNull();
  });

  it('adds a second key to an action with one', () => {
    const r = rebind(defaultBindings(), 'act', 1, 'KeyF');
    expect(r.bindings.act).toEqual(['KeyE', 'KeyF']);
  });

  it('refuses reserved keys', () => {
    expect(isReserved('Escape')).toBe(true);
    expect(isReserved('Tab')).toBe(true);
    expect(isReserved('F5')).toBe(true);
    expect(isReserved('KeyF')).toBe(false);
    const r = rebind(defaultBindings(), 'forward', 0, 'Escape');
    expect(r.bindings.forward).toEqual(['KeyW', 'ArrowUp']);
  });

  it('clears one slot', () => {
    expect(unbind(defaultBindings(), 'forward', 0).forward).toEqual(['ArrowUp']);
  });
});

describe('stored bindings', () => {
  it('store only what differs from the defaults, with a version', () => {
    expect(serialize(defaultBindings())).toEqual({ v: CONTROLS_VERSION, keys: {} });
    const b = rebind(defaultBindings(), 'forward', 0, 'KeyI').bindings;
    expect(serialize(b)).toEqual({ v: CONTROLS_VERSION, keys: { forward: ['KeyI', 'ArrowUp'] } });
  });

  it('round-trip through JSON', () => {
    let b = rebind(defaultBindings(), 'forward', 0, 'Space').bindings;
    b = rebind(b, 'rise', 0, 'KeyR').bindings;
    expect(parse(JSON.parse(JSON.stringify(serialize(b))))).toEqual(b);
  });

  it('fall back to the defaults for anything malformed', () => {
    expect(parse(null)).toEqual(defaultBindings());
    expect(parse('nonsense')).toEqual(defaultBindings());
    expect(parse({ v: 1, keys: { forward: 'KeyW' } })).toEqual(defaultBindings());
    expect(parse({ v: 1, keys: { forward: [7, 'Escape', 'KeyI'] } }).forward).toEqual(['KeyI']);
    expect(parse({ v: 1, keys: { notAnAction: ['KeyI'] } })).toEqual(defaultBindings());
  });

  it('never leave one key on two actions, even if the stored data does', () => {
    const b = parse({ v: 1, keys: { forward: ['KeyX'], act: ['KeyX'] } });
    const holders = ACTIONS.filter((a) => b[a].includes('KeyX'));
    expect(holders).toHaveLength(1);
  });
});

describe('key names in text', () => {
  it('names keys plainly', () => {
    expect(keyName('KeyW')).toBe('W');
    expect(keyName('Digit3')).toBe('3');
    expect(keyName('ShiftLeft')).toBe('Shift');
    expect(keyName('Space')).toBe('Space');
    expect(keyName('ArrowUp')).toBe('↑');
    expect(keyName('Numpad8')).toBe('Num 8');
  });

  it('fills placeholders with the current keys', () => {
    const b = defaultBindings();
    expect(fillKeys('Burst {key:burst} now.', b)).toBe('Burst (Shift) now.');
    expect(fillKeys('Swim up {hold:rise}.', b)).toBe('Swim up (hold Space).');
    expect(fillKeys('Turn {key:steer}.', b)).toBe('Turn (A/D or the mouse).');
    const r = rebind(b, 'burst', 0, 'KeyF').bindings;
    expect(fillKeys('Burst {key:burst} now.', r)).toBe('Burst (F) now.');
  });

  it('leaves placeholders out of narration', () => {
    expect(stripKeys('Charge her with a burst {key:burst}.')).toBe('Charge her with a burst.');
    expect(stripKeys('Swim up {hold:rise} and out.')).toBe('Swim up and out.');
  });

  it('captions, objectives and guide steps show the rebound key', () => {
    expect(caption('spawn.rivalFemale')).toBe('Another female wants this spot. Charge her with a burst (Shift).');
    setBindings(rebind(bindings(), 'burst', 0, 'KeyF').bindings);
    expect(caption('spawn.rivalFemale')).toBe('Another female wants this spot. Charge her with a burst (F).');
    setBindings(rebind(bindings(), 'dive', 0, 'KeyX').bindings);
    expect(OBJECTIVES.egg).toContain('Stay low (X)');
    expect(guideText('Dive deep {key:dive}.')).toBe('Dive deep (X).');
    // Ordinary {vars} still work alongside key placeholders.
    expect(caption('ocean.revealFemale', { years: 3 })).toContain('3');
  });

  it('every key placeholder names a real action, and no caption names a key directly', () => {
    const captions = (JSON.parse(readFileSync('src/data/captions.json', 'utf8')) as { captions: Record<string, string> }).captions;
    const sources = [...Object.values(captions), readFileSync('src/ui/tutorial.ts', 'utf8'), readFileSync('src/ui/text.ts', 'utf8')];
    for (const text of sources) {
      for (const m of text.matchAll(/\{(key|hold):(\w+)\}/g)) expect([...ACTIONS, 'steer']).toContain(m[2]);
    }
    for (const [id, text] of Object.entries(captions)) {
      expect(text, id).not.toMatch(/\b(Shift|Space|press [A-Z]|hold [A-Z])\b|\([A-Z]\)/);
    }
  });
});

describe('gamepad', () => {
  const pad = (over: { buttons?: Record<number, number>; axes?: number[] } = {}): PadSnapshot => ({
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (over.buttons?.[i] ?? 0) > 0.5, value: over.buttons?.[i] ?? 0 })),
    axes: over.axes ?? [0, 0, 0, 0],
  });

  it('does nothing at rest', () => {
    const s = readPad(pad());
    expect(s.turn).toBe(0);
    expect(s.forward).toBe(0);
    expect(s.held.size).toBe(0);
  });

  it('steers with the left stick, past a dead zone', () => {
    expect(readPad(pad({ axes: [0.1, 0] })).turn).toBe(0);
    expect(readPad(pad({ axes: [1, 0] })).turn).toBe(1);
    expect(readPad(pad({ axes: [-0.6, 0] })).turn).toBeCloseTo(deadzone(-0.6));
    expect(readPad(pad({ buttons: { [PAD.left]: 1 } })).turn).toBe(-1);
  });

  it('swims with the right trigger, analog', () => {
    const s = readPad(pad({ buttons: { [PAD.rt]: 0.6 } }));
    expect(s.forward).toBeCloseTo(0.6);
    expect(s.held.has('forward')).toBe(true);
  });

  it('maps the face buttons, bumpers and stick to actions', () => {
    expect([...readPad(pad({ buttons: { [PAD.a]: 1 } })).held]).toEqual(['burst']);
    expect([...readPad(pad({ buttons: { [PAD.x]: 1 } })).held]).toEqual(['act']);
    expect([...readPad(pad({ buttons: { [PAD.rb]: 1 } })).held]).toEqual(['rise']);
    expect([...readPad(pad({ buttons: { [PAD.lb]: 1 } })).held]).toEqual(['dive']);
    expect([...readPad(pad({ axes: [0, -0.9] })).held]).toEqual(['rise']);
    expect([...readPad(pad({ buttons: { [PAD.start]: 1 } })).held]).toEqual(['pause']);
  });
});

describe('readability options', () => {
  it('default to the standard look and full speed', () => {
    const d = defaultAccess();
    expect(d.captionSize).toBe('normal');
    expect(d.gameSpeed).toBe(1);
    expect(d.forwardMode).toBe('hold');
  });

  it('reject malformed stored values', () => {
    const o = parseAccess({ captionSize: 'huge', captionBg: 5, gameSpeed: 0.1, forwardMode: 'sometimes', highContrast: 'yes' });
    expect(o.captionSize).toBe('normal');
    expect(o.captionBg).toBe(defaultAccess().captionBg);
    expect(o.gameSpeed).toBe(1);
    expect(o.forwardMode).toBe('hold');
    expect(o.highContrast).toBe(false);
    const ok = parseAccess({ captionSize: 'largest', captionBg: 1, gameSpeed: 0.75, burstMode: 'toggle', colourBlind: true });
    expect(ok).toMatchObject({ captionSize: 'largest', captionBg: 1, gameSpeed: 0.75, burstMode: 'toggle', colourBlind: true });
  });
});
