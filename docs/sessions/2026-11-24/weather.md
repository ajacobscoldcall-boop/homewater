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

Branch: claude/hw-weather. Smoke port: 4215.
Parallel sessions this round (stay out of their files; keep edits to shared files such as Renderer.ts, App.ts, params.json, captions.json, journal.json, tutorial.ts, lifeMap.ts, bots.ts small and additive): ocean journey (claude/hw-ocean, ocean.ts and ocean rendering), egg threats (claude/hw-egg, egg.ts), warm-year realism (claude/hw-heat, returnWater.ts and heat), changing river mode (claude/hw-change, population/lineage/setup; the only session allowed to change saved data, schema 8), weather and the world above (claude/hw-weather, render only), sound (claude/hw-sound, src/audio only), science integrity (claude/hw-science, captions/journal/docs).

Track 3 of docs/IMPROVEMENT_PLAN.md (items 3.3 and 3.4): light, weather and the world above the water. Render only: do not change the simulation.

Your task:
1. Weather and season, read from the stage and the year's conditions (flow, temperature) and the stage's time of day: overcast days (flatter light, darker surface, softer shafts), rain on the surface (rings and a speckled Snell's window, a hiss handled by the sound session via one hook, leave a stub), a wind-ruffled surface, and in the fry stage's winter, ice seen from below (the window frosted, light through it blue-white, cracks).
2. The world above, seen when the fish is near the surface and in cinematic shots: banks with trees, bears on the bank where the sim has them (already partly in above.ts), and people at the nets on the return's coast (boats and floats seen from below; a shadow of a hull), all built in code and cheap on Low.
3. Keep a coherent look across stages; check every stage at every quality preset; numbers in docs/performance.md.
4. Shots in docs/gallery/weather-*.png and above2-*.png, checklist items for the look.
