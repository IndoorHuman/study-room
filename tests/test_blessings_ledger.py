#!/usr/bin/env python3
"""
The blessings-ledger suite (Phase 26.8, Plan 02 — SRM-04/SRM-09).

librarian/blessings.json is the walk's memory (D-11): one entry per
blessing — {item_id, ms, why, author} — the file the 26.8-04 notebook
reads. It joins the insights.json/books.json file family whole: fail-open
load (missing/unreadable/off-shape reads as empty), atomic write through
study_lib.atomic_write_bytes, its own small server lock, and deleting
librarian/ remains the factory reset.

Covered behavior families (26.8-02 Task 1 — written RED-FIRST, before
any ledger code exists):

  1. fail-open load     — load_blessings on a missing file returns the
                          empty {"blessings": []} wrapper; unreadable
                          bytes and off-shape documents (a list, a dict
                          whose "blessings" is not a list) also read as
                          empty; never raises (the _load_insights
                          posture).
  2. atomic round-trip  — save_blessings writes through
                          atomic_write_bytes (observed via a wrapping
                          patch), leaves no temp droppings beside the
                          target, and round-trips the entry shape
                          {item_id, ms, why, author} byte-honest
                          (ensure_ascii=False — CJK whys survive).
  3. fail-closed route  — POST /api/blessings drops an item_id absent
                          from the store snapshot and COUNTS it in the
                          response (the unknown_id_verdicts idiom:
                          membership is server-truth, counted out loud,
                          never silently); an author outside
                          user|librarian|default is refused 400; a why
                          over 280 chars is refused 400; an empty-after-
                          strip why is refused 400; ms is SERVER-stamped
                          (a client-supplied clock is ignored).
  4. origin gate        — a foreign Origin and the literal "null" Origin
                          are refused 403 BEFORE dispatch (the shipped
                          origin_allowed covers the new route by
                          construction — asserted, never re-implemented);
                          the room's own origin passes through.
  5. fail-open surface  — GET /api/blessings on a corrupt file answers
                          200 with the empty wrapper (the notebook's
                          read is never an error).
  6. factory reset      — deleting the librarian/ dir then loading reads
                          as empty (the D-05 visible-folder property).

Plus the entry-shape invariant: after the route's validation every
stored entry carries ms as an int, author as one of the three enum
strings, and why as a non-empty string of at most 280 chars.

Stdlib only (unittest + tempfile + http.client + threading) — the
zero-dependency law. Every test builds its library inside a fresh
TemporaryDirectory; the live store is never referenced.
"""
import http.client
import json
import shutil
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock
from pathlib import Path

# study_lib.py is a plain module at the repo root — same shim as the
# other python suites so the runner's cwd never matters.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import study_lib  # noqa: E402
import server  # noqa: E402  — importable proof: a plain import binds no socket

AUTHORS = ("user", "librarian", "default")
DEFAULT_WHY = "felt blessed after reading it"


