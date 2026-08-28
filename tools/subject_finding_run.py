#!/usr/bin/env python3
"""tools/subject_finding_run.py — HER FINDING PASS, run. Once, on her word.

⛔⛔ THE GATE THIS TOOL STANDS BEHIND IS ALREADY SPENT THE RIGHT WAY.
R-2 required the exact slice and the exact cost in front of her before a
penny moves; `subject_finding_trial.py --price` measured both on her live
library (5,915 pieces, 55 calls, at most ~$29.88 at the best rung), and
R-13 (2026-08-26, the rulings ledger) records her answer: **the best
reader**, chosen over the cheap rung, her own machine, and not-now. This
tool exists because that ruling exists. ⚠ It still refuses to send without
`--yes` — her approval is a separate word at every invocation, the setup
pass's own discipline.

THE DISCIPLINES, all inherited and none weakened:

  1. EVERY CALL GOES THROUGH `server.record_call` — the room's own seam,
     one line in her privacy ledger per call. No side-channel request.
  2. THE FENCE BUILDS EVERY BYTE. Chunks are slices of what
     `subject_finding_trial.build_slice` proved delivered — the ONE audited
     payload, the one packing (`chunk_bodies`). The run is the thing that
     was priced.
  3. ONCE PER BODY, EVER (R-9). A state ledger (OUTSIDE her library)
     records every chunk's ids, document SHA-256 and outcome BEFORE the
     verdict is read; a chunk marked ok is never sent again, and a resumed
     run re-proves each pending chunk's document byte-for-byte against the
     recorded SHA before sending it — her library moving mid-run stops the
     run rather than silently reading different bytes than were priced.
  4. A FAILURE STOPS THE RUN. `retries: 0` on the row, and no loop here
     re-asks: a failed call may have been billed, so the failed chunk is
     re-attempted only through `--retry-failed` — her word, again.
  5. A SPEND CEILING, the agent's own guard under her at-most figure: if
     the provider's reported usage prices past SPEND_CEILING_USD the run
     stops and says so. An estimate guarding an estimate — stated.
  6. WHAT IT FOUND LANDS ONLY WHEN THE READING IS WHOLE: subjects merge
     into `librarian/subjects.json` (status `proposed`, origin `noticed`)
     only after every chunk is ok — R-1: they are PROPOSALS, and nothing
     is set aside unless she says so. Ids the model invented are dropped
     and counted out loud; a subject left with no ids is dropped and
     counted.

Stdlib only (law 8). Run from the repo:

    python3 tools/subject_finding_run.py --run --yes
    python3 tools/subject_finding_run.py --run --yes --retry-failed
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import librarian_call                      # noqa: E402
import server                              # noqa: E402  (binds the literals)
import study_lib                           # noqa: E402

import setup_pass_trial as SETUP           # noqa: E402
import subject_finding_trial as TRIAL      # noqa: E402

JOB = TRIAL.JOB

# The agent's own stop under her ~$30 at-most (R-13). Reported usage is
# priced with SETUP's rate table; past this the run halts and says so.
SPEND_CEILING_USD = 35.0

DEFAULT_STATE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".scratch", "subject-finding-run.json")


def _doc_for(chunk):
    """One chunk's payload text — the bytes that go to the seam, and the
    bytes the state SHA pins. One spelling."""
    return json.dumps({"bodies": chunk}, ensure_ascii=False)


def _sha(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _load_state(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _save_state(path, state):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    study_lib.atomic_write_bytes(
        path, json.dumps(state, ensure_ascii=False, indent=1)
        .encode("utf-8"))


def _usd_of_chunks(chunk_records):
    """Priced from each chunk's OWN recorded model — R-13 as amended made
    this one reading a two-reader reading (chunk 1 the best, the rest the
    cheaper), and a single-model total would price it wrong."""
    total = 0.0
    for rec in chunk_records:
        if rec.get("status") != "ok":
            continue
        u = rec.get("usage") or {}
        model = rec.get("model")
        total += (int(u.get("input_tokens") or 0) / 1e6
                  * SETUP.RATE_IN_PER_M.get(model, 0.0)
                  + int(u.get("output_tokens") or 0) / 1e6
                  * SETUP.RATE_OUT_PER_M.get(model, 0.0))
    return total


def _slug(name):
    s = re.sub(r"\s+", "-", str(name).strip().casefold())
    return re.sub(r"[^\w一-鿿-]", "", s, flags=re.UNICODE) or "subject"


def merge_subjects(state):
    """Across-chunk merge by casefolded name. Union of ids, provenance
    kept. Presentation is a surface question and HERS — this is storage."""
    merged = {}
    dropped_ids = dropped_empty = 0
    for idx, chunk in enumerate(state["chunks"]):
        allowed = set(chunk["ids"])
        for subj in chunk.get("subjects") or []:
            name = str(subj.get("name") or "").strip()
            ids = [i for i in (subj.get("item_ids") or [])
                   if isinstance(i, str) and i in allowed]
            dropped_ids += len(subj.get("item_ids") or []) - len(ids)
            if not name or not ids:
                dropped_empty += 1
                continue
            key = _slug(name)
            rec = merged.setdefault(key, {
                "key": key, "name": name, "origin": "noticed",
                "item_ids": [], "status": "proposed",
                "ms": int(time.time() * 1000), "chunks": []})
            for i in ids:
                if i not in rec["item_ids"]:
                    rec["item_ids"].append(i)
            if idx not in rec["chunks"]:
                rec["chunks"].append(idx)
    return list(merged.values()), dropped_ids, dropped_empty


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--yes", action="store_true",
                    help="her approval — a separate word, every time")
    ap.add_argument("--retry-failed", action="store_true",
                    help="re-attempt chunks that FAILED (they may have "
                         "been billed) — her word for the second attempt")
    ap.add_argument("--library", default=None)
    ap.add_argument("--state", default=DEFAULT_STATE)
    ap.add_argument("--max-chunks", type=int, default=None,
                    help="stop after N chunks this invocation (the rest "
                         "stay pending; a later --run --yes continues)")
    args = ap.parse_args(argv)

    if not args.run:
        print("Nothing was sent. --run --yes performs the reading.")
        return 0
    if not args.yes:
        print("REFUSED: --run without --yes. Her approval is a separate "
              "word.")
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

    try:
        bodies, report = TRIAL.build_slice(root)
    except TRIAL.TrialRefused as why:
        print("REFUSED:", why)
        return 2
    chunks = TRIAL.chunk_bodies(bodies)

    state = _load_state(args.state)
    if state is None:
        state = {
            "job": JOB,
            "library_root": root,
            "library_sha": report["library_sha"],
            "approved": "R-13 2026-08-26, the best reader, priced",
            "chunks": [{"ids": [str(e.get("id")) for e in c],
                        "doc_sha": _sha(_doc_for(c)),
                        "status": "pending"} for c in chunks],
            "landed": False,
        }
        _save_state(args.state, state)
    else:
        if len(state.get("chunks") or []) != len(chunks):
            print("REFUSED: her library no longer shapes into the chunks "
                  "this run started with — a fresh --price and her fresh "
                  "word are needed (move the state file aside first).")
            return 2

    usage_totals = {"in": 0, "out": 0}
    for rec in state["chunks"]:
        if rec["status"] == "ok":
            u = rec.get("usage") or {}
            usage_totals["in"] += int(u.get("input_tokens") or 0)
            usage_totals["out"] += int(u.get("output_tokens") or 0)

    sent_this_run = 0
    for idx, chunk in enumerate(chunks):
        rec = state["chunks"][idx]
        if rec["status"] == "ok":
            continue
        if rec["status"] == "failed" and not args.retry_failed:
            print("STOPPED at chunk %d: it failed before and may have "
                  "been billed. --retry-failed is her word for a second "
                  "attempt." % idx)
            return 1
        if args.max_chunks is not None and sent_this_run >= args.max_chunks:
            print("PAUSED after %d chunks this invocation, as asked."
                  % sent_this_run)
            return 0
        doc = _doc_for(chunk)
        if _sha(doc) != rec["doc_sha"]:
            print("REFUSED at chunk %d: her library moved since this run "
                  "was priced — these are not the bytes she approved."
                  % idx)
            return 2
        if _usd_of_chunks(state["chunks"]) > SPEND_CEILING_USD:
            print("STOPPED: reported usage has priced past the $%.0f "
                  "ceiling." % SPEND_CEILING_USD)
            return 1

        started = time.time()
        result = server.record_call(JOB, doc, routing)
        took = time.time() - started
        if not isinstance(result, dict) or not result.get("ok"):
            rec["status"] = "failed"
            rec["failure"] = (result or {}).get("failure")
            rec["at"] = int(time.time() * 1000)
            _save_state(args.state, state)
            print("CHUNK %d/%d DID NOT LAND (%s) after %.1fs — the run "
                  "stops here; nothing is retried on its own."
                  % (idx + 1, len(chunks), rec["failure"], took))
            return 1
        usage = result.get("usage") or {}
        fill = server._answering_fill(JOB, routing)
        rec["model"] = fill[1] if fill else None
        rec["status"] = "ok"
        rec["at"] = int(time.time() * 1000)
        # ⚠ the seam's usage shape is {provider, counts}; the ledger's own
        # readers fold the provider spellings — reused, never re-spelled.
        rec["usage"] = {
            "input_tokens": server._reported_tokens(
                usage, server._USAGE_INPUT_NAMES),
            "output_tokens": server._reported_tokens(
                usage, server._USAGE_OUTPUT_NAMES)}
        rec["subjects"] = (result.get("structured") or {}).get(
            "subjects") or []
        usage_totals["in"] += int(rec["usage"]["input_tokens"] or 0)
        usage_totals["out"] += int(rec["usage"]["output_tokens"] or 0)
        _save_state(args.state, state)
        sent_this_run += 1
        print("chunk %d/%d ok in %.1fs — %d subjects here, ~$%.2f so far"
              % (idx + 1, len(chunks), took, len(rec["subjects"]),
                 _usd_of_chunks(state["chunks"])))

    if not all(r["status"] == "ok" for r in state["chunks"]):
        return 1

    if state.get("landed"):
        print("The reading is whole and was already landed. Nothing to do.")
        return 0

    subjects, dropped_ids, dropped_empty = merge_subjects(state)
    existing = study_lib.load_subjects(root)["subjects"]
    if existing:
        print("REFUSED to land: librarian/subjects.json already holds "
              "%d entries — the reading is once, and landing twice needs "
              "her word (this state file has the findings)."
              % len(existing))
        return 2
    study_lib.save_subjects(root, subjects)
    state["landed"] = True
    _save_state(args.state, state)

    print()
    print("THE READING IS WHOLE.")
    print("  subjects it will offer     ", len(subjects))
    print("  invented ids dropped       ", dropped_ids)
    print("  empty proposals dropped    ", dropped_empty)
    print("  reported tokens            %d in / %d out"
          % (usage_totals["in"], usage_totals["out"]))
    print("  priced from reported usage ~$%.2f"
          % _usd_of_chunks(state["chunks"]))
    print("  landed at                  ",
          str(study_lib.subjects_file_path(root)))
    print()
    print("⛔ They are PROPOSALS. Nothing is set aside unless she says so.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
