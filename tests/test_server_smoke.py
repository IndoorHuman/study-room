#!/usr/bin/env python3
"""
server.py route smoke tests (Phase 22, Plan 02 — the localhost server).

server.py is the one-command threaded localhost server over the tested
study_lib engine. It must expose a `create_server(library_root, port)`
factory so this suite can start it on an ephemeral port with a temp library
injected — nothing here ever touches real user data, and a plain
`import server` binds no socket (the very first import IS that proof).

This suite covers (SRM-02, D-01/D-05/D-06/D-07):

  1. scan preview      — POST /api/scan returns text/image counts and the
                         per-reason skip counts (fail-visible, never silent);
                         non-existent paths, file paths, and the library root
                         itself are each rejected with HTTP 400 + JSON error.
  2. import + items    — POST /api/import populates items.json; GET
                         /api/items returns the FULL store object
                         (schema_version 2 + the complete meta object +
                         items — plans 22-04/22-05 read meta.cycle,
                         meta.current_shelf, meta.last_import_report,
                         meta.habit_anchor_asked from this response);
                         GET /api/status reports the item count.
  3. snapshot serving  — GET /lib/<id> serves an imported item's bytes by id
                         LOOKUP in the store (never by URL path); traversal-
                         shaped ids and unknown ids both 404.
  3b. attachments      — /api/items exposes each item's attachments list;
                         GET /lib/<id>/att/<basename> serves an attached
                         picture STRICTLY by store lookup (id must exist,
                         basename must be an exact member of the item's
                         attachments list — 22-uat); unknown ids, unlisted
                         names (even real files), and traversal-shaped
                         basenames all 404; CJK + fullwidth-｜ names
                         round-trip through URL encoding.
  4. state changes     — a valid change (unseen -> blessed via "blessing")
                         persists and appends history; an invalid state name
                         and a change leaving "retired" without
                         via="management-dig-out" both 400 and persist
                         nothing; a batch with one bad change is rejected
                         whole (nothing persisted).
  5. meta merge        — POST /api/meta accepts only the whitelisted keys
                         (consolidation, habit_anchor, habit_anchor_asked,
                         cycle, current_shelf, filters, cover_offers,
                         current_cover, incidents, room_entries,
                         object_opens); unknown keys 400.
  6. corrupt store     — with a truncated items.json in the library,
                         create_server raises StoreCorruptError rather than
                         reinitializing (blessing history is sacred), and the
                         damaged file is left byte-for-byte untouched.
  7. host allowlist    — a request with Host: evil.example gets 403 on /api/
                         routes (DNS-rebinding guard); Host localhost:PORT
                         and 127.0.0.1:PORT both pass.
  8. body cap          — a POST body over 1 MB is refused with 413.
  9. library picker    — POST /api/library creates the folder, initializes a
                         fresh items.json, and re-points the library root
                         (D-07 first-run flow).
 10. trigger overlay   — Phase 23 (D-08): a same-state change carrying a
                         trigger side-field flips item.trigger without
                         touching state and appends a history entry (the
                         auditable hide/release judgment); a change without
                         the key leaves the flag alone.
 11. filters           — Phase 23 (D-06/D-07): malformed filter shapes 400
                         fail-closed (non-list, unknown facet, non-scalar
                         value, extra keys); valid lists roundtrip; exact
                         repeats dedup preserving first-occurrence order;
                         year values are stored as ints (numeric strings
                         coerced at the write, anything else 400; the string
                         and int spellings of one year collapse to one).
 12. cover meta        — Phase 23 (D-04): cover_offers (string id ->
                         whole-number last-offered ms) and current_cover
                         (null or {generated_ms, id}) validate and
                         roundtrip; bad shapes 400.
 13. incidents         — Phase 23 (D-13): append semantics — the browser
                         posts only new lines, the server stamps `at`
                         itself (a client stamp is refused), two concurrent
                         posts both survive, and the list caps at the
                         newest 200.
 14. v1 re-point       — Phase 23 (SRM-05): POST /api/library at a
                         pre-existing v1 library migrates it under the same
                         lock with the same one-time backup.
 15. room counters     — Phase 24 (D-17): room_entries (non-negative int)
                         and object_opens (the four room object names ->
                         non-negative ints) validate and roundtrip; bad
                         shapes 400 fail-closed and the refused merge
                         persists nothing.
 16. consolidation     — Phase 24 (D-11/D-14, RV-2): the tri-state
                         (true / false / null) roundtrips on /api/meta;
                         any other shape (string, int, list) 400s
                         fail-closed on BOTH /api/meta AND /api/import —
                         a refused import imports zero items and leaves
                         the stored value untouched (both browser write
                         paths closed; the Phase 22 raw-merge gap).
 18. import worker     — Phase 25 (25-03, D-02 honest-ETA half): POST
                         /api/import answers immediately with {ok,
                         running, total} and runs the copy in a
                         server-side worker thread; GET
                         /api/import-progress hands back the job's
                         snapshot (state/total/done/started_ms, report
                         when done, plain-words message when error); a
                         second import while one runs is refused 400 in
                         plain words; a worker crash releases the write
                         lock and surfaces state "error" (the server is
                         never wedged); a meta write during a running
                         import completes without deadlock; RV-2 holds —
                         a refused import spawns nothing and changes no
                         job state; /api/scan is adapter-aware through
                         study_lib.scan_source (adapter name +
                         conversation counts for export sources).
 17. layout            — Phase 24.1 (D-03/D-04/D-05): GET /api/layout
                         answers null when layout.json is missing OR
                         unreadable (fail-open read — the room is never
                         blocked; shipped positions stand); a valid POST
                         roundtrips the whole document into layout.json
                         BESIDE items.json, leaving items.json
                         byte-unchanged; malformed shapes (bad version,
                         unknown id, off-grid, out-of-bounds, wrong types,
                         roster misses, over-cap added lists, unknown
                         keys, a functional object in `removed`) 400
                         fail-closed and a refused write persists nothing.
                         24.1-04 widens the accessory-sprite roster to the
                         shipped catalog names and adds regression rows:
                         new names roundtrip, unknown names still 400,
                         removed shipped decor passes, removed functional
                         objects still 400.

Stdlib only (unittest + threading + http.client + tempfile) — honours the
zero-dependency law (D-01/D-03). Every test builds its library and source
corpus inside a fresh tempfile.TemporaryDirectory().
"""
import base64
import hashlib
import http.client
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import time
import unittest
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

# server.py is a plain module at the repo root. Adding the repo root to
# sys.path lets a plain `import server` resolve regardless of the cwd the
# runner was invoked from — and the import itself proves the module binds no
# socket and performs no I/O at import time.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import server  # noqa: E402  — the importability proof (no socket bound)
import study_lib  # noqa: E402
import librarian_call as L  # noqa: E402  — the seam this suite now drives

# ⚠⚠ CAPTURED AT IMPORT, BEFORE ANY CASE MOVES THE HOME DIRECTORY (26.93-07).
# THE OWNER'S REAL ANTHROPIC KEY LIVES UNDER THIS DIRECTORY. Until 26.93-07
# this suite let HOME through to a child process, so `_credential` found that
# key and the migrated jobs resolved to `claude-opus-5` — a suite run spent her
# money on Opus and produced a real Opus-written note where a canned string was
# expected. The home swap below is what ended that; these three names are how
# the suite proves afterwards that it neither created nor removed the real
# directory, checked once more in `main()`.
REAL_HOME = os.path.expanduser("~")
REAL_ROOM_DIR = os.path.join(REAL_HOME, study_lib.ROOM_CONFIG_DIR_NAME)
REAL_ROOM_DIR_EXISTED = os.path.exists(REAL_ROOM_DIR)

# A valid 1x1 transparent PNG, embedded so no binary fixture lives on disk.
PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
    "AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def build_corpus(src: Path) -> None:
    """A small mixed source corpus: 3 text + 1 image importable, plus one of
    each skip reason the scan preview must count (heic / hidden / zero-byte
    icloud stub / unknown extension)."""
    (src / "note-one.md").write_bytes(b"# Note one\nhello from the corpus\n")
    sub = src / "sub"
    sub.mkdir()
    (sub / "note-two.md").write_bytes(b"# Note two\nin a subfolder\n")
    (src / "plain.txt").write_bytes(b"a plain text note\n")
    (src / "tiny.png").write_bytes(PNG_1x1)
    (src / "pic.heic").write_bytes(b"heic-bytes")       # heic -> skip + count
    (src / ".hidden.md").write_bytes(b"# hidden\n")     # hidden dotfile
    (src / "empty.md").write_bytes(b"")                 # zero-byte -> icloud
    (src / "data.foo").write_bytes(b"mystery")          # unknown extension


# ---------------------------------------------------------------------------
# 25-03 worker shims: the suite watches a running import and exercises the
# error path by wrapping study_lib.import_folder at the module seam server.py
# calls through. Both restore the real function on exit, whatever happens.
# ---------------------------------------------------------------------------

@contextmanager
def slow_import(delay=0.08):
    """Wrap study_lib.import_folder so each unit takes a beat — long enough
    for a test to observe the running state and land a meta write mid-run,
    short enough to keep the suite quick. Only the per-unit callback path is
    slowed; the import itself is byte-identical."""
    real = study_lib.import_folder

    # ⚠ **kwargs, not a fixed parameter list. This double stood in for the
    # real signature and broke the moment #58 added `superseded_cb` to it — the
    # import worker went to `error` and three tests failed for a reason that
    # had nothing to do with what they were testing. Everything it does not
    # care about is forwarded untouched.
    def slowed(src, lib, consolidation=None, progress_cb=None, **kwargs):
        def cb(done, total):
            time.sleep(delay)
            if progress_cb is not None:
                progress_cb(done, total)
        return real(src, lib, consolidation=consolidation, progress_cb=cb,
                    **kwargs)

    study_lib.import_folder = slowed
    try:
        yield
    finally:
        study_lib.import_folder = real


@contextmanager
def failing_import():
    """Replace study_lib.import_folder with one that raises mid-worker —
    the error path must release the write lock and surface plain words."""
    real = study_lib.import_folder

    def boom(*args, **kwargs):
        raise RuntimeError("synthetic worker failure")

    study_lib.import_folder = boom
    try:
        yield
    finally:
        study_lib.import_folder = real


