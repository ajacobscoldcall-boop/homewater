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

## Open questions from the scale and fish-looks stream

Render only: nothing here changes the simulation. Sizes come from published sources listed in `tests/unit/scale.test.ts`; the choices below are presentation, not new biology.

- **Drawn sizes:** every model is now drawn within about a third of its real size beside the player's fish (`?gallery=scale`). Krill are about 2 cm beside a 60 cm sockeye, a harbor seal is about 15 times a smolt's length, eggs are about 6 mm. **Open:** do any of the sizes look wrong to you?
- **Eyed eggs:** the game's egg stage is the last stretch before hatching, so the eggs are shown eyed throughout, the eyes darkening as hatching nears, with the curled embryo and an oil drop showing through a translucent orange-red shell. **Open:** is that a fair picture of sockeye eggs just before hatching?
- **Alevin, fry and smolt looks:** the alevin carries a large orange yolk sac under the front half of its body; fry have a row of short dark oval parr marks along the lateral line and a speckled olive back; smolts are bright silver with a dark blue-green back and dark-edged tail. **Open:** are the parr marks the right shape and number for sockeye fry?
- **Plankton swarms:** each bite of food in the lake is drawn as a small swarm of zooplankton a few millimetres long, not one large ball. **Open:** which zooplankton matter most to sockeye fry in Bristol Bay-type lakes (Daphnia, Bosmina, copepods), and should rich patches look different?
- **The night run:** the smolt run is drawn as a clear moonlit night (moon and stars through the surface, dark water, silver school). **Open:** do smolts mostly run on dark nights, or does moonlight matter?
- **Dolly Varden in the lake:** drawn about 24 cm long, the low end of lake char sizes, so the fry stage stays readable. **Open:** how big are the char that eat sockeye fry?
- **School-mates:** smolt school-mates are drawn the player's size or a little smaller (84-100%), so the player's fish stands out. This is a game device.
## Open questions from the camera and Documentary view stream

Presentation only; nothing in the simulation changed.

- **The startle:** in both views the player's fish flinches away when a predator first warns or turns to strike near it (render only). Fast-start escape responses are well described in fishes. **Open:** is a visible flinch at the first sight of a predator a fair picture for juvenile and adult sockeye, or would they more often freeze or hold still?
- **Scent as a shimmer:** in Documentary view the home scent is drawn as a faint shimmer in the water and the magnetic track as soft glows of light. Both are game devices: neither smell nor the magnetic field can be seen. **Open:** none for the biology; noted so captions never describe the shimmer as something real.

## Open questions from the text diet stream

Presentation only; nothing in the simulation changed.

- **Shortened lines:** long captions now show a shorter line on screen (the `*.short` IDs in `src/data/captions.json`); the full line is one click away and always in the journal. Every short line is cut from its approved full line, without new claims, but some lose a qualifier or a reason (for example `return.bear.short` drops "Shallow riffles are where bears fish", `ocean.yearsAtSea.short` drops "perhaps half of fish survive each later year", `fry.decide.short` keeps "About 6 in 10" but drops the trade-off). **Open:** does any short line now read as stronger or plainer than the evidence allows?
- **Stage card year lines:** the cards now say the year in a few words ("A warm year. High water. More nets on the approach."), with the full effects behind a link. These are the same game mechanics as the `year.*` and `pop.*` captions. **Open:** none for the biology.
## Open questions from the recap and life map stream

Presentation only; nothing in the simulation changed.

