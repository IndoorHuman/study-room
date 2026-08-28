#!/usr/bin/env python3
"""
The librarian's memory of HER — Phase 26.995, Plan 10 (D-19…D-27, SRM-13).

WHAT IS UNDER TEST. One plain local file under her librarian folder holding
what she typed during a sitting she PASSED on: her sentence, the name of the
reflection it is anchored to, and a stamp — and nothing else. Plus the
close-time writer that fills it, which has to run BEFORE the step that
destroys the only place her words live.

WHY THIS FILE EXISTS, and it is a real shipped mechanism rather than a
hypothetical. On a pass, her entire chat transcript is destroyed when
`librarian/session.json` is unlinked at close (step ④ of
`handle_librarian_session_close`). Before this plan there was NO place a
passed sitting's words survived — she could tell the room its writing missed
and the room forgot she had spoken by the time the candle went out. So the
ordering is not a nicety: a writer placed one line later stores nothing, and
it would still pass every test that only looked at the store afterwards.
Case 14 therefore proves the ordering by OBSERVING the session file from
inside the writer, not by reading the source.

WHAT THIS FILE IS NOT. It is not a test of what the memory is USED for — no
reflection document is built here and no prompt is read. Plan 11 owns the
read, and with it T-26.995-02: anything taken back out of this store and put
into a prompt must pass the shipped fenced-title predicate AT READ TIME. That
obligation is recorded here so it cannot be inherited silently.

WHAT IT NEVER TOUCHES. The real home directory (every case runs under a temp
HOME it made itself, asserted before the first write), the real config
directory, the owner's key, and any live call — the close route calls no
model at all, which is why this suite installs no transport stub. Her real
librarian folder is READ ONCE, read-only, by the corpus-gate case, through
`tests/test_stage_public.py`'s own import-time capture.

Stdlib only (unittest + threading + http.client + tempfile) — the
zero-dependency law.

Run:  python3 -m unittest tests.test_reflection_memory -v
      TMPH=$(mktemp -d); HOME="$TMPH" python3 -m unittest tests.test_reflection_memory
      python3 tests/test_reflection_memory.py     # + the source-mutation drill
"""
import http.client
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import server  # noqa: E402  — plain import binds no socket
import study_lib  # noqa: E402
import librarian_call as L  # noqa: E402  — for its key-name roster only

# ⚠ CAPTURED AT IMPORT, BEFORE ANY CASE MOVES THE HOME DIRECTORY, so `main()`
# can prove afterwards that the swap never leaked onto the real config
# directory — which holds a real paid credential.
REAL_HOME = os.path.expanduser("~")
REAL_ROOM_DIR = os.path.join(REAL_HOME, study_lib.ROOM_CONFIG_DIR_NAME)
REAL_ROOM_DIR_EXISTED = os.path.exists(REAL_ROOM_DIR)

EXPECTED_CASES = 53


# ---------------------------------------------------------------------------
# ---- HER TWO SENTENCES, AS SHE CHOSE THEM ---------------------------------
#
# ⛔ NEITHER OF THESE WAS WRITTEN BY AN AGENT. Both were chosen by the owner
# from candidate sets on 2026-08-18 and are recorded verbatim in
# `26.995-COPY.md` §§ C-1 and C-8. They are re-typed here — deliberately NOT
# imported from the module under test — because a check that read the value it
# is checking would pin whatever is there as correct, which is this project's
# signature defect. The line breaks below are HERS as she was shown them.
# ---------------------------------------------------------------------------

# § C-8 — the note at the top of her memory file. She was offered four
# candidates and chose to MATCH THE EXISTING SIBLING FILE'S SHAPE.
# ⚠ The wrapping is presentation, exactly as it is for the sibling constant
# `REFLECTIONS_FILE_NOTE`, which she was shown wrapped the same way and which
# ships as ONE line. The assertion below joins her lines with single spaces
# and demands byte equality, so a reworded clause fails and a re-wrapped one
# does not.
HER_FILE_NOTE_LINES = (
    "derived, not authored. your own sentences from sittings you passed on, "
    "kept whole",
    "and in the order you typed them — nothing is sorted, labelled or scored."
    " safe to",
    "edit or delete; it starts over.",
)

# § C-1 — what the room says about deleting the librarian's memory. She was
# offered four stances and chose the one that LEADS WITH THE MEMORY BEING
# HERS. ⛔ The clause order IS the choice: read/change/delete first, the reset
# second. An agent must not reorder it to warn first, and must not append a
# consequence clause to make the cost louder — she was shown a candidate that
# led with the cost and did not pick it. Here the line breaks are real.
HER_RESET_COPY_LINES = (
    "this is the librarian's memory of you, in plain files",
    "you can read, change, or delete.",
    "deleting all of it is how you start it over.",
)


def temp_home(case):
    """Point HOME at a fresh temp tree and pop every credential name.

    ⚠ THE TEMP ROOT COMES FIRST AND NOTHING IS WRITTEN BEFORE THE ASSERTION
    BELOW (the `test_base_url_consent.BaseConsentCase` shape). ⛔ Both
    credential names are popped even though nothing here resolves a fill: a
    case that read the real shell's key would be reporting the machine rather
    than the code. Every variable is restored through a cleanup that
    distinguishes UNSET from SET-TO-EMPTY — a leaked variable once turned a
    later, alphabetically-ordered suite red for a reason nothing at the
    failure site explained.
    """
    home = tempfile.mkdtemp(prefix="study-room-her-sentences-")
    saved_home = os.environ.get("HOME")
    os.environ["HOME"] = home
    saved = {}
    for name in list(L.KEY_ENV_NAMES.values()):
        saved[name] = os.environ.pop(name, None)

    def restore():
        for name, value in saved.items():
            if value is not None:
                os.environ[name] = value
            else:
                os.environ.pop(name, None)
        if saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = saved_home
        shutil.rmtree(home, ignore_errors=True)

    case.addCleanup(restore)
    # realpath on BOTH sides: the system temp location is itself a symlink on
    # this platform, so a prefix test on the raw strings would be vacuous.
    root = os.path.realpath(home)
    here = os.path.realpath(str(study_lib.room_config_dir()))
    case.assertTrue(
        here == root or here.startswith(root + os.sep),
        "a path this suite is about to write is not under its own temp root")
    case.assertNotEqual(here, os.path.realpath(REAL_ROOM_DIR))
    return home


class HerSentencesStoreCase(unittest.TestCase):
    """The quartet: path, fail-open load, atomic save, newest-first read."""

    def setUp(self):
        temp_home(self)
        self._tmp = tempfile.TemporaryDirectory()
        self.library = Path(self._tmp.name) / "library"
        self.library.mkdir(parents=True)
        self.addCleanup(self._tmp.cleanup)

    def path(self):
        return study_lib.her_sentences_file_path(self.library)

    def entry(self, text, about="the thread", ms=1):
        return {"text": text, "about": about, "ms": ms}

    # -- 1 ------------------------------------------------------------------

    def test_three_sentences_come_back_byte_identical_newest_first(self):
        said = ["it read like an essay about me",
                "去年的那个冬天，你写错了",
                "the ferry bit is the only part i wanted"]
        study_lib.save_her_sentences(
            self.library, [self.entry(t, ms=i) for i, t in enumerate(said)])
        got = study_lib.her_sentences_memory(self.library)["sentences"]
        self.assertEqual(
            [e["text"] for e in got], list(reversed(said)),
            "her sentences must come back verbatim and newest first — the "
            "whole point of D-26 is that her words reach the writing "
            "UNSORTED and unchanged, so a reorder or a rewrite here is the "
            "failure this store exists to prevent")

    # -- 2 ------------------------------------------------------------------

    def test_the_stored_key_set_is_her_sentence_its_anchor_and_a_stamp(self):
        study_lib.save_her_sentences(self.library, [self.entry("it missed")])
        stored = json.loads(self.path().read_text(encoding="utf-8"))
        self.assertEqual(
            sorted(stored["sentences"][0]), ["about", "ms", "text"],
            "a field added beside her sentence IS a category, and she ruled "
            "(D-26) that nothing files her reaction into a box. No label, no "
            "rating, no sentiment, no length, no derived field of any kind "
            "may sit here — this is asserted by value so a later addition "
            "cannot arrive quietly")

    # -- 3 ------------------------------------------------------------------

    def test_two_entries_in_the_same_millisecond_keep_their_write_order(self):
        # Hand-built pair, both stamped identically. This is not contrived:
        # one passed sitting writes every one of her turns under ONE stamp.
        study_lib.save_her_sentences(self.library, [
            self.entry("first thing i said", ms=1_700_000_000_000),
            self.entry("second thing i said", ms=1_700_000_000_000)])
        got = study_lib.her_sentences_memory(self.library)["sentences"]
        self.assertEqual(
            [e["text"] for e in got],
            ["second thing i said", "first thing i said"],
            "equal stamps must fall back to WRITE ORDER, newest written "
            "first. File order is what carries this; a reader that sorted on "
            "`ms` would silently reverse the pair and nothing else would "
            "notice")

    # -- 4 ------------------------------------------------------------------

    def test_a_damaged_or_absent_file_reads_as_the_empty_wrapper(self):
        empty = {"sentences": []}
        # (a) missing entirely
        self.assertEqual(study_lib.load_her_sentences(self.library), empty)
        self.path().parent.mkdir(parents=True, exist_ok=True)
        bad_inputs = [
            ("an empty file", b""),
            ("random bytes", bytes(range(256)) * 4),
            ("valid json of the wrong top-level shape", b'["not a dict"]'),
            ("a dict whose entries key is not a list", b'{"sentences": 7}'),
            ("truncated json", b'{"sentences": [{"text": "half'),
        ]
        for why, blob in bad_inputs:
            self.path().write_bytes(blob)
            try:
                got = study_lib.load_her_sentences(self.library)
            except Exception as exc:            # noqa: BLE001 — the point
                self.fail("the loader raised on " + why + " (" + repr(exc)
                          + "). Fail-open is the posture: a damaged memory "
                          "is NO memory, never an error that costs her a "
                          "sitting")
            self.assertEqual(got, empty, "fail-open failed for " + why)
            self.assertEqual(
                study_lib.her_sentences_memory(self.library), empty,
                "the reader must be fail-open too, for " + why)

    # -- 5 ------------------------------------------------------------------

    def test_the_cap_keeps_the_newest_and_drops_the_oldest(self):
        cap = study_lib.HER_SENTENCES_CAP
        self.assertEqual(
            cap, 60,
            "the cap is asserted BY VALUE. A store with no cap constant "
            "anywhere near it is the warning sign, and a cap that drifts "
            "silently is the same thing one step later")
        study_lib.save_her_sentences(
            self.library,
            [self.entry("said number " + str(i), ms=i)
             for i in range(cap + 5)])
        stored = json.loads(
            self.path().read_text(encoding="utf-8"))["sentences"]
        self.assertEqual(len(stored), cap, "the cap bounds what is KEPT")
        self.assertEqual(
            stored[0]["text"], "said number 5",
            "the OLDEST five are the ones dropped — D-21 rules this a "
            "keep-the-newest bound, never an age rule")
        self.assertEqual(stored[-1]["text"], "said number " + str(cap + 4))

    # -- 6 ------------------------------------------------------------------

    def test_an_interrupted_write_leaves_the_previous_bytes_intact(self):
        study_lib.save_her_sentences(self.library, [self.entry("the first")])
        before = self.path().read_bytes()
        real_replace = os.replace

        def die(src, dst):
            raise OSError("interrupted after the temp file was created")

        os.replace = die
        try:
            with self.assertRaises(OSError):
                study_lib.save_her_sentences(
                    self.library, [self.entry("the second")])
        finally:
            os.replace = real_replace
        self.assertEqual(
            self.path().read_bytes(), before,
            "an interrupted write must leave the previous file byte-intact. "
            "This is the same-directory temp + fsync + os.replace primitive "
            "doing its job; a hand-rolled open-and-write would have "
            "truncated her words here")
        leftovers = [p.name for p in self.path().parent.glob(".tmp-*.swap")]
        self.assertEqual(leftovers, [],
                         "the temp file is removed when the write fails")

    # -- 7 ------------------------------------------------------------------

    def test_the_file_carries_her_note_at_the_top_byte_identical(self):
        self.assertEqual(
            study_lib.HER_SENTENCES_FILE_NOTE, " ".join(HER_FILE_NOTE_LINES),
            "the note at the top of her memory file is HERS (COPY § C-8, "
            "2026-08-18) and is applied verbatim. ⛔ Do not swap 'not "
            "authored' for 'not composed' — she chose the phrasing that "
            "matches the sibling file beside it. ⛔ Do not trim 'nothing is "
            "sorted, labelled or scored' — that clause is D-26 in her own "
            "register and is the one a later reader is likeliest to cut as "
            "redundant")
        study_lib.save_her_sentences(self.library, [self.entry("hello")])
        stored = json.loads(self.path().read_text(encoding="utf-8"))
        self.assertEqual(
            stored.get("note"), " ".join(HER_FILE_NOTE_LINES),
            "the note must be IN the file, not only in the module — the "
            "whole of D-20 is that she opens this file and reads it")
        text = self.path().read_text(encoding="utf-8")
        self.assertLess(
            text.index('"note"'), text.index('"sentences"'),
            "the note sits at the TOP, where someone opening the file reads "
            "it first")

    # -- 8 ------------------------------------------------------------------

    def test_the_reset_sentence_is_hers_and_in_her_clause_order(self):
        copy = study_lib.LIBRARIAN_MEMORY_RESET_COPY
        self.assertEqual(
            copy, "\n".join(HER_RESET_COPY_LINES),
            "what the room says about deleting the librarian's memory is "
            "HERS (COPY § C-1, 2026-08-18) and is applied verbatim, line "
            "breaks included")
        self.assertLess(
            copy.index("read, change, or delete"),
            copy.index("deleting all of it"),
            "⛔ THE CLAUSE ORDER IS THE CHOICE. Read/change/delete first, "
            "the reset second — that is D-20's 'visible and editable, no "
            "hidden state' in her own register, and it makes deleting read "
            "as one option among three rather than a red button. She was "
            "shown a candidate that led with the cost and did not pick it")

    # -- 9 ------------------------------------------------------------------

    def test_an_old_sentence_is_dropped_by_the_cap_and_never_by_age(self):
        # A year old, and the only other entry is from this second.
        study_lib.save_her_sentences(self.library, [
            self.entry("said a year ago", ms=1),
            self.entry("said just now", ms=2_000_000_000_000)])
        got = study_lib.her_sentences_memory(self.library)["sentences"]
        self.assertEqual(
            len(got), 2,
            "⛔ D-21 amended the fade rule FOR THIS PILE: her sentences do "
            "NOT fade on a clock. The room looks at the newest handful and "
            "she may delete any. Nothing in this store may measure age")


class CloseTimeWriterCase(unittest.TestCase):
    """The writer, driven through the real close route over HTTP.

    ⚠ No model is called anywhere in this class: `/api/librarian/session/close`
    consults no provider, which is why no transport stub is installed. HOME is
    swapped anyway, so a future edit that DID reach for a credential would
    find a temp tree rather than her key."""

    def setUp(self):
        temp_home(self)
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.library = Path(self._tmp.name) / "library"
        self.library.mkdir(parents=True)
        with server.LIBRARIAN_LOCK:
            server.LIBRARIAN_JOB.update(state="idle", total=0, done=0,
                                        cost_usd=0.0, auth=None,
                                        message=None, started_ms=0,
                                        stage=None, rejected_drafts=0,
                                        rejected_why=None)
        self.httpd = server.create_server(self.library, 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever,
                                       daemon=True)
        self.thread.start()
        self.addCleanup(self._stop)

    def _stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)

    # -- helpers ------------------------------------------------------------

    REJECTED = ("## the ferry\n\nthe room's own essay, which she passed on. "
                "SENTINEL-REJECTED-ESSAY-TEXT.")

    def seed_session(self, chat):
        study_lib.save_session_file(self.library, {
            "state": "active", "consented": True,
            "pool": {"meta_rows": [], "bodies": [], "counts": {}},
            "draft": self.REJECTED, "name": "the ferry",
            "coda": None, "chat": list(chat), "created_ms": 1})

    def seed_ledger(self, titles):
        """Unstamped records, oldest first — what a refined-then-passed
        sitting leaves behind: one per draft that landed."""
        study_lib.save_reflections(self.library, [
            {"title": t, "shape": "claim-first", "outcome": None,
             "model": "opus", "ms": 100 + i}
            for i, t in enumerate(titles)])

    def close(self, outcome):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        try:
            raw = json.dumps({"outcome": outcome}).encode("utf-8")
            conn.request("POST", "/api/librarian/session/close", raw,
                         {"Content-Type": "application/json"})
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read())
        finally:
            conn.close()

    def stored(self):
        return study_lib.load_her_sentences(self.library)["sentences"]

    # -- 10 -----------------------------------------------------------------

    def test_she_typed_and_passed_so_her_sentences_survive_the_close(self):
        self.seed_ledger(["the ferry"])
        self.seed_session([
            {"who": "user", "text": "it read like an essay about me"},
            {"who": "librarian", "text": "woven in — the paper holds it now."},
            {"who": "user", "text": "add the bit about the ferry"}])
        status, data = self.close("pass")
        self.assertEqual(status, 200, "the close failed: " + repr(data))
        got = self.stored()
        self.assertEqual(
            [e["text"] for e in got],
            ["it read like an essay about me",
             "add the bit about the ferry"],
            "on a PASS, everything she typed survives — verbatim, and ON "
            "DISK IN THE ORDER SHE TYPED IT. Before this writer existed her "
            "whole transcript was destroyed one line later and there was "
            "nowhere it survived. ⚠ Only HER turns: the librarian's reply "
            "sat between these two and is not here")
        self.assertEqual(
            [e["text"] for e in
             study_lib.her_sentences_memory(self.library)["sentences"]],
            ["add the bit about the ferry",
             "it read like an essay about me"],
            "and the READER hands them back newest first — over a pair "
            "sharing one stamp, which is what one passed sitting always "
            "writes, so this is the ordinary case rather than a corner")
        self.assertEqual(
            {e["about"] for e in got}, {"the ferry"},
            "each sentence is anchored by the reflection's NAME (D-25)")

    # -- 10a ----------------------------------------------------------------

    def test_the_writer_stores_no_category_beside_her_sentence(self):
        """⛔⛔ D-26 ASSERTED WHERE IT ACTUALLY HAPPENS.

        ⚠ THIS CASE EXISTS BECAUSE THE MUTATION DRILL FOUND ITS ABSENCE. The
        store-side key-set case asserts over an entry the SUITE built and
        handed to the saver, so a mutant that added a field inside the WRITER
        sailed straight past it — the one prohibition this plan calls the
        hard one, unguarded at the only place it can be broken. The lesson is
        the one this project keeps paying for: a check that never drives the
        code under test pins nothing."""
        self.seed_ledger(["the ferry"])
        self.seed_session([{"who": "user", "text": "it missed"}])
        self.close("pass")
        stored = self.stored()
        self.assertEqual(len(stored), 1)
        self.assertEqual(
            sorted(stored[0]), ["about", "ms", "text"],
            "a field added beside her sentence IS a category, and she ruled "
            "(D-26) that nothing files her reaction into a box. 'The writing "
            "missed' versus 'the material was wrong' were an agent's two "
            "boxes, not hers. Her own sentences reach the writing VERBATIM "
            "AND UNSORTED — no label, no rating, no sentiment, no length, no "
            "derived field of any kind, and this is asserted by value over "
            "what the WRITER produced so a later addition cannot arrive "
            "quietly")
        self.assertIsInstance(
            stored[0]["ms"], int,
            "the stamp is an epoch-ms int — the item stamps' own format, "
            "never a third timestamp parse site")
        self.assertEqual(stored[0]["text"], "it missed",
                         "and her sentence is stored verbatim")

    # -- 11 -----------------------------------------------------------------

    def test_the_rejected_reflection_is_not_in_the_store(self):
        self.seed_ledger(["the ferry"])
        self.seed_session([{"who": "user", "text": "it missed"}])
        self.close("pass")
        blob = study_lib.her_sentences_file_path(
            self.library).read_text(encoding="utf-8")
        self.assertNotIn(
            "SENTINEL-REJECTED-ESSAY-TEXT", blob,
            "⛔ THE REJECTED ESSAY IS NOT KEPT (D-25) — only her sentence, "
            "anchored by the name. Storing the essay she turned down would "
            "make the room's own prose the bulk of its memory of her, which "
            "is the exact inversion D-19's priority order rules against")
        self.assertNotIn("the room's own essay", blob)

    # -- 12 -----------------------------------------------------------------

    def test_she_typed_nothing_and_passed_so_no_entry_is_written(self):
        self.seed_ledger(["the ferry"])
        self.seed_session([])
        before = len(self.stored())
        self.assertEqual(before, 0)
        self.close("pass")
        self.assertEqual(
            len(self.stored()), 0,
            "a passed sitting in which she typed nothing writes NO entry — "
            "not an empty one. An empty row is a record that she said "
            "nothing, and D-22 rules that silence teaches nothing at all")
        self.assertFalse(
            study_lib.her_sentences_file_path(self.library).exists(),
            "nothing at all is written, so the file is not even created")

    # -- 13 -----------------------------------------------------------------

    def test_a_saved_sitting_writes_no_entry(self):
        self.seed_ledger(["the ferry"])
        self.seed_session([{"who": "user", "text": "add the bench"}])
        status, data = self.close("save")
        self.assertEqual(status, 200, "the save failed: " + repr(data))
        self.assertEqual(
            self.stored(), [],
            "this pile is for PASSED sittings only (D-25). On a sitting she "
            "saved, what she typed already survives inside the reflection, "
            "and keeping it here as well would turn 'add the bit about the "
            "ferry' into a stale instruction next month's librarian obeys")

    # -- 14 -----------------------------------------------------------------

    def test_the_writer_runs_while_the_session_file_still_exists(self):
        """⛔ THE ORDERING IS THE WHOLE TASK, so it is OBSERVED, not read
        off the source. The spy records what the world looked like at the
        moment the writer was called: if the writer moved one step later,
        the session file would already be gone and her words with it."""
        self.seed_ledger(["the ferry"])
        chat = [{"who": "user", "text": "the ending felt bolted on"}]
        self.seed_session(chat)
        seen = {}
        real = study_lib.save_her_sentences

        def spy(root, entries):
            path = study_lib.session_file_path(root)
            seen["session_present"] = path.exists()
            if seen["session_present"]:
                doc = json.loads(path.read_text(encoding="utf-8"))
                seen["chat"] = doc.get("chat")
            return real(root, entries)

        study_lib.save_her_sentences = spy
        try:
            self.close("pass")
        finally:
            study_lib.save_her_sentences = real
        self.assertIs(
            seen.get("session_present"), True,
            "the writer must run BEFORE the session file is unlinked. Her "
            "sentences live in that file's chat and step ④ destroys it; a "
            "writer placed after it stores nothing and every after-the-fact "
            "assertion still passes")
        self.assertEqual(seen.get("chat"), chat,
                         "and the transcript is still readable at that point")
        self.assertFalse(
            study_lib.session_file_path(self.library).exists(),
            "the unlink itself is untouched and still happens")

    # -- 15 -----------------------------------------------------------------

    def test_a_failing_writer_never_blocks_the_close(self):
        self.seed_ledger(["the ferry"])
        self.seed_session([{"who": "user", "text": "it missed"}])
        real = study_lib.save_her_sentences

        def boom(root, entries):
            raise RuntimeError("the memory hiccupped")

        study_lib.save_her_sentences = boom
        try:
            status, data = self.close("pass")
        finally:
            study_lib.save_her_sentences = real
        self.assertEqual(
            status, 200,
            "A MEMORY IS NEVER A GATE. A hiccup here must not fail a sitting "
            "that is already closing: " + repr(data))
        self.assertFalse(study_lib.session_file_path(self.library).exists(),
                         "the session still closes")
        entries = study_lib.load_reflections(self.library)["reflections"]
        self.assertEqual(
            [r["outcome"] for r in entries], ["passed"],
            "and the outcome is still stamped — step ⑤ still runs")

    # -- 16 -----------------------------------------------------------------

    def test_the_anchor_is_the_newest_unstamped_ledger_record(self):
        """A refined-then-passed sitting leaves SEVERAL records, all
        unstamped until close. The newest is the reflection she was actually
        looking at when she passed; the oldest is the first name she saw."""
        study_lib.save_reflections(self.library, [
            {"title": "an older sitting", "shape": "claim-first",
             "outcome": "saved", "model": "opus", "ms": 1},
            {"title": "the first draft", "shape": "claim-first",
             "outcome": None, "model": "opus", "ms": 2},
            {"title": "after the refine", "shape": "claim-first",
             "outcome": None, "model": "opus", "ms": 3}])
        self.seed_session([{"who": "user", "text": "still not it"}])
        self.close("pass")
        self.assertEqual(
            [e["about"] for e in self.stored()], ["after the refine"],
            "the anchor is the NEWEST unstamped record — the draft she was "
            "reading when she passed. A stamped record belongs to an earlier "
            "sitting and can never be the anchor")


