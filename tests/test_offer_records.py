#!/usr/bin/env python3
"""
tests/test_offer_records.py — the offer route, the burst collapse, the cap, the
cycle record, and `not relevant` with the librarian-memory read
(Plans 26.95-30 Task 2 and 26.95-31 Task 2; SRM-11 / SRM-12 / SRM-13).

server.py owns the two halves of the reach back that need the disk (P-1): the
burst collapse, whose feature prints are 3,072 raw bytes per picture under
<library_root>/vision/, and the cap of three MOMENTS. core.js owns the pure
half and is pinned by tests/test_offer_selector.cjs.

Run contract (the house's): stdlib only, no framework and no runner, path
independent via Path(__file__).parent.parent, ONE OK line and exit 0 on
success, every failure listed with its case name and the throwing frame and
exit 1. A quiet stop is indistinguishable from a pass here, so the exit code is
the whole report.

⚠ EVERY FIXTURE LIVES IN A FRESH tempfile.mkdtemp() TREE, removed on BOTH the
pass and the fail path by the runner's finally. Nothing here reads, writes,
moves or deletes anything under the owner's real library, and no absolute home
path is ever spelled — every path is derived.

⛔ NO COMMENT OR CASE IN THIS FILE STATES A MEASURED QUALITY FIGURE FOR BURST
GROUPING (study_lib's assumption A5: the 247 groups are a rule's OUTPUT, not
labels, so validating against them is circular). Both tunables are read from
study_lib BY NAME and neither is hardcoded here.

⚠ THE `not relevant` RECORD IS KEYED ON BOTH THE ITEM'S ID AND ITS ORIGIN PATH,
AND A MATCH ON EITHER ONE COUNTS — owner ruling, 2026-08-15, taken on the
blocking checkpoint that opened plan 26.95-31. Case 17 is that ruling's own
case: an id alone does not survive a rename and a path alone does not survive a
move, so both halves are driven from both sides rather than assumed.

The twenty-three cases, in the order the registry pins them:

   1. fail_open_read        — a missing, an unreadable, an off-shape and a
                              directory-shaped offers.json each read as an
                              EMPTY memory and never raise (D-05, D-14).
   2. write_idiom           — the record lands under a VISIBLE librarian/
                              folder, parses as a list, appends in write order,
                              carries an epoch-MS `at`, and leaves no temp
                              sibling behind.
   3. w7_what_is_recorded   — the recorded shown_ids are the ids the route
                              RETURNED, never the candidate list, and the
                              record is written AFTER the collapse and the cap.
   4. cycle_reset           — a recorded id is not re-offered; the cycle resets
                              only when the shown list was actually holding ids
                              back; a pool merely smaller than the cap is NOT a
                              reset (the selectShelf idiom, mirrored).
   5. collapse              — three frames inside the window and above the
                              floor become ONE Moment represented by the
                              earliest capture; a pair failing either clause
                              stays two (D-07, P-4).
   6. no_rounding_step_at_the_floor
                            — a pair just under the floor stays split and its
                              twin just over it merges, so no rounding step can
                              sit between the dot product and the comparison.
   7. missing_print_splits  — an id whose .fp is absent is left out of the
                              print map and split rather than merged, and the
                              pass completes.
   8. cap                   — eight singleton groups yield exactly
                              OFFER_MOMENT_CAP ids, in group order.
   9. fence_screen_before_any_file_open
                            — a never_show, a retired, a trigger-flagged and an
                              id the store does not hold are each dropped
                              BEFORE any .fp path is even built (law 5).
  10. validation_fail_closed — every malformed body is refused 400 in plain
                              words and writes nothing.
  11. route_reaches_no_model — the route completes with the librarian call seam
                              patched to raise on any invocation (P-7).
  12. concurrent_record     — two threads recording at once leave a file that
                              still parses as a list with every entry present.

  --- 26.95-31: `not relevant`, and the librarian-memory read ---

  13. nr_fail_open_read     — a missing, an unreadable, an off-shape and a
                              directory-shaped not-relevant.json each read as
                              an EMPTY memory and never raise.
  14. nr_write_idiom        — the entry lands under the VISIBLE librarian/
                              folder carrying BOTH keys and an epoch-MS `at`,
                              in its own file beside offers.json, with no temp
                              sibling left behind.
  15. nr_ordering           — entries append in write order, newest last, each
                              with an integer epoch-ms `at`.
  16. nr_idempotent         — the same answer given twice leaves ONE entry and
                              does not rewrite a byte.
  17. nr_match_on_either    — THE RULING: an entry matching only by id (the
                              file was renamed) and one matching only by path
                              (it came back under a new id) are BOTH honoured,
                              and one matching neither is not.
  18. nr_validation_fail_closed
                            — a missing / non-string / empty id, an id the
                              store does not hold, and a never_show, retired or
                              trigger-flagged id are each refused 400 in plain
                              words having written nothing — and the unknown
                              and the fenced refusals are the SAME SENTENCE, so
                              an error can never answer "is there a never-show
                              item under this id?".
  19. nr_changes_no_item_state
                            — after an answer the store is byte-identical, no
                              state and no history moved, and the store's own
                              save verb is never reached (D-14: no sixth state,
                              and nothing happens to the item).
  20. nr_adjacency_excluded_once
                            — an id in BOTH records is excluded once, and a
                              cycle reset restores the cycle's entries and
                              never the permanent one. Controlled against the
                              same fixture without the record, where the reset
                              DOES bring that id straight back.
  21. memory_route_shape    — ids and one timestamp only: no title, no text, no
                              source, no folder and no path reaches the client,
                              asserted against sentinel values over the whole
                              serialized body; fenced ids never appear.
  22. memory_route_fail_open
                            — an unreadable record, an off-shape record and a
                              store that will not load each answer 200 with an
                              empty memory and a null stamp, and the fail-open
                              branch is proven to have RUN rather than the
                              answer having been empty anyway.
  23. nr_concurrent_same_id — two threads answering about the same id leave
                              exactly ONE entry for it and a file that still
                              parses; two threads on different ids leave both.

  --- 26.95-33: the front call's own round trip (P-7) ---

  24. reach_date_validation_fail_closed
                            — a missing / non-string / empty seed id, an id
                              the store does not hold, and a never_show,
                              retired or trigger-flagged id are each refused
                              400 in plain words having sent NOTHING — and the
                              unknown and the fenced refusals are the SAME
                              SENTENCE, so an error can never answer "is there
                              a never-show item under this id?".
  25. reach_date_with_no_blessed_body_lands_on_today
                            — driven against the REAL fence builder: an unseen
                              Seed has no readable blessed body, so no call is
                              made at all and the reach lands on today's
                              calendar, silently. The builder is reached ONCE,
                              on the `note` scope, over a store view holding
                              that one item — never a second builder.
  26. reach_date_every_failure_lands_on_today
                            — a declined token, a declined ANSWER, no_key,
                              ollama_not_running, truncated, malformed, a
                              refusal, an unparseable window, a window in the
                              future and an answer with no shape at all ALL
                              resolve to today's calendar fortnight and the
                              current year, with `from` naming the today
                              token — and the provider's own sentence, planted
                              in every one of those answers, reaches the
                              returned value at no depth.
  27. reach_date_ids_track_the_model_derived_fortnight
                            — ⚠ THE ORDERING GATE, BUILT SO IT CAN FAIL. The
                              whole dateless path is driven twice against one
                              fixture with the front call stubbed to two
                              windows in two DIFFERENT fortnights: the id sets
                              must DIFFER, every returned id's capture must
                              fall in the fortnight that run's stub named, the
                              answers must be non-empty, and the caption must
                              name that same number.
  28. reach_date_is_not_reached_when_the_seed_knows_its_date
                            — a fortnight that ARRIVES with the offer reaches
                              the front call's route not at all, asserted with
                              that route patched to raise on invocation and
                              the patch then proven live.
"""
import calendar
import inspect
import json
import math
import os
import re
import shutil
import struct
import sys
import tempfile
import threading
import time
import traceback
from pathlib import Path

# Bytecode writing off (the drill runs plants and reverts; a stale __pycache__
# is a way to measure the wrong bytes). The caller also sets the env var; this
# is the belt beside it.
sys.dont_write_bytecode = True

# study_lib.py and server.py are plain modules at the repo root — the same shim
# every other python suite uses, so the runner's cwd never matters. The import
# itself is the proof that neither binds a socket.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import study_lib  # noqa: E402
import server  # noqa: E402
import librarian_call  # noqa: E402  — the seam case 11 proves is untouched

DIM = study_lib.VISION_PRINT_DIM
DAY_MS = 86400000


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------

def unit_print(cos_to_basis):
    """A 768-float32 feature print whose dot product with `basis_print()` is
    `cos_to_basis`.

    The prints Vision returns are L2-normalised, which is what makes a plain
    dot product the cosine (study_lib.print_cosine says so with its measured
    provenance). These are unit vectors of the same shape: (c, sqrt(1 - c^2),
    0, 0, ...) against (1, 0, 0, ...), so the dot IS the requested value, up to
    the float32 rounding the real cache also carries."""
    v = [0.0] * DIM
    c = float(cos_to_basis)
    v[0] = c
    v[1] = math.sqrt(max(0.0, 1.0 - c * c))
    return struct.pack("<" + str(DIM) + "f", *v)


def basis_print():
    return unit_print(1.0)


def write_print(root, item_id, blob):
    """One .fp beside the others, at the SHIPPED path — asked of study_lib
    rather than spelled here, so a path change moves this fixture too."""
    path = study_lib.vision_print_path(root, item_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)


def make_pic(item_id, created_ms, state="unseen", trigger=False):
    """One store item — a photograph, in the shape the store actually holds.

    `imported_ms` sits a decade after the capture so nothing here trips the
    client-side no-capture-date rule by accident; this side never reads it."""
    return {
        "id": item_id,
        "content_hash": (item_id * 8)[:64],
        "source": "folder-drop",
        "origin_path": "/src/pictures/" + item_id + ".png",
        "library_path": "items/" + item_id + ".png",
        "type": "image",
        "title": item_id + ".png",
        "created_ms": created_ms,
        "saved_ms": created_ms,
        "imported_ms": created_ms + 3650 * DAY_MS,
        "last_opened_ms": None,
        "state": state,
        "resting_until_ms": None,
        "tags": [],
        "trigger": trigger,
        "year": 2019,
        "folder": "pictures",
        "history": [],
    }


def make_store(items, filters=None):
    store = {"schema_version": study_lib.SCHEMA_VERSION, "items": {},
             "meta": {"filters": list(filters or [])}}
    for it in items:
        store["items"][it["id"]] = it
    return store


def rows_of(items):
    """The ordered candidate rows _offer_moments takes: {id, created_ms}."""
    return [{"id": it["id"], "created_ms": it["created_ms"]} for it in items]


# ---------------------------------------------------------------------------
# the handler stub — and the preflight that keeps it honest
# ---------------------------------------------------------------------------
#
# handle_librarian_offer is a method on the shipped request handler. Driving it
# through a real socket would add a server thread, an ephemeral port and the
# whole store-schema lifecycle to cases that are about route LOGIC, so the
# shipped function body is invoked directly against a stub `self`.
#
# ⚠ A STUB CAN DRIFT FROM THE THING IT STANDS IN FOR, AND A DRIFTED STUB IS A
# SUITE THAT MEASURES ITSELF. So the preflight below reads the SHIPPED source
# and refuses to run at all unless every `self.<attr>` the route touches is one
# this stub provides. Add a member to the route and this suite stops with an
# instruction rather than passing over code it never exercised.

STUB_MEMBERS = {"json_error", "json_response", "server", "store_or_fresh",
                # 26.95-31: the memory route says its fail-open branch out
                # loud rather than swallowing a read failure silently.
                "log_message"}

