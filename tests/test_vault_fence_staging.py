"""THE TRIPWIRE, RETIRED 2026-08-18 — and the law-9 guarantee it sits beside,
which is not retired and never will be.

Written 2026-08-12, BEFORE the obsidian-vault adapter existed: registering one
would have born-UNFENCED her private folders, and this file refused to let that
registration land quietly. ⛔ THE DOOR HAS NOW BEEN OPENED, by phase 26.97, and
the tripwire has been retired DELIBERATELY rather than deleted to go green —
see § THE RETIREMENT below for the date, the two proofs that replaced it named
by test file and case name, and the standing lesson this file keeps.

The three measured facts it was built on are still asserted below, because they
are still true and a later reader should be able to check them rather than take
this paragraph on trust.

WHY IT EXISTS — measured on the owner's real store, not predicted:

  1. The fence decides membership by an item's FIRST vault-relative path
     segment (_origin_under_roster). "personnel notes/ADA request.md" is fenced
     because segment one is "personnel notes".

  2. Adapters stage FLAT. Measured from her live library, an adapter item's
     origin_path is /var/folders/.../studyroom-collect-XXXX/<filename> with no
     folder structure whatsoever, against a whole-vault import's true nested
     path. Staged, segment one becomes the FILENAME and no roster entry can
     ever match.

  3. Worse, a staging directory has no `.obsidian/`, and _detect_obsidian is
     exactly `(src / ".obsidian").is_dir()`. So a staged vault is not detected
     as a vault AT ALL: source_label falls through to "folder-drop",
     `is_vault` is False, and the roster branch never even runs. The items
     also lose the "obsidian-vault" source string that is_reflection() keys
     on (the roadmap entry warns separately about renaming it — this loses it
     without a rename).

  Demonstrated end to end on her own note, "personnel notes/ADA - Employee Request
  Form Answers (EXTENSION draft).md": fenced today, unfenced through staging.

WHY A TRIPWIRE AND NOT A FIX. The repair is a design decision belonging to
Phase 26.97 — preserve vault-relative structure into staging, or carry the
true relative path as data and re-key the fence on it. Both are real designs
with trade-offs. Inventing an API here would be designing that phase by
stealth, from a test file, at planning time. So this file states the hazard,
proves it still exists, and refuses to let the registration land quietly.
"""
import hashlib
import os
import shutil
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import study_lib  # noqa: E402

ROSTER = ["Journal", "personnel notes", "billing & insurance notes"]


