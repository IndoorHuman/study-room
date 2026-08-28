#!/usr/bin/env python3
"""tools/setup_pass_trial.py — HER SETUP PASS, run once, as a trial.

⛔⛔ WHAT THIS IS AND WHOSE IT IS. 26.998-WEIGHTING.md § W-11 beat 4, WRITTEN BY
HER with nothing offered: *"I think this can be done as the first setup, let
this written into the librarian's memory"*. The room reads her older writing
ONCE, keeps what it learned, and never sends her archive again. § W-12 is her
ruling that a SMALL SLICE runs first and she reads what it writes before the
whole archive is committed to. § W-13 is which slice: **only what she wrote** —
her diary and the notes carrying her own hand-written mark.

⛔ THE FOUR CONSTRAINTS ARE HERS AND EVERY ONE OF THEM IS ENFORCED HERE RATHER
THAN PROMISED:

  1. IT GOES THROUGH THE ROOM'S OWN CALL SEAM. `server.record_call`, the same
     function every shipped caller names, so the call lands in her privacy
     ledger. ⛔ A side-channel `urllib` request would send her diary off the
     books, and that ledger is the only thing in the room that answers *has my
     privacy been kept* with evidence instead of a promise.
  2. THE FENCE HOLDS. The payload is built by `study_lib.build_librarian_payload`
     — the ONE audited byte source — never by a second spelling of it here. Her
     private list (HR, medical, assessment) is excluded by that function's own
     predicate, and the fenced items are deliberately LEFT IN the snapshot it is
     handed so its title-shadow screen keeps its teeth.
  3. IT WRITES NOTHING INTO HER LIBRARY OR HER NOTEBOOK. Not one byte. The
     answer is printed and saved OUTSIDE the library for her to read and rule
     on; where it eventually lands is her decision and not this script's.
  4. THE EXACT SLICE AND ITS EXACT COST GO TO HER BEFORE A PENNY MOVES.
     `--price` sends nothing at all. `--run` additionally requires `--yes`.

⚠⚠ THE NARROWING IS PROVED BEFORE ANYTHING IS CONCLUDED ABOUT IT, and that is
this project's own repeated defect written into a check: a gate that counts the
READ and concludes about the DELIVERY, a fixture that never overflowed reporting
what survived a cut. So `--price` and `--run` both REFUSE outright unless every
item in her slice actually came back in the payload's bodies and the builder's
own shed counters all read zero. ⛔ A pass that quietly sent two thirds of her
diary would otherwise look exactly like a pass that sent all of it.

⚠ HER LIBRARY IS READ-ONLY HERE and it is checked rather than asserted: the
store file's SHA-256 is taken before the first read and after the last, and a
move is reported as a failure of this script.

⚠ THE ONE THING THIS SCRIPT DECIDES BY ITSELF is nothing about her ranking. It
assigns no weight, no ratio, no threshold, no tie-break and no ordering rule —
the slice is her § W-13 answer resolved through the room's own `journal_tier`
and `reflection_tier`, which are the single spellings of those questions.

Stdlib only (law 8). Run from anywhere:

    python3 tools/setup_pass_trial.py --price
    python3 tools/setup_pass_trial.py --run --yes
"""

import argparse
import copy
import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import librarian_call                      # noqa: E402
import server                              # noqa: E402  (binds the literals)
import study_lib                           # noqa: E402


JOB = "archive_learning"

# ⚠ THE RATES ARE A PARAMETER OF THE ESTIMATE, NOT A FACT OF THE ROOM. Money
# lives nowhere in the call record by design (D-01/D-02: a record that reads as
# a bill stops being read as a privacy record), and it does not live in the seam
# either. These two numbers were read from the provider's own published table on
# 2026-08-24 and are stated here so a later reader can see what the estimate
# rested on rather than trusting a total. ⛔ AN ESTIMATE, NEVER A QUOTE.
RATE_IN_PER_M = {"claude-opus-5": 5.00, "claude-haiku-4-5": 1.00,
                 "gpt-5.1": 1.25, "gpt-5.1-mini": 0.25,
                 "qwen2.5:7b": 0.00}
