# Performance and graphics quality

Homewater should run on slower laptops with integrated graphics. This page
explains how the graphics settings work, how we measure them, and what we found.

## Settings

The **Graphics** row on the title screen and in the pause menu (Esc) offers
**Auto** (the default), **Low**, **Medium** and **High**. The choice is saved
with the other settings in this browser's localStorage, not in the lineage save.
The `?debug=1` panel shows the level in use, e.g. `graphics Auto: Medium`.
`?quality=low|medium|high|auto` in the address overrides the saved choice for that
load, which is useful for review screenshots (headless Chromium uses software GL,
so Auto would pick Low there).

| | High | Medium | Low |
|---|---|---|---|
| Pixel ratio (HiDPI screens) | up to 1.5 | 1 | 1, drawn at 80% and scaled up |
| Antialiasing | on | on | off |
| Bottom shading | physically based | Lambert | Lambert |
| Caustics on the bottom | full (3 steps) | lighter (2 steps) | off |
| Light shafts | 10 | 5 | 0 |
| Marine snow particles | 700 | 400 | 200 |
| School fish drawn (herring, smolts, pinks) | all | 3 in 4 | 1 in 2 |
| Detail of other fish (rivals, mates, char, pinks) | high | high | low |
| Fog | as designed | as designed, far clip | 12% thicker, far clip |
| `quality.envDetail` for environment art | 2 | 1 | 0 |

- **High** looks as it did before the settings existed.
- **Low** keeps every threat readable: predators and rivals are still drawn in
  full, the threat markers are on-screen overlays, and only scenery is thinned.
- **The simulation never changes.** Low draws half of each school, but the world
  still has every fish, and the shielding school protects you just the same.
- **Antialiasing** is fixed when the WebGL context is made. Changing it takes
  effect the next time the game loads, and the menu says so.
- **No shadows** are used at any level.

### Auto

Auto (`src/render/autoQuality.ts`, unit tested) times frames only while a stage is
being played:

1. It skips a 2-second warm-up after each start, stage change, pause or step down,
   to let shaders compile.