class ServerSmokeTest(unittest.TestCase):
    """Starts a real ThreadingHTTPServer on an ephemeral port per test, with
    a temp library injected via the create_server factory."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.library = self.tmp / "library"
        self.library.mkdir()
        self.source = self.tmp / "source"
        self.source.mkdir()
        build_corpus(self.source)
        # 25-03: the import job dict is module state in server.py (the
        # single-owner app runs one server; this suite runs many) — reset
        # it so every test starts from "idle".
        with server.JOB_LOCK:
            server.IMPORT_JOB.update(state="idle", total=0, done=0,
                                     started_ms=0, report=None,
                                     message=None)
        self.httpd = server.create_server(self.library, 0)  # 0 = ephemeral
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

    def request(self, method, path, body=None, host=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        headers = {}
        if host is not None:
            headers["Host"] = host
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

    def request_json(self, method, path, body=None, host=None):
        status, raw = self.request(method, path, body=body, host=host)
        return status, json.loads(raw)

    def wait_import_done(self, timeout=10.0):
        """Read GET /api/import-progress until the job leaves "running"
        and return the final snapshot. A plain test-side read loop — the
        app's own re-read is the client's one-shot re-arm, not this."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            status, snap = self.request_json("GET", "/api/import-progress")
            self.assertEqual(status, 200)
            if snap["state"] in ("done", "error"):
                return snap
            time.sleep(0.02)
        self.fail("the import job never finished")

    def do_import(self, consolidation=None):
        """POST an import and wait for the worker to finish (25-03: the
        POST answers immediately; the finished report — the established
        {imported, deduped, attached, skipped, items} shape — is read
        from the job snapshot once the state lands on "done")."""
        payload = {"path": str(self.source)}
        if consolidation is not None:
            payload["consolidation"] = consolidation
        status, data = self.request_json("POST", "/api/import", payload)
        self.assertEqual(status, 200, f"import failed: {data}")
        self.assertIs(data.get("running"), True,
                      "the import runs in a server-side worker")
        snap = self.wait_import_done()
        self.assertEqual(snap["state"], "done", f"import errored: {snap}")
        return snap["report"]

    # -- 1. scan preview -----------------------------------------------------

    def test_scan_preview_counts(self):
        status, data = self.request_json(
            "POST", "/api/scan", {"path": str(self.source)})
        self.assertEqual(status, 200)
        self.assertEqual(data["text"], 3, "3 text files (2 md + 1 txt)")
        self.assertEqual(data["image"], 1, "1 png")
        self.assertEqual(data["attached"], 0,
                         "no note here links a picture (22-uat)")
        skipped = data["skipped"]
        self.assertEqual(skipped["heic"], 1)
        self.assertEqual(skipped["hidden"], 1)
        self.assertEqual(skipped["icloud"], 1, "zero-byte counts as icloud")
        self.assertEqual(skipped["unknown"], {".foo": 1})
        # a scan is a preview only — it must not create the store
        self.assertFalse((self.library / "items.json").exists(),
                         "scan is a dry run; it must never write the store")

    def test_scan_reports_attached_pictures(self):
        # 22-uat: a picture a note links to is counted as attached — it will
        # travel with its note, never as a standalone item.
        vault = self.tmp / "vault"
        vault.mkdir()
        (vault / "clip.md").write_bytes(b"a post\n\n![[shot.png]]\n")
        (vault / "shot.png").write_bytes(PNG_1x1)
        (vault / "loose.jpg").write_bytes(PNG_1x1 + b"jpg")
        status, data = self.request_json(
            "POST", "/api/scan", {"path": str(vault)})
        self.assertEqual(status, 200)
        self.assertEqual(data["text"], 1)
        self.assertEqual(data["image"], 1,
                         "only the unreferenced picture counts as a photo")
        self.assertEqual(data["attached"], 1)
        self.assertEqual(data["total"], 2,
                         "total = things that will become items")

    def test_scan_rejects_bad_paths(self):
        # non-existent path
        status, data = self.request_json(
            "POST", "/api/scan", {"path": str(self.tmp / "nope")})
        self.assertEqual(status, 400)
        self.assertIn("error", data)
        # a file, not a folder
        status, data = self.request_json(
            "POST", "/api/scan", {"path": str(self.source / "note-one.md")})
        self.assertEqual(status, 400)
        self.assertIn("error", data)
        # the library root itself
        status, data = self.request_json(
            "POST", "/api/scan", {"path": str(self.library)})
        self.assertEqual(status, 400)
        self.assertIn("error", data)

    # -- 2. import + items + status -------------------------------------------

    def test_import_items_and_status(self):
        report = self.do_import(consolidation=True)
        self.assertEqual(report["imported"], 4)
        self.assertEqual(report["deduped"], 0)
        self.assertTrue((self.library / "items.json").exists())

        status, store = self.request_json("GET", "/api/items")
        self.assertEqual(status, 200)
        # the FULL store object — downstream plans read all of meta
        self.assertEqual(store["schema_version"], 3)
        meta = store["meta"]
        for key in ("library_root", "consolidation", "habit_anchor",
                    "habit_anchor_asked", "cycle", "current_shelf",
                    "last_import_report", "filters", "cover_offers",
                    "current_cover", "incidents"):
            self.assertIn(key, meta, f"meta must carry {key}")
        self.assertIs(meta["consolidation"], True, "Q1 answer stored")
        self.assertEqual(meta["cycle"], {"number": 1, "shown_ids": []})
        self.assertEqual(meta["last_import_report"]["imported"], 4)
        self.assertEqual(len(store["items"]), 4)
        for item in store["items"].values():
            self.assertEqual(item["state"], "unseen")

        status, data = self.request_json("GET", "/api/status")
        self.assertEqual(status, 200)
        self.assertEqual(data["items"], 4)

    def test_status_before_any_import(self):
        status, data = self.request_json("GET", "/api/status")
        self.assertEqual(status, 200)
        self.assertEqual(data["items"], 0)

    # -- 3. snapshot serving by id lookup -------------------------------------

    def test_lib_serves_snapshot_by_id(self):
        self.do_import()
        _, store = self.request_json("GET", "/api/items")
        text_item = next(i for i in store["items"].values()
                         if i["type"] == "text"
                         and i["library_path"].endswith(".md"))
        status, body = self.request("GET", f"/lib/{text_item['id']}")
        self.assertEqual(status, 200)
        on_disk = (self.library / text_item["library_path"]).read_bytes()
        self.assertEqual(body, on_disk, "served bytes == the snapshot bytes")

    def test_lib_rejects_traversal_and_unknown_ids(self):
        self.do_import()
        # traversal-shaped ids: content is resolved by id lookup in the
        # store, never from the URL path — these must all 404
        for path in ("/lib/../items.json",
                     "/lib/..%2F..%2Fitems.json",
                     "/lib/../../study_lib.py"):
            status, _ = self.request("GET", path)
            self.assertEqual(status, 404, f"{path} must 404")
        status, _ = self.request("GET", "/lib/deadbeefdeadbeef")
        self.assertEqual(status, 404, "unknown id must 404")

    # -- 3b. attachment serving (22-uat) ---------------------------------------

    def _import_attachment_vault(self):
        """A clipped image-post, the real vault's shape (22-uat): a caption
        note whose pictures ARE the content — one embedded via wikilink, one
        only prefix-named — with CJK + fullwidth ｜ in every filename.
        Returns the imported note item (which must carry both attachments)."""
        vault = self.tmp / "vault"
        vault.mkdir()
        stem = "重来一次你会选择"
        self.att_names = [stem + "_1_作者｜手绘_来自小红书网页版.jpg",
                          stem + "_2_作者｜手绘_来自小红书网页版.jpg"]
        (vault / (stem + ".md")).write_text(
            "选择的漫画\n\n![[" + self.att_names[0] + "]]\n",
            encoding="utf-8")
        (vault / self.att_names[0]).write_bytes(PNG_1x1 + b"page-one")
        (vault / self.att_names[1]).write_bytes(PNG_1x1 + b"page-two")
        status, data = self.request_json(
            "POST", "/api/import", {"path": str(vault)})
        self.assertEqual(status, 200, f"import failed: {data}")
        # 25-03: the import runs in a worker — wait for it before reading
        snap = self.wait_import_done()
        self.assertEqual(snap["state"], "done", f"import errored: {snap}")
        _, store = self.request_json("GET", "/api/items")
        return next(i for i in store["items"].values()
                    if i["type"] == "text")

    def test_items_expose_attachments(self):
        # /api/items must hand the client each item's attachments list —
        # the reader builds its picture URLs from these stored values, so
        # this pins the exposure the fix relies on.
        item = self._import_attachment_vault()
        self.assertEqual(
            item.get("attachments"),
            [f"attachments/{item['id']}/{n}" for n in self.att_names],
            "the note item carries both pictures as stored rel paths")

    def test_attachment_route_serves_members(self):
        # GET /lib/<id>/att/<basename> serves the attached picture's bytes;
        # the CJK + fullwidth-｜ basename is URL-encoded by the client and
        # decoded server-side.
        item = self._import_attachment_vault()
        for n in self.att_names:
            status, body = self.request(
                "GET", f"/lib/{item['id']}/att/{quote(n, safe='')}")
            self.assertEqual(status, 200, f"{n} must serve")
            on_disk = (self.library / "attachments" / item["id"] /
                       n).read_bytes()
            self.assertEqual(body, on_disk,
                             "served bytes == the attachment snapshot bytes")

    def test_attachment_route_404s(self):
        item = self._import_attachment_vault()
        encoded = quote(self.att_names[0], safe="")
        # unknown item id: the id lookup comes first
        status, _ = self.request(
            "GET", f"/lib/deadbeefdeadbeef/att/{encoded}")
        self.assertEqual(status, 404, "unknown id must 404")
        # a REAL file inside the item's own attachments dir that is not a
        # member of the stored list: still 404 — the list is the whitelist,
        # existence on disk is never enough
        sneaky = self.library / "attachments" / item["id"] / "sneaky.jpg"
        sneaky.write_bytes(PNG_1x1)
        status, _ = self.request("GET", f"/lib/{item['id']}/att/sneaky.jpg")
        self.assertEqual(status, 404, "an unlisted file never serves")
        # traversal-shaped basenames, raw and encoded, all miss the whitelist
        for name in ("../../items.json",
                     "..%2F..%2Fitems.json",
                     "%2E%2E%2F%2E%2E%2Fitems.json"):
            status, _ = self.request("GET", f"/lib/{item['id']}/att/{name}")
            self.assertEqual(status, 404, f"{name} must 404")

    # -- 4. state changes ------------------------------------------------------

    def _first_item_id(self):
        _, store = self.request_json("GET", "/api/items")
        return sorted(store["items"])[0]

    def _item(self, item_id):
        _, store = self.request_json("GET", "/api/items")
        return store["items"][item_id]

    def test_state_valid_change_persists_with_history(self):
        self.do_import()
        item_id = self._first_item_id()
        status, data = self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "blessed", "via": "blessing"}]})
        self.assertEqual(status, 200, f"valid change refused: {data}")
        item = self._item(item_id)
        self.assertEqual(item["state"], "blessed")
        self.assertEqual(len(item["history"]), 2, "import entry + this one")
        last = item["history"][-1]
        self.assertEqual(last["from"], "unseen")
        self.assertEqual(last["to"], "blessed")
        self.assertEqual(last["via"], "blessing")

    def test_state_reaction_fenced_to_surfaced_states(self):
        """CR-01 (law 5): via='reaction:*' is legal only from blessed/resting.

        A reaction on a never_show item would quietly un-never it
        (never_show -> resting -> shelf ~90 days later); on an unseen item
        it would bypass blessing. The server never trusts the browser.
        """
        self.do_import()
        _, store = self.request_json("GET", "/api/items")
        ids = sorted(store["items"])
        item_id, other_id = ids[0], ids[1]

        # unseen + reaction -> refused (would bypass blessing)
        status, data = self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "resting",
                         "via": "reaction:not_really"}]})
        self.assertEqual(status, 400)
        self.assertIn("error", data)

        # the CR-01 leak row: never_show + reaction:not_really -> refused
        self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "never_show",
                         "via": "blessing"}]})
        status, data = self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "resting",
                         "via": "reaction:not_really"}]})
        self.assertEqual(status, 400)
        self.assertIn("error", data)
        item = self._item(item_id)
        self.assertEqual(item["state"], "never_show",
                         "the never judgment held")

        # the ordinary path still works: blessed items may react
        self.request_json("POST", "/api/state", {
            "changes": [{"id": other_id, "to": "blessed",
                         "via": "blessing"}]})
        status, _ = self.request_json("POST", "/api/state", {
            "changes": [{"id": other_id, "to": "resting",
                         "via": "reaction:not_really",
                         "resting_until_ms": 1782172800000}]})
        self.assertEqual(status, 200)

    def test_state_invalid_name_rejected_persists_nothing(self):
        self.do_import()
        item_id = self._first_item_id()
        status, data = self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "shiny", "via": "blessing"}]})
        self.assertEqual(status, 400)
        self.assertIn("error", data)
        item = self._item(item_id)
        self.assertEqual(item["state"], "unseen", "nothing persisted")
        self.assertEqual(len(item["history"]), 1)

    def test_state_leaving_retired_needs_dig_out(self):
        self.do_import()
        item_id = self._first_item_id()
        status, _ = self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "retired", "via": "reaction"}]})
        self.assertEqual(status, 200)
        # leaving retired WITHOUT the deliberate dig-out: refused
        status, data = self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "blessed", "via": "blessing"}]})
        self.assertEqual(status, 400)
        self.assertIn("error", data)
        self.assertEqual(self._item(item_id)["state"], "retired",
                         "retired stays retired")

    def test_state_batch_rejected_whole_on_any_error(self):
        self.do_import()
        _, store = self.request_json("GET", "/api/items")
        ids = sorted(store["items"])
        status, _ = self.request_json("POST", "/api/state", {
            "changes": [
                {"id": ids[0], "to": "blessed", "via": "blessing"},
                {"id": ids[1], "to": "shiny", "via": "blessing"},
            ]})
        self.assertEqual(status, 400)
        self.assertEqual(self._item(ids[0])["state"], "unseen",
                         "the valid half of a bad batch must not persist")

    # -- 5. meta whitelist ------------------------------------------------------

    def test_meta_accepts_whitelisted_keys(self):
        self.do_import()
        status, _ = self.request_json("POST", "/api/meta", {
            "habit_anchor": "after the morning tea",
            "habit_anchor_asked": True})
        self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["habit_anchor"],
                         "after the morning tea")
        self.assertIs(store["meta"]["habit_anchor_asked"], True)

    def test_meta_rejects_unknown_keys(self):
        self.do_import()
        for payload in ({"library_root": "/somewhere/else"},
                        {"favourite_colour": "green"},
                        {"habit_anchor": "x", "extra": 1}):
            status, data = self.request_json("POST", "/api/meta", payload)
            self.assertEqual(status, 400, f"{payload} must be refused")
            self.assertIn("error", data)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["habit_anchor"], None,
                         "a refused merge persists nothing")

    # -- 7. host allowlist ------------------------------------------------------

    def test_host_header_allowlist(self):
        status, data = self.request_json(
            "GET", "/api/status", host="evil.example")
        self.assertEqual(status, 403, "DNS-rebinding guard on /api/ routes")
        self.assertIn("error", data)
        status, _ = self.request_json(
            "POST", "/api/scan", {"path": str(self.source)},
            host="evil.example:9999")
        self.assertEqual(status, 403)
        # the two legitimate hosts pass (any port)
        status, _ = self.request_json(
            "GET", "/api/status", host=f"localhost:{self.port}")
        self.assertEqual(status, 200)
        status, _ = self.request_json(
            "GET", "/api/status", host=f"127.0.0.1:{self.port}")
        self.assertEqual(status, 200)

    # -- 8. body cap --------------------------------------------------------------

    def test_post_body_over_1mb_refused(self):
        status, data = self.request_json("POST", "/api/meta", {
            "habit_anchor": "x" * (1024 * 1024 + 64)})
        self.assertEqual(status, 413)
        self.assertIn("error", data)

    # -- 9. library picker (D-07) ---------------------------------------------------

    def test_library_route_creates_and_repoints(self):
        new_lib = self.tmp / "another-room"
        status, data = self.request_json(
            "POST", "/api/library", {"path": str(new_lib)})
        self.assertEqual(status, 200)
        self.assertTrue(new_lib.is_dir(), "folder created when missing")
        self.assertTrue((new_lib / "items.json").exists(),
                        "fresh store initialized")
        status, data = self.request_json("GET", "/api/status")
        self.assertEqual(status, 200)
        self.assertEqual(data["items"], 0)
        self.assertEqual(Path(data["library_root"]).resolve(),
                         new_lib.resolve())

    # -- 10. trigger side-field (D-08, Phase 23) -------------------------------

    def test_trigger_side_field_flips_without_state_change(self):
        self.do_import()
        item_id = self._first_item_id()
        status, data = self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "unseen", "via": "hide",
                         "trigger": True}]})
        self.assertEqual(status, 200, f"same-state hide refused: {data}")
        item = self._item(item_id)
        self.assertIs(item["trigger"], True, "the flag flips")
        self.assertEqual(item["state"], "unseen", "the state is untouched")
        self.assertEqual(len(item["history"]), 2,
                         "the hide judgment is recorded")
        last = item["history"][-1]
        self.assertEqual((last["from"], last["to"], last["via"]),
                         ("unseen", "unseen", "hide"))

    def test_trigger_release_and_untouched_without_key(self):
        self.do_import()
        item_id = self._first_item_id()
        self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "unseen", "via": "hide",
                         "trigger": True}]})
        # the deliberate release (D-08: the ONLY way back)
        status, _ = self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "unseen", "via": "release",
                         "trigger": False}]})
        self.assertEqual(status, 200)
        item = self._item(item_id)
        self.assertIs(item["trigger"], False, "released")
        self.assertEqual(item["history"][-1]["via"], "release")
        # hide again, then an ordinary transition WITHOUT the key
        self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "unseen", "via": "hide",
                         "trigger": True}]})
        status, _ = self.request_json("POST", "/api/state", {
            "changes": [{"id": item_id, "to": "blessed",
                         "via": "blessing"}]})
        self.assertEqual(status, 200)
        item = self._item(item_id)
        self.assertEqual(item["state"], "blessed")
        self.assertIs(item["trigger"], True,
                      "a change without the key leaves trigger untouched — "
                      "a hidden item stays hidden through state revisions")

    # -- 11. filters (D-06/D-07, Phase 23) --------------------------------------

    def test_filters_malformed_shapes_400_and_persist_nothing(self):
        self.do_import()
        for payload in (
            {"filters": {"facet": "year", "value": 2023}},   # non-list
            {"filters": ["no screenshots"]},                 # not an object
            {"filters": [{"facet": "nope", "value": 1}]},    # unknown facet
            {"filters": [{"facet": "tag",
                          "value": ["screenshots"]}]},       # non-scalar
            {"filters": [{"facet": "tag", "value": None}]},
            {"filters": [{"facet": "tag", "value": True}]},  # bool
            {"filters": [{"facet": "tag"}]},                 # missing value
            {"filters": [{"facet": "tag", "value": "x",
                          "extra": 1}]},                     # extra key
            {"filters": [{"facet": "year", "value": "20x3"}]},
            {"filters": [{"facet": "year", "value": 20.23}]},
        ):
            status, data = self.request_json("POST", "/api/meta", payload)
            self.assertEqual(status, 400, f"{payload} must be refused")
            self.assertIn("error", data)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["filters"], [],
                         "a refused filter never enters the store")

    def test_filters_roundtrip_dedup_first_occurrence_order(self):
        self.do_import()
        status, _ = self.request_json("POST", "/api/meta", {
            "filters": [
                {"facet": "tag", "value": "screenshots"},
                {"facet": "year", "value": 2023},
                {"facet": "tag", "value": "screenshots"},
                {"facet": "source", "value": "folder-drop"},
                {"facet": "year", "value": 2023},
            ]})
        self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["filters"], [
            {"facet": "tag", "value": "screenshots"},
            {"facet": "year", "value": 2023},
            {"facet": "source", "value": "folder-drop"},
        ], "exact repeats dedup to one, first-occurrence order preserved")

    def test_filters_year_typing_coerced_at_the_write(self):
        self.do_import()
        # a numeric string (the natural DOM dataset read) stores as an int
        status, _ = self.request_json("POST", "/api/meta", {
            "filters": [{"facet": "year", "value": "2023"}]})
        self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        (entry,) = store["meta"]["filters"]
        self.assertEqual(entry["value"], 2023)
        self.assertIsInstance(entry["value"], int,
                              "GET shows a JSON number, not a string")
        self.assertNotIsInstance(entry["value"], bool)
        # string + int spellings of the same year collapse to ONE int entry
        status, _ = self.request_json("POST", "/api/meta", {
            "filters": [{"facet": "year", "value": "2024"},
                        {"facet": "year", "value": 2024}]})
        self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["filters"],
                         [{"facet": "year", "value": 2024}])

    # -- 12. cover meta (D-04, Phase 23) ----------------------------------------

    def test_cover_meta_roundtrip(self):
        self.do_import()
        status, _ = self.request_json("POST", "/api/meta", {
            "cover_offers": {"a" * 16: 1752600000000},
            "current_cover": {"generated_ms": 1752600000000,
                              "id": "a" * 16}})
        self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["cover_offers"],
                         {"a" * 16: 1752600000000})
        self.assertEqual(store["meta"]["current_cover"],
                         {"generated_ms": 1752600000000, "id": "a" * 16})
        # a finished visit writes the cover back to null
        status, _ = self.request_json("POST", "/api/meta",
                                      {"current_cover": None})
        self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        self.assertIsNone(store["meta"]["current_cover"])

    def test_cover_meta_bad_shapes_400(self):
        self.do_import()
        for payload in (
            {"cover_offers": [{"id": "x"}]},                 # not a dict
            {"cover_offers": {"x": "soon"}},                 # non-int ms
            {"cover_offers": {"x": True}},                   # bool ms
            {"current_cover": "x"},                          # not an object
            {"current_cover": {"id": "x"}},                  # missing ms
            {"current_cover": {"generated_ms": "now", "id": "x"}},
            {"current_cover": {"generated_ms": 1, "id": 2}},
            {"current_cover": {"generated_ms": 1, "id": "x", "extra": 1}},
        ):
            status, data = self.request_json("POST", "/api/meta", payload)
            self.assertEqual(status, 400, f"{payload} must be refused")
            self.assertIn("error", data)

    # -- 15. room counters (D-17, Phase 24) --------------------------------------

    def test_room_counters_roundtrip(self):
        self.do_import()
        status, _ = self.request_json("POST", "/api/meta", {
            "room_entries": 3,
            "object_opens": {"bookshelf": 2, "desk": 1}})
        self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["room_entries"], 3)
        self.assertEqual(store["meta"]["object_opens"],
                         {"bookshelf": 2, "desk": 1})

    def test_room_counters_bad_shapes_400(self):
        self.do_import()
        for payload in (
            {"room_entries": -1},                    # negative
            {"room_entries": True},                  # bool (subclasses int)
            {"room_entries": "3"},                   # string
            {"object_opens": []},                    # not a dict
            {"object_opens": {"cat": 1}},            # unknown object name
            {"object_opens": {"bookshelf": -2}},     # negative count
            {"object_opens": {"bookshelf": True}},   # bool count
        ):
            status, data = self.request_json("POST", "/api/meta", payload)
            self.assertEqual(status, 400, f"{payload} must be refused")
            self.assertIn("error", data)
        _, store = self.request_json("GET", "/api/items")
        self.assertNotIn("room_entries", store["meta"],
                         "a refused merge persists nothing")
        self.assertNotIn("object_opens", store["meta"],
                         "a refused merge persists nothing")

    def test_stored_state_carrying_journal_still_validates(self):
        # 26.8.1 D-B backward-compat guard (T-26.8.1-03). The journal
        # SURFACE is retired from the client, but a returning user's
        # stored state may still carry an object_opens.journal count
        # (recorded by the pre-removal recordObjectOpen('journal')) AND a
        # layout.json journal object position. The server validators stay
        # PERMISSIVE — "journal" stays in the object_opens allow-set,
        # LAYOUT_OBJECTS, and FUNCTIONAL_OBJECTS — so old state loads
        # without rejection. Tightening any of these would reject valid
        # stored state (Pitfall 2). This is a regression guard: it must
        # already pass GREEN (the server is deliberately not touched by
        # D-B).
        self.do_import()
        # (a) object_opens carrying a journal count validates + roundtrips.
        status, _ = self.request_json("POST", "/api/meta", {
            "object_opens": {"journal": 4, "bookshelf": 1}})
        self.assertEqual(status, 200,
                         "stored object_opens.journal must still validate "
                         "after D-B — the server stays permissive")
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["object_opens"],
                         {"journal": 4, "bookshelf": 1},
                         "the journal open-count roundtrips unchanged")
        # (b) a layout.json positioning the journal object still validates
        # + roundtrips (LAYOUT_OBJECTS keeps "journal"; x on the 12px grid).
        doc = {"version": 1, "objects": {"journal": {"x": 216, "y": 98}}}
        status, data = self.request_json("POST", "/api/layout", doc)
        self.assertEqual(status, 200,
                         f"a stored journal object position must still "
                         f"validate after D-B: {data}")
        status, data = self.request_json("GET", "/api/layout")
        self.assertEqual(status, 200)
        self.assertEqual(data["layout"], doc,
                         "the journal object position roundtrips unchanged")
        # (c) the move-only fence stays: removing the journal (a functional
        # object) is still refused — its removal never becomes valid.
        status, _ = self.request_json("POST", "/api/layout",
                                      {"version": 1, "removed": ["journal"]})
        self.assertEqual(status, 400,
                         "journal stays in FUNCTIONAL_OBJECTS — removing it "
                         "is still the move-only law refusal (D-05)")

    # -- 15b. last_entry_ms (D-01, Phase 25) — the landing stamp ------------------
    # The room-counters family: same writer (the room landing), same
    # lifecycle, same on-device posture. Stamped on landing, read back
    # at re-entry; fail-closed like room_entries.

    def test_last_entry_ms_roundtrip(self):
        self.do_import()
        status, _ = self.request_json("POST", "/api/meta",
                                      {"last_entry_ms": 1721400000000})
        self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["last_entry_ms"], 1721400000000)

    def test_last_entry_ms_bad_shapes_400(self):
        self.do_import()
        for payload in (
            {"last_entry_ms": True},     # bool (subclasses int — checked first)
            {"last_entry_ms": -1},       # negative
            {"last_entry_ms": 1.5},      # float
            {"last_entry_ms": "soon"},   # string
            {"last_entry_ms": None},     # null
        ):
            status, data = self.request_json("POST", "/api/meta", payload)
            self.assertEqual(status, 400, f"{payload} must be refused")
            self.assertIn("error", data)
            _, store = self.request_json("GET", "/api/items")
            self.assertNotIn("last_entry_ms", store["meta"],
                             "a refused merge persists nothing — the "
                             "stored value stays unchanged after each "
                             "refusal")

    def test_last_entry_ms_rides_with_counters(self):
        # One POST carrying both the entry count and the landing stamp
        # persists both — the stamp rides the existing request, zero
        # new routes (D-01).
        self.do_import()
        status, _ = self.request_json("POST", "/api/meta", {
            "room_entries": 1, "last_entry_ms": 1721400000000})
        self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["room_entries"], 1)
        self.assertEqual(store["meta"]["last_entry_ms"], 1721400000000)

    # -- 16. consolidation (D-11/D-14, RV-2, Phase 24) ----------------------------

    def test_consolidation_roundtrip(self):
        self.do_import()
        for value in (True, False, None):
            status, _ = self.request_json(
                "POST", "/api/meta", {"consolidation": value})
            self.assertEqual(status, 200, f"{value!r} must be accepted")
            _, store = self.request_json("GET", "/api/items")
            self.assertIs(store["meta"]["consolidation"], value,
                          "the tri-state roundtrips exactly — true, "
                          "false, and null are the only three values")

    def test_consolidation_bad_shapes_400(self):
        self.do_import()
        for payload in (
            {"consolidation": "yes"},   # string
            {"consolidation": 1},       # int (bool subclasses int — the
                                        # validator checks bool FIRST)
            {"consolidation": []},      # list
        ):
            status, data = self.request_json("POST", "/api/meta", payload)
            self.assertEqual(status, 400, f"{payload} must be refused")
            self.assertIn("error", data)
        _, store = self.request_json("GET", "/api/items")
        self.assertIsNone(store["meta"]["consolidation"],
                          "a refused merge persists nothing — the stored "
                          "value stays the import-time null")

    def test_import_consolidation_bad_shapes_400(self):
        # RV-2: /api/import is a browser write path into store meta too —
        # study_lib.import_folder stores any non-None value verbatim, so
        # the malformed shape must be refused BEFORE the lock: nothing is
        # imported and the stored value is untouched.
        self.do_import(consolidation=True)  # a real value already stored
        fresh = self.tmp / "fresh"
        fresh.mkdir()
        (fresh / "new-note.md").write_bytes(b"# new\nnot yet imported\n")
        for bad in ("keep-both", 1, []):
            status, data = self.request_json(
                "POST", "/api/import",
                {"path": str(fresh), "consolidation": bad})
            self.assertEqual(status, 400, f"{bad!r} must be refused")
            self.assertIn("error", data)
        status, data = self.request_json("GET", "/api/status")
        self.assertEqual(status, 200)
        self.assertEqual(data["items"], 4,
                         "a refused import imports zero items — the new "
                         "source file never entered the library")
        _, store = self.request_json("GET", "/api/items")
        self.assertIs(store["meta"]["consolidation"], True,
                      "meta.consolidation is untouched by the refusal")

    # -- 17. onboarding meta keys (26.6-02, SRM-06) -------------------------------
    # The candle's name (a short string or null) and the resume flag (a bool)
    # ride the same fail-closed /api/meta whitelist as every other key: a
    # valid short name persists, null is accepted (the D-02 skip path), and
    # an over-long/non-string name or a non-bool flag is refused 400.

    def test_librarian_name_accepts_short_and_null(self):
        self.do_import()
        for value in ("sunny", None, "x" * 40):
            status, _ = self.request_json(
                "POST", "/api/meta", {"librarian_name": value})
            self.assertEqual(status, 200, f"{value!r} must be accepted")
            _, store = self.request_json("GET", "/api/items")
            self.assertEqual(store["meta"]["librarian_name"], value,
                             "a short name (or null) persists verbatim — "
                             "the 40-char boundary is inclusive")

    def test_librarian_name_rejects_overlong_and_nonstring(self):
        self.do_import()
        # a good name first, to prove a refused write persists nothing.
        self.request_json("POST", "/api/meta", {"librarian_name": "sunny"})
        for bad in ("x" * 41, 123, ["sunny"], {"n": "s"}, True):
            status, data = self.request_json(
                "POST", "/api/meta", {"librarian_name": bad})
            self.assertEqual(status, 400, f"{bad!r} must be refused")
            self.assertIn("error", data)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["librarian_name"], "sunny",
                         "a refused merge persists nothing — the prior "
                         "name stays")

    def test_onboarding_complete_roundtrip_and_bad_shapes(self):
        self.do_import()
        for value in (True, False):
            status, _ = self.request_json(
                "POST", "/api/meta", {"onboarding_complete": value})
            self.assertEqual(status, 200, f"{value!r} must be accepted")
            _, store = self.request_json("GET", "/api/items")
            self.assertIs(store["meta"]["onboarding_complete"], value,
                          "the resume flag roundtrips as a bool exactly")
        for bad in ("yes", 1, [], None):
            status, data = self.request_json(
                "POST", "/api/meta", {"onboarding_complete": bad})
            self.assertEqual(status, 400, f"{bad!r} must be refused")
            self.assertIn("error", data)
        _, store = self.request_json("GET", "/api/items")
        self.assertIs(store["meta"]["onboarding_complete"], False,
                      "a refused merge persists nothing — the last good "
                      "value (False) stays")

    def test_onboarding_keys_absent_leave_other_meta_untouched(self):
        # shallow-merge discipline: writing one onboarding key never
        # disturbs the other, nor any prior meta.
        self.do_import()
        self.request_json("POST", "/api/meta", {"librarian_name": "moss",
                                                "habit_anchor": "after tea"})
        self.request_json("POST", "/api/meta",
                          {"onboarding_complete": True})
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["librarian_name"], "moss",
                         "an unrelated write leaves librarian_name alone")
        self.assertIs(store["meta"]["onboarding_complete"], True)
        self.assertEqual(store["meta"]["habit_anchor"], "after tea",
                         "prior meta survives the onboarding writes")

    # -- 18. the import worker + progress route (25-03, D-02) ---------------------
    # Big imports run in a server-side worker thread holding the write
    # lock: the POST answers immediately, the progress route hands back
    # the job's snapshot, refusal and error paths are plain-words, and
    # the server is never wedged.

    def test_import_progress_lifecycle(self):
        # POST answers promptly with the honest total; repeated progress
        # reads show done climbing; the final state is "done" with the
        # established report attached.
        with slow_import():
            status, data = self.request_json(
                "POST", "/api/import", {"path": str(self.source)})
            self.assertEqual(status, 200)
            self.assertIs(data["ok"], True)
            self.assertIs(data["running"], True)
            self.assertEqual(data["total"], 4,
                             "the scan's honest denominator rides the "
                             "immediate response")
            seen_states = set()
            seen_done = []
            deadline = time.time() + 10
            snap = None
            while time.time() < deadline:
                _, snap = self.request_json("GET", "/api/import-progress")
                seen_states.add(snap["state"])
                seen_done.append(snap["done"])
                if snap["state"] in ("done", "error"):
                    break
                time.sleep(0.02)
            self.assertIn("running", seen_states,
                          "the job was observable mid-run")
            self.assertEqual(snap["state"], "done")
            self.assertEqual(snap["done"], snap["total"])
            self.assertEqual(seen_done, sorted(seen_done),
                             "done only ever climbs")
            self.assertGreater(snap["started_ms"], 0)
            report = snap["report"]
            self.assertEqual(report["imported"], 4)
            self.assertEqual(report["items"], 4,
                             "the finished report carries the library "
                             "count the client renders")

    def test_second_import_refused_while_running(self):
        with slow_import():
            status, _ = self.request_json(
                "POST", "/api/import", {"path": str(self.source)})
            self.assertEqual(status, 200)
            status, data = self.request_json(
                "POST", "/api/import", {"path": str(self.source)})
            self.assertEqual(status, 400,
                             "one import at a time — a plain refusal")
            self.assertIn("already running", data["error"])
            self.wait_import_done()
        # after "done", a new import is accepted (and dedups cleanly)
        report = self.do_import()
        self.assertEqual(report["deduped"], 4)
        self.assertEqual(report["imported"], 0)

    def test_worker_error_releases_lock_and_surfaces(self):
        with failing_import():
            status, _ = self.request_json(
                "POST", "/api/import", {"path": str(self.source)})
            self.assertEqual(status, 200, "validation passed — the crash "
                             "happens inside the worker")
            snap = self.wait_import_done()
        self.assertEqual(snap["state"], "error")
        msg = snap["message"]
        self.assertTrue(msg and isinstance(msg, str),
                        "the error state carries a message")
        for shard in ("Traceback", "RuntimeError", "synthetic"):
            self.assertNotIn(shard, msg, "plain words, never a trace")
        # the write lock is free: a meta write lands...
        status, _ = self.request_json("POST", "/api/meta",
                                      {"room_entries": 1})
        self.assertEqual(status, 200, "the write lock was released")
        # ...the server still serves...
        status, _ = self.request_json("GET", "/api/status")
        self.assertEqual(status, 200)
        # ...and a fresh import is accepted after the error state.
        report = self.do_import()
        self.assertEqual(report["imported"], 4)

    def test_meta_write_during_running_import(self):
        # A meta write while the worker holds the write lock completes
        # (it blocks briefly) — never a deadlock — and the store ends up
        # whole, holding both the merge and the import.
        with slow_import():
            status, _ = self.request_json(
                "POST", "/api/import", {"path": str(self.source)})
            self.assertEqual(status, 200)
            status, _ = self.request_json("POST", "/api/meta",
                                          {"room_entries": 2})
            self.assertEqual(status, 200,
                             "the blocked meta write completes")
            snap = self.wait_import_done()
        self.assertEqual(snap["state"], "done")
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["room_entries"], 2)
        self.assertEqual(store["meta"]["last_import_report"]["imported"], 4)
        self.assertEqual(len(store["items"]), 4,
                         "the store is whole after both writes")

    def test_import_validation_spawns_nothing(self):
        # RV-2: validation failures 400 synchronously — no worker, no job
        # state change, nothing on disk.
        status, _ = self.request_json(
            "POST", "/api/import", {"path": str(self.tmp / "nope")})
        self.assertEqual(status, 400)
        status, _ = self.request_json(
            "POST", "/api/import",
            {"path": str(self.source), "consolidation": "keep-both"})
        self.assertEqual(status, 400)
        _, snap = self.request_json("GET", "/api/import-progress")
        self.assertEqual(snap["state"], "idle",
                         "a refused import never touches the job")
        self.assertFalse((self.library / "items.json").exists(),
                         "a refused import writes nothing")

    def test_scan_reports_adapter_fields(self):
        # /api/scan is adapter-aware through study_lib.scan_source (D-02:
        # no source-specific logic in server.py): folder sources carry
        # their adapter name with the established counts untouched; an
        # export source is recognized and counted in conversations — the
        # honest denominator the import readout divides by.
        status, data = self.request_json(
            "POST", "/api/scan", {"path": str(self.source)})
        self.assertEqual(status, 200)
        self.assertEqual(data["adapter"], "folder-drop")
        self.assertEqual(data["source_label"], "folder-drop")
        self.assertNotIn("conversations", data)
        export = self.tmp / "export"
        export.mkdir()
        fixture = (Path(__file__).parent / "fixtures" / "chatgpt_export" /
                   "conversations.json")
        (export / "conversations.json").write_bytes(fixture.read_bytes())
        status, data = self.request_json(
            "POST", "/api/scan", {"path": str(export)})
        self.assertEqual(status, 200)
        self.assertEqual(data["adapter"], "chatgpt-export")
        self.assertEqual(data["source_label"], "ai-chat-export")
        self.assertEqual(data["conversations"], 2)
        self.assertEqual(data["total"], 2)

    def test_export_import_through_worker(self):
        # An export source flows through the same worker lifecycle: the
        # POST's total is the conversation count and both fixture
        # conversations land as items.
        export = self.tmp / "export"
        export.mkdir()
        fixture = (Path(__file__).parent / "fixtures" / "chatgpt_export" /
                   "conversations.json")
        (export / "conversations.json").write_bytes(fixture.read_bytes())
        status, data = self.request_json(
            "POST", "/api/import", {"path": str(export)})
        self.assertEqual(status, 200)
        self.assertEqual(data["total"], 2)
        snap = self.wait_import_done()
        self.assertEqual(snap["state"], "done")
        self.assertEqual(snap["report"]["imported"], 2)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(len(store["items"]), 2)
        for item in store["items"].values():
            self.assertEqual(item["source"], "ai-chat-export")

    # -- 13. incidents (D-13, Phase 23) ------------------------------------------

    ISO_RE = r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$"

    def test_incident_append_semantics_server_stamped(self):
        self.do_import()
        line = {"item_id": "a" * 16, "surface": "shelf",
                "reason": "never_show"}
        for _ in range(2):
            status, _ = self.request_json(
                "POST", "/api/meta", {"incidents": [line]})
            self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        incidents = store["meta"]["incidents"]
        self.assertEqual(len(incidents), 2,
                         "posting only new lines APPENDS — never replaces")
        for entry in incidents:
            self.assertEqual(entry["item_id"], "a" * 16)
            self.assertEqual(entry["surface"], "shelf")
            self.assertEqual(entry["reason"], "never_show")
            self.assertRegex(entry["at"], self.ISO_RE,
                             "the server stamps `at` itself")

    def test_incident_rejects_client_stamp_and_bad_shapes(self):
        self.do_import()
        for payload in (
            {"incidents": {"item_id": "x", "surface": "s",
                           "reason": "r"}},                  # not a list
            {"incidents": [["x"]]},                          # not an object
            {"incidents": [{"item_id": "x", "surface": "s"}]},
            {"incidents": [{"item_id": "x", "surface": "s", "reason": "r",
                            "at": "2020-01-01T00:00:00+00:00"}]},
            {"incidents": [{"item_id": 1, "surface": "s", "reason": "r"}]},
        ):
            status, data = self.request_json("POST", "/api/meta", payload)
            self.assertEqual(status, 400, f"{payload} must be refused")
            self.assertIn("error", data)
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["incidents"], [],
                         "a refused line never enters the log")

    def test_incident_concurrent_posts_both_survive(self):
        self.do_import()
        results = []

        def post(reason):
            status, _ = self.request_json("POST", "/api/meta", {
                "incidents": [{"item_id": "a" * 16, "surface": "shelf",
                               "reason": reason}]})
            results.append(status)

        threads = [threading.Thread(target=post, args=(f"leak-{n}",))
                   for n in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)
        self.assertEqual(results, [200, 200])
        _, store = self.request_json("GET", "/api/items")
        reasons = sorted(e["reason"] for e in store["meta"]["incidents"])
        self.assertEqual(reasons, ["leak-0", "leak-1"],
                         "two concurrent incident posts BOTH survive")

    def test_incident_list_caps_at_newest_200(self):
        self.do_import()
        first = [{"item_id": "a" * 16, "surface": "shelf",
                  "reason": f"r{n}"} for n in range(150)]
        second = [{"item_id": "a" * 16, "surface": "shelf",
                   "reason": f"r{n}"} for n in range(150, 210)]
        for batch in (first, second):
            status, _ = self.request_json(
                "POST", "/api/meta", {"incidents": batch})
            self.assertEqual(status, 200)
        _, store = self.request_json("GET", "/api/items")
        incidents = store["meta"]["incidents"]
        self.assertEqual(len(incidents), 200, "capped at the newest 200")
        self.assertEqual(incidents[0]["reason"], "r10",
                         "the oldest lines fall off the front")
        self.assertEqual(incidents[-1]["reason"], "r209",
                         "the newest line survives at the back")

    # -- 14. library re-point migrates a pre-existing v1 store (SRM-05) ---------

    def test_library_repoint_migrates_preexisting_v1_store(self):
        old_lib = self.tmp / "old-room"
        old_lib.mkdir()
        created_ms = 1688212800000  # 2023-07-01T12:00:00Z, mid-year safe
        v1 = {
            "schema_version": 1,
            "meta": {"library_root": str(old_lib), "consolidation": None,
                     "habit_anchor": None, "habit_anchor_asked": False,
                     "cycle": {"number": 1, "shown_ids": []},
                     "current_shelf": None, "last_import_report": None},
            "items": {"a" * 16: {
                "id": "a" * 16, "content_hash": "a" * 64,
                "source": "folder-drop",
                "origin_path": "/somewhere/notes/note.md",
                "library_path": "items/" + "a" * 16 + ".md",
                "type": "text", "title": "note.md",
                "created_ms": created_ms, "saved_ms": created_ms,
                "imported_ms": created_ms, "last_opened_ms": None,
                "state": "blessed", "resting_until_ms": None, "tags": [],
                "trigger": False, "history": []}},
        }
        (old_lib / "items.json").write_text(json.dumps(v1),
                                            encoding="utf-8")
        status, _ = self.request_json(
            "POST", "/api/library", {"path": str(old_lib)})
        self.assertEqual(status, 200,
                         "re-pointing at a v1 library migrates it")
        self.assertTrue((old_lib / "items.json.v1.bak").is_file(),
                        "the same one-time backup as startup")
        migrated = json.loads(
            (old_lib / "items.json").read_text(encoding="utf-8"))
        self.assertEqual(migrated["schema_version"], 3)
        item = migrated["items"]["a" * 16]
        self.assertEqual(item["year"],
                         datetime.fromtimestamp(created_ms / 1000).year)
        self.assertIsInstance(item["year"], int)
        self.assertEqual(item["folder"], "notes")
        self.assertEqual(item["state"], "blessed",
                         "judgments survive the migration untouched")

    # -- 17. layout (D-03/D-04/D-05, Phase 24.1) --------------------------------

    def test_layout_missing_file_returns_null(self):
        # a fresh store dir has no layout.json — the client keeps its
        # shipped inline positions (fail-open read, D-04)
        status, data = self.request_json("GET", "/api/layout")
        self.assertEqual(status, 200)
        self.assertEqual(data, {"ok": True, "layout": None})

    def test_layout_roundtrip(self):
        self.do_import()
        items_before = (self.library / "items.json").read_bytes()
        doc = {
            "version": 1,
            "objects": {"bookshelf": {"x": 12, "y": 56},
                        "desk": {"x": 216, "y": 112}},
            "added": [{"slot": "add.plant.x1", "sprite": "decor-plant",
                       "cls": "floor", "x": 12, "y": 124}],
            "removed": ["add.something.x"],
        }
        status, data = self.request_json("POST", "/api/layout", doc)
        self.assertEqual(status, 200, f"valid layout refused: {data}")
        status, data = self.request_json("GET", "/api/layout")
        self.assertEqual(status, 200)
        self.assertEqual(data["layout"], doc,
                         "the exact posted document comes back")
        self.assertTrue((self.library / "layout.json").exists(),
                        "layout.json lands beside items.json in the "
                        "store dir")
        self.assertEqual((self.library / "items.json").read_bytes(),
                         items_before,
                         "a layout write never touches items.json — "
                         "META_KEYS is not widened; layout is a separate "
                         "file by design (D-04)")

    def test_layout_bad_shapes_400(self):
        self.do_import()
        over_cap = [{"slot": f"add.rug.{n}", "sprite": "decor-plant",
                     "cls": "floor", "x": 0, "y": 0} for n in range(65)]
        for payload in (
            {"version": 2},                                # wrong version
            {"version": True},                             # bool is not 1
            {"version": 1,
             "objects": {"cat": {"x": 0, "y": 0}}},        # unknown id
            {"version": 1,
             "objects": {"bookshelf": {"x": 10,
                                       "y": 56}}},         # off the 12px grid
            {"version": 1,
             "objects": {"bookshelf": {"x": 313,
                                       "y": 56}}},         # out of bounds
            {"version": 1,
             "objects": {"bookshelf": {"x": 12,
                                       "y": -12}}},        # negative y
            {"version": 1,
             "objects": {"bookshelf": {"x": "12",
                                       "y": 56}}},         # string x
            {"version": 1, "removed": ["journal"]},        # functional object
                                                           # — the move-only
                                                           # law (D-05)
            {"version": 1,
             "added": [{"slot": "a", "sprite": "not-a-real-sprite",
                        "cls": "floor", "x": 0, "y": 0}]},  # roster miss
            {"version": 1,
             "added": [{"slot": "a", "sprite": "decor-plant",
                        "cls": "roof", "x": 0, "y": 0}]},   # unknown class
            {"version": 1, "added": over_cap},             # over the 64 cap
            {"version": 1, "extra": []},                   # unknown top-level
                                                           # key (whitelist)
        ):
            status, data = self.request_json("POST", "/api/layout", payload)
            self.assertEqual(status, 400, f"{payload} must be refused")
            self.assertIn("error", data)
            self.assertFalse((self.library / "layout.json").exists(),
                             "a refused write persists nothing — "
                             "layout.json is never created by a 400")

    def test_layout_roster_extension_roundtrip(self):
        # 24.1-04: the catalog's net-new sprite names are roster members
        # now — added rug/art/books/plant-b entries validate and
        # roundtrip, and a removed shipped decor piece (an accessory,
        # never functional) passes the move-only fence.
        self.do_import()
        doc = {
            "version": 1,
            "added": [{"slot": "add.rug.x1", "sprite": "decor-rug",
                       "cls": "floor", "x": 156, "y": 152, "variant": 0},
                      {"slot": "add.art.x2", "sprite": "decor-art-b",
                       "cls": "wall", "x": 48, "y": 48, "variant": 1},
                      {"slot": "add.books.x3", "sprite": "decor-books",
                       "cls": "floor", "x": 96, "y": 154},
                      {"slot": "add.plant-b.x4", "sprite": "decor-plant-b",
                       "cls": "floor", "x": 60, "y": 138},
                      {"slot": "add.rug.x5", "sprite": "decor-rug-b",
                       "cls": "floor", "x": 204, "y": 152}],
            "removed": ["candle"],
        }
        status, data = self.request_json("POST", "/api/layout", doc)
        self.assertEqual(status, 200, f"valid layout refused: {data}")
        status, data = self.request_json("GET", "/api/layout")
        self.assertEqual(status, 200)
        self.assertEqual(data["layout"], doc,
                         "the exact posted document comes back")

    def test_layout_roster_extension_still_fails_closed(self):
        # The wider roster changes nothing about the fence: an unknown
        # sprite name still 400s, and a functional object in `removed`
        # still 400s (the move-only law, D-05) — regression rows for
        # the 24.1-04 extension.
        self.do_import()
        for payload in (
            {"version": 1,
             "added": [{"slot": "a", "sprite": "decor-nonexistent",
                        "cls": "floor", "x": 0, "y": 0}]},
            {"version": 1, "removed": ["desk"]},
        ):
            status, data = self.request_json("POST", "/api/layout", payload)
            self.assertEqual(status, 400, f"{payload} must be refused")
            self.assertIn("error", data)
            self.assertFalse((self.library / "layout.json").exists(),
                             "a refused write persists nothing")

    def test_layout_corrupt_file_returns_null(self):
        # a hand-edited/damaged layout.json must never block the room:
        # GET answers null and the shipped positions stand (fail-open
        # read is safe here — contrast items.json, where refusal
        # protects judgments)
        (self.library / "layout.json").write_bytes(b"{ not json !!")
        status, data = self.request_json("GET", "/api/layout")
        self.assertEqual(status, 200)
        self.assertEqual(data, {"ok": True, "layout": None})


class CorruptStoreRefusalTest(unittest.TestCase):
    """6. A damaged items.json means REFUSE — never reinitialize."""

    def test_create_server_refuses_truncated_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            lib.mkdir()
            damaged = b'{"schema_version": 2, "items": {'
            (lib / "items.json").write_bytes(damaged)
            with self.assertRaises(study_lib.StoreCorruptError):
                server.create_server(lib, 0)
            self.assertEqual((lib / "items.json").read_bytes(), damaged,
                             "the damaged store is left byte-for-byte alone")


# ---------------------------------------------------------------------------
# 19. the librarian seam (26-01, SRM-11/SRM-13) — flag, probe, status
# route, and the ONE subprocess choke point. Hermetic: a fake `claude`
# stub (tests/fixtures/fake_claude/claude) is prepended to PATH — the
# 25-03 shim precedent, applied at the PATH seam. The stub records argv +
# full stdin + env key NAMES to FAKE_CLAUDE_LOG and prints the canned
# --output-format json envelope; no network, no key, no real CLI anywhere
# in this suite, and never the live store at ~/StudyRoom — temp dirs only.
# ---------------------------------------------------------------------------

FAKE_CLAUDE_DIR = Path(__file__).resolve().parent / "fixtures" / "fake_claude"
FENCE_MARK = "FENCE-SENTINEL"

# ---------------------------------------------------------------------------
# ⚠⚠ TWO HERMETIC SEAMS NOW, NOT ONE, AND KEEPING BOTH IS THE POINT (26.93-07).
#
# The librarian's route to a model moved to HTTP, so its interception moved to
# `librarian_call._transport`. A spawned-program site used to survive in
# `server.py` — the vault tidy-up — and it resolved `claude` on PATH, so
# `fake_claude_env` installs BOTH: the fake transport for the librarian and the
# fake program on PATH.
#
# ⚠ THE VAULT TIDY-UP WAS DELETED 2026-08-14 (#56), SO THE PATH HALF NOW HAS NO
# PRODUCT SITE BEHIND IT — and it is deliberately KEPT anyway. Two reasons, and
# neither is inertia. It is a NEGATIVE control: any future code that reaches for
# a `claude` binary finds the fake rather than a real one, so a re-introduced
# spawn cannot quietly touch a real machine from inside a test sweep. And
# dropping it has already caused one regression — the deleted route test's happy
# path once went to `error` because nothing was found on PATH — so a reader
# tidying away a "dead" prepend should find the reason before the diff.
#
# ⚠ IF IT IS EVER REMOVED, the pins that make it unnecessary must be checked
# first: tests/test_no_push.cjs asserts the permission-waiver keyword and the
# sandbox-profile builder are absent from server.py. Those two are what actually
# guarantee no privileged spawn returns; this prepend is a belt beside them.