class CorpusGateCase(unittest.TestCase):
    """D-27's one-literal widening, asserted from the outside.

    ⛔ This case never drives the publish gate red. It asserts the new value
    BY VALUE and the new filename's membership BY VALUE; the gate's own
    assertions run unchanged in their own suite."""

    # -- 17 -----------------------------------------------------------------

    def test_the_volatile_set_has_three_members_and_names_this_file(self):
        sys.path.insert(0, str(_REPO_ROOT / "tests"))
        import test_stage_public as gate     # noqa: E402
        self.assertEqual(
            len(gate.VOLATILE_NAMES), 3,
            "D-27: the owner ruled WIDEN on 2026-08-18, before any of it was "
            "built, on the difference she was given — 'that record holds no "
            "words of yours at all; this one is nothing but your words'. "
            "Three members, and never a fourth without her word")
        self.assertIn(
            study_lib.her_sentences_file_path("x").name, gate.VOLATILE_NAMES,
            "the new store is the third VOLATILE file: it is rewritten on "
            "every passed sitting, so it never joins the stable corpus and "
            "the stable count must NOT move for it")
        # ⛔⛔ 13 -> 14 ON 2026-08-25 (26.998), AND THIS IS THE THIRD PIN ON
        # ONE NUMBER — the other two live in `tests/test_stage_public.py`.
        # ⚠ IT WAS FOUND BY RUNNING THE SUITE, NOT BY LOOKING: a cross-file
        # assertion in a file about her MEMORY is not where anyone greps for
        # the corpus count, which is exactly why it fired and exactly why it
        # is worth keeping.
        #
        # ⭐ THE SENTENCE BELOW IS STILL TRUE AND IS DELIBERATELY KEPT: the
        # stable count must NOT move for a file that is not stable, and
        # `your-sentences.json` is still not stable. What moved the count is a
        # DIFFERENT file — what the room learned about her, written ONCE and
        # thereafter only by her — and she ruled it into `librarian/` on
        # 2026-08-25 with WIDEN, MOVE and NARROW put to her by name first.
        # ⛔ The volatile set above is untouched and still holds exactly three.
        # ⛔ 26.9985: 14 -> 15 — librarian/subjects.json landed on her R-12
        # ruling (the finding pass's kept findings, R-9); still not volatile.
        # ⛔ 26.9985, later: 15 -> 17 — kept_back.json (R-6's undo store,
        # landed by the first removal, her R-16 go) and the R-15 desk offer
        # note. The literal's own comment in test_stage_public carries the
        # mid-visit session.json caveat; the volatile set is untouched.
        self.assertEqual(
            gate.EXPECTED_LIBRARIAN_FILES, 17,
            "⛔ the STABLE file count moved, and it may only ever move on her "
            "word. Widening the stable count for a file that is not stable "
            "would still be the wrong repair")


class HerMemoryBlockCase(unittest.TestCase):
    """26.995-11 (D-19/D-20): THE DERIVED BLOCK — her own words in front of
    the librarian, whole, in her order, with the room's own prose marked.

    ⚠ WHAT MAKES THIS CLASS DIFFERENT FROM EVERY CASE ABOVE. Plan 10 stored
    her sentences and read them back only into another test. This is the
    first code that takes them OUT of the store and puts them somewhere a
    model will see, which is why T-26.995-02 is settled in this same file.

    ⛔ NOTHING HERE CALLS A MODEL. The block is DERIVED — assembled from what
    is on disk — and that is D-20's most consequential ruling: a composed
    memory inherits the unchecked no-invention floor AND THE FAILURE
    COMPOUNDS, because an invented memory does not spoil one reflection, it
    writes every reflection after it."""

    def setUp(self):
        temp_home(self)
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.library = Path(self._tmp.name) / "library"
        (self.library / "items").mkdir(parents=True)

    # -- helpers ------------------------------------------------------------

    def seed_sentences(self, *texts, **kw):
        """Write her sentences OLDEST FIRST, exactly as the writer appends
        them. One passed sitting writes every turn under ONE stamp, so the
        default here is one stamp for all of them — the ordinary case."""
        about = kw.get("about", "the ferry")
        ms = kw.get("ms", 1_700_000_000_000)
        study_lib.save_her_sentences(
            self.library,
            [{"text": t, "about": about, "ms": ms} for t in texts])

    def seed_ledger(self, rows):
        """rows: [(title, outcome)], OLDEST FIRST. `outcome` is "saved",
        "passed", or None for the sitting that is open right now."""
        study_lib.save_reflections(self.library, [
            {"title": t, "shape": "claim-first", "outcome": o,
             "model": "opus", "ms": 100 + i}
            for i, (t, o) in enumerate(rows)])

    def essay(self, i, title, text, state="unseen", trigger=False):
        """One materialized reflection — a REAL store item with a REAL
        snapshot on disk, because the block reads the body through the
        shipped jailed reader and a hand-built dict would skip that read."""
        item_id = format(0x2000 + i, "016x")
        rel = "items/%s.md" % item_id
        (self.library / rel).write_text(text, encoding="utf-8")
        return {"id": item_id, "content_hash": item_id * 4,
                "source": "librarian", "type": "text", "title": title,
                "library_path": rel, "origin_path": rel,
                "created_ms": 1_700_000_000_000 + i,
                "saved_ms": 1_700_000_000_000 + i,
                "imported_ms": 1_700_000_000_000 + i,
                "last_opened_ms": None, "state": state,
                "resting_until_ms": None, "tags": [], "trigger": trigger,
                "year": 2026, "folder": "", "history": []}

    def store(self, items, filters=None):
        return {"meta": {"filters": list(filters or [])},
                "items": {it["id"]: it for it in items}}

    def block(self, items=(), filters=None, fenced=()):
        # ⚠ `fenced=()` is an EMPTY RESOLVED LIST — "nothing is fenced" — and
        # it is NOT the same thing as None, which means "the list could not be
        # resolved" and fails the whole block closed. Case 26 drives both.
        return server._reflection_her_memory(
            self.library, self.store(list(items), filters),
            None if fenced is None else list(fenced))

    # -- 19 -----------------------------------------------------------------

    def test_her_sentences_come_first_whole_and_byte_identical(self):
        """D-19's order is HERS and it is a PRIORITY order, not a list:
        (1) what she typed — that is her talking; (2) which reflections
        landed; (3) the room's own essays, LAST."""
        typed = ("it read like an essay about me — not with me",
                 "去年的那个冬天，你写错了")
        self.seed_sentences(*typed)
        self.seed_ledger([("the ferry", "passed"), ("the loom", "saved")])
        block = self.block([self.essay(0, "the loom", "## the loom\n\nits.")])
        self.assertEqual(
            list(block),
            ["her_own_sentences", "reflections_that_landed",
             "its_own_writing"],
            "HER ORDER, and it is a priority order rather than a list: her "
            "comments and reactions first because that is her talking, which "
            "reflections landed second, its own essays LAST and the first "
            "thing to cut (D-19, her words)")
        got = [e["text"] for e in block["her_own_sentences"]]
        self.assertEqual(
            got, [typed[1], typed[0]],
            "newest first — the reader's order, unchanged by the block")
        for text in got:
            self.assertIn(
                text.encode("utf-8"),
                [t.encode("utf-8") for t in typed],
                "⛔ BYTE-IDENTICAL to what she typed. A summary, a "
                "paraphrase, an ellipsis or a trim here is the harm D-20 "
                "names: her own sentences reach the writing VERBATIM, or the "
                "room is reading a machine's account of her instead of her")
        self.assertEqual(
            [sorted(e) for e in block["her_own_sentences"]],
            [["about", "text"], ["about", "text"]],
            "⛔⛔ NO CATEGORY IS ATTACHED ON THE WAY IN EITHER (D-26). The "
            "box can be added at READ time exactly as easily as at write "
            "time, so the prohibition is asserted on both sides of the "
            "store — no label, no rating, no sentiment, no length, no "
            "derived field of any kind")

    # -- 20 -----------------------------------------------------------------

    def test_a_passed_reflections_text_never_appears_in_the_block(self):
        """⛔ KEPT REFLECTIONS ONLY for group (3). A reflection she passed
        on leaves ONE BIT — that it landed and she did not keep it — and its
        prose never rides. The room being handed back an essay she refused
        is the room building on the writing she rejected."""
        passed_text = "SENTINEL-THE-PASSED-ESSAY-TEXT"
        kept_text = "SENTINEL-THE-KEPT-ESSAY-TEXT"
        self.seed_sentences("the loom bit landed", "the ferry bit did not")
        self.seed_ledger([("the ferry", "passed"), ("the loom", "saved")])
        block = self.block([self.essay(0, "the ferry", passed_text),
                            self.essay(1, "the loom", kept_text)])
        blob = json.dumps(block, ensure_ascii=False)
        self.assertNotIn(
            passed_text, blob,
            "the text of a reflection she PASSED on is nowhere in the block "
            "— asserted by substring over the whole serialized block, not by "
            "reading one list, because a leak does not care which key it "
            "arrives under")
        self.assertIn(
            kept_text, blob,
            "⛔ THE OTHER SIDE, so a builder that admitted NOTHING would fail "
            "as loudly as one that admitted the passed essay: a reflection "
            "she KEPT does ride")
        self.assertEqual(
            [(r["title"], r["kept"])
             for r in block["reflections_that_landed"]],
            [("the loom", True), ("the ferry", False)],
            "group (2) is ONE BIT EACH, newest first — kept versus passed, "
            "read from the ledger and nothing more")

    # -- 21 -----------------------------------------------------------------

    def test_every_room_authored_element_is_marked_and_none_of_hers_is(self):
        """T-26.995-91. The room must never be able to read its own writing
        back as hers, and the marker is the same key plan 09 put on pool
        body rows — one vocabulary, never two."""
        self.seed_sentences("it read like an essay about me",
                            "add the bit about the ferry")
        self.seed_ledger([("the ferry", "passed"), ("the loom", "saved")])
        block = self.block([self.essay(0, "the loom", "## the loom\n\nits.")])
        marked = [e for group in block.values() for e in group
                  if e.get("room_wrote_this") is True]
        unmarked = [e for group in block.values() for e in group
                    if "room_wrote_this" not in e]
        self.assertEqual(
            len(marked), 3,
            "BY VALUE: two landed bits and one essay — the room's own "
            "bookkeeping and the room's own prose, every element marked. A "
            "marker on SOME of them is the spoofing this pins")
        self.assertEqual(
            len(unmarked), 2,
            "BY VALUE, and this is the half that makes the case non-vacuous: "
            "a marker on EVERYTHING would fail here exactly as loudly as a "
            "marker on nothing. ⛔ Her own sentences never carry it")
        self.assertEqual(
            [e["text"] for e in unmarked],
            [e["text"] for e in block["her_own_sentences"]],
            "and the unmarked ones are hers, not some third class")

    # -- 22 -----------------------------------------------------------------

    def test_the_drop_order_cuts_its_own_writing_first_and_hers_last(self):
        """*Its own essays LAST, and the first thing to cut* — her words.
        Asserted BY VALUE on the surviving counts per group, never by
        inspecting which branch ran."""
        big = "x" * 6000
        self.seed_sentences(*[big + str(i) for i in range(6)])
        self.seed_ledger([("r%d" % i, "saved") for i in range(6)])
        block = self.block([self.essay(i, "r%d" % i, "essay %d" % i)
                            for i in range(6)])
        self.assertEqual(
            [len(block["its_own_writing"]),
             len(block["reflections_that_landed"]),
             len(block["her_own_sentences"])],
            [0, 0, 3],
            "the drop order, by value: its own essays go first, then the "
            "landed bits, and HER SENTENCES LAST. ⚠ The 3 is arithmetic (the "
            "measured budget divided by a 6001-character turn) and the ORDER "
            "is the claim — a builder that cut her sentences first would "
            "read [3, 0, 0] here")
        self.assertLessEqual(
            len(json.dumps(block, ensure_ascii=False).encode("utf-8")),
            server.HER_MEMORY_BUDGET_BYTES,
            "and the block is BOUNDED (T-26.995-93): the trim runs until it "
            "fits, so one enormous evening cannot quietly multiply the cost "
            "of every refine turn after it")

    # -- 23 -----------------------------------------------------------------

    def test_her_sentences_do_not_thin_with_age(self):
        """⚠ D-21'S SPLIT IS DELIBERATE AND EASY TO GET WRONG. The memory
        of her LIFE fades — recent weighs more, old thins rather than
        vanishing — but the owner AMENDED that for the pile of her own
        sentences: they do not fade on a clock. The room looks at the newest
        handful and she may delete any. A taste in prose is steadier than a
        mood, and there is no clock anywhere on this path."""
        study_lib.save_her_sentences(self.library, [
            {"text": "a year ago i said the ferry line was the one",
             "about": "the ferry", "ms": 1},
            {"text": "and tonight i still think so",
             "about": "the loom", "ms": int(time.time() * 1000)}])
        texts = [e["text"] for e in
                 self.block()["her_own_sentences"]]
        self.assertIn(
            "a year ago i said the ferry line was the one", texts,
            "⛔ a sentence with an epoch-1 stamp is a YEAR older than the "
            "other and it still rides. Dropping it would be an age rule, "
            "which D-21 forbids over this pile")
        self.assertEqual(
            len(texts), 2,
            "both, by value — so a screen that dropped everything fails here "
            "too")

    # -- 24 -----------------------------------------------------------------

    def test_a_fenced_title_in_her_own_sentence_is_held_back(self):
        """⛔⛔ T-26.995-02, AND IT IS THE DOOR NOBODY WAS WATCHING.

        Her chat transcript has NEVER passed through any fence predicate.
        Everything else that reaches a prompt comes through the one audited
        pool builder; this does not. Her own words are trusted as HERS, and
        that is exactly why — she can perfectly well write the name of a note
        she has since fenced, and reading it back would let that title
        re-enter through the one door nobody was watching. Law 5 makes it a
        P0.

        ⚠ THE ARM THAT SHOULD FAIL WAS BUILT AND OBSERVED before the screen
        existed: at commit e30e155 the same sentence reached the block and
        `FENCED TITLE REACHED THE BLOCK?: True` was printed. The run is
        recorded in this task's commit body."""
        fenced = "the hospital discharge letter"
        self.seed_sentences("the loom bit landed",
                            "it read like " + fenced + " read",
                            "the ferry bit did not")
        block = self.block(fenced=[fenced])
        texts = [e["text"] for e in block["her_own_sentences"]]
        self.assertEqual(
            len(texts), 2,
            "BY VALUE, the SURVIVING count — and this half is what makes the "
            "case non-vacuous: a screen that dropped EVERYTHING would fail "
            "here exactly as loudly as one that dropped nothing")
        self.assertNotIn(
            fenced, json.dumps(block, ensure_ascii=False),
            "BY VALUE, the EXCLUDED one: the fenced title is nowhere in the "
            "serialized block. ⛔ One sentence of hers is held back and the "
            "rest of the block is untouched")
        self.assertEqual(
            texts, ["the ferry bit did not", "the loom bit landed"],
            "and the two that survive are the two that should, still newest "
            "first — the screen removes, it never reorders")
        unscreened = [e["text"] for e in
                      self.block(fenced=[])["her_own_sentences"]]
        self.assertIn(
            "it read like " + fenced + " read", unscreened,
            "⛔ THE CONTROL, and it is the arm that should fail kept alive in "
            "the suite: with NOTHING fenced the same sentence rides. So this "
            "case measures the screen rather than some unrelated reason the "
            "sentence went missing")

    # -- 25 -----------------------------------------------------------------

    def test_a_fenced_title_as_a_substring_is_fenced_too(self):
        """The substring case the fence family fought for, now on the one
        path that had never been screened. ⛔ The SHIPPED predicate is called
        rather than re-implemented precisely so this holds for free — a
        second title test would be a second definition of what "names a
        fenced title" means, and the two would drift."""
        fenced = "the hospital discharge letter"
        self.seed_sentences(
            "the loom bit landed",
            "i kept thinking about The Hospital Discharge Letterthing",
            "the ferry bit did not")
        block = self.block(fenced=[fenced])
        self.assertEqual(
            len(block["her_own_sentences"]), 2,
            "an EXACT-match screen would have admitted this one: the title "
            "is embedded mid-sentence, in a different case, and run into the "
            "next word. The shipped predicate is a case-insensitive "
            "substring test and catches all three at once")
        self.assertNotIn(
            "discharge letter",
            json.dumps(block, ensure_ascii=False).lower())

    # -- 26 -----------------------------------------------------------------

    def test_an_unresolvable_list_is_fenced_closed_to_no_memory_at_all(self):
        """⛔ FAIL CLOSED. If the fenced-title list cannot be resolved the
        memory block is EMPTY — a memory is never worth a leak, and law 5
        makes a leak a P0. The memory is the thing this phase can lose; the
        never-list is not."""
        self.seed_sentences("the loom bit landed", "the ferry bit did not")
        self.assertIsNone(
            self.block(fenced=None),
            "no list means NO MEMORY — not an unscreened one. ⛔ The failure "
            "direction is the whole of this assertion: an unresolvable list "
            "must never read as 'nothing is fenced'")
        self.assertIsNotNone(
            self.block(fenced=[]),
            "⛔ AND THE OTHER SIDE, or fail-closed would be indistinguishable "
            "from a builder that never returns anything: an EMPTY list is a "
            "RESOLVED answer — this library fences nothing — and the memory "
            "rides")

    # -- 27 -----------------------------------------------------------------

    def test_below_the_floor_the_memory_key_is_absent_and_not_empty(self):
        """⛔⛔ SILENT MEANS ABSENT, AND THAT DISTINCTION IS THE WHOLE OF THE
        FLOOR'S RULING (D-20). Below it the room is told NOTHING; it is not
        told that it remembers nothing about her. An empty structure is a
        sentence — "here is my memory of you, and it is blank" — and that is
        the confident essay about who she is that the floor exists to stop.
        The shipped identity block's own docstring says it in those terms:
        the absence IS the instruction.

        ⚠ HOW THIS WAS DRIVEN RED: the document builder was first made to
        emit `doc["memory"] = memory or {}` unconditionally. The
        assertNotIn below then failed with
        `'memory' unexpectedly found in {'pool': …, 'memory': {}, …}` —
        which is exactly the empty-versus-absent distinction, observed. The
        run is recorded in this task's commit body."""
        self.seed_sentences("only one thing she ever said")
        self.assertIsNone(
            self.block(),
            "ONE below the floor: no block at all")
        doc = server._reflection_turn_doc(
            {"bodies": []}, None, None, None, [], memory=self.block())
        self.assertNotIn(
            "memory", doc,
            "⛔ and the document then carries NO MEMORY KEY — `'memory' in "
            "doc` is False, never `doc['memory'] is None` and never an empty "
            "structure. A room told its memory is blank has been told "
            "something; a room told nothing has not")
        self.seed_sentences("only one thing she ever said",
                            "and then a second thing")
        block = self.block()
        self.assertIsNotNone(
            block,
            "EXACTLY AT the floor the memory is PRESENT — the boundary is "
            "INCLUSIVE, and both sides are asserted here in one case so they "
            "can never drift apart")
        self.assertEqual(
            len(block["her_own_sentences"]), server.HER_MEMORY_FLOOR,
            "and it carries exactly the floor's worth, by value")
        self.assertEqual(
            list(server._reflection_turn_doc(
                {"bodies": []}, {"titles_already_used": []}, None, None, [],
                evening="there is a lot here — 24 pieces.", memory=block)),
            ["pool", "evening", "memory", "variation", "draft", "chat"],
            "so the key IS emitted above the floor — without this half the "
            "assertNotIn above would pass for a builder that never emits it. "
            "⛔ AND IT SITS AFTER THE POOL: the key order is a deliberate "
            "STABLE CACHE PREFIX, and a key ahead of the pool changes that "
            "prefix on every turn and pays full uncached input on every "
            "refine — correctness-neutral, and it quietly multiplies the "
            "phase's cost")

    # -- 28 -----------------------------------------------------------------

    def test_her_real_library_today_is_below_the_floor_and_says_nothing(self):
        """⚠ MEASURED ON HER REAL LIBRARY, not assumed: zero comments across
        16,205 items, five glad taps, and two ledger records — one saved and
        one passed. So ON HER MACHINE TODAY THE MEMORY IS SILENT, and it
        stays silent for her first several weeks.

        ⛔ THAT COST WAS STATED AND ACCEPTED WHEN SHE RULED. It is not a
        defect and it must NOT be "fixed" by lowering the floor until it
        fires. This case exists so the empty-library behaviour is a MACHINE
        FACT rather than an expectation someone later argues with."""
        # her library today, built from those numbers: no sentences of hers
        # (she has not passed on a sitting since the writer shipped), two
        # closed ledger records, and the one kept reflection they imply.
        self.seed_ledger([("the ferry", "passed"), ("the loom", "saved")])
        items = [self.essay(0, "the loom", "## the loom\n\nits own essay.")]
        self.assertEqual(
            len(study_lib.load_her_sentences(self.library)["sentences"]), 0,
            "zero sentences of hers — the measured starting point")
        self.assertIsNone(
            self.block(items),
            "⛔ the memory is SILENT on her library as it stands today")
        doc = server._reflection_turn_doc(
            {"bodies": [], "meta_rows": []}, None, None, None, [],
            memory=self.block(items))
        self.assertNotIn("memory", doc, "no memory key in the document")
        self.assertEqual(
            list(doc), ["pool", "draft", "chat"],
            "AND THE SITTING COMPLETES EXACTLY AS IT DOES NOW: her document "
            "is byte-for-byte the document this phase was already building. "
            "Nothing about tonight changes for her until she speaks")

    # -- 29 -----------------------------------------------------------------

    def test_a_missing_empty_or_corrupt_store_yields_no_memory_no_error(self):
        """The loader's fail-open posture carried ALL THE WAY THROUGH to the
        document, asserted end to end rather than assumed from a docstring.
        A damaged memory is NO memory, never an error — this store may not
        cost her a sitting."""
        path = study_lib.her_sentences_file_path(self.library)
        path.parent.mkdir(parents=True, exist_ok=True)
        for label, prepare in (
                ("missing", lambda: None),
                ("empty", lambda: path.write_bytes(b"")),
                ("random bytes",
                 lambda: path.write_bytes(bytes(range(0, 255))))):
            with self.subTest(store=label):
                if path.exists():
                    path.unlink()
                prepare()
                block = self.block()          # must not raise
                self.assertIsNone(
                    block,
                    "a %s store is NO memory: %s" % (label, "no block"))
                doc = server._reflection_turn_doc(
                    {"bodies": []}, None, None, None, [], memory=block)
                self.assertNotIn(
                    "memory", doc,
                    "and no memory key in the document either — the "
                    "reflection still generates, no error surfaces, the "
                    "sitting completes")


