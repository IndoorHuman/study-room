# assets/room/ — sprite exports (1× scene-pixel PNGs)

Final sprite exports land here, produced per `tools/SPRITES.md` (Aseprite,
File → Export As at 100%, tokens.css palette only). Served as-is by
`server.py`'s existing static handler — no build step.

Expected files (canvas sizes are the pinned scene geometry):

| File | Size (px) | Object |
|------|-----------|--------|
| `bg.png` | 384×216 | full-scene background (walls, `--green` feature wall, floor) |
| `bookshelf.png` | 72×112 | bookshelf |
| `album.png` | 40×28 | photo album |
| `journal.png` | 30×14 | journal |
| `desk.png` | 120×56 | desk (draws the empty `--card` note spot itself — RV-9b) |
| `decor-candle.png` | 10×22 | candle (still frame) |
| `decor-plant.png` | 26×44 | plant (still frame) |
| `decor-window.png` | 56×64 | window (still frame) |

Optional decor animations: horizontal N-frame film strips named
`decor-<piece>-anim.png` (e.g. `decor-candle-anim.png`), frame count noted
at export time and hardcoded in the matching `steps()` keyframe.

A missing or 404ing PNG is safe by design: the blockout placeholder stays
visible beneath (fail-visible, never a blank object). Files appear here
object-by-object as the swap window progresses — a partial set is a valid,
shippable state (D-02).