2. It measures for 2.5 seconds.
3. If the median frame rate is under 48 fps, it steps down one notch: High to
   Medium, then Medium to Low, then lower resolution at Low (×0.85 a step, down to
   70% of Low's own scale).

Auto starts at **High**, or at **Low** when the browser draws WebGL in software
(SwiftShader or llvmpipe, as when a graphics driver is blocklisted). Auto never
steps back up during a session, so it cannot flip back and forth. A
few slow frames (a shader compile) do not count, because it uses the median.
Where it ended up is remembered in localStorage (`homewater.quality.auto`), so the
next load starts there with the right antialiasing.

### For render code

`src/render/quality.ts` exports the live `quality` object. Read it when building
a scene. When a field that shapes the scene changes, Renderer rebuilds the stage,
so anything built in `buildStage` picks up the new values. Environment art
(banks, boulders, logs, weed beds) should scale with `quality.envDetail`:
0 sparse, 1 some, 2 full.

## How we measure

```
npm run build
PW_PORT=4182 npm run perf -- low medium high auto [--seconds=3] [--stages=fry,ocean] [--shots=dir]
PW_PORT=4182 node scripts/quality-shots.mjs docs/gallery    # Low vs High screenshots
```

`scripts/perf.mjs` plays a life in headless Chromium at 1280×720 with
**SwiftShader**, which draws on the CPU. That makes it a harsh stand-in for a weak
GPU. For each stage, it does the following:

1. Starts the stage and runs 90 simulation steps.
2. Waits 3 seconds and 4 more frames, so shader compiles are over.
3. Counts frames for 3 seconds (**fps**).
4. Times one frame drawn and waited for: render, then a one-pixel read, fastest of 5 (**GPU ms**).
5. Records draw calls (**dc**) and triangles per frame.

**Caveat:** this sandbox has 4 cores shared with other jobs, with a load average of
9 to 19 during these runs. Repeated runs of the same build varied by 2× or more.
Compare presets within a run, not the absolute numbers. On a real integrated GPU,
every number should be far higher.

## Results (SwiftShader, 1280×720)

Each cell: **fps** · **GPU ms** per frame · **draw calls** · triangles. "Stuck"
means the page stopped responding at that preset (clicks timed out, or the tab
crashed), so the later stages could not be reached.

| Preset | Egg | Fry (lake) | Smolt run | Ocean | Return | Spawning |
|---|---|---|---|---|---|---|
| **Low** | 15.6 · 29 · 7 · 10k | 8.8 · 12 · 7 · 12k | 16.4 · 13 · 14 · 34k | 14.9 · 16 · 5 · 64k | 15.7 · 14 · 21 · 40k | 6.9 · 14 · 17 · 21k |
| **Medium** | 10.5 · 79 · 7 · 10k | 1.1 · 63 · 12 · 16k | 6.6 · 64 · 19 · 56k | 1.1 · 59 · 10 · 82k | 6.9 · 61 · 29 · 40k | 4.4 · 77 · 22 · 23k |
| **High** | 4.6–4.8 · 84–88 · 7 · 11k | 0.3–0.4 · 112–135 · 17 · 16k | 0.0 · 190 · 41 · 66k | 0.3 · 344 · 15 · 101k | stuck | stuck |
| Before this work | 5.3 · 157 · 7 · 11k | 0.0 · 1210 · 17 · 16k | stuck | stuck | stuck | stuck |
| Before this work (short first run) | 6.8 fps · 6 dc | 0.7 · 17 dc | 0.3 · 42 dc | 0.4 · 15 dc | 1.6 · **152 dc** | 0.7 · 27 dc |

High was measured in three runs (one crashed after the smolt run, one got stuck after
the ocean), which is why some cells are ranges. The last row came from an earlier,
quicker version of the script (2-second windows, no wait for shaders), so it only
shows fps and draw calls.

**Auto** on this machine (a later run, at a lower load average of about 7):

- It noticed software GL and started at Low.
- It stepped to 68% resolution during the egg stage, and to its floor of 56% by
  the lake.
- Frame rates: egg 18.9 fps, fry 5.5, smolt run 13.8, ocean 33.7, return 32.5,
  spawning 46.3 fps (8 to 21 ms per frame, 5 to 18 draw calls).

Before software GL was detected, Auto started at High. It stepped down to Low and
then 56% within the egg stage, but the context it was made with kept antialiasing,
so later stages stayed below 1 fps. That is why Auto now remembers its level, and
starts at Low under software GL.

**Antialiasing alone** (Low with antialiasing forced on, the same run without it):
fry 2.0 vs 7.5 fps, ocean 0.1 vs 1.5 fps. Under software GL, antialiasing is
the second biggest cost, after caustics.

Screenshots of the ocean (an orca charging) and the spawning grounds (a bear at the
bank) at both ends: `docs/gallery/quality-low-ocean.png`,
`quality-high-ocean.png`, `quality-low-spawn.png` and `quality-high-spawn.png`.
On Low, the orca, the herring, the bear and every threat marker still read
clearly; the bottom is flat and there are no light shafts.

## What we found and fixed

1. **Caustics on the bottom were the biggest cost.** The caustic pattern costs nine
   sines and cosines per pixel, and the bottom covers most of the screen,
   especially in the lake.
   - In the fry stage at High, hiding the bottom took the frame rate from about 2 to
     11–19 fps. Keeping the bottom without caustics gave 7–12 fps.
   - Timing frames one at a time understated this badly. The cost only shows when
     frames are actually put on screen.
   - **Fixes:**
     - On every level, the shader now skips the pattern wherever depth, darkness
       and fog leave it under 1/255 of brightness, so High looks the same.
     - Medium uses a two-step pattern on Lambert shading.
     - Low has none.
2. **Antialiasing and pixel count come next.** Low turns antialiasing off and
   draws 64% of the pixels (80% in each direction). High caps HiDPI screens at
   1.5×, as before; Medium caps them at 1×.
3. **Draw calls.** Each gillnet float was its own mesh with its own material:
   the return stage made 152 draw calls. The floats on each net span are now one
   instanced mesh, with the same look. Medium's return now makes 29 draw calls and
   Low's 21. High's return could not be measured here; it should be about 34
   (Medium plus five more light shafts). All other stages stay under 45.
4. **Per-frame allocations.** `Renderer.project` (called for every threat marker
   every frame) allocated three vectors per call; it now reuses them. Script time
   per frame was small to begin with (under 5 ms), so this matters for garbage
   collection pauses rather than frame rate.
5. **Shader compiles** take seconds each in software GL. Auto ignores the first
   2 seconds after each change and judges by the median, so a compile does not
   make it step down. The perf script waits for them too.

## Still weak

- **High under software GL is unplayable**, and High in the lake and ocean
  can stall the page. A browser without hardware graphics now starts Auto at
  Low, so most such players will never see this.
- **Medium's caustics** are still the main cost of Medium. On a real integrated
  GPU, nine sines a pixel should be cheap; on SwiftShader they are not. If the
  owner reports a slow Medium, drop Medium's caustics to 0.
- **The spawning grounds at Low** were the slowest Low stage (6.9 fps), though
  each frame drew in only 14 ms. Something besides drawing (bears, rivals or
  page overlays) costs time there; not yet found.
- **Numbers from this sandbox are noisy** (see the caveat above). Real numbers
  should come from the owner's laptop: item 21 of the M1 checklist.