# Every shipped route this suite drives against the stub. ⚠ A ROUTE MUST BE
# ADDED HERE DELIBERATELY: the preflight below only guards what this names, so
# a route driven by a case but absent from this roster would be exercised
# through a stub nobody had checked.
STUBBED_ROUTES = ("handle_librarian_offer",
                  "handle_librarian_not_relevant",
                  "handle_librarian_memory",
                  # 26.95-33: the front call's own round trip. It touches the
                  # same five members the three above do — including
                  # log_message, which is how its fail-open branch says so.
                  "handle_librarian_reach_date")


class _StubServer(object):
    def __init__(self, root):
        self.library_root = root


class StubHandler(object):
    def __init__(self, root, store, store_raises=None):
        self.server = _StubServer(root)
        self._store = store
        self._store_raises = store_raises
        self.status = None
        self.body = None
        self.message = None
        self.logged = []

    def store_or_fresh(self):
        if self._store_raises is not None:
            raise self._store_raises
        return self._store

    def json_response(self, data):
        self.status = 200
        self.body = data
        return data

    def json_error(self, code, message):
        self.status = code
        self.message = message
        return None

    def log_message(self, fmt, *args):
        self.logged.append(fmt % args if args else fmt)


def call_offer(root, store, body):
    handler = StubHandler(root, store)
    server.StudyHandler.handle_librarian_offer(handler, body)
    return handler


def call_not_relevant(root, store, body):
    handler = StubHandler(root, store)
    server.StudyHandler.handle_librarian_not_relevant(handler, body)
    return handler


def call_memory(root, store, store_raises=None):
    handler = StubHandler(root, store, store_raises=store_raises)
    server.StudyHandler.handle_librarian_memory(handler)
    return handler


# ---------------------------------------------------------------------------
# 26.95-33: the front call's round trip, SEALED for the life of one case
# ---------------------------------------------------------------------------
#
# ⚠⚠ NOTHING IN THIS FILE MAY REACH A COMPANY, AND THAT IS ENFORCED RATHER THAN
# INTENDED. `handle_librarian_reach_date` resolves routing through the shipped
# resolver, which reads the room's own two files under the HOME directory — so
# every case that drives it runs under a TEMPORARY HOME inside its own fixture
# tree, exactly as tests/test_call_seam.py does. Whatever is or is not on this
# machine is therefore invisible here: nothing under a real home is opened,
# named, copied or printed, and no assertion below depends on the answer.
#
# THREE SEAMS ARE SWAPPED, AND THE THIRD IS THE BELT:
#   * HOME          -> a fresh directory inside the case's own temp tree, and
#                      both key env names emptied for the life of the case
#   * the call seam -> a fake that RECORDS and answers from a canned result
#   * the transport -> a fake that RECORDS and RAISES, so a socket cannot be
#                      opened even if the seam above were somehow bypassed
#
# ⚠ EVERY CASE ASSERTS THE TRANSPORT RECORDED NOTHING, and a raise alone would
# not have been enough: the route swallows broadly on purpose (it is silent by
# design, D-09), so an exception there ends up in a log line rather than in a
# failure. The recorded list is what the assertion reads.
#
# ⚠ THE PAYLOAD BUILDER IS ALWAYS A SPY AND SOMETIMES A STUB. It records the
# scope, the item ids of the store view it was handed and the store dir, then
# DELEGATES to the shipped builder — unless a case hands it a canned payload,
# which is how a case reaches the model path at all without a fixture whose
# blessed body would be a second, hand-made spelling of the fence. Case 25
# drives the real builder and says so.


class SealedRoom(object):
    """The three swaps above, installed on enter and undone on exit."""

    def __init__(self, root, seam=None, payload=None):
        self._home = Path(root) / "home"
        self._seam = seam
        self._payload = payload
        self.calls = []      # (job, payload_text) per seam invocation
        self.sockets = []    # any request that reached the transport
        self.built = []      # one record per payload build

    # -- the fakes ---------------------------------------------------------

    def _seam_fake(self, job, payload_text, routing):
        self.calls.append((job, payload_text))
        if self._seam is None:
            raise AssertionError(
                "the front call reached a model where this case says it "
                "never may")
        return self._seam

    def _transport_fake(self, request, timeout_s, auth=None):
        self.sockets.append((request or {}).get("url"))
        raise AssertionError(
            "a connection was opened from this suite — no case here may "
            "reach any provider, local or otherwise")

    def _builder_fake(self, store, scope, **kwargs):
        self.built.append({
            "scope": scope,
            "item_ids": sorted((store or {}).get("items") or {}),
            "store_dir": kwargs.get("store_dir"),
        })
        if self._payload is None:
            return self._saved_builder(store, scope, **kwargs)
        return self._payload

    # -- the hold ----------------------------------------------------------

    def __enter__(self):
        self._home.mkdir(parents=True, exist_ok=True)
        self._saved_home = os.environ.get("HOME")
        os.environ["HOME"] = str(self._home)
        self._saved_env = {}
        for name in librarian_call.KEY_ENV_NAMES.values():
            self._saved_env[name] = os.environ.pop(name, None)
        self._saved_seam = librarian_call.call_librarian
        self._saved_transport = librarian_call._transport
        self._saved_builder = study_lib.build_librarian_payload
        librarian_call.call_librarian = self._seam_fake
        librarian_call._transport = self._transport_fake
        study_lib.build_librarian_payload = self._builder_fake
        return self

    def __exit__(self, exc_type, exc, tb):
        study_lib.build_librarian_payload = self._saved_builder
        librarian_call._transport = self._saved_transport
        librarian_call.call_librarian = self._saved_seam
        for name, value in self._saved_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        if self._saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = self._saved_home
        return False


def call_reach_date(root, store, body, seam=None, payload=None,
                    store_raises=None):
    """One shipped reach-date call against a stub `self`, inside the seal."""
    handler = StubHandler(root, store, store_raises=store_raises)
    with SealedRoom(root, seam=seam, payload=payload) as sealed:
        server.StudyHandler.handle_librarian_reach_date(handler, body)
    return handler, sealed


# One blessed body, already through the fence — the shape the shipped builder
# returns, stood in for so a case can reach the model path without a second,
# hand-made spelling of what "blessed" means. Case 25 drives the real builder.
CANNED_SEED_PAYLOAD = {
    "bodies": [{"id": "seed-1", "text": "one blessed body, verbatim"}],
    "counts": {},
}


def model_window(start, end="2019-03-19"):
    """One well-formed answer from the front call: an absolute date window and
    the permitted decline, which is the WHOLE of what its shape can express.
    ⚠ No id, no list, no result of any kind — a canned answer carrying one
    would be this suite quietly agreeing to a shape the room does not have."""
    return {"ok": True,
            "structured": {"start": start, "end": end, "declined": False},
            "model": {"provider": "ollama", "reported": "qwen2.5:7b",
                      "independent": False},
            "usage": {}, "failure": None}


def model_failure(token, planted=None):
    """A call that went wrong, carrying one closed-register token — and, when
    asked, a sentence no real answer would contain, planted so "the provider's
    own words never cross" can be asserted against something that is genuinely
    there to be found."""
    result = {"ok": False, "structured": None, "model": None, "usage": {},
              "failure": token}
    if planted is not None:
        result["structured"] = {"note": planted}
    return result


# ---------------------------------------------------------------------------
# the fortnight arithmetic — ASKED FOR, never re-spelled
# ---------------------------------------------------------------------------

def ms_at(year, month, day):
    """One UTC capture stamp, in epoch MILLISECONDS.

    UTC on purpose: the bucket arithmetic below is UTC on both halves, and a
    local reading here would put the fixture a day out at exactly the boundary
    a bucket changes."""
    return int(calendar.timegm((year, month, day, 12, 0, 0, 0, 1, 0)) * 1000)


def fortnight_of_ms(ms):
    """The fortnight bucket one capture falls in — asked of the SHIPPED
    arithmetic (server._reach_fortnight_from_day) rather than re-spelled here.
    A second spelling of the bucket rule is the one-rule-two-callers drift this
    codebase keeps paying for, and it would let this file agree with itself
    while disagreeing with the room."""
    when = time.gmtime(ms / 1000.0)
    return server._reach_fortnight_from_day(when.tm_yday - 1)


def year_of_ms(ms):
    """The UTC year one capture falls in — the same clock the bound uses."""
    return time.gmtime(ms / 1000.0).tm_year


def client_candidates(store, fortnight, seed_id):
    """THE CLIENT'S OWN FILTER, STOOD IN FOR — and named as a stand-in.

    core.js `pickOfferCandidates` draws the gated pool, keeps what falls in the
    given fortnight of a year STRICTLY EARLIER THAN THIS ONE, and orders it
    oldest first (P-9). This is that rule in python over a fixture store, which
    is the only way one python process can drive the WHOLE dateless path end to
    end. ⚠ It is only ever used to FEED the offer route; nothing asserts
    anything about it, and the bucket arithmetic it uses is the shipped one.

    ⛔ THE YEAR BOUND IS NO LONGER A PARAMETER, HERE EITHER (D-05 amendment,
    2026-08-16, UAT finding F-5). It was, and the caller read it off the
    reach-date answer — so this mirror would have gone on agreeing with a room
    whose door was closing itself. A mirror that takes the bound as an argument
    can only ever confirm whatever the caller believed; this one asks the
    calendar, exactly as the shipped selector does."""
    this_year = time.gmtime().tm_year
    rows = []
    for item_id, item in (store.get("items") or {}).items():
        if item_id == seed_id:
            continue
        ms = item.get("created_ms") or 0
        if fortnight_of_ms(ms) != fortnight:
            continue
        if year_of_ms(ms) >= this_year:
            continue
        rows.append((ms, item_id))
    rows.sort()
    return [item_id for _ms, item_id in rows]


def preflight():
    """Refuse to run on a stub that no longer covers the shipped routes."""
    problems = []
    for name in STUBBED_ROUTES:
        fn = getattr(server.StudyHandler, name, None)
        if fn is None:
            problems.append("server.StudyHandler.%s is missing — that route "
                            "was renamed or removed" % name)
            continue
        src = inspect.getsource(fn)
        # ⚠ The region-extraction trap, guarded: a source slice that came back
        # a single line would make every scan below report clean for the wrong
        # reason.
        if len(src.splitlines()) < 20:
            problems.append("the shipped %s source is only %d line(s) — this "
                            "suite would be scanning the wrong text"
                            % (name, len(src.splitlines())))
        touched = set(re.findall(r"self\.([A-Za-z_][A-Za-z_0-9]*)", src))
        missing = touched - STUB_MEMBERS
        if missing:
            problems.append(name + " touches self." +
                            ", self.".join(sorted(missing)) +
                            " — extend StubHandler deliberately before "
                            "trusting any case in this file")
    if problems:
        return problems
    if server.librarian_call is not librarian_call:
        problems.append("server.librarian_call is not the module this suite "
                        "patches — case 11 would prove nothing")
    return problems


# ---------------------------------------------------------------------------
# the registry
# ---------------------------------------------------------------------------

CASES = []


def case(name):
    def deco(fn):
        CASES.append((name, fn))
        return fn
    return deco


EXPECTED_CASES = [
    "fail_open_read",
    "write_idiom",
    "w7_what_is_recorded",
    "cycle_reset",
    "empty_offer_is_not_a_cycle",
    "collapse",
    "no_rounding_step_at_the_floor",
    "missing_print_splits",
    "cap",
    "fence_screen_before_any_file_open",
    "validation_fail_closed",
    "route_reaches_no_model",
    "concurrent_record",
    # --- 26.95-31 ---
    "nr_fail_open_read",
    "nr_write_idiom",
    "nr_ordering",
    "nr_idempotent",
    "nr_match_on_either",
    "nr_validation_fail_closed",
    "nr_changes_no_item_state",
    "nr_adjacency_excluded_once",
    "memory_route_shape",
    "memory_route_fail_open",
    "nr_concurrent_same_id",
    # --- 26.95-33 ---
    "reach_date_validation_fail_closed",
    "reach_date_with_no_blessed_body_lands_on_today",
    "reach_date_every_failure_lands_on_today",
    "reach_date_ids_track_the_model_derived_fortnight",
    "reach_date_is_not_reached_when_the_seed_knows_its_date",
    # --- 26.99-18 (T-26.99-34 / T-26.99-39) ---
    "reach_date_refuses_an_address_she_never_agreed_to",
]


