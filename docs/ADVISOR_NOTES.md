# Scientific advisor's answers

These answers come from a fisheries scientist advising on the biology. They have asked not to be credited, and not to have anyone they work with or know contacted. Their answers override earlier assumptions in the design.

Status markers: **Applied** (in the M1 build), **Planned** (affects a later milestone), **Open** (asked in the follow-up questions).

## Life stages and survival

- **Life history:**
  - Typical: 1 year in the lake, 2 at sea, about 60/40 against other patterns. **Applied:** `life.oceanAge2Share` = 0.6 of non-jacks.
  - Which other patterns are common: **Open**.
- **Causes of death by stage:**
  - **Eggs:** scouring floods.
  - **Fry:** larger fish (char).
  - **Smolt outmigration:** birds, other fish, seals.
  - **Ocean:** the same predators.
  - **Spawning grounds:** bears.

  Predation early in the marine phase is usually the bottleneck that shapes returns. **Applied:** the smolt run is now a predator gauntlet, with char, birds, mergansers, gulls and seals, and a school that gets picked off.
- **Survival:** about 5% marine survival is not unusual; freshwater survival is higher but still low. **Open:** freshwater numbers.
- **Egg and alevin:** eggs can do little. Alevin orient to light and current. **Applied:** the egg stage is now an alevin facing into a shifting current and avoiding light.
- **The return:**
  - Mass changes little, but fat is used up.
  - Fish stay fit while actively migrating, then turn sluggish and ragged after weeks on the spawning grounds.
  - They blush from silver to red in fresh water, and turn fully red with a green head only at the natal stream.
  - Males grow a hump, a large upper jaw and big teeth; females only change colour.

  **Applied:** blush on the return, with full colours only at spawning.

## Jacks

- **When the pathway is set:** it is thought to be set after the first fall at sea. It depends heavily on both genes and growth; jack parents and fast early growth both raise the odds. **Applied:** the threshold model, with growth raising liability.
- **Heritability:** varies by population, from about 0.15 to almost 1. **Applied:** a mid value, first 0.5, then 0.4 after the second round. Whether to vary it by stream is **Open**.
- **Behaviour:**
  - Jacks have lower reproductive success than large males, balanced by better survival from leaving the sea early.
  - They hide under logs, rocks and undercut banks, approach indirectly, and dart in while the pair is distracted.

  **Applied:** cover and openings. **Open:** how big the success and survival differences are.
- **Bank cover:** more bank cover means more hiding places, so more jacks can spawn before they start competing with each other. **Planned.**
- **Cohort mismatch:** leave it out. **Applied:** not modelled.
- **Large-male fights:** they ram at perpendicular angles with mouths open, may lock jaws, and settle it fast, mostly by size. **Planned.**
- **Frequency:** typically 1-2% of males in a Bristol Bay run; 10% is extremely high. **Applied:** creek base rate 4%. Captions must say jacks are rare.

## Spawning

- **Redd site:** gravel quality matters most. Cobble that is too large is hard to dig; too small and the eggs get less oxygen. **Planned:** gravel-size cues.
- **Guarding:** females guard against other females digging up their eggs, and against egg predators like trout, until they die. **Applied:** rival females. **Planned:** egg predators.
- **Clutch:** 2,000-5,000 eggs is normal. **Applied.**
- **Habitat:** river fish are larger and deeper-bodied than creek fish, and beach fish more so. Bears feed most easily in creeks, less in rivers and on beaches. **Applied:** creek, river and lake-beach habitats, with population size and depth, bear frequency and cover by habitat.
- **Female choice:** mostly comes down to which male wins the fights. **Planned.**

## Homing, humans and the ocean

- **Homing:** magnetic field at sea, smell from the river mouth. A few percent always stray; hatchery fish stray more. **Planned:** navigation is the most interesting challenge on the return, so lean into it.
- **Gillnets:** catch larger males more; the head and teeth tangle and the fish can't back out. **Applied.**
- **Trawl bycatch:** misleading for sockeye, which stay near the surface and are very rare in trawls. **Applied:** dropped.
- **Ocean competition** (for example with pink salmon) is a commonly implicated mechanism. **Applied:** ocean crowding.
- **Ocean predators:** seals and sea lions, seabirds and whales throughout ocean life. **Planned.**
- **Year to year:**
  - Ocean conditions, prey, temperature and flow all vary.
  - Populations keep diversity as a bet hedge.
  - Low water causes deaths before spawning; floods scour redds.

  **Planned.**

