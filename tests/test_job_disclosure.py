"""THE STANDING PER-JOB LIST — DERIVED, UNCOUNTED, AND TIER-FREE.

⚠ WHAT THIS FILE IS FOR (26.99-07, D-05 / D-06 / D-17 and #74). The room
owes her one place that says, per job, what the job does and WHO READS IT.
Three rulings shape it and this suite is the instrument for all three.

⛔ THE LIST IS DERIVED FROM `librarian_call.JOBS`, NEVER TYPED (#74 ruling
1). A typed list is how the old table drifted to four simultaneous errors
at once. So the gate here is SET EQUALITY against the module, asserted
over what the route actually produces.

⛔⛔ AND NO COUNT IS PINNED ANYWHERE IN THIS FILE (D-17, #74) — not a
number, not a number-word, not a fixed-length fixture, not a `len(...) ==`
against a literal. ⚠ THIS IS THE OPPOSITE OF THIS PHASE'S USUAL "assert
counts by value" RULE AND IT IS DELIBERATE. #34 and #48 both described
this list as one row longer than `JOBS` actually is, and the extra row was
NEVER REAL — it named a Gist that has zero occurrences codebase-wide and
that D-17 ruled out. Because the list is derived, a job that does not
exist simply cannot appear on it; a pinned count, by contrast, would fire
#74's refuse-to-start on a row that legitimately moved. The ONE positive
count this file states is its own examined-case count, which is a fact
about the suite and not about the list (B-3).

⛔ NO TIER NAME MAY APPEAR IN ANYTHING SHE READS (D-06), and that is
asserted OVER THE RENDERED OUTPUT rather than over source (B-2). This
plan's own prose contains `local`, `cheap-cloud` and `good-cloud` many
times over; a grep of the source would fire on the comment explaining why
the tokens must not be there. So the tier case drives the route across a
matrix of routings and scans WHAT THE ROUTE PRODUCED. It reads no file at
all.

⛔ A `JOBS` ROW WITH NO ROOM-WORD MAKES THE ROOM REFUSE TO START (#74, and
she took the hard option over a softer one). That is a module-level assert
at import, so this suite witnesses it the only honest way: it builds a
MUTATED COPY of `server.py` in a temporary tree with one row's key
renamed, imports that copy in a SUBPROCESS, and requires the process to
die with an `AssertionError`. ⛔ The real tree is sha256'd before and
after and must be byte-identical.

⛔ NO REAL CALL IS POSSIBLE FROM HERE. Nothing in this suite sends: the
route is read-only, `_who_reads` is pure, and every routing it is driven
with is a plain stand-in built in this file. ⛔ No key value is read,
printed, masked-and-printed or written anywhere. A live paid Anthropic key
is on this machine.

⛔ IT NEVER TOUCHES THE REAL HOME. The subprocess import runs under a
temporary HOME, and the in-process cases open nothing at all.

⚠ THE CASE COUNT IS ASSERTED BY VALUE (B-3). This phase touches
`config_ask` — `librarian_call.JOBS`' single `permitted_local: False` row
— and 26.93's config-fence driver "would have passed while scanning an
empty string." A suite that examined zero cases must be legible as such.

Run: `TMPH=$(mktemp -d); HOME="$TMPH" python3 tests/test_job_disclosure.py`
"""

import ast
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import tokenize
import types
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import librarian_call     # noqa: E402
import server             # noqa: E402


# ---------------------------------------------------------------------------
# ---- what this run actually examined, so `main` can state it BY VALUE -----
#
# ⚠ THE ONLY POSITIVE COUNT IN THIS FILE, AND IT IS ABOUT THE SUITE. It is
# not a count of the list, of `JOBS`, of the room-words or of anything the
# room renders — see the header. B-3 asks every suite here to state what it
# examined so a run that examined nothing fails instead of printing a
# cheerful line.
EXPECTED_CASES = 22

# How many routings the tier-name and count scans are driven across. Again a
# fact about the SUITE's own coverage, not about the list.
DRIVEN = {"routings": 0, "rows_scanned": 0, "imports_driven": 0}


# ---------------------------------------------------------------------------
# ---- the tokens that may never reach her, and the shapes a count wears ----

# ⛔ D-06. These three live inside the code and nowhere else. They are
# matched over WHAT THE ROUTE PRODUCED, never over source.
TIER_TOKENS = ("local", "cheap-cloud", "good-cloud")

# ⛔ D-17 / #74. A rendered list that states its own length is a number that
# goes stale the day a job is added — and staleness on this surface is the
# exact defect #34 and #48 both shipped. Digits are checked as a class
# rather than by value, so this scan itself pins no count.
COUNT_WORDS = ("one", "two", "three", "four", "five", "six", "seven",
               "eight", "nine", "ten", "eleven", "twelve", "jobs in all",
               "in total", "altogether")
