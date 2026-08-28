#!/usr/bin/env python3
"""THE REFUSAL PROOF for phase 26.97 (plan 26.97-04, SRM-08 / ADP-03).

⛔ THE BINDING RULING (OD-0, taken live with the owner 2026-08-17, not
re-openable and not softenable): a vault import that CANNOT APPLY THE FENCE
**refuses outright and says why**, rather than importing unfenced. She was
asked directly -- "if bringing in your vault can't protect your private
folders, what should happen?" -- and chose **refuse, loudly** over
bring-it-in-anyway. This file is what makes that ruling checkable.

WHAT THIS FILE PROVES, and it is written BEFORE the gate exists so that its
central case is seen RED first -- today a collect whose fence cannot be
applied proceeds and imports her vault UNPROTECTED:

  1. a well-formed collect PROCEEDS: no refusal, the fetch-memory directory
     exists afterwards, the connected list gains the vault source, and a
     last-import line is written  (the unmutated control)
  2. a collect whose fence cannot be applied REFUSES, and WRITES NOTHING --
     asserted on three independent surfaces
  3. the refusal is its OWN outcome, distinguishable from the generic collect
     error by SHAPE rather than by wording, and it never paints the shipped
     could-not-finish message
  4. the refusal fires for each distinct way the fence becomes inapplicable:
     no vault root recorded; the recorded vault root unreachable; the roster
     present but the synthesised probe not coming back flagged
  5. a PREVIOUSLY-CONNECTED vault that later refuses KEEPS its connected
     claim -- the narrow retraction does not fire, because a refusal wrote no
     fetch memory
  6. the writes-nothing assertion CAN MOVE (the inverse drill)

THE THREE SURFACES, AND WHY THERE ARE THREE. R2 of the refusal contract says a
refusal writes no fetch memory, drops no connected claim, and writes no
last-import line. Each is read a different way so that no single mistake can
make all three look clean:

  (1) FILESYSTEM -- the per-source fetch-memory directory under the library
      root does not exist. Saving that file CREATES its parent directory,
      which is precisely why its absence is evidence rather than decoration.
  (2) STORE, byte-compared -- the connected-sources list is serialised before
      and after and the two strings are compared. Not a membership test: a
      membership test would miss a reordering or a duplicate.
  (3) STORE, byte-compared -- the last-import report. A refusal must never
      leave a line that reads like an import which found nothing. That exact
      stale-zero confusion has already cost a live diagnostic round.

⚠⚠ THE PROOF DRIVES THE SERVER, NOT A HELPER (T-26.97-21). A client that
declines to send a request is a UI state, not a refusal. Every case here spins
up the real HTTP server on an ephemeral port and POSTs /api/adapter/collect,
so what is proven is a SERVER behaviour.

⚠ THE ADAPTER IS REGISTERED BY THIS FILE, INTO THE LIVE REGISTRY, FOR THE
DURATION OF EACH CASE. That is what makes the red honest: without it a collect
would be refused by the shipped source allowlist and the file would be red for
"that import source isn't available" -- a completely different sentence about
a completely different thing. Registered, the collect reaches the place where
the guard belongs, and its absence is what the red is about. The registration
is undone in cleanup, so this file does not depend on -- and does not
anticipate -- plan 26.97-04 Task 2's real registration.

⚠ HOW THE PLANT IS PLACED, said once because it is what separates this from a
test that subtracts two dictionaries. The mutation is planted INSIDE the path
under test: `study_lib._origin_under_roster`, the SHIPPED roster predicate the
capability gate must call, is wrapped so it answers False. Nothing is done to
a fixture afterwards. Every planting helper records the calls it saw and every
case that plants ASSERTS THE PLANT WAS REACHED, so a never-executed mutation
can never be handed in as a passing control.

Nothing here reads or writes the owner's real library or her real vault. Every
fixture is synthetic, built in a temp directory, removed in cleanup.

Stdlib only (unittest, http.client) -- zero-dependency law (law 8).
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

import server                                    # noqa: E402
import study_lib                                 # noqa: E402
from adapters import obsidian_vault              # noqa: E402

# The roster these cases fence by. Written into the fixture store's
# meta.fenced_roster, which is what `_active_roster` prefers, so the gate and
# the import agree about what is private without either being told twice.
# ⚠ "personnel notes" deliberately does NOT exist on disk. The gate proves the
# MATCH works, not that the folder happens to exist -- a private folder she
# has named but not yet created is still a folder the fence must be able to
# honour.
ROSTER = ["Journal", "personnel notes"]

SOURCE = obsidian_vault.SOURCE


class VaultRefusal(unittest.TestCase):

    # -- harness ----------------------------------------------------------

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

        self.vault = self.tmp / "Obsidian Vault"
        self.build_vault()

        # ⚠ A PRIVATE SCRATCH ROOT. The collect worker creates its staging
        # directory with a bare tempfile.mkdtemp, so pointing tempfile at an
        # empty directory of our own lets "nothing was staged" be read off the
        # filesystem afterwards as well as off the observer below.
        self.scratch_root = self.tmp / "scratch"
        self.scratch_root.mkdir()
        _saved_tempdir = tempfile.tempdir
        tempfile.tempdir = str(self.scratch_root)
        self.addCleanup(setattr, tempfile, "tempdir", _saved_tempdir)

        # ⚠ THE SCRATCH OBSERVER, and it is deliberately NOT a before/after
        # census of the scratch root. The worker removes its staging directory
        # in a `finally`, so a census taken after the run would be EQUAL on a
        # refusal AND on a full collect -- an assertion that cannot move. What
        # is observed instead is the CREATION.
        self.mkdtemp_calls = []
        _real_mkdtemp = tempfile.mkdtemp

        def watched_mkdtemp(*a, **kw):
            path = _real_mkdtemp(*a, **kw)
            if str(kw.get("prefix", "")).startswith("studyroom-collect-"):
                self.mkdtemp_calls.append(path)
            return path

        tempfile.mkdtemp = watched_mkdtemp
        self.addCleanup(setattr, tempfile, "mkdtemp", _real_mkdtemp)

        self.library = self.tmp / "library"
        self.library.mkdir()
        self.build_store()

        self.register_the_vault_adapter()
        self.silence_the_reading_phase()
        self.silence_the_access_log()

        for job in (server.EXPORT_JOB, server.IMPORT_JOB, server.VISION_JOB):
            with server.JOB_LOCK:
                job.update(state="idle", total=0, done=0, started_ms=0,
                           report=None, message=None)

        self.httpd = server.create_server(self.library, 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(
            target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.shutdown_server)

    def shutdown_server(self):
        self.wait_settled(quiet=True)
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=10)

    def register_the_vault_adapter(self):
        """Put the real vault adapter in the live registry for this case.

        See the module docstring: without this the collect never reaches the
        place the guard belongs and the red would be about the source
        allowlist instead. Undone in cleanup, so nothing here depends on the
        registration Task 2 makes permanent."""
        saved_adapters = server._ADAPTERS
        saved_sources = server.ADAPTER_SOURCES
        saved_errors = server._ADAPTER_COLLECT_ERRORS
        self.addCleanup(setattr, server, "_ADAPTERS", saved_adapters)
        self.addCleanup(setattr, server, "ADAPTER_SOURCES", saved_sources)
        self.addCleanup(setattr, server, "_ADAPTER_COLLECT_ERRORS",
                        saved_errors)
        server._ADAPTERS = dict(saved_adapters)
        server._ADAPTERS[SOURCE] = obsidian_vault
        server.ADAPTER_SOURCES = tuple(server._ADAPTERS)
        if obsidian_vault.VaultCollectError not in tuple(saved_errors):
            server._ADAPTER_COLLECT_ERRORS = tuple(saved_errors) + (
                obsidian_vault.VaultCollectError,)

    def silence_the_access_log(self):
        """Stop the handler writing an access line per request.

        ⚠ NOT COSMETIC. The server logs to stderr while unittest is midway
        through printing a case's name, which splits the verdict onto a line
        of its own -- and the red-first gate reads the verdict off the same
        line as the name. A instrument whose output is corrupted by the
        subject under test cannot be read."""
        saved = server.StudyHandler.log_message
        self.addCleanup(setattr, server.StudyHandler, "log_message", saved)
        server.StudyHandler.log_message = lambda *a, **kw: None

    def silence_the_reading_phase(self):
        """Replace the photograph-reading pass with a no-op.

        It is the collect's FOURTH phase, it spawns a reader, it is twenty
        minutes long in the real world, and this fixture holds no photographs
        at all. The seam replaced here is the same one tests/
        test_server_smoke.py's VisionStageInTheImportTest replaces, for the
        same reason: this file is about the guard in front of the collect, not
        about the reading behind it."""
        saved = server.vision_run_over_library
        self.addCleanup(setattr, server, "vision_run_over_library", saved)

        def quiet(library_root, store, progress_cb=None):
            if progress_cb is not None:
                progress_cb(0, 0)
            return {"ok": True, "why": None,
                    "report": {"eligible": 0, "attempted": 0, "ok": 0,
                               "fenced_now": 0, "swept_files": 0}}

        server.vision_run_over_library = quiet

    # -- the fixtures -----------------------------------------------------

    #: (vault-relative folder, filename, body)
    NOTES = (
        ("Journal", "2026-08-18.md", "# today\n\nnothing yet.\n"),
        ("Clippings", "a clipping.md", "# a clipping\n\nsaved.\n"),
    )

    def build_vault(self):
        """A synthetic Obsidian vault: the marker directory, one note under a
        rostered folder, one under an ordinary folder."""
        for folder, name, body in self.NOTES:
            (self.vault / folder).mkdir(parents=True, exist_ok=True)
            (self.vault / folder / name).write_text(body, encoding="utf-8")
        (self.vault / ".obsidian").mkdir(parents=True, exist_ok=True)
        (self.vault / ".obsidian" / "app.json").write_text("{}", "utf-8")

    def build_store(self, vault_root=None, connected=()):
        """A library whose store already remembers the vault and her roster --
        the real sequence: a whole-vault import records meta.vault_root, and
        a later collect is what this phase adds."""
        store = study_lib.new_store(str(self.library))
        if vault_root is not None:
            store["meta"]["vault_root"] = str(vault_root)
        else:
            store["meta"]["vault_root"] = str(self.vault)
        store["meta"]["fenced_roster"] = list(ROSTER)
        if connected:
            store["meta"]["connected_sources"] = list(connected)
        study_lib.save_store(str(self.library), store)
        return store

    def rewrite_meta(self, **changes):
        """Apply `changes` to the store's meta and save. `None` removes a key
        (which is how "no vault root recorded" is expressed)."""
        store = study_lib.load_store(str(self.library))
        for key, value in changes.items():
            if value is None:
                store["meta"].pop(key, None)
            else:
                store["meta"][key] = value
        study_lib.save_store(str(self.library), store)

    # -- the three surfaces, each read a different way --------------------

    def fetch_memory_dir(self):
        """SURFACE 1 -- filesystem. The per-source fetch-memory directory.
        `adapters/_ledger.save` creates it, so its absence is evidence."""
        return self.library / "adapters" / SOURCE

    def connected_claim(self):
        """SURFACE 2 -- the connected-sources list, SERIALISED. Compared as a
        string, never by membership: a membership test would not see a
        reorder or a duplicate."""
        store = study_lib.load_store(str(self.library))
        return json.dumps((store.get("meta") or {}).get("connected_sources"),
                          sort_keys=True)

    def last_import_line(self):
        """SURFACE 3 -- the last-import report, SERIALISED. A refusal that
        left one of these behind would read as an import that found nothing.
        """
        store = study_lib.load_store(str(self.library))
        return json.dumps((store.get("meta") or {}).get("last_import_report"),
                          sort_keys=True)

    def three_surfaces(self):
        return (self.fetch_memory_dir().exists(), self.connected_claim(),
                self.last_import_line())

    # -- driving the real server ------------------------------------------

    def request_json(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
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

    def collect(self, source=SOURCE, **extra):
        body = {"source": source}
        body.update(extra)
        return self.request_json("POST", "/api/adapter/collect", body)

    def wait_settled(self, timeout=25.0, quiet=False):
        """Wait for the collect worker to leave `running`. Lifecycle only --
        no verdict is ever read from here."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            with server.JOB_LOCK:
                busy = (server.EXPORT_JOB["state"] == "running"
                        or server.IMPORT_JOB["state"] == "running"
                        or server.VISION_JOB["state"] in ("running",
                                                          "pending"))
            if not busy:
                return
            time.sleep(0.01)
        if not quiet:
            self.fail("the collect never settled")

    def export_job_snapshot(self):
        with server.JOB_LOCK:
            return dict(server.EXPORT_JOB)

    # -- the plant, placed INSIDE the path under test ----------------------

    def force_the_probe_false(self):
        """Make the SHIPPED roster predicate answer False.

        ⚠ THIS IS PLANTED INSIDE THE HANDLER'S OWN FLOW, not applied to a
        fixture afterwards. `study_lib._origin_under_roster` is the predicate
        the capability gate must call to prove the fence can be applied; wrap
        it to answer False and the fence is, from inside the collect, genuinely
        inapplicable. Mutating the fixture after the run would only prove that
        this file can compare two strings.

        Returns the list of calls it saw, so the caller can assert the plant
        was REACHED -- a mutation that never executed is not a mutation."""
        real = study_lib._origin_under_roster
        calls = []

        def wrapped(origin_path, vault_root, roster):
            calls.append(str(origin_path))
            return False

        study_lib._origin_under_roster = wrapped
        self.addCleanup(setattr, study_lib, "_origin_under_roster", real)
        return calls

    # -- 1. the unmutated control -----------------------------------------

    def test_wellformed_collect_control(self):
        before = self.three_surfaces()
        self.assertEqual(
            before, (False, "null", "null"),
            "the fixture library must start with none of the three surfaces "
            "written, or 'they changed' would mean nothing")
        status, data = self.collect()
        self.wait_settled()
        self.assertEqual(status, 200, data)
        self.assertNotIn(
            "refused", data,
            "a WELL-FORMED vault was refused. A gate that refuses everything "
            "would satisfy every refusal case in this file; this control is "
            "what closes that door")
        self.assertIs(data.get("ok"), True, data)
        self.assertTrue(
            self.mkdtemp_calls,
            "no staging directory was ever created, so this control never "
            "ran a collect and cannot stand as one")
        after = self.three_surfaces()
        self.assertTrue(
            after[0],
            "the fetch-memory directory was NOT created by a successful "
            "collect, so its absence after a refusal proves nothing")
        self.assertNotEqual(
            after[1], before[1],
            "a successful collect did not record the connected claim, so an "
            "unchanged claim after a refusal proves nothing")
        self.assertIn(SOURCE, json.loads(after[1]) or [])
        self.assertNotEqual(
            after[2], before[2],
            "a successful collect wrote no last-import line, so an unchanged "
            "last-import line after a refusal proves nothing")

    # -- 2. the refusal, and it writes nothing ----------------------------

    def test_refusal_writes_nothing(self):
        calls = self.force_the_probe_false()
        before = self.three_surfaces()
        status, data = self.collect()
        self.wait_settled()
        self.assertIs(
            data.get("refused"), True,
            "a vault whose fence CANNOT BE APPLIED was not refused (status "
            "%s, body %s). OD-0, her ruling of 2026-08-17: refuse outright "
            "and say why, rather than importing unfenced. Her Journal/ and "
            "personnel notes/ notes are what is behind this assertion -- an "
            "unfenced item is readable by the disclosed cloud model"
            % (status, data))
        self.assertEqual(
            self.mkdtemp_calls, [],
            "a staging directory was created despite the refusal. The gate "
            "must decide BEFORE anything is staged -- past that point the "
            "connected-claim and fetch-memory writes are unconditional")
        after = self.three_surfaces()
        self.assertFalse(
            after[0],
            "SURFACE 1: a refusal wrote fetch memory. R2 -- a refusal that "
            "leaves state behind is a silent no-op wearing a refusal's "
            "clothes")
        self.assertEqual(
            after[1], before[1],
            "SURFACE 2: a refusal changed the connected-sources list")
        self.assertEqual(
            after[2], before[2],
            "SURFACE 3: a refusal wrote a last-import line, which reads as "
            "an import that found nothing -- the exact stale-zero confusion "
            "that already cost a live diagnostic round")
        self.assertEqual(
            sorted(p.name for p in self.scratch_root.iterdir()), [],
            "a scratch directory survives under the private scratch root "
            "after a refusal")
        # ⚠ LAST ON PURPOSE. This assertion exists to stop a never-executed
        # mutation being handed in as a PASS, so it guards the green above
        # rather than announcing the red. Placed first it would report the
        # instrument in place of the behaviour.
        self.assertTrue(
            calls,
            "the roster predicate was never called, so the plant was never "
            "REACHED and every verdict above was reached on an unmutated run")

    # -- 3. its own outcome, not the generic collect error -----------------

    def test_a_refusal_is_its_own_outcome_not_the_generic_error(self):
        """Distinguishable by SHAPE, never by wording. Falling into the
        generic failure branch would paint the shipped could-not-finish
        sentence and send her into a retry loop against a condition retrying
        cannot change."""
        calls = self.force_the_probe_false()
        refused_status, refused = self.collect()
        self.wait_settled()
        err_status, ordinary = self.collect(source="not-a-real-source")
        self.assertNotIn(
            "refused", ordinary,
            "an ORDINARY collect error carries the refusal marker, so the "
            "two are not distinguishable by shape at all")
        self.assertIs(refused.get("refused"), True, refused)
        self.assertIn(
            "error", ordinary,
            "the ordinary collect error stopped carrying a message, so the "
            "comparison below has nothing to distinguish it BY")
        # ⚠ THE LOAD-BEARING HALF. The refusal must not carry the generic
        # error's message key at all: a client that renders `error` would
        # otherwise paint the shipped could-not-finish wording over a refusal
        # and send her into a retry loop against a condition retrying cannot
        # change. Distinguished by SHAPE -- a key that is present in one and
        # absent in the other -- never by reading the words.
        self.assertNotIn(
            "error", refused,
            "the refusal carries the generic error's message key, so it is "
            "renderable as -- and therefore wearing the clothes of -- the "
            "loud total failure it is not")
        self.assertNotEqual(
            refused_status, err_status,
            "the refusal and the ordinary error are indistinguishable by "
            "status too (both %s), so nothing but the wording separates them"
            % refused_status)
        snap = self.export_job_snapshot()
        self.assertNotEqual(
            snap.get("message"), server.EXPORT_ERROR_MSG,
            "the refusal painted the shipped could-not-finish message, which "
            "invites a retry against a condition a retry cannot change")
        self.assertNotEqual(
            snap.get("state"), "running",
            "the refusal left the collect job claiming to be running, so the "
            "readout would sit on a progress bar for ever")
        self.assertTrue(calls, "the plant was never reached")

    # -- 4. the three distinct ways the fence becomes inapplicable ---------

    def test_refusal_when_no_vault_root_is_recorded(self):
        self.rewrite_meta(vault_root=None)
        before = self.three_surfaces()
        _status, data = self.collect()
        self.wait_settled()
        self.assertIs(
            data.get("refused"), True,
            "a collect with NO vault root recorded was not refused: %s"
            % (data,))
        self.assertEqual(self.mkdtemp_calls, [], "something was staged")
        self.assertEqual(self.three_surfaces(), before,
                         "a refusal left state behind")

    def test_refusal_when_the_vault_root_is_unreachable(self):
        self.rewrite_meta(vault_root=str(self.tmp / "a vault that is gone"))
        before = self.three_surfaces()
        _status, data = self.collect()
        self.wait_settled()
        self.assertIs(
            data.get("refused"), True,
            "a collect whose recorded vault root is UNREACHABLE was not "
            "refused: %s" % (data,))
        self.assertEqual(self.mkdtemp_calls, [], "something was staged")
        self.assertEqual(self.three_surfaces(), before,
                         "a refusal left state behind")

    # (the third way -- the roster present but the synthesised probe not
    #  coming back flagged -- is test_refusal_writes_nothing above.)

    # -- 5. a previously-connected vault keeps its claim -------------------

    def test_a_previously_connected_vault_keeps_its_claim_on_refusal(self):
        """DECIDED, NOT DISCOVERED. The shipped retraction of an unproven
        source is narrow on purpose: a source whose fetch memory holds
        anything has demonstrably worked before, so a later failure is a bad
        run and not a false connection. A refusal writes NO fetch memory, so a
        previously-connected vault that later refuses is NOT retracted. That
        is correct, and it is recorded as a decision rather than met as a
        surprise."""
        self.build_store(connected=[SOURCE])
        calls = self.force_the_probe_false()
        before = self.connected_claim()
        self.assertIn(SOURCE, json.loads(before) or [],
                      "the fixture must start CONNECTED or this case is moot")
        _status, data = self.collect()
        self.wait_settled()
        self.assertIs(data.get("refused"), True, data)
        self.assertEqual(
            self.connected_claim(), before,
            "a refusal RETRACTED a previously-connected vault. The retraction "
            "is for a source that has never once contributed; a refusal is "
            "not a failed run")
        self.assertTrue(calls, "the plant was never reached")

    # -- 6. the inverse drill: the assertion can move ----------------------

    def test_the_fetch_memory_assertion_can_move(self):
        """THE INVERSE DRILL. An assertion that cannot move is not an
        assertion. A single fetch-memory write planted INSIDE the refusal path
        -- fired from the same wrapped predicate the gate calls -- must make
        surface 1 read the other way."""
        from adapters import _ledger as adapter_ledger

        real = study_lib._origin_under_roster
        calls = []

        def wrapped(origin_path, vault_root, roster):
            calls.append(str(origin_path))
            adapter_ledger.save(str(self.library), SOURCE,
                                {"exported_ids": ["planted"],
                                 "last_run_ms": 1})
            return False

        study_lib._origin_under_roster = wrapped
        self.addCleanup(setattr, study_lib, "_origin_under_roster", real)

        self.assertFalse(self.fetch_memory_dir().exists(),
                         "surface 1 must start clean")
        _status, _data = self.collect()
        self.wait_settled()
        self.assertTrue(
            calls,
            "the planting predicate was never reached. Before the capability "
            "gate exists there is no refusal path to plant inside -- which is "
            "itself the finding, and the tripwire's measured reason #3: a "
            "staging directory is not detected as a vault at all, so the "
            "roster predicate is never consulted on the collect path")
        self.assertTrue(
            self.fetch_memory_dir().exists(),
            "a fetch-memory write planted inside the refusal path did NOT "
            "move surface 1 -- that surface is blind and every 'a refusal "
            "wrote no fetch memory' verdict in this file is worthless")

    # -- 7. the gate must prove the fence APPLIES, not merely resolve ------
    #
    # ⚠ ADDED 2026-08-19 by /gsd-secure-phase, closing T-26.97-01 and
    # T-26.97-23. The shipped gate synthesised its probe FROM the roster entry
    # and matched it AGAINST the same roster, so it agreed with itself by
    # construction. These three cases drive the two conditions under which it
    # said green while the fence caught nothing, plus the control that keeps
    # the "named but not yet created" folder legal.

    def test_a_case_mismatched_entry_now_COLLECTS_and_is_fenced(self):
        """⚠ RE-DERIVED 2026-08-19, NOT DELETED, AND THE FLIP IS THE POINT.

        This case used to require a REFUSAL: a roster entry naming an existing
        folder under a different spelling of case fenced nothing, so the gate
        had to stop the collect. The owner then ruled that capitals are
        ignored when matching, which fixes the hole AT THE ROOT -- so there is
        no longer anything for the gate to refuse, and refusing would now be a
        false alarm that blocks a collect she asked for.

        ⛔ The old case did not silently start passing. It carried a
        PRECONDITION assertion -- 'the shipped predicate now fences a
        case-mismatched entry, so this case no longer describes a real hole
        and must be re-derived rather than deleted' -- and that assertion is
        what fired when the ruling landed. This is that re-derivation."""
        self.rewrite_meta(fenced_roster=["journal", "personnel notes"])
        note = self.vault / "Journal" / "2026-08-18.md"
        self.assertTrue(note.exists(), "the fixture note must exist")
        self.assertTrue(
            study_lib._origin_under_roster(
                str(note), str(self.vault), ["journal", "personnel notes"]),
            "the shipped predicate does NOT fence a case-mismatched entry, "
            "so her ruling is not in force and the folder she named private "
            "is not private")

        _status, data = self.collect()
        self.wait_settled()
        self.assertNotIn(
            "refused", data,
            "a vault whose roster entry differs only in capitals was "
            "REFUSED. Since the ruling that is a working fence, not a broken "
            "one, and refusing blocks a collect she asked for: %s" % (data,))
        self.assertIs(data.get("ok"), True, data)
        self.assertTrue(
            self.mkdtemp_calls,
            "nothing was staged, so this case never ran a collect")

    def test_refusal_when_the_importer_would_not_take_the_vault_branch(self):
        """The roster fence runs only when the importer labels the source
        obsidian-vault. The old gate never asked what the importer would
        detect, so a vault that detects as something else passed the gate and
        then imported every private folder with the born-trigger flag False.

        The trigger used here is a chat-export file at the vault root, which
        the detection chain sniffs BEFORE the obsidian row."""
        (self.vault / "conversations.json").write_text(
            '[{"mapping": {}}]', encoding="utf-8")
        self.assertNotEqual(
            study_lib.detect_adapter(str(self.vault))[1], SOURCE,
            "PRECONDITION FAILED: this vault still detects as the vault "
            "source, so the case is not driving what it claims")

        before = self.three_surfaces()
        _status, data = self.collect()
        self.wait_settled()
        self.assertIs(
            data.get("refused"), True,
            "a vault the importer would NOT treat as a vault was collected. "
            "The roster fence would not have run on a single note: %s"
            % (data,))
        self.assertEqual(self.mkdtemp_calls, [],
                         "something was staged before the refusal")
        self.assertEqual(self.three_surfaces(), before,
                         "a refusal left state behind")

    def test_a_roster_folder_she_has_named_but_not_created_is_allowed(self):
        """THE CONTROL FOR CASE 7, and it guards a shipped decision. The
        fixture roster's 'personnel notes' does not exist on disk, on purpose: a
        private folder she has NAMED but not yet MADE must still collect. A
        case check that refused every absent folder would pass both mutants
        above and quietly break her real vault, so this control is what keeps
        the new check narrow."""
        self.assertFalse((self.vault / "personnel notes").exists(),
                         "the fixture must keep one rostered folder absent")
        _status, data = self.collect()
        self.wait_settled()
        self.assertNotIn(
            "refused", data,
            "a vault with a rostered folder she has not created yet was "
            "REFUSED. The new gate is too wide: %s" % (data,))
        self.assertIs(data.get("ok"), True, data)
        self.assertTrue(self.mkdtemp_calls,
                        "this control never ran a collect")


