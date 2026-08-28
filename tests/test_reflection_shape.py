#!/usr/bin/env python3
"""
The reflection-shape static gates (Phase 26.995, Plan 01 — D-37, D-35, D-12,
D-17; SRM-13).

WHAT IS UNDER TEST. Three static gates, and not one of them makes a model
call, samples anything, or reads a threshold:

  (a) D-37's NEGATIVE PIN — no constant, function, counter or heuristic
      anywhere in the six shipped app sources measures how much a reflection
      varies in LENGTH from any other reflection. The pin is a scanner over a
      named roster, and the roster is asserted by value.

  (b) D-12's `ends_by_instructing` — no example shown to the room may end by
      telling her to do something.

  (c) D-17's `opens_by_tallying` — no example shown to the room may open by
      counting.

⛔⛔ WHAT THESE GATES CAN SEE, AND WHAT THEY CANNOT — READ THIS BEFORE
LEANING ON A GREEN RUN HERE. Both predicates judge the THREE EXAMPLES THE
ROOM IS SHOWN, at build time. They say nothing whatever about what the room
ACTUALLY WROTE on any evening. Checking the room's instructions is not the
same as checking its writing, and this file has never claimed otherwise —
the claim is stated here rather than buried because a docstring claiming
coverage that does not exist is the defect this phase recorded three times.

⚠ 2026-08-21: THE OTHER HALF NOW EXISTS, ELSEWHERE. She ruled that a
reflection is judged BY A MODEL every time, at run time — 26.995-COPY.md
§ C-4 continuation beat 3, verbatim: *"The model judges each one"* — and that
screen lives in `server.py` and is tested in `tests/test_reflection_address.py`.
⛔ It does not make these gates redundant and they do not make it redundant:
this file asks whether the room was TOLD the rule, that one asks what the room
DID. ⚠ And neither can check a JUDGEMENT. Whether a model calls a given ending
what she would call it is not assertable anywhere in this repo, is not
asserted, and is not claimed.

⚠ BOTH PREDICATES ARE PATTERNS, AND A PATTERN CANNOT SEPARATE INTENT. The
mechanism 26.995-03 built and scored proved exactly that: 8/8 on the fixtures
it was fitted to, 3/5 held out, wrong in both directions. These two survive
because their job is much smaller — three examples this repo wrote, not
arbitrary prose — and because the drill at the foot of this file now watches
each of them fail. ⛔ Nothing here may be widened into a runtime screen over a
generated reflection. That was ruled, and it was ruled the other way.

WHY THIS FILE EXISTS.

(a) exists because the length ruling (D-35: *the material decides the length*)
is a PERMISSION, not a floor — 26.995-01 deleted `LIBRARIAN_REFLECTION_FLOOR`
and put nothing in its place. D-37 records explicitly that the ruling gets NO
CHECK, so that nobody later reads "reflections should vary" and builds a gate
for it. A variance gate would be the sameness problem wearing a tape measure:
it would reject a good reflection for resembling last week's in size, and
"resembling in size" is not a defect anybody has ever measured.

(b) and (c) exist because of the finding that drove this whole phase's method:
the shipped prompt already carries the rule *"no advice posture"* some forty
words below three worked examples that ALL end by telling her to do something,
and #16 measured 16 of 17 essays ending with a forward move anyway. THE RULE
TEXT IS THE CHEAP HALF AND IT IS NOT THE HALF THAT WORKS. So the enforcement
is expressed as what the EXAMPLES do, and it is a gate rather than a sentence.

⛔⛔ THE ONE RULE THAT GOVERNS HOW (b) AND (c) WERE WRITTEN, and the reason
they live in wave 1 instead of beside the examples they will judge:

    THIS FILE DID NOT READ THE SHIPPED PROMPT.

Not to check the delimiters, not to sanity-check a predicate, not once. At
this wave the only prompt on disk still carries the three retired examples
that D-12 exists to DELETE — so a predicate shaped to that text would be a
mirror of the very defect, and a predicate shaped to text the phase is about
to replace is worthless either way. Both predicates were written from the
decision text alone, at wave 1, before any shipped example existed to read.

⚠ AND THE CLAIM NEEDS NO TRUST. It is checkable two ways, neither of which
depends on believing this docstring:
  * over this file's own PARSE TREE — there is no `LIBRARIAN_REFLECT_PROMPT`
    Name or Attribute node anywhere in it, and no import of `server`. Taken
    over the AST rather than by a text grep ON PURPOSE, so that prose like
    this paragraph, which names the constant, cannot invalidate the gate that
    talks about it;
  * over the commit history — `git log -S ends_by_instructing` shows the
    predicate landed in this wave-1 commit, and `git diff` shows plan 07 did
    not touch the predicate bodies. Plan 07 may only conform the TEXT to the
    GATE, never the gate to the text.

WHAT THIS IS NOT.

It is NOT a quality judgement on a reflection, and it is NOT a rule about her
reflections at all — it judges the EXAMPLES the room is shown, which are
authored text under this project's control. It is NOT a similarity or
variation measure of any kind (that is precisely what (a) forbids). It is NOT
a model-graded check: every verdict here is a deterministic function of a
string. And it is NOT yet wired to anything shipped — at this plan's commit
the predicates run over hand-built fixtures only.

⚠ THE NEXT PLAN EXTENDS THIS FILE RATHER THAN CREATING A SECOND ONE.
  * 26.995-07 wires `ends_by_instructing` / `opens_by_tallying` to the shipped
    prompt through `examples_in`, and adds the byte-equality test.
  * 26.995-08 adds the vault-ritual grep case and the third equality leg.
The roster stays short on purpose: 26.93 recorded that a gate held red across
many waves stops being read at all, which costs more than the miss it guards.

===========================================================================
26.995-07 (WAVE 6) ADDED, AND WHAT IT DELIBERATELY DID NOT TOUCH
===========================================================================

⛔⛔ THE PREDICATE BODIES ABOVE ARE BYTE-UNCHANGED BY WAVE 6, AND THAT IS THE
ONLY PROPERTY THAT MAKES THIS GATE WORTH ANYTHING. `ends_by_instructing`,
`opens_by_tallying`, `examples_in`, `gate_examples` and `EXAMPLE_DELIMITER`
were authored at wave 1 from the decision text with the shipped prompt
unread; wave 6 wrote the three examples they judge. Widening a predicate so
a shipped example passes is the mirror defect in its purest form — it is the
gate being told what to say by the thing it exists to judge. IF AN EXAMPLE
IS REJECTED, THE EXAMPLE IS WRONG.

⚠ THE AUTHORSHIP CLAIM IS A GIT FACT, NEVER A SENTENCE IN THIS DOCSTRING.
`git log -S'ends_by_instructing' --oneline -- tests/test_reflection_shape.py`
names wave 1's commit as the first landing, and a diff of that commit
against HEAD over this file shows wave 6 added cases without touching either
predicate body. Both outputs are recorded in 26.995-07-SUMMARY.md. Do not
replace them with prose: "the checker was written before the shipped text
was read" is an unverifiable claim about a check, which is this project's
signature defect one level up.

⛔ WHY D-12'S CHECK IS A BUILD-TIME ASSERTION HERE AND NOT A BRANCH INSIDE
`validate_reflection`, stated explicitly rather than left for a reader to
wonder about: "ends by telling her to do something" is NOT statically
decidable over arbitrary prose. It IS decidable over three known example
strings. D-12's own words are *static, no model call, no threshold, no
sampling*, and a test-suite assertion over the prompt constant satisfies
them exactly, where a runtime validator check could not.

WAVE 6 ALSO ADDED the three-way byte equality: `docs/reflection-examples.md`
is the ONE canonical text, and both the room's prompt and the vault ritual
carry deliberate COPIES of it. The reason for the duplication is written
down at the canonical file and it is not laziness: `tests/eval_reflection.py`
lifts `LIBRARIAN_REFLECT_PROMPT` AS TEXT through a literal evaluation that
RAISES on any concatenation, so the examples cannot be factored out of the
constant — and factoring them out would take the offline judge dark WITHOUT
turning this suite red. The ritual's file is separately outside both repos.

⚠ THE THIRD LEG IS A MACHINE-BOUND GATE AND IS DISCLOSED AS ONE. It reads an
ABSOLUTE PATH UNDER `$HOME`, outside this repo, so it can never be green on
anybody else's machine and it is SKIPPED WITH A STATED REASON until
26.995-08 writes the examples there. The publish suite carries the same kind
of disclosure for the same kind of gate (`tests/test_stage_public.py`: *"this
pin is bound to ONE PERSON'S REAL DATA on ONE MACHINE … that is a real limit
… and it is recorded here rather than ticketed"*). Recorded, not ticketed.

WHAT IT NEVER TOUCHES. No real HOME is written and none is required — the
one absolute path it reads is read-only and its absence is a SKIP, never a
failure. No API key. No live model call, of any provider, ever. No network.
No write of any kind — every file it opens, it opens read-only, and the
planted-defect case mutates an in-memory COPY.

⚠ TWO STATED PROPERTIES CHANGED AT WAVE 6, ON PURPOSE, AND THEY ARE NAMED
HERE RATHER THAN QUIETLY DROPPED. Until wave 6 this suite imported nothing
outside the standard library and carried no `LIBRARIAN_REFLECT_PROMPT` node
at all — asserted over its own parse tree, which was the machine half of the
"prompt unread" claim. Wave 6 is the wave that READS the prompt: that is the
whole job. The prompt is lifted AS TEXT through the standard library's `ast`
rather than by importing the app, which keeps the suite stdlib-only, makes
the pure-literal requirement a DRIVEN failure instead of an assumption, and
means the gate cannot be handed a value the source does not contain. ONE
case imports `server` — deliberately, inside the case — purely to prove the
lifted text and the runtime constant are the same string by value.
"""
import ast
import hashlib
import importlib.util
import os
import re
import shutil
import sys
import tempfile
import unittest

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)


