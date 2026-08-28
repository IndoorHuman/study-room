#!/usr/bin/env python3
"""backup_library — copy the irreplaceable, then prove the copy is the RIGHT file.

THE GATE IS THE POINT; THE COPYING IS INCIDENTAL. Phase 26.94 flips ~3,575
items from `type: image` to `type: text`, repoints their `library_path` at
newly-written notes, and moves their snapshots into `attachments/`. That is a
one-way door over a library holding 16,559 items and every judgement the owner
has ever made. D-13 (her ruling, 2026-08-13): back up FIRST, prove the backup
is readable, and only then run.

WHAT IT COPIES
  TIER 1 — the small, irreplaceable metadata (~16.2 MB): items.json,
  decorations.json, layout.json, the whole librarian/ tree, and both adapter
  ledgers. (blessings.json is NOT a library-root sibling: blessings_file_path
  resolves to librarian/blessings.json and is therefore already inside the
  librarian/ tree above -- and that placement is why it shares librarian/'s
  factory-reset lifetime. decorations.json IS a root sibling, deliberately:
  study_lib says "DO NOT MOVE THIS FILE FOR CONSISTENCY WITH blessings.json.
  The inconsistency is deliberate and is the feature." Both are backed up;
  neither is parallel to the other.)

  TIER 2 — only the screenshot snapshots the note pass will move, copied BY
  PATH into <dest>/items-screenshots/ in ascending item-id order.

WHAT IT REFUSES
  A destination inside the library root, and any destination whose basename
  matches `items.json.*`. The library root already holds FIVE stale artifacts
  under that glob, three weeks old and predating the photograph import
  entirely; a sixth would join a pile that is already indistinguishable by
  name. The glob matters and the loose one is wrong -- measured 2026-08-13,
  `items.json.*` matches all five while `items.json*.bak` matches only three,
  because two of the five do not end in `.bak`.

WHY THE BY-VALUE COUNTS EXIST (RESEARCH Pitfall 9)
  A backup that PARSES but is the WRONG FILE is the failure mode a size check
  and a checksum both miss. The three stale ~2.2 MB artifacts in the library
  root are valid JSON at the right schema version -- they load cleanly and
  they are missing the entire photograph library. So `verify` asserts, in
  order: sha256 identity per copied file, a real study_lib.load_store parse
  (the verifier IS the shipped reader -- a copy the reader refuses is not a
  backup), and then the five counts BY VALUE. The counts are the only one of
  the three that can tell a good file from a plausible one.

  It never acquires WRITE_LOCK. It reads, and the verify step re-reads from
  the copy, so a concurrent write shows up as a sha256 mismatch rather than
  being silently copied half-written.

ROLLBACK
  `rollback` restores items.json -- which alone reverses every type flip,
  every library_path repoint, every attachments entry and every tag change,
  because the store is the single source of truth for all of it -- restores
  the moved snapshots, then removes everything new BY SET DIFFERENCE against
  the restored store's own library_path and attachments values.

USAGE
  python3 tools/backup_library.py backup [--dest DIR] [--tier2-list FILE]
  python3 tools/backup_library.py verify DIR
  python3 tools/backup_library.py rollback DIR
"""

import argparse
import datetime
import fnmatch
import hashlib
import json
import shutil
import socket
import sys
import unicodedata
from pathlib import Path, PurePosixPath

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import study_lib                       # noqa: E402
import server                          # noqa: E402


# --------------------------------------------------------------------------
# What is at risk, and what the copy must prove.
# --------------------------------------------------------------------------

# Tier 1, in the order it is copied. items.json is REQUIRED -- without it
# there is no backup at all; the rest are copied when present. Every path here
# is library-root-relative POSIX, which is also how it is recorded in the
# manifest and how rollback puts it back.
TIER1_FILES = (
    "items.json",
    "decorations.json",
    "layout.json",
    "adapters/apple-photos/ledger.json",
    "adapters/apple-notes/ledger.json",
)
TIER1_DIRS = ("librarian",)
TIER1_REQUIRED = ("items.json",)

# The snapshots live here; tier 2 is a subset of this directory.
ITEMS_DIR = "items"
ATTACHMENTS_DIR = "attachments"
# Where tier 2 lands inside the backup. Flat, because every snapshot is
# `items/<id>.<ext>` and the ids are unique.
TIER2_SUBDIR = "items-screenshots"
MANIFEST_NAME = "manifest.json"

# The regenerable Vision cache (plan 26.94-02 creates it as a SIBLING of
# librarian/, never a child -- `rm -rf librarian/` is the documented factory
# reset and D-05 forbids the shared lifetime). Rollback deletes it whole.
VISION_DIR_NAME = "vision"

