#!/usr/bin/env python3
"""
light.py — the ROOM-HANDOFF.md §04 light pass, offline.

Rung A of Phase 26.98. This NEVER touches the app: it reads plates out of
png/, applies the §04 model, and writes lit frames to lit/. It exists for two
reasons, in this order:

  1. Rule 2 says a sprite bakes only ONE step of lighting and the renderer adds
     the rest. So an unlit plate is not a picture of the room — it is a picture
     of the room's albedo. Judging the art without this pass judges it wrong.
  2. It is the artifact the palette ruling is made from (26.98 SC-2), and it
     runs the CI luminance assertion (SC-1) on its own frames, so that check
     needs no browser at all.

THE MODEL, verbatim from §04:

    step  = 2 + round(localLuminance * 4)     # sprite keeps its own value
    beam  = insideWedge(x,y) ? edgeFalloff * alongFalloff : 0
    flame = max(0, 1 - dist/r)^2              # radial ONLY at the candle
    lit   = step + AMBIENT[band] + beam*BEAM[band] + flame*4.2
    n     = floor(lit + bayer8[y&7][x&7])     # the dither IS the gradient
    out   = RAMP[clamp(n, 0, 9)]

Two things the handoff leaves to the implementation, both named here rather
than buried: the along-beam falloff curve (§04 gives the wedge's half-width but
not its decay), and the flame radius. Both are tuned against the CI assertion,
which is exactly what §04 says they are for — its author's own day beam read
too weakly and their night render had ZERO pixels above 0.42.
"""

import math
import os

import build_handoff as B

ROOT = os.path.dirname(os.path.abspath(__file__))
LITDIR = os.path.join(ROOT, "lit")

# ── the two arms (26.98-03) ───────────────────────────────────────────
# The pass reads a plate set out of a SOURCE directory and writes every frame
# it makes into a DESTINATION directory. Those are two different directories,
# always, and the guard below is what makes "always" true rather than intended.
#
# ⛔ WHY THE GUARD EXISTS. compose() used to write its intermediate composite
# back into B.PNGDIR — the very directory it had just read. That is harmless
# while the source is the handoff's own scratch set and it is CORRUPTION the
# moment the source is assets/room/, which belongs to the sprite generator and
# is the control arm's only input. A pass that writes into the set it read
# cannot be re-run and cannot be trusted to have measured what it claims.
SRCDIR = B.PNGDIR                                    # the new-ramp plates
ROOMDIR = B.ROOMDIR                                  # the SHIPPED sprites, READ-ONLY
CONTROLDIR = os.path.join(ROOT, "lit-control")       # the control arm's frames


def _paths(srcdir, dstdir):
    """Resolve both directories to absolute real paths and refuse the two ways
    this pass could damage art it does not own.

    Returns the pair. Raises ValueError rather than returning a flag: a caller
    can ignore a flag, and a guard that can be ignored is not a guard."""
    src = os.path.realpath(srcdir)
    dst = os.path.realpath(dstdir)
    handoff = os.path.realpath(ROOT)
    if dst == src or dst.startswith(src + os.sep):
        raise ValueError(
            "the destination %r is inside the source %r. The pass would write "
            "its frames into the plate set it just read, which corrupts the "
            "source and makes the run unrepeatable. Give it a destination "
            "outside the source." % (dst, src))
    if dst != handoff and not dst.startswith(handoff + os.sep):
        raise ValueError(
            "the destination %r is outside %r. This pass emits only into the "
            "handoff directory; assets/room/ belongs to the sprite generator "
            "and ~/StudyRoom belongs to the owner, and neither is a place for "
            "generated frames." % (dst, handoff))
    return src, dst

# Six numbers total, per §04.
AMBIENT = {"day": 0.1, "dusk": -1.2, "night": -2.2}
BEAM = {"day": 3.4, "dusk": 1.8, "night": 0.55}

# The wedge: aperture at the window's lower-left, 38° from vertical.
APERTURE = (150.0, 126.0)
THETA = math.radians(38.0)
DIRX, DIRY = math.sin(THETA), math.cos(THETA)
HALF0, HALFK = 42.0, 0.26
ALONG = 150.0          # beam length; tuned against the CI assertion
EDGE_GAIN = 1.6        # >1 gives the wedge a full-strength plateau
ALONG_GAIN = 2.0       # >1 keeps the beam hot until it decays quickly

# The candle at room coords 300,94 (10x22) — radial, and ONLY here.
FLAME_XY = (305.0, 105.0)
FLAME_R = 52.0
# The desk zoom's own candle: standing ON the desktop, inside the x12-210 band
# S6 leaves clear for exactly this.
DESK_FLAME_XY = (168.0, 146.0)


def luminance(c):
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255.0


