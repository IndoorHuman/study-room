#!/usr/bin/env python3
"""
The reflection-session flow suite (Phase 26.7, Plan 02 — SRM-11/RSF-06).

POST /api/librarian/session starts the candle session's generation job —
a presort-worker sibling — and GET /api/librarian/session reads the
session file back fail-open. This suite drives both against the hermetic
TRANSPORT seam imported from tests/test_server_smoke.py (26.93-07; it was
a fake `claude` program on PATH until 26.93-06 moved the jobs onto HTTP):
no network, no key, no cloud fill anywhere, never the live store — temp
dirs only, under a home directory this suite made itself.

Covered behaviors (26.7-02 Task 1):

  1. consent fail-closed  — a missing or non-bool consent is refused 400
                            with the plain-words consent line BEFORE
                            anything spawns (the presort precedent); the
                            job dict is untouched.
  2. origin gate          — the session POST rides the shared dispatch
                            behind origin_allowed (T-26.7-05): a foreign
                            Origin and the literal "null" Origin are both
                            refused 403; the room's own origin passes
                            through to the route.
  3. busy gate            — a second POST while the job runs answers
                            LIBRARIAN_BUSY_MSG; one job at a time (D-04's
                            one-session for free).
  4. D-10 empty pool      — with the marker newer than everything, the
                            answer carries nothing_new true + held, NO
                            subprocess spawns (the stub's log file is
                            never written), and last_reflection_ms is
                            unchanged.
  5. staged labels + the atomic session file — the worker walks
                            "gathering what's new…" → "reading…" →
                            "writing…" on LIBRARIAN_JOB, and success
                            persists {state, consented, pool, draft,
                            name, coda, chat, created_ms} atomically
                            to librarian/session.json (no torn temp
                            files); GET hands the draft back.
  6. fail-visible rejection — a schema-violating draft is counted
                            (rejected_drafts), regenerated AT MOST once,
                            and then lands state="error" with the one
                            static line; session.json holds no draft and
                            the store is byte-untouched.
  7. D-11 marker discipline — last_reflection_ms is READ for the pool and
                            stamped by NOTHING here: not by start, not by
                            a poll, not by a nothing-new answer, not by a
                            completed generation.
  8. meta validator       — last_reflection_ms roundtrips int/null on
                            /api/meta and refuses bool/float/string
                            fail-closed.
  9. read fail-open       — GET /api/librarian/session answers
                            {state: "none"} for a missing OR off-shape
                            file, never an error.

26.7-03 additions (the chat-refine turn engine, Task 1):

  10. refine consent gate — a refine POST with no session file, a
                            non-active file, or a file with NO recorded
                            consent answer is refused 400 with the
                            plain-words line (the D-04 per-turn check
                            reads the flag from session.json); a bad
                            body refuses first; nothing spawns.
  11. stdin doc shape     — the recorded refine stdin is pool-FIRST,
                            the pool byte-identical to the session
                            file's, the draft carried, the chat capped
                            to the last CHAT_TURN_CAP entries INCLUDING
                            the new user turn.
  12. idempotent turns    — a transport failure or a content rejection
                            leaves session.json byte-identical (the
                            turn consumes nothing; one call per turn,
                            zero regenerations) and the SAME turn
                            re-sent lands exactly once: user turn +
                            librarian reply + revised draft in ONE
                            atomic rewrite; GET hands the transcript
                            back.
  13. dismissed reject    — 26.995-06 (D-05): the librarian's own prose
                            returning to a dismissed topic REJECTS THE
                            WHOLE DRAFT (the strip is gone with the slot
                            it emptied), the second attempt runs, and the
                            reflection she already had stands
                            byte-identical. rejected_why fail-visible.
  14. CJK verbatim        — her exact characters ride the recorded
                            stdin, the persisted draft/coda, and the
                            session file's raw bytes
                            (ensure_ascii=False end to end).
  15. refine busy gate    — a second refine POST while a turn runs
                            answers LIBRARIAN_BUSY_MSG.

26.7-04 additions (the three-path close, Task 1):

  16. save = materialize→inject→promote — close {outcome:"save"} mints
                            ONE new store item (source "librarian",
                            title from the draft's first heading, body =
                            essay + the coda section), and books.json
                            gains one kind:"reflection" book whose id
                            resolves to the item; the item's shape
                            passes the shipped guard predicate (state
                            not never_show/retired, trigger false —
                            StudyCore.guardSurface returns None for
                            exactly this shape under empty filters).
  17. refresh never wipes — a GET /api/librarian/insights fired right
                            after save keeps the promoted book and never
                            re-proposes the shelved id (Pitfall 1
                            closed: inject + promote share one
                            _INSIGHTS_LOCK hold — pinned on the source).
  18. pass path           — close {outcome:"pass"} discards
                            session.json, shelves nothing, mints no
                            item, and stamps last_reflection_ms.
  19. completion-only stamp + refused re-close — both outcomes stamp
                            last_reflection_ms to a now-ms int; a
                            second close is a refused no-op (no double
                            stamp drift, no duplicate book — the RSF-06
                            idempotency edge), and a close with no
                            session at all is refused plain-words; a
                            bad outcome refuses first.
  20. close busy gate     — a close while a librarian job runs answers
                            LIBRARIAN_BUSY_MSG (a worker's atomic
                            session rewrite must never resurrect a
                            discarded session).
  21. one-lock-hold pin   — a source assertion: the close handler's
                            inject and promote sit inside exactly ONE
                            `with _INSIGHTS_LOCK:` block, the promote
                            docstring names its second validated
                            user-action caller, and _save_books keeps
                            exactly one call site (the only-writer
                            invariant, extended — never weakened).

26.7-05 additions (the D-03 offer state machine, Task 1):

  22. offer spent at render — a session-start beat (GET ?beat=start) on
                            a resumable file transitions held→offered
                            and persists ATOMICALLY before the answer;
                            crash-and-retap (a second start beat)
                            answers NO offer, and the following fresh
                            POST discards silently and proceeds — two
                            consecutive opens never both offer.
  23. resume round-trip   — intent "resume" answers the stored session
                            (pool, draft, coda, chat byte-identical) and
                            returns state to active; a repeat resume is
                            refused (no offer possible afterward).
  24. decline is final    — intent "discard" deletes the held file and
                            proceeds into the normal fresh beat (a new
                            generation replaces the old conversation for
                            good).
  25. nothing-new held discipline — held:true rides the nothing-new
                            answer only while an UNSPENT held draft
                            exists; a spent offer reads held:false and
                            its file is discarded by the fresh beat.
  26. intent fail-closed  — an unknown intent is refused 400 in plain
                            words; resume without a spent offer (no
                            file, or an unspent active file) is refused
                            with the no-session line, file untouched.
  27. render-order source pin — in the read handler, the offered
                            transition's atomic write precedes the
                            response (Pitfall 7: spent AT render).

26.93-07 addition (the money guard, and the drill over it):

  33. cannot spend her money — `money_guard_violations` states the five
                            facts that together keep this suite off the
                            owner's real Anthropic key (HOME swapped, the
                            keys file under that swapped home, the fake
                            transport installed, neither cloud key name in
                            the environment, every tier resolved to her own
                            machine). `run_drill` drives it over five
                            one-thing-wrong copies with two unmutated
                            controls in the same run, and `main()` asserts
                            all three totals BY VALUE plus that the real
                            config directory is exactly as it was found.

Stdlib only (unittest + threading + http.client + tempfile) — the
zero-dependency law. Every test builds its library inside a fresh
TemporaryDirectory, and every librarian call goes through the imported
seam's temp home.
"""
import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
# ⚠ tests/ joins sys.path so the ONE hermetic seam can be IMPORTED rather than
# re-spelled here — see the note under the imports.
if str(_REPO_ROOT / "tests") not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT / "tests"))

import server  # noqa: E402  — plain import binds no socket
import study_lib  # noqa: E402
import librarian_call as L  # noqa: E402  — the seam this suite now drives

# ---------------------------------------------------------------------------
# ⚠⚠ 26.93-07 — THE HERMETIC SEAM MOVED FROM PATH TO THE TRANSPORT, AND UNTIL
# THIS SUITE FOLLOWED IT, EVERY RUN SPENT THE OWNER'S MONEY.
#
# Until 26.93-06 every librarian job here was intercepted by a fake `claude`
# program prepended to PATH. Plan 26.93-06 moved seven jobs — `reflection` and
# `reflection_refine` among them — onto HTTP, which consults PATH for nothing
# at all. The stub therefore stopped intercepting anything while still LOOKING
# installed: with the real HOME let through, `librarian_call._credential` found
# the owner's real Anthropic key, `good-cloud` resolved to `claude-opus-5`, and
# a session plus its refine turns became real paid calls. The symptom this
# suite showed was `wait_session`'s "the session job never finished" — a real
# provider answering slowly, or not at all, where a canned string was expected.
#
# ⚠ THE SEAM IS IMPORTED, NOT RE-SPELLED. `tests/test_server_smoke.py`'s
# `fake_claude_env` does the four load-bearing things — swaps HOME to a fresh
# temp root so `key_present` answers False for both companies, pops both key
# names and all three fill names, installs the recording transport, and makes
# the retry sleep free — and runs `assert_under_temp_root` BEFORE anything is
# written. Its `stub_structured` reproduces the retired program's toggle
# priority chain exactly, so every FAKE_CLAUDE_* toggle this file already used
# still means what it meant. A second spelling of a MONEY guard is the worst
# drift this repo could carry, so this file keeps none.
#
# ⚠ ONE BEHAVIOUR IMPROVES RATHER THAN MATCHING: the imported seam saves and
# restores EVERY stub toggle, not only the ones a call site handed it. The
# mid-test `os.environ[...] = "1"` flips in the refine cases are rolled back by
# it either way — see `refine_env`'s note.
# ---------------------------------------------------------------------------
from test_server_smoke import (  # noqa: E402
    fake_claude_env, no_cached_probe, stub_transport)
# 26.995-03 task 5: the module itself, for `calls_seen()` — a call COUNT is
# the only thing that separates a loop which always retries from one which
# never does, and the counter lives with the seam that serves the calls.
import test_server_smoke as smoke  # noqa: E402
import librarian_call  # noqa: E402

# ⚠ CAPTURED AT IMPORT, BEFORE ANY CASE MOVES THE HOME DIRECTORY. This is how
# the suite proves afterwards that it neither created nor removed the real
# config directory, which holds a real credential. Checked in `main()`.
REAL_HOME = os.path.expanduser("~")
REAL_ROOM_DIR = os.path.join(REAL_HOME, study_lib.ROOM_CONFIG_DIR_NAME)
REAL_ROOM_DIR_EXISTED = os.path.exists(REAL_ROOM_DIR)

STAGE_LABELS = ("gathering what's new…", "reading…", "writing…")

# A schema-clean essay comfortably over the 400-char floor: no fenced
# titles, no no-push vocabulary, no clinical stems — plain loom talk.
GOOD_ESSAY = (
    "## the thread\n\n"
    "you wrote \"the loom finally clicked\" and, a page later, \"i kept "
    "the selvedge even\" — the same steady hand shows up in both notes, "
    "and the comments you left beside them read like margin marks in a "
    "working notebook: short, practical, sure of what the cloth wants "
    "next.\n\n"
    "the newer arrivals carry that thread forward. the border chart you "
    "saved sits right beside the note about edge tension, and your own "
    "comment ties them: \"the border is just the selvedge, grown up.\" "
    "that is the reading this pool asks for — one pattern learned "
    "closely, then trusted at a larger scale.\n\n"
    "Use: work one quiet row of the border tonight and let that be "
    "enough."
)

# ⛔ 26.995-06 task 2 (D-05): GOOD_QUESTION stood here and is gone with
# the field it fed. A question the librarian wants to ask now lives inside
# the essay, so there is no separate string for a stub to answer with.

# 26.995-12 (D-13): THE WEAVING, which is the whole reason the labelled
# footer could be deleted rather than merely hidden. 26.995-07 removed the
# prompt's instruction to name what she added in a separate field; the
# librarian now writes her addition INTO the essay. This fixture is that
# shape — her sentence sits inside the prose, in her own words, with no
# heading over it and nothing appended under it.
WOVEN_ESSAY = GOOD_ESSAY.replace(
    "closely, then trusted at a larger scale.",
    "closely, then trusted at a larger scale. you added the border note.")


_ABSENT = object()


