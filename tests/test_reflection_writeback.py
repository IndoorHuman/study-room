#!/usr/bin/env python3
"""
tests/test_reflection_writeback.py — the byte-discipline proof for the
SECOND disclosed vault writer (Phase 26.7, Plan 04 — D-06, RSF-06).

write_reflection_to_vault is the second byte path into the user's live,
iCloud-synced Obsidian vault (append_comment's new-file-only twin), so it
is machine-tested exactly like the comment sync-back: a single mutated
pre-existing byte is a P0. This is that suite — the test_comment_syncback
proof shape transferred: section-created-once becomes file-created-once;
byte-untouched-above becomes zero-deltas-to-every-existing-file; the
jail / iCloud / gate cases carry over whole.

Stdlib only (unittest + tempfile + threading + http.client) — the
zero-dependency law. Every fixture is built in a fresh
TemporaryDirectory; the close-route cases run a real ThreadingHTTPServer
on an ephemeral port with a temp library AND a temp vault.

Coverage (26.7-04 Task 2):

  the writer (study_lib.write_reflection_to_vault)
    1. JAIL — a title carrying a separator, a `..` traversal, or an
       absolute path resolves outside the fixed folder and is refused
       (None) with ZERO files created anywhere; empty/None title and
       text likewise.
    2. EXISTING VAULT ONLY — a missing vault root or a vault without
       Claude's observation/Journal analysis/ is a quiet refusal (the
       offline-vault posture: this writer creates files, never folders).
    3. iCLOUD — an un-downloaded placeholder for the target name is
       refused (never triggers a download).
    4. NEW-FILE-ONLY — an existing target name uniquifies with a counter
       suffix; the pre-existing file stays byte-identical (it is never
       opened, read, or written).
    5. CONVENTION — the written file carries the journal-reflection
       ritual's frontmatter (title, description, type: note, domain:
       life, topic, status: processed, format: essay, source: personal,
       tags, date, date_clipped, reflects: with QUOTED vault-relative
       paths) and the essay text verbatim; the filename is
       `<title> <YYYY-MM-DD>.md`.

  the gate (server.validate_reflection_writeback + the close route)
    6. validator — bool exactly; absent means OFF; every non-bool is
       refused fail-closed (pure + the /api/meta roundtrip).
    7. toggle OFF (absent, false, or truthy-non-True) — a save changes
       ZERO vault bytes: the whole vault tree hashes identical.
    8. toggle ON — a save writes exactly ONE new .md under Claude's
       observation/Journal analysis/, every pre-existing file
       byte-identical; reflects: names the session pool's vault-relative
       origin paths; the filename follows the convention; a pre-seeded
       identical name uniquifies.
    9. failure never loses the book — a refused write-back (no target
       folder) still answers 200 {saved: true} with the book shelved and
       writeback_failures counted fail-visible.
   10. FENCE — a sentinel-seeded store (FENCE-SENTINEL bodies /
       FENCE-TITLE titles) driven through a real toggle-ON save leaves a
       write-back file whose RAW BYTES carry no sentinel — the fourth
       AI-SPEC dim-1 scan surface, explicit beside the pool payload, the
       refine stdin, and the session file; a positive control proves the
       scan is never vacuous.
"""
import hashlib
import json
import http.client
import sys
import tempfile
import threading
import unittest
from datetime import datetime
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import server  # noqa: E402  — plain import binds no socket
import study_lib  # noqa: E402

VAULT_DIR = Path("Claude's observation") / "Journal analysis"

GOOD_DRAFT = (
    "## the small return\n\n"
    "you kept coming back to the border rows this week, and the notes "
    "read like a hand that already knows the way — short, sure, "
    "practical.\n\n"
    "Use: work one quiet row tonight and let that be enough."
)

# 26.995-12 (D-13): THE WEAVING. 26.995-07 deleted the prompt instruction to
# name what she added in a separate field; the librarian now writes her
# addition INTO the essay. This fixture is that shape — her sentence inside
# the prose, no heading over it, nothing appended under it.
WOVEN_DRAFT = GOOD_DRAFT.replace(
    "short, sure, practical.",
    "short, sure, practical. you asked for the border to stay.")

WHEN_MS = 1753500000000


