// Science integrity (Track 4): review shots of the Field journal's "How true is this?" notes and Sources page
// (not part of the smoke suite).
// Usage: start `npx vite preview --port 4217` after a build, then
//   node tests/smoke/science-shots.mjs [outDir] [prefix]
// Every entry is unlocked in localStorage first, so each page shows in full.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/science';
const PREFIX = process.argv[3] ?? 'science';
const BASE = process.env.SHOTS_URL ?? `http://localhost:${process.env.PW_PORT ?? 4217}/?quality=low`;
mkdirSync(OUT, { recursive: true });

const ids = JSON.parse(readFileSync('src/data/journal.json', 'utf8')).entries.map((e) => e.id);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript((all) => {
  localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'documentary', volume: 0, muted: true, contentSeen: true }));
  localStorage.setItem('homewater.journal', JSON.stringify(all));
}, ids);
await page.goto(BASE);
await page.click('#btn-journal');

const shot = async (name) => {
  writeFileSync(`${OUT}/${PREFIX}-${name}.png`, await page.screenshot());
  console.log('shot', name);
};

// A stage page with its "How true is this?" notes open.
for (const stage of ['fry', 'return', 'spawn']) {
  await page.click(`[data-journal-page="${stage}"]`);
  await page.evaluate(() => document.querySelectorAll('#journal details.how-true').forEach((d) => (d.open = true)));
  await page.waitForTimeout(150);
  await shot(`journal-${stage}`);
}
// The return's falls entry, scrolled into view.
await page.click('[data-journal-page="return"]');
await page.evaluate(() => {
  const el = document.querySelector('[data-entry="return.falls"]');
  el?.querySelector('details')?.setAttribute('open', '');
  el?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(150);
await shot('journal-falls');
// The sources link under an entry leads to the Sources page.
await page.click('[data-journal-page="fry"]');
await page.locator('.entry-sources button.link').first().click();
await page.waitForTimeout(150);
await shot('journal-sources');
await browser.close();