class SessionFlowTest(unittest.TestCase):
    """Starts a real ThreadingHTTPServer on an ephemeral port per test,
    with a temp library injected via the create_server factory (the
    LibrarianPresortTest shape)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.library = self.tmp / "library"
        self.library.mkdir()
        no_cached_probe()
        with server.JOB_LOCK:
            server.IMPORT_JOB.update(state="idle", total=0, done=0,
                                     started_ms=0, report=None,
                                     message=None)
        # the librarian job dict is module state — start every test idle,
        # 26.7-02 session keys included
        with server.LIBRARIAN_LOCK:
            server.LIBRARIAN_JOB.update(state="idle", total=0, done=0,
                                        cost_usd=0.0, auth=None,
                                        message=None,
                                        unknown_id_verdicts=0,
                                        started_ms=0, stage=None,
                                        rejected_drafts=0,
                                        rejected_why=None)
        self.httpd = server.create_server(self.library, 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(
            target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        no_cached_probe()
        self._tmp.cleanup()

    # -- tiny http helpers ---------------------------------------------------

    def request(self, method, path, body=None, origin=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port,
                                          timeout=30)
        headers = {}
        if origin is not None:
            headers["Origin"] = origin
        try:
            if body is not None:
                raw = json.dumps(body).encode("utf-8")
                headers["Content-Type"] = "application/json"
                conn.request(method, path, raw, headers)
            else:
                conn.request(method, path, headers=headers)
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def request_json(self, method, path, body=None, origin=None):
        status, raw = self.request(method, path, body=body, origin=origin)
        return status, json.loads(raw)

    # -- store builder --------------------------------------------------------

    def seed_store(self, blessed_bodies=2, unseen_rows=1, marker=_ABSENT):
        """A store with librarian_enabled on: `blessed_bodies` blessed
        text items WITH snapshots (bodies always ride the reflection
        pool) and `unseen_rows` unseen items (metadata rows without
        consent). Stamps: blessed i → base+i, unseen i → base+100+i.
        `marker` seeds meta.last_reflection_ms when handed in."""
        # 26.7-uat (owner decision, beat 1): the route anchors a
        # first session (absent marker) to a recent window back from
        # now, so seeds sit one hour back — inside any sane window.
        base = int(time.time() * 1000) - 3600 * 1000
        (self.library / "items").mkdir(exist_ok=True)
        store = study_lib.new_store(self.library)
        store["meta"]["librarian_enabled"] = True
        if marker is not _ABSENT:
            store["meta"]["last_reflection_ms"] = marker
        for i in range(blessed_bodies):
            item_id = format(0xe000 + i, "016x")
            (self.library / "items" / f"{item_id}.md").write_text(
                f"BODY-{item_id} a kept note about the loom",
                encoding="utf-8")
            store["items"][item_id] = {
                "id": item_id, "content_hash": item_id * 4,
                "source": "folder-drop",
                "origin_path": f"/src/loom/kept-{i}.md",
                "library_path": f"items/{item_id}.md", "type": "text",
                "title": f"kept-{i}.md",
                "created_ms": base + i, "saved_ms": base + i,
                "imported_ms": base + i, "last_opened_ms": None,
                "state": "blessed", "resting_until_ms": None,
                "tags": [], "trigger": False, "year": 2023,
                "folder": "loom", "history": [],
            }
        for i in range(unseen_rows):
            item_id = format(0xe800 + i, "016x")
            store["items"][item_id] = {
                "id": item_id, "content_hash": item_id * 4,
                "source": "folder-drop",
                "origin_path": f"/src/loom/new-{i}.md",
                "library_path": f"items/{item_id}.md", "type": "text",
                "title": f"new-{i}.md",
                "created_ms": base + 100 + i, "saved_ms": base + 100 + i,
                "imported_ms": base + 100 + i, "last_opened_ms": None,
                "state": "unseen", "resting_until_ms": None,
                "tags": [], "trigger": False, "year": 2023,
                "folder": "loom", "history": [],
            }
        study_lib.save_store(self.library, store)
        return base + 100 + max(unseen_rows - 1, 0)   # the newest stamp

    def session_path(self):
        return self.library / "librarian" / "session.json"

    def meta_value(self, key, default=None):
        _, store = self.request_json("GET", "/api/items")
        return (store.get("meta") or {}).get(key, default)

    def wait_session(self, timeout=20.0):
        """Poll the progress route until the job leaves 'running',
        collecting every observed stage label on the way. Returns
        (final_snapshot, observed_stages). A plain test-side read loop —
        the app's own read is the client's one-shot re-arm, not this."""
        stages = []
        deadline = time.time() + timeout
        while time.time() < deadline:
            status, snap = self.request_json(
                "GET", "/api/librarian/progress")
            self.assertEqual(status, 200)
            stage = snap.get("stage")
            if stage is not None and (not stages or stages[-1] != stage):
                stages.append(stage)
            if snap["state"] in ("done", "stopped", "paused", "error"):
                return snap, stages
            time.sleep(0.01)
        self.fail("the session job never finished")

    def reflection_env(self, extra=None):
        # 26.995-12 (D-13): this envelope carried `"coda": None`. See
        # refine_env below — with the stub's pass-through now explicit and
        # named, a `None` here would put a stranger key on every answer.
        toggles = {"FAKE_CLAUDE_REFLECTION": json.dumps(
            {"reflection": GOOD_ESSAY}, ensure_ascii=False)}
        if extra:
            toggles.update(extra)
        return toggles

    # -- 1. consent fail-closed ----------------------------------------------

    def test_consent_must_be_bool_before_anything_spawns(self):
        self.seed_store()
        for body in ({}, {"consent": "yes"}, {"consent": 1},
                     {"consent": None}):
            status, data = self.request_json(
                "POST", "/api/librarian/session", body)
            self.assertEqual(status, 400, f"{body} must be refused")
            self.assertIn("consent must be true or false", data["error"])
        _, snap = self.request_json("GET", "/api/librarian/progress")
        self.assertEqual(snap["state"], "idle",
                         "a refused start never touches the job")
        self.assertFalse(self.session_path().exists(),
                         "a refused start writes nothing")

    # -- 2. origin gate (T-26.7-05) ------------------------------------------

    def test_origin_gate_inherited_by_construction(self):
        self.seed_store()
        for origin in ("http://evil.example", "null",
                       "https://attacker.invalid:8747"):
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True},
                origin=origin)
            self.assertEqual(status, 403, f"Origin {origin!r} must 403")
            self.assertIn("error", data)
        # the room's own origin passes the gate and reaches the route
        # (the consent check answers, proving dispatch order)
        status, data = self.request_json(
            "POST", "/api/librarian/session", {},
            origin=f"http://localhost:{self.port}")
        self.assertEqual(status, 400)
        self.assertIn("consent must be true or false", data["error"])

    # -- unavailable = zero work ----------------------------------------------

    def test_unavailable_answers_politely_with_zero_work(self):
        # ⚠ TRANSLATED, NOT DROPPED (26.93-07). The scenario this case wants is
        # "the librarian has nothing to answer with", and until 26.93-06 the
        # only way to express it was a PATH with no `claude` program on it.
        # PATH decides nothing about the librarian now, so the same scenario is
        # expressed as nothing answering on her own machine — which, with HOME
        # swapped and no cloud key anywhere, is every tier. `path_dirs` is the
        # imported seam's own spelling of that; it is passed for the meaning,
        # not for the directory.
        #
        # THE CLAIM IS UNCHANGED AND ASSERTS AS MUCH AS BEFORE: an unavailable
        # librarian answers 200 with plain words, never an error, and does ZERO
        # work. What "zero work" is evidence OF has moved with the seam — the
        # log file was written by a spawned program and is now written by the
        # recording transport — so the absence still means "nothing was ever
        # sent anywhere", which is the whole of what the case is for.
        self.seed_store()
        empty = self.tmp / "empty-path"
        empty.mkdir()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, path_dirs=str(empty)):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
        self.assertEqual(status, 200)
        self.assertIs(data["available"], False)
        self.assertTrue(data["why"])
        self.assertFalse(log.exists(),
                         "zero work: not one request was ever built, so the "
                         "recording transport wrote nothing")
        _, snap = self.request_json("GET", "/api/librarian/progress")
        self.assertEqual(snap["state"], "idle")

    # -- 3. busy gate ---------------------------------------------------------

    def test_second_post_while_running_is_busy(self):
        self.seed_store()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.reflection_env(
                {"FAKE_CLAUDE_SLOW": "0.5"})):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200, f"start refused: {data}")
            self.assertIs(data["running"], True)
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 400, "one job at a time")
            self.assertEqual(data["error"], server.LIBRARIAN_BUSY_MSG)
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "done")

    # -- 4. D-10 empty pool: zero generation ----------------------------------

    def test_first_session_window_excludes_the_distant_past(self):
        # 26.7-uat (owner decision, beat 1): an ABSENT marker is not
        # "since forever" — the route anchors the first session to
        # REFLECTION_FIRST_WINDOW_MS back from now, so a years-deep
        # store cannot overflow one sitting's document. The full-archive
        # review is a captured later feature, never the silent default.
        self.seed_store(blessed_bodies=2, unseen_rows=0)
        store = study_lib.load_store(self.library)
        old_id = format(0xd000, "016x")
        (self.library / "items" / f"{old_id}.md").write_text(
            "an old kept note from another season", encoding="utf-8")
        old_ms = int(time.time() * 1000) - 60 * 24 * 3600 * 1000
        store["items"][old_id] = {
            "id": old_id, "content_hash": old_id * 4,
            "source": "folder-drop",
            "origin_path": "/src/loom/old-season.md",
            "library_path": f"items/{old_id}.md", "type": "text",
            "title": "old-season.md",
            "created_ms": old_ms, "saved_ms": old_ms,
            "imported_ms": old_ms, "last_opened_ms": None,
            "state": "blessed", "resting_until_ms": None,
            "tags": [], "trigger": False, "year": 2023,
            "folder": "loom", "history": [],
        }
        study_lib.save_store(self.library, store)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.reflection_env()):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200)
            self.wait_session()
            rec = json.loads(log.read_text(encoding="utf-8"))
            doc = json.loads(rec["stdin"])
            blob = json.dumps(doc["pool"], ensure_ascii=False)
            self.assertNotIn(old_id, blob,
                             "a 60-day-old item sits OUTSIDE the "
                             "first-session window")
            self.assertTrue(doc["pool"]["bodies"],
                            "the hour-old seeds still ride the pool — "
                            "the window trims the past, not the present")

    def test_empty_pool_nothing_new_runs_no_call(self):
        newest = self.seed_store(blessed_bodies=2, unseen_rows=1)
        # the strict-> adjacency: a marker EQUAL to the newest stamp
        # makes everything OLD — the pool is empty.
        store = study_lib.load_store(self.library)
        store["meta"]["last_reflection_ms"] = newest
        study_lib.save_store(self.library, store)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.reflection_env()):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200)
            self.assertIs(data["nothing_new"], True)
            self.assertIs(data["running"], False)
            self.assertIs(data["held"], False,
                          "no session file waits yet")
            self.assertFalse(log.exists(),
                             "an empty pool spawns NO subprocess — the "
                             "stub's log is never written (D-10)")
            _, snap = self.request_json("GET", "/api/librarian/progress")
            self.assertEqual(snap["state"], "idle",
                             "the job resets to idle on nothing-new")
            self.assertEqual(self.meta_value("last_reflection_ms"),
                             newest,
                             "a nothing-new answer never stamps the "
                             "marker (D-11)")
            # a waiting session file flips `held` — and still no call
            study_lib.save_session_file(self.library, {
                "state": "held", "consented": True, "pool": {},
                "draft": "a held draft", "coda": None, "question": None,
                "chat": [], "created_ms": 1})
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200)
            self.assertIs(data["nothing_new"], True)
            self.assertIs(data["held"], True)
            self.assertFalse(log.exists(), "still zero generation")

    # -- 5. staged labels + the atomic session file ----------------------------

    def test_worker_walks_stages_and_persists_session_atomically(self):
        self.seed_store(blessed_bodies=2, unseen_rows=1)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.reflection_env(
                {"FAKE_CLAUDE_SLOW": "0.3"})):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200, f"start refused: {data}")
            self.assertIs(data["running"], True)
            snap, stages = self.wait_session()
        self.assertEqual(snap["state"], "done", f"errored: {snap}")
        self.assertEqual(snap["done"], 1)
        self.assertEqual(snap["rejected_drafts"], 0)
        # the staged walk (D-13): every observed label is one of the
        # three, in walk order, "reading…" observed mid-call (the SLOW
        # stub makes it visible) and "writing…" the resting final label.
        for stage in stages:
            self.assertIn(stage, STAGE_LABELS, f"unknown stage {stage!r}")
        indices = [STAGE_LABELS.index(s) for s in stages]
        self.assertEqual(indices, sorted(indices),
                         "the labels walk gathering → reading → writing")
        self.assertIn("reading…", stages)
        self.assertEqual(snap["stage"], "writing…")
        # the recorded stdin is the whole per-turn document
        rec = json.loads(log.read_text(encoding="utf-8"))
        doc = json.loads(rec["stdin"])
        # 26.87-10 CONSCIOUS PIN EDIT (D-26/D-27/D-32): the per-turn
        # document gained ONE key — `variation`, the call's memory of prior
        # titles and prior opening SHAPE tokens. The pin states the new
        # truth and gains two inverse assertions: the pool stays FIRST (the
        # stable cache prefix is why the memory goes after it, never
        # before), and the `identity` key is ABSENT because this seed store
        # sits below the evidence floor — that absence IS the prompt half
        # of the floor, not an omission.
        #
        # 26.995-04 CONSCIOUS PIN EDIT (D-14, 2026-08-19): ONE further key —
        # `evening`, the Evening line. ⛔ NOT A RE-BASELINE: its presence here
        # is a CLAIM about this fixture and is asserted as one below. This
        # seed store's pool holds exactly THREE rows, three is at or under the
        # owner's "not much here" threshold of four, so the piece-count fact
        # fires and the room is told what kind of evening it is. An
        # unremarkable pool would carry NO evening key at all, which is the
        # `identity` shape one line down and is pinned in
        # tests/test_librarian_fence.py's EveningLineTest.
        self.assertEqual(sorted(doc.keys()),
                         ["chat", "draft", "evening", "pool", "variation"])
        pool_rows = (len(doc["pool"]["bodies"])
                     + len(doc["pool"]["meta_rows"]))
        self.assertEqual(pool_rows, 3,
                         "the fixture's pool size, stated BY VALUE — the "
                         "evening key above is present BECAUSE of it")
        self.assertEqual(doc["evening"],
                         "there is not much here tonight — 3 pieces.",
                         "one plain sentence in the room's own register, "
                         "never a labelled list of fields")
        self.assertEqual(list(doc.keys())[1], "evening",
                         "immediately after the pool, never ahead of it")
        self.assertEqual(list(doc.keys())[0], "pool",
                         "pool-FIRST: a new key never displaces the "
                         "stable cache prefix")
        self.assertNotIn("identity", doc,
                         "below the evidence floor the anchors key is "
                         "absent from the document ENTIRELY (D-32)")
        self.assertIsNone(doc["draft"])
        self.assertEqual(doc["chat"], [])
        self.assertTrue(doc["pool"]["bodies"],
                        "blessed bodies ride the handed pool")
        for row in doc["pool"]["bodies"] + doc["pool"]["meta_rows"]:
            self.assertIn("comments", row,
                          "every reflection row carries comments (D-33)")
        # the session file IS the conversation state (D-04/D-11)
        sess = json.loads(self.session_path().read_text(encoding="utf-8"))
        self.assertEqual(sess["state"], "active")
        self.assertIs(sess["consented"], True)
        self.assertEqual(sess["draft"], GOOD_ESSAY)
        # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13. This line read
        # `self.assertIsNone(sess["coda"])` and it was correct when it was
        # written: the key was always present, holding None when the answer
        # named nothing. THE NEW TRUTH: no coda exists in the session
        # document at all — what she adds is woven into the writing.
        # ⛔ ASSERTED BY ABSENCE ON THE PERSISTED DOCUMENT, for the same
        # reason the question assertion below is: the closed-properties flag
        # lives on the SCHEMA and not on the validator, so a stub that kept
        # emitting a coda would pass silently and prove nothing.
        self.assertNotIn("coda", sess,
                         "the session document carries no coda key — the "
                         "label is gone from disk, not merely from the "
                         "page")
        # 26.995-06 task 2 CONSCIOUS PIN EDIT — 2026-08-19, D-05. This line
        # asserted `sess["question"] == GOOD_QUESTION`. THE NEW TRUTH: no
        # question exists in the session document at all — a question the
        # librarian wants to ask arrives inside the writing. ⛔ ASSERTED ON
        # THE PERSISTED DOCUMENT, by absence, because the schema's
        # closed-properties flag lives on the SCHEMA and not on the
        # validator: a stub that kept emitting a question would pass
        # silently and prove nothing.
        self.assertNotIn("question", sess,
                         "the session document carries no question key — "
                         "the footer is gone from disk, not merely from "
                         "the page")
        self.assertEqual(sess["chat"], [])
        self.assertEqual(sess["pool"], doc["pool"],
                         "the serialized pool persists with the draft")
        self.assertIsInstance(sess["created_ms"], int)
        # atomic: no torn temp files beside the session file
        leftovers = list((self.library / "librarian").glob(".tmp-*"))
        self.assertEqual(leftovers, [],
                         "atomic_write_bytes leaves no temp files")
        # the marker was READ, never stamped (D-11)
        self.assertIsNone(self.meta_value("last_reflection_ms"),
                          "a completed generation does not stamp the "
                          "marker — session completion is the save "
                          "path's, in a later plan")
        # GET hands the draft back fail-open
        status, data = self.request_json("GET", "/api/librarian/session")
        self.assertEqual(status, 200)
        self.assertEqual(data["state"], "active")
        self.assertEqual(data["draft"], GOOD_ESSAY)
        # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13: this read
        # `self.assertIsNone(data["coda"])`. The READOUT stops carrying the
        # key in the SAME change that stops the session write producing it —
        # a field removed on one side and read on the other is a defect that
        # surfaces late.
        self.assertNotIn("coda", data,
                         "the readout carries no coda — nothing on the "
                         "page can render a section that never arrives")
        # 26.995-06 task 2 CONSCIOUS PIN EDIT — see the session-document
        # assertion above. The READOUT stops carrying it too, in the same
        # change, because a field removed on one side and read on the other
        # is a defect that surfaces late.
        self.assertNotIn("question", data,
                         "the readout carries no question — nothing on the "
                         "page can render a footer that never arrives")
        self.assertIs(data["consented"], True)

    # -- 6. fail-visible rejection + the static line ---------------------------

    def test_bad_draft_counted_retried_once_then_static_line(self):
        self.seed_store(blessed_bodies=2, unseen_rows=1)
        items_before = (self.library / "items.json").read_bytes()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log,
                             extra={"FAKE_CLAUDE_REFLECTION_BAD": "1"}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200)
            self.assertIs(data["running"], True)
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "error")
        # ⚠ THIS ONE KEEPS THE CONSTANT, AND THE DISTINCTION IS THE POINT.
        # 26.93-06 replaced the static line with the eleven-token register
        # for TRANSPORT failures — the two cases below in this file moved to
        # FAILURE_SENTENCES["provider_down"]. This case is a CONTENT failure:
        # the draft came back and was refused by validation, so no transport
        # token describes it and the room's own line is still the right words.
        # An orchestrator changed all three sites together on 2026-08-13 and
        # this one went red immediately, which is the only reason the
        # difference is written down here rather than lost.
        self.assertEqual(snap["message"], server.LIBRARIAN_ERROR_MSG,
                         "the room's OWN line for a content refusal — never "
                         "a traceback, never draft content")
        self.assertEqual(snap["rejected_drafts"], 2,
                         "first rejection + exactly one in-process "
                         "regeneration, both counted fail-visible")
        self.assertEqual(snap["rejected_why"], "shape",
                         "the why is a category token, never content")
        self.assertFalse(self.session_path().exists(),
                         "a failed run persists no draft (SC-1: the "
                         "room untouched)")
        self.assertEqual((self.library / "items.json").read_bytes(),
                         items_before,
                         "the store is byte-untouched by a failed run")
        self.assertEqual(snap["lost_drafts"], 0,
                         "nothing was LOST here — both drafts arrived "
                         "whole and were refused on content. The two "
                         "counters must never stand in for each other")

    # -- 6b. map #50 / #68 ruling 2: the lost essay is written again, once ----
    #
    # HER RULING, verbatim: "yes, once, quietly."
    #
    # ⚠ WHAT MAKES THIS DIFFERENT FROM EVERY OTHER TRANSPORT FAILURE, and it
    # is the whole reason `retries: 0` survives beside it: a truncated essay
    # WAS WRITTEN and then destroyed by the size limit. She never saw a word
    # of it. So writing it again is a first delivery, not a substitution of
    # one reflection for another — which is the only thing the zero ever
    # protected against.

    def test_a_lost_essay_is_written_again_once_and_lands(self):
        self.seed_store(blessed_bodies=2, unseen_rows=1)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.reflection_env(
                {"FAKE_CLAUDE_TRUNCATE_FIRST": "1"})):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200, f"start refused: {data}")
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "done",
                         f"the second go must LAND — the whole ruling is "
                         f"that she gets the essay: {snap}")
        self.assertEqual(snap["lost_drafts"], 1,
                         "the destroyed answer is counted fail-visible — "
                         "it is the only evidence the size limit is wrong")
        self.assertEqual(snap["rejected_drafts"], 0,
                         "a lost draft never reached the content gate, so "
                         "it is not a rejection")
        self.assertTrue(self.session_path().exists(),
                        "the sitting ends with a draft on disk")

    def test_two_lost_essays_stop_at_two_calls_and_say_so(self):
        """⚠ ONCE MEANS ONCE. The re-ask rides the worker's EXISTING
        two-attempt loop rather than a loop of its own, so a provider
        destroying every answer costs exactly two calls and then stops —
        and the failure she is shown is the transport's own words for what
        happened, never the content line."""
        self.seed_store(blessed_bodies=2, unseen_rows=1)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.reflection_env(
                {"FAKE_CLAUDE_TRUNCATE_FIRST": "9"})):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200, f"start refused: {data}")
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "error")
        self.assertEqual(snap["lost_drafts"], 1,
                         "ONE re-ask, not a retry loop: the first loss is "
                         "counted and re-asked, the second ends the run")
        self.assertEqual(snap["message"],
                         server.FAILURE_SENTENCES["truncated"],
                         "the transport's own token speaks — a lost essay "
                         "is not a content refusal")
        self.assertFalse(self.session_path().exists(),
                         "SC-1: a failed run persists no draft")

    def test_a_deterministic_refusal_is_never_re_asked(self):
        """⛔ THE OTHER HALF OF THE RULING, and the one a future reader is
        likeliest to erode: only a LOST essay earns the second go. A
        provider that refused the request will refuse it identically —
        #83's *"ask again reproduces it 5/5"*, which this map has now met
        three times. Spending a second call on it buys nothing and costs
        her money."""
        self.seed_store(blessed_bodies=2, unseen_rows=1)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra={"FAKE_CLAUDE_FAIL": "1"}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200)
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "error")
        self.assertEqual(snap["lost_drafts"], 0,
                         "no essay was ever written, so none was lost")
        self.assertEqual(snap["rejected_drafts"], 0)

    def test_the_reask_set_is_exactly_the_lost_answer(self):
        """A pin on the constant itself, because the interesting fact is
        what is ABSENT from it. Every other token either says the request
        was refused (deterministic — re-asking is the dead end) or is
        already the transport's own business under RETRIED, which this
        job's `retries: 0` deliberately declines."""
        self.assertEqual(server.REFLECTION_REASK_FAILURES, ("truncated",))
        for token in server.REFLECTION_REASK_FAILURES:
            self.assertIn(token, L.FAILURES,
                          "a re-ask token that is not a real failure "
                          "token can never fire")
            self.assertNotIn(token, L.RETRIED,
                             "⛔ the job and the transport must not both "
                             "own the same token — that is the doubling "
                             "the seam's own rule forbids")
        for job in ("reflection", "reflection_refine"):
            self.assertEqual(L.JOBS[job]["retries"], 0,
                             "⛔ the row's allowance stays 0 — the re-ask "
                             "lands in the JOB, never the transport")

    def test_transport_failure_lands_static_line_no_retry(self):
        # ⚠ THE DRIVER TRANSLATED; THE MESSAGE PIN IS DELIBERATELY LEFT ALONE.
        # `FAKE_CLAUDE_FAIL` used to be a non-zero exit from a spawned program
        # and is now a 500 from the recording transport — the nearest true fact
        # (26.93-06, D-06: a provider that would not answer). The claim this
        # case makes — a transport failure parks ONE plain-words line on the
        # job, never a traceback, and never counts as a content rejection — is
        # unchanged and is asserted against the same constant it always was.
        #
        # ⚠ THE ONE ASSERTION THIS REPAIR COULD NOT WITNESS. 26.93-06 replaced
        # the single static line with the eleven-token register for the PRESORT
        # worker (`tests/test_server_smoke.py`'s
        # `test_a_failed_call_lands_the_failure_s_own_words` now asserts
        # `server.failure_sentence("provider_down", "ollama")` there). Whether
        # the REFLECTION worker took the same change was not verifiable without
        # running, so the constant stands rather than being replaced by a guess
        # — a pin nobody checked is exactly the defect class this phase keeps
        # landing. If this line comes back red on the failure sentence, the
        # correct repair is `server.failure_sentence("provider_down", "ollama")`
        # and NOT a loosened assertion.
        self.seed_store()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra={"FAKE_CLAUDE_FAIL": "1"}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200)
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "error")
        # 26.93-06: the static line became the eleven-token register.
        self.assertEqual(snap["message"],
                         server.FAILURE_SENTENCES["provider_down"])
        self.assertEqual(snap["rejected_drafts"], 0,
                         "a transport failure is not a content "
                         "rejection — zero automatic retries")
        self.assertFalse(self.session_path().exists())

    # -- 7. the marker is read, never stamped ----------------------------------

    def test_marker_read_for_pool_never_stamped(self):
        # a marker OLDER than every item: the pool is the whole set,
        # the run completes, and the marker value survives untouched.
        self.seed_store(blessed_bodies=2, unseen_rows=1,
                        marker=1600000000000)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.reflection_env()):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200)
            self.assertIs(data["running"], True,
                          "an older marker leaves the pool full")
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "done")
        self.assertEqual(self.meta_value("last_reflection_ms"),
                         1600000000000,
                         "start, polls, and a completed generation all "
                         "leave the marker exactly where it was (D-11)")

    # -- 8. the meta validator --------------------------------------------------

    def test_last_reflection_ms_meta_roundtrip_and_bad_shapes(self):
        self.seed_store(blessed_bodies=0, unseen_rows=0)
        for value in (1721400000000, None, 0):
            status, _ = self.request_json(
                "POST", "/api/meta", {"last_reflection_ms": value})
            self.assertEqual(status, 200, f"{value!r} must be accepted")
            self.assertEqual(self.meta_value("last_reflection_ms",
                                             _ABSENT), value)
        for bad in (True, 1.5, "soon", [], {}):
            status, data = self.request_json(
                "POST", "/api/meta", {"last_reflection_ms": bad})
            self.assertEqual(status, 400, f"{bad!r} must be refused")
            self.assertIn("error", data)
        self.assertEqual(self.meta_value("last_reflection_ms", _ABSENT),
                         0, "a refused merge persists nothing — the "
                            "last good value stays")

    # -- 9. the read route is fail-open -----------------------------------------

    def test_session_read_fail_open(self):
        self.seed_store(blessed_bodies=0, unseen_rows=0)
        status, data = self.request_json("GET", "/api/librarian/session")
        self.assertEqual(status, 200)
        self.assertEqual(data["state"], "none",
                         "an absent file is no session, never an error")
        # an off-shape file (a list, not a dict) reads as none too
        (self.library / "librarian").mkdir(exist_ok=True)
        (self.library / "librarian" / "session.json").write_text(
            "[]", encoding="utf-8")
        status, data = self.request_json("GET", "/api/librarian/session")
        self.assertEqual(status, 200)
        self.assertEqual(data["state"], "none")
        # a seeded document hands its fields back
        study_lib.save_session_file(self.library, {
            "state": "active", "consented": True, "pool": {},
            # ⛔ A PRE-CHANGE-SHAPED DOCUMENT, ON PURPOSE (26.995-12,
            # D-13): both retired keys are written. The readout must carry
            # NEITHER while the file itself is left exactly as found —
            # read-time tolerance, law 9. This is also the non-compliant
            # arm: a seed that simply stopped writing them would let the
            # assertions below pass for the fixture's reason.
            "draft": "a small draft", "coda": "from our talk",
            "question": None, "chat": [], "created_ms": 5})
        status, data = self.request_json("GET", "/api/librarian/session")
        self.assertEqual(status, 200)
        self.assertEqual(data["state"], "active")
        self.assertEqual(data["draft"], "a small draft")
        # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13. This line read
        # `self.assertEqual(data["coda"], "from our talk")`, and it pinned
        # real shipped behaviour. THE NEW TRUTH: the readout carries no coda
        # at all — the stale key on disk is simply NOT READ.
        self.assertNotIn("coda", data,
                         "the readout carries no coda — and the seed above "
                         "still writes one, so this is true of the ROUTE "
                         "rather than of the fixture")
        # 26.995-06 task 2 CONSCIOUS PIN EDIT — 2026-08-19, D-05: the
        # readout no longer carries the key at all.
        self.assertNotIn("question", data)
        # ⛔ LAW 9, IN THE SAME CASE: nothing rewrote her file. The stale
        # keys are still on disk, byte-identical to what was seeded.
        on_disk = json.loads(
            self.session_path().read_text(encoding="utf-8"))
        self.assertEqual(on_disk["coda"], "from our talk",
                         "the room read past the retired key without "
                         "touching it — it never rewrites what is already "
                         "written")
        self.assertIs(data["consented"], True)

    # ---- 26.7-03: the chat-refine turn engine (behaviors 10-15) -------------

    def refine_env(self, extra=None):
        """The refine tests' toggle set: the good reflection envelope for
        the opening generation, plus EVERY flip-able toggle pre-registered
        with an inert value.

        ⚠ THE PRE-REGISTRATION IS NO LONGER LOAD-BEARING, AND IS KEPT ANYWAY
        (26.93-07). It existed because the retired local `fake_claude_env`
        restored exactly the keys it had been handed, so a mid-test
        `os.environ` flip (echo on, fail on, …) only rolled back if the key had
        been registered up front. The imported seam saves and restores the
        WHOLE toggle roster regardless, so the flips below are safe either way.
        The explicit inert values stay because they document, at the call site,
        which toggles each case is about to move — and an empty string reads as
        off in every branch of the canned answer, exactly as an absent name
        does."""
        toggles = {
            # 26.995-12 (D-13): this envelope carried `"coda": None`. The
            # field left the wire, and the stub's coda pass-through is now
            # explicit and named — so a `None` here would emit a stranger key
            # on EVERY refine test, making the default arm quietly
            # non-compliant instead of deliberately so. The deliberate
            # non-compliant arm is FAKE_CLAUDE_REFLECTION_STALE_CODA, flipped
            # by name in exactly one case.
            "FAKE_CLAUDE_REFLECTION": json.dumps(
                {"reflection": GOOD_ESSAY}, ensure_ascii=False),
            "FAKE_CLAUDE_REFLECTION_ECHO": "",
            "FAKE_CLAUDE_REFLECTION_STALE_CODA": "",
            "FAKE_CLAUDE_REFLECTION_BAD": "",
            "FAKE_CLAUDE_FAIL": "",
            "FAKE_CLAUDE_QUESTION": "",
            "FAKE_CLAUDE_SLOW": "",
        }
        if extra:
            toggles.update(extra)
        return toggles

    def start_active_session(self):
        """Run one full generation against the stub so an ACTIVE consented
        session.json exists; returns the parsed session document."""
        status, data = self.request_json(
            "POST", "/api/librarian/session", {"consent": True})
        self.assertEqual(status, 200, f"start refused: {data}")
        self.assertIs(data["running"], True)
        snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "done", f"errored: {snap}")
        return json.loads(self.session_path().read_text(encoding="utf-8"))

    # -- 10. the D-04 per-turn gate --------------------------------------------

    def test_refine_refused_without_active_consented_session(self):
        self.seed_store()
        # (a) no session file at all — refused BEFORE any availability
        # probe (no fake CLI is even on PATH here) and nothing spawns
        status, data = self.request_json(
            "POST", "/api/librarian/refine", {"text": "one more thing"})
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], server.LIBRARIAN_NO_SESSION_MSG)
        # (b) a held (non-active) session file
        study_lib.save_session_file(self.library, {
            "state": "held", "consented": True, "pool": {}, "draft": "d",
            "coda": None, "question": None, "chat": [], "created_ms": 1})
        status, data = self.request_json(
            "POST", "/api/librarian/refine", {"text": "one more thing"})
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], server.LIBRARIAN_NO_SESSION_MSG)
        # (c) an active file with NO recorded consent answer (hand-edited
        # off-shape) — the flag itself is the per-turn check (D-04)
        study_lib.save_session_file(self.library, {
            "state": "active", "pool": {}, "draft": "d", "coda": None,
            "question": None, "chat": [], "created_ms": 1})
        status, data = self.request_json(
            "POST", "/api/librarian/refine", {"text": "one more thing"})
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], server.LIBRARIAN_NO_SESSION_MSG)
        # (d) a bad body refuses first, whatever the session state
        study_lib.save_session_file(self.library, {
            "state": "active", "consented": True, "pool": {},
            "draft": "d", "coda": None, "question": None, "chat": [],
            "created_ms": 1})
        for body in ({}, {"text": ""}, {"text": "   "}, {"text": 5},
                     {"text": None}):
            status, data = self.request_json(
                "POST", "/api/librarian/refine", body)
            self.assertEqual(status, 400, f"{body} must be refused")
            self.assertIn("a chat turn needs some words", data["error"])
        _, snap = self.request_json("GET", "/api/librarian/progress")
        self.assertEqual(snap["state"], "idle",
                         "a refused turn never touches the job")

    # -- 11. the per-turn stdin document ---------------------------------------

    def test_refine_stdin_pool_first_byte_identical_and_capped(self):
        self.seed_store(blessed_bodies=2, unseen_rows=1)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.refine_env()):
            no_cached_probe()
            sess = self.start_active_session()
            # a long transcript: the re-sent WINDOW caps, the file never
            long_chat = []
            for i in range(7):
                long_chat.append({"who": "user", "text": f"turn-{i}"})
                long_chat.append({"who": "librarian", "text": f"reply-{i}"})
            sess["chat"] = long_chat            # 14 entries on disk
            study_lib.save_session_file(self.library, sess)
            before = self.session_path().read_text(encoding="utf-8")
            os.environ["FAKE_CLAUDE_REFLECTION_ECHO"] = "1"
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "the loom hums"})
            self.assertEqual(status, 200, f"refine refused: {data}")
            self.assertIs(data["running"], True)
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "done", f"errored: {snap}")
        self.assertEqual(snap["stage"], "writing…",
                         "the refine turn's one stage label")
        rec = json.loads(log.read_text(encoding="utf-8"))
        stdin = rec["stdin"]
        self.assertTrue(stdin.startswith('{"pool": '),
                        "pool-FIRST key order — the stable cache prefix "
                        "(AI-SPEC §4b)")
        sess_before = json.loads(before)
        self.assertIn(json.dumps(sess_before["pool"], ensure_ascii=False),
                      stdin,
                      "the pool bytes re-send IDENTICALLY from the "
                      "session file — never recomputed mid-chat (D-01)")
        doc = json.loads(stdin)
        # 26.87-10 CONSCIOUS PIN EDIT (D-26/D-27): the refine turn carries
        # the same one new key in the same place. The `startswith('{"pool":
        # ')` assertion above is the inverse that keeps the memory AFTER
        # the pool; `identity` stays absent below the evidence floor.
        #
        # 26.995-04 CONSCIOUS PIN EDIT (D-14, 2026-08-19): the refine turn is
        # told what kind of evening it is exactly as the generation turn was,
        # and over the SESSION FILE'S OWN pool — the same bytes she consented
        # to, never rebuilt mid-chat. Its presence is a claim about this
        # fixture's three-row pool, asserted by value below.
        self.assertEqual(sorted(doc.keys()),
                         ["chat", "draft", "evening", "pool", "variation"])
        refine_rows = (len(doc["pool"]["bodies"])
                       + len(doc["pool"]["meta_rows"]))
        self.assertEqual(refine_rows, 3,
                         "the session file's own pool size, BY VALUE")
        self.assertEqual(doc["evening"],
                         "there is not much here tonight — 3 pieces.")
        self.assertEqual(list(doc.keys())[1], "evening",
                         "immediately after the pool on this path too")
        self.assertNotIn("identity", doc,
                         "below the evidence floor the anchors key is "
                         "absent from every turn's document (D-32)")
        self.assertEqual(doc["draft"], sess_before["draft"],
                         "the current draft rides every turn")
        self.assertEqual(len(doc["chat"]), server.CHAT_TURN_CAP,
                         "at most CHAT_TURN_CAP chat entries ride")
        want = (long_chat + [{"who": "user", "text": "the loom hums"}])
        self.assertEqual(doc["chat"], want[-server.CHAT_TURN_CAP:],
                         "the window is the LAST entries, the new user "
                         "turn included")
        # the persisted transcript is whole — the cap bounds the window
        sess_after = json.loads(
            self.session_path().read_text(encoding="utf-8"))
        self.assertEqual(len(sess_after["chat"]), 16,
                         "14 prior + user turn + librarian reply — the "
                         "file keeps every turn")

    # -- 12. a failed turn consumes nothing; re-send lands once ---------------

    def test_failed_turn_consumes_nothing_and_resend_is_clean(self):
        self.seed_store()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.refine_env()):
            no_cached_probe()
            self.start_active_session()
            before = self.session_path().read_bytes()
            # (a) transport failure: byte-identical file, zero retries
            os.environ["FAKE_CLAUDE_FAIL"] = "1"
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "add the bench"})
            self.assertEqual(status, 200, f"refine refused: {data}")
            snap, _ = self.wait_session()
            self.assertEqual(snap["state"], "error")
            # 26.93-06: the static line became the eleven-token register.
            self.assertEqual(snap["message"],
                             server.FAILURE_SENTENCES["provider_down"])
            self.assertEqual(snap["rejected_drafts"], 0,
                             "a transport failure is not a content "
                             "rejection")
            self.assertEqual(self.session_path().read_bytes(), before,
                             "the transcript on disk is exactly as "
                             "before the turn (SRM-11 idempotency)")
            # (b) content rejection: counted, file untouched.
            #
            # ⚠⚠ INVERTED IN PLACE, 2026-08-19 (26.995-03 task 5, COPY § C-6)
            # — AND THE CLAIM THIS ARM MAKES IS UNCHANGED. It has always been
            # about what a refused turn CONSUMES: nothing. The session file is
            # still byte-untouched, the turn is still re-sendable, and no
            # duplicate ever persists (SRM-11). What changed is the count
            # beside it, and it changed because SHE RULED IT: a rejected
            # rewrite is now written again ONCE before the room gives up, so
            # a provider refusing everything produces TWO rejections, not one.
            # ⛔ THE OLD REASON IS PRESERVED HERE BECAUSE IT WAS GOOD AND IS
            # NOW ONLY HALF-TRUE: "the turn itself is free to re-send" is
            # still why this path needs no transport retry — it is no longer
            # why it needs no regeneration, because D-03 says write it again.
            # A later reader finding this arm red should ask which number came
            # back: 1 would mean her ruling was undone.
            os.environ["FAKE_CLAUDE_FAIL"] = ""
            os.environ["FAKE_CLAUDE_REFLECTION_BAD"] = "1"
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "add the bench"})
            self.assertEqual(status, 200)
            snap, _ = self.wait_session()
            self.assertEqual(snap["state"], "error")
            self.assertEqual(snap["rejected_drafts"], 2,
                             "the refused rewrite is written again ONCE and "
                             "only the second failure gives up — two "
                             "rejections counted, both fail-visible")
            self.assertEqual(snap["rejected_why"], "shape")
            self.assertEqual(self.session_path().read_bytes(), before)
            # (c) the SAME turn re-sent lands exactly once, atomically
            os.environ["FAKE_CLAUDE_REFLECTION_BAD"] = ""
            os.environ["FAKE_CLAUDE_REFLECTION_ECHO"] = "1"
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "add the bench"})
            self.assertEqual(status, 200)
            snap, _ = self.wait_session()
            self.assertEqual(snap["state"], "done", f"errored: {snap}")
            sess = json.loads(
                self.session_path().read_text(encoding="utf-8"))
            self.assertEqual(len(sess["chat"]), 2,
                             "no duplicate turn ever persists")
            self.assertEqual(sess["chat"][0],
                             {"who": "user", "text": "add the bench"})
            self.assertEqual(sess["chat"][1]["who"], "librarian")
            self.assertEqual(sess["chat"][1]["text"],
                             server.LIBRARIAN_REFINE_ACK,
                             "no question in the reply — the one "
                             "acknowledgment line is the chat entry")
            # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13. The
            # second line read `self.assertIn("add the bench",
            # sess["coda"], "the coda names what she added (D-05)")` and it
            # was correct when written. THE NEW TRUTH: her words survive in
            # the DRAFT — woven into the writing, in her own words — and
            # there is no separate field naming them. THE EVIDENCE MOVED; it
            # was not deleted. The line above is where it now lives.
            self.assertIn("add the bench", sess["draft"],
                          "the revised draft carries her words, woven in "
                          "(D-07, and D-13 for where they live now)")
            self.assertNotIn("coda", sess,
                             "and no field names them separately")
            self.assertEqual(sess["state"], "active")
            self.assertIs(sess["consented"], True)
            # GET hands the transcript back — the client repaints from
            # server state, never a second bookkeeping system
            status, data = self.request_json(
                "GET", "/api/librarian/session")
            self.assertEqual(status, 200)
            self.assertEqual(data["chat"], sess["chat"])
            self.assertEqual(data["draft"], sess["draft"])
        leftovers = list((self.library / "librarian").glob(".tmp-*"))
        self.assertEqual(leftovers, [],
                         "atomic_write_bytes leaves no temp files")

    # -- 12z. 26.995-06 task 3 (D-05): a sitting saved BEFORE this change ----

    def test_a_pre_change_sitting_opens_refines_and_saves(self):
        """⛔ THE UNMUTATED CONTROL FOR THE WHOLE DELETION. Everything else
        in this plan proves the question is GONE; this proves the going did
        not break what is already on her disk.

        A session document written before this change carries a `question`
        key. READ-TIME TOLERANCE is the rule for anything already on her
        disk: the key is IGNORED — nothing raises, nothing migrates,
        nothing rewrites her file — and the sitting opens, renders, refines
        and saves exactly as it did."""
        self.seed_store()
        stale_question = "shall the essay return to the border chart?"
        study_lib.save_session_file(self.library, {
            "state": "active", "consented": True, "pool": {},
            "draft": "## the small return\n\nyou wrote about the same walk "
                     "three times, and you kept the same corner of it.",
            "name": "the small return",
            # the pre-change keys, on disk, exactly as they were written —
            # 26.995-12 (D-13) adds `coda` to that description: both are
            # retired now, and both are left alone rather than migrated
            "coda": "you added the border note.",
            "question": stale_question,
            "chat": [], "created_ms": 7})
        on_disk = json.loads(
            self.session_path().read_text(encoding="utf-8"))
        self.assertEqual(on_disk["question"], stale_question,
                         "the fixture must actually carry the stale key, "
                         "or this case proves nothing about tolerance")
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.refine_env()):
            no_cached_probe()
            # (a) it OPENS, and no footer comes back with it
            status, data = self.request_json(
                "GET", "/api/librarian/session")
            self.assertEqual(status, 200, "a pre-change sitting must open")
            self.assertEqual(data["state"], "active")
            self.assertIn("the same walk", data["draft"])
            self.assertEqual(data["name"], "the small return")
            self.assertNotIn("question", data,
                             "the stale key is ignored at read time — it "
                             "never reaches the page, and nothing raised "
                             "on the way past it")
            # (b) it REFINES
            os.environ["FAKE_CLAUDE_REFLECTION_ECHO"] = "1"
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "and the gulls"})
            self.assertEqual(status, 200, f"refine refused: {data}")
            snap, _ = self.wait_session()
            self.assertEqual(snap["state"], "done", f"errored: {snap}")
            sess = json.loads(
                self.session_path().read_text(encoding="utf-8"))
            self.assertIn("and the gulls", sess["draft"],
                          "her words are woven in, as ever")
            self.assertEqual(sess["chat"][-1]["text"],
                             server.LIBRARIAN_REFINE_ACK,
                             "and the chat speaks the fallback, because "
                             "this turn carried no reply of its own")
            # ⚠ THE STALE KEY IS STILL THERE AND THAT IS CORRECT, NOT A
            # LEAK. `new_doc` starts as a copy of what was on disk, and
            # read-time tolerance means we do not migrate or rewrite her
            # file. It is INERT: nothing reads it, on either side.
            self.assertEqual(sess["question"], stale_question,
                             "not migrated and not rewritten — ignored")

    # -- 12a. 26.995-06 task 1a (COPY § C-2): the room's own words -----------
    #
    # HER RULING, 2026-08-18, option `a-short-said-field`: the librarian
    # answers a refine turn in its OWN words — a short line it returns per
    # turn — chosen over one fixed line, a small rotated set, and silence.
    #
    # ⛔ WHY THIS CASE HAD TO EXIST AT ALL. Until D-05, the room's chat reply
    # was *the question, or the one acknowledgment line*. D-05 deletes the
    # question field, so without a replacement every refine turn would say the
    # same canned sentence forever — the exact sameness this phase exists to
    # end, arriving in a place nobody was looking.

    def test_the_room_speaks_its_own_line_on_a_refine_turn(self):
        """Both arms in one case, because the reply and its fallback are one
        decision: a reply that ARRIVES is what the chat says, and a reply that
        does NOT arrive falls back to the acknowledgment — never to a blank
        librarian line.

        ⛔ THE REPLY DRIVEN HERE IS ONE THE NARRATION SCREEN WOULD REFUSE if
        that screen were ever aimed at it. That is deliberate and it is the
        end-to-end half of the proof: `tests/test_librarian_fence.py`
        SpokenReplyTest proves it at the unit level; this proves the turn
        COMPLETES and the words REACH THE CHAT through the real route."""
        self.seed_store()
        reply = ("wrote the ferry into the middle — it changed where the "
                 "whole thing lands.")
        self.assertTrue(server._reads_as_process_narration(reply),
                        "the fixture must actually trip the narration "
                        "screen, or this case proves nothing about the "
                        "collision it exists for")
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.refine_env()):
            no_cached_probe()
            self.start_active_session()
            os.environ["FAKE_CLAUDE_REFLECTION_ECHO"] = "1"

            # -- arm 1: the model returns a reply. The chat speaks IT. -------
            os.environ["FAKE_CLAUDE_REFLECTION"] = json.dumps(
                {"said": reply}, ensure_ascii=False)
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "the ferry"})
            self.assertEqual(status, 200, f"refine refused: {data}")
            snap, _ = self.wait_session()
            self.assertEqual(snap["state"], "done", f"errored: {snap}")
            sess = json.loads(
                self.session_path().read_text(encoding="utf-8"))
            self.assertEqual(sess["chat"][-1]["who"], "librarian")
            self.assertEqual(sess["chat"][-1]["text"], reply,
                             "the librarian's chat line is the model's own "
                             "reply for THIS turn")
            self.assertNotEqual(sess["chat"][-1]["text"],
                                server.LIBRARIAN_REFINE_ACK,
                                "the fixed acknowledgment is no longer the "
                                "reply on the happy path — that sameness is "
                                "what her ruling removed")
            spoken = [t for t in sess["chat"]
                      if t.get("who") == "librarian"
                      and t.get("text") == server.LIBRARIAN_REFINE_ACK]
            self.assertEqual(len(spoken), 0,
                             "the fallback must not fire when a reply "
                             "arrived")
            # ⛔⛔ 26.995-06 task 2, AND THIS ASSERTION EXISTS BECAUSE THE
            # MUTATION DRILL FOUND IT MISSING. The REFINE path writes the
            # session file too, and its question write was driven by
            # NOTHING: a mutant putting `new_doc["question"]` back survived
            # the whole suite. The generation path's absence was pinned;
            # this one was not. A green suite is not a driven suite.
            self.assertNotIn("question", sess,
                             "the refine write carries no question key "
                             "either — the footer is gone from BOTH paths")

            # -- arm 2: THE UNMUTATED CONTROL and the fallback, together. ----
            # An empty reply is not a failure; it is a turn with nothing to
            # report, and the acknowledgment holds the line so the chat is
            # never blank. Asserted by COUNT — exactly once — because "the
            # ack appears" and "the ack appears on every turn" look the same
            # from a membership check.
            os.environ["FAKE_CLAUDE_REFLECTION"] = json.dumps(
                {"said": ""}, ensure_ascii=False)
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "and the gulls"})
            self.assertEqual(status, 200, f"refine refused: {data}")
            snap, _ = self.wait_session()
            self.assertEqual(snap["state"], "done", f"errored: {snap}")
            sess = json.loads(
                self.session_path().read_text(encoding="utf-8"))
            self.assertEqual(sess["chat"][-1]["text"],
                             server.LIBRARIAN_REFINE_ACK,
                             "an empty reply falls back to the "
                             "acknowledgment, never to a blank line")
            acks = [t for t in sess["chat"]
                    if t.get("who") == "librarian"
                    and t.get("text") == server.LIBRARIAN_REFINE_ACK]
            self.assertEqual(len(acks), 1,
                             "the fallback fired EXACTLY once — on the turn "
                             "that carried no reply, and on no other")
            said_lines = [t for t in sess["chat"]
                          if t.get("who") == "librarian"
                          and t.get("text") == reply]
            self.assertEqual(len(said_lines), 1,
                             "and the first turn's own words are still "
                             "standing in the transcript")

    # -- 12b. 26.995-03 task 5 (COPY § C-6): the refine path writes it again --
    #
    # HER RULING, 2026-08-18: try again once, then keep what she had.
    #
    # ⚠ WHAT CHANGED, AND WHY THE OLD COMMENT ABOVE IT WAS RIGHT UNTIL IT WAS
    # NOT. `_refine_worker` made ONE call per turn on purpose, and the reason
    # is still true: a lost refine costs one turn, her words come straight
    # back to the input box, and re-sending is the shipped design. What that
    # reasoning did not cover is D-03 — *write it again, never refuse* — which
    # RESEARCH § C-3 reported as UNBUILDABLE on this path, and which she then
    # ruled buildable by saying what giving up should MEAN here. It had no
    # meaning before: a rejection set the sitting to `error` and showed her
    # the room's generic line, which is a refusal wearing an error's clothes.
    #
    # ⛔ THE TRANSPORT RETRY COUNT IS NOT INVOLVED and stays zero. This is a
    # worker-level loop at the same level as the generation worker's, which is
    # the shape it deliberately mirrors rather than inventing a second one.

    def test_refine_writes_it_again_once_then_keeps_what_she_had(self):
        """Three arms, three call counts asserted BY VALUE, because a loop
        that ALWAYS retries and a loop that NEVER retries are indistinguishable
        from a verdict alone — only the number separates them."""
        self.seed_store()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.refine_env()):
            no_cached_probe()
            self.start_active_session()
            before = self.session_path().read_bytes()
            before_doc = json.loads(before.decode("utf-8"))
            kept_draft = before_doc["draft"]

            # -- arm 1: the first attempt passes. ONE call, no loop. ---------
            os.environ["FAKE_CLAUDE_REFLECTION_ECHO"] = "1"
            calls_before = smoke.calls_seen()
            status, _ = self.request_json(
                "POST", "/api/librarian/refine", {"text": "add the bench"})
            self.assertEqual(status, 200)
            snap, _ = self.wait_session()
            self.assertEqual(snap["state"], "done", f"errored: {snap}")
            self.assertEqual(
                smoke.calls_seen() - calls_before, 1,
                "a turn that lands on its first go must cost exactly ONE "
                "call — a loop that retries unconditionally would double "
                "every good turn on her bill")

            # -- arm 2: THE UNMUTATED CONTROL. Refused once, lands on the ---
            # second. This is the arm that proves the loop actually RETRIES
            # rather than merely swallowing the failure quietly.
            landed = json.loads(
                self.session_path().read_text(encoding="utf-8"))["draft"]
            os.environ["FAKE_CLAUDE_REFLECTION_BAD_FIRST"] = "1"
            calls_before = smoke.calls_seen()
            status, _ = self.request_json(
                "POST", "/api/librarian/refine", {"text": "and the lamp"})
            self.assertEqual(status, 200)
            snap, _ = self.wait_session()
            self.assertEqual(
                snap["state"], "done",
                "the SECOND go must land — D-03's 'write it again' is the "
                "whole ruling, and a path that gives up after one refusal "
                "has not built it: %s" % (snap,))
            self.assertEqual(
                smoke.calls_seen() - calls_before, 2,
                "exactly two calls: the refused one and the one that landed")
            self.assertEqual(snap["rejected_drafts"], 1,
                             "the refusal is counted fail-visible — a "
                             "category count, never the draft")
            after_recover = json.loads(
                self.session_path().read_text(encoding="utf-8"))
            self.assertNotEqual(after_recover["draft"], landed,
                                "the recovered revision is what landed, so "
                                "the draft must have MOVED")
            self.assertIn("and the lamp", after_recover["draft"],
                          "and it carries her words (D-07)")

            # -- arm 3: refused TWICE. She keeps what she had. ---------------
            os.environ["FAKE_CLAUDE_REFLECTION_BAD_FIRST"] = "9"
            standing = self.session_path().read_bytes()
            standing_draft = json.loads(
                standing.decode("utf-8"))["draft"]
            calls_before = smoke.calls_seen()
            status, _ = self.request_json(
                "POST", "/api/librarian/refine", {"text": "and the window"})
            self.assertEqual(status, 200)
            snap, _ = self.wait_session()
            self.assertEqual(
                smoke.calls_seen() - calls_before, 2,
                "ONCE MEANS ONCE — a provider refusing every answer costs "
                "exactly two calls and then stops, never a retry loop on "
                "her bill")
            self.assertEqual(snap["rejected_drafts"], 2,
                             "both refusals counted, and neither logged")
            # ⛔ THE RULING'S OWN WORDS: the reflection she already had
            # STANDS. Asserted BYTE-IDENTICAL, not merely non-empty — a
            # rewrite that quietly re-serialized the file would pass a
            # weaker assertion while having touched her essay.
            self.assertEqual(
                self.session_path().read_bytes(), standing,
                "a rewrite that failed twice must leave the session file "
                "BYTE-UNTOUCHED — her reflection is not damaged by the "
                "room failing to improve it")
            self.assertEqual(
                json.loads(self.session_path().read_text(
                    encoding="utf-8"))["draft"], standing_draft)
            # her addition is DROPPED, not half-persisted.
            self.assertNotIn(
                "and the window",
                self.session_path().read_text(encoding="utf-8"),
                "the turn that did not land leaves nothing behind — no "
                "orphan user turn, and above all no rejected draft")
            # and the chat says so, in HER approved words rather than the
            # room's generic failure line.
            self.assertEqual(
                snap["message"], server.LIBRARIAN_REFINE_UNCHANGED_MSG,
                "she is told the change did not land and the reflection is "
                "as it was — NOT the room's generic error, which is a "
                "refusal wearing an error's clothes (D-03)")
            self.assertNotEqual(snap["message"], server.LIBRARIAN_ERROR_MSG)

            # ⛔ AND THE INVARIANT THAT MUST SURVIVE ALL THREE ARMS: the
            # second attempt is a WORKER-level loop, so the transport's
            # retry allowance is untouched and still zero. If this ever
            # reads non-zero, the loop was built in the wrong place and
            # four unrelated failure modes changed behaviour to buy this one.
            self.assertEqual(
                librarian_call.JOBS["reflection_refine"]["retries"], 0,
                "the transport retry count is a stated invariant of ZERO "
                "and this ruling must never be bought by raising it")
        self.assertEqual(kept_draft, before_doc["draft"])

    # -- 13. a dismissed topic REJECTS the whole draft ------------------------
    #
    # ⚠⚠ INVERTED-CASE — 2026-08-19 (26.995-06 task 2, D-05). It asserted a
    # STRIP: `rejected_why == "question_stripped"`, `rejected_drafts == 0`, the
    # revised draft kept, the question emptied out of the session file.
    #
    # That strip was floor row 14's ONLY enforcement — *a topic she has
    # dismissed never returns* — and it worked because the question lived in a
    # slot of its own that could be emptied before she saw it. D-05 moves the
    # question INTO the writing, so there is no slot. CONTEXT rules the
    # consequence in its own words: move them anyway and pay the regeneration.

    def test_dismissed_topic_rejects_the_whole_draft_and_costs_a_call(self):
        """⛔ THE COST IS ASSERTED BY VALUE, not described. A returned
        dismissed topic now costs a DISCARDED DRAFT AND A SECOND CALL, and a
        verdict alone cannot tell a loop that retried from one that never
        did — only the number can."""
        self.seed_store()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.refine_env()):
            no_cached_probe()
            self.start_active_session()
            before = self.session_path().read_bytes()
            status, _ = self.request_json(
                "POST", "/api/librarian/dismiss",
                {"topic": "the frogged sleeve"})
            self.assertEqual(status, 200)
            # the librarian's OWN prose returns to it, in the essay itself —
            # which is the only place a question can live now.
            returning = json.dumps(
                {"reflection": GOOD_ESSAY + "\n\nwhat would it take for you "
                                            "to pick the frogged sleeve up "
                                            "again?"},
                ensure_ascii=False)
            os.environ["FAKE_CLAUDE_REFLECTION"] = returning
            calls_before = smoke.calls_seen()
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "keep the border"})
            self.assertEqual(status, 200, f"refine refused: {data}")
            snap, _ = self.wait_session()
            calls = smoke.calls_seen() - calls_before
        self.assertEqual(snap["rejected_drafts"], 2,
                         "the draft is thrown away WHOLE, twice — the strip "
                         "that kept it is gone")
        self.assertEqual(snap["rejected_why"], "dismissed_topic",
                         "its own token, fail-visible, category only — "
                         "never the draft and never the topic")
        self.assertEqual(calls, 2,
                         "THE COST, BY VALUE: one extra paid call per turn. "
                         "The two-attempt loop bounds it there and there is "
                         "no third attempt")
        self.assertEqual(snap["state"], "error")
        self.assertEqual(snap["message"],
                         server.LIBRARIAN_REFINE_UNCHANGED_MSG,
                         "refused twice, so the reflection she already had "
                         "stands — in her own approved words, never the "
                         "room's generic refusal line")
        self.assertEqual(self.session_path().read_bytes(), before,
                         "and it stands BYTE-IDENTICAL: no rejected draft is "
                         "written anywhere")

    def test_dismissed_topic_is_read_over_the_librarians_own_voice(self):
        """⬜ AN AGENT'S READING, NOT HER RULING, and driven so it is visible
        rather than buried: the screen reads the UNQUOTED remainder, on the
        shipped precedent that the librarian-VOICE screens exempt her quoted
        words (laws 2/4). Her own sentence, quoted verbatim and naming the
        topic, is HERS and the essay stands. ⚠ SHE MAY CORRECT THIS — this
        case is the whole change if she does."""
        self.seed_store()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.refine_env()):
            no_cached_probe()
            self.start_active_session()
            status, _ = self.request_json(
                "POST", "/api/librarian/dismiss",
                {"topic": "the frogged sleeve"})
            self.assertEqual(status, 200)
            os.environ["FAKE_CLAUDE_REFLECTION"] = json.dumps(
                {"reflection": GOOD_ESSAY + "\n\nyou wrote \"i am done "
                                            "talking about the frogged "
                                            "sleeve\" and you left it "
                                            "there."},
                ensure_ascii=False)
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "keep the border"})
            self.assertEqual(status, 200, f"refine refused: {data}")
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "done",
                         "her own quoted words are not the librarian "
                         "returning to the topic")
        self.assertEqual(snap["rejected_drafts"], 0)
        sess = json.loads(self.session_path().read_text(encoding="utf-8"))
        self.assertIn("i am done talking about the frogged sleeve",
                      sess["draft"],
                      "and her sentence rides through verbatim (law 4)")

    # -- 14. CJK text round-trips verbatim -------------------------------------

    def test_cjk_chat_text_rides_verbatim_everywhere(self):
        self.seed_store()
        log = self.tmp / "claude-log.json"
        text = "纺车转动了，线也稳了"
        with fake_claude_env(log, extra=self.refine_env()):
            no_cached_probe()
            self.start_active_session()
            os.environ["FAKE_CLAUDE_REFLECTION_ECHO"] = "1"
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": text})
            self.assertEqual(status, 200, f"refine refused: {data}")
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "done", f"errored: {snap}")
        rec = json.loads(log.read_text(encoding="utf-8"))
        self.assertIn(text, rec["stdin"],
                      "her exact characters ride the recorded stdin — "
                      "ensure_ascii=False, never \\u escapes")
        raw = self.session_path().read_bytes()
        self.assertIn(text.encode("utf-8"), raw,
                      "session.json holds her bytes verbatim")
        sess = json.loads(raw.decode("utf-8"))
        # ⛔ 26.995-12 (D-13): `self.assertIn(text, sess["coda"])` stood
        # under this line. THE EVIDENCE MOVED TO THE DRAFT — it was not
        # deleted — and the draft assertion below is what carries it.
        self.assertIn(text, sess["draft"],
                      "the echoed draft quotes her CJK verbatim (D-07)")
        self.assertNotIn("coda", sess,
                         "her characters survive in the writing itself, "
                         "not in a field beside it")
        self.assertEqual(sess["chat"][0]["text"], text)

    # -- 15. the refine busy gate ----------------------------------------------

    def test_refine_busy_gate(self):
        self.seed_store()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.refine_env()):
            no_cached_probe()
            self.start_active_session()
            os.environ["FAKE_CLAUDE_REFLECTION_ECHO"] = "1"
            os.environ["FAKE_CLAUDE_SLOW"] = "0.5"
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "one thread"})
            self.assertEqual(status, 200, f"refine refused: {data}")
            self.assertIs(data["running"], True)
            status, data = self.request_json(
                "POST", "/api/librarian/refine", {"text": "another"})
            self.assertEqual(status, 400, "one turn at a time")
            self.assertEqual(data["error"], server.LIBRARIAN_BUSY_MSG)
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "done")
        sess = json.loads(self.session_path().read_text(encoding="utf-8"))
        self.assertEqual(len(sess["chat"]), 2,
                         "the refused second POST persisted nothing")

    # ---- 26.7-04: the three-path close (behaviors 16-21) --------------------

    def close(self, outcome):
        return self.request_json(
            "POST", "/api/librarian/session/close", {"outcome": outcome})

    def books(self):
        p = self.library / "librarian" / "books.json"
        if not p.exists():
            return None
        return json.loads(p.read_text(encoding="utf-8"))["books"]

    def insights(self):
        p = self.library / "librarian" / "insights.json"
        if not p.exists():
            return []
        return json.loads(p.read_text(encoding="utf-8"))["proposals"]

    def seed_active_session(self, draft=None, stale_coda=_ABSENT, pool=None):
        """An ACTIVE consented session file seeded directly — the close
        route never calls the CLI, so no stub is needed to close.

        ⛔ 26.995-12 (D-13, RESEARCH Pitfall 9): `coda=` BECAME
        `stale_coda=` AND IT DEFAULTS TO ABSENT. The rename is not
        cosmetic. A harness that keeps producing a REMOVED field passes
        silently — the closed-properties flag lives on the WIRE SCHEMA, not
        on the validator, and the validator reads named keys and ignores
        strangers — so a fixture still spelling `coda=` after this change
        would prove nothing at all while looking like coverage.

        Passing `stale_coda=` writes the key into the session document ON
        PURPOSE: it is the PRE-CHANGE-SHAPED artefact, and it is the arm
        that makes the label-absent assertion a test OF THE BODY rather
        than of the fixture. Against the tree before this change that arm
        goes RED; nothing else could tell the two apart."""
        doc = {
            "state": "active", "consented": True,
            "pool": pool if pool is not None else {"meta_rows": [],
                                                   "bodies": [],
                                                   "counts": {}},
            "draft": draft if draft is not None else GOOD_ESSAY,
            "question": None, "chat": [],
            "created_ms": 1}
        if stale_coda is not _ABSENT:
            doc["coda"] = stale_coda
        study_lib.save_session_file(self.library, doc)

    # -- 16. save = materialize -> inject -> promote ---------------------------

    def test_close_save_materializes_promotes_and_shelves(self):
        self.seed_store()
        self.seed_active_session(draft=WOVEN_ESSAY)
        before_items = set(json.loads(
            (self.library / "items.json").read_text(
                encoding="utf-8"))["items"])
        status, data = self.close("save")
        self.assertEqual(status, 200, f"save refused: {data}")
        self.assertIs(data["saved"], True)
        book_id = data["book_id"]
        # ONE new store item, source "librarian", never obsidian-vault
        store = json.loads((self.library / "items.json").read_text(
            encoding="utf-8"))
        new_ids = set(store["items"]) - before_items
        self.assertEqual(new_ids, {book_id},
                         "save mints exactly one new item")
        item = store["items"][book_id]
        self.assertEqual(item["source"], "librarian",
                         "the materialized item is never obsidian-vault")
        # the title is the draft's first heading
        self.assertEqual(item["title"], "the thread")
        self.assertEqual(data["title"], "the thread")
        # the snapshot holds the essay, and what she added survives INSIDE it
        snapshot = (self.library / item["library_path"]).read_text(
            encoding="utf-8")
        self.assertIn("the loom finally clicked", snapshot)
        # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13. THIS LINE READ
        # `self.assertIn("## from our conversation", snapshot)`, AND IT WAS
        # CORRECT WHEN IT WAS WRITTEN: it pinned real shipped behaviour — the
        # room appended that heading, byte-identical, to every revised sitting
        # it saved. The INVERSION is the point, not a repair.
        #
        # HER RULING, IN HER OWN TERMS: the label goes; the librarian weaves
        # what she added into the writing itself, so her addition survives in
        # HER words rather than as the room's summary under a heading.
        #
        # ⚠ THE CREEP-BACK REASON, which is why the retired literal is spelled
        # out here rather than deleted: ONE MANDATED SHAPE IS ONE SHAPE TO
        # COPY, and a labelled footer appended by the room's OWN CODE was more
        # fixed than anything the librarian was producing. A later plan that
        # re-adds it meets this message instead of an empty diff.
        self.assertNotIn(
            "## from our conversation", snapshot,
            "the saved body carries NO labelled footer: the room appends "
            "no '## from our conversation' section to what it saves (D-13)")
        self.assertIn(
            "you added the border note.", snapshot,
            "what she added still survives the save — woven into the "
            "writing, in HER words, never summarised under a label")
        # books.json gained ONE kind:"reflection" book resolving to it
        books = self.books()
        self.assertEqual(len(books), 1)
        self.assertEqual(books[0]["id"], book_id)
        self.assertEqual(books[0]["kind"], "reflection")
        self.assertEqual(books[0]["title"], "the thread")
        self.assertEqual(books[0]["origin_path"], item["origin_path"])
        # the proposal was consumed by the promote — not left dangling
        self.assertFalse(any(p.get("id") == book_id
                             for p in self.insights()))
        # the shipped guard belt passes this exact shape: guardSurface
        # returns None iff state is surfaceable, trigger is false, and no
        # filter matches — asserted field-for-field here (the node shelf
        # suite drives StudyCore.guardSurface itself on the same shape).
        self.assertNotIn(item["state"], ("never_show", "retired"))
        self.assertIsNot(item.get("trigger"), True)
        # the session is discarded — complete, not held
        self.assertFalse(self.session_path().exists())

    # -- 16a. 26.995-12 (D-13): the label is gone from the PERSISTED BODY ------
    #
    # ⛔⛔ RESEARCH PITFALL 9, WHICH FIRED ON THIS EXECUTOR BEFORE IT WAS
    # WRITTEN DOWN HERE. The first form of this assertion was added to the
    # case above with the fixture's coda simply removed — and it went GREEN
    # against the tree BEFORE any code changed, because the label was absent
    # for the fixture's reason rather than the body's. A harness that stops
    # producing a removed field proves NOTHING; a harness that keeps
    # producing it proves everything, because the closed-properties flag
    # lives on the WIRE SCHEMA and never on the validator, which reads named
    # keys and ignores strangers.
    #
    # So this case runs BOTH arms and asserts the same thing of each:
    #   (a) COMPLIANT   — no `coda` key at all, the post-change shape;
    #   (b) NON-COMPLIANT — the key present and non-empty, the pre-change
    #       shape, deliberately still emitted.
    # If the body has no label under BOTH, the assertion is testing the body.
    # Arm (b) is THE ARM THAT SHOULD FAIL if the deletion were not real: it
    # is red on the pre-change tree, and its red is quoted in the plan's
    # summary.

    def test_the_saved_body_names_no_label_under_either_harness(self):
        arms = (("compliant — the key is not written at all", _ABSENT),
                ("non-compliant — the key is written anyway",
                 "you added the border note."))
        for label, stale in arms:
            with self.subTest(harness=label):
                self.setUp()
                try:
                    self.seed_store()
                    self.seed_active_session(draft=WOVEN_ESSAY,
                                             stale_coda=stale)
                    status, data = self.close("save")
                    self.assertEqual(status, 200, f"save refused: {data}")
                    store = json.loads(
                        (self.library / "items.json").read_text(
                            encoding="utf-8"))
                    item = store["items"][data["book_id"]]
                    body = (self.library / item["library_path"]).read_text(
                        encoding="utf-8")
                    # BY VALUE, on the persisted body — not on the fixture's
                    # output, and not on anything the room re-derives.
                    self.assertNotIn(
                        "## from our conversation", body,
                        "the persisted body carries no labelled footer — "
                        "and under arm (b) the stale key IS present, so "
                        "this can only be true of the BODY (D-13)")
                    self.assertNotIn(
                        "from our conversation", body,
                        "not the heading in any spelling either")
                    # the control, in the same case: a body that lost the
                    # label but also lost her words would pass the two
                    # assertions above just as happily.
                    self.assertIn(
                        "you added the border note.", body,
                        "her addition survives — from the DRAFT, which is "
                        "where the weaving put it")
                    self.assertIn("the loom finally clicked", body)
                finally:
                    self.tearDown()

    # -- 16a2. the same claim, driven from the PROVIDER end -------------------
    #
    # The case above plants the retired key in the session DOCUMENT. This one
    # plants it in the ANSWER — a stub that replies off-contract, exactly as
    # a real model that had not been told the field was gone would. It runs a
    # real generation, a real refine turn and a real save, then reads the
    # persisted body.
    #
    # ⛔ WITHOUT THE NON-COMPLIANT ARM THIS CASE WOULD PROVE NOTHING. The
    # closed-properties flag lives on the WIRE SCHEMA and never on
    # validate_reflection, which reads named keys and ignores strangers — so
    # a stub that merely stopped emitting the field would sail through a
    # deletion that had never happened.

    def test_the_persisted_body_names_no_label_under_either_provider(self):
        arms = (("compliant — the stub answers on contract", "0"),
                ("NON-COMPLIANT — the stub still emits the field", "1"))
        for label, stale in arms:
            with self.subTest(provider=label):
                self.setUp()
                try:
                    self.seed_store()
                    log = self.tmp / "claude-log.json"
                    with fake_claude_env(log, extra=self.refine_env()):
                        no_cached_probe()
                        self.start_active_session()
                        os.environ["FAKE_CLAUDE_REFLECTION_ECHO"] = "1"
                        os.environ[
                            "FAKE_CLAUDE_REFLECTION_STALE_CODA"] = stale
                        # ⛔⛔ THE ARM IS PROVED NON-VACUOUS BEFORE IT IS
                        # BELIEVED. The stub builder is called directly, with
                        # the toggle exactly as the turn below will see it,
                        # and its answer is asserted BY VALUE — otherwise
                        # "the body has no label under the non-compliant
                        # provider" would pass just as happily for a toggle
                        # that never fired, which is the whole failure this
                        # arm exists to rule out.
                        probe = smoke.stub_structured(json.dumps(
                            {"chat": [{"who": "user",
                                       "text": "add the bench"}]}))
                        if stale == "1":
                            self.assertIn(
                                "coda", probe,
                                "the NON-COMPLIANT arm must really answer "
                                "off-contract — a toggle that did nothing "
                                "would make this whole arm inert")
                            self.assertIn("add the bench", probe["coda"])
                        else:
                            self.assertNotIn(
                                "coda", probe,
                                "and the compliant arm really is on "
                                "contract, so the two arms differ")
                        status, data = self.request_json(
                            "POST", "/api/librarian/refine",
                            {"text": "add the bench"})
                        self.assertEqual(status, 200,
                                         f"refine refused: {data}")
                        snap, _ = self.wait_session()
                        self.assertEqual(snap["state"], "done",
                                         f"errored: {snap}")
                    sess = json.loads(
                        self.session_path().read_text(encoding="utf-8"))
                    # the off-contract field never reaches the document
                    self.assertNotIn(
                        "coda", sess,
                        "an answer that names the retired field does not "
                        "put it on disk — the validator drops the stranger")
                    # her words DID survive the turn, in the writing itself
                    self.assertIn(
                        "add the bench", sess["draft"],
                        "and what she added is IN the revised draft — the "
                        "weaving, which is what makes the deletion safe")
                    status, data = self.close("save")
                    self.assertEqual(status, 200, f"save refused: {data}")
                    store = json.loads(
                        (self.library / "items.json").read_text(
                            encoding="utf-8"))
                    item = store["items"][data["book_id"]]
                    body = (self.library / item["library_path"]).read_text(
                        encoding="utf-8")
                    self.assertNotIn(
                        "## from our conversation", body,
                        "the PERSISTED BODY carries no labelled footer — "
                        "asserted on the body, never on the fixture's "
                        "output, and true under BOTH providers (D-13)")
                    self.assertIn(
                        "add the bench", body,
                        "and her words are in the saved book, verbatim, "
                        "from the draft")
                finally:
                    self.tearDown()

    # -- 16b. law 9: nothing on her disk is rewritten --------------------------

    def test_a_reflection_saved_before_this_change_still_opens_and_renders(
            self):
        """⛔ LAW 9. A reflection saved BEFORE 26.995-12 keeps its labelled
        section forever, and that is correct rather than a leftover: the
        room never rewrites what is already written. Two vintages coexist in
        her library and this case is what says so out loud.

        Driven through the SHIPPED read path (`GET /lib/<id>`), not by
        reading the file beside it — an item that no longer opens is the
        failure this is guarding against, and only the route can see it."""
        self.seed_store()
        vintage = (WOVEN_ESSAY + "\n\n## from our conversation\n\n"
                   + "you asked for the border to stay.")
        with server.WRITE_LOCK:
            item = study_lib.add_generated_reflection(
                self.library, "the thread", vintage)
        status, body = self.request("GET", "/lib/" + item["id"])
        self.assertEqual(status, 200,
                         "a pre-change reflection still OPENS")
        text = body.decode("utf-8")
        self.assertIn("## from our conversation", text,
                      "its labelled section is still there, byte-for-byte "
                      "— nothing rewrote what was already on her disk")
        self.assertIn("you asked for the border to stay.", text)
        self.assertIn("the loom finally clicked", text)
        self.assertEqual(
            text, vintage,
            "the whole body renders byte-identical to what was saved")

    # -- 17. the deterministic refresh never wipes the saved book --------------

    def test_insights_refresh_after_save_keeps_book_unproposed(self):
        self.seed_store()
        self.seed_active_session()
        status, data = self.close("save")
        self.assertEqual(status, 200)
        book_id = data["book_id"]
        status, got = self.request_json("GET", "/api/librarian/insights")
        self.assertEqual(status, 200)
        # the shelved book survives the refresh untouched
        books = self.books()
        self.assertEqual([b["id"] for b in books], [book_id],
                         "the refresh never removes a promoted book")
        # and the shelved id is never re-proposed
        self.assertFalse(any(p.get("id") == book_id
                             for p in got["proposals"]),
                         "a shelved book is not a standing proposal")

    # -- 18. the pass path -----------------------------------------------------

    def test_close_pass_discards_shelves_nothing_stamps(self):
        self.seed_store()
        self.seed_active_session()
        before = json.loads((self.library / "items.json").read_text(
            encoding="utf-8"))
        status, data = self.close("pass")
        self.assertEqual(status, 200, f"pass refused: {data}")
        self.assertEqual(data["outcome"], "pass")
        self.assertNotIn("saved", data, "a pass saves nothing")
        self.assertFalse(self.session_path().exists(),
                         "pass discards the session file")
        self.assertIsNone(self.books(), "pass never writes books.json")
        after = json.loads((self.library / "items.json").read_text(
            encoding="utf-8"))
        self.assertEqual(set(after["items"]), set(before["items"]),
                         "pass mints no item")
        marker = self.meta_value("last_reflection_ms", _ABSENT)
        self.assertIsInstance(marker, int)
        self.assertNotIsInstance(marker, bool)

    # -- 19. completion-only stamp + the refused re-close ----------------------

    def test_double_close_refused_no_double_stamp_no_duplicate(self):
        self.seed_store()
        # a bad outcome refuses first, whatever the session state
        status, data = self.close("shelve")
        self.assertEqual(status, 400)
        self.assertIn("outcome", data["error"])
        # no session at all: refused plain-words, marker untouched
        status, data = self.close("save")
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], server.LIBRARIAN_NO_SESSION_MSG)
        self.assertIs(self.meta_value("last_reflection_ms", _ABSENT),
                      _ABSENT, "no close, no stamp")
        # one real save stamps once
        self.seed_active_session()
        status, data = self.close("save")
        self.assertEqual(status, 200)
        marker = self.meta_value("last_reflection_ms")
        self.assertIsInstance(marker, int)
        books_before = self.books()
        self.assertEqual(len(books_before), 1)
        # a second close is a refused no-op: same marker, same one book
        time.sleep(0.01)
        status, data = self.close("save")
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], server.LIBRARIAN_NO_SESSION_MSG)
        self.assertEqual(self.meta_value("last_reflection_ms"), marker,
                         "a refused close never re-stamps")
        self.assertEqual(self.books(), books_before,
                         "a refused close never duplicates a book")

    # -- 20. the close busy gate -----------------------------------------------

    def test_close_refused_while_a_job_runs(self):
        self.seed_store()
        self.seed_active_session()
        with server.LIBRARIAN_LOCK:
            server.LIBRARIAN_JOB.update(state="running")
        try:
            status, data = self.close("save")
        finally:
            with server.LIBRARIAN_LOCK:
                server.LIBRARIAN_JOB.update(state="idle")
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], server.LIBRARIAN_BUSY_MSG)
        self.assertTrue(self.session_path().exists(),
                        "a refused close leaves the session in place")

    # -- 21. the one-lock-hold + only-writer source pins -----------------------

    def test_inject_promote_share_one_lock_hold_source_pin(self):
        src = (_REPO_ROOT / "server.py").read_text(encoding="utf-8")
        start = src.index("def handle_librarian_session_close(")
        end = src.index("\n    def ", start + 1)
        handler = src[start:end]
        self.assertEqual(handler.count("with _INSIGHTS_LOCK:"), 1,
                         "inject + promote share exactly ONE lock hold")
        lock_at = handler.index("with _INSIGHTS_LOCK:")
        held = handler[lock_at:]
        self.assertIn("_save_insights(", held,
                      "the inject lives inside the one hold")
        self.assertIn("_promote_proposals_locked(", held,
                      "the promote lives inside the one hold")
        # the promote docstring names its second validated user-action
        # caller — the session save — without weakening the invariant
        doc_at = src.index("def _promote_proposals(")
        doc = src[doc_at:src.index("def _promote_proposals_locked(")]
        self.assertIn("ONLY writer", doc)
        self.assertIn("session save", doc)
        # only-writer, mechanically: _save_books has exactly one call
        # site (inside the locked promote core) beside its definition
        calls = src.count("_save_books(")
        self.assertEqual(calls, 2,
                         "books.json keeps exactly one writer call site")

    # ---- 26.7-05: the D-03 offer state machine (behaviors 22-27) -------------

    def seed_held_session(self, state="active"):
        """A prior sitting's conversation, held whole in session.json —
        the shape a step-away leaves behind (state 'active'; 'held' is
        the equivalent hand-named variant)."""
        doc = {
            "state": state, "consented": True,
            "pool": {"meta_rows": [{"id": "e" * 16}], "bodies": [],
                     "counts": {"rows": 1}},
            "draft": "## the held page\n\nan earlier sitting's words, "
                     "kept whole for her answer.",
            "coda": "you added the border note.",
            "question": None,
            "chat": [{"who": "user", "text": "add the bench"},
                     {"who": "librarian", "text": "the bench is in."}],
            "created_ms": 7,
        }
        study_lib.save_session_file(self.library, doc)
        return doc

    def start_beat(self):
        return self.request_json(
            "GET", "/api/librarian/session?beat=start")

    # -- 22. the offer is spent AT render; two opens never both offer ----------

    def test_offer_spent_at_render_two_opens_never_both(self):
        self.seed_store(blessed_bodies=0, unseen_rows=0)
        self.seed_held_session()
        # the first start beat: the one offer — spent atomically BEFORE
        # the answer left the server (Pitfall 7)
        status, data = self.start_beat()
        self.assertEqual(status, 200)
        self.assertIs(data["offer"], True)
        sess = json.loads(self.session_path().read_text(encoding="utf-8"))
        self.assertEqual(sess["state"], "offered",
                         "the offered transition persists AT offer "
                         "render — on disk before the client paints")
        # crash-and-retap: the second start beat finds the spent offer
        # and answers NO offer (the one-offer proof case)
        status, data = self.start_beat()
        self.assertEqual(status, 200)
        self.assertIs(data["offer"], False)
        self.assertEqual(
            json.loads(self.session_path().read_text(
                encoding="utf-8"))["state"],
            "offered", "a second beat never re-spends or resets")
        # ... and the fresh beat discards the spent offer silently and
        # proceeds (an empty pool here: the D-10 warm answer, held false)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.reflection_env()):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
        self.assertEqual(status, 200)
        self.assertIs(data["nothing_new"], True)
        self.assertIs(data["held"], False,
                      "a spent offer is no longer held")
        self.assertFalse(self.session_path().exists(),
                         "the tap after an unanswered offer proceeds "
                         "fresh and discards — never a second ask")
        self.assertFalse(log.exists(), "an empty pool still spawns "
                                       "no subprocess")

    # -- 23. resume answers the whole session and returns to active ------------

    def test_resume_restores_session_and_returns_to_active(self):
        self.seed_store(blessed_bodies=0, unseen_rows=0)
        before = self.seed_held_session()
        status, data = self.start_beat()
        self.assertEqual(status, 200)
        self.assertIs(data["offer"], True)
        # resume: the stored session comes back whole, state → active
        status, data = self.request_json(
            "POST", "/api/librarian/session", {"intent": "resume"})
        self.assertEqual(status, 200, f"resume refused: {data}")
        self.assertIs(data["resumed"], True)
        self.assertEqual(data["state"], "active")
        self.assertEqual(data["pool"], before["pool"],
                         "the pool rides the resume answer intact")
        self.assertEqual(data["draft"], before["draft"])
        # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13. This read
        # `self.assertEqual(data["coda"], before["coda"])`. THE NEW TRUTH:
        # the resume readout carries no coda. ⚠ `seed_held_session` STILL
        # WRITES ONE — it is a PRE-CHANGE sitting on purpose — so this is
        # true of the route and not of the fixture, and the loop below
        # proves the stale key survived on disk untouched (law 9).
        self.assertNotIn("coda", data,
                         "a sitting held from before this change resumes "
                         "with no coda in the answer")
        self.assertEqual(data["chat"], before["chat"],
                         "the transcript rides the resume answer intact")
        self.assertIs(data["consented"], True)
        sess = json.loads(self.session_path().read_text(encoding="utf-8"))
        self.assertEqual(sess["state"], "active",
                         "resume returns the file to active")
        # ⛔ `coda` AND `question` STAY IN THIS LOOP DELIBERATELY (D-13,
        # law 9): both are retired keys, both are on this pre-change
        # document, and resume must leave them byte-identical rather than
        # migrate or strip them. The room never rewrites what is already
        # written — it just stops reading it.
        for key in ("pool", "draft", "coda", "question", "chat",
                    "created_ms", "consented"):
            self.assertEqual(sess[key], before[key],
                             f"resume keeps {key} byte-identical")
        # this offer is answered: an immediate repeat resume is refused
        status, data = self.request_json(
            "POST", "/api/librarian/session", {"intent": "resume"})
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], server.LIBRARIAN_NO_SESSION_MSG)
        # and a refine turn works again on the resumed file's gate shape
        # (state active + a recorded consent bool — asserted, not run)
        self.assertIsInstance(sess["consented"], bool)

    # -- 24. decline is final and leads into the fresh beat --------------------

    def test_decline_discards_and_leads_into_the_fresh_beat(self):
        self.seed_store(blessed_bodies=2, unseen_rows=1)
        self.seed_held_session()
        status, data = self.start_beat()
        self.assertEqual(status, 200)
        self.assertIs(data["offer"], True)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.reflection_env()):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/session",
                {"consent": True, "intent": "discard"})
            self.assertEqual(status, 200, f"decline refused: {data}")
            self.assertIs(data["running"], True,
                          "the decline leads into the normal fresh beat")
            snap, _ = self.wait_session()
        self.assertEqual(snap["state"], "done", f"errored: {snap}")
        sess = json.loads(self.session_path().read_text(encoding="utf-8"))
        self.assertEqual(sess["draft"], GOOD_ESSAY,
                         "a NEW session replaced the discarded one")
        self.assertEqual(sess["chat"], [],
                         "the declined conversation is gone for good")
        # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13: this read
        # `self.assertIsNone(sess["coda"])`. The NEW document has no such
        # key — and the discarded one DID (seed_held_session writes it), so
        # the absence here is also proof the replacement is genuinely new.
        self.assertNotIn("coda", sess)

    # -- 25. nothing-new held discipline ---------------------------------------

    def test_nothing_new_held_only_before_the_offer_is_spent(self):
        newest = self.seed_store(blessed_bodies=2, unseen_rows=1)
        store = study_lib.load_store(self.library)
        store["meta"]["last_reflection_ms"] = newest
        study_lib.save_store(self.library, store)
        self.seed_held_session()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra=self.reflection_env()):
            no_cached_probe()
            # unspent: the nothing-new answer carries the held fact and
            # the file survives (a fresh beat only discards SPENT offers)
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200)
            self.assertIs(data["nothing_new"], True)
            self.assertIs(data["held"], True,
                          "an unspent held draft rides the warm answer")
            self.assertTrue(self.session_path().exists())
            # spend the offer, leave it unanswered
            status, data = self.start_beat()
            self.assertEqual(status, 200)
            self.assertIs(data["offer"], True)
            # spent: held false, and the fresh beat discards the file
            status, data = self.request_json(
                "POST", "/api/librarian/session", {"consent": True})
            self.assertEqual(status, 200)
            self.assertIs(data["nothing_new"], True)
            self.assertIs(data["held"], False,
                          "held rides only while the offer is unspent")
            self.assertFalse(self.session_path().exists())
            self.assertFalse(log.exists(), "zero generation throughout")

    # -- 26. intent fail-closed + resume needs a spent offer -------------------

    def test_intent_fail_closed_and_resume_needs_a_spent_offer(self):
        self.seed_store()
        for body in ({"intent": "continue"}, {"intent": 1},
                     {"intent": True}, {"consent": True, "intent": "keep"}):
            status, data = self.request_json(
                "POST", "/api/librarian/session", body)
            self.assertEqual(status, 400, f"{body} must be refused")
            self.assertIn('intent must be "resume" or "discard"',
                          data["error"])
        # resume with no file at all: the plain no-session refusal
        status, data = self.request_json(
            "POST", "/api/librarian/session", {"intent": "resume"})
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], server.LIBRARIAN_NO_SESSION_MSG)
        # resume on an UNSPENT (active) file is refused too — the start
        # beat's offered transition is the only door into a resume
        self.seed_held_session()
        status, data = self.request_json(
            "POST", "/api/librarian/session", {"intent": "resume"})
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], server.LIBRARIAN_NO_SESSION_MSG)
        sess = json.loads(self.session_path().read_text(encoding="utf-8"))
        self.assertEqual(sess["state"], "active",
                         "a refused resume touches nothing")
        _, snap = self.request_json("GET", "/api/librarian/progress")
        self.assertEqual(snap["state"], "idle",
                         "intent handling never touches the job")

    # -- 27. the offered write precedes the response (source pin) --------------

    def test_offer_transition_write_precedes_the_answer_source_pin(self):
        src = (_REPO_ROOT / "server.py").read_text(encoding="utf-8")
        start = src.index("def handle_librarian_session_read(")
        end = src.index("\n    def ", start + 1)
        handler = src[start:end]
        beat_at = handler.index('"start"')
        save_at = handler.index("save_session_file", beat_at)
        resp_at = handler.index("json_response", beat_at)
        self.assertLess(save_at, resp_at,
                        "the offered transition's atomic write precedes "
                        "any response in the handler (Pitfall 7: the "
                        "offer is spent BEFORE it can render)")
        self.assertIn("_SESSION_LOCK", handler[:save_at],
                      "the transition persists under the session lock")


