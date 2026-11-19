# Homewater: handbook for coding sessions

Read this first in every session, and update the decision log at the end of it.

## What this is

Homewater is a 3D sockeye salmon lifecycle simulator for desktop browsers. It is a free passion project. The owner is not a programmer, so every milestone ends with a playable build and a short checklist the owner can try in the browser.

## Design documents

- `docs/DESIGN.md`: the design brief. It is the source of truth for what the game is.
- `docs/STAGES.md`: one table per stage: verb, decision, threats, failure, length.
- `docs/ADVISOR_NOTES.md`: answers from the scientific advisor, and how each one is applied. Biology follows these notes.
- `docs/milestones/`: the checklist for each milestone.

## Commands

```
npm install
npm run dev        # local dev server
npm test           # unit tests (Vitest), simulation only
npm run build      # typecheck + production build to dist/
npm run smoke      # browser smoke tests (Playwright); builds must exist first
npm run verify     # all of the above, in order
```

Add `?debug=1` to the URL for the playtest panel.
- **Stage select:** jump to any stage.
- **Complete stage / kill fish:** finish or end the current life.
- **Trait editor:** edit the current fish's traits.
- **Run report:** copy a summary of the run.
- **Stats:** frames per second and draw calls.

`window.__hw` is always available for tests (see `src/debug/debug.ts`).

## Architecture

```
src/sim/      pure TypeScript simulation. No three.js, DOM or browser APIs (a unit test enforces this).
  world.ts      one life: fixed-step loop, entities, events, checkpoints, siblings
  swim.ts       swimming physics shared by all swimming stages
  stages/       one file per stage (egg, fry, smolt, ocean, return, spawn)
  genetics.ts   breeding values, heritability, jack threshold model, offspring
  lineage.ts    the bloodline across lives: founding, records, offspring choice, strays
  params.ts     loads and validates src/data/params.json
  rng.ts        seeded random numbers; all chance goes through World.rng
src/render/   three.js; reads sim state, never writes it
  Renderer.ts   scenes per arena, entity meshes, camera
  fishMesh.ts   procedural salmon: lofted body, vertex-shader swimming, colours by stage
src/app/App.ts  screens, the main loop, saving, life-to-life flow
src/save/     IndexedDB saves with schema version, migrations, export/import
src/input/    keyboard and mouse to Intent
src/ui/       DOM helpers, player-facing text, styles
src/data/     params.json (every number), captions.json (every caption, by stable ID)
tests/unit/   Vitest: simulation, genetics, tuning sanity, purity
tests/smoke/  Playwright: boots the real build, plays a life, checks saves
```

## Rules

1. **No magic numbers in game logic.** Biology, tuning and difficulty values go in `src/data/params.json`. Each entry records units, range, source and whether it is a placeholder. A test fails if code asks for an id the file lacks.
2. **The simulation is pure.** `src/sim` must not import three.js or touch the DOM. All randomness uses the world's seeded `Rng`.
3. **Captions have stable IDs** in `src/data/captions.json`. Never inline player-facing science text in code. Recorded narration will be matched to these IDs (`audio/<id>.mp3`).
4. **Saves are versioned.** Any change to saved data bumps `SCHEMA_VERSION` in `src/save/save.ts` and adds a migration with a test.
5. **Every milestone keeps a whole life playable.** Never break the egg-to-spawn loop.
6. **Accuracy.**
   - The advisor's answers in `docs/ADVISOR_NOTES.md` override earlier assumptions.
   - Don't state biology the notes don't support.
   - The advisor prefers not to be credited and asked us not to contact anyone they know.
7. **Pin dependency versions exactly.** Three.js is pinned at 0.180.0, using the WebGL renderer only (not WebGPU or TSL).

## Definition of "verified"

A change is verified only when all of these hold:
- `npm run verify` passes: typecheck, unit tests, build and smoke tests.
- The smoke screenshots in `tests/smoke/screenshots/` have been looked at.
- Anything about feel goes on the owner's checklist. Only the owner signs off on feel.

## Hosting

GitHub Pages, deployed by `.github/workflows/pages.yml` on pushes to `main`. The Vite `base` is `./` (relative), so the same build works under any repo name.

- **Development:** the private repo `sales-sparring`. It stays private.
- **Public site:** the public repo `homewater` gets clean snapshots of the source, without the private history. It serves the site at `ajacobscoldcall-boop.github.io/homewater`.

## Decision log

- **M1:** Three.js with plain WebGL, TypeScript strict, Vite, Vitest, Playwright.
- **M1:** Simulation updates at a fixed 60 Hz. The renderer reads it every frame.
- **M1:** The third-person camera sits behind and above the fish, so the whole body reads. First-person is a toggle (V).
- **M1:** Jack maturation uses a liability threshold model, calibrated to the habitat's base rate. Growth raises liability.
- **M1:** Applied the advisor's answers:
  - Char, not trout, hunt fry.
  - Jack base rate lowered to 4% in creeks, with 1-2% typical run-wide.
  - About 60% of non-jacks spend 2 years at sea.
  - Gillnets snag larger males more.
  - A blush on the return, with full spawning colours only on the grounds.
  - Adipose fin added.
  - Trawl encounter dropped.
- **Post-M1 groundwork (approved while waiting for owner feedback):**
  - The alevin stage is now about orienting to current and light.
  - The smolt run is now a gauntlet with a shielding school.
  - Energy recovers while cruising.
  - Underwater look: caustics, light shafts, Snell's window surface, marine snow, depth tint.
  - On-screen threat markers and edge arrows.
  - Stage-end captions carry onto the next stage card.
- **Advisor round 2:**
  - Alevin swim toward the light.
  - Sizes 0.4 / 0.67 / 1.0.
  - Ocean ages split evenly.
  - Jack heritability 0.4.
  - Dolly Varden in the lake.
  - The smolt run is at night.
  - The ocean is kept to the top 30 m, with a salmon shark and alternating pink years.
  - Each extra year at sea carries survival risk.
  - Cobble-size gravel.
  - Tail fork and eye size by stage.
- **Return rebuilt around navigation:**
  - A magnetic track with markers shown when near.
  - Three river mouths, where wrong rivers dead-end.
  - Nets on the approach.
  - The home river with bears and a fork.
- **Saves:** `YearConditions` is unchanged in shape. `rollYear` now takes the generation for the pink-salmon alternation.
- **Spawning:**
  - Large-male fights are a logistic model of size, side-on angle and timing.
  - Bears on the grounds pick targets weighted male > female > jack.
  - Jacks compete for three hiding spots under the bank.
  - Rivals are drawn at their real size.
- **Narration:**
  - Recorded lines play from `public/audio/<id>.mp3` when listed in `public/audio/manifest.json`.
  - `npm run narration:script` rebuilds `docs/narration/recording-script.md`.
  - `npm run narration:manifest` lists recorded files.
- **Public repo:** the advisor is cited only through published papers. The briefs written to them are kept out of the repo.
- **Hosting:** relative base path. The public site lives in the separate `homewater` repo as clean snapshots; `sales-sparring` stays private.