# ⚠ FINDING — §04's `step = 2 + round(localLuminance * 4)` is WRONG for
# ramp-native art, and it is wrong in the direction that makes the room look
# broken. The room ramp is perceptually spaced, so its dark end is bunched:
# feeding a ramp colour's own luminance back through that formula maps TEN
# distinct steps onto FOUR (0,1,2 -> 2 · 3,4,5 -> 3 · 6,7 -> 4 · 8,9 -> 5).
# Every wall painted at step 2 and every floor painted at step 5 come out one
# step apart instead of three, so the whole frame collapses into shadow and no
# beam can rescue it. Measured before the fix: day 86.4/13.6/0.1 against a
# 60/30/10 target, with lit essentially ZERO — which is exactly the symptom
# §04's own author reported ("my day beam reads too weakly, my night render has
# zero pixels above 0.42") and attributed to tuning.
#
# It is not tuning. "The sprite keeps its own value" is the intent, and for art
# that is already painted ON the ramp the sprite's own value IS its ramp index.
# The luminance round-trip is only needed for source art that was never on the
# ramp — so it stays, as the fallback.
# ⚠ AND THE INDEX ALONE IS NOT ENOUGH — IT MUST CARRY WHICH RAMP IT CAME FROM.
# The predecessor of this table recorded only the index, then the output line
# wrote B.WARM[n] unconditionally. Cool source pixels were read and thrown
# away, so every pixel of the window plate came out a warm hex and the night
# sky was warm — contradicting the ONE rule §03 states as absolute ("the window
# is the only exception to the warm ramp, because a night sky cannot be warm").
#
# So the table maps an RGB triple to the PAIR (ramp name, index), where ramp
# name is the string "warm" or "cool". Warm is inserted first and cool only
# fills gaps, which matters for exactly one entry: index 0 is the SAME hex
# (0x0E,0x0A,0x16) on both ramps — the shared darkest step — so its identity is
# arbitrary and defaulting it to warm changes no output byte.
RAMP_ID = {c: ("warm", i) for i, c in enumerate(B.WARM)}
for _i, _c in enumerate(B.COOL):
    RAMP_ID.setdefault(_c, ("cool", _i))


def source_palette(srcdir, names):
    """DISCOVER the palette the source art is painted in, by reading it.

    ⚠ THIS IS WHAT MAKES THE CONTROL ARM A CONTROL. Returns None when every
    colour in the source set is already on one of the two ramps — the handoff
    plates — so that arm runs down the RAMP_ID path unchanged, byte for byte.

    For art that is NOT on a ramp it returns that art's own colours, ordered
    darkest to lightest, so the pass lights the room WITHIN THE COLOURS IT WAS
    PAINTED IN. Without this the documented luminance round-trip would emit
    WARM RAMP hexes for shipped-palette input — the control arm would come out
    in the new colours and the side-by-side would be two pictures of the same
    palette. A control that renders the treatment is not a control.

    The exempt colours are removed first: they never take a ramp index because
    they never take the light pass at all (DRAW_AFTER_LIGHT).

    The ordering is by luminance because the shipped palette is a ROLE sheet
    (SPRITES.md §2 — paper, wood, ink, stone, green), not a ramp. It has no
    intrinsic order, so the pass gives it the only order the art itself
    supplies. tests/test_room_light.py pins the result BY VALUE so this
    discovery can never drift unnoticed."""
    seen = set()
    for name in names:
        path = os.path.join(srcdir, name + ".png")
        if not os.path.exists(path):
            continue
        im = B.read_png(path)
        for row in im.px:
            for c in row:
                if c is not None:
                    seen.add(c)
    seen -= set(DRAW_AFTER_LIGHT)
    if seen <= B.RAMP:
        return None
    return sorted(seen, key=luminance)


def base_ramp_and_step(c, palette=None):
    """Returns the PAIR (ramp LIST, step) — the actual colours to emit into,
    not a name, so a caller cannot pick the wrong ramp for a right index.

    Resolution order, and the order is the argument:
      1. the SOURCE ART's own discovered palette, when it has one
      2. the two ramps, by exact hex — R-1 (2026-08-23): "Use the paint's
         given shade". A ramp-native pixel's own value IS its index.
      3. the luminance round-trip, as the documented last resort for a colour
         on no known palette at all. ⛔ Do not delete it: the STRICT/FALLBACK
         fence test drives exactly this path."""
    if palette is not None:
        try:
            return (palette, palette.index(c))
        except ValueError:
            pass
    hit = RAMP_ID.get(c)
    if hit is not None:
        return ((B.COOL if hit[0] == "cool" else B.WARM), hit[1])
    return (B.WARM, 2 + int(round(luminance(c) * 4)))


# ── the draw-after-light stage (ROOM-HANDOFF §02, D-1(b)) ──────────────
# the owner answered D-1 on 2026-08-07 with (b): "a small exempt set draws after
# the light pass, keeping coral literal", and the answer is explicit that this
# is a RENDERER requirement, not an art note — "build §04 with that stage from
# the first commit — retrofitting it means re-architecting the compositor".
#
# The rest of her answer is the reason the set below is written out longhand
# instead of being derived from anything: "the exempt set stays small and is
# named explicitly in code, NEVER INFERRED: an unnamed exemption is how 'no
# sprite carries a colour of its own' quietly stops being true."
#
# ⛔ SO DO NOT REPLACE THIS WITH A COMPREHENSION over B.RAMP, over a palette
# file, or over anything else. A set that is computed is a set nobody has read.
# Two members, each a named constant, each with the ruling that put it here.

# #e8503a — the coral accent. Named so the exemption is legible at the point of
# use; D-1(b) IS the answer that keeps this colour literal instead of folding it
# into the ramp's top two steps.
ACCENT = (0xE8, 0x50, 0x3A)

