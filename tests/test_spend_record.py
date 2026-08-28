"""ONE call in, ONE line out, ONE route back — the record file, end to end.

⚠ WHAT THIS FILE IS FOR (26.99-03, D-01 and D-02). The room has never
written down WHAT RAN. Per-run, per-provider totals persist, but they are
a FOLD: they cannot see a call that spent nothing, they are written at six
separate sites, and a total answers "what did it cost" rather than "what
did this app send, and to whom". D-02 is the whole point — read one way
this file is a bill; read the other it is EVERYTHING THIS APP HAS EVER
SENT, and it is the only thing in the room that answers "has my privacy
been kept" with evidence rather than a promise.

⚠ SO THE ASSERTIONS BELOW ARE PRIVACY ASSERTIONS WEARING A LEDGER'S
CLOTHES. A record that named the item it sent would put never-list
material (law 5) into the one place it would be most damaging — the place
a person opens BECAUSE she has been told it is safe to. The six fields are
a ceiling, not a starting point: a seventh key fails this suite.

⚠ AND THE MONEY BAN IS ASSERTED OVER THE ROUND-TRIPPED FILE BYTES, NEVER
OVER THE WRITER'S SOURCE (B-2, recorded three times on this project). This
phase writes a great deal of prose containing exactly the strings its own
gates search for; a scan over prose measures prose. Where a static scan is
genuinely unavoidable — "is this route gated on a feature switch" is a
question about code, not about output — the source is stripped of comments
AND of every string literal through `tokenize`, because ⚠ A PYTHON
DOCSTRING IS NOT A '#' COMMENT and 26.94-02 turned a pin red twice from
prose that survived a '#'-only strip.

⛔ NO KEY VALUE IS READ, PRINTED, MASKED-AND-PRINTED OR WRITTEN ANYWHERE
here. A live paid Anthropic key is on this machine. Everything below runs
on the LOCAL rung, which takes no credential at all, and the fake
transport asserts that no `auth` argument ever reached it.

⛔ IT NEVER TOUCHES THE REAL HOME. Every case runs inside a temporary HOME
and the helper REFUSES TO YIELD unless `study_lib.room_config_dir()`
actually resolved inside that temporary directory — a structural guard,
not a promise in a comment, because the record file's home is the room's
own config directory (the owner's one-way-door ruling, 2026-08-16:
option-b, beside the keys file) and that is a directory she really has.

Run: `TMPH=$(mktemp -d); HOME="$TMPH" python3 tests/test_spend_record.py`
"""

import ast
import contextlib
import errno
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import tokenize
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import study_lib          # noqa: E402
import librarian_call     # noqa: E402
import server             # noqa: E402  — imported for bind_job_literals


# ---------------------------------------------------------------------------
# ---- what the record must never contain -----------------------------------

# ⚠ THE SIX FIELDS, AS A SET, AND THE SET IS THE ASSERTION. D-01 names
# them: when, job, provider, model, tokens in, tokens out. A seventh key is
# a failure here even if it looks harmless, because "harmless" is exactly
# how an origin path arrives.
SIX_FIELDS = frozenset(
    ("at", "job", "provider", "model", "input_tokens", "output_tokens"))

# Money, in every shape it can wear. Symbols first, then the words a key
# would be spelled with. ⚠ A FLOAT IS ITSELF A MONEY SHAPE HERE: token
# counts are whole numbers, so any non-integer number in this file is
# either a price or a derived one, and D-01's whole argument is that a
# stored dollar figure is a price-table snapshot wearing a fact's clothes.
MONEY_SYMBOLS = ("$", "€", "£", "¥", "₹", "¢")
MONEY_WORDS = ("usd", "dollar", "cost", "price", "cent", "charge",
               "billed", "spend", "money", "fee", "tally")

# The never-list shapes (law 5 / L-06). A key with any of these names is a
# failure wherever it appears, at any depth.
NEVER_KEYS = ("id", "item_id", "title", "path", "origin_path", "file",
              "text", "body", "why", "excerpt", "content")

# The needles planted in the payload the fake call carries. If any of these
# reaches the file, the record is naming her things.
NEEDLE_ID = "itemid-7f3a9c2b4d1e"
NEEDLE_TITLE = "The Night I Could Not Sleep"
NEEDLE_PATH = "Notes/2019/the-night-i-could-not-sleep.md"
NEEDLE_BODY = "i keep coming back to the same evening and i do not know why"

# The local rung's echoed tag. Ollama only ECHOES the model it was asked
# for, which is why the seam marks it `independent: False` — irrelevant
# here, because the record reads the RESOLVED FILL rather than the answer.
LOCAL_ECHO = "qwen2.5:7b"

# ---------------------------------------------------------------------------
# ---- 26.99-04: the four classes, and the gate that closes the back door ----

# ⚠ FOUR CLASSES OF CALL, AND THE LAST THREE ARE THE WHOLE POINT (D-01).
# The room does not only make calls that cost something. It makes calls
# that report nothing, calls that are refused before a request is ever
# built, and calls that fail on the wire. A record that held only the
# first would answer "what did it cost" — and D-02 needs it to answer
# "what did this app send, and to whom", which is a question a zero-token
# call is still part of the answer to.
CALL_CLASSES = 4

# What the four-class case actually drove, so `main` can state it BY VALUE
# (B-3). ⚠ A run that examined zero calls must be legible as such rather
# than printing a cheerful line about a loop it never entered.
DRIVEN = {"calls": 0, "lines": 0}

# ⛔ THE PROVIDER'S OWN ERROR TEXT, PLANTED SO ITS ABSENCE IS PROVED RATHER
# THAN ASSUMED (T-26.99-15). The room's failures are a CLOSED REGISTER of
# eleven tokens and no surface has ever had access to a provider's own
# words; the record must inherit that guarantee rather than re-earn it, and
# the way to show it inherited is to put the words on the wire and then
# look for them in the file.
PROVIDER_ERROR_TEXT = ("invalid_request_error: organization "
                       "org-8f21c4 exceeded its quota")

# ⚠ THE MEASURED SEAM-SITE COUNT, PINNED BY VALUE HERE AS WELL AS IN
# `server.SEAM_CALL_SITES` — and the two literals are the point (B-5).
# An equality that reads the same constant the code reads proves nothing:
# raise the constant to accommodate a new bypass and the equality follows
# it quietly. A second literal, in the instrument, does not follow.
#
# ⚠ WHERE THE 1 COMES FROM, MEASURED IN THE WORKING TREE 2026-08-16 rather
# than carried out of a document. `grep -c 'librarian_call.call_librarian('
# server.py` answered NINE: eight production callers reaching the seam
# directly, plus the one inside `server.record_call`, the wrapper 26.99-03
# built. This plan routes all eight through the wrapper, so exactly ONE
# reference to the seam is left in the file — the wrapper's own. Any other
# is, by construction, a call the privacy record cannot see.
EXPECTED_SEAM_CALL_SITES = 1

# The text the static half counts, over source stripped of comments AND of
# string literals. ⛔ Never over raw source: this file and `server.py` both
# write a great deal of prose containing exactly this string.
SEAM_CALL_TEXT = "librarian_call.call_librarian("


# ---------------------------------------------------------------------------
# ---- the two predicates, and each is proved to have teeth below -----------

def _walk(node, where="record"):
    """Yield (where, key, value) for every scalar in a JSON document, at
    any depth. Depth is the whole point: the shipped defects this project
    has collected were one level down, inside a property, which is exactly
    how they stayed invisible."""
    if isinstance(node, dict):
        for key, value in node.items():
            yield where, str(key), value
            yield from _walk(value, where + "." + str(key))
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield where + "[%d]" % i, None, value
            yield from _walk(value, where + "[%d]" % i)


def money_offenders(doc):
    """Every place in `doc` that carries money, as readable strings.

    Three kinds, and all three are needed: a KEY named for a price, a
    STRING carrying a currency symbol or a money word, and a NUMBER that
    is not a whole count. Returns [] when the document is clean."""
    out = []
    for where, key, value in _walk(doc):
        if key is not None:
            low = key.lower()
            if any(word in low for word in MONEY_WORDS):
                out.append("key %s at %s" % (key, where))
            if any(sym in key for sym in MONEY_SYMBOLS):
                out.append("symbol in key %s at %s" % (key, where))
        if isinstance(value, str):
            low = value.lower()
            if any(sym in value for sym in MONEY_SYMBOLS):
                out.append("symbol in value at %s" % where)
            if any(word in low for word in MONEY_WORDS):
                out.append("money word in value at %s" % where)
        elif isinstance(value, bool):
            continue
        elif isinstance(value, float):
            out.append("a float at %s — token counts are whole" % where)
    return sorted(set(out))


def never_list_offenders(doc, needles=()):
    """Every place in `doc` that names one of her things.

    A key from `NEVER_KEYS` at any depth, or a value carrying one of the
    planted needles. ⚠ THE KEY CHECK IS EXACT, NOT SUBSTRING: `item_id`
    must fail while `input_tokens` must not, and a substring rule would
    fail `model` on `id`. Returns [] when the document is clean."""
    out = []
    for where, key, value in _walk(doc):
        if key is not None and key.lower() in NEVER_KEYS:
            out.append("key %s at %s" % (key, where))
        if isinstance(value, str):
            for needle in needles:
                if needle and needle in value:
                    out.append("planted material at %s" % where)
    return sorted(set(out))


def strip_py_source(src):
    """`src` with every comment AND every string literal blanked, line
    count preserved, so a static scan reads CODE rather than prose.

    ⚠ A PYTHON DOCSTRING IS NOT A '#' COMMENT. The shipped `stripPyComments`
    in tests/test_no_push.cjs blanks '#'-leading lines only, and its own
    neighbouring warning records that 26.94-02 turned a pin red TWICE from
    prose that survived it. `tokenize` knows the difference and does not
    have to be taught it. A file it cannot tokenize is returned unchanged —
    fail-visible, since the caller's assertion then reads the prose and
    says so, rather than a silent pass on an empty string."""
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


def stripped_source_of(obj):
    """One function's source, comments and string literals blanked."""
    import inspect
    return strip_py_source(textwrap.dedent(inspect.getsource(obj)))


# ---------------------------------------------------------------------------
# ---- 26.99-13: reading the CLIENT by RUNNING it ---------------------------
#
# ⚠⚠ THIS SUITE HAD NO EVALUATION MECHANISM AND WITHOUT ONE EVERY "DRIVEN"
# CASE COLLAPSES SILENTLY INTO A STATIC ONE. `_walk`, `money_offenders`,
# `never_list_offenders`, `strip_py_source`, `seam_site_counts` are Python
# AST and dict walkers — their `node` parameters are `ast` nodes and plain
# dicts, never JavaScript. A source scan cannot tell "renders her word" from
# "renders the machine's key"; only running the function can.
#
# So the two record renderers are LIFTED out of comment-stripped `app.js` by
# brace matching and executed under `node -e`, with the values they return
# asserted BY VALUE. ⚠ The counters below exist so that a run in which every
# lift failed cannot report green: `main()` fails if either is zero.
#
# ✅ THE ISOLATED-HOME RULE IS UNTOUCHED. That rule bans running a `.cjs`
# SUITE under a swapped HOME, because eleven of them launch Chrome and macOS
# then prompts the OWNER with a Keychain dialog. `node -e` over lifted pure
# functions launches no browser, opens no profile and touches no Keychain —
# it is `node` the interpreter, not a suite. ⛔ Still no Chrome, and ⛔ still
# no `.cjs` file executed from here.
#
# ⛔ NO NETWORK, EVER: `apiPost` is replaced by a stub that answers from a
# planted table and records the paths it was asked for. Nothing here can
# reach a provider, and no credential exists in this process to reach one
# with.

CLIENT = {"lines": 0, "renders": 0, "panes": 0}

# ⛔ D-17's shape on this surface: a digit in the JOB COLUMN. The rest of a
# record line legitimately carries digits — the date and the two token
# counts — so the ban is asserted where this plan writes, not everywhere.
DIGIT_IN_COLUMN = re.compile(r"\d")

# Any `<something>.length` read inside the record render. Only the record's
# OWN length may be read; a length of the job map would be a count of the
# standing list reaching a surface D-17 forbids it on.
LENGTH_READ = re.compile(r"(\w+)\.length")

# The empty-list guard, and it must NAME THE FLAG. A guard that does not is
# an unconditional empty state rather than one scoped to her clear.
AFTER_CLEAR_GUARD = re.compile(r"calls\.length[^;{}]*afterClear")

# 26.99-16 / WR-01: the two permitted writers of the pane's cleared-fact,
# and the one permitted call of the forget. ⚠ Counted over COMMENT-STRIPPED
# source — this file and `app.js` both write prose containing these exact
# identifiers, and a scan over prose measures prose (B-2).
RECORD_CLEARED_WRITE = re.compile(r"LIBRARIAN\.recordCleared\s*=\s*(true|false)")
FORGET_CALL = re.compile(r"(?<!function )forgetPaneRecordClear\(\)")


def read_source(name):
    return (REPO_ROOT / name).read_text(encoding="utf-8")


def strip_js_comments(src):
    """`src` with `//` and `/* */` comments blanked, length preserved.

    ⚠ B-2, recorded three times on this project: this plan, this suite and
    `app.js` all write prose containing exactly the identifiers the static
    cases search for. A scan over prose measures prose."""
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


_CLIENT_SRC = {}


def client_source():
    """`app.js`, comments blanked, read once."""
    if "src" not in _CLIENT_SRC:
        _CLIENT_SRC["src"] = strip_js_comments(read_source("app.js"))
    return _CLIENT_SRC["src"]


def js_function(src, name):
    """One `function NAME(...) {...}` declaration, brace-matched.

    A failure NAMES the symbol so a cut-short lift list reads as a cut-short
    lift list rather than as evidence that lifting is unreliable."""
    at = src.find("function " + name + "(")
    if at == -1:
        raise AssertionError(
            "app.js has no `function %s(` — the lift list names a symbol "
            "that is not in the file" % (name,))
    depth = 0
    for i in range(src.find("{", at), len(src)):
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return src[at:i + 1]
    raise AssertionError("unbalanced braces lifting %s from app.js" % (name,))


def js_var(src, name):
    """One `var NAME = <literal>;` declaration."""
    at = src.find("var " + name + " = ")
    if at == -1:
        raise AssertionError("app.js has no `var %s = `" % (name,))
    end = src.find(";", at)
    text = src[at:end + 1]
    if text.count("'") % 2 or text.count('"') % 2:
        raise AssertionError(
            "the lift of %s stopped inside a string literal" % (name,))
    return text


