#!/usr/bin/env python3
"""update_room: replace the app folder, keep a dated backup, refresh the latest pointer.

THIS FILE NEVER pushes the private study-room repo.

TERMINAL MODES (local filesystem only; these two never call GitHub)
  --sync-latest-only --source DOWNLOADED_TREE
    Read LATEST_RELEASE_DATE from the downloaded tree and write
    ~/.study-room/latest_release_date. Does not touch the live app folder,
    so it can run while the old server is still up and the behind-latest
    line flips on the next open.

  --source NEW_TREE --dest LIVE_APP_FOLDER
    Replace the live app folder file by file from a local tree that ships
    RELEASE_DATE and a matching LATEST_RELEASE_DATE, then refresh the
    latest pointer. Quit the room before this terminal replace; a running
    server may hold files open. (That advice is for this copy mode only,
    not for the helper mode below.)

HELPER MODE (started by the room itself, after a consented download)
  --swap-and-restart --new UNPACKED_TREE --dest LIVE_APP_FOLDER --expect TAG [--restart]
    A process that is not the running server swaps the app folder by two
    renames: the live folder becomes ~/study-room.update-backup-<UTC stamp>
    and the unpacked tree takes its place. If the second rename fails, the
    old folder is put back untouched and nothing changed. The helper waits
    up to 30 seconds for the room's port to close, writes its outcome to
    ~/.study-room/update_result for the next status call, and with
    --restart brings the room back from the new folder in the same
    terminal on Mac and Linux.

USAGE
  python3 tools/update_room.py --sync-latest-only --source ~/Downloads/study-room
  python3 tools/update_room.py --source ~/Downloads/study-room --dest ~/study-room

GOING BACK
  The dated backup beside the live folder is the undo: rename or copy it
  into place. This tool never deletes a backup; old backups may be deleted
  by hand. On a copy that came from git clone, the .git folder rides into
  the backup on a rename swap, so the backup keeps the clone intact.

⛔ Never push the private study-room repo (CLAUDE.md identity guard).
"""

from __future__ import annotations

import argparse
import datetime
import errno
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import zipfile
from pathlib import Path, PurePosixPath

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import study_lib  # noqa: E402

RELEASE_DATE_NAME = study_lib.RELEASE_DATE_NAME
LATEST_RELEASE_DATE_NAME = study_lib.LATEST_RELEASE_DATE_NAME
SERVER_PORT = 8747  # matches server.py PORT

# The download is capped compressed (UPDATE_DOWNLOAD_MAX_BYTES); these cap
# what it may EXPAND to, so a crafted zip inside the download cap cannot
# fill the disk the library lives on. Real release zips are a few MB and a
# few hundred entries; the ceilings are generous on purpose. Python's
# zipfile stops each member at its declared file_size, which is what makes
# a cap on the declared sizes effective.
UNPACK_MAX_ENTRIES = 20000
UNPACK_MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB uncompressed


def read_stamp_file(tree: Path, name: str) -> str | None:
    path = tree / name
    if not path.is_file():
        return None
    try:
        lines = path.read_text(encoding="utf-8").strip().splitlines()
    except OSError:
        return None
    if not lines:
        return None
    stamp = lines[0].strip()
    return stamp or None


def _ignore_git(_src: str, names: list[str]) -> set[str]:
    return {n for n in names if n == ".git"}


def backup_path_for(dest: Path) -> Path:
    """The dated backup name beside the live folder, e.g. for a live folder
    at ~/study-room: ~/study-room.update-backup-20260830T191203Z.

    ONE naming rule for both the terminal copy path and the helper's rename
    swap, so going back always means the same folder shape (D-12, D-13).
    """
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y%m%dT%H%M%SZ")
    return dest.parent / (dest.name + ".update-backup-" + stamp)


def verify_source_stamps(source: Path, expect: str | None = None):
    """Refusal set shared by the terminal replace and the helper swap.

    Returns (True, tag) for a tree whose RELEASE_DATE and
    LATEST_RELEASE_DATE agree (and equal `expect` when given), else
    (False, machine token): missing_latest_stamp, missing_release_stamp,
    or stamp_mismatch.
    """
    latest = read_stamp_file(source, LATEST_RELEASE_DATE_NAME)
    if not latest:
        return False, "missing_latest_stamp"
    release = read_stamp_file(source, RELEASE_DATE_NAME)
    if not release:
        return False, "missing_release_stamp"
    if release != latest:
        return False, "stamp_mismatch"
    if expect is not None and release != expect:
        return False, "stamp_mismatch"
    return True, release


