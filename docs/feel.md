# Feel pass

Before anyone had played Homewater with their own hands, this pass worked on how it feels moment to moment: the camera, steering, warnings before attacks, and feedback when something nearly gets you. Only the owner can sign off on feel. The checks are on the owner's checklist (`docs/milestones/M1.md`, "Feel pass").

Tools: `node tests/smoke/feel-shots.mjs` runs against a preview on port 4185 (`npx vite preview --port 4185`). It has two parts. `ONLY=camera` swims each stage into banks and the bed and reports how close the camera came. `ONLY=warnings` photographs each predator's warning from the default camera. `PARTS=fry,smolt,ocean,return,spawn` narrows the warnings part.

## Camera

**Before.** The camera hung on a fixed boom behind and above the fish, and its whole position was smoothed. It was clamped to stay above the sim's riverbed and under the surface, but it did not know about banks, rocks, logs or the sim's walls. Swimming along a bank or a lake beach put the camera inside the ground. The smoothed position also cut corners on turns, sometimes through scenery.

**Now** (`src/render/cameraRig.ts`, tuning in `cameraConfig.ts`; render only):
- **No clipping.** Each frame the camera checks the line from the fish out to the camera's spot against:
  - the scenery's ground, banks included;
  - the sim's walls;
  - solid scenery (rocks, logs, roots), with one ray against nearby meshes (`sceneryProbe.ts`).

  Terrain is checked through the ground function. Swaying plants are ignored, so swimming through weeds is fine.

  When something is in the way, the camera pulls in quickly. If that would put it too close, it rises toward the surface. If it is still cramped, it swings smoothly to one side, toward open water. Once the way is clear it eases back out slowly.
- **The surface is a hard line.** The camera always stays at least `surfaceMargin` below the surface, even when the fish is right at it.
- **Turns.** The camera's heading follows the fish's with a little lag (`yawFollow`). On a turn the fish swings across the frame and you can see which way it is going. The camera aims a little ahead of the fish and slightly down, so the fish sits near the middle of the frame, above the captions.
- **Reduced motion.** The camera follows turns more stiffly (`yawFollowReduced`) and never shakes.
- **First person (V)** and the egg stage's fixed view are unchanged.
- **Cinematics** still blend in on top of the play camera.

**Measured** (`feel-shots.mjs ONLY=camera`, 36 bursts of random turning, diving and rising into banks per stage):
- The camera never went into the ground, a wall or above the surface.
- The camera was never closer to the ground than 0.65 (fry), 0.67 (smolt), 1.7 (ocean), 1.8 (return) and 1.1 (spawn) units.

**Finding for the sim (fixed at merge).** In the lake, the sim used to let the fish swim up the beach where the bed rises above the surface, because `constrain` in `swim.ts` applied the surface limit after the floor limit. Now water too shallow for the fish stops it like a wall: it slides along the edge (`tests/unit/shallows.test.ts`). The return's banks had the same problem.

## Steering and swimming

**Findings** (`src/sim/swim.ts`, unchanged):
- **Turning:** a flat 2.4 rad/s whatever the speed. A burst covers more ground per turn, so fast turns are naturally wider. That reads well and needs no change.
- **Speed:** thrust 9 against drag 1.6 gives a cruising speed of about 5.6 units/s. The fish gets most of the way there, or back to rest, in about 0.6 s. That is responsive without feeling twitchy.
- **Burst:** ×2.3 (about 13 units/s), at a clear energy cost. It feels distinct.
- **Pitch:** eases back to level when no rise, dive or mouse input is given. That is fine.

The physics stayed as they were: changing them would shift every stage's balance for little gain.

**Input** (`src/input/feel.ts`, `input.ts`; the sim and bots see the same Intent as before):
- **Steering keys** now build up to a full turn over 0.16 s and let go in 0.06 s. A tap makes a small correction instead of a full-rate jerk.
- **The gamepad stick** has a response curve (exponent 1.6): finer near the centre, still full at the edge.
- **Mouse sensitivity** (0.5× to 3×) and **mouse up and down** (normal or inverted) are new on the Controls page. They are kept per browser in `homewater.access`, not in the save.

