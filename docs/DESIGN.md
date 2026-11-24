# Homewater: Design Brief

A sockeye salmon lifecycle simulator. Working title: **Homewater**.

Status: design reviewed and revised with the scientific advisor's answers (see ADVISOR_NOTES.md). The build is under way, one playable milestone at a time.

## Expert input

The scientific advisor has answered two rounds of questions. Their answers, and how each one is applied, are in `docs/ADVISOR_NOTES.md`. They confirmed:
- A composite watershed rather than a real one.
- The six stages.
- The list of heritable traits.
- Gillnets and anglers as the human pressures (no trawl).
- Creek, lake beach and river as spawning habitats.
- Picking the next fish from three offspring.

Where this brief and the advisor notes differ, the notes win.

## Vision

A "life as a sockeye salmon" simulator. Realism comes from tactile detail and the depth of the systems, not from photoreal graphics. The player lives one sockeye's entire life, from egg to death after spawning. The bloodline carries on through the offspring the player chooses.

## Setting

- **Species:** Sockeye salmon (*Oncorhynchus nerka*). Its alternative male life histories, especially early-maturing "jacks" (sneaker males), are well studied in Bristol Bay and on Kodiak Island (see Sources).
- **Place:** For now, a fictional watershed modeled on Bristol Bay's lake systems: bay, then river, then a large lake, then spawning habitat. Bristol Bay's names, words and imagery belong to the Yup'ik, Dena'ina and Alutiiq/Sugpiaq communities who live there. Use none of them without consultation.
- **Human presence:** Present but not preachy.
  - **v1:** Size-selective commercial gillnets at the river mouth, plus subsistence set nets shown neutrally, as part of the landscape rather than a threat to dodge. A caption explains that the fishery is managed to let enough fish through to spawn (escapement goals).
  - **Anglers** in the home river's pools (added after milestone 1). Their lures can hook a fish, which must fight free.
  - **Dropped:** a rare trawl sweep at sea. Sockeye are rarely caught in trawl fisheries, which mostly catch Chinook and chum.
  - **No dams**, true to Bristol Bay.

## Structure: one full life per run (about 30 minutes)

Six stages with unequal time budgets, matched to their content. Each stage is 2–4 authored encounters in bounded areas, joined by time-skip transitions. None of them is an open world.

| Stage | Target length | First life only |
|---|---|---|
| 1. Egg and alevin | 2 min | After the first life, a 1-minute vignette |
| 2. Fry in the lake | 5 min | After the first life, shortened |
| 3. Smolt run downriver | 4 min | |
| 4. Ocean years | 6 min | |
| 5. Return | 7 min | |
| 6. Spawning and death | 5 min | |

1. **Egg and alevin:** In the gravel. Threats include floods, silt, scavengers and low oxygen. The player wriggles to stay oxygenated, then emerges at night.
2. **Fry in the lake:** Feeding on plankton, avoiding trout and diving birds, and surviving winter. In the first life this is where swimming is taught.
3. **Smolt run downriver:** A short sprint, including the change to saltwater.
4. **Ocean years:** Built from distinct events with time skips between them, not one open arena:
   - A feed in a drifting krill swarm (with a few small fish and squid)
   - An orca pass
   - A seal ambush
   - A crowded-ocean year
   - The maturation moment

   Whether a male matures early as a jack is set by his genes and his growth, which can be partly before the ocean. The game reveals it to the player rather than asking them to decide.
5. **Return:** The gillnet gauntlet, then the river and the lake. Salmon stop eating on the return, so the fish lives on its fat reserves, and finding home relies on smell.
6. **Spawning and death:**
   - **Females:** Choose a site, dig a nest (redd) and guard it.
   - **Males:** Fight as a large hook-jawed male, or sneak in as a jack. The traits decide which; the player plays it out.
   - **Senescence and death:** Salmon die after spawning. Their bodies decay, and the carcass feeds the ecosystem.

**Before any stage is built,** write a one-page table for it. The table gives the stage's main verb, the decision the player makes, the threats, how failure happens, and the target length. If a stage has no real decision, it gets shortened.

## What is a choice and what is a trait

- **Traits** are set by inheritance plus chance. They shape the odds and the fish's body:
  - Size and shape
  - Jack tendency
  - Run timing
  - Ocean age
  - Homing fidelity
- **Choices** are what the player does within those odds: routes, when to burst, when to hide, which redd site, when to sneak in or fight.
- **Choices are never inherited.** Only traits pass to offspring.
- **Ocean age 1** (returning after one year at sea) is for males only. Those are the jacks.

