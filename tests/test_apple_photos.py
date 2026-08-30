#!/usr/bin/env python3
"""adapters/apple_photos.py unit tests (Phase 26.65, Plan 03 — ADP-02).

The Photos adapter is an export FRONT-END, twin to the Notes one: it turns
Apple Photos into a folder the shipped importer already ingests (D-03). Its
whole job is "enumerate localIdentifiers -> `export using originals false`
(JPEG) each new one into a staging dir under a SERVER-generated `<uuid>.jpg`
-> hand the folder to import_folder". The importer does the rest, so photos
land as `unseen` with every solved edge case reused from upstream (law 2,
D-04); dedup rides the stable-id ledger on localIdentifier (ADP-03).

This suite pins (osascript mocked — no live Photos, no AppleEvents prompt):
  1. a canned enumeration whose export step writes JPEG bytes -> after
     collect + import every produced item is state=="unseen" and type=="image".
  2. staging carries ZERO `.heic`/`.heif` files (Pitfall 1: `using originals
     false` is the JPEG path; originals would be HEIC and silently skipped).
  3. the export seam is invoked ONCE PER NEW ID — a per-item loop, never a
     single bulk export (Pitfall 5 anti-pattern), and every staged name is a
     server-generated `<uuid>.jpg` (never a source filename -> no collisions
     even though the mock drops the same IMG_0001.jpg every time, T-26.65-09).
  4. a SECOND collect with the same localIdentifiers, after the ledger is
     committed (as the route does), exports ZERO — UUID-ledger dedup, so a
     candle re-pull mints no duplicate cards (ADP-03, Pitfall 2).
  5. mark_origin(store, staging) stamps from_source=="apple-photos" on exactly
     the items whose origin_path is under staging; idempotent, non-mutating.

Stdlib only (unittest + tempfile) — zero-dependency law (law 8).

⛔⛔ WHAT NOTHING IN THIS FILE COULD SEE, AND WHY (26.995-29, G-26.995-6)
------------------------------------------------------------------------
Read this before adding a check here, because it is the reason a critical
defect on the most sensitive surface in the product shipped green.

**Nineteen** of the checks in this file replace the module's one osascript
seam with a stand-in — it is a seam precisely so they can. A replaced seam
SPAWNS NOTHING. So every assertion above is about what the adapter WOULD do,
and not one of them can observe a process at all.

⚠ THE NUMBER WAS NINETEEN AND NOT TWENTY, and that correction is written down
rather than quietly applied. `grep -c` said twenty because it counts LINES
CONTAINING the name, and one of those lines is a comment about the seam's
signature, not a patch. Counted as patch sites it was nineteen.
⚠ MOVED TO TWENTY-FIVE on 2026-08-25 by TestRecogniseFirstNeverCopy (her
recognise-first ruling — six new sites: two collect drives, four fail-open
arms), and it is pinned by value in
`test_the_rest_of_this_file_patches_the_seam_twenty_five_times` so it cannot
drift silently.

On the evening of 2026-08-21 the room's server was killed and its osascript
export child SURVIVED, was reparented to the system, and went on reaching into
her REAL Photos library one photograph at a time until somebody killed it by
hand. She closed the room; the room kept reading her photographs. Nothing here
could have caught it, and nothing here did.

`AStoppedRoomStopsReadingHerPhotographs` is the one class that does NOT patch
the seam. It starts a REAL child through the adapter's own spawn path,
confirms it alive by process id, stops the parent the way a person stops the
room, and looks that id up again.

WHAT THE REAL CHILD IS HANDED, instead of anything of hers: an AppleScript
that is one `delay` and two comment lines. It names no application, no media
item, no path and no library — `delay` asks the operating system for nothing.
That is asserted from the command line the child was ACTUALLY given, read back
out of `ps`, with a positive control proving the same detector DOES flag the
two shipped scripts, which really do name her library.

⛔⛔ WHAT THIS CHECK STILL CANNOT SEE:
  - A HARD KILL. `kill -9`, a force-quit, a power cut. Nothing on any platform
    can catch one, so a room stopped that way still leaves a child behind
    reading her photographs. This check covers the ways of stopping the room
    the fix claims and no others, and it never claims otherwise.
  - `main()` ITSELF. Starting the real room binds her port and reads her
    library, so the arm that proves `main()` is WIRED to the teardown reads
    its source instead of running it. That arm says so in its own docstring.
  - WHAT THE STAGING TREE IS LEFT HOLDING after an interrupted run. Measured
    separately and recorded in 26.995-29's SUMMARY; `G-26.995-7` remains OPEN
    and nothing in this file closes it.
"""
import ast
import hashlib
import inspect
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path
from unittest import mock

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
_FIXTURES = Path(__file__).resolve().parent / "fixtures"
if str(_FIXTURES) not in sys.path:
    sys.path.insert(0, str(_FIXTURES))

import study_lib  # noqa: E402
import server  # noqa: E402  — importable proof: a plain import binds no socket
from adapters import apple_photos  # noqa: E402
from adapters import _ledger  # noqa: E402
import osascript_mock  # noqa: E402

_HEIC = {".heic", ".heif"}


def _root(tmp):
    """A THROWAWAY export root for a test.

    26.65-07: the adapter's real export root is derived under the user's
    Pictures folder, because that is the only place Photos.app is permitted to
    write. A unit suite must never write there — it would touch the owner's
    real Pictures folder and would fail fatally on any machine where that
    folder is absent or read-only. Every collect in this suite therefore passes
    an explicit temp root. NOTE: only the CALL LINES gained this argument;
    every pre-existing assertion below is byte-unchanged."""
    return Path(tmp) / "export-root"


def _commit_ledger(library_root, exported):
    """Mirror the route's post-import ledger commit so a second collect sees
    these ids as already-exported (the UUID-dedup path, not the byte backstop)."""
    ledger = _ledger.load(library_root, apple_photos.SOURCE)
    have = set(ledger.get("exported_ids", []))
    have.update(exported)
    ledger["exported_ids"] = sorted(have)
    _ledger.save(library_root, apple_photos.SOURCE, ledger)