class WalkStagePins(unittest.TestCase):
    """26.8-01 (D-01), RE-POINTED 26.95-32 (D-08): the blessing walk is a
    CLIENT beat between the re-pull and the consent card — pinned
    statically over app.js the way tests 21/27 pin server.py source. The
    walk gates the ONE POST (walkDone), resume skips it, a visit with
    nothing to offer resolves silently, and no walk function reaches a
    route, writes job state or POSTs anything itself.

    ⇄ THIS CLASS IS THE PYTHON MIRROR OF tests/test_session_flow.cjs's
    group 7, AND THE OVERLAP IS DELIBERATE. Four of the five cases below
    assert a property that suite also asserts (28 ⇄ (a), 29 ⇄ (d),
    30 ⇄ (e), 32 ⇄ (h)). ⛔ NEITHER IS A DUPLICATE TO BE TIDIED AWAY: two
    instruments on one property is how this project survives a defect
    landing inside a measuring instrument, and the node sweep does not run
    this file — which is exactly why the 26.95-32 re-point reached the
    .cjs side a full wave before it reached this one. If you change one,
    change both, and say in each that you did.

    ⚠ TWO CLAIMS THIS DOCSTRING USED TO MAKE HAVE BEEN CORRECTED RATHER
    THAN LEFT TO ROT. It said "an empty pool" — there is no pool here any
    more; the stage asks a silent probe whether an Offer is likely. And it
    said "the zero-AI construction (D-07)" — see case 31, which is still a
    real gate but no longer proves that."""

    WALK_FNS = ("sessionWalkStage", "sessionWalkSkip", "sessionWalkBegin",
                "sessionWalkClose", "sessionPaintWalkOpen",
                "sessionPaintWalkClose")

    @classmethod
    def setUpClass(cls):
        cls.app = (_REPO_ROOT / "app.js").read_text(encoding="utf-8")

    def fn(self, name):
        src = self.app
        start = src.index("function " + name + "(")
        end = src.find("\n  function ", start + 1)
        return src[start:end if end != -1 else len(src)]

    # -- 28. walkDone gates the ONE POST ----------------------------------

    def test_walk_latch_gates_the_one_post(self):
        poster = self.fn("sessionMaybePost")
        repull_at = poster.index("if (!SESSION.repullDone) { return; }")
        walk_at = poster.index("if (!SESSION.walkDone) "
                               "{ sessionWalkStage(); return; }")
        posted_at = poster.index("SESSION.posted = true;")
        self.assertLess(repull_at, walk_at,
                        "the walk guard sits after the repullDone guard")
        self.assertLess(walk_at, posted_at,
                        "sessionMaybePost returns without POSTing while "
                        "walkDone is false — the latch precedes the one "
                        "posted flip")
        opener = self.fn("startReflectionSession")
        for reset in ("SESSION.walkDone = false;",
                      "SESSION.walkActive = false;",
                      "SESSION.walkBlessed = [];"):
            self.assertIn(reset, opener,
                          f"the session reset block must carry {reset}")

    # -- 29. resume skips the walk ----------------------------------------

    def test_resume_skips_the_walk(self):
        resume = self.fn("sessionOfferResume")
        self.assertIn("SESSION.walkDone = true;", resume,
                      "the resume door opens the walk latch — a resumed "
                      "session's held pool is frozen (26.7-05)")
        stage = self.fn("sessionWalkStage")
        held_at = stage.index("SESSION.heldIntent === 'resume'")
        fetch_at = stage.index("apiGet('/api/items')")
        self.assertLess(held_at, fetch_at,
                        "the stage's own resume check precedes the items "
                        "read — no walk chrome on the resume path")

    # -- 30. NOTHING TO OFFER resolves silently ---------------------------
    #
    # ⚠ RE-POINTED 26.95-32 (D-08), AND THE SUBJECT IS UNCHANGED. What this
    # case is for — the latch must never wedge the session, whatever the
    # stage learns — is exactly what it was for at 26.8-01. Only how the
    # stage learns there is nothing to walk her through has moved: it used
    # to read a list of ids and skip on `!ids.length`, and it now asks the
    # pure, silent probe StudyCore.offerLikely and skips on `!likely`.
    # ⛔ RE-POINTED, NEVER DELETED. Deleting an assertion to make a suite
    #   green is the one thing this project treats as unforgivable.
    # ⚠ The method was RENAMED with the subject: "empty pool" described a
    #   pool that no longer exists, and a false name prints on every run.
    # ⇄ tests/test_session_flow.cjs group 7 (e) asserts this same property
    #   over the same two arms. Two instruments, one property — see the
    #   class docstring before removing either.

    def test_nothing_to_offer_resolves_silently(self):
        stage = self.fn("sessionWalkStage")
        self.assertIn("if (!likely) { sessionWalkSkip(); return; }",
                      stage,
                      "a visit with nothing to offer takes the silent-skip "
                      "door (26.95-32, D-08)")
        self.assertIn("if (!res.ok) { sessionWalkSkip(); return; }",
                      stage,
                      "a read miss takes that same silent-skip door — this "
                      "arm is byte-identical to what shipped")
        skip = self.fn("sessionWalkSkip")
        self.assertIn("SESSION.walkDone = true;", skip,
                      "the silent resolve opens the latch")
        self.assertIn("sessionMaybePost();", skip,
                      "the silent resolve proceeds to the gate")
        self.assertNotIn("innerHTML", skip,
                         "the silent resolve renders no chrome of its "
                         "own — silence at zero (law 3)")

    # -- 31. no route, no job state, no POST inside the walk functions ----
    #
    # ⚠⚠ THE ASSERTIONS BELOW ARE UNCHANGED AND STILL MEANINGFUL — WHAT THEY
    # SCAN FOR IS BYTE-IDENTICAL. Their STATED REASON was false and is
    # corrected here and in each message (26.95-32, D-08). This case was
    # headed "zero AI reachable from the walk functions" and its three
    # messages cited D-07's zero-AI construction. IT DOES NOT PROVE THAT ANY
    # MORE. D-08 re-pointed the beat: the door this walk announces
    # opens the Offer, and an Offer is computed with the librarian's help —
    # one level down, through the one shared door entry. That is WHY this
    # scan over these six functions still passes, and a still-green scan is
    # a fact about the instrument, not evidence of zero AI.
    #
    # ⛔ IT IS KEPT, NOT RELAXED, BECAUSE WHAT IT STILL PROVES IS WORTH
    # PROVING: no walk function reaches a route, writes job state, or POSTs
    # anything ITSELF. Verdicts persist through the shipped handler alone,
    # and the reach happens at the one entry rather than scattered here.
    #
    # ⚠ app.js DELIBERATELY DOES NOT SPELL THE ROUTE'S PATH inside its walk
    # functions, and says so at that seam — this scan matches on their text,
    # so a prohibition that quoted the thing it is about would redden its
    # own gate. Do not "helpfully" write the path in there.
    # ⇄ tests/test_session_flow.cjs group 7 (f) carries the same scan and
    #   the same correction in its group header.

    def test_walk_functions_reach_no_librarian_route_or_job(self):
        for name in self.WALK_FNS:
            body = self.fn(name)
            self.assertNotIn("/api/librarian", body,
                             f"{name} must reach no librarian route "
                             "ITSELF — the reach happens at the one shared "
                             "door entry, never scattered here (D-08)")
            self.assertNotIn("LIBRARIAN_JOB", body,
                             f"{name} must write no job state itself "
                             "(D-08)")
            self.assertNotIn("apiPost(", body,
                             f"{name} must POST nothing itself — walk "
                             "verdicts persist through the SHIPPED "
                             "handleBlessingTap alone (D-08)")

    # -- 32. the chassis is re-hosted, never re-implemented ---------------
    #
    # ⚠ RE-POINTED 26.95-32 (D-08), AND THE RULE BEING PINNED DID NOT
    # CHANGE: RE-HOST, NEVER RE-IMPLEMENT. At 26.8-01 the begin door capped
    # the sitting through blessBatch and entered the shipped desk-stack
    # loop. The walk no longer deals blessing cards at all — it opens THE
    # OFFER through the ONE entry all three doors tap, carrying its OWN
    # named quiet branch, because the three doors genuinely differ and the
    # walk is the one that must resolve its latch and move the session on
    # (W-8). What the case protects is what it always protected: this door
    # hosts a shipped surface and builds no chrome of its own.
    #
    # ⚠⚠ TWO ASSERTIONS MOVED HERE, NOT ONE, AND THE SECOND WAS INVISIBLE
    # TO THE SWEEP. unittest stops a method at its first failed assertion,
    # so `blessBatch(SESSION.walkIds)` failed and `deskSpreadPresent(` was
    # never reached — the run reported one failure where there were two.
    # Worth remembering the next time a Python case is re-pointed from a
    # failure list rather than from reading the whole method.
    #
    # ⛔ SESSION.walkIds is RETIRED-BUT-RETAINED (26.95-30 forbids deleting
    # it) and is simply no longer read by this door. Its absence from the
    # assertions below is the retirement, not an oversight.
    # ⇄ tests/test_session_flow.cjs group 7 (h) asserts this same property.

    def test_walk_rehosts_the_shipped_chassis(self):
        begin = self.fn("sessionWalkBegin")
        self.assertIn("reachDoorOpen('walk', sessionWalkSkip)", begin,
                      "the begin door opens the Offer through the ONE "
                      "shared door entry, carrying the walk's own named "
                      "quiet branch (26.95-32, D-08 / W-8)")
        self.assertNotIn("innerHTML", begin,
                         "the begin door builds no chrome of its own — "
                         "re-host, never re-implement: the host owns the "
                         "page it was given (D-08)")
        for name in ("handleBlessingTap", "renderBlessingRibbon"):
            self.assertNotIn("SESSION.walk", self.fn(name),
                             f"{name} stays byte-clean of walk state — "
                             "one verdict grammar app-wide (D-08)")


