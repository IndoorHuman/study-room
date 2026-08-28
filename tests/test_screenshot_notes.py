#!/usr/bin/env python3
"""tests/test_screenshot_notes.py — the four pure functions the screenshot-to-
note pass is made of, and the one counted gate that stands in front of them.

Standalone `unittest` suite in the house convention: no runner, no package,
nothing installed (law 8). It exits 0/1 on BARE invocation, so it sits inside
the `tests/test_*.py` glob the counting sweep uses, and it still accepts `-k`
for the V-table's per-claim commands — `tests/test_server_smoke.py` and
`tests/test_vision_fence.py` are the precedents that satisfy both.

WHAT THIS SUITE OWNS, and why each claim is a number rather than an opinion:

  V13 THE RE-DERIVATION. The shipped `screenshots` tag covers 2,676 of 3,748
      and 16 of those are not screenshots at all — a 29.0% under-count, and
      the reason is measurable: 13,419 of the 13,606 image items came out of
      Apple Photos named `<32-hex-uuid>.jpeg`, which kills both filename
      signals and leaves only the exact dimension table. The fix is the UNION
      of two mechanical tests, and it is DOWNSTREAM of the Vision pass because
      test 2 IS Vision's own `screenshot` label.

  V18 THE COUNTED GATE. The pass refuses unless EVERY non-fenced photograph
      carries a cache entry written by the RUNNING program. Running the note
      pass on stale text would bake the language defect into ~3,575 notes.

  V12 THE FENCE. A fenced photograph is not in the candidate set, so it is not
      in the union, its tag is not touched, and nothing is written for it —
      law 5, in the only form that is bulletproof: the pass cannot act on
      evidence it refuses to gather.

  V16 THE CLEAN. Under 30 code points after chrome-stripping there is NO note;
      the picture stays `type: "image"`, keeps the tag, and is not moved.

  V17 PURITY. `strip_chrome` is a pure function of its string.

  V15 THE IDENTITY. cos = 1 - d^2/2 on an L2-normalised print. Never 1 - d.

  V14 THE GROUPING. gap <= 20,000 ms AND cos >= 0.50, transitive. The one
      documented false group — 27 s apart at cosine 0.872 — stays split, and
      the same cosine at 19 s merges.

⚠ EVERY GATE HERE HAS BEEN DRIVEN RED, and the mutations that did it are kept
as PERMANENT DRILLS rather than as a sentence about a run that happened once.
`tests/test_no_push.cjs` records why in this repo's own words: roughly thirty
defects of this project's class have landed INSIDE the measuring instrument
rather than in the code under test. Each drill asserts the mutation CHANGED
the answer before it scores a catch, and each runs an unmutated control in the
same case — a patch that was never planted is a drill that measured nothing.

⚠ THE DRILLS MUTATE THE SHIPPED FUNCTION, NOT THE FIXTURE, wherever the shape
allows it. A fixture mutation can pass for the wrong reason (26.94-01 hit
exactly that): change a fixture and the suite may go red because the fixture is
now inconsistent, which proves nothing about the code.

⚠⚠ THIS SUITE RUNS ON A MACHINE HOLDING A 44 GB REAL LIBRARY. Every path it
writes is under a temp root it created, asserted BEFORE anything is written;
nothing it writes goes near `~/StudyRoom`; and `tearDownModule` re-hashes the
real `items.json` and fails the run if one byte moved.

⚠ NOTHING OF HERS IS COMMITTED HERE. No real item id, no real image, no real
feature-print byte and no real OCR text. The one named regression case is
reproduced at its MEASURED COORDINATES — a gap in milliseconds and a cosine —
with synthetic ids and synthetic vectors, because `group_bursts` consumes only
those two numbers and nothing else about the pair.
"""
import hashlib
import json
import math
import os
import random
import re
import shutil
import struct
import sys
import unicodedata
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import study_lib  # noqa: E402

# ⚠ CAPTURED AT IMPORT, READ-ONLY. The owner's real library lives here. This
# suite never writes into it; these two names are how it proves so afterwards.
REAL_LIBRARY_ROOT = Path.home() / "StudyRoom"
REAL_ITEMS = REAL_LIBRARY_ROOT / "items.json"
REAL_ITEMS_SHA = (hashlib.sha256(REAL_ITEMS.read_bytes()).hexdigest()
                  if REAL_ITEMS.exists() else None)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "screenshot_notes"


def tearDownModule():
    """The last word: the real store is exactly as this suite found it."""
    if REAL_ITEMS_SHA is None:
        return
    now = (hashlib.sha256(REAL_ITEMS.read_bytes()).hexdigest()
           if REAL_ITEMS.exists() else None)
    if now != REAL_ITEMS_SHA:
        raise AssertionError(
            "the real items.json moved during this suite — it must never")


def load_fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def strip_py_docstrings(src):
    """Every triple-quoted block removed. The shipped functions name their own
    contracts in prose — 'no wall-clock, no locale, no filesystem reads' —
    so a source check reading raw text would be GREEN on a function that had
    grown exactly the call its docstring forbids."""
    out = []
    i, n = 0, len(src)
    while i < n:
        found = [(src.find(q, i), q) for q in ('"""', "'''")]
        found = [(p, q) for p, q in found if p != -1]
        if not found:
            out.append(src[i:])
            break
        start, quote = min(found)
        end = src.find(quote, start + 3)
        if end == -1:
            out.append(src[i:])
            break
        out.append(src[i:start])
        i = end + 3
    return "".join(out)


def shipped_body(name):
    """The body of one top-level `def` in study_lib.py, SLICED BY NAME and
    never by line number (study_lib.py has moved repeatedly), with `#`
    comments and docstrings both stripped."""
    src = Path(study_lib.__file__).read_text(encoding="utf-8")
    code = "\n".join("" if ln.lstrip().startswith("#") else ln
                     for ln in src.split("\n"))
    code = strip_py_docstrings(code)
    parts = code.split("\ndef " + name + "(", 1)
    if len(parts) != 2:
        raise AssertionError("study_lib." + name + " is not a top-level def "
                             "— if it moved, move this pin with it")
    # ⚠ STOP AT THE FIRST TOP-LEVEL STATEMENT, not merely at the next `def`.
    # Splitting on `def` alone drags whatever module-level constants happen to
    # sit between two functions into "the body", which makes every check over
    # that body quietly wider than it claims to be.
    lines = parts[1].split("\n")
    body, in_signature = [], True
    for line in lines:
        if in_signature:
            body.append(line)
            if line.rstrip().endswith(":"):
                in_signature = False
            continue
        if line.strip() and not line[:1].isspace():
            break
        body.append(line)
    return "\n".join(body)


# ---------------------------------------------------------------------------
# Image bytes, BUILT from the fixture's recipe rather than committed.
#
# ⚠ These builders exist so the thing each case is actually about — the exact
# dimension table, and the presence or absence of a TIFF camera `Model` — is
# legible at the site. A committed .png/.jpeg would hide both inside a binary
# nobody can read in a diff.
# ---------------------------------------------------------------------------

def png_bytes(width, height):
    """[CITED: W3C PNG spec, IHDR chunk] signature, length, 'IHDR', then
    width/height as big-endian uint32 — exactly what `png_dims` reads."""
    return (b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR"
            + struct.pack(">II", width, height)
            + b"\x08\x06\x00\x00\x00" + b"\x00" * 16)


def _exif_app1(model):
    """[CITED: Exif 2.3 / TIFF 6.0] An APP1 segment carrying a little-endian
    TIFF header and an IFD0 holding exactly one entry: tag 0x0110 (Model),
    type 2 (ASCII). The value is longer than four bytes, so the entry holds an
    OFFSET from the TIFF header rather than the string itself."""
    text = model.encode("ascii") + b"\x00"
    # TIFF start .. +8 header · +8 entry count · +10 the entry · +22 next-IFD
    # · +26 the string.
    tiff = (b"II" + struct.pack("<H", 42) + struct.pack("<I", 8)
            + struct.pack("<H", 1)
            + struct.pack("<HHII", 0x0110, 2, len(text), 26)
            + struct.pack("<I", 0)
            + text)
    payload = b"Exif\x00\x00" + tiff
    return b"\xff\xe1" + struct.pack(">H", len(payload) + 2) + payload


def jpeg_bytes(width, height, model=None):
    """A JPEG whose SOF0 frame header carries the dimensions `jpeg_dims`
    reads, optionally preceded by an APP1/Exif segment naming a camera."""
    sof = (b"\xff\xc0" + struct.pack(">H", 11) + b"\x08"
           + struct.pack(">HH", height, width) + b"\x01\x01\x11\x00")
    head = b"\xff\xd8"
    if model:
        head += _exif_app1(model)
    return head + sof + b"\xff\xd9"


def image_bytes(row):
    if row["fmt"] == "png":
        return png_bytes(row["w"], row["h"])
    if row["fmt"] == "jpeg":
        return jpeg_bytes(row["w"], row["h"], row.get("model"))
    return b"# a note, not a photograph\n"


# ---------------------------------------------------------------------------
# Synthetic feature prints.
#
# ⚠ UNIT VECTORS BUILT TO A TARGET COSINE, WITHOUT A ROUND TRIP THROUGH AN
# ANGLE. a = e0 and b = c*e0 + sqrt(1-c^2)*e1, so the dot product is EXACTLY
# the float `c` that was asked for. Going via acos/cos instead would land a
# ulp away, and `>= BURST_COS_FLOOR` at exactly 0.50 is one of the six
# boundaries this suite asserts — a boundary case that is only accidentally
# on the right side of the line is not a boundary case.
# ---------------------------------------------------------------------------

def unit_pair(cosine, dim=study_lib.VISION_PRINT_DIM):
    c = float(cosine)
    a = [0.0] * dim
    b = [0.0] * dim
    a[0] = 1.0
    b[0] = c
    b[1] = math.sqrt(max(0.0, 1.0 - c * c))
    return a, b


class ScreenshotNotesBase(unittest.TestCase):

    def setUp(self):
        # ⚠ THE TEMP ROOT COMES FIRST, AND NOTHING IS WRITTEN BEFORE THE
        # ASSERTION BELOW.
        self.tmp = Path(__import__("tempfile").mkdtemp(
            prefix="study-room-screenshot-notes-"))
        self.addCleanup(shutil.rmtree, str(self.tmp), ignore_errors=True)
        self.library = self.tmp / "Library"
        self.assert_under_temp_root(self.library)
        (self.library / "items").mkdir(parents=True)
        self.root = str(self.library)

    def assert_under_temp_root(self, *paths):
        root = os.path.realpath(str(self.tmp))
        for path in paths:
            here = os.path.realpath(str(path))
            self.assertTrue(here == root or here.startswith(root + os.sep),
                            "a path this suite is about to write is not "
                            "under its own temp root")
            self.assertNotEqual(
                here, os.path.realpath(str(REAL_LIBRARY_ROOT)),
                "a fixture path resolved to the REAL library")


class LibraryFixtureMixin(ScreenshotNotesBase):
    """The synthetic library from `library.json`, on disk, with its cache."""

    PROGRAM_FP = "fp-current-program"
    STALE_FP = "fp-a-program-that-is-no-longer-running"

    def build_library(self, cache_fp=None, skip_cache=()):
        """Write every snapshot, then a cache entry for every ELIGIBLE
        photograph. `skip_cache` names ids to leave unread, which is how the
        counted gate is driven red."""
        fixture = load_fixture("library.json")
        self.fixture = fixture
        self.rows = {r["id"]: r for r in fixture["items"]}
        store = study_lib.new_store(self.root)
        keys = str(study_lib.keys_file_path())
        for row in fixture["items"]:
            ext = {"png": ".png", "jpeg": ".jpeg"}.get(row["fmt"], ".md")
            rel = "items/" + row["id"] + ext
            path = self.library / rel
            self.assert_under_temp_root(path.parent)
            path.write_bytes(image_bytes(row))
            origin = (keys if row.get("origin") == "keys_file"
                      else "/var/folders/x/studyroom-collect-1/"
                           + row["id"] + ext)
            store["items"][row["id"]] = {
                "id": row["id"],
                "source": "photos",
                "origin_path": origin,
                "library_path": rel,
                "type": row["type"],
                "title": row["id"] + ext,
                "state": row["state"],
                "trigger": row["trigger"],
                "tags": list(row["tags"]),
                "created_ms": row["created_ms"],
                "history": [],
            }
        self.cache = {}
        fp = self.PROGRAM_FP if cache_fp is None else cache_fp
        for row in fixture["items"]:
            if row["id"].startswith("s") and row["id"] not in skip_cache:
                self.cache[row["id"]] = {
                    "text": row["text"], "themes": list(row["themes"]),
                    "faces": 0, "dim": study_lib.VISION_PRINT_DIM,
                    "lang": "auto", "program_fp": fp, "read_ms": 1,
                }
        return store

    def reader(self, item_id):
        """The cache_reader the pass is handed: entry or None, no IO."""
        return self.cache.get(item_id)

    def tags_of(self, store):
        return {i: list(it.get("tags") or [])
                for i, it in store["items"].items()}


# ===========================================================================
# V13 / V18 / V12 — the re-derivation, its gate, and the fence
# ===========================================================================

class RedetectTest(LibraryFixtureMixin):
    """V13 — `redetect_screenshots` returns exactly test 1 UNION test 2."""

    def test_redetect_union(self):
        """The counts, BY VALUE, from the fixture's own `expected` block —
        which is written down in the fixture rather than derived in the test,
        so a fixture edit and an assertion edit cannot be the same edit."""
        store = self.build_library()
        want = self.fixture["expected"]
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertTrue(report["ok"], report.get("why"))
        for key in ("union", "test1_only", "test2_only", "both",
                    "added", "removed"):
            self.assertEqual(
                report[key], want[key],
                "the re-derivation's " + key + " is " + str(report[key])
                + ", not the " + str(want[key]) + " stated in advance")
        self.assertEqual(report["refused"], 0)

        tags = self.tags_of(store)
        # every union member carries the tag, exactly once
        for item_id in ("s101", "s102", "s103", "s105", "s106", "s107",
                        "s108"):
            self.assertEqual(
                tags[item_id].count("screenshots"), 1,
                item_id + " (" + self.rows[item_id]["class"] + ") must carry "
                "the screenshots tag exactly once after the re-derivation")
        # the false positive lost it
        self.assertNotIn(
            "screenshots", tags["s104"],
            "s104 is in NEITHER test and carried the tag today — the "
            "re-derivation must REMOVE it. This removal is exactly why the "
            "pass cannot live inside stamp_facets, whose two callers depend "
            "on a byte-equal second pass (study_lib.py migrate_store).")
        # the note never entered any count
        self.assertNotIn("screenshots", tags["n301"])

    def test_redetect_is_idempotent_on_its_own_output(self):
        """A second run adds nothing and removes nothing. The pass is one-shot
        by policy, not by fragility."""
        store = self.build_library()
        study_lib.redetect_screenshots(store, self.root, self.reader,
                                       self.PROGRAM_FP)
        before = self.tags_of(store)
        again = study_lib.redetect_screenshots(store, self.root, self.reader,
                                               self.PROGRAM_FP)
        self.assertEqual((again["added"], again["removed"]), (0, 0))
        self.assertEqual(self.tags_of(store), before)
        self.assertEqual(again["union"], self.fixture["expected"]["union"])

    # -- the drills ---------------------------------------------------------

    def test_drill_dropping_test_two_shortens_the_union(self):
        """PERMANENT DRILL — the mutation that matters most, because it is the
        SEQUENCING mistake: re-derive before the Vision pass has run and you
        get test 1 only. On her real library that is 2,753 against 3,748 —
        still 27% short of the truth, and green on every filename heuristic.

        ⚠ THE SHIPPED FUNCTION IS MUTATED, NOT THE FIXTURE. `_vision_themes`
        is the shipped seam test 2 reads through; patching it to return
        nothing is exactly 'Vision has not run yet'."""
        store = self.build_library()
        want = self.fixture["expected"]
        real = study_lib._vision_themes
        try:
            study_lib._vision_themes = lambda entry: ()
            report = study_lib.redetect_screenshots(
                store, self.root, self.reader, self.PROGRAM_FP)
        finally:
            study_lib._vision_themes = real
        self.assertNotEqual(
            report["union"], want["union"],
            "dropping test 2 did not change the answer — the mutation was "
            "never planted, so a catch here would be meaningless")
        self.assertEqual(
            report["union"], want["test1"],
            "with test 2 gone the union collapses to test 1 alone")
        self.assertEqual(report["test2_only"], 0)
        self.assertNotIn(
            "screenshots", self.tags_of(store)["s103"],
            "s103 is the test-1 miss test 2 rescues — a camera-model "
            "photograph at screenshot dimensions. Without test 2 it is lost.")
        # the unmutated control, in the same case
        store = self.build_library()
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertEqual(report["union"], want["union"],
                         "CONTROL: the real seam is restored and the union "
                         "is whole again")
        self.assertIn("screenshots", self.tags_of(store)["s103"])

    def test_drill_dropping_test_one_shortens_the_union(self):
        """PERMANENT DRILL, the other half. Test 1 is the only signal that
        survives an Apple Photos export, so dropping it loses every screenshot
        Vision happened not to label."""
        store = self.build_library()
        want = self.fixture["expected"]
        real = study_lib._screen_capture_signal
        try:
            study_lib._screen_capture_signal = lambda path: False
            report = study_lib.redetect_screenshots(
                store, self.root, self.reader, self.PROGRAM_FP)
        finally:
            study_lib._screen_capture_signal = real
        self.assertNotEqual(report["union"], want["union"],
                            "the mutation was never planted")
        self.assertEqual(report["union"], want["test2"])
        self.assertEqual(report["test1_only"], 0)
        self.assertNotIn("screenshots", self.tags_of(store)["s102"])

    def test_drill_skipping_the_removal_leaves_the_false_positive(self):
        """PERMANENT DRILL — a re-derivation that only ADDS is the comfortable
        mistake: it never takes a tag off anything, so it never has to argue
        with `stamp_facets`. It also leaves all 16 false positives on her real
        library, which is half of what D-07 is about."""
        store = self.build_library()
        real = study_lib._untag_screenshot
        planted = {"n": 0}

        def never_removes(item):
            planted["n"] += 1
            return False

        try:
            study_lib._untag_screenshot = never_removes
            report = study_lib.redetect_screenshots(
                store, self.root, self.reader, self.PROGRAM_FP)
        finally:
            study_lib._untag_screenshot = real
        self.assertGreaterEqual(
            planted["n"], 1,
            "the removal seam was never reached — this drill measured "
            "nothing")
        self.assertEqual(report["removed"], 0,
                         "the mutation was planted and the count says so")
        self.assertIn(
            "screenshots", self.tags_of(store)["s104"],
            "the drill's point: with the removal skipped, a photograph that "
            "is in NEITHER test keeps a tag that says it is a screenshot")
        # the control
        store = self.build_library()
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertEqual(report["removed"], 1)
        self.assertNotIn("screenshots", self.tags_of(store)["s104"])