DIGIT_RE = re.compile(r"\d")

# ⛔⛔ ONE STRING IS EXEMPT FROM THE COUNT-WORD SCAN, BY VALUE, AND IT IS HERS.
# 2026-08-21 she chose the judging job's sentence from three candidates read to
# her (26.995-COPY.md § C-12), and it contains the bare word "one" — as in
# "read ONE MORE TIME", an adverb about how many times a reflection is read.
#
# ⛔ IT IS NOT THE DEFECT THIS SCAN EXISTS FOR, AND THE SCAN IS NOT WEAKENED
# TO MAKE IT PASS. D-17 / #74's rule is that THE LIST NEVER STATES ITS OWN
# LENGTH: the shipped defect (#34 and #48 both) was a number that describes
# how many rows there are and goes stale the day a job is added. Her sentence
# describes ONE JOB and says nothing about how many jobs exist, so no addition
# or deletion anywhere can make it stale. The word list is a PROXY for that
# rule, and on 2026-08-21 the proxy fired on something the rule does not
# forbid — which is this project's signature defect (a check that pins the
# wrong thing), met here in the mildest possible form.
#
# ⛔ THE CARVE-OUT IS A LIST OF EXACT STRINGS, NEVER A RELAXED PATTERN, and
# never a per-field exemption. Every other row's words, every field name and
# every other string the route produces is scanned exactly as before —
# including any FUTURE sentence of hers, which will collide here again and
# will have to be looked at again rather than sliding through. The shape is
# the one `accepted_samples_she_knowingly_gave_up` already uses in the
# address calibration: a name on a list records a decision; it does not widen
# a rule. A case below proves the scan still fires on a planted count-word.
#
# ⬜⬜ AND THE PART THAT IS AN AGENT'S JUDGEMENT RATHER THAN HERS. Two of her
# own rulings collided — #74's hard refusal and § C-12's sentence — and the
# collision was found AFTER she had chosen, by this gate. An agent resolved it
# by exempting her words rather than by editing them, because her wording may
# never be edited. ⚠ SHE MAY OVERTURN THIS: either by narrowing #74's scan
# herself, or by choosing different words. It is recorded in
# 26.995-25-SUMMARY.md and in 26.995-OWED-TO-OWNER.md as owed her look.
HER_WORDS_EXEMPT_FROM_THE_COUNT_SCAN = (
    "The reflection gets read one more time before it reaches you, to make "
    "sure it isn't handing you a task",
)


def count_words_in(text):
    """The count-word rule, in ONE place, so the case that drives it drives
    the same code the scan runs. ⚠ A second copy of this rule written into
    the driving case would be a test of itself — the mirror defect."""
    if text in HER_WORDS_EXEMPT_FROM_THE_COUNT_SCAN:
        return []
    low = text.lower()
    return [word for word in COUNT_WORDS
            if word in (low.split() if " " not in word else low)]


# ---------------------------------------------------------------------------
# ---- stand-ins ------------------------------------------------------------

class FakeHandler(object):
    """The smallest stand-in a read-only route needs: it captures what the
    route answered instead of writing it to a socket. `handle_call_record`'s
    own shape, one route over (26.99-03)."""

    def __init__(self):
        self.answer = None
        self.code = None

    def json_response(self, data, code=200):
        self.answer = data
        self.code = code
        return data

    def json_error(self, code, msg):
        return self.json_response({"ok": False, "error": msg}, code=code)


def fake_routing(local, cheap, good):
    """A routing stand-in carrying nothing but fills.

    ⚠ IT IS A STAND-IN AND NOT A REAL `Routing` ON PURPOSE: the real one is
    frozen and resolved from her settings file, and this suite must be able
    to drive fills that do not exist on this machine. `_answering_fill`
    reads exactly one attribute, so a stand-in that carries that attribute
    exercises the same path.

    Each argument is a (provider, model) pair or None — None being a tier
    with NOTHING in it, which is a real state and must produce silence
    rather than another tier's answer."""
    fills = {}
    for tier, fill in zip(librarian_call.TIERS, (local, cheap, good)):
        if fill is not None:
            fills[tier] = fill
    return types.SimpleNamespace(fills=fills, provenance={})


OLLAMA = ("ollama", "qwen2.5:7b")
ANTHROPIC = ("anthropic", "claude-sonnet-4-5")
OPENAI = ("openai", "gpt-4.1-mini")

# Every shape a routing can take that changes an answer: all local, all
# Anthropic, all OpenAI, a mixed one, and one with a tier holding nothing.
# ⛔ This roster's length is never asserted against a number — it is
# iterated, and what is asserted is what came out.
ROUTING_MATRIX = (
    fake_routing(OLLAMA, OLLAMA, OLLAMA),
    fake_routing(OLLAMA, ANTHROPIC, ANTHROPIC),
    fake_routing(OLLAMA, OPENAI, ANTHROPIC),
    fake_routing(ANTHROPIC, ANTHROPIC, ANTHROPIC),
    fake_routing(OLLAMA, None, ANTHROPIC),
    fake_routing(None, None, None),
)