class QuestionFooterRemovedPins(unittest.TestCase):
    """26.995-06 task 3 (D-05): the footer is gone from the PAGE, pinned
    over app.js source the way WalkStagePins above pins the walk.

    ⚠ A SOURCE PIN IS GREEN THE MOMENT IT IS WRITTEN, which is exactly why
    each assertion below carries its CREEP-BACK REASON in the message: the
    thing it guards is not "does this string exist" but "did somebody put
    the footer back without meaning to". Driven by mutation, never by its
    own first run."""

    @classmethod
    def setUpClass(cls):
        cls.app = (_REPO_ROOT / "app.js").read_text(encoding="utf-8")
        cls.css = (_REPO_ROOT / "tokens.css").read_text(encoding="utf-8")

    def test_no_question_render_path_survives_in_app_js(self):
        self.assertNotIn("session-question", self.app,
                         "the question PARAGRAPH is back in the reader. "
                         "D-05 moved the question INTO the writing — a "
                         "paragraph under the essay is the footer this "
                         "phase removed, and a render with no writer "
                         "paints an empty line forever")
        self.assertNotIn("SESSION.question", self.app,
                         "a question slice is back on the reader's state. "
                         "A half-removed field leaves a key nothing writes "
                         "and something still reads — the shape of a "
                         "defect that only appears on the third refine")
        # ⛔⛔ THIS ASSERTION EXISTS BECAUSE THE MUTATION DRILL FOUND THE
        # ONE ABOVE INSUFFICIENT. Mutant A2 put `question: null,` back into
        # the SESSION literal and SURVIVED: a declared slot spells itself
        # `question:`, never `SESSION.question`, so the reference check
        # walks straight past the declaration. The slot is where the
        # half-removal starts.
        # ⚠ COMMENT LINES ARE STRIPPED FIRST, and that is not a
        # convenience: the removal's own note inside this literal quotes
        # the deleted slot by name, so a raw substring check would fail on
        # the very comment explaining the deletion — a check pinning the
        # wrong thing, caught on this drill's first run.
        start = self.app.index("var SESSION = {")
        literal = "\n".join(
            line for line in
            self.app[start:self.app.index("\n  };", start)].splitlines()
            if not line.strip().startswith("//"))
        self.assertNotIn("question:", literal,
                         "a question SLOT is declared on SESSION again. "
                         "Nothing writes it and nothing may read it, so it "
                         "is a permanent null wearing a feature's name — "
                         "and the first reader to trust it paints a footer "
                         "that never fills")
        self.assertIn("draft:", literal,
                      "THE UNMUTATED CONTROL for the slice above: the "
                      "literal really was found and really does hold "
                      "slots, so the absence means something")
        self.assertNotIn("data.question", self.app,
                         "the client reads a question off a readout that "
                         "no longer sends one — it would be null forever, "
                         "which is a dead branch pretending to be a "
                         "feature")

    def test_the_dead_style_went_with_the_render(self):
        self.assertNotIn("session-question", self.css,
                         "the paragraph's style outlived its only render — "
                         "a rule nothing can match is how a deleted "
                         "surface looks alive to the next reader")

    def test_the_paper_still_paints_the_draft(self):
        """⛔ THE UNMUTATED CONTROL for the three absences above. Without
        it every one of them passes against a reader whose reflection
        render was deleted wholesale."""
        self.assertIn("session-paper", self.app)
        self.assertIn("session-para", self.app)
        self.assertIn("SESSION.draft", self.app)
        self.assertIn("SESSION.name", self.app,
                      "and the reflection's NAME still rides the state — "
                      "26.995-05's one derivation, untouched here")


