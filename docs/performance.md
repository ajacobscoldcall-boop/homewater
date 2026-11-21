# Performance and graphics quality

Homewater should run on slower laptops with integrated graphics. This page
explains how the graphics settings work, how we measure them, and what we found.

## Settings

The **Graphics** tab of **Settings** (from the title screen and the pause menu, Esc) offers
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
- **The spawning grounds at Low** were the slowest Low stage (6.9 fps). The
  CPU profiling below found the cause, shader recompiles; it is fixed.
- **The first time an animal appears** in a stage (the first bear on the grounds,
  say), its shaders still compile then: on software GL a frame or two of 100 to
  300 ms. Warming them up while the stage card shows would remove this.
- **The ocean draws about 500,000 triangles** at every level (the krill swarm,
  14 krill around each of up to 160 food patches) and is the slowest Low stage
  now (13 fps, 47 ms of GPU time). Low could draw fewer krill per patch, the way
  it thins schools; that changes the look of Low, so it is left for the owner.
- **Numbers from this sandbox are noisy** (see the caveat above). Real numbers
  should come from the owner's laptop: item 21 of the M1 checklist.

## CPU profiling (November 2026)

Tools:

```
npx vite-node scripts/simbench.ts                       # World.step cost per stage, in Node
npx vite build --minify false --outDir /tmp/hw-prof      # readable function names
PW_PORT=4183 node scripts/profile.mjs --dir=/tmp/hw-prof [--stages=spawn] [--trace] [--swim] [--out=dir]
PW_PORT=4182 npm run perf -- low medium --dir=<build>    # fps; --dir compares an older build
```

`scripts/profile.mjs` drives a quick-start life through the stages with
`window.__hw`, and records a V8 CPU profile of 10 seconds of each stage over the
Chrome DevTools Protocol. It prints the top functions by self and total time;
`--trace` adds the main thread's timeline and the busiest other threads (compositor,
GPU); `--out` saves `.cpuprofile` files for Chrome DevTools.

### What it found

1. **The simulation is not the cost.** `World.step` takes 1 to 15 µs a step in Node
   (egg 1.2, fry 2.3, smolt 15, ocean 12, return 4.3, spawning grounds 2.0 µs).
   That is under 0.1% of a frame.
2. **Script is small everywhere.** All JavaScript, three.js included, took 20 to
   55 ms per second of play (2 to 4 ms a frame). The main thread spent most of the
   rest waiting on the software GPU process (the trace's `Commit`, and a
   `ReadPixels` of the canvas, which software compositing does every frame).
3. **Shader programs were compiled again and again.** three.js deletes a shader
   program when the last material using it is disposed, and compiles it afresh for
   the next one. Under software GL a compile stalls the page for 100 to 400 ms.
   - **Egg stage:** the alevin's mesh is rebuilt each time its yolk sac shrinks a
     step, so its material, and with it the fish shader, was rebuilt about every
     0.6 seconds. That was 82 compiles in 25 seconds.
   - **Spawning grounds:** each bear that came and went took its three programs
     with it, and the next bear compiled them again. A bear's body, head and arm
     share one material, which was disposed three times over.
   - In the profiles this showed as `getProgramInfoLog`, `includeReplacer` and
     `shaderSource`, and as frames of 200 to 485 ms.
4. **The HUD rebuilt its DOM every frame:** the name line (`innerHTML`, then new
   nodes), the meter bars, and every threat marker. That cost script time, style and
   layout work, and garbage collection. `updateHud` was the top app function in
   the fry, return and spawning profiles (1 to 3 ms/s of self time).
5. **Smaller per-frame allocations:** `syncEntities` made a new Map and Set every
   frame, the camera made six vectors, and weed and the magnetic track made a new
   Euler for every instance.

### What changed

- **`src/render/programKeeper.ts`:** when a material is released, the
  last one holding its compiled program is kept, never drawn, so the program stays
  compiled. At most one material is kept per program. The Renderer releases
  materials through it (entities leaving, the player's mesh changing, stage
  rebuilds).