# ⛔ THE LIFT LISTS, MEASURED RATHER THAN ASSUMED. `callRecordFields` reads
# `cleaningRunDate(c.at)` and returns two `callRecordCount(...)` calls, so
# lifting it alone dies on a ReferenceError naming `cleaningRunDate`.
# ⛔ `escapeHtml` is deliberately NOT stubbed for that half — measured: it
# does not appear in its body at all. The render half DOES escape at the
# sink, so that half supplies the stub.
#
# ⚠ 26.99955-12 RENAMED THE FIRST HALF, and the rename is the whole change:
# `callRecordLine` JOINED the date, the job's room-word, the provider+model
# and the two token counts into one string with an em dash before the
# renderer ever saw them. That join was the renderer's composition and never
# one of her sentences, so her readability ruling removed it — the function
# now returns the four fields SEPARATELY and joins nothing.
#
# ⚠ 26.99955 UAT G-…-10 ADDED FOUR NAMES, and every one of them is a name
# `renderCallRecord` now REACHES — the ask she ruled onto the press, and the
# toggle that shows it. ⛔ NONE OF THEM WRITES MARKUP: both faces of her line
# are written at the renderer's own sink and these only choose which is shown,
# because `tests/test_no_push.cjs` refused the shared markup helper the first
# version of this fix used — a sink segment that is neither a literal nor
# visibly escaped is exactly what the seam rule forbids. ⛔ A lift that named only the renderer would die on a ReferenceError
# INSIDE A `.then`, where it surfaces as an EMPTY RENDER rather than as a
# failure — which is exactly how this suite reported the omission when the
# names were first added, and exactly the failure shape the block above
# already warns about.
RECORD_LINE_LIFT = ("cleaningRunDate", "callRecordCount", "callRecordFields")
RECORD_RENDER_LIFT = ("pileQuietStyle", "cleaningRunDate", "callRecordCount",
                      "callRecordFields", "showCallRecordAsk",
                      "wireCallRecordHead", "askCallRecordClear",
                      "keepCallRecord", "renderCallRecord",
                      "clearCallRecord")
# ⛔ HER TWO SENTENCES, AND NOTHING ELSE EVER. This tuple is read a second
# time by the copy-record byte pin as "her constants", so a support symbol
# added here would be compared against her record as if it were her writing.
RECORD_RENDER_VARS = ("CALL_RECORD_HEAD", "CALL_RECORD_CLEAR")

# The module state the lifted renderers READ — kept apart from her sentences
# for the reason above. 26.99-16: `clearCallRecord` now records the pane's
# cleared-fact on `LIBRARIAN`, so the object must be lifted with it or the
# lift dies on a ReferenceError inside a `.then`, where it surfaces as an
# empty render rather than as a failure.
RECORD_RENDER_STATE = ("LIBRARIAN",)

# ⚠ 26.99-17: the client's ONE her-word literal for a refused delete, kept
# deliberately OUT of RECORD_RENDER_VARS for the reason that tuple states —
# the copy-record byte pin reads that tuple as "her constants" and would
# compare this one against 26.99-COPY.md, which is not where her words for it
# live. It is pinned separately, against the UAT record AND against
# `server.RECORD_DELETE_FAILED['refused']`.
RECORD_FAILED_VARS = ("RECORD_DELETE_REFUSED",)

# ⭐⭐ 26.99955 UAT G-…-10: the ask she ruled onto the clear, and the room's
# own word for backing out of it. ⛔ KEPT OUT OF `RECORD_RENDER_VARS` for
# exactly the reason that tuple states — the copy-record byte pin reads it as
# "her constants" and would compare these against 26.99-COPY.md, which is a
# document written before either sentence existed. Her confirm sentence was
# typed at the 26.99955 walk-through and its provenance lives in the comment
# above the constant; `CALL_RECORD_KEEP` is not new writing at all — it is
# the label the never-list decline and the memory decline already ship.
RECORD_CONFIRM_VARS = ("CALL_RECORD_CONFIRM", "CALL_RECORD_KEEP")

# The fake `host` and the fake `apiPost`. ⚠ `escapeHtml`/`escapeAttr` are
# IDENTITY over `String(...)` on purpose: this half is asserting WHICH WORDS
# reach the markup, and a real escaper would only make the expectations
# harder to read. The sink rule itself is `tests/test_no_push.cjs`' job and
# is run unmodified.
RENDER_PRELUDE = """
var escapeHtml = function (s) { return String(s); };
var escapeAttr = function (s) { return String(s); };
var __answers = __ANSWERS__;
var __seen = [];
function apiPost(path) {
  __seen.push(path);
  var queue = Object.prototype.hasOwnProperty.call(__answers, path)
    ? __answers[path] : null;
  var answer = (queue && queue.length) ? queue.shift()
    : { ok: false, status: 500, data: null };
  if (answer === 'reject') { return Promise.reject(new Error('forced')); }
  return Promise.resolve(answer);
}
var __html = null;
var host = {
  set innerHTML(v) { __html = v; },
  get innerHTML() { return __html; },
  querySelector: function () { return null; }
};
"""

RENDER_EPILOGUE = """
setTimeout(function () {
  console.log(JSON.stringify({ html: __html, seen: __seen }));
}, 0);
"""


def _node(program, why):
    """Run one `node -e` program and hand back its stdout.

    ⛔ A failure here is NOT a licence to fall back to a static scan and
    call it driven — 26.99-13's escape hatch is a DECLARATION duty: say in
    the SUMMARY which proofs went unproven and label the static assertions
    as static."""
    try:
        proc = subprocess.run(["node", "-e", program],
                              capture_output=True, text=True, timeout=120)
    except FileNotFoundError:
        raise AssertionError(
            "`node` is not on PATH, so the client lift (%s) cannot run — "
            "and a static scan is not a substitute for it" % (why,))
    if proc.returncode != 0:
        raise AssertionError(
            "the client lift (%s) failed: %s"
            % (why, (proc.stderr or "").strip()[:400]))
    return proc.stdout.strip()


def client_line(call, names):
    """`app.js` `callRecordFields(call, names)`, actually executed.

    ⚠ ASSERT THE FIELD, NEVER THE WHOLE ROW. The row carries a DATE and an
    unconditional TOKEN TAIL as well as the job name, so a whole-row
    expectation is brittle and a short one is not producible at all.
    Callers read the field they mean through `job_column` / `line_text`.

    ⚠ 26.99955-12: this used to return the JOINED line the renderer painted.
    Her readability ruling un-joined it — the four facts are four fields and
    four elements now — so this returns the dict the function returns, and
    every caller reads a field by NAME rather than by counting em dashes.
    ⛔ Nothing about what the row SAYS changed; only how it is carried."""
    program = "\n".join(js_function(client_source(), n)
                        for n in RECORD_LINE_LIFT)
    program += ("\nconsole.log(JSON.stringify(callRecordFields(%s, %s)));"
                % (json.dumps(call), json.dumps(names)))
    out = json.loads(_node(program, "callRecordFields"))
    CLIENT["lines"] += 1
    return out


def job_column(fields):
    """The job slot of one record row — now a named field, not a segment."""
    if not isinstance(fields, dict) or "name" not in fields:
        raise AssertionError(
            "the record row lost its shape, so there is no job column to "
            "read: %r" % (fields,))
    return fields["name"]


def line_text(fields):
    """Everything one row says, for whole-row containment assertions.

    ⚠ THE HARNESS MAY JOIN; THE RENDERER MAY NOT. This exists so a case can
    ask "is this string anywhere in the row" without re-introducing the em
    dash into what she reads — the separator here is a space and it never
    reaches app.js."""
    return " ".join(str(fields[k]) for k in ("when", "name", "who", "count")
                    if fields.get(k))


def client_render(entry, answers):
    """One `renderCallRecord`/`clearCallRecord` call, actually executed.

    Returns `{html, seen}` — the markup the fake host captured, and the
    route paths the fake `apiPost` was asked for."""
    src = client_source()
    program = (RENDER_PRELUDE.replace("__ANSWERS__", json.dumps(answers))
               + "\n".join([js_var(src, n) for n in
                            RECORD_RENDER_VARS + RECORD_FAILED_VARS
                            + RECORD_CONFIRM_VARS + RECORD_RENDER_STATE]
                           + [js_function(src, n)
                              for n in RECORD_RENDER_LIFT])
               + "\n" + entry + "\n" + RENDER_EPILOGUE)
    out = json.loads(_node(program, entry))
    CLIENT["renders"] += 1
    return out


# ⛔⛔ THE PANE LIFT — 26.99-16 / WR-01. The record's own lift cannot answer
# her ruling, because the defect is not in `renderCallRecord` at all: it is
# in WHAT THE OTHER CALLER PASSES. `refreshLibrarianSettings` is therefore
# lifted and RUN, rather than scanned — a static check that it "passes the
# flag" would pass on a caller that passed a permanently-false one.
#
# ⚠ Everything it touches EXCEPT the record renderers is stubbed, so the
# only real code under test is the pane's own path to `renderCallRecord`.
PANE_LIFT = RECORD_RENDER_LIFT + ("forgetPaneRecordClear",
                                  "refreshLibrarianSettings")
PANE_VARS = (RECORD_RENDER_VARS + RECORD_FAILED_VARS + RECORD_CONFIRM_VARS
             + RECORD_RENDER_STATE)

# ⚠ `step()` PUTS EACH BEAT ON ITS OWN MACROTASK. Every chain in these
# functions is promise-based, and the microtask queue drains COMPLETELY
# between macrotasks — so a beat registered here observes the previous
# beat's render finished, without polling and without a sleep.
#
# ⚠ `mark()` CAPTURES THE MARKUP AT A POINT IN TIME, so one program can
# assert the state after the clear AND after the repaint. A case that ran
# them as two separate programs would be asserting two different processes
# and could never see a fact CARRIED from one to the other, which is the
# whole of her ruling.
PANE_PRELUDE = """
var __marks = {};
function mark(name) { __marks[name] = __html; }
var __steps = [];
function step(fn) { __steps.push(fn); }
var __box = { querySelector: function (sel) {
  return sel === '.librarian-call-record' ? host : null; } };
var librarianSettingsBox = function () { return __box; };
var renderLibrarianSettings = function () { };
var readLibrarianRunState = function () { };
var renderJobDisclosure = function () { };
var $ = function () { return null; };
function apiGet(path) {
  __seen.push(path);
  var queue = Object.prototype.hasOwnProperty.call(__answers, path)
    ? __answers[path] : null;
  var answer = (queue && queue.length) ? queue.shift()
    : { ok: false, status: 500, data: null };
  if (answer === 'reject') { return Promise.reject(new Error('forced')); }
  return Promise.resolve(answer);
}
"""

PANE_EPILOGUE = """
function __run() {
  if (!__steps.length) {
    console.log(JSON.stringify({ html: __html, seen: __seen,
                                 marks: __marks }));
    return;
  }
  __steps.shift()();
  setTimeout(__run, 0);
}
setTimeout(__run, 0);
"""


def client_pane(entry, answers):
    """One sequence of pane beats, actually executed under node.

    ⚠⚠ 26.99955-08: THIS HELPER HAS NO CALLER LEFT, AND IT IS RETAINED
    RATHER THAN DELETED — the blessSpread precedent this repo already keeps.
    Its four callers drove the Manage librarian pane's repaint to hold her
    WR-01 ruling; her 2026-08-26 ruling took the activity log off Manage, so
    that repaint has no record to paint and the four cases retired with it
    (see the comment block above `test_the_manage_pane_no_longer_paints_the
    _record`, which maps where each of their facts is driven now).
    ⛔ It is kept because it is the ONE machine in this file that can lift a
    real caller and RUN it against a fake host — a capability worth more
    than the tidiness of deleting it, and one the next surface that needs a
    caller driven rather than scanned will want. The paragraph below
    describes what it does when something calls it, and every word of it is
    still accurate.

    `entry` may call `step(fn)` to queue a later beat and `mark(name)` to
    capture the markup as it stands. Returns `{html, seen, marks}`."""
    src = client_source()
    program = (RENDER_PRELUDE.replace("__ANSWERS__", json.dumps(answers))
               + PANE_PRELUDE
               + "\n".join([js_var(src, n) for n in PANE_VARS]
                           + [js_function(src, n) for n in PANE_LIFT])
               + "\n" + entry + "\n" + PANE_EPILOGUE)
    out = json.loads(_node(program, entry))
    CLIENT["panes"] += 1
    return out


def client_constant(name):
    """The VALUE of one `app.js` string constant, read out of the file by
    running it — ⛔ never retyped here."""
    program = (js_var(client_source(), name)
               + "\nconsole.log(JSON.stringify(%s));" % (name,))
    return json.loads(_node(program, "var " + name))


def status_answer():
    """A `/api/librarian/status` answer that is PRESENT but switched OFF.

    ⚠ Deliberately `available: false`: the pane still paints, the record
    still renders (it is ungated, D-02), and the availability-gated run-state
    read does not fire — so the beat under test is the pane's path to the
    record and nothing else."""
    return {"ok": True, "status": 200, "data": {"available": False}}


def record_answer(calls):
    return {"ok": True, "status": 200, "data": {"calls": list(calls)}}


def jobs_answer(words):
    """A `/api/librarian/jobs` answer built from `server.JOB_ROOM_WORDS` —
    the same rows `handle_job_disclosure` derives, ⛔ never retyped."""
    return {"ok": True, "status": 200, "data": {"jobs": [
        {"job": job, "name": pair[0], "words": pair[1]}
        for job, pair in sorted(words.items())]}}


def planted_call(job, at=1755302400000, tokens=(10, 20)):
    """One record line, in the six fields and nothing else. ⛔ No item id,
    title, path or body, and ⛔ no key value or fragment of one."""
    return {"at": at, "job": job, "provider": "anthropic",
            "model": "claude-opus-5",
            "input_tokens": tokens[0], "output_tokens": tokens[1]}


# ---------------------------------------------------------------------------
# ---- 26.99-13: her words, pinned to the copy record ------------------------
#
# ⛔⛔ HER SENTENCES ARE NEVER RETYPED IN THIS SUITE. A suite that retypes one
# of her sentences has created the second literal that can drift from the one
# it is checking — this project's recurring defect wearing a new coat. So the
# expected bytes are LIFTED from the copy record itself.
#
# ⚠ THE COPY RECORD LIVES OUTSIDE THIS REPO, in the planning tracker, and its
# path is personal. ⛔ It is therefore NOT hardcoded — writing it here would
# put the owner's real directory layout into a file that is published. The
# path arrives in `STUDY_ROOM_COPY_RECORD`; when it is absent the pin cannot
# run, and `main()` PRINTS THAT BY VALUE rather than reporting a cheerful
# green. A pin that quietly measured nothing is the failure this states out
# loud.
COPY_RECORD_ENV = "STUDY_ROOM_COPY_RECORD"

PINNED = {"source": "", "sentences": 0, "rows": 0, "deleted": 0}


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
        raise AssertionError("unterminated fenced block under %r"
                             % (heading,))
    return text[body_start:close_fence]


def copy_room_word_rows(text):
    """§S-05's table as `{job: (name, sentence)}`, read out of the record."""
    rows = {}
    for line in fenced_block(text, "S-05").split("\n"):
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) != 3:
            continue
        key = cells[0].strip("`")
        if key in ("JOBS key", "---", ""):
            continue
        if set(key) <= set("-: "):
            continue
        rows[key] = (cells[1], cells[2])
    if not rows:
        raise AssertionError("§S-05's table parsed to zero rows")
    return rows


