import { describe, expect, it } from 'vitest';
import { nearestInDirection, type Box } from '../../src/ui/menuNav';

const box = (left: number, top: number, w = 100, hgt = 40): Box => ({ left, top, right: left + w, bottom: top + hgt });

describe('menu navigation', () => {
  // A vertical menu with a pair of buttons at the bottom, like the title screen.
  const menu = [box(0, 0, 300), box(0, 50, 300), box(0, 100, 300), box(0, 150, 145), box(155, 150, 145)];

  it('moves straight down and up a vertical list', () => {
    expect(nearestInDirection(menu[0]!, menu, 'down')).toBe(1);
    expect(nearestInDirection(menu[2]!, menu, 'up')).toBe(1);
    expect(nearestInDirection(menu[0]!, menu, 'up')).toBe(-1);
  });

  it('moves across a row and stops at its ends', () => {
    expect(nearestInDirection(menu[3]!, menu, 'right')).toBe(4);
    expect(nearestInDirection(menu[4]!, menu, 'left')).toBe(3);
    expect(nearestInDirection(menu[4]!, menu, 'right')).toBe(-1);
  });

  it('prefers the control straight below over a nearer diagonal one', () => {
    const from = box(0, 0);
    const boxes = [box(400, 50), box(0, 120)];
    expect(nearestInDirection(from, boxes, 'down')).toBe(1);
  });

  it('ignores controls on the same line when moving down', () => {
    const from = box(0, 0);
    expect(nearestInDirection(from, [box(120, 2), box(0, 60)], 'down')).toBe(1);
  });
});
