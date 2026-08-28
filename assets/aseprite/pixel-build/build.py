#!/usr/bin/env python3
"""Study Room pixel build — implements 'Pixel Build Script.dc.html'.

⛔ NON-CONFORMING AS OF 2026-08-06 — DO NOT SHIP THESE PNGs AS-IS.
   the owner ruled against the build script's outline change: the sprite
   outline colour is `#2c2823` (`--ink`), per SPRITES.md §2, which stands
   binding and unamended. `OUT = #4a3a2c` below is the REJECTED colour and
   it is in all 33 PNGs in png/ (divider.png and icons.png are 100% it).
   See SPRITES.md §8.1 for the ruling and §8.2 for the corrected palette.
   ⚠ A blanket #4a3a2c → #2c2823 replace is NOT the fix: in 15 of the 33,
   OUT and INK carry two distinct tones and merging them flattens the
   shading. Re-outlining is per-sprite work. Awaiting owner direction.

Zero-dep (stdlib only). Deterministic: no randomness at all, so re-running
produces byte-identical PNGs (SPRITES.md 7.4 determinism law).

The six art rules held constant across every sprite here:
  1. flat side elevation, no perspective, no visible top surfaces
  2. light from the upper LEFT
  3. 1px outline, outer silhouette only; colour breaks inside
     (⛔ written as #4a3a2c — REJECTED; §2 says #2c2823)
  4. only the study-room.gpl colours (⛔ 14 here; the ruling makes it 13)
  5. flat opaque bottom row so the object sits on a floor
  6. no dithering; flat fills at this size

UI assets carry the one extra rule: no outline at 16px or under
(cursors excepted — they sit on unknown backgrounds).
"""

import math
import os
import struct
import zlib

# ── the 14 colours (study-room.gpl) ────────────────────────────────────
PAPER  = (0xEE, 0xEA, 0xE1)
SHADOW = (0xDC, 0xD5, 0xC8)
CARD   = (0xFB, 0xF7, 0xEE)
WOODL  = (0xE0, 0xC7, 0x9A)
WOOD   = (0xCD, 0xA8, 0x6E)
WOODD  = (0xA8, 0x80, 0x4F)
STONE  = (0xB7, 0xB2, 0xA8)
GREEN  = (0x4F, 0x7B, 0x43)
GREEND = (0x3C, 0x62, 0x34)
CLAY   = (0xB5, 0x62, 0x3A)
ACCENT = (0xE8, 0x50, 0x3A)
SOFT   = (0x55, 0x50, 0x47)
OUT    = (0x4A, 0x3A, 0x2C)
INK    = (0x2C, 0x28, 0x23)

PALETTE = [PAPER, SHADOW, CARD, WOODL, WOOD, WOODD, STONE,
           GREEN, GREEND, CLAY, ACCENT, SOFT, OUT, INK]

ROOT = os.path.dirname(os.path.abspath(__file__))
PNGDIR = os.path.join(ROOT, "png")


# ── canvas ─────────────────────────────────────────────────────────────
class Img:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[None] * w for _ in range(h)]

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return None

    def rect(self, x, y, w, h, c):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.put(i, j, c)

    def hline(self, x0, x1, y, c):
        for x in range(x0, x1 + 1):
            self.put(x, y, c)

    def vline(self, x, y0, y1, c):
        for y in range(y0, y1 + 1):
            self.put(x, y, c)

    def disc(self, cx, cy, r, c):
        for y in range(cy - r, cy + r + 1):
            for x in range(cx - r, cx + r + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.put(x, y, c)

    def blit(self, other, ox, oy):
        for j in range(other.h):
            for i in range(other.w):
                c = other.px[j][i]
                if c is not None:
                    self.put(ox + i, oy + j, c)

    def outline_inside(self, col=OUT):
        """Rule 3: recolour the outermost ring of opaque pixels."""
        edge = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x] is None:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.get(x + dx, y + dy) is None:
                        edge.append((x, y))
                        break
        for x, y in edge:
            self.px[y][x] = col

    def outline_outside(self, col=OUT):
        """Grow a 1px ring outward (cursors: keeps the fill area intact)."""
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x] is not None:
                    continue
                hit = False
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if (dx or dy) and self.get(x + dx, y + dy) is not None:
                            hit = True
                if hit:
                    add.append((x, y))
        for x, y in add:
            self.px[y][x] = col

    def palette_check(self, name):
        bad = set()
        for row in self.px:
            for c in row:
                if c is not None and c not in PALETTE:
                    bad.add(c)
        if bad:
            raise SystemExit("%s: off-palette %s" % (name, bad))


def write_png(img, path):
    raw = bytearray()
    for y in range(img.h):
        raw.append(0)
        for x in range(img.w):
            c = img.px[y][x]
            if c is None:
                raw += b"\0\0\0\0"
            else:
                raw += bytes(c) + b"\xff"

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", img.w, img.h, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)


def save(img, name):
    img.palette_check(name)
    write_png(img, os.path.join(PNGDIR, name))
    return img


# ── Script II helpers: rung 3 (material) and the dither fades ──────────
def rng(seed):
    """Fixed-seed LCG — §7.4 determinism law, one seed per call site."""
    s = seed & 0x7FFFFFFF

    def nxt(n):
        nonlocal s
        s = (s * 1103515245 + 12345) & 0x7FFFFFFF
        return s % n
    return nxt


BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def dither_fade(g, x0, x1, y0, y1, top_col, bot_col):
    """Ordered fade from top_col into bot_col across the band."""
    rows = y1 - y0 + 1
    for y in range(y0, y1 + 1):
        t = (y - y0 + 1) / (rows + 1.0)
        for x in range(x0, x1 + 1):
            g.put(x, y, bot_col if BAYER[y % 4][x % 4] / 16.0 < t else top_col)


def grain_h(g, x0, x1, y0, y1, col, seed, gap=(2, 6), length=(5, 18)):
    """Rung 3 on wood seen end-on: varied-length horizontal streaks."""
    r = rng(seed)
    y = y0
    while y <= y1:
        x = x0 + r(6)
        while x < x1:
            ln = length[0] + r(length[1] - length[0])
            for i in range(min(ln, x1 - x)):
                if g.get(x + i, y) is not None:
                    g.put(x + i, y, col)
            x += ln + 3 + r(10)
        y += gap[0] + r(gap[1] - gap[0])


def grain_v(g, x0, x1, y0, y1, col, seed, gap=(3, 6), length=(4, 12)):
    """Rung 3 on wood seen along the grain: vertical streaks."""
    r = rng(seed)
    for x in range(x0, x1 + 1):
        if r(10) < 4:
            continue
        y = y0 + r(5)
        while y <= y1:
            ln = length[0] + r(length[1] - length[0])
            for j in range(min(ln, y1 - y + 1)):
                if g.get(x, y + j) is not None:
                    g.put(x, y + j, col)
            y += ln + gap[0] + r(gap[1] - gap[0])