# ---------------------------------------------------------------------------
# ---- what this run actually examined, so `main` can state it BY VALUE -----
#
# The house idiom (tests/test_job_disclosure.py): a suite states what it
# EXAMINED, so a run that examined nothing fails instead of printing a
# cheerful line. Both numbers below are facts about this SUITE's coverage,
# never facts about the product.
EXPECTED_CASES = 11

DRIVEN = {"files_scanned": 0, "fixtures_judged": 0, "examples_compared": 0}


# ---------------------------------------------------------------------------
# ---- (a) D-37: the negative pin -------------------------------------------
# ---------------------------------------------------------------------------

# THE ROSTER, ASSERTED BY VALUE IN THE CASE BELOW. These are the six files
# `tests/test_no_push.cjs` already treats as "the app" — the same six its own
# APP_SOURCES names. It is repeated here rather than imported because that
# file is javascript; the case asserts the tuple by value so that a future
# edit which drops a file from this list FAILS HERE rather than silently
# narrowing the gate to nothing.
#
# ⚠ A NEGATIVE PIN OVER A SHRINKING ROSTER IS THE CLASSIC VACUOUS GREEN: an
# empty roster proves "no variance gate exists" over no files at all.
APP_SOURCES = ("server.py", "study_lib.py", "index.html", "core.js",
               "app.js", "librarian_call.py")

# A NAME SHAPE, NOT A NAME. A variance gate could be spelled a hundred ways
# and nobody would spell it the way this file guesses — so the pattern is a
# LENGTH word joined to a SPREAD word, in EITHER order, with an optional
# separator, case-insensitive, anywhere inside an identifier. That catches
# `LENGTH_VARIANCE_FLOOR`, `lengthVariance`, `varianceInLength`,
# `word_count_deviation`, `SIZE_SPREAD_MIN` and their relatives.
#
# ⛔ IT DELIBERATELY DOES NOT MATCH A SPREAD WORD ALONE. `variation` is a
# live, legitimate word in this codebase — the reflection ledger is called
# exactly that — and a pattern that fired on it would be a gate nobody could
# keep green, which is the same as no gate.
_LENGTH_WORD = r"(?:length|len|size|chars?|characters?|words?|wordcount)"
_SPREAD_WORD = (r"(?:variance|variation|varies|vary|spread|deviation|"
                r"stddev|std_?dev|sigma|dispersion|range)")
_JOIN = r"[_\-]?"
LENGTH_VARIANCE_NAME = re.compile(
    r"\w*(?:%s%s%s|%s%s%s)\w*" % (_LENGTH_WORD, _JOIN, _SPREAD_WORD,
                                  _SPREAD_WORD, _JOIN, _LENGTH_WORD),
    re.IGNORECASE)


def variance_gate_hits(sources):
    """Every length-variance-shaped NAME found in `sources`.

    `sources` is an iterable of (label, text) pairs — text, never a path —
    so the planted-defect case can drive this same function over a mutated
    in-memory copy without touching disk, and so this function reads nothing
    and writes nothing. Returns a list of (label, line number, matched name).
    Pure."""
    hits = []
    for label, text in sources:
        for lineno, line in enumerate(str(text).split("\n"), 1):
            for match in LENGTH_VARIANCE_NAME.finditer(line):
                hits.append((label, lineno, match.group(0)))
    return hits


def read_app_sources():
    """The six shipped sources as (name, text). READ-ONLY, by construction —
    nothing in this file opens any of them for writing."""
    out = []
    for name in APP_SOURCES:
        path = os.path.join(_REPO_ROOT, name)
        with open(path, "r", encoding="utf-8") as fh:
            out.append((name, fh.read()))
        DRIVEN["files_scanned"] += 1
    return out


# ---------------------------------------------------------------------------
# ---- (b)+(c) the example parser and its DECLARED delimiter contract -------
# ---------------------------------------------------------------------------

# ⚠⚠ THIS IS A CONTRACT, AND THE DIRECTION MATTERS. The GATE declares the
# shape and the shipped text must conform to it — never the other way round.
# 26.995-07 is instructed to write its three examples into the prompt fenced
# by this exact marker; the marker does not appear in the prompt yet, and that
# is EXPECTED at this wave, not a bug.
#
# ⛔ IF A LATER PLAN FINDS THE PROMPT AND THE GATE DISAGREEING, THE PROMPT IS
# WHAT MOVES. Changing this constant to match text somebody already wrote is
# the mirror defect in its purest form: it is the gate being told what to say
# by the thing it exists to judge.
#
# The marker FENCES each example — it appears once before and once after — so
# a run of N examples carries exactly 2N occurrences. That is what makes an
# unpaired marker detectable rather than silently producing a phantom example
# out of the trailing text.
EXAMPLE_DELIMITER = "===EXAMPLE==="


def examples_in(text):
    """The example bodies fenced by EXAMPLE_DELIMITER, in order.

    Returns [] when the marker is absent entirely, and [] when the markers
    are UNPAIRED — an odd count means somebody opened an example and never
    closed it, and guessing where it ended would invent an example nobody
    wrote. Pure."""
    body = str(text or "")
    parts = body.split(EXAMPLE_DELIMITER)
    if len(parts) < 3:
        # fewer than two markers: no fenced example exists
        return []
    if (len(parts) - 1) % 2 != 0:
        # an odd number of markers — unpaired, so nothing is trustworthy
        return []
    return [parts[i].strip() for i in range(1, len(parts) - 1, 2)]


class NoExamplesFound(AssertionError):
    """Raised when a whole-text gate is handed text carrying no example.

    ⛔ IT IS AN ERROR, NOT A PASS, AND THAT IS THE WHOLE POINT. "No example
    ends by telling her to do something" is TRIVIALLY TRUE of no examples at
    all — a parser that silently found nothing would hand back a green gate
    for a prompt whose examples had been renamed, re-fenced, or deleted. The
    guard is the difference between a gate and a decoration."""


def gate_examples(text):
    """Run BOTH example predicates over every example fenced in `text`.

    Returns the list of (index, example, reason) offences — empty when every
    example is clean. Raises NoExamplesFound when the text carries no
    parseable example, because a scan that examined nothing must never read
    as a scan that found nothing wrong. Pure."""
    found = examples_in(text)
    if not found:
        raise NoExamplesFound(
            "no example was found between the declared delimiter %r — a gate "
            "that examined nothing must FAIL rather than report that no "
            "example ends by telling her to do something, which is trivially "
            "true of no examples at all" % EXAMPLE_DELIMITER)
    offences = []
    for i, example in enumerate(found):
        if ends_by_instructing(example):
            offences.append((i, example, "ends_by_instructing"))
        if opens_by_tallying(example):
            offences.append((i, example, "opens_by_tallying"))
    return offences


# ---------------------------------------------------------------------------
# ---- 26.995-07: ONE CANONICAL TEXT, TWO DELIBERATE COPIES -----------------
#
# ⛔ FIX THE SOURCE, NEVER THIS GATE — the sentence is lifted verbatim from
# the analog this pattern comes from (tests/test_disclosure_truth.cjs, "ONE
# PROMISE, ONE WORDING, TWO SURFACES"). If the equality below goes red, ONE
# OF THE COPIES DRIFTED. Edit the copy back to `docs/reflection-examples.md`,
# or carry a genuine change into every copy in the SAME commit. A gate
# loosened to admit a drifted copy is worth nothing.
# ---------------------------------------------------------------------------

# The ONE source. Everything else is a copy of this file.
CANONICAL_EXAMPLES_PATH = os.path.join(_REPO_ROOT, "docs",
                                       "reflection-examples.md")

# THE TWO DECLARED CONSUMERS, BY VALUE. A third consumer appearing is the
# condition under which this whole add-alongside decision must be revisited
# rather than the gate widened — at two copies a byte-equality test is
# cheaper than the refactor; at three it is not.
DECLARED_CONSUMERS = ("server.py:LIBRARIAN_REFLECT_PROMPT",
                      "~/.claude/skills/journal-reflection/SKILL.md")

# ⚠ MACHINE-BOUND, AND DISCLOSED AS SUCH IN THE SUITE DOCSTRING. An absolute
# path under $HOME, outside both git repos, which is exactly why the ritual
# carries a copy instead of a reference. Its absence — or its not yet
# carrying the examples, which is the state until 26.995-08 — is a SKIP with
# a stated reason, never a failure and never a silent pass.
RITUAL_SKILL_PATH = os.path.join(os.path.expanduser("~"), ".claude",
                                 "skills", "journal-reflection", "SKILL.md")

EXPECTED_EXAMPLE_COUNT = 3


class LiftFailed(AssertionError):
    """Raised when a copy cannot be LIFTED out of its source at all.

    ⛔ IT IS LOUD ON PURPOSE. The analog's rule is that the shared text is
    lifted out of the shipped source at run time and NEVER re-typed into the
    gate — re-typing puts the value in a third place and lets the two real
    ones drift behind a green test. The cost of lifting is that the lift
    itself can break, and a broken lift that quietly returned "" would make
    every equality below trivially true."""


def norm(text):
    """The normalisation both copies are compared through.

    Curly singles and doubles to straight, en and em dashes to hyphens,
    backticks stripped, every whitespace run collapsed to one space,
    lower-cased. Copied in spirit from the analog, whose header records WHY:
    the shipped constants carry CURLY apostrophes and a straight-quote paste
    is exactly the silent mismatch this gate exists to catch. Pure."""
    out = str(text)
    for curly, straight in (("‘", "'"), ("’", "'"),
                            ("“", '"'), ("”", '"'),
                            ("–", "-"), ("—", "-")):
        out = out.replace(curly, straight)
    out = out.replace("`", "")
    out = re.sub(r"\s+", " ", out)
    return out.strip().lower()


