// Screenshots of the fry's lake days: deep by day, the dusk rise, night, dawn, and a merganser on the surface and diving.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4203` after a build, then
//   node tests/smoke/fry-shots.mjs [outDir]
// Q=low|medium|high (default high). The fish is held in place and the lake day's clock is set for each shot.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/fry';
const Q = process.env.Q ?? 'high';
const BASE = process.env.SHOTS_URL ?? `http://localhost:${process.env.PW_PORT ?? 4203}/?quality=${Q}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript((doc) => {
  localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true, contentSeen: true }));
  localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false, documentaryView: doc }));
}, process.env.DOC === '1');
await page.goto(BASE);
await page.click('#btn-new');
await page.click('[data-preset="quick"]');
await page.click('#btn-setup-next');
await page.click('#btn-accept-name');
if (await page.locator('#btn-play').isVisible().catch(() => false)) await page.click('#btn-play');
await page.waitForFunction(() => window.__hw.app.world, null, { timeout: 60000 });
await page.evaluate(() => {
  const w = window.__hw.app.world;
  w.debugJumpTo(1);
  // The second summer's checkpoint opens straight into a lived lake day.
  w.restore({ stageIndex: 1, marker: 2, progress: { ...w.progress, fryBites: 12, fryRichBites: 5 } });
});
if (await page.locator('#btn-play').isVisible().catch(() => false)) await page.click('#btn-play');
await page.waitForTimeout(500);
// Gallery shots: no guide box.
await page.keyboard.press('g');

/** Hold the fish at a spot at a time of day (clock: fraction of the lake day from dawn); optionally a merganser in a state. */
async function place(clock, pos, yaw, bird = null) {
  await page.evaluate(
    ([clock, pos, yaw, bird]) => {
      const w = window.__hw.app.world;
      clearInterval(window.__hold);
      for (const e of w.entities) if (e.kind === 'merganser') e.alive = false;
      let m = null;
      if (bird) {
        m = w.spawn('merganser', { x: pos.x + bird.dx, y: bird.state === 'warn' ? 0 : pos.y + 1.2, z: pos.z + bird.dz }, { radius: 0.6, state: bird.state, timer: 99 });
      }
      window.__hold = setInterval(() => {
        const s = w.stage;
        s.clock = Math.floor(s.clock) + clock;
        s.clockEnd = 99;
        s.mergTimer = 99;
        for (const e of w.entities) if (e.kind === 'trout' && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < 9) e.pos.x += 12;
        Object.assign(w.body.pos, pos);
        w.body.yaw = yaw;
        w.body.pitch = 0;
        w.body.energy = 1;
        if (m) {
          m.alive = true;
          m.timer = 99;
          m.pos.x = pos.x + bird.dx;
          m.pos.z = pos.z + bird.dz;
          m.pos.y = bird.state === 'warn' ? 0 : pos.y + 1.2;
          m.vel = { x: -1, y: bird.state === 'warn' ? 0 : -2, z: 0 };
        }
      }, 4);
    },
    [clock, pos, yaw, bird],
  );
  await page.waitForTimeout(2500);
}

async function snap(name) {
  await page.waitForTimeout(200);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  const v = await page.evaluate(() => {
    const w = window.__hw.app.world;
    return { tod: w.stage.clock % 1, ents: w.entities.filter((e) => e.alive && e.kind === 'plankton').length };
  });
  console.log('shot', name, JSON.stringify(v));
}

await place(0.4, { x: -4, y: -8.5, z: 0 }, 0);
await snap('fry-day-deep');
await place(0.4, { x: -14, y: -1.5, z: 4 }, 0.6);
await snap('fry-day-shallows');
await place(0.64, { x: 6, y: -2, z: 2 }, 0.3);
await snap('fry-dusk-feeding');
await place(0.9, { x: 2, y: -3, z: 2 }, 0.3);
await snap('fry-night');
await place(0.06, { x: 6, y: -2, z: -2 }, 0.3);
await snap('fry-dawn');
await place(0.35, { x: -12, y: -2.5, z: 0 }, 0, { state: 'warn', dx: 4, dz: 1 });
await snap('fry-merganser-warning');
await place(0.35, { x: -6, y: -3.5, z: 0 }, 0, { state: 'chase', dx: 1.2, dz: 1.5 });
await snap('fry-merganser-chase');
await browser.close();
