# Sound

Homewater's sound is made in the browser with the Web Audio API. There are no sound files and no extra libraries. The code is in `src/audio/`:

- `config.ts`: every audio tuning number, grouped by what it shapes (ambience per place, sprinkles, cues, heartbeat, score, the node budget). These are presentation values, so they live here, not in params.json.
- `mood.ts`: pure decisions, unit-tested in `tests/unit/audio.test.ts`: how dangerous the moment is, which music slot plays, which ambience fits where the fish is, which cue an event or warning plays, the falls' nearness and the crowd's splash rate.
- `scene.ts`: reads what the sound needs from the world through the simulation's public views (`fallsView`, `lakeView`, `smoltView`, `alevinView`, `fryView`, the crowd entities) into an `AudioScene` snapshot.
- `synth.ts`: one-shot voices (tones, bells, filtered noise, clicks, far-off whistles) with a voice limiter.
- `score.ts`: the generated score: pad, bass, bell melody and the danger layer.
- `engine.ts`: the `AudioEngine`, which builds the graph once and drives it from the scene.

The simulation knows nothing about sound. `src/app/App.ts` hands the engine the world each frame (`audio.update`) and the drained simulation events (`audio.onEvents`). The engine only reads the world.

## Listening without playing

`npm run audio:render` renders clips offline and writes them to `docs/audio-samples/` (16 kHz mono WAV, with a README saying what to listen for and each clip's peak and RMS level). It bundles `scripts/audio/page.ts`, which runs the real `AudioEngine` on an `OfflineAudioContext` in headless Chromium with made-up scenes (`AudioEngine.drive`), so no server and no game are needed. Each clip has a fixed random seed, so a re-render after a change is a fair before and after.

- `npm run audio:render -- cue-warn music-fry` renders only clips whose names start with those (the README is only rewritten on a full run).
- `--spectrograms=<dir>` also writes a spectrogram PNG per clip (30 Hz to 8 kHz, log), for checking by eye.
- The script fails if any clip reaches 0 dBFS or is silent.

## What you hear

### Ambience, per place

The graph has a fixed set of layers: a low wash (brown noise), a mid texture with a drifting wobble (babble, turbulence), a low drone, a swell (noise that rises and falls slowly), a roar (white water) and rain. A place sets their levels and colours and the rates of small one-shot sprinkles: bubbles, a trickle, gravel knocks, surface plops, splashes and far-off calls. A stage change dips the ambience and brings the new one up; within a stage, changes glide. The world sound passes through a low-pass filter, so everything sounds underwater.

| Place | What it sounds like | Read from |
|---|---|---|
| Egg, in the redd | creek water through stones, a trickle, stones knocking now and then | |
| Egg, the flood | a deep rising rumble and rolling stones | `alevinView().floodLevel` |
| Fry, the lake | a hush, faint lapping above, soft plops at the surface; fewer at night | `fryView().light` |
| Smolt, the night river | a steady rush with bubbles | |
| Smolt, the river mouth and estuary | the river fades and surf swells in toward the sea | `smoltSection`, `smoltView().estuary` |
| Ocean | low and vast, long swells overhead (fading deeper down), a far-off orca call now and then | depth |
| Return, the coast | swell and a low wash | |
| Return, the home river | a brighter rush; riffles louder; the rapids rougher still | `returnLayout`, `isRiffle`, the rapids' x range |
| Return, the falls | a roar that rises and brightens as the fish nears the face | `fallsView().face`, `notchZ` |
| Return, the lake crossing | quiet again, plops at the surface | `lakeView().inside` |
| Spawning grounds | a bright, babbling creek and splashes that follow the crowd's size | the crowd entities |
| Rain | a hiss and drops from above, fading with depth | `AudioEngine.setRain(0..1)` |

Animals heard are only those the advisor's notes place there: orcas in the ocean (see the sound stream's open question in `docs/ADVISOR_NOTES.md`).

**Rain hook:** the weather stream calls `app.audio.setRain(level)` (0 to 1) wherever it reads the weather each frame. Until then nothing calls it and there is no rain.

### Cues: learning threats by ear

Each threat has its own short figure, so a player can learn them by ear (Documentary view relies on this). Warnings go through their own path, lightly filtered and not ducked under narration, so they stay clear in every place.

| Warning key | Cue | Figure |
|---|---|---|
| `trout`, `char` | `warnChar` | two low, woody notes rising a fourth, with a swish |
| `bird` | `warnBird` | three soft wingbeats, then a high falling note |
| `gull` | `warnGull` | two short high notes, falling |
| `merganser` | `warnMerganser` | four paddling ticks |
| `seal` | `warnSeal` | a rising swoosh over a falling tone |
| `orca` | `warnOrca` | a deep double pulse and a faint whistle |
| `shark` | `warnShark` | lower and slower, a rough overtone, no whistle |
| `bear` | `warnBear` | two heavy footfalls |
| `hooked` | `warnHook` | a reel's ratchet |
| `rival` | `warnRival` | two mid knocks |
| `flow`, `flood` | `surge` | a swell of water |
| `opening` | `opening` | a soft bright tone |
| anything new | `sting` | a soft tense sting (add a figure for it) |