class VaultMovedMessageIsNeverBlank(unittest.TestCase):
    """T-26.97-22 / T-26.97-37, /gsd-secure-phase 2026-08-19.

    The server recovered this sentence by calling a PRIVATE adapter function
    with a fabricated path and catching its exception. One spelling, which was
    the point -- but it made user-visible copy depend on an exception path in
    an unrelated module, and it returned the EMPTY STRING if that path ever
    stopped raising, handing her a blank error with a 400 beside it."""

    def test_the_message_is_not_empty(self):
        msg = server._vault_moved_message()
        self.assertTrue(
            msg and msg.strip(),
            "the moved-vault message is blank (%r). A 400 carrying an empty "
            "body tells her nothing at all" % (msg,))

    def test_it_is_the_adapters_own_named_sentence(self):
        """ONE SPELLING, still. The whole reason for the old probe was that a
        second spelling is a second thing to drift; naming it must not quietly
        create one."""
        self.assertEqual(
            server._vault_moved_message(),
            obsidian_vault.VAULT_MISSING_MESSAGE,
            "the server's moved-vault sentence has drifted from the "
            "adapter's own")

    def test_the_adapter_still_raises_that_exact_sentence(self):
        """And the raise site must not have been left behind with a copy of
        its own -- otherwise the constant is decorative and the drift this
        guards against has already happened."""
        import tempfile
        base = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, str(base), True)
        gone = base / "a vault that is not there"
        with self.assertRaises(obsidian_vault.VaultCollectError) as caught:
            obsidian_vault._vault_root(None, str(gone))
        self.assertEqual(
            str(caught.exception), obsidian_vault.VAULT_MISSING_MESSAGE,
            "the adapter raises a sentence that is not the named one")
        self.assertEqual(getattr(caught.exception, "reason", None),
                         "vault_missing",
                         "the outcome token changed with the refactor")


if __name__ == "__main__":
    unittest.main(verbosity=0)