def paragraphs_in(example):
    """How many blank-line-separated blocks an example carries.

    ⚠ THIS EXISTS BECAUSE `norm` COLLAPSES WHITESPACE AND THEREFORE ERASES
    STRUCTURE. A copy that lost every line break would still compare equal
    under the normalisation above — and for a LETTER whose greeting sits on
    its own line, or a set of SEPARATE PIECES that are only separate because
    of the blank lines between them, structure is not cosmetic. The count is
    asserted by value across the copies alongside the text equality. Pure."""
    return len([block for block in str(example).split("\n\n") if block.strip()])


def _read(path, what):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError as exc:
        raise LiftFailed(
            "%s could not be read at %s (%s) — the copies cannot be "
            "compared, and a comparison that could not happen must FAIL "
            "rather than report agreement" % (what, path, exc))


def canonical_examples():
    """The three examples LIFTED from `docs/reflection-examples.md`."""
    found = examples_in(_read(CANONICAL_EXAMPLES_PATH, "the canonical file"))
    if not found:
        raise LiftFailed(
            "no example is fenced by %r in %s — the canonical file is the "
            "ONE source and an empty lift from it makes every equality "
            "below trivially true"
            % (EXAMPLE_DELIMITER, CANONICAL_EXAMPLES_PATH))
    return found


def lift_prompt_text():
    """`LIBRARIAN_REFLECT_PROMPT` LIFTED OUT OF `server.py` AS TEXT.

    ⛔ THROUGH THE PARSE TREE, AND NEVER BY IMPORTING THE APP. Three reasons,
    and the third is the one that matters:
      1. it keeps this suite standard-library-only, so it still opens no
         network, needs no key and imports no provider seam;
      2. it is the same contract `tests/eval_reflection.py` lives under, so
         this gate breaks in the same direction the offline judge does;
      3. ⛔ IT MAKES "THE CONSTANT IS A PURE LITERAL" A DRIVEN FAILURE
         INSTEAD OF AN ASSUMPTION. The moment somebody splices a computed
         value into the assignment, the node stops being an `ast.Constant`
         and this raises by name — where an `import server` would sail
         straight past while the offline judge went dark WITHOUT turning any
         suite red."""
    tree = ast.parse(_read(os.path.join(_REPO_ROOT, "server.py"),
                           "server.py"))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not any(getattr(t, "id", None) == "LIBRARIAN_REFLECT_PROMPT"
                   for t in node.targets):
            continue
        if not isinstance(node.value, ast.Constant) or \
                not isinstance(node.value.value, str):
            raise LiftFailed(
                "LIBRARIAN_REFLECT_PROMPT is no longer a PURE STRING "
                "LITERAL. tests/eval_reflection.py lifts it as text and its "
                "lift RAISES on any concatenation or any call over a "
                "non-literal argument, so this change takes the offline "
                "judge dark — and it does so WITHOUT turning the test suite "
                "red, because the harness sits outside the suite glob. "
                "Adjacent string literals only.")
        return node.value.value
    raise LiftFailed(
        "LIBRARIAN_REFLECT_PROMPT was not found as a module-level "
        "assignment in server.py — the copy cannot be lifted, and a "
        "comparison that could not happen must FAIL rather than pass")


def prompt_examples():
    """The three examples LIFTED from the shipped prompt constant."""
    found = examples_in(lift_prompt_text())
    if not found:
        raise LiftFailed(
            "no example is fenced by %r inside LIBRARIAN_REFLECT_PROMPT. "
            "The GATE declared that delimiter at wave 1 and the shipped "
            "text must conform to it — never the other way round. If the "
            "prompt spells it differently, THE PROMPT IS WHAT MOVES."
            % EXAMPLE_DELIMITER)
    return found


def ritual_examples():
    """The three examples lifted from the vault ritual's SKILL.md, or None
    with a stated reason when that leg cannot run yet.

    Returns (examples, skip_reason) — exactly one of the two is None."""
    if not os.path.exists(RITUAL_SKILL_PATH):
        return None, ("the vault ritual's SKILL.md is not on this machine "
                      "(%s). ⚠ MACHINE-BOUND GATE: it reads an absolute "
                      "path under $HOME, outside both git repos, which is "
                      "the very reason the ritual carries a COPY rather "
                      "than a reference. Its absence is a SKIP, never a "
                      "pass and never a failure." % RITUAL_SKILL_PATH)
    found = examples_in(_read(RITUAL_SKILL_PATH, "the ritual's SKILL.md"))
    if not found:
        # ⛔ 26.995-08 HAS LANDED AND IT WROTE THEM THERE. This branch used to
        # say "until it lands", which is now false, and a skip whose stated
        # reason is false is worse than no skip at all. On the machine this
        # gate was built for, reaching here means the copy was REMOVED or
        # RE-FENCED, not that the plan is pending.
        #
        # ⚠ IT IS STILL A SKIP RATHER THAN A FAILURE, and the reason is not
        # comfort: the skill file is not distributed with this repo, so any
        # other machine's copy is whatever its owner happens to have, and a
        # hard failure here would redden the suite for everybody in order to
        # pin a file that only exists for one person. That is the same
        # trade the machine-bound disclosure in the suite docstring makes.
        #
        # ⚠⚠ SO THIS BRANCH IS A SURVIVABLE MUTATION BY DESIGN, and 26.995-08
        # drove it and recorded the survival rather than hiding it: DELETING
        # the ritual's examples does NOT turn this suite red, where EDITING
        # one word of them does.
        return None, ("the vault ritual's SKILL.md is on this machine (%s) "
                      "but carries no example fenced by %r. ⛔ 26.995-08 HAS "
                      "LANDED AND WROTE THEM THERE — so this branch now "
                      "means the copy was REMOVED or RE-FENCED, NOT that a "
                      "plan is pending. It stays a SKIP because the skill "
                      "file is not distributed with this repo. ⚠ Deleting "
                      "the copy therefore survives this gate; editing it "
                      "does not. Recorded in 26.995-08-SUMMARY.md."
                      % (RITUAL_SKILL_PATH, EXAMPLE_DELIMITER))
    return found, None


def _sentences(text):
    """`text` split into sentences, empties dropped. Deliberately crude and
    deliberately NOT a general sentence tokenizer: these are short authored
    examples under this project's control, not arbitrary prose."""
    parts = re.split(r"(?<=[.!?])\s+", str(text or "").strip())
    return [p.strip() for p in parts if p.strip()]


def _closing_sentence(example):
    parts = _sentences(example)
    return parts[-1] if parts else ""


def _opening_sentence(example):
    parts = _sentences(example)
    return parts[0] if parts else ""


def _bare(sentence):
    """A sentence stripped of the punctuation and quote marks that would hide
    its first word — so a closing line that opens on her quoted words is read
    from her first word, not from the quote mark."""
    return str(sentence or "").strip().lstrip("\"'“”‘’—-–*>… ").lower()


# ---------------------------------------------------------------------------
# ---- (b) D-12: no example ends by telling her to do something -------------
# ---------------------------------------------------------------------------

# Base-form verbs that, standing at the head of a sentence aimed at her, ARE
# the instruction. Anchored and narrow, in the house style of
# `_reads_as_process_narration`: this list is not trying to recognise every
# imperative in English, it is trying to recognise the ending this phase
# exists to delete, which is a short forward move in a closing line.
INSTRUCTING_VERBS = (
    "cast", "sit", "let", "keep", "try", "make", "put", "take", "work",
    "start", "begin", "go", "write", "give", "hold", "leave", "do", "notice",
    "remember", "consider", "look", "read", "call", "text", "ask", "set",
    "pick", "choose", "allow", "return", "revisit", "spend", "stay", "rest",
    "breathe", "pause", "reach", "open", "close", "finish", "carry",
)

# "you could / you might / you may want to / it might help to / maybe you
# should" — the softened instruction, which is still an instruction. D-10
# permits a SOFT forward move in a real reflection; it is NEVER shown in an
# example, because the moment it appears in an example it becomes the ending
# again.
DIRECTIVE_MODAL = re.compile(
    r"\byou\s+(?:could|should|might|may|can|ought\s+to|need\s+to|have\s+to|"
    r"want\s+to|will\s+want)\b"
    r"|\bit\s+might\s+help\s+to\b"
    r"|\b(?:maybe|perhaps)\b[^.?!]{0,40}\byou\b[^.?!]{0,20}\b"
    r"(?:could|should|might|try|keep|let)\b",
    re.IGNORECASE)

# ⚠ D-11's BOUNDARY, IN HER TERMS: a closing question that WONDERS is legal;
# HOMEWORK WEARING A QUESTION MARK is not. *"I keep wondering whether it was
# the loom or the quiet"* is legal. *"What would it take to keep the
# screwdriver in the drawer by the door?"* is not — it is a task with a
# question mark stapled on. These two frames are what separate them.
TASK_QUESTION_FRAME = re.compile(
    r"\bwhat\s+would\s+it\s+take\s+to\b"
    r"|\bwhat's\s+stopping\s+you\b"
    r"|\bhow\s+(?:might|could|would|about)\s+you\b"
    r"|\bwhat\s+if\s+you\b"
    r"|\b(?:could|would|can|will|have|do|did)\s+you\s+"
    r"(?:try|start|keep|make|put|take|write|consider|think\s+about)\b"
    r"|\bhave\s+you\s+(?:tried|thought|considered)\b"
    r"|\bwhy\s+not\b"
    r"|\bwhen\s+will\s+you\b"
    r"|\bhow\s+about\b",
    re.IGNORECASE)

WONDERING_FRAME = re.compile(
    r"^(?:i\s+(?:keep\s+)?(?:wonder|wondering|thinking|keep\s+coming)"
    r"|i'm\s+not\s+sure|i\s+am\s+not\s+sure|whether\b)",
    re.IGNORECASE)


