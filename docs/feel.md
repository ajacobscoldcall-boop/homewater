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
- **The view key (V)** cycles low chase, high, and first-person. The Readability page's **Camera view** sets which third-person view the game starts in; cycling remembers the last one used (`access().cameraView`, per browser).
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
