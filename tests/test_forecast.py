"""THE FORECAST — one figure, once, and SILENCE where the room does not know.

⚠ WHAT THIS FILE IS FOR (26.99-10, D-04 and D-01). Money appears in the
room in exactly ONE place: a rounded-up bound, said once, immediately
before the expensive action. Everywhere else the room counts TOKENS. This
suite is what keeps both halves of that true — the one figure, and the
silence around it.

⚠⚠ THE UNIT IS WHOLE CENTS, AND IT CHANGED BY HER RULING (26.99-14, G-5).
It was a rounded-up WHOLE DOLLAR until 2026-08-17, when she saw a
few-cents reflection render as "1 dollar" while the room's own help page
says reflections are well under a dollar each, and ruled "show the real
cents instead of rounding up". ⛔ That KNOWINGLY OVERTURNS D-04's
rounded-up-dollar bound; the overturn is hers, made live, with the reason
recorded. A later reader who re-derives the whole dollar from D-04's text
has reinstated something she overturned. The arithmetic is unchanged —
only the rounding scale moved, it still rounds UP, and a genuinely
sub-cent non-zero figure is ONE CENT, never zero.

⚠⚠ AND THE NOTATION IS HERS TOO (26.99-15, G-7). The cents broke the
"x dollar" ending of her §S-07 sentence, so at the UAT she was asked and
chose `$` notation — the rendered form the report records is "…the estimate
will be $0.03." At a blocking checkpoint on 26.99-15 she was then asked where
the symbol belongs, in her sentence or on the number the room fills in, and
answered, verbatim: "On the number". ⛔ So her sentence gains NO new
character: the ONE edit authorised anywhere in it is the removal of the
trailing word, and the `$` arrives through the substitution. Both
instruments — the UAT ruling and the checkpoint answer — are named at the
cases below, because either alone would be a lesser authorisation than the
one that was actually given.

⛔⛔ THE ONE THING IT EXISTS TO PREVENT IS A GUESS WEARING A FACT'S CLOTHES.
A price table ages. A price table that FALLS BACK on a miss ages
invisibly: it keeps answering, in dollars, about a model nobody priced.
26.93 measured that one of the shipped default fills is an ALIAS the
provider answers as a longer, dated id — so "the model the table was
keyed on" and "the model that answered" are already, today, one live call
apart. A table keyed on the answering model must therefore go SILENT on
the alias rather than reach for the shorter id it resembles, and that case
is driven here from the real measured shape rather than imagined.

⚠ SILENCE AND ZERO ARE DIFFERENT ANSWERS, AND THE DIFFERENCE IS THE RULE.
`0` means "no calls, therefore nothing"; silence means "I do not know what
this costs". Both are falsy, so a checker written as `if not figure:`
conflates them and renders a room that does not know as a room that knows
it is free. One case below fails if they are ever conflated, and it is
written so that the failure is legible rather than clever.

⚠ COMPUTED FOR DISPLAY, NEVER STORED (D-01, and the shipped gate agrees).
`tests/test_server_smoke.py` already asserts `cost_usd` is absent from the
run record. This suite asserts it over the ROUND-TRIPPED BYTES of BOTH
records — the run record and 26.99-03's call record — AT ANY DEPTH, after
driving a real pass to completion through the injected transport. Depth is
the point: the defects this project has collected were one level down,
inside a property, which is exactly how they stayed invisible.

⚠ THE STATIC HALVES RUN OVER COMMENT-STRIPPED, STRING-STRIPPED SOURCE
(B-2). This file and `server.py` both write a great deal of prose
containing exactly the tokens a naive scan would search for — `cost_usd`
and a dollar sign appear in this very docstring. ⚠ A PYTHON DOCSTRING IS
NOT A '#' COMMENT; `tokenize` knows the difference and does not have to be
taught it. Where the claim is structural rather than textual the check is
an `ast` walk, which carries no comments and no docstrings at all.

⛔ NO REAL CALL IS POSSIBLE FROM HERE. `librarian_call._transport` — the
seam's one transport hook — is swapped for a fake that answers instantly
and REFUSES any credential. Everything runs on the local rung, which takes
none. ⛔ No key value is read, printed, masked-and-printed or written
anywhere. A live paid Anthropic key is on this machine.

⛔ IT NEVER TOUCHES THE REAL HOME. Every live case runs inside a temporary
HOME and the helper REFUSES TO YIELD unless `study_lib.room_config_dir()`
actually resolved inside that temporary directory — a structural guard,
not a promise in a comment, because the call record's home is the room's
own config directory and that is a directory she really has.

⚠ THE CASE COUNT IS ASSERTED BY VALUE (B-3). A run that examined zero
cases must be legible as such rather than printing a cheerful line about a
loop it never entered.

Run: `TMPH=$(mktemp -d); HOME="$TMPH" python3 tests/test_forecast.py`
"""

import ast
import contextlib
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import tokenize
import types
import unittest
from fractions import Fraction
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import study_lib          # noqa: E402
import librarian_call     # noqa: E402
import server             # noqa: E402  — imported for bind_job_literals


# ---------------------------------------------------------------------------
# ---- the subjects, named once ---------------------------------------------

# The job whose call is THE expensive action: the sitting's reflection. Its
# tier is `good-cloud` and its `max_tokens` is the largest in the table,
# which is exactly why it is the one place a price is owed.
EXPENSIVE_JOB = "reflection"

# ⚠ THE MEASURED ALIAS SHAPE. 26.93 found that a shipped default fill is an
# alias the provider answers as a longer, dated id. The exact dated id is
# not the point and is deliberately not claimed as fact here — the SHAPE is:
# a longer string that begins with a priced id. A table that prefix-matches
# would price it; a table keyed on exact pairs cannot, and must be silent.
ALIAS_SUFFIX = "-20251001"

# A model id nobody has ever priced. ⛔ Not a real id and never sent
# anywhere — it exists only to be missed.
UNKNOWN_MODEL = "claude-nonesuch-9"

# ⚠⚠ THE MEASURED SONNET PAIR, AND THE ONE PATH THAT REACHES IT.
# 26.99-14 (G-6). The room offers opus / sonnet / haiku as a VOICE alias, but
# measured 2026-08-17: `voice_model` NO LONGER REACHES A CALL (server.py says
# so in its own docstring), and `LIBRARIAN_CONNECT_MODEL` / `CONFIG_MODEL` —
# both the string "sonnet" — have ZERO call sites and are members of
# tests/test_call_seam.py's SEAM_FORBIDDEN_ARGS. `ANTHROPIC_FILLS` resolves
# the cloud tiers only to haiku-4-5 and opus-5.
#
# ⛔ So the ONLY path that installs this pair is HER OWN SETTINGS FILE, and it
# works because `resolve_routing`'s stored-fills loop checks SHAPE, NOT
# MEMBERSHIP — deliberately, with the reason written at that site. The shell
# is gated by `allowed_fill`; her own file is not. Both halves are DRIVEN
# below rather than asserted in prose.
#
# ⚠ THIS IS A SECOND LITERAL OF THE ID, and that is deliberate rather than an
# oversight. The gate it feeds must have its two sides in DIFFERENT MODULES or
# it moves with the thing it judges; a drift between this and `server.py`'s row
# goes RED in `test_the_sonnet_path_she_can_reach_is_priced` rather than
# passing quietly.
SONNET_PAIR = ("anthropic", "claude-sonnet-5")

# The client-side field the room reads to render the forecast. Named once
# here so the render-scope case measures the SITE rather than a guess.
RENDER_FIELD = "forecast_line"

# The two renders `tests/test_display_fence.cjs` guards, verbatim from that
# gate's own `RENDERS` list. ⛔ The forecast must render OUTSIDE both, and
# this suite MEASURES that rather than assuming it (L-05).
GUARDED_RENDERS = ("renderLibrarianProgress", "renderLibrarianRunState")

# Money in every shape a stored record could wear it. The record's own
# suite owns the full register; this one asks a narrower question — the
# price key specifically — plus the currency symbols, at any depth.
PRICE_KEY_WORDS = ("cost_usd", "cost", "price", "usd", "dollar", "cent")
MONEY_SYMBOLS = ("$", "€", "£", "¥", "₹", "¢")

