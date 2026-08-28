#!/usr/bin/env python3
"""
The COUNT LEAK suite (Phase 26.995 — her ruling of 2026-08-22, B-18 /
G-26.995-10, recorded in full at `26.995-COPY.md` § R-7).

⛔⛔ HER RULING, VERBATIM, AND THE PROVENANCE WITH IT:

    Yes — rule holds

⚠ CHOSEN FROM AN OFFERED SET (*Yes — rule holds* · *No — let it say it* ·
*Depends on the number*), NOT VOLUNTEERED. It may never be written up as a
count she independently ruled out.

WHAT SHE RULED. Her standing rule of 2026-07-28 — *no exact count on any
front-facing surface, the number allowed only in Manage* — met a case nobody
had checked. The room computes an Evening line, `there is a lot here — 1195
pieces.`, and HANDS IT TO THE LIBRARIAN. That line is never rendered to her:
it is payload, and D-38 pinned its wording for exactly that job. What went
wrong is that the librarian REPEATED THE NUMBER into the writing she read,
and the number then rode into the reflection's saved title, cut off mid-word.

    | the room may still COMPUTE the count            | unchanged |
    | the room may still HAND IT TO THE LIBRARIAN     | unchanged |
    | the librarian may ECHO IT INTO HER WRITING      | NO        |

⛔ D-38 IS NOT OVERTURNED AND THE EVENING LINE IS NOT TOUCHED. A case below
asserts her sentence by value, over the very pool of her 2026-08-22 sitting,
so a later reader who "simplifies" this into *stop computing the count* is
caught by this file rather than by her.

⛔⛔ WHY THIS SUITE DRIVES AND NEVER READS. Her record states the trap in its
own words: *the model is what emits the number, so a gate that greps the
prompt, the constants or the source for a count will pass a build in which
the librarian goes on writing 1195 pieces into her first sentence.* Every
case here therefore runs the shipped path over a real pool and reads what
LANDED — the saved draft and the saved name — never the instruction that
asked for it. ⭐ And a known-negative proves that claim rather than asserting
it: DELETING the prompt sentence this phase added leaves every case here
GREEN. This suite cannot see the prompt, which is the whole point of it.

WHAT IS UNDER TEST:

  (a) `study_lib.derive_evening_line` still says HER sentence, by value, over
      a pool the size of her real one. The payload half of her ruling.

  (b) THE END-TO-END DRIVE. `server._reflection_worker` is run under the
      hermetic seam with the model canned to the draft the room ACTUALLY
      WROTE her on 2026-08-22 — count in the first sentence — and the SAVED
      SESSION FILE is read off disk. Neither the draft she would read nor
      the name that becomes her title may carry the number.

  (c) `server.validate_reflection`'s own disposition, driven directly: the
      token, the controls that must PASS, and the two shipped call sites.

  ⚠ WHAT IT DOES NOT AND CANNOT CHECK: whether a real model obeys the
  instruction. Nothing hermetic can. What it checks is that the room does not
  hand her the number even when the model does emit it — which is the only
  half a test in this repo can honestly own, and it is stated here rather
  than implied.

  ⚠ THE STUB'S OWN RECORDED DEFECT IS WORKED WITH, NOT FIXED HERE: the
  canned envelope DROPS the reflection's `name` and still names the retired
  `coda`. The dropped name is why case (b) reads a name that came from the
  read-time fallback — the first characters of the writing — which is
  precisely the path the count took into her title on 2026-08-22. Fixing the
  stub would have removed the very route under test.
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
_TESTS_DIR = os.path.join(_REPO_ROOT, "tests")
if _TESTS_DIR not in sys.path:
    sys.path.insert(0, _TESTS_DIR)

import server  # noqa: E402
import study_lib  # noqa: E402
from test_server_smoke import fake_claude_env, no_cached_probe  # noqa: E402

EXPECTED_CASES = 11

# Every number this run reports it examined. `main()` fails on any key that
# stayed at zero — the 26.995-25 lesson: a run may not report that it looked
# at something and then pass having looked at none of it.
DRIVEN = {"drafts_screened": 0, "sittings_driven": 0, "call_sites_read": 0}


# ---------------------------------------------------------------------------
# ---- HER SITTING, REBUILT ------------------------------------------------
#
# 1195 rows: the pool of her 2026-08-22 sitting held 322 bodies + 873 meta
# rows. The split does not matter to the count and is not reproduced; the
# SIZE is what makes the shipped line say her number.
HER_PIECES = 1195
HER_POOL = {"bodies": [],
            "meta_rows": [{"id": "m%d" % i} for i in range(HER_PIECES)]}

# ⛔ HER LINE, PINNED BY VALUE. Wording pinned by D-38, threshold hers,
# 2026-08-19. This suite asserts it rather than deriving it, so a change to
# either shows up HERE as well as in the Evening line's own suite.
HER_EVENING_LINE = "there is a lot here — 1195 pieces."

# ⛔ THE DRAFT THE ROOM ACTUALLY WROTE HER, opening quoted verbatim out of
# that sitting's own session.json (26.995-OWED-TO-OWNER.md § B-18). The rest
# is invented padding in the same register — nothing of hers is in this repo.
LEAKED_DRAFT = (
    "there is a lot here — 1195 pieces — and i have spent the evening with "
    "one small corner of it. you left a door open on purpose more than once "
    "this month, and every time it is the air you wrote about, never the "
    "door. \"it smelled like rain coming,\" you wrote, and left it there.")

# The same evening, written the way the room's own third example already
# writes it — count-free. This is the control that must PASS, and it is the
# reason the instruction change is an instruction change: nothing is being
# asked for that the room was not already being shown.
CLEAN_DRAFT = (
    "there is a lot in tonight's pile and i am staying with one thing in "
    "it. you left a door open on purpose more than once this month, and "
    "every time it is the air you wrote about, never the door. \"it "
    "smelled like rain coming,\" you wrote, and left it there.")

# ⛔ HER OWN WORDS CARRYING THE NUMBER. Laws 2/4: the writing quotes her
# verbatim by design, so the screen reads the UNQUOTED remainder only — the
# same posture the no-push, clinical and dismissed-topic screens already
# take. A draft where the number appears ONLY inside her quotation marks is
# her sentence coming back to her and must PASS.
HER_QUOTED_NUMBER_DRAFT = (
    "you counted them yourself once, in april. \"1195 pieces and i have "
    "read maybe nine of them,\" you wrote, and then went on about the "
    "weather instead. it is the going-on that stayed with me.")

# A number the room NEVER handed over. The screen knows exactly one number —
# the one it gave the librarian this turn — and must be blind to every other,
# or it becomes a ban on arithmetic in her reflections.
# ⛔ THE CONTROL THE BOUNDARY ALONE PROTECTS. The count's digits appear here
# only as a SUBSTRING of a longer number, which is a different number. Without
# alphanumeric boundaries on both sides this draft is refused and she loses
# good writing to a screen that cannot count.
SUBSTRING_NUMBER_DRAFT = (
    "you wrote about the flat at 11950 and never once about the road it "
    "stood on. \"it smelled like rain coming,\" you wrote, and left it "
    "there. it is the leaving that stayed with me.")

UNHANDED_NUMBER_DRAFT = (
    "you wrote about the 24 steps down to the water more than once, and "
    "never once about the water. you kept going back to the counting. "
    "\"it smelled like rain coming,\" you wrote, and left it there.")


def _structured(draft, name=None):
    envelope = {"reflection": draft}
    if name is not None:
        envelope["name"] = name
    return envelope


def _digits(text):
    """Every standalone digit run in `text`, as strings."""
    return re.findall(r"\d+", str(text or ""))


def _carries(text, number):
    """True when `number` stands as its own token in `text`. Alphanumeric
    boundaries on both sides, so "1195" does not match inside "11950" and
    "24" does not match inside "24th"."""
    return re.search(r"(?<![0-9A-Za-z])%s(?![0-9A-Za-z])" % re.escape(number),
                     str(text or "")) is not None


class _CleanJudge(object):
    """The second read, scripted clean.

    ⛔ IT IS SCRIPTED ON PURPOSE AND THE REASON IS NOT CONVENIENCE. The
    per-draft judge is a PAID MODEL CALL she ruled for (§ C-4 beat 3) and it
    is driven, verdict by verdict, in tests/test_reflection_address.py. The
    hermetic seam answers every call with the reflection envelope, so a real
    judge call here would come back without a verdict and the draft would be
    rejected as `judge_unreachable` — which would turn this suite green for
    the wrong reason and hide the property it exists to prove. Answering
    `clean` is the HOSTILE setting: it means nothing but the count screen can
    possibly stop the draft below."""

    def __init__(self):
        self.seen = []

    def __call__(self, routing=None):
        def judge(draft):
            self.seen.append(draft)
            return "clean"
        return judge


def shipped_validate_reflection_calls():
    """Every call to `validate_reflection` in the shipped server, as
    (line number, keyword names) — through the parse tree, never grepped."""
    with open(os.path.join(_REPO_ROOT, "server.py"), "r",
              encoding="utf-8") as handle:
        tree = ast.parse(handle.read())
    calls = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = getattr(node.func, "id", None) or \
            getattr(node.func, "attr", None)
        if name != "validate_reflection":
            continue
        calls.append((node.lineno,
                      [kw.arg for kw in node.keywords if kw.arg]))
    return calls


class CountLeakTest(unittest.TestCase):

    # -- (a) the payload half: HER line, untouched -------------------------

    def test_the_evening_line_still_says_her_sentence(self):
        """⛔ D-38 IS NOT OVERTURNED. She ruled on what reaches HER, not on
        what reaches the librarian, and the number must go on being handed
        over. Driven over a pool the size of her real one and asserted BY
        VALUE against the sentence her sitting actually produced."""
        line = study_lib.derive_evening_line(HER_POOL)
        self.assertEqual(
            line, HER_EVENING_LINE,
            "the Evening line is HERS, pinned verbatim by D-38, and this "
            "ruling does not touch it — an agent that 'simplified' her "
            "ruling into 'stop computing the count' has changed a decision "
            "she did not make")
        self.assertEqual(_digits(line), [str(HER_PIECES)],
                         "the handed line carries exactly one number, and it "
                         "is the pile count")

    # -- (b) THE END-TO-END DRIVE ------------------------------------------

    def test_the_count_never_reaches_the_writing_or_the_saved_title(self):
        """⛔⛔ THE CASE THE RULING ASKED FOR. A whole sitting is run: the
        pool is hers by size, the Evening line is resolved by the shipped
        function, the model is canned to the draft the room ACTUALLY WROTE
        her — number in the first sentence — and what is asserted is the
        SESSION FILE ON DISK, both the draft she would read and the name
        that becomes her title.

        ⚠ THE NAME IS THE HALF THAT WAS CUT MID-WORD. The stub drops the
        answer's own `name`, so the read-time fallback derives one from the
        first characters of the writing — which is exactly how the number
        got into her saved title on 2026-08-22."""
        tmp = tempfile.mkdtemp(prefix="studyroom-count-leak-")
        self.addCleanup(shutil.rmtree, tmp, True)
        library = os.path.join(tmp, "library")
        os.mkdir(library)
        log = os.path.join(tmp, "fake.log")
        judge_factory = _CleanJudge()
        saved_judge = server.reflection_judge
        server.reflection_judge = judge_factory
        self.addCleanup(setattr, server, "reflection_judge", saved_judge)
        with fake_claude_env(log, extra={
                "FAKE_CLAUDE_REFLECTION": json.dumps(
                    {"reflection": LEAKED_DRAFT}, ensure_ascii=False)}):
            no_cached_probe()
            evening = study_lib.derive_evening_line(HER_POOL)
            self.assertEqual(evening, HER_EVENING_LINE)
            server._reflection_worker(
                HER_POOL, [], [], True, 1700000000000, library, (),
                server.LIBRARIAN_VOICE_MODEL_DEFAULT,
                {"titles_already_used": [], "shapes_used_lately": []},
                None, server.resolve_librarian_routing(),
                evening, None)
            doc = study_lib.load_session_file(library)
        DRIVEN["sittings_driven"] += 1
        draft = (doc or {}).get("draft") or ""
        name = (doc or {}).get("name") or ""
        self.assertFalse(
            _carries(draft, str(HER_PIECES)),
            "THE COUNT REACHED THE WRITING SHE READS. Her ruling of "
            "2026-08-22: the librarian may be TOLD the count and must not "
            "repeat the number into the writing. Landed draft: %r" % draft)
        self.assertFalse(
            _carries(name, str(HER_PIECES)),
            "THE COUNT REACHED THE SAVED TITLE — the same number, on the "
            "surface that becomes a filename on her disk. Landed name: %r"
            % name)

    def test_the_same_evening_written_count_free_lands_and_is_saved(self):
        """⛔ THE ARM THAT MUST NOT FAIL. The case above proves the number
        does not reach her; on its own that is also what a room which never
        writes anything would prove. This drives the SAME heavy evening with
        the model writing it the way the room's own third example already
        does — count-free — and requires the sitting to LAND and the writing
        to be on her disk."""
        tmp = tempfile.mkdtemp(prefix="studyroom-count-clean-")
        self.addCleanup(shutil.rmtree, tmp, True)
        library = os.path.join(tmp, "library")
        os.mkdir(library)
        saved_judge = server.reflection_judge
        server.reflection_judge = _CleanJudge()
        self.addCleanup(setattr, server, "reflection_judge", saved_judge)
        with fake_claude_env(os.path.join(tmp, "fake.log"), extra={
                "FAKE_CLAUDE_REFLECTION": json.dumps(
                    {"reflection": CLEAN_DRAFT}, ensure_ascii=False)}):
            no_cached_probe()
            server._reflection_worker(
                HER_POOL, [], [], True, 1700000000000, library, (),
                server.LIBRARIAN_VOICE_MODEL_DEFAULT,
                {"titles_already_used": [], "shapes_used_lately": []},
                None, server.resolve_librarian_routing(),
                study_lib.derive_evening_line(HER_POOL), None)
            doc = study_lib.load_session_file(library)
        DRIVEN["sittings_driven"] += 1
        self.assertIsNotNone(doc, "the sitting did not land at all — a "
                                  "screen that stops every heavy evening is "
                                  "not the ruling, it is a new defect")
        self.assertEqual(doc.get("draft"), CLEAN_DRAFT,
                         "count-free writing about a heavy evening must "
                         "reach her whole")
        self.assertTrue(doc.get("name"), "the sitting saved no name")

    # -- (c) the screen's own disposition ----------------------------------

    def test_the_screen_names_the_leak_as_its_own_rule(self):
        ok, cleaned, why = server.validate_reflection(
            _structured(LEAKED_DRAFT), [], [],
            handed_evening=HER_EVENING_LINE)
        DRIVEN["drafts_screened"] += 1
        self.assertFalse(ok, "a draft repeating the handed count is refused")
        self.assertIsNone(cleaned)
        self.assertEqual(why, "echoed_count",
                         "the rejection is named as ITS OWN rule — a "
                         "category token only, never the draft and never "
                         "the number")

    def test_a_count_free_draft_over_the_same_evening_passes(self):
        """⛔ THE CONTROL THAT MATTERS MOST. The room's own third example is
        written for an evening it was told `there is a lot here — 24 pieces.`
        and says *there is a lot in tonight's pile* instead. If this case
        ever goes red, the screen has started throwing away the writing the
        ruling exists to protect."""
        ok, cleaned, why = server.validate_reflection(
            _structured(CLEAN_DRAFT), [], [],
            handed_evening=HER_EVENING_LINE)
        DRIVEN["drafts_screened"] += 1
        self.assertTrue(ok, "count-free writing about a heavy evening is "
                            "exactly what she ruled FOR: %r" % (why,))
        self.assertEqual(cleaned["reflection"], CLEAN_DRAFT)

    def test_her_own_quoted_number_is_hers_and_survives(self):
        """Laws 2/4: the writing quotes her verbatim by design, and the pool
        a count came out of is where her own sentences about it live. The
        screen reads the UNQUOTED remainder — the same posture the no-push,
        clinical and dismissed-topic screens already take, and for the same
        stated reason."""
        ok, cleaned, why = server.validate_reflection(
            _structured(HER_QUOTED_NUMBER_DRAFT), [], [],
            handed_evening=HER_EVENING_LINE)
        DRIVEN["drafts_screened"] += 1
        self.assertTrue(ok, "her own words came back to her and were "
                            "refused: %r" % (why,))
        self.assertEqual(cleaned["reflection"], HER_QUOTED_NUMBER_DRAFT)

    def test_a_number_the_room_never_handed_over_is_none_of_its_business(self):
        """The screen knows exactly ONE number — the one this turn handed the
        librarian. Anything else is arithmetic in her reflection, which
        nobody ruled against."""
        ok, cleaned, why = server.validate_reflection(
            _structured(UNHANDED_NUMBER_DRAFT), [], [],
            handed_evening=HER_EVENING_LINE)
        DRIVEN["drafts_screened"] += 1
        self.assertTrue(ok, "a number nobody handed over was refused: %r"
                            % (why,))
        self.assertEqual(cleaned["reflection"], UNHANDED_NUMBER_DRAFT)

    def test_with_nothing_handed_the_screen_has_nothing_to_say(self):
        """An unremarkable evening gets NO Evening line at all (D-14), and on
        such an evening this screen must be inert — the leaking draft itself
        rides through, because no count was ever given to echo."""
        ok, cleaned, why = server.validate_reflection(
            _structured(LEAKED_DRAFT), [], [], handed_evening=None)
        DRIVEN["drafts_screened"] += 1
        self.assertTrue(ok, "the screen fired with nothing handed: %r"
                            % (why,))
        self.assertEqual(cleaned["reflection"], LEAKED_DRAFT)

    def test_the_counts_digits_inside_a_longer_number_are_a_different_number(
            self):
        """Without alphanumeric boundaries on both sides, "1195" matches
        inside "11950" and the screen starts eating good writing. Driven so
        the boundary is a property rather than a comment."""
        ok, cleaned, why = server.validate_reflection(
            _structured(SUBSTRING_NUMBER_DRAFT), [], [],
            handed_evening=HER_EVENING_LINE)
        DRIVEN["drafts_screened"] += 1
        self.assertTrue(ok, "a longer number was read as the handed one: %r"
                            % (why,))
        self.assertEqual(cleaned["reflection"], SUBSTRING_NUMBER_DRAFT)

    def test_the_saved_name_is_screened_too(self):
        """The name is INDEPENDENT generated text that becomes her title and
        a filename. It is scanned exactly like the writing."""
        ok, cleaned, why = server.validate_reflection(
            _structured(CLEAN_DRAFT, name="1195 pieces and one door"),
            [], [], handed_evening=HER_EVENING_LINE)
        DRIVEN["drafts_screened"] += 1
        self.assertFalse(ok, "the count reached the name and was allowed")
        self.assertIsNone(cleaned)
        self.assertEqual(why, "echoed_count")

    def test_both_shipped_call_sites_hand_the_screen_what_it_needs(self):
        """A screen the shipped path never feeds is a screen that does not
        exist. Read off the parse tree, and BOTH turns must feed it — a
        refine turn is told what kind of evening it is exactly as the
        generation turn was."""
        calls = shipped_validate_reflection_calls()
        DRIVEN["call_sites_read"] += len(calls)
        self.assertTrue(calls, "no shipped call site found at all")
        missing = [line for line, kwargs in calls
                   if "handed_evening" not in kwargs]
        self.assertEqual(
            missing, [],
            "these shipped call sites do not hand the screen the Evening "
            "line, so the count is unscreened on that turn: lines %r"
            % (missing,))


# ---------------------------------------------------------------------------
# ---- THE MUTATION DRILL --------------------------------------------------
#
# ⛔ EVERY MUTATION IS PROVEN PLANTED BY CONTENT HASH BEFORE ITS VERDICT IS
# READ. A patch that no longer applies reads EXACTLY like a gate that does not
# hold — this project reported a SURVIVED on exactly that once — so a mutant
# whose hash did not move is an ERROR here, never a survival.
#
# ⛔ AND THE KNOWN-NEGATIVES MUST SURVIVE. The second of them is the whole
# argument of this file: DELETING THE PROMPT SENTENCE leaves every case green,
# which is what proves this suite is watching BEHAVIOUR and not the
# instruction that asks for it.

_SCREEN = '''    if _echoes_handed_count(fields_she_reads, handed_evening):
        return False, None, "echoed_count"'''

MUTATIONS = (
    ("the screen never fires",
     _SCREEN,
     '''    if _echoes_handed_count(fields_she_reads, handed_evening) and False:
        return False, None, "echoed_count"'''),
    ("the screen refuses the whole sitting instead of writing it again",
     _SCREEN,
     '''    if _echoes_handed_count(fields_she_reads, handed_evening):
        raise ValueError("refused")'''),
    ("her quoted words stop being exempt",
     "        stripped = _strip_quoted_spans(field)",
     "        stripped = str(field or \"\")"),
    ("the boundary goes, so any number swallows any other",
     '_HANDED_NUMBER_PATTERN = r"(?<![0-9A-Za-z])%s(?![0-9A-Za-z])"',
     '_HANDED_NUMBER_PATTERN = r"%s"'),
    ("the name stops being screened",
     'fields_she_reads = (reflection, name)',
     'fields_she_reads = (reflection,)'),
)

KNOWN_NEGATIVES = (
    ("a comment inside the screen reworded (must SURVIVE)",
     _SCREEN,
     "    # (known-negative: this comment is the whole mutation)\n" + _SCREEN),
    # ⛔⛔ THE ONE THAT ANSWERS HER RECORD'S OWN WARNING. Her ruling says a
    # gate over the PROMPT would stay green while she went on reading the
    # number. The converse is what this suite claims about itself, and this
    # is the proof: strike the instruction out of the shipped prompt and
    # every case above stays green, because not one of them reads it.
    ("the prompt instruction deleted outright (must SURVIVE)",
     None,          # resolved at run time against the shipped constant
     ""),
)


def _load_mutant(source, tag):
    tmp = tempfile.mkdtemp(prefix="studyroom-count-drill-")
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
    """Run the shipped claims against ONE module; return the failing step's
    name, or None when every claim held.

    ⛔ THE STEPS ARE ORDERED SO DIFFERENT DEFECTS DIE ON DIFFERENT ONES."""
    try:
        leak = module.validate_reflection(
            _structured(LEAKED_DRAFT), [], [],
            handed_evening=HER_EVENING_LINE)
        clean = module.validate_reflection(
            _structured(CLEAN_DRAFT), [], [],
            handed_evening=HER_EVENING_LINE)
        quoted = module.validate_reflection(
            _structured(HER_QUOTED_NUMBER_DRAFT), [], [],
            handed_evening=HER_EVENING_LINE)
        unhanded = module.validate_reflection(
            _structured(UNHANDED_NUMBER_DRAFT), [], [],
            handed_evening=HER_EVENING_LINE)
        substring = module.validate_reflection(
            _structured(SUBSTRING_NUMBER_DRAFT), [], [],
            handed_evening=HER_EVENING_LINE)
        named = module.validate_reflection(
            _structured(CLEAN_DRAFT, name="1195 pieces and one door"),
            [], [], handed_evening=HER_EVENING_LINE)
    except Exception:                              # noqa: BLE001 — the point
        return "raised"
    # the LEGAL controls first, so a screen that eats good writing dies here
    # and nowhere else.
    if not clean[0]:
        return "a count-free draft was rejected"
    if not quoted[0]:
        return "her own quoted number was rejected"
    if not unhanded[0]:
        return "a number nobody handed over was rejected"
    if not substring[0]:
        return "a longer number was read as the handed one"
    if leak[0] or leak[2] != "echoed_count":
        return "the leaking draft was not refused"
    if named[0] or named[2] != "echoed_count":
        return "the leaking NAME was not refused"
    return None


def run_drill():
    with open(os.path.join(_REPO_ROOT, "server.py"), "r",
              encoding="utf-8") as handle:
        shipped = handle.read()
    before = hashlib.sha256(shipped.encode("utf-8")).hexdigest()
    if probe(server) is not None:
        return 0, ["THE UNMUTATED SOURCE ALREADY FAILS: %s"
                   % probe(server)], [], False
    caught, survived, steps = 0, [], []
    for i, (label, old, new) in enumerate(MUTATIONS):
        if old not in shipped:
            survived.append("%s (PATCH DID NOT APPLY — not a survival)"
                            % label)
            continue
        mutated = shipped.replace(old, new, 1)
        if hashlib.sha256(mutated.encode("utf-8")).hexdigest() == before:
            survived.append("%s (HASH UNMOVED — not a survival)" % label)
            continue
        try:
            module = _load_mutant(mutated, "m%d" % i)
        except Exception:                          # noqa: BLE001
            caught += 1
            steps.append("import")
            continue
        step = probe(module)
        if step is None:
            survived.append(label)
        else:
            caught += 1
            steps.append(step)
    negatives_held = True
    for j, (label, old, new) in enumerate(KNOWN_NEGATIVES):
        if old is None:
            old = _shipped_prompt_instruction(shipped)
        if old not in shipped:
            negatives_held = False
            survived.append("%s (PATCH DID NOT APPLY)" % label)
            continue
        mutated = shipped.replace(old, new, 1)
        if hashlib.sha256(mutated.encode("utf-8")).hexdigest() == before:
            negatives_held = False
            survived.append("%s (HASH UNMOVED)" % label)
            continue
        try:
            module = _load_mutant(mutated, "n%d" % j)
            step = probe(module)
        except Exception:                          # noqa: BLE001
            step = "raised"
        if step is not None:
            negatives_held = False
            survived.append("%s WAS CAUGHT — the probe is failing on "
                            "something other than behaviour, and every kill "
                            "above is worthless" % label)
    with open(os.path.join(_REPO_ROOT, "server.py"), "r",
              encoding="utf-8") as handle:
        after = hashlib.sha256(handle.read().encode("utf-8")).hexdigest()
    if after != before:
        return caught, survived + ["server.py CHANGED ON DISK"], steps, False
    return caught, survived, steps, negatives_held


_INSTRUCTION_START = "an 'evening' line may ride the handed data"
# ⚠ RE-AIMED 2026-08-24, NOT WEAKENED. The block used to end on "…answers an
# evening it had been told a figure for." — the sentence that told the model to
# NAME THE SIZE IN WORDS. She ruled that line out entirely on 2026-08-24 (she
# was shown that "over a thousand pieces" satisfied the letter of her no-count
# rule while defeating its spirit), so the instruction now ends on its
# replacement. ⛔ The known-negative still deletes THE WHOLE REAL BLOCK; if this
# marker ever stops matching, the slice returns a sentinel and the drill reports
# PATCH DID NOT APPLY rather than passing quietly — which is how this was found.
_INSTRUCTION_END = "how much arrived is not something she reads."


def _shipped_prompt_instruction(shipped):
    """The lines this phase added to `LIBRARIAN_REFLECT_PROMPT`, sliced out of
    the shipped source so the known-negative deletes THE REAL THING.

    ⚠ THIS IS THE ONLY PLACE IN THIS FILE THAT LOOKS AT THE PROMPT AT ALL, and
    it looks in order to DELETE it. Nothing here asserts its wording, and no
    case reads it — which is precisely the claim the known-negative proves."""
    lines = shipped.splitlines(keepends=True)
    start = end = None
    for i, line in enumerate(lines):
        if start is None and _INSTRUCTION_START in line:
            start = i
        if start is not None and _INSTRUCTION_END in line:
            end = i
            break
    if start is None or end is None:
        return "\x00 the instruction is not in the shipped prompt \x00"
    return "".join(lines[start:end + 1])


def main():
    suite = unittest.TestLoader().loadTestsFromTestCase(CountLeakTest)
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    caught, survived, steps, negatives_ok = run_drill()
    print("CASES %d" % ran)
    print("DRILL %d/%d mutations caught, %d/%d known-negatives survived, "
          "%d distinct assertions"
          % (caught, len(MUTATIONS),
             len(KNOWN_NEGATIVES) if negatives_ok else 0,
             len(KNOWN_NEGATIVES), len(set(steps))))
    if survived:
        print("DRILL SURVIVORS: " + " | ".join(survived))
    print("DRIVEN " + ", ".join("%d %s" % (DRIVEN[k], k.replace("_", " "))
                                for k in sorted(DRIVEN)))
    idle = sorted(k for k, c in DRIVEN.items() if c <= 0)
    if idle:
        print("DRIVE MISMATCH: %s reported ZERO" % ", ".join(idle))
    if ran != EXPECTED_CASES:
        print("CASE COUNT MISMATCH: ran %d, this file declares %d"
              % (ran, EXPECTED_CASES))
    if not result.wasSuccessful() or ran != EXPECTED_CASES or idle \
            or survived or not negatives_ok or caught != len(MUTATIONS):
        return 1
    print("test_reflection_count_leak OK (%d cases, %d drafts screened, "
          "%d sittings driven)"
          % (ran, DRIVEN["drafts_screened"], DRIVEN["sittings_driven"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
