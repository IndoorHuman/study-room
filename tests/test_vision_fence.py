#!/usr/bin/env python3
"""tests/test_vision_fence.py — D-05, the strong form: a fenced photograph's
Vision output MUST NOT EXIST.

Standalone `unittest` suite in the house convention: no runner, no package,
nothing installed (law 8). It exits 0/1 on BARE invocation, so it sits inside
the `tests/test_*.py` glob the counting sweep uses, and it still accepts `-k`
for the V-table's per-claim commands — `tests/test_server_smoke.py` is the
precedent that satisfies both.

WHAT THIS SUITE IS FOR. Law 5 says never-list integrity is ABSOLUTE and a leak
is a P0. This phase hands a list of her photographs to a program that reads the
words off them, so there are exactly two ways a fenced picture's reading could
come to exist, and this suite owns both:

  V8  THE PATH LIST. The fence is applied BEFORE the spawn, to the list of
      paths, not afterwards to the rows. That is the whole difference between
      "her never-shown photograph's OCR is filtered out of the answer" and
      "her never-shown photograph was never opened" — D-05 asks for the
      second. A program that is never handed the path cannot read the file,
      so there is nothing to un-write.

  V10 THE LATER FENCE. She may fence a photograph the room has ALREADY read.
      All three ways in — `never_show`, `retired`, and the trigger overlay —
      must destroy both cache files. `vision_forget` is that destruction, and
      it is idempotent so that a transition landing after a concurrent write
      still ends in an absence.

⚠ THE FENCE-MIRROR DISCIPLINE INVERTS BETWEEN PRODUCT AND TEST, AND THIS FILE
SITS ON THE PRODUCT SIDE OF THAT LINE. `study_lib.vision_path_list` CALLS
`_librarian_fenced` — one implementation, because a second copy is a second
thing to keep correct and law 5 calls a drift a P0. `tests/test_librarian_fence.py`
does the OPPOSITE on purpose: it HAND-ROLLS its predicate so a bug in the fence
cannot hide itself behind the fence. Copying either posture into the other place
is a real defect. What this suite adds is the drill in between — a hand-rolled
FOUR-class copy is patched over the module global and shown to admit a
photograph the shipped FIVE-class predicate excludes, which is the concrete
demonstration that the call is not a stylistic preference.

⚠⚠ THIS SUITE RUNS ON A MACHINE HOLDING A 44 GB REAL LIBRARY. Every path it
writes is under a temp root it created, asserted BEFORE anything is written;
nothing it writes goes near `~/StudyRoom`; and `tearDownModule` re-hashes the
real `items.json` and fails the run if one byte moved.
"""
import base64
import hashlib
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import server  # noqa: E402  — the transitions are driven through the REAL door
import study_lib  # noqa: E402

# ⚠ CAPTURED AT IMPORT, READ-ONLY. The owner's real library lives here. This
# suite never writes into it; these two names are how it proves so afterwards.
REAL_LIBRARY_ROOT = Path.home() / "StudyRoom"
REAL_ITEMS = REAL_LIBRARY_ROOT / "items.json"
REAL_ITEMS_SHA = (hashlib.sha256(REAL_ITEMS.read_bytes()).hexdigest()
                  if REAL_ITEMS.exists() else None)


def tearDownModule():
    """The last word: the real store is exactly as this suite found it."""
    if REAL_ITEMS_SHA is None:
        return
    now = (hashlib.sha256(REAL_ITEMS.read_bytes()).hexdigest()
           if REAL_ITEMS.exists() else None)
    if now != REAL_ITEMS_SHA:
        raise AssertionError(
            "the real items.json moved during this suite — it must never")


PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\0" * 32


def _item(item_id, state="blessed", trigger=False, library_path=None,
          origin_path=None, kind="image"):
    """One store row, the shape import_source writes."""
    return {
        "id": item_id,
        "source": "photos",
        "origin_path": origin_path if origin_path is not None
        else "/var/folders/x/studyroom-collect-1/" + item_id + ".png",
        "library_path": (library_path if library_path is not None
                         else "items/" + item_id + ".png"),
        "type": kind,
        "title": item_id + ".png",
        "state": state,
        "trigger": trigger,
        "tags": [],
        "history": [],
    }