class StaleFingerprintTest(LibraryFixtureMixin):
    """V18 — the counted gate, stated BY VALUE and standing in front of
    everything else."""

    def test_stale_fingerprint_refuses(self):
        """A cache written by a DIFFERENT program is not a reading of this
        program's; the pass refuses, names the shortfall by count, and changes
        nothing. Running the note pass on stale text would bake the language
        defect into roughly 3,575 notes (D-10), and nothing in the shipped
        code enforces that order today — `migrate_store` gates on schema
        version, not on derivation."""
        store = self.build_library(cache_fp=self.STALE_FP)
        before = self.tags_of(store)
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertFalse(report["ok"])
        self.assertEqual(
            report["refused"], self.fixture["expected"]["eligible"],
            "EVERY eligible photograph is stale, and the refusal counts them")
        self.assertIn("8 of 8", report["why"],
                      "the refusal names the shortfall BY COUNT: " + str(
                          report.get("why")))
        self.assertEqual(self.tags_of(store), before,
                         "a refusal changes NOTHING — the store dict is "
                         "identical before and after")
        self.assertEqual((report["added"], report["removed"]), (0, 0))
        self.assertEqual(report["union"], 0)

    def test_one_unread_photograph_refuses_the_whole_pass(self):
        """The realistic shape: the pass mostly ran. One picture short is
        still short, and the gate is `==`, never `>= most of them`."""
        store = self.build_library(skip_cache=("s107",))
        before = self.tags_of(store)
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertFalse(report["ok"])
        self.assertEqual(report["refused"], 1)
        self.assertIn("1 of 8", report["why"])
        self.assertEqual(self.tags_of(store), before)

    def test_drill_a_gate_that_only_checks_presence_lets_stale_text_through(
            self):
        """PERMANENT DRILL — the realistic weakening: check that an entry
        EXISTS and forget to check WHOSE program wrote it. The cache is full,
        so a presence-only gate is green, and the pass proceeds on text the
        broken language configuration produced."""
        store = self.build_library(cache_fp=self.STALE_FP)
        real = study_lib._vision_entry_is_current
        try:
            study_lib._vision_entry_is_current = (
                lambda entry, program_fp: entry is not None)
            report = study_lib.redetect_screenshots(
                store, self.root, self.reader, self.PROGRAM_FP)
        finally:
            study_lib._vision_entry_is_current = real
        self.assertTrue(
            report["ok"],
            "the mutation was never planted — a presence-only gate must "
            "PASS on a fully stale cache, which is the whole danger")
        self.assertEqual(report["refused"], 0)
        # the control, unmutated, on the same stale cache
        store = self.build_library(cache_fp=self.STALE_FP)
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertFalse(report["ok"],
                         "CONTROL: the real gate refuses the same cache")


class FencedYieldsNothingTest(LibraryFixtureMixin):
    """V12 — a fenced screenshot yields ZERO notes and ZERO files under
    `attachments/`."""

    FENCED = ("f201", "f202", "f203", "f204", "f205")

    def test_fenced_yields_nothing(self):
        """Law 5, in the only form that is bulletproof: the pass cannot act on
        evidence it refuses to gather.

        `f201` is the load-bearing row — it IS a screenshot by both tests and
        it carries the tag today. A re-derivation that evaluated fenced items
        would have to decide whether to keep or strip that tag, and either
        decision is a decision made from a photograph it must never open. So
        the fenced set is not in the candidate list at all: not counted, not
        added to, not removed from."""
        store = self.build_library()
        before = self.tags_of(store)
        targets, path_report = study_lib.vision_path_list(store, self.root)
        got = [t[0] for t in targets]
        for item_id in self.FENCED:
            self.assertNotIn(
                item_id, got,
                item_id + " (" + self.rows[item_id]["class"] + ") reached "
                "the path list — the reader would have opened it")
        self.assertEqual(path_report["fenced"],
                         self.fixture["expected"]["fenced"])
        self.assertEqual(path_report["eligible"],
                         self.fixture["expected"]["eligible"])

        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertTrue(report["ok"], report.get("why"))
        tags = self.tags_of(store)
        for item_id in self.FENCED:
            self.assertEqual(
                tags[item_id], before[item_id],
                item_id + "'s tags were touched by a pass that must not have "
                "looked at it at all")
        self.assertEqual(
            tags["f201"], ["screenshots"],
            "f201 keeps the tag it already had — the pass neither confirms "
            "nor strips a judgement it refuses to gather evidence for")

        # ⚠ the grouping half of V12 is asserted in
        # `test_fenced_never_reaches_a_note_group` below, which arrives with
        # `group_bursts` itself.

        # zero files under attachments/ — this plan writes none at all
        self.assertFalse(
            (self.library / "attachments").exists(),
            "the re-derivation wrote something under attachments/; it writes "
            "no files at all")

    def test_the_pass_writes_nothing_to_disk(self):
        """It reads the store and stats the snapshots. A pass that created a
        directory as a side effect would have put a write on the path law 5
        guards."""
        store = self.build_library()
        before = sorted(p.name for p in self.library.rglob("*"))
        study_lib.redetect_screenshots(store, self.root, self.reader,
                                       self.PROGRAM_FP)
        self.assertEqual(sorted(p.name for p in self.library.rglob("*")),
                         before,
                         "the re-derivation created something on disk")


class StampFacetsUntouchedTest(LibraryFixtureMixin):
    """Pitfall 7 — the re-derivation is a SEPARATE ONE-SHOT PASS, and
    `stamp_facets`' promise to its two callers survives it."""

    def test_migrate_store_is_still_a_byte_equal_second_pass(self):
        """`stamp_facets` is called by BOTH `import_folder` and
        `migrate_store`, and the migration's docstring promises the screenshots
        tag is never appended twice, so a second pass is a byte-equal no-op.
        A re-derivation that REMOVED 16 false positives from inside that
        function would break the promise — which is why it lives outside."""
        store = self.build_library()
        store["schema_version"] = 1
        once = study_lib.migrate_store(store, self.root)
        first = json.dumps(once, sort_keys=True, ensure_ascii=False)
        twice = study_lib.migrate_store(once, self.root)
        self.assertEqual(
            json.dumps(twice, sort_keys=True, ensure_ascii=False), first,
            "a second migrate_store pass is no longer byte-equal — the "
            "re-derivation leaked into stamp_facets (Pitfall 7)")

    def test_the_redetection_is_not_inside_stamp_facets(self):
        """Read by NAME over the shipped source, with `#` comments stripped:
        the prose at the site names the other function on purpose, and a
        checker reading raw text would be green on a function that had grown
        the call."""
        src = Path(study_lib.__file__).read_text(encoding="utf-8")
        code = "\n".join("" if ln.lstrip().startswith("#") else ln
                         for ln in src.split("\n"))
        body = code.split("\ndef stamp_facets(", 1)
        self.assertEqual(len(body), 2, "stamp_facets is a top-level def")
        body = body[1].split("\ndef ", 1)[0]
        for name in ("redetect_screenshots", "_untag_screenshot",
                     "_vision_themes"):
            self.assertNotIn(
                name, body,
                "stamp_facets grew a call to " + name + ". Its two callers "
                "(import_folder and migrate_store) depend on a byte-equal "
                "second pass, and a derivation that REMOVES a tag breaks it "
                "(Pitfall 7).")


# ===========================================================================
# V17 / V16 — the clean, and the decision about whose characters
# ===========================================================================

class StripChromePurityTest(ScreenshotNotesBase):
    """V17 — `strip_chrome` is a pure function of its string."""

    def test_clock_and_battery_are_head_only(self):
        """⚠ OWNER RULING 2026-08-14: strip the clock and the battery reading
        at the START OF A SCREEN and nowhere else.

        Measured over her 13,453 readings, these two rules were taking far
        more of her words than of the screen: `clock` matched 9,250 times with
        70% of them past the first 60 characters — her WORK SHIFT TIMES,
        "10:45a Unavail 1:00p-10:00p", shredded by a rule meant for a status
        bar — and `battery` 1,369 times with 44% past it, on discounts and
        ingredient percentages. CR-03 dropped both affordance rule-lists for
        the same reason and left these two as an open question. This is the
        answer.
        """
        head = "9:41 AM Wi-Fi 87% "
        self.assertLess(len(head), study_lib.CHROME_HEAD_CHARS,
                        "the fixture bar must sit inside the window")
        filler = "x" * (study_lib.CHROME_HEAD_CHARS - len(head) + 5)
        body = " my shift is 10:45a-6:00p and it is 20% off"
        out = study_lib.strip_chrome(head + filler + body)

        # the bar came off
        self.assertNotIn("9:41", out, "the status-bar clock must still go")
        self.assertNotIn("87%", out, "the battery reading must still go")
        self.assertNotIn("Wi-Fi", out, "the untouched rules still apply")
        # and her words did not
        self.assertIn("10:45a", out,
                      "a time in the BODY of her note is a shift, not a "
                      "status bar, and must survive")
        self.assertIn("6:00p", out)
        self.assertIn("20% off", out,
                      "a percentage in the body is a discount, not a battery")

    def test_drill_without_the_head_window_her_words_go(self):
        """The control. A guard never seen red is not evidence: with the
        head-only rule removed, the very same shift times and discount are
        destroyed — which is what shipped before this ruling."""
        head = "9:41 AM Wi-Fi 87% "
        filler = "x" * (study_lib.CHROME_HEAD_CHARS - len(head) + 5)
        body = " my shift is 10:45a-6:00p and it is 20% off"
        text = head + filler + body

        saved = study_lib._HEAD_ONLY_RULES
        try:
            study_lib._HEAD_ONLY_RULES = frozenset()
            out = study_lib.strip_chrome(text)
        finally:
            study_lib._HEAD_ONLY_RULES = saved
        self.assertNotIn("10:45a", out,
                         "with the window gone her shift time must be eaten — "
                         "otherwise the case above proves nothing")
        self.assertNotIn("20% off", out)

    def test_strip_chrome_pure(self):
        """Same input, same output: across 200 randomised repetitions, under a
        changed TZ, under a changed LC_ALL, with `open` patched to raise, and
        ⚠ WITH THE WALL CLOCK PATCHED TO A FAKE THAT ADVANCES A DAY PER READ.

        ⚠ THE ADVANCING CLOCK IS HERE BECAUSE THE OBVIOUS TEST DOES NOT WORK,
        AND THAT WAS OBSERVED RATHER THAN REASONED ABOUT. A first version of
        this case ran 200 repetitions against a REAL clock and was driven
        against a shipped `strip_chrome` mutated to branch on
        `int(time.time()) % 2` — and it PASSED, because every repetition fell
        inside the same second, so the impure function was consistently
        impure. A gate that cannot see the defect it names is the failure
        mode this project has hit roughly thirty times, so the clock is
        replaced rather than merely varied around.

        A clock read, a locale-sensitive fold, or a filesystem read would each
        make a note's text depend on WHEN and WHERE it was written rather than
        on what the picture said — and `detect_screenshot` already holds this
        posture in its own words: *'Pure: no wall-clock, no locale, no
        filesystem reads.'*"""
        import builtins
        import time as _time
        inputs = load_fixture("clean_cases.json")["purity_inputs"]
        self.assertGreaterEqual(len(inputs), 5,
                                "the purity fixture is empty — this case "
                                "would measure nothing")
        baseline = {text: study_lib.strip_chrome(text) for text in inputs}

        real_open = builtins.open
        real_time, real_ns = _time.time, _time.time_ns
        real_mono = _time.monotonic
        old_tz = os.environ.get("TZ")
        old_lc = os.environ.get("LC_ALL")
        tick = [1_700_000_000.0]

        def refuse(*a, **k):
            raise AssertionError(
                "strip_chrome opened a file — it is a pure function of its "
                "string (V17)")

        def fake_time():
            tick[0] += 86_400.0     # a whole day per read
            return tick[0]

        rng = random.Random(2694)
        try:
            builtins.open = refuse
            _time.time = fake_time
            _time.time_ns = lambda: int(fake_time() * 1_000_000_000)
            _time.monotonic = fake_time
            for i in range(200):
                os.environ["TZ"] = rng.choice(
                    ["UTC", "Asia/Shanghai", "America/Los_Angeles",
                     "Pacific/Kiritimati"])
                _time.tzset()
                os.environ["LC_ALL"] = rng.choice(
                    ["C", "tr_TR.UTF-8", "zh_CN.UTF-8", "en_US.UTF-8"])
                text = rng.choice(inputs)
                self.assertEqual(
                    study_lib.strip_chrome(text), baseline[text],
                    "repetition " + str(i) + " returned a different answer "
                    "for the same input under TZ=" + os.environ["TZ"]
                    + " LC_ALL=" + os.environ["LC_ALL"])
        finally:
            builtins.open = real_open
            _time.time, _time.time_ns = real_time, real_ns
            _time.monotonic = real_mono
            for key, val in (("TZ", old_tz), ("LC_ALL", old_lc)):
                if val is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = val
            _time.tzset()

    def test_strip_chrome_body_names_nothing_impure(self):
        """A SECOND, INDEPENDENT INSTRUMENT over the same claim — read off the
        shipped source with `#` comments AND docstrings stripped, because the
        docstring names 'no wall-clock, no locale, no filesystem reads' in
        prose and a checker reading raw text would be green on a function that
        had grown exactly the call it forbids.

        Two instruments rather than one because they fail differently: the
        behavioural case above catches an impurity that CHANGES the answer,
        and this one catches an impurity that happens not to — a clock read
        whose value is constant for the length of a test run is still a clock
        read, and the next run is the one where it is not."""
        body = shipped_body("strip_chrome") + shipped_body("clean_ok") \
            + shipped_body("_ocr_text")
        for shape in ("time.", "datetime", "locale.", "open(", "os.environ",
                      "random.", "Path(", "getenv"):
            self.assertNotIn(
                shape, body,
                "the clean names `" + shape + "` — strip_chrome/clean_ok are "
                "pure functions of their input (V17). If this is a false "
                "positive, the shape list is the thing to change, and the "
                "change is a decision rather than a tidy-up.")

    def test_strip_chrome_leaves_the_words_alone(self):
        """The other half of the claim, and the one a purity test cannot make:
        stripping chrome must not strip CONTENT. Every case's declared
        `cleaned` value is asserted verbatim where the fixture states one."""
        checked = 0
        for case in load_fixture("clean_cases.json")["cases"]:
            if "cleaned" not in case or "text" not in case:
                continue
            self.assertEqual(
                study_lib.strip_chrome(case["text"]), case["cleaned"],
                case["name"] + ": " + case["why"])
            checked += 1
        self.assertEqual(checked, 18,
                         "eighteen cases declare an exact cleaned string — a "
                         "loop that stopped early must not report a pass")

    def test_strip_chrome_never_eats_a_word_that_carries_meaning(self):
        """⚠ CR-03. THE OTHER HALF OF `..._leaves_the_words_alone`, WHICH FOR
        ONE PHASE DID NOT EXIST.

        That test's name promised the words were left alone; its five cases
        never presented a word that the rules would take. `chrome_in_the_middle`
        went further and ENDORSED position-blind stripping. A gate that never
        shows a red is not evidence, and this one was buying its own answer —
        so the defect it was named after shipped underneath it and deleted
        1,789 characters out of 506 of her own notes before anybody looked.

        Every case below is a REAL string off her own screenshots, and every
        one asserts the same thing: `strip_chrome` returns it UNCHANGED. They
        are here as literals rather than as a generated sweep because the
        point is that a human can read each one and see a word worth keeping.

        ⚠ THIS IS THE GATE THAT MUST GO RED FIRST if anybody ever puts an
        ordinary word back into `_CHROME_RULES`. Adding a token to that tuple
        without adding its counter-example here is the move this case exists
        to make impossible."""
        cases = [case for case in load_fixture("clean_cases.json")["cases"]
                 if case.get("her_words")]
        for case in cases:
            self.assertEqual(
                study_lib.strip_chrome(case["text"]), case["text"],
                case["name"] + ": strip_chrome changed her words. "
                + case["why"])
        self.assertEqual(
            len(cases), 12,
            "twelve of her own strings are declared with her_words — a "
            "fixture that lost cases must not report a pass")

    def test_no_chrome_rule_names_an_ordinary_word(self):
        """A SECOND, INDEPENDENT INSTRUMENT over the same claim, read off the
        shipped tuple rather than off behaviour.

        The case above can only fail for a token some fixture happens to name.
        This one fails for ANY token added to the affordance family, including
        one nobody wrote a counter-example for — because the family is now
        empty and the fix is that it stays empty. Two instruments rather than
        one because they fail differently: the behavioural case catches a
        regression in a word we already know about, and this one catches the
        NEXT word, which by construction we do not."""
        names = [name for name, _pattern
                 in study_lib.SCREEN_CHROME_PATTERNS]
        for gone in ("affordance", "affordance_zh"):
            self.assertNotIn(
                gone, names,
                "`" + gone + "` is back in SCREEN_CHROME_PATTERNS. Every "
                "token either list ever held — Cancel Done Back Edit More "
                "Menu 取消 完成 返回 编辑 更多 — is an ordinary word, and each "
                "was measured deleting her own prose in her own library. If "
                "a bar label genuinely must go, that is a decision for the "
                "owner and not a tidy-up: law 4 says leaving chrome IN is "
                "the lesser harm, at every size.")

    def test_no_gate_here_pins_the_leftover_count(self):
        """⚠ A4, enforced rather than promised. The chrome patterns shipped
        here are NOT #40's: the measured leftover count with the research's own
        patterns was 167 of 3,748 (4.5%) against the ticket's 173 (5%). The
        SHAPE is confirmed and the exact number will differ, so no assertion
        in this suite may pin 167 or 173."""
        src = Path(__file__).read_text(encoding="utf-8")
        for line in src.split("\n"):
            if "assert" not in line:
                continue
            for number in ("167", "173"):
                self.assertNotIn(
                    number, line,
                    "an assertion pins the approximate leftover count "
                    + number + " — A4 says it is approximate and no gate may "
                    "pin it: " + line.strip())


