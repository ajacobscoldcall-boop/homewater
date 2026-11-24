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
| **Verb** | Turn to face into the current (A/D or mouse). Sink (C) or rise (Space) within the gravel. Crawl (W) a short way through the gaps between the stones. Ride out one flood. | Same, with more varied flows |
| **Decision** | **Sink:** deeper is more sheltered from surges. **Time the rise:** swim up toward the light once the yolk is nearly used. Rising early leaves you exposed to surges. Every move costs a little yolk, and leftover yolk becomes the fry's starting energy. **Where to lie:** out of still water; in the silt, beside the big stone whose gap is open at your height (low beside some stones, higher beside others); when the sculpin comes, down deep against a stone, and then not moving at all, because movement draws it. | Same |
| **Threats** | **Flow surges:** the drifting flecks swing to a new direction, then surge. A misaligned alevin gets loosened. **The flood** (once, about a third of the way through the yolk): the water rises, darkens and clouds with silt for about 4 s (longer on Field guide, shorter on Wild) while the flow swings to the flood's direction; then about 7 s of scouring flow that swings suddenly from side to side. Only a fish deep in the gravel and facing upstream holds; the top of the gravel is stripped however well you face. **Brood-mates:** about a dozen alevin hatch around the player; the flood tears most of them out (more in high-water years) and surges take a few more, so the loss the advisor describes (only 10-20% of eggs emerge) is seen. The card after the flood says how many were lost. **The low-oxygen pocket** (first): the flecks around the alevin slow and stop, the water turns murky, and after a few seconds the oxygen falls; the oxygen and strength rings appear, the heartbeat starts as it weakens, and crawling out to moving water restores it. **The sculpin:** a mottled bottom fish glides in over the gravel (a warning and a marker), then noses into the gaps at one spot after another for about 7 s; movement and lying high give the alevin away, and even a still alevin in the open can be found, but one still and deep against a big stone is not. It may take a brood-mate. **Silt** (after the flood): the water clouds and dims and the flecks slow, then silt settles and clogs the gravel for about 16 s; water still moves only in the gap beside each large stone, at that stone's height. Brood-mates lying in clogged gravel are smothered, and a caption says how many are left. A first life meets all four in order (pocket, sculpin, flood, silt); later lives the flood and one other. | Plus freezing |
| **Failure** | Washed out (scour), smothered (no oxygen), taken by a sculpin, or exhausted (yolk spent with no emergence) | Same |
| **Length** | About 2 min in a first life (all four events); under a minute in later lives (the flood and one other), including a 4 s egg interlude | 2 min first life, then a 1 min vignette |

## 2. Fry in the lake

Built from authored moments and lived lake days, joined by time skips (the scene fades to dark water, a caption names the new season, and the next moment opens). The advisor named Dolly Varden and trout as the fry predators, and said about 60% of sockeye spend one year in fresh water.

| Moment | What happens |
|---|---|
| **Weed-edge lesson** (early summer) | A plankton patch just outside the weeds. After a few seconds a Dolly Varden notices the fry, warns (rings, a longer warning than later ones), then chases. Darting into the weeds ends the chase. |
| **Lake days** (summer) | The summer is lived as lake days (about a minute each, two in the first summer): dawn, day, dusk, night, with the light and the sky following. By day the plankton sinks deep and thins out, the surface and the shallows are bright and warm (warm water burns growth), mergansers hunt from the surface, and a Dolly Varden sees a fry from far off near the top: keep deep and dark. From dusk to dawn the plankton is up near the surface: the best feeding is at dusk and dawn, in the half-light, when char see less far; at night it is too dark to feed well. One char keeps to the weed edge, the others patrol deep by day and rise from dusk to dawn, so neither depth is simply safe. |
| **Winter under the ice** | Cold slows the fish, energy barely recovers, and every movement costs reserves. Food is a few drifting specks. Winter starts with more reserves after a good summer. With reserves empty, the fry burns its own growth. A slow predator still patrols. |
| **Spring decision** | The ice breaks up. Follow the drifting current to the outlet to leave (most fish do), or wait in the weeds to stay another year. A hint says whether this year's growth was good. |
| **Second summer** (if the fish stayed) | More lake days with an extra predator, then another winter passes off-screen. |