def ends_by_instructing(example):
    """True when this example's CLOSING SENTENCE tells her to do something
    (D-12). Decides over the closing sentence ALONE — an example that
    mentions a chore in the middle and then stops on a line of hers ends
    the way D-10 wants it to, and this predicate must say so.

    Three ways an ending instructs, and nothing else counts:
      1. an imperative aimed at her, standing at the head of the sentence;
      2. a second-person modal about what she could / should / might do;
      3. a question that names a task — D-11's *homework wearing a question
         mark*, as opposed to a question that merely wonders.

    Pure: reads nothing, writes nothing, calls no model."""
    closing = _closing_sentence(example)
    if not closing:
        return False
    bare = _bare(closing)
    is_question = closing.rstrip().endswith("?")
    if is_question:
        if TASK_QUESTION_FRAME.search(closing):
            return True
        if WONDERING_FRAME.search(bare):
            return False
        return bool(DIRECTIVE_MODAL.search(closing))
    first = re.match(r"([a-z']+)", bare)
    if first and first.group(1) in INSTRUCTING_VERBS:
        return True
    return bool(DIRECTIVE_MODAL.search(closing))


# ---------------------------------------------------------------------------
# ---- (c) D-17: no example opens by tallying -------------------------------
# ---------------------------------------------------------------------------

# HER OWN WORD FOR THE DEFECT, AND IT IS LITERAL: *"the AI just counting the
# same words in the notes."* All three arms she rejected open by counting
# (*"the word perfect turns up twice"*); all three she chose open with
# SOMETHING HAPPENING (*"the milk keeps turning up"*).
#
# ⛔ NOTE WHAT IS DELIBERATELY ABSENT FROM THE COUNT TOKENS BELOW: "again".
# *"the milk keeps turning up"* and *"you left it out again on tuesday"* are
# RECURRENCE, not tally — they are the arms she CHOSE. A pattern that treated
# recurrence as counting would reject the exact openings this ruling exists
# to protect.
_COUNT_TOKEN = (r"(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|"
                r"eleven|twelve|twice|thrice|several|a\s+handful\s+of|"
                r"a\s+couple\s+of|how\s+many)")
_OCCURRENCE_NOUN = (r"(?:times|notes|entries|pieces|mentions|occurrences|"
                    r"instances|places|days|evenings|nights)")
_OCCURRENCE_VERB = (r"(?:turns?\s+up|shows?\s+up|comes?\s+up|appears?|"
                    r"recurs?|repeats?|crops?\s+up)")

TALLY_VERB = re.compile(r"\b(?:count|counts|counting|counted|tally|tallies|"
                        r"tallied|totting\s+up)\b", re.IGNORECASE)
COUNTED_OCCURRENCES = re.compile(
    r"\b%s\b(?:\s+\w+){0,3}\s+\b%s\b" % (_COUNT_TOKEN, _OCCURRENCE_NOUN)
    + r"|\b%s\b(?:\s+\w+){0,4}\s+\b%s\b" % (_OCCURRENCE_VERB, _COUNT_TOKEN),
    re.IGNORECASE)


def opens_by_tallying(example):
    """True when this example's OPENING SENTENCE opens by counting (D-17).
    Decides over the opening sentence ALONE — what D-17 rules on is the way
    a reflection STARTS, because that is what she was shown and what she
    judged.

    Two ways an opening tallies, and nothing else counts:
      1. it says so — a count / tally verb;
      2. a count applied to occurrences: *"turns up twice"*, *"four of your
         notes"*, *"three times this week"*.

    ⛔ Recurrence without a number is NOT tallying. *"the milk keeps turning
    up"* is an opening in which something HAPPENS, and it is one of the arms
    she chose.

    Pure: reads nothing, writes nothing, calls no model."""
    opening = _opening_sentence(example)
    if not opening:
        return False
    if TALLY_VERB.search(opening):
        return True
    return bool(COUNTED_OCCURRENCES.search(opening))


# ---------------------------------------------------------------------------
# ---- the fixtures: THIS SUITE'S OWN INVENTED PROSE -------------------------
#
# ⛔ THESE ARE NOT DRAFTS OF THE SHIPPED EXAMPLES AND MUST NOT BE REUSED AS
# SUCH. They exist to drive the predicates in both directions, nothing more.
# 26.995-07 authors the real three; if it lifts any of these it has written
# its examples against the gate instead of against the ruling, which is the
# mirror defect turned inside out.
# ---------------------------------------------------------------------------

# --- D-12 fixtures: three compliant endings, three DIFFERENT ways ----------

# 1. ends on a SIGN-OFF
CLEAN_ENDS_ON_SIGNOFF = (
    "the loom was out again on thursday and still out on sunday.\n"
    "you did not put it away either time, and the room arranged itself "
    "around it.\n"
    "goodnight, then.")

# 2. ends on A LINE OF HERS, with nothing after it
CLEAN_ENDS_ON_HER_LINE = (
    "the sleeve came apart twice this month and went back on twice.\n"
    "\"i frogged the whole sleeve and started over,\" you wrote on "
    "thursday.")

# 3. ends on NOTHING AT ALL — it simply stops
CLEAN_ENDS_ON_NOTHING = (
    "the milk keeps turning up.\n"
    "you left it out on tuesday and again on friday.\n"
    "it is still on the counter.")

# THE PLANTED OFFENDER — her own recorded shape (C-4): a closing line that
# hands her a task and calls it kindness.
PLANTED_ENDS_BY_INSTRUCTING = (
    "the loom sat under the window all week and you walked past it "
    "every day.\n"
    "work one row of the pattern tonight and let that be enough.")

# D-11's BOUNDARY PAIR, her two literal sentences, asserted separately below
# so the boundary is a driven fact rather than a docstring claim.
D11_LEGAL_WONDERING = (
    "the loom sat under the window all week.\n"
    "i keep wondering whether it was the loom or the quiet?")
D11_ILLEGAL_HOMEWORK = (
    "the screwdriver has been on the stairs since the shelf went up.\n"
    "what would it take to keep the screwdriver in the drawer by the "
    "door?")

# --- D-17 fixtures: three compliant openings, one planted tally ------------

CLEAN_OPENS_WITH_SOMETHING_HAPPENING = (
    "the milk keeps turning up.\n"
    "it was on the counter on tuesday and it is there now.")
CLEAN_OPENS_WITH_HER_DOING_SOMETHING = (
    "you left the loom out again on thursday.\n"
    "it is still there, warp and all.")
CLEAN_OPENS_WITH_A_SCENE = (
    "the kettle was still warm when you came back down.\n"
    "you stood at the window for a while before you poured it.")

PLANTED_OPENS_BY_TALLYING = (
    "the word tired turns up in four of your notes this week.\n"
    "it sits beside the loom notes and the kitchen ones alike.")

# A hand-built prompt-shaped fixture carrying exactly THREE fenced examples.
# ⚠ Assembled from the constants above rather than re-typed, so the count
# assertion below cannot drift away from the fixtures the predicates judge.
FIXTURE_THREE = (
    "some rule text that is not an example at all.\n"
    + EXAMPLE_DELIMITER + "\n" + CLEAN_ENDS_ON_SIGNOFF + "\n"
    + EXAMPLE_DELIMITER + "\n"
    "a sentence of prose between two examples.\n"
    + EXAMPLE_DELIMITER + "\n" + CLEAN_ENDS_ON_HER_LINE + "\n"
    + EXAMPLE_DELIMITER + "\n"
    + EXAMPLE_DELIMITER + "\n" + CLEAN_ENDS_ON_NOTHING + "\n"
    + EXAMPLE_DELIMITER + "\n"
    "and some closing rule text.\n")

# The same fixture with a FOURTH, offending example appended — the red-first
# driver for the whole-text gate.
FIXTURE_WITH_PLANTED_OFFENDER = (
    FIXTURE_THREE
    + EXAMPLE_DELIMITER + "\n" + PLANTED_ENDS_BY_INSTRUCTING + "\n"
    + EXAMPLE_DELIMITER + "\n")


