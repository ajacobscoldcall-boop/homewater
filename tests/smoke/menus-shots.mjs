// The menus: title (with a save), Settings tabs, first-run setup and the pause menu over play (review shots).
// Usage: start `npx vite preview --port 4196` after a build, then node tests/smoke/menus-shots.mjs [outDir]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/menus';
const BASE = `http://localhost:${process.env.PW_PORT ?? 4196}/?quality=${process.env.QUALITY ?? 'high'}`;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false })));
const shot = (name) => page.screenshot({ path: `${OUT}/menus-${name}.png` });

await page.goto(BASE);
await page.click('#btn-new');
await shot('first-run');
await page.click('#btn-setup-next');
await page.click('#btn-accept-name');
// The pause menu over the ocean, with captions, toasts and the guide hidden.
await page.evaluate(() => window.__hw.app.debugJump(3));
await page.click('#btn-play');
await page.evaluate(() => window.__hw.step(240));
await page.waitForTimeout(400);
await shot('playing');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('ArrowDown'); // keyboard focus on Resume
await shot('pause');
await page.click('#btn-pause-settings');
for (const tab of ['tab-gameplay', 'btn-controls', 'btn-access', 'tab-graphics', 'tab-audio', 'tab-content', 'btn-playlog']) {
  await page.click(`#${tab}`);
  await page.waitForTimeout(100);
  await shot(`settings-${tab.replace(/^(tab|btn)-/, '')}`);
}
await page.keyboard.press('Escape');
await page.click('#btn-quit');
await page.waitForSelector('#btn-continue');
await page.keyboard.press('ArrowDown');
await shot('title');
await page.click('#btn-lineages');
await shot('lineages');
await browser.close();