class VaultFenceSurvivesStaging(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="vault-fence-test-"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_the_fence_works_on_a_real_vault_path(self):
        """The control. A False below means nothing unless a True is
        reachable here — this is the assertion that keeps the rest honest."""
        vault = self.tmp / "vault"
        (vault / "personnel notes").mkdir(parents=True)
        note = vault / "personnel notes" / "ADA request.md"
        note.write_text("private", encoding="utf-8")
        self.assertTrue(
            study_lib._origin_under_roster(str(note), str(vault), ROSTER),
            "the fence no longer flags a note under a rostered folder even "
            "with the real vault root and nested path — that is a P0 in its "
            "own right, and every other test here is moot until it passes")

    def test_flat_staging_destroys_the_fence_key(self):
        """The hazard itself, pinned as a measured fact. If this ever starts
        failing, staging has begun preserving structure and the tripwire
        below can be reconsidered ON EVIDENCE rather than on optimism."""
        stage = self.tmp / "studyroom-collect-abc123"
        stage.mkdir()
        staged = stage / "ADA request.md"          # flattened, no folder
        staged.write_text("private", encoding="utf-8")
        self.assertFalse(
            study_lib._origin_under_roster(str(staged), str(stage), ROSTER),
            "flat staging now preserves the fence key — good news, and this "
            "tripwire's premise has changed. Re-read Phase 26.97's entry "
            "before relaxing anything")

    def test_a_staging_dir_is_not_even_detected_as_a_vault(self):
        """The second, independent reason the roster never runs — worth its
        own assertion because fixing only the path shape would still leave
        source_label as folder-drop, and is_reflection() keys on it."""
        stage = self.tmp / "studyroom-collect-abc123"
        stage.mkdir()
        (stage / "note.md").write_text("x", encoding="utf-8")
        _name, label = study_lib.detect_adapter(str(stage))
        self.assertEqual(
            label, "folder-drop",
            "a staging directory is being detected as something other than "
            "folder-drop — if it is now detected as obsidian-vault, confirm "
            "the roster actually applies before trusting it")

    # =====================================================================
    # § THE RETIREMENT  —  2026-08-18
    # =====================================================================
    # ⛔ THE ASSERTION THAT STOOD HERE WAS NOT DELETED TO GO GREEN. It said, in
    # its own docstring, that it was "not a veto on the phase — a demand that
    # the fence question is answered in the same change that opens the door,
    # rather than discovered afterwards by an owner whose HR notes are on a
    # shelf." That demand has been met, so the assertion is retired as a task
    # with acceptance criteria, not tidied away as a cleanup.
    #
    # WHAT OPENED THE DOOR. Phase 26.97 registered `obsidian-vault` in
    # server.py's _ADAPTERS — the line this assertion existed to catch. It
    # landed in plan 26.97-04, in the SAME change as the guard in front of it.
    #
    # THE TWO PROOFS THAT REPLACED IT, named so a reader arriving here can
    # follow the retirement to its evidence rather than take it on trust:
    #
    #   1. tests/test_obsidian_vault.py
    #        case: test_fence_survives_adapter_collect
    #        with its unmutated control in the same run:
    #              test_fence_whole_vault_control
    #      A note under a rostered folder, collected through the vault adapter
    #      and imported, comes back BORN TRIGGER-FLAGGED — the exact claim this
    #      assertion demanded before the door could open. It was seen RED first
    #      against the flat staging shape, and it can be re-reddened on demand
    #      with OBSIDIAN_VAULT_FORCE_FLAT=1.
    #
    #   2. tests/test_vault_refusal.py
    #        case: test_refusal_writes_nothing
    #        with its unmutated control in the same run:
    #              test_wellformed_collect_control
    #      A vault whose fence CANNOT be applied is refused on the server
    #      before anything is staged, and the refusal writes nothing on any of
    #      three surfaces. It was seen RED first on a planted un-fenceable
    #      collect. Her ruling of 2026-08-17: refuse outright and say why,
    #      rather than importing unfenced.
    #
    # ⚠ THE STANDING LESSON, KEPT ON PURPOSE — it explained a defect, not an
    # assertion, so it does not retire with the assertion it was attached to.
    # THE FIRST DRAFT OF THAT ASSERTION COULD NEVER FIRE. It searched the
    # _ADAPTERS block for the literal "obsidian-vault". But _ADAPTERS is a DICT
    # KEYED ON MODULE CONSTANTS — `{_apple_notes.SOURCE: _apple_notes, ...}` —
    # so no source string appears there at all, and a real registration
    # (`_obsidian_vault.SOURCE: _obsidian_vault`) would not contain one either.
    # Planting a registration left it GREEN. It was re-keyed on the REGISTERED
    # MODULES, which is what actually changes, and in that form it DID fire on
    # the real registration — measured 2026-08-18, one failure, naming
    # `_obsidian_vault`. Whoever writes the next gate in this repo: assert on
    # the thing that changes, then plant the change and watch it go red, before
    # trusting a green.

class NotePassWritesNothingIntoTheVault(unittest.TestCase):
    """V19 — the second door in this file, and it is shut for a different
    reason than the first.

    THE TRIPWIRE ABOVE guards a door nobody has opened: an `obsidian-vault`
    adapter that would born-UNFENCE her private folders. THIS ONE guards a
    door D-09 has already closed by ruling, and holds it closed by
    MEASUREMENT rather than by the sentence in the record.

    WHY IT EXISTS. #36 says the screenshot notes are "filed into Obsidian
    Clippings". D-09 NARROWS that, on the owner's ruling: the note goes to the
    LIBRARY ONLY. The reason is one-way-ness — roughly three thousand files
    written into a synced vault cannot be taken back by deleting them from one
    machine, and the room has been READ-ONLY on the vault side for its whole
    life. `meta.sync_comments_enabled` defaults to False and the note pass has
    no vault code path at all.

    So the assertion here is deliberately not "the pass does not call the
    vault writer". It is a FILESYSTEM COMPARISON of the whole vault tree
    before and after — {relpath: (sha256, size)} — which catches creates,
    modifies AND deletes in one equality. A gate that only looked for NEW
    files would miss a rewrite of a note she spent an evening on, and that is
    the worse of the two failures.

    ⚠ COMMENT HYGIENE, said once so a later reader does not "improve" this
    into a grep: the comparison is over a directory tree, not over source
    text, so nothing written in this docstring can influence its result. The
    paths and the sentences here are safe precisely because the instrument
    never reads them.

    The day a future phase gives the room a vault-writing path, this case is
    where it fails — loudly, before three thousand files land in a folder that
    syncs."""

    PROGRAM_FP = "fp-the-program-running-in-this-case"

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="note-pass-vault-test-"))
        self.library = self.tmp / "Library"
        self.vault = self.tmp / "Obsidian Vault"

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # -- the fixture ------------------------------------------------------

    def build(self):
        """A library with two screenshots that will both become notes, and a
        SEPARATE vault directory carrying files of the kinds she really has:
        a journal entry, a note inside a fenced folder, and an attachment."""
        (self.library / "items").mkdir(parents=True)
        for folder, name, body in (
                ("Journal", "2026-08-13.md", "# today\n\nnothing yet.\n"),
                ("personnel notes", "ADA request.md", "private\n"),
                ("Clippings", "a clipping.md", "# a clipping\n\nsaved.\n")):
            (self.vault / folder).mkdir(parents=True, exist_ok=True)
            (self.vault / folder / name).write_text(body, encoding="utf-8")
        (self.vault / ".obsidian").mkdir()
        (self.vault / ".obsidian" / "app.json").write_text("{}", "utf-8")

        store = study_lib.new_store(str(self.library))
        # ⚠ THE STORE CARRIES THE VAULT PATH, which is what makes this case
        # mean anything: a pass that wanted to write into her vault would not
        # have to guess where it is.
        store["meta"]["vault_root"] = str(self.vault)
        self.assertIs(
            store["meta"].get("sync_comments_enabled"), False,
            "the append-to-vault opt-in is not False by default any more — "
            "read study_lib's meta block before relaxing anything here")

        png = (b"\x89PNG\r\n\x1a\n" + struct.pack(">I", 13) + b"IHDR"
               + struct.pack(">II", 1179, 2556)
               + b"\x08\x06\x00\x00\x00" + b"\x00" * 16)
        self.cache = {}
        vector = [0.0] * study_lib.VISION_PRINT_DIM
        vector[0] = 1.0
        self.raw_print = struct.pack(
            "<%df" % study_lib.VISION_PRINT_DIM, *vector)
        for index, item_id in enumerate(("aa01", "aa02")):
            rel = "items/" + item_id + ".png"
            (self.library / rel).write_bytes(png)
            store["items"][item_id] = {
                "id": item_id, "source": "photos",
                "origin_path": "/var/folders/x/studyroom-collect-1/"
                               + item_id + ".png",
                "library_path": rel, "type": "image",
                "title": item_id + ".png", "state": "unseen",
                "trigger": False, "tags": ["screenshots"],
                "created_ms": 1700000000000 + index * 600000,
                "history": [],
            }
            self.cache[item_id] = {
                "text": "a page of invented words, comfortably longer than "
                        "the clean predicate's threshold",
                "themes": ["screenshot"], "faces": 0,
                "dim": study_lib.VISION_PRINT_DIM, "lang": "auto",
                "program_fp": self.PROGRAM_FP, "read_ms": 1,
            }
        return store

    def vault_tree(self):
        """{relpath: (sha256, size)} over every file under the vault."""
        out = {}
        for path in sorted(self.vault.rglob("*")):
            if path.is_file():
                data = path.read_bytes()
                out[str(path.relative_to(self.vault))] = (
                    hashlib.sha256(data).hexdigest(), len(data))
        return out

    def run_note_pass(self, store):
        return study_lib.run_note_pass(
            store, str(self.library), self.cache.get,
            lambda item_id: self.raw_print, self.PROGRAM_FP)

    # -- the case ---------------------------------------------------------

    def test_note_pass_writes_nothing_into_the_vault(self):
        store = self.build()
        before = self.vault_tree()
        self.assertEqual(len(before), 4,
                         "the fixture vault must actually hold files, or an "
                         "equality between two empty dicts would pass")
        result = self.run_note_pass(store)
        self.assertTrue(result["ok"], result.get("why"))
        self.assertEqual(result["report"]["notes"], 2,
                         "the pass must actually have RUN — two notes — or "
                         "this case proves only that nothing happened")
        self.assertEqual(
            self.vault_tree(), before,
            "the note pass touched her Obsidian vault. D-09 says the note "
            "goes to the LIBRARY ONLY, and roughly three thousand files into "
            "a synced vault is a one-way door")

    def _pass_with_a_planted_vault_touch(self, touch):
        """Run the pass with `study_lib.atomic_write_bytes` wrapped so that
        `touch` also runs on the pass's FIRST write.

        ⚠ THE MUTATION IS PLANTED INSIDE THE PASS, not applied to the vault
        afterwards, and the difference matters. Touching the fixture
        afterwards would only prove that the comparison function can subtract
        two dictionaries. Planting it in the writer reproduces the real
        failure this case exists for: a future phase gives the note pass a
        vault write, and the whole run ships three thousand files into a
        folder that syncs."""
        store = self.build()
        before = self.vault_tree()
        real = study_lib.atomic_write_bytes
        fired = []

        def wrapped(target, data):
            if not fired:
                fired.append(1)
                touch()
            return real(target, data)

        try:
            study_lib.atomic_write_bytes = wrapped
            result = self.run_note_pass(store)
        finally:
            study_lib.atomic_write_bytes = real
        self.assertTrue(result["ok"], result.get("why"))
        self.assertTrue(fired, "the wrapped writer was never reached, so no "
                               "mutation was planted")
        return before, self.vault_tree()

    def test_the_gate_fires_on_a_planted_write(self):
        """RED, direction one. One byte written into the vault DURING the
        pass must move the comparison, and it must name the relpath."""
        rel = Path("Journal") / "2026-08-13.md"
        before, after = self._pass_with_a_planted_vault_touch(
            lambda: (self.vault / rel).write_text(
                "# today\n\nnothing yet.\n!", encoding="utf-8"))
        self.assertNotEqual(after, before,
                            "a write into the vault during the pass did not "
                            "move the comparison — this gate is blind")
        changed = sorted(k for k in set(before) | set(after)
                         if before.get(k) != after.get(k))
        self.assertEqual(changed, [str(rel)],
                         "the comparison does not name WHICH file moved")

    def test_the_gate_fires_on_a_planted_delete(self):
        """RED, direction two, and it is the reason this compares a whole tree
        rather than counting new files. A gate that only looked for creates
        would be GREEN while one of her notes was being removed."""
        rel = Path("Clippings") / "a clipping.md"
        before, after = self._pass_with_a_planted_vault_touch(
            lambda: (self.vault / rel).unlink())
        self.assertNotEqual(
            after, before,
            "a DELETE inside the vault during the pass did not move the "
            "comparison — this gate only ever watched one direction")
        self.assertEqual(sorted(set(before) - set(after)), [str(rel)])

    def test_the_pass_never_reads_the_vault_opt_in_as_a_permission(self):
        """`meta.sync_comments_enabled` is the append-to-vault opt-in and it
        governs the comment sync-back, which is a different feature with its
        own suite. The note pass must not consult it at all: reading it would
        mean a user who turned that on for comments had silently also
        consented to three thousand files.

        ⚠ THIS ONE READS RAW SOURCE AND ONLY `#` COMMENTS ARE STRIPPED, SO
        PROSE IS NOT EXEMPT — deliberately, and it is the stricter choice.
        These five functions may not so much as NAME the opt-in, in code or in
        a docstring, because the next reader's question should be "why is the
        note pass talking about the vault at all". (The mirror of this bit
        26.94-02: docstring prose tripping a comment-stripped grep.) If a
        future phase needs to explain the relationship, it belongs in the
        block comment above the functions, not inside one."""
        src = (Path(__file__).resolve().parent.parent
               / "study_lib.py").read_text("utf-8")
        code = "\n".join("" if ln.lstrip().startswith("#") else ln
                         for ln in src.split("\n"))
        for name in ("run_note_pass", "mint_screenshot_note",
                     "note_pass_candidates", "_note_section_bytes",
                     "_move_snapshot_to_attachments"):
            parts = code.split("\ndef " + name + "(", 1)
            self.assertEqual(len(parts), 2,
                             name + " is not a top-level def in study_lib")
            body = parts[1].split("\ndef ", 1)[0]
            for banned in ("sync_comments_enabled", "vault_root",
                           "vault_path"):
                self.assertNotIn(
                    banned, body,
                    name + " consults " + banned + " — the note pass has no "
                    "vault code path and must not grow one here (D-09)")


