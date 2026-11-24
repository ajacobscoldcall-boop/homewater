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
- **Recovery:** resting in cold water lets heat stress ease, in tens of seconds of game time. **Open:** do migrating salmon recover from heat stress by holding in cool water, or is the damage lasting? (Since Track 2.7 the strain eases but a lasting toll stays; see below.)
- **Heat as a cause of death:** a fish whose heat stress builds to the limit used to die (`heat`). **Open:** is it fair to show this as a direct death on the migration, rather than as fish that reach the grounds and die before spawning? Since Track 2.7 the game does the second, as a reversible choice (below), and keeps a direct heat death only for the very hottest water.
## Open questions from warm-year realism (Track 2.7)

Changed without waiting for the answer to the heat question above, as a reversible choice (`src/sim/stages/heatToll.ts`, params `heat.*`, all placeholders). The notes support only that low water kills through heat stress and low oxygen and causes deaths before spawning; captions say no more than that, and the journal calls the rest the game's choice.

- **A lasting toll:** time spent heat-stressed on the return (stress above `heat.tollFrom`) adds to a toll that never eases, while the stress itself still eases in cool water. **Open:** does heat stress on the migration leave lasting harm that shows later, on the grounds?
- **Death before spawning:** on the grounds the toll means less strength on arrival (`heat.vigourLoss`), faster senescence (`heat.senescenceBoost`) and, before spawning, a chance per second of dying first (`heat.prespawnRate`, rising with the square of the burden above `heat.prespawnFrom`), a new death cause `prespawn` ("Died before spawning"). A burdened fish whose strength runs out before it spawns is also counted as `prespawn`. **Open:** is this the right shape for pre-spawn mortality in warm, low-water years? How large a share of fish that reach the grounds in such a year die unspawned?
- **Crowding and disease:** crowding in warm water adds to the burden (`heat.crowdWarm` × the year's warmth × the crowd's density). Disease spreading among crowded fish in warm water (Ich outbreaks, for example) is one suggested reason; it is not in the notes, so the caption only says crowding "may add to the strain". **Open:** is disease in crowded warm water a fair part of the story for sockeye, and should it be shown on the grounds or already in the river and lake?
- **Direct heat death:** only full heat stress in water at least `heat.lethalOver` (6 °C) past the stress temperature kills on the spot, about 25 °C: the shallowest riffles and shallows on the afternoon of an extreme warm, low-water year. **Open:** is there a temperature at which returning sockeye die quickly on the way up, and roughly what is it?
- **A fish that did not swim the river:** the toll is not saved. A reloaded game, a sibling taking over on the grounds or a playtest jump starts with the toll typical of the year's warmth (`heat.yearToll`). This is a game device.

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

## Open questions from the sound stream

Track 3.5. The sound is generated in code (`src/audio/`); it adds no biology to the simulation, but it does suggest what a place sounds like.

- **Orcas heard far off:** in the open ocean, a far-off whistle-like call is heard now and then (about once every 45 seconds), as a background sound, not a warning; an orca warning has its own deep pulse and a fainter call. The notes support orcas in the ocean. **Open:** is it fair to let the open ocean carry distant orca calls when no orca is hunting the fish, or does that suggest more orcas than there are? Should anything else be heard (for example other whales, which the notes mention as ocean predators in general)?
- **What a salmon would hear:** the game's sound is for the player, not a model of salmon hearing (salmon hear low frequencies best). Warnings are made distinct and audible above the water's muffle on purpose. **Open:** none, unless you would like the sound to lean more toward what the fish could actually hear.
- **No other animals heard:** the lake, river and spawning grounds use water, gravel, splashes and surface plops only; no bird calls, frogs or insects. **Open:** none.

## Open questions from the weather and world-above stream

Track 3.3-3.4. Render only: nothing here changes the simulation, and no caption states it. Weather is read from the stage, the year's conditions and the stage clock (`src/render/weather.ts`, tuning `weatherConfig.ts`), and seen through the surface.