def unpack_release_zip(zip_path: Path, unpack_dir: Path):
    """Unpack a release zip into unpack_dir, refusing anything that would
    write outside it.

    Every namelist entry is inspected BEFORE anything is extracted: an
    absolute path, a Windows drive prefix, or a dot-dot path component
    refuses the whole archive as (False, "bad_zip") and writes nothing.
    A file that is not a zip at all is the same refusal, and so is one
    that would EXPAND past sanity: more than UNPACK_MAX_ENTRIES entries,
    or declared sizes summing past UNPACK_MAX_TOTAL_BYTES (a zip bomb
    inside the compressed download cap must not fill the disk). On
    success the archive is extracted into unpack_dir and (True, "")
    comes back.
    """
    zip_path = Path(zip_path)
    unpack_dir = Path(unpack_dir)
    if not zipfile.is_zipfile(str(zip_path)):
        return False, "bad_zip"
    try:
        with zipfile.ZipFile(str(zip_path)) as zf:
            infos = zf.infolist()
            if len(infos) > UNPACK_MAX_ENTRIES:
                return False, "bad_zip"
            total_declared = 0
            for info in infos:
                name = info.filename
                if os.path.isabs(name):
                    return False, "bad_zip"
                if re.match(r"^[A-Za-z]:", name):
                    return False, "bad_zip"
                if ".." in PurePosixPath(name).parts:
                    return False, "bad_zip"
                total_declared += int(info.file_size or 0)
            if total_declared > UNPACK_MAX_TOTAL_BYTES:
                return False, "bad_zip"
            unpack_dir.mkdir(parents=True, exist_ok=True)
            zf.extractall(str(unpack_dir))
    except (OSError, zipfile.BadZipFile):
        return False, "bad_zip"
    return True, ""


def unpacked_tree_root(unpack_dir: Path) -> Path | None:
    """The one directory inside unpack_dir that holds RELEASE_DATE.

    Both zip shapes are found this way: the release asset's top folder
    (study-room/) and the zipball's (IndoorHuman-study-room-<sha7>/).
    None when no child carries the stamp, or more than one does.
    """
    unpack_dir = Path(unpack_dir)
    if not unpack_dir.is_dir():
        return None
    found = [child for child in unpack_dir.iterdir()
             if child.is_dir() and (child / RELEASE_DATE_NAME).is_file()]
    if len(found) != 1:
        return None
    return found[0]


def backup_dest(dest: Path, *, dry_run: bool = False) -> Path | None:
    """Copy a non-empty destination aside before replace."""
    if not dest.is_dir():
        return None
    try:
        has_contents = any(dest.iterdir())
    except OSError:
        return None
    if not has_contents:
        return None
    backup = backup_path_for(dest)
    if dry_run:
        return backup
    if backup.exists():
        shutil.rmtree(backup)
    shutil.copytree(dest, backup, ignore=_ignore_git)
    return backup


def sync_latest_only(source: Path, *, dry_run: bool = False) -> int:
    latest = read_stamp_file(source, LATEST_RELEASE_DATE_NAME)
    if not latest:
        print(
            "UPDATE REFUSED: %s is missing from the source tree: %s"
            % (LATEST_RELEASE_DATE_NAME, source),
            file=sys.stderr,
        )
        return 1
    if not dry_run:
        study_lib.write_latest_release_date(latest)
    print("latest pointer synced: %s" % latest)
    return 0


def replace_tree_contents(source: Path, dest: Path, *, dry_run: bool = False) -> None:
    if dry_run:
        return
    for child in list(dest.iterdir()):
        if child.name == ".git":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    for child in source.iterdir():
        if child.name == ".git":
            continue
        target = dest / child.name
        if child.is_dir():
            shutil.copytree(child, target, ignore=_ignore_git)
        else:
            shutil.copy2(child, target)


def full_replace(source: Path, dest: Path, *, dry_run: bool = False) -> int:
    if not dest.is_dir():
        print(
            "UPDATE REFUSED: destination is not a directory: %s" % dest,
            file=sys.stderr,
        )
        return 1
    if not source.is_dir():
        print(
            "UPDATE REFUSED: source is not a directory: %s" % source,
            file=sys.stderr,
        )
        return 1
    if source.resolve() == dest.resolve():
        print(
            "UPDATE REFUSED: source and destination are the same path.",
            file=sys.stderr,
        )
        return 1

    ok, why = verify_source_stamps(source)
    if not ok:
        if why == "missing_latest_stamp":
            print(
                "UPDATE REFUSED: %s is missing from the source tree: %s"
                % (LATEST_RELEASE_DATE_NAME, source),
                file=sys.stderr,
            )
        elif why == "missing_release_stamp":
            print(
                "UPDATE REFUSED: %s is missing from the source tree: %s"
                % (RELEASE_DATE_NAME, source),
                file=sys.stderr,
            )
        else:
            print(
                "UPDATE REFUSED: %s (%s) and %s (%s) disagree in the source tree."
                % (RELEASE_DATE_NAME,
                   read_stamp_file(source, RELEASE_DATE_NAME),
                   LATEST_RELEASE_DATE_NAME,
                   read_stamp_file(source, LATEST_RELEASE_DATE_NAME)),
                file=sys.stderr,
            )
        return 1
    latest = why

    backup = backup_dest(dest, dry_run=dry_run)
    if backup is not None:
        print("backup: %s" % backup)

    replace_tree_contents(source, dest, dry_run=dry_run)
    if not dry_run:
        study_lib.write_latest_release_date(latest)
    print("folder replaced; latest pointer: %s" % latest)
    return 0