class ReflectionShapeStaticGateTest(unittest.TestCase):
    """The three static gates, over hand-built fixtures and the shipped
    source roster. No model call, no threshold, no sampling, no network."""

    # -- (a) D-37: the negative pin -----------------------------------------

    def test_no_length_variance_gate_exists_in_the_shipped_sources(self):
        """D-37: the length ruling is a PERMISSION, not a floor, and nothing
        anywhere may measure how much a reflection varies in length from any
        other reflection.

        ⚠ THE ROSTER IS ASSERTED BY VALUE IN THE SAME CASE. A negative pin is
        only as strong as the set it searched, and the cheapest way to make
        this green for ever is to quietly stop searching."""
        self.assertEqual(
            APP_SOURCES,
            ("server.py", "study_lib.py", "index.html", "core.js",
             "app.js", "librarian_call.py"),
            "the scanned roster changed — a negative pin over a shrinking "
            "roster reports an absence it never looked for, and the six "
            "files here are the same six tests/test_no_push.cjs calls the "
            "app")
        self.assertEqual(len(APP_SOURCES), 6,
                         "six files, by value, so a dropped one is a "
                         "failure rather than a smaller search")
        sources = read_app_sources()
        self.assertEqual(len(sources), 6,
                         "all six were actually opened and read — an "
                         "unreadable source must fail here, never be "
                         "skipped into a clean result")
        hits = variance_gate_hits(sources)
        self.assertEqual(
            hits, [],
            "a length-variance-shaped name is now in the shipped app: %r. "
            "D-37 records that the length ruling gets NO CHECK — a gate "
            "measuring how much a reflection varies in length is the "
            "sameness problem wearing a tape measure, and it would reject a "
            "good reflection for resembling last week's in size" % (hits,))

    def test_a_planted_variance_constant_is_found_and_named(self):
        """⛔ THE CASE THAT PROVES THE ONE ABOVE IS NOT VACUOUS. The scanner
        is driven over a MUTATED IN-MEMORY COPY of a shipped source carrying
        a planted variance constant; it must find exactly that one hit and
        say which file it came from.

        Without this arm, `assertEqual(hits, [])` would pass identically for
        a scanner whose pattern matched nothing at all — which is the shape
        of roughly thirty recorded defects on this project."""
        original = read_app_sources()[0]
        label, text = original
        lines = text.split("\n")
        planted = "REFLECTION_LENGTH_VARIANCE_FLOOR = 0.35  # planted"
        lines.insert(40, planted)
        mutated = [(label, "\n".join(lines))]
        DRIVEN["fixtures_judged"] += 1
        hits = variance_gate_hits(mutated)
        self.assertEqual(
            len(hits), 1,
            "the planted constant must be found EXACTLY ONCE — %r" % (hits,))
        self.assertEqual(hits[0][0], label,
                         "the hit names the file it came from, so a reader "
                         "of a red run knows where to look")
        self.assertEqual(hits[0][1], 41,
                         "and the line it sits on, by value")
        self.assertIn("LENGTH_VARIANCE", hits[0][2].upper(),
                      "the matched text is the planted name, not some "
                      "neighbouring word the pattern happened to reach")
        # ⚠ AND THE UNMUTATED CONTROL, IN THE SAME CASE: the very same source
        # WITHOUT the plant is clean. Otherwise this case would also pass for
        # a scanner that fired on something already in the file.
        self.assertEqual(
            variance_gate_hits([original]), [],
            "the unmutated copy of the same file is clean — so the single "
            "hit above is the plant, not something that was always there")

    # -- the parser and its delimiter contract ------------------------------

    def test_the_example_parser_and_its_declared_delimiter_contract(self):
        """`examples_in` and the non-empty guard, both directions.

        ⚠ THE GUARD IS THE HALF THAT MATTERS. "No example ends by telling her
        to do something" is TRIVIALLY TRUE of no examples at all, so a parser
        that silently returns [] would hand back a green gate for a prompt
        whose examples had been re-fenced or deleted."""
        found = examples_in(FIXTURE_THREE)
        self.assertEqual(len(found), 3,
                         "exactly three examples, BY VALUE — an example "
                         "silently lost or gained is what this count "
                         "exists to catch: %r" % (found,))
        self.assertEqual(found[0], CLEAN_ENDS_ON_SIGNOFF.strip())
        self.assertEqual(found[1], CLEAN_ENDS_ON_HER_LINE.strip())
        self.assertEqual(found[2], CLEAN_ENDS_ON_NOTHING.strip(),
                         "and they come back in order, whole, with the "
                         "prose between them left outside")
        self.assertEqual(examples_in("no delimiter here"), [],
                         "text carrying no marker yields no example")
        self.assertEqual(
            examples_in("stray " + EXAMPLE_DELIMITER + " marker"), [],
            "an UNPAIRED marker yields nothing rather than a phantom "
            "example invented out of the trailing text")
        DRIVEN["fixtures_judged"] += 3
        # the gate FAILS on an empty parse rather than reporting success
        with self.assertRaises(NoExamplesFound):
            gate_examples("no delimiter here")
        with self.assertRaises(NoExamplesFound):
            gate_examples("")
        # ...and it PASSES on the clean fixture — so the raise above is about
        # emptiness, not about the gate rejecting everything it is handed.
        self.assertEqual(
            gate_examples(FIXTURE_THREE), [],
            "the three compliant examples pass the whole-text gate")
        # ...and it CATCHES the planted fourth. The by-value count is what
        # separates "the gate works" from "the gate rejects everything".
        offences = gate_examples(FIXTURE_WITH_PLANTED_OFFENDER)
        self.assertEqual(len(offences), 1,
                         "EXACTLY the planted fourth offends: %r"
                         % (offences,))
        self.assertEqual(offences[0][0], 3, "and it is the fourth example")
        self.assertEqual(offences[0][2], "ends_by_instructing")

    # -- (b) D-12 -----------------------------------------------------------

    def test_no_example_ends_by_instructing_her(self):
        """D-12, BOTH DIRECTIONS IN ONE CASE so neither can drift alone.

        THE FINDING THIS ENFORCES: the shipped prompt says *"no advice
        posture"* some forty words below three worked examples that all end
        by telling her to do something, and 16 of 17 measured essays ended
        with a forward move anyway. An example that ends by telling her to do
        something TEACHES THE ROOM the ending this phase exists to delete,
        and the shipped prompt has been doing exactly that beneath a rule
        that forbids it. The rule text is the cheap half."""
        accepted = [CLEAN_ENDS_ON_SIGNOFF, CLEAN_ENDS_ON_HER_LINE,
                    CLEAN_ENDS_ON_NOTHING]
        self.assertEqual(len(accepted), 3,
                         "three compliant endings, three DIFFERENT ways — a "
                         "single-shape control proves only that one shape "
                         "passes")
        for i, example in enumerate(accepted):
            DRIVEN["fixtures_judged"] += 1
            self.assertFalse(
                ends_by_instructing(example),
                "compliant ending %d was rejected — a predicate that "
                "rejects a sign-off, a line of hers, or a full stop leaves "
                "the room no legal way to end, and the forward move comes "
                "straight back: %r" % (i, _closing_sentence(example)))
        DRIVEN["fixtures_judged"] += 1
        self.assertTrue(
            ends_by_instructing(PLANTED_ENDS_BY_INSTRUCTING),
            "the planted offender was ACCEPTED — this gate is decoration. "
            "Its closing line hands her a task and calls it kindness: %r"
            % _closing_sentence(PLANTED_ENDS_BY_INSTRUCTING))
        # D-11's boundary, driven rather than merely described: a closing
        # question that WONDERS is legal; homework wearing a question mark
        # is not.
        DRIVEN["fixtures_judged"] += 2
        self.assertFalse(
            ends_by_instructing(D11_LEGAL_WONDERING),
            "a closing question that wonders is LEGAL (D-11) — barring it "
            "would delete a whole legal ending on a punctuation mark")
        self.assertTrue(
            ends_by_instructing(D11_ILLEGAL_HOMEWORK),
            "homework wearing a question mark is still homework (D-11) — a "
            "task does not stop being a task because it ends in '?'")

    # -- (c) D-17 -----------------------------------------------------------

    def test_no_example_opens_by_tallying(self):
        """D-17, BOTH DIRECTIONS IN ONE CASE.

        HER OWN WORD FOR THE DEFECT, AND IT IS LITERAL: *"the AI just
        counting the same words in the notes."* Every arm she rejected opens
        by counting; every arm she chose opens with something happening.

        ⚠ THE TRAP IS LIVE AND DOCUMENTED: two of the three examples written
        for the instrument opened exactly that way, unprompted, while
        honouring every prior ruling. Whoever writes the shipped examples
        will reach for the tally, which is why this is a gate and not a
        sentence in a prompt."""
        accepted = [CLEAN_OPENS_WITH_SOMETHING_HAPPENING,
                    CLEAN_OPENS_WITH_HER_DOING_SOMETHING,
                    CLEAN_OPENS_WITH_A_SCENE]
        self.assertEqual(len(accepted), 3,
                         "three compliant openings, by value")
        for i, example in enumerate(accepted):
            DRIVEN["fixtures_judged"] += 1
            self.assertFalse(
                opens_by_tallying(example),
                "compliant opening %d was rejected — note that RECURRENCE "
                "is not a tally: 'the milk keeps turning up' and 'you left "
                "it out again' are the arms she CHOSE, and a pattern that "
                "counts 'again' as counting rejects the very openings this "
                "ruling protects: %r" % (i, _opening_sentence(example)))
        DRIVEN["fixtures_judged"] += 1
        self.assertTrue(
            opens_by_tallying(PLANTED_OPENS_BY_TALLYING),
            "the planted tally was ACCEPTED — an example that opens by "
            "counting teaches the room to open by counting, which is the "
            "one thing she named in her own words as what makes it read "
            "like a machine: %r"
            % _opening_sentence(PLANTED_OPENS_BY_TALLYING))
        # the tally verb alone, said out loud, is also a tally
        DRIVEN["fixtures_judged"] += 1
        self.assertTrue(
            opens_by_tallying("counting the notes about the loom, there "
                              "is a pattern here."),
            "an opening that says it is counting is counting")


# ---------------------------------------------------------------------------
# ---- 26.995-07: the three-way byte equality --------------------------------
# ---------------------------------------------------------------------------


