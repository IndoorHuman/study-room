#!/usr/bin/env python3
"""
fetch_vendor.py — one-time dev-machine fetch of the two pinned render libraries.

The Study Room is fully offline at runtime (D-01): no CDN <script> tags, ever.
This script is the ONLY sanctioned network touch — a build-step that downloads
the two human-approved, hash-pinned vendor files into vendor/ and verifies each
byte-for-byte against its recorded SHA-256 (D-03, threat T-22-SC).

Pins (approved at the Phase 22 package-legitimacy checkpoint, 2026-07-15):
  * marked    18.0.5  lib/marked.umd.js   (the npm-package file, NOT jsDelivr's
                                           dynamically-Terser-minified variant —
                                           generated .min files have unstable
                                           hashes and must never be pinned)
  * DOMPurify 3.4.11  dist/purify.min.js

Behavior per entry:
  - dest exists and SHA-256 matches  -> OK, no network (idempotent re-run)
  - missing or mismatched            -> download (primary CDN, then fallback),
                                        temp-then-rename write in the SAME
                                        directory, re-verify; on final mismatch
                                        delete the file, print the error, exit 1.
On success, (re)writes vendor/SHA256SUMS in `shasum -a 256` format and prints
one `vendor OK` line.

Stdlib only (urllib.request, hashlib, pathlib, tempfile) — D-03/D-04. Never
substitutes files or versions on failure: a failed download or hash mismatch is
a hard stop for a human to investigate (supply-chain rule).
"""
import hashlib
import os
import sys
import tempfile
import urllib.request
from pathlib import Path

# Resolve the repo root from this file's location so the script runs from any cwd.
REPO_ROOT = Path(__file__).resolve().parent.parent
VENDOR_DIR = REPO_ROOT / "vendor"

PINNED = [
    {
        "url": "https://cdn.jsdelivr.net/npm/marked@18.0.5/lib/marked.umd.js",
        "fallback_url": "https://unpkg.com/marked@18.0.5/lib/marked.umd.js",
        "dest": "vendor/marked.umd.js",
        "sha256": "2dc4769dfde29f51c7aca1a539c6407c789c8ea644cf8b7d01ded28a9c1d800b",
    },
    {
        "url": "https://cdn.jsdelivr.net/npm/dompurify@3.4.11/dist/purify.min.js",
        "fallback_url": "https://unpkg.com/dompurify@3.4.11/dist/purify.min.js",
        "dest": "vendor/purify.min.js",
        "sha256": "dbabb5b205a333ec49c8c09e7fca30ef66df0523bb8bc0fa9ea843841f111dbd",
    },
]


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def download(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as resp:
        return resp.read()


def write_atomic(target: Path, data: bytes) -> None:
    """Temp-then-rename in the SAME directory so the rename is an atomic
    same-filesystem os.replace — a crash never leaves a half-written vendor file."""
    fd, tmp = tempfile.mkstemp(dir=str(target.parent), prefix=".tmp-", suffix=".swap")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, str(target))
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def fetch_entry(entry: dict) -> None:
    dest = REPO_ROOT / entry["dest"]
    pinned = entry["sha256"]

    if dest.exists() and sha256_of(dest) == pinned:
        print(f"  {entry['dest']}: present, SHA-256 verified (no download)")
        return

    dest.parent.mkdir(parents=True, exist_ok=True)
    data = None
    for url in (entry["url"], entry["fallback_url"]):
        try:
            print(f"  downloading {url}")
            data = download(url)
            break
        except Exception as e:
            print(f"  WARN: download failed from {url}: {e}")
    if data is None:
        print(f"ERROR: could not download {entry['dest']} from either CDN. "
              f"Do NOT substitute files or versions — investigate before retrying.")
        sys.exit(1)

    write_atomic(dest, data)

    actual = sha256_of(dest)
    if actual != pinned:
        dest.unlink()
        print(f"ERROR: SHA-256 mismatch for {entry['dest']}\n"
              f"  expected: {pinned}\n"
              f"  actual:   {actual}\n"
              f"The downloaded file was DELETED. This may indicate CDN tampering "
              f"or a wrong pin — stop and verify provenance by hand (T-22-SC).")
        sys.exit(1)
    print(f"  {entry['dest']}: downloaded, SHA-256 verified")


def write_sha256sums() -> None:
    """Write vendor/SHA256SUMS in `shasum -a 256` format (relative to vendor/),
    so `cd vendor && shasum -a 256 -c SHA256SUMS` verifies both files."""
    lines = []
    for entry in PINNED:
        name = Path(entry["dest"]).name
        lines.append(f"{entry['sha256']}  {name}\n")
    write_atomic(VENDOR_DIR / "SHA256SUMS", "".join(lines).encode("utf-8"))


def main() -> None:
    for entry in PINNED:
        fetch_entry(entry)
    write_sha256sums()
    print("vendor OK")


if __name__ == "__main__":
    main()