| | Now | Full game |
|---|---|---|
| **Verb** | Feed, read warnings, keep deep by day and rise at dusk and dawn, hide in the weeds from char, dive from birds, rest in winter | Same, plus schooling |
| **Decision** | Each lake day: deep and dark (safer, cold, little food) or up near the surface (food at dusk and dawn, birds and char by day). The weeds hide a fry from char but not from birds. In winter, rest or spend reserves. In spring, leave now or stay a second year (bigger when it leaves, more risk). | Same |
| **Threats** | **Dolly Varden:** rings warn of a chase; they won't enter the weeds; they see farther in bright water and lose a fry that falls behind in the dark. Slower in winter. **Mergansers:** time near the surface or over the shallows in daylight brings one; it floats and paddles toward the fry (the bird against the surface and its ripples are the warning), then dives and chases; deeper than it can reach is the escape. | Plus other birds if the advisor supports them |
| **Failure** | Caught by a Dolly Varden or a merganser. Starving in winter costs growth, which carries into adult size and jack odds; it does not kill outright yet (that needs a death cause and title). | Plus starving over winter |
| **Checkpoints** | Start of the stage, start of winter, start of the second summer | Same |
| **Growth** | Lake growth is recorded as bites (`fryBites`, `fryRichBites`; starving removes plain bites). The ocean stage turns it into a freshwater score: one good year is about half, two years nearly all. | Same |
| **Length** | About 2.5-3 min first life (later lives about 2 min: lake days are 0.75 as long); add about 1.5 min for a second year | 5 min first life, shorter after |

## 3. Smolt run: the gauntlet

The advisor said predation during outmigration is the key bottleneck, and pictured it like the opening of Saving Private Ryan.

| | Now | Full game |
|---|---|---|
| **Verb** | Ride the current downriver in a school of 40 smolts. Dodge, dive and burst. | Same, longer, with night runs |
| **Decision** | **Stay with the school:** predators pick from the whole school, so close school-mates dilute your risk. A bird strike or seal lunge that reaches you among school-mates takes only one fish, and it is often another one (strongly on Field guide, a little on Wild). After a near miss, predators pick other fish for a moment (2-3 s on Field guide, under 1 s on Wild). **Spend energy:** bursts are limited. **Choose your water:** deep water avoids birds, banks give cover, and open water is fast. | Same |
| **Threats** | **Lake outlet:** char lunge from below, with a ring warning. **River:** diving birds (a shadow on the surface) and mergansers (a splash ahead, a short dive, then an underwater chase). **River mouth:** gull flocks with several shadows, and seals (bubbles and a dark shape, then a straight lunge aimed ahead of the target). | Plus terns and larger fish |
| **Failure** | Taken by a char, bird, merganser or seal | Same |
| **Also** | The stage-end card says how many of the 40 school-mates were taken | Same |
| **Length** | About 35-45 s | 4 min |

## 4. Ocean years

A sequence of moments joined by time skips, kept within 20-40 m of the surface (advisor). The advisor named seals and sea lions, seabirds and whales as the main ocean predators, and said yes to salmon sharks.

| Moment | What happens |
|---|---|
| **Feeding patch** | Feed in a drifting swarm of krill, with a few small fish and the odd small squid. No predators. |
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
| **Decision** | **At sea:** stay on the track. It only shows when you are near it, so sweep to find it again. **At the nets:** find a gap; small fish slip through. **At the coast:** which mouth? Wrong rivers dead-end, so back out. **Upstream:** spend fat to burst, or rest in slack water. **In the rapids:** dash from boulder to boulder and rest in the slack water behind each. **At the falls:** rest in the plunge pool, then build speed and leap (burst and rise together near the surface) from the standing wave under the low step; a failed leap costs energy and a little fat and drops the fish back. After several failures a side channel opens: a longer climb that costs fat. **At the fork:** test a branch and back out if the scent fades. | Same, plus timing against tides and fishery openings |
| **Threats** | **Gillnets** across the approach. **Bears** at the riffles and on the lip of the falls (a shadow and a splash first). **Anglers' lures** swinging across the pools: if hooked, burst repeatedly to tear free. **Fat** running out, faster in warm, low-water years. **Heat** in warm, low-water years: heat stress builds in warm water and eases in cool pools, seeps and the lake below the thermocline; time spent heat-stressed adds to a lasting toll carried to the grounds, and only full stress in the very hottest water kills on the spot. | Plus eagles |
| **Company** | About a dozen other sockeye join at the home river's mouth and travel with the player: they hold in pools, jostle, try the falls (some fail), and split at the fork. A bear's swipe among them takes only one fish, and a bear may go for one of them instead of the player. | Same |
| **Failure** | Caught in a net, taken by a bear, landed by an angler, exhausted, or killed by heat in extreme water | Same |
| **Checkpoint** | Inside the home river; above the falls | After each encounter |
| **Length** | About 90-130 s (the rapids and falls add about 10-20 s for a careful player) | 7 min |