- **`src/ui/hudView.ts`:** HUD elements are looked up once. Text, the vignette's
  opacity and the bars are written only when they change, and threat markers are
  kept in a pool and updated in place, with the same markup.
  - **Side effect:** a marker's ring now pulses as `styles.css` intends. Before,
    the element was made new every frame, so the pulse never got past its first
    keyframe.
- **Renderer:** the per-frame Map, Set, vectors and Eulers are now reused scratch
  objects.
- **The simulation is untouched.** `tests/unit/determinism.test.ts` runs each
  stage (and the spawning grounds as female, large male, jack and on Wild) for
  2,400 scripted steps with fixed seeds. It hashes the whole world state four
  times per run and compares the hashes with values recorded before this work.

### Results

Run on this sandbox: 4 shared cores, load average 1.5 to 3.4. Before and after
were alternated, two rounds each, with `npm run perf` and `--dir`. Each cell
gives both rounds: **fps** at 1280×720, SwiftShader.

| | Egg | Fry (lake) | Smolt run | Ocean | Return | Spawning |
|---|---|---|---|---|---|---|
| **Low, before** | 15.9 / 18.8 | 23.1 / 31.1 | 28.6 / 39.2 | 13.1 / 14.4 | 18.2 / 24.7 | 21.0 / 31.1 |
| **Low, after** | 34.6 / 32.2 | 33.0 / 38.0 | 24.7 / 32.4 | 8.6 / 13.0 | 30.5 / 35.0 | 31.2 / 34.3 |
| **Medium, before** | 8.8 / 10.0 | 11.5 / 11.9 | 10.4 / 12.6 | 7.9 / 7.9 | 11.7 / 11.1 | 11.5 / 11.2 |
| **Medium, after** | 13.0 / 13.1 | 10.9 / 11.8 | 11.1 / 7.5 | 7.9 / 8.3 | 12.7 / 11.3 | 12.2 / 13.4 |

GPU time per frame and draw calls did not change.

Medium is GPU-bound (45 to 85 ms of GPU time a frame), so cheaper script barely
shows there. The egg stage is the exception, because a recompile costs the GPU
process too.

The differences at the smolt run and the ocean are within run-to-run noise; the
same build varied by up to 40% between rounds.

**Stalls** matter more than average fps for how the game feels. These runs kept
the fish alive for 25 seconds at Low, counting shader compiles and frames over
100 ms:

| | fps | frames over 100 ms | worst frame | shader compiles |
|---|---|---|---|---|
| Egg, before | 20.9 | 41 | 304 ms | 82 |
| Egg, after | 33.0 | 0 | 59 ms | 0 |
| Spawning, before | 25.1 | 30 | 375 ms | 12 |
| Spawning, after | 30.0 | 19 | 276 ms | 6 (the first bear's, once) |

**Top app functions by self time, after** (ms per second of play):

- `updateHud` dropped out of every stage's top ten.
- The egg stage's shader-compile entries are gone.
- What remains is three.js's draw loop (`bufferSubData`, `setProgram`), garbage
  collection (3 to 9 ms/s), and in the ocean the krill swarm's update (about
  4 ms/s with its hash).

The 6.9 fps measured earlier for the spawning grounds came from a heavily loaded
run (load average 9 to 19) plus these recompile stalls. On a quieter machine the
before build reaches 21 to 31 fps there.

## Scale and fish looks (2026-11-20)

Life-size krill use a lean play model (about 160 vertices, no antennae or legs) and
the rest of the swarm is one points draw, so the ocean's triangle count fell from
472k to 121k on Low. Fry plankton is one points draw instead of instanced spheres.
Measured with `node scripts/perf.mjs low --seconds=4` (SwiftShader), before (the
starting commit, built with `--dir`) and after:

| Low | egg | fry | smolt | ocean | return | spawn |
|---|---|---|---|---|---|---|
| before | 45.1 fps · 10 dc | 24.0 fps · 22 dc | 23.2 fps · 28 dc | 17.7 fps · 10 dc · 472k tri | 21.2 fps · 41 dc | 26.2 fps · 35 dc |
| after | 46.7 fps · 11 dc | 24.4 fps · 21 dc | 28.2 fps · 27 dc | 36.5 fps · 11 dc · 121k tri | 23.4 fps · 25 dc | 29.7 fps · 39 dc |

High on the stages touched (egg, fry, smolt, ocean) was within run-to-run noise,
except the ocean, which went from 13.9 to 16.3 fps.

## The lake at the end of the return (2026-11-21)

The return now ends with a crossing of the nursery lake (`src/render/env/lakeHome.ts`).
`npm run perf -- low medium high --stages=return --lake` measures the return in the
lake instead of at sea. Headless software GL on a busy machine; frame rates moved a lot
between runs, so the GPU time per frame and draw calls are the steadier numbers.

| Preset | Return at sea (start) | Return in the lake |
|---|---|---|
| Low | 10.0-13.5 fps · 29 ms · 28-48 dc · 24-32k tri | 7.6-21.9 fps · 19-24 ms · 21-22 dc · 32k tri |
| Medium | 6.8 fps · 81 ms · 39 dc · 42k tri | 4.3-6.5 fps · 83 ms · 27 dc · 64k tri |
| High | 6.5 fps · 102 ms · 86 dc · 148k tri | 3.9 fps · 106 ms · 46 dc · 151k tri |

The lake is no heavier on Low than the start of the return: fewer draw calls and less
GPU time per frame. Its terrain is cut into 34-unit chunks along x and its scatter is one
instanced draw per kind (the open lake gains nothing from finer culling cells).
## Crowded spawning grounds (2026-11-21)

The grounds now hold a crowd of other spawners (Track 2.2): 36 fish in a typical
year, up to 110 in a big run, plus their redds and the dead. Each crowd kind is one
instanced draw (`src/render/crowd.ts`), so draw calls rose by 6 to 8. To keep the
triangle count down the crowd uses the simple fish model (about 1,100 triangles
against 5,000) except on High, draws a share of the fish per preset
(`CROWD_FX.drawn`: Low 35%, Medium 60%, High all; chosen by id so the same fish
stay drawn) and is shaded with Lambert on Low. The sim's step with the biggest
crowd stays well under a millisecond (`tests/unit/crowd.test.ts`).

Measured with `node scripts/perf.mjs low medium --seconds=5 --stages=spawn --run=1`
(and `--run=2.4` for a big run) under SwiftShader, before (the starting commit,
built with `--dir`) and after, three runs each; medians, with the GPU time per
frame and the triangle count. Software GL frame rates swing a lot from run to run
here (the same build gave 3 to 16 fps on Low), so read the medians loosely.

| Spawning grounds | Low typical | Low big run | Medium typical | Medium big run |
|---|---|---|---|---|
| before | 13.1 fps · 28 ms · 42 dc · 43k tri | 12.3 fps · 27 ms · 42 dc · 41k tri | 6.2 fps · 98 ms · 47 dc · 121k tri | 4.5 fps · 102 ms · 47 dc · 126k tri |
| after | 14.6 fps · 31 ms · 47 dc · 62k tri | 14.0 fps · 34 ms · 54 dc · 87k tri | 5.6 fps · 108 ms · 53 dc · 158k tri | 5.8 fps · 122 ms · 55 dc · 200k tri |

On Low the frame rate is level with before in both years; GPU time is up about
10-25%. On Medium a typical year is about 10% slower by GPU time and frame rate,
a big run about 20% by GPU time. Earlier tries (Lambert on Medium too, Medium at
45%) made no difference beyond the noise, so Medium keeps the standard material and
60%. Real graphics hardware should not notice 200k triangles; the owner's own
frame rate on Low and Medium is checklist item "Frame rate" under Crowded spawning
grounds.