# ---------------------------------------------------------------------------
# ---- HER EMPTY-STATE SENTENCE, AS SHE CHOSE IT (§ C-5) --------------------
#
# ⛔ NOT WRITTEN BY AN AGENT. Offered four ways — say why it is right to be
# empty · say what the space is for · say it fills as you go · just the fact —
# she chose the SECOND on 2026-08-18. ⚠ WHAT SHE DECLINED CONSTRAINS LATER
# EDITS: she turned down the variant that explained the silence AND the variant
# that pointed forward. The absence of a reason and the absence of an
# invitation are both her choice, so an agent that "improves" this line by
# appending either is overturning a ruling.
#
# Re-typed here rather than imported from the module under test — a check that
# read the value it is checking would pin whatever is there as correct, which
# is this project's signature defect. The wrapping in `26.995-COPY.md` is the
# illustration's narrow column; the assertion below joins these with single
# spaces and demands byte equality, so a reworded clause fails and a re-wrapped
# one does not.
# ---------------------------------------------------------------------------

# ⚠ THE WRAPPING INSIDE LINE 1 IS PRESENTATION — the illustration's column was
# narrow. THE BREAK BEFORE LINE 2 IS NOT: it was put to her as a yes/no on
# 2026-08-19 and she answered "Its own line". So the first two fragments join
# with a space and the second line is preceded by a REAL newline.
HER_EMPTY_STATE_LINE_1 = ("this is where what the librarian comes",
                          "to know about you will go.")
HER_EMPTY_STATE_LINE_2 = "nothing in it yet."
HER_EMPTY_STATE = " ".join(HER_EMPTY_STATE_LINE_1) + "\n" + HER_EMPTY_STATE_LINE_2

# ⛔ RENAMED BY HER ON 2026-08-20 (26.96 OD-1), AND ASKED FOR AGAIN ON
# 2026-08-21. The heading that shipped — "what it has come to know" — was
# approved-as-shown inside an illustration at §§ C-3/C-5, never written cold
# by her; the first time she opened the page in a browser she said so
# unprompted: "what it has come to know souds too confusing for me". This is
# her replacement, read back to her at the time and not corrected. ⛔ It is
# not an agent's tidy-up of her wording and may not be adjusted into one.
HER_SURFACE_HEADING = "the librarian's memory of you"

# ⛔ OD-1's TWO EXPLANATORY LINES — TIER 2. An agent wrote them to answer her
# question in chat and SHE ADOPTED them, which makes them hers to change and
# nobody else's. ⚠ They REVERSE a call she made the day before: on 2026-08-19
# she was offered a variant of this page that explained itself and one that
# pointed forward and chose NEITHER — the absence of a reason WAS the choice.
# She was told that cost before OD-1 was recorded and chose the explanation
# anyway, so the reversal is hers and is not re-litigated here.
#
# ⚠ TYPED BY HAND HERE, AND THAT IS THE WHOLE INSTRUMENT. The constants they
# are checked against in app.js were COPIED PROGRAMMATICALLY out of the
# primary record (26.96-UAT/beats.json, OD-1), so the two spellings were
# arrived at by two different routes and a slip on either route goes red.
# ⛔ Never "fix" one of these by pasting the other in.
HER_SURFACE_LINE_1 = (
    "Your own sentences \u2014 shown in full, with a remove this line "
    "control next to each.")
HER_SURFACE_LINE_2 = (
    "Reflections that landed \u2014 just the reflection's name, and whether "
    "you kept it or passed on it.")

# ⛔ THE EIGHT STRINGS SHE RULED ON 2026-08-19 (OC-2, OC-3, OC-4a/b/c, OC-6,
# OC-8), re-typed here rather than imported — AND RE-TYPING IS ONLY HALF AN
# INSTRUMENT. An equality between this copy and the shipped constant proves
# that two spellings agree; it says nothing about whether her sentence ever
# reaches the screen, and a constant no renderer reaches is a decision
# recorded and not built. So each is held between TWO ENDS: the DECODED VALUE
# of the app.js constant, and the RENDER SLICE that references that constant
# by name.
#
# ⚠ WHAT EACH IS HELD BETWEEN — WRITTEN OUT, BECAUSE A COMMENT CLAIMING A PIN
# THAT DOES NOT EXIST IS WHAT PRODUCED THIS GAP. `26.995-VERIFICATION.md`
# gap 3 found four of these declared here and used in ZERO assertions, so a
# reword of any of the four shipped green until 26.995-18:
#   HER_MARKER        value (case 44) + the wire flag its render marks from
#   HER_STRIKE_LABEL  value + `HER_MEMORY_STRIKE` inside the loop over HERS
#   HER_CONFIRM_LINE  value + `HER_MEMORY_CONFIRM_LINE` in the confirm block
#   HER_PROCEED       value + `HER_MEMORY_PROCEED` in the same confirm block
#   HER_DECLINE       value + `HER_MEMORY_DECLINE` in the same confirm block
#   HER_KEPT          value + `HER_MEMORY_KEPT` in the loop over LANDED
#   HER_PASSED        value + `HER_MEMORY_PASSED` in the same loop
#   HER_GONE          value + `HER_MEMORY_GONE` on the strike's SUCCESS arm,
#                     and asserted ABSENT from its failure arm
#
# ⚠ ONE OF THE EIGHT IS STILL HELD ONLY ONE WAY, AND IT IS SAID HERE RATHER
# THAN ROUNDED UP. HER_MARKER's value is pinned and the wire flag its render
# marks from is asserted in both directions by value — but the constant NAME
# is not asserted inside the block that builds the attribution, so an inlined
# literal at that one site would survive. It is NAMED, not quietly fixed: a
# gate added without being driven red is the other half of this same defect,
# and the fix belongs to a task that can drive it.
#
# ⛔ THE DRILL CARRIES ONE MUTANT PER RULED STRIKE STRING (M35-M39, the last
# of them a MOVE rather than a reword), each proven PLANTED by `_apply`
# before its verdict is read, and N4 is the arm that must SURVIVE them.
HER_MARKER = "written by the librarian"
HER_STRIKE_LABEL = "remove this line"
HER_CONFIRM_LINE = "this one does not come back."
HER_PROCEED = "remove"
HER_DECLINE = "keep it"
HER_KEPT = "kept"
HER_PASSED = "passed on"
HER_GONE = "that line is gone."

# ⚠⚠ THESE TWO ARE NOT HERS AND THIS SAYS SO RATHER THAN LETTING THEM SIT
# AMONG THE ONES THAT ARE. They are the room's own shipped failure copy —
# the quiet-error line and the retry's label — written by an agent long
# before this surface existed and reused verbatim here. 26.995-23 moved WHERE
# they are built (the failure now adds to the confirm slot instead of
# assigning over it) and changed NEITHER BYTE, which is why they can be
# pinned: the pin's whole job is to prove the move did not become a reword
# under cover of a refactor.
#
# ⛔ PINNING IS NOT ADOPTION. Nothing here makes them hers, blesses them, or
# closes the question of whether she would keep them. If either is ever
# reworded, that rewording is a front-facing sentence and is HERS — it goes
# on the wording pass in `26.995-OWED-TO-OWNER.md`, never into a commit.
SHIPPED_FAILURE_LINE = ("That choice did not save — the room may not be "
                        "reachable.")
SHIPPED_RETRY_LABEL = "try saving again"


def _js_unescape(seg):
    """Decode one JS single-quoted segment's escapes.

    ⛔ THIS REPLACED `.encode().decode("unicode_escape")`, WHICH CORRUPTS
    EVERY NON-ASCII CHARACTER IT IS POINTED AT: the utf-8 bytes are read back
    as latin-1, so an em dash comes out as three mojibake characters. That
    was harmless while every string checked here was ASCII, and stopped being
    harmless the moment two of her adopted lines arrived carrying one."""
    def one(m):
        esc = m.group(1)
        if esc[0] == "u" and len(esc) == 5:
            return chr(int(esc[1:], 16))
        return {"n": "\n", "t": "\t", "r": "\r", "0": "\0"}.get(esc, esc)
    return re.sub(r"\\(u[0-9a-fA-F]{4}|.)", one, seg)


def js_manage_pane_label(src, key):
    """The `label` of the MANAGE_PANES entry with this key, read out of the
    app.js source.

    ⛔⛔ THIS IS A SECOND AND INDEPENDENT READ, AND THE INDEPENDENCE IS THE
    POINT. The page's name is typed TWICE in app.js — once as the
    settings-list entry and once as the page's own heading — and case 45
    exists because those two can disagree. A helper that resolved one of them
    THROUGH the other would make the disagreement impossible to express,
    which is this project's signature defect wearing a gate's clothes."""
    m = re.search(r"\{\s*key:\s*'" + re.escape(key)
                  + r"',\s*label:\s*'((?:[^'\\]|\\.)*)'", src)
    if not m:
        raise AssertionError("no MANAGE_PANES entry for key " + repr(key))
    return _js_unescape(m.group(1))


def js_string_literal(src, name):
    """The VALUE of `var <name> = '...' + '...';` in app.js, with escapes
    decoded — never the source formatting.

    ⚠ WHY THIS EXISTS RATHER THAN A SUBSTRING SEARCH. Her empty state carries
    a real newline, and the shipped constant is written as a two-part
    concatenation because the line would otherwise run long. A raw substring
    check would therefore be asserting how the FILE IS WRAPPED, which is
    presentation, and would go red for a purely cosmetic re-wrap while
    happily passing a reworded clause split the same way. This joins the
    quoted segments and returns what the browser would actually hold, so the
    assertion is about her words and nothing else."""
    i = src.index("var " + name + " =")
    stmt = src[i:src.index(";", i)]
    out = []
    for m in re.finditer(r"'((?:[^'\\]|\\.)*)'", stmt):
        out.append(_js_unescape(m.group(1)))
    if not out:
        raise AssertionError("no string literal found for " + name)
    return "".join(out)


# ---------------------------------------------------------------------------
# ---- the render, ACTUALLY RUN ---------------------------------------------
#
# ⛔⛔ WHY THIS EXISTS AND WHAT IT REPLACED (WR-04). The claim "with a remove
# this line control next to each" used to be checked by reading a `strikeable`
# field back off the wire — a field the response builder sets as a hard-coded
# literal per row, so the assertion was true for every possible tree and could
# not detect the SUBSET failure its own message names. That is this project's
# signature defect, and it was sitting inside the case written to end it.
#
# So the shipped row-building code is EXECUTED against a fixture and the
# controls it really builds are counted. The bodies below are sliced out of
# app.js — `quiet`, `metaLine`, `herSentence`, `attribution` and the whole of
# `renderRows` — so nothing here re-implements the render; a mutant that
# slices `hers`, guards the control behind a test, or drops it entirely
# changes the COUNT, which is the failure a substring scan cannot see.
#
# ⚠ THE DOM IS A STUB AND SAYS SO. It is deliberately dumb: elements are
# plain objects with children, and `innerHTML = ''` really does empty them,
# because `renderRows` clears the list that way on every read and a stub that
# ignored it would hide exactly the append-target bug IN-03 names.
# ---------------------------------------------------------------------------

_RENDER_HARNESS_HEAD = """
function makeEl(tag) {
  var el = { tag: tag, children: [], attrs: {}, className: '',
             textContent: '', type: '' };
  el.setAttribute = function (k, v) { el.attrs[k] = v; };
  el.appendChild = function (c) { el.children.push(c); return c; };
  el.addEventListener = function () {};
  el.focus = function () {};
  el.querySelectorAll = function () { return []; };
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return ''; },
    set: function () { el.children = []; }
  });
  return el;
}
var document = { createElement: makeEl };
var list = makeEl('div');
var said = makeEl('div');
function apiPost() {
  return { then: function () { return { catch: function () {} }; } };
}
function read() {}
"""

_RENDER_HARNESS_TAIL = """
renderRows(MEMORY);
function walk(el, out) {
  out.push(el);
  el.children.forEach(function (c) { walk(c, out); });
  return out;
}
var all = walk(list, []);
var strikes = all.filter(function (el) {
  return String(el.className).split(' ').indexOf('her-memory-strike') >= 0;
});
process.stdout.write(JSON.stringify({
  nodes: all.length - 1,
  strike_controls: strikes.length,
  labels: strikes.map(function (b) { return String(b.textContent); }),
  texts: all.map(function (el) { return String(el.textContent); })
}));
"""


# ---------------------------------------------------------------------------
# ---- the GESTURE, actually driven -----------------------------------------
#
# ⛔⛔ WHY A SECOND HARNESS AND NOT A BIGGER FIRST ONE. `_RENDER_HARNESS_HEAD`
# proves what the surface DRAWS; nothing in it can press anything. Its
# `addEventListener` is an empty function and its `apiPost` never calls back,
# on purpose — `renderRows` must be measurable without a single handler
# running. The failure state this plan is written about does not exist until
# two handlers have run and a request has come back refused, so it needs a
# stub that keeps listeners, dispatches them, resolves the promise, records
# the calls and remembers where focus went.
#
# ⚠ `innerHTML = ''` STILL REALLY EMPTIES HERE. That is not an oversight kept
# for symmetry: assigning over the confirm slot is precisely how the shipped
# code erased her way out, so a stub that treated the assignment as a no-op
# would have reported this plan's own defect as already fixed.
# ---------------------------------------------------------------------------