def _store(items, filters=None):
    return {"meta": {"filters": list(filters or [])},
            "items": {it["id"]: it for it in items}}


# ---------------------------------------------------------------------------
# The hand-rolled mirrors used by the DRILLS below — never by product code.
#
# ⚠ These exist so the suite can answer "what happens if the derivation stops
# calling the shipped predicate", which is the only interesting failure mode
# for V8: the shipped predicate itself is proved, independently and by its own
# hand-rolled mirror, in tests/test_librarian_fence.py. Patched over the module
# global in memory; no source file is opened for writing anywhere in this file.
# ---------------------------------------------------------------------------

_FENCE_CLASSES = ("null", "unknown_state", "never_show", "retired",
                  "trigger", "keys_file")


def _mirror_missing(dropped):
    """A copy of `_librarian_fenced` with exactly one class removed."""
    def fenced(item, filters):
        if dropped != "null" and not item:
            return True
        if dropped != "unknown_state" \
                and item.get("state") not in study_lib.VALID_STATES:
            return True
        states = [s for s in ("never_show", "retired") if s != dropped]
        if item.get("state") in states:
            return True
        if dropped != "trigger" and item.get("trigger") is True:
            return True
        if dropped != "keys_file" and (
                study_lib._names_off_limits_path(item.get("library_path"))
                or study_lib._names_off_limits_path(item.get("origin_path"))):
            return True
        return study_lib._matches_active_filter(item, filters)
    return fenced


