# Playtesting with the play log

The game can keep a **play log**: a record of how each life goes, so that the difficulty can be tuned to real people instead of only to the bot players in `docs/balance/REPORT.md`. It is off until you switch it on, it stays in the browser you play in, and the game never sends it anywhere. You decide whether to send the file to anyone.

## What it records

For each life:
- difficulty, habitat, the fish's sex and role (female, male or jack), and the year's conditions;
- settings that change how the game plays: graphics level, game speed, whether the Field guide's step-by-step guidance is showing, gore, cinematic moments and reduced motion.

For each go at a stage (a sibling taking over is a new go):
- when it started and ended, how long it took (time played, without pauses, and game time);
- how it ended: finished, died (with the cause and the spot), spawned, or left unfinished (quit to the title or closed the tab);
- fat and energy at the end, and how many siblings were left;
- each warning shown (bear, seal, char and so on) and each close call (a strike that missed, a mark taken);
- a rough path: where the fish was, once a second.

It keeps the names the game gives your fish, but nothing about you: not your name, your computer, where you are, or anything you type. Up to the last 60 lives are kept; older ones drop off.

## For you: turning it on and sending a file

1. On the title screen, click **Settings**, then the **Play log** tab. The pause menu (Esc) has the same Settings button.
2. Read the short explanation, then click **On**.
3. Play as you normally would. Quitting to the title or closing the tab is fine; the stage you were in is kept as "unfinished".
4. When you're done, open **Play log** again. It shows how many lives are logged. Click **Export play log**. A file called something like `homewater-playlog-2026-11-21-1430.json` downloads.
5. Send that file to me (attach it to a message, or drop it in the shared folder). Please say in a line which computer you played on and anything that felt off.
6. If you want to start fresh (for example before a new round of testing), click **Clear play log** and then **Really clear it?**. This can't be undone, so export first.

Switching it off stops the log at once; what was already logged stays until you clear it.

## For other playtesters

Send them the game link and this short note:

> Before you play, open **Settings** on the title screen, pick the **Play log** tab and switch it **On**. It only records how the game goes (stage times, deaths, settings), stays in your browser and is never sent anywhere. When you've finished, open Play log again, click **Export play log** and send me the file that downloads. Thank you!

Each person's file is separate, so ask them to keep the name the game gives it, or to add their first name or a nickname to it.

## Reading the files (for the coding sessions)

Put the files in a folder (for example `docs/playtests/2026-11/`) and run:

```
npm run playlog -- docs/playtests/2026-11 --out docs/playtests/2026-11/SUMMARY.md
```

Without `--out` it prints to the terminal. It takes any number of files or folders, skips files that aren't play logs, and counts a life only once if the same person exported twice. The summary has the same rows as the balance report (per-fish death rate by stage and cause, the return split into "sea and nets" and "home river", stage lengths, lives completed), so a column can be set beside the bot column for the same difficulty. It adds a table of every death (where, after how long, fat and energy left, warnings and close calls before it) and the settings used.

Things to keep in mind:
- A handful of players is a small sample: read the counts in brackets, not only the percentages.
- Lives marked partial started being logged after the egg stage (a reloaded save, or the log switched on mid-life).
- Stage length is shown as seconds played and seconds of game time; they differ when someone plays at reduced game speed.
- The file format is in `src/telemetry/types.ts` (`kind: "homewater-playlog"`, `version`). The rough path is in each attempt's `trace` as `[seconds, x, y, z, energy, fat]`, for plotting where people swim and die.
