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

Branch: claude/hw-text. Smoke port: 4195.
Parallel sessions: menus and one Settings screen (claude/hw-menus), offspring choice, recap and life map (claude/hw-recap). Already merged and to build on: the split (src/app/screens/, src/app/messages.ts), the play log, the scale pass, and the camera, Documentary view and always-visible energy and fat rings (src/ui/vitals.ts).

Your task: Track 1 items 2, 5 and 9 of the plan: the text diet, the stage cards and onboarding.
1. Text diet, built on src/app/messages.ts (every caption, flash, journal toast and Field guide prompt already goes through it):
   - One caption at a time from a priority queue (warnings first, then guide-critical lines, then science). Lower-priority lines that would wait too long go to the journal instead of the screen. Keep the narration matching (a recorded line plays for the caption shown).
   - The Field guide step and the caption must never say the same thing: merge or drop the duplicate (for example the egg stage's guide "Wait. An egg can do little but wait" beside the caption "There is little an egg can do but wait").
   - Journal toasts batched into one small chip ("3 new journal entries", J to open).
   - Captions shorter and moved off the centre of the action (the review found up to three caption boxes plus three toasts plus the guide box at stage starts, over the lower middle where the fish is). A long science line can be expanded ("more") or read in the journal.
   - Respect the Readability settings (caption size and background) and reduced motion.
2. Stage cards: one line of place and season, one plain line about this year, and a "This year" link that opens the full year effects (bet hedging, population lines). The bet-hedging explanation should be readable on the recap later; leave a hook for the recap session (claude/hw-recap) rather than editing the recap yourself.
3. Onboarding: the first minute of a Field guide first life teaches steering, depth and burst by doing (short objectives that complete when done), with a simple picture of the controls (drawn in HTML/SVG, using the player's own key bindings via the existing {key:action} placeholders). Mouse steering explains pointer lock the first time it is used. Keep G to skip the guide.
4. Caption text changes: keep stable IDs where the meaning is unchanged; new or shortened lines get new IDs in captions.json, and run the narration script tool (node scripts/recording-script.mjs) so docs/narration stays in step.
5. Screenshots of every stage start before and after in docs/gallery/text-*.png, checklist items, a unit test for the caption queue.
