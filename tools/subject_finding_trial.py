#!/usr/bin/env python3
"""tools/subject_finding_trial.py — HER FINDING PASS, priced. Sends NOTHING.

⛔⛔ WHAT THIS IS AND WHOSE IT IS. 26.9985-RULINGS.md: R-1, the librarian
finds the things that might be about a subject she would rather it left
alone, and ASKS — nothing is set aside unless she says so. R-2, it may read
everything the room already lets it read, ONCE — and ⛔ THE EXACT SLICE AND
ITS EXACT COST GO TO HER BEFORE A PENNY MOVES, the constraint carried over
from 26.998 § W-12 unweakened. R-9, the reading is once and what it found is
kept, so a no can be re-asked without reading or spending again.

⛔⛔ THIS TOOL CANNOT SEND. There is no --run, no --yes, no transport reach,
and none may be added here before two things exist IN WRITING: her priced
approval, and her rung ruling (R-2 priced both rungs to her; the JOBS row's
tier is provisional until she picks). The runner is a separate tool built
after — and gated on — both.

WHAT "EVERYTHING" MEANS, measured rather than assumed: the slice is exactly
the text items whose BODIES the room's one audited fence
(`study_lib.build_librarian_payload`, scope=presort, consent=True) will hand
over — her blessed and unseen text, each body up to the room's own cap.
Nothing is widened for the occasion: an item the fence holds back (her three
folders, never-show, retired, trigger, an active filter, an aside mark, a
title shadow) is held back here identically, and resting items stay unread
because the room has never read a resting body. ⚠ The narrowing is PROVED,
not described: the delivered set must equal the intended set exactly, or
this tool refuses to print a price — a price for two thirds of her library
would look identical to a price for all of it.

⚠ HER LIBRARY IS READ-ONLY HERE and it is checked rather than asserted: the
store file's SHA-256 is taken before the first read and after the last.

THE CHUNKING, stated because the cost depends on it: the pass is ONE reading
in MANY calls — the archive does not fit one request. Bodies are packed in
id order into chunks of at most CHUNK_TOKENS_IN estimated input tokens; each
chunk is one `subject_finding` call with the row's own output spend. The
reading stays "once": every body is sent in exactly one chunk, ever.

Stdlib only (law 8). Run from anywhere:

    python3 tools/subject_finding_trial.py --price
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import librarian_call                      # noqa: E402
import server                              # noqa: E402  (binds the literals)
import study_lib                           # noqa: E402

# ⚠ IMPORTED, NEVER COPIED — the setup trial's own rate table, token
# estimator and hasher, so the two passes cannot price the same byte two
# different ways.
import setup_pass_trial as SETUP           # noqa: E402

JOB = "subject_finding"

# One chunk's input budget, in estimated tokens. Small enough to sit far
# inside every candidate fill's context window with the prompt and framing
# on top; large enough that her library is tens of calls, not hundreds.
# ⚠ A PARAMETER OF THE ESTIMATE — the runner must state its own and the two
# must be the same number when it is built.
CHUNK_TOKENS_IN = 100_000

# What states the presort scope with consent will hand BODIES over for —
# the intended slice, spelled once and proved against the delivery below.
READABLE_STATES = ("blessed", "unseen")


class TrialRefused(Exception):
    """The trial refuses to price. Never a warning — a printed price must
    be a price for the thing she was told, or nothing."""


def build_slice(root):
    """(bodies, report) — every body the fence will hand over, proved.

    ⛔ Reads her library, writes nothing anywhere, sends nothing."""
    store_file = os.path.join(root, "items.json")
    before = SETUP._sha256(store_file)

    store = study_lib.load_store(root)
    filters = (store.get("meta") or {}).get("filters") or []
    items = store.get("items") or {}

    intended, fenced, held = {}, {}, {"resting": 0, "images": 0,
                                      "other-states": 0}
    for item_id, item in items.items():
        if study_lib._librarian_fenced(item, filters):
            # ⛔ KEPT, NOT DROPPED — the builder's title-shadow screen keeps
            # its teeth only when handed the fenced items too.
            fenced[item_id] = item
            continue
        if item.get("type") != "text":
            held["images"] += 1
            continue
        state = item.get("state")
        if state in READABLE_STATES:
            intended[item_id] = item
        elif state == "resting":
            # the room has never read a resting body; this pass widens
            # nothing (R-2's own softener).
            held["resting"] += 1
        else:
            held["other-states"] += 1

    if not intended:
        raise TrialRefused("the room can read nothing today — a pass over "
                           "nothing would still cost her a call")

    snapshot = dict(store)
    snapshot["items"] = dict(intended)
    snapshot["items"].update(fenced)
    payload = study_lib.build_librarian_payload(
        snapshot, "presort", consent=True, store_dir=root)

    # ---- THE NARROWING IS PROVED, both directions, before any price -----
    bodies = payload.get("bodies") or []
    delivered = {entry.get("id") for entry in bodies}
    missing = [i for i in intended if i not in delivered]
    shadowed = payload.get("counts", {}).get("title-shadowed", 0)
    if missing and len(missing) != shadowed:
        raise TrialRefused(
            "%d intended pieces never reached the payload and only %d are "
            "accounted for by the title screen — the price would be for "
            "less than she was told" % (len(missing), shadowed))
    extra = delivered - set(intended)
    if extra:
        raise TrialRefused(
            "%d pieces reached the payload that are NOT in the slice"
            % len(extra))

    after = SETUP._sha256(store_file)
    if after != before:
        raise TrialRefused("her library moved while this ran — refusing "
                           "to go on")

    counts = payload.get("counts") or {}
    report = {
        "pieces": len(bodies),
        "held_back_by_fence": len(fenced),
        "held_back_title_screen": shadowed,
        "resting_unread": held["resting"],
        "images_unread": held["images"],
        "other_states": held["other-states"],
        "cut_short": counts.get("bodies-capped", 0),
        "unreadable": counts.get("bodies-unreadable", 0),
        "library_sha": before,
    }
    return bodies, report


def chunk_bodies(bodies):
    """Pack bodies (id order, deterministic) into chunks under the input
    budget. Returns a list of lists of body entries. ⛔ THE ONE PACKING:
    the runner reads exactly the chunks this function shapes, so the run
    is the thing that was priced — a second packing would quietly price
    one reading and perform another."""
    chunks, current, current_tokens = [], [], 0.0
    for entry in sorted(bodies, key=lambda e: str(e.get("id"))):
        t = SETUP.estimate_tokens(json.dumps(entry, ensure_ascii=False))
        if current and current_tokens + t > CHUNK_TOKENS_IN:
            chunks.append(current)
            current, current_tokens = [], 0.0
        current.append(entry)
        current_tokens += t
    if current:
        chunks.append(current)
    return chunks


def chunk_plan(bodies):
    """Token estimates per chunk, over `chunk_bodies`' own packing.
    Returns (chunk_token_list, total_body_tokens)."""
    prompt_tokens = SETUP.estimate_tokens(
        librarian_call.JOBS[JOB].get("prompt") or "")
    sizes, total = [], 0.0
    for chunk in chunk_bodies(bodies):
        t = sum(SETUP.estimate_tokens(json.dumps(e, ensure_ascii=False))
                for e in chunk)
        total += t
        sizes.append(t + prompt_tokens)
    return sizes, total


def price_both_rungs(chunks):
    """The exact arithmetic for each rung, from the routing's own fills.
    ⛔ ESTIMATES, NEVER QUOTES — the rate table and tokenizer model are
    SETUP's, stated there with their provenance."""
    routing = server.resolve_librarian_routing()
    worst_out = int(librarian_call.JOBS[JOB].get("max_tokens") or 0)
    quotes = []
    for tier in ("cheap-cloud", "good-cloud"):
        fill = (routing.fills or {}).get(tier)
        provider, model = (fill if fill else (None, None))
        tokens_in = sum(chunks)
        usd_in = tokens_in / 1e6 * SETUP.RATE_IN_PER_M.get(model, 0.0)
        usd_out = (len(chunks) * worst_out
                   / 1e6 * SETUP.RATE_OUT_PER_M.get(model, 0.0))
        quotes.append({
            "tier": tier, "provider": provider, "model": model,
            "calls": len(chunks), "tokens_in": int(tokens_in),
            "worst_tokens_out_total": len(chunks) * worst_out,
            "usd_in": usd_in, "usd_out_worst": usd_out,
            "usd_worst_total": usd_in + usd_out,
        })
    return quotes


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--price", action="store_true",
                    help="the only thing this tool does: measure the "
                         "slice, price it at both rungs, send nothing")
    ap.add_argument("--library", default=None,
                    help="the library to read. ⚠ An ARGUMENT so a gate can "
                         "drive this script against a COPIED fixture and "
                         "never against hers.")
    args = ap.parse_args(argv)

    root = args.library
    if not root:
        local = os.path.join(os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))),
            "library.local.json")
        with open(local, encoding="utf-8") as f:
            root = json.load(f)["library_root"]

    try:
        bodies, report = build_slice(root)
        chunks, body_tokens = chunk_plan(bodies)
        quotes = price_both_rungs(chunks)
    except TrialRefused as why:
        print("REFUSED:", why)
        return 2

    print("THE SLICE — everything the room already lets it read, once")
    print("  pieces it would read        ", report["pieces"])
    print("  held back by her fence      ", report["held_back_by_fence"])
    print("  held back, title screen     ", report["held_back_title_screen"])
    print("  resting, never read         ", report["resting_unread"])
    print("  pictures, not text          ", report["images_unread"])
    print("  read only up to the cap     ", report["cut_short"])
    print("  unreadable                  ", report["unreadable"])
    print("  her library's fingerprint   ", report["library_sha"][:16],
          "(unmoved)")
    print()
    print("THE READING — once, in %d calls of at most ~%dk tokens each"
          % (len(chunks), CHUNK_TOKENS_IN // 1000))
    for q in quotes:
        print()
        print("  at the %s rung — %s %s"
              % (q["tier"], q["provider"], q["model"]))
        print("    estimated tokens in      ", q["tokens_in"])
        print("    at most, tokens out      ", q["worst_tokens_out_total"])
        print("    ESTIMATED COST           $%.2f in + at most $%.2f out "
              "= at most $%.2f"
              % (q["usd_in"], q["usd_out_worst"], q["usd_worst_total"]))
    print()
    print("  ⚠ ESTIMATES, not quotes — and NOTHING WAS SENT.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