# ⚠ THE GLOB IS LOAD-BEARING AND THE LOOSE ONE IS WRONG. Measured 2026-08-13:
# `items.json.*` matches all five stale artifacts in the library root
# (items.json.bak-20260721-orphan · items.json.pre-26.4-06-20260722-095504.bak
# · items.json.uat25-backup · items.json.v1.bak · items.json.v2.bak), while
# `items.json*.bak` matches only THREE -- two of the five do not end in .bak.
# A refusal written with the narrower glob would let a sixth sibling through
# under one of the two names it cannot see.
STALE_SIBLING_GLOB = "items.json.*"

# The five counts, stated in advance. They are the discriminator between a
# backup and a plausible-looking wrong file. Overridable per run so the suite
# can drive them against a fixture.
EXPECTED_COUNTS = {
    "items": 16559,
    "image": 13606,
    "blessed": 188,
    "never_show": 68,
    "retired": 11,
}
COUNT_KEYS = ("items", "image", "blessed", "never_show", "retired")

# The proportional band the sanity guard uses (see verify). Wide on purpose:
# it is answering "is this the right LIBRARY", never "is this the right file",
# and the file question is already answered exactly, against the manifest.
SANITY_LOW = 0.5
SANITY_HIGH = 2.0

# Refuse to copy 3.6 GB onto a volume that has no room for it. Measured
# 2026-08-13: 104 GiB free of 460 GiB.
MIN_FREE_BYTES = 8 * 1024 * 1024 * 1024
HASH_CHUNK = 1024 * 1024


# --------------------------------------------------------------------------
# Small pure helpers.
# --------------------------------------------------------------------------

def default_library_root():
    """The library root is RESOLVED, never spelled."""
    return Path(server.resolve_library_root(
        server.REPO_ROOT / "library.local.json")).expanduser()


