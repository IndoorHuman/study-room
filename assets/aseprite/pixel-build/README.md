# pixel-build/ — the "Pixel Build Script" set (2026-08-06)

> ## ⛔ BLOCKED — these assets do not conform to the binding palette
>
> **Owner ruling, 2026-08-06: the sprite outline stays `#2c2823` (`--ink`).**
> The build script's proposed warm-brown outline `#4a3a2c` is **rejected**;
> `SPRITES.md` §2 stands binding and unamended, and the palette is **13, not
> 14**. `divider.png` and `icons.png` are 100% `#4a3a2c`. Nothing ships until
> it is re-outlined.
>
> **Progress: 2 of 27 conform.** `decor-candle.png` and `decor-candle-anim.png`
> were rebuilt from the owner's reference on 2026-08-07 and outline in `--ink`
> (measured: 5 colours, no `#4a3a2c`). **25 shipped assets still to go.**
>
> **Do not "fix" this with a global colour replace.** In 18 of the 33
> `#4a3a2c` is the only dark and a replace is right; in the other 15
> (`decor-window-night`, `decor-window-dusk`, `bookshelf-fill-1..3`,
> `bookshelf`, `_zoom-windows`, `_zoom-ii`, `_contact-sheet`, `desk-station`)
> `OUT` and `INK` are **two distinct tones** and merging them flattens the
> shading. Re-outlining is per-sprite work, awaiting owner direction.
>
> See `tools/SPRITES.md` §8.1 (the ruling) and §8.2 (corrected palette).

Implements `Pixel Build Script.dc.html` **and `Pixel Build Script II.dc.html`**
from the *App UI style customization* design project — 27 assets, drawn from
`../study-room.gpl` (⚠ that palette file still carries the rejected 14th
colour — see the block above).

**Script I:** 11 room sprites + 2 window variants + 4 UI assets.
**Script II:** the window redone onto woods (3 files, replacing the hill
version), the bookshelf fill states (empty case + 3 overlays), `bg.png`, both
384×216 zoom plates, a rung-3 material pass on desk + bookshelf, and two
rung-4 story details on every remaining sprite.

**Owner correction, 2026-08-06 — the window looks AT one tree, up close.**
Script II specified five conifers standing on the ground in the middle
distance. The owner's reference photos supersede it: a single tree right up
against the glass, seen at second- or third-floor height. So the pane holds
a trunk crossing the full height, branches reaching across the frame, leaf
masses hung off them, and daylight coming through the gaps between. Not a
treeline, and not a canopy seen from above (that was an intermediate read of
"from the 2nd/3rd floor" and it was wrong).

Three things that are load-bearing, in build order:

- **The trunk sits in the left third on purpose.** Centred, it would hide
  behind the vertical mullion and the whole composition would be wasted.
- **Four depth layers, back to front:** daylight, far leaves, bark, near
  leaves. Collapse any two into one value and the tree flattens.
- **Night is a silhouette read**, so the sky behind stays the *lightest*
  thing in the pane. The first attempt made the night sky the darkest value
  and the window rendered as a black rectangle — there was nothing for the
  tree to be a silhouette against.

Leaf clumps are deliberately ragged (three summed sine terms on the radius);
a smooth ellipse reads as fruit, not foliage.

**Owner correction, 2026-08-07 — the candle.** Rebuilt from a pixel-art
reference: the dish is gone (it is a bare taper now), the silhouette is
irregular because the wax has melted and run, a burnt `--ink` rim sits
directly under the flame, and the flame has a hot `#e0c79a` core inside the
`#e8503a` outer instead of being one flat colour. Three things learned the
hard way, in the order they broke:

- **A wide column on a 10px canvas reads as a jar, not a candle.** The wax is
  4px of visible colour inside a 6px silhouette.
- **Shade relative to each row's own edges, not to absolute x.** Shading by
  absolute x meant every drip widened the cream highlight until the left half
  of the candle was a white stripe.
- **The flame's core must stay ~a quarter of it.** At half, orange stops
  being the colour you read first and the flame becomes a cream blob in a
  thin red rim.

