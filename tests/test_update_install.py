#!/usr/bin/env python3
"""UPD-16 / UPD-17 (26.9997, D-12..D-15, D-17): the install, on their tap.

Wave-0 Nyquist instrument. At the commit that adds it the helper functions
it drives in `tools/update_room.py` (`unpack_release_zip`,
`unpacked_tree_root`, `verify_source_stamps`, `backup_path_for`,
`swap_by_rename`, `wait_port_closed`, `swap_and_restart`, the
`--swap-and-restart` CLI mode), `study_lib._update_transport` /
`read_update_result_once`, and `server.start_update_install` do not exist,
so it fails with NOT_YET rather than passing vacuously. Plans 26.9997-03
(helper) and 26.9997-04 (route) turn it green.

What it proves, once green:
  (a) a release zip with top folder `study-room/` (the asset shape) and one
      with `IndoorHuman-study-room-abc1234/` (the zipball shape) both unpack,
      and `unpacked_tree_root` finds the directory holding RELEASE_DATE;
  (b) a zip whose namelist carries `../` or an absolute entry is refused
      (bad_zip) and nothing is written outside the unpack directory;
  (c) `verify_source_stamps` refuses a missing RELEASE_DATE, a missing
      LATEST_RELEASE_DATE, disagreement; the swap refuses a tag that differs
      from --expect (stamp_mismatch) and leaves dest untouched;
  (d) `swap_by_rename` leaves `<dest>.update-backup-<UTC stamp>/` holding
      the old tree and dest holding the new (D-12);
  (e) when the second rename fails the old tree is back at dest
      byte-identical and update_result says failed (D-17: atomic from the
      person's side);
  (f) a temp library folder and the settings home are byte-identical across
      a swap (D-14);
  (g) `wait_port_closed` answers True at once on a closed loopback port and
      False after the deadline on a bound one;
  (h) a loopback http.server answering 302 then the zip bytes: the transport
      follows the redirect and hands back 200 + the bytes;
  (i) `--swap-and-restart --dry-run` prints the two renames and writes
      nothing;
  (j) the install route body refuses with `job_running` while a job is
      running, and downloads nothing.

Hermetic: temp HOME, temp trees, loopback only (cases g and h), no real key.

Run: HOME="$(mktemp -d)" python3 tests/test_update_install.py
"""

from __future__ import annotations

import contextlib
import hashlib
import http.server
import io
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import zipfile
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "tools"))

import study_lib  # noqa: E402
import update_room  # noqa: E402

# CAPTURED AT IMPORT, BEFORE ANY CASE MOVES THE HOME DIRECTORY.
REAL_HOME = os.path.expanduser("~")
REAL_ROOM_DIR = os.path.join(REAL_HOME, study_lib.ROOM_CONFIG_DIR_NAME)
REAL_ROOM_DIR_EXISTED = os.path.exists(REAL_ROOM_DIR)

UPDATE_ROOM = REPO_ROOT / "tools" / "update_room.py"
RELEASE_DATE_NAME = study_lib.RELEASE_DATE_NAME
LATEST_RELEASE_DATE_NAME = study_lib.LATEST_RELEASE_DATE_NAME

OLD_TAG = "2026-08-30"
NEW_TAG = "2026-09-15"
BACKUP_RE = re.compile(r"\.update-backup-\d{8}T\d{6}Z$")


@contextlib.contextmanager
def temp_home():
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-update-install-")
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


def run_update_room(*args: str, home: str | None = None) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    if home is not None:
        env["HOME"] = home
    return subprocess.run(
        [sys.executable, str(UPDATE_ROOM), *args],
        capture_output=True, text=True, env=env, cwd=str(REPO_ROOT))


def write_stamp(tree: Path, name: str, value: str) -> None:
    (tree / name).write_text(value + "\n", encoding="utf-8")


def make_tree(parent: Path, name: str, tag: str | None, latest: str | None,
              marker: str) -> Path:
    tree = parent / name
    tree.mkdir(parents=True, exist_ok=True)
    (tree / "server.py").write_text("# " + marker + "\n", encoding="utf-8")
    (tree / "app.js").write_text("// " + marker + "\n", encoding="utf-8")
    (tree / "tools").mkdir(exist_ok=True)
    (tree / "tools" / "update_room.py").write_text(
        "# " + marker + "\n", encoding="utf-8")
    if tag:
        write_stamp(tree, RELEASE_DATE_NAME, tag)
    if latest:
        write_stamp(tree, LATEST_RELEASE_DATE_NAME, latest)
    return tree


def digest_tree(root: Path, skip: tuple[str, ...] = ()) -> str:
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        rel = p.relative_to(root).as_posix()
        if p.name in skip:
            continue
        h.update(rel.encode("utf-8"))
        if p.is_file():
            h.update(b"\0" + p.read_bytes())
    return h.hexdigest()