def swap_by_rename(new_tree: Path, dest: Path, backup: Path) -> None:
    """Two same-directory renames: the live folder becomes the dated backup,
    the new tree takes its place.

    If the second rename fails, the first is undone so the old folder is
    back untouched (D-17), and the error is re-raised for the caller to
    report. Both targets live in dest's parent, so every rename stays on
    one filesystem (the atomic_write_bytes discipline).
    """
    os.rename(str(dest), str(backup))
    try:
        os.rename(str(new_tree), str(dest))
    except OSError:
        os.rename(str(backup), str(dest))
        raise


def wait_port_closed(port: int, seconds: float = 30.0) -> bool:
    """Wait up to `seconds` for the room's port to close.

    True as soon as a loopback connect is refused; False when the deadline
    passes with the port still held. A connect that succeeds or times out
    means something is still on the port, so the wait goes on. A bounded
    loop with a short sleep, nothing more.
    """
    deadline = time.monotonic() + float(seconds)
    while time.monotonic() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.5)
            try:
                answer = probe.connect_ex(("127.0.0.1", int(port)))
            except OSError:
                answer = None
            if answer == errno.ECONNREFUSED:
                return True
        time.sleep(0.25)
    return False


def restart_room(dest: Path) -> int:
    """Bring the room back from the freshly installed folder.

    On Mac and Linux this execs server.py from the new folder: same process
    id, same terminal, Ctrl+C still works, and the port is freed by the
    exec itself. The Windows branch opens a new console window instead; it
    is named and smoke-tested but has not run on real Windows (the promise
    is tested on Macs). The caller hands in the destination Path as built
    on the running platform; it is not re-wrapped here.
    """
    if os.name == "nt":
        subprocess.Popen(
            [sys.executable, "server.py"],
            cwd=str(dest),
            creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0))
        return 0
    os.chdir(str(dest))
    os.execv(sys.executable, [sys.executable, "server.py"])
    return 0  # not reached on Mac or Linux; execv does not return


