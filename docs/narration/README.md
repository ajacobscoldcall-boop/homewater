# Recording the narration

Homewater shows short science captions as you play. Each one can also be spoken. If a recording exists for a caption, the game plays it alongside the caption. If not, the caption is just text, so you can record some lines and leave the rest.

## What to record

The full list is in `recording-script.md` (or `recording-script.csv` for a spreadsheet). Each row gives:
- the **file** name to save the recording as
- the **stage** it belongs to
- **when it plays**
- the **line** to read

Lines marked "not recorded" contain a number that changes from game to game, such as how many fish were lost. Skip those.

## How to record

- **Voice:** calm and unhurried, like a nature documentary. Clear, not dramatic.
- **Pace:** a little slower than conversation. Most lines are 5 to 15 seconds.
- **Format:** MP3, mono, 44.1 kHz, about 96-128 kbps. One line per file.
- **Silence:** trim to about a quarter-second at the start and end.
- **Room:** quiet, with no music. A phone in a closet full of clothes works surprisingly well.
- **Names:** save each file exactly as named in the File column, for example `egg.hatch.mp3`.

## How the recordings get into the game

Send the files to whoever maintains the game. They go into `public/audio/`, and then `node scripts/recording-script.mjs --manifest` updates the list of recorded lines. Nothing else needs to change.

If captions change later, run `node scripts/recording-script.mjs` to rebuild the script.
