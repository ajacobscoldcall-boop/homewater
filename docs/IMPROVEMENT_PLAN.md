# Homewater: critical review and improvement plan

Written 2026-11-20 after the realism, behaviour and feel merges. The review is based on:
- a full Field guide life played at High quality, with screenshots of every stage and screen;
- the design brief (`docs/DESIGN.md`), the advisor notes and the balance report;
- the code.

The aim is to say plainly where the game falls short, then lay out a plan to fix it.

## Part 1: what is weak

### A. Realism and comprehensiveness

1. **A life is about 8 minutes, not the 30 the brief asks for.** The balance report puts a completed life at 7.5-8.7 min.
   - The ocean (two or three years) takes about 85 s, and the whole journey home takes about 70 s.
   - The time skips are told in captions rather than felt, so a life reads as six short minigames, not a life.
2. **Whole parts of the real life cycle are missing,** including some the brief promised:
   - **The return skips the lake.** Bristol Bay-type sockeye come up the river, cross their nursery lake and spawn in its tributaries or on its beaches. In the game the river forks straight to the grounds, so lake-beach fish never cross the lake they will spawn in.
   - **There is no move to salt water.** The brief promised the change to saltwater on the smolt run, and the code has no estuary, salinity or silvering moment.
   - **The egg stage has only the flood.** Silt, low oxygen and egg predators (sculpin, char, gulls on the grounds), all promised in the brief, are absent. The eggs look like identical opaque orange balls, with no eyed stage.
   - **Fry face only Dolly Varden.** The brief promised diving birds. The fry's real daily decision, diel vertical migration (deep by day, up to feed at dusk and dawn), appears only as the dusk feeding moment.
   - **The spawning grounds look empty**, even in a year the card calls "a big run". Real grounds in a big year are crowded with fish, redds and carcasses, and most of the drama comes from that crowd.
   - **The ocean is a set of empty arenas.** There is no route (out along the coast, round the Gulf of Alaska, home again), no seasons and no sense of distance. Growth at sea is not visible.
   - **Human impact is one gillnet line and anglers.** Nothing changes over generations: no warming trend, logging silt or hatchery strays, and no set-net or subsistence fisheries. Year-to-year variation is random noise.
   - **Heat kills instantly** (`death.heat`). In real warm years the larger story is disease (for example Ich) and fish that reach the grounds and die before spawning. This is already an open advisor question.
3. **Aids that make it look like a game, not a documentary:**
   - the magnetic track is drawn as blue shimmer markers, and scent as visible specks;
   - predators carry text labels ("DOLLY VARDEN", "CHAR") inside target rings;
   - status is shown as stat bars.

   These help new players, but nothing lets an experienced player drop them for a more natural view.
4. **The science behind the numbers is thinner than the captions suggest.**
   - 148 of 438 parameters are marked placeholder.
   - `docs/ADVISOR_NOTES.md` lists 55 open questions, and none of round 3 has come back yet.
   - Several mechanics rest on game devices: calm schooling helping imprinting, bear risk diluted among adult migrants, the heat thresholds.
   - Captions state some of these in the same confident voice as established biology.
5. **Biology and scale errors visible on screen:**
   - **Krill** are drawn several times too big: in the ocean shot each one is about the length of the salmon's head. Euphausiids are about 2 cm; an adult sockeye is about 50-60 cm.
   - **The smolt "school"** is about a dozen fish. The caption speaks of thousands. Nearby school-mates look bigger than the player's fish.
   - **The smolt run happens at night,** but it looks like daytime.
   - **Mid-water particles** (grey ovals) look like floating stones in the fry and smolt stages.
   - **Seen from above,** the default camera makes adult fish look like sausages, and the spawning female looks bent into an S.
   - **Fry** show no parr marks.

### B. UI and UX

1. **The camera hides the main character.** In most stages the default view looks almost straight down on the fish.
   - The fish becomes a thin stick (fry, return, spawning).
   - The horizon and the surface disappear, and threats arrive from off-screen.
   - The feel pass fixed clipping, but not the framing.
2. **Too much text at once.** At stage starts the screen can show:
   - the stage card;
   - a guide box;
   - up to three caption boxes;
   - up to three "new journal entry" toasts.

   Much of it repeats the same instruction (guide "Wait. An egg can do little but wait" beside caption "There is little an egg can do but wait"). The captions sit over the lower middle of the screen, where the action is.
3. **The most important state is hidden.**
   - Energy and fat sit behind H (details), and the default HUD shows almost nothing.
   - Running out of fat is the top cause of death upstream. A player can't see it coming unless they open the details.
4. **The menus are walls of equal buttons.**
   - The title has nine buttons plus the gore choice. The pause menu has twelve, plus the graphics presets, and the captions show through it.
   - Settings are spread over Controls, Readability, the pause menu and the title.
   - There is no single settings screen and no "Continue" as the obvious first action.
