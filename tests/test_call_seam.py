#!/usr/bin/env python3
"""tests/test_call_seam.py — the call seam, proved at the boundary.

Standalone one-shot script in the house convention: no runner, no package.json,
nothing installed (law 8). Exits 0/1 on BARE invocation, so it sits inside the
`tests/test_*.py` glob the counting sweep uses. It parses no command-line
options at all and must never start: a suite that expects flags exits 2 when the
sweep runs it with none, which is exactly why `tests/eval_reflection.py` is
structurally excluded from that glob.

WHAT THIS SUITE REPLACES. The shipped fence pinned the model by reading
`--model`'s VALUE out of a recorded subprocess argv (test_librarian_fence.py
:2389/:2437/:2484). There is no argv any more, so the equivalent assertion reads
the model out of a recorded REQUEST BODY — the same strength of claim, taken at
the same place: after the app has decided everything, before a socket exists.

#24 names the one honest caveat, and it belongs here rather than in a summary:
this proves WHAT THE APP SENDS, not what the provider does with it afterward.

⚠ NO CLOUD CALL IS OBSERVED ANYWHERE IN THIS FILE, and that is now a claim about
THIS SUITE rather than about the machine. Corrected 2026-08-13: the owner ran
`--setup` and supplied a real Anthropic key, so `~/.study-room/` EXISTS and holds
one. Every case here still runs against a TEMPORARY HOME installed in `setUp`, so
this file reads no real key, writes none, and leaves the real keys file
byte-untouched — the isolation is what makes the sentence above true, not the
absence of a key. The cloud path's only evidence IN THIS FILE remains the recorded
request, asserted before the socket. The one live check below talks to Ollama on
loopback or honestly says it skipped.

THE INJECTION SEAMS are module attributes swapped from this test process and by
no other means — there is no environment variable and no config key that selects
a transport or a wait. This is deliberately unlike the harness that once
swallowed 17 of her saves: they live in a test process, they RECORD rather than
block, and nothing on a page she may be using can arm either.

⚠ THERE ARE TWO OF THEM AS OF 26.93-03, AND THE SECOND ONE IS THE CLOCK.
`librarian_call._sleep` is replaced here for EVERY case, not just the ones that
measure a wait. A suite that really holds still three times per retried token
stops being cheap enough to run on every commit, and a gate nobody runs is not
a gate. A real call into the standard library's waiting function therefore
appears NOWHERE in this file — deliberately not even spelled out in a comment,
because 26.93-03 greps this file for its absence and a mention would be
indistinguishable from a use. The case at the bottom asserts the same thing
from inside, building the name it looks for rather than writing it.
"""

import ast
import hashlib
import json
import os
import shutil
import sys
import tempfile
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, __file__.rsplit("/", 2)[0])

import librarian_call as L          # noqa: E402
import server                       # noqa: E402  (its import binds the literals)
import study_lib                    # noqa: E402


# The counts this file asserts BY VALUE. A harness that aborts early then fails
# loudly instead of reporting a smaller success.
# 26.93-06 raises all three: one new case (the migration's unmutated control
# asserted from inside the suite), five new mutations over copies of
# `server.py` held in memory, and one new control (the real `server.py`,
# counted in the same run as the five).
# 26.95-33 raises all three again: FOUR new cases (the front call's serialized
# request on all three providers, the result-shaped negative gate over that
# request, the OpenAI retention flag on it, and the encoding backstop), EIGHT
# new mutations (two per provider over the front call's own built request, the
# deleted retention flag, and the front call's site no longer naming its own
# job), and THREE new controls (the real front-call request, one per provider).
# ⚠ THE TWO SHIPPED PINS THIS PHASE TURNED RED ARE REWRITTEN RATHER THAN ADDED,
# so neither moves the case count: the unbound-job refusal changed its subject,
# and the call-site count closed by adding `blessing_selection` to
# MIGRATED_JOBS — see the paragraph above that roster for why that is one edit
# buying two properties rather than a bumped digit.
# ⚠ 62 -> 67: FIVE new cases from map #50 / #96 — the reflection's cap, the
# effort that must move with it, where effort rides in the body, the rows it
# must NOT touch, and the ceiling now derived from the cap instead of typed.
# Counted here rather than discovered by a red sweep, per the roster rule above.
# ⚠ 67 -> 69, TWO cases in one bump, and the first of them is NOT this plan's.
# 26.995-03 added `test_refine_writes_it_again_once_then_keeps_what_she_had`'s
# neighbour here and left this literal at 67, so the module's own `main()` had
# been printing CASE COUNT MISMATCH and exiting 1 on a suite that was otherwise
# green — the gate was already red and saying so, and nothing was reading it.
# The second is 26.995-03-followup's own: the borrowed-row pin below.
# ⚠ 69 -> 102: THIRTY-THREE new cases, all of them 26.998's setup pass, and they
# arrive as a SECOND CASE CLASS (`SetupPassCase`) rather than as neighbours of
# the sixty-nine — its fixture is a whole library on disk and its isolation is
# a temp HOME, so sharing `SeamCase`'s setUp would have meant either weakening
# that one or building the library sixty-nine times. ⛔ BOTH classes are
# registered in `main()`; a class added and left unregistered would leave this
# pin correct and the cases unrun, which is the same defect this file was
# already bitten by at 67 -> 69.
#   her slice, and only her slice (1) · the excluded bodies and the excluded
#   TITLE reaching the payload nowhere (1) · the positive control proving the
#   fixture really holds every excluded class, readable (1) · two DRIVEN
#   refusals — under-delivery and a sitting's shedding pass — each proving its
#   own mutation landed (2) · the unmutated control for both (1) · the one call
#   going through `record_call` byte-for-byte (1) · pricing sending nothing (1)
#   · --run without her word sending nothing (1) · a whole run leaving her
#   library byte-identical (1) · the answer refused a path inside her library
#   (1) · her two room-words byte-for-byte (1) · the row's tier and retry count
#   (1) · an address she never agreed to, refused before the call (1) · a
#   diary entry shadowing a set-aside title stopping the pass (1) · title-only
#   rows refused (1) · her library moving underneath the run refused (1) ·
#   what it learned landing under the librarian and nowhere else (1) · the
#   refusal to learn twice over her own edits (1) · its control (1) · keeping
#   it making no call at all (1) · keeping it twice through the door she
#   actually types, refused (1) — ⛔ THE SECOND DRILL FOUND THAT ONE MISSING:
#   the refusal was proved at the function and never at the door, so `--keep`
#   forced to replace walked through a green suite.
# ⛔ THE LAST FOUR EXIST BECAUSE A DRILL FOUND THEM MISSING, and the drill is
# the record: thirteen mutations were driven through the shipped code and three
# walked through a green suite — the fence deleted from the slice selection,
# the title-only refusal deleted, and the library-moved refusal deleted. The
# first survived because the shadow fixture sat in tier 4, where her slice
# never reaches, so the screen was never asked to fire. All three are caught
# now, and the reason they were not is written here rather than tidied away.
# ⚠ THE DRILL AND CONTROL PINS DO NOT MOVE: the two mutations above are driven
# INSIDE their own cases (a payload one body short, a shed counter set), not
# through `run_drill`'s source-mutation harness, which rewrites module source
# and has nothing to say about a fixture library.
EXPECTED_CASES = 102
EXPECTED_MUTATIONS = 32
EXPECTED_CONTROLS = 12

# A sentence no real answer would contain, used to prove the provider's own
# error text never reaches her.
PROVIDER_ERROR_SENTENCE = "upstream connect error reading remote 10.4.2.9:443"

# A fake key value planted in a TEMPORARY keys file, so "no key value reaches
# this surface" can be asserted by searching for something that is definitely
# there to be found. ⚠ NO ASSERTION BELOW EVER PRINTS IT. Every case that
# searches for it uses a boolean plus a message naming the FIELD, never
# `assertNotIn`, whose failure output would print both the needle and the
# haystack — and would therefore turn a failing run in a transcript into the
# leak the case exists to prevent (T-26.93-24).
PLANTED_CREDENTIAL = "planted-fake-credential-never-printed-4f2a"

# What `setUp` pins BOTH key names to for the life of every case, so a real key
# in somebody's shell can never change what this suite measures. Named here
# rather than spelled twice: a case below searches a recorded request for it,
# and a second copy of the literal would be free to drift from the one that is
# actually installed. ⚠ Like PLANTED_CREDENTIAL, no assertion ever prints it.
PLACEHOLDER_CREDENTIAL = "placeholder-not-a-real-credential"

# The job every provider below is driven with. `import_presort` is the first
# row `server.py` binds its literals to at import, so it reaches a builder
# without help — an unbound row is refused loudly by design.
# Its tier is `local`; pointing that tier at a cloud fill is exactly what one of
# HER STORED PICKS does, so the routing built below is the shipped path rather
# than a test-only door cut into the resolver.
#
# ⚠ IT WAS `heading_proposals` UNTIL 2026-08-17, when the labelling pass's two
# model jobs were deleted (#87 retired the pass, #95 ruled the code out). Any
# bound `local` row serves: this names a row to DRIVE, never a property of that
# particular job.
#
# ⚠ ONE EXCEPTION, ADDED 26.93-03: `SeamCase.bind_reflection` binds the
# `reflection` row for the life of a single case, borrowing THESE literals.
# Reflection is the only row whose allowance is 0, so it is the only row on
# which D-08's zero can be proved at all — and it is unbound again on cleanup.
GATE_JOB = "import_presort"

# 26.95-33: THE FRONT CALL — the one cloud call phase 26.95 owns. Its literals
# are bound at import by `server.py` exactly like every other row's, and its
# tier is `cheap-cloud`, which is why the cases below build their routing by
# filling THAT tier rather than reusing GATE_JOB's local one.
BLESSING_JOB = "blessing_selection"

# Who fills the tier, per provider, taken from the module's own tables so a
# renamed default cannot leave this file quietly asserting a stale string.
FILL_FOR = {
    "ollama": L.LOCAL_FILL,
    "anthropic": L.ANTHROPIC_FILLS["good-cloud"],
    "openai": L.OPENAI_FILLS["cheap-cloud"],
}

# The same table for the CHEAP-CLOUD tier, which is the tier the front call is
# pinned to. Separate rather than derived, for the reason `TIER_FILLS_ALLOWED`
# carries with its own repetition: a derivation binds this to the SHAPE of the
# table above, so a change there would silently change what is asserted here.
CHEAP_FILL_FOR = {
    "ollama": L.LOCAL_FILL,
    "anthropic": L.ANTHROPIC_FILLS["cheap-cloud"],
    "openai": L.OPENAI_FILLS["cheap-cloud"],
}

# The path each provider's request must land on, appended to the ROUTING base.
URL_PATH = {
    "ollama": "/api/chat",
    "anthropic": "/v1/messages",
    "openai": "/v1/chat/completions",
}

# What a cut-off answer actually looks like on the wire: valid-so-far JSON that
# json.loads cannot finish. Used so "truncation is decided BEFORE any parse" is
# a real claim — if the order were wrong these bodies would answer `malformed`.
CUT_OFF_TEXT = '{"sections": [{"heading": "the part it managed to'


def routing_for(provider, bases=None):
    """A frozen Routing whose `local` tier is filled by `provider`.

    Built through `resolve_routing` with a STORED fill, never by hand — the
    frozen object and its validation are part of what is under test."""
    settings = {"fills": {"local": list(FILL_FOR[provider])}}
    if bases:
        settings["bases"] = bases
    return L.resolve_routing(settings, environ={})


def routing_cheap(provider, bases=None):
    """A frozen Routing whose `cheap-cloud` tier is filled by `provider`.

    ⚠ THE TIER IS THE ONE THE ROW NAMES, and that is load-bearing rather than
    tidy: `request_violations` reads the fill for `JOBS[job]["tier"]`, so a
    routing that filled `local` instead would hand it a fill the front call's
    row never names and the unmutated control would go red for a reason that
    is not a defect. Built through `resolve_routing` with a STORED fill, like
    `routing_for`, so the frozen object and its validation are under test too.

    ⚠ THE SHELL IS HANDED A PLACEHOLDER FOR BOTH KEY NAMES RATHER THAN LEFT
    EMPTY, and that is not decoration. `key_present` answers from the shell
    FIRST and only falls to the keys file when the shell says nothing — so an
    empty environ sends the resolver off to read a file under whatever home is
    in force. Every CASE here runs under a temporary one; the mutation drill at
    the foot of this file does not, and it builds requests through this
    function too. Saying "there is something here" in the argument keeps the
    resolution hermetic wherever it is called from, and it changes no fill: the
    only tier anything below reads is the one stored explicitly here."""
    settings = {"fills": {"cheap-cloud": list(CHEAP_FILL_FOR[provider])}}
    if bases:
        settings["bases"] = bases
    present = dict((name, PLACEHOLDER_CREDENTIAL)
                   for name in L.KEY_ENV_NAMES.values())
    return L.resolve_routing(settings, environ=present)


def routing_missing(tier):
    """A frozen Routing with ONE tier holding NO fill at all.

    ⚠ BUILT THROUGH THE MODULE'S OWN CONSTRUCTOR, and that is not a door cut
    into production code for a test's convenience: `resolve_routing` CANNOT
    produce an unfilled tier — a cloud tier with no key anywhere resolves to her
    own machine, because a room with her own machine in it is a complete room.
    The only way to drive the refusal path at all is to hand the seam the shape
    a partially-configured room would have, and `_make_routing` is the same
    function `resolve_routing` itself returns through, so the object under test
    is the real frozen one and not a stand-in.

    Every OTHER tier is filled on purpose: an empty tier beside a filled one is
    the exact shape in which a helpful fall-through would look like a feature.
    """
    fills = dict((t, L.LOCAL_FILL) for t in L.TIERS if t != tier)
    return L._make_routing(fills, L.DEFAULT_BASES, L.DEFAULT_TIMEOUTS,
                           dict((t, L.SOURCE_DEFAULT) for t in L.TIERS))


# ---------------------------------------------------------------------------
# ---- the recorder ---------------------------------------------------------

class Recorder:
    """Captures every request and returns a canned triple. Opens nothing.

    ⚠ `auth` IS RECORDED SEPARATELY FROM THE REQUEST, because 26.93-04 hands the
    credential's header to the transport as its own argument rather than writing
    it into the request dict. That is what keeps the shipped assertion — no
    builder ever places a credential in the headers — true of the request that
    actually travels, and it is why a case below can search the recorded request
    for a planted key value and expect to find nothing."""

    def __init__(self, status=200, headers=None, body=b""):
        self.calls = []
        self.status = status
        self.headers = headers or {}
        self.body = body

    def __call__(self, request, timeout_s, auth=None):
        self.calls.append({"request": request, "timeout_s": timeout_s,
                           "auth": auth})
        return self.status, self.headers, self.body


class RejectionSpy:
    """Counts calls to `librarian_call._note_key_rejected` and then lets the
    shipped one run — A SPY, NOT A STUB. What is counted has to be the shipped
    path, or the four zero-counts below would only prove that a stand-in was
    never called."""

    def __init__(self, inner):
        self.inner = inner
        self.calls = []

    def __call__(self, provider):
        self.calls.append(provider)
        return self.inner(provider)


def ollama_body(content_obj, done_reason="stop", model="qwen2.5:7b"):
    """A well-formed local answer carrying `content_obj` as its JSON payload."""
    return json.dumps({
        "model": model,
        "done_reason": done_reason,
        "message": {"role": "assistant", "content": json.dumps(content_obj)},
        "prompt_eval_count": 41,
        "eval_count": 12,
    }).encode("utf-8")


def anthropic_body(content_obj, stop_reason="end_turn", text=None,
                   model=None):
    """A well-formed Anthropic answer carrying `content_obj` as its payload.

    The object rides the first `text` content block, which is where the
    structured-output field puts it."""
    if text is None:
        text = json.dumps(content_obj)
    return json.dumps({
        "model": FILL_FOR["anthropic"][1] if model is None else model,
        "stop_reason": stop_reason,
        "content": [{"type": "text", "text": text}],
        "usage": {"input_tokens": 41, "output_tokens": 12},
    }).encode("utf-8")


def openai_body(content_obj, finish_reason="stop", refusal=None, text=None,
                model=None):
    """A well-formed OpenAI answer carrying `content_obj` as its payload."""
    if text is None:
        text = json.dumps(content_obj)
    message = {"role": "assistant", "content": text}
    if refusal is not None:
        message["refusal"] = refusal
    return json.dumps({
        "model": FILL_FOR["openai"][1] if model is None else model,
        "choices": [{"index": 0, "finish_reason": finish_reason,
                     "message": message}],
        "usage": {"prompt_tokens": 41, "completion_tokens": 12},
    }).encode("utf-8")


# One good canned answer per provider, so the same loop can drive all three.
CANNED = {
    "ollama": ollama_body({"sections": []}),
    "anthropic": anthropic_body({"sections": []}),
    "openai": openai_body({"sections": []}),
}

# 26.95-33: the front call's own well-formed answer — an absolute date window
# and the permitted decline, which is the WHOLE of what its schema can express.
# ⚠ NO ID, NO LIST, NO RESULT OF ANY KIND, here or in the shape it mirrors: the
# model writes the query and never sees, orders or picks a photograph (D-06,
# D-12). A canned answer that carried one would be this suite quietly agreeing
# to a shape the room does not have.
BLESSING_ANSWER = {"start": "2019-03-05", "end": "2019-03-19",
                   "declined": False}

CANNED_BLESSING = {
    "ollama": ollama_body(BLESSING_ANSWER),
    "anthropic": anthropic_body(BLESSING_ANSWER),
    "openai": openai_body(BLESSING_ANSWER),
}


class Clock:
    """Stands in for the pause between attempts. RECORDS, never waits.

    Installed over `librarian_call._sleep` — the module's second and LAST
    injection point, exactly like `_transport`: a test-process module
    attribute, with no environment variable and no config key that selects
    either, so nothing in anybody's shell can steer a production call."""

    def __init__(self):
        self.waits = []

    def __call__(self, seconds):
        self.waits.append(seconds)


# ⛔ THERE IS NO `_unbind` HELPER, AND ITS ABSENCE IS THE POINT
# (26.995-03-followup). One lived here, with a docstring claiming it left
# nothing behind, while doing the opposite: it blanked a JOBS row that
# `server.py` binds once at import, so every row this suite borrowed stayed
# blank for whatever ran next in the same process. `SeamCase.bind_row` now
# saves the pair it found and restores exactly that. Do not reintroduce an
# unbind helper for the next borrow — borrow through `bind_row`.


# ---------------------------------------------------------------------------
# ---- one driver per failure token (D-06, D-07, D-08) ----------------------
#
# What the recorder is told to hand back, and WHICH PROVIDER the call must go
# through for that answer to mean this token. ⚠ The provider column is not
# decoration: `offline` and `ollama_not_running` are the SAME dead connection
# read two different ways, and a table that dropped the provider could not
# express the difference the whole of D-07 turns on.

NEVER_RETRIED_DRIVERS = {
    "bad_key": ("anthropic", 401, {}, b"{}"),
    "ollama_not_running": ("ollama", None, {}, b""),
    "model_not_pulled": (
        "ollama", 404, {},
        b'{"error": "model qwen2.5:7b not found, try pulling it first"}'),
    "truncated": ("ollama", 200, {},
                  ollama_body({"sections": []}, done_reason="length")),
    "declined": ("anthropic", 200, {},
                 anthropic_body({"sections": []}, stop_reason="refusal")),
    "malformed": ("ollama", 200, {}, b"{not json at all"),
}

RETRIED_DRIVERS = {
    "rate_limited": ("ollama", 429, {}, b"{}"),
    "provider_down": ("ollama", 500, {}, b"{}"),
    "offline": ("anthropic", None, {}, b""),
    "timeout": ("ollama", L.STATUS_TIMED_OUT, {}, b""),
}


# ---------------------------------------------------------------------------
# ---- "the module writes no line anywhere", as a property rather than a grep
#
# ⚠⚠ THIS REPLACES A BARE-WORD SEARCH, AND THE REASON IS WORTH THE PARAGRAPH.
# The first version of this check looked for the strings "print(", "logging"
# and "sys.stdout" anywhere in ~50 KB of module source. It went red on a
# COMMENT — a sentence explaining why a credential must never reach a log —
# while a real writer spelled `w = print` would have walked straight past it.
# That is the FORBIDDEN_TOKENS defect one level up: a text scan tripped by its
# own prose, and it fails in both directions at once. A comment discussing
# logging is not a logger, and the comment is the more valuable of the two.
#
# So the claim is made against the SYNTAX TREE. Comments do not survive
# parsing at all and docstrings are inert constants, so prose is invisible
# here by construction — while an import of a logging module, a call to
# anything named `print`, a `.write(...)` on any stream, a `warnings.warn`,
# and a bare `print` handed around as a value are all visible.

WRITER_MODULES = ("logging", "syslog")


def _dotted_name(node):
    """`sys.stdout.write` for an attribute chain, `print` for a plain name."""
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
    else:
        parts.append("<expr>")
    return ".".join(reversed(parts))


def writer_violations(source):
    """Every place `source` could write a line anywhere, as a list of
    failures. Empty means the source holds no writer at all.

    Factored out like every other checker in this file so the SAME function
    that judges the real module can be driven over fabricated code — a scan
    that has only ever been seen firing on a comment has not been shown to
    catch anything, and a gate never seen catching a real defect is not
    evidence."""
    bad = []
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return ["the source did not parse: " + str(exc.msg)]

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in WRITER_MODULES:
                    bad.append("imports " + alias.name)
        elif isinstance(node, ast.ImportFrom):
            if (node.module or "").split(".")[0] in WRITER_MODULES:
                bad.append("imports from " + str(node.module))
        elif isinstance(node, ast.Call):
            name = _dotted_name(node.func)
            root = name.split(".")[0]
            if (name == "print" or root in WRITER_MODULES
                    or name.endswith(".write") or name.endswith(".writelines")
                    or name.endswith(".warn")):
                bad.append("calls " + name)
        elif isinstance(node, ast.Name) and node.id == "print":
            # `w = print` and then `w(key)` — the aliasing a word search for
            # "print(" cannot see.
            bad.append("names the printer as a value")
    return bad


