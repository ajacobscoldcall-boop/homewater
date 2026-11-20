// Screenshots of the river's population: the lake and fishery lines on stage cards and the run chart on the recap.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4185` after a build, then
//   node tests/smoke/population-shots.mjs [outDir]
// Plays several generations through the debug handle (completeStage), so only the cards and recap are real.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/population';
const BASE = process.env.SHOTS_URL ?? `http://localhost:4185/?quality=${process.env.Q ?? 'low'}`;
const GENS = Number(process.env.GENS ?? 7);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => {
  localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true }));
  localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
});
await page.goto(BASE);
await page.click('#btn-new');
await page.click('#btn-setup-next');
await page.click('#btn-accept-name');

const cards = { fry: [], return: [] };
for (let g = 1; g <= GENS; g++) {
  for (let i = 0; i < 6; i++) {
    await page.locator('#btn-play').waitFor({ timeout: 15000 });
    const stage = await page.evaluate(() => window.__hw.app.world?.stageId);
    const line = (await page.locator('#pop-line').count()) ? await page.locator('#pop-line').textContent() : null;
    if (line && (stage === 'fry' || stage === 'return')) {
      const c = await page.evaluate(() => window.__hw.app.world.conditions);
      console.log(`G${g} ${stage}: run ${c.runSize.toFixed(2)} fry ${c.fryCrowding?.toFixed(2)} food ${c.lakeFood?.toFixed(2)} harvest ${c.harvestRate?.toFixed(2)} | ${line}`);
      const key = `${stage}-${line.slice(0, 24)}`;
      if (!cards[stage].includes(key)) {
        cards[stage].push(key);
        await page.screenshot({ path: `${OUT}/card-${stage}-g${g}.png` });
      }
    }
    await page.click('#btn-play');
    await page.evaluate(() => window.__hw.completeStage());
  }
  await page.locator('[data-offspring="0"]').waitFor({ timeout: 15000 });
  if (g === GENS) {
    await page.locator('#run-chart').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/recap.png` });
    await page.locator('#run-chart').screenshot({ path: `${OUT}/run-chart.png` });
    if (await page.locator('#pop-recap').count()) await page.locator('#pop-recap').screenshot({ path: `${OUT}/recap-line.png` });
    break;
  }
  await page.click('[data-offspring="0"]');
  await page.click('#btn-accept-name');
}
await browser.close();