class TestPhotosCollectToStaging(unittest.TestCase):
    """Tests 1-3 — JPEG-only staging, unseen images, per-item <uuid>.jpg loop."""

    def test_lands_unseen_images_never_heic(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()

            with osascript_mock.patch_photos_osascript(apple_photos):
                exported = apple_photos.collect(
                    lib, staging, export_root=_root(tmp))

            self.assertEqual(
                sorted(exported),
                sorted(p["id"] for p in osascript_mock.SAMPLE_PHOTOS),
                "collect returns the exported localIdentifiers to commit")

            staged_files = [p for p in staging.rglob("*") if p.is_file()]
            self.assertEqual(len(staged_files), len(osascript_mock.SAMPLE_PHOTOS),
                             "one staged JPEG per new photo")
            for p in staged_files:
                self.assertNotIn(p.suffix.lower(), _HEIC,
                                 f"zero HEIC in staging (Pitfall 1): {p.name}")
                self.assertEqual(p.suffix.lower(), ".jpg",
                                 f"the JPEG rendition is staged as .jpg: {p.name}")
                self.assertTrue(p.read_bytes().startswith(b"\xff\xd8\xff"),
                                "staged bytes are a JPEG rendition")

            report = study_lib.import_folder(staging, lib)
            self.assertEqual(report["imported"], len(osascript_mock.SAMPLE_PHOTOS))
            store = study_lib.load_store(lib)
            self.assertTrue(store["items"], "photos imported as items")
            for item in store["items"].values():
                self.assertEqual(item["state"], "unseen",
                                 "law 2: nothing is auto-blessed on import")
                self.assertEqual(item["type"], "image",
                                 "a staged .jpg imports as an image item")

    def test_per_item_export_loop_with_server_generated_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()

            # every export drops the SAME source filename; only a
            # server-generated <uuid>.jpg keeps the staged names unique.
            fake = osascript_mock.make_fake_run_photos_osascript(
                drop_name="IMG_0001.jpg")
            with mock.patch.object(apple_photos, "_run_osascript",
                                   side_effect=fake) as m:
                exported = apple_photos.collect(
                    lib, staging, export_root=_root(tmp))

            # the seam is called _run_osascript(script, media_id, dest_dir);
            # an export carries the two extra args, an enumerate carries none.
            export_calls = [c for c in m.call_args_list if len(c.args) >= 3]
            self.assertEqual(
                len(export_calls), len(osascript_mock.SAMPLE_PHOTOS),
                "the export seam is called ONCE PER NEW ID — a loop, not a "
                "single bulk export (Pitfall 5)")
            self.assertEqual(
                sorted(c.args[1] for c in export_calls),
                sorted(p["id"] for p in osascript_mock.SAMPLE_PHOTOS),
                "each new localIdentifier is exported exactly once")

            staged_files = [p for p in staging.rglob("*") if p.is_file()]
            self.assertEqual(len(staged_files), len(osascript_mock.SAMPLE_PHOTOS),
                             "same source filename, unique server-generated "
                             "<uuid>.jpg — no collision overwrite")
            for p in staged_files:
                self.assertNotEqual(p.name, "IMG_0001.jpg",
                                    "the staged name is server-generated, "
                                    "never the source filename")
            self.assertEqual(len(exported), len(set(exported)),
                             "no duplicate ids exported")


class TestPhotosLedgerDedup(unittest.TestCase):
    """Test 4 — ADP-03/Pitfall 2: a committed-ledger re-pull exports zero."""

    def test_second_collect_after_commit_exports_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging1 = Path(tmp) / "staging1"
            staging1.mkdir()

            with osascript_mock.patch_photos_osascript(apple_photos):
                exported1 = apple_photos.collect(
                    lib, staging1, export_root=_root(tmp))
            study_lib.import_folder(staging1, lib)
            _commit_ledger(lib, exported1)
            first_count = len(study_lib.load_store(lib)["items"])

            staging2 = Path(tmp) / "staging2"
            staging2.mkdir()
            with osascript_mock.patch_photos_osascript(apple_photos):
                exported2 = apple_photos.collect(
                    lib, staging2, export_root=_root(tmp))

            self.assertEqual(exported2, [],
                             "the UUID ledger short-circuits a re-pull — no "
                             "re-export, no duplicate cards (Pitfall 2)")
            self.assertEqual(
                [p for p in staging2.rglob("*") if p.is_file()], [],
                "nothing new is staged on a duplicate re-pull")
            study_lib.import_folder(staging2, lib)
            self.assertEqual(len(study_lib.load_store(lib)["items"]),
                             first_count,
                             "the item count is unchanged after the re-pull")


class TestPhotosMarkOrigin(unittest.TestCase):
    """Test 5 — D-03-safe origin marker, twin to the Notes one."""

    def _store_with_photos_and_outsider(self, tmp):
        lib = Path(tmp) / "library"
        outside = Path(tmp) / "outside"
        outside.mkdir()
        (outside / "old-note.md").write_bytes(b"# an older note\nnot a photo\n")
        study_lib.import_folder(outside, lib)

        staging = Path(tmp) / "staging"
        staging.mkdir()
        with osascript_mock.patch_photos_osascript(apple_photos):
            apple_photos.collect(lib, staging, export_root=_root(tmp))
        study_lib.import_folder(staging, lib)
        return lib, staging

    def test_marks_only_items_under_staging(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib, staging = self._store_with_photos_and_outsider(tmp)
            store = study_lib.load_store(lib)

            marked = apple_photos.mark_origin(store, str(staging))
            self.assertEqual(marked, len(osascript_mock.SAMPLE_PHOTOS),
                             "every photo this collect produced is marked")
            for item in store["items"].values():
                under = str(Path(item["origin_path"]).resolve()).startswith(
                    str(staging.resolve()))
                if under:
                    self.assertEqual(item.get("from_source"), "apple-photos")
                else:
                    self.assertIsNone(item.get("from_source"),
                                      "the outsider item is never marked")

    def test_mark_origin_is_idempotent_and_non_mutating(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib, staging = self._store_with_photos_and_outsider(tmp)
            store = study_lib.load_store(lib)
            before = {i: (v["source"], v["title"], v["state"])
                      for i, v in store["items"].items()}

            first = apple_photos.mark_origin(store, str(staging))
            snapshot = {i: dict(v) for i, v in store["items"].items()}
            second = apple_photos.mark_origin(store, str(staging))

            self.assertEqual(first, second, "the count is stable across calls")
            self.assertEqual(store["items"], snapshot,
                             "a second call changes nothing (idempotent)")
            for i, v in store["items"].items():
                self.assertEqual((v["source"], v["title"], v["state"]),
                                 before[i],
                                 "mark_origin never mutates source/title/state")


class TestDerivedExportRoot(unittest.TestCase):
    """26.65-07 / D-19 / T-26.65-25 — the export root is DERIVED, and an
    unusable one is FATAL rather than quietly falling back."""

    def test_export_root_is_derived_from_account_home_and_not_hidden(self):
        root = apple_photos._export_root_parent()
        home = apple_photos._account_home()
        self.assertTrue(str(root).startswith(str(home)),
                        "the export root is derived from the account home")
        self.assertEqual(root.relative_to(home).parts[0], "Pictures",
                         "Photos is only permitted to write under Pictures — "
                         "measured on the real Mac 2026-08-11")
        self.assertFalse(
            root.name.startswith("."),
            "a dot-prefixed export root would make every rendition hidden to "
            "the shipped importer (skipped.hidden)")

    def test_export_root_ignores_swapped_home_env(self):
        """26.997 P3: fake HOME must not relocate Photos export root."""
        real_home = apple_photos._account_home()
        with tempfile.TemporaryDirectory() as fake:
            prior = os.environ.get("HOME")
            os.environ["HOME"] = fake
            try:
                root = apple_photos._export_root_parent()
            finally:
                if prior is None:
                    os.environ.pop("HOME", None)
                else:
                    os.environ["HOME"] = prior
        self.assertTrue(
            str(root).startswith(str(real_home / "Pictures")),
            "export root stays under the account Pictures tree when HOME is "
            "swapped")
        self.assertFalse(str(root).startswith(fake),
                         "export root must not follow a throwaway HOME")

    def test_no_spelled_home_path_in_the_adapter_source(self):
        # the needle itself is DERIVED from this machine's home rather than
        # spelled — otherwise this very file would trip the publish gate it
        # exists to enforce, which is the D-19 letter-vs-spirit trap exactly.
        needle = str(Path.home().parent) + "/"
        src = (_REPO_ROOT / "adapters" / "apple_photos.py").read_text("utf-8")
        self.assertEqual(src.count(needle), 0,
                         "the home path is derived, never spelled (D-19)")
        self.assertEqual(
            (_REPO_ROOT / "tests" / "test_apple_photos.py")
            .read_text("utf-8").count(needle), 0,
            "and this suite does not spell one either")

    def test_unwritable_export_root_is_fatal_and_exports_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            # a FILE where the export root's parent must be: mkdir cannot
            # succeed, so the root is genuinely unusable.
            blocker = Path(tmp) / "blocker"
            blocker.write_bytes(b"not a directory")

            fake = osascript_mock.make_fake_run_photos_osascript()
            with mock.patch.object(apple_photos, "_run_osascript",
                                   side_effect=fake) as m:
                with self.assertRaises(apple_photos.PhotosCollectError) as ctx:
                    apple_photos.collect(lib, staging,
                                         export_root=blocker / "root")

            self.assertTrue(ctx.exception.fatal,
                            "an unusable export root is FATAL — a fallback to "
                            "a temp dir would restore the defect exactly")
            self.assertEqual(ctx.exception.reason, "no_export_root")
            export_calls = [c for c in m.call_args_list if len(c.args) >= 3]
            self.assertEqual(len(export_calls), 0,
                             "ZERO export attempts when the root is unusable")
            self.assertEqual([p for p in staging.rglob("*") if p.is_file()], [],
                             "nothing is staged when the root is unusable")


class TestThreeOutcomes(unittest.TestCase):
    """26.65-07 — a legitimate zero, an honest partial and a total failure are
    three DIFFERENT things and must read differently. The discriminator is
    `total`, never `exported`."""

    def _fake(self, produce_for=(), suffix=".jpg"):
        """An export seam that drops a file only for ids in `produce_for`."""
        payload = osascript_mock.photo_enumerate_payload()

        def fake(script, *args):
            if len(args) >= 2:
                media_id, dest_dir = args[0], args[1]
                if media_id in produce_for:
                    out = Path(dest_dir) / ("IMG_0001" + suffix)
                    out.write_bytes(b"\xff\xd8\xff" + media_id.encode()
                                    + b"\xff\xd9")
                return ""
            return payload

        return fake

    def test_outcome_1_legitimate_zero_is_silent_and_never_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            # every id already in the ledger -> total == 0
            _commit_ledger(lib, [p["id"] for p in osascript_mock.SAMPLE_PHOTOS])

            stats = {}
            with mock.patch.object(apple_photos, "_run_osascript",
                                   side_effect=self._fake()) as m:
                exported = apple_photos.collect(
                    lib, staging, stats=stats, export_root=_root(tmp))

            self.assertEqual(exported, [], "nothing new to bring in")
            self.assertEqual(stats["attempted"], 0,
                             "total == 0 is the discriminator")
            export_calls = [c for c in m.call_args_list if len(c.args) >= 3]
            self.assertEqual(len(export_calls), 0, "no export is attempted")
            self.assertFalse(_root(tmp).exists(),
                             "a legitimate zero creates no directory at all")

    def test_outcome_2_total_failure_raises_fatal_with_the_client_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()

            stats = {}
            # produce_for=() -> every export returns rc 0 and writes NOTHING,
            # which is exactly what Photos did on 2026-08-11.
            with mock.patch.object(apple_photos, "_run_osascript",
                                   side_effect=self._fake(produce_for=())):
                with self.assertRaises(apple_photos.PhotosCollectError) as ctx:
                    apple_photos.collect(lib, staging, stats=stats,
                                         export_root=_root(tmp))

            self.assertTrue(ctx.exception.fatal,
                            "N attempted and none back is FATAL — it may never "
                            "again be mistakable for a finished job")
            self.assertEqual(ctx.exception.reason, "total_failure")
            self.assertIn(apple_photos.TOTAL_FAILURE_TOKEN, str(ctx.exception),
                          "the client keys its third error branch on this")
            self.assertEqual(stats["attempted"],
                             len(osascript_mock.SAMPLE_PHOTOS))
            self.assertEqual(stats["exported"], 0)
            self.assertEqual(stats["skipped"]["no_file"],
                             len(osascript_mock.SAMPLE_PHOTOS),
                             "every skip is counted BY REASON — 14,016 "
                             "failures and one used to record identically")

    def test_outcome_3_honest_partial_returns_with_skip_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            good = osascript_mock.SAMPLE_PHOTOS[0]["id"]

            stats = {}
            with mock.patch.object(apple_photos, "_run_osascript",
                                   side_effect=self._fake(produce_for=(good,))):
                exported = apple_photos.collect(
                    lib, staging, stats=stats, export_root=_root(tmp))

            self.assertEqual(exported, [good],
                             "a partial neither raises nor hides")
            self.assertEqual(stats["attempted"],
                             len(osascript_mock.SAMPLE_PHOTOS))
            self.assertEqual(stats["exported"], 1)
            self.assertEqual(stats["skipped"]["no_file"],
                             len(osascript_mock.SAMPLE_PHOTOS) - 1)

    def test_heic_skips_are_counted_in_their_own_reason_bucket(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            ids = tuple(p["id"] for p in osascript_mock.SAMPLE_PHOTOS)

            stats = {}
            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._fake(produce_for=ids, suffix=".heic")):
                with self.assertRaises(apple_photos.PhotosCollectError):
                    apple_photos.collect(lib, staging, stats=stats,
                                         export_root=_root(tmp))

            self.assertEqual(stats["skipped"]["heic"], len(ids),
                             "HEIC is counted in its OWN bucket, never no_file")
            self.assertEqual(stats["skipped"]["no_file"], 0)

    def test_the_export_root_is_removed_on_success_and_on_failure(self):
        for produce, label in (((), "total failure"),
                               (tuple(p["id"] for p in
                                      osascript_mock.SAMPLE_PHOTOS),
                                "success")):
            with tempfile.TemporaryDirectory() as tmp:
                lib = Path(tmp) / "library"
                staging = Path(tmp) / "staging"
                staging.mkdir()
                with mock.patch.object(
                        apple_photos, "_run_osascript",
                        side_effect=self._fake(produce_for=produce)):
                    try:
                        apple_photos.collect(lib, staging,
                                             export_root=_root(tmp))
                    except apple_photos.PhotosCollectError:
                        pass
                self.assertFalse(
                    _root(tmp).exists(),
                    "no rendition of hers survives the run (%s)" % label)


class TestVideoIsSkippedNotRenamed(unittest.TestCase):
    """26.65-08 — a Photos library is not photos-only. Hers holds 14,019 items,
    594 of them video (re-measured read-only 2026-08-11). Every one used to
    fall past the HEIC guard and be RENAMED to `.jpg`, landing in her room as
    an unshowable broken picture. A video is skipped under its OWN reason, and
    a run whose new items are all video is a SUCCESS, not a failure."""

    def _fake_by_suffix(self, suffix_for, produce_for=None):
        """An export seam giving each id its own produced suffix.

        `suffix_for` maps id -> suffix. An id absent from it (or mapped to
        None) produces NO file at all, which is the `no_file` path.
        """
        payload = osascript_mock.photo_enumerate_payload()

        def fake(script, *args):
            if len(args) >= 2:
                media_id, dest_dir = args[0], args[1]
                suffix = suffix_for.get(media_id)
                if suffix:
                    out = Path(dest_dir) / ("IMG_0001" + suffix)
                    out.write_bytes(b"\x00\x00\x00\x14ftypqt  "
                                    + media_id.encode())
                return ""
            return payload

        return fake

    def test_a_video_is_skipped_and_counted_never_renamed(self):
        for suffix in (".mov", ".mp4"):
            with tempfile.TemporaryDirectory() as tmp:
                lib = Path(tmp) / "library"
                staging = Path(tmp) / "staging"
                staging.mkdir()
                ids = [p["id"] for p in osascript_mock.SAMPLE_PHOTOS]

                stats = {}
                with mock.patch.object(
                        apple_photos, "_run_osascript",
                        side_effect=self._fake_by_suffix(
                            {i: suffix for i in ids})):
                    exported = apple_photos.collect(
                        lib, staging, stats=stats, export_root=_root(tmp))

                self.assertEqual(exported, [],
                                 "a video is never exported as a photo (%s)"
                                 % suffix)
                self.assertEqual(
                    [p for p in staging.rglob("*") if p.is_file()], [],
                    "NOTHING is staged for a video (%s) — the rename to .jpg "
                    "is what put video bytes in the library as broken "
                    "pictures" % suffix)
                self.assertEqual(stats["skipped"]["video"], len(ids),
                                 "counted under its OWN reason (%s)" % suffix)

    def test_a_video_is_REMEMBERED_so_it_is_never_re_attempted(self):
        """⛔⛔ HER RULING 2026-08-24: `Remember it's seen a video`.

        THE DEFECT IT FIXES, MEASURED ON HER REAL LIBRARY. A skipped video was
        recorded NOWHERE, so it stayed permanently new. Her landing gather
        fires on every page load, so every single visit re-attempted all 598
        of her videos, ran ~20-25 minutes, delivered nothing, and THE CANDLE
        REFUSED FOR THE WHOLE OF IT. She hit it twice in one evening.

        ⚠ Set aside in its OWN list, never in exported_ids: a set-aside item
        never arrived, and calling it exported would be a lie the rest of the
        room reads. Kept apart, a release that DOES show video can replay it.
        """
        from adapters import _ledger
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            ids = [p["id"] for p in osascript_mock.SAMPLE_PHOTOS]
            stats = {}
            # ⚠ THE EXPORT SEAM IS PATCHED, NOT THE OSASCRIPT SEAM, AND THAT
            # IS DELIBERATE. This file pins by value how many times it
            # replaces `_run_osascript`, and that number is quoted in three
            # records — a new patch site there makes all three lie. The video
            # DETECTION (a .mov suffix becoming a video-reason skip) is
            # already driven by
            # `test_a_video_is_skipped_and_counted_never_renamed`; what is
            # under test HERE is what the collect DOES with that skip.
            # ⛔ THE ENUMERATION IS ISOLATED TOO. Patching only the export
            # left `_enumerate_photo_ids` live, so the first run of this case
            # read the REAL Photos library and set aside thousands of real
            # ids. A gate that reaches outside its fixture is not a gate.
            with mock.patch.object(
                    apple_photos, "_enumerate_photo_ids",
                    return_value=list(ids)), \
                mock.patch.object(
                    apple_photos, "_export_one",
                    side_effect=apple_photos.PhotosCollectError(
                        "one item is a video, which the room doesn't show yet",
                        fatal=False, reason="video")):
                apple_photos.collect(lib, staging, stats=stats,
                                     export_root=_root(tmp))
            led = _ledger.load(lib, apple_photos.SOURCE)
            self.assertEqual(sorted(led["set_aside_ids"]), sorted(ids),
                             "every video the room looked at is remembered")
            self.assertEqual(led["exported_ids"], [],
                             "and NONE of them is called exported — it never "
                             "arrived")
            self.assertEqual(stats["set_aside_recorded"], len(ids),
                             "reported, so 'remembered' and 'could not write "
                             "it down' are never the same silence")
            # ⛔ AND THE SECOND VISIT IS QUIET — the whole point.
            self.assertEqual(_ledger.new_ids(led, ids), [],
                             "a second landing attempts NOTHING: this is the "
                             "20 minutes she lost on every visit")

    def test_a_FAILURE_is_never_remembered_so_her_photo_is_retried(self):
        """⛔⛔ THE SAFETY OF THE WHOLE CHANGE, AND IT IS THE DANGEROUS HALF.

        Only a VIDEO may be remembered. A transient failure — Photos wedged
        (-1712), a missing file, an oversize rendition — must stay out of BOTH
        lists, or a photograph of hers is dropped SILENTLY AND FOR EVER by the
        very fix that was meant to help. Photos wedged eight times in one run
        on 2026-08-24, so this is not hypothetical.
        """
        from adapters import _ledger
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            ids = [p["id"] for p in osascript_mock.SAMPLE_PHOTOS]
            stats = {}
            # every asset FAILS to export — the wedge, not a video
            with mock.patch.object(
                    apple_photos, "_enumerate_photo_ids",
                    return_value=list(ids)), \
                mock.patch.object(
                    apple_photos, "_export_one",
                    side_effect=apple_photos.PhotosCollectError(
                        "the app did not answer", fatal=False,
                        reason="no_file")):
                try:
                    apple_photos.collect(lib, staging, stats=stats,
                                         export_root=_root(tmp))
                except apple_photos.PhotosCollectError:
                    pass          # the total-failure raise is the shipped one
            led = _ledger.load(lib, apple_photos.SOURCE)
            self.assertEqual(led["set_aside_ids"], [],
                             "⛔ a FAILURE is never remembered")
            self.assertEqual(led["exported_ids"], [],
                             "and never called exported either")
            self.assertEqual(sorted(_ledger.new_ids(led, ids)), sorted(ids),
                             "⛔ so every one of them is RETRIED on the next "
                             "pull — her photograph is never silently lost")

    def test_an_all_video_run_does_not_raise(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            ids = [p["id"] for p in osascript_mock.SAMPLE_PHOTOS]

            stats = {}
            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._fake_by_suffix({i: ".mov" for i in ids})):
                # no assertRaises: a run that attempted only videos and
                # exported nothing is NOT the total failure. Saying "none of
                # your pictures came back" here would be false — nothing
                # failed, and there were no pictures to bring.
                exported = apple_photos.collect(
                    lib, staging, stats=stats, export_root=_root(tmp))

            self.assertEqual(exported, [])
            self.assertEqual(stats["attempted"], len(ids),
                             "it really did attempt them — this is not the "
                             "silent nothing-new zero")
            self.assertEqual(stats["exported"], 0)
            self.assertEqual(stats["skipped"]["no_file"], 0,
                             "a video is not a photo that failed")

    def test_video_bucket_is_distinct_from_heic_and_no_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            ids = [p["id"] for p in osascript_mock.SAMPLE_PHOTOS]
            self.assertEqual(len(ids), 3, "three ids, one per bucket below")
            good, video, heic = ids[0], ids[1], ids[2]

            stats = {}
            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._fake_by_suffix(
                        {good: ".jpg", video: ".mov", heic: ".heic"})):
                exported = apple_photos.collect(
                    lib, staging, stats=stats, export_root=_root(tmp))

            self.assertEqual(exported, [good],
                             "the real picture still comes in")
            self.assertEqual(stats["skipped"]["video"], 1)
            self.assertEqual(stats["skipped"]["heic"], 1)
            self.assertEqual(stats["skipped"]["no_file"], 0)
            self.assertEqual(stats["skipped"]["other"], 0)

    def test_a_real_failure_beside_videos_still_raises(self):
        # the loud zero must survive: videos are subtracted from the
        # total-failure test, they do not disable it.
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            ids = [p["id"] for p in osascript_mock.SAMPLE_PHOTOS]

            stats = {}
            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._fake_by_suffix({ids[0]: ".mov"})):
                with self.assertRaises(apple_photos.PhotosCollectError) as ctx:
                    apple_photos.collect(lib, staging, stats=stats,
                                         export_root=_root(tmp))

            self.assertEqual(ctx.exception.reason, "total_failure")
            self.assertEqual(stats["skipped"]["video"], 1)
            self.assertEqual(stats["skipped"]["no_file"], len(ids) - 1,
                             "the genuinely-failed ones still count as failed")


class TestConnectedSourcesRetraction(unittest.TestCase):
    """26.65-07 / T-26.65-24 — the room stops claiming a source is connected
    when it has never once brought anything in, and NEVER otherwise."""

    def _store_with_sources(self, lib, sources):
        lib.mkdir(parents=True, exist_ok=True)
        seed = lib.parent / "seed"
        seed.mkdir(parents=True, exist_ok=True)
        study_lib.import_folder(seed, lib)      # bootstraps items.json
        store = study_lib.load_store(lib)
        store["meta"]["connected_sources"] = list(sources)
        study_lib.save_store(lib, store)

    def test_retracts_photos_when_its_ledger_is_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            self._store_with_sources(lib, ["apple-notes", "apple-photos"])

            did = server._retract_unproven_source(lib, "apple-photos")

            self.assertTrue(did, "a zero-id ledger means it never worked")
            srcs = study_lib.load_store(lib)["meta"]["connected_sources"]
            self.assertNotIn("apple-photos", srcs)
            self.assertIn("apple-notes", srcs,
                          "a Photos failure never touches Notes")

    def test_never_unconnects_a_source_that_has_ever_succeeded(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            self._store_with_sources(lib, ["apple-notes", "apple-photos"])
            # Notes' real ledger held 333 ids on 2026-08-11.
            _ledger.save(lib, "apple-notes",
                         {"exported_ids": ["n%d" % i for i in range(333)],
                          "last_run_ms": None})

            did = server._retract_unproven_source(lib, "apple-notes")

            self.assertFalse(did, "a source that has worked is never "
                                  "un-connected by a later failure")
            self.assertIn("apple-notes",
                          study_lib.load_store(lib)["meta"]["connected_sources"])

    def test_a_noop_performs_no_save_at_all(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            self._store_with_sources(lib, ["apple-notes"])
            items_path = Path(lib) / "items.json"
            before = items_path.read_bytes()

            did = server._retract_unproven_source(lib, "apple-photos")

            self.assertFalse(did)
            self.assertEqual(items_path.read_bytes(), before,
                             "nothing to remove -> the file is never written")


def _real_png(side):
    """A REAL, decodable PNG built with stdlib only (zlib + struct) — law 8,
    no image library anywhere. Random RGB noise stored at compression level 0,
    so a large `side` produces a genuinely large file that `sips` can read and
    resample. `side=3100` lands ~27.5 MB, comfortably over MAX_IMAGE_BYTES."""
    import os as _os
    import struct as _struct
    import zlib as _zlib
    raw = b"".join(b"\x00" + _os.urandom(side * 3) for _ in range(side))

    def chunk(tag, data):
        c = tag + data
        return (_struct.pack(">I", len(data)) + c
                + _struct.pack(">I", _zlib.crc32(c) & 0xffffffff))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", _struct.pack(">IIBBBBB", side, side, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", _zlib.compress(raw, 0))
            + chunk(b"IEND", b""))


class TestOversizeIsResizedNotRefused(unittest.TestCase):
    """26.65-09 — her ruling of 2026-08-11, verbatim: "Resize oversize ones
    instead."

    A rendition over `MAX_IMAGE_BYTES` used to be exported successfully,
    staged, and then REFUSED by the shipped importer's size ceiling. She never
    saw why; the picture simply was not there. It is now made smaller so it
    fits — and ONLY it: anything already under the ceiling reaches staging
    byte-for-byte as Photos produced it.

    This is the narrow amendment to law 4 recorded in CLAUDE.md. The suite
    below is what keeps it narrow."""

    def _payload_seam(self, payloads):
        """An export seam handing each id its own (filename, bytes)."""
        enum = "".join(i + "\n" for i in payloads)

        def fake(script, *args):
            if len(args) >= 2:
                media_id, dest = args[0], args[1]
                name, data = payloads[media_id]
                (Path(dest) / name).write_bytes(data)
                return ""
            return enum

        return fake

    def _ids(self):
        return [p["id"] for p in osascript_mock.SAMPLE_PHOTOS]

    def test_an_oversize_picture_arrives_instead_of_being_refused(self):
        big = _real_png(3100)
        self.assertGreater(len(big), study_lib.MAX_IMAGE_BYTES,
                           "the fixture must genuinely exceed the ceiling — "
                           "otherwise this test proves nothing")
        oversize = self._ids()[0]

        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()

            stats = {}
            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._payload_seam(
                        {oversize: ("IMG_0001.png", big)})):
                exported = apple_photos.collect(
                    lib, staging, stats=stats, export_root=_root(tmp))

            self.assertEqual(exported, [oversize],
                             "it ARRIVED — a photo made smaller is not a "
                             "photo that failed")
            staged = [p for p in staging.rglob("*") if p.is_file()]
            self.assertEqual(len(staged), 1)
            self.assertLessEqual(
                staged[0].stat().st_size, study_lib.MAX_IMAGE_BYTES,
                "it is now under the ceiling the importer judges by")
            self.assertLess(staged[0].stat().st_size, len(big),
                            "it really was made smaller")
            self.assertTrue(staged[0].read_bytes().startswith(b"\x89PNG"),
                            "still a real picture, never a truncated file")
            self.assertEqual(stats["resized"], 1,
                             "counted under its own reason, BY VALUE")
            self.assertEqual(stats["skipped"]["oversize"], 0,
                             "nothing was skipped — it came in")

            # and the SHIPPED importer, which is what actually refused it
            # before, now takes it.
            report = study_lib.import_folder(staging, lib)
            self.assertEqual(report["imported"], 1,
                             "the shipped importer accepts it now")
            self.assertEqual(report["skipped"]["oversize"], 0,
                             "the refusal this plan exists to remove")

    def test_the_aspect_ratio_is_preserved(self):
        # a deliberately non-square picture: shrinking must never crop or
        # stretch her photograph, only make the whole of it smaller.
        import struct as _struct
        import zlib as _zlib
        import os as _os
        # 2:1, and genuinely over the ceiling — the assertion below caught an
        # earlier 4000x2000 fixture at 24.0 MB, which would have "passed" the
        # aspect check without ever exercising the resizer at all.
        w, h = 4600, 2300
        raw = b"".join(b"\x00" + _os.urandom(w * 3) for _ in range(h))

        def chunk(tag, data):
            c = tag + data
            return (_struct.pack(">I", len(data)) + c
                    + _struct.pack(">I", _zlib.crc32(c) & 0xffffffff))

        wide = (b"\x89PNG\r\n\x1a\n"
                + chunk(b"IHDR", _struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                + chunk(b"IDAT", _zlib.compress(raw, 0))
                + chunk(b"IEND", b""))
        self.assertGreater(len(wide), study_lib.MAX_IMAGE_BYTES)
        mid = self._ids()[0]

        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._payload_seam(
                        {mid: ("IMG_0001.png", wide)})):
                apple_photos.collect(lib, staging, export_root=_root(tmp))
            staged = [p for p in staging.rglob("*") if p.is_file()][0]
            got = apple_photos._longest_edge(staged)
            proc = apple_photos._sips("-g", "pixelWidth", "-g", "pixelHeight",
                                      str(staged))
            dims = []
            for line in (proc.stdout or "").splitlines():
                line = line.strip()
                for key in ("pixelWidth:", "pixelHeight:"):
                    if line.startswith(key):
                        dims.append(int(line[len(key):].strip()))
            self.assertEqual(len(dims), 2)
            self.assertEqual(max(dims), got)
            self.assertAlmostEqual(max(dims) / float(min(dims)), 2.0, places=1,
                                   msg="2:1 in, 2:1 out — never cropped, "
                                       "never stretched")

    def test_a_picture_that_fits_is_byte_untouched_and_never_seen_by_sips(self):
        """The whole scope of the law-4 amendment, pinned. A rendition at or
        under the ceiling is never resampled, never re-encoded, never even
        opened by sips — it reaches staging exactly as Photos produced it."""
        small = _real_png(40)
        self.assertLessEqual(len(small), study_lib.MAX_IMAGE_BYTES)
        mid = self._ids()[0]
        before = hashlib.sha256(small).hexdigest()

        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()

            stats = {}
            calls = []

            def spy(*args):
                calls.append(args)
                return apple_photos._sips(*args)

            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._payload_seam(
                        {mid: ("IMG_0001.png", small)})):
                with mock.patch.object(apple_photos, "_sips",
                                       side_effect=spy):
                    apple_photos.collect(lib, staging, stats=stats,
                                         export_root=_root(tmp))

            staged = [p for p in staging.rglob("*") if p.is_file()]
            self.assertEqual(len(staged), 1)
            self.assertEqual(
                hashlib.sha256(staged[0].read_bytes()).hexdigest(), before,
                "BYTE-IDENTICAL: law 4 still holds in full for every photo "
                "that fits — the amendment covers only the ones that would "
                "otherwise not arrive at all")
            self.assertEqual(len(calls), 0,
                             "sips is never invoked on a photo that fits — "
                             "asserted BY VALUE, not intended")
            self.assertEqual(stats["resized"], 0)

    def test_a_video_is_never_handed_to_the_resizer(self):
        """Guard ORDER, asserted rather than assumed: video is skipped before
        the oversize check, so an oversize video is a video, not a picture to
        shrink."""
        big_video = b"\x00\x00\x00\x14ftypqt  " + os.urandom(26 * 1024 * 1024)
        self.assertGreater(len(big_video), study_lib.MAX_IMAGE_BYTES)
        mid = self._ids()[0]

        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()

            stats = {}
            calls = []

            def spy(*args):
                calls.append(args)
                return apple_photos._sips(*args)

            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._payload_seam(
                        {mid: ("IMG_0001.mov", big_video)})):
                with mock.patch.object(apple_photos, "_sips",
                                       side_effect=spy):
                    exported = apple_photos.collect(
                        lib, staging, stats=stats, export_root=_root(tmp))

            self.assertEqual(exported, [])
            self.assertEqual(stats["skipped"]["video"], 1,
                             "an oversize VIDEO is a video, not a picture "
                             "to shrink")
            self.assertEqual(stats["skipped"]["oversize"], 0)
            self.assertEqual(stats["resized"], 0)
            self.assertEqual(len(calls), 0,
                             "sips never saw it — the 26.65-08 guard runs "
                             "FIRST, asserted by value")

    def test_a_picture_that_cannot_be_shrunk_is_skipped_and_counted(self):
        """The defined give-up. If the bounded attempts are exhausted — or
        `sips` is simply not on this machine — the picture is skipped and
        counted under `oversize`, NEVER staged still-too-big (which would be
        the old silent refusal wearing a new name)."""
        big = _real_png(3100)
        mid = self._ids()[0]

        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()

            stats = {}
            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._payload_seam(
                        {mid: ("IMG_0001.png", big)})):
                # sips unavailable: the whole seam returns None, exactly as it
                # does on a machine without it.
                with mock.patch.object(apple_photos, "_sips",
                                       return_value=None):
                    with self.assertRaises(
                            apple_photos.PhotosCollectError) as ctx:
                        apple_photos.collect(lib, staging, stats=stats,
                                             export_root=_root(tmp))

            self.assertEqual(ctx.exception.reason, "total_failure",
                             "nothing came back, so the loud zero still "
                             "fires — resizing did not disable it")
            self.assertEqual(stats["skipped"]["oversize"], 1,
                             "counted under `oversize`, BY VALUE")
            self.assertEqual(stats["resized"], 0)
            self.assertEqual(
                [p for p in staging.rglob("*") if p.is_file()], [],
                "NOTHING is staged — a file the importer would refuse must "
                "never be staged 'just in case'")

    def test_resized_is_never_a_member_of_skipped(self):
        """The load-bearing separation. `adapterPartialLine` sums every key of
        `skipped` except `video` into "N pictures couldn't be brought in". A
        resized photo is IN HER ROOM."""
        big = _real_png(3100)
        mid = self._ids()[0]

        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            stats = {}
            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._payload_seam(
                        {mid: ("IMG_0001.png", big)})):
                apple_photos.collect(lib, staging, stats=stats,
                                     export_root=_root(tmp))

            self.assertNotIn("resized", stats["skipped"],
                             "`resized` is a SIBLING of `skipped`, never a "
                             "member of it")
            self.assertEqual(sum(stats["skipped"].values()), 0,
                             "a resize contributes ZERO to the failure sum, "
                             "asserted by value")
            self.assertEqual(stats["resized"], 1)

    def test_the_oversize_bucket_is_distinct_from_every_other_reason(self):
        big = _real_png(3100)
        ids = self._ids()
        self.assertEqual(len(ids), 3)
        oversize, video, heic = ids[0], ids[1], ids[2]

        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            stats = {}
            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._payload_seam({
                        oversize: ("IMG_0001.png", big),
                        video: ("IMG_0001.mov", b"\x00\x00\x00\x14ftypqt  "),
                        heic: ("IMG_0001.heic", b"heic-bytes")})):
                with mock.patch.object(apple_photos, "_sips",
                                       return_value=None):
                    with self.assertRaises(apple_photos.PhotosCollectError):
                        apple_photos.collect(lib, staging, stats=stats,
                                             export_root=_root(tmp))

            self.assertEqual(stats["skipped"]["oversize"], 1)
            self.assertEqual(stats["skipped"]["video"], 1)
            self.assertEqual(stats["skipped"]["heic"], 1)
            self.assertEqual(stats["skipped"]["no_file"], 0)
            self.assertEqual(stats["skipped"]["other"], 0)

    def test_a_run_with_resizes_does_not_trip_the_loud_zero(self):
        """The total-failure rule, re-checked against the new path: a resized
        photo counts as EXPORTED, so a run that only resized cannot possibly
        read as "none of your pictures came back"."""
        big = _real_png(3100)
        ids = self._ids()

        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            stats = {}
            with mock.patch.object(
                    apple_photos, "_run_osascript",
                    side_effect=self._payload_seam(
                        {i: ("IMG_0001.png", big) for i in ids})):
                exported = apple_photos.collect(lib, staging, stats=stats,
                                                export_root=_root(tmp))

            self.assertEqual(len(exported), len(ids),
                             "every one arrived — no raise, no error")
            self.assertEqual(stats["resized"], len(ids))
            self.assertEqual(sum(stats["skipped"].values()), 0)


