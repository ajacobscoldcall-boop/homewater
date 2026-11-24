# Sound samples

Clips of the game's procedural sound, rendered offline by `npm run audio:render` (scripts/audio-render.mjs) from the same code the game plays. They are 16 kHz mono WAV files (the game's sound sits well under 8 kHz): open one in any audio player. Headphones help with the quiet ones. Each clip uses a fixed random seed, so re-rendering after a change gives a fair before and after.

Levels are after the game's limiter at the default volume (70%). The script fails if a clip reaches 0 dBFS (clipping) or is silent.

## Ambience: each place on its own (no music, no cues)

| Clip | Length | Listen for | Peak | RMS |
|---|---|---|---|---|
| [ambience-egg-gravel](ambience/ambience-egg-gravel.wav) | 10 s | In the redd: creek water through stones, a trickle between them, now and then a stone knocking. | -9.0 dB | -21.2 dB |
| [ambience-egg-flood](ambience/ambience-egg-flood.wav) | 12 s | The flood coming: a deep rumble rises and stones roll (flood level 0 to 1 over the clip). | -3.2 dB | -15.1 dB |
| [ambience-fry-lake-day](ambience/ambience-fry-lake-day.wav) | 10 s | The lake by day: a still hush, faint lapping far above, soft plops at the surface. | -15.1 dB | -27.2 dB |
| [ambience-fry-lake-night](ambience/ambience-fry-lake-night.wav) | 10 s | The lake at night: quieter, fewer plops. | -16.6 dB | -29.0 dB |
| [ambience-smolt-river-night](ambience/ambience-smolt-river-night.wav) | 10 s | The night river: a steady rush with bubbles. | -7.4 dB | -21.1 dB |
| [ambience-smolt-estuary](ambience/ambience-smolt-estuary.wav) | 14 s | From the river mouth into the estuary: the river fades and surf swells in toward the sea. | -7.8 dB | -21.1 dB |
| [ambience-ocean-open](ambience/ambience-ocean-open.wav) | 16 s | The open ocean: low and vast, long swells overhead, and far off, now and then, an orca calling. | -10.6 dB | -22.1 dB |
| [ambience-return-coast](ambience/ambience-return-coast.wav) | 10 s | The coast on the way home: swell and a low wash. | -9.7 dB | -22.2 dB |
| [ambience-return-river](ambience/ambience-return-river.wav) | 10 s | Inside the home river: a brighter rush. | -8.3 dB | -20.8 dB |
| [ambience-return-riffle](ambience/ambience-return-riffle.wav) | 10 s | Over a riffle: louder and more turbulent. | -5.4 dB | -17.7 dB |
| [ambience-return-falls-approach](ambience/ambience-return-falls-approach.wav) | 16 s | Swimming up to the falls: the roar rises from nothing to a thunder, through the rapids into the plunge pool. | -2.8 dB | -16.2 dB |
| [ambience-return-lake](ambience/ambience-return-lake.wav) | 10 s | Crossing the nursery lake at the end of the return: quiet again. | -15.4 dB | -27.1 dB |
| [ambience-spawn-small-run](ambience/ambience-spawn-small-run.wav) | 10 s | The spawning grounds in a small run (8 others): a babbling creek and a few splashes. | -11.9 dB | -24.8 dB |
| [ambience-spawn-big-run](ambience/ambience-spawn-big-run.wav) | 10 s | The spawning grounds in a big run (100 others): splashing all around. | -11.3 dB | -24.3 dB |
| [ambience-rain](ambience/ambience-rain.wav) | 10 s | Rain on the lake (the weather hook at full): a hiss and drops from above. | -15.8 dB | -28.7 dB |

## Music: each slot of the generated score on its own

| Clip | Length | Listen for | Peak | RMS |
|---|---|---|---|---|
| [music-title](music/music-title.wav) | 14 s | Title: sparse, minor, a few bells. | -24.2 dB | -35.6 dB |
| [music-egg](music/music-egg.wav) | 14 s | Egg: low, slow and close. | -19.6 dB | -30.1 dB |
| [music-fry](music/music-fry.wav) | 14 s | Fry: open and light, the most melodic. | -19.7 dB | -30.3 dB |
| [music-smolt](music/music-smolt.wav) | 14 s | Smolt: hushed and unsettled. | -19.3 dB | -29.6 dB |
| [music-ocean](music/music-ocean.wav) | 14 s | Ocean: wide and deep, long notes far apart. | -18.1 dB | -27.7 dB |
| [music-return](music/music-return.wav) | 14 s | Return: hopeful and a little warmer. | -19.0 dB | -30.3 dB |
| [music-spawn](music/music-spawn.wav) | 14 s | Spawning grounds: bright and full. | -19.1 dB | -29.7 dB |
| [music-end](music/music-end.wav) | 14 s | End of a life: slow and warm (starts with the life-end bells). | -15.9 dB | -28.5 dB |
| [music-danger](music/music-danger.wav) | 20 s | The ocean score with danger: a predator warns at 5 s and strikes at 9 s; the danger layer rises, the bells stop, then it eases off after 13 s. | -13.7 dB | -26.7 dB |

## Cues: each event sound on its own