# ── 01 · bookshelf 72x112 ──────────────────────────────────────────────
# Frame + shelves in WOOD, WOODL on the top-left edge of each board,
# WOODD underneath. Three shelves; one left partly empty; one book leans.
SPINE_SHADE = {
    SOFT:  (STONE,  INK),
    STONE: (SHADOW, SOFT),
    CARD:  (CARD,   STONE),
    CLAY:  (WOOD,   OUT),
}


def upright_book(img, x, w, bottom, h, base):
    lit, dark = SPINE_SHADE[base]
    top = bottom - h + 1
    img.rect(x, top, w, h, base)
    img.vline(x, top, bottom, lit)              # light from upper-left
    img.vline(x + w - 1, top, bottom, dark)     # shadow lower-right


def bookshelf():
    g = Img(72, 112)
    g.rect(0, 0, 72, 112, WOOD)
    # side panels
    g.vline(1, 0, 111, WOODL)
    g.vline(5, 0, 111, WOODD)
    g.rect(66, 0, 2, 112, WOOD)
    g.rect(68, 0, 3, 112, WOODD)
    # top board / plinth
    g.hline(0, 71, 1, WOODL)
    g.rect(0, 2, 72, 3, WOOD)
    g.hline(0, 71, 5, WOODD)
    g.hline(0, 71, 104, WOODL)
    g.rect(0, 105, 72, 5, WOOD)
    g.hline(0, 71, 110, WOODD)
    # open interior
    g.rect(6, 6, 60, 98, SHADOW)
    # two internal shelf boards -> three compartments
    for by in (36, 70):
        g.hline(6, 65, by, WOODL)
        g.rect(6, by + 1, 60, 2, WOOD)
        g.hline(6, 65, by + 3, WOODD)

    # shelf 1 (full)
    for x, w, h, c in ((7, 9, 27, SOFT), (16, 7, 23, STONE), (23, 10, 28, CARD),
                       (33, 7, 24, CLAY), (40, 10, 26, SOFT), (50, 8, 22, STONE)):
        upright_book(g, x, w, 35, h, c)
    g.hline(8, 14, 13, WOODL)      # gilt bands
    g.hline(41, 48, 15, WOODL)

    # shelf 2 (partly empty, one book leaning)
    for x, w, h, c in ((7, 8, 24, CLAY), (15, 7, 27, SOFT),
                       (22, 9, 22, CARD), (31, 7, 25, STONE)):
        upright_book(g, x, w, 69, h, c)
    g.hline(16, 20, 47, WOODL)
    for y in range(48, 70):                     # the leaner
        x0 = 45 - (69 - y) // 3
        for i in range(6):
            g.put(x0 + i, y, STONE if i == 0 else INK if i == 5 else SOFT)

    # shelf 3 (bottom, heavier books)
    for x, w, h, c in ((7, 10, 28, SOFT), (17, 8, 25, CLAY), (25, 11, 29, STONE),
                       (36, 9, 26, CARD), (45, 8, 27, SOFT), (53, 8, 24, CARD)):
        upright_book(g, x, w, 103, h, c)
    g.hline(8, 15, 81, WOODL)
    g.rect(19, 88, 4, 4, ACCENT)                # the one art-pop accent

    # rung 3 — vertical grain down both side panels
    grain_v(g, 2, 4, 7, 103, WOODD, 0x8001, gap=(4, 10), length=(5, 14))
    grain_v(g, 67, 69, 7, 103, WOOD, 0x8002, gap=(4, 10), length=(5, 14))
    g.outline_inside()
    return save(g, "bookshelf.png")


# ── Script II §03 · the bookshelf that fills up ────────────────────────
# One empty case + three transparent overlays swapped by item count.
# Geometry is shared so an overlay lands exactly on the case.
SHELF_FLOORS = (36, 71, 107)        # top, middle, bottom
SHELF_TOPS = (6, 41, 76)
INNER = (6, 65)

SPINE_SHADE.update({WOODD: (WOOD, OUT), GREEND: (GREEN, OUT)})
SIX = (SOFT, CLAY, STONE, CARD, GREEND, WOODD)


