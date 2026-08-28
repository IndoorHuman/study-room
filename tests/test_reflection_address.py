#!/usr/bin/env python3
"""
The address-floor suite (Phase 26.995, Plan 03 — D-03/D-18, SRM-13).

WHAT IS UNDER TEST.

  (a) `server.count_address_words` — how many ADDRESS WORDS a draft carries.
      A count, in words. The NUMERATOR.

  (b) `server.count_draft_words` — how long a draft is, in words. The
      DENOMINATOR.

  (c) `server.address_density_verdict` — the two counts against the owner's
      floor, answering "pass" / "below_floor" / "abstain".

  (d) the rejection these produce inside `server.validate_reflection`.

      ⛔ THE LIST BELOW IS PARSED OUT OF THIS DOCSTRING AND CHECKED AGAINST
      THE SHIPPED SCREEN, by
      `test_every_rejection_token_this_docstring_claims_can_be_returned`.
      A name written here that `validate_reflection` cannot return goes RED
      and names itself. ⛔ Do NOT hand-retype a shorter list when this rots —
      re-typing is how the previous claim drifted in the first place. Add or
      remove a name here and let the case judge it.

      COVERED-REJECTIONS: address_floor gives_advice hands_a_task judge_unreachable

      ⛔⛔ AND THE ABSENCE THAT STOOD HERE IS CLOSED — 2026-08-21, BY HER
      RULING, and the record of what it was is kept rather than tidied away.
      For two days this file named `gives_advice` and `hands_a_task` here
      while NEITHER SCREEN EXISTED and neither token appeared anywhere in
      `server.py`. 26.995-03 task 4 had HALTED rather than ship a word list —
      correctly: the best honest non-model mechanism scored 8/8 on the
      fixtures it was fitted to and 3/5 held out, wrong in BOTH directions,
      and it rejected a legal soft forward move that is literally the second
      half of its own reject fixture.

      ⛔ She was asked among three options — a build-time assertion over the
      prompt constant, a model-in-the-loop judge at one paid call per draft,
      or not at all — and ruled, verbatim: *"The model judges each one"*
      (26.995-COPY.md § C-4 continuation beat 3). Both costs were named to
      her first, including the permanent new row on the standing per-job list
      and the two sentences of hers it owes. In the same sitting she defined
      the rule at its WIDE reading, verbatim: *"Any ending that points you
      toward doing something is out, gentle or not."*

      ⛔ SO THE THREE NAMES ABOVE ARE NOW CLAIMS OF PRESENCE, and the case
      below checks all three against the shipped screen's own return
      statements. ⛔ NO KEYWORD GREP SHIPPED and none may: a pattern would
      pass these same eight fixtures and be pinned as correct.

      ⚠ RECORDING AN ABSENCE IS NOT THE SAME AS CLAIMING A PRESENCE, and
      this file's whole failure was the second wearing the first's clothes.
      The line above is now the first, checked.

      ⬜ WHAT THE SUITE STILL CANNOT SEE, STATED PLAINLY RATHER THAN BURIED.
      The screen is a MODEL CALL. Every case here drives the screen — that
      all four fixtures reach the judge whole, that a verdict becomes the
      right disposition, that an unusable answer rejects rather than passing
      — with verdicts scripted by CALL ORDER so a stub can never quietly
      become a test of itself reading its own fixtures. ⛔ NOTHING HERE
      CHECKS THE JUDGEMENT. Whether a real model calls her four fixtures the
      way she would is not assertable in this repo, is not asserted, and is
      not claimed. That is the honest description of what shipped.


WHY THIS FILE EXISTS.

D-03 names the ONE guarantee that survives the loosening: **a reflection must
be written TO her**, and a failure means *write it again, never refuse*.
⛔ RESEARCH verified two ways — by reading `validate_reflection` end to end and
by exhaustive grep — that NO address, density, second-person or "you"-count
check existed anywhere in the shipped code. D-18 reads as a *loosening* only
because ticket #18 had SPECIFIED a two-part check that was never implemented.
This is a net-new build.

⛔ DENSITY FLOOR ONLY. THE FIRST-"YOU" POSITION TEST IS DELETED, NOT BUILT.
D-18 supersedes #18's "check both": the position test would have binned the
reflection she picked (her pair-3 choice first says "you" at word 178) and
passed the one she rejected (word 4). There is no onset test, no
first-occurrence index and no position measure here or anywhere, and one case
below exists purely to prove a late first address passes.

THE OWNER'S NUMBER, AND THE COSTS THAT COME WITH IT (26.995-COPY § C-9,
re-ruled 2026-08-19):

  floor: 0.30 address words per 100 words

⛔⛔ THIS SUPERSEDES 0.20, AND THE OLD NUMBER STAYS LEGIBLE HERE ON PURPOSE.
Earlier the same day she set 0.20, on a FALSE DESCRIPTION of what it does:
§ C-9's cost 3 told her "#102's turn-away arm at 0.295 fails a floor of 0.20",
which is arithmetically wrong — 0.295 is ABOVE 0.20 and passed. The claim had
been true against the previously ruled ~0.3 and was carried across unchanged
when the number moved. Shown the corrected table she moved it back, verbatim:

  "Back to ~0.3, as first ruled"

⬜ THE PART THAT IS NOT HERS: "~0.3" was resolved to 0.30 BY AN AGENT. 0.30 is
the smallest value that catches the 0.295 turn-away arm — the case the floor
exists for and her whole reason for moving the number. She may correct it.

  1. ⛔ The gap to the case it was built for is 0.005 (0.30 against 0.295), and
     to the deliberately-bad impostor arm 0.12. THIS IS NOT A FINE INSTRUMENT
     and must never be described as one. D-03's own words hold: a floor
     against ONE failure mode, gameable, and NEVER evidence that the writing
     is warm.
  2. ⛔ The Chinese miscount is ACCEPTED, not fixed. She chose the word unit
     knowing it counts a whole Chinese sentence as one word or none. Where the
     denominator is unreliable the check ABSTAINS — it never rejects. A false
     rejection there would rewrite good writing on a meaningless ratio, and
     *write it again* costs a paid call.
  3. The three deliberately-bad fixtures measure 2.99-6.32 — HIGHER than every
     real reflection the room has ever produced. Density does not separate
     good writing from bad and never did.
  4. ⛔⛔ THE COST SHE WAS SHOWN WAS OVERSTATED, AND THE CORRECTION IS KEPT
     BESIDE IT (ledger 101, corrected 26.995-25). She was told 0.30 "also
     rejects TWO samples that are genuinely fine — the seeded fragments
     example at 0.23 and the lowest of twelve archived generations at 0.28".
     ⛔ THE FIRST HALF WAS FALSE: re-derived from the shipped example by this
     file's own re-derivation case, the fragments example measures 3.61 and PASSES. The real cost is ONE sample — the archived
     lowest, at 0.28 — written a second time, and NOT ONE
     sample she accepted falls below this floor. ⛔ The error ran in HER
     FAVOUR; shown the corrected table on 2026-08-21 she HELD the number.
     An agent may still not shave it.

THE ANTI-MIRROR RULE THIS FILE IS WRITTEN UNDER.

⛔ Every count asserted here is HAND-COMPUTED IN THIS FILE, as a literal, from
arithmetic this file states. The production counter is never used to produce a
number this file then asserts against — a test that measures with the
instrument it is measuring pins the defect as correct, which is this project's
signature defect. D-35 makes it a standing requirement of this phase: a
per-100-words finding on this map was ALREADY once a denominator artifact, so
the numerator is asserted on its own, before any ratio is checked at all.

⛔⛔ WHAT THE SECOND READ COSTS, STATED BY VALUE RATHER THAN LEFT TO BE
DISCOVERED (26.995-25, and it is a SPEND she has not been shown). The judging
job's row is `good-cloud`, `max_tokens` 600, `retries` 2, `permitted_local`
True. Driven through the shipped forecast on her own answering pair rather
than multiplied by hand:

  a sitting's reflection ceiling      40 cents   (2 calls x 8,000 tokens)
  the judging calls it can now make    3 cents   (2 calls x 600 tokens)
  so a sitting's TRUE ceiling         43 cents

⚠ AND THE ROOM STILL SAYS 40. The one money sentence she reads bounds the
REFLECTION job alone, so from this change it under-states a sitting by 3 cents
— about 7.5%. ⛔ THAT WAS NOT FIXED HERE AND MUST NOT BE FIXED QUIETLY: the
figure reaches her inside a sentence that is HERS, applied byte-for-byte, and
moving what she reads is her call and not an agent's. It is recorded as owed
to her in `26.995-OWED-TO-OWNER.md` and joins the one wording sitting.

WHAT IT NEVER TOUCHES. No real HOME. No API key. No live model call, of any
provider, ever. No network. No write of any kind. Stdlib only (unittest) — the
zero-dependency law (D-01/D-03). ⚠ The mutation drill at the foot of this file
IMPORTS mutated copies of `server.py` out of a temporary directory; it writes
nothing into the repo and asserts the shipped file's hash before and after.
"""
import ast
import hashlib
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile
import unittest

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

import librarian_call  # noqa: E402
import server  # noqa: E402


# ---------------------------------------------------------------------------
# ---- what this run actually examined, so `main` can state it BY VALUE -----
#
# The house idiom (tests/test_job_disclosure.py): a suite states what it
# EXAMINED, so a run that examined nothing FAILS instead of printing a
# cheerful line. Both numbers are facts about this SUITE's coverage, never
# facts about the product.
EXPECTED_CASES = 19

# ⛔⛔ `endings_judged` STOOD HERE AND WAS INCREMENTED NOWHERE. `main()` gated
# on `drafts_measured` alone, so every run printed "0 endings judged" beside a
# cheerful pass — a DEAD KEY IS A FALSE COVERAGE CLAIM, not an untidy line.
# It is DELETED rather than fed, because feeding a counter from a case that
# does not exercise what the counter names turns a dead number into a lying
# one, which is worse. ⚠ WHAT IT CLAIMED TO COVER — whether a reflection's
# ENDING is judged — IS NOT COVERED BY THIS SUITE AND NEVER WAS. It is
# covered elsewhere, and only in part: `ends_by_instructing` in
# tests/test_reflection_shape.py judges the endings OF THE THREE SHIPPED
# EXAMPLES (and of planted mutants), which is a build-time gate over the
# prompt's examples. There is no runtime ending screen over a generated
# reflection anywhere in the app — see item (d) of the docstring above.
#
# `rejection_tokens_checked` replaces it and is genuinely driven, by the
# coverage case. `main()` now requires EVERY key here to be non-zero, so the
# next dead key fails the run instead of printing a zero through it.
DRIVEN = {"drafts_measured": 0, "rejection_tokens_checked": 0,
          "endings_judged": 0}


# ---------------------------------------------------------------------------
# ---- the hand-built drafts -------------------------------------------------
#
# ⛔ EVERY COUNT BELOW IS HAND-COMPUTED AND STATED, never measured by the code
# under test. The construction is deliberately arithmetic rather than literary:
# one ten-word segment repeated one hundred times is a draft of EXACTLY 1,000
# words, and swapping a segment for another ten-word segment holding one
# address word moves the numerator by EXACTLY one while leaving the
# denominator untouched. That is what makes "one address word below the floor"
# an assertable fact rather than an estimate.