# ---------------------------------------------------------------------------
# 26.995-29 — A STOPPED ROOM AND HER PHOTOGRAPHS (G-26.995-6 / OWED B-12)
# ---------------------------------------------------------------------------
# ⛔ EVERY OTHER CHECK IN THIS FILE PATCHES `_run_osascript` — TWENTY TIMES.
# A patched seam never spawns anything, so not one of those twenty assertions
# can observe a process at all. That is why this defect shipped green: on the
# evening of 2026-08-21 the room's server was killed and an osascript export
# child SURVIVED with ppid 1, going on reaching into her REAL Photos library
# one photograph at a time until somebody killed it by hand.
#
# ⛔ THE CHECKS BELOW DO NOT PATCH THE SEAM. They start a real child through
# the adapter's own spawn path, confirm it alive BY PROCESS ID, stop the parent
# the way a person stops the room, and then look that same id up again.
#
# ⛔ AND THEY NEVER TOUCH HER PHOTOS. The child is handed an AppleScript that
# names no application and no file — it waits, and that is the whole of it.
# The suite asserts that from the command line the child was ACTUALLY given,
# read back out of `ps`. Intent is not an assertion.
#
# ⛔ WHAT THIS CHECK CANNOT SEE: a hard kill. Nothing anywhere can catch one —
# there is no handler for it on any platform — so a room killed that way will
# still leave a child behind, and no arm below claims otherwise.