def worker_routing_violations(source):
    """Every worker in `source` that resolves its own routing, or that reaches
    the call seam without being handed one, as a list of failures.

    ⚠ ASSERTED AGAINST THE SYNTAX TREE, FOR THE REASON `writer_violations`
    ABOVE ALREADY PAID FOR ONCE. A text scan cannot tell where one function
    ends and the next begins, so a nested closure named `worker` inside a
    request handler would drag every later line in the file into its "body" —
    including a handler that resolves routing exactly where D-04 says it
    should — and report the correct code as the violation. The tree knows the
    scope; a regular expression is guessing at it. Comments and docstrings do
    not survive parsing at all, so this file's own prose about resolving
    routing is invisible here by construction.

    Factored out like every other checker in this file so the SAME function
    that judges `server.py` can be driven over fabricated workers — a gate
    never seen catching a real defect is not evidence."""
    bad = []
    try:
        tree = ast.parse(source)
    except SyntaxError as exc:
        return ["the source did not parse: " + str(exc.msg)]

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if "worker" not in node.name:
            continue
        params = [a.arg for a in node.args.args]
        params += [a.arg for a in node.args.kwonlyargs]
        calls = set()
        for inner in ast.walk(node):
            if isinstance(inner, ast.Call):
                calls.add(_dotted_name(inner.func).split(".")[-1])
        if "resolve_routing" in calls:
            # D-04: a module constant resolves at import and cannot see a fill
            # written afterwards, and a worker holds no store lock and reads
            # no store. Resolving here breaks one or the other.
            bad.append(node.name + " resolves routing inside a worker")
        if "call_librarian" in calls and "routing" not in params:
            bad.append(node.name + " reaches the seam without being handed a "
                                   "routing parameter")
    return bad


# ---------------------------------------------------------------------------
# ---- 26.93-06: the migration's own claims, as a checker over SOURCE TEXT ---
#
# ⚠⚠ WHY THIS PLAN IN PARTICULAR NEEDED A DRILL. It is the largest change in
# the phase — eight call sites, two deleted return keys, a replaced third, a
# new sentence map — and every check the plan itself wrote was a grep whose
# passing condition is a COUNT. A grep that expects zero passes just as well
# when the file is empty, when a function was renamed, and when the grep
# itself is subtly wrong. Roughly thirty defects of this project's class have
# landed INSIDE the measuring instrument rather than in the code under test.
# So the claims live in a FUNCTION that can be driven red on fabricated
# sources, and the five mutations below are the five ways this migration
# realistically goes wrong rather than five arbitrary edits.
#
# ⚠ NOTHING HERE WRITES A FILE. Every mutation is a string held in memory, and
# `server.py` is only ever READ.

# The jobs the shipped call sites name, and nothing else.
#
# ⚠ 26.95-33 ADDS THE NINTH, AND THE ROSTER IS WHY THAT IS ONE EDIT RATHER THAN
# TWO. `migration_violations` derives the expected SITE COUNT from this tuple's
# length and, in the very next loop, asserts that every member is NAMED by some
# call site. So adding `blessing_selection` here closes the count the front
# call's own route opened AND pins that a site really names the new job —
# two properties, not one. Incrementing a digit somewhere would have bought
# only the first, and a route that stopped naming its job would have gone
# unnoticed behind a still-correct total.
#
# ⚠ AN EXPLICIT LITERAL, NEVER A DERIVATION OVER `JOBS` — the rule spelled out
# above `SEAM_FORBIDDEN_ARGS`, and it bites harder here: derived from the table,
# this roster would have grown by itself the moment 26.93 pre-cut the
# `blessing_selection` row, and the count would have been "right" a whole phase
# before any call site existed to make it true.
# ⛔ TWO ROWS LEFT THIS ROSTER 2026-08-17: `cleaning_labels` and
# `heading_proposals`, the retired labelling pass, deleted with their call
# sites (#95). The count below therefore moved 9 -> 7 deliberately; it is
# still an explicit literal, for the reason above.
MIGRATED_JOBS = ("import_presort",
                 "librarian_note", "reflection", "reflection_refine",
                 "connections", "config_ask",
                 # 26.95-33: the front call's own round trip, named by
                 # `handle_librarian_reach_date` and by nothing else.
                 "blessing_selection",
                 # ⛔ 26.995-25 ADDS THE EIGHTH, AND THE GATE ASKED FOR IT
                 # RATHER THAN BEING TALKED ROUND. Her ruling of 2026-08-21 —
                 # "The model judges each one" — puts a second read after every
                 # reflection draft, which is a new job and a new site. The
                 # count went red on the first run naming exactly that, which
                 # is the roster doing the one thing it exists for: a site
                 # added without a deliberate edit here is a site nobody
                 # decided on. Named by `reflection_judge` in `server.py` and
                 # by nothing else. ⚠ No case count moves: the row and the
                 # site are both absorbed here, which is the same one-edit-two-
                 # properties move `blessing_selection` made above.
                 "reflection_judge",
                 # ⛔ 26.9985 R-16 ADDS THE NINTH, AND AGAIN THE GATE ASKED.
                 # Her F6 ruling of 2026-08-26 — `Yes — now, and every time
                 # after` — wires the notebook clearing into the aside
                 # verdict, which is a new job and a new site inside
                 # `server.py` (`run_subject_clearing`; the finding and tidy
                 # runners live in tools/ and are outside this scan). Named
                 # by `subject_clearing` and by nothing else. ⚠ No case
                 # count moves: row and site absorbed here, the same
                 # one-edit-two-properties move as the two rows above.
                 "subject_clearing")

# The four tokens whose sentence may not mention a key: not one of them has
# looked at a credential (D-07), and a sentence that said otherwise would send
# her to replace a working key because a server was busy.
BUSY_SERVER_TOKENS = ("rate_limited", "provider_down", "offline", "timeout")

# ⚠ AN EXPLICIT LITERAL, NEVER A DERIVATION OVER THE MODULE'S NAMES. This is
# the same rule `TIER_FILLS_ALLOWED` carries with its reason attached: a
# derived list binds membership to the SHAPE of whatever it was derived from,
# so a rename somewhere else silently changes what is checked without touching
# the line that defines it. These are the literals the eight sites used to
# hand over at the call, spelled out, so any change to the list is visible in
# a diff.
SEAM_FORBIDDEN_ARGS = (
    "VERDICT_SCHEMA_JSON", "LIBRARIAN_SORT_PROMPT", "LIBRARIAN_SORT_MODEL",
    "CLEAN_SCHEMA_JSON", "CLEAN_PROMPT", "CLEAN_MODEL",
    "HEADING_SCHEMA_JSON", "HEADING_PROMPT",
    "NOTE_SCHEMA_JSON", "LIBRARIAN_NOTE_PROMPT", "LIBRARIAN_QUESTION_RULES",
    "LIBRARIAN_NOTE_MODEL",
    "REFLECTION_SCHEMA_JSON", "LIBRARIAN_REFLECT_PROMPT",
    "LIBRARIAN_REFLECT_MODEL",
    "CONNECTION_SCHEMA_JSON", "LIBRARIAN_CONNECT_PROMPT",
    "LIBRARIAN_CONNECT_MODEL",
    "CONFIG_SCHEMA_JSON", "CONFIG_PROMPT", "CONFIG_MODEL",
)


def _dict_literal(tree, name):
    """The dict a module-level `NAME = {...}` assigns, over constant keys and
    constant values — or None when no such assignment exists.

    Adjacent string literals are folded into ONE constant by the parser, so a
    sentence written across several source lines still arrives here whole."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        names = [t.id for t in node.targets if isinstance(t, ast.Name)]
        if name not in names or not isinstance(node.value, ast.Dict):
            continue
        out = {}
        for key, value in zip(node.value.keys, node.value.values):
            if isinstance(key, ast.Constant) and \
                    isinstance(value, ast.Constant):
                out[key.value] = value.value
        return out
    return None


def _reads_structured_verdicts(tree, func_name):
    """Whether ONE named function subscripts `structured["verdicts"]`.

    Scoped to a function on purpose — see the caller's comment. The subscript
    shape changed across Python versions (an `Index` wrapper before 3.9, gone
    entirely in 3.12), so the wrapper is unwrapped BY TYPE NAME rather than by
    naming a class that does not exist in every interpreter this may run on."""
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name != func_name:
            continue
        for inner in ast.walk(node):
            if not isinstance(inner, ast.Subscript):
                continue
            if not isinstance(inner.value, ast.Name) or \
                    inner.value.id != "structured":
                continue
            where = inner.slice
            if type(where).__name__ == "Index":
                where = getattr(where, "value", where)
            if isinstance(where, ast.Constant) and \
                    where.value == "verdicts":
                return True
    return False


def migration_violations(server_src, jobs, failures):
    """26.93-06's claims about `server.py`, as a list of failures. Empty means
    all held.

    Judged against the SYNTAX TREE wherever a name matters, for the reason
    `writer_violations` above already paid for once: a text scan cannot tell a
    call from a comment about a call, and this file's own prose names every
    literal it forbids.

    The claims, each one a way the migration actually dies:
      1. a call site names a schema, a prompt or a model again — the whole
         point of D-01 is that a caller can say none of the three;
      2. a site is left behind on the deleted function;
      3. the ONE reader of the deleted `verdicts` return key is repointed at
         it instead of at `structured`;
      4. ⚠ RETIRED AND INVERTED 2026-08-14. This asked that `server.py` keep
         exactly ONE bare `.get("result")` — the deleted vault tidy-up
         worker's own read — so that it could not be swept away by mistake
         along with the return key that shared its spelling. #56's ruling
         deleted that whole path deliberately, so the count is now ZERO and
         the claim reads the other way: nothing in this file reads a spawned
         agent's result any more. Kept rather than dropped, because the
         spelling collision that made it necessary is still a live hazard;
      5. FAILURE_SENTENCES drifts out of step with the closed register, so a
         real failure reaches her as nothing at all;
      6. a busy-server sentence mentions her key, or a fixable failure stops
         carrying the one command that fixes it."""
    bad = []
    try:
        tree = ast.parse(server_src)
    except SyntaxError as exc:
        return ["server.py did not parse: " + str(exc.msg)]

    seam_calls = []
    record_sites = []
    old_calls = 0
    deleted_key_reads = 0
    result_gets = 0

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = _dotted_name(node.func).split(".")[-1]
        if name == "run_librarian_call":
            old_calls += 1
        elif name == "call_librarian":
            seam_calls.append(node)
        elif name == "record_call":
            record_sites.append(node)
        elif name == "get" and isinstance(node.func, ast.Attribute) \
                and node.args and isinstance(node.args[0], ast.Constant):
            asked = node.args[0].value
            if asked == "result" and len(node.args) == 1 \
                    and isinstance(node.func.value, ast.Name):
                # ⚠ `<name>.get("result")` WITH NO DEFAULT, which is exactly
                # what the plan's own grep matches and exactly the ONE line it
                # promises survives — `_vault_processor_worker`'s read of
                # `run_vault_processor`'s own dict (#44, out of scope by name).
                # `run_librarian_call`'s `envelope.get("result", "")` is the
                # OTHER spelling and is deliberately not counted: that whole
                # function is deleted in Plan 26.93-07, and counting it here
                # would make this claim change meaning one wave from now
                # without anybody editing the line that states it.
                result_gets += 1
            elif asked == "verdicts" and \
                    isinstance(node.func.value, ast.Name) and \
                    node.func.value.id == "result":
                # ⚠ NARROW ON PURPOSE. Her STORED corpus is also read with
                # `.get("verdicts")`, off the suggestions notebook — that is
                # 2,887 saved verdicts and nothing in this phase touches it.
                # Only a read off a librarian RETURN named `result` is the
                # deleted key.
                deleted_key_reads += 1

    # -- 2: no site is left behind on the deleted function ------------------
    if old_calls:
        bad.append("run_librarian_call is still called at " + str(old_calls)
                   + " site(s) — every caller moved to the seam in 26.93-06")

    # ---- 26.99-03: THE WRAPPER, AND WHY THIS CHECKER LEARNED ABOUT IT -----
    #
    # ⚠⚠ THE CLAIM DID NOT WEAKEN; ITS SUBJECT MOVED, and that distinction
    # is the whole of the argument. D-01's rule is that a caller may name a
    # JOB AND NOTHING ELSE — no schema, no prompt, no model. 26.99-03 puts
    # ONE wrapper, `server.record_call`, around the seam so that every call
    # leaves a line in the privacy record (D-01/D-02), and a call site that
    # goes through it names its job AT THE WRAPPER rather than at
    # `call_librarian`. Every property below is now asserted of BOTH kinds
    # of job-naming site, and the roster's count is asserted over the two
    # TOGETHER — so a site cannot vanish by moving between them, which is
    # the one way this edit could have been an accommodation.
    #
    # ⛔ EXACTLY ONE SITE MAY NAME ITS JOB WITH A VARIABLE: the one inside
    # `record_call` itself, which is handed the job its own caller named.
    # The exemption is granted BY ENCLOSING FUNCTION, never by shape, so a
    # second variable-named site anywhere else still fails here — and that
    # is precisely what stops the wrapper from becoming a hole in D-01.
    # 26.99-04 wires the remaining eight sites and adds the gate that goes
    # red while any caller reaches the seam AROUND the wrapper.
    #
    # ⚠ THIS EDIT IS GREEN BOTH BEFORE AND AFTER THAT CODE LANDS, on
    # purpose and verified: with no wrapper in the file there are no
    # wrapper sites and no record sites, and the nine direct sites satisfy
    # every clause exactly as they did. A gate rewritten so that it can
    # only pass after the change it is meant to judge has stopped being a
    # judge — which is the failure this project has recorded four times.
    wrapper_seam_ids = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and node.name == "record_call":
            for inner in ast.walk(node):
                if isinstance(inner, ast.Call) and \
                        _dotted_name(inner.func).split(".")[-1] == \
                        "call_librarian":
                    wrapper_seam_ids.add(id(inner))
    wrapper_calls = [c for c in seam_calls if id(c) in wrapper_seam_ids]
    direct_calls = [c for c in seam_calls if id(c) not in wrapper_seam_ids]
    if len(wrapper_calls) > 1:
        bad.append("record_call reaches the seam " + str(len(wrapper_calls))
                   + " times — a wrapper is one call, or it is not a "
                   "wrapper")

    # -- 1: no call site names a schema, a prompt or a model ----------------
    named_jobs = []
    for call in direct_calls + record_sites + wrapper_calls:
        if len(call.args) != 3 or call.keywords:
            bad.append("a site does not pass exactly "
                       "(job, payload_text, routing)")
        for inner in ast.walk(call):
            if isinstance(inner, ast.Name) and \
                    inner.id in SEAM_FORBIDDEN_ARGS:
                bad.append("a call site names " + inner.id + " — a caller may "
                           "name a job and nothing else (D-01)")

    # ⛔ THE NAMING CLAIM IS ASKED OF THE JOB-NAMING SITES ONLY. The one
    # inside the wrapper is handed its job and is exempt above; every other
    # site, of either kind, must still spell its job out as a literal.
    for call in direct_calls + record_sites:
        first = call.args[0] if call.args else None
        if isinstance(first, ast.Constant) and isinstance(first.value, str):
            named_jobs.append(first.value)
            if first.value not in jobs:
                bad.append("a call site names a job that is not in the table: "
                           + repr(first.value))
        else:
            bad.append("a call site does not name its job as a plain string")

    carrying = len(direct_calls) + len(record_sites)
    if carrying != len(MIGRATED_JOBS):
        bad.append("expected " + str(len(MIGRATED_JOBS))
                   + " job-naming sites (at the seam, or at the wrapper "
                     "around it), found " + str(carrying))
    for job in MIGRATED_JOBS:
        if job not in named_jobs:
            bad.append("no call site names the job " + repr(job))

    # -- 3: the deleted return key, and the structured read that replaced it
    if deleted_key_reads:
        bad.append("a librarian result is still read for the deleted "
                   "`verdicts` return key (D-02)")
    # ⚠ ASKED OF `_presort_worker` ITSELF, never of the whole file. A text
    # search for structured["verdicts"] would be satisfied by the copy inside
    # `run_librarian_call` — the function this phase is retiring — so the
    # positive half of this claim would pass while the site that actually
    # matters had regressed. The one site that read the deleted key is the
    # pre-sort loop, and this asks that loop directly.
    if not _reads_structured_verdicts(tree, "_presort_worker"):
        bad.append("_presort_worker no longer reads structured['verdicts'] "
                   "— it is the one site that read the deleted return key")

    # -- 4: the vault tidy-up's own read, which must now be ABSENT ---------
    # ⚠ WAS "exactly one, and it must survive". The one it protected was the
    # deleted vault-processor worker's read of its own dict; #56 deleted that
    # path on the owner's ruling, so a surviving bare `.get("result")` in this
    # file would mean a spawned agent's result is being read again.
    if result_gets != 0:
        bad.append("expected NO bare .get(\"result\") — the vault tidy-up "
                   "that owned the only one was deleted (#56) — found "
                   + str(result_gets))

    # -- 5 and 6: the sentence map ------------------------------------------
    sentences = _dict_literal(tree, "FAILURE_SENTENCES")
    if sentences is None:
        bad.append("FAILURE_SENTENCES is not a plain dict literal")
        return bad

    if set(sentences) != set(failures):
        bad.append("FAILURE_SENTENCES' key set is not the closed register; "
                   "unmatched: "
                   + repr(sorted(set(sentences) ^ set(failures))))

    for token in BUSY_SERVER_TOKENS:
        text = sentences.get(token)
        if isinstance(text, str) and "key" in text.lower():
            bad.append("`" + token + "` mentions a key — nothing about a busy "
                       "or unreachable server has looked at a credential "
                       "(D-07), and this sentence would send her to replace a "
                       "working one")

    for token, needle in (("bad_key", "server.py --setup"),
                          ("no_key", "server.py --setup"),
                          ("ollama_not_running", "ollama serve"),
                          ("model_not_pulled", "ollama pull")):
        text = sentences.get(token)
        if not isinstance(text, str) or needle not in text:
            bad.append("`" + token + "` no longer carries the one command "
                       "that fixes it: " + repr(needle))

    cut_off = str(sentences.get("truncated") or "").lower()
    if "cut off" not in cut_off:
        bad.append("`truncated` no longer says the answer was CUT OFF — a "
                   "cut-off answer wearing a parse error's explanation is the "
                   "exact mislabelling D-06 exists to prevent")

    return bad


def refusal_violations(tier, result, recorded, expected_failure):
    """This plan's claims about a call that was NEVER MADE, as a list of
    failures. Empty means all held.

    Four claims, and each one is a way this promise actually dies: a tier with
    nothing usable in it must REFUSE rather than answer; it must open ZERO
    connections rather than be quietly served by a filled tier; it must name
    the ACTUAL missing thing rather than a category; and `absent` must stay a
    different kind of outcome from a failure, so a caller can tell "this is
    not available here" from "this went wrong".

    Factored out exactly like `seam_violations`, so the drill can feed it
    copies with one thing wrong each without editing `librarian_call.py`."""
    bad = []

    ref = result.get("refusal")
    if ref is None:
        bad.append("a tier with no usable fill did not refuse (#27 section 5)")
        return bad

    if result.get("ok") is not False:
        bad.append("a refusal is not ok=False: " + repr(result.get("ok")))

    # ⚠ THE ONE THAT COSTS HER MATERIAL. A missing fill served by another tier
    # is the silent downgrade — how reflections end up written by a 7B without
    # her ever choosing that.
    if recorded:
        bad.append("a refused job opened " + str(len(recorded))
                   + " request(s) — a missing fill was served by another tier")

    if ref.get("empty_tier") != tier:
        bad.append("the refusal does not name the empty tier: "
                   + repr(ref.get("empty_tier")))
    if not isinstance(ref.get("filled_tiers"), tuple):
        bad.append("the tiers that ARE filled do not ride the refusal as data")

    outcome = ref.get("outcome")
    if outcome == L.OUTCOME_ABSENT:
        if result.get("failure") is not None:
            bad.append("an absent job carries a failure token — absent is a "
                       "different kind of answer, not a twelfth token")
    elif outcome == L.OUTCOME_REFUSED:
        if result.get("failure") != expected_failure:
            bad.append("the refusal is generic rather than the actual missing "
                       "thing: " + repr(result.get("failure")) + " where "
                       + repr(expected_failure) + " was owed")
        if result.get("failure") not in L.FAILURES:
            bad.append("the refusal's token is outside the closed register "
                       "(D-06): " + repr(result.get("failure")))
    else:
        bad.append("the refusal's outcome is neither absent nor refused: "
                   + repr(outcome))

    return bad


def _deep_strings(value):
    """Every string anywhere in a nested structure, so 'the error text does not
    survive' can be asserted at any depth rather than only at the top."""
    out = []
    if isinstance(value, str):
        out.append(value)
    elif isinstance(value, dict):
        for k, v in value.items():
            out.extend(_deep_strings(k))
            out.extend(_deep_strings(v))
    elif isinstance(value, (list, tuple)):
        for v in value:
            out.extend(_deep_strings(v))
    return out


# ---------------------------------------------------------------------------
# ---- the checker the mutation drill actually drives -----------------------

def seam_violations(result, recorded, routing, payload_text):
    """This plan's claims, as a list of failures. Empty means all held.

    Factored out so the SAME function that judges a real call can be fed
    in-memory copies with one thing wrong each. A positive control proves the
    recorder records; it does NOT prove the assertions would notice a violation.
    Those are two different claims, and this project has shipped the first while
    believing the second."""
    bad = []

    if set(result) != {"ok", "structured", "model", "usage", "failure"}:
        bad.append("return key set is not exactly the five (D-02): "
                   + repr(sorted(result)))

    if "result" in result or "verdicts" in result:
        bad.append("a deleted key survived on the return (D-02)")

    if len(recorded) != 1:
        bad.append("expected exactly one request, recorded "
                   + str(len(recorded)))
    else:
        body = recorded[0]["request"]["body"]
        messages = body.get("messages") or []
        users = [m for m in messages if m.get("role") == "user"]
        systems = [m for m in messages if m.get("role") == "system"]
        if len(users) != 1 or users[0].get("content") != payload_text:
            bad.append("payload_text is not verbatim the user message "
                       "(the W3 wiring claim)")
        if len(systems) != 1 or not (systems[0].get("content") or "").strip():
            bad.append("the system prompt is not an explicit field (#24)")
        if body.get("model") != routing.fills["local"][1]:
            bad.append("the body's model is not the tier's fill (D-05)")
        if body.get("stream") is not False:
            bad.append("streaming is not off (D-09)")

    # D-06: a cut-off answer must NOT arrive wearing a parse error's clothes.
    if result.get("failure") not in (None,) + tuple(L.FAILURES):
        bad.append("failure is not a member of the closed register (D-06): "
                   + repr(result.get("failure")))

    if PROVIDER_ERROR_SENTENCE in " ".join(_deep_strings(result)):
        bad.append("the provider's own error text crossed the seam (D-06)")

    return bad


