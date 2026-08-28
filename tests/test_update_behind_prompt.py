#!/usr/bin/env python3
"""UPD-09 / map #145 — local behind-latest prompt policy (no network).

Pinned names (one spelling only):
  LATEST_RELEASE_DATE_NAME = "LATEST_RELEASE_DATE"  (publish artifact)
  LAST_LATEST_RELEASE_NAME = "latest_release_date"  (settings home pointer)

⛔ NEVER TOUCHES THE REAL HOME. temp_home guard mirrors pointer suite.

Run: `HOME="$(mktemp -d)" python3 tests/test_update_behind_prompt.py`
"""

from __future__ import annotations

import contextlib
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import study_lib  # noqa: E402

RELEASE_DATE_NAME = "RELEASE_DATE"
LATEST_RELEASE_DATE_NAME = "LATEST_RELEASE_DATE"
LAST_LATEST_RELEASE_NAME = "latest_release_date"


@contextlib.contextmanager
def temp_home():
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-behind-prompt-")
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


class ComputeShowUpdatePrompt(unittest.TestCase):
    """Truth table for behind-latest — orthogonal to show_whats_new."""

    def test_behind_latest_is_true(self):
        self.assertTrue(
            study_lib.compute_show_update_prompt("2026-08-01", "2026-09-01"))

    def test_equal_is_false(self):
        self.assertFalse(
            study_lib.compute_show_update_prompt("2026-09-01", "2026-09-01"))

    def test_local_newer_is_false(self):
        self.assertFalse(
            study_lib.compute_show_update_prompt("2026-10-01", "2026-09-01"))

    def test_missing_local_is_false(self):
        self.assertFalse(
            study_lib.compute_show_update_prompt(None, "2026-09-01"))
        self.assertFalse(
            study_lib.compute_show_update_prompt("", "2026-09-01"))

    def test_missing_latest_is_false(self):
        self.assertFalse(
            study_lib.compute_show_update_prompt("2026-09-01", None))
        self.assertFalse(
            study_lib.compute_show_update_prompt("2026-09-01", ""))

    def test_orthogonal_to_show_whats_new(self):
        """Behind prompt and quiet line use separate truth tables."""
        local = "2026-08-01"
        latest = "2026-09-01"
        remembered = "2026-07-01"
        self.assertTrue(
            study_lib.compute_show_update_prompt(local, latest))
        self.assertTrue(
            study_lib.compute_show_whats_new(latest, remembered))
        equal = "2026-09-01"
        self.assertFalse(
            study_lib.compute_show_update_prompt(equal, latest))
        self.assertFalse(
            study_lib.compute_show_whats_new(equal, equal))


class LatestPointerIO(unittest.TestCase):
    """Settings-home latest pointer read/write under throwaway HOME."""

    def test_constants_pinned(self):
        self.assertEqual(study_lib.LATEST_RELEASE_DATE_NAME,
                         LATEST_RELEASE_DATE_NAME)
        self.assertEqual(study_lib.LAST_LATEST_RELEASE_NAME,
                         LAST_LATEST_RELEASE_NAME)

    def test_read_returns_none_when_absent(self):
        with temp_home():
            self.assertIsNone(study_lib.read_latest_release_date())

    def test_write_and_read_round_trip(self):
        with temp_home() as home:
            study_lib.write_latest_release_date("2026-09-15")
            self.assertEqual(
                study_lib.read_latest_release_date(), "2026-09-15")
            path = home / ".study-room" / LAST_LATEST_RELEASE_NAME
            self.assertTrue(path.is_file())
            self.assertEqual(path.read_text(encoding="utf-8").strip(),
                             "2026-09-15")


class StatusBehindPrompt(unittest.TestCase):
    """handle_status exposes show_update_prompt + latest_release_date."""

    def _status_fake(self, home):
        import server  # noqa: E402

        class FakeServer(object):
            def __init__(self):
                self.library_root = Path(home) / "lib"
                self.library_root.mkdir(exist_ok=True)

        class StatusFake(object):
            def __init__(self):
                self.answer = None
                self.server = FakeServer()

            def store_or_fresh(self):
                return {"schema_version": study_lib.SCHEMA_VERSION,
                        "meta": {}, "items": {}}

            def json_response(self, data, code=200):
                self.answer = data
                return data

        return server, StatusFake()

    def test_status_behind_when_local_stamp_lags_pointer(self):
        with temp_home() as home:
            server, fake = self._status_fake(home)
            tree = Path(tempfile.mkdtemp(prefix="studyroom-behind-tree-"))
            try:
                (tree / RELEASE_DATE_NAME).write_text(
                    "2026-08-01\n", encoding="utf-8")
                study_lib.write_latest_release_date("2026-09-01")
                with mock.patch.object(server, "REPO_ROOT", tree):
                    server.StudyHandler.handle_status(fake)
            finally:
                shutil.rmtree(tree, ignore_errors=True)
            self.assertIsNotNone(fake.answer)
            self.assertIn("show_update_prompt", fake.answer)
            self.assertIn("latest_release_date", fake.answer)
            self.assertTrue(fake.answer["show_update_prompt"])
            self.assertEqual(fake.answer["latest_release_date"],
                             "2026-09-01")

    def test_status_not_behind_when_equal(self):
        with temp_home() as home:
            server, fake = self._status_fake(home)
            tree = Path(tempfile.mkdtemp(prefix="studyroom-equal-tree-"))
            try:
                (tree / RELEASE_DATE_NAME).write_text(
                    "2026-09-01\n", encoding="utf-8")
                study_lib.write_latest_release_date("2026-09-01")
                with mock.patch.object(server, "REPO_ROOT", tree):
                    server.StudyHandler.handle_status(fake)
            finally:
                shutil.rmtree(tree, ignore_errors=True)
            self.assertFalse(fake.answer["show_update_prompt"])

    def test_show_whats_new_unchanged_by_behind_fields(self):
        with temp_home() as home:
            server, fake = self._status_fake(home)
            tree = Path(tempfile.mkdtemp(prefix="studyroom-whatsnew-tree-"))
            try:
                (tree / RELEASE_DATE_NAME).write_text(
                    "2026-10-01\n", encoding="utf-8")
                study_lib.write_latest_release_date("2026-08-01")
                study_lib.remember_release_stamp("2026-07-01")
                with mock.patch.object(server, "REPO_ROOT", tree):
                    server.StudyHandler.handle_status(fake)
            finally:
                shutil.rmtree(tree, ignore_errors=True)
            self.assertIn("show_whats_new", fake.answer)
            self.assertTrue(fake.answer["show_whats_new"])
            self.assertFalse(fake.answer["show_update_prompt"])


if __name__ == "__main__":
    unittest.main()