## Design choices put to the advisor

All confirmed:
- A composite watershed, not a real one.
- The six stages.
- The heritable trait list.
- Gillnets and anglers (no trawl).
- Creek, lake beach and river as spawning habitats.
- Players picking from three offspring.

The moments the advisor would most want players to experience at each stage:

| Stage | Moment |
|---|---|
| Alevin | Orienting in the current |
| Fry | Dodging char |
| Smolt | A gauntlet of predators, especially birds |
| Ocean | Dodging whales |
| Return | Navigating |
| Spawning | Dodging bears and getting mates |

## Accuracy and presentation

- **Common mistakes in films and games:** wrong appearance, missing details like the adipose fin, wrong colours. **Applied:** adipose fin. Screenshot review is **Open**.
- **What players should take away:**
  - There is a lot of life-history diversity at every stage.
  - Mortality can be very high and largely random.
  - A fish that survives and passes on its genes is close to a miracle.
- **Review:** will review captions, but prefers not to be credited. Does not want to record narration.
- **Visual references:** the photography and video of Jason Ching, Eiko Jones and Paul Vesci.

## Second round of answers

**Credit:** citing their published papers is fine. They will review screenshots once fish models exist.

**Survival**
- Eggs: about 10-20% survive to emerge. Fry: about 5-10% survive to leave the lake. **Applied:** in end-of-stage captions.
- Visible deaths the player can react to, with chance showing up through floods, bad years and siblings lost off-screen, is "good for balancing scientific validity with player experience". **Applied:** this is the design.
- Bet hedging: traits that thrive one generation can fail the next. For example, all your jack offspring do well one year and not the next. **Applied:** year conditions interact with traits. Warm years favour early runs and cool years late runs; high water is harder on early-run and deep-bodied fish; low water exposes deep bodies to bears; big runs give jacks more openings and large males more rivals. The recap says what each year favoured.

**Early life**
- Alevin orient toward the light and into the current (positive rheotaxis), to stay upright, keep oxygen flowing, and prepare to feed. **Applied:** the alevin faces the current and swims up toward the light when ready. The earlier "light means being seen" rule was removed.
- Fry predators in the lake: Dolly Varden and trout. **Applied.**
- **Smolts:**
  - They run in large groups to swamp predators, and tend to go at night.
  - Char hit them at lake outlets and stream mouths, birds more as they near the sea, and seals once in salt water.

  **Applied:** the run is at night, birds are thinned on the upper river, and seals are at the mouth.

**Life history and jacks**
- About 60% spend one year in fresh water. Ocean age is close to an even split between 2 and 3. **Applied:** `life.oceanAge2Share` = 0.5.
- **Sizes:** jacks about 300 mm (less than half most males), ocean age 2 about 500 mm, ocean age 3 about 700-800 mm. **Applied:** sizes 0.4 / 0.67 / 1.0. Gillnet mesh retuned so jacks slip through and most others are caught.
- Survival in later years at sea is much higher than early, but still around 50%. **Applied:** each extra year at sea is survived with that chance (kinder on "Field guide"). Jacks skip it.
- Heritability: 0.4 is a reasonable middle. **Applied.**
- Jacks far commoner in the game than in nature is fine, if the game says they are rare. **Applied:** captions say so.
- When cover is scarce, jacks fight each other for hiding spots. **Applied:** three spots under the bank, contested by other jacks.

**Spawning**
- **Large males:** timing and positioning are what skill should decide. **Applied:** ramming side-on and before the rival reaches her improves the odds, but size dominates.
- **Females:** judge gravel by cobble size. **Applied:** patches show cobble size, and medium cobble is best.
- **Lifespan after spawning:** females live several weeks after spawning, rarely more than a month.
- **Bears on the spawning grounds:** they take males first, then large females, jacks last. **Applied:** bears pick targets by those weights.