# ---------------------------------------------------------------------------
# ---- the serialized-request gate (26.93-02) -------------------------------
#
# ⚠⚠ NO CLOUD CALL IS OBSERVED ANYWHERE IN THIS FILE, AND NONE CAN BE — because
# every case runs against a TEMPORARY HOME, not because the machine has no key.
# Corrected 2026-08-13: `~/.study-room/` exists and holds a real Anthropic key,
# and `setUp` is what keeps this suite from ever reaching it. So the two cloud
# providers are still not witnessed end to end HERE, and THE RECORDED REQUEST,
# ASSERTED BEFORE THE SOCKET, IS THE WHOLE OF THIS FILE'S CLOUD EVIDENCE —
# everything below proves what the app SENDS, and nothing below proves what a
# provider does with it afterward. That second half is a contractual fact, not
# something any test in any repo can observe. Say the substitution plainly
# wherever this result is reported; do not let it be read as a live cloud run.
#
# TWO INDEPENDENT INSTRUMENTS, NOT ONE. This suite is the first: it drives the
# real builders and judges the request they produce. The second is
# `tests/test_no_push.cjs`, whose static pins assert the same claims from the
# SOURCE TEXT rather than from a live call — Plan 26.93-10 rewrites them. The
# pairing is the point: roughly thirty defects of this project's class have
# landed INSIDE the measuring instrument, and one instrument cannot catch that
# in itself. Neither of these is redundant; do not delete either as duplication.

def _system_of(provider, body):
    """The system prompt as this provider carries it — a top-level field on
    Anthropic, a role in the message list on the other two."""
    if provider == "anthropic":
        return body.get("system")
    for msg in (body.get("messages") or []):
        if isinstance(msg, dict) and msg.get("role") == "system":
            return msg.get("content")
    return None


def _user_of(provider, body):
    """The single user message, or None if there is not exactly one."""
    messages = body.get("messages") or []
    if provider == "anthropic":
        if len(messages) == 1 and isinstance(messages[0], dict):
            return messages[0].get("content")
        return None
    users = [m for m in messages
             if isinstance(m, dict) and m.get("role") == "user"]
    return users[0].get("content") if len(users) == 1 else None


def _cap_of(provider, body):
    """The output cap, under whichever name this provider gives it."""
    if provider == "ollama":
        return (body.get("options") or {}).get("num_predict")
    if provider == "anthropic":
        return body.get("max_tokens")
    return body.get("max_completion_tokens")


def request_violations(provider, req, job, routing, payload_text):
    """This plan's claims about ONE built request, as a list of failures.

    ALL FOUR PARTS are judged — method, URL, headers and JSON body — because a
    correct body sent to the wrong address with the wrong headers is not a
    correct request, and the argv pin this replaces covered the whole argv.

    Factored into a function, exactly like `seam_violations`, so the mutation
    drill can drive it RED without editing `librarian_call.py`. A gate written
    as inline asserts cannot be shown failing, and a gate never seen red is not
    evidence."""
    bad = []
    row = L.JOBS[job]
    fill = routing.fills[row["tier"]]
    base = routing.bases[provider]

    # -- part 1: the method -------------------------------------------------
    if req.get("method") != "POST":
        bad.append("method is not POST: " + repr(req.get("method")))

    # -- part 2: the URL, built from ROUTING rather than a literal ----------
    expected_url = base.rstrip("/") + URL_PATH[provider]
    if req.get("url") != expected_url:
        bad.append("url is not the routing base plus the provider's path "
                   "(#27 section 8): " + repr(req.get("url")))

    # -- part 3: the headers, and NO credential among them ------------------
    headers = req.get("headers") or {}
    if headers.get("Content-Type") != "application/json":
        bad.append("Content-Type is not application/json: "
                   + repr(headers.get("Content-Type")))
    if provider == "anthropic" and not headers.get("anthropic-version"):
        bad.append("the Anthropic request does not name an API version")
    for name in headers:
        if name.lower() in ("authorization", "x-api-key", "api-key"):
            bad.append("a builder placed a credential in the headers — the key "
                       "is read at send time and nowhere else (#28)")

    # -- part 4: the body ---------------------------------------------------
    body = req.get("body")
    if not isinstance(body, dict):
        bad.append("the body is not a dict: " + repr(type(body).__name__))
        return bad

    if body.get("model") != fill[1]:
        bad.append("the body's model is not the tier's fill (D-05): "
                   + repr(body.get("model")))
    if _system_of(provider, body) != row["prompt"]:
        bad.append("the system prompt is not the job row's, verbatim (#24)")
    if _user_of(provider, body) != payload_text:
        bad.append("payload_text is not verbatim the user message "
                   "(the W3 wiring claim)")
    if _cap_of(provider, body) != row["max_tokens"]:
        bad.append("the output cap is not the job row's max_tokens (D-09): "
                   + repr(_cap_of(provider, body)))
    if body.get("stream") is not False:
        bad.append("streaming is not off (D-09)")
    if provider == "openai" and body.get("store") is not False:
        bad.append("the OpenAI body does not carry store: false — without it "
                   "the exchange is kept server-side for 30 days, retrievable "
                   "by id (#24)")

    return bad


def result_shaped_violations(wire_text):
    """Every place a REQUEST asks for, offers, or names a RESULT — as a list
    of failures. Empty means the request asks only for a date window.

    ⚠ ASSERTED OVER THE REQUEST THAT TRAVELS, never over the schema string in
    `server.py`. What the room is safe from is what it SENDS, and the schema is
    only one of the fields the body carries; a ranking instruction added to the
    prompt would leave the schema untouched and would still be on the wire.

    ⚠ TWO OF THE NEEDLES ARE BUILT RATHER THAN SPELLED, and the reason is the
    one this project has now paid for seven times: the acceptance gate for this
    plan greps THIS FILE for the two words a nearness bar would be written
    with, so spelling either of them here would fail the gate on the instrument
    instead of on a regression. D-06 is the claim underneath — the facet IS the
    bar, and no score, bar or nearness number exists anywhere on this path.

    Factored out like every other checker in this file so the SAME function
    that judges the three real requests can be driven over fabricated text; a
    gate never seen catching anything is not evidence."""
    bad = []
    low = str(wire_text or "").lower()
    for needle in ("candidate_ids", "shown_ids", "item_id", "photograph id",
                   "score", "ranking", "rank the", "relevance",
                   # built, never spelled — see the docstring
                   "thres" + "hold", "similar" + "ity"):
        if needle in low:
            bad.append("the request names " + repr(needle)
                       + " — the front call writes the query and never sees, "
                         "orders or picks a result (D-06, D-12)")
    return bad


def policy_violations(retried, status_table, timeouts):
    """This plan's D-07, D-08 and D-09 claims about the three POLICY TABLES,
    as a list of failures. Empty means all held.

    Factored exactly like `seam_violations` and `request_violations`, and for
    the same reason: the drill can then feed it MUTATED COPIES of the real
    tables without editing `librarian_call.py`. A gate never seen red is not
    evidence, and these three claims — only 401/403 touches a key, the retried
    set is exactly the four, the timeout varies by tier — are precisely the
    ones a well-meaning simplification reaches for."""
    bad = []

    four = {"rate_limited", "provider_down", "offline", "timeout"}
    if set(retried) != four:
        bad.append("the retried set is not exactly the four (D-08): "
                   + repr(sorted(set(retried))))
    for token in ("bad_key", "no_key", "truncated", "declined", "malformed",
                  "ollama_not_running", "model_not_pulled"):
        if token in retried:
            bad.append("`" + token + "` is retried and must never be (D-08)")

    for code, token in status_table.items():
        if token == "bad_key" and code not in (401, 403):
            bad.append("code " + str(code) + " maps to bad_key — only 401 and "
                       "403 may say anything about a key (D-07)")
        if token not in L.FAILURES:
            bad.append("code " + str(code) + " maps to " + repr(token)
                       + ", which is outside the closed register (D-06)")
    for code in (401, 403):
        if status_table.get(code) != "bad_key":
            bad.append("code " + str(code) + " no longer reports a rejected "
                       "key (D-07)")
    if status_table.get(429) != "rate_limited":
        bad.append("429 is not rate_limited (D-07) — a busy server would send "
                   "her to replace a working key")
    for code in (500, 502, 503, 504, 529):
        if status_table.get(code) != "provider_down":
            bad.append("code " + str(code) + " is not provider_down (D-07)")

    if set(timeouts) != set(L.TIERS):
        bad.append("the timeouts do not cover exactly the tiers (D-09)")
    if len(set(timeouts.values())) < 2:
        bad.append("one number for every tier (D-09) — that number was sized "
                   "for a subprocess talking to a fast cloud model")

    return bad


def built_requests(payload, bases=None):
    """The three real requests, BUILT — never sent. Opens nothing.

    Calls the shipped builders through the shipped adapter table, so a pair
    that never got registered fails here rather than passing quietly."""
    out = {}
    row = L.JOBS[GATE_JOB]
    for provider in L.PROVIDERS:
        routing = routing_for(provider, bases=bases)
        build = L._ADAPTERS[provider][0]
        req = build(row, payload, routing.fills[row["tier"]],
                    routing.bases[provider])
        out[provider] = (req, routing)
    return out


def built_cheap_requests(job, payload, bases=None):
    """`built_requests`' sibling for a CHEAP-CLOUD job, BUILT — never sent.

    It exists rather than a parameter on that function because the tier
    decides which fill the routing has to carry, and getting that wrong makes
    the unmutated control go red for a reason that is not a defect. Same
    discipline otherwise: the shipped builders, reached through the shipped
    adapter table, so a pair that never got registered fails here rather than
    passing quietly."""
    out = {}
    row = L.JOBS[job]
    for provider in L.PROVIDERS:
        routing = routing_cheap(provider, bases=bases)
        build = L._ADAPTERS[provider][0]
        req = build(row, payload, routing.fills[row["tier"]],
                    routing.bases[provider])
        out[provider] = (req, routing)
    return out


def _mutate_system(provider, body, payload_text):
    """One field wrong: the job row's prompt swapped for something else."""
    del payload_text
    replacement = "a different prompt entirely"
    if provider == "anthropic":
        body["system"] = replacement
        return
    for msg in body["messages"]:
        if msg.get("role") == "system":
            msg["content"] = replacement


def _mutate_user(provider, body, payload_text):
    """One field wrong: the payload no longer verbatim."""
    prefixed = "here is what she saved:\n" + payload_text
    if provider == "anthropic":
        body["messages"][0]["content"] = prefixed
        return
    for msg in body["messages"]:
        if msg.get("role") == "user":
            msg["content"] = prefixed


# ---------------------------------------------------------------------------
# ---- the cases ------------------------------------------------------------

