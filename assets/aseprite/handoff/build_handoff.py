#!/usr/bin/env python3
"""
build_handoff.py — the sprite set for tools/ROOM-HANDOFF.md (S1-S9, M3-M4, D-2).

ART ONLY. Nothing here ships. Output lands in this directory's png/ and is
never copied into assets/room/ — the live room is untouched, gen_room_sprites.py
is untouched, and tests/test_sprite_geometry.py cannot see any of it.
Owner's instruction 2026-08-07: "I don't need any of them ship into the actual
app, I just want the asset completed."

WHY A GENERATOR AND NOT A DRAWING SESSION
  SPRITES.md §7.4 is the determinism law: one fixed seed per call site, the same
  bytes every run. assets/aseprite/pixel-build/build.py set that precedent for
  the (now superseded) Pixel Build Script; this is its sibling for the handoff.
  Re-running is free, so an art-direction change is a diff rather than a redraw.

WHAT IS DIFFERENT FROM pixel-build/build.py
  1. PALETTE — two 10-step ramps (warm room + cool window) instead of 13 hexes.
     palette_check() rejects anything outside them, so rule 7 ("no sprite carries
     a colour of its own") is enforced by the build rather than by care.
  2. NO OUTLINES — there is deliberately no outline_inside() here. Forms separate
     by VALUE. Where a silhouette would otherwise be lost, one pixel of step 0/1.
     THE ONE EXCEPTION is cursors (S9), which sit on unknown backgrounds.
  3. BAYER IS 8x8, not 4x4, and is addressed in CANVAS space (x & 7, y & 7) so
     the pattern is continuous across sprite boundaries when they composite.
  4. LIGHT IS PINNED at 38° from vertical, upper left: top and left faces one
     step lighter, bottom and right faces one step darker, everywhere.
  5. ONE STEP of lighting is baked. The renderer is supposed to add the rest.

⚠ TWO PLACES THIS DEVIATES FROM THE HANDOFF, BOTH DELIBERATE, BOTH FLAGGED
  (a) OUTLINES. The handoff says "no outlines at all". The owner ruled 2026-08-07
      that #2c2823 outlines STAY (SPRITES.md §2, unamended). Those two cannot
      both be true in one file, and #2c2823 is not on either ramp — so honouring
      the ruling here would put an off-ramp colour in every sprite and break
      rule 7. Resolution: the SET is built to the handoff (no outlines), and
      build_outline_ab() renders ONE sprite both ways so the ruling can be
      judged against the actual look instead of a description. Her ruling stands
      for anything that ships; nothing here ships.
  (b) S6/S7 SIZE. The handoff specifies 384x216 for the two station plates. The
      SHIPPED plates are 768x432 (measured). Built to the handoff's number, since
      rule 9 makes sizes contract and these are not replacing the shipped files.
"""

import os
import struct
import zlib

ROOT = os.path.dirname(os.path.abspath(__file__))
PNGDIR = os.path.join(ROOT, "png")
ROOMDIR = os.path.normpath(os.path.join(ROOT, "..", "..", "room"))

# ── the two ramps (ROOM-HANDOFF.md §03) ────────────────────────────────
# Steps 0-1 ambient darkness · 2-6 where sprites live · 7-9 light, and light
# belongs to almost nothing.
WARM = [(0x0E, 0x0A, 0x16), (0x1A, 0x10, 0x20), (0x2A, 0x14, 0x1E),
        (0x3C, 0x1E, 0x22), (0x54, 0x38, 0x2A), (0x6D, 0x4A, 0x2E),
        (0x8A, 0x5F, 0x34), (0xB0, 0x81, 0x3E), (0xD8, 0xAC, 0x5C),
        (0xF2, 0xD8, 0xA4)]
# The window is the only exception to the warm ramp, because a night sky
# cannot be warm.
COOL = [(0x0E, 0x0A, 0x16), (0x14, 0x18, 0x24), (0x1C, 0x26, 0x34),
        (0x26, 0x38, 0x4A), (0x36, 0x50, 0x64), (0x48, 0x65, 0x7A),
        (0x5C, 0x80, 0x90), (0x7E, 0xA4, 0xB0), (0xA8, 0xC8, 0xD0),
        (0xDC, 0xEB, 0xEE)]
RAMP = set(WARM) | set(COOL)

# The one off-ramp colour in this file, used ONLY by the cursor exception and
# by the outline A/B plate. Named so a palette_check failure is legible.
INK = (0x2C, 0x28, 0x23)


def W(i):
    return WARM[0 if i < 0 else (9 if i > 9 else i)]


def C(i):
    return COOL[0 if i < 0 else (9 if i > 9 else i)]


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

    def rim_outside(self, col=INK):
        """The CURSOR exception only — grow a 1px ring outward so the glyph
        survives an unknown background. Never used on furniture."""
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x] is not None:
                    continue
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if (dx or dy) and self.get(x + dx, y + dy) is not None:
                            add.append((x, y))
                            break
                    else:
                        continue
                    break
        for x, y in add:
            self.px[y][x] = col

    def palette_check(self, name, allow=()):
        """Rule 7, enforced: every colour comes from the shared ramps."""
        ok = RAMP | set(allow)
        bad = set()
        for row in self.px:
            for c in row:
                if c is not None and c not in ok:
                    bad.add(c)
        if bad:
            raise SystemExit("%s: off-ramp colour(s) %s" % (name, sorted(bad)))


def write_png(img, path):
    raw = bytearray()
    for y in range(img.h):
        raw.append(0)
        for x in range(img.w):
            c = img.px[y][x]
            raw += (b"\0\0\0\0" if c is None else bytes(c) + b"\xff")

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", img.w, img.h, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)


