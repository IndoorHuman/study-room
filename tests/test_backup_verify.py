#!/usr/bin/env python3
"""tests/test_backup_verify.py — the way back, proved by value (V20, V21).

Standalone in the house convention: no runner, no package.json, nothing
installed (law 8). It is a `unittest.TestCase` suite ending in
`unittest.main()`, which exits 0/1 on BARE invocation so the counting sweep
can run it, AND accepts `-k` so the V-table's
`python3 tests/test_backup_verify.py -k rollback_restores_counts` selects one
case. (`tests/test_startup_check.py` warns that a suite expecting flags would
exit 2 under the sweep; `unittest.main()` needs none, so both hold.)

WHAT THIS SUITE IS FOR. Phase 26.94 opens a one-way door over a library of
16,559 items that cannot be recreated. `tools/backup_library.py` is the way
back, and this suite is the proof that the way back works BEFORE anything
destructive runs. Two claims carry it:

  V20 — a backup verifies only when all three assertions hold, in order:
        sha256 identity per copied file, a real `study_lib.load_store` parse,
        and the five counts BY VALUE. ⚠ The third is the only one that can
        tell a good file from a PLAUSIBLE one: the five stale artifacts in
        the real library root parse cleanly at the right schema version and
        are missing the entire photograph library.

  V21 — rollback restores the counts and removes everything new BY SET
        DIFFERENCE against the restored store's own `library_path` and
        `attachments` values -- never by the clock.

⚠⚠ A GATE NEVER SEEN RED IS NOT EVIDENCE, so five of these cases ARE the red.
Three drive `verify`'s three assertions one at a time with a copy mutated in
exactly one way (a flipped byte · schema_version 2 · one item deleted), and
two drive `rollback`'s two removals by re-composing it out of its own steps
with ONE step replaced -- the clock instead of the set difference, and no
cache removal. Each drill asserts that the postcondition check FIRES and
names the file it caught, because a drill that only asserts "something
failed" cannot tell a caught defect from a broken harness.

⚠⚠ THIS SUITE NEVER TOUCHES THE REAL LIBRARY. It runs on a machine holding a
44 GB library that is the owner's only copy. Every path it writes is under a
temp root it created; `assert_under_temp_root` says so BEFORE anything is
written; the real library root is resolved once at import ONLY so that every
fixture root can be asserted different from it; and `tearDownModule` re-reads
the real `items.json` at the end and fails the run if one byte moved.

The temp trees this suite makes are removed by this suite: every root here is
made with `tempfile.mkdtemp` (the system temp location, outside the repo) and
removed on cleanup.
"""

import hashlib
import json
import os
import shutil
import socket
import sys
import tempfile
import time
import unicodedata
import unittest
from pathlib import Path, PurePosixPath

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, REPO_ROOT)
sys.path.insert(0, os.path.join(REPO_ROOT, "tools"))

import study_lib                       # noqa: E402
import backup_library as B             # noqa: E402


# The case count this file asserts BY VALUE. A harness that aborts early then
# fails loudly instead of reporting a smaller success.
EXPECTED_CASES = 25

# The five counts the real library holds, measured 2026-08-13. The full-scale
# fixture is built to exactly these so the SHIPPED DEFAULTS are what gets
# driven, not a convenient smaller number.
REAL_COUNTS = {"items": 16559, "image": 13606, "blessed": 188,
               "never_show": 68, "retired": 11}

# ⚠ The five stale artifacts that really sit in the library root, by name.
# Three are ~2.2 MB and two are ~41-45 KB; only THREE end in `.bak`. They are
# the reason the refusal glob is `items.json.*` and not `items.json*.bak`.
REAL_STALE_SIBLINGS = (
    "items.json.bak-20260721-orphan",
    "items.json.pre-26.4-06-20260722-095504.bak",
    "items.json.uat25-backup",
    "items.json.v1.bak",
    "items.json.v2.bak",
)

# ⚠ CAPTURED AT IMPORT, BEFORE ANY CASE RUNS. This is how the suite proves
# afterwards that it did not touch the owner's real library.
REAL_LIBRARY_ROOT = Path(B.default_library_root())
REAL_ITEMS = REAL_LIBRARY_ROOT / "items.json"
REAL_ITEMS_SHA = (hashlib.sha256(REAL_ITEMS.read_bytes()).hexdigest()
                  if REAL_ITEMS.is_file() else None)


