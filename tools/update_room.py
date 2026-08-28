#!/usr/bin/env python3
"""update_room — one command to replace the app folder and refresh the latest pointer.

THIS FILE NEVER pushes the private study-room repo or calls GitHub APIs.
Local filesystem only — the running app never phones home to discover versions.

MODES
  --sync-latest-only --source DOWNLOADED_TREE
    Read LATEST_RELEASE_DATE from the downloaded tree and write
    ~/.study-room/latest_release_date. Does not touch the live app folder —
    use while the old server is still running so show_update_prompt can flip.

  --source NEW_TREE --dest LIVE_APP_FOLDER
    Replace the live app folder from a local tree that ships RELEASE_DATE and
    matching LATEST_RELEASE_DATE, then refresh the latest pointer.

USAGE
  python3 tools/update_room.py --sync-latest-only --source ~/Downloads/study-room
  python3 tools/update_room.py --source ~/Downloads/study-room --dest ~/study-room

Quit the room before a full replace — a running server may hold files open.

⛔ Never push the private study-room repo (CLAUDE.md identity guard).
"""

from __future__ import annotations

import argparse
import datetime
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import study_lib  # noqa: E402

RELEASE_DATE_NAME = study_lib.RELEASE_DATE_NAME
LATEST_RELEASE_DATE_NAME = study_lib.LATEST_RELEASE_DATE_NAME


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
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y%m%dT%H%M%SZ")
    backup = dest.parent / (dest.name + ".update-backup-" + stamp)
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
            "UPDATE REFUSED — %s is missing from the source tree: %s"
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
            "UPDATE REFUSED — destination is not a directory: %s" % dest,
            file=sys.stderr,
        )
        return 1
    if not source.is_dir():
        print(
            "UPDATE REFUSED — source is not a directory: %s" % source,
            file=sys.stderr,
        )
        return 1
    if source.resolve() == dest.resolve():
        print(
            "UPDATE REFUSED — source and destination are the same path.",
            file=sys.stderr,
        )
        return 1

    latest = read_stamp_file(source, LATEST_RELEASE_DATE_NAME)
    if not latest:
        print(
            "UPDATE REFUSED — %s is missing from the source tree: %s"
            % (LATEST_RELEASE_DATE_NAME, source),
            file=sys.stderr,
        )
        return 1

    release = read_stamp_file(source, RELEASE_DATE_NAME)
    if not release:
        print(
            "UPDATE REFUSED — %s is missing from the source tree: %s"
            % (RELEASE_DATE_NAME, source),
            file=sys.stderr,
        )
        return 1
    if release != latest:
        print(
            "UPDATE REFUSED — %s (%s) and %s (%s) disagree in the source tree."
            % (RELEASE_DATE_NAME, release, LATEST_RELEASE_DATE_NAME, latest),
            file=sys.stderr,
        )
        return 1

    backup = backup_dest(dest, dry_run=dry_run)
    if backup is not None:
        print("backup: %s" % backup)

    replace_tree_contents(source, dest, dry_run=dry_run)
    if not dry_run:
        study_lib.write_latest_release_date(latest)
    print("folder replaced; latest pointer: %s" % latest)
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
        required=True,
        help="downloaded or new app tree containing LATEST_RELEASE_DATE",
    )
    parser.add_argument(
        "--dest",
        type=Path,
        default=None,
        help="live app folder to replace (required for full replace)",
    )
    parser.add_argument(
        "--sync-latest-only",
        action="store_true",
        help="sync latest pointer from source without touching --dest",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="validate paths and print actions without writing",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    source = args.source.expanduser().resolve()

    if not source.is_dir():
        print(
            "UPDATE REFUSED — source is not a directory: %s" % source,
            file=sys.stderr,
        )
        return 1

    if args.sync_latest_only:
        return sync_latest_only(source, dry_run=args.dry_run)

    if args.dest is None:
        print(
            "UPDATE REFUSED — --dest is required for a full folder replace.",
            file=sys.stderr,
        )
        return 1

    dest = args.dest.expanduser().resolve()
    return full_replace(source, dest, dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