DRAW_AFTER_LIGHT = frozenset((
    B.INK,    # #2c2823 — the outline ink. Ruled 2026-08-07: outlines STAY
              # (SPRITES.md §2, unamended; the #4a3a2c proposal was rejected
              # twice). It is on neither ramp, so without this stage the pass
              # converts her ruling into a ramp step.
    ACCENT,   # #e8503a — coral, per D-1(b) above.
))

# The two fence modes. Named constants rather than bare strings so a typo is a
# NameError at import instead of a silently disabled fence.
STRICT = "strict"      # ramp-native art: an unknown colour is an ERROR
FALLBACK = "fallback"  # art that was never on a ramp: the luminance round-trip


class UnnamedExemption(Exception):
    """Raised in STRICT mode by a source pixel that is on neither ramp and is
    not a named member of DRAW_AFTER_LIGHT.

    It is an EXCEPTION rather than a sentinel return on purpose: a caller can
    ignore a return value, and an exemption that can be ignored is an exemption
    that is inferred."""


def _fence(fence):
    if fence not in (STRICT, FALLBACK):
        raise ValueError(
            "fence mode must be light.STRICT or light.FALLBACK, not %r — a "
            "mode this function does not recognise must not silently behave "
            "like the permissive one" % (fence,))
    return fence


# ── R-3: THE PLATES SHE RULES FROM CARRY THE OUTLINES ─────────────────
# Ruled 2026-08-23 and routed to this plan by name. Reported, NOT quoted: she
# was told it changes every measurement taken so far and chose it anyway, on
# the reasoning that the pictures she rules on should look like the room she
# actually has. ⚠ That sentence is the ruling as reported. It is not her words
# and must never be re-quoted as them.
#
# THE MEASURED FACT THAT MAKES THIS NECESSARY. The shipped sprites carry
# #2c2823 line work — 720 pixels on the bookshelf alone. The handoff plates
# carry ZERO, because build_handoff.py was written before the draw-after-light
# stage existed and #2c2823 is off-ramp (its own header records this as
# deviation (a)). So without this stage the left-hand room has outlines, the
# right-hand room has none, and she is asked to rule on colour while looking at
# a difference that is not colour.
#
# ⚠ IT IS APPLIED IDENTICALLY TO BOTH ARMS AND IT NO-OPS ON ONE OF THEM. The
# rule is "every composited object carries an outline"; a plate that already
# carries the ink is returned untouched. That keeps the two arms one code path
# with one decision rule, so the only difference between them stays which
# directory the plates came from — which is the whole design of the control.
#
# The rim is drawn INSIDE the silhouette, not grown outward. Growing outward
# (Img.rim_outside) is the CURSOR exception and would move every object's
# footprint by a pixel, which would change the pinned §05 coordinates in
# effect if not in name.
def outlined(sprite):
    """Return `sprite` with a 1px #2c2823 rim on its silhouette — or `sprite`
    itself, unchanged, if it already carries the ink."""
    for row in sprite.px:
        if B.INK in row:
            return sprite
    out = B.Img(sprite.w, sprite.h)
    for y in range(sprite.h):
        for x in range(sprite.w):
            c = sprite.px[y][x]
            out.px[y][x] = c
            if c is None:
                continue
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < sprite.w and 0 <= ny < sprite.h):
                    out.px[y][x] = B.INK       # the image edge is a silhouette edge
                    break
                if sprite.px[ny][nx] is None:
                    out.px[y][x] = B.INK
                    break
    return out


def wedge(x, y):
    """Returns edgeFalloff * alongFalloff, or 0 outside the wedge."""
    dx, dy = x - APERTURE[0], y - APERTURE[1]
    u = dx * DIRX + dy * DIRY
    if u < 0:
        # Reject u < 0 or the beam leaks backwards through the wall. This one
        # line is the difference between a shaft and a glow.
        return 0.0
    v = abs(dx * DIRY - dy * DIRX)
    half = HALF0 + u * HALFK
    if v >= half:
        return 0.0
    # §04 pins the wedge's half-width but not its falloff PROFILE, and the
    # profile is what decides whether the frame reads as "lights on" or as
    # uniform dimming. A plain linear taper spreads a lot of half-strength
    # light, which lands as `mid` — measured at 37.8% against a 30% target,
    # i.e. exactly the failure §04 describes. The gains below give the beam a
    # plateau and a sharp rim instead: mostly full inside, nothing outside.
    # Tuned against the CI assertion, which is what §04 says it is for.
    edge = min(1.0, (1.0 - v / half) * EDGE_GAIN)
    along = max(0.0, min(1.0, (1.0 - u / ALONG) * ALONG_GAIN))
    return edge * along


def flame(x, y, at=None):
    """Radial, and ONLY at the candle. `at` is required per-image because the
    candle is at a different place in every frame: (305,105) in the room, but
    on the DESKTOP in the desk zoom. Defaulting it to the room's coordinate is
    how the glow ended up hanging on the desk plate's back wall — a light
    source with no object under it, which reads as a rendering fault."""
    cx, cy = at or FLAME_XY
    d = math.hypot(x - cx, y - cy)
    if d >= FLAME_R:
        return 0.0
    t = 1.0 - d / FLAME_R
    return t * t