# 10 words, hand-counted:  the(1) kettle(2) had(3) gone(4) cold(5) and(6)
#                          the(7) lamp(8) was(9) still(10).  ZERO address
#                          words.
_TEN = "the kettle had gone cold and the lamp was still"

# 10 words, hand-counted:  you(1) had(2) left(3) the(4) kettle(5) cold(6)
#                          and(7) the(8) lamp(9) still(10).  ONE address word.
_TEN_WITH_YOU = "you had left the kettle cold and the lamp still"

# 10 words, hand-counted:  the(1) kettle(2) had(3) gone(4) cold(5) and(6)
#                          left(7) you(8) there(9) alone(10).  ONE address
#                          word, AT POSITION 8 OF THE SEGMENT.
_TEN_WITH_YOU_AT_8 = "the kettle had gone cold and left you there alone"

SEGMENTS_PER_DRAFT = 100
WORDS_PER_SEGMENT = 10
# 100 x 10 = 1,000 words. Stated as arithmetic so the literal below is
# checkable by eye and never by the counter.
WORDS_PER_DRAFT = 1000


def _draft(**swaps):
    """A 1,000-word draft: `_TEN` one hundred times, with the given
    zero-based segment indexes swapped for another TEN-WORD segment.

    Because every segment is ten words, the denominator is 1,000 whatever is
    swapped in — which is the whole point of building the fixtures this way."""
    segments = [_TEN] * SEGMENTS_PER_DRAFT
    for index, text in swaps.items():
        segments[int(index.lstrip("s"))] = text
    return ". ".join(segments) + "."


def _draft_of(segment_count, address_segments):
    """The same construction at any length: `segment_count` ten-word segments,
    the FIRST `address_segments` of them carrying exactly one address word.

    Denominator = segment_count x 10, numerator = address_segments. Both are
    arithmetic this file states, never a number the counter produced."""
    segments = [_TEN_WITH_YOU] * address_segments
    segments += [_TEN] * (segment_count - address_segments)
    return ". ".join(segments) + "."


# ---------------------------------------------------------------------------
# ---- #102's turn-away arm, at the density it was measured at ---------------
#
# ⛔ THE ONE CASE THIS FLOOR EXISTS FOR. #102's rejected memory arm — the
# writing turning away from her altogether — measured 0.295 address words per
# 100 words (26.995-COPY § C-9; tests/fixtures/26.995-address-calibration.json,
# `ticket_102_turn_away`). This reconstructs that DENSITY exactly, from
# arithmetic, so the arm's verdict is a driven fact and not a table entry:
#
#     0.295 per 100 words  =  59 / 20,000  =  2,000 segments x 10 words,
#                             59 of them carrying one address word each.
#
# ⚠ It is a DENSITY reconstruction, never her writing: not one word of #102's
# arm is in this file, and none is needed — the floor reads a ratio and
# nothing else.
#
# ⛔ AND A CONSTRAINT FOUND BY DRIVING IT, RECORDED RATHER THAN FUDGED. 59/20000
# is already in lowest terms (59 is prime), so EXACTLY 0.295 cannot be built in
# fewer than 20,000 words — about 102,000 characters, four times
# `LIBRARIAN_REFLECTION_CEILING` (26,240). So this arm is refused by the
# validator on `length_ceiling` before the address check is ever reached, and
# it therefore drives `address_density_verdict` — THE FLOOR ITSELF — rather
# than the whole validator. The end-to-end arm is `AT_THE_SUPERSEDED_FLOOR`,
# which is short. ⚠ The extra length is an artifact of expressing the ratio
# exactly; #102's real arm was of ordinary length. The alternative was to round
# 0.295 to something expressible in a short draft, which would have made the
# case's own name false.
TURN_AWAY_SEGMENTS = 2000
TURN_AWAY_WORDS = 20000              # 2,000 x 10, stated as arithmetic
TURN_AWAY_ADDRESS_WORDS = 59         # 59 / 20,000 x 100 = 0.295
TURN_AWAY_RATIO = 0.295
# the same ratio spelled as an integer over 100,000 words, for the same reason
# the floor itself is: 0.295 is not representable in binary either.
TURN_AWAY_RATIO_PER_100K = 295
TURN_AWAY_ARM = _draft_of(TURN_AWAY_SEGMENTS, TURN_AWAY_ADDRESS_WORDS)

# ⚠ THE CONTROL ARM, one address word higher and nothing else changed:
# 60 / 20,000 x 100 = 0.300 — EXACTLY the floor, so it passes. Without it, a
# check that rejected everything of this length would look like a check that
# caught the turn-away.
JUST_ON_FLOOR_AT_LENGTH = _draft_of(TURN_AWAY_SEGMENTS,
                                    TURN_AWAY_ADDRESS_WORDS + 1)


# 2 address words in 1,000 words = 0.20 per 100 -> BELOW the floor of 0.30.
# ⛔ AND THIS IS EXACTLY THE SUPERSEDED FLOOR, which is why it is the sharpest
# end-to-end pin available on her re-ruling: this draft sat EXACTLY ON the
# floor an hour ago and passed the whole validator; it must be refused now.
BELOW_FLOOR = _draft(s40=_TEN_WITH_YOU, s70=_TEN_WITH_YOU)
AT_THE_SUPERSEDED_FLOOR = BELOW_FLOOR       # the same draft, named for what
                                            # it proves about the old number

# 3 address words in 1,000 words = 0.30 per 100 -> EXACTLY ON the floor.
# ⚠ These two drafts differ by ONE address word and nothing else, which is
# what makes the inclusive boundary assertable rather than asserted.
ON_FLOOR = _draft(s40=_TEN_WITH_YOU, s70=_TEN_WITH_YOU, s90=_TEN_WITH_YOU)

# 3 address words in 1,000 words, the FIRST of them at word 178:
# segment 18 is the 18th ten-word block, so its 8th word is word
# 17 x 10 + 8 = 178. Hand-computed; nothing measures it.
FIRST_ADDRESS_AT_WORD = 178
LATE_FIRST_ADDRESS = _draft(s17=_TEN_WITH_YOU_AT_8, s70=_TEN_WITH_YOU,
                            s90=_TEN_WITH_YOU)

# ⚠ HER WRITING, IN THE UNIT THAT CANNOT COUNT IT. The word rule sees two
# English words here and no address word at all, so the ratio would read 0.00
# and REJECT — a false failure on a meaningless denominator. The check must
# ABSTAIN instead. (26.995-COPY § C-9 cost 2: the miscount is accepted, not
# fixed; the conservative branch is what stops it costing her a paid rewrite.)
CJK_DRAFT = ("今晚的灯还亮着。水壶已经凉了，像上周那样。"
             "那一页写得很慢，只有 the loom 两个字是英文的。")
CJK_ENGLISH_WORDS = 2
CJK_ADDRESS_WORDS = 0


# The tracked calibration this floor rests on — counts and ratios only, and
# no word of hers anywhere in it. Outside `librarian/`, so it does not touch
# the public-staging corpus pin.
CALIBRATION_PATH = os.path.join(_REPO_ROOT, "tests", "fixtures",
                                "26.995-address-calibration.json")


# ---------------------------------------------------------------------------
# ---- the SHIPPED examples, and the ONE parser that already reads them ------
#
# ⛔⛔ WHY THIS SECTION EXISTS AT ALL (26.995-20, VERIFICATION gap 7). The
# calibration below recorded the seeded fragments shape at 0.23 and called its
# rejection a cost the owner knowingly accepted. THE SHIPPED EXAMPLE MEASURES
# 3.61 AND PASSES. The calibration was written at plan 03, FOUR PLANS BEFORE
# plan 07 wrote the examples, and nothing ever reconciled the two — because the
# only case guarding it asserted `ratio < floor` against THE FIXTURE'S OWN
# RECORDED RATIO. That passes on the stale value and would pass on ANY stale
# value: a test reading a number back out of the file it is checking is not a
# measurement, it is a mirror, and a mirror pins the defect as correct.
#
# ⛔ THE FIX IS NOT A BETTER NUMBER IN THE FIXTURE. A corrected constant checked
# against itself is the same defect with a nicer value, and it rots again the
# next time the shipped text moves. The cases below RE-DERIVE each ratio from
# `docs/reflection-examples.md` with the shipped counters, so a stale recorded
# value FAILS and names both numbers.
#
# ⛔ AND THE DELIMITER CONTRACT IS NOT RE-IMPLEMENTED HERE. `===EXAMPLE===`,
# its pairing rule and its refusal to guess at an unpaired marker are declared
# ONCE, in tests/test_reflection_shape.py, which is the gate that owns the
# examples. A second reader would be a second contract, and two readers of one
# fence is how a copy drifts behind a green run. It is loaded by path rather
# than imported by name because this suite is run BOTH ways — as
# `python3 tests/test_reflection_address.py` and as
# `python3 -m unittest tests.test_reflection_address` — and only a path is true
# under both.
SHIPPED_EXAMPLES_PATH = os.path.join(_REPO_ROOT, "docs",
                                     "reflection-examples.md")
_SHAPE_SUITE_PATH = os.path.join(_REPO_ROOT, "tests",
                                 "test_reflection_shape.py")


class ContractUnreadable(AssertionError):
    """Raised when the shared example contract, or the shipped screen, cannot
    be read at all.

    ⛔ LOUD ON PURPOSE. A lift that quietly returned nothing would make every
    assertion below trivially true, which is the exact shape of failure this
    plan exists to remove. A check that could not run must say so, in words
    that read nothing like "it passed"."""