# ---------------------------------------------------------------------------
# 1. fail-open read
# ---------------------------------------------------------------------------

@case("fail_open_read")
def _fail_open_read(root):
    assert server._load_offer_cycle(root) == [], "a missing file is an " \
        "empty memory, never an error (D-05)"
    d = root / "librarian"
    d.mkdir(parents=True)
    offers = d / "offers.json"

    offers.write_text("{not json at all", encoding="utf-8")
    assert server._load_offer_cycle(root) == [], "unparseable is empty"

    offers.write_text('{"shown_ids": ["a"]}', encoding="utf-8")
    assert server._load_offer_cycle(root) == [], \
        "an off-shape file (a mapping where a list belongs) is empty — the " \
        "file is hers to hand-edit and a wrong shape must not raise"

    offers.write_text('"a bare string"', encoding="utf-8")
    assert server._load_offer_cycle(root) == [], "a bare string is empty"

    offers.unlink()
    offers.mkdir()
    assert server._load_offer_cycle(root) == [], \
        "a directory where the file belongs is an OSError, and still empty"

    # ...and deleting the whole folder resets the cycle without breaking
    # anything, which is what makes D-14's "plain local files, hers to read
    # and delete" true rather than a claim.
    shutil.rmtree(str(d))
    assert server._load_offer_cycle(root) == []


# ---------------------------------------------------------------------------
# 2. the write idiom
# ---------------------------------------------------------------------------

@case("write_idiom")
def _write_idiom(root):
    server._record_offer(root, ["alpha", "beta"], "seed-one")
    d = root / "librarian"
    assert d.is_dir(), "the librarian folder is VISIBLE (D-05)"
    assert not (root / ".librarian").exists(), "never a hidden dotdir"

    names = sorted(p.name for p in d.iterdir())
    assert names == ["offers.json"], \
        f"a temp sibling survived the atomic write: {names}"

    entries = json.loads((d / "offers.json").read_text(encoding="utf-8"))
    assert isinstance(entries, list) and len(entries) == 1, entries
    row = entries[0]
    assert row["shown_ids"] == ["alpha", "beta"], row
    assert row["seed_id"] == "seed-one", row
    at = row["at"]
    assert isinstance(at, int) and not isinstance(at, bool), repr(at)
    # EPOCH MS, not seconds. A seconds stamp would be off by a factor of a
    # thousand and every cycle comparison would still "work" against itself.
    assert abs(at - int(time.time() * 1000)) < 120000, at

    # A second record APPENDS in write order, and the newest `at` is what the
    # current cycle reads — the seed window's lower bound.
    server._record_offer(root, ["gamma"], "seed-two")
    entries = server._load_offer_cycle(root)
    assert [e["seed_id"] for e in entries] == ["seed-one", "seed-two"], entries
    assert server._offer_cycle_shown(entries) == {"gamma"}, \
        "the CURRENT cycle is the newest entry's shown_ids, not the union"

    # An off-shape row contributes nothing rather than raising.
    entries.append("hand-edited nonsense")
    assert server._offer_cycle_shown(entries) == {"gamma"}


# ---------------------------------------------------------------------------
# 3. W-7: what is recorded, and when
# ---------------------------------------------------------------------------

@case("w7_what_is_recorded")
def _w7_what_is_recorded(root):
    base = 1600000000000
    gap = study_lib.BURST_WINDOW_MS * 10
    pics = [make_pic("w-%d" % i, base + i * gap) for i in range(6)]
    store = make_store(pics)
    candidate_ids = [p["id"] for p in pics]

    order = []
    recorded = {}
    real_moments = server._offer_moments
    real_record = server._record_offer

    def spy_moments(library_root, rows):
        order.append("_offer_moments")
        return real_moments(library_root, rows)

    def spy_record(library_root, ids, seed_id):
        order.append("_record_offer")
        recorded["ids"] = list(ids)
        recorded["seed_id"] = seed_id
        return real_record(library_root, ids, seed_id)

    server._offer_moments = spy_moments
    server._record_offer = spy_record
    try:
        handler = call_offer(root, store, {
            "seed_id": "the-seed", "fortnight": 8,
            "candidate_ids": candidate_ids})
    finally:
        server._offer_moments = real_moments
        server._record_offer = real_record

    assert handler.status == 200, handler.message
    returned = handler.body["ids"]
    assert len(returned) == server.OFFER_MOMENT_CAP, returned

    # THE ORDER. The record lands AFTER the collapse and after the cap.
    assert "_offer_moments" in order and "_record_offer" in order, order
    assert order.index("_offer_moments") < order.index("_record_offer"), \
        f"the record must be written after the collapse and the cap: {order}"

    # THE CONTENT. Exactly the ids being returned — never the candidate list.
    assert recorded["ids"] == returned, (recorded["ids"], returned)
    assert recorded["ids"] != candidate_ids, \
        "recording the candidate list would burn every id the lookup " \
        "considered, not the three it offered"
    assert recorded["seed_id"] == "the-seed"

    # ...and that is what landed on disk, byte for byte.
    on_disk = server._load_offer_cycle(root)[-1]
    assert on_disk["shown_ids"] == returned, on_disk

    # The answer carries ids, the facet, and the Seed — and nothing else
    # (D-12: what was matched, never why it matters).
    assert set(handler.body) == {"ok", "ids", "facet", "seed_id"}, \
        sorted(handler.body)
    assert handler.body["facet"] == {"fortnight": 8}, handler.body["facet"]


# ---------------------------------------------------------------------------
# 4. the cycle
# ---------------------------------------------------------------------------

@case("cycle_reset")
def _cycle_reset(root):
    base = 1600000000000
    gap = study_lib.BURST_WINDOW_MS * 10
    cap = server.OFFER_MOMENT_CAP

    def drive(lib, pics, seed="s"):
        """One route call, counting how many times the collapse ran. TWO runs
        is the reset branch; ONE is every other path."""
        calls = []
        real = server._offer_moments

        def spy(library_root, rows):
            calls.append(len(rows))
            return real(library_root, rows)

        server._offer_moments = spy
        try:
            handler = call_offer(lib, make_store(pics), {
                "seed_id": seed, "fortnight": 8,
                "candidate_ids": [p["id"] for p in pics]})
        finally:
            server._offer_moments = real
        assert handler.status == 200, handler.message
        return handler.body["ids"], calls

    # (a) a recorded id is not offered again while the cycle stands.
    six = [make_pic("c-%d" % i, base + i * gap) for i in range(6)]
    first, calls = drive(root, six)
    assert first == ["c-0", "c-1", "c-2"], first
    assert calls == [6], calls
    second, calls = drive(root, six)
    assert second == ["c-3", "c-4", "c-5"], second
    assert calls == [3], "no reset: three remained, which is the cap"

    # (b) THE RESET. When the remaining pool falls below the cap AND the shown
    # list was actually holding ids back, the cycle resets and the pick
    # recomputes against an empty shown list — the selectShelf idiom.
    lib_b = root / "b"
    lib_b.mkdir()
    four = [make_pic("r-%d" % i, base + i * gap) for i in range(4)]
    got, calls = drive(lib_b, four)
    assert got == ["r-0", "r-1", "r-2"], got
    assert calls == [4], calls
    got, calls = drive(lib_b, four)
    assert got == ["r-0", "r-1", "r-2"], \
        f"the cycle must reset and offer the earliest Moments again: {got}"
    assert len(calls) == 2, \
        f"the reset recomputes against an empty shown list: {calls}"
    assert calls == [1, 4], calls

    # (c) A POOL SIMPLY SMALLER THAN THE CAP IS NOT A RESET. The Offer just
    # comes back smaller, and says nothing about it (law 3).
    lib_c = root / "c"
    lib_c.mkdir()
    two = [make_pic("t-%d" % i, base + i * gap) for i in range(2)]
    got, calls = drive(lib_c, two)
    assert got == ["t-0", "t-1"], got
    assert calls == [2], \
        f"held_back was false, so nothing may be recomputed: {calls}"


# ---------------------------------------------------------------------------
# 5. the collapse
# ---------------------------------------------------------------------------

@case("empty_offer_is_not_a_cycle")
def _empty_offer_is_not_a_cycle(root):
    """An Offer that returns NOTHING must not become the current cycle.

    ⚠ THIS CASE EXISTS BECAUSE ITS ABSENCE HID A REAL DEFECT (26.95-REVIEW.md
    CR-01, 2026-08-23). The route recorded unconditionally and
    `_offer_cycle_shown` reads only the NEWEST entry, so one screen that
    dropped every candidate wrote `{"shown_ids": []}` and that empty record
    became the whole current cycle — releasing everything the previous Offer
    had held back, so the next Offer repeated the last one exactly. D-14's own
    subject, failing.

    ⛔ Twenty-nine cases drove this route and not one of them drove an EMPTY
    answer. A complete mutation drill is evidence about the gates that exist
    and is silent about the case nobody wrote; this is that case."""
    base = 1600000000000
    gap = study_lib.BURST_WINDOW_MS * 10
    pics = [make_pic("q-%d" % i, base + i * gap) for i in range(6)]
    store = make_store(pics)
    ids = [p["id"] for p in pics]

    first = call_offer(root, store, {
        "seed_id": "q", "fortnight": 8, "candidate_ids": ids})
    assert first.status == 200, first.message
    shown = first.body["ids"]
    assert len(shown) == server.OFFER_MOMENT_CAP, shown

    # An Offer whose every candidate is unknown to the store returns nothing.
    empty = call_offer(root, store, {
        "seed_id": "q", "fortnight": 8,
        "candidate_ids": ["ghost-1", "ghost-2"]})
    assert empty.status == 200, empty.message
    assert empty.body["ids"] == [], empty.body["ids"]

    # ⛔ THE PROPERTY: the empty screen changed nothing about what is held
    # back. The next Offer must move PAST the first trio, never repeat it.
    third = call_offer(root, store, {
        "seed_id": "q", "fortnight": 8, "candidate_ids": ids})
    assert third.status == 200, third.message
    assert third.body["ids"] != shown, \
        "an Offer that returned nothing wiped the cycle memory, so the next " \
        "Offer repeated the last one exactly (CR-01)"
    assert not (set(third.body["ids"]) & set(shown)), \
        (third.body["ids"], shown)


@case("collapse")
def _collapse(root):
    window = study_lib.BURST_WINDOW_MS
    floor = study_lib.BURST_COS_FLOOR
    same = basis_print()
    other = unit_print(0.0)

    # The fixture's own arithmetic, checked before it is trusted.
    assert study_lib.print_cosine(same, same) >= floor
    assert study_lib.print_cosine(same, other) < floor

    base = 1600000000000
    t_a = base
    t_b = base + window                       # exactly the window: linked
    t_c = t_b + window // 2                   # inside it: linked (transitive)
    t_d = t_c + window + 1                    # one ms past it: the time clause
    t_e = t_d + 1                             # inside the window, unlike: the
    #                                           similarity clause

    pics = [make_pic("g-a", t_a), make_pic("g-b", t_b), make_pic("g-c", t_c),
            make_pic("g-d", t_d), make_pic("g-e", t_e)]
    for pic in pics[:4]:
        write_print(root, pic["id"], same)
    write_print(root, "g-e", other)

    got = server._offer_moments(root, rows_of(pics))
    assert got == ["g-a", "g-d", "g-e"], got
    # THE REPRESENTATIVE IS THE EARLIEST CAPTURE (P-4): the two later frames of
    # the merged Moment are absent, not merely later.
    assert "g-b" not in got and "g-c" not in got, got
    # ...and the two singles stayed apart, each failing exactly one clause.
    assert len(got) == 3, got