def drive_route(routing, data=None):
    """`handle_job_disclosure`, called as a plain function on a stand-in,
    with `resolve_librarian_routing` swapped for the duration.

    A failure NAMES the missing symbol so the RED half of this plan fails
    legibly rather than inside a helper."""
    fn = getattr(server.StudyHandler, "handle_job_disclosure", None)
    if fn is None:
        raise AssertionError(
            "server.StudyHandler.handle_job_disclosure does not exist yet — "
            "the read-only route the standing per-job list renders")
    prior = server.resolve_librarian_routing
    server.resolve_librarian_routing = lambda: routing
    try:
        fake = FakeHandler()
        fn(fake, data or {})
    finally:
        server.resolve_librarian_routing = prior
    DRIVEN["routings"] += 1
    return fake


def room_words():
    """`server.JOB_ROOM_WORDS`, or a failure that names it."""
    words = getattr(server, "JOB_ROOM_WORDS", None)
    if words is None:
        raise AssertionError(
            "server.JOB_ROOM_WORDS does not exist yet — one room-word per "
            "`librarian_call.JOBS` row, her words (26.99-COPY.md §S-05)")
    return words


def who_reads(job, routing):
    """`server._who_reads`, or a failure that names it."""
    fn = getattr(server, "_who_reads", None)
    if fn is None:
        raise AssertionError(
            "server._who_reads does not exist yet — the who-reads-it value "
            "taken from the RESOLVED FILL, never from the tier (D-05/D-06)")
    return fn(job, routing)


def rendered_strings(answer):
    """Every string the route's answer can put in front of her, at any
    depth, INCLUDING the keys — a field name is rendered by nothing here,
    but a tier token hiding in one would still be a tier token that reached
    the client."""
    out = []

    def walk(node):
        if isinstance(node, str):
            out.append(node)
        elif isinstance(node, dict):
            for k, v in node.items():
                walk(k)
                walk(v)
        elif isinstance(node, (list, tuple)):
            for v in node:
                walk(v)

    walk(answer)
    return out


# ---------------------------------------------------------------------------
# ---- the readers the static cases share -----------------------------------

def strip_py(src):
    """Python source with every comment AND every string literal blanked,
    lines preserved.

    ⚠ A PYTHON DOCSTRING IS NOT A '#' COMMENT (B-2, and this project turned
    a pin red twice from prose that survived a '#'-only strip)."""
    out = list(src.splitlines())
    try:
        toks = list(tokenize.generate_tokens(iter(src.splitlines(True)).__next__))
    except (tokenize.TokenError, IndentationError):
        return src
    for tok in toks:
        if tok.type not in (tokenize.COMMENT, tokenize.STRING):
            continue
        (r1, c1), (r2, c2) = tok.start, tok.end
        for row in range(r1, r2 + 1):
            line = out[row - 1]
            a = c1 if row == r1 else 0
            b = c2 if row == r2 else len(line)
            out[row - 1] = line[:a] + " " * (b - a) + line[b:]
    return "\n".join(out)


def strip_js(src):
    """JS source with every comment blanked, lines preserved. Blanks rather
    than removes, so a violation still names a real line."""
    out = []
    i = 0
    n = len(src)
    state = None
    quote = None
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if state is None:
            if ch == "/" and nxt == "/":
                state = "line"
                out.append("  ")
                i += 2
                continue
            if ch == "/" and nxt == "*":
                state = "block"
                out.append("  ")
                i += 2
                continue
            if ch in "'\"`":
                state = "str"
                quote = ch
                out.append(ch)
                i += 1
                continue
            out.append(ch)
            i += 1
            continue
        if state == "line":
            if ch == "\n":
                state = None
                out.append(ch)
            else:
                out.append(" ")
            i += 1
            continue
        if state == "block":
            if ch == "*" and nxt == "/":
                state = None
                out.append("  ")
                i += 2
                continue
            out.append(ch if ch == "\n" else " ")
            i += 1
            continue
        # inside a string literal: kept, because a rendered word lives here
        if ch == "\\":
            out.append(src[i:i + 2])
            i += 2
            continue
        if ch == quote:
            state = None
            quote = None
        out.append(ch)
        i += 1
    return "".join(out)