**Banking** (render): the fish rolls into its turns. The roll follows the smoothed turn rate and is capped at 0.42 rad (`CAMERA.bank`).

## Warnings

Every attack needs four things before it lands: a warning time, a sound, a marker (or an edge arrow when off screen) and something visible on the animal itself. The audit below covers each predator. The times are the warning on Field guide / Wild, in seconds.

| Stage | Predator | Warning (FG / Wild) | Sound | Marker | Visible tell | Change |
|---|---|---|---|---|---|---|
| Fry | Dolly Varden | 1.56 / 1.2 (lesson 3.1 / 2.4) | sting | yes | it turns and closes in | none |
| Smolt | char | **1.6** / 1.0 | sting | yes | rings in the water | **Field guide multiplier 1.3 → 1.6**: it was the shortest warning in the game (1.3 s) |
| Smolt | bird | 2.25 / 1.5 | sting, splash on the plunge | yes | the shadow darkens and shrinks, the bird circles in | **marker moved** from the surface (usually off the top of the screen) to the strike spot at the fish's depth |
| Smolt | merganser | 1.56 + 0.6 dive / 1.2 + 0.6 | sting, splash on the dive | yes | splash rings | **marker moved** to the fish's depth while it floats |
| Smolt | seal | 2.4 / 1.6 | sting, splash on the lunge | yes | bubbles and a flickering dark shape | none |
| Ocean | orca | 2.86 / 2.2 | low pulse, pulse on the charge | yes | a dark shape stalking in | none |
| Ocean | salmon shark | 2.34 / 1.8 | low pulse | yes | it rises from below | none |
| Ocean | seal | 2.34 / 1.8 | sting, splash on the lunge | yes | a flickering shape | none (it could not be placed for a shot outside its moment) |
| Return | bear | 2.4 / 1.5 | sting, splash on the strike | yes | the shadow on the surface, the bear wading out | **marker moved** to the strike spot at the fish's depth |
| Return | lure | none until hooked | sting when hooked | **new:** a "lure" marker while one swings within 9 units | the lure and its line | **new marker**: lures had no marker until they had already hooked the fish |
| Return | gillnets | always visible | none | none | the net lines | none |
| Spawn | bear | 2.08 / 1.6 | sting, splash on the strike | yes | the shadow over the target | **marker moved** to the target at the fish's depth: it now sits on the fish it is after |
| Spawn | rival male or female | 3.5 s takeover | sting | yes, while it approaches | it swims in | none |

**Fixed:**
- Threat markers now draw above journal toasts and captions (`#threats` z-index). In the screenshots, the bird and merganser markers had been hidden behind "New in the field journal" toasts.
- The lure marker is cool, not hot: it marks a danger, not an attack.

Warning times on Wild are unchanged.

## Hit feedback

- **Near miss.** The renderer's wound tracker (`wounds.ts`) already noticed near misses: a predator striking close without a catch, a squeeze through a gillnet, a torn-out hook, fights. It now counts them (`hits`, `lastHit`). On each one:
  - the camera shakes for 0.38 s, scaled by how close it was (off with reduced motion);
  - a new `nearMiss` sound plays: a rush of water and a low thump (`AUDIO.cue.nearMiss`), at most once every 0.4 s;
  - the screen edges flash pale for a moment (dimmer with reduced motion);
  - the wound mark appears as before.
- **Eating.** The bubbles now come with a small low gulp (`AUDIO.cue.eat.gulp*`), so a bite registers.

## Balance (quick, before and after)

`npm run balance -- --quick` (60 lives per cell). The only simulation change is the Field guide char warning.
- **Wild:** identical before and after.
- **Field guide:** the char killed no bot fish before or after. The other cells moved by a few points either way, because a later char strike changes the random draws after it. That is noise at 60 lives, not a trend.