def light(src, band, use_wedge=True, flame_at=None, scale=2,
          fence=STRICT, label=None, palette=None):
    """Run the pass at 2x the sprite grid. At 1x the Bayer pattern reads as a
    coarse checkerboard; at 2x it reads as texture. That is the whole
    difference between 'dithered' and 'broken', so the scale is not optional.

    `fence` is STRICT for ramp-native art (the handoff plates, which main()
    below runs) and FALLBACK for art that was never painted on a ramp. ⛔ The
    control arm that reads the SHIPPED 13-hex sprite set must run in FALLBACK —
    every one of those hexes is off-ramp, and "tightening" that call site into
    STRICT turns a documented fallback into a crash.

    `palette` is the source art's own colours, discovered by source_palette()
    and passed straight through. None means the art is ramp-native. It is NOT
    a switch between two arms: it is derived from the plates, so the only thing
    a caller changes between the two arms is which directory it read."""
    _fence(fence)
    out = B.Img(src.w * scale, src.h * scale)
    amb = AMBIENT[band]
    bk = BEAM[band]
    where = label or "the %dx%d source image" % (src.w, src.h)
    for Y in range(out.h):
        sy = Y // scale
        for X in range(out.w):
            sx = X // scale
            c = src.px[sy][sx]
            if c is None:
                continue
            if c in DRAW_AFTER_LIGHT:
                # THE DRAW-AFTER-LIGHT STAGE. The output pixel IS the source
                # colour: no ramp lookup, no ambient, no beam, no flame, no
                # Bayer. That is the entire meaning of "draws after the light
                # pass" — anything less and the colour is not literal.
                out.px[Y][X] = c
                continue
            if fence == STRICT and c not in RAMP_ID:
                raise UnnamedExemption(
                    "%s carries the colour (%d, %d, %d) / #%02x%02x%02x at "
                    "sprite pixel (%d, %d), band %r. It is on neither ramp and "
                    "is not a named member of DRAW_AFTER_LIGHT. Name it in the "
                    "exempt set or take it out of the art — an unnamed "
                    "exemption is how 'no sprite carries a colour of its own' "
                    "quietly stops being true (ROOM-HANDOFF §02, D-1(b))."
                    % ((where,) + tuple(c) + tuple(c) + (sx, sy, band)))
            ramp, step = base_ramp_and_step(c, palette)
            # Wedge and flame are evaluated in SPRITE space (the geometry in
            # §04 is given in 384x216 coordinates), then sampled at 2x.
            b = wedge(sx, sy) if use_wedge else 0.0
            f = flame(sx, sy, flame_at) if flame_at else 0.0
            val = step + amb + b * bk + f * 4.2
            n = int(math.floor(val + B.BAYER8[Y & 7][X & 7] / 64.0))
            # The OUTPUT ramp is the one the SOURCE pixel came from. The clamp
            # is to that ramp's own length: for both 10-step ramps that is the
            # unchanged [0, 9], and for a discovered source palette it is the
            # number of steps that palette actually has. A palette does not get
            # steps it was never painted with.
            top = len(ramp) - 1
            out.px[Y][X] = ramp[0 if n < 0 else (top if n > top else n)]
    return out


# ── the CI assertion (§04) ─────────────────────────────────────────────
# Compute the shadow / mid / lit split at Rec.709 thresholds 0.20 and 0.42 and
# assert day ~= 60/30/10 (+-5), night ~= 86/11/3 (+-5), lit NOT zero.
# ⚠ "night" IS NO LONGER IN THIS TABLE. The owner ruled on 2026-08-24 to CHANGE
# WHAT NIGHT SHOULD BE rather than draw the lamplight art that would have made
# 86 / 11 / 3 reachable. The replacement is DERIVED, not chosen, and it lives
# below in assert_night(). §04's original triple is kept beside it, in the
# record, so what was given up stays visible.
TARGETS = {"day": (60.0, 30.0, 10.0)}
TOL = 5.0

# ⛔ §04'S ORIGINAL NIGHT TARGET. RETAINED DELIBERATELY. Do not delete it and
# do not "clean it up" as dead code — it is the thing that was given up, and a
# record of a lowered bar that no longer shows the old bar is not a record.
NIGHT_TARGET_ORIGINAL = (86.0, 11.0, 3.0)
# The best night lit fraction reachable anywhere the day frame is still green,
# measured in 26.98-02 over a spanning sweep of the only two values §04 leaves
# to the implementation (the along-beam falloff and the flame radius).
NIGHT_LIT_CEILING_MEASURED = 0.97

# ⛔ THE NIGHT LIT BAND CARRIES ITS OWN TOLERANCE, AND THIS IS THE ONLY PLACE
# IN THE REPO WHERE THAT NUMBER IS WRITTEN DOWN.
#
# THE ARITHMETIC, because it is the whole argument: the night lit target is
# 3.0%. Applying the shared TOL of 5.0 to it admits [-2.0, 8.0], i.e. every
# value from nothing at all up to nearly three times the target. The separate
# "lit must NOT be 0" clause below then clips the bottom at exactly zero. Put
# together, the band as originally written can only fail at EXACTLY zero or
# ABOVE eight, and passes everything in between. Verdicts measured across the
# range at the phase baseline commit: -1 FAIL · 0 FAIL · 0.0001 PASS ·
# 0.09 PASS · 3 PASS · 8 PASS · 8.0001 FAIL.
#
# That is not a tolerance, it is a rubber stamp — and it stamps the very defect
# §04's own author reported ("my night render has zero pixels above 0.42"),
# because a render that has almost none still lands somewhere above zero. The
# frame committed at the baseline reads 0.1% lit and printed OK.
#
# 1.5 admits a band of exactly plus-or-minus half the target around 3.0 and
# nothing else. tests/test_room_light.py IMPORTS this constant rather than
# restating it; two instruments over the same data that disagree is how the
# wrong one gets read on every run.
NIGHT_LIT_TOL = 1.5

