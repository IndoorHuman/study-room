#!/usr/bin/env python3
"""UPD-02 / map #147 — picker refuses relative and inside-REPO paths.

`handle_library` must require an absolute path after expanduser and refuse
anything equal to or under REPO_ROOT before mkdir (D-08 / #143 grief path).

⛔ NEVER TOUCHES THE REAL HOME. temp_home guard mirrors pointer suite.
⛔ NO LIVE KEY. No network. No write into ~/StudyRoom.

Run: `HOME="$(mktemp -d)" python3 tests/test_library_picker_refuse.py`
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

OWNER_COPY_PICKER_REFUSAL = (
    "That path cannot be your library. Choose a folder outside the Study "
    "Room app so replacing the app folder never touches your notes.")


@contextlib.contextmanager
def temp_home():
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-picker-refuse-")
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


class FakeServer(object):
    def __init__(self, root, config_path=None):
        self.library_root = Path(root)
        self.config_path = config_path


class LibraryFake(object):
    """Minimal stand-in so the real StudyHandler.handle_library can run."""

    def __init__(self, root, config_path=None):
        self.answer = None
        self.code = None
        self.server = FakeServer(root, config_path=config_path)

    def json_response(self, data, code=200):
        self.answer = data
        self.code = code
        return data

    def json_error(self, code, msg):
        return self.json_response({"ok": False, "error": msg}, code=code)


class LibraryPickerRefuseContract(unittest.TestCase):
    """UPD-02 / D-08: absolute-not-under-REPO refusal."""

    def test_refuse_library_path_helper_exists(self):
        with temp_home():
            refuse = getattr(study_lib, "refuse_library_path", None)
            if refuse is None:
                self.fail(
                    "NOT_YET: refuse_library_path (or handle_library absolute/"
                    "not-under-REPO_ROOT gate) — relative and inside-app "
                    "library paths must be refused (map #147 / D-08)")
            # Bare / relative
            self.assertTrue(refuse("MyLibrary", REPO_ROOT),
                            "bare name must be refused")
            self.assertTrue(refuse("./somewhere", REPO_ROOT),
                            "./ relative must be refused")
            self.assertTrue(refuse("../x", REPO_ROOT),
                            "../ relative must be refused")
            # Inside / equal REPO_ROOT
            self.assertTrue(
                refuse(str(REPO_ROOT / "would-die-on-replace"), REPO_ROOT),
                "path under REPO_ROOT must be refused")
            self.assertTrue(refuse(str(REPO_ROOT), REPO_ROOT),
                            "REPO_ROOT itself must be refused")

    def test_absolute_outside_repo_is_allowed(self):
        with temp_home() as home:
            refuse = getattr(study_lib, "refuse_library_path", None)
            if refuse is None:
                self.fail("NOT_YET: refuse_library_path")
            outside = Path(home) / "ok-library"
            self.assertFalse(
                refuse(str(outside), REPO_ROOT),
                "absolute path outside REPO_ROOT must be allowed")

    def test_handle_library_refuses_dot_slash_mynotes(self):
        with temp_home() as home:
            import server  # noqa: E402
            seed = Path(home) / "seed-lib"
            seed.mkdir()
            tip = study_lib.library_pointer_path()
            study_lib.ensure_room_config_dir()
            fake = LibraryFake(seed, config_path=tip)
            mynotes = Path(home) / "MyNotes-should-not-appear"
            before = mynotes.exists()
            server.StudyHandler.handle_library(fake, {"path": "./MyNotes"})
            self.assertEqual(fake.code, 400)
            self.assertFalse(fake.answer.get("ok", True))
            self.assertEqual(fake.answer.get("error"),
                             server.OWNER_COPY_LIBRARY_REFUSAL)
            self.assertEqual(mynotes.exists(), before,
                             "refused ./MyNotes must not mkdir")

    def test_handle_library_refuses_relative_without_mkdir(self):
        with temp_home() as home:
            import server  # noqa: E402
            seed = Path(home) / "seed-lib"
            seed.mkdir()
            tip = study_lib.library_pointer_path()
            study_lib.ensure_room_config_dir()
            fake = LibraryFake(seed, config_path=tip)
            # Bare name — refuse before any create under cwd/home.
            target_name = "MyLibrary-should-not-appear"
            cwd_candidate = Path.cwd() / target_name
            home_candidate = Path(home) / target_name
            before_cwd = cwd_candidate.exists()
            before_home = home_candidate.exists()
            server.StudyHandler.handle_library(fake, {"path": target_name})
            self.assertEqual(fake.code, 400)
            self.assertFalse(fake.answer.get("ok", True))
            err = fake.answer.get("error", "")
            import server  # noqa: E402
            self.assertEqual(err, server.OWNER_COPY_LIBRARY_REFUSAL)
            self.assertEqual(cwd_candidate.exists(), before_cwd,
                             "refused bare path must not mkdir under cwd")
            self.assertEqual(home_candidate.exists(), before_home,
                             "refused bare path must not mkdir under HOME")

    def test_handle_library_refuses_under_repo(self):
        with temp_home() as home:
            import server  # noqa: E402
            seed = Path(home) / "seed-lib"
            seed.mkdir()
            tip = study_lib.library_pointer_path()
            study_lib.ensure_room_config_dir()
            fake = LibraryFake(seed, config_path=tip)
            under = REPO_ROOT / "would-die-on-replace-suite"
            existed = under.exists()
            server.StudyHandler.handle_library(fake, {"path": str(under)})
            self.assertEqual(fake.code, 400)
            self.assertEqual(fake.answer.get("error"), server.OWNER_COPY_LIBRARY_REFUSAL)
            if not existed:
                self.assertFalse(
                    under.exists(),
                    "refused under-REPO path must not be created")

    def test_handle_library_accepts_absolute_outside_and_writes_pointer(self):
        with temp_home() as home:
            import server  # noqa: E402
            seed = Path(home) / "seed-lib"
            seed.mkdir()
            tip = study_lib.library_pointer_path()
            study_lib.ensure_room_config_dir()
            fake = LibraryFake(seed, config_path=tip)
            outside = Path(home) / "ok-absolute-lib"
            server.StudyHandler.handle_library(fake, {"path": str(outside)})
            self.assertEqual(fake.code, 200, fake.answer)
            self.assertTrue(fake.answer.get("ok"))
            self.assertTrue(outside.is_dir())
            self.assertTrue(tip.exists())
            cfg = json.loads(tip.read_text(encoding="utf-8"))
            self.assertEqual(
                Path(cfg["library_root"]).resolve(), outside.resolve())
            self.assertTrue(
                str(tip.resolve()).startswith(
                    str(Path(home).resolve()) + os.sep))

    def test_owner_copy_pins_sitting(self):
        import server  # noqa: E402
        self.assertEqual(OWNER_COPY_PICKER_REFUSAL, server.OWNER_COPY_LIBRARY_REFUSAL)
        self.assertTrue(server.OWNER_COPY_LIBRARY_REFUSAL)


if __name__ == "__main__":
    unittest.main()
