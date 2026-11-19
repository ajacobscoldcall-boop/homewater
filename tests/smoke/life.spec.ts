import { expect, test, type Page } from '@playwright/test';

/**
 * Boots the built game in a real browser, plays a whole life through the
 * debug handle, picks an offspring, and checks generation 2 starts.
 * Fails on any console error. Saves a screenshot of every stage.
 */

const SHOTS = 'tests/smoke/screenshots';

async function state(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => window.__hw?.state() ?? null);
}

test('a whole life, then the next generation', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  await expect(page.locator('#btn-new')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/00-title.png` });

  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  await page.click('#btn-setup-next');
  await expect(page.locator('#suggested-name')).toBeVisible();
  await page.click('#btn-reroll');
  await page.click('#btn-accept-name');

  const stages = ['egg', 'fry', 'smolt', 'ocean', 'return', 'spawn'];
  for (const [i, stage] of stages.entries()) {
    await expect(page.locator('#btn-play')).toBeVisible();
    await page.click('#btn-play');
    // Let the world run for a moment so the scene renders with movement.
    await page.evaluate(() => window.__hw?.step(90));
    await page.waitForTimeout(400);
    const s = await state(page);
    expect(s?.stage).toBe(stage);
    await page.screenshot({ path: `${SHOTS}/${String(i + 1).padStart(2, '0')}-${stage}.png` });
    await page.evaluate(() => window.__hw?.completeStage());
  }

  // End-of-life sequence, recap and offspring choice.
  await expect(page.locator('[data-offspring="0"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#family-tree')).toContainText('spawned');
  await page.screenshot({ path: `${SHOTS}/07-offspring.png` });
  await page.click('[data-offspring="0"]');
  await page.click('#btn-accept-name');
  await expect(page.locator('#btn-play')).toBeVisible();
  const s2 = await state(page);
  expect((s2?.fish as { generation: number }).generation).toBe(2);

  expect(errors).toEqual([]);
});

test('a death hands over to a sibling, and the save survives a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.click('#btn-new');
  await page.click('[data-preset="jack"]');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await page.click('#btn-play');
  // An alevin that never reacts dies (washed out, or exhausted if the flow stayed kind).
  await page.evaluate(() => window.__hw?.step(60 * 90));
  await expect(page.locator('#screen')).toContainText('A sibling carries on');
  await page.click('#btn-accept-name');
  await expect(page.locator('#btn-play')).toBeVisible();
  const s = await state(page);
  expect(s?.siblingsLeft).toBe(4);
  expect((s?.fish as { lockedJack: boolean }).lockedJack).toBe(true);

  // Make sure the save has finished writing before reloading.
  await page.evaluate(async () => {
    await window.__hw?.app.save();
  });
  await page.reload();
  await expect(page.locator('#btn-continue')).toBeVisible();
  await page.click('#btn-continue');
  await expect(page.locator('#btn-play')).toBeVisible();
  const r = await state(page);
  expect(r?.siblingsLeft).toBe(4);
  expect(errors).toEqual([]);
});