| Per-fish death rate, Field guide | novice before → after | average before → after | skilled before → after |
|---|---|---|---|
| Smolt run | 25% → 30% | 6% → 9% | 0% → 0% |
| Ocean years | 40% → 42% | 30% → 24% | 19% → 22% |
| Return: home river | 64% → 58% | 46% → 45% | 6% → 8% |
| Spawning | 24% → 26% | 8% → 3% | 8% → 14% |

## Camera framing, Documentary view and the minimal HUD (2026-11-20)

Track 1 items 1 and 3 of `docs/IMPROVEMENT_PLAN.md`, and the owner's "Documentary view" decision. Render and UI only: the simulation, params and saves are unchanged (no determinism hash moved). Shots: `node tests/smoke/camera-shots.mjs` and `node tests/smoke/camera-cues.mjs` against a preview on port 4194 (`npx vite preview --port 4194`); saved as `docs/gallery/camera-*.png`.

### Camera

**Before.** The default view hung above and behind the fish and looked down on its back. The fish read as a thin stick, the surface and horizon were out of frame, and threats arrived from off screen.

**Now** (`cameraRig.ts`, tuning in `cameraConfig.ts`):
- **Low chase (default).** The boom hangs near the fish's depth (a little above it), behind it and swung about 0.5 rad (29°) to one side, so the body is seen three-quarter side-on in silhouette, with the water column and the surface above it in frame. The side is chosen for open water when the stage starts, and again when a framed moment begins (it swings round smoothly). The gaze sits just ahead of the fish at about its depth, so it sits near the middle of the screen, above the captions.
- **High.** The feel pass's view, unchanged: behind and above, looking down on the back.
- **The view key (V)** cycles low chase, high, and first-person. The Gameplay tab of Settings' **Camera view** sets which third-person view the game starts in; cycling remembers the last one used (`access().cameraView`, per browser).
- **Side-on framing** (low chase only): the boom swings round to about 80° off the tail axis, drops level with the fish and lengthens a little, for
  - a fight beside the fish on the spawning grounds (rival or guarding male in state `fight` within 10 units): centred between the two fish, lengthened by their spread;
  - the female's spawning act (settled over the finished redd with a male beside her);
  - the plunge pool below the falls (partly, 60%) and the leap itself (fully).

  It comes and goes over about half a second (instantly-ish with reduced motion).
- **A soft look toward a threat.** The most pressing threat (the nearest attack, else the nearest warning; never a lure, an opening or a rival) pulls the camera round: the boom swings up to half the bearing to it (at most 1 rad) and the gaze moves up to 30% of the way toward it, capped at 0.4 of the boom so the fish never leaves the frame. A warning pulls at 60% strength, an attack fully. It is off with reduced motion and while a cinematic shot plays. In the shots, a salmon shark placed behind and to the side comes on screen beside the fish within about a second.
- **The egg stage** has a fixed view per camera choice: low chase sits low among the stones, looking across the nest; high looks down on it as before.
- **Unchanged:** collision handling (pull in, rise, swing aside), the surface line, shake on near misses, cinematics on top, first-person.

**Known limits.** The camera does not avoid other fish: at the falls a fellow migrant can pass right in front of the lens (`camera-falls-pool.png`). Huge eggs fill the egg-stage chase view until the scale session shrinks them.

### Documentary view

A Readability-page setting, off by default (`access().documentaryView`, per browser). Nothing in the simulation changes: the warning times in params are the same, and every predator still gives its warning at the same moment. Only how the warning is shown changes.

| Aid (default view) | Documentary view |
|---|---|
| Labelled ring on a warning or attacking predator | Nothing on screen: the predator itself, its approach and its own tell (rings in the water, the bird's shadow, the bear's shadow on the surface, splash rings) |
| Arrow at the screen edge for a threat off screen | A soft dark shadow at that edge (`#edge-shadow`; darker for an attack), only while the threat is off screen |
| (none) | A soft shadow on the bed under a warning predator that swims (char, Dolly Varden, seal, orca, salmon shark, merganser), darker as it attacks |
| Merganser target ring on the surface | None (its splash rings and the merganser remain) |
| "lure" marker on a swinging lure | None (the lure and its line remain) |
| "now" marker on the female during a fight | None (the green edge flash and the opening sound remain) |
| Jack hiding-spot rings | Faint marks on the gravel |
| Home scent as specks | A faint shimmer in the water: soft, flickering, camera-facing glows, larger and brighter where the smell is clearer |
| Magnetic track as small blue markers | Soft glows of pale light along the track that swell and fade |

