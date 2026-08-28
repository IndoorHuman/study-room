# SPRITES.md — the zero-dep sprite pipeline (Phase 24, D-01..D-05)

This file documents the complete manual pipeline for producing and swapping in
the study room's pixel-art sprites. Anyone with Aseprite (1.3.17,
`/Applications/Aseprite.app`) can produce a compliant sprite and land it
without touching code beyond one `<img>` tag and one class. There is no build
step, no package, no dependency — `server.py`'s existing static handler
already serves any `.png` under the repo root. (This file is the second
`tools/` register; `tools/fetch_vendor.py` is the precedent: plain,
zero-dep, documented.)

The room ships blockout-first (D-02). Sprites trail function: a mixed
blockout/sprite scene is valid and shippable at any point in the swap window.
Art quality may trail checkpoints; function may not.

---

## 1. Canvas sizes (one .aseprite per object, at scene-pixel size)

The scene's internal canvas is exactly **384×216** (16:9, the *Case of the
Golden Idol* register). Every object sprite is authored at its scene-pixel
size — never larger, never downscaled later. From the pinned scene geometry:

| Object | File | Canvas (px) |
|--------|------|-------------|
| background | `bg.png` | 384×216 |
| bookshelf | `bookshelf.png` | 72×112 |
| photo album | `album.png` | 40×28 |
| journal | `journal.png` | 30×14 |
| desk | `desk.png` | 120×56 |
| candle | `decor-candle.png` | 10×22 |
| plant | `decor-plant.png` | 26×44 |
| window | `decor-window.png` | 56×64 |

Sources live in `assets/aseprite/`, committed and GROUPED by role —
`background/` · `stations/` · `furniture/` · `items/` · `decor/` (one
editable `.aseprite` per shipped PNG; see `assets/aseprite/README.md`
for the full catalog + the §7.3 source-of-truth contract). Exports land
flat in `assets/room/` — export paths are pinned by code and never move.

## 2. The palette (D-04 — the palette IS the token sheet)

Sprites are drawn exclusively in the `tokens.css` hexes. This is the
UI-SPEC Sprite Palette table, reproduced verbatim (it is the pixel-plugin
`/pixel-palette` swatch source):

| Hex | Token | Role in the scene |
|-----|-------|-------------------|
| `#eeeae1` | `--paper` | warm off-white walls (the 60% dominant) |
| `#dcd5c8` | `--paper-shadow` | shadows, wall hairlines, sprite shading |
| `#fbf7ee` | `--card` | daylight highlights, paper objects, the desk's reserved note spot |
| `#e0c79a` | `--btn-bg` | blonde bamboo wood — floor, shelf faces, desk top |
| `#cda86e` | `--wood-deep` | deeper wood — furniture outlines/legs, shelf shadows |
| `#2c2823` | `--ink` | darkest darks — sprite line work, object silhouettes |
| `#555047` | `--ink-soft` | mid-shadow tones |
| `#b7b2a8` | `--stone` | pale stone — pot, window frame, muted props |
| `#4f7b43` | `--green` | **the ONE living-green feature wall** (reserved — this phase finally consumes it) + plant foliage only |
| `#e8503a` | `--accent` (coral) | **stays confined to its Phase 23 role: active-filter markers in chrome. NOT scene decoration.** At most ONE rare art-pop pixel accent (e.g. a tiny book spine) — planner may include zero; never a whole object |
| `#9a2828` | `--never` | not used in sprites — destructive chrome only |

