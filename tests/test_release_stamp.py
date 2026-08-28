#!/usr/bin/env python3
"""UPD-03 / UPD-04 / map #141 #145 — publish-only date stamp reader.

Dev trees carry no version; released trees read one line `YYYY-MM-DD` from
RELEASE_DATE. Manage + librarian share one reader (`read_release_stamp`).

Pinned names (do not invent a second spelling):
  RELEASE_DATE_NAME = "RELEASE_DATE"
  WHATS_NEW_NAME = "WHATS_NEW.md"

⛔ NEVER TOUCHES THE REAL HOME when probing settings. No live key. No network.

Run: `python3 tests/test_release_stamp.py`
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
WHATS_NEW_NAME = "WHATS_NEW.md"
OWNER_COPY_WHATS_NEW = (
    "Updates replace the app folder only. Your library stays in its own "
    "folder, outside the app.")


@contextlib.contextmanager
def temp_home():
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-release-stamp-")
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


class ReleaseStampContract(unittest.TestCase):
    """UPD-03/04: stamp absent in bare checkout; one shared reader."""

    def test_bare_checkout_has_no_tracked_release_date(self):
        stamp = REPO_ROOT / RELEASE_DATE_NAME
        # Private/dev tree must not ship a released stamp (D-03).
        if stamp.exists():
            self.fail(
                "RELEASE_DATE must not exist in the private checkout — "
                "it is a publish-only artifact")
        if not hasattr(study_lib, "read_release_stamp"):
            self.fail(
                "NOT_YET: study_lib.read_release_stamp — Manage + librarian "
                "must share one stamp reader (UPD-03/04); bare tree returns "
                "None/absent")
        self.assertIsNone(study_lib.read_release_stamp(REPO_ROOT))

    def test_reader_returns_none_without_stamp(self):
        with temp_home():
            if not hasattr(study_lib, "read_release_stamp"):
                self.fail(
                    "NOT_YET: read_release_stamp helper for absent stamp")
            bare = Path(tempfile.mkdtemp(prefix="studyroom-stamp-bare-"))
            try:
                self.assertIsNone(study_lib.read_release_stamp(bare))
            finally:
                shutil.rmtree(bare, ignore_errors=True)

    def test_reader_returns_stamp_when_present(self):
        with temp_home():
            if not hasattr(study_lib, "read_release_stamp"):
                self.fail(
                    "NOT_YET: read_release_stamp helper for present stamp")
            tree = Path(tempfile.mkdtemp(prefix="studyroom-stamp-present-"))
            try:
                (tree / RELEASE_DATE_NAME).write_text(
                    "2026-09-01\n", encoding="utf-8")
                self.assertEqual(
                    study_lib.read_release_stamp(tree), "2026-09-01")
            finally:
                shutil.rmtree(tree, ignore_errors=True)

    def test_status_exposes_release_date_null_when_absent(self):
        """handle_status carries release_date from the one reader (D-03)."""
        with temp_home() as home:
            import server  # noqa: E402 — after HOME swap

            if not hasattr(study_lib, "read_release_stamp"):
                self.fail("NOT_YET: read_release_stamp for status payload")

            class FakeServer(object):
                def __init__(self):
                    self.library_root = Path(home) / "lib"
                    self.library_root.mkdir()

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

            fake = StatusFake()
            with mock.patch.object(
                    study_lib, "read_release_stamp", return_value=None):
                server.StudyHandler.handle_status(fake)
            self.assertIsNotNone(fake.answer, "NOT_YET: status payload")
            self.assertIn(
                "release_date", fake.answer,
                "NOT_YET: status.release_date from read_release_stamp")
            self.assertIsNone(fake.answer["release_date"])

    def test_status_exposes_release_date_when_stamped(self):
        with temp_home() as home:
            import server  # noqa: E402

            if not hasattr(study_lib, "read_release_stamp"):
                self.fail("NOT_YET: read_release_stamp for status payload")

            class FakeServer(object):
                def __init__(self):
                    self.library_root = Path(home) / "lib"
                    self.library_root.mkdir()

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

            fake = StatusFake()
            with mock.patch.object(
                    study_lib, "read_release_stamp",
                    return_value="2026-09-01"):
                server.StudyHandler.handle_status(fake)
            self.assertEqual(fake.answer.get("release_date"), "2026-09-01")

    def test_whats_new_pins_sitting(self):
        import server  # noqa: E402
        self.assertEqual(server.OWNER_COPY_VERSION_ABSENT,
                         "This copy has no release date yet.")
        whats_new = REPO_ROOT / WHATS_NEW_NAME
        self.assertTrue(whats_new.is_file())
        self.assertIn(
            "Updates replace the app folder only",
            whats_new.read_text(encoding="utf-8"))
        self.assertEqual(WHATS_NEW_NAME, "WHATS_NEW.md")


class LibrarianVersionAskContract(unittest.TestCase):
    """UPD-04 / #145: version-intent asks answer locally — no model spend."""

    def _fake(self, home):
        import server  # noqa: E402

        class FakeServer(object):
            def __init__(self):
                self.library_root = Path(home) / "lib"
                self.library_root.mkdir(exist_ok=True)

        class AskFake(object):
            def __init__(self):
                self.answer = None
                self.code = None
                self.server = FakeServer()

            def store_or_fresh(self):
                return {"schema_version": study_lib.SCHEMA_VERSION,
                        "meta": {"librarian_enabled": True}, "items": {}}

            def json_response(self, data, code=200):
                self.answer = data
                self.code = code
                return data

            def json_error(self, code, msg):
                return self.json_response({"ok": False, "error": msg},
                                         code=code)

        return server, AskFake()

    def test_version_ask_short_circuits_without_worker_or_record_call(self):
        with temp_home() as home:
            server, fake = self._fake(home)
            if not hasattr(server, "is_version_intent_ask"):
                self.fail(
                    "NOT_YET: is_version_intent_ask — deterministic local "
                    "matcher before the cloud worker (D-03 / #145)")
            self.assertTrue(
                server.is_version_intent_ask("what version is this?"))
            started = {"thread": 0, "record": 0}

            def boom_thread(*_a, **_k):
                started["thread"] += 1
                raise AssertionError("worker must not start on version ask")

            def boom_record(*_a, **_k):
                started["record"] += 1
                raise AssertionError("record_call must not run on version ask")

            with mock.patch.object(server.threading, "Thread",
                                   side_effect=boom_thread), \
                    mock.patch.object(server, "record_call",
                                      side_effect=boom_record), \
                    mock.patch.object(
                        study_lib, "read_release_stamp",
                        return_value="2026-09-01"):
                # Reset ask job to idle so busy gate is clear.
                with server.LIBRARIAN_LOCK:
                    server.ASK_JOB.update(
                        state="idle", message=None, changes=[],
                        disposition=None, topic=None, refusal=None,
                        refusal_why=None)
                    server.LIBRARIAN_JOB["state"] = "idle"
                server.StudyHandler.handle_librarian_ask(
                    fake, {"text": "what version is this?"})
            self.assertEqual(started["thread"], 0)
            self.assertEqual(started["record"], 0)
            self.assertIsNotNone(fake.answer)
            self.assertTrue(fake.answer.get("ok"))
            self.assertTrue(fake.answer.get("running"))
            # Same string Manage would show — one reader.
            with server.LIBRARIAN_LOCK:
                job = dict(server.ASK_JOB)
            self.assertEqual(job.get("state"), "done")
            self.assertEqual(job.get("refusal"), "2026-09-01")
            self.assertEqual(job.get("refusal_why"), "version_local")

    def test_version_ask_absent_stamp_still_local(self):
        with temp_home() as home:
            server, fake = self._fake(home)
            if not hasattr(server, "is_version_intent_ask"):
                self.fail("NOT_YET: is_version_intent_ask")
            with mock.patch.object(server.threading, "Thread") as th, \
                    mock.patch.object(server, "record_call") as rc, \
                    mock.patch.object(
                        study_lib, "read_release_stamp", return_value=None):
                with server.LIBRARIAN_LOCK:
                    server.ASK_JOB.update(
                        state="idle", message=None, changes=[],
                        disposition=None, topic=None, refusal=None,
                        refusal_why=None)
                    server.LIBRARIAN_JOB["state"] = "idle"
                server.StudyHandler.handle_librarian_ask(
                    fake, {"text": "which version am I on?"})
            th.assert_not_called()
            rc.assert_not_called()
            with server.LIBRARIAN_LOCK:
                job = dict(server.ASK_JOB)
            self.assertEqual(job.get("state"), "done")
            self.assertEqual(job.get("refusal_why"), "version_local")
            self.assertEqual(
                job.get("refusal"), "This copy has no release date yet.")


if __name__ == "__main__":
    unittest.main()
