// Text diet, stage cards and onboarding: review shots (not part of the smoke suite).
// Usage: start `npx vite preview --port 4195` after a build, then
//   node tests/smoke/text-shots.mjs [outDir] [prefix]
// A fresh Field guide first life (journal empty, so every unlock shows): for each stage the stage card and
// the screen a few seconds into the stage, plus the controls picture and the "This year" panel.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/text';
const PREFIX = process.argv[3] ?? 'text';
const Q = process.env.QUALITY ?? 'high';
const BASE = process.env.SHOTS_URL ?? `http://localhost:${process.env.PW_PORT ?? 4195}/?quality=${Q}`;
const WAIT = Number(process.env.WAIT ?? 2500);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(sex = 'F') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'documentary', volume: 0, muted: true }));
    localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
  });
  await page.goto(BASE);
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  await page.locator('.grid3 button.choice', { hasText: sex === 'F' ? '♀' : '♂' }).first().click().catch(() => {});
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  return page;
}

const shot = async (page, name) => {
  writeFileSync(`${OUT}/${PREFIX}-${name}.png`, await page.screenshot());
  console.log('shot', name);
};

const STAGES = ['egg', 'fry', 'smolt', 'ocean', 'return', 'spawn'];
for (const [i, name] of STAGES.entries()) {
  const page = await boot(name === 'spawn' ? 'M' : 'F');
  if (i > 0) await page.evaluate((n) => window.__hw.app.debugJump(n), i);
  await page.waitForTimeout(300);
  await shot(page, `${name}-card`);
  const year = page.locator('#btn-this-year');
  if (i === 0 && (await year.count())) {
    await year.click();
    await page.waitForTimeout(200);
    await shot(page, 'egg-this-year');
    await year.click();
  }
  await page.click('#btn-play');
  // Keep the fish alive and swimming so the shot shows the stage's start, not a death.
  await page.evaluate(() => {
    setInterval(() => {
      const w = window.__hw.app.world;
      if (w && w.status === 'playing') w.body.energy = Math.max(w.body.energy, 0.7);
    }, 50);
  });
  await page.waitForTimeout(WAIT);
  await shot(page, `${name}-start`);
  if (i === 1 && !process.env.BEFORE) {
    // Onboarding: turn both ways, then the depth step with its controls picture; the mouse note; the journal.
    await page.keyboard.down('KeyW');
    for (const key of ['KeyA', 'KeyD']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(900);
      await page.keyboard.up(key);
    }
    await page.waitForTimeout(400);
    await shot(page, 'fry-onboarding');
    await page.evaluate(() => {
      localStorage.removeItem('homewater.mouseLockSeen');
      window.__hw.app.messages.clearCaptions();
      window.__hw.app.messages.pointerLocked();
    });
    await page.waitForTimeout(600);
    await shot(page, 'mouse-note');
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(300);
    await shot(page, 'journal-new');
    await page.click('[data-journal-page="life"]');
    await page.waitForTimeout(200);
    await shot(page, 'journal-life');
  }
  await page.close();
}
await browser.close();