def bookshelf_empty():
    g = Img(72, 112)
    g.rect(0, 0, 72, 112, WOOD)
    g.vline(1, 0, 111, WOODL)                   # side panels
    g.vline(5, 0, 111, WOODD)
    g.rect(66, 0, 2, 112, WOOD)
    g.rect(68, 0, 3, 112, WOODD)
    g.hline(0, 71, 1, WOODL)                    # top board
    g.rect(0, 2, 72, 3, WOOD)
    g.hline(0, 71, 5, WOODD)
    g.hline(0, 71, 108, WOODL)                  # 4px plinth
    g.rect(0, 109, 72, 3, WOOD)
    # back panel — two-tone 4px vertical banding, never a flat fill
    for x in range(INNER[0], INNER[1] + 1):
        g.vline(x, 6, 107, WOOD if ((x - 6) // 4) % 2 == 0 else WOODD)
    # the two internal boards; the middle one bows (rung 4)
    for n, by in enumerate((37, 72)):
        for x in range(INNER[0], INNER[1] + 1):
            sag = 1 if (n == 1 and 20 <= x <= 50) else 0
            g.put(x, by + sag, WOODL)
            g.put(x, by + 1 + sag, WOOD)
            g.put(x, by + 2 + sag, WOOD)
            g.put(x, by + 3 + sag, WOODD)
    grain_v(g, 2, 4, 7, 107, WOODD, 0x9001, gap=(3, 6), length=(4, 11))
    grain_v(g, 67, 69, 7, 107, WOOD, 0x9002, gap=(3, 6), length=(4, 11))
    for x in range(67, 72):                     # rung 4 — chipped top-right
        for y in range(0, 72 - x):
            g.put(x, y, None)
    g.outline_inside()
    return save(g, "bookshelf-empty.png")


def ov_spine(g, x, w, bottom, h, base, forward=False):
    """An overlay spine: its own 1px rim, because it is its own silhouette."""
    lit, dark = SPINE_SHADE[base]
    if forward:
        bottom += 2                             # pulled forward, over the board
    top = bottom - h + 1
    g.rect(x, top, w, h, base)
    if w >= 5:
        g.vline(x + 1, top + 1, bottom, lit)
        g.vline(x + w - 2, top + 1, bottom, dark)
    g.vline(x, top, bottom, OUT)
    g.vline(x + w - 1, top, bottom, OUT)
    g.hline(x, x + w - 1, top, OUT)
    if forward:
        g.hline(x, x + w - 1, bottom, OUT)


def ov_flat(g, x, y, w, h, base):
    """A book lying flat / a horizontal stack layer."""
    g.rect(x, y, w, h, base)
    g.hline(x + 1, x + w - 2, y + 1, SPINE_SHADE[base][0])
    g.hline(x + 1, x + w - 2, y + h - 2, STONE if base is CARD else CARD)
    g.hline(x, x + w - 1, y, OUT)
    g.hline(x, x + w - 1, y + h - 1, OUT)
    g.vline(x, y, y + h - 1, OUT)
    g.vline(x + w - 1, y, y + h - 1, OUT)


def ov_leaner(g, x_base, bottom, h, base):
    lit, dark = SPINE_SHADE[base]
    top = bottom - h + 1
    for y in range(top, bottom + 1):
        x0 = x_base - (bottom - y) // 3
        for i in range(6):
            c = OUT if i in (0, 5) else lit if i == 1 else dark if i == 4 else base
            g.put(x0 + i, y, c)
    x0 = x_base - (bottom - top) // 3
    g.hline(x0, x0 + 5, top, OUT)


def bookshelf_fill_1():
    g = Img(72, 112)
    f = SHELF_FLOORS[2]                          # bottom shelf only
    for x, w, h, c in ((7, 6, 23, SOFT), (13, 5, 20, CLAY),
                       (18, 7, 24, CARD), (25, 6, 21, SOFT)):
        ov_spine(g, x, w, f, h, c)
    ov_flat(g, 32, f - 7, 16, 8, CLAY)           # one laid flat beside them
    return save(g, "bookshelf-fill-1.png")


def bookshelf_fill_2():
    g = Img(72, 112)
    bot, mid = SHELF_FLOORS[2], SHELF_FLOORS[1]
    for x, w, h, c in ((7, 6, 23, SOFT), (13, 5, 20, STONE), (18, 7, 24, CARD),
                       (25, 6, 22, CLAY), (31, 5, 19, GREEND), (36, 6, 23, SOFT),
                       (42, 7, 21, WOODD), (49, 5, 24, CARD), (54, 6, 20, STONE)):
        ov_spine(g, x, w, bot, h, c)
    ov_leaner(g, 60, bot, 22, CLAY)              # leaning into the end gap
    for x, w, h, c in ((7, 6, 22, CLAY), (13, 5, 19, SOFT), (18, 7, 23, CARD),
                       (25, 5, 20, STONE), (30, 6, 21, GREEND)):
        ov_spine(g, x, w, mid, h, c)
    ov_flat(g, 48, mid - 13, 17, 7, WOODD)       # flat stack of two
    ov_flat(g, 50, mid - 6, 15, 7, SOFT)
    return save(g, "bookshelf-fill-2.png")


def bookshelf_fill_3():
    g = Img(72, 112)
    top, mid, bot = SHELF_FLOORS
    for x, w, h, c in ((7, 6, 24, SOFT), (13, 5, 21, CLAY), (18, 7, 25, STONE),
                       (32, 6, 23, CARD), (38, 5, 20, GREEND), (43, 7, 24, WOODD)):
        ov_spine(g, x, w, top, h, c)             # x25..31 left as the gap
    ov_flat(g, 52, top - 13, 14, 7, CLAY)
    ov_flat(g, 53, top - 6, 13, 7, STONE)

    for x, w, h, c in ((7, 6, 23, STONE), (13, 5, 20, CARD), (18, 7, 25, GREEND),
                       (25, 6, 22, SOFT), (31, 5, 19, CLAY), (36, 7, 24, WOODD)):
        ov_spine(g, x, w, mid, h, c)
    ov_leaner(g, 43, mid, 22, CARD)
    ov_flat(g, 52, mid - 13, 14, 7, SOFT)
    ov_flat(g, 51, mid - 6, 15, 7, WOODD)

    for x, w, h, c in ((7, 6, 25, CLAY), (13, 5, 22, SOFT), (18, 7, 26, CARD),
                       (31, 5, 20, WOODD), (36, 6, 24, STONE)):
        ov_spine(g, x, w, bot, h, c)
    ov_spine(g, 25, 6, bot, 23, GREEND, forward=True)   # pulled forward
    ov_leaner(g, 43, bot, 23, CLAY)
    ov_flat(g, 52, bot - 20, 14, 7, GREEND)
    ov_flat(g, 51, bot - 13, 15, 7, CARD)
    ov_flat(g, 52, bot - 6, 14, 7, SOFT)
    return save(g, "bookshelf-fill-3.png")


# ── 02 · desk 120x56 ───────────────────────────────────────────────────
def desk():
    g = Img(120, 56)
    g.rect(0, 0, 120, 7, WOODL)                 # thin top slab
    g.hline(0, 119, 7, WOODD)                   # edge beneath
    # single leg on the left
    g.rect(4, 8, 9, 48, WOOD)
    g.rect(5, 8, 2, 48, WOODL)
    g.vline(11, 8, 55, WOODD)
    # two-drawer bank on the right third
    g.rect(80, 8, 40, 48, WOOD)
    g.vline(81, 8, 55, WOODL)
    for dy in (13, 34):
        g.rect(84, dy, 32, 17, WOOD)
        g.hline(84, 115, dy, WOODL)
        g.hline(84, 115, dy + 16, WOODD)
        g.rect(94, dy + 7, 12, 3, STONE)        # pull handle
    g.rect(84, 31, 32, 2, WOODD)                # gap between drawers
    # rung 3 — wood grain, horizontal along the slab, vertical down the leg
    grain_h(g, 2, 117, 1, 5, WOOD, 0x51AB, gap=(2, 4), length=(9, 26))
    grain_h(g, 86, 113, 15, 28, WOODD, 0x51AC, gap=(3, 6), length=(6, 18))
    grain_h(g, 86, 113, 36, 49, WOODD, 0x51AD, gap=(3, 6), length=(6, 18))
    grain_v(g, 6, 10, 10, 53, WOODD, 0x51AE, gap=(4, 9), length=(6, 16))
    # rung 4 — a knot in the leg, and a scuffed lower-drawer corner
    g.rect(7, 30, 3, 3, WOODD)
    g.put(8, 31, OUT)
    g.rect(86, 46, 7, 2, WOODD)
    g.outline_inside()
    return save(g, "desk.png")


# ── 03 · window 88x88, onto woods (+ dusk / night) ─────────────────────
# Script II §02 asked for a treeline; the owner's correction (2026-08-06) is
# the better one — the room is UP, so the window looks DOWN into the
# canopy from a second or third floor. What that means concretely:
# a high horizon, no trunks (you are above them), crowns seen from above
# that get larger as they come nearer, and ground glimpsed in the gaps.
# Dusk and night are RECOLOURS — not one silhouette pixel moves.
# The trunk sits in the left third ON PURPOSE: centred, it would hide
# behind the vertical mullion. Branches then reach right, across it.
BRANCHES = [                             # (x0, y0, x1, y1, w0, w1)
    (28, 58, 8, 34, 5, 2), (29, 48, 72, 30, 5, 2), (27, 68, 62, 72, 4, 2),
    (30, 34, 60, 10, 4, 2), (30, 26, 12, 10, 4, 2),
    (56, 36, 78, 46, 3, 2), (46, 20, 76, 14, 3, 2),
]
FAR_LEAVES = [                           # backdrop mass, behind the branches
    (10, 12, 10, 8, 0.3), (30, 8, 11, 8, 1.2), (50, 12, 10, 7, 2.1),
    (70, 10, 11, 8, 0.7), (80, 24, 9, 8, 1.8), (6, 32, 9, 8, 2.5),
    (26, 28, 8, 7, 0.9), (60, 28, 10, 8, 1.4), (78, 42, 9, 8, 2.2),
    (10, 50, 10, 8, 0.5), (36, 46, 9, 7, 1.6), (58, 50, 10, 8, 2.8),
    (22, 66, 10, 8, 1.1), (48, 68, 11, 9, 0.4), (74, 66, 10, 8, 2.0),
    (34, 80, 10, 7, 1.5), (64, 80, 9, 7, 0.8),
]
NEAR_LEAVES = [                          # in front, hung off the branches
    (12, 9, 8, 6, 1.0), (38, 7, 9, 6, 2.3), (58, 9, 8, 6, 0.6),
    (77, 13, 8, 6, 1.7), (8, 24, 7, 6, 2.9), (48, 21, 8, 6, 1.3),
    (70, 26, 7, 6, 2.6), (12, 40, 8, 6, 0.9), (44, 36, 8, 6, 2.0),
    (66, 40, 8, 6, 0.4), (9, 58, 8, 6, 1.5), (38, 56, 8, 6, 2.7),
    (62, 58, 8, 6, 1.1), (79, 54, 7, 6, 0.3), (20, 76, 8, 6, 2.4),
    (48, 78, 8, 6, 0.8), (72, 76, 8, 6, 1.9),
]
BIRD = ((56, 67), (54, 68), (55, 68), (56, 68), (53, 69))     # rung 4, perched
STARS = ((14, 18), (34, 16), (58, 16), (16, 30),
         (24, 48), (52, 44), (68, 52), (76, 34))


def leafclump(g, cx, cy, rx, ry, phase, col, speck, seed):
    """A mass of leaves — ragged on purpose; a smooth ellipse reads as fruit."""
    r = rng(seed)
    for y in range(cy - ry - 3, cy + ry + 4):
        for x in range(cx - rx - 3, cx + rx + 4):
            th = math.atan2(y - cy, (x - cx) * 0.8 + 0.01)
            lump = (1 + 0.18 * math.sin(3 * th + phase)
                    + 0.11 * math.sin(5 * th + phase * 1.7)
                    + 0.07 * math.sin(7 * th + phase * 0.6))
            if ((x - cx) / (rx * lump)) ** 2 + ((y - cy) / (ry * lump)) ** 2 <= 1.0:
                g.put(x, y, col)
    for _ in range(max(3, rx // 2)):     # rung 3 — leaves clump, never even
        g.put(cx - rx // 2 + r(rx), cy - ry // 2 + r(ry), speck)


def taper_line(g, x0, y0, x1, y1, w0, w1, col):
    n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    for i in range(n + 1):
        t = i / float(n)
        cx, cy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        hw = (w0 + (w1 - w0) * t) / 2.0
        for dy in range(int(-hw) - 1, int(hw) + 2):
            for dx in range(int(-hw) - 1, int(hw) + 2):
                if dx * dx + dy * dy <= hw * hw:
                    g.put(int(round(cx + dx)), int(round(cy + dy)), col)


def window(sky, sky_deep, leaf_near, leaf_far, bark, bark_lit, name):
    """the owner's reference (2026-08-06): a tree right up against the glass —
    trunk and branches crossing the frame, leaf masses filling in, daylight
    coming through the gaps. Not a treeline, not a canopy seen from above."""
    g = Img(88, 88)
    g.rect(5, 5, 78, 78, sky)                        # daylight behind it all
    for y in range(5, 83):                           # quiet depth toward the
        t = 0.04 + 0.20 * (y - 5) / 77.0             # bottom — never a flat fill
        for x in range(5, 83):
            if BAYER[y % 4][x % 4] / 16.0 < t:
                g.put(x, y, sky_deep)
    for n, (cx, cy, rx, ry, ph) in enumerate(FAR_LEAVES):
        leafclump(g, cx, cy, rx, ry, ph, leaf_far, leaf_far, 0xF001 + n * 29)
    for n, (x0, y0, x1, y1, w0, w1) in enumerate(BRANCHES):
        taper_line(g, x0, y0, x1, y1, w0, w1, bark)
    taper_line(g, 26, 84, 32, 3, 11, 6, bark)        # the trunk
    taper_line(g, 21, 84, 29, 3, 3, 2, bark_lit)     # lit down its left face
    for n, (cx, cy, rx, ry, ph) in enumerate(NEAR_LEAVES):
        leafclump(g, cx, cy, rx, ry, ph, leaf_near, leaf_far, 0xE001 + n * 31)
    for bx, by in BIRD:                              # rung 4 — perched, drawn
        g.put(bx, by, bark_lit)                      # last so leaves never eat it
    if name.endswith("night.png"):                   # stars only where sky shows
        for sx, sy in STARS:
            if g.get(sx, sy) in (sky, sky_deep):
                g.put(sx, sy, CARD)
    g.rect(5, 80, 78, 3, WOODD)                      # 3px sill
    # cross mullion, drawn over the glass so the trees run behind it
    g.vline(42, 5, 82, WOODL)
    g.rect(43, 5, 3, 78, WOODD)
    g.hline(5, 82, 42, WOODL)
    g.rect(5, 43, 78, 3, WOODD)
    # 5px frame, highlight on the top and left INNER edges
    g.rect(0, 0, 88, 5, WOODD)
    g.rect(0, 83, 88, 5, WOODD)
    g.rect(0, 0, 5, 88, WOODD)
    g.rect(83, 0, 5, 88, WOODD)
    g.hline(4, 83, 4, WOODL)
    g.vline(4, 4, 83, WOODL)
    g.rect(1, 78, 3, 3, STONE)                       # rung 4: worn frame chip
    g.outline_inside()
    return save(g, name)


def windows():
    return [
        # (sky, sky_deep, leaf_near, leaf_far, bark, bark_lit)
        window(PAPER, SHADOW, GREEN, GREEND, OUT, WOODD, "decor-window.png"),
        window(WOODL, CLAY, GREEND, OUT, INK, WOODD, "decor-window-dusk.png"),
        # Night is a silhouette read: the sky behind stays the LIGHTEST thing
        # in the pane, or the tree has nothing to be a silhouette against.
        window(SOFT, OUT, INK, INK, INK, OUT, "decor-window-night.png"),
    ]


# ── 04 · chair 52x78 ───────────────────────────────────────────────────
def chair():
    g = Img(52, 78)
    for sx in (8, 38):                          # back stiles
        g.rect(sx, 0, 6, 41, WOOD)
        g.vline(sx + 1, 0, 40, WOODL)
        g.vline(sx + 5, 0, 40, WOODD)
    g.rect(8, 0, 36, 6, WOOD)                   # top rail
    g.hline(8, 43, 1, WOODL)
    g.hline(8, 43, 5, WOODD)
    for n, sy in enumerate((11, 23)):            # two horizontal slats
        for x in range(8, 44):                   # rung 4 — the lower one sits crooked
            k = sy + (1 if (n == 1 and x >= 26) else 0)
            g.put(x, k, WOODL)
            g.rect(x, k + 1, 1, 4, WOOD)
            g.put(x, k + 5, WOODD)
    g.rect(4, 41, 44, 8, WOODL)                 # seat
    g.rect(17, 41, 13, 2, WOOD)                 # rung 4 — worn patch, seat front
    grain_h(g, 5, 46, 42, 47, WOOD, 0x3301, gap=(2, 4), length=(6, 16))
    g.hline(4, 47, 48, WOODD)
    for lx in (14, 34):                         # rear legs
        g.rect(lx, 49, 4, 29, WOODD)
    for lx in (6, 41):                          # front legs
        g.rect(lx, 49, 5, 29, WOODD)
    g.rect(10, 66, 32, 4, WOOD)                 # stretcher, front pair
    g.outline_inside()
    return save(g, "chair.png")


# ── 05 · bench 88x16 ───────────────────────────────────────────────────
def bench():
    g = Img(88, 16)
    g.rect(0, 0, 88, 6, WOODL)                  # 6px top plank
    g.rect(0, 6, 88, 2, WOODD)
    for lx in (8, 70):
        g.rect(lx, 8, 10, 8, WOODD)
    grain_h(g, 1, 86, 1, 4, WOOD, 0x4401, gap=(1, 3), length=(10, 30))
    g.rect(34, 2, 3, 3, WOODD)                  # rung 4 — a knot
    g.put(35, 3, OUT)
    g.hline(56, 66, 4, WOODD)                   # rung 4 — a hairline crack
    g.outline_inside()
    return save(g, "bench.png")


# ── 06 · potted plant 26x44 ────────────────────────────────────────────
def leaf(g, x0, y0, dx, dy, length, width, col, rib):
    n = math.hypot(dx, dy)
    dx, dy = dx / n, dy / n
    px, py = -dy, dx
    for t in range(length):
        w = width * math.sin(math.pi * (t + 0.5) / length)
        cx, cy = x0 + dx * t, y0 + dy * t
        for s in range(-int(round(w)), int(round(w)) + 1):
            g.put(int(round(cx + px * s)), int(round(cy + py * s)), col)
    for t in range(length):                     # 1px darker midrib
        g.put(int(round(x0 + dx * t)), int(round(y0 + dy * t)), rib)


def plant():
    g = Img(26, 44)
    leaf(g, 13, 24, -0.75, -0.66, 13, 4.5, GREEND, OUT)     # rear pair
    leaf(g, 13, 24, 0.78, -0.62, 12, 4.5, GREEND, OUT)
    leaf(g, 13, 24, -0.50, -0.87, 16, 5.0, GREEN, GREEND)   # front three
    leaf(g, 13, 23, 0.05, -1.00, 21, 5.5, GREEN, GREEND)
    leaf(g, 13, 24, 0.55, -0.84, 14, 5.0, GREEN, GREEND)
    g.rect(12, 20, 2, 8, GREEND)                            # short stem
    g.rect(2, 26, 22, 4, CLAY)                              # wider rim
    g.rect(3, 26, 2, 4, SHADOW)
    for y in range(30, 44):                                 # tapered body
        inset = (y - 30) * 2 // 7
        g.rect(4 + inset, y, 18 - inset * 2, 1, CLAY)
        g.rect(4 + inset, y, 2, 1, SHADOW)                  # left-face highlight
    g.rect(19, 26, 4, 2, WOODD)                             # rung 4 — chipped rim
    for x, y in ((3, 20), (4, 21), (3, 21), (4, 22)):       # rung 4 — one leaf
        if g.get(x, y) is not None:                         # tip gone brown
            g.put(x, y, WOODD)
    g.outline_inside()
    return save(g, "decor-plant.png")


# ── 07 · photo album 40x28 ─────────────────────────────────────────────
def album():
    g = Img(40, 28)
    g.rect(4, 6, 36, 22, CARD)                  # cream page block, bottom-right
    g.rect(0, 2, 36, 22, CLAY)                  # cover
    g.rect(0, 2, 6, 22, WOOD)                   # spine strip, left edge
    g.rect(14, 9, 14, 8, SHADOW)                # label
    g.hline(4, 39, 24, SHADOW)                  # seats the cover on the block
    g.rect(30, 14, 7, 5, CARD)                  # rung 4 — a photo corner, out
    g.put(36, 14, STONE)
    g.rect(1, 21, 4, 2, WOOD)                   # rung 4 — scuffed lower spine
    g.outline_inside()
    return save(g, "album.png")


# ── 08 · notebook 28x22 (art in the lower-left, padding above) ─────────
def notebook():
    g = Img(28, 22)
    g.rect(18, 5, 4, 17, CARD)                  # page edges on the right
    g.rect(0, 4, 19, 18, CLAY)                  # cover
    g.rect(4, 8, 11, 10, CARD)                  # inset panel
    for i in range(4):                          # rung 4 — a dog-eared corner
        for j in range(4 - i):
            g.put(18 - j, 21 - i, None)
    g.outline_inside()
    g.rect(14, 4, 3, 11, ACCENT)                # ribbon (§01's own rung-4 example)
    return save(g, "notebook.png")


# ── 09 · open journal 30x14 ────────────────────────────────────────────
def journal():
    g = Img(30, 14)
    g.rect(0, 11, 30, 3, WOOD)                  # thin cover edge underneath
    g.rect(1, 1, 28, 10, CARD)                  # two pages
    g.rect(14, 1, 2, 10, SHADOW)                # centre gutter
    for y in (3, 5, 7):                         # three dashes per page
        g.hline(4, 10, y, STONE)
        g.hline(19, 25, y, STONE)
    g.rect(21, 8, 3, 2, CLAY)                   # rung 4 — a pressed-flower mark
    g.vline(15, 9, 12, ACCENT)                  # rung 4 — the ribbon's tail
    g.outline_inside()
    return save(g, "journal.png")


# ── 10 · candle 10x22, two frames ──────────────────────────────────────
# Rebuilt 2026-08-07 from the owner's reference (Magnific "pixel art candle"):
# a bare taper — no dish — whose silhouette is IRREGULAR because the wax has
# melted and run. Two things carry the read at 10px: the burnt rim of INK
# directly under the flame, and a flame with a hot core inside it rather
# than one flat colour.
#
# ★ This sprite honours the 2026-08-06 owner ruling: it outlines in #2c2823
#   (--ink), never the rejected #4a3a2c. It is the first conforming sprite
#   in the set — the other 26 still need their per-sprite re-outline.
# The column is deliberately NARROW — 4px of visible wax inside a 6px
# silhouette. A wide column on a 10px canvas reads as a jar, not a taper.
# The drips are silhouette bumps, which is the only way a drip exists at
# this size; each one widens the lit or shadowed side as it passes.
CANDLE_SIL = [(3, 6), (2, 7), (2, 7), (2, 8), (2, 8), (2, 8),
              (2, 7), (1, 7), (1, 7), (2, 7), (2, 7), (2, 7)]
# The core is ~a quarter of the flame, never half: orange has to stay the
# colour you read first, or the flame turns into a cream blob with a rim.
FLAME_A = {2: (4, 5), 3: (4, 5), 4: (3, 6), 5: (2, 7), 6: (3, 6), 7: (4, 5)}
CORE_A = {4: (4, 4), 5: (4, 5), 6: (4, 5)}
FLAME_B = {0: (5, 5), 1: (5, 6), 2: (5, 6), 3: (4, 6),
           4: (3, 7), 5: (3, 7), 6: (3, 6), 7: (4, 5)}
CORE_B = {3: (5, 5), 4: (5, 6), 5: (5, 6)}


def candle_frame(flame, core):
    g = Img(10, 22)
    for i, (a, b) in enumerate(CANDLE_SIL):     # the melted, dripping column
        for x in range(a, b + 1):               # shade RELATIVE to each row's
            g.put(x, 10 + i,                    # own edges, so a drip widens
                  CARD if x == a + 1 else       # the tan and never the 1px
                  WOOD if x == b - 1 else WOODL)  # highlight
    g.put(5, 14, WOOD)                          # rung 4 — two faint wax seams
    g.put(4, 19, WOOD)
    g.rect(4, 8, 2, 1, INK)                     # the wick
    g.rect(3, 9, 4, 1, INK)                     # the burnt rim it sits in
    g.outline_inside(INK)                       # body only — never the flame
    for y, (a, b) in flame.items():             # teardrop, outer
        g.hline(a, b, y, ACCENT)
    for y, (a, b) in core.items():              # the hot core inside it
        g.hline(a, b, y, WOODL)
    return g


def candle():
    f1 = candle_frame(FLAME_A, CORE_A)
    f2 = candle_frame(FLAME_B, CORE_B)
    save(f1, "decor-candle.png")
    strip = Img(20, 22)
    strip.blit(f1, 0, 0)
    strip.blit(f2, 10, 0)
    save(strip, "decor-candle-anim.png")
    return strip


# ── 11 · book spine sheet 132x40 (six 22x40 variants) ──────────────────
def spine_sheet():
    sheet = Img(132, 40)
    specs = [(SOFT, 40), (CLAY, 37), (STONE, 39),
             (CARD, 36), (GREEND, 38), (WOODD, 35)]
    for i, (col, h) in enumerate(specs):
        cell = Img(22, 40)
        top = 40 - h
        cell.rect(0, top, 22, h, col)
        cell.rect(1, top, 2, h, SHADOW)         # highlight stripe, left edge
        cell.rect(0, top + 4, 22, 2, WOODL)     # two thin bands
        cell.rect(0, 34, 22, 2, WOODL)
        if i == 1:                              # rung 4 — one band worn away
            cell.rect(9, top + 4, 8, 2, col)
        if i == 4:                              # rung 4 — a shelfmark label
            cell.rect(6, 22, 10, 6, CARD)
            cell.rect(7, 24, 8, 2, STONE)
        cell.outline_inside()                   # each variant stands alone
        sheet.blit(cell, i * 22, 0)
    return save(sheet, "spine.png")


# ── UI 01 · icon sheet 64x64 (16 solid silhouettes, no outlines) ───────
GLYPHS = [
    # row 1 — candle, open book, bookshelf, desk
    ["......##......", ".....####.....", "....######....", ".....####.....",
     "......##......", "....######....", "....######....", "....######....",
     "....######....", "....######....", "....######....", "...########...",
     "..##########..", "..##########.."],
    ["..###....###..", ".#####..#####.", "######..######", "######..######",
     "######..######", "######..######", "######..######", "######..######",
     "######..######", "######..######", "######..######", ".#####..#####.",
     "..####..####..", ".............."],
    ["##############", "#............#", "#.##.##.##...#", "#.##.##.##...#",
     "#.##.##.##...#", "##############", "#............#", "#.##.##.##...#",
     "#.##.##.##...#", "#.##.##.##...#", "##############", "#............#",
     "#.##.##......#", "##############"],
    ["..............", "##############", "##############", "###......#####",
     "###......#####", "###......#####", "###......#####", "###......#####",
     "###......#####", "###......#####", "###......#####", "###......#####",
     "###......#####", "###......#####"],
    # row 2 — back chevron, close, arrange, search
    [".........###..", "........###...", ".......###....", "......###.....",
     ".....###......", "....###.......", "...###........", "...###........",
     "....###.......", ".....###......", "......###.....", ".......###....",
     "........###...", ".........###.."],
    ["##..........##", "###........###", ".###......###.", "..###....###..",
     "...###..###...", "....######....", ".....####.....", ".....####.....",
     "....######....", "...###..###...", "..###....###..", ".###......###.",
     "###........###", "##..........##"],
    ["......##......", ".....####.....", "....######....", "......##......",
     "..#...##...#..", ".##...##...##.", "##############", "##############",
     ".##...##...##.", "..#...##...#..", "......##......", "....######....",
     ".....####.....", "......##......"],
    ["...######.....", "..########....", ".##......##...", ".##......##...",
     "##........##..", "##........##..", "##........##..", "##........##..",
     ".##......##...", ".##......##...", "..########....", "...######.....",
     "........###...", ".........###.."],
    # row 3 — tag, calendar, clock, padlock
    [".....#########", "....##########", "...###########", "..############",
     ".#############", "###..#########", "###..#########", "##############",
     "##############", "##############", "##############", "##############",
     "##############", "##############"],
    [".##........##.", ".##........##.", "##############", "##############",
     "##############", "##..........##", "##.##.##.##.##", "##..........##",
     "##.##.##.##.##", "##..........##", "##.##.##....##", "##..........##",
     "##############", ".............."],
    ["....######....", "..##########..", ".####....####.", ".###..##..###.",
     "##....##....##", "##....##....##", "##....##....##", "##....####..##",
     "##..........##", ".###......###.", ".####....####.", "..##########..",
     "....######....", ".............."],
    ["....######....", "...##....##...", "..##......##..", "..##......##..",
     "..##......##..", "##############", "##############", "##############",
     "#####....#####", "#####....#####", "##############", "##############",
     "##############", ".............."],
    # row 4 — heart, check, plus, list
    ["..............", ".####....####.", "##############", "##############",
     "##############", "##############", ".############.", "..##########..",
     "...########...", "....######....", ".....####.....", "......##......",
     "..............", ".............."],
    ["............##", "...........###", "..........###.", ".........###..",
     "........###...", "##......###...", "###....###....", ".###..###.....",
     "..######......", "...####.......", "....##........", "..............",
     "..............", ".............."],
    [".....####.....", ".....####.....", ".....####.....", ".....####.....",
     ".....####.....", "##############", "##############", "##############",
     "##############", ".....####.....", ".....####.....", ".....####.....",
     ".....####.....", ".....####....."],
    ["..............", "##############", "##############", "##############",
     "..............", "..............", "##############", "##############",
     "##############", "..............", "..............", "##############",
     "##############", "##############"],
]


def icons():
    g = Img(64, 64)
    for i, rows in enumerate(GLYPHS):
        ox, oy = (i % 4) * 16 + 1, (i // 4) * 16 + 1   # 1px clear margin
        for y, row in enumerate(rows):
            if len(row) != 14:
                raise SystemExit("glyph %d row %d is %d wide" % (i, y, len(row)))
            for x, ch in enumerate(row):
                if ch == "#":
                    g.put(ox + x, oy + y, OUT)
    return save(g, "icons.png")


# ── UI 02 · 9-slice panel frame 24x24 ──────────────────────────────────
def panel_frame():
    g = Img(24, 24)

    def corner(ox, oy, fx, fy, bevel_h, bevel_v):
        for v in range(8):
            for u in range(8):
                x = ox + (7 - u if fx else u)
                y = oy + (7 - v if fy else v)
                s = u + v
                if s < 4:
                    continue                     # the stepped bookplate notch
                if s < 6 or v < 2 or u < 2:
                    g.put(x, y, OUT)
                elif s < 7 or v == 2 or u == 2:
                    g.put(x, y, bevel_h if v <= u else bevel_v)
                else:
                    g.put(x, y, PAPER)

    def edge(ox, oy, horiz, near, bevel):
        for i in range(8):
            for d in range(8):
                x, y = (ox + i, oy + d) if horiz else (ox + d, oy + i)
                dd = d if near else 7 - d
                g.put(x, y, OUT if dd < 2 else bevel if dd == 2 else PAPER)

    corner(0, 0, False, False, CARD, CARD)          # TL
    corner(16, 0, True, False, CARD, SHADOW)        # TR
    corner(0, 16, False, True, CARD, SHADOW)        # BL
    corner(16, 16, True, True, SHADOW, SHADOW)      # BR
    edge(8, 0, True, True, CARD)                    # top
    edge(8, 16, True, False, SHADOW)                # bottom
    edge(0, 8, False, True, CARD)                   # left
    edge(16, 8, False, False, SHADOW)               # right
    g.rect(8, 8, 8, 8, PAPER)                       # flat centre tile
    return save(g, "panel-frame.png")


# ── UI 03 · cursors 16x16 (the one outlined-under-16px exception) ──────
ARROW = [(0, 0), (0, 1), (1, 1), (0, 2), (2, 2), (0, 3), (3, 3), (0, 4), (4, 4),
         (0, 5), (5, 5), (0, 6), (6, 6), (0, 7), (7, 7), (0, 8), (8, 8)]

FINGERS = [(3, 4), (6, 7), (9, 10), (12, 13)]
HAND = {0: [FINGERS[1]],
        1: FINGERS[:3],
        2: FINGERS, 3: FINGERS, 4: FINGERS,
        5: [(2, 13)], 6: [(1, 13)], 7: [(1, 13)], 8: [(2, 13)],
        9: [(2, 12)], 10: [(3, 11)], 11: [(4, 10)]}

FLAME_CUR = {1: (4, 4), 2: (4, 5), 3: (3, 5), 4: (3, 6),
             5: (2, 6), 6: (2, 6), 7: (2, 6), 8: (3, 5)}


def cursors():
    a = Img(16, 16)                              # tip at the very top-left px
    for y in range(9):
        a.hline(1, 1 + y, 1 + y, CARD)
    a.hline(1, 6, 10, CARD)
    a.hline(1, 3, 11, CARD)
    a.hline(5, 7, 11, CARD)
    a.hline(6, 8, 12, CARD)
    a.hline(7, 9, 13, CARD)
    a.outline_outside()
    save(a, "cursor-arrow.png")

    h = Img(16, 16)
    for y, spans in HAND.items():
        for x0, x1 in spans:
            h.hline(x0, x1, y, CARD)
    h.outline_outside()
    save(h, "cursor-hand.png")

    f = Img(16, 16)
    for y, (x0, x1) in FLAME_CUR.items():
        f.hline(x0, x1, y, ACCENT)
    f.outline_outside()
    save(f, "cursor-flame.png")
    return [a, h, f]


# ── UI 04 · divider ornament 48x8 ──────────────────────────────────────
def divider():
    g = Img(48, 8)
    g.hline(0, 17, 4, OUT)                       # plain rule, both ends
    g.hline(30, 47, 4, OUT)
    g.put(20, 4, OUT)                            # a single dot either side
    g.put(27, 4, OUT)
    for x, y in ((23, 4), (24, 3), (24, 5), (25, 4)):
        g.put(x, y, OUT)                         # four-pixel diamond
    return save(g, "divider.png")


# ── Script II §04 · room background 384x216 ────────────────────────────
# Backgrounds carry no silhouette outline — they ARE the value range that
# everything else is judged against, so rule 3 does not apply to them.
def mini_conifer(g, cx, base, h, lit, dark):
    for r in range(h):
        half = min(r // 3, 5)
        for x in range(cx - half, cx + half + 1):
            g.put(x, base - h + 1 + r, lit if x < cx else dark)


def bg():
    g = Img(384, 216)
    g.rect(0, 0, 120, 167, GREEN)                   # left wall — panelling
    for x in range(0, 120, 6):
        g.vline(x, 0, 166, GREEND)
    g.rect(121, 0, 263, 167, PAPER)                 # right wall — plaster
    for x in range(144, 384, 24):
        g.vline(x, 0, 166, SHADOW)
    for x in range(236, 264):                       # 45-degree transition hatch
        for y in range(0, 167):
            if (x + y) % 6 == 0:
                g.put(x, y, SHADOW)
    g.vline(120, 0, 166, OUT)
    g.rect(0, 0, 120, 3, GREEND)                    # ceiling shadow
    g.rect(121, 0, 263, 3, SHADOW)
    g.rect(0, 165, 120, 2, GREEND)                  # wall meets floor
    g.rect(121, 165, 263, 2, SHADOW)
    g.hline(0, 383, 167, OUT)

    g.rect(0, 168, 384, 48, WOODL)                  # floor — horizontal planks
    for y in (179, 191, 203):
        g.hline(0, 383, y, WOODD)
    for n, y0 in enumerate((168, 180, 192, 204)):
        grain_h(g, 0, 383, y0 + 2, y0 + 8, WOOD, 0x6100 + n,
                gap=(3, 7), length=(14, 46))
    g.rect(196, 192, 60, 11, WOOD)                  # rung 4 — a worn plank

    g.rect(60, 178, 240, 26, CLAY)                  # sideboard
    g.rect(62, 180, 236, 1, WOOD)
    g.rect(60, 178, 240, 2, OUT)
    g.rect(60, 202, 240, 2, OUT)
    g.rect(60, 178, 2, 26, OUT)
    g.rect(298, 178, 2, 26, OUT)
    g.rect(66, 184, 228, 1, OUT)                    # inset panel line
    g.rect(66, 197, 228, 1, OUT)
    g.vline(66, 184, 197, OUT)
    g.vline(293, 184, 197, OUT)
    for dx in range(-3, 4):                         # diamond escutcheon
        for dy in range(-3, 4):
            if abs(dx) + abs(dy) <= 3:
                g.put(180 + dx, 191 + dy, OUT)
    g.disc(120, 191, 3, OUT)                        # two round handles
    g.disc(240, 191, 3, OUT)

    g.rect(300, 38, 50, 40, STONE)                  # framed picture
    g.rect(303, 41, 44, 34, PAPER)
    g.rect(305, 43, 40, 30, SHADOW)
    for cx in (312, 322, 332, 341):
        mini_conifer(g, cx, 72, 13, GREEND, GREEND)
    g.rect(300, 38, 50, 1, OUT)
    g.rect(300, 77, 50, 1, OUT)
    g.vline(300, 38, 77, OUT)
    g.vline(349, 38, 77, OUT)
    g.put(282, 52, STONE)                           # rung 4 — an old nail hole
    g.put(282, 53, SHADOW)
    return save(g, "bg.png")


# ── Script II §05 · the two zoom plates, 384x216 ───────────────────────
def desk_station():
    g = Img(384, 216)
    g.rect(0, 0, 384, 120, PAPER)                   # wall
    for x in range(0, 384, 23):
        g.vline(x, 0, 119, SHADOW)
    g.rect(0, 26, 384, 2, WOODD)                    # picture rail

    g.rect(33, 81, 58, 3, STONE)                    # shadow under the picture
    g.vline(58, 28, 31, OUT)                        # hanging wire
    g.rect(30, 32, 58, 48, STONE)                   # framed landscape
    g.rect(33, 35, 52, 42, PAPER)
    g.rect(35, 37, 48, 38, SHADOW)
    for cx in (46, 58, 70, 78):
        mini_conifer(g, cx, 74, 15, GREEND, GREEND)
    g.rect(30, 32, 58, 1, OUT)
    g.rect(30, 79, 58, 1, OUT)
    g.vline(30, 32, 79, OUT)
    g.vline(87, 32, 79, OUT)

    g.rect(107, 71, 46, 3, STONE)                   # shadow under the card
    for i in range(35):                             # index card, pinned crooked
        dx = i // 12
        g.rect(104 + dx, 36 + i, 46, 1, CARD)
    for ly in (46, 54, 62):
        g.hline(107 + (ly - 36) // 12, 145 + (ly - 36) // 12, ly, SHADOW)
    g.rect(124, 37, 3, 3, ACCENT)                   # the pin

    g.rect(253, 64, 104, 3, STONE)                  # shadow under the shelf
    for x, w, h, c in ((260, 7, 20, SOFT), (268, 6, 17, CLAY), (275, 7, 22, CARD)):
        ov_spine(g, x, w, 59, h, c)
    ov_flat(g, 292, 52, 25, 8, STONE)
    g.rect(250, 60, 104, 3, WOODD)                  # floating shelf
    g.hline(250, 353, 63, OUT)

    g.rect(0, 118, 384, 2, SHADOW)                  # wall meets desktop
    g.rect(0, 120, 384, 7, WOODL)                   # front lip
    g.hline(0, 383, 127, OUT)
    g.rect(0, 128, 384, 78, WOOD)                   # desktop surface
    grain_h(g, 0, 383, 130, 165, WOODD, 0x7101, gap=(5, 11), length=(20, 60))
    grain_h(g, 0, 383, 166, 204, WOODD, 0x7102, gap=(2, 5), length=(24, 70))
    g.rect(0, 206, 384, 10, WOODD)                  # front edge

    g.rect(240, 150, 84, 44, WOOD)                  # drawer
    grain_h(g, 242, 321, 152, 191, WOODD, 0x7103, gap=(4, 9), length=(10, 30))
    g.rect(240, 150, 84, 2, OUT)
    g.rect(240, 192, 84, 2, OUT)
    g.rect(240, 150, 2, 44, OUT)
    g.rect(322, 150, 2, 44, OUT)
    g.rect(246, 156, 72, 1, OUT)                    # inset panel line
    g.rect(246, 187, 72, 1, OUT)
    g.vline(246, 156, 187, OUT)
    g.vline(317, 156, 187, OUT)
    g.rect(270, 165, 24, 8, STONE)                  # plate pull
    g.put(271, 166, CARD)                           # the one specular pixel
    g.rect(300, 169, 2, 5, OUT)                     # keyhole
    return save(g, "desk-station.png")


def shelf_station():
    g = Img(384, 216)
    g.rect(26, 13, 332, 203, SHADOW)                # planked back panel
    for x in range(26, 358, 16):
        g.vline(x, 13, 215, STONE)
    g.rect(120, 88, 46, 16, PAPER)                  # story: a sun-bleached patch
    for n, by in enumerate((56, 104, 152, 200)):    # four boards
        for x in range(26, 358):
            sag = 1 if (n == 2 and 150 <= x <= 250) else 0
            g.rect(x, by + sag, 1, 4, WOODL)
            g.put(x, by + 4 + sag, OUT)
        for i in range(5):                          # the depth shadow beneath —
            y = by + 5 + i                          # solid, then dithering out
            for x in range(26, 358):
                s = 1 if (n == 2 and 150 <= x <= 250) else 0
                if i < 2 or BAYER[(y + s) % 4][x % 4] / 16.0 < 1.0 - (i - 1) / 3.0:
                    g.put(x, y + s, STONE)
    g.rect(0, 0, 24, 216, WOOD)                     # carcass sides
    g.rect(360, 0, 24, 216, WOOD)
    grain_v(g, 1, 22, 0, 215, WOODD, 0xA101, gap=(6, 14), length=(14, 40))
    grain_v(g, 361, 382, 0, 215, WOODD, 0xA102, gap=(6, 14), length=(14, 40))
    g.rect(24, 0, 2, 216, OUT)
    g.rect(358, 0, 2, 216, OUT)
    g.rect(0, 0, 384, 12, WOODD)                    # top rail
    g.hline(0, 383, 12, OUT)
    return save(g, "shelf-station.png")


# ── contact sheet (review aid, not shipped) ────────────────────────────
def contact_sheet(items, scale=4, name="_contact-sheet.png", cols=4):
    pad = 8
    cw = max(i.w for i in items) * scale + pad
    ch = max(i.h for i in items) * scale + pad
    rows = (len(items) + cols - 1) // cols
    g = Img(cw * cols, ch * rows)
    g.rect(0, 0, g.w, g.h, SOFT)
    for n, im in enumerate(items):
        ox = (n % cols) * cw + (cw - im.w * scale) // 2
        oy = (n // cols) * ch + (ch - im.h * scale) // 2
        for y in range(im.h):
            for x in range(im.w):
                c = im.px[y][x]
                if c is None:
                    continue
                g.rect(ox + x * scale, oy + y * scale, scale, scale, c)
    write_png(g, os.path.join(PNGDIR, name))


def main():
    os.makedirs(PNGDIR, exist_ok=True)
    built = [
        bookshelf(),
        desk(),
        *windows(),
        chair(),
        bench(),
        plant(),
        album(),
        notebook(),
        journal(),
        candle(),
        spine_sheet(),
        icons(),
        panel_frame(),
        *cursors(),
        divider(),
    ]
    shelf = [bookshelf_empty(), bookshelf_fill_1(),
             bookshelf_fill_2(), bookshelf_fill_3()]
    plates = [bg(), desk_station(), shelf_station()]
    contact_sheet(built + shelf)
    contact_sheet(plates, scale=2, name="_contact-plates.png", cols=1)
    print("built %d files in %s" % (len(os.listdir(PNGDIR)), PNGDIR))


if __name__ == "__main__":
    main()
