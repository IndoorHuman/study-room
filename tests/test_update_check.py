#!/usr/bin/env python3
"""UPD-13 / UPD-14 (26.9997, D-04..D-09, D-16): the daily check.

Wave-0 Nyquist instrument. At the commit that adds it the symbols it drives
(`study_lib._update_transport`, `record_update_consent`, `UPDATE_HEADERS`,
`LAST_UPDATE_CHECK_NAME`, `UPDATE_CHECK_LOG_NAME`, `RELEASES_LATEST_URL`)
do not exist, so it fails with NOT_YET rather than passing vacuously. Plan
26.9997-02 turns it green.

What it proves, once green, all through `server.StudyHandler.handle_status`
driven in-process with a fake transport:
  (a) stamped + consented + no last_update_check -> exactly one transport
      call, and `~/.study-room/latest_release_date` holds the tag (D-05, D-07);
  (b) a second status call the same day -> no new call (D-04);
  (c) last_update_check = yesterday -> one call;
  (d) an UNSTAMPED tree, even consented -> zero calls (D-09: the dev gate
      sits before the consent read);
  (e) a failed check (no answer / 404 / not JSON / a tag that is not a date)
      writes NO pointer, ONE line in update_check.log, leaves the payload
      without a prompt, and STILL writes last_update_check (the attempt is
      what the daily gate counts, D-16);
  (f) latest <= stamp keeps show_update_prompt False (D-08, reusing
      compute_show_update_prompt);
  (g) the request carries exactly UPDATE_HEADERS and a URL with no query
      string (D-06).

Hermetic: temp HOME (the room refuses to run if its config dir resolves
outside it), temp app tree, fake transport, no socket, no real key read.

Run: HOME="$(mktemp -d)" python3 tests/test_update_check.py
"""

from __future__ import annotations

import contextlib
import datetime
import json
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

# CAPTURED AT IMPORT, BEFORE ANY CASE MOVES THE HOME DIRECTORY.
REAL_HOME = os.path.expanduser("~")
REAL_ROOM_DIR = os.path.join(REAL_HOME, study_lib.ROOM_CONFIG_DIR_NAME)
REAL_ROOM_DIR_EXISTED = os.path.exists(REAL_ROOM_DIR)

LOCAL_STAMP = "2026-08-30"
NEWER_TAG = "2026-09-15"


@contextlib.contextmanager
def temp_home():
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-update-check-")
    os.environ["HOME"] = tmp
    try:
        resolved = str(study_lib.room_config_dir())
        if (not resolved.startswith(str(Path(tmp).resolve()) + os.sep)
                and not resolved.startswith(tmp + os.sep)):
            raise AssertionError(
                "room config resolved outside temporary home - refusing to run")
        yield Path(tmp)
    finally:
        if prior is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = prior
        shutil.rmtree(tmp, ignore_errors=True)


def write_stamp(tree: Path, name: str, value: str) -> None:
    (tree / name).write_text(value + "\n", encoding="utf-8")


def release_body(tag) -> bytes:
    return json.dumps({
        "tag_name": tag,
        "name": "Study Room %s" % tag,
        "assets": [{"name": "study-room-%s.zip" % tag,
                    "browser_download_url":
                        "https://example.invalid/study-room-%s.zip" % tag}],
        "zipball_url": "https://example.invalid/zipball/%s" % tag,
    }).encode("utf-8")