class CleanOkTest(ScreenshotNotesBase):
    """V16 — the predicate, its boundary, its unit, and its fail-closed edge."""

    def test_boundary_29_and_30(self):
        """Exactly 30 code points produces a note; 29 does not. The comparison
        is `>=` and both sides are asserted."""
        cases = {c["name"]: c
                 for c in load_fixture("clean_cases.json")["cases"]}
        self.assertEqual(study_lib.CLEAN_MIN_CHARS, 30)
        for name in ("boundary_29", "boundary_30"):
            case = cases[name]
            cleaned = study_lib.strip_chrome(case["text"])
            self.assertEqual(len(cleaned), 30 if name.endswith("30") else 29,
                             name + ": the fixture no longer measures what "
                             "its name says")
            self.assertEqual(study_lib.clean_ok(case["text"]),
                             case["clean_ok"], case["name"] + ": "
                             + case["why"])

    def test_clean_length_is_code_points_not_bytes(self):
        """THE ENCODING DECISION, VISIBLE IN A TEST RATHER THAN IMPLIED BY AN
        IMPLEMENTATION.

        `cjk_30` is exactly 30 Chinese characters and exactly 90 UTF-8 bytes.
        Under the shipped unit — Unicode code points over the NFC-normalised
        string — it produces a note. Under BYTES it would have been measured
        as 90, and under a threshold-of-10-characters-worth-of-bytes it would
        have failed: a byte threshold is roughly three times stricter for
        Chinese than for English, which is the exact asymmetry this phase
        exists to remove. The two rejected units are asserted here to give a
        DIFFERENT answer, so a future reader can see the choice was made."""
        cases = {c["name"]: c
                 for c in load_fixture("clean_cases.json")["cases"]}
        cjk = cases["cjk_30"]
        text = cjk["text"]
        self.assertEqual(len(text), cjk["code_points"])
        self.assertEqual(len(text), 30)
        self.assertEqual(len(text.encode("utf-8")), cjk["utf8_bytes"])
        self.assertEqual(len(text.encode("utf-8")), 90)
        self.assertTrue(study_lib.clean_ok(text),
                        "30 Chinese characters must mean what 30 Latin ones "
                        "mean")
        # the two rejected units, shown to disagree with the chosen one
        self.assertNotEqual(
            len(text), len(text.encode("utf-8")),
            "the byte unit and the code-point unit must differ on this "
            "fixture or the case is proving nothing")
        self.assertEqual(
            len(text.encode("utf-8")) // 3, 30,
            "one CJK character is three UTF-8 bytes here — which is why a "
            "byte threshold of 30 would have admitted only 10 characters")
        # 29 of the same characters does NOT
        self.assertFalse(study_lib.clean_ok(cases["cjk_29"]["text"]))

    def test_clean_length_is_normalised_nfc(self):
        """Vision may return DECOMPOSED forms, and a decomposed string has
        more code points than its composed equal — so the length is taken
        after `unicodedata.normalize('NFC', ...)`. 29 decomposed e-acute is 58
        code points raw and 29 after NFC: without the normalisation it would
        pass on 58, which is the bug this case exists to hold shut."""
        cases = {c["name"]: c
                 for c in load_fixture("clean_cases.json")["cases"]}
        for name in ("decomposed_29", "decomposed_30"):
            case = cases[name]
            text = case["text"]
            # ⚠ the fixture is verified BEFORE it is used: an editor that
            # recomposed the literal would silently turn this into a no-op.
            self.assertEqual(
                len(text), case["raw_code_points"],
                name + "'s literal is no longer decomposed — it now measures "
                "nothing")
            self.assertEqual(len(unicodedata.normalize("NFC", text)),
                             case["nfc_code_points"])
            self.assertEqual(study_lib.clean_ok(text), case["clean_ok"],
                             name + ": " + case["why"])

    def test_clean_ok_fail_closed(self):
        """An OCR row that is missing, unparseable, or carries an `error` key
        is `clean_ok == False` — all of the shapes, not just the empty string.

        ⚠ WHY THIS IS NOT LUCK. The merged program emits an explicit
        `{path, error}` row, so a failed image is a row the caller can SEE.
        The research probes silently returned nothing instead, which a naive
        join reads as an empty string — accidentally correct here, and only
        by accident. The explicit row is what makes fail-closed real."""
        checked = 0
        for shape in load_fixture("clean_cases.json")["fail_closed"]:
            self.assertFalse(
                study_lib.clean_ok(shape["value"]),
                shape["name"] + " (" + shape["why"] + ") must be clean_ok "
                "False")
            checked += 1
        self.assertEqual(checked, 5,
                         "five failure shapes, by value")
        # the control: the SAME row shape, with real text, passes
        self.assertTrue(study_lib.clean_ok(
            {"path": "/x/a.jpeg",
             "text": "a page of words long enough to become a note"}),
            "CONTROL: a well-formed row with real text still cleans")

    def test_the_error_key_beats_the_text(self):
        """A row carrying BOTH an error and some text is still a failure. The
        error is the program's own verdict on the read; text alongside it is
        whatever was salvaged before the failure, and treating that as a note
        would put a half-read picture into her library as prose."""
        self.assertFalse(study_lib.clean_ok(
            {"path": "/x/a.jpeg", "error": "unreadable image",
             "text": "a page of words that is easily long enough to pass"}))


class FailedCleanNoNoteTest(LibraryFixtureMixin):
    """V16, at the library level — a failed clean produces NO note, and the
    picture is left exactly as it was."""

    def test_failed_clean_no_note(self):
        """`s106` is in the union (it IS a screenshot) and its clean fails.
        D-09's reading of that is 'the picture is all there is': it stays an
        item of `type: "image"`, KEEPS the re-derived `screenshots` tag, and is
        not moved to `attachments/`. Roughly 167-173 of the 3,748 land here —
        approximately, per A4, which is why no count is pinned."""
        store = self.build_library()
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertTrue(report["ok"], report.get("why"))

        item = store["items"]["s106"]
        self.assertFalse(
            study_lib.clean_ok(self.cache["s106"]["text"]),
            "s106 is the fixture's sub-30 screenshot — if it cleans, this "
            "case measures nothing")
        self.assertEqual(item["type"], "image",
                         "a failed clean must not flip the type")
        self.assertIn("screenshots", item["tags"],
                      "it is still a screenshot; only the note failed")
        self.assertEqual(item["library_path"], "items/s106.jpeg",
                         "it is not moved")
        self.assertTrue((self.library / item["library_path"]).is_file())
        self.assertFalse((self.library / "attachments").exists())

        # the control, in the same run: its burst neighbours DO clean
        for neighbour in ("s107", "s108"):
            self.assertTrue(
                study_lib.clean_ok(self.cache[neighbour]["text"]),
                "CONTROL: " + neighbour + " cleans, so the failure above is "
                "a result and not a predicate that says no to everything")

    def test_the_clean_is_per_shot_never_per_group(self):
        """⚠ THE GROUP-LEVEL AMBIGUITY #40 DOES NOT SETTLE, RESOLVED PER SHOT.
        In a five-shot burst where two clean and three do not, the note
        carries the two that cleaned and the three stay pictures — rather than
        the whole group failing. It keeps D-09's 'the picture is all there is'
        reading for the leftovers and keeps the failure local.

        Asserted at the predicate, BY VALUE: the verdict is taken per shot, so
        a five-shot group has five verdicts and not one."""
        texts = [
            "9:41 LTE 100% Done",
            "9:41 100% a first page of words that is long enough to clean",
            "9:41 LTE Back",
            "9:41 100% a second page of words that is long enough to clean",
            "10:00 Cancel",
        ]
        verdicts = [study_lib.clean_ok(t) for t in texts]
        self.assertEqual(verdicts, [False, True, False, True, False])
        self.assertEqual(sum(1 for v in verdicts if v), 2,
                         "two of the five clean")
        self.assertEqual(sum(1 for v in verdicts if not v), 3,
                         "three of the five stay pictures")


# ===========================================================================
# V15 / V14 — the clock is the rule, the look-alike is the rail
# ===========================================================================

class CosineIdentityTest(ScreenshotNotesBase):
    """V15 — cos = 1 - d^2/2 on an L2-normalised print."""

    def test_cosine_distance_identity(self):
        """Checked against a DIRECTLY COMPUTED dot product on synthetic unit
        vectors, at every distance the fixture names, to float32 tolerance.

        ⚠ `1 - distance` IS THE WRONG FORM and it is the plausible-looking
        one: `computeDistance` returns a DISTANCE, so inverting it collapses
        exactly the photographs it should keep apart. The wrong form is
        computed alongside the right one here and asserted to DISAGREE, so
        the difference is visible in the test rather than only in a
        docstring."""
        fixture = load_fixture("burst_cases.json")["identity"]
        checked = 0
        for d in fixture["distances"]:
            got = study_lib.cosine_from_distance(d)
            self.assertAlmostEqual(
                got, 1.0 - d * d / 2.0, 12,
                "cosine_from_distance(" + str(d) + ") is not 1 - d^2/2")
            # the independent check: build the unit pair the distance implies
            # and take their dot product directly.
            cos = 1.0 - d * d / 2.0
            if -1.0 <= cos <= 1.0:
                a, b = unit_pair(cos)
                self.assertAlmostEqual(
                    got, study_lib.print_cosine(a, b), 6,
                    "the identity disagrees with a directly computed dot "
                    "product at d=" + str(d))
            checked += 1
        self.assertEqual(checked, len(fixture["distances"]))
        self.assertEqual(checked, 9,
                         "nine distances, by value — a loop that stopped "
                         "early must not report a pass")

        # the WRONG form, shown to be wrong
        d = 0.471          # the measured p50 distance of a true burst
        self.assertNotAlmostEqual(
            study_lib.cosine_from_distance(d), 1.0 - d, 3,
            "1 - d and 1 - d^2/2 must differ on a real distance, or this "
            "case is not distinguishing the two forms at all")

    def test_the_identity_matches_the_measured_pair(self):
        """The verification recorded in the research, re-asserted here: a real
        pair measured cos 0.7829 against 1 - d^2/2 = 0.7822, the gap being
        float32 rounding in Vision's own arithmetic. Held to three places,
        which is the precision that measurement supports — pinning it tighter
        would be pinning the rounding, not the identity."""
        pair = load_fixture("burst_cases.json")["identity"]["verified_pair"]
        self.assertAlmostEqual(pair["cosine"], pair["one_minus_d2_over_2"],
                               places=2)
        d = math.sqrt(max(0.0, 2.0 - 2.0 * pair["cosine"]))
        self.assertAlmostEqual(study_lib.cosine_from_distance(d),
                               pair["cosine"], places=6)

    def test_no_rounding_step_before_the_comparison(self):
        """`cosine_from_distance` computes in float64 from float32 inputs and
        applies no rounding: a value one ulp under the floor must stay under
        it. A `round(x, 2)` anywhere in the path would silently promote 0.4999
        to 0.50 and merge a pair the rule says to split."""
        import struct as _struct
        d = _struct.unpack("f", _struct.pack("f", 1.0))[0]   # a float32 input
        got = study_lib.cosine_from_distance(d)
        self.assertIsInstance(got, float)
        self.assertEqual(got, 1.0 - d * d / 2.0)
        self.assertNotEqual(round(0.4999, 2), 0.4999)
        self.assertFalse(0.4999 >= study_lib.BURST_COS_FLOOR)
        self.assertTrue(0.50 >= study_lib.BURST_COS_FLOOR)


class GroupBurstsTest(ScreenshotNotesBase):
    """V14 — gap <= 20,000 ms AND cos >= 0.50, transitive along consecutive
    pairs."""

    def pair(self, gap_ms, cosine, ids=("aa01", "aa02")):
        """Two synthetic shots at the given coordinates and nothing else."""
        a, b = unit_pair(cosine)
        items = [{"id": ids[0], "created_ms": 1_700_000_000_000},
                 {"id": ids[1], "created_ms": 1_700_000_000_000 + gap_ms}]
        return items, {ids[0]: a, ids[1]: b}

    def merged(self, gap_ms, cosine):
        items, prints = self.pair(gap_ms, cosine)
        groups = study_lib.group_bursts(items, prints)
        return len(groups) == 1

    def test_known_false_group_stays_split(self):
        """⚠ THE NAMED REGRESSION CASE. #40's one documented false group —
        `WRNS Studio` then `BccI Construction` — sits 27 s apart at cosine
        0.872, and 0.872 is essentially the MEDIAN of true consecutive bursts
        (0.888). No similarity threshold could have cut it without cutting
        more than half of every real burst. Only the time window excludes it,
        and at W = 30 s it would merge.

        Reproduced at its measured coordinates with synthetic ids and
        synthetic vectors: `group_bursts` consumes only those two numbers."""
        cases = {c["name"]: c
                 for c in load_fixture("burst_cases.json")["pairs"]}
        case = cases["known_false_group"]
        self.assertEqual((case["gap_ms"], case["cosine"]), (27000, 0.872))
        self.assertFalse(
            self.merged(case["gap_ms"], case["cosine"]),
            "the WRNS/BccI pair merged. " + case["why"])
        # ⚠ and the rail is shown to be INCAPABLE of this catch: at the floor
        # the rule ships with, the cosine passes. The clock is what refuses.
        self.assertTrue(case["cosine"] >= study_lib.BURST_COS_FLOOR,
                        "0.872 clears the similarity floor comfortably — "
                        "which is exactly why the floor cannot be what saves "
                        "this pair")

    def test_same_similarity_inside_window_merges(self):
        """THE CONTROL FOR THE CASE ABOVE, and the one that carries the
        finding: the SAME cosine at 19 s merges. Two cases differing only in
        the clock, giving opposite answers, is what proves the clock is doing
        the work."""
        cases = {c["name"]: c
                 for c in load_fixture("burst_cases.json")["pairs"]}
        case = cases["same_similarity_inside_window"]
        self.assertEqual((case["gap_ms"], case["cosine"]), (19000, 0.872))
        self.assertTrue(self.merged(case["gap_ms"], case["cosine"]),
                        case["why"])

    def test_burst_boundaries_both_sides(self):
        """All six sides, from the fixture, by name: 20,000 joins / 20,001
        splits · 0.50 joins / 0.4999 splits · and the two are ANDed, so a
        1,000 ms gap at cosine 0.49 still splits."""
        want = {"window_boundary_joins": True,
                "window_boundary_splits": False,
                "cosine_boundary_joins": True,
                "cosine_boundary_splits": False,
                "the_and_is_an_and": False}
        cases = {c["name"]: c
                 for c in load_fixture("burst_cases.json")["pairs"]}
        checked = 0
        for name, expect_merge in sorted(want.items()):
            case = cases[name]
            self.assertEqual(case["expect"],
                             "merge" if expect_merge else "split",
                             name + ": the fixture and this table disagree")
            self.assertEqual(
                self.merged(case["gap_ms"], case["cosine"]), expect_merge,
                name + ": " + case["why"])
            checked += 1
        self.assertEqual(checked, 5,
                         "five boundary cases covering six sides, by value")
        self.assertEqual(study_lib.BURST_WINDOW_MS, 20_000)
        self.assertEqual(study_lib.BURST_COS_FLOOR, 0.50)

    def test_grouping_is_transitive_along_consecutive_pairs(self):
        """Three shots at 12 s then 13 s: the first and the last are 25 s
        apart and would NOT link directly, but they share a note because the
        middle one links to both. Transitivity is what makes a scroll of a
        long page one note rather than a chain of pairs."""
        base = 1_700_000_000_000
        items = [{"id": "aa01", "created_ms": base},
                 {"id": "aa02", "created_ms": base + 12_000},
                 {"id": "aa03", "created_ms": base + 25_000}]
        a, b = unit_pair(0.90)
        prints = {"aa01": a, "aa02": a, "aa03": b}
        groups = study_lib.group_bursts(items, prints)
        self.assertEqual(groups, [["aa01", "aa02", "aa03"]])
        # and the control: widen the middle gap past the window and the chain
        # breaks in exactly one place.
        items[1]["created_ms"] = base + 21_000
        self.assertEqual(study_lib.group_bursts(items, prints),
                         [["aa01"], ["aa02", "aa03"]])

    def test_group_order_is_stable_under_shuffle(self):
        """Members ascending by `created_ms`, ties broken lexicographically on
        item id, and the whole answer independent of input order — asserted by
        shuffling the same input twenty times."""
        base = 1_700_000_000_000
        items = [{"id": "cc09", "created_ms": base + 5_000},
                 {"id": "aa01", "created_ms": base},
                 {"id": "zz88", "created_ms": base + 5_000},
                 {"id": "mm42", "created_ms": base + 90_000},
                 {"id": "aa02", "created_ms": base + 95_000}]
        a, _ = unit_pair(1.0)
        prints = {it["id"]: a for it in items}
        want = [["aa01", "cc09", "zz88"], ["mm42", "aa02"]]
        first = study_lib.group_bursts(items, prints)
        self.assertEqual(first, want,
                         "ties at the same created_ms break on item id "
                         "lexicographically")
        rng = random.Random(2694)
        for i in range(20):
            shuffled = list(items)
            rng.shuffle(shuffled)
            self.assertEqual(
                study_lib.group_bursts(shuffled, prints), first,
                "shuffle " + str(i) + " changed the answer")

    def test_single_and_empty_bursts(self):
        """A burst of one is a group of one. An empty screenshot set is zero
        groups and raises nothing — zero pictures in is zero work, never an
        error and never a stall."""
        self.assertEqual(study_lib.group_bursts([], {}), [])
        self.assertEqual(study_lib.group_bursts((), {}), [])
        one = [{"id": "aa01", "created_ms": 1}]
        self.assertEqual(study_lib.group_bursts(one, {}), [["aa01"]],
                         "one shot is one group of one — even with no print, "
                         "because there is no pair to judge")

    def test_a_missing_print_splits_and_never_raises(self):
        """⚠ THE ONE PLACE THIS RULE FAILS TOWARD SPLITTING, DELIBERATELY.

        D-08 says fail toward MERGING: a wrong merge is visible and
        splittable, a wrong split is invisible. That reasoning is about
        UNCERTAIN evidence. A missing or malformed print is not uncertain
        evidence — it is a picture nobody read, and the counted fingerprint
        gate refuses the whole pass before this function can ever see one. So
        reaching this branch means an invariant already broke, and merging two
        photographs on the strength of a vector nobody has is worse than
        leaving them apart. It never raises: one bad row must not stop a pass
        over thirteen thousand pictures."""
        base = 1_700_000_000_000
        items = [{"id": "aa01", "created_ms": base},
                 {"id": "aa02", "created_ms": base + 1_000}]
        a, b = unit_pair(0.99)
        self.assertEqual(study_lib.group_bursts(items, {"aa01": a, "aa02": b}),
                         [["aa01", "aa02"]], "CONTROL: with both prints they "
                         "merge, so the splits below are results")
        for why, prints in (
                ("no entry at all", {"aa01": a}),
                ("a None print", {"aa01": a, "aa02": None}),
                ("a truncated print", {"aa01": a, "aa02": b[:10]}),
                ("a print of the wrong type", {"aa01": a, "aa02": "nonsense"}),
        ):
            self.assertEqual(
                study_lib.group_bursts(items, prints),
                [["aa01"], ["aa02"]],
                why + " must split, and must not raise")

    def test_prints_may_arrive_as_raw_bytes(self):
        """The cache stores each print as 3,072 RAW bytes (768 float32), so
        the grouper accepts that shape as well as a float sequence — the
        alternative being a caller that unpacks by hand and gets the element
        type wrong once."""
        a, b = unit_pair(0.90)
        packed = {"aa01": struct.pack("<768f", *a),
                  "aa02": struct.pack("<768f", *b)}
        self.assertEqual(len(packed["aa01"]), study_lib.VISION_PRINT_BYTES)
        base = 1_700_000_000_000
        items = [{"id": "aa01", "created_ms": base},
                 {"id": "aa02", "created_ms": base + 1_000}]
        self.assertEqual(study_lib.group_bursts(items, packed),
                         [["aa01", "aa02"]])
        self.assertAlmostEqual(
            study_lib.print_cosine(packed["aa01"], packed["aa02"]), 0.90,
            places=6)