def tearDownModule():
    """⚠ THE LAST WORD: the owner's items.json is exactly as this suite found
    it. Not asserted by assumption -- re-read and re-hashed."""
    if REAL_ITEMS_SHA is None:
        return
    now = hashlib.sha256(REAL_ITEMS.read_bytes()).hexdigest()
    if now != REAL_ITEMS_SHA:
        raise AssertionError(
            "THE REAL LIBRARY'S items.json CHANGED DURING THIS RUN -- this "
            "suite must never write into it")


# ---------------------------------------------------------------------------
# ---- fixtures: small libraries, and one built to the five real counts ------

def _item(iid, itype="image", state="unseen", library_path=None, tags=None,
          attachments=None):
    return {
        "id": iid,
        "type": itype,
        "state": state,
        "library_path": library_path or ("items/%s.%s" % (
            iid, "jpeg" if itype == "image" else "md")),
        "origin_path": "/tmp/fixture-source/%s" % iid,
        "title": "%s.jpeg" % iid if itype == "image" else "%s.md" % iid,
        "created_ms": 1700000000000,
        "imported_ms": 1700000001000,
        "saved_ms": 1700000000000,
        "last_opened_ms": None,
        "resting_until_ms": None,
        "history": [],
        "tags": list(tags or []),
        "trigger": False,
        "content_hash": hashlib.sha256(iid.encode()).hexdigest(),
        "comments": [],
        "year": 2023,
        "folder": "fixture",
        "source": "folder",
        "attachments": list(attachments or []),
    }


def _write_library(root, items, snapshots=True, extras=True):
    """Write a real, loadable library at `root`."""
    root = Path(root)
    (root / "items").mkdir(parents=True, exist_ok=True)
    if snapshots:
        for it in items:
            p = root / it["library_path"]
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(("snapshot-of-" + it["id"]).encode("utf-8"))
    if extras:
        (root / "librarian").mkdir(parents=True, exist_ok=True)
        (root / "librarian" / "notebook.md").write_text("her names\n")
        (root / "librarian" / "blessings.json").write_text('{"blessings":[]}')
        (root / "decorations.json").write_text('{"pages":[]}')
        (root / "layout.json").write_text('{"v":1}')
        for src in ("apple-photos", "apple-notes"):
            d = root / "adapters" / src
            d.mkdir(parents=True, exist_ok=True)
            (d / "ledger.json").write_text('{"ids":["%s"]}' % src)
    store = study_lib.new_store(root)
    store["items"] = {it["id"]: it for it in items}
    study_lib.save_store(root, store)
    return store


def small_items():
    """5 screenshots + 2 notes.

    All five photographs carry the `screenshots` tag, because tier 2 backs up
    exactly the snapshots the note pass will move: a fixture whose note pass
    moves a photograph tier 2 never copied would be testing a mismatch this
    tool does not have."""
    items = []
    for n in range(5):
        items.append(_item("img%04d" % n, "image", tags=["screenshots"]))
    for n in range(2):
        items.append(_item("txt%04d" % n, "text"))
    return items


def small_counts():
    return {"items": 7, "image": 5, "blessed": 0, "never_show": 0,
            "retired": 0}


def full_scale_items():
    """A store built to 16,559 / 13,606 / 188 / 68 / 11 -- the real numbers,
    so the shipped default expectations are what the case drives."""
    items = []
    n = 0
    states = ([("blessed", 188), ("never_show", 68), ("retired", 11)])
    plan = []
    for state, count in states:
        plan.extend([state] * count)
    plan.extend(["unseen"] * (REAL_COUNTS["items"] - len(plan)))
    for idx, state in enumerate(plan):
        itype = "image" if idx < REAL_COUNTS["image"] else "text"
        items.append(_item("f%07d" % idx, itype, state))
        n += 1
    return items


