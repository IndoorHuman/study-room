#!/usr/bin/env python3
"""
tests/test_room_light.py — the §04 luminance gate (Phase 26.98, SC-1).

WHAT THIS IS. ROOM-HANDOFF.md §04 says a rendered day frame must land near a
60/30/10 shadow/mid/lit split and a rendered night frame near 86/11/3, measured
at Rec.709 thresholds 0.20 and 0.42. Those frames are produced OFFLINE by
assets/aseprite/handoff/light.py, so this gate needs no browser and no runner:
it decodes the committed PNGs and does the arithmetic.

ASK THE ANTI-VACUITY QUESTIONS OF IT (26.98-VALIDATION.md):

  1. Can it pass BEFORE the work? NO. It was RED at the phase baseline commit:
     the committed night frame measures ~0.1% lit against a band that admits
     only half-the-target either side of 3.0. The lighting fix that moves it is
     a later plan; this suite is red on arrival and recorded as such.
  2. Can it pass after the work is DELIBERATELY BROKEN? NO. The night band was
     driven red on a planted BEAM["night"] = 0.0 defect and the printed line
     recorded verbatim in 26.98-01-SUMMARY.md; the by-value pin below was
     driven red by widening light.NIGHT_LIT_TOL back to the shared TOL.
  3. Does a DEGENERATE frame satisfy it? NO. _load_frames() asserts the frame
     count by value, each frame's pixel dimensions by value, and each frame's
     count of distinct opaque colours, and it raises BEFORE any luminance is
     computed. A transparent, blank or uniform frame fails on a count, not by
     sliding through a zero-iteration loop. The day frame is additionally an
     UNMUTATED CONTROL ARM: a global collapse into shadow fails there rather
     than hiding under the night band's narrower tolerance.
  4. Is it reading EVALUATION or SOURCE? EVALUATION. Every number below comes
     out of decoded PNG bytes. Nothing is read from the pass's source text.
  5. Does it match the fix's OWN COMMENT? It cannot: there is no grep in this
     file at all.

WHY THE NIGHT LIT BAND HAS ITS OWN TOLERANCE. The shared tolerance in light.py
is 5.0, and the night lit TARGET is 3.0. Applied together they admit everything
from below zero up to eight — nearly three times the target — and the separate
"lit must NOT be 0" clause beside them clips only exactly zero. So the band as
originally written could fail at exactly zero or above eight and NOWHERE in
between. That is the very defect §04's own author reported ("my night render
has zero pixels above 0.42") sailing through as a pass at any non-zero value,
including the ~0.09% the committed frame actually carries. The narrower
tolerance lives in light.py as NIGHT_LIT_TOL and is IMPORTED here, never
restated: two instruments over the same data that disagree is how the wrong
one gets read on every run.

Stdlib only (unittest + hashlib + struct + subprocess + zlib) — the
zero-dependency law. The only repo modules imported are light and, through it,
build_handoff.
"""
import hashlib
import re
import struct
import subprocess
import sys
import unittest
import zlib
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
HANDOFF = REPO_ROOT / "assets" / "aseprite" / "handoff"
if str(HANDOFF) not in sys.path:
    # light.py does a SIBLING import of build_handoff, so the handoff directory
    # itself has to be on the path — not the repo root.
    sys.path.insert(0, str(HANDOFF))

import light  # noqa: E402  (the sys.path insert above is a precondition)

LIT = Path(light.LITDIR)

# The three room frames the assertion reads, by name and in band order.
FRAME_NAMES = ("bg-day.png", "bg-dusk.png", "bg-night.png")
FRAME_W, FRAME_H = 768, 432

FRAMES = {}