def utc_stamp(now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return now.strftime("%Y%m%dT%H%M%SZ")


def default_dest(library_root, stamp=None):
    """A stamped directory OUTSIDE the library root -- never a sixth sibling."""
    return Path(library_root).parent / (
        "StudyRoom-backup-26.94-" + (stamp or utc_stamp()))


def norm_rel(path, root):
    """A library-root-relative POSIX string, NFC-normalised.

    NFC because a non-ASCII filename must round-trip through the manifest into
    rollback's set difference without re-encoding: macOS hands back decomposed
    forms from the filesystem and composed forms from JSON, and a set built
    from one that is tested against the other silently declares every such
    file new."""
    rel = Path(path).resolve().relative_to(Path(root).resolve())
    return unicodedata.normalize("NFC", rel.as_posix())


def nfc(text):
    return unicodedata.normalize("NFC", str(text))


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(HASH_CHUNK)
            if not chunk:
                return h.hexdigest()
            h.update(chunk)


def store_counts(store):
    """The five numbers, by value, from a loaded store."""
    items = (store or {}).get("items", {})
    values = list(items.values())
    return {
        "items": len(items),
        "image": sum(1 for i in values if i.get("type") == "image"),
        "blessed": sum(1 for i in values if i.get("state") == "blessed"),
        "never_show": sum(1 for i in values if i.get("state") == "never_show"),
        "retired": sum(1 for i in values if i.get("state") == "retired"),
    }


def backup_location(dest, tier, rel):
    """Where a manifest entry's bytes live inside the backup.

    Tier 1 keeps its library-relative shape so rollback is a plain copy back.
    Tier 2 is flattened into items-screenshots/ because the snapshots are all
    `items/<id>.<ext>` and the ids are already unique."""
    dest = Path(dest)
    if tier == 1:
        return dest / rel
    return dest / TIER2_SUBDIR / PurePosixPath(rel).name


# --------------------------------------------------------------------------
# Choosing the files.
# --------------------------------------------------------------------------

def tier1_paths(library_root):
    """The library-relative POSIX paths of tier 1, sorted, deduped."""
    root = Path(library_root)
    rels = []
    for name in TIER1_FILES:
        if (root / name).is_file():
            rels.append(nfc(name))
    for name in TIER1_DIRS:
        d = root / name
        if not d.is_dir():
            continue
        for p in sorted(d.rglob("*")):
            if p.is_file():
                rels.append(norm_rel(p, root))
    return sorted(set(rels))


def _item_id_of(rel):
    """`items/<id>.<ext>` -> `<id>`; the tier-2 sort key."""
    return PurePosixPath(rel).stem


def tier2_paths(library_root, store, list_file=None):
    """The screenshot snapshots the note pass will move, in ascending item-id
    order.

    ⚠ THE TRUE SET IS NOT DERIVABLE BEFORE THE VISION PASS, AND THIS IS
    MEASURED, NOT FEARED. #40's detection is "no camera model plus exact
    device-screen dimensions, OR Vision's own `screenshot` label" -- and the
    second test needs output this phase has not produced yet. Measured against
    the live store 2026-08-13: the shipped `screenshots` tag and the shipped
    `detect_screenshot` both answer 2,676, of which 16 are false positives and
    1,088 of the true 3,748 are missed -- a 29% under-count. So the derived
    answer is the honest DEFAULT, and `--tier2-list` is how a caller who has
    already measured the union hands it in. The derivation CALLS the shipped
    detector rather than re-implementing it, so the two can never disagree."""
    root = Path(library_root)
    items = (store or {}).get("items", {})

    if list_file is not None:
        rels = []
        for line in Path(list_file).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            p = Path(line)
            rel = norm_rel(p, root) if p.is_absolute() else nfc(
                PurePosixPath(line).as_posix())
            if PurePosixPath(rel).parts[:1] != (ITEMS_DIR,):
                raise ValueError(
                    "tier-2 list holds a path outside items/: " + rel)
            if not (root / rel).is_file():
                raise ValueError("tier-2 list names a missing file: " + rel)
            rels.append(rel)
        chosen = sorted(set(rels), key=_item_id_of)
        return chosen, "the list handed in by the caller"

    rels = []
    for item in items.values():
        if item.get("type") != "image":
            continue
        rel = nfc(item.get("library_path", ""))
        if not rel or not (root / rel).is_file():
            continue
        tagged = "screenshots" in (item.get("tags") or [])
        if tagged or study_lib.detect_screenshot(
                item.get("title", ""),
                study_lib._read_head(str(root / rel))):
            rels.append(rel)
    return sorted(set(rels), key=_item_id_of), (
        "derived from the shipped screenshot detector -- an UNDER-COUNT until "
        "the Vision pass has run (measured 29% short, RESEARCH E-1)")


# --------------------------------------------------------------------------
# backup
# --------------------------------------------------------------------------

def _refusal_for_dest(library_root, dest):
    """One plain-words line, or None."""
    root = Path(library_root).resolve()
    d = Path(dest).resolve()
    if d == root or root in d.parents:
        return ("the destination is inside the library root -- a backup that "
                "lives in the thing it is backing up is not a backup.")
    if fnmatch.fnmatch(d.name, STALE_SIBLING_GLOB):
        return ("the destination is named like an items.json sibling (" +
                d.name + ") -- the library root already holds five of those "
                "and a sixth would join a pile nobody can tell apart.")
    return None


def backup(library_root=None, dest=None, tier2_list=None, expected=None,
           stamp=None, echo=print):
    """Copy tier 1 and tier 2 into a stamped directory and write the manifest.

    Returns {ok, why, dest, counts, tier1, tier2}. Never raises for an
    operator mistake -- a refusal is one plain line, never a traceback."""
    root = Path(library_root or default_library_root()).expanduser().resolve()
    dest = Path(dest or default_dest(root, stamp)).expanduser()
    # ⚠ 2026-08-23: MEASURED FROM THE SOURCE, not taken from a constant. See
    # verify()'s note — a frozen expectation refuses every real backup once
    # the library moves, which it does every time she blesses something.
    if expected is None:
        try:
            expected = store_counts(study_lib.load_store(root))
        except Exception:            # noqa: BLE001 -- one plain line, below
            expected = dict(EXPECTED_COUNTS)
            echo("note: the source store could not be counted, so the frozen "
                 "2026-08 numbers stand in -- verify may refuse a good copy.")
    else:
        expected = dict(expected)

    echo("library root: " + str(root))
    echo("destination:  " + str(dest))

    why = _refusal_for_dest(root, dest)
    if why:
        return {"ok": False, "why": why, "dest": str(dest)}

    for name in TIER1_REQUIRED:
        if not (root / name).is_file():
            return {"ok": False, "dest": str(dest),
                    "why": "there is no " + name + " at " + str(root) +
                           " -- there is nothing here to back up."}

    try:
        store = study_lib.load_store(root)
    except Exception as e:                       # noqa: BLE001 -- one line out
        return {"ok": False, "dest": str(dest),
                "why": "the library's own items.json is not readable by the "
                       "room's reader (" + str(e).split("\n")[0] + ") -- "
                       "refusing to copy a file that is already unreadable."}

    t1 = tier1_paths(root)
    try:
        t2, t2_why = tier2_paths(root, store, tier2_list)
    except ValueError as e:
        return {"ok": False, "dest": str(dest), "why": str(e)}
    echo("tier 2 selection: " + t2_why)

    # ⚠ ASSERTED BEFORE ANY COPY: a file may not be in both tiers, so nothing
    # is ever copied twice or verified twice.
    overlap = sorted(set(t1) & set(t2))
    if overlap:
        return {"ok": False, "dest": str(dest),
                "why": "tier 1 and tier 2 both name " + overlap[0] +
                       " -- the two tiers must be disjoint."}

    required = sum((root / rel).stat().st_size for rel in t1 + t2)
    free = shutil.disk_usage(str(dest.parent if dest.parent.exists()
                                 else root)).free
    echo("bytes to copy: %d · free on the volume: %d" % (required, free))
    if free < max(MIN_FREE_BYTES, int(required * 1.1)):
        return {"ok": False, "dest": str(dest),
                "why": "only %d bytes free and this copy needs %d -- refusing "
                       "to fill the volume." % (free, required)}

    dest.mkdir(parents=True, exist_ok=True)
    (dest / TIER2_SUBDIR).mkdir(parents=True, exist_ok=True)

    entries = {"tier1": [], "tier2": []}
    for tier, rels in ((1, t1), (2, t2)):
        for rel in rels:
            src = root / rel
            target = backup_location(dest, tier, rel)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, target)
            entries["tier%d" % tier].append({
                "rel": rel,
                "sha256": sha256_file(target),
                "bytes": target.stat().st_size,
            })

    counts = store_counts(store)
    manifest = {
        # Everything that is per-run lives here and nowhere else, so the rest
        # of the manifest is byte-identical across two backups of an unchanged
        # library.
        "run": {
            "stamp_utc": stamp or utc_stamp(),
            "library_root": str(root),
            "dest": str(dest),
            "tier2_selection": t2_why,
        },
        "expected_counts": {k: expected[k] for k in COUNT_KEYS},
        "counts_at_copy_time": counts,
        "tier1": entries["tier1"],
        "tier2": entries["tier2"],
    }
    study_lib.atomic_write_bytes(
        str(dest / MANIFEST_NAME),
        json.dumps(manifest, ensure_ascii=False, indent=1,
                   sort_keys=True).encode("utf-8"))

    echo("tier 1: %d files · tier 2: %d files" % (len(t1), len(t2)))
    return {"ok": True, "why": None, "dest": str(dest), "counts": counts,
            "tier1": len(t1), "tier2": len(t2)}