# ⚠⚠ HER §S-07 SENTENCE, LIFTED PROGRAMMATICALLY OUT OF 26.99-COPY.md's
# FENCED BLOCK AND ⛔ NEVER RETYPED BY ANY AGENT. 26.99-15's executor ran the
# lift (read the block after the `## S-07` heading, assert it is one line,
# embed the bytes), and compared them against the shipped constant before
# anything moved.
#
# ⛔ IT IS NOT READ FROM THAT FILE AT RUN TIME. The planning record lives
# outside this repo; a tracked test may not carry an absolute path into
# somebody's iCloud folder, and such a path would not survive
# `tools/stage_public.py` either. So the bytes are carried here, and the lift
# is the provenance.
#
# ⚠ THIS IS A SECOND LITERAL OF HER SENTENCE, and that is deliberate rather
# than an oversight — the same reasoning `SONNET_PAIR` above is written for. A
# pin whose two sides live in ONE module moves with the thing it judges and can
# never go red. This side lives here; the side it judges is
# `server.FORECAST_MSG`, one module away.
HER_S07_SENTENCE = "This task may consume a good amount power for librarian's brain, the estimate will be x dollar."  # noqa: E501

# ⚠⚠ THE ONE EDIT AUTHORISED ANYWHERE IN HER SENTENCE, AND THE TWO INSTRUMENTS
# THAT AUTHORISE IT: her G-7 ruling at the UAT, where she chose `$` notation
# for the cents, PLUS her checkpoint answer on 26.99-15 ("On the number"). The
# deletion is unavoidable rather than chosen — `$0.30 dollar.` is not what she
# approved, and no shape reaches her approved rendering while keeping the word.
# ⛔ No agent proposed a phrasing at any point.
THE_AUTHORISED_DELETION = " dollar"

# ⚠⚠ AND THE LIFTED COPY IS ITSELF PINNED TO THE RECORD, on 26.99-13's own
# precedent in `tests/test_spend_record.py`. A lifted copy is still a copy: it
# was byte-identical on the day it was lifted, and nothing but an instrument
# keeps it that way. ⛔ The copy record lives OUTSIDE this repo, in the
# planning tracker, and its path is personal — so it is NOT hardcoded here,
# because that would put the owner's real directory layout into a published
# file. The path arrives in the environment; when it is absent the pin cannot
# run, and `main()` PRINTS THAT BY VALUE rather than reporting a cheerful
# green.
COPY_RECORD_ENV = "STUDY_ROOM_COPY_RECORD"

PINNED = {"source": "", "sentences": 0}

# The slot as it stands in her sentence, with the space before it — used to
# state the whole rendered line BY VALUE without deriving it from
# `server.py`'s own regex, which would be the same mirror this suite keeps
# refusing elsewhere.
HER_SLOT_WITH_THE_WORD = " x dollar."

# What the live half actually drove, so `main` can state it BY VALUE.
DRIVEN = {"passes": 0, "calls": 0, "figures": 0, "silences": 0}


# ---------------------------------------------------------------------------
# ---- the strippers (B-2) --------------------------------------------------

def strip_py_source(src):
    """`src` with every comment AND every string literal blanked, line
    count preserved, so a static scan reads CODE rather than prose.

    ⚠ A PYTHON DOCSTRING IS NOT A '#' COMMENT. The shipped `stripPyComments`
    in tests/test_no_push.cjs blanks '#'-leading lines only, and its own
    neighbouring warning records that 26.94-02 turned a pin red TWICE from
    prose that survived it. A file that cannot be tokenized is returned
    unchanged — fail-visible, since the caller's assertion then reads the
    prose and says so, rather than passing quietly on an empty string."""
    lines = src.split("\n")
    try:
        toks = list(tokenize.generate_tokens(io.StringIO(src).readline))
    except (tokenize.TokenError, IndentationError, SyntaxError):
        return src
    for tok in toks:
        if tok.type not in (tokenize.COMMENT, tokenize.STRING):
            continue
        (srow, scol), (erow, ecol) = tok.start, tok.end
        for row in range(srow, min(erow, len(lines)) + 1):
            line = lines[row - 1]
            a = scol if row == srow else 0
            b = ecol if row == erow else len(line)
            lines[row - 1] = line[:a] + " " * max(0, b - a) + line[b:]
    return "\n".join(lines)


def strip_js_comments(src):
    """`src` with `//` and `/* */` comments blanked, line count preserved.
    String literals are LEFT ALONE here on purpose: the render-scope case
    below is asking where a rendered field is read, and that read is a
    string."""
    out = []
    i = 0
    n = len(src)
    while i < n:
        two = src[i:i + 2]
        if two == "/*":
            j = src.find("*/", i + 2)
            j = n if j == -1 else j + 2
            out.append("".join(c if c == "\n" else " " for c in src[i:j]))
            i = j
        elif two == "//":
            j = src.find("\n", i)
            j = n if j == -1 else j
            out.append(" " * (j - i))
            i = j
        else:
            out.append(src[i])
            i += 1
    return "".join(out)


def stripped_source_of(obj):
    """One function's source, comments and string literals blanked."""
    import inspect
    return strip_py_source(textwrap.dedent(inspect.getsource(obj)))


def read_source(name):
    return (REPO_ROOT / name).read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# ---- the harness ----------------------------------------------------------

@contextlib.contextmanager
def temp_home():
    """A throwaway HOME, with a STRUCTURAL guard that the room's config
    directory really resolved inside it.

    ⛔ The guard is not politeness. The call record lives beside the keys
    file in `~/.study-room`, which is a directory she really has, holding a
    real paid key. A suite that wrote there would be writing into the very
    custody these files exist to prove."""
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-forecast-")
    os.environ["HOME"] = tmp
    try:
        resolved = str(study_lib.room_config_dir())
        if not resolved.startswith(str(Path(tmp).resolve()) + os.sep) \
                and not resolved.startswith(tmp + os.sep):
            raise AssertionError(
                "the room's config directory resolved OUTSIDE the "
                "temporary home — refusing to run rather than write "
                "anywhere near a real one")
        yield Path(tmp)
    finally:
        if prior is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = prior
        shutil.rmtree(tmp, ignore_errors=True)


@contextlib.contextmanager
def fake_transport():
    """The SHIPPED injection point, swapped and put back.

    ⛔ There is deliberately no environment variable and no config key that
    selects a transport, so a stray value in somebody's shell can never
    steer a production call. A second injection mechanism invented here
    would end that property."""
    seen = []

    def _fake(request, timeout_s, auth=None):
        if auth is not None:
            raise AssertionError(
                "a credential reached the transport on the local rung — "
                "the local rung takes none, and this suite holds none")
        seen.append(request.get("url"))
        envelope = {
            "model": "qwen2.5:7b",
            "done_reason": "stop",
            "message": {"content": json.dumps({"verdicts": []})},
            "prompt_eval_count": 11,
            "eval_count": 22,
        }
        return (200, {}, json.dumps(envelope).encode("utf-8"))

    prior = librarian_call._transport
    librarian_call._transport = _fake
    try:
        yield seen
    finally:
        librarian_call._transport = prior


def routing_with(tier, fill):
    """A routing object carrying ONE fill, for ONE tier.

    ⚠ It is built by hand rather than resolved, because the question this
    suite asks is "what does the table do with THIS pair" — and several of
    the pairs below (the alias, the unknown id) cannot be produced by a
    real resolution at all. `_answering_fill` reads `routing.fills` and
    nothing else, so this is the same object shape it always sees."""
    return types.SimpleNamespace(fills={tier: fill})


def tier_of(job):
    return (librarian_call.JOBS.get(job) or {}).get("tier")


def routing_for(job, fill):
    return routing_with(tier_of(job), fill)


def local_routing():
    """The real resolution against an empty shell and empty settings — so
    `import_presort` lands on her own machine and nothing needs a key."""
    return librarian_call.resolve_routing({}, environ={})


def forecast(job, calls, routing):
    """`server.forecast_usd`, or a failure that NAMES the missing symbol.

    ⚠ This exists so the RED half of this plan fails legibly. Without it
    every case dies on an AttributeError inside a helper and the output
    blames the harness rather than the work that has not landed."""
    fn = getattr(server, "forecast_usd", None)
    if fn is None:
        raise AssertionError(
            "server.forecast_usd does not exist yet — the rounded-up "
            "bound, computed for display and never stored (D-04)")
    out = fn(job, calls, routing)
    if out is None:
        DRIVEN["silences"] += 1
    else:
        DRIVEN["figures"] += 1
    return out


def prices():
    """`server.LIBRARIAN_PRICES`, or a failure that names it."""
    table = getattr(server, "LIBRARIAN_PRICES", None)
    if table is None:
        raise AssertionError(
            "server.LIBRARIAN_PRICES does not exist yet — the price "
            "table, in the repo, keyed on the ANSWERING model (D-04)")
    return table


