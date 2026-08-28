# assets/aseprite/ — editable sprite sources (committed, grouped)

Every shipped PNG in `assets/room/` has an editable `.aseprite` twin
here, grouped by role (regenerated 2026-07-23 from the live 26.5-08b
art — the earlier flat set carried stale pre-26.5 geometry and was
replaced; git history keeps it).

## The catalog

| Group | Sources | Canvas (art px, pre-2x where noted) |
|---|---|---|
| `background/` | `bg` | 384×216 scene |
| `stations/` | `desk-station`, `album-page`, `spread-frame-book`, `spread-frame-album`, `spread-frame-paper` | 768×432 (authored 384×216 half-res → 2x) |
| `furniture/` | `bookshelf` 72×112 · `desk` 120×56 · `chair` · `bench` 88×16 | scene-pixel sizes per `tools/SPRITES.md` §1 |
| `items/` | `album` 40×28 · `journal` 30×14 · `reflection-book-0..5` | interactive objects on surfaces |
| `decor/` | `decor-candle`(+`-anim` film strip) · `decor-plant`(+`-b`) · `decor-rug`(+`-b`) · `decor-window`(+`-dusk`,`-night`, 88×88) · `decor-art`(+`-b`) · `decor-books` | non-data scenery + variants |

## The two sources of truth (read before editing — this is the trap)

1. **Today, the generator is canonical**: `tools/gen_room_sprites.py`
   draws every one of these sprites, and `tests/test_sprite_geometry.py`
   REGENERATES them all before asserting. These `.aseprite` files are
   **editable snapshots** of the current generated art — a convenience
   for opening, studying, and hand-finishing.
2. **The moment you hand-finish a sprite in Aseprite** (the 50/50 loop's
   human half): export it per `tools/SPRITES.md` §4 AND, in the SAME
   commit, add its filename to the generator's hand-finish skip-guard
   (`tools/SPRITES.md` §7.3). Without the guard, the next test run
   silently regenerates over your work.

## Conventions (unchanged)

- **Canvas = the object's scene-pixel size** — never author larger and
  downscale. Station/spread art is authored at 384×216 half-res; the
  generator upscales 2x so every art pixel is a 2×2 block.
- **Palette = the tokens.css hexes only** (`tools/SPRITES.md` §2). Load
  via the pixel-plugin `/pixel-palette` flow.
- **Pixel craft rules** = `tools/SPRITES.md` §7 (binding): no flat
  fills, material texture grammar, dither only at shading boundaries,
  stepped corners + ink rim on object sprites, seeded determinism.
- **Export** per §4: File → Export As → `assets/room/<object>.png` at
  100%. Decor animations keep frames in the one source file; the export
  is a horizontal film strip.

Sources are produced through the 50/50 loop (AI scaffold via codegen or
the Aseprite MCP in a top-level session; the owner hand-finishes) — see
`tools/SPRITES.md` §6–§7.
