"""THE STOP, DRIVEN RED IN THE WORKER LOOP — and a live control, same run.

⚠ WHAT THIS FILE IS FOR (26.99-06, D-18 and D-20). The room used to hold a
hard stop denominated in DOLLARS. Its check was removed from both worker
loops when the seam stopped returning a float, and the constant was left
standing, inert, for a later ticket to pick up. D-18 is that pick-up: the
stop STAYS, it is counted in WORK rather than money, and it guards TIME.

⛔⛔ AND THE ONE THING THIS SUITE EXISTS TO PREVENT IS A GREEN THAT MEANS
NOTHING (B-1). Both worker loops iterate a FINITE batch list. A bound set
at or above `len(batches)` can never fire, every happy-path test stays
green for ever, and the tree would report a safety it does not have —
which is precisely the defect the shipped LIBRARIAN_REFLECTION_CEILING
names in its own comment: "a number that cannot fire is not a length rule;
it is a runaway guard whose value nobody can check."

So this suite PLANTS AN OVERSIZED PASS AND REQUIRES THE LOOP TO STOP, with
an unmutated control pass of ordinary size completing in the SAME RUN. A red
witnessed beside a green is the evidence; a green alone is not.

⚠ IT DROVE TWO LOOPS UNTIL 2026-08-17. The second was the labelling scan's,
and #95 deleted that pass with its two model jobs — so there is one
runaway-capable loop left and one bound on it. ⛔ The rule did not soften:
a second loop must arrive with its own planted red and its own control.

⚠ AND THE BOUND ITSELF IS RECOMPUTED FROM RAW INPUTS, NOT READ (B-5). A
test that reads the same constant the code reads proves nothing about the
value. Every bound here is re-derived from the batcher's three named
constants, asserted equal to the shipped one, and then ONE INPUT IS
MUTATED and the bound is asserted to have MOVED. The mutation is the
assertion; the equality alone is tautological.

⚠ THE STATIC HALF USES `ast`, NOT A GREP (B-2). "Can this loop exit its
batch iteration without passing the bound?" is a question about structure,
and this plan writes a great deal of prose containing exactly the tokens a
grep would search for. A parse tree carries no comments and no docstrings,
so it cannot be fooled by either. Where a plain scan is still used, the
source is stripped of comments AND of every string literal through
`tokenize` — ⚠ A PYTHON DOCSTRING IS NOT A '#' COMMENT, and this project
turned a pin red twice from prose that survived a '#'-only strip.

⛔ NO REAL CALL IS POSSIBLE FROM HERE. `librarian_call._transport` — the
seam's one transport hook — is swapped for a fake that answers instantly,
and the fake REFUSES any credential. Everything runs on the local rung,
which takes none. ⛔ No key value is read, printed, masked-and-printed or
written anywhere. A live paid Anthropic key is on this machine.

⛔ IT NEVER TOUCHES THE REAL HOME. Every live case runs inside a temporary
HOME and the helper REFUSES TO YIELD unless `study_lib.room_config_dir()`
actually resolved inside that temporary directory — a structural guard,
not a promise in a comment, because the call record's home is the room's
own config directory and that is a directory she really has.

⚠ THE CASE COUNT AND THE CONTROL COUNT ARE ASSERTED BY VALUE (B-3). A
suite that examined zero cases must be legible as such rather than
printing a cheerful line about a loop it never entered — this project has
a recorded driver that "would have passed while scanning an empty string."

Run: `TMPH=$(mktemp -d); HOME="$TMPH" python3 tests/test_pass_stop.py`
"""

import ast
import contextlib
import io
import json
import os
import re
import shutil
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
import server             # noqa: E402


# ---------------------------------------------------------------------------
# ---- what this run actually drove, so `main` can state it BY VALUE --------