class CollectWritesNothingIntoTheVault(unittest.TestCase):
    """LAW 9, EXTENDED TO THE COLLECT PATH (26.97-04).

    The class above holds the same guarantee for the NOTE PASS. This one holds
    it for the path phase 26.97 adds — and that path is the one that actually
    walks her vault, opens her notes and reads their bytes, so it is where the
    guarantee needed extending most and reached least.

    The room writes nothing into her files. Law 9 is not a preference and it
    has no exception on this path: the collect takes a SNAPSHOT of a note into
    a scratch directory the room owns. Her original is opened for reading and
    for nothing else.

    ⚠ THE COMPARISON IS THE SAME SHAPE AS THE CLASS ABOVE, deliberately rather
    than by coincidence: {relpath: (sha256, size)} over the WHOLE vault tree,
    before and after, compared by equality. That catches creates, modifies AND
    deletes in one assertion. A gate that only looked for NEW files would be
    green while one of her notes was being rewritten or removed, and that is
    the worse of the two failures.

    ⚠ WHAT IS DRIVEN, AND WHY IT IS NOT THE HTTP ROUTE. The two components that
    touch her vault during a collect are the collector (it walks and copies)
    and the importer (it reads the staged bytes and is handed her true vault
    root, so it KNOWS where her vault is). The route only orchestrates them.
    Driving the two directly is what puts the assertion around the code that
    could actually write. The route's own behaviour — that a refusal never gets
    this far at all — is proven in tests/test_vault_refusal.py.

    ⚠ COMMENT HYGIENE, said once so a later reader does not "improve" this into
    a grep: the comparison is over a directory tree, not over source text, so
    nothing written in this docstring can influence its result."""

    ROSTER = ["Journal", "personnel notes"]

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="vault-collect-law9-"))
        self.vault = self.tmp / "Obsidian Vault"
        self.library = self.tmp / "Library"
        self.library.mkdir(parents=True)
        self.build_vault()
        store = study_lib.new_store(str(self.library))
        store["meta"]["vault_root"] = str(self.vault)
        store["meta"]["fenced_roster"] = list(self.ROSTER)
        study_lib.save_store(str(self.library), store)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # -- the fixture ------------------------------------------------------

    NOTES = (
        ("Journal", "2026-08-18.md", "# today\n\nnothing yet.\n"),
        ("personnel notes", "ADA request.md", "private\n"),
        ("Clippings", "a clipping.md", "# a clipping\n\nsaved.\n"),
    )

    def build_vault(self):
        for folder, name, body in self.NOTES:
            (self.vault / folder).mkdir(parents=True, exist_ok=True)
            (self.vault / folder / name).write_text(body, encoding="utf-8")
        (self.vault / ".obsidian").mkdir(parents=True, exist_ok=True)
        (self.vault / ".obsidian" / "app.json").write_text("{}", "utf-8")

    def vault_tree(self):
        """{relpath: (sha256, size)} over every file under the vault."""
        out = {}
        for path in sorted(self.vault.rglob("*")):
            if path.is_file():
                data = path.read_bytes()
                out[str(path.relative_to(self.vault))] = (
                    hashlib.sha256(data).hexdigest(), len(data))
        return out

    def run_collect(self):
        """A FULL vault collect: the collector into a fresh scratch area, then
        the shipped importer handed her TRUE vault root."""
        from adapters import obsidian_vault
        staging = self.tmp / ("staging-%d" % len(list(self.tmp.iterdir())))
        collected = obsidian_vault.collect(str(self.library), str(staging))
        report = study_lib.import_folder(
            str(staging), str(self.library), staged_from=str(self.vault))
        return collected, report

    @staticmethod
    def moved(before, after):
        """Additions, modifications and deletions, each named."""
        added = sorted(set(after) - set(before))
        removed = sorted(set(before) - set(after))
        changed = sorted(k for k in set(before) & set(after)
                         if before[k] != after[k])
        return added, changed, removed

    # -- the case ---------------------------------------------------------

    def test_a_full_collect_writes_nothing_into_the_vault(self):
        before = self.vault_tree()
        self.assertEqual(
            len(before), 4,
            "the fixture vault must actually hold files, or an equality "
            "between two empty dicts would pass")
        collected, report = self.run_collect()
        self.assertEqual(
            len(collected), 3,
            "the collect must actually have RUN — three notes — or this case "
            "proves only that nothing happened (collected: %s)" % (collected,))
        self.assertEqual(
            report["imported"], 3,
            "the import must actually have RUN, or the half of this path that "
            "knows where her vault is was never exercised")
        added, changed, removed = self.moved(before, self.vault_tree())
        self.assertEqual(
            (added, changed, removed), ([], [], []),
            "the collect touched her Obsidian vault — added %s, modified %s, "
            "removed %s. Law 9: the room does not change her words, and a "
            "collect takes a SNAPSHOT" % (added, changed, removed))

    # -- the two drills ---------------------------------------------------

    def _collect_with_a_planted_vault_touch(self, touch):
        """Run a collect with `study_lib.hash_item` wrapped so that `touch`
        also runs on the collect's FIRST read of a note.

        ⚠ THE MUTATION IS PLANTED INSIDE THE PASS, not applied to the vault
        afterwards, and the difference matters — it is the same discipline the
        class above states for the note pass. Touching the fixture afterwards
        would only prove that this file can subtract two dictionaries.
        Planting it in the reader reproduces the real failure this case exists
        for: a future phase gives the collector a write, and every visit
        rewrites her notes underneath her."""
        before = self.vault_tree()
        real = study_lib.hash_item
        fired = []

        def wrapped(path, kind):
            if not fired:
                fired.append(1)
                touch()
            return real(path, kind)

        try:
            study_lib.hash_item = wrapped
            self.run_collect()
        finally:
            study_lib.hash_item = real
        self.assertTrue(fired, "the wrapped reader was never reached, so no "
                               "mutation was planted")
        return before, self.vault_tree()

    def test_the_gate_fires_on_a_planted_write(self):
        """RED, direction one. One byte written into the vault DURING the
        collect must move the comparison, and it must name the relpath."""
        rel = Path("Journal") / "2026-08-18.md"
        before, after = self._collect_with_a_planted_vault_touch(
            lambda: (self.vault / rel).write_text(
                "# today\n\nnothing yet.\n!", encoding="utf-8"))
        added, changed, removed = self.moved(before, after)
        self.assertEqual(
            (added, changed, removed), ([], [str(rel)], []),
            "a write into the vault during a collect did not move the "
            "comparison as a MODIFICATION naming that file — this gate is "
            "blind in the direction that matters most")

    def test_the_gate_fires_on_a_planted_delete(self):
        """RED, direction two, and it is the reason this compares a whole tree
        rather than counting new files. A gate that only looked for creates
        would be GREEN while one of her notes was being removed."""
        rel = Path("Clippings") / "a clipping.md"
        before, after = self._collect_with_a_planted_vault_touch(
            lambda: (self.vault / rel).unlink())
        added, changed, removed = self.moved(before, after)
        self.assertEqual(
            (added, changed, removed), ([], [], [str(rel)]),
            "a DELETE inside the vault during a collect did not move the "
            "comparison as a REMOVAL naming that file — this gate only ever "
            "watched one direction")


