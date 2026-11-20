// Feel pass checks (not part of the smoke suite). Usage: start `npx vite preview --port 4185` after a build, then
//   node tests/smoke/feel-shots.mjs [outDir]
// 1. Camera: in each swimming stage, swims hard into the banks and bed with random turns and records how close
//    the camera came to the ground, walls and surface (it must stay clear), with a few shots.
// 2. Warnings: waits for each predator's warning and shoots the default camera view with the HUD on.
// ONLY=camera,warnings runs one part. QUALITY=high|low (default high).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/feel';
const Q = process.env.QUALITY ?? 'high';
const BASE = process.env.SHOTS_URL ?? `http://localhost:4185/?quality=${Q}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
const PARTS = process.env.PARTS ? process.env.PARTS.split(',') : null;
const part = (k) => !PARTS || PARTS.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(sex = 'F') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript(() => {
    localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'unflinching', volume: 0, muted: true }));
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

async function jump(page, stage) {
  await page.evaluate((i) => window.__hw.app.debugJump(i), stage);
  await page.click('#btn-play');
  await page.waitForTimeout(300);
}

/** Camera clearance this frame: above ground/banks, outside walls, under the surface. */
const clearance = (page) =>
  page.evaluate(() => {
    const app = window.__hw.app;
    const w = app.world;
    const r = app.renderer;
    const c = r.camera.position;
    const env = r.env;
    const ground = Math.max(w.arena.floor(c.x, c.z), env ? env.ground(c.x, c.z) : -Infinity);
    let inWall = false;
    for (const b of w.arena.walls ?? []) if (c.x > b.min.x && c.x < b.max.x && c.z > b.min.z && c.z < b.max.z && c.y < b.max.y && c.y > b.min.y) inWall = true;
    const fish = w.body.pos;
    // The sim lets a fish run up the lake beach where the bed is above the surface; no camera can be in water there.
    const beached = w.arena.floor(fish.x, fish.z) > w.arena.surfaceY - 0.3;
    if (!beached && c.y - ground < 0.05 && !window.__bad) window.__bad = { c: { ...c }, rig: { ...r.rig.pos }, fish: { ...fish }, ground, floor: w.arena.floor(c.x, c.z), fishGround: env.ground(fish.x, fish.z), t: w.stageTime, phase: w.stage?.phase, surf: w.arena.surfaceY, mode: r.cameraMode, cine: !!r.cinematics.director?.active };
    return { beached, mode: app.mode, aboveGround: c.y - ground, belowSurface: w.arena.surfaceY - c.y, inWall, dist: Math.hypot(c.x - fish.x, c.y - fish.y, c.z - fish.z), stage: w.stageId, status: w.status };
  });

if (want('camera')) {
  const stages = process.env.STAGES ? JSON.parse(process.env.STAGES) : [
    [1, 'fry'],
    [2, 'smolt'],
    [3, 'ocean'],
    [4, 'return'],
    [5, 'spawn'],
  ];
  const report = [];
  for (const [i, name] of stages) {
    const page = await boot('F');
    await jump(page, i);
    // Make the fish hard to kill so it can swim into everything.
    let beachedFrames = 0;
    let worst = { aboveGround: Infinity, belowSurface: Infinity, inWall: false, minDist: Infinity };
    await page.keyboard.down('KeyW');
    for (let t = 0; t < 36; t++) {
      // Wander: turn one way, then the other, dive, rise, and burst now and then.
      const key = ['KeyA', 'KeyD', 'Space', 'KeyC', 'ShiftLeft'][t % 5];
      await page.evaluate((n) => {
        const w = window.__hw.app.world;
        if (w.status !== 'playing') return;
        // Point it at a bank or the bed every few beats.
        if (n % 3 === 0) {
          w.body.yaw += Math.PI / 2 * (n % 2 ? 1 : -1);
          w.body.pitch = n % 6 === 0 ? -0.9 : 0.2;
        }
      }, t);
      await page.keyboard.down(key);
      for (let f = 0; f < 6; f++) {
        await page.waitForTimeout(60);
        const c = await clearance(page);
        if (c.status !== 'playing' || c.mode !== 'playing') break;
        if (c.beached) {
          beachedFrames++;
          continue;
        }
        worst = { aboveGround: Math.min(worst.aboveGround, c.aboveGround), belowSurface: Math.min(worst.belowSurface, c.belowSurface), inWall: worst.inWall || c.inWall, minDist: Math.min(worst.minDist, c.dist) };
      }
      await page.keyboard.up(key);
      const s = await page.evaluate(() => window.__hw.app.world.status);
      if (s !== 'playing') {
        // Died or finished: start the stage again and carry on.
        await jump(page, i);
        await page.keyboard.down('KeyW');
      }
      if (t === 12 || t === 30) writeFileSync(`${OUT}/camera-${name}-${t}.png`, await page.screenshot());
    }
    await page.keyboard.up('KeyW');
    worst.beachedFrames = beachedFrames;
    report.push({ stage: name, ...worst });
    console.log('bad', JSON.stringify(await page.evaluate(() => window.__bad ?? null)));
    console.log(name, JSON.stringify(worst));
    await page.close();
  }
  writeFileSync(`${OUT}/camera-report.json`, JSON.stringify(report, null, 2));
}

/** Wait for an entity of `kind` in `state`, then a moment into the warning, and shoot. */
async function warnShot(page, name, kind, state, setup, delay = 400) {
  if (setup) await page.evaluate(setup);
  const ok = await page
    .waitForFunction(([k, s]) => window.__hw.app.world.entities.some((e) => e.alive && e.kind === k && e.state === s), [kind, state], { timeout: 40000, polling: 30 })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    console.error('no', name);
    return;
  }
  await page.waitForTimeout(delay);
  const info = await page.evaluate(([k]) => {
    const e = window.__hw.app.world.entities.find((x) => x.alive && x.kind === k);
    const markers = [...document.querySelectorAll('.threat')].map((m) => ({ cls: m.className, text: m.textContent, at: [m.style.left, m.style.top], shown: getComputedStyle(m).display !== 'none' && getComputedStyle(m).visibility !== 'hidden' }));
    return { state: e?.state, timer: e?.timer, markers };
  }, [kind]);
  writeFileSync(`${OUT}/warn-${name}.png`, await page.screenshot());
  console.log('warn', name, JSON.stringify(info));
}

if (want('warnings')) {
  // Keep the fish alive and still-ish: forward slowly, and let the predators come.
  const hold = "window.__hwHold = setInterval(() => { const w = window.__hw.app.world; if (w && w.status === 'playing') w.body.energy = 1; }, 50);";
  if (part('fry')) {
    const page = await boot('F');
    await jump(page, 1);
    await page.evaluate(hold);
    // Out of the weeds, in open water, so the Dolly Varden comes.
    await warnShot(page, 'fry-dolly', 'trout', 'warn', "(() => { const w = window.__hw.app.world; w.body.pos.x = 20; w.body.pos.y = -2; })()");
    await page.close();
  }
  if (part('smolt')) {
    const page = await boot('F');
    await jump(page, 2);
    await page.evaluate(hold);
    await page.keyboard.down('KeyW');
    await warnShot(page, 'smolt-char', 'trout', 'warn');
    await warnShot(page, 'smolt-bird', 'birdShadow', 'warn', null, 700);
    await warnShot(page, 'smolt-merganser', 'merganser', 'warn');
    await warnShot(page, 'smolt-seal', 'seal', 'warn');
    await page.keyboard.up('KeyW');
    await page.close();
  }
  // Some predators come late or rarely: put one in (as the stage would) so its warning can be checked.
  const put = (kind, dx, dy, dz, extra) =>
    `(() => { const w = window.__hw.app.world; const f = w.body.pos; w.spawn('${kind}', { x: f.x + ${dx}, y: Math.max(-28, f.y + ${dy}), z: f.z + ${dz} }, ${extra}); w.emit('warning', '${kind}'); })()`;
  if (part('ocean')) {
    const page = await boot('F');
    await jump(page, 3);
    await page.evaluate(hold);
    await warnShot(page, 'ocean-orca', 'orca', 'warn');
    await page.evaluate(() => window.__hw.app.world.entities.forEach((e) => (e.kind === 'orca' ? (e.alive = false) : 0)));
    await warnShot(page, 'ocean-shark', 'shark', 'warn', put('shark', 21, -10, 21, "{ radius: 1.5, state: 'warn', timer: w.p.get('ocean.sharkWarning') }"));
    await page.close();
  }
  if (part('return')) {
    const page = await boot('F');
    await jump(page, 4);
    await page.evaluate(hold);
    // Beside a lure's pool, so it swings by.
    await page.evaluate(() => {
      const w = window.__hw.app.world;
      const lure = w.entities.find((e) => e.kind === 'lure');
      const home = lure.home ?? lure.pos;
      w.body.pos = { x: home.x - 6, y: -1.2, z: w.stage.homeMouth };
      w.body.yaw = 0;
    });
    const near = await page
      .waitForFunction(() => {
        const w = window.__hw.app.world;
        const f = w.body.pos;
        return w.entities.some((e) => e.kind === 'lure' && e.state === 'swing' && Math.hypot(e.pos.x - f.x, e.pos.y - f.y, e.pos.z - f.z) < 7);
      }, null, { timeout: 30000, polling: 30 })
      .then(() => true)
      .catch(() => false);
    if (near) await warnShot(page, 'return-lure', 'lure', 'swing', null, 0);
    else console.error('no lure near');
    await page.evaluate(() => {
      const w = window.__hw.app.world;
      w.entities.forEach((e) => (e.kind === 'lure' ? (e.alive = false) : 0));
      w.body.pos = { x: 92, y: -1.2, z: w.stage.homeMouth };
    });
    await page.keyboard.down('KeyW');
    await warnShot(page, 'return-bear', 'bear', 'warn');
    await page.keyboard.up('KeyW');
    await page.close();
  }
  if (part('spawn')) {
    const page = await boot('M');
    await jump(page, 5);
    await page.evaluate(hold);
    await warnShot(page, 'spawn-rival', 'rival', 'approach', put('rival', -9, 0, 2, "{ radius: 0.6, state: 'approach', value: 1, home: { ...f } }"), 800);
    await warnShot(
      page,
      'spawn-bear',
      'bear',
      'warn',
      "(() => { const w = window.__hw.app.world; const f = w.body.pos; w.spawn('bear', { x: f.x, y: 0.8, z: (f.z > 0 ? 1 : -1) * 8.6 }, { radius: 1.2, state: 'warn', timer: w.p.get('spawn.bearWarning'), home: { x: f.x, y: 0, z: f.z }, value: 0 }); w.emit('warning', 'bear'); })()",
      600,
    );
    await page.close();
  }
}

await browser.close();
