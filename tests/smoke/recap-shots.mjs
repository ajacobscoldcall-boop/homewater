// Screenshots of the recap stream: the life route map on stage cards (creek, river, lake beach), the paged
// recap (Your life, Your river, Your line, Next generation) and the extinction pages.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4197` after a build, then
//   node tests/smoke/recap-shots.mjs [outDir]
// Plays lives through the debug handle (completeStage, die), so only the cards and recap are real.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/recap';
const BASE = process.env.SHOTS_URL ?? `http://localhost:${process.env.PORT ?? 4197}/?quality=${process.env.Q ?? 'high'}`;
mkdirSync(OUT, { recursive: true });
// ONLY=1|2|3 runs one part.
const run = (n) => !process.env.ONLY || process.env.ONLY === String(n);

const browser = await chromium.launch();
const errors = [];
async function fresh() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/fonts\./.test(m.text()) && errors.push(m.text()));
  await page.addInitScript(() => {
    localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true }));
    localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
  });
  await page.goto(BASE);
  return page;
}
async function found(page, { habitat = 'creek', wild = false } = {}) {
  await page.click('#btn-new');
  if (wild) await page.click('text=Wild');
  await page.click(`[data-habitat="${habitat}"]`);
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
}
/** Let a death beat, if one plays, run out. */
async function skipBeat(page) {
  await page.waitForTimeout(300);
  await page.locator('.gore-beat').waitFor({ state: 'detached', timeout: 20000 });
  await page.locator('#btn-accept-name, #extinction').first().waitFor({ timeout: 20000 });
}
const card = (page, name) => page.locator('#screen .panel').screenshot({ path: `${OUT}/${name}.png` });

// 1. A creek life: the map on each stage card, a sibling lost on the smolt run and one at the nets.
if (run(1)) {
  const page = await fresh();
  await found(page);
  for (let i = 0; i < 6; i++) {
    await page.locator('#btn-play').waitFor();
    const stage = await page.evaluate(() => window.__hw.app.world.stageId);
    await card(page, `card-creek-${i + 1}-${stage}`);
    await page.click('#btn-play');
    if (stage === 'smolt' || stage === 'return') {
      await page.evaluate((c) => {
        window.__hw.app.world.die(c);
        window.__hw.step(0);
      }, stage === 'smolt' ? 'merganser' : 'gillnet');
      await page.waitForTimeout(200);
      await skipBeat(page);
      await page.evaluate(() => document.getElementById('btn-accept-name').click());
      await page.locator('#btn-play').waitFor();
      await card(page, `card-creek-${i + 1}-${stage}-sibling`);
      await page.click('#btn-play');
    }
    await page.evaluate(() => window.__hw.completeStage());
  }
  await page.locator('#recap').waitFor({ timeout: 20000 });
  await page.setViewportSize({ width: 1280, height: 1300 });
  for (const tab of ['life', 'river', 'line', 'next']) {
    await page.click(`#recap-tab-${tab}`);
    await page.locator('#recap').screenshot({ path: `${OUT}/recap-${tab}.png` });
  }
  await page.waitForTimeout(300);
  await page.locator('.kid-cards').screenshot({ path: `${OUT}/offspring-cards.png` });
  await page.close();
}

// 2. River and lake beach homes: the map before the sea and on the recap.
for (const habitat of run(2) ? ['river', 'beach'] : []) {
  const page = await fresh();
  await found(page, { habitat });
  for (let i = 0; i < 6; i++) {
    await page.locator('#btn-play').waitFor();
    const stage = await page.evaluate(() => window.__hw.app.world.stageId);
    if (stage === 'fry' || stage === 'return') await card(page, `card-${habitat}-${stage}`);
    await page.click('#btn-play');
    await page.evaluate(() => window.__hw.completeStage());
  }
  await page.locator('#recap').waitFor({ timeout: 20000 });
  await page.locator('#recap-map').screenshot({ path: `${OUT}/map-${habitat}.png` });
  await page.close();
}

// 3. A Wild line that dies out at sea: the extinction pages.
if (run(3)) {
  const page = await fresh();
  await found(page, { wild: true });
  for (let i = 0; i < 3; i++) {
    await page.click('#btn-play');
    await page.evaluate(() => window.__hw.completeStage());
  }
  for (let i = 0; i < 4; i++) {
    await page.evaluate((c) => {
      document.getElementById('btn-play').click();
      window.__hw.app.world.die(c);
      window.__hw.step(0);
    }, ['orca', 'shark', 'sea', 'orca'][i]);
    await page.waitForTimeout(200);
    await skipBeat(page);
    // Play asked for pointer lock (stages past the egg), which takes the mouse: click through the DOM.
    if (i < 3) await page.evaluate(() => document.getElementById('btn-accept-name').click());
  }
  await page.locator('#extinction').waitFor({ timeout: 20000 });
  await page.setViewportSize({ width: 1280, height: 1300 });
  await page.locator('#extinction').screenshot({ path: `${OUT}/extinction-life.png` });
  await page.evaluate(() => document.getElementById('extinction-tab-line').click());
  await page.locator('#extinction').screenshot({ path: `${OUT}/extinction-line.png` });
  await page.close();
}

await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('done');