# ⚠ TWO LIVE PASSES: one planted oversized (which MUST stop) and one
# unmutated control of ordinary size (which MUST NOT). The control is
# counted separately and printed separately, because "the stop fired" and
# "the stop fired on everything" are the two failures and only one number
# tells them apart.
#
# ⚠ IT WAS FOUR UNTIL 2026-08-17, and the halving is a DELETION, not a
# relaxation: the cleaning scan's loop was the second runaway-capable loop
# and it no longer exists (#95 deleted the labelling pass's two model jobs).
# ⛔ D-18's "both loops or neither" is not weakened by dropping the cases —
# it would be weakened by keeping a loop and dropping its case. A second loop
# arriving must arrive with its own planted red AND its own control.
LIVE_PASSES = 2
LIVE_CONTROLS = 1

DRIVEN = {"passes": 0, "controls": 0, "stops": 0, "calls": 0}

# The ordinary-sized control pass. Deliberately small: its job is to prove
# the loop still finishes when nothing is pathological, not to be slow.
CONTROL_BATCHES = 12

# How far past the bound a planted pass reaches. Three is enough — the
# assertion is that the loop stopped AT the bound, not that it stopped
# eventually.
OVERSHOOT_BATCHES = 3

# The id shape every planted batch carries. One id per batch, unique, and
# matchable out of the serialized request whatever escaping it picked up on
# the way — the fake answers from the ids it was actually sent, so a batch
# the loop never reached can never be marked.
ID_PREFIX = "passstop"
ID_RE = re.compile(r"passstop-[a-z]+-\d{6}")

# Money, in the shapes a ceiling sentence could wear it. ⛔ D-18 and D-14:
# neither ceiling sentence may claim the pass stopped on money, because the
# pass costs nothing — that false claim is the whole reason these two
# sentences were re-cut.
MONEY_SYMBOLS = ("$", "€", "£", "¥", "₹", "¢")
MONEY_WORDS = ("cost", "usd", "dollar", "price", "cent", "charge", "bill",
               "spend", "money", "fee", "budget", "limit", "expensive",
               "afford", "paid", "pay")


# ---------------------------------------------------------------------------
# ---- the independent recompute (B-5) --------------------------------------