def a_priced_pair():
    """One `(provider, model)` the shipped table knows, chosen
    deterministically so a failure names the same pair every run."""
    keys = sorted(prices().keys())
    if not keys:
        raise AssertionError("the price table is empty — nothing to price")
    return keys[0]


def dearest_priced_pair():
    """The priced pair with the highest rate — used where a case wants a
    figure large enough to be interesting without pinning a number."""
    table = prices()
    return sorted(table.keys(), key=lambda k: (table[k], k))[-1]


def exact_cent_fraction(per_call, calls, rate):
    """The figure as an EXACT RATIONAL, in cents — this suite's own
    instrument for the arithmetic `server.forecast_usd` performs.

    ⚠⚠ DELIBERATELY A DIFFERENT INSTRUMENT FROM THE CODE'S. `server.py` uses
    `Decimal` with `ROUND_CEILING`; this uses `Fraction`, which is exact
    rational arithmetic with no rounding mode at all. Two different exact
    instruments agreeing is evidence; a test that recomputed with the SAME
    expression the code uses would mirror the code and could only ever
    confirm it — the defect shape this project keeps hitting.

    ⛔ AND THE MIRROR HERE WAS REAL, NOT HYPOTHETICAL. Until 2026-08-17 this
    suite recomputed with `math.ceil(exact * 100)`, the same float expression
    the plan specified for the code. Driven, that expression disagrees with
    exact arithmetic in NINETEEN of the shipped job/rate/call-count
    combinations — `0.14 * 100` is `14.000000000000002`, so it answers 15
    cents for a figure that is exactly 14. Had both sides used it, both would
    have been wrong together and green."""
    return (Fraction(per_call) * Fraction(calls) * Fraction(str(rate))
            / Fraction(10_000))


def exact_cents(per_call, calls, rate):
    """`exact_cent_fraction` rounded UP to a whole cent, in integers only."""
    q = exact_cent_fraction(per_call, calls, rate)
    whole = q.numerator // q.denominator
    return whole + 1 if q.numerator % q.denominator else whole


def producible_pair(pair):
    """Can `librarian_call.resolve_routing` hand this exact pair back?

    ⛔ DRIVEN, NOT DERIVED, AND DELIBERATELY CROSS-MODULE. The question is
    asked of `librarian_call` — a different module from the `server.py` table
    it judges — by building the settings shape she could really write and
    resolving it. A predicate that compared the table against a second list
    inside `server.py` would put both sides of the gate in one file, where
    they move together and the gate can never go red for the change it
    polices."""
    for tier in librarian_call.TIERS:
        try:
            routing = librarian_call.resolve_routing(
                {"fills": {tier: list(pair)}}, environ={})
        except Exception:
            return False
        if routing.fills.get(tier) == tuple(pair):
            return True
    return False


def cheapest_priced_pair():
    """The priced pair with the LOWEST rate — used by the sub-cent case, which
    needs a combination whose exact figure lands above zero and below a cent."""
    table = prices()
    return sorted(table.keys(), key=lambda k: (table[k], k))[0]


def smallest_job():
    """The job with the smallest `max_tokens`, DERIVED from `librarian_call`
    rather than named here.

    ⚠ Derived on purpose: the expensive job cannot produce a fractional cent at
    any shipped rate (6000 x calls x 25.0 / 1e6 lands on whole cents every
    time), so the cent-scale cases need a small job — and naming one would rot
    the next time a job is added or deleted. Two were deleted on 2026-08-17."""
    rows = []
    for job, row in librarian_call.JOBS.items():
        per_call = row.get("max_tokens")
        if isinstance(per_call, int) and not isinstance(per_call, bool):
            rows.append((per_call, job))
    if not rows:
        raise AssertionError("no job carries an integer max_tokens")
    return sorted(rows)[0][1]


def sonnet_routing():
    """A routing carrying the sonnet pair, RESOLVED THROUGH HER SETTINGS FILE.

    ⛔ Deliberately NOT a hand-built SimpleNamespace: the whole point of this
    path is that `resolve_routing` ACCEPTS a stored fill the allow-list does not
    hold, so the resolution itself is the thing under test."""
    tier = tier_of(EXPENSIVE_JOB)
    return librarian_call.resolve_routing(
        {"fills": {tier: list(SONNET_PAIR)}}, environ={})


def copy_record_text():
    """The copy record, or None when the path was not supplied."""
    raw = os.environ.get(COPY_RECORD_ENV, "").strip()
    if not raw:
        return None
    path = Path(raw)
    if not path.is_file():
        raise AssertionError(
            "%s points at something that is not a file: %r"
            % (COPY_RECORD_ENV, raw))
    return path.read_text(encoding="utf-8")


def fenced_block(text, heading):
    """The first fenced block after `## <heading>` — byte-for-byte, less the
    single newline the fence itself contributes."""
    at = text.find("\n## " + heading)
    if at == -1:
        raise AssertionError("the copy record has no section %r" % (heading,))
    open_fence = text.find("\n```", at)
    if open_fence == -1:
        raise AssertionError("no fenced block under %r" % (heading,))
    body_start = text.find("\n", open_fence + 1) + 1
    close_fence = text.find("\n```", body_start)
    if close_fence == -1:
        raise AssertionError("unterminated fenced block under %r" % (heading,))
    return text[body_start:close_fence]


def cloud_routing():
    """The routing a room with a cloud key really resolves to.

    ⛔ NO KEY VALUE, AND NONE IS NEEDED. `resolve_routing` asks only whether a
    credential is PRESENT, so a placeholder that is plainly not a key answers
    the question; it is never printed and never sent. A live paid Anthropic key
    is on this machine and this suite holds none.

    ⚠ Resolved rather than hand-built, because the figure this suite states BY
    VALUE is the one the ROOM shows — `forecast_block` calls
    `resolve_librarian_routing`, and a hand-built fill would be this suite
    choosing the answering model instead of measuring it."""
    return librarian_call.resolve_routing(
        {}, environ={"ANTHROPIC_API_KEY": "not-a-key"})


def combo_for_cents(target):
    """A `(job, calls, routing)` whose exact figure is `target` whole cents,
    or None.

    ⚠ SEARCHED OVER THE SHIPPED JOBS AND PRICES, NEVER NAMED HERE. Two jobs
    were deleted on 2026-08-17, so a case that named one would rot on the next
    deletion; and the figure is monotonic in the call count, so the search
    stops the moment it passes the target."""
    table = prices()
    for pair in sorted(table):
        rate = table[pair]
        for job in sorted(librarian_call.JOBS):
            per_call = (librarian_call.JOBS.get(job) or {}).get("max_tokens")
            if isinstance(per_call, bool) or not isinstance(per_call, int):
                continue
            for calls in range(0, 1001):
                cents = exact_cents(per_call, calls, rate)
                if cents == target:
                    return job, calls, routing_for(job, pair)
                if cents > target:
                    break
    return None


def allowed_fills():
    """Every `(provider, model)` pair the shipped allow-list holds."""
    out = set()
    for pairs in librarian_call.TIER_FILLS_ALLOWED.values():
        for pair in pairs:
            out.add(tuple(pair))
    return out


def walk(node, where="doc"):
    """Yield (where, key, value) for every scalar at any depth."""
    if isinstance(node, dict):
        for key, value in node.items():
            yield where, str(key), value
            yield from walk(value, where + "." + str(key))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield where + "[%d]" % i, None, value
            yield from walk(value, where + "[%d]" % i)


def price_offenders(doc):
    """Every place in `doc` that carries a price, at any depth."""
    out = []
    for where, key, value in walk(doc):
        if key is not None:
            low = key.lower()
            if any(word in low for word in PRICE_KEY_WORDS):
                out.append("key %s at %s" % (key, where))
        if isinstance(value, str):
            if any(sym in value for sym in MONEY_SYMBOLS):
                out.append("currency symbol in value at %s" % where)
            if "cost_usd" in value.lower():
                out.append("price key spelled in a value at %s" % where)
    return sorted(set(out))


def body_batches(count):
    """`count` body batches, one planted id each."""
    out = []
    for i in range(count):
        item_id = "forecast-%06d" % i
        out.append({
            "ids": [item_id],
            "text": json.dumps(
                {"bodies": [{"id": item_id,
                             "text": "a planted body, long enough to be "
                                     "read by the sorting half."}]},
                ensure_ascii=False, separators=(",", ":")),
        })
    return out


def reset_jobs():
    # ⚠ ONE JOB DICT, NOT TWO, SINCE 2026-08-17: `CLEAN_JOB` was the deleted
    # labelling scan's snapshot and went with it (#95). The readability pass
    # runs inside its own request and keeps no run state to reset.
    for job in (server.LIBRARIAN_JOB,):
        job.update(state="idle", total=0, done=0, message=None)