# ---------------------------------------------------------------------------
# 6. no rounding step at the floor
# ---------------------------------------------------------------------------

@case("no_rounding_step_at_the_floor")
def _no_rounding_step_at_the_floor(root):
    floor = study_lib.BURST_COS_FLOOR
    delta = 0.0001
    same = basis_print()
    under = unit_print(floor - delta)
    over = unit_print(floor + delta)

    # The fixture sits on the two sides of the floor it claims to. A rounding
    # step to two decimal places anywhere between the dot product and this
    # comparison would move the first of these across, which is exactly the
    # defect this case exists to make visible.
    assert study_lib.print_cosine(same, under) < floor
    assert study_lib.print_cosine(same, over) >= floor

    base = 1600000000000
    pics_under = [make_pic("e-x", base), make_pic("e-y", base + 1000)]
    pics_over = [make_pic("e-p", base), make_pic("e-q", base + 1000)]
    write_print(root, "e-x", same)
    write_print(root, "e-y", under)
    write_print(root, "e-p", same)
    write_print(root, "e-q", over)

    split = server._offer_moments(root, rows_of(pics_under))
    merged = server._offer_moments(root, rows_of(pics_over))
    assert split == ["e-x", "e-y"], \
        f"a pair under the floor stays two Moments: {split}"
    assert merged == ["e-p"], \
        f"its twin over the floor is ONE Moment: {merged}"


# ---------------------------------------------------------------------------
# 7. a missing print splits
# ---------------------------------------------------------------------------

@case("missing_print_splits")
def _missing_print_splits(root):
    base = 1600000000000
    pics = [make_pic("s-m1", base), make_pic("s-m2", base + 1000)]
    same = basis_print()
    write_print(root, "s-m1", same)          # s-m2's .fp is deliberately absent

    got = server._offer_moments(root, rows_of(pics))
    assert got == ["s-m1", "s-m2"], \
        f"a picture nobody read must not be merged on the strength of a " \
        f"vector nobody has: {got}"

    # THE CONTROL. With the second print written the same pair merges, so the
    # split above was caused by the missing file and not by the fixture.
    write_print(root, "s-m2", same)
    assert server._offer_moments(root, rows_of(pics)) == ["s-m1"]


# ---------------------------------------------------------------------------
# 8. the cap
# ---------------------------------------------------------------------------

@case("cap")
def _cap(root):
    base = 1600000000000
    gap = study_lib.BURST_WINDOW_MS * 10
    pics = [make_pic("k-%d" % i, base + i * gap) for i in range(8)]
    got = server._offer_moments(root, rows_of(pics))
    cap = server.OFFER_MOMENT_CAP
    assert len(got) == cap, (cap, got)
    assert got == ["k-%d" % i for i in range(cap)], \
        f"the first {cap} representatives, in group order: {got}"


# ---------------------------------------------------------------------------
# 9. the fence screen, before any file is opened
# ---------------------------------------------------------------------------

@case("fence_screen_before_any_file_open")
def _fence_screen_before_any_file_open(root):
    base = 1600000000000
    gap = study_lib.BURST_WINDOW_MS * 10
    ok = make_pic("f-ok", base)
    never = make_pic("f-never", base + gap, state="never_show")
    retired = make_pic("f-retired", base + 2 * gap, state="retired")
    hidden = make_pic("f-hidden", base + 3 * gap, trigger=True)
    store = make_store([ok, never, retired, hidden])
    candidate_ids = ["f-ok", "f-never", "f-retired", "f-hidden", "f-ghost"]

    asked = []
    real_path = study_lib.vision_print_path

    def spy_path(library_root, item_id):
        asked.append(item_id)
        return real_path(library_root, item_id)

    study_lib.vision_print_path = spy_path
    try:
        handler = call_offer(root, store, {
            "seed_id": "seed", "fortnight": 8,
            "candidate_ids": candidate_ids})
    finally:
        study_lib.vision_print_path = real_path

    assert handler.status == 200, handler.message
    assert handler.body["ids"] == ["f-ok"], handler.body["ids"]

    # THE INSTRUMENT IS PROVEN LIVE FIRST: the surviving id DID reach the path
    # builder, so the absences below are absences and not a dead recorder.
    assert "f-ok" in asked, asked
    for fenced in ("f-never", "f-retired", "f-hidden", "f-ghost"):
        assert fenced not in asked, \
            f"{fenced} reached the print path — a fenced or unknown id must " \
            f"be dropped before any path is built (law 5, T-26.95-03)"

    # ...and an id from the request body never becomes a path segment on its
    # own: the ghost id exists nowhere on disk.
    assert not (root / "vision").exists() or \
        not any(p.name.startswith("f-ghost") for p in (root / "vision").iterdir())


# ---------------------------------------------------------------------------
# 10. validation, fail-closed
# ---------------------------------------------------------------------------

@case("validation_fail_closed")
def _validation_fail_closed(root):
    pics = [make_pic("v-1", 1600000000000)]
    store = make_store(pics)
    good = {"seed_id": "seed", "fortnight": 8, "candidate_ids": ["v-1"]}

    bad_bodies = [
        dict(good, seed_id=""),
        dict(good, seed_id="   "),
        dict(good, seed_id=5),
        dict(good, seed_id=None),
        dict(good, fortnight=-1),
        dict(good, fortnight=server.OFFER_FORTNIGHT_MAX + 1),
        dict(good, fortnight="3"),
        dict(good, fortnight=True),
        dict(good, fortnight=3.5),
        dict(good, fortnight=None),
        dict(good, candidate_ids="v-1"),
        dict(good, candidate_ids={"v-1": 1}),
        dict(good, candidate_ids=None),
        dict(good, candidate_ids=["v-1", 7]),
        dict(good, candidate_ids=["v-1", ""]),
        dict(good, candidate_ids=["x"] * (server.OFFER_CANDIDATE_CAP + 1)),
        {},
    ]
    for i, body in enumerate(bad_bodies):
        handler = call_offer(root, store, body)
        assert handler.status == 400, (i, handler.status, handler.body)
        msg = handler.message
        assert isinstance(msg, str) and msg.strip(), (i, repr(msg))
        # PLAIN WORDS: no field name, no type name, no shouting.
        assert "_" not in msg, (i, msg)
        assert msg == msg.lower(), (i, msg)
        assert not (root / "librarian").exists(), \
            f"a refused body wrote something (row {i})"

    # THE CONTROL. The same store answers 200 on a well-formed body, so the
    # refusals above are caused by the bodies and not by the fixture.
    handler = call_offer(root, store, good)
    assert handler.status == 200, handler.message
    assert handler.body["ids"] == ["v-1"], handler.body


# ---------------------------------------------------------------------------
# 11. the route reaches no model
# ---------------------------------------------------------------------------

@case("route_reaches_no_model")
def _route_reaches_no_model(root):
    base = 1600000000000
    gap = study_lib.BURST_WINDOW_MS * 10
    pics = [make_pic("n-%d" % i, base + i * gap) for i in range(4)]
    store = make_store(pics)

    real = librarian_call.call_librarian
    reached = []

    def refuse(*args, **kwargs):
        reached.append(args[:1])
        raise AssertionError(
            "the offer route reached a model — it never may, in this plan or "
            "any later one (P-7): the fortnight arrives already derived, so a "
            "date derived here could only produce a caption naming a window "
            "the ids did not come from")

    librarian_call.call_librarian = refuse
    try:
        handler = call_offer(root, store, {
            "seed_id": "seed", "fortnight": 8,
            "candidate_ids": [p["id"] for p in pics]})
    finally:
        librarian_call.call_librarian = real

    assert not reached, reached
    assert handler.status == 200, handler.message
    assert len(handler.body["ids"]) == server.OFFER_MOMENT_CAP


# ---------------------------------------------------------------------------
# 12. concurrency
# ---------------------------------------------------------------------------

@case("concurrent_record")
def _concurrent_record(root):
    per_thread = 5
    errors = []

    def worker(tag):
        try:
            for i in range(per_thread):
                server._record_offer(root, ["%s-%d" % (tag, i)],
                                     "seed-%s-%d" % (tag, i))
        except BaseException as err:      # noqa: BLE001 — reported, not hidden
            errors.append(repr(err))

    threads = [threading.Thread(target=worker, args=(tag,))
               for tag in ("one", "two")]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, errors
    raw = (root / "librarian" / "offers.json").read_text(encoding="utf-8")
    entries = json.loads(raw)          # a torn write would raise right here
    assert isinstance(entries, list), type(entries)
    assert len(entries) == 2 * per_thread, len(entries)
    seeds = {e["seed_id"] for e in entries}
    for tag in ("one", "two"):
        for i in range(per_thread):
            assert "seed-%s-%d" % (tag, i) in seeds, (tag, i, sorted(seeds))


# ---------------------------------------------------------------------------
# 13. `not relevant`: the fail-open read
# ---------------------------------------------------------------------------

@case("nr_fail_open_read")
def _nr_fail_open_read(root):
    assert server._load_not_relevant(root) == [], \
        "a missing file is an empty memory, never an error"
    d = root / "librarian"
    d.mkdir(parents=True)
    rec = d / "not-relevant.json"

    rec.write_text("{not json at all", encoding="utf-8")
    assert server._load_not_relevant(root) == [], "unparseable is empty"

    rec.write_text('{"item_id": "a"}', encoding="utf-8")
    assert server._load_not_relevant(root) == [], \
        "an off-shape file (a mapping where a list belongs) is empty — the " \
        "file is hers to hand-edit and a wrong shape must not raise"

    rec.unlink()
    rec.mkdir()
    assert server._load_not_relevant(root) == [], \
        "a directory where the file belongs is an OSError, and still empty"

    # ⚠ AND THE INDEX TOLERATES WHAT SHE MIGHT LEAVE BEHIND. A half-edited
    # list must contribute what it can and never raise.
    STAGED = "/var/folders/aa/T/studyroom-collect-zz9/" \
        "00019581c1c54facafc531826e24706a.jpeg"
    ids, paths, assets = server._not_relevant_index(
        [None, 7, [], {}, {"item_id": None}, {"origin_path": 3},
         {"item_id": "", "origin_path": ""}, "bare",
         {"item_id": "x1", "origin_path": "/p/x1.png"},
         {"item_id": "x2", "origin_path": STAGED}])
    assert ids == {"bare", "x1", "x2"}, ids
    assert paths == {"bare", "/p/x1.png", STAGED}, paths
    index = (ids, paths, assets)
    # A BARE STRING GOES IN BOTH SETS: a line she typed carries no key name,
    # and guessing at which one she meant is how a refusal gets lost.
    assert server._not_relevant_match("bare", "", index)
    assert server._not_relevant_match("anything", "bare", index)
    # ...and an EMPTY path never matches, or one answer about one picture
    # would withdraw every item that happens to have no path at all.
    assert not server._not_relevant_match("unknown", "", index)
    assert not server._not_relevant_match("unknown", None, index)

    # ---- 26.95-42 (UAT F-6, hers): THE THIRD KEY ---------------------------
    # ⛔ A BARE STRING CONTRIBUTES NO ASSET KEY. The two sets above take one
    # because a line she typed carries no key name; an asset key is DERIVED,
    # and deriving one from a sentence she wrote would invent a key she never
    # supplied — strictly wider than either claim she did make.
    assert assets == {"00019581c1c54facafc531826e24706a"}, assets
    # THE POINT OF THE WHOLE THING: the staging DIRECTORY carries a per-run
    # random component, so the same photograph comes back under a path that
    # can never match. The stem is the same asset every time.
    later = "/var/folders/qq/T/studyroom-collect-different/" \
        "00019581c1c54facafc531826e24706a.jpeg"
    assert later not in paths, "the fixture must exercise a CHANGED path"
    assert server._not_relevant_match("a-new-id", later, index), \
        "her answer must survive the same photograph arriving under a new " \
        "staging path and a new id — which is the whole of F-6"
    # ...and a durable vault path keeps matching exactly as it shipped, on the
    # path, because its basename is a human filename and yields no asset key.
    assert server._photo_asset_key("/p/x1.png") is None
    assert server._not_relevant_match("other", "/p/x1.png", index)
    # ⛔ NOTHING WIDENS. A different asset, a near-miss length, a non-hex
    # character and an empty path must all fail — a 32-character accident is
    # what a collision would have to be.
    for miss in ["/T/studyroom-collect-a/ffffffffffffffffffffffffffffffff.jpeg",
                 "/T/studyroom-collect-a/00019581c1c54facafc531826e24706.jpeg",
                 "/T/studyroom-collect-a/00019581c1c54facafc531826e24706az.jpg",
                 "/T/studyroom-collect-a/00019581c1c54facafc531826e2470zz.jpeg",
                 "", None]:
        assert not server._not_relevant_match("nope", miss, index), miss
    # CASE-FOLDED, so two spellings of one identifier are not two keys.
    upper = "/T/studyroom-collect-b/00019581C1C54FACAFC531826E24706A.JPEG"
    assert server._not_relevant_match("nope", upper, index), upper

    # ⛔⛔ THE HARM A LOOSE STEM RULE WOULD DO, DRIVEN. Two different files can
    # share a basename in different folders — that is ordinary, not exotic —
    # and a rule that turned any hex-ish filename into an asset key would make
    # ONE answer about ONE of them withdraw the OTHER. That is the failure
    # this ruling's own reasoning calls the worse of the two directions, so it
    # is the one with a case. ⚠ Found by mutation drill: widening the pattern
    # to a loose 8-hex prefix left every assertion above green.
    assert server._photo_asset_key("/a/deadbeef.png") is None
    assert server._photo_asset_key("/b/deadbeef.png") is None
    shared = server._not_relevant_index(
        [{"item_id": "p1", "origin_path": "/a/deadbeef.png"}])
    assert server._not_relevant_match("p1", "/a/deadbeef.png", shared), \
        "CONTROL: the answer she DID give still matches, on the path"
    assert not server._not_relevant_match("p2", "/b/deadbeef.png", shared), \
        "two different files sharing a basename must never collapse into " \
        "one answer — an asset key is a photograph's identity, not its name"


