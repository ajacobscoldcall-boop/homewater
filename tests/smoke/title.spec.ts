import { expect, test } from '@playwright/test';

/** The title screen's How to play and About panels open and lead back. */

const SHOTS = 'tests/smoke/screenshots';

test('how to play and about panels', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  await page.click('#btn-howto');
  await expect(page.locator('#panel-howto')).toContainText('Swim forward');
  await page.screenshot({ path: `${SHOTS}/title-howto.png` });
  await page.click('#btn-info-back');
  await page.click('#btn-about');
  await expect(page.locator('#panel-about')).toContainText('Content warning');
  await expect(page.locator('#panel-about')).toContainText('three.js');
  await page.screenshot({ path: `${SHOTS}/title-about.png` });
  await page.click('#btn-info-back');
  await expect(page.locator('#btn-new')).toBeVisible();
  expect(errors).toEqual([]);
});
