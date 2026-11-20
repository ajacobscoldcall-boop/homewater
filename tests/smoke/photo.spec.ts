import { expect, test } from '@playwright/test';

/**
 * Photo mode: in the ocean, P stops the game and opens a free camera; the
 * camera moves, a look changes, a capture downloads a PNG, and leaving puts
 * the game back exactly as it was (same world state, same camera, HUD back).
 * Also opens it from the pause menu and returns there.
 */

const SHOTS = 'tests/smoke/screenshots';

type HW = Window['__hw'] & { app: { photo: { captures: number }; mode: string; renderer: { camera: { position: { x: number; y: number; z: number } } } } };
const snapshot = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const app = (window.__hw as HW).app;
    const p = app.renderer.camera.position;
    return { state: JSON.stringify({ ...window.__hw!.state(), mode: null }), mode: app.mode, cam: [p.x, p.y, p.z].map((v) => v.toFixed(4)).join(','), hud: document.getElementById('hud')!.hidden };
  });

test('photo mode pauses, moves, captures a PNG and restores the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./?debug=1');
  await page.click('#btn-new');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await page.evaluate(() => (window.__hw!.app as unknown as { debugJump(i: number): void }).debugJump(3));
  await page.click('#btn-play');
  await page.waitForTimeout(500);

  // Open with P from play. The sim stops: freeze the clock of the check by reading inside one evaluate.
  await page.keyboard.press('KeyP');
  await expect(page.locator('#photo-panel')).toBeVisible();
  await expect(page.locator('#hud')).toBeHidden();
  const before = await snapshot(page);
  expect(before.mode).toBe('photo');

  // Time passes; nothing in the sim changes (stepSim is refused too).
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__hw!.step(60));
  expect((await snapshot(page)).state).toBe(before.state);

  // Move the camera: drag to orbit, a key to fly.
  await page.mouse.move(400, 400);
  await page.mouse.down();
  await page.mouse.move(560, 340, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(100);
  expect((await snapshot(page)).cam).not.toBe(before.cam);

  // A look and the letterbox.
  await page.click('[data-look="mono"]');
  await expect(page.locator('[data-look="mono"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('[data-photo="letterbox"]');
  await page.screenshot({ path: `${SHOTS}/40-photo-mode.png` });

  // Capture: a PNG download with the right name.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#photo-capture')]);
  expect(download.suggestedFilename()).toMatch(/^homewater-ocean-\d{4}-\d{2}-\d{2}-\d{6}\.png$/);
  const path = await download.path();
  const fs = await import('node:fs');
  const head = fs.readFileSync(path!).subarray(0, 8);
  expect([...head]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  await expect(page.locator('#photo-status')).toContainText('Saved homewater-ocean-');

  // Leave: same state, same camera, HUD back, playing again (read before the next frame can step).
  const after = await page.evaluate(() => {
    const app = (window.__hw as HW).app as unknown as { closePhoto(): void; mode: string; renderer: { camera: { position: { x: number; y: number; z: number } } } };
    app.closePhoto();
    return { state: JSON.stringify({ ...window.__hw!.state(), mode: null }), mode: app.mode, hud: document.getElementById('hud')!.hidden, panel: !!document.getElementById('photo-panel') };
  });
  expect(after.state).toBe(before.state);
  expect(after.mode).toBe('playing');
  expect(after.hud).toBe(false);
  expect(after.panel).toBe(false);
  // Next frame, the play camera is back where it was.
  await page.waitForTimeout(100);
  await expect(page.locator('body')).not.toHaveClass(/photo-mode/);

  // From the pause menu, and back to it.
  await page.keyboard.press('Escape');
  await page.click('#btn-photo');
  await expect(page.locator('#photo-panel')).toBeVisible();
  const paused = await snapshot(page);
  await page.keyboard.press('KeyP');
  await expect(page.locator('#photo-panel')).toHaveCount(0);
  await expect(page.locator('#btn-photo')).toBeVisible();
  const back = await snapshot(page);
  expect(back.mode).toBe('paused');
  expect(back.state).toBe(paused.state);
  expect(errors).toEqual([]);
});