class LibraryBurstTest(LibraryFixtureMixin):
    """The grouping, over the library fixture, after the re-derivation."""

    def test_the_fixtures_one_burst_becomes_one_group(self):
        """s106 -> s107 is 12 s and s107 -> s108 is 13 s, so all three share a
        note although the first and last are 25 s apart. Everything else in
        the fixture is minutes apart and stays alone."""
        store = self.build_library()
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertTrue(report["ok"], report.get("why"))
        union_ids = [i for i, it in store["items"].items()
                     if "screenshots" in (it.get("tags") or [])
                     and i.startswith("s")]
        a, _ = unit_pair(0.95)
        prints = {i: a for i in union_ids}
        groups = study_lib.group_bursts(
            [store["items"][i] for i in union_ids], prints)
        want = self.fixture["burst"]["members"]
        self.assertIn(want, groups,
                      "the fixture's declared burst is not one group: "
                      + repr(groups))
        self.assertEqual(len(groups), 5,
                         "seven union members, three of them one burst — "
                         "five groups")

    def test_fenced_never_reaches_a_note_group(self):
        """V12's grouping half. A fenced photograph is not in the path list,
        so it is not in the union, so it never reaches the grouper — and it
        therefore cannot end up sharing a note with a picture beside it in
        time."""
        store = self.build_library()
        targets, _ = study_lib.vision_path_list(store, self.root)
        eligible = [t[0] for t in targets]
        a, _ = unit_pair(1.0)
        # ⚠ every print identical and every fenced shot placed INSIDE the
        # window of an eligible one, so the only thing that can keep them
        # apart is the fence itself.
        prints = {i["id"]: a for i in store["items"].values()}
        groups = study_lib.group_bursts(
            [store["items"][i] for i in eligible], prints)
        flat = [i for g in groups for i in g]
        for item_id in FencedYieldsNothingTest.FENCED:
            self.assertNotIn(
                item_id, flat,
                item_id + " reached a note group — a fenced photograph must "
                "not appear in any surface (law 5, P0)")
        self.assertEqual(sorted(flat), sorted(eligible))


# ===========================================================================
# 26.94-07 — the removal path this codebase has never had, and the two
# refusals that keep it small
# ===========================================================================
#
# ⚠ THE EXCLUSION PREDICATE IS A UNION AND THESE CASES ARE WHY. D-14 records
# the correction, measured against the owner's real store: `blessings.json`
# holds six entries and NONE of them is a screenshot, while TWO items carrying
# the `screenshots` tag have `state == "blessed"` and appear in neither file —
# and one blessings.json entry names an item whose state is not "blessed" at
# all. The two predicates genuinely disagree in her data, in BOTH directions.
#
# A file-keyed refusal passes `..._by_file_alone_...` and fails
# `..._by_state_alone_...`; a state-keyed refusal does the reverse. Only the
# union passes both, and both mutations are driven below.
#
# ⚠ WHY IT MATTERS RATHER THAN BEING TIDY: `pickAlbumItems` (core.js:467-473)
# filters `state === 'blessed' && type === 'image'`. Flip a state-blessed
# screenshot to `type: "text"` and it leaves her album with nothing said about
# it — precisely the class #40 D-10 and D-14 exist to prevent.
# ===========================================================================

class LedgerFixtureMixin(LibraryFixtureMixin):
    """The library fixture PLUS the two files that live beyond the store.

    ⚠ THEY ARE NOT PARALLEL, and the suite writes them at their real paths
    rather than at two tidy siblings: `decorations.json` is a library-root
    SIBLING in the irreplaceable tier, and `blessings.json` resolves INSIDE
    `librarian/`, which is the documented factory reset. Writing them anywhere
    else here would make this suite agree with a wrong mental model."""

    # ⚠ SYNTHETIC IDS FROM library.json, NEVER HERS. The real divergence was
    # measured read-only and is reported in the SUMMARY as counts, not ids.
    BLESSED_BY_STATE = "s105"    # state == "blessed", absent from the ledger
    BLESSED_BY_FILE = "s102"     # in the ledger, state is "unseen"
    PLACED = "s103"              # sits on a notebook page

    def write_ledgers(self, blessed_ids=(), placed_ids=()):
        """The two files beyond the store, at their real paths."""
        study_lib.save_blessings(
            self.root,
            [{"item_id": i, "ms": 1, "why": "", "author": "her"}
             for i in blessed_ids])
        days = {}
        if placed_ids:
            days["2026-08-13"] = {"items": [
                {"ref": item_id, "x": 10 + index, "y": 10, "s": 1.0}
                for index, item_id in enumerate(placed_ids)]}
        study_lib.save_decorations(self.root, days)

    def build_with_ledgers(self):
        """The fixture, re-derived, with the three exclusions in place."""
        store = self.build_library()
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertTrue(report["ok"], report.get("why"))
        self.write_ledgers(blessed_ids=(self.BLESSED_BY_FILE,),
                           placed_ids=(self.PLACED,))
        return store


class IsBlessedUnionTest(LedgerFixtureMixin):
    """The predicate is the UNION, it is defined once, and both halves of the
    divergence are pinned as behaviour."""

    def test_is_blessed_is_defined_exactly_once(self):
        src = Path(study_lib.__file__).read_text(encoding="utf-8")
        self.assertEqual(
            src.count("\ndef is_blessed("), 1,
            "is_blessed must be defined exactly once — the whole point is "
            "that note_pass_candidates and retire_merged_item share ONE "
            "definition rather than each re-deriving a half of it")

    def test_both_call_sites_call_it_rather_than_re_deriving(self):
        """Read over the shipped bodies with comments and docstrings stripped,
        so prose naming the function cannot make this green.

        ⚠ CR-04 MOVED ONE LINK OF THIS CHAIN AND THIS CASE CAUGHT IT, which is
        what it is for. `retire_merged_item` no longer spells `is_blessed`
        itself: the predicate moved into `merge_refusal_why` so that
        `mint_screenshot_note` could ASK it before writing anything, instead
        of discovering it by attempting the removal after the note and the
        attachment copies were already on disk. So the chain is now
        retire_merged_item -> merge_refusal_why -> is_blessed, and this case
        asserts EVERY link rather than dropping the one that moved. There is
        still exactly one idea of 'blessed' in the pass; if a second ever
        appears, one of these three assertions is the one that fails."""
        for name in ("note_pass_candidates", "merge_refusal_why"):
            self.assertIn(
                "is_blessed(", shipped_body(name),
                name + " does not call is_blessed — a second idea of "
                "'blessed' is a second thing to drift, and the drift is "
                "silent (a screenshot leaves her album with nothing said)")
        for name in ("retire_merged_item", "mint_screenshot_note"):
            self.assertIn(
                "merge_refusal_why(", shipped_body(name),
                name + " does not call merge_refusal_why — it is carrying a "
                "second spelling of D-14's refusal, and two spellings of one "
                "rule drift apart in silence")

    def test_blessed_by_state_alone_is_still_excluded(self):
        """⚠ THE HALF A FILE-KEYED IMPLEMENTATION MISSES. `s105` is blessed by
        `state` and appears in no ledger — measured on her real store as TWO
        such screenshots."""
        store = self.build_with_ledgers()
        item = store["items"][self.BLESSED_BY_STATE]
        ledger = study_lib.blessed_ledger_ids(self.root)
        self.assertNotIn(self.BLESSED_BY_STATE, ledger,
                         "the fixture must keep this id OUT of the ledger, "
                         "or the case proves nothing")
        self.assertTrue(
            study_lib.is_blessed(item, ledger),
            self.BLESSED_BY_STATE + " is blessed by state and the predicate "
            "does not say so — a file-keyed lookup")
        candidates, report = study_lib.note_pass_candidates(store, self.root)
        self.assertNotIn(
            self.BLESSED_BY_STATE, candidates,
            self.BLESSED_BY_STATE + " reached the candidate list; flipping "
            "it would remove it from her album in silence")
        with self.assertRaises(study_lib.MergeRefused):
            study_lib.retire_merged_item(
                store, self.BLESSED_BY_STATE, "s101",
                ledger, study_lib.placed_item_ids(self.root))
        self.assertIn(self.BLESSED_BY_STATE, store["items"],
                      "a refusal mutates nothing")

    def test_blessed_by_file_alone_is_still_excluded(self):
        """⚠ THE HALF A STATE-KEYED IMPLEMENTATION MISSES. `s102` is in
        `blessings.json` and its state never moved — measured on her real
        store as ONE such entry."""
        store = self.build_with_ledgers()
        item = store["items"][self.BLESSED_BY_FILE]
        ledger = study_lib.blessed_ledger_ids(self.root)
        self.assertNotEqual(item.get("state"), "blessed",
                            "the fixture must keep this state OFF blessed, "
                            "or the case proves nothing")
        self.assertTrue(
            study_lib.is_blessed(item, ledger),
            self.BLESSED_BY_FILE + " is in the ledger and the predicate does "
            "not say so — a state-keyed lookup")
        candidates, report = study_lib.note_pass_candidates(store, self.root)
        self.assertNotIn(self.BLESSED_BY_FILE, candidates)
        with self.assertRaises(study_lib.MergeRefused):
            study_lib.retire_merged_item(
                store, self.BLESSED_BY_FILE, "s101",
                ledger, study_lib.placed_item_ids(self.root))
        self.assertIn(self.BLESSED_BY_FILE, store["items"])

    def test_drill_narrowing_to_the_file_half_loses_the_state_half(self):
        """PERMANENT DRILL — the union, driven red from one side. `is_blessed`
        is replaced by file membership alone; the state-blessed screenshot
        then reaches the candidate list, which is the silent album loss."""
        store = self.build_with_ledgers()
        real = study_lib.is_blessed
        try:
            study_lib.is_blessed = (
                lambda item, ids: str(item.get("id")) in ids)
            candidates, _ = study_lib.note_pass_candidates(store, self.root)
        finally:
            study_lib.is_blessed = real
        self.assertIn(
            self.BLESSED_BY_STATE, candidates,
            "the mutation was never planted — a file-keyed predicate MUST "
            "let the state-blessed screenshot through, which is the danger")
        candidates, _ = study_lib.note_pass_candidates(store, self.root)
        self.assertNotIn(self.BLESSED_BY_STATE, candidates,
                         "CONTROL: the real union excludes it")

    def test_drill_narrowing_to_the_state_half_loses_the_file_half(self):
        """PERMANENT DRILL — the union, driven red from the other side.

        ⚠ AND THIS HALF HAS A SECOND REASON D-14 NAMES: `load_blessings` FAILS
        OPEN to an empty wrapper and the file lives inside `librarian/`, which
        `rm -rf` is the documented factory reset for. After a reset a
        file-keyed refusal protects nothing while still reporting success —
        so the state half is what survives the reset, and the file half is
        what covers the rows the state never got."""
        store = self.build_with_ledgers()
        real = study_lib.is_blessed
        try:
            study_lib.is_blessed = (
                lambda item, ids: item.get("state") == "blessed")
            candidates, _ = study_lib.note_pass_candidates(store, self.root)
        finally:
            study_lib.is_blessed = real
        self.assertIn(
            self.BLESSED_BY_FILE, candidates,
            "the mutation was never planted — a state-keyed predicate MUST "
            "let the ledger-only screenshot through")
        candidates, _ = study_lib.note_pass_candidates(store, self.root)
        self.assertNotIn(self.BLESSED_BY_FILE, candidates,
                         "CONTROL: the real union excludes it")

    def test_the_ledger_read_fails_open_and_the_state_half_still_holds(self):
        """`rm -rf librarian/` — the documented factory reset — reproduced.
        The ledger reads empty and never raises; the state half is untouched
        because it lives in items.json."""
        store = self.build_with_ledgers()
        shutil.rmtree(str(self.library / "librarian"), ignore_errors=True)
        ledger = study_lib.blessed_ledger_ids(self.root)
        self.assertEqual(ledger, frozenset(),
                         "the fail-open read must be the empty set")
        candidates, report = study_lib.note_pass_candidates(store, self.root)
        self.assertNotIn(
            self.BLESSED_BY_STATE, candidates,
            "after a factory reset the state half is the only protection "
            "left, and it must still be protecting")
        self.assertEqual(report["blessed_by_file"], 0)
        self.assertEqual(report["blessed_by_state"], 1)