# ---------------------------------------------------------------------------
# 26.93-07 — THE MONEY GUARD, AS A CHECKER, AND THE DRILL OVER IT
# ---------------------------------------------------------------------------
#
# ⚠⚠ A GATE NEVER SEEN RED IS NOT EVIDENCE. What keeps this suite off the
# owner's real key is now a chain of five facts that hold at once, and every
# one of them is new code. Roughly thirty defects of this project's class have
# landed INSIDE the measuring instrument rather than in the code under test —
# a checker in a shell variable that never ran while three of four cases
# printed "RED, as required"; a harness that aborted at its first catch and
# reported one failure where there were four.
#
# So the chain lives in a FUNCTION that can be driven over in-memory copies
# with one thing wrong each, the unmutated controls are counted in the SAME
# run, the loop never exits early on a catch, and all three totals are asserted
# BY VALUE against the literals below.
#
# ⚠ THIS IS NOT A SECOND COPY OF `test_server_smoke.py`'s DRILL. That one
# judges a recorded REQUEST (what crossed the seam). This one judges the
# RESOLUTION (who would have answered, and with whose credential) — the fact
# that makes a session suite safe to run at all. Neither implies the other.

EXPECTED_MUTATIONS = 5
EXPECTED_CONTROLS = 2


def money_guard_violations(state):
    """Every claim "this suite cannot spend her money" rests on, as a list of
    failures. Empty means all of them held.

    `state` is a plain dict measured inside the seam, so the checker itself
    opens nothing and can be driven over fabricated copies."""
    bad = []
    home = state.get("home") or ""
    real = state.get("real_home") or ""
    if not home or home == real:
        bad.append("HOME was not swapped away from the real one — the real "
                   "keys file is in reach")
    keys = state.get("keys_path") or ""
    if not (keys and (keys == home or keys.startswith(home + os.sep))):
        bad.append("the keys file resolves outside this suite's own temp "
                   "home")
    if not state.get("transport_is_fake"):
        bad.append("the real transport is installed — a call would open a "
                   "socket")
    if state.get("cloud_key_names_set"):
        bad.append("a cloud key name survived into the environment, so a "
                   "developer shell could steer this run")
    for tier, fill in sorted((state.get("fills") or {}).items()):
        if tuple(fill) != tuple(L.LOCAL_FILL):
            bad.append("tier " + tier + " resolved to something other than "
                       "her own machine")
    return bad


