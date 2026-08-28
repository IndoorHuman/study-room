#!/usr/bin/env python3
"""
make_album_fixture.py — the image-bearing scratch library for the album UAT
(Phase 24, plan 24-04, SRM-06).

The live library holds only text items, so the album path — the thumbnail
grid, the pile hint, and the trigger-hidden gate — can never be observed
against it. This script builds a small, reproducible scratch library of
exactly three images so a browser session can walk that path on real store
data:

  photo-blessed.png  -> state 'blessed', saved over 30 days ago (also
                        shelf-eligible); the ONE thumbnail the grid shows.
                        Solid warm green, so it is easy to spot.
  photo-waiting.png  -> state 'unseen', clean; the "1 more photo awaits in
                        the pile" hint counts exactly this one.
                        Solid warm amber.
  photo-private.png  -> state 'unseen' with the trigger flag set; it must
                        appear NOWHERE — not in the grid, not in the hint
                        count. Solid quiet gray.

Everything rides the real pipeline: the images are imported through
study_lib.import_folder and persisted through study_lib.save_store — no
hand-assembled store. State changes afterwards match items BY TITLE, never
by an assumed id (ids are content hashes).

Zero dependencies (stdlib only). Run from the repo root:

    python3 tests/make_album_fixture.py

Idempotent: every run rebuilds both scratch folders from scratch. It only
ever touches tests/fixtures/ — never a real library.
"""
import os
import shutil
import struct
import sys
import time
import zlib
from datetime import datetime
from pathlib import Path

# The script lives in tests/; the repo root is one level up. Adding it to
# sys.path lets a plain `import study_lib` resolve regardless of cwd.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import study_lib  # noqa: E402

_FIXTURES = Path(__file__).resolve().parent / "fixtures"
SRC_DIR = _FIXTURES / "album-uat-src"
LIB_DIR = _FIXTURES / "album-uat-library"

# The blessed photo is aged past the 30-day shelf window (D-15 register:
# "prefer items never opened or not opened in 30+ days").
BLESSED_AGE_DAYS = 40

# title -> (rgb fill, role) — distinct solid colors so the blessed one is
# visually identifiable in the grid at a glance.
PHOTOS = {
    "photo-blessed.png": ((79, 123, 67), "blessed"),    # warm green
    "photo-waiting.png": ((196, 148, 90), "waiting"),   # warm amber
    "photo-private.png": ((108, 108, 116), "private"),  # quiet gray
}

EXPECTED = {
    # title: (state, trigger)
    "photo-blessed.png": ("blessed", False),
    "photo-waiting.png": ("unseen", False),
    "photo-private.png": ("unseen", True),
}


def solid_png(width: int, height: int, rgb) -> bytes:
    """A complete, valid, browser-decodable PNG of one solid color, built
    entirely with struct + zlib (the Phase 23 struct-built-bytes precedent,
    extended with a real IDAT so the picture actually renders)."""
    def chunk(tag: bytes, payload: bytes) -> bytes:
        body = tag + payload
        return (struct.pack(">I", len(payload)) + body +
                struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    row = b"\x00" + bytes(rgb) * width          # filter 0 + raw pixels
    idat = zlib.compress(row * height)
    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


def _fresh_dir(path: Path) -> None:
    """Empty and recreate one of the two scratch folders. Guarded: refuses
    anything outside tests/fixtures/ so a bad edit can never sweep a real
    folder away."""
    path = path.resolve()
    if _FIXTURES.resolve() not in path.parents:
        raise SystemExit(f"refusing to rebuild a non-fixture path: {path}")
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True)


def build_fixture(dest_root: Path = LIB_DIR, src_dir: Path = SRC_DIR) -> Path:
    """Build the scratch source folder, import it into a scratch library at
    `dest_root` through the real study_lib pipeline, then set the three item
    states through the store (matched by title). Returns the library root."""
    _fresh_dir(src_dir)
    _fresh_dir(dest_root)

    # 1. Three tiny valid PNGs, distinct bytes -> distinct content-hash ids.
    for name, (rgb, _role) in PHOTOS.items():
        (src_dir / name).write_bytes(solid_png(8, 8, rgb))

    # 2. Age the blessed photo BEFORE import: saved_ms is read from the
    # source file's mtime, so os.utime makes the 30+ day age flow through
    # the real import path instead of being hand-edited into the store.
    old_s = time.time() - BLESSED_AGE_DAYS * 24 * 3600
    os.utime(src_dir / "photo-blessed.png", (old_s, old_s))

    # 3. The real pipeline: walk -> hash -> copy -> atomic persist.
    report = study_lib.import_folder(src_dir, dest_root)
    if report["imported"] != 3:
        raise SystemExit(
            f"expected 3 imported images, got {report['imported']} "
            f"(report: {report})")

    # 4. Set states through the store, matching by TITLE — ids are content
    # hashes generated by study_lib and are never assumed here.
    store = study_lib.load_store(dest_root)
    by_title = {item["title"]: item for item in store["items"].values()}
    missing = sorted(set(PHOTOS) - set(by_title))
    if missing:
        raise SystemExit(f"imported store is missing titles: {missing}")

    def move_state(item: dict, to: str) -> None:
        item["history"].append({
            "at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "from": item["state"],
            "to": to,
            "via": "fixture-setup",
        })
        item["state"] = to

    move_state(by_title["photo-blessed.png"], "blessed")
    # photo-waiting.png stays 'unseen' — the clean pile photo.
    by_title["photo-private.png"]["trigger"] = True  # unseen AND trigger-set

    study_lib.save_store(dest_root, store)
    return dest_root


def self_check(dest_root: Path = LIB_DIR):
    """Reload the store from disk and verify the exact shape the UAT needs.
    Returns (problems, ledger) — problems is empty when everything holds."""
    problems = []
    ledger = []
    store = study_lib.load_store(dest_root)
    images = [i for i in store["items"].values() if i["type"] == "image"]

    if len(images) != 3:
        problems.append(f"expected exactly 3 image items, found {len(images)}")

    seen_titles = set()
    now_ms = int(time.time() * 1000)
    for item in sorted(images, key=lambda i: i["title"]):
        title = item["title"]
        trigger = bool(item.get("trigger"))
        ledger.append(f"  title={title}  id={item['id']}  "
                      f"state={item['state']}  trigger={trigger}")
        seen_titles.add(title)
        expected = EXPECTED.get(title)
        if expected is None:
            problems.append(f"unexpected image item: {title}")
            continue
        want_state, want_trigger = expected
        if item["state"] != want_state:
            problems.append(
                f"{title}: state is {item['state']!r}, wanted {want_state!r}")
        if trigger is not want_trigger:
            problems.append(
                f"{title}: trigger is {trigger}, wanted {want_trigger}")
        if title == "photo-blessed.png":
            age_days = (now_ms - item["saved_ms"]) / (24 * 3600 * 1000)
            if age_days < 30:
                problems.append(
                    f"{title}: saved_ms is only {age_days:.1f} days old — "
                    f"must be over 30 for shelf eligibility")

    for title in sorted(set(EXPECTED) - seen_titles):
        problems.append(f"missing image item: {title}")

    return problems, ledger


def main() -> int:
    dest_root = build_fixture()
    problems, ledger = self_check(dest_root)

    print(str(dest_root.resolve()))
    for line in ledger:
        print(line)

    if problems:
        print("SELF-CHECK FAILED:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print("self-check: 3 images — 1 blessed, 1 unseen, 1 unseen+trigger — ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
