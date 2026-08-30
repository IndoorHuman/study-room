#!/usr/bin/env python3
"""install_agent_skills — copy bundled skills/ into common agent skill folders.

Every Study Room download includes `skills/` (see skills/README.md). This
command installs those skills into the user's agent config — one copy per
known tool, idempotent.

USAGE
  python3 tools/install_agent_skills.py
  python3 tools/install_agent_skills.py --dry-run
  python3 tools/install_agent_skills.py --source /path/to/study-room

⛔ Never pushes git, never fetches network, never touches the library folder.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

# Typical skills roots — create only when installing (missing parent is ok).
AGENT_SKILL_ROOTS = (
    Path.home() / ".cursor" / "skills",
    Path.home() / ".claude" / "skills",
    Path.home() / ".codex" / "skills",
)


def bundled_skills(source: Path) -> list[Path]:
    skills_dir = source / "skills"
    if not skills_dir.is_dir():
        return []
    out = []
    for child in sorted(skills_dir.iterdir()):
        if child.is_dir() and (child / "SKILL.md").is_file():
            out.append(child)
    return out


def install_one(skill_dir: Path, dest_root: Path, *, dry_run: bool) -> Path:
    dest = dest_root / skill_dir.name
    if dry_run:
        return dest
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copy2(skill_dir / "SKILL.md", dest / "SKILL.md")
    readme = skill_dir / "README.md"
    if readme.is_file():
        shutil.copy2(readme, dest / "README.md")
    return dest


def install_all(source: Path, *, dry_run: bool = False) -> int:
    skills = bundled_skills(source)
    if not skills:
        print(
            "INSTALL REFUSED — no skills/ with SKILL.md under: %s" % source,
            file=sys.stderr,
        )
        return 1
    for skill_dir in skills:
        for root in AGENT_SKILL_ROOTS:
            dest = install_one(skill_dir, root, dry_run=dry_run)
            verb = "would install" if dry_run else "installed"
            print("%s %s -> %s" % (verb, skill_dir.name, dest))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Install bundled Study Room agent skills from skills/.")
    ap.add_argument(
        "--source",
        type=Path,
        default=REPO_ROOT,
        help="app folder containing skills/ (default: this repo)",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="print destinations without writing",
    )
    args = ap.parse_args()
    source = args.source.resolve()
    return install_all(source, dry_run=args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
