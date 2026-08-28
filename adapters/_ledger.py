"""Shared per-source stable-id ledger (Phase 26.65, ADP-03).

The importer (study_lib.import_folder) dedups only on SHA-256 of file bytes;
it has no notion of a source-stable id. A re-exported note/photo can produce
different bytes each time, so byte dedup alone would let a candle re-pull mint
duplicate `unseen` cards (RESEARCH Pitfall 2). This ledger records the set of
source ids already exported, per source, at
`<library_root>/adapters/<source>/ledger.json`, so the adapter exports only
genuinely-new items — the importer's content-hash dedup stays a harmless
backstop.

Stdlib only (json, os, tempfile) — zero-dependency law (law 8). The write is
atomic (mkstemp in the target dir + os.replace), mirroring
study_lib.atomic_write_bytes discipline so an interrupted write can never
corrupt the ledger. load() fails OPEN to the empty ledger — a missing or
unreadable ledger simply means "nothing exported yet", never a crash.
"""
import json
import os
import tempfile
from pathlib import Path

# ⛔⛔ TWO LISTS, AND THE SECOND ONE IS HER 2026-08-24 RULING.
#
# `exported_ids` is what ARRIVED. `set_aside_ids` is what the room LOOKED AT
# and deliberately did not take — today that is videos, which the room does not
# show yet.
#
# ⚠ WHY IT IS A SEPARATE LIST RATHER THAN MORE `exported_ids`: a set-aside item
# never arrived, so calling it exported would be a lie the rest of the room
# reads. Kept apart, a future release that DOES show video can replay this list
# and bring them in — which is exactly what the old skip comment wanted to
# protect, and it is protected.
#
# ⛔ THE DEFECT THIS FIXES, MEASURED ON HER REAL LIBRARY. A skipped video was
# recorded NOWHERE, so it stayed permanently "new": every landing gather
# re-attempted all 598 of her videos, took ~20-25 minutes, delivered nothing,
# and the candle REFUSED for the whole of it. Every visit. For ever.
_EMPTY = {"exported_ids": [], "set_aside_ids": [], "last_run_ms": None}


def _path(library_root, source):
    """The ledger path: <library_root>/adapters/<source>/ledger.json."""
    return Path(library_root) / "adapters" / source / "ledger.json"


def load(library_root, source):
    """The ledger dict for `source`, failing OPEN to a fresh empty ledger on a
    missing/unreadable/malformed file (never raises)."""
    p = _path(library_root, source)
    try:
        data = json.loads(p.read_text("utf-8"))
    except (OSError, ValueError):
        return dict(_EMPTY)
    if not isinstance(data, dict):
        return dict(_EMPTY)
    ids = data.get("exported_ids")
    if not isinstance(ids, list):
        return dict(_EMPTY)
    # ⚠ A LEDGER WRITTEN BEFORE THIS KEY EXISTED READS BACK AS AN EMPTY
    # SET-ASIDE LIST, which is the honest answer for it: nothing was ever
    # recorded as looked-at-and-skipped, so the first run after this change
    # records them and every run after that is quiet.
    aside = data.get("set_aside_ids")
    if not isinstance(aside, list):
        aside = []
    return {"exported_ids": [str(i) for i in ids],
            "set_aside_ids": [str(i) for i in aside],
            "last_run_ms": data.get("last_run_ms")}


def save(library_root, source, ledger):
    """Write `ledger` for `source` atomically (mkstemp + os.replace in the
    target dir, so the rename is a same-filesystem atomic swap)."""
    p = _path(library_root, source)
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(p.parent), prefix=".ledger-",
                               suffix=".swap")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(ledger, fh, ensure_ascii=False, indent=1)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, p)
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def new_ids(ledger, ids):
    """The subset of `ids` this collect should attempt, in the given order.

    ⛔ EXCLUDES BOTH LISTS. An item already exported is not new; an item the
    room already looked at and deliberately set aside is not new either, and
    treating it as new is what made a landing gather re-attempt the same
    hundreds of videos on every single visit.

    ⚠ Other sources carry no set-aside list and read back an empty one, so
    their behaviour is byte-identical."""
    have = set(ledger.get("exported_ids", []))
    have.update(ledger.get("set_aside_ids", []) or [])
    return [i for i in ids if i not in have]
