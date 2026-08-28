#!/usr/bin/env python3
"""tools/subject_clearing_run.py — the librarian clears ITS OWN notebook
of the subjects already set aside (26.9985 R-16, the backlog half).

Her ruling, 2026-08-26 (the F6 sitting): `Yes — now, and every time
after` — the "every time after" lives in the room's own rule route; THIS
tool is the "now": one clearing for each subject that is already aside
and has no proven removal behind it yet.

⛔ THE SLICE IS THE NOTEBOOK THE ROOM ITSELF WROTE plus the subject's
model-written names, AND NOTHING ELSE — her § I sentence ("going through
its own notebook") is a promise and the gate in
tests/test_subject_aside.py scans the payload for planted bytes of hers.

⛔ HONEST ABOUT ARRIVALS (#138): `cleared` is reported only when the
removal engine ran and its re-read proof was computed. A model failure,
an empty answer and an engine refusal are each printed by name.

Every call goes through `server.record_call` — one line in her privacy
ledger. Run:

    python3 tools/subject_clearing_run.py --run --yes
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import server                              # noqa: E402  (binds the literals)
import study_lib                           # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--yes", action="store_true",
                    help="her approval — R-16, and still a separate word")
    ap.add_argument("--library", default=None)
    args = ap.parse_args(argv)

    if not args.run:
        print("Nothing was sent. --run --yes performs the clearing.")
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
    kept = study_lib.load_kept_back(root)["removals"]
    proven = set(str(r.get("subject")) for r in kept
                 if isinstance(r, dict) and r.get("proof") is True
                 and not r.get("undone"))
    todo = [e for e in entries
            if isinstance(e, dict) and e.get("status") == "aside"
            and str(e.get("key")) not in proven]
    if not todo:
        print("Nothing to clear: every set-aside subject already has a "
              "proven removal (or none is set aside).")
        return 0

    failed = 0
    for entry in todo:
        result = server.run_subject_clearing(root, entry, routing)
        key = str(entry.get("key"))
        if result.get("cleared"):
            removal = result.get("removal") or {}
            print("CLEARED %r: %d lines out of the notebook, kept back, "
                  "proof=%s (%d bad indices dropped and counted)."
                  % (key, len(removal.get("removed_lines") or []),
                     removal.get("nothing_is_lost"),
                     result.get("dropped_bad_index", 0)))
        elif result.get("nothing_found"):
            print("NOTHING FOUND for %r: the reader pointed at no line; "
                  "the notebook is untouched." % key)
        else:
            failed += 1
            print("DID NOT LAND for %r: %s — the notebook is untouched."
                  % (key, result.get("failure")))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