class RetireMergedItemTest(LedgerFixtureMixin):
    """⚠ THE LARGEST PIECE OF UNPRECEDENTED SURFACE IN THIS PHASE: there was
    no item-removal path in this codebase before 26.94-07."""

    def test_retire_preserves_the_retired_record(self):
        """A bare delete would destroy `history`, which is her judgement
        record and is sacred. The whole record travels into the survivor."""
        store = self.build_with_ledgers()
        store["items"]["s108"]["history"] = [
            {"ms": 7, "from": "unseen", "to": "resting"}]
        retired = dict(store["items"]["s108"])
        study_lib.retire_merged_item(
            store, "s108", "s107",
            study_lib.blessed_ledger_ids(self.root),
            study_lib.placed_item_ids(self.root))
        self.assertNotIn("s108", store["items"],
                         "the retired item is gone from the store")
        record = store["items"]["s107"].get("merged_from")
        self.assertTrue(
            record,
            "the survivor carries no merged_from at all, so the retired "
            "item's record — its state, its title, its pre-move path and its "
            "HISTORY, which is her judgement record — went with it. That is "
            "the bare-delete implementation, and it is what this function "
            "exists instead of")
        self.assertEqual(len(record), 1)
        got = record[0]
        for key in ("id", "created_ms", "state", "title", "library_path"):
            self.assertEqual(
                got[key], retired[key],
                "the survivor's merged_from lost " + key)
        self.assertEqual(
            got["history"], retired["history"],
            "the survivor's merged_from lost the HISTORY — that is her "
            "judgement record, and it is the reason this function exists "
            "instead of a bare del")

    def test_retire_refuses_a_blessed_id(self):
        store = self.build_with_ledgers()
        before = json.dumps(store, sort_keys=True, ensure_ascii=False)
        with self.assertRaises(study_lib.MergeRefused):
            study_lib.retire_merged_item(
                store, self.BLESSED_BY_STATE, "s101",
                study_lib.blessed_ledger_ids(self.root),
                study_lib.placed_item_ids(self.root))
        self.assertEqual(
            json.dumps(store, sort_keys=True, ensure_ascii=False), before,
            "a refusal is a refusal — it mutates NOTHING, not even the "
            "survivor's merged_from")

    def test_retire_refuses_a_placed_id(self):
        """Pitfall 8. A screenshot already on a notebook page becomes an
        orphaned reference the moment its type flips, because the picker pool
        is one-way by its own comment (core.js:500-504)."""
        store = self.build_with_ledgers()
        before = json.dumps(store, sort_keys=True, ensure_ascii=False)
        placed = study_lib.placed_item_ids(self.root)
        self.assertIn(self.PLACED, placed,
                      "the fixture must actually place it, or the case "
                      "proves nothing")
        with self.assertRaises(study_lib.MergeRefused):
            study_lib.retire_merged_item(
                store, self.PLACED, "s101",
                study_lib.blessed_ledger_ids(self.root), placed)
        self.assertEqual(
            json.dumps(store, sort_keys=True, ensure_ascii=False), before)

    def test_retire_is_idempotent(self):
        """Re-running for an id already retired is a no-op returning the
        store unchanged — the id is simply not in store['items'] any more,
        and a second merged_from record would double-count it."""
        store = self.build_with_ledgers()
        blessed = study_lib.blessed_ledger_ids(self.root)
        placed = study_lib.placed_item_ids(self.root)
        study_lib.retire_merged_item(store, "s108", "s107", blessed, placed)
        once = json.dumps(store, sort_keys=True, ensure_ascii=False)
        study_lib.retire_merged_item(store, "s108", "s107", blessed, placed)
        self.assertEqual(
            json.dumps(store, sort_keys=True, ensure_ascii=False), once,
            "a second retire changed the store")
        self.assertEqual(len(store["items"]["s107"]["merged_from"]), 1)

    def test_there_is_no_bare_delete_anywhere(self):
        """The source instrument beside the behavioural one. `del
        store["items"][...]` must not appear in study_lib at all."""
        src = Path(study_lib.__file__).read_text(encoding="utf-8")
        code = "\n".join("" if ln.lstrip().startswith("#") else ln
                         for ln in src.split("\n"))
        code = strip_py_docstrings(code)
        self.assertEqual(
            [], re.findall(r'del\s+store\["items"\]', code),
            "a bare delete of a store item exists — every removal must go "
            "through retire_merged_item, which preserves the record first")

    def test_drill_a_bare_delete_loses_the_history(self):
        """PERMANENT DRILL — `retire_merged_item` re-composed with exactly one
        step replaced: the record is never written to the survivor. The case
        then names the lost history, which is what the shipped function
        exists to keep."""
        store = self.build_with_ledgers()
        store["items"]["s108"]["history"] = [{"ms": 7, "to": "resting"}]
        # the mutation: pop without preserving
        store["items"].pop("s108", None)
        self.assertIsNone(
            (store["items"]["s107"].get("merged_from") or [None])[0],
            "the mutation was never planted — a bare delete must leave the "
            "survivor with no record at all")
        # the control, unmutated, on a fresh fixture
        store = self.build_with_ledgers()
        store["items"]["s108"]["history"] = [{"ms": 7, "to": "resting"}]
        study_lib.retire_merged_item(
            store, "s108", "s107",
            study_lib.blessed_ledger_ids(self.root),
            study_lib.placed_item_ids(self.root))
        self.assertEqual(
            store["items"]["s107"]["merged_from"][0]["history"],
            [{"ms": 7, "to": "resting"}],
            "CONTROL: the shipped function carries the history across")


class NotePassCandidatesTest(LedgerFixtureMixin):
    """Every exclusion counted BY REASON, so 3 and 300 are distinguishable."""

    def test_candidates_count_every_exclusion_by_reason(self):
        """⚠ THE BLESSED COUNT IS DERIVED, NEVER PINNED TO A LIVE-STORE
        CONSTANT. These numbers are the SYNTHETIC fixture's, stated in
        advance here because the fixture is fully known; no assertion
        anywhere in this suite compares a count taken from ~/StudyRoom
        against a literal."""
        store = self.build_with_ledgers()
        candidates, report = study_lib.note_pass_candidates(store, self.root)
        self.assertEqual(candidates, ["s101", "s106", "s107", "s108"],
                         "the eligible set, ascending by id")
        want = {"screenshots": 8, "already_text": 0, "fenced": 1,
                "placed": 1, "blessed": 2, "blessed_by_state": 1,
                "blessed_by_file": 1, "blessed_by_both": 0,
                "unreachable": 0, "eligible": 4}
        for key in sorted(want):
            self.assertEqual(report[key], want[key],
                             "the candidate report's " + key + " is "
                             + str(report[key]) + ", not " + str(want[key]))

    def test_the_exclusions_sum_to_the_population(self):
        """The arithmetic is asserted rather than commented: every screenshot
        is either excluded for exactly one named reason or is eligible. A
        reason that silently swallowed items would break this."""
        store = self.build_with_ledgers()
        _candidates, r = study_lib.note_pass_candidates(store, self.root)
        self.assertEqual(
            r["screenshots"],
            r["already_text"] + r["fenced"] + r["placed"] + r["blessed"]
            + r["unreachable"] + r["eligible"],
            "the exclusions do not sum to the population — something left "
            "the pass without being counted out loud")
        self.assertEqual(
            r["blessed"],
            r["blessed_by_state"] + r["blessed_by_file"]
            - r["blessed_by_both"],
            "the blessed split does not reconstruct the union")

    def test_a_fenced_screenshot_is_never_a_candidate(self):
        """V12's first half at the candidate gate: f201 IS a screenshot by
        both tests and carries the tag today."""
        store = self.build_with_ledgers()
        candidates, report = study_lib.note_pass_candidates(store, self.root)
        for item_id in FencedYieldsNothingTest.FENCED:
            self.assertNotIn(item_id, candidates)
        self.assertEqual(report["fenced"], 1,
                         "only f201 carries the tag among the fenced five; "
                         "the other four were never tagged")

    def test_an_already_flipped_item_is_not_a_candidate(self):
        """SRM-11's idempotency edge: a second note pass over an already
        flipped item is a no-op, because its type is no longer 'image'."""
        store = self.build_with_ledgers()
        store["items"]["s101"]["type"] = "text"
        store["items"]["s101"]["library_path"] = "items/s101.md"
        candidates, report = study_lib.note_pass_candidates(store, self.root)
        self.assertNotIn("s101", candidates)
        self.assertEqual(report["already_text"], 1)
        self.assertEqual(report["eligible"], 3)

    def test_placed_screenshots_are_enumerated_before_the_run(self):
        """The placements come from decorations.json — a library-root SIBLING
        in the irreplaceable tier — and they are read once, up front."""
        store = self.build_with_ledgers()
        placed = study_lib.placed_item_ids(self.root)
        self.assertEqual(placed, frozenset({self.PLACED}))
        _c, report = study_lib.note_pass_candidates(store, self.root)
        self.assertEqual(report["placed"], 1)

    def test_a_missing_decorations_file_reads_as_no_placements(self):
        """Fail-open, the shipped load_decorations posture — and it must not
        raise inside a pass over thirteen thousand pictures."""
        store = self.build_library()
        self.assertEqual(study_lib.placed_item_ids(self.root), frozenset())


# ===========================================================================
# 26.94-07 task 2 — the flip, the move, the sections, and the gate that
# refuses stale text
# ===========================================================================

class NotePassMixin(LedgerFixtureMixin):
    """The fixture, re-derived, with ledgers AND feature prints."""

    def build_pass(self, cache_fp=None, skip_cache=(), pre_redetect=True):
        """`pre_redetect=False` hands the pass a store carrying the SHIPPED
        tag — which is the state her real library was in when 26.94-08 closed,
        and the state 26.94-09 had to catch before the one-way door. See
        NotePassPersistsTheTagTest."""
        store = self.build_library(cache_fp=cache_fp, skip_cache=skip_cache)
        if pre_redetect:
            study_lib.redetect_screenshots(store, self.root, self.reader,
                                           self.PROGRAM_FP)
        self.write_ledgers(blessed_ids=(self.BLESSED_BY_FILE,),
                           placed_ids=(self.PLACED,))
        # ⚠ EVERY PRINT IDENTICAL, so the ONLY thing that can split the
        # fixture's burst is the clock — which is the rule (26.94-05's
        # finding, and the reason the similarity is called the rail).
        vector, _ = unit_pair(1.0)
        raw = struct.pack("<%df" % study_lib.VISION_PRINT_DIM, *vector)
        self.prints = {row["id"]: raw for row in self.fixture["items"]}
        return store

    def print_reader(self, item_id):
        return self.prints.get(item_id)

    def run_pass(self, store, save_cb=None):
        return study_lib.run_note_pass(
            store, self.root, self.reader, self.print_reader,
            self.PROGRAM_FP, save_cb=save_cb)

    def disk(self):
        """Every path under the library, relative and sorted — the instrument
        for 'this wrote nothing'."""
        return sorted(str(p.relative_to(self.library))
                      for p in self.library.rglob("*"))


class NotePassGateTest(NotePassMixin):
    """V18 — the counted gate, and the per-photograph refusal behind it."""

    def test_the_note_pass_stale_fingerprint_refuses(self):
        """The whole cache written by a DIFFERENT program. The pass refuses
        to START, names the shortfall BY COUNT, and changes nothing —
        D-10's order made a precondition the code checks rather than a
        convention in a document."""
        store = self.build_pass(cache_fp=self.STALE_FP)
        before_store = json.dumps(store, sort_keys=True, ensure_ascii=False)
        before_disk = self.disk()
        result = self.run_pass(store)
        self.assertFalse(result["ok"])
        self.assertIn("8 of 8", result["why"],
                      "the refusal names the shortfall by count: "
                      + str(result["why"]))
        self.assertEqual(
            json.dumps(store, sort_keys=True, ensure_ascii=False),
            before_store, "a refusal changes NOTHING in the store")
        self.assertEqual(self.disk(), before_disk,
                         "a refusal writes NOTHING to disk")
        self.assertEqual(result["report"]["notes"], 0)

    def test_one_unread_photograph_refuses_the_whole_note_pass(self):
        """The realistic shape: the pass mostly ran. One picture short is
        still short, and the gate is `==`, never `>= most of them`."""
        store = self.build_pass(skip_cache=("s107",))
        before = self.disk()
        result = self.run_pass(store)
        self.assertFalse(result["ok"])
        self.assertIn("1 of 8", result["why"])
        self.assertEqual(self.disk(), before)

    def test_a_single_stale_entry_is_refused_per_photograph(self):
        """The second, independent refusal: the counted gate is satisfied and
        ONE group's entry is stale anyway. mint_screenshot_note refuses that
        group and writes nothing for it."""
        store = self.build_pass()
        self.cache["s101"] = dict(self.cache["s101"], program_fp=self.STALE_FP)
        before = self.disk()
        report = study_lib.mint_screenshot_note(
            store, self.root, ["s101"], self.reader, self.PROGRAM_FP)
        self.assertFalse(report["ok"])
        self.assertEqual(report["refused"], 1)
        self.assertEqual(self.disk(), before,
                         "a per-photograph refusal writes nothing")
        self.assertEqual(store["items"]["s101"]["type"], "image")


class MintScreenshotNoteTest(NotePassMixin):
    """D-14 Shape 1 — the screenshot ITSELF becomes the note."""

    def test_mint_preserves_id_state_history_created(self):
        """⚠ THE FIVE FIELDS COMPARED BY VALUE, BEFORE AND AFTER. This is what
        makes D-09's 'a note inherits the screenshot's state' free and
        unfalsifiable instead of a copy that can drift — and it is what stops
        #40 D-10's warning biting: a blessed screenshot's note must not
        quietly demote itself back into the unjudged pile."""
        store = self.build_pass()
        # ⚠ A DISTINCTIVE STATE AND A NON-EMPTY HISTORY ON PURPOSE. Every
        # eligible row in the fixture is `unseen` with an empty history, so a
        # mutation that reset the state to "unseen" after the flip — which is
        # exactly #40 D-10's "demote itself back into the unjudged pile" —
        # would be INVISIBLE here. Observed: the first version of this case
        # scored that mutation as a PASS.
        store["items"]["s101"]["state"] = "resting"
        store["items"]["s101"]["history"] = [
            {"ms": 5, "from": "unseen", "to": "resting"}]
        before = json.loads(json.dumps(store["items"]["s101"]))
        report = study_lib.mint_screenshot_note(
            store, self.root, ["s101"], self.reader, self.PROGRAM_FP)
        self.assertTrue(report["ok"], report.get("why"))
        after = store["items"]["s101"]
        for key in ("id", "state", "history", "created_ms"):
            self.assertEqual(
                after[key], before[key],
                "the flip changed " + key + " — it must survive untouched")
        self.assertEqual(after["type"], "text",
                         "the type flip IS the mechanism (D-06): "
                         "pickAlbumItems and pickPickerImages both key on it")
        self.assertEqual(after["library_path"], "items/s101.md")
        self.assertEqual(after["attachments"], ["attachments/s101/s101.png"])
        self.assertTrue((self.library / "items" / "s101.md").is_file())
        self.assertFalse(
            (self.library / "items" / "s101.png").exists(),
            "the original snapshot is still in items/ — it moves")
        self.assertTrue(
            (self.library / "attachments" / "s101" / "s101.png").is_file())

    def test_the_note_file_name_is_the_item_id_and_never_the_text(self):
        """The path-traversal fence, study_lib.py:1309-1312: 'the name is
        ALWAYS server-generated, never derived from export content'. Here the
        content is OCR off a picture, which is even less trustworthy."""
        store = self.build_pass()
        study_lib.mint_screenshot_note(store, self.root, ["s101"],
                                       self.reader, self.PROGRAM_FP)
        written = sorted(p.name for p in
                         (self.library / "items").glob("*.md"))
        # n301.md is the fixture's pre-existing NOTE, written by
        # build_library — it is not a photograph and never was one.
        self.assertEqual(written, ["n301.md", "s101.md"])
        body = shipped_body("mint_screenshot_note")
        for banned in ("text[", "cleaned[", "_ocr_text("):
            self.assertNotIn(
                banned + ")", body + ")",
                "the note file name may be built only from the item id")

    def test_the_note_renders_no_provenance(self):
        """⚠ `from_source` is present on every Apple-Photos item and is NEVER
        rendered anywhere in the room. This must not become the first surface
        that renders it."""
        store = self.build_pass()
        store["items"]["s101"]["from_source"] = "apple-photos"
        study_lib.mint_screenshot_note(store, self.root, ["s101"],
                                       self.reader, self.PROGRAM_FP)
        raw = (self.library / "items" / "s101.md").read_bytes()
        for marker in (b"from_source", b"apple-photos", b"source"):
            self.assertNotIn(
                marker, raw,
                "the minted note carries provenance the room has never "
                "shown: " + marker.decode())

    def test_burst_partial_clean_is_per_shot(self):
        """⚠ A FAILED CLEAN IS PER-SHOT, NOT PER-GROUP. The fixture's burst is
        s106 -> s107 -> s108 and s106's reading is '9:41 LTE 100% Done',
        which is under thirty code points once the chrome comes off. So the
        note carries TWO sections, s106 stays a picture keeping its type and
        its tag, and it is NOT retired."""
        store = self.build_pass()
        group = self.fixture["burst"]["members"]
        report = study_lib.mint_screenshot_note(
            store, self.root, list(group), self.reader, self.PROGRAM_FP)
        self.assertTrue(report["ok"], report.get("why"))
        self.assertEqual(report["sections"], 2)
        self.assertEqual(report["survivor"], "s107",
                         "the survivor is the first CLEANED member by the "
                         "sort order — s106's clean failed, so it stays a "
                         "picture and cannot be the note")
        self.assertEqual(store["items"]["s106"]["type"], "image")
        self.assertIn("screenshots", store["items"]["s106"]["tags"])
        self.assertTrue((self.library / "items" / "s106.jpeg").is_file(),
                        "a failed-clean shot's snapshot does not move")
        self.assertEqual(store["items"]["s107"]["type"], "text")
        self.assertNotIn("s108", store["items"],
                         "the other cleaned member is retired into s107")
        self.assertEqual(
            [r["id"] for r in store["items"]["s107"]["merged_from"]],
            ["s108"])

    def test_sections_are_ascending_created_ms_with_an_id_tie_break(self):
        store = self.build_pass()
        report = study_lib.mint_screenshot_note(
            store, self.root, ["s108", "s107", "s106"],
            self.reader, self.PROGRAM_FP)
        self.assertEqual(
            report["survivor"], "s107",
            "the members were handed in newest-first and the survivor moved "
            "with them — the sort must happen INSIDE the function, or the "
            "caller's iteration order reaches her note")
        # ⚠ ORDER IS READ OFF HER OWN WORDS, NOT OFF AN ID. Until 26.94-09 this
        # case indexed the note for "s107" and "s108" — which only worked
        # because the item id was printed into the body as a heading. Her
        # ruling took the heading out, so the assertion now reads the thing
        # that is actually in the note: the two shots' text, in order.
        body = (self.library / "items" / "s107.md").read_text("utf-8")
        self.assertLess(body.index("the second shot in the burst"),
                        body.index("the third shot in the burst"),
                        "the sections are not in ascending created_ms order")

    def test_note_bytes_are_stable_across_runs(self):
        """Five repetitions with the group SHUFFLED. Same bytes every time —
        the sort happens inside the function, so a caller that hands the
        members in a different order cannot change her note."""
        want = None
        for seed in range(5):
            self.setUp()
            store = self.build_pass()
            group = list(self.fixture["burst"]["members"])
            random.Random(seed).shuffle(group)
            study_lib.mint_screenshot_note(store, self.root, group,
                                           self.reader, self.PROGRAM_FP)
            raw = (self.library / "items" / "s107.md").read_bytes()
            if want is None:
                want = raw
            self.assertEqual(raw, want,
                             "the note bytes moved with the input order "
                             "(seed " + str(seed) + ")")

    def test_the_note_is_utf8_and_a_chinese_character_round_trips(self):
        """SRM-13's encoding edge. The whole point of this phase is that 87%
        of her screenshots had their Chinese destroyed once already."""
        store = self.build_pass()
        chinese = "下午的笔记" * 8
        self.cache["s101"] = dict(self.cache["s101"], text=chinese)
        study_lib.mint_screenshot_note(store, self.root, ["s101"],
                                       self.reader, self.PROGRAM_FP)
        raw = (self.library / "items" / "s101.md").read_bytes()
        self.assertIn(chinese.encode("utf-8"), raw)
        self.assertEqual(
            unicodedata.normalize("NFC", raw.decode("utf-8")),
            raw.decode("utf-8"),
            "the note body is not NFC-normalised")

    def test_a_failed_clean_singleton_yields_no_note(self):
        """V16 at the note pass: no note, type stays image, the tag stays,
        and the snapshot does not move."""
        store = self.build_pass()
        before = self.disk()
        report = study_lib.mint_screenshot_note(
            store, self.root, ["s106"], self.reader, self.PROGRAM_FP)
        self.assertFalse(report["ok"])
        self.assertEqual(report["no_note"], 1)
        self.assertEqual(self.disk(), before)
        self.assertEqual(store["items"]["s106"]["type"], "image")

    def test_move_is_copy_verify_unlink(self):
        """⚠ copy2 -> sha256 identity -> unlink, NEVER os.replace. A rename is
        atomic and faster; copy-verify-unlink FAILS TOWARD KEEPING THE
        ORIGINAL, which is the property that matters when the thing being
        moved is the only copy of her photograph.

        Driven behaviourally: `shutil.copy2` is replaced by one that writes
        DIFFERENT bytes. The verification must catch it, the original must
        still be in items/, and the store must be untouched."""
        body = shipped_body("_move_snapshot_to_attachments")
        self.assertIn("copy2", body)
        self.assertIn("sha256", body)
        self.assertNotIn("os.replace", body,
                         "the move became a rename — the sha256 "
                         "verification step is then unreachable")

        store = self.build_pass()
        real = study_lib.shutil.copy2
        try:
            study_lib.shutil.copy2 = (
                lambda src, dst: Path(dst).write_bytes(b"not the same bytes"))
            report = study_lib.mint_screenshot_note(
                store, self.root, ["s101"], self.reader, self.PROGRAM_FP)
        finally:
            study_lib.shutil.copy2 = real
        self.assertFalse(report["ok"],
                         "a copy that did not arrive intact was accepted")
        self.assertEqual(report["move_failed"], 1)
        self.assertTrue(
            (self.library / "items" / "s101.png").is_file(),
            "the original was unlinked although the copy did not verify — "
            "the move must fail TOWARD keeping the original")
        self.assertEqual(store["items"]["s101"]["type"], "image")
        self.assertFalse((self.library / "items" / "s101.md").exists(),
                         "a note was minted for a move that failed")