# ---------------------------------------------------------------------------
# 26.93-07 — THE HERMETIC SEAM MOVED FROM PATH TO THE TRANSPORT.
#
# WHAT BROKE AND WHY THE REPAIR IS SHAPED LIKE THIS. Until 26.93-06 every
# librarian job in this suite was intercepted by a fake `claude` program
# prepended to PATH. Seven jobs then moved onto HTTP, which does not consult
# PATH at all, so the interception silently stopped happening and the calls
# went to a REAL provider — with HOME let through, that meant the owner's real
# key and a real Opus answer. The interception point moves to
# `librarian_call._transport`: the module attribute that is the seam's ONE
# injection point, swapped from this test process and by no other means.
#
# ⚠ THE TOGGLES ARE UNCHANGED ON PURPOSE. Every scenario in this file keeps
# the exact control surface it already had — FAKE_CLAUDE_REFLECTION,
# FAKE_CLAUDE_LABELS, FAKE_CLAUDE_ROGUE_ID and the rest — and the priority
# order below is the retired program's, copied deliberately rather than
# reinvented. Only the PLACE the canned answer is produced has moved, so a
# reader comparing a test against its scenario finds the same names.
#
# ⚠ WHY AN OLLAMA-SHAPED ENVELOPE ANSWERS EVERY JOB. With HOME swapped to a
# fresh temp root and both key names popped, `key_present` is False for both
# companies, so `resolve_routing` fills ALL THREE tiers with `LOCAL_FILL` —
# the documented answer for a machine with no cloud key (#28 section 1). Every
# job therefore goes through `build_ollama_request`, and one envelope shape is
# enough. That is not a shortcut: it is the same fact that makes the isolation
# free, and a case below asserts it rather than assuming it.
FAKE_CLAUDE_LOG_NAME = "FAKE_CLAUDE_LOG"

# The toggles the retired program read, listed so the environment can be
# cleaned between scenarios without naming them at each call site.
STUB_TOGGLES = (
    FAKE_CLAUDE_LOG_NAME, "FAKE_CLAUDE_FAIL", "FAKE_CLAUDE_ROGUE_ID",
    "FAKE_CLAUDE_COST", "FAKE_CLAUDE_SLOW", "FAKE_CLAUDE_NOTE",
    "FAKE_CLAUDE_QUESTION", "FAKE_CLAUDE_TOPIC", "FAKE_CLAUDE_CONNECTIONS",
    "FAKE_CLAUDE_REFLECTION", "FAKE_CLAUDE_REFLECTION_BAD",
    "FAKE_CLAUDE_REFLECTION_ECHO", "FAKE_CLAUDE_LABELS",
    # ⛔ 26.995-12 (D-13, RESEARCH Pitfall 9): the DELIBERATELY
    # NON-COMPLIANT provider. `coda` left the wire, so the echo builder
    # below stopped emitting it — but a harness that merely STOPS emitting a
    # removed field proves nothing, because the closed-properties flag lives
    # on the SCHEMA and never on validate_reflection, which reads named keys
    # and ignores strangers. This toggle makes the stub answer OFF-CONTRACT
    # on purpose, so a case can watch the removed field arrive and watch it
    # reach neither the session document nor the persisted body.
    "FAKE_CLAUDE_REFLECTION_STALE_CODA",
    # 26.995-25: what the second read answers. Absent means "clean", so every
    # case that predates her ruling reads the way it always did; a verdict
    # name drives the rejection arms, and "unreachable" drives the fail-closed
    # one. Cleared with every other toggle on entry.
    "FAKE_CLAUDE_JUDGE",
    # 26.93-07's one addition: the translated "nothing to answer with"
    # scenario. See `fake_claude_env`'s `path_dirs` note.
    "FAKE_LOCAL_ABSENT",
    # map #50 / #68 ruling 2: destroy the first N answers the way the size
    # limit destroys a long essay. Cleared with every other toggle on entry —
    # a leaked one would make a later test's first call arrive pre-destroyed.
    "FAKE_CLAUDE_TRUNCATE_FIRST",
    # 26.995-03 task 5 (COPY § C-6): refuse the first N answers ON CONTENT,
    # the way `FAKE_CLAUDE_TRUNCATE_FIRST` destroys the first N on transport.
    # A COUNT rather than a boolean for the same reason that one is: a test
    # must be able to prove the SECOND go LANDS, which is the whole of the
    # ruling, and not merely that the first one was refused. Cleared with
    # every other toggle on entry — a leaked one would make a later test's
    # first call arrive pre-refused.
    "FAKE_CLAUDE_REFLECTION_BAD_FIRST",
)


def stub_structured(payload_text):
    """The canned structured answer, chosen exactly as the retired PATH
    program chose it: BAD > ECHO > REFLECTION > CONNECTIONS > LABELS >
    NOTE/QUESTION > verdicts.

    `payload_text` is what the app actually sent — the user message out of the
    built request — so ECHO mode still quotes her own chat lines back
    byte-verbatim, which is the whole of the 26.7-03 claim."""
    reflection = os.environ.get("FAKE_CLAUDE_REFLECTION")
    if os.environ.get("FAKE_CLAUDE_REFLECTION_BAD") == "1":
        return {"not_a_reflection": "this shape must be rejected",
                "extra": True}
    # 26.995-03 task 5: the SAME schema-violating envelope, but only for the
    # first N answers, so a case can drive "refused once, then it lands" —
    # the arm that proves a loop actually retries rather than merely
    # swallowing the failure. Checked BEFORE echo mode so the recover arm can
    # ask for both (bad first, then a real echoed revision).
    bad_first = os.environ.get("FAKE_CLAUDE_REFLECTION_BAD_FIRST")
    if bad_first:
        _BAD_FIRST_STATE["seen"] += 1
        if _BAD_FIRST_STATE["seen"] <= int(bad_first):
            return {"not_a_reflection": "this shape must be rejected",
                    "extra": True}
    if os.environ.get("FAKE_CLAUDE_REFLECTION_ECHO") == "1":
        try:
            doc = json.loads(payload_text)
        except ValueError:
            doc = {}
        chat = doc.get("chat") if isinstance(doc, dict) else []
        said = [str(t.get("text"))
                for t in (chat if isinstance(chat, list) else [])
                if isinstance(t, dict) and t.get("who") == "user"]
        pad = ("the thread you hold: one pattern learned closely, then "
               "trusted at a larger scale. ") * 8
        quoted = " ".join('you added "' + s + '" and it stays in your '
                          "own words." for s in said)
        # ⛔ 26.995-12 (D-13): THE REVISED DRAFT IS WHERE HER WORDS LIVE,
        # and `quoted` is what puts them there — each of her turns, verbatim,
        # inside the writing. That is the WEAVING the prompt now asks for
        # (26.995-07), and it is what tests/test_reflection_verbatim.cjs
        # reads. It was already true before this change; what changed is
        # that it is now the ONLY place they survive.
        structured = {
            "reflection": "## the thread\n\n" + pad + quoted +
                          "\n\nUse: carry one small thread forward tonight.",
            # ⛔ 26.995-12 (D-13): `"coda": ("from our conversation — " +
            # " / ".join(said)) if said else None` STOOD HERE. The field left
            # the wire, so the compliant stub stops emitting it — and a stub
            # that KEPT emitting it would have passed silently, because the
            # validator ignores strangers. That is exactly why the
            # non-compliant arm below is a deliberate toggle rather than a
            # deleted line: the absence assertions are driven against BOTH.
            # ⛔ 26.995-06 task 2 (D-05): the question field is gone from
            # the wire, so the stub stops emitting one. A stub that kept
            # emitting a removed field would pass silently — the
            # closed-properties flag lives on the SCHEMA, not on
            # validate_reflection — and every test built on it would prove
            # nothing. `FAKE_CLAUDE_QUESTION` still drives the NOTE call's
            # own question below; that is a different feature.
        }
        if reflection is not None:
            try:
                robj = json.loads(reflection)
            except ValueError:
                robj = {}
            if isinstance(robj, dict) and "whys" in robj:
                structured["whys"] = robj.get("whys")
            # 26.995-06 task 1a: the SPOKEN REPLY pass-through, mirrored from
            # the whys line above for exactly the same reason — an
            # explicit-key rebuild silently DROPS anything it does not name,
            # and a dropped field makes every test of that field vacuous
            # (Pitfall 2). Present rides through unchanged; absent stays
            # absent, so the caller's fallback is what a silent turn shows.
            if isinstance(robj, dict) and "said" in robj:
                structured["said"] = robj.get("said")
        # ⛔ THE DELIBERATELY NON-COMPLIANT ARM (26.995-12, D-13). Answer
        # off-contract, with the retired field carrying real text, so a case
        # can prove the absence downstream is true of the CODE rather than of
        # this fixture.
        if os.environ.get("FAKE_CLAUDE_REFLECTION_STALE_CODA") == "1":
            structured["coda"] = ("from our conversation — "
                                  + " / ".join(said)) if said else "stale"
        return structured
    if reflection is not None:
        try:
            obj = json.loads(reflection)
        except ValueError:
            obj = {}
        if not isinstance(obj, dict):
            obj = {}
        # 26.995-06 task 2 (D-05): no question key — see the echo builder.
        # ⛔ 26.995-12 (D-13): this read
        # `{"reflection": ..., "coda": obj.get("coda")}` — the removed field
        # was rebuilt unconditionally on every answer. It is now an EXPLICIT,
        # NAMED pass-through like `whys` and `said` below: present only when
        # a case deliberately asks for it, which is the only way an
        # off-contract answer can be driven on purpose rather than by
        # accident.
        structured = {"reflection": str(obj.get("reflection") or "")}
        if "coda" in obj:
            structured["coda"] = obj.get("coda")
        if "whys" in obj:
            structured["whys"] = obj.get("whys")
        # 26.995-06 task 1a: the spoken reply, on the same explicit
        # pass-through as whys above — see that comment for why an unnamed
        # key would make every test of this field vacuous.
        if "said" in obj:
            structured["said"] = obj.get("said")
        return structured
    connections = os.environ.get("FAKE_CLAUDE_CONNECTIONS")
    if connections is not None:
        try:
            conns = json.loads(connections)
        except ValueError:
            conns = []
        return {"connections": conns if isinstance(conns, list) else []}
    labels = os.environ.get("FAKE_CLAUDE_LABELS")
    if labels is not None:
        try:
            parsed = json.loads(labels)
        except ValueError:
            parsed = []
        return {"labels": parsed if isinstance(parsed, list) else []}
    note = os.environ.get("FAKE_CLAUDE_NOTE")
    question = os.environ.get("FAKE_CLAUDE_QUESTION")
    if note is not None or question is not None:
        return {"note": note or "",
                "question": question or None,
                "topic": os.environ.get("FAKE_CLAUDE_TOPIC") or None}
    verdicts = []
    rogue = os.environ.get("FAKE_CLAUDE_ROGUE_ID")
    if rogue:
        verdicts.append({"id": rogue, "shelf": "joyful",
                         "why": "a made-up id the server must drop"})
    return {"verdicts": verdicts}


# map #50 / #68 ruling 2: how many answers this process has destroyed so far.
# Reset by fake_claude_env on entry, so a count never leaks between tests —
# a leaked count would silently make a later test's FIRST call its second.
_TRUNCATE_STATE = {"seen": 0}
# 26.995-03 task 5. Two counters, and they are deliberately NOT one: the
# first counts answers destroyed on TRANSPORT, the second answers refused on
# CONTENT, and the whole of #68 ruling 2 rests on those never standing in for
# each other. `_CALL_STATE` counts every answered call regardless of either,
# because task 5's claim is a NUMBER OF CALLS — 1 when the first attempt
# passes, 2 when it recovers, 2 when it fails twice — and a loop that always
# retries and one that never retries are indistinguishable without it.
_BAD_FIRST_STATE = {"seen": 0}
_CALL_STATE = {"seen": 0}


def calls_seen():
    """How many answering calls the seam has served since the env was entered.

    ⚠ Counts ANSWERED calls only — the free no-body probe is not a call and
    is excluded at its own early return, which is what makes a comparison
    against a literal meaningful."""
    return _CALL_STATE["seen"]


def stub_transport(request, timeout_s, auth=None):
    """Answer one built request without opening anything.

    ⚠ IT RECORDS WHAT THE APP ACTUALLY SENT, and that record is what every
    fence assertion in this file reads. The key under `stdin` keeps its old
    NAME deliberately: the claim those assertions make — "the builder's bytes
    and nothing else reach the model" — is unchanged, and renaming the field
    would have meant rewriting a dozen leak proofs whose wording is still
    exactly right. What it holds is now the user message out of the request
    body rather than a pipe's contents.

    ⚠ `auth` IS RECORDED SEPARATELY AND NEVER INSPECTED FOR ITS VALUE. It
    arrives as its own argument precisely so no credential is ever inside the
    recorded request; a case below asserts the recorded request holds none."""
    del timeout_s
    body = request.get("body") or {}
    payload_text = ""
    system_text = ""
    for message in (body.get("messages") or []):
        if isinstance(message, dict) and message.get("role") == "user":
            payload_text = str(message.get("content") or "")
        if isinstance(message, dict) and message.get("role") == "system":
            system_text = str(message.get("content") or "")
    log = os.environ.get(FAKE_CLAUDE_LOG_NAME)

    # ⛔⛔ 26.995-25: THE SECOND READ IS ANSWERED HERE, AND IT IS ANSWERED
    # FIRST. Her ruling of 2026-08-21 puts a judging call after every
    # reflection draft, so every end-to-end reflection case in five suites now
    # makes TWO calls where it made one. Without this branch the judge is
    # answered with a reflection envelope, the fail-closed screen reads no
    # usable verdict, and the sitting dies on `judge_unreachable` — which is
    # the screen working, and is not what those cases are about.
    #
    # ⚠ THE JOB IS IDENTIFIED BY ITS OWN BOUND PROMPT, out of the seam's own
    # table, rather than by sniffing the payload. A caller may name only a
    # job, so the system message IS the job's identity at this boundary, and a
    # payload sniff would go quietly wrong the first time a draft happened to
    # look like something else.
    #
    # ⛔ IT DOES NOT TOUCH THE MAIN LOG, and that is deliberate rather than
    # lazy. The log is written with "w" on every call, so a judging call
    # landing after the reflection would OVERWRITE the recorded reflection
    # request — and a dozen fence proofs read exactly that record. The judge's
    # own request is written to a sibling file instead, so the leak proofs
    # keep their subject AND the judge's payload stays inspectable rather than
    # becoming the one call nothing can see.
    judge_prompt = (L.JOBS.get("reflection_judge") or {}).get("prompt")
    if judge_prompt and system_text == judge_prompt:
        if log:
            with open(str(log) + ".judge", "w", encoding="utf-8") as fh:
                fh.write(json.dumps({"stdin": payload_text,
                                     "url": request.get("url"),
                                     "had_auth": auth is not None},
                                    ensure_ascii=False))
        verdict = os.environ.get("FAKE_CLAUDE_JUDGE") or "clean"
        if verdict == "unreachable":
            # a judge that cannot be reached — the fail-closed arm.
            return 500, {}, b"{}"
        return 200, {}, json.dumps({
            "model": L.LOCAL_FILL[1],
            "done_reason": "stop",
            "message": {"role": "assistant",
                        "content": json.dumps({"verdict": verdict})},
            "prompt_eval_count": 7,
            "eval_count": 2,
        }).encode("utf-8")

    if log and request.get("body") is not None:
        rec = {"stdin": payload_text,
               "url": request.get("url"),
               "body": body,
               "had_auth": auth is not None,
               "env_keys": sorted(os.environ.keys())}
        with open(log, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False))

    # The free local question the front door asks. It carries no body, so it
    # is answered before any of the canned-answer machinery below.
    if request.get("body") is None:
        if os.environ.get("FAKE_LOCAL_ABSENT") == "1":
            # ⚠ THE TRANSLATION OF THE OLD "NO PROGRAM ON PATH" SCENARIO.
            # `None` is a connection that never opened, which `classify_status`
            # reads as `ollama_not_running` for her own machine — the nearest
            # true fact to what an absent program used to mean. It is NOT the
            # same sentence, and it must not be: the old one told her to set up
            # a program that no longer exists.
            return None, {}, b""
        return 200, {}, json.dumps({"models": [
            {"name": L.PROBE_LANGUAGE_TAG},
            {"name": L.PROBE_SEARCH_TAG + ":v1.5"},
        ]}).encode("utf-8")

    # 26.995-03 task 5: every ANSWERING call is counted here — after the free
    # no-body probe has already returned above, so a probe can never inflate
    # a call count a test asserts by value.
    _CALL_STATE["seen"] += 1
    slow = os.environ.get("FAKE_CLAUDE_SLOW")
    if slow:
        time.sleep(float(slow))
    # map #50 / #68 ruling 2: destroy the first N answers the way the size
    # limit destroys a long essay — `done_reason` anything but "stop", which
    # the seam reads as `truncated` BEFORE it attempts any parse. A count
    # rather than a boolean, so a test can prove the SECOND go lands (the
    # whole of the ruling) and not merely that the first one failed.
    truncate_first = os.environ.get("FAKE_CLAUDE_TRUNCATE_FIRST")
    if truncate_first:
        _TRUNCATE_STATE["seen"] += 1
        if _TRUNCATE_STATE["seen"] <= int(truncate_first):
            return 200, {}, json.dumps({
                "model": L.LOCAL_FILL[1],
                "done_reason": "length",
                "message": {"role": "assistant", "content": ""},
            }).encode("utf-8")
    if os.environ.get("FAKE_CLAUDE_FAIL") == "1":
        # ⚠ TRANSLATED, NOT DROPPED. The retired program exited non-zero and
        # every failure collapsed into one static line. There is no exit code
        # now, so the equivalent driver is a status the closed register reads
        # as a provider that would not answer — which is what the migrated
        # room shows her instead of the one old line (26.93-06, D-06).
        return 500, {}, b"{}"
    return 200, {}, json.dumps({
        "model": L.LOCAL_FILL[1],
        "done_reason": "stop",
        "message": {"role": "assistant",
                    "content": json.dumps(stub_structured(payload_text))},
        "prompt_eval_count": 41,
        "eval_count": 12,
    }).encode("utf-8")


def no_cached_probe():
    """A named no-op standing where `no_cached_probe()` stood.

    26.93-07 deleted the per-process look-up that cached whether a `claude`
    program was installed and new enough. `librarian_available` resolves
    routing fresh on every call now, so there is nothing left to forget
    between tests — and these call sites were hygiene, never assertions, so
    nothing is weakened by their becoming inert.

    ⚠ KEPT AS ONE NAMED FUNCTION RATHER THAN DELETED LINE BY LINE, on purpose.
    Roughly two dozen tests called that reset. Deleting each line would leave a
    diff in which a reader cannot tell "this stopped being needed" from "this
    was dropped by accident"; one function with this docstring answers the
    question once, at the place a reader will look."""
    return None


def assert_under_temp_root(root):
    """Every path the swapped home can reach is inside the tree this suite
    made. `realpath` on both sides because the system temp location is itself
    a symlink on macOS. Raises before anything is written."""
    here = os.path.realpath(str(root))
    for path in (study_lib.room_config_dir(), L.settings_path(),
                 L.keys_path()):
        got = os.path.realpath(str(path))
        if not (got == here or got.startswith(here + os.sep)):
            raise AssertionError(
                "a path this suite is about to write is not under its own "
                "temp root")
    if os.path.realpath(str(study_lib.room_config_dir())) == \
            os.path.realpath(REAL_ROOM_DIR):
        raise AssertionError("the swapped home still resolves to the real "
                             "config directory")


@contextmanager
def fake_claude_env(log_path, extra=None, path_dirs=None):
    """Make the librarian hermetic AND unable to spend money, for the
    duration.

    ⚠ `path_dirs` USED TO PIN PATH TO A DIRECTORY WITH NO `claude` IN IT, and
    it is KEPT — under a translated meaning — rather than removed. PATH decides
    nothing about the librarian any more, so the scenario those call sites
    wanted ("the librarian has nothing to answer with") is now expressed as
    nothing answering on her own machine. Passing it makes the local probe
    report a dead connection; the value itself is no longer read, because there
    is no longer anything a directory of programs could change.

    FOUR THINGS, AND ALL FOUR ARE LOAD-BEARING:
      1. HOME is swapped to a fresh temp root, so `key_present` answers False
         for both companies and every tier resolves to her own machine. This
         is what keeps the owner's real key out of reach;
      2. the two key names and the three fill names are popped, so a developer
         shell that exports one cannot steer a run here;
      3. `librarian_call._transport` becomes the recorder above — nothing
         opens a socket, and what the app sends is captured before one exists;
      4. `librarian_call._sleep` becomes a no-op, so a retried token costs no
         wall clock.

    Restores all four on exit, whatever happens. The test server runs in THIS
    process, so the environment changes reach its handlers directly."""
    tmp_home = tempfile.mkdtemp(prefix="study-room-smoke-home-")
    saved_env = {"HOME": os.environ.get("HOME"),
                 "PATH": os.environ.get("PATH")}
    for name in (list(L.KEY_ENV_NAMES.values())
                 + list(L.FILL_ENV_NAMES.values())
                 + list(STUB_TOGGLES)):
        saved_env[name] = os.environ.get(name)
    saved_transport = L._transport
    saved_sleep = L._sleep
    try:
        os.environ["HOME"] = tmp_home
        for name in (list(L.KEY_ENV_NAMES.values())
                     + list(L.FILL_ENV_NAMES.values())
                     + list(STUB_TOGGLES)):
            os.environ.pop(name, None)
        # ⚠ BEFORE ANYTHING IS WRITTEN, AND BEFORE ANY CALL IS POSSIBLE.
        assert_under_temp_root(tmp_home)
        os.environ[FAKE_CLAUDE_LOG_NAME] = str(log_path)
        # ⚠ THE SECOND SEAM: the vault tidy-up (#44) still spawns `claude`, so
        # the fake program stays on PATH for it. `path_dirs` pins PATH to a
        # directory with no program in it — which is still a REAL scenario for
        # that path — and additionally makes the local rung answer nothing, so
        # the librarian half of the same scenario stays expressible.
        os.environ["PATH"] = (
            path_dirs if path_dirs is not None
            else str(FAKE_CLAUDE_DIR) + os.pathsep + os.environ.get("PATH", ""))
        if path_dirs is not None:
            os.environ["FAKE_LOCAL_ABSENT"] = "1"
        if extra:
            os.environ.update(extra)
        _TRUNCATE_STATE["seen"] = 0
        _BAD_FIRST_STATE["seen"] = 0
        _CALL_STATE["seen"] = 0
        L._transport = stub_transport
        L._sleep = lambda seconds: None
        yield
    finally:
        L._transport = saved_transport
        L._sleep = saved_sleep
        for name, value in saved_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        shutil.rmtree(tmp_home, ignore_errors=True)


def build_sentinel_store(lib):
    """A store dict + on-disk snapshots where every fenced item's body and
    title carry unique FENCE markers, plus two safe items. Returns
    (store, fenced_ids). Same shape the fence property suite uses — this
    copy feeds the end-to-end stub proof."""
    lib = Path(lib)
    (lib / "items").mkdir(parents=True, exist_ok=True)
    store = study_lib.new_store(lib)
    store["meta"]["filters"] = [{"facet": "tag", "value": "heavy-box"}]

    def add(i, state, trigger=False, tags=(), fenced=False):
        item_id = format(0xa0 + i, "016x")
        body = (f"{FENCE_MARK}-{item_id} 私密的手记" if fenced
                else f"SAFE-BODY-{item_id} 安全的手记")
        (lib / "items" / f"{item_id}.md").write_text(body,
                                                     encoding="utf-8")
        store["items"][item_id] = {
            "id": item_id, "content_hash": item_id * 4,
            "source": "folder-drop",
            "origin_path": f"/src/notes/unit-{i}.md",
            "library_path": f"items/{item_id}.md", "type": "text",
            "title": (f"FENCE-TITLE-{item_id}.md" if fenced
                      else f"note-{i}.md"),
            "created_ms": 1700000000000 + i,
            "saved_ms": 1700000000000 + i,
            "imported_ms": 1700000000000 + i, "last_opened_ms": None,
            "state": state, "resting_until_ms": None,
            "tags": list(tags), "trigger": trigger,
            "year": 2021, "folder": "notes", "history": [],
        }
        return item_id

    fenced_ids = [add(1, "never_show", fenced=True),
                  add(2, "retired", fenced=True),
                  add(3, "blessed", trigger=True, fenced=True),
                  add(4, "blessed", tags=("heavy-box",), fenced=True)]
    add(5, "blessed")
    add(6, "unseen")
    return store, fenced_ids