RATE_OUT_PER_M = {"claude-opus-5": 25.00, "claude-haiku-4-5": 5.00,
                  "gpt-5.1": 10.00, "gpt-5.1-mini": 2.00,
                  "qwen2.5:7b": 0.00}

# ⚠ THE TOKEN ESTIMATE'S OWN METHOD, WRITTEN DOWN. English runs about 3.28
# characters to the token and Chinese about 0.87, so a byte count alone is
# wrong by a third on her library — which is 16% Chinese. ⛔ This is arithmetic
# over her text, not a call: nothing is sent to count anything.
_CJK_RANGES = ((0x4E00, 0x9FFF), (0x3400, 0x4DBF),
               (0x3000, 0x303F), (0xFF00, 0xFFEF))
CHARS_PER_TOKEN_CJK = 0.87
CHARS_PER_TOKEN_OTHER = 3.28


def _is_cjk(ch):
    o = ord(ch)
    return any(lo <= o <= hi for lo, hi in _CJK_RANGES)


def estimate_tokens(text):
    """A token estimate for one string. Pure; sends nothing."""
    cjk = sum(1 for ch in text if _is_cjk(ch))
    return (cjk / CHARS_PER_TOKEN_CJK
            + (len(text) - cjk) / CHARS_PER_TOKEN_OTHER)


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _header_reader(store, root):
    """`derive_handwritten`'s frontmatter reader, jailed to the library by the
    store's own `_snapshot_path`. ⛔ Never a path built here."""
    def read(item_id):
        item = (store.get("items") or {}).get(item_id) or {}
        path = study_lib._snapshot_path(root, item)
        if path is None:
            return b""
        try:
            with open(path, "rb") as f:
                return f.read(4096)
        except OSError:
            return b""
    return read


# ---------------------------------------------------------------------------
# ---- WHERE WHAT IT LEARNED LIVES (her ruling, 2026-08-25) -----------------
#
# ⛔⛔ AN OWNER CHECKPOINT, NOT AN AGENT'S PLACEMENT. A new file under
# `librarian/` trips a shipped safety pin whose whole worth is that it refuses
# to widen on its own — *"a THIRD volatile file would mean the room started
# writing something new into her folder, and this gate must notice that rather
# than widen to accommodate it"*. The precedent is exact: 26.99 gave the room a
# new thing to write, she was offered WIDEN / MOVE / NARROW, and she chose MOVE.
#
# ⭐ ASKED AGAIN AND ANSWERED DIFFERENTLY, 2026-08-25: **`With the librarian's
# other things`** — over living beside her privacy ledger where it would
# survive a reset, and over narrowing the check. ⚠ Chosen from an offered set;
# she was told first that the gate exists, that no agent may quietly move it,
# and that she would be authorising it to count one more file.
#
# ⚠ THE COST SHE WAS SHOWN AND TOOK: deleting `librarian/` is the librarian's
# factory reset, and it now takes what the room learned about her with it.
# ⭐ Which is arguably the point — a portrait of her that survived the reset
# meant to erase the librarian would be the worse of the two.
#
# ⚠ IT IS A STABLE FILE, NOT A VOLATILE ONE. Written ONCE as a portrait, then
# by her — ⚠ AMENDED 26.9985 (R-3/R-4): the room gained ONE legitimate second
# writer, the subject removal, and it lives in `study_lib` beside the
# kept-back store, never here. The spelling of the path and the header moved
# to `study_lib` with it, so the removal engine, this trial and `server.py`
# cannot drift apart; these three names stay importable because the call-seam
# suite (and any hand of hers) reaches them through this module.
LEARNED_NAME = study_lib.LEARNED_NAME