_DRIVE_HARNESS_HEAD = """
var POSTS = [];
var READS = 0;
var FOCUSED = null;
function collect(el, out) {
  out.push(el);
  el.children.forEach(function (c) { collect(c, out); });
  return out;
}
function makeEl(tag) {
  var el = { tag: tag, children: [], attrs: {}, className: '',
             textContent: '', type: '', listeners: {} };
  el.setAttribute = function (k, v) { el.attrs[k] = v; };
  el.appendChild = function (c) { el.children.push(c); return c; };
  el.addEventListener = function (t, fn) {
    if (!el.listeners[t]) { el.listeners[t] = []; }
    el.listeners[t].push(fn);
  };
  el.dispatch = function (t) {
    (el.listeners[t] || []).slice().forEach(function (fn) { fn(); });
  };
  el.click = function () { el.dispatch('click'); };
  el.focus = function () { FOCUSED = el; };
  el.querySelectorAll = function (sel) {
    var raw = String(sel);
    var cls = raw.charAt(0) === '.' ? raw.slice(1) : raw;
    return collect(el, []).slice(1).filter(function (n) {
      return String(n.className).split(' ').indexOf(cls) >= 0;
    });
  };
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return ''; },
    set: function () { el.children = []; }
  });
  return el;
}
var document = { createElement: makeEl };
var list = makeEl('div');
var said = makeEl('div');
function read(after) { READS += 1; if (after) { after(); } }
function apiPost(url, body) {
  POSTS.push({ url: String(url), body: JSON.stringify(body) });
  var res = { ok: POST_OK };
  return {
    then: function (fn) { fn(res); return { catch: function () {} }; }
  };
}
"""

_DRIVE_HARNESS_TAIL = """
renderRows(MEMORY);
function byClass(root, cls) {
  return collect(root, []).filter(function (n) {
    return String(n.className).split(' ').indexOf(cls) >= 0;
  });
}
function strikes() { return byClass(list, 'her-memory-strike'); }
function slots() { return byClass(list, 'her-memory-confirm'); }
function report(slot) {
  if (!slot) { return { present: false, nodes: 0, controls: 0, labels: [],
                        texts: [] }; }
  var nodes = collect(slot, []).slice(1);
  var buttons = nodes.filter(function (n) { return n.tag === 'button'; });
  return {
    present: true,
    nodes: nodes.length,
    controls: buttons.length,
    labels: buttons.map(function (b) { return String(b.textContent); }),
    texts: nodes.map(function (n) { return String(n.textContent); })
  };
}
function focused() { return FOCUSED ? String(FOCUSED.textContent) : null; }

var out = { rows_before: byClass(list, 'her-memory-row').length,
            strikes_before: strikes().length };
strikes()[TARGET].dispatch('click');
// Only ONE slot carries the confirm class at this point, whichever row it
// belongs to — so this reference is the row under test, not row zero.
var mySlot = slots()[0];
out.opened = report(mySlot);
out.opened_focus = focused();
var proceed = byClass(list, 'her-memory-proceed');
out.proceed_controls = proceed.length;
proceed[0].dispatch('click');
out.failed = report(mySlot);
out.failed_focus = focused();
out.posts_at_failure = POSTS.length;
out.reads_at_failure = READS;
out.said_at_failure = String(said.textContent);
out.after = null;
if (AFTER === 'decline') {
  var declines = byClass(mySlot, 'her-memory-decline');
  out.decline_controls = declines.length;
  if (declines.length) { declines[0].dispatch('click'); }
  out.after = { posts: POSTS.length, slot: report(mySlot),
                focus: focused() };
} else if (AFTER === 'retry') {
  var retries = byClass(mySlot, 'her-memory-retry');
  out.retry_controls = retries.length;
  if (retries.length) { retries[0].dispatch('click'); }
  out.after = { posts: POSTS.length, slot: report(mySlot) };
} else if (AFTER === 'second') {
  var all = strikes();
  out.second_available = all.length;
  // ⚠ GUARDED SO A MISSING CONTROL IS A NUMBER, NOT A CRASH. A mutant that
  // removes a row optimistically takes its strike control with it; letting
  // that throw would score as a catch without any assertion having run,
  // which is a crash wearing a catch's clothes.
  if (all.length > NEXT) { all[NEXT].dispatch('click'); }
  // Slots appear in DOM order and a slot is only classed once opened, so
  // after both are open the index IS the row index.
  out.after = { open_slots: slots().length,
                failed_slot: report(slots()[TARGET]),
                fresh_slot: report(slots()[NEXT]) };
}
out.rows_after = byClass(list, 'her-memory-row').length;
out.strikes_after = strikes().length;
out.strike_labels_after = strikes().map(function (b) {
  return String(b.textContent);
});
out.texts_after = collect(list, []).slice(1).map(function (n) {
  return String(n.textContent);
});
out.posts = POSTS;
out.reads = READS;
process.stdout.write(JSON.stringify(out));
"""