## 6. Spawning and death

The advisor's answers that shape this stage:
- **Large males:** fights are quick and mostly settled by size; skill is timing and positioning.
- **Bears:** they take males first, then large females, and jacks last.
- **Jacks:** they fight each other for hiding spots when cover is scarce. They are rare (1-2% of males is typical) and have lower reproductive success than large males.
- **Females:** they judge gravel by cobble size. Which male they spawn with mostly comes down to who wins the fights. They guard against other females digging up their eggs until they die, and live several weeks after spawning, rarely more than a month.
- **Senescence:** fish turn sluggish and ragged after weeks on the spawning grounds.

| | Now | Full game |
|---|---|---|
| **Verb (female)** | Read the cobble and hold E to dig the redd (not on top of another female's). Wait over the finished redd for a male (two males may fight; she spawns with the winner). Hold E again to cover the eggs, charging off any char that comes for them (Shift), then charge rival females until her strength runs out | Same |
| **Verb (large male)** | Stay beside the female, and ram rivals side-on (Shift) before they reach her. After spawning, a second female arrives along the bed: swim to her for a second spawning, or stay | Same, plus displays and jaw-locking fights |
| **Verb (jack)** | Claim a hiding spot under the bank (charge other jacks out), then dart in (E) when the big males clash, beside his own pair or any crowd pair close by, as often as the openings come | Same |
| **Decision** | **Female:** which gravel. Medium cobble is best; coarse is hard to dig and fine gives the eggs less oxygen; the best patches draw more rival females, and on crowded grounds space goes first. Then cover the eggs at once, or chase a rival or a char first. **Large male:** when and where to meet a rival. Side-on and early beat head-on and late, but size still dominates. After spawning, leave for a second female (costs strength, bears come more often) or stay. **Jack:** fight for a spot, or wait in the open and risk the guard. Go at once, or let another jack go first. | Same |
| **Threats** | **Rivals.** **Bears:** a shadow over a chosen fish, then a swipe. Bears choose males first, and jacks hiding in a spot are safe. **Other jacks:** taking your spot or your opening; there are more of them in jack-rich years. **Rival females** digging over the eggs, more often late in the season, on crowded grounds and on good gravel. **Egg thieves:** char come for uncovered eggs (a warning, then they eat until charged off or the eggs are covered); over a shallow redd a gull too, which only covering stops. **The crowd:** dozens of other spawners in a typical year, many more in a big run, a handful in a small one; the rivals come out of it, and the bear chooses among the crowd near it as well as the player. **Senescence:** strength drains on the grounds (faster when bursting) and never recovers; energy cannot rise above it. **A warm year's toll:** the heat toll carried up the river, plus crowding in warm water, means less strength on arrival, faster senescence and, before spawning, a chance of dying first. | Same |
| **Failure** | No spawn before strength runs out (or the season's 180 s cap), taken by a bear, or (a burdened fish in a warm year) died before spawning | Same |
| **Result** | **Female:** eggs laid × egg survival, where survival = gravel quality × burial × (1 − loss) for each time the redd was dug over × (1 − the share char and gulls took) (`eggSurvival`). **Large male:** share of the eggs fertilized, from one or two females. **Jack:** each sneak adds a share that falls as jacks get commoner (`jackFrequencyFactor`), capped below a large male's. All are scored against the cohort. | Same |
| **Then** | Death and decay as fades, then the eggs hatch, the recap and score, and the pick of the next fish from three offspring | Same, longer |
| **Length** | About 2 min for a female or jack (until strength runs out), about 1 min for a large male who stays and 1.5 min for one who leaves | 5 min |

**Frequency-dependent jack success.** The run's jack share is the habitat's base rate × the year's run size (`yearJackFraction`). One sneak is worth `jackShareBase × (1 + k·ref) / (1 + k·share)`: 1× at the creek base rate, more when jacks are rarer, less when they are commoner. Jack-rich years also bring more rival jacks to the grounds (`rivalJackCount`), so openings are contested more, and large males lose a little more of their share to sneakers.

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
