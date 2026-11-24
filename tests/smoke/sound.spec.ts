import { expect, test } from '@playwright/test';
import { AUDIO } from '../../src/audio/config';

/**
 * The sound in the real build: the first click starts the audio context,
 * every stage plays a few seconds of its ambience and score, and the graph
 * stays inside its node budget with no errors. Headless Chromium has no
 * speakers, but the Web Audio graph runs all the same.
 */
test('sound starts on the first click and stays in budget through a life', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  await expect(page.locator('#btn-new')).toBeVisible();
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');

  const stats = () => page.evaluate(() => window.__hw?.app.audio.stats() ?? null);
  const first = await stats();
  // Built once, on the first gesture.
  expect(first?.persistent ?? 0).toBeGreaterThan(40);

  for (const stage of ['egg', 'fry', 'smolt', 'ocean', 'return', 'spawn']) {
    await expect(page.locator('#btn-play')).toBeVisible();
    await page.click('#btn-play');
    // Real time, so the audio clock and the sprinkles run.
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.__hw?.step(30));
      await page.waitForTimeout(250);
    }
    expect((await page.evaluate(() => window.__hw?.state()))?.stage).toBe(stage);
    await page.evaluate(() => window.__hw?.completeStage());
  }
  const s = await stats();
  expect(s?.persistent).toBe(first?.persistent); // nothing added to the graph while playing
  expect(s?.peakVoices ?? 0).toBeGreaterThan(0); // sounds played
  expect(s?.peakNodes ?? Infinity).toBeLessThanOrEqual(AUDIO.budget.transient);
  expect(errors).toEqual([]);
});