class LibrarianSeamTest(unittest.TestCase):
    """26-01: status route, fail-closed flag, choke-point leak proof, and
    the failure register — all against the fake `claude` stub."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.library = self.tmp / "library"
        self.library.mkdir()
        # 26.93-07: there is no cached program look-up to reset any more —
        # `librarian_available` resolves routing fresh on every call, so a
        # per-test reset had nothing left to do.
        with server.JOB_LOCK:
            server.IMPORT_JOB.update(state="idle", total=0, done=0,
                                     started_ms=0, report=None,
                                     message=None)
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

    # -- tiny http helpers (the ServerSmokeTest shape) -----------------------

    def request(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port,
                                          timeout=10)
        try:
            if body is not None:
                raw = json.dumps(body).encode("utf-8")
                conn.request(method, path, raw,
                             {"Content-Type": "application/json"})
            else:
                conn.request(method, path)
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def request_json(self, method, path, body=None):
        status, raw = self.request(method, path, body=body)
        return status, json.loads(raw)

    # -- behavior 1: the status route ----------------------------------------

    def test_status_available_with_stub_and_flag(self):
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            status, _ = self.request_json(
                "POST", "/api/meta", {"librarian_enabled": True})
            self.assertEqual(status, 200)
            status, data = self.request_json("GET",
                                             "/api/librarian/status")
            self.assertEqual(status, 200)
            self.assertIs(data["ok"], True)
            self.assertIs(data["available"], True)
            self.assertIs(data["version_ok"], True)
            self.assertIs(data["enabled"], True)
            self.assertIn(data["auth"], ("claude-login", "api-key"))
            self.assertIsNone(data["why"])

    def test_status_flag_false_is_unavailable_and_absent_is_on(self):
        """⚠ RENAMED, BECAUSE HALF THE OLD NAME BECAME UNTRUE.

        `..._flag_absent_or_false_is_unavailable` asserted that an ABSENT flag
        was off. 26.93-08 changed that default to ON, following 26.85-07's
        ruling for the tidy-up switches — a hand you have to go hunting for in
        Manage is a hand that is not offered. So the absent half is not
        translated: it is now the OPPOSITE fact, and it gets its own named
        assertion below rather than being smuggled in under a name that says
        the reverse. The `false` half is untouched and still asserts exactly
        what it did."""
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            # ⚠ NEW FACT, NAMED AS NEW: absent means ON, and the room is
            # available on arrival rather than after she finds a switch.
            status, data = self.request_json("GET",
                                             "/api/librarian/status")
            self.assertEqual(status, 200,
                             "unavailable is never an error state")
            self.assertIs(data["enabled"], True,
                          "an absent flag means ON (26.93-08, after "
                          "26.85-07) — the librarian is offered, not found")
            self.assertIs(data["available"], True)
            self.assertIsNone(data["why"])
            # explicitly false: the honest answer this case has always made
            self.request_json("POST", "/api/meta",
                              {"librarian_enabled": False})
            status, data = self.request_json("GET",
                                             "/api/librarian/status")
            self.assertEqual(status, 200,
                             "off is an answer, never an error state")
            self.assertIs(data["available"], False)
            self.assertIs(data["enabled"], False)
            self.assertIs(data["version_ok"], True,
                          "something can answer; only the flag is off")
            self.assertEqual(data["why"], server.LIBRARIAN_OFF_MSG,
                             "plain words say why, byte-exact")

    # ⚠ DELETED WITH ITS SUBJECT (26.93-07) — `test_status_cli_absent_is_the
    # _pinned_line`. It pinned the room's answer when no `claude` program was
    # on PATH, byte-exact against a sentence telling her to set that program
    # up. There is no program behind the librarian any more, so the state it
    # described cannot occur and the sentence it pinned no longer exists. The
    # NEW shape of the same worry — a tier that cannot answer says so, in the
    # words of the closed failure register — is covered by the local-rung
    # cases in `tests/test_startup_check.py`, which drive all three of her own
    # machine's states through the shipped seam. This is a claim that died
    # with the subprocess, recorded rather than quietly dropped.

    def test_every_tier_falls_to_her_own_machine_under_the_swapped_home(self):
        """The fact the whole isolation rests on, asserted rather than
        assumed.

        If a key were ever visible here, the cloud tiers would resolve to a
        company and this suite would spend real money on every run — which is
        exactly what happened before 26.93-07. So the precondition is a case:
        no key is present, and all three tiers hold her own machine."""
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            self.assertIs(L.key_present("anthropic"), False,
                          "a cloud key is visible under the swapped home — "
                          "this suite would spend real money")
            self.assertIs(L.key_present("openai"), False)
            routing = server.resolve_librarian_routing()
            for tier in L.TIERS:
                self.assertEqual(routing.fills[tier], L.LOCAL_FILL,
                                 "%s does not resolve to her own machine "
                                 "under the swapped home" % tier)

    def test_the_real_config_directory_is_never_touched(self):
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            L.ensure_files()
            L.save_key("anthropic", "planted-fake-credential-never-printed")
        self.assertEqual(os.path.exists(REAL_ROOM_DIR), REAL_ROOM_DIR_EXISTED,
                         "this suite changed whether the real config "
                         "directory exists")

    # -- behavior 2: the flag validates fail-closed ---------------------------

    def test_librarian_enabled_flag_fail_closed(self):
        for value in (True, False):
            status, _ = self.request_json(
                "POST", "/api/meta", {"librarian_enabled": value})
            self.assertEqual(status, 200, f"{value!r} must roundtrip")
            _, store = self.request_json("GET", "/api/items")
            self.assertIs(store["meta"]["librarian_enabled"], value)
        # the loop left the stored flag False; every bad shape is
        # refused and the stored value is untouched
        for bad in ("yes", 1, None, []):
            status, data = self.request_json(
                "POST", "/api/meta", {"librarian_enabled": bad})
            self.assertEqual(status, 400, f"{bad!r} must be refused")
            self.assertIn("error", data)
            _, store = self.request_json("GET", "/api/items")
            self.assertIs(store["meta"]["librarian_enabled"], False,
                          "a refused merge persists nothing")

    # -- behavior 3: choke-point leak proof (hermetic, end-to-end) ------------

    def test_choke_point_leak_proof(self):
        store, fenced_ids = build_sentinel_store(self.library)
        study_lib.save_store(self.library, store)
        items_before = (self.library / "items.json").read_bytes()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            payload_text = server.librarian_payload_text(
                store, "presort", consent=True, store_dir=self.library)
            result = L.call_librarian(
                "import_presort", payload_text,
                server.resolve_librarian_routing())
        self.assertIs(result["ok"], True)
        self.assertEqual(result["structured"], {"verdicts": []})
        rec = json.loads(log.read_text(encoding="utf-8"))
        # ⚠ THE LEAK PROOF IS UNCHANGED, WORD FOR WORD. `rec["stdin"]` is the
        # user message out of the recorded request body rather than a pipe's
        # contents, and it is the same bytes making the same journey: the safe
        # blessed body IS there, and zero fenced sentinels / titles / ids are.
        self.assertIn("SAFE-BODY", rec["stdin"],
                      "the request really carries the builder's content")
        self.assertNotIn(FENCE_MARK, rec["stdin"])
        self.assertNotIn("FENCE-TITLE", rec["stdin"])
        for item_id in fenced_ids:
            self.assertNotIn(item_id, rec["stdin"],
                             "a fenced id never reaches the model")
        # ⚠ AND IT IS NOW ASSERTED OVER THE WHOLE REQUEST, not just the one
        # field — a strengthening the move makes possible. The old argv scan
        # could only look at a list of flags; this looks at everything that
        # travels, headers and URL included.
        whole = json.dumps(rec["body"], ensure_ascii=False) + str(rec["url"])
        self.assertNotIn(FENCE_MARK, whole)
        self.assertNotIn(str(self.library), whole,
                         "the store path never rides the request")
        # ⚠ THE W3 WIRING CLAIM, TRANSLATED FROM STDIN TO THE BODY: the
        # payload rides the user message with no wrapper sentence, no prefix
        # and no suffix. This is what the recorded-stdin equality asserted.
        self.assertEqual(rec["stdin"], payload_text,
                         "the payload reached the model verbatim — a wrapper "
                         "sentence anywhere would break the fence's one "
                         "guarantee about what is sent")
        # ⚠ NEW, AND NAMED AS NEW (26.93-07): the model the app chose is read
        # out of the recorded BODY by VALUE, and equals the routing fill's
        # model. This is the replacement for the recorded-argv model pin —
        # #24's caveat applies and belongs here: it proves what the app sends,
        # NOT what the provider does with it afterward.
        self.assertEqual(rec["body"]["model"], L.LOCAL_FILL[1])
        # ⚠ AND NO CREDENTIAL IS IN THE REQUEST AT ANY DEPTH. The seam hands
        # the credential to the transport as its own argument, which is what
        # makes this assertable at all.
        self.assertNotIn("api-key", json.dumps(rec["body"]).lower())
        self.assertIs(rec["had_auth"], False,
                      "her own machine needs no credential, and none was "
                      "attached")
        #
        # ⚠ FOUR CLAIMS DIED WITH THE SUBPROCESS AND ARE DELETED, NOT MOVED:
        #   * the isolation-flag roster (--permission-mode, --tools,
        #     --system-prompt, --max-turns, --setting-sources). They switched
        #     off an agent's tool roster, its ambient config and its approval
        #     loop. A raw completion request has none of those things to
        #     switch off, so the assertion has no subject — it is vacuous
        #     rather than failing, which is worse;
        #   * the one-shot pins (--continue / --resume absent). The Messages
        #     API keeps no conversation object a later call could resume, so
        #     there is nothing to forbid;
        #   * the store path never riding argv — there is no argv. The
        #     stronger version is asserted over the whole request above;
        #   * the child-env whitelist. There is no child process and no
        #     environment handed to one, so a scan of `env_keys` would be
        #     measuring this test process's own shell.
        #
        # ⚠ AND THE SAME CHECKER THE MUTATION DRILL DRIVES JUDGES THIS REAL
        # RECORD. One implementation of the claim, exercised two ways: a real
        # call here, six planted violations at the foot of this file. Two
        # separate implementations of one gate is how a rewritten pin ends up
        # asserting something subtly different from what it is drilled on.
        self.assertEqual(
            seam_record_violations(rec, payload_text, str(self.library),
                                   fenced_ids, L.LOCAL_FILL[1]),
            [], "the shared seam checker found a violation this case's own "
                "assertions missed")
        # the store is never written by a librarian call
        self.assertEqual((self.library / "items.json").read_bytes(),
                         items_before,
                         "store bytes unchanged after the full call")

    # -- behavior 4: the failure register -------------------------------------

    def test_failure_register_carries_a_token_and_no_provider_text(self):
        """⚠ TRANSLATED, AND IT ASSERTS MORE THAN IT DID.

        The shipped version pinned ONE static line for every failure. 26.93-06
        replaced that with the closed eleven-token register, so the surviving
        claim — a traceback and the provider's own words never cross the
        return — is now made against a token, and the sentence she is shown is
        checked beside it."""
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra={"FAKE_CLAUDE_FAIL": "1"}):
            result = L.call_librarian(
                "import_presort", "{}", server.resolve_librarian_routing())
        self.assertIs(result["ok"], False)
        self.assertIn(result["failure"], L.FAILURES,
                      "every failure is a member of the closed register")
        self.assertEqual(result["failure"], "provider_down")
        self.assertIsNone(result["structured"])
        # the shape is exactly five keys — `result` and `verdicts` are gone
        self.assertEqual(sorted(result),
                         ["failure", "model", "ok", "structured", "usage"])
        sentence = server.failure_sentence(result["failure"])
        for shard in ("Traceback", "returncode", "stderr", "forced", "500"):
            self.assertNotIn(shard, sentence,
                             "no trace text, no provider text, no status "
                             "number reaches her")


# ---------------------------------------------------------------------------
# 20. import pre-sorting (26-02, SRM-11) — the batch worker, the
# presort/progress/ack routes, resume, membership, and the auth-routed
# guardrails (D-07). Hermetic like section 19: the fake `claude` stub on
# PATH, its toggles (FAKE_CLAUDE_ROGUE_ID / FAKE_CLAUDE_COST /
# FAKE_CLAUDE_SLOW / FAKE_CLAUDE_FAIL) driving every scenario; no
# network, no key, and never the live store at ~/StudyRoom — temp dirs
# only.
# ---------------------------------------------------------------------------


@contextmanager
def env_removed(*names):
    """Pop the named environment variables for the duration (the
    subscription-auth scenarios must hold even on a machine whose shell
    exports ANTHROPIC_API_KEY); restores every value on exit."""
    saved = {n: os.environ.pop(n, None) for n in names}
    try:
        yield
    finally:
        for n, v in saved.items():
            if v is not None:
                os.environ[n] = v


class LibrarianBatcherTest(unittest.TestCase):
    """26-02 pure helpers: librarian_batches slicing and the notebook's
    fail-open load / shallow merge."""

    def test_batches_slice_and_pack(self):
        payload = {
            "meta_rows": [{"id": f"m{i}"} for i in range(120)],
            "bodies": [{"id": f"b{i}", "text": "x" * 6000}
                       for i in range(40)],
            "counts": {"bodies-capped": 0, "bodies-unreadable": 0},
        }
        batches = study_lib.librarian_batches(payload)
        meta = [b for b in batches if '"meta_rows"' in b["text"]]
        body = [b for b in batches if '"bodies"' in b["text"]]
        self.assertEqual(len(meta), 3, "120 rows slice into 40/40/40")
        self.assertEqual([len(b["ids"]) for b in meta], [40, 40, 40])
        self.assertEqual(meta[0]["ids"][0], "m0",
                         "input order is preserved")
        self.assertEqual(len(body), 3,
                         "40 x 6000-byte bodies are bounded by the item "
                         "count as 18 + 18 + 4 (#83)")
        self.assertEqual([len(b["ids"]) for b in body], [18, 18, 4])
        all_ids = [i for b in batches for i in b["ids"]]
        self.assertEqual(len(all_ids), 160)
        self.assertEqual(len(set(all_ids)), 160, "no id rides twice")
        for b in batches:
            parsed = json.loads(b["text"])
            self.assertIsInstance(parsed, dict,
                                  "every batch text is standalone JSON")

    def test_short_bodies_are_bounded_by_COUNT_not_only_bytes(self):
        """#83: the defect that shipped. The answer is one verdict per item,
        so its length scales with the item COUNT — but the batch was bounded
        only in BYTES. Sixty short notes packed into one 55-item batch whose
        answer needed ~2,000 tokens against a 1,500 cap: `truncated` five
        times out of five, never retried, and the worker stops the whole run
        — so ZERO of 60 notes were sorted, as a function of how SHORT the
        person's notes were."""
        payload = {
            "bodies": [{"id": f"s{i}", "text": "x" * 3658}   # the measured mean
                       for i in range(60)],
            "counts": {"bodies-capped": 0, "bodies-unreadable": 0},
        }
        body = study_lib.librarian_batches(payload)
        self.assertEqual([len(b["ids"]) for b in body], [18, 18, 18, 6],
                         "60 short notes are bounded by the item count "
                         "(the byte budget alone would have packed 41+)")
        for b in body:
            self.assertLessEqual(
                len(b["ids"]), study_lib.LIBRARIAN_BODY_ITEMS,
                "no batch may ask for more answer than the cap allows")
        # and the byte bound still bites first when the notes are long
        big = study_lib.librarian_batches(
            {"bodies": [{"id": f"L{i}", "text": "x" * 8192} for i in range(40)]})
        self.assertTrue(all(len(b["ids"]) <= 18 for b in big),
                        "8 KB notes are still bounded by the 150 KB budget")

    def test_suggestions_fail_open_and_shallow_merge(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "librarian" / "suggestions.json"
            # missing file reads as empty — never raises
            self.assertEqual(study_lib.load_suggestions(path),
                             {"runs": [], "verdicts": {}})
            study_lib.merge_suggestions(
                path, {"a" * 16: {"shelf": "joyful", "why": "w",
                                  "batch": 0, "at": 1}},
                {"started_ms": 5, "consent": False,
                 "auth": "claude-login", "cost_usd": 0.0})
            # an ack stamp updates the record without erasing the shelf
            study_lib.merge_suggestions(
                path, {"a" * 16: {"acked": True, "user_took": "blessed"}})
            data = study_lib.load_suggestions(path)
            rec = data["verdicts"]["a" * 16]
            self.assertEqual(rec["shelf"], "joyful")
            self.assertIs(rec["acked"], True)
            self.assertEqual(rec["user_took"], "blessed")
            # the run record replaces its own started_ms, never doubles
            study_lib.merge_suggestions(
                path, {}, {"started_ms": 5, "consent": False,
                           "auth": "claude-login", "cost_usd": 0.5})
            data = study_lib.load_suggestions(path)
            self.assertEqual(len(data["runs"]), 1)
            self.assertEqual(data["runs"][0]["cost_usd"], 0.5)
            # a damaged file reads as empty (fail-open) — and the next
            # merge simply starts the notebook over
            path.write_text("{ not json !!", encoding="utf-8")
            self.assertEqual(study_lib.load_suggestions(path),
                             {"runs": [], "verdicts": {}})


class LibrarianPresortTest(unittest.TestCase):
    """26-02: the six planned behaviors against the stub — lifecycle +
    merge, observable progress, refusals, resume, membership, the
    auth-routed ceiling/pause, and the no-lock-across-call proof."""

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
        # the pre-sort job dict is module state (the single-owner app
        # runs one server; this suite runs many) — start every test idle
        with server.LIBRARIAN_LOCK:
            server.LIBRARIAN_JOB.update(state="idle", total=0, done=0,
                                        cost_usd=0.0, auth=None,
                                        message=None,
                                        unknown_id_verdicts=0,
                                        started_ms=0)
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

    # -- tiny http helpers (the LibrarianSeamTest shape) ----------------------

    def request(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port,
                                          timeout=30)
        try:
            if body is not None:
                raw = json.dumps(body).encode("utf-8")
                conn.request(method, path, raw,
                             {"Content-Type": "application/json"})
            else:
                conn.request(method, path)
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def request_json(self, method, path, body=None):
        status, raw = self.request(method, path, body=body)
        return status, json.loads(raw)

    def sugg_path(self):
        return self.library / "librarian" / "suggestions.json"

    def build_pile(self, n, blessed_bodies=0):
        """A store of `n` unseen text items (metadata rows under
        consent=False — no snapshot files needed) plus optional blessed
        items WITH bodies on disk (blessed bodies always ride, per the
        fence's presort scope). librarian_enabled is on. Returns
        (unseen_ids, blessed_ids)."""
        (self.library / "items").mkdir(exist_ok=True)
        store = study_lib.new_store(self.library)
        store["meta"]["librarian_enabled"] = True
        ids = []
        for i in range(n):
            item_id = format(0xb000 + i, "016x")
            store["items"][item_id] = {
                "id": item_id, "content_hash": item_id * 4,
                "source": "folder-drop",
                "origin_path": f"/src/pile/unit-{i}.md",
                "library_path": f"items/{item_id}.md", "type": "text",
                "title": f"pile-{i}.md",
                "created_ms": 1700000000000 + i,
                "saved_ms": 1700000000000 + i,
                "imported_ms": 1700000000000 + i,
                "last_opened_ms": None, "state": "unseen",
                "resting_until_ms": None, "tags": [], "trigger": False,
                "year": 2023, "folder": "pile", "history": [],
            }
            ids.append(item_id)
        blessed = []
        for i in range(blessed_bodies):
            item_id = format(0xd000 + i, "016x")
            (self.library / "items" / f"{item_id}.md").write_text(
                f"BODY-{item_id} a blessed note", encoding="utf-8")
            store["items"][item_id] = {
                "id": item_id, "content_hash": item_id * 4,
                "source": "folder-drop",
                "origin_path": f"/src/pile/kept-{i}.md",
                "library_path": f"items/{item_id}.md", "type": "text",
                "title": f"kept-{i}.md",
                "created_ms": 1700000000000 + i,
                "saved_ms": 1700000000000 + i,
                "imported_ms": 1700000000000 + i,
                "last_opened_ms": None, "state": "blessed",
                "resting_until_ms": None, "tags": [], "trigger": False,
                "year": 2023, "folder": "pile", "history": [],
            }
            blessed.append(item_id)
        study_lib.save_store(self.library, store)
        return ids, blessed

    def wait_presort_done(self, timeout=20.0):
        """Read the progress route until the job leaves 'running' and
        return the final snapshot. A plain test-side read loop — the
        app's own read is the client's one-shot re-arm, not this."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            status, snap = self.request_json(
                "GET", "/api/librarian/progress")
            self.assertEqual(status, 200)
            if snap["state"] in ("done", "stopped", "paused", "error"):
                return snap
            time.sleep(0.02)
        self.fail("the pre-sort never finished")

    # -- behavior 1: lifecycle + merge + store untouched -----------------------

    def test_presort_lifecycle_merges_and_never_touches_store(self):
        ids, _ = self.build_pile(10)
        items_before = (self.library / "items.json").read_bytes()
        log = self.tmp / "claude-log.json"
        # the rogue toggle aimed at a REAL batch member is a legitimate
        # verdict — the cheapest way to see a merge land end-to-end
        with fake_claude_env(log,
                             extra={"FAKE_CLAUDE_ROGUE_ID": ids[0]}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200, f"presort refused: {data}")
            self.assertIs(data["ok"], True)
            self.assertIs(data["running"], True)
            self.assertEqual(data["total_batches"], 1,
                             "10 metadata rows ride one batch")
            snap = self.wait_presort_done()
        self.assertEqual(snap["state"], "done")
        self.assertEqual(snap["done"], snap["total"])
        self.assertEqual(snap["unknown_id_verdicts"], 0)
        self.assertEqual(snap["counts"]["joyful"], 1)
        sugg = study_lib.load_suggestions(self.sugg_path())
        self.assertIn(ids[0], sugg["verdicts"],
                      "the verdict merged into the notebook")
        rec = sugg["verdicts"][ids[0]]
        self.assertEqual(rec["shelf"], "joyful")
        self.assertIn("why", rec)
        self.assertIn("batch", rec)
        self.assertIn("at", rec)
        run = sugg["runs"][-1]
        self.assertIs(run["consent"], False)
        self.assertEqual(run["auth"], server.LIBRARIAN_AUTH_TOKEN)
        # ⚠ `cost_usd` DIED WITH 26.93-06's RULING, not with the subprocess.
        # The seam stopped returning a dollar figure because it has no
        # business holding a rate table, and no price table may enter this
        # repo — so the run record carries the provider's OWN token counts
        # instead. Map ticket #34 owns how spend is measured and shown, and
        # is still open. The claim that survives is that a run RECORDS what
        # it cost, and it is asserted here against the shape that replaced
        # the dollars.
        self.assertNotIn("cost_usd", run,
                         "no dollar figure may reappear on the run record "
                         "while #34 is open")
        self.assertIsInstance(run["usage"], dict)
        for provider, counts in run["usage"].items():
            self.assertIn(provider, L.PROVIDERS)
            self.assertGreaterEqual(counts["calls"], 1)
            self.assertGreaterEqual(counts["input_tokens"], 0)
            self.assertGreaterEqual(counts["output_tokens"], 0)
        self.assertEqual((self.library / "items.json").read_bytes(),
                         items_before,
                         "a full pre-sort run never writes the store")

    def test_presort_progress_climbs(self):
        self.build_pile(120)   # 3 metadata batches
        log = self.tmp / "claude-log.json"
        with env_removed("ANTHROPIC_API_KEY"), \
                fake_claude_env(log, extra={"FAKE_CLAUDE_SLOW": "0.15"}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200)
            self.assertEqual(data["total_batches"], 3)
            seen_states = set()
            seen_done = []
            deadline = time.time() + 20
            snap = None
            while time.time() < deadline:
                _, snap = self.request_json(
                    "GET", "/api/librarian/progress")
                seen_states.add(snap["state"])
                seen_done.append(snap["done"])
                if snap["state"] != "running":
                    break
                time.sleep(0.02)
            self.assertIn("running", seen_states,
                          "the run was observable mid-flight")
            self.assertEqual(snap["state"], "done")
            self.assertEqual(snap["done"], 3)
            self.assertEqual(snap["total"], 3)
            self.assertEqual(seen_done, sorted(seen_done),
                             "done only ever climbs")
            self.assertGreater(snap["started_ms"], 0)

    def test_blessed_bodies_ride_body_batches(self):
        _, blessed = self.build_pile(3, blessed_bodies=2)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200)
            self.assertEqual(data["total_batches"], 2,
                             "one metadata batch + one body batch")
            self.wait_presort_done()
        rec = json.loads(log.read_text(encoding="utf-8"))
        # the stub keeps the LAST call — batch order is metadata first,
        # bodies second, so the recorded stdin is the body batch
        self.assertIn('"bodies"', rec["stdin"])
        for item_id in blessed:
            self.assertIn(f"BODY-{item_id}", rec["stdin"],
                          "the blessed body text really rode the batch")

    # -- behavior 2: refusals, fail-closed --------------------------------------

    def test_second_presort_refused_while_running(self):
        self.build_pile(60)   # 2 batches, slowed: observably running
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra={"FAKE_CLAUDE_SLOW": "0.4"}):
            no_cached_probe()
            status, _ = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200)
            status, data = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 400,
                             "one pre-sort at a time — a plain refusal")
            self.assertEqual(data["error"], server.LIBRARIAN_BUSY_MSG,
                             "the pinned busy line, byte-exact")
            self.wait_presort_done()

    def test_consent_shape_fail_closed_spawns_nothing(self):
        self.build_pile(5)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            no_cached_probe()
            for payload in ({}, {"consent": "yes"}, {"consent": 1},
                            {"consent": None}):
                status, data = self.request_json(
                    "POST", "/api/librarian/presort", payload)
                self.assertEqual(status, 400,
                                 f"{payload} must be refused")
                self.assertIn("error", data)
                for shard in ("Traceback", "TypeError"):
                    self.assertNotIn(shard, data["error"])
            _, snap = self.request_json("GET", "/api/librarian/progress")
            self.assertEqual(snap["state"], "idle",
                             "a refused consent shape never touches "
                             "the job")
            self.assertFalse(self.sugg_path().exists(),
                             "nothing was written")

    def test_unavailable_answers_200_and_spawns_nothing(self):
        # The librarian OFF; the answer is honest and the worker never exists.
        #
        # ⚠ THE PREMISE MOVED, AND THE CLAIM DID NOT (26.93-08's ruling, via
        # 26.85-07's). This case used to leave the flag ABSENT and call that
        # off. Absent now means ON — a hand you have to go hunting for in
        # Manage is a hand that is not offered — so the off state has to be
        # asked for explicitly. That is a change of premise, not of claim: an
        # unavailable librarian still answers 200 with plain words and still
        # spawns nothing, which is the whole of what this case is for.
        (self.library / "items").mkdir(exist_ok=True)
        store = study_lib.new_store(self.library)
        store["meta"]["librarian_enabled"] = False
        study_lib.save_store(self.library, store)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200,
                             "unavailable is never an error state")
            self.assertIs(data["ok"], True)
            self.assertIs(data["available"], False)
            self.assertTrue(data["why"])
            _, snap = self.request_json("GET", "/api/librarian/progress")
            self.assertEqual(snap["state"], "idle")
            self.assertFalse(self.sugg_path().exists())

    # -- behavior 3: resume ------------------------------------------------------

    def test_resume_skips_verdicted_ids_and_rearms(self):
        ids, _ = self.build_pile(60)   # 2 batches when unverdicted
        verdicted, remainder = ids[:30], ids[30:]
        study_lib.merge_suggestions(
            self.sugg_path(),
            {i: {"shelf": "receipts", "why": "seeded", "batch": 0,
                 "at": 1} for i in verdicted},
            {"started_ms": 1, "consent": False, "auth": "claude-login",
             "cost_usd": 0.0})
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200)
            self.assertEqual(data["total_batches"], 1,
                             "only the 30 unverdicted ids ride")
            self.wait_presort_done()
            rec = json.loads(log.read_text(encoding="utf-8"))
            for item_id in remainder:
                self.assertIn(item_id, rec["stdin"],
                              "every unverdicted id was sent")
            for item_id in verdicted:
                self.assertNotIn(item_id, rec["stdin"],
                                 "a verdicted id never rides again")
            # a second full run after "done" re-arms cleanly
            time.sleep(0.01)   # a fresh started_ms for the new record
            status, data = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200, f"re-arm refused: {data}")
            self.assertIs(data["running"], True)
            snap = self.wait_presort_done()
            self.assertEqual(snap["state"], "done")

    # -- behavior 4: membership --------------------------------------------------

    def test_unknown_id_verdicts_dropped_and_counted(self):
        self.build_pile(10)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log,
                             extra={"FAKE_CLAUDE_ROGUE_ID": "f" * 16}):
            no_cached_probe()
            status, _ = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200)
            snap = self.wait_presort_done()
        self.assertEqual(snap["state"], "done")
        self.assertEqual(snap["unknown_id_verdicts"], 1,
                         "the made-up id was dropped AND counted "
                         "(fail-visible)")
        sugg = study_lib.load_suggestions(self.sugg_path())
        self.assertEqual(sugg["verdicts"], {},
                         "a hallucinated id never marks an item")

    # -- behavior 5: the auth-routed guardrails (D-07, both directions) ----------

    # ⚠⚠ THREE CASES DIED HERE WITH RULINGS, NOT WITH THE SUBPROCESS, AND
    # THEY ARE DELETED RATHER THAN TRANSLATED. A dead claim rewritten until it
    # passes is worse than an absent one: it looks like coverage.
    #
    #   * `test_ceiling_fires_on_api_key_auth` — it drove the $10 dollar
    #     ceiling. 26.93-06 REMOVED that check outright: it compared a tally
    #     against a float the seam no longer returns, and turning token counts
    #     into dollars needs a price table, which may not enter this repo. A
    #     guardrail frozen at zero that still LOOKS live is worse than an
    #     absence somebody can read, which is why the check went rather than
    #     being pinned at 0. MAP TICKET #34 owns re-denominating the limit —
    #     the map already ruled it survives measured in BATCHES — and when
    #     #34 lands, the case to write is a batch-ceiling case, not this one
    #     revived.
    #   * `test_subscription_tally_never_stops_the_run` and
    #     `test_subscription_failure_pauses_with_window_line` — both drove the
    #     SUBSCRIPTION half of the D-07 auth split ("included-in-plan usage is
    #     never money"). #28 killed the subscription path: every cloud rung
    #     authenticates with a key and the local rung authenticates with
    #     nothing, so `auth` is a constant and the arm those two exercised is
    #     unreachable by construction. `LIBRARIAN_WINDOW_MSG` still exists in
    #     `server.py` behind that unreachable arm, deliberately (26.93-07
    #     leaves it inert with a comment rather than deleting it unplanned) —
    #     but a test that reaches an unreachable branch is testing the test.
    #
    # What SURVIVED the split is the failure half, and it is directly below.

    def test_a_failed_call_lands_the_failure_s_own_words(self):
        """⚠ TRANSLATED FROM `test_api_key_failure_is_the_error_line`, AND IT
        ASSERTS MORE THAN IT DID.

        The old case pinned ONE static line for every failure on the api-key
        arm. 26.93-06 replaced that line with the eleven-token register, so the
        surviving claim — a failed call parks a plain-words message on the job
        and never a traceback — is now asserted against the sentence the
        register actually produces for what went wrong. The auth ROUTING half
        of the old case died with #28 (see the block above); the failure half
        is this."""
        self.build_pile(10)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra={"FAKE_CLAUDE_FAIL": "1"}):
            status, _ = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200)
            snap = self.wait_presort_done()
        self.assertEqual(snap["state"], "error")
        # her own machine fills every tier under the swapped home, so the
        # failure the driver produces is the provider-down one
        self.assertEqual(snap["message"],
                         server.failure_sentence("provider_down", "ollama"))
        self.assertNotIn("key", snap["message"],
                         "a server that would not answer has not looked at a "
                         "credential, and must never mention one (D-07)")
        for shard in ("Traceback", "returncode", "stderr", "500"):
            self.assertNotIn(shard, snap["message"])
        run = study_lib.load_suggestions(self.sugg_path())["runs"][-1]
        self.assertEqual(run["stopped_why"], "error",
                         "the stopped run's record is kept for the next run "
                         "to pick up from")

    def test_consent_is_per_run_never_sticky(self):
        self.build_pile(5)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            no_cached_probe()
            status, _ = self.request_json(
                "POST", "/api/librarian/presort", {"consent": True})
            self.assertEqual(status, 200)
            self.wait_presort_done()
            time.sleep(0.01)   # a fresh started_ms for the second run
            status, _ = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200)
            self.wait_presort_done()
        runs = study_lib.load_suggestions(self.sugg_path())["runs"]
        self.assertGreaterEqual(len(runs), 2)
        self.assertIs(runs[-2]["consent"], True)
        self.assertIs(runs[-1]["consent"], False,
                      "consent is recorded per run — a consented run "
                      "never widens the next one")
        _, store = self.request_json("GET", "/api/items")
        for key in store["meta"]:
            self.assertNotIn("consent", key,
                             "no sticky grant exists anywhere in store "
                             "meta")

    # -- behavior 6: no store lock across the call -------------------------------

    def test_meta_write_flows_during_running_presort(self):
        self.build_pile(10)
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra={"FAKE_CLAUDE_SLOW": "3"}):
            no_cached_probe()
            status, _ = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200)
            began = time.time()
            status, _ = self.request_json("POST", "/api/meta",
                                          {"room_entries": 1})
            elapsed = time.time() - began
            self.assertEqual(status, 200)
            self.assertLess(elapsed, 2.0,
                            "the worker holds no store lock — a meta "
                            "write never waits on the 3-second call")
            snap = self.wait_presort_done()
        self.assertEqual(snap["state"], "done")
        _, store = self.request_json("GET", "/api/items")
        self.assertEqual(store["meta"]["room_entries"], 1)

    # -- the ack route (T-26-07: notebook only, fail-closed) ---------------------

    def test_ack_fail_closed_and_notebook_only(self):
        study_lib.merge_suggestions(
            self.sugg_path(),
            {"a" * 16: {"shelf": "heavy", "why": "w", "batch": 0,
                        "at": 1}})
        status, _ = self.request_json(
            "POST", "/api/librarian/ack",
            {"id": "a" * 16, "user_took": "never_show"})
        self.assertEqual(status, 200)
        rec = study_lib.load_suggestions(
            self.sugg_path())["verdicts"]["a" * 16]
        self.assertIs(rec["acked"], True)
        self.assertEqual(rec["user_took"], "never_show")
        self.assertEqual(rec["shelf"], "heavy",
                         "the ack stamp never erases the verdict")
        # fail-closed: unknown id, off-enum user_took, missing id
        for payload in ({"id": "f" * 16, "user_took": "blessed"},
                        {"id": "a" * 16, "user_took": "promoted"},
                        {"user_took": "blessed"},
                        {"id": 7, "user_took": "blessed"}):
            status, data = self.request_json(
                "POST", "/api/librarian/ack", payload)
            self.assertEqual(status, 400, f"{payload} must be refused")
            self.assertIn("error", data)
        # the ack route writes the notebook file ONLY — no store was
        # ever created by any of this
        self.assertFalse((self.library / "items.json").exists(),
                         "an ack never touches (or creates) the store")


# ---------------------------------------------------------------------------
# 21. the librarian's note + gentle check-in (26-03, SRM-12) — generation
# only inside user-initiated runs, gift FILES under librarian/notes/, the
# fenced-title and dismissed-topic post-checks, one-active-question, and
# the reveal routes as PURE file reads. Hermetic like sections 19/20: the
# fake `claude` stub on PATH with its 26-03 toggles (FAKE_CLAUDE_NOTE /
# FAKE_CLAUDE_QUESTION / FAKE_CLAUDE_TOPIC); no network, no key, and
# never the live store at ~/StudyRoom — temp dirs only.
# ---------------------------------------------------------------------------


class LibrarianNoteTest(unittest.TestCase):
    """26-03: the five planned behaviors against the stub — note-scope
    sourcing (the fence suite holds the property half), generation
    timing (reveal never generates), question etiquette, dismissal
    permanence across a restart, and the file-borne notebook digest."""

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
        with server.LIBRARIAN_LOCK:
            server.LIBRARIAN_JOB.update(state="idle", total=0, done=0,
                                        cost_usd=0.0, auth=None,
                                        message=None,
                                        unknown_id_verdicts=0,
                                        started_ms=0)
        with server._LIBRARIAN_NOTE_LOCK:
            server.LIBRARIAN_NOTE_STATE.update(running=False,
                                               refused_notes=0,
                                               refused_questions=0)
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

    def restart_server(self):
        """A simulated room restart: same library on disk, a fresh
        server instance — the librarian's memory must be the FILES,
        never process state."""
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        self.httpd = server.create_server(self.library, 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(
            target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    # -- tiny http helpers (the LibrarianPresortTest shape) -------------------

    def request(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port,
                                          timeout=30)
        try:
            if body is not None:
                raw = json.dumps(body).encode("utf-8")
                conn.request(method, path, raw,
                             {"Content-Type": "application/json"})
            else:
                conn.request(method, path)
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def request_json(self, method, path, body=None):
        status, raw = self.request(method, path, body=body)
        return status, json.loads(raw)

    def sugg_path(self):
        return self.library / "librarian" / "suggestions.json"

    def notes_dir(self):
        return self.library / "librarian" / "notes"

    def today(self):
        return datetime.now().astimezone().strftime("%Y-%m-%d")

    def wait_presort_done(self, timeout=20.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            status, snap = self.request_json(
                "GET", "/api/librarian/progress")
            self.assertEqual(status, 200)
            if snap["state"] in ("done", "stopped", "paused", "error"):
                return snap
            time.sleep(0.02)
        self.fail("the pre-sort never finished")

    def build_note_store(self, blessed=1, unseen=0):
        """A store with `blessed` text bodies on disk (the note scope's
        only source), `unseen` metadata-only items, and ONE fenced
        never_show item whose title is the post-check sentinel.
        librarian_enabled is on. Returns (blessed_ids, unseen_ids,
        fenced_id)."""
        (self.library / "items").mkdir(exist_ok=True)
        store = study_lib.new_store(self.library)
        store["meta"]["librarian_enabled"] = True
        now_ms = int(time.time() * 1000)

        def shape(item_id, i, state, title):
            return {
                "id": item_id, "content_hash": item_id * 4,
                "source": "folder-drop",
                "origin_path": f"/src/pile/unit-{i}.md",
                "library_path": f"items/{item_id}.md", "type": "text",
                "title": title,
                "created_ms": now_ms - 1000,
                "saved_ms": now_ms - 1000,
                "imported_ms": now_ms - 1000,
                "last_opened_ms": None, "state": state,
                "resting_until_ms": None, "tags": [], "trigger": False,
                "year": 2023, "folder": "pile", "history": [],
            }

        blessed_ids = []
        for i in range(blessed):
            item_id = format(0xe100 + i, "016x")
            (self.library / "items" / f"{item_id}.md").write_text(
                f"BODY-{item_id} a blessed page", encoding="utf-8")
            store["items"][item_id] = shape(item_id, i, "blessed",
                                            f"kept-{i}.md")
            blessed_ids.append(item_id)
        unseen_ids = []
        for i in range(unseen):
            item_id = format(0xe200 + i, "016x")
            store["items"][item_id] = shape(item_id, i, "unseen",
                                            f"pile-{i}.md")
            unseen_ids.append(item_id)
        fenced_id = format(0xe2ff, "016x")
        (self.library / "items" / f"{fenced_id}.md").write_text(
            "a private page", encoding="utf-8")
        store["items"][fenced_id] = shape(fenced_id, 99, "never_show",
                                          "FENCED-SECRET-LETTER.md")
        study_lib.save_store(self.library, store)
        return blessed_ids, unseen_ids, fenced_id

    # -- behavior 2: generation timing — the ask writes, the reveal reads ------

    def test_ask_writes_the_gift_and_reveal_is_pure_read(self):
        self.build_note_store()
        canned = "a small warm note from the stub."
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra={"FAKE_CLAUDE_NOTE": canned}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/note", {})
            self.assertEqual(status, 200, f"the ask refused: {data}")
            self.assertIs(data["ok"], True)
            self.assertIs(data["written"], True)
            self.assertIs(data["question_written"], False)
            name = self.today() + "-note.md"
            note_path = self.notes_dir() / name
            self.assertTrue(note_path.exists(),
                            "the gift file lands under librarian/notes/ "
                            "with the server-minted date+kind name")
            self.assertEqual(note_path.read_text(encoding="utf-8"),
                             canned,
                             "the stub's canned text, byte-exact")
            # the note call's stdin: blessed bodies only — never the
            # fenced item's title or body (the note scope, end-to-end)
            rec = json.loads(log.read_text(encoding="utf-8"))
            self.assertIn("BODY-", rec["stdin"])
            self.assertNotIn("FENCED-SECRET-LETTER", rec["stdin"])
            self.assertNotIn("a private page", rec["stdin"])
            # the reveal routes are PURE file reads: the stub log is
            # removed WHILE the recording env is still live — any call
            # on the desk-flow reads would recreate it
            log.unlink()
            status, data = self.request_json("GET",
                                             "/api/librarian/notes")
            self.assertEqual(status, 200)
            self.assertEqual(data["notes"],
                             [{"name": name, "kind": "note",
                               "unread": True}])
            status, data = self.request_json(
                "GET", "/api/librarian/notes?read=" + name)
            self.assertEqual(status, 200)
            self.assertEqual(data["kind"], "note")
            self.assertEqual(data["text"], canned,
                             "the body comes back VERBATIM")
            self.assertFalse(log.exists(),
                             "zero subprocess on the desk-flow reads — "
                             "the stub log was never recreated")
            # reading marks read: the stamp flips unread, in a plain
            # file — still zero subprocess
            status, _ = self.request_json("POST", "/api/librarian/read",
                                          {"name": name})
            self.assertEqual(status, 200)
            status, data = self.request_json("GET",
                                             "/api/librarian/notes")
            self.assertIs(data["notes"][0]["unread"], False)
            self.assertFalse(log.exists(),
                             "the read stamp is a file write, not a "
                             "call")
        read_map = json.loads(
            (self.library / "librarian" / "read.json")
            .read_text(encoding="utf-8"))
        self.assertIn(name, read_map,
                      "read.json is plain JSON a user could edit")

    def test_missing_librarian_dir_is_empty_memory(self):
        # no store, no librarian dir, no CLI involvement: the reveal
        # answers an empty list, instantly and offline (D-05)
        status, data = self.request_json("GET", "/api/librarian/notes")
        self.assertEqual(status, 200)
        self.assertEqual(data, {"ok": True, "notes": []})
        # a traversal-shaped or unknown read name is a plain 404
        for name in ("..%2F..%2Fitems.json", "2026-01-01-note.md"):
            status, data = self.request_json(
                "GET", "/api/librarian/notes?read=" + name)
            self.assertEqual(status, 404)
            self.assertIn("error", data)

    # -- behavior 3a: the fenced-title post-check on the note itself -----------

    def test_note_naming_a_fenced_title_is_refused_and_counted(self):
        self.build_note_store()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra={
                "FAKE_CLAUDE_NOTE":
                    "she wrote about FENCED-SECRET-LETTER again"}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/note", {})
        self.assertEqual(status, 200)
        self.assertIs(data["written"], False,
                      "a note naming a fenced item's title is dropped")
        self.assertEqual(data["refused_notes"], 1,
                         "and counted fail-visible, never silent")
        self.assertFalse((self.notes_dir() /
                          (self.today() + "-note.md")).exists(),
                         "nothing was saved")
        notebook = (self.library / "librarian" / "notebook.md")
        self.assertTrue(notebook.exists())
        self.assertIn("held back", notebook.read_text(encoding="utf-8"),
                      "the refusal is readable in the notebook diary")

    # -- behavior 3: question etiquette (fenced + one-active) ------------------

    def test_question_etiquette_fenced_and_one_active(self):
        self.build_note_store()
        log = self.tmp / "claude-log.json"
        # (a) a question carrying a fenced item's title substring is
        # refused server-side — prompt-forbidden AND machine-checked
        with fake_claude_env(log, extra={
                "FAKE_CLAUDE_NOTE": "a clean note.",
                "FAKE_CLAUDE_QUESTION":
                    "should FENCED-SECRET-LETTER rest for a while?",
                "FAKE_CLAUDE_TOPIC": "letters"}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/note", {})
        self.assertEqual(status, 200)
        self.assertIs(data["written"], True, "the clean note still lands")
        self.assertIs(data["question_written"], False)
        self.assertEqual(data["refused_questions"], 1)
        qpath = self.notes_dir() / (self.today() + "-question.md")
        self.assertFalse(qpath.exists())
        # (b) a clean question writes — kind: first line, topic line,
        # body verbatim behind them
        with fake_claude_env(log, extra={
                "FAKE_CLAUDE_NOTE": "a clean note.",
                "FAKE_CLAUDE_QUESTION": "one gentle question?",
                "FAKE_CLAUDE_TOPIC": "pottery"}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/note", {})
        self.assertEqual(status, 200)
        self.assertIs(data["question_written"], True)
        raw = qpath.read_text(encoding="utf-8")
        self.assertEqual(raw.split("\n")[0], "kind: question",
                         "a kind: first line marks questions")
        self.assertEqual(raw.split("\n")[1], "topic: pottery")
        status, data = self.request_json(
            "GET", "/api/librarian/notes?read=" +
            self.today() + "-question.md")
        self.assertEqual(data["kind"], "question")
        self.assertEqual(data["topic"], "pottery")
        self.assertEqual(data["text"], "one gentle question?")
        # (c) a second question while one active (unread) question file
        # exists is NOT written — at most one, ever
        with fake_claude_env(log, extra={
                "FAKE_CLAUDE_NOTE": "a clean note.",
                "FAKE_CLAUDE_QUESTION": "another question already?",
                "FAKE_CLAUDE_TOPIC": "knitting"}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/note", {})
        self.assertEqual(status, 200)
        self.assertIs(data["question_written"], False,
                      "one active question at a time")
        self.assertEqual(qpath.read_text(encoding="utf-8"), raw,
                         "the waiting question file is untouched")

    # -- behavior 4: dismissal permanence (files, not process state) -----------

    def test_dismissal_permanence_across_restart(self):
        self.build_note_store()
        log = self.tmp / "claude-log.json"
        qname = self.today() + "-question.md"
        with fake_claude_env(log, extra={
                "FAKE_CLAUDE_NOTE": "a clean note.",
                "FAKE_CLAUDE_QUESTION":
                    "want the flooded kitchen set aside?",
                "FAKE_CLAUDE_TOPIC": "the flooded kitchen"}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/note", {})
            self.assertIs(data["question_written"], True)
            # the dismissal: appended to a plain JSON file, and the
            # waiting card is stamped read — it never returns
            status, _ = self.request_json(
                "POST", "/api/librarian/dismiss",
                {"topic": "the flooded kitchen"})
            self.assertEqual(status, 200)
            dismissed = json.loads(
                (self.library / "librarian" / "dismissed.json")
                .read_text(encoding="utf-8"))
            self.assertEqual(dismissed[0]["topic"],
                             "the flooded kitchen",
                             "dismissed.json is plain JSON a user "
                             "could edit")
            status, data = self.request_json(
                "GET", "/api/librarian/notes")
            by_name = {n["name"]: n for n in data["notes"]}
            self.assertIs(by_name[qname]["unread"], False,
                          "the dismissed question's card never returns")
            # a simulated restart: the same topic still refuses — the
            # FILE is the memory, the AI never overrules it
            self.restart_server()
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/note", {})
            self.assertEqual(status, 200)
            self.assertIs(data["question_written"], False)
            self.assertEqual(data["refused_questions"], 1,
                             "the dismissed topic never generates "
                             "again, across restarts")
        # fail-closed shapes: dismissal validates before any write
        for bad in ({"topic": ""}, {"topic": "   "},
                    {"topic": "x" * 201}, {"topic": 7},
                    {"topic": None}, {}):
            status, data = self.request_json(
                "POST", "/api/librarian/dismiss", bad)
            self.assertEqual(status, 400, f"{bad} must be refused")
            self.assertIn("error", data)

    # -- behavior 5: the notebook digest is file-borne and fence-clean ---------

    def test_next_run_stdin_carries_the_digest(self):
        _, unseen_ids, _ = self.build_note_store(blessed=0, unseen=5)
        seeded = unseen_ids[:2]
        study_lib.merge_suggestions(
            self.sugg_path(),
            {i: {"shelf": "receipts", "why": "seeded", "batch": 0,
                 "at": 1, "acked": True, "user_took": "skipped"}
             for i in seeded},
            {"started_ms": 1, "consent": False, "auth": "claude-login",
             "cost_usd": 0.0})
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log):
            no_cached_probe()
            status, _ = self.request_json(
                "POST", "/api/librarian/presort", {"consent": False})
            self.assertEqual(status, 200)
            snap = self.wait_presort_done()
        self.assertEqual(snap["state"], "done")
        rec = json.loads(log.read_text(encoding="utf-8"))
        self.assertIn('"notebook"', rec["stdin"],
                      "the digest rides the next run's stdin")
        self.assertIn("the sort so far:", rec["stdin"])
        self.assertIn("left in the pile", rec["stdin"],
                      "the answered line reads from the acks")
        for item_id in seeded:
            self.assertNotIn(item_id, rec["stdin"],
                             "digests carry shelf words and counts — "
                             "never ids, titles, or bodies")
        notebook = self.library / "librarian" / "notebook.md"
        self.assertTrue(notebook.exists(),
                        "the run's end writes the readable notebook")
        self.assertIn("the sort so far:",
                      notebook.read_text(encoding="utf-8"))

    # -- the run-carried note (the worker's final step) -------------------------

    def test_note_rides_the_presort_run_when_asked(self):
        self.build_note_store()
        items_before = (self.library / "items.json").read_bytes()
        log = self.tmp / "claude-log.json"
        with fake_claude_env(log, extra={
                "FAKE_CLAUDE_NOTE": "a run-end note."}):
            no_cached_probe()
            status, data = self.request_json(
                "POST", "/api/librarian/presort",
                {"consent": False, "note": True})
            self.assertEqual(status, 200, f"presort refused: {data}")
            snap = self.wait_presort_done()
        self.assertEqual(snap["state"], "done")
        note_path = self.notes_dir() / (self.today() + "-note.md")
        self.assertTrue(note_path.exists(),
                        "the user asked with the run — the note lands "
                        "as its final step")
        self.assertEqual(note_path.read_text(encoding="utf-8"),
                         "a run-end note.")
        self.assertEqual((self.library / "items.json").read_bytes(),
                         items_before,
                         "the gift never touches the store")
        # the note flag validates fail-closed like consent
        status, data = self.request_json(
            "POST", "/api/librarian/presort",
            {"consent": False, "note": "yes"})
        self.assertEqual(status, 400)
        self.assertIn("error", data)


class CrossOriginWriteGuardTest(ServerSmokeTest):
    """Cross-origin write guard (cross-AI review 26.65, HIGH-1): a browser
    stamps an Origin header on every POST it sends. A foreign page's Origin
    must be refused BEFORE any route work — the Host check alone passes on a
    hostile page's request to 127.0.0.1, and once macOS Automation consent
    exists, /api/adapter/collect could otherwise be driven from any website.
    The room's own pages (localhost / 127.0.0.1, any port) and origin-less
    non-browser clients (this suite, curl) keep working unchanged."""

    def request_origin(self, method, path, body, origin):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        headers = {"Content-Type": "application/json"}
        if origin is not None:
            headers["Origin"] = origin
        try:
            raw = json.dumps(body).encode("utf-8")
            conn.request(method, path, raw, headers)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read())
        finally:
            conn.close()

    def test_foreign_origin_post_refused(self):
        status, data = self.request_origin(
            "POST", "/api/meta", {"consolidation": True},
            origin="https://evil.example")
        self.assertEqual(status, 403,
                         "a foreign page's POST must be refused")
        self.assertIn("error", data)

    def test_null_origin_post_refused(self):
        # file:// and sandboxed pages send the literal "null" origin —
        # never one of the room's own pages.
        status, _data = self.request_origin(
            "POST", "/api/meta", {"consolidation": True}, origin="null")
        self.assertEqual(status, 403)

    def test_own_page_origin_allowed(self):
        for origin in ("http://localhost:8747", "http://127.0.0.1:8747",
                       "http://127.0.0.1:12345"):
            status, data = self.request_origin(
                "POST", "/api/meta", {"consolidation": True}, origin=origin)
            self.assertEqual(
                status, 200,
                f"the room's own page ({origin}) must pass: {data}")

    def test_no_origin_post_allowed(self):
        # Non-browser clients send no Origin at all — unchanged.
        status, _data = self.request_origin(
            "POST", "/api/meta", {"consolidation": True}, origin=None)
        self.assertEqual(status, 200)


# ---------------------------------------------------------------------------
# ⛔ 21. THE VAULT TIDY-UP ROUTE TEST IS DELETED WITH ITS ROUTE (#56, applied
# 2026-08-14 as part of copy pass #77).
#
# What stood here exercised the privileged spawned site end to end against a
# fake `claude` stub: the consent gate, the fail-open unavailable answer, the
# happy path, the failure register, one-run-at-a-time, and a live check that
# the macOS sandbox profile actually denied a secret-store read.
#
# ⚠ THIS IS THE ONE PLACE IN THIS SWEEP WHERE DELETING A TEST IS RIGHT, AND
# THE REASON IS WORTH WRITING DOWN, because this repo's standing convention is
# to REWRITE a test rather than delete it. That convention protects a CLAIM
# whose mechanism moved. Here the claim itself is gone: there is no route, no
# job, no consent to gate and no agent to confine, so a rewritten test would
# assert the behaviour of nothing. What replaces it is not silence — two pins
# in tests/test_no_push.cjs now assert the ABSENCE of the permission-waiver
# keyword and of the sandbox-profile builder in server.py, so the shape cannot
# come back unnoticed, and both were driven red before being trusted.
#
# The route was deleted because the repo ships zero skill files: on any
# machine but the author's the CLI was handed a skill that does not exist and
# did nothing, silently, while the room reported a successful tidy-up.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# 22. tier-1 cleaning routes (26.85, D-05/D-06/D-10) — the route-level half
# of the cleaning safety proof. RED-FIRST (Wave 0): every case here fails
# until the routes land, and that failure IS the 26.85-01 deliverable. Do
# NOT stub anything to go green.
#
#   * cases 1-2 (fail-open / fail-closed) green in Wave 3 (26.85-03) with
#     the status route + the two meta validators;
#   * cases 3-4 (apply-intersection / apply-then-undo) green in Wave 4
#     (26.85-04) with handle_clean_apply + handle_clean_undo — they are
#     what back Plan 04's autonomous gate.
#
# Hermetic like sections 19-21: the fake `claude` stub on PATH, no
# network, no key, temp dirs only, never the live store at ~/StudyRoom.
#
# ---- THE WAVE 3/4 ROUTE + STUB CONTRACT (exact names) ---------------------
#
# ⛔ THREE OF THESE ROUTES WERE DELETED 2026-08-17 (#95) — `clean/scan`,
# `clean/progress` and `clean/apply`, the labelling pass. Their contracts are
# struck from this block rather than left standing, because a route contract
# describing a 404 is how the next reader spends an afternoon.
#
#   POST /api/librarian/clean/targets {"scope": str|None}
#        -> 200 the notes in that place a readability run would change
#   POST /api/librarian/clean/write   {"writes": [{id, body}, ...]}
#        -> 200 {"ok", "written", "unchanged", "refused", "released",
#                "batch"}. Whitespace-only differences ONLY, checked
#        against the bytes on disk at the moment of the write.
#   POST /api/librarian/clean/undo   {} -> 200 {"ok": True,
#                                               "restored": int}
#   GET  /api/librarian/clean/status -> 200 {"ok", "available", "enabled",
#                                            "why"}
#   meta keys: "cleaning_enabled" — ONE fail-closed bool on /api/meta (the
#        sync_comments register). ⛔ "cleaning_writeback_enabled" was the
#        second and is DELETED (owner 2026-08-17): it is off META_KEYS, so
#        /api/meta now 400s it as an unknown key.
#   module state: server.CLEAN_JOB + server.CLEAN_LOCK (the
#        LIBRARIAN_JOB / LIBRARIAN_LOCK shape), so a suite can reset it.
#
#   ⚠ `FAKE_CLAUDE_LABELS` is now a toggle with nothing to drive: the job
#   whose proposals it answered is deleted. It is left in the fixture
#   deliberately — the fixture is a stub for ANY structured answer and its
#   toggles are cheap — but a reader must not infer a live labelling path
#   from its presence.
#   and server.py's child-env whitelist must pass the NAME
#   "FAKE_CLAUDE_LABELS" through the same stub-only branch the other
#   FAKE_CLAUDE_* toggles ride (server.py:1083-1090).
# ---------------------------------------------------------------------------

class CleaningRouteTest(unittest.TestCase):
    """26.85: fail-open, fail-closed and the switch register — driven
    through the real routes with the hermetic stub. The unit-level writer invariants live in
    tests/test_cleaning_writer.py; this suite proves the ROUTES honour
    them (a writer that is safe but a route that hands it unapproved ids
    is still a P0)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.library = self.tmp / "library"
        self.library.mkdir()
        # the user's real notes — a plain folder drop (no .obsidian dir),
        # exactly the demo-holdout shape the writer must be able to clean
        self.vault = self.tmp / "vault"
        self.vault.mkdir()
        no_cached_probe()
        with server.JOB_LOCK:
            server.IMPORT_JOB.update(state="idle", total=0, done=0,
                                     started_ms=0, report=None,
                                     message=None)
        # ⚠ NO TIDY-UP JOB DICT TO RESET SINCE 2026-08-17 (#95). The
        # labelling scan held module state so a suite running many servers
        # had to start each test idle; the readability pass finishes inside
        # its own request and holds none. `LIBRARIAN_JOB` above still does.
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

    # -- tiny http helpers (the LibrarianSeamTest shape) ---------------------

    def request(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port,
                                          timeout=30)
        try:
            if body is not None:
                raw = json.dumps(body).encode("utf-8")
                conn.request(method, path, raw,
                             {"Content-Type": "application/json"})
            else:
                conn.request(method, path)
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def request_json(self, method, path, body=None):
        status, raw = self.request(method, path, body=body)
        return status, json.loads(raw)

    # -- fixture -------------------------------------------------------------

    STALE_FM = (b"---\n"
                b"title: \n"
                b"author: Katherine Mansfield\n"
                b"created: 2026-07-14\n"
                b"published: 2026-07-14\n"
                b"tags: []\n"
                b"---\n")

    def build_notes(self, n=3, enabled=True):
        """`n` real .md notes on disk plus a store whose items point at
        them by origin_path. Returns the list of (item_id, Path).

        Pass enabled=None to leave the key OUT of meta entirely — the shape
        a store that predates the switch has, and the one that must now read
        as ON (26.85-07)."""
        (self.library / "items").mkdir(exist_ok=True)
        store = study_lib.new_store(self.library)
        store["meta"]["librarian_enabled"] = True
        if enabled is not None:
            store["meta"]["cleaning_enabled"] = enabled
        pairs = []
        for i in range(n):
            item_id = format(0xc000 + i, "016x")
            note = self.vault / f"note-{i}.md"
            note.write_bytes(self.STALE_FM +
                             f"\na letter, page {i}.\n".encode("utf-8"))
            stamp = time.time() - 40 * 86400
            os.utime(note, (stamp, stamp))
            (self.library / "items" / f"{item_id}.md").write_bytes(
                note.read_bytes())
            store["items"][item_id] = {
                "id": item_id, "content_hash": item_id * 4,
                "source": "folder-drop", "origin_path": str(note),
                "library_path": f"items/{item_id}.md", "type": "text",
                "title": f"note-{i}.md",
                "created_ms": 1700000000000 + i,
                "saved_ms": 1700000000000 + i,
                "imported_ms": 1700000000000 + i,
                "last_opened_ms": None, "state": "unseen",
                "resting_until_ms": None, "tags": [], "trigger": False,
                "year": 2026, "folder": "vault", "history": [],
            }
            pairs.append((item_id, note))
        study_lib.save_store(self.library, store)
        return pairs

    # -- contract pin: the module state the routes need -----------------------

    def test_the_tidy_up_holds_no_run_state_of_its_own(self):
        """⛔ INVERTED 2026-08-17, AND THE INVERSION IS THE POINT. This case
        required `CLEAN_JOB` and `CLEAN_LOCK` to exist, so a labelling scan
        was observable and one-run-at-a-time. #95 deleted that scan; the
        readability pass runs synchronously inside its own request and has no
        run to observe and no second runner to lock against (#95 verified
        both before ruling).

        ⛔ A LATER READER MUST NOT RESTORE A CLAIM THIS PASS CANNOT MAKE: a
        job dict nothing sets is a state surface that always reads idle, and
        a claim nothing releases is how a shared guard latches for ever."""
        self.assertFalse(hasattr(server, "CLEAN_JOB"),
                         "CLEAN_JOB is back — the tidy-up has no background "
                         "run, so a job record for it can only ever be stale")
        self.assertFalse(hasattr(server, "CLEAN_LOCK"),
                         "CLEAN_LOCK is back — it aliased the librarian's "
                         "lock so a scan could claim both jobs at once, and "
                         "there is no scan")

    # -- case 1: FAIL-OPEN — an EXPLICIT false changes nothing at all --------
    # RE-EXPRESSED 2026-07-30 (owner's default flip, 26.85-07). This case used
    # to be able to lean on absence, because absent meant off. It no longer
    # does: the flag is written to False on purpose here, which is now the
    # only way to be off. The assertions themselves are UNCHANGED — the
    # promise "with the switch off, tidying changes nothing in your vault at
    # all" is exactly as strong as it was, and it is the promise LIBRARIAN.md
    # still makes. Only the premise moved.

    def test_fail_open_off_is_byte_identical_and_does_zero_work(self):
        """D-06: cleaning is an AI-tier feature. With the flag turned OFF
        (or the CLI absent) the room is byte-identical to the no-AI room,
        the scan route answers 200 available=False, and NOTHING happens —
        no spawn, no proposals notebook, not one store byte moved."""
        pairs = self.build_notes(2, enabled=False)
        items_before = (self.library / "items.json").read_bytes()
        notes_before = {p: p.read_bytes() for _, p in pairs}
        log = self.tmp / "claude-log.json"

        # (a) the stub IS on PATH — so a spawn would leave a log file
        with fake_claude_env(log):
            no_cached_probe()
            status, data = self.request_json(
                "GET", "/api/librarian/clean/status")
            self.assertEqual(status, 200,
                             "unavailable is never an error state")
            self.assertIs(data["available"], False)
            self.assertIs(data["enabled"], False)
            self.assertTrue(data["why"] and isinstance(data["why"], str),
                            "plain words say why")

            # ⚠ RE-POINTED 2026-08-17 (#95). This drove the labelling
            # SCAN route, which failed OPEN with `available: false`. That
            # route is deleted, so the same promise — "with the switch off,
            # tidying changes nothing in your vault at all" — is driven
            # through the one route that can still write: the readability
            # pass. It fails CLOSED with her off-sentence, which is a
            # DIFFERENT shape and the honest one for a write: the read-only
            # status route above is where failing open belongs.
            status, data = self.request_json(
                "POST", "/api/librarian/clean/write",
                {"writes": [{"id": i, "body": "anything at all"}
                            for i, _ in pairs]})
            self.assertEqual(status, 400,
                             "the only route that writes refuses outright "
                             "when the switch is off")
            self.assertEqual(data["error"], server.CLEAN_OFF_MSG)

        self.assertFalse(log.exists(),
                         "zero work: no subprocess was ever spawned")
        self.assertFalse(
            (self.library / "librarian" / "cleaning-log.json").exists(),
            "zero work: no change-log is written when off")
        self.assertEqual((self.library / "items.json").read_bytes(),
                         items_before,
                         "the store is byte-identical with cleaning off")
        for path, raw in notes_before.items():
            self.assertEqual(path.read_bytes(), raw,
                             "with the switch off, tidying changes "
                             "nothing in the vault at all")

        # (b) the flag ON but nothing able to answer: the same honest answer,
        # in the words of the closed register.
        # ⚠ TRANSLATED (26.93-07): this used to pin the not-set-up sentence
        # byte-exact against an absent `claude` program. That program and that
        # sentence are both gone; the claim it was making — the tidy-up says
        # `available: false` with plain words rather than erroring, whenever
        # the librarian has nothing to answer with — survives intact and is
        # asserted here against the register's own line.
        study_lib_store = study_lib.load_store(self.library)
        study_lib_store["meta"]["cleaning_enabled"] = True
        study_lib.save_store(self.library, study_lib_store)
        empty = self.tmp / "empty-bin"
        empty.mkdir()
        with fake_claude_env(log, path_dirs=str(empty)):
            status, data = self.request_json(
                "GET", "/api/librarian/clean/status")
            self.assertEqual(status, 200)
            self.assertIs(data["available"], False)
            self.assertEqual(
                data["why"], server.FAILURE_SENTENCES["ollama_not_running"],
                "the register's own line for nothing answering, byte-exact")

    # -- case 2: FAIL-CLOSED — a malformed flag never widens the fence -------

    def test_cleaning_flags_are_fail_closed_bools(self):
        """The opt-in gate register (server.py:890). A non-bool must 400
        and persist nothing — a malformed write may never open the gate.

        ⚠ ONE KEY, NOT TWO, since the owner's 2026-08-17 ruling. The second
        half of this loop drove `cleaning_writeback_enabled`; that key is
        deleted and its own refusal is driven at the end of this test."""
        for key in ("cleaning_enabled",):
            for value in (True, False):
                status, _ = self.request_json("POST", "/api/meta",
                                              {key: value})
                self.assertEqual(status, 200,
                                 f"{key}={value!r} must roundtrip")
                _, store = self.request_json("GET", "/api/items")
                self.assertIs(store["meta"][key], value)
            # the loop left it False; every bad shape is refused and the
            # stored value is untouched
            for bad in ("yes", 1, 0, None, [], {}, "true"):
                status, data = self.request_json("POST", "/api/meta",
                                                 {key: bad})
                self.assertEqual(status, 400,
                                 f"{key}={bad!r} must be refused")
                self.assertIn("error", data)
                _, store = self.request_json("GET", "/api/items")
                self.assertIs(store["meta"][key], False,
                              "a refused merge persists nothing")

        # ⛔ AND THE DELETED SWITCH IS DRIVEN, not assumed. A key removed from
        # META_KEYS is refused by the unknown-key gate BEFORE any validator
        # runs — which is the whole reason deleting its validator opened no
        # hole. Driven with a WELL-FORMED bool, because a malformed one would
        # 400 for the wrong reason and prove nothing.
        status, data = self.request_json(
            "POST", "/api/meta", {"cleaning_writeback_enabled": False})
        self.assertEqual(status, 400,
                         "the second switch is deleted — /api/meta must not "
                         "accept it at all")
        self.assertIn("cleaning_writeback_enabled", data.get("error", ""),
                      "and the refusal names the key it refused")
        _, store = self.request_json("GET", "/api/items")
        self.assertNotIn("cleaning_writeback_enabled", store["meta"],
                         "a refused merge persists nothing")

    # -- case 2b: the DEFAULT — absent is ON, false is off -------------------
    # NET-NEW 2026-07-30 (26.85-07, owner's call mid-UAT). The old premise —
    # absent means off — stopped existing, so rather than weaken case 1 or
    # case 2 this pins the premise that replaced it. Her reason, in her
    # words: a Manage tab you have to hunt through is stressful; the hand
    # should be offered, not found. Nothing about the FAIL-CLOSED validator
    # above moves — a non-bool is still a 400 — and a hand-edited non-bool
    # sitting in the store still reads as OFF, which is the second line of
    # defence for a store edited outside the app.

    def test_cleaning_defaults_on_and_explicit_false_is_off(self):
        pairs = self.build_notes(1, enabled=None)
        item_id, _note = pairs[0]
        on_disk = json.loads(
            (self.library / "items.json").read_text(encoding="utf-8"))
        self.assertNotIn("cleaning_enabled", on_disk["meta"],
                         "premise: the key really is absent")
        log = self.tmp / "claude-log.json"

        # (a) ABSENT reads as ON — all the way to the answer the pane renders
        with fake_claude_env(log):
            status, data = self.request_json(
                "GET", "/api/librarian/clean/status")
            self.assertEqual(status, 200)
            self.assertIs(data["available"], True,
                          "the tidy-up is offered on arrival, not found")
            self.assertIs(data["enabled"], True, "absent means on")
            self.assertNotIn("writeback", data,
                             "the status answer reported a SECOND consent; "
                             "that switch is deleted (owner 2026-08-17) and "
                             "a field reporting a permission nothing "
                             "enforces is a false sentence in the one place "
                             "a surface goes to ask")

            # (b) an EXPLICIT false still means off, and the route that
            # writes refuses on its own. ⚠ RE-POINTED 2026-08-17 (#95): this
            # drove the deleted labelling apply; the readability write is the
            # only writing route left.
            status, _ = self.request_json(
                "POST", "/api/meta", {"cleaning_enabled": False})
            self.assertEqual(status, 200)
            status, data = self.request_json(
                "GET", "/api/librarian/clean/status")
            self.assertIs(data["available"], False,
                          "an explicit false is off — the switch still works")
            self.assertIs(data["enabled"], False)
            status, data = self.request_json(
                "POST", "/api/librarian/clean/write",
                {"writes": [{"id": item_id, "body": "anything at all"}]})
            self.assertEqual(status, 400)
            self.assertEqual(data["error"], server.CLEAN_OFF_MSG)

            # (c) THE HOLE THAT STOOD HERE IS CLOSED, and this half drives
            # the closing rather than describing it. What it recorded: the
            # second switch, `cleaning_writeback_enabled`, gated NOTHING —
            # #95 deleted the labelling apply that consulted it, and the
            # readability write has only ever gated on `cleaning_enabled`.
            # Manage and the librarian chat went on offering it, so it was a
            # permission a person could turn off and be WRONG about, which is
            # worse than not having one.
            #
            # ⚠ THE OWNER'S RULING (2026-08-17) IS ONE SWITCH, NOT A REBUILT
            # SPLIT. #88 had ruled the two-switch shape (send ≠ write)
            # survives its feature; laying a note out IS the whole tidy-up
            # now, so a look-but-don't-touch setting would leave a feature
            # that does nothing at all. (b) above is what the permission
            # means today: off, and the write route refuses.
            #
            # ⛔ WHAT IS DRIVEN HERE IS THE LEGACY STORE — the one shape a
            # deletion can get silently wrong. A store written before today
            # still carries the key. It must be INERT: not a ghost gate that
            # blocks a tidy-up she never turned off, and not a stale `false`
            # the room quietly honours while showing her no switch for it.
            status, _ = self.request_json(
                "POST", "/api/meta", {"cleaning_enabled": True})
            self.assertEqual(status, 200)

        store = study_lib.load_store(self.library)
        store["meta"]["cleaning_writeback_enabled"] = False
        study_lib.save_store(self.library, store)
        note = pairs[0][1]
        before = note.read_bytes()
        # the fixture's own body, below the frontmatter this route never
        # touches, with ONE whitespace change — the only kind the run-time
        # self-check lets through. Stated from the fixture rather than
        # re-derived from the file, so this drives the route and does not
        # re-spell the route's own slicing back at it.
        self.assertTrue(before.endswith(b"\na letter, page 0.\n"),
                        "premise: build_notes' body, unchanged")
        with fake_claude_env(log):
            _, data = self.request_json(
                "GET", "/api/librarian/clean/status")
            self.assertIs(data["available"], True,
                          "a stale key from an older store is not a gate")
            self.assertNotIn("writeback", data)
            status, data = self.request_json(
                "POST", "/api/librarian/clean/write",
                {"writes": [{"id": item_id,
                             "body": "\na letter, page 0.\n\n"}]})
            self.assertEqual(status, 200,
                             "the one switch is on, so the write lands — the "
                             "deleted key is inert, in both directions")
            self.assertEqual(data["written"], 1,
                             "not refused and not a no-op: it wrote")
        after = note.read_bytes()
        self.assertNotEqual(after, before,
                            "and it really reached the file on disk")
        # ⚠ RE-CUT 2026-08-17, and it went RED first rather than being
        # written to fit. It asserted whitespace-only over the WHOLE FILE,
        # which was true while this route wrote nothing but the body. The
        # date repair now rides the same write (#88's ruling, her
        # instruction), and this fixture's frontmatter carries BOTH legacy
        # keys — so the file legitimately changes above the body and the old
        # assertion was measuring two different promises through one
        # comparison. Split, because they ARE two promises:
        _, fm_before, body_before = study_lib._clean_split_fm_bytes(before)
        _, fm_after, body_after = study_lib._clean_split_fm_bytes(after)
        self.assertEqual(body_after.split(), body_before.split(),
                         "HER WRITING: whitespace only, law 9's 'not one "
                         "word changes' — the promise the deleted switch "
                         "never gated and this one does")
        self.assertIn(b"published:", fm_before)
        self.assertNotIn(b"published:", fm_after,
                         "THE LABELS: the legacy date key is folded away, "
                         "which is the repair riding this write")
        self.assertIn(b"date: 2026-07-14", fm_after,
                      "and its value survives under the canonical key — a "
                      "repair, never a deletion")

        # (d) a store hand-edited to a NON-bool reads as OFF, not as
        # "absent-ish, so on". The /api/meta validator refuses these at the
        # write; this is what happens when one arrives another way.
        for bad in ("yes", 1, None, [], {}):
            store = study_lib.load_store(self.library)
            store["meta"]["cleaning_enabled"] = bad
            study_lib.save_store(self.library, store)
            with fake_claude_env(log):
                no_cached_probe()
                _, data = self.request_json(
                    "GET", "/api/librarian/clean/status")
            self.assertIs(data["enabled"], False,
                          f"cleaning_enabled={bad!r} is not a yes — the "
                          f"default is for an ABSENT key, never a junk one")
            self.assertIs(data["available"], False)

    # ⛔⛔ FIVE CASES WERE DELETED HERE 2026-08-17 (#95), and every one of them
    # drove a route that no longer exists:
    #
    #   * the APPLY INTERSECTION (D-05) — model ids ∩ scanned ids ∩ ticked
    #     ids, driven with an invented id, an out-of-scope note and a
    #     deselected one. Its gate (`clean_write_set`) is deleted; its
    #     absence is now pinned in tests/test_disclosure_truth.cjs.
    #   * UNSURE PROPOSALS HELD BACK — a model verdict nobody can produce.
    #   * APPLY THEN UNDO restores bytes and mtime — the readability pass's
    #     own write/undo round trip covers this in ReadabilityRouteTest
    #     (`test_a_whitespace_only_write_lands_and_undo_puts_it_back`), and
    #     #95 required the undo route itself to stay byte-identical, which
    #     it did.
    #   * AN APPLIED BATCH IS NOT RE-OFFERED — the `applied` stamp was read
    #     by the deleted progress route.
    #   * THE HEADINGS MAP IS PRESENT AND EMPTY with no librarian — the map,
    #     the route serving it and the client reading it are all gone.
    #
    # ⚠ WHAT IS DELIBERATELY NOT LOST: the fence, the switch, the write and
    # the undo are all still driven, in the two classes below this one. The
    # cases above tested a labelling flow; they were not the tidy-up's only
    # coverage and their subjects no longer exist to cover.


# ---------------------------------------------------------------------------
# ---- 26.9-03: THE DECORATION STORE (D-23, T-26.9-10..16) ------------------
#
# Two classes, both deliberately server-free where the server adds nothing:
# validate_decorations is a PURE function and the store trio is PURE file
# IO, so driving them directly is both faster and more precise than driving
# them through a socket. The route round trip gets its own small class that
# does start a server, because "the route is wired" is the one claim only a
# real request can make.
#
# NOTHING HERE TOUCHES REAL USER DATA. Every library root below is a
# tempfile.TemporaryDirectory. The factory-reset test in particular does an
# `rm -rf` of a librarian/ directory, and it must never be pointed anywhere
# but a temp tree.
#
# THE DEGENERATE THIS GROUP IS BUILT AGAINST, said in advance: a validator
# that refuses EVERYTHING passes all nine refusal cases below and is
# completely useless. That is why the refusal cases are PAIRED with
# test_valid_decorations_are_accepted and with a successful round trip —
# the refusals prove the fence, the acceptances prove there is a gate in it.
# Neither half may be deleted without the other becoming meaningless.
# ---------------------------------------------------------------------------


def _decor_doc(**over):
    """A minimal VALID posted document. Each refusal case below starts from
    this and breaks exactly ONE thing, so a failure names its own cause."""
    doc = {"version": 1, "day": "08/04/2026", "reset": False,
           "items": [{"page": "abc123", "kind": "text", "x": 40, "y": 90,
                      "a": 0, "s": 1.0, "text": "the light was good"}]}
    doc.update(over)
    return doc


def _decor_item(**over):
    item = {"page": "abc123", "kind": "text", "x": 40, "y": 90}
    item.update(over)
    return item


class DecorationValidatorTest(unittest.TestCase):
    """validate_decorations — the validate_layout register, in order.

    NINE named refusal branches, each driven INDEPENDENTLY from a valid
    document. A group that only tests the happy path is a group that
    measures nothing; a group that only tests refusals cannot tell a
    validator from a brick wall. Both halves are here."""

    # -- the acceptance half (without this the nine below prove nothing) ---

    def test_valid_decorations_are_accepted(self):
        self.assertIsNone(server.validate_decorations(_decor_doc()),
                          "a well-formed day record must be ACCEPTED — a "
                          "validator that refuses everything passes every "
                          "refusal case below and is worthless")

    def test_optional_fields_may_be_absent(self):
        # reset, a, s, text are all optional; the four required fields are
        # page/kind/x/y. A validator demanding everything would be a
        # different kind of refuse-everything.
        doc = _decor_doc(items=[_decor_item()])
        doc.pop("reset")
        self.assertIsNone(server.validate_decorations(doc),
                          "page/kind/x/y alone is a complete record")

    def test_an_empty_day_is_accepted(self):
        # clearing a day (she undid everything) must not be a refusal.
        self.assertIsNone(
            server.validate_decorations(_decor_doc(items=[])),
            "a day with zero marks is a legitimate post — it is how a "
            "cleared page is saved")

    def test_the_cap_boundary_itself_is_accepted(self):
        # exactly 48 is fine; 49 is the refusal (below). Asserting the
        # boundary at BOTH sides is what makes the cap a cap rather than
        # an inequality nobody checked.
        doc = _decor_doc(items=[_decor_item() for _ in
                                range(server.DECOR_CAP)])
        self.assertIsNone(server.validate_decorations(doc),
                          f"exactly {server.DECOR_CAP} marks is allowed")

    # -- the nine refusal branches, each driven independently -------------

    def test_refusal_1_non_dict(self):
        for bad in ([], "decorations", 1, None):
            self.assertIsNotNone(server.validate_decorations(bad),
                                 f"{bad!r} is not a JSON object")

    def test_refusal_2_unknown_top_level_key_names_the_offender(self):
        err = server.validate_decorations(_decor_doc(sprinkles=1))
        self.assertIsNotNone(err, "an unknown top-level key is refused")
        self.assertIn("sprinkles", err,
                      "the refusal must NAME the offending key — a bare "
                      "'invalid' tells the owner nothing about what to "
                      "fix, and 'returns non-None' is not the assertion "
                      "(the handle_meta whitelist posture)")
        # two offenders are both named, sorted — a message that names only
        # the first is a message that sends you round the loop twice.
        err2 = server.validate_decorations(_decor_doc(zzz=1, aaa=2))
        self.assertIn("aaa", err2)
        self.assertIn("zzz", err2)

    def test_refusal_3_wrong_version(self):
        for bad in (2, 0, "1", None, 1.0):
            self.assertIsNotNone(
                server.validate_decorations(_decor_doc(version=bad)),
                f"version {bad!r} is not exactly 1")

    def test_refusal_4_bool_where_an_int_is_required(self):
        # bool subclasses int — the guard order every validator in
        # server.py uses. `True` would otherwise sail through as x=1.
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_decor_item(x=True)])),
            "True is not a whole-number x (bool subclasses int)")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_decor_item(y=False)])),
            "False is not a whole-number y")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_decor_item(a=True)])),
            "True is not a whole-degree rotation")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_decor_item(s=True)])),
            "True is not a scale")

    def test_refusal_5_out_of_range_coordinate(self):
        # both ends of both axes — four cases, not one corner.
        for field, bad in (("x", server.DECOR_X_MIN - 1),
                           ("x", server.DECOR_X_MAX + 1),
                           ("y", server.DECOR_Y_MIN - 1),
                           ("y", server.DECOR_Y_MAX + 1)):
            self.assertIsNotNone(
                server.validate_decorations(
                    _decor_doc(items=[_decor_item(**{field: bad})])),
                f"{field}={bad} is off the page interior")
        # and the in-range boundaries are ACCEPTED, so the fence is a
        # fence and not a wall
        for field, ok in (("x", server.DECOR_X_MIN),
                          ("x", server.DECOR_X_MAX),
                          ("y", server.DECOR_Y_MIN),
                          ("y", server.DECOR_Y_MAX)):
            self.assertIsNone(
                server.validate_decorations(
                    _decor_doc(items=[_decor_item(**{field: ok})])),
                f"{field}={ok} is exactly on the boundary and is allowed")

    def test_refusal_6_out_of_range_scale(self):
        for bad in (0.49, 2.01, -1, 100):
            self.assertIsNotNone(
                server.validate_decorations(
                    _decor_doc(items=[_decor_item(s=bad)])),
                f"scale {bad} is outside D-07's floor and ceiling")
        for ok in (0.5, 1.0, 2.0, 1.37):
            self.assertIsNone(
                server.validate_decorations(
                    _decor_doc(items=[_decor_item(s=ok)])),
                f"scale {ok} is inside the range — fractional scale is "
                f"the POINT (.page-deco is exempt from integer-at-rest)")
        # rotation's own band, at and one past
        self.assertIsNone(server.validate_decorations(
            _decor_doc(items=[_decor_item(a=359)])))
        self.assertIsNotNone(server.validate_decorations(
            _decor_doc(items=[_decor_item(a=360)])),
            "360 is not a degree 0-359")
        self.assertIsNotNone(server.validate_decorations(
            _decor_doc(items=[_decor_item(a=-1)])))
        self.assertIsNotNone(server.validate_decorations(
            _decor_doc(items=[_decor_item(a=12.5)])),
            "a fractional degree is refused — integer degrees, because "
            "sub-degree precision is invisible at scene scale")

    def test_refusal_7_unknown_kind(self):
        # THE VOCABULARY, PINNED BY VALUE — 26.9-09, and this is the pin
        # 26.9-03's "closed at four" sentence was relying on and NEVER HAD.
        #
        # MEASURED WHILE PLANNING, NOT RECALLED: `DECOR_KINDS` had exactly
        # three readers — the membership test, the error-message join, and
        # the acceptance loop at the bottom of THIS test. That loop iterates
        # `server.DECOR_KINDS`, so its expected set comes from the very
        # tuple it is meant to be pinning; it cannot fail a widening in
        # either direction. "Closed at four" lived in a comment and in a
        # failure-message string and in nothing else.
        #
        # BOTH HALVES ARE REQUIRED AND NEITHER MAY BE DELETED. The loop
        # alone cannot fail a widening (it derives its answer from the
        # source). This equality alone cannot fail a validator that stops
        # honouring the tuple. Each is the other's blind spot.
        self.assertEqual(
            server.DECOR_KINDS,
            ("sticker", "image", "text", "stroke", "photo"),
            "the decoration kind vocabulary is these FIVE names in this "
            "order. It was 4 until 26.9-09 and it is 5 now — both numbers "
            "stated, so the next widening is again a deliberate edit here "
            "rather than a silent one. The fifth is `photo`: the page's own "
            "auto-composed polaroid promoted to a stored transform (D-01's "
            "other half, WINDOWS row 19). It is a FIFTH kind rather than an "
            "overloaded `image` because an image record REFERENCES another "
            "item and carries a `ref`, while a photo record IS the page's "
            "own item and carries none")
        self.assertEqual(
            len(server.DECOR_KINDS), 5,
            "and the COUNT itself, by value — old 4, new 5")
        # THE STRONGEST THING THIS WIDENING CAN SAY IS THAT IT NEEDED NO NEW
        # FIELD, and an unpinned key list makes that claim unverifiable.
        self.assertEqual(
            server.DECOR_ITEM_KEYS,
            ("page", "kind", "sprite", "ref", "text", "pts", "x", "y",
             "a", "s"),
            "the ten accepted item keys, unchanged by 26.9-09. A photo "
            "record uses page, kind, x, y (and the optional a/s every mark "
            "already has) — no new field on either side of the wire")
        for bad in ("gif", "video", "", None, 1, "TEXT"):
            self.assertIsNotNone(
                server.validate_decorations(
                    _decor_doc(items=[_decor_item(kind=bad)])),
                f"kind {bad!r} is not one of {server.DECOR_KINDS}")
        # KEPT, and kept deliberately: it is the half that catches a
        # validator which stops honouring the tuple it declares.
        for ok in server.DECOR_KINDS:
            self.assertIsNone(
                server.validate_decorations(
                    _decor_doc(items=[_decor_item(kind=ok)])),
                f"{ok} is a declared kind and must be accepted")

    def test_refusal_8_off_roster_sprite(self):
        # ROSTER MEMBERSHIP, NOT SANITISATION.
        #
        # 26.9-04 FILLED THE ROSTER. In 26.9-03 this test asserted
        # `DECOR_SPRITES == ()` — correct then, because the sheet did not
        # exist and the point was that the CHECK shipped before the names
        # did. That assertion is now REPLACED rather than deleted: the
        # roster is pinned by equality against the ten names the sticker
        # sheet actually carries, so a name added on one side only is caught
        # here as well as by the regen gate's step 2.
        self.assertEqual(
            server.DECOR_SPRITES,
            ("stamp-post", "washi-stripe", "corner-photo", "ticket",
             "moon", "candle-mark",
             "stamp-round", "washi-dot", "tape-clear", "thread"),
            "the roster is the six core stickers plus the four richness "
            "ones, in sheet order — a Tier C cut drops the last four HERE, "
            "in app.js NB_STICKERS and in the generator, and nowhere else")
        for bad in ("washi-a", "anything"):
            self.assertIsNotNone(
                server.validate_decorations(
                    _decor_doc(items=[_decor_item(kind="sticker",
                                                  sprite=bad)])),
                f"{bad!r} is not on the roster")

    def test_acceptance_8_every_rostered_sprite_is_accepted(self):
        # THE POSITIVE HALF, and it could not be written until 26.9-04:
        # against an EMPTY roster a validator that refuses every sprite
        # value passes the refusal case above perfectly. Now that names
        # exist, "refuse everything" fails here. NEITHER HALF MAY BE
        # DELETED WITHOUT THE OTHER BECOMING MEANINGLESS.
        self.assertTrue(server.DECOR_SPRITES, "the roster must not be empty")
        for name in server.DECOR_SPRITES:
            self.assertIsNone(
                server.validate_decorations(
                    _decor_doc(items=[_decor_item(kind="sticker",
                                                  sprite=name)])),
                f"{name!r} is on the roster and must be accepted — a "
                f"sticker she can pick and never save is worse than one "
                f"that does not ship")

    def test_refusal_8b_path_shaped_sprite_misses_the_roster(self):
        # T-26.9-11. A traversal-shaped value is refused by the SAME
        # membership test as a typo — it is never parsed, never
        # normalised, never stripped. That is the whole defence, and it
        # is the shipped ACCESSORY_SPRITES reasoning verbatim.
        for bad in ("../../etc/passwd", "/etc/passwd",
                    "assets/room/washi.png", "..\\..\\windows\\system32",
                    "washi-a/../../../items.json"):
            err = server.validate_decorations(
                _decor_doc(items=[_decor_item(kind="sticker",
                                              sprite=bad)]))
            self.assertIsNotNone(
                err, f"a path-shaped sprite {bad!r} must be refused")
            self.assertNotIn(
                bad, err,
                "and the refusal must not echo the attacker's string back")

    def test_refusal_9_cap_overflow(self):
        doc = _decor_doc(items=[_decor_item() for _ in
                                range(server.DECOR_CAP + 1)])
        err = server.validate_decorations(doc)
        self.assertIsNotNone(
            err, f"{server.DECOR_CAP + 1} marks on one day is refused")
        self.assertIn(str(server.DECOR_CAP), err,
                      "and the refusal says what the cap IS")

    # -- three more the register demands, beyond the named nine -----------

    def test_refusal_unknown_record_field_names_the_offender(self):
        err = server.validate_decorations(
            _decor_doc(items=[_decor_item(colour="red")]))
        self.assertIsNotNone(err)
        self.assertIn("colour", err,
                      "the per-record whitelist names its offender too")

    def test_refusal_missing_ownership_key(self):
        # D-06: the key is the blessing's itemId, never a page ordinal.
        bad = _decor_item()
        bad.pop("page")
        self.assertIsNotNone(
            server.validate_decorations(_decor_doc(items=[bad])),
            "a decoration with no page has no owner and can never be "
            "resolved against the ledger")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_decor_item(page="")])),
            "an empty page id is not an owner")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_decor_item(page=3)])),
            "a page ORDINAL is refused by type — D-06 rated the ownership "
            "key costly to change, and an int here is that change "
            "arriving by accident")

    def test_refusal_text_cap_at_exactly_80_and_81(self):
        # asserted at the boundary in both directions, never as an
        # inequality nobody checked
        ok = "x" * server.DECOR_TEXT_CAP
        over = "x" * (server.DECOR_TEXT_CAP + 1)
        self.assertIsNone(
            server.validate_decorations(
                _decor_doc(items=[_decor_item(text=ok)])),
            f"exactly {server.DECOR_TEXT_CAP} characters is allowed")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_decor_item(text=over)])),
            f"{server.DECOR_TEXT_CAP + 1} characters is refused")
        # and the cap is CHARACTERS, not bytes: 80 CJK code points fit.
        self.assertIsNone(
            server.validate_decorations(
                _decor_doc(items=[_decor_item(
                    text="光" * server.DECOR_TEXT_CAP)])),
            "the cap counts characters — 80 CJK code points is 80")

    def test_refusal_bad_day_label(self):
        for bad in ("", None, 1, [], "x" * (server.DECOR_DAY_CAP + 1)):
            self.assertIsNotNone(
                server.validate_decorations(_decor_doc(day=bad)),
                f"day {bad!r} is not a calendar-day label")

    def test_refusal_non_bool_reset(self):
        """26.9-06 (D-15): `reset` is a GENUINE boolean field, so this is
        the bool-INCLUDING guard — the exact opposite of the numeric fields
        above, where a bool must be REFUSED because bool subclasses int.
        Getting the two the same way round is why they are asserted in the
        same class.

        EXTENDED HERE RATHER THAN DUPLICATED. 26.9-03 shipped the refusal
        half alone, and the refusal half alone is the degenerate this whole
        class is written against: a validator that refuses every reset
        passes all of it and would make the day reset unstorable. The
        acceptance half is what turns it into a gate."""
        for bad in ("true", "false", "", 1, 0, 1.0, None, [], {}):
            self.assertIsNotNone(
                server.validate_decorations(_decor_doc(reset=bad)),
                f"reset {bad!r} is not a boolean. 1 and 0 are the two that "
                f"matter most: `if data['reset']` would read them as true "
                f"and false and the store would carry a day flagged with "
                f"an integer nobody wrote")
        for ok in (True, False):
            self.assertIsNone(
                server.validate_decorations(_decor_doc(reset=ok)),
                f"reset={ok!r} is exactly what the flag is for — without "
                f"this half the nine refusals above are satisfied by a "
                f"wall")