_PROBE_PREFIX = "studyroom-teardown-probe-"
_PROBE_APPEAR_S = 20.0
# Generous: 2.5x the grace a stopping room allows. After the fix a child
# is gone in well under a tenth of it; this is the window a SURVIVOR is
# given to prove itself before the check calls it survived.
_PROBE_REAP_S = 5.0


def _harmless_probe_script(token):
    """What the stand-in child is given, and it is the whole of it.

    No `tell application`, no media item, no path, no library, nothing of
    hers named anywhere in it. `delay` is pure AppleScript: it asks the
    operating system for nothing at all. It is long enough to outlive its
    parent, which is the only property this check needs from it."""
    return ("-- " + token + "\n"
            "-- A harmless stand-in. It names no application and no file.\n"
            "-- It waits, and that is all it does.\n"
            "delay 600\n")


def _ps_rows():
    """(pid, ppid, stat, command) for every process on this machine.

    Read from the operating system, never from the code under test — a
    registry the fix itself maintains could agree with the fix and be wrong
    about the machine."""
    out = subprocess.run(["ps", "-o", "pid=,ppid=,stat=,command=", "-ax"],
                         capture_output=True, text=True, timeout=30).stdout
    rows = []
    for line in out.splitlines():
        parts = line.split(None, 3)
        if len(parts) < 4:
            continue
        try:
            pid, ppid = int(parts[0]), int(parts[1])
        except ValueError:
            continue
        rows.append((pid, ppid, parts[2], parts[3]))
    return rows