class CanonicalExamplesTest(unittest.TestCase):
    """`docs/reflection-examples.md` is the ONE text; the prompt and the
    vault ritual carry deliberate COPIES; a copy edited alone is a failure.

    ⛔ FIX THE SOURCE, NEVER THIS GATE."""

    def test_the_three_examples_are_one_text_in_two_places(self):
        """The canonical file and the prompt carry the SAME three examples.

        ⚠ THE NON-EMPTY GUARD IS THE HALF THAT MATTERS AND IT RUNS FIRST. A
        three-way equality over an empty extraction passes forever — the
        analog states it in one line (*"a vacuous equivalence assertion
        proves nothing"*) and it is copied here as an assertion rather than
        as a comment. Both lifts raise `LiftFailed` by name on an empty or
        broken extraction, and the count is asserted BY VALUE on BOTH sides
        before a single character is compared."""
        canonical = canonical_examples()
        shipped = prompt_examples()
        # --- non-empty and by-value counts, on BOTH sides, BEFORE compare --
        self.assertTrue(canonical, "the canonical lift is non-empty")
        self.assertTrue(shipped, "the prompt lift is non-empty")
        self.assertEqual(
            len(canonical), EXPECTED_EXAMPLE_COUNT,
            "EXACTLY three examples in the canonical file, BY VALUE — an "
            "example silently lost or gained is what this count exists to "
            "catch, and a fourth would be a fourth thing the room is "
            "taught: %r" % ([e[:40] for e in canonical],))
        self.assertEqual(
            len(shipped), EXPECTED_EXAMPLE_COUNT,
            "EXACTLY three examples in LIBRARIAN_REFLECT_PROMPT, BY VALUE — "
            "and a delimiter spelled wrongly fails LOUDLY here rather than "
            "passing on an empty parse: %r" % ([e[:40] for e in shipped],))
        # --- the two declared consumers, by value ---------------------------
        self.assertEqual(
            DECLARED_CONSUMERS,
            ("server.py:LIBRARIAN_REFLECT_PROMPT",
             "~/.claude/skills/journal-reflection/SKILL.md"),
            "TWO declared consumers, named by value. A THIRD appearing is "
            "the condition under which the add-alongside decision must be "
            "revisited rather than this gate widened — at two copies a "
            "byte-equality test is cheaper than the refactor, at three it "
            "is not")
        # --- the equality itself --------------------------------------------
        for i, (mine, theirs) in enumerate(zip(canonical, shipped)):
            DRIVEN["examples_compared"] += 1
            self.assertEqual(
                norm(mine), norm(theirs),
                "example %d has DRIFTED between docs/reflection-examples.md "
                "and the shipped prompt. ⛔ FIX THE SOURCE, NEVER THIS "
                "GATE: edit the copy back to the canonical file, or carry "
                "the change into every copy in the same commit." % i)
            # ⚠ AND THE STRUCTURE, which `norm` erases by collapsing
            # whitespace. A letter whose greeting stopped sitting on its own
            # line, or separate pieces that stopped being separate, would
            # compare EQUAL above and be a different reflection shape.
            self.assertEqual(
                paragraphs_in(mine), paragraphs_in(theirs),
                "example %d agrees word for word but NOT in shape — the "
                "normalisation collapses whitespace, so this count is what "
                "notices that a copy lost its blank lines" % i)
        # --- the third leg: skipped WITH A STATED REASON --------------------
        ritual, reason = ritual_examples()
        if ritual is None:
            self.assertTrue(
                reason and len(reason) > 40,
                "a skipped leg must state WHY, in a sentence a reader can "
                "act on — a silent skip is indistinguishable from a pass")
            print("\n  [SKIPPED LEG] %s" % reason)
            return
        self.assertEqual(
            len(ritual), EXPECTED_EXAMPLE_COUNT,
            "the ritual carries exactly three too — one rule governs both "
            "systems, and a SECOND SET OF EXAMPLES IS TWO MENUS")
        for i, (mine, theirs) in enumerate(zip(canonical, ritual)):
            DRIVEN["examples_compared"] += 1
            self.assertEqual(norm(mine), norm(theirs),
                             "example %d has drifted between the canonical "
                             "file and the vault ritual" % i)

    def test_a_drifted_copy_and_an_emptied_lift_both_FAIL(self):
        """⛔ THE CASE THAT PROVES THE ONE ABOVE IS NOT VACUOUS, driven over
        IN-MEMORY COPIES so nothing on disk is touched.

        Two directions, because an equality gate can fail by accepting
        everything OR by examining nothing, and only driving both catches
        both:
          1. ONE WORD CHANGED IN ONE COPY ALONE must not compare equal;
          2. AN EMPTIED EXTRACTION must RAISE rather than sail through — a
             three-way equality over nothing is true forever.
        """
        canonical = canonical_examples()
        shipped = prompt_examples()
        # unmutated control, in the same case: they agree as they stand.
        self.assertEqual([norm(e) for e in canonical],
                         [norm(e) for e in shipped],
                         "THE UNMUTATED CONTROL — without it, both "
                         "assertions below would pass just as happily for a "
                         "normaliser that flattened every string to ''")
        # 1. one word, in one copy, alone.
        drifted = list(canonical)
        drifted[1] = drifted[1].replace("balcony", "verandah", 1)
        DRIVEN["examples_compared"] += 1
        self.assertNotEqual(
            norm(drifted[1]), norm(shipped[1]),
            "ONE WORD changed in ONE copy compares EQUAL — this gate is "
            "decoration, and the two copies are free to drift apart behind "
            "a green run")
        # ...and the mutation is real: the word was actually there to change.
        self.assertNotEqual(drifted[1], canonical[1],
                            "the planted drift actually changed the text — "
                            "otherwise assertNotEqual above would be "
                            "comparing a string with itself")
        # 2. an emptied extraction FAILS rather than passes.
        with self.assertRaises(NoExamplesFound):
            gate_examples("a prompt whose examples were all deleted")
        self.assertEqual(
            examples_in("### EXAMPLE ###\nnot the declared delimiter\n"), [],
            "a delimiter spelled differently yields NOTHING — which is why "
            "the by-value count of three above is the assertion that "
            "catches it, rather than an equality over two empty lists")
        # 3. a structural-only drift is caught too — same words, no blanks.
        flattened = canonical[0].replace("\n\n", "\n")
        self.assertEqual(norm(flattened), norm(canonical[0]),
                         "the normalisation genuinely CANNOT see this "
                         "difference — stated by driving it, so the "
                         "paragraph count above is justified rather than "
                         "decorative")
        self.assertNotEqual(paragraphs_in(flattened),
                            paragraphs_in(canonical[0]),
                            "...and the paragraph count is what sees it")

    # -----------------------------------------------------------------
    # 26.995-07 task 3: THE WAVE-1 PREDICATES, RUN OVER THE SHIPPED TEXT
    #
    # ⛔⛔ THE PREDICATES ARE NOT WRITTEN HERE AND ARE NOT EDITED HERE.
    # `ends_by_instructing` (D-12) and `opens_by_tallying` (D-17) were
    # authored at wave 1, five waves before any shipped example existed,
    # from the decision text alone. These two cases POINT THEM AT THE
    # SHIPPED PROMPT and record what they say.
    #
    # ⛔ IF A SHIPPED EXAMPLE IS REJECTED HERE, THE EXAMPLE IS REWRITTEN.
    # Widening a predicate to admit the text it exists to judge is the
    # mirror defect in its purest form, and it would throw away the only
    # thing that makes this gate mean anything.
    #
    # ⚠ THE AUTHORSHIP CLAIM IS A GIT FACT, NOT A SENTENCE. See the suite
    # docstring: `git log -S` names wave 1's commit for each predicate, and
    # the diff of that commit against HEAD over this file shows no change
    # inside either body. Both outputs are recorded in the plan's summary.
    # -----------------------------------------------------------------

    # THE PLANTED FOURTH, ends-by-instructing arm. ⚠ IT IS THE EXACT
    # RETIRED FORM: one of the three worked skeletons this plan deleted
    # from the shipped prompt, the one that told her to sit somewhere again
    # tonight. It is planted rather than invented so the red is driven by
    # the very text D-12 exists to delete.
    PLANTED_FOURTH_INSTRUCTS = (
        "## the window seat\n"
        "\n"
        "in the same chair, three of these were written. you did not plan "
        "that.\n"
        "\n"
        "sit there again tonight.")

    # THE PLANTED FOURTH, opens-by-tallying arm — an opening that counts
    # occurrences, which is her own literal complaint ("the AI just
    # counting the same words in the notes").
    PLANTED_FOURTH_TALLIES = (
        "## what keeps coming back\n"
        "\n"
        "the phrase \"not today\" shows up in six of your entries this "
        "month. it is there in the kitchen pages and the loom pages "
        "alike.\n"
        "\n"
        "\"not today, maybe tomorrow.\"")

    def _prompt_with(self, planted):
        """A COPY of the shipped prompt with a fourth example appended.

        The shipped constant is never mutated — the copy is built in
        memory, exactly as the D-37 planted-defect case does."""
        return (lift_prompt_text() + "\n" + EXAMPLE_DELIMITER + "\n"
                + planted + "\n" + EXAMPLE_DELIMITER + "\n")

    def test_no_SHIPPED_example_ends_by_instructing_her(self):
        """D-12 over the shipped prompt, BOTH DIRECTIONS IN ONE CASE.

        A gate can fail by rejecting everything or by accepting everything,
        and a case that only asserts the shipped three pass would be green
        for a predicate that was deleted. So the planted fourth's REJECTION
        and the shipped three's ACCEPTANCE are asserted here together —
        neither can drift alone."""
        shipped = lift_prompt_text()
        found = examples_in(shipped)
        self.assertEqual(
            len(found), EXPECTED_EXAMPLE_COUNT,
            "the wave-1 parser finds EXACTLY three examples in the wave-6 "
            "text, BY VALUE. A delimiter spelled wrongly fails LOUDLY here "
            "rather than passing on an empty parse — which is what plan 01 "
            "built the guard to do: %r" % ([e[:40] for e in found],))
        # --- the observed RED: the planted fourth is rejected, and the
        # --- rejection NAMES which example offended.
        offences = gate_examples(self._prompt_with(
            self.PLANTED_FOURTH_INSTRUCTS))
        DRIVEN["fixtures_judged"] += 1
        self.assertEqual(
            len(offences), 1,
            "EXACTLY ONE offence — the planted fourth. More would mean a "
            "shipped example offends too; none would mean the gate is "
            "decoration: %r" % (offences,))
        self.assertEqual(offences[0][0], 3,
                         "and it names WHICH example offended, by index — "
                         "a red run that does not say where to look is a "
                         "red run nobody acts on")
        self.assertEqual(offences[0][2], "ends_by_instructing",
                         "and WHY: its closing line hands her a task and "
                         "calls it kindness")
        self.assertIn("sit there again tonight", offences[0][1],
                      "the offending text comes back whole, so the reader "
                      "of a red run sees the sentence rather than an index")
        # --- and, IN THE SAME CASE, the shipped three pass.
        for i, example in enumerate(found):
            DRIVEN["fixtures_judged"] += 1
            self.assertFalse(
                ends_by_instructing(example),
                "SHIPPED example %d ends by telling her to do something. ⛔ "
                "THE EXAMPLE IS WRONG, NOT THE GATE — rewrite the ending in "
                "docs/reflection-examples.md and the prompt together. Its "
                "closing sentence is: %r"
                % (i, _closing_sentence(example)))
        self.assertEqual(
            gate_examples(shipped), [],
            "the shipped prompt as it stands carries NO offence at all — "
            "the unmutated control for the rejection above")

    def test_no_SHIPPED_example_opens_by_tallying(self):
        """D-17 over the shipped prompt, both directions in one case.

        ⚠ THE TRAP IS LIVE AND DOCUMENTED: two of the three examples
        written for the instrument opened by counting, unprompted, while
        honouring every prior ruling. Whoever writes the shipped examples
        will reach for the tally, which is why this is a gate and not a
        sentence in a prompt."""
        shipped = lift_prompt_text()
        found = examples_in(shipped)
        self.assertEqual(len(found), EXPECTED_EXAMPLE_COUNT,
                         "three shipped examples, by value")
        offences = gate_examples(self._prompt_with(
            self.PLANTED_FOURTH_TALLIES))
        DRIVEN["fixtures_judged"] += 1
        self.assertEqual(
            len(offences), 1,
            "EXACTLY ONE offence — the planted tally: %r" % (offences,))
        self.assertEqual(offences[0][0], 3, "and it names which one")
        self.assertEqual(offences[0][2], "opens_by_tallying",
                         "and why — it opens by counting occurrences, "
                         "which is the one thing she named in her own "
                         "words as what makes it read like a machine")
        for i, example in enumerate(found):
            DRIVEN["fixtures_judged"] += 1
            self.assertFalse(
                opens_by_tallying(example),
                "SHIPPED example %d opens by counting. ⛔ THE EXAMPLE IS "
                "WRONG, NOT THE GATE — and note that RECURRENCE is not a "
                "tally: 'the milk keeps turning up' is an arm she CHOSE. "
                "Its opening sentence is: %r"
                % (i, _opening_sentence(example)))

    def test_the_lifted_text_IS_the_shipped_constant(self):
        """⛔ THE ONE CASE THAT IMPORTS `server`, AND THE REASON IT DOES.

        Every other case here lifts the prompt out of `server.py` through
        the parse tree, which keeps this suite standard-library-only and
        makes the pure-literal requirement a driven failure. The cost of
        that choice is one honest question: does the text this gate judges
        equal the text the product actually SENDS?

        For a pure `ast.Constant` assignment the two cannot diverge — but
        "cannot diverge" is an argument, and this project's signature defect
        is a check that pins the wrong thing. So it is asserted, BY VALUE,
        once, here."""
        import server                                   # noqa: PLC0415
        lifted = lift_prompt_text()
        self.assertEqual(
            lifted, server.LIBRARIAN_REFLECT_PROMPT,
            "the text lifted from server.py's parse tree is NOT the "
            "constant the running app holds — every example judgement in "
            "this suite is then about a string the product does not send")
        self.assertEqual(
            len(examples_in(lifted)), EXPECTED_EXAMPLE_COUNT,
            "and the examples parsed out of it are the shipped three")


