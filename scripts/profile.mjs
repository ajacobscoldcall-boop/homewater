/**
 * CPU profiles of each stage in headless Chromium (SwiftShader), through the Chrome
 * DevTools Protocol: where the main thread spends its time while a stage is played.
 *
 *   npx vite build --minify false --outDir /tmp/hw-prof      # readable function names
 *   PW_PORT=4183 node scripts/profile.mjs --dir=/tmp/hw-prof [--quality=low] [--seconds=10]
 *        [--stages=spawn] [--sex=F|M] [--top=15] [--trace] [--out=profiles/]
 *
 * For each stage it starts a quick-start life, jumps there, lets shaders compile,
 * then records a V8 CPU profile for the given seconds while the stage plays
 * (with --swim the fish swims forward via simulated key presses; otherwise it idles,
 * as in scripts/perf.mjs).
 * It prints frames per second, the top functions by self time, the top
 * functions by total time, and (with --trace) the main thread's time per
 * timeline event (script, style, layout, paint, GC). --out saves .cpuprofile
 * files that open in Chrome DevTools' Performance panel.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d;
const port = Number(process.env.PW_PORT ?? 4183);
const dir = opt('dir', 'dist');
const quality = opt('quality', 'low');
const seconds = Number(opt('seconds', 10));
const top = Number(opt('top', 15));
const sex = opt('sex', 'F');
const out = opt('out', '');
const trace = args.includes('--trace');
const swim = args.includes('--swim');
const only = opt('stages', '')?.split(',').filter(Boolean);
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

/** Self and total time per function from a V8 CPU profile. */
function summarise(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const key = (n) => {
    const f = n.callFrame;
    const file = f.url ? f.url.split('/').pop().split('?')[0] : '';
    return `${f.functionName || '(anonymous)'}${file ? ` ${file}:${f.lineNumber + 1}` : ''}`;
  };
  const selfBy = new Map();
  const totalBy = new Map();
  let all = 0;
  for (const [id, ms] of self) {
    all += ms;
    const n = byId.get(id);
    selfBy.set(key(n), (selfBy.get(key(n)) ?? 0) + ms);
    // Total time: credit every distinct function on the stack once.
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const k = key(byId.get(cur));
      if (seen.has(k)) continue;
      seen.add(k);
      totalBy.set(k, (totalBy.get(k) ?? 0) + ms);
    }
  }
  const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { all, self: sorted(selfBy), total: sorted(totalBy) };
}

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(base);
  await page.evaluate((q) => {
    const s = JSON.parse(localStorage.getItem('homewater.settings') ?? '{}');
    s.quality = q;
    localStorage.setItem('homewater.settings', JSON.stringify(s));
    localStorage.removeItem('homewater.quality.auto');
  }, quality);
  await page.reload();
  await page.click('#btn-new');
  await page.click('[data-preset="quick"]');
  if (sex === 'M') await page.click('[data-sex="M"]').catch(() => {});
  await page.click('#btn-setup-next');
  await page.click('#btn-accept-name');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  for (const stage of STAGES) {
    await page.click('#btn-play');
    if (only.length && !only.includes(stage)) {
      await page.evaluate(() => window.__hw?.completeStage());
      continue;
    }
    await page.evaluate(() => window.__hw?.step(90));
    await page.waitForTimeout(3000);
    await page.mouse.click(640, 360).catch(() => {});
    // Swim forward with a little turning, so the stage plays out as it would.
    let turner;
    if (swim) {
      await page.keyboard.down('KeyW');
      turner = setInterval(() => {
        page.keyboard.press(Math.random() < 0.5 ? 'KeyA' : 'KeyD', { delay: 150 }).catch(() => {});
      }, 1200);
    }
    // Trace events arrive in batches; keep only complete events and thread names.
    const events = [];
    const collect = ({ value }) => {
      for (const e of value) if ((e.ph === 'X' && e.dur) || e.name === 'thread_name') events.push({ name: e.name, ph: e.ph, dur: e.dur, pid: e.pid, tid: e.tid, args: e.name === 'thread_name' ? e.args : undefined });
    };
    if (trace) {
      cdp.on('Tracing.dataCollected', collect);
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,toplevel,viz,gpu', transferMode: 'ReportEvents' });
    }
    await cdp.send('Profiler.start');
    const fps = await page.evaluate(async (ms) => {
      let frames = 0;
      const t0 = performance.now();
      let worst = 0;
      let last = t0;
      await new Promise((done) => {
        const tick = () => {
          const now = performance.now();
          worst = Math.max(worst, now - last);
          last = now;
          frames++;
          if (now - t0 < ms) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      return { fps: frames / ((performance.now() - t0) / 1000), worst, stage: window.__hw.state()?.stage, status: window.__hw.state()?.status };
    }, seconds * 1000);
    const { profile } = await cdp.send('Profiler.stop');
    if (swim) {
      clearInterval(turner);
      await page.keyboard.up('KeyW');
    }
    let timeline = null;
    let threads = null;
    if (trace) {
      const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
      await cdp.send('Tracing.end');
      await done;
      cdp.off('Tracing.dataCollected', collect);
      const main = events.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
      const by = new Map();
      for (const e of events) {
        if (!main || e.pid !== main.pid || e.tid !== main.tid || e.ph !== 'X' || !e.dur) continue;
        by.set(e.name, (by.get(e.name) ?? 0) + e.dur / 1000);
      }
      timeline = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
      // Other threads (compositor, GPU): top-level busy time and their biggest events.
      const names = new Map();
      for (const e of events) if (e.name === 'thread_name') names.set(`${e.pid}:${e.tid}`, e.args?.name);
      const per = new Map();
      for (const e of events) {
        if (e.ph !== 'X' || !e.dur) continue;
        const t = `${names.get(`${e.pid}:${e.tid}`) ?? 'thread'} (${e.pid})`;
        if (t.startsWith('CrRendererMain')) continue;
        const m = per.get(t) ?? new Map();
        m.set(e.name, (m.get(e.name) ?? 0) + e.dur / 1000);
        per.set(t, m);
      }
      threads = [...per.entries()]
        .map(([t, m]) => [t, [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)])
        .sort((a, b) => (b[1][0]?.[1] ?? 0) - (a[1][0]?.[1] ?? 0))
        .slice(0, 5);
    }
    const sum = summarise(profile);
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(`${out}/${quality}-${stage}.cpuprofile`, JSON.stringify(profile));
    }
    results.push({ stage, fps, sum, timeline });
    const st = fps.status === 'playing' ? '' : ` (${fps.status})`;
    console.log(`\n### ${stage} at ${quality}: ${fps.fps.toFixed(1)} fps, worst frame ${fps.worst.toFixed(0)} ms${st}`);
    const busy = sum.self.filter(([k]) => k !== '(idle)').reduce((a, [, v]) => a + v, 0);
    console.log(`profiled ${(sum.all / 1000).toFixed(1)} s, busy ${(busy / 1000).toFixed(1)} s (${((busy / sum.all) * 100).toFixed(0)}%)`);
    console.log('\nSelf time:');
    for (const [k, v] of sum.self.slice(0, top)) console.log(`  ${(v / seconds).toFixed(1).padStart(7)} ms/s  ${k}`);
    console.log('\nTotal time:');
    for (const [k, v] of sum.total.filter(([k]) => !k.startsWith('(root)') && k !== '(idle)').slice(0, top)) console.log(`  ${(v / seconds).toFixed(1).padStart(7)} ms/s  ${k}`);
    if (timeline) {
      console.log('\nMain thread (trace):');
      for (const [k, v] of timeline) console.log(`  ${(v / seconds).toFixed(1).padStart(7)} ms/s  ${k}`);
      for (const [t, evs] of threads) {
        console.log(`\n${t} (trace, nested events overlap):`);
        for (const [k, v] of evs) console.log(`  ${(v / seconds).toFixed(1).padStart(7)} ms/s  ${k}`);
      }
    }
    await page.evaluate(() => {
      const w = window.__hw?.app.world;
      // A dead fish cannot be completed: carry on with a sibling first if there is one.
      if (w && w.status === 'dead' && w.canContinueWithSibling()) w.continueWithSibling('Sib');
      window.__hw?.completeStage();
    });
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}
