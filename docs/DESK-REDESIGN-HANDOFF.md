# Handoff — the desk zoom rework, the new sprites, and the Manage redesign

**Written 2026-08-24 by a design session (mockups only).**
**For: whoever runs GSD phase 26.98 "The Room Reads as Lit", or any session
asked to build the Manage screen redesign.**

Nothing here is built. Nothing in `~/study-room` was written, edited, staged
or committed by the session that produced this. Every file named below lives
in `~/design-canvas/`, never in the repo.

---

## 1. What exists, and where

| Thing | Path |
|---|---|
| Desk zoom work | `~/design-canvas/study-room-desk/` |
| Manage screen work | `~/design-canvas/study-room-manage/` |
| The ten new sprites, alone | `study-room-desk/new-sprites/` |
| Published canvas — desk | https://claude.ai/code/artifact/deb3b2c3-e430-46bf-936f-21f414c5a621 |
| Published canvas — Manage | https://claude.ai/code/artifact/20f210db-ce6f-4f98-9218-d2271d11e9bb |

Generated art, all at ship size unless noted:

- `desk-plate-v2.png` — the redrawn desk plate, 768×432, the drop-in
  replacement for `assets/room/desk-station.png`.
- `scene-day.png` / `scene-night.png` / `scene-furnished.png` — the whole
  composed scene, 768×432, **candle excluded** (it animates on top).
- `candle-day.png` / `candle-night.png` — the six-frame candle strip, lit to
  match, 120×44.
- `new-sprites/*.png` — ten sprites at **room scale** (not doubled).

The scripts that produce all of it (deterministic, fixed seeds):

| Script | Produces |
|---|---|
| `draw_plate.py` | `desk-plate-v2.png` |
| `kit.py` | the drawing helpers + the colour names |
| `newassets.py` | the ten new sprites |
| `light.py` | the palette ramps, the depth planes, the lighting, and the composed scenes |
| `compose.py` | an older HTML emitter — superseded by `light.py`, kept only for reference |

Run order if you regenerate: `draw_plate.py` → `newassets.py` → `light.py`.

---

## 2. What the owner actually ruled

Recorded because it is hers, not mine:

- **2026-08-21, Manage screen** — she chose the layout with the rail kept and
  the candle as the landing pane ("option B"), then ruled the side panel out:
  *"remove the side panel or at least make this panel can be hidden, and make
  all of these side panel's option can be found on the main page."* Approved
  the result: *"looks good."*
- **2026-08-22, the desk plate** — *"the desk is not match with the other
  assets, it is different pixel style."* That was correct and is fixed; see §3.
- **2026-08-24, depth** — *"a lot of items are using the same color especially
  green"*; asked for brightness/saturation to carry distance, plus light.
- **2026-08-24, texture** — *"the desk looks too flat."*
- **2026-08-24, new art** — asked for more assets in the same style, planters
  especially, and said explicitly **it is okay to have more colour outside the
  current palette.** That is her permission, and it is the only reason §5's
  ask is on the table at all. It is *permission to propose*, not a ruling on
  any specific hex.

**Not ruled, still open** — do not decide these for her:

1. The palette growth in §5.
2. Whether the desk lamp is placed at all. It is drawn but deliberately left
   out of the scene: the candle is the librarian and the light in that room,
   and a second light source is a fiction decision, not an art one.
3. Whether the redrawn plate replaces the shipped one.
4. The wide empty band on the desk front. Fixing it means raising the desk
   line, which moves the fixture coordinates in §4 — no longer art-only.
5. On the Manage canvas: the group heading *"the room, and the rest"* is mine,
   not hers, and unratified.

---

## 3. Why the old plate clashed, and what the fix was

The shipped `desk-station.png` is authored at 384×216 and ships at 768×432, so
one drawn pixel is 2 device px. Room sprites doubled into that scene are 4
device px per sprite pixel. **The plate was drawn twice as fine as everything
standing on it**, with no ink outlines and a fine 1-px speckle — which is why
it read as a different hand no matter what was placed on it.