def read_png(path):
    """Zero-dep decoder — S8 reads the SHIPPED sprites to recolour them, so the
    silhouette and dimensions are preserved exactly rather than redrawn."""
    d = open(path, "rb").read()
    assert d[:8] == b"\x89PNG\r\n\x1a\n", path
    i, idat, pal, trns = 8, b"", None, None
    w = h = bd = ct = None
    while i < len(d):
        ln = struct.unpack(">I", d[i:i + 4])[0]
        typ, data = d[i + 4:i + 8], d[i + 8:i + 8 + ln]
        i += 12 + ln
        if typ == b"IHDR":
            w, h, bd, ct = struct.unpack(">IIBB", data[:10])
        elif typ == b"PLTE":
            pal = data
        elif typ == b"tRNS":
            trns = data
        elif typ == b"IDAT":
            idat += data
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ct]
    bpp = max(1, ch * bd // 8)
    stride = (w * ch * bd + 7) // 8
    rows, prev, pos = [], bytearray(stride), 0
    for _ in range(h):
        f = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1:
                line[x] = (line[x] + a) & 255
            elif f == 2:
                line[x] = (line[x] + b) & 255
            elif f == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                pp = a + b - c
                pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        rows.append(bytes(line))
        prev = line
    img = Img(w, h)
    for y, line in enumerate(rows):
        for x in range(w):
            if ct == 3:
                k = line[x]
                a = trns[k] if trns and k < len(trns) else 255
                px = (pal[k * 3], pal[k * 3 + 1], pal[k * 3 + 2])
            elif ct == 6:
                px, a = tuple(line[x * 4:x * 4 + 3]), line[x * 4 + 3]
            elif ct == 2:
                px, a = tuple(line[x * 3:x * 3 + 3]), 255
            elif ct == 4:
                px, a = (line[x * 2],) * 3, line[x * 2 + 1]
            else:
                px, a = (line[x],) * 3, 255
            img.px[y][x] = px if a > 0 else None
    return img


def save(img, name, allow=()):
    img.palette_check(name, allow)
    write_png(img, os.path.join(PNGDIR, name))
    return img


def rng(seed):
    """§7.4 determinism law — fixed-seed LCG, one seed per call site."""
    s = seed & 0x7FFFFFFF

    def nxt(n):
        nonlocal s
        s = (s * 1103515245 + 12345) & 0x7FFFFFFF
        return s % n
    return nxt


# ── the dither (rule 4) ────────────────────────────────────────────────
# Ordered Bayer between two ADJACENT ramp steps, aligned to an 8x8 grid.
# Required on every flat region larger than 30x30, not optional. Addressed in
# CANVAS space so the texture is continuous where sprites meet.
BAYER8 = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
]


def bth(x, y):
    return BAYER8[y & 7][x & 7] / 64.0