In both views:
- **The fish startles.** When a predator first warns or turns to strike within 22 units, your fish flinches away from it: a quick turn and roll and a burst of tail beats (`ThreatCues.startle`, tuning `CAMERA.startle`). Render only; the sim's fish does not move.
- **Sound.** The existing cues stay: a sting (or a low pulse for orcas and sharks) on each warning, a splash or pulse on the strike, and the danger layer of the score while anything is warning.
- **The camera's soft look** toward the threat.

### Minimal HUD

- **Two thin rings, always shown, bottom-left** (`src/ui/vitals.ts`, `#hud-vitals`; tuning `src/ui/hudConfig.ts`): energy (yolk for the alevin), plus fat on the return and strength on the spawning grounds. Silver when fine, amber when low, red and pulsing when critical (no pulse with reduced motion).
- **Early fat warning.** The fat ring watches the recent rate of burn. It turns amber when fat is under 40% or would run out within 75 s at that rate, and red under 20% or within 30 s. A long burst up the rapids therefore shows amber well before the store is low, while there is still time to rest in slack water.
- **Water temperature only when it matters.** On the return, a small amber chip (for example "water 19°C · warm") appears beside the rings when the water is within 1.5 °C of the heat-stress temperature, the fish is under any heat stress, or oxygen is low. Otherwise it is hidden.
- **The H details panel** keeps the rest (hold, daylight, growth, home scent, depth, oxygen, heat stress), moved up above the rings. Energy, yolk and fat are no longer repeated there.
- Written through `HudView` (`rings`, `edgeShadow`): DOM writes only when the shown value changes (ring arcs to the nearest 1%).

## Text diet, stage cards and onboarding (2026-11-20)

The review found up to three caption boxes, three journal toasts and the guide box on screen at a stage start, over the lower middle where the fish is, with the guide and a caption often saying the same thing.

- **One caption at a time** (`src/app/captionQueue.ts`, pure, tested in `tests/unit/captionQueue.test.ts`). Lines are sorted into warnings, lines that say what to do, and science (`src/app/captionConfig.ts`). A warning cuts a lower line short (the cut line comes back first if it had shown for under 2 s); with lines waiting, the one on screen gives way after 60% of its time but never under 2.2 s. A line that would wait too long (science 8 s, guide 10 s) goes to the journal's **This life** page instead; a warning older than 2.5 s is stale and dropped. The caption clock stops while paused, and captions hide under the pause menu and the journal. The recording plays for the line shown (the short line's own ID), so narration always matches the screen.
- **Placement:** bottom right, above the key hint, 440 px wide (scaled by the caption size setting); the new line and the fading one share one grid cell so nothing jumps. Caption size and background come from the Readability page as before; reduced motion drops the fade.
- **Short lines:** 52 long lines have a `.short` version (all under 110 characters), with a **more** button to show the full line and the full line in the journal.
- **Guide and captions never repeat:** a guide step lists the captions it already says (`covers` in `src/ui/tutorial.ts`); those stay off screen while the step is up (a warning only while its own step is up; other lines while the step is up or still to come). A unit test compares every step with every caption that can show beside it and fails on a shared run of four words or mostly the same content words.
- **Journal chip:** new entries are counted into one chip at the top ("3 new journal entries", with the journal key). J now opens the journal from play (pausing), on the page with the newest entries, marked "new".
- **Stage cards:** place and season, one plain line about the year (`card.*` captions), and a **This year** link that opens the full year effects and the bet-hedging line (`src/ui/yearView.ts`). The recap can reuse `yearEffects(p, conditions, { stage: null, heading: 'The year' })`. In a guided first life the card leaves the objective out, since the guide teaches it.
- **Onboarding:** the first lake stage of a guided life starts with three steps done by doing: swim and turn both ways (0.6 rad each), dive and rise (0.6 m each), and a burst. A controls picture (`src/ui/controlsPicture.ts`) shows the player's own keys and lights the ones the step needs; the egg stage's steps light steer, dive and rise. The first time the pointer locks, `help.mouseLock` says the mouse now steers and how to get the pointer back (once per browser, `homewater.mouseLockSeen`).
- Shots: `node tests/smoke/text-shots.mjs docs/gallery text-after` against a preview on 4195 (`BEFORE=1` skips the onboarding part); saved as `docs/gallery/text-before-*.png` and `text-after-*.png`.