# ---------------------------------------------------------------------------
# 14. the write idiom
# ---------------------------------------------------------------------------

@case("nr_write_idiom")
def _nr_write_idiom(root):
    with server._LIBRARIAN_FILES_LOCK:
        wrote = server._record_not_relevant(root, "alpha", "/src/alpha.png")
    assert wrote is True, "a fresh answer writes"

    d = root / "librarian"
    assert d.is_dir(), "the librarian folder is VISIBLE (D-05)"
    assert not (root / ".librarian").exists(), "never a hidden dotdir"
    names = sorted(p.name for p in d.iterdir())
    assert names == ["not-relevant.json"], \
        f"a temp sibling survived the atomic write: {names}"

    entries = json.loads((d / "not-relevant.json").read_text(encoding="utf-8"))
    assert isinstance(entries, list) and len(entries) == 1, entries
    row = entries[0]
    # ⚠ BOTH KEYS, per the owner's 2026-08-15 ruling. Asserted as an exact key
    # set, so dropping one half of the ruling lands here rather than surfacing
    # later as a photograph she refused coming back after a rename.
    assert set(row) == {"item_id", "origin_path", "at"}, sorted(row)
    assert row["item_id"] == "alpha", row
    assert row["origin_path"] == "/src/alpha.png", row
    at = row["at"]
    assert isinstance(at, int) and not isinstance(at, bool), repr(at)
    # EPOCH MS, not seconds.
    assert abs(at - int(time.time() * 1000)) < 120000, at

    # ⚠ TWO FILES, NEVER ONE WITH A FLAG. The cycle record expires and this one
    # does not, so a cycle reset must have no way to reach a permanent answer.
    server._record_offer(root, ["alpha"], "seed")
    assert sorted(p.name for p in d.iterdir()) == \
        ["not-relevant.json", "offers.json"], \
        "the permanent record and the expiring cycle live in separate files"
    assert server._load_not_relevant(root) == entries, \
        "and writing the cycle leaves the permanent record byte-untouched"


# ---------------------------------------------------------------------------
# 15. ordering
# ---------------------------------------------------------------------------

@case("nr_ordering")
def _nr_ordering(root):
    for n in range(3):
        with server._LIBRARIAN_FILES_LOCK:
            server._record_not_relevant(root, "o-%d" % n, "/src/o-%d.png" % n)
    entries = server._load_not_relevant(root)
    assert [e["item_id"] for e in entries] == ["o-0", "o-1", "o-2"], entries
    stamps = [e["at"] for e in entries]
    for at in stamps:
        assert isinstance(at, int) and not isinstance(at, bool), repr(at)
    assert stamps == sorted(stamps), \
        f"entries append in WRITE ORDER, newest last: {stamps}"


# ---------------------------------------------------------------------------
# 16. idempotence
# ---------------------------------------------------------------------------

@case("nr_idempotent")
def _nr_idempotent(root):
    pic = make_pic("dup-1", 1600000000000)
    store = make_store([pic])
    body = {"id": "dup-1"}

    first = call_not_relevant(root, store, body)
    assert first.status == 200, first.message
    path = root / "librarian" / "not-relevant.json"
    raw_once = path.read_bytes()
    assert len(json.loads(raw_once.decode("utf-8"))) == 1

    second = call_not_relevant(root, store, body)
    assert second.status == 200, second.message
    assert path.read_bytes() == raw_once, \
        "the same answer twice must leave ONE entry and not rewrite a byte " \
        "— the `at` stamp moving would be a rewrite"

    # ...and a DIFFERENT id still appends, so the check above is idempotence
    # and not a writer that has simply stopped working.
    other = make_pic("dup-2", 1600000000000)
    call_not_relevant(root, make_store([pic, other]), {"id": "dup-2"})
    assert len(json.loads(path.read_text(encoding="utf-8"))) == 2


# ---------------------------------------------------------------------------
# 17. THE RULING: a match on EITHER key
# ---------------------------------------------------------------------------

@case("nr_match_on_either")
def _nr_match_on_either(root):
    """Owner ruling, 2026-08-15. An id alone does not survive a RENAME; a path
    alone does not survive a MOVE and collides when two pictures have shared
    one path. Both halves are driven from both sides here."""
    d = root / "librarian"
    d.mkdir(parents=True)
    (d / "not-relevant.json").write_text(json.dumps([
        {"item_id": "old-id", "origin_path": "/src/holiday.png",
         "at": 1600000000000}]), encoding="utf-8")
    index = server._not_relevant_index(server._load_not_relevant(root))

    # (a) THE RENAME. The file was renamed, so the id the room derives today is
    # unchanged but the path is not — the id half carries it.
    assert server._not_relevant_match("old-id", "/src/holiday-2019.png",
                                      index), \
        "a renamed file keeps its answer through the item id"
    # (b) THE RE-IMPORT. It came back under a new id at the same place — the
    # path half carries it.
    assert server._not_relevant_match("new-id", "/src/holiday.png", index), \
        "a re-imported file keeps its answer through the origin path"
    # (c) AND NEITHER. Something unrelated is not withdrawn.
    assert not server._not_relevant_match("other-id", "/src/other.png",
                                          index)

    # END TO END, through the shipped memory route, so this is the ROUTE's
    # behaviour and not just the helper's. Three items: one matching by id
    # only, one by path only, one by neither.
    renamed = make_pic("old-id", 1600000000000)
    renamed["origin_path"] = "/src/holiday-2019.png"
    reimported = make_pic("new-id", 1600000000000)
    reimported["origin_path"] = "/src/holiday.png"
    unrelated = make_pic("other-id", 1600000000000)
    unrelated["origin_path"] = "/src/other.png"
    handler = call_memory(root, make_store([renamed, reimported, unrelated]))
    assert handler.status == 200, handler.message
    assert handler.body["not_relevant_ids"] == ["new-id", "old-id"], \
        handler.body["not_relevant_ids"]

    # THE CONTROL, so the absence of `other-id` above is caused by the record
    # and not by an empty answer: with its own path recorded it appears too.
    with server._LIBRARIAN_FILES_LOCK:
        server._record_not_relevant(root, "someone-else", "/src/other.png")
    handler = call_memory(root, make_store([renamed, reimported, unrelated]))
    assert handler.body["not_relevant_ids"] == \
        ["new-id", "old-id", "other-id"], handler.body["not_relevant_ids"]


# ---------------------------------------------------------------------------
# 18. validation, fail-closed
# ---------------------------------------------------------------------------

@case("nr_validation_fail_closed")
def _nr_validation_fail_closed(root):
    base = 1600000000000
    ok = make_pic("n-ok", base)
    never = make_pic("n-never", base, state="never_show")
    retired = make_pic("n-retired", base, state="retired")
    hidden = make_pic("n-hidden", base, trigger=True)
    store = make_store([ok, never, retired, hidden])

    bad_bodies = [
        {},
        {"id": None},
        {"id": ""},
        {"id": "   "},
        {"id": 5},
        {"id": True},
        {"id": ["n-ok"]},
        {"id": "n-ghost"},
        {"id": "n-never"},
        {"id": "n-retired"},
        {"id": "n-hidden"},
    ]
    messages = {}
    for i, body in enumerate(bad_bodies):
        handler = call_not_relevant(root, store, body)
        assert handler.status == 400, (i, handler.status, handler.body)
        msg = handler.message
        assert isinstance(msg, str) and msg.strip(), (i, repr(msg))
        # PLAIN WORDS: no field name, no type name, no shouting.
        assert "_" not in msg, (i, msg)
        assert msg == msg.lower(), (i, msg)
        assert not (root / "librarian").exists(), \
            f"a refused answer wrote something (row {i})"
        messages[repr(body.get("id"))] = msg

    # ⚠ THE UNKNOWN ID AND THE THREE FENCED IDS GET THE SAME SENTENCE. Two
    # different messages would let this route answer "is there a never-show
    # item under this id?" — a law-5 leak wearing an error message.
    fenced_answers = {messages["'n-ghost'"], messages["'n-never'"],
                      messages["'n-retired'"], messages["'n-hidden'"]}
    assert len(fenced_answers) == 1, \
        f"an unknown id and a fenced id must be indistinguishable: " \
        f"{sorted(fenced_answers)}"

    # THE CONTROL. The same store answers 200 on a well-formed body, so the
    # refusals above are caused by the bodies and not by the fixture.
    handler = call_not_relevant(root, store, {"id": "n-ok"})
    assert handler.status == 200, handler.message
    assert [e["item_id"] for e in server._load_not_relevant(root)] == ["n-ok"]


# ---------------------------------------------------------------------------
# 19. it changes no item state
# ---------------------------------------------------------------------------

@case("nr_changes_no_item_state")
def _nr_changes_no_item_state(root):
    pic = make_pic("still-1", 1600000000000)
    pic["history"] = [{"at": "2026-01-01T00:00:00+00:00", "from": None,
                       "to": "unseen", "via": "import"}]
    store = make_store([pic])
    before = json.loads(json.dumps(store))

    # ⛔ THE STORE'S OWN SAVE VERB IS NEVER REACHED. Comparing the in-memory
    # dict alone would pass over a route that wrote a DIFFERENT object to disk.
    real_save = study_lib.save_store
    reached = []

    def refuse(*args, **kwargs):
        reached.append(args[:1])
        raise AssertionError(
            "the not-relevant route wrote the store — it never may (D-14): "
            "there is no sixth state, and an offer refused is something the "
            "librarian remembers, not something that happens to the item")

    study_lib.save_store = refuse
    try:
        handler = call_not_relevant(root, store, {"id": "still-1"})
    finally:
        study_lib.save_store = real_save

    assert not reached, reached
    assert handler.status == 200, handler.message
    assert store == before, "the store is byte-identical after the answer"
    after = store["items"]["still-1"]
    assert after["state"] == "unseen", \
        "the picture stays UNSEEN — it stays in Manage and stays findable"
    assert len(after["history"]) == len(before["items"]["still-1"]["history"]), \
        "and no history hop was written"

    # ...and the answer WAS recorded, so the absences above are not a route
    # that quietly did nothing at all.
    assert [e["item_id"] for e in server._load_not_relevant(root)] == \
        ["still-1"]