def _load_example_contract():
    """`examples_in` as the shape suite declares it — never a second copy."""
    try:
        spec = importlib.util.spec_from_file_location(
            "_reflection_example_contract", _SHAPE_SUITE_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    except Exception as exc:                  # noqa: BLE001 — the point
        raise ContractUnreadable(
            "the example delimiter contract could not be loaded from %s (%r) "
            "— the shipped examples cannot be parsed, and a comparison that "
            "could not happen must FAIL rather than report agreement"
            % (_SHAPE_SUITE_PATH, exc))
    return module.examples_in, module.EXAMPLE_DELIMITER


examples_in, EXAMPLE_DELIMITER = _load_example_contract()


def shipped_examples():
    """The three examples LIFTED from the canonical document, in order."""
    try:
        with open(SHIPPED_EXAMPLES_PATH, encoding="utf-8") as handle:
            found = examples_in(handle.read())
    except OSError as exc:
        raise ContractUnreadable(
            "%s could not be read (%s)" % (SHIPPED_EXAMPLES_PATH, exc))
    if not found:
        raise ContractUnreadable(
            "no example is fenced by %r in %s — an empty lift makes every "
            "count below trivially true"
            % (EXAMPLE_DELIMITER, SHIPPED_EXAMPLES_PATH))
    return found


# ⛔ THE COUNTS, HAND-COUNTED FROM THE DOCUMENT AND STATED HERE AS LITERALS,
# numerator first (D-35). They are checkable by eye against the three fenced
# examples in `docs/reflection-examples.md`:
#
#   (a) the letter        — "you wrote" · "you meant" · "you explained" ·
#                           "you put them down" · "yours, the librarian"
#                           => FIVE address words, in 107 words.
#   (b) the pieces        — "you decided that" · "you keep a running argument"
#                           · "you wrote in april"  => THREE, in 83 words.
#   (c) the held thing    — "you left a door open" · "the air you wrote about"
#                           · "\"...\" you wrote"     => THREE, in 56 words.
#
# ⚠ (c) WAS 65 WORDS UNTIL 2026-08-24 AND THE CHANGE IS HERS, NOT A DRIFT.
# Its opening sentence used to be "there is a lot in tonight's pile and i am
# staying with one thing in it." — an example that TAUGHT the librarian to
# open by naming the size of the pile. Shown that "over a thousand pieces"
# satisfied the letter of her no-exact-count rule while defeating its spirit,
# she ruled `Cut it entirely`. The opening is now "i am staying with one
# thing tonight.", nine words shorter. ⛔ THE ADDRESS COUNT IS UNCHANGED AT
# THREE — the sentence removed addressed her nowhere, so the numerator this
# file exists to measure did not move; only the denominator did.
#
# ⚠ AND THE THREE PAIRS ARE DISTINCT, which is what makes the index binding
# below safe: if the examples were ever reordered in the document, example 0
# would stop measuring 5/107 and this case would go red rather than silently
# re-binding the calibration row to a different shape.
#
# ⚠ NO SENTENCE OF THE EXAMPLES IS COPIED INTO THIS FILE. The canonical
# document says a re-typed phrase "puts the value in a fourth place"; the
# labels below are shape names, never quotations.
SHIPPED_EXAMPLE_MEASUREMENTS = (
    # (label,           address words, words, verdict)
    ("(a) the letter",              5,   107, "pass"),
    ("(b) the pieces",              3,    83, "pass"),
    ("(c) the held thing",          3,    56, "pass"),
)
EXPECTED_SHIPPED_EXAMPLES = 3

# ⛔ THE BINDING THAT HAS NEVER EXISTED: which calibration row is a record of
# which SHIPPED example. Only one sample in the fixture is a seeded example;
# the rest are ticket arms, archived generations and deliberately-bad
# fixtures, none of which is in the canonical document and none of which can
# therefore be re-derived from it. A name here that the fixture does not carry
# is a failure, not a skip — a binding that silently bound nothing is how the
# 0.23 survived four plans.
CALIBRATION_ROWS_FOR_SHIPPED_EXAMPLES = {
    # the seeded FRAGMENTS shape — a handful of separate pieces — is example
    # (b). This is the row that recorded 0.23 / below_floor.
    "fragments_example_seeded": 1,
}


def _read_text(path, what):
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError as exc:
        raise ContractUnreadable("%s could not be read at %s (%s)"
                                 % (what, path, exc))


def shipped_rejection_tokens():
    """Every rejection token `server.validate_reflection` CAN return, read out
    of the shipped file rather than restated here.

    Text-only, through `ast`: the function's `return` statements are walked
    and the third element of each three-tuple is collected when it is a string
    literal. The success return carries a variable there, so it contributes
    nothing — which is correct, because it rides out with `ok` True and is an
    advisory, not a rejection. Pure; imports nothing, runs nothing."""
    tree = ast.parse(_read_text(os.path.join(_REPO_ROOT, "server.py"),
                                "the shipped screen"))
    tokens = set()
    seen_the_function = False
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef):
            continue
        if node.name != "validate_reflection":
            continue
        seen_the_function = True
        for inner in ast.walk(node):
            if not isinstance(inner, ast.Return):
                continue
            returned = inner.value
            if not isinstance(returned, ast.Tuple) or len(returned.elts) != 3:
                continue
            why = returned.elts[2]
            if isinstance(why, ast.Constant) and isinstance(why.value, str):
                tokens.add(why.value)
    if not seen_the_function:
        raise ContractUnreadable(
            "`validate_reflection` was not found in the shipped server — the "
            "token set could not be read, and a set that could not be read "
            "must never be reported as a set that contained everything asked "
            "of it")
    return tokens


# The one line of this module's own docstring that DECLARES what this suite
# covers, parsed back out and checked against the set above. Prose is what
# drifted; a parsed line cannot drift silently.
COVERAGE_CLAIM_PREFIX = "COVERED-REJECTIONS:"


def docstring_rejection_claims():
    """The rejection tokens THIS FILE'S OWN DOCSTRING claims to cover."""
    for line in (__doc__ or "").splitlines():
        stripped = line.strip()
        if not stripped.startswith(COVERAGE_CLAIM_PREFIX):
            continue
        body = stripped[len(COVERAGE_CLAIM_PREFIX):]
        return [name for name in re.split(r"[,\s]+", body) if name]
    raise ContractUnreadable(
        "this module's docstring carries no %r line — the coverage claim is "
        "back to being unparseable prose, which is exactly the state that let "
        "it name two screens that do not exist"
        % COVERAGE_CLAIM_PREFIX)


def _structured(draft):
    """The reflection envelope `validate_reflection` reads, with nothing in it
    but the draft — no coda, no question, no whys."""
    return {"reflection": draft, "coda": None, "question": None}



# ---------------------------------------------------------------------------
# ---- #17 rows 7 and 8: the four fixtures, and they are HERS ---------------
#
# ⛔⛔ NAMED IN `26.995-VALIDATION.md` § *Per-check red-first protocol*, row
# "C-4 advice / task", and drawn from her own record. ⛔ THEY WERE NOT
# SUBSTITUTED FOR FIXTURES THAT ARE EASIER TO SEPARATE, and the set was not
# narrowed: that is the prohibition 26.995-03 halted under, and the whole
# reason its 8/8 meant nothing.
#
# ⚠ ALL FOUR PASS EVERY OTHER SCREEN IN `validate_reflection` — measured, not
# assumed, and one of the cases below drives exactly that on the planted
# instructing draft. That is what makes this set worth anything: nothing
# already in the room can tell these four apart, so a case that separates them
# is separating them on the new screen and on nothing else.
#
# ⚠ THE TWO ENDINGS DIFFER BY INTENT, NOT BY STRUCTURE, and that is the
# adjacency edge SRM-13 names. "…and let that be enough." is the tail of the
# ILLEGAL fixture; "maybe that's worth holding onto." is LEGAL. No list of
# words separates those, which is why 26.995-03's mechanism rejected the legal
# one and why she was asked again.

# R1 — ENDS BY TELLING HER TO DO SOMETHING (#17 row 7).
PLANTED_ENDS_BY_INSTRUCTING_DRAFT = (
    "the loom sat under the window all week and you walked past it every "
    "day without once sitting down at it. “i keep meaning to,” you "
    "wrote on tuesday, and nothing after that.\n\n"
    "work one row of the pattern tonight and let that be enough.")

# R2 — HANDS HER A TASK, inside a question (#17 row 8). Her own recorded
# shape: homework wearing a question mark is still homework (D-11).
PLANTED_HANDS_A_TASK_DRAFT = (
    "the screwdriver has been on the stairs since the shelf went up in "
    "march, and it is still there. you have stepped round it every day "
    "since, and never once written a word about it.\n\n"
    "what would it take to keep the screwdriver in the drawer by the door?")

# L1 — THE LEGAL SOFT FORM (D-10). ⛔ An unmutated control, never a mutant.
LEGAL_SOFT_FORM = (
    "the balcony chair moved again this month, and nothing in your pages "
    "says you decided that. “i think i am only really honest about the "
    "weather,” you wrote in june, and left it there.\n\n"
    "maybe that's worth holding onto.")

# L2 — THE LEGAL CLOSING QUESTION THAT WONDERS (D-11). Also a control.
LEGAL_WONDERING_QUESTION = (
    "the loom sat under the window all week and you did not put it away, "
    "and the room arranged itself around it the way it does.\n\n"
    "i keep wondering whether it was the loom or the quiet.")

FOUR_FIXTURES = (PLANTED_ENDS_BY_INSTRUCTING_DRAFT,
                 PLANTED_HANDS_A_TASK_DRAFT,
                 LEGAL_SOFT_FORM,
                 LEGAL_WONDERING_QUESTION)

# ⛔ THE SCRIPT IS KEYED TO CALL ORDER, NEVER TO THE TEXT. A stub that read the
# draft and decided from it would be the mirror defect wearing a judge's
# clothes — it would pass whatever the screen did with the answer. This one
# cannot see the draft at all, so what the case below proves is what the
# SCREEN does with a verdict, which is the only half a test in this repo can
# honestly own.
FOUR_VERDICTS = ("gives_advice", "hands_a_task", "clean", "clean")
FOUR_EXPECTED_OK = (False, False, True, True)


class _FakeRouting(object):
    """The frozen answering pair a sitting uses, and nothing else — enough
    for the forecast, which reads a fill and a price and nothing more. ⛔ No
    real key, no real HOME, no network: this object exists so the spend can be
    driven through the shipped function rather than multiplied by hand."""

    fills = {"good-cloud": ("anthropic", "claude-opus-5"),
             "cheap-cloud": ("anthropic", "claude-haiku-4-5"),
             "local": ("ollama", "qwen2.5:7b")}
    bases = {}
    timeouts = {}
    provenance = {}


class ScriptedJudge(object):
    """A judge whose answers were decided before it saw anything.

    Records every draft it was handed, byte-for-byte, so the case can assert
    WHAT reached the judge as well as what came back. `spare` is what is left
    of the script — a leftover verdict means a draft skipped the screen, which
    is a silent hole rather than a visible failure without this."""

    def __init__(self, verdicts):
        self._verdicts = list(verdicts)
        self.seen = []

    def __call__(self, draft):
        self.seen.append(draft)
        return self._verdicts.pop(0)

    @property
    def spare(self):
        return len(self._verdicts)


# ⛔ HER TWO ROOM-WORDS FOR THE JUDGING JOB, PINNED BY VALUE (26.995-COPY.md
# § C-12, 2026-08-21). Both CHOSEN FROM AN OFFERED SET of three candidates
# each, read to her one at a time and hers to take, change or throw out.
# ⛔ THE SENTENCE CARRIES NO FULL STOP. That is how it was quoted to her and
# how she took it; an agent "fixing" the punctuation has overwritten her
# choice. Four of her ruled strings elsewhere in this phase were declared and
# asserted NOWHERE for two days — these two are asserted.
HER_JUDGE_NAME = "Checking the reflection"
HER_JUDGE_SENTENCE = (
    "The reflection gets read one more time before it reaches you, to make "
    "sure it isn't handing you a task")


def shipped_validate_reflection_calls():
    """Every call to `validate_reflection` in the SHIPPED server, as
    (line number, keyword names). Text-only, through `ast`; the definition
    itself is not a call and does not appear."""
    tree = ast.parse(_read_text(os.path.join(_REPO_ROOT, "server.py"),
                                "the shipped screen"))
    calls = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        fn = node.func
        name = getattr(fn, "id", None) or getattr(fn, "attr", None)
        if name != "validate_reflection":
            continue
        calls.append((node.lineno,
                      [kw.arg for kw in node.keywords if kw.arg]))
    return calls


