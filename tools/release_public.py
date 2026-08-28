#!/usr/bin/env python3
"""release_public — one ritual command to publish IndoorHuman/study-room (D-06).

THIS FILE NEVER SHIPS to the public tree when excluded; when it ships, it is
the operator-facing publish ritual only.

RITUAL ORDER (stop at first failure, exit non-zero, loud stdout):
  1. stage_public — DENY + always-REQUIRED only (no stamp/note in private tree)
  2. require non-empty WHATS_NEW.md into staging (copy from private tree; refuse
     if missing/empty/whitespace — never draft her words)
  3. write RELEASE_DATE into the staged tree only (never the private checkout)
  4. missing_release_artifacts on post-injection staged tree (UPD-07)
  5. compat_check on tools/compat_bank/ — no bypass flag (D-05)
  6. append snapshot commit to IndoorHuman/study-room + refresh README slots

USAGE
  python3 tools/release_public.py --out ~/study-room-public-staged
  python3 tools/release_public.py --as-test --note-file /path/to/note.md --out /tmp/stage

The shipped LATEST_RELEASE_DATE artifact is copied into ~/.study-room/
latest_release_date by update_room --sync-latest-only or a full folder
replace — the running app never writes that pointer itself.

⛔ Never push the private study-room repo (CLAUDE.md identity guard).
"""

from __future__ import annotations

import argparse
import datetime
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import compat_check  # noqa: E402
import stage_public  # noqa: E402
import study_lib  # noqa: E402

WHATS_NEW_NAME = study_lib.WHATS_NEW_NAME
RELEASE_DATE_NAME = study_lib.RELEASE_DATE_NAME
LATEST_RELEASE_DATE_NAME = study_lib.LATEST_RELEASE_DATE_NAME

# Post-injection release-artifact gate — NOT stage_public.REQUIRED (UPD-07 / D-03).
RELEASE_ARTIFACT_REQUIRED = [
    RELEASE_DATE_NAME, LATEST_RELEASE_DATE_NAME, WHATS_NEW_NAME]
RELEASE_ARTIFACT_MISSING_LABEL = "RELEASE ARTIFACT MISSING"

PUBLIC_REPO_DEFAULT = "IndoorHuman/study-room"
DEFAULT_BANK = REPO_ROOT / "tools" / "compat_bank"

UPDATE_SECTION_BEGIN = "<!-- BEGIN UPDATE SECTION -->"
UPDATE_SECTION_END = "<!-- END UPDATE SECTION -->"


def missing_release_artifacts(stage: Path) -> list[str]:
    """Every release artifact absent from `stage` after injection."""
    return [
        "%s  %s — required on the post-injection staged tree"
        % (rel, RELEASE_ARTIFACT_MISSING_LABEL)
        for rel in RELEASE_ARTIFACT_REQUIRED
        if not (stage / rel).is_file()
    ]


def whats_new_refusal(repo: Path) -> str | None:
    """Return a loud refusal sentence when the private note is unusable."""
    path = repo / WHATS_NEW_NAME
    if not path.is_file():
        return (
            "RELEASE REFUSED — %s is missing from the private tree. "
            "Write her what's-new note before publishing; this tool never "
            "drafts it." % WHATS_NEW_NAME)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        return "RELEASE REFUSED — cannot read %s: %s" % (WHATS_NEW_NAME, e)
    if not text.strip():
        return (
            "RELEASE REFUSED — %s is empty or whitespace-only. "
            "Her note must be non-empty." % WHATS_NEW_NAME)
    return None


def read_note_file(note_file: Path) -> str:
    try:
        text = note_file.read_text(encoding="utf-8")
    except OSError as e:
        raise SystemExit(
            "RELEASE REFUSED — cannot read --note-file %s: %s"
            % (note_file, e))
    if not text.strip():
        raise SystemExit(
            "RELEASE REFUSED — --note-file is empty or whitespace-only.")
    return text


def copy_whats_new_to_stage(
        repo: Path, stage: Path, *, note_file: Path | None) -> None:
    if note_file is not None:
        content = read_note_file(note_file)
    else:
        refusal = whats_new_refusal(repo)
        if refusal:
            print(refusal, file=sys.stderr)
            raise SystemExit(1)
        content = (repo / WHATS_NEW_NAME).read_text(encoding="utf-8")
    dest = stage / WHATS_NEW_NAME
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content, encoding="utf-8")


def write_release_date(stage: Path, day: datetime.date | None = None) -> str:
    stamp = (day or datetime.date.today()).isoformat()
    (stage / RELEASE_DATE_NAME).write_text(stamp + "\n", encoding="utf-8")
    (stage / LATEST_RELEASE_DATE_NAME).write_text(stamp + "\n", encoding="utf-8")
    return stamp


