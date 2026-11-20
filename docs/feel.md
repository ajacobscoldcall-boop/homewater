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
