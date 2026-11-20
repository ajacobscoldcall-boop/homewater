// Low camera review shots (not part of the smoke suite).
// Usage: start `npx vite preview --port 4198` after a build, then
//   node tests/smoke/lowcam-shots.mjs [outDir]
// Plays each stage from the default low chase camera on a Field guide life, holding W for a few seconds as the
// coordinator's review did, and saves one shot per stage and graphics preset; then the night smolt run with a char
// warning, and the spawning female resting on the bed. QUALITIES=high,medium,low picks presets (default high);
// STAGE_NAMES=fry,return picks stages; ONLY=stages,smolt,bed runs one part; PREFIX names the files (default lowcam).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/lowcam';
const PORT = process.env.PW_PORT ?? 4198;
const QUALITIES = (process.env.QUALITIES ?? 'high').split(',');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const PREFIX = process.env.PREFIX ?? 'lowcam';
const PICK = process.env.STAGE_NAMES ? process.env.STAGE_NAMES.split(',') : null;
const HOLD = Number(process.env.HOLD_MS ?? 5000);
const want = (k) => !ONLY || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(q, { sex = 'F' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'unflinching', volume: 0, muted: true }));
    localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
  });
  await page.goto(`http://localhost:${PORT}/?quality=${q}`);
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  await page.locator('.grid3 button.choice', { hasText: sex === 'F' ? '♀' : '♂' }).first().click().catch(() => {});
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  return page;
}

async function jump(page, stage) {
  await page.evaluate((i) => window.__hw.app.debugJump(i), stage);
  await page.click('#btn-play');
  await page.waitForTimeout(300);
  // Keep the fish alive and fresh so the shot is about the look.
  await page.evaluate(() => {
    window.__hwHold = setInterval(() => {
      const w = window.__hw.app.world;
      if (w && w.status === 'playing') w.body.energy = Math.max(w.body.energy, 0.7);
    }, 50);
  });
}

const shot = async (page, name) => {
  writeFileSync(`${OUT}/${PREFIX}-${name}.png`, await page.screenshot());
  console.log('shot', name);
};

const STAGES = [
  [0, 'egg'],
  [1, 'fry'],
  [2, 'smolt'],
  [3, 'ocean'],
  [4, 'return'],
  [5, 'spawn'],
].filter(([, n]) => !PICK || PICK.includes(n));

if (want('stages')) {
  for (const q of QUALITIES) {
    for (const [i, name] of STAGES) {
      const page = await boot(q);
      await jump(page, i);
      if (i > 0) await page.keyboard.down('KeyW');
      await page.waitForTimeout(i > 0 ? HOLD : 1500);
      if (i > 0) await page.keyboard.up('KeyW');
      await page.waitForTimeout(250);
      await shot(page, `${name}-${q}`);
      await page.close();
    }
  }
}

if (want('smolt')) {
  // The night run with a char lunging from the side: the player's fish and the threat should both read.
  const page = await boot(QUALITIES[0]);
  await jump(page, 2);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    const f = w.body.pos;
    w.spawn('char', { x: f.x + 5, y: f.y + 0.6, z: f.z - 2.5 }, { radius: 0.5, state: 'warn', timer: 2 });
    w.emit('warning', 'char');
  });
  await page.waitForTimeout(600);
  await shot(page, `smolt-threat-${QUALITIES[0]}`);
  await page.close();
}

if (want('bed')) {
  // The spawning female, digging and resting over her redd: the body should rest on the gravel, not sink into it.
  const page = await boot(QUALITIES[0]);
  await jump(page, 5);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(1500);
  await shot(page, `spawn-bed-${QUALITIES[0]}`);
  const info = await page.evaluate(() => {
    const w = window.__hw.app.world;
    const p = w.body.pos;
    return { y: p.y, floor: w.arena.floor(p.x, p.z), scale: w.body.scale ?? null };
  });
  console.log('bed', JSON.stringify(info));
  await page.close();
}

await browser.close();