class LibraryCase(unittest.TestCase):
    """Every case gets its own temp root, and says so before writing."""

    def setUp(self):
        # ⚠ THE TEMP ROOT COMES FIRST, AND NOTHING IS WRITTEN BEFORE THE
        # ASSERTION BELOW.
        self.tmp = tempfile.mkdtemp(prefix="study-room-backup-verify-")
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.lib = Path(self.tmp) / "Library"
        self.dest = Path(self.tmp) / "backup"
        self.assert_under_temp_root(self.lib, self.dest)

    def assert_under_temp_root(self, *paths):
        root = os.path.realpath(self.tmp)
        for path in paths:
            here = os.path.realpath(str(path))
            self.assertTrue(here == root or here.startswith(root + os.sep),
                            "a path this suite is about to write is not "
                            "under its own temp root")
            self.assertNotEqual(os.path.realpath(str(path)),
                                os.path.realpath(str(REAL_LIBRARY_ROOT)),
                                "a fixture path resolved to the REAL library")

    # -- helpers ------------------------------------------------------------

    def build(self, items=None, snapshots=True):
        items = small_items() if items is None else items
        return _write_library(self.lib, items, snapshots=snapshots)

    def take_backup(self, expected=None, tier2_list=None, dest=None):
        res = B.backup(self.lib, dest or self.dest, tier2_list,
                       expected or small_counts(), stamp="20260813T000000Z",
                       echo=lambda *a: None)
        self.assertTrue(res["ok"], res.get("why"))
        return res

    def manifest(self, dest=None):
        return json.loads((Path(dest or self.dest) / B.MANIFEST_NAME)
                          .read_text(encoding="utf-8"))

    def rewrite_manifest(self, manifest, dest=None):
        (Path(dest or self.dest) / B.MANIFEST_NAME).write_text(
            json.dumps(manifest, ensure_ascii=False, indent=1,
                       sort_keys=True), encoding="utf-8")

    def restamp(self, rel, tier=1, dest=None):
        """Recompute one manifest entry after a deliberate mutation, so the
        LATER assertion is the one that fires rather than assertion 1."""
        dest = Path(dest or self.dest)
        m = self.manifest(dest)
        path = B.backup_location(dest, tier, rel)
        for entry in m["tier%d" % tier]:
            if entry["rel"] == rel:
                entry["sha256"] = B.sha256_file(path)
                entry["bytes"] = path.stat().st_size
        self.rewrite_manifest(m, dest)

    def free_port(self):
        """A port nothing can take from under us: bound, never listening, so
        a connect gets refused for the whole case."""
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(("127.0.0.1", 0))
        self.addCleanup(s.close)
        return s.getsockname()[1]


# ---------------------------------------------------------------------------
# ---- V20: the backup, and the three assertions ----------------------------