# ---------------------------------------------------------------------------
# ---- THE MUTATION DRILL over the shipped second read (26.995-25) ----------
#
# ⛔⛔ WHY IT EXISTS, IN THIS REPO'S OWN WORDS: a gate never seen fail is not
# evidence. Every case above is green; the question this drill answers is
# whether any of them would go RED if the screen stopped working. It puts the
# defect back, four ways, and requires each one to be caught.
#
# ⛔ EVERY MUTATION IS PROVEN PLANTED BY CONTENT HASH BEFORE ITS VERDICT IS
# READ, never by byte length — a reorder has zero length delta, and this
# project has already nearly lost a real survival that way. A patch that no
# longer applies reads EXACTLY like a gate that does not hold, so a mutation
# whose hash did not move is an ERROR here, not a SURVIVED.
#
# ⛔ A KNOWN-NEGATIVE MUST SURVIVE. Without it a drill that reported
# "everything caught" could simply be a probe that fails on any input at all,
# and 4/4 would mean nothing.
#
# ⛔ AND THE MUTANTS MUST DIE ON DIFFERENT ASSERTIONS. Four arms that all die
# on one assertion are one arm with three decorations; the drill asserts the
# set of catching steps by value.
#
# ⚠ NOTHING HERE WRITES INTO THE REPO. Every mutant is a string held in
# memory, written into a fresh temporary directory, imported from there, and
# thrown away; `server.py` is only ever READ, and its hash is checked before
# and after.

# The exact shipped text each mutation edits. ⛔ Held as literals so a mutation
# that no longer applies FAILS LOUDLY instead of quietly reporting a survival.
_SCREEN_HEAD = '''    if judge is not None:
        verdict = judge(reflection)
        if verdict not in REFLECTION_JUDGE_VERDICTS:
            return False, None, "judge_unreachable"'''
_SCREEN_ADVICE = '''        if verdict == "gives_advice":
            return False, None, "gives_advice"'''

MUTATIONS = (
    # 1. THE SCREEN ACCEPTS AN ILLEGAL DRAFT.
    ("the screen accepts an illegal draft",
     _SCREEN_ADVICE,
     '''        if verdict == "gives_advice" and False:
            return False, None, "gives_advice"'''),
    # 2. THE SCREEN REJECTS A LEGAL ONE.
    ("the screen rejects a legal draft",
     _SCREEN_HEAD,
     _SCREEN_HEAD + '''
        if verdict == "clean":
            return False, None, "hands_a_task"'''),
    # 3. A REJECTION REFUSES INSTEAD OF BEING WRITTEN AGAIN. At this level a
    #    refusal is a RAISE: it never becomes a token, so the worker's
    #    two-attempt loop is never reached and a bad draft becomes a 500
    #    rather than a second writing. D-03 says write it again, never refuse.
    ("a rejection refuses instead of being written again",
     _SCREEN_ADVICE,
     '''        if verdict == "gives_advice":
            raise ValueError("refused")'''),
    # 4. AN UNREACHABLE JUDGE SILENTLY PASSES THE DRAFT — the failure the
    #    fail-closed branch exists to stop.
    ("an unreachable judge silently passes the draft",
     '''        if verdict not in REFLECTION_JUDGE_VERDICTS:
            return False, None, "judge_unreachable"''',
     '''        if verdict not in REFLECTION_JUDGE_VERDICTS:
            verdict = "clean"'''),
)

# ⛔ THE KNOWN-NEGATIVE. A comment reworded inside the screen changes the file
# — the hash moves, so the plant is real — and changes NOTHING the probe can
# see. It MUST survive. If it is ever reported caught, the probe is failing on
# something other than behaviour and every kill above is worthless.
KNOWN_NEGATIVE = (
    "a comment inside the screen reworded (must SURVIVE)",
    "    if judge is not None:\n        verdict = judge(reflection)",
    "    # (known-negative: this comment is the whole mutation)\n"
    "    if judge is not None:\n        verdict = judge(reflection)")