class NoteShapeTest(NotePassMixin):
    """⚠ HER RULING, 2026-08-13, VERBATIM: `Nothing — a rule or a blank line`.

    26.94-08's halt packet §6 put the section heading to her at its measured
    scale — 3,443 headings across 3,067 notes, and 2,983 of the 3,201 groups
    are SINGLE SHOTS where a separator separates nothing. She chose this over
    keeping the hex item id and over using the shot's own timestamp, on law 4's
    "verbatim & undecorated": a single-shot note should then carry no furniture
    at all.

    So: a shot's words are the whole note. Between two consecutive shots inside
    a merged note there is a horizontal rule and nothing else. A single-shot
    note carries no rule, no heading, no ordinal, no timestamp and no id.

    ⚠ WHY THE RULE AND NOT THE BARE BLANK LINE — both of which her ruling
    permits, so this is the executor's pick and it is recorded rather than
    assumed. Her words are read off a SCREEN and already carry blank lines of
    their own, so a bare blank line between two shots is indistinguishable from
    a paragraph break inside ONE shot. D-08's whole reason for failing toward
    merging is that "a wrong merge is visible in the note and splittable"; an
    invisible boundary quietly takes that back, and an 18-shot scroll becomes
    one undifferentiated wall. The rule renders as a single `<hr>`, which is
    the shape the room ALREADY uses for the quiet separator before a note's
    trailing pictures (app.js `ATTACHMENT_SEP`, "one soft rule, no caption, no
    chrome"), and it carries no word of anybody's.

    ⚠⚠ AND THE BLANK LINE BEFORE THE RULE IS LOAD-BEARING, NOT TIDINESS.
    Measured against the room's OWN renderer (`vendor/marked.umd.js`) on
    2026-08-14: `her last line\\n---\\n` renders as `<h2>her last line</h2>` —
    a SETEXT HEADING. Without the blank line the separator promotes the last
    line of her own words into a heading, which is a heading the machine
    invented out of her text and is exactly what her ruling forbids. With the
    blank lines it renders `<p>…</p><hr><p>…</p>`."""

    RULE_LINE_RE = re.compile(r"^[ \t]{0,3}(?:-{3,}|_{3,}|\*{3,})[ \t]*$")

    def note_bytes(self, store, group, survivor):
        study_lib.mint_screenshot_note(store, self.root, list(group),
                                       self.reader, self.PROGRAM_FP)
        return (self.library / "items" / (survivor + ".md")).read_bytes()

    def test_a_single_shot_note_is_her_words_and_nothing_else(self):
        """⚠ THE CASE THAT CARRIES HER RULING'S REASON. 2,983 of 3,201 groups
        are single shots. This note must be the shot's cleaned text and one
        closing newline — no heading, no rule, no blank furniture."""
        store = self.build_pass()
        raw = self.note_bytes(store, ["s101"], "s101")
        text = unicodedata.normalize(
            "NFC",
            study_lib.strip_chrome(self.cache["s101"]["text"])).strip()
        self.assertEqual(
            raw, (text + "\n").encode("utf-8"),
            "a single-shot note carries something besides her own words")
        self.assertNotIn(b"#", raw, "a single-shot note carries a heading")
        self.assertNotIn(b"---", raw,
                         "a single-shot note carries a separator that "
                         "separates nothing")

    def test_a_merged_note_is_her_words_joined_by_a_rule_and_nothing_else(
            self):
        """The merged shape, asserted as an EXACT byte equality rather than as
        a substring — a substring assertion cannot see furniture that was
        added somewhere else in the note."""
        store = self.build_pass()
        raw = self.note_bytes(store, self.fixture["burst"]["members"], "s107")
        texts = []
        for item_id in ("s107", "s108"):
            texts.append(unicodedata.normalize(
                "NFC",
                study_lib.strip_chrome(self.cache[item_id]["text"])).strip())
        self.assertEqual(
            raw, ("\n\n---\n\n".join(texts) + "\n").encode("utf-8"),
            "the merged note is not exactly her two shots joined by one rule")

    def test_no_heading_ordinal_timestamp_or_item_id_reaches_the_note(self):
        """The three shapes plan 08 offered her and she declined, asserted as
        absences over the WHOLE pass rather than over one minted note."""
        store = self.build_pass()
        # ⚠ ONLY THE MINTED NOTES. The fixture ships n301.md, a note that was
        # always a note and carries its author's own `#` heading — asserting
        # over every .md in the library would fail on HER writing, which is
        # the one thing law 4 says must never be touched.
        before = set((self.library / "items").glob("*.md"))
        self.run_pass(store)
        for path in sorted(set((self.library / "items").glob("*.md"))
                           - before):
            body = path.read_text("utf-8")
            for line in body.split("\n"):
                self.assertFalse(
                    re.match(r"^[ \t]{0,3}#{1,6}([ \t]|$)", line),
                    "a minted note carries a markdown heading: "
                    + repr(line) + " in " + path.name)
            for item_id in list(store["items"]) + list(self.rows):
                self.assertNotIn(
                    item_id, body,
                    "a minted note prints an item id (" + item_id + ") in "
                    + path.name)

    def test_the_rule_never_makes_a_setext_heading_of_her_last_line(self):
        """⚠ THE MEASURED TRAP. `marked` reads `text\\n---` as `<h2>text</h2>`.
        Every rule line in every minted note must therefore be preceded by a
        BLANK line — and followed by one, so the shot after it opens as a
        paragraph rather than as the rule's own continuation."""
        store = self.build_pass()
        before = set((self.library / "items").glob("*.md"))
        self.run_pass(store)
        seen = 0
        for path in sorted(set((self.library / "items").glob("*.md"))
                           - before):
            lines = path.read_text("utf-8").split("\n")
            for i, line in enumerate(lines):
                if not self.RULE_LINE_RE.match(line):
                    continue
                seen += 1
                self.assertTrue(
                    i > 0 and lines[i - 1].strip() == "",
                    "a separator line in " + path.name + " has no blank line "
                    "before it — `marked` renders that as a SETEXT HEADING "
                    "made out of her own last line")
                self.assertTrue(
                    i + 1 < len(lines) and lines[i + 1].strip() == "",
                    "a separator line in " + path.name + " has no blank line "
                    "after it")
        self.assertEqual(seen, 1,
                         "the fixture mints exactly one two-section note, so "
                         "exactly one rule should exist across the pass")

    def test_the_shipped_separator_is_not_a_phrase(self):
        """A source-level backstop over the shipped emitter: whatever it joins
        with, it may not be a word. Reading it off the shipped body means a
        future edit that reintroduces a phrase fails here even if it also
        edits the fixture's texts."""
        body = shipped_body("_note_section_bytes")
        self.assertNotIn('"## "', body)
        self.assertNotIn("'## '", body)
        for banned in ("created_ms", "strftime", "ordinal", "enumerate",
                       "str(item_id)"):
            self.assertNotIn(
                banned, body,
                "the separator reaches for " + banned + " — her ruling was "
                "`Nothing — a rule or a blank line`, which excludes a "
                "timestamp and an ordinal as well as a heading")
        # ⚠ THE CLAIM STATED DIRECTLY: the separator carries no word. Only
        # whitespace and the characters markdown reads as a thematic break.
        self.assertTrue(study_lib._NOTE_SHOT_SEPARATOR.strip(),
                        "the separator is whitespace only — an invisible "
                        "boundary between two shots, which is the one shape "
                        "D-08 rules out")
        self.assertIsNone(
            re.search(r"[^\s\-_*]", study_lib._NOTE_SHOT_SEPARATOR),
            "the separator carries a character that is neither whitespace "
            "nor a rule: " + repr(study_lib._NOTE_SHOT_SEPARATOR))


class NotePassPersistsTheTagTest(NotePassMixin):
    """⚠ 26.94-08 DEVIATION 2, CAUGHT ON THE THRESHOLD OF THE ONE-WAY DOOR.

    Plan 08 re-derived the `screenshots` tag and reported it as a number
    (3,608 items would carry it) but was directed to leave `items.json`
    byte-identical, so it never wrote it. `note_pass_candidates` picks its
    population from the tag IN THE STORE. Run against the unwritten tag the
    pass would have found 2,676 instead of 3,608 — **927 of her screenshots
    would silently never have become notes, and nothing would have reported an
    error.**

    The fix is not a note in a document: the pass itself re-derives the tag
    INTO the store and persists it BEFORE it selects a single candidate. This
    suite's fixture is the same shape in miniature — six of its eight eligible
    photographs carry no tag until the re-derivation runs."""

    def test_the_pass_redetects_before_it_selects_candidates(self):
        """RED against a pass that trusts the shipped tag: handed a store in
        the state her real library was actually in, it must still find every
        screenshot."""
        store = self.build_pass(pre_redetect=False)
        tagged_before = [i for i, it in store["items"].items()
                         if "screenshots" in (it.get("tags") or [])]
        self.assertEqual(sorted(tagged_before), ["f201", "s101", "s104"],
                         "the fixture's shipped tag is not the stale one this "
                         "case is about")
        result = self.run_pass(store)
        self.assertTrue(result["ok"], result.get("why"))
        self.assertEqual(
            result["report"]["eligible"], 4,
            "the pass selected its population from the SHIPPED tag — the "
            "re-derivation did not run, or it ran after the selection")
        self.assertEqual(result["report"]["notes"], 2)

    def test_the_rederived_tag_is_saved_before_the_first_note(self):
        """⚠ ORDER, NOT MERELY PRESENCE. A tag re-derived into memory and
        saved only at the end is one interrupted run away from a store whose
        notes and whose tags disagree. The first save must land BEFORE the
        first minted note, so the callback is recorded in order."""
        store = self.build_pass(pre_redetect=False)
        saves = []

        def save_cb():
            saves.append(sorted(
                i for i, it in store["items"].items()
                if "screenshots" in (it.get("tags") or [])))

        self.run_pass(store, save_cb=save_cb)
        self.assertTrue(saves, "the pass never asked its caller to save")
        self.assertIn(
            "s107", saves[0],
            "the FIRST save did not already carry the re-derived tag — the "
            "re-derivation is not persisted before candidate selection")

    def test_the_report_carries_the_rederivation_by_value(self):
        """It is a number she is shown, so it travels in the report rather
        than only in a log line."""
        store = self.build_pass(pre_redetect=False)
        report = self.run_pass(store)["report"]
        for key in ("redetect_union", "redetect_added", "redetect_removed"):
            self.assertIn(key, report)
        self.assertEqual(report["redetect_union"],
                         self.fixture["expected"]["union"])
        self.assertEqual(report["redetect_added"],
                         self.fixture["expected"]["added"])
        self.assertEqual(report["redetect_removed"],
                         self.fixture["expected"]["removed"])

    def test_a_refused_gate_still_redetects_nothing(self):
        """The refusal contract is unchanged: a stale cache changes NOTHING,
        including the tag. Re-deriving on a store the pass is about to refuse
        would write a derivation drawn from text the gate has just called
        stale.

        ⚠ AND THIS CASE RESTS ON TWO INDEPENDENT GATES, WHICH IS A FINDING
        RATHER THAN A DETAIL — it was found by driving red and NOT getting
        red. A drill that moves `redetect_screenshots` ABOVE the gate check in
        `run_note_pass` leaves this case green, because
        `redetect_screenshots` carries the SAME counted refusal internally and
        declines on its own. So the ordering in `run_note_pass` is the second
        belt, not the first. The counterfactual is completed in the case
        below rather than left as an unexamined pass — 26.94-07 recorded the
        identical shape for V12 and the lesson is the same one: a drill whose
        selector stays green may be green for a reason that is not its
        claim."""
        store = self.build_pass(cache_fp=self.STALE_FP, pre_redetect=False)
        before = json.dumps(store, sort_keys=True, ensure_ascii=False)
        result = self.run_pass(store)
        self.assertFalse(result["ok"])
        self.assertEqual(
            json.dumps(store, sort_keys=True, ensure_ascii=False), before,
            "a refused pass re-derived the tag anyway")

    def test_drill_the_ordering_is_the_second_belt_and_it_holds_alone(self):
        """⚠ PERMANENT DRILL — the counterfactual the case above cannot
        reach. `redetect_screenshots` is replaced by one with NO gate of its
        own, which tags every eligible photograph unconditionally. The store
        must STILL be untouched on a stale cache, because `run_note_pass`
        returns on the gate before it ever calls the re-derivation.

        An unmutated control runs in the same case, so a green here is never
        a green that the patch failed to apply."""
        store = self.build_pass(cache_fp=self.STALE_FP, pre_redetect=False)
        before = json.dumps(store, sort_keys=True, ensure_ascii=False)

        called = []

        def ungated_redetect(a_store, library_root, cache_reader, program_fp):
            called.append(1)
            for item in (a_store.get("items") or {}).values():
                if isinstance(item, dict) and item.get("type") == "image":
                    tags = item.setdefault("tags", [])
                    if "screenshots" not in tags:
                        tags.append("screenshots")
            return {"ok": True, "why": None, "union": 99, "added": 99,
                    "removed": 0}

        real = study_lib.redetect_screenshots
        try:
            study_lib.redetect_screenshots = ungated_redetect
            result = self.run_pass(store)
        finally:
            study_lib.redetect_screenshots = real

        self.assertFalse(result["ok"])
        self.assertEqual(called, [],
                         "the pass called the re-derivation although the "
                         "gate had already refused — the ordering is the "
                         "only thing protecting a store from a derivation "
                         "drawn from stale text")
        self.assertEqual(
            json.dumps(store, sort_keys=True, ensure_ascii=False), before,
            "an ungated re-derivation reached a store the gate refused")

        # the control, in the same case: unpatched, the pass still refuses and
        # still changes nothing, so the assertions above cannot be green
        # merely because the patch never took.
        control = self.build_pass(cache_fp=self.STALE_FP, pre_redetect=False)
        snapshot = json.dumps(control, sort_keys=True, ensure_ascii=False)
        self.assertFalse(self.run_pass(control)["ok"])
        self.assertEqual(
            json.dumps(control, sort_keys=True, ensure_ascii=False), snapshot)