- **The route map:** between stages and on the recap, one life's route is drawn as an illustrated map: the nest in a creek or river feeding a nursery lake (or on the lake's beach), an outlet river with the rapids, falls and fork down to the sea, one loop at sea for each year there, then the coast and nets and back up the same river and across the lake to the nest. The geography is a game device, not a real river: the return stage's falls and fork are placed on the outlet between the lake and the sea. **Open:** is it fair to draw river-spawning sockeye with their nest in a river that feeds the nursery lake?
- **Counting the years:** the map counts a life as about half a year in the gravel, one or two years in the lake, one to three years at sea and a summer home, and says "about N years from egg to spawning", with N the lake years plus the sea years plus one (so a fish with one lake year and two years at sea is "about 4 years"). **Open:** is that the right way to put sockeye age to players?
- **What a trait means in a year:** each offspring card has one line saying what its inherited traits mean in the coming year, following the bet-hedging rules already applied (warm and cool years and run timing, high water and run timing and body depth, low water and body depth, big and small runs and the jack leaning). Body depth only counts against deep bodies, as in the game's rules. **Open:** none beyond the earlier bet-hedging questions; noted because the cards now state these effects in plain words.
- **Suggested:** on Field guide the offspring that best fits the coming year gets a "Suggested" badge, when one clearly stands out. This is a game device; it says nothing about which fish a real river would favour over many years.
- **Portraits:** offspring are drawn in spawning dress; a male is drawn as a large male unless his inherited jack leaning is strong, then as a jack. Whether a male becomes a jack is still decided in play (growth matters). This is a game device.

## Open questions from the fry day cycle and birds stream

The fry stage is now lived as lake days (`src/sim/stages/fry.ts`, params `fry.*`). Diel vertical migration of juvenile sockeye is well described in published work (Narver 1970; Clark & Levy 1988; Scheuerell & Schindler 2003, cited in params.json), but the notes do not cover it yet, so the captions hedge it ("are thought to"). Everything below is a game choice, marked placeholder.

- **The day cycle:** a lake day (about a minute of play) runs dawn, day, dusk, night. By day the rich plankton sinks to the deep and thins out; from mid-dusk to mid-dawn it is near the surface. The fry is shown best off deep by day and up at dusk and dawn. **Open:** is "deep by day, up at dusk and dawn" a fair picture for Bristol Bay-type nursery lakes? Do fry also feed at night, or by day in some lakes?
- **Feeding by sight:** a bite in the dark counts for 30% of a daylight bite (`fry.nightBite`), rising to full above 30% of daylight (`fry.sightLight`). **Open:** how much do sockeye fry feed in the dark?
- **Warm and cold water:** above `fry.warmDepth` and anywhere over the weed shallows the water is warm, and the fry slowly loses growth there (`fry.warmCost`); bites eaten in cold deep water grow it 55% as much (`fry.coldBite`). This is our reading of the bioenergetic idea (Brett 1971) that cold water costs less when food is scarce. **Open:** is that a fair simple trade-off, and roughly how big is it?
- **Char sight and the dark:** a Dolly Varden sees a fry from up to 10 units in bright water near the surface, much less in the dark or the deep (`fry.detectFloor`, `fry.sightCurve`, `fry.lightDepth`), and gives up a chase once it falls far enough behind in dim water (`fry.chaseSight`). One char keeps to the weed edge; the others patrol deep by day (`fry.charDayDepth`) and rise toward the surface from dusk to dawn (`fry.charNightDepth`). **Open:** do char in sockeye nursery lakes follow the fry and plankton up and down? Do they hunt mostly at dusk and dawn?
- **Birds over the lake:** the notes support mergansers, gulls and other birds as predators of smolts on the way out, not of fry in the lake. The game uses only the common merganser over the lake: by daylight and in the half-light, time near the surface or over the shallows brings one; it lands, paddles toward the fry, dives and chases down to `fry.mergReach`, and deeper water is the escape. The weeds do not hide a fry from it. **Open:** do mergansers take sockeye fry in nursery lakes, and how deep do they chase? Which other birds matter for lake fry (Arctic terns, loons, grebes, gulls, kingfishers)? We left terns and loons out until you say.
- **Neither depth is safe:** the shallows and the weeds hide a fry from char but not from birds; the deep hides it from birds but not from char. This is a game device to make the daily choice a real one.
- **Lake growth:** a good year's growth comes mostly from dusk and dawn feeding, so the freshwater score that feeds maturation is a little lower than before for players who keep deep all day, and higher for those who feed boldly and survive. **Open:** none beyond the earlier lake-growth questions.
## Open questions from the lake crossing (home through the lake)

The return now ends with a crossing of the nursery lake: the home branch of the river opens into the lake, and the fish finds its own inflowing stream (creek and river homes) or stretch of beach (lake-beach homes) across it (`src/sim/stages/returnLake.ts`, params `return.lake.*`). Game choices made without advisor input, marked placeholder in params.json where they are numbers. The captions give these as instructions or plain physics, not as sockeye biology.