# ---------------------------------------------------------------------------
# 20. the adjacency: one id, both records
# ---------------------------------------------------------------------------

@case("nr_adjacency_excluded_once")
def _nr_adjacency_excluded_once(root):
    base = 1600000000000
    gap = study_lib.BURST_WINDOW_MS * 10
    pics = [make_pic("a-%d" % i, base + i * gap) for i in range(4)]
    store = make_store(pics)
    ids = [p["id"] for p in pics]

    def offer(lib):
        handler = call_offer(lib, store, {
            "seed_id": "seed", "fortnight": 8, "candidate_ids": ids})
        assert handler.status == 200, handler.message
        return handler.body["ids"]

    # THE CONTROL FIRST, in its own library: with no permanent answer, the
    # cycle's reset brings a-0 straight back on the second offer. That is the
    # cycle behaving exactly as D-14 says it should, and it is what makes the
    # treatment below a measurement rather than a coincidence.
    control = root / "control"
    control.mkdir()
    assert offer(control) == ["a-0", "a-1", "a-2"]
    assert offer(control) == ["a-0", "a-1", "a-2"], \
        "the cycle held only one id back, so it reset and offered again"

    # THE TREATMENT. Same fixture, same cycle, plus one permanent answer.
    lib = root / "treated"
    lib.mkdir()
    assert offer(lib) == ["a-0", "a-1", "a-2"]
    handler = call_not_relevant(lib, store, {"id": "a-0"})
    assert handler.status == 200, handler.message
    second = offer(lib)
    assert "a-0" not in second, \
        "a cycle reset may restore the CYCLE's entries and must never " \
        "restore the permanent one — that is why the not-relevant screen " \
        "runs ahead of the cycle rather than after it"
    assert second == ["a-1", "a-2", "a-3"], second

    # EXCLUDED ONCE, NOT TWICE: a-1 and a-2 are in the cycle record AND
    # returned again by the reset, so being in one record did not cost the
    # other record's entry.
    assert offer(lib) == ["a-1", "a-2", "a-3"], \
        "and it stays out on every later visit, while the rest keep cycling"


# ---------------------------------------------------------------------------
# 21. the memory route's shape
# ---------------------------------------------------------------------------

@case("memory_route_shape")
def _memory_route_shape(root):
    base = 1600000000000
    sentinels = {
        "title": "TITLESENTINEL",
        "source": "SOURCESENTINEL",
        "folder": "FOLDERSENTINEL",
        "origin_path": "/PATHSENTINEL/one.png",
        "library_path": "items/LIBSENTINEL.png",
        "content_hash": "HASHSENTINEL",
    }
    kept = make_pic("mem-keep", base)
    kept.update(sentinels)
    kept["tags"] = ["TAGSENTINEL"]
    plain = make_pic("mem-plain", base)
    fenced = make_pic("mem-fenced", base, state="never_show")
    hidden = make_pic("mem-hidden", base, trigger=True)
    store = make_store([kept, plain, fenced, hidden])

    d = root / "librarian"
    d.mkdir(parents=True)
    (d / "not-relevant.json").write_text(json.dumps([
        {"item_id": "mem-keep", "origin_path": sentinels["origin_path"],
         "at": base},
        {"item_id": "mem-fenced", "origin_path": "/x/f.png", "at": base},
        {"item_id": "mem-hidden", "origin_path": "/x/h.png", "at": base},
    ]), encoding="utf-8")
    server._record_offer(root, ["mem-plain"], "seed-a")
    server._record_offer(root, ["mem-plain"], "seed-b")

    handler = call_memory(root, store)
    assert handler.status == 200, handler.message
    body = handler.body
    assert set(body) == {"ok", "not_relevant_ids", "last_offer_ms"}, \
        sorted(body)

    # THE INSTRUMENT IS PROVEN LIVE FIRST: a real id DOES come back, so the
    # absences below are absences and not an empty answer.
    assert body["not_relevant_ids"] == ["mem-keep"], body["not_relevant_ids"]
    assert "mem-plain" not in body["not_relevant_ids"]
    # ⛔ FENCED IDS NEVER APPEAR — not even the id.
    for fenced_id in ("mem-fenced", "mem-hidden"):
        assert fenced_id not in body["not_relevant_ids"], body

    # ⛔ AND NO CONTENT CROSSES, asserted over the WHOLE serialized body by
    # value rather than by inspecting a key list — a title riding in some
    # field nobody thought of would still land here.
    wire = json.dumps(body, ensure_ascii=False)
    for name, value in sentinels.items():
        assert value not in wire, \
            f"the memory route carried the item's {name} to the client — it " \
            f"carries ids and one integer, because a route that handed over " \
            f"content to save a round trip would put content on a path the " \
            f"fence never reviewed"
    assert "TAGSENTINEL" not in wire, wire

    # last_offer_ms is the NEWEST stamp, an integer.
    entries = server._load_offer_cycle(root)
    newest = max(e["at"] for e in entries)
    assert body["last_offer_ms"] == newest, (body["last_offer_ms"], newest)
    assert isinstance(body["last_offer_ms"], int)

    # ...and null when no offer has ever been made — the honest shape the
    # client falls back from, never a zero pretending to be a date.
    bare = root / "bare"
    bare.mkdir()
    empty = call_memory(bare, make_store([plain]))
    assert empty.body["last_offer_ms"] is None, empty.body
    assert empty.body["not_relevant_ids"] == [], empty.body


# ---------------------------------------------------------------------------
# 22. the memory route is fail-open
# ---------------------------------------------------------------------------

@case("memory_route_fail_open")
def _memory_route_fail_open(root):
    pic = make_pic("fo-1", 1600000000000)
    store = make_store([pic])
    d = root / "librarian"
    d.mkdir(parents=True)
    good = json.dumps([{"item_id": "fo-1", "origin_path": pic["origin_path"],
                        "at": 1600000000000}])
    rec = d / "not-relevant.json"

    # THE CONTROL FIRST: a readable record answers with the id, so every empty
    # answer below is caused by the damage and not by an empty fixture.
    rec.write_text(good, encoding="utf-8")
    assert call_memory(root, store).body["not_relevant_ids"] == ["fo-1"]

    for damage in ("{not json at all", '{"item_id": "fo-1"}', '"bare"'):
        rec.write_text(damage, encoding="utf-8")
        handler = call_memory(root, store)
        assert handler.status == 200, (damage, handler.status)
        assert handler.body["not_relevant_ids"] == [], (damage, handler.body)
        assert handler.body["last_offer_ms"] is None, (damage, handler.body)

    # ⚠ AND A STORE THAT WILL NOT LOAD IS ALSO AN EMPTY MEMORY, never a 500 —
    # a read miss opens nothing, quietly; it is a SAVE that is loud. The log
    # line is what proves the fail-open branch RAN, rather than the answer
    # having come back empty for some other reason entirely.
    #
    # The realistic instance is a corrupt store, and the route catches broadly
    # on purpose: the three below stand in for it because they are certainly
    # constructible here, where a fixture that had to guess at another
    # module's exception signature would be a suite measuring itself.
    rec.write_text(good, encoding="utf-8")
    for err in (RuntimeError("no"), OSError("no"), ValueError("no")):
        handler = call_memory(root, store, store_raises=err)
        assert handler.status == 200, (repr(err), handler.status)
        assert handler.body == {"ok": True, "not_relevant_ids": [],
                                "last_offer_ms": None}, handler.body
        assert handler.logged, \
            "the fail-open branch must SAY SO — a swallowed read failure " \
            "that logs nothing is indistinguishable from a room with no " \
            "memory at all"


# ---------------------------------------------------------------------------
# 23. concurrency: the same answer from two threads
# ---------------------------------------------------------------------------

