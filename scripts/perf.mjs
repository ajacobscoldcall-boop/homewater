/**
 * Measures frames per second and draw calls per stage at each graphics preset,
 * in Chromium with software GL (SwiftShader), a stand-in for a weak laptop GPU.
 *
 *   npm run build && PW_PORT=4182 npm run perf -- [presets...] [--seconds=3] [--stages=fry,ocean] [--aa=on|off] [--shots=dir] [--dir=dist]
 *
 * --dir serves another build folder (e.g. a build of an older commit, to compare).
 *
 * Presets default to: low medium high auto. Prints a Markdown table.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const port = Number(process.env.PW_PORT ?? 4182);
const args = process.argv.slice(2);
const seconds = Number(args.find((a) => a.startsWith('--seconds='))?.split('=')[1] ?? 3);
const shots = args.find((a) => a.startsWith('--shots='))?.split('=')[1];
// --aa=on|off forces the WebGL context's antialiasing, to measure its cost apart from the preset.
const forceAA = args.find((a) => a.startsWith('--aa='))?.split('=')[1];
const only = args.find((a) => a.startsWith('--stages='))?.split('=')[1]?.split(',');
const dir = args.find((a) => a.startsWith('--dir='))?.split('=')[1] ?? 'dist';
const presets = args.filter((a) => !a.startsWith('--'));
if (presets.length === 0) presets.push('low', 'medium', 'high', 'auto');
const STAGES = ['egg', 'fry', 'smolt', 'ocean', 'return', 'spawn'];

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--outDir', dir], { stdio: 'pipe' });
const base = `http://localhost:${port}/`;
for (let i = 0; i < 100; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    // not up yet
  }
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const rows = [];
try {
  for (const preset of presets) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    if (forceAA) {
      await page.addInitScript((aa) => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, opts) {
          return get.call(this, type, opts ? { ...opts, antialias: aa } : opts);
        };
      }, forceAA === 'on');
    }
    await page.goto(base);
    await page.evaluate((q) => {
      const s = JSON.parse(localStorage.getItem('homewater.settings') ?? '{}');
      if (q !== 'baseline') s.quality = q;
      localStorage.setItem('homewater.settings', JSON.stringify(s));
      localStorage.removeItem('homewater.quality.auto');
    }, preset);
    await page.reload();
    await page.click('#btn-new');
    await page.click('[data-preset="quick"]');
    await page.click('#btn-setup-next');
    await page.click('#btn-accept-name');
    const row = { preset, cells: {} };
    for (const stage of STAGES) {
      await page.click('#btn-play');
      if (only && !only.includes(stage)) {
        // Not measured: pass straight through.
        await page.evaluate(() => window.__hw?.completeStage());
        continue;
      }
      await page.evaluate(() => window.__hw?.step(90));
      // Shader compiles are slow in software GL (seconds each): let them finish
      // before measuring, by waiting and then for a few more frames to be drawn.
      await page.waitForTimeout(3000);
      await page.evaluate(() => new Promise((done) => {
        let n = 0;
        const f = () => (++n >= 4 ? done() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }));
      const m = await page.evaluate(async (ms) => {
        const r = window.__hw.app.renderer;
        let frames = 0;
        let calls = 0;
        let tris = 0;
        const t0 = performance.now();
        await new Promise((done) => {
          const tick = () => {
            frames++;
            calls = Math.max(calls, r.renderer.info.render.calls);
            tris = Math.max(tris, r.renderer.info.render.triangles);
            if (performance.now() - t0 < ms) requestAnimationFrame(tick);
            else done();
          };
          requestAnimationFrame(tick);
        });
        const fps = frames / ((performance.now() - t0) / 1000);
        // GPU time for one frame, without the browser's frame pacing: render, then wait
        // for it with a one-pixel read. The fastest of a few, as the machine may be busy.
        const app = window.__hw.app;
        const mode = app.mode;
        app.mode = 'paused';
        const gl = r.renderer.getContext();
        const px = new Uint8Array(4);
        let gpu = Infinity;
        for (let i = 0; i < 6; i++) {
          const s = performance.now();
          r.renderer.render(r.scene, r.camera);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          if (i > 0) gpu = Math.min(gpu, performance.now() - s);
        }
        app.mode = mode;
        return { fps, ms: gpu, calls, tris, level: app.graphics?.describe() ?? '-', stage: window.__hw.state()?.stage, status: window.__hw.state()?.status };
      }, seconds * 1000);
      if (shots) {
        mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: `${shots}/quality-${preset}-${stage}.png`, timeout: 90_000 });
      }
      row.cells[stage] = m;
      process.stderr.write(`${preset} ${stage} (${m.stage}, ${m.status}): ${m.fps.toFixed(1)} fps, ${m.ms.toFixed(0)} ms/frame GPU, ${m.calls} calls, ${m.tris} tris, ${m.level}\n`);
      // A fish killed while measuring cannot complete the stage: carry on with a sibling.
      await page.evaluate(() => {
        const w = window.__hw?.app.world;
        if (w && w.status === 'dead' && w.canContinueWithSibling()) w.continueWithSibling('Sib');
        window.__hw?.completeStage();
      });
    }
    rows.push(row);
    await page.close();
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}

console.log(`| Preset | ${STAGES.join(' | ')} |`);
console.log(`|---|${STAGES.map(() => '---').join('|')}|`);
for (const r of rows) {
  const cells = STAGES.map((s) => {
    const c = r.cells[s];
    if (!c) return '-';
    return `${c.status === 'playing' ? '' : `(${c.status}) `}${c.fps.toFixed(1)} fps · ${c.ms.toFixed(0)} ms · ${c.calls} dc · ${(c.tris / 1000).toFixed(0)}k tri${r.preset === 'auto' ? ` (${c.level})` : ''}`;
  });
  console.log(`| ${r.preset} | ${cells.join(' | ')} |`);
}
