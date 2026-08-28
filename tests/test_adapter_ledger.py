#!/usr/bin/env python3
"""adapters/_ledger.py + stable-id dedup unit tests (Phase 26.65, Plan 01).

The importer (study_lib.import_folder) dedups only on SHA-256 of file bytes;
it has no notion of a source-stable id. A re-exported note can produce
different bytes each time, so byte dedup alone would let a candle re-pull mint
duplicate `unseen` cards (RESEARCH Pitfall 2). The adapter LEDGER — the set of
note ids already exported, per source, at
`<library_root>/adapters/apple-notes/ledger.json` — is what makes a re-pull
idempotent at the source-id layer (ADP-03).

This suite pins:
  1. load() fails open to the EMPTY ledger — TWO lists now, not one — on a fresh
     (or corrupt/absent) library — never raises.
  2. save() then load() round-trips the id set.
  3. new_ids(ledger, ids) returns only ids absent from exported_ids.
  4. the ledger path is EXACTLY <library_root>/adapters/apple-notes/ledger.json.
  5. a second collect with the SAME canned note ids imports 0 new cards
     (report["imported"] == 0) — stable-id dedup, independent of byte content.

Stdlib only (unittest + tempfile) — zero-dependency law (law 8). osascript is
mocked via tests/fixtures/osascript_mock.py; no live Notes is ever touched.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
_FIXTURES = Path(__file__).resolve().parent / "fixtures"
if str(_FIXTURES) not in sys.path:
    sys.path.insert(0, str(_FIXTURES))

import study_lib  # noqa: E402
from adapters import _ledger  # noqa: E402
from adapters import apple_notes  # noqa: E402
import osascript_mock  # noqa: E402


def _collect_cycle(lib):
    """One full candle-tap cycle at the adapter layer: collect new notes into
    a fresh staging dir, hand the staging dir to the UNCHANGED importer, then
    commit the exported ids to the ledger AFTER the import succeeds. Returns
    the import report."""
    staging = tempfile.mkdtemp(prefix="notes-collect-")
    try:
        with osascript_mock.patch_osascript(apple_notes):
            exported = apple_notes.collect(lib, staging)
        report = study_lib.import_folder(staging, lib)
        ledger = _ledger.load(lib, apple_notes.SOURCE)
        have = set(ledger.get("exported_ids", []))
        have.update(exported)
        ledger["exported_ids"] = sorted(have)
        _ledger.save(lib, apple_notes.SOURCE, ledger)
        return report
    finally:
        shutil.rmtree(staging, ignore_errors=True)


class TestLedgerRoundTrip(unittest.TestCase):
    """Tests 1-4 — the stdlib ledger contract."""

    def test_load_fresh_library_fails_open_to_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = _ledger.load(tmp, "apple-notes")
            self.assertEqual(ledger, {"exported_ids": [], "set_aside_ids": [], "last_run_ms": None})

    def test_load_corrupt_ledger_fails_open_never_raises(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "adapters" / "apple-notes" / "ledger.json"
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("{not valid json", encoding="utf-8")
            ledger = _ledger.load(tmp, "apple-notes")
            self.assertEqual(ledger, {"exported_ids": [], "set_aside_ids": [], "last_run_ms": None})

    def test_a_legacy_ledger_reads_back_with_an_empty_set_aside_list(self):
        """⚠ A ledger written before her 2026-08-24 ruling carries no
        set_aside_ids. It must read back as an EMPTY list — the honest answer:
        nothing was ever recorded as looked-at-and-skipped, so the next run
        records them and every run after that is quiet."""
        with tempfile.TemporaryDirectory() as root:
            p = Path(root) / "adapters" / "s" / "ledger.json"
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(json.dumps(
                {"exported_ids": ["a"], "last_run_ms": 5}), "utf-8")
            led = _ledger.load(root, "s")
            self.assertEqual(led["set_aside_ids"], [])
            self.assertEqual(led["exported_ids"], ["a"])

    def test_set_aside_ids_round_trip_and_are_not_exported(self):
        """⛔ HER RULING 2026-08-24: `Remember it's seen a video`. The two
        lists are SEPARATE — a set-aside item never arrived, so calling it
        exported would be a lie the rest of the room reads. Kept apart, a
        future release that DOES show video can replay this list."""
        with tempfile.TemporaryDirectory() as root:
            _ledger.save(root, "s", {"exported_ids": ["a"],
                                     "set_aside_ids": ["v1", "v2"],
                                     "last_run_ms": 9})
            led = _ledger.load(root, "s")
            self.assertEqual(led["exported_ids"], ["a"])
            self.assertEqual(led["set_aside_ids"], ["v1", "v2"])

    def test_new_ids_excludes_what_was_set_aside(self):
        """⛔⛔ THE DEFECT SHE HIT, PINNED. A skipped video was recorded
        NOWHERE, so it stayed permanently new: every landing gather
        re-attempted all 598 of her videos, took ~20 minutes, delivered
        nothing, and the candle REFUSED for the whole of it. Every visit,
        for ever."""
        led = {"exported_ids": ["a"], "set_aside_ids": ["v1"],
               "last_run_ms": None}
        self.assertEqual(_ledger.new_ids(led, ["a", "v1", "b"]), ["b"])

    def test_a_failure_is_NOT_set_aside_so_it_is_retried(self):
        """⛔ THE SAFETY OF THE WHOLE CHANGE, AND THE REASON IT IS NARROW.
        Only a VIDEO is remembered. A transient failure — Photos wedged, a
        missing file, an oversize rendition — stays out of BOTH lists so a
        later pull retries it and a photograph of hers can never be silently
        dropped."""
        led = {"exported_ids": [], "set_aside_ids": [], "last_run_ms": None}
        self.assertEqual(_ledger.new_ids(led, ["failed-once"]),
                         ["failed-once"])

    def test_save_then_load_round_trips(self):
        # ⚠ The payload now carries BOTH lists (her 2026-08-24 ruling). A
        # payload saved WITHOUT the second list is covered by its own case
        # above — it reads back with an empty one rather than losing the key.
        with tempfile.TemporaryDirectory() as tmp:
            payload = {"exported_ids": ["a", "b", "c"],
                       "set_aside_ids": [], "last_run_ms": 123}
            _ledger.save(tmp, "apple-notes", payload)
            self.assertEqual(_ledger.load(tmp, "apple-notes"), payload)

    def test_ledger_path_is_exactly_under_adapters_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            _ledger.save(tmp, "apple-notes",
                         {"exported_ids": [], "set_aside_ids": [], "last_run_ms": None})
            expected = Path(tmp) / "adapters" / "apple-notes" / "ledger.json"
            self.assertTrue(expected.is_file(),
                            "ledger lives at "
                            "<library_root>/adapters/apple-notes/ledger.json")

    def test_new_ids_returns_only_absent_ids(self):
        ledger = {"exported_ids": ["a", "b"], "last_run_ms": None}
        self.assertEqual(
            _ledger.new_ids(ledger, ["a", "b", "c", "d"]), ["c", "d"],
            "new_ids drops ids already in exported_ids, keeps order")


class TestStableIdDedup(unittest.TestCase):
    """Test 5 — ADP-03: a second collect with no new note ids imports 0 cards."""

    def test_second_collect_imports_zero_new_cards(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"

            first = _collect_cycle(lib)
            self.assertEqual(first["imported"], len(osascript_mock.SAMPLE_NOTES),
                             "the first collect imports every canned note")

            # the ledger now holds every exported note id
            ledger = _ledger.load(lib, apple_notes.SOURCE)
            self.assertEqual(
                sorted(ledger["exported_ids"]),
                sorted(n["id"] for n in osascript_mock.SAMPLE_NOTES),
                "every exported id is committed to the ledger")

            second = _collect_cycle(lib)
            self.assertEqual(
                second["imported"], 0,
                "a re-pull with no NEW note ids imports 0 cards — the "
                "stable-id ledger is the dedup key, not content bytes")


if __name__ == "__main__":
    unittest.main()
