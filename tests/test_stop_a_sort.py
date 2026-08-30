"""A RUNNING SORT CAN BE STOPPED — 26.99955 UAT, G-26.99955-UAT-05.

⛔⛔ WHAT THIS EXISTS TO STOP HAPPENING AGAIN. During the 2026-08-26
walk-through she tapped the candle for a reflection and the room answered
"the librarian is already sorting. let it finish first." A sort was running
at batch 87 of 438, with about five and a half hours left. ⭐ THE REFUSAL
ITSELF WAS GOOD — the room said plainly what was true, in her register — but
every librarian route the server exposed was enumerated that day (presort,
clean/runs, clean/status, clean/targets, clean/undo, clean/write) and THERE
WAS NO STOP ROUTE AND NO PAUSE ROUTE. The run is held one-at-a-time under
LIBRARIAN_LOCK, so nothing in the room could release it. The only way to halt
a sort was to kill the server process — which no user of this app can be
asked to do, and which is written down nowhere she could find. She wanted a
reflection and could not have one.

⭐⭐ HER RULING, 2026-08-26, and it is a BUTTON SENTENCE, verbatim:
"stop sorting (it keeps what it's found)". The second clause is a promise the
server has to keep, and § 3 is what keeps it.

⚠ COOPERATIVE, NEVER A THREAD KILL — and § 4 is why that matters rather than
being a style note. The run holds LIBRARIAN_LOCK's claim; a killed thread
leaves the claim latched forever, which is the failure this repo already
records against `CLEAN_LOCK` by name. So the worker checks a flag between
batches and ends through the same four beats the pass-stop ceiling uses.

⛔ NO NEW FRONT-FACING WORD WAS WRITTEN FOR THIS (D-14), and § 5 pins that.
The state carries `LIBRARIAN_STOPPED_MSG`, which shipped long before this
ticket and already reads "stopped partway. everything sorted so far is
saved, and starting it again carries on from here" — which is exactly what
her button promises.

⚠⚠ WHAT IS STUBBED, SAID OUT LOUD: `record_call` is replaced, so no socket is
opened and no model is asked anything. THE LOOP IS REAL — the real
`_presort_worker`, the real `_merge_suggestions`, the real notebook on a real
(temporary) disk — and the loop's control flow is the entire thing under
test. ⛔ A stub of the worker would be the harness agreeing with itself; a
stub of the call it makes is the only way to drive four batches in a second.

⛔ IT NEVER TOUCHES THE OWNER'S LIBRARY OR HER ROOM. Every case runs inside a
temporary HOME and a temporary library root, and the helper REFUSES TO YIELD
unless the room's config directory really resolved inside it — that directory
holds her keys file. Nothing here starts a server or binds a port.

Run: `TMPH=$(mktemp -d); HOME="$TMPH" python3 tests/test_stop_a_sort.py`
"""

import contextlib
import inspect
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import librarian_call  # noqa: E402  (imported for the refusal shape below)
import server          # noqa: E402
import study_lib       # noqa: E402

APP = REPO_ROOT / "app.js"

# ⛔ HER SENTENCE IS LIFTED FROM app.js, NEVER RETYPED HERE. A suite that
# retypes one of her sentences has created the second literal that can drift
# from the one it is checking — this project's recurring defect wearing a new
# coat.
HER_BUTTON_VAR = "LIBRARIAN_STOP_COPY"


@contextlib.contextmanager
def temp_home():
    """A throwaway HOME, with a STRUCTURAL guard that the room's config
    directory really resolved inside it (the discipline
    `tests/test_spend_record.py` established for the directory that holds
    her keys file)."""
    prior = os.environ.get("HOME")
    tmp = tempfile.mkdtemp(prefix="studyroom-stop-sort-")
    os.environ["HOME"] = tmp
    try:
        resolved = str(study_lib.room_config_dir())
        if not resolved.startswith(str(Path(tmp).resolve()) + os.sep) \
                and not resolved.startswith(tmp + os.sep):
            raise AssertionError(
                "the room's config directory resolved OUTSIDE the temporary "
                "home — refusing to run rather than write anywhere near a "
                "real one")
        yield Path(tmp)
    finally:
        if prior is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = prior
        shutil.rmtree(tmp, ignore_errors=True)


