import { expect, test, type Page } from '@playwright/test';

/**
 * Lineage depth: the drawn family tree, records and score after two
 * generations, the Lineages page, and the extinction screen of a Wild line.
 */

const SHOTS = 'tests/smoke/screenshots';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Play the current life to the spawn through the debug handle and wait for the offspring choice. */
async function playLife(page: Page): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await page.click('#btn-play');
    await page.evaluate(() => window.__hw?.completeStage());
  }
  await expect(page.locator('[data-offspring="0"]')).toBeVisible({ timeout: 15_000 });
}

test('two generations: the family tree, records and score render', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.click('#btn-new');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await playLife(page);
  await page.click('[data-offspring="1"]');
  await page.click('#btn-accept-name');
  await playLife(page);

  const tree = page.locator('#family-tree');
  await expect(tree.locator('li.gen')).toHaveCount(2);
  await expect(tree.locator('li.gen.spawned')).toHaveCount(2);
  // The first generation shows its unchosen offspring faintly, and the chosen one.
  await expect(tree.locator('li[data-gen="1"] .kid')).toHaveCount(3);
  await expect(page.locator('#lineage-score')).toContainText('Lineage score');
  await expect(page.locator('#records')).toContainText('2 generations');
  // The river's run: warm-up runs before the line, then one bar per generation.
  await expect(page.locator('#run-chart .run-bar')).toHaveCount(5);
  await expect(page.locator('#run-chart .run-bar.now')).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.screenshot({ path: `${SHOTS}/20-recap-lineage.png` });
  await page.setViewportSize({ width: 1280, height: 720 });

  // The Lineages page from the title screen.
  await page.evaluate(async () => {
    await window.__hw?.app.save();
  });
  await page.reload();
  await page.click('#btn-lineages');
  await expect(page.locator('#lineages')).toContainText('Hall of records');
  await expect(page.locator('#lineages [data-lineage]')).toHaveCount(1);
  await page.screenshot({ path: `${SHOTS}/21-lineages.png` });
  await page.click('[data-lineage="0"]');
  await expect(page.locator('#trait-chart svg')).toHaveCount(7);
  await expect(page.locator('#family-tree li.gen')).toHaveCount(2);
  // Nothing on the page is wider than the window.
  expect(await page.evaluate(() => document.getElementById('lineages')!.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page.screenshot({ path: `${SHOTS}/23-lineage-detail.png` });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.click('text=All lineages');
  await page.click('#btn-lineages-back');
  await expect(page.locator('#btn-continue')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a Wild line dies out: the extinction screen, then a stray from this river', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.click('#btn-new');
  await page.click('text=Wild');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  // One generation spawns, so the line has a history to show.
  await playLife(page);
  await page.click('[data-offspring="0"]');
  await page.click('#btn-accept-name');
  // Then the whole brood dies: the fish and its three siblings on Wild.
  // Each death lands in the same tick as Play, before a frame runs, so every sibling dies at the same
  // checkpoint time: each death must still be handled (it once was not, and the test hung in CI).
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      (document.getElementById('btn-play') as HTMLButtonElement).click();
      window.__hw?.app.world?.die('bear');
      window.__hw?.step(0);
    });
    if (i < 3) await page.click('#btn-accept-name');
  }
  const end = page.locator('#extinction');
  await expect(end).toBeVisible();
  await expect(end).toContainText('line ends');
  await expect(end.locator('#trait-chart svg')).toHaveCount(7);
  await expect(end.locator('#family-tree li.gen')).toHaveCount(2);
  await expect(end.locator('#family-tree li.gen.died')).toHaveCount(1);
  await expect(end.locator('#family-tree li[data-gen="2"] .mark')).toHaveCount(3);
  await expect(end.locator('#years li')).toHaveCount(2);
  await page.setViewportSize({ width: 1280, height: 2200 });
  await page.screenshot({ path: `${SHOTS}/22-extinction.png` });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.click('#btn-stray-line');
  await page.click('#btn-accept-name');
  await expect(page.locator('#btn-play')).toBeVisible();
  const fish = await page.evaluate(() => {
    const l = window.__hw?.app.lineage;
    return l ? { generation: l.current.generation, isStray: l.current.isStray, ancestor: l.ancestor?.name ?? null } : null;
  });
  expect(fish?.generation).toBe(1);
  expect(fish?.isStray).toBe(true);
  expect(fish?.ancestor).toBeTruthy();
  // The dead line is kept for the Lineages page.
  const archived = await page.evaluate(() => window.__hw?.app.archive.map((l) => l.extinct));
  expect(archived).toEqual([true]);
  expect(errors).toEqual([]);
});