**Return and navigation**
- At sea: "an invisible track that represents the field". The commonest mistakes are overshooting and entering the wrong river. **Applied:** a faint magnetic track, three river mouths, and wrong rivers as dead ends.
- In the river, fish test a branch and back out. **Applied:** wrong branches and wrong rivers are dead ends with fading scent.
- Low water kills through heat stress and low oxygen. **Applied:** warm, low-water years drain fat faster, with a caption.

**Ocean**
- Orcas, and yes to salmon sharks. **Applied.**
- Sockeye stay within 20-40 m of the surface. **Applied:** the ocean arena is that band.
- Pink salmon make every other year crowded. **Applied:** crowding alternates by generation.

**Appearance**
- Spots matter for telling species apart. Tail shape and eye size change across the life cycle. **Applied:** tail fork and eye size vary by stage, and sockeye have no spots. **Open:** screenshot review.


## Open questions from the fry and ocean rebuild

These are game choices made without advisor input. They are marked placeholder in params.json where they are numbers. Ask in the next round.

- **Dusk feeding:** the fry stage has plankton rising toward the surface at dusk, and the `fry.dusk` caption states it. **Open:** is this right for sockeye nursery lakes?
- **Winter:** cold slows the fry and food is scarce. Predators are slower but still active under the ice. **Open:** is this a fair picture?
- **Weeds in winter:** they still shelter the fry. **Open:** do the weed beds die back in winter?
- **A second lake year:** the game says a fish that stays leaves bigger, at the cost of another year among predators. **Open:** is that the real trade-off?
- **When a male's path is set:** `ocean.autumnMale` says it is thought to be set in the first autumn at sea, by genes and growth. **Open:** is that wording right?
- **Seals at sea:** a seal lunges at where the fish is going. This is a game mechanic. **Open:** anything to correct about how seals take salmon at sea?

## Open questions from the accuracy audit

An audit of every caption and journal entry found these claims the notes don't settle. The wording in the game was softened in the meantime.

- **Ocean diet:** what do sockeye mostly eat at sea? The ocean stage shows a herring bait ball, but sockeye are thought to feed mainly on zooplankton such as krill, plus squid and small fish. The captions now say "krill and small fish", and the food patch is now drawn as a krill swarm with a few small fish and the odd small squid (`src/render/krill.ts`).
- **Weed cover for lake fry:** do fry use the weedy shallows as cover from char and trout, perhaps only in early summer?
- **Lake growth and jacks:** does growth in the lake affect a male's odds of becoming a jack, or mainly growth in the first months at sea? The game counts both.
- **Year effects:** the game makes warm, cool, high-water, low-water and big-run years favour different traits. Can these be stated as biology, or should they be framed as game rules? The captions now say "this year favours", without a mechanism.
- **Bears:** do bears pick deeper-bodied fish? Is "less easily" right for beaches compared with creeks?
- **Gillnets:** is "gillnets catch many returning sockeye" fair for Bristol Bay?
- **Fights:** do timing and a side-on position really change who wins, or is it almost all size?

## Open questions from the spawning rebuild

Game choices made without advisor input, marked placeholder in params.json.

- **Covering the eggs:** after spawning, the female sweeps gravel over the eggs (hold E), and uncovered eggs survive half as well (`spawn.unburiedSurvival`). **Open:** is that a fair picture, and how big is the difference?
- **Redds dug over:** each time another female digs over a redd after spawning, 30% of the eggs are lost (`spawn.superimposeLoss`), and rival females come more often late in the season (`spawn.lateRivalRamp`). **Open:** is superimposition commoner late in the season, and how costly is it?
- **A second female:** a large male who has spawned can leave to spawn with another female, at a cost in strength and with more bear risk. **Open:** do large sockeye males spawn with several females, and do they stay with one after spawning?
- **Frequency-dependent jack success:** a sneak is worth less in years when jacks are commoner (`spawn.jackFreqStrength`), and jack-rich years bring more rival jacks. **Open:** is this the right shape, and how strong is the effect?
- **Senescence:** strength drains steadily on the grounds and faster with hard effort; weeks are compressed into about two minutes. **Open:** do hard effort and fights speed up senescence?


## Open questions from the gore and decay visuals

