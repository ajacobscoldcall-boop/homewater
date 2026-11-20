import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * The opt-in play log: off by default, switched on from the title's Play log
 * page, records a death and a sibling, and exports a file from the pause menu.
 */

const SHOTS = 'tests/smoke/screenshots';

test('play log: off by default, records a life when on, exports a file', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto('./');
  await page.click('#btn-playlog');
  await expect(page.locator('#btn-playlog-off')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#playlog-count')).toContainText('No lives logged yet');
  await expect(page.locator('#btn-playlog-export')).toBeDisabled();
  await page.click('#btn-playlog-on');
  await expect(page.locator('#btn-playlog-on')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${SHOTS}/playlog-panel.png` });
  await page.click('#btn-playlog-back');

  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await page.click('#btn-play');
  const before = requests.length;
  // An alevin that never reacts dies; a sibling carries on and finishes the egg stage.
  await page.evaluate(() => window.__hw?.step(60 * 90));
  await expect(page.locator('#screen')).toContainText('A sibling carries on');
  await page.click('#btn-accept-name');
  await page.click('#btn-play');
  await page.evaluate(() => window.__hw?.step(120));
  await page.evaluate(() => window.__hw?.completeStage());
  await page.click('#btn-play');
  await page.evaluate(() => window.__hw?.step(120));

  await page.keyboard.press('Escape');
  await expect(page.locator('#screen')).toContainText('Paused');
  await page.click('#btn-playlog');
  await expect(page.locator('#playlog-count')).toContainText('1 life logged (3 stage attempts)');
  const download = page.waitForEvent('download');
  await page.click('#btn-playlog-export');
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^homewater-playlog-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  const data = JSON.parse(readFileSync((await file.path()) as string, 'utf8')) as {
    kind: string;
    lives: { difficulty: string; attempts: { stage: string; outcome: string; deathCause: string | null; trace: unknown[]; settings: { graphics: string } }[] }[];
  };
  expect(data.kind).toBe('homewater-playlog');
  const [life] = data.lives;
  expect(life?.difficulty).toBe('fieldGuide');
  expect(life?.attempts.map((a) => `${a.stage}:${a.outcome}`)).toEqual(['egg:died', 'egg:completed', 'fry:unfinished']);
  expect(life?.attempts[0]?.deathCause).toBeTruthy();
  expect(life?.attempts[0]?.trace.length).toBeGreaterThan(10); // about one sample per second until it died
  expect(life?.attempts[0]?.settings.graphics).toBeTruthy();

  // Nothing went over the network while playing with the log on (the page itself loads from the preview server).
  expect(requests.slice(before).filter((u) => !u.startsWith('http://localhost') && !u.startsWith('blob:') && !u.startsWith('data:'))).toEqual([]);

  // Clear asks once more, then empties it; the setting survives a reload.
  await page.click('#btn-playlog-clear');
  await expect(page.locator('#btn-playlog-clear')).toContainText('Really');
  await page.click('#btn-playlog-clear');
  await page.click('#btn-playlog-back');
  await page.click('#btn-playlog');
  await expect(page.locator('#playlog-count')).toContainText('No lives logged yet');
  await page.reload();
  await page.click('#btn-playlog');
  await expect(page.locator('#btn-playlog-on')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});
