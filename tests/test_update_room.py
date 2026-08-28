#!/usr/bin/env python3
"""UPD-08/UPD-09 — update_room CLI contract (hermetic, temp HOME only).

Run: `HOME="$(mktemp -d)" python3 tests/test_update_room.py -v`
"""

from __future__ import annotations

import contextlib
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import study_lib  # noqa: E402

UPDATE_ROOM = REPO_ROOT / "tools" / "update_room.py"
RELEASE_DATE_NAME = study_lib.RELEASE_DATE_NAME
LATEST_RELEASE_DATE_NAME = study_lib.LATEST_RELEASE_DATE_NAME


@contextlib.contextmanager
def temp_home():
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-update-room-")
    os.environ["HOME"] = tmp
    try:
        resolved = str(study_lib.room_config_dir())
        if (not resolved.startswith(str(Path(tmp).resolve()) + os.sep)
                and not resolved.startswith(tmp + os.sep)):
            raise AssertionError(
                "room config resolved outside temporary home — refusing to run")
        yield Path(tmp)
    finally:
        if prior is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = prior
        shutil.rmtree(tmp, ignore_errors=True)


def run_update_room(*args: str, home: str | None = None) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    if home is not None:
        env["HOME"] = home
    return subprocess.run(
        [sys.executable, str(UPDATE_ROOM), *args],
        capture_output=True,
        text=True,
        env=env,
        cwd=str(REPO_ROOT),
    )


def write_stamp(tree: Path, name: str, value: str) -> None:
    (tree / name).write_text(value + "\n", encoding="utf-8")


class SyncLatestOnly(unittest.TestCase):
    """--sync-latest-only updates pointer without touching live dest."""

    def test_sync_latest_only_updates_pointer_dest_untouched(self):
        with temp_home() as home:
            old_app = Path(tempfile.mkdtemp(prefix="studyroom-old-app-"))
            downloaded = Path(tempfile.mkdtemp(prefix="studyroom-downloaded-"))
            try:
                write_stamp(old_app, RELEASE_DATE_NAME, "2026-08-01")
                marker = old_app / "still_running.txt"
                marker.write_text("old\n", encoding="utf-8")
                write_stamp(downloaded, RELEASE_DATE_NAME, "2026-09-15")
                write_stamp(downloaded, LATEST_RELEASE_DATE_NAME, "2026-09-15")

                result = run_update_room(
                    "--sync-latest-only",
                    "--source", str(downloaded),
                    home=str(home),
                )
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                self.assertTrue(marker.is_file())
                self.assertEqual(marker.read_text(encoding="utf-8"), "old\n")
                self.assertEqual(
                    study_lib.read_latest_release_date(), "2026-09-15")
                self.assertTrue(
                    study_lib.compute_show_update_prompt(
                        "2026-08-01", "2026-09-15"))
            finally:
                shutil.rmtree(old_app, ignore_errors=True)
                shutil.rmtree(downloaded, ignore_errors=True)

    def test_sync_latest_only_refuses_missing_latest(self):
        with temp_home() as home:
            downloaded = Path(tempfile.mkdtemp(prefix="studyroom-no-latest-"))
            try:
                write_stamp(downloaded, RELEASE_DATE_NAME, "2026-09-15")
                result = run_update_room(
                    "--sync-latest-only",
                    "--source", str(downloaded),
                    home=str(home),
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(LATEST_RELEASE_DATE_NAME, result.stderr)
            finally:
                shutil.rmtree(downloaded, ignore_errors=True)


class FullReplace(unittest.TestCase):
    """Full replace copies new tree into dest and refreshes pointer."""

    def test_full_replace_updates_dest_and_pointer(self):
        with temp_home() as home:
            old_app = Path(tempfile.mkdtemp(prefix="studyroom-old-live-"))
            new_app = Path(tempfile.mkdtemp(prefix="studyroom-new-tree-"))
            try:
                write_stamp(old_app, RELEASE_DATE_NAME, "2026-08-01")
                (old_app / "old_marker.txt").write_text("old\n", encoding="utf-8")
                write_stamp(new_app, RELEASE_DATE_NAME, "2026-09-20")
                write_stamp(new_app, LATEST_RELEASE_DATE_NAME, "2026-09-20")
                (new_app / "new_marker.txt").write_text("new\n", encoding="utf-8")

                result = run_update_room(
                    "--source", str(new_app),
                    "--dest", str(old_app),
                    home=str(home),
                )
                self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
                self.assertFalse((old_app / "old_marker.txt").exists())
                self.assertTrue((old_app / "new_marker.txt").is_file())
                self.assertEqual(
                    (old_app / RELEASE_DATE_NAME).read_text(encoding="utf-8").strip(),
                    "2026-09-20")
                self.assertEqual(
                    study_lib.read_latest_release_date(), "2026-09-20")
            finally:
                shutil.rmtree(old_app, ignore_errors=True)
                shutil.rmtree(new_app, ignore_errors=True)

    def test_full_replace_refuses_missing_dest(self):
        with temp_home() as home:
            new_app = Path(tempfile.mkdtemp(prefix="studyroom-new-only-"))
            missing = Path(tempfile.mkdtemp(prefix="studyroom-missing-dest-"))
            shutil.rmtree(missing)
            try:
                write_stamp(new_app, RELEASE_DATE_NAME, "2026-09-20")
                write_stamp(new_app, LATEST_RELEASE_DATE_NAME, "2026-09-20")
                result = run_update_room(
                    "--source", str(new_app),
                    "--dest", str(missing),
                    home=str(home),
                )
                self.assertNotEqual(result.returncode, 0)
            finally:
                shutil.rmtree(new_app, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