def _png_rgba_rows(path):
    """Decode an 8-bit RGBA PNG to a list of per-row bytes. All five PNG filter
    types are implemented rather than assuming the writer's filter 0 — a wrong
    decode would make every luminance number below silently unreliable, which
    is the exact failure mode this gate exists to prevent."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError("%s is not a PNG" % path.name)
    width, height = struct.unpack(">II", data[16:24])
    depth, ctype = data[24], data[25]
    if (depth, ctype) != (8, 6):
        raise AssertionError(
            "%s is bit depth %d colour type %d; this decoder reads 8-bit RGBA "
            "only" % (path.name, depth, ctype))
    idat, i = b"", 8
    while i < len(data):
        length = struct.unpack(">I", data[i:i + 4])[0]
        if data[i + 4:i + 8] == b"IDAT":
            idat += data[i + 8:i + 8 + length]
        i += 12 + length
    raw = zlib.decompress(idat)
    stride, rows, prev, p = width * 4, [], bytearray(width * 4), 0
    for _ in range(height):
        if p >= len(raw):
            raise AssertionError(
                "%s: IDAT ran out before %d rows were decoded" % (path.name,
                                                                  height))
        ftype = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        if len(line) != stride:
            raise AssertionError(
                "%s: truncated scanline (%d of %d bytes)" % (path.name,
                                                             len(line), stride))
        p += stride
        for x in range(stride):
            a = line[x - 4] if x >= 4 else 0
            b = prev[x]
            c = prev[x - 4] if x >= 4 else 0
            if ftype == 1:
                line[x] = (line[x] + a) & 255
            elif ftype == 2:
                line[x] = (line[x] + b) & 255
            elif ftype == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif ftype == 4:
                q = a + b - c
                pa, pb, pc = abs(q - a), abs(q - b), abs(q - c)
                line[x] = (line[x] +
                           (a if pa <= pb and pa <= pc else
                            (b if pb <= pc else c))) & 255
        rows.append(bytes(line))
        prev = line
    return width, height, rows


def _sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _distinct_opaque_colours(rows):
    seen = set()
    for row in rows:
        for i in range(len(row) // 4):
            if row[i * 4 + 3] > 0:
                seen.add((row[i * 4], row[i * 4 + 1], row[i * 4 + 2]))
    return seen


def _split(rows):
    """shadow / mid / lit percentages at Rec.709 thresholds 0.20 and 0.42,
    using light.luminance so the gate and the pass agree on the METRIC while
    disagreeing about nothing else. The DATA is the committed file."""
    sh = mid = lit = n = 0
    for row in rows:
        for i in range(len(row) // 4):
            if row[i * 4 + 3] == 0:
                continue
            n += 1
            L = light.luminance((row[i * 4], row[i * 4 + 1], row[i * 4 + 2]))
            if L < 0.20:
                sh += 1
            elif L < 0.42:
                mid += 1
            else:
                lit += 1
    if n == 0:
        raise AssertionError("frame has zero opaque pixels")
    return (sh * 100.0 / n, mid * 100.0 / n, lit * 100.0 / n)


def setUpModule():
    """THE NON-DEGENERACY PINS, and they run BEFORE any luminance is computed.
    Nothing in this module can reach a split without these passing."""
    present = sorted(p.name for p in LIT.glob("bg-*.png"))
    if present != sorted(FRAME_NAMES):
        raise AssertionError(
            "expected exactly %d committed room frames %r under %s; found %r"
            % (len(FRAME_NAMES), sorted(FRAME_NAMES), LIT, present))
    for name in FRAME_NAMES:
        path = LIT / name
        w, h, rows = _png_rgba_rows(path)
        if (w, h) != (FRAME_W, FRAME_H):
            raise AssertionError(
                "%s decodes at %dx%d; the room frame is pinned at %dx%d"
                % (name, w, h, FRAME_W, FRAME_H))
        if len(rows) != FRAME_H:
            raise AssertionError(
                "%s decoded %d rows, expected %d" % (name, len(rows), FRAME_H))
        colours = _distinct_opaque_colours(rows)
        if len(colours) <= 1:
            raise AssertionError(
                "%s carries %d distinct opaque colour(s) — a blank, "
                "transparent or uniform frame is not a rendered room"
                % (name, len(colours)))
        FRAMES[name] = (w, h, rows, len(colours), _sha256(path))


class TestRoomLightFrames(unittest.TestCase):

    def test_the_three_room_frames_decode_at_768_by_432(self):
        """The pin, restated as an assertion so it is visible in the report as
        well as enforced at import."""
        self.assertEqual(sorted(FRAMES), sorted(FRAME_NAMES))
        for name in FRAME_NAMES:
            w, h, rows, ncolours, _ = FRAMES[name]
            self.assertEqual((w, h), (FRAME_W, FRAME_H), name)
            self.assertEqual(len(rows), FRAME_H, name)
            self.assertGreater(ncolours, 1, name)

    def test_the_day_frame_hits_the_60_30_10_split(self):
        """THE UNMUTATED CONTROL ARM. All three day bands ride the SHARED
        tolerance; a global collapse into shadow fails here rather than
        sliding under the night band's narrower one."""
        got = _split(FRAMES["bg-day.png"][2])
        want = light.TARGETS["day"]
        for band, g, w in zip(("shadow", "mid", "lit"), got, want):
            self.assertLessEqual(
                abs(g - w), light.TOL,
                "day %s band measured %.4f%% against a target of %.1f%% "
                "(shared tolerance %.1f) — split was %.4f / %.4f / %.4f"
                % ((band, g, w, light.TOL) + got))

    def test_the_night_frame_beats_its_own_ambient_floor(self):
        """THE AMENDED NIGHT TARGET — the owner, 2026-08-24: *"Change what night
        should be."*

        ⚠ READ THIS BEFORE TRUSTING IT, BECAUSE A MOVED TARGET IS THIS
        PROJECT'S SIGNATURE DEFECT AND THIS IS ONE.

        §04 asked for 86 / 11 / 3. That was measured from three reference
        scenes which all have DRAWN LIGHT FIXTURES; this room has a 10x22
        candle sprite and nothing else. 26.98-02 proved the ceiling is
        STRUCTURAL: the largest lift any pixel can take at night is +2.55 ramp
        steps, the first warm step clearing the 0.42 threshold is index 7, so
        nothing painted below source step 5 can EVER be lit at night at any
        flame radius. Measured ceiling 0.97 against a required 1.5. She was
        offered real lamplight art and declined it — new art is above her cut
        line this close to the freeze — and asked for the honest number written
        down instead.

        SO THE TARGET IS NOW THE FRAME'S OWN AMBIENT FLOOR: the split this
        exact frame would have with the beam and the flame switched off. Three
        properties make that not a rubber stamp:

          1. It is NOT today's measurement. It is computed from the art and one
             constant, without reading the emitted frame at all. A target
             reverse-engineered from the answer can never fail.
          2. The comparisons are STRICT and DIRECTIONAL. Light may only remove
             shadow and only add mid and lit, so a pass whose beam or candle
             stops working lands exactly ON its floor and fails on `>`. Driven
             red that way and recorded verbatim in 26.98-03-SUMMARY.md.
          3. light.NIGHT_LIT_TOL DID NOT MOVE. It is still 1.5 and still
             load-bearing — it is now the CEILING on how far the candle may
             lift, because a night room that comes out 5% lit is not a night
             room either.

        §04's original triple stays in light.py as NIGHT_TARGET_ORIGINAL. What
        was given up is visible, not erased."""
        import build_handoff as Bh  # noqa: E402
        names = sorted({n for band in ("day", "dusk", "night")
                        for n in light.plate_names(band)})
        palette = light.source_palette(light.SRCDIR, names)
        room = light.compose("night", light.SRCDIR, light.LITDIR)
        floor = light.ambient_floor(room, "night", light.STRICT, palette)
        got = _split(FRAMES["bg-night.png"][2])
        self.assertLessEqual(
            got[0], floor[0],
            "the night frame is DARKER than its own ambient floor "
            "(%.4f%% shadow against a floor of %.4f%%). Light cannot add "
            "shadow; something has inverted its sign."
            % (got[0], floor[0]))
        self.assertGreater(
            got[1], floor[1],
            "the night frame's mid band (%.4f%%) does not beat its ambient "
            "floor (%.4f%%). The beam is doing nothing measurable — the room "
            "is dimmed, not lit." % (got[1], floor[1]))
        self.assertGreater(
            got[2], floor[2],
            "the night frame's lit band (%.4f%%) does not beat its ambient "
            "floor (%.4f%%). The candle is doing nothing measurable. §04's "
            "original target was %r and is retained in light.py as "
            "NIGHT_TARGET_ORIGINAL; the ruling of 2026-08-24 lowered what "
            "night must be, it did not permit night to be unlit."
            % (got[2], floor[2], light.NIGHT_TARGET_ORIGINAL))
        self.assertLessEqual(
            got[2], floor[2] + light.NIGHT_LIT_TOL,
            "the night frame's lit band (%.4f%%) exceeds its ambient floor "
            "(%.4f%%) by more than light.NIGHT_LIT_TOL = %s. That is not a "
            "night room."
            % (got[2], floor[2], light.NIGHT_LIT_TOL))
        self.assertTrue(Bh.WARM)

    def test_the_original_night_target_is_still_on_the_record(self):
        """⛔ THE LOWERED BAR MUST NOT ERASE THE OLD ONE. A record of a target
        that moved, which no longer shows what it moved FROM, is not a record.
        This fails if a later tidy-up deletes NIGHT_TARGET_ORIGINAL as dead
        code, and it fails if the night point-target quietly comes back."""
        self.assertEqual(light.NIGHT_TARGET_ORIGINAL, (86.0, 11.0, 3.0))
        self.assertEqual(light.NIGHT_LIT_CEILING_MEASURED, 0.97)
        self.assertNotIn(
            "night", light.TARGETS,
            "light.TARGETS carries a night entry again. The night band is "
            "asserted against its own ambient floor as of 2026-08-24; a point "
            "target here means two instruments over one measurement.")

    # ── the cool window (26.98-02 Task 1) ──────────────────────────────
    # ROOM-HANDOFF §03 states ONE rule as absolute: "the window is the only
    # exception to the warm ramp, because a night sky cannot be warm." The pass
    # used to read the cool ramp's colours and then write B.WARM[n] anyway, so
    # every pixel of the window plate came out a warm hex. This assertion reads
    # the EMITTED FRAME'S PIXELS, not the pass's source, so it cannot be
    # satisfied by a comment or by a variable that is computed and discarded.

    # The window is pinned at 124,44 in the 384x216 sprite space and its plate
    # is 88x88 (measured; index.html carries --w:88;--h:88 for the same object).
    # The frames are emitted at scale=2, so the rectangle in OUTPUT space is:
    WINDOW_X0, WINDOW_X1 = 124 * 2, (124 + 88) * 2 - 1      # 248 .. 423
    WINDOW_Y0, WINDOW_Y1 = 44 * 2, (44 + 88) * 2 - 1        # 88 .. 263
    WINDOW_PIXELS = 30976                                    # 176 * 176, BY VALUE

    def _window_colours(self, name):
        """Every RGB triple inside the window rectangle, with the rectangle's
        pixel count asserted BY VALUE FIRST. A mis-derived rectangle must fail
        on the count rather than quietly sampling the wall."""
        rows = FRAMES[name][2]
        seen, n = set(), 0
        for y in range(self.WINDOW_Y0, self.WINDOW_Y1 + 1):
            row = rows[y]
            for x in range(self.WINDOW_X0, self.WINDOW_X1 + 1):
                n += 1
                seen.add((row[x * 4], row[x * 4 + 1], row[x * 4 + 2]))
        self.assertEqual(
            n, self.WINDOW_PIXELS,
            "the window rectangle covered %d pixels, not the pinned %d — the "
            "rectangle is mis-derived and every colour read from it is "
            "meaningless" % (n, self.WINDOW_PIXELS))
        return seen

    def test_the_lit_window_rectangles_carry_cool_only_colours(self):
        """THE DISCRIMINATING ARM, and THE SET DIFFERENCE IS THE POINT.
        WARM[0] and COOL[0] are the SAME hex (0e0a16) — the shared darkest step
        — so "is a cool colour" alone is satisfied by a fully warm frame's
        shadows. Only a member of set(COOL) - set(WARM) proves the cool ramp
        actually reached the output.

        ⚠ DAY AND DUSK, NOT NIGHT, AND THAT IS DELIBERATE — see the night test
        below for why night cannot carry this assertion."""
        import build_handoff as B  # noqa: E402  (light put HANDOFF on sys.path)
        cool_only = set(B.COOL) - set(B.WARM)
        self.assertEqual(
            len(cool_only), 9,
            "the two ramps are expected to share exactly their darkest step; "
            "cool-only is %d colours" % len(cool_only))
        for name in ("bg-day.png", "bg-dusk.png"):
            found = self._window_colours(name) & cool_only
            self.assertTrue(
                found,
                "no pixel inside the window rectangle of %s is on the cool "
                "ramp and off the warm one. The sky is warm, which "
                "ROOM-HANDOFF §03 says it cannot be." % name)

    def test_no_cool_source_pixel_is_emitted_as_a_warm_only_colour_at_night(self):
        """THE NIGHT ARM, AND ITS LIMIT IS STATED RATHER THAN HIDDEN.

        ⚠ WHY NIGHT CANNOT CARRY THE COOL-ONLY ASSERTION ABOVE. The owner ruled on
        2026-08-23 that the frames use the REAL night window plate. That plate
        paints its sky at cool steps 1 and 2, and the night band's ambient is
        -2.2 — so every sky pixel clamps to step 0, which is the ONE hex the
        two ramps SHARE. MEASURED: 66.4% of the night window rectangle is
        0e0a16 and the rest is the wooden frame, which is legitimately warm.
        A frame-reading test therefore CANNOT distinguish a cool night sky from
        a warm one: the emitted bytes are identical either way. Saying so is the
        point. Asserting a cool-only colour here would be asserting something
        the data cannot support, and quietly deleting the assertion would hide
        that the night arm is not a gate.

        So night gets the assertion it CAN support, and it is still a real one:
        no pixel whose SOURCE colour was cool-only may be emitted as a
        warm-ONLY colour. This reads the source PLATE to learn which pixels are
        sky and the EMITTED FRAME to learn what colour they became; it does not
        recompute the lighting."""
        import build_handoff as B  # noqa: E402
        import os
        cool_only = set(B.COOL) - set(B.WARM)
        warm_only = set(B.WARM) - set(B.COOL)
        plate = B.read_png(os.path.join(B.PNGDIR, light.WINDOW_PLATE["night"]
                                        + ".png"))
        rows = FRAMES["bg-night.png"][2]
        checked, offenders = 0, {}
        for sy in range(plate.h):
            for sx in range(plate.w):
                if plate.px[sy][sx] not in cool_only:
                    continue
                # sprite (124 + sx, 44 + sy) -> output at scale 2
                for dy in (0, 1):
                    for dx in (0, 1):
                        Y, X = (44 + sy) * 2 + dy, (124 + sx) * 2 + dx
                        row = rows[Y]
                        out = (row[X * 4], row[X * 4 + 1], row[X * 4 + 2])
                        checked += 1
                        if out in warm_only:
                            offenders[out] = offenders.get(out, 0) + 1
        self.assertGreater(
            checked, 0,
            "the night window plate carried no cool-only source pixel at all — "
            "either the wrong plate is being composited or this test is "
            "measuring nothing")
        self.assertFalse(
            offenders,
            "%d pixel(s) whose source colour is on the cool ramp only came out "
            "of the night band as a WARM-ONLY colour: %r. The window's ramp "
            "identity is being thrown away." % (sum(offenders.values()),
                                                sorted(offenders)))

    def test_the_night_lit_tolerance_is_pinned_by_value(self):
        """A VALUE PIN, NOT A SECOND SOURCE OF TRUTH — do not tidy it away as
        duplication. light.NIGHT_LIT_TOL is the one definition and the night
        assertion above imports it; this pin exists so that loosening it back
        toward the shared tolerance inside light.py fails HERE, loudly, instead
        of silently widening the band this suite applies. Both instruments move
        together or the suite goes red."""
        self.assertEqual(light.NIGHT_LIT_TOL, 1.5)
        self.assertLess(
            light.NIGHT_LIT_TOL, light.TOL,
            "the night lit band must be tighter than the shared tolerance; "
            "that is the entire reason it is a separate constant")
        # ⛔ 2026-08-24: the night TARGET moved on her ruling and this
        # TOLERANCE did not. That is the whole difference between amending a
        # target and widening a gate, and this line is where the difference is
        # enforced rather than promised.

    # ── SC-3: the draw-after-light stage (26.98-02 Task 2) ─────────────
    # SC-3 word for word: the exempt set is enumerated BY NAME in source, and a
    # test fails if anything reaches the stage that is not on that list. Four
    # assertions, and each exists because a WEAKER version of it would pass on
    # a defect:
    #
    #   (a) BY VALUE, not by length alone — a test that only asserts "the set
    #       is non-empty" passes a set that swallowed everything.
    #   (b) SURVIVES THE NIGHT BAND — night has the strongest ambient penalty
    #       (-2.2), so a pixel that comes through night unchanged is genuinely
    #       bypassing the pass rather than coincidentally landing on the same
    #       ramp step it started on.
    #   (c) THE FENCE GOES RED, AND ITS MIRROR — without the fallback-mode half
    #       the fence could be a mode that always raises, which is not a fence,
    #       it is a broken function.
    #   (d) THE STAGE IS EXERCISED ON REAL ART, not merely present. A stage that
    #       exists, is named, is fenced and never runs is worth nothing. See the
    #       ⚠ note on that test: on TODAY'S art it is a red-on-change pin rather
    #       than the positive assertion the plan asked for, and the reason is
    #       recorded there rather than smoothed over.

    # SPRITES.md §2: "#9a2828 is never used in any sprite — destructive chrome
    # only." Chosen as the off-ramp probe precisely so it can never be a false
    # positive on real art.
    NEVER_RED = (0x9A, 0x28, 0x28)

    @staticmethod
    def _solid(colour, w=8, h=8):
        """A synthesised source image whose ONLY opaque colour is `colour`."""
        import build_handoff as B  # noqa: E402
        im = B.Img(w, h)
        for y in range(h):
            for x in range(w):
                im.px[y][x] = colour
        return im

    def test_the_exempt_set_enumerates_exactly_two_named_members(self):
        """(a) BY VALUE. The literals are written out here rather than imported
        from light, so light cannot move the goalposts and the test agree."""
        import build_handoff as B  # noqa: E402
        self.assertIsInstance(light.DRAW_AFTER_LIGHT, frozenset)
        self.assertEqual(
            len(light.DRAW_AFTER_LIGHT), 2,
            "the exempt set must enumerate exactly 2 members; it holds %d: %r"
            % (len(light.DRAW_AFTER_LIGHT), sorted(light.DRAW_AFTER_LIGHT)))
        self.assertEqual(
            set(light.DRAW_AFTER_LIGHT),
            {(0x2C, 0x28, 0x23), (0xE8, 0x50, 0x3A)},
            "the exempt set's members are not the outline ink and coral")
        # The two constants that name them must be the same colours — a set
        # built from constants nobody reads is the inferred exemption again.
        self.assertEqual(B.INK, (0x2C, 0x28, 0x23))
        self.assertEqual(light.ACCENT, (0xE8, 0x50, 0x3A))

    def test_an_exempt_colour_survives_the_night_band_unchanged(self):
        """(b) The outline ink through the harshest band, literally."""
        import build_handoff as B  # noqa: E402
        out = light.light(self._solid(B.INK), "night", fence=light.STRICT,
                          label="synthesised outline-ink probe")
        seen = {c for row in out.px for c in row if c is not None}
        self.assertEqual(
            seen, {B.INK},
            "an outline-ink source came out of the night band as %r. The "
            "draw-after-light stage is not bypassing the pass; the ink is "
            "being converted into a ramp step, which is the ruling of "
            "2026-08-07 being quietly undone." % (sorted(seen),))

    def test_an_unnamed_off_ramp_colour_raises_in_strict_and_not_in_fallback(self):
        """(c) THE ASSERTION SC-3 LITERALLY ASKS FOR — and its mirror."""
        src = self._solid(self.NEVER_RED)
        with self.assertRaises(light.UnnamedExemption) as caught:
            light.light(src, "day", fence=light.STRICT,
                        label="synthesised destructive-red probe")
        msg = str(caught.exception)
        self.assertIn("(154, 40, 40)", msg)
        self.assertIn("#9a2828", msg)
        # THE MIRROR. Without it, a function that raised in EVERY mode would
        # pass the half above — and that is not a fence, it is a crash.
        out = light.light(src, "day", fence=light.FALLBACK,
                          label="synthesised destructive-red probe")
        self.assertTrue(
            {c for row in out.px for c in row if c is not None},
            "fallback mode emitted nothing for an off-ramp source; the "
            "documented luminance round-trip has been lost")

    def test_the_emitted_day_frame_carries_only_ramp_and_exempt_colours(self):
        """(d) THE ANTI-DEGENERATE LAST PASS — the only one of the four that
        reads a REAL emitted frame, in the shape of test_sprite_geometry.py's
        test_step4_every_roster_cell_carries_ink.

        TWO ARMS, and arm two is now the POSITIVE assertion.

        ⚠ HISTORY, KEPT SO THIS IS NOT RE-LITIGATED. 26.98-02 asked for "at
        least one outline-ink pixel in the emitted day frame" and could not
        have it: NO plate under png/ carried an exempt colour, because
        build_handoff.py was written with no outlines at all (its own header
        records this as deviation (a)) — #2c2823 is off-ramp and putting it in
        every sprite would have broken rule 7. So arm two was a BY-VALUE PIN at
        the measured 0, red-on-change, whose failure message instructed the
        next reader to replace it with the positive form rather than update the
        number.

        THAT PIN FIRED, ON PURPOSE, IN 26.98-03. The owner ruled on 2026-08-23
        that the plates she rules the palette from must carry the #2c2823
        outlines, light.outlined() puts them on every composited object, and
        the day frame went from 0 exempt pixels to 8452. This is the pin's
        instruction being followed: the count is not updated, it is replaced."""
        import build_handoff as B  # noqa: E402
        rows = FRAMES["bg-day.png"][2]
        alphabet = set(B.WARM) | set(B.COOL) | set(light.DRAW_AFTER_LIGHT)
        seen = _distinct_opaque_colours(rows)
        stray = seen - alphabet
        self.assertFalse(
            stray,
            "bg-day.png carries %d colour(s) that are on neither ramp and not "
            "in the exempt set: %r. The pass's output alphabet is not closed."
            % (len(stray), sorted(stray)))
        ink_pixels = 0
        for row in rows:
            for i in range(len(row) // 4):
                if row[i * 4 + 3] == 0:
                    continue
                if (row[i * 4], row[i * 4 + 1], row[i * 4 + 2]) == B.INK:
                    ink_pixels += 1
        self.assertGreater(
            ink_pixels, 0,
            "bg-day.png carries NO #2c2823 pixel. The owner ruled on 2026-08-23 "
            "that the plates she rules the palette from carry the outlines, "
            "and the draw-after-light stage is what keeps the ink literal once "
            "it is there. Zero ink pixels means either light.outlined() stopped "
            "running or the stage converted the ink into a ramp step — either "
            "way her ruling has been undone.")

    def test_the_pass_reproduces_the_committed_frame_bytes(self):
        """Closes the tautology hole: the assertions above read COMMITTED
        bytes, and this proves re-running the pass reproduces those exact
        bytes. A gate that re-derives its own input agrees with itself
        forever."""
        before = {n: FRAMES[n][4] for n in FRAME_NAMES}
        proc = subprocess.run(
            [sys.executable, str(HANDOFF / "light.py")],
            cwd=str(REPO_ROOT), capture_output=True, text=True)
        # Read the OUTPUT, not only the exit code: the pass exits non-zero
        # whenever a room band is out of tolerance, which is a legitimate
        # state for this gate to observe and says nothing about determinism.
        self.assertIn(
            "shadow / mid / lit", proc.stdout,
            "the pass printed no split table.\nexit=%s\nstdout:\n%s\nstderr:\n%s"
            % (proc.returncode, proc.stdout, proc.stderr))
        for name in FRAME_NAMES:
            after = _sha256(LIT / name)
            self.assertEqual(
                before[name], after,
                "%s changed when the pass was re-run — the committed frame is "
                "not what the pass produces.\nexit=%s\nstdout:\n%s\nstderr:\n%s"
                % (name, proc.returncode, proc.stdout, proc.stderr))


class TestTheTwoArms(unittest.TestCase):
    """SC-2's instrument. The owner rules the palette from two pictures of the
    same room, and the ONLY thing that may differ between them is which plate
    set they were painted from. Everything below exists to stop that sentence
    from being merely intended."""

    CONTROL = Path(light.CONTROLDIR)

    # ⛔ BY VALUE, BEFORE ANY ITERATION. A count derived from a glob and then
    # compared to itself passes on an empty directory.
    FRAMES_PER_ARM = 3

    # The palette light.source_palette() discovers in assets/room/, pinned BY
    # VALUE — darkest first, exempt colours removed. ⚠ THIS PIN IS THE
    # NARROWED ARM: the palette is DISCOVERED at run time, which is what keeps
    # the two arms one code path, and a discovery with no pin is drift with a
    # clean report. Three of these eleven are NOT in SPRITES.md §2's thirteen
    # (#2b2f3e the night sky, #cf8354 and #b5623a the dusk warmth) — the
    # shipped art has drifted from its own palette table, and this test is
    # where that fact is written down rather than assumed away.
    SHIPPED_PALETTE = [
        (0x2B, 0x2F, 0x3E), (0x55, 0x50, 0x47), (0x4F, 0x7B, 0x43),
        (0xB5, 0x62, 0x3A), (0xCF, 0x83, 0x54), (0xCD, 0xA8, 0x6E),
        (0xB7, 0xB2, 0xA8), (0xE0, 0xC7, 0x9A), (0xDC, 0xD5, 0xC8),
        (0xEE, 0xEA, 0xE1), (0xFB, 0xF7, 0xEE),
    ]

    def test_both_arms_exist_and_are_not_byte_identical(self):
        """THE ASSERTION THE RULING DEPENDS ON. If the control arm ever reads
        the same plates as the new-ramp arm, the sheet she rules from is two
        copies of one picture and her answer means nothing. A control that
        renders the treatment is not a control."""
        for arm in (LIT, self.CONTROL):
            present = sorted(p.name for p in arm.glob("bg-*.png"))
            self.assertEqual(
                len(present), self.FRAMES_PER_ARM,
                "%s holds %d bg frame(s); each arm must hold exactly %d — "
                "found %r" % (arm, len(present), self.FRAMES_PER_ARM, present))
            self.assertEqual(present, sorted(FRAME_NAMES))
        for name in FRAME_NAMES:
            a, b = LIT / name, self.CONTROL / name
            wa, ha, _ = _png_rgba_rows(a)
            wb, hb, _ = _png_rgba_rows(b)
            self.assertEqual(
                (wa, ha), (wb, hb),
                "%s is %dx%d in the new-ramp arm but %dx%d in the control arm. "
                "The two arms must be the same size or the sheet scales one of "
                "them and she is judging resampling, not colour."
                % (name, wa, ha, wb, hb))
            self.assertEqual((wa, ha), (FRAME_W, FRAME_H))
            self.assertNotEqual(
                _sha256(a), _sha256(b),
                "%s is BYTE IDENTICAL in both arms. The control arm has read "
                "the same plates as the new-ramp arm, so the ruling sheet is "
                "two copies of one picture and the palette question it asks is "
                "unanswerable." % name)

    def test_the_control_arm_is_painted_in_the_rooms_own_colours(self):
        """The complement of the test above, and the one that catches the
        SUBTLE version of the same accident: two arms that differ in bytes but
        not in palette. The documented luminance round-trip emits WARM RAMP
        hexes for any unknown colour, so a control arm that fell through to it
        would come out in the NEW colours while still differing byte for byte
        from the new-ramp arm — passing the assertion above while destroying
        the comparison."""
        import build_handoff as Bh  # noqa: E402
        for name in FRAME_NAMES:
            seen = _distinct_opaque_colours(_png_rgba_rows(self.CONTROL / name)[2])
            on_ramp = seen & (set(Bh.WARM) | set(Bh.COOL))
            self.assertFalse(
                on_ramp,
                "the control arm's %s carries %d colour(s) from the NEW ramps: "
                "%r. The control is supposed to be the room's colours as they "
                "are today; if it is emitting ramp hexes it has fallen through "
                "to the luminance round-trip and both sides of the sheet are "
                "the new palette." % (name, len(on_ramp), sorted(on_ramp)))
            stray = seen - set(self.SHIPPED_PALETTE) - set(light.DRAW_AFTER_LIGHT)
            self.assertFalse(
                stray,
                "the control arm's %s carries %d colour(s) that are neither in "
                "the shipped palette nor exempt: %r"
                % (name, len(stray), sorted(stray)))

    def test_the_discovered_shipped_palette_is_pinned_by_value(self):
        """The narrowed arm on the discovery itself."""
        names = sorted({n for band in ("day", "dusk", "night")
                        for n in light.plate_names(band)})
        got = light.source_palette(light.ROOMDIR, names)
        self.assertEqual(
            got, self.SHIPPED_PALETTE,
            "the palette discovered in the shipped sprite set has changed.\n"
            "  pinned:     %r\n  discovered: %r\nEither the shipped art was "
            "repainted or the discovery changed. Neither may pass silently: "
            "every measurement of the control arm is taken through this list."
            % (self.SHIPPED_PALETTE, got))
        self.assertIsNone(
            light.source_palette(light.SRCDIR, names),
            "the handoff plates are supposed to be ramp-native, so the "
            "discovery must return None for them and leave that arm on the "
            "RAMP_ID path byte for byte. It returned a palette instead, which "
            "means an off-ramp colour has entered the handoff set.")

    def test_the_pass_refuses_a_destination_inside_its_source(self):
        """T-26.98-13. The pass now READS a directory it does not own. A
        destination inside the source would write generated frames into the
        sprite generator's art — the one thing this plan's whole control rests
        on not happening."""
        with self.assertRaises(ValueError) as caught:
            light._paths(light.SRCDIR, light.SRCDIR)
        self.assertIn("is inside the source", str(caught.exception))
        with self.assertRaises(ValueError) as caught:
            light._paths(light.ROOMDIR, light.ROOMDIR)
        self.assertIn("is inside the source", str(caught.exception))
        # And a destination that is not inside the source but is still outside
        # the handoff directory — assets/room/ itself.
        with self.assertRaises(ValueError) as caught:
            light._paths(light.SRCDIR, light.ROOMDIR)
        self.assertIn("is outside", str(caught.exception))
        # THE MIRROR. Without it a function that raised on EVERY pair would
        # pass all three above, and that is not a guard, it is a break.
        src, dst = light._paths(light.SRCDIR, light.LITDIR)
        self.assertTrue(src and dst)


class TestThePaletteRulingIsOnTheRecord(unittest.TestCase):
    """SC-2's second half. She has ruled; the ruling has to be findable by
    someone who was not in the room, in BOTH of the places the contract names,
    and it has to be impossible for a placeholder to sit there unnoticed.

    ⚠ BOTH FILES ARE ASSERTED IN ONE TEST, ON PURPOSE. A ruling written in one
    place and forgotten in the other is the exact failure this exists for, and
    two separate tests would let a green half hide a red one in a summary."""

    HANDOFF = REPO_ROOT / "tools" / "ROOM-HANDOFF.md"
    SPRITES = REPO_ROOT / "tools" / "SPRITES.md"

    # ⛔ THE PLACEHOLDER LIST LIVES HERE AND NOWHERE ELSE. Putting it in the
    # documents themselves would let a writer satisfy the gate by editing the
    # list instead of by writing the ruling down.
    PLACEHOLDERS = ("TBD", "TODO", "FIXME", "XXX", "PLACEHOLDER",
                    "DEFERRED", "decide after the lighting model lands",
                    "no sprite work starts", "awaiting her ruling",
                    "not yet ruled", "pending ruling")

    RULING_DATE = re.compile(r"2026-\d{2}-\d{2}")
    # A quoted sentence: straight or curly quotes, at least 21 characters of
    # payload. Bold markers are not accepted as quotes — a paraphrase in bold
    # is still a paraphrase.
    QUOTED = re.compile(u'["“]([^"“”]{21,})["”]')

    def _palette_row(self):
        """§R's Palette row, located by its row label rather than by index."""
        for line in self.HANDOFF.read_text(encoding="utf-8").splitlines():
            if line.startswith("| **Palette**"):
                return line
        self.fail("ROOM-HANDOFF.md §R has no row beginning '| **Palette**' — "
                  "the reconciliation table's palette row has been renamed or "
                  "removed, and the ruling record has nowhere to live.")

    def _section_92(self):
        """§9.2, located by its numbered heading and ended by the next one."""
        lines = self.SPRITES.read_text(encoding="utf-8").splitlines()
        start = None
        for i, line in enumerate(lines):
            if line.startswith("### 9.2"):
                start = i
            elif start is not None and line.startswith("### "):
                return "\n".join(lines[start:i])
        if start is None:
            self.fail("SPRITES.md has no '### 9.2' heading — the palette "
                      "section the contract names by number is gone.")
        return "\n".join(lines[start:])

    def _both(self):
        return (("ROOM-HANDOFF.md §R's Palette row", self._palette_row()),
                ("SPRITES.md §9.2", self._section_92()))

    def test_the_palette_ruling_is_recorded_in_both_places(self):
        for label, text in self._both():
            self.assertTrue(
                self.RULING_DATE.search(text),
                "%s carries no 2026-MM-DD ruling date. An undated ruling is a "
                "rumour." % label)
            self.assertTrue(
                self.QUOTED.search(text),
                "%s carries no quoted sentence of more than twenty "
                "characters. Her ruling is recorded VERBATIM or it is recorded "
                "as somebody's paraphrase of it." % label)
            for placeholder in self.PLACEHOLDERS:
                self.assertNotIn(
                    placeholder, text,
                    "%s still carries the placeholder %r. The palette ruling "
                    "was given on 2026-08-24; a record that still says the "
                    "question is open is worse than no record, because it "
                    "reads as current." % (label, placeholder))

    def test_the_record_does_not_over_claim_beyond_the_repaint(self):
        """⛔ THE NARROW FORM, ENFORCED — and this is the assertion that
        matters more than the one above.

        She declined THE WHOLE-ROOM REPAINT ONTO THE TWO 10-STEP RAMPS, and
        nothing else. On the SAME DAY she told a parallel design session that
        it is okay to propose colours outside the current palette
        (docs/DESK-REDESIGN-HANDOFF.md §2, §5). If either record reads as "the
        palette question is closed", it silently cancels a permission she
        granted that morning — which is precisely the failure she paused this
        phase to prevent.

        So both records must say, in words a later reader cannot miss, that
        this is NOT NOW rather than never, that the comparison it was made on
        was CONFOUNDED by drawn detail, and that the separate colour-growth
        question is still open and lives in a named document."""
        for label, text in self._both():
            low = text.lower()
            for needle, why in (
                    ("not now", "the ruling is 'not now', not 'never'"),
                    ("confound", "the comparison it was made on was confounded "
                                 "by drawn detail, and the record must say so "
                                 "rather than footnote it"),
                    ("desk-redesign-handoff", "the separate, still-open colour "
                                              "question must be named by the "
                                              "document that holds it")):
                self.assertIn(
                    needle, low,
                    "%s does not contain %r. %s." % (label, needle, why))


if __name__ == "__main__":
    unittest.main(verbosity=2)
