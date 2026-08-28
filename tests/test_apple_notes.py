#!/usr/bin/env python3
"""adapters/apple_notes.py unit tests (Phase 26.65, Plan 01 — ADP-01).

The Notes adapter is an export FRONT-END: it turns Apple Notes into a folder
the shipped importer already knows how to ingest (D-03). Its whole job is
"enumerate note ids -> export each body HTML -> convert to Markdown -> write a
path-safe `.md` into a staging dir". The importer does the rest, so notes land
as `unseen` with every solved edge case reused from upstream (law 2, D-04).

This suite pins (osascript mocked — no live Notes, no AppleEvents prompt):
  1. canned HTML note bodies convert to `.md` in staging; NO file with an HTML
     extension is ever written (`.html` is silently skipped by the importer —
     RESEARCH Pitfall 1 anti-pattern).
  2. after collect + import, every produced item is state=="unseen" and
     source=="folder-drop" (the staging dir is a plain folder to the importer;
     the origin marker does NOT change source).
  3. a note whose HTML carries headings/lists yields readable Markdown
     (## heading, - list item).
  4. mark_origin(store, staging) stamps from_source=="apple-notes" on exactly
     the items whose origin_path is under the staging dir; items outside are
     never marked; it is idempotent and never mutates source/title/state.

Stdlib only (unittest + tempfile) — zero-dependency law (law 8).
"""
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
from adapters import apple_notes  # noqa: E402
import osascript_mock  # noqa: E402


class TestNotesCollectToStaging(unittest.TestCase):
    """Tests 1 & 3 — export -> stdlib Markdown -> `.md` staging."""

    def test_bodies_convert_to_markdown_never_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()

            with osascript_mock.patch_osascript(apple_notes):
                exported = apple_notes.collect(lib, staging)

            self.assertEqual(sorted(exported),
                             sorted(n["id"] for n in osascript_mock.SAMPLE_NOTES),
                             "collect returns the exported ids to commit")

            staged = sorted(staging.rglob("*"))
            staged_files = [p for p in staged if p.is_file()]
            self.assertTrue(staged_files, "collect wrote files into staging")
            for p in staged_files:
                self.assertEqual(p.suffix, ".md",
                                 f"staging carries only .md, never HTML: {p.name}")
                self.assertNotIn("<", p.read_text(encoding="utf-8"),
                                 "the body HTML is converted, not dumped raw")

    def test_headings_and_lists_yield_readable_markdown(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()

            with osascript_mock.patch_osascript(apple_notes):
                apple_notes.collect(lib, staging)

            corpus = "\n".join(p.read_text(encoding="utf-8")
                               for p in staging.glob("*.md"))
            self.assertIn("## ", corpus, "an <h1>/<h2> becomes a Markdown heading")
            self.assertIn("- ", corpus, "an <li> becomes a Markdown list item")
            self.assertIn("apples", corpus, "list text survives the conversion")
            self.assertIn("&", corpus,
                          "HTML entities decode (&amp; -> &), never leak markup")


class TestNotesLandUnseen(unittest.TestCase):
    """Test 2 — D-04/law 2: imported notes are unseen, source folder-drop."""

    def test_collect_then_import_lands_unseen_folder_drop(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            staging = Path(tmp) / "staging"
            staging.mkdir()

            with osascript_mock.patch_osascript(apple_notes):
                apple_notes.collect(lib, staging)
            report = study_lib.import_folder(staging, lib)

            self.assertEqual(report["imported"],
                             len(osascript_mock.SAMPLE_NOTES))
            store = study_lib.load_store(lib)
            self.assertTrue(store["items"], "notes imported as items")
            for item in store["items"].values():
                self.assertEqual(item["state"], "unseen",
                                 "law 2: nothing is auto-blessed on import")
                self.assertEqual(item["source"], "folder-drop",
                                 "the staging dir is a plain folder to the "
                                 "importer; the marker does not change source")


class TestMarkOrigin(unittest.TestCase):
    """Test 4 — D-03-safe origin marker: from_source without forking importer."""

    def _store_with_notes_and_outsider(self, tmp):
        lib = Path(tmp) / "library"
        # an unrelated folder-drop item imported from OUTSIDE any staging dir
        outside = Path(tmp) / "outside"
        outside.mkdir()
        (outside / "old-note.md").write_bytes(b"# an older note\nnot from Notes\n")
        study_lib.import_folder(outside, lib)

        # the Notes collect into a fresh staging dir
        staging = Path(tmp) / "staging"
        staging.mkdir()
        with osascript_mock.patch_osascript(apple_notes):
            apple_notes.collect(lib, staging)
        study_lib.import_folder(staging, lib)
        return lib, staging, outside

    def test_marks_only_items_under_staging(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib, staging, _ = self._store_with_notes_and_outsider(tmp)
            store = study_lib.load_store(lib)

            marked = apple_notes.mark_origin(store, str(staging))
            self.assertEqual(marked, len(osascript_mock.SAMPLE_NOTES),
                             "every note this collect produced is marked")

            for item in store["items"].values():
                under = str(Path(item["origin_path"]).resolve()).startswith(
                    str(staging.resolve()))
                if under:
                    self.assertEqual(item.get("from_source"), "apple-notes",
                                     "items under staging carry the marker")
                else:
                    self.assertIsNone(item.get("from_source"),
                                      "the outsider item is never marked")

    def test_mark_origin_is_idempotent_and_non_mutating(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib, staging, _ = self._store_with_notes_and_outsider(tmp)
            store = study_lib.load_store(lib)

            before = {i: (v["source"], v["title"], v["state"])
                      for i, v in store["items"].items()}

            first = apple_notes.mark_origin(store, str(staging))
            snapshot = {i: dict(v) for i, v in store["items"].items()}
            second = apple_notes.mark_origin(store, str(staging))

            self.assertEqual(first, second, "the count is stable across calls")
            self.assertEqual(store["items"], snapshot,
                             "a second call changes nothing (idempotent)")
            for i, v in store["items"].items():
                self.assertEqual((v["source"], v["title"], v["state"]),
                                 before[i],
                                 "mark_origin never mutates source/title/state")


if __name__ == "__main__":
    unittest.main()