- **Weather follows the year:** a high-flow year is cloudier, with showers that come and go; a warm, low-water year is clear and calm; the open sea is windiest. Each life's sky differs a little for the same kind of year. This is a game device for the look. **Open:** is it fair to pair high-flow years with rain and warm, low-water years with clear skies in a Bristol Bay-type river, or does flow there follow snowmelt more than summer rain?
- **The egg flood comes with rain:** the egg stage's flood shows rain on the surface while the water is high. **Open:** are the floods that scour redds in winter and spring mostly rain-on-snow events, or ice break-up?
- **Seasons on the banks:** alder and willow along the water (and stands of birch and cottonwood among the spruce) are pale green in spring, green in summer, gold on the spawning grounds, and bare with snow on the banks in the fry's winter. **Open:** are the banks of Bristol Bay nursery lakes and spawning streams lined like this, and is late summer on the grounds early enough that leaves are only starting to turn?
- **Lake ice:** in the fry's winter the lake is frozen over: light comes through as a blue-white glow, snow lying on the ice shows as darker patches, cracks run across it, bubbles are frozen in. **Open:** do the nursery lakes of a Bristol Bay-type system freeze over every winter, and is there usually snow on the ice?
- **People at the nets:** a gillnet skiff with two people in rain gear lies at the end of each net line on the return's coast, seen from below as a hull and its shadow, and as figures through the surface. The skiff is about 7 m long. **Open:** do the nets the game shows (lines across the approach with gaps) look more like Bristol Bay's drift fleet or its set nets, and should the boats be drift boats (up to about 10 m) instead?
## Open questions from the falls rework and the magnetic track

Game choices made after a playtest, without advisor input. Numbers are in params.json (`return.leap*`, `return.practice*`, `return.poolRegen`, `return.lipBear*`).

- **The leap as one burst:** a leap now starts from a burst near the surface heading upstream, at the standing wave or anywhere in its white water, with the speed of the run-up. How speed, depth, the spot and help on later tries combine is a game rule. **Open:** is "fast, near the surface, from the standing wave below the lowest step" a fair one-line picture of how salmon leap?
- **Why a leap misses:** the game names one reason per miss (too slow, too deep, too close to the falling water, the wrong spot, or just unlucky). **Open:** is landing in the falling water close to the face a fair picture of a common failure?
- **Rest in the plunge pool:** resting deep in the pool recovers energy faster (`return.poolRegen`), a game device. **Open:** do fish hold low in the plunge pool between attempts?
- **The practice ledge:** a low rock ledge by one bank in the rapids can be hopped once before the falls. It is a teaching device: the river goes round it. **Open:** none on the biology; flag it if hopping small ledges in rapids looks wrong.
- **The side channel from the start:** the side channel is now visible from the start behind a driftwood jam that clears after 2 misses on Field guide and 3 on Wild. It is still a game fallback. (The earlier open question about side channels stands.)
- **The bear on the lip:** on Field guide it leaves the player alone for the first two tries (a game kindness), and on Wild it warns longer. **Open:** do bears at falls favour fish at the lip and in the air, or fish resting in the pool?
- **The magnetic track drawn as light:** the track is shown as soft blue glows ahead of the fish, standing in for a magnetic sense the fish can't see. The caption says so. **Open:** is there a better natural stand-in (for example a felt pull, sound, or the fish's own heading) the advisor would prefer?
## Open questions from the egg threats stream

Track 2.5. The egg stage now has a low-oxygen pocket, a sculpin and silt besides the flood (`src/sim/stages/eggThreats.ts`, params `alevin.*`). What the notes support: alevin face into the current partly to keep oxygen-rich water flowing over their gills, and finer gravel gives eggs less oxygen. Published background (cited in DESIGN.md and params.json, not yet checked with the advisor): fine sediment in redds cuts the flow of water and oxygen through the gravel (Chapman 1988); sculpins eat sockeye eggs on Iliamna Lake beaches (Foote and Brown 1998). Everything below is a game choice, marked placeholder in params.json; captions say "in the game" where the rule is a device.