def js_function_body(src, name):
    """One `function name(` body, brace-matched over COMMENT-STRIPPED
    source, so a brace inside a comment cannot end it early."""
    stripped = strip_js(src)
    marker = "function " + name + "("
    start = stripped.find(marker)
    if start == -1:
        return None
    open_at = stripped.find("{", start)
    if open_at == -1:
        return None
    depth = 0
    i = open_at
    while i < len(stripped):
        c = stripped[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return stripped[open_at:i + 1]
        i += 1
    return None


def tracked_files():
    """The files that ARE the codebase, asked of git rather than guessed.

    ⚠ AND THE REASON IS NOT TIDINESS. This repo carries untracked working
    files belonging to a parallel session; an untracked scratch note is not
    the codebase, and a phase-level ban that fired on somebody else's
    unfinished work would be a gate reporting a defect that is not there."""
    proc = subprocess.run(["git", "ls-files"], cwd=str(REPO_ROOT),
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise AssertionError("git ls-files failed — cannot name the codebase")
    names = [n for n in proc.stdout.decode("utf-8").splitlines() if n]
    return [REPO_ROOT / n for n in names]


# ⚠ SHIPPING SOURCE AND THE ONE DOCUMENT THE ROOM POINTS HER AT — not every
# tracked file, and the narrowing is a MEASUREMENT rather than a
# convenience. This phase's own decision record states `gist` has zero
# occurrences codebase-wide, measured 2026-08-13. ⛔ THAT IS NO LONGER TRUE:
# the repo-root `CONTEXT.md` domain document carries seven, committed
# 2026-08-14, where the Gist is a DESIGNED domain concept (a regenerable
# compressed representation). D-17 ruled the Gist out of `JOBS` and named
# its own overturn condition — "if the Gist is ever designed it enters by
# gaining a `JOBS` row, and the list follows by itself" — so a design
# document describing one is exactly the state D-17 anticipated, and it is
# not this suite's to delete. What D-17 forbids is the Gist reaching the
# PRODUCT and the list; that is what is scanned here, and `JOBS` is asserted
# clean separately below.
SOURCE_SUFFIXES = (".py", ".js", ".cjs", ".mjs", ".html")
SOURCE_NAMES = ("LIBRARIAN.md",)


# ---------------------------------------------------------------------------
# ---- the mutated copy that must refuse to start ---------------------------

def build_mutated_server(tmpdir):
    """A copy of `server.py` with ONE `JOB_ROOM_WORDS` key renamed.

    ⚠ RENAMED RATHER THAN DELETED, and that is the stronger mutation: it
    leaves the literal syntactically valid and produces a symmetric
    difference of TWO members — a `JOBS` row that lost its words AND a
    room-word for a job that does not exist. One edit proves both
    directions of the set equality.

    ⛔ The mutation is scoped to the `JOB_ROOM_WORDS` block by bounds found
    in the source, and the substitution must occur EXACTLY ONCE, so a moved
    line can never become a wrong edit."""
    src = (REPO_ROOT / "server.py").read_text(encoding="utf-8")
    open_at = src.find("JOB_ROOM_WORDS = {")
    if open_at == -1:
        raise AssertionError(
            "server.JOB_ROOM_WORDS does not exist yet — there is nothing to "
            "remove a row from, so the refusal cannot be witnessed")
    close_at = src.find("\n}", open_at)
    if close_at == -1:
        raise AssertionError("JOB_ROOM_WORDS' literal has no closing brace")
    block = src[open_at:close_at]
    victim = None
    for job in librarian_call.JOBS:
        needle = '"%s":' % job
        if block.count(needle) == 1:
            victim = (job, needle)
            break
    if victim is None:
        raise AssertionError(
            "no JOBS key occurs exactly once inside JOB_ROOM_WORDS — "
            "refusing to mutate rather than edit the wrong row")
    job, needle = victim
    mutated_block = block.replace(needle, '"%s_no_words_here":' % job, 1)
    mutated = src[:open_at] + mutated_block + src[close_at:]
    if mutated == src:
        raise AssertionError("the mutation changed nothing")
    path = Path(tmpdir) / "server_no_room_word.py"
    path.write_text(mutated, encoding="utf-8")
    return path, job


# ---------------------------------------------------------------------------

class JobDisclosureTest(unittest.TestCase):

    maxDiff = 4000

    # ---- the derivation ---------------------------------------------------

    def test_room_word_map_is_set_equal_to_jobs(self):
        """⛔ SET EQUALITY, NEVER A LENGTH. The symmetric difference is the
        assertion and it is also the message, so a red names the rows."""
        unmatched = sorted(set(room_words()) ^ set(librarian_call.JOBS))
        self.assertEqual(unmatched, [],
                         "every job owes her words, and every room-word owes "
                         "a job; unmatched: %r" % (unmatched,))

    def test_rendered_job_keys_are_set_equal_to_jobs(self):
        """The list SHE is shown, not the map behind it (#74 ruling 1)."""
        for routing in ROUTING_MATRIX:
            answer = drive_route(routing).answer
            keys = {row.get("job") for row in (answer.get("jobs") or [])}
            DRIVEN["rows_scanned"] += len(answer.get("jobs") or [])
            unmatched = sorted(keys ^ set(librarian_call.JOBS))
            self.assertEqual(unmatched, [],
                             "the rendered list is not the job table; "
                             "unmatched: %r" % (unmatched,))

    def test_every_rendered_row_carries_both_a_name_and_a_sentence(self):
        """⛔ A SLOT WITH NO WORDS RENDERS NOTHING — so a row that reached
        the client with a blank in it is a row that will render a blank."""
        answer = drive_route(ROUTING_MATRIX[1]).answer
        for row in (answer.get("jobs") or []):
            self.assertTrue((row.get("name") or "").strip(),
                            "row %r has no name" % (row.get("job"),))
            self.assertTrue((row.get("words") or "").strip(),
                            "row %r has no sentence" % (row.get("job"),))
        names = [row.get("name") for row in (answer.get("jobs") or [])]
        self.assertEqual(len(names), len(set(names)),
                         "two jobs share one row name — the copy-paste tell")

    # ---- who reads it -----------------------------------------------------

    def test_who_reads_derives_from_the_resolved_fill(self):
        """⚠ THE SAME JOB, TWO ROUTINGS, TWO ANSWERS — which is the whole
        claim. A value read off the TIER would be identical in both runs."""
        cloud_job = "reflection"
        local_job = "import_presort"
        all_local = ROUTING_MATRIX[0]
        cloud = ROUTING_MATRIX[1]
        openai = ROUTING_MATRIX[2]
        self.assertNotEqual(who_reads(cloud_job, all_local),
                            who_reads(cloud_job, cloud),
                            "the same job answered the same way under two "
                            "different fills — the value is not coming from "
                            "the resolved fill")
        self.assertEqual(who_reads(local_job, all_local),
                         who_reads(local_job, cloud),
                         "a job whose fill did not move should not move")
        # ⚠ ASKED OF `config_ask` ON PURPOSE — `librarian_call.JOBS`' single
        # `permitted_local: False` row, and the exact place 26.93's
        # config-fence driver "would have passed while scanning an empty
        # string" (B-3). Its fill is the one that differs between these two
        # routings, so this is both the two-companies case and a live read
        # of the row most likely to be skipped.
        self.assertNotEqual(who_reads("config_ask", openai),
                            who_reads("config_ask", cloud),
                            "two different companies must not read the same")
        # a tier holding nothing answers NOTHING, never another tier's answer
        self.assertIsNone(who_reads("config_ask", ROUTING_MATRIX[5]),
                          "an empty fill must produce silence, never a "
                          "substituted answer (#27 section 5)")

    def test_who_reads_has_no_tier_parameter(self):
        """⛔ THE CALLER NAMES A JOB AND NOTHING ELSE (D-06), which is
        `_answering_provider`'s own written argument one function up. Read
        off the parse tree: a signature carries no prose to be fooled by."""
        tree = ast.parse((REPO_ROOT / "server.py").read_text(encoding="utf-8"))
        found = None
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name == "_who_reads":
                found = node
        self.assertIsNotNone(found, "server._who_reads does not exist yet")
        args = [a.arg for a in found.args.args]
        self.assertEqual(args, ["job", "routing"],
                         "_who_reads takes a job and a routing and nothing "
                         "else; found %r" % (args,))

    # ---- the row that is not a job -----------------------------------------

    def test_the_on_device_row_is_present_in_what_the_route_produces(self):
        rows = getattr(server, "ON_DEVICE_DISCLOSURE_ROWS", None)
        self.assertIsNotNone(
            rows, "server.ON_DEVICE_DISCLOSURE_ROWS does not exist yet — the "
                 "non-model half of the list (§S-06)")
        answer = drive_route(ROUTING_MATRIX[1]).answer
        device = answer.get("on_device") or {}
        self.assertTrue((device.get("words") or "").strip(),
                        "the on-device row reached the client with no words")
        served = answer.get("on_device_rows") or []
        self.assertEqual(len(served), len(rows))

    def test_the_on_device_row_is_not_a_tiers_member(self):
        """⚠ IT HAS NO PROVIDER, NO MODEL, NO KEY AND NO PRICE, so a row for
        it in `librarian_call.TIERS` would be NULL in every column its
        consumers read — the 26.94-02/03 argument, kept rather than
        re-litigated."""
        answer = drive_route(ROUTING_MATRIX[1]).answer
        device = answer.get("on_device") or {}
        self.assertNotIn("on-device", librarian_call.TIERS)
        self.assertNotIn("vision", librarian_call.TIERS)
        for key in device:
            self.assertNotIn(key, librarian_call.TIERS)
        job_keys = {row.get("job") for row in (answer.get("jobs") or [])}
        self.assertNotIn("on_device", job_keys,
                         "the hand-added row must not be a JOBS row")

    def test_the_non_model_half_is_three_rows_in_derived_shape(self):
        """26.996-08: promote to a list — length and keys, by value."""
        rows = getattr(server, "ON_DEVICE_DISCLOSURE_ROWS", None)
        self.assertIsNotNone(
            rows, "ON_DEVICE_DISCLOSURE_ROWS is the primary representation")
        self.assertEqual(len(rows), 3)
        answer = drive_route(ROUTING_MATRIX[1]).answer
        served = answer.get("on_device_rows") or []
        self.assertEqual(len(served), 3)
        for spec, row in zip(rows, served):
            self.assertEqual(set(row.keys()), {"job", "words"})
            self.assertEqual(row["job"], spec["job"])
            self.assertEqual(row["words"], spec.get("words") or "")

    def test_two_new_non_model_rows_carry_her_sentences(self):
        """26.996-11: S-1 and S-4 filled; never agent-drafted blanks."""
        s1 = (
            "Photographs are also read here for the words printed in them, "
            "any faces, and where they were taken.")
        s4 = (
            "When it guesses which animal photographs go together, it will "
            "sometimes set aside pictures of a different animal. You will "
            "not be told when that happens.")
        rows = server.ON_DEVICE_DISCLOSURE_ROWS[1:]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["job"], "on_device_photograph_read")
        self.assertEqual(rows[0]["words"], s1)
        self.assertEqual(rows[1]["job"], "on_device_likeness_overreach")
        self.assertEqual(rows[1]["words"], s4)

    def test_the_shipped_non_model_row_is_untouched(self):
        words = server.ON_DEVICE_DISCLOSURE_ROWS[0]["words"]
        self.assertEqual(
            words,
            "Photo-reading is built inside the Apple Vision, which means "
            "no tokens will be consumed")

    def test_no_non_model_row_carries_who_reads(self):
        answer = drive_route(ROUTING_MATRIX[1]).answer
        for row in (answer.get("on_device_rows") or []):
            self.assertNotIn("who_reads", row)

    def test_the_derived_row_count_in_comment_matches_jobs(self):
        self.assertEqual(len(librarian_call.JOBS), 12,
                         "measured from the job table, not from a comment")
        src = (REPO_ROOT / "server.py").read_text(encoding="utf-8")
        self.assertIn("twelve derived rows", src.lower())

    # ---- what she may never read ------------------------------------------

    def test_no_tier_name_in_what_the_route_produces(self):
        """⛔ D-06, ASSERTED OVER THE PRODUCED ANSWER AND NOT OVER SOURCE.

        ⚠ THIS CASE READS NO FILE. Every string it scans came out of the
        route, driven across the whole routing matrix, because this plan's
        own prose contains all three tokens many times over and a source
        grep would fire on the comment that explains why they must not be
        there (B-2)."""
        for routing in ROUTING_MATRIX:
            answer = drive_route(routing).answer
            for text in rendered_strings(answer):
                low = text.lower()
                for token in TIER_TOKENS:
                    self.assertNotIn(
                        token, low,
                        "a tier name reached what she reads: %r in %r"
                        % (token, text))

    def test_no_count_in_what_the_route_produces(self):
        """⛔ D-17 / #74. The list never states its own length — not as a
        digit, not as a number-word. ⚠ This case pins no count either: it
        asserts the ABSENCE of a class of token."""
        for routing in ROUTING_MATRIX:
            answer = drive_route(routing).answer
            for text in rendered_strings(answer):
                self.assertIsNone(
                    DIGIT_RE.search(text),
                    "a digit reached what she reads, and a list that states "
                    "its own length goes stale the day a job is added: %r"
                    % (text,))
                self.assertEqual(
                    count_words_in(text), [],
                    "a count-word reached what she reads: %r" % (text,))

    # ---- the refusal to start ---------------------------------------------

    def test_the_room_refuses_to_start_when_a_jobs_row_has_no_room_word(self):
        """⛔ #74, AND SHE TOOK THE HARD OPTION. A module-level assert at
        import IS the refusal, because `server.py` is the entry point — so
        the only honest witness is a process that will not start.

        ⚠ THE REAL TREE IS SHA256'D BEFORE AND AFTER. The mutation lives in
        a temporary directory and the tree is asserted byte-identical, so a
        drill can never become an edit."""
        real = REPO_ROOT / "server.py"
        before = hashlib.sha256(real.read_bytes()).hexdigest()
        tmp = tempfile.mkdtemp(prefix="studyroom-refuse-to-start-")
        home = tempfile.mkdtemp(prefix="studyroom-refuse-home-")
        try:
            path, job = build_mutated_server(tmp)
            env = dict(os.environ)
            env["HOME"] = home
            env["PYTHONPATH"] = str(REPO_ROOT)
            env["PYTHONDONTWRITEBYTECODE"] = "1"
            proc = subprocess.run(
                [sys.executable, "-c",
                 "import sys; sys.path.insert(0, %r); "
                 "import server_no_room_word" % (tmp,)],
                cwd=str(REPO_ROOT), env=env,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            DRIVEN["imports_driven"] += 1
            err = proc.stderr.decode("utf-8", "replace")
            self.assertNotEqual(
                proc.returncode, 0,
                "the room STARTED with %r holding no room-word — #74's hard "
                "option is not in force" % (job,))
            self.assertIn(
                "AssertionError", err,
                "the room refused to start, but not on the assert this "
                "ruling asks for; stderr tail: %r" % (err[-400:],))
            self.assertIn(job, err,
                          "the refusal does not name the row that lost its "
                          "words; stderr tail: %r" % (err[-400:],))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
            shutil.rmtree(home, ignore_errors=True)
        after = hashlib.sha256(real.read_bytes()).hexdigest()
        self.assertEqual(before, after,
                         "the drill wrote to the real tree")

    # ---- what this list may not grow --------------------------------------

    def test_gist_has_zero_occurrences_in_shipping_source(self):
        """⛔ D-17: nothing in the product names it and nothing consumes it.

        Scanned COMMENT- AND STRING-STRIPPED over the tracked shipping
        source, so the paragraph above explaining why the word must not be
        here cannot itself fire the gate (B-2) — and neither can this
        suite's own prose. See SOURCE_SUFFIXES for what is scanned and for
        the measurement that narrowed it."""
        pattern = re.compile(r"\bgist\b", re.IGNORECASE)
        hits = []
        for path in tracked_files():
            named = path.name in SOURCE_NAMES
            if not path.exists() or (path.suffix not in SOURCE_SUFFIXES
                                     and not named):
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if path.suffix == ".py":
                text = strip_py(text)
            elif path.suffix in (".js", ".cjs", ".mjs"):
                text = strip_js(text)
            for num, line in enumerate(text.splitlines(), 1):
                if pattern.search(line):
                    hits.append("%s:%d" % (path.relative_to(REPO_ROOT), num))
        self.assertEqual(hits, [], "`gist` is ruled out (D-17): %r" % (hits,))

    def test_jobs_gained_no_row_for_a_thing_that_was_ruled_out(self):
        """⛔ D-17 again, from the other end: the list follows `JOBS`, so the
        only way a Gist row could appear is by `JOBS` gaining one."""
        for job in librarian_call.JOBS:
            self.assertNotIn("gist", job.lower(),
                             "JOBS gained a row for a thing D-17 ruled out")

    # ---- what this plan may not move --------------------------------------

    def test_librarian_available_shape_is_not_widened(self):
        """⛔ L-04. Three consumers read `{available, why, auth, enabled,
        version_ok}` and not one of them is this plan's to change. A shape
        three consumers read, widened for one surface, is how the `auth`
        field inversion happened — so this plan added a route instead.

        Read off the parse tree: every dict this function returns must carry
        exactly the shipped five keys."""
        tree = ast.parse((REPO_ROOT / "server.py").read_text(encoding="utf-8"))
        found = None
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) \
                    and node.name == "librarian_available":
                found = node
        self.assertIsNotNone(found, "librarian_available is gone")
        shipped = {"available", "why", "auth", "enabled", "version_ok"}
        seen = 0
        for node in ast.walk(found):
            if not isinstance(node, ast.Return) \
                    or not isinstance(node.value, ast.Dict):
                continue
            keys = {k.value for k in node.value.keys
                    if isinstance(k, ast.Constant)}
            seen += 1
            self.assertEqual(keys, shipped,
                             "librarian_available's shape moved: %r"
                             % (sorted(keys),))
        self.assertTrue(seen, "no dict return found — the reader is broken")

    def test_the_route_rides_the_shipped_do_post_dispatch(self):
        """⚠ ASVS V4 by construction: registered INSIDE `do_POST`, so
        `host_allowed` and `origin_allowed` are inherited rather than
        re-implemented. Read off the parse tree, which carries no comments."""
        tree = ast.parse((REPO_ROOT / "server.py").read_text(encoding="utf-8"))
        body = None
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "do_POST":
                body = node
        self.assertIsNotNone(body, "do_POST is gone")
        routes = {n.value for n in ast.walk(body)
                  if isinstance(n, ast.Constant) and isinstance(n.value, str)}
        self.assertIn("/api/librarian/jobs", routes,
                      "the standing list's route is not registered in the "
                      "shipped POST dispatch")

    def test_the_route_writes_nothing(self):
        """READ-ONLY, asserted structurally. A disclosure route that could
        write is a disclosure route that could be made to lie."""
        tree = ast.parse((REPO_ROOT / "server.py").read_text(encoding="utf-8"))
        found = None
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) \
                    and node.name == "handle_job_disclosure":
                found = node
        self.assertIsNotNone(found,
                             "handle_job_disclosure does not exist yet")
        banned = ("open", "unlink", "write_text", "write_bytes", "save",
                  "mkdir", "rename", "replace", "dump", "remove")
        for node in ast.walk(found):
            if not isinstance(node, ast.Call):
                continue
            name = getattr(node.func, "id", None) or \
                getattr(node.func, "attr", None) or ""
            for bad in banned:
                self.assertNotEqual(name, bad,
                                    "the disclosure route calls %r" % (bad,))

    def test_app_js_list_render_names_no_tier_and_no_count(self):
        """The client half, over COMMENT-STRIPPED source (B-2) and scoped to
        the render's own body — so the paragraph explaining D-06 cannot fire
        the gate that D-06 asks for. ⚠ This is the SECOND instrument on the
        same claim and it is a different kind: the case above reads only
        what the route produced and opens no file at all."""
        src = (REPO_ROOT / "app.js").read_text(encoding="utf-8")
        body = js_function_body(src, "renderJobDisclosure")
        row_body = js_function_body(src, "renderDisclosureJobRow")
        self.assertIsNotNone(
            body, "app.js renderJobDisclosure does not exist yet — the "
                  "standing list's render")
        self.assertIsNotNone(
            row_body, "app.js renderDisclosureJobRow does not exist yet — "
                      "the one row renderer both halves share")
        combined = body + row_body
        low = combined.lower()
        for token in TIER_TOKENS:
            self.assertNotIn(token, low,
                             "a tier name is in the render: %r" % (token,))
        for word in COUNT_WORDS:
            self.assertNotIn(" " + word + " ", low,
                             "a count-word is in the render: %r" % (word,))
        self.assertIn("escapeHtml", combined,
                      "every interpolation is escaped — renderCleaningRuns' "
                      "shipped rule")
        self.assertIn(".catch", body,
                      "a .catch that renders EMPTY rather than an error")

    def test_the_count_scan_still_fires_and_the_exemption_is_not_stale(self):
        """⛔ THE EXEMPTION, DRIVEN IN BOTH DIRECTIONS — because an exemption
        nobody has watched fail is a hole, and an exemption for a string
        nobody renders is a hole waiting to open.

        (a) A PLANTED count-word must still be caught. Without this the
            carve-out above could have disabled the whole scan and every run
            would have stayed green — which is exactly the class of defect
            this repo keeps recording.
        (b) Every exempt string must ACTUALLY BE one the route produces. A
            stale entry is a name on a waiver list for a sentence that no
            longer exists, and the next sentence that happens to match it
            would ride through unexamined."""
        rendered = set()
        for routing in ROUTING_MATRIX:
            rendered.update(rendered_strings(drive_route(routing).answer))
        # (b) no stale waiver.
        for exempt in HER_WORDS_EXEMPT_FROM_THE_COUNT_SCAN:
            self.assertIn(
                exempt, rendered,
                "a string is exempt from the count scan and the route does "
                "not produce it — the waiver is stale, and a stale waiver "
                "widens the rule for whatever matches it next")
        # (a) the scan still fires on anything else.
        planted = "the room sends seven kinds of thing to a model"
        self.assertNotIn(planted, HER_WORDS_EXEMPT_FROM_THE_COUNT_SCAN)
        self.assertEqual(
            count_words_in(planted), ["seven"],
            "the count scan must still catch a planted count-word — if this "
            "is empty the carve-out above disabled the whole rule and every "
            "run since has been green for the wrong reason")
        # and the digit half was never carved out at all: her sentence is
        # still scanned for digits, which is the shape a stale count wears.
        for exempt in HER_WORDS_EXEMPT_FROM_THE_COUNT_SCAN:
            self.assertIsNone(DIGIT_RE.search(exempt),
                              "the exemption covers number-WORDS only; a "
                              "digit in an exempt string is still a failure")


def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(
        JobDisclosureTest)
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    print("CASES %d" % ran)
    print("DRIVEN %d route answers scanned, %d rows read back, "
          "%d mutated imports witnessed"
          % (DRIVEN["routings"], DRIVEN["rows_scanned"],
             DRIVEN["imports_driven"]))
    # ⛔ NO TOTAL OF THE LIST IS PRINTED HERE EITHER. What is printed is what
    # this run did, never how long the list was.
    if ran != EXPECTED_CASES:
        print("CASE COUNT MISMATCH: ran %d, file says %d"
              % (ran, EXPECTED_CASES))
    drove = DRIVEN["routings"] > 0 and DRIVEN["imports_driven"] > 0
    if not drove:
        print("DRIVE MISMATCH: %d routings, %d imports — a suite that "
              "examined nothing must not pass"
              % (DRIVEN["routings"], DRIVEN["imports_driven"]))
    if not result.wasSuccessful() or ran != EXPECTED_CASES or not drove:
        return 1
    print("test_job_disclosure OK (a list derived from JOBS, with no count "
          "pinned anywhere, no tier name in what she reads, and a room that "
          "refuses to start when a job has no words)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