class MemorySurfaceCase(unittest.TestCase):
    """26.995-13 (C-3/C-5/C-7): the surface she reads, and the strike.

    ⚠ WHAT MAKES THIS CLASS DIFFERENT FROM `HerMemoryBlockCase`. That class
    proves what the MODEL is told. This one proves what SHE is shown, and adds
    the phase's only gesture that DELETES something of hers.

    ⛔⛔ THE ONE THING THIS CLASS MUST NOT DO, AND IT IS THIS PLAN'S NAMED
    TRAP: assert that a struck sentence is gone FROM THE RENDERED VIEW. A view
    that filtered its own output would pass that and ship a deletion the room
    showed her and never performed (T-26.995-31, Repudiation). Every strike
    assertion below re-reads `librarian/your-sentences.json` FROM DISK and
    counts what is really in it — three counts, by value — and carries an
    UNSTRUCK CONTROL in the same case, without which a strike that emptied the
    whole store would pass.

    ⚠ NO MODEL IS CALLED. Both routes read files and answer; neither consults
    a provider, which is why no transport stub is installed. HOME is swapped
    anyway, so a future edit that DID reach for a credential would find a temp
    tree rather than her key."""

    def setUp(self):
        temp_home(self)
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.library = Path(self._tmp.name) / "library"
        (self.library / "items").mkdir(parents=True)
        self.httpd = server.create_server(self.library, 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever,
                                       daemon=True)
        self.thread.start()
        self.addCleanup(self._stop)

    def _stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)

    # -- helpers ------------------------------------------------------------

    ROUTE = "/api/librarian/what-it-knows"
    STRIKE = "/api/librarian/what-it-knows/strike"

    def seed_sentences(self, *texts):
        """Oldest first, exactly as the close-time writer appends them, and
        all under ONE stamp — what one passed sitting really writes."""
        study_lib.save_her_sentences(
            self.library,
            [{"text": t, "about": "the ferry", "ms": 1_700_000_000_000}
             for t in texts])

    def seed_ledger(self, rows):
        study_lib.save_reflections(self.library, [
            {"title": t, "shape": "claim-first", "outcome": o,
             "model": "opus", "ms": 100 + i}
            for i, (t, o) in enumerate(rows)])

    def seed_store(self, items):
        store = study_lib.new_store(self.library)
        store["items"] = {it["id"]: it for it in items}
        study_lib.save_store(self.library, store)

    def essay(self, i, title, text):
        item_id = format(0x3000 + i, "016x")
        rel = "items/%s.md" % item_id
        (self.library / rel).write_text(text, encoding="utf-8")
        return {"id": item_id, "content_hash": item_id * 4,
                "source": "librarian", "type": "text", "title": title,
                "library_path": rel, "origin_path": rel,
                "created_ms": 1_700_000_000_000 + i,
                "saved_ms": 1_700_000_000_000 + i,
                "imported_ms": 1_700_000_000_000 + i,
                "last_opened_ms": None, "state": "unseen",
                "resting_until_ms": None, "tags": [], "trigger": False,
                "year": 2026, "folder": "", "history": []}

    def get(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        try:
            conn.request("GET", self.ROUTE)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read())
        finally:
            conn.close()

    def strike(self, text):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        try:
            raw = json.dumps({"text": text}).encode("utf-8")
            conn.request("POST", self.STRIKE, raw,
                         {"Content-Type": "application/json"})
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read())
        finally:
            conn.close()

    def on_disk(self):
        """⛔ A FRESH READ, EVERY TIME. Not a cached handle, not the response
        body, not the view — the file, re-opened, re-parsed."""
        return study_lib.load_her_sentences(self.library)["sentences"]

    def renderer_body(self):
        """The surface renderer's OWN function body, bounded at its closing
        brace.

        ⚠ THE BOUND IS THE POINT AND THE FIRST VERSION GOT IT WRONG. Scanning
        to the next top-level `function` swept in the whole tidy-up section
        that follows — hundreds of lines of unrelated constants — so a
        forbidden string anywhere in the neighbour would have failed this
        surface, and a reviewer would rightly have deleted the check. The
        closing `\\n  }` at the function's own indent is the real edge.

        Scoping matters the other way too: a file-wide grep for `<input`
        would be red for every unrelated pane in app.js forever."""
        app = (_REPO_ROOT / "app.js").read_text(encoding="utf-8")
        start = app.find("function renderLibrarianMemorySection(")
        self.assertNotEqual(
            start, -1, "the surface's renderer must exist in app.js")
        end = app.find("\n  }", start)
        self.assertNotEqual(end, -1, "the renderer must be a bounded function")
        return app[start:end]

    def _shipped_slices(self):
        """Her strings, the render helpers and `renderRows` — cut OUT of
        app.js, never re-typed here.

        ⚠ IT READS app.js THROUGH `_REPO_ROOT`, which in a mutant tree is the
        TREE — so the drill scores every harness below against the mutated
        file, not the pristine repo copy."""
        self.assertTrue(
            shutil.which("node"),
            "node is required to run the shipped renderer — this repo "
            "already ships .cjs suites, so its absence is a broken "
            "environment rather than a reason to skip the measurement")
        app = (_REPO_ROOT / "app.js").read_text(encoding="utf-8")
        body = self.renderer_body()
        helpers = body[body.index("function quiet(color) {"):
                       body.index("function renderRows(memory) {")]
        render_rows = body[body.index("function renderRows(memory) {"):
                           body.index("function read(after) {")]
        consts = "\n".join(
            re.findall(r"var HER_MEMORY_[A-Z_0-9]+ =(?:[^;])*;", app))
        self.assertGreaterEqual(
            len(consts.splitlines()), 8,
            "the harness must carry her strings, not stand-ins for them")
        return consts, helpers, render_rows

    def _run_node(self, script, prefix):
        tmp = tempfile.mkdtemp(prefix=prefix)
        try:
            path = os.path.join(tmp, "render.js")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(script)
            proc = subprocess.run([shutil.which("node"), path],
                                  capture_output=True, text=True)
            self.assertEqual(
                proc.returncode, 0,
                "the shipped renderer did not run: " + proc.stderr[-800:])
            return json.loads(proc.stdout)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def render_the_surface(self, hers, landed=()):
        """RUN the shipped row-building code over a fixture and report what
        it built — the count of strike controls, and their labels.

        ⛔ THE POINT IS THAT NOTHING HERE IS RE-IMPLEMENTED. `renderRows` and
        the four helpers it calls are sliced OUT OF app.js and executed; only
        the DOM and the two network calls are stubbed. A check that counted
        `createElement('button')` occurrences in the source instead would be
        a mirror of the file, and would keep passing while `hers.slice(0, 1)`
        quietly left every older sentence without a control."""
        consts, helpers, render_rows = self._shipped_slices()
        memory = {"her_own_sentences": list(hers),
                  "reflections_that_landed": list(landed)}
        script = (_RENDER_HARNESS_HEAD
                  + "var MEMORY = " + json.dumps(memory) + ";\n"
                  + consts + "\n" + helpers + "\n" + render_rows + "\n"
                  + _RENDER_HARNESS_TAIL)
        return self._run_node(script, "her-memory-render-")

    def drive_the_strike(self, hers, after=None, target=0, nxt=None,
                         post_ok=False, landed=()):
        """OPEN a confirm, PRESS `remove`, and let the store REFUSE — then
        report what is really left in the confirm slot.

        ⛔⛔ THIS IS THE ANTI-MIRROR HALF OF THIS PLAN AND THE NAMED TRAP IS
        THE OBVIOUS ALTERNATIVE. Asserting that the failure handler CONTAINS
        `HER_MEMORY_DECLINE` restates the edit that put it there: any
        composition, in any order, with the control detached, unreachable or
        overwritten a line later, would read identically. So the shipped
        handlers are EXECUTED — the strike control's click really runs, the
        proceed control's click really runs, the network answer really comes
        back not-ok — and what is counted is the DOM the failure left behind.

        ⚠ THE DOM STUB HERE IS RICHER THAN `_RENDER_HARNESS_HEAD`'s BY EXACTLY
        WHAT THE GESTURE NEEDS: listeners are kept and dispatchable, `focus()`
        records where it landed, `querySelectorAll` really resolves a class
        (the disarm depends on it), and `apiPost` records every call it is
        given. `innerHTML = ''` still really empties, because that is how the
        shipped defect erased her way out and a stub that ignored it would
        hide exactly the bug this plan closes."""
        consts, helpers, render_rows = self._shipped_slices()
        memory = {"her_own_sentences": list(hers),
                  "reflections_that_landed": list(landed)}
        if nxt is None:
            nxt = 1 if int(target) == 0 else 0
        script = ("var POST_OK = " + json.dumps(bool(post_ok)) + ";\n"
                  + "var AFTER = " + json.dumps(after) + ";\n"
                  + "var TARGET = " + json.dumps(int(target)) + ";\n"
                  + "var NEXT = " + json.dumps(int(nxt)) + ";\n"
                  + _DRIVE_HARNESS_HEAD
                  + "var MEMORY = " + json.dumps(memory) + ";\n"
                  + consts + "\n" + helpers + "\n" + render_rows + "\n"
                  + _DRIVE_HARNESS_TAIL)
        return self._run_node(script, "her-memory-drive-")

    def replay(self, posts):
        """Send recorded browser requests at the REAL server.

        ⛔ THIS IS WHY THE STORE ASSERTIONS BELOW ARE STORE ASSERTIONS. The
        harness's `apiPost` is a stub, so nothing the browser does can reach
        the store on its own — which would make "the store is untouched"
        true of every possible tree, this repo's signature defect. Replaying
        the calls the gesture actually made closes that: a decline that
        wrongly issued a strike would DELETE her sentence here, and the
        count taken off disk afterwards is what catches it."""
        for call in posts:
            self.assertEqual(
                call["url"], self.STRIKE,
                "the only route this gesture may call is the strike")
            self.strike(json.loads(call["body"]).get("text", ""))

    # -- 30 -----------------------------------------------------------------

    def test_the_strike_deletes_from_the_store_and_the_unstruck_survives(self):
        """⛔⛔ THE CASE THIS PLAN EXISTS FOR (T-26.995-31).

        Driven RED before the strike route existed: the POST answered 404 and
        the store still held three sentences after it.

        THREE COUNTS, BY VALUE — before the strike, after it, and after a
        FRESH READ of the file — because a route that answered {ok} and wrote
        nothing would satisfy a check that only looked at the response.

        THE UNMUTATED CONTROL RIDES IN THE SAME CASE: the two sentences she
        did NOT strike are asserted present, byte-identical, after the same
        fresh read. Without that arm a strike that truncated the file to zero
        would pass this test."""
        struck = "it read like an essay about me — not with me"
        kept_a = "去年的那个冬天，你写错了"
        kept_b = "add the bit about the ferry"
        self.seed_sentences(kept_a, struck, kept_b)

        self.assertEqual(
            len(self.on_disk()), 3,
            "count 1 of 3, by value: what is on disk before she strikes")

        status, data = self.strike(struck)
        self.assertEqual(status, 200, "the strike failed: " + repr(data))
        self.assertIs(data.get("ok"), True)

        after = self.on_disk()
        self.assertEqual(
            len(after), 2,
            "count 2 of 3, by value: ONE entry left the file. A strike that "
            "only hid the line would leave three here")
        self.assertNotIn(
            struck, [e["text"] for e in after],
            "⛔ ASSERTED AGAINST THE STORE, NEVER AGAINST THE RENDERED VIEW. "
            "A view that filtered its own output would pass a rendered check "
            "and ship a deletion the room showed her and never performed")

        fresh = study_lib.load_her_sentences(self.library)["sentences"]
        self.assertEqual(
            len(fresh), 2,
            "count 3 of 3, by value: and it is still two after the file is "
            "opened again from scratch — the deletion is on disk, not in a "
            "process's memory")
        self.assertEqual(
            [e["text"] for e in fresh], [kept_a, kept_b],
            "THE UNMUTATED CONTROL: the two she did not strike survive the "
            "same fresh read, byte-identical and in her order. Without this "
            "arm a strike that emptied the whole store would pass")

    # -- 30a ----------------------------------------------------------------

    def test_striking_one_of_two_leaves_the_survivor_reachable_not_hidden(
            self):
        """⛔⛔ THE REPUDIATION THE FLOOR LET IN THROUGH THE BACK DOOR, driven
        end to end as the sequence she actually performs.

        The strike docstring's own threat is *a deletion the room SHOWED her
        and never PERFORMED*. This is its mirror, and it is worse because the
        room says it out loud: she has TWO sentences, strikes ONE, the store
        really deletes it, the live region says *that line is gone.*, `read()`
        refetches — and `HER_MEMORY_FLOOR = 2`, applied to the DISPLAY, then
        answered null. The pane repainted to *nothing in it yet.* over her
        surviving sentence, which was still on disk and no longer reachable
        from inside the room at all: only by hand-editing JSON.

        ⚠ HOW THIS WAS DRIVEN RED. Against the code as it stood, the final
        assertion failed with `memory` None where a one-row block was
        expected — the surface reporting nothing while the file below it held
        her sentence. The prompt-path arm at the end passed both before and
        after, which is what proves the fix moved the DISPLAY and left the
        evidence floor standing where it was ruled.

        ⛔ EVERY COUNT HERE IS READ BACK FROM DISK, never from the response
        and never from the seed, and the STRUCK line is asserted absent from
        the surface in the same breath as the SURVIVOR is asserted present —
        so a route that had simply stopped filtering would fail as loudly as
        one that showed nothing."""
        struck = "it read like an essay about me"
        survivor = "say more about the mornings"
        self.seed_sentences(struck, survivor)

        status, data = self.get()
        self.assertEqual(status, 200, repr(data))
        self.assertEqual(
            [r["text"] for r in data["memory"]["her_own_sentences"]],
            [survivor, struck],
            "count 1 of 3, by value: BOTH are on the surface first, newest "
            "first — the control that says the pane was working before she "
            "touched anything")

        status, data = self.strike(struck)
        self.assertEqual(status, 200, "the strike failed: " + repr(data))
        self.assertIs(data.get("ok"), True)

        on_disk = [e["text"] for e in self.on_disk()]
        self.assertEqual(
            on_disk, [survivor],
            "count 2 of 3, by value, FROM DISK: the strike really performed "
            "the deletion and left her other sentence there")

        status, data = self.get()
        self.assertEqual(status, 200, repr(data))
        memory = data.get("memory")
        self.assertIsNotNone(
            memory,
            "⛔⛔ THE REGRESSION. The room has just told her *that line is "
            "gone.* — if the refetch answers null the pane repaints to "
            "*nothing in it yet.* over a sentence still on disk, and she has "
            "been shown a deletion twice as large as the one she asked for")
        rows = memory["her_own_sentences"]
        self.assertEqual(
            [r["text"] for r in rows], [survivor],
            "count 3 of 3, by value: her surviving sentence is on the "
            "surface, verbatim — and the struck one is not")
        self.assertIs(
            rows[0]["strikeable"], True,
            "⛔ AND IT IS STILL STRIKEABLE. Reachable but frozen would be the "
            "same trap wearing a different hat: she answered 'All of them'")

        # ⛔ THE OTHER HALF OF THE RULING, ASSERTED IN THE SAME CASE SO THE
        # TWO CANNOT DRIFT. The floor was NOT deleted — it still silences the
        # PROMPT on this very library, which is the whole reason it exists
        # (D-20): the model is told nothing rather than told it remembers
        # nothing about her. Without this arm, "exempt the display" and
        # "delete the floor" would be indistinguishable here.
        prompt_block = server._reflection_her_memory(
            self.library, {"meta": {"filters": []}, "items": {}}, [])
        self.assertIsNone(
            prompt_block,
            "one sentence is STILL below the evidence floor for the prompt — "
            "the display was exempted, the floor was not lowered")
        self.assertNotIn(
            "memory",
            server._reflection_turn_doc({"bodies": []}, None, None, None, [],
                                        memory=prompt_block),
            "and the turn document therefore carries NO memory key at all")

    # -- 31 -----------------------------------------------------------------

    def test_a_forced_re_derivation_does_not_bring_a_struck_sentence_back(
            self):
        """Her sentences are STORED, not inferred — which is why this plan
        needs no suppression record. That is a claim about the mechanism, so
        it is DRIVEN rather than asserted in prose: strike, then force the
        derivation to run again from scratch and read what it produces."""
        struck = "it missed the part that mattered"
        self.seed_sentences("the loom one landed", struck, "say more, then")
        self.strike(struck)
        status, data = self.get()
        self.assertEqual(status, 200, repr(data))
        texts = [row["text"] for row
                 in (data.get("memory") or {}).get("her_own_sentences", [])]
        self.assertNotIn(
            struck, texts,
            "a re-derivation after the strike must not resurrect it. A line "
            "she deleted reappearing is worse than never having shown it — "
            "it reads as the room overruling her, on the one surface built "
            "so she can overrule the room")
        self.assertEqual(
            sorted(texts), sorted(["the loom one landed", "say more, then"]),
            "and the other two are still derived, so the re-derivation ran "
            "at all — without this arm an empty answer would pass")

    # -- 32 -----------------------------------------------------------------

    def test_the_surface_shows_the_derivation_in_her_ranked_order(self):
        """D-19's order is HERS and it is a PRIORITY order. The surface
        RENDERS the derivation; it does not re-order, re-word, rank or score
        it. ⛔ It also calls the SHIPPED derivation rather than a second one —
        proven by the group names being the block's own keys."""
        self.seed_sentences("it read like an essay about me",
                            "去年的那个冬天，你写错了")
        self.seed_ledger([("the ferry", "passed"), ("the loom", "saved")])
        self.seed_store([self.essay(0, "the loom", "## the loom\n\nits own.")])
        status, data = self.get()
        self.assertEqual(status, 200, repr(data))
        memory = data.get("memory")
        self.assertIsNotNone(memory, "above the floor, the memory is shown")
        self.assertEqual(
            list(memory),
            ["her_own_sentences", "reflections_that_landed"],
            "her order, unchanged in its ranking: what she typed FIRST, "
            "because that is her talking, then the room's names. ⚠ TWO KEYS "
            "AND NOT THREE IS HER OWN RULING (OD-1): once essay bodies are "
            "excluded, the room's-own-writing group is exactly the kept "
            "subset of the landed one, so three lists would print every kept "
            "reflection twice under two headings saying the same thing")
        self.assertEqual(
            [r["text"] for r in memory["her_own_sentences"]],
            ["去年的那个冬天，你写错了", "it read like an essay about me"],
            "her sentences VERBATIM and newest-first, exactly as the shipped "
            "reader hands them over — no truncation, no ellipsis, no summary")
        self.assertEqual(
            [r["title"] for r in memory["reflections_that_landed"]],
            ["the loom", "the ferry"])
        self.assertEqual(
            [r["kept"] for r in memory["reflections_that_landed"]],
            [True, False],
            "kept and passed, one bit each — not a score, not a rank")

    # -- 33 -----------------------------------------------------------------

    def test_the_kept_and_passed_rows_carry_no_strike(self):
        """⚠ THE ASYMMETRY, SURFACED RATHER THAN BURIED (§ C-7). Her own
        sentences are stored, so a strike is a real deletion. The
        kept-and-passed record is DERIVED FROM THE LEDGER — a strike there
        would be undone by the next derivation, and that ledger also enforces
        the never-repeat-a-name check, which is not this surface's to damage.

        So one half of the surface answers to her gesture and the other does
        not, and the wire says which: only her own sentences carry the
        strikeable marker."""
        self.seed_sentences("it read like an essay about me", "say more")
        self.seed_ledger([("the ferry", "passed"), ("the loom", "saved")])
        self.seed_store([self.essay(0, "the loom", "## the loom\n\nits own.")])
        memory = self.get()[1]["memory"]
        self.assertTrue(
            all(r.get("strikeable") is True
                for r in memory["her_own_sentences"]),
            "every sentence of hers is strikeable — D-21, she may delete any")
        landed = memory["reflections_that_landed"]
        self.assertEqual(
            len(landed), 2,
            "the merged list must be populated BY VALUE or this arm proves "
            "nothing — a query that found no rows would report 'no strikes "
            "here' forever")
        self.assertTrue(
            all(r.get("strikeable") is not True for r in landed),
            "⛔ NOT strikeable, and the reason is written beside the render "
            "so the next reader meets it as a decision rather than an "
            "oversight: this half is derived from the ledger, so a strike "
            "would be undone by the next derivation, and that ledger also "
            "enforces the never-repeat-a-name check")

    # -- 34 -----------------------------------------------------------------

    def test_the_surface_never_ships_the_rooms_essay_body(self):
        """The surface shows a reflection's own NAME. The block hands the
        MODEL the essay's full text — that is D-19 group (3) and it is right
        there — but the display route drops it, because every line on this
        surface is either her text verbatim or a reflection's name, and a
        body on the wire is a body a render can start quoting."""
        body = "## the loom\n\nSENTINEL-ROOM-ESSAY-BODY-TEXT."
        self.seed_sentences("it read like an essay about me", "say more")
        self.seed_ledger([("the loom", "saved")])
        self.seed_store([self.essay(0, "the loom", body)])
        status, raw = self.get()
        self.assertEqual(status, 200)
        memory = raw["memory"]
        self.assertEqual(
            [r["title"] for r in memory["reflections_that_landed"]],
            ["the loom"],
            "the room's own writing is present BY NAME — without this arm "
            "the absence below would be proved by an empty group")
        self.assertNotIn(
            "SENTINEL-ROOM-ESSAY-BODY-TEXT",
            json.dumps(raw, ensure_ascii=False),
            "and its BODY is nowhere on the wire — not under any key. The "
            "MODEL is handed that text and should be; SHE is shown the name, "
            "because a body on the wire is a body a render can start quoting")
        self.assertNotIn(
            "its_own_writing", raw["memory"],
            "and there is no second list for it to sit in (OD-1, hers)")

    # -- 35 -----------------------------------------------------------------

    def test_with_nothing_stored_the_surface_says_her_sentence_alone(self):
        """⛔ CHARACTER FOR CHARACTER, and with NOTHING appended.

        She was offered a variant explaining the silence and a variant
        pointing forward, and chose NEITHER. The absence of a reason and the
        absence of an invitation are the ruling.

        ⛔⛔ THIS CASE USED TO SEED ONE SENTENCE AND CALL THAT THE EMPTY STATE,
        AND THAT IS HOW IT PINNED A REPUDIATION AS CORRECT. `HER_MEMORY_FLOOR`
        was applied to the DISPLAY as well as the prompt, so a library holding
        one of her sentences answered null and the pane painted *nothing in it
        yet* over a sentence that was still on disk. The case asserted exactly
        that null and passed, which is why forty-four green cases and a clean
        owner UAT never saw it — the check MIRRORED the code.

        The empty state is now driven by a GENUINELY EMPTY library, which is
        the only thing it was ever supposed to mean, and the arm that would
        have caught the original bug rides in the same case: one stored
        sentence must NOT produce the empty state. Without that arm a route
        that answered null unconditionally would pass every assertion here."""
        status, data = self.get()          # nothing seeded at all
        self.assertEqual(status, 200, repr(data))
        self.assertEqual(
            len(self.on_disk()), 0,
            "the measured starting point, by value: nothing of hers on disk")
        self.assertIsNone(
            data.get("memory"),
            "with GENUINELY NOTHING STORED the memory is SILENT — absent, "
            "never an empty shape, exactly as the prompt half omits the key")
        # ⛔ THE ARM THAT SHOULD FAIL, and the one whose absence let the
        # repudiation ship. A single sentence of hers is BELOW THE PROMPT'S
        # EVIDENCE FLOOR and is still HERS, so it reaches the surface she
        # deletes from — otherwise it is unstrikeable from inside the room.
        self.seed_sentences("only one thing she ever said")
        status, data = self.get()
        self.assertEqual(status, 200, repr(data))
        self.assertIsNotNone(
            data.get("memory"),
            "⛔ ONE stored sentence is NOT her empty state. The floor is a "
            "prompt-evidence device (D-20); the display is where she reaches "
            "her own words, and she answered 'All of them' (OD-2)")
        self.assertEqual(
            [r["text"] for r in data["memory"]["her_own_sentences"]],
            ["only one thing she ever said"],
            "and it is HER sentence, by value, verbatim")
        app = (_REPO_ROOT / "app.js").read_text(encoding="utf-8")
        self.assertEqual(
            js_string_literal(app, "HER_MEMORY_EMPTY"), HER_EMPTY_STATE,
            "⛔ CHARACTER FOR CHARACTER, AND THIS IS AN EQUALITY RATHER THAN "
            "AN `in` ON PURPOSE — the equality is its own positive control. "
            "It fails on drift in EITHER direction: a clause reworded, a "
            "reason appended, an invitation appended, or the newline she "
            "ruled for (OD-3, 'Its own line') flattened to a space")
        self.assertEqual(
            js_string_literal(app, "HER_MEMORY_HEADING"), HER_SURFACE_HEADING,
            "under the heading she was shown it under")
        # ⛔ AND NOTHING IS APPENDED ANYWHERE NEAR IT. The equality above
        # already forbids appending INSIDE the constant; this catches a
        # second constant rendered beside it in the empty branch.
        i = app.index("HER_MEMORY_EMPTY =")
        for declined in ("rather know nothing", "as you go", "it will fill",
                         "check back"):
            self.assertNotIn(
                declined, app[i:i + 600],
                "a reason or an invitation was added beside a sentence she "
                "chose BECAUSE it had neither: " + declined)

    # -- 36 -----------------------------------------------------------------

    def test_the_surface_has_no_add_or_edit_control(self):
        """⛔ SHE SUBTRACTS; SHE DOES NOT AUTHOR (T-26.995-34).

        A composed memory inherits the unchecked no-invention floor AND THE
        FAILURE COMPOUNDS — an invented memory does not spoil one reflection,
        it writes every reflection after it. So the surface's own markup is
        read from source and proved to contain no input, no textarea, and no
        add control.

        ⚠ THIS IS A SOURCE ASSERTION OVER A VIEW, and it is here because
        26.995-12 found that removing a label from the server left the browser
        half unguarded while all 38 Python suites stayed green — not one of
        them opens the view she actually reads on.

        ⚠ IT IS SCOPED TO THE RENDERER'S OWN BODY, not to app.js as a whole:
        a file-wide grep for `<input` would be red for every unrelated pane
        and would therefore be deleted by the next person who saw it."""
        body = self.renderer_body()
        # ⛔ THE KNOWN-POSITIVE, AND IT ALREADY EARNED ITS PLACE. The first
        # version of this check searched for `<button` — markup this renderer
        # never writes, because it builds real nodes. Every absence below
        # would have "passed" against a body the query could not see into.
        # The positive control is what failed and said so.
        self.assertIn(
            "createElement('button')", body,
            "the instrument finds a control that IS there — without this "
            "every absence below could be an empty search")
        # Both spellings: the markup form (an innerHTML row) and the DOM form
        # (this renderer's own idiom). A check that knew only one would go
        # quiet the moment someone added the other.
        for forbidden in ("<input", "<textarea", "contenteditable",
                          "createElement('input')",
                          "createElement('textarea')",
                          "add a line", "add your own"):
            self.assertNotIn(
                forbidden, body,
                "an add-or-edit affordance reached the surface she may only "
                "subtract from: " + forbidden)

    # -- 37 -----------------------------------------------------------------

    def test_nothing_counts_totals_ranks_or_dates_her_strikes(self):
        """Law 3 and D-21 together. Nothing on this surface may count, total,
        rank or date her strikes, and nothing may reference absence or elapsed
        time — so the wire carries no stamp, no index, no ordinal and no
        total, and the renderer names none of them."""
        self.seed_sentences("it read like an essay about me", "say more",
                            "and the ferry")
        self.seed_ledger([("the loom", "saved")])
        raw = self.get()[1]
        for row in raw["memory"]["her_own_sentences"]:
            self.assertEqual(
                sorted(row), ["about", "strikeable", "text"],
                "her sentence, the name it is anchored to, and whether she "
                "may strike it. ⛔ NO `ms` — a stamp on the wire is a date "
                "waiting for a render to print it — and NO CATEGORY (D-26)")
        blob = json.dumps(raw, ensure_ascii=False)
        for forbidden in ("\"total\"", "\"count\"", "\"rank\"", "\"score\"",
                          "\"ms\"", "\"index\""):
            self.assertNotIn(forbidden, blob, "on the wire: " + forbidden)

    # -- 38 -----------------------------------------------------------------

    def test_a_strike_that_matches_nothing_is_not_an_error(self):
        """The `not-relevant/undo` posture, and the same reason: asking for a
        state that is already true is not a failure, and putting a red line in
        front of her for getting what she wanted would be the wrong answer.

        ⚠ AND THE STORE IS UNTOUCHED — asserted by value, because a route that
        answered {ok} by rewriting the file with everything dropped would
        satisfy the status check alone."""
        self.seed_sentences("one", "two")
        status, data = self.strike("a sentence she never typed")
        self.assertEqual(status, 200, repr(data))
        self.assertIs(data.get("ok"), True)
        self.assertEqual(
            [e["text"] for e in self.on_disk()], ["one", "two"],
            "nothing moved")

    # -- 39 -----------------------------------------------------------------

    def test_the_strike_refuses_an_empty_or_wrong_shaped_ask(self):
        """FAIL CLOSED on the only route in this phase that DELETES. An ask
        with no text, or with something that is not text, must never be read
        as "strike everything"."""
        self.seed_sentences("one", "two")
        for bad in ("", "   ", None, 5, ["one"]):
            with self.subTest(text=bad):
                status, _ = self.strike(bad)
                self.assertEqual(
                    status, 400,
                    "a malformed strike is refused, never guessed at")
        self.assertEqual(
            [e["text"] for e in self.on_disk()], ["one", "two"],
            "and not one byte moved across all five refusals")

    # -- 40 -----------------------------------------------------------------

    def test_the_display_route_is_not_the_offer_memory_route(self):
        """⚠ THE NEAR-MISS THIS CASE PINS. `/api/librarian/memory` already
        existed before this plan — it is 26.95-31's OFFER memory, a route that
        answers item ids and one timestamp and whose whole design is that NO
        CONTENT crosses it. Building this surface on it would push her own
        sentences through a route built to carry none.

        They are two different routes and they stay two."""
        self.seed_sentences("it read like an essay about me", "say more")
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        try:
            conn.request("GET", "/api/librarian/memory")
            resp = conn.getresponse()
            offer = json.loads(resp.read())
        finally:
            conn.close()
        self.assertNotIn(
            "it read like an essay about me",
            json.dumps(offer, ensure_ascii=False),
            "⛔ the OFFER memory route carries no content of hers, and this "
            "plan did not change that")
        self.assertNotIn(
            "memory", [k for k in offer if k == "her_own_sentences"],
            "and it is not answering the derived block either")
        self.assertIsNotNone(
            self.get()[1].get("memory"),
            "while the surface's own route does — a different route, which "
            "is the whole point of this case")

    # -- 41 -----------------------------------------------------------------

    def test_a_fenced_title_is_screened_on_the_surface_too(self):
        """⛔⛔ T-26.995-35: A NEW READ SURFACE OVER HER MATERIAL IS A DOOR,
        AND THE FENCE IS CHECKED HERE RATHER THAN ASSUMED.

        26.995-11 closed a real hole of exactly this shape — her chat
        sentences had never passed through any fence predicate, and a fenced
        note's title was MEASURED reaching the prompt. This route opens the
        same store onto a second path. It is screened by the SAME shipped
        predicate, through the same resolved list, because the derivation is
        CALLED rather than re-implemented — and that claim is driven here
        instead of being trusted to a docstring.

        ⚠ THE LIST IS RESOLVED FROM THE STORE, so the fixture fences a real
        item rather than handing the screen a list; a case that passed its own
        answer in would be testing its own fixture."""
        fenced_title = "the hospital discharge letter"
        rides = "the loom bit landed"
        also_rides = "the ferry bit did not"
        names_it = "it read like " + fenced_title + " read"
        self.seed_sentences(rides, names_it, also_rides)
        self.seed_ledger([("the loom", "saved")])

        # THE CONTROL FIRST, and it is the arm that should fail: with the
        # item NOT fenced, the same sentence rides. So the exclusion below
        # measures the screen rather than some unrelated reason it went
        # missing.
        open_item = self.essay(0, fenced_title, "## it\n\nbody.")
        self.seed_store([open_item])
        unscreened = [r["text"] for r
                      in self.get()[1]["memory"]["her_own_sentences"]]
        self.assertIn(
            names_it, unscreened,
            "⛔ THE ARM THAT SHOULD FAIL: with nothing fenced, the sentence "
            "naming that title reaches the surface")
        self.assertEqual(len(unscreened), 3, "all three, by value")

        # Now fence that same item, changing NOTHING else.
        fenced_item = dict(open_item, state="never_show")
        self.seed_store([fenced_item])
        status, raw = self.get()
        self.assertEqual(status, 200, repr(raw))
        texts = [r["text"] for r in raw["memory"]["her_own_sentences"]]
        self.assertEqual(
            len(texts), 2,
            "BY VALUE, the SURVIVING count — and this half is what makes the "
            "case non-vacuous: a screen that dropped EVERYTHING would fail "
            "here exactly as loudly as one that dropped nothing")
        self.assertEqual(
            texts, [also_rides, rides],
            "the two that should survive do, still newest first — the screen "
            "removes, it never reorders")
        self.assertNotIn(
            fenced_title, json.dumps(raw, ensure_ascii=False),
            "⛔ AND THE FENCED TITLE IS NOWHERE ON THE WIRE, under any key. "
            "Law 5 makes a leak a P0, and this surface is a door")

    # -- 42 -----------------------------------------------------------------

    def test_all_of_her_sentences_reach_the_surface_not_the_handful(self):
        """⛔ OD-2, AND SHE RULED IT WITH THE COST IN FRONT OF HER.

        The PROMPT is handed the newest handful, because that is a cost
        bound. The SURFACE is handed all of them, because D-21 says she may
        delete ANY of them — and a surface showing only the handful would
        leave every older sentence unstrikeable from inside the room,
        reachable only by hand-editing a file. She was told that plainly and
        answered "All of them".

        ⚠ THE CONTROL IS THE PROMPT PATH IN THE SAME CASE. Without it a
        surface that had simply lost its cap for an unrelated reason would
        pass, and — worse — a change that removed the cap from BOTH paths
        would sail through while quietly multiplying the cost of every
        sitting."""
        many = ["sentence number %d" % n for n in range(1, 26)]
        self.seed_sentences(*many)
        shown = [r["text"] for r
                 in self.get()[1]["memory"]["her_own_sentences"]]
        self.assertEqual(
            len(shown), 25,
            "ALL of them, by value — every sentence in the store is on the "
            "surface and therefore strikeable from inside the room")
        self.assertEqual(
            shown[0], "sentence number 25",
            "still newest first — the cap is gone, the order is not")
        prompt = server._reflection_her_memory(
            self.library, {"meta": {"filters": []}, "items": {}}, [])
        self.assertEqual(
            len(prompt["her_own_sentences"]), server.HER_MEMORY_SENTENCES,
            "⛔ THE CONTROL: the PROMPT still pays its cap in the same case, "
            "and it is the same function serving both. Without this arm a "
            "change that dropped the cap from BOTH paths would pass here "
            "while quietly multiplying the cost of every sitting")

    # -- 43 -----------------------------------------------------------------

    def test_no_reflection_is_listed_twice_and_group_three_is_discharged(
            self):
        """⛔ OD-1, HERS: "Merge into one list."

        The literal reading of the plan gave three lists. But every line here
        is her text or a reflection's NAME, so once essay bodies are excluded
        the room's-own-writing group is exactly the KEPT SUBSET of the landed
        group — and she would have read the same reflection printed twice
        under two headings as a bug.

        ⚠ MERGING DISCHARGES BOTH OBLIGATIONS AND THIS CASE PROVES IT rather
        than asserting it: the kept/passed bit is on the row, AND the name
        the third group would have carried is present and marked."""
        self.seed_sentences("it read like an essay about me", "say more")
        self.seed_ledger([("the ferry", "passed"), ("the loom", "saved"),
                          ("the harbour", "saved")])
        # Both kept reflections are materialized, so the third group WOULD
        # have carried both names had it survived.
        self.seed_store([self.essay(0, "the loom", "## the loom\n\nits own."),
                         self.essay(1, "the harbour", "## harbour\n\nits.")])
        memory = self.get()[1]["memory"]
        titles = [r["title"] for r in memory["reflections_that_landed"]]
        self.assertEqual(
            sorted(titles), ["the ferry", "the harbour", "the loom"],
            "all three landed reflections, once each")
        self.assertEqual(
            len(titles), len(set(titles)),
            "⛔ AND NOT ONE OF THEM TWICE — the whole point of the merge")
        kept = {r["title"] for r in memory["reflections_that_landed"]
                if r["kept"]}
        self.assertEqual(
            kept, {"the loom", "the harbour"},
            "the group-3 obligation, discharged inside the merged list: both "
            "names the room's-own-writing group would have carried are here, "
            "and each is identifiable as one the room wrote and she kept")

    # -- 44 -----------------------------------------------------------------

    def test_the_marker_rides_every_room_authored_row_and_none_of_hers(self):
        """⛔ D-20's marking rule, asserted BOTH WAYS BY VALUE.

        The harm this closes is direct: she reads a line on this surface and
        cannot tell whether she wrote it. ⚠ A marker on EVERYTHING must fail
        as loudly as a marker on nothing, which is why both counts are
        asserted — a render that marked her own sentences would be just as
        wrong as one that marked none of the room's.

        ⚠ AND IT REACHES FURTHER THAN THE MERGED LIST: a reflection's NAME is
        prose the librarian wrote, and a name appears on the line beneath
        each of her own sentences too. So the marker rides there as well —
        marking the name, never her sentence."""
        app = (_REPO_ROOT / "app.js").read_text(encoding="utf-8")
        self.assertEqual(
            js_string_literal(app, "HER_MEMORY_MARKER"), HER_MARKER,
            "her stance, verbatim — chosen over three others because it is "
            "the clearest read aloud, which is the case that matters when it "
            "stands alone with no name beside it")
        body = self.renderer_body()
        # The marker is put into the row's own TEXT, never a colour, never a
        # typeface, never a CSS pseudo-element — it has to survive being read
        # aloud with all styling stripped.
        self.assertIn(
            "textContent", body,
            "the marker and her sentence are both text content")
        self.assertNotIn(
            "::before", body, "the marker is never a CSS pseudo-element")
        # BOTH SIDES BY VALUE, on the wire: every room-authored row is
        # flagged, and not one of hers is.
        self.seed_sentences("it read like an essay about me", "say more")
        self.seed_ledger([("the ferry", "passed"), ("the loom", "saved")])
        memory = self.get()[1]["memory"]
        marked = [r for r in memory["reflections_that_landed"]
                  if r.get("room_wrote_this") is True]
        self.assertEqual(
            len(marked), 2,
            "BY VALUE: every room-authored row carries the flag the render "
            "marks from. A render marking nothing fails here")
        unmarked = [r for r in memory["her_own_sentences"]
                    if r.get("room_wrote_this") is True]
        self.assertEqual(
            len(unmarked), 0,
            "BY VALUE: and NONE of her own sentences does. A render marking "
            "everything fails here exactly as loudly")

    # -- 45 -----------------------------------------------------------------

    def test_the_settings_list_entry_and_the_page_heading_are_one_name(self):
        """⛔⛔ THE FAILURE 26.96 OD-1'S BUILD NOTE WARNS ABOUT (T-26.995-60).

        This page's name is a SEPARATE STRING LITERAL IN TWO PLACES — the
        settings-list entry in MANAGE_PANES and the page's own heading — so a
        rename that lands in one of them leaves the list and the page calling
        the same surface two different things, and the person who notices is
        her.

        ⛔ THE FIRST ASSERTION IS SITE AGAINST SITE, and it is deliberately
        NOT either site against a constant. A check that re-typed the new
        title and compared it to the heading would pass a half-done rename
        while reading exactly like a gate — this project's signature defect,
        nine recorded instances. It was driven RED by moving one of the two
        literals and leaving the other.

        The second assertion then pins the name they agree on to the wording
        SHE chose, so two sites quietly agreeing on something she never said
        fails just as loudly."""
        app = (_REPO_ROOT / "app.js").read_text(encoding="utf-8")
        rail = js_manage_pane_label(app, "memory")
        heading = js_string_literal(app, "HER_MEMORY_HEADING")
        self.assertEqual(
            rail, heading,
            "⛔ THE SETTINGS LIST AND THE PAGE DISAGREE about what this "
            "surface is called. Both literals move in ONE change or neither "
            "does: " + repr(rail) + " vs " + repr(heading))
        self.assertEqual(
            heading, HER_SURFACE_HEADING,
            "...and the name the two sites agree on is HERS — 26.96 OD-1, "
            "ruled 2026-08-20, read back to her and not corrected, and asked "
            "for again on 2026-08-21. Character for character")

    # -- 46 -----------------------------------------------------------------

    def test_her_two_lines_are_verbatim_and_true_of_what_is_there(self):
        """⛔ OD-1's two explanatory lines — and the check that they are TRUE.

        ⭐⭐ THE SECOND HALF IS THE POINT AND IT IS WHY THIS CASE IS LONG.
        This project has shipped a front-facing sentence describing a
        behaviour that did not exist, and the gate credited with catching
        that class turned out to be a list of literals with no way to notice.
        A line-for-line equality here would inherit exactly that hole: it
        would keep saying "with a remove this line control next to each"
        long after the control was gone. So each line is also checked against
        the thing it promises — on the wire AND in the renderer's own body.

        ⚠ The equality is against constants TYPED BY HAND at the top of this
        file, while the shipped ones were copied out of the primary record,
        so the two spellings came by different routes."""
        app = (_REPO_ROOT / "app.js").read_text(encoding="utf-8")
        self.assertEqual(
            js_string_literal(app, "HER_MEMORY_LINE_1"), HER_SURFACE_LINE_1,
            "⛔ HER ADOPTED LINE 1, CHARACTER FOR CHARACTER — em dash, "
            "capitals and full stop included. Tier 2 is still hers")
        self.assertEqual(
            js_string_literal(app, "HER_MEMORY_LINE_2"), HER_SURFACE_LINE_2,
            "⛔ HER ADOPTED LINE 2, CHARACTER FOR CHARACTER")

        body = self.renderer_body()
        for const in ("HER_MEMORY_LINE_1", "HER_MEMORY_LINE_2"):
            self.assertIn(
                const, body,
                "a constant she adopted that no renderer ever reaches is a "
                "decision recorded and not built — the exact class this "
                "plan exists to close: " + const)
        # BENEATH THE TITLE, ABOVE THE LIST — her words were "as title and
        # then", and a line that rendered after the rows would answer a
        # question she had already given up on by the time she reached it.
        self.assertLess(
            body.index("HER_MEMORY_HEADING"), body.index("HER_MEMORY_LINE_1"),
            "the two lines sit BENEATH the title")
        self.assertLess(
            body.index("HER_MEMORY_LINE_2"), body.index("box.appendChild(list)"),
            "...and ABOVE the list they describe")
        # ⛔ UNCONDITIONAL. A page that explained itself only once it had
        # content would be silent in precisely the state she was looking at
        # when she asked for this — her library sits below the evidence floor
        # — and its own appearance would then be a signal that something had
        # arrived, which is a count by another name (law 3).
        #
        # ⚠⚠ THIS IS ASSERTED BY ITS APPEND TARGET NOW, NOT BY PUNCTUATION
        # (IN-03), AND THE REPLACED CHECK IS WORTH RECORDING. It scanned the
        # head-to-list slice for `if (`, `hers.length`, `landed.length` and
        # `?`. Two things were wrong with it: `?` and `if (` match inside a
        # comment, a CSS value or a ternary in a style string, so it went red
        # on edits that changed nothing about conditionality — the profile of
        # a check the next reader deletes with good reason; and it could not
        # see the failure it was really guarding. Appending the two lines to
        # the LIST instead of the BOX keeps source order and the absence of
        # an `if` perfectly intact, while `renderRows`'s own
        # `list.innerHTML = ''` wipes them on every read — her explanation
        # would vanish the first time the surface refreshed.
        #
        # ⚠ THE COMMENTS ARE STRIPPED ONCE, HERE, and the same stripped text
        # is what the clamp scan further down reads. One stripper, not two.
        code = "\n".join(ln for ln in body.split("\n")
                         if not ln.lstrip().startswith("//"))
        lines_block = code[
            code.index("[HER_MEMORY_LINE_1, HER_MEMORY_LINE_2].forEach("):
            code.index("var list = document.createElement(")]
        self.assertIn(
            "box.appendChild(p)", lines_block,
            "⛔ HER TWO LINES GO INTO THE BOX — the container that outlives a "
            "read. Appended to the list instead, they would be wiped by the "
            "next refresh with no `if` anywhere and nothing else to see")
        self.assertNotIn(
            "list.appendChild", lines_block,
            "...and NOT into the list, which is cleared on every read")
        render_rows = code[code.index("function renderRows(memory) {"):
                           code.index("function read(after) {")]
        self.assertIn(
            "list.innerHTML = ''", render_rows,
            "the instrument can see the clearing it is reasoning about — "
            "the list really is emptied on every read")
        self.assertNotIn(
            "box.", render_rows,
            "...and the box is never touched there, which is what makes the "
            "append target load-bearing rather than a stylistic choice")
        # And the two lines still stand behind no test of their own. ⚠ NARROW
        # BY DESIGN: seven lines of comment-stripped code, not the whole head
        # of the renderer, so a ternary in an unrelated style string cannot
        # redden it.
        for gate in ("if (", "hers.length", "landed.length"):
            self.assertNotIn(
                gate, lines_block,
                "the two lines are rendered unconditionally, never behind a "
                "test on whether there is anything to describe: " + gate)

        # ---- LINE 1's PROMISE, ON THE WIRE ----------------------------------
        self.seed_sentences("it read like an essay about me", "say more")
        self.seed_ledger([("the ferry", "passed"), ("the loom", "saved")])
        memory = self.get()[1]["memory"]
        hers = memory["her_own_sentences"]
        self.assertEqual(
            sorted(r["text"] for r in hers),
            ["it read like an essay about me", "say more"],
            "'Your own sentences — shown in full': every stored sentence, "
            "whole, nothing trimmed and nothing dropped")
        # ⛔⛔ 'WITH A REMOVE THIS LINE CONTROL NEXT TO EACH' — MEASURED ON
        # THE RENDER, BY VALUE, AT FOUR FIXTURE SIZES INCLUDING ZERO.
        #
        # ⚠ WHAT THIS REPLACED (WR-04) AND WHY THE PROMISE IS UNCHANGED. The
        # old check read a `strikeable` field back off the wire; the response
        # builder sets that field as a hard-coded literal per row, so it was
        # true for every possible tree and could not detect the SUBSET
        # failure its own message names — a gate that cannot fire, inside the
        # case written to end that class. Her line's promise is EACH, so the
        # message stays exactly what it was; only the instrument moved.
        #
        # ⛔ THE ZERO ARM CANNOT PASS VACUOUSLY: the non-zero arms run in the
        # same loop, so a harness that silently built nothing at all fails at
        # n = 1 before the zero could be believed.
        for n in (0, 1, 3):
            built = self.render_the_surface(
                [{"text": "her sentence %d" % i, "about": "the ferry",
                  "strikeable": True} for i in range(n)])
            self.assertEqual(
                built["strike_controls"], n,
                "'with a remove this line control next to each' — EACH, not "
                "the newest, not a subset. The shipped renderer was run over "
                "%d of her sentences and built %d controls"
                % (n, built["strike_controls"]))
            self.assertEqual(
                built["labels"], [HER_STRIKE_LABEL] * n,
                "...and every control it built carries HER label")
        # ...and once more over the rows the WIRE really answered with, so
        # the measurement is tied to the fixture above it and not only to
        # shapes this case invented.
        built = self.render_the_surface(hers)
        self.assertEqual(
            built["strike_controls"], 2,
            "BY VALUE: two of her sentences on the wire, two controls on the "
            "surface — the count is her promise made countable")
        self.assertEqual(
            js_string_literal(app, "HER_MEMORY_STRIKE"), HER_STRIKE_LABEL,
            "⛔ AND THE CONTROL REALLY CARRIES THAT NAME. Her line names the "
            "control by its label; a relabelled control makes her own "
            "sentence describe something that is not on the screen")
        hers_block = body[body.index("hers.forEach("):
                          body.index("landed.forEach(")]
        self.assertIn(
            "createElement('button')", hers_block,
            "the control is a real control, built inside the loop over HER "
            "sentences — so there is one next to each")
        self.assertIn("HER_MEMORY_STRIKE", hers_block, "and it is hers")
        # ⛔ NOTHING TRUNCATES HER SENTENCE, which is the other half of "in
        # full" and the half a wire check cannot see.
        #
        # ⚠ THE COMMENTS ARE STRIPPED FIRST, AND THE FIRST VERSION OF THIS
        # CHECK WAS RED BECAUSE THEY WERE NOT. The renderer carries a comment
        # promising that nothing "truncates, clamps or ellipsises" her
        # sentence — so scanning the raw body made a comment SAYING the right
        # thing fail as though it were code DOING the wrong thing. A comment
        # is not a clip, and a check that cannot tell them apart would be
        # deleted by the next reader with good reason. `code` was stripped
        # ONCE, above, and this reads that same text.
        self.assertIn(
            "white-space:pre-wrap", code,
            "the instrument can see the style strings it is about to search")
        for clamp in ("text-overflow", "line-clamp", "ellipsis", "maxHeight"):
            self.assertNotIn(
                clamp, code,
                "'shown in full' stops being true the moment the render "
                "clips it: " + clamp)

        # ---- LINE 2's PROMISE, ON THE WIRE ----------------------------------
        landed = memory["reflections_that_landed"]
        self.assertEqual(
            sorted(r["title"] for r in landed), ["the ferry", "the loom"],
            "'Reflections that landed' — by name, both of them")
        for row in landed:
            self.assertEqual(
                sorted(row), ["kept", "room_wrote_this", "title"],
                "'just the reflection's name, and whether you kept it or "
                "passed on it' — JUST that. No body, no stamp, no count")
        landed_block = body[body.index("landed.forEach("):]
        self.assertEqual(
            js_string_literal(app, "HER_MEMORY_KEPT"), HER_KEPT,
            "the kept-or-passed bit her line promises, in her words")
        self.assertEqual(
            js_string_literal(app, "HER_MEMORY_PASSED"), HER_PASSED,
            "the kept-or-passed bit her line promises, in her words")
        self.assertIn("HER_MEMORY_KEPT", landed_block, "and it is rendered")
        self.assertIn("HER_MEMORY_PASSED", landed_block, "both ways")

    # -- 47 -----------------------------------------------------------------

    def test_her_four_strike_sentences_are_pinned_to_constant_and_render(self):
        """⛔⛔ FOUR SENTENCES SHE RULED, ASSERTED NOWHERE AT ALL UNTIL NOW.

        `26.995-VERIFICATION.md` gap 3: `HER_CONFIRM_LINE`, `HER_PROCEED`,
        `HER_DECLINE` and `HER_GONE` were declared at the top of this file and
        used in ZERO assertions — four occurrences in the whole file, all four
        of them the declaration — ON THE ONE SURFACE BUILT TO KEEP
        WHOSE-WORDS-ARE-WHOSE HONEST. A reword of any of the four shipped
        GREEN. They are OC-4a, OC-4b, OC-4c and OC-8, ruled by her on
        2026-08-19 and recorded verbatim in `26.995-13-SUMMARY.md` and
        `26.995-OWED-TO-OWNER.md`.

        ⛔ BOTH ENDS, AND THE SECOND END IS THE POINT. A check that re-types
        one of her strings and asserts the constant equals it is a mirror of
        THIS FILE, not of the code: it passes whatever is there if the two
        copies drift together, and it says nothing about whether the sentence
        reaches her. So each is held between the DECODED constant value and
        the render slice that REFERENCES that constant — and the slice is the
        strike's own click handler, never the whole file, because the file is
        where the constant is DECLARED and a file-wide `assertIn` would pass
        happily on a constant nothing uses.

        ⚠ THE PAIR IS ASSERTED AS A PAIR. A confirm that offers only the way
        forward is not a confirm; both of her words are built in one block.

        ⛔⛔ AND `HER_GONE` IS ASSERTED PRESENT ON THE SUCCESS ARM AND ABSENT
        FROM THE FAILURE ARM. A room that says *that line is gone.* when the
        store refused the deletion is this surface's own repudiation threat
        said out loud — and OC-8 is the one sentence here a sighted reviewer
        never sees, so no UAT beat can catch it."""
        app = (_REPO_ROOT / "app.js").read_text(encoding="utf-8")
        body = self.renderer_body()

        # The strike control's OWN click handler, bounded at its opening and
        # at the loop that follows the one it lives in.
        handler = body[
            body.index("btn.addEventListener('click', function () {"):
            body.index("landed.forEach(")]
        # The confirm block that handler BUILDS — up to the point where the
        # proceed control is given its behaviour.
        confirm = handler[:handler.index("go.addEventListener(")]
        post = handler[handler.index(
            "apiPost('/api/librarian/what-it-knows/strike'"):]
        # ⚠ `function failed() {` IS A REAL EDGE, not a convenient one: the
        # failure copy lives inside that function, and the success
        # continuation is everything before it.
        success_arm = post[:post.index("function failed() {")]
        failure_arm = post[post.index("function failed() {"):]

        values_pinned = 0
        renders_pinned = 0
        for const, hers, where, where_src in (
                ("HER_MEMORY_CONFIRM_LINE", HER_CONFIRM_LINE,
                 "the confirm block", confirm),
                ("HER_MEMORY_PROCEED", HER_PROCEED,
                 "the confirm block", confirm),
                ("HER_MEMORY_DECLINE", HER_DECLINE,
                 "the confirm block", confirm),
                ("HER_MEMORY_GONE", HER_GONE,
                 "the strike's success arm", success_arm)):
            self.assertEqual(
                js_string_literal(app, const), hers,
                "⛔ HERS, CHARACTER FOR CHARACTER — the full stop and the "
                "lower case are hers too. Ruled 2026-08-19; the check moves, "
                "the words never do: " + const)
            values_pinned += 1
            self.assertIn(
                const, where_src,
                "...AND IT REACHES HER. A constant no renderer references is "
                "a sentence she was promised and never shown. Expected in "
                + where + ": " + const)
            renders_pinned += 1

        self.assertEqual(values_pinned, 4,
                         "BY VALUE: four of her strings held at their value")
        self.assertEqual(renders_pinned, 4,
                         "BY VALUE: four held at their render")
        self.assertEqual(
            values_pinned + renders_pinned, 8,
            "BY VALUE: eight assertions, two ends per string — because a "
            "loop that silently iterated over nothing would otherwise report "
            "a clean pass here, which is this repo's recorded failure mode")

        # ⛔ THE CONFIRM IS A PAIR, BUILT IN ONE BLOCK.
        self.assertIn("acts.appendChild(go)", confirm,
                      "the way forward is offered")
        self.assertIn(
            "acts.appendChild(no)", confirm,
            "...and so is the way out. A confirm offering only one of the "
            "two is not a confirm, and the one it would drop is hers")
        self.assertEqual(
            confirm.count("createElement('button')"), 2,
            "BY VALUE: exactly two controls stand in the confirm — no third "
            "way she never ruled, and neither of hers missing")

        # ⛔⛔ THE ANNOUNCEMENT NEVER RIDES A REFUSED DELETION.
        self.assertNotIn(
            "HER_MEMORY_GONE", failure_arm,
            "⛔ A ROOM THAT SAYS THE LINE IS GONE AFTER THE STORE REFUSED "
            "THE DELETION repudiates her — and because this sentence is "
            "spoken and never drawn, the only person it lies to is the one "
            "who cannot see that the row is still there")
        self.assertLess(
            success_arm.index("if (!res.ok)"),
            success_arm.index("HER_MEMORY_GONE"),
            "...and it is said only AFTER the store's answer has been "
            "checked, never before it")

    # -- 49 -----------------------------------------------------------------

    def test_a_failed_strike_leaves_her_a_way_out(self):
        """⛔⛔ THE CASE THIS PLAN EXISTS FOR. This surface has NO UNDO — that
        is deliberate and its reasoning is recorded — so the confirm pair IS
        the whole protection: `remove` on one side, `keep it` on the other.
        The failure handler assigned over the slot's contents, which took
        `keep it` with it, and the only control left standing re-issued the
        deletion. She was inside a destructive gesture she had not completed,
        with no way back except leaving the page.

        ⚠ DRIVEN RED AGAINST THE PRE-CHANGE BYTES: the failed slot held ONE
        control labelled `try saving again`, her decline was gone, and her
        consequence line had gone with it —

            AssertionError: 1 != 2 : BY VALUE: TWO controls stand in the
            failed slot — the retry and HER WAY OUT. The shipped failure
            assigned over the slot and left one.

        ⛔ THE ASSERTION IS ON THE DOM THE GESTURE LEFT, NOT ON THE SOURCE.
        A check that the failure closure mentions `HER_MEMORY_DECLINE` would
        restate the edit and would pass for a control that was built and then
        overwritten one line later."""
        out = self.drive_the_strike(
            [{"text": "the ferry was late", "about": "the ferry"},
             {"text": "i walked instead", "about": "the ferry"}])

        # The ordinary confirm first — the baseline the failure must not fall
        # below. Without this an empty slot would satisfy nothing and prove
        # nothing.
        self.assertEqual(
            out["opened"]["controls"], 2,
            "BY VALUE: the confirm opens as a PAIR")
        self.assertEqual(out["opened"]["labels"], [HER_PROCEED, HER_DECLINE],
                         "and the pair is hers, in her order")
        self.assertEqual(out["proceed_controls"], 1,
                         "BY VALUE: exactly one way forward was pressed")

        # ...and the store refused it.
        self.assertEqual(out["posts_at_failure"], 1,
                         "BY VALUE: one strike was attempted")
        self.assertEqual(
            out["failed"]["controls"], 2,
            "BY VALUE: TWO controls stand in the failed slot — the retry and "
            "HER WAY OUT. The shipped failure assigned over the slot and "
            "left one.")
        self.assertIn(
            HER_DECLINE, out["failed"]["labels"],
            "⛔ HER WORD FOR THE WAY OUT SURVIVES THE FAILURE. On a surface "
            "with no undo this control is the entire protection, and losing "
            "it mid-gesture is losing the protection")
        self.assertEqual(
            out["failed"]["labels"], [SHIPPED_RETRY_LABEL, HER_DECLINE],
            "the retry stands where `remove` stood and her decline is "
            "untouched beside it — one way on, one way out, never two ways "
            "to do the thing she has not agreed to")

        # ⛔ THE FAILURE IS STILL LOUD. A judgment is never dropped silently;
        # that asymmetry with the silent failed READ is the shipped rule.
        self.assertIn(SHIPPED_FAILURE_LINE, out["failed"]["texts"],
                      "the failure says so, in the sentence already shipped")
        self.assertIn(HER_CONFIRM_LINE, out["failed"]["texts"],
                      "and her consequence line is still above the pair — "
                      "the slot was ADDED TO, not rebuilt")

        # ⛔ THE ROW DOES NOT LEAVE UNTIL THE STORE HAS CONFIRMED.
        self.assertEqual(out["rows_after"], 2,
                         "BY VALUE: both rows are still on screen")
        self.assertEqual(out["strikes_after"], 2,
                         "BY VALUE: and both are still strikeable")
        self.assertEqual(
            out["said_at_failure"], "",
            "⛔ AND THE ROOM NEVER SAYS THE LINE IS GONE OVER A DELETION THE "
            "STORE REFUSED")
        self.assertEqual(out["reads_at_failure"], 0,
                         "BY VALUE: no re-read rides a refused strike")

        # ⛔ FOCUS LANDS ON HER WAY OUT. She pressed `remove`; that control is
        # no longer in the slot, so focus would otherwise fall to the page.
        # Landing it on the retry would put the destructive action under the
        # next keypress, which on a no-undo surface is a choice and not a
        # neutral default.
        self.assertEqual(
            out["failed_focus"], HER_DECLINE,
            "focus lands on the control that backs out, never on the one "
            "that repeats the deletion")

    # -- 50 -----------------------------------------------------------------

    def test_declining_from_the_failed_state_leaves_the_store_untouched(self):
        """Taking the way out of a FAILED confirm must land exactly where
        taking it out of an ordinary confirm lands: the confirm closes and
        the store, the row and the surface are untouched.

        ⛔ ASSERTED AGAINST THE STORE, NOT THE RENDER. The harness's `apiPost`
        is a stub, so "nothing changed" would be true of every possible tree
        if the check stopped at the DOM. Every call the gesture really made is
        REPLAYED at the live server afterwards — so a decline that quietly
        issued a strike would delete her sentence for real, and the count
        taken off disk is what catches it."""
        self.seed_sentences("the ferry was late", "i walked instead")
        self.assertEqual(len(self.on_disk()), 2, "seeded, by value")

        out = self.drive_the_strike(
            [{"text": "i walked instead", "about": "the ferry"},
             {"text": "the ferry was late", "about": "the ferry"}],
            after="decline")

        self.assertEqual(
            out["decline_controls"], 1,
            "⛔ THERE IS SOMETHING TO TAKE. Before this plan there was not: "
            "the failure had assigned over her decline")
        self.assertEqual(out["after"]["slot"]["controls"], 0,
                         "BY VALUE: the confirm closed")
        self.assertEqual(out["after"]["slot"]["nodes"], 0,
                         "BY VALUE: and left nothing behind in the slot")
        self.assertEqual(
            out["after"]["posts"], 1,
            "BY VALUE: the decline issued NO request of its own — the one "
            "post is the failed strike that opened this state")
        self.assertEqual(out["rows_after"], 2,
                         "BY VALUE: her rows are all still on screen")

        # ⛔ EVERY REQUEST THE GESTURE MADE AFTER THE FAILURE, REPLAYED FOR
        # REAL. There must be none.
        self.replay(out["posts"][1:])
        after = [s["text"] for s in self.on_disk()]
        self.assertEqual(
            len(after), 2,
            "⛔ THE STORE IS UNTOUCHED — both sentences are still on disk")
        self.assertIn("i walked instead", after,
                      "including the one she had half-struck")

    # -- 51 -----------------------------------------------------------------

    def test_the_retry_re_issues_exactly_one_change_and_nothing_else(self):
        """The retry must re-send the SAME single change — not two, not a
        different one, and not a second control sitting beside `remove` that
        submits it again.

        ⛔ THE COUNT IS THE ASSERTION. `exactly one further request` cannot be
        read off the source; it is read off what the driven gesture sent."""
        self.seed_sentences("the ferry was late", "i walked instead")

        out = self.drive_the_strike(
            [{"text": "i walked instead", "about": "the ferry"},
             {"text": "the ferry was late", "about": "the ferry"}],
            after="retry")

        self.assertEqual(out["retry_controls"], 1,
                         "BY VALUE: ONE retry, never one per failure")
        self.assertEqual(
            out["after"]["posts"], 2,
            "BY VALUE: exactly ONE further request — 1 failed strike + 1 "
            "retry")
        self.assertEqual(
            out["posts"][1], out["posts"][0],
            "...and it is THE SAME single change: same route, same sentence")
        self.assertEqual(
            out["after"]["slot"]["controls"], 2,
            "BY VALUE: a second failure stacks nothing — still the retry and "
            "her way out")
        self.assertEqual(out["after"]["slot"]["labels"],
                         [SHIPPED_RETRY_LABEL, HER_DECLINE],
                         "and her way out is still hers, still second")
        self.assertEqual(
            out["after"]["slot"]["texts"].count(SHIPPED_FAILURE_LINE), 1,
            "BY VALUE: ONE error line, not one per attempt")

        # ⛔ AND THE ONE CHANGE IT RE-ISSUED IS THE ONE SHE ASKED FOR —
        # replayed at the live server, then counted off disk.
        self.replay(out["posts"][1:])
        after = [s["text"] for s in self.on_disk()]
        self.assertEqual(len(after), 1,
                         "BY VALUE: the retry removed exactly one sentence")
        self.assertEqual(after, ["the ferry was late"],
                         "...and it removed HERS, the one she struck")

    # -- 52 -----------------------------------------------------------------

    def test_a_second_confirm_closes_a_first_that_has_failed(self):
        """Only ONE confirm may stand open — the shipped disarm posture. The
        failed state is a confirm too, and nothing drove that before this
        plan: a failed slot that survived a second opening would leave two
        deletions half-made on screen at once, each with its own retry.

        ⚠ BOTH ORDERINGS ARE DRIVEN, and that is not symmetry for its own
        sake: a failed confirm carries MORE nodes than a fresh one, so a
        disarm that cleared only what it recognised would miss it — and
        whether the failed one sits above or below the one she opens next
        decides which way the sweep walks past it.

        ⚠ HONESTLY REPORTED, AND MEASURED RATHER THAN REASONED: the DISARM
        HALF was already true of the pre-change bytes. Driven against them,
        both orderings reported `failed slot nodes: 0` after the second
        confirm opened — the shipped sweep assigns over every open slot and
        so always closed a failed one too. What was red pre-change is this
        case's PRECONDITION (`failed slot controls: 1`, her way out already
        gone), which is the defect the plan fixes. So this arm is a PIN, not
        a fix: nothing drove the disarm over a failed slot before, and this
        plan is exactly the kind of edit — the failed slot grows new children
        — that could have broken it silently."""
        orderings = 0
        for target, nxt in ((0, 1), (1, 0)):
            out = self.drive_the_strike(
                [{"text": "the ferry was late", "about": "the ferry"},
                 {"text": "i walked instead", "about": "the ferry"}],
                after="second", target=target, nxt=nxt)

            self.assertEqual(out["second_available"], 2,
                             "BY VALUE: there is another row to open")
            self.assertEqual(out["failed"]["controls"], 2,
                             "BY VALUE: the first confirm really did FAIL "
                             "before the second was opened")
            self.assertEqual(out["after"]["open_slots"], 2,
                             "BY VALUE: two slots exist — the question is "
                             "what is IN them")
            self.assertEqual(
                out["after"]["failed_slot"]["nodes"], 0,
                "⛔ THE FAILED CONFIRM IS CLOSED — its error line, its retry "
                "and its pair are all gone. Two half-made deletions may "
                "never stand open at once, each with its own retry")
            self.assertEqual(
                out["after"]["fresh_slot"]["labels"],
                [HER_PROCEED, HER_DECLINE],
                "...and the one she just opened is an ordinary pair, in her "
                "words")
            self.assertEqual(
                out["after"]["fresh_slot"]["controls"], 2,
                "BY VALUE: two controls, never a third way she never ruled")
            orderings += 1

        self.assertEqual(
            orderings, 2,
            "BY VALUE: BOTH orderings ran — a loop that silently iterated "
            "over nothing is this repo's recorded failure mode")

    # -- 53 -----------------------------------------------------------------

    def test_a_failure_on_the_last_sentence_leaves_it_on_screen(self):
        """SRM-13's empty edge. A failed strike on the ONLY remaining sentence
        must leave that sentence exactly where it is — the surface never shows
        a deletion the store refused, and it must not fall through to the
        empty state, which would tell her the memory is gone when it is not.

        ⚠ THE EMPTY STATE IS HER SENTENCE AND IT IS THE WRONG ONE HERE. It is
        indistinguishable from a genuinely empty memory, deliberately, which
        is exactly why it must never appear over a refusal."""
        out = self.drive_the_strike(
            [{"text": "the ferry was late", "about": "the ferry"}])

        self.assertEqual(out["rows_before"], 1, "BY VALUE: one row to begin")
        self.assertEqual(
            out["rows_after"], 1,
            "BY VALUE: her last sentence is still on screen after the store "
            "refused to delete it")
        self.assertEqual(out["strikes_after"], 1,
                         "BY VALUE: and it is still strikeable")
        self.assertEqual(out["strike_labels_after"], [HER_STRIKE_LABEL],
                         "...under her own word for it")
        self.assertEqual(
            out["failed"]["controls"], 2,
            "BY VALUE: and her way out is there on the last row too")
        self.assertNotIn(
            HER_EMPTY_STATE, out["texts_after"],
            "⛔ NO EMPTY STATE OVER A REFUSED DELETION — asserted across the "
            "WHOLE surface, not just the confirm slot, because the empty "
            "state is built beside the rows and not inside one")