# ---------------------------------------------------------------------------
# ---- 26.99-17: her three refusal sentences, pinned to the UAT record -------
#
# ⛔⛔ THE PIN READS HER RECORD, NEVER THE CONSTANT THE CODE SHIPS. A case that
# compared `server.RECORD_DELETE_FAILED` against a copy of itself would pin an
# AGENT'S EDIT of her sentence as correct — the mirror trap this project has
# now hit nine times, twice inside corrections written to end the class. The
# expected bytes therefore come out of the document that records what she
# typed and what she approved.
#
# ⚠ HER WORDS FOR THIS ONE ARE NOT IN 26.99-COPY.md. They were typed live at
# the 2026-08-17 UAT, in answer to a defect she raised at the beat that
# PASSED, and they live in the UAT record beside the copy record. ⛔ The
# directory is personal and is NOT hardcoded here: it is the directory
# `STUDY_ROOM_COPY_RECORD` already names.
UAT_RECORD_NAME = "26.99-UAT.md"
UAT_FILLS_MARKER = "THE THREE FILLS"

# ⚠ THE ORDER IS THE RECORD'S OWN, and the mapping is the only thing in this
# block that was typed here. Under the marker the three bullets appear in
# this order — the file or its folder is locked, the disk cannot be written
# to, anything else — and these are the tokens `record_delete_failure_token`
# emits for each. ⛔ Not one of HER words is retyped anywhere in this file.
HER_FILL_ORDER = ("locked", "not_writable", "refused")

PINNED_REFUSALS = {"source": "", "sentences": 0}


def uat_record_text():
    """The UAT record, or None when the copy-record path was not supplied."""
    raw = os.environ.get(COPY_RECORD_ENV, "").strip()
    if not raw:
        return None
    path = Path(raw).parent / UAT_RECORD_NAME
    if not path.is_file():
        raise AssertionError(
            "the UAT record is not beside %s, so her three refusal "
            "sentences cannot be read out of her own words: %s"
            % (COPY_RECORD_ENV, path))
    return path.read_text(encoding="utf-8")


def her_refusal_sentences(text):
    """The three fills she approved, in the record's own order.

    Each bullet is `* <condition> ->` followed by her sentence in double
    quotes, WRAPPED ACROSS TWO LINES with the continuation indented. ⚠ The
    wrap is the record's typography and not her punctuation, so the two
    halves are rejoined with a single space and ⛔ nothing else about the
    bytes is touched — the spacing WITHIN a line is left exactly as she
    left it."""
    at = text.find(UAT_FILLS_MARKER)
    if at == -1:
        raise AssertionError(
            "the UAT record no longer carries %r, so there is nothing to "
            "pin her sentences against" % (UAT_FILLS_MARKER,))
    block = text[at:]
    end = block.find("\n\n")
    if end != -1:
        block = block[:end]
    out = []
    for chunk in block.split("\n      * ")[1:]:
        opened = chunk.find('"')
        closed = chunk.rfind('"')
        if opened == -1 or closed <= opened:
            raise AssertionError(
                "a fill in the UAT record carries no quoted sentence: %r"
                % (chunk[:80],))
        out.append(" ".join(part.strip()
                            for part in chunk[opened + 1:closed].split("\n")))
    if len(out) != len(HER_FILL_ORDER):
        raise AssertionError(
            "the UAT record holds %d fills, not %d — the set she approved "
            "has changed shape, and the mapping in HER_FILL_ORDER is no "
            "longer a reading of her record" % (len(out),
                                                len(HER_FILL_ORDER)))
    return out


# ---------------------------------------------------------------------------
# ---- the harness ----------------------------------------------------------

@contextlib.contextmanager
def temp_home():
    """A throwaway HOME, with a STRUCTURAL guard that the room's config
    directory really resolved inside it.

    ⛔ The guard is not politeness. The record file lives beside the keys
    file in `~/.study-room` (the owner's ruling, 2026-08-16), which is a
    directory she really has, holding a real paid key. A suite that wrote
    there would be writing into the very custody this file exists to
    prove."""
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-spend-record-")
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
def unwritable(directory):
    """One directory made unwritable, and put back — the fixture SHE drove.

    ⚠ THE REAL THING, NOT A PATCHED `unlink`. The owner made the record's
    own folder unwritable at the 2026-08-17 UAT and pressed the control; a
    stubbed exception would prove that the handler catches what the stub
    throws, which is not the question. The mode is restored in `finally` so
    the temporary home can still be removed."""
    mode = directory.stat().st_mode
    os.chmod(directory, 0o500)
    try:
        yield
    finally:
        os.chmod(directory, mode)


@contextlib.contextmanager
def fake_transport(answer):
    """The SHIPPED injection point, swapped and put back.

    ⛔ `librarian_call._transport` is the seam's one transport hook and ten
    existing suites use it; there is deliberately no environment variable
    and no config key that selects a transport, so a stray value in
    somebody's shell can never steer a production call. A second injection
    mechanism invented here would end that property."""
    seen = []

    def _fake(request, timeout_s, auth=None):
        if auth is not None:
            raise AssertionError(
                "a credential reached the transport on the local rung — "
                "the local rung takes none, and this suite holds none")
        seen.append({"url": request.get("url")})
        return answer

    prior = librarian_call._transport
    librarian_call._transport = _fake
    try:
        yield seen
    finally:
        librarian_call._transport = prior


def ollama_answer(input_tokens=1234, output_tokens=56):
    """One canned successful local answer, in the envelope the shipped
    ollama reader parses. `None` for a count omits the field entirely,
    which is how a provider that reports nothing arrives."""
    envelope = {
        "model": LOCAL_ECHO,
        "done_reason": "stop",
        "message": {"content": json.dumps({"verdicts": []})},
    }
    if input_tokens is not None:
        envelope["prompt_eval_count"] = input_tokens
    if output_tokens is not None:
        envelope["eval_count"] = output_tokens
    return (200, {}, json.dumps(envelope).encode("utf-8"))


def payload_with_needles():
    """A batch document carrying an id, a title, a path and a body — the
    four things the record must never learn."""
    return json.dumps({"items": [{
        "id": NEEDLE_ID,
        "title": NEEDLE_TITLE,
        "origin_path": NEEDLE_PATH,
        "text": NEEDLE_BODY,
    }]}, ensure_ascii=False)


def local_routing():
    """The real resolution, run against an empty shell and an empty
    settings file — so `import_presort`'s tier lands on her own machine and
    nothing anywhere needs a credential."""
    return librarian_call.resolve_routing({}, environ={})


def record_call(job, payload_text, routing):
    """`server.record_call`, or a failure that NAMES the missing symbol.

    ⚠ This exists so that the RED half of this plan fails legibly. Without
    it every case below dies on an AttributeError inside a helper and the
    output blames the harness rather than the work that has not landed."""
    fn = getattr(server, "record_call", None)
    if fn is None:
        raise AssertionError(
            "server.record_call does not exist yet — the wrapper that "
            "carries one seam call and leaves one line")
    return fn(job, payload_text, routing)


def record_path():
    """`study_lib.call_record_path`, or a failure that names it."""
    fn = getattr(study_lib, "call_record_path", None)
    if fn is None:
        raise AssertionError(
            "study_lib.call_record_path does not exist yet — the record "
            "file's home, beside the keys file (the owner's ruling)")
    return Path(fn())


def read_record_bytes():
    """The file exactly as it sits on disk, or b'' when there is none."""
    path = record_path()
    try:
        return path.read_bytes()
    except OSError:
        return b""


def read_record_doc():
    """The record, round-tripped through the file. ⚠ EVERY ASSERTION ABOUT
    CONTENT READS THIS, never the writer's arguments: a writer that dropped
    a field on the way to disk would pass a check made on its inputs."""
    raw = read_record_bytes()
    if not raw:
        return {"calls": []}
    return json.loads(raw.decode("utf-8"))


def record_lines():
    doc = read_record_doc()
    lines = doc.get("calls")
    return lines if isinstance(lines, list) else []


class FakeHandler(object):
    """The smallest stand-in a read-only route needs: it captures what the
    route answered instead of writing it to a socket."""

    def __init__(self):
        self.answer = None
        self.code = None

    def json_response(self, data, code=200):
        self.answer = data
        self.code = code
        return data

    def json_error(self, code, msg):
        return self.json_response({"ok": False, "error": msg}, code=code)


def route(data):
    """`handle_call_record`, called as a plain function on a stand-in."""
    fn = getattr(server.StudyHandler, "handle_call_record", None)
    if fn is None:
        raise AssertionError(
            "server.StudyHandler.handle_call_record does not exist yet — "
            "the read route D-02's Manage line renders")
    fake = FakeHandler()
    fn(fake, data)
    return fake


def delete_route(data=None):
    """`handle_call_record_delete`, called as a plain function on a
    stand-in — or a failure that NAMES the missing symbol, so the RED half
    of this plan fails legibly rather than inside a helper."""
    fn = getattr(server.StudyHandler, "handle_call_record_delete", None)
    if fn is None:
        raise AssertionError(
            "server.StudyHandler.handle_call_record_delete does not exist "
            "yet — the deletion D-02 offers beside the reading")
    fake = FakeHandler()
    fn(fake, data or {})
    return fake


# ---------------------------------------------------------------------------
# ---- 26.99-04 helpers: the other three call classes ------------------------

def provider_error_answer():
    """A transport failure carrying the provider's OWN words in the body.

    A 5xx is one of the four the seam may honestly re-ask (D-08), so the
    seam may send this more than once for a single `call_librarian` — which
    is exactly the shape that makes "one CALL, one line" worth asserting
    separately from "one request, one line"."""
    return (500, {}, json.dumps(
        {"error": {"message": PROVIDER_ERROR_TEXT}}).encode("utf-8"))


def routing_with_an_empty_tier(job):
    """A frozen Routing in which the tier THIS JOB sits in holds no fill.

    ⚠ BUILT THROUGH THE MODULE'S OWN CONSTRUCTOR, for the reason
    `tests/test_call_seam.py:routing_missing` already paid for once:
    `resolve_routing` CANNOT produce an unfilled tier (a cloud tier with no
    key resolves to her own machine), so the only way to drive the refusal
    path at all is to hand the seam the shape a partly-configured room
    would have. Every OTHER tier is filled on purpose — an empty tier
    beside a filled one is the exact shape in which a helpful fall-through
    would look like a feature."""
    empty = librarian_call.JOBS[job]["tier"]
    fills = dict((t, librarian_call.LOCAL_FILL)
                 for t in librarian_call.TIERS if t != empty)
    return librarian_call._make_routing(
        fills, librarian_call.DEFAULT_BASES, librarian_call.DEFAULT_TIMEOUTS,
        dict((t, librarian_call.SOURCE_DEFAULT)
             for t in librarian_call.TIERS))


# ---------------------------------------------------------------------------
# ---- 26.99-04: the static bypass gate, as a reusable predicate -------------
#
# ⚠ IT IS A FUNCTION AND NOT AN ASSERTION SO THAT IT CAN BE POINTED AT A
# MUTATED COPY. B-5: an equality asserted only against the real tree can
# never be shown to have teeth, and this project has collected four gates
# that could not go red. The live case below asks it about `server.py`; the
# drill beside that one asks it about `server.py` with one extra call site
# planted in memory, and REQUIRES a complaint.


def _callee_name(node):
    """The last segment of a call's dotted name — `a.b.c(...)` -> 'c'.

    ⚠ THE LAST SEGMENT AND NOT THE WHOLE DOTTED PATH, so an aliased import
    (`import librarian_call as L`) cannot walk past this gate wearing a
    different first name."""
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Name):
        return node.id
    return ""


def seam_site_counts(source):
    """(inside the wrapper, outside it) — judged on the SYNTAX TREE.

    ⚠ THE EXEMPTION IS GRANTED BY ENCLOSING FUNCTION, NEVER BY SHAPE, which
    is the same rule `tests/test_call_seam.py` already applies to the one
    variable-named job. A second seam call anywhere — including a second
    one inside the wrapper — is a caller the privacy record cannot see."""
    tree = ast.parse(source)
    inside_ids = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and node.name == "record_call":
            for inner in ast.walk(node):
                if isinstance(inner, ast.Call) and \
                        _callee_name(inner.func) == "call_librarian":
                    inside_ids.add(id(inner))
    every = [n for n in ast.walk(tree)
             if isinstance(n, ast.Call)
             and _callee_name(n.func) == "call_librarian"]
    inside = [c for c in every if id(c) in inside_ids]
    return len(inside), len(every) - len(inside)


def seam_gate_violations(source, expected):
    """Every way `source` fails the bypass claim, as readable strings.

    Two independent instruments over one claim, deliberately: a TEXT count
    over comment-and-string-stripped source (which a syntax tree cannot see
    growing inside a string one day) and a SYNTAX-TREE count that knows
    which function a call sits in (which a text scan can never know).
    Empty means no caller reaches the seam around `record_call`."""
    out = []
    text_sites = strip_py_source(source).count(SEAM_CALL_TEXT)
    if text_sites != expected:
        out.append("the stripped source reaches the seam %d time(s); the "
                   "measured constant says %d" % (text_sites, expected))
    inside, outside = seam_site_counts(source)
    if outside:
        out.append("%d caller(s) reach the seam AROUND record_call — every "
                   "one of them is a call the record cannot see" % outside)
    if inside != 1:
        out.append("record_call reaches the seam %d time(s) — a wrapper is "
                   "one call, or it is not a wrapper" % inside)
    return out


def blanked_lines(doc):
    """Every record line that SURVIVED with its fields emptied.

    ⛔ WHOLE RECORDS ARE DELETED, NEVER BLANKED — `release_cleaning_copies`'
    shipped rule, restated here as an instrument. A line whose `job` and
    both counts have been hollowed out is worse than an absent line: it
    still reads as evidence, and it says the room sent something it cannot
    name."""
    out = []
    for i, line in enumerate(doc.get("calls") or []):
        if not isinstance(line, dict):
            continue
        hollow = [k for k in ("job", "provider", "model")
                  if k in line and line[k] in ("", None)]
        if hollow:
            out.append("line %d kept but hollowed at %s"
                       % (i, ",".join(sorted(hollow))))
    return out


# ---------------------------------------------------------------------------
# ---- the cases ------------------------------------------------------------