def drill_measure():
    """The REAL state inside the seam, measured once. Hermetic and free — it
    resolves routing and reads two module attributes; it sends nothing."""
    tmp = tempfile.mkdtemp(prefix="study-room-session-drill-")
    log = Path(tmp) / "drill-log.json"
    try:
        with fake_claude_env(log):
            routing = L.resolve_routing(L.load_settings())
            return {
                "home": os.path.realpath(os.environ["HOME"]),
                "real_home": os.path.realpath(REAL_HOME),
                "keys_path": os.path.realpath(str(L.keys_path())),
                "transport_is_fake": L._transport is stub_transport,
                # ⚠ A BOOLEAN, NEVER A VALUE. No assertion, message or print
                # in this file may carry a credential; presence is the whole
                # of what is measured.
                "cloud_key_names_set": any(
                    bool((os.environ.get(name) or "").strip())
                    for name in L.KEY_ENV_NAMES.values()),
                "fills": dict((tier, list(routing.fills[tier]))
                              for tier in L.TIERS),
            }
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def run_drill():
    real = drill_measure()

    controls = 0
    # Control 1 — the REAL measured state, judged clean.
    if money_guard_violations(real) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the real measured state")
    # Control 2 — an independently fabricated clean copy. Two controls that
    # were the same measurement twice would only prove it is deterministic.
    # ⚠ ASSEMBLED, NEVER TYPED WHOLE — the same discipline
    # `tests/test_stage_public.py` uses for its planted shapes. This file is
    # TRACKED, so it stages, and the publish gate denies every
    # home-directory-shaped path on sight without being able to tell a
    # placeholder from the owner's real one. Written contiguously this line
    # failed the gate, and it did so silently from 26.93-07 until 26.94-10,
    # because no suite ever staged the real tree. Keep it assembled.
    NOBODYS_HOME = "/" + "Users" + "/" + "nobody"
    clean = {"home": "/tmp/study-room-drill-home",
             "real_home": NOBODYS_HOME,
             "keys_path": "/tmp/study-room-drill-home/" +
                          study_lib.ROOM_CONFIG_DIR_NAME + "/keys.json",
             "transport_is_fake": True,
             "cloud_key_names_set": False,
             "fills": dict((tier, list(L.LOCAL_FILL)) for tier in L.TIERS)}
    if money_guard_violations(clean) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the fabricated clean copy")

    def mutate(**over):
        copy = dict(real)
        copy["fills"] = dict(real["fills"])
        copy.update(over)
        return copy

    # THE FIVE ARE THE FIVE WAYS THIS PARTICULAR MOVE REALISTICALLY GOES
    # WRONG, not five arbitrary edits. Each is what the suite looked like at
    # some point between 26.93-06 landing and this repair.
    cloud_fills = dict(real["fills"])
    cloud_fills["good-cloud"] = ["anthropic", "claude-opus-5"]
    mutations = [
        # ⚠ this one trips TWO findings (the swap and the containment), and
        # that is correct: they are not independent facts. One change, still.
        ("HOME is the real home", mutate(home=real["real_home"])),
        ("the keys file resolves outside the temp home",
         mutate(keys_path=os.path.join(
             real["real_home"], study_lib.ROOM_CONFIG_DIR_NAME,
             "keys.json"))),
        ("the real transport is installed", mutate(transport_is_fake=False)),
        ("a cloud key name survived", mutate(cloud_key_names_set=True)),
        ("a tier resolved to a company", mutate(fills=cloud_fills)),
    ]

    caught = 0
    for name, mutated in mutations:
        if money_guard_violations(mutated):
            caught += 1
        else:
            # ⚠ NEVER EXIT EARLY ON A CATCH. A harness that stopped at its
            # first miss once reported one failure where there were four.
            print("  DRILL MISS: " + name + " was not caught")
    return caught, len(mutations), controls


def main():
    suite = unittest.defaultTestLoader.loadTestsFromModule(
        sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=2).run(suite)

    caught, total, controls = run_drill()
    print("DRILL %d/%d mutations caught, %d controls green"
          % (caught, total, controls))

    # ⚠ THE LAST WORD: the real config directory is exactly as this suite
    # found it. It holds a real credential, and only `--setup`, run by the
    # owner, may create or change it.
    untouched = os.path.exists(REAL_ROOM_DIR) == REAL_ROOM_DIR_EXISTED
    if not untouched:
        print("REAL CONFIG DIRECTORY CHANGED — this suite must never do that")

    ok = (result.wasSuccessful()
          and caught == total == EXPECTED_MUTATIONS
          and controls == EXPECTED_CONTROLS
          and untouched)
    return 0 if ok else 1


if __name__ == "__main__":
    # ⚠ NOT `unittest.main()` ANY MORE, and the change is not cosmetic: the
    # drill and the real-config check have to run in the same process, after
    # the cases, and their results have to reach the exit code. `unittest.main`
    # calls sys.exit itself and would never come back. It also parses command
    # line options, which the counting sweep does not pass — the house
    # convention (see tests/test_startup_check.py) is a suite that parses none.
    sys.exit(main())