def build_zip(path: Path, top: str, tag: str, extra_names: tuple[str, ...] = ()) -> Path:
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(top + "/", "")
        zf.writestr(top + "/" + RELEASE_DATE_NAME, tag + "\n")
        zf.writestr(top + "/" + LATEST_RELEASE_DATE_NAME, tag + "\n")
        zf.writestr(top + "/server.py", "# release " + tag + "\n")
        zf.writestr(top + "/tools/update_room.py", "# release\n")
        for name in extra_names:
            zf.writestr(name, "planted\n")
    return path


class InstallContract(unittest.TestCase):

    def require(self, module, name, plan):
        if not hasattr(module, name):
            self.fail("NOT_YET: %s.%s (plan 26.9997-%s)"
                      % (module.__name__, name, plan))

    def scratch(self) -> Path:
        d = Path(tempfile.mkdtemp(prefix="studyroom-update-install-tmp-"))
        self.addCleanup(lambda: shutil.rmtree(d, ignore_errors=True))
        return d

    # -- (a) both zip shapes -------------------------------------------------

    def test_both_zip_shapes_unpack_and_the_tree_root_is_found(self):
        self.require(update_room, "unpack_release_zip", "03")
        self.require(update_room, "unpacked_tree_root", "03")
        for top in ("study-room", "IndoorHuman-study-room-abc1234"):
            with self.subTest(top):
                d = self.scratch()
                zip_path = build_zip(d / "release.zip", top, NEW_TAG)
                unpack_dir = d / "unpack"
                ok, why = update_room.unpack_release_zip(zip_path, unpack_dir)
                self.assertTrue(ok, why)
                root = update_room.unpacked_tree_root(unpack_dir)
                self.assertIsNotNone(root)
                self.assertTrue((Path(root) / RELEASE_DATE_NAME).is_file())
                self.assertEqual(
                    update_room.read_stamp_file(Path(root), RELEASE_DATE_NAME),
                    NEW_TAG)

    # -- (b) zip slip refused ------------------------------------------------

    def test_a_zip_that_escapes_its_folder_is_refused_and_writes_nothing_outside(self):
        self.require(update_room, "unpack_release_zip", "03")
        for planted in ("../escaped.txt", "study-room/../../escaped.txt",
                        "/tmp/escaped-absolute.txt"):
            with self.subTest(planted):
                d = self.scratch()
                zip_path = build_zip(d / "release.zip", "study-room", NEW_TAG,
                                     extra_names=(planted,))
                unpack_dir = d / "unpack"
                before = sorted(p.name for p in d.iterdir())
                ok, why = update_room.unpack_release_zip(zip_path, unpack_dir)
                self.assertFalse(ok, "an escaping zip was accepted")
                self.assertEqual(why, "bad_zip")
                after = sorted(p.name for p in d.iterdir())
                self.assertEqual(
                    [n for n in after if n != "unpack"],
                    [n for n in before if n != "unpack"],
                    "something was written beside the unpack directory")
                self.assertFalse(Path("/tmp/escaped-absolute.txt").exists())

    def test_a_file_that_is_not_a_zip_is_refused(self):
        self.require(update_room, "unpack_release_zip", "03")
        d = self.scratch()
        fake = d / "release.zip"
        fake.write_bytes(b"<html>not a zip</html>")
        ok, why = update_room.unpack_release_zip(fake, d / "unpack")
        self.assertFalse(ok)
        self.assertEqual(why, "bad_zip")

    # -- (c) the refusal set -------------------------------------------------

    def test_verify_source_stamps_refuses_every_bad_shape(self):
        self.require(update_room, "verify_source_stamps", "03")
        d = self.scratch()
        good = make_tree(d, "good", NEW_TAG, NEW_TAG, "new")
        ok, why = update_room.verify_source_stamps(good)
        self.assertTrue(ok, why)
        self.assertEqual(why, NEW_TAG)
        no_release = make_tree(d, "no_release", None, NEW_TAG, "new")
        no_latest = make_tree(d, "no_latest", NEW_TAG, None, "new")
        disagree = make_tree(d, "disagree", NEW_TAG, OLD_TAG, "new")
        for label, expected_why, tree in (
                ("missing RELEASE_DATE", "missing_release_stamp", no_release),
                ("missing LATEST_RELEASE_DATE", "missing_latest_stamp",
                 no_latest),
                ("disagreement", "stamp_mismatch", disagree)):
            with self.subTest(label):
                ok, why = update_room.verify_source_stamps(tree)
                self.assertFalse(ok, label + " was accepted")
                self.assertEqual(why, expected_why)
        ok, why = update_room.verify_source_stamps(good, expect="2026-12-31")
        self.assertFalse(ok, "a tag that differs from expect was accepted")
        self.assertEqual(why, "stamp_mismatch")

    def test_a_tag_that_differs_from_expect_refuses_and_leaves_dest_alone(self):
        self.require(update_room, "swap_and_restart", "03")
        self.require(study_lib, "read_update_result_once", "03")
        with temp_home():
            d = self.scratch()
            dest = make_tree(d, "study-room", OLD_TAG, OLD_TAG, "old")
            new = make_tree(d, "study-room.update-new-" + NEW_TAG,
                            NEW_TAG, NEW_TAG, "new")
            before = digest_tree(dest)
            rc = update_room.swap_and_restart(
                new, dest, "2026-12-31", False, False)
            self.assertNotEqual(rc, 0)
            self.assertEqual(digest_tree(dest), before, "dest was touched")
            self.assertFalse(
                any(BACKUP_RE.search(p.name) for p in d.iterdir()),
                "a backup was made for a refused install")
            result = study_lib.read_update_result_once()
            self.assertIsNotNone(result, "no update_result was written")
            self.assertEqual(result.get("outcome"), "failed")
            self.assertEqual(result.get("why"), "stamp_mismatch")

    # -- (d) the two renames -------------------------------------------------

    def test_swap_by_rename_leaves_the_dated_backup_beside_the_new_tree(self):
        self.require(update_room, "backup_path_for", "03")
        self.require(update_room, "swap_by_rename", "03")
        d = self.scratch()
        dest = make_tree(d, "study-room", OLD_TAG, OLD_TAG, "old")
        new = make_tree(d, "study-room.update-new-" + NEW_TAG,
                        NEW_TAG, NEW_TAG, "new")
        old_digest = digest_tree(dest)
        new_digest = digest_tree(new)
        backup = Path(update_room.backup_path_for(dest))
        self.assertEqual(backup.parent, dest.parent)
        self.assertTrue(BACKUP_RE.search(backup.name), backup.name)
        self.assertTrue(backup.name.startswith("study-room.update-backup-"))
        update_room.swap_by_rename(new, dest, backup)
        self.assertTrue(backup.is_dir())
        self.assertEqual(digest_tree(backup), old_digest)
        self.assertEqual(digest_tree(dest), new_digest)
        self.assertFalse(new.exists())
        self.assertEqual(update_room.read_stamp_file(dest, RELEASE_DATE_NAME),
                         NEW_TAG)

    # -- (e) rollback ---------------------------------------------------------

    def test_a_failed_second_rename_puts_the_old_tree_back_byte_identical(self):
        self.require(update_room, "swap_and_restart", "03")
        self.require(study_lib, "read_update_result_once", "03")
        with temp_home():
            d = self.scratch()
            dest = make_tree(d, "study-room", OLD_TAG, OLD_TAG, "old")
            new = make_tree(d, "study-room.update-new-" + NEW_TAG,
                            NEW_TAG, NEW_TAG, "new")
            before = digest_tree(dest)
            real_rename = os.rename
            calls = {"n": 0}

            def failing_rename(src, dst, *a, **k):
                calls["n"] += 1
                if calls["n"] == 2:
                    raise OSError("planted: second rename failed")
                return real_rename(src, dst, *a, **k)

            with mock.patch.object(update_room.os, "rename", failing_rename):
                rc = update_room.swap_and_restart(new, dest, NEW_TAG, False, False)
            self.assertNotEqual(rc, 0)
            self.assertTrue(dest.is_dir(), "dest is gone after a failed swap")
            self.assertEqual(digest_tree(dest), before,
                             "the old tree did not come back byte-identical")
            self.assertEqual(
                update_room.read_stamp_file(dest, RELEASE_DATE_NAME), OLD_TAG)
            result = study_lib.read_update_result_once()
            self.assertIsNotNone(result)
            self.assertEqual(result.get("outcome"), "failed")
            self.assertEqual(result.get("why"), "swap_failed")
            self.assertIn("at", result)
            # Read ONCE: the second read finds nothing.
            self.assertIsNone(study_lib.read_update_result_once())

    # -- (f) the library and the settings home are never touched -------------

    def test_the_library_and_the_settings_home_are_untouched_by_a_swap(self):
        self.require(update_room, "swap_and_restart", "03")
        self.require(study_lib, "UPDATE_RESULT_NAME", "03")
        with temp_home() as home:
            library = home / "StudyRoom"
            (library / "items").mkdir(parents=True)
            (library / "items" / "one.md").write_text("hers\n", encoding="utf-8")
            (library / "items.json").write_text("{}", encoding="utf-8")
            study_lib.ensure_room_config_dir()
            (study_lib.room_config_dir() / "settings.json").write_text(
                "{}", encoding="utf-8")
            (study_lib.room_config_dir() / "library.json").write_text(
                json.dumps({"library_root": str(library)}), encoding="utf-8")
            d = self.scratch()
            dest = make_tree(d, "study-room", OLD_TAG, OLD_TAG, "old")
            new = make_tree(d, "study-room.update-new-" + NEW_TAG,
                            NEW_TAG, NEW_TAG, "new")
            lib_before = digest_tree(library)
            # The helper owns exactly two files in the settings home: its
            # result note and the latest pointer it refreshes on success
            # (D-07). Everything of hers there must not move.
            skip = (study_lib.UPDATE_RESULT_NAME,
                    study_lib.LAST_LATEST_RELEASE_NAME)
            home_before = digest_tree(study_lib.room_config_dir(), skip)
            rc = update_room.swap_and_restart(new, dest, NEW_TAG, False, False)
            self.assertEqual(rc, 0)
            self.assertEqual(digest_tree(library), lib_before,
                             "the library folder changed across a swap (D-14)")
            self.assertEqual(digest_tree(study_lib.room_config_dir(), skip),
                             home_before,
                             "the settings home changed across a swap (D-14)")
            self.assertEqual(
                update_room.read_stamp_file(dest, RELEASE_DATE_NAME), NEW_TAG)
            backups = [p for p in d.iterdir() if BACKUP_RE.search(p.name)]
            self.assertEqual(len(backups), 1, backups)

    # -- (g) the port wait -----------------------------------------------------

    def test_wait_port_closed_answers_at_once_when_closed_and_false_when_bound(self):
        self.require(update_room, "wait_port_closed", "03")
        probe = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
        probe.close()
        started = time.monotonic()
        self.assertTrue(update_room.wait_port_closed(port, 2.0))
        self.assertLess(time.monotonic() - started, 1.0)

        held = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        held.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        held.bind(("127.0.0.1", 0))
        held.listen(1)
        try:
            bound = held.getsockname()[1]
            started = time.monotonic()
            self.assertFalse(update_room.wait_port_closed(bound, 0.4))
            self.assertGreaterEqual(time.monotonic() - started, 0.35)
        finally:
            held.close()

    # -- (h) the transport follows a redirect -----------------------------------

    def test_the_transport_follows_a_redirect_to_the_zip_bytes(self):
        self.require(study_lib, "_update_transport", "02")
        self.require(study_lib, "UPDATE_HEADERS", "02")
        d = self.scratch()
        zip_bytes = build_zip(d / "release.zip", "study-room", NEW_TAG).read_bytes()

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == "/first":
                    self.send_response(302)
                    self.send_header("Location", "/second")
                    self.end_headers()
                    return
                if self.path == "/second":
                    self.send_response(200)
                    self.send_header("Content-Type", "application/zip")
                    self.send_header("Content-Length", str(len(zip_bytes)))
                    self.end_headers()
                    self.wfile.write(zip_bytes)
                    return
                self.send_response(404)
                self.end_headers()

            def log_message(self, *_a):
                return

        httpd = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        port = httpd.server_address[1]
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            status, headers, body = study_lib._update_transport(
                "http://127.0.0.1:%d/first" % port,
                dict(study_lib.UPDATE_HEADERS), 5)
            self.assertEqual(status, 200)
            self.assertEqual(body, zip_bytes)
            self.assertTrue(zipfile.is_zipfile(io.BytesIO(body)))
            # A size cap refuses a body larger than allowed.
            status, headers, body = study_lib._update_transport(
                "http://127.0.0.1:%d/first" % port,
                dict(study_lib.UPDATE_HEADERS), 5, max_bytes=16)
            self.assertNotEqual((status, body), (200, zip_bytes),
                                "the size cap let an oversize body through")
        finally:
            httpd.shutdown()
            httpd.server_close()

    # -- (i) the dry run --------------------------------------------------------

    def test_swap_and_restart_dry_run_prints_the_two_renames_and_writes_nothing(self):
        with temp_home() as home:
            d = self.scratch()
            dest = make_tree(d, "study-room", OLD_TAG, OLD_TAG, "old")
            new = make_tree(d, "study-room.update-new-" + NEW_TAG,
                            NEW_TAG, NEW_TAG, "new")
            before_dest = digest_tree(dest)
            before_new = digest_tree(new)
            r = run_update_room("--swap-and-restart", "--new", str(new),
                                "--dest", str(dest), "--expect", NEW_TAG,
                                "--dry-run", home=str(home))
            self.assertEqual(
                r.returncode, 0,
                "NOT_YET (plan 26.9997-03): --swap-and-restart mode\n"
                + r.stderr + r.stdout)
            out = r.stdout
            self.assertIn(str(dest), out)
            self.assertIn(".update-backup-", out)
            self.assertIn(str(new), out)
            self.assertGreaterEqual(out.count("->"), 2,
                                    "the two renames were not printed:\n" + out)
            self.assertEqual(digest_tree(dest), before_dest)
            self.assertEqual(digest_tree(new), before_new)
            self.assertFalse(
                any(BACKUP_RE.search(p.name) for p in d.iterdir()),
                "a dry run made a backup")
            self.assertFalse(
                (study_lib.room_config_dir() / "update_result").exists(),
                "a dry run wrote a result note")
            self.assertNotIn("\u2014", out + r.stderr)

    def test_swap_and_restart_mode_does_not_require_source(self):
        with temp_home() as home:
            r = run_update_room("--swap-and-restart", "--dry-run", home=str(home))
            self.assertNotEqual(r.returncode, 0)
            # It complains about --new / --dest / --expect, never --source.
            self.assertNotIn("--source", r.stderr.split("usage:")[-1]
                             .split("error:")[-1]
                             if "error:" in r.stderr else r.stderr)

    # -- (j) refused while a job runs --------------------------------------------

    def test_the_install_route_refuses_while_a_job_is_running(self):
        with temp_home():
            import server  # noqa: E402  (after the HOME swap)
            self.require(server, "start_update_install", "04")
            self.require(study_lib, "record_update_consent", "02")
            self.require(study_lib, "_update_transport", "02")
            tree = self.scratch() / "study-room"
            tree.mkdir()
            write_stamp(tree, RELEASE_DATE_NAME, OLD_TAG)
            study_lib.record_update_consent("yes")
            study_lib.write_latest_release_date(NEW_TAG)
            seen = []

            def fake(url, headers, timeout_s, max_bytes=None):
                seen.append(url)
                return 200, {}, b""

            saved = study_lib._update_transport
            study_lib._update_transport = fake
            self.addCleanup(lambda: setattr(study_lib, "_update_transport", saved))
            with server.LIBRARIAN_LOCK:
                prior_state = server.LIBRARIAN_JOB.get("state")
                server.LIBRARIAN_JOB["state"] = "running"
            try:
                with mock.patch.object(server, "REPO_ROOT", tree):
                    answer = server.start_update_install()
            finally:
                with server.LIBRARIAN_LOCK:
                    server.LIBRARIAN_JOB["state"] = prior_state
            self.assertIsInstance(answer, dict)
            self.assertEqual(answer.get("refused"), "job_running")
            self.assertEqual(seen, [], "a refused install downloaded something")

    # -- the REAL 2026-08-30 asset shape, offline ------------------------------

    def test_real_asset_shape_end_to_end_offline(self):
        """real_asset_shape: the 2026-08-30 asset's namelist, end to end, offline.

        A zip whose namelist mirrors the real release asset (top folder
        study-room/, files RELEASE_DATE, LATEST_RELEASE_DATE, WHATS_NEW.md,
        server.py, tools/update_room.py) drives unpack, tree-root discovery,
        stamp verification against the announced tag, and the rename swap
        end to end in a temp parent. No live network anywhere."""
        self.addCleanup(os.chdir, str(REPO_ROOT))
        with temp_home():
            d = self.scratch()
            dest = make_tree(d, "study-room", "2026-08-28", "2026-08-28",
                             "old")
            tag = "2026-08-30"
            zip_path = d / ("study-room.update-new-" + tag + ".zip")
            with zipfile.ZipFile(zip_path, "w") as zf:
                zf.writestr("study-room/", "")
                zf.writestr("study-room/" + RELEASE_DATE_NAME, tag + "\n")
                zf.writestr("study-room/" + LATEST_RELEASE_DATE_NAME,
                            tag + "\n")
                zf.writestr("study-room/WHATS_NEW.md", "# what is new\n")
                zf.writestr("study-room/server.py", "# release " + tag + "\n")
                zf.writestr("study-room/tools/update_room.py", "# release\n")
            unpack_dir = d / ("study-room.update-new-" + tag)
            ok, why = update_room.unpack_release_zip(zip_path, unpack_dir)
            self.assertTrue(ok, why)
            root = update_room.unpacked_tree_root(unpack_dir)
            self.assertIsNotNone(root)
            ok, why = update_room.verify_source_stamps(
                Path(root), expect=tag)
            self.assertTrue(ok, why)
            rc = update_room.swap_and_restart(
                Path(root), dest, tag, False, False)
            self.assertEqual(rc, 0)
            self.assertEqual(
                update_room.read_stamp_file(dest, RELEASE_DATE_NAME), tag)
            backups = [p for p in d.iterdir()
                       if re.match(
                           r"^study-room\.update-backup-\d{8}T\d{6}Z$",
                           p.name)]
            self.assertEqual(len(backups), 1,
                             sorted(p.name for p in d.iterdir()))
            self.assertEqual(
                update_room.read_stamp_file(backups[0], RELEASE_DATE_NAME),
                "2026-08-28")
            # 26.9997 review WR-05: a successful swap removes the zip and
            # the unpack wrapper it downloaded; the only thing an update
            # leaves beside the app folder is the dated backup.
            self.assertEqual(
                sorted(p.name for p in d.iterdir()),
                sorted(["study-room", backups[0].name]),
                "the zip or the unpack wrapper outlived a successful swap")

    # -- the Windows branch, named and smoke-tested ----------------------------

    def test_windows_branch_named_smoke_tested_not_run_on_windows(self):
        """windows branch: named and smoke-tested, NOT run on real Windows.

        The Windows restart path is driven with os.name patched to "nt" and
        subprocess.Popen replaced by a recorder. It has NOT run on real
        Windows; the promise is tested on Macs. The creationflags value must
        come through getattr so the code does not raise on a Mac, where
        subprocess has no CREATE_NEW_CONSOLE."""
        self.require(update_room, "restart_room", "03")
        d = self.scratch()
        dest = make_tree(d, "study-room", OLD_TAG, OLD_TAG, "old")
        recorder = mock.Mock()
        with mock.patch.object(update_room.os, "name", "nt"), \
                mock.patch.object(update_room.subprocess, "Popen", recorder):
            rc = update_room.restart_room(dest)
        self.assertEqual(rc, 0)
        self.assertEqual(recorder.call_count, 1)
        args, kwargs = recorder.call_args
        self.assertEqual(args[0], [sys.executable, "server.py"])
        self.assertEqual(Path(kwargs.get("cwd")), dest)
        self.assertEqual(
            kwargs.get("creationflags"),
            getattr(update_room.subprocess, "CREATE_NEW_CONSOLE", 0))

    # -- the real directory ---------------------------------------------------------

    def test_the_real_config_directory_is_exactly_as_this_suite_found_it(self):
        self.assertEqual(os.path.exists(REAL_ROOM_DIR), REAL_ROOM_DIR_EXISTED,
                         "this suite touched the real config directory - only "
                         "--setup, run by the owner, may create it")