class SpendRecordTest(unittest.TestCase):

    # -- where it lives (the one-way door) ---------------------------------

    def test_the_record_lives_beside_the_keys_file(self):
        """The owner's ruling, 2026-08-16, rated one-way: the room's own
        config directory, NOT inside her library's `librarian/` folder.

        ⚠ PINNED HERE BECAUSE MOVING IT LATER STRANDS REAL RECORDS — the
        reader looks in the new place and answers empty, and the evidence
        D-02 exists to provide is silently gone. Option A would also have
        required widening a shipped safety gate bound to her real folder;
        this pin is what makes that stay unnecessary."""
        with temp_home():
            self.assertEqual(record_path().parent,
                             Path(librarian_call.keys_path()).parent)
            self.assertEqual(record_path().parent.name,
                             study_lib.ROOM_CONFIG_DIR_NAME)

    # -- one call, one line ------------------------------------------------

    def test_one_call_leaves_exactly_one_line(self):
        """The tracer's whole claim, in one sentence."""
        with temp_home():
            with fake_transport(ollama_answer()) as seen:
                result = record_call("import_presort",
                                     payload_with_needles(),
                                     local_routing())
            self.assertEqual(len(seen), 1, "one call, not two")
            self.assertIs(result.get("ok"), True,
                          "the wrapper must return the seam's own answer, "
                          "unchanged")
            self.assertEqual(len(record_lines()), 1,
                             "one call must leave exactly one line")

    def test_the_line_carries_exactly_the_six_fields(self):
        """D-01's six, as a SET EQUALITY. A seventh key fails here."""
        with temp_home():
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            line = record_lines()[0]
            self.assertEqual(set(line), set(SIX_FIELDS),
                             "the record's keys moved — a seventh field is "
                             "how an origin path arrives")
            self.assertEqual(line["job"], "import_presort")
            self.assertEqual(line["provider"], "ollama")
            self.assertEqual(line["input_tokens"], 1234)
            self.assertEqual(line["output_tokens"], 56)
            self.assertIsInstance(line["at"], int)
            self.assertGreater(line["at"], 0)

    def test_two_calls_leave_two_lines_and_the_first_survives(self):
        """Append-only (D-21). The second write must not be a rewrite."""
        with temp_home():
            with fake_transport(ollama_answer(11, 22)):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            with fake_transport(ollama_answer(33, 44)):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            lines = record_lines()
            self.assertEqual(len(lines), 2)
            self.assertEqual([ln["input_tokens"] for ln in lines], [11, 33])

    def test_a_call_that_reports_no_counts_still_leaves_a_line(self):
        """D-01: the file answers WHAT RAN, not only what cost.

        ⚠ THIS IS THE CASE THE SIX `accumulate_usage` SITES CANNOT SEE, and
        it is the reason the wrapper is not folded into them. A fold over
        counts has nothing to add when the counts are absent; a record of
        what ran still owes a line."""
        with temp_home():
            with fake_transport(ollama_answer(None, None)):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            lines = record_lines()
            self.assertEqual(len(lines), 1,
                             "a zero-token call is still a call that ran")
            self.assertEqual(lines[0]["input_tokens"], 0)
            self.assertEqual(lines[0]["output_tokens"], 0)

    # -- 26.99-04: EVERY class of call, not only the ones that cost --------

    def test_every_class_of_call_leaves_exactly_one_line(self):
        """FOUR calls driven, FOUR lines found — asserted BY VALUE (B-3).

        ⚠ THIS IS THE CASE THE SIX `accumulate_usage` SITES CANNOT PASS,
        and it is the reason the record is not folded into them. Three of
        the four classes below report no counts at all, so a fold has
        nothing to add and adds nothing; a record of WHAT RAN still owes a
        line for each.

        ⚠ THE FIRST CLASS IS DRIVEN ON THE LOCAL RUNG RATHER THAN A CLOUD
        ONE, deliberately. ⛔ A cloud rung needs a credential, a live paid
        Anthropic key is on this machine, and this suite's transport FAILS
        if any `auth` ever reaches it — a property worth more than the
        provider name in the line. The claim under test is
        provider-independent by construction: the wrapper reads the SAME
        two usage-name lists `accumulate_usage` reads, never a second
        copy."""
        with temp_home():
            driven = 0
            # 1. an answer that reports its counts
            with fake_transport(ollama_answer(101, 202)):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            driven += 1
            # 2. an answer that reports NO counts (the local shape D-01
            #    names by hand: "with zero tokens")
            with fake_transport(ollama_answer(None, None)):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            driven += 1
            # 3. a REFUSAL — the tier holds nothing this job may use, so
            #    no request is ever built and nothing is sent. It still
            #    ran, and D-02 needs to be able to say so.
            record_call("import_presort", payload_with_needles(),
                        routing_with_an_empty_tier("import_presort"))
            driven += 1
            # 4. a FAILURE on the wire
            with fake_transport(provider_error_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            driven += 1

            lines = record_lines()
            DRIVEN["calls"] = driven
            DRIVEN["lines"] = len(lines)
            self.assertEqual(driven, CALL_CLASSES,
                             "the four classes D-01 names are the four "
                             "this case must drive")
            self.assertEqual(
                len(lines), driven,
                "drove %d calls and found %d lines — a call with no line "
                "is a call the privacy record cannot see"
                % (driven, len(lines)))

    def test_a_refused_call_leaves_a_zero_token_line(self):
        """A call that was never made still ran, and still gets a line.

        ⚠ NOTHING WAS SENT, WHICH IS PRECISELY WHY THE LINE MATTERS: the
        file is read as evidence about what left this machine, and an
        absent line is indistinguishable from a call that left no trace."""
        with temp_home():
            result = record_call("import_presort", payload_with_needles(),
                                 routing_with_an_empty_tier("import_presort"))
            self.assertTrue(librarian_call.is_refusal(result),
                            "the tier was emptied; this must refuse")
            lines = record_lines()
            self.assertEqual(len(lines), 1,
                             "a refused call is still a call that ran")
            self.assertEqual(set(lines[0]), set(SIX_FIELDS))
            self.assertEqual(lines[0]["input_tokens"], 0)
            self.assertEqual(lines[0]["output_tokens"], 0)
            self.assertEqual(lines[0]["job"], "import_presort")

    def test_a_failed_call_leaves_a_zero_token_line(self):
        """A transport failure gets a line too, with zeroes.

        ⚠ ONE CALL, ONE LINE — NOT ONE REQUEST, ONE LINE. A 5xx is one of
        the four the seam may honestly re-ask (D-08), so the wire may carry
        this more than once; the wrapper writes when `call_librarian`
        RETURNS, so the retries collapse into the single call they were."""
        with temp_home():
            with fake_transport(provider_error_answer()) as seen:
                result = record_call("import_presort",
                                     payload_with_needles(), local_routing())
            self.assertIsNot(result.get("ok"), True,
                             "a 5xx must not read as a successful answer")
            self.assertGreaterEqual(len(seen), 1)
            lines = record_lines()
            self.assertEqual(len(lines), 1,
                             "a failed call is still a call that ran, and "
                             "%d request(s) are still one call" % len(seen))
            self.assertEqual(lines[0]["input_tokens"], 0)
            self.assertEqual(lines[0]["output_tokens"], 0)

    def test_a_zero_count_is_the_integer_zero_and_not_a_stand_in(self):
        """⛔ NOT ABSENT, ⛔ NOT NULL, ⛔ NOT A STRING — across every class
        of call that reports nothing.

        ⚠ `bool` IS TESTED OUT EXPLICITLY: `True` is an `int` in Python, so
        `isinstance(x, int)` alone would let `false` through as a count and
        a reader would render it as 0 without anything having said so."""
        with temp_home():
            with fake_transport(ollama_answer(None, None)):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            record_call("import_presort", payload_with_needles(),
                        routing_with_an_empty_tier("import_presort"))
            with fake_transport(provider_error_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            lines = record_lines()
            self.assertEqual(len(lines), 3)
            for i, line in enumerate(lines):
                for field in ("input_tokens", "output_tokens"):
                    self.assertIn(field, line,
                                  "line %d dropped %s — an absent field "
                                  "lets a call that spent nothing vanish "
                                  "from the record that exists to prove "
                                  "nothing vanished" % (i, field))
                    value = line[field]
                    self.assertFalse(isinstance(value, bool),
                                     "line %d wrote a bool into %s"
                                     % (i, field))
                    self.assertIsInstance(value, int,
                                          "line %d wrote %r into %s"
                                          % (i, value, field))
                    self.assertEqual(value, 0)

    def test_the_providers_own_error_text_never_reaches_the_record(self):
        """T-26.99-15, over the ROUND-TRIPPED FILE BYTES.

        The room's failures are a CLOSED REGISTER of eleven tokens and no
        surface has ever carried a provider's own words, because no surface
        has access to them. The record inherits that guarantee rather than
        re-earning it — and the way to show it inherited is to put the
        words on the wire and then look for them in the file."""
        with temp_home():
            with fake_transport(provider_error_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            raw = read_record_bytes().decode("utf-8")
            self.assertNotIn(PROVIDER_ERROR_TEXT, raw)
            for fragment in ("invalid_request_error", "org-8f21c4", "quota"):
                self.assertNotIn(fragment, raw,
                                 "the provider's own error text reached "
                                 "the record")
            # and the six fields did not grow a seventh to carry it
            self.assertEqual(set(record_lines()[0]), set(SIX_FIELDS))

    # -- 26.99-04: nobody reaches the seam around the wrapper --------------

    def test_no_caller_reaches_the_seam_around_the_wrapper(self):
        """T-26.99-14. ⚠ A RECORD THAT SILENTLY MISSES CALLS IS WORSE THAN
        NO RECORD, because it is offered as evidence.

        Two independent instruments over one claim (a stripped-text count
        and a syntax-tree count that knows the enclosing function), plus
        the constant pinned BY VALUE in both the code and the instrument —
        because an equality that reads only the constant the code reads
        follows that constant wherever somebody moves it."""
        source = (REPO_ROOT / "server.py").read_text(encoding="utf-8")
        pinned = getattr(server, "SEAM_CALL_SITES", None)
        self.assertIsNotNone(
            pinned, "server.SEAM_CALL_SITES does not exist yet — the "
                    "measured seam-site count the bypass gate is asserted "
                    "against")
        self.assertEqual(
            pinned, EXPECTED_SEAM_CALL_SITES,
            "server.SEAM_CALL_SITES moved. ⛔ It is not a number to raise "
            "when a new caller appears: raising it is how the record goes "
            "silently partial. A caller that genuinely needs the seam "
            "directly is an owner-level decision, not a constant edit")
        self.assertEqual(seam_gate_violations(source, pinned), [])

    def test_the_bypass_gate_rejects_a_planted_extra_call_site(self):
        """B-5, and the mutation IS the assertion.

        ⚠ Nothing here writes a file: `server.py` is read once and every
        variant is a string held in memory. The control matters as much as
        the mutations — a gate that rejects everything is not a gate."""
        source = (REPO_ROOT / "server.py").read_text(encoding="utf-8")
        pinned = getattr(server, "SEAM_CALL_SITES", None)
        self.assertIsNotNone(pinned,
                             "server.SEAM_CALL_SITES does not exist yet")

        # the unmutated control
        self.assertEqual(seam_gate_violations(source, pinned), [],
                         "the real tree must be clean, or the mutations "
                         "below prove nothing")

        # (a) a whole new bypassing caller, appended
        planted = source + (
            "\n\ndef _a_caller_that_skips_the_record(job, text, routing):\n"
            "    return librarian_call.call_librarian(job, text, routing)\n")
        self.assertNotEqual(
            seam_gate_violations(planted, pinned), [],
            "a caller reaching the seam around record_call was not caught")

        # (b) a SECOND seam call smuggled inside the wrapper itself
        doubled = source.replace(
            "    result = librarian_call.call_librarian("
            "job, payload_text, routing)",
            "    result = librarian_call.call_librarian("
            "job, payload_text, routing)\n"
            "    librarian_call.call_librarian(job, payload_text, routing)")
        self.assertNotEqual(
            doubled, source,
            "the anchor moved — this drill asked nothing at all")
        self.assertNotEqual(
            seam_gate_violations(doubled, pinned), [],
            "a wrapper reaching the seam twice was not caught")

        # (c) THE NEGATIVE CONTROL FOR THE STRIP: prose about the call is
        #     not a call. ⚠ 26.94-02 turned a pin red TWICE from exactly
        #     this, which is why the count runs over stripped source.
        talked_about = source + (
            "\n\n# a comment naming librarian_call.call_librarian( and a\n"
            "# docstring below that names it again\n"
            "def _only_prose():\n"
            '    """librarian_call.call_librarian( — named, never made."""\n'
            "    return None\n")
        self.assertEqual(
            seam_gate_violations(talked_about, pinned), [],
            "prose about the seam was counted as a call to it")

    # -- 26.99-04: her deletion, and what it must leave behind -------------

    def test_clearing_the_record_empties_it_and_leaves_the_file(self):
        """D-02: the record is hers to clear, from beside the reading.

        ⭐⭐ THE EXPECTATION MOVED WITH THE BEHAVIOUR — 26.99955 UAT
        G-…-10, HER RULING OF 2026-08-26: *empty it, do not delete it*.
        ⛔ It is written down here rather than quietly swapped, because
        the case it replaces asserted the OPPOSITE and argued for it: the
        route used to unlink the file, and this suite pinned that.

        ⚠ WHAT SHE WAS SHOWN BEFORE RULING: this file is the one thing in
        the room that answers *has my privacy been kept* with evidence,
        the control destroyed it outright with no undo, and she had
        cleared her own mid-walk-through while testing something else.

        ⛔ AND THE RULE THE OLD CASE PROTECTED IS NOT REPEALED — see
        `test_clearing_removes_whole_records_and_never_blanks_a_field`
        below, unchanged and still driven. Not one line survives with its
        fields hollowed out. What survives is the container, which says
        nothing about any call that was ever made."""
        with temp_home():
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            self.assertEqual(len(record_lines()), 2)
            self.assertTrue(record_path().exists())

            answered = delete_route({})
            self.assertEqual(answered.code, 200)
            self.assertIs(answered.answer.get("ok"), True)
            self.assertTrue(
                record_path().exists(),
                "the record file was removed — her ruling is that it is "
                "EMPTIED and left behind")
            self.assertEqual(
                record_lines(), [],
                "a line survived the clear, which is the half of the old "
                "behaviour that did NOT change")
            self.assertEqual(read_record_doc(), {"calls": []},
                             "the emptied record is not the empty wrapper "
                             "the fail-open reader answers with")

    def test_after_deletion_the_reader_answers_empty_and_never_raises(self):
        """D-02's other half, and the reason the loader is fail-open: a
        deleted record must read as EMPTY, never as an error. A room that
        broke when she used the control would be teaching her not to."""
        with temp_home():
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            delete_route({})
            self.assertEqual(
                study_lib.load_call_record(record_path()), {"calls": []})
            # and again, through the route the surface actually reads
            answered = route({})
            self.assertEqual(answered.code, 200)
            self.assertIs(answered.answer.get("ok"), True)
            self.assertEqual(answered.answer.get("calls"), [])
            # a second read raises nothing either
            self.assertEqual(route({}).answer.get("calls"), [])

    def test_clearing_removes_whole_records_and_never_blanks_a_field(self):
        """⛔ THE SHIPPED RULE, RESTATED AT A NEW DELETION SITE.

        ⭐ AND IT SURVIVED HER 2026-08-26 RULING UNTOUCHED. The route now
        EMPTIES the record instead of unlinking it (G-…-10); this case is
        the guard that says emptying the FILE is not permission to hollow
        a LINE. Its assertions did not move.
        `release_cleaning_copies` reached it from one end and
        `expire_suggestions` from the other: a record kept with its fields
        emptied still reads as evidence, and it says the room sent
        something it cannot name.

        The predicate is proved to have teeth on a synthetic document in
        the same case, so a green here can never be a green over a shape
        that could not have carried the defect."""
        with temp_home():
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            delete_route({})
            self.assertEqual(record_lines(), [],
                             "a line survived the deletion")
            self.assertEqual(blanked_lines(read_record_doc()), [])

        # teeth: the predicate must SEE a hollowed line
        hollow = {"calls": [{"at": 1, "job": "", "provider": None,
                             "model": None, "input_tokens": 0,
                             "output_tokens": 0}]}
        self.assertNotEqual(
            blanked_lines(hollow), [],
            "the blanking check missed a line kept with its fields emptied")
        whole = {"calls": [{"at": 1, "job": "import_presort",
                            "provider": "ollama", "model": LOCAL_ECHO,
                            "input_tokens": 3, "output_tokens": 4}]}
        self.assertEqual(blanked_lines(whole), [])

    def test_deleting_when_there_is_no_record_is_not_an_error(self):
        """Idempotent by construction (S-4's discipline). Nothing to delete
        is ABSENCE — a second tap answers exactly as calmly as the first,
        and there is no empty state to announce."""
        with temp_home():
            self.assertFalse(record_path().exists())
            first = delete_route({})
            self.assertEqual(first.code, 200)
            self.assertIs(first.answer.get("ok"), True)
            second = delete_route({})
            self.assertEqual(second.code, 200)
            self.assertIs(second.answer.get("ok"), True)
            self.assertFalse(record_path().exists())

    def test_the_delete_route_touches_only_the_record_file(self):
        """T-26.99-17. ⛔ THE DIRECTORY IT DELETES FROM HOLDS THE KEYS FILE.
        A destructive local route living one name away from a credential
        gets to prove it removes one file and nothing else — including that
        it does not remove the directory when the directory is empty."""
        with temp_home():
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            room = record_path().parent
            sibling = room / "settings.json"
            sibling.write_text("{}", encoding="utf-8")
            neighbour = room / "not-ours.json"
            neighbour.write_text("{}", encoding="utf-8")

            delete_route({})
            # ⭐ 26.99955 UAT G-…-10: the record is EMPTIED now, not
            # removed — so what this case measures is unchanged in
            # substance and one assertion moved with the verb. ⚠ The
            # write goes through `atomic_write_bytes`, which creates a
            # temp file in THIS directory and renames it; the point of
            # the case is that nothing of that is left behind and no
            # neighbour is touched.
            self.assertEqual(record_lines(), [])
            self.assertEqual(
                sorted(p.name for p in room.iterdir()),
                sorted([record_path().name, "settings.json",
                        "not-ours.json"]),
                "the clear left a file behind in the directory that holds "
                "the keys file — a temp file from the atomic write, or a "
                "neighbour it should never have made")
            self.assertTrue(room.is_dir(),
                            "the room's own config directory was removed")
            self.assertTrue(sibling.exists(),
                            "the clear reached a neighbouring file")
            self.assertTrue(neighbour.exists())

    def test_the_delete_route_is_not_gated_on_any_feature_switch(self):
        """The same argument the read route already makes, and it holds
        harder here: a way to take custody back that stops working when the
        librarian is switched off is not custody.

        Read over source stripped of comments AND string literals."""
        fn = getattr(server.StudyHandler, "handle_call_record_delete", None)
        self.assertIsNotNone(
            fn, "handle_call_record_delete does not exist yet")
        code = stripped_source_of(fn)
        self.assertNotIn("_enabled", code,
                         "the deletion reads a feature switch")
        self.assertNotIn("cleaning_flag_on", code)
        self.assertNotIn("librarian_available", code)

    # -- 26.99-17 / G-26.99-7: a refused delete says WHY --------------------

    def test_a_refused_delete_answers_her_reason_and_never_a_500(self):
        """⛔⛔ G-26.99-7, DRIVEN THE WAY SHE DROVE IT — the record's own
        folder made unwritable, so `unlink` really raises.

        Measured at the boundary during the 2026-08-17 UAT, this route
        answered `500 {"ok": false, "error": "Something went wrong: [Errno
        13] Permission denied: '/Users/…/.study-room/call-record.json'"}`.
        It had no try/except at all, so the GENERIC handler composed her
        home path onto the one surface that answers "has my privacy been
        kept" with evidence.

        ⚠ A 200, NOT A 500. A refusal the room can classify is an ANSWER it
        can put into words, not a crash — and the words are hers."""
        self.assertNotEqual(
            os.geteuid(), 0,
            "this case cannot be driven as root: chmod does not stop root, "
            "so the unlink would succeed and the refusal path would never "
            "be entered")
        with temp_home():
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            self.assertEqual(len(record_lines()), 1)
            with unwritable(record_path().parent):
                answered = delete_route({})
            self.assertEqual(
                answered.code, 200,
                "a refusal the room can classify still answers a 500, so "
                "the generic handler is still the thing composing what she "
                "reads")
            self.assertIs(
                answered.answer.get("ok"), False,
                "the room answered a deletion it did not perform as done")
            self.assertEqual(
                answered.answer.get("reason"), "locked",
                "a locked folder was not classified as locked, so she is "
                "told the wrong reason")
            self.assertEqual(
                answered.answer.get("sentence"),
                server.RECORD_DELETE_FAILED["locked"],
                "the sentence did not cross the wire finished")
            # ⛔ AND THE LOGS REALLY ARE STILL HERE, which is exactly what
            # the last clause of her sentence claims. A sentence that said
            # so over a deleted file would be the same lie in reverse.
            self.assertTrue(record_path().exists())
            self.assertEqual(len(record_lines()), 1)

    def test_nothing_of_the_oserror_reaches_her_from_a_refused_delete(self):
        """⛔⛔ THE LEAK IS THE THING BEING PINNED, not merely the happy
        path. The body measured at the UAT carried a FULL HOME PATH.

        Nothing derived from the exception may cross the wire: not the
        errno, not the class name, not `strerror`, and above all not
        `filename`. The errno picks a token; the token picks a sentence;
        the object itself is dropped on the floor.

        ⚠ THE PREDICATE IS PROVED TO HAVE TEETH in the same case, against
        the shape that actually shipped — a green over a body that could
        not have carried the defect proves nothing."""
        self.assertNotEqual(os.geteuid(), 0, "cannot be driven as root")
        with temp_home():
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            path = record_path()
            with unwritable(path.parent):
                answered = delete_route({})
            blob = json.dumps(answered.answer, ensure_ascii=False)
            needles = ("/Users/", "Errno", "errno", "Permission denied",
                       "OSError", "PermissionError", "Traceback",
                       "Something went wrong", str(path), str(path.parent),
                       path.name)
            for needle in needles:
                self.assertNotIn(
                    needle, blob,
                    "a machine word or a path from the OSError reached the "
                    "one surface that exists to answer 'has my privacy been "
                    "kept': %r in %r" % (needle, blob))
            self.assertEqual(
                set(answered.answer), {"ok", "reason", "sentence"},
                "the refusal body carries a key beyond the answer, the "
                "token and her sentence")
            # teeth: the needles MUST see the body that shipped
            shipped = json.dumps({"ok": False, "error":
                                  "Something went wrong: [Errno 13] "
                                  "Permission denied: %r" % (str(path),)})
        self.assertTrue(
            any(n in shipped for n in needles),
            "the leak check cannot see the very body measured at the UAT — "
            "it is measuring nothing")

    def test_every_token_the_classifier_can_emit_owes_her_a_sentence(self):
        """⛔ FAIL-CLOSED ON THE TOKEN. An errno nobody anticipated is
        `refused` — ⛔ never a new token and ⛔ never the errno itself.

        The register is CLOSED: three tokens in, three sentences out, and
        every one of the three reachable from a real errno."""
        seen = set()
        for err in (errno.EACCES, errno.EPERM, errno.EROFS, errno.ENOSPC,
                    errno.EBUSY, errno.EIO, errno.ENOTEMPTY, None, 0, -1):
            exc = OSError(err or 0, "some strerror", "/a/private/path")
            exc.errno = err
            token = server.record_delete_failure_token(exc)
            self.assertIn(
                token, server.RECORD_DELETE_FAILED,
                "errno %r produced the token %r, which has no sentence — "
                "she would be shown a blank reason" % (err, token))
            self.assertNotIn("private", token)
            self.assertNotIn("strerror", token)
            seen.add(token)
        self.assertEqual(
            server.record_delete_failure_token(PermissionError(
                errno.EACCES, "x", "/p")), "locked")
        self.assertEqual(
            server.record_delete_failure_token(OSError(
                errno.EROFS, "x", "/p")), "not_writable")
        self.assertEqual(
            server.record_delete_failure_token(OSError(
                errno.ENOSPC, "x", "/p")), "refused",
            "an unanticipated errno did not fall to the fallback — the "
            "register is not fail-closed")
        self.assertEqual(
            seen, set(server.RECORD_DELETE_FAILED),
            "a sentence of hers ships that no real failure can reach")

    def test_the_import_assert_fires_on_a_token_with_no_sentence(self):
        """⚠⚠ THE ARM THAT SHOULD FAIL. A unanimous green with no arm that
        can go red proves nothing, and this project has collected gates
        that could not go red at all.

        ⛔ THE SHIPPED ASSERT IS THE THING DRIVEN — lifted out of
        `server.py` by its own syntax tree and executed a second time over
        a DOCTORED errno table. A retyped copy would prove only that this
        file can write an assert."""
        source = read_source("server.py")
        shipped = [ast.get_source_segment(source, node)
                   for node in ast.walk(ast.parse(source))
                   if isinstance(node, ast.Assert)]
        mine = [s for s in shipped if s and "RECORD_DELETE_FAILED" in s]
        self.assertEqual(
            len(mine), 1,
            "server.py does not carry exactly one import-time assert over "
            "RECORD_DELETE_FAILED, so a token with no sentence could ship "
            "as a blank line on her screen")
        code = compile(mine[0], "<shipped-assert>", "exec")
        real = {"RECORD_DELETE_FAILED": dict(server.RECORD_DELETE_FAILED),
                "_RECORD_DELETE_ERRNOS": dict(server._RECORD_DELETE_ERRNOS),
                "RECORD_DELETE_FALLBACK": server.RECORD_DELETE_FALLBACK}
        exec(code, dict(real))          # the shipped tree: silent

        # a token the classifier can now emit, with no sentence behind it
        doctored = dict(real)
        doctored["_RECORD_DELETE_ERRNOS"] = dict(real["_RECORD_DELETE_ERRNOS"])
        doctored["_RECORD_DELETE_ERRNOS"][errno.ENOSPC] = "out_of_room"
        with self.assertRaises(AssertionError):
            exec(code, doctored)

        # and the other direction: a sentence no failure can reach
        orphan = dict(real)
        orphan["RECORD_DELETE_FAILED"] = dict(real["RECORD_DELETE_FAILED"])
        orphan["RECORD_DELETE_FAILED"]["never_reached"] = "x"
        with self.assertRaises(AssertionError):
            exec(code, orphan)

    def test_her_three_refusal_sentences_are_the_ones_she_approved(self):
        """⛔⛔ D-14, PINNED TO HER RECORD AND NEVER TO THE CODE.

        Four static sentences were offered at the UAT and she REJECTED ALL
        FOUR, then typed her own frame with a slot in it. The three fills
        were offered as a SET and approved verbatim. ⛔ No agent may alter,
        extend, punctuate or "improve" them, and the pin that would catch
        such an edit cannot be a comparison against the constant the
        renderer reads — that is the mirror trap, and it would pin the edit
        as correct.

        ⚠ `logs` IS PLURAL AND IT IS HERS, beside a control that reads
        "clear the log". She was told about the mismatch and kept it, so
        this case fails if a later reader harmonises them.

        ⚠ WHEN THE RECORD IS NOT REACHABLE the pin cannot run, and `main()`
        prints that BY VALUE. ⛔ It is not silently skipped."""
        self.assertEqual(
            set(server.RECORD_DELETE_FAILED), set(HER_FILL_ORDER),
            "the shipped register is not the three she approved")
        text = uat_record_text()
        if text is None:
            PINNED_REFUSALS["source"] = ("unreachable (%s unset)"
                                         % (COPY_RECORD_ENV,))
            return
        PINNED_REFUSALS["source"] = UAT_RECORD_NAME
        hers = her_refusal_sentences(text)
        source = read_source("server.py")
        for token, sentence in zip(HER_FILL_ORDER, hers):
            self.assertEqual(
                server.RECORD_DELETE_FAILED[token], sentence,
                "her refusal sentence for " + token + " no longer matches "
                "the UAT record byte-for-byte — a later reader has "
                "recapitalised, repunctuated, extended or 'improved' the "
                "owner's words")
            self.assertEqual(
                source.count(sentence), 1,
                "her sentence for " + token + " is not exactly one literal "
                "in server.py — a second copy is where two surfaces drift "
                "apart")
            PINNED_REFUSALS["sentences"] += 1

        # ⚠ AND THE PIN IS PROVED TO HAVE TEETH, without writing anything
        # and without retyping one of her words: a prefix taken FROM HER
        # OWN parsed sentence is upper-cased in a copy of the record held
        # in memory, and the pin must stop seeing a match.
        prefix = hers[0][:30]
        self.assertIn(prefix, text,
                      "the parser did not read her sentence out of the "
                      "record verbatim")
        reparsed = her_refusal_sentences(text.replace(prefix, prefix.upper()))
        self.assertNotEqual(
            reparsed[0], server.RECORD_DELETE_FAILED[HER_FILL_ORDER[0]],
            "the byte pin cannot see a recapitalised sentence — it is "
            "measuring nothing")

    # -- what may never be in it -------------------------------------------

    def test_no_money_in_the_round_tripped_bytes(self):
        """D-01: tokens, never dollars — asserted over the FILE, at any
        depth, and over its raw bytes as well as its parsed shape."""
        with temp_home():
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            self.assertEqual(money_offenders(read_record_doc()), [],
                             "money reached the record file")
            raw = read_record_bytes().decode("utf-8")
            for symbol in MONEY_SYMBOLS:
                self.assertNotIn(symbol, raw,
                                 "a currency symbol reached the bytes")

    def test_no_item_id_title_or_path_in_the_round_tripped_bytes(self):
        """Law 5 / L-06. The payload carried all four; the record learns
        none of them."""
        with temp_home():
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            needles = (NEEDLE_ID, NEEDLE_TITLE, NEEDLE_PATH, NEEDLE_BODY)
            self.assertEqual(
                never_list_offenders(read_record_doc(), needles), [],
                "the record named one of her things")
            raw = read_record_bytes().decode("utf-8")
            for needle in needles:
                self.assertNotIn(needle, raw)

    def test_the_tier_name_never_enters_the_record(self):
        """D-06: `local` / `cheap-cloud` / `good-cloud` stay inside the
        code. The record reads the RESOLVED FILL, never the tier."""
        with temp_home():
            with fake_transport(ollama_answer()):
                record_call("import_presort", payload_with_needles(),
                            local_routing())
            raw = read_record_bytes().decode("utf-8")
            for tier in librarian_call.TIERS:
                self.assertNotIn('"%s"' % tier, raw,
                                 "a tier name reached the record")

    # -- fail-open ---------------------------------------------------------

    def test_a_missing_record_file_reads_as_empty(self):
        """The shipped fail-open posture, and what makes D-02's deletion
        honest: after a delete the reader answers empty, never an error."""
        with temp_home():
            loader = getattr(study_lib, "load_call_record", None)
            self.assertIsNotNone(
                loader, "study_lib.load_call_record does not exist yet")
            path = record_path()
            self.assertFalse(path.exists())
            self.assertEqual(loader(path), {"calls": []})
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("{ this is not json", encoding="utf-8")
            self.assertEqual(loader(path), {"calls": []},
                             "a hand-edited file reads as empty, never as "
                             "an error")

    # -- the route ---------------------------------------------------------

    def test_the_route_returns_the_six_fields_and_nothing_else(self):
        """A planted record with junk in it comes back projected. ⚠ The
        projection is why the route's promise is STRUCTURAL: the file is
        hers to edit, so a route that echoed it would inherit whatever a
        text editor put there."""
        with temp_home():
            path = record_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"calls": [{
                "at": 1755300000000, "job": "import_presort",
                "provider": "ollama", "model": LOCAL_ECHO,
                "input_tokens": 7, "output_tokens": 8,
                "title": NEEDLE_TITLE, "origin_path": NEEDLE_PATH,
                "cost_usd": 0.42,
            }]}), encoding="utf-8")
            answered = route({})
            self.assertEqual(answered.code, 200)
            calls = answered.answer.get("calls")
            self.assertEqual(len(calls), 1)
            self.assertEqual(set(calls[0]), set(SIX_FIELDS))
            self.assertEqual(money_offenders(answered.answer), [])
            self.assertEqual(
                never_list_offenders(answered.answer,
                                     (NEEDLE_TITLE, NEEDLE_PATH)), [])

    def test_the_route_answers_empty_when_there_is_no_record(self):
        with temp_home():
            answered = route({})
            self.assertEqual(answered.code, 200)
            self.assertIs(answered.answer.get("ok"), True)
            self.assertEqual(answered.answer.get("calls"), [])

    def test_the_route_refuses_a_bad_limit(self):
        """The shipped bool-before-int guard: `True` IS an `int` in
        Python, so the boolean check has to come first or a JSON `true`
        walks in as 1."""
        with temp_home():
            for bad in (True, False, 0, -1, 10_000, "5", 2.5, None):
                answered = route({"limit": bad})
                self.assertEqual(answered.code, 400,
                                 "limit %r must be refused" % (bad,))

    def test_the_route_is_not_gated_on_any_feature_switch(self):
        """⚠ AN EVIDENCE PROMISE WITH AN OFF-SWITCH IS NOT A PROMISE —
        the argument `handle_clean_runs` already makes for reversibility,
        applied to custody.

        Read over source stripped of comments AND string literals, because
        the sentence above contains the very words the scan looks for."""
        fn = getattr(server.StudyHandler, "handle_call_record", None)
        self.assertIsNotNone(fn, "handle_call_record does not exist yet")
        code = stripped_source_of(fn)
        self.assertNotIn("_enabled", code,
                         "the record route reads a feature switch")
        self.assertNotIn("cleaning_flag_on", code)
        self.assertNotIn("librarian_available", code)

    # -- the seam stays store-pure -----------------------------------------

    def test_the_seam_stays_store_pure(self):
        """SRM-13. The wrapper lives in `server.py` and the seam is left
        exactly as store-free as it was: `librarian_call` has no library
        root, writes nothing and takes no lock, and this plan does not
        teach it to."""
        source = strip_py_source(
            (REPO_ROOT / "librarian_call.py").read_text(encoding="utf-8"))
        self.assertNotIn("call_record", source,
                         "the record reached the seam")
        self.assertFalse(hasattr(librarian_call, "record_call"))
        self.assertTrue(callable(getattr(server, "record_call", None)),
                        "the wrapper belongs in server.py, where a library "
                        "root exists")

    def test_no_money_in_the_writer_or_the_route(self):
        """D-01 at the source level, over the four functions this plan
        adds — comments and prose blanked first."""
        subjects = [getattr(server, "record_call", None),
                    getattr(server.StudyHandler, "handle_call_record", None),
                    # 26.99-04: the deletion joins the same ban, because a
                    # destructive route is exactly where a "what did this
                    # cost you" flourish would feel harmless.
                    getattr(server.StudyHandler,
                            "handle_call_record_delete", None),
                    getattr(study_lib, "call_record_path", None),
                    getattr(study_lib, "merge_call_record", None)]
        self.assertTrue(all(s is not None for s in subjects),
                        "one of the five new functions does not exist yet")
        for subject in subjects:
            code = stripped_source_of(subject).lower()
            for word in MONEY_WORDS:
                self.assertNotIn(word, code,
                                 "money in %r" % (subject,))
            for symbol in MONEY_SYMBOLS:
                self.assertNotIn(symbol, code)

    # -- the negative controls: both predicates must have teeth ------------

    def test_the_money_predicate_has_teeth(self):
        """Without this, every money assertion above could be walking a
        shape that never could have contained the defect — and a contract
        written after the code passes vacuously."""
        clean = {"calls": [{"at": 1, "job": "import_presort",
                            "provider": "ollama", "model": LOCAL_ECHO,
                            "input_tokens": 3, "output_tokens": 4}]}
        self.assertEqual(money_offenders(clean), [])
        for planted in ({"cost_usd": 0.42},
                        {"note": "about " + MONEY_SYMBOLS[0] + "0.42"},
                        {"ratio": 1.5},
                        {"price": 1}):
            dirty = json.loads(json.dumps(clean))
            dirty["calls"][0].update(planted)
            self.assertNotEqual(money_offenders(dirty), [],
                                "the money check missed %r" % (planted,))

    def test_the_never_list_predicate_has_teeth(self):
        clean = {"calls": [{"at": 1, "job": "import_presort",
                            "provider": "ollama", "model": LOCAL_ECHO,
                            "input_tokens": 3, "output_tokens": 4}]}
        self.assertEqual(never_list_offenders(clean, (NEEDLE_ID,)), [])
        for planted in ({"item_id": "x"}, {"title": "x"},
                        {"origin_path": "x"}, {"model": NEEDLE_ID}):
            dirty = json.loads(json.dumps(clean))
            dirty["calls"][0].update(planted)
            self.assertNotEqual(
                never_list_offenders(dirty, (NEEDLE_ID,)), [],
                "the never-list check missed %r" % (planted,))

    # -- 26.99-13 / G-3: her room-words in the log -------------------------

    def test_every_row_of_the_log_renders_her_room_word(self):
        """G-3, DRIVEN. The job column is the ROW NAME she approved, read
        out of `server.JOB_ROOM_WORDS` — ⛔ never retyped here.

        ⚠ THE ROW SET IS DERIVED FROM THE LIVE TABLE, never counted. The
        plan was written when the table held nine rows; two jobs were
        deleted on the owner's own instruction the day it ran, and a suite
        that had pinned nine would now be red about her decision instead of
        about the code.

        ⛔ N-2: a zero-token row is planted alongside, and it renders. A
        failed call and a refused call each keep their line with 0 in / 0
        out — that is the record being honest about a call that happened
        and cost nothing."""
        words = server.JOB_ROOM_WORDS
        names = {job: pair[0] for job, pair in words.items()}
        self.assertTrue(names, "the room has no jobs to render at all")
        for job, pair in sorted(words.items()):
            line = client_line(planted_call(job), names)
            self.assertEqual(
                job_column(line), pair[0],
                "the log printed the machine's own key where her room-word "
                "belongs — the exact thing her room-words exist to prevent")
        # ⛔ N-2, in the same mechanism: zero in, zero out, still a line.
        job = sorted(words)[0]
        zero = client_line(planted_call(job, tokens=(0, 0)), names)
        self.assertEqual(job_column(zero), words[job][0])
        self.assertIn("0 tokens in, 0 tokens out", line_text(zero),
                      "a zero-token row was filtered, hidden or collapsed")

    def test_a_row_naming_a_job_the_room_does_not_have_falls_back(self):
        """G-3's fallback, DRIVEN. ⛔ Not blank, ⛔ not a sentence, ⛔ not
        dropped — the machine's own word.

        ⚠ THE IMPORT-TIME ASSERT DOES NOT MAKE THIS LOOKUP TOTAL. It
        guarantees every job the room WRITES has a room-word; it guarantees
        nothing about the record FILE, which is hers to read, edit and
        delete. A hand-edited line can name a job that does not exist, and
        the honest label for a line she typed herself is the string she
        typed. ⛔ No second server-side guard is added for this."""
        names = {job: pair[0] for job, pair in server.JOB_ROOM_WORDS.items()}
        line = client_line(planted_call("no-such-job"), names)
        self.assertEqual(
            job_column(line), "no-such-job",
            "an unknown job must render the machine's word — an invented "
            "sentence would be an agent writing copy (D-14) and a blank "
            "would be the room hiding a line she can see on disk")

    def test_the_job_column_carries_her_title_and_not_her_sentence(self):
        """G-3's mechanism question, settled and then MEASURED: each
        `JOB_ROOM_WORDS` value is a `(title, sentence)` pair, and a record
        row holds four short facts — so the job slot wants the short row
        name. The sentence describes what a job DOES; that belongs on the
        standing per-job list, where `renderJobDisclosure` already renders
        it (since 26.99955-11 as its own element beneath the name)."""
        words = server.JOB_ROOM_WORDS
        names = {job: pair[0] for job, pair in words.items()}
        differing = [j for j, p in sorted(words.items()) if p[0] != p[1]]
        self.assertTrue(differing,
                        "no row has a title distinct from its sentence, so "
                        "this case could not tell them apart")
        for job in differing:
            line = line_text(client_line(planted_call(job), names))
            self.assertIn(words[job][0], line)
            self.assertNotIn(
                words[job][1], line,
                "her whole sentence landed in a table column — it would "
                "make the line unreadable and say the same thing twice on "
                "one screen")

    def test_the_record_render_asks_the_route_that_carries_her_words(self):
        """G-3's join, DRIVEN and then asserted statically.

        ⛔ THE NAMES DO NOT RIDE THE RECORD ROUTE. `handle_call_record`
        re-projects exactly six fields and the set-equality pin above is
        nothing in this phase authorises moving. The room already has a
        route that carries her words, so the client joins the two."""
        words = server.JOB_ROOM_WORDS
        job = sorted(words)[0]
        out = client_render("renderCallRecord(host);", {
            "/api/librarian/record": [record_answer([planted_call(job)])],
            "/api/librarian/jobs": [jobs_answer(words)]})
        self.assertIn("/api/librarian/jobs", out["seen"],
                      "the record render never asked for her words")
        self.assertIn(words[job][0], out["html"])
        # and the three static halves, over comment-stripped source (B-2)
        render = js_function(client_source(), "renderCallRecord")
        line = js_function(client_source(), "callRecordFields")
        self.assertIn("/api/librarian/jobs", render)
        self.assertNotIn(
            "parts.push(String(c.job))", line,
            "the raw job key is still pushed unconditionally")
        self.assertIn("String(c.job)", line,
                      "the fallback to the machine's word is gone")

    def test_a_failed_jobs_read_costs_the_labels_and_never_the_record(self):
        """T-26.99-66, DRIVEN with the jobs request forced to reject AND
        forced not-ok.

        ⛔ A DECORATIVE LOOKUP MAY NEVER HIDE THE EVIDENCE. The record is
        the one surface that answers "has my privacy been kept" with
        evidence rather than a promise; a labels request that fails must
        cost the labels and nothing else."""
        words = server.JOB_ROOM_WORDS
        job = sorted(words)[0]
        for broken in ("reject", {"ok": False, "status": 500, "data": None}):
            out = client_render("renderCallRecord(host);", {
                "/api/librarian/record": [record_answer([planted_call(job)])],
                "/api/librarian/jobs": [broken]})
            self.assertIn(
                job, out["html"] or "",
                "a failing labels request cost her the record itself")
            self.assertNotIn(words[job][0], out["html"] or "",
                             "a name arrived from somewhere other than the "
                             "route that carries her words")

    def test_no_count_of_the_jobs_reaches_the_record_surface(self):
        """⛔ D-17. The list she reads never states its own length — not in
        the join, not in a field, not as a heading. ⚠ This case pins no
        count either: it asserts the ABSENCE of a class of token.

        ⚠ SCOPED TO WHAT THIS PLAN ADDS. A record line legitimately carries
        digits — a date and two token counts — so the digit ban is asserted
        on the JOB COLUMN, and the count-word ban on the whole render."""
        words = server.JOB_ROOM_WORDS
        names = {job: pair[0] for job, pair in words.items()}
        count_words = ("jobs", "count", "total", "entries", "listed",
                       "of them")
        for job in sorted(words):
            column = job_column(client_line(planted_call(job), names))
            self.assertIsNone(
                DIGIT_IN_COLUMN.search(column),
                "a digit reached the job column: %r" % (column,))
        out = client_render("renderCallRecord(host);", {
            "/api/librarian/record": [record_answer(
                [planted_call(j) for j in sorted(words)])],
            "/api/librarian/jobs": [jobs_answer(words)]})
        low = (out["html"] or "").lower()
        for word in count_words:
            self.assertNotIn(word, low,
                             "a count-word reached the record surface: %r"
                             % (word,))
        render = js_function(client_source(), "renderCallRecord")
        for hit in LENGTH_READ.finditer(render):
            self.assertEqual(
                hit.group(1), "calls",
                "a length other than the record's own is read where the "
                "render can reach it: %r" % (hit.group(0),))

    # -- 26.99-13 / G-4: the section stays after she clears it -------------

    def test_the_section_stays_after_she_clears_it(self):
        """G-4, DRIVEN end to end: lines on disk, the control pressed, the
        delete succeeds, the re-read answers empty — and her line, her
        control and an empty list are what is left on screen.

        ⛔ NO NEW SENTENCE IS WRITTEN ANYWHERE. Her ruling supplies the
        missing half: the words are her existing line."""
        words = server.JOB_ROOM_WORDS
        job = sorted(words)[0]
        out = client_render("clearCallRecord(host);", {
            # ⚠ 26.99-17 CORRECTED THIS FIXTURE, and the correction is not
            # cosmetic. The route has ALWAYS answered `{"ok": true}` in its
            # body; this plant said `{}`, which is a shape the server cannot
            # produce. Since a classified refusal now answers a 200 with
            # `ok:false` in the BODY, the client must read the body as well
            # as the transport — and an under-specified plant would have
            # made a green here mean nothing.
            "/api/librarian/record/delete": [{"ok": True, "status": 200,
                                              "data": {"ok": True}}],
            "/api/librarian/record": [record_answer([])],
            "/api/librarian/jobs": [jobs_answer(words)]})
        html = out["html"] or ""
        self.assertIn(client_constant("CALL_RECORD_HEAD"), html,
                      "her line went with the lines — the whole section "
                      "vanished under her hand, which is what she said "
                      "reads as broken")
        self.assertIn(client_constant("CALL_RECORD_CLEAR"), html,
                      "her control went with the lines")
        self.assertNotIn("tokens in", html,
                         "a row survived a clear that reported success")
        self.assertNotIn(job, html, "a job name survived the clear")

    def test_a_refused_delete_is_not_painted_as_a_clear(self):
        """⛔⛔ CR-01. THE DELETE'S OWN ANSWER, AND THE COVERAGE HOLE THE
        MECHANISM SHIPPED IN. `/api/librarian/record/delete` was planted in
        exactly ONE place in this suite and it always answered 200, so the
        one branch where this surface can make a FALSE STATEMENT was never
        driven.

        ⚠ `apiPost` RESOLVES ON 4xx AND 5xx — it rejects only on a network
        failure or a non-JSON body, and `json_error` produces a JSON body.
        So a 403 or a 500 from the delete route takes the `.then` branch.

        ⚠ AND `study_lib.load_call_record` FAILS OPEN: an unreadable record
        answers `{calls: []}`. Put the two together — a record file that is
        unreadable AND undeletable, which is a not-writable parent
        directory, a dataless iCloud file, or a volume remounted read-only —
        and the re-read is ok-but-empty while the file is still on disk with
        every call it ever recorded.

        Driven against the tree that shipped, this returned her line and her
        control: BYTE-IDENTICAL to the successful-clear render. The one
        surface in the room that answers "has my privacy been kept" told her
        it had been, and it had not.

        ⚠ 26.99-17 ADDED THE SECOND HALF. The plant below is a server that
        died some OTHER way — a real 500, unclassified, carrying no sentence
        — so the client falls back to her `refused` fill. Truthful AND
        legible: the room does not claim the clear, and it says why."""
        out = client_render("clearCallRecord(host);", {
            "/api/librarian/record/delete": [{"ok": False, "status": 500,
                                              "data": {"error": "refused"}}],
            "/api/librarian/record": [record_answer([])],
            "/api/librarian/jobs": [jobs_answer(server.JOB_ROOM_WORDS)]})
        html = out["html"] or ""
        self.assertNotIn(
            client_constant("CALL_RECORD_HEAD"), html,
            "a delete the server refused was painted as a successful "
            "clear — the record is still on disk and the room said it was "
            "gone")
        self.assertNotIn(client_constant("CALL_RECORD_CLEAR"), html,
                         "her control was painted over a refused delete")
        self.assertNotIn("tokens in", html)
        self.assertIn(
            server.RECORD_DELETE_FAILED["refused"], html,
            "the refusal was truthful and SILENT — a press with no visible "
            "consequence, which is what she read as the app being broken "
            "(G-26.99-7)")

    def test_a_refused_delete_says_why_in_her_words(self):
        """⛔⛔ G-26.99-7, THE CLOSE — driven on the shape the server now
        really sends.

        At the UAT the rows correctly STAYED on a delete the room could not
        perform, and nothing said so. Her verdict passed the honesty and
        failed the legibility: "it feels like the app is broken because
        nothing happened, I think we still need some error message to
        explian to the user".

        ⚠⚠ THIS IS THE ARM A CLIENT-ONLY READER WOULD GET WRONG. A
        classified refusal answers a 200, and `apiPost` reads `res.ok` off
        the HTTP STATUS — so `res.ok` is TRUE here. The room's own answer
        is in the BODY, and a client that read only the transport would
        take this for a clear and set the pane's fact on it.

        ⛔ THE ROWS STAY (CR-01, unchanged by this wave), and ⛔ exactly ONE
        of her three reasons is named."""
        words = server.JOB_ROOM_WORDS
        job = sorted(words)[0]
        out = client_render("clearCallRecord(host);", {
            "/api/librarian/record/delete": [
                {"ok": True, "status": 200,
                 "data": {"ok": False, "reason": "locked",
                          "sentence":
                              server.RECORD_DELETE_FAILED["locked"]}}],
            "/api/librarian/record": [record_answer([planted_call(job)])],
            "/api/librarian/jobs": [jobs_answer(words)]})
        html = out["html"] or ""
        self.assertIn(
            server.RECORD_DELETE_FAILED["locked"], html,
            "a refused delete said nothing at all, so the press had no "
            "visible consequence — G-26.99-7, exactly as she reported it")
        self.assertIn(words[job][0], html,
                      "the rows went away on a delete that never happened")
        self.assertIn(client_constant("CALL_RECORD_HEAD"), html,
                      "her line went with the refusal")
        self.assertIn(client_constant("CALL_RECORD_CLEAR"), html,
                      "her control went with the refusal")
        for other in ("not_writable", "refused"):
            self.assertNotIn(
                server.RECORD_DELETE_FAILED[other], html,
                "a second reason was named beside the real one — she asked "
                "for THE reason, not a list of the room's guesses")

    def test_a_dead_server_still_says_why(self):
        """⚠ THE OTHER ARM, AND IT IS THE ONE THE UAT ACTUALLY TOOK BEFORE
        the server-side classification existed: `apiPost` rejects on a
        network failure or a body that will not parse, and the re-read that
        follows fails the same way — so this path used to leave NOTHING on
        screen at all.

        ⛔ Nothing came back, so there is no sentence to read out of a
        body. `refused` is the honest fill: it names no cause the room
        cannot know, and it is hers.

        ⛔ AND NOTHING IS CLAIMED. No read succeeded, so her line and her
        control are not painted over the silence."""
        out = client_render("clearCallRecord(host);", {
            "/api/librarian/record/delete": ["reject"],
            "/api/librarian/record": ["reject"],
            "/api/librarian/jobs": ["reject"]})
        html = out["html"] or ""
        self.assertIn(
            server.RECORD_DELETE_FAILED["refused"], html,
            "a server that died outright left the press with no visible "
            "consequence at all")
        self.assertNotIn(client_constant("CALL_RECORD_HEAD"), html,
                         "her line was painted over a read that never "
                         "happened")
        self.assertNotIn(client_constant("CALL_RECORD_CLEAR"), html)

    def test_a_successful_clear_gains_no_new_sentence(self):
        """⛔ THE SUCCESS PATH GAINS NOTHING — no toast, no "deleted"
        confirmation, nothing beneath. Her line, her control, and an empty
        list, exactly as she passed it at beat 6.

        ⚠ This is the guard against reading G-26.99-7 as "the room should
        narrate itself". She asked for a REFUSAL to speak. A room that
        congratulated her on a deletion would be talking about itself."""
        words = server.JOB_ROOM_WORDS
        out = client_render("clearCallRecord(host);", {
            "/api/librarian/record/delete": [{"ok": True, "status": 200,
                                              "data": {"ok": True}}],
            "/api/librarian/record": [record_answer([])],
            "/api/librarian/jobs": [jobs_answer(words)]})
        html = out["html"] or ""
        self.assertIn(client_constant("CALL_RECORD_HEAD"), html)
        for token in sorted(server.RECORD_DELETE_FAILED):
            self.assertNotIn(
                server.RECORD_DELETE_FAILED[token], html,
                "a clear that WORKED explained itself — " + token)
        # ⭐⭐ 26.99955 UAT G-…-10: THE COUNT MOVED FROM "ONE PARAGRAPH" TO
        # "ONE PARAGRAPH SHE CAN SEE", and the teeth did not move with it.
        # Her ask is a SECOND paragraph now, written at this same sink and
        # hidden until she presses — so a bare `<p` count reads it as
        # something added beneath her line, which is precisely what it is
        # not. ⛔ What this still catches is the thing the case is named
        # for: a toast, a "deleted" confirmation, or any sentence a
        # successful clear congratulates her with would be a THIRD
        # paragraph carrying neither class, and both assertions below go
        # red on it.
        self.assertEqual(
            html.count("<p"), 2,
            "the card no longer holds exactly her line and her ask — "
            "something was added or removed at the sink: %r" % (html,))
        self.assertEqual(
            html.count('class="call-record-ask"'), 1,
            "her ask is not the second paragraph, so the count above is "
            "measuring something other than what it claims")
        self.assertIn(
            'class="call-record-ask" style=', html)
        ask_at = html.find('class="call-record-ask"')
        self.assertIn(
            "display:none",
            html[ask_at:html.find(">", ask_at)],
            "her question is on screen on a card nobody asked a question "
            "of — the ask must be hidden until she presses")

    def test_the_clients_one_refusal_literal_is_hers(self):
        """⚠⚠ THE ONE HER-WORD LITERAL app.js HOLDS FOR THIS, AND WHY IT
        EXISTS AT ALL. Two of her three sentences live only on the server
        and cross the wire FINISHED. The third cannot: a rejected promise
        carries no body to read a sentence out of, and silence there is the
        exact defect being closed.

        ⛔ SO IT IS PINNED TWICE OVER — against HER OWN RECORD, and against
        the server's constant — and the two copies therefore cannot drift
        without this case going red."""
        value = client_constant("RECORD_DELETE_REFUSED")
        self.assertEqual(
            value, server.RECORD_DELETE_FAILED["refused"],
            "the client's fallback sentence and the server's have drifted "
            "apart — two copies of her words that can disagree")
        self.assertEqual(
            read_source("app.js").count(value), 1,
            "RECORD_DELETE_REFUSED is not exactly one literal in app.js — "
            "a second copy is where two surfaces drift apart")
        text = uat_record_text()
        if text is None:
            return
        self.assertEqual(
            value,
            her_refusal_sentences(text)[HER_FILL_ORDER.index("refused")],
            "the client's sentence no longer matches the UAT record "
            "byte-for-byte — a later reader has edited the owner's words")
        PINNED_REFUSALS["sentences"] += 1

    def test_a_first_ever_visit_still_renders_absence(self):
        """⚠ G-4 IS SCOPED TO THE EVENT SHE CAUSED, and this is the case
        that says so. A first-ever visit with no calls has genuinely
        nothing to say, and the shipped rule — nothing to say is ABSENCE,
        not an empty state to announce — is `renderCleaningRuns`' own.
        Offering "clear the log" beside a list that has never had a line is
        offering to delete nothing."""
        out = client_render("renderCallRecord(host);", {
            "/api/librarian/record": [record_answer([])],
            "/api/librarian/jobs": [jobs_answer(server.JOB_ROOM_WORDS)]})
        self.assertEqual(out["html"], "",
                         "a first visit announced an empty state she never "
                         "asked for")

    def test_a_not_ok_answer_renders_absence_even_with_the_flag_set(self):
        """⛔ THE `res.ok` HALF, AND THIS IS THE CASE THAT FAILS IF A LATER
        READER COLLAPSES THE TWO CONDITIONS INTO ONE. If the delete failed
        and the re-read also failed, painting her line over an empty list
        would tell her the clear worked when nothing was read. That is a
        lie on the room's evidence surface."""
        out = client_render("renderCallRecord(host, {afterClear: true});", {
            "/api/librarian/record": [{"ok": False, "status": 500,
                                       "data": None}],
            "/api/librarian/jobs": [jobs_answer(server.JOB_ROOM_WORDS)]})
        self.assertEqual(out["html"], "",
                         "a failed re-read was painted as a successful "
                         "clear")

    def test_a_failed_read_renders_absence_even_with_the_flag_set(self):
        """The `.catch` half of the same guard, driven by rejection."""
        out = client_render("renderCallRecord(host, {afterClear: true});", {
            "/api/librarian/record": ["reject"],
            "/api/librarian/jobs": [jobs_answer(server.JOB_ROOM_WORDS)]})
        self.assertEqual(out["html"], "",
                         "a rejected read was painted as a successful "
                         "clear")

    def test_the_empty_section_needs_both_an_ok_read_and_the_flag(self):
        """The same guard, asserted statically over comment-stripped source
        — ⛔ a parameter, never module state: a flag that outlives the call
        is a flag a later paint reads by accident."""
        render = js_function(client_source(), "renderCallRecord")
        clear = js_function(client_source(), "clearCallRecord")
        signature = render[:render.find(")") + 1]
        self.assertIn(",", signature,
                      "renderCallRecord still takes one parameter — there "
                      "is no after-a-clear branch at all: %r" % (signature,))
        self.assertIn("afterClear", render)
        self.assertIn("res.ok", render,
                      "the ok half of the guard is gone")
        guard = AFTER_CLEAR_GUARD.search(render)
        self.assertIsNotNone(
            guard,
            "the empty-list guard no longer names the flag, so the empty "
            "state is unconditional rather than scoped to her clear")
        at = clear.find(".catch")
        self.assertNotEqual(at, -1, "clearCallRecord lost its .catch")
        self.assertIn("afterClear", clear[:at],
                      "the success branch does not set the flag")
        self.assertNotIn(
            "afterClear", clear[at:],
            "the .catch sets the flag — a delete that did not land would "
            "be made to look like one that did")

    # -- 26.99-16 / WR-01: the fact survives the surface's repaints -------
    #
    # ⛔⛔ FOUR LIFTED-AND-RUN CASES RETIRED HERE BY 26.99955-08, AND THEIR
    # SUBJECT IS NOT RETIRED WITH THEM. They drove `refreshLibrarianSettings`
    # — the Manage librarian pane's repaint — to prove her ruling, verbatim
    # from a checkpoint with two options and no recommendation: "Remember
    # while the panel is open". Her 2026-08-26 ruling took the activity log
    # OFF Manage entirely ("Only in the room"), so that function no longer
    # paints the record and those four cases had no subject left to drive:
    #   test_the_section_she_cleared_survives_a_repaint_of_the_pane
    #   test_a_repaint_without_a_clear_renders_absence
    #   test_a_refused_delete_leaves_the_repaint_nothing_to_carry
    #   test_leaving_the_pane_forgets_that_she_cleared_it
    #
    # ⛔ THE FOUR FACTS THEY HELD ARE NOW DRIVEN IN A REAL BROWSER, over the
    # real card, in `tests/test_pen_cup_door.cjs` arm E — which is STRONGER
    # than what they did: they lifted one function and handed it a fake host,
    # and arm E raises the actual page in Chrome by tapping the actual pen
    # cup. The four, restated so this comment is a map and not an epitaph:
    #   (1) a clear survives the card being put away and raised again in the
    #       same desk visit;
    #   (2) a raise with NO clear renders ABSENCE — the fact is "she cleared
    #       it", ⛔ never "the list is empty";
    #   (3) a REFUSED delete is not remembered as a clear, and her refusal
    #       sentence belongs to the press, not to the surface;
    #   (4) leaving the desk forgets — that is what "while" means.
    # ⚠ Arm E found TWO defects the moment it ran, which is the argument for
    # having moved rather than dropped them: the raised card was never torn
    # down when she left the desk, so a new visit re-showed the PREVIOUS
    # visit's render; and the desk's forget, first written into the station
    # painter, ran AFTER the card had already read the flag.
    #
    # ⚠ AND THE LIFETIME ITSELF IS A TRANSLATION SHE IS OWED A LOOK AT: "the
    # panel" no longer exists, so it now means "the desk visit"
    # (`openStation('desk')`). Recorded in 26.99955-08-SUMMARY.md and in
    # deferred-items.md — it is an executor's reading of a ruling she gave
    # about a surface that has since moved.

    def test_the_manage_pane_no_longer_paints_the_record(self):
        """⛔ HER 2026-08-26 RULING, AS AN ABSENCE PIN — the activity log
        "should not be listed 100% on the manage your library dashboard",
        and it stays reachable "Only in the room".

        ⚠ AN ABSENCE IS THE EASIEST THING TO ASSERT VACUOUSLY, so both
        halves are read out of a lift that is checked for having WORKED
        first: `refreshLibrarianSettings` and `renderLibrarianSettings` are
        both required to be non-trivially present before either is searched.
        A function that could not be lifted would otherwise "contain" no
        forbidden call and pass.

        ⛔ THE SLOT AND THE PAINTER ARE BOTH PINNED. Removing the call and
        leaving the empty `.librarian-call-record` host behind would be a
        place the log could be painted back into without a decision."""
        src = client_source()
        refresh = js_function(src, "refreshLibrarianSettings")
        settings = js_function(src, "renderLibrarianSettings")
        self.assertGreater(
            len(refresh), 400,
            "refreshLibrarianSettings lifted short (%d chars) — an absence "
            "found in a function that was never read is not an absence"
            % (len(refresh),))
        self.assertGreater(
            len(settings), 400,
            "renderLibrarianSettings lifted short (%d chars) — same reason"
            % (len(settings),))
        self.assertNotIn(
            "renderCallRecord", refresh,
            "the Manage librarian pane still paints the activity log. Her "
            "ruling of 2026-08-26 is that it leaves the dashboard and stays "
            'reachable "Only in the room", through the pen cup on the desk')
        self.assertNotIn(
            "librarian-call-record", settings,
            "the Manage pane still emits the activity log's host element. "
            "The slot and its painter leave TOGETHER — a host left behind "
            "is somewhere the log can be painted back without a decision")

    def test_the_pane_fact_is_written_in_exactly_two_places(self):
        """⛔ A FLAG THAT OUTLIVES ITS CALL IS A FLAG A LATER PAINT READS BY
        ACCIDENT — 26.99-13's warning, still true, and the reason her
        overturn is bounded HERE rather than trusted.

        Exactly two writers: the deletion's own success sets it, and the
        surface's own entry forgets it. ⛔ No third site.

        ⚠ 26.99955-08 MOVED BOTH ENDS, AND THE ASSERTION SITE IS THE SAME
        ONE — the arc is stated rather than the pin deleted (this file's own
        convention). Her ruling of 2026-08-26 took the activity log off
        Manage, so:
          the reader  `refreshLibrarianSettings` -> `deskActivityToggle`
          the forget  `enterManage`              -> `openStation`
        `openStation` is the desk's deliberate entry, and it is the RIGHT
        end rather than a convenient one: the forget was first written into
        `renderDeskStation` and DRIVEN WRONG twice — that painter runs
        behind `zoomToView`'s callback, so the room-door path read the flag
        before the forget ran, and it also runs on a view refill, which
        would have erased a clear mid-visit.
        ⛔ THE COUNT STAYS ONE. Two forget sites would mean two lifetimes,
        and "while the panel is open" would stop meaning anything."""
        src = client_source()
        writes = RECORD_CLEARED_WRITE.findall(src)
        self.assertEqual(
            sorted(writes), ["false", "true"],
            "the surface's cleared-fact is written %d time(s) with values "
            "%r — exactly two writers are permitted: the successful delete, "
            "and the desk entry that forgets it" % (len(writes), writes))
        self.assertIn(
            "LIBRARIAN.recordCleared = true",
            js_function(src, "clearCallRecord"),
            "the successful delete no longer records the clear")
        self.assertIn(
            "LIBRARIAN.recordCleared = false",
            js_function(src, "forgetPaneRecordClear"),
            "the forget no longer forgets")
        self.assertIn(
            "forgetPaneRecordClear()", js_function(src, "openStation"),
            "the desk entry does not forget the clear, so the fact outlives "
            "the visit it is scoped to — she would clear the log, leave the "
            "desk, come back another time and still be shown the line that "
            "says she cleared it")
        self.assertEqual(
            len(FORGET_CALL.findall(src)), 1,
            "the forget is called from more than one place, so its "
            "lifetime is no longer the desk visit's")
        self.assertIn(
            "LIBRARIAN.recordCleared === true",
            js_function(src, "deskActivityToggle"),
            "the raised card no longer reads the fact, so her ruling "
            "survives one paint again — put the card away, raise it in the "
            "same sitting, and her line would be gone")

    # -- 26.99-13: her words, unmoved -------------------------------------

    def test_her_sentences_and_her_room_words_match_the_copy_record(self):
        """⛔ NOT ONE BYTE OF HER WORDS MOVES — §S-03a, §S-03b, §S-05.

        ⚠ THE PLAN SAID NINE ROWS AND THE TREE HOLDS FEWER, and the
        difference is accounted for STRUCTURALLY rather than by a number: a
        §S-05 key missing from `JOB_ROOM_WORDS` must ALSO be missing from
        `librarian_call.JOBS`. A row that left because its JOB left is the
        derivation working; a row that left while its job survived would be
        an agent dropping a sentence of hers, and that is what this half
        catches. ⛔ Neither nine nor seven is written down anywhere here.

        ⚠ WHEN THE COPY RECORD IS NOT REACHABLE the byte half cannot run,
        and `main()` prints that BY VALUE. ⛔ It is not silently skipped."""
        # the structural half runs always: the import-time membership
        # assert is CONFIRMED here rather than assumed
        self.assertEqual(set(server.JOB_ROOM_WORDS),
                         set(librarian_call.JOBS),
                         "a job has no room-word, or a room-word has no job")
        app = read_source("app.js")
        for const in RECORD_RENDER_VARS:
            value = client_constant(const)
            self.assertEqual(
                app.count(value), 1,
                const + " is not exactly one literal in app.js — a second "
                "copy is where two surfaces drift apart")

        text = copy_record_text()
        if text is None:
            PINNED["source"] = "unreachable (%s unset)" % (COPY_RECORD_ENV,)
            return
        PINNED["source"] = os.environ[COPY_RECORD_ENV].strip()
        self.assertEqual(
            client_constant(RECORD_RENDER_VARS[0]),
            fenced_block(text, "S-03a"),
            RECORD_RENDER_VARS[0] + " no longer matches S-03a byte-for-byte "
            "— a later reader has recapitalised, repunctuated or shortened "
            "the owner's sentence")
        PINNED["sentences"] += 1

        # ⭐⭐ §S-03b IS NOW AN OPENING RATHER THAN THE WHOLE SENTENCE —
        # 26.99955 UAT G-…-10, her extension of 2026-08-26. ⛔ The pin is
        # NARROWED, never dropped: the clause she wrote for the copy record
        # must still be there byte-for-byte, at the FRONT, unrecapitalised
        # and unrepunctuated. What a later reader may not do is edit it; what
        # SHE did is add to it.
        #
        # ⚠ AND THE TAIL IS NOT PINNED TO A SECOND COPY OF ITSELF. There is
        # no document in this repo holding her extension that was not written
        # by the same hand as the constant, and comparing a constant against
        # a copy of itself is the mirror trap this file records nine
        # instances of. So the tail is asserted only for the two things that
        # can be checked without one: that it EXISTS (the extension is the
        # whole ticket — a sentence that reverted to §S-03b alone would be
        # the defect she reported, silently restored), and that the shipped
        # constant is exactly ONE literal in app.js, which the loop above
        # already proves.
        clear = client_constant(RECORD_RENDER_VARS[1])
        opening = fenced_block(text, "S-03b")
        self.assertTrue(
            clear.startswith(opening),
            RECORD_RENDER_VARS[1] + " no longer OPENS with S-03b "
            "byte-for-byte — she extended her sentence, she did not "
            "authorise an edit of the part she had already written")
        self.assertGreater(
            len(clear), len(opening),
            "her extension is gone and the control is back to the sentence "
            "whose reassuring half is about what SURVIVES — which is the "
            "defect G-…-10 reported")
        PINNED["sentences"] += 1

        rows = copy_room_word_rows(text)
        for job, pair in sorted(server.JOB_ROOM_WORDS.items()):
            self.assertIn(job, rows,
                          "a room-word ships that she never wrote: " + job)
            self.assertEqual(
                pair, rows[job],
                "her room-word for " + job + " moved — ⛔ her grammar is "
                "deliberate and was not authorised for change")
            PINNED["rows"] += 1
        for job in sorted(rows):
            if job in server.JOB_ROOM_WORDS:
                continue
            self.assertNotIn(
                job, librarian_call.JOBS,
                "a sentence of hers was dropped while its job survived: "
                + job)
            PINNED["deleted"] += 1

        # ⚠ AND THE PIN IS PROVED TO HAVE TEETH, in a temporary copy: one
        # byte changed in her text must be caught. ⛔ The real record is
        # never written to.
        doctored = tempfile.mkdtemp(prefix="studyroom-copy-teeth-")
        try:
            path = Path(doctored) / "copy.md"
            head = fenced_block(text, "S-03a")
            path.write_text(text.replace(head, head.capitalize()),
                            encoding="utf-8")
            self.assertNotEqual(
                fenced_block(path.read_text(encoding="utf-8"), "S-03a"),
                client_constant(RECORD_RENDER_VARS[0]),
                "the byte pin cannot see a recapitalised sentence — it is "
                "measuring nothing")
        finally:
            shutil.rmtree(doctored, ignore_errors=True)


