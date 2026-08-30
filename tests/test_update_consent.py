#!/usr/bin/env python3
"""UPD-11 / UPD-12 (26.9997, D-01..D-03): consent asked once, no request before yes.

Wave-0 Nyquist instrument. At the commit that adds it, every symbol it drives
(`study_lib._update_transport`, `study_lib.record_update_consent`,
`study_lib.update_consent_state`, `study_lib.RELEASES_LATEST_URL`,
`server.start_update_install`) is still missing, so the suite fails with
NOT_YET or AttributeError rather than passing vacuously. Plan 26.9997-02
turns the consent and check cases green; plan 26.9997-03 the install route.

What it proves, once green:
  (a) a stamped room with NO consent recorded makes ZERO requests through
      the one transport seam when its status is asked (asserted as a LIST,
      never a length), and the install route body makes zero too;
  (b) the POSITIVE CONTROL, in the SAME run: after `record_update_consent`
      says yes, the same status drive reaches exactly [RELEASES_LATEST_URL];
  (c) the record round trip: unasked -> yes -> consented (settings.json holds
      UPDATE_CONSENT_KEY == UPDATE_SOURCE_HOST, the host, never a boolean)
      -> no -> declined (key removed, UPDATE_CONSENT_ANSWER_KEY == "no")
      -> any other word is a no;
  (d) the answer lives in the settings home, so a NEW app folder with the
      same HOME still reads consented (a folder swap must not forget it);
  (e) the real ~/.study-room exists exactly as this suite found it.

Hermetic: every case runs under a temporary HOME (the room refuses to run if
its config directory resolves outside it), a temporary stamped app tree, and
a fake transport that opens no socket. A live paid key sits in the real
config directory on the owner's machine; this file never reads it.

Run: HOME="$(mktemp -d)" python3 tests/test_update_consent.py
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
    tmp = tempfile.mkdtemp(prefix="studyroom-update-consent-")
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


def stamped_tree(stamp: str = LOCAL_STAMP) -> Path:
    tree = Path(tempfile.mkdtemp(prefix="studyroom-update-consent-tree-"))
    write_stamp(tree, study_lib.RELEASE_DATE_NAME, stamp)
    return tree


def release_body(tag: str) -> bytes:
    return json.dumps({
        "tag_name": tag,
        "name": "Study Room " + tag,
        "assets": [{"name": "study-room-" + tag + ".zip",
                    "browser_download_url":
                        "https://example.invalid/study-room-" + tag + ".zip"}],
        "zipball_url": "https://example.invalid/zipball/" + tag,
    }).encode("utf-8")


class ConsentContract(unittest.TestCase):
    """UPD-11 / UPD-12: the record, and the zero before it."""

    def require(self, module, name, plan):
        if not hasattr(module, name):
            self.fail("NOT_YET: %s.%s (plan 26.9997-%s)"
                      % (module.__name__, name, plan))

    def capture_requests(self):
        """Replace the ONE function that opens a connection with a recorder.

        The assertion lives at the boundary, not at the callers: status,
        the install route and anything a later plan adds all pass through
        `study_lib._update_transport`, so one fake answers for all of them.
        """
        self.require(study_lib, "_update_transport", "02")
        seen = []

        def fake(url, headers, timeout_s, max_bytes=None):
            seen.append(url)
            return 200, {}, release_body(NEWER_TAG)

        saved = study_lib._update_transport
        study_lib._update_transport = fake
        self.addCleanup(lambda: setattr(study_lib, "_update_transport", saved))
        return seen

    def status_fake(self, home: Path):
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

        return server, StatusFake()

    def drive_status(self, home: Path, tree: Path):
        server, fake = self.status_fake(home)
        with mock.patch.object(server, "REPO_ROOT", tree):
            server.StudyHandler.handle_status(fake)
        return fake.answer

    def drive_install(self, home: Path, tree: Path):
        import server  # noqa: E402
        self.require(server, "start_update_install", "03")
        with mock.patch.object(server, "REPO_ROOT", tree):
            return server.start_update_install()

    def settings_on_disk(self):
        path = study_lib.settings_file_path()
        if not path.is_file():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    # -- (a) the zero, and (b) the positive control, in the same run ---------

    def test_no_request_of_any_kind_before_consent(self):
        with temp_home() as home:
            tree = stamped_tree()
            try:
                seen = self.capture_requests()
                self.require(study_lib, "update_consent_state", "02")
                self.assertEqual(study_lib.update_consent_state(),
                                 study_lib.UPDATE_CONSENT_STATE_UNASKED)
                self.drive_status(home, tree)
                self.drive_status(home, tree)
                # ASSERTED AS A LIST, NEVER AS A LENGTH: a length prints
                # "1 != 0"; the list prints where the room went.
                self.assertEqual(
                    seen, [],
                    "the room reached out before anyone said yes (D-03)")
                self.drive_install(home, tree)
                self.assertEqual(
                    seen, [],
                    "the install route reached out before anyone said yes")
            finally:
                shutil.rmtree(tree, ignore_errors=True)

    def test_with_consent_recorded_the_same_drive_reaches_exactly_the_latest_url(self):
        # THE POSITIVE CONTROL, IN THE SAME RUN AS THE ZERO ABOVE. Without
        # it, "zero requests" is equally satisfied by a code path that never
        # ran.
        with temp_home() as home:
            tree = stamped_tree()
            try:
                self.require(study_lib, "record_update_consent", "02")
                self.require(study_lib, "RELEASES_LATEST_URL", "02")
                seen = self.capture_requests()
                study_lib.record_update_consent("yes")
                self.drive_status(home, tree)
                self.assertEqual(
                    seen, [study_lib.RELEASES_LATEST_URL],
                    "the agreed address is not being used, or is being used "
                    "a different number of times than once per open")
                self.assertTrue(
                    study_lib.RELEASES_LATEST_URL.startswith(
                        "https://" + study_lib.UPDATE_SOURCE_HOST + "/"),
                    "the URL must be built from the ONE host the consent names")
            finally:
                shutil.rmtree(tree, ignore_errors=True)

    # -- (c) the record round trip -------------------------------------------

    def test_record_round_trip_unasked_yes_no_other(self):
        with temp_home():
            self.require(study_lib, "record_update_consent", "02")
            self.require(study_lib, "update_consent_state", "02")
            self.assertEqual(study_lib.update_consent_state(),
                             study_lib.UPDATE_CONSENT_STATE_UNASKED)
            self.assertEqual(self.settings_on_disk(), {})

            self.assertEqual(study_lib.record_update_consent("yes"),
                             study_lib.UPDATE_CONSENT_STATE_CONSENTED)
            self.assertEqual(study_lib.update_consent_state(),
                             study_lib.UPDATE_CONSENT_STATE_CONSENTED)
            on_disk = self.settings_on_disk()
            # THE VALUE IS THE HOST SHE AGREED TO, NEVER A BOOLEAN
            # (the base_consent precedent).
            self.assertEqual(on_disk.get(study_lib.UPDATE_CONSENT_KEY),
                             study_lib.UPDATE_SOURCE_HOST)
            self.assertEqual(study_lib.UPDATE_CONSENT_KEY, "update_check")
            self.assertEqual(study_lib.UPDATE_SOURCE_HOST, "api.github.com")

            self.assertEqual(study_lib.record_update_consent("no"),
                             study_lib.UPDATE_CONSENT_STATE_DECLINED)
            self.assertEqual(study_lib.update_consent_state(),
                             study_lib.UPDATE_CONSENT_STATE_DECLINED)
            on_disk = self.settings_on_disk()
            self.assertNotIn(study_lib.UPDATE_CONSENT_KEY, on_disk,
                             "a no must remove the earlier yes")
            self.assertEqual(on_disk.get(study_lib.UPDATE_CONSENT_ANSWER_KEY),
                             "no")
            self.assertEqual(study_lib.UPDATE_CONSENT_ANSWER_KEY,
                             "update_check_answer")

            # Only the yes token grants. Anything else is a no.
            for word in ("maybe", "YES ", "", None, True, 1):
                self.assertEqual(study_lib.record_update_consent(word),
                                 study_lib.UPDATE_CONSENT_STATE_DECLINED,
                                 "word %r was read as a yes" % (word,))
                self.assertNotIn(study_lib.UPDATE_CONSENT_KEY,
                                 self.settings_on_disk())

            # Nothing secret is ever written beside the answer.
            raw = study_lib.settings_file_path().read_text(encoding="utf-8")
            self.assertNotIn("key", raw.lower().replace("update_check", ""))

    def test_the_record_never_reads_a_boolean_or_another_host_as_yes(self):
        with temp_home():
            self.require(study_lib, "update_consent_state", "02")
            import librarian_call  # noqa: E402
            for planted in (True, "yes", "github.com", 1):
                librarian_call.save_settings(
                    {study_lib.UPDATE_CONSENT_KEY: planted})
                self.assertNotEqual(
                    study_lib.update_consent_state(),
                    study_lib.UPDATE_CONSENT_STATE_CONSENTED,
                    "a planted value %r read as consent" % (planted,))

    # -- (d) survives a folder swap ------------------------------------------

    def test_consent_survives_a_new_app_folder_with_the_same_home(self):
        with temp_home() as home:
            first = stamped_tree()
            second = stamped_tree()
            try:
                self.require(study_lib, "record_update_consent", "02")
                seen = self.capture_requests()
                study_lib.record_update_consent("yes")
                self.drive_status(home, first)
                self.assertEqual(seen, [study_lib.RELEASES_LATEST_URL])
                # A different app folder, the same settings home: still
                # consented (D-01), and the daily gate still holds (one call
                # per day, not one per folder).
                self.assertEqual(study_lib.update_consent_state(),
                                 study_lib.UPDATE_CONSENT_STATE_CONSENTED)
                self.drive_status(home, second)
                self.assertEqual(seen, [study_lib.RELEASES_LATEST_URL])
            finally:
                shutil.rmtree(first, ignore_errors=True)
                shutil.rmtree(second, ignore_errors=True)

    def test_install_route_answers_a_refusal_before_consent(self):
        """The tap path's own zero (D-03): with no consent recorded the
        install route body answers its refusal token and the seam records
        NOTHING, asserted as a LIST. The positive control for the seam
        lives in test_with_consent_recorded_... in this same run, and the
        tap path's own positive control (Latest URL then asset URL) lives
        in tests/test_update_install.py."""
        with temp_home() as home:
            tree = stamped_tree()
            try:
                seen = self.capture_requests()
                answer = self.drive_install(home, tree)
                self.assertIsInstance(answer, dict)
                self.assertEqual(answer.get("refused"), "no_consent")
                self.assertEqual(
                    seen, [],
                    "the install route reached out before anyone said yes")
            finally:
                shutil.rmtree(tree, ignore_errors=True)

    # -- (e) the real directory ----------------------------------------------

    def test_the_real_config_directory_is_exactly_as_this_suite_found_it(self):
        self.assertEqual(os.path.exists(REAL_ROOM_DIR), REAL_ROOM_DIR_EXISTED,
                         "this suite touched the real config directory - only "
                         "--setup, run by the owner, may create it")


if __name__ == "__main__":
    unittest.main()