# ── the night target, AMENDED — THE OWNER, 2026-08-24 ────────────────────
# > **"Change what night should be."**
#
# She was told the ceiling is STRUCTURAL, not tuning, and the arithmetic is
# reproducible from this file alone. At night AMBIENT is -2.2, BEAM is 0.55 and
# the flame contributes at most 4.2, so the largest lift any pixel can receive
# is +2.55 ramp steps. The first warm step whose Rec.709 luminance clears the
# 0.42 "lit" threshold is index 7 (0.526); index 6 is 0.396 and misses.
# Therefore NOTHING PAINTED BELOW SOURCE STEP 5 CAN EVER BE LIT AT NIGHT, at
# any flame radius — 5 + 2.55 = 7.55 lands on 7, and 4 + 2.55 = 6.55 lands on
# 6. Almost nothing in this room is painted at step 5 or above near the candle.
# That is why the measured ceiling is 0.97 against a required 1.5.
#
# She was offered the alternative — DRAW REAL LAMPLIGHT ART near the candle, a
# genuine pool at steps 7-9 — and DECLINED it: new art sits above her cut line
# this close to the freeze.
#
# ⛔ SO THE TARGET MOVED. THAT IS THE MOMENT THIS PROJECT'S SIGNATURE DEFECT
# NORMALLY HAPPENS, AND THESE ARE THE CONDITIONS IT DID NOT:
#
#   1. THE TOLERANCE DID NOT MOVE. NIGHT_LIT_TOL is still 1.5 and it is still
#      load-bearing — it is now the CEILING on how much the candle may lift,
#      because a night room that comes out 5% lit is not a night room either.
#   2. THE NEW TARGET IS NOT TODAY'S MEASUREMENT. A target reverse-engineered
#      from the current frame can never fail, which is the same bug wearing a
#      new coat. The target below is the AMBIENT-ONLY FLOOR: the split this
#      exact frame would have with the beam and the flame switched OFF. It is a
#      property of the ART and one constant, computed without ever reading the
#      emitted frame.
#   3. THE ASSERTION IS DIRECTIONAL AND STRICT. Light may only remove shadow
#      and only add mid and lit, so the emitted frame must be measurably
#      brighter than its own floor IN EVERY BAND. A pass whose beam or flame
#      stops working lands exactly ON the floor and fails on a strict >.
#   4. §04's 86 / 11 / 3 IS STILL IN THIS FILE, above, as what §04 intended for
#      a room WITH drawn light fixtures. The three Golden Idol scenes it was
#      measured from all have them; this room has a 10x22 candle sprite.


def ambient_floor(room, band, fence=STRICT, palette=None):
    """The split the frame would have with AMBIENT alone — no beam, no flame.

    ⚠ THIS IS THE DERIVATION, AND IT IS WHY THE GATE IS NOT VACUOUS. It is the
    same pass with the light taken out, so it depends on the art and on one
    constant and on nothing that the beam or the candle does. Reverse-
    engineering a target from the answer is the failure this replaces."""
    return split(light(room, band, use_wedge=False, flame_at=None,
                       fence=fence, palette=palette,
                       label="the %s ambient floor" % band))


def assert_night(img, floor, label):
    """Night, against its own ambient floor. Prints both rows so a reader sees
    what the light actually did rather than a bare verdict."""
    got = split(img)
    darker = got[0] <= floor[0]
    lifted_mid = got[1] > floor[1]
    lifted_lit = got[2] > floor[2]
    not_daylight = got[2] <= floor[2] + NIGHT_LIT_TOL
    ok = darker and lifted_mid and lifted_lit and not_daylight
    print("    %-26s %5.1f / %5.1f / %5.1f   floor %5.1f / %5.1f / %5.1f  %s"
          % ((label,) + got + floor + ("OK" if ok else "FAIL",)))
    return ok


def split(img):
    sh = mid = lit = n = 0
    for row in img.px:
        for c in row:
            if c is None:
                continue
            n += 1
            L = luminance(c)
            if L < 0.20:
                sh += 1
            elif L < 0.42:
                mid += 1
            else:
                lit += 1
    if n == 0:
        return (0.0, 0.0, 0.0)
    return (sh * 100.0 / n, mid * 100.0 / n, lit * 100.0 / n)