| Clip | Length | Listen for | Peak | RMS |
|---|---|---|---|---|
| [cue-warnChar](cue/cue-warnChar.wav) | 3 s | Char or trout warning: two low, woody notes rising, with a swish. | -8.6 dB | -24.7 dB |
| [cue-warnBird](cue/cue-warnBird.wav) | 3 s | Birds above the smolt run: three soft wingbeats, then a high falling note. | -11.9 dB | -34.1 dB |
| [cue-warnGull](cue/cue-warnGull.wav) | 3 s | A gull: two short high notes, falling. | -17.6 dB | -36.3 dB |
| [cue-warnMerganser](cue/cue-warnMerganser.wav) | 3 s | A merganser: four paddling ticks. | -12.8 dB | -36.7 dB |
| [cue-warnSeal](cue/cue-warnSeal.wav) | 3 s | A seal: a rising swoosh over a falling tone. | -12.9 dB | -28.6 dB |
| [cue-warnOrca](cue/cue-warnOrca.wav) | 4 s | An orca: a deep double pulse and a faint whistle. | -5.8 dB | -18.2 dB |
| [cue-warnShark](cue/cue-warnShark.wav) | 4 s | A salmon shark: lower, slower, rougher, no whistle. | -3.9 dB | -16.4 dB |
| [cue-warnBear](cue/cue-warnBear.wav) | 3 s | A bear: two heavy footfalls on gravel. | -6.0 dB | -21.5 dB |
| [cue-warnHook](cue/cue-warnHook.wav) | 3 s | An angler's lure takes hold: a reel's ratchet. | -12.1 dB | -39.2 dB |
| [cue-warnRival](cue/cue-warnRival.wav) | 3 s | A rival male: two mid knocks. | -10.7 dB | -29.4 dB |
| [cue-surge](cue/cue-surge.wav) | 3 s | A surge of flow (or the flood starting): a swell of water. | -14.9 dB | -32.0 dB |
| [cue-opening](cue/cue-opening.wav) | 3 s | A jack's opening: a soft bright tone. | -18.7 dB | -31.7 dB |
| [cue-strikeBird](cue/cue-strikeBird.wav) | 3 s | A bird or merganser strikes the water. | -13.4 dB | -33.9 dB |
| [cue-strikeBear](cue/cue-strikeBear.wav) | 3 s | A bear strikes: a big low splash. | -3.8 dB | -24.4 dB |
| [cue-strikeSeal](cue/cue-strikeSeal.wav) | 3 s | A seal lunges: a rushing swoosh, then a splash. | -11.5 dB | -32.4 dB |
| [cue-chargeDeep](cue/cue-chargeDeep.wav) | 3 s | An orca or shark charges: a deep pulse. | -7.4 dB | -18.5 dB |
| [cue-nearMiss](cue/cue-nearMiss.wav) | 3 s | A strike that just missed: a rush of water past the fish and a thump. | -6.8 dB | -27.2 dB |
| [cue-eat](cue/cue-eat.wav) | 2 s | Eating: a small snap, a gulp and bubbles. | -17.6 dB | -35.8 dB |
| [cue-wriggle](cue/cue-wriggle.wav) | 2 s | An alevin wriggling in the gravel. | -15.9 dB | -39.6 dB |
| [cue-leap](cue/cue-leap.wav) | 3 s | A leap at the falls: a rush up, then the splash back. | -9.8 dB | -30.0 dB |
| [cue-spawned](cue/cue-spawned.wav) | 6 s | Spawning: four rising bells. | -14.1 dB | -29.7 dB |
| [cue-stageComplete](cue/cue-stageComplete.wav) | 4 s | A stage completed: two bells. | -18.8 dB | -35.0 dB |
| [cue-death](cue/cue-death.wav) | 5 s | Death: a soft low fall with the world muffled; clear, not a shock. | -8.1 dB | -22.3 dB |
| [cue-lifeEnd](cue/cue-lifeEnd.wav) | 7 s | The end of a life: a slow, warm rising chord of bells. | -19.8 dB | -32.2 dB |
| [cue-heartbeat](cue/cue-heartbeat.wav) | 9 s | The weak-fish heartbeat: energy falls from 40% to nothing, and the lub-dub comes in and quickens. | -9.7 dB | -24.7 dB |
| [cue-swim-burst](cue/cue-swim-burst.wav) | 6 s | Swimming: a soft rush that follows speed; a whoosh as a burst starts at 2 s, ending at 3.5 s. | -13.6 dB | -32.1 dB |

## Mixes: everything together, as played

| Clip | Length | Listen for | Peak | RMS |
|---|---|---|---|---|
| [mix-fry-duck](mix/mix-fry-duck.wav) | 16 s | The lake as played: ambience and score; a narration line starts at 4 s and ends at 10 s, and music and ambience dip smoothly under it (the warning cue at 7 s is not ducked). | -8.3 dB | -26.7 dB |
| [mix-falls](mix/mix-falls.wav) | 18 s | Up the rapids to the falls as played: score, roar rising, a bear warning at 8 s, a leap at 14 s. | -2.9 dB | -16.3 dB |

Sound graph: 64 nodes built once; at most 10 one-shot voices at once in these clips. See docs/audio.md.