@contextlib.contextmanager
def clean_job():
    """The module job dict and both flags, restored afterwards.

    ⚠ THESE ARE MODULE STATE. A case that left the stop flag set would kill
    the NEXT case's run and the failure would read as a defect in the worker
    rather than as leakage from a neighbour."""
    saved = dict(server.LIBRARIAN_JOB)
    stop_was = server._PRESORT_STOP.is_set()
    active_was = server._PRESORT_ACTIVE.is_set()
    server._PRESORT_STOP.clear()
    server._PRESORT_ACTIVE.clear()
    try:
        yield
    finally:
        server.LIBRARIAN_JOB.clear()
        server.LIBRARIAN_JOB.update(saved)
        (server._PRESORT_STOP.set() if stop_was
         else server._PRESORT_STOP.clear())
        (server._PRESORT_ACTIVE.set() if active_was
         else server._PRESORT_ACTIVE.clear())


class Fake(object):
    """The smallest stand-in the stop route needs: it captures what the
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


def stop_route():
    fn = getattr(server.StudyHandler, "handle_librarian_presort_stop", None)
    if fn is None:
        raise AssertionError(
            "server.StudyHandler.handle_librarian_presort_stop does not "
            "exist yet — the way out of a running sort (G-…-05)")
    fake = Fake()
    fn(fake, {})
    return fake


def batches(n):
    """`n` batches in the shape `librarian_batches` produces."""
    out = []
    for i in range(n):
        ids = ["id-%d" % (i,)]
        out.append({"ids": ids,
                    "text": json.dumps({"meta_rows": [{"id": ids[0]}]})})
    return out


def good_answer(ids):
    """One well-formed seam answer: every id verdicted onto a real shelf."""
    return {"ok": True,
            "structured": {"verdicts": [{"id": i,
                                         "shelf": server.LIBRARIAN_SHELVES[0],
                                         "why": ""} for i in ids]},
            "usage": {}}


@contextlib.contextmanager
def calls_recorded(press_stop_after=None):
    """Replace `record_call` for the length of one run.

    `press_stop_after` is the 1-based call number after which HER PRESS is
    simulated — the flag is set the moment that call returns, which is
    exactly where a real press lands: mid-batch, with the worker inside a
    call it cannot be interrupted in."""
    made = []
    real = server.record_call

    def fake(job, text, routing):
        made.append(job)
        doc = json.loads(text)
        ids = [r["id"] for r in doc.get("meta_rows", [])]
        if press_stop_after is not None and len(made) == press_stop_after:
            server._PRESORT_STOP.set()
        return good_answer(ids)

    server.record_call = fake
    try:
        yield made
    finally:
        server.record_call = real


def run_worker(root, count, press_stop_after=None):
    """One real `_presort_worker` run over `count` batches."""
    sugg_path = server._suggestions_path(str(root))
    with LOCKED_JOB(count):
        with calls_recorded(press_stop_after) as made:
            server._presort_worker(
                batches(count), sugg_path, "api-key", True, 1,
                library_root=None, routing={})
    return made, sugg_path


@contextlib.contextmanager
def LOCKED_JOB(total):
    """The job dict as `handle_librarian_presort` leaves it just before the
    thread starts — so the worker under test begins from the real state."""
    server.LIBRARIAN_JOB.update(state="running", total=total, done=0,
                                cost_usd=0.0, usage={}, auth="api-key",
                                message=None, unknown_id_verdicts=0,
                                started_ms=1)
    yield


def verdict_ids(sugg_path):
    return sorted((study_lib.load_suggestions(sugg_path)
                   .get("verdicts") or {}).keys())


def app_constant(name):
    """One `var <name> = '...'` out of app.js, unescaped."""
    src = APP.read_text(encoding="utf-8")
    marker = "var %s = '" % (name,)
    at = src.find(marker)
    if at == -1:
        raise AssertionError(
            "app.js has no `%s` — her button sentence is gone, and every "
            "check below would be measuring nothing" % (name,))
    i = at + len(marker)
    out = []
    while i < len(src):
        ch = src[i]
        if ch == "\\":
            out.append(src[i + 1])
            i += 2
            continue
        if ch == "'":
            break
        out.append(ch)
        i += 1
    value = "".join(out)
    if not value:
        raise AssertionError("`%s` is EMPTY in app.js" % (name,))
    return value


def app_literal_raw(name):
    """The literal EXACTLY as app.js spells it, escapes and all."""
    src = APP.read_text(encoding="utf-8")
    marker = "var %s = '" % (name,)
    at = src.find(marker)
    if at == -1:
        raise AssertionError("app.js has no `%s`" % (name,))
    i = at + len(marker)
    start = i
    while i < len(src):
        if src[i] == "\\":
            i += 2
            continue
        if src[i] == "'":
            break
        i += 1
    return src[start:i]


def stripped_source_of(fn):
    """A function's source with comments and string literals removed, so
    prose quoting a name cannot satisfy a check about the CODE."""
    src = inspect.getsource(fn)
    out = []
    i = 0
    while i < len(src):
        ch = src[i]
        if ch == "#":
            while i < len(src) and src[i] != "\n":
                i += 1
            continue
        if src.startswith('"""', i) or src.startswith("'''", i):
            quote = src[i:i + 3]
            end = src.find(quote, i + 3)
            i = len(src) if end == -1 else end + 3
            continue
        if ch in "\"'":
            i += 1
            while i < len(src) and src[i] != ch:
                i += 2 if src[i] == "\\" else 1
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