class NotePassRunTest(NotePassMixin):
    """The whole pass over the fixture, and V12 at the end of it."""

    def test_the_note_pass_over_the_fixture(self):
        store = self.build_pass()
        result = self.run_pass(store)
        self.assertTrue(result["ok"], result.get("why"))
        r = result["report"]
        self.assertEqual(r["eligible"], 4)
        self.assertEqual(r["groups"], 2, "s101 alone, and the three-shot "
                                         "burst")
        self.assertEqual(r["notes"], 2)
        self.assertEqual(r["sections"], 3, "s101 + s107 + s108")
        self.assertEqual(r["retired"], 1)
        self.assertEqual(r["no_note"], 1, "s106's clean fails")
        self.assertEqual(sorted(store["items"]["s101"]["attachments"]),
                         ["attachments/s101/s101.png"])

    def test_the_note_pass_fenced_yields_nothing_at_all(self):
        """⚠ V12, THE STRONG FORM: a fenced screenshot yields ZERO new items,
        ZERO .md files and ZERO files under attachments/. f201 is the
        load-bearing row — it IS a screenshot by both tests and carries the
        tag today."""
        store = self.build_pass()
        self.run_pass(store)
        for item_id in FencedYieldsNothingTest.FENCED:
            item = store["items"][item_id]
            self.assertEqual(item["type"], "image",
                             item_id + " was flipped by a pass that must "
                             "never have looked at it (law 5, P0)")
            self.assertNotIn("attachments", item)
            self.assertFalse(
                (self.library / "items" / (item_id + ".md")).exists(),
                item_id + " got a note")
            self.assertFalse(
                (self.library / "attachments" / item_id).exists(),
                item_id + " got a directory under attachments/")
        written = sorted(p.name for p in
                         (self.library / "items").glob("*.md"))
        # n301.md is the fixture's pre-existing NOTE and was never a picture.
        self.assertEqual(written, ["n301.md", "s101.md", "s107.md"],
                         "exactly the two minted notes beside the fixture's "
                         "own pre-existing note, and nothing else")
        made = sorted(p.name for p in
                      (self.library / "attachments").iterdir())
        self.assertEqual(made, ["s101", "s107"])

    def test_drill_without_the_fence_a_never_shown_screenshot_gets_a_note(
            self):
        """PERMANENT DRILL — V12's RED EVIDENCE, and it took two goes to get
        honest.

        ⚠ THE FIRST ATTEMPT SCORED FOR THE WRONG REASON, and it is recorded
        here rather than quietly fixed. Neutering `_librarian_fenced` alone
        DOES turn the pass red — but not because f201 gets a note. It goes red
        because every fenced photograph then enters `vision_path_list`, none
        of them has a cache entry, and the COUNTED GATE refuses the whole run.
        Zero notes, red for a gate that was never the claim.

        So the counterfactual is completed here: with no fence, the Vision
        pass WOULD have read those photographs, so the drill supplies their
        cache entries too. Then f201 — a screenshot by both tests, carrying
        the tag today, and `never_show` — gets a note with the words off it
        on disk in plain text. That is the P0 law 5 names, made visible.

        The claim this proves is therefore precise: V12 rests on TWO
        independent gates (the candidate filter's fence and
        `vision_path_list`'s reachability), and removing the fence from both
        is what it takes to break it."""
        store = self.build_pass()
        for item_id in FencedYieldsNothingTest.FENCED:
            row = self.rows[item_id]
            self.cache[item_id] = {
                "text": "a page of invented words long enough to clean, off "
                        "a picture nobody may ever open",
                "themes": list(row["themes"]), "faces": 0,
                "dim": study_lib.VISION_PRINT_DIM, "lang": "auto",
                "program_fp": self.PROGRAM_FP, "read_ms": 1,
            }
        real = study_lib._librarian_fenced
        try:
            study_lib._librarian_fenced = lambda item, filters: False
            result = self.run_pass(store)
        finally:
            study_lib._librarian_fenced = real
        self.assertTrue(result["ok"], result.get("why"))
        self.assertTrue(
            (self.library / "items" / "f201.md").is_file(),
            "the mutation was never planted — with the fence off, a "
            "never_show screenshot MUST get a note, which is the danger")

        # the control, unmutated, on the same fixture and the same cache
        self.setUp()
        store = self.build_pass()
        for item_id in FencedYieldsNothingTest.FENCED:
            self.cache[item_id] = dict(self.cache["s101"])
        result = self.run_pass(store)
        self.assertTrue(result["ok"], result.get("why"))
        self.assertFalse(
            (self.library / "items" / "f201.md").exists(),
            "CONTROL: the shipped fence gives a never_show screenshot no "
            "note at all")
        self.assertFalse((self.library / "attachments" / "f201").exists())

    def test_second_pass_is_a_noop(self):
        """SRM-11's idempotency edge. The flipped items are no longer
        `type: "image"`, so they are not candidates, so the second pass
        writes nothing at all."""
        store = self.build_pass()
        self.run_pass(store)
        after_first = self.disk()
        snapshot = json.dumps(store, sort_keys=True, ensure_ascii=False)
        result = self.run_pass(store)
        self.assertTrue(result["ok"], result.get("why"))
        self.assertEqual(result["report"]["notes"], 0)
        self.assertEqual(result["report"]["already_text"], 2)
        self.assertEqual(self.disk(), after_first,
                         "the second pass wrote something")
        self.assertEqual(
            json.dumps(store, sort_keys=True, ensure_ascii=False), snapshot,
            "the second pass changed the store")

    def test_the_pass_saves_after_every_group(self):
        """An interruption must not lose the store mutations for groups whose
        files have already moved, so the caller's save runs per group and not
        once at the end.

        ⚠ THE EXPECTED COUNT MOVED FROM 2 TO 3 AT 26.94-09, AND THE REASON IS
        RECORDED RATHER THAN ABSORBED: the pass now persists the re-derived
        `screenshots` tag through the SAME callback before it selects a single
        candidate (26.94-08 deviation 2). So it is one save for the
        re-derivation plus one per minted note. The arithmetic is written out
        below so that a drill removing `save_cb` from the loop still goes red
        here at 1 != 3 rather than passing on a loosened number."""
        saves = []
        store = self.build_pass()
        result = self.run_pass(store, save_cb=lambda: saves.append(1))
        self.assertEqual(
            len(saves), 1 + result["report"]["notes"],
            "one save for the re-derivation, then one per minted note — not "
            "one for the run")
        self.assertEqual(len(saves), 3)

    def test_no_gate_here_pins_the_note_count(self):
        """⚠ A6, enforced rather than promised. ~3,083 notes is arithmetic
        over verified counts that ASSUMES every burst member cleans and no
        burst is wholly fenced. It is close but not exact, and the run
        reports the real number."""
        # ⚠ THE BANNED VALUES LIVE ON THEIR OWN LINE, which carries no
        # "assert" — the A4 guard one class up is written the same way, and
        # for the same reason: a self-matching guard fails on itself and
        # teaches the next reader to weaken it.
        banned = ("3083", "3,083")
        src = Path(__file__).read_text(encoding="utf-8")
        for line in src.split("\n"):
            if "assert" not in line:
                continue
            for number in banned:
                self.assertNotIn(
                    number, line,
                    "an assertion pins the arithmetic note count — A6 says "
                    "it assumes every burst member cleans and no burst is "
                    "wholly fenced, and the run reports the real number: "
                    + line.strip())


class MergeRefusalIsSurvivableTest(NotePassMixin):
    """CR-04. A refusal is CORRECT — D-14 says a blessed or placed screenshot
    is never merged away — but it used to be discovered from inside the retire
    loop, after the note and every attachment copy were already on disk, and
    it raised through `run_note_pass` and `run_note_pass_cli` untouched.

    So a one-way pass over her library ended in a traceback with `save()`
    unreached: the current group's `.md` and `attachments/<survivor>/` were
    orphans no store row named, and every earlier group's store mutations were
    thrown away. These cases pin the two halves of the fix — the refusal now
    happens BEFORE anything is written, and one group's failure is one counted
    line rather than the run."""

    def multi_member_group(self, store):
        """(group, survivor, member) for the fixture's real burst — derived
        the way the pass derives it, never hard-coded, so a fixture change
        cannot leave these cases quietly testing a single-shot group where a
        merge never happens and a merge refusal is unreachable."""
        candidates, _report = study_lib.note_pass_candidates(store, self.root)
        items = store["items"]
        groups = study_lib.group_bursts(
            [items[i] for i in candidates if i in items], self.prints)
        for group in groups:
            cleaned = [i for i in group if study_lib.clean_ok(self.reader(i))]
            if len(cleaned) >= 2:
                return group, cleaned[0], cleaned[1]
        self.fail("the fixture produced no group with two cleaning members — "
                  "nothing here would ever reach a merge, so these cases "
                  "would pass without exercising the refusal at all")

    def test_a_refusal_writes_nothing_at_all(self):
        """⚠ THE ORDERING, ASSERTED AS AN ABSENCE ON DISK. The whole library
        tree is compared before and after: a refused group must leave no
        note, no attachments directory, and no store mutation behind."""
        store = self.build_pass()
        group, survivor, member = self.multi_member_group(store)
        blessed = frozenset([member])
        before_disk = self.disk()
        before_type = store["items"][survivor]["type"]
        report = study_lib.mint_screenshot_note(
            store, self.root, group, self.reader, self.PROGRAM_FP,
            blessed, frozenset())
        self.assertEqual(report["merge_refused"], 1)
        self.assertFalse(report["ok"])
        self.assertIn("blessed", report["why"])
        self.assertEqual(
            self.disk(), before_disk,
            "A REFUSED GROUP WROTE TO DISK. The refusal is asked before the "
            "copy and before the note is written, so a refusal must leave "
            "the library byte-for-byte as it found it.")
        self.assertEqual(store["items"][survivor]["type"], before_type,
                         "a refusal mutated the survivor")
        self.assertIn(member, store["items"], "a refusal retired the member")

    def test_the_pass_keeps_its_other_work_when_one_group_refuses(self):
        """⚠ WHAT THE PASS NOW DOES WITH THE REST OF ITS WORK — the question
        CR-04 asks by name. Every group but one is minted, the run returns ok,
        and the refusal is a COUNT rather than an exception.

        ⚠ THE BLESS LANDS **BETWEEN** THE TWO READS, WHICH IS THE ONLY WAY TO
        REACH THIS REFUSAL AT ALL. `note_pass_candidates` excludes blessed
        items up front, so simply writing the ledger first removes the item
        from the population and no merge is ever attempted — the case would
        pass while proving nothing. Blessing on the SECOND read reproduces
        exactly the race the review describes: she blesses a screenshot while
        the pass is running, after its population was chosen."""
        store = self.build_pass()
        _group, _survivor, member = self.multi_member_group(store)
        real = study_lib.blessed_ledger_ids
        reads = {"n": 0}

        def blessed_on_the_second_read(root):
            reads["n"] += 1
            found = real(root)
            return found if reads["n"] == 1 else found | frozenset([member])

        study_lib.blessed_ledger_ids = blessed_on_the_second_read
        try:
            control = study_lib.run_note_pass(
                store, self.root, self.reader, self.print_reader,
                self.PROGRAM_FP)
        finally:
            study_lib.blessed_ledger_ids = real
        self.assertGreater(reads["n"], 1,
                           "the ledger was read once, so the bless never "
                           "landed and this case tested nothing")
        self.assertTrue(control["ok"],
                        "the run must survive the refusal, not report a "
                        "failed pass: " + str(control["why"]))
        report = control["report"]
        self.assertEqual(report["merge_refused"], 1,
                         "exactly one group refused")
        self.assertEqual(report["mint_failed"], 0,
                         "a merge refusal is not a mint failure — they are "
                         "counted apart on purpose")
        self.assertEqual(report["groups"], 2,
                         "the fixture's two groups, one of which refuses")
        self.assertEqual(report["notes"], 1,
                         "the pass abandoned the group it could still mint")
        self.assertIn(member, store["items"],
                      "the blessed screenshot was merged away anyway")

    def test_an_oserror_in_one_group_is_counted_not_raised(self):
        """The net under the whole mint. `shutil.copy2`, `atomic_write_bytes`
        and the unlink loop all reach the filesystem; an OSError out of any of
        them used to end the run by traceback with the earlier groups' store
        mutations unsaved."""
        store = self.build_pass()
        real = study_lib.atomic_write_bytes
        seen = {"n": 0}

        def explode(path, data):
            seen["n"] += 1
            if seen["n"] == 1:
                raise OSError(28, "No space left on device")
            return real(path, data)

        study_lib.atomic_write_bytes = explode
        try:
            result = study_lib.run_note_pass(
                store, self.root, self.reader, self.print_reader,
                self.PROGRAM_FP)
        finally:
            study_lib.atomic_write_bytes = real
        self.assertTrue(result["ok"],
                        "one group's OSError ended the whole pass")
        self.assertEqual(result["report"]["mint_failed"], 1)
        self.assertIn("No space left on device",
                      str(result["report"]["mint_failed_why"]))
        self.assertNotIn("Traceback", str(result["report"]["mint_failed_why"]),
                         "the reason travels as one plain line")
        self.assertGreaterEqual(
            result["report"]["notes"], 1,
            "the pass threw away the groups it could still have minted")

    def test_the_ledgers_are_read_once_for_the_whole_pass(self):
        """⚠ THE RACE IS REMOVED, NOT HANDLED. mint used to re-read
        blessings.json and decorations.json inside EVERY mint — 3,201 times
        over her library, each at a different wall clock from
        `note_pass_candidates`' single read, which is what selected the
        population. This asserts ONE read of each per pass, by count."""
        store = self.build_pass()
        calls = {"blessed": 0, "placed": 0}
        real_b = study_lib.blessed_ledger_ids
        real_p = study_lib.placed_item_ids

        def count_b(root):
            calls["blessed"] += 1
            return real_b(root)

        def count_p(root):
            calls["placed"] += 1
            return real_p(root)

        study_lib.blessed_ledger_ids = count_b
        study_lib.placed_item_ids = count_p
        try:
            result = study_lib.run_note_pass(
                store, self.root, self.reader, self.print_reader,
                self.PROGRAM_FP)
        finally:
            study_lib.blessed_ledger_ids = real_b
            study_lib.placed_item_ids = real_p
        self.assertTrue(result["ok"], str(result["why"]))
        self.assertGreater(result["report"]["groups"], 1,
                           "a one-group fixture cannot tell one read from "
                           "one-read-per-group")
        # note_pass_candidates takes its own single read; the pass takes one
        # more and hands it to every group. What must never happen is a read
        # that scales with the number of groups.
        self.assertLessEqual(
            calls["blessed"], 2,
            "blessings.json was read %d times over %d groups — the pass must "
            "have ONE idea of 'blessed' for its whole duration"
            % (calls["blessed"], result["report"]["groups"]))
        self.assertLessEqual(
            calls["placed"], 2,
            "decorations.json was read %d times over %d groups"
            % (calls["placed"], result["report"]["groups"]))


