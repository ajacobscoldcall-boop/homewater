import { expect, test } from '@playwright/test';

/**
 * Cinematic camera moments: the lake's first look plays when the fry stage
 * starts, a key press ends it, it doesn't play twice for the same fish, and
 * the Readability page's "Cinematic moments" switch turns them off.
 */

const SHOTS = 'tests/smoke/screenshots';

const active = (page: import('@playwright/test').Page) => page.evaluate(() => (window.__hw!.app.renderer.cinematics.active as string | null) ?? null);

test('a cinematic moment plays once, a key skips it, and the setting turns it off', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./?debug=1');
  await page.click('#btn-new');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await page.evaluate(() => (window.__hw!.app as unknown as { debugJump(i: number): void }).debugJump(1));
  await page.click('#btn-play');
  await expect.poll(() => active(page)).toBe('lakeFirstLook');
  await expect(page.locator('#cinema-bars')).toBeAttached();
  await page.screenshot({ path: `${SHOTS}/30-cinematic.png` });
  // Any key ends it (a short blend back).
  await page.keyboard.press('KeyK');
  await expect.poll(() => active(page), { timeout: 3000 }).toBeNull();

  // Not again for the same fish: back to the lake start.
  await page.evaluate(() => (window.__hw!.app as unknown as { debugJump(i: number): void }).debugJump(1));
  await page.click('#btn-play');
  await page.waitForTimeout(400);
  expect(await active(page)).toBeNull();

  // Turned off in Readability, the smolt run's shot doesn't play.
  await page.keyboard.press('Escape');
  await page.click('#btn-access');
  await page.click('[data-opt="cinematics:off"]');
  await page.click('#btn-access-back');
  await page.evaluate(() => (window.__hw!.app as unknown as { debugJump(i: number): void }).debugJump(2));
  await page.click('#btn-play');
  await page.waitForTimeout(500);
  expect(await active(page)).toBeNull();
  expect(errors).toEqual([]);
});
