# Warm-year realism (Track 2.7): probe numbers

`scripts/balance/probe.ts`, 200 lives per cell, one fish and no siblings, the same seeds before and after.
"Warm" is `PROBE_YEAR=0.85,1.15` (a warm, low-water year); "hot" is `PROBE_YEAR=0.7,1.25` (an extreme one, roughly 1 year in 50).
Grounds rows start at the spawning stage, so the fish carries the year's typical toll (`heat.yearToll`); `PROBE_TOLL=0.25` sets the carried toll instead.

## Return: deaths per fish (heat share in brackets), toll carried home

| Year | Cell | Before | After | Toll home (after) |
|---|---|---|---|---|
| rolled | Field guide novice / average / skilled | 80.5 (1) / 47.5 (3) / 23.0 (3) | 80.0 (0) / 47.5 (1) / 22.5 (1) | 0.02 / 0.01 / 0.00 |
| rolled | Wild novice / average / skilled | 99.5 (2) / 67.5 (6) / 37.5 (7) | 99.5 (1) / 67.5 (3) / 37.5 (1) | 0.00 / 0.01 / 0.01 |
| warm | Field guide novice / average / skilled | 76.5 (2) / 43.5 (2) / 21.5 (2) | 76.5 (0) / 43.5 (1) / 22.0 (1) | 0.01 / 0.02 / 0.01 |
| warm | Wild novice / average / skilled | 97.5 (6) / 71.5 (16) / 48.5 (13) | 97.5 (1) / 69.5 (2) / 43.5 (2) | 0.02 / 0.10 / 0.05 |
| hot | Field guide novice / average / skilled | 88.5 (22) / 65.5 (30) / 44.0 (29) | 88.5 (10) / 58.5 (9) / 39.5 (9) | 0.09 / 0.11 / 0.05 |
| hot | Wild novice / average / skilled | 99.5 (28) / 82.5 (54) / 83.5 (53) | 99.5 (12) / 81.5 (27) / 74.5 (14) | 0.00 / 0.22 / 0.14 |

Heat deaths fall to a third or less; in the extreme year some move to exhaustion (warm water still burns fat, and bots now spend fat resting at seeps). In the hot year a quarter to a third of fish that get home carry a toll above the grounds' pre-spawn threshold (0.25). Most remaining hot-year heat deaths are in the lake's warm shallows at the very end and in riffles on the afternoon (about 25 °C).

## Spawning grounds: deaths per fish (pre-spawn share), mean burden

| Year | Cell | Before | After | Burden |
|---|---|---|---|---|
| rolled | Field guide nov / avg / skl | 11.0 / 4.0 / 5.0 | 11.5 (0) / 4.0 (0) / 6.0 (1) | 0.07 |
| rolled | Wild nov / avg / skl | 16.5 / 4.0 / 8.0 | 15.5 (0) / 5.0 (0) / 9.0 (1) | 0.06 |
| warm | Field guide nov / avg / skl | 9.0 / 4.5 / 7.0 | 9.5 (1) / 4.5 (0) / 6.0 (1) | 0.15 |
| warm | Wild nov / avg / skl | 21.0 / 7.0 / 8.5 | 21.0 (1) / 5.5 (0) / 6.5 (2) | 0.14 |
| hot | Field guide nov / avg / skl | 10.5 / 2.0 / 4.5 | 13.0 (1) / 4.0 (0) / 5.0 (4) | 0.25 |
| hot | Wild nov / avg / skl | 26.0 / 8.5 / 7.0 | 20.5 (2) / 5.0 (0) / 8.0 (6) | 0.24 |
| hot, toll 0.25 | Field guide nov / avg / skl | (as hot) | 9.0 (5) / 3.5 (0) / 7.5 (8) | 0.36 |
| hot, toll 0.25 | Wild nov / avg / skl | (as hot) | 16.5 (4) / 5.0 (1) / 8.0 (8) | 0.36 |

Pre-spawn deaths are small (0-8%) and the stage stays inside its bands; the grounds also run 5-20 s shorter for a burdened fish (less strength, faster senescence). Bigger effects are one param away (`heat.prespawnRate`, `heat.vigourLoss`, `heat.senescenceBoost`) once the advisor answers how large pre-spawn mortality is in warm years.