The redraw is authored at **192×108, shipped at 768×432**, so one drawn pixel
is 4 device px and matches a doubled sprite exactly. On top of that it adopts
the sprites' own grammar: an ink silhouette line along the desk's top and
bottom edges, wood grain as short wandering strokes rather than noise, three
knots, a lit band under the lip, a shaded foot, a two-row checkerboard where
one value meets the next, boards on the wall and on the floor, and a drawer
with an outline, a bevel, a pull and a cast shadow.

---

## 4. The geometry contract — do not break this

The whole rework is **art-only** because every interactive fixture keeps its
coordinates. From `app.js`, `STATION_DESK` (plate space, 384×216):

```
stack    { x: 80,  y: 96,  w: 56, h: 26 }
drawer   { x: 240, y: 150, w: 84, h: 44 }
session  { x: 12,  y: 96,  w: 60, h: 24 }
notebook { x: 160, y: 100, w: 40, h: 20 }
```

The candle is not painted into the plate — it is the shared station fixture
hosted by `renderStation`.

One deliberate one-pixel change: **objects now stand on y=120, not y=119.**
The redrawn desk's top edge lands on the 192-grid at row 60, which is 120 in
plate space. Anything you place must sit on 120.

What each sprite in the scene is:

| Where | Sprite | Plane |
|---|---|---|
| window, clipped at the desk line | `decor-window.png` (night twin at night) | far |
| shelf plank | **new art**, drawn on the grid | wall |
| shelved | `decor-books.png`, `decor-plant-b.png` (or the pothos + cutting jar, furnished) | wall |
| two pictures | `decor-art.png`, `decor-art-b.png` | wall |
| session spot | `journal.png` | desk, far from the flame |
| blessing stack | drawn in code, untouched | desk |
| notebook fixture | `notebook.png` | desk, nearest the flame |
| right of the candle | `decor-plant.png` | desk |

---

## 5. The palette ask — this is the decision that matters

`tools/SPRITES.md` §2 is the binding rule: sprites are drawn exclusively in
the `tokens.css` hexes. §8.2 adds two sprite-only hexes, making the approved
set **13** — `#a8804f` wood dark and `#3c6234` green dark. Note §8.1 rejected
`#4a3a2c` as an outline; outlines stay `#2c2823`.

Two things follow, and the first one is already done:

- **Two of my proposed colours were duplicates of approved ones.** My dark
  green and my dark wood were replaced with `#3c6234` and `#a8804f` verbatim.
  Do not reintroduce near-misses of an approved hex.
- **Nine of the room's own hexes survive byte-exact** in the day scene. The
  quantiser was originally rounding *every* colour onto a 12-step grid, which
  silently pushed `#4f7b43` to `#547848` and so on. That was a palette
  violation and is fixed: an untouched colour now returns byte-identical.
  **If you change the quantiser, re-check this.**

What is genuinely being asked for:

- The sprite set introduces **eight new hexes**: `#6f9c5a` (lit leaf),
  `#94a487` (dusty sage), `#5f7d8c` / `#8aa3ae` / `#4c6675` (glazed ceramic
  blue and its light and dark), `#b08a3e` / `#c9a75c` (brass, for the lamp),
  `#cfe0e2` (glass and water).
- **The blue is a new hue** — the first cool colour in a palette that is warm
  all the way through. It is the single thing most worth putting to her
  separately, because it changes the room's temperature, not just its count.
- The composed scenes contain **52 colours**, because depth and light are done
  as *palette ramps*, not as filters. About 28 are on screen at once; day and
  night never use the same set.

If 52 is too many, the lever is the ramp step count in `light.py` (`STEPS`).
Three steps per family instead of five lands near 30 and reads flatter.

---

## 6. How depth and light are done (so 26.98 can compare notes)

Two things you may find you have already answered differently. Reconcile
before either is built.