## The falls and the magnetic track after a playtest (2026-11-24)

A playtester could not get the fish to break the surface at the falls, even when following the leap instruction. They also could not work out how to leap, kept failing, ran out of fat and energy, had trouble with the bear there, and found the magnetic track's blue shimmer hard to see.

### Bug hunt: what happened

Reproduced in the real build (Playwright, `?quality=low` and `high`, Field guide and Wild) by holding the keys the old caption named ("Build up speed, then burst and rise together (Shift) (Space) just under the surface"), at the place it described.

- **The bug: a fish at the falling water could never leap.** The rock step (`pushOut` in `falls.ts`) zeroes the fish's upstream speed every step it presses against the face, and a leap needed upstream speed over 1 u/s on that same step. A player who swims to the falls first and then presses Shift and Space sits at the surface with its nose in the curtain, burning energy until it is exhausted. Nothing ever happens and nothing says why. In the browser this is exactly the playtest: the fish pinned at the surface under the white water, the energy ring empty.
- **The leap fired at the edge of the zone, not at the spot.** With burst and rise held from the start of the pool, the leap began the moment the fish entered the launch zone (5 units below the face). That is 2.8 units short of the standing wave, at whatever speed the fish had there, so the spot bonus was lost. On Wild those leaps missed.
- **Too deep, too easily.** A leap needed the fish within 1.6 units of the surface. The fish swims at about 2 units deep in the river, and holding rise pitches it up, which costs forward speed. On a 7-unit pool at 10 u/s, a fish that starts rising too late reaches the face before it is shallow enough (and then the first bug traps it).
- **Bursting without forward does nothing.** The swim step refuses a burst with no forward input. A player who reads "burst and rise together" and lets go of W gets no burst and no leap. This is still how swimming works; a leap no longer needs it (below).
- **Energy.** The rapids drain energy, and a burst is refused below 8%. Waiting at the face drains the rest. A miss cost 0.32 energy, so after one miss and some waiting the fish often could not burst.
- **What it was not:** the surface clamp in `constrain` is fine (the fish can't leave the water except by a leap, as intended); hold and toggle burst both reach the sim; pointer lock doesn't eat keys; the renderer draws a leap that starts. The side-on pool camera makes the pool's depth hard to judge but doesn't hide the fish.

### What changed

- **One input.** A burst near the surface, heading upstream, is the leap. Below the white water a burst builds speed. Held, it leaps at the standing wave; a fresh press leaps anywhere in the white water. Burst and rise together still work once the fish is moving fast. The run-up speed is kept for a moment (`return.leapRunDecay`), so a fish that has just reached the face still leaps. Too close is a miss that says so.
- **Wider tolerances:** depth with no penalty to 2.2 units (deeper costs score, up to 3.2), the launch zone 6 units, speed for a full score 7.5 u/s (was 8.5), the spot's reach across and along the river 2.8 and 1.8 units (`return.leapNotchReach`, `leapWaveReach`), too close 0.5. Wild needs a little more (`leapNeed` ×1.2, was ×1.1): full speed alone isn't enough there; the low step or the standing wave is.
- **Field guide help:** from the second try, every leap gets `return.leapAssist.fieldGuide` (0.25). Wild gets none.
- **Every miss says why** (`return.leapMiss.slow`, `.deep`, `.close`, `.spot`, `.nearly`), and a burst that starts no leap says why too (`return.noLeap.deep`, `.slow`, `.heading`, `.tired`, at most every 4 s). The new `leap` sim event carries the result to the play log.
- **Cheaper failure:** a miss costs half (energy 0.16 in all, fat 0.01). Resting deep in the plunge pool recovers energy faster (`return.poolRegen`). The side channel opens after 2 misses on Field guide and 3 on Wild. Its white water shows from the start, behind the driftwood, and the falls caption names it as the longer way round.
- **Readable:** a **leap** ring joins energy and fat in the plunge pool. It shows how good a leap from here, at this speed, would be, and glows white when full. A patch of brighter foam and a boil of bubbles sit over the standing wave under the low step, and the curtain is brighter where the low step pours.
- **Taught before it matters:** a low rock ledge by one bank in the rapids can be hopped once for practice (optional: the river goes round it). The Field guide has a step for it, with the controls picture.
- **The lip bear:** on Field guide it doesn't strike at the player for the first two tries, and it leaves alone a fish that got over within them. On Wild it warns 1.4× longer, and a caption says to drop deep when it reaches in.

### Probe, before and after

`npx vite-node scripts/balance/probe.ts -- return 150` (one fish, no siblings, 150 lives per row; the probe now prints a falls column). "Falls deaths" are deaths between the rapids and just above the lip, per fish.

| | tries per fish that reached the pool | cleared by a leap within 3 tries | up the side channel | falls deaths | home-river deaths | all return deaths |
|---|---|---|---|---|---|---|
| Field guide novice | 1.4 → 1.1 | 86 of 102 → 103 of 103 | 5 → 0 | 9% → 0% | 47% → 37% | 82% → 71% |
| Field guide average | 1.3 → 1.0 | 128 of 133 → 133 of 133 | 3 → 0 | 2% → 1% | 35% → 30% | 46% → 43% |
| Field guide skilled | 1.2 → 1.0 | 145 of 145 → 145 of 145 | 0 → 0 | 1% → 1% | 15% → 14% | 23% → 20% |
| Wild novice | 2.2 → 2.6 | 33 of 77 → 55 of 84 | 9 → 20 | 29% → 11% | 63% → 61% | 99% → 95% |
| Wild average | 2.0 → 1.6 | 92 of 116 → 116 of 122 | 2 → 3 | 16% → 10% | 44% → 43% | 64% → 57% |
| Wild skilled | 1.7 → 1.2 | 123 of 134 → 129 of 136 | 1 → 0 | 12% → 14% | 32% → 32% | 37% → 35% |

Misses after the change, by reason (all lives in the row): Field guide novice spot 5, slow 3, nearly 3; Wild novice slow 77, spot 66, nearly 21; Wild average slow 45, nearly 19, spot 18; Wild skilled slow 21, nearly 10, deep 4. The bot now climbs nearly in place before its run, so its run-up stays long (`scripts/balance/bots.ts`). Wild skilled falls deaths did not fall (12% → 14%, within the noise of 150 lives) even though their misses did; the causes there were not split out in this pass. Bear deaths for Wild skilled rose from 2% to 6% over the whole return: worth a look with the lip bear's longer warning in mind.

Bots know where to launch, so they never hit the face bug; the numbers show the cost side (cheaper misses, help, the side channel sooner) rather than the bug fix. Wild novices still miss a lot ("slow" and "spot"), by design: Wild keeps a skill check, now explained. The rest of the home river's deaths are mostly fat (exhaustion), anglers and bears below the falls, which this pass didn't change.

### The magnetic track

The markers were 0.1-unit octahedra (about a tenth of the fish) inside the sea's fog, so beyond a few lengths they vanished, more so on Low. They are now soft glows of blue light (`src/render/trackGlow.ts`, tuning `trackConfig.ts`): a bright core in a halo, a slight twinkle, never smaller than about 0.8° on screen, fading by distance from the camera instead of by fog, so they read the same at every preset and from the low chase camera. Documentary view keeps them softer and larger, with no twinkle. No arrows or rings. The caption now says the shimmer stands for the magnetic sense (`return.track`), rather than being something the fish sees.