# ---------------------------------------------------------------------------
# ---- the source-mutation drill --------------------------------------------
#
# ⚠ THIS REPO'S RECORDED FAILURE MODE IS A DRILL REPORTING "8 of 8 caught"
# FROM AN INSTRUMENT THAT HAD SILENTLY MATCHED NOTHING. So: every mutant's
# search text is asserted PRESENT before the edit (a mutant that matched
# nothing raises rather than passing quietly), every mutant is asserted to
# still COMPILE (so no kill is a syntax error wearing a catch's clothes), the
# copies are REAL FILES and never a symlinked tests/ (a symlinked tests dir
# makes every mutant run against the unmutated module — recorded on 26.995-04),
# and the KNOWN-NEGATIVES are run alongside, which must SURVIVE. ⚠ THE
# COUNT IS NOT WRITTEN HERE ON PURPOSE: this line said TWO while three
# were declared, and a count in a comment is the one kind of claim in
# this file that nothing can drive red. `run_drill` reports the real
# numbers and `main` compares against them.
# ---------------------------------------------------------------------------

# ⛔ `app.js` IS IN THIS LIST AND IT IS NOT DECORATION. 26.995-12 found that
# removing a label from the server left the BROWSER half unguarded, and
# putting it back still passed all 38 Python suites — not one of them opens
# the view she actually reads on. This surface IS a view: her empty-state
# sentence, the marker that keeps the room's prose from being mistaken for
# hers, and the absence of any add-or-edit control all live in app.js and
# nowhere else. Without the file in the mutant tree, every browser-side
# assertion below would read the PRISTINE repo copy while the drill reported
# its mutants "caught" by unrelated server cases — a green that means nothing.
_COPIED = ("study_lib.py", "server.py", "librarian_call.py", "app.js")

