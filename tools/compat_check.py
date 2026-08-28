#!/usr/bin/env python3
"""compat_check — both-direction release gate over tools/compat_bank/ (UPD-06).

D-04 / D-05 / map #144:
  * Forward: current migrate_store accepts every older banked items.json.
  * Backward: newest sample emits only keys listed in freeze_manifest.json.
  * No --force / --skip / --ignore switch. A breaking change requires a
    visible bank or manifest edit plus her release note.

Samples are throwaway fixtures only — never ~/StudyRoom, never live keys.

Usage:
  python3 tools/compat_check.py
  python3 tools/compat_check.py --bank tools/compat_bank

Exit 0 on success; non-zero with a loud reason on failure.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from copy import deepcopy
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import study_lib  # noqa: E402

DATE_DIR_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DEFAULT_BANK = REPO_ROOT / "tools" / "compat_bank"


def dated_sample_dirs(bank: Path) -> list[Path]:
    return sorted(
        p for p in bank.iterdir()
        if p.is_dir() and DATE_DIR_RE.match(p.name))


def load_manifest(bank: Path) -> dict:
    path = bank / "freeze_manifest.json"
    if not path.is_file():
        raise FileNotFoundError(
            "freeze_manifest.json missing under %s" % bank)
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("freeze_manifest.json must be a JSON object")
    return data


def check_forward(bank: Path) -> list[str]:
    """New code must read every older banked store sample."""
    errs: list[str] = []
    samples = dated_sample_dirs(bank)
    if not samples:
        return ["no dated sample directories under %s" % bank]
    for sample in samples:
        store_path = sample / "items.json"
        if not store_path.is_file():
            continue
        try:
            raw = json.loads(store_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            errs.append("%s/items.json unreadable: %s" % (sample.name, e))
            continue
        if not isinstance(raw, dict):
            errs.append("%s/items.json must be a JSON object" % sample.name)
            continue
        # Synthetic library root — never her live path.
        lib_root = Path("/tmp/compat-bank-forward-%s" % sample.name)
        try:
            migrated = study_lib.migrate_store(deepcopy(raw), lib_root)
        except Exception as e:  # noqa: BLE001 — loud gate; surface any raise
            errs.append(
                "forward: migrate_store raised on %s: %s" % (sample.name, e))
            continue
        version = migrated.get("schema_version") if isinstance(
            migrated, dict) else None
        if version != study_lib.SCHEMA_VERSION:
            errs.append(
                "forward: %s migrated to schema_version=%r, expected %s"
                % (sample.name, version, study_lib.SCHEMA_VERSION))
        settings_path = sample / "settings.json"
        if settings_path.is_file():
            try:
                settings = json.loads(
                    settings_path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as e:
                errs.append(
                    "%s/settings.json unreadable: %s" % (sample.name, e))
                continue
            if not isinstance(settings, dict):
                errs.append(
                    "%s/settings.json must be a JSON object" % sample.name)
    return errs


def _collect_emitted_keys(sample: Path) -> dict[str, set[str]]:
    emitted = {
        "store_keys": set(),
        "meta_keys": set(),
        "item_keys": set(),
        "settings_keys": set(),
        "files": set(),
    }
    store_path = sample / "items.json"
    if store_path.is_file():
        emitted["files"].add("items.json")
        store = json.loads(store_path.read_text(encoding="utf-8"))
        if isinstance(store, dict):
            emitted["store_keys"].update(store.keys())
            meta = store.get("meta")
            if isinstance(meta, dict):
                emitted["meta_keys"].update(meta.keys())
            items = store.get("items")
            if isinstance(items, dict):
                for item in items.values():
                    if isinstance(item, dict):
                        emitted["item_keys"].update(item.keys())
    settings_path = sample / "settings.json"
    if settings_path.is_file():
        emitted["files"].add("settings.json")
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
        if isinstance(settings, dict):
            emitted["settings_keys"].update(settings.keys())
    return emitted


def check_backward(bank: Path) -> list[str]:
    """Newest sample may emit only freeze_manifest keys (union grows only)."""
    errs: list[str] = []
    try:
        manifest = load_manifest(bank)
    except (OSError, ValueError, FileNotFoundError) as e:
        return ["backward: %s" % e]
    samples = dated_sample_dirs(bank)
    if not samples:
        return ["no dated sample directories under %s" % bank]
    newest = samples[-1]
    try:
        emitted = _collect_emitted_keys(newest)
    except (OSError, ValueError) as e:
        return ["backward: newest sample %s unreadable: %s" % (newest.name, e)]

    for bucket in ("store_keys", "meta_keys", "item_keys", "settings_keys",
                   "files"):
        allowed = set(manifest.get(bucket) or [])
        extra = sorted(emitted[bucket] - allowed)
        if extra:
            errs.append(
                "backward: %s emitted unknown %s not in freeze_manifest: %s"
                % (newest.name, bucket, ", ".join(extra)))
    return errs


def run_checks(bank: Path) -> list[str]:
    errs: list[str] = []
    if not bank.is_dir():
        return ["compat bank missing: %s" % bank]
    readme = bank / "README.md"
    if not readme.is_file():
        errs.append("compat bank README.md missing (throwaway fence)")
    else:
        text = readme.read_text(encoding="utf-8").lower()
        if "throwaway" not in text:
            errs.append("compat bank README must say throwaway")
    samples = dated_sample_dirs(bank)
    if len(samples) < 1:
        errs.append("compat bank has no dated sample directories")
    errs.extend(check_forward(bank))
    errs.extend(check_backward(bank))
    return errs


def build_parser() -> argparse.ArgumentParser:
    # D-05: deliberately no force/skip/ignore flags.
    parser = argparse.ArgumentParser(
        prog="compat_check",
        description=(
            "Both-direction compat gate over tools/compat_bank/. "
            "No force/skip switch — a break needs a bank/manifest edit "
            "and her release note (D-05)."))
    parser.add_argument(
        "--bank",
        type=Path,
        default=DEFAULT_BANK,
        help="path to compat bank (default: tools/compat_bank)")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    bank = args.bank
    if not bank.is_absolute():
        bank = (Path.cwd() / bank).resolve()
    errs = run_checks(bank)
    if errs:
        print("COMPAT CHECK FAILED", file=sys.stderr)
        for e in errs:
            print("  - %s" % e, file=sys.stderr)
        return 1
    print("compat_check OK (%s)" % bank)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
