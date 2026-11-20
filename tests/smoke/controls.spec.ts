import { expect, test } from '@playwright/test';

/**
 * Controls and readability: rebind forward, check it survives a reload and
 * drives the fish, and that the HUD hint names the new key. Saves
 * screenshots of the Controls and Readability pages and of large captions.
 */

const SHOTS = 'tests/smoke/screenshots';

test('rebinding forward survives a reload and shows in the HUD hint', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  await page.click('#btn-settings');
  await page.click('#btn-controls');
  await expect(page.locator('#controls-panel')).toBeVisible();
  const forward = page.locator('[data-bind="forward:0"]');
  await expect(forward).toHaveText('W');
  await forward.click();
  await expect(forward).toHaveText('Press a key…');
  await page.keyboard.press('KeyI');
  await expect(forward).toHaveText('I');

  // Taking a key from another action moves it, and says so.
  await page.click('[data-bind="act:1"]');
  await page.keyboard.press('KeyV');
  await expect(page.locator('#bind-message')).toContainText('moved from Switch view');
  await expect(page.locator('#bind-missing')).toContainText('Switch view');
  await page.screenshot({ path: `${SHOTS}/20-controls.png`, fullPage: true });
  // Put V back on the view action.
  await page.click('[data-bind="view:0"]');
  await page.keyboard.press('KeyV');
  await expect(page.locator('#bind-missing')).toHaveCount(0);

  await page.reload();
  await page.click('#btn-settings');
  await page.click('#btn-controls');
  await expect(page.locator('[data-bind="forward:0"]')).toHaveText('I');
  await expect(page.locator('[data-bind="view:0"]')).toHaveText('V');
  // Esc leaves the page.
  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-new')).toBeVisible();

  // Large captions, high contrast and colour-blind-safe markers.
  await page.click('#btn-settings');
  await page.click('#btn-access');
  await page.click('[data-opt="captionSize:largest"]');
  await page.click('[data-opt="highContrast:on"]');
  await page.click('[data-opt="colourBlind:on"]');
  await page.click('[data-opt="gameSpeed:0.75"]');
  await expect(page.locator('html')).toHaveAttribute('data-threats', 'contrast');
  await page.screenshot({ path: `${SHOTS}/21-readability.png`, fullPage: true });
  await page.click('#btn-access-back');

  await page.click('#btn-new');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await page.click('#btn-play');
  await page.evaluate(() => window.__hw?.step(30));
  await expect(page.locator('#hud-hint')).toContainText('I swim');
  const size = await page.locator('#hud-captions .caption').first().evaluate((el) => getComputedStyle(el).fontSize);
  expect(size).toBe('25px');
  await page.screenshot({ path: `${SHOTS}/22-large-captions.png` });

  // The new key drives the fish, and the old one does nothing.
  const forwardWith = async (key: string) => {
    await page.keyboard.down(key);
    const f = await page.evaluate(() => window.__hw?.app.input.consume().forward ?? -1);
    await page.keyboard.up(key);
    return f;
  };
  expect(await forwardWith('KeyI')).toBe(1);
  expect(await forwardWith('KeyW')).toBe(0);

  // The pause menu lists the player's keys.
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen')).toContainText('I swim');
  await page.click('#btn-pause-settings');
  await page.click('#btn-controls');
  await page.click('#btn-bind-reset');
  await expect(page.locator('[data-bind="forward:0"]')).toHaveText('W');
  expect(errors).toEqual([]);
});
