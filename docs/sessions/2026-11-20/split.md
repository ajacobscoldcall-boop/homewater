You are working on Homewater, a 3D sockeye salmon lifecycle game (TypeScript, three.js 0.180 WebGL, Vite, Vitest, Playwright). Start by reading CLAUDE.md (the handbook; follow its rules exactly) and docs/IMPROVEMENT_PLAN.md (the critical review and plan your task comes from, including the owner's decisions at the end).

Ground rules for this session:
- Work on the branch named below, created from the current claude/inspiring-heisenberg-gza4er. Commit as you go and push only to that branch. Do not open a pull request. Do not touch the public homewater repository or main.
- Other sessions are working in parallel on other parts of the plan (listed below). Keep your changes inside your scope, keep edits to shared files (src/app/App.ts, src/render/Renderer.ts, src/sim/stages/*.ts, params.json, captions.json, CLAUDE.md, docs/milestones/M1.md) small and localised so the coordinator can merge everything.
- The scientific advisor must never be named or credited in any player-facing or public text, and nobody they know may be contacted. Published papers may be cited in DESIGN.md sources and params.json.
- Do not state biology that docs/ADVISOR_NOTES.md does not support; anything new that is a simplification or game device goes into ADVISOR_NOTES.md as an Open question under a heading for your stream.
- Every number in game logic goes in src/data/params.json (with units, range, source, placeholder); every player-facing science line goes in src/data/captions.json by stable ID. Presentation tuning goes in a config file next to the render/UI code, not params.json.
- If you change the simulation on purpose, re-record only the determinism hashes that should change (tests/unit/determinism.test.ts) and say why in the comment. If you change saved data, bump SCHEMA_VERSION with a migration and test.
- Verified means: npm run verify passes (typecheck, unit tests, build, smoke). Run smoke with PW_PORT set to a free port (your port is given below) and, if the machine is busy, --workers 1. Look at the smoke screenshots and at your own review screenshots (use ?quality=high; save the ones worth keeping in docs/gallery/<stream>-*.png).
- At the end: add a decision-log bullet to CLAUDE.md for your stream; add owner checklist items for anything about feel to docs/milestones/M1.md under a new "### <stream name>" heading at the end of the "Try these" list, numbered from 101 (the coordinator renumbers); push; and finish with a short report: what changed, files touched, tests, screenshots, open questions, and anything you left undone and why.
- The owner is not a programmer: checklist items must say what to do and what to look for in plain words.

Branch: claude/hw-split. Smoke port: 4191.
Parallel sessions: play log (claude/hw-playlog), scale and fish looks (claude/hw-scale), camera and documentary view (claude/hw-camera). After yours merges, sessions will rework the menus, captions, stage cards, offspring choice and recap, all of which live in App.ts today.

Your task: Track 5 item 1 of the plan, the foundation the Track 1 UI work will build on. A pure refactor: the game must behave exactly as before.
1. Split src/app/App.ts (about 1,270 lines) into screen controllers, for example src/app/screens/ title, setup and naming, stage card, play (the loop and HUD wiring), death, end of life and recap, lineages; plus small shared modules (saving, settings) where that helps. App.ts keeps the app state, mode changes and the main loop and becomes a thin coordinator. Choose seams that make the planned UI work easy: one module per screen, each with a clear show/hide API, and the caption, toast and guide output going through one place (a small "messages" module) so a later caption queue can replace it.
2. Split src/sim/stages/spawn.ts (about 1,150 lines) by concern (female, large male, jack, bears, shared), keeping the stage's public API and behaviour identical.
3. Keep every determinism hash unchanged (tests/unit/determinism.test.ts must pass without re-recording) and every smoke test passing without changing what they assert. Add small unit tests where a seam makes something testable for the first time.
4. Update the Architecture section of CLAUDE.md to show the new layout.
Do this quickly and cleanly: other sessions are waiting on it. No behaviour, look or text changes.