5. **Stage cards lead with abstractions.** Before the player has context, the egg card explains bet hedging: "A warm year. This year favours early-run fish. Late-run fish burn more fat... A big run. More big males crowd the spawning grounds...".
6. **Choosing an offspring is a text puzzle.**
   - Three cards list seven adjectives each, with no portraits and no comparison against the river's average.
   - Nothing says what a trait will mean in this river and year. In the review, all three offspring were "prone to wander".
   - It is the main decision across lives, and it is the hardest one to make well.
7. **The recap is one long scroll:** score formula, year paragraphs, run chart, records, offspring and tree on one page.
8. **No sense of journey.** Nothing shows where the fish is in its life or its route (lake, river, sea, home) or how much time has passed. Deaths and time skips arrive without context.
9. **Missing basics for a public game:**
   - no recorded narration or real audio (procedural placeholders only);
   - no localisation;
   - desktop only, with no touch support;
   - never tested in Firefox or Safari, or on real low-end laptops.

### C. Process

1. **Nobody has played it as a player yet.** All 87 checklist items are unmarked. Every tuning decision so far comes from bots, and the last one (the falls) had to be made on bot evidence alone.
2. **The code has grown by layering streams.** `App.ts` is 1,273 lines and `spawn.ts` 1,150. New features increasingly need hooks in the same few files, which is where the bugs of the last three bug hunts came from.

## Part 2: the plan

Five tracks. Track 1 matters most: the realism already in the game is buried under readability problems, and adding more content before fixing that would bury it deeper. Tracks 1-3 can run as parallel work sessions, the same way the last two rounds did; tracks 4 and 5 run alongside.

### Track 0: ground truth (needs the owner and advisor; small but blocking for tuning)

- **The owner plays** one Field guide life and one Wild life with the checklist open, and reads the fps on their own machine. 20-30 minutes.
- **Play log:** the game gets an opt-in, local-only play log (time per stage, deaths with place and cause, settings), exportable as a file. The owner and a few outside players can then send real data, and balance can move from bots to people.
- **Advisor triage:** sort the 55 open advisor questions into the ten that most affect what captions claim, and send those first (with the screenshot pack).

### Track 1: readability and UX overhaul

1. **Camera framing.**
   - A low chase camera near the fish's depth, slightly above and behind, so the fish is seen side-on in silhouette and the surface or horizon stays in view.
   - Side-on framing for spawning, fights and the falls.
   - A soft look toward a hot threat, so the danger is on screen before it strikes.
   - Top-down stays available as a view option.
2. **Text diet.**
   - One caption at a time from a priority queue; the rest go to the journal.
   - Guide steps and captions merged, never saying the same thing twice.
   - Journal toasts batched into one chip ("3 new journal entries").
   - Captions moved off the centre of the action and shortened.
   - A science line can be expanded ("more") rather than shown in full.
3. **An always-visible minimal HUD.**
   - Energy and fat shown at all times as two small rings by the fish's position, or along the bottom edge.
   - Fat warnings timed so a player can still act on them, with the water temperature shown only when it matters.
   - The details panel stays for more.
4. **Menus.**
   - The title becomes Continue (when there is a save), New lineage, Lineages and records, Field journal, Settings, About.
   - One tabbed Settings screen holds Gameplay (difficulty aids, guidance, cinematics), Controls, Readability, Graphics, Audio and Content (gore).
   - The pause menu becomes Resume, Settings, Journal, Photo mode, Save and quit, over a dimmed screen with captions hidden.
5. **Stage cards.** One line of place and season, one line about the year in plain words, and the full year effects behind a "This year" link. The bet-hedging explanation moves to the recap, where it can point at what happened.
6. **Choosing an offspring.**
   - Each card gets a rendered portrait of the fish at spawning age, reusing the gallery renderer.
   - Traits become small bars against the river's average instead of adjectives.
   - One plain line per card explains what the traits mean this coming year, from `yearFavours`.
   - Field guide players get a "Suggested" badge.
7. **Recap in pages:**
   - **Your life:** a route map with where each thing happened and where siblings died.
   - **Your river:** the run chart and the fishery.
   - **Your line:** the tree, records and score.
8. **A life map.** An illustrated route map between stages (gravel, lake, river, estuary, ocean loop, home river, lake, grounds), with the fish's progress and the years passing. It shows distance and time, which the stage cards can't.
9. **Onboarding.** The first minute teaches steering, depth and burst by doing, with a picture of the controls. Mouse steering explains pointer lock the first time.

### Track 2: fill in the missing life (realism)

Each item goes past the advisor notes, and anything not supported is labelled as a game device.

1. **Home through the lake.**
   - A new segment between the river and the grounds: cross the nursery lake following the home scent to the right tributary or beach.
   - In warm years, hold in cool deep water while colours come on.
   - It gives lake-beach fish their real route and reuses the fry lake's scenery at adult scale.
