# Homewater: Stage Design Tables

One table per stage, written before the stage is built. Each table covers:
- **Verb:** what the player mostly does.
- **Decision:** the real choice the player makes.
- **Threats:** with how each one warns the player.
- **Failure:** what ends this fish's life.
- **Length:** the target length in milestone 1 (M1, grey boxes) and in the full game.

M1 is a crude whole life of about 5 minutes. Later milestones deepen each stage toward the full-game column without changing its shape.

The numbers live in `src/data/params.json`. The design here describes behaviour, not values.

## Controls (all swimming stages)

| Input | Action |
|---|---|
| Mouse (click to capture) or A / D | Steer |
| W | Swim forward |
| S | Ease off and hold position against the current |
| Space / C | Rise / dive |
| Shift | Burst: fast, costs energy |
| E | Stage action: dig, charge, or dart in |
| V | Switch third-person / first-person |
| H | Show or hide the detailed HUD |
| Esc | Pause |

## 1. Egg and alevin

The advisor said eggs can do little, but alevin orient into the current (positive rheotaxis) to stay upright and keep oxygen flowing, and swim toward the light as they prepare to feed.

| | Now | Full game |
|---|---|---|
| **Verb** | Turn to face into the current (A/D or mouse). Sink (C) or rise (Space) within the gravel. | Same, with more varied flows and a flood event |
| **Decision** | **Sink:** deeper is more sheltered from surges. **Time the rise:** swim up toward the light once the yolk is nearly used. Rising early leaves you exposed to surges. Every move costs a little yolk, and leftover yolk becomes the fry's starting energy. | Same |
| **Threats** | **Flow surges:** the drifting flecks swing to a new direction, then surge. A misaligned alevin gets loosened. | Plus egg predators and freezing |
| **Failure** | Washed out (scour), or exhausted (yolk spent with no emergence) | Same |
| **Length** | About 40-60 s, including a 4 s egg interlude | 2 min first life, then a 1 min vignette |

## 2. Fry in the lake

| | M1 | Full game |
|---|---|---|
| **Verb** | Swim through glowing plankton patches to feed | Feed, school, and migrate up and down through the water each day |
| **Decision** | Open-water patches are rich but exposed. The weed edge is safe but sparse. | Same, plus when to rise at dusk to feed |
| **Threats** | **Trout:** a ripple ring pulses from it when it starts a chase. Trout won't enter the weeds. | Plus diving birds, char, and surviving winter under ice |
| **Failure** | Caught by a trout | Same, plus starving over winter |
| **Length** | About 60 s (growth target reached, then winter passes in a time skip) | 5 min first life, shorter after |

## 3. Smolt run: the gauntlet

The advisor said predation during outmigration is the key bottleneck, and pictured it like the opening of Saving Private Ryan.

| | Now | Full game |
|---|---|---|
| **Verb** | Ride the current downriver in a school of 40 smolts. Dodge, dive and burst. | Same, longer, with night runs |
| **Decision** | **Stay with the school:** predators pick from the whole school, so close school-mates dilute your risk. **Spend energy:** bursts are limited. **Choose your water:** deep water avoids birds, banks give cover, and open water is fast. | Same |
| **Threats** | **Lake outlet:** char lunge from below, with a ring warning. **River:** diving birds (a shadow on the surface) and mergansers (a splash ahead, a short dive, then an underwater chase). **River mouth:** gull flocks with several shadows, and seals (bubbles and a dark shape, then a straight lunge aimed ahead of the target). | Plus terns and larger fish |
| **Failure** | Taken by a char, bird, merganser or seal | Same |
| **Also** | The stage-end card says how many of the 40 school-mates were taken | Same |
| **Length** | About 35-45 s | 4 min |

## 4. Ocean years

| | M1 | Full game |
|---|---|---|
| **Verb** | Feed on a herring ball, then evade an orca pass | A set of separate events with time skips between them |
| **Decision** | Keep feeding as the orca nears (more growth), or break off early (safer) | Same, plus a crowded-ocean year and seal ambushes |
| **Threats** | **Orca:** a dark silhouette and a low sound pulse before it charges | Plus seals, salmon sharks, and a rare trawl |
| **Failure** | Caught by the orca | Same |
| **Maturation reveal** | Genes and growth decide whether a male becomes a jack. The player is told; it is not their choice. Jacks return after one ocean year; others get another year (time skip). | Same, shown with more weight |
| **Length** | About 45 s | 6 min |

## 5. The return: navigation

The advisor said navigation is the most interesting challenge. Salmon follow the magnetic field at sea and smell once in the river. The commonest mistakes are overshooting and entering the wrong river, and fish test a branch and back out.

| | Now | Full game |
|---|---|---|
| **Verb** | Follow a faint magnetic track across open water to the coast, then pick the right river mouth and swim upstream following the scent | Same, longer, with a lake crossing |
| **Decision** | **At sea:** stay on the track. It only shows when you are near it, so sweep to find it again. **At the nets:** find a gap; small fish slip through. **At the coast:** which mouth? Wrong rivers dead-end, so back out. **Upstream:** spend fat to burst, or rest in slack water. **At the fork:** test a branch and back out if the scent fades. | Same, plus timing against tides and fishery openings |
| **Threats** | **Gillnets** across the approach. **Bears** at the riffles (a shadow and a splash first). **Fat** running out, faster in warm, low-water years. | Plus anglers, eagles, heat stress |
| **Failure** | Caught in a net, taken by a bear, or exhausted | Same |
| **Checkpoint** | Inside the home river | After each encounter |
| **Length** | About 80-120 s | 7 min |

## 6. Spawning and death

The advisor's answers that shape this stage:
- **Large males:** fights are quick and mostly settled by size; skill is timing and positioning.
- **Bears:** they take males first, then large females, and jacks last.
- **Jacks:** they fight each other for hiding spots when cover is scarce.
- **Females:** they judge gravel by cobble size.

| | Now | Full game |
|---|---|---|
| **Verb (female)** | Read the cobble, hold E to dig the redd, and charge rival females | Same, plus guarding until death and egg predators |
| **Verb (large male)** | Stay beside the female, and ram rivals side-on (Shift) before they reach her | Same, plus displays and jaw-locking fights |
| **Verb (jack)** | Claim a hiding spot under the bank (charge other jacks out), then dart in (E) when the big males clash | Same, over several spawning events |
| **Decision** | **Female:** which gravel. Medium cobble is best; coarse is hard to dig and fine gives the eggs less oxygen. **Large male:** when and where to meet a rival. Side-on and early beat head-on and late, but size still dominates. **Jack:** fight for a spot, or wait in the open and risk the guard. Go at once, or let another jack go first. | Same |
| **Threats** | **Rivals.** **Bears:** a shadow over a chosen fish, then a swipe. Bears choose males first, and jacks hiding in a spot are safe. **Other jacks:** taking your spot or your opening. | Same, plus senescence |
| **Result** | **Female:** eggs laid × redd quality. **Male:** share of the eggs fertilized. Both are scored against the cohort. | Same |
| **Then** | Death and decay as fades, then the eggs hatch, the recap and score, and the pick of the next fish from three offspring | Same, longer |
| **Length** | About 45 s | 5 min |

## Siblings

A dead fish is replaced by a sibling, which resumes at the last checkpoint. A checkpoint is the start of a stage, or past the nets in stage 5. "Field guide" mode gives 5 siblings and "Wild" gives 3. If every sibling dies before spawning:
- **"Field guide":** a stray from another stream continues the line.
- **"Wild":** the line ends.