## Lineage and genetics

- **Death:** Permanent. Each life starts with a brood that works as about 3–5 lives. If your fish dies before spawning, you take over a sibling at the last encounter, not at the start of the stage.
- **First fish of a new lineage:** There are three ways to start:
  - **Quick start:** a default fish.
  - **Custom:** set the starting traits and sex, within realistic limits.
  - **Start as a jack:** a male with the early-maturing jack life history locked in. He returns small after one ocean year and spawns using sneaker tactics.
- **Next generation:** After a successful spawn, the player **picks** the next fish from **three** offspring. Each shows its traits and sex.
- **Names:** For each fish the player plays, the game suggests a name.
  - **Accept:** one click.
  - **Reroll:** get another suggestion.
  - **Own name:** type any name instead.
  - **Style of suggestions:** short nature names from the setting, such as Alder, Tamarack, Silt or Ember.
- **Saving:** The game autosaves at each stage boundary. The lineage can be exported and imported as a file, because browsers can wipe stored data.
- **Spawning habitat:** Each lineage belongs to its natal habitat. A fish homes to where it was born. Only strays change habitat. The first fish of a lineage chooses its habitat. v1 ships with **creek** spawning only, the habitat where jacks are most common. Lake beach and river come later.
- **Inherited traits:** Partly heritable, plus environmental noise. Each trait must have an effect the player can feel in play, or it is cut.
  - Jack vs. large-male tendency. In DeFilippo et al. (2019, Frazer Lake, Kodiak), a cohort's jack rate tracks the share of jacks among its sires. The heritability used in the game is 0.4, a middle value; published estimates vary widely between populations.
  - Body size and growth rate
  - Run timing (early or late)
  - Ocean age (1–3 years; 1 for males only)
  - Homing fidelity (whether the fish may stray to another stream)
  - Body shape: streamlined creek fish vs. deep-bodied beach and lake spawners
  - For females, egg size vs. egg count
- **Jack frequency:** Base jack rates depend on habitat. They are highest in small creeks with bank cover (DeFilippo et al. 2018). They are low across Bristol Bay overall: about 1–2% has been reported for the Wood River system. They can be far higher in places like Kodiak's Frazer Lake. A caption explains this difference.
- **Jack mating success** depends on how common jacks are and on habitat cover. Both male strategies can persist.
- **Persistence:** A family tree shows every ancestor's traits, journey and death.
- **Extinction:** Depends on difficulty, if a whole brood dies before any fish spawns.
  - **"Field guide":** You can continue as a stray from another population that joins your home stream, as real strays sometimes do. The tree continues with a new branch.
  - **"Wild":** The line ends. It is archived as extinct and you start a new lineage.

## Year-to-year conditions

Each generation is born into a randomly varied world:
- Run size: strong or weak year-classes, meaning more or fewer rivals
- Ocean competition: a crowded ocean means slower growth and smaller fish
- Water temperature, including warm years
- River flow: low-water or flood years

The same traits can thrive in one generation and fail in the next. That is bet hedging, as the advisor described it. The year interacts with traits:
- **Warm years** favour early-run fish; **cool years** favour late-run fish.
- **High water** is harder on early-run and deep-bodied fish.
- **Low water** lets bears reach deep-bodied fish more easily.
- **Big runs** bring more big males: harder for large males, more openings for jacks. **Small runs** are the reverse.
- **Crowded ocean years** (pink salmon) mean smaller fish.

The year card and the recap say what the year favoured.

**Changing river (optional mode, off by default).** Chosen when a lineage is founded; the main game stays a healthy Bristol Bay-type river with no dams. On a changing river, over the generations: summers warm, some years bring logging silt into the spawning gravel, hatchery strays join the run, and set nets and subsistence nets fish open runs harder, easing off after small runs. Each change shows on the stage card where it matters and as a mark on the run chart, and the Lineages page and the recap say what has changed since the line began. All rates are game placeholders (`change.*`).

## End-of-life summary

After spawning and death, a short sequence plays: the carcass decays and feeds the stream and forest, the seasons pass, and the eggs hatch. v1 keeps this simple, as a series of fades rather than a full cinematic. Then the life ends with a recap and a score.
- **Recap:** where the fish hatched, how far it travelled, what it survived and how it died, plus the science behind its death.
- **Score:** offspring compared against the fish's cohort, meaning eggs fertilized or surviving young. It does not reward distance or years lived, which would unfairly penalize jacks.

### Score across generations