class DailyCheckContract(unittest.TestCase):

    def require(self, module, name, plan="02"):
        if not hasattr(module, name):
            self.fail("NOT_YET: %s.%s (plan 26.9997-%s)"
                      % (module.__name__, name, plan))

    # -- fixtures ------------------------------------------------------------

    def make_tree(self, stamp=LOCAL_STAMP) -> Path:
        tree = Path(tempfile.mkdtemp(prefix="studyroom-update-check-tree-"))
        self.addCleanup(lambda: shutil.rmtree(tree, ignore_errors=True))
        if stamp:
            write_stamp(tree, study_lib.RELEASE_DATE_NAME, stamp)
        return tree

    def config_file(self, name) -> Path:
        return study_lib.room_config_dir() / name

    def write_config_line(self, name, value):
        study_lib.ensure_room_config_dir()
        self.config_file(name).write_text(value + "\n", encoding="utf-8")

    def read_config_line(self, name):
        path = self.config_file(name)
        if not path.is_file():
            return None
        lines = path.read_text(encoding="utf-8").strip().splitlines()
        return lines[0].strip() if lines else None

    def capture(self, answer):
        """Fake the ONE transport seam; record (url, headers) per call."""
        self.require(study_lib, "_update_transport")
        seen = []

        def fake(url, headers, timeout_s, max_bytes=None):
            seen.append((url, dict(headers or {})))
            return answer

        saved = study_lib._update_transport
        study_lib._update_transport = fake
        self.addCleanup(lambda: setattr(study_lib, "_update_transport", saved))
        return seen

    def consent(self):
        self.require(study_lib, "record_update_consent")
        study_lib.record_update_consent("yes")

    def drive_status(self, home: Path, tree: Path):
        import server  # noqa: E402  (after the HOME swap)

        class FakeServer(object):
            def __init__(self):
                self.library_root = home / "lib"
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

        fake = StatusFake()
        with mock.patch.object(server, "REPO_ROOT", tree):
            server.StudyHandler.handle_status(fake)
        self.assertIsNotNone(fake.answer, "status answered nothing")
        return fake.answer

    def urls(self, seen):
        return [u for (u, _h) in seen]

    def today(self):
        return datetime.date.today().isoformat()

    # -- (a) one call, pointer written -------------------------------------

    def test_first_open_of_the_day_makes_one_call_and_writes_the_pointer(self):
        with temp_home() as home:
            tree = self.make_tree()
            self.consent()
            seen = self.capture((200, {}, release_body(NEWER_TAG)))
            self.require(study_lib, "RELEASES_LATEST_URL")
            self.require(study_lib, "LAST_UPDATE_CHECK_NAME")
            payload = self.drive_status(home, tree)
            self.assertEqual(self.urls(seen), [study_lib.RELEASES_LATEST_URL])
            # D-07: the SAME file the behind-latest line already reads.
            self.assertEqual(study_lib.read_latest_release_date(), NEWER_TAG)
            self.assertEqual(payload.get("latest_release_date"), NEWER_TAG)
            self.assertTrue(payload.get("show_update_prompt"))
            self.assertEqual(
                self.read_config_line(study_lib.LAST_UPDATE_CHECK_NAME),
                self.today())
            self.assertEqual(study_lib.LAST_UPDATE_CHECK_NAME,
                             "last_update_check")

    # -- (b) same day, no second call --------------------------------------

    def test_a_second_open_the_same_day_makes_no_call(self):
        with temp_home() as home:
            tree = self.make_tree()
            self.consent()
            seen = self.capture((200, {}, release_body(NEWER_TAG)))
            self.drive_status(home, tree)
            self.drive_status(home, tree)
            self.drive_status(home, tree)
            self.assertEqual(self.urls(seen), [study_lib.RELEASES_LATEST_URL],
                             "the room asked more than once in one day (D-04)")

    # -- (c) yesterday, one call -------------------------------------------

    def test_a_check_dated_yesterday_lets_todays_open_ask_once(self):
        with temp_home() as home:
            tree = self.make_tree()
            self.consent()
            self.require(study_lib, "LAST_UPDATE_CHECK_NAME")
            yesterday = (datetime.date.today()
                         - datetime.timedelta(days=1)).isoformat()
            self.write_config_line(study_lib.LAST_UPDATE_CHECK_NAME, yesterday)
            seen = self.capture((200, {}, release_body(NEWER_TAG)))
            self.drive_status(home, tree)
            self.assertEqual(self.urls(seen), [study_lib.RELEASES_LATEST_URL])
            self.assertEqual(
                self.read_config_line(study_lib.LAST_UPDATE_CHECK_NAME),
                self.today())

    # -- (d) dev tree: silent even with consent ----------------------------

    def test_an_unstamped_tree_never_asks_even_with_consent(self):
        with temp_home() as home:
            tree = self.make_tree(stamp=None)
            self.consent()
            self.require(study_lib, "LAST_UPDATE_CHECK_NAME")
            seen = self.capture((200, {}, release_body(NEWER_TAG)))
            payload = self.drive_status(home, tree)
            self.assertEqual(self.urls(seen), [],
                             "a dev tree reached out (D-09)")
            self.assertIsNone(study_lib.read_latest_release_date())
            self.assertIsNone(
                self.read_config_line(study_lib.LAST_UPDATE_CHECK_NAME),
                "a dev tree counted an attempt it must never make")
            self.assertFalse(payload.get("show_update_prompt"))
            self.assertNotEqual(payload.get("update_install_ready"), True)

    # -- (e) a failed check says nothing, logs one line, counts the day ----

    def test_a_failed_check_is_silent_logged_and_still_counts_the_day(self):
        answers = {
            "no answer": (None, {}, b""),
            "404": (404, {}, b"not found"),
            "not json": (200, {}, b"<html>rate limited</html>"),
            "tag not a date": (200, {}, release_body("v1.2.3")),
            "tag missing": (200, {}, json.dumps({"name": "x"}).encode()),
        }
        for label, answer in answers.items():
            with self.subTest(label):
                with temp_home() as home:
                    tree = self.make_tree()
                    self.consent()
                    self.require(study_lib, "LAST_UPDATE_CHECK_NAME")
                    self.require(study_lib, "UPDATE_CHECK_LOG_NAME")
                    seen = self.capture(answer)
                    payload = self.drive_status(home, tree)
                    self.assertEqual(self.urls(seen),
                                     [study_lib.RELEASES_LATEST_URL])
                    self.assertIsNone(study_lib.read_latest_release_date(),
                                      "a failed check wrote the pointer")
                    self.assertFalse(
                        self.config_file(study_lib.LAST_LATEST_RELEASE_NAME)
                        .exists())
                    self.assertFalse(payload.get("show_update_prompt"))
                    self.assertNotEqual(payload.get("update_install_ready"),
                                        True)
                    self.assertIsNone(payload.get("update_result"))
                    log = self.config_file(study_lib.UPDATE_CHECK_LOG_NAME)
                    self.assertTrue(log.is_file(),
                                    "a failed check left no local line")
                    lines = [ln for ln in
                             log.read_text(encoding="utf-8").splitlines()
                             if ln.strip()]
                    self.assertEqual(len(lines), 1, lines)
                    self.assertEqual(
                        self.read_config_line(study_lib.LAST_UPDATE_CHECK_NAME),
                        self.today(),
                        "the attempt must count so the room tries another "
                        "day, not another minute (D-16)")
                    self.assertEqual(study_lib.UPDATE_CHECK_LOG_NAME,
                                     "update_check.log")
                    # And the failed check asks no second time today.
                    self.drive_status(home, tree)
                    self.assertEqual(self.urls(seen),
                                     [study_lib.RELEASES_LATEST_URL])

    def test_the_failure_log_is_capped(self):
        with temp_home():
            self.require(study_lib, "append_update_check_log")
            self.require(study_lib, "UPDATE_CHECK_LOG_NAME")
            for i in range(3000):
                study_lib.append_update_check_log("why number %d" % i)
            size = self.config_file(study_lib.UPDATE_CHECK_LOG_NAME).stat().st_size
            self.assertLessEqual(size, 64 * 1024,
                                 "the local failure log grows without bound")

    # -- (f) never older-or-equal ------------------------------------------

    def test_latest_older_or_equal_keeps_the_line_silent(self):
        self.assertFalse(study_lib.compute_show_update_prompt(
            LOCAL_STAMP, LOCAL_STAMP))
        self.assertFalse(study_lib.compute_show_update_prompt(
            LOCAL_STAMP, "2026-08-01"))
        self.assertTrue(study_lib.compute_show_update_prompt(
            LOCAL_STAMP, NEWER_TAG))
        with temp_home() as home:
            tree = self.make_tree()
            self.consent()
            self.capture((200, {}, release_body("2026-08-01")))
            payload = self.drive_status(home, tree)
            # The check may remember what Latest says (a withdrawn release
            # moves Latest back); the LINE stays silent (D-08).
            self.assertFalse(payload.get("show_update_prompt"))
            self.assertNotEqual(payload.get("update_install_ready"), True)
            self.assertNotIn("update_cli", payload)

    # -- (g) the request carries nothing of theirs -------------------------

    def test_the_request_carries_exactly_the_fixed_headers_and_no_query(self):
        with temp_home() as home:
            tree = self.make_tree()
            self.consent()
            self.require(study_lib, "UPDATE_HEADERS")
            seen = self.capture((200, {}, release_body(NEWER_TAG)))
            self.drive_status(home, tree)
            self.assertEqual(len(seen), 1, seen)
            url, headers = seen[0]
            self.assertEqual(headers, dict(study_lib.UPDATE_HEADERS))
            self.assertEqual(
                dict(study_lib.UPDATE_HEADERS),
                {"User-Agent": "study-room",
                 "Accept": "application/vnd.github+json"})
            self.assertNotIn("?", url)
            self.assertNotIn(LOCAL_STAMP, url)
            self.assertEqual(
                url, "https://%s/repos/IndoorHuman/study-room/releases/latest"
                % study_lib.UPDATE_SOURCE_HOST)
            for value in headers.values():
                self.assertNotIn(LOCAL_STAMP, value)

    # -- the real directory --------------------------------------------------

    def test_the_real_config_directory_is_exactly_as_this_suite_found_it(self):
        self.assertEqual(os.path.exists(REAL_ROOM_DIR), REAL_ROOM_DIR_EXISTED,
                         "this suite touched the real config directory - only "
                         "--setup, run by the owner, may create it")


if __name__ == "__main__":
    unittest.main()
