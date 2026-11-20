import { expect, test, type Page } from '@playwright/test';

/**
 * Menus: the title's items, Title -> Settings (every tab) -> back, first-run content setup,
 * Pause -> Settings -> back, the dimmed pause with play messages hidden, and keyboard and
 * gamepad navigation (arrows / D-pad move focus, Enter / A choose, Esc / B go back).
 */

const SHOTS = 'tests/smoke/screenshots';
const TABS: [string, string][] = [
  ['#tab-gameplay', '#gameplay-panel'],
  ['#btn-controls', '#controls-panel'],
  ['#btn-access', '#access-panel'],
  ['#tab-graphics', '#graphics-panel'],
  ['#tab-audio', '#audio-panel'],
  ['#tab-content', '#content-panel'],
  ['#btn-playlog', '#playlog-panel'],
];

const focused = (page: Page) => page.evaluate(() => document.activeElement?.id ?? '');

test('title, settings tabs, first-run content and pause, by mouse, keys and gamepad', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  // A fake standard gamepad the test can press (window.__pad.buttons[i] = true).
  await page.addInitScript(() => {
    const pad = { buttons: Array.from({ length: 17 }, () => false), axes: [0, 0, 0, 0] };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [{ id: 'Test pad', connected: true, mapping: 'standard', axes: pad.axes, buttons: pad.buttons.map((p) => ({ pressed: p, value: p ? 1 : 0 })) }],
    });
  });
  const pad = async (i: number) => {
    await page.evaluate((b) => ((window as unknown as { __pad: { buttons: boolean[] } }).__pad.buttons[b] = true), i);
    await page.waitForTimeout(120);
    await page.evaluate((b) => ((window as unknown as { __pad: { buttons: boolean[] } }).__pad.buttons[b] = false), i);
    await page.waitForTimeout(120);
  };

  await page.goto('./?quality=low');
  // The title: no save, so New lineage leads; no content warning or settings on the title itself.
  const items = await page.locator('#title .menu-item').evaluateAll((els) => els.map((e) => e.id));
  expect(items).toEqual(['btn-new', 'btn-lineages', 'btn-journal', 'btn-settings', 'btn-about', 'btn-howto']);
  await expect(page.locator('#title')).not.toContainText('Content warning');
  await expect(page.locator('#title [data-quality]')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/menus-title.png` });

  // Keys: the first arrow focuses the first choice; arrows move; Enter opens Settings.
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toBe('btn-new');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toBe('btn-settings');
  await page.keyboard.press('Enter');
  await expect(page.locator('#settings')).toBeVisible();
  expect(await focused(page)).toBe('tab-gameplay');
  // Right arrow walks the tab bar; Enter opens the tab and focus stays on it.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#controls-panel')).toBeVisible();
  expect(await focused(page)).toBe('btn-controls');
  // Changing an option redraws the page and keeps focus on the same control.
  await page.click('#btn-access');
  await page.keyboard.press('ArrowDown');
  const opt = await page.evaluate(() => document.activeElement?.getAttribute('data-opt') ?? document.activeElement?.id);
  expect(opt).toBeTruthy();

  // Every tab opens its page, and Esc goes back one level, to the title.
  for (const [tab, panel] of TABS) {
    await page.click(tab);
    await expect(page.locator(panel)).toBeVisible();
    await expect(page.locator(tab)).toHaveAttribute('aria-selected', 'true');
    await page.screenshot({ path: `${SHOTS}/menus-settings-${panel.slice(1).replace('-panel', '')}.png`, fullPage: true });
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#title')).toBeVisible();
  // Back by button from a tab too.
  await page.click('#btn-settings');
  await expect(page.locator('#playlog-panel')).toBeVisible(); // reopens on the last tab used
  await page.click('#tab-content');
  await expect(page.locator('#content-panel')).toContainText('Content warning');
  await page.click('#btn-settings-back');
  await expect(page.locator('#title')).toBeVisible();

  // Lineage files moved to Lineages and records.
  await page.click('#btn-lineages');
  await expect(page.locator('#btn-import')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#title')).toBeVisible();

  // First run: the content warning and gore choice come before the first life, once.
  await page.click('#btn-new');
  await expect(page.locator('#first-run-content')).toContainText('Content warning');
  await page.click('#first-run-content [data-gore="documentary"]');
  await expect(page.locator('#first-run-content [data-gore="documentary"]')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: `${SHOTS}/menus-first-run.png`, fullPage: true });
  expect(await page.evaluate(() => window.__hw?.app.renderer.gore.mode)).toBe('documentary');
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  await page.click('#btn-play');
  await page.evaluate(() => window.__hw?.step(60));
  await expect(page.locator('#hud-captions .caption').first()).toBeVisible();

  // Pause: the menu over a dimmed scene, captions hidden.
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  const pauseItems = await page.locator('#pause .menu-item').evaluateAll((els) => els.map((e) => e.id));
  expect(pauseItems).toEqual(['btn-resume', 'btn-pause-settings', 'btn-pause-journal', 'btn-photo', 'btn-quit']);
  await expect(page.locator('body')).toHaveClass(/paused/);
  await expect(page.locator('#hud-captions')).toBeHidden();
  await page.screenshot({ path: `${SHOTS}/menus-pause.png` });

  // Pause -> Settings -> back (Esc), then Esc again resumes.
  await page.click('#btn-pause-settings');
  await expect(page.locator('#settings')).toBeVisible();
  await page.click('#tab-content');
  await expect(page.locator('#content-panel [data-gore="documentary"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await page.click('#btn-pause-settings');
  await page.click('#btn-settings-back');
  await expect(page.locator('#pause')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen')).toBeEmpty();
  expect(await page.evaluate(() => window.__hw?.app.mode)).toBe('playing');
  await expect(page.locator('body')).not.toHaveClass(/paused/);

  // Gamepad: Start pauses, D-pad down focuses and moves, A chooses, B goes back.
  await pad(9); // Start
  await expect(page.locator('#pause')).toBeVisible();
  await pad(13); // D-pad down: focus Resume
  expect(await focused(page)).toBe('btn-resume');
  await pad(13);
  expect(await focused(page)).toBe('btn-pause-settings');
  await pad(0); // A
  await expect(page.locator('#settings')).toBeVisible();
  await pad(1); // B
  await expect(page.locator('#pause')).toBeVisible();
  await pad(1); // B on the pause menu resumes
  await expect(page.locator('#screen')).toBeEmpty();

  // The content choice is not asked again.
  await page.evaluate(async () => window.__hw?.app.save());
  await page.reload();
  await expect(page.locator('#btn-continue')).toBeVisible();
  await page.click('#btn-new');
  await expect(page.locator('#first-run-content')).toHaveCount(0);
  expect(errors).toEqual([]);
});