def dith(g, x0, x1, y0, y1, lo, hi, t=0.5, ramp=WARM):
    """Fill a region with an ordered mix of two adjacent steps. t is the
    fraction of the HIGHER step: 0 -> all lo, 1 -> all hi."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            g.put(x, y, ramp[hi] if bth(x, y) < t else ramp[lo])


def dith_fade(g, x0, x1, y0, y1, lo, hi, ramp=WARM, invert=False):
    """Fade from hi at the top into lo at the bottom (or the reverse)."""
    rows = max(1, y1 - y0)
    for y in range(y0, y1 + 1):
        t = (y - y0) / float(rows)
        if not invert:
            t = 1.0 - t
        for x in range(x0, x1 + 1):
            g.put(x, y, ramp[hi] if bth(x, y) < t else ramp[lo])


def grain_h(g, x0, x1, y0, y1, col, seed, gap=(2, 6), length=(5, 18)):
    """Rung 3 (material) on wood seen end-on."""
    r = rng(seed)
    y = y0
    while y <= y1:
        x = x0 + r(6)
        while x < x1:
            ln = length[0] + r(max(1, length[1] - length[0]))
            for i in range(ln):
                if x + i <= x1 and g.get(x + i, y) is not None:
                    g.put(x + i, y, col)
            x += ln + 3 + r(9)
        y += gap[0] + r(max(1, gap[1] - gap[0]))


def grain_v(g, x0, x1, y0, y1, col, seed, gap=(3, 6), length=(4, 12)):
    r = rng(seed)
    x = x0
    while x <= x1:
        y = y0 + r(5)
        while y < y1:
            ln = length[0] + r(max(1, length[1] - length[0]))
            for i in range(ln):
                if y + i <= y1 and g.get(x, y + i) is not None:
                    g.put(x, y + i, col)
            y += ln + 2 + r(7)
        x += gap[0] + r(max(1, gap[1] - gap[0]))


def contact(g, ramp=WARM):
    """Rule 8 — the contact shadow is drawn INTO the sprite as darker ramp
    steps along its base. No blur, ever, because blur is not a pixel-art
    operation. Bottom row -> step 1, the row above -> step 2."""
    for x in range(g.w):
        col = [y for y in range(g.h) if g.px[y][x] is not None]
        if not col:
            continue
        b = max(col)
        g.put(x, b, ramp[1])
        if b - 1 >= 0 and g.px[b - 1][x] is not None:
            g.put(x, b - 1, ramp[2])


# ══ S1 · room background — 384x216 ═════════════════════════════════════
def bg():
    g = Img(384, 216)
    # WALL RIGHT x120-384: step 3 plaster, dithered against 2 so no region is
    # uniform (the wall is by far the largest flat area in the room).
    dith(g, 120, 383, 0, 166, 2, 3, 0.62)
    # WALL LEFT x0-120: vertical panelling, step 2, 1px step-1 lines every 7px.
    g.rect(0, 0, 120, 167, W(2))
    for x in range(0, 120, 7):
        g.vline(x, 0, 166, W(1))
    # The panelling stops and the plaster starts at x120. Without a corner the
    # butt-join reads as a rendering error rather than a change of material —
    # one step-1 line is the whole fix, and it is the same line the floor gets.
    g.vline(120, 0, 166, W(1))
    # Step-1 line at y167 where floor meets wall.
    g.hline(0, 383, 167, W(1))
    # FLOOR y168-216: planks step 4, each 11px tall, 1px step-2 separators,
    # a step-3 grain streak inside each plank at irregular intervals.
    g.rect(0, 168, 384, 48, W(4))
    y = 168
    seed = 4101
    while y < 216:
        g.hline(0, 383, min(215, y + 10), W(2))
        grain_h(g, 0, 383, y + 2, min(214, y + 9), W(3), seed, (4, 7), (9, 26))
        seed += 7
        y += 11
    # SIDEBOARD x60-300, y178-204 — step 4 body with a step-1 inset panel line.
    g.rect(60, 178, 240, 27, W(4))
    g.hline(60, 299, 178, W(5))          # lit top face (light from upper left)
    g.vline(60, 178, 204, W(5))          # lit left face
    g.hline(60, 299, 204, W(2))          # bottom face one step darker
    g.vline(299, 178, 204, W(3))
    for x, w in ((68, 100), (176, 116)):
        g.hline(x, x + w, 183, W(1))
        g.hline(x, x + w, 200, W(1))
        g.vline(x, 183, 200, W(1))
        g.vline(x + w, 183, 200, W(1))
    # a diamond escutcheon and two round handles in step 2
    cx, cy = 180, 191
    for d in range(5):
        g.hline(cx - (4 - d), cx + (4 - d), cy - 4 + d, W(2))
        g.hline(cx - (4 - d), cx + (4 - d), cy + 4 - d, W(2))
    g.disc(120, 191, 3, W(2))
    g.disc(240, 191, 3, W(2))
    # FRAMED PICTURE x300-350, y38-78 — step 5 frame, step 3 mount, a step-2
    # treeline inside echoing the window.
    g.rect(300, 38, 51, 41, W(5))
    g.hline(300, 350, 38, W(6))
    g.vline(300, 38, 78, W(6))
    g.rect(304, 42, 43, 33, W(3))
    r = rng(9182)
    for i in range(7):
        tx = 306 + i * 6
        th = 8 + r(7)
        for j in range(th):
            half = max(0, (th - j) // 2)
            g.hline(tx - half, tx + half, 74 - j, W(2))
    # ONE story detail only: a nail hole in the plaster where a picture used
    # to hang. Rung 4 — the room has a past it did not explain.
    g.put(268, 52, W(1))
    g.put(269, 52, W(1))
    g.put(268, 53, W(2))
    # ⚠ DEVIATION FROM §05's LITERAL NUMBERS, forced by §04's CI assertion.
    # S1 specifies a step-4 floor. Composited and run through the light pass,
    # a step-4 floor puts the day frame at 51.8 / 37.8 / 10.4 against a
    # 60 / 30 / 10 target — 8 points light on shadow and 8 heavy on mid, which
    # is the "uniform dimming" failure §04 exists to prevent, arriving through
    # the floor rather than through the lighting. Dropping the floor zone one
    # step lands it at 62.4 / 29.3 / 8.3, inside tolerance on all three bands,
    # with night unchanged at 89.1 / 10.8 / 0.1.
    # The assertion is the authority here by §04's own words ("the only
    # lighting check worth trusting" / "both need tuning in-engine, which is
    # what the CI assertion is for"), so the floor number gives. Applied as a
    # zone pass rather than by editing the constants above, so the spec's own
    # numbers stay legible next to the one measurement that overrode them.
    for y in range(168, 216):
        for x in range(384):
            c = g.px[y][x]
            if c == W(4):
                g.px[y][x] = W(3)
            elif c == W(3):
                g.px[y][x] = W(2)
    return save(g, "bg.png")


# ══ S2/S3 · the window — 88x88, three bands, one geometry ══════════════
# Every silhouette pixel and every dither position is identical across the
# three files by construction: the SAME function draws all three and only the
# palette arguments change. The renderer hot-swaps these, so a pixel that moves
# reads as a glitch at dawn and dusk.
CONIFERS = ((14, 30, 34), (40, 26, 40), (63, 22, 30))   # (cx, w, height)


def window_geo(g, sky_hi, sky_lo, sky_ramp, tree_lit, tree_dark, tree_ramp,
               trunk, stars=False):
    # Behind the glass first; the frame draws over it.
    dith_fade(g, 5, 82, 5, 33, sky_lo, sky_hi, sky_ramp)
    g.rect(5, 34, 78, 40, sky_ramp[sky_lo])
    # THREE blocky conifers along the bottom. Canopy tops stop just BELOW the
    # horizontal mullion (y=42) — never crossing it, so the upper two panes are
    # sky only. The centre tree straddles the vertical mullion; the outer two
    # are cropped by the frame so the woods continue past the window.
    for (cx, tw, th) in CONIFERS:
        top = 45
        base = top + th
        rows = th
        for j in range(rows):
            t = j / float(rows - 1)
            half = int(1 + t * (tw / 2.0))
            for x in range(cx - half, cx + half + 1):
                y = top + j
                # lighter face upper-left, darker lower-right (38°, rule 1)
                lit = (x - cx) < (j * 0.35 - half * 0.15)
                g.put(x, y, tree_ramp[tree_lit if lit else tree_dark])
        for y in range(base, base + 6):
            g.put(cx, y, tree_ramp[trunk])
            g.put(cx + 1, y, tree_ramp[trunk])
    if stars:
        # three single warm step-9 pixels as stars in the upper panes
        for (sx, sy) in ((21, 15), (55, 11), (68, 22)):
            g.put(sx, sy, W(9))
    # THE FRAME — 5px, on the WARM ramp, with step 6 on the top and left inner
    # edges. Drawn last so it crops the woods.
    for i in range(5):
        g.hline(i, 87 - i, i, W(5))
        g.hline(i, 87 - i, 87 - i, W(5))
        g.vline(i, i, 87 - i, W(5))
        g.vline(87 - i, i, 87 - i, W(5))
    g.hline(5, 82, 5, W(6))
    g.vline(5, 5, 82, W(6))
    # cross mullion dividing four panes
    g.rect(42, 5, 4, 78, W(5))
    g.rect(5, 42, 78, 4, W(5))
    g.vline(42, 5, 82, W(6))
    g.hline(5, 82, 42, W(6))
    # 3px warm step-5 sill across the bottom
    g.rect(2, 83, 84, 3, W(5))
    g.hline(2, 85, 83, W(6))
    return g


def windows():
    out = []
    # S2 — DAY. Sky cool 8 in the upper third dithered over into cool 7;
    # conifers cool 3 and 4.
    g = Img(88, 88)
    window_geo(g, 8, 7, COOL, 4, 3, COOL, 2)
    out.append(save(g, "decor-window.png"))
    # S3 — DUSK. Sky warm 5 into 4; trees drop to cool 2 and 3.
    g = Img(88, 88)
    window_geo(g, 5, 4, WARM, 3, 2, COOL, 1)
    out.append(save(g, "decor-window-dusk.png"))
    # S3 — NIGHT. Sky cool 2 into 1; trees flat cool 1 with NO lit face; three
    # warm step-9 stars.
    g = Img(88, 88)
    window_geo(g, 2, 1, COOL, 1, 1, COOL, 1, stars=True)
    out.append(save(g, "decor-window-night.png"))
    # M4 — the frame alone, glass transparent, so birds pass BEHIND the
    # mullion. Built by diffing against the day file: any pixel the frame pass
    # owns is kept, everything else cleared. That guarantees perfect register.
    f = Img(88, 88)
    window_geo(f, 8, 7, COOL, 4, 3, COOL, 2)
    blank = Img(88, 88)
    frame_only = Img(88, 88)
    window_geo_frame_mask(blank)
    for y in range(88):
        for x in range(88):
            if blank.px[y][x] is not None:
                frame_only.px[y][x] = f.px[y][x]
    out.append(save(frame_only, "decor-window-frame.png"))
    return out


def window_geo_frame_mask(g):
    """The frame/mullion/sill footprint — the same coordinates window_geo uses,
    kept in one place so the mask cannot drift from the drawing."""
    mark = W(5)
    for i in range(5):
        g.hline(i, 87 - i, i, mark)
        g.hline(i, 87 - i, 87 - i, mark)
        g.vline(i, i, 87 - i, mark)
        g.vline(87 - i, i, 87 - i, mark)
    g.rect(42, 5, 4, 78, mark)
    g.rect(5, 42, 78, 4, mark)
    g.rect(2, 83, 84, 3, mark)
    g.hline(5, 82, 5, mark)
    g.vline(5, 5, 82, mark)


# ══ S4 · empty bookcase — 72x112 ═══════════════════════════════════════
BOARDS = (34, 66, 98)          # board top surfaces
OPEN_X = (6, 65)


def bookshelf_empty():
    g = Img(72, 112)
    # carcass
    g.rect(0, 0, 72, 108, W(5))
    # back panel behind each opening, dithered between steps 3 and 4
    prev = 6
    for b in BOARDS:
        dith(g, OPEN_X[0], OPEN_X[1], prev, b - 1, 3, 4, 0.5)
        prev = b + 4
    # side panels: vertical 1px step-4 grain at irregular 3-5px intervals
    grain_v(g, 1, 4, 2, 104, W(4), 3301, (3, 6), (6, 16))
    grain_v(g, 67, 70, 2, 104, W(4), 3307, (3, 6), (6, 16))
    # boards — step 6 on the top-left edge, step 3 in the shadow beneath
    for i, b in enumerate(BOARDS):
        g.rect(OPEN_X[0], b, OPEN_X[1] - OPEN_X[0] + 1, 4, W(5))
        # story detail 1: the middle board is slightly bowed
        bow = 1 if i == 1 else 0
        for x in range(OPEN_X[0], OPEN_X[1] + 1):
            t = abs(x - (OPEN_X[0] + OPEN_X[1]) / 2.0) / 30.0
            d = bow if t < 0.55 else 0
            g.put(x, b + d, W(6))
            for k in range(1, 4):
                g.put(x, b + d + k, W(5))
            g.put(x, b + d + 4, W(3))
            g.put(x, b + d + 5, W(3))
    # top rail + a 4px plinth at the base
    g.rect(0, 0, 72, 6, W(5))
    g.hline(0, 71, 0, W(6))
    g.vline(0, 0, 107, W(6))
    g.rect(0, 104, 72, 4, W(5))
    g.hline(0, 71, 104, W(6))
    # story detail 2: a small chip out of the top-right frame corner
    for (cx, cy) in ((70, 0), (71, 0), (71, 1), (69, 0), (71, 2)):
        g.px[cy][cx] = None
    # contact shadow drawn into the bottom 3px as steps 2 and 1
    g.hline(0, 71, 108, W(2))
    g.hline(0, 71, 109, W(2))
    g.hline(0, 71, 110, W(1))
    return save(g, "bookshelf-empty.png")


# ══ S5 · three shelf fill overlays — 72x112 transparent ════════════════
def _spine(g, x, w, bottom, h, step, forward=False):
    top = bottom - h
    for j in range(h):
        y = top + j
        for i in range(w):
            g.put(x + i, y, W(step))
    # value separation instead of an outline: the left face one step lighter,
    # the right face one step darker (38°, upper left).
    for j in range(h):
        g.put(x, top + j, W(min(9, step + 1)))
        g.put(x + w - 1, top + j, W(max(0, step - 1)))
    g.hline(x, x + w - 1, top, W(min(9, step + 1)))
    if forward:
        g.hline(x, x + w - 1, bottom - 1, W(max(0, step - 1)))


def _flat(g, x, y, w, h, step):
    g.rect(x, y, w, h, W(step))
    g.hline(x, x + w - 1, y, W(min(9, step + 1)))
    g.hline(x, x + w - 1, y + h - 1, W(max(0, step - 1)))


def _leaner(g, x, bottom, h, step):
    for j in range(h):
        off = int((h - j) * 0.22)
        for i in range(5):
            g.put(x + off + i, bottom - j, W(step))
        g.put(x + off, bottom - j, W(min(9, step + 1)))


STEPS = (3, 4, 5, 6, 4, 5, 3, 6, 5, 4)


def bookshelf_fill_1():
    g = Img(72, 112)
    # bottom shelf only: four upright spines at its left end plus one flat.
    r = rng(5501)
    x = 8
    for i in range(4):
        w = 5 + r(3)
        _spine(g, x, w, BOARDS[2] - 1, 20 + r(5), STEPS[i])
        x += w + 1
    _flat(g, x + 2, BOARDS[2] - 5, 16, 4, 5)
    return save(g, "bookshelf-fill-1.png")


def bookshelf_fill_2():
    g = Img(72, 112)
    r = rng(5507)
    # bottom shelf full end to end, about ten spines, one leaning into a gap
    x = 7
    i = 0
    while x < 58:
        w = 5 + r(3)
        if i == 6:
            _leaner(g, x, BOARDS[2] - 1, 21, STEPS[i % 10])
            x += 8
        else:
            _spine(g, x, w, BOARDS[2] - 1, 20 + r(5), STEPS[i % 10])
            x += w + 1
        i += 1
    # middle shelf: five spines at its left end, a flat stack of two at right
    x = 8
    for i in range(5):
        w = 5 + r(3)
        _spine(g, x, w, BOARDS[1] - 1, 20 + r(4), STEPS[(i + 3) % 10])
        x += w + 1
    _flat(g, 44, BOARDS[1] - 9, 18, 4, 4)
    _flat(g, 45, BOARDS[1] - 5, 17, 4, 6)
    return save(g, "bookshelf-fill-2.png")


def bookshelf_fill_3():
    g = Img(72, 112)
    r = rng(5519)
    # all three shelves full: two leaners, three horizontal stacks, one book
    # pulled forward, one gap where a book is out. Accumulated over years, not
    # shelved by a librarian.
    plan = ((BOARDS[2] - 1, 0), (BOARDS[1] - 1, 3), (BOARDS[0] - 1, 6))
    for si, (bottom, off) in enumerate(plan):
        x = 7
        i = 0
        while x < 58:
            w = 5 + r(3)
            k = (i + off) % 10
            if si == 0 and i == 4:
                x += 4                      # the gap where a book is out
            elif si == 1 and i == 5:
                _leaner(g, x, bottom, 21, STEPS[k])
                x += 8
            elif si == 2 and i == 2:
                _leaner(g, x, bottom, 20, STEPS[k])
                x += 8
            elif si == 2 and i == 6:
                _spine(g, x, w + 1, bottom, 23, STEPS[k], forward=True)
                x += w + 2
            else:
                _spine(g, x, w, bottom, 20 + r(5), STEPS[k])
                x += w + 1
            i += 1
        _flat(g, 40 + si * 2, bottom - 22, 20, 4, 3 + (si % 3))
    return save(g, "bookshelf-fill-3.png")


# ══ S6 · desk zoom plate — 384x216 ═════════════════════════════════════
def desk_station():
    g = Img(384, 216)
    # WALL y0-120: step 3 plaster dithered against step 2
    dith(g, 0, 383, 0, 119, 2, 3, 0.6)
    g.rect(0, 26, 384, 2, W(5))                       # picture rail
    # framed landscape at x30-88 with a step-2 treeline
    g.rect(30, 34, 59, 44, W(5))
    g.hline(30, 88, 34, W(6))
    g.vline(30, 34, 77, W(6))
    g.rect(34, 38, 51, 36, W(3))
    r = rng(6101)
    for i in range(8):
        tx = 36 + i * 6
        th = 9 + r(8)
        for j in range(th):
            half = max(0, (th - j) // 2)
            g.hline(tx - half, tx + half, 73 - j, W(2))
    # a step-7 index card pinned slightly crooked, three step-4 ruled lines
    for j in range(30):
        off = j // 12
        g.hline(104 + off, 149 + off, 36 + j, W(7))
    for k in range(3):
        g.hline(109 + k // 2, 143 + k // 2, 44 + k * 7, W(4))
    # a 3px step-5 floating shelf holding three small spines and one flat book
    g.rect(250, 74, 105, 3, W(5))
    g.hline(250, 354, 74, W(6))
    x = 258
    for i in range(3):
        _spine(g, x, 6, 73, 22, STEPS[i])
        x += 8
    _flat(g, 300, 69, 22, 4, 5)
    # DESKTOP y120-216
    g.rect(0, 120, 384, 7, W(6))                      # front lip
    g.hline(0, 383, 127, W(2))
    g.rect(0, 128, 384, 78, W(5))
    grain_h(g, 0, 383, 130, 203, W(4), 6113, (3, 7), (14, 44))
    grain_h(g, 0, 383, 186, 203, W(4), 6119, (2, 4), (18, 52))  # denser at front
    g.rect(0, 206, 384, 10, W(4))
    g.hline(0, 383, 206, W(5))
    # DRAWER x240-324, y150-194
    g.rect(240, 150, 85, 45, W(5))
    g.hline(240, 324, 150, W(6))
    g.vline(240, 150, 194, W(6))
    g.hline(240, 324, 194, W(3))
    g.hline(246, 318, 156, W(2))
    g.hline(246, 318, 188, W(2))
    g.vline(246, 156, 188, W(2))
    g.vline(318, 156, 188, W(2))
    # The plate pull. A flat step-7 block at this size reads as a paper label,
    # so it gets the same treatment every other form here gets: lit top and
    # left edge, dark bottom and right, and a step-2 recess line under it so
    # the eye reads a plate standing off the drawer face rather than printed
    # on it. ONE step-9 pixel, top-left, where the light actually strikes.
    g.rect(269, 167, 28, 6, W(7))
    g.hline(269, 296, 167, W(8))
    g.vline(269, 167, 172, W(8))
    g.hline(269, 296, 172, W(6))
    g.vline(296, 167, 172, W(6))
    g.hline(269, 296, 173, W(2))                      # the recess
    g.put(270, 168, W(9))                             # one specular pixel
    g.disc(283, 182, 2, W(2))                         # keyhole
    g.put(283, 184, W(2))
    # The desktop is left clear x12-210 — notebook, papers and candle place
    # there at runtime, so nothing may be drawn into that band.
    return save(g, "desk-station.png")


# ══ S7 · shelf zoom plate — 384x216 ════════════════════════════════════
STATION_BOARDS = (56, 104, 152, 200)   # TOP surfaces, pinned by the renderer


def shelf_station():
    g = Img(384, 216)
    # BACK PANEL: step 3 boards in 16px vertical bands separated by 1px step-2
    # lines, Bayer-dithered between 2 and 3. Never flat.
    dith(g, 0, 383, 0, 215, 2, 3, 0.58)
    for x in range(0, 384, 16):
        g.vline(x, 0, 215, W(2))
    # CARCASS: 24px step-5 side panels with vertical grain and a 2px step-2
    # inner edge line.
    for x0 in (0, 360):
        g.rect(x0, 0, 24, 216, W(5))
        grain_v(g, x0 + 1, x0 + 22, 2, 213, W(4), 7101 + x0, (3, 6), (8, 22))
    g.vline(0, 0, 215, W(6))
    g.rect(24, 0, 2, 216, W(2))
    g.rect(358, 0, 2, 216, W(2))
    # 12px step-4 top rail with a step-2 line beneath
    g.rect(0, 0, 384, 12, W(4))
    g.hline(0, 383, 0, W(5))
    g.hline(0, 383, 12, W(2))
    # BOARDS. Each is 4px of step 6, a 1px step-2 line, then a 5px shadow
    # stepping 3 -> 2 -> back panel. That shadow is the most important element
    # in the sprite — it is what gives the carcass depth.
    for i, b in enumerate(STATION_BOARDS):
        bow = 1 if i == 2 else 0            # story detail: one board bows
        for x in range(26, 358):
            # A 1px bow cannot be smooth, so the only question is WHERE the
            # single step falls. A flat |x| threshold puts it at an arbitrary
            # column and reads as a glitch; a parabola puts it where a real
            # board's curvature is steepest, near the ends, and reads as sag.
            t = abs(x - 192) / 166.0
            d = bow if (1.0 - t * t) > 0.5 else 0
            for k in range(4):
                g.put(x, b + d + k, W(6))
            g.put(x, b + d + 4, W(2))
            g.put(x, b + d + 5, W(3))
            g.put(x, b + d + 6, W(3))
            g.put(x, b + d + 7, W(2))
            g.put(x, b + d + 8, W(2))
    # story detail: a faint pale rectangle on the second board where a book sat
    # for years — one step lighter than the panel behind it, nothing more.
    # "FAINT" is the whole point — a book-shaped absence, not a painted panel.
    # A sparse step-4 mix over the step-3 boards is barely there at 1x and
    # resolves as you look, which is how a real sun-bleached patch behaves.
    for y in range(112, 140):
        for x in range(150, 214):
            if bth(x, y) < 0.22:
                g.put(x, y, W(4))
    return save(g, "shelf-station.png")


# ══ S8 · recolour the existing nine ════════════════════════════════════
# "Map every colour onto the room ramp, keeping the existing value
# relationships." Done by READING the shipped file rather than redrawing it, so
# the silhouette and the dimensions cannot drift (rule 9). Then: remove the
# outlines by folding them into value separation, dither any flat region over
# 30x30, and draw the contact shadow into the base.
NINE = ("bookshelf", "desk", "chair", "bench", "album", "journal",
        "notebook", "decor-plant", "decor-candle")

# Two rung-4 story details per sprite, NAMED before drawing (the handoff is
# explicit that "add detail" without naming the rung yields noise).
STORY = {
    "bookshelf":    ("a chipped top-right corner", "one bowed shelf board"),
    "desk":         ("a pale ring where a mug sat", "one scuffed front edge"),
    "chair":        ("a worn patch on the seat front", "a loose back slat"),
    "bench":        ("a dented left end", "a knot in the seat plank"),
    "album":        ("a lifted corner on the cover", "a bookmark ribbon"),
    "journal":      ("a ribbon left between pages", "a bent bottom corner"),
    "notebook":     ("a coffee spot on the cover", "one dog-eared page"),
    "decor-plant":  ("one yellowing lower leaf", "a chip in the pot rim"),
    "decor-candle": ("a wax drip down one side", "a blackened wick"),
}


def lum(c):
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def recolour(name):
    src = os.path.join(ROOMDIR, name + ".png")
    g = read_png(src)
    cols = sorted({c for row in g.px for c in row if c is not None}, key=lum)
    if not cols:
        raise SystemExit(name + ": empty source")
    # Keep the existing VALUE RELATIONSHIPS: the darkest source colour lands on
    # step 2 and the lightest on step 6 — "2-6 is where sprites live" — with
    # everything between placed in order. A source that used near-black
    # outlines therefore lands on step 2 next to a step-3 body, which is
    # exactly the value separation that replaces the outline.
    lo, hi = lum(cols[0]), lum(cols[-1])
    span = max(1.0, hi - lo)
    table = {}
    for c in cols:
        t = (lum(c) - lo) / span
        table[c] = 2 + int(round(t * 4))
    out = Img(g.w, g.h)
    for y in range(g.h):
        for x in range(g.w):
            c = g.px[y][x]
            if c is not None:
                out.px[y][x] = W(table[c])
    # Rule 4 — dither any flat region over 30x30. Measured per ramp step: if a
    # step's own bounding box exceeds 30x30 and it actually fills that box, mix
    # it with the step below.
    for step in range(2, 7):
        pts = [(x, y) for y in range(out.h) for x in range(out.w)
               if out.px[y][x] == W(step)]
        if len(pts) < 900:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        if (max(xs) - min(xs) + 1) <= 30 or (max(ys) - min(ys) + 1) <= 30:
            continue
        for (x, y) in pts:
            if bth(x, y) >= 0.62:
                out.px[y][x] = W(step - 1)
    contact(out)
    return save(out, name + ".png")


# ══ S9 · the four that vanish when hue is stripped ═════════════════════
# These separated by HUE, so they disappear when hue is removed. Re-separated
# by VALUE: no two adjacent elements share a ramp step. Anything that vanishes
# in greyscale is also invisible to a colourblind user and washed out in
# sunlight, so this is worth doing whichever way the palette ruling goes.
GLYPHS = {
    "candle":   [(3, 1), (3, 2), (2, 3), (4, 3), (2, 4), (4, 4), (3, 5),
                 (2, 7), (5, 7), (2, 8), (5, 8), (2, 9), (5, 9), (2, 10),
                 (5, 10), (1, 11), (6, 11)],
    "book":     [(1, 2), (6, 2), (1, 3), (6, 3), (1, 4), (6, 4), (1, 5),
                 (6, 5), (1, 6), (6, 6), (1, 7), (6, 7), (1, 8), (6, 8),
                 (2, 9), (5, 9), (3, 1), (4, 1), (3, 10), (4, 10)],
    "shelf":    [(1, 2), (2, 2), (3, 2), (4, 2), (5, 2), (6, 2), (1, 5),
                 (2, 5), (3, 5), (4, 5), (5, 5), (6, 5), (1, 8), (2, 8),
                 (3, 8), (4, 8), (5, 8), (6, 8), (0, 2), (0, 8), (7, 2)],
    "pen":      [(6, 1), (5, 2), (4, 3), (3, 4), (2, 5), (1, 6), (1, 7),
                 (2, 7), (6, 2), (5, 3), (4, 4), (3, 5), (2, 6)],
    "undo":     [(2, 3), (1, 4), (2, 5), (3, 4), (4, 4), (5, 5), (5, 6),
                 (4, 7), (3, 7), (2, 7), (1, 4)],
    "close":    [(1, 1), (6, 1), (2, 2), (5, 2), (3, 3), (4, 3), (3, 4),
                 (4, 4), (2, 5), (5, 5), (1, 6), (6, 6)],
}


def icons():
    """UI icons are SOLID SILHOUETTES in one colour, no outline (SPRITES.md
    §8.3 — a 1px rim around a 16px icon eats a quarter of its area). Legibility
    comes from shape. Drawn at step 8 so they clear the step 2-6 room band by
    two full steps in either direction."""
    n = len(GLYPHS)
    g = Img(8 * n, 12)
    for i, (name, pts) in enumerate(sorted(GLYPHS.items())):
        for (x, y) in pts:
            g.put(i * 8 + x, y, W(8))
    return save(g, "icons.png")


def divider():
    """A horizontal rule that must read against both the step-2 panel and the
    step-5 wood: step 7 core with a step 3 shadow one row down."""
    g = Img(96, 3)
    g.hline(0, 95, 0, W(7))
    for x in range(0, 96, 2):
        g.put(x, 1, W(5))
    g.hline(0, 95, 2, W(3))
    return save(g, "divider.png")


CUR = {
    "arrow": [(0, 0), (0, 1), (1, 1), (0, 2), (2, 2), (0, 3), (3, 3), (0, 4),
              (4, 4), (0, 5), (5, 5), (0, 6), (6, 6), (0, 7), (7, 7), (0, 8),
              (6, 8), (0, 9), (1, 9), (4, 9), (5, 9), (2, 10), (3, 10),
              (5, 10), (6, 10), (6, 11), (7, 11), (7, 12)],
    "hand":  [(3, 2), (4, 2), (3, 3), (4, 3), (1, 4), (3, 4), (4, 4), (6, 4),
              (1, 5), (3, 5), (4, 5), (6, 5), (1, 6), (2, 6), (3, 6), (4, 6),
              (5, 6), (6, 6), (1, 7), (2, 7), (3, 7), (4, 7), (5, 7), (6, 7),
              (2, 8), (3, 8), (4, 8), (5, 8), (3, 9), (4, 9)],
    "flame": [(4, 2), (3, 3), (4, 3), (5, 3), (3, 4), (4, 4), (5, 4), (2, 5),
              (3, 5), (4, 5), (5, 5), (6, 5), (2, 6), (3, 6), (4, 6), (5, 6),
              (6, 6), (3, 7), (4, 7), (5, 7), (4, 8)],
}


def cursors():
    """THE ONE EXCEPTION to the no-outline rule. Cursors sit on unknown
    backgrounds and need a 1px rim to survive light and dark. Kept as three
    separate 16x16 files because CSS cursor: url() cannot slice a sheet."""
    out = []
    for name, pts in sorted(CUR.items()):
        g = Img(16, 16)
        for (x, y) in pts:
            g.put(x + 2, y + 1, W(9))
        g.rim_outside(INK)
        out.append(save(g, "cursor-%s.png" % name, allow=(INK,)))
    return out


# ══ M3 · birds past the window — 80x8, 4 frames of 20x8 ════════════════
# wings up / mid / down / mid, with a ONE-FRAME LAG on the second bird so they
# do not beat in unison — which is what makes it read as two animals rather
# than one stamped twice.
WINGS = {
    0: [(-2, -2), (-1, -1), (0, 0), (1, -1), (2, -2)],       # up
    1: [(-2, -1), (-1, 0), (0, 0), (1, 0), (2, -1)],         # mid
    2: [(-2, 1), (-1, 0), (0, 0), (1, 0), (2, 1)],           # down
    3: [(-2, -1), (-1, 0), (0, 0), (1, 0), (2, -1)],         # mid
}


def birds():
    g = Img(80, 8)
    for f in range(4):
        ox = f * 20
        for (bx, by, phase) in ((6, 3, f), (14, 5, (f + 3) % 4)):
            for (dx, dy) in WINGS[phase]:
                g.put(ox + bx + dx, by + dy, C(1))
    return save(g, "birds-anim.png")


# ══ D-2 · the spine sheet, and its second variant set ══════════════════
# the owner ruled 2026-08-07 that the feeling mark shows in the spine colour, so
# the shelf becomes a picture of a year of weather. §M7's symmetry contract
# then extends here: the two answers must be met with IDENTICAL generosity.
#
# The elegant part: the two ramps are the same length and the same value at
# every index. So marking by RAMP rather than by step gives two spines with
# identical brightness and identical saturation that differ ONLY in hue —
# which is exactly what M7 demands — while both stay on-palette.
SPINE_W, SPINE_H = 22, 40


def spine_sheet(ramp, name):
    g = Img(SPINE_W * 5, SPINE_H)
    r = rng(8801)
    for i in range(5):
        step = 3 + (i % 4)
        x0 = i * SPINE_W
        g.rect(x0 + 2, 2, SPINE_W - 4, SPINE_H - 3, ramp[step])
        g.vline(x0 + 2, 2, SPINE_H - 2, ramp[min(9, step + 1)])
        g.vline(x0 + SPINE_W - 3, 2, SPINE_H - 2, ramp[max(0, step - 1)])
        g.hline(x0 + 2, x0 + SPINE_W - 3, 2, ramp[min(9, step + 1)])
        for k in range(2):
            y = 9 + k * 5 + r(3)
            g.hline(x0 + 5, x0 + SPINE_W - 6, y, ramp[min(9, step + 2)])
        g.hline(x0 + 2, x0 + SPINE_W - 3, SPINE_H - 2, ramp[1])
    return save(g, name)


# ══ the outline A/B — the ruling made testable ═════════════════════════
def build_outline_ab():
    """the owner ruled #2c2823 outlines STAY; the handoff says remove them. Rather
    than describe the difference, render it: the same sprite, both ways, side
    by side at 3x. Left = the handoff (value separation only). Right = her
    ruling applied on top of the ramp. The ruling holds for anything that
    ships — this plate exists so it is judged, not imagined."""
    base = read_png(os.path.join(PNGDIR, "bookshelf-empty.png"))
    ringed = Img(base.w, base.h)
    for y in range(base.h):
        for x in range(base.w):
            ringed.px[y][x] = base.px[y][x]
    edge = []
    for y in range(ringed.h):
        for x in range(ringed.w):
            if ringed.px[y][x] is None:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if ringed.get(x + dx, y + dy) is None:
                    edge.append((x, y))
                    break
    for x, y in edge:
        ringed.px[y][x] = INK
    gap, s = 12, 3
    plate = Img((base.w * 2 + gap) * s, base.h * s)
    for k, img in enumerate((base, ringed)):
        ox = k * (base.w + gap) * s
        for y in range(img.h):
            for x in range(img.w):
                c = img.px[y][x]
                if c is None:
                    continue
                for j in range(s):
                    for i in range(s):
                        plate.put(ox + x * s + i, y * s + j, c)
    return save(plate, "_outline-ab.png", allow=(INK,))


# ══ contact sheet ══════════════════════════════════════════════════════
def contact_sheet(files, name="_contact-sheet.png", cols=6, scale=2, pad=8):
    imgs = [(f, read_png(os.path.join(PNGDIR, f))) for f in files]
    cw = max(i.w for _, i in imgs) * scale + pad
    chh = max(i.h for _, i in imgs) * scale + pad
    rows = (len(imgs) + cols - 1) // cols
    g = Img(cw * min(cols, len(imgs)), chh * rows)
    dith(g, 0, g.w - 1, 0, g.h - 1, 0, 1, 0.5)
    for n, (_, im) in enumerate(imgs):
        ox = (n % cols) * cw + pad // 2
        oy = (n // cols) * chh + pad // 2
        for y in range(im.h):
            for x in range(im.w):
                c = im.px[y][x]
                if c is None:
                    continue
                for j in range(scale):
                    for i in range(scale):
                        g.put(ox + x * scale + i, oy + y * scale + j, c)
    return save(g, name)


def main():
    os.makedirs(PNGDIR, exist_ok=True)
    objects = []
    windows()
    bookshelf_empty()
    bookshelf_fill_1()
    bookshelf_fill_2()
    bookshelf_fill_3()
    bg()
    desk_station()
    shelf_station()
    for n in NINE:
        recolour(n)
        objects.append(n + ".png")
    icons()
    divider()
    cursors()
    birds()
    spine_sheet(WARM, "spine.png")
    spine_sheet(COOL, "spine-marked.png")
    build_outline_ab()
    contact_sheet(objects + ["bookshelf-empty.png", "bookshelf-fill-1.png",
                             "bookshelf-fill-2.png", "bookshelf-fill-3.png",
                             "decor-window.png", "decor-window-dusk.png",
                             "decor-window-night.png",
                             "decor-window-frame.png", "spine.png",
                             "spine-marked.png", "birds-anim.png",
                             "icons.png", "divider.png"])
    contact_sheet(["bg.png", "desk-station.png", "shelf-station.png"],
                  name="_contact-plates.png", cols=1, scale=1)
    print("built %d files in %s" % (len(os.listdir(PNGDIR)), PNGDIR))


if __name__ == "__main__":
    main()