# ---------------------------------------------------------------------------
# ---- 26.995-08: THE RATING IS GONE FROM THE VAULT RITUAL (D-39) -----------
#
# The ritual used to tell itself to note how a reflection landed, in one line
# appended to the note's own frontmatter, and never to ask a second time.
# D-39 deletes BOTH HALVES — the recording AND the asking — and the widening
# is deliberate: a chat that asks whether the note landed well is D-22's
# forbidden rating box wearing different clothes.
#
# ⛔ WHY THIS IS A GREP AND NOT SOMETHING BETTER. The ritual is prose, in no
# repository, read by a model. There is no import to make, no constant to
# assert and no diff to inspect. RESEARCH § 12 says so in one line: *"no test;
# a grep is the only gate."* So the gate is a scanner, and the only thing that
# makes a scanner worth anything is that it was SEEN FINDING THE THING FIRST.
# ---------------------------------------------------------------------------

# Three shapes, because the instruction was written three ways in two lines:
# the frontmatter KEY itself, and the two enumerations of its answers.
REACTION_KEY_PATTERN = re.compile(
    r"\breaction\s*:"
    r"|\bglad\s*[|/]\s*not[-\s]?really"
    r"|\bnot[-\s]?really\s*[|/]\s*never[-\s]?again",
    re.IGNORECASE)


def reaction_key_hits(text):
    """Every reaction-key-shaped occurrence in `text`, as (line no, matched).

    Pure — takes TEXT, never a path, so the controls below drive this same
    function over in-memory fixtures without reading anything."""
    hits = []
    for lineno, line in enumerate(str(text or "").split("\n"), 1):
        for match in REACTION_KEY_PATTERN.finditer(line):
            hits.append((lineno, match.group(0)))
    return hits


# ⛔⛔ THE KNOWN-POSITIVE CONTROL, AND IT IS THE DELETED TEXT ITSELF — the two
# sentences as they stood in the ritual's step 6 immediately before 26.995-08
# edited them, copied here verbatim on 2026-08-19. A scanner asserted only
# against the file it has already cleaned is a scanner nobody has ever seen
# work; this fixture is what makes `hits == []` below a finding rather than a
# hope. The pre-edit run over the LIVE file is recorded in the commit body.
RITUAL_REACTION_TEXT_AS_IT_STOOD = (
    "6. **Tell her** the note path and a 2-3 sentence summary in chat. Do "
    "not paste the whole\n"
    "   note. If she reacts (glad / not really), note her reaction in one "
    "line appended to the\n"
    "   note's frontmatter as `reaction: glad|not-really|never-again` when "
    "she offers it —\n"
    "   this is the glad-rate evidence Phase 21 needs. Never ask twice.")

# ⛔⛔ THE KNOWN-NEGATIVE CONTROL, and it is not decoration either. The ritual
# now carries a PARAGRAPH ABOUT the deletion — the accepted cost and the
# rejected alternative, written there on purpose so the next reader does not
# find the gap and fill it. A pattern that fired on prose describing the thing
# it forbids would be a gate nobody could keep green, which is the same as no
# gate. This fixture is the wording actually written into the skill.
RITUAL_DELETION_PROSE = (
    "⛔ **Ask her nothing about how it landed, and record nothing if she "
    "offers it.** No key in the\n"
    "   frontmatter, no line in the note, no question in the chat. A chat "
    "that asks whether the\n"
    "   note landed well is the forbidden rating box wearing different "
    "clothes.")


class VaultRitualTest(unittest.TestCase):
    """D-39 over `~/.claude/skills/journal-reflection/SKILL.md`.

    ⚠ MACHINE-BOUND GATE, disclosed here in the form this repo already uses
    for exactly this kind of pin (`tests/test_stage_public.py`: *"this pin is
    bound to ONE PERSON'S REAL DATA on ONE MACHINE … that is a real limit …
    and it is recorded here rather than ticketed"*). It reads an ABSOLUTE
    PATH under $HOME, outside both git repos — which is the very reason the
    ritual carries a COPY of the examples rather than a reference — so it can
    never be green on anybody else's machine. Its absence is a SKIP WITH A
    STATED REASON, never a pass and never a failure."""

    def test_the_vault_ritual_names_no_reaction_key(self):
        """D-39: no rating key, and no enumeration of its answers, anywhere
        in the ritual's file.

        THE CONTROLS RUN FIRST AND BOTH DIRECTIONS ARE DRIVEN, because a
        scanner can fail by matching nothing at all — which is the shape of
        this project's signature defect — or by matching prose that merely
        talks about what it forbids."""
        # --- known positive: the text as it actually stood, before the edit
        control = reaction_key_hits(RITUAL_REACTION_TEXT_AS_IT_STOOD)
        DRIVEN["fixtures_judged"] += 1
        self.assertEqual(
            len(control), 3,
            "the scanner must find EXACTLY three occurrences in the deleted "
            "text — the key itself and the two enumerations of its answers. "
            "Without this arm the empty result below would pass identically "
            "for a pattern that matches nothing at all: %r" % (control,))
        self.assertEqual(
            [m for _, m in control],
            ["glad / not really", "reaction:", "glad|not-really"],
            "and it finds them BY VALUE, in order, so a pattern that "
            "happened to fire on some neighbouring word cannot masquerade "
            "as this one")
        # --- known negative: prose ABOUT the deletion is clean
        DRIVEN["fixtures_judged"] += 1
        self.assertEqual(
            reaction_key_hits(RITUAL_DELETION_PROSE), [],
            "the paragraph the ritual now carries ABOUT this deletion must "
            "not itself trip the gate — a pattern that fires on prose "
            "describing what it forbids is a gate nobody can keep green, "
            "which is the same as no gate")
        # --- the live file
        if not os.path.exists(RITUAL_SKILL_PATH):
            print("\n  [SKIPPED LEG] the vault ritual's SKILL.md is not on "
                  "this machine (%s). ⚠ MACHINE-BOUND GATE: an absolute "
                  "path under $HOME, outside both git repos. Its absence is "
                  "a SKIP, never a pass and never a failure."
                  % RITUAL_SKILL_PATH)
            return
        text = _read(RITUAL_SKILL_PATH, "the ritual's SKILL.md")
        self.assertTrue(
            text.strip(),
            "the ritual's file is EMPTY — a scan over nothing must fail "
            "rather than report that nothing was found")
        DRIVEN["fixtures_judged"] += 1
        hits = reaction_key_hits(text)
        self.assertEqual(
            hits, [],
            "the vault ritual still names a rating key: %r. D-39 deletes "
            "BOTH halves — the recording AND the asking — and nothing "
            "replaces it. ⚠ The file is in NO repository, so there is no "
            "diff to read: the before-and-after text lives in "
            ".planning/phases/26.995-what-may-vary-in-a-reflection/"
            "26.995-RITUAL-RECORD.md" % (hits,))