- **Waiting while the colours come on:** the fish reaches the lake before it is ready to spawn and waits there while its spawning colours come on (`return.lake.ripenTime`, 45 s of play standing for weeks; shorter in later lives). It cannot spawn until then. This is a game device. **Open:** do Bristol Bay-type sockeye hold in their nursery lake for weeks before moving onto the beaches and up the inflows, and does their colour come on mostly there?
- **Warm above, cool below:** in a warm year the lake's top layer is warm and the water below a thermocline is cool (9 °C at any depth below about 3-4 m of game scale), and the beaches and stream-mouth shallows warm through. Waiting deep costs less fat and lets heat stress ease; cruising the warm top layer builds it. The layering is textbook limnology; the depths and temperatures are game choices. **Open:** do pre-spawning sockeye use the cool water below the thermocline as a refuge in warm years, and how deep is a typical Bristol Bay nursery lake's summer thermocline?
- **The home plume:** home water drifts through the lake from the home stream or beach toward the outlet as a plume, and the fish follows it across; off the plume the smell is gone. The other streams and beaches carry their own smell, faint and close to shore for a well imprinted fish, nearly home-strength and far out for a poorly imprinted one (as at the river mouths). **Open:** how do sockeye find their own inflow or beach across a lake: by smell carried in the lake water, by following the shore, or by other cues? What do beach spawners home to (upwelling groundwater)?
- **Bears at stream mouths and on beaches:** a bear fishes the home stream's mouth or walks the home beach, and another a wrong one; bears reach only shallow water. Supported in general by the notes (bears feed most easily in creeks, less on beaches). **Open:** are stream mouths where bears catch most sockeye on the way into the inflows?
- **Fat in the still lake:** fat burns at under a third of the river's rate in the lake (`return.lake.fatDrainFactor` 0.3, resting and swimming alike), since there is no current to hold against. **Open:** is that fair?
- **Fellow migrants in the lake:** the school from the river splits up in the lake, each fish heading for a stream or beach of its own. This is a game choice for the look of the scene.
- **The route map:** the return is now drawn across the lake from the outlet to the home stream or beach. The geography is still a game device.
## Open questions from the estuary stream

The smolt run now ends in a short estuary at first light (`src/sim/stages/estuary.ts`, params `estuary.*`). Textbook background the game uses: river water is lighter than sea water and spreads out over it, so an estuary is fresher on top and saltier below and seaward; smolts change to cope with salt water as they leave (silvering; gills that switch from taking salt in to pumping it out). Everything below is a game choice, marked placeholder in params.json.