MUTANTS = (
    # ⛔ THE MUTANT THIS WHOLE PLAN EXISTS FOR: the call moved one step later,
    # after the unlink. Nothing else about it changes and it compiles cleanly.
    ("M1 the writer is called AFTER the session file is unlinked",
     "server.py",
     '        if outcome == "pass":\n'
     "            _keep_her_sentences(library_root, session_doc)\n"
     "        # ④ discard the session file — the session is complete; the "
     "next\n"
     "        # candle tap begins a fresh one (and a re-close finds no "
     "session).\n"
     "        with _SESSION_LOCK:\n"
     "            try:\n"
     "                study_lib.session_file_path(library_root).unlink()\n"
     "            except OSError:\n"
     "                pass\n",
     "        with _SESSION_LOCK:\n"
     "            try:\n"
     "                study_lib.session_file_path(library_root).unlink()\n"
     "            except OSError:\n"
     "                pass\n"
     '        if outcome == "pass":\n'
     "            _keep_her_sentences(library_root, session_doc)\n"),
    ("M2 the passed-only guard is dropped, so a save writes too",
     "server.py",
     'if outcome == "pass":\n            _keep_her_sentences',
     'if outcome in ("pass", "save"):\n            _keep_her_sentences'),
    ("M3 an empty sitting writes an entry anyway",
     "server.py",
     "        if not texts:\n            return",
     "        if not texts:\n            texts = ['']"),
    ("M4 a category is filed beside her sentence",
     "server.py",
     '{"text": text, "about": about, "ms": ms}',
     '{"text": text, "about": about, "ms": ms,\n'
     '                 "kind": "judgement"}'),
    ("M5 the anchor takes the OLDEST unstamped record",
     "server.py",
     "    for rec in reversed(entries):\n"
     "        if isinstance(rec, dict) and rec.get(\"outcome\") is None:",
     "    for rec in entries:\n"
     "        if isinstance(rec, dict) and rec.get(\"outcome\") is None:"),
    ("M11 the writer stops swallowing, so a hiccup fails her sitting",
     "server.py",
     "    except Exception:\n        pass    # a memory is never a gate",
     "    except Exception:\n        raise   # a memory is never a gate"),
    ("M6 the reader sorts on the stamp, reversing an equal-ms pair",
     "study_lib.py",
     '    for rec in reversed(load_her_sentences(library_root)["sentences"]):',
     '    for rec in sorted(\n'
     '            [r for r in load_her_sentences(library_root)["sentences"]\n'
     '             if isinstance(r, dict)],\n'
     '            key=lambda r: -int(r.get("ms") or 0)):'),
    ("M7 the cap drops the NEWEST instead of the oldest",
     "study_lib.py",
     "list(entries)[-HER_SENTENCES_CAP:]",
     "list(entries)[:HER_SENTENCES_CAP]"),
    ("M8 the loader raises on a damaged file instead of failing open",
     "study_lib.py",
     "    except (OSError, ValueError):\n"
     "        return {\"sentences\": []}",
     "    except (OSError,):\n"
     "        return {\"sentences\": []}"),
    ("M9 her file note is reworded by one clause",
     "study_lib.py",
     "them — nothing is sorted, labelled or scored. safe to",
     "them — nothing is sorted or scored. safe to"),
    ("M10 the reset copy is reordered to warn first",
     "study_lib.py",
     '    "this is the librarian\'s memory of you, in plain files\\n"\n'
     '    "you can read, change, or delete.\\n"\n'
     '    "deleting all of it is how you start it over.")',
     '    "deleting all of it is how you start it over.\\n"\n'
     '    "this is the librarian\'s memory of you, in plain files\\n"\n'
     '    "you can read, change, or delete.")'),
    # ---- 26.995-11: THE READ ------------------------------------------
    # ⛔ THE MUTANT THIS PLAN'S FENCE OBLIGATION EXISTS FOR (T-26.995-02):
    # the screen removed from her own sentences, which is precisely the
    # state the block shipped in at task 1 and which was OBSERVED letting a
    # fenced title through.
    ("M12 her sentences reach the block unscreened",
     "server.py",
     "            if not text or not _clean(text, about):\n"
     "                continue",
     "            if not text:\n"
     "                continue"),
    ("M13 an unresolvable fenced list fails OPEN instead of closed",
     "server.py",
     "    if fenced_titles is None:\n        return None\n\n    def _clean",
     "    if fenced_titles is None:\n        fenced_titles = []\n\n"
     "    def _clean"),
    ("M14 the memory key is emitted EMPTY instead of omitted",
     "server.py",
     '    if memory is not None:\n        doc["memory"] = memory',
     '    doc["memory"] = memory or {}'),
    ("M15 the evidence floor is lowered until it always fires",
     "server.py",
     "HER_MEMORY_FLOOR = 2", "HER_MEMORY_FLOOR = 0"),
    ("M16 the drop order cuts HER SENTENCES first",
     "server.py",
     "        if essays:\n"
     "            essays.pop()\n"
     "        elif landed:\n"
     "            landed.pop()\n"
     "        elif hers:\n"
     "            hers.pop()",
     "        if hers:\n"
     "            hers.pop()\n"
     "        elif landed:\n"
     "            landed.pop()\n"
     "        elif essays:\n"
     "            essays.pop()"),
    ("M17 a landed bit loses the room-wrote-this marker",
     "server.py",
     '            landed.append({"title": title, "kept": kept,\n'
     '                           "room_wrote_this": True})',
     '            landed.append({"title": title, "kept": kept})'),
    ("M18 group (3) admits a PASSED reflection's text",
     "server.py",
     '            if str(it.get("title") or "").strip() in kept_titles:\n'
     "                rows.append(it)",
     "            rows.append(it)"),
    ("M19 the memory key is placed AHEAD of the pool",
     "server.py",
     '    doc = {"pool": pool}\n'
     "    if evening is not None:\n"
     '        doc["evening"] = evening\n'
     "    if memory is not None:\n"
     '        doc["memory"] = memory',
     "    doc = {}\n"
     "    if memory is not None:\n"
     '        doc["memory"] = memory\n'
     '    doc["pool"] = pool\n'
     "    if evening is not None:\n"
     '        doc["evening"] = evening'),
    ("M20 a category is attached to her sentence on the way IN",
     "server.py",
     '            hers.append({"text": text, "about": about})',
     '            hers.append({"text": text, "about": about,\n'
     '                         "kind": "judgement"})'),
    # ---- 26.995-13: THE SURFACE AND THE STRIKE -------------------------
    # ⛔ M21 IS THE REPUDIATION MUTANT (T-26.995-31) AND THE REASON THIS
    # PLAN'S CHECK IS WRITTEN AGAINST THE STORE. The route still answers
    # {ok} and the view still stops showing the line — every rendered
    # assertion in the world passes — and her sentence is still on disk.
    ("M21 the strike answers ok and writes nothing",
     "server.py",
     "                if len(kept) != len(entries):\n"
     "                    study_lib.save_her_sentences(root, kept)",
     "                if len(kept) != len(entries):\n"
     "                    pass"),
    ("M22 the strike stops failing closed, so a blank ask is honoured",
     "server.py",
     '        if not isinstance(text, str) or not text.strip():\n'
     '            return self.json_error(\n'
     '                400, "the strike needs the sentence it is about.")',
     '        if not isinstance(text, str):\n'
     '            return self.json_error(\n'
     '                400, "the strike needs the sentence it is about.")'),
    # ⛔ OD-2: the surface pays the PROMPT's cost cap, so every sentence past
    # the newest handful silently becomes unstrikeable from inside the room.
    ("M23 the display is capped to the prompt's newest handful",
     "server.py",
     "    if not for_display:\n"
     "        hers = hers[:HER_MEMORY_SENTENCES]",
     "    if True:\n"
     "        hers = hers[:HER_MEMORY_SENTENCES]"),
    ("M24 the stamp reaches the wire, where a render can date it",
     "server.py",
     '                {"text": row.get("text") or "",\n'
     '                 "about": row.get("about") or "",',
     '                {"text": row.get("text") or "",\n'
     '                 "ms": row.get("ms") or 0,\n'
     '                 "about": row.get("about") or "",'),
    ("M25 the kept-and-passed rows become strikeable",
     "server.py",
     '                {"title": row.get("title") or "",\n'
     '                 "kept": row.get("kept") is True,\n'
     '                 "room_wrote_this": True}',
     '                {"title": row.get("title") or "",\n'
     '                 "kept": row.get("kept") is True,\n'
     '                 "strikeable": True,\n'
     '                 "room_wrote_this": True}'),
    # ⛔ M26: the new read path stops resolving the fenced list — the exact
    # shape of the hole 26.995-11 closed, re-opened on a second door.
    ("M26 the surface reads her material with the fence unresolved",
     "server.py",
     "            block = _reflection_her_memory(root, snapshot,\n"
     "                                           _fenced_titles(snapshot),\n"
     "                                           for_display=True)",
     "            block = _reflection_her_memory(root, snapshot, [],\n"
     "                                           for_display=True)"),
    ("M27 a merged row loses the room-wrote-this marker",
     "server.py",
     '                {"title": row.get("title") or "",\n'
     '                 "kept": row.get("kept") is True,\n'
     '                 "room_wrote_this": True}',
     '                {"title": row.get("title") or "",\n'
     '                 "kept": row.get("kept") is True,\n'
     '                 "room_wrote_this": False}'),
    # ---- THE BROWSER HALF — the half no Python suite had ever opened ----
    ("M28 the marker is reworded to a stance she did not pick",
     "app.js",
     "var HER_MEMORY_MARKER = 'written by the librarian';",
     "var HER_MEMORY_MARKER = 'from the librarian';"),
    ("M29 her empty state's line break is flattened to a space",
     "app.js",
     "    'this is where what the librarian comes to know about you "
     "will go.\\n' +\n    'nothing in it yet.';",
     "    'this is where what the librarian comes to know about you "
     "will go. ' +\n    'nothing in it yet.';"),
    ("M30 an add-a-line control appears on the surface",
     "app.js",
     "      if (!hers.length && !landed.length) {",
     "      if (!hers.length && !landed.length) {\n"
     "        list.appendChild(document.createElement('input'));"),
    # ⚠ M31 AND M33 ARE THE SAME TRAP FROM OPPOSITE ENDS, which is why
    # neither is enough on its own. The page's name is typed TWICE — the
    # heading here, the settings-list entry in M33 — and each mutant moves
    # exactly ONE of them, so a rename that reached only one site cannot pass
    # as a rename. This is 26.96 OD-1's own build note, made drivable.
    ("M31 the HEADING is reworded and the settings list is left behind",
     "app.js",
     "var HER_MEMORY_HEADING = 'the librarian\\'s memory of you';",
     "var HER_MEMORY_HEADING = 'what the librarian knows about you';"),
    ("M33 the SETTINGS-LIST ENTRY is reworded and the heading is left behind",
     "app.js",
     "{ key: 'memory', label: 'the librarian\\'s memory of you',",
     "{ key: 'memory', label: 'the librarian\\'s memory',"),
    # ⛔ M34 IS THE OTHER HALF OF OD-1 AND IT IS NOT DECORATION. Her two
    # adopted lines are tier 2 — an agent's wording SHE picked — and the
    # failure they invite is an agent "tightening" one of them back toward
    # something an agent prefers. This plants exactly that edit.
    ("M34 one of her two adopted lines is tightened by an agent",
     "app.js",
     "'Your own sentences — shown in full, with a remove this line control '",
     "'Your sentences, in full, each with a remove control '"),
    # ⛔⛔ M32 IS THE REPUDIATION MUTANT'S TWIN, and it re-introduces the exact
    # defect a green suite shipped: the prompt's evidence floor applied to the
    # DISPLAY, so her last sentence goes silent the moment she strikes beside
    # it. M23 pins the CAP's exemption; this pins the FLOOR's. Both halves of
    # one ruling, so neither can drift back alone.
    ("M32 the display pays the prompt's evidence floor",
     "server.py",
     "    if not for_display:\n"
     "        hers = hers[:HER_MEMORY_SENTENCES]\n"
     "        if len(hers) < HER_MEMORY_FLOOR:\n"
     "            return None",
     "    if not for_display:\n"
     "        hers = hers[:HER_MEMORY_SENTENCES]\n"
     "    if len(hers) < HER_MEMORY_FLOOR:\n"
     "        return None"),
    # ⛔⛔ M35-M39 — ONE MUTANT PER SENTENCE SHE RULED ON THE STRIKE, plus the
    # move. Until 26.995-18 all four of these strings were declared at the top
    # of this file and asserted NOWHERE (`26.995-VERIFICATION.md` gap 3), so
    # every one of these five edits shipped GREEN. They are what proves case
    # 47 is an instrument rather than a docstring.
    #
    # ⚠ THE REWORDINGS ARE DELIBERATELY PLAUSIBLE — each is the tidier,
    # more conventional phrasing an agent reaches for, which is exactly the
    # edit her words need protecting from. ⛔ They exist ONLY inside a mutant
    # tree; the shipped file keeps hers.
    ("M35 her confirm sentence is tidied into product English",
     "app.js",
     "  var HER_MEMORY_CONFIRM_LINE = 'this one does not come back.';",
     "  var HER_MEMORY_CONFIRM_LINE = 'This action cannot be undone.';"),
    ("M36 her proceed control is relabelled", "app.js",
     "  var HER_MEMORY_PROCEED = 'remove';",
     "  var HER_MEMORY_PROCEED = 'delete';"),
    # ⛔ M37 IS THE HALF THAT MATTERS MOST OF THE PAIR. `keep it` is the way
    # OUT of a gesture with no undo; a confirm whose escape is relabelled is
    # the one she is most likely to mis-tap under.
    ("M37 her decline control is relabelled", "app.js",
     "  var HER_MEMORY_DECLINE = 'keep it';",
     "  var HER_MEMORY_DECLINE = 'cancel';"),
    ("M38 the spoken announcement is reworded", "app.js",
     "  var HER_MEMORY_GONE = 'that line is gone.';",
     "  var HER_MEMORY_GONE = 'Removed.';"),
    # ⛔⛔ M39 IS THE REPUDIATION MUTANT OF THIS SURFACE, and it is a MOVE
    # rather than a reword: the announcement leaves the arm taken when the
    # store confirmed and lands in the arm taken when the store REFUSED. The
    # room then tells her the line is gone while it is still on disk — and
    # because OC-8 is spoken and never drawn, the only person it lies to is
    # the one who cannot see that the row is still there.
    ("M39 the gone line moves from the success arm to the failure arm",
     "app.js",
     "            apiPost('/api/librarian/what-it-knows/strike',\n"
     "              { text: row.text || '' }).then(function (res) {\n"
     "              if (!res.ok) { failed(); return; }\n"
     "              read(function () { said.textContent = HER_MEMORY_GONE; "
     "});\n"
     "            }).catch(failed);\n"
     "\n"
     "            function failed() {",
     "            apiPost('/api/librarian/what-it-knows/strike',\n"
     "              { text: row.text || '' }).then(function (res) {\n"
     "              if (!res.ok) { failed(); return; }\n"
     "              read(null);\n"
     "            }).catch(failed);\n"
     "\n"
     "            function failed() {\n"
     "              said.textContent = HER_MEMORY_GONE;"),
    # ⛔⛔ M40-M42 — THE THREE WAYS THIS SURFACE BETRAYS HER, PUT BACK. All
    # three are Repudiation and all three are about the same thing: what the
    # room SHOWS her after the store has answered. Until 26.995-23 the first
    # of them was not a mutant at all — it was the shipped code.
    #
    # ⚠ NOTE WHICH CASE KILLS WHICH, because that is the part a docstring
    # cannot fake: M40 dies on the failed slot's CONTROL COUNT, M41 on the
    # count of strike controls still on screen, M42 on the failed slot's
    # LABELS. Three different numbers from three different arms — if all
    # three died on one assertion, one arm would be doing all the work and
    # the other two would be decoration.
    ("M40 the failure assigns over the confirm slot again "
     "— the shipped defect, exactly",
     "app.js",
     "              if (!failLine) {",
     "              confirmSlot.innerHTML = '';\n"
     "              if (!failLine) {"),
    # ⛔ M41 IS THE ONE THE SHIPPED CODE ALREADY GOT RIGHT, and it is here
    # because a plan that rewrites a failure path is exactly where an
    # optimistic removal gets introduced by accident. The row leaves BEFORE
    # the store has answered — a deletion the room showed her and may never
    # have performed.
    ("M41 the row is removed optimistically, before the store confirms",
     "app.js",
     "            apiPost('/api/librarian/what-it-knows/strike',",
     "            wrap.innerHTML = '';\n"
     "            apiPost('/api/librarian/what-it-knows/strike',"),
    # ⛔ M42 DROPS THE JUDGMENT SILENTLY. The failed READ is silent on
    # purpose and is indistinguishable from a genuinely empty memory; the
    # failed STRIKE is LOUD. That asymmetry is the shipped rule, and this is
    # the edit that "harmonises" the two and loses her deletion without
    # saying so.
    ("M42 the failed strike is made silent", "app.js",
     "              if (!res.ok) { failed(); return; }\n"
     "              read(function () { said.textContent = HER_MEMORY_GONE; "
     "});",
     "              if (!res.ok) { return; }\n"
     "              read(function () { said.textContent = HER_MEMORY_GONE; "
     "});"),
)