The lineage score rewards a line for lasting and for doing well, and is shown on the recap with a one-line explanation:
- **Persistence:** 100 points for each generation that spawns (`lineage.score.perSpawn`).
- **Fitness:** 100 points × each spawn's relative fitness against the average spawner of its sex that year (`lineage.score.perFitness`), counted up to 3× (`lineage.score.fitnessCap`) so one lucky spawn can't outweigh a long line.
- A life that dies before spawning adds nothing. Years lived and distance travelled still count for nothing, so jacks are not penalized.
- Computed by `lineageScore()` in `src/sim/records.ts`.

### Lineage records, extinction and the Lineages page

- **Records** across every lineage in the save (the current one and up to 20 archived): longest line, most eggs in one life, largest fish, most jacks in a line, best lineage score, and the longest line on each difficulty. Shown on the recap, the extinction screen and the **Lineages** page from the title screen.
- **Family tree:** one node per generation's played fish, with sex, jack or large male, habitat, stray marker, how it spawned or died, eggs and relative fitness. Siblings lost are small marks; offspring not chosen show faintly. Past 12 generations it switches to one line per generation and scrolls, opening at the newest.
- **Extinction (Wild):** an ending screen for the line: how long it lasted, its best fish, a chart of how the mean inherited value of each trait drifted per generation, and the years it lived through. Then a new lineage, or **a stray from this river**: a fish from another population that has joined the same river founds a new line there.

## Realism systems

- **Body needs:** Hunger and fat reserves, fatigue, injury, water temperature and dissolved oxygen.
- **Senses:**
  - Smell-based homing (natal stream imprinting). This has a visible direction cue, so players can read it.
  - Lateral line, which senses movement and pressure in the water
  - Limited underwater visibility. This also helps performance.
- **Water:** Current strength, temperature, oxygen, and the freshwater/saltwater change (osmoregulation).
- **Ecosystem:**
  - **Predators in v1:** bears, eagles, trout, diving birds, orcas, seals. Salmon sharks come later.
  - **Prey:** plankton and small fish.
  - **Others:** rivals and mates.
- **Spawning behavior:** Distinct male and female roles, and the two male strategies.

## Readability rules

- **Warnings:** Every threat gives 1–2 seconds of warning: a shadow, a pulse through the lateral line, or a sound. Most deaths should come from the player's mistakes, with clear warnings, not from bad luck.
- **Threats from above:** Bears, eagles and birds attack from above, so the camera and the cues have to show them.
- **Clarity:** Realism never outranks clarity.

## Difficulty and tone

- **Adjustable difficulty:** From "Field guide" (forgiving) to "Wild" (harsher, closer to real odds). Real odds of well under 1% would end nearly every lineage, so "Wild" is never presented as true odds. Captions can show the real survival rate beside the player's. New players start on "Field guide".
- **Guidance:** In "Field guide" mode, the first life works as a guided tutorial with clear objectives at each stage. Later lives are hands-off.
- **Tone:** Unflinching realism: predation, wounds, decay.
  - **Gore setting:** "Unflinching" by default, with a milder "Documentary" setting players can choose.
  - **Warning:** a specific content warning naming predation, deaths from fishing, and decay, shown with the gore choice once before the first life (first-run setup) and kept in Settings, Content.
  - **Human-caused deaths** are no more graphic than natural ones.

## Presentation

- **Visuals:** Stylized realism, with lighting and water doing the heavy lifting: depth fog, light shafts, caustics, particles, the surface seen from below.
  - The salmon is built procedurally, its shape generated in code. Size, depth, fat, shape and stage coloring are inputs from day one: yolk sac, faint parr marks, smolt silver, then spawning red and green with the hooked jaw and hump.
  - **Other animals:** shown mostly in part, through murk, shadow and silhouette, with simple motion made in code. The game doesn't depend on fully animated models. Any asset used is logged with its source and license, preferring CC0.
  - **Graphics settings:** Stored as a data table. v1 ships one level, tuned for ordinary laptops. More levels can come later.
  - Art is kept separate from game systems, so it can be upgraded later.
- **Camera:** Third-person is the designed default. First-person is a toggle, available at any time. Short cinematic shots frame key moments (hatching, the lake, the night run, the sea, maturation, home, spawning); they can be skipped with any key and turned off.
- **Controls:** Assisted swimming: WASD and the mouse steer, Shift bursts. The physics model (current, fatigue, energy) runs underneath. A fully physical tail-stroke mode is a possible later option.
- **HUD:** Immersive by default, with state shown through the world itself (blurred vision when exhausted, sluggish swimming, sense overlays). An optional detailed HUD can be toggled on.

## Audience and goal