- **Net marks:** the notes say a tangled fish cannot back out. The game lets fish in the mesh's slip band squeeze through, and draws rubbed marks on them. Do fish survive net encounters with marks like that?
- **Spawned-out fish:** the game shows pale patches spreading over the skin and frayed fins. The notes only say "sluggish and ragged". Is that a fair picture?
- **Predator marks:** orca rakes drawn as parallel tooth marks, seal and shark bites as arcs. Anything to correct?

## Open questions from the population stream

The lineage now lives in a river whose run carries over from generation to generation (`src/sim/population.ts`, parameters `population.*`, all biology values marked placeholder). Game choices made without advisor input:

- **Stock and recruitment:** the run that comes home is a Ricker curve of the spawners that reached the grounds a generation earlier (`population.rickerProductivity` 1.6 as ln recruits per spawner), with lognormal year-to-year noise (`population.recruitSd` 0.4). **Open:** is a Ricker curve with these values a fair simple picture for a Bristol Bay-type sockeye stock? Is the noise about right?
- **Escapement goal:** the fishery lets about 45% of a typical run through to spawn (`population.escapementGoal`), takes the rest up to 65% of a big run (`population.maxHarvestRate`), and closes when the run is below the goal. The goal also sets the Ricker capacity, so a run fished to the goal replaces itself. **Open:** are these shares reasonable? Is "the fishery closes in small runs" fair to say?
- **Crowded lake:** food per fry falls with the size of the cohort (food ∝ fry^−0.5, `population.fryDensity`), bounded to 0.6-1.4× a typical year. **Open:** how strong is density-dependent growth in sockeye nursery lakes?
- **Carcass nutrients:** a big spawning run enriches the lake for the cohort that rears there (+15% food per extra typical cohort of spawners, `population.carcassEnrichment`), always weaker than the crowding. **Open:** is a modest effect of this size fair, and is the young of that same run the cohort that benefits?
- **Pink years and returns:** fewer of a cohort come home from a crowded (pink) ocean (`population.crowdingSurvival`). **Open:** is there support for that, or only for smaller size?
- **Nets follow the fishery:** the number of gillnet lines on the approach follows the fishing effort implied by the year's harvest share (none in a closed year, up to four in a heavy one). This is a game mechanic.
## Open questions from scent imprinting and body change

Game choices made without advisor input, marked placeholder in params.json (`imprint.*`).

- **When imprinting happens:** the game lets a fish learn the smell of home a little as an alevin (facing into the flow in the gravel), some as a fry (time in a plume of home water where it enters the lake), and most on the smolt run (swimming with the school without panicking), plus a share for reaching the sea. **Open:** is it fair to show imprinting at all three stages, with the smolt stage most important? Do lake-rearing sockeye imprint on their natal stream or beach, on the lake, on the outlet, or on all of them in turn?
- **Calm versus panic:** the smolt only learns while not bursting. This is a game device to reward calm schooling. **Open:** is there any basis for stress or speed affecting imprinting, or should we drop this link?
- **Imprinting and straying:** a poorly imprinted fish gets a weaker, patchier home scent and finds wrong rivers smelling almost like home, so it strays into dead ends more easily; a well imprinted fish can tell a wrong river at once. **Open:** is weaker imprinting a reasonable cause of straying in sockeye, alongside the inherited homing tendency? How strong should the effect be?
- **Beach spawners:** for lake-beach fish the "home water" plume in the lake is a stand-in. **Open:** what do beach spawners imprint on?
- **Body change on the return:** colours deepen and (in males) the hump and hooked jaw grow gradually up the river, reaching full spawning dress only on the grounds; fish visibly thin as fat runs down; females darken less and jacks change less. This is render only. **Open:** is a gradual change up the river right, or do sockeye change mostly in the last days before spawning? How much do females and jacks change by the time they reach the grounds?

## Open questions from temperature and oxygen on the return

The notes say low water kills through heat stress and low oxygen. The return now has water temperature and dissolved oxygen that vary along the home river (`src/sim/stages/returnWater.ts`, params `return.water.*`). Everything below is a game choice, marked placeholder, except the textbook fact that warmer water holds less oxygen at saturation.

