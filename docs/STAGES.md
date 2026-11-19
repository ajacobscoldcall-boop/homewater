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

Built from authored moments joined by time skips (the scene fades to dark water, a caption names the new season, and the next moment opens). The advisor named Dolly Varden and trout as the fry predators, and said about 60% of sockeye spend one year in fresh water.

| Moment | What happens |
|---|---|
| **Weed-edge lesson** (early summer) | A plankton patch just outside the weeds. After a few seconds a Dolly Varden notices the fry, warns (rings, a longer warning than later ones), then chases. Darting into the weeds ends the chase. |
| **Dusk feeding** (midsummer) | The light fades and the open-water plankton rises toward the surface. The richest food is high in open water, where Dolly Varden and trout patrol. Sparse food stays near the weeds. |
| **Winter under the ice** | Cold slows the fish, energy barely recovers, and every movement costs reserves. Food is a few drifting specks. Winter starts with more reserves after a good summer. With reserves empty, the fry burns its own growth. A slow predator still patrols. |
| **Spring decision** | The ice breaks up. Follow the drifting current to the outlet to leave (most fish do), or wait in the weeds to stay another year. A hint says whether this year's growth was good. |
| **Second summer** (if the fish stayed) | Another dusk feeding with an extra predator, then another winter passes off-screen. |

| | Now | Full game |
|---|---|---|
| **Verb** | Feed, read warnings, hide in the weeds, rise at dusk, rest in winter | Same, plus schooling |
| **Decision** | Open water is rich but exposed; the weeds are safe but sparse. In winter, rest or spend reserves. In spring, leave now or stay a second year (bigger when it leaves, more risk). | Same |
| **Threats** | **Dolly Varden and trout:** rings warn of a chase; they won't enter the weeds. Slower in winter. | Plus diving birds |
| **Failure** | Caught by a Dolly Varden. Starving in winter costs growth, which carries into adult size and jack odds; it does not kill outright yet (that needs a death cause and title). | Plus starving over winter |
| **Checkpoints** | Start of the stage, start of winter, start of the second summer | Same |
| **Growth** | Lake growth is recorded as bites (`fryBites`, `fryRichBites`; starving removes plain bites). The ocean stage turns it into a freshwater score: one good year is about half, two years nearly all. | Same |
| **Length** | About 1.5-2 min first life (later lives use 0.75 of the timed moments); add about 30 s for a second year | 5 min first life, shorter after |

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

A sequence of moments joined by time skips, kept within 20-40 m of the surface (advisor). The advisor named seals and sea lions, seabirds and whales as the main ocean predators, and said yes to salmon sharks.

| Moment | What happens |
|---|---|
| **Bait ball** | Feed on a drifting herring ball. No predators. |
| **Orca pass** (weeks later) | A smaller ball, and an orca: a dark silhouette and a warning, then a straight charge. Keep feeding or break off; swim across its path. |
| **Seal ambush** (near the surface) | Feeding near the surface. A seal shows as bubbles and a dark shape, then lunges at where the fish is going. Turn hard as it comes. |
| **Crowded year** (only when `oceanCrowding` is high, the pink-salmon years) | Pink salmon swarm the same food and eat it first. Fewer bites for the player. |
| **Salmon shark** (months later, deeper) | A fast grey shape below, then a straight strike. Swim across its path. |
| **Maturation reveal** (the first autumn at sea) | Advisor: the pathway is thought to be set after the first fall at sea, by genes and growth. `decideMaturation` runs here: jack or not, ocean years and adult size. Each extra year at sea is then survived with the late-ocean chance; jacks skip it. |

| | Now | Full game |
|---|---|---|
| **Verb** | Feed, then dodge each predator in its own moment | Same, longer moments |
| **Decision** | Keep feeding as a predator nears (more growth), or break off early (safer). In a crowded year, get to the food before the pinks. | Same |
| **Threats** | **Orca:** silhouette and warning, then a charge. **Seal:** bubbles and a dark shape, then a lunge aimed ahead. **Salmon shark:** a grey shape below, then a strike. | Plus seabirds at the surface |
| **Failure** | Taken by an orca, seal or salmon shark; lost at sea in a later year | Same |
| **Growth** | Ocean bites plus the lake's freshwater score make `growthPerf`, which sets adult size and raises jack odds | Same |
| **Length** | About 1.5-2 min first life (later lives use 0.75 of the timed moments) | 6 min |

## 5. The return: navigation

The advisor said navigation is the most interesting challenge. Salmon follow the magnetic field at sea and smell once in the river. The commonest mistakes are overshooting and entering the wrong river, and fish test a branch and back out.

| | Now | Full game |
|---|---|---|
| **Verb** | Follow a faint magnetic track across open water to the coast, then pick the right river mouth and swim upstream following the scent | Same, longer, with a lake crossing |
| **Decision** | **At sea:** stay on the track. It only shows when you are near it, so sweep to find it again. **At the nets:** find a gap; small fish slip through. **At the coast:** which mouth? Wrong rivers dead-end, so back out. **Upstream:** spend fat to burst, or rest in slack water. **At the fork:** test a branch and back out if the scent fades. | Same, plus timing against tides and fishery openings |
| **Threats** | **Gillnets** across the approach. **Bears** at the riffles (a shadow and a splash first). **Anglers' lures** swinging across the pools: if hooked, burst repeatedly to tear free. **Fat** running out, faster in warm, low-water years. | Plus eagles, heat stress |
| **Failure** | Caught in a net, taken by a bear, landed by an angler, or exhausted | Same |
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

**Habitats.** The advisor confirmed creek, lake beach and river. Each lineage belongs to one, and it is chosen for the first fish.

| | Creek | River | Lake beach |
|---|---|---|---|
| **Water** | Shallow, slow current | Deeper, fast current, coarse gravel | Still lake shore, shallow to deep |
| **Fish** | Baseline | Larger, deeper-bodied | Largest, deepest-bodied |
| **Bears** | Most frequent | Less often | Least often |
| **Jack cover** | 3 spots under the bank | 2 spots | 1 boulder |
| **Jack base rate** | 4% | 2% | 1.5% |

## Siblings

A dead fish is replaced by a sibling, which resumes at the last checkpoint. A checkpoint is the start of a stage, or past the nets in stage 5. "Field guide" mode gives 5 siblings and "Wild" gives 3. If every sibling dies before spawning:
- **"Field guide":** a stray from another stream continues the line.
- **"Wild":** the line ends.
