#!/usr/bin/env python3
"""
build_demo_store.py — idempotent Mansfield DEMO STORE builder (Phase 27-02).

Builds a self-contained second library the app re-points to for demo day
(D-06 / D-08 / D-20):

  1. Fresh store via study_lib.new_store (through import_folder).
  2. Import the PROCESSED Mansfield vault through the SHIPPED
     study_lib.import_folder — no demo-only fork.
  3. Pre-bless a curated non-Journal subset; leave the rest unseen.
     NEVER bless fenced Journal/ items (law 5 / T-27-04).
  4. Write pre-generated reflection + desk-note files under librarian/
     shaped as a session close would produce — ZERO live librarian/API
     calls (D-08).
  5. The raw holdout (~/mansfield-raw-holdout/) is NOT imported here; it
     stays staged as the live processing-beat drop (D-20).

Re-point at demo time uses the shipped POST /api/library. This script
does NOT touch server.py / app.js.

Zero dependencies (stdlib + study_lib). Run from anywhere:

    python3 tools/build_demo_store.py
    python3 tools/build_demo_store.py --dest ~/StudyRoomDemo
    python3 tools/build_demo_store.py --check   # self-check only

Idempotent: every run rebuilds the target library from scratch.
"""
from __future__ import annotations

import argparse
import json
import random
import shutil
import sys
from datetime import datetime
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import study_lib  # noqa: E402

# Canonical processed vault (CONTEXT D-06); local copies are fall-backs so a
# hermetic / offline machine without iCloud still builds.
_VAULT_CANDIDATES = (
    Path.home() / "Library/Mobile Documents/iCloud~md~obsidian/Documents"
                  / "Mansfield Vault",
    Path.home() / "mansfield-demo-vault",
    Path.home() / "mansfield-drip-vault",
)

DEFAULT_DEST = Path.home() / "StudyRoomDemo"
DEFAULT_HOLDOUT = Path.home() / "mansfield-raw-holdout"

# Deterministic seed — same picks every rebuild (bless.py precedent).
BLESS_SEED = 1915

# Curated shelf seed. Journal is INTENTIONALLY absent (law 5 / T-27-04).
BLESS_QUOTA = {
    "Letters": 25,
    "Works": 15,
    "Reading notes": 2,
    "Personal KB": 2,
    "Wiki": 1,
    "Hubs": 2,
    "portrait": 3,
}

# Frozen demo-day stamp for note filenames (server mints YYYY-MM-DD-note.md).
DEMO_DAY = "2026-08-18"

# Public-domain voice: Katherine Mansfield / Murry framing — never the owner's
# vault. Desk note = plain body (server note writer); reflection = the
# _reflection_frontmatter write-back shape.
_DESK_NOTE_BODY = (
    "lately the letters keep circling the same small room — the one where "
    "she watches the light move across a table and decides the day has "
    "already been enough. the works on the shelf remember the same "
    "patience: a sentence held until it cools. nothing here asks for more "
    "than one quiet reread."
)

_REFLECTION_TITLE = "butterfly leaves just ready to fly"
_REFLECTION_TEXT = (
    "The letters keep returning to small rooms and the light on a table. "
    "What surfaces is not a plot but a habit of attention — the same "
    "patience the fiction holds when a sentence is left to cool. Nothing "
    "here asks for more than one quiet reread of what was already saved."
)


def resolve_vault(explicit: Path | None = None) -> Path:
    """First existing processed Mansfield vault, or raise SystemExit."""
    if explicit is not None:
        p = explicit.expanduser().resolve()
        if not (p.is_dir() and (p / ".obsidian").is_dir()):
            raise SystemExit(f"vault is not an Obsidian vault: {p}")
        return p
    for cand in _VAULT_CANDIDATES:
        if cand.is_dir() and (cand / ".obsidian").is_dir():
            return cand.resolve()
    raise SystemExit(
        "no processed Mansfield vault found. Looked for:\n  "
        + "\n  ".join(str(c) for c in _VAULT_CANDIDATES))


def _top_folder(item: dict) -> str:
    """Vault top-level segment (Letters / Journal / Works / …)."""
    folder = str(item.get("folder") or "").strip()
    if folder:
        return folder
    op = str(item.get("origin_path") or "").replace("\\", "/")
    parts = [p for p in op.split("/") if p]
    return parts[-2] if len(parts) >= 2 else ""