class BackupVerifyCase(LibraryCase):

    def test_verify_ok_on_a_good_backup(self):
        """The unmutated control. Two controls in this file, not one: a drill
        whose control is red proves nothing about its catches."""
        self.build()
        self.take_backup()
        res = B.verify(self.dest, small_counts())
        self.assertTrue(res["ok"], res["why"])
        self.assertEqual(res["counts"], small_counts())

    def test_verify_ok_at_the_five_real_counts(self):
        """The second control, and the one that drives the SHIPPED DEFAULTS:
        16,559 / 13,606 / 188 / 68 / 11 with no expectations passed in."""
        self.build(full_scale_items(), snapshots=False)
        res = B.backup(self.lib, self.dest, None, None,
                       stamp="20260813T000000Z", echo=lambda *a: None)
        self.assertTrue(res["ok"], res.get("why"))
        ver = B.verify(self.dest)
        self.assertTrue(ver["ok"], ver["why"])
        self.assertEqual(ver["counts"], REAL_COUNTS)

    def test_flipped_byte_in_items_json_is_refused(self):
        """RED 1 of 3 -- assertion 1 (sha256 identity). One byte of the COPY
        is changed and the manifest is left alone, which is exactly what a
        truncated or half-written copy looks like.

        ⚠ THE BYTE IS CHOSEN SO THAT NOTHING ELSE CAN CATCH IT: it lands
        inside an item title, so the copy still parses at the right schema
        version and still holds all seven items with the right states. If
        assertion 1 were removed this backup would be called good, which is
        the whole reason it is assertion 1."""
        self.build()
        self.take_backup()
        copied = self.dest / "items.json"
        data = bytearray(copied.read_bytes())
        at = data.index(b"img0000.jpeg") + 11        # the final 'g'
        data[at] = data[at] ^ 0x01
        copied.write_bytes(bytes(data))

        # Proved, not assumed: assertions 2 and 3 both pass on this copy.
        self.assertEqual(B.store_counts(study_lib.load_store(self.dest)),
                         small_counts())

        res = B.verify(self.dest, small_counts())
        self.assertFalse(res["ok"])
        self.assertIn("sha256", res["why"])
        self.assertIn("items.json", res["why"])

    def test_schema_version_two_in_the_copy_is_refused(self):
        """RED 2 of 3 -- assertion 2 (the shipped reader). The copy is valid
        JSON and it is not a schema the room reads, which `load_store` refuses
        by contract: it must never return a fresh empty store for a file that
        exists but is unreadable, because blessing history is sacred."""
        self.build()
        self.take_backup()
        copied = self.dest / "items.json"
        store = json.loads(copied.read_text(encoding="utf-8"))
        store["schema_version"] = 2
        copied.write_text(json.dumps(store), encoding="utf-8")
        self.restamp("items.json")

        res = B.verify(self.dest, small_counts())
        self.assertFalse(res["ok"])
        self.assertIn("load_store", res["why"])

    def test_one_deleted_item_is_refused(self):
        """RED 3 of 3 -- assertion 3 (the counts, by value). The copy parses
        perfectly; it holds 16,558 items where 16,559 were expected."""
        self.build(full_scale_items(), snapshots=False)
        B.backup(self.lib, self.dest, None, None, stamp="20260813T000000Z",
                 echo=lambda *a: None)
        copied = self.dest / "items.json"
        store = json.loads(copied.read_text(encoding="utf-8"))
        victim = sorted(store["items"])[0]
        del store["items"][victim]
        copied.write_text(json.dumps(store), encoding="utf-8")
        self.restamp("items.json")

        res = B.verify(self.dest)
        self.assertFalse(res["ok"])
        self.assertIn("items", res["why"])
        self.assertIn("16558", res["why"])
        self.assertIn("16559", res["why"])

    def test_wrong_file_that_parses_is_refused(self):
        """⚠ PITFALL 9, THE NAMED REGRESSION. A stale-shaped store at 3,138
        items: valid JSON, right schema version, loads without a murmur, and
        missing the whole photograph library. sha256 and `load_store` both
        pass it. Only the by-value counts refuse it."""
        stale = Path(self.tmp) / "stale"
        _write_library(stale, [_item("s%06d" % n, "text") for n in range(3138)],
                       snapshots=False)
        res = B.backup(stale, self.dest, None, None,
                       stamp="20260813T000000Z", echo=lambda *a: None)
        self.assertTrue(res["ok"], res.get("why"))

        # It parses -- proved, not assumed.
        self.assertEqual(len(study_lib.load_store(self.dest)["items"]), 3138)

        ver = B.verify(self.dest)          # the shipped, real expectations
        self.assertFalse(ver["ok"])
        self.assertIn("items", ver["why"])
        self.assertIn("3138", ver["why"])

    def test_missing_file_in_the_backup_is_refused(self):
        self.build()
        self.take_backup()
        (self.dest / "layout.json").unlink()
        res = B.verify(self.dest, small_counts())
        self.assertFalse(res["ok"])
        self.assertIn("layout.json", res["why"])

    def test_backup_refuses_a_destination_inside_the_library_root(self):
        self.build()
        res = B.backup(self.lib, self.lib / "backup-here", None,
                       small_counts(), echo=lambda *a: None)
        self.assertFalse(res["ok"])
        self.assertIn("inside the library root", res["why"])
        self.assertFalse((self.lib / "backup-here").exists())

    def test_backup_refuses_an_items_json_sibling_name(self):
        """⚠ ALL FIVE REAL NAMES, including the two that do not end in .bak.
        A refusal written with `items.json*.bak` would let those two through,
        and a sixth artifact under one of them would be indistinguishable
        from the five that are already there."""
        self.build()
        for name in REAL_STALE_SIBLINGS:
            res = B.backup(self.lib, Path(self.tmp) / name, None,
                           small_counts(), echo=lambda *a: None)
            self.assertFalse(res["ok"], "accepted the name " + name)
            self.assertIn("items.json sibling", res["why"])
            self.assertFalse((Path(self.tmp) / name).exists())

    def test_the_narrow_glob_would_have_let_two_of_the_five_through(self):
        """The measurement that decides the glob, asserted BY VALUE rather
        than believed: 5 against 3."""
        import fnmatch
        wide = [n for n in REAL_STALE_SIBLINGS
                if fnmatch.fnmatch(n, B.STALE_SIBLING_GLOB)]
        narrow = [n for n in REAL_STALE_SIBLINGS
                  if fnmatch.fnmatch(n, "items.json*.bak")]
        self.assertEqual(len(wide), 5)
        self.assertEqual(len(narrow), 3)
        self.assertEqual(sorted(set(wide) - set(narrow)),
                         ["items.json.bak-20260721-orphan",
                          "items.json.uat25-backup"])

    def test_empty_tier_two_verifies_ok(self):
        """SRM-13 edge: a library with zero screenshots produces a valid
        tier-2 directory holding zero files, and verify still passes. An
        empty tier is not an error."""
        items = [_item("txt%04d" % n, "text") for n in range(3)]
        self.build(items)
        res = self.take_backup(expected={"items": 3, "image": 0,
                                         "blessed": 0, "never_show": 0,
                                         "retired": 0})
        self.assertEqual(res["tier2"], 0)
        self.assertTrue((self.dest / B.TIER2_SUBDIR).is_dir())
        self.assertEqual(list((self.dest / B.TIER2_SUBDIR).iterdir()), [])
        ver = B.verify(self.dest, {"items": 3, "image": 0, "blessed": 0,
                                   "never_show": 0, "retired": 0})
        self.assertTrue(ver["ok"], ver["why"])

    def test_the_two_tiers_are_disjoint(self):
        """SRM-13 edge (adjacency): a file in both tiers would be copied and
        verified twice. The path sets are asserted disjoint before any copy."""
        self.build()
        self.take_backup()
        m = self.manifest()
        t1 = {e["rel"] for e in m["tier1"]}
        t2 = {e["rel"] for e in m["tier2"]}
        self.assertEqual(t1 & t2, set())
        self.assertEqual(len(t2), 5)          # the five screenshot-tagged
        self.assertEqual(len(m["tier2"]), len(t2))   # copied once, not twice

    def test_the_manifest_is_stable_across_runs(self):
        """SRM-13 edge (ordering): two backups of an unchanged library write
        the same manifest, byte for byte, apart from the per-run stamp block
        -- a stamp that did not change between runs would not be a stamp."""
        self.build()
        a = Path(self.tmp) / "b1"
        b = Path(self.tmp) / "b2"
        self.take_backup(dest=a)
        self.take_backup(dest=b)
        self.assertEqual(B.manifest_stable_part(self.manifest(a)),
                         B.manifest_stable_part(self.manifest(b)))
        for d in (a, b):
            self.assertTrue(B.verify(d, small_counts())["ok"])

    def test_backup_mutates_the_library_zero_times(self):
        """SRM-13 edge (idempotency + concurrency): the library's items.json
        is byte-identical before and after two backups, and no write lock was
        ever taken."""
        self.build()
        before = (self.lib / "items.json").read_bytes()
        self.take_backup(dest=Path(self.tmp) / "b1")
        self.take_backup(dest=Path(self.tmp) / "b2")
        self.assertEqual((self.lib / "items.json").read_bytes(), before)

    def test_backup_writes_no_new_items_json_sibling(self):
        """The gate the real run is judged by, on a fixture: the count of
        `items.json.*` in the library root does not move."""
        self.build()
        (self.lib / "items.json.v1.bak").write_text("{}")
        before = sorted(p.name for p in self.lib.glob(B.STALE_SIBLING_GLOB))
        self.take_backup()
        after = sorted(p.name for p in self.lib.glob(B.STALE_SIBLING_GLOB))
        self.assertEqual(before, after)
        self.assertEqual(len(after), 1)

    def test_a_non_ascii_filename_round_trips_through_the_manifest(self):
        """SRM-13 edge (encoding): every manifest path is a store-relative
        POSIX string, NFC-normalised, so a decomposed name on disk and a
        composed name in the store are the SAME key to the set difference."""
        name = unicodedata.normalize("NFD", "café-☕")
        items = small_items()
        items.append(_item("uni0001", "text",
                           library_path="items/%s.md" % name))
        self.build(items)
        counts = dict(small_counts(), items=8)
        self.take_backup(expected=counts)

        store = study_lib.load_store(self.lib)
        files, dirs = B.new_files_by_set_difference(self.lib, store)
        self.assertEqual(files, [], "an NFD filename was declared new")
        for entry in self.manifest()["tier1"]:
            self.assertEqual(entry["rel"],
                             unicodedata.normalize("NFC", entry["rel"]))