class LedgerFileFamilyTest(unittest.TestCase):
    """The study_lib IO trio, called directly (the session-file idiom:
    pure path math, fail-open load, atomic save, caller owns the lock)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.library = Path(self._tmp.name) / "library"
        self.library.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def ledger_path(self):
        return self.library / "librarian" / "blessings.json"

    # -- 1. fail-open load ---------------------------------------------------

    def test_missing_file_reads_empty(self):
        self.assertEqual(study_lib.load_blessings(self.library),
                         {"blessings": []})

    def test_path_is_pure_math(self):
        # blessings_file_path never touches the filesystem — pure path
        # math under librarian/ (the session_file_path idiom).
        p = study_lib.blessings_file_path(self.library)
        self.assertEqual(Path(p), self.ledger_path())
        self.assertFalse(self.ledger_path().parent.exists(),
                         "path math must not create directories")

    def test_unreadable_bytes_read_empty(self):
        self.ledger_path().parent.mkdir(parents=True)
        self.ledger_path().write_bytes(b"\x80\x81 not json {{{")
        self.assertEqual(study_lib.load_blessings(self.library),
                         {"blessings": []})

    def test_off_shape_reads_empty(self):
        self.ledger_path().parent.mkdir(parents=True)
        for doc in ("[1, 2, 3]",
                    '{"blessings": "not-a-list"}',
                    '{"proposals": []}',
                    "42"):
            self.ledger_path().write_text(doc, encoding="utf-8")
            self.assertEqual(study_lib.load_blessings(self.library),
                             {"blessings": []},
                             f"off-shape doc must read empty: {doc!r}")

    # -- 2. atomic round-trip ------------------------------------------------

    def test_save_round_trips_entry_shape(self):
        entry = {"item_id": "a" * 16, "ms": 1753500000000,
                 "why": "它让我想起夏天 — the loom afternoons", "author": "user"}
        study_lib.save_blessings(self.library, [entry])
        self.assertEqual(study_lib.load_blessings(self.library),
                         {"blessings": [entry]})
        # CJK survives on disk un-escaped (ensure_ascii=False, the
        # family's byte-honest discipline).
        raw = self.ledger_path().read_text(encoding="utf-8")
        self.assertIn("它让我想起夏天", raw)

    def test_save_goes_through_atomic_write_bytes(self):
        entry = {"item_id": "b" * 16, "ms": 1, "why": DEFAULT_WHY,
                 "author": "default"}
        real = study_lib.atomic_write_bytes
        calls = []

        def spy(target, data):
            calls.append(str(target))
            return real(target, data)

        with mock.patch.object(study_lib, "atomic_write_bytes",
                               side_effect=spy):
            study_lib.save_blessings(self.library, [entry])
        self.assertEqual(calls, [str(self.ledger_path())],
                         "save_blessings must write through "
                         "atomic_write_bytes, to the fixed librarian/ "
                         "path only")
        # temp-then-rename leaves no droppings beside the target
        names = [p.name for p in self.ledger_path().parent.iterdir()]
        self.assertEqual(names, ["blessings.json"],
                         f"no temp files may survive the rename: {names}")

    # -- 6. factory reset ----------------------------------------------------

    def test_factory_reset(self):
        study_lib.save_blessings(self.library, [
            {"item_id": "c" * 16, "ms": 2, "why": DEFAULT_WHY,
             "author": "default"}])
        self.assertEqual(
            len(study_lib.load_blessings(self.library)["blessings"]), 1)
        shutil.rmtree(self.library / "librarian")
        self.assertEqual(study_lib.load_blessings(self.library),
                         {"blessings": []})


class LedgerRouteTest(unittest.TestCase):
    """POST/GET /api/blessings against a real in-process server (the
    SessionFlowTest harness shape: ThreadingHTTPServer on an ephemeral
    port, temp library injected via create_server)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.library = Path(self._tmp.name) / "library"
        self.library.mkdir()
        self.httpd = server.create_server(self.library, 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(
            target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
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

    def seed_store(self):
        """Two known items — one blessed, one unseen — so membership
        checks run against a real store snapshot."""
        base = int(time.time() * 1000) - 3600 * 1000
        store = study_lib.new_store(self.library)
        for i, state in enumerate(("blessed", "unseen")):
            item_id = format(0xb000 + i, "016x")
            store["items"][item_id] = {
                "id": item_id, "content_hash": item_id * 4,
                "source": "folder-drop",
                "origin_path": f"/src/loom/thing-{i}.md",
                "library_path": f"items/{item_id}.md", "type": "text",
                "title": f"thing-{i}.md",
                "created_ms": base + i, "saved_ms": base + i,
                "imported_ms": base + i, "last_opened_ms": None,
                "state": state, "resting_until_ms": None,
                "tags": [], "trigger": False, "year": 2023,
                "folder": "loom", "history": [],
            }
        study_lib.save_store(self.library, store)
        return format(0xb000, "016x"), format(0xb001, "016x")

    def ledger_path(self):
        return self.library / "librarian" / "blessings.json"

    def ledger_entries(self):
        return study_lib.load_blessings(self.library)["blessings"]

    # -- 3. fail-closed route -------------------------------------------------

    def test_post_appends_entry_and_get_serves_it(self):
        blessed_id, _ = self.seed_store()
        before_ms = int(time.time() * 1000)
        status, data = self.request_json(
            "POST", "/api/blessings",
            body={"item_id": blessed_id, "author": "user",
                  "why": "it warmed me"})
        self.assertEqual(status, 200)
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("recorded"), 1)
        self.assertEqual(data.get("dropped_unknown_id"), 0,
                         "the response names the drop count — the "
                         "unknown_id_verdicts idiom, fail-visible")
        entries = self.ledger_entries()
        self.assertEqual(len(entries), 1)
        entry = entries[0]
        self.assertEqual(entry["item_id"], blessed_id)
        self.assertEqual(entry["author"], "user")
        self.assertEqual(entry["why"], "it warmed me")
        self.assertIsInstance(entry["ms"], int)
        self.assertGreaterEqual(entry["ms"], before_ms)
        # GET hands the same entries back, fail-open shape
        status, got = self.request_json("GET", "/api/blessings")
        self.assertEqual(status, 200)
        self.assertTrue(got.get("ok"))
        self.assertEqual(got.get("blessings"), entries)

    def test_post_server_stamps_ms(self):
        blessed_id, _ = self.seed_store()
        status, data = self.request_json(
            "POST", "/api/blessings",
            body={"item_id": blessed_id, "author": "default",
                  "why": DEFAULT_WHY, "ms": 12345})
        self.assertEqual(status, 200)
        self.assertEqual(data.get("recorded"), 1)
        entry = self.ledger_entries()[0]
        self.assertNotEqual(entry["ms"], 12345,
                            "the client never supplies the clock — ms "
                            "is server-stamped")
        self.assertGreater(entry["ms"], 1753000000000)

    def test_post_unknown_id_dropped_and_counted(self):
        self.seed_store()
        status, data = self.request_json(
            "POST", "/api/blessings",
            body={"item_id": "f" * 16, "author": "user",
                  "why": "it warmed me"})
        self.assertEqual(status, 200,
                         "an unknown id is DROPPED and counted, never a "
                         "refusal (the verdict-drop idiom)")
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("recorded"), 0)
        self.assertEqual(data.get("dropped_unknown_id"), 1)
        self.assertEqual(self.ledger_entries(), [],
                         "a made-up id can never reach the ledger")

    def test_post_author_outside_enum_refused(self):
        blessed_id, _ = self.seed_store()
        for author in ("robot", "", None, 3, "USER"):
            status, data = self.request_json(
                "POST", "/api/blessings",
                body={"item_id": blessed_id, "author": author,
                      "why": "it warmed me"})
            self.assertEqual(status, 400,
                             f"author {author!r} must be refused "
                             "fail-closed")
            self.assertFalse(data.get("ok"))
        self.assertEqual(self.ledger_entries(), [])

    def test_post_why_overcap_refused(self):
        blessed_id, _ = self.seed_store()
        status, data = self.request_json(
            "POST", "/api/blessings",
            body={"item_id": blessed_id, "author": "user",
                  "why": "x" * 281})
        self.assertEqual(status, 400,
                         "a why over 280 chars is refused fail-closed — "
                         "the cap is end-to-end (maxlength 280 "
                         "client-side)")
        self.assertFalse(data.get("ok"))
        self.assertEqual(self.ledger_entries(), [])

    def test_post_empty_why_refused(self):
        blessed_id, _ = self.seed_store()
        for why in ("", "   ", None, 7):
            status, data = self.request_json(
                "POST", "/api/blessings",
                body={"item_id": blessed_id, "author": "user",
                      "why": why})
            self.assertEqual(status, 400,
                             f"why {why!r} must be refused fail-closed "
                             "(every stored entry carries a non-empty "
                             "why)")
            self.assertFalse(data.get("ok"))
        self.assertEqual(self.ledger_entries(), [])

    def test_post_non_string_item_id_refused(self):
        self.seed_store()
        for item_id in (None, 7, ["a"], {}):
            status, data = self.request_json(
                "POST", "/api/blessings",
                body={"item_id": item_id, "author": "user",
                      "why": "it warmed me"})
            self.assertEqual(status, 400,
                             f"item_id {item_id!r} must be refused "
                             "fail-closed")
            self.assertFalse(data.get("ok"))
        self.assertEqual(self.ledger_entries(), [])

    def test_entry_shape_invariant(self):
        blessed_id, unseen_id = self.seed_store()
        posts = [
            {"item_id": blessed_id, "author": "user",
             "why": "  it warmed me  "},
            {"item_id": unseen_id, "author": "default",
             "why": DEFAULT_WHY},
            {"item_id": blessed_id, "author": "librarian",
             "why": "a small bright thing kept"},
        ]
        for body in posts:
            status, data = self.request_json("POST", "/api/blessings",
                                             body=body)
            self.assertEqual(status, 200)
            self.assertEqual(data.get("recorded"), 1)
        entries = self.ledger_entries()
        self.assertEqual(len(entries), 3)
        for entry in entries:
            self.assertIsInstance(entry["ms"], int)
            self.assertIn(entry["author"], AUTHORS)
            self.assertIsInstance(entry["why"], str)
            self.assertTrue(entry["why"].strip(),
                            "why is non-empty after validation")
            self.assertEqual(entry["why"], entry["why"].strip(),
                             "why is stored stripped")
            self.assertLessEqual(len(entry["why"]), 280)

    # -- 4. origin gate --------------------------------------------------------

    def test_origin_gate_covers_the_route(self):
        blessed_id, _ = self.seed_store()
        for origin in ("http://evil.example", "null",
                       "http://attacker.localhost.evil"):
            status, data = self.request_json(
                "POST", "/api/blessings",
                body={"item_id": blessed_id, "author": "user",
                      "why": "it warmed me"},
                origin=origin)
            self.assertEqual(status, 403,
                             f"Origin {origin!r} must be refused BEFORE "
                             "dispatch (the shipped origin_allowed "
                             "covers the new route by construction)")
        self.assertEqual(self.ledger_entries(), [],
                         "a cross-origin POST must never touch the file")
        # the room's own origin passes through to the route
        status, data = self.request_json(
            "POST", "/api/blessings",
            body={"item_id": blessed_id, "author": "user",
                  "why": "it warmed me"},
            origin=f"http://localhost:{self.port}")
        self.assertEqual(status, 200)
        self.assertEqual(data.get("recorded"), 1)

    # -- 5. fail-open surface --------------------------------------------------

    def test_get_corrupt_file_answers_empty_wrapper(self):
        self.seed_store()
        self.ledger_path().parent.mkdir(parents=True, exist_ok=True)
        self.ledger_path().write_bytes(b"{torn mid-write \x00")
        status, data = self.request_json("GET", "/api/blessings")
        self.assertEqual(status, 200,
                         "the notebook's read is never an error — "
                         "fail-open, empty wrapper")
        self.assertTrue(data.get("ok"))
        self.assertEqual(data.get("blessings"), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