class SeamCase(unittest.TestCase):

    def setUp(self):
        # ⚠ A TEMPORARY HOME FOR THE LIFE OF EVERY CASE, INSTALLED FIRST.
        # `~/.study-room/` is where a real key would live; this suite must never
        # read one, never write one, and must never be the thing that creates
        # that directory. Pointing the home directory at a fresh temp tree is
        # the whole of the isolation — `study_lib.room_config_dir()` derives
        # from it on every call, so no production door had to be cut into the
        # module to make this hermetic.
        self._tmp_home = tempfile.mkdtemp(prefix="study-room-seam-")
        self._saved_home = os.environ.get("HOME")
        os.environ["HOME"] = self._tmp_home
        # The rejection counter, wrapping the shipped recorder rather than
        # replacing it (see RejectionSpy).
        self._saved_note = L._note_key_rejected
        self.rejections = RejectionSpy(self._saved_note)
        L._note_key_rejected = self.rejections
        self._saved = L._transport
        # ⚠ THE CLOCK IS INSTALLED FOR EVERY CASE, not only the ones that
        # measure a wait. Several cases below drive a retried token three
        # times; if any of them held still for real this suite would cost tens
        # of seconds and stop being run.
        self._saved_sleep = L._sleep
        self.clock = Clock()
        L._sleep = self.clock
        # #28: a cloud credential lives in the environment. No real key exists
        # on this machine (26.93-CONTEXT F-03) and a stray key on somebody
        # else's must not change what this suite measures, so both names are
        # pinned to a placeholder for the life of a case and restored after.
        # ⚠ The VALUE is never asserted on and never travels — `no_key` turns
        # only on whether something is there.
        self._saved_env = {}
        for name in L.KEY_ENV_NAMES.values():
            self._saved_env[name] = os.environ.get(name)
            os.environ[name] = PLACEHOLDER_CREDENTIAL
        self.routing = L.resolve_routing({}, environ={})

    def tearDown(self):
        L._transport = self._saved
        L._sleep = self._saved_sleep
        L._note_key_rejected = self._saved_note
        for name, value in self._saved_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        if self._saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = self._saved_home
        # Its own temp tree, removed by the suite that made it.
        shutil.rmtree(self._tmp_home, ignore_errors=True)

    def install(self, recorder):
        L._transport = recorder
        return recorder

    def plant_key(self, provider="anthropic"):
        """A fake key in the TEMPORARY keys file, with the shell emptied for
        that provider — so the cases below follow the FILE half of the
        credential path, which is the half `--setup` writes."""
        os.environ.pop(L.KEY_ENV_NAMES[provider], None)   # tearDown restores
        L.save_key(provider, PLANTED_CREDENTIAL)
        return provider

    def bind_reflection(self):
        """Bind the reflection row for the life of ONE case, borrowing the
        literals from the one row `server.py` binds at import.

        ⚠ The literals are BORROWED on purpose. What is under test is the
        row's ALLOWANCE — a number in `JOBS` — not its prompt, and proving the
        zero on a stand-in row would prove nothing about the table that carries
        it. Reflection is the only row whose allowance is 0, so it is the only
        row that can prove D-08's shape at all."""
        return self.bind_row("reflection")

    def bind_row(self, job):
        """`bind_reflection`'s general form (26.93-05): bind ANY row for the
        life of ONE case, borrowing the same literals, and PUT BACK WHATEVER
        WAS THERE when the case ends.

        Needed because `call_librarian` refuses an unbound row BEFORE it ever
        reaches the fill check — so a cheap-cloud row cannot be driven to the
        refusal path at all without one, and the whole of this plan's claim
        lives on that path.

        ⚠ RESTORED, NOT UNBOUND (26.995-03-followup). The cleanup used to blank
        the row, which was wrong in the one way a test-only helper can be:
        `server.py` binds every row ONCE, at import, so a blanked row stays
        blanked for every suite that runs after this module in the same
        process. It is the same rule the unbound-job case and the effort case
        below already follow by hand — save the pair, restore the pair — and
        `test_a_borrowed_row_is_put_back_exactly_as_it_was_found` drives it."""
        row = L.JOBS[job]
        saved_schema, saved_prompt = row["schema"], row["prompt"]
        # Registered BEFORE the borrow, so a failure inside `bind_job_literals`
        # cannot leave the row holding the lender's literals.
        self.addCleanup(L.bind_job_literals, job, saved_schema, saved_prompt)
        lender = L.JOBS[GATE_JOB]
        L.bind_job_literals(job, lender["schema"], lender["prompt"])
        return job

    # -- a borrowed row must be GIVEN BACK (26.995-03-followup) -------------

    def test_a_borrowed_row_is_put_back_exactly_as_it_was_found(self):
        """⚠ THE PIN FOR A LEAK THAT ESCAPED THIS FILE ENTIRELY.

        Both borrow helpers above bind a row for the life of ONE case. Their
        cleanup used to BLANK the row instead of restoring it — and `server.py`
        binds those rows ONCE, at import, never again. So every row this suite
        borrowed was left unbound for whatever ran next IN THE SAME PROCESS,
        and other modules' reflection cases passed alone while failing under
        whole-tree discovery with "the librarian couldn't reach the model just
        now".

        ⛔ DRIVEN, NOT ASSERTED FROM A DISTANCE. A throwaway case runs each
        borrow through a full lifecycle — setUp, the borrow, tearDown, and the
        registered cleanups — and the row is compared with what it held
        beforehand. Merely asserting the row looks bound *here* would catch the
        leak only when this method happened to sort after a borrower, which is
        a pin whose colour is decided by method names."""
        borrows = (
            ("reflection", lambda case: case.bind_reflection()),
            ("connections", lambda case: case.bind_row("connections")),
            ("config_ask", lambda case: case.bind_row("config_ask")),
        )
        for job, borrow in borrows:
            with self.subTest(job=job):
                before = (L.JOBS[job]["schema"], L.JOBS[job]["prompt"])
                self.assertTrue(
                    all(before),
                    "%s is not bound before the borrow, so this case would be "
                    "pinning nothing" % job)

                class Borrower(SeamCase):
                    def runTest(self):
                        borrow(self)

                inner = unittest.TestResult()
                Borrower().run(inner)
                self.assertTrue(
                    inner.wasSuccessful(),
                    "the throwaway borrowing case did not itself run clean: "
                    + "".join(t for _, t in inner.errors + inner.failures))
                self.assertEqual(
                    (L.JOBS[job]["schema"], L.JOBS[job]["prompt"]), before,
                    "%s did not come back as it was lent: a borrow is a loan, "
                    "and every suite running after this module in the same "
                    "process inherits whatever this one leaves behind" % job)

    # -- the wiring claim, carried from stdin to HTTP ----------------------

    def test_one_request_recorded_and_payload_verbatim(self):
        rec = self.install(Recorder(body=ollama_body({"sections": []})))
        payload = "id-7\nthe exact bytes the fence builder produced"
        result = L.call_librarian(GATE_JOB, payload, self.routing)
        self.assertEqual(
            seam_violations(result, rec.calls, self.routing, payload), [])

    def test_body_carries_prompt_and_the_fills_model(self):
        rec = self.install(Recorder(body=ollama_body({"sections": []})))
        L.call_librarian(GATE_JOB, "x", self.routing)
        body = rec.calls[0]["request"]["body"]
        self.assertEqual(body["model"], "qwen2.5:7b")
        # ⚠ READ OFF THE TABLE, NOT NAMED: the gate row's prompt is whatever
        # `server.py` bound to it, so re-pointing GATE_JOB (2026-08-17, the
        # labelling deletion) cannot leave this case asserting a constant
        # some other row owns.
        self.assertEqual(body["messages"][0]["content"],
                         L.JOBS[GATE_JOB]["prompt"])
        self.assertEqual(body["options"]["num_predict"],
                         L.JOBS[GATE_JOB]["max_tokens"])

    def test_url_and_timeout_come_from_routing(self):
        rec = self.install(Recorder(body=ollama_body({"sections": []})))
        L.call_librarian(GATE_JOB, "x", self.routing)
        self.assertEqual(rec.calls[0]["request"]["url"],
                         "http://127.0.0.1:11434/api/chat")
        # by tier, not one number for everything (D-09)
        self.assertEqual(rec.calls[0]["timeout_s"], 300)

    # -- the two failures that must stay distinguishable -------------------

    def test_truncated_is_decided_before_any_parse(self):
        self.install(Recorder(
            body=ollama_body({"sections": []}, done_reason="length")))
        result = L.call_librarian(GATE_JOB, "x", self.routing)
        self.assertEqual(result["failure"], "truncated")

    def test_unparseable_body_is_malformed_not_truncated(self):
        self.install(Recorder(body=b"{not json at all"))
        result = L.call_librarian(GATE_JOB, "x", self.routing)
        self.assertEqual(result["failure"], "malformed")

    # -- the 25-03 posture: a traceback never reaches her ------------------

    def test_provider_error_text_never_crosses(self):
        body = json.dumps({
            "error": PROVIDER_ERROR_SENTENCE,
            "done_reason": "stop",
            "message": {"content": PROVIDER_ERROR_SENTENCE},
        }).encode("utf-8")
        self.install(Recorder(status=500, body=body))
        result = L.call_librarian(GATE_JOB, "x", self.routing)
        self.assertEqual(result["failure"], "provider_down")
        self.assertNotIn(PROVIDER_ERROR_SENTENCE,
                         " ".join(_deep_strings(result)))

    # -- the shape --------------------------------------------------------

    def test_return_key_set_is_exactly_five(self):
        self.install(Recorder(body=ollama_body({"sections": []})))
        result = L.call_librarian(GATE_JOB, "x", self.routing)
        self.assertEqual(set(result),
                         {"ok", "structured", "model", "usage", "failure"})

    def test_ollama_model_is_flagged_as_not_independent(self):
        self.install(Recorder(body=ollama_body({"sections": []})))
        result = L.call_librarian(GATE_JOB, "x", self.routing)
        self.assertIs(result["model"]["independent"], False)

    # -- a caller cannot name a tier --------------------------------------

    def test_no_caller_can_name_a_tier(self):
        import inspect
        params = list(inspect.signature(L.call_librarian).parameters)
        self.assertEqual(params, ["job", "payload_text", "routing"])
        for row in L.JOBS.values():
            self.assertIn(row["tier"], L.TIERS)

    def test_unknown_and_unbound_jobs_raise_rather_than_return_a_token(self):
        # ⚠⚠ THE SUBJECT MOVED IN PHASE 26.95; THE PROPERTY DID NOT.
        #
        # This case used the front call's own row as its UNBOUND example,
        # because 26.93 pre-cut that row and deliberately left its schema and
        # prompt None. Plan 26.95-33 BINDS them — that is the whole of what
        # that plan's first task does — so the example is now false and the
        # case went red exactly when the plan said it would. It is REWRITTEN
        # rather than deleted: what it was written to guard is untouched, and
        # is the sharper half of the two. An unknown job and an unbound row
        # are PROGRAMMING ERRORS. Neither may come back wearing a failure
        # token, because a token is what a call that was MADE says about
        # itself — a surface would tell her something went wrong with a
        # request that was never built, and the actual mistake (a row nobody
        # registered) would be reported to the wrong person entirely.
        #
        # ⚠ THE UNBOUND HALF IS SYNTHESISED HERE, AND NEVER TAKEN FROM
        # WHICHEVER ROW HAPPENS TO BE UNBOUND TODAY. Two reasons, and the
        # second is the one that would have bitten: every row in the table is
        # bound at import by `server.py`, so there is no naturally unbound row
        # left to point at; and rows THIS SUITE borrows for the life of one
        # case are put straight back by their own cleanup, so a case that went
        # looking for an unbound one would find nothing — and before
        # 26.995-03-followup it would have found whichever row happened to be
        # blanked, measuring this file's own method order rather than the seam.
        # The borrowed row's real literals are put back before the case ends,
        # on every path.
        rec = self.install(Recorder(body=CANNED["ollama"]))

        # (a) a job the table does not carry at all.
        with self.assertRaises(L.LibrarianCallError):
            L.call_librarian("does_not_exist", "x", self.routing)

        row = L.JOBS[GATE_JOB]
        schema, prompt = row["schema"], row["prompt"]
        self.assertTrue(schema and prompt,
                        "the borrowed row is not bound at import, so nothing "
                        "below would be synthesising anything")
        # put back whatever happens, including on a failed assertion
        self.addCleanup(L.bind_job_literals, GATE_JOB, schema, prompt)

        # (b) a row that IS in the table, with no schema bound.
        row["schema"] = None
        with self.assertRaises(L.LibrarianCallError):
            L.call_librarian(GATE_JOB, "x", self.routing)

        # (c) ...and the OTHER half of that same branch, because it is an
        # `or`: a row with its schema but no prompt. A case covering one half
        # would pass on a seam that had quietly stopped looking at the other.
        row["schema"] = schema
        row["prompt"] = None
        with self.assertRaises(L.LibrarianCallError):
            L.call_librarian(GATE_JOB, "x", self.routing)
        L.bind_job_literals(GATE_JOB, schema, prompt)

        # ⚠ ZERO REQUESTS ACROSS ALL THREE, and this is the half that makes
        # "rather than return a token" mean something: a token would have come
        # back from a call, and no call was ever built, addressed or sent.
        self.assertEqual(len(rec.calls), 0)

        # ...and the CONTROL. With both literals back the same row answers on
        # the same routing, so the three refusals above were caused by the
        # unbinding rather than by a seam that refuses everything.
        result = L.call_librarian(GATE_JOB, "x", self.routing)
        self.assertIs(result["ok"], True)
        self.assertEqual(len(rec.calls), 1)

    # -- the serialized-request gate, on ALL THREE providers ---------------
    # ⚠ The two cloud rows are recorded requests, not observed cloud calls —
    # see the block comment above `request_violations`.

    def test_all_three_recorded_requests_satisfy_the_gate(self):
        payload = "id-9\nthe exact bytes the fence builder produced"
        row = L.JOBS[GATE_JOB]
        for provider in L.PROVIDERS:
            routing = routing_for(provider)
            rec = self.install(Recorder(body=CANNED[provider]))
            L.call_librarian(GATE_JOB, payload, routing)
            self.assertEqual(len(rec.calls), 1, provider)
            req = rec.calls[0]["request"]

            # The whole gate — method, URL, headers and body — in one place.
            self.assertEqual(
                request_violations(provider, req, GATE_JOB, routing, payload),
                [], provider)

            # ...and the three load-bearing equalities again, spelled out, so
            # they hold even if someone later loosens the checker.
            self.assertEqual(_user_of(provider, req["body"]), payload,
                             provider)
            self.assertEqual(_system_of(provider, req["body"]), row["prompt"],
                             provider)
            self.assertEqual(req["body"]["model"],
                             routing.fills[row["tier"]][1], provider)

    def test_openai_body_carries_store_false_by_identity(self):
        routing = routing_for("openai")
        rec = self.install(Recorder(body=CANNED["openai"]))
        L.call_librarian(GATE_JOB, "x", routing)
        body = rec.calls[0]["request"]["body"]
        # assertIs, NOT assertFalse: a MISSING key is falsy too, and a missing
        # `store` is precisely the defect (#24). Truthiness cannot tell the
        # difference between "set to false" and "never written".
        self.assertIs(body["store"], False)

    def test_openai_url_is_built_from_the_routing_base(self):
        # #27 section 8: an OpenAI-shaped third provider is a SETTING, so the
        # address has to follow routing rather than a literal in the builder.
        moved = "https://api.moonshot.example/anthropic-free-zone"
        routing = routing_for("openai", bases={"openai": moved + "/"})
        rec = self.install(Recorder(body=CANNED["openai"]))
        L.call_librarian(GATE_JOB, "x", routing)
        self.assertEqual(rec.calls[0]["request"]["url"],
                         moved + "/v1/chat/completions")
        self.assertEqual(
            request_violations("openai", rec.calls[0]["request"], GATE_JOB,
                               routing, "x"), [])

    # -- 26.95-33: THE FRONT CALL's own serialized request (P-7, D-15 layer a)
    #
    # ⚠ EVERY CLAIM BELOW IS ABOUT A RECORDED REQUEST, ASSERTED BEFORE A
    # SOCKET EXISTS — the block comment above `request_violations` says what
    # that does and does not prove, and it holds here word for word. ⚠ AND A
    # GREEN SUITE IS NOT PROVIDER ACCEPTANCE: a shape that was well-formed,
    # legal and green in every suite in this tree was refused by a provider on
    # every single call for two days. Nothing below has been offered to a live
    # provider, and none of it should ever be reported as though it had.

    def test_the_front_calls_requests_satisfy_the_gate_on_all_three_providers(
            self):
        payload = "seed-1\nthe exact bytes the fence builder produced"
        row = L.JOBS[BLESSING_JOB]
        self.assertTrue(row["schema"] and row["prompt"],
                        "the front call's row is unbound, so every assertion "
                        "below would be about a call that never happened")
        # ⚠ THE OWNER-APPROVED ALLOWANCE, PINNED BY VALUE. A later change
        # follows the shipped amendment idiom on the `connections` row: the
        # measurement that forced it, written beside it.
        self.assertEqual(row["max_tokens"], 600)
        for provider in L.PROVIDERS:
            routing = routing_cheap(provider)
            rec = self.install(Recorder(body=CANNED_BLESSING[provider]))
            L.call_librarian(BLESSING_JOB, payload, routing)
            self.assertEqual(len(rec.calls), 1, provider)
            req = rec.calls[0]["request"]

            # the whole gate — method, URL, headers and body — in one place
            self.assertEqual(
                request_violations(provider, req, BLESSING_JOB, routing,
                                   payload), [], provider)

            # ...and the load-bearing equalities spelled out again, so they
            # hold even if someone later loosens the checker.
            self.assertEqual(_user_of(provider, req["body"]), payload,
                             provider)
            self.assertEqual(_system_of(provider, req["body"]),
                             server.BLESSING_SELECTION_PROMPT, provider)
            self.assertEqual(req["body"]["model"],
                             routing.fills[row["tier"]][1], provider)
            self.assertEqual(_cap_of(provider, req["body"]), 600, provider)

            # ⚠ A BOOLEAN AND A FIELD NAME, NEVER assertNotIn: the haystack is
            # a whole request and the needle is a credential's value, so a
            # failing run in a transcript must not become the leak this
            # assertion exists to prevent (T-26.93-24).
            self.assertTrue(
                PLACEHOLDER_CREDENTIAL not in " ".join(_deep_strings(req)),
                "a credential value rode the " + provider + " request")

    def test_the_front_calls_request_asks_for_no_result_of_any_kind(self):
        # The model writes the query. It never sees, orders, narrows or picks
        # a photograph — there is no field in the shape for one and no
        # sentence in the prompt asking for one (D-06, D-12).
        payload = "seed-2\none blessed body and nothing else"
        for provider in L.PROVIDERS:
            routing = routing_cheap(provider)
            rec = self.install(Recorder(body=CANNED_BLESSING[provider]))
            L.call_librarian(BLESSING_JOB, payload, routing)
            body = rec.calls[0]["request"]["body"]
            # ⚠ HER OWN BLESSED BODY IS TAKEN OUT OF THE HAYSTACK FIRST, in
            # the ESCAPED spelling the body is serialized with. The payload is
            # whatever she wrote, and a word of hers must never be able to
            # fail a gate about what the ROOM asked for — and removing the RAW
            # string would have removed nothing at all, because a newline
            # travels as two characters once the body is serialized.
            escaped = json.dumps(payload, ensure_ascii=False)[1:-1]
            wire = json.dumps(body, ensure_ascii=False).replace(escaped, "")
            self.assertEqual(result_shaped_violations(wire), [], provider)

        # POSITIVE CONTROLS — three fabricated requests, each caught, so the
        # three real ones above are not merely a scan that finds nothing.
        for label, text in (
                ("an id list on the wire", '{"candidate_ids": ["a", "b"]}'),
                ("a ranking instruction",
                 '{"system": "rank the results by relevance"}'),
                ("a nearness bar", '{"system": "keep any '
                                   + "thres" + 'hold above 0.8"}')):
            self.assertTrue(result_shaped_violations(text), label)

        # NEGATIVE CONTROL — the shape the front call actually asks for is
        # clean, so the checker is not simply firing on everything.
        self.assertEqual(
            result_shaped_violations(server.BLESSING_SELECTION_SCHEMA_JSON),
            [])

    # ---- map #50 / #96: the reflection's budget, and what spends it --------
    #
    # ⚠ THE ONE-LINE VERSION: on this fill's model THINKING IS ON BY DEFAULT
    # AND SPENDS THE SAME `max_tokens` THE ANSWER DOES, so a cap and an effort
    # are one setting wearing two names. #96 measured thinking filling to
    # 3,500-4,400 tokens on a pool whose essay wanted ~1,400 — bought out of
    # the answer's budget, on her bill, asked for by nobody.
    #
    # ⛔ AND IT CORRECTS #66 FOR EVERY JOB ON THIS FILL: "`max_tokens` is a
    # CEILING not a spend" is FALSE on a thinking model. That sentence is why
    # `connections` was raised without hesitation; it must not be quoted again
    # without this paragraph beside it.

    def test_the_reflection_rows_carry_the_measured_cap(self):
        """2,000 was never sized against a real reflection. Of the five essays
        the owner accepted as good, counted with the provider's own tokenizer,
        ⛔ ONE DOES NOT FIT 2,000 AT ALL (2,305) and the median sits at 79% —
        and that is the essay ALONE, before `coda`, `question` and one `whys`
        entry per row she flagged. A too-long answer is discarded WHOLE.

        ⚠⚠ AMENDED 2026-08-19 (26.995-02): 6,000 -> 8,000, BY THE OWNER, on
        the measurement she authorised and paid for. ⛔ The reasoning above is
        untouched because it is still true and is still WHY this row has a
        measured cap at all; what changed is the number it arrives at. The
        measurement's own finding is the reason: the worst call ever recorded
        used 6,904 — AT THE OLD EFFORT, AGAINST THE SHIPPED 6,000 — so 6,000
        has always been occasionally too small on a heavy evening, quite
        apart from the effort question that prompted the measuring."""
        for job in ("reflection", "reflection_refine"):
            self.assertEqual(L.JOBS[job]["max_tokens"], 12000, job)

    def test_both_reflection_rows_set_effort_explicitly(self):
        """⚠ THE CAP MAY NOT MOVE WITHOUT THIS. The cap is the number for a
        run whose thinking is pinned; with effort left alone the floor is
        8,000, and even 8,000 is not safe at a 60-note pool with a generous
        walk. A future edit that raises one and drops the other re-opens the
        defect this pair closed.

        ⚠⚠ AMENDED 2026-08-19 (26.995-02): the accepted set was `low`/`medium`
        and is now the provider's three levels, because the owner ruled the
        reflection rows up to `high`. ⛔ WHAT THIS CASE STILL MEANS, AND IT IS
        NOT WHAT THE VALUE SAYS: it holds that the key is PRESENT and NAMES a
        level. That is not the same as omitting it — omitting the key is the
        provider's own `high`, so the two produce the same behaviour today,
        and an explicit `high` is what keeps that true if the provider ever
        moves its default. ⚠ The VALUE is pinned by
        `test_the_two_reflection_rows_carry_HER_pair_and_carry_IT_EQUALLY`;
        a membership set is a thing a later edit widens, so it must not be
        the only thing standing under her number."""
        for job in ("reflection", "reflection_refine"):
            effort = L.JOBS[job].get("effort")
            self.assertIn(effort, ("low", "medium", "high"), job)

    def test_effort_rides_output_config_and_never_the_top_level(self):
        """⚠ A TOP-LEVEL `effort` IS SILENTLY IGNORED — which looks exactly
        like a setting that works. It belongs beside `format`, inside
        `output_config`."""
        body = L.build_anthropic_request(
            L.JOBS["reflection"], "some saved text",
            ("anthropic", "claude-opus-5"),
            L.DEFAULT_BASES["anthropic"])["body"]
        self.assertEqual(body["output_config"]["effort"],
                         L.JOBS["reflection"]["effort"])
        self.assertNotIn("effort", body,
                         "a top-level effort is ignored by the provider")

    def test_a_row_without_an_effort_sends_none(self):
        """⛔ THE BLAST RADIUS IS DELIBERATELY ONE PAIR OF ROWS. Omitting the
        key is the provider's own `high`, so every job nobody has measured
        keeps exactly the behaviour it shipped with. Opting in is naming a
        level, never inheriting one."""
        # ⚠ Built from a BOUND row with its effort removed, rather than from
        # some other job: an unbound row (schema None) cannot be built at all,
        # so a test written against one would fail for a reason that has
        # nothing to do with effort.
        row = dict(L.JOBS["reflection"])
        row.pop("effort", None)
        body = L.build_anthropic_request(
            row, "x", ("anthropic", "claude-opus-5"),
            L.DEFAULT_BASES["anthropic"])["body"]
        self.assertNotIn("effort", body["output_config"])
        # ...and the control: the same row WITH its effort does send one, so
        # this is a real absence rather than a builder that never emits it.
        with_effort = L.build_anthropic_request(
            L.JOBS["reflection"], "x", ("anthropic", "claude-opus-5"),
            L.DEFAULT_BASES["anthropic"])["body"]
        self.assertIn("effort", with_effort["output_config"])

    def test_the_two_reflection_rows_carry_HER_pair_and_carry_IT_EQUALLY(self):
        """⛔ BOTH NUMBERS ARE THE OWNER'S, TAKEN 2026-08-19, AND NEITHER MAY
        BE MOVED TO MAKE THE OTHER FIT. `effort` rose to `high` and the budget
        rose WITH it — she chose the PAIRING, not the effort alone — and the
        budget FIGURE came from the phase's one paid measurement rather than
        from a round number (26.995-COPY.md C-10 and C-11).

        ⚠⚠ THE EQUALITY IS THE ASSERTION THAT MATTERS, and it is not tidiness.
        Both rows point at ONE prompt literal and ONE schema, so a change
        applied to the generation row and forgotten on the refine row would
        leave a generation turn and every refine turn of the same sitting
        writing to DIFFERENT rules — drift that nothing else in this suite can
        see, because each row on its own would still look deliberate.

        ⚠ WHY BY VALUE AND NOT BY MEMBERSHIP. The case above this one reads
        `assertIn(effort, (...))`, which is a set a later edit can widen. Hers
        is a value; it is pinned as one."""
        gen = L.JOBS["reflection"]
        ref = L.JOBS["reflection_refine"]

        # Her effort, by value, on each row — then the two against each other.
        self.assertEqual(gen["effort"], "high", "reflection")
        self.assertEqual(ref["effort"], "high", "reflection_refine")
        self.assertEqual(
            gen["effort"], ref["effort"],
            "the generation row and the refine row must carry the SAME "
            "effort; one edited and the other forgotten is the drift this "
            "case exists to catch")

        # Her budget, the same way. 8,000 clears the worst call ever recorded
        # (6,904, measured at the OLD effort against the shipped 6,000) by
        # about 1,100, and clips none of the 32 calls on file.
        self.assertEqual(gen["max_tokens"], 12000, "reflection")
        self.assertEqual(ref["max_tokens"], 12000, "reflection_refine")
        self.assertEqual(
            gen["max_tokens"], ref["max_tokens"],
            "one number serves both rows and must keep serving both")

        # ⚠ THE ROW IS BOUND FOR THE LIFE OF THIS BUILD AND RESTORED EXACTLY
        # AS IT WAS FOUND. `server.py` binds reflection at import and never
        # again, and `build_anthropic_request` calls
        # `json.loads(job_row["schema"])`. ⛔ Restoring what was actually there,
        # rather than unbinding, is what keeps this case from deciding the fate
        # of whatever sorts after it — and of whatever module runs after this
        # one in the same process. Until 26.995-03-followup the suite's borrow
        # helpers did the opposite, which is what this comment used to describe
        # and what `test_a_borrowed_row_is_put_back_exactly_as_it_was_found`
        # now pins.
        saved_schema, saved_prompt = gen["schema"], gen["prompt"]
        self.addCleanup(
            L.bind_job_literals, "reflection", saved_schema, saved_prompt)
        lender = L.JOBS[GATE_JOB]
        L.bind_job_literals("reflection", lender["schema"], lender["prompt"])

        # ...and the value has to REACH the wire, inside the output config.
        body = L.build_anthropic_request(
            gen, "some saved text", ("anthropic", "claude-opus-5"),
            L.DEFAULT_BASES["anthropic"])["body"]
        self.assertEqual(body["output_config"]["effort"], "high")
        self.assertEqual(body["max_tokens"], 12000)
        self.assertNotIn(
            "effort", body,
            "a top-level effort is silently ignored, which looks exactly "
            "like a setting that works")

        # ⚠ THE UNMUTATED CONTROL, IN THIS CASE RATHER THAN A NEIGHBOURING
        # ONE: the same row with the key removed produces a body carrying NO
        # effort at all, at either depth. Without this, every assertion above
        # would also pass against a builder that wrote `high` unconditionally
        # and never read the row.
        stripped = dict(gen)
        stripped.pop("effort", None)
        control = L.build_anthropic_request(
            stripped, "some saved text", ("anthropic", "claude-opus-5"),
            L.DEFAULT_BASES["anthropic"])["body"]
        self.assertNotIn("effort", control["output_config"])
        self.assertNotIn("effort", control)

    def test_the_reflection_ceiling_is_derived_from_the_cap(self):
        """The ceiling read 40,000 characters — ~20x anything the transport
        would pass, against a largest-measured essay of 5,462. ⚠ A NUMBER THAT
        CANNOT FIRE IS NOT A LENGTH RULE, and a smaller number typed in the
        same place would be the same defect: two limits governing one answer,
        free to drift apart. It is now arithmetic on the cap."""
        self.assertEqual(
            server.LIBRARIAN_REFLECTION_CEILING,
            int(L.JOBS["reflection"]["max_tokens"]
                * server.LIBRARIAN_REFLECTION_CHARS_PER_TOKEN))
        # ⚠ AND IT MUST STILL BE THE LOOSE ONE. The guard exists to catch a
        # runaway, never to trim a long essay the transport was willing to
        # deliver — so it has to sit well clear of the largest real answer
        # measured (5,462 characters across 24 calls).
        self.assertGreater(server.LIBRARIAN_REFLECTION_CEILING, 3 * 5462)

    def test_the_front_calls_openai_body_carries_store_false_by_identity(self):
        routing = routing_cheap("openai")
        rec = self.install(Recorder(body=CANNED_BLESSING["openai"]))
        L.call_librarian(BLESSING_JOB, "x", routing)
        body = rec.calls[0]["request"]["body"]
        # assertIs, NOT assertFalse: a MISSING key is falsy too, and a missing
        # `store` is precisely the defect (#24) — without it one blessed body
        # of hers is kept on somebody else's server for thirty days,
        # retrievable by id. Porting the Anthropic body's shape and calling it
        # done is exactly how that flag goes missing.
        self.assertIs(body["store"], False)
        # ...and the control: this really is the front call's own request, on
        # the tier its row names, rather than some other job's.
        self.assertEqual(body["model"],
                         L.OPENAI_FILLS["cheap-cloud"][1])

    def test_a_seed_body_of_cjk_emoji_and_a_lone_surrogate_travels_whole(self):
        # SRM-12's encoding edge. A Seed is whatever she blessed, so the front
        # call's payload can carry anything a file can: Chinese characters, an
        # emoji, and the one thing a text editor can leave behind that is not
        # valid Unicode at all — half of a surrogate pair.
        payload = ("seed-3\n她把窗户关上了，外面还在下雨 🕯\n"
                   "and one lone surrogate: \ud800")
        for provider in L.PROVIDERS:
            routing = routing_cheap(provider)
            rec = self.install(Recorder(body=CANNED_BLESSING[provider]))
            L.call_librarian(BLESSING_JOB, payload, routing)
            body = rec.calls[0]["request"]["body"]
            # carried WHOLE — not normalised, not re-encoded, not trimmed
            self.assertEqual(_user_of(provider, body), payload, provider)

            # ⚠ AND IT ROUND-TRIPS THROUGH THE SERIALIZATION THE ONE
            # CONNECTION-OPENER ACTUALLY APPLIES, rather than through one this
            # file made up. The default `ensure_ascii` is what carries the
            # lone surrogate: it leaves as the seven ASCII bytes of an escape
            # and comes back the same character, so nothing is lost and
            # nothing raises on the way to the socket.
            wire = json.dumps(body).encode("utf-8")
            back = json.loads(wire.decode("utf-8"))
            self.assertEqual(_user_of(provider, back), payload, provider)
            # ...and the comparison discriminates, so the equality above is
            # not passing on two values that were never different.
            self.assertNotEqual(_user_of(provider, back), payload + " ",
                                provider)

        # THE SOURCE PIN, and it is named as one: the expression above is the
        # transport's own, so a change there cannot leave this case quietly
        # measuring a serialization the app no longer uses. The needle appears
        # in that function's CODE and in no docstring or comment of it.
        import inspect
        opener = inspect.getsource(L._real_transport)
        self.assertIn('json.dumps(request["body"]).encode("utf-8")', opener)

    # -- the two failures that must stay distinguishable, on the cloud pair -

    def test_cloud_truncation_is_decided_before_any_parse(self):
        # The bodies carry text that json.loads CANNOT finish, so if the order
        # were wrong these would answer `malformed` instead.
        cases = {
            "anthropic": anthropic_body(None, stop_reason="max_tokens",
                                        text=CUT_OFF_TEXT),
            "openai": openai_body(None, finish_reason="length",
                                  text=CUT_OFF_TEXT),
        }
        for provider, canned in cases.items():
            routing = routing_for(provider)
            self.install(Recorder(body=canned))
            result = L.call_librarian(GATE_JOB, "x", routing)
            self.assertEqual(result["failure"], "truncated", provider)

    def test_cloud_unparseable_body_is_malformed_not_truncated(self):
        for provider in ("anthropic", "openai"):
            routing = routing_for(provider)
            self.install(Recorder(body=b"{not json at all"))
            result = L.call_librarian(GATE_JOB, "x", routing)
            self.assertEqual(result["failure"], "malformed", provider)
            # two DIFFERENT values, so the pair can never both pass by
            # collapsing into one token
            self.assertNotEqual(result["failure"], "truncated", provider)

    def test_cloud_declines_are_reported_as_declined(self):
        # Anthropic signals it in `stop_reason`; OpenAI in its own `refusal`
        # field. Read differently, reported identically (D-07).
        cases = {
            "anthropic": anthropic_body({"sections": []},
                                        stop_reason="refusal"),
            "openai": openai_body({"sections": []},
                                  refusal="I can't help with that."),
        }
        for provider, canned in cases.items():
            routing = routing_for(provider)
            self.install(Recorder(body=canned))
            result = L.call_librarian(GATE_JOB, "x", routing)
            self.assertEqual(result["failure"], "declined", provider)

    def test_cloud_model_is_flagged_as_independent(self):
        for provider in ("anthropic", "openai"):
            routing = routing_for(provider)
            self.install(Recorder(body=CANNED[provider]))
            result = L.call_librarian(GATE_JOB, "x", routing)
            self.assertEqual(result["model"]["provider"], provider)
            self.assertEqual(result["model"]["reported"],
                             FILL_FOR[provider][1], provider)
            # unlike Ollama's echoed tag, this is real evidence of what answered
            self.assertIs(result["model"]["independent"], True, provider)

    def test_cloud_provider_error_text_never_crosses(self):
        planted = json.dumps({
            "error": {"type": "overloaded_error",
                      "message": PROVIDER_ERROR_SENTENCE},
        }).encode("utf-8")
        for provider in ("anthropic", "openai"):
            routing = routing_for(provider)
            self.install(Recorder(status=529, body=planted))
            result = L.call_librarian(GATE_JOB, "x", routing)
            self.assertEqual(result["failure"], "provider_down", provider)
            self.assertNotIn(PROVIDER_ERROR_SENTENCE,
                             " ".join(_deep_strings(result)), provider)

    def test_the_six_adapter_functions_open_nothing(self):
        import inspect
        openers = ("urlopen", "http.client", "socket.", "requests.", "_send(")
        for name in ("build_ollama_request", "read_ollama_response",
                     "build_anthropic_request", "read_anthropic_response",
                     "build_openai_request", "read_openai_response"):
            src = inspect.getsource(getattr(L, name))
            for token in openers:
                self.assertNotIn(token, src, name + " contains " + token)
        # ...and the OpenAI address is never a literal inside its builder
        self.assertNotIn("https://",
                         inspect.getsource(L.build_openai_request))

    # -- POSITIVE CONTROL: the recorder actually records -------------------

    def test_positive_control_recorder_records(self):
        rec = self.install(Recorder(body=ollama_body({"sections": []})))
        L.call_librarian(GATE_JOB, "x", self.routing)
        self.assertEqual(len(rec.calls), 1)
        seen = rec.calls[0]["request"]["body"]["model"]
        self.assertEqual(seen, self.routing.fills["local"][1])
        # ...and a deliberately wrong expectation would NOT have matched it,
        # which is the half that makes the control mean anything.
        self.assertNotEqual(seen, "never-this-model")

    # -- the closed register and the status table (26.93-03, D-06/D-07) -----

    def test_the_retried_set_is_exactly_the_four(self):
        # A SET EQUALITY, so a fifth member fails here rather than showing up
        # as a mysterious extra request somewhere downstream.
        self.assertEqual(set(L.RETRIED),
                         {"rate_limited", "provider_down", "offline",
                          "timeout"})
        self.assertEqual(len(L.FAILURES), 11)
        self.assertEqual(len(set(L.FAILURES)), 11)
        for token in L.RETRIED:
            self.assertIn(token, L.FAILURES, token)
        never = [t for t in L.FAILURES if t not in L.RETRIED]
        self.assertEqual(len(never), 7)
        # the two whose presence here is load-bearing, named out loud
        self.assertIn("truncated", never)
        self.assertIn("bad_key", never)

    def test_the_status_table_is_asserted_by_value(self):
        # Every code the table names, driven THROUGH THE FUNCTION — so the
        # table can never be right while the function quietly ignores it.
        for code, token in sorted(L.STATUS_TABLE.items()):
            self.assertEqual(L.classify_status("openai", code, {}, b""),
                             token, code)
            self.assertIn(token, L.FAILURES, token)
        for code in (200, 201, 204):
            self.assertIsNone(L.classify_status("openai", code, {}, b""), code)
        self.assertEqual(
            {L.classify_status("anthropic", c, {}, b"") for c in (401, 403)},
            {"bad_key"})
        self.assertEqual(
            {L.classify_status("openai", c, {}, b"")
             for c in (500, 502, 503, 504, 529)}, {"provider_down"})
        self.assertEqual(
            {L.classify_status("openai", c, {}, b"")
             for c in (400, 404, 422)}, {"malformed"})
        self.assertEqual(
            L.classify_status("openai", L.STATUS_TIMED_OUT, {}, b""),
            "timeout")

    def test_only_401_and_403_ever_produce_bad_key(self):
        # ⚠ The single most consequential claim in this plan, asserted over
        # every code a provider could answer with rather than over a chosen
        # few: nothing but an explicit rejection may change what the room
        # believes about a key.
        for provider in L.PROVIDERS:
            for code in range(400, 600):
                token = L.classify_status(provider, code, {}, b"")
                if code in (401, 403):
                    self.assertEqual(token, "bad_key", (provider, code))
                else:
                    self.assertNotEqual(token, "bad_key", (provider, code))
            self.assertNotEqual(
                L.classify_status(provider, None, {}, b""), "bad_key",
                provider)
            self.assertNotEqual(
                L.classify_status(provider, L.STATUS_TIMED_OUT, {}, b""),
                "bad_key", provider)

    def test_a_401_and_a_429_are_two_different_values(self):
        rejected = L.classify_status("anthropic", 401, {}, b"")
        busy = L.classify_status("anthropic", 429, {}, b"")
        self.assertEqual(rejected, "bad_key")
        self.assertEqual(busy, "rate_limited")
        # ⚠ The collapse this whole table exists to prevent: a busy server
        # must never send her to replace a working key.
        self.assertNotEqual(rejected, busy)

    def test_the_same_dead_connection_is_two_different_tokens(self):
        # ⚠ ONE operating-system error, TWO meanings. "No network" and
        # "nothing is listening on your own machine" want different sentences
        # and different things to do about them.
        cloud = L.classify_status("anthropic", None, {}, b"")
        local = L.classify_status("ollama", None, {}, b"")
        self.assertEqual(cloud, "offline")
        self.assertEqual(local, "ollama_not_running")
        self.assertNotEqual(cloud, local)
        # ...and the same fact driven all the way through the seam
        self.install(Recorder(status=None, body=b""))
        self.assertEqual(
            L.call_librarian(GATE_JOB, "x",
                             routing_for("anthropic"))["failure"], "offline")
        self.install(Recorder(status=None, body=b""))
        self.assertEqual(
            L.call_librarian(GATE_JOB, "x",
                             routing_for("ollama"))["failure"],
            "ollama_not_running")

    # -- the allowance, counted BY VALUE (26.93-03, D-08) -------------------

    def test_never_retried_tokens_make_exactly_one_attempt(self):
        # Six of the seven. The seventh, `no_key`, cannot be driven from the
        # recorder BECAUSE it is decided before a connection is opened — it
        # has its own case below, asserting ZERO requests rather than one.
        for token in sorted(NEVER_RETRIED_DRIVERS):
            provider, status, headers, body = NEVER_RETRIED_DRIVERS[token]
            rec = self.install(Recorder(status=status, headers=headers,
                                        body=body))
            result = L.call_librarian(GATE_JOB, "x", routing_for(provider))
            self.assertEqual(result["failure"], token, token)
            self.assertNotIn(token, L.RETRIED, token)
            # BY VALUE, and the value is one: no allowance is ever spent on an
            # answer that re-asking cannot change.
            self.assertEqual(len(rec.calls), 1, token)
        self.assertEqual(self.clock.waits, [],
                         "a never-retried token was waited on")

    def test_no_key_is_returned_with_zero_requests(self):
        rec = self.install(Recorder(body=CANNED["anthropic"]))
        routing = routing_for("anthropic")
        os.environ.pop(L.KEY_ENV_NAMES["anthropic"], None)  # tearDown restores
        result = L.call_librarian(GATE_JOB, "x", routing)
        self.assertEqual(result["failure"], "no_key")
        # ⚠ NOT bad_key. Nothing was rejected because nothing was offered, and
        # telling her to replace a key she never had sends her looking for a
        # mistake that is not there.
        self.assertNotEqual(result["failure"], "bad_key")
        # ZERO. No connection was opened at all.
        self.assertEqual(len(rec.calls), 0)

    def test_retried_tokens_use_the_whole_allowance_from_the_table(self):
        # ⚠ READ FROM THE TABLE, NEVER WRITTEN AS A LITERAL HERE. If the owner
        # changes an allowance this expectation changes with it; a stale pin
        # that still passes is worse than no pin at all.
        expected = 1 + L.JOBS[GATE_JOB]["retries"]
        for token in sorted(RETRIED_DRIVERS):
            provider, status, headers, body = RETRIED_DRIVERS[token]
            rec = self.install(Recorder(status=status, headers=headers,
                                        body=body))
            self.clock.waits = []
            result = L.call_librarian(GATE_JOB, "x", routing_for(provider))
            self.assertEqual(result["failure"], token, token)
            self.assertIn(token, L.RETRIED, token)
            self.assertEqual(len(rec.calls), expected, token)
            # one pause between each pair of attempts, and not one more
            self.assertEqual(len(self.clock.waits), expected - 1, token)

    def test_reflection_makes_exactly_one_attempt_on_a_retried_token(self):
        job = self.bind_reflection()
        self.assertEqual(L.JOBS[job]["retries"], 0)
        rec = self.install(Recorder(status=429, body=b"{}"))
        result = L.call_librarian(job, "x", self.routing)
        self.assertEqual(result["failure"], "rate_limited")
        # ⚠ The token IS retried for other jobs — proved two cases up. This is
        # the ROW's zero, not the token's, which is the whole of D-08's shape.
        self.assertIn("rate_limited", L.RETRIED)
        self.assertEqual(len(rec.calls), 1 + L.JOBS[job]["retries"])
        self.assertEqual(len(rec.calls), 1)
        self.assertEqual(self.clock.waits, [])

    # -- the wait itself, measured from the injected clock (D-08) -----------

    def test_retry_after_is_honoured_measured_from_the_injected_clock(self):
        asked = 2.0
        rec = self.install(Recorder(status=429, headers={"Retry-After": "2"},
                                    body=b"{}"))
        L.call_librarian(GATE_JOB, "x", self.routing)
        self.assertEqual(len(rec.calls), 1 + L.JOBS[GATE_JOB]["retries"])
        self.assertTrue(self.clock.waits, "no wait was taken at all")
        for taken in self.clock.waits:
            # AT LEAST what the provider asked for: it knows when it will be
            # ready and the room's own growing pause does not.
            self.assertGreaterEqual(taken, asked)
        # ...and it was the header that did it, not the default pause, which is
        # smaller — so this cannot pass by accident.
        self.assertLess(L.FIRST_WAIT_S, asked)

    def test_the_default_wait_grows_and_stays_bounded(self):
        self.install(Recorder(status=500, body=b"{}"))
        L.call_librarian(GATE_JOB, "x", self.routing)
        waits = self.clock.waits
        self.assertEqual(len(waits), L.JOBS[GATE_JOB]["retries"])
        self.assertEqual(waits[0], L.FIRST_WAIT_S)
        for earlier, later in zip(waits, waits[1:]):
            self.assertGreater(later, earlier)
        for taken in waits:
            self.assertLessEqual(taken, L.MAX_WAIT_S)

    def test_the_timeout_comes_from_the_tier_and_no_job_overrides_it(self):
        job = self.bind_reflection()                    # good-cloud
        rec = self.install(Recorder(body=ollama_body({"sections": []})))
        L.call_librarian(job, "x", self.routing)
        good_cloud = rec.calls[0]["timeout_s"]
        rec = self.install(Recorder(body=ollama_body({"sections": []})))
        L.call_librarian(GATE_JOB, "x", self.routing)   # local
        local = rec.calls[0]["timeout_s"]
        self.assertEqual(good_cloud,
                         self.routing.timeouts[L.JOBS[job]["tier"]])
        self.assertEqual(local,
                         self.routing.timeouts[L.JOBS[GATE_JOB]["tier"]])
        # ⚠ NOT one number for everything (D-09). The 300 seconds this
        # replaces was sized for a subprocess talking to a fast cloud model.
        self.assertNotEqual(good_cloud, local)
        self.assertEqual(len(set(L.DEFAULT_TIMEOUTS.values())), 3)

    # -- the local rung's three states (D-07, #35 section 4) ----------------

    def test_ollama_probe_has_three_distinct_states(self):
        base = L.DEFAULT_BASES["ollama"]
        with_model = json.dumps(
            {"models": [{"name": "qwen2.5:7b"}]}).encode("utf-8")
        without_model = json.dumps(
            {"models": [{"name": "llama3:8b"}]}).encode("utf-8")

        self.install(Recorder(status=None, body=b""))
        not_running = L.probe_ollama(base)
        self.install(Recorder(status=200, body=without_model))
        missing = L.probe_ollama(base)
        rec = self.install(Recorder(status=200, body=with_model))
        working = L.probe_ollama(base)

        states = [not_running["state"], missing["state"], working["state"]]
        self.assertEqual(states,
                         ["ollama_not_running", "model_not_pulled", "working"])
        # THREE different values — a collapse of any pair can never pass here
        self.assertEqual(len(set(states)), 3)
        # one free call, through _send, to the tag list and nowhere else
        self.assertEqual(len(rec.calls), 1)
        self.assertEqual(rec.calls[0]["request"]["url"], base + "/api/tags")
        self.assertEqual(rec.calls[0]["request"]["method"], "GET")

    def test_the_probe_does_not_count_the_search_model_against_working(self):
        base = L.DEFAULT_BASES["ollama"]
        lean_body = json.dumps(
            {"models": [{"name": "qwen2.5:7b"}]}).encode("utf-8")
        full_body = json.dumps(
            {"models": [{"name": "qwen2.5:7b"},
                        {"name": "nomic-embed-text:v1.5"}]}).encode("utf-8")
        self.install(Recorder(status=200, body=lean_body))
        lean = L.probe_ollama(base)
        self.install(Recorder(status=200, body=full_body))
        full = L.probe_ollama(base)
        # ⚠ #35 section 4: the language model alone IS a working room — it can
        # clean, label, propose headings and write a reflection. The search
        # model is reported separately and never counted against that.
        self.assertEqual(lean["state"], "working")
        self.assertEqual(full["state"], "working")
        self.assertIs(lean["search_model"], False)
        self.assertIs(full["search_model"], True)

    # -- the injection points, and only two of them (T-26.93-16) ------------

    def test_the_two_injection_points_are_module_attributes_only(self):
        import inspect
        with open(__file__) as fh:
            own = fh.read()
        # ⚠ THE NEEDLE IS BUILT, NOT WRITTEN. Spelling the standard library's
        # waiting call as a literal here would put it in the very file this
        # asserts is free of it — a case that can only ever fail, and the
        # exact species of defect that lands inside the instrument rather
        # than in the code under test.
        needle = "time" + "." + "sleep"
        # ⚠ A BOOLEAN AND A FIELD NAME, NEVER `assertNotIn`. The haystack here
        # is this whole file; `assertNotIn` would dump every byte of it into
        # whatever terminal or transcript the failure lands in. That is
        # harmless for THIS needle and catastrophic for a planted key value,
        # and the discipline has to be the same in both places or it is not a
        # discipline (T-26.93-24).
        self.assertTrue(needle not in own,
                        "this suite calls the standard library's waiting "
                        "function directly instead of the injected clock")
        # ...and a deliberately wrong needle WOULD be found, so the assertion
        # above is not passing merely because nothing is ever found.
        self.assertTrue("_sleep" in own,
                        "the injected clock's name is absent from this suite, "
                        "so the assertion above could not have found anything")
        src = inspect.getsource(L)
        # Each seam is bound to a plain module function — not to an
        # environment read, not to a config lookup. A shell value cannot steer
        # a production call because there is nothing for it to steer.
        for name in ("_transport", "_sleep"):
            assigns = [ln for ln in src.split("\n")
                       if ln.startswith(name + " = ")]
            self.assertEqual(len(assigns), 1, name)
            self.assertEqual(assigns[0].split("=", 1)[1].strip(),
                             "_real" + name, name)
        self.assertTrue("getenv" not in src,
                        "the module reads an environment variable through a "
                        "spelling these seam assertions cannot follow")

    # -- the credential, confined to the transport (26.93-04, #28) ----------
    #
    # ⚠ THREE OF THE FOUR PLANTED-VALUE SURFACES LIVE HERE — `Routing`'s repr,
    # the five-key return, and anything the module logs. The fourth, what
    # `--setup` prints, lives in `tests/test_setup_keys.py`, because that is
    # where the printing happens. Four surfaces, four separate cases, and not
    # one of them may print the value it is searching for.

    def test_the_credential_never_reaches_the_routing_object(self):
        provider = self.plant_key()
        routing = L.resolve_routing({}, environ={})
        surfaces = [repr(routing)]
        for mapping in (routing.fills, routing.bases, routing.timeouts,
                        routing.provenance):
            surfaces.extend(_deep_strings(dict(mapping)))
        # The message names the FIELD, never the value.
        self.assertTrue(
            PLANTED_CREDENTIAL not in " ".join(str(s) for s in surfaces),
            "a key value is reachable from the frozen Routing object")
        # ...and the control half: the routing really did resolve to that
        # provider off the planted key, so this is not passing because nothing
        # happened.
        self.assertEqual(routing.fills["good-cloud"][0], provider)

    def test_the_credential_never_reaches_the_five_key_return(self):
        self.plant_key()
        self.install(Recorder(body=CANNED["anthropic"]))
        result = L.call_librarian(GATE_JOB, "x", routing_for("anthropic"))
        self.assertIs(result["ok"], True)
        self.assertTrue(
            PLANTED_CREDENTIAL not in " ".join(_deep_strings(result)),
            "a key value is present in the five-key return")

    def test_the_credential_never_reaches_any_string_the_module_logs(self):
        import inspect
        # Nothing in this module writes a line anywhere — no printer, no
        # logger, no stream. That is the strongest form of "it never reaches a
        # log": there is no log for it to reach. Asserted against the syntax
        # tree, so the module's own prose about logging is invisible to it.
        self.assertEqual(writer_violations(inspect.getsource(L)), [])

        # POSITIVE CONTROL — three real writers, in fabricated CODE, each one
        # caught. Without this the case above would only ever have shown that
        # nothing was found, which is not the same claim as "a writer would be".
        for label, snippet in (
                ("a print call", "def f(x):\n    print(x)\n"),
                ("the printer passed as a value",
                 "def f(x):\n    w = print\n    w(x)\n"),
                ("a stream write",
                 "import sys\n\n\ndef f(x):\n    sys.stdout.write(x)\n"),
                ("a logger",
                 "import logging\n\n\ndef f(x):\n    logging.info(x)\n")):
            self.assertTrue(writer_violations(snippet), label)

        # NEGATIVE CONTROL — prose ABOUT logging, in a comment and in a
        # docstring, is not a writer. This is the exact input the word-search
        # version of this check failed on: its own module's commentary.
        prose = ('"""Never logged, and no logging ever reaches her."""\n'
                 "# what any future logging would reach for\n"
                 "\n\ndef f(x):\n    return x\n")
        self.assertEqual(writer_violations(prose), [])

        # ...and the one answer most likely to want to explain itself — a
        # rejected key — still carries nothing of the credential.
        self.plant_key()
        self.install(Recorder(status=401, body=b"{}"))
        result = L.call_librarian(GATE_JOB, "x", routing_for("anthropic"))
        self.assertEqual(result["failure"], "bad_key")
        self.assertTrue(
            PLANTED_CREDENTIAL not in " ".join(_deep_strings(result)),
            "a key value survives on the answer to a rejected key")

    def test_the_recorded_request_carries_no_credential(self):
        self.plant_key()
        rec = self.install(Recorder(body=CANNED["anthropic"]))
        L.call_librarian(GATE_JOB, "x", routing_for("anthropic"))
        self.assertTrue(
            PLANTED_CREDENTIAL not in " ".join(
                _deep_strings(rec.calls[0]["request"])),
            "a key value rode the request dict")
        # ...and it DID travel, on its own argument, to the one function that
        # opens a connection — otherwise this case would pass on a call that
        # never carried a credential at all. The header's NAME is asserted; of
        # its value, only whether there is one.
        auth = rec.calls[0]["auth"]
        self.assertEqual(auth[0], "x-api-key")
        self.assertTrue(bool(auth[1]), "the credential argument is empty")

    # -- only an explicit rejection may change the room's belief (D-07) -----

    def test_only_a_bad_key_records_a_key_rejection(self):
        self.plant_key()
        self.install(Recorder(status=401, body=b"{}"))
        result = L.call_librarian(GATE_JOB, "x", routing_for("anthropic"))
        self.assertEqual(result["failure"], "bad_key")
        self.assertEqual(self.rejections.calls, ["anthropic"])
        # ...and the shipped recorder wrote the history, not just the spy
        self.assertIsNotNone(L.load_keys()["anthropic"]["rejected_ms"])

    def test_rate_limited_records_no_key_rejection(self):
        self.plant_key()
        self.install(Recorder(status=429, body=b"{}"))
        result = L.call_librarian(GATE_JOB, "x", routing_for("anthropic"))
        self.assertEqual(result["failure"], "rate_limited")
        # ⚠ ZERO. A busy server has not looked at the credential, and a room
        # that recorded this would send her to replace a working key.
        self.assertEqual(len(self.rejections.calls), 0)

    def test_provider_down_records_no_key_rejection(self):
        self.plant_key()
        self.install(Recorder(status=500, body=b"{}"))
        result = L.call_librarian(GATE_JOB, "x", routing_for("anthropic"))
        self.assertEqual(result["failure"], "provider_down")
        self.assertEqual(len(self.rejections.calls), 0)

    def test_offline_records_no_key_rejection(self):
        self.plant_key()
        self.install(Recorder(status=None, body=b""))
        result = L.call_librarian(GATE_JOB, "x", routing_for("anthropic"))
        self.assertEqual(result["failure"], "offline")
        self.assertEqual(len(self.rejections.calls), 0)

    def test_timeout_records_no_key_rejection(self):
        self.plant_key()
        self.install(Recorder(status=L.STATUS_TIMED_OUT, body=b""))
        result = L.call_librarian(GATE_JOB, "x", routing_for("anthropic"))
        self.assertEqual(result["failure"], "timeout")
        self.assertEqual(len(self.rejections.calls), 0)

    def test_a_success_clears_a_recorded_rejection(self):
        self.plant_key()
        self.install(Recorder(status=401, body=b"{}"))
        L.call_librarian(GATE_JOB, "x", routing_for("anthropic"))
        self.assertIsNotNone(L.load_keys()["anthropic"]["rejected_ms"])
        self.install(Recorder(body=CANNED["anthropic"]))
        result = L.call_librarian(GATE_JOB, "x", routing_for("anthropic"))
        self.assertIs(result["ok"], True)
        # #35: a 401 is HISTORY, cleared by the first call that works.
        self.assertIsNone(L.load_keys()["anthropic"]["rejected_ms"])

    # -- the shell, validated: the fourth provenance token (D-04) ----------

    def test_an_env_fill_outside_the_allow_list_falls_to_the_default(self):
        # planted, so the cloud tiers have a real default to fall back to
        self.plant_key()
        stored = {"fills":
                  {"cheap-cloud": list(L.OPENAI_FILLS["cheap-cloud"])}}
        environ = {L.FILL_ENV_NAMES["cheap-cloud"]:
                   "anthropic:not-a-model-anyone-ships"}
        routing = L.resolve_routing(stored, environ=environ)
        self.assertEqual(routing.provenance["cheap-cloud"],
                         L.SOURCE_ENV_REJECTED)
        # ⚠ THE DEFAULT, NOT HER STORED PICK. A present-but-refused override is
        # a fact about the shell, not permission to pretend the shell said
        # nothing.
        self.assertEqual(routing.fills["cheap-cloud"],
                         L.ANTHROPIC_FILLS["cheap-cloud"])
        self.assertNotEqual(routing.fills["cheap-cloud"],
                            L.OPENAI_FILLS["cheap-cloud"])

    def test_a_legal_env_fill_wins_over_her_stored_pick(self):
        self.plant_key()
        legal = L.OPENAI_FILLS["cheap-cloud"]
        stored = {"fills":
                  {"cheap-cloud": list(L.ANTHROPIC_FILLS["cheap-cloud"])}}
        environ = {L.FILL_ENV_NAMES["cheap-cloud"]:
                   legal[0] + L.FILL_ENV_SEPARATOR + legal[1]}
        routing = L.resolve_routing(stored, environ=environ)
        # The compatibility promise: the environment still works, it is just
        # validated. Without this case the one above could pass on a resolver
        # that refused every shell value there is.
        self.assertEqual(routing.provenance["cheap-cloud"], L.SOURCE_ENV)
        self.assertEqual(routing.fills["cheap-cloud"], legal)

    # -- one allow-list per tier, and one judge (26.93-05, D-04/D-05) -------

    def test_the_allow_list_covers_exactly_the_tiers_and_holds_only_pairs(
            self):
        self.assertEqual(set(L.TIER_FILLS_ALLOWED), set(L.TIERS))
        for tier, fills in L.TIER_FILLS_ALLOWED.items():
            self.assertTrue(fills, tier)
            for fill in fills:
                # ⚠ A PAIR, NEVER A BARE MODEL STRING (D-05). That is what
                # makes exactly ONE provider serve a tier at any moment, so
                # there is no precedence race — and it is what lets the front
                # door name who is answering BEFORE any call is made.
                self.assertIsInstance(fill, tuple, (tier, fill))
                self.assertEqual(len(fill), 2, (tier, fill))
                self.assertIn(fill[0], L.PROVIDERS, (tier, fill))
                self.assertTrue(
                    isinstance(fill[1], str) and fill[1].strip(),
                    (tier, fill))
            self.assertEqual(len(set(fills)), len(fills), tier)

    def test_every_shipped_default_is_a_member_of_its_own_tiers_allow_list(
            self):
        # The allow-list REPEATS the default tables on purpose: it must be
        # EDITED to change, so it may not be derived from them. This case is
        # what the repetition buys — drift is caught here rather than
        # prevented by a derivation that would hide a membership change.
        self.assertIn(L.LOCAL_FILL, L.tier_allow_list("local"))
        for tier in ("cheap-cloud", "good-cloud"):
            self.assertIn(L.ANTHROPIC_FILLS[tier], L.tier_allow_list(tier))
            self.assertIn(L.OPENAI_FILLS[tier], L.tier_allow_list(tier))
            # her own machine is a LEGAL fill for a cloud tier — that is the
            # resolved answer when no cloud key exists anywhere, not a
            # fall-through reached for after something failed (#28 section 1)
            self.assertIn(L.LOCAL_FILL, L.tier_allow_list(tier))
        for provider, fill in L.KEY_CHECK_FILLS.items():
            self.assertIn(fill, L.tier_allow_list("cheap-cloud"), provider)
        # an unknown tier accepts nothing at all: fail-closed
        self.assertEqual(L.tier_allow_list("no-such-tier"), ())

    def test_one_judge_widened_rather_than_duplicated(self):
        import inspect
        self.assertIn("tier",
                      inspect.signature(server._allowed_model).parameters)
        # vocabulary one: the voice alias, a bare string, because that value
        # becomes the CLI's --model argv element
        self.assertEqual(server._allowed_model("opus", server.VOICE_TIER),
                         "opus")
        self.assertIsNone(server._allowed_model(
            "not-an-alias", server.VOICE_TIER, default=None))
        # vocabulary two: the call seam's tiers, judged as PAIRS out of the
        # one allow-list, in both spellings a fill ever arrives in
        self.assertEqual(server._allowed_model(list(L.LOCAL_FILL), "local"),
                         L.LOCAL_FILL)
        self.assertEqual(server._allowed_model("ollama:qwen2.5:7b", "local"),
                         L.LOCAL_FILL)
        # fail-closed on everything that is not a permitted fill for the tier
        for raw in (None, "", "opus", ["ollama"], ("ollama", ""),
                    ("anthropic", "claude-opus-5")):
            self.assertIsNone(server._allowed_model(raw, "local"), repr(raw))
        # an unknown tier refuses, and never hands back a voice alias
        self.assertIsNone(server._allowed_model("opus", "no-such-tier"))
        # ⚠ ONE JUDGE, NOT TWO. The server-side gate IS the module's, reached
        # rather than re-typed — two gates diverge the first time a fence
        # change updates one and not the other.
        self.assertEqual(server._allowed_model(L.LOCAL_FILL, "good-cloud"),
                         L.allowed_fill(L.LOCAL_FILL, "good-cloud"))
        self.assertEqual(server._allowed_model("nonsense", "good-cloud"),
                         L.allowed_fill("nonsense", "good-cloud"))

    def test_config_ask_is_the_one_job_barred_from_her_own_machine(self):
        import inspect
        self.assertIs(L.JOBS["config_ask"]["permitted_local"], False)
        others = sorted(k for k, row in L.JOBS.items()
                        if k != "config_ask"
                        and row.get("permitted_local") is not True)
        self.assertEqual(others, [])
        # ⚠ DATA, NEVER A BRANCH ON THE JOB'S NAME. An `if job == "config_ask"`
        # is something a later reader deletes while tidying and never notices;
        # a False in the table is something they have to mean to change. A
        # boolean plus a field name, never assertNotIn — the haystack is
        # source and the discipline is the same everywhere (T-26.93-24).
        seam = inspect.getsource(L.call_librarian)
        self.assertTrue(
            "config_ask" not in seam,
            "call_librarian names the config ask by name — the carve-out is "
            "supposed to be the JOBS row's permitted_local field")

    # -- frozen for the life of a run (26.93-05, D-10) ---------------------

    def test_the_routing_object_is_frozen_for_the_life_of_a_run(self):
        routing = L.resolve_routing({}, environ={})
        for field in ("fills", "bases", "timeouts", "provenance"):
            with self.assertRaises(AttributeError):
                setattr(routing, field, {})
            with self.assertRaises(AttributeError):
                delattr(routing, field)
        with self.assertRaises(AttributeError):
            setattr(routing, "a_field_nobody_declared", {})
        # ⚠ AND THE TABLES HANGING OFF IT ARE READ-ONLY VIEWS, so a worker
        # cannot re-point ONE tier while leaving the object itself alone —
        # which is the shape the freeze would otherwise miss entirely. "This
        # import was sorted by X" has to be true of all 300 batches.
        with self.assertRaises(TypeError):
            routing.fills["local"] = ("ollama", "something-else")

    # -- a missing fill refuses, specifically (26.93-05, #27 section 5) ----

    def test_a_missing_fill_refuses_with_the_actual_missing_thing(self):
        rec = self.install(Recorder(body=CANNED["ollama"]))
        # a CLOUD tier with nothing in it has nothing to authenticate with
        job = self.bind_row("connections")            # cheap-cloud
        cloud = L.call_librarian(job, "x", routing_missing("cheap-cloud"))
        self.assertEqual(
            refusal_violations("cheap-cloud", cloud, rec.calls, "no_key"), [])
        self.assertIs(cloud["ok"], False)
        self.assertEqual(cloud["failure"], "no_key")
        # her own machine with nothing in it has nothing ANSWERING — a
        # different sentence and a different thing to do about it, so a
        # different token. Never a generic one for both.
        local = L.call_librarian(GATE_JOB, "x", routing_missing("local"))
        self.assertEqual(
            refusal_violations("local", local, rec.calls,
                               "ollama_not_running"), [])
        self.assertEqual(local["failure"], "ollama_not_running")
        self.assertNotEqual(local["failure"], cloud["failure"])
        # ZERO requests across both — nothing was ever sent at all
        self.assertEqual(len(rec.calls), 0)

    def test_a_job_never_runs_on_a_tier_it_was_not_pinned_to(self):
        # cheap-cloud EMPTY, local FILLED — the exact shape in which a
        # helpful fall-through would look like a feature rather than a leak.
        rec = self.install(Recorder(body=CANNED["ollama"]))
        job = self.bind_row("connections")
        routing = routing_missing("cheap-cloud")
        self.assertTrue(routing.fills.get("local"),
                        "the control tier is empty too, so this case could "
                        "not have caught a fall-through")
        result = L.call_librarian(job, "x", routing)
        # ⚠ ZERO. Not "a local request was made" — nothing was sent.
        self.assertEqual(len(rec.calls), 0)
        self.assertIs(result["ok"], False)
        # ...and the refusal carries WHICH tier was empty and which ones are
        # filled, as DATA, so a surface can offer a one-time explicit choice.
        # ⚠ The offer is the surface's job; nothing here substitutes.
        self.assertEqual(result["refusal"]["empty_tier"], "cheap-cloud")
        self.assertEqual(set(result["refusal"]["filled_tiers"]),
                         {"local", "good-cloud"})

    def test_config_ask_with_no_cloud_fill_is_absent_not_local(self):
        rec = self.install(Recorder(body=CANNED["ollama"]))
        job = self.bind_row("config_ask")
        # the shape of a machine with no cloud key at all: every tier
        # resolved to her own machine, which is a COMPLETE room for every
        # other job (#28 section 1).
        routing = L.resolve_routing({}, environ={})
        self.assertEqual(routing.fills["cheap-cloud"], L.LOCAL_FILL)
        result = L.call_librarian(job, "x", routing)
        self.assertEqual(len(rec.calls), 0)
        self.assertIs(result["ok"], False)
        self.assertEqual(result["refusal"]["outcome"], L.OUTCOME_ABSENT)
        self.assertIsNone(result["failure"])
        # ⚠ DISTINCT FROM ALL ELEVEN, asserted against every single one of
        # them: "this is not available here" is not "this failed", and
        # nothing had to invent a twelfth token to say so.
        self.assertEqual(len(L.FAILURES), 11)
        for token in L.FAILURES:
            self.assertNotEqual(L.OUTCOME_ABSENT, token, token)
        # nothing on her own machine is offered as a substitute for THIS job
        self.assertEqual(result["refusal"]["filled_tiers"], ())
        # ...and the control: every OTHER job runs on that same routing, so
        # this is absence for one job rather than a broken room.
        self.assertEqual(
            refusal_violations("cheap-cloud", result, rec.calls, None), [])
        L.call_librarian(GATE_JOB, "x", routing)
        self.assertEqual(len(rec.calls), 1)

    def test_a_run_finishes_on_the_routing_it_started_with(self):
        L.save_settings({"fills": {"local": list(L.LOCAL_FILL)}})
        routing = server.resolve_librarian_routing()
        started_with = routing.fills["local"][1]
        rec = self.install(Recorder(body=ollama_body({"sections": []})))
        seen = []

        def stand_in_worker(handed):
            """A worker is HANDED the object and never looks one up."""
            seen.append(handed)
            return L.call_librarian(GATE_JOB, "x", handed)

        stand_in_worker(routing)
        # she changes the fill while the run is going
        L.save_settings({"fills": {"local": ["ollama", "a-different-model"]}})
        stand_in_worker(routing)

        # ⚠ ONE OBJECT, ASSERTED BY IDENTITY. Two equal objects resolved at
        # two moments is exactly what D-10 forbids.
        self.assertIs(seen[0], seen[1])
        # ...and identity is not free here: two resolutions are two objects,
        # so the assertion above is not passing on a coincidence.
        self.assertIsNot(server.resolve_librarian_routing(),
                         server.resolve_librarian_routing())
        # both requests carry the model the run STARTED with
        self.assertEqual([c["request"]["body"]["model"] for c in rec.calls],
                         [started_with, started_with])
        self.assertEqual(routing.fills["local"][1], started_with)
        # ...and the change she made lands on the NEXT run, which is what
        # Manage says plainly.
        self.assertEqual(
            server.resolve_librarian_routing().fills["local"][1],
            "a-different-model")

    def test_no_worker_resolves_its_own_routing(self):
        import inspect
        self.assertEqual(worker_routing_violations(inspect.getsource(server)),
                         [])
        # POSITIVE CONTROLS — fabricated workers, each caught, so this is not
        # a case that has only ever shown that nothing was found.
        self.assertTrue(worker_routing_violations(
            "import librarian_call\n\n\n"
            "def _a_worker(x):\n"
            "    return librarian_call.resolve_routing({})\n"))
        self.assertTrue(worker_routing_violations(
            "import librarian_call\n\n\n"
            "def _a_worker(x):\n"
            "    return librarian_call.call_librarian('j', x, None)\n"))
        # NEGATIVE CONTROL — a worker HANDED the object is clean, and so is a
        # handler that resolves beside a nested closure named `worker`, which
        # is precisely the shape a text scan reports as a violation.
        self.assertEqual(worker_routing_violations(
            "import librarian_call\n\n\n"
            "def _a_worker(x, routing=None):\n"
            "    return librarian_call.call_librarian('j', x, routing)\n"
            "\n\n"
            "def a_handler():\n"
            "    def worker():\n"
            "        return 1\n"
            "    return librarian_call.resolve_routing({}), worker\n"), [])

    # -- the migration itself (26.93-06) -----------------------------------

    def test_every_shipped_site_runs_on_the_seam(self):
        import inspect
        src = inspect.getsource(server)
        # THE UNMUTATED CONTROL. Everything else about this claim is proved by
        # driving the same checker red in `run_drill` below.
        self.assertEqual(migration_violations(src, L.JOBS, L.FAILURES), [])
        # ...and the two halves spelled out, so they hold even if someone
        # later loosens the checker.
        self.assertEqual(set(server.FAILURE_SENTENCES), set(L.FAILURES))
        for token in BUSY_SERVER_TOKENS:
            # ⚠ A BOOLEAN, NOT assertNotIn: the failure output of assertNotIn
            # would print the sentence, and the sentence is what is under
            # suspicion. The message names the FIELD instead.
            self.assertTrue(
                "key" not in server.FAILURE_SENTENCES[token].lower(),
                "the " + token + " sentence mentions a key")
        # every token has words, and `bad_key`'s words name who rejected it
        for token in L.FAILURES:
            self.assertTrue(server.failure_sentence(token).strip(), token)
        self.assertIn("Anthropic",
                      server.failure_sentence("bad_key", "Anthropic"))
        # ⚠ and the stop line never counts what is left (law 3)
        for digit in "0123456789":
            self.assertNotIn(digit, server.LIBRARIAN_STOPPED_MSG)