def run_stage_public(repo: Path, stage: Path) -> int:
    cmd = [
        sys.executable,
        str(REPO_ROOT / "tools" / "stage_public.py"),
        "--out", str(stage),
        "--repo", str(repo),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    if result.returncode != 0:
        print("RELEASE REFUSED — stage_public failed.", file=sys.stderr)
    return result.returncode


def run_compat_check(bank: Path) -> int:
    errs = compat_check.run_checks(bank)
    if errs:
        print("RELEASE REFUSED — compat_check failed:", file=sys.stderr)
        for e in errs:
            print("  - %s" % e, file=sys.stderr)
        return 1
    print("compat_check OK (%s)" % bank)
    return 0


def _fill_slot_after_marker(text: str, marker: str, content: str) -> str:
    if not content:
        return text
    pattern = r"(<!--\s*" + re.escape(marker) + r"\s*-->\n?)"
    replacement = r"\1" + content.rstrip() + "\n"
    if re.search(pattern, text):
        return re.sub(pattern, replacement, text, count=1)
    return text


def sync_update_section(text: str, release_date: str, whats_new: str) -> str:
    """Refresh date + note slots in the update section; other slots stay empty."""
    text = _fill_slot_after_marker(
        text, "OWNER_COPY_UPDATE_NEWEST_DATE", release_date)
    text = _fill_slot_after_marker(
        text, "OWNER_COPY_UPDATE_WHATS_NEW", whats_new.strip())
    return text


def refresh_staged_readme(stage: Path, release_date: str, whats_new: str) -> None:
    readme = stage / "README.md"
    if not readme.is_file():
        print("RELEASE REFUSED — staged README.md missing.", file=sys.stderr)
        raise SystemExit(1)
    text = readme.read_text(encoding="utf-8")
    if UPDATE_SECTION_BEGIN not in text:
        return
    updated = sync_update_section(text, release_date, whats_new)
    readme.write_text(updated, encoding="utf-8")


def append_public_snapshot(stage: Path, public_repo: str) -> int:
    work = tempfile.mkdtemp(prefix="studyroom-public-append-")
    clone = Path(work) / "public"
    try:
        clone_result = subprocess.run(
            ["gh", "repo", "clone", public_repo, str(clone)],
            capture_output=True, text=True)
        if clone_result.returncode != 0:
            print("PUBLIC APPEND FAILED — gh repo clone:", file=sys.stderr)
            print(clone_result.stderr, file=sys.stderr)
            return 1
        for item in list(clone.iterdir()):
            if item.name == ".git":
                continue
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
        for src in stage.rglob("*"):
            if src.is_file():
                rel = src.relative_to(stage)
                dest = clone / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)
        subprocess.run(["git", "-C", str(clone), "add", "-A"], check=True)
        status = subprocess.run(
            ["git", "-C", str(clone), "status", "--porcelain"],
            capture_output=True, text=True, check=True)
        if not status.stdout.strip():
            print("PUBLIC APPEND — nothing to commit (tree unchanged).")
            return 0
        msg = "Public snapshot %s" % datetime.date.today().isoformat()
        commit = subprocess.run(
            ["git", "-C", str(clone), "commit", "-m", msg],
            capture_output=True, text=True)
        if commit.returncode != 0:
            print("PUBLIC APPEND FAILED — git commit:", file=sys.stderr)
            print(commit.stderr, file=sys.stderr)
            return 1
        push = subprocess.run(
            ["git", "-C", str(clone), "push"],
            capture_output=True, text=True)
        if push.returncode != 0:
            print("PUBLIC APPEND FAILED — git push:", file=sys.stderr)
            print(push.stderr, file=sys.stderr)
            return 1
        print("PUBLIC APPEND OK — %s" % public_repo)
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


def build_parser() -> argparse.ArgumentParser:
    # D-05: deliberately no force/bypass/ignore compat flags.
    parser = argparse.ArgumentParser(
        prog="release_public",
        description=(
            "One release ritual: stage_public → note → stamp → "
            "RELEASE_ARTIFACT gate → compat_check → public append. "
            "Stops loud on missing note, failed stage, or failed compat."))
    parser.add_argument(
        "--repo", type=Path, default=REPO_ROOT,
        help="private study-room checkout (default: beside this tool)")
    parser.add_argument(
        "--out", type=Path, required=True,
        help="staging directory (removed and rebuilt by stage_public)")
    parser.add_argument(
        "--bank", type=Path, default=DEFAULT_BANK,
        help="compat bank path (default: tools/compat_bank)")
    parser.add_argument(
        "--public-repo", default=PUBLIC_REPO_DEFAULT,
        help="GitHub repo to append (default: IndoorHuman/study-room)")
    parser.add_argument(
        "--as-test", action="store_true",
        help="run through compat then stop — never clone/push public home")
    parser.add_argument(
        "--note-file", type=Path, default=None,
        help="test/suite injection path for WHATS_NEW (never drafts prose)")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    repo = args.repo.resolve()
    stage = args.out.resolve()
    bank = args.bank
    if not bank.is_absolute():
        bank = (Path.cwd() / bank).resolve()

    if run_stage_public(repo, stage) != 0:
        return 1

    copy_whats_new_to_stage(repo, stage, note_file=args.note_file)
    release_date = write_release_date(stage)
    whats_new = (stage / WHATS_NEW_NAME).read_text(encoding="utf-8")

    missing = missing_release_artifacts(stage)
    if missing:
        print("RELEASE REFUSED — post-injection RELEASE_ARTIFACT gate:", file=sys.stderr)
        for m in missing:
            print("  %s" % m, file=sys.stderr)
        return 1
    print("release artifacts OK — %s + %s + %s on staged tree"
          % (RELEASE_DATE_NAME, LATEST_RELEASE_DATE_NAME, WHATS_NEW_NAME))

    if run_compat_check(bank) != 0:
        return 1

    refresh_staged_readme(stage, release_date, whats_new)

    if args.as_test:
        print("--as-test: stopping before public append (IndoorHuman/study-room untouched).")
        return 0

    return append_public_snapshot(stage, args.public_repo)


if __name__ == "__main__":
    raise SystemExit(main())