def manifest_stable_part(manifest):
    """The portion of a manifest that two backups of an unchanged library must
    produce byte-identically. `run` is excluded because a stamp that did not
    change between runs would not be a stamp."""
    return json.dumps({k: manifest[k] for k in sorted(manifest)
                       if k != "run"},
                      ensure_ascii=False, indent=1,
                      sort_keys=True).encode("utf-8")


# --------------------------------------------------------------------------
# verify -- the three assertions of RESEARCH H-2, in order, stopping at the
# first failure.
# --------------------------------------------------------------------------

def verify(backup_dir, expected=None, echo=None):
    """{ok, why, counts}. Every failure is ONE plain-words line.

    ⚠⚠ FIXED 2026-08-23 — THIS REFUSED EVERY BACKUP AND WOULD HAVE GONE ON
    REFUSING THEM FOR EVER. It fell back to EXPECTED_COUNTS, five absolute
    numbers frozen when they were written, and compared TODAY'S library
    against them. Her library legitimately moves — she blesses things (188 ->
    209 by 2026-08-23), and on 2026-08-23 another session removed 348 keynote
    items — so the discriminator expired the moment she used the room, and a
    real backup of a real library came back "this parses, but it is not the
    right file."

    ⛔ A CHECK PINNED TO A SNAPSHOT THE WORLD MOVES PAST IS A PERMANENTLY
    UNMEETABLE GATE, and this project has the same defect filed elsewhere
    (tests/test_live_render.cjs's node-suite count). Refusing everything is
    not being careful; it is being useless in a way that reads as careful,
    and the cost lands exactly when it matters most — the backup is what
    stands between her judgments and a bad run.

    ⭐ WHAT ACTUALLY DISCRIMINATES A BACKUP FROM A PLAUSIBLE WRONG FILE is the
    COPY against the SOURCE AS IT WAS AT COPY TIME — which `backup` already
    measures and writes into the manifest as `expected_counts`. So the
    manifest is the expectation now, and it cannot expire. The five stale
    `items.json.*` siblings this tool exists to refuse are still caught: a
    copy that grabbed one holds different counts from the source it was taken
    from, whatever those counts happen to be this month.

    ⛔ EXPECTED_COUNTS survives ONLY as an explicit override, for a caller who
    genuinely means "these five numbers and no others" — the suite driving a
    fixture does exactly that. It is no longer a silent default.
    """
    backup_dir = Path(backup_dir).expanduser()
    # ⛔ Whether the CALLER named the expectation decides whether the
    # wrong-library band below runs at all. A caller who named five numbers
    # has already said which library this is; second-guessing that with a
    # band built from a different library's size is how a fixture gets refused.
    caller_named = expected is not None
    out = {"ok": False, "why": None, "counts": None}

    mpath = backup_dir / MANIFEST_NAME
    if not mpath.is_file():
        out["why"] = ("there is no " + MANIFEST_NAME + " in " +
                      str(backup_dir) + " -- nothing here can be verified.")
        return out
    try:
        manifest = json.loads(mpath.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        out["why"] = (MANIFEST_NAME + " is unreadable (" +
                      str(e).split("\n")[0] + ").")
        return out

    # The expectation the BACKUP RECORDED, unless the caller named one.
    # ⛔ A manifest without it is an OLD manifest, not a licence to skip the
    # check: fall back to the frozen constant and say so, rather than passing.
    if expected is None:
        recorded = manifest.get("expected_counts")
        if isinstance(recorded, dict) and all(
                isinstance(recorded.get(k), int) for k in COUNT_KEYS):
            expected = {k: recorded[k] for k in COUNT_KEYS}
        else:
            expected = dict(EXPECTED_COUNTS)
            if echo:
                echo("note: this manifest records no counts of its own, so "
                     "the frozen 2026-08 numbers are being used -- a mismatch "
                     "below may mean the library simply moved on.")
    else:
        expected = dict(expected)

    # 1 -- sha256 identity of every manifest entry against the copied bytes.
    for tier in (1, 2):
        for entry in manifest.get("tier%d" % tier, []):
            path = backup_location(backup_dir, tier, entry["rel"])
            if not path.is_file():
                out["why"] = ("the backup is missing " + entry["rel"] +
                              " -- it is recorded in the manifest and it is "
                              "not on disk.")
                return out
            if path.stat().st_size != entry["bytes"]:
                out["why"] = (entry["rel"] + " is %d bytes in the backup and "
                              "the manifest recorded %d -- the copy is short."
                              % (path.stat().st_size, entry["bytes"]))
                return out
            if sha256_file(path) != entry["sha256"]:
                out["why"] = (entry["rel"] + " does not match its recorded "
                              "sha256 -- the copy is damaged or was written "
                              "while the source was being changed.")
                return out

    # 2 -- the verifier IS the shipped reader.
    try:
        store = study_lib.load_store(backup_dir)
    except Exception as e:                       # noqa: BLE001 -- one line out
        out["why"] = ("the copied items.json is refused by the room's own "
                      "reader (load_store: " + str(e).split("\n")[0] +
                      ") -- a copy the reader refuses is not a backup.")
        return out

    # 3 -- the counts, by value. This is the one that tells a good file from a
    # plausible one: the stale artifacts in the library root parse cleanly.
    counts = store_counts(store)
    out["counts"] = counts
    for key in COUNT_KEYS:
        if counts[key] != expected[key]:
            out["why"] = ("count mismatch on " + key + ": the copy holds %d "
                          "and %d was expected -- this parses, but it is not "
                          "the right file."
                          % (counts[key], expected[key]))
            return out

    # ⛔ AND THE OTHER QUESTION, WHICH THE CHECK ABOVE CANNOT ASK.
    #
    # Above compares the COPY against the SOURCE AS IT WAS AT COPY TIME, so it
    # catches a damaged or swapped copy and never expires. It cannot catch
    # backing up THE WRONG LIBRARY ENTIRELY -- point this at a stale
    # 3,138-item store and the copy matches its source perfectly (PITFALL 9,
    # the named regression in tests/test_backup_verify.py).
    #
    # ⚠ THAT is what the frozen EXPECTED_COUNTS was really guarding, and it
    # guarded it by demanding five numbers EXACTLY -- which is why it refused
    # every real backup the moment she blessed something. So the guard stays
    # and the equality goes: a proportional band, on the two counts that say
    # "this is a library of that size" rather than "this is that library on
    # that day". Her real drift is ~98% and 111% of the reference; the stale
    # store is 19%. ⛔ Numbers with a REASON, not a snapshot.
    #
    # ⚠ IT CAN STILL BE WRONG, and it says so rather than pretending: if she
    # ever genuinely halves her library this refuses a good backup, and the
    # message tells the operator the one thing that gets past it.
    for key in () if caller_named else ("items", "image"):
        ref = EXPECTED_COUNTS.get(key) or 0
        got = counts.get(key) or 0
        if ref and (got < ref * SANITY_LOW or got > ref * SANITY_HIGH):
            out["why"] = ("this copy holds %d %s, and a library this tool is "
                          "protecting has been around %d -- that is not drift, "
                          "it looks like a different library. If it really is "
                          "hers, re-run verify with an explicit expectation."
                          % (got, key, ref))
            return out

    out["ok"] = True
    if echo:
        for key in COUNT_KEYS:
            echo("  %-11s %d" % (key, counts[key]))
    return out


# --------------------------------------------------------------------------
# rollback -- the way back, by set difference and never by the clock.
# --------------------------------------------------------------------------

def server_listening(port, host="127.0.0.1", timeout=0.25):
    """True when something answers on the port. Opens a socket and nothing
    else -- this tool spawns no processes."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        return s.connect_ex((host, port)) == 0


def restore_tier1(backup_dir, library_root, manifest):
    """Step 2 + 6: put items.json, decorations.json, layout.json, librarian/
    and both ledgers back. Restoring items.json ALONE reverses every type
    flip, every library_path repoint, every attachments entry and every tag
    change -- the store is the single source of truth for all of them."""
    root = Path(library_root)
    for entry in manifest.get("tier1", []):
        src = backup_location(backup_dir, 1, entry["rel"])
        target = root / entry["rel"]
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)


def restore_tier2(backup_dir, library_root, manifest):
    """Step 3: put the moved snapshots back into items/ BEFORE the set
    difference runs, so a snapshot the note pass moved is present again and is
    therefore named by the restored store."""
    root = Path(library_root)
    for entry in manifest.get("tier2", []):
        src = backup_location(backup_dir, 2, entry["rel"])
        target = root / entry["rel"]
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)


def new_files_by_set_difference(library_root, store):
    """⚠⚠ THE LOAD-BEARING LINE OF THE WHOLE ROLLBACK.

    Everything under items/ that the restored store does not name in a
    `library_path`, and every attachments/<id>/ directory the restored store
    does not name in an `attachments` list, is NEW and is removed.

    The alternative -- comparing file timestamps -- is wrong here and it is
    wrong SILENTLY: a copy2-based restore carries the source timestamps back
    with it, so the restored files look older than the restore itself and the
    new files look no different from the ones that were always there.
    Identity, never the clock.

    Returns (files, dirs): library-relative POSIX strings, sorted."""
    root = Path(library_root)
    items = (store or {}).get("items", {})
    kept_paths = {nfc(i.get("library_path", "")) for i in items.values()}
    kept_atts = {nfc(rel) for i in items.values()
                 for rel in (i.get("attachments") or [])}
    kept_att_dirs = {PurePosixPath(rel).parent.as_posix()
                     for rel in kept_atts}

    files = []
    items_dir = root / ITEMS_DIR
    if items_dir.is_dir():
        for p in sorted(items_dir.rglob("*")):
            if p.is_file() and norm_rel(p, root) not in kept_paths:
                files.append(norm_rel(p, root))

    dirs = []
    att_dir = root / ATTACHMENTS_DIR
    if att_dir.is_dir():
        for p in sorted(att_dir.iterdir()):
            if p.is_dir() and norm_rel(p, root) not in kept_att_dirs:
                dirs.append(norm_rel(p, root))
    return sorted(files), sorted(dirs)


# ⚠ THE REFUSAL IS ABOUT IRREPLACEABLE BYTES, NOT ABOUT EVERY NEW FILE. The
# note pass mints `items/<id>.md` out of the reading cache; deleting one loses
# nothing that cannot be made again, and refusing to would leave a rolled-back
# library full of notes for photographs that are images again — which the
# suite rightly calls a violation. A PHOTOGRAPH is the other thing entirely:
# there is one copy of those bytes and no process anywhere can regenerate
# them. So the question is asked of pictures only.
_IRREPLACEABLE_EXTS = (".jpeg", ".jpg", ".png", ".gif", ".webp", ".heic",
                       ".heif", ".tiff", ".tif", ".bmp", ".mov", ".mp4")


def _is_irreplaceable(rel):
    return str(rel).lower().endswith(_IRREPLACEABLE_EXTS)


def _backup_has(backup_dir, rel):
    """Are THESE BYTES in the backup — at this path, or where they used to be?

    ⚠ THE PATH IN THE LIBRARY IS NOT THE PATH IN THE BACKUP, AND CHECKING ONLY
    THE FIRST IS THE BUG ONE LAYER ALONG. The backup holds the PRE-PASS
    layout, where a photograph is `items/<id>.jpeg`; the note pass has since
    moved it to `attachments/<survivor>/<id>.jpeg`. Asking only about the
    current path answers "no" for every photograph tier 2 faithfully copied,
    and the rollback then keeps everything and cleans up nothing.

    ⚠ THE BASENAME IS SAFE TO MATCH ON BECAUSE IT IS A CONTENT HASH. An item's
    id is the first 16 characters of a sha256 of its own bytes, and the stored
    filename IS that id, so `items/<basename>` in the backup is the same
    photograph and not merely a photograph with the same name.
    """
    if backup_dir is None:
        return False
    root = Path(backup_dir)
    # tier 1 keeps the library-relative shape; tier 2 is FLATTENED into
    # TIER2_SUBDIR by basename. Both are asked, through the one helper that
    # already knows the layout, so this cannot drift from where bytes are put.
    if (root / rel).exists():
        return True
    if backup_location(root, 2, rel).exists():
        return True
    return (root / ITEMS_DIR / PurePosixPath(rel).name).exists()


def _would_destroy(backup_dir, rel):
    """True when deleting this path would take the last copy of a picture."""
    return _is_irreplaceable(rel) and not _backup_has(backup_dir, rel)


def remove_new(library_root, files, dirs, backup_dir=None):
    """Steps 4 + 5 — MINUS anything the backup cannot put back.

    ⚠⚠ CR-01. THIS USED TO DELETE THE ONLY SURVIVING COPY OF A PHOTOGRAPH AND
    RETURN ok: True. The tier-2 selection is a DERIVED set and its own
    docstring measures it at 2,676 against a true 3,748 — a 29% under-count —
    while the note pass selects from the RE-DERIVED union, a different and
    larger set. For any photograph in the note pass's set but not in the
    manifest's tier 2 the old sequence was:

        restore_tier1 puts back the pre-pass items.json (the item is an image
        again, pointing at items/<id>.jpeg, with no attachments entry)
        -> restore_tier2 does NOT put items/<id>.jpeg back, because it was
           never copied, and the note pass has already unlinked it
        -> the restored store names no attachments, so attachments/<survivor>/
           reads as "new"
        -> rmtree takes the last copy of her photograph
        -> verify_library counts items.json values, which were restored, and
           passes.

    ⚠ THE REMEDY IS A REFUSAL, NOT A CLEVERER SELECTION. Widening tier 2 would
    make the under-count smaller and would not make it impossible; anything
    derived can be wrong again. So this asks the only question that actually
    matters at the moment of deletion — CAN THE BACKUP PUT THIS BACK? — and
    when the answer is no it KEEPS THE FILE and counts it. The result is a
    library whose store and files disagree, which she can see and which loses
    nothing, instead of a clean-looking library with her photographs gone.
    This is the same posture as _move_snapshot_to_attachments: fail toward
    keeping the original.

    ⚠ `backup_dir=None` KEEPS EVERY PICTURE RATHER THAN DELETING THEM. A
    caller that forgets to say where the backup is must not thereby get the
    old destructive behaviour.

    ⚠ AND IT ASKS ONLY ABOUT PICTURES. A minted `items/<id>.md` is derived
    text and deleting one loses nothing that cannot be made again; refusing to
    would leave a rolled-back library carrying notes for photographs that are
    images once more, which the shipped suite calls a violation in so many
    words. The bytes with exactly one copy are the photographs.

    Returns {"files": n, "dirs": n, "kept": [rel, ...]} — `kept` is what was
    refused, so the caller can say it out loud rather than leave it believed.
    """
    root = Path(library_root)
    kept = []
    removed_files = 0
    removed_dirs = 0
    for rel in files:
        if _would_destroy(backup_dir, rel):
            kept.append(rel)
            continue
        try:
            (root / rel).unlink()
            removed_files += 1
        except FileNotFoundError:
            pass
    for rel in dirs:
        # A directory is only removable when EVERY file under it has a copy in
        # the backup. One irreplaceable photograph keeps the whole folder.
        target = root / rel
        orphans = []
        if target.is_dir():
            for f in sorted(target.rglob("*")):
                if not f.is_file():
                    continue
                sub = str(f.relative_to(root))
                if _would_destroy(backup_dir, sub):
                    orphans.append(sub)
        if orphans:
            kept.extend(orphans)
            continue
        shutil.rmtree(target, ignore_errors=True)
        removed_dirs += 1
    return {"files": removed_files, "dirs": removed_dirs, "kept": kept}


def remove_vision_cache(library_root):
    """Step 7. Regenerable by definition, and a cache keyed to items that no
    longer exist is the exact stale-state trap. Prefer the shipped path
    helper the moment plan 26.94-02 lands it, so the two can never disagree."""
    fn = getattr(study_lib, "vision_dir_path", None)
    d = Path(fn(library_root)) if fn is not None else \
        Path(library_root) / VISION_DIR_NAME
    existed = d.is_dir()
    shutil.rmtree(d, ignore_errors=True)
    return existed


def rollback(backup_dir, library_root=None, expected=None, port=None,
             echo=print):
    """RESEARCH H-3 steps 2-8. Step 1 ("stop the server") is a PRECONDITION
    this refuses to run without: save_store is atomic, but a running server
    holding WRITE_LOCK will overwrite a restored file at its next write.

    Idempotent: a second run restores the same bytes, finds nothing new by set
    difference, and finds no cache to delete."""
    backup_dir = Path(backup_dir).expanduser()
    root = Path(library_root or default_library_root()).expanduser().resolve()
    expected = dict(expected or EXPECTED_COUNTS)
    port = server.PORT if port is None else port

    if server_listening(port):
        return {"ok": False, "why":
                "something is answering on port %d -- stop the room first. A "
                "running server holds the write lock and will overwrite the "
                "restored items.json at its next write." % port}

    pre = verify(backup_dir, expected)
    if not pre["ok"]:
        return {"ok": False, "why":
                "refusing to restore from a backup that does not verify: " +
                str(pre["why"])}

    manifest = json.loads(
        (backup_dir / MANIFEST_NAME).read_text(encoding="utf-8"))

    restore_tier1(backup_dir, root, manifest)
    restore_tier2(backup_dir, root, manifest)

    store = study_lib.load_store(root)
    files, dirs = new_files_by_set_difference(root, store)
    swept = remove_new(root, files, dirs, backup_dir=backup_dir)
    had_cache = remove_vision_cache(root)

    echo("removed %d new files under %s/ and %d new %s/ directories%s"
         % (swept["files"], ITEMS_DIR, swept["dirs"], ATTACHMENTS_DIR,
            "; removed the vision cache" if had_cache else ""))
    # CR-01: said out loud, every time, because a silent refusal is how the
    # original defect stayed invisible.
    if swept["kept"]:
        echo("")
        echo("KEPT %d file(s) this backup cannot put back — they were NOT "
             "deleted:" % len(swept["kept"]))
        for rel in swept["kept"][:20]:
            echo("  " + rel)
        if len(swept["kept"]) > 20:
            echo("  ... and %d more" % (len(swept["kept"]) - 20))
        echo("Your library's index and its files now disagree about these. "
             "Nothing was lost; the alternative was deleting the only copy.")

    post = verify_library(root, expected)
    if not post["ok"]:
        return {"ok": False, "why":
                "the restore did not land: " + str(post["why"]),
                "removed_files": files, "removed_dirs": dirs}
    return {"ok": True, "why": None, "counts": post["counts"],
            "removed_files": files, "removed_dirs": dirs}


def verify_library(library_root, expected=None):
    """Assertions 2 and 3 of H-2 against the LIVE library after a restore --
    assertion 1 (sha256 identity) belongs to the backup, not to the library."""
    expected = dict(expected or EXPECTED_COUNTS)
    try:
        store = study_lib.load_store(library_root)
    except Exception as e:                       # noqa: BLE001 -- one line out
        return {"ok": False, "counts": None,
                "why": "the restored items.json is refused by the room's own "
                       "reader (load_store: " + str(e).split("\n")[0] + ")."}
    counts = store_counts(store)
    for key in COUNT_KEYS:
        if counts[key] != expected[key]:
            return {"ok": False, "counts": counts,
                    "why": "count mismatch on " + key + " after the restore: "
                           "%d, expected %d." % (counts[key], expected[key])}
    return {"ok": True, "why": None, "counts": counts}


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def _add_expect(p):
    # ⚠ 2026-08-23: the default is NONE, not the frozen number. With the
    # frozen numbers as defaults the CLI handed verify() an explicit
    # expectation on EVERY run, so the library's own measured-from-source
    # default could never apply and every real backup was refused. The flags
    # still work exactly as before when an operator names them.
    for key in COUNT_KEYS:
        p.add_argument("--expect-" + key.replace("_", "-"), type=int,
                       default=None, dest="expect_" + key,
                       help="override the measured count for " + key +
                            " (default: measured from the source at copy "
                            "time, which is what cannot go stale)")


def _expected_from(args):
    # The five numbers the operator named, or None if they named none.
    # ⛔ ALL FIVE OR NOTHING, deliberately: a partial expectation would
    # silently mix numbers from two different libraries, which is the exact
    # confusion the counts exist to prevent.
    named = {k: getattr(args, "expect_" + k, None) for k in COUNT_KEYS}
    if all(v is None for v in named.values()):
        return None
    missing = [k for k, v in named.items() if v is None]
    if missing:
        raise SystemExit("REFUSED: --expect-* takes all five or none; "
                         "missing " + ", ".join(sorted(missing)))
    return named


def build_parser():
    p = argparse.ArgumentParser(
        prog="backup_library",
        description="Back up the irreplaceable, and prove the copy is the "
                    "right file.")
    subs = p.add_subparsers(dest="command", required=True)

    b = subs.add_parser("backup", help="copy tier 1 + tier 2 and write the "
                                       "manifest")
    b.add_argument("--library-root", default=None)
    b.add_argument("--dest", default=None)
    b.add_argument("--tier2-list", default=None,
                   help="a file of snapshot paths, one per line, when the "
                        "screenshot set has already been measured")
    _add_expect(b)

    v = subs.add_parser("verify", help="the three assertions, in order")
    v.add_argument("backup_dir")
    _add_expect(v)

    r = subs.add_parser("rollback", help="restore, then remove what is new "
                                         "by set difference")
    r.add_argument("backup_dir")
    r.add_argument("--library-root", default=None)
    r.add_argument("--port", type=int, default=None)
    _add_expect(r)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    expected = _expected_from(args)

    if args.command == "backup":
        res = backup(args.library_root, args.dest, args.tier2_list, expected)
        if not res["ok"]:
            print("REFUSED: " + str(res["why"]))
            return 1
        print("backed up to " + res["dest"])
        print("verifying...")
        ver = verify(res["dest"], expected, echo=print)
        if not ver["ok"]:
            print("NOT VERIFIED: " + str(ver["why"]))
            return 1
        print("ok: true")
        return 0

    if args.command == "verify":
        res = verify(args.backup_dir, expected, echo=print)
        if not res["ok"]:
            print("ok: false")
            print("why: " + str(res["why"]))
            return 1
        print("ok: true")
        return 0

    res = rollback(args.backup_dir, args.library_root, expected, args.port)
    if not res["ok"]:
        print("ok: false")
        print("why: " + str(res["why"]))
        return 1
    print("ok: true")
    for key in COUNT_KEYS:
        print("  %-11s %d" % (key, res["counts"][key]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