class RosterMatchingIgnoresCapitals(unittest.TestCase):
    """OWNER RULING, 2026-08-19: capitals are ignored when matching a folder
    she has named private.

    ⚠ THIS OVERTURNS A DELIBERATE DECISION, and the reason it was taken is
    still true and still respected: folding WIDENS the fence for every
    existing entry, and a fence that changes what it covers as a side effect
    of an unrelated fix is exactly the harm the roster rules exist to prevent.
    What changed is that it is no longer a side effect. She was shown the
    trade directly -- write 'journal' when the folder is 'Journal' and it was
    silently NOT kept private, on both ways into the room -- and chose folding
    over refusing, because folding can only ever make MORE private, never
    less.

    ⛔ SEGMENT-WISE AND WHOLE STILL GOVERNS. Folding must not turn the match
    into a substring test: 'Journal' may never catch 'Journal analysis', which
    is a real folder in her vault holding the room's own writing about her
    diary. Fencing it by accident would empty her reflections shelf.

    Measured on her live library at the time of the ruling: 2,824 vault items,
    580 correctly fenced, 0 under a private folder but unfenced -- so this
    closes a latent hole rather than an active leak, and no retroactive
    restamp was owed."""

    ROOT = "/vault"

    def under(self, origin, roster):
        return study_lib._origin_under_roster(
            os.path.join(self.ROOT, origin), self.ROOT, roster)

    def setUp(self):
        # _origin_under_roster resolves both sides, so the fixture root must
        # exist for the relative_to() to succeed.
        self._tmp = tempfile.TemporaryDirectory()
        self.ROOT = self._tmp.name
        self.addCleanup(self._tmp.cleanup)

    def test_a_lower_case_entry_now_catches_the_real_folder(self):
        self.assertTrue(
            self.under("Journal/day.md", ["journal"]),
            "she wrote 'journal', the folder on disk is 'Journal', and the "
            "note is STILL not kept private. This is the hole her ruling "
            "closes")

    def test_an_upper_case_entry_catches_a_lower_case_folder(self):
        """The other direction, because folding must be symmetric."""
        self.assertTrue(
            self.under("journal/day.md", ["Journal"]),
            "entry 'Journal' did not catch the folder 'journal'")

    def test_an_exact_match_still_matches(self):
        """CONTROL. The change must not disturb the ordinary case."""
        self.assertTrue(self.under("Journal/day.md", ["Journal"]),
                        "an exactly-matching entry stopped matching")

    def test_journal_still_does_not_catch_journal_analysis(self):
        """⛔ THE LOAD-BEARING CONTROL. Folding must not become a substring
        test. 'Journal analysis' is a real folder in her vault holding the
        room's own writing about her diary; fencing it by accident would
        empty her reflections shelf."""
        self.assertFalse(
            self.under("Journal analysis/note.md", ["Journal"]),
            "'Journal' caught 'Journal analysis' -- the match has become a "
            "prefix test and her reflections shelf would empty")
        self.assertFalse(
            self.under("Journal analysis/note.md", ["journal"]),
            "the folded entry 'journal' caught 'Journal analysis'")

    def test_a_different_folder_is_still_not_fenced(self):
        """CONTROL. Folding must not fence everything."""
        self.assertFalse(self.under("Recipes/soup.md", ["Journal"]),
                         "an unrelated folder was fenced")

    def test_nested_entries_fold_on_every_segment(self):
        """Her live roster carries 'Clippings/journal/chatgpt', whose middle
        and last segments are lower-case. Each segment folds independently."""
        self.assertTrue(
            self.under("Clippings/Journal/ChatGPT/a.md",
                       ["clippings/journal/chatgpt"]),
            "a nested entry did not fold on every segment")
        self.assertFalse(
            self.under("Clippings/journalism/a.md",
                       ["Clippings/journal"]),
            "'Clippings/journal' caught 'Clippings/journalism' -- whole "
            "segments, never prefixes")

    def test_the_change_can_only_widen_the_fence(self):
        """THE DIRECTIONAL PROOF, and it is what makes this ruling safe:
        anything the OLD exact rule fenced must still be fenced. A folding
        rule that narrowed anything would be a privacy regression wearing a
        convenience fix."""
        roster = ["Journal", "personnel notes", "Clippings/journal/chatgpt"]
        origins = [
            "Journal/a.md", "Journal/deep/b.md", "personnel notes/c.md",
            "Clippings/journal/chatgpt/d.md",
            "Journal analysis/e.md", "Recipes/f.md", "Clippings/other/g.md",
        ]
        for o in origins:
            parts = tuple(o.split("/"))
            exact = False
            for entry in roster:
                seg = study_lib.roster_segments(entry)
                if seg and list(parts[:len(seg)]) == seg:
                    exact = True
                    break
            if exact:
                self.assertTrue(
                    self.under(o, roster),
                    "%r was fenced under the OLD exact rule and is NOT "
                    "fenced now -- the fence NARROWED, which the ruling "
                    "never permitted" % (o,))




if __name__ == "__main__":
    unittest.main(verbosity=0)
