import { expect, test, type Page } from '@playwright/test';

/** Graphics presets: chosen in Settings from the title screen and the pause menu, applied, and kept across a reload. */

const graphics = (page: Page) => page.evaluate(() => window.__hw?.app.graphics.describe() ?? '');

test('graphics preset: switch it, see it applied, and it persists across a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./?debug=1');
  await page.click('#btn-settings');
  await page.click('#tab-graphics');
  // Auto is the default.
  await expect(page.locator('[data-quality="auto"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await graphics(page)).toMatch(/^Auto: /);

  // Title screen: pick Low.
  await page.click('[data-quality="low"]');
  await expect(page.locator('[data-quality="low"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-quality="auto"]')).toHaveAttribute('aria-pressed', 'false');
  expect(await graphics(page)).toBe('Low (80% resolution)');

  // Play a moment at Low; the debug panel names the level.
  await page.click('#btn-settings-back');
  await page.click('#btn-new');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await page.click('#btn-play');
  await page.evaluate(() => window.__hw?.step(60));
  await expect(page.locator('#dbg-stats')).toContainText('graphics Low');
  const ratio = await page.evaluate(() => window.__hw?.app.renderer.renderer.getPixelRatio() ?? 0);
  expect(ratio).toBeLessThan(1);

  // Pause menu: switch to High.
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen')).toContainText('Paused');
  await page.click('#btn-pause-settings');
  await page.click('#tab-graphics');
  await page.click('[data-quality="high"]');
  await expect(page.locator('[data-quality="high"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await graphics(page)).toBe('High');
  // High has antialiasing; this page loaded at Low without it, so the menu says when it applies.
  await expect(page.locator('[data-quality-note]')).toContainText('next time the game loads');

  // Reload: High is still chosen, and antialiasing is now on.
  await page.reload();
  await page.click('#btn-settings');
  await page.click('#tab-graphics');
  await expect(page.locator('[data-quality="high"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await graphics(page)).toBe('High');
  expect(await page.evaluate(() => window.__hw?.app.renderer.renderer.getContext().getContextAttributes()?.antialias)).toBe(true);
  await expect(page.locator('[data-quality-note]')).toHaveText('');

  expect(errors).toEqual([]);
});