# ⛔ AN AGENT'S WORDING, AND IT SAYS SO — `study_lib.LEARNED_HEADER`'s own
# comment carries the provenance, including why the 26.998 wording ("the room
# only ever reads this file") was RETIRED: R-3/R-4 made it false.
LEARNED_HEADER = study_lib.LEARNED_HEADER


def learned_path(root):
    """The one spelling of where it lives — resolved through `study_lib`,
    the same spelling the removal engine and the server read. ⛔ Under
    `librarian/`, her ruling."""
    return str(study_lib.learned_file_path(root))


def keep(root, answer_text, replace=False):
    """Land what she approved, once. Returns the path written.

    ⛔ REFUSES TO OVERWRITE. The pass reads her archive ONCE by her own design,
    and this file is hers to edit afterwards — so a second write is either a
    mistake or an erasure of her own hand, and neither may happen quietly.

    ⚠ THE THREE CASES, SETTLED IN 26.9985 (R-3/R-4) AND SPLIT BY DOOR RATHER
    THAN BY FLAG: (1) a second SETUP PASS — this function, refused below,
    unchanged; (2) a subject removal of the room's own lines and (3) a
    removal touching lines SHE edited — both allowed, both SHOWN to her,
    both through `study_lib.apply_subject_removal` and never through here.
    That door can only DELETE lines already standing in the file, so it is
    structurally incapable of being a second setup pass in disguise — the
    refusal learned the difference without loosening a case."""
    path = learned_path(root)
    if os.path.exists(path) and not replace:
        raise TrialRefused(
            "the room has already learned once and that file is hers now — "
            "overwriting it would erase whatever she has since edited")
    body = (LEARNED_HEADER + str(answer_text).strip() + "\n").encode("utf-8")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    study_lib.atomic_write_bytes(path, body)
    return path


class TrialRefused(Exception):
    """The trial refuses to price or send. Never a warning — every one of
    these means the thing being concluded about was not the thing measured."""


def build_slice(root):
    """Her § W-13 slice, and the payload the seam would be handed for it.

    Returns (payload, stdin_text, report). ⛔ Reads her library and writes
    nothing anywhere. Raises `TrialRefused` when the narrowing cannot be shown
    to have delivered exactly her slice."""
    store_file = os.path.join(root, "items.json")
    before = _sha256(store_file)
    before_mtime = os.stat(store_file).st_mtime

    store = study_lib.load_store(root)
    meta = store.get("meta") or {}
    filters = meta.get("filters") or []

    # Both derivations are the room's own single spellings. `derive_handwritten`
    # mutates the store IN MEMORY; this process never saves one, and the hash
    # check below is what proves that rather than this sentence.
    study_lib.derive_handwritten(store, _header_reader(store, root), filters)
    journal = study_lib.journal_tier(store, filters)
    journal_ids = journal.get("ids") or set()

    items = store.get("items") or {}
    mine, fenced = {}, {}
    for item_id, item in items.items():
        if study_lib._librarian_fenced(item, filters):
            # ⛔ KEPT, NOT DROPPED. The builder's title-shadow screen compares
            # every surviving title against the FENCED titles; handing it a
            # snapshot with the fenced items removed would silently disarm the
            # fence's own defence in depth.
            fenced[item_id] = item
            continue
        if (item.get("type") == "text"
                and study_lib.reflection_tier(item, journal_ids) in (
                    study_lib.REFLECTION_TIER_JOURNAL,
                    study_lib.REFLECTION_TIER_HANDWRITTEN)):
            mine[item_id] = item

    if not mine:
        raise TrialRefused(
            "her slice is empty — neither her diary nor her hand-written mark "
            "reaches anything today, and a pass over nothing would still cost "
            "her a call")

    snapshot = copy.deepcopy(store)
    snapshot["items"] = dict(mine)
    snapshot["items"].update(fenced)

    payload = study_lib.build_librarian_payload(
        snapshot, "reflection", consent=True, store_dir=root,
        session_marker=None, journal_ids=journal_ids)

    # ---- THE NARROWING IS PROVED HERE, BEFORE ANY CLAIM ABOUT IT ----------
    delivered = {entry.get("id") for entry in payload.get("bodies") or []}
    missing = [i for i in mine if i not in delivered]
    if missing:
        raise TrialRefused(
            "%d of her %d pieces never reached the payload — the pass would "
            "send less than she approved while looking identical"
            % (len(missing), len(mine)))
    extra = delivered - set(mine)
    if extra:
        raise TrialRefused(
            "%d pieces reached the payload that are NOT in her slice"
            % len(extra))
    if payload.get("meta_rows"):
        raise TrialRefused(
            "the payload carries title-only rows, which this pass never asked "
            "for and she never approved")
    counts = payload.get("counts") or {}
    for key in ("ranking-shed", "identity-leaned", "heavy-capped",
                "reach-back", "title-shadowed", "pool-capped"):
        if counts.get(key):
            raise TrialRefused(
                "the reflection scope's %s pass moved %d rows; those passes "
                "size a sitting's document and have no business narrowing a "
                "one-time read of her own diary"
                % (key, counts[key]))

    stdin_text = json.dumps({"bodies": payload["bodies"]}, ensure_ascii=False)

    after = _sha256(store_file)
    if after != before or os.stat(store_file).st_mtime != before_mtime:
        raise TrialRefused(
            "her library moved while this ran — refusing to go on")

    report = {
        "pieces": len(mine),
        "diary": sum(1 for i in mine if str(i) in journal_ids),
        "her_mark": sum(1 for i in mine if str(i) not in journal_ids),
        "cut_short": counts.get("bodies-capped", 0),
        "unreadable": counts.get("bodies-unreadable", 0),
        "document_bytes": len(stdin_text.encode("utf-8")),
        "library_sha": before,
    }
    return payload, stdin_text, report