def assert_split(img, band, label):
    got = split(img)
    if band not in TARGETS:
        print("    %-26s %5.1f / %5.1f / %5.1f   (no target)" % ((label,) + got))
        return True
    want = TARGETS[band]
    # PER-BAND tolerance, selected here rather than applying one number to
    # three bands. Five bands keep the shared TOL; the night lit band alone
    # gets NIGHT_LIT_TOL, for the reason written out beside its definition.
    tols = (TOL, TOL, NIGHT_LIT_TOL) if band == "night" else (TOL, TOL, TOL)
    ok = all(abs(g - w) <= t for g, w, t in zip(got, want, tols))
    # "lit must NOT be 0" — called out separately because a frame can drift
    # inside tolerance on the first two bands while the third collapses, and a
    # dark room with no lit pixels is the exact defect this assertion exists
    # to catch.
    if got[2] <= 0.0:
        ok = False
    print("    %-26s %5.1f / %5.1f / %5.1f   want %4.0f / %4.0f / %4.0f  %s"
          % ((label,) + got + want + ("OK" if ok else "FAIL",)))
    return ok


# ── the composite ─────────────────────────────────────────────────────
# §04's reference measurements are taken from RENDERED FRAMES — rooms with
# their furniture in them, not bare background plates. Measuring the split on
# bg.png alone is measuring the wrong image: the plate is ~77% wall by area, so
# it reads as shadow no matter how good the beam is. The pinned coordinates are
# the ones the renderer already uses (ROOM-HANDOFF.md §05), which is the whole
# reason this can be composited offline at all.
#
# ⚠ THE LIST IS NINE, NOT TEN, AND IT MUST STAY NINE. It carried a tenth entry,
# ("journal", 180, 138) — the reading book. 26.91-04 RETIRED that object whole
# (D-06, 2026-08-07): its button was removed from index.html between the album
# and the desk, and the bench now renders EMPTY on purpose ("that empty bench IS
# the design"). Compositing it here put furniture in the frame that the room
# does not have, in exactly the frames the owner rules the palette from. Do not
# "restore" it. assets/room/journal.png and png/journal.png stay on disk —
# deleting art is a separate decision and the file is harmless once nothing
# blits it.
#
# The nine coordinates below are byte-identical to the nine room-object style
# attributes in index.html and must remain so; they are the pinned coordinates
# of §05 and their stability is the only reason an offline composite is
# possible at all.
PLACED = [("bookshelf", 16, 56), ("decor-window", 124, 44), ("bench", 124, 152),
          ("album", 140, 140), ("chair", 250, 90),
          ("desk", 216, 112), ("notebook", 264, 94), ("decor-candle", 300, 94),
          ("decor-plant", 348, 124)]

# ⛔ THE WINDOW IS THE ONE OBJECT WITH A PER-BAND PLATE, AND ALL THREE MUST BE
# USED. §05 S3 built the dusk and night windows ("recolour only, never move a
# pixel") and the compositor ignored them: it blitted decor-window.png — the
# DAY window, conifers and all — into the night frame too.
#
# ⚠ THIS WAS PUT TO THE OWNER ON 2026-08-23 WITH THE COST STATED PLAINLY: swapping
# the real night window in makes the night frame measurably DARKER and further
# from its §04 target, and leaving the day window is the flattering choice.
# SHE RULED: "Use the real night window." So the frames tell the truth and the
# gate stays red on a true number. ⛔ Do not "restore" the day plate here to
# make a band go green — that is the ruling being quietly reversed.
WINDOW_PLATE = {"day": "decor-window",
                "dusk": "decor-window-dusk",
                "night": "decor-window-night"}


# The frame the §04 gate reads, and the size both arms must land at. Pinned
# here rather than derived, so a source set at the wrong resolution fails on a
# number instead of quietly producing a smaller picture.
FRAME_W, FRAME_H = 768, 432


def plate_names(band):
    """Every plate name compose() will read for `band`, window swap applied."""
    return ["bg"] + [WINDOW_PLATE[band] if n == "decor-window" else n
                     for n, _x, _y in PLACED]


def assert_same_dimensions(a_dir, b_dir, names):
    """⚠ ASSERTED, NOT TRUSTED. The control arm composites at the SAME nine
    pinned §05 coordinates as the new-ramp arm, and that is only legitimate if
    the two plate sets are the same size sprite for sprite. 26.98-RESEARCH's
    pitfall P-4 claimed they are NOT; measurement at plan time said they are.
    Rather than believe either, this fails loudly with BOTH dimensions named."""
    bad = []
    for name in names:
        pa = os.path.join(a_dir, name + ".png")
        pb = os.path.join(b_dir, name + ".png")
        if not (os.path.exists(pa) and os.path.exists(pb)):
            continue
        ia, ib = B.read_png(pa), B.read_png(pb)
        if (ia.w, ia.h) != (ib.w, ib.h):
            bad.append("%s: %dx%d in %s but %dx%d in %s"
                       % (name, ia.w, ia.h, a_dir, ib.w, ib.h, b_dir))
    if bad:
        raise ValueError(
            "the two plate sets disagree on sprite size, so compositing both "
            "at the same pinned coordinates would put the two arms in "
            "different rooms:\n  " + "\n  ".join(bad))