def _probe_rows(token, rows=None):
    """Only genuine `osascript` children carrying this run's token.

    Matched on argv[0]'s basename so the python parent — whose own command
    line carries the script text as an argument, token and all — can never be
    mistaken for the child it spawned."""
    found = []
    for pid, ppid, stat, cmd in (rows if rows is not None else _ps_rows()):
        if token not in cmd:
            continue
        head = cmd.split()[0] if cmd.split() else ""
        if os.path.basename(head) != "osascript":
            continue
        found.append((pid, ppid, stat, cmd))
    return found


def _pid_alive(pid, rows=None):
    """Alive means present AND not a zombie. A reaped-but-unwaited corpse
    answers `os.kill(pid, 0)` happily, which is exactly the kind of check
    that would let this defect pass."""
    for p, _ppid, stat, _cmd in (rows if rows is not None else _ps_rows()):
        if p == pid:
            return not stat.startswith("Z")
    return False


# The stand-in room, run as a REAL separate process. It deliberately holds no
# logic of its own about stopping children: everything that could reap the
# export child is SHIPPED code reached by name. If the shipped tree has no
# teardown, nothing here supplies one.
_STAND_IN_ROOM_SRC = '''\
"""A stand-in for the running room, for tests/test_apple_photos.py.

It does three things the room does — import the adapter, start a DAEMON
worker that goes through the adapter's own osascript seam, and then wait
until it is stopped. It supplies no teardown of its own."""
import sys
import threading
import time

sys.path.insert(0, __REPO__)

from adapters import apple_photos

mode = sys.argv[1]
script = sys.argv[2]

if mode == "sigterm":
    import server
    arm = getattr(server, "install_shutdown_signal_handlers", None)
    if arm is None:
        # HEAD's bytes: nothing anywhere installs a handler for the polite
        # termination signal, so the room dies without running anything.
        print("NO-ARM", flush=True)
    else:
        arm()
        print("ARMED", flush=True)


def worker():
    # The room's collect worker is a daemon thread. It dies with the process.
    # The child it spawned does not.
    try:
        apple_photos._run_osascript(script)
    except BaseException:
        pass


threading.Thread(target=worker, daemon=True).start()
print("READY", flush=True)
try:
    while True:
        time.sleep(0.05)
except KeyboardInterrupt:
    # What server.main() does with a Ctrl+C: it returns, so the interpreter
    # shuts down normally. Nothing here catches a SystemExit and nothing here
    # kills anything.
    print("INTERRUPTED", flush=True)
'''