def price(stdin_text, routing):
    """(provider, model, dollars_in, dollars_out_worst) for THIS call, on the
    fill that would actually answer it. ⛔ Sends nothing."""
    fill = server._answering_fill(JOB, routing)
    provider, model = (fill if fill else (None, None))
    row = librarian_call.JOBS[JOB]
    prompt_tokens = estimate_tokens(row.get("prompt") or "")
    body_tokens = estimate_tokens(stdin_text)
    tokens_in = prompt_tokens + body_tokens
    worst_out = int(row.get("max_tokens") or 0)
    return {
        "provider": provider,
        "model": model,
        "tokens_in": tokens_in,
        "worst_tokens_out": worst_out,
        "usd_in": tokens_in / 1e6 * RATE_IN_PER_M.get(model, 0.0),
        "usd_out_worst": worst_out / 1e6 * RATE_OUT_PER_M.get(model, 0.0),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--price", action="store_true",
                    help="the default: measure the slice, price it, send "
                         "nothing")
    ap.add_argument("--run", action="store_true",
                    help="actually make the one call (needs --yes)")
    ap.add_argument("--yes", action="store_true",
                    help="her approval, given after she has seen the price")
    ap.add_argument("--out", default=None,
                    help="where to save what comes back — never inside her "
                         "library")
    ap.add_argument("--library", default=None,
                    help="the library to read. ⚠ An ARGUMENT rather than a "
                         "constant so a gate can drive this whole script "
                         "against a COPIED fixture and never against hers.")
    ap.add_argument("--keep", default=None,
                    help="land an answer SHE HAS ALREADY READ AND APPROVED "
                         "into the librarian's folder. ⛔ A separate word from "
                         "--run on purpose: § W-12 is that the pass writes "
                         "nothing until she has seen what it wrote.")
    ap.add_argument("--replace", action="store_true",
                    help="overwrite what the room already learned. ⛔ Erases "
                         "whatever she has edited there since.")
    args = ap.parse_args(argv)

    root = args.library
    if not root:
        local = os.path.join(os.path.dirname(
            os.path.dirname(os.path.abspath(__file__))), "library.local.json")
        with open(local, encoding="utf-8") as f:
            root = json.load(f)["library_root"]

    if args.keep:
        # ⛔ NO CALL, NO SLICE, NO MODEL. Landing what she approved is a file
        # write and nothing else — reaching the seam here would send her
        # writing a second time to do a job that needs no model at all.
        with open(args.keep, encoding="utf-8") as f:
            answer = f.read()
        answer = answer.split("---\n", 1)[-1] if "---\n" in answer else answer
        try:
            path = keep(root, answer, replace=args.replace)
        except TrialRefused as why:
            # ⚠ A REFUSAL IS NEWS, NOT A CRASH. She reads this in a terminal,
            # and a traceback would tell her the room is broken when what
            # actually happened is that the room protected her own edits.
            print("REFUSED:", why)
            return 2
        print("KEPT — the room has learned, once.")
        print("  it lives at", path)
        print("  yours to open, edit or delete; nothing rewrites it")
        return 0

    payload, stdin_text, report = build_slice(root)
    routing = server.resolve_librarian_routing()
    quote = price(stdin_text, routing)

    print("HER SLICE — only what she wrote")
    print("  her diary                  ", report["diary"])
    print("  carrying her own mark      ", report["her_mark"])
    print("  read only up to the cap    ", report["cut_short"])
    print("  unreadable                 ", report["unreadable"])
    print("  the whole document, bytes  ", report["document_bytes"])
    print("  her library's fingerprint  ", report["library_sha"][:16], "(unmoved)")
    print()
    print("THE CALL — one, through the room's own seam")
    print("  job                        ", JOB)
    print("  who answers                ", quote["provider"], quote["model"])
    print("  estimated tokens in        ", int(quote["tokens_in"]))
    print("  at most, tokens out        ", quote["worst_tokens_out"])
    print("  ESTIMATED COST             $%.3f" % quote["usd_in"],
          "+ at most $%.3f out" % quote["usd_out_worst"],
          "= at most $%.3f" % (quote["usd_in"] + quote["usd_out_worst"]))
    print("  ⚠ an ESTIMATE, not a quote")

    gap = server.base_consent_gap(routing)
    if gap is not None:
        print()
        print("REFUSED: an address she has not agreed to is in effect —",
              gap[0], gap[2])
        return 2

    if not args.run:
        print()
        print("Nothing was sent. --run --yes makes the one call.")
        return 0
    if not args.yes:
        print()
        print("REFUSED: --run without --yes. Her approval is a separate word.")
        return 2

    started = time.time()
    result = server.record_call(JOB, stdin_text, routing)
    took = time.time() - started

    if not isinstance(result, dict) or not result.get("ok"):
        print()
        print("THE CALL DID NOT LAND:", (result or {}).get("failure"))
        print("⛔ Nothing was written anywhere. Her approval is spent; the "
              "next attempt is hers to give again.")
        return 1

    learned = (result.get("structured") or {}).get("learned")
    usage = result.get("usage") or {}
    out_path = args.out or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "..", "..",
        "setup-pass-trial.md")
    out_path = os.path.abspath(out_path)
    if os.path.abspath(root) in out_path:
        print("REFUSED: the answer may not be written inside her library")
        return 2
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("# What the room learned, reading only what she wrote\n\n")
        f.write("⚠ A TRIAL. Nothing here has been written into her library or "
                "the librarian's notebook. What the notebook may say about "
                "her, and in what shape, is hers to rule on and this is the "
                "thing she rules on.\n\n")
        f.write("---\n\n")
        f.write(str(learned or "").strip() + "\n")
    print()
    print("IT LANDED in %.1fs. Reported usage: %s" % (took, json.dumps(usage)))
    print("Saved to", out_path)
    print()
    print(str(learned or "").strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