- `build.py` — the generator. Zero-dep, no randomness, byte-stable on re-run.
- `png/` — the exports, at exact spec sizes. `_contact-sheet.png` and
  `_zoom-ui.png` are review aids; `_candle-f2.png` is a build intermediate.
  Anything `_`-prefixed is not a shipped asset.
- `aseprite/` — editable `.aseprite` twin of each PNG, palette attached.
  `decor-candle.aseprite` is the only multi-frame source (2 frames @ 400ms).

## Why this is NOT in assets/room/

The design doc says "drop them in `assets/room/` and nothing else changes".
Doing that today would lose the work: `tests/test_sprite_geometry.py` runs
`tools/gen_room_sprites.py` before asserting, so every file in `assets/room/`
is regenerated on the next test run (`tools/SPRITES.md` §7.3, the overwrite
trap). This set stays here until the landing decision below is made.

## Open conflicts with tools/SPRITES.md (owner's call)

The docs are a deliberate art-direction proposal. Script II **resolved the
one that mattered** — its rung-3 "material" requirement and its dithered sky
fades are the §7 texture pass, arriving under a different name. Script I's
rule 6 ("flat fills, no dithering") now applies only below 40px, where §7's
30×30 threshold does not bite either. The two specs agree.

Two conflicts remain, and both are still live:

| | The docs say | SPRITES.md says |
|---|---|---|
| Palette | 14 colours, adding `#a8804f` `#3c6234` `#b5623a` `#4a3a2c` | §2: the `tokens.css` 11 only, "zero off-palette pixels" |
| Outline | `#4a3a2c` warm brown; `#2c2823` becomes text-only | §2/§3: `#2c2823` is the sprite line-work colour |

## Notes on the Script II build

- **Backgrounds carry no silhouette outline.** Rule 3 is an object rule;
  `bg.png` and both station plates fill their canvas and are the value range
  everything else is judged against, so outlining them would ring the scene
  in brown.
- **The station plates are authored at 384×216**, per the doc and per the
  `assets/aseprite/README.md` convention. The *shipped* `desk-station.png` /
  `shelf-station.png` are 768×432 — the generator upscales 2× at export, so
  these need that step on landing. `bg.png` ships at 384×216 and needs none.
- **Geometry verified against the live app**, not just the doc:
  `STATION_DESK.drawer` is `{x:240, y:150, w:84, h:44}` and the plate's
  drawer face matches exactly; the slab top line is y120; `STATION_BOARD_YS`
  is `[56,104,152,200]` and `STATION_PITCH` is 26. The reserved fixture band
  (x12–210, y96–121) is left as plain wall.
- **The shelf-station board shadow is subtle by construction.** The doc calls
  it "the most important element in the sprite", but it specifies
  `#b7b2a8` fading into a `#dcd5c8` back panel — a small step in this
  palette. It is built solid for 2px then dithered out over 3. If it needs to
  read harder, the fix is a darker first row, which is off-spec.
- **Script II §06 step 3 cites "Script I §00b", which does not exist** in
  Script I (its sections run 00, 01–06). Read as the rung-3 pass from §01,
  which is what was built.
- **Not built:** the `#2c2823` → `#4a3a2c` colour replace on the *existing*
  shipped sprites, and the shelf-state `<img>` swap wiring — both are code
  changes to live files, waiting on the palette ruling above.

## Landing procedure, when the direction is confirmed

1. Amend `tools/SPRITES.md` §2 (palette table) and §7 (fill rule) to match.
2. Port `build.py`'s draw calls into `tools/gen_room_sprites.py` so the
   generator stays the source of truth (§7.3), **or** add each filename to
   the `FINALIZED_BY_HAND` skip-guard and copy the PNGs to `assets/room/`.
3. Swap per §5 — `<img>` + `has-sprite`, nothing else.
4. Regenerate twice; `git status` must be clean the second time (§7.4).

## Not done here (separate change, deliberately not bundled)

The doc's other ask — colour-replace `#2c2823` → `#4a3a2c` across the
*existing* shipped sprites — touches the generator and every PNG in
`assets/room/`. It is a one-line change per call site but it is a visual
change to shipped art, so it waits on the same decision as above.