# The edits that must NOT be caught — four of them as of 26.995-18, and
# the number lives in `len(KNOWN_NEGATIVES)` rather than in this
# sentence, which claimed TWO while three were declared.
# A drill that reddens for everything
# measures nothing, and this repo has shipped exactly that instrument before.
KNOWN_NEGATIVES = (
    ("N1 a comment is reworded", "study_lib.py",
     "# ---- her sentences from the sittings she passed on",
     "# ---- her own sentences, from the sittings she passed on"),
    ("N2 a blank line is added", "study_lib.py",
     "HER_SENTENCES_CAP = 60", "HER_SENTENCES_CAP = 60\n"),
    # ⚠ N3 GUARDS THE NEW CHANNEL IN THE OTHER DIRECTION. M28-M31 prove the
    # app.js mutants can be CAUGHT; this proves the browser checks are not
    # simply red for any edit to that file — which is the failure mode a
    # newly-added source channel actually has.
    ("N3 an app.js comment is reworded", "app.js",
     "  // ---- the librarian's memory of you (26.995-13; C-3/C-5/C-7,",
     "  // ---- the librarian's memory of you — the surface (26.995-13),"),
    # ⚠ N4 IS THE ARM THAT SHOULD FAIL FOR 26.995-18's FIVE. M35-M39 all land
    # on the strike's confirm; if the checks added with them were red for ANY
    # edit to that block they would be measuring the harness and not the
    # words, and five clean catches would prove nothing. So this moves a
    # margin ON THE CONFIRM'S OWN PARAGRAPH — genuinely cosmetic, genuinely
    # unpinned, and it MUST SURVIVE. ⛔ If it ever starts being caught, the
    # thing to suspect is the new instrument, not the mutant.
    ("N4 a margin on the confirm's own line is nudged", "app.js",
     "            'color:var(--never);font-size:14px;margin:8px 0 0');",
     "            'color:var(--never);font-size:14px;margin:12px 0 0');"),
    # ⚠ N5 IS THE ARM THAT SHOULD FAIL FOR 26.995-23's THREE, and it does for
    # M40-M42 what N4 does for M35-M39. All three of those mutants land on
    # the failure closure, and the arms added with them read that closure's
    # OUTPUT by counting nodes — an instrument that reddened for ANY edit
    # there would score three clean catches while measuring nothing. So this
    # reorders the retry's own class list, on the very control those arms
    # find each other by. It is genuinely cosmetic (`byClass` splits on
    # spaces and asks for membership, never for order or for the whole
    # attribute) and it MUST SURVIVE. ⛔ If it ever starts being caught, the
    # thing to suspect is the new instrument, not the mutant.
    ("N5 the retry's class list is reordered", "app.js",
     "                again.className = 'btn her-memory-retry';",
     "                again.className = 'her-memory-retry btn';"),
)


def _build_tree(dest):
    """Real file copies — never a symlinked tests/."""
    os.makedirs(os.path.join(dest, "tests"), exist_ok=True)
    for name in _COPIED:
        shutil.copy2(str(_REPO_ROOT / name), os.path.join(dest, name))
    shutil.copy2(__file__,
                 os.path.join(dest, "tests", os.path.basename(__file__)))
    # test_stage_public is imported by case 17; copy it and the module it
    # imports so the mutant run is not red for an unrelated reason.
    for name in ("test_stage_public.py",):
        src = _REPO_ROOT / "tests" / name
        if src.exists():
            shutil.copy2(str(src), os.path.join(dest, "tests", name))
    # ⚠ `adapters/` IS LOAD-BEARING AND ITS ABSENCE COST A WHOLE FALSE SCORE.
    # server.py imports it at module scope, so without it EVERY mutant tree
    # died at import and the drill reported "11/11 caught" from runs that had
    # never reached a single case. The known-negatives are what exposed it —
    # they went red too, which is the only reason the number was not believed.
    for name in ("tools", "adapters"):
        src = _REPO_ROOT / name
        if src.is_dir():
            shutil.copytree(str(src), os.path.join(dest, name),
                            dirs_exist_ok=True)


def _run_suite(tree):
    env = dict(os.environ)
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    proc = subprocess.run(
        [sys.executable, "-m", "unittest",
         "tests." + os.path.basename(__file__)[:-3]],
        cwd=tree, env=env, capture_output=True, text=True)
    return proc.returncode


def _apply(tree, filename, find, replace):
    path = os.path.join(tree, filename)
    with open(path, encoding="utf-8") as fh:
        src = fh.read()
    if src.count(find) < 1:
        raise AssertionError("MUTANT TEXT NOT FOUND in " + filename
                             + " — the drill would have measured nothing: "
                             + find[:60])
    mutated = src.replace(find, replace, 1)
    # ⛔⛔ A MUTANT THAT NEVER APPLIED READS EXACTLY LIKE A GATE THAT DOES NOT
    # HOLD. The `find`-is-present check above catches a search text that has
    # drifted; this catches the other half — a `find` and a `replace` that
    # are equal, or differ only where the first occurrence is not the one
    # meant — where the tree would be written back UNCHANGED and every
    # surviving mutant would be reported as a real miss.
    if mutated == src:
        raise AssertionError("MUTATION DID NOT CHANGE " + filename
                             + " — its verdict would have measured nothing: "
                             + find[:60])
    src = mutated
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src)
    # A syntax error is not a catch. ⚠ THE GUARD IS PYTHON-ONLY BY NECESSITY
    # — `compile()` cannot parse JavaScript and would raise on every app.js
    # mutant, which would abort the drill rather than score it. The risk that
    # leaves is in the SAFE direction and is stated rather than assumed: the
    # browser assertions read app.js as TEXT, so a mutant that broke its
    # syntax would still be scored on content and would tend to SURVIVE (a
    # reported miss, which is loud) rather than pass as a phantom catch.
    if filename.endswith(".py"):
        compile(src, path, "exec")


def _unmutated_baseline_rc():
    """⛔⛔ THE BASELINE, RUN AND ASSERTED BEFORE ANY SCORE IS READ.

    ⚠ THIS GUARD WAS CLAIMED BY 26.995-10'S SUMMARY AND WAS NOT IN THE CODE.
    The summary reported "the unmutated tree is now asserted to exit 0 before
    any score is read" and printed a `UNMUTATED TREE RC: 0` line; neither the
    assertion nor the print existed in `run_drill`. It is written here now,
    by 26.995-11, and the gap is recorded rather than quietly closed.

    It is the guard that matters most on this instrument, because the failure
    it catches is the one this phase already paid for: a drill reporting
    "11 of 11 mutants caught" from subprocess trees where NOT ONE TEST CASE
    HAD EXECUTED — a missing import path killed every tree at startup, and
    every crash read as a catch. An unmutated tree that does not exit 0 means
    every number below it is measuring the harness, not the code."""
    tree = tempfile.mkdtemp(prefix="her-sentences-baseline-")
    try:
        _build_tree(tree)
        return _run_suite(tree)
    finally:
        shutil.rmtree(tree, ignore_errors=True)


def run_drill():
    caught = 0
    survived_negatives = 0
    for name, filename, find, replace in MUTANTS:
        tree = tempfile.mkdtemp(prefix="her-sentences-drill-")
        try:
            _build_tree(tree)
            _apply(tree, filename, find, replace)
            if _run_suite(tree) != 0:
                caught += 1
            else:
                print("  DRILL MISS: " + name + " was not caught")
        finally:
            shutil.rmtree(tree, ignore_errors=True)
    for name, filename, find, replace in KNOWN_NEGATIVES:
        tree = tempfile.mkdtemp(prefix="her-sentences-negative-")
        try:
            _build_tree(tree)
            _apply(tree, filename, find, replace)
            if _run_suite(tree) == 0:
                survived_negatives += 1
            else:
                print("  DRILL KNOWN-NEGATIVE WENT RED: " + name
                      + " — the drill is reporting red for everything")
        finally:
            shutil.rmtree(tree, ignore_errors=True)
    return caught, len(MUTANTS), survived_negatives, len(KNOWN_NEGATIVES)


def main():
    suite = unittest.defaultTestLoader.loadTestsFromModule(
        sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    print("CASES %d (declared %d)" % (result.testsRun, EXPECTED_CASES))

    baseline_rc = _unmutated_baseline_rc()
    print("UNMUTATED TREE RC: %d (0 = the drill's baseline is sound)"
          % baseline_rc)
    caught, total, negatives_ok, negatives = run_drill()
    print("DRILL %d/%d mutants caught, %d/%d known-negatives survived"
          % (caught, total, negatives_ok, negatives))

    untouched = os.path.exists(REAL_ROOM_DIR) == REAL_ROOM_DIR_EXISTED
    if not untouched:
        print("REAL CONFIG DIRECTORY CHANGED — this suite must never do that")

    ok = (result.wasSuccessful()
          and result.testsRun == EXPECTED_CASES
          and baseline_rc == 0
          and caught == total
          and negatives_ok == negatives
          and untouched)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