def swap_and_restart(new: Path, dest: Path, expect: str,
                     restart: bool, dry_run: bool) -> int:
    """Helper mode: swap the app folder by two renames, then restart.

    Started by the room itself after a consented download (D-13). Refuses
    (exit 1) when the new tree or the live folder is missing, when the new
    tree's stamps do not match the announced tag, or when the room's port
    is still open after the wait. Every refusal and failure leaves the old
    folder in place and, outside a dry run, writes the outcome to
    ~/.study-room/update_result for the next status call; with --restart,
    a failure that left the old folder intact then starts the old room
    again so that status call can actually happen (port_busy excepted:
    the held port is exactly why a restart would not bind). A dry run prints
    what would happen and writes nothing at all. The library folder and
    everything else in ~/.study-room/ are never opened, moved or written
    (D-14); backups are never deleted (D-15). The tap's own downloads
    beside the app folder (the zip and the unpack wrapper directory,
    recognised by their exact expected names) are removed on success and
    on every refusal alike, so the only thing an update leaves beside
    the app folder is the dated backup.
    """
    new = Path(new)
    dest = Path(dest)

    def clean_beside() -> None:
        """Remove what this tap downloaded beside the app folder: the
        wrapper directory the unpack landed in and the zip itself, both
        recognised by their exact expected names. A bare tree handed in
        by hand (whose parent is not the wrapper) and the dated backups
        are never touched (D-15, D-17)."""
        wrapper_name = dest.name + ".update-new-" + str(expect)
        wrapper = new.parent
        if expect and wrapper.name == wrapper_name:
            shutil.rmtree(str(wrapper), ignore_errors=True)
        zip_beside = dest.parent / (wrapper_name + ".zip")
        try:
            if expect and zip_beside.is_file():
                zip_beside.unlink()
        except OSError:
            pass

    def refuse(line: str, token: str, *, bring_back: bool = True) -> int:
        print("UPDATE REFUSED: " + line, file=sys.stderr)
        if not dry_run:
            if new.is_dir() and new.resolve() != dest.resolve():
                shutil.rmtree(new, ignore_errors=True)
            clean_beside()
            study_lib.write_update_result("failed", token)
            # The room exec'd itself into this helper (D-13): after a
            # refusal nothing else brings it back, and the failed note is
            # only ever seen by a room that is running. So when --restart
            # was asked for and the old folder is intact, start the old
            # room again; the promise "the button brings the room back in
            # the same terminal window" holds on the failure branch too.
            # port_busy passes bring_back=False: the port is still held,
            # so a second server would only die on bind.
            if bring_back and restart and dest.is_dir():
                restart_room(dest)
        return 1

    try:
        os.chdir(str(dest.parent))
    except OSError:
        return refuse("destination is not a directory: %s" % dest,
                      "missing_dest")
    if not new.is_dir():
        return refuse("new tree is not a directory: %s" % new, "missing_new")
    if not dest.is_dir():
        return refuse("destination is not a directory: %s" % dest,
                      "missing_dest")
    if new.resolve() == dest.resolve():
        return refuse("new tree and destination are the same path.",
                      "missing_new")
    ok, why = verify_source_stamps(new, expect)
    if not ok:
        return refuse(
            "the new tree at %s does not carry matching release stamps for "
            "%s (%s)." % (new, expect, why), why)
    if not wait_port_closed(SERVER_PORT, 30.0):
        return refuse(
            "port %d is still open; the room did not close in time."
            % SERVER_PORT, "port_busy", bring_back=False)

    backup = backup_path_for(dest)
    if dry_run:
        print("dry run: %s -> %s" % (dest, backup))
        print("dry run: %s -> %s" % (new, dest))
        print("dry run: exec %s server.py in %s" % (sys.executable, dest))
        return 0

    try:
        swap_by_rename(new, dest, backup)
    except OSError as err:
        print(
            "UPDATE REFUSED: the swap failed and the old folder is back in "
            "place: %s" % err, file=sys.stderr)
        if new.is_dir():
            shutil.rmtree(new, ignore_errors=True)
        clean_beside()
        study_lib.write_update_result("failed", "swap_failed")
        if restart and dest.is_dir():
            restart_room(dest)
        return 1

    study_lib.write_latest_release_date(expect)
    study_lib.write_update_result("ok", "")
    clean_beside()
    print("folder swapped; backup: %s" % backup)
    if restart:
        return restart_room(dest)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="update_room",
        description=(
            "Replace the live app folder and refresh ~/.study-room/"
            "latest_release_date from a local tree. No network, no git push."))
    parser.add_argument(
        "--source",
        type=Path,
        default=None,
        help="downloaded or new app tree containing LATEST_RELEASE_DATE "
             "(required for the two terminal modes)",
    )
    parser.add_argument(
        "--dest",
        type=Path,
        default=None,
        help="live app folder to replace (required for full replace and "
             "the helper mode)",
    )
    parser.add_argument(
        "--sync-latest-only",
        action="store_true",
        help="sync latest pointer from source without touching --dest",
    )
    parser.add_argument(
        "--swap-and-restart",
        action="store_true",
        help="helper mode: swap --dest for --new by two renames",
    )
    parser.add_argument(
        "--new",
        type=Path,
        default=None,
        help="unpacked new tree for the helper mode",
    )
    parser.add_argument(
        "--expect",
        type=str,
        default=None,
        help="the announced release tag the new tree must carry",
    )
    parser.add_argument(
        "--restart",
        action="store_true",
        help="after the swap, start the room from the new folder",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="validate paths and print actions without writing",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.swap_and_restart:
        missing = [flag for flag, value in (
            ("--new", args.new), ("--dest", args.dest),
            ("--expect", args.expect)) if value is None]
        if missing:
            print(
                "UPDATE REFUSED: the helper mode needs %s."
                % " and ".join(missing),
                file=sys.stderr,
            )
            return 1
        return swap_and_restart(
            args.new.expanduser().resolve(),
            args.dest.expanduser().resolve(),
            args.expect,
            args.restart,
            args.dry_run,
        )

    if args.source is None:
        parser.error("the following arguments are required: --source")
    source = args.source.expanduser().resolve()

    if not source.is_dir():
        print(
            "UPDATE REFUSED: source is not a directory: %s" % source,
            file=sys.stderr,
        )
        return 1

    if args.sync_latest_only:
        return sync_latest_only(source, dry_run=args.dry_run)

    if args.dest is None:
        print(
            "UPDATE REFUSED: --dest is required for a full folder replace.",
            file=sys.stderr,
        )
        return 1

    dest = args.dest.expanduser().resolve()
    return full_replace(source, dest, dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