class VisionFenceTestBase(unittest.TestCase):

    def setUp(self):
        # ⚠ THE TEMP ROOT COMES FIRST, AND NOTHING IS WRITTEN BEFORE THE
        # ASSERTION BELOW.
        self.tmp = tempfile.mkdtemp(prefix="study-room-vision-fence-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.library = Path(self.tmp) / "Library"
        self.assert_under_temp_root(self.library)
        (self.library / "items").mkdir(parents=True)

    def assert_under_temp_root(self, *paths):
        root = os.path.realpath(self.tmp)
        for path in paths:
            here = os.path.realpath(str(path))
            self.assertTrue(here == root or here.startswith(root + os.sep),
                            "a path this suite is about to write is not "
                            "under its own temp root")
            self.assertNotEqual(
                here, os.path.realpath(str(REAL_LIBRARY_ROOT)),
                "a fixture path resolved to the REAL library")

    def snapshot(self, item):
        """Put the item's snapshot on disk so the existence check passes."""
        rel = str(item.get("library_path") or "")
        path = self.library / rel
        self.assert_under_temp_root(path.parent)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(PNG_BYTES)
        return item

    def derive(self, store):
        return study_lib.vision_path_list(store, str(self.library))

    def ids(self, targets):
        return [t[0] for t in targets]


class PathListFenceTest(VisionFenceTestBase):
    """V8 — the fence, applied to the path list, before the spawn."""

    def build_five_classes(self):
        """One photograph per fence class, plus two the pass may read."""
        keys = str(study_lib.keys_file_path())
        items = [
            _item("aa01", state="blessed"),
            _item("aa02", state="unseen"),
            _item("bb01", state="never_show"),
            _item("bb02", state="retired"),
            _item("bb03", state="blessed", trigger=True),
            # the fifth class: a state no version of this app ever wrote.
            # A hand-rolled four-class copy admits it; the shipped predicate
            # holds it back, fail-closed.
            _item("bb04", state="wobbly"),
            # the sixth: a row naming the keys file (26.93-04)
            _item("bb05", state="blessed", origin_path=keys),
        ]
        for it in items:
            self.snapshot(it)
        return _store(items)

    def test_path_list_excludes_fenced(self):
        """The claim, stated the way law 5 states it: a fenced photograph is
        not in the list AT ALL — no id, no path, no metadata. Five classes,
        every one of them, because the union is the fence and a derivation
        that honoured four of five would leak exactly the one it missed."""
        store = self.build_five_classes()
        targets, report = self.derive(store)
        got = self.ids(targets)
        # ⚠ THE PER-CLASS ASSERTIONS COME FIRST, DELIBERATELY. A list compare
        # fails with a diff of ids; these fail with the NAME of the class that
        # leaked, which is what the next reader needs at 2am.
        for item_id, why in (("bb01", "never_show"), ("bb02", "retired"),
                             ("bb03", "the trigger overlay"),
                             ("bb04", "an unknown state (fail-closed)"),
                             ("bb05", "the keys-file path class")):
            self.assertNotIn(
                item_id, got,
                "a photograph fenced by " + why + " reached the path list — "
                "the reader would have opened it, and D-05 says its output "
                "must not exist (law 5 P0)")
        self.assertEqual(got, ["aa01", "aa02"],
                         "only the two unfenced photographs may be read")
        self.assertEqual(report["fenced"], 5,
                         "every fenced photograph is counted BY REASON, "
                         "never silently dropped")
        self.assertEqual(report["eligible"], 2)
        self.assertEqual((report["jailed"], report["bad_name"],
                          report["missing_file"]), (0, 0, 0))

    def test_drill_a_hand_rolled_copy_admits_the_class_it_dropped(self):
        """PERMANENT DRILL — the reason the call is not optional.

        For each of the five classes: patch a hand-rolled mirror MISSING that
        class over the module global, derive again, and assert the photograph
        that class fences is now IN the list. A derivation that had copied the
        predicate instead of calling it would ship exactly one of these five
        holes and nothing here would notice.

        ⚠ The mutation asserts it CHANGED the answer first. A patch that made
        no difference is a patch that was never planted, and a drill scoring
        that as a catch is measuring nothing (26.93-10's own rule)."""
        by_class = {"never_show": "bb01", "retired": "bb02",
                    "trigger": "bb03", "unknown_state": "bb04",
                    "keys_file": "bb05"}
        real = study_lib._librarian_fenced
        caught = 0
        try:
            for dropped, item_id in sorted(by_class.items()):
                store = self.build_five_classes()
                study_lib._librarian_fenced = _mirror_missing(dropped)
                targets, report = self.derive(store)
                got = self.ids(targets)
                self.assertIn(
                    item_id, got,
                    "dropping the " + dropped + " class did not change the "
                    "answer — the mutation was never planted, so a catch "
                    "here would be meaningless")
                self.assertEqual(report["fenced"], 4,
                                 "exactly one class went missing")
                caught += 1
        finally:
            study_lib._librarian_fenced = real
        self.assertEqual(caught, 5,
                         "five classes drilled, by value — a loop that "
                         "stopped early must not report a pass")
        # the unmutated control, in the same run
        store = self.build_five_classes()
        targets, report = self.derive(store)
        self.assertEqual(self.ids(targets), ["aa01", "aa02"],
                         "CONTROL: the real predicate is restored and the "
                         "derivation is green again")
        self.assertEqual(report["fenced"], 5)

    def test_jail_refuses_traversal(self):
        """`library_path` is DATA, not a trusted path (the `_read_body_capped`
        jail, in its own words). A hand-edited or malformed row carrying `../`
        or an absolute path must never hand an arbitrary local file to a
        program that reads the words off it."""
        good = self.snapshot(_item("aa01"))
        outside = Path(self.tmp) / "outside.png"
        outside.write_bytes(PNG_BYTES)
        rows = [
            good,
            _item("cc01", library_path="../../etc/passwd"),
            _item("cc02", library_path=str(outside)),
            _item("cc03", library_path="items/../../outside.png"),
        ]
        targets, report = self.derive(_store(rows))
        self.assertEqual(self.ids(targets), ["aa01"])
        self.assertEqual(report["jailed"], 3,
                         "each refusal is COUNTED, never read and never "
                         "silently skipped")
        self.assertEqual(report["eligible"], 1)

    def test_newline_in_path_refused(self):
        """The stdin protocol is NEWLINE-DELIMITED, so a filename holding a
        newline would arrive at the reader as TWO paths. Measured zero today
        across all 13,606 — and ASSERTED rather than relied on, because that
        is a property of server-generated <16-hex>.<ext> names, not a
        guarantee."""
        good = self.snapshot(_item("aa01"))
        bad_n = self.snapshot(_item("dd01", library_path="items/a\nb.png"))
        bad_r = self.snapshot(_item("dd02", library_path="items/c\rd.png"))
        targets, report = self.derive(_store([good, bad_n, bad_r]))
        self.assertEqual(self.ids(targets), ["aa01"])
        self.assertEqual(report["bad_name"], 2)
        for _id, path in targets:
            self.assertNotIn("\n", path)
            self.assertNotIn("\r", path)

    def test_missing_file_is_counted_never_fatal(self):
        """A row whose snapshot is gone is counted and skipped. Never an
        exception: one evicted file must not stop a twenty-minute pass over
        thirteen thousand photographs."""
        good = self.snapshot(_item("aa01"))
        gone = _item("ee01")            # deliberately NOT snapshotted
        targets, report = self.derive(_store([good, gone]))
        self.assertEqual(self.ids(targets), ["aa01"])
        self.assertEqual(report["missing_file"], 1)

    def test_empty_store_yields_no_spawn(self):
        """Zero non-fenced photographs is zero work, never an error and never
        a stall. The caller's half of this — that an empty list is never
        spawned on — is `run_vision_pass`'s own refusal, proved in
        tests/test_vision_program.py; what is proved HERE is that the
        derivation hands it an empty list rather than raising."""
        targets, report = self.derive(_store([]))
        self.assertEqual(targets, [])
        self.assertEqual(report["eligible"], 0)

        only_fenced = [self.snapshot(_item("bb01", state="never_show")),
                       self.snapshot(_item("bb02", state="retired"))]
        targets, report = self.derive(_store(only_fenced))
        self.assertEqual(targets, [])
        self.assertEqual((report["eligible"], report["fenced"]), (0, 2))

        text = self.snapshot(_item("ff01", kind="text",
                                   library_path="items/ff01.md"))
        targets, report = self.derive(_store([text]))
        self.assertEqual(targets, [],
                         "a note is not a photograph — the type filter runs "
                         "first and a note never enters the count at all")
        self.assertEqual(report["fenced"], 0)

    def test_list_is_stable_and_sorted(self):
        """Ascending by item id, and identical across two derivations over an
        unchanged store. ⚠ The fence filter runs BEFORE the sort, so no
        ordering rule can ever re-admit a fenced item."""
        items = [self.snapshot(_item(i)) for i in
                 ("cc09", "aa01", "zz88", "mm42", "aa02")]
        items.append(self.snapshot(_item("nn07", state="never_show")))
        store = _store(items)
        first, report_a = self.derive(store)
        second, report_b = self.derive(store)
        self.assertEqual(self.ids(first),
                         ["aa01", "aa02", "cc09", "mm42", "zz88"])
        self.assertEqual(first, second,
                         "two derivations over an unchanged store are "
                         "byte-identical")
        self.assertEqual(report_a, report_b)
        self.assertNotIn("nn07", self.ids(first))

    def test_the_derivation_never_writes(self):
        """It reads the store and stats the snapshots. Nothing else — a
        derivation that created a directory as a side effect would have put a
        write on the path law 5 guards."""
        items = [self.snapshot(_item("aa01")),
                 self.snapshot(_item("bb01", state="never_show"))]
        before = sorted(p.name for p in self.library.iterdir())
        self.derive(_store(items))
        self.assertEqual(sorted(p.name for p in self.library.iterdir()),
                         before,
                         "the derivation created something on disk")

    def test_filters_are_a_fence_class_too(self):
        """meta.filters is the fifth arm of `_librarian_fenced`'s union and it
        reaches the derivation through the store, not through an argument the
        caller might forget to pass."""
        shot = self.snapshot(_item("aa01"))
        shot["tags"] = ["screenshots"]
        other = self.snapshot(_item("aa02"))
        store = _store([shot, other],
                       filters=[{"facet": "tag", "value": "screenshots"}])
        targets, report = self.derive(store)
        self.assertEqual(self.ids(targets), ["aa02"])
        self.assertEqual(report["fenced"], 1)


class VisionForgetTest(VisionFenceTestBase):
    """V10 — a photograph that BECOMES fenced loses its reading.

    The path list (V8) covers a photograph fenced before the pass ran. This
    class covers the other half, which is the one that happens in real use:
    she reads a picture, THEN decides she never wants to see it. Her judgement
    has to reach the disk as an absence, or D-05's "must not exist" holds only
    for pictures she judged in the right order."""

    def entry(self, item_id, text="the words on the picture"):
        """A real cache entry, written by the shipped writer."""
        row = {"path": "/x/" + item_id + ".png", "text": text,
               "themes": ["a"], "faces": 0, "lang": "auto", "dim": 768,
               "type": 1,
               "fp": base64.b64encode(bytes([len(item_id) % 251]) * 3072)
               .decode("ascii")}
        study_lib.vision_write_entry(str(self.library), item_id, row, "fp0")
        self.assertTrue(self.json_of(item_id).is_file())
        self.assertTrue(self.print_of(item_id).is_file())
        return row

    def json_of(self, item_id):
        return study_lib.vision_entry_path(str(self.library), item_id)

    def print_of(self, item_id):
        return study_lib.vision_print_path(str(self.library), item_id)

    def assert_gone(self, item_id, why):
        for path, what in ((self.json_of(item_id), "<id>.json (the WORDS)"),
                           (self.print_of(item_id), "<id>.fp (the print)")):
            self.assertFalse(
                path.exists(),
                "after " + why + ", " + what + " is still on disk — a fenced "
                "photograph's reading MUST NOT EXIST (D-05, law 5 P0)")

    # -- vision_forget itself -----------------------------------------------

    def test_forget_removes_both_files_and_counts_them(self):
        self.entry("aa01")
        self.assertEqual(
            study_lib.vision_forget(str(self.library), "aa01"), 2,
            "both files are removed and the count says which happened")
        self.assert_gone("aa01", "vision_forget")

    def test_forget_is_idempotent(self):
        """Fail-open on ABSENCE, never on presence. Calling it on a
        photograph that was never read raises nothing and removes nothing;
        calling it twice leaves the same absence. That is what makes the
        adjacency case below safe to state."""
        self.assertEqual(
            study_lib.vision_forget(str(self.library), "never-read"), 0,
            "an id with no cache entry is a no-op, never an exception")
        self.entry("aa01")
        self.assertEqual(study_lib.vision_forget(str(self.library), "aa01"), 2)
        self.assertEqual(study_lib.vision_forget(str(self.library), "aa01"), 0)
        self.assert_gone("aa01", "two forgets")
        # and with only the print left behind (an interrupted write)
        self.entry("bb02")
        self.json_of("bb02").unlink()
        self.assertEqual(study_lib.vision_forget(str(self.library), "bb02"), 1)
        self.assert_gone("bb02", "forgetting a half-written entry")

    def test_forget_is_loud_when_a_file_refuses_to_go(self):
        """FAIL-OPEN ON ABSENCE, NEVER ON PRESENCE — and the second half is a
        gate here rather than a sentence in a docstring, because the two look
        identical until the day one matters. `except FileNotFoundError` is a
        no-op on a picture nobody read; `except OSError` would swallow a cache
        entry that could not be removed, which is a fence failure reported as
        a success. A directory where the entry belongs is the cheapest way to
        make a real unlink refuse."""
        entry = self.json_of("aa01")
        entry.parent.mkdir(parents=True, exist_ok=True)
        entry.mkdir()
        with self.assertRaises(OSError):
            study_lib.vision_forget(str(self.library), "aa01")

    def test_forget_touches_only_one_id(self):
        self.entry("aa01", text="mine")
        self.entry("aa02", text="the neighbour's")
        neighbour = self.json_of("aa02").read_bytes()
        neighbour_fp = self.print_of("aa02").read_bytes()
        study_lib.vision_forget(str(self.library), "aa01")
        self.assert_gone("aa01", "forgetting its neighbour")
        self.assertEqual(self.json_of("aa02").read_bytes(), neighbour,
                         "a neighbouring photograph's entry is byte-identical")
        self.assertEqual(self.print_of("aa02").read_bytes(), neighbour_fp)

    def test_forget_removes_the_words_before_the_print(self):
        """THE ORDER IS DELIBERATE AND IT IS THE MIRROR OF THE WRITER'S.
        `vision_write_entry` writes the .fp FIRST so an interrupted write
        leaves at worst an orphan print; this removes the .json FIRST so an
        interrupted removal leaves at worst an orphan print too. Both point
        the same way, and for this one there is a second reason: the .json is
        where the WORDS OFF HER PICTURE live, so it is the file that must stop
        existing first."""
        src = (Path(study_lib.__file__)).read_text(encoding="utf-8")
        body = src.split("def vision_forget(", 1)
        self.assertEqual(len(body), 2, "vision_forget is a top-level def")
        body = body[1].split("\ndef ", 1)[0]
        self.assertLess(body.index("vision_entry_path"),
                        body.index("vision_print_path"),
                        "the entry (.json — the words) is unlinked before "
                        "the print")

    # -- the three transitions, driven through the REAL door ----------------

    def serve(self, items):
        """A real library and a real server. ⚠ The transitions are driven
        through POST /api/state, not by calling a helper: the claim is that
        the SHIPPED door destroys the cache, and a test that called
        vision_forget itself would prove only that vision_forget works."""
        store = study_lib.new_store(str(self.library))
        for it in items:
            self.snapshot(it)
            it.setdefault("history", []).append(
                {"at": "2026-08-13T00:00:00-07:00", "from": None,
                 "to": it["state"], "via": "import"})
            store["items"][it["id"]] = it
        study_lib.save_store(str(self.library), store)
        httpd = server.create_server(str(self.library), 0)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)
        return port

    def post(self, port, path, body):
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        try:
            raw = json.dumps(body).encode("utf-8")
            conn.request("POST", path, raw,
                         {"Content-Type": "application/json"})
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read().decode("utf-8"))
        finally:
            conn.close()

    def test_transition_deletes_cache(self):
        """V10, all THREE ways a photograph becomes fenced, each asserted for
        BOTH files. Wiring only one of the three is the mutation this is
        drilled against, and it is the realistic one: `never_show` is the
        transition anyone would think of first."""
        items = [_item("aa01", state="blessed"),
                 _item("aa02", state="blessed"),
                 _item("aa03", state="blessed"),
                 _item("zz99", state="blessed")]
        port = self.serve(items)
        for i in ("aa01", "aa02", "aa03", "zz99"):
            self.entry(i)

        status, data = self.post(port, "/api/state", {"changes": [
            {"id": "aa01", "to": "never_show", "via": "manage"}]})
        self.assertEqual(status, 200, data)
        self.assert_gone("aa01", "a transition into never_show")

        status, data = self.post(port, "/api/state", {"changes": [
            {"id": "aa02", "to": "retired", "via": "reaction:never_again"}]})
        self.assertEqual(status, 200, data)
        self.assert_gone("aa02", "a transition into retired")

        status, data = self.post(port, "/api/state", {"changes": [
            {"id": "aa03", "to": "blessed", "via": "manage",
             "trigger": True}]})
        self.assertEqual(status, 200, data)
        self.assert_gone("aa03", "the trigger overlay being set")

        # the control, in the same run: a photograph nobody judged keeps its
        # reading, so the three results above are results and not a suite
        # that deletes everything.
        self.assertTrue(self.json_of("zz99").is_file(),
                        "CONTROL: an unjudged photograph keeps its reading")
        self.assertTrue(self.print_of("zz99").is_file())

    def test_releasing_the_trigger_does_not_resurrect_a_reading(self):
        """Un-fencing is a deliberate per-item release and it must NOT hand
        back the words: the cache is a REGENERABLE cache, so the room re-reads
        the picture. A release that restored an old reading would be reading
        her picture on the strength of a judgement she has since changed."""
        items = [_item("aa01", state="blessed")]
        port = self.serve(items)
        self.entry("aa01")
        self.post(port, "/api/state", {"changes": [
            {"id": "aa01", "to": "blessed", "via": "manage",
             "trigger": True}]})
        self.assert_gone("aa01", "the trigger being set")
        self.post(port, "/api/state", {"changes": [
            {"id": "aa01", "to": "blessed", "via": "manage",
             "trigger": False}]})
        self.assertIsNone(
            study_lib.vision_read_entry(str(self.library), "aa01"),
            "releasing the trigger must not resurrect the reading")

    def test_a_roster_add_forgets_every_photograph_it_retroactively_fences(self):
        """The OTHER door, and the one that fences in BULK. D-07's retroactive
        stamp closed the hole where a folder added to the roster left its
        already-imported items surfacing; the same stamp has to reach the
        cache, or a folder she just declared private keeps its readings."""
        vault = str(Path(self.tmp) / "Vault")
        inside = _item("aa01", state="blessed",
                       origin_path=vault + "/Journal/2026-01-02.png")
        outside = _item("zz99", state="blessed",
                        origin_path=vault + "/Recipes/soup.png")
        store = study_lib.new_store(str(self.library))
        for it in (inside, outside):
            self.snapshot(it)
            store["items"][it["id"]] = it
        store["meta"]["vault_root"] = vault
        study_lib.save_store(str(self.library), store)
        httpd = server.create_server(str(self.library), 0)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 5)
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)

        self.entry("aa01")
        self.entry("zz99")
        status, data = self.post(port, "/api/librarian/roster",
                                 {"op": "add", "folder": "Journal"})
        self.assertEqual(status, 200, data)
        self.assertEqual(data["flagged"], 1, data)
        self.assert_gone("aa01", "a retroactive roster stamp")
        self.assertTrue(self.json_of("zz99").is_file(),
                        "CONTROL: a photograph outside the folder keeps its "
                        "reading")

    def test_the_adjacency_case_ends_in_an_absence_in_both_orders(self):
        """⚠ THE PASS AND A JUDGEMENT CAN LAND AT THE SAME MOMENT, and the
        two orders are not symmetric — which is why both are stated rather
        than one being assumed to cover the other.

        WRITE then FORGET: the pass wrote a row a moment before she fenced the
        picture; the transition's forget removes it, and a second forget
        changes nothing. Ends in an absence.

        FORGET then WRITE: a row already in flight lands AFTER the forget.
        That is a REAL residual window, it is NOT closed by this plan, and it
        is named here rather than in a document nobody re-reads — the pass's
        caller owns closing it by re-deriving the fence at the end of a run
        (26.94-06/07). What IS true today is that a forget after the write
        always wins, and that forgetting twice is the same as once."""
        items = [_item("aa01", state="blessed")]
        port = self.serve(items)

        # order 1 — the write lands first
        self.entry("aa01")
        self.post(port, "/api/state", {"changes": [
            {"id": "aa01", "to": "never_show", "via": "manage"}]})
        self.assert_gone("aa01", "write-then-forget")
        self.assertEqual(study_lib.vision_forget(str(self.library), "aa01"), 0,
                         "a second forget changes nothing")
        self.assert_gone("aa01", "a second forget")

        # order 2 — the row lands after the forget, and the window is REAL
        self.entry("aa01")
        self.assertIsNotNone(
            study_lib.vision_read_entry(str(self.library), "aa01"),
            "the residual window is real and recorded, not papered over: a "
            "row written after the forget stays until something forgets "
            "again. 26.94-06/07 owns closing it.")
        self.assertEqual(study_lib.vision_forget(str(self.library), "aa01"), 2,
                         "and one more forget is all it takes")

    def test_the_birth_sites_are_not_transition_sites_and_here_is_why(self):
        """⚠ A REMINDER PIN, NOT A PROOF — and it says so.

        The wiring above covers every place an item that ALREADY EXISTS
        becomes fenced. Three other places assign `never_show` / `retired` /
        `trigger=True`, and all three are BIRTHS: the two `born_trigger`
        fields at item creation, and `_inherit_judgment`, which decides a
        brand-new item's opening state from a judged twin. None of them can
        strand a reading, and the reason is a PRECONDITION rather than an
        argument: an item id is derived from its content hash, and NOTHING in
        this codebase removes an item from the store — so a newborn id has
        never been in the store, and therefore has never been read.

        The day someone adds an item-removal path, that precondition dies and
        `_inherit_judgment` becomes a real forget site. This case exists to
        put that sentence in front of whoever adds it. It greps for the two
        literal shapes and nothing more; a determined removal written another
        way walks straight past it, exactly like the repo's own pre-push
        hook, which is a reminder and not a wall."""
        for name in ("server.py", "study_lib.py"):
            src = (_REPO_ROOT / name).read_text(encoding="utf-8")
            code = "\n".join("" if l.lstrip().startswith("#") else l
                             for l in src.split("\n"))
            for shape in ('del store["items"]', 'store["items"].pop('):
                self.assertNotIn(
                    shape, code,
                    name + " gained an item-removal path (" + shape + "). "
                    "Read this test's docstring: removing an item can leave "
                    "its Vision reading on disk under an id a later import "
                    "can mint again, and _inherit_judgment then needs a "
                    "vision_forget it does not have today (D-05).")

    def test_drill_wiring_only_never_show_leaves_the_other_two_readings(self):
        """PERMANENT DRILL — the mutation the plan names, kept as a drill
        rather than a note about a run that happened once.

        A wiring that fired only on `never_show` is the realistic mistake:
        it is the transition the requirement is usually stated with. Here the
        server's forget is patched to a no-op for anything else, and the two
        readings that must have gone are asserted to still be there."""
        items = [_item("aa01", state="blessed"),
                 _item("aa02", state="blessed"),
                 _item("aa03", state="blessed")]
        port = self.serve(items)
        for i in ("aa01", "aa02", "aa03"):
            self.entry(i)
        real = server.study_lib.vision_forget
        planted = {"n": 0}

        def only_never_show(library_root, item_id):
            planted["n"] += 1
            if item_id == "aa01":
                return real(library_root, item_id)
            return 0

        server.study_lib.vision_forget = only_never_show
        try:
            for item_id, to, extra in (("aa01", "never_show", {}),
                                       ("aa02", "retired", {}),
                                       ("aa03", "blessed",
                                        {"trigger": True})):
                body = {"id": item_id, "to": to, "via": "manage"}
                body.update(extra)
                self.post(port, "/api/state", {"changes": [body]})
        finally:
            server.study_lib.vision_forget = real
        self.assertGreaterEqual(
            planted["n"], 3,
            "the mutation was never reached — the wiring does not call "
            "vision_forget at all, so this drill measured nothing")
        self.assert_gone("aa01", "the one transition that WAS wired")
        for item_id, why in (("aa02", "retired"), ("aa03", "the trigger")):
            self.assertTrue(
                self.json_of(item_id).is_file(),
                "the drill's point: with only never_show wired, " + why +
                " leaves the reading on disk")
            self.assertTrue(self.print_of(item_id).is_file())
        # and the real wiring, restored, takes both
        self.post(port, "/api/state", {"changes": [
            {"id": "aa02", "to": "blessed", "via": "management-dig-out"}]})
        self.post(port, "/api/state", {"changes": [
            {"id": "aa02", "to": "retired", "via": "manage"}]})
        self.assert_gone("aa02", "CONTROL: the real wiring restored")


if __name__ == "__main__":
    unittest.main()
