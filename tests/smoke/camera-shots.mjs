// Camera framing, Documentary view and the minimal HUD: review shots (not part of the smoke suite).
// Usage: start `npx vite preview --port 4194` after a build, then
//   node tests/smoke/camera-shots.mjs [outDir]
// For every stage, the default (game) view and Documentary view with the low chase camera, plus the high view for
// comparison; then the framed moments (a fight, the spawning act, a leap at the falls), a warning in each view,
// and the HUD's fat warning and water chip on the return. ONLY=stages,moments,warnings runs one part.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'tests/smoke/screenshots/camera';
const Q = process.env.QUALITY ?? 'high';
const BASE = process.env.SHOTS_URL ?? `http://localhost:${process.env.PW_PORT ?? 4194}/?quality=${Q}`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot({ sex = 'F', doc = false, view = 'chase' } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.error('pageerror', e.message));
  await page.addInitScript(
    ([doc, view]) => {
      localStorage.setItem('homewater.settings', JSON.stringify({ gore: 'unflinching', volume: 0, muted: true }));
      localStorage.setItem('homewater.access', JSON.stringify({ cinematics: false, documentaryView: doc, cameraView: view }));
    },
    [doc, view],
  );
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

const hold = () => {
  window.__hwHold = setInterval(() => {
    const w = window.__hw.app.world;
    if (w && w.status === 'playing') w.body.energy = Math.max(w.body.energy, 0.7);
  }, 50);
};

const shot = async (page, name) => {
  writeFileSync(`${OUT}/camera-${name}.png`, await page.screenshot());
  console.log('shot', name);
};

const PICK = process.env.STAGE_NAMES ? process.env.STAGE_NAMES.split(',') : null;
const TAGS = process.env.TAGS ? process.env.TAGS.split(',') : null;
const ALL_STAGES = [
  [0, 'egg', 1500],
  [1, 'fry', 2200],
  [2, 'smolt', 2200],
  [3, 'ocean', 2200],
  [4, 'return', 2500],
  [5, 'spawn', 2500],
];
const STAGES = ALL_STAGES.filter(([, n]) => !PICK || PICK.includes(n));

if (want('stages')) {
  for (const [view, doc, tag] of [
    ['chase', false, 'game'],
    ['chase', true, 'doc'],
    ['high', false, 'high'],
  ]) {
    if (TAGS && !TAGS.includes(tag)) continue;
    for (const [i, name, wait] of STAGES) {
      const page = await boot({ doc, view, sex: name === 'spawn' ? 'M' : 'F' });
      await jump(page, i);
      await page.evaluate(hold);
      if (i > 0) await page.keyboard.down('KeyW');
      await page.waitForTimeout(wait);
      if (i > 0) await page.keyboard.up('KeyW');
      await page.waitForTimeout(250);
      await shot(page, `${name}-${tag}`);
      await page.close();
    }
  }
}