# ---------------------------------------------------------------------------
# ---- V21: the way back ----------------------------------------------------

def simulate_note_pass(lib, inherit_time_for=None):
    """What plan 26.94-07 will do, in miniature: flip 3 photographs to text,
    write their notes, move the snapshots into attachments/, and leave a
    vision/ cache behind.

    `inherit_time_for` names one note whose file timestamps are copied from
    the screenshot it replaces -- D-14's shape says the note INHERITS the
    screenshot's `created_ms`, and an implementation that also carries the
    file times across makes that note invisible to any clock-based rule.
    That is the fixture the drill needs."""
    lib = Path(lib)
    store = study_lib.load_store(lib)
    flipped = []
    for iid in sorted(store["items"])[:3]:
        it = store["items"][iid]
        if it["type"] != "image":
            continue
        old = lib / it["library_path"]
        att_rel = "attachments/%s/%s" % (iid, old.name)
        (lib / att_rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(old, lib / att_rel)
        note_rel = "items/%s.md" % iid
        (lib / note_rel).write_text("# note for %s\n" % iid, encoding="utf-8")
        if iid == inherit_time_for:
            st = old.stat()
            os.utime(lib / note_rel, (st.st_atime, st.st_mtime))
        old.unlink()
        it["type"] = "text"
        it["library_path"] = note_rel
        it["attachments"] = [att_rel]
        flipped.append(iid)
    study_lib.save_store(lib, store)
    (lib / "vision").mkdir(exist_ok=True)
    for n in range(5):
        (lib / "vision" / ("%s.json" % n)).write_text("{}")
    return flipped


def rollback_violations(lib, expected):
    """What must be true after a rollback, as a list of plain lines. The real
    case asserts this is empty; the drills assert it is NOT and that it names
    what was missed."""
    lib = Path(lib)
    out = []
    post = B.verify_library(lib, expected)
    if not post["ok"]:
        out.append(str(post["why"]))
    store = study_lib.load_store(lib)
    files, dirs = B.new_files_by_set_difference(lib, store)
    for rel in files:
        out.append("a file the restored store does not name is still "
                   "there: " + rel)
    for rel in dirs:
        out.append("an attachments directory the restored store does not "
                   "name is still there: " + rel)
    if (lib / "vision").exists():
        out.append("the vision cache is still there: vision/")
    return out


def new_files_by_the_clock(library_root, store, started_at):
    """⚠ THE WRONG IMPLEMENTATION, kept here in the SUITE so it can never be
    reached from the tool. "Anything under items/ newer than the backup" is
    the rule a reasonable person writes, and it is wrong exactly where it
    hurts: a note that inherited its screenshot's timestamps is older than
    the backup and survives the sweep invisibly."""
    root = Path(library_root)
    files = []
    for p in sorted((root / "items").rglob("*")):
        if p.is_file() and p.stat().st_mtime > started_at:
            files.append(B.norm_rel(p, root))
    _, dirs = B.new_files_by_set_difference(library_root, store)
    return sorted(files), dirs


class RollbackCase(LibraryCase):

    def setUp(self):
        super().setUp()
        self.items = small_items()
        self.build(self.items)
        self.counts = small_counts()
        self.take_backup()
        self.port = self.free_port()

    def test_rollback_restores_counts(self):
        """V21. After a simulated note pass, rollback puts `type=="image"`
        back to 5 exactly, removes every new .md, removes every new
        attachments/<id>/, and leaves no vision cache."""
        flipped = simulate_note_pass(self.lib)
        self.assertEqual(len(flipped), 3)
        mid = study_lib.load_store(self.lib)
        self.assertEqual(B.store_counts(mid)["image"], 2)   # it really moved

        res = B.rollback(self.dest, self.lib, self.counts, self.port,
                         echo=lambda *a: None)
        self.assertTrue(res["ok"], res.get("why"))
        self.assertEqual(res["counts"]["image"], 5)
        self.assertEqual(res["counts"], self.counts)
        self.assertEqual(rollback_violations(self.lib, self.counts), [])

        # By value, at the filesystem: the notes are gone, the snapshots are
        # back, the attachment directories are gone, the cache is gone.
        self.assertEqual(sorted(p.name for p in (self.lib / "items")
                                .glob("*.md")),
                         ["txt0000.md", "txt0001.md"])
        self.assertEqual(len(list((self.lib / "items").glob("*.jpeg"))), 5)
        self.assertEqual(list((self.lib / "attachments").iterdir()), [])
        self.assertFalse((self.lib / "vision").exists())

    def test_rollback_is_idempotent(self):
        """A second rollback immediately after the first changes nothing --
        the directory listing is identical, entry for entry."""
        simulate_note_pass(self.lib)
        first = B.rollback(self.dest, self.lib, self.counts, self.port,
                           echo=lambda *a: None)
        self.assertTrue(first["ok"], first.get("why"))
        before = sorted(str(p.relative_to(self.lib))
                        for p in self.lib.rglob("*"))
        digest = hashlib.sha256(
            (self.lib / "items.json").read_bytes()).hexdigest()

        second = B.rollback(self.dest, self.lib, self.counts, self.port,
                            echo=lambda *a: None)
        self.assertTrue(second["ok"], second.get("why"))
        self.assertEqual(second["removed_files"], [])
        self.assertEqual(second["removed_dirs"], [])
        self.assertEqual(sorted(str(p.relative_to(self.lib))
                                for p in self.lib.rglob("*")), before)
        self.assertEqual(hashlib.sha256(
            (self.lib / "items.json").read_bytes()).hexdigest(), digest)

    def test_rollback_refuses_when_a_server_is_listening(self):
        """Step 1 of the eight is a PRECONDITION, not a note: a running
        server holds the write lock and would overwrite the restored file at
        its next write."""
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(("127.0.0.1", 0))
        s.listen(1)
        self.addCleanup(s.close)
        res = B.rollback(self.dest, self.lib, self.counts,
                         s.getsockname()[1], echo=lambda *a: None)
        self.assertFalse(res["ok"])
        self.assertIn("stop the room first", res["why"])

    def test_rollback_refuses_a_backup_that_does_not_verify(self):
        """Restoring FROM a bad backup is the one mistake that cannot be
        undone, so the three assertions run before the first byte moves."""
        data = bytearray((self.dest / "items.json").read_bytes())
        data[10] = data[10] ^ 0x01
        (self.dest / "items.json").write_bytes(bytes(data))
        res = B.rollback(self.dest, self.lib, self.counts, self.port,
                         echo=lambda *a: None)
        self.assertFalse(res["ok"])
        self.assertIn("does not verify", res["why"])

    # -- the two drills -----------------------------------------------------

    def test_drill_the_clock_instead_of_set_difference_leaves_a_new_note(self):
        """⚠ RED 4 of 5. Rollback is re-composed out of its own steps with
        ONE replaced: the clock instead of the set difference. The note that
        inherited its screenshot's timestamps survives, and the postcondition
        check catches it BY NAME."""
        # The cutoff a clock-based rule would use: "anything under items/
        # touched since the backup was taken". Everything the fixture writes
        # after this line is newer than it -- except the one note that
        # inherited its screenshot's timestamps.
        started = time.time()
        time.sleep(0.02)
        flipped = simulate_note_pass(self.lib,
                                     inherit_time_for="img0000")
        self.assertIn("img0000", flipped)

        manifest = self.manifest()
        B.restore_tier1(self.dest, self.lib, manifest)
        B.restore_tier2(self.dest, self.lib, manifest)
        store = study_lib.load_store(self.lib)
        files, dirs = new_files_by_the_clock(self.lib, store, started)
        B.remove_new(self.lib, files, dirs)
        B.remove_vision_cache(self.lib)

        violations = rollback_violations(self.lib, self.counts)
        self.assertTrue(violations, "the clock-based sweep was not caught")
        self.assertTrue(any("items/img0000.md" in v for v in violations),
                        "the check fired but did not name the file it "
                        "missed: " + repr(violations))
        self.assertTrue((self.lib / "items" / "img0000.md").is_file())

        # And the control: the shipped selector does catch it.
        real_files, real_dirs = B.new_files_by_set_difference(self.lib, store)
        self.assertIn("items/img0000.md", real_files)

    def test_rollback_never_deletes_a_photograph_it_cannot_put_back(self):
        """⚠ CR-01, AND THE MISMATCH THIS FIXTURE FAMILY USED TO DENY.

        `small_items()` says tier 2 "backs up exactly the snapshots the note
        pass will move: a fixture whose note pass moves a photograph tier 2
        never copied would be testing a mismatch this tool does not have."
        The tool DOES have it — `tier2_paths`' own docstring measures the
        derived selection at 2,676 against a true 3,748, a 29% under-count,
        while the note pass selects from the RE-DERIVED union. This builds
        that mismatch on purpose.

        Before the fix the sequence was: tier 1 restores the pre-pass store
        (the item is an image again, with no attachments entry) -> tier 2
        cannot restore items/<id>.jpeg because it was never copied and the
        note pass already unlinked it -> the restored store names no
        attachments, so attachments/<id>/ reads as new -> rmtree takes the
        last copy -> verify_library counts items.json values, which were
        restored, and rollback returns ok: True. Her photograph is gone and
        nothing says so.
        """
        moved = simulate_note_pass(self.lib)
        victim = moved[0]
        manifest = self.manifest()
        # THE MISMATCH: drop this one photograph out of tier 2, exactly as a
        # 29%-under-counting derivation would have.
        before = len(manifest["tier2"])
        dropped = [e for e in manifest["tier2"]
                   if PurePosixPath(e["rel"]).stem == victim]
        manifest["tier2"] = [e for e in manifest["tier2"]
                             if PurePosixPath(e["rel"]).stem != victim]
        self.assertEqual(len(manifest["tier2"]), before - 1,
                         "the fixture did not actually drop the victim")
        # ⚠ AND THE BYTES MUST GO WITH THE MANIFEST ROW. A selection that
        # never chose this photograph never COPIED it either; leaving the file
        # in the backup would make the refusal correctly permit the delete and
        # this case would pass for the wrong reason.
        for e in dropped:
            B.backup_location(self.dest, 2, e["rel"]).unlink()

        B.restore_tier1(self.dest, self.lib, manifest)
        B.restore_tier2(self.dest, self.lib, manifest)
        store = study_lib.load_store(self.lib)
        files, dirs = B.new_files_by_set_difference(self.lib, store)
        swept = B.remove_new(self.lib, files, dirs, backup_dir=self.dest)

        att = self.lib / "attachments" / victim
        self.assertTrue(att.is_dir(),
                        "the only surviving copy of a photograph tier 2 never "
                        "backed up was DELETED — this is CR-01")
        self.assertTrue(any(f.is_file() for f in att.rglob("*")),
                        "the folder survived but its bytes did not")
        self.assertTrue(swept["kept"],
                        "the refusal must be COUNTED, not silent — a quiet "
                        "keep is how the original defect stayed invisible")
        self.assertTrue(any(victim in k for k in swept["kept"]),
                        "the kept list must name the photograph it saved; "
                        "got " + repr(swept["kept"]))
        # and the notes, which ARE regenerable, were still cleaned up
        self.assertFalse((self.lib / "items" / (victim + ".md")).exists(),
                         "a minted note is derived text and must still go — "
                         "refusing everything would leave a rolled-back "
                         "library full of notes for photographs that are "
                         "images again")

    def test_drill_the_refusal_is_what_saves_it(self):
        """The control for the case above: with the refusal removed, the
        photograph IS destroyed. A guard never seen red is not evidence."""
        moved = simulate_note_pass(self.lib)
        victim = moved[0]
        manifest = self.manifest()
        for e in list(manifest["tier2"]):
            if PurePosixPath(e["rel"]).stem == victim:
                B.backup_location(self.dest, 2, e["rel"]).unlink()
        manifest["tier2"] = [e for e in manifest["tier2"]
                             if PurePosixPath(e["rel"]).stem != victim]
        B.restore_tier1(self.dest, self.lib, manifest)
        B.restore_tier2(self.dest, self.lib, manifest)
        store = study_lib.load_store(self.lib)
        files, dirs = B.new_files_by_set_difference(self.lib, store)
        # backup_dir=None is the mutation: nothing can be put back, so the
        # OLD code would have deleted everything regardless.
        saved = B._would_destroy
        try:
            B._would_destroy = lambda backup_dir, rel: False
            B.remove_new(self.lib, files, dirs, backup_dir=self.dest)
        finally:
            B._would_destroy = saved
        self.assertFalse((self.lib / "attachments" / victim).is_dir(),
                         "with the refusal disabled the photograph must be "
                         "gone — otherwise this case proves nothing and the "
                         "one above is passing for a different reason")

    def test_drill_skipping_the_vision_removal_leaves_the_cache(self):
        """⚠ RED 5 of 5. Every step of the rollback except the cache removal.
        A cache keyed to items that no longer exist is the stale-state trap,
        and it is invisible to the counts."""
        simulate_note_pass(self.lib)
        manifest = self.manifest()
        B.restore_tier1(self.dest, self.lib, manifest)
        B.restore_tier2(self.dest, self.lib, manifest)
        store = study_lib.load_store(self.lib)
        files, dirs = B.new_files_by_set_difference(self.lib, store)
        # ⚠ backup_dir IS PASSED, and since CR-01 it has to be: remove_new
        # refuses to delete a PICTURE the backup cannot put back, and with no
        # backup named it can put nothing back and so keeps every one. This
        # drill is about the vision cache, so it must otherwise be a faithful
        # rollback — omitting the backup here would plant a SECOND omission
        # and the assertion below could no longer say which one it caught.
        B.remove_new(self.lib, files, dirs, backup_dir=self.dest)
        # ⚠ the omission under test: no B.remove_vision_cache(self.lib)

        violations = rollback_violations(self.lib, self.counts)
        self.assertEqual(violations,
                         ["the vision cache is still there: vision/"])
        self.assertTrue((self.lib / "vision").is_dir())

        # And the control: doing the step clears it.
        B.remove_vision_cache(self.lib)
        self.assertEqual(rollback_violations(self.lib, self.counts), [])


# ---------------------------------------------------------------------------

class CaseCountCase(unittest.TestCase):

    def test_case_count_is_asserted_by_value(self):
        """A harness that aborts early must fail loudly rather than report a
        smaller success."""
        total = 0
        for obj in list(globals().values()):
            if isinstance(obj, type) and issubclass(obj, unittest.TestCase):
                total += len([n for n in dir(obj) if n.startswith("test")])
        self.assertEqual(total, EXPECTED_CASES,
                         "case count moved: the file says %d"
                         % EXPECTED_CASES)


if __name__ == "__main__":
    unittest.main()