# ---------------------------------------------------------------------------
# ---- THE MUTATION DRILL over this file's own two predicates (26.995-25) ---
#
# ⛔⛔ WHY IT ARRIVES NOW, AND WHY IT IS THIS FILE'S PREDICATES RATHER THAN
# THE ROOM'S. On 2026-08-21 she ruled that a reflection is judged BY A MODEL
# at run time — `26.995-COPY.md` § C-4 continuation beat 3, verbatim: "The
# model judges each one". That mechanism lives in `server.py` and is drilled
# where it lives, in `tests/test_reflection_address.py`. What THIS file owns
# is a different and smaller thing: the build-time gate over the THREE
# EXAMPLES THE ROOM IS SHOWN. Both were green; neither had ever been watched
# fail. A gate never seen red is not evidence, so both are put to the test
# here.
#
# ⛔ EVERY MUTATION IS PROVEN PLANTED BY CONTENT HASH BEFORE ITS VERDICT IS
# READ, never by byte length. A patch that no longer applies reads exactly
# like a gate that does not hold.
# ⛔ A KNOWN-NEGATIVE MUST SURVIVE, or a clean sweep proves nothing.
# ⛔ NOTHING HERE WRITES INTO THE REPO — the mutants are strings, imported out
# of a temporary directory, and this file's own hash is checked before and
# after.

SHAPE_MUTATIONS = (
    # 1. the ending gate stops seeing an imperative aimed at her.
    ("ends_by_instructing stops seeing an imperative",
     "    first = re.match(r\"([a-z']+)\", bare)\n"
     "    if first and first.group(1) in INSTRUCTING_VERBS:\n"
     "        return True",
     "    first = re.match(r\"([a-z']+)\", bare)\n"
     "    if first and first.group(1) in INSTRUCTING_VERBS and False:\n"
     "        return True"),
    # 2. the ending gate stops seeing homework wearing a question mark —
    #    D-11's boundary, and the half a word list cannot reach.
    ("ends_by_instructing stops seeing a task inside a question",
     "        if TASK_QUESTION_FRAME.search(closing):\n            return True",
     "        if TASK_QUESTION_FRAME.search(closing) and False:\n"
     "            return True"),
    # 3. the ending gate turns into a reject-everything, which would throw
    #    away the legal wondering question she ruled for.
    ("ends_by_instructing rejects everything",
     "    closing = _closing_sentence(example)\n    if not closing:\n"
     "        return False",
     "    closing = _closing_sentence(example)\n    return True\n"
     "    if not closing:\n        return False"),
    # 4. the opening gate stops seeing a tally — her own word for the defect.
    ("opens_by_tallying stops seeing a counted occurrence",
     "    if TALLY_VERB.search(opening):\n        return True\n"
     "    return bool(COUNTED_OCCURRENCES.search(opening))",
     "    if TALLY_VERB.search(opening):\n        return True\n"
     "    return False"),
)

# ⛔ THE KNOWN-NEGATIVE: a comment, nothing else. The hash moves, the
# behaviour does not, and it MUST survive.
SHAPE_KNOWN_NEGATIVE = (
    "a comment above the wondering frame (must SURVIVE)",
    # ⚠ BUILT FROM PIECES, NEVER WRITTEN WHOLE. A patch spelled out as one
    # literal would MATCH ITS OWN DECLARATION in this file, the count would be
    # two, and the known-negative would report "no longer applies" for ever —
    # which is the same trap the mutations above avoid by carrying escaped
    # newlines. Driven: written whole, it did exactly that.
    "WONDERING_FRAME" + " = re.compile(",
    "# (known-negative: this comment is the whole mutation)\n"
    "WONDERING_FRAME" + " = re.compile(")


def _load_shape_mutant(source, tag):
    tmp = tempfile.mkdtemp(prefix="studyroom-shape-drill-")
    path = os.path.join(tmp, "shape_mutant_%s.py" % tag)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(source)
    spec = importlib.util.spec_from_file_location(
        "shape_mutant_%s" % tag, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    shutil.rmtree(tmp, ignore_errors=True)
    return module


def shape_probe(module):
    """The claims this file's two predicates make, run against ONE module.
    Returns the name of the step that failed, or None.

    ⛔ ORDERED SO DIFFERENT DEFECTS DIE ON DIFFERENT STEPS."""
    try:
        if module.ends_by_instructing(module.D11_LEGAL_WONDERING):
            return "a legal wondering question was rejected"
        if module.ends_by_instructing(module.CLEAN_ENDS_ON_HER_LINE):
            return "an ending on a line of hers was rejected"
        if not module.ends_by_instructing(
                module.PLANTED_ENDS_BY_INSTRUCTING):
            return "a planted instructing ending was not caught"
        if not module.ends_by_instructing(module.D11_ILLEGAL_HOMEWORK):
            return "homework wearing a question mark was not caught"
        if not module.opens_by_tallying(module.PLANTED_OPENS_BY_TALLYING):
            return "a planted tallying opening was not caught"
        if module.opens_by_tallying(
                module.CLEAN_OPENS_WITH_SOMETHING_HAPPENING):
            return "an opening she chose was rejected"
    except Exception:                              # noqa: BLE001 — the point
        return "raised"
    return None


def run_shape_drill():
    """Plant every mutation, read every verdict, report BY VALUE."""
    real = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "test_reflection_shape.py")
    with open(real, encoding="utf-8") as handle:
        pristine = handle.read()
    before = hashlib.sha256(pristine.encode("utf-8")).hexdigest()
    caught = 0
    survived = []
    steps = []
    problems = []
    for index, (name, find, replace) in enumerate(SHAPE_MUTATIONS):
        if pristine.count(find) != 1:
            problems.append("MUTATION DID NOT APPLY: %r — its patch matches "
                            "%d times, so its verdict would be a lie"
                            % (name, pristine.count(find)))
            continue
        mutated = pristine.replace(find, replace, 1)
        if hashlib.sha256(mutated.encode("utf-8")).hexdigest() == before:
            problems.append("MUTATION DID NOT CHANGE THE FILE: %r" % (name,))
            continue
        step = shape_probe(_load_shape_mutant(mutated, "m%d" % index))
        if step is None:
            survived.append(name)
        else:
            caught += 1
            steps.append(step)
    kn_name, kn_find, kn_replace = SHAPE_KNOWN_NEGATIVE
    kn_ok = False
    if pristine.count(kn_find) == 1:
        kn_mutated = pristine.replace(kn_find, kn_replace, 1)
        if hashlib.sha256(kn_mutated.encode("utf-8")).hexdigest() != before:
            kn_ok = shape_probe(_load_shape_mutant(kn_mutated, "kn")) is None
            if not kn_ok:
                problems.append("THE KNOWN-NEGATIVE WAS CAUGHT: %r — the "
                                "probe fails on something other than "
                                "behaviour" % (kn_name,))
        else:
            problems.append("the known-negative did not change the file")
    else:
        problems.append("the known-negative's patch no longer applies")
    if len(set(steps)) != len(steps):
        problems.append("two mutants died on the SAME assertion (%s)"
                        % ", ".join(sorted(steps)))
    with open(real, encoding="utf-8") as handle:
        after = hashlib.sha256(handle.read().encode("utf-8")).hexdigest()
    if after != before:
        problems.append("THIS FILE CHANGED DURING THE DRILL")
    for line in problems:
        print("DRILL PROBLEM: " + line)
    return (caught, survived, steps,
            caught == len(SHAPE_MUTATIONS) and not survived and kn_ok
            and not problems)


def main():
    # ⚠ 26.995-07: BOTH classes, loaded BY NAME. A runner that silently kept
    # loading one class while a second was added would report a cheerful
    # case count for half the suite — which is the vacuous-green shape this
    # file's own docstring is about, one level up.
    classes = (ReflectionShapeStaticGateTest, CanonicalExamplesTest,
               VaultRitualTest)
    if len(classes) != 3:
        print("CLASS COUNT MISMATCH: %d loaded, 3 declared — a runner that "
              "quietly stopped loading a class would report a cheerful case "
              "count for part of the suite" % len(classes))
        return 1
    suite = unittest.TestSuite(
        unittest.defaultTestLoader.loadTestsFromTestCase(cls)
        for cls in classes)
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    caught, survived, steps, drill_ok = run_shape_drill()
    print("CASES %d" % ran)
    print("DRILL %d/%d mutations caught, %d known-negative survived, "
          "%d distinct assertions"
          % (caught, len(SHAPE_MUTATIONS), 1 if drill_ok else 0,
             len(set(steps))))
    if survived:
        print("DRILL SURVIVORS: " + ", ".join(survived))
    print("DRIVEN %d shipped sources scanned, %d fixtures judged, "
          "%d example copies compared"
          % (DRIVEN["files_scanned"], DRIVEN["fixtures_judged"],
             DRIVEN["examples_compared"]))
    if ran != EXPECTED_CASES:
        print("CASE COUNT MISMATCH: ran %d, file says %d"
              % (ran, EXPECTED_CASES))
    drove = (DRIVEN["files_scanned"] > 0 and DRIVEN["fixtures_judged"] > 0
             and DRIVEN["examples_compared"] > 0)
    if not drove:
        print("DRIVE MISMATCH: %d sources, %d fixtures, %d copies — a suite "
              "that examined nothing must not pass"
              % (DRIVEN["files_scanned"], DRIVEN["fixtures_judged"],
                 DRIVEN["examples_compared"]))
    if not result.wasSuccessful() or ran != EXPECTED_CASES or not drove \
            or not drill_ok:
        return 1
    print("test_reflection_shape OK (no length-variance gate anywhere in the "
          "app; two example predicates authored at wave 1 with the shipped "
          "prompt unread, now run over the shipped three; one canonical "
          "text, two declared consumers, byte-equal after normalisation)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