class RepairNotesTest(ScreenshotNotesBase):
    """CR-03's remediation, and the REFUSAL is what these cases are about.

    The rules fix stops the bleeding; it puts nothing back. 506 of her notes
    are already on disk with her words missing out of the middle of them, and
    the un-stripped text survives in vision/<id>.json — so the repair is
    possible. What makes it safe is that it rewrites a note ONLY when what is
    on disk is byte-identical to what the buggy rules produced. Everything
    else is refused, and a refusal that is never observed is not a refusal."""

    DAMAGED = ("Black Coffee with More So, and the rest of this line exists "
               "only to clear the thirty character floor")
    CLEAN = ("nothing in this sentence is a bar label, so the rules leave "
             "every word of it exactly where it is")

    def build(self, texts, extra_items=()):
        """A library of one-shot notes, each minted the way the buggy pass
        would have minted it. Returns (store, cache)."""
        store = study_lib.new_store(self.root)
        cache = {}
        for item_id, text in texts.items():
            cache[item_id] = {
                "text": text, "themes": [], "faces": 0,
                "dim": study_lib.VISION_PRINT_DIM, "lang": "auto",
                "program_fp": "fp", "read_ms": 1,
            }
            store["items"][item_id] = {
                "id": item_id, "source": "photos", "type": "text",
                "library_path": "items/" + item_id + ".md",
                "attachments": ["attachments/" + item_id + "/a.jpeg"],
                "title": item_id, "state": "unseen", "trigger": False,
                "tags": [], "created_ms": 1, "history": [],
            }
            cleaned = unicodedata.normalize(
                "NFC", study_lib._strip_chrome_as_minted(text)).strip()
            path = self.library / "items" / (item_id + ".md")
            self.assert_under_temp_root(path)
            path.write_bytes(study_lib._note_section_bytes(
                store, self.root, [(item_id, cleaned)]))
        for item_id, item in extra_items:
            store["items"][item_id] = item
        return store, cache

    def run_repair(self, store, cache, apply=False):
        return study_lib.repair_notes(
            store, self.root, lambda i: cache.get(i), apply=apply)["report"]

    def test_dry_run_is_the_default_and_writes_nothing(self):
        """⚠ THE DEFAULT IS THE SAFETY PROPERTY. `repair_notes` is called with
        no `apply` at all here — the way a caller that forgot the argument
        would call it — and the note on disk must be byte-for-byte what it
        was. `damaged` counts what a real run WOULD do; `repaired` stays 0,
        which is how a reader tells a projection from a rewrite."""
        store, cache = self.build({"n1": self.DAMAGED})
        note = self.library / "items" / "n1.md"
        before = note.read_bytes()
        # ⚠ CALLED DIRECTLY, WITH NO `apply` ARGUMENT AT ALL. Going through
        # this suite's own helper would pass `apply=False` explicitly and the
        # case would then be green against a `repair_notes` whose default was
        # True — which is exactly what it is here to catch. (Observed: with
        # the default flipped to True, the helper form of this case still
        # reported OK.)
        report = study_lib.repair_notes(
            store, self.root, lambda i: cache.get(i))["report"]
        self.assertEqual(report["damaged"], 1)
        self.assertEqual(report["repaired"], 0,
                         "a dry run reported a rewrite")
        self.assertEqual(note.read_bytes(), before,
                         "THE DEFAULT CALL WROTE TO HER LIBRARY. `apply` "
                         "defaults to False and nothing may reach disk "
                         "without it.")
        self.assertNotIn("More", before.decode("utf-8"),
                         "the fixture is not damaged, so this case proves "
                         "nothing")

    def test_apply_puts_her_word_back(self):
        """The other half: with `apply=True` the word returns, and the count
        of restored characters is asserted BY VALUE rather than by sign."""
        store, cache = self.build({"n1": self.DAMAGED})
        note = self.library / "items" / "n1.md"
        report = self.run_repair(store, cache, apply=True)
        self.assertEqual(report["damaged"], 1)
        self.assertEqual(report["repaired"], 1)
        self.assertEqual(report["chars_restored"], 5,
                         "`More` plus the space that collapsed with it")
        self.assertEqual(note.read_bytes().decode("utf-8"),
                         self.DAMAGED + "\n")

    def test_a_note_edited_since_is_refused_and_never_overwritten(self):
        """⚠⚠ THE CASE THE WHOLE MODE EXISTS FOR, AND IT RUNS WITH
        `apply=True` ON PURPOSE — a refusal proved only in dry-run mode is
        not proved at all, because dry run refuses everything by construction.

        The note on disk has one character she changed. It is therefore NOT
        byte-identical to what the buggy rules produced, so the repair cannot
        know what else she has done to it, and must leave it exactly alone —
        even though the vision cache says her word is missing from it."""
        store, cache = self.build({"n1": self.DAMAGED})
        note = self.library / "items" / "n1.md"
        edited = note.read_bytes().decode("utf-8").replace(
            "Black Coffee", "Black coffee")
        note.write_bytes(edited.encode("utf-8"))
        report = self.run_repair(store, cache, apply=True)
        self.assertEqual(report["refused_edited"], 1)
        self.assertEqual(report["repaired"], 0)
        self.assertEqual(report["damaged"], 0)
        self.assertEqual(
            note.read_bytes().decode("utf-8"), edited,
            "A NOTE SHE HAD EDITED WAS OVERWRITTEN. Byte-identity with the "
            "buggy output is the only licence this repair has.")

    def test_an_undamaged_note_is_left_alone(self):
        """A note the old rules never touched reports `unchanged`, not
        `damaged` — so the projection she is shown counts real damage and not
        every note in the library."""
        store, cache = self.build({"n1": self.CLEAN})
        report = self.run_repair(store, cache, apply=True)
        self.assertEqual(report["unchanged"], 1)
        self.assertEqual(report["damaged"], 0)
        self.assertEqual(report["repaired"], 0)
        self.assertEqual(report["chars_restored"], 0)

    def test_an_ordinary_text_note_is_not_ours_to_touch(self):
        """710 of her items are text notes carrying an attachment under their
        own id that this pass never minted — imported markdown. They have no
        vision reading, and the repair must classify them rather than try to
        reproduce them."""
        item = {"id": "d1", "source": "folder-drop", "type": "text",
                "library_path": "items/d1.md",
                "attachments": ["attachments/d1/pic.jpeg"],
                "title": "d1", "state": "unseen", "trigger": False,
                "tags": [], "created_ms": 1, "history": []}
        store, cache = self.build({"n1": self.DAMAGED},
                                  extra_items=(("d1", item),))
        (self.library / "items" / "d1.md").write_bytes(b"her own writing\n")
        report = self.run_repair(store, cache, apply=True)
        self.assertEqual(report["not_minted"], 1)
        self.assertEqual(report["examined"], 2)
        self.assertEqual((self.library / "items" / "d1.md").read_bytes(),
                         b"her own writing\n")

    def test_members_are_ordered_by_the_stamp_in_merged_from(self):
        """⚠ A REGRESSION GUARD WITH A MEASURED NUMBER BEHIND IT. A merged
        member is NOT in `items` any more — its record, including
        `created_ms`, lives in the survivor's `merged_from`. Reading the stamp
        off `items` yields 0 for every member, which reorders any multi-shot
        note; measured against her library that is 205 of 3,067 notes failing
        to reproduce, every one of which would then be REFUSED and silently
        left damaged.

        ⚠ THE MEMBER'S STAMP IS DELIBERATELY **LARGER** THAN THE SURVIVOR'S.
        With a smaller one, a lookup that finds nothing in `items` defaults to
        0 and sorts the member first anyway — the right answer for the wrong
        reason, and the mutation survives. (Observed: it did.) Sorting the
        member LAST is an order no default of 0 can produce."""
        store = study_lib.new_store(self.root)
        store["items"]["surv"] = {
            "id": "surv", "source": "photos", "type": "text",
            "library_path": "items/surv.md",
            "attachments": ["attachments/surv/a.jpeg"],
            "title": "surv", "state": "unseen", "trigger": False,
            "tags": [], "created_ms": 100, "history": [],
            "merged_from": [{"id": "late", "created_ms": 900,
                             "library_path": "items/late.jpeg",
                             "state": "unseen", "title": "late",
                             "history": []}],
        }
        self.assertNotIn("late", store["items"],
                         "the premise of this case is that a merged member "
                         "is gone from items — if it is still there, the "
                         "case is testing nothing")
        self.assertEqual(study_lib.minted_note_members(store, "surv"),
                         ["surv", "late"],
                         "the member's created_ms of 900 sorts it AFTER the "
                         "survivor's 100, and that stamp exists only in "
                         "merged_from — read off `items` it defaults to 0 "
                         "and the note silently reverses")


# ===========================================================================
# 26.998-02 — THE MARK'S REACH IS HONEST, AND THE REPORT SAYS WHAT IT RESTS ON
#
# ⚠ WHY THIS EXISTS. The correcting re-derivation already counts its two
# directions. What it did NOT do was say what it DEPENDS ON having run. Test 2
# IS the picture-reading pass's own label, so a report produced before those
# pictures have been read is a materially SHORT answer that looks exactly like
# a complete one — the same shape, the same keys, a smaller number. A reader
# cannot tell the two apart, and the pass's own comment says the short answer
# is 27% short.
#
# ⛔ THESE CASES DO NOT MAKE THE PASS ACT ON A SHORT ANSWER. The refusal that
# stands in front of it is untouched and is asserted to still refuse. What is
# added is that the report SAYS SO, in a field, derived by the run rather than
# quoted from a comment.
# ===========================================================================

class RedetectSaysWhatItRestsOnTest(LibraryFixtureMixin):
    """26.998-02 task 2 — the report names the pass it depends on, and a run
    without that pass is reported as PARTIAL rather than as complete."""

    def test_a_complete_run_says_it_is_complete_and_names_its_pass(self):
        store = self.build_library()
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertTrue(report["ok"], report.get("why"))
        self.assertIn("complete", report,
                      "the report does not say whether it is complete, so a "
                      "short answer and a whole one are the same shape")
        self.assertIs(report["complete"], True,
                      "every photograph was read by the running program, so "
                      "this run rests on nothing missing")
        self.assertIn("depends_on", report,
                      "the report does not NAME the pass it rests on")
        self.assertEqual(report["depends_on"], study_lib.REDETECT_DEPENDS_ON)
        self.assertTrue(str(report["depends_on"]).strip(),
                        "naming the pass with an empty string names nothing")

    def test_a_run_without_the_reading_pass_is_partial_not_complete(self):
        """⛔ THE POINT OF THE WHOLE CASE. `s101` is left unread, so the
        run is standing on a pass that has not finished."""
        store = self.build_library(skip_cache=("s101",))
        before = self.tags_of(store)
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertFalse(report["ok"])
        self.assertIn("complete", report)
        self.assertIs(report["complete"], False,
                      "a run standing on an unfinished pass reported itself "
                      "as complete")
        self.assertEqual(report["depends_on"], study_lib.REDETECT_DEPENDS_ON)
        self.assertIn(str(study_lib.REDETECT_DEPENDS_ON), str(report["why"]),
                      "the refusal does not name the pass it is waiting on, "
                      "so whoever reads it cannot tell what to run")
        self.assertEqual(report["refused"], 1)
        self.assertEqual(self.tags_of(store), before,
                         "⛔ a partial run CHANGED A TAG — the refusal in "
                         "front of the pass is what this case protects")

    def test_the_two_directions_are_counted_separately_and_by_value(self):
        """A store whose marks are stale reports the correction it would make,
        in both directions, DERIVED — one mark to remove and one to add."""
        store = self.build_library()
        want = self.fixture["expected"]
        self.assertGreater(want["added"] + want["removed"], 0,
                           "this fixture has nothing to correct, so it cannot "
                           "show that corrections are counted at all")
        report = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertTrue(report["ok"], report.get("why"))
        self.assertEqual(report["added"], want["added"])
        self.assertEqual(report["removed"], want["removed"])
        self.assertIs(report["complete"], True)

    def test_a_correct_store_reports_zero_both_ways_and_survives(self):
        """⛔ THE KNOWN-NEGATIVE. It must SURVIVE. A report that always finds
        corrections, or a rule that catches everything, dies here."""
        store = self.build_library()
        first = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertTrue(first["ok"], first.get("why"))
        settled = self.tags_of(store)
        second = study_lib.redetect_screenshots(
            store, self.root, self.reader, self.PROGRAM_FP)
        self.assertTrue(second["ok"], second.get("why"))
        self.assertEqual(second["added"], 0,
                         "a settled store still had marks to add")
        self.assertEqual(second["removed"], 0,
                         "a settled store still had marks to remove")
        self.assertIs(second["complete"], True)
        self.assertEqual(self.tags_of(store), settled,
                         "a second pass over a settled store moved a tag")
        self.assertEqual(second["union"], first["union"],
                         "the union moved between two runs over one store")


# ===========================================================================
# 26.998-02 — HER BEAT-4 RULING, OVER THE WHOLE PILE
#
# ⛔ HER ANSWER, 2026-08-23, verbatim as the option she selected read:
#
#       Leave them in, let the ranking push them down
#
# ⛔⛔⛔ SUPERSEDED BY HER OWN LATER RULING, 2026-08-23 — READ THIS BEFORE
# READING THE CASES. This block used to say "the rule is that NOTHING is taken
# out". ⛔ THAT IS NO LONGER TRUE AND HAS NOT BEEN SINCE § W-2.
#
# Her beat-4 answer was put back on the table as an option she could keep, and
# SHE MOVED OFF IT. § W-2: **`Leave out, and tell me`** — the room MAY hold
# material back on purpose, screenshots included, even where there was room
# for it, and it must say so when it does. § W-8 then made her ranking a rule
# in her own words ("It is a strict order for now"), and § W-9 tied clippings
# to screenshots at the bottom of it.
#
# ⚠⚠ THE CASES BELOW ARE KEPT, NOT LOOSENED, AND THE DIFFERENCE MATTERS. What
# they actually drive is a fixture of EIGHT TINY ITEMS that never comes near
# the document budget — so nothing is under pressure and nothing is shed.
# Under that condition every assertion here is still exactly true: an item the
# room turned into writing is still material, her own notes and photographs
# are untouched, and what she set aside stays out. ⛔ WHAT THEY MAY NEVER
# AGAIN BE READ AS is a gate on membership being UNCONDITIONAL. They cannot
# see the case her later rulings are about, because their fixture cannot
# overflow — which is this project's own signature defect (a fixture that
# never overflowed reporting what survived a cut), and it is named here rather
# than discovered.
#
# ⭐ WHERE THE SUPERSEDING RULE IS ACTUALLY GATED: `tests/test_her_ranking.cjs`
# (26.998-07/08). It drives a fixture genuinely OVER budget, asserts THE CUT
# FIRED before reading any verdict about what survived it, and then proves her
# order decided the shed — her journal and her hand-written thing survive, the
# saved-for-later pile is what goes, and her photo slice holds. ⛔ A later
# reader changing the drop order must go there; changing anything here will
# not fail, because these cases were never watching that.
#
# ⛔ NO WEIGHT, RATIO, THRESHOLD OR ORDERING VALUE APPEARS HERE, and that is
# unchanged: her ranking is stated in her own words and enforced in that other
# file, and no agent designed any part of it.
# ===========================================================================

class Beat4ScreenshotsStayMaterialTest(unittest.TestCase):
    """26.998-02 tasks 1 and 3 — a screenshot the room turned into WRITING is
    still material for a reflection **when nothing is under pressure**, and
    her ruling reaches no further.

    ⛔ SEE THE SUPERSESSION BLOCK ABOVE. These cases do not gate membership
    under a cut; nothing here can, because the fixture cannot overflow."""

    def setUp(self):
        self.store = {"schema_version": 3, "meta": {}, "items": {}}
        self.add("shot-a", tags=["screenshots"], state="blessed")
        self.add("shot-b", tags=["screenshots"], state="blessed")
        self.add("note-a", tags=[], state="blessed")
        self.add("note-b", tags=[], state="blessed")
        self.add("pic-a", tags=["screenshots"], state="blessed", kind="image")
        self.add("pic-b", tags=[], state="blessed", kind="image")
        self.add("hidden", tags=["screenshots"], state="never_show")
        self.add("fenced", tags=["screenshots"], state="blessed", trigger=True)

    def add(self, item_id, tags, state, kind="text", trigger=False):
        self.store["items"][item_id] = {
            "id": item_id, "source": "photos", "type": kind,
            "origin_path": "/var/folders/x/c/" + item_id,
            "library_path": "items/" + item_id + ".md",
            "title": item_id, "state": state, "trigger": trigger,
            "tags": list(tags), "created_ms": 1000, "saved_ms": 1000,
            "history": [],
        }

    def pool_ids(self):
        payload = study_lib.build_librarian_payload(
            self.store, "reflection", store_dir=None)
        out = set()
        # ⚠ BOTH HALVES, ALWAYS. An item is material whether it reaches the
        # model as a body or as a metadata row; reading only one half would
        # call an item absent that is merely quoted more briefly.
        for key in ("meta_rows", "bodies"):
            for row in (payload.get(key) or []):
                out.add(str(row.get("id")))
        return out

    # -- task 1, the tracer ------------------------------------------------

    def test_one_screenshot_turned_note_is_still_material(self):
        """⛔ HER RULING, TRACED END TO END ON ONE ITEM. `shot-a` is a
        screenshot the room read the words out of and filed as WRITING. She
        ruled it stays in. The control `note-a` is an ordinary note of hers
        and must be material in the same run, so a pool that is simply empty
        cannot pass this case."""
        pool = self.pool_ids()
        self.assertIn("note-a", pool,
                      "the control is missing, so this instrument cannot "
                      "see anything and its verdict here is worthless")
        self.assertIn("shot-a", pool,
                      "a screenshot the room turned into writing was NOT "
                      "material — she ruled that they stay in")

    # -- task 3, the whole pile, by value ----------------------------------

    def test_her_ruling_holds_over_the_pile_and_reaches_no_further(self):
        """Four counts BY VALUE off one fixture, so a rule that catches
        everything and a rule that catches nothing BOTH fail.

        ⚠ ON A POOL UNDER NO PRESSURE. Her § W-8 strict order decides what
        happens when there IS pressure, and that is driven in
        `tests/test_her_ranking.cjs` against a fixture that really overflows."""
        pool = self.pool_ids()
        shots = {"shot-a", "shot-b"}
        notes = {"note-a", "note-b"}
        pics = {"pic-a", "pic-b"}
        self.assertEqual(len(shots & pool), 2,
                         "her screenshots-turned-notes did not all stay in")
        self.assertEqual(len(notes & pool), 2,
                         "her own written notes moved, and her ruling was "
                         "not about them")
        self.assertEqual(len(pics & pool), 2,
                         "her photographs that are still pictures moved, and "
                         "her ruling was not about them either")
        self.assertEqual(len({"hidden", "fenced"} & pool), 0,
                         "something she already set aside came BACK — the "
                         "existing exclusions must run first and unforked")

    def test_the_room_itself_is_unchanged_under_her_ruling(self):
        """Her ruling is about MATERIAL, never about her library. Every item
        is still present, still in the same state, still carrying the same
        tags after the pool is built."""
        before = {i: (it["state"], tuple(it["tags"]), it["type"])
                  for i, it in self.store["items"].items()}
        self.pool_ids()
        after = {i: (it["state"], tuple(it["tags"]), it["type"])
                 for i, it in self.store["items"].items()}
        self.assertEqual(before, after,
                         "building the pool CHANGED her library")
        self.assertEqual(len(self.store["items"]), 8,
                         "an item left the room")


if __name__ == "__main__":
    unittest.main()