def drive_one_pass(home):
    """One import pass to completion under a temporary HOME. Returns the
    run-record document and the call-record bytes the run left on disk."""
    reset_jobs()
    sugg = home / "library" / "librarian" / "suggestions.json"
    sugg.parent.mkdir(parents=True, exist_ok=True)
    with fake_transport() as seen:
        server._presort_worker(body_batches(2), str(sugg), "api-key", False,
                               1_700_000_000_000,
                               routing=local_routing())
    DRIVEN["passes"] += 1
    DRIVEN["calls"] += len(seen)
    record_path = Path(study_lib.call_record_path())
    try:
        record_bytes = record_path.read_bytes()
    except OSError:
        record_bytes = b""
    return study_lib.load_suggestions(str(sugg)), record_bytes


# ---------------------------------------------------------------------------

class ForecastTest(unittest.TestCase):

    # -- the figure --------------------------------------------------------

    def test_a_known_answering_model_gives_a_figure_in_whole_cents(self):
        """The room knows this pair, so it says a number — a whole number of
        CENTS, as an `int`.

        ⚠⚠ THE UNIT CHANGED, AND THE AUTHORISATION IS HERS. 26.99-14 (G-5):
        she saw a few-cents reflection render as "1 dollar" while the room's
        own help page says reflections are well under a dollar each, and ruled
        "show the real cents instead of rounding up". ⛔ That KNOWINGLY
        OVERTURNS D-04's rounded-up-DOLLAR bound. A later reader who
        re-derives the whole-dollar unit from D-04's text has reinstated
        something she overturned live, with the reason recorded.

        ⛔ Still an `int` and never a float: `0` must stay the integer `0` so
        the silence-vs-zero case keeps holding, and no float ever reaches a
        comparison where representation error could move a bound by a cent."""
        pair = dearest_priced_pair()
        figure = forecast(EXPENSIVE_JOB, 2, routing_for(EXPENSIVE_JOB, pair))
        self.assertIsNotNone(
            figure, "a priced pair produced silence: " + repr(pair))
        self.assertIsInstance(figure, int)
        self.assertNotIsInstance(figure, bool)
        self.assertGreaterEqual(figure, 1)

    def test_the_figure_equals_an_independent_recompute(self):
        """⚠ RECOMPUTED FROM RAW INPUTS, NOT READ (B-5). A test that reads
        the same expression the code reads proves nothing about the value.
        The arithmetic is re-derived here from `JOBS[job]['max_tokens']`,
        the call count and the table's own rate — now at CENT scale, and in
        EXACT RATIONAL arithmetic rather than the code's `Decimal`, so the
        two sides cannot share a rounding defect (see
        `exact_cent_fraction`)."""
        pair = dearest_priced_pair()
        rate = prices()[pair]
        per_call = librarian_call.JOBS[EXPENSIVE_JOB]["max_tokens"]
        calls = 3
        mine = exact_cents(per_call, calls, rate)
        self.assertEqual(
            forecast(EXPENSIVE_JOB, calls, routing_for(EXPENSIVE_JOB, pair)),
            mine,
            "the shipped bound and this file's own arithmetic disagree")

    def test_the_figure_moves_when_the_rate_moves(self):
        """⚠ AND THE MUTATION IS THE ASSERTION. An equality alone is
        tautological; a bound that does not move when its one input moves
        is not reading the table at all."""
        pair = dearest_priced_pair()
        table = prices()
        before = forecast(EXPENSIVE_JOB, 2, routing_for(EXPENSIVE_JOB, pair))
        prior = table[pair]
        try:
            table[pair] = prior * 10
            after = forecast(EXPENSIVE_JOB, 2,
                             routing_for(EXPENSIVE_JOB, pair))
        finally:
            table[pair] = prior
        self.assertGreater(
            after, before,
            "ten times the rate produced no larger a bound — the forecast "
            "is not reading the table")
        self.assertEqual(prices()[pair], prior, "the table was left mutated")

    def test_rounding_is_always_upward(self):
        """⛔ A BOUND, NEVER AN ESTIMATE OF THE MEAN — now at CENT scale. The
        figure is never below the exact cent arithmetic, and a fractional
        exact value is rounded UP rather than to nearest.

        ⚠ TWO JOBS, NOT ONE, AND THE SECOND IS WHY. The expensive job cannot
        produce a fractional cent at any shipped rate — 6000 x calls x 25.0
        / 1e6 x 100 lands on a whole cent every time — so a loop over it alone
        would assert the ceiling without ever exercising one. The smallest job
        is derived from `librarian_call.JOBS` and supplies the fractions; the
        run FAILS if none was seen."""
        jobs = (EXPENSIVE_JOB, smallest_job())
        seen_fraction = False
        examined = 0
        for job in jobs:
            per_call = librarian_call.JOBS[job]["max_tokens"]
            for pair, rate in sorted(prices().items()):
                for calls in range(1, 12):
                    exact = exact_cent_fraction(per_call, calls, rate)
                    figure = forecast(job, calls, routing_for(job, pair))
                    self.assertIsNotNone(
                        figure,
                        "a priced pair produced silence: %r on %s"
                        % (pair, job))
                    self.assertGreaterEqual(
                        figure, exact,
                        "the bound fell BELOW the exact cent arithmetic at "
                        "%d call(s) of %s on %r" % (calls, job, pair))
                    self.assertEqual(
                        figure, exact_cents(per_call, calls, rate),
                        "not a ceiling at %d call(s) of %s on %r"
                        % (calls, job, pair))
                    examined += 1
                    if exact.denominator != 1:
                        seen_fraction = True
        self.assertGreater(examined, 0, "the loop never ran")
        self.assertTrue(
            seen_fraction,
            "no fractional-CENT case was examined — the rounding claim was "
            "never actually exercised")

    def test_doubling_the_calls_at_least_doubles_the_figure(self):
        pair = dearest_priced_pair()
        one = forecast(EXPENSIVE_JOB, 4, routing_for(EXPENSIVE_JOB, pair))
        two = forecast(EXPENSIVE_JOB, 8, routing_for(EXPENSIVE_JOB, pair))
        self.assertGreaterEqual(two, 2 * one - 1)
        self.assertGreater(two, one)

    def test_a_sub_cent_figure_is_one_cent_and_never_zero(self):
        """⛔ A GENUINELY SUB-CENT NON-ZERO FIGURE RENDERS AS ONE CENT.
        A room that answered "nothing" for a call that costs something would
        be the same guess D-04 forbids, one decimal place down. `0` is
        reserved for `calls == 0`.

        ⚠⚠ THIS CASE IS GREEN BEFORE AND AFTER THE CHANGE IT SHIPS WITH, AND
        ITS GREEN IS NOT EVIDENCE FOR G-5. Driven both ways at exact = 0.003:
        the shipped whole-dollar `whole + 1 if exact > whole else whole` gives
        `whole = 0`, `0.003 > 0`, therefore 1; the fixed
        `math.ceil(0.003 * 100)` also gives 1. IDENTICAL. It is carried
        because it goes RED on a later `ceil` -> `round` swap (T-26.99-72),
        and it is labelled here so no later reader cites its green as proof of
        the cent-scale change."""
        job = smallest_job()
        pair = cheapest_priced_pair()
        per_call = librarian_call.JOBS[job]["max_tokens"]
        exact = per_call * 1 * prices()[pair] / 1_000_000.0
        self.assertGreater(
            exact, 0,
            "the fixture is wrong: this combination costs nothing")
        self.assertLess(
            exact, 0.01,
            "the fixture is wrong: %r on %s is not sub-cent (%.6f) — the "
            "table moved and this case is no longer exercising the rule"
            % (pair, job, exact))
        self.assertEqual(
            forecast(job, 1, routing_for(job, pair)), 1,
            "a sub-cent non-zero figure did not render as one cent")

    # -- the silence -------------------------------------------------------

    def test_an_unknown_model_is_silent(self):
        """⛔ NEVER A GUESS, NEVER A ZERO."""
        pair = ("anthropic", UNKNOWN_MODEL)
        self.assertNotIn(pair, prices())
        self.assertIsNone(
            forecast(EXPENSIVE_JOB, 2, routing_for(EXPENSIVE_JOB, pair)),
            "an unpriced model produced a figure — the table guessed")

    def test_the_measured_alias_case_is_silent(self):
        """⛔ THE ALIAS, DRIVEN. A provider that answers as a longer, dated
        id gives the seam a model the table does not hold. The table must
        go SILENT rather than fall back to the shorter id it resembles —
        and the control in the same case proves the shorter id IS priced,
        so the silence is about the alias and not about the pair."""
        provider, model = dearest_priced_pair()
        self.assertIsNotNone(
            forecast(EXPENSIVE_JOB, 2,
                     routing_for(EXPENSIVE_JOB, (provider, model))),
            "the control failed: the short id is not priced either")
        aliased = (provider, model + ALIAS_SUFFIX)
        self.assertNotIn(aliased, prices())
        self.assertIsNone(
            forecast(EXPENSIVE_JOB, 2, routing_for(EXPENSIVE_JOB, aliased)),
            "the dated alias was priced as if it were the short id — the "
            "table prefix-matched, which is the guess this rule forbids")

    def test_a_provisional_provider_is_never_priced(self):
        """⛔ 26.93 left the OpenAI model ids PROVISIONAL — never offered to
        a provider, never witnessed. Pricing them would present a guess as
        a fact, so they go silent exactly as an unknown model does."""
        for tier, pair in librarian_call.OPENAI_FILLS.items():
            self.assertNotIn(tuple(pair), prices())
            job = next((j for j, row in librarian_call.JOBS.items()
                        if row.get("tier") == tier), None)
            self.assertIsNotNone(job, "no job holds tier " + repr(tier))
            self.assertIsNone(
                forecast(job, 2, routing_for(job, tuple(pair))),
                "an unwitnessed provider's id was priced: " + repr(pair))

    def test_her_own_machine_is_never_priced(self):
        """The local rung has no provider, no key and no price — the same
        posture the on-device row already takes (D-05 row 1). A rate of
        zero would be a different claim, and this suite refuses it."""
        self.assertNotIn(tuple(librarian_call.LOCAL_FILL), prices())
        self.assertIsNone(
            forecast("import_presort", 5,
                     routing_for("import_presort",
                                 tuple(librarian_call.LOCAL_FILL))),
            "her own machine was given a dollar figure")

    def test_a_missing_fill_is_silent(self):
        """A routing that fills nothing at all cannot name an answering
        model, so there is nothing to price."""
        self.assertIsNone(
            forecast(EXPENSIVE_JOB, 2, types.SimpleNamespace(fills={})))
        self.assertIsNone(forecast("no-such-job", 2, local_routing()))

    def test_silence_and_zero_are_distinguishable(self):
        """⛔ THE CASE THAT FAILS IF THEY ARE EVER CONFLATED.

        Zero calls is a fact: nothing runs, so nothing is owed. An unknown
        model is not a fact about money at all. Both are FALSY, so this
        case asserts the falsiness explicitly — documenting why `is None`
        is the only correct test — and then asserts the two answers apart
        by identity and by type."""
        pair = dearest_priced_pair()
        zero = forecast(EXPENSIVE_JOB, 0, routing_for(EXPENSIVE_JOB, pair))
        quiet = forecast(EXPENSIVE_JOB, 2,
                         routing_for(EXPENSIVE_JOB,
                                     ("anthropic", UNKNOWN_MODEL)))
        self.assertFalse(bool(zero), "the fixture is wrong: zero is truthy")
        self.assertFalse(bool(quiet), "the fixture is wrong: None is truthy")
        self.assertIsNotNone(
            zero, "no calls answered SILENCE — the room knows this costs "
                  "nothing and must say a number, not go quiet")
        self.assertIsNone(quiet)
        self.assertEqual(zero, 0)
        self.assertIsInstance(zero, int)
        self.assertNotIsInstance(zero, bool)

    # -- the sonnet path (G-6) ---------------------------------------------

    def test_her_settings_file_can_name_the_sonnet_pair(self):
        """⛔ THE MEASUREMENT THE PRICE ROW RESTS ON, DRIVEN THROUGH
        `librarian_call.resolve_routing` RATHER THAN ASSERTED IN PROSE.

        A row keyed on a pair the room can never resolve to is a row that
        changes nothing, so this case proves the pair IS reachable — through
        the one path that is deliberately not membership-gated: her own
        settings file. ⚠ It is GREEN BEFORE AND AFTER the price row; that is
        its job. Before the row it is what makes the silence she saw at the
        UAT a real, reachable state rather than a story."""
        routing = sonnet_routing()
        tier = tier_of(EXPENSIVE_JOB)
        self.assertEqual(
            routing.fills.get(tier), SONNET_PAIR,
            "her stored fill did not resolve to the sonnet pair — the path "
            "this row prices does not exist and the row would be fiction")
        self.assertEqual(
            server._answering_fill(EXPENSIVE_JOB, routing), SONNET_PAIR,
            "the answering fill for the expensive job is not the pair her "
            "settings file named")

    def test_the_sonnet_path_she_can_reach_is_priced(self):
        """⛔ G-6, THE ROW ITSELF. The estimate went SILENT on the one sonnet
        path she can actually reach; her ruling was "add a sonnet price".

        ⚠ The expected figure is RECOMPUTED from raw inputs — the job's own
        `max_tokens`, the measured call count, and the table's own rate — not
        read back from the code that produced it."""
        table = prices()
        self.assertIn(
            SONNET_PAIR, table,
            "the sonnet pair her settings file can name carries no rate, so "
            "the estimate is still silent on that path (G-6)")
        calls = server.LIBRARIAN_REFLECTION_CALLS_PER_SITTING
        per_call = librarian_call.JOBS[EXPENSIVE_JOB]["max_tokens"]
        # ⛔ EXACT RATIONAL, NOT THE NAIVE FLOAT CEILING. `a9badbf` declared
        # this suite's arithmetic "no longer a mirror of the code's" and
        # converted two of the three recomputes; ⚠ THIS ONE WAS MISSED, and
        # was green only by coincidence — 6000 × 2 × 15.0 happens to land on
        # a float that is exactly 18.0. Driven: re-derive
        # LIBRARIAN_REFLECTION_CALLS_PER_SITTING to 27, which the constant's
        # own comment says must happen if `_reflection_worker`'s loop grows,
        # and the naive expression answers 244 against an exact 243 — this
        # case failing against entirely correct code.
        mine = exact_cents(per_call, calls, table[SONNET_PAIR])
        routing = sonnet_routing()
        self.assertEqual(
            forecast(EXPENSIVE_JOB, calls, routing), mine,
            "the sonnet bound disagrees with this file's own arithmetic")
        line = server.forecast_line(EXPENSIVE_JOB, calls, routing)
        self.assertIsNotNone(
            line, "the room still says nothing on the sonnet path")
        # ⚠ AND NOT `str(mine) in line`, WHICH WAS GREEN BY THE SAME KIND OF
        # COINCIDENCE. After 26.99-15 the figure renders as `$0.18`, so the
        # cent integer appears verbatim only while the figure is under a
        # dollar; at 27 calls the line reads `$2.43` and `'243'` is not in
        # it. ⛔ The composed form is deliberately NOT rebuilt here —
        # `"$%d.%02d" % (figure // 100, figure % 100)` is `server.py`'s OWN
        # expression, and a suite that retyped it would be the mirror again,
        # one surface further out. The exact rendered sentence on this path
        # is pinned BY VALUE in
        # `test_the_rendered_sentence_is_the_one_she_approved`, and the
        # notation across scales by a literal table in
        # `test_the_figure_renders_as_dollars_and_two_decimal_places`.
        self.assertNotEqual(
            line, server.FORECAST_MSG,
            "her sentence rendered with its slot untouched — no figure "
            "arrived on the sonnet path: " + repr(line))

    def test_the_shell_still_cannot_name_the_sonnet_pair(self):
        """⛔ PRICING A MODEL IS NOT THE SAME ACT AS SUPPORTING ONE.
        `TIER_FILLS_ALLOWED` is the SHELL's fail-closed gate, and widening it
        would let `LIBRARIAN_REFLECT_MODEL` / `LIBRARIAN_NOTE_MODEL` name
        sonnet — which this room has never offered to a live provider. Its
        own comment forbids exactly that.

        ⚠ THIS CASE FAILS IF ANYONE WIDENS THE ALLOW-LIST to make an old gate
        pass. Green before and after the price row, by design."""
        for tier in librarian_call.TIERS:
            self.assertIsNone(
                librarian_call.allowed_fill(SONNET_PAIR, tier),
                "the shell can now name the sonnet pair for tier %r — the "
                "allow-list was widened, which this plan refused" % (tier,))
        self.assertNotIn(SONNET_PAIR, allowed_fills())

    # -- the table ---------------------------------------------------------

    def test_the_table_is_keyed_on_provider_and_model_pairs(self):
        table = prices()
        self.assertGreaterEqual(len(table), 1)
        for key, rate in table.items():
            self.assertIsInstance(key, tuple)
            self.assertEqual(len(key), 2)
            self.assertIsInstance(key[0], str)
            self.assertIsInstance(key[1], str)
            self.assertIn(key[0], librarian_call.PROVIDERS)
            self.assertIsInstance(rate, float)
            self.assertGreater(rate, 0)

    def test_every_priced_key_is_a_pair_resolve_routing_can_produce(self):
        """⛔ A PRICED KEY MUST BE A PAIR THE ROOM CAN ACTUALLY RESOLVE TO —
        PROVED BY DRIVING `librarian_call.resolve_routing`, NOT BY
        CROSS-CHECKING A LIST.

        ⚠⚠ WHAT THIS REPLACED, AND WHY. The shipped gate asserted every
        priced key was a member of `TIER_FILLS_ALLOWED`, and its docstring
        gave the reason: "a model this room can never resolve to, so pricing
        it is pricing fiction". Measured 2026-08-17, THAT PREMISE IS FALSE.
        `resolve_routing`'s stored-fills loop checks SHAPE, NOT MEMBERSHIP —
        deliberately, with the reason written at that site — so a pair
        outside the allow-list IS reachable through her own settings file.
        The rule was right; the predicate was wrong. That is this project's
        recurring shape: a gate agreeing with itself while the code says
        otherwise.

        ⛔⛔ AND THIS GATE STATES ITS OWN LIMITS, BECAUSE THE DEFECT IT
        REPLACED WAS AN OVER-CLAIMING DOCSTRING. A replacement that is merely
        correct but silent about its edges repeats the shape.

        IT PROVES PRODUCIBILITY, NOT EXISTENCE — that `resolve_routing` will
        hand this pair back if her settings file names it. ⛔ A WELL-SHAPED
        PAIR UNDER A REAL PROVIDER PASSES WHETHER OR NOT THE MODEL ID EXISTS:
        measured, `("anthropic", "claude-totally-fabricated-99")` is
        producible True, and ⛔ NOT ONE of the three shipped no-invented-ids
        cases catches it either — `("anthropic", "claude-fabricated-99"):
        99.0` would sail through all four. The old gate could have caught
        that, and it is the one capability given up here; it is given up
        because the old gate's premise was false about the code, and a gate
        that is wrong is worth less than a narrower one that is right.

        WHAT IT DOES CATCH, driven in the teeth case below: a fabricated
        PROVIDER, a non-string element, wrong arity, and an empty string —
        all fall through to the default and go red.

        ⚠ FABRICATED-ID PROTECTION IS THEREFORE PROCEDURAL, NOT MACHINE
        CHECKABLE: every row must name its SOURCE and the DATE that source
        was read, at the site. That requirement, not this gate, is what
        stands between the table and an invented id."""
        unreachable = sorted(
            key for key in prices() if not producible_pair(key))
        self.assertEqual(
            unreachable, [],
            "the table prices pairs `resolve_routing` cannot produce — a "
            "row keyed on a pair the room can never resolve to is a row "
            "that changes nothing")

    def test_the_producibility_predicate_has_teeth(self):
        """⚠ THE GATE ABOVE PROVES NOTHING UNLESS IT CAN SEE A VIOLATION.
        Malformed keys are planted IN MEMORY here and never in the table."""
        self.assertTrue(
            producible_pair(dearest_priced_pair()),
            "the control failed: a shipped priced pair is not producible")
        for bad in (("totally-made-up", "whatever-9"),
                    ("anthropic", 123),
                    ("anthropic", ""),
                    ("anthropic",),
                    ("anthropic", "claude-opus-5", "extra")):
            self.assertFalse(
                producible_pair(bad),
                "resolve_routing accepted a malformed key: " + repr(bad))

    def test_the_cent_ceiling_is_exact_and_not_a_float_artifact(self):
        """⛔ THE REGRESSION GUARD FOR THE DEFECT FOUND WHILE BUILDING G-5.

        `math.ceil(exact * 100)` — the expression the plan specified — is
        WRONG: binary floats do not hold these quantities exactly, and a
        ceiling at cent scale is close enough to the representation error to
        be moved by it. It over-states the bound by a cent in nineteen of the
        shipped combinations, `reflection` among them.

        This sweeps every job and every priced pair against exact rational
        arithmetic, and ⚠ FAILS IF THE NAIVE FLOAT EXPRESSION NEVER DIVERGED
        — otherwise a future table could make this case vacuous while it
        still reported green."""
        seen_divergence = False
        examined = 0
        for job in sorted(librarian_call.JOBS):
            per_call = librarian_call.JOBS[job].get("max_tokens")
            if not isinstance(per_call, int) or isinstance(per_call, bool):
                continue
            for pair, rate in sorted(prices().items()):
                for calls in range(0, 40):
                    truth = exact_cents(per_call, calls, rate)
                    self.assertEqual(
                        forecast(job, calls, routing_for(job, pair)), truth,
                        "the shipped bound is not the exact cent ceiling at "
                        "%d call(s) of %s on %r" % (calls, job, pair))
                    examined += 1
                    naive = math.ceil(per_call * calls * rate
                                      / 1_000_000.0 * 100)
                    if naive != truth:
                        seen_divergence = True
        self.assertGreater(examined, 0, "the sweep never ran")
        self.assertTrue(
            seen_divergence,
            "the naive float expression never diverged from exact "
            "arithmetic, so this case proved nothing about the instrument")

    def test_the_table_is_a_literal_of_constants(self):
        """⛔ IN THE REPO, AND NEVER FETCHED. Asserted over the parse tree:
        the module-level binding's value must be a `Dict` of constants, so
        there is no call, no comprehension and no name lookup inside it —
        and therefore nowhere for a network read to hide."""
        tree = ast.parse(read_source("server.py"))
        found = []
        for node in tree.body:
            targets = getattr(node, "targets", [])
            for target in targets:
                if isinstance(target, ast.Name) \
                        and target.id == "LIBRARIAN_PRICES":
                    found.append(node.value)
        self.assertEqual(
            len(found), 1,
            "LIBRARIAN_PRICES is bound %d times at module level, not once"
            % len(found))
        value = found[0]
        self.assertIsInstance(
            value, ast.Dict,
            "the price table is not a literal dict — a derived table binds "
            "its membership to the shape of whatever it was derived from")
        for sub in ast.walk(value):
            self.assertNotIsInstance(
                sub, (ast.Call, ast.Await, ast.ListComp, ast.DictComp,
                      ast.GeneratorExp, ast.Attribute),
                "the price table's literal contains a %s — it must be data"
                % type(sub).__name__)

    def test_the_table_is_bound_exactly_once_anywhere(self):
        """⛔ NOT OWNER-EDITABLE. One binding, at module level, and no
        assignment to it or into it anywhere else in the file — so no
        settings read, no meta read and no route can reach it."""
        tree = ast.parse(read_source("server.py"))
        stores = 0
        subscript_stores = 0
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id == "LIBRARIAN_PRICES" \
                    and isinstance(node.ctx, ast.Store):
                stores += 1
            if isinstance(node, ast.Subscript) \
                    and isinstance(node.value, ast.Name) \
                    and node.value.id == "LIBRARIAN_PRICES" \
                    and isinstance(node.ctx, ast.Store):
                subscript_stores += 1
        self.assertEqual(stores, 1, "the price table is rebound elsewhere")
        self.assertEqual(subscript_stores, 0,
                         "something writes INTO the price table")

    def test_the_table_is_not_a_key_a_model_may_propose(self):
        """⛔ D-16's shape, applied here: she may edit the repo; the
        librarian may not propose a rate."""
        proposable = getattr(server, "MODEL_PROPOSABLE_KEYS", ())
        for key in proposable:
            self.assertNotIn("price", str(key).lower())
            self.assertNotIn("rate", str(key).lower())
            self.assertNotIn("cost", str(key).lower())

    def test_no_new_price_fetching_call_site(self):
        """⛔ A SECOND UNDISCLOSED NETWORK CALL WAS REJECTED (D-04). The
        forecast opens nothing; asserted over its own stripped source."""
        fn = getattr(server, "forecast_usd", None)
        if fn is None:
            raise AssertionError("server.forecast_usd does not exist yet")
        body = stripped_source_of(fn)
        self.assertGreater(len(body), 120,
                           "the lifted body is too small to measure")
        for token in ("urlopen", "requests", "http", "socket", "_transport",
                      "open(", "write", "Path(", "json.dump"):
            self.assertNotIn(
                token, body,
                "forecast_usd's body carries %r — it must be pure"
                % token)

    def test_forecast_writes_nothing_when_driven(self):
        """Pure, driven rather than promised: nothing appears under a
        freshly made HOME after a run of forecasts."""
        with temp_home() as home:
            before = sorted(p.name for p in home.iterdir())
            pair = dearest_priced_pair()
            for calls in (0, 1, 7):
                forecast(EXPENSIVE_JOB, calls,
                         routing_for(EXPENSIVE_JOB, pair))
            forecast(EXPENSIVE_JOB, 2,
                     routing_for(EXPENSIVE_JOB,
                                 ("anthropic", UNKNOWN_MODEL)))
            after = sorted(p.name for p in home.iterdir())
        self.assertEqual(before, after,
                         "computing a forecast left something on disk")

    # -- never stored, at depth --------------------------------------------

    def test_no_price_on_the_run_record_at_any_depth(self):
        """D-01 agrees with the shipped gate: computed for display, never
        stored. Asserted over the ROUND-TRIPPED BYTES of the record a real
        pass left behind, at any depth."""
        with temp_home() as home:
            doc, _record = drive_one_pass(home)
        self.assertTrue(doc.get("runs"), "the pass recorded no run at all")
        round_tripped = json.loads(json.dumps(doc, ensure_ascii=False))
        self.assertEqual(price_offenders(round_tripped), [])

    def test_no_price_on_the_call_record_at_any_depth(self):
        """The same question of 26.99-03's call record — the file the room
        offers as evidence of what it sent."""
        with temp_home() as home:
            _doc, record = drive_one_pass(home)
        self.assertTrue(record, "the pass wrote no call record at all")
        doc = json.loads(record.decode("utf-8"))
        self.assertEqual(price_offenders(doc), [])
        self.assertNotIn(b"cost_usd", record)
        for sym in MONEY_SYMBOLS:
            self.assertNotIn(sym.encode("utf-8"), record)

    def test_the_price_offender_check_has_teeth(self):
        """⚠ The negative scans above prove nothing unless the checker can
        see a violation. Planted in memory, never on disk."""
        self.assertNotEqual(
            price_offenders({"runs": [{"usage": {"cost_usd": 0.42}}]}), [])
        self.assertNotEqual(
            price_offenders({"lines": [{"note": "about $3"}]}), [])
        self.assertEqual(
            price_offenders({"lines": [{"input_tokens": 11,
                                        "output_tokens": 22}]}), [])

    # -- the render, and its scope (L-05) ----------------------------------

    def test_the_forecast_renders_outside_the_two_guarded_renders(self):
        """⛔ MEASURED, NOT ASSUMED. `tests/test_display_fence.cjs` forbids
        a dollar-sign literal and a `cost_usd` read, scoped to exactly two
        renders. This case finds every read of the forecast field in
        `app.js` and asserts each one falls OUTSIDE both guarded bodies."""
        src = strip_js_comments(read_source("app.js"))
        reads = []
        at = src.find(RENDER_FIELD)
        while at != -1:
            reads.append(at)
            at = src.find(RENDER_FIELD, at + 1)
        self.assertTrue(
            reads,
            "app.js never reads %r — the forecast has no render site"
            % RENDER_FIELD)
        for name in GUARDED_RENDERS:
            start = src.find("function " + name + "(")
            self.assertNotEqual(
                start, -1,
                "the control failed: %s is not in app.js at all" % name)
            depth = 0
            end = None
            for i in range(src.find("{", start), len(src)):
                if src[i] == "{":
                    depth += 1
                elif src[i] == "}":
                    depth -= 1
                    if depth == 0:
                        end = i
                        break
            self.assertIsNotNone(end, "could not delimit " + name)
            for pos in reads:
                self.assertFalse(
                    start <= pos <= end,
                    "the forecast renders INSIDE %s, which is one of the "
                    "two bodies the display fence guards" % name)

    def test_the_client_holds_no_copy_of_her_sentence(self):
        """⚠ ONE CONSTANT, ONE READER (S-3, and 26.99-09's own discipline).
        Her S-07 sentence lives in `server.py` and is sent over the wire;
        `app.js` holds no literal of it, so the two cannot drift."""
        needle = "librarian's brain"
        self.assertEqual(
            strip_js_comments(read_source("app.js")).count(needle), 0,
            "app.js spells her forecast sentence — a second literal is a "
            "second place for it to rot")
        self.assertEqual(
            read_source("server.py").count(needle), 1,
            "her forecast sentence appears in server.py %d times, not once"
            % read_source("server.py").count(needle))


    # -- her sentence, and the notation she chose (26.99-15, G-7) ----------

    def test_her_sentence_is_hers_minus_the_one_authorised_deletion(self):
        """⛔ HER WORDS, BYTE-FOR-BYTE, WITH EXACTLY ONE WORD REMOVED.

        The shipped constant must equal her §S-07 sentence with the trailing
        word taken off and NOTHING else touched — not a capital, not a comma,
        not the grammar a later agent might read as an error and "fix". The
        deletion is authorised by two instruments and only by them: her G-7
        ruling at the UAT, where she chose the `$` notation, and her
        checkpoint answer on 26.99-15.

        ⚠ COMPARED AGAINST A LITERAL LIFTED FROM 26.99-COPY.md, not against
        anything derived from `server.py`. A gate whose two sides live in one
        module moves with the thing it judges."""
        expected = HER_S07_SENTENCE.replace(THE_AUTHORISED_DELETION, "")
        self.assertNotEqual(
            expected, HER_S07_SENTENCE,
            "the deletion this case is written around found nothing to "
            "delete — her lifted sentence no longer carries "
            + repr(THE_AUTHORISED_DELETION))
        self.assertEqual(
            server.FORECAST_MSG, expected,
            "server.FORECAST_MSG is not her §S-07 sentence minus the one "
            "authorised deletion")
        self.assertNotIn(
            "dollar", server.FORECAST_MSG,
            "the trailing word is back — after a `$` figure it reads "
            "'$0.30 dollar.', which is not what she approved")

    def test_the_dollar_sign_belongs_to_the_number_not_to_her_sentence(self):
        """⛔ OPTION-A, AND IT WAS HERS. Asked at a blocking checkpoint on
        26.99-15 — where the dollar sign belongs, in her sentence or on the
        number the room fills in — she answered, verbatim: "On the number".
        Her sentence therefore gains no new character at all; the symbol
        arrives with the figure, through the substitution.

        ⚠⚠ WRITTEN SO IT FAILS UNDER THE OTHER SHAPE. Both shapes render the
        SAME string, so a case that only read the rendered line could not tell
        them apart — and a gate that cannot go red is this project's recurring
        defect. This one asks where the symbol LIVES: putting the figure's
        bytes back through the slot must restore the constant exactly, which
        it cannot do if a `$` was typed into her words."""
        self.assertNotIn(
            "$", server.FORECAST_MSG,
            "a currency symbol has been typed into her sentence — she put it "
            "on the number instead")
        routing = cloud_routing()
        calls = server.LIBRARIAN_REFLECTION_CALLS_PER_SITTING
        line = server.forecast_line(EXPENSIVE_JOB, calls, routing)
        self.assertIsNotNone(
            line, "the shipped cloud routing produced silence, so there is "
                  "no rendered sentence to judge")
        self.assertEqual(line.count("$"), 1)
        self.assertEqual(
            line.replace("$0.40", "x"), server.FORECAST_MSG,
            "the rendered line is not her constant with the figure in its "
            "slot — the symbol did not arrive through the substitution")

    def test_the_rendered_sentence_is_the_one_she_approved(self):
        """⚠ THE WHOLE SENTENCE, BY VALUE, DRIVEN ON BOTH PRICED CLOUD PATHS.

        The shipped routing at the sitting's own measured call count renders
        `$0.40`; the sonnet path 26.99-14 priced renders `$0.24`. ⛔ No
        trailing word, one symbol, two decimal places, terminal period.

        ⚠⚠ THE TWO FIGURES MOVED 2026-08-19 (26.995-02) — $0.30 -> $0.40 and
        $0.18 -> $0.24 — AND NOTHING HERE WAS RE-BASELINED TO CLEAR A RED.
        ⛔ HER SENTENCE IS BYTE-UNTOUCHED; so is the substitution, the symbol
        count, the two decimal places and the terminal period. The only thing
        that moved is the DERIVED arithmetic, because the owner raised the
        reflection cap 6,000 -> 8,000 on the measurement she authorised.

        ✅ AND THE MOVEMENT IS EXACTLY THE COST SHE WAS QUOTED WHEN SHE RULED.
        The sitting is 2 calls, so this line is per-reflection price x 2:
        $0.30 was `~15c today` and $0.40 is the `8000 = 20c` ceiling she was
        shown in 26.995-COPY.md C-11 before choosing 8,000. This forecast is
        the same arithmetic that produced her offer figures — so a pin that
        did NOT move here would mean the surface disclosing her spend had
        stopped agreeing with the number she actually approved."""
        calls = server.LIBRARIAN_REFLECTION_CALLS_PER_SITTING
        self.assertEqual(
            server.forecast_line(EXPENSIVE_JOB, calls, cloud_routing()),
            HER_S07_SENTENCE.replace(HER_SLOT_WITH_THE_WORD, " $0.40."))
        self.assertEqual(
            server.forecast_line(EXPENSIVE_JOB, calls, sonnet_routing()),
            HER_S07_SENTENCE.replace(HER_SLOT_WITH_THE_WORD, " $0.24."))

    def test_the_figure_renders_as_dollars_and_two_decimal_places(self):
        """⛔ ALWAYS TWO DECIMAL PLACES, AND THE DOLLARS SIDE IS NOT ALWAYS A
        ZERO. `0.3` or `1` is not the shape she approved, and a display string
        built from a float is exactly how `0.30` becomes `0.3` or
        `0.30000000000004`."""
        for cents, shown in ((30, "$0.30"), (6, "$0.06"),
                             (18, "$0.18"), (100, "$1.00")):
            combo = combo_for_cents(cents)
            self.assertIsNotNone(
                combo,
                "no shipped job, price and call count produces exactly %d "
                "cent(s) — the rendering cannot be driven at that scale"
                % cents)
            job, calls, routing = combo
            self.assertEqual(forecast(job, calls, routing), cents)
            self.assertEqual(
                server.forecast_line(job, calls, routing),
                HER_S07_SENTENCE.replace(HER_SLOT_WITH_THE_WORD,
                                         " " + shown + "."),
                "%d cent(s) did not render as %s" % (cents, shown))

    def test_zero_renders_a_figure_and_silence_renders_nothing(self):
        """⛔ ZERO IS NOT SILENCE, AND IT RENDERS. `0` is a fact — no calls,
        nothing owed — and it reaches her as `$0.00`. Silence is the room not
        knowing, and it renders NOTHING AT ALL: not an empty state, not a line
        saying so."""
        routing = cloud_routing()
        self.assertEqual(forecast(EXPENSIVE_JOB, 0, routing), 0)
        self.assertEqual(
            server.forecast_line(EXPENSIVE_JOB, 0, routing),
            HER_S07_SENTENCE.replace(HER_SLOT_WITH_THE_WORD, " $0.00."))
        unknown = routing_for(EXPENSIVE_JOB, ("anthropic", UNKNOWN_MODEL))
        self.assertIsNone(server.forecast_line(EXPENSIVE_JOB, 2, unknown))

    def test_the_lifted_sentence_still_matches_the_copy_record(self):
        """⚠⚠ THE PIN ON THE PIN. `HER_S07_SENTENCE` above is a copy that was
        byte-identical on the day it was lifted; only an instrument keeps it
        so. When the record's path is supplied, this case compares the two and
        then proves it can SEE a change — a repunctuated sentence in a
        throwaway copy must not match.

        ⛔ The real record is never written to, and its path is never
        hardcoded. When the path is absent this case measures nothing, and
        `main()` says so BY VALUE rather than letting an unreachable pin read
        as a green one."""
        text = copy_record_text()
        if text is None:
            PINNED["source"] = "unreachable (%s unset)" % (COPY_RECORD_ENV,)
            return
        PINNED["source"] = os.environ[COPY_RECORD_ENV].strip()
        block = fenced_block(text, "S-07")
        self.assertEqual(
            HER_S07_SENTENCE, block,
            "the lifted copy of her §S-07 sentence no longer matches the "
            "copy record byte-for-byte — one of the two has been edited")
        PINNED["sentences"] += 1

        doctored_block = block.replace(",", ";", 1)
        self.assertNotEqual(
            doctored_block, block,
            "the teeth drill changed nothing, so it proves nothing")
        doctored = tempfile.mkdtemp(prefix="studyroom-forecast-teeth-")
        try:
            path = Path(doctored) / "copy.md"
            path.write_text(text.replace(block, doctored_block, 1),
                            encoding="utf-8")
            self.assertNotEqual(
                fenced_block(path.read_text(encoding="utf-8"), "S-07"),
                HER_S07_SENTENCE,
                "the byte pin cannot see a repunctuated sentence — it is "
                "measuring nothing")
        finally:
            shutil.rmtree(doctored, ignore_errors=True)

    def _import_a_copy_of_server(self, source_text):
        """Import `source_text` AS `server`, in a subprocess, under a throwaway
        HOME. Returns `(returncode, stderr)`.

        ⛔ The copy goes in a temporary directory, never in the repo, and the
        real `server.py` is never touched. Everything else it imports comes
        from the repo, so the only thing that differs is the one line planted
        by the caller."""
        tmp = tempfile.mkdtemp(prefix="studyroom-slot-")
        home = tempfile.mkdtemp(prefix="studyroom-slot-home-")
        try:
            (Path(tmp) / "server.py").write_text(source_text,
                                                 encoding="utf-8")
            env = dict(os.environ)
            env["HOME"] = home
            proc = subprocess.run(
                [sys.executable, "-c",
                 "import sys; sys.path.insert(0, %r); "
                 "sys.path.insert(1, %r); import server"
                 % (tmp, str(REPO_ROOT))],
                cwd=str(REPO_ROOT), env=env, capture_output=True,
                text=True, timeout=300)
            return proc.returncode, proc.stderr
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
            shutil.rmtree(home, ignore_errors=True)

    def test_a_second_slot_still_makes_the_import_refuse_to_start(self):
        """⛔ THE IMPORT-TIME ASSERT IS UNCHANGED AND UNRELAXED — the slot
        count was RE-DERIVED for her new sentence, never loosened to fit it.

        ⚠ TWO INSTRUMENTS, of different kinds: the count read off the shipped
        constant, and a PLANTED second slot that must stop the module from
        importing at all. The control — the same import, of an unmodified
        copy — runs first, so a drill that could never have failed is
        legible as such."""
        self.assertEqual(
            len(server._FORECAST_SLOT.findall(server.FORECAST_MSG)), 1)
        src = read_source("server.py")
        self.assertEqual(
            src.count(server.FORECAST_MSG), 1,
            "her sentence is not written exactly once in server.py, so the "
            "planted copy below cannot be aimed")
        rc, err = self._import_a_copy_of_server(src)
        self.assertEqual(
            rc, 0,
            "the CONTROL failed: an unmodified copy of server.py did not "
            "import, so this drill proves nothing\n" + err[-2000:])
        planted = src.replace(server.FORECAST_MSG,
                              server.FORECAST_MSG[:-1] + " x.", 1)
        self.assertNotEqual(planted, src)
        rc, err = self._import_a_copy_of_server(planted)
        self.assertNotEqual(
            rc, 0,
            "a sentence carrying TWO slots imported cleanly — the "
            "import-time assert has been relaxed")
        self.assertIn("exactly one slot", err)