def is_fenced_journal(item: dict) -> bool:
    """True when the item lives under the Mansfield fenced Journal/."""
    if str(item.get("folder") or "") == "Journal":
        return True
    op = str(item.get("origin_path") or "").replace("\\", "/")
    return "Journal" in op.split("/")


def _fresh_library(dest: Path) -> None:
    """Empty and recreate the demo library. Refuses paths that do not look
    like a Study Room library (or an empty/new dir) so a bad --dest cannot
    sweep an unrelated folder."""
    dest = dest.resolve()
    if dest.exists():
        if dest.is_file():
            raise SystemExit(f"refusing to rebuild a file path: {dest}")
        markers = ("items.json", "items", "librarian")
        kids = list(dest.iterdir()) if dest.is_dir() else []
        looks_like_lib = any((dest / m).exists() for m in markers)
        if kids and not looks_like_lib:
            raise SystemExit(
                f"refusing to rebuild a non-library directory: {dest} "
                f"(pass an empty dir or an existing Study Room library)")
        shutil.rmtree(dest)
    dest.mkdir(parents=True)


def _move_blessed(item: dict) -> None:
    item["history"].append({
        "at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "from": item["state"],
        "to": "blessed",
        "via": "demo-store-setup",
    })
    item["state"] = "blessed"


def pre_bless(store: dict) -> list[str]:
    """Bless a curated non-Journal subset. Returns blessed titles."""
    by_folder: dict[str, list[dict]] = {}
    for item in store["items"].values():
        if is_fenced_journal(item):
            continue
        if item.get("state") in ("never_show", "retired"):
            continue
        if item.get("trigger") is True:
            continue
        by_folder.setdefault(_top_folder(item), []).append(item)

    rnd = random.Random(BLESS_SEED)
    blessed_titles: list[str] = []
    for folder, quota in BLESS_QUOTA.items():
        pool = list(by_folder.get(folder) or [])
        rnd.shuffle(pool)
        for item in pool[:quota]:
            if is_fenced_journal(item):
                continue  # belt-and-suspenders (T-27-04)
            _move_blessed(item)
            blessed_titles.append(str(item.get("title") or item["id"]))
    return blessed_titles


def write_offline_librarian(library_root: Path, blessed_titles: list[str]) -> None:
    """Pre-generated desk note + reflection under librarian/ — no API."""
    lib = Path(library_root)
    notes = lib / "librarian" / "notes"
    notes.mkdir(parents=True, exist_ok=True)

    # Desk note — exact server mint shape (YYYY-MM-DD-note.md, plain body).
    (notes / f"{DEMO_DAY}-note.md").write_text(
        _DESK_NOTE_BODY + "\n", encoding="utf-8")

    # Reflection — _reflection_frontmatter shape (session write-back twin).
    reflects = []
    if blessed_titles:
        # Vault-relative paths are illustrative anchors; demo reflections
        # never cite fenced Journal/ material.
        reflects = [f"Letters/{blessed_titles[0]}"]
    body = study_lib._reflection_frontmatter(
        _REFLECTION_TITLE, _REFLECTION_TEXT, reflects, DEMO_DAY)
    body += _REFLECTION_TEXT + "\n"
    refl_dir = lib / "librarian" / "reflections"
    refl_dir.mkdir(parents=True, exist_ok=True)
    safe = "".join(
        c if c.isalnum() or c in " -_" else "-"
        for c in _REFLECTION_TITLE).strip("-")[:60] or "reflection"
    (refl_dir / f"{safe}.md").write_text(body, encoding="utf-8")

    # Call memory — shaped as session close would leave it (outcome stamped).
    study_lib.save_reflections(lib, [{
        "title": _REFLECTION_TITLE,
        "shape": "quote-first",
        "outcome": "saved",
        "model": None,
        "ms": int(datetime(2026, 8, 18, 12, 0, 0).timestamp() * 1000),
    }])