class InstallRouteContract(unittest.TestCase):
    """26.9997-04: the route body: refuse, download, unpack, verify, answer,
    hand off; and the one-shot result read on the status route.

    Every case runs under a temp HOME with a temp app tree standing in for
    REPO_ROOT. The tree carries the REAL tools/update_room.py, copied in,
    so the route's by-path import drives the same helper the shipped folder
    ships (D-13) rather than a stub.
    """

    def require(self, module, name, plan):
        if not hasattr(module, name):
            self.fail("NOT_YET: %s.%s (plan 26.9997-%s)"
                      % (module.__name__, name, plan))

    def scratch(self) -> Path:
        d = Path(tempfile.mkdtemp(prefix="studyroom-update-route-tmp-"))
        self.addCleanup(lambda: shutil.rmtree(d, ignore_errors=True))
        return d

    def live_tree(self, parent: Path, tag: str = OLD_TAG) -> Path:
        tree = make_tree(parent, "study-room", tag, tag, "live")
        shutil.copy2(str(REPO_ROOT / "tools" / "update_room.py"),
                     str(tree / "tools" / "update_room.py"))
        return tree

    def consent_and_behind(self):
        study_lib.record_update_consent("yes")
        study_lib.write_latest_release_date(NEW_TAG)

    def beside(self, parent: Path):
        return sorted(p.name for p in parent.iterdir())

    def fake_release_transport(self, tag: str = NEW_TAG, zip_bytes=None,
                               latest_status: int = 200,
                               asset_status: int = 200):
        """Fake the ONE seam: the Latest answer, then the asset bytes."""
        seen = []
        asset_url = "https://example.invalid/study-room-%s.zip" % tag
        body = json.dumps({
            "tag_name": tag,
            "assets": [{"name": "study-room-%s.zip" % tag,
                        "browser_download_url": asset_url}],
            "zipball_url": "https://example.invalid/zipball/" + tag,
        }).encode("utf-8")

        def fake(url, headers, timeout_s, max_bytes=None):
            seen.append(url)
            if url == study_lib.RELEASES_LATEST_URL:
                return latest_status, {}, body
            if url == asset_url:
                return asset_status, {}, (zip_bytes if zip_bytes is not None
                                          else b"")
            return 404, {}, b""

        saved = study_lib._update_transport
        study_lib._update_transport = fake
        self.addCleanup(lambda: setattr(study_lib, "_update_transport", saved))
        return seen, asset_url

    def drive_route(self, tree: Path):
        import server  # noqa: E402  (after the HOME swap)
        self.require(server, "start_update_install", "04")
        with mock.patch.object(server, "REPO_ROOT", tree):
            return server.start_update_install()

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

    # -- the refusal tokens, in the route's own order -------------------------

    def test_early_refusals_answer_their_tokens_and_reach_for_nothing(self):
        """no_stamp, no_consent, not_behind: answered before the seam is
        ever reached (regression pins on the plan-02 refusing shape, kept
        so the built route cannot lose them)."""
        with temp_home():
            d = self.scratch()
            seen, _asset = self.fake_release_transport()

            bare = d / "bare" / "study-room"
            bare.mkdir(parents=True)
            with self.subTest("no_stamp"):
                answer = self.drive_route(bare)
                self.assertEqual(answer.get("refused"), "no_stamp")

            stamped = self.live_tree(d)
            with self.subTest("no_consent"):
                answer = self.drive_route(stamped)
                self.assertEqual(answer.get("refused"), "no_consent")

            with self.subTest("not_behind"):
                study_lib.record_update_consent("yes")
                study_lib.write_latest_release_date(OLD_TAG)
                answer = self.drive_route(stamped)
                self.assertEqual(answer.get("refused"), "not_behind")

            self.assertEqual(seen, [], "a refused tap reached the network")

    def test_refused_while_any_job_is_running(self):
        """exec skips exit handlers, so a tap while ANY job runs is refused
        (RESEARCH Pitfall 7). The three pinned dicts plus the collect
        export and vision read, whose children read her photographs."""
        with temp_home():
            import server  # noqa: E402
            self.require(server, "start_update_install", "04")
            d = self.scratch()
            tree = self.live_tree(d)
            self.consent_and_behind()
            seen, _asset = self.fake_release_transport()
            jobs = (
                (server.LIBRARIAN_LOCK, server.LIBRARIAN_JOB, "librarian"),
                (server.LIBRARIAN_LOCK, server.ASK_JOB, "ask"),
                (server.JOB_LOCK, server.IMPORT_JOB, "import"),
                (server.JOB_LOCK, server.EXPORT_JOB, "collect export"),
                (server.JOB_LOCK, server.VISION_JOB, "vision read"),
            )
            for lock, job, label in jobs:
                with self.subTest(label):
                    with lock:
                        prior = job.get("state")
                        job["state"] = "running"
                    try:
                        answer = self.drive_route(tree)
                    finally:
                        with lock:
                            job["state"] = prior
                    self.assertEqual(answer.get("refused"), "job_running")
            self.assertEqual(seen, [], "a refused tap reached the network")

    def test_dest_not_writable_refuses_before_any_download(self):
        with temp_home():
            d = self.scratch()
            tree = self.live_tree(d)
            self.consent_and_behind()
            seen, _asset = self.fake_release_transport()
            os.chmod(str(d), 0o555)
            self.addCleanup(os.chmod, str(d), 0o755)
            try:
                answer = self.drive_route(tree)
            finally:
                os.chmod(str(d), 0o755)
            self.assertEqual(answer.get("refused"), "dest_not_writable")
            self.assertEqual(seen, [], "an unwritable dest still downloaded")

    def test_a_failed_fetch_or_download_refuses_and_cleans_up(self):
        for label, kwargs in (
                ("latest not 200", {"latest_status": 500}),
                ("asset not 200", {"asset_status": 404})):
            with self.subTest(label):
                with temp_home():
                    d = self.scratch()
                    tree = self.live_tree(d)
                    self.consent_and_behind()
                    self.fake_release_transport(**kwargs)
                    answer = self.drive_route(tree)
                    self.assertEqual(answer.get("refused"), "download_failed")
                    self.assertEqual(self.beside(d), ["study-room"],
                                     "something was left beside the app "
                                     "folder")

    def test_a_body_that_is_not_a_zip_refuses_bad_zip_and_cleans_up(self):
        with temp_home():
            d = self.scratch()
            tree = self.live_tree(d)
            self.consent_and_behind()
            self.fake_release_transport(zip_bytes=b"<html>not a zip</html>")
            answer = self.drive_route(tree)
            self.assertEqual(answer.get("refused"), "bad_zip")
            self.assertEqual(self.beside(d), ["study-room"],
                             "the zip or the unpack dir was left behind")

    def test_a_tree_whose_stamp_differs_refuses_stamp_mismatch_and_cleans_up(self):
        with temp_home():
            d = self.scratch()
            payload_dir = self.scratch()
            tree = self.live_tree(d)
            self.consent_and_behind()
            # The zip carries OLD_TAG inside while the Release announces
            # NEW_TAG: the stamps agree with each other but not with the
            # announced tag, exactly the swapped-body shape D-08 refuses.
            bad = build_zip(payload_dir / "payload.zip", "study-room",
                            OLD_TAG)
            self.fake_release_transport(zip_bytes=bad.read_bytes())
            answer = self.drive_route(tree)
            self.assertEqual(answer.get("refused"), "stamp_mismatch")
            self.assertEqual(self.beside(d), ["study-room"],
                             "a refused tree was left beside the app folder")

    # -- the success answer and the hand-off ----------------------------------

    def test_a_good_zip_answers_handing_off_with_the_helper_argv(self):
        with temp_home():
            d = self.scratch()
            payload_dir = self.scratch()
            tree = self.live_tree(d)
            self.consent_and_behind()
            config_before = sorted(
                p.name for p in study_lib.room_config_dir().iterdir())
            good = build_zip(payload_dir / "payload.zip", "study-room",
                             NEW_TAG)
            seen, asset_url = self.fake_release_transport(
                zip_bytes=good.read_bytes())
            answer = self.drive_route(tree)
            self.assertEqual(answer.get("handing_off"), True, answer)
            self.assertEqual(answer.get("expect"), NEW_TAG)
            # With consent and a fake 200 JSON plus a fake zip body: exactly
            # the Latest URL then the asset URL, as a LIST (D-03's positive
            # control for the tap path).
            self.assertEqual(seen, [study_lib.RELEASES_LATEST_URL, asset_url])
            unpack_dir = d / ("study-room.update-new-" + NEW_TAG)
            root = unpack_dir / "study-room"
            self.assertTrue(root.is_dir(), self.beside(d))
            self.assertEqual(
                update_room.read_stamp_file(root, RELEASE_DATE_NAME), NEW_TAG)
            self.assertTrue(
                (d / ("study-room.update-new-" + NEW_TAG + ".zip")).is_file(),
                "the downloaded zip must stay for the helper to remove")
            self.assertEqual(
                answer.get("_helper_argv"),
                [sys.executable, str(tree / "tools" / "update_room.py"),
                 "--swap-and-restart", "--new", str(root),
                 "--dest", str(tree), "--expect", NEW_TAG, "--restart"])
            # D-14 on the tap path: the settings home gained and lost
            # nothing on the way to the hand-off.
            self.assertEqual(
                sorted(p.name for p in study_lib.room_config_dir().iterdir()),
                config_before)

    def test_the_handler_answers_then_hands_off_on_a_short_timer(self):
        with temp_home():
            import server  # noqa: E402
            self.require(server.StudyHandler, "handle_update_install", "04")
            self.require(server, "hand_off_to_update_helper", "04")
            d = self.scratch()
            payload_dir = self.scratch()
            tree = self.live_tree(d)
            self.consent_and_behind()
            good = build_zip(payload_dir / "payload.zip", "study-room",
                             NEW_TAG)
            self.fake_release_transport(zip_bytes=good.read_bytes())

            class RouteFake(object):
                def __init__(self):
                    self.answer = None

                def json_response(self, data, code=200):
                    self.answer = data
                    return data

            recorder = mock.Mock()
            fake = RouteFake()
            with mock.patch.object(server, "hand_off_to_update_helper",
                                   recorder):
                with mock.patch.object(server, "REPO_ROOT", tree):
                    server.StudyHandler.handle_update_install(fake, {})
                self.assertIsInstance(fake.answer, dict)
                self.assertEqual(fake.answer.get("handing_off"), True)
                self.assertEqual(fake.answer.get("expect"), NEW_TAG)
                self.assertNotIn(
                    "_helper_argv", fake.answer,
                    "the helper argv must never reach the browser")
                self.assertEqual(
                    recorder.call_count, 0,
                    "the hand-off ran before the JSON answer could flush")
                time.sleep(0.9)
                self.assertEqual(recorder.call_count, 1,
                                 "the hand-off never ran")
            argv = recorder.call_args[0][0]
            self.assertEqual(argv[0], sys.executable)
            self.assertIn("--swap-and-restart", argv)
            self.assertEqual(argv[-1], "--restart")

    # -- the one-shot result on the status route ------------------------------

    def test_status_reports_a_failed_result_exactly_once(self):
        with temp_home() as home:
            import server  # noqa: E402
            self.require(study_lib, "write_update_result", "03")
            d = self.scratch()
            tree = self.live_tree(d)

            def quiet(url, headers, timeout_s, max_bytes=None):
                return None, {}, b""

            saved = study_lib._update_transport
            study_lib._update_transport = quiet
            self.addCleanup(
                lambda: setattr(study_lib, "_update_transport", saved))
            study_lib.write_update_result("failed", "swap_failed")
            # The consent route's block must NOT consume the note: the read
            # is once, and the one read belongs to the status call (D-17).
            with mock.patch.object(server, "REPO_ROOT", tree):
                block = server.record_update_consent_answer("bogus", "yes")
            self.assertNotIn("update_result", block)
            payload = self.drive_status(home, tree)
            self.assertIsInstance(payload.get("update_result"), dict, payload)
            self.assertEqual(payload["update_result"].get("outcome"),
                             "failed")
            self.assertEqual(payload["update_result"].get("why"),
                             "swap_failed")
            self.assertFalse(
                (study_lib.room_config_dir()
                 / study_lib.UPDATE_RESULT_NAME).exists(),
                "the note must be gone after the one read")
            payload2 = self.drive_status(home, tree)
            self.assertNotIn("update_result", payload2,
                             "the note was reported twice")

    def test_update_install_ready_rides_status_only_when_behind_and_consented(self):
        with temp_home() as home:
            d = self.scratch()
            tree = self.live_tree(d)

            def quiet(url, headers, timeout_s, max_bytes=None):
                return None, {}, b""

            saved = study_lib._update_transport
            study_lib._update_transport = quiet
            self.addCleanup(
                lambda: setattr(study_lib, "_update_transport", saved))
            payload = self.drive_status(home, tree)
            self.assertNotEqual(payload.get("update_install_ready"), True,
                                "ready before anyone said yes")
            study_lib.record_update_consent("yes")
            payload = self.drive_status(home, tree)
            self.assertNotEqual(payload.get("update_install_ready"), True,
                                "ready while not behind")
            study_lib.write_latest_release_date(NEW_TAG)
            payload = self.drive_status(home, tree)
            self.assertEqual(payload.get("update_install_ready"), True,
                             "behind AND consented must offer the button")


if __name__ == "__main__":
    unittest.main()