if (want('moments')) {
  // A fight: a rival large male squaring up beside the player (as the stage does).
  for (const doc of [false, true]) {
    const page = await boot({ sex: 'M', doc });
    await jump(page, 5);
    await page.evaluate(hold);
    await page.evaluate(() => {
      const w = window.__hw.app.world;
      const f = w.body.pos;
      w.spawn('rival', { x: f.x + 1.6, y: f.y, z: f.z + 1.2 }, { radius: 0.6, state: 'fight', value: 1, timer: 30, home: { ...f } });
    });
    await page.waitForTimeout(2600);
    await shot(page, `fight-${doc ? 'doc' : 'game'}`);
    await page.close();
  }
  // The falls: put the fish in the plunge pool facing the step, then leap.
  {
    const page = await boot({ sex: 'F' });
    await jump(page, 4);
    await page.evaluate(hold);
    // The falls layout (src/sim/stages/falls.ts): plunge pool x 149-156, the face at 156, the standing wave 2.2 below it.
    const ok = await page.evaluate(() => {
      const w = window.__hw.app.world;
      const s = w.stage;
      if (!s.falls) return false;
      // Bears away, so the shot is about the falls.
      w.entities.forEach((e) => (e.kind === 'bear' ? (e.alive = false) : 0));
      w.body.pos = { x: 150.2, y: w.arena.surfaceY - 1.0, z: s.homeMouth + s.falls.notchZ };
      w.body.vel = { x: 0, y: 0, z: 0 };
      w.body.yaw = 0;
      w.body.pitch = 0;
      return true;
    });
    if (ok) {
      await page.waitForTimeout(1800);
      await shot(page, 'falls-pool');
      // Run at the step and leap from the standing wave (as the test pilot does).
      await page.keyboard.down('KeyW');
      await page.keyboard.down('ShiftLeft');
      const atWave = await page
        .waitForFunction(() => window.__hw.app.world.body.pos.x > 153.4, null, { timeout: 6000, polling: 16 })
        .then(() => true)
        .catch(() => false);
      if (atWave) await page.keyboard.down('Space');
      const leapt = await page
        .waitForFunction(() => !!window.__hw.app.world.stage.falls?.leap, null, { timeout: 4000, polling: 16 })
        .then(() => true)
        .catch(() => false);
      await page.waitForTimeout(leapt ? 200 : 0);
      await shot(page, leapt ? 'falls-leap' : 'falls-try');
      await page.keyboard.up('Space');
      await page.keyboard.up('ShiftLeft');
      await page.keyboard.up('KeyW');
    } else console.error('no falls');
    await page.close();
  }
}

if (want('warnings')) {
  const put = (kind, dx, dy, dz, extra) =>
    `(() => { const w = window.__hw.app.world; const f = w.body.pos; w.spawn('${kind}', { x: f.x + ${dx}, y: Math.max(-28, f.y + ${dy}), z: f.z + ${dz} }, ${extra}); w.emit('warning', '${kind}'); })()`;
  for (const doc of [false, true]) {
    const tag = doc ? 'doc' : 'game';
    // Fry: a Dolly Varden behind and to one side (the soft look should bring it in).
    {
      const page = await boot({ doc });
      await jump(page, 1);
      await page.evaluate(hold);
      await page.evaluate("(() => { const w = window.__hw.app.world; w.body.pos.x = 20; w.body.pos.y = -2; })()");
      const ok = await page
        .waitForFunction(() => window.__hw.app.world.entities.some((e) => e.alive && e.kind === 'trout' && e.state === 'warn'), null, { timeout: 40000, polling: 30 })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        await page.waitForTimeout(700);
        await shot(page, `warn-fry-${tag}`);
      } else console.error('no dolly');
      await page.close();
    }
    // Ocean: a salmon shark off to the side and behind.
    {
      const page = await boot({ doc });
      await jump(page, 3);
      await page.evaluate(hold);
      await page.evaluate(put('shark', -14, -3, 12, "{ radius: 1.5, state: 'warn', timer: w.p.get('ocean.sharkWarning') }"));
      await page.waitForTimeout(150);
      await shot(page, `warn-shark-early-${tag}`);
      await page.waitForTimeout(1300);
      await shot(page, `warn-shark-${tag}`);
      await page.close();
    }
  }
}

if (want('hud')) {
  // Return: low fat burning fast, in a warm stretch, so the fat ring warns and the water chip shows.
  const page = await boot({ sex: 'F' });
  await jump(page, 4);
  await page.evaluate(hold);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await page.evaluate(() => {
    const w = window.__hw.app.world;
    w.progress.fat = 0.45;
  });
  await page.waitForTimeout(6000);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  const info = await page.evaluate(() => ({
    rings: [...document.querySelectorAll('.vital')].map((v) => `${v.dataset.vital}:${v.className}`),
    water: document.getElementById('hud-water')?.hidden ? '' : document.getElementById('hud-water')?.textContent,
    fat: window.__hw.app.world.progress.fat,
  }));
  console.log('hud', JSON.stringify(info));
  await shot(page, 'hud-return-fat');
  await page.close();
}

await browser.close();