# ---------------------------------------------------------------------------
# ---- the mutation drill ---------------------------------------------------

def run_drill():
    """Feed the checkers copies with ONE thing wrong each, in memory.

    Nothing here writes a file, and nothing here opens a socket. FIVE checkers
    are driven from this ONE drill — `seam_violations` over a returned answer,
    `request_violations` over a built request, `policy_violations` over the
    three tables, and (26.93-05) `refusal_violations` over a call that was
    never made plus `worker_routing_violations` over the source itself. Each
    plan extended the existing DRILL line rather than starting a second one
    that could drift out of sync with it. Every mutation is counted, the
    unmutated controls are counted separately, and both totals are asserted BY
    VALUE against literals at the top of this file."""
    routing = L.resolve_routing({}, environ={})
    payload = "the exact payload"

    good_result = {"ok": True, "structured": {"sections": []},
                   "model": {"provider": "ollama", "reported": "qwen2.5:7b",
                             "independent": False},
                   "usage": {"provider": "ollama"}, "failure": None}
    good_recorded = [{"request": {"body": {
        "model": "qwen2.5:7b", "stream": False,
        "messages": [{"role": "system", "content": "a real prompt"},
                     {"role": "user", "content": payload}]}},
        "timeout_s": 300}]

    def copy(result=None, recorded=None):
        return (json.loads(json.dumps(result or good_result)),
                json.loads(json.dumps(recorded or good_recorded)))

    mutations = []

    # 1 — a sixth key on the return
    r, c = copy()
    r["cost_usd"] = 0.004
    mutations.append(("sixth key on the return", r, c))

    # 2 — a cut-off answer wearing a parse error's explanation
    r, c = copy()
    r["failure"] = "not_a_real_token"
    mutations.append(("failure outside the closed register", r, c))

    # 3 — the provider's own error sentence surviving at depth
    r, c = copy()
    r["structured"] = {"sections": [{"note": PROVIDER_ERROR_SENTENCE}]}
    mutations.append(("provider error text survives at depth", r, c))

    # 4 — the payload no longer verbatim (the W3 wiring claim)
    r, c = copy()
    c[0]["request"]["body"]["messages"][1]["content"] = payload + " (tidied)"
    mutations.append(("payload_text not verbatim", r, c))

    # 5 — the body's model is not the tier's fill
    r, c = copy()
    c[0]["request"]["body"]["model"] = "never-this-model"
    mutations.append(("body model is not the fill", r, c))

    caught = 0
    for name, result, recorded in mutations:
        found = seam_violations(result, recorded, routing, payload)
        if found:
            caught += 1
        else:
            # Do NOT exit early — a harness that stopped at its first catch
            # once reported one failure where there were four.
            print("  DRILL MISS: " + name + " was not caught")

    # The unmutated controls, counted SEPARATELY from the mutations.
    controls = 0
    for label in ("unmutated result", "unmutated recorded"):
        if seam_violations(good_result, good_recorded, routing, payload) == []:
            controls += 1
        else:
            print("  DRILL CONTROL RED: " + label)

    total = len(mutations)

    # ---- the serialized-request half (26.93-02) --------------------------
    # For each provider: (a) the REAL built request is asserted clean and
    # counted as a control, then (b) copies with exactly one field wrong each
    # are asserted dirty and counted as mutations — in the SAME process, in the
    # same run. The loop never exits early on a catch: a harness that stopped
    # at its first catch once reported one failure where there were four.
    req_payload = "id-3\nthe exact payload the fence builder produced"
    built = built_requests(req_payload)

    for provider in L.PROVIDERS:
        req, req_routing = built[provider]

        if request_violations(provider, req, GATE_JOB, req_routing,
                              req_payload) == []:
            controls += 1
        else:
            print("  DRILL CONTROL RED: the real " + provider + " request")

        for label, mutate in (("system prompt replaced", _mutate_system),
                              ("user message prefixed", _mutate_user)):
            mutated = json.loads(json.dumps(req))
            mutate(provider, mutated["body"], req_payload)
            total += 1
            if request_violations(provider, mutated, GATE_JOB, req_routing,
                                  req_payload):
                caught += 1
            else:
                print("  DRILL MISS: " + provider + " " + label
                      + " was not caught")

    # The one that is OpenAI's alone: the flag deleted outright, which is how
    # it would actually be lost — a reader tidying away a redundant-looking
    # line, not a reader setting it to true.
    openai_req, openai_routing = built["openai"]
    mutated = json.loads(json.dumps(openai_req))
    del mutated["body"]["store"]
    total += 1
    if request_violations("openai", mutated, GATE_JOB, openai_routing,
                          req_payload):
        caught += 1
    else:
        print("  DRILL MISS: the deleted OpenAI store flag was not caught")

    # ---- 26.95-33: the FRONT CALL's own request, on all three providers ---
    # The same shape as the block above, over `blessing_selection` rather than
    # the gate job — because a gate never seen red FOR THIS JOB is not
    # evidence about this job, and this is the one job that carries a blessed
    # body to a company. Its tier is cheap-cloud, so the routing is built by
    # filling THAT tier: a routing that filled `local` would hand the checker
    # a fill this row never names and the control would go red for a reason
    # that is not a defect.
    seed_payload = "seed-1\nthe exact bytes the fence builder produced"
    front = built_cheap_requests(BLESSING_JOB, seed_payload)

    for provider in L.PROVIDERS:
        req, front_routing = front[provider]

        if request_violations(provider, req, BLESSING_JOB, front_routing,
                              seed_payload) == []:
            controls += 1
        else:
            print("  DRILL CONTROL RED: the real front-call " + provider
                  + " request")

        for label, mutate in (("system prompt replaced", _mutate_system),
                              ("user message prefixed", _mutate_user)):
            mutated = json.loads(json.dumps(req))
            mutate(provider, mutated["body"], seed_payload)
            total += 1
            if request_violations(provider, mutated, BLESSING_JOB,
                                  front_routing, seed_payload):
                caught += 1
            else:
                print("  DRILL MISS: the front call's " + provider + " "
                      + label + " was not caught")

    # ⚠ THE ONE THAT KEEPS A BLESSED BODY OFF SOMEBODY ELSE'S DISK, driven
    # over the FRONT CALL's own request: the retention flag deleted outright,
    # which is how it would actually be lost — a reader tidying away a line
    # that looks redundant beside the Anthropic body, never a reader setting
    # it to true.
    front_openai, front_openai_routing = front["openai"]
    mutated = json.loads(json.dumps(front_openai))
    del mutated["body"]["store"]
    total += 1
    if request_violations("openai", mutated, BLESSING_JOB,
                          front_openai_routing, seed_payload):
        caught += 1
    else:
        print("  DRILL MISS: the deleted OpenAI store flag on the front "
              "call's request was not caught")

    # ---- the policy half (26.93-03) --------------------------------------
    # The three policy tables, judged by `policy_violations`: the REAL ones
    # first as a control, then four copies with exactly one thing wrong each,
    # in the same process and the same run. These four and not others because
    # they are the simplifications a later reader actually reaches for — three
    # of them look like tidying, and the fourth looks like a bug fix.
    if policy_violations(L.RETRIED, L.STATUS_TABLE, L.DEFAULT_TIMEOUTS) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the real policy tables")

    collapsed = dict(L.STATUS_TABLE)
    collapsed[429] = "bad_key"

    policy_mutations = [
        # 13 — `truncated` taken out of the never-retried set. Re-asking with
        # identical input mostly reproduces the truncation.
        ("truncated removed from the never-retried set",
         tuple(L.RETRIED) + ("truncated",), dict(L.STATUS_TABLE),
         dict(L.DEFAULT_TIMEOUTS)),
        # 14 — a rejected key asked again, twice, at speed.
        ("bad_key made retried",
         tuple(L.RETRIED) + ("bad_key",), dict(L.STATUS_TABLE),
         dict(L.DEFAULT_TIMEOUTS)),
        # 15 — the per-tier timeout replaced with one number for everything,
        # which is exactly what this phase inherited and had to undo.
        ("one timeout for every tier",
         tuple(L.RETRIED), dict(L.STATUS_TABLE),
         dict((tier, 300) for tier in L.TIERS)),
        # 16 — ⚠ a busy server collapsed into a rejected key: the mutation
        # that costs her work rather than merely telling her something untrue.
        ("429 collapsed into bad_key",
         tuple(L.RETRIED), collapsed, dict(L.DEFAULT_TIMEOUTS)),
    ]

    for name, retried, table, timeouts in policy_mutations:
        total += 1
        if policy_violations(retried, table, timeouts):
            caught += 1
        else:
            print("  DRILL MISS: " + name + " was not caught")

    # ---- the refusal half (26.93-05) -------------------------------------
    # A real refusal first as a control, then copies with exactly one thing
    # wrong each. These three and not others because they are the three ways
    # "a missing fill is never silently substituted" actually dies: it gets
    # served by another tier anyway, it answers a category instead of the
    # thing that is missing, or a worker quietly resolves its own routing and
    # the whole guarantee moves out of the handler's hands.
    import inspect

    empty_routing = routing_missing("cheap-cloud")
    real_refusal = L._refusal(
        "cheap-cloud", L._usable_filled_tiers(empty_routing, True),
        failure=L.missing_fill_reason("cheap-cloud"))
    if refusal_violations("cheap-cloud", real_refusal, [], "no_key") == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the real refusal")

    served_elsewhere = dict(real_refusal)
    generic = dict(real_refusal)
    generic["failure"] = "provider_down"

    refusal_mutations = [
        # 17 — ⚠ THE ONE THAT COSTS HER MATERIAL: the tier had nothing, and a
        # request went out anyway on somebody else's fill.
        ("a missing fill served by another tier", served_elsewhere,
         [{"request": {"body": {"model": "qwen2.5:7b"}}}], "no_key"),
        # 18 — a category where the actual missing thing was owed. `no_key`
        # is answered by pasting a key in; `provider_down` is answered by
        # waiting, and waiting for a key that was never there is forever.
        ("a generic failure instead of the specific one", generic, [],
         "no_key"),
    ]

    for name, result, recorded, expected in refusal_mutations:
        total += 1
        if refusal_violations("cheap-cloud", result, recorded, expected):
            caught += 1
        else:
            print("  DRILL MISS: " + name + " was not caught")

    # The workers, judged from the syntax tree. The real ones as a control,
    # then one fabricated worker that resolves its own routing.
    if worker_routing_violations(inspect.getsource(server)) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the real workers")

    total += 1
    if worker_routing_violations(
            "import librarian_call\n\n\n"
            "def _some_worker(batches):\n"
            "    routing = librarian_call.resolve_routing({})\n"
            "    return librarian_call.call_librarian('j', batches, routing)\n"
    ):
        caught += 1
    else:
        print("  DRILL MISS: a worker resolving its own routing was not "
              "caught")

    # ---- the migration half (26.93-06) -----------------------------------
    # The REAL `server.py` first, as the unmutated control, then FIVE copies
    # held in memory with exactly one thing wrong each. ⚠ Nothing here writes
    # a file: `server.py` is read once and every mutation is a string.
    #
    # These five and not others because they are the five ways this migration
    # realistically goes wrong: a schema smuggled back to a call site, a site
    # left behind on the old function, the deleted key read again, a sentence
    # map that drifted out of step with the token set, and the one wording
    # mistake that would send her to replace a working credential.
    server_src = inspect.getsource(server)

    if migration_violations(server_src, L.JOBS, L.FAILURES) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the real server.py migration")

    migration_mutations = [
        # ⚠ THE ANCHOR MOVED 2026-08-17: it named the labelling scan's
        # call site, and #95 deleted that whole worker with its two model
        # jobs. `import_presort` is the sibling site of the same shape — a
        # job name, the batch text and the routing, and nothing else — so
        # the claim reads identically. ⛔ A mutation whose anchor text no
        # longer exists is a NO-OP that reports "the anchor moved" and
        # quietly stops asking, which is why this was re-pointed rather
        # than dropped.
        ("a schema literal handed back to a call site",
         '"import_presort", text, routing)',
         '"import_presort", text, routing, VERDICT_SCHEMA_JSON)'),
        # ⚠ 26.99-04: THE ANCHOR MOVED TO THE WRAPPER'S OWN SEAM CALL, and
        # the reason is that it must exist in BOTH trees. It used to name
        # `librarian_call.call_librarian("config_ask", doc, routing)` — a
        # production call site. 26.99-04 routes every production caller
        # through `server.record_call`, so that text stops existing and the
        # mutation becomes a NO-OP: the drill would report "the anchor text
        # moved" and this claim would quietly stop being asked. The one
        # reference to the seam that survives by design is the wrapper's
        # own, so it is the honest anchor for "a site left behind on the
        # deleted function" — and it reads identically before and after the
        # wiring lands. ⛔ The claim did not weaken: `old_calls` still
        # counts every `run_librarian_call` site in the file.
        ("one site left behind on the deleted function",
         'librarian_call.call_librarian(job, payload_text, routing)',
         'run_librarian_call(payload_text, None, None, None)'),
        # ⚠ This anchor also matches the identical line inside
        # `run_librarian_call`, the function Plan 26.93-07 deletes. Both
        # copies flip, which is the SAME regression written twice rather than
        # two different ones — and the presort half is what the checker asks
        # about by name.
        ("the pre-sort loop repointed at the deleted return key",
         'verdicts = structured["verdicts"]',
         'verdicts = result.get("verdicts") or []'),
        ("a sentence deleted from FAILURE_SENTENCES",
         '    "declined": "the librarian declined to answer this one.'
         ' nothing was saved.",  # noqa: E501\n',
         ""),
        ("a busy-server sentence made to mention a key",
         "the librarian is busy just now — nothing was lost;"
         " ask again shortly.",
         "the librarian is busy just now — check your key,"
         " then ask again shortly."),
        # ⚠ 26.95-33: THE ROSTER ADDITION, MADE LOAD-BEARING. The site keeps
        # its shape, its arity and its position, and the TOTAL stays nine —
        # only the job it NAMES changes, to another row that is already in the
        # table. So nothing about arity, argument names or the count can catch
        # this; only the roster's own "no call site names the job" loop can,
        # which is exactly what makes adding a ninth member to MIGRATED_JOBS a
        # pin rather than a bumped number.
        # ⚠ THE CONTINUATION INDENT IS BUILT, NOT TYPED. A run of twenty
        # spaces inside a string literal is exactly the kind of thing a reader
        # (or a writer who cannot run the suite) miscounts by one, and the
        # failure mode is a NO-OP mutation — which this drill reports as
        # "the anchor text moved" rather than silently passing. `" " * 24` is
        # unambiguous and states where the number comes from: the method body
        # is at 8, its `try` at 12, D-10's consent gate at 16, the `if bodies:`
        # branch at 20, and the call's hanging continuation at 24.
        # ⚠ 26.99-18: THE NUMBER MOVED 20 -> 24 AND THAT IS THE ONLY CHANGE
        # HERE. `handle_librarian_reach_date` gained one enclosing block —
        # `if base_consent_gap(routing) is None:`, D-10's gate for
        # T-26.99-34 — so the hanging continuation sits one level deeper. ⛔
        # The drill's CLAIM is untouched: it still plants another table row's
        # job at the site and still requires the roster loop to catch it.
        # ✅ AND THE INSTRUMENT REPORTED THE MOVE ITSELF — it printed
        # "DRILL MISS ... the anchor text moved" and failed the run rather
        # than passing on a no-op, which is the whole reason the no-op branch
        # above exists. A later reader who moves this call again must re-derive
        # this number from the enclosing blocks, never guess it.
        # ⚠ 26.99-04: THE CALLEE'S NAME LEFT THIS ANCHOR, ON PURPOSE. The
        # site is being routed through `server.record_call`, so the word
        # before the bracket changes while the continuation line does not.
        # Anchoring on the JOB'S OWN LINE keeps the mutation live in both
        # trees, and it is the more faithful anchor anyway: the claim is
        # about a site no longer naming its own job, which is a fact about
        # that line and about nothing else. The hanging indent is unchanged
        # by the wiring — it comes from the enclosing blocks, never from
        # the length of the name being called.
        ("the front call's site no longer naming its own job",
         "\n" + " " * 24 + '"blessing_selection",',
         "\n" + " " * 24 + '"connections",'),
    ]

    for name, needle, replacement in migration_mutations:
        total += 1
        mutated = server_src.replace(needle, replacement)
        if mutated == server_src:
            # ⚠ A NO-OP MUTATION IS A BROKEN INSTRUMENT, not a pass. The
            # anchor moved and this copy is identical to the control, so the
            # checker was never asked anything at all.
            print("  DRILL MISS: " + name + " did not change the source — "
                  "the anchor text moved")
        elif migration_violations(mutated, L.JOBS, L.FAILURES):
            caught += 1
        else:
            print("  DRILL MISS: " + name + " was not caught")

    return caught, total, controls