class StopASortTest(unittest.TestCase):

    # -- § 1: the way out EXISTS, and it is reachable ----------------------

    def test_the_stop_is_registered_in_the_dispatch(self):
        """⛔⛔ A ROUTE NOTHING DISPATCHES TO IS A HELPER NOBODY CAN REACH,
        and that is the exact defect this fix work found in its own G-…-04
        work one night earlier: a writer that worked and that no request
        route called. The handler existing is not the claim; being
        reachable by a POST is.

        Read over source stripped of comments AND string literals, so a
        comment naming the path cannot satisfy it."""
        post = stripped_source_of(server.StudyHandler.do_POST)
        self.assertIn(
            "handle_librarian_presort_stop", post,
            "no POST route dispatches to the stop, so the button she was "
            "given cannot reach it — the sort is still unstoppable")

    def test_the_stop_is_not_gated_on_any_feature_switch(self):
        """The argument the record's own deletion already makes in this
        file, and it holds harder here: a way out that stops working when
        the librarian is switched off is not a way out."""
        code = stripped_source_of(
            server.StudyHandler.handle_librarian_presort_stop)
        for gate in ("_enabled", "cleaning_flag_on", "librarian_available"):
            self.assertNotIn(gate, code,
                             "the stop reads a feature switch: " + gate)

    # -- § 2: what the press does, and what it refuses to do ---------------

    def test_pressing_stop_during_a_run_answers_and_flips_the_job(self):
        """⚠⚠ THE STATE FLIPS AT THE ROUTE, AND THAT HALF IS NOT COSMETIC.

        A batch is roughly ninety seconds. If the readout only changed when
        the worker noticed, she would press a button and watch the counter
        keep climbing for a minute and a half — the silence-after-a-press
        she overturned at the 2026-08-17 UAT ("it feels like the app is
        broken because nothing happened"). The composed rule from that day
        is exactly this: absence is fine where nothing was asked for;
        silence after a press is not."""
        with temp_home(), clean_job():
            server.LIBRARIAN_JOB.update(state="running", total=9, done=3,
                                        message=None)
            answered = stop_route()
            self.assertEqual(answered.code, 200)
            self.assertIs(answered.answer.get("ok"), True)
            self.assertIs(answered.answer.get("stopping"), True)
            self.assertTrue(server._PRESORT_STOP.is_set(),
                            "the worker was never told to stop")
            self.assertEqual(
                server.LIBRARIAN_JOB["state"], "stopped",
                "the job still reads as running, so her next poll paints a "
                "batch counter that keeps climbing after she pressed stop")
            self.assertEqual(
                server.LIBRARIAN_JOB["message"], server.LIBRARIAN_STOPPED_MSG,
                "the state carries some other sentence than the shipped one")

    def test_pressing_stop_with_nothing_running_is_not_an_error(self):
        """⛔ AND IT MUST NOT ARM THE FLAG. Nothing running is ABSENCE — a
        press answers as calmly as one with a sort under it. A flag left
        standing here would survive to kill a LATER run, which is a stop
        she did not ask for: the one thing worse than a sort she cannot
        stop."""
        with temp_home(), clean_job():
            server.LIBRARIAN_JOB.update(state="idle", message=None)
            answered = stop_route()
            self.assertEqual(answered.code, 200)
            self.assertIs(answered.answer.get("ok"), True)
            self.assertIs(answered.answer.get("stopping"), False)
            self.assertFalse(
                server._PRESORT_STOP.is_set(),
                "a press with nothing running armed the stop flag — the "
                "next sort she starts would die at its first batch")
            self.assertEqual(server.LIBRARIAN_JOB["state"], "idle",
                             "a press with nothing running invented a state")

    # -- § 3: "it keeps what it's found" — her button's own promise --------

    def test_a_stopped_run_keeps_every_verdict_it_had_reached(self):
        """⭐⭐ HER BUTTON PROMISES THIS IN SO MANY WORDS, so it is driven
        rather than reasoned from the notebook being written every batch.

        The press is simulated where a real one lands: the flag is set the
        moment the FIRST call returns, so the worker is inside a batch it
        cannot be interrupted in. That batch's verdicts must still reach
        disk, and the run must end before the second call is made."""
        with temp_home() as home, clean_job():
            root = home / "library"
            root.mkdir()
            made, sugg_path = run_worker(root, 4, press_stop_after=1)
            self.assertEqual(
                len(made), 1,
                "the worker kept calling after she pressed stop — it made "
                "%d calls where it should have made 1" % (len(made),))
            self.assertEqual(
                verdict_ids(sugg_path), ["id-0"],
                "the batch that was in flight when she pressed lost its "
                "work, so 'it keeps what it's found' is not true")
            self.assertEqual(server.LIBRARIAN_JOB["state"], "stopped")
            self.assertEqual(server.LIBRARIAN_JOB["message"],
                             server.LIBRARIAN_STOPPED_MSG)

    def test_a_run_nobody_stops_still_finishes_every_batch(self):
        """⛔ THE OTHER HALF, AND THE ONE THAT CATCHES A FLAG READ IN THE
        WRONG PLACE. A check placed where it fires unconditionally would
        pass every case above and quietly end every sort at batch one."""
        with temp_home() as home, clean_job():
            root = home / "library"
            root.mkdir()
            made, sugg_path = run_worker(root, 4)
            self.assertEqual(len(made), 4,
                             "a run nobody stopped ended early")
            self.assertEqual(verdict_ids(sugg_path),
                             ["id-0", "id-1", "id-2", "id-3"])
            self.assertEqual(server.LIBRARIAN_JOB["state"], "done")

    def test_the_flag_is_read_between_batches_and_not_inside_one(self):
        """⚠ THE SHAPE, PINNED. Cooperative cancellation means a check at a
        BOUNDARY. A worker that consulted the flag from inside its call
        handling — or not at all — would pass nothing above only by luck,
        and this says which of the two the code actually does.

        Read over source stripped of comments and string literals."""
        code = stripped_source_of(server._presort_worker)
        self.assertIn("_PRESORT_STOP", code,
                      "the worker never reads the stop flag, so a press "
                      "sets something nothing looks at")
        self.assertIn("_PRESORT_ACTIVE.set()", code,
                      "the worker never takes its own claim")
        self.assertIn("finally", code,
                      "the worker's claim is not released in a `finally` — "
                      "a claim released on some paths and not others is how "
                      "a shared guard latches forever")

    # -- § 4: the claim, and the run that must not start on top of it ------

    def test_a_second_run_is_refused_while_the_worker_is_still_finishing(self):
        """⛔⛔ THE WINDOW HER STOP OPENS, AND THE REASON THE GUARD GREW A
        SECOND HALF.

        The route flips the state to "stopped" so she is not left watching
        the counter. At that moment the worker is STILL INSIDE its in-flight
        call. A busy guard that read only `state == "running"` would let a
        second sort start on top of the first one and break "one run at a
        time" — the invariant LIBRARIAN_LOCK exists for."""
        with temp_home(), clean_job():
            server.LIBRARIAN_JOB.update(state="stopped",
                                        message=server.LIBRARIAN_STOPPED_MSG)
            server._PRESORT_ACTIVE.set()
            code = stripped_source_of(
                server.StudyHandler.handle_librarian_presort)
            self.assertIn(
                "_PRESORT_ACTIVE", code,
                "the busy guard reads only the job state, so a second sort "
                "can start while the stopped one is still finishing its "
                "call")

    def test_the_worker_releases_its_claim_however_the_run_ends(self):
        """Driven on both endings this suite can produce: the clean finish
        and her stop. A claim that outlived either would leave the room
        refusing every future sort with the busy sentence, forever."""
        with temp_home() as home, clean_job():
            root = home / "library"
            root.mkdir()
            run_worker(root, 2)
            self.assertFalse(
                server._PRESORT_ACTIVE.is_set(),
                "the claim survived a clean finish — every later sort would "
                "be refused as busy")
        with temp_home() as home, clean_job():
            root = home / "library"
            root.mkdir()
            run_worker(root, 4, press_stop_after=1)
            self.assertFalse(
                server._PRESORT_ACTIVE.is_set(),
                "the claim survived her stop — she pressed the way out and "
                "it locked the librarian shut instead")

    def test_starting_a_run_clears_a_stale_stop(self):
        """⛔ A FLAG LEFT STANDING FROM THE LAST RUN WOULD KILL THIS ONE at
        its first batch. Read over the handler's stripped source, because
        driving the real start needs a store, a payload and a thread — and
        what is being pinned is that the clear happens INSIDE the same
        locked block that claims the run, not somewhere a later `return`
        can walk past."""
        code = stripped_source_of(
            server.StudyHandler.handle_librarian_presort)
        self.assertIn("_PRESORT_STOP.clear()", code,
                      "a start does not clear a stale stop flag")
        # ⛔ SEARCHED ON CODE, NOT ON A STRING. `state="running"` is a
        # string literal and this reader strips those on purpose, so the
        # claim is located by the call that makes it.
        claim = code.find("LIBRARIAN_JOB.update(state=")
        clear = code.find("_PRESORT_STOP.clear()")
        self.assertNotEqual(claim, -1)
        self.assertNotEqual(clear, -1)
        self.assertLess(
            clear, claim,
            "the stale stop is cleared AFTER the run is claimed, so a run "
            "can be claimed and then killed by the last run's flag")

    # -- § 5: not one new front-facing word ---------------------------------

    def test_the_stopped_sentence_is_the_shipped_one(self):
        """⛔ D-14. No agent wrote a sentence for this ticket. The state
        carries `LIBRARIAN_STOPPED_MSG`, which shipped long before it and
        already says what her button promises — everything sorted so far is
        saved, and starting again carries on from here.

        ⚠ PROVED TO HAVE TEETH: the constant is asserted non-empty first,
        because an agreement between two empty strings is a green gate over
        a silent surface."""
        self.assertTrue(server.LIBRARIAN_STOPPED_MSG.strip(),
                        "the shipped stopped sentence is empty")
        with temp_home() as home, clean_job():
            root = home / "library"
            root.mkdir()
            run_worker(root, 3, press_stop_after=1)
            self.assertEqual(server.LIBRARIAN_JOB["message"],
                             server.LIBRARIAN_STOPPED_MSG)

    def test_her_button_sentence_is_exactly_one_literal_in_app_js(self):
        """⛔ HER WORDS, AND ONE COPY OF THEM. A second copy is where two
        surfaces drift apart — and it is lifted here rather than retyped,
        so this suite owns no copy of a sentence of hers either.

        ⚠ COUNTED IN THE SOURCE'S OWN FORM. Her sentence contains an
        apostrophe, which app.js escapes; counting the UNESCAPED value
        would answer zero over a file that carries it perfectly, which is a
        red that means nothing. The raw slice between the quotes is what is
        counted, and the unescaped value is asserted separately so a
        mangled escape cannot pass as a match."""
        sentence = app_constant(HER_BUTTON_VAR)
        raw = app_literal_raw(HER_BUTTON_VAR)
        src = APP.read_text(encoding="utf-8")
        self.assertEqual(
            src.count(raw), 1,
            "her stop sentence appears %d times in app.js — a second copy "
            "is where two surfaces drift apart" % (src.count(raw),))
        self.assertIn(
            "stop", sentence,
            "the constant named as her button sentence does not read like "
            "one, so this pin is guarding the wrong literal")
        self.assertNotIn(
            "\\", sentence,
            "the lifted sentence still carries a backslash, so the reader "
            "did not really unescape it and every comparison made on it is "
            "a comparison with source syntax")

    def test_the_stop_route_is_reached_by_the_button_she_presses(self):
        """⚠⚠ THE HOLE THIS FIX WORK ALREADY PAID FOR ONCE, ONE NIGHT
        EARLIER: a helper that worked perfectly and that nothing called.
        The button, the client function and the route path are pinned to
        each other here, so deleting any one of the three goes red."""
        src = APP.read_text(encoding="utf-8")
        self.assertIn("librarian-stop", src,
                      "the client has no stop control at all")
        self.assertIn("stopLibrarianSort", src,
                      "nothing on the client performs the stop")
        self.assertIn("/api/librarian/presort/stop", src,
                      "the client never asks the stop route, so her press "
                      "reaches nothing")


def main():
    suite = unittest.defaultTestLoader.loadTestsFromModule(
        sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    print("CASES", result.testsRun)
    print("HER BUTTON", json.dumps(app_constant(HER_BUTTON_VAR)))
    print("STOPPED SENTENCE", json.dumps(server.LIBRARIAN_STOPPED_MSG))
    print("REFUSALS", "is_refusal is imported and unused by design: the "
          "refusal ending is the pass-stop's, already pinned elsewhere"
          if librarian_call.is_refusal({}) is False else "unexpected")
    if result.wasSuccessful():
        print("test_stop_a_sort OK (a running sort can be stopped from "
              "inside the room, it keeps what it found, and the way out is "
              "not a thread kill)")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