Strikes, heard by distance from the fish: birds and mergansers splash sharply (`strikeBird`), a bear's strike is a big low splash (`strikeBear`), a seal's lunge rushes then splashes (`strikeSeal`), an orca's or shark's charge is a deep pulse (`chargeDeep`). A near miss is a rush past the fish with a thump.

The fish: eating is a small snap, a gulp and bubbles; swimming is a soft rush that follows speed, with a whoosh when a burst starts; a leap at the falls is a rush up and a splash back; a heartbeat (lub-dub) comes in when energy (or fat, on the return) runs low and quickens as the fish weakens.

Endings: death is a soft low fall on the music bus while the world goes muffled for a moment (clear, not a shock); spawning is four rising bells; a completed stage is two bells; the end of a life (the post-spawn sequence) is a slow, warm rising chord of bells.

### Score

Each slot has a calm generated score: a slow pad of chords with a soft bass under it and a slow sweep of its filter, and a sparse bell melody that wanders the stage's scale (pentatonic, major pentatonic or dorian) and rings into an echo. Chords, rests, phrases and notes are chosen as it plays, so nothing repeats on a fixed loop. A low, trembling danger layer rises while a predator is warning or attacking and falls away slowly; under it the pad thins and the bells stop.

## Music slots

| Slot | When it plays |
|---|---|
| `music.title` | Title screen and new-lineage setup |
| `music.egg`, `music.fry`, `music.smolt`, `music.ocean`, `music.return`, `music.spawn` | That stage, including its stage card |
| `music.danger` | Layered on top, with its level following the danger (0 to 1) |
| `music.end` | The end-of-life sequence and the offspring choice |

Each slot is generated by default. To replace a slot with a recording:
1. Save the file as `public/audio/<slot>.mp3`, for example `public/audio/music.ocean.mp3`.
2. Run `npm run narration:manifest`. It lists every `.mp3` in `public/audio/` in `manifest.json`, music and narration alike.

A listed slot plays the file looped instead of the generated pad, bass and melody, and crossfades in and out. A recorded `music.danger` loops quietly and its volume follows the danger level. Compose it so it works at any level.

Composer notes:
- Loop cleanly.
- Keep it sparse and quiet. Captions and narration sit on top, and the music ducks under narration.
- Each stage loop should be at least a minute, so the repeat isn't obvious.

## Narration ducking

`src/ui/narration.ts` reports when a recorded line starts and stops (`onSpeaking`). While a line plays, the engine glides music and ambience down to `AUDIO.duck.level`, then brings them back up when it ends (holding the current value first, so a line that starts mid-fade never jumps). Warnings and other cues are not ducked.

## Settings and browser rules

- **Starting:** the audio context is created on the player's first click or key press, as browsers require. Pressing Begin or Continue also resumes it.
- **No audio:** if Web Audio is missing or fails, the game stays silent and logs nothing. Every engine call is guarded, so sound can never break the game.
- **Settings:** volume, mute and narration volume are on the **Audio** tab of Settings (title screen and pause menu). Narration plays at the sound volume × the narration volume. **M** toggles mute at any time. Both are saved in `localStorage` with the other settings. Mute also silences narration.
- **Volume by screen:** pausing fades everything down. Menus and stage cards play at a lower level.
- **No clipping:** a gentle limiter (a compressor at −10 dB, ratio 12) sits after the master volume. Offline renders peak at about −3 dBFS in the loudest place (the falls) at the default volume.
- **No audible loops:** the two noise buffers (white and brown, 6.3 s) have their loop seams crossfaded, and each layer plays them at a slightly different speed and offset, so the layers never line up into a repeat.

## Cost and the node budget

The graph is built once: **64 nodes** (limiter, buses and echo; wash, texture, drone, swell, roar, rain and swim layers on six looping noise sources; pad, bass, sweep and danger layer). A place only retunes it; continuous parameters update ten times a second and only when they change.

One-shot sounds are 2 to 5 nodes each, freed when they finish. Background sprinkles wait while 22 one-shot voices are already playing (`AUDIO.voices.max`); cues always play. In normal play about 3 to 13 voices sound at once.

The budget is checked in `tests/unit/audioGraph.test.ts`, which runs the engine on a fake AudioContext through every stage with everything happening at once (every place feature, rain, a warning every second, a meal twice a second, predators striking): at most `AUDIO.budget.persistent` (70) nodes built once and `AUDIO.budget.transient` (120) one-shot nodes alive at once; every voice is released; no invalid value reaches an AudioParam. The smoke test `tests/smoke/sound.spec.ts` plays a life in the real build and checks the same budget.
