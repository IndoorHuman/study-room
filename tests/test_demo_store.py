#!/usr/bin/env python3
"""
test_demo_store.py — Mansfield demo-store shape + fenced-safety + raw-holdout
staging (Phase 27-02, D-06 / D-08 / D-20 / T-27-04).

Hermetic: builds into a temp dir only — never mutates ~/StudyRoom or any
live library. Stdlib unittest + study_lib + tools/build_demo_store.
"""
from __future__ import annotations

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
_TOOLS = _REPO_ROOT / "tools"
if str(_TOOLS) not in sys.path:
    sys.path.insert(0, str(_TOOLS))

import study_lib  # noqa: E402
import build_demo_store as demo  # noqa: E402

# Raw holdout shapes from mansfield-vault-build/RAW-HOLDOUT.md — one known
# filename per shape so the staging assertion is concrete.
HOLDOUT_SHAPES = {
    "bare": "Untitled 1.md",
    "wall": "Untitled.md",
    "stale-frontmatter": "Untitled 2.md",
}


class DemoStoreShapeTest(unittest.TestCase):
    """Offline-render + safety shape of the Mansfield demo store."""

    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory(prefix="demo-store-test-")
        cls.dest = Path(cls._tmp.name) / "StudyRoomDemo"
        cls.vault = demo.resolve_vault()
        demo.build_demo_store(cls.dest, cls.vault)
        cls.store = study_lib.load_store(cls.dest)

    @classmethod
    def tearDownClass(cls):
        cls._tmp.cleanup()

    def test_mixed_blessed_and_unseen(self):
        items = list(self.store["items"].values())
        blessed = [i for i in items if i.get("state") == "blessed"]
        unseen = [i for i in items if i.get("state") == "unseen"]
        self.assertGreaterEqual(len(blessed), 1, "need ≥1 blessed item")
        self.assertGreaterEqual(len(unseen), 1, "need ≥1 unseen (pile) item")

    def test_offline_reflection_under_librarian(self):
        librarian = self.dest / "librarian"
        self.assertTrue(librarian.is_dir())
        found = False
        for p in librarian.rglob("*.md"):
            text = p.read_text(encoding="utf-8")
            if (text.startswith("---")
                    and "reflects:" in text
                    and "type: note" in text
                    and "journal-reflection" in text):
                found = True
                break
        self.assertTrue(
            found,
            "librarian/ must hold ≥1 pre-generated reflection in "
            "_reflection_frontmatter shape")

    def test_desk_note_present(self):
        note = (self.dest / "librarian" / "notes"
                / f"{demo.DEMO_DAY}-note.md")
        self.assertTrue(note.is_file(), f"missing desk note {note}")
        body = note.read_text(encoding="utf-8").strip()
        self.assertGreater(len(body), 20)

    def test_zero_fenced_journal_blessed(self):
        """T-27-04 / law 5 — demo must never bless Journal/."""
        leaks = [
            i for i in self.store["items"].values()
            if i.get("state") == "blessed" and demo.is_fenced_journal(i)
        ]
        self.assertEqual(
            leaks, [],
            f"blessed fenced-Journal items: "
            f"{[i.get('title') for i in leaks]}")

    def test_raw_holdout_staged_not_preblessed(self):
        """D-20: holdout exists with three shapes; not imported as blessed."""
        holdout = demo.DEFAULT_HOLDOUT
        self.assertTrue(
            holdout.is_dir(),
            f"raw holdout missing at {holdout} — demo processing beat")
        for shape, filename in HOLDOUT_SHAPES.items():
            path = holdout / filename
            self.assertTrue(
                path.is_file(),
                f"holdout missing {shape} fixture: {filename}")

        holdout_names = {p.name for p in holdout.iterdir() if p.is_file()}
        blessed_titles = {
            str(i.get("title") or "")
            for i in self.store["items"].values()
            if i.get("state") == "blessed"
        }
        # Holdout filenames are the cold-dump names; none may be pre-blessed.
        overlap = holdout_names & blessed_titles
        self.assertEqual(
            overlap, set(),
            f"raw holdout titles pre-blessed (must stay staged): {overlap}")

        # Stronger: no item origin under the holdout dir is blessed.
        holdout_resolved = str(holdout.resolve())
        for item in self.store["items"].values():
            if item.get("state") != "blessed":
                continue
            op = str(item.get("origin_path") or "")
            self.assertFalse(
                op.startswith(holdout_resolved) or "/mansfield-raw-holdout/" in op.replace("\\", "/"),
                f"blessed item originates in holdout: {op}")

    def test_idempotent_second_build(self):
        """Second run into the same dest does not duplicate items."""
        n1 = len(self.store["items"])
        demo.build_demo_store(self.dest, self.vault)
        store2 = study_lib.load_store(self.dest)
        self.assertEqual(len(store2["items"]), n1)
        problems = demo.self_check(self.dest)
        self.assertEqual(problems, [], problems)

    def test_temp_dir_only_never_live_library(self):
        """Guard: this suite's dest is under the temp root, not ~/StudyRoom."""
        live = Path.home() / "StudyRoom"
        self.assertNotEqual(self.dest.resolve(), live.resolve())
        self.assertTrue(
            str(self.dest.resolve()).startswith(str(Path(self._tmp.name).resolve())))


class HoldoutShapeContentTest(unittest.TestCase):
    """Confirm the three holdout shapes are distinguishable on disk."""

    def test_three_shapes_present(self):
        holdout = demo.DEFAULT_HOLDOUT
        if not holdout.is_dir():
            self.skipTest(f"holdout not at {holdout}")
        for shape, filename in HOLDOUT_SHAPES.items():
            text = (holdout / filename).read_text(encoding="utf-8")
            if shape == "bare":
                self.assertFalse(
                    text.lstrip().startswith("---"),
                    f"{filename} should be bare (no frontmatter)")
            elif shape == "stale-frontmatter":
                self.assertTrue(text.lstrip().startswith("---"))
                self.assertIn("published:", text)
            elif shape == "wall":
                # Wall = long undifferentiated block; at least one long line.
                lines = [ln for ln in text.splitlines() if ln.strip()]
                self.assertTrue(
                    any(len(ln) > 200 for ln in lines) or len(text) > 400,
                    f"{filename} should look like a wall of text")


if __name__ == "__main__":
    unittest.main()