@case("nr_concurrent_same_id")
def _nr_concurrent_same_id(root):
    per_thread = 5
    pics = [make_pic("cc-same", 1600000000000),
            make_pic("cc-one", 1600000000000),
            make_pic("cc-two", 1600000000000)]
    store = make_store(pics)
    errors = []

    def worker(item_id):
        try:
            for _ in range(per_thread):
                handler = call_not_relevant(root, store, {"id": item_id})
                if handler.status != 200:
                    errors.append((item_id, handler.status, handler.message))
        except BaseException as err:      # noqa: BLE001 — reported, not hidden
            errors.append(repr(err))

    threads = [threading.Thread(target=worker, args=("cc-same",))
               for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, errors
    raw = (root / "librarian" / "not-relevant.json").read_text(
        encoding="utf-8")
    entries = json.loads(raw)          # a torn write would raise right here
    assert isinstance(entries, list), type(entries)
    same = [e for e in entries if e.get("item_id") == "cc-same"]
    assert len(same) == 1, \
        f"two threads answering about the same picture must leave EXACTLY " \
        f"one entry — the membership check and the append share one hold: " \
        f"{entries}"

    # ...and two threads on DIFFERENT ids leave both, so the single entry
    # above is one hold doing its job rather than a writer that stopped.
    del threads[:]
    for item_id in ("cc-one", "cc-two"):
        threads.append(threading.Thread(target=worker, args=(item_id,)))
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors, errors
    entries = json.loads((root / "librarian" / "not-relevant.json")
                         .read_text(encoding="utf-8"))
    got = sorted(e["item_id"] for e in entries)
    assert got == ["cc-one", "cc-same", "cc-two"], got


# ---------------------------------------------------------------------------
# 24. the reach: validation, fail-closed
# ---------------------------------------------------------------------------

@case("reach_date_validation_fail_closed")
def _reach_date_validation_fail_closed(root):
    base = ms_at(2019, 6, 1)
    ok = make_pic("d-ok", base)
    never = make_pic("d-never", base, state="never_show")
    retired = make_pic("d-retired", base, state="retired")
    hidden = make_pic("d-hidden", base, trigger=True)
    store = make_store([ok, never, retired, hidden])

    bad_bodies = [
        {},
        {"seed_id": None},
        {"seed_id": ""},
        {"seed_id": "   "},
        {"seed_id": 5},
        {"seed_id": True},
        {"seed_id": ["d-ok"]},
        {"seed_id": "d-ghost"},
        {"seed_id": "d-never"},
        {"seed_id": "d-retired"},
        {"seed_id": "d-hidden"},
    ]
    messages = {}
    for i, body in enumerate(bad_bodies):
        handler, sealed = call_reach_date(root, store, body)
        assert handler.status == 400, (i, handler.status, handler.body)
        msg = handler.message
        assert isinstance(msg, str) and msg.strip(), (i, repr(msg))
        # PLAIN WORDS: no field name, no type name, no shouting.
        assert "_" not in msg, (i, msg)
        assert msg == msg.lower(), (i, msg)
        # ⛔ NOTHING WAS SENT ON A REFUSED ID — not to a model, not to a
        # socket — and nothing was written.
        assert sealed.calls == [], (i, sealed.calls)
        assert sealed.sockets == [], (i, sealed.sockets)
        assert not (root / "librarian").exists(), \
            f"a refused reach wrote something (row {i})"
        messages[repr(body.get("seed_id"))] = msg

    # ⚠ THE UNKNOWN ID AND THE THREE FENCED IDS GET THE SAME SENTENCE, for the
    # reason the not-relevant route already carries: two different messages
    # would let this route answer "is there a never-show item under this id?",
    # which is a law-5 leak wearing an error message.
    fenced_answers = {messages["'d-ghost'"], messages["'d-never'"],
                      messages["'d-retired'"], messages["'d-hidden'"]}
    assert len(fenced_answers) == 1, \
        f"an unknown id and a fenced id must be indistinguishable: " \
        f"{sorted(fenced_answers)}"

    # THE CONTROL. The same store answers 200 on a well-formed body, so the
    # refusals above are caused by the bodies and not by the fixture.
    handler, sealed = call_reach_date(
        root, store, {"seed_id": "d-ok"}, seam=model_window("2019-03-05"),
        payload=CANNED_SEED_PAYLOAD)
    assert handler.status == 200, handler.message
    assert handler.body["from"] == server.REACH_FROM_MODEL, handler.body
    assert sealed.sockets == [], sealed.sockets


# ---------------------------------------------------------------------------
# 25. no readable blessed body: the reach lands on today, and sends nothing
# ---------------------------------------------------------------------------

@case("reach_date_with_no_blessed_body_lands_on_today")
def _reach_date_with_no_blessed_body_lands_on_today(root):
    """⚠ THE ONE CASE HERE THAT DRIVES THE REAL FENCE BUILDER. Every other
    reach case replaces the payload so it can reach the model path at all;
    this one lets the shipped builder answer over an UNSEEN Seed, which is
    what the empty edge actually looks like — no readable blessed body, so no
    call is made and the reach lands on today's calendar in silence."""
    seed = make_pic("seed-1", ms_at(2019, 6, 1))
    store = make_store([seed])

    # The fixture's own arithmetic, checked before it is trusted: the shipped
    # builder really does find nothing to send for an unjudged Seed. ⚠ Driven
    # INSIDE the seal — where the builder is the spy that delegates to it — so
    # that even this probe runs under the temporary home rather than whatever
    # one the suite was launched with.
    with SealedRoom(root):
        probe = study_lib.build_librarian_payload(store, "note",
                                                  store_dir=root)
    assert not (probe.get("bodies") or []), \
        "the fixture's Seed has a readable blessed body after all — this " \
        "case is about the branch where there is none"

    handler, sealed = call_reach_date(root, store, {"seed_id": "seed-1"})

    assert handler.status == 200, handler.message
    fortnight = server._reach_today_fortnight()
    assert handler.body == {"ok": True, "fortnight": fortnight,
                            "from": server.REACH_FROM_TODAY}, handler.body
    # ⛔ NO CALL AND NO SOCKET.
    assert sealed.calls == [], sealed.calls
    assert sealed.sockets == [], sealed.sockets
    # ⛔ AND NOTHING WRITTEN: the model's sentence is scaffolding for one
    # search, and here there was not even a sentence.
    assert not (root / "librarian").exists()

    # THE BUILDER IS THE SHIPPED ONE AND IT IS THE ONLY ONE (26.93 decision
    # 12): reached exactly once, on the `note` scope, over a store view
    # holding that ONE Seed. A second builder, a hand-made document, or a
    # payload carrying the rest of her library would all land here.
    assert len(sealed.built) == 1, sealed.built
    assert sealed.built[0]["scope"] == "note", sealed.built[0]
    assert sealed.built[0]["item_ids"] == ["seed-1"], sealed.built[0]
    assert str(sealed.built[0]["store_dir"]) == str(root), sealed.built[0]


# ---------------------------------------------------------------------------
# 26. every way the call can fail lands on the same silent fallback
# ---------------------------------------------------------------------------

@case("reach_date_every_failure_lands_on_today")
def _reach_date_every_failure_lands_on_today(root):
    seed = make_pic("seed-1", ms_at(2019, 6, 1))
    store = make_store([seed])
    today_fortnight = server._reach_today_fortnight()

    # A sentence no real answer would contain, planted in every driver below.
    planted = "upstream connect error reading remote 10.4.2.9:443"

    drivers = [
        ("the declined token", model_failure("declined", planted)),
        ("no_key", model_failure("no_key", planted)),
        ("ollama_not_running", model_failure("ollama_not_running", planted)),
        ("truncated", model_failure("truncated", planted)),
        ("malformed", model_failure("malformed", planted)),
        # a call that was never made at all: the tier holds no fill this job
        # may use, which the seam reports as a refusal rather than a failure
        ("a refusal",
         {"ok": False, "structured": {"note": planted}, "model": None,
          "usage": {}, "failure": "no_key",
          "refusal": {"outcome": "refused", "empty_tier": "cheap-cloud",
                      "filled_tiers": ("local",)}}),
        # the ANSWER declining, which is a permitted answer and not a failure
        ("the declined answer",
         {"ok": True, "structured": {"start": None, "end": None,
                                     "declined": True, "note": planted},
          "model": None, "usage": {}, "failure": None}),
        ("a window that does not parse",
         {"ok": True, "structured": {"start": "sometime in the spring",
                                     "end": None, "declined": False,
                                     "note": planted},
          "model": None, "usage": {}, "failure": None}),
        # ⚠ a date in the future is not a fact about her life, and a year
        # past today's would widen the search instead of aiming it
        ("a window in the future",
         {"ok": True, "structured": {"start": "2099-03-05",
                                     "end": "2099-03-19",
                                     "declined": False, "note": planted},
          "model": None, "usage": {}, "failure": None}),
        ("an answer with no shape at all",
         {"ok": True, "structured": None, "model": None, "usage": {},
          "failure": None}),
    ]

    for label, result in drivers:
        handler, sealed = call_reach_date(
            root, store, {"seed_id": "seed-1"}, seam=result,
            payload=CANNED_SEED_PAYLOAD)
        assert handler.status == 200, (label, handler.message)
        # ONE fallback, reached ten different ways — never an error surface,
        # never a toast, never a spinner (D-09, law 3).
        assert handler.body == {"ok": True, "fortnight": today_fortnight,
                                "from": server.REACH_FROM_TODAY}, \
            (label, handler.body)
        # THE INSTRUMENT IS PROVEN LIVE: the seam WAS reached, with this job
        # and no other, so each fallback above is a fallback rather than a
        # call that quietly never happened.
        assert [job for job, _text in sealed.calls] == ["blessing_selection"],\
            (label, sealed.calls)
        assert sealed.sockets == [], (label, sealed.sockets)
        # ⛔ THE PROVIDER'S OWN WORDS NEVER CROSS, and neither does the token:
        # what comes back is two integers and one machine word of the room's
        # own.
        wire = json.dumps(handler.body, ensure_ascii=False)
        assert planted not in wire, label
        for token in librarian_call.FAILURES:
            assert token not in wire, (label, token)
        # ⛔ AND NOTHING IS WRITTEN — not the store, not the notebook. The
        # sentence is scaffolding for one search and is gone.
        assert not (root / "librarian").exists(), label


# ---------------------------------------------------------------------------
# 27. ⚠ THE ORDERING GATE — the ids track the MODEL-DERIVED fortnight
# ---------------------------------------------------------------------------

@case("reach_date_ids_track_the_model_derived_fortnight")
def _reach_date_ids_track_the_model_derived_fortnight(root):
    """⚠⚠ THE GATE P-7 EXISTS FOR, WRITTEN SO IT CAN FAIL.

    The earlier shape — "the ids are byte-identical with the call stubbed to a
    window versus stubbed to declined" — passes TRIVIALLY under any contract
    in which the model cannot reach the ids, so it could not detect the one
    defect it names. This drives the WHOLE dateless path twice against one
    fixture, with the front call stubbed to two windows landing in two
    DIFFERENT fortnights, and asks whether the photographs moved with them.

    ⚠ EVERY CLAIM IS COLLECTED RATHER THAN ASSERTED IN PLACE. A bare assert
    stops the case at the first one that fails, and this phase has already
    shipped a re-point that reported one failure where there were two; the
    mutation this gate exists for turns several of these red at once, and the
    record of that is worth more than an early exit."""
    window_a = "2019-03-05"
    window_b = "2019-08-20"
    fort_a = server._reach_window_fortnight(window_a)
    fort_b = server._reach_window_fortnight(window_b)
    assert fort_a is not None and fort_b is not None, (fort_a, fort_b)
    assert fort_a != fort_b, \
        "the two stubbed windows must land in DIFFERENT fortnights, or " \
        "nothing below could tell one run from the other"
    # ⛔ THE WINDOW'S YEAR IS NOT READ AT ALL any more (D-05 amendment,
    # 2026-08-16, UAT finding F-5). It used to come back as a strict ceiling on
    # which photographs could be offered, and a ceiling set by anything that
    # moves is the ratchet that shut the door on the owner's real library after
    # one Offer. Both windows still name 2019 — that is now simply a fact about
    # the fixture, and nothing here or in the room may act on it.
    assert "2019" in window_a and "2019" in window_b

    in_a = [("a-2015", ms_at(2015, 3, 7)), ("a-2016", ms_at(2016, 3, 7))]
    in_b = [("b-2015", ms_at(2015, 8, 22)), ("b-2016", ms_at(2016, 8, 22))]
    # The fixture's own arithmetic, checked before it is trusted — a leap year
    # sits in each pair on purpose.
    for item_id, ms in in_a:
        assert fortnight_of_ms(ms) == fort_a, (item_id, fortnight_of_ms(ms))
    for item_id, ms in in_b:
        assert fortnight_of_ms(ms) == fort_b, (item_id, fortnight_of_ms(ms))
    this_year = time.gmtime().tm_year
    for _id, ms in in_a + in_b:
        assert year_of_ms(ms) < this_year, (_id, year_of_ms(ms))

    # The Seed's own capture sits in a THIRD fortnight (June), so it is never
    # one of its own candidates whichever window the front call comes back
    # with — and client_candidates drops it by id in any case.
    seed = make_pic("seed-1", ms_at(2019, 6, 1))
    assert fortnight_of_ms(seed["created_ms"]) not in (fort_a, fort_b)
    pics = [make_pic(item_id, ms) for item_id, ms in in_a + in_b]
    store = make_store([seed] + pics)

    def run(label, window):
        handler, sealed = call_reach_date(
            root, store, {"seed_id": "seed-1"}, seam=model_window(window),
            payload=CANNED_SEED_PAYLOAD)
        assert handler.status == 200, (label, handler.message)
        assert [job for job, _t in sealed.calls] == ["blessing_selection"], \
            (label, sealed.calls)
        assert sealed.sockets == [], (label, sealed.sockets)
        fortnight = handler.body["fortnight"]
        # ⛔ AND THE ANSWER CARRIES NO YEAR. `before_year` left this route on
        # 2026-08-16; a route that started returning one again would be
        # supplying a ceiling nothing reads, which is how F-6's dead value
        # sat unnoticed.
        assert "before_year" not in handler.body, (label, handler.body)
        # P-9: the candidates are computed AFTER the reach and FROM its
        # fortnight — which is the whole of what makes the front call able to
        # change which photographs are offered.
        candidates = client_candidates(store, fortnight, "seed-1")
        offer = call_offer(root, store, {"seed_id": "seed-1",
                                         "fortnight": fortnight,
                                         "candidate_ids": candidates})
        assert offer.status == 200, (label, offer.message)
        return fortnight, offer.body

    f_a, body_a = run("run a", window_a)
    f_b, body_b = run("run b", window_b)
    ids_a = body_a["ids"]
    ids_b = body_b["ids"]

    problems = []

    # claim 0 — the fortnight the reach answered with IS the one the stub's
    # own window names, on both runs.
    if f_a != fort_a:
        problems.append("0. run a answered %r where its stubbed window says "
                        "%r" % (f_a, fort_a))
    if f_b != fort_b:
        problems.append("0. run b answered %r where its stubbed window says "
                        "%r" % (f_b, fort_b))

    # claim 1 — a stub whose window MOVES must move the answer.
    if set(ids_a) == set(ids_b):
        problems.append(
            "1. the two runs returned the SAME ids (%r) — the model's window "
            "did not reach the photographs at all, which is exactly the "
            "inert front call P-7 exists to prevent" % (ids_a,))

    # claim 2 — every returned id's capture falls in the fortnight THAT run's
    # stub named, and each answer is NON-EMPTY. ⚠ The non-emptiness is
    # load-bearing rather than tidy: "every id in an empty list" is true of
    # anything, so without it an inert front call that filtered nothing into
    # either run would satisfy this claim while failing the thing it names.
    for label, ids, want in (("a", ids_a, fort_a),
                             ("b", ids_b, fort_b)):
        if not ids:
            problems.append(
                "2. run %s returned NO ids, so 'every id comes from the "
                "stubbed fortnight' would be vacuously true" % label)
        for item_id in ids:
            got = fortnight_of_ms(store["items"][item_id]["created_ms"])
            if got != want:
                problems.append(
                    "2. run %s returned %s, whose capture falls in fortnight "
                    "%d, where its stubbed window says %d"
                    % (label, item_id, got, want))

    # claim 3 — the facet the offer route returns is that SAME number on both
    # runs, so the caption can never name a fortnight the ids did not come
    # from (D-12).
    for label, body, want in (("a", body_a, fort_a),
                              ("b", body_b, fort_b)):
        if body["facet"] != {"fortnight": want}:
            problems.append("3. run %s captions %r where its ids came from "
                            "fortnight %d" % (label, body["facet"], want))

    assert not problems, "the ordering gate failed:\n  " + \
        "\n  ".join(problems)


# ---------------------------------------------------------------------------
# 28. a Seed that knows its own date reaches the front call not at all
# ---------------------------------------------------------------------------

@case("reach_date_is_not_reached_when_the_seed_knows_its_date")
def _reach_date_is_not_reached_when_the_seed_knows_its_date(root):
    """SRM-12's adjacency edge, from the side this process can observe: when a
    fortnight ARRIVES with the offer — which is what a Seed carrying its own
    date produces — the front call's route is not reached at all, so the two
    paths never both fire for one Offer.

    ⚠ WHAT THIS DOES NOT COVER, SAID PLAINLY RATHER THAN IMPLIED: the client's
    own two branches live in app.js, and whether the dated arm issues a
    request is a claim about that file and not about this process. Plan
    26.95-33 Task 1's acceptance criteria count the single call site inside
    `reachDoorOpen`; this case is the server-side half of the same sentence."""
    base = ms_at(2016, 3, 7)
    pics = [make_pic("s-%d" % i, base + i * study_lib.BURST_WINDOW_MS * 10)
            for i in range(4)]
    store = make_store(pics)

    real = server.StudyHandler.handle_librarian_reach_date
    reached = []

    def refuse(handler, data):
        reached.append(data)
        raise AssertionError(
            "the offer route reached the front call's own round trip — it "
            "never may (P-7): a fortnight that has already arrived is "
            "authoritative for both the ids and the caption, and a second "
            "one derived here could only name a window the ids did not come "
            "from")

    server.StudyHandler.handle_librarian_reach_date = refuse
    try:
        handler = call_offer(root, store, {
            "seed_id": "s-0", "fortnight": 8,
            "candidate_ids": [p["id"] for p in pics]})
        assert handler.status == 200, handler.message
        assert not reached, reached
        assert len(handler.body["ids"]) == server.OFFER_MOMENT_CAP, \
            handler.body

        # THE PATCH IS PROVEN LIVE. Without this, the absence above would be
        # satisfied by a patch that could never have fired — the vacuous-gate
        # class this phase keeps landing inside its own instruments.
        try:
            server.StudyHandler.handle_librarian_reach_date(
                StubHandler(root, store), {"seed_id": "s-0"})
        except AssertionError:
            pass
        assert len(reached) == 1, \
            "the patched route never fired, so the absence above proved " \
            "nothing at all"
    finally:
        server.StudyHandler.handle_librarian_reach_date = real


# ---------------------------------------------------------------------------
# the runner
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# 29. the reach date is a CALL, so it owes D-10 the same gate every other
#     call owes it (26.99-18; T-26.99-34 critical, T-26.99-39 high)
# ---------------------------------------------------------------------------
#
# ⛔⛔ WHAT THIS CASE EXISTS TO STOP. `handle_librarian_reach_date` reaches the
# seam through `record_call`, and the seam — `librarian_call.call_librarian` —
# enforces NO consent of its own: `base_agreed` appears in it zero times.
# Consent is a CALLER-SIDE obligation, and for a while this caller did not meet
# it. Driven at the 26.99 security audit with a planted credential, this route
# sent three requests to a redirected host while the room's own record
# correctly said she had never been asked.
#
# ⚠⚠ AND THE REASON IT WAS MISSED IS THE PART WORTH KEEPING. The omission was
# DELIBERATE AND DOCUMENTED — the handler's docstring says "NO AVAILABILITY
# GATE, DELIBERATELY" and argues it correctly: a room with no key must land on
# today's calendar in silence, and an availability gate would make the seam's
# own refusal tokens unreachable. That argument is SOUND and this case does not
# disturb it. ⛔ But base-URL consent RODE THE SAME GATE, so waiving the check
# nobody needed silently waived the one that mattered. Nobody chose that.
#
# ⛔ SO THE GATE ADDED IS THE NARROW ONE. `base_consent_gap` and NOT
# `librarian_available`: a room with no key still reaches the seam and still
# lands on today through the seam's own refusal, exactly as case 25 and case 26
# pin. Only an address she has not agreed to stops the call.

@case("reach_date_refuses_an_address_she_never_agreed_to")
def _reach_date_refuses_an_address_she_never_agreed_to(root):
    """No call goes to an address she never agreed to — and the SAME fixture
    with the consent recorded does call, in the same case.

    ⚠ THE POSITIVE CONTROL IS NOT OPTIONAL AND IT IS NOT DECORATION. "Zero
    calls" is satisfied just as well by a fixture that could never have made
    one — a Seed with no blessed body, a payload the builder emptied, a
    seam that was never installed. That is this project's B-3, and it is how a
    gate comes to be believed without ever having been driven. So the second
    half re-drives the identical fixture with one thing changed — her answer —
    and REQUIRES the call to happen."""
    proxy = "http://127.0.0.1:9/v1"

    def under_her_home(fn):
        """Run one shipped writer inside the same home the seal will use.

        ⛔ The SHIPPED writers, never a hand-made file: a case that spelled the
        settings format itself would be pinning this suite's idea of the format
        against the code's, which is the mirror this project has been bitten by
        nine times."""
        home = root / "home"
        home.mkdir(parents=True, exist_ok=True)
        saved = os.environ.get("HOME")
        os.environ["HOME"] = str(home)
        try:
            return fn()
        finally:
            if saved is None:
                os.environ.pop("HOME", None)
            else:
                os.environ["HOME"] = saved

    def redirect_everything():
        settings = librarian_call.load_settings()
        settings["bases"] = {"anthropic": proxy, "openai": proxy,
                             "ollama": proxy}
        librarian_call.save_settings(settings)

    seed = make_pic("seed-1", ms_at(2019, 6, 1))
    store = make_store([seed])
    today = server._reach_today_fortnight()

    # -- the fixture's own arithmetic, checked before it is trusted ----------
    # ⚠ The redirect must actually produce a consent GAP. If it did not, the
    # zero below would be measuring a room that had nothing to refuse.
    under_her_home(redirect_everything)
    gap = under_her_home(
        lambda: server.base_consent_gap(librarian_call.resolve_routing(
            librarian_call.load_settings(), environ={})))
    assert gap is not None, \
        "the fixture redirected nothing — this case would pass against an " \
        "ungated route"
    assert gap[1] == proxy, gap
    assert gap[2] == librarian_call.CONSENT_STATE_UNASKED, gap

    # -- (a) unasked: the call must NOT happen -------------------------------
    handler, sealed = call_reach_date(
        root, store, {"seed_id": "seed-1"},
        seam=model_window("2019-03-05"), payload=CANNED_SEED_PAYLOAD)

    # ⛔ ASSERTED AS THE LIST, NEVER AS A LENGTH — a length prints "1 != 0" and
    # names nothing; the list names the job that went out.
    assert sealed.calls == [], (
        "a call reached an address nobody agreed to — D-10 says NO CALL OF "
        "ANY KIND, and this is the reach date: %r" % (sealed.calls,))
    assert sealed.sockets == [], sealed.sockets
    # ⛔ AND IT IS SILENT, exactly as the docstring's design requires: today's
    # calendar, the today token, no error surface and no new shape.
    assert handler.status == 200, handler.message
    assert handler.body == {"ok": True, "fortnight": today,
                            "from": server.REACH_FROM_TODAY}, handler.body

    # -- (b) she answers yes: the SAME fixture must now call ------------------
    under_her_home(
        lambda: librarian_call.record_base_consent(
            proxy, librarian_call.CONSENT_YES))

    handler2, sealed2 = call_reach_date(
        root, store, {"seed_id": "seed-1"},
        seam=model_window("2019-03-05"), payload=CANNED_SEED_PAYLOAD)

    assert len(sealed2.calls) == 1, (
        "the agreed address is not being reached — the zero above is being "
        "produced by the fixture and not by the gate: %r" % (sealed2.calls,))
    assert sealed2.calls[0][0] == "blessing_selection", sealed2.calls[0]
    assert handler2.status == 200, handler2.message
    assert handler2.body["from"] == server.REACH_FROM_MODEL, handler2.body


def main():
    problems = preflight()
    if problems:
        print("test_offer_records FAILED — the instrument is not trustworthy:")
        for p in problems:
            print("  [preflight] " + p)
        return 1

    failures = []
    ran = []
    for name, fn in CASES:
        root = Path(tempfile.mkdtemp(prefix="offer-records-"))
        ran.append(name)
        try:
            fn(root)
        except BaseException:             # noqa: BLE001 — every case reported
            lines = traceback.format_exc().strip().splitlines()
            failures.append("[%s] %s" % (name, " | ".join(lines[-3:])))
        finally:
            # BOTH paths: the fixture tree never outlives the case.
            shutil.rmtree(str(root), ignore_errors=True)

    # ⚠ THE CASE COUNT IS ASSERTED BY VALUE, and so is the roster of names. A
    # count alone is satisfied by a rename; a roster alone is satisfied by a
    # case that registers and never runs. `ran` counts INVOCATIONS.
    # 29 → 30 on 2026-08-23: `empty_offer_is_not_a_cycle` (CR-01). ⚠ RAISED IN
    # THE SUITE-ONLY COMMIT, WHILE THE SUITE WAS RED — the only order in which
    # "the number was not raised to clear a red" is checkable from the history.
    if len(ran) != 30:
        failures.append("[registry] %d case(s) ran — pinned BY VALUE at "
                        "exactly 30" % len(ran))
    if ran != EXPECTED_CASES:
        failures.append("[registry] the cases that ran are %r — expected "
                        "exactly %r" % (ran, EXPECTED_CASES))

    if failures:
        print("test_offer_records FAILED — %d violation(s):" % len(failures))
        for f in failures:
            print("  " + f)
        return 1

    # ⚠ THIS LINE USED TO BE THE LITERAL STRING "OK — 29/29 cases" and counted
    # NOTHING (found 2026-08-23 while fixing CR-01: the roster gained a case,
    # both real gates moved to 30, and the headline a reader sees stayed 29/29).
    # ⛔ Every record in this phase quotes these printed totals "by value" — so a
    # hardcoded headline is the by-value discipline defeated at the one place it
    # is read. It is DERIVED now: `ran` counts invocations, and the two gates
    # above already hold it to the roster by value and by name.
    print("test_offer_records OK — %d/%d cases" % (len(ran), len(EXPECTED_CASES)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
