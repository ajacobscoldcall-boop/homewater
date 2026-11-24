// Screenshots of the ocean journey (Track 2.6): the open-water look by place and season (coastal green in
// the first summer, the shelf edge in autumn, dark winter water far out, offshore blue in spring and summer,
// a warm year), the fish drawn larger season by season, and the ocean map shown in a time skip.
// Not part of the smoke suite. Usage: start `npx vite preview --port 4211` after a build, then
//   node tests/smoke/ocean-shots.mjs [outDir]
// Q=low|medium|high (default high). Hunters are cleared so each shot shows the place and the food.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/ocean';
const BASE = process.env.SHOTS_URL ?? `http://localhost:4211/?quality=${process.env.Q ?? 'high'}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.addInitScript(() => {
  localStorage.setItem('homewater.settings', JSON.stringify({ volume: 0, muted: true, contentSeen: true }));
  localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false, guidance: false }));
});
await page.goto(BASE);
await page.click('#btn-new');
await page.click('[data-preset="quick"]');
await page.click('#btn-setup-next');
await page.click('#btn-accept-name');
if (await page.locator('#btn-play').isVisible().catch(() => false)) await page.click('#btn-play');
await page.waitForFunction(() => window.__hw.app.world, null, { timeout: 60000 });

/**
 * Start the ocean at a season: marker 0 is the first summer; 1 runs the first summer out to reach the shelf;
 * a later marker resumes a fish with `years` at sea there (as a sibling would). Then hold the fish near a patch.
 */
async function season(marker, { years = 3, warm = false, shallow = true, behind = 7 } = {}) {
  await page.evaluate(
    ([marker, years, warm]) => {
      const w = window.__hw.app.world;
      clearInterval(window.__hold);
      w.debugJumpTo(3);
      if (marker >= 2) {
        w.progress.isJack = false;
        w.progress.oceanYears = years;
        w.progress.adultSize = years === 3 ? 1 : 0.67;
        w.startStage(3, marker);
      }
      if (warm) w.stage.warmth = ['warm', 'warm', 'warm', 'warm'];
      // Clear hunters every few ms; for marker 1, end the first summer at once.
      window.__clear = setInterval(() => {
        for (const e of w.entities) if (['seal', 'orca', 'shark'].includes(e.kind)) e.alive = false;
        w.stage.predatorSpawned = true;
        w.stage.goneAt = 0;
      }, 4);
      if (marker === 1) w.stage.phaseTime = 1e4;
    },
    [marker, years, warm],
  );
  // Let a skip finish and the season set up.
  await page.waitForFunction(() => window.__hw.app.world.stage.phase === 'season', null, { timeout: 30000 });
  await page.evaluate(
    ([shallow, behind]) => {
      const w = window.__hw.app.world;
      window.__hold = setInterval(() => {
        const pa = w.stage.patches.find((p) => p.shallow === shallow) ?? w.stage.patches[0];
        if (!pa) return;
        w.stage.phaseTime = 5;
        w.body.pos.x = pa.center.x - 2;
        w.body.pos.y = pa.center.y + 0.5;
        w.body.pos.z = pa.center.z - behind;
        w.body.vel = { x: 0, y: 0, z: 0 };
        w.body.yaw = Math.PI / 2;
        w.body.pitch = 0;
        w.body.energy = 1;
      }, 4);
    },
    [shallow, behind],
  );
  await page.waitForTimeout(3500);
}

async function snap(name) {
  await page.waitForTimeout(200);
  writeFileSync(`${OUT}/${name}.png`, await page.screenshot());
  const info = await page.evaluate(() => {
    const w = window.__hw.app.world;
    const s = w.stage;
    const pl = s.plan[s.index];
    return `${pl ? `year ${pl.year} ${pl.season} ${pl.place} ${pl.encounter}` : s.phase} scale ${w.body.scale.toFixed(2)} warmth ${s.warmth.join(',')}`;
  });
  console.log('shot', name, info);
}

await season(0);
await snap('ocean-coast-summer');
await season(1, { shallow: false });
await snap('ocean-shelf-autumn');
await season(2, { shallow: false });
await snap('ocean-winter-far-out');
await season(3);
await snap('ocean-spring-offshore');
await season(4, { behind: 9 });
await snap('ocean-summer-year2');
await season(4, { warm: true, behind: 9 });
await snap('ocean-warm-year');
await season(9, { shallow: false, behind: 10 });
await snap('ocean-autumn-year3-grown');

// The map in a time skip: end a season and catch the skip.
await page.evaluate(() => {
  clearInterval(window.__hold);
  const w = window.__hw.app.world;
  w.stage.phaseTime = 1e4;
});
await page.waitForFunction(() => window.__hw.app.world.stage.phase === 'skip', null, { timeout: 10000 });
await page.waitForTimeout(1500);
await snap('ocean-map-skip');
await browser.close();
