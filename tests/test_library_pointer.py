#!/usr/bin/env python3
"""UPD-01 / map #147 — library pointer lives under settings home.

Pointer must resolve via Path.home() → ~/.study-room/library.json so replacing
the app folder does not factory-reset where the library lives (D-08 / #147).

⛔ NEVER TOUCHES THE REAL HOME. Every case runs inside a temporary HOME and
refuses to yield unless `room_config_dir()` resolves inside it — the pointer
will sit beside keys/settings, which are real paid-key territory.

⛔ NO LIVE KEY IS READ, PRINTED, OR WRITTEN. No network.

Run: `HOME="$(mktemp -d)" python3 tests/test_library_pointer.py`
"""

from __future__ import annotations

import contextlib
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import study_lib  # noqa: E402

LIBRARY_POINTER_NAME = "library.json"
OWNER_COPY_POINTER_REFUSAL = ""  # plan 06 sitting — never agent prose


@contextlib.contextmanager
def temp_home():
    """Throwaway HOME with a structural guard on room_config_dir()."""
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-library-pointer-")
    os.environ["HOME"] = tmp
    try:
        resolved = str(study_lib.room_config_dir())
        if (not resolved.startswith(str(Path(tmp).resolve()) + os.sep)
                and not resolved.startswith(tmp + os.sep)):
            raise AssertionError(
                "the room's config directory resolved OUTSIDE the temporary "
                "home — refusing to run rather than write anywhere near a "
                "real one")
        yield Path(tmp)
    finally:
        if prior is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = prior
        shutil.rmtree(tmp, ignore_errors=True)


class LibraryPointerContract(unittest.TestCase):
    """UPD-01: pointer survives outside the replaceable app folder."""

    def test_library_pointer_path_helper_exists(self):
        with temp_home() as home:
            if not hasattr(study_lib, "library_pointer_path"):
                self.fail(
                    "NOT_YET: study_lib.library_pointer_path() — "
                    "pointer must live under room_config_dir() as "
                    + LIBRARY_POINTER_NAME)
            tip = study_lib.library_pointer_path()
            expected = study_lib.room_config_dir() / LIBRARY_POINTER_NAME
            self.assertEqual(Path(tip), Path(expected))
            self.assertTrue(
                str(Path(tip).resolve()).startswith(
                    str(Path(home).resolve()) + os.sep),
                "pointer path escaped the temporary HOME")
            # Production write home is settings dir, not the replaceable app folder.
            self.assertNotEqual(
                Path(tip).resolve().parent, REPO_ROOT.resolve())

    def test_write_persists_and_resolve_reads_settings_home(self):
        with temp_home() as home:
            import server  # noqa: E402 — after HOME swap
            tip = study_lib.library_pointer_path()
            lib = Path(home) / "MyLibrary"
            lib.mkdir()
            study_lib.ensure_room_config_dir()
            study_lib.atomic_write_bytes(
                str(tip),
                json.dumps({"library_root": str(lib)},
                           ensure_ascii=False, indent=1).encode("utf-8"))
            self.assertTrue(
                tip.resolve().is_relative_to(Path(home).resolve())
                if hasattr(Path, "is_relative_to")
                else str(tip.resolve()).startswith(
                    str(Path(home).resolve()) + os.sep))
            self.assertFalse(
                str(tip.resolve()).startswith(
                    str(REPO_ROOT.resolve()) + os.sep))
            # Fresh resolve — no in-memory cache of the pointer.
            root = server.resolve_library_root(
                tip, legacy_pointer=Path(home) / "absent-legacy.json")
            self.assertEqual(Path(root).resolve(), lib.resolve())

    def test_one_time_promote_from_legacy_then_independent(self):
        with temp_home() as home:
            import server  # noqa: E402
            tip = study_lib.library_pointer_path()
            self.assertFalse(tip.exists())
            legacy = Path(home) / "legacy-library.local.json"
            promoted_lib = Path(home) / "PromotedLib"
            promoted_lib.mkdir()
            legacy.write_text(
                json.dumps({"library_root": str(promoted_lib)},
                           ensure_ascii=False, indent=1),
                encoding="utf-8")
            root = server.resolve_library_root(tip, legacy_pointer=legacy)
            self.assertEqual(Path(root).resolve(), promoted_lib.resolve())
            self.assertTrue(tip.exists(), "promote must write settings-home pointer")
            cfg = json.loads(tip.read_text(encoding="utf-8"))
            self.assertEqual(
                Path(cfg["library_root"]).resolve(), promoted_lib.resolve())
            # Subsequent resolve does not need the legacy file.
            legacy.unlink()
            root2 = server.resolve_library_root(
                tip, legacy_pointer=Path(home) / "gone.json")
            self.assertEqual(Path(root2).resolve(), promoted_lib.resolve())

    def test_default_studyroom_when_no_pointer(self):
        with temp_home() as home:
            import server  # noqa: E402
            tip = study_lib.library_pointer_path()
            root = server.resolve_library_root(
                tip, legacy_pointer=Path(home) / "no-legacy.json")
            self.assertEqual(Path(root), Path(home) / "StudyRoom")

    def test_legacy_promote_refuses_relative_mynotes(self):
        with temp_home() as home:
            import server  # noqa: E402
            tip = study_lib.library_pointer_path()
            self.assertFalse(tip.exists())
            legacy = Path(home) / "legacy-library.local.json"
            legacy.write_text(
                json.dumps({"library_root": "./MyNotes"},
                           ensure_ascii=False, indent=1),
                encoding="utf-8")
            root = server.resolve_library_root(tip, legacy_pointer=legacy)
            self.assertEqual(Path(root), Path(home) / "StudyRoom")
            self.assertFalse(tip.exists(),
                             "relative legacy path must not promote pointer")

    def test_legacy_promote_refuses_under_repo(self):
        with temp_home() as home:
            import server  # noqa: E402
            tip = study_lib.library_pointer_path()
            self.assertFalse(tip.exists())
            legacy = Path(home) / "legacy-library.local.json"
            under = REPO_ROOT / "would-die-on-replace-promote"
            legacy.write_text(
                json.dumps({"library_root": str(under)},
                           ensure_ascii=False, indent=1),
                encoding="utf-8")
            root = server.resolve_library_root(tip, legacy_pointer=legacy)
            self.assertEqual(Path(root), Path(home) / "StudyRoom")
            self.assertFalse(tip.exists(),
                             "inside-REPO legacy path must not promote pointer")

    def test_owner_copy_slot_is_empty_until_sitting(self):
        # D-10: agents never invent front-facing refusal copy.
        self.assertEqual(OWNER_COPY_POINTER_REFUSAL, "")


if __name__ == "__main__":
    unittest.main()