- **Where the cool water is:** in a warm, low-water year the game makes the lower river warmer than the upper river, shallow riffles warmer, deep pools cooler (cooler near the bottom), and puts a cold spring seep in each pool. Spring water stays at 10 °C in any year. **Open:** is this a fair picture of where returning sockeye find cool refuges? Are cold tributary mouths a better example than seeps?
- **Oxygen in seeps:** the game gives seeps more oxygen only because they are colder. Groundwater can be low in oxygen. **Open:** should a seep be cooler but not better oxygenated?
- **Numbers:** the river runs at 13 °C in an ordinary year and can reach about 23-26 °C in riffles in an extreme warm, low-water year. Above 15 °C fat burns faster and energy recovers more slowly; above 19 °C heat stress builds; below 8 mg/L of oxygen the burst weakens and stress builds. **Open:** are these thresholds sensible for migrating sockeye? What temperatures are dangerous, and for how long?
- **Through the day:** in a warm year the water warms by about 2 °C from dawn to afternoon. **Open:** is a daily swing of that size reasonable for a salmon river in late summer?
- **Recovery:** resting in cold water lets heat stress ease, in tens of seconds of game time. **Open:** do migrating salmon recover from heat stress by holding in cool water, or is the damage lasting?
- **Heat as a cause of death:** a fish whose heat stress builds to the limit dies (`heat`), with the caption "Killed by heat stress". **Open:** is it fair to show this as a direct death on the migration, rather than as fish that reach the grounds and die before spawning?
## Open questions from the falls and fellow migrants

Game choices made without advisor input, marked placeholder in params.json where they are numbers.

- **Leaping falls:** the home river now has rapids and a falls. A leap clears it when launch speed plus the spot (under a lower step in the crest, from the standing wave below the falls) is good enough (`return.leapNeed`, `leapNotchBonus`, `leapWaveBonus`). **Open:** is it fair to say salmon pick a lower step and use the standing wave? How many tries is typical?
- **The cost of a failed leap:** energy and a little stored fat (`return.leapFailFat`). **Open:** is the cost to reserves of failed attempts worth showing, and how big is it?
- **The side channel:** after several failed leaps a lower, longer side channel opens, at a cost in fat (`return.chuteFatCost`). This is a game fallback so nobody is stuck. **Open:** do sockeye use side channels or easier routes round falls?
- **Resting behind boulders:** the game gives extra recovery in the slack water behind rapids boulders (`return.eddyRegen`). **Open:** is resting in eddies between bursts a fair picture of how salmon pass rapids?
- **Fellow migrants and bears:** other returning sockeye travel with the player; a bear may take one of them instead, and a swipe among them takes only one fish (`return.migrantShield`, `return.migrantDilution`). **Open:** does travelling in a group dilute bear risk for adults the way it does for smolts? Do bears at falls favour leaping fish?
- **Jostling:** fish in the school bump the player a little. **Open:** is that a fair picture of a crowded run, or do adults keep more space?
## Open questions from the behaviour stream

Game choices made without advisor input, marked placeholder in params.json.

- **Schools burst apart:** school-mates and the krill patch burst away from a striking predator and then regroup (`flock.*`). Flash expansion is well described for schooling fish. **Open:** do sockeye smolts school like this on the way out, and at night?
- **Bears eating part of each fish:** a bear eats its catch on the bank and eats less of each fish in a big run (`spawn.bearEatShare`, `spawn.bearPartialPlenty`), as published field studies of bears on salmon streams describe. **Open:** is that true on sockeye spawning grounds, and how much is left?
- **Choosier bears in a big run:** in a big run the preference order (males, then large females, jacks last) is sharpened (`spawn.bearChoosy`) and bears strike more often (`spawn.bearPlentyRate`). Larger females are preferred over smaller ones (`spawn.bearSizePref`). **Open:** is that a fair picture?
- **One fish per strike:** a bear takes the fish it chose if it is still in reach, otherwise the one nearest its strike. **Open:** is that right, or do bears often miss and try again?
- **Bears walking the bank:** a bear patrols the bank between strikes and hurries along it to a chosen fish. **Open:** do bears on spawning streams fish from one spot, or walk the bank?
- **Scavengers:** gulls and a bald eagle come to carcasses and to dead fish drifting late in the season. **Open:** which scavengers are commonest on sockeye spawning grounds, and do eagles take floating carcasses?
- **Predator personalities:** individual char, mergansers, seals and orcas differ a little in speed, patience and the angle they come in from (`behaviour.*`). This is a game mechanic.