class AStoppedRoomStopsReadingHerPhotographs(unittest.TestCase):
    """⛔ The one class in this file that does NOT patch the osascript seam.

    G-26.995-6 / OWED B-12. A real child, a real stop, and a verdict read out
    of `ps` by the child's own process id.

    ⚠ WHAT IS DRIVEN AND WHAT IS ONLY READ. The two signal arms DRIVE real
    processes end to end. The wiring arm reads `server.main`'s source, because
    starting the real room binds her port and reads her library; it is a
    STRUCTURAL assertion and says so, and it exists so that a teardown which
    works when called cannot pass while nothing calls it."""

    def _stand_in_room(self, tmp):
        path = Path(tmp) / "stand_in_room.py"
        path.write_text(
            _STAND_IN_ROOM_SRC.replace("__REPO__", repr(str(_REPO_ROOT))),
            encoding="utf-8")
        return path

    def _assert_nothing_of_hers(self, cmd, token):
        """Read what the child was ACTUALLY given, and assert her library is
        not in it. From the command line, not from intention."""
        self.assertIn(token, cmd, "this is not our child")
        low = cmd.lower()
        for forbidden in ("tell application", "photos", "media item",
                          "localidentifier", "album", "pictures", "export",
                          "studyroom-import"):
            self.assertNotIn(
                forbidden, low,
                "the stand-in child was handed %r — it must ask the "
                "operating system for NOTHING of hers" % (forbidden,))
        for name in ("_ENUMERATE_SCRIPT", "_EXPORT_SCRIPT"):
            real = getattr(apple_photos, name)
            for line in real.splitlines():
                line = line.strip()
                if len(line) > 12:
                    self.assertNotIn(
                        line, cmd,
                        "a line of the REAL %s reached the stand-in child"
                        % name)

    def test_the_real_scripts_do_name_her_library(self):
        """THE POSITIVE CONTROL for the assertion above. If the detector
        could not say "this one DOES reach her library", then "the stand-in
        does not" would be worth nothing."""
        both = (apple_photos._ENUMERATE_SCRIPT + "\n"
                + apple_photos._EXPORT_SCRIPT).lower()
        self.assertIn("photos", both,
                      "the shipped scripts DO name her library — if this "
                      "fails the negative assertion is not discriminating")
        self.assertIn("tell application", both)
        harmless = _harmless_probe_script(_PROBE_PREFIX + "control").lower()
        self.assertNotIn("photos", harmless)
        self.assertNotIn("tell application", harmless)

    def _drive_a_stop(self, mode, signum, signame):
        self.assertIsNotNone(
            shutil.which("osascript"),
            "osascript is not on this machine, so no real child can be "
            "started and this check CANNOT be made. It FAILS rather than "
            "skipping — a green here would be a claim nothing measured.")
        token = _PROBE_PREFIX + uuid.uuid4().hex
        script = _harmless_probe_script(token)
        parent = None
        child_pid = None
        with tempfile.TemporaryDirectory() as tmp:
            room = self._stand_in_room(tmp)
            try:
                parent = subprocess.Popen(
                    [sys.executable, str(room), mode, script],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

                rows = []
                deadline = time.monotonic() + _PROBE_APPEAR_S
                while time.monotonic() < deadline:
                    rows = _probe_rows(token)
                    if rows:
                        break
                    if parent.poll() is not None:
                        break
                    time.sleep(0.1)

                self.assertTrue(
                    rows,
                    "THE CHILD NEVER STARTED, so this check is vacuous and "
                    "fails rather than passing. The stand-in room exited "
                    "with %r. Its output was: %r"
                    % (parent.poll(), parent.stdout.read(2000)
                       if parent.poll() is not None else "(still running)"))
                self.assertEqual(
                    len(rows), 1,
                    "expected exactly one stand-in child, found %d: %r"
                    % (len(rows), rows))

                child_pid, child_ppid, _stat, child_cmd = rows[0]
                self.assertEqual(
                    child_ppid, parent.pid,
                    "the child we are about to judge is not the one this "
                    "stand-in room spawned (its parent is %d, the room is "
                    "%d)" % (child_ppid, parent.pid))
                self.assertTrue(
                    _pid_alive(child_pid),
                    "pid %d is not alive before the room is stopped — a "
                    "check that looks for a dead process after killing a "
                    "parent that never had a live child always passes"
                    % child_pid)
                self._assert_nothing_of_hers(child_cmd, token)

                # Stop the room the way a person stops it.
                parent.send_signal(signum)
                try:
                    parent.wait(timeout=20)
                except subprocess.TimeoutExpired:
                    self.fail("the stand-in room did not stop on %s"
                              % signame)

                deadline = time.monotonic() + _PROBE_REAP_S
                while time.monotonic() < deadline:
                    if not _pid_alive(child_pid):
                        break
                    time.sleep(0.1)

                still = [r for r in _ps_rows()
                         if r[0] == child_pid and not r[2].startswith("Z")]
                # ⚠ The verdict is built INSIDE the branch, never as an
                # unconditional argument: a message that reads `still[0]`
                # while `still` is empty turns the passing case into an
                # IndexError, and a check that can only ever error or fail
                # measures nothing. Driving this green is what found it.
                if still:
                    self.fail(
                        "⛔ THE EXPORT CHILD SURVIVED THE ROOM. pid %d is "
                        "still alive %.1f seconds after the room was stopped "
                        "with %s. Its parent is now %d (1 means it was "
                        "reparented to the system and nothing owns it). "
                        "ps says: %s"
                        % (child_pid, _PROBE_REAP_S, signame,
                           still[0][1], still[0][3][:140]))
            finally:
                # ⛔ Never leave one of ours behind, whatever the verdict.
                if parent is not None and parent.poll() is None:
                    parent.kill()
                    try:
                        parent.wait(timeout=5)
                    except Exception:
                        pass
                for pid, _ppid, _stat, _cmd in _probe_rows(token):
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except OSError:
                        pass
                if parent is not None:
                    try:
                        parent.stdout.close()
                        parent.stderr.close()
                    except Exception:
                        pass

    def test_a_keyboard_interrupt_reaps_the_export_child(self):
        """The way she actually stops the room: Ctrl+C at the terminal."""
        self._drive_a_stop("sigint", signal.SIGINT, "SIGINT (Ctrl+C)")

    def test_a_polite_termination_signal_reaps_the_export_child(self):
        """The other way a room stops without being killed outright: the
        polite termination signal a terminal or a logout sends."""
        self._drive_a_stop("sigterm", signal.SIGTERM, "SIGTERM")

    def test_the_rooms_own_shutdown_is_wired_to_the_teardown(self):
        """⚠ STRUCTURAL, and it says so. It does not drive `main()` — that
        would bind her port and read her library — so it proves only that the
        shipped entry point is WIRED to the shipped teardown, which is the one
        thing the two driven arms above cannot prove about `main()` itself."""
        src = inspect.getsource(server.main)
        self.assertIn(
            "install_shutdown_signal_handlers()", src,
            "main() does not arm the polite-termination path, so a room "
            "stopped that way runs nothing at all")
        self.assertIn("except KeyboardInterrupt:", src)
        for skipper in ("os._exit", "os.abort"):
            self.assertNotIn(
                skipper, src,
                "%s on main()'s shutdown path would skip the interpreter's "
                "own exit handlers, and the Ctrl+C teardown rides them"
                % skipper)


    def test_a_child_doing_its_work_is_untouched_while_the_room_runs(self):
        """⛔ THE OTHER HALF, AND IT MATTERS AS MUCH. A teardown that reached
        a running child would cut an export off mid-write on the surface that
        reads her real photographs. This drives ONE child through BOTH halves
        in one run: alive and untouched well past the grace period while the
        room serves, then gone when the room stops."""
        self.assertIsNotNone(shutil.which("osascript"),
                             "osascript is not on this machine, so no real "
                             "child can be started and this check CANNOT be "
                             "made. It FAILS rather than skipping.")
        token = _PROBE_PREFIX + uuid.uuid4().hex
        script = _harmless_probe_script(token)
        parent = None
        with tempfile.TemporaryDirectory() as tmp:
            room = self._stand_in_room(tmp)
            try:
                parent = subprocess.Popen(
                    [sys.executable, str(room), "sigint", script],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                rows = []
                deadline = time.monotonic() + _PROBE_APPEAR_S
                while time.monotonic() < deadline and not rows:
                    rows = _probe_rows(token)
                    time.sleep(0.1)
                self.assertTrue(rows, "the child never started")
                child_pid = rows[0][0]

                # Well past the grace a stopping room allows, with the room
                # still serving. Nothing may have touched it.
                waited = apple_photos._TEARDOWN_GRACE + 1.5
                time.sleep(waited)
                self.assertTrue(
                    _pid_alive(child_pid),
                    "⛔ pid %d was killed after %.1fs while the room was "
                    "STILL RUNNING. A collect in flight would have been cut "
                    "off mid-export." % (child_pid, waited))
                self.assertIsNone(parent.poll(), "the room stopped by itself")

                # and only NOW does stopping the room reap it
                parent.send_signal(signal.SIGINT)
                parent.wait(timeout=20)
                deadline = time.monotonic() + _PROBE_REAP_S
                while time.monotonic() < deadline and _pid_alive(child_pid):
                    time.sleep(0.1)
                self.assertFalse(
                    _pid_alive(child_pid),
                    "the same child survived the stop it should not have")
            finally:
                if parent is not None and parent.poll() is None:
                    parent.kill()
                    try:
                        parent.wait(timeout=5)
                    except Exception:
                        pass
                for pid, _p, _s, _c in _probe_rows(token):
                    try:
                        os.kill(pid, signal.SIGKILL)
                    except OSError:
                        pass
                if parent is not None:
                    try:
                        parent.stdout.close()
                        parent.stderr.close()
                    except Exception:
                        pass

    def test_a_call_that_finishes_normally_is_unchanged_and_leaves_nothing(self):
        """A REAL osascript call, seam unpatched, that simply succeeds. Its
        text comes back exactly as before and the registry is empty
        afterwards — a room that has run a thousand collects is not holding a
        thousand finished children."""
        self.assertIsNotNone(shutil.which("osascript"))
        out = apple_photos._run_osascript('return "study-room-round-trip"')
        self.assertEqual(out.strip(), "study-room-round-trip")
        self.assertEqual(
            list(apple_photos._LIVE_CHILDREN), [],
            "a finished child is still in the registry — it would be "
            "signalled on the way out, and the registry would grow all run")

    def test_a_hung_call_still_surfaces_as_the_calm_retryable_error(self):
        """The existing timeout behaviour, driven on a REAL child rather than
        reasoned about: the overrun raises, the child is killed rather than
        left running, and the room says the same calm sentence it always
        said."""
        with mock.patch.object(apple_photos, "_OSASCRIPT_TIMEOUT", 0.4):
            with self.assertRaises(apple_photos.PhotosCollectError) as caught:
                apple_photos._run_osascript("delay 30")
        self.assertTrue(caught.exception.fatal)
        self.assertEqual(str(caught.exception),
                         "Reaching Photos took too long — try the candle "
                         "again.")
        self.assertEqual(list(apple_photos._LIVE_CHILDREN), [])

    def test_a_timed_out_child_is_killed_not_left_running(self):
        """⛔ And the child of that overrun is GONE, by process id. The old
        `subprocess.run` killed it; a replacement that raised the same error
        while leaving the process alive would look identical from every other
        test in this file."""
        before = {r[0] for r in _ps_rows()}
        with self.assertRaises(subprocess.TimeoutExpired):
            apple_photos._run_tracked(["sleep", "30"], 0.4)
        time.sleep(0.3)
        leaked = [r for r in _ps_rows()
                  if r[0] not in before and not r[2].startswith("Z")
                  and r[3].split()[:2] == ["sleep", "30"]]
        self.assertFalse(leaked, "the timed-out child was left running: %r"
                                 % (leaked,))
        self.assertEqual(list(apple_photos._LIVE_CHILDREN), [])

    def test_the_seam_keeps_all_three_of_its_properties(self):
        """⛔ The osascript seam is the single point twenty checks in this
        file patch, it passes arguments as a LIST with no shell, and it never
        interpolates a path into the script source. Re-verified here rather
        than asserted, because the fix went straight through it."""
        mod = inspect.getsource(apple_photos)

        # (1) still the single point — nothing else in the module spawns.
        #     ⚠ Counted over the PARSED CODE, not the text: this module's
        #     prose names `subprocess.run` when it explains what replaced it,
        #     and a grep would score a sentence as a call site.
        spawns = []
        for node in ast.walk(ast.parse(mod)):
            if not isinstance(node, ast.Call):
                continue
            fn = node.func
            if isinstance(fn, ast.Attribute) and isinstance(fn.value, ast.Name) \
                    and fn.value.id == "subprocess" \
                    and fn.attr in ("run", "Popen", "call", "check_output"):
                spawns.append("subprocess." + fn.attr)
        self.assertEqual(
            spawns, ["subprocess.Popen"],
            "this module must start processes in exactly ONE place, and a "
            "second untracked spawn would be invisible to the teardown; "
            "found %r" % (spawns,))
        seam_src = inspect.getsource(apple_photos._run_osascript)
        self.assertIn("_run_tracked(cmd, _OSASCRIPT_TIMEOUT)", seam_src)

        # (2) an argument list, never a shell.
        self.assertNotIn("shell=True", mod)
        self.assertNotIn("os.system", mod)
        self.assertNotIn("os.popen", mod)
        tracked = inspect.getsource(apple_photos._run_tracked)
        self.assertIn("subprocess.Popen(cmd,", tracked)

        # (3) no path, and no photo id, interpolated into the script source.
        for name in ("_ENUMERATE_SCRIPT", "_EXPORT_SCRIPT"):
            script = getattr(apple_photos, name)
            for marker in ("%s", "{}", "{0}", ".format(", "' + ", '" + '):
                self.assertNotIn(
                    marker, script,
                    "%s carries a substitution marker %r — a path or an id "
                    "would be interpolated into the script SOURCE"
                    % (name, marker))
        cmd_line = [l for l in seam_src.splitlines()
                    if 'cmd = ["osascript", "-e", script]' in l]
        self.assertEqual(len(cmd_line), 1,
                         "the seam no longer builds its command as a list "
                         "with the script as one whole element")
        self.assertIn("cmd.extend(args)", seam_src,
                      "arguments must ride as ARGUMENTS, not in the script")

    def test_the_teardown_added_no_runtime_dependency(self):
        """Law 8, checked rather than promised: every top-level import in the
        adapter is a standard-library module, and the only outside programs it
        runs are the two macOS built-ins it already ran."""
        tree = ast.parse(inspect.getsource(apple_photos))
        names = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    names.add(a.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                if node.module:
                    names.add(node.module.split(".")[0])
        outside = sorted(n for n in names
                         if n not in sys.stdlib_module_names
                         and n not in {"study_lib", "adapters"})
        self.assertEqual(outside, [],
                         "the adapter now imports something outside the "
                         "standard library: %r" % (outside,))
        mod = inspect.getsource(apple_photos)
        self.assertIn('["osascript", "-e", script]', mod)
        self.assertIn('["sips", *args]', mod)

    def test_a_room_that_never_reaches_photos_arms_nothing(self):
        """The exit handler is registered on the FIRST spawn, not at import —
        so importing the adapter changes nothing about the process that
        imports it. Driven in a clean interpreter, because this one has
        already spawned."""
        probe = "\n".join([
            "import sys",
            "sys.path.insert(0, %r)" % str(_REPO_ROOT),
            "from adapters import apple_photos as ap",
            "print(ap._TEARDOWN_ARMED, len(ap._LIVE_CHILDREN))",
        ])
        out = subprocess.run([sys.executable, "-c", probe],
                             capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr)
        self.assertEqual(out.stdout.strip(), "False 0",
                         "merely importing the adapter armed something")

    def test_the_rest_of_this_file_patches_the_seam_twenty_five_times(self):
        """⛔ THE REASON THIS DEFECT SHIPPED GREEN, pinned by value so it
        cannot drift silently. Every other check in this file replaces
        `_run_osascript` with a stand-in, and a replaced seam SPAWNS NOTHING —
        so no assertion in any of them can observe a process, let alone one
        that outlived its parent.

        ⚠ THE NUMBER WAS NINETEEN, NOT TWENTY, AND THAT CORRECTION IS KEPT
        RATHER THAN QUIETLY APPLIED. Twenty is what `grep -c` returned,
        because it counts LINES CONTAINING the name and one of those lines is
        a comment explaining the seam's signature, not a patch. Counted as
        patch SITES it was nineteen. The plan that commissioned this check
        carried the grep's number.

        ⚠ MOVED 19 → 25 ON 2026-08-25, and the move is deliberate, not drift:
        TestRecogniseFirstNeverCopy (her recognise-first ruling) added six
        patch sites — two collect drives and four fail-open arms. The quoted
        number moves in this file's docstring and in 26.995-29's SUMMARY in
        the same commit, per this pin's own failure message."""
        text = Path(__file__).read_text(encoding="utf-8")
        # ⚠ The needle is BUILT rather than written whole. Spelt out, this
        # very line would match the pattern it is counting and the pin would
        # report one more site than exists — which is exactly what the first
        # run of it did.
        needle = "apple_photos, " + '"_run_' + 'osascript"'
        seam_sites = text.count(needle)
        self.assertEqual(
            seam_sites, 25,
            "the number of places this file replaces the osascript seam has "
            "moved to %d. That number is quoted in this file's docstring, in "
            "26.995-29's SUMMARY and in G-26.995-6's record — move it there "
            "too, or the record starts lying." % seam_sites)
        mentions = len([l for l in text.splitlines()
                        if "_run_osascript" in l])
        self.assertGreater(
            mentions, seam_sites,
            "the comment line that makes a plain grep say twenty is gone — "
            "if so the correction above needs rewriting, not deleting")

    def test_the_line_the_room_prints_when_it_closes_is_untouched(self):
        """⛔ HER WORDING. Front-facing and not this plan's to edit. Pinned
        byte-exact so a teardown cannot quietly reword or relocate it."""
        src = inspect.getsource(server.main)
        self.assertIn("The room is closed. Everything is saved.", src)


# ---------------------------------------------------------------------------
# THE MUTATION DRILL — put the surviving child back, and prove it is caught
# ---------------------------------------------------------------------------
# ⚠ A CHECK NEVER SEEN RED IS NOT EVIDENCE, and this project has ELEVEN
# recorded instances of a check pinning the wrong thing — two of them created
# INSIDE corrections written to end the class. So every mutation below is
# proven to have CHANGED THE FILE by content hash before its verdict is read
# (a reorder has zero byte-length delta, so length proves nothing), each names
# the ARM it is aimed at and BOTH arms are scored, the unmutated tree must be
# green before any score is read, and two known-negatives must SURVIVE.

_DRILL_ARMS = (
    ("Ctrl+C", "test_a_keyboard_interrupt_reaps_the_export_child"),
    ("SIGTERM", "test_a_polite_termination_signal_reaps_the_export_child"),
)

# Each: which arm(s) it MUST redden, the file, and the exact patch.
_DRILL_MUTATIONS = (
    {
        "name": "THE-TEARDOWN-IS-REMOVED-ENTIRELY",
        "note": "the shipped defect, exactly: the room stops and nothing "
                "anywhere stops the child.",
        "must_die": ("Ctrl+C", "SIGTERM"),
        "path": "adapters/apple_photos.py",
        "old": "    procs = _snapshot_children()",
        "new": "    procs = []  # MUTANT: the teardown finds nothing to stop",
    },
    {
        "name": "THE-TEARDOWN-SURVIVES-BUT-ITS-TRIGGER-IS-BLINDED",
        "note": "⛔ the second shape, and it is the one that matters: the "
                "teardown is present and correct and NOTHING EVER CALLS IT. "
                "A drill with only the first mutant proves a function exists, "
                "not that it runs.",
        "must_die": ("Ctrl+C", "SIGTERM"),
        "path": "adapters/apple_photos.py",
        "old": "    atexit.register(terminate_live_children)",
        "new": "    pass  # MUTANT: nothing is ever registered",
    },
    {
        "name": "THE-POLITE-SIGNAL-TRIGGER-IS-BLINDED",
        "note": "the room stops arming the polite-termination signal. Aimed "
                "at ONE arm on purpose: Ctrl+C must stay GREEN, or the drill "
                "cannot tell which half of the fix carries which stop.",
        "must_die": ("SIGTERM",),
        "path": "server.py",
        "old": "            signal.signal(sig, _stop_the_ordinary_way)",
        "new": "            pass  # MUTANT: the signal is left on its default",
    },
    {
        "name": "KNOWN-NEGATIVE-the-osascript-timeout-moves",
        "note": "MUST SURVIVE. How long a hung Photos call is allowed to run "
                "has nothing to do with whether a stopped room reaps it. A "
                "check that reddens on any edit at all measures nothing.",
        "must_die": (),
        "path": "adapters/apple_photos.py",
        "old": "_OSASCRIPT_TIMEOUT = 300",
        "new": "_OSASCRIPT_TIMEOUT = 301",
    },
    {
        "name": "KNOWN-NEGATIVE-ZERO-LENGTH-DELTA-the-grace-moves",
        "note": "MUST SURVIVE, and it is ⛔ EXACTLY THE SAME NUMBER OF BYTES "
                "as the line it replaces. It is here to prove the planting "
                "check is a CONTENT HASH and not a byte count: a length "
                "comparison would call this mutation unplanted.",
        "must_die": (),
        "path": "adapters/apple_photos.py",
        "old": "_TEARDOWN_GRACE = 2.0",
        "new": "_TEARDOWN_GRACE = 3.0",
    },
)

EXPECTED_MUST_DIE = 3
EXPECTED_KNOWN_NEGATIVES = 2


def _sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _run_arm(method):
    """One arm, in a fresh interpreter so the mutated file is really loaded."""
    proc = subprocess.run(
        [sys.executable, "-m", "unittest",
         "tests.test_apple_photos.AStoppedRoomStopsReadingHerPhotographs."
         + method],
        cwd=str(_REPO_ROOT), capture_output=True, text=True, timeout=300)
    return proc.returncode


def run_drill():
    """Returns (killed, must_die_total, survived, known_negative_total, ok).

    ⛔ Every file is restored and its content hash compared to how the drill
    found it. Another live session holds uncommitted work in this repo and a
    drill that left a file half-mutated would land in somebody else's diff."""
    print("[drill] git status before: %d line(s)"
          % len(_git_status_lines()))

    # ⛔ THE UNMUTATED CONTROL FIRST. No score is read until the tree as it
    # ships is green on BOTH arms — a drill whose baseline is already red
    # scores its own breakage.
    control_ok = True
    for label, method in _DRILL_ARMS:
        rc = _run_arm(method)
        print("[drill] CONTROL %-8s rc=%d %s"
              % (label, rc, "green" if rc == 0 else "⛔ RED"))
        control_ok = control_ok and rc == 0
    if not control_ok:
        print("[drill] ⛔ THE UNMUTATED TREE IS NOT GREEN — no score is read.")
        return 0, EXPECTED_MUST_DIE, 0, EXPECTED_KNOWN_NEGATIVES, False

    killed = 0
    survived = 0
    ok = True
    broken = os.environ.get("STUDYROOM_DRILL_BREAK_A_PATCH") == "1"

    for i, mut in enumerate(_DRILL_MUTATIONS):
        path = _REPO_ROOT / mut["path"]
        old = mut["old"]
        if broken and i == 0:
            # The drill's own negative control, driven on demand: a patch
            # string that no longer matches the shipped source. ⚠ This has
            # happened for real on this project and it read EXACTLY like a
            # gate that does not hold — SURVIVED, while nothing was planted.
            old = old + "  # NO LONGER IN THE SOURCE"
        before_sha = _sha(path)
        before_text = path.read_text(encoding="utf-8")
        planted = False
        try:
            if before_text.count(old) != 1:
                print("[drill] ⛔ MUTANT NOT PLANTED — %s: its patch matches "
                      "the source %d time(s), not once. NOTHING WAS CHANGED, "
                      "so its verdict would be meaningless and is NOT read."
                      % (mut["name"], before_text.count(old)))
                ok = False
                continue
            path.write_text(before_text.replace(old, mut["new"], 1),
                            encoding="utf-8")
            after_sha = _sha(path)
            # ⛔ BY CONTENT HASH, NEVER BY LENGTH. One of the known-negatives
            # below is byte-for-byte the same length as the line it replaces.
            if after_sha == before_sha:
                print("[drill] ⛔ MUTANT NOT PLANTED — %s: %s is unchanged "
                      "(sha %s)" % (mut["name"], mut["path"], after_sha[:16]))
                ok = False
                continue
            planted = True
            print("[drill] planted %s :: %s  sha %s -> %s"
                  % (mut["name"], mut["path"], before_sha[:12],
                     after_sha[:12]))

            verdicts = {}
            for label, method in _DRILL_ARMS:
                verdicts[label] = _run_arm(method)

            aimed = set(mut["must_die"])
            reddened = {l for l, rc in verdicts.items() if rc != 0}
            detail = ", ".join("%s rc=%d" % (l, verdicts[l])
                               for l, _m in _DRILL_ARMS)
            if aimed:
                if aimed <= reddened:
                    killed += 1
                    print("[drill] KILLED   %s (aimed at %s; %s)"
                          % (mut["name"], "+".join(sorted(aimed)), detail))
                    extra = reddened - aimed
                    if extra:
                        print("[drill]   ⚠ it ALSO reddened %s — reported so "
                              "a hit on one arm is not read as a hit on the "
                              "other" % "+".join(sorted(extra)))
                else:
                    ok = False
                    print("[drill] ⛔ SURVIVED (must have died) %s (%s)"
                          % (mut["name"], detail))
            else:
                if reddened:
                    ok = False
                    print("[drill] ⛔ KNOWN-NEGATIVE DIED %s — the check is "
                          "reddening on an edit it should be indifferent to "
                          "(%s)" % (mut["name"], detail))
                else:
                    survived += 1
                    print("[drill] SURVIVED (as required) %s (%s)"
                          % (mut["name"], detail))
        finally:
            if planted:
                path.write_text(before_text, encoding="utf-8")
                restored = _sha(path)
                if restored != before_sha:
                    ok = False
                    print("[drill] ⛔ RESTORE FAILED for %s: %s != %s"
                          % (mut["path"], restored[:16], before_sha[:16]))
                else:
                    print("[drill] restored %s sha %s"
                          % (mut["path"], restored[:12]))

    print("[drill] %d/%d must-die mutants KILLED, %d/%d known-negatives "
          "SURVIVED" % (killed, EXPECTED_MUST_DIE, survived,
                        EXPECTED_KNOWN_NEGATIVES))
    print("[drill] git status after: %d line(s)"
          % len(_git_status_lines()))
    ok = (ok and killed == EXPECTED_MUST_DIE
          and survived == EXPECTED_KNOWN_NEGATIVES)
    return killed, EXPECTED_MUST_DIE, survived, EXPECTED_KNOWN_NEGATIVES, ok


def _git_status_lines():
    try:
        out = subprocess.run(["git", "status", "--porcelain"],
                             cwd=str(_REPO_ROOT), capture_output=True,
                             text=True, timeout=60).stdout
        return [l for l in out.splitlines() if l.strip()]
    except Exception:
        return []


class TestRecogniseFirstNeverCopy(unittest.TestCase):
    """⛔⛔ HER RULING 2026-08-25, confirmed from an offered set: `Yes —
    recognize first, never copy` (record:
    26.995-OWNER-RULING-2026-08-25-skip-new-videos-and-the-candle-says-so.md).

    THE DEFECT IT FIXES, MEASURED THE SAME NIGHT ON HER REAL LIBRARY. The room
    discovered a video only by exporting it IN FULL and then setting it aside
    — one of hers streamed 1.37 GB and was still killed by the ~2-minute
    AppleEvent reply window, so her largest videos could NEVER arrive at being
    recognised at all: they failed as `other`, were never set aside, and
    recurred at the same queue positions on every single visit.

    ⚠ THE SAFETY HALF: classification is FAIL-OPEN. Any trouble classifies
    nothing and the export-side video guard (26.65-08) catches what slips
    through — so a PHOTOGRAPH can only be set aside here if Photos itself
    names it with a video extension."""

    def _classify_payload(self, pairs):
        ids = "\n".join(i for i, _ in pairs)
        names = "\n".join(n for _, n in pairs)
        return (ids + "\n" + apple_photos._CLASSIFY_SPLIT + "\n" + names)

    def test_a_named_video_is_set_aside_and_never_handed_to_the_exporter(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            ids = [p["id"] for p in osascript_mock.SAMPLE_PHOTOS]
            video_id, photo_ids = ids[0], ids[1:]
            payload = self._classify_payload(
                [(video_id, "IMG_4366.MOV")]
                + [(i, "IMG_%04d.JPG" % k) for k, i in enumerate(photo_ids)])
            export_calls = []

            def fake(script, *args):
                # 2+ args = the per-item export seam; bare = the classify.
                if len(args) >= 2:
                    media_id, dest = args[0], args[1]
                    export_calls.append(media_id)
                    out = Path(dest) / "IMG_0001.jpeg"
                    out.write_bytes(b"\xff\xd8\xff" + media_id.encode()
                                    + b"\xff\xd9")
                    return ""
                return payload

            stats = {}
            with mock.patch.object(apple_photos, "_enumerate_photo_ids",
                                   return_value=list(ids)), \
                mock.patch.object(apple_photos, "_run_osascript",
                                  side_effect=fake):
                out = apple_photos.collect(lib, staging, stats=stats,
                                           export_root=_root(tmp))
            self.assertNotIn(video_id, export_calls,
                             "⛔ the recognised video must NEVER be handed to "
                             "the exporter — recognise first, never copy")
            self.assertEqual(sorted(out), sorted(photo_ids),
                             "every photograph still arrives")
            led = _ledger.load(lib, apple_photos.SOURCE)
            self.assertIn(video_id, led["set_aside_ids"],
                          "the recognised video is REMEMBERED, so it is "
                          "never re-attempted")
            self.assertNotIn(video_id, led["exported_ids"],
                             "and never called exported — it never arrived")
            self.assertEqual(stats["skipped"]["video"], 1,
                             "counted in the honest video bucket")

    def test_an_all_recognised_video_queue_touches_no_export_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()
            ids = [p["id"] for p in osascript_mock.SAMPLE_PHOTOS]
            payload = self._classify_payload(
                [(i, "IMG_%04d.MOV" % k) for k, i in enumerate(ids)])
            ticks = []

            def fake(script, *args):
                if len(args) >= 2:
                    self.fail("⛔ ZERO export calls on an all-video queue")
                return payload

            stats = {}
            with mock.patch.object(apple_photos, "_enumerate_photo_ids",
                                   return_value=list(ids)), \
                mock.patch.object(apple_photos, "_run_osascript",
                                  side_effect=fake):
                out = apple_photos.collect(
                    lib, staging, stats=stats, export_root=_root(tmp),
                    progress_cb=lambda d, t: ticks.append((d, t)))
            self.assertEqual(out, [], "nothing arrived, and that is correct")
            self.assertFalse(_root(tmp).exists(),
                             "⛔ her Pictures folder is not touched at all — "
                             "the same courtesy the legitimate zero gets")
            self.assertEqual(stats["skipped"]["video"], len(ids))
            self.assertEqual(stats["set_aside_recorded"], len(ids),
                             "all remembered in one run")
            self.assertEqual(ticks[-1], (len(ids), len(ids)),
                             "the N-of-M readout stays honest — every "
                             "recognised video still ticks the bar")
            led = _ledger.load(lib, apple_photos.SOURCE)
            self.assertEqual(_ledger.new_ids(led, ids), [],
                             "the second landing attempts NOTHING")

    def test_classification_fails_open_never_closed(self):
        """Any trouble at all classifies NOTHING — the dangerous direction is
        a photograph set aside unshown, and this pins it shut."""
        ids = ["a-1", "b-2"]
        # the marker missing (an enumerate-shaped or garbage answer)
        with mock.patch.object(apple_photos, "_run_osascript",
                               return_value="a-1\nb-2"):
            self.assertEqual(apple_photos._video_ids_by_filename(ids), set())
        # the two lists disagreeing in length
        with mock.patch.object(
                apple_photos, "_run_osascript",
                return_value="a-1\nb-2\n" + apple_photos._CLASSIFY_SPLIT
                + "\nIMG_1.MOV"):
            self.assertEqual(apple_photos._video_ids_by_filename(ids), set())
        # the query erroring outright
        with mock.patch.object(apple_photos, "_run_osascript",
                               side_effect=RuntimeError("boom")):
            self.assertEqual(apple_photos._video_ids_by_filename(ids), set())
        # and the healthy case, so the fail-open arms above are not vacuous
        with mock.patch.object(
                apple_photos, "_run_osascript",
                return_value="a-1\nb-2\n" + apple_photos._CLASSIFY_SPLIT
                + "\nIMG_1.MOV\nIMG_2.JPG"):
            self.assertEqual(apple_photos._video_ids_by_filename(ids),
                             {"a-1"})


def main():
    before_status = _git_status_lines()
    suite = unittest.defaultTestLoader.loadTestsFromModule(
        sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    print("CASES %d" % suite.countTestCases())

    if "--no-drill" in sys.argv:
        print("DRILL skipped (--no-drill)")
        return 0 if result.wasSuccessful() else 1

    killed, must_die, survived, negatives, drill_ok = run_drill()
    print("DRILL %d/%d must-die killed, %d/%d known-negatives survived"
          % (killed, must_die, survived, negatives))

    after_status = _git_status_lines()
    status_same = before_status == after_status
    print("GIT STATUS across the drill: %s"
          % ("unchanged" if status_same else
             "⛔ CHANGED\n  before: %r\n  after:  %r"
             % (before_status, after_status)))

    ok = result.wasSuccessful() and drill_ok and status_same
    if not ok:
        return 1
    print("test_apple_photos OK (%d cases, a REAL child reaped by process "
          "id, %d must-die mutants killed, %d known-negatives survived)"
          % (suite.countTestCases(), killed, survived))
    return 0


if __name__ == "__main__":
    sys.exit(main())