def recompute_bound(metadata_batch, body_budget, body_items,
                    calls_per_batch):
    """The bound, re-derived here from RAW NUMBERS.

    ⚠ This function deliberately imports nothing from `server`. It takes
    the three batcher constants as plain integers and returns the call
    bound, so it can be run against the SHIPPED values (must equal the
    shipped constant) and then against a MUTATED value (must not).

    The derivation, in one breath: the byte budget read at the batcher's
    own per-item body allowance gives a yardstick item count; a full pass
    over it costs one metadata batch per `metadata_batch` rows PLUS one
    body batch per `body_items` bodies; and each batch costs the loop its
    own measured number of calls."""
    yardstick_items = body_budget // body_items
    meta_batches = -(-yardstick_items // metadata_batch)
    body_batches = -(-yardstick_items // body_items)
    return (meta_batches + body_batches) * calls_per_batch


def shipped_inputs():
    """The three batcher constants, read from `study_lib` where they live."""
    return (study_lib.LIBRARIAN_METADATA_BATCH,
            study_lib.LIBRARIAN_BODY_BUDGET,
            study_lib.LIBRARIAN_BODY_ITEMS)


# ---------------------------------------------------------------------------
# ---- naming what has not landed yet ---------------------------------------

def need(name):
    """`server.<name>`, or an assertion that NAMES the missing symbol.

    ⚠ This exists so the RED half of this plan fails legibly. Without it
    every case dies on an AttributeError inside a helper and the output
    blames the harness rather than the work that has not landed."""
    value = getattr(server, name, None)
    if value is None:
        raise AssertionError(
            "server." + name + " does not exist yet — the derived pass "
            "stop (D-18, D-20) has not landed")
    return value


# ---------------------------------------------------------------------------
# ---- source, stripped so a scan reads CODE rather than prose --------------

def strip_py_source(src):
    """`src` with every comment AND every string literal blanked, line
    count preserved.

    ⚠ A PYTHON DOCSTRING IS NOT A '#' COMMENT. `tokenize` knows the
    difference and does not have to be taught it. A file it cannot
    tokenize is returned unchanged — fail-visible, since the caller's
    assertion then reads the prose and says so, rather than passing
    silently on an empty string."""
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


def server_tree():
    """server.py's parse tree. ⚠ Carries no comment and no docstring
    position that a scan could trip over — the point of using it."""
    return ast.parse((REPO_ROOT / "server.py").read_text(encoding="utf-8"))


def module_assignments(tree):
    """{name: value-expression} for every top-level `NAME = expr`."""
    out = {}
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name):
                out[target.id] = node.value
    return out


def reachable_names(expr, assigns, seen=None):
    """Every Name and dotted attribute an expression reaches, following
    module-level assignments transitively.

    So `A = B * C` where `B = study_lib.X // study_lib.Y` reports
    study_lib.X and study_lib.Y — which is how "is this bound really
    derived from the batcher's constants" gets answered without trusting
    a single line."""
    seen = set() if seen is None else seen
    found = set()
    for node in ast.walk(expr):
        if isinstance(node, ast.Attribute) and \
                isinstance(node.value, ast.Name):
            found.add(node.value.id + "." + node.attr)
        elif isinstance(node, ast.Name):
            found.add(node.id)
            if node.id in assigns and node.id not in seen:
                seen.add(node.id)
                found |= reachable_names(assigns[node.id], assigns, seen)
    return found


def worker_batch_loop(tree, func_name):
    """The `for index, batch in enumerate(batches):` node inside one
    worker, or None. Located by SHAPE, never by line number."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef) or node.name != func_name:
            continue
        for inner in ast.walk(node):
            if not isinstance(inner, ast.For):
                continue
            if not isinstance(inner.iter, ast.Call):
                continue
            fn = inner.iter.func
            if not (isinstance(fn, ast.Name) and fn.id == "enumerate"):
                continue
            args = inner.iter.args
            if args and isinstance(args[0], ast.Name) and \
                    args[0].id == "batches":
                return inner
    return None


# ---------------------------------------------------------------------------
# ---- the harness ----------------------------------------------------------

@contextlib.contextmanager
def temp_home():
    """A throwaway HOME, with a STRUCTURAL guard that the room's config
    directory really resolved inside it.

    ⛔ Not politeness. The call record lives beside the keys file in the
    room's own config directory, which is a directory she really has,
    holding a real paid key."""
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-pass-stop-")
    os.environ["HOME"] = tmp
    try:
        resolved = str(study_lib.room_config_dir())
        root = str(Path(tmp).resolve())
        if not resolved.startswith(root + os.sep) and \
                not resolved.startswith(tmp + os.sep):
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
def echoing_transport():
    """The SHIPPED injection point, swapped and put back.

    Answers instantly, from the ids it was actually SENT — so a batch the
    loop never reached can never be marked, and "everything already merged
    is still on disk" becomes a countable fact rather than a hope.

    ⛔ `librarian_call._transport` is the seam's one transport hook. There
    is deliberately no environment variable and no config key that selects
    a transport, so a stray value in somebody's shell can never steer a
    production call; a second injection mechanism invented here would end
    that property. ⛔ The fake refuses any credential — the local rung
    takes none and this suite holds none."""
    seen = {"calls": 0, "urls": set()}

    def _fake(request, timeout_s, auth=None):
        if auth is not None:
            raise AssertionError(
                "a credential reached the transport on the local rung — "
                "the local rung takes none, and this suite holds none")
        seen["calls"] += 1
        DRIVEN["calls"] += 1
        seen["urls"].add(request.get("url"))
        body = json.dumps(request.get("body") or {}, ensure_ascii=False)
        ids = sorted(set(ID_RE.findall(body)))
        content = {
            "verdicts": [{"id": i, "shelf": "joyful", "why": "planted"}
                         for i in ids],
            "labels": [{"id": i, "unsure": False, "room": "study"}
                       for i in ids],
            "sections": [],
        }
        envelope = {
            "model": "qwen2.5:7b",
            "done_reason": "stop",
            "prompt_eval_count": 3,
            "eval_count": 4,
            "message": {"content": json.dumps(content, ensure_ascii=False)},
        }
        return (200, {}, json.dumps(envelope).encode("utf-8"))

    prior = librarian_call._transport
    librarian_call._transport = _fake
    try:
        yield seen
    finally:
        librarian_call._transport = prior


def local_routing():
    """The real resolution, against an empty shell and empty settings — so
    every job lands on her own machine and nothing needs a credential."""
    return librarian_call.resolve_routing({}, environ={})


def meta_batches(count, tag):
    """`count` metadata-only batches, one id each. The shape
    `librarian_batches` emits for the metadata half of a pass."""
    out = []
    for i in range(count):
        item_id = "%s-%s-%06d" % (ID_PREFIX, tag, i)
        out.append({
            "ids": [item_id],
            "text": json.dumps(
                {"meta_rows": [{"id": item_id, "title": "row"}]},
                ensure_ascii=False, separators=(",", ":")),
        })
    return out


def reset_jobs():
    """The job record back to a running start, so a case reads the state
    THIS pass left rather than the previous one's."""
    server.LIBRARIAN_JOB.update(state="running", total=0, done=0,
                                message=None, usage={},
                                unknown_id_verdicts=0)


def run_import_pass(home, batches, control):
    """One import pass, end to end, under a temporary HOME. Returns the
    notebook document the run left on disk."""
    reset_jobs()
    sugg = home / "library" / "librarian" / "suggestions.json"
    sugg.parent.mkdir(parents=True, exist_ok=True)
    with echoing_transport() as seen:
        server._presort_worker(batches, str(sugg), "api-key", False,
                               1_700_000_000_000,
                               routing=local_routing())
    DRIVEN["passes"] += 1
    if control:
        DRIVEN["controls"] += 1
    elif server.LIBRARIAN_JOB.get("state") == "stopped":
        DRIVEN["stops"] += 1
    return study_lib.load_suggestions(str(sugg)), seen


class PassStopTest(unittest.TestCase):

    # -- the bound, recomputed and then MOVED (B-5) -------------------------

    def test_import_bound_equals_an_independent_recompute(self):
        """The shipped import bound equals this file's own arithmetic over
        the batcher's three constants."""
        meta, budget, items = shipped_inputs()
        self.assertEqual(
            need("LIBRARIAN_PASS_STOP_IMPORT"),
            recompute_bound(meta, budget, items,
                            need("LIBRARIAN_PASS_CALLS_PER_BATCH_IMPORT")),
            "the import bound is not what the batcher's constants say it "
            "should be — either the expression drifted or a literal crept "
            "in")

    def test_mutating_the_metadata_batch_moves_the_bound(self):
        """⛔ THE MUTATION IS THE ASSERTION. Equality against a constant
        both sides read is tautological; a bound that does not MOVE when
        its input moves is a literal in disguise."""
        meta, budget, items = shipped_inputs()
        coef = need("LIBRARIAN_PASS_CALLS_PER_BATCH_IMPORT")
        base = recompute_bound(meta, budget, items, coef)
        moved = recompute_bound(meta + 7, budget, items, coef)
        self.assertNotEqual(base, moved,
                            "moving LIBRARIAN_METADATA_BATCH left the bound "
                            "where it was — the constant is not an input")
        self.assertEqual(base, need("LIBRARIAN_PASS_STOP_IMPORT"))
        self.assertNotEqual(moved, need("LIBRARIAN_PASS_STOP_IMPORT"))

    def test_mutating_the_body_budget_moves_the_bound(self):
        meta, budget, items = shipped_inputs()
        coef = need("LIBRARIAN_PASS_CALLS_PER_BATCH_IMPORT")
        base = recompute_bound(meta, budget, items, coef)
        moved = recompute_bound(meta, budget * 2, items, coef)
        self.assertNotEqual(base, moved,
                            "moving LIBRARIAN_BODY_BUDGET left the bound "
                            "where it was")
        self.assertEqual(base, need("LIBRARIAN_PASS_STOP_IMPORT"))

    def test_mutating_the_body_items_moves_the_bound(self):
        meta, budget, items = shipped_inputs()
        coef = need("LIBRARIAN_PASS_CALLS_PER_BATCH_IMPORT")
        base = recompute_bound(meta, budget, items, coef)
        moved = recompute_bound(meta, budget, items + 5, coef)
        self.assertNotEqual(base, moved,
                            "moving LIBRARIAN_BODY_ITEMS left the bound "
                            "where it was")

    def test_the_bound_is_not_a_literal(self):
        """Over the PARSE TREE: the bound's expression must reach all
        three of the batcher's constants and its own loop's coefficient."""
        assigns = module_assignments(server_tree())
        for name, coef in (
                ("LIBRARIAN_PASS_STOP_IMPORT",
                 "LIBRARIAN_PASS_CALLS_PER_BATCH_IMPORT"),):
            self.assertIn(name, assigns,
                          name + " is not assigned at server.py's top level")
            expr = assigns[name]
            self.assertNotIsInstance(
                expr, ast.Constant,
                name + " is a LITERAL — D-18 says derived, never typed")
            reached = reachable_names(expr, assigns)
            for needed in ("study_lib.LIBRARIAN_METADATA_BATCH",
                           "study_lib.LIBRARIAN_BODY_BUDGET",
                           "study_lib.LIBRARIAN_BODY_ITEMS", coef):
                self.assertIn(
                    needed, reached,
                    name + " does not reach " + needed + " — it is not "
                    "derived from the batcher")

    def test_the_coefficients_are_measured_from_the_loops(self):
        """⚠ THE COEFFICIENT IS THE ONLY TYPED NUMBER THE BOUND HAS, so
        it is counted here out of the loop itself rather than
        believed. Counted over COMMENT- AND STRING-STRIPPED source."""
        for func, const in (
                (server._presort_worker,
                 "LIBRARIAN_PASS_CALLS_PER_BATCH_IMPORT"),):
            src = stripped_source_of(func)
            counted = len(re.findall(r"record_call\(", src))
            self.assertEqual(
                counted, need(const),
                func.__name__ + " makes " + str(counted) + " call(s) per "
                "batch but " + const + " says " +
                str(need(const)) + " — the coefficient is a lie")

    # -- the static half: no loop exits without the bound ------------------

    def test_the_loop_never_exits_its_iteration_without_the_bound(self):
        """Over the PARSE TREE: the worker's batch iteration OPENS with a
        run of checks, and the bound is one of them.

        ⚠ Placed at the top on purpose. A check further down the body is a
        check every `continue`, every early `return` and every future
        branch above it can walk past.

        ⭐⭐ 2026-08-27 — THIS WAS WIDENED FROM "THE FIRST STATEMENT" TO
        "THE OPENING RUN OF CHECKS", AND IT WAS WIDENED WITH A NEW FENCE
        RATHER THAN RELAXED. 26.99955 UAT G-…-05 put HER STOP at the head
        of this loop, deliberately ahead of the bound: if she asked the
        sort to stop then the record must say she did, not attribute the
        ending to a ceiling that happened to fire in the same iteration.

        ⛔ SO WHAT IS PINNED NOW IS THE PROPERTY THE OLD SHAPE WAS A PROXY
        FOR: every check standing above the bound must END THE RUN
        outright. A `continue` above it — or an `if` that can fall through
        while the run carries on — is exactly the walk-past this case
        exists to catch, and it still fails here. What is permitted is a
        check that ends the run, because a run that has ended cannot then
        overspend."""
        tree = server_tree()
        for func_name, bound in (
                ("_presort_worker", "LIBRARIAN_PASS_STOP_IMPORT"),):
            loop = worker_batch_loop(tree, func_name)
            self.assertIsNotNone(
                loop, func_name + " has no `for index, batch in "
                "enumerate(batches)` loop — located by shape, never by line")
            self.assertIsInstance(
                loop.body[0], ast.If,
                func_name + "'s batch iteration does not OPEN with a "
                "check — anything above the bound can exit past it")
            at = None
            for i, stmt in enumerate(loop.body):
                if not isinstance(stmt, ast.If):
                    break
                names = {n.id for n in ast.walk(stmt.test)
                         if isinstance(n, ast.Name)}
                if bound in names:
                    at = i
                    break
            self.assertIsNotNone(
                at,
                func_name + " does not consult " + bound + " in the run of "
                "checks that opens its batch iteration — a bound reached "
                "further down is a bound every branch above it walks past")
            for stmt in loop.body[:at]:
                self.assertFalse(
                    stmt.orelse,
                    func_name + " has a branching check above " + bound +
                    " — a check with an `else` is a check the iteration can "
                    "come back from having skipped the bound")
                self.assertIsInstance(
                    stmt.body[-1], ast.Return,
                    func_name + " has a check above " + bound + " that does "
                    "NOT end the run — the iteration can carry on past the "
                    "bound without ever having consulted it")
                self.assertFalse(
                    [n for n in ast.walk(stmt) if isinstance(n, ast.Continue)],
                    func_name + " has a `continue` above " + bound +
                    " — that is the walk-past this case exists to catch")

    def test_the_dollar_ceiling_constant_is_gone(self):
        """⛔ D-03 recorded that deleting LIBRARIAN_COST_CEILING_USD was
        considered and rejected ONLY WHILE NOTHING REPLACED IT. Something
        replaces it now, so the inert constant may not remain."""
        src = strip_py_source(
            (REPO_ROOT / "server.py").read_text(encoding="utf-8"))
        # ⚠ Counted, never `assertNotIn` over the whole file: a failed
        # membership assertion prints its haystack, and the haystack here
        # is every byte of server.py.
        hits = src.count("LIBRARIAN_COST_CEILING_USD")
        self.assertEqual(
            hits, 0,
            "the dollar ceiling constant still stands in live code at " +
            str(hits) + " place(s) — a number set against nothing, free "
            "to drift")

    # -- her sentences ------------------------------------------------------

    def test_the_ceiling_sentence_has_exactly_one_source(self):
        """⛔ ONE SENTENCE, ONE CONSTANT. Her ruling was "same line both"
        while the stop had two sites; the second site went with the
        labelling pass (#95), so what is left to defend is that a SECOND
        LITERAL equal to hers is never typed somewhere else. Counted over
        stripped source, never `assertNotIn` over the whole file."""
        said = server.LIBRARIAN_CEILING_MSG
        # ⚠ RAW SOURCE, NOT STRIPPED, and that is the whole point here: the
        # stripper removes every string literal, which is exactly what this
        # case has to count. A second copy typed into a COMMENT counts too —
        # a sentence of hers quoted anywhere in this file is a place it can
        # be edited without the constant moving.
        src = (REPO_ROOT / "server.py").read_text(encoding="utf-8")
        hits = src.count(said)
        self.assertEqual(
            hits, 1,
            "her ceiling sentence is typed " + str(hits) + " times in "
            "server.py — one constant, or two places to drift apart")

    def test_the_ceiling_sentence_never_claims_a_stop_on_money(self):
        """⛔ D-18 and D-14. The pass costs nothing; a sentence saying it
        stopped at a cost limit is a false statement about her money, on a
        surface she meets."""
        for name in ("LIBRARIAN_CEILING_MSG",):
            said = getattr(server, name)
            low = said.lower()
            for sym in MONEY_SYMBOLS:
                self.assertNotIn(sym, said,
                                 name + " carries a currency symbol")
            for word in MONEY_WORDS:
                self.assertNotIn(
                    word, low,
                    name + " says '" + word + "' — the stop is counted in "
                    "work, and the pass costs nothing")

    # -- THE LIVE HALF: two planted reds and two controls, same run --------

    def test_an_oversized_import_pass_stops_the_loop(self):
        """⛔ THE CASE THIS WHOLE SUITE EXISTS FOR (B-1). A pass longer
        than the bound must stop AT the bound, keep everything already
        merged, and set the stopped state."""
        bound = need("LIBRARIAN_PASS_STOP_IMPORT")
        planted = bound + OVERSHOOT_BATCHES
        with temp_home() as home:
            doc, seen = run_import_pass(
                home, meta_batches(planted, "imp"), control=False)
        self.assertEqual(server.LIBRARIAN_JOB.get("state"), "stopped",
                         "the oversized import pass did not stop — a bound "
                         "that cannot fire is not a bound")
        self.assertEqual(server.LIBRARIAN_JOB.get("message"),
                         server.LIBRARIAN_CEILING_MSG)
        self.assertEqual(
            seen["calls"], bound,
            "the import loop made " + str(seen["calls"]) + " calls against "
            "a bound of " + str(bound))
        self.assertEqual(
            len(doc.get("verdicts") or {}), bound,
            "everything merged before the stop is not still on disk")
        runs = doc.get("runs") or []
        self.assertTrue(runs and runs[-1].get("stopped_why"),
                        "the run record does not say why it stopped")

    def test_a_control_import_pass_completes_in_the_same_run(self):
        """⚠ THE LIVE CONTROL. Without it, a stop that fired on
        EVERYTHING would read exactly like a stop that works."""
        with temp_home() as home:
            doc, seen = run_import_pass(
                home, meta_batches(CONTROL_BATCHES, "ctl"), control=True)
        self.assertEqual(server.LIBRARIAN_JOB.get("state"), "done",
                         "an ordinary import pass was stopped — the bound "
                         "fires on work nobody should be stopped for")
        self.assertEqual(seen["calls"], CONTROL_BATCHES)
        self.assertEqual(len(doc.get("verdicts") or {}), CONTROL_BATCHES)



# ⚠ THE CASE COUNT, BY VALUE (B-3). A run that examined zero cases must
# fail rather than print a cheerful line. Raise it when a case is added,
# and NEVER lower it to make a run pass.
EXPECTED_CASES = 12


def main():
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(PassStopTest)
    ran = suite.countTestCases()
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    print("CASES %d" % ran)
    try:
        print("BOUNDS import=%d calls"
              % (server.LIBRARIAN_PASS_STOP_IMPORT,))
    except AttributeError:
        print("BOUNDS none — the derived stop has not landed yet")
    print("LIVE %d passes driven (%d of them unmutated controls), "
          "%d stopped, %d fake calls answered"
          % (DRIVEN["passes"], DRIVEN["controls"], DRIVEN["stops"],
             DRIVEN["calls"]))
    if ran != EXPECTED_CASES:
        print("CASE COUNT MISMATCH: ran %d, file says %d"
              % (ran, EXPECTED_CASES))
    drove = (DRIVEN["passes"] == LIVE_PASSES
             and DRIVEN["controls"] == LIVE_CONTROLS
             and DRIVEN["stops"] == LIVE_PASSES - LIVE_CONTROLS)
    if not drove:
        print("LIVE MISMATCH: %d passes / %d controls / %d stops, "
              "expected %d / %d / %d"
              % (DRIVEN["passes"], DRIVEN["controls"], DRIVEN["stops"],
                 LIVE_PASSES, LIVE_CONTROLS, LIVE_PASSES - LIVE_CONTROLS))
    if not result.wasSuccessful() or ran != EXPECTED_CASES or not drove:
        return 1
    print("test_pass_stop OK (a derived bound that moves when its inputs "
          "move, driven RED in the worker loop, with a live control green "
          "in the same run)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
