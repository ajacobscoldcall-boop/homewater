// Screenshots of the changing river mode: the River choice on the setup page, the change lines on stage cards,
// the run chart's marks and the "what has changed" line on the recap and the Lineages page.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4214` after a build, then
//   node tests/smoke/change-shots.mjs [outDir]
// Plays several generations through the debug handle (completeStage), so only the cards, recap and pages are real.
// HEALTHY=1 founds a healthy line instead (to check nothing shows there).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/change';
const BASE = process.env.SHOTS_URL ?? `http://localhost:4214/?quality=${process.env.Q ?? 'low'}`;
const GENS = Number(process.env.GENS ?? 8);
const healthy = process.env.HEALTHY === '1';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true, contentSeen: true }));
  localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
});
await page.goto(BASE);
await page.click('#btn-new');
if (!healthy) await page.click('#btn-river-changing');
await page.locator('#river-note').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/setup.png` });
await page.click('#btn-setup-next');
await page.click('#btn-accept-name');

const seen = new Set();
for (let g = 1; g <= GENS; g++) {
  for (let i = 0; i < 6; i++) {
    await page.locator('#btn-play').waitFor({ timeout: 15000 });
    const stage = await page.evaluate(() => window.__hw.app.world?.stageId);
    const line = await page.locator('#card-year').textContent();
    const c = await page.evaluate(() => window.__hw.app.world.conditions);
    if (/warmer|Silt|Hatchery|Set nets/.test(line ?? '')) {
      console.log(`G${g} ${stage}: temp ${c.temperature.toFixed(2)} warming ${c.warming ?? '-'} silt ${c.silt ?? '-'} hatchery ${c.hatchery ?? '-'} setNets ${c.setNets ?? '-'} | ${line}`);
      const key = `${stage}-${line}`;
      if (!seen.has(key) && seen.size < 8) {
        seen.add(key);
        await page.click('#btn-this-year');
        await page.screenshot({ path: `${OUT}/card-${stage}-g${g}.png` });
        await page.click('#btn-this-year');
      }
    }
    await page.click('#btn-play');
    await page.evaluate(() => window.__hw.completeStage());
  }
  await page.locator('#recap').waitFor({ timeout: 15000 });
  await page.click('#recap-tab-river');
  if (g === GENS) {
    await page.locator('#run-chart').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/recap-river.png` });
    await page.locator('#run-chart').screenshot({ path: `${OUT}/run-chart.png` });
    const since = page.locator('#change-since');
    console.log('change-since:', (await since.count()) ? await since.first().textContent() : '(none)');
    break;
  }
  await page.click('#recap-tab-next');
  await page.click('[data-offspring="0"]');
  await page.click('#btn-accept-name');
}
// The Lineages page from the title.
await page.evaluate(() => window.__hw.app.save?.());
await page.goto(BASE);
await page.click('#btn-lineages');
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/lineages-list.png` });
await page.click('[data-lineage="0"]');
await page.waitForTimeout(300);
const since = page.locator('#change-since');
if (await since.count()) await since.first().scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/lineages.png` });
console.log('lineages change-since:', (await since.count()) ? await since.first().textContent() : '(none)');
if (errors.length) console.error('page errors:', errors);
await browser.close();