def _stroke_item(runs=None, **over):
    """A stroke group. Points are held RELATIVE to the record's (x, y), so
    every bound below is checked on the ABSOLUTE point — which is the only
    coordinate that has to sit on the page."""
    item = {"page": "abc123", "kind": "stroke", "x": 40, "y": 90,
            "pts": runs if runs is not None else [[0, 0, 8, 4, 16, 0]]}
    item.update(over)
    return item


class DecorationStrokeValidatorTest(unittest.TestCase):
    """26.9-07 (D-10 tier 2): the freehand pen's points, in the same
    validator and under the same register as every other field.

    THE PEN ADDS NO NEW STORE SHAPE AND NO NEW ROUTE. It adds one `kind`
    value the vocabulary already carried and one optional field, so this
    class extends the day record's validation rather than validating a
    second thing — and, as everywhere else in this file, it holds BOTH
    halves: a validator that refuses every stroke would pass every refusal
    below and would make the pen unusable while looking rigorous."""

    # -- the acceptance half (without it the refusals prove nothing) ------

    def test_a_stroke_group_is_accepted(self):
        self.assertIsNone(
            server.validate_decorations(
                _decor_doc(items=[_stroke_item()])),
            "a well-formed stroke group must be ACCEPTED")

    def test_pts_is_optional_and_the_other_kinds_are_untouched(self):
        # a stroke record carrying no points renders nothing client-side;
        # it is not a refusal, exactly as an off-roster sprite is not.
        item = _stroke_item()
        item.pop("pts")
        self.assertIsNone(
            server.validate_decorations(_decor_doc(items=[item])),
            "pts is optional, like text and sprite before it")
        self.assertIsNone(
            server.validate_decorations(_decor_doc(items=[_decor_item()])),
            "and a plain text record still validates — the new branch is a "
            "branch, not a new precondition on everything else")

    def test_both_ceilings_at_the_ceiling_and_one_past(self):
        """T-26.9-33. Asserted from BOTH sides of each bound, because a cap
        tested only from above is an inequality nobody looked at."""
        # exactly DECOR_PTS_CAP points in one stroke
        run = []
        for i in range(server.DECOR_PTS_CAP):
            run.extend([i, 0])
        self.assertIsNone(
            server.validate_decorations(
                _decor_doc(items=[_stroke_item(runs=[run])])),
            f"exactly {server.DECOR_PTS_CAP} points is allowed")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_stroke_item(runs=[run + [0, 1]])])),
            f"{server.DECOR_PTS_CAP + 1} points is one past the ceiling")
        # exactly DECOR_STROKE_CAP strokes in one group
        runs = [[0, 0, 4, 4] for _ in range(server.DECOR_STROKE_CAP)]
        self.assertIsNone(
            server.validate_decorations(
                _decor_doc(items=[_stroke_item(runs=runs)])),
            f"exactly {server.DECOR_STROKE_CAP} strokes is allowed")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_stroke_item(
                    runs=runs + [[0, 0, 4, 4]])])),
            f"{server.DECOR_STROKE_CAP + 1} strokes is one past it")

    def test_the_worst_case_payload_fits_the_body_limit(self):
        """THE ARITHMETIC IS EXECUTED, not asserted in a comment. The two
        ceilings only mean something if the product of every cap in the
        chain is smaller than the request the server will accept."""
        numbers = (server.DECOR_CAP * server.DECOR_STROKE_CAP *
                   server.DECOR_PTS_CAP * 2)
        self.assertEqual(numbers, 98304,
                         "48 groups x 16 strokes x 64 points x 2 "
                         "coordinates, computed rather than recalled")
        # four characters per number is generous: the coordinates are
        # bounded at 379/189, so three digits and a comma is the maximum.
        self.assertLess(numbers * 4, server.MAX_BODY_BYTES,
                        f"the worst-case stroke payload ({numbers * 4} "
                        f"bytes) must fit MAX_BODY_BYTES "
                        f"({server.MAX_BODY_BYTES}) — a cap chain whose "
                        f"product the server would reject is a cap chain "
                        f"that produces an unsaveable page")

    def test_refusal_non_numeric_point(self):
        # bool subclasses int, so True would otherwise sail through as the
        # coordinate 1 — the same guard order every field in this file uses.
        for bad in ("4", None, True, False, 1.5, [], {}):
            self.assertIsNotNone(
                server.validate_decorations(
                    _decor_doc(items=[_stroke_item(
                        runs=[[0, 0, bad, 4]])])),
                f"{bad!r} is not a whole-number stroke coordinate")

    def test_refusal_point_outside_the_page_interior(self):
        """Checked on the ABSOLUTE point (record origin + relative point),
        both ends of both axes — four cases, not one corner."""
        cases = (
            ("x", server.DECOR_X_MAX - 40 + 1),
            ("x", server.DECOR_X_MIN - 40 - 1),
            ("y", server.DECOR_Y_MAX - 90 + 1),
            ("y", server.DECOR_Y_MIN - 90 - 1),
        )
        for axis, rel in cases:
            run = [0, 0, rel, 0] if axis == "x" else [0, 0, 0, rel]
            self.assertIsNotNone(
                server.validate_decorations(
                    _decor_doc(items=[_stroke_item(runs=[run])])),
                f"a point one step off the {axis} bound is refused — the "
                f"record sits at (40, 90) and the bound is on the sum")
        # and the boundaries themselves are ACCEPTED, so this is a fence
        for axis, rel in (("x", server.DECOR_X_MAX - 40),
                          ("x", server.DECOR_X_MIN - 40),
                          ("y", server.DECOR_Y_MAX - 90),
                          ("y", server.DECOR_Y_MIN - 90)):
            run = [0, 0, rel, 0] if axis == "x" else [0, 0, 0, rel]
            self.assertIsNone(
                server.validate_decorations(
                    _decor_doc(items=[_stroke_item(runs=[run])])),
                f"exactly on the {axis} bound is allowed")

    def test_refusal_malformed_runs(self):
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_stroke_item(runs="0,0 4,4")])),
            "pts is a list of strokes, never a string")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_stroke_item(runs=[{"x": 1}])])),
            "each stroke is a list")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_stroke_item(runs=[[0, 0, 4]])])),
            "an odd number of coordinates is not a run of x/y pairs")
        self.assertIsNotNone(
            server.validate_decorations(
                _decor_doc(items=[_stroke_item(runs=[[4, 4]])])),
            "a ONE-POINT run is not a stroke — a polyline with a single "
            "point draws nothing, and storing one is the "
            "capture-everything implementation the client refuses too")

    def test_the_two_ceilings_are_mirrored_in_app_js(self):
        """MIRRORED, NOT DERIVED — and asserted in BOTH directions, because
        a ceiling the two sides disagree about is a ceiling one of them
        silently walks through."""
        src = (Path(server.__file__).parent / "app.js").read_text(
            encoding="utf-8")
        pairs = (("NB_PEN_PTS_CAP", server.DECOR_PTS_CAP),
                 ("NB_PEN_STROKE_CAP", server.DECOR_STROKE_CAP))
        for name, expected in pairs:
            found = re.search(r"var\s+" + name + r"\s*=\s*(\d+)\s*;", src)
            self.assertIsNotNone(found, f"app.js declares {name}")
            self.assertEqual(int(found.group(1)), expected,
                             f"app.js {name} and server.py must agree")
        # the positive control: the regex really is reading app.js and not
        # matching an empty string somewhere
        self.assertGreater(len(src), 100000,
                           "app.js was actually read")