# ⚠ THE CASE COUNT, BY VALUE (B-3). A run that examined zero cases must
# FAIL rather than print nothing and exit 0 — this project has watched a
# suite report success on an empty loop. Raise it when a case is added, and
# never lower it to make a run pass.
# 26.99955-08: 57 -> 54, and it is LOWERED here for the one reason a lowering
# is ever honest — four cases were RETIRED WITH THEIR SUBJECT, not deleted to
# make a run pass. Her 2026-08-26 ruling took the activity log off Manage, so
# the four that lifted and ran `refreshLibrarianSettings` had no repaint left
# to drive; one absence case replaced them here (net -3), and the four facts
# they held are now driven in a REAL BROWSER over the real card in
# tests/test_pen_cup_door.cjs arm E. The map is in the comment block above
# `test_the_manage_pane_no_longer_paints_the_record`.
EXPECTED_CASES = 54


def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(SpendRecordTest)
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    print("CASES %d" % ran)
    print("FIELDS %d permitted in one record line" % len(SIX_FIELDS))
    # ⚠ THE TWO NUMBERS THE PLAN ASKS FOR OUT LOUD: how many calls were
    # driven and how many lines were found. A run that drove none prints
    # 0/0 and fails below, rather than printing a cheerful line about a
    # loop it never entered.
    print("CALLS %d driven across %d classes, LINES %d found"
          % (DRIVEN["calls"], CALL_CLASSES, DRIVEN["lines"]))
    print("SEAM SITES %d permitted in server.py (the wrapper's own)"
          % EXPECTED_SEAM_CALL_SITES)
    # ⚠⚠ 26.99-13, BY VALUE: how many times the CLIENT was actually run. A
    # run in which every "driven" case degraded to a static assertion has
    # measured neither G-3 nor G-4, and must fail rather than report green.
    print("CLIENT LIFTS %d record lines, %d renders, %d pane sequences — "
          "driven under node"
          % (CLIENT["lines"], CLIENT["renders"], CLIENT["panes"]))
    print("ROOM WORDS %d rows in the live table (derived from "
          "librarian_call.JOBS, never counted here)"
          % len(server.JOB_ROOM_WORDS))
    print("COPY PIN %s: %d sentences, %d room-word rows, %d rows deleted "
          "with their job" % (PINNED["source"] or "not attempted",
                              PINNED["sentences"], PINNED["rows"],
                              PINNED["deleted"]))
    # ⚠⚠ 26.99-17, BY VALUE: how many of her REFUSAL sentences were compared
    # against her own record. A run that compared zero of them has left D-14
    # unpinned on the newest front-facing words in the room.
    print("REFUSAL PIN %s: %d of her sentences read from her record"
          % (PINNED_REFUSALS["source"] or "not attempted",
             PINNED_REFUSALS["sentences"]))
    # ⚠⚠ 26.99955-08: THE PANE LIFT LEFT THIS GATE, AND ITS SUBJECT DID NOT.
    # `CLIENT["panes"]` counted runs of the Manage pane's repaint, which was
    # how her WR-01 ruling was driven. That repaint no longer paints the
    # activity log (her 2026-08-26 ruling: "Only in the room"), so requiring
    # it here would be a PERMANENTLY UNMEETABLE GATE — the thing this file
    # warns about two pins up. ⛔ The requirement is not dropped, it MOVED:
    # her ruling is now driven end-to-end in a real Chrome by
    # tests/test_pen_cup_door.cjs arm E, which raises the actual card by
    # tapping the actual pen cup. The two lifts that still have a subject
    # here — record lines and record renders — are still required, so this
    # gate keeps its teeth for G-3 and G-4.
    lifted = (CLIENT["lines"] > 0 and CLIENT["renders"] > 0)
    if not lifted:
        print("CLIENT LIFT MISSING: the record renderers were never run, so "
              "G-3 and G-4 rest on source scanning alone (her WR-01 ruling "
              "moved to tests/test_pen_cup_door.cjs arm E with the surface "
              "it is about — run that suite too, it is not optional)")
    if ran != EXPECTED_CASES:
        print("CASE COUNT MISMATCH: ran %d, file says %d"
              % (ran, EXPECTED_CASES))
    drove = (DRIVEN["calls"] == CALL_CLASSES
             and DRIVEN["lines"] == CALL_CLASSES)
    if not drove:
        print("CALL/LINE MISMATCH: drove %d, found %d, expected %d of each"
              % (DRIVEN["calls"], DRIVEN["lines"], CALL_CLASSES))
    if (not result.wasSuccessful() or ran != EXPECTED_CASES
            or not drove or not lifted):
        return 1
    print("test_spend_record OK (four classes of call, one line each, one "
          "route back, one deletion, six fields, no money, nothing of hers)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
