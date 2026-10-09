# Bejeweled 3 – HTML5 port

An HTML5/canvas port of Bejeweled 3: Classic, Zen, Lightning, Butterflies, Diamond Mine, Ice Storm and Poker. The engine code in `web/js/` is original; all art,
sound and music come from **your own installed copy** and are converted locally. The extracted
assets are copyrighted by PopCap/EA, so keep `extracted/` and `web/assets/` private and don't redistribute them.

## Setup
```sh
python3 tools/build_assets.py   # quickBMS-extracts main.pak (if needed) and converts assets into web/assets/
./run.sh                        # serves http://localhost:8080
```
Set `BJ3_DIR` if the game isn't in `~/.local/share/Steam/steamapps/common/Bejeweled 3`.
Requires: python3 + Pillow, opj_decompress (openjpeg), openmpt123, ffmpeg.

## Pipeline
- `tools/quickbms` + `tools/popcap_pak.bms` – PopCap .pak (XOR 0xF7) extractor script
- `tools/convimg.py` – merges colour `.jp2/.jpg` with `name_.gif` alpha masks into PNG
- `tools/build_assets.py` – images (with layout x/y + sprite-sheet info from resources.xml), 1920x1200
  backgrounds, PopCap bitmap fonts → JSON, sounds, music subsongs rendered from the `.mo3` module

## Game
- `mode.js` – shared mode scene (frames, widgets, input, dialogs, level/game-over flow); each mode subclasses it:
  `classic.js`, `zen.js` (no game over, mantras from your game's `affirmations/` folder), `lightning.js`
  (60s rounds, time gems bank time, multiplier per round), `butterflies.js` (butterflies climb each move,
  spider web at the top), `diamondmine.js` (dirt layers with treasure, board scrolls down, timer)
  `icestorm.js` (rising ice columns, steam meter raises the multiplier), `poker.js` (each move deals a card in the colour
  of your match; five make a poker hand whose value grows every hand; Skulls land on hands, making one flips the Skull
  Coin; completed hands fill the Skull Eliminator; the table glows for the hand your cards are heading for).
  Games in progress are saved and can be continued.
- `pam.js` + `tools/pam.py` – PopAnim (.pam) parser/player; the mode UIs (mine pillars/drills, lightning header,
  ice storm meter, ice columns, spider) play from the game's own animation files
- `board.js` – matching, flame/star/hypercube/supernova gems (a Hypercube goes off where it is, nothing swaps), chain reactions, gravity with bounce, cascades
- `classic.js` – scoring, levels, background changes, no-more-moves game over, hint, pause/options
- `fx.js` – particles: shards, sparkles, fire, lightning, beams, popups, compliments
- `font.js` – PopCap layered bitmap font renderer; `audio.js` – Web Audio SFX + streamed music
- Scales to any window (landscape and portrait layouts, HiDPI). Keys: F fullscreen, H hint, Esc pause.
- `host.js` – on Kuddes (`index.html?host=kuddes`, served at `/bejeweled/`): badges and bests from the member's
  account, saves per member, badge counts and finished games sent back, `quit`/`progress`/`score` posted to the page.
  Without `?host` nothing changes.

## In the Kuddes repo
The code (`web/index.html`, `web/js/`, `tools/`) is tracked; `extracted/`, `web/assets/` and `tools/quickbms` are
git-ignored. Build the assets here, then copy `web/assets/` to the server (DEPLOY.md 5.3).