class DecorationStoreTest(unittest.TestCase):
    """The store trio: fail-open reads, atomic byte-stable writes, and the
    one that carries this plan's owner decision — SURVIVING THE LIBRARIAN'S
    FACTORY RESET (D-23)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.library = Path(self._tmp.name) / "library"
        self.library.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    # -- D-23, the load-bearing test of this whole plan -------------------

    def test_decorations_survive_the_librarian_factory_reset(self):
        """OWNER DECISION D-23, 2026-08-04, in its machine-checkable form.

        `rm -rf librarian/` is the librarian's DOCUMENTED factory reset —
        server.py's own _librarian_dir docstring says so. It is a supported
        operation. Her decorating must come through it untouched, because
        the library root is the irreplaceable tier and librarian/ is the
        rebuildable one.

        This test was driven RED by pointing decorations_file_path inside
        librarian/, and the mutation was confirmed to have landed on the
        path helper before being reverted. Without that it would be a test
        that cannot fail."""
        # a full librarian folder, exactly as a real install has it
        lib_dir = self.library / "librarian"
        lib_dir.mkdir()
        study_lib.save_blessings(
            self.library, [{"item_id": "abc123", "ms": 1,
                            "why": "it was a good day", "author": "user"}])
        (lib_dir / "read.json").write_text("{}", encoding="utf-8")
        self.assertTrue((lib_dir / "blessings.json").exists(),
                        "the librarian folder is populated before the "
                        "reset — otherwise this test resets nothing")

        # she decorates
        days = {"08/04/2026": {"reset": False, "items": [
            {"page": "abc123", "kind": "text", "x": 40, "y": 90,
             "text": "the light was good"}]}}
        study_lib.save_decorations(self.library, days)

        # THE PRECONDITION THAT MAKES THIS TEST MEAN ANYTHING: the file is
        # NOT inside librarian/. Asserted, not assumed — if the path helper
        # moved, the rmtree below would delete the store and the read after
        # it would return the empty wrapper, and a lazier version of this
        # test would then have to be read carefully to see that it failed
        # for the RIGHT reason.
        store = study_lib.decorations_file_path(self.library)
        self.assertEqual(store.parent, self.library,
                         "D-23: decorations.json is a SIBLING of "
                         "librarian/, directly under the library root")
        self.assertTrue(store.exists())

        # THE FACTORY RESET
        shutil.rmtree(lib_dir)
        self.assertFalse(lib_dir.exists(), "librarian/ is gone")

        # her decorating is still there, whole
        back = study_lib.load_decorations(self.library)
        self.assertEqual(
            back["days"], days,
            "a librarian factory reset MUST leave her decorating "
            "untouched (D-23, owner-decided 2026-08-04). Handmade work is "
            "the one thing in this app that cannot be regenerated")
        # and the librarian's own memory IS gone — proving the reset
        # actually happened rather than the test resetting nothing
        self.assertEqual(study_lib.load_blessings(self.library),
                         {"blessings": []},
                         "the blessings ledger DID go with librarian/ — "
                         "that is what makes the survival above a result")

        # the store still writes after the reset (no lingering dependency
        # on a librarian/ directory that no longer exists)
        days2 = dict(days)
        days2["08/05/2026"] = {"reset": False, "items": []}
        study_lib.save_decorations(self.library, days2)
        self.assertEqual(study_lib.load_decorations(self.library)["days"],
                         days2, "and it keeps working afterwards")

    # -- fail-open: three separate cases, no exception escapes ------------

    def test_fail_open_missing_file(self):
        self.assertEqual(study_lib.load_decorations(self.library),
                         {"version": 1, "days": {}},
                         "a missing store reads as the empty wrapper")

    def test_fail_open_unreadable_file(self):
        # a DIRECTORY where the file should be: read_text raises OSError
        study_lib.decorations_file_path(self.library).mkdir()
        self.assertEqual(study_lib.load_decorations(self.library),
                         {"version": 1, "days": {}},
                         "an unreadable store reads as the empty wrapper, "
                         "never an error (the _load_insights posture)")

    def test_fail_open_hand_edited_off_shape_file(self):
        for junk in ("not json at all", "[]", '"a string"', "null",
                     '{"days": []}', '{"days": "oops"}', '{}', "3"):
            study_lib.decorations_file_path(self.library).write_text(
                junk, encoding="utf-8")
            self.assertEqual(
                study_lib.load_decorations(self.library),
                {"version": 1, "days": {}},
                f"a hand-edited off-shape store ({junk!r}) reads as the "
                f"empty wrapper — the file is hers to edit and editing it "
                f"badly is never an error")

    def test_fail_open_never_raises_on_a_partial_write(self):
        # a truncated JSON document — the shape a NON-atomic writer would
        # leave behind. The read survives it; the write below is what
        # makes sure it can never happen in the first place.
        study_lib.decorations_file_path(self.library).write_text(
            '{"version": 1, "days": {"08/04/2026": {"items": [{"pa',
            encoding="utf-8")
        self.assertEqual(study_lib.load_decorations(self.library),
                         {"version": 1, "days": {}})

    # -- byte stability ---------------------------------------------------

    def test_saving_the_same_record_twice_is_byte_identical(self):
        days = {"08/04/2026": {"reset": False, "items": [
            {"page": "abc123", "kind": "text", "x": 40, "y": 90,
             "text": "光 was good"}]}}
        study_lib.save_decorations(self.library, days)
        first = study_lib.decorations_file_path(self.library).read_bytes()
        study_lib.save_decorations(self.library, days)
        second = study_lib.decorations_file_path(self.library).read_bytes()
        self.assertEqual(first, second,
                         "the same input produces the same BYTES — "
                         "asserted by comparing them, not by 'no exception "
                         "was raised'")

    def test_byte_stability_is_independent_of_insertion_order(self):
        # the assertion sort_keys actually earns. Two days added in
        # opposite orders must serialise identically, or a re-save after a
        # reload would churn the file for no reason.
        a = {"reset": False, "items": []}
        b = {"reset": True, "items": []}
        study_lib.save_decorations(self.library,
                                   {"08/04/2026": a, "08/05/2026": b})
        one = study_lib.decorations_file_path(self.library).read_bytes()
        study_lib.save_decorations(self.library,
                                   {"08/05/2026": b, "08/04/2026": a})
        two = study_lib.decorations_file_path(self.library).read_bytes()
        self.assertEqual(one, two,
                         "day order in the posted map must not change the "
                         "stored bytes (stable key order)")

    def test_the_file_is_hand_openable_utf8(self):
        # ensure_ascii=False + indent=1, the shipped serialisation. Her
        # own words are in this file; she must be able to read it.
        study_lib.save_decorations(self.library, {"08/04/2026": {
            "reset": False,
            "items": [{"page": "a", "kind": "text", "x": 4, "y": 4,
                       "text": "光线很好"}]}})
        raw = study_lib.decorations_file_path(
            self.library).read_text(encoding="utf-8")
        self.assertIn("光线很好", raw,
                      "her own characters are stored as themselves, not "
                      "as \\uXXXX escapes — the file is hers to open")
        self.assertIn("\n", raw, "and it is indented, not one long line")

    def test_the_write_is_atomic_no_temp_file_survives(self):
        study_lib.save_decorations(self.library, {"08/04/2026": {
            "reset": False, "items": []}})
        leftovers = [p.name for p in self.library.iterdir()
                     if p.name != "decorations.json"]
        self.assertEqual(leftovers, [],
                         "atomic_write_bytes leaves no same-dir temp "
                         "behind — a crash mid-write leaves the PRIOR "
                         "file intact, never a torn record")

    def test_the_store_does_not_create_a_librarian_folder(self):
        study_lib.save_decorations(self.library, {"08/04/2026": {
            "reset": False, "items": []}})
        self.assertFalse((self.library / "librarian").exists(),
                         "the decoration store has no business creating "
                         "the librarian's folder — it is a sibling, and "
                         "siblings do not build each other's houses")


class VisionCacheLifetimeTest(unittest.TestCase):
    """D-05, in its machine-checkable form — THE SECOND MEMBER OF THE
    FACTORY-RESET GROUP, and it is the decorations case's shape copied whole
    because that shape is what makes it able to fail.

    Her own names are REAL LIBRARIAN MEMORY. The Vision cache is a
    REGENERABLE CACHE — its own docstring says re-running the import pass
    rebuilds it and nothing else does. D-05 says those two must not share a
    lifetime OR a delete path, which is TWO claims and therefore two cases:

      A. `rm -rf librarian/` — the DOCUMENTED factory reset (server.py's own
         `_librarian_dir` docstring says so) — leaves the Vision cache whole.
      B. `rm -rf vision/` — clearing the cache — leaves `notebook.md`,
         `identity.md` and `meta.librarian_name` BYTE-IDENTICAL.

    ⚠ HALF B COMPARES SHA256, NOT EXISTENCE. The failure D-05 guards against
    is a rewrite that keeps the file, not only a delete; a case that asserted
    `exists()` would come up green on a notebook that had been emptied.

    ⚠ BOTH CASES ASSERT THE LIBRARIAN'S OWN MEMORY IS GONE AFTER THEIR OWN
    rmtree — otherwise a test that reset nothing would report a survival.

    Case A was driven RED by pointing `study_lib.vision_dir_path` INSIDE
    `librarian/`, exactly as `decorations.json`'s was, and the mutation was
    confirmed by sha256 to have LANDED on the path helper before being
    reverted. Case B was driven RED by making the cache clear take
    `librarian/identity.md` with it. Without those two runs these would be
    tests that cannot fail.

    ⚠ `-k` DOES NOT FILTER THIS FILE. `main()` below loads the module and
    then runs a drill and a real-config-directory check that a filtered run
    would skip, so it ignores argv on purpose. To run this group alone:
    `python3 -m unittest discover -s tests -p test_server_smoke.py
    -k factory_reset -k vision_cache -v`."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.library = Path(self._tmp.name) / "library"
        self.library.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    # -- fixtures ---------------------------------------------------------

    def her_names(self):
        """The three things that are HERS: the diary, the derived page, and
        the name she gave the librarian. Returns their sha256s."""
        lib_dir = self.library / "librarian"
        lib_dir.mkdir(exist_ok=True)
        study_lib.append_notebook(
            lib_dir / "notebook.md",
            ["sorted 12 today — 9 joyful", "she called the shelf 'the good "
             "row'"])
        study_lib.save_identity_file(self.library, {
            "topics": [], "tags": [], "folders": [],
            "themes": [["knitting", 9]], "folder_rows": [],
            "phrases": [["the light was good", 4]],
            "evidence": 40, "thin": False})
        store = study_lib.new_store(str(self.library))
        store["meta"]["librarian_name"] = "Wren"
        study_lib.save_store(str(self.library), store)
        return {
            "notebook.md": self.sha(lib_dir / "notebook.md"),
            "identity.md": self.sha(study_lib.identity_file_path(
                self.library)),
            "items.json": self.sha(self.library / "items.json"),
        }

    def a_few_readings(self, ids=("aa01", "bb02", "cc03")):
        """Real cache entries, written by the shipped writer."""
        out = {}
        for n, item_id in enumerate(ids):
            row = {"path": "/x/" + item_id + ".png",
                   "text": "the words off her picture",
                   "themes": ["a"], "faces": 0, "lang": "auto", "dim": 768,
                   "type": 1,
                   "fp": base64.b64encode(bytes([n + 1]) * 3072)
                   .decode("ascii")}
            study_lib.vision_write_entry(str(self.library), item_id, row,
                                         "fp0")
            out[item_id] = (
                self.sha(study_lib.vision_entry_path(str(self.library),
                                                     item_id)),
                self.sha(study_lib.vision_print_path(str(self.library),
                                                     item_id)))
        return out

    def sha(self, path):
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()

    # -- half A -----------------------------------------------------------

    def test_vision_cache_survives_the_librarian_factory_reset(self):
        names = self.her_names()
        readings = self.a_few_readings()
        lib_dir = self.library / "librarian"
        self.assertTrue((lib_dir / "notebook.md").exists(),
                        "the librarian folder is populated before the reset "
                        "— otherwise this test resets nothing")

        # THE PRECONDITION THAT MAKES THIS TEST MEAN ANYTHING, asserted and
        # never assumed: the cache is a SIBLING. If the path helper moved,
        # the rmtree below would take the cache and a lazier version of this
        # test would have to be read carefully to see it failed for the
        # right reason.
        self.assertEqual(
            study_lib.vision_dir_path(self.library).parent, self.library,
            "D-05: vision/ is a SIBLING of librarian/, directly under the "
            "library root")

        # THE FACTORY RESET
        shutil.rmtree(lib_dir)
        self.assertFalse(lib_dir.exists(), "librarian/ is gone")

        for item_id, (entry_sha, print_sha) in readings.items():
            self.assertEqual(
                self.sha(study_lib.vision_entry_path(str(self.library),
                                                     item_id)), entry_sha,
                "a librarian factory reset MUST leave the Vision cache "
                "untouched — the two tiers have separate lifetimes (D-05)")
            self.assertEqual(
                self.sha(study_lib.vision_print_path(str(self.library),
                                                     item_id)), print_sha)

        # and her memory IS gone — proving the reset actually happened
        self.assertFalse(study_lib.identity_file_path(self.library).exists(),
                         "identity.md DID go with librarian/ — that is what "
                         "makes the survival above a result")
        self.assertFalse((lib_dir / "notebook.md").exists())
        # the store, which is NOT in librarian/, keeps the name she gave
        self.assertEqual(self.sha(self.library / "items.json"),
                         names["items.json"])

        # and the cache still writes afterwards (no lingering dependency on
        # a librarian/ directory that no longer exists)
        again = self.a_few_readings(("dd04",))
        self.assertEqual(len(again), 1)

    # -- half B -----------------------------------------------------------

    def test_clearing_the_vision_cache_leaves_her_names_byte_identical(self):
        names = self.her_names()
        self.a_few_readings()
        vision_dir = study_lib.vision_dir_path(self.library)
        self.assertTrue(any(vision_dir.iterdir()),
                        "the cache is populated before it is cleared — "
                        "otherwise this test clears nothing")
        self.assertEqual(vision_dir.parent, self.library,
                         "the same sibling precondition, asserted on this "
                         "side too")

        # CLEARING THE CACHE — the operation D-05 says must be cheap
        shutil.rmtree(vision_dir)
        self.assertFalse(vision_dir.exists(), "vision/ is gone")

        lib_dir = self.library / "librarian"
        self.assertEqual(
            self.sha(lib_dir / "notebook.md"), names["notebook.md"],
            "clearing the Vision cache MUST leave notebook.md byte-"
            "identical — it is her librarian's memory, not a cache, and "
            "SHA256 is compared rather than existence because the failure "
            "D-05 guards against is a REWRITE that keeps the file (D-05)")
        self.assertEqual(
            self.sha(study_lib.identity_file_path(self.library)),
            names["identity.md"],
            "clearing the Vision cache MUST leave identity.md byte-"
            "identical (D-05)")
        self.assertEqual(
            self.sha(self.library / "items.json"), names["items.json"],
            "and meta.librarian_name with it — the name she gave the "
            "librarian lives in the store, one tier above both of these")
        store = study_lib.load_store(str(self.library))
        self.assertEqual(store["meta"].get("librarian_name"), "Wren")

        # and the CACHE is gone — proving the clear actually happened
        self.assertIsNone(
            study_lib.vision_read_entry(str(self.library), "aa01"),
            "the readings DID go — that is what makes the survivals above "
            "a result")