Hard constraints on top of the table (⚠ the table above is the UI-SPEC
reproduction and keeps its pre-2026-08-25 role wording verbatim; the bullets
below are the governing constraints, and two of them were rewritten by
The owner's rulings of 2026-08-25):

- `--green` (`#4f7b43`) appears as the feature wall (in `bg.png`), as plant
  foliage — **and, ruled 2026-08-25, as the pencil in `pen-cup.png`**, the
  first non-foliage carrier of the one living green in the room. Nowhere
  else.
  **The ruling on the pencil (the owner, 2026-08-25).** The sentence previously
  read "ONLY as the feature wall (in `bg.png`) and as plant foliage. Nowhere
  else." The desk zoom rework's `pen-cup.png` draws one pencil in `--green` —
  not a wall, not a leaf. She answered by an AskUserQuestion selection made
  with the two-crossings render open on her screen
  (`26.9995-03-two-crossings.png`, kept in the planning tracker's phase
  folder): the green pencil beside the same pencil in a colour already in
  the cup, everything else identical, at real size and at 4x. She was told
  plainly, before answering, that the visual change is small, the rule
  change is real, and rules bent once tend to get bent again. Her words,
  verbatim, **2026-08-25** (the selection label she chose): **"Green
  pencil"**. Gate consequence (landed in Plan 04, red-first):
  `pen-cup.png` joined `GREEN_SPRITES`, 10 + 6 foliage + 1 = 17. No other
  non-foliage use is opened by this — the ruling names one pencil in one
  sprite.
- Coral (`#e8503a`) appears in scene art as the candle flame
  (`decor-candle.png` / `decor-candle-anim.png`, ≤4 art px per sprite and
  per frame) — **and, ruled 2026-08-25, as the red flowers on
  `plant-cactus.png` (12 art px) and `plant-budvase.png` (21 art px)**,
  drawn as the designer drew them. Never an interaction signal — that half
  of the old rule stands untouched. (⚠ The cactus count was first recorded
  as 13 from the Plan 03 render note; Plan 04 measured the EMITTED sprite
  at 12 — the flower disc is 13 px before its `claylt` tip overwrites one.
  The gate pins the emitted number.)
  **The ruling on the flowers (the owner, 2026-08-25).** The sentence
  previously read "at most as ONE ≤4px art-pop detail in ONE sprite across
  the whole scene — or not at all. Never an interaction signal, never a
  whole object." The desk zoom rework's cactus and bud vase each flower in
  coral, over that ceiling and off that roster. She answered by an
  AskUserQuestion selection made with the two-crossings render open on her
  screen (`26.9995-03-two-crossings.png`, planning tracker's phase folder):
  both plants with red flowers beside the same plants with terracotta
  (`--clay-light`) flowers, everything else identical, at real size and at
  4x. She was told plainly, before answering, that the visual change is
  small, the rule change is real, and rules bent once tend to get bent
  again. Her words, verbatim, **2026-08-25** (the selection label she
  chose): **"Red flowers"**. Gate consequence (landed in Plan 04,
  red-first): `CORAL_SPRITES` grew 2 → 4, and the ceiling became
  PER-SPRITE — the candle keeps its 4-art-px-per-frame ceiling exactly
  (the ruling names two flowers, not the flame), and the two flowers are
  pinned at their measured emitted counts, 12 (cactus) and 21 (bud vase),
  in `CORAL_ART_PX_PER_SPRITE`. 26.98's D-1(b) ("coral stays literal") is
  about the librarian's coral in chrome and is not touched by this.
- `--never` (`#9a2828`) is never used in any sprite.

## 3. Craft rules (Golden Idol register: bold shapes, charm over fidelity)

- **Hard pixel edges.** No anti-aliasing, ever.
- **No partial-alpha edge pixels.** Every pixel is fully opaque or fully
  transparent — AA'd/soft edges fringe under `image-rendering: pixelated`.
- **No colors outside the table above.** Zero off-palette pixels.
- **No text glyphs in any sprite** (D-03). All text lives in HTML chrome at
  native resolution, never inside the pixel-scaled bitmap.
- **Dithering sparingly — but never zero.** Bold readable shapes beat
  texture, AND a large uniform fill reads as vector art, not pixel art.
  §7 (the pixel-craft spec) is the binding reconciliation: shapes stay
  bold, surfaces carry quiet tooth, dither lives only at shading
  boundaries.
- The desk sprite MUST draw the empty note spot: a `--card` (`#fbf7ee`)
  rectangle on the desktop at the pinned position (scene coords x300 y98
  w26 h14 — 14 scene px above the desk button's top edge). Drawn empty,
  deliberately: it is the Phase 26 designated-gift-spot promise.

## 4. Export (manual, at 100% — never resized in Aseprite)

1. In Aseprite: **File → Export As…**
2. Target: `assets/room/<object>.png` (filenames per the table in §1).
3. Scale: **100%** — the PNG is the 1× scene-pixel bitmap. All scaling
   happens in the browser via integer multiplication + `pixelated`.
4. Commit the `.aseprite` source to `assets/aseprite/` alongside the export.

**Decor film strips:** a decor animation exports as a horizontal N-frame
strip named `decor-<piece>-anim.png` (e.g. `decor-candle-anim.png`: N frames
of 10×22 side by side → N·10 × 22). Note the frame count at export time —
the CSS keyframe uses a HARDCODED integer `steps()` count (frames − 1),
never a `var()`.

## 5. The swap procedure (byte-exact — a swap changes art ONLY)

A swap is exactly two edits to the object's button in `index.html`:

1. Add `<img src="assets/room/<object>.png" alt="">` inside the object's
   `<button class="room-object">`.
2. Add the class `has-sprite` to that button.

Change NOTHING else. No new hotspots, no geometry changes, no handler edits,
no motion added to content. If a swap seems to need any code change beyond
the img tag + class, it is not a swap — stop (D-02 discipline).

Why this works (pinned in 24-01, RV-9): `.room-object img { position:
absolute; inset: 0; }` layers the sprite over the blockout by rule, and
`has-sprite` removes the dashed outline + label chip via CSS. A sprite 404
leaves the blockout visible beneath — fail-visible, never a blank object.

**Desk handoff (RV-9b):** the desk SPRITE draws the note spot; the HTML
`.room-note-spot` span hides automatically under `has-sprite` (the 24-03
tokens.css rule). Exactly one note spot is ever visible across the swap.

### Per-swap checklist (every object, every time)

- [ ] `node tests/test_no_push.cjs` exits 0 (and
      `node tests/test_surface_wiring.cjs` for the full per-swap gate).
- [ ] Browser look after a hard reload: the object's hotspot, hover lift,
      and panel behavior are unchanged.
- [ ] Fail-visible check: with the PNG deleted or 404ing, the blockout shows
      beneath — never a blank object.
- [ ] **Post-swap DOM check (RV-13):** the button's inline `--x/--y/--w/--h`
      values are byte-identical to the pre-swap markup, and the diff shows
      ONLY the added `<img>` child + the `has-sprite` class.
- [ ] **Desk swap only (RV-9b):** exactly ONE note spot visible — the
      sprite's drawn spot; the HTML span is hidden by the `has-sprite` rule.
- [ ] **Decor film-strip swaps only (RV-14):** open the reader on an item
      with an image — content images stay un-pixelated
      (`image-rendering: pixelated` is scoped to `.room-scene img` only).

## 6. The 50/50 loop (how sprites get made)

- **AI half:** scaffold the sprite via the pixel-plugin Aseprite MCP in a
  **top-level Claude Code session** (plugins load at session start;
  executor subagents have neither Bash nor MCP — sprite production is never
  executor work). Load the palette from the table in §2 via `/pixel-palette`.
- **Human half:** the owner hand-finishes in Aseprite.
- **Pre-check:** run the `pixel-art-critic` skill's pre-check with the
  palette swapped to the §2 table. Its 5-swatch house rule does NOT apply
  here; its hard-edge / no-AA / no-partial-alpha rules apply verbatim.
- Then export per §4, swap per §5, verify per the checklist.

## 7. The pixel-craft spec (BINDING — born from the 26.5-09 UAT finding)

**The outlawed failure mode: the flat fill.** the owner's 26.5-08 UAT
verdict — "looks like it is still SVG" — had one root cause: uniform
single-color rectangles. Chunky resolution alone does not make pixel
art; surface texture and deliberate irregularity do. The rule:

> **No region larger than ~30×30 art px may ship as one uniform fill.**
> Every large surface carries quiet, palette-internal texture. This is a
> landing requirement, not a style suggestion — it applies to every new
> or reworked sprite from 26.5-08 forward.

### 7.1 Material grammar (what each surface must carry)

All texture is a SECOND tone from the same palette ramp laid over the
base — never a new color. Density = fraction of pixels flipped
(seeded noise; see 7.4).

| Surface | Base + texture tone | Noise density | Plus |
|---|---|---|---|
| Wood board / cover band | `deep` + `wood` (or inverse) | 0.15–0.25 | short ink grain dashes |
| Furniture wood (desk front) | `deep` + `wood` | 0.04–0.08 | long varied grain (7.2) + rare ink knots |
| Cloth / 手帐 cover | `clay` + `claylt` | 0.10–0.16 | running-stitch dashes in the margin |
| Felt / blotter | `shadow` + `stone` | 0.15–0.20 | — |
| Plaster wall | `paper` + `shadow` | 0.006–0.010 | seam notches on panel lines |
| Paper page field | `card`/`paper` + `shadow` | 0.010–0.016 | "tooth", keep it barely-there |

### 7.2 Grain, dither, edges (the irregularity rules)

- **Grain**: long strokes of VARIED length at staggered rows (seeded
  random length 6–24 px, random gaps) — never evenly-spaced identical
  dashes. Evenly spaced = vector tell.
- **Dither (checkerboard)** lives ONLY at shading boundaries: page-gutter
  valleys, drop shadows under hardware, a surface fading into its base,
  under-sheet shadows. Never as an overall wash (keeps §3's bold-shape
  law intact).
- **Edges**: object sprites (books, albums, frames) end in **stepped
  round corners (r = 3–4) + a 1px `ink` rim** — the OMORI/Golden Idol
  drawn-artifact anchor. Paper gets a jittered deckle edge instead. A
  hairline alone never carries depth — pair it with dither or a second
  tone.
- **Shading ramps** come from the palette's built-in pairs
  (`paper/shadow/card`, `wood/deep`, `clay/claylt`, `ink/soft`,
  `stone`): 1–2 px highlight lip on top faces, shade band at bottoms.

### 7.3 Where art lives (the overwrite trap — load-bearing)

`tests/test_sprite_geometry.py` REGENERATES every sprite
(`python3 tools/gen_room_sprites.py`) before asserting. Therefore:

- **The generator is the source of truth** for generated art. An
  out-of-band PNG edit (Aseprite or otherwise) is silently overwritten
  on the next test run. Finalize passes land as codegen (the 26.5-08
  precedent; helpers below).
- **When the owner hand-finishes a sprite in Aseprite** (the §6 human
  half), the SAME commit must add that filename to a skip-guard in
  `gen_room_sprites.py` (a `FINALIZED_BY_HAND` set the write loop
  respects — add the mechanism with the first hand-finished sprite).
  Without the guard the next regen reverts her work. This is the
  hand-off contract between the two halves of the 50/50 loop.

### 7.4 Determinism law + the helper API

Regeneration must be byte-stable (run twice → identical PNGs). ALL
randomness goes through `random.Random(<fixed literal seed>)`, one
unique seed per call site. Never the module-level `random.*` functions.

Helpers in `gen_room_sprites.py` (26.5-08):

- `noise(g,x,y,w,h,color,density,seed)` — seeded texture tooth over an
  area (skips transparent pixels).
- `checker(g,x,y,w,h,color)` — 50% checkerboard dither band.
- `roundcorner(g,r,rim)` — stepped corner knockout + optional ink rim.
- `grain(g,x0,x1,rows,color,seed,lmin,lmax,gap)` — varied-length wood
  grain strokes across the given rows.

### 7.5 Landing checklist (every sprite, on top of §5's)

- [ ] No uniform fill larger than ~30×30 art px (7.1 texture applied).
- [ ] Dither only at shading boundaries; grain lengths varied.
- [ ] Object sprites: stepped corners + ink rim (or deckle, for paper).
- [ ] Palette-only, no text, hard edges (§2/§3 unchanged).
- [ ] Regenerate TWICE → `git status` clean the second time
      (determinism law).
- [ ] Look at the exported PNG (Read it as an image) before committing —
      "would this pass as a *Golden Idol* / OMORI asset?" is the bar.

## 8. The Pixel Build Script (external reference — 2026-08-06)

Source: the owner's Claude Design project **"App UI style customization"**,
file `Pixel Build Script.dc.html` (project `b336513e-c78f-4323-8021-b165b15c8465`,
readable via the `claude_design` MCP / `DesignSync`). Registered here on her
instruction: *"for any UI/UX related task use this spec for reference."*

It is a build script for `pixel-plugin` covering 11 room sprites + 4 UI chrome
assets. **Verified against this repo on 2026-08-06:** its palette claim ("the
exact values from `tokens.css :root`") checks out — 11 of its 14 hexes match
§2 token-for-token; the other 3 are deliberate additions, marked below.

### 8.1 CONFLICT with §2 — the outline colour (REJECTED 2026-08-06)

The script's headline change was that **`#2c2823` stops being an outline
colour**:

| | §2 (binding) | Build script proposed |
|---|---|---|
| sprite outlines / silhouettes | `#2c2823` (`--ink`) | ~~`#4a3a2c`~~ (warm dark brown, NEW) |
| `#2c2823` (`--ink`) | line work + darkest darks | ~~**text only**, never a sprite outline~~ |

Its rationale: near-black silhouettes make the room read as high-contrast;
a warm brown rim softens it. It also proposed a one-pass colour-replace
(`#2c2823` → `#4a3a2c`) across the **existing** sprite set.

**Measured, not assumed:** `assets/room/bookshelf.png` is 8.9% `#2C2823`
today, so the swap would have been real work and would have changed every
shipped sprite.

**STATUS: ⛔ REJECTED — the owner ruled 2026-08-06: keep `#2c2823`.**
§2 stands unamended and is the single binding authority on the outline
colour. `#4a3a2c` is **not** a sprite outline colour, and no colour-replace
is to be run over the shipped set. This entry is kept, struck through,
so the proposal is not rediscovered and re-litigated.

**⚠ CONSEQUENCE — `assets/aseprite/pixel-build/` was built against the
rejected direction.** `build.py:37` defines `OUT = (0x4A,0x3A,0x2C)` and
uses it at 69 sites, and **all 33 PNGs in `png/` contain `#4a3a2c`**
(measured 2026-08-06; `divider.png` and `icons.png` are 100% it). Those
assets do not conform to §2 and must be re-outlined before use.
**A blind `#4a3a2c → #2c2823` replace is NOT the fix:** in 18 of the 33,
`#4a3a2c` is the only dark and a replace is correct, but in the other 15
(`decor-window-night` 8.7%/55.5%, `decor-window-dusk`, `bookshelf-fill-1..3`,
`_zoom-windows`, `bookshelf`, `_contact-sheet`, `_zoom-ii`, `desk-station`)
`OUT` and `INK` carry **two distinct tones**, and merging them flattens the
shading. Re-outlining is per-sprite work, not one `sed`.

### 8.2 The added hexes — thirty-one approved, one rejected

Not in `tokens.css`; sprite-only, no chrome use. The approved set is therefore
**42** (11 from §2 + 2 additions of 2026-08-06 + 8 of 2026-08-25 (Ruling 1)
+ 21 of 2026-08-25 (the night-shade ruling — see the end of this section)):

| Hex | Purpose |
|-----|---------|
| `#a8804f` | wood dark — under-shelf / under-slab shadow (below `--wood-deep`) |
| `#3c6234` | green dark — the shaded side of foliage and hills |
| ~~`#4a3a2c`~~ | ⛔ **REJECTED 2026-08-06** — was the proposed outline (see 8.1). NOT an approved sprite colour. Outlines are `#2c2823` per §2. |

**✅ APPROVED 2026-08-25 (Ruling 1, the owner) — the desk scene's eight.**

The desk zoom rework's design (`docs/DESK-REDESIGN-HANDOFF.md` §5) proposed
eight new hexes for the ten new sprites. She was shown the blue as the mug in
the furnished scene render, and told plainly that `#5f7d8c` is **the first cool
colour** in a palette that is warm all the way through — that it changes the
room's temperature, not only its count. She took it, 2026-08-25 (Ruling 1,
override). This does **not** reopen R-5 ("Keep the current colours",
2026-08-24), which declined the whole-room repaint and remains in force — these
eight are additive, for the desk scene and the new sprites only. Two earlier
proposals in the same set were duplicates of already-approved hexes and were
replaced with `#3c6234` and `#a8804f` verbatim before the ruling; near-misses
of an approved hex are not reintroduced.

| Hex | Purpose |
|-----|---------|
| `#6f9c5a` | lit leaf — the lit side of foliage (approved 2026-08-25, the owner) |
| `#94a487` | dusty sage — silvery, dusty planting (approved 2026-08-25, the owner) |
| `#5f7d8c` | glazed ceramic blue — ⭐ **THE FIRST COOL COLOUR IN THE ROOM** (approved 2026-08-25, the owner) |
| `#8aa3ae` | ceramic blue, lit side (approved 2026-08-25, the owner) |
| `#4c6675` | ceramic blue, dark side (approved 2026-08-25, the owner) |
| `#b08a3e` | brass — lamp fittings (approved 2026-08-25, the owner) |
| `#c9a75c` | brass, lit (approved 2026-08-25, the owner) |
| `#cfe0e2` | glass and water (approved 2026-08-25, the owner) |

**✅ APPROVED 2026-08-25 (26.999, the owner) — the dusty rose, and a palette-SCOPE ruling with it.**

The desk-surface pair ("The Desk Surfaces" design canvas: the sticky note and
the card-box divider tabs) proposed ONE new hex, flagged to her on the canvas
itself as a new colour needing her yes. Her answer, verbatim:

> *"I don't really care about adding new colors from the new items, i think
> the design system is for the UI"*

| Hex | Purpose |
|-----|---------|
| `#d49e9e` | dusty rose — sticky notes and card-box divider tabs (approved 2026-08-25, the owner) |

⚠ **THE SECOND HALF OF HER SENTENCE IS A SCOPE RULING, recorded here so the
next per-hex sitting is not convened by habit:** new ITEM sprites may carry
new colours without a one-by-one hex ruling — the token discipline ("the
design system") binds the UI chrome, not the things in the room. ⛔ What does
NOT move: sprite colours still never reach `tokens.css` or chrome (the 26.98
byte-pin on tokens.css stands), every hex an item ships is still RECORDED in
this section and in the test charter when it lands (the anti-drift pins are
bookkeeping, not permission-seeking), and rulings already taken (the coral
confinement, `--never`'s zero-count, the green's carriers, the rejected
outline) are untouched.

**⛔ DECLINED, not now (2026-08-25) — the desk redesign's four wood tones.**

| Hex | Proposed as | Outcome |
|-----|-------------|---------|
| `#d9bb89` | desk-front wood ramp, step 1 (design's five-step ramp) | ⛔ declined 2026-08-25, not now |
| `#d5b681` | desk-front wood ramp, step 2 | ⛔ declined 2026-08-25, not now |
| `#ba9a68` | desk-front wood ramp, step 3 | ⛔ declined 2026-08-25, not now |
| `#a98e62` | desk-front wood ramp, step 4 | ⛔ declined 2026-08-25, not now |

The desk zoom rework's design (`docs/DESK-REDESIGN-HANDOFF.md`) drew the desk
front's wood with a five-step ramp; four of its steps are hexes she had never
ruled on. Phase 26.9995 plan 02 put them to the owner from a real side-by-side
render — the shipped desk (Plan 01's approved-palette ramp) beside the design's
ramp, same drawing, same grain, same knots, differing in nothing but the four
tones, shown at real size and at 3x (`26.9995-02-wood-ramp-two-ways.png`, kept
in the planning tracker's phase folder). She answered by an AskUserQuestion
selection made with that render open on her screen. Her words, verbatim,
**2026-08-25** (the selection label she chose):

> **"Keep the room's own colours"**

The four tones are **declined for now, not forever** — the same "not now, not
never" standing §9.2 gives the two 10-step ramps. Nothing here forecloses
revisiting them from a new render. The desk front therefore ships exactly as
Plan 01 drew it — `--btn-bg` / `--wood-deep` / `#a8804f` / `--ink-soft` — which
is precisely the furniture-wood register §7.1 prescribes (`deep` + `wood` base,
long varied grain, rare ink knots). No generator, palette constant or test
moved on this ruling: `CHARTER_RGB` stays 12, `ALLOWED_RGB` stays 15. (The
design's fifth proposed shade, `#fdfaf3`, was never on the ballot — it is a
near-miss of the approved `#fbf7ee` and stays snapped to `--card` under the
handoff's own §5 duplicate rule.)

**✅ APPROVED 2026-08-25 (the night-shade ruling, the owner) — the desk
evening's twenty-one.**

Her R-7 ruling (2026-08-25, `tools/ROOM-HANDOFF.md`) gave the desk zoom an
evening, and the evening's plate was held at a designed STOP (T-26.9995-37):
the night pass over the shipped day plate produces 21 colours, **all 21
outside the then-approved set** — not one day hex survives the dim. Per the
gate, a new hex is HERS, never an allow-list entry an agent adds. She was
shown `26.9995-07-night-shades.png` (planning tracker's phase folder — the
shipped day plate beside the scratch night plate, at real size) and told the
number plainly. She answered by an AskUserQuestion selection made with that
render open on her screen. Her words, verbatim, **2026-08-25** (the selection
label she chose): **"Yes — ship the evening"**.

The pass that makes them (baked in `gen_desk_station_night()`, codegen — no
runtime lighting, per `docs/DESK-REDESIGN-HANDOFF.md` §6): one flat ink dim
at 0.46, two warm zones lifted around the flame with the **checkerboard
edge** at radii 34/66, wall light clipped at the desk line y=120, the stepped
lit strip on the desk's front edge, flame at the shipped candle slot x=300,
snapped output (12-step channels), no ramp-quantise. Because 44 is not a
multiple of 12, the day ink `#2c2823` cannot survive the snap — the night
plate's outline is `#302424`, the ink register through the dim (the gate's
`NIGHT_REGISTER_OUTLINES` carries that mapping). These 21 appear in
`desk-station-night.png` ONLY; sprite art, never chrome, never `tokens.css`.
Gate consequence (landed red-first, same commit): `CHARTER_RGB` 20 → 41,
`ALLOWED_RGB` 23 → 44, `ROOM_PNG_COUNT` 47 → 48, `OUTLINED_SPRITE_COUNT`
46 → 47.

| Hex | px (768×432) | Hex | px | Hex | px |
|-----|-----|-----|-----|-----|-----|
| `#909090` | 123540 | `#9c9084` | 2080 | `#b4b4a8` | 240 |
| `#846c48` | 44992 | `#a8a890` | 1316 | `#c0a89c` | 224 |
| `#907860` | 41824 | `#78786c` | 1280 | `#c0c0b4` | 192 |
| `#9c9c90` | 36048 | `#a89c84` | 1028 | `#9c9078` | 48 |
| `#6c543c` | 21152 | `#9c9090` | 764 | `#a89c90` | 36 |
| `#483c30` | 19024 | `#b4a89c` | 716 | | |
| `#908478` | 15244 | `#ccc0b4` | 608 | | |
| `#302424` | 11520 | | | | |

(`#302424` is the night register's own ink — "night-ink" in the gate.)

### 8.3 UI chrome rules (NEW material — no conflict with §1–§7)

This is the half that governs *chrome* work, which §1–§7 never covered.
It is the direct answer to the F-6 finding ("the controls are bad and
hard to notice"):

- **Draw these, CSS can't:** icons · cursors · corner ornaments and
  dividers · textured 9-slice frame edges. All four are *pictures*.
- **Keep these in CSS, don't draw:** buttons · panels · inputs ·
  scrollbars · badges · toolbars · **anything containing text**. A sprite
  button can't grow with its label, can't be selected, can't be read by a
  screen reader, and needs re-exporting when copy changes.
  → This independently vindicates the F-6 v2 fix, which reused the shipped
  `.btn` CSS idiom rather than spriting the notebook controls.
- **No outlines on anything ≤16px.** A 1px rim around a 16px icon eats a
  quarter of its area. UI icons are **solid silhouettes in one colour** —
  legibility comes from shape, not edge. This is the *opposite* of the
  furniture rule (§3) and the two must not be confused.
  - **The one exception:** cursors, which sit on unknown backgrounds and
    must survive light and dark, so they keep a 1px rim.
- **Typography stays as it is.** Never draw letterforms — `Pixelify Sans`
  is a real webfont (§ `tokens.css`), so chrome text stays selectable,
  searchable and translatable, and the bilingual titles fall back to Noto.
  Hand-drawn pixel type would cover ~100 of the several thousand glyphs
  needed. (Agrees with §3's "no text glyphs in any sprite", D-03.)
- Recolour icons at **runtime** (CSS `filter` / masked background), so one
  sheet serves idle, hover, disabled and the librarian's coral.

### 8.4 Its six art rules vs §3/§7

Mostly a restatement of §3 — with one real disagreement:

- Rule 6 says **"no dithering on anything under 40px, flat fills only."**
  §3 + §7.2 say the opposite: *"dithering sparingly — but never zero,"*
  because a large uniform fill reads as vector art. §7 is BINDING and was
  born from a UAT finding (26.5-09), so **§7 wins**; treat rule 6 as
  applying only to the ≤16px UI icons of 8.3, where it agrees with the
  no-outline rule.
- Rules 1–5 (flat side elevation · light from upper-left · 1px outline on
  the outer silhouette only · palette-only · flat opaque bottom row) are
  compatible with §3/§7 and worth re-pasting into any drawing session that
  starts to drift.

## 9. The consolidated handoff (external reference — 2026-08-07)

Source: the same Claude Design project as §8, file **`Study Room Handoff.dc.html`**
(v1, 7 Aug 2026). Imported in full to **[`tools/ROOM-HANDOFF.md`](ROOM-HANDOFF.md)**
— read it there; only the parts that touch this file are recorded here.

It **supersedes the Pixel Build Script of §8** (and Build Script II, the Game
Boy Style Guide, and the three motion docs) *within the design project*. It
does **not** override §2/§3/§7 here, which are repo-binding and carry owner
rulings. Two of its headline changes collide with those rulings and are held:

### 9.1 ⛔ REJECTED — "no outlines at all" (ruled 2026-08-07)

§8.1 recorded a proposal to swap the outline colour `#2c2823` → `#4a3a2c`, and
The owner **ruled on 2026-08-06 to keep `#2c2823`**. The handoff does not revive
`#4a3a2c` — it retracts it too. But its final was **"no outlines at all"**:
forms separate by value, with one pixel of the darkest ramp step only where a
silhouette would otherwise be lost.

That was a third position her ruling never considered, so it was put to her
directly rather than read into the 08-06 answer.

**STATUS: ⛔ REJECTED — the owner ruled 2026-08-07: `#2c2823` stays, ruling
unchanged.** §2 remains binding and unamended, and is the single authority on
outlines. **Do not remove outlines from any sprite.** The handoff's S8 prompt
contains the clause *"Then: REMOVE all outlines…"* — it is struck, and
`ROOM-HANDOFF.md` §05 carries that strike where a drawing session would find
it. Kept here, like §8.1, so it is not rediscovered and re-litigated.

### 9.2 ✅ RULED — the two 10-step ramps are DECLINED, not now (2026-08-24)

The handoff replaces the whole colour system with **one 10-step warm room ramp
plus a parallel cool ramp used only inside the window**, and the rule that no
sprite may carry a colour of its own. Neither ramp shares a hex with
`tokens.css` or with §2's 13 (see `ROOM-HANDOFF.md` §03 for both).

This is a total repaint, not an addition.

**STATUS: ✅ RULED — the owner, 2026-08-24, from the real render she asked for
on 2026-08-07. Her words:**

> **"Keep the current colours."**

**§2's approved set stays binding. The whole-room repaint onto the two ramps
does not happen.** She ruled from a side-by-side of the same room lit by the
same pass twice — one arm in the colours the room has, one in the ramps —
built in `26.98-03` and kept at `assets/aseprite/handoff/lit/_ruling-sheet.png`
with the control arm beside it in `lit-control/`.

**⛔ READ THE NEXT FOUR LINES BEFORE CITING THIS RULING FOR ANYTHING.**

1. **It declines the whole-room repaint onto the handoff's two 10-step ramps,
   and nothing else.** It is not a ruling about any individual colour, about
   the desk zoom rework, or about any new sprite.
2. **It is "not now", not "never".** The ramps are declined for this phase.
   Nothing here forecloses revisiting them.
3. **⚠ IT WAS MADE ON A CONFOUNDED COMPARISON, AND THIS RECORD SAYS SO ON
   PURPOSE.** The two arms differed in **drawn detail** as well as in colour:
   the shipped arm carries wall and floor line work, the green feature wall
   and a plant that the ramp arm has none of, and the ramp arm was drawn at
   roughly four times the grain. She was told this plainly, in those words,
   before she ruled. **A later reader must not mistake this for a clean
   colour-only verdict.** If the question is ever reopened, the confound is
   the first thing to remove.
4. **⛔ HER PERMISSION TO PROPOSE COLOURS OUTSIDE THIS PALETTE STANDS AND IS
   NOT OVERRIDDEN.** On the SAME DAY, 2026-08-24, she told the design
   workstream that it is okay to have more colour outside the current palette,
   and asked for more of it — *"a lot of items are using the same color
   especially green"* and *"the desk looks too flat"*. That is a **separate,
   still-open question** and it lives in `docs/DESK-REDESIGN-HANDOFF.md` §5.
   In particular the proposed **glazed ceramic blue is a new hue — the first
   cool colour in a warm-throughout palette — and it is NOT ruled here.** It is
   being put to her separately. Reading this row as "the palette question is
   closed" cancels a permission she granted the same morning.

Her related answer, **D-1 = (b): coral stays literal**, holds either way — it
is a renderer requirement (a draw-after-light stage with a small, explicitly
named exempt set), not a palette one. `--accent #e8503a` is not being retired.

### 9.3 ✅ It settles §8.4's one real disagreement — in §7's favour

§8.4 recorded the Pixel Build Script's rule 6 ("no dithering under 40px, flat
fills only") losing to §7. The handoff **retracts rule 6 outright** and makes
dithering *required* on every flat region over 30×30 — ordered Bayer, aligned
to 8×8 — naming `SPRITES.md` §7 as having been "right as written". §7 stands,
now with the external doc agreeing rather than conflicting.

### 9.4 ✅ Compatible, adoptable without a ruling

- **Light at 38° from vertical, upper left, every sprite** — pins §3's
  "light from upper-left" to an angle.
- **The 8×8 tile grid is dropped** — it was never enforced here anyway.
- **UI is exempt from the dither pass**, and **cursors keep their 1px rim** as
  the one no-outline exception — both agree with §8.3 exactly.
- **Contact shadow drawn into the sprite, never blurred** — compatible with §7.
- **Three conifers in the window**, as shipped. No action.
- **The landing procedure is §7.3's**, restated: `gen_room_sprites.py` is the
  source of truth or the filename goes in `FINALIZED_BY_HAND` first.