# ⚠ THE CASE COUNT, BY VALUE (B-3). A run that examined zero cases must
# fail rather than print a cheerful line. Raise it when a case is added,
# and NEVER lower it to make a run pass.
EXPECTED_CASES = 36


def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ForecastTest)
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    print("CASES %d" % ran)
    try:
        print("TABLE %d priced pair(s)" % len(server.LIBRARIAN_PRICES))
    except AttributeError:
        print("TABLE none — the price table has not landed yet")
    print("COPY PIN %s: %d sentence(s) compared against her record"
          % (PINNED["source"] or "not attempted", PINNED["sentences"]))
    print("DROVE %d forecast(s) to a figure, %d to silence; "
          "%d live pass(es), %d fake call(s) answered"
          % (DRIVEN["figures"], DRIVEN["silences"],
             DRIVEN["passes"], DRIVEN["calls"]))
    if ran != EXPECTED_CASES:
        print("CASE COUNT MISMATCH: ran %d, file says %d"
              % (ran, EXPECTED_CASES))
    if DRIVEN["figures"] < 1 or DRIVEN["silences"] < 1:
        print("DRIVE MISMATCH: a run that never saw BOTH a figure and a "
              "silence has not measured the rule at all")
        return 1
    if not result.wasSuccessful() or ran != EXPECTED_CASES:
        return 1
    print("test_forecast OK (one rounded-up bound IN WHOLE CENTS where the "
          "room knows, silence where it does not — including the measured "
          "alias — and no price on any disk)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