- **Audience:** Adult simulator and survival players, and nature and science fans, equally.
- **Goal:** A free passion project.
- **Accessibility:** No dedicated accessibility features in the first build. The priority is that the game is easy to understand: clear cues and clear feedback.

## Narration (science woven into play)

- Brief documentary-style on-screen captions at key moments.
- Every line has a stable ID in a single script file. If an audio file with that ID exists, it plays alongside the caption.
- **Deferred:** the field journal, and exporting a recording script.

## Audio

- **Ambience:** A layered, stage-specific soundscape: muffled currents, shifting gravel, rain on the surface seen from below, the open ocean, orca calls, splashes, bears, eagles, boat engines. Audio starts after the player's first click, as browsers require.
- **Score:** v1 uses ambient loops with named music slots. A score generated in the browser that adapts to the action, or a composer's recordings, can fill those slots later.

## Technical approach

- **Engine:** Three.js with its standard WebGL renderer.
  - The Three.js version is pinned exactly. The newer WebGPU renderer and its shading language are avoided for now, because they are still changing.
  - Alternatives were considered and rejected:
    - **Unity and Godot web exports:** large downloads, and binary scene files that can't be reviewed line by line.
    - **Godot's threaded build:** needs server headers that GitHub Pages can't send.
    - **Babylon.js and PlayCanvas:** no decisive gain.
- **Language and tooling:** TypeScript in strict mode, with Vite and npm.
- **Simulation separate from rendering:** The game logic is plain TypeScript with no Three.js imports. It updates at fixed time steps, and one seeded random-number generator drives all chance. The renderer only reads the simulation's state. A debug handle on the page lets tests and the playtest tools read state and step the simulation.
- **One data file for every number:** biology, tuning and difficulty values. Each entry has:
  - ID
  - value
  - units
  - allowed range
  - source
  - placeholder flag

  It is checked when the game loads. The advisor's numbers drop in without code changes. Difficulty presets are multipliers over this data.
- **Verification:**
  - Unit tests on the simulation, including survival odds and inheritance checked over many simulated runs.
  - Headless-browser smoke tests that boot the game, step through each stage, fail on any console error and save screenshots.
  - Both run on every push.
  - Each milestone ends with a playable build, screenshots, and a short checklist of things for the owner to try in the browser. Only the owner signs off on feel.
- **Performance budget:** 60 frames per second at 1080p on a laptop with integrated graphics. Fewer than about 200 draw calls, and a first download under about 20 MB. Stages load as the player reaches them. A frame-rate counter shows in playtest mode.
- **Rendering techniques:**
  - Depth fog
  - Caustics projected as an animated texture
  - Light shafts as simple cone meshes
  - Instanced particles
  - The surface seen from below, with Snell's window

  Expensive techniques are avoided.
- **Fish animation:** The body is generated in code, and swimming motion is a traveling wave computed on the graphics card. Movement and collisions use custom steering code, not a physics engine.
- **Saves:** Stored in IndexedDB, with persistent storage requested. Every save carries a schema version, migrations are tested, and lineages can be exported and imported. Saves store seeds and trait values, not derived data.
- **Agent handbook:** A `CLAUDE.md` in the repo holds the architecture map, folder rules, commands, what "verified" means, and a decision log. Every coding session reads it first and updates it.
- **Hosting:** GitHub Pages from this repo, deployed by the official GitHub Action. The site is served under `/sales-sparring/`, so the build's base path must match. The repo name stays as is. A free GitHub account requires the repo to be public.

## Playtest tools (first build)

Hidden from players, reached only through a URL flag or a secret key:
- **Stage select:** jump straight to any stage.
- **Trait editor:** set a fish's inherited traits by hand.
- **Feedback button:** copies a summary of the current run (stage, traits, settings, recent events) to paste when reporting issues.
- **Frame-rate counter.**

## Definition of done (first build)

Playable end to end:
- All six stages
- Male and female paths, including jacks
- Creek spawning
- Lineage with offspring selection and the family tree
- Stylized-realism visuals
- Captions

Rough edges are acceptable.

**Deferred to a later version:**
- More graphics levels

Since added: cinematic camera moments, anglers, salmon sharks, lake-beach and river spawning, the recording script, the adaptive score, the field journal and guided first life, the fry and ocean stages as short scenes with time skips, and animals built in code. The trawl was dropped on the advisor's advice.

## Milestones

Each milestone keeps the full life playable. Later milestones deepen it and never break it.