- **Readiness for salt water:** the fish carries a readiness (0 to 1) that starts part way at the lake outlet, rises slowly through the run and faster in brackish or salt water; water saltier than readiness allows drains energy, slows recovery and weakens the burst until readiness catches up. So holding in the brackish band near the boundary between the layers finishes the change in about half a minute, among gulls and seals, and rushing into full salt water costs energy for a while. **Open:** is it fair to show sockeye smolts finishing their adjustment in the estuary at all, given that they pass through quickly? Do they hold at the fresh-salt boundary, and does a smolt that meets full salt water too early pay a cost we could show as tiredness?
- **The layers:** the game's estuary has a fresher top layer over salt water, with the boundary (halocline) just below the gulls' reach at the river end and rising toward the surface seaward (depths are at the game's compressed scale), and full sea water at all depths in the last part. **Open:** is a layered (salt-wedge) estuary a fair picture for a Bristol Bay-type river, or are those estuaries well mixed by the tides? Tides are not modelled.
- **Predators at the river mouth:** gulls hunt the estuary's surface and harbor seals the deep channel. In the estuary a seal shows ahead of the school, deep, and keeps its distance until it lunges (a game device so the slow-moving school has time to react). **Open:** are there other important predators of sockeye smolts in Bristol Bay estuaries (for example terns, cormorants, beluga whales, or fish such as char at the river mouth)? Should any of them be added?
- **Night and dawn:** the run leaves the lake at night (as the notes say) and reaches the estuary at first light. **Open:** is it fair to show smolts reaching salt water around dawn, or do they keep moving by night in the estuary too?
- **The last parr marks:** the player's smolt shows faint parr marks at the start of the run that fade as readiness grows, gone by the time it is ready for the sea. **Open:** do sockeye smolts still show faint parr marks when they leave the lake, and do they fade on the way out?
- **Imprinting:** calm schooling through the estuary still counts toward the smolt share of imprinting (no new share for the estuary itself). **Open:** do sockeye imprint on estuary water at all?

## Open questions from the crowded grounds stream

Track 2.2. The spawning grounds now hold a crowd of other spawners that follows the year's run (`src/sim/stages/spawn/crowd.ts`, parameters `spawn.crowd.*`, `spawn.char.*`, `spawn.gull.*`). Captions describe what happens in the game and say "in the game" where the rule is a game device.

- **How crowded:** about 36 other spawners on the game's stretch of gravel (about 30 m) in a typical year, scaling with the run (`spawn.crowd.typical`, from 6 in the smallest runs to 110 in the biggest), thinned a little by what the fishery took (`spawn.crowd.escapementWeight`). **Open:** what densities are typical on Bristol Bay creek and beach grounds in small, typical and big years? Should the grounds follow the escapement more than the run?
- **Life on the grounds:** females dig side by side, spawn with a male beside them, cover and guard; unpaired males challenge paired ones and the loser leaves; jacks lurk behind pairs and dart in when the males fight; spent fish drift, die and lie on the bed, then roll along it and wash toward the edges (`spawn.crowd.carcassDrift`, `carcassAshore`). Fresh fish keep arriving, fewer late in the season (`spawn.crowd.arrivalLate`). **Open:** is that a fair picture? Do carcasses mostly stay where the fish died, or drift and collect at the edges?
- **Good gravel is contested:** rival females come more often to a redd on good gravel (`spawn.crowd.patchContest`), and a few crowd redds sit round the edge of each good patch; a female cannot start her redd on top of another's (`spawn.crowd.reddSpacing`). The player's choice becomes the best gravel and more rivals, or poorer gravel and fewer. This is a game device. **Open:** do females compete more for the best gravel, and is more digging-over the cost?
- **Late females dig over spent females' redds:** a newcomer may take the redd of a female who is spent and dig it over (`spawn.crowd.digOverChance`). **Open:** this is the same open question as `spawn.superimposeLoss` and `spawn.lateRivalRamp` above.
- **The rivals come from the crowd:** the rival males and females the player meets, and the female's males, are fish out of the crowd (an unpaired male, a female still looking for a site), and they come more often on crowded grounds. **Open:** none beyond the existing rival questions.
- **A jack's openings at other pairs:** a player jack close to a crowd pair whose males fight gets an opening there too, contested by the crowd's own jacks (`spawn.crowd.jackOpenRange`, `jackDart`). **Open:** do sneakers move between pairs, or stay by one female?
- **The crowd and the bear:** the bear chooses among the player and the crowd fish near it on its side of the stream (`spawn.crowd.bearView`, `bearAttention`), so a crowd shields the player, while crowded grounds bring the bear back more often (the existing `spawn.bearPlentyRate`, now read from the crowd). **Open:** does a fish's own risk from bears fall on crowded grounds, as the game assumes?
- **Char at the eggs:** the advisor notes say females guard against egg predators like trout; the game uses char, as elsewhere. Char hang below the redds; while a female's eggs lie uncovered the nearest one comes for them and eats a share each second (`spawn.char.takeRate`, up to `spawn.char.maxTake`) until she charges it off or covers them. Covered eggs are out of reach. **Open:** are char (Dolly Varden) the main egg predators on sockeye grounds, and do they take most eggs before they are covered, or eggs dug up later?
- **Gulls at shallow redds:** over a shallow redd (creek, the beach's shallows; `spawn.gull.maxDepth`) a gull settles on the water and picks at loose eggs until they are covered; it can't be chased off. This is a game device. **Open:** do gulls take sockeye eggs on the spawning grounds, and only where it is shallow?