def compose(band, srcdir=None, dstdir=None):
    """Composite the room for `band` from `srcdir`, writing the intermediate
    into `dstdir` — NEVER back into `srcdir` (see _paths)."""
    src, dst = _paths(srcdir or SRCDIR, dstdir or LITDIR)
    room = B.read_png(os.path.join(src, "bg.png"))
    for name, x, y in PLACED:
        if name == "decor-window":
            name = WINDOW_PLATE[band]
        p = os.path.join(src, name + ".png")
        if not os.path.exists(p):
            continue
        # R-3: every composited object carries its outline. No-ops on a plate
        # that already has one, which is why both arms run the same line.
        room.blit(outlined(B.read_png(p)), x, y)
    B.write_png(room, os.path.join(dst, "_room-composite-%s.png" % band))
    if band == "day":
        # The pre-per-band artifact kept under its original name rather than
        # deleted: _room-composite.png always held the DAY-window composite.
        B.write_png(room, os.path.join(dst, "_room-composite.png"))
    return room


def run(srcdir, dstdir, fence, arm):
    """One arm, end to end. The ONLY thing that differs between the two arms is
    `srcdir` — `fence` follows from what the art is painted in (ramp-native art
    is STRICT; art that was never on a ramp has no strict reading), and the
    palette is DISCOVERED from the plates rather than chosen by the caller."""
    src, dst = _paths(srcdir, dstdir)
    os.makedirs(dst, exist_ok=True)
    palette = source_palette(src, sorted({n for b in ("day", "dusk", "night")
                                          for n in plate_names(b)}))
    print("\n  %s" % arm)
    print("  source %s" % src)
    print("  palette: %s\n" % ("the two ramps (art is ramp-native)"
                                if palette is None else
                                "%d steps discovered in the source art"
                                % len(palette)))
    ok = True
    for band in ("day", "dusk", "night"):
        room = compose(band, src, dst)
        im = light(room, band, flame_at=FLAME_XY, fence=fence, palette=palette,
                   label="the room composite (%s window)" % WINDOW_PLATE[band])
        if (im.w, im.h) != (FRAME_W, FRAME_H):
            raise ValueError("%s band %s emitted %dx%d; the room frame is "
                             "pinned at %dx%d"
                             % (arm, band, im.w, im.h, FRAME_W, FRAME_H))
        B.write_png(im, os.path.join(dst, "bg-%s.png" % band))
        if band == "night":
            ok &= assert_night(im, ambient_floor(room, band, fence, palette),
                               "bg / night")
        else:
            ok &= assert_split(im, band, "bg / %s" % band)
    # The zoom plates are interiors — no window in frame, so no wedge. The desk
    # keeps the candle (it sits on that desk); the shelf has neither.
    for name, flame_at in (("desk-station", DESK_FLAME_XY),
                           ("shelf-station", None)):
        p = os.path.join(src, name + ".png")
        if not os.path.exists(p):
            continue
        plate = B.read_png(p)
        # ⚠ THE ONE REAL DIMENSIONAL DIFFERENCE between the two sets, and it is
        # MEASURED rather than assumed: the shipped station plates are 768x432
        # and the handoff ones 384x216, so the scale that lands both at the
        # pinned frame size is not the same number.
        if FRAME_W % plate.w or FRAME_H % plate.h:
            raise ValueError(
                "%s is %dx%d, which does not divide the pinned frame %dx%d — "
                "no integer scale lands it at frame size and a fractional one "
                "would resample pixel art"
                % (name, plate.w, plate.h, FRAME_W, FRAME_H))
        st = FRAME_W // plate.w
        if FRAME_H // plate.h != st:
            raise ValueError("%s scales %dx horizontally but %dx vertically"
                             % (name, st, FRAME_H // plate.h))
        for band in ("day", "night"):
            im = light(plate, band, use_wedge=False, flame_at=flame_at,
                       scale=st, fence=fence, palette=palette,
                       label="%s.png" % name)
            B.write_png(im, os.path.join(dst, "%s-%s.png" % (name, band)))
            assert_split(im, "-", "%s / %s" % (name, band))
    return ok


# ── the sheet she rules from ──────────────────────────────────────────
# A 3x5 uppercase font, written out because this repo has no font and §3 of
# SPRITES.md forbids text glyphs INSIDE a sprite. This is not a sprite: it is
# the label on a contact sheet, and an unlabelled contact sheet is a pile of
# pictures. Nothing here is ever composited into the room.
FONT = {
    "A": ("010", "101", "111", "101", "101"),
    "B": ("110", "101", "110", "101", "110"),
    "C": ("011", "100", "100", "100", "011"),
    "D": ("110", "101", "101", "101", "110"),
    "E": ("111", "100", "110", "100", "111"),
    "F": ("111", "100", "110", "100", "100"),
    "G": ("011", "100", "101", "101", "011"),
    "H": ("101", "101", "111", "101", "101"),
    "I": ("111", "010", "010", "010", "111"),
    "J": ("001", "001", "001", "101", "010"),
    "K": ("101", "101", "110", "101", "101"),
    "L": ("100", "100", "100", "100", "111"),
    "M": ("101", "111", "111", "101", "101"),
    "N": ("101", "111", "111", "111", "101"),
    "O": ("010", "101", "101", "101", "010"),
    "P": ("110", "101", "110", "100", "100"),
    "Q": ("010", "101", "101", "111", "011"),
    "R": ("110", "101", "110", "101", "101"),
    "S": ("011", "100", "010", "001", "110"),
    "T": ("111", "010", "010", "010", "010"),
    "U": ("101", "101", "101", "101", "111"),
    "V": ("101", "101", "101", "101", "010"),
    "W": ("101", "101", "111", "111", "101"),
    "X": ("101", "101", "010", "101", "101"),
    "Y": ("101", "101", "010", "010", "010"),
    "Z": ("111", "001", "010", "100", "111"),
    " ": ("000", "000", "000", "000", "000"),
}
GLYPH_SCALE = 3
CHAR_W = 4 * GLYPH_SCALE          # 3 pixels of glyph + 1 of tracking

# ⚠ NEUTRAL BY CONSTRUCTION. The sheet's own background and text are a plain
# grey and a plain white — on NEITHER palette. A sheet painted in one of the
# two candidate palettes flatters that one, and she would be ruling partly on
# the mount.
SHEET_BG = (0x60, 0x60, 0x60)
SHEET_FG = (0xFF, 0xFF, 0xFF)


def draw_text(img, text, x, y, colour=SHEET_FG):
    for ch in text.upper():
        rows = FONT.get(ch, FONT[" "])
        for gy, row in enumerate(rows):
            for gx, bit in enumerate(row):
                if bit == "1":
                    for dy in range(GLYPH_SCALE):
                        for dx in range(GLYPH_SCALE):
                            img.put(x + gx * GLYPH_SCALE + dx,
                                    y + gy * GLYPH_SCALE + dy, colour)
        x += CHAR_W
    return x


def text_width(text):
    return len(text) * CHAR_W


# ⚠ THE TWO COLUMN LABELS NAME WHAT EACH ARM IS, AND NOTHING ELSE. Not
# "current" against "improved", not "old" against "new" — a label that ranks
# the arms answers the question she is being asked to answer.
ARM_LABELS = ("THE COLOURS THE ROOM HAS TODAY", "A DIFFERENT SET OF COLOURS")
BAND_LABELS = (("day", "DAYTIME"), ("dusk", "EARLY EVENING"), ("night", "NIGHT"))

MARGIN, GUTTER, HEADER_H, BANDLABEL_H = 16, 16, 26, 22


def ruling_sheet(dstdir=None):
    """Three rows — daytime, early evening, night — two columns, both arms at
    identical pixel size. Asserted identical BEFORE composing: if one arm were
    scaled to fit she would be judging resampling, not colour."""
    dst = dstdir or LITDIR
    frames = {}
    for band in ("day", "dusk", "night"):
        for arm, d in (("control", CONTROLDIR), ("ramps", LITDIR)):
            path = os.path.join(d, "bg-%s.png" % band)
            if not os.path.exists(path):
                raise ValueError(
                    "%s is missing — the sheet needs BOTH arms. Run "
                    "light.py --both first." % path)
            frames[(arm, band)] = B.read_png(path)
    sizes = {(im.w, im.h) for im in frames.values()}
    if len(sizes) != 1:
        raise ValueError(
            "the six frames are not all the same size (%r). Composing them "
            "into one sheet would scale some of them, and she would be ruling "
            "on resampling rather than on colour." % sorted(sizes))
    fw, fh = sizes.pop()
    w = MARGIN * 2 + fw * 2 + GUTTER
    h = (MARGIN * 2 + HEADER_H + 3 * (BANDLABEL_H + fh + GUTTER) - GUTTER)
    sheet = B.Img(w, h)
    sheet.rect(0, 0, w, h, SHEET_BG)
    for col, label in enumerate(ARM_LABELS):
        x0 = MARGIN + col * (fw + GUTTER)
        draw_text(sheet, label, x0 + (fw - text_width(label)) // 2, MARGIN)
    y = MARGIN + HEADER_H
    for band, band_label in BAND_LABELS:
        draw_text(sheet, band_label, MARGIN, y + 4)
        y += BANDLABEL_H
        for col, arm in enumerate(("control", "ramps")):
            sheet.blit(frames[(arm, band)], MARGIN + col * (fw + GUTTER), y)
        y += fh + GUTTER
    out = os.path.join(dst, "_ruling-sheet.png")
    B.write_png(sheet, out)
    print("\n  sheet: %s  (%dx%d)\n" % (out, w, h))
    return out


def main(argv=None):
    argv = list(argv if argv is not None else __import__("sys").argv[1:])
    both = "--both" in argv
    if both:
        argv.remove("--both")
    if argv:
        raise SystemExit("usage: light.py [--both]\n"
                         "  (no flag) the new-ramp arm only, into lit/\n"
                         "  --both    also the control arm from the shipped "
                         "sprites, into lit-control/")
    print("\n  shadow / mid / lit  (Rec.709 @ 0.20 / 0.42)")
    ok = run(SRCDIR, LITDIR, STRICT, "ARM: the new ramps  (handoff plates)")
    if both:
        # ⛔ FALLBACK, NOT STRICT, AND NOT NEGOTIABLE. Every shipped hex is off
        # both ramps, so STRICT raises on the first pixel. Recorded in light()'s
        # own docstring too.
        assert_same_dimensions(SRCDIR, ROOMDIR,
                               sorted({n for b in ("day", "dusk", "night")
                                       for n in plate_names(b)}))
        run(ROOMDIR, CONTROLDIR, FALLBACK,
            "ARM: the colours the room has today  (shipped sprites)")
        ruling_sheet(LITDIR)
    print("\n  %s\n" % ("all room bands within tolerance"
                        if ok else "ROOM BANDS OUT OF TOLERANCE"))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
