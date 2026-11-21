// Screenshots of the estuary at the end of the smolt run: night at the river mouth, first light in the brackish
// band near the halocline, salt stress in the deep salt water, and the open sea end; plus the last parr marks.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4204` after a build, then
//   node tests/smoke/estuary-shots.mjs [outDir]
// Q=low|medium|high (default high). Predators are cleared; the details bar (H) is on.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/estuary';
const BASE = process.env.SHOTS_URL ?? `http://localhost:4204/?quality=${process.env.Q ?? 'high'}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => {
  localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true }));
  localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false }));
});
await page.goto(BASE);
await page.click('#btn-new');
await page.click('[data-preset="quick"]');
await page.click('#btn-setup-next');
await page.click('#btn-accept-name');
if (await page.locator('#btn-play').isVisible().catch(() => false)) await page.click('#btn-play');
await page.waitForFunction(() => window.__hw.app.world, null, { timeout: 60000 });

/** Hold the fish at x (world units along the run) and depth, with a readiness for salt water, predators cleared. */
async function place(x, depth, ready, yaw = 0, details = true) {
  await page.evaluate(
    ([x, depth, ready, yaw, details]) => {
      const app = window.__hw.app;
      const w = app.world;
      if (w.stageId !== 'smolt') w.debugJumpTo(2);
      app.hudDetailed = details;
      clearInterval(window.__hold);
      window.__hold = setInterval(() => {
        const s = w.stage;
        s.birdTimer = s.mergTimer = s.sealTimer = 1e9;
        for (const e of w.entities) if (['birdShadow', 'seal', 'merganser', 'trout'].includes(e.kind)) e.alive = false;
        w.body.pos.x = x;
        w.body.pos.z = 0.5;
        w.body.pos.y = -depth;
        w.body.yaw = yaw;
        w.body.pitch = 0;
        w.body.energy = Math.max(w.body.energy, 0.5);
        if (ready !== null) s.salt.ready = ready;
      }, 4);
    },
    [x, depth, ready, yaw, details],
  );
  await page.waitForTimeout(2600);
}

async function snap(name) {
  await page.waitForTimeout(200);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  const info = await page.evaluate(() => {
    const w = window.__hw.app.world;
    const s = w.stage.salt;
    return `x ${w.body.pos.x.toFixed(0)} ready ${s.ready.toFixed(2)} salinity ${s.salinity.toFixed(2)} over ${s.over.toFixed(2)} | ${document.getElementById('hud-water')?.innerText ?? ''} | ${document.getElementById('hud-vitals')?.innerText.replace(/\n/g, ' ') ?? ''}`;
  });
  console.log('shot', name, info);
}

const p = await page.evaluate(() => {
  const g = (id) => window.__hw.app.world.p.get(id);
  return { mouth: g('smolt.mouthStart'), start: g('smolt.estuaryStart'), end: g('smolt.length') };
});
await place(p.mouth - 30, 2.6, 0.38);
await snap('estuary-river-night');
await place(p.start + 8, 3.8, 0.5);
await snap('estuary-brackish-dawn');
await place(p.start + 55, 6, 0.45);
await snap('estuary-salt-stress');
await place(p.end - 25, 2.5, 0.95);
await snap('estuary-open-sea');
await place(p.start + 10, 3.6, 0.3, 0, false);
await snap('estuary-in-play');
// The last parr marks fading (gallery: a smolt leaving the lake beside a fully silver one).

const base = new URL(BASE);
for (const id of ['smoltParr', 'smolt']) {
  base.searchParams.set('gallery', id);
  await page.goto(base.toString());
  await page.waitForTimeout(2500);
  writeFileSync(`${OUT}/estuary-gallery-${id}.png`, await page.screenshot());
  console.log('shot', `estuary-gallery-${id}`);
}
await browser.close();