- **Crawling:** the alevin can wriggle a short way (a few centimetres at the game's scale) through the gaps between the stones of the redd. **Open:** do alevin move about within the gravel before emergence, and how far?
- **Still water and oxygen:** where water stops moving through the gravel, the oxygen around the alevin falls over a few seconds and the alevin weakens (in nature this would take far longer); moving water restores it at once. Death is "smothered" (`alevin.o2*`). **Open:** is it fair to show low oxygen as a pocket of still water the alevin can leave? Do alevin move away from low oxygen?
- **Silt after the flood:** fine sediment the flood carried settles into the gravel and clogs it for a while, then the flow flushes it out (`alevin.silt*`). Water keeps moving in the gaps beside the large stones, each open at its own height (low beside some stones, higher beside others). **Open:** is silt settling after a high-flow event a fair picture for Bristol Bay creeks and beaches? Does water really keep moving beside larger stones, and does fine sediment clear again within an incubation season?
- **Brood-mates smothered:** a few brood-mates lying in clogged gravel are smothered (`alevin.siltBroodLoss`); the flood still takes most of them, so the brood's survival stays at the advisor's 10-20%. **Open:** how much of egg and alevin loss is low oxygen from fine sediment, against scour?
- **The sculpin:** sculpin are not in the notes. In the game a sculpin glides in over the gravel, then noses into the gaps at one spot after another; movement and lying high in the gravel give an alevin away, a still alevin in the open can still be found, and one that keeps still, deep and close against a large stone is not (`alevin.sculpin*`). It may take one brood-mate. **Open:** are sculpins (coastrange or slimy sculpin) important predators of sockeye eggs and alevin in Bristol Bay creeks and lake beaches, or mostly of eggs loose on the surface? Do they dig into the gravel? Is keeping still the alevin's best defence? Are there other gravel predators we should show (for example juvenile char or stonefly larvae)?
- **Length:** a first life's egg stage is about two minutes and meets all four events in order (pocket, sculpin, flood, silt); later lives meet the flood and one other in under a minute (`alevin.firstLifeYolk`, `alevin.threatLaterScale`). This is pacing, not biology.

## Open questions from the ocean journey stream

Track 2.6. The years at sea are now a route through the seasons (`src/sim/stages/oceanRoute.ts`, `src/sim/stages/ocean.ts`, parameters `ocean.*`). What the notes support and the game uses: sockeye stay in the top 20-40 m; orcas, salmon sharks, seals and sea lions hunt them throughout their years at sea; ocean conditions, prey and temperature vary; competition with pink salmon in crowded years; the path is set after the first autumn at sea; later years at sea are survived about half the time; magnetic homing at sea. Everything below is a game device or simplification, marked placeholder in params.json, and the captions say "in this game" where they lean on it.

- **The route:** out along the coast from the river mouth in the first summer, over the shelf edge in the first autumn (where the maturation reveal happens), then one loop offshore per year, with each winter "far out" and the turn for home in the last spring. The ocean map drawn between seasons is schematic. **Open:** is a coastal first summer followed by an offshore loop a fair simple picture for Bristol Bay sockeye? Anything badly wrong with drawing the winters far out to the south-west?
- **Seasons and food:** each season has food relative to a typical summer: spring 1.15, summer 1.0, autumn 0.8, winter 0.45 (`ocean.food.*`), with most food near the surface in spring and summer and most of it deep in winter (`ocean.shallowShare.*`). **Open:** is it fair to show winter at sea as a lean season, and do sockeye feed deeper in winter, or just less?
- **Warm and cool years:** each year at sea is warm (30%), cool (25%) or typical (`ocean.warmChance`, `coolChance`); a warm year has 0.7× the food and a cool year 1.15× (`ocean.warmFood`, `coolFood`). **Open:** is "a warm ocean year means less food and slower growth" a fair simple rule for sockeye in the North Pacific, or should temperature act in another way (for example through metabolism, or where the fish can go)?
- **Pink salmon:** in a crowded year the pinks compete in one season (the first autumn, and again in the second summer) and food in every summer and autumn is 0.8× (`ocean.crowdedFood`); the fish grows less and returns smaller, as before. **Open:** none beyond the earlier crowding questions.
- **Hunters come where the food is thickest:** each season has a rich patch and a thin patch of food, one near the surface and one deep; the season's hunter (seal near the surface, salmon shark from below, orca at the richer patch) comes for a fish that lingers where the food is thickest (`ocean.exposureNeeded`) and only sometimes for one that keeps to the thin patch (`ocean.unexposedChance`). This is the choice each season asks for: grow or stay safe. **Open:** is "predators gather where prey is dense" fair for seals, sea lions, orcas and salmon sharks feeding on salmon at sea? Do salmon sharks really strike from below?
- **One hunter per season:** a seal in the first summer along the coast, an orca (or the pinks) in the first autumn, a salmon shark in the first winter, and in later years orcas, seals and salmon sharks in turn. **Open:** are harbor seals and sea lions a fair hunter offshore, or only near the coast? Should seabirds (in the notes as ocean predators) take a season, and which kind would it be?
- **Later years:** the advisor's "about half survive each later year" is now split: part is the hunters met in the later seasons, the rest an unseen roll at the turn of each year (`ocean.lateRollShare`: life.lateOceanSurvival to the power 0.2). After the first autumn the hunters give a little more warning (`ocean.lateWarningScale`, 1.35×), since the fish is bigger. **Open:** none; this is a balance choice, noted so the numbers are not read as biology.
- **Growth at sea:** the fish is drawn at 0.3 of adult size in its first summer (about 22 cm) and grows each season to the one-year size by its first winter (about 300 mm, the jack size) and to its own adult size by the turn for home. Bites before the reveal set maturation as before (`ocean.fullBites`, now 20 because food at sea is no longer unlimited); feeding after it nudges adult size a little (`ocean.lateFeedingEffect`). **Open:** is about 22 cm a fair size for a sockeye's first summer at sea? Does growth after the first autumn matter for the size a fish returns at, as the game assumes?
## Open questions from the changing river stream

Track 2.8. An optional mode, chosen when a lineage is founded and off by default: the main game stays a healthy Bristol Bay-type river with no dams. On a changing river the river changes over the generations (`src/sim/riverChange.ts`, parameters `change.*`, every effect a placeholder). The captions say what happens in the game and stay careful about cause: they do not say the warming has been recorded anywhere, and the hatchery line says the young "may" home less surely. Each rate is compressed so the change shows within a few lives.

- **Warming:** the year's river temperature rises by about 0.4 °C on the return per generation from the second life, to at most about 2.6 °C (`change.warmingRate`, `warmingMax`). It feeds the existing year rules (warm years favour early runs) and the return's heat stress, and costs the run a little (`change.warmRunLoss`). The real rate in published stream records is far slower (Isaak et al. 2012 report about 0.2 °C per decade in summer across the US Northwest). **Open:** is a warming trend a fair thing to show for a sockeye river, and how should the game frame its speed?
- **Logging silt:** from the second life, a quarter of years have fine silt in the spawning gravel (`change.siltChance`): eggs laid that year survive at 0.65× (`change.siltEggSurvival`), and that cohort's run comes home at 0.75× (`change.siltRecruit`). Fine sediment lowering egg-to-fry survival is well supported (Jensen et al. 2009 meta-analysis); the sizes here are game choices. **Open:** are these sizes reasonable for one bad year, and should silt also show in the egg stage itself (left to the egg-threats stream)?
- **Hatchery strays:** from the third life, hatchery fish from elsewhere join the run, 5% more of it each generation to at most 30% (`change.hatcheryRate`, `hatcheryMax`). They spawn here but leave 0.6× the young of a wild fish (`change.hatcheryFitness`; reduced reproductive success of hatchery-origin spawners is reported in many studies, e.g. Araki et al. 2007, Christie et al. 2014). A mate drawn from such a run lowers the player's offspring's homing a little (the notes say hatchery fish stray more) and blurs their run timing (a random spread, no direction) (`change.hatcheryHoming`, `hatcheryTiming`). **Open:** is passing on poorer homing and less settled timing a fair simple picture of introgression, and are these sizes reasonable?
- **Fisheries that respond to the run:** from the second life, set nets and subsistence nets add up to two net lines on the approach in big open runs (`change.setNetLines`), and the escapement goal is fished 0.08 of a typical run lower (`change.goalShift`); after a run smaller than 0.6 of typical, managers restore the goal and keep the set nets out the next year (`change.closeBelow`). This is a game mechanic, not a picture of any real fishery. **Open:** none for the biology; is "the fishery eases off after a small run" fair to say?
## The ten open questions that most affect what players are told

Track 4 (science integrity). Every caption and journal entry is now tagged established, simplified or game device in `src/data/claims.json` (see the decision log). Of the open questions above, these ten sit under the most player-facing lines, so they go first in round 3. The caption IDs are the lines each answer could change; journal entries are named as `journal:<id>`.

| # | Question | Lines it affects |
|---|---|---|
| 1 | **Year effects.** Can "warm years favour early-run fish", "high water is harder on early-run and deep-bodied fish", "low water exposes deep bodies to bears" and "big runs give jacks more openings" be stated as biology, or only as game rules? (From the accuracy audit.) | `year.warm`, `year.cool`, `year.highWater`, `year.lowWater`, `year.bigRun`, `year.smallRun`, `card.year.*`, `offspring.intro`, `offspring.fit.*`, `recap.fit.*` |
| 2 | **Imprinting.** Is it fair to show imprinting as an alevin, a fry (home-water plume) and most on the smolt run? Should calm schooling help, or drop that link? Does weaker imprinting make straying likelier? (From scent imprinting.) | `imprint.egg`, `imprint.fry`, `imprint.fryHint`, `imprint.smolt`, `return.scent.strong`, `return.scent.fair`, `return.scent.weak`, `return.strayScent`, `return.strayScentClear`, `return.lake.wrongInflow`, `return.lake.wrongBeach`, `return.lake.lostScent` |
| 3 | **Heat on the return.** Are 15 °C (costlier) and 19 °C (stress) sensible thresholds; do fish recover by holding in cool water; and should heat show as death on the way or as pre-spawn death on the grounds? (From temperature and oxygen.) | `return.heat`, `return.coolSeep`, `return.coolPool`, `return.heatStress`, `death.heat`, `return.lake.warm`, `return.lake.coolDeep`, `journal:return.lowWater`, `journal:return.lakeLayers` |
| 4 | **The fry's day and who hunts fry.** Is "deep by day, up at dusk and dawn" fair for Bristol Bay-type lakes; do char follow the fry up and down; do mergansers take fry in the lake; do the weed shallows hide fry from char? (From the fry day cycle and the accuracy audit.) | `fry.dusk`, `fry.day`, `fry.dawn`, `fry.night`, `fry.second`, `fry.charDeep`, `fry.charLost`, `fry.merganser`, `fry.mergDeep`, `fry.trout`, `fry.safeWeeds`, `fry.lesson`, `fry.lessonDone`, `journal:fry.daycycle`, `journal:fry.birds` |
| 5 | **The estuary.** Do sockeye smolts finish adjusting to salt in the estuary, holding near the fresh-salt boundary, and does meeting full sea water too early cost them? Are these estuaries layered or tidally mixed? (From the estuary.) | `estuary.enter`, `estuary.edge`, `estuary.saltStress`, `estuary.ready`, `smolt.mouth`, `journal:smolt.estuary` |
| 6 | **Bears and adult groups.** Does travelling with other adults (in the river, at the falls, on crowded grounds) lower one fish's risk from bears? Do bears favour leaping fish at falls, and stream mouths on the lake? (From the falls, the lake crossing and the crowded grounds.) | `return.migrantTaken`, `return.bear`, `return.lake.bear`, `spawn.crowdBig`, `spawn.crowdSmall`, `spawn.bearEats`, `journal:return.falls`, `journal:spawn.crowd` |
| 7 | **Eggs after spawning.** How much better do covered eggs survive; is digging over (superimposition) commoner late in the season; are char the main egg thieves, and do gulls take eggs at shallow redds? (From the spawning rebuild and the crowded grounds.) | `spawn.bury`, `spawn.buried`, `spawn.superimposed`, `spawn.charEggs`, `spawn.gullEggs`, `spawn.eggsSafe`, `spawn.patchContested`, `journal:spawn.covering`, `journal:spawn.eggThieves` |
| 8 | **How males win.** Do timing and a side-on position change who wins a fight, or is it almost all size? Do large males spawn with several females? How strong is frequency-dependent jack success? (From the accuracy audit and the spawning rebuild.) | `spawn.largeMale`, `spawn.rivalMale`, `spawn.fightWonSide`, `spawn.fightLost`, `spawn.secondFemale`, `spawn.jackCommon`, `spawn.jackRare`, `journal:spawn.jackFrequency` |
| 9 | **Colour and the wait in the lake.** Do Bristol Bay-type sockeye hold in the lake for weeks while their colours come on, and do they change gradually up the river or mostly near spawning? (From the lake crossing and body change.) | `return.lake.wait`, `return.lake.ready`, `return.lake.notReady`, `journal:return.lakeHome`, `journal:return.colour` |
| 10 | **The river's run and the fishery.** Is a Ricker curve with these values a fair simple picture; does the fishery let about 45% through and close in small runs; does a crowded lake cut growth and do carcasses feed the next cohort? (From the population stream.) | `pop.lakeCrowded`, `pop.lakeRoomy`, `pop.fisheryHeavy`, `pop.fisheryLight`, `pop.fisheryClosed`, `pop.fisheryOrdinary`, `pop.runHistory`, `card.pop.*`, `journal:return.gillnet` |

Left for later rounds because fewer lines rest on them: the falls (leap spots, tries, side channel, eddies), seals at sea, scavengers, carcass drift, school flash expansion, the startle, drawn sizes and looks (the screenshot review covers those), and lake growth and jacks (`journal:fry.winter`).

## Open questions from the science integrity stream

Track 4. No simulation change; captions were hedged where they stated an open question or a game device as fact (IDs kept: no lines are recorded yet).

- **How lines are tagged:** `established` means an applied answer in these notes or a published source on the journal's Sources page supports it; `simplified` means real biology squeezed for play (timescales, round numbers, one cue standing for many); `device` means a game rule, aid or plain instruction. An instruction to the player may describe the game's rules plainly ("Rest near the bottom and let the heat stress ease"); a general statement about salmon or predators that these notes leave open says "in the game", "thought to" or similar. **Open:** is that line drawn in the right place? Are any lines tagged established that you would call simplified?
- **Published sources cited in the game:** the journal's Sources page lists the published papers in DESIGN.md Sources, each tied to the lines it supports in `claims.json`. **Open:** is any of them misread, or is there a better source for a line (for example for smoltification or carcass nutrients)?
- **"How true is this?" notes:** each simplified or device journal entry says in a few plain sentences what is supported and what is the game's (`howTrue` in `src/data/journal.json`). **Open:** do any of them overstate or understate the evidence?