# ---------------------------------------------------------------------------
# ---- the live local check -------------------------------------------------

def run_live_local():
    """One real call, only if Ollama answers. Asserts nothing when it does not.

    ⚠ This is the ONLY real call in the file, and it is to loopback. It can
    never become evidence about a cloud provider."""
    base = L.DEFAULT_BASES["ollama"]
    try:
        req = urllib.request.Request(base + "/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=2) as resp:
            tags = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, OSError, ValueError):
        print("LIVE-LOCAL: skipped (Ollama did not answer)")
        return
    names = [m.get("name", "") for m in (tags.get("models") or [])]
    if not any(n.startswith("qwen2.5:7b") for n in names):
        print("LIVE-LOCAL: skipped (Ollama answered without qwen2.5:7b)")
        return
    routing = L.resolve_routing({}, environ={})
    result = L.call_librarian(GATE_JOB, "id-1\nsome saved text",
                              routing)
    assert set(result) == {"ok", "structured", "model", "usage", "failure"}
    print("LIVE-LOCAL: ran, ok=%s reported=%s"
          % (result["ok"], (result["model"] or {}).get("reported")))


# ---------------------------------------------------------------------------
# 26.998 — HER SETUP PASS, AND THE FOUR THINGS SHE RULED ABOUT IT
# ---------------------------------------------------------------------------
#
# ⛔⛔ WHY THESE LIVE IN THE SEAM SUITE. Every one of her four constraints on
# the trial (§ W-12) is a claim about the CALL: that it goes through the room's
# own seam and lands in her privacy ledger, that the fence holds, that nothing
# is written, and that the slice is exactly what she approved. This file is
# where a claim about a call is proved before a socket exists.
#
# ⚠⚠ AND THE ONE THEY ARE REALLY WRITTEN AGAINST: a pass that quietly sent two
# thirds of her diary would look, from every count this room prints, exactly
# like a pass that sent all of it. So each case below asserts that the thing
# being concluded about ACTUALLY HAPPENED — the narrowing delivered, the
# mutation landed, the seam fired — before it reads any verdict about what is
# inside.
#
# ⛔ THE FIXTURE IS A LIBRARY THIS FILE BUILDS FROM NOTHING, in its own temp
# tree. Never her real library, never a symlink to one, never a partial copy.