**Depth is a palette swap per plane, never a CSS filter.** What is outside the
window loses most of its saturation and lifts toward the wall colour; the wall
things lose a little; what stands on the desk keeps everything. That is what
produces three distinguishable greens where there was one.

**Light is baked into the art, not applied at runtime.** Night is one flat dim
over the whole plate; the candle then lifts two deliberate zones out of it with
a **checkerboard edge** where they meet. A smooth radial glow was tried first
and rejected — it banded into rings and read as a different medium. The wall
light is clipped at the desk line, and the desk's front edge catches a stepped
lit strip under the flame.

Per-object light is by distance from the flame: the notebook beside the candle
keeps its colour and takes the most; the journal at the far end sits dulled.

**The consequence for 26.98:** this approach needs no runtime lighting code at
all — it needs *art variants* and something to choose between them. The room
already sets exactly one `body.time-*` class at landing. The station background
is a plain `<img>` with a fixed `src`, so day/night desk plates would need that
one line to become time-aware. That is the only code this design implies.

---

## 7. If you build it — the landing rules

**The overwrite trap is the thing that will bite you.** `SPRITES.md` §7.3:
`tests/test_sprite_geometry.py` regenerates every sprite via
`tools/gen_room_sprites.py` before asserting, so **a PNG dropped into
`assets/room/` is silently reverted on the next test run.** This art must land
as codegen inside `gen_room_sprites.py`, or the filename must be added to the
hand-finished skip guard in the same commit. Do not copy my PNGs in and
consider it done.

Related, from §7.4: regeneration must be byte-stable and **every call site
needs its own fixed literal seed**. My scripts are deterministic but share one
`random.Random(2608)` across call sites — converting to per-site seeds is part
of porting them, not optional.

The rest of the checklist that applies here: no uniform fill larger than about
30×30 art px, dither only at shading boundaries, varied grain lengths, stepped
corners with an ink rim, regenerate twice and confirm `git status` is clean the
second time, and look at the exported PNG as an image before committing.

Replacing the plate itself is a pure file swap — the filename does not change,
so no `index.html` or `app.js` edit is involved. Placing any *new* sprite in
the scene is not a swap: it is a new fixture, and §5's "if a swap seems to need
a code change, it is not a swap" applies.

---

## 8. Collisions to know about

- **Phase 26.98 is the direct overlap.** It has already committed an offline
  light pass under `assets/aseprite/handoff/` (which never writes
  `assets/room/`), a wait-message ladder in `app.js`, and owner rulings in
  `tools/ROOM-HANDOFF.md`, with `tokens.css` byte-unchanged and pinned by a
  test. If any of my colours ever reach `tokens.css`, that test is the thing
  that will fail — and it should, until she has ruled.
- **`~/study-room` has had more than one live session in it.** Diff against
  current HEAD immediately before staging, and read the diff; `git status` at
  session start is not enough.
- **The Manage redesign touches `app.js`**, which phases 26.995 and 26.996 also
  touch. It is approved as a direction, not planned or scheduled.
- **Never push this repo.** `CLAUDE.md`'s identity guard: publishing happens
  only through `tools/stage_public.py`, and 399 of 472 commits carry her real
  name and hostname.

---

## 9. The Manage screen, in one paragraph

Separate work, same design system, in `study-room-manage/`. The side panel is
gone; all sixteen panes are surfaced on the page in three groups — the
librarian's own three doors beside the candle portrait, six counted tiles for
what is in the library, and six uncounted tiles plus the four on-device numbers
for the room and the records. A `☰ sections` button reopens the old list as an
overlay, which is her "at least make it hideable" fallback. Tapping a tile
opens that section full-width and the candle shrinks into the corner rather
than leaving. Working files are `Main.dc.html`, `Rail.dc.html`, `Pane.dc.html`;
counts in them are sample data, and every sentence on screen is shipped app
copy except the one heading flagged in §2.