def build_demo_store(
    dest: Path | None = None,
    vault: Path | None = None,
) -> Path:
    """Rebuild the Mansfield demo library at `dest`. Returns dest."""
    dest = (dest or DEFAULT_DEST).expanduser().resolve()
    vault_path = resolve_vault(vault)

    _fresh_library(dest)
    report = study_lib.import_folder(str(vault_path), str(dest))
    if report.get("imported", 0) < 1:
        raise SystemExit(
            f"import produced no items (report={report}); "
            f"vault={vault_path}")

    store = study_lib.load_store(dest)
    blessed_titles = pre_bless(store)
    if not blessed_titles:
        raise SystemExit("pre-bless selected zero items — check BLESS_QUOTA")
    study_lib.save_store(dest, store)
    write_offline_librarian(dest, blessed_titles)
    # impact-metrics 08: wall survey invite (demo Form).
    import importlib.util
    _ps = Path(__file__).resolve().parent / "place_survey_wall_item.py"
    _spec = importlib.util.spec_from_file_location("place_survey_wall_item", _ps)
    _mod = importlib.util.module_from_spec(_spec)
    assert _spec.loader is not None
    _spec.loader.exec_module(_mod)
    _mod.place(dest, "demo")
    return dest


def self_check(dest: Path) -> list[str]:
    """Return problem strings (empty = ok). Used by --check and the suite."""
    problems: list[str] = []
    dest = Path(dest)
    try:
        store = study_lib.load_store(dest)
    except (OSError, study_lib.StoreCorruptError, FileNotFoundError) as e:
        return [f"cannot load store at {dest}: {e}"]

    items = list(store["items"].values())
    blessed = [i for i in items if i.get("state") == "blessed"]
    unseen = [i for i in items if i.get("state") == "unseen"]
    if len(blessed) < 1:
        problems.append("expected ≥1 blessed item")
    if len(unseen) < 1:
        problems.append("expected ≥1 unseen item")

    journal_blessed = [i for i in blessed if is_fenced_journal(i)]
    if journal_blessed:
        problems.append(
            f"{len(journal_blessed)} blessed item(s) under fenced Journal/ "
            f"(law 5 / T-27-04)")

    refl_files = list((dest / "librarian").rglob("*.md")) if (
        dest / "librarian").is_dir() else []
    has_frontmatter = False
    for p in refl_files:
        try:
            text = p.read_text(encoding="utf-8")
        except OSError:
            continue
        if text.startswith("---") and "reflects:" in text and "type: note" in text:
            has_frontmatter = True
            break
    if not has_frontmatter:
        problems.append(
            "librarian/ lacks a pre-generated reflection in "
            "_reflection_frontmatter shape")

    note = dest / "librarian" / "notes" / f"{DEMO_DAY}-note.md"
    if not note.is_file():
        problems.append(f"missing desk note {note.name}")

    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Build the Mansfield demo Study Room library (offline).")
    ap.add_argument(
        "--dest", type=Path, default=DEFAULT_DEST,
        help=f"demo library path (default: {DEFAULT_DEST})")
    ap.add_argument(
        "--vault", type=Path, default=None,
        help="processed Mansfield vault (default: first available candidate)")
    ap.add_argument(
        "--check", action="store_true",
        help="self-check an existing demo library; do not rebuild")
    args = ap.parse_args(argv)

    if args.check:
        problems = self_check(args.dest.expanduser())
        if problems:
            print("SELF-CHECK FAILED:", file=sys.stderr)
            for p in problems:
                print(f"  - {p}", file=sys.stderr)
            return 1
        store = study_lib.load_store(args.dest.expanduser())
        n = len(store["items"])
        b = sum(1 for i in store["items"].values() if i["state"] == "blessed")
        u = sum(1 for i in store["items"].values() if i["state"] == "unseen")
        print(f"{Path(args.dest).expanduser().resolve()}")
        print(f"self-check: {n} items — {b} blessed, {u} unseen — ok")
        return 0

    dest = build_demo_store(args.dest, args.vault)
    problems = self_check(dest)
    store = study_lib.load_store(dest)
    n = len(store["items"])
    b = sum(1 for i in store["items"].values() if i["state"] == "blessed")
    u = sum(1 for i in store["items"].values() if i["state"] == "unseen")
    print(str(dest))
    print(f"vault: {resolve_vault(args.vault)}")
    print(f"items: {n}  blessed: {b}  unseen: {u}")
    print(f"holdout (staged, not imported): {DEFAULT_HOLDOUT}")
    if problems:
        print("SELF-CHECK FAILED:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print("self-check: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