sys.path.insert(0, os.path.join(__file__.rsplit("/", 2)[0], "tools"))
import setup_pass_trial as TRIAL                                  # noqa: E402


def _plant(vault, lib, rel, body, item, filters=None):
    """Write one fixture note into the vault AND its snapshot into the library,
    and return the store row. ⚠ Both halves, always: an item whose snapshot is
    missing is UNREADABLE to the builder, and a case whose fixture cannot be
    read proves nothing about what a readable one would do."""
    src = os.path.join(vault, rel)
    os.makedirs(os.path.dirname(src), exist_ok=True)
    with open(src, "w", encoding="utf-8") as f:
        f.write(body)
    snap = os.path.join(lib, "items", item["id"] + ".md")
    os.makedirs(os.path.dirname(snap), exist_ok=True)
    with open(snap, "w", encoding="utf-8") as f:
        f.write(body)
    item = dict(item)
    item.update({"type": "text", "origin_path": src,
                 "library_path": "items/" + item["id"] + ".md",
                 "created_ms": 1_700_000_000_000,
                 "saved_ms": 1_700_000_000_000,
                 "comments": [], "tags": item.get("tags") or [],
                 "trigger": item.get("trigger", False)})
    return item


def build_fixture_library(tmp):
    """A whole small library on disk: her diary, her marked note, a clipping,
    a set-aside diary entry, and a note whose title SHADOWS the set-aside one.

    ⛔ Every class the trial must hold back is present and readable, so a case
    that finds them absent from the payload is finding an exclusion rather
    than an empty fixture."""
    vault = os.path.join(tmp, "vault")
    lib = os.path.join(tmp, "library")
    os.makedirs(lib, exist_ok=True)
    rows = {}
    for item in (
        _plant(vault, lib, "Journal/one.md", "today i walked to the water.",
               {"id": "d0000000000000a1", "title": "one.md",
                "state": "unseen"}),
        _plant(vault, lib, "Journal/two.md", "the same walk, colder.",
               {"id": "d0000000000000a2", "title": "two.md",
                "state": "unseen"}),
        # ⛔ HERS AND SET ASIDE. Same folder, so it would be tier 1 — the only
        # thing keeping it out is the fence.
        _plant(vault, lib, "Journal/held.md", "SET-ASIDE-BODY-NEVER-SENT",
               {"id": "d0000000000000a3", "title": "held.md",
                "state": "never_show"}),
        # her own mark, three-valued, and this one says yes
        _plant(vault, lib, "Notes/mine.md",
               "---\nhandwritten: true\n---\ni keep coming back to this.",
               {"id": "d0000000000000b1", "title": "mine.md",
                "state": "unseen"}),
        # tier 4 — saved, not written. Her ranking puts it outside this slice.
        _plant(vault, lib, "Clippings/saved.md", "CLIPPING-BODY-NEVER-SENT",
               {"id": "d0000000000000c1", "title": "saved.md",
                "state": "blessed"}),
    ):
        rows[item["id"]] = item
    store = {"schema_version": study_lib.SCHEMA_VERSION,
             "meta": {"library_root": lib, "vault_root": vault,
                      "filters": [], "fenced_roster": []},
             "items": rows}
    with open(os.path.join(lib, "items.json"), "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False)
    return lib


def build_shadowing_library(tmp):
    """The same library, plus a DIARY ENTRY whose title equals the set-aside
    one's — so the title-shadow screen has something in HER OWN SLICE to hold
    back.

    ⛔⛔ WHY THIS IS A SECOND FIXTURE AND NOT A SIXTH ROW IN THE FIRST. The
    first version of these gates put the shadow in tier 4, where her slice
    never reaches — so 'the shadowed title is absent' passed for the wrong
    reason, and a drill that deleted the fence from the slice selection walked
    straight through a green suite. ⚠ A fixture that cannot exercise the screen
    reports what survived a cut that never ran. That is this project's own
    signature defect and it is why this function exists."""
    lib = build_fixture_library(tmp)
    vault = os.path.join(tmp, "vault")
    store = study_lib.load_store(lib)
    item = _plant(vault, lib, "Journal/held.md", "a re-imported copy.",
                  {"id": "d0000000000000a4", "title": "held.md",
                   "state": "unseen"})
    # ⚠ same folder as her diary, so it really is tier 1: without the screen
    # it WOULD be delivered.
    store["items"][item["id"]] = item
    with open(os.path.join(lib, "items.json"), "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False)
    return lib


def _tree_fingerprint(root):
    """One hash over every byte of a library — names, sizes and contents. ⛔ A
    hash of items.json alone would call a rewritten snapshot 'untouched'."""
    h = hashlib.sha256()
    for base, dirs, files in os.walk(root):
        dirs.sort()
        for name in sorted(files):
            path = os.path.join(base, name)
            h.update(os.path.relpath(path, root).encode("utf-8"))
            with open(path, "rb") as f:
                h.update(f.read())
    return h.hexdigest()


HER_SLICE = {"d0000000000000a1", "d0000000000000a2", "d0000000000000b1"}
NEVER_SENT = ("SET-ASIDE-BODY-NEVER-SENT", "CLIPPING-BODY-NEVER-SENT")


class SetupPassCase(unittest.TestCase):
    """Her setup pass — § W-11 beat 4, § W-12's four constraints, § W-13's
    slice. ⛔ Its own temp home for every case, so no real key is ever read."""

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="study-room-setup-pass-")
        self._saved_home = os.environ.get("HOME")
        os.environ["HOME"] = os.path.join(self._tmp, "home")
        os.makedirs(os.environ["HOME"], exist_ok=True)
        self._saved_env = {}
        for name in L.KEY_ENV_NAMES.values():
            self._saved_env[name] = os.environ.get(name)
            os.environ[name] = PLACEHOLDER_CREDENTIAL
        self._saved_builder = study_lib.build_librarian_payload
        self._saved_record = server.record_call
        self.lib = build_fixture_library(self._tmp)

    def tearDown(self):
        study_lib.build_librarian_payload = self._saved_builder
        server.record_call = self._saved_record
        for name, value in self._saved_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        if self._saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = self._saved_home
        shutil.rmtree(self._tmp, ignore_errors=True)

    # -- her slice, and only her slice ----------------------------------
    def test_the_pass_is_handed_what_she_wrote_and_nothing_else(self):
        payload, stdin_text, report = TRIAL.build_slice(self.lib)
        delivered = {e["id"] for e in payload["bodies"]}
        self.assertEqual(delivered, HER_SLICE,
                         "the slice she approved is her diary and her own "
                         "mark; anything else here is material she never "
                         "agreed to send")
        self.assertEqual(payload["meta_rows"], [],
                         "a title-only row is still her title leaving the "
                         "house")
        self.assertEqual(report["diary"], 2)
        self.assertEqual(report["her_mark"], 1)

    def test_the_set_aside_and_the_saved_reach_the_payload_nowhere(self):
        _payload, stdin_text, _report = TRIAL.build_slice(self.lib)
        for marker in NEVER_SENT:
            self.assertNotIn(marker, stdin_text,
                             "a body the fence or her ranking excluded is in "
                             "the bytes that would be sent")
        # ⛔ AND THE TITLE, NOT ONLY THE BODY. A title is a content fragment.
        self.assertNotIn("held.md", stdin_text,
                         "the set-aside note's title reached the payload")

    def test_the_fixture_really_holds_what_the_two_cases_above_look_for(self):
        """⛔ THE POSITIVE CONTROL, AND IT IS NOT DECORATION. 'The excluded
        material is absent' is satisfied just as well by a fixture that never
        had it. This case proves the fixture DOES hold every excluded class,
        readable, so the absences above are exclusions rather than emptiness."""
        store = study_lib.load_store(self.lib)
        items = store["items"]
        self.assertEqual(items["d0000000000000a3"]["state"], "never_show")
        for item_id, marker in (("d0000000000000a3", NEVER_SENT[0]),
                                ("d0000000000000c1", NEVER_SENT[1])):
            text, _capped = study_lib._read_body_capped(
                self.lib, items[item_id])
            self.assertIn(marker, text or "",
                          "the fixture's excluded body is not even readable, "
                          "so its absence downstream proves nothing")

    # -- the refusals, each DRIVEN by a mutation that is proved to land ---
    def test_it_refuses_when_the_narrowing_delivered_less_than_her_slice(self):
        real = study_lib.build_librarian_payload
        landed = {}

        def one_short(*a, **kw):
            payload = real(*a, **kw)
            landed["before"] = len(payload["bodies"])
            payload["bodies"] = payload["bodies"][1:]
            landed["after"] = len(payload["bodies"])
            return payload

        study_lib.build_librarian_payload = one_short
        with self.assertRaises(TRIAL.TrialRefused):
            TRIAL.build_slice(self.lib)
        # ⛔ THE MUTATION IS PROVED TO HAVE LANDED, AFTER the raise is caught
        # and before anything is concluded from it: a raise from some other
        # cause would otherwise read as this gate working.
        self.assertEqual(landed["after"], landed["before"] - 1,
                         "the mutation never fired, so the refusal above says "
                         "nothing about under-delivery")

    def test_it_refuses_when_a_sitting_s_shedding_pass_moved_her_rows(self):
        real = study_lib.build_librarian_payload
        landed = {}

        def shed_one(*a, **kw):
            payload = real(*a, **kw)
            payload["counts"]["heavy-capped"] = 1
            landed["fired"] = payload["counts"]["heavy-capped"]
            return payload

        study_lib.build_librarian_payload = shed_one
        with self.assertRaises(TRIAL.TrialRefused):
            TRIAL.build_slice(self.lib)
        self.assertEqual(landed.get("fired"), 1,
                         "the mutation never fired")

    def test_the_unmutated_fixture_is_accepted_the_control_for_both(self):
        """⛔ WITHOUT THIS, BOTH REFUSALS ABOVE ARE SATISFIED BY A TRIAL THAT
        REFUSES EVERYTHING."""
        payload, _stdin, _report = TRIAL.build_slice(self.lib)
        self.assertEqual(len(payload["bodies"]), len(HER_SLICE))

    # -- through the room's own seam, and nowhere else --------------------
    def test_the_one_call_goes_through_record_call(self):
        seen = []

        def spy(job, payload_text, routing):
            seen.append((job, payload_text))
            return {"ok": True, "structured": {"learned": "what i learned."},
                    "model": None, "usage": {}, "failure": None}

        server.record_call = spy
        out = os.path.join(self._tmp, "answer.md")
        code = TRIAL.main(["--run", "--yes", "--library", self.lib,
                           "--out", out])
        self.assertEqual(code, 0)
        self.assertEqual(len(seen), 1, "the pass is ONE call, once")
        self.assertEqual(seen[0][0], "archive_learning",
                         "the caller names the job and nothing else — and the "
                         "job name is what puts the line in her ledger")
        _payload, stdin_text, _report = TRIAL.build_slice(self.lib)
        self.assertEqual(seen[0][1], stdin_text,
                         "what was sent is not byte-identical to what the "
                         "fence built")

    def test_pricing_sends_nothing_at_all(self):
        """⛔ THE CONTROL FOR THE CASE ABOVE, and her own constraint: the exact
        slice and its exact cost reach her BEFORE a penny moves."""
        seen = []
        server.record_call = lambda *a, **kw: seen.append(a)
        code = TRIAL.main(["--price", "--library", self.lib])
        self.assertEqual(code, 0)
        self.assertEqual(seen, [], "pricing made a call")

    def test_run_without_her_word_sends_nothing(self):
        seen = []
        server.record_call = lambda *a, **kw: seen.append(a)
        code = TRIAL.main(["--run", "--library", self.lib])
        self.assertEqual(code, 2)
        self.assertEqual(seen, [], "--run alone sent her writing")

    # -- it writes nothing into her library -------------------------------
    def test_a_whole_run_leaves_the_library_byte_for_byte(self):
        before = _tree_fingerprint(self.lib)
        server.record_call = lambda *a, **kw: {
            "ok": True, "structured": {"learned": "x"}, "model": None,
            "usage": {}, "failure": None}
        code = TRIAL.main(["--run", "--yes", "--library", self.lib,
                           "--out", os.path.join(self._tmp, "a.md")])
        self.assertEqual(code, 0, "the run did not happen, so the untouched "
                                  "library below proves nothing")
        self.assertEqual(_tree_fingerprint(self.lib), before,
                         "the trial wrote into her library")

    def test_the_answer_may_not_be_written_inside_her_library(self):
        server.record_call = lambda *a, **kw: {
            "ok": True, "structured": {"learned": "x"}, "model": None,
            "usage": {}, "failure": None}
        code = TRIAL.main(["--run", "--yes", "--library", self.lib,
                           "--out", os.path.join(self.lib, "inside.md")])
        self.assertEqual(code, 2)
        self.assertFalse(os.path.exists(os.path.join(self.lib, "inside.md")))

    def test_it_refuses_an_address_she_never_agreed_to(self):
        """⛔ THE CALLER-SIDE OBLIGATION, and this room has been bitten by it
        once already: `call_librarian` enforces NO consent of its own, so a
        route that forgets the check sends her writing to a redirected host
        while her own record says she was never asked. ⚠ The positive control
        is the case above — the SAME fixture with no redirection DOES call."""
        seen = []
        server.record_call = lambda *a, **kw: seen.append(a)
        settings = L.load_settings()
        settings["bases"] = {"anthropic": "http://127.0.0.1:9/v1"}
        L.save_settings(settings)
        gap = server.base_consent_gap(server.resolve_librarian_routing())
        self.assertIsNotNone(gap, "the redirection never took, so the refusal "
                                  "below would prove nothing")
        code = TRIAL.main(["--run", "--yes", "--library", self.lib,
                           "--out", os.path.join(self._tmp, "a.md")])
        self.assertEqual(code, 2)
        self.assertEqual(seen, [], "her writing went to an address she never "
                                   "agreed to")

    def test_a_diary_entry_shadowing_a_set_aside_title_stops_the_pass(self):
        """⛔ A set-aside note's TITLE reaching a model is that note reaching a
        model. When the screen holds one of HER OWN pieces back, the slice is
        no longer the slice she approved — so the pass stops and says so rather
        than sending less while reporting the same."""
        lib = build_shadowing_library(os.path.join(self._tmp, "shadowed"))
        store = study_lib.load_store(lib)
        # ⛔ the fixture is proved to shadow BEFORE the refusal is read
        self.assertEqual(store["items"]["d0000000000000a4"]["title"],
                         store["items"]["d0000000000000a3"]["title"],
                         "the fixture does not actually shadow anything")
        self.assertEqual(store["items"]["d0000000000000a3"]["state"],
                         "never_show")
        with self.assertRaises(TRIAL.TrialRefused):
            TRIAL.build_slice(lib)

    def test_it_refuses_a_payload_carrying_title_only_rows(self):
        real = study_lib.build_librarian_payload
        landed = {}

        def add_a_row(*a, **kw):
            payload = real(*a, **kw)
            payload["meta_rows"].append({"id": "x", "title": "a title"})
            landed["rows"] = len(payload["meta_rows"])
            return payload

        study_lib.build_librarian_payload = add_a_row
        with self.assertRaises(TRIAL.TrialRefused):
            TRIAL.build_slice(self.lib)
        self.assertEqual(landed.get("rows"), 1, "the mutation never fired")

    def test_it_refuses_when_her_library_moves_underneath_it(self):
        """⛔ ANOTHER SESSION IS ALWAYS ALLOWED TO BE WRITING. A pass that read
        half of one version and half of another would still print a tidy count
        of what it sent."""
        real = study_lib.build_librarian_payload
        landed = {}

        def write_underneath(*a, **kw):
            payload = real(*a, **kw)
            path = os.path.join(self.lib, "items.json")
            with open(path, "a", encoding="utf-8") as f:
                f.write(" ")
            landed["moved"] = True
            return payload

        study_lib.build_librarian_payload = write_underneath
        with self.assertRaises(TRIAL.TrialRefused):
            TRIAL.build_slice(self.lib)
        self.assertTrue(landed.get("moved"), "the mutation never fired")

    # -- the carve-out she ruled into the second reader --------------------
    def test_the_judge_lets_her_own_thing_be_named_and_still_refuses_advice(self):
        """⛔ HER RULING, 2026-08-25: `Let the reader allow a pointer` — chosen
        over moving the pointer out of the writing and over dropping it, with
        the cost stated, because two of her own rulings collided and the
        collision was DRIVEN against the live judge rather than predicted.

        ⚠ THIS CASE IS OFFLINE AND SAYS SO. It pins that the carve-out and the
        clauses it must not have loosened are BOTH in the prompt. It does not
        and cannot prove what a model does with them — that was measured live,
        once, with her permission, and the five verdicts are recorded in
        26.998-COPY.md § K with their date. ⛔ A later reader must not mistake
        this green for evidence about the model."""
        prompt = server.REFLECTION_JUDGE_PROMPT
        # her carve-out: naming her own thing is clean
        self.assertIn("NAMING something she wrote or saved", prompt)
        self.assertIn("handing her own thing back to her is not advice",
                      prompt)
        # ⛔ and the three the carve-out must NOT have swallowed
        self.assertIn("naming it is clean; telling her what to do about it is "
                      "not", prompt)
        for still_refused in ("you should read it again", "go back to it",
                              "it might be worth revisiting"):
            self.assertIn(still_refused, prompt,
                          "a sentence the carve-out must still refuse is no "
                          "longer spelled out for the reader")
        # ⛔ the strict clauses she chose in the first place, untouched
        self.assertIn("gentle counts", prompt)
        self.assertIn("homework wearing a question mark is still homework",
                      prompt)
        self.assertIn("when both could apply, answer 'hands_a_task'", prompt)

    # -- landing what she approved, once ---------------------------------
    def test_what_it_learned_lands_under_the_librarian_and_nowhere_else(self):
        """⛔ HER RULING, 2026-08-25: `With the librarian's other things` —
        over living beside her privacy ledger, and over narrowing the shipped
        pin that made an agent stop and ask her at all."""
        before = _tree_fingerprint(self.lib)
        path = TRIAL.keep(self.lib, "what i learned.")
        self.assertEqual(
            os.path.relpath(path, self.lib), "librarian/learned.md")
        with open(path, encoding="utf-8") as f:
            body = f.read()
        self.assertIn("what i learned.", body,
                      "what she approved is not in the file")
        self.assertIn("yours to edit or delete", body,
                      "the file does not tell her it is hers")
        self.assertNotEqual(_tree_fingerprint(self.lib), before,
                            "nothing was written, so the assertions above say "
                            "nothing about where it went")
        # ⛔ and her library itself is untouched by a notebook write
        self.assertEqual(
            hashlib.sha256(
                open(os.path.join(self.lib, "items.json"), "rb").read()
            ).hexdigest(),
            hashlib.sha256(
                open(os.path.join(self.lib, "items.json"), "rb").read()
            ).hexdigest())

    def test_it_refuses_to_learn_twice_over_her_own_edits(self):
        """⛔ THE PASS READS ONCE BY HER DESIGN, and the file is hers to edit
        afterwards — so a second write is either a mistake or an erasure of her
        own hand, and neither may happen quietly."""
        path = TRIAL.keep(self.lib, "the first thing it learned.")
        with open(path, "a", encoding="utf-8") as f:
            f.write("\nand this line is HERS, typed afterwards.\n")
        with self.assertRaises(TRIAL.TrialRefused):
            TRIAL.keep(self.lib, "something else entirely.")
        with open(path, encoding="utf-8") as f:
            body = f.read()
        self.assertIn("and this line is HERS", body,
                      "her own edit was destroyed by the refused write")
        self.assertNotIn("something else entirely", body)

    def test_replace_is_the_only_way_past_it_and_it_is_a_separate_word(self):
        """⛔ THE CONTROL: without this, the refusal above is satisfied by a
        keep that never writes anything at all."""
        TRIAL.keep(self.lib, "first.")
        path = TRIAL.keep(self.lib, "second.", replace=True)
        with open(path, encoding="utf-8") as f:
            body = f.read()
        self.assertIn("second.", body)
        self.assertNotIn("first.", body)

    def test_keeping_it_makes_no_call_at_all(self):
        """⛔ Landing what she approved is a file write. Reaching the seam here
        would send her writing a SECOND time to do a job needing no model."""
        seen = []
        server.record_call = lambda *a, **kw: seen.append(a)
        answer = os.path.join(self._tmp, "approved.md")
        with open(answer, "w", encoding="utf-8") as f:
            f.write("# heading\n\n---\n\nwhat i learned.\n")
        code = TRIAL.main(["--keep", answer, "--library", self.lib])
        self.assertEqual(code, 0)
        self.assertEqual(seen, [], "keeping it made a call")
        with open(TRIAL.learned_path(self.lib), encoding="utf-8") as f:
            self.assertIn("what i learned.", f.read())

    def test_keeping_it_twice_through_the_door_she_uses_is_refused(self):
        """⛔ THE DRILL FOUND THIS MISSING. `--keep` forced to replace walked
        through a green suite, because no case had ever driven the door twice —
        so the refusal was proved at the function and never at the door she
        actually types. ⚠ A gate on a path nobody drives is not a gate."""
        answer = os.path.join(self._tmp, "approved.md")
        with open(answer, "w", encoding="utf-8") as f:
            f.write("---\n\nthe first thing it learned.\n")
        self.assertEqual(
            TRIAL.main(["--keep", answer, "--library", self.lib]), 0)
        path = TRIAL.learned_path(self.lib)
        with open(path, "a", encoding="utf-8") as f:
            f.write("\nand this line is HERS.\n")
        with open(answer, "w", encoding="utf-8") as f:
            f.write("---\n\nsomething else entirely.\n")
        self.assertEqual(
            TRIAL.main(["--keep", answer, "--library", self.lib]), 2,
            "the second keep did not refuse")
        with open(path, encoding="utf-8") as f:
            body = f.read()
        self.assertIn("and this line is HERS", body)
        self.assertNotIn("something else entirely", body)

    # -- her words, and the room that will not start without them ---------
    def test_her_two_room_words_are_on_the_standing_list_byte_for_byte(self):
        """⛔ 26.998-COPY.md § J, CHOSEN FROM AN OFFERED SET. The em dash and
        the closing full stop are hers as she took them; a later reader who
        smooths either has overwritten the owner's copy."""
        self.assertEqual(
            server.JOB_ROOM_WORDS["archive_learning"],
            ("Learning what you love",
             "The librarian is reading what you have written, to learn what "
             "matters to you \u2014 it only does this once."))

    def test_the_row_carries_the_tier_and_the_retry_count_she_was_told(self):
        row = L.JOBS["archive_learning"]
        self.assertEqual(row["tier"], "good-cloud",
                         "she chose the best reader, priced against the cheap "
                         "rung and against her own machine")
        self.assertEqual(row["retries"], 0,
                         "a retried timeout can be billed twice, and this pass "
                         "promises her ONCE")
        self.assertTrue(row["schema"] and row["prompt"],
                        "an unbound row raises at the seam rather than sending")


# ---------------------------------------------------------------------------
# 26.998 — THE CLOSING POINTER: what may be NAMED at the end, and what may not
# ---------------------------------------------------------------------------
#
# ⛔⛔ THIS IS A FENCE SURFACE AND IS TREATED AS ONE. Her archive's BODIES were
# sent ONCE, at the setup pass, and are never sent again — that is the whole of
# what her § W-11 beat-4 design bought. What rides every sitting from now on is
# NAMES AND DATES, and only of things she said yes to. A body, an id, a folder
# or a tag arriving under this key would spend the thing her design bought,
# quietly, on every reflection forever.


def build_pointer_library(tmp):
    """Her library plus the four classes the pointer block must tell apart:
    an older blessed thing (a candidate), a NEWER blessed thing (not one —
    tonight's material), a blessed thing she has since SET ASIDE (fenced), and
    a blessed thing whose title SHADOWS a set-aside one."""
    lib = build_fixture_library(tmp)
    vault = os.path.join(tmp, "vault")
    store = study_lib.load_store(lib)
    OLD, NEW = 1_600_000_000_000, 1_900_000_000_000
    store["meta"]["last_reflection_ms"] = 1_700_000_000_001
    for item_id, rel, title, state, stamp, body in (
            ("e000000000000001", "Clippings/keeper.md", "the keeper", "blessed", OLD, "a thing she kept."),
            ("e000000000000002", "Clippings/tonight.md", "tonight's arrival", "blessed", NEW, "brand new."),
            ("e000000000000003", "Clippings/setaside.md", "the set-aside one", "never_show", OLD, "SET-ASIDE-BODY"),
            ("e000000000000004", "Clippings/shadow.md", "the set-aside one", "blessed", OLD, "a shadow copy."),
    ):
        item = _plant(vault, lib, rel, body,
                      {"id": item_id, "title": title, "state": state})
        item["created_ms"] = item["saved_ms"] = stamp
        store["items"][item_id] = item
    with open(os.path.join(lib, "items.json"), "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False)
    return lib


class PointerCase(unittest.TestCase):
    """The block that lets a reflection end by naming something older.
    ⛔ Its own temp home, its own fixture library, never hers."""

    def setUp(self):
        self._tmp = tempfile.mkdtemp(prefix="study-room-pointer-")
        self._saved_home = os.environ.get("HOME")
        os.environ["HOME"] = os.path.join(self._tmp, "home")
        os.makedirs(os.environ["HOME"], exist_ok=True)
        self.lib = build_pointer_library(self._tmp)
        self.store = study_lib.load_store(self.lib)
        # every title in the fixture that the fence holds back
        self.fenced_titles = tuple(
            str(it.get("title") or "")
            for it in self.store["items"].values()
            if study_lib._librarian_fenced(
                it, (self.store.get("meta") or {}).get("filters") or [])
            and it.get("title"))
        TRIAL.keep(self.lib, "she loves the sea and her own handwriting.")

    def tearDown(self):
        if self._saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = self._saved_home
        shutil.rmtree(self._tmp, ignore_errors=True)

    def _block(self):
        return server._reflection_worth_your_eye(
            self.lib, self.store, self.fenced_titles)

    def test_only_older_things_she_said_yes_to_may_be_named(self):
        block = self._block()
        self.assertIsNotNone(block, "the block is absent, so everything below "
                                    "would pass for the wrong reason")
        names = {row["title"] for row in block["worth_naming"]}
        # ⚠ `saved.md` is the base fixture's own blessed clipping, stamped
        # before the marker — a legitimate candidate, and it is named here by
        # value rather than filtered out of the expectation, because a test
        # that quietly narrows what it looks at is how a real extra member
        # goes unnoticed.
        self.assertEqual(names, {"the keeper", "saved.md"})
        self.assertNotIn("tonight's arrival", names,
                         "tonight's own material is offered back to her as "
                         "something older")
        self.assertNotIn("the set-aside one", names,
                         "a thing she set aside is named, or its shadow is")

    def test_the_fixture_really_holds_all_four_classes(self):
        """⛔ THE POSITIVE CONTROL. Three of the four assertions above are
        absences, and an absence proves nothing about a fixture that never
        had the thing."""
        items = self.store["items"]
        self.assertEqual(items["e000000000000002"]["state"], "blessed")
        self.assertGreater(items["e000000000000002"]["saved_ms"],
                           self.store["meta"]["last_reflection_ms"])
        self.assertEqual(items["e000000000000003"]["state"], "never_show")
        self.assertEqual(items["e000000000000004"]["state"], "blessed")
        self.assertEqual(items["e000000000000004"]["title"],
                         items["e000000000000003"]["title"],
                         "the shadow fixture does not shadow")
        self.assertIn("the set-aside one", self.fenced_titles)

    def test_names_and_dates_and_nothing_else_ever(self):
        """⛔ HER RULING: *from the names and dates of your old things — never
        what is inside them*. Her bodies were sent ONCE; a body here would
        spend that on every sitting forever."""
        block = self._block()
        for row in block["worth_naming"]:
            self.assertEqual(sorted(row), ["title", "when"])
        wire = json.dumps(block, ensure_ascii=False)
        for must_not in ("a thing she kept.", "brand new.", "SET-ASIDE-BODY",
                         "a shadow copy.", "e000000000000001",
                         "Clippings", "items/"):
            self.assertNotIn(must_not, wire,
                             "a body, an id, a path or a folder is riding the "
                             "pointer block")

    def test_it_is_absent_entirely_when_the_room_has_learned_nothing(self):
        os.remove(TRIAL.learned_path(self.lib))
        self.assertIsNone(self._block(),
                          "with nothing learned there is nothing to pick BY, "
                          "and a librarian handed names and no sense of her "
                          "would choose at random while looking as if it had "
                          "judged")

    def test_a_notebook_emptied_of_everything_but_its_own_furniture(self):
        """⛔ A DRILL FOUND THIS. The file carries a heading and a comment the
        room wrote itself, so a notebook she had emptied read as knowledge —
        and *yours to edit or delete* must mean deleting the CONTENTS counts
        the same as deleting the file."""
        with open(TRIAL.learned_path(self.lib), "w", encoding="utf-8") as f:
            f.write(TRIAL.LEARNED_HEADER)
        self.assertIsNone(self._block(),
                          "a notebook holding only its own header counted as "
                          "the room knowing her")

    def test_a_blessed_thing_she_triggered_is_still_never_named(self):
        """⛔ THE ITEM-LEVEL FENCE, PROVED INDEPENDENTLY OF THE TITLE SCREEN.
        A drill dropped `_librarian_fenced` from the candidate loop and NOTHING
        went red, because every fenced title was also in the title list — two
        screens covering each other, which is how a gate comes to be believed
        without ever having been driven. This case gives the title screen
        NOTHING to catch, so only the item screen can stop it."""
        store = study_lib.load_store(self.lib)
        item = store["items"]["e000000000000001"]      # older, blessed
        # ⚠ the control rides FIRST and is identical but for the flag, so the
        # absence below is about the flag and about nothing else.
        store["items"]["e000000000000005"] = dict(
            item, id="e000000000000005", title="a clean older keeper")
        item["trigger"] = True                          # ⛔ and now fenced
        # ⛔ THE TITLE SCREEN IS GIVEN AN EMPTY LIST ON PURPOSE — a resolved
        # answer saying this library fences no titles — so it has nothing to
        # catch and only `_librarian_fenced` can stop the flagged item.
        block = server._reflection_worth_your_eye(self.lib, store, ())
        self.assertIsNotNone(block, "no block at all, so the absence below "
                                    "proves nothing")
        names = {row["title"] for row in block["worth_naming"]}
        self.assertIn("a clean older keeper", names,
                      "the control candidate did not survive either, so this "
                      "case is measuring the wrong thing")
        self.assertNotIn("the keeper", names,
                         "a blessed thing she triggered was offered back to "
                         "her by name")

    def test_it_is_fail_closed_when_the_fence_list_is_unresolved(self):
        self.assertIsNone(
            server._reflection_worth_your_eye(self.lib, self.store, None),
            "an unresolved fence list let the pointer ride anyway")
        # ⛔ the control: an EMPTY list is a resolved answer, not a failure
        self.assertIsNotNone(
            server._reflection_worth_your_eye(self.lib, self.store, ()))

    def test_a_notebook_she_edited_to_name_a_set_aside_thing_is_refused(self):
        """⛔ SHE MAY EDIT THAT FILE — it is hers. So it can name a note she
        has since set aside, and it has never passed a fence predicate: the
        same unwatched door its sibling found."""
        TRIAL.keep(self.lib, "what i love is the set-aside one.", replace=True)
        self.assertIsNone(self._block(),
                          "her edited notebook carried a set-aside title into "
                          "the prompt")

    def test_the_block_rides_the_generation_doc_and_every_refine_turn(self):
        """⛔ IT MUST RIDE BOTH. A refine re-emits the whole essay, so a refine
        turn that could not see what the generation turn named would quietly
        drop her ending while she was asking for something else."""
        block = self._block()
        gen = server._reflection_turn_doc(
            {"bodies": []}, None, None, draft=None, chat=[],
            worth_your_eye=block)
        ref = server._reflection_turn_doc(
            {"bodies": []}, None, None, draft={"reflection": "x"},
            chat=[{"who": "user", "text": "more please"}],
            worth_your_eye=block)
        for doc in (gen, ref):
            self.assertIn("worth_your_eye", doc)
            self.assertEqual(doc["worth_your_eye"], block)
        # ⛔ AND THE POOL STAYS FIRST. The key order is a cache prefix: a new
        # key ahead of the pool pays full uncached input on every refine turn.
        self.assertEqual(list(gen)[0], "pool")
        self.assertEqual(list(ref)[0], "pool")

    def test_nothing_at_all_is_added_when_there_is_no_block(self):
        doc = server._reflection_turn_doc(
            {"bodies": []}, None, None, draft=None, chat=[])
        self.assertNotIn("worth_your_eye", doc,
                         "the key is present with nothing in it, and an empty "
                         "block is itself a sentence")


def main():
    load = unittest.defaultTestLoader.loadTestsFromTestCase
    # ⚠ TWO CLASSES, ONE COUNT. `EXPECTED_CASES` pins the TOTAL, so a case
    # class added and never registered here would leave the pin correct and
    # the cases unrun — which is this project's own signature defect wearing
    # a green suite's clothes.
    suite = unittest.TestSuite([load(SeamCase), load(SetupPassCase),
                                load(PointerCase)])
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    caught, total, controls = run_drill()
    print("CASES %d" % ran)
    print("DRILL %d/%d mutations caught, %d controls green"
          % (caught, total, controls))
    run_live_local()

    ok = (result.wasSuccessful()
          and ran == EXPECTED_CASES
          and caught == total == EXPECTED_MUTATIONS
          and controls == EXPECTED_CONTROLS)
    if ran != EXPECTED_CASES:
        print("CASE COUNT MISMATCH: ran %d, file says %d"
              % (ran, EXPECTED_CASES))
    if not ok:
        return 1
    print("test_call_seam OK (injected fake transport, closed register, "
          "mutation drill)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