class _FakeAdapter(object):
    """A local source that needs no Apple app, no Automation prompt, and no
    TCC dialog — the only way this suite can drive collect → import → Vision
    end to end on a machine that must never be asked for permissions.

    It satisfies the three things handle_adapter_collect's worker asks of an
    adapter and nothing else: SOURCE, collect(root, staging, progress_cb) →
    exported ids, and mark_origin(store, staging)."""

    SOURCE = "test-adapter"

    def collect(self, library_root, staging, progress_cb=None):
        (Path(staging) / "photo.png").write_bytes(PNG_1x1)
        if progress_cb is not None:
            progress_cb(1, 1)
        return ["fake-1"]

    def mark_origin(self, store, staging):
        return 0


class VisionStageInTheImportTest(unittest.TestCase):
    """26.94-06 (D-04, law 6): THE FOURTH PHASE, wired into the import.

    STANDALONE HARNESS ON PURPOSE, not `(ServerSmokeTest)` — the reason
    DecorationRouteTest states one screen up, and it applies unchanged here:
    subclassing the smoke case re-runs all 58 of its tests under a second
    class name for zero additional information. The four methods below are
    the whole marginal value.

    The three claims this class exists for, and each is a claim only an
    end-to-end run can make:

      1. ORDER. The three job dicts move through their states in order and
         VISION_JOB is LAST — it starts after the import's save_store has
         committed and after the import has already reported.
      2. THE LOCK. WRITE_LOCK is FREE for the whole Vision stage. Held across
         a twenty-minute run it would freeze every other write in the room
         (T-26.94-34), so this is asserted from inside the stage rather than
         read off the source.
      3. IT CANNOT TAKE THE IMPORT DOWN. A Vision failure, and a machine with
         no Command Line Tools, both leave the import's own report BYTE-
         IDENTICAL to a clean run — asserted by comparing the two reports,
         not by asserting each looks plausible.

    ⚠ `-k` DOES NOT FILTER THIS FILE (see VisionCacheLifetimeTest). To run
    this class alone: `python3 -m unittest discover -s tests -p
    test_server_smoke.py -k vision_stage -v`.
    """

    # 26.97-06 REGRESSION REPAIR (26.97-07 found it, orchestrator fixed it):
    # `finished_ms` is a WALL CLOCK reading added to every import report by
    # commit 3f7225a, so two runs milliseconds apart legitimately differ on it
    # and a whole-report equality can no longer hold. Narrow the claim rather
    # than drop it — the same repair 26.97-06 applied to
    # test_omitting_the_param_changes_nothing — so what this seam actually
    # asserts (the report is byte-identical whether or not the reading worked)
    # survives, and a missing finish time still fails.
    def assertReportsMatch(self, actual, expected, msg):
        volatile = "finished_ms"
        self.assertEqual({k: v for k, v in actual.items() if k != volatile},
                         {k: v for k, v in expected.items() if k != volatile},
                         msg)
        self.assertIsInstance(actual.get(volatile), int,
                              "the compared report recorded no finish time")
        self.assertIsInstance(expected.get(volatile), int,
                              "the reference report recorded no finish time")


    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.library = self.tmp / "library"
        self.library.mkdir()
        self.httpd = server.create_server(self.library, 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(
            target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.adapter = _FakeAdapter()
        self._saved_adapters = server._ADAPTERS
        self._saved_sources = server.ADAPTER_SOURCES
        server._ADAPTERS = dict(server._ADAPTERS)
        server._ADAPTERS[_FakeAdapter.SOURCE] = self.adapter
        server.ADAPTER_SOURCES = tuple(server._ADAPTERS)
        self.addCleanup(setattr, server, "_ADAPTERS", self._saved_adapters)
        self.addCleanup(setattr, server, "ADAPTER_SOURCES",
                        self._saved_sources)
        for job in (server.EXPORT_JOB, server.IMPORT_JOB, server.VISION_JOB):
            with server.JOB_LOCK:
                job.update(state="idle", total=0, done=0, started_ms=0,
                           report=None, message=None)

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        self._tmp.cleanup()

    def request_json(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        headers = {}
        try:
            if body is not None:
                raw = json.dumps(body).encode("utf-8")
                headers["Content-Type"] = "application/json"
                conn.request(method, path, raw, headers)
            else:
                conn.request(method, path, headers=headers)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read())
        finally:
            conn.close()

    def collect(self):
        status, data = self.request_json(
            "POST", "/api/adapter/collect", {"source": _FakeAdapter.SOURCE})
        return status, data

    def wait_vision(self, timeout=15.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            status, snap = self.request_json("GET", "/api/vision-progress")
            self.assertEqual(status, 200)
            if snap["state"] in ("done", "error", "skipped"):
                return snap
            time.sleep(0.02)
        self.fail("the Vision stage never finished")

    def fake_pass(self, record, ok=True, boom=False):
        """Replace the pass itself — this class is about the WIRING, and the
        pass has its own suite (tests/test_vision_program.py) where it is
        driven through a real spawn."""
        def fake(library_root, store, progress_cb=None):
            with server.JOB_LOCK:
                record.append(("vision-running",
                               server.IMPORT_JOB["state"],
                               server.EXPORT_JOB["state"]))
            got = server.WRITE_LOCK.acquire(blocking=False)
            record.append(("write-lock-free", got))
            if got:
                server.WRITE_LOCK.release()
            if progress_cb is not None:
                progress_cb(1, 1)
            if boom:
                raise RuntimeError("the reader fell over")
            return {"ok": ok, "why": None if ok else server.VISION_ERROR_MSG,
                    "report": {"eligible": 1, "attempted": 1, "ok": 1,
                               "fenced_now": 0, "swept_files": 0}}
        return fake

    def install(self, fake):
        saved = server.vision_run_over_library
        server.vision_run_over_library = fake
        self.addCleanup(setattr, server, "vision_run_over_library", saved)

    # -- 1. order + the lock ----------------------------------------------

    def test_vision_stage_runs_last_and_holds_no_write_lock(self):
        record = []
        self.install(self.fake_pass(record))
        status, data = self.collect()
        self.assertEqual(status, 200, data)
        snap = self.wait_vision()

        self.assertEqual(snap["state"], "done")
        self.assertEqual([r for r in record if r[0] == "vision-running"],
                         [("vision-running", "done", "done")],
                         "the Vision stage must start only after BOTH the "
                         "export and the copy have finished and reported")
        self.assertEqual([r for r in record if r[0] == "write-lock-free"],
                         [("write-lock-free", True)],
                         "WRITE_LOCK was held across the Vision stage — a "
                         "twenty-minute run would freeze every other write")
        self.assertEqual((snap["total"], snap["done"]), (1, 1))
        _, imp = self.request_json("GET", "/api/import-progress")
        self.assertEqual(imp["state"], "done")
        self.assertIs(imp["report"]["ok"], True)

    # -- 2. it cannot fail the import --------------------------------------

    def test_vision_stage_failure_never_fails_the_import(self):
        clean = []
        self.install(self.fake_pass(clean))
        self.assertEqual(self.collect()[0], 200)
        self.wait_vision()
        _, good = self.request_json("GET", "/api/import-progress")
        good_report = good["report"]

        # a second library, same corpus, with the pass raising
        self.tearDown()
        self.setUp()
        self.install(self.fake_pass([], boom=True))
        self.assertEqual(self.collect()[0], 200)
        snap = self.wait_vision()
        self.assertEqual(snap["state"], "error")
        self.assertEqual(snap["message"], server.VISION_ERROR_MSG)
        self.assertNotIn("Traceback", snap["message"])
        _, bad = self.request_json("GET", "/api/import-progress")
        self.assertEqual(bad["state"], "done",
                         "a Vision failure took the import down with it")
        self.assertReportsMatch(bad["report"], good_report,
                                "the import's own report must be byte-identical "
                                "whether or not the reading worked")
        _, exp = self.request_json("GET", "/api/adapter/progress")
        self.assertEqual(exp["state"], "done")

    def test_vision_stage_is_skipped_not_errored_without_the_toolchain(self):
        """⚠ A ROOM WITH NO COMMAND LINE TOOLS IS A COMPLETE ROOM. The state
        name has to say that: `skipped`, never `error`, and the import's own
        report byte-identical to a run with the toolchain present."""
        clean = []
        self.install(self.fake_pass(clean))
        self.assertEqual(self.collect()[0], 200)
        self.wait_vision()
        _, good = self.request_json("GET", "/api/import-progress")
        good_report = good["report"]

        self.tearDown()
        self.setUp()
        saved = server._swiftc_path
        server._swiftc_path = lambda: None
        self.addCleanup(setattr, server, "_swiftc_path", saved)

        def never(*a, **k):
            raise AssertionError("no toolchain must mean no pass at all")

        self.install(never)
        self.assertEqual(self.collect()[0], 200)
        snap = self.wait_vision()
        self.assertEqual(snap["state"], "skipped",
                         "a missing toolchain is not an error")
        self.assertEqual(snap["message"], server.VISION_MISSING_MSG)
        _, imp = self.request_json("GET", "/api/import-progress")
        self.assertReportsMatch(imp["report"], good_report,
                                "the import's own report must be byte-identical "
                                "whether or not the reading was skipped")

    # -- 3. one at a time ---------------------------------------------------

    def test_a_second_collect_during_the_vision_stage_is_refused(self):
        """The fourth phase outlives the other two by twenty minutes, so
        without its own busy guard a second collect would start while the
        reading was still going and two readers would run over one library.
        Asserted BY VALUE: the pass is entered exactly once."""
        entered = []
        gate = threading.Event()

        def slow(library_root, store, progress_cb=None):
            entered.append(1)
            gate.wait(10)
            return {"ok": True, "why": None, "report": {}}

        self.install(slow)
        self.assertEqual(self.collect()[0], 200)
        deadline = time.time() + 10
        while not entered and time.time() < deadline:
            time.sleep(0.02)
        self.assertEqual(entered, [1], "the stage never started")

        status, data = self.collect()
        self.assertEqual(status, 400)
        self.assertEqual(data["error"], server.VISION_BUSY_MSG)
        gate.set()
        self.wait_vision()
        self.assertEqual(entered, [1],
                         "the refused collect started a second pass anyway")

    # -- 4. the hold's server half (26.94-11) -------------------------------

    def test_vision_job_says_pending_the_instant_the_import_reports_done(self):
        """26.94-11 — the owner ruled on 2026-08-14 that the import screen is
        HELD until the photographs have been read. That makes one previously
        harmless ordering into a defect: the worker marks the export and copy
        phases `done` BEFORE it reaches run_vision_stage, so a client polling
        at 1 Hz can land in between, see both done, see VISION_JOB still
        carrying the PREVIOUS collect's terminal snapshot, and take the
        report down over a reading that is about to start.

        ⚠ THE STALE `done` IS PLANTED, NOT ASSUMED. VISION_JOB is a module
        global that survives every collect, so the second import of a session
        is the real case and a test starting from `idle` would never see it.
        Both halves are asserted BY VALUE: the state at the window's far edge,
        and the previous run's report having been cleared out of it."""
        stale = {"eligible": 999, "attempted": 999, "ok": 999}
        with server.JOB_LOCK:
            server.VISION_JOB.update(state="done", total=999, done=999,
                                     started_ms=1, report=stale, message=None)
        seen = {}
        entered = threading.Event()
        real = server.run_vision_stage

        def watched(library_root, progress_cb=None):
            # Sampled at the LAST instant the window can still be open: the
            # two reports are written, the reading has not named itself yet.
            with server.JOB_LOCK:
                seen["vision"] = server.VISION_JOB["state"]
                seen["report"] = server.VISION_JOB["report"]
                seen["import"] = server.IMPORT_JOB["state"]
                seen["export"] = server.EXPORT_JOB["state"]
            entered.set()
            return real(library_root, progress_cb)

        server.run_vision_stage = watched
        self.addCleanup(setattr, server, "run_vision_stage", real)
        self.install(self.fake_pass([]))
        self.assertEqual(self.collect()[0], 200)
        # ⚠ WAIT ON THE STAGE, NEVER ON A TERMINAL STATE. wait_vision returns
        # the moment VISION_JOB reads done/error/skipped — and this test has
        # deliberately planted a `done`, so polling for one would return the
        # PLANTED value before the worker had gone anywhere near the reading.
        # That is the very confusion under test, and it caught this harness
        # first.
        self.assertTrue(entered.wait(15), "the Vision stage never started")
        self.assertEqual(self.wait_vision()["state"], "done")

        self.assertEqual((seen.get("import"), seen.get("export")),
                         ("done", "done"),
                         "the window this test is about did not open — the "
                         "other two phases had not both reported yet")
        self.assertEqual(seen.get("vision"), "pending",
                         "the reading phase must be claimed inside the SAME "
                         "locked block that finished the other two; a client "
                         "that polls here would otherwise see both done and "
                         "let the import report go up over twenty-one "
                         "minutes of reading that paint nothing")
        self.assertIsNone(seen.get("report"),
                          "the previous collect's terminal report is still "
                          "readable during the new one, so a client cannot "
                          "tell this reading from the last one")

    def test_a_reading_that_cannot_even_start_never_fails_the_import(self):
        """The sibling of the failure test above, and it was a REAL hole
        rather than a symmetry: run_vision_stage swallows everything inside
        its own `try`, but `photo_reading_available()` runs BEFORE it and
        escaped to the collect worker's outer handler — which paints an
        export ERROR over an import that fully succeeded. Since 26.94-11 the
        screen also HOLDS on `pending`, so the same escape would strand the
        readout there for ever. Both ends are closed by the fourth phase's
        own `except`, and this drives it."""
        self.install(self.fake_pass([]))
        self.assertEqual(self.collect()[0], 200)
        self.wait_vision()
        _, good = self.request_json("GET", "/api/import-progress")
        good_report = good["report"]

        self.tearDown()
        self.setUp()

        def probe_falls_over():
            raise OSError("the toolchain probe fell over")

        saved = server.photo_reading_available
        server.photo_reading_available = probe_falls_over
        self.addCleanup(setattr, server, "photo_reading_available", saved)

        def never(*a, **k):
            raise AssertionError("the pass must never be reached")

        self.install(never)
        self.assertEqual(self.collect()[0], 200)
        snap = self.wait_vision()
        self.assertEqual(snap["state"], "error",
                         "a probe that threw left the reading phase stuck — "
                         "the held import report would never be released")
        self.assertEqual(snap["message"], server.VISION_ERROR_MSG)
        self.assertNotIn("Traceback", snap["message"])
        _, imp = self.request_json("GET", "/api/import-progress")
        self.assertEqual(imp["state"], "done")
        self.assertReportsMatch(imp["report"], good_report,
                                "the import's own report must be byte-identical "
                                "whether or not the reading could even start")
        _, exp = self.request_json("GET", "/api/adapter/progress")
        self.assertEqual(exp["state"], "done",
                         "the reading's failure was painted over the "
                         "collect as an export error — the import succeeded")


class DecorationRouteTest(unittest.TestCase):
    """GET / POST /api/decorations through a real socket — the one claim
    only a real request can make.

    STANDALONE HARNESS ON PURPOSE, not `(ServerSmokeTest)`. Subclassing the
    smoke case re-runs all 58 of its tests under a second class name: that
    was measured at +34s on this file, which already takes ~97s, for zero
    additional information. (The shipped CrossOriginWriteGuardTest does
    subclass it, deliberately — it re-runs the whole route surface against
    a forged Origin, so the inherited tests ARE its subject. Here they are
    not.) The four methods below are the whole marginal value; the
    validator and the store are exhaustively driven above as pure
    functions, where they are faster and more precise."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.library = self.tmp / "library"
        self.library.mkdir()
        self.source = self.tmp / "source"
        self.source.mkdir()
        build_corpus(self.source)
        with server.JOB_LOCK:
            server.IMPORT_JOB.update(state="idle", total=0, done=0,
                                     started_ms=0, report=None,
                                     message=None)
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

    def request_json(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port,
                                          timeout=10)
        headers = {}
        try:
            if body is not None:
                raw = json.dumps(body).encode("utf-8")
                headers["Content-Type"] = "application/json"
                conn.request(method, path, raw, headers)
            else:
                conn.request(method, path, headers=headers)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read())
        finally:
            conn.close()

    def do_import(self):
        status, data = self.request_json("POST", "/api/import",
                                         {"path": str(self.source)})
        self.assertEqual(status, 200, f"import failed: {data}")
        deadline = time.time() + 10.0
        while time.time() < deadline:
            _, snap = self.request_json("GET", "/api/import-progress")
            if snap["state"] in ("done", "error"):
                self.assertEqual(snap["state"], "done", f"errored: {snap}")
                return
            time.sleep(0.02)
        self.fail("the import job never finished")

    def test_decorations_route_round_trip(self):
        # empty to begin with — fail-open all the way through the route
        status, data = self.request_json("GET", "/api/decorations")
        self.assertEqual(status, 200)
        self.assertEqual(data["days"], {},
                         "a fresh library answers the empty day map, "
                         "never an error")

        doc = _decor_doc()
        status, data = self.request_json("POST", "/api/decorations", doc)
        self.assertEqual(status, 200, f"a valid write was refused: {data}")
        self.assertEqual(data["marks"], 1)

        status, data = self.request_json("GET", "/api/decorations")
        self.assertEqual(status, 200)
        self.assertEqual(
            data["days"],
            {"08/04/2026": {"reset": False, "items": doc["items"]}},
            "what she placed is what comes back")

        # idempotent: the same post twice leaves the same bytes
        store = study_lib.decorations_file_path(self.library)
        before = store.read_bytes()
        self.request_json("POST", "/api/decorations", doc)
        self.assertEqual(store.read_bytes(), before,
                         "posting the same day twice is a no-op on disk")

        # a second day joins the first rather than replacing it
        self.request_json("POST", "/api/decorations",
                          _decor_doc(day="08/05/2026", items=[]))
        _, data = self.request_json("GET", "/api/decorations")
        self.assertEqual(sorted(data["days"]),
                         ["08/04/2026", "08/05/2026"],
                         "a post replaces ONE day, never the whole map")

    def test_decorations_route_refuses_and_persists_nothing(self):
        self.request_json("POST", "/api/decorations", _decor_doc())
        store = study_lib.decorations_file_path(self.library)
        before = store.read_bytes()
        for bad in (_decor_doc(version=2),
                    _decor_doc(sprinkles=1),
                    _decor_doc(items=[_decor_item(x=True)]),
                    _decor_doc(items=[_decor_item(kind="gif")]),
                    _decor_doc(items=[_decor_item(kind="sticker",
                                                  sprite="../x")]),
                    _decor_doc(items=[_decor_item()
                                      for _ in
                                      range(server.DECOR_CAP + 1)])):
            status, data = self.request_json("POST", "/api/decorations",
                                             bad)
            self.assertEqual(status, 400, f"should have been refused: "
                                          f"{bad.get('version')}")
            self.assertIn("error", data)
            self.assertNotIn("Traceback", json.dumps(data),
                             "no traceback ever crosses a route boundary")
        self.assertEqual(store.read_bytes(), before,
                         "a refused write persists NOTHING — the page "
                         "keeps its shipped auto-composition, which is a "
                         "complete page on its own (D-08)")

    def test_the_decoration_route_never_touches_items_json(self):
        """LAW 2, as an absence. The decoration store writes no item state;
        items.json must be byte-identical across a decorate-save-reload
        cycle (EDGE LAW-2/concurrency)."""
        self.do_import()
        items_path = study_lib._store_path(self.library)
        before = Path(items_path).read_bytes()
        self.request_json("POST", "/api/decorations", _decor_doc())
        self.request_json("GET", "/api/decorations")
        self.request_json("POST", "/api/decorations",
                          _decor_doc(items=[]))
        self.assertEqual(
            Path(items_path).read_bytes(), before,
            "items.json is byte-identical across a full decorate cycle — "
            "no decoration path promotes, blesses or judges anything")

    def test_the_decoration_route_does_not_disturb_the_librarian(self):
        # the sibling relationship, from the other side: writing
        # decorations must not create, touch or need librarian/.
        self.request_json("POST", "/api/decorations", _decor_doc())
        self.assertFalse((self.library / "librarian").exists(),
                         "a decoration write neither needs nor creates "
                         "the librarian's folder (D-23)")
        self.assertTrue(
            study_lib.decorations_file_path(self.library).exists(),
            "and the store landed at the library root")


# ---------------------------------------------------------------------------
# 26.93-07 — THE REWRITTEN SEAM CLAIMS, AS A CHECKER, AND THE DRILL OVER IT
# ---------------------------------------------------------------------------
#
# ⚠⚠ A GATE NEVER SEEN RED IS NOT EVIDENCE, AND EVERY PIN BELOW IS NEW CODE.
# The leak proof used to read a recorded subprocess argv; it now reads a
# recorded request body. That is a fresh instrument, and roughly thirty defects
# of this project's class have landed INSIDE the measuring instrument rather
# than in the code under test — a checker in a shell variable that never ran
# while three of four cases printed "RED, as required"; a mutation harness that
# aborted at its first catch and reported one failure where there were four.
#
# So the claims live in a FUNCTION that can be driven over in-memory copies
# with one thing wrong each, the unmutated controls are counted in the SAME
# run, the loop never exits early on a catch, and all three totals are asserted
# BY VALUE against the literals below.

EXPECTED_MUTATIONS = 6
EXPECTED_CONTROLS = 2


def seam_record_violations(rec, payload_text, store_path, fenced_ids,
                           expected_model):
    """Every claim the move carried from the recorded argv to the recorded
    request, as a list of failures. Empty means all of them held."""
    bad = []
    stdin = str(rec.get("stdin") or "")
    whole = json.dumps(rec.get("body") or {}, ensure_ascii=False) \
        + str(rec.get("url") or "")

    # THE POSITIVE CONTROL, FIRST. Without it every absence assertion below
    # passes just as well on an empty string.
    if "SAFE-BODY" not in stdin:
        bad.append("the builder's safe content never reached the request — "
                   "the absence claims below would be checking nothing")

    if FENCE_MARK in stdin or FENCE_MARK in whole:
        bad.append("a fenced sentinel reached the model")
    if "FENCE-TITLE" in stdin or "FENCE-TITLE" in whole:
        bad.append("a fenced title reached the model")
    for item_id in (fenced_ids or ()):
        if item_id and (item_id in stdin or item_id in whole):
            bad.append("a fenced id reached the model")
    if store_path and store_path in whole:
        bad.append("the store path rode the request")

    # The W3 wiring claim, translated: the payload rides the user message with
    # no wrapper sentence, no prefix and no suffix.
    if stdin != payload_text:
        bad.append("the payload did not reach the model verbatim — a wrapper "
                   "sentence anywhere breaks the one guarantee the fence "
                   "makes about what is sent")

    # The replacement for the recorded-argv model pin, read BY VALUE. ⚠ #24's
    # caveat, and it belongs in the instrument rather than in a summary: this
    # proves what the app SENDS, not what the provider does with it afterward.
    if (rec.get("body") or {}).get("model") != expected_model:
        bad.append("the recorded body names a model other than the routing "
                   "fill's — asserted by value, never by presence")

    if rec.get("had_auth"):
        bad.append("a credential was attached to a call to her own machine, "
                   "which needs none")
    return bad


def drill_measure():
    """One REAL call through the shipped seam, recorded. Hermetic and free."""
    tmp = tempfile.mkdtemp(prefix="study-room-smoke-drill-")
    log = Path(tmp) / "drill-log.json"
    payload_text = json.dumps({"note": "SAFE-BODY", "rows": []},
                              ensure_ascii=False)
    try:
        with fake_claude_env(log):
            L.call_librarian("import_presort", payload_text,
                             server.resolve_librarian_routing())
        rec = json.loads(log.read_text(encoding="utf-8"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return rec, payload_text


def run_drill():
    rec, payload_text = drill_measure()
    model = L.LOCAL_FILL[1]
    fenced = ["fenced-id-0001"]
    store_path = "/tmp/study-room-drill-library"

    controls = 0
    # Control 1 — the REAL recorded request, judged clean.
    if seam_record_violations(rec, payload_text, store_path, fenced,
                              model) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the real recorded request")
    # Control 2 — an independently fabricated clean copy. Two controls that
    # were the same call twice would only prove the call is deterministic.
    clean = {"stdin": "SAFE-BODY here", "url": "http://127.0.0.1:11434/api/chat",
             "body": {"model": model,
                      "messages": [{"role": "user",
                                    "content": "SAFE-BODY here"}]},
             "had_auth": False}
    if seam_record_violations(clean, "SAFE-BODY here", store_path, fenced,
                              model) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the fabricated clean copy")

    # THE SIX ARE THE SIX WAYS THIS PARTICULAR MOVE REALISTICALLY GOES WRONG,
    # not six arbitrary edits.
    def with_stdin(text):
        copy = json.loads(json.dumps(rec))
        copy["stdin"] = text
        copy["body"]["messages"] = [{"role": "user", "content": text}]
        return copy

    leaked_sentinel = with_stdin(payload_text + " " + FENCE_MARK)
    leaked_id = with_stdin(payload_text + " " + fenced[0])
    wrapped = with_stdin("Please sort the following. " + payload_text)
    wrong_model = json.loads(json.dumps(rec))
    wrong_model["body"]["model"] = "claude-opus-5"
    leaked_path = json.loads(json.dumps(rec))
    leaked_path["url"] = "http://127.0.0.1:11434/api/chat?lib=" + store_path
    credentialled = json.loads(json.dumps(rec))
    credentialled["had_auth"] = True

    mutations = [
        ("a fenced sentinel rides the request", leaked_sentinel, payload_text),
        ("a fenced id rides the request", leaked_id, payload_text),
        ("a wrapper sentence is prepended to the payload", wrapped,
         payload_text),
        ("the body names a model the routing never chose", wrong_model,
         payload_text),
        ("the store path rides the request", leaked_path, payload_text),
        ("a credential is attached to a local call", credentialled,
         payload_text),
    ]

    caught = 0
    for name, mutated, sent in mutations:
        if seam_record_violations(mutated, sent, store_path, fenced, model):
            caught += 1
        else:
            # ⚠ NEVER EXIT EARLY ON A CATCH. A harness that stopped at its
            # first miss once reported one failure where there were four.
            print("  DRILL MISS: " + name + " was not caught")
    return caught, len(mutations), controls


def main():
    suite = unittest.defaultTestLoader.loadTestsFromModule(
        sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=1).run(suite)

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


class ReadabilityRouteTest(CleaningRouteTest):
    """26.95-05 (#86 / #89 / #90): the readability pass, driven through the
    REAL routes.

    Inherits CleaningRouteTest's hermetic harness — a throwaway library, a
    throwaway vault of real .md files on disk, and a real server on a
    loopback port. The unit-level invariants live in
    tests/test_cleaning_writer.py; this suite proves the ROUTES honour them,
    because a writer that is safe behind a route that hands it unapproved
    bytes is still a P0.

    ⚠ THE CLIENT COMPUTES THE LAYOUT AND THE SERVER DOES NOT TRUST IT. The
    real transform lives in core.js (one home, reached by name), so these
    tests send bodies the way the browser would — including bodies a
    misbehaving or compromised client might send — and assert what reaches
    disk.
    """

    WALL = ("She kept returning to the same small table by the window. "
            "The paragraph kept running on without a break. "
            "One thought crowded the next until nothing could be skimmed. ")

    def build_walls(self, n=3, enabled=True):
        """`n` notes whose bodies are one long unbroken paragraph."""
        (self.library / "items").mkdir(exist_ok=True)
        store = study_lib.new_store(self.library)
        store["meta"]["librarian_enabled"] = True
        if enabled is not None:
            store["meta"]["cleaning_enabled"] = enabled
        pairs = []
        for i in range(n):
            item_id = format(0xd000 + i, "016x")
            note = self.vault / f"wall-{i}.md"
            body = "\n" + (self.WALL * 6) + "\n"
            note.write_bytes(b"---\ntitle: a wall\n---\n" +
                             body.encode("utf-8"))
            stamp = time.time() - 40 * 86400
            os.utime(note, (stamp, stamp))
            store["items"][item_id] = {
                "id": item_id, "content_hash": item_id * 4,
                "source": "folder-drop", "origin_path": str(note),
                "library_path": f"items/{item_id}.md",
                "type": "text", "title": f"wall {i}",
                "folder": "journal",
                "state": "blessed", "created_ms": 0, "saved_ms": 0,
                "tags": [], "history": [],
            }
            pairs.append((item_id, note))
        study_lib.save_store(self.library, store)
        return pairs

    # -- the read side -------------------------------------------------------

    def test_targets_speaks_in_places_and_returns_real_bytes(self):
        pairs = self.build_walls(3)
        status, data = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        self.assertEqual(status, 200)
        self.assertTrue(data["available"])
        self.assertEqual(data["total"], 3)
        self.assertEqual(len(data["targets"]), 3)
        # the bytes are the FILE's, not a snapshot's — the pass rewrites the
        # file, so a drifted snapshot would preview a note that is not there
        by_id = {t["id"]: t for t in data["targets"]}
        for item_id, note in pairs:
            self.assertIn(self.WALL.strip(), by_id[item_id]["body"])
            self.assertNotIn("---", by_id[item_id]["body"],
                             "the frontmatter block is sliced off — this "
                             "pass never touches it")
        # and it offers PLACES
        self.assertEqual([s["folder"] for s in data["scopes"]], ["journal"])
        self.assertEqual(data["scopes"][0]["notes"], 3)

    def test_a_scope_narrows_and_an_unknown_scope_is_empty(self):
        self.build_walls(2)
        _s, data = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": "journal"})
        self.assertEqual(data["total"], 2)
        _s, data = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": "nowhere"})
        self.assertEqual(data["total"], 0)
        self.assertEqual(data["targets"], [])

    def test_targets_is_off_when_the_switch_is_off(self):
        self.build_walls(2, enabled=False)
        status, data = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        self.assertEqual(status, 200)
        self.assertFalse(data["available"],
                         "off is an ANSWER, not an error (D-06)")
        self.assertNotIn("targets", data)

    def test_targets_refuses_a_scope_that_is_not_a_place(self):
        self.build_walls(1)
        for bad in ([], {}, 3, True):
            status, _d = self.request_json(
                "POST", "/api/librarian/clean/targets", {"scope": bad})
            self.assertEqual(status, 400,
                             "a scope is a folder name or nothing at all")

    # -- the write side ------------------------------------------------------

    def _laid_out(self, body):
        """The body with its sentences on separate lines — the shape
        core.js produces, spelled here as pure whitespace so this suite
        does not need a JS runtime to state its own fixture."""
        return body.replace(". ", ".\n\n")

    def test_a_whitespace_only_write_lands_and_undo_puts_it_back(self):
        pairs = self.build_walls(2)
        before = {str(n): n.read_bytes() for _i, n in pairs}
        mtimes = {str(n): n.stat().st_mtime for _i, n in pairs}
        _s, targets = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        writes = [{"id": t["id"], "body": self._laid_out(t["body"])}
                  for t in targets["targets"]]
        status, data = self.request_json(
            "POST", "/api/librarian/clean/write", {"writes": writes})
        self.assertEqual(status, 200)
        self.assertEqual(data["written"], 2)
        self.assertEqual(data["refused"], 0)
        self.assertIsNotNone(data["batch"])

        for _i, note in pairs:
            now_bytes = note.read_bytes()
            self.assertNotEqual(now_bytes, before[str(note)])
            self.assertEqual(now_bytes.split(), before[str(note)].split(),
                             "every non-whitespace byte survived, in order")
            self.assertAlmostEqual(note.stat().st_mtime, mtimes[str(note)],
                                   places=3,
                                   msg="a tidied note must not look freshly "
                                       "written (D-10)")

        # ⚠ ONE BATCH FOR THE WHOLE RUN — one tap puts all of it back.
        status, undone = self.request_json(
            "POST", "/api/librarian/clean/undo", {"batch": data["batch"]})
        self.assertEqual(status, 200)
        self.assertEqual(undone["restored"], 2)
        for _i, note in pairs:
            self.assertEqual(note.read_bytes(), before[str(note)],
                             "one tap back, byte for byte")

    def test_the_route_refuses_a_body_that_is_not_whitespace_only(self):
        # ⚠ THE GATE, THROUGH THE ROUTE. The server cannot compute the
        # layout itself, so this is the assertion that makes accepting a
        # client-computed body safe at all.
        pairs = self.build_walls(1)
        note = pairs[0][1]
        before = note.read_bytes()
        _s, targets = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        t = targets["targets"][0]
        for label, body in (
            ("a summary appended", t["body"] + "\nIn short: she was tired.\n"),
            ("a heading added", "## The window\n" + t["body"]),
            ("a word deleted", t["body"].replace("window", "", 1)),
            ("someone else's text", "Something else entirely."),
            ("an empty body", ""),
        ):
            status, data = self.request_json(
                "POST", "/api/librarian/clean/write",
                {"writes": [{"id": t["id"], "body": body}]})
            self.assertEqual(status, 200)
            self.assertEqual(data["written"], 0, label + " wrote nothing")
            self.assertEqual(data["refused"], 1,
                             label + " is REFUSED, and counted out loud")
            self.assertEqual(note.read_bytes(), before,
                             label + " left the file untouched")

    def test_an_unknown_or_fenced_id_writes_nothing_and_is_counted(self):
        pairs = self.build_walls(2)
        _s, targets = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        t = targets["targets"][0]
        # fence the OTHER note, then try to write both
        store = study_lib.load_store(self.library)
        other = [i for i, _n in pairs if i != t["id"]][0]
        store["items"][other]["state"] = "never_show"
        study_lib.save_store(self.library, store)
        fenced_note = dict(pairs)[other]
        fenced_before = fenced_note.read_bytes()

        _s2, targets2 = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        self.assertEqual(targets2["total"], 1,
                         "a fenced note is absent from the targets entirely "
                         "— not even its title (law 5)")

        status, data = self.request_json(
            "POST", "/api/librarian/clean/write", {"writes": [
                {"id": t["id"], "body": self._laid_out(t["body"])},
                {"id": other, "body": "anything at all"},
                {"id": "f" * 16, "body": "a hallucinated id"},
            ]})
        self.assertEqual(status, 200)
        self.assertEqual(data["written"], 1)
        self.assertEqual(data["refused"], 2,
                         "the fenced note and the unknown id are BOTH "
                         "refused, and both counted")
        self.assertEqual(fenced_note.read_bytes(), fenced_before,
                         "the fence held at the write, not only at the read")

    def test_write_is_off_when_the_switch_is_off(self):
        pairs = self.build_walls(1, enabled=True)
        _s, targets = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        t = targets["targets"][0]
        before = pairs[0][1].read_bytes()
        store = study_lib.load_store(self.library)
        store["meta"]["cleaning_enabled"] = False
        study_lib.save_store(self.library, store)
        status, _d = self.request_json(
            "POST", "/api/librarian/clean/write",
            {"writes": [{"id": t["id"], "body": self._laid_out(t["body"])}]})
        self.assertEqual(status, 400)
        self.assertEqual(pairs[0][1].read_bytes(), before)

    def test_a_malformed_writes_payload_is_refused_whole(self):
        self.build_walls(1)
        for bad in (None, "everything", [{"id": 1, "body": "x"}],
                    [{"id": "a", "body": 2}], ["not a dict"], [{}]):
            status, _d = self.request_json(
                "POST", "/api/librarian/clean/write", {"writes": bad})
            self.assertEqual(status, 400,
                             "a malformed batch writes nothing at all, "
                             "rather than the half of it that parsed")

    # -- #58 ruling 4: the store keeps up with the files -------------------

    def _snapshot_the_walls(self, pairs):
        """Give each fixture item the snapshot a real import would have
        taken, so the store starts out AGREEING with the files. Without it
        there is no 'before' for a refresh to be measured against."""
        store = study_lib.load_store(self.library)
        for item_id, note in pairs:
            shutil.copy2(note, self.library / f"items/{item_id}.md")
            store["items"][item_id]["content_hash"] = study_lib.hash_item(
                note, "text")[1]
        study_lib.save_store(self.library, store)
        return store

    def test_a_tidy_up_leaves_the_store_in_step_without_a_re_import(self):
        # ⚠ THE HALF THAT DID NOT EXIST. The write route wrote the person's
        # file and the change-log and touched neither items.json nor the
        # snapshot, so `content_hash` was stale the instant a run finished.
        pairs = self.build_walls(2)
        self._snapshot_the_walls(pairs)
        _s, targets = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        writes = [{"id": t["id"], "body": self._laid_out(t["body"])}
                  for t in targets["targets"]]
        _s, data = self.request_json(
            "POST", "/api/librarian/clean/write", {"writes": writes})
        self.assertEqual(data["written"], 2)

        store = study_lib.load_store(self.library)
        for item_id, note in pairs:
            self.assertEqual(store["items"][item_id]["content_hash"],
                             study_lib.hash_item(note, "text")[1],
                             "the store describes the file that is there")
            self.assertEqual(
                (self.library / f"items/{item_id}.md").read_bytes(),
                note.read_bytes(),
                "and the snapshot was re-taken in place, same name")
            self.assertEqual(store["items"][item_id]["state"], "blessed",
                             "a tidy-up you asked for does not cost you a "
                             "blessing")

    def test_the_undo_puts_the_store_back_too(self):
        pairs = self.build_walls(1)
        self._snapshot_the_walls(pairs)
        item_id, note = pairs[0]
        was = study_lib.hash_item(note, "text")[1]
        _s, targets = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        t = targets["targets"][0]
        _s, data = self.request_json(
            "POST", "/api/librarian/clean/write",
            {"writes": [{"id": t["id"], "body": self._laid_out(t["body"])}]})
        _s, undone = self.request_json(
            "POST", "/api/librarian/clean/undo", {"batch": data["batch"]})
        self.assertEqual(undone["restored"], 1)
        store = study_lib.load_store(self.library)
        self.assertEqual(store["items"][item_id]["content_hash"], was,
                         "taking a change back changes the file, so it "
                         "changes the store")

    def test_a_tidy_up_never_expires_a_shelf_verdict(self):
        # #94 ruling 7, through the real route: the tidy-up moves whitespace
        # and nothing else, so the sort's answers about these notes are still
        # answers about these notes. ⚠ The alternative costs ten local-tier
        # hours re-reading notes whose words are byte-identical.
        pairs = self.build_walls(1)
        self._snapshot_the_walls(pairs)
        item_id, _note = pairs[0]
        sugg = self.library / "librarian" / "suggestions.json"
        study_lib.merge_suggestions(sugg, {item_id: {"shelf": "joyful",
                                                     "why": "warm"}})
        _s, targets = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        t = targets["targets"][0]
        _s, data = self.request_json(
            "POST", "/api/librarian/clean/write",
            {"writes": [{"id": t["id"], "body": self._laid_out(t["body"])}]})
        self.assertEqual(data["written"], 1)
        self.assertEqual(
            study_lib.load_suggestions(sugg)["verdicts"][item_id]["shelf"],
            "joyful", "whitespace is not a change of words")


class CleaningRunsListTest(ReadabilityRouteTest):
    """26.95-22 — one tap back outlives the page it happened on.

    ⚠ THE UNDO USED TO EXPIRE WITH THE TAB. The batch id was client state, so
    a reload lost it and nothing else offered a way in — while the room kept a
    verbatim copy of every note it had changed (16.8 MB of the owner's own
    writing on her real library, 99% of that file) for a button that had
    already gone. She chose reachable over releasing the copies."""

    def _one_run(self):
        pairs = self.build_walls(2)
        store = study_lib.load_store(self.library)
        for item_id, note in pairs:
            shutil.copy2(note, self.library / f"items/{item_id}.md")
            store["items"][item_id]["content_hash"] = study_lib.hash_item(
                note, "text")[1]
        study_lib.save_store(self.library, store)
        _s, targets = self.request_json(
            "POST", "/api/librarian/clean/targets", {"scope": None})
        writes = [{"id": t["id"], "body": self._laid_out(t["body"])}
                  for t in targets["targets"]]
        _s, data = self.request_json(
            "POST", "/api/librarian/clean/write", {"writes": writes})
        self.assertEqual(data["written"], 2)
        return data["batch"], pairs

    def test_a_finished_run_is_listed_and_can_be_taken_back_later(self):
        batch, pairs = self._one_run()
        _s, listed = self.request_json("POST", "/api/librarian/clean/runs", {})
        self.assertEqual(len(listed["runs"]), 1)
        run = listed["runs"][0]
        self.assertEqual(run["batch"], batch)
        self.assertEqual(run["notes"], 2)
        self.assertIs(run["undone"], False)

        # taken back from the LIST, by id — the page that ran it is gone
        _s, undone = self.request_json(
            "POST", "/api/librarian/clean/undo", {"batch": run["batch"]})
        self.assertEqual(undone["restored"], 2)
        _s, after = self.request_json("POST", "/api/librarian/clean/runs", {})
        self.assertIs(after["runs"][0]["undone"], True,
                      "and the list says so, so it is not offered twice")

    def test_a_run_releases_the_copies_from_older_runs(self):
        # ⚠ AT THE END OF A RUN, NOT ON A CLOCK. A timer would take her way
        # back away while she was absent, and law 3 forbids the room getting
        # worse for an absence. Runs only advance when she runs one.
        log = self.library / "librarian" / "cleaning-log.json"
        for _ in range(study_lib.CLEANING_RUNS_KEPT + 1):
            self._one_run()
        data = json.loads(log.read_text(encoding="utf-8"))
        kept = [len(b["files"]) for b in data["batches"]]
        self.assertEqual(len(kept), study_lib.CLEANING_RUNS_KEPT + 1)
        self.assertEqual(kept[0], 0, "the oldest run's copies were released")
        self.assertTrue(all(n > 0 for n in kept[1:]),
                        "and the recent ones still have theirs")
        _s, listed = self.request_json("POST", "/api/librarian/clean/runs", {})
        self.assertTrue(all(r["notes"] > 0 for r in listed["runs"][:3]))

    def test_the_run_says_what_it_released(self):
        _s, first = self.request_json(
            "POST", "/api/librarian/clean/write", {"writes": []})
        self.assertEqual(first["released"], {"runs": 0, "notes": 0,
                                             "bytes": 0},
                         "a run that releases nothing says so plainly")

    def test_the_list_names_no_note(self):
        # ⚠ COUNTS ONLY. A list of what the room changed is a list of HER
        # notes, and this surface has no fence in front of it. A count needs
        # none and can leak nothing.
        _batch, pairs = self._one_run()
        _s, listed = self.request_json("POST", "/api/librarian/clean/runs", {})
        blob = json.dumps(listed)
        for item_id, note in pairs:
            self.assertNotIn(note.name, blob)
            self.assertNotIn(str(note), blob)
            self.assertNotIn(item_id, blob)
        self.assertEqual(sorted(listed["runs"][0]),
                         ["at", "batch", "notes", "undone"])

    def test_the_list_survives_the_tidy_up_being_turned_off(self):
        # a reversibility promise with an off-switch is not a promise
        batch, _pairs = self._one_run()
        self.request_json("POST", "/api/meta", {"cleaning_enabled": False})
        _s, listed = self.request_json("POST", "/api/librarian/clean/runs", {})
        self.assertEqual(listed["runs"][0]["batch"], batch)
        _s, undone = self.request_json(
            "POST", "/api/librarian/clean/undo", {"batch": batch})
        self.assertEqual(undone["restored"], 2)

    def test_no_runs_is_an_empty_list_never_an_error(self):
        _s, listed = self.request_json("POST", "/api/librarian/clean/runs", {})
        self.assertIs(listed["ok"], True)
        self.assertEqual(listed["runs"], [])

    def test_a_bad_limit_is_refused_in_plain_words(self):
        for bad in (0, -1, 51, True, "5", 1.5):
            status, data = self.request_json(
                "POST", "/api/librarian/clean/runs", {"limit": bad})
            self.assertEqual(status, 400, repr(bad))
            self.assertIn("whole number", data["error"])


class SupersededDerivedWorkTest(ServerSmokeTest):
    """#58 ruling 2, the half that lives OUTSIDE items.json.

    ⚠ THE REFRESH IS WHAT CREATED THIS. While an edited file became a NEW
    item, every derived handle keyed by item id was right by accident — the
    new id had no shelf verdict and no Vision reading, so nothing stale could
    be read back. A refreshed item keeps its id, which is the whole point (her
    blessing survives) and is also what leaves the room's own guesses pointing
    at a version that no longer exists.

    ⚠ THE READING IS THE DANGEROUS ONE. A reading's only currency marker is
    `program_fp`, the fingerprint of the reader PROGRAM, so nothing anywhere
    can notice that the picture changed: `run_vision_pass` skips it as
    already-read and `note_pass_gate` calls it current. The words read off a
    photograph can become a note she reads as her own — "PRESENCE IS NOT
    CURRENCY" in the one channel that predicate cannot see."""

    def a_reading(self, item_id):
        """A real cache entry, written by the shipped writer."""
        row = {"path": "/x/" + item_id + ".png",
               "text": "the words off her picture",
               "themes": ["a"], "faces": 0, "lang": "auto", "dim": 768,
               "type": 1,
               "fp": base64.b64encode(b"\x01" * 3072).decode("ascii")}
        study_lib.vision_write_entry(str(self.library), item_id, row, "fp0")
        self.assertIsNotNone(
            study_lib.vision_read_entry(str(self.library), item_id))
        return row

    def ids_by_title(self):
        store = study_lib.load_store(self.library)
        return {i["title"]: i["id"] for i in store["items"].values()}

    def test_a_changed_picture_loses_the_reading_off_the_old_one(self):
        self.do_import()
        pic_id = self.ids_by_title()["tiny.png"]
        self.a_reading(pic_id)

        # the same picture, different bytes — a crop, a rotate, a re-export
        (self.source / "tiny.png").write_bytes(PNG_1x1 + b"\x00trailing")
        report = self.do_import()

        self.assertEqual(report["refreshed"], 1,
                         "the picture is the SAME item, refreshed")
        self.assertIn(pic_id, study_lib.load_store(self.library)["items"],
                      "and it kept its id — that is what carries her "
                      "judgement over")
        self.assertIsNone(
            study_lib.vision_read_entry(str(self.library), pic_id),
            "the reading was taken off a picture that no longer exists, so "
            "it must not survive it — nothing downstream can tell")
        self.assertFalse(
            study_lib.vision_print_path(str(self.library), pic_id).is_file(),
            "the print goes with the words it belongs to")

    def test_an_unchanged_picture_keeps_its_reading(self):
        # ⚠ THE COST OF GETTING THIS WRONG IS HOURS. Her library holds 13,453
        # readings; an import that dropped them for pictures that did not
        # change would re-read her whole photo library every time.
        self.do_import()
        pic_id = self.ids_by_title()["tiny.png"]
        self.a_reading(pic_id)
        report = self.do_import()
        self.assertEqual(report["refreshed"], 0)
        self.assertIsNotNone(
            study_lib.vision_read_entry(str(self.library), pic_id),
            "nothing moved, so nothing the room worked out is stale")

    def test_a_changed_note_expires_the_shelf_verdict_and_nothing_else(self):
        self.do_import()
        ids = self.ids_by_title()
        note_id, pic_id = ids["note-one.md"], ids["tiny.png"]
        self.a_reading(pic_id)
        sugg = server._suggestions_path(self.library)
        study_lib.merge_suggestions(sugg, {
            note_id: {"shelf": "joyful", "why": "warm"},
            "untouched": {"shelf": "heavy", "why": "still hers to see"}})

        (self.source / "note-one.md").write_bytes(
            b"# Note one\nhello from the corpus, and a sentence she added\n")
        self.do_import()

        verdicts = study_lib.load_suggestions(sugg)["verdicts"]
        self.assertNotIn(note_id, verdicts,
                         "a shelf verdict is a guess about a note's WORDS")
        self.assertIn("untouched", verdicts,
                      "and only the ids that moved are touched")
        self.assertIsNotNone(
            study_lib.vision_read_entry(str(self.library), pic_id),
            "a note changing says nothing about a photograph")

    def test_a_whitespace_only_edit_supersedes_nothing(self):
        # #94 ruling 7 through the import rather than the tidy-up's own route:
        # the SAME predicate decides both, called and never re-spelled.
        self.do_import()
        note_id = self.ids_by_title()["note-one.md"]
        sugg = server._suggestions_path(self.library)
        study_lib.merge_suggestions(sugg, {note_id: {"shelf": "joyful",
                                                     "why": "warm"}})
        (self.source / "note-one.md").write_bytes(
            b"# Note one\nhello from\nthe corpus\n")
        report = self.do_import()
        self.assertEqual(report["refreshed"], 1,
                         "the file DID change, so the store keeps up with it")
        self.assertEqual(
            study_lib.load_suggestions(sugg)["verdicts"][note_id]["shelf"],
            "joyful",
            "but her sort's answer is about words that did not move — the "
            "alternative is ten hours of re-sorting after every tidy-up")

    def test_an_acked_answer_is_never_expired(self):
        # #94 ruling 5 reaching the import: the room's guess is the room's to
        # drop, and what SHE answered stays answered.
        self.do_import()
        note_id = self.ids_by_title()["note-one.md"]
        sugg = server._suggestions_path(self.library)
        study_lib.merge_suggestions(sugg, {note_id: {"shelf": "joyful",
                                                     "why": "warm"}})
        data = study_lib.load_suggestions(sugg)
        data["verdicts"][note_id]["acked"] = True
        study_lib.atomic_write_bytes(
            str(sugg), json.dumps(data, ensure_ascii=False,
                                  indent=1).encode("utf-8"))

        (self.source / "note-one.md").write_bytes(b"# Note one\nall new\n")
        self.do_import()
        self.assertIn(note_id,
                      study_lib.load_suggestions(sugg)["verdicts"],
                      "hers, not the room's")


if __name__ == "__main__":
    sys.exit(main())