def _load_mutant(source, tag):
    """Import a mutated copy of `server.py` from a temporary directory."""
    tmp = tempfile.mkdtemp(prefix="studyroom-judge-drill-")
    path = os.path.join(tmp, "server_mutant_%s.py" % tag)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(source)
    spec = importlib.util.spec_from_file_location(
        "server_mutant_%s" % tag, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    shutil.rmtree(tmp, ignore_errors=True)
    return module


def probe(module):
    """Run the shipped claims against ONE module and return the name of the
    step that failed, or None when every claim held.

    ⛔ THE STEPS ARE ORDERED SO DIFFERENT DEFECTS DIE ON DIFFERENT ONES. That
    ordering is the point: a drill whose four arms all die on one assertion is
    one arm wearing four hats."""
    judge = ScriptedJudge(FOUR_VERDICTS)
    try:
        outcomes = [module.validate_reflection(
                        _structured(draft), [], [], judge=judge)
                    for draft in FOUR_FIXTURES]
    except Exception:                              # noqa: BLE001 — the point
        return "raised"
    # the two LEGAL controls, first — a screen that rejects good writing dies
    # here and nowhere else.
    for draft, (ok, cleaned, _why) in list(zip(FOUR_FIXTURES, outcomes))[2:]:
        if not ok or cleaned.get("reflection") != draft:
            return "a legal control was rejected"
    if sum(1 for ok, _c, _w in outcomes if not ok) != 2:
        return "the rejected count is not two of four"
    if [why for ok, _c, why in outcomes if not ok] != \
            ["gives_advice", "hands_a_task"]:
        return "a rejection is named as the wrong rule"
    ok, _c, why = module.validate_reflection(
        _structured(LEGAL_SOFT_FORM), [], [],
        judge=ScriptedJudge(("not-a-verdict",)))
    if ok or why != "judge_unreachable":
        return "an unusable verdict did not reject"
    return None

# ---------------------------------------------------------------------------


class AddressFloorTest(unittest.TestCase):

    # -- group 1: the two counters, asserted separately and BY VALUE ---------
    #
    # ⛔ D-35's standing requirement on this phase, and the reason this case
    # comes FIRST: before believing any per-100-words finding here, compute the
    # numerator. #104's whole "address falls on heavy evenings" slope turned
    # out to be a DENOMINATOR ARTIFACT — the absolute count of "you" sat in a
    # narrow band while length tripled. A suite that only ever asserts a ratio
    # cannot tell those two worlds apart.

    def test_the_numerator_and_the_denominator_answer_hand_computed_literals(
            self):
        DRIVEN["drafts_measured"] += 3
        # the denominator: 100 segments x 10 words each, stated above.
        self.assertEqual(server.count_draft_words(BELOW_FLOOR), 1000,
                         "the length counter must answer the hand-computed "
                         "1,000 words — if it does not, every ratio below is "
                         "measuring the counter rather than the draft")
        self.assertEqual(server.count_draft_words(ON_FLOOR), 1000,
                         "swapping a segment for another TEN-word segment "
                         "must leave the denominator alone; that invariance "
                         "is what makes the boundary case a boundary")
        # the numerator, asserted on its own and BEFORE any ratio is taken.
        self.assertEqual(server.count_address_words(BELOW_FLOOR), 2,
                         "two segments carry two address words")
        self.assertEqual(server.count_address_words(ON_FLOOR), 3,
                         "three segments carry three address words — the two "
                         "drafts differ by exactly one address word")
        self.assertEqual(server.count_address_words(_TEN), 0,
                         "the filler segment addresses her nowhere, or the "
                         "arithmetic above is built on sand")

    # -- group 1b: the SHIPPED examples, re-derived not re-read -------------
    #
    # ⛔ THE CASE THIS PLAN EXISTS FOR. Everything below measures the text the
    # room actually ships, with the counters the room actually runs. Nothing
    # here reads a number out of the calibration and calls that a measurement.

    def test_the_three_shipped_examples_measure_what_this_file_hand_counts(
            self):
        """⛔ RE-DERIVED FROM `docs/reflection-examples.md`, NEVER FROM THE
        FIXTURE. The numerator is asserted FIRST and on its own (D-35): a
        per-100-words finding on this map was already once a denominator
        artifact, and a suite that only ever asserts a ratio cannot tell that
        world from this one."""
        found = shipped_examples()
        self.assertEqual(
            len(found), EXPECTED_SHIPPED_EXAMPLES,
            "the canonical document must fence exactly %d examples — a lift "
            "that found a different number is measuring something other than "
            "what the room is shown" % EXPECTED_SHIPPED_EXAMPLES)
        self.assertEqual(len(SHIPPED_EXAMPLE_MEASUREMENTS),
                         EXPECTED_SHIPPED_EXAMPLES)
        for example, (label, address_words, words, verdict) in zip(
                found, SHIPPED_EXAMPLE_MEASUREMENTS):
            DRIVEN["drafts_measured"] += 1
            # THE NUMERATOR, on its own and before any ratio exists.
            self.assertEqual(
                server.count_address_words(example), address_words,
                "%s: the shipped example carries a different number of "
                "address words than this file hand-counted. Either the "
                "example was edited, or the examples were reordered — in "
                "which case every binding below is pointing at the wrong "
                "shape" % label)
            # THE DENOMINATOR, separately.
            self.assertEqual(
                server.count_draft_words(example), words,
                "%s: the shipped example is a different length than this "
                "file hand-counted" % label)
            # and only then the verdict.
            self.assertEqual(
                server.address_density_verdict(example), verdict,
                "%s: the shipped floor gives the shipped example a different "
                "verdict than recorded here" % label)

    def test_every_calibration_row_for_a_shipped_example_re_derives(self):
        """⛔⛔ THE MIRROR, BROKEN. The calibration's guarding case asserts
        `ratio < floor` over the exception list using THE FIXTURE'S OWN
        RECORDED RATIO — it passes on a stale value and would pass on any
        stale value. This case re-derives the ratio from the SHIPPED example
        text with the SHIPPED counters and compares THAT against what the
        fixture wrote down, naming both numbers when they disagree.

        ⚠ The comparison is made at the fixture's own WRITTEN precision, read
        back through `parse_float` so the literal as typed is what governs —
        rounding the shipped measurement to the recorded number of decimals,
        never widening a tolerance until a disagreement fits inside it."""
        self.assertTrue(
            CALIBRATION_ROWS_FOR_SHIPPED_EXAMPLES,
            "no calibration row is bound to a shipped example, so this case "
            "would hold vacuously — which is the state that let a four-plan-"
            "old ratio survive")
        raw = _read_text(CALIBRATION_PATH, "the calibration")
        calibration = json.loads(raw)
        # the SAME file read a second way: every float as the string it was
        # written as, so "0.30" and "0.3" are distinguishable and the recorded
        # precision is a fact rather than a guess.
        as_written = json.loads(raw, parse_float=str)
        found = shipped_examples()
        for name, index in sorted(
                CALIBRATION_ROWS_FOR_SHIPPED_EXAMPLES.items()):
            DRIVEN["drafts_measured"] += 1
            self.assertIn(
                name, calibration["samples"],
                "%s is bound to shipped example %d but the calibration "
                "carries no such row — a binding that binds nothing is worse "
                "than no binding, because it reads as coverage" %
                (name, index))
            self.assertLess(index, len(found))
            example = found[index]
            address_words = server.count_address_words(example)
            words = server.count_draft_words(example)
            self.assertGreater(
                words, 0,
                "%s: the bound example has no countable words, so the "
                "re-derivation below would divide by nothing" % name)
            recorded_as_written = as_written["samples"][name]["ratio"]
            decimals = len(recorded_as_written.partition(".")[2])
            re_derived = round(address_words * 100.0 / words, decimals)
            recorded = calibration["samples"][name]["ratio"]
            self.assertEqual(
                re_derived, recorded,
                "%s records %s address words per 100 words, but the shipped "
                "example it is a record OF measures %s (%d address words in "
                "%d words). ⛔ THE FIXTURE IS THE STALE ONE, NOT THE "
                "MEASUREMENT: re-derive the row from the shipped text and "
                "move every field that moves with it, as a marked correction "
                "beside what the owner was shown — never a quiet overwrite, "
                "and never by widening this comparison"
                % (name, recorded_as_written, re_derived, address_words,
                   words))
            self.assertEqual(
                calibration["samples"][name]["verdict_expected"],
                server.address_density_verdict(example),
                "%s records a verdict the shipped floor does not give the "
                "shipped example" % name)

    # -- group 2: the floor, its number, and its inclusive boundary ----------

    def test_the_floor_is_the_owners_number_in_the_owners_unit(self):
        # ⛔ HER NUMBER, ASSERTED BY VALUE (26.995-COPY § C-9, 2026-08-19). An
        # agent may never pick this threshold, and a later agent may not
        # retune it quietly: a change here is a test failure that names her
        # ruling.
        self.assertEqual(server.LIBRARIAN_ADDRESS_FLOOR, 0.30,
                         "0.30 address words per 100 words — her figure, "
                         "re-ruled 2026-08-19 (\"Back to ~0.3, as first "
                         "ruled\") once she was shown that the 0.20 she had "
                         "just set ADMITTED the 0.295 turn-away arm, contrary "
                         "to what § C-9 told her. ⬜ The resolution of \"~0.3\" "
                         "to 0.30 is an agent's, not hers, and she may "
                         "correct it")
        # The exact-arithmetic spelling and the readable spelling must be THE
        # SAME NUMBER. The comparison runs on integers on purpose (0.20 is not
        # representable in binary, and a float compare would make the
        # inclusive boundary depend on rounding rather than on her ruling).
        self.assertEqual(
            server.LIBRARIAN_ADDRESS_FLOOR_PER_10K / 100.0,
            server.LIBRARIAN_ADDRESS_FLOOR,
            "the integer spelling the comparison uses and the float spelling "
            "a human reads must never drift apart")

    def test_exactly_on_the_floor_passes_and_one_address_word_below_fails(
            self):
        """⛔ THE INCLUSIVE BOUNDARY, WHICH IS A RULING AND NOT A ROUNDING
        (SRM-13). Both sides of the shipped comparison are integers and
        nothing is divided, so a draft landing EXACTLY on the floor passes
        because the owner said so — never because the last bit of a float
        fell one way.

        ⚠ THREE ARMS IN ONE CASE, and the third is an UNMUTATED CONTROL: a
        draft the word unit cannot carry ABSTAINS. Without it, a check that
        answered "below_floor" to everything and a check that answered
        "pass" to everything would each half-pass this case."""
        DRIVEN["drafts_measured"] += 3
        # ⛔ BOTH COUNTS FIRST, AS LITERALS, IN THIS CASE — not borrowed from
        # the case above. The claim in this case's name is that the two
        # drafts differ by EXACTLY ONE ADDRESS WORD AT THE SAME LENGTH, and a
        # case that asserted only the verdicts would be asserting that claim
        # nowhere at all.
        self.assertEqual(server.count_address_words(ON_FLOOR), 3)
        self.assertEqual(server.count_draft_words(ON_FLOOR), WORDS_PER_DRAFT)
        self.assertEqual(server.count_address_words(BELOW_FLOOR), 2)
        self.assertEqual(server.count_draft_words(BELOW_FLOOR),
                         WORDS_PER_DRAFT)
        # 3 / 1000 x 100 = 0.30 -> INCLUSIVE, so it passes.
        self.assertEqual(server.address_density_verdict(ON_FLOOR), "pass",
                         "a draft landing exactly on the floor passes — the "
                         "floor is inclusive, and a boundary that excluded "
                         "its own value would reject writing she approved")
        # 2 / 1000 x 100 = 0.20 -> below (and it is the superseded floor).
        self.assertEqual(server.address_density_verdict(BELOW_FLOOR),
                         "below_floor",
                         "one address word fewer, nothing else changed, and "
                         "the verdict flips — both arms in ONE case so a "
                         "check that passed everything, or rejected "
                         "everything, cannot half-pass")
        # ⚠ THE UNMUTATED CONTROL, in the same case: writing the word unit
        # cannot carry is neither passed nor refused. Not a third verdict for
        # its own sake — it is the arm that proves the two above are a
        # measurement and not a coin with two faces.
        self.assertEqual(server.address_density_verdict(CJK_DRAFT), "abstain",
                         "a draft the denominator cannot carry must ABSTAIN "
                         "— neither of the two verdicts above. She chose the "
                         "word unit knowing it miscounts her Chinese, and a "
                         "rejection on a meaningless ratio would rewrite "
                         "good writing AND pay a second call to do it")

    def test_the_turn_away_arm_the_floor_exists_for_is_rejected(self):
        """⛔ THE PIN ON HER RE-RULING OF 2026-08-19 — *"Back to ~0.3, as first
        ruled"*. #102's turn-away arm measured 0.295, and a floor of 0.20
        ADMITTED it: the one failure mode this check was built for walked
        straight through, and 26.995-COPY § C-9 told her the opposite. At 0.30
        it is REJECTED, which is the whole reason the number moved back.

        ⚠ Both arms live in this one case on purpose. The rejected arm at
        0.295 and the control at 0.300 differ by ONE address word in twenty
        thousand and nothing else, so a check that rejected every long draft
        cannot masquerade as a check that caught the turn-away."""
        DRIVEN["drafts_measured"] += 2
        # the two counts, hand-computed above and asserted BEFORE any ratio.
        self.assertEqual(server.count_draft_words(TURN_AWAY_ARM),
                         TURN_AWAY_WORDS,
                         "2,000 ten-word segments is 20,000 words — the "
                         "denominator is arithmetic this file states")
        self.assertEqual(server.count_address_words(TURN_AWAY_ARM),
                         TURN_AWAY_ADDRESS_WORDS,
                         "59 segments carry one address word each")
        # 59 / 20,000 x 100 = 0.295, stated as integers so the claim in this
        # case's name is checkable by eye and never depends on a float.
        self.assertEqual(TURN_AWAY_ADDRESS_WORDS * 100000,
                         TURN_AWAY_RATIO_PER_100K * TURN_AWAY_WORDS,
                         "the fixture's own ratio arithmetic: 59 address "
                         "words in 20,000 IS 0.295 per 100")
        self.assertEqual(TURN_AWAY_RATIO_PER_100K / 1000.0, TURN_AWAY_RATIO,
                         "and the integer spelling is the same number as the "
                         "readable one")
        self.assertEqual(server.address_density_verdict(TURN_AWAY_ARM),
                         "below_floor",
                         "0.295 must fall BELOW the floor — this is the "
                         "catastrophic turn-away, the single failure mode "
                         "D-03 says the floor is for, and a floor that admits "
                         "it buys nothing")
        # the control: ONE address word more, 60 / 20,000 x 100 = 0.300.
        self.assertEqual(server.count_address_words(JUST_ON_FLOOR_AT_LENGTH),
                         TURN_AWAY_ADDRESS_WORDS + 1)
        self.assertEqual(
            server.address_density_verdict(JUST_ON_FLOOR_AT_LENGTH), "pass",
            "one address word more, nothing else changed, and it passes — the "
            "floor is inclusive and this is a density check, not a size one")
        # ⛔ AND THE STATED CONSTRAINT, ASSERTED SO IT CANNOT ROT INTO A STORY:
        # the exact-0.295 reconstruction really is past the ceiling, so the
        # validator really does name SIZE on it. If a later edit shortens the
        # fixture or raises the ceiling, this goes red and the comment above
        # gets re-read instead of believed.
        self.assertGreater(len(TURN_AWAY_ARM),
                           server.LIBRARIAN_REFLECTION_CEILING,
                           "expressing 0.295 exactly costs 20,000 words, "
                           "which is past the ceiling — that is why the "
                           "end-to-end arm below is a different, short draft")
        ok, _, why = server.validate_reflection(
            _structured(TURN_AWAY_ARM), [], [])
        self.assertFalse(ok)
        self.assertEqual(why, "length_ceiling",
                         "named as the SIZE defect it is; the address check "
                         "deliberately runs after the ceiling so a runaway "
                         "denominator never names the wrong defect")

    def test_a_draft_on_the_superseded_floor_is_refused_end_to_end(self):
        """⛔ THE SUPERSESSION, DRIVEN THROUGH THE WHOLE VALIDATOR. A draft at
        0.20 per 100 words sat EXACTLY ON the floor that shipped an hour ago
        and passed; her re-ruling of 2026-08-19 — *"Back to ~0.3, as first
        ruled"* — refuses it. Short enough to reach the address check, unlike
        the exact-0.295 reconstruction above."""
        DRIVEN["drafts_measured"] += 1
        # 2 / 1,000 x 100 = 0.20 — the superseded floor, hand-computed.
        self.assertEqual(
            server.count_address_words(AT_THE_SUPERSEDED_FLOOR), 2)
        self.assertEqual(
            server.count_draft_words(AT_THE_SUPERSEDED_FLOOR), 1000)
        self.assertLessEqual(len(AT_THE_SUPERSEDED_FLOOR),
                             server.LIBRARIAN_REFLECTION_CEILING,
                             "this arm must reach the address check, or it "
                             "proves nothing about the address floor")
        ok, _, why = server.validate_reflection(
            _structured(AT_THE_SUPERSEDED_FLOOR), [], [])
        self.assertFalse(ok, "0.20 was the floor and is now below it")
        self.assertEqual(why, "address_floor",
                         "refused for turning away from her, and named as "
                         "that — not as length, not as shape")

    # -- group 3: no position test exists, and this is what proves it --------

    def test_a_draft_that_first_addresses_her_at_word_178_passes(self):
        """⛔ D-18 DELETED #18's first-"you" position test, and nothing in this
        phase builds it. HER OWN pair-3 choice first says "you" at word 178;
        the arm she REJECTED said it at word 4. A position test would have
        binned the reflection she picked and passed the one she rejected."""
        DRIVEN["drafts_measured"] += 1
        # hand-computed: segment 18's 8th word is word 17 x 10 + 8 = 178.
        words_before_first_address = 17 * WORDS_PER_SEGMENT + 8
        self.assertEqual(words_before_first_address, FIRST_ADDRESS_AT_WORD,
                         "the fixture's own arithmetic, stated so the claim "
                         "in this case's name is checkable by eye")
        self.assertEqual(server.count_address_words(LATE_FIRST_ADDRESS), 3)
        self.assertEqual(server.count_draft_words(LATE_FIRST_ADDRESS), 1000)
        self.assertEqual(server.address_density_verdict(LATE_FIRST_ADDRESS),
                         "pass",
                         "a late first address is not a defect — it is the "
                         "shape she chose, twice")
        ok, cleaned, why = server.validate_reflection(
            _structured(LATE_FIRST_ADDRESS), [], [])
        self.assertTrue(ok, "and it survives the whole validator: %r" % (why,))
        self.assertIsNone(why)
        self.assertEqual(cleaned["reflection"], LATE_FIRST_ADDRESS,
                         "byte-identical — the validator returns the draft, "
                         "never a rewritten one")

    # -- group 4: the conservative branch — abstain, never reject ------------

    def test_the_check_abstains_where_the_word_rule_cannot_count(self):
        """⛔ 26.995-COPY § C-9, cost 2. She chose the word unit KNOWING it
        miscounts her Chinese. The consequence an agent must implement rather
        than discover: where the denominator is unreliable the check ABSTAINS.
        Rejecting there would rewrite good writing on a meaningless ratio, and
        every rejection pays a second call on her bill.

        ⬜ The abstain branch is the PLAN'S READING of her ruling, not her
        ruling. It is surfaced in the summary so she can correct it."""
        DRIVEN["drafts_measured"] += 1
        # what the word rule actually sees, hand-counted from the fixture:
        # "the" and "loom" — two English words, no address word anywhere.
        self.assertEqual(server.count_draft_words(CJK_DRAFT),
                         CJK_ENGLISH_WORDS,
                         "the word rule finds two countable words in a "
                         "sentence of hers that is plainly not two words long "
                         "— which is the miscount, measured rather than "
                         "asserted")
        self.assertEqual(server.count_address_words(CJK_DRAFT),
                         CJK_ADDRESS_WORDS)
        # 0 / 2 = 0.00, which is below 0.20 — so WITHOUT the abstain branch
        # this draft is a false failure. That is what makes the assertion
        # below non-vacuous.
        self.assertLess(CJK_ADDRESS_WORDS * 10000,
                        server.LIBRARIAN_ADDRESS_FLOOR_PER_10K
                        * CJK_ENGLISH_WORDS,
                        "the ratio really would read below the floor — if it "
                        "would not, this case proves nothing. ⚠ This is the "
                        "EXACT negation of the pass condition the verdict "
                        "uses; an off-by-one slack here would let a draft "
                        "that sits ON the floor masquerade as one the abstain "
                        "branch rescued, and the case would prove nothing "
                        "while looking green")
        self.assertEqual(server.address_density_verdict(CJK_DRAFT), "abstain",
                         "her Chinese writing is not measured and therefore "
                         "not refused")
        ok, _, why = server.validate_reflection(_structured(CJK_DRAFT), [], [])
        self.assertTrue(ok, "and the whole validator lets it through: %r"
                        % (why,))

    # -- group 5: the tracked calibration guards its own property ------------

    def test_the_tracked_calibration_holds_the_floor_it_was_set_against(self):
        """⛔ The floor's provenance, made re-derivable rather than remembered
        (T-26.995-34). The fixture carries the measurements she was shown on
        2026-08-19 before she set the number, so a later agent cannot quietly
        retune a figure the owner set — and so the number can be CHECKED
        instead of re-guessed from a summary that has scrolled away.

        ⚠ This case asserts the fixture's own guarding property, because a
        fixture whose property is only stated in prose is a fixture a later
        edit can hollow out without anything going red."""
        with open(CALIBRATION_PATH, encoding="utf-8") as handle:
            raw = handle.read()
        calibration = json.loads(raw)

        # (a) the four prose keys, by value — the fourth is the one the analog
        # does not have and is law 4 applied to a test fixture.
        self.assertEqual(
            sorted(k for k in calibration if k.startswith("_")),
            ["_convention", "_no_writing_of_hers", "_property", "_why"],
            "the fixture must carry all four prose keys — the one that says "
            "WHY it exists, the one naming the numerator/denominator "
            "convention (D-35), the one stating the property below, and the "
            "one promising no word of hers is in the file")

        # (b) LAW 4, MACHINE-CHECKED: no fragment of her Chinese writing was
        # pasted in. The cheapest available proof, and it is a proof rather
        # than a promise.
        self.assertIsNone(
            re.search(r"[　-〿぀-ヿ一-鿿"
                      r"가-힯＀-￯]", raw),
            "a CJK character appears in the calibration fixture — every value "
            "here must be a count or a ratio, and no writing of hers may be "
            "stored anywhere that only needs numbers")

        # (c) HER NUMBER, in the fixture and in the code, asserted to be THE
        # SAME NUMBER. A calibration that drifted from the constant it
        # calibrates would document a floor the room does not run.
        self.assertEqual(calibration["floor"]["ratio"],
                         server.LIBRARIAN_ADDRESS_FLOOR,
                         "the recorded floor and the shipped floor must never "
                         "drift apart — the fixture exists to make the "
                         "shipped number checkable")
        self.assertEqual(calibration["floor"]["per_10k_integer"],
                         server.LIBRARIAN_ADDRESS_FLOOR_PER_10K)

        # (d) THE GUARDING PROPERTY, driven over every sample rather than
        # asserted about them, and it now has TWO halves because she
        # DELIBERATELY moved the floor above one sample she had accepted.
        #
        # ⛔ THE EXCEPTION IS A LIST OF NAMES, NEVER A RELAXATION. Every
        # accepted sample below the floor must be named in the fixture's
        # `accepted_samples_she_knowingly_gave_up`, which records a decision of
        # hers. Any OTHER accepted sample falling below the floor is still a
        # failure that names itself. ⚠ An agent may not add a name to that
        # list to turn this green — that is her call, not an agent's.
        floor = calibration["floor"]["ratio"]
        samples = calibration["samples"]
        separates = calibration["what_the_floor_separates"]
        given_up = separates["accepted_samples_she_knowingly_gave_up"]
        accepted = {name: row["ratio"] for name, row in samples.items()
                    if isinstance(row, dict) and row.get("accepted_by_owner")}
        self.assertTrue(accepted, "no accepted sample is recorded, so the "
                                  "property below would hold vacuously")
        for name, ratio in sorted(accepted.items()):
            DRIVEN["drafts_measured"] += 1
            if name in given_up:
                # the recorded cost, asserted to BE a cost: a name on that
                # list that is not actually rejected is a stale entry, and a
                # stale entry silently widens the exception.
                self.assertLess(
                    ratio, floor,
                    "%s is recorded as a sample she knowingly gave up, but at "
                    "%s it is not below the floor of %s — the list must "
                    "record real costs only, or it becomes a blanket waiver"
                    % (name, ratio, floor))
                continue
            self.assertGreaterEqual(
                ratio, floor,
                "%s measures %s and she ACCEPTED it, but the floor is %s and "
                "it is NOT on the list of samples she knowingly gave up — a "
                "floor above writing she approved rewrites it and pays a "
                "second call to do so" % (name, ratio, floor))
        self.assertLess(
            samples["impostor_control"]["ratio"], floor,
            "the impostor control must fall below the floor, or the floor "
            "buys nothing at all")
        # ⛔ AND THE CASE THE FLOOR EXISTS FOR, asserted against the RECORDED
        # measurement rather than against a reconstruction: the turn-away arm
        # must fall below the floor. This is the assertion that would have gone
        # red the moment the number was set to 0.20, had it existed then.
        DRIVEN["drafts_measured"] += 1
        self.assertLess(
            samples["ticket_102_turn_away"]["ratio"], floor,
            "#102's turn-away arm is the ONE failure mode D-03 says this floor "
            "is for. A floor that admits it buys nothing — that is exactly "
            "what 0.20 did, and why she moved the number back")

        # (e) AND THE HONEST DESCRIPTION, driven rather than trusted: every
        # sample's recorded verdict must be the verdict the SHIPPED floor
        # actually gives it. ⛔ This is what caught the decision record's own
        # arithmetic — 26.995-COPY § C-9 told her the turn-away arm at 0.295
        # "fails a floor of 0.20", and it does not. The claim was true against
        # the previously ruled ~0.3 and was carried across unchanged when the
        # number moved. The fixture records the correction; this assertion is
        # what stops a comparable slip surviving here.
        for name, row in sorted(samples.items()):
            if not isinstance(row, dict) or "ratio" not in row:
                continue
            DRIVEN["drafts_measured"] += 1
            expected = ("pass" if row["ratio"] >= floor else "below_floor")
            self.assertEqual(
                row["verdict_expected"], expected,
                "%s measures %s against a floor of %s, so the floor gives it "
                "%r — but the fixture records %r. A calibration that misstates "
                "what the floor does is worse than none, because it is the "
                "thing a later reader trusts instead of measuring"
                % (name, row["ratio"], floor, expected,
                   row["verdict_expected"]))

        # (f) the count of what actually fires, by value — the honest headline.
        fires = sorted(name for name, row in samples.items()
                       if isinstance(row, dict) and "ratio" in row
                       and row["ratio"] < floor)
        self.assertEqual(
            fires, calibration["what_the_floor_separates"]
                              ["rejects_at_this_floor"],
            "the fixture's own list of what this floor rejects must be the "
            "list the floor actually rejects")
        self.assertEqual(
            len(fires),
            calibration["what_the_floor_separates"]["rejects_count"],
            "and the count beside it must match the list")

    # -- group 5b: the suite's own coverage claim, checked not asserted -----

    def test_every_rejection_token_this_docstring_claims_can_be_returned(self):
        """⛔ THIS FILE'S DOCSTRING NAMED TWO SCREENS THAT DO NOT EXIST —
        `gives_advice` (#17 row 7) and `hands_a_task` (#17 row 8) — for two
        days, in the item that tells a reader what is under test. Neither
        token appears anywhere in `server.py`; 26.995-03 task 4 halted rather
        than ship a word list and an owner ruling is owed.

        ⛔ THE FIX IS NOT A SHORTER HAND-TYPED LIST. That is what drifted.
        The docstring now carries a PARSEABLE line, and this case reads the
        shipped screen's own return statements and refuses any name the
        screen cannot produce. A future phase that writes a docstring for a
        screen it never built goes red here.

        ⚠ NON-VACUITY IS ASSERTED IN BOTH DIRECTIONS: the extraction must
        find the token this suite drives end-to-end, and it must NOT find an
        invented one. A lift that returned everything would pass any claim,
        and a lift that returned nothing would fail loudly instead of
        agreeing."""
        shipped = shipped_rejection_tokens()
        # (i) the extraction really read the shipped screen: it found the
        # token this file drives end to end two cases above.
        self.assertIn(
            "address_floor", shipped,
            "the token this suite drives through `validate_reflection` is "
            "not in the set lifted from it — the lift is broken, and a "
            "broken lift that reported agreement would make every claim "
            "below trivially true")
        self.assertGreater(
            len(shipped), 1,
            "the shipped screen returns more than one rejection token; a "
            "set of one means the walk stopped early")
        # (ii) and it is not simply answering yes: a name the screen cannot
        # return is absent, which is the property the whole case rests on.
        self.assertNotIn(
            "a_screen_that_was_never_built", shipped,
            "the extraction admits an invented token, so it is not reading "
            "the shipped screen at all")
        claimed = docstring_rejection_claims()
        self.assertTrue(
            claimed,
            "the docstring's coverage line names nothing — a suite that "
            "claims to cover no rejection at all should not be gating one")
        for token in claimed:
            DRIVEN["rejection_tokens_checked"] += 1
            self.assertIn(
                token, shipped,
                "this file's docstring claims to cover %r, and "
                "`server.validate_reflection` CANNOT RETURN IT. The screen is "
                "not built. ⛔ Recording an absence is not the same as "
                "claiming a presence — say in the docstring that it is not "
                "built and where the ruling is owed, rather than naming it "
                "as covered. The shipped screen returns exactly: %s"
                % (token, ", ".join(sorted(shipped))))

    # -- group 6: fail closed, and never raise ------------------------------

    def test_the_counters_fail_closed_on_anything_that_is_not_a_draft(self):
        for bad in (None, 42, [], {}, object(), "", "   ", "\n\t "):
            for name, fn in (("count_address_words",
                              server.count_address_words),
                             ("count_draft_words", server.count_draft_words)):
                try:
                    result = fn(bad)
                except Exception as exc:      # noqa: BLE001 — the point
                    self.fail("%s raised on %r: %r — a counter that raises "
                              "inside validate_reflection turns a bad draft "
                              "into a 500, which is the one thing the "
                              "fail-closed contract forbids"
                              % (name, bad, exc))
                self.assertEqual(result, 0,
                                 "%s must answer 0 on %r" % (name, bad))
            try:
                verdict = server.address_density_verdict(bad)
            except Exception as exc:          # noqa: BLE001
                self.fail("address_density_verdict raised on %r: %r"
                          % (bad, exc))
            self.assertEqual(verdict, "abstain",
                             "nothing to divide by is not a failure to "
                             "address her — it is nothing to measure")

    # -- group 7: #17 rows 7 and 8 — the second read (26.995-25) ------------

    def test_two_planted_drafts_reject_and_two_legal_forms_pass(self):
        """⛔⛔ THE FOUR FIXTURES ARE HERS AND THEY ARE NAMED IN
        `26.995-VALIDATION.md`. Two planted drafts that must reject — one
        ending by telling her to do something, one ending in a question that
        assigns her a chore — and two legal forms that must pass, the soft
        form (D-10) and the closing question that wonders (D-11).

        ⛔ THE REJECTED COUNT IS ASSERTED AS A LITERAL OUT OF FOUR, so a
        mechanism that rejects everything and a mechanism that rejects nothing
        both FAIL rather than half-passing. Both degenerate mechanisms were
        planted in a scratch copy of the shipped screen and both went red;
        the reds are quoted in 26.995-25-SUMMARY.md.

        ⛔⛔ AND THE HONEST LIMIT, WRITTEN WHERE THE NEXT READER MEETS IT
        FIRST. What this case drives is the SCREEN — that all four drafts
        reach the judge whole, that a verdict of hers is turned into the right
        disposition, and that the two legal forms survive byte-identical. It
        does NOT and CANNOT check the judge's JUDGEMENT: the scripted verdicts
        below are keyed to CALL ORDER, never to the text, precisely so this
        case cannot quietly become a test of a stub reading its own fixtures.
        Whether a real model calls these four the way she would is not
        assertable here, or anywhere in this repo, and it is not claimed."""
        DRIVEN["endings_judged"] += len(FOUR_FIXTURES)
        self.assertEqual(len(FOUR_FIXTURES), 4,
                         "four fixtures, two of each kind — a set that "
                         "drifted to three would make the literal below a "
                         "different claim than the one this case's name makes")
        judge = ScriptedJudge(FOUR_VERDICTS)
        # ⛔ ALL FOUR ARE RUN BEFORE ANYTHING IS ASSERTED, SO THE COUNT GETS
        # TO FIRE FIRST. An earlier version asserted each fixture's
        # disposition inside the loop; both degenerate mechanisms then died on
        # THAT arm and the literal below never executed — a belt that has
        # never been seen to hold is decoration, which is this project's
        # signature defect wearing a second belt's clothes. Driven again after
        # the reorder: reject-everything and reject-nothing now both die on
        # the literal, by name.
        outcomes = [server.validate_reflection(
                        _structured(draft), [], [], judge=judge)
                    for draft in FOUR_FIXTURES]
        rejected = sum(1 for ok, _c, _w in outcomes if not ok)
        tokens = [why for ok, _c, why in outcomes if not ok]
        # ⛔ THE LITERAL. Two of four, by value.
        self.assertEqual(
            rejected, 2,
            "exactly two of the four fixtures may be rejected. A mechanism "
            "that rejected all four would be as useless as one that rejected "
            "none, and both would sail past a case that only asserted 'the "
            "bad ones fail'")
        # THEN each fixture, one at a time — the arm that catches a mechanism
        # which rejects the right NUMBER and the wrong TWO.
        for draft, expected_ok, (ok, cleaned, why) in zip(
                FOUR_FIXTURES, FOUR_EXPECTED_OK, outcomes):
            self.assertIs(ok, expected_ok,
                          "the screen disposed of a fixture the wrong way: "
                          "%r" % (why,))
            if ok:
                self.assertEqual(
                    cleaned["reflection"], draft,
                    "a draft the judge called clean must ride out "
                    "byte-identical — the validator returns the writing, "
                    "never a rewritten one")
            else:
                self.assertIsNone(
                    cleaned,
                    "a rejected draft may quote pool text and is never "
                    "carried out of this function")
        # and each rejection is named as the rule it broke, not as a category.
        self.assertEqual(
            tokens, ["gives_advice", "hands_a_task"],
            "#17 row 7 and row 8 are two rules and they are named separately "
            "— a single merged token would make the record unable to say "
            "which of her two rules a draft broke")
        # the judge was asked about ALL FOUR, in order, and about nothing else.
        self.assertEqual(len(judge.seen), 4,
                         "every draft that reaches this screen is judged; a "
                         "screen that judged only the ones it already "
                         "suspected would be the pattern she ruled out")
        self.assertEqual(judge.seen, list(FOUR_FIXTURES),
                         "each draft reached the judge BYTE-IDENTICAL and in "
                         "order — nothing summarised, trimmed or re-wrapped "
                         "on the way")
        self.assertEqual(judge.spare, 0,
                         "the script was consumed exactly — a leftover "
                         "verdict means a draft skipped the judge")

    def test_the_judge_is_handed_her_chinese_exactly_as_she_wrote_it(self):
        """⛔ THE ENCODING EDGE (SRM-13), AND HOW THIS SCREEN INHERITS THE
        UNCOUNTABLE-SCRIPT EXEMPTION: it needs none, because it never counts.

        A boundary-based rule on the neighbouring screen had already nearly
        deleted her Chinese dismissals once — a real topic in that script is
        two characters and the word rule sees one word or none, which is why
        the address floor ABSTAINS there and needs a whole pattern to know
        when to. This screen splits nothing, tokenises nothing and matches
        nothing: the draft rides to the judge byte-for-byte. So her Chinese is
        neither miscounted nor exempted — it is simply read.

        ⚠ THE ARM THAT MAKES THAT NON-VACUOUS is asserted in the same case:
        the address floor really does abstain on this draft, so the two
        screens are shown to be doing DIFFERENT things rather than agreeing
        by accident."""
        DRIVEN["endings_judged"] += 1
        self.assertEqual(server.address_density_verdict(CJK_DRAFT), "abstain",
                         "the neighbouring screen abstains here — that is the "
                         "cost she accepted, and it is what this screen does "
                         "NOT have to do")
        judge = ScriptedJudge(("clean",))
        ok, cleaned, why = server.validate_reflection(
            _structured(CJK_DRAFT), [], [], judge=judge)
        self.assertTrue(ok, "%r" % (why,))
        self.assertEqual(judge.seen, [CJK_DRAFT],
                         "her Chinese reached the judge byte-for-byte — not "
                         "stripped, not normalised, not word-split")
        self.assertEqual(cleaned["reflection"], CJK_DRAFT)

    def test_an_unreachable_judge_rejects_and_never_silently_passes(self):
        """⛔⛔ THE DECISION, WRITTEN INTO THE CODE RATHER THAN LEFT TO FALL
        OUT OF IT. A judge that cannot be reached, or that answers
        off-contract, does not silently pass the draft — that is the whole
        failure this screen exists to stop — and it does not silently kill the
        sitting either: it REJECTS, with its own token, and a rejection joins
        the worker's existing two-attempt loop, which is *write it again,
        never refuse* (D-03, her ruling).

        ⚠ THE PRICE IS STATED RATHER THAN HIDDEN: an unreachable judge costs a
        whole second reflection call. The alternative was to let an unjudged
        draft through, which is the rule not being enforced at all.

        ⚠ FOUR OFF-CONTRACT ANSWERS AND THE CONTROL IN ONE CASE, so a screen
        that rejected on every verdict cannot masquerade as this one."""
        for answer in (None, "", "yes", "CLEAN", 1, {"verdict": "clean"}):
            DRIVEN["endings_judged"] += 1
            ok, cleaned, why = server.validate_reflection(
                _structured(LEGAL_SOFT_FORM), [], [],
                judge=ScriptedJudge((answer,)))
            self.assertFalse(ok, "an unusable verdict %r must not pass the "
                                 "draft" % (answer,))
            self.assertEqual(why, "judge_unreachable")
            self.assertIsNone(cleaned)
        # THE UNMUTATED CONTROL, in the same case: a usable verdict passes.
        DRIVEN["endings_judged"] += 1
        ok, _c, why = server.validate_reflection(
            _structured(LEGAL_SOFT_FORM), [], [],
            judge=ScriptedJudge(("clean",)))
        self.assertTrue(ok, "%r" % (why,))

    def test_no_judge_at_all_leaves_the_other_screens_exactly_as_they_were(
            self):
        """⚠ THE BACK-COMPAT ARM, AND IT IS A HOLE NAMED RATHER THAN HIDDEN.
        `judge` defaults to None and the screen is then skipped — which is
        what keeps roughly seventy existing call sites in four other suites
        reading the way they always did. The hole that opens with it is a
        SHIPPED caller forgetting to hand one over, and the case below closes
        exactly that by reading the shipped file."""
        DRIVEN["endings_judged"] += 1
        ok, cleaned, why = server.validate_reflection(
            _structured(PLANTED_ENDS_BY_INSTRUCTING_DRAFT), [], [])
        self.assertTrue(
            ok, "with no judge handed over, the screen is not run and the "
                "other screens answer exactly as they did before this "
                "existed: %r" % (why,))
        self.assertEqual(cleaned["reflection"],
                         PLANTED_ENDS_BY_INSTRUCTING_DRAFT)

    def test_every_shipped_call_site_hands_the_screen_a_judge(self):
        """⛔ THE HOLE THE DEFAULT OPENS, CLOSED OVER THE SHIPPED SOURCE. The
        screen is only enforced on a caller that hands over a judge, so a
        production call site that forgot one would turn her ruling off
        silently and every suite would stay green. This reads `server.py`'s
        own parse tree and requires EVERY call in it to pass `judge=`.

        ⚠ NON-VACUITY IN BOTH DIRECTIONS, in the same case: the walk must
        FIND the shipped call sites (a walk that found none would agree with
        any claim), and the count is asserted BY VALUE so a third worker
        added later cannot slip past unjudged."""
        calls = shipped_validate_reflection_calls()
        self.assertEqual(
            len(calls), 2,
            "`server.py` calls the screen from the generation worker and the "
            "refine worker, and from nowhere else. A third call site is a "
            "third place her ruling can be turned off by omission, so it "
            "fails here and gets read rather than counted")
        for lineno, keywords in calls:
            self.assertIn(
                "judge", keywords,
                "server.py:%d calls validate_reflection without handing it a "
                "judge, so #17 rows 7 and 8 are not enforced on that path. "
                "⛔ The default of None exists for the test call sites that "
                "predate this screen — never for a shipped one" % lineno)

    def test_the_second_read_costs_what_this_file_says_it_costs(self):
        """⛔ THE SPEND, PINNED BY VALUE, so the docstring above cannot rot
        into a story. Driven through the SHIPPED forecast on the answering
        pair a sitting actually uses, never multiplied by hand here.

        ⚠ AND THE UNDER-STATEMENT IS PINNED TOO, deliberately. The one money
        sentence she reads bounds the reflection job alone; the judging calls
        are real and are not in it. Asserting the GAP rather than quietly
        closing it is what keeps the debt visible until she rules on it — the
        figure reaches her inside a sentence that is hers, and an agent may
        not move what she reads."""
        row = librarian_call.JOBS["reflection_judge"]
        routing = _FakeRouting()
        reflection_cents = server.forecast_usd(
            "reflection", server.LIBRARIAN_REFLECTION_CALLS_PER_SITTING,
            routing)
        judge_cents = server.forecast_usd("reflection_judge", 2, routing)
        # ⛔ 40 -> 60 ON 2026-08-25 (26.998), AND THIS IS A NUMBER SHE READS.
        # Her cap ruling — `Half again as much`, 8,000 -> 12,000 on both
        # reflection rows, chosen from four figures each with its price
        # ceiling — moves the one money sentence the room shows her from forty
        # cents a sitting to sixty. ⚠ SHE WAS TOLD THE PER-ANSWER FIGURE WHEN
        # SHE CHOSE (twenty cents becoming thirty) AND THE PER-SITTING FIGURE
        # IMMEDIATELY AFTERWARDS, when this pin surfaced it. ⛔ The figure is
        # not edited here to make a red go away: it is DERIVED from her row
        # through the shipped forecast, and this line records what her ruling
        # did to what she reads.
        self.assertEqual(reflection_cents, 60,
                         "the reflection ceiling a sitting is forecast at")
        self.assertEqual(judge_cents, 3,
                         "two judging calls at %d tokens on the same rung"
                         % (row["max_tokens"],))
        self.assertEqual(
            reflection_cents + judge_cents, 63,
            "a sitting's TRUE ceiling once the second read is counted")
        # ⛔ THE GAP, ASSERTED RATHER THAN CLOSED. It is hers to close.
        shown = server.forecast_line(
            "reflection", server.LIBRARIAN_REFLECTION_CALLS_PER_SITTING,
            routing)
        # ⛔ $0.40 -> $0.60, AND THE CHECK THIS LINE ASKS FOR WAS DONE. Its
        # instruction is *check whether an agent changed what she reads — that
        # is hers*. NO AGENT DID: the sentence is byte-for-byte hers and
        # untouched, and the FIGURE inside it is derived through the shipped
        # forecast from the reflection row's cap, which SHE raised on
        # 2026-08-25 (`Half again as much`, chosen from four figures each with
        # its price ceiling). ⚠ She was told the per-answer effect when she
        # chose and the per-sitting effect — this number — as soon as this
        # gate surfaced it.
        self.assertIn(
            "$0.60", shown,
            "the money sentence she reads still bounds the reflection job "
            "alone. ⛔ If this ever fails because the figure MOVED, check "
            "whether an agent changed what she reads — that is hers")
        # ⛔ THE GAP IS STILL A GAP AND IS STILL NOT CLOSED HERE: the judging
        # calls are real and are not inside the sentence she reads.
        self.assertNotIn("$0.63", shown)

    def test_the_judging_job_carries_her_two_words_and_its_own_row(self):
        """⛔ HER WORDS, PINNED BY VALUE (26.995-COPY.md § C-12, 2026-08-21).
        Both were CHOSEN FROM AN OFFERED SET — three candidates each, read to
        her one at a time, hers to take, change or throw out. They were
        applied into `server.py` byte-for-byte out of the copy record by the
        script that wrote the row, and they are pinned here so a later reword
        goes red instead of shipping. ⛔ The sentence carries no full stop;
        that is how it was quoted to her and how she took it. An agent
        "fixing" the punctuation has overwritten her choice.

        ⚠ THE ROW ITSELF IS ASSERTED IN THE SAME CASE, because words without
        a row are as broken as a row without words — and the room refuses to
        start on either, which is her own ruling taken over a warning."""
        self.assertIn("reflection_judge", librarian_call.JOBS,
                      "the judge needs its OWN row: a caller may name only a "
                      "job, never a tier, a model, a schema or a prompt, so "
                      "there is no way to borrow one")
        row = librarian_call.JOBS["reflection_judge"]
        self.assertEqual(row["tier"], "good-cloud")
        self.assertEqual(row["max_tokens"], 600)
        self.assertEqual(row["retries"], 2)
        self.assertIs(row["permitted_local"], True)
        self.assertIsNotNone(row["schema"], "bound at import from the module "
                                            "that owns the literal")
        self.assertIsNotNone(row["prompt"])
        self.assertEqual(server.JOB_ROOM_WORDS["reflection_judge"],
                         (HER_JUDGE_NAME, HER_JUDGE_SENTENCE))
        # and the standing list still DERIVES its membership rather than
        # keeping a second hand-typed list of jobs beside the first.
        self.assertEqual(set(server.JOB_ROOM_WORDS),
                         set(librarian_call.JOBS),
                         "the set equality that refuses to start the room")
        # ⛔ NO FREE TEXT ANYWHERE IN THE JUDGE'S ANSWER. A `reason` slot would
        # be the model's own words about a rejected draft, and a rejected
        # draft is never logged.
        schema = json.loads(row["schema"])
        self.assertEqual(sorted(schema["properties"]), ["verdict"],
                         "one property and one only — nothing a rejected "
                         "draft's reason could ride out on")
        self.assertEqual(schema["properties"]["verdict"]["enum"],
                         list(server.REFLECTION_JUDGE_VERDICTS))
        self.assertIs(schema["additionalProperties"], False)


def run_drill():
    """Plant every mutation, read every verdict, and report BY VALUE.

    Returns (caught, survived_names, steps, ok) — `ok` is False whenever a
    mutation was not caught, the known-negative did NOT survive, a plant did
    not change the file, or two mutants died on the same assertion."""
    real = os.path.join(_REPO_ROOT, "server.py")
    pristine = _read_text(real, "the shipped screen")
    before = hashlib.sha256(pristine.encode("utf-8")).hexdigest()
    caught = 0
    survived = []
    steps = []
    problems = []
    for index, (name, find, replace) in enumerate(MUTATIONS):
        if pristine.count(find) != 1:
            problems.append("MUTATION DID NOT APPLY: %r — its patch matches "
                            "%d times in the shipped file, so its verdict "
                            "would be a lie" % (name, pristine.count(find)))
            continue
        mutated = pristine.replace(find, replace, 1)
        # ⛔ CONTENT HASH, NEVER LENGTH. A reorder has zero length delta.
        if hashlib.sha256(mutated.encode("utf-8")).hexdigest() == before:
            problems.append("MUTATION DID NOT CHANGE THE FILE: %r" % (name,))
            continue
        step = probe(_load_mutant(mutated, "m%d" % index))
        if step is None:
            survived.append(name)
        else:
            caught += 1
            steps.append(step)
    # THE KNOWN-NEGATIVE: planted the same way, and it MUST survive.
    kn_name, kn_find, kn_replace = KNOWN_NEGATIVE
    kn_ok = False
    if pristine.count(kn_find) == 1:
        kn_mutated = pristine.replace(kn_find, kn_replace, 1)
        if hashlib.sha256(kn_mutated.encode("utf-8")).hexdigest() != before:
            kn_ok = probe(_load_mutant(kn_mutated, "kn")) is None
            if not kn_ok:
                problems.append(
                    "THE KNOWN-NEGATIVE WAS CAUGHT: %r — the probe is failing "
                    "on something other than behaviour, so every kill above "
                    "is worthless" % (kn_name,))
        else:
            problems.append("the known-negative did not change the file")
    else:
        problems.append("the known-negative's patch no longer applies")
    if len(set(steps)) != len(steps):
        problems.append(
            "two mutants died on the SAME assertion (%s) — four arms that all "
            "die on one assertion are one arm with three decorations"
            % ", ".join(sorted(steps)))
    after = hashlib.sha256(
        _read_text(real, "the shipped screen").encode("utf-8")).hexdigest()
    if after != before:
        problems.append("THE REAL server.py CHANGED DURING THE DRILL")
    for line in problems:
        print("DRILL PROBLEM: " + line)
    ok = (caught == len(MUTATIONS) and not survived and kn_ok
          and not problems)
    return caught, survived, steps, ok


def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(AddressFloorTest)
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    caught, survived, steps, drill_ok = run_drill()
    print("CASES %d" % ran)
    print("DRILL %d/%d mutations caught, %d known-negative survived, "
          "%d distinct assertions"
          % (caught, len(MUTATIONS), 1 if drill_ok else 0, len(set(steps))))
    if survived:
        print("DRILL SURVIVORS: " + ", ".join(survived))
    print("DRIVEN " + ", ".join(
        "%d %s" % (DRIVEN[key], key.replace("_", " "))
        for key in sorted(DRIVEN)))
    if ran != EXPECTED_CASES:
        print("CASE COUNT MISMATCH: ran %d, this file declares %d"
              % (ran, EXPECTED_CASES))
    # ⛔ EVERY REPORTED NUMBER, NOT ONE OF THEM. A key that nothing increments
    # printed a zero beside a pass for two days. A run may not report that it
    # examined something and then pass having examined none of it — so the
    # gate is over the whole dict, and adding a key that nothing drives now
    # FAILS THE RUN rather than decorating it.
    idle = sorted(key for key, count in DRIVEN.items() if count <= 0)
    drove = not idle
    if not drove:
        print("DRIVE MISMATCH: %s reported ZERO — this suite declares that it "
              "examined that, and a run which examined nothing must not pass. "
              "Either drive it from a case that genuinely exercises what the "
              "name says, or DELETE the key. ⛔ Do not increment it from a "
              "case that does not: that turns a dead counter into a lying one."
              % ", ".join(idle))
    if not result.wasSuccessful() or ran != EXPECTED_CASES or not drove \
            or not drill_ok:
        return 1
    print("test_reflection_address OK (%d cases, %d drafts measured, %d "
          "endings judged, %d rejection tokens checked)"
          % (ran, DRIVEN["drafts_measured"], DRIVEN["endings_judged"],
             DRIVEN["rejection_tokens_checked"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