1. **A whole life in grey boxes, about 5 minutes:** egg to spawn, then the pick of the next fish with inherited traits. Swimming should feel right in a creek, with current, surface and gravel. This milestone also sets up the foundations: simulation separate from rendering, the data file, tests, the agent handbook, and versioned saves. The per-stage tables are written first.
2. **The return, polished until it's fun:** the gillnets, current, fat reserves, smell homing, and bears in the creek. The underwater look is established here.
3. **Spawning, polished:** both sexes, and large males vs. jacks with frequency-dependent success.
4. **The remaining stages deepened:** egg, fry, smolt and ocean events.
5. **Lineage depth:** family tree, year-to-year conditions, extinction, recap and score, names, and export and import.
6. **Presentation and tuning:**
   - Captions and audio
   - The gore setting and guided first life
   - Difficulty, pacing and performance

The user reviews and can redirect after each milestone. Outside playtesters can try the game from milestone 1 on.

## Known risks

- **Size:** The cut list and the milestones above manage this.
- **Other animals:** They will be the roughest visuals, so they are shown in part, through murk and silhouette.
- **Ocean stage:** Built from distinct events so it doesn't feel empty.
- **Advisor timing:** The current choices hold as defaults unless they say otherwise. Biology lives in the data file, so their corrections are tuning changes rather than rewrites.

## Title

**Homewater**: the stream every salmon is imprinted on and returns to. Check that no existing game uses the title before release.

## Sources

- Chapman, D. W. 1988. Critical review of variables used to define effects of fines in redds of large salmonids. Transactions of the American Fisheries Society 117: 1-21 (fine sediment and the flow of water and oxygen through redds; used for the egg stage's silt and still water)
- Foote, C. J. and Brown, G. S. 1998. Ecological relationship between freshwater sculpins (genus *Cottus*) and beach-spawning sockeye salmon (*Oncorhynchus nerka*) in Iliamna Lake, Alaska. Canadian Journal of Fisheries and Aquatic Sciences 55: 1524-1533 (sculpins and sockeye eggs; the egg stage's sculpin)
- [DeFilippo PhD dissertation: Salmon Life Histories and Fisheries Management (UW)](https://digital.lib.washington.edu/researchworks/items/f492992e-1b79-4cf0-ad84-4c19b0ff6d9a/full)
- [DeFilippo et al. 2019, Frazer Lake jacks (listing)](https://pherobase.com/literature/data/details/M/38760); [UW SAFS summary](https://fish.uw.edu/?p=16965)
- [DeFilippo et al. 2018, stream geomorphology and jacks (USGS listing)](https://pubs.usgs.gov/publication/70197438)
- [Juneau Empire on DeFilippo's jack research, including the Wood River rate](https://www.juneauempire.com/news/short-lived-salmon-play-a-role-in-long-term-survival)
- [NOAA: Investigating salmon bycatch in the Alaska pollock fishery](https://www.fisheries.noaa.gov/feature-story/investigating-salmon-bycatch-dynamics-alaska-pollock-fishery)
- Changing river mode (cited in params.json, no links): Isaak et al. 2012, Climatic Change (summer stream warming in the US Northwest, 1980-2009); Jensen et al. 2009, Reviews in Fisheries Science (fine sediment and salmon egg-to-fry survival, a meta-analysis); Araki et al. 2007, Science, and Christie et al. 2014, Evolutionary Applications (reproductive success of hatchery-origin fish spawning in the wild)
- Further published sources behind the captions and journal (full list on the journal's Sources page, `src/data/journal.json`; which line each supports is in `src/data/claims.json`):
  - Burgner (1991), Life history of sockeye salmon, in Groot & Margolis (eds), *Pacific Salmon Life Histories*; Heard (1991), Life history of pink salmon, same volume.
  - Quinn (2018), *The Behavior and Ecology of Pacific Salmon and Trout*, 2nd ed.; Dittman & Quinn (1996), *J. Exp. Biol.* 199.
  - DeFilippo et al. (2018), *J. Evol. Biol.* 31; DeFilippo et al. (2019), *Evol. Appl.* 12 (the two DeFilippo listings above).
  - Narver (1970), *J. Fish. Res. Board Can.* 27; Clark & Levy (1988), *Am. Nat.* 131; Scheuerell & Schindler (2003), *Ecology* 84.
  - Brett (1971), *Am. Zool.* 11; Wetzel (2001), *Limnology*, 3rd ed.
  - Ruggerone et al. (2003), *Fish. Oceanogr.* 12; Ricker (1954), *J. Fish. Res. Board Can.* 11.
  - Gende et al. (2001), *Oecologia* 127; Gende et al. (2002), *BioScience* 52.
