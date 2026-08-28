#!/usr/bin/env python3
"""tools/subject_merge_run.py — the librarian tidies ITS OWN list (R-14).

Her ruling, 2026-08-26: `Tidy first` — before the § A offer, the 262
proposals the cheaper reader named many ways are folded together. Her § G
sentence is a PROMISE this tool must keep: *"It does not read your things
again."*

⛔ THE SLICE IS THE NAMES THE LIBRARIAN ITSELF WROTE, NUMBERED, AND
NOTHING ELSE. No item ids, no statuses, no titles, not one byte of hers.
The payload is built here from the subject names alone and the gate in
tests/test_subject_aside.py scans it for planted item ids.

⛔ IT REFUSES ONCE ANY ENTRY HAS LEFT `proposed` — a tidy over a list she
has ruled on would be the room rearranging her rulings (R-14's own bound).

⛔ CODE OWNS COMPLETENESS, NEVER THE MODEL: an index the answer never
mentions stays its own group; a duplicated or invented index is dropped
(first mention wins, out-of-range ignored) and counted out loud. The
model cannot lose a subject and cannot double one.

The store rewrite is WHOLE-OR-NOTHING and provenance-keeping: each merged
entry carries `merged_from` (every original name it absorbed) and the
union of item ids. Run:

    python3 tools/subject_merge_run.py --run --yes
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import librarian_call                      # noqa: E402
import server                              # noqa: E402  (binds the literals)
import study_lib                           # noqa: E402

JOB = "subject_merge"


class MergeRefused(Exception):
    pass


def build_names_payload(entries):
    """The numbered-names document — the ONLY bytes this job may send.
    Raises when any entry has left `proposed` (R-14's bound)."""
    ruled = [e for e in entries
             if isinstance(e, dict) and e.get("status") != "proposed"]
    if ruled:
        raise MergeRefused(
            "%d entries already carry her ruling — the tidy runs only "
            "over a list she has not yet ruled on" % len(ruled))
    names = [str(e.get("name") or "") for e in entries]
    if not any(n.strip() for n in names):
        raise MergeRefused("there is nothing to tidy")
    doc = {"names": [{"i": i, "name": n} for i, n in enumerate(names)]}
    return json.dumps(doc, ensure_ascii=False)


def apply_groups(entries, groups):
    """Fold the entries per the model's groups, code owning completeness.
    Returns (merged_entries, counts)."""
    n = len(entries)
    claimed = {}
    dropped_bad_index = 0
    for g_idx, group in enumerate(groups or []):
        for member in (group.get("members") or []):
            if not isinstance(member, int) or not (0 <= member < n):
                dropped_bad_index += 1
                continue
            if member in claimed:
                dropped_bad_index += 1      # duplicated: first mention wins
                continue
            claimed[member] = g_idx

    merged = []
    now = int(time.time() * 1000)
    used_groups = {}
    for idx, entry in enumerate(entries):
        g_idx = claimed.get(idx)
        if g_idx is None:
            # unmentioned: stays its own group, untouched but restamped
            rec = dict(entry)
            rec.setdefault("merged_from", [entry.get("name")])
            merged.append(rec)
            continue
        rec = used_groups.get(g_idx)
        if rec is None:
            name = str((groups[g_idx].get("name") or "")).strip() \
                or str(entry.get("name") or "")
            rec = {"key": entry.get("key"), "name": name,
                   "origin": "noticed", "item_ids": [],
                   "status": "proposed", "ms": now,
                   "chunks": [], "merged_from": []}
            used_groups[g_idx] = rec
            merged.append(rec)
        for i in (entry.get("item_ids") or []):
            if i not in rec["item_ids"]:
                rec["item_ids"].append(i)
        for c in (entry.get("chunks") or []):
            if c not in rec["chunks"]:
                rec["chunks"].append(c)
        rec["merged_from"].append(entry.get("name"))
    counts = {"before": n, "after": len(merged),
              "dropped_bad_index": dropped_bad_index}
    return merged, counts


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--yes", action="store_true",
                    help="her approval — R-14, and still a separate word")
    ap.add_argument("--library", default=None)
    args = ap.parse_args(argv)

    if not args.run:
        print("Nothing was sent. --run --yes performs the tidy.")
        return 0
    if not args.yes:
        print("REFUSED: --run without --yes.")
        return 2

    root = args.library
    if not root:
        local = os.path.join(os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))),
            "library.local.json")
        with open(local, encoding="utf-8") as f:
            root = json.load(f)["library_root"]

    routing = server.resolve_librarian_routing()
    gap = server.base_consent_gap(routing)
    if gap is not None:
        print("REFUSED: an address she has not agreed to is in effect —",
              gap[0], gap[2])
        return 2

    entries = study_lib.load_subjects(root)["subjects"]
    try:
        payload = build_names_payload(entries)
    except MergeRefused as why:
        print("REFUSED:", why)
        return 2

    result = server.record_call(JOB, payload, routing)
    if not isinstance(result, dict) or not result.get("ok"):
        print("THE TIDY DID NOT LAND:", (result or {}).get("failure"))
        print("⛔ The list is untouched.")
        return 1

    groups = (result.get("structured") or {}).get("groups") or []
    merged, counts = apply_groups(entries, groups)
    study_lib.save_subjects(root, merged)
    print("TIDIED: %d subjects folded into %d "
          "(%d bad indices from the model, dropped and counted)."
          % (counts["before"], counts["after"],
             counts["dropped_bad_index"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