def day_of(when_ms):
    return datetime.fromtimestamp(when_ms / 1000).strftime("%Y-%m-%d")


def tree_hash(root):
    """relpath -> sha256 for every file under root — the zero-deltas
    assertion's whole-tree fingerprint."""
    out = {}
    root = Path(root)
    for p in sorted(root.rglob("*")):
        if p.is_file():
            out[str(p.relative_to(root))] = hashlib.sha256(
                p.read_bytes()).hexdigest()
    return out


def make_vault(tmp):
    """A small vault tree with the ritual's folder present and a few
    pre-existing files whose bytes must survive every case."""
    vault = Path(tmp) / "vault"
    (vault / "Memoir").mkdir(parents=True)
    (vault / "Clippings").mkdir()
    (vault / VAULT_DIR).mkdir(parents=True)
    (vault / "Memoir" / "entry one.md").write_bytes(
        b"# entry one\n\na kept morning page.\n")
    (vault / "Clippings" / "knit.md").write_bytes(
        b"# knit\n\na border chart.\n")
    (vault / VAULT_DIR / "old note.md").write_bytes(
        b"---\ntitle: old\nreflects:\n  - \"Memoir/old.md\"\n---\n\nold.\n")
    return vault


class WriterJailTest(unittest.TestCase):
    """The pure writer — jail, folder, iCloud, uniquify, convention."""

    def test_bad_titles_and_text_refused_zero_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = make_vault(tmp)
            before = tree_hash(vault)
            for title in ("../escape", "/tmp/escape", "a/b", "", None,
                          "   "):
                self.assertIsNone(
                    study_lib.write_reflection_to_vault(
                        str(vault), title, GOOD_DRAFT, [], WHEN_MS),
                    f"title {title!r} must be refused")
            self.assertIsNone(
                study_lib.write_reflection_to_vault(
                    str(vault), "fine title", "", [], WHEN_MS),
                "empty text must be refused")
            self.assertIsNone(
                study_lib.write_reflection_to_vault(
                    str(vault), "fine title", GOOD_DRAFT, [], "soon"),
                "a non-numeric stamp must be refused")
            self.assertEqual(tree_hash(vault), before,
                             "a refusal creates and changes NOTHING")

    # -- 26.995-05 (D-06, T-26.995-03): THE NAME IS NOW MODEL-CONTROLLED ---
    #
    # ⛔ WHAT CHANGED, and it is a trust boundary rather than a refactor.
    # Until this plan the title handed to this writer was DERIVED from the
    # essay's own first heading. It is now a field the MODEL fills, and it
    # travels: reuse gate -> ledger -> store item -> book -> THIS FILENAME.
    # Only the last of those six is a file path, and this is the case that
    # proves the jail holds against an input it has never been given.
    #
    # ⛔ THE JAIL IS NOT RE-IMPLEMENTED HERE. It already exists (resolved-
    # parent equality + .md-only, study_lib.write_reflection_to_vault). This
    # case DRIVES it. It was landed RED by asserting the WRONG thing first —
    # that the deep-escape name produces a file outside the folder — and
    # that inverted assertion failed, which is how the case is known to
    # exercise the jail rather than walk past it.
    #
    # ⚠ TWO OUTCOMES ARE BOTH CORRECT and the case accepts either: refused
    # (None, nothing written) OR written with its resolved parent EXACTLY
    # the write-back folder. What is never correct is a byte landing
    # anywhere else, and the whole tmp tree is hashed to prove it.

    def test_a_model_supplied_traversal_name_never_leaves_the_folder(self):
        # Names this writer has NOT been handed before — the existing
        # bad-title case covers "../escape", "/tmp/escape" and "a/b"; every
        # row below is new, and each is a shape a model could emit.
        hostile = (
            "../../../../../../tmp/pwned",   # deep escape, past the vault
            "..",                            # the parent step, bare
            ".",                             # the current dir, bare
            "../..",
            "a/../b",                        # normalizes back inside
            "..\\..\\pwned",                 # a POSIX-legal filename
            ".hidden",                       # a leading dot
            "~/escape",                      # ~ is NOT expanded by resolve()
            "sub/../../out",
            "../mixed",            # the same step, escaped
        )
        self.assertEqual(len(hostile), 10,
                         "ten hostile names, by value — a row that "
                         "disappears fails here")
        with tempfile.TemporaryDirectory() as tmp:
            vault = make_vault(tmp)
            # a decoy OUTSIDE the vault entirely: the deep-escape rows aim
            # past the vault root, so the whole tmp tree is the fingerprint.
            outside = Path(tmp) / "not-the-vault"
            outside.mkdir()
            (outside / "hers.md").write_bytes(b"# hers\n\nnot ours.\n")
            before = tree_hash(tmp)
            folder = (vault / VAULT_DIR).resolve()
            landed = []
            for name in hostile:
                rel = study_lib.write_reflection_to_vault(
                    str(vault), name, GOOD_DRAFT, [], WHEN_MS)
                if rel is None:
                    continue                 # refused: nothing written
                written = (vault / rel).resolve()
                self.assertEqual(
                    written.parent, folder,
                    "%r produced a file at %s — OUTSIDE the write-back "
                    "folder. This is the jail failing, and the name is "
                    "model-controlled." % (name, written))
                self.assertEqual(written.suffix.lower(), ".md")
                landed.append(rel)
            # nothing outside the folder moved, anywhere under tmp.
            after = tree_hash(tmp)
            strayed = [p for p in set(after) - set(before)
                       if (Path(tmp) / p).resolve().parent != folder]
            self.assertEqual(strayed, [],
                             "files appeared outside the write-back "
                             "folder: %r" % (strayed,))
            for p, h in before.items():
                self.assertEqual(after.get(p), h,
                                 "a pre-existing file changed: %s" % (p,))
            # ⛔ THE UNMUTATED CONTROL. Without it every assertion above
            # passes against a writer that refuses everything, including
            # the ordinary names this feature exists to write.
            rel = study_lib.write_reflection_to_vault(
                str(vault), "on returning to the same walk", GOOD_DRAFT,
                [], WHEN_MS)
            self.assertIsNotNone(rel, "the control name must WRITE")
            self.assertEqual((vault / rel).resolve().parent, folder)
            self.assertTrue((vault / rel).is_file())

    def test_the_resolved_name_is_what_reaches_the_writer(self):
        """The end-to-end shape of T-26.995-03: a hostile name goes through
        the server's ONE resolver (the same call the close route makes) and
        out to the writer. The resolver bounds and flattens; the jail
        refuses or contains. Neither alone is the mitigation."""
        with tempfile.TemporaryDirectory() as tmp:
            vault = make_vault(tmp)
            folder = (vault / VAULT_DIR).resolve()
            before = tree_hash(tmp)
            for supplied in ("../../../../etc/pwned",
                             "  ../../pwned  \n",
                             "/absolute/pwned"):
                resolved = server._reflection_name(supplied, GOOD_DRAFT)
                rel = study_lib.write_reflection_to_vault(
                    str(vault), resolved, GOOD_DRAFT, [], WHEN_MS)
                if rel is None:
                    continue
                self.assertEqual((vault / rel).resolve().parent, folder,
                                 "%r escaped via the resolver" % (supplied,))
            after = tree_hash(tmp)
            strayed = [p for p in set(after) - set(before)
                       if (Path(tmp) / p).resolve().parent != folder]
            self.assertEqual(strayed, [])

    def test_missing_vault_or_folder_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            bare = Path(tmp) / "bare-vault"
            bare.mkdir()
            self.assertIsNone(
                study_lib.write_reflection_to_vault(
                    str(bare), "a reflection", GOOD_DRAFT, [], WHEN_MS),
                "a vault without the ritual folder is a quiet refusal — "
                "this writer creates files, never folders")
            self.assertEqual(tree_hash(bare), {},
                             "nothing is created in a bare vault")
            self.assertIsNone(
                study_lib.write_reflection_to_vault(
                    str(Path(tmp) / "nowhere"), "a reflection",
                    GOOD_DRAFT, [], WHEN_MS),
                "a missing vault root (offline) is a quiet refusal")
            self.assertIsNone(
                study_lib.write_reflection_to_vault(
                    "", "a reflection", GOOD_DRAFT, [], WHEN_MS))

    def test_icloud_placeholder_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = make_vault(tmp)
            name = f"quiet return {day_of(WHEN_MS)}.md"
            (vault / VAULT_DIR / f".{name}.icloud").write_bytes(b"")
            before = tree_hash(vault)
            self.assertIsNone(
                study_lib.write_reflection_to_vault(
                    str(vault), "quiet return", GOOD_DRAFT, [], WHEN_MS),
                "an evicted-name placeholder is never raced or downloaded")
            self.assertEqual(tree_hash(vault), before)

    def test_existing_name_uniquifies_never_opens(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = make_vault(tmp)
            day = day_of(WHEN_MS)
            taken = vault / VAULT_DIR / f"quiet return {day}.md"
            original = b"# hers already\n\nnot ours to touch.\n"
            taken.write_bytes(original)
            rel = study_lib.write_reflection_to_vault(
                str(vault), "quiet return", GOOD_DRAFT, [], WHEN_MS)
            self.assertEqual(
                rel, str(VAULT_DIR / f"quiet return {day} 2.md"),
                "a taken name uniquifies with a counter suffix")
            self.assertEqual(taken.read_bytes(), original,
                             "the existing file is never opened or written")
            # a second collision steps the counter again
            rel2 = study_lib.write_reflection_to_vault(
                str(vault), "quiet return", GOOD_DRAFT, [], WHEN_MS)
            self.assertEqual(
                rel2, str(VAULT_DIR / f"quiet return {day} 3.md"))

    def test_frontmatter_convention_and_verbatim_body(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = make_vault(tmp)
            day = day_of(WHEN_MS)
            rel = study_lib.write_reflection_to_vault(
                str(vault), "the small return", GOOD_DRAFT,
                ["Memoir/entry one.md", "Clippings/knit.md"], WHEN_MS)
            self.assertEqual(
                rel, str(VAULT_DIR / f"the small return {day}.md"),
                "filename is `<title> <YYYY-MM-DD>.md`")
            text = (vault / rel).read_text(encoding="utf-8")
            self.assertTrue(text.startswith("---\n"))
            for line in ('title: "the small return"',
                         "type: note",
                         "domain: life",
                         "topic: the-small-return",
                         "status: processed",
                         "format: essay",
                         "source: personal",
                         "tags:",
                         f"date: {day}",
                         f"date_clipped: {day}",
                         "reflects:",
                         '  - "Memoir/entry one.md"',
                         '  - "Clippings/knit.md"'):
                self.assertIn(line + "\n", text + "\n",
                              f"frontmatter must carry {line!r}")
            self.assertIn(GOOD_DRAFT, text,
                          "the essay rides verbatim — law 4")


class ValidatorTest(unittest.TestCase):
    def test_bool_exactly_absent_means_off(self):
        self.assertIsNone(server.validate_reflection_writeback({}))
        self.assertIsNone(server.validate_reflection_writeback(
            {"reflection_writeback_enabled": True}))
        self.assertIsNone(server.validate_reflection_writeback(
            {"reflection_writeback_enabled": False}))
        for bad in (1, 0, "yes", None, [], {}):
            err = server.validate_reflection_writeback(
                {"reflection_writeback_enabled": bad})
            self.assertIsInstance(err, str, f"{bad!r} must be refused")


class CloseWritebackTest(unittest.TestCase):
    """The gate + writer end to end, through the real close route: a live
    server over a temp library, a temp vault stamped as meta.vault_root.
    The close route never calls the CLI, so no stub is needed."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.library = self.tmp / "library"
        self.library.mkdir()
        self.vault = make_vault(self.tmp)
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
        self._tmp.cleanup()

    def request_json(self, method, path, body=None):
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
            return resp.status, json.loads(resp.read())
        finally:
            conn.close()

    def seed_store(self, toggle=None, sentinels=False):
        """A store stamped with the temp vault_root and two clean vault
        items the session pool references; `toggle` seeds the write-back
        flag DIRECTLY (so a truthy-non-True can be planted past the
        validator, proving the `is True` gate); `sentinels` adds fenced-
        style sentinel items the pool never references."""
        (self.library / "items").mkdir(exist_ok=True)
        store = study_lib.new_store(self.library)
        store["meta"]["vault_root"] = str(self.vault)
        if toggle is not None:
            store["meta"]["reflection_writeback_enabled"] = toggle
        base = 1700000000000
        self.pool_ids = []
        for i, rel in enumerate(("Memoir/entry one.md",
                                 "Clippings/knit.md")):
            item_id = format(0xf000 + i, "016x")
            self.pool_ids.append(item_id)
            store["items"][item_id] = {
                "id": item_id, "content_hash": item_id * 4,
                "source": "obsidian-vault",
                "origin_path": str(self.vault / rel),
                "library_path": f"items/{item_id}.md", "type": "text",
                "title": Path(rel).name,
                "created_ms": base + i, "saved_ms": base + i,
                "imported_ms": base + i, "last_opened_ms": None,
                "state": "blessed", "resting_until_ms": None,
                "tags": [], "trigger": False, "year": 2023,
                "folder": str(Path(rel).parent.name), "history": [],
            }
        if sentinels:
            for i in range(2):
                item_id = format(0xfa00 + i, "016x")
                snap = self.library / "items" / f"{item_id}.md"
                snap.write_text(f"FENCE-SENTINEL-{i} never leaves",
                                encoding="utf-8")
                store["items"][item_id] = {
                    "id": item_id, "content_hash": item_id * 4,
                    "source": "obsidian-vault",
                    "origin_path": str(self.vault / "Memoir" /
                                       f"FENCE-TITLE-{i}.md"),
                    "library_path": f"items/{item_id}.md",
                    "type": "text", "title": f"FENCE-TITLE-{i}.md",
                    "created_ms": base, "saved_ms": base,
                    "imported_ms": base, "last_opened_ms": None,
                    "state": "never_show", "resting_until_ms": None,
                    "tags": [], "trigger": True, "year": 2023,
                    "folder": "Memoir", "history": [],
                }
        study_lib.save_store(self.library, store)

    def seed_session(self, draft=GOOD_DRAFT, stale_coda=None, name=None):
        """⚠ 26.995-05 (D-06): `name` DEFAULTS TO ABSENT, and that is not
        laziness — it makes every other case in this class a PRE-CHANGE
        SITTING, the exact artefact D-06's read-time fallback exists for.
        Those cases still pass, unedited, and that is the back-compat
        proof rather than a claim about one.

        ⛔ 26.995-12 (D-13, RESEARCH Pitfall 9): `coda=` BECAME
        `stale_coda=` and the key is written ONLY when it is passed. A
        harness that keeps emitting a REMOVED field passes silently — the
        closed-properties flag lives on the WIRE SCHEMA, not on the
        validator, which reads named keys and ignores strangers. Passing
        `stale_coda=` is therefore the DELIBERATELY NON-COMPLIANT arm: it
        is what makes the label-absent assertion below a test of the
        vault file rather than of this fixture."""
        doc = {
            "state": "active", "consented": True,
            "pool": {"meta_rows": [{"id": i} for i in self.pool_ids],
                     "bodies": [], "counts": {}},
            "draft": draft, "question": None,
            "chat": [], "created_ms": 1}
        if stale_coda is not None:
            doc["coda"] = stale_coda
        if name is not None:
            doc["name"] = name
        study_lib.save_session_file(self.library, doc)

    def close_save(self):
        return self.request_json("POST", "/api/librarian/session/close",
                                 {"outcome": "save"})

    def new_vault_files(self, before):
        after = tree_hash(self.vault)
        new = sorted(set(after) - set(before))
        unchanged = all(after[p] == before[p] for p in before)
        return new, unchanged, after

    # -- 6. the /api/meta roundtrip --------------------------------------------

    def test_meta_roundtrip_bool_exactly(self):
        self.seed_store()
        status, _ = self.request_json(
            "POST", "/api/meta", {"reflection_writeback_enabled": True})
        self.assertEqual(status, 200)
        for bad in (1, "yes", None):
            status, data = self.request_json(
                "POST", "/api/meta",
                {"reflection_writeback_enabled": bad})
            self.assertEqual(status, 400, f"{bad!r} must be refused")
            self.assertIn("reflection_writeback_enabled", data["error"])

    # -- 7. OFF => zero vault deltas -------------------------------------------

    def test_toggle_off_saves_change_zero_vault_bytes(self):
        for toggle in (None, False, 1):
            with self.subTest(toggle=toggle):
                self.seed_store(toggle=toggle)
                self.seed_session()
                before = tree_hash(self.vault)
                status, data = self.close_save()
                self.assertEqual(status, 200, f"save refused: {data}")
                self.assertIs(data["saved"], True)
                self.assertIs(data["writeback"], False)
                self.assertEqual(data["writeback_failures"], 0,
                                 "OFF is not a failure — the writer is "
                                 "never reached")
                self.assertEqual(tree_hash(self.vault), before,
                                 "toggle OFF: the vault tree is "
                                 "byte-identical, whole")

    # -- 8. ON => exactly one NEW file, nothing else touched -------------------

    def test_toggle_on_one_new_file_reflects_and_name(self):
        self.seed_store()
        status, _ = self.request_json(
            "POST", "/api/meta", {"reflection_writeback_enabled": True})
        self.assertEqual(status, 200)
        # ⛔ THE NON-COMPLIANT ARM, deliberately: the session document still
        # carries the removed key. If the vault file has no label ANYWAY,
        # the assertion below is about the FILE and not about this fixture
        # (RESEARCH Pitfall 9). It is red on the pre-change tree.
        self.seed_session(draft=WOVEN_DRAFT,
                          stale_coda="you asked for the border to stay.")
        before = tree_hash(self.vault)
        status, data = self.close_save()
        self.assertEqual(status, 200, f"save refused: {data}")
        self.assertIs(data["writeback"], True)
        self.assertEqual(data["writeback_failures"], 0)
        new, unchanged, after = self.new_vault_files(before)
        self.assertEqual(len(new), 1, "exactly ONE new file appears")
        self.assertTrue(unchanged,
                        "every pre-existing file stays byte-identical")
        rel = new[0]
        day = datetime.now().strftime("%Y-%m-%d")
        self.assertEqual(rel, str(VAULT_DIR / f"the small return {day}.md"),
                         "the file lands in the ritual's folder with the "
                         "`<title> <YYYY-MM-DD>.md` name")
        text = (self.vault / rel).read_text(encoding="utf-8")
        # reflects: the pool's vault-relative origins, quoted (the draft
        # names neither title, so the fail-open whole-pool route rides)
        self.assertIn('  - "Memoir/entry one.md"', text)
        self.assertIn('  - "Clippings/knit.md"', text)
        self.assertIn("reflects:", text)
        self.assertIn(WOVEN_DRAFT, text)
        # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13. THESE TWO LINES
        # READ `self.assertIn("## from our conversation", text)` above her
        # sentence, AND THEY WERE CORRECT WHEN THEY WERE WRITTEN: the room
        # really did append that heading, byte-identical, into the file it
        # wrote to her vault. The INVERSION is the point.
        #
        # HER RULING, IN HER OWN TERMS: the label goes; the librarian weaves
        # what she added into the writing itself, so her addition survives in
        # HER words rather than as the room's summary under a heading.
        #
        # ⚠ THE CREEP-BACK REASON, spelled out here so the retired literal
        # cannot quietly return: ONE MANDATED SHAPE IS ONE SHAPE TO COPY, and
        # a labelled footer appended by the room's OWN CODE was more fixed
        # than anything the librarian was producing.
        #
        # ⛔ AND THIS FILE IS ON HER DISK (law 9). A reflection written to her
        # vault BEFORE this change keeps its labelled section forever —
        # nothing rewrites it; see
        # test_a_reflection_saved_before_this_change_still_opens_and_renders.
        self.assertNotIn(
            "## from our conversation", text,
            "the vault file carries NO labelled footer: the room appends "
            "no '## from our conversation' section to what it writes (D-13)")
        self.assertIn(
            "you asked for the border to stay.", text,
            "what she added still reaches her vault — woven into the "
            "writing, in HER words, never summarised under a label")
        # and the book exists regardless of the vault write
        books = json.loads(
            (self.library / "librarian" / "books.json").read_text(
                encoding="utf-8"))["books"]
        self.assertEqual(books[0]["id"], data["book_id"])

    # -- 26.995-12 (D-13): the reference derivation reads the DRAFT alone ----
    #
    # `_reflection_pool_origins` used to scan `("draft", "coda")`. The
    # weaving means her words are IN the draft now, so the same references
    # are found from the draft alone — and this case asserts that BY VALUE
    # rather than asserting it in prose.
    #
    # ⛔ THE THIRD ARM IS THE ONE THAT MATTERS AND IT IS RED ON THE
    # PRE-CHANGE TREE: a session document that still carries the removed key,
    # naming an item the draft never names, must NOT pull that item into the
    # references. Without it, arms one and two pass equally well for a
    # function whose tuple never shrank.

    def test_the_references_are_derived_from_the_draft_alone(self):
        self.seed_store()
        store = study_lib.load_store(self.library)
        root = str(self.vault)
        both = ["Memoir/entry one.md", "Clippings/knit.md"]

        # (1) her addition, woven into the draft, NAMES an entry -> that
        #     entry alone is referenced. BY VALUE.
        woven = (GOOD_DRAFT + "\n\nyou came back to knit.md twice this "
                              "week and said so yourself.")
        self.assertEqual(
            server._reflection_pool_origins(
                {"pool": {"meta_rows": [{"id": i} for i in self.pool_ids]},
                 "draft": woven}, store, root),
            ["Clippings/knit.md"],
            "the reference her woven sentence names is the one derived")

        # (2) the control, in the same case: a draft naming NEITHER entry
        #     fails OPEN to the whole pool. Without this, arm (1) would pass
        #     just as happily for a function that returned everything.
        self.assertEqual(
            server._reflection_pool_origins(
                {"pool": {"meta_rows": [{"id": i} for i in self.pool_ids]},
                 "draft": GOOD_DRAFT}, store, root),
            both,
            "naming none of them fails OPEN to the whole pool, unchanged")

        # (3) ⛔ THE ARM THAT SHOULD FAIL. A stale `coda` key naming the
        #     OTHER entry is NOT read: the tuple is the draft alone now.
        self.assertEqual(
            server._reflection_pool_origins(
                {"pool": {"meta_rows": [{"id": i} for i in self.pool_ids]},
                 "draft": woven,
                 "coda": "and entry one.md as well"}, store, root),
            ["Clippings/knit.md"],
            "a removed key left on a pre-change document names nothing — "
            "the derivation reads the DRAFT alone (D-13)")

    # -- 26.995-05 (D-06): the LAST THREE of the name's six uses ---------
    #
    # ⛔ THIS CASE EXISTS BECAUSE THE MUTATION DRILL FOUND IT MISSING. A
    # mutant that reverted the close route to the old derivation SURVIVED
    # the whole suite: nothing anywhere drove the store item's title, the
    # book's title or the write-back FILENAME back to the name. Three of
    # the six uses in this plan's own key link were unproven, and the one
    # at the end of the chain is a file on her disk.

    def test_the_saved_book_and_the_vault_file_read_the_NAME(self):
        self.seed_store(toggle=True)
        # the draft's own heading says one thing; the reflection's NAME
        # says another. Under the OLD derivation the file would be named
        # "the small return"; under D-06 it is named what the reflection
        # named itself.
        self.assertIn("## the small return", GOOD_DRAFT,
                      "the fixture's heading — the value the old "
                      "derivation would have used")
        self.seed_session(name="on returning to the same walk")
        before = tree_hash(self.vault)
        status, data = self.close_save()
        self.assertEqual(status, 200, f"save refused: {data}")
        self.assertIs(data["writeback"], True)
        day = datetime.now().strftime("%Y-%m-%d")
        new, unchanged, _ = self.new_vault_files(before)
        self.assertEqual(
            new, [str(VAULT_DIR /
                      f"on returning to the same walk {day}.md")],
            "the vault FILENAME is built from the name")
        self.assertTrue(unchanged)
        text = (self.vault / new[0]).read_text(encoding="utf-8")
        self.assertIn('title: "on returning to the same walk"', text,
                      "and so is the frontmatter title")
        self.assertNotIn("the small return", text.split("---")[1],
                         "the heading is NOT the title any more")
        self.assertEqual(data["title"], "on returning to the same walk",
                         "the shelved BOOK's title too — one name")
        books = json.loads(
            (self.library / "librarian" / "books.json").read_text(
                encoding="utf-8"))["books"]
        self.assertEqual(books[0]["id"], data["book_id"])
        store = study_lib.load_store(self.library)
        self.assertEqual(store["items"][data["book_id"]]["title"],
                         "on returning to the same walk",
                         "and the STORE ITEM's title — the five in-app "
                         "uses and the one filesystem use are one value")

    def test_a_sitting_saved_before_this_change_still_shelves_and_writes(
            self):
        """⛔ THE BACK-COMPAT PROOF, stated rather than left implicit. A
        session file with NO name key — every sitting already on her disk —
        closes, shelves, and writes back under the OLD derivation."""
        self.seed_store(toggle=True)
        self.seed_session()          # no name key at all
        raw = json.loads(study_lib.session_file_path(
            self.library).read_text(encoding="utf-8"))
        self.assertNotIn("name", raw,
                         "the fixture really is a pre-change sitting")
        before = tree_hash(self.vault)
        status, data = self.close_save()
        self.assertEqual(status, 200, f"save refused: {data}")
        self.assertIs(data["writeback"], True)
        day = datetime.now().strftime("%Y-%m-%d")
        new, unchanged, _ = self.new_vault_files(before)
        self.assertEqual(new,
                         [str(VAULT_DIR / f"the small return {day}.md")],
                         "the old derivation — the first heading — is "
                         "still what names it")
        self.assertTrue(unchanged)
        self.assertEqual(data["title"], "the small return")

    def test_preseeded_identical_name_uniquifies(self):
        self.seed_store(toggle=True)
        day = datetime.now().strftime("%Y-%m-%d")
        taken = self.vault / VAULT_DIR / f"the small return {day}.md"
        original = b"# hers already\n"
        taken.write_bytes(original)
        self.seed_session()
        before = tree_hash(self.vault)
        status, data = self.close_save()
        self.assertEqual(status, 200)
        self.assertIs(data["writeback"], True)
        new, unchanged, _ = self.new_vault_files(before)
        self.assertEqual(new, [str(VAULT_DIR /
                                   f"the small return {day} 2.md")],
                         "the taken name steps to a counter suffix")
        self.assertTrue(unchanged)
        self.assertEqual(taken.read_bytes(), original,
                         "the pre-seeded file is never opened")

    # -- 9. a write-back failure never loses the book --------------------------

    def test_writeback_failure_is_counted_book_survives(self):
        self.seed_store(toggle=True)
        # take the ritual folder away: the writer refuses quietly
        (self.vault / VAULT_DIR / "old note.md").unlink()
        (self.vault / VAULT_DIR).rmdir()
        self.seed_session()
        status, data = self.close_save()
        self.assertEqual(status, 200,
                         "a refused write-back never fails the save")
        self.assertIs(data["saved"], True)
        self.assertIs(data["writeback"], False)
        self.assertEqual(data["writeback_failures"], 1,
                         "the refusal is counted fail-visible")
        books = json.loads(
            (self.library / "librarian" / "books.json").read_text(
                encoding="utf-8"))["books"]
        self.assertEqual(len(books), 1, "the book exists regardless")

    # -- 10. the write-back file is the fourth fence scan surface --------------

    def test_sentinels_absent_from_writeback_file_bytes(self):
        self.seed_store(toggle=True, sentinels=True)
        self.seed_session()
        before = tree_hash(self.vault)
        status, data = self.close_save()
        self.assertEqual(status, 200)
        self.assertIs(data["writeback"], True)
        new, unchanged, _ = self.new_vault_files(before)
        self.assertEqual(len(new), 1)
        self.assertTrue(unchanged)
        raw = (self.vault / new[0]).read_bytes()
        self.assertNotIn(b"FENCE-SENTINEL", raw,
                         "no fenced body byte ever reaches the vault file")
        self.assertNotIn(b"FENCE-TITLE", raw,
                         "no fenced title ever reaches the vault file — "
                         "not in reflects:, not anywhere")
        # positive control: the scan is never vacuous
        self.assertIn(b"the small return", raw)


if __name__ == "__main__":
    unittest.main(verbosity=2)