2. **Crowded spawning grounds.**
   - Dozens of spawners, more in big runs: instanced fish with simple behaviours, plus redds, guarding, chases and carcasses everywhere.
   - Char and gulls eat drifting eggs.
   - The crowd drives the competition the sim already models: superimposition, fights, jack openings.
3. **Fry: birds and vertical migration.**
   - Terns or loons strike from above in the shallows.
   - The daily choice becomes real: deep and dark by day (safe, little food) or up at dusk and dawn (food, predators).
4. **Estuary and smoltification.**
   - A short brackish-water moment at the end of the smolt run: the school holds where fresh and salt water meet.
   - Silvering finishes, and gulls and seals hunt the mouth.
   - Kept brief, since sockeye smolts move through quickly.
5. **Egg stage threats.** A silt event (choose depth in the gravel to keep oxygen flowing), a low-oxygen pocket and a sculpin probing the gravel. Eggs become translucent orange-red, and eyed before hatching.
6. **The ocean as a journey.**
   - A loop map out along the coast, round the gyre and home, one encounter per season.
   - Ocean temperature and food set growth, and the fish visibly grows between encounters.
7. **Heat realism.** In warm years, disease and pre-spawn death join (or replace) instant heat death, depending on the advisor's answer.
8. **A changing river (optional mode).**
   - Across generations: a warming trend, a logging-silt year, hatchery strays, set-net and subsistence fisheries, and fishery closures that respond to the run.
   - Off by default, so the default game stays a Bristol Bay-type river. No dams, as the brief says.
9. **Length.** Deepen stages until a first life is about 20-30 minutes, as the brief asks, by adding decisions, not padding. Later lives keep the shortened vignettes.

### Track 3: looks and sound

1. **Scale audit.** A unit test compares every model's drawn size with the size the sim and the biology give, plus fixes: krill, eggs, fry, smolt, school-mates.
2. **Fish by stage:**
   - alevin with a yolk sac;
   - fry with parr marks;
   - smolt silver with a dark back;
   - better side silhouettes for adults.

   Plus a review of every pose so bodies never fold unnaturally.
3. **Light and weather.**
   - A real night for the smolt run.
   - Seasonal light, overcast and rain on the surface, and ice in winter seen from below.
   - Mid-water particles redrawn so they read as drifting matter, not stones.
4. **Above the water.** Banks with trees, bears on the bank and people at the nets, seen properly when the fish is near the surface.
5. **Sound.** Recorded ambience from properly licensed libraries in place of the procedural placeholders, and narration recorded from the existing script (owner's choice of voice).
6. **Art direction decision.** Either keep everything built in code and push one coherent stylised look, or buy a few animal models (bear, eagle, seal). The owner decides this, because it costs money.

### Track 4: science integrity

1. **Tags on claims.** Tag every caption and journal entry as established, simplified or game device. The journal shows a "How true is this?" note on simplified and game-device entries, and links to the published sources.
2. **Caption audit.** Rewrite any caption that states an open question as fact.
3. **Advisor review.** Send round 3 and the screenshot pack, and apply the answers as tuning.

### Track 5: foundations

1. **Split `App.ts` into screen controllers** (title, stage card, play, death, recap, lineages), and split `spawn.ts` by role, before Track 1 and 2 work lands in them.
2. **Browser and hardware tests:** Firefox and Safari in CI, and a low-end preset checked on real hardware (owner).
3. **Balance retargeted from bots to the play logs** once the logs exist.

## Part 3: order and effort

| Phase | What | Who | Rough size |
|---|---|---|---|
| Now | Track 0 play log; Track 5 split of `App.ts`; Track 3 scale audit | Claude | 1 round of 3 sessions |
| Phase 1 | Track 1 in full (camera, text diet, HUD, menus, cards, offspring, recap, life map, onboarding) | Claude, owner checks feel | 1 round of 4-5 sessions |
| Phase 2 | Track 2.1-2.4 (lake home, crowded grounds, fry birds and vertical migration, estuary) | Claude, advisor checks | 1 round of 4 sessions |
| Phase 3 | Track 2.5-2.9 and Track 3 (egg threats, ocean journey, heat, changing river, length; looks and sound) | Claude, owner decides art and voice | 1-2 rounds |
| Throughout | Track 4 science integrity; owner and outside playtests | Claude, owner, advisor | ongoing |

Owner decisions (2026-11-20):
1. **Life length:** grow a first life towards 20-30 minutes by deepening stages with real decisions. Later lives keep shorter vignettes.
2. **Aids:** a "Documentary view" setting. Aids stay on by default; the setting swaps labels, target rings, scent specks and magnetic markers for subtler cues: shadows, sound and the fish's own reactions.
3. **Changing river:** yes, as an optional mode, off by default. The main game stays a healthy Bristol Bay-type river.
4. **Start:** the groundwork (play log, code split, scale fixes) and Phase 1 (Track 1) now; Phase 2 after.
5. **Money for models and a narrator:** not decided yet.
