#!/usr/bin/env python3
"""
Phase 26.9985 — Setting Aside a Subject, Not Just a Place.

The substrate suite for her twelve rulings (26.9985-RULINGS.md). Every
case here names the ruling it enforces. The surfaces carrying her § A–§ E
sentences are downstream and are NOT tested here; what is tested is the
machinery those sentences will stand on, because a sentence standing on
unproved machinery lies to her at the exact moment she is told to trust it
(§ E's own gate).

⛔ HER WORDS ARE PINNED BYTE-FOR-BYTE, copied out of 26.9985-COPY.md § F by
the script that wrote this file — never retyped. A test that "fixes" the
lowercase, the apostrophe or the full stop is overruling her.

⚠ THE ASYMMETRY IS THE FEATURE (R-10): an aside-marked item is fenced from
every librarian payload AND still on her own shelf. Half of that lives in
`study_lib._librarian_fenced`, half in `core.js itemExcluded` NOT gaining
the class — and this suite drives BOTH halves, the core.js half through
node against the real shipped file, because a gate that greps or assumes
is this project's signature defect.
"""

import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import librarian_call                      # noqa: E402
import server                              # noqa: E402  (binds the literals)
import study_lib                           # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ⛔ BYTE-FOR-BYTE OUT OF 26.9985-COPY.md § F. The apostrophe in `what's`
# and the closing full stop are hers as she took them. ⚠ CHOSEN FROM AN
# OFFERED SET — the ceremony is recorded at the head of the copy record.
HER_JOB_NAME = "Looking for what's not mine"
HER_JOB_SENTENCE = (
    "The librarian is going through what you have written, looking for "
    "things that might not be its to read.")

# ⛔ BYTE-FOR-BYTE OUT OF 26.9985-COPY.md § I, copied by the script that
# wrote this block — never retyped. Both full stops are hers as she took
# them. ⚠ CHOSEN FROM AN OFFERED SET — the ceremony repeated in the
# asking (the F6 sitting, R-16).
HER_CLEARING_NAME = 'Clearing its own notebook'
HER_CLEARING_SENTENCE = (
    'The librarian is going through its own notebook, taking out what it wrote about a subject you set aside. '
    'It keeps what it takes out, so you can put it back.')

# ⛔ BYTE-FOR-BYTE OUT OF 26.9985-COPY.md § J AND § K, copied by the
# script that wrote this block — never retyped. ⚠ Both CHOSEN FROM
# OFFERED SETS in the second F6 sitting (F5's empty answer; R-20's
# failed-clearing line).
HER_EMPTY_NAMED = "nothing i've read seems to be about this. the name is kept."
HER_CLEARING_FAILED = "i couldn't get to my notebook just now. i'll try again."


class JobRowTest(unittest.TestCase):
    """The finding pass's row and her words for it (R-1/R-2, § F)."""

    def test_her_two_room_words_byte_for_byte(self):
        name, sentence = server.JOB_ROOM_WORDS["subject_finding"]
        self.assertEqual(name, HER_JOB_NAME,
                         "her § F name drifted — it ships as she took it")
        self.assertEqual(sentence, HER_JOB_SENTENCE,
                         "her § F sentence drifted — it ships as she took it")

    def test_the_rows_operational_values(self):
        """⚠ The tier is PROVISIONAL (R-2's rung choice is hers and not yet
        made — it arrives with the exact price); the retry count is not:
        a retried timeout can bill her twice for a pass whose promise is
        *once* (R-9)."""
        row = librarian_call.JOBS["subject_finding"]
        self.assertEqual(row["retries"], 0,
                         "a silent second attempt can charge her twice — "
                         "the archive_learning money reason, R-9")
        self.assertTrue(row["permitted_local"],
                        "R-2's offer included her own machine")
        self.assertEqual(row["max_tokens"], 2000,
                         "a SPEND, stated by value in the row's comment")

    def test_the_schema_carries_no_free_text_about_her(self):
        """⛔ R-11's unasked-portrait risk, made mechanical: the only
        model-authored text this job can produce is a subject NAME. A
        `why`/`summary`/`description` slot would be a second portrait
        arriving unasked (the 26.996 class). If a field is ever added
        here, it is a design decision of HERS, not a schema tidy-up."""
        schema = json.loads(librarian_call.JOBS["subject_finding"]["schema"])
        subject = schema["properties"]["subjects"]["items"]
        self.assertEqual(sorted(subject["properties"]), ["item_ids", "name"])
        self.assertIs(subject["additionalProperties"], False)
        self.assertEqual(sorted(subject["required"]), ["item_ids", "name"])

    def test_no_words_no_room(self):
        """R-12's neighbour rule inherited from #74: the JOB_ROOM_WORDS /
        JOBS set-equality is asserted at server import, so this case only
        has to prove the two sets really are equal WITH the new row in —
        the import assert is what stops the room."""
        self.assertEqual(set(server.JOB_ROOM_WORDS),
                         set(librarian_call.JOBS))


_TESTS_DIR = os.path.join(REPO, "tests")
if _TESTS_DIR not in sys.path:
    sys.path.insert(0, _TESTS_DIR)

# ⚠ IMPORTED, NEVER COPIED — the fence suite's own fixture builders and its
# serialized-payload view, so an aside item is proved absent from the same
# byte view every other absence assertion scans.
from test_librarian_fence import (      # noqa: E402
    ALL_COMBOS, make_item, make_store, payload_blob)


class AsideFenceTest(unittest.TestCase):
    """R-10, the librarian half: the fifth class in `_librarian_fenced`."""

    def test_the_predicate_truth_table(self):
        blessed = {"state": "blessed"}
        self.assertTrue(study_lib._librarian_fenced(
            dict(blessed, aside=["her-subject"]), []),
            "a subject mark did not fence")
        self.assertTrue(study_lib._librarian_fenced(
            dict(blessed, aside=True), []),
            "a malformed truthy mark must err toward holding back")
        self.assertFalse(study_lib._librarian_fenced(
            dict(blessed, aside=[]), []),
            "an EMPTY mark list is no mark — fencing it would hide "
            "things she never set aside")
        self.assertFalse(study_lib._librarian_fenced(dict(blessed), []),
                         "an unmarked blessed item stays readable")

    def test_total_exclusion_across_every_scope(self):
        """An aside item is absent ENTIRELY — no id, no title, no body —
        from every scope x consent combination, exactly like the four
        shipped classes (SRM-13 criterion 3). A clean blessed control
        rides beside it so absence cannot be vacuous."""
        with tempfile.TemporaryDirectory() as lib:
            marked = make_item(lib, 1, state="blessed",
                               body="ASIDE-SENTINEL-BODY-9985",
                               title="ASIDE-SENTINEL-TITLE-9985")
            marked["aside"] = ["her-subject"]
            control = make_item(lib, 2, state="blessed",
                                body="CONTROL-BODY-stays",
                                title="CONTROL-TITLE-stays")
            store = make_store(lib, [marked, control])
            for scope, consent in ALL_COMBOS:
                _, blob = payload_blob(store, scope, consent)
                for needle in (marked["id"], "ASIDE-SENTINEL-BODY-9985",
                               "ASIDE-SENTINEL-TITLE-9985"):
                    self.assertNotIn(
                        needle, blob,
                        f"{scope}/consent={consent}: an aside item "
                        f"reached the payload")
                self.assertIn(control["id"], blob,
                              f"{scope}/consent={consent}: the clean "
                              f"control vanished — this case went vacuous")

    def test_the_arm_is_what_fences(self):
        """The mutation drill, in miniature: delete the aside arm from the
        predicate's own source, prove the deletion LANDED (the source
        moved) BEFORE any verdict is read, and prove the mutant stops
        fencing while still fencing never_show. A green
        `test_the_predicate_truth_table` could otherwise be riding some
        other arm entirely."""
        import inspect
        src = inspect.getsource(study_lib._librarian_fenced)
        mutated = src.replace(
            '    if item.get("aside"):\n        return True\n', "")
        self.assertNotEqual(mutated, src,
                            "the mutation never landed — the arm's "
                            "spelling moved and this drill went blind")
        ns = {"VALID_STATES": study_lib.VALID_STATES,
              "_names_off_limits_path": study_lib._names_off_limits_path,
              "_matches_active_filter": study_lib._matches_active_filter}
        exec(compile(mutated, "<mutant>", "exec"), ns)   # noqa: S102
        mutant = ns["_librarian_fenced"]
        marked = {"state": "blessed", "aside": ["her-subject"]}
        self.assertFalse(mutant(marked, []),
                         "the mutant still fences — the drill proved "
                         "nothing about the aside arm")
        self.assertTrue(mutant({"state": "never_show"}, []),
                        "the mutant lost more than the aside arm")
        self.assertTrue(study_lib._librarian_fenced(marked, []))


class SubjectStoresOffLimitsTest(unittest.TestCase):
    """R-6/R-9/R-12: the two stores exist, live under librarian/, and are
    off-limits to the librarian THROUGH THE SHIPPED PREDICATE — called,
    never re-spelled. ⛔ The refusal is forced, not chosen: each store is by
    construction the most concentrated collection of exactly the material
    she asked to be hidden."""

    STORE_TAILS = (study_lib.SUBJECTS_STORE_TAIL,
                   study_lib.KEPT_BACK_STORE_TAIL,
                   study_lib.ASIDE_ASKED_STORE_TAIL,
                   study_lib.ASIDE_QUIET_STORE_TAIL)

    def test_every_spelling_is_refused(self):
        """Relative AND absolute — R-12 put these INSIDE the library root,
        so the relative spelling the snapshot jail would happily resolve
        is the live hole, and the jail's own resolution is proved (the
        narrowed-lift arm: a refusal of an unreachable path proves
        nothing)."""
        with tempfile.TemporaryDirectory() as lib:
            (os.path.join(lib, "librarian"))
            os.makedirs(os.path.join(lib, "librarian"), exist_ok=True)
            for tail in self.STORE_TAILS:
                target = os.path.join(lib, *tail.split("/"))
                with open(target, "w", encoding="utf-8") as f:
                    f.write("{}")
                spellings = [
                    ("relative, the jail-resolvable one", tail),
                    ("a `..` bounce", "librarian/../" + tail),
                    ("absolute under the root", target),
                    ("doubled separator", lib + "//" + tail),
                    ("a deeper absolute home", "/some/other/root/" + tail),
                ]
                for why, raw in spellings:
                    self.assertTrue(
                        study_lib._names_off_limits_path(raw),
                        f"{tail}: not refused ({why}) — the librarian can "
                        f"read the one file made of what she set aside")
                # the jail really would resolve the relative spelling —
                # otherwise the refusal above is decoration.
                resolved = study_lib._snapshot_path(
                    lib, {"library_path": tail})
                self.assertIsNotNone(
                    resolved,
                    f"{tail}: the jail already turns the relative spelling "
                    f"away, so the predicate arm is doing no work and this "
                    f"case proves nothing")

    def test_the_neighbours_stay_readable(self):
        """The fence refuses these two files for what they are FOR, never
        for being nearby — the settings.json argument, re-applied. The
        session file and the blessings ledger live in the same folder and
        are NOT payload sources anyway, but the predicate must not widen
        to them."""
        for name in ("librarian/session.json", "librarian/blessings.json",
                     "librarian/learned.md", "items/aa02.md"):
            self.assertFalse(
                study_lib._names_off_limits_path(name),
                f"{name}: the predicate widened to a neighbour — a fence "
                f"that refuses files for being nearby stops being read")

    def test_a_row_naming_a_store_is_fenced_and_its_bytes_never_ride(self):
        with tempfile.TemporaryDirectory() as lib:
            os.makedirs(os.path.join(lib, "librarian"), exist_ok=True)
            os.makedirs(os.path.join(lib, "items"), exist_ok=True)
            with open(os.path.join(lib, "librarian", "subjects.json"),
                      "w", encoding="utf-8") as f:
                f.write('{"subjects": ["KEPT-BACK-SENTINEL-9985"]}')
            row = make_item(lib, 3, state="blessed", body="unused")
            row["library_path"] = study_lib.SUBJECTS_STORE_TAIL
            self.assertTrue(study_lib._librarian_fenced(row, []),
                            "a store row naming subjects.json is not fenced")
            control = make_item(lib, 4, state="blessed", body="CONTROL-OK")
            store = make_store(lib, [row, control])
            for scope, consent in ALL_COMBOS:
                _, blob = payload_blob(store, scope, consent)
                self.assertNotIn("KEPT-BACK-SENTINEL-9985", blob,
                                 f"{scope}/consent={consent}: the store's "
                                 f"bytes rode a payload")
                self.assertIn(control["id"], blob, "vacuous")

    def test_the_tail_arm_is_what_refuses(self):
        """The in-memory before/after drill, the record case's own shape: a
        mirror of the predicate WITHOUT the tail arm must ADMIT the
        relative spelling the shipped predicate refuses — if the two ever
        agree, the arm is doing no work."""
        def before(raw):
            if not isinstance(raw, str) or not raw:
                return False
            if not (raw.startswith("~") or os.path.isabs(raw)):
                return False
            candidate = os.path.normcase(
                os.path.normpath(os.path.expanduser(raw)))
            targets = [os.path.normcase(os.path.normpath(str(p)))
                       for p in (study_lib.keys_file_path(),
                                 study_lib.call_record_path())]
            return candidate in targets

        for tail in self.STORE_TAILS:
            self.assertFalse(before(tail),
                             "the pre-26.9985 mirror already refuses the "
                             "relative spelling — then this phase changed "
                             "nothing")
            self.assertTrue(study_lib._names_off_limits_path(tail))
        self.assertTrue(before(str(study_lib.keys_file_path())),
                        "the mirror lost the keys file — it must differ "
                        "from the shipped set in exactly the two tails")

    def test_the_file_family_discipline(self):
        """Fail-open reads, atomic writes, the wrapper shapes — and the one
        thing load_kept_back's docstring warns about: an empty wrapper is
        NOT § E evidence."""
        with tempfile.TemporaryDirectory() as lib:
            self.assertEqual(study_lib.load_subjects(lib), {"subjects": []})
            self.assertEqual(study_lib.load_kept_back(lib), {"removals": []})
            study_lib.save_subjects(lib, [{"key": "s1", "name": "n",
                                           "origin": "named",
                                           "item_ids": [], "status":
                                           "proposed", "ms": 1}])
            study_lib.save_kept_back(lib, [{"subject": "s1",
                                            "lines": ["a line"],
                                            "ms": 1, "undone": False}])
            self.assertEqual(
                study_lib.load_subjects(lib)["subjects"][0]["key"], "s1")
            self.assertEqual(
                study_lib.load_kept_back(lib)["removals"][0]["lines"],
                ["a line"])
            # a hand-mangled file reads as empty, never raises
            for p in (study_lib.subjects_file_path(lib),
                      study_lib.kept_back_file_path(lib)):
                p.write_text("not json {", encoding="utf-8")
            self.assertEqual(study_lib.load_subjects(lib), {"subjects": []})
            self.assertEqual(study_lib.load_kept_back(lib),
                             {"removals": []})


class SubjectRemovalTest(unittest.TestCase):
    """R-3/R-4/R-6 and § E's gate: the learned file's one legitimate
    second writer."""

    LINES = ("she loves the sea.",
             "her clinic visits weigh on her.",
             "she loves the sea.",          # a repeated line, on purpose
             "she knits through the winter.")

    def _lib(self, tmp, header=None):
        os.makedirs(os.path.join(tmp, "librarian"), exist_ok=True)
        text = (header if header is not None
                else study_lib.LEARNED_HEADER_RETIRED) \
            + "\n".join(self.LINES) + "\n"
        study_lib.learned_file_path(tmp).write_text(text, encoding="utf-8")
        return text

    def test_removal_kept_first_shown_whole_and_proved(self):
        with tempfile.TemporaryDirectory() as tmp:
            before = self._lib(tmp)
            out = study_lib.apply_subject_removal(
                tmp, "her-clinic",
                ["her clinic visits weigh on her.", "she loves the sea."],
                now_ms=1787000000000)
            self.assertTrue(out["ok"])
            self.assertTrue(out["nothing_is_lost"],
                            "§ E's gate is down on a clean removal")
            # every OCCURRENCE removed and shown — the repeated line twice
            self.assertEqual(out["removed_lines"],
                             ["she loves the sea.",
                              "her clinic visits weigh on her.",
                              "she loves the sea."])
            on_disk = study_lib.learned_file_path(tmp).read_text(
                encoding="utf-8")
            self.assertNotIn("clinic", on_disk)
            self.assertIn("she knits through the winter.", on_disk)
            # the retired header was swapped for the one that stopped lying
            self.assertTrue(out["header_swapped"])
            self.assertIn("keeps what it took", on_disk)
            self.assertNotIn("does not write it again on its own", on_disk)
            kept = study_lib.load_kept_back(tmp)["removals"]
            self.assertEqual(len(kept), 1)
            self.assertEqual(kept[0]["before_text"], before,
                             "the before-image is not byte-exact")

    def test_a_line_not_in_the_file_refuses_the_whole_removal(self):
        with tempfile.TemporaryDirectory() as tmp:
            before = self._lib(tmp)
            with self.assertRaises(study_lib.SubjectRemovalRefused):
                study_lib.apply_subject_removal(
                    tmp, "s", ["she loves the sea.", "never in the file"],
                    now_ms=1)
            self.assertEqual(
                study_lib.learned_file_path(tmp).read_text(
                    encoding="utf-8"), before,
                "a refused removal still edited the file")
            self.assertEqual(study_lib.load_kept_back(tmp)["removals"], [],
                             "a refused removal still left a kept entry")

    def test_undo_restores_byte_exact_and_only_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            before = self._lib(tmp)
            out = study_lib.apply_subject_removal(
                tmp, "s", ["her clinic visits weigh on her."], now_ms=7)
            undone = study_lib.undo_subject_removal(tmp, out["ms"])
            self.assertEqual(undone["restored_lines"],
                             ["her clinic visits weigh on her."])
            self.assertEqual(
                study_lib.learned_file_path(tmp).read_text(
                    encoding="utf-8"), before,
                "undo did not restore byte-exact")
            with self.assertRaises(study_lib.SubjectRemovalRefused):
                study_lib.undo_subject_removal(tmp, out["ms"])

    def test_undo_refused_after_her_own_edit(self):
        """Restoring the image over her later edit would erase her own
        hand — the one thing this family protects. Refused, file
        untouched, the kept lines stay kept."""
        with tempfile.TemporaryDirectory() as tmp:
            self._lib(tmp)
            out = study_lib.apply_subject_removal(
                tmp, "s", ["her clinic visits weigh on her."], now_ms=7)
            p = study_lib.learned_file_path(tmp)
            hers = p.read_text(encoding="utf-8") + "a line SHE added.\n"
            p.write_text(hers, encoding="utf-8")
            with self.assertRaises(study_lib.SubjectRemovalRefused):
                study_lib.undo_subject_removal(tmp, out["ms"])
            self.assertEqual(p.read_text(encoding="utf-8"), hers)
            self.assertEqual(
                study_lib.load_kept_back(tmp)["removals"][0]
                ["removed_lines"], ["her clinic visits weigh on her."],
                "the kept lines vanished with the refusal")

    def test_the_copy_lands_before_the_edit(self):
        """THE CRASH WINDOW, DRIVEN. atomic_write_bytes is made to die on
        the learned file only — the moment between the two writes. The
        kept-back entry must already be on disk and the learned file must
        be byte-unchanged: a copy beside an unedited file, never an edited
        file with no way back."""
        with tempfile.TemporaryDirectory() as tmp:
            before = self._lib(tmp)
            real = study_lib.atomic_write_bytes
            state = {"died": False}

            def dying(path, data):
                if str(path).endswith(study_lib.LEARNED_NAME):
                    state["died"] = True
                    raise OSError("driven crash between the two writes")
                return real(path, data)

            study_lib.atomic_write_bytes = dying
            try:
                with self.assertRaises(OSError):
                    study_lib.apply_subject_removal(
                        tmp, "s", ["she loves the sea."], now_ms=9)
            finally:
                study_lib.atomic_write_bytes = real
            self.assertTrue(state["died"], "the crash never fired — this "
                            "case proved nothing about the order")
            self.assertEqual(
                study_lib.learned_file_path(tmp).read_text(
                    encoding="utf-8"), before)
            kept = study_lib.load_kept_back(tmp)["removals"]
            self.assertEqual(len(kept), 1,
                             "the copy had NOT landed before the edit — "
                             "a crash here would have lost her lines")

    def test_nothing_is_lost_is_measured_not_assumed(self):
        """THE FALSE-COPY DRILL: the kept-back save is made to quietly drop
        one removed line. § E's flag must come back False — if it stays
        True, the flag reports the code having run, not the store holding
        the lines, and her sentence would lie exactly when she is told to
        trust it."""
        with tempfile.TemporaryDirectory() as tmp:
            self._lib(tmp)
            real = study_lib.save_kept_back
            state = {"mutated": False}

            def lossy(root, entries):
                entries = [dict(e) for e in entries]
                if entries and entries[-1].get("removed_lines"):
                    entries[-1]["removed_lines"] = \
                        entries[-1]["removed_lines"][:-1]
                    state["mutated"] = True
                return real(root, entries)

            study_lib.save_kept_back = lossy
            try:
                out = study_lib.apply_subject_removal(
                    tmp, "s", ["she loves the sea."], now_ms=11)
            finally:
                study_lib.save_kept_back = real
            self.assertTrue(state["mutated"],
                            "the mutation never landed — drill blind")
            self.assertFalse(out["nothing_is_lost"],
                             "the store dropped a line and § E's gate "
                             "stayed up — the flag is decorative")

    def test_nothing_to_remove_from_refuses(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(study_lib.SubjectRemovalRefused):
                study_lib.apply_subject_removal(tmp, "s", ["x"], now_ms=1)


_TOOLS_DIR = os.path.join(REPO, "tools")
if _TOOLS_DIR not in sys.path:
    sys.path.insert(0, _TOOLS_DIR)

import subject_finding_trial as FINDING    # noqa: E402


class FindingTrialTest(unittest.TestCase):
    """R-2's gate half: the pricing tool measures the slice it claims,
    refuses when it cannot prove that, and CANNOT send. Driven against a
    built fixture library — never her real one (this suite's own standing
    rule)."""

    def _fixture(self, lib):
        rows = [
            make_item(lib, 1, state="blessed", body="the sea again."),
            make_item(lib, 2, state="unseen", body="clinic on tuesday."),
            make_item(lib, 3, state="resting", body="RESTING-NEVER-READ"),
            make_item(lib, 4, state="never_show",
                      body="FENCED-SENTINEL-BODY",
                      title="FENCED-SENTINEL-TITLE"),
            make_item(lib, 5, state="blessed", body=b"".decode() + "img",
                      type_="image"),
        ]
        store = make_store(lib, rows)
        with open(os.path.join(lib, "items.json"), "w",
                  encoding="utf-8") as f:
            json.dump(store, f)
        return store

    def test_the_slice_is_what_it_claims_and_nothing_fenced_rides(self):
        with tempfile.TemporaryDirectory() as lib:
            self._fixture(lib)
            bodies, report = FINDING.build_slice(lib)
            self.assertEqual(report["pieces"], 2,
                             "the readable slice is the blessed and the "
                             "unseen text, exactly")
            self.assertEqual(report["resting_unread"], 1)
            self.assertEqual(report["images_unread"], 1)
            blob = json.dumps(bodies, ensure_ascii=False)
            self.assertNotIn("FENCED-SENTINEL-BODY", blob)
            self.assertNotIn("FENCED-SENTINEL-TITLE", blob)
            self.assertNotIn("RESTING-NEVER-READ", blob)
            chunks, total = FINDING.chunk_plan(bodies)
            self.assertEqual(len(chunks), 1)
            self.assertGreater(total, 0)

    def test_under_delivery_refuses_rather_than_prices(self):
        """THE NARROWED-LIFT DRILL: the fence builder is made to drop one
        body it should have delivered. The trial must REFUSE — a price
        for two thirds of her library looks identical to a price for all
        of it."""
        with tempfile.TemporaryDirectory() as lib:
            self._fixture(lib)
            real = study_lib.build_librarian_payload
            state = {"dropped": False}

            def lossy(*a, **kw):
                payload = real(*a, **kw)
                if payload.get("bodies"):
                    payload["bodies"] = payload["bodies"][1:]
                    state["dropped"] = True
                return payload

            study_lib.build_librarian_payload = lossy
            try:
                with self.assertRaises(FINDING.TrialRefused):
                    FINDING.build_slice(lib)
            finally:
                study_lib.build_librarian_payload = real
            self.assertTrue(state["dropped"],
                            "the mutation never landed — drill blind")

    def test_a_moved_library_refuses(self):
        with tempfile.TemporaryDirectory() as lib:
            self._fixture(lib)
            real = study_lib.build_librarian_payload

            def moving(*a, **kw):
                payload = real(*a, **kw)
                with open(os.path.join(lib, "items.json"), "a",
                          encoding="utf-8") as f:
                    f.write("\n")
                return payload

            study_lib.build_librarian_payload = moving
            try:
                with self.assertRaises(FINDING.TrialRefused):
                    FINDING.build_slice(lib)
            finally:
                study_lib.build_librarian_payload = real

    def test_price_sends_nothing_at_all(self):
        """⛔ THE TOOL CANNOT SEND, proved at the transport rather than
        asserted about the source: the seam's transport is replaced with
        a bomb for the whole run, and a full --price against the fixture
        must finish without tripping it."""
        with tempfile.TemporaryDirectory() as lib:
            self._fixture(lib)
            real = librarian_call._transport
            fired = {"n": 0}

            def bomb(*a, **kw):
                fired["n"] += 1
                raise AssertionError("the pricing tool reached the wire")

            librarian_call._transport = bomb
            try:
                rc = FINDING.main(["--price", "--library", lib])
            finally:
                librarian_call._transport = real
            self.assertEqual(rc, 0, "the trial refused the fixture")
            self.assertEqual(fired["n"], 0)

    def test_the_tool_has_no_sending_door(self):
        """And the static half: no --run, no --yes, no call_librarian —
        nothing that could be flipped into a send without a new door
        being written in the open."""
        import inspect
        src = inspect.getsource(FINDING)
        for needle in ('add_argument("--run"', 'add_argument("--yes"',
                       "call_librarian("):
            self.assertNotIn(needle, src,
                             "the pricing tool grew a sending door — "
                             "R-2 gates that on her priced word and her "
                             "rung ruling, in writing")


import subject_finding_run as RUNNER       # noqa: E402
from test_call_seam import (               # noqa: E402
    Recorder, ollama_body)


class FindingRunnerTest(unittest.TestCase):
    """The run half of R-2/R-9: through the seam, once per body ever,
    stopping on failure, landing proposals only when the reading is
    whole. Driven against a fixture library and a recording transport —
    nothing here can reach a wire or her real ledger (HOME is swapped for
    the life of every case)."""

    def setUp(self):
        self._tmp_home = tempfile.mkdtemp(prefix="study-room-aside-")
        self._saved_home = os.environ.get("HOME")
        os.environ["HOME"] = self._tmp_home
        self._saved_transport = librarian_call._transport

    def tearDown(self):
        librarian_call._transport = self._saved_transport
        if self._saved_home is None:
            os.environ.pop("HOME", None)
        else:
            os.environ["HOME"] = self._saved_home
        shutil.rmtree(self._tmp_home, ignore_errors=True)

    def _fixture(self, lib):
        rows = [
            make_item(lib, 1, state="blessed", body="the sea again."),
            make_item(lib, 2, state="unseen", body="clinic on tuesday."),
        ]
        store = make_store(lib, rows)
        with open(os.path.join(lib, "items.json"), "w",
                  encoding="utf-8") as f:
            json.dump(store, f)
        return [r["id"] for r in rows]

    def _ok_transport(self, subject_ids):
        body = ollama_body({"subjects": [
            {"name": "her clinic",
             "item_ids": list(subject_ids) + ["invented-id-000"]}]})
        return Recorder(status=200, body=body)

    def test_a_whole_run_lands_proposals_once_and_only_once(self):
        with tempfile.TemporaryDirectory() as lib, \
                tempfile.TemporaryDirectory() as scratch:
            ids = self._fixture(lib)
            state = os.path.join(scratch, "state.json")
            rec = Recorder(status=200, body=ollama_body({"subjects": [
                {"name": "her clinic",
                 "item_ids": [ids[1], "invented-id-000"]}]}))
            librarian_call._transport = rec
            rc = RUNNER.main(["--run", "--yes", "--library", lib,
                              "--state", state])
            self.assertEqual(rc, 0)
            self.assertEqual(len(rec.calls), 1,
                             "the fixture is one chunk — one call")
            landed = study_lib.load_subjects(lib)["subjects"]
            self.assertEqual(len(landed), 1)
            self.assertEqual(landed[0]["status"], "proposed",
                             "R-1: a finding is a PROPOSAL")
            self.assertEqual(landed[0]["item_ids"], [ids[1]],
                             "the invented id survived into the store")
            # ---- once, ever: a second word sends NOTHING ----------------
            rc2 = RUNNER.main(["--run", "--yes", "--library", lib,
                               "--state", state])
            self.assertEqual(rc2, 0)
            self.assertEqual(len(rec.calls), 1,
                             "a finished reading was read AGAIN")

    def test_no_yes_no_call(self):
        with tempfile.TemporaryDirectory() as lib, \
                tempfile.TemporaryDirectory() as scratch:
            self._fixture(lib)
            rec = Recorder(status=200, body=ollama_body({"subjects": []}))
            librarian_call._transport = rec
            rc = RUNNER.main(["--run", "--library", lib,
                              "--state", os.path.join(scratch, "s.json")])
            self.assertEqual(rc, 2)
            self.assertEqual(len(rec.calls), 0)

    def test_a_failure_stops_and_retry_needs_her_word(self):
        with tempfile.TemporaryDirectory() as lib, \
                tempfile.TemporaryDirectory() as scratch:
            ids = self._fixture(lib)
            state = os.path.join(scratch, "state.json")
            librarian_call._transport = Recorder(status=500, body=b"{}")
            rc = RUNNER.main(["--run", "--yes", "--library", lib,
                              "--state", state])
            self.assertEqual(rc, 1)
            self.assertEqual(study_lib.load_subjects(lib)["subjects"], [],
                             "a broken reading still landed proposals")
            # without her second word, the failed chunk is not re-sent
            rec2 = Recorder(status=200, body=ollama_body(
                {"subjects": [{"name": "n", "item_ids": [ids[0]]}]}))
            librarian_call._transport = rec2
            rc = RUNNER.main(["--run", "--yes", "--library", lib,
                              "--state", state])
            self.assertEqual(rc, 1)
            self.assertEqual(len(rec2.calls), 0,
                             "a maybe-billed chunk was re-sent without "
                             "--retry-failed")
            rc = RUNNER.main(["--run", "--yes", "--retry-failed",
                              "--library", lib, "--state", state])
            self.assertEqual(rc, 0)
            self.assertEqual(len(rec2.calls), 1)
            self.assertEqual(
                len(study_lib.load_subjects(lib)["subjects"]), 1)

    def test_a_moved_library_refuses_the_chunk(self):
        """The bytes sent must be the bytes priced: a store whose chunk
        document no longer matches the recorded SHA is refused, not
        silently re-read."""
        with tempfile.TemporaryDirectory() as lib, \
                tempfile.TemporaryDirectory() as scratch:
            self._fixture(lib)
            state = os.path.join(scratch, "state.json")
            rec = self._ok_transport([])
            librarian_call._transport = rec
            # first invocation writes the state, then dies before sending
            # (max-chunks 0), so the SHAs are pinned with nothing sent.
            rc = RUNNER.main(["--run", "--yes", "--library", lib,
                              "--state", state, "--max-chunks", "0"])
            self.assertEqual(rc, 0)
            self.assertEqual(len(rec.calls), 0)
            # her library changes under the pinned run
            item3 = make_item(lib, 9, state="blessed", body="new thing.")
            store = make_store(lib, [item3])
            with open(os.path.join(lib, "items.json"), "w",
                      encoding="utf-8") as f:
                json.dump(store, f)
            rc = RUNNER.main(["--run", "--yes", "--library", lib,
                              "--state", state])
            self.assertEqual(rc, 2)
            self.assertEqual(len(rec.calls), 0,
                             "bytes she never priced were sent")


import subject_merge_run as MERGE          # noqa: E402


class SubjectMergeTest(unittest.TestCase):
    """R-14's gates: the tidy sends the names it wrote and nothing else,
    refuses over her rulings, and code — not the model — owns
    completeness."""

    ENTRIES = [
        {"key": "a", "name": "Health concerns", "origin": "noticed",
         "item_ids": ["id-SENTINEL-A"], "status": "proposed", "ms": 1,
         "chunks": [0]},
        {"key": "b", "name": "Medical worries", "origin": "noticed",
         "item_ids": ["id-SENTINEL-B"], "status": "proposed", "ms": 1,
         "chunks": [1]},
        {"key": "c", "name": "Knitting joy", "origin": "noticed",
         "item_ids": ["id-SENTINEL-C"], "status": "proposed", "ms": 1,
         "chunks": [2]},
    ]

    def test_the_payload_is_names_only(self):
        """Her § G promise, gated: 'It does not read your things again.'
        Nothing but the numbered names may ride — no item id, no status,
        no key."""
        payload = MERGE.build_names_payload(
            [dict(e) for e in self.ENTRIES])
        self.assertIn("Health concerns", payload)
        for needle in ("id-SENTINEL-A", "id-SENTINEL-B", "id-SENTINEL-C",
                       "proposed", "chunks", "item_ids"):
            self.assertNotIn(needle, payload,
                             f"the tidy payload carries {needle!r} — her "
                             f"§ G sentence just became a lie")

    def test_refuses_over_her_rulings(self):
        entries = [dict(e) for e in self.ENTRIES]
        entries[1]["status"] = "aside"
        with self.assertRaises(MERGE.MergeRefused):
            MERGE.build_names_payload(entries)

    def test_code_owns_completeness(self):
        """An unmentioned index survives as its own group; a duplicated or
        invented index is dropped, first mention wins; ids and provenance
        union up."""
        entries = [dict(e) for e in self.ENTRIES]
        groups = [
            {"name": "Health", "members": [0, 1, 1, 99]},
            # index 2 never mentioned anywhere
        ]
        merged, counts = MERGE.apply_groups(entries, groups)
        self.assertEqual(counts["after"], 2)
        self.assertEqual(counts["dropped_bad_index"], 2)
        health = next(m for m in merged if m["name"] == "Health")
        self.assertEqual(sorted(health["item_ids"]),
                         ["id-SENTINEL-A", "id-SENTINEL-B"])
        self.assertEqual(sorted(health["merged_from"]),
                         ["Health concerns", "Medical worries"])
        alone = next(m for m in merged if m["name"] == "Knitting joy")
        self.assertEqual(alone["item_ids"], ["id-SENTINEL-C"],
                         "the unmentioned subject was lost — the model "
                         "owned completeness after all")
        self.assertEqual(alone["status"], "proposed")

    def test_a_failed_call_leaves_the_list_untouched(self):
        with tempfile.TemporaryDirectory() as lib, \
                tempfile.TemporaryDirectory() as home:
            saved_home = os.environ.get("HOME")
            os.environ["HOME"] = home
            saved = librarian_call._transport
            librarian_call._transport = Recorder(status=500, body=b"{}")
            try:
                study_lib.save_subjects(
                    lib, [dict(e) for e in self.ENTRIES])
                rc = MERGE.main(["--run", "--yes", "--library", lib])
            finally:
                librarian_call._transport = saved
                if saved_home is None:
                    os.environ.pop("HOME", None)
                else:
                    os.environ["HOME"] = saved_home
            self.assertEqual(rc, 1)
            after = study_lib.load_subjects(lib)["subjects"]
            self.assertEqual([e["name"] for e in after],
                             [e["name"] for e in self.ENTRIES],
                             "a failed tidy still rewrote her list")

    def test_a_whole_tidy_folds_and_keeps_provenance(self):
        with tempfile.TemporaryDirectory() as lib, \
                tempfile.TemporaryDirectory() as home:
            saved_home = os.environ.get("HOME")
            os.environ["HOME"] = home
            saved = librarian_call._transport
            librarian_call._transport = Recorder(
                status=200, body=ollama_body({"groups": [
                    {"name": "Health", "members": [0, 1]}]}))
            try:
                study_lib.save_subjects(
                    lib, [dict(e) for e in self.ENTRIES])
                rc = MERGE.main(["--run", "--yes", "--library", lib])
            finally:
                librarian_call._transport = saved
                if saved_home is None:
                    os.environ.pop("HOME", None)
                else:
                    os.environ["HOME"] = saved_home
            self.assertEqual(rc, 0)
            after = study_lib.load_subjects(lib)["subjects"]
            self.assertEqual(len(after), 2)


import http.client                          # noqa: E402
import threading                            # noqa: E402
from pathlib import Path                    # noqa: E402


class SubjectRoutesTest(unittest.TestCase):
    """The set-aside routes over a REAL ThreadingHTTPServer on a temp
    library (the SessionFlow harness shape): her words served verbatim,
    her verdict writing the fifth class, § C said once, § B's door never
    answering no — and the vision reading of a newly aside thing
    forgotten, exactly like every other way into the fence."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = os.path.join(self._tmp.name, "library")
        os.makedirs(self.lib)
        self.httpd = server.create_server(Path(self.lib), 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(
            target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        self._tmp.cleanup()

    def _req(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port,
                                          timeout=30)
        try:
            if body is not None:
                conn.request(method, path,
                             json.dumps(body).encode("utf-8"),
                             {"Content-Type": "application/json"})
            else:
                conn.request(method, path)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read() or b"{}")
        finally:
            conn.close()

    def _seed(self):
        rows = [make_item(self.lib, 1, state="blessed", body="sea."),
                make_item(self.lib, 2, state="blessed", body="clinic.")]
        store = make_store(self.lib, rows)
        study_lib.save_store(self.lib, store)
        study_lib.save_subjects(self.lib, [
            {"key": "clinic", "name": "her clinic", "origin": "noticed",
             "item_ids": [rows[1]["id"]], "status": "proposed", "ms": 1,
             "chunks": [0]},
            {"key": "sea", "name": "the sea", "origin": "noticed",
             "item_ids": [rows[0]["id"]], "status": "proposed", "ms": 1,
             "chunks": [0]},
        ])
        return rows

    def test_her_words_ride_verbatim_and_e_does_not(self):
        self._seed()
        status, data = self._req("GET", "/api/subjects")
        self.assertEqual(status, 200)
        self.assertEqual(data["words"]["offer"],
                         server.SUBJECT_WORDS["offer"])
        self.assertEqual(data["words"]["name_prompt"],
                         server.SUBJECT_WORDS["name_prompt"])
        self.assertEqual(data["words"]["reassure_once"],
                         server.SUBJECT_WORDS["reassure_once"])
        self.assertEqual(data["words"]["found"],
                         server.SUBJECT_WORDS["found"])
        self.assertNotIn("removed", data["words"],
                         "§ E rode a read with no proven removal behind "
                         "it — that sentence renders only over the proof")
        self.assertTrue(data["first_time"])
        self.assertEqual(len(data["subjects"]), 2)

    def test_her_verdict_writes_the_fifth_class_and_c_is_said_once(self):
        rows = self._seed()
        # a vision reading standing on the clinic item, to be forgotten
        vdir = study_lib.vision_dir_path(self.lib)
        vdir.mkdir(parents=True, exist_ok=True)
        ventry = study_lib.vision_entry_path(self.lib, rows[1]["id"])
        ventry.write_text("{}", encoding="utf-8")
        status, data = self._req("POST", "/api/subjects/rule",
                                 {"key": "clinic", "verdict": "aside"})
        self.assertEqual(status, 200)
        self.assertEqual(data["marked"], 1)
        self.assertTrue(data.get("say_reassurance"),
                        "the FIRST set-aside did not carry § C's flag")
        store = study_lib.load_store(self.lib)
        item = store["items"][rows[1]["id"]]
        self.assertEqual(item["aside"], ["clinic"])
        self.assertTrue(study_lib._librarian_fenced(item, []),
                        "her verdict did not fence the item")
        self.assertFalse(ventry.exists(),
                         "the room kept its reading of a thing she set "
                         "aside — the handle_state consequence was lost")
        # the second set-aside: § C is NOT said again (her ruling: once)
        status, data = self._req("POST", "/api/subjects/rule",
                                 {"key": "sea", "verdict": "aside"})
        self.assertEqual(status, 200)
        self.assertFalse(data.get("say_reassurance", False),
                         "§ C said twice — she ruled once, the first time")

    def test_declined_marks_nothing_and_can_still_become_aside(self):
        rows = self._seed()
        status, data = self._req("POST", "/api/subjects/rule",
                                 {"key": "clinic", "verdict": "declined"})
        self.assertEqual(status, 200)
        store = study_lib.load_store(self.lib)
        self.assertNotIn("aside", store["items"][rows[1]["id"]],
                         "a declined subject fenced something anyway")
        # R-7: a no is not forever — she may set it aside later after all
        status, data = self._req("POST", "/api/subjects/rule",
                                 {"key": "clinic", "verdict": "aside"})
        self.assertEqual(status, 200)
        self.assertEqual(data["marked"], 1)

    def test_her_own_door_matches_or_records_and_never_answers_no(self):
        self._seed()
        status, data = self._req("POST", "/api/subjects/name",
                                 {"text": "CLINIC"})
        self.assertEqual(status, 200)
        self.assertEqual(data["keys"], ["clinic"],
                         "her named subject did not reach the kept "
                         "findings (R-9: matched without reading)")
        status, data = self._req("POST", "/api/subjects/name",
                                 {"text": "枕头下的日记"})
        self.assertEqual(status, 200)
        self.assertEqual(len(data["keys"]), 1)
        entries = study_lib.load_subjects(self.lib)["subjects"]
        named = [e for e in entries if e.get("origin") == "named"]
        self.assertEqual(len(named), 1)
        self.assertEqual(named[0]["name"], "枕头下的日记",
                         "her own words did not land verbatim")

    def test_aside_reports_the_clearing_outcome_honestly(self):
        """R-16 wired the clearing into the aside verdict; #138 binds the
        report. In this harness no reader can answer, so `cleared` MUST
        come back False — a True here would be the call having returned
        being mistaken for the notebook having been cleared."""
        self._seed()
        status, data = self._req("POST", "/api/subjects/rule",
                                 {"key": "clinic", "verdict": "aside"})
        self.assertEqual(status, 200)
        self.assertIn("clearing", data,
                      "the aside verdict said nothing about the "
                      "notebook — the outcome is named, never implied")
        self.assertFalse(data["clearing"]["cleared"])
        # and her verdict LANDED regardless: a clearing failure never
        # unsaves her ruling
        entries = study_lib.load_subjects(self.lib)["subjects"]
        self.assertEqual(
            [e["status"] for e in entries if e["key"] == "clinic"],
            ["aside"])

    def _seed_aside_with_removal(self):
        """An aside subject with a REAL proven removal behind it — made
        by the shipped engine, never hand-forged, so `proof` means what
        it means in production."""
        rows = self._seed()
        os.makedirs(os.path.join(self.lib, "librarian"), exist_ok=True)
        study_lib.learned_file_path(self.lib).write_text(
            study_lib.LEARNED_HEADER_RETIRED +
            "her clinic visits weigh on her.\n"
            "she knits through the winter.\n", encoding="utf-8")
        entries = study_lib.load_subjects(self.lib)["subjects"]
        for e in entries:
            if e["key"] == "clinic":
                e["status"] = "aside"
        study_lib.save_subjects(self.lib, entries)
        out = study_lib.apply_subject_removal(
            self.lib, "clinic",
            ["her clinic visits weigh on her."], now_ms=77)
        self.assertTrue(out["nothing_is_lost"])
        return rows, out

    def test_e_serves_only_over_proof_and_put_back_works(self):
        self._seed_aside_with_removal()
        status, data = self._req("GET", "/api/subjects")
        self.assertEqual(status, 200)
        self.assertEqual(data["words"]["removed"],
                         server.SUBJECT_WORDS["removed"],
                         "§ E did not ride beside a proven removal")
        clinic = [s for s in data["subjects"]
                  if s["key"] == "clinic"][0]
        self.assertEqual(len(clinic["removals"]), 1)
        self.assertEqual(clinic["removals"][0]["lines"],
                         [{"text": "her clinic visits weigh on her.",
                           "back": False}])
        # her put-back door, line grain
        status, data = self._req(
            "POST", "/api/subjects/putback",
            {"ms": 77, "lines": ["her clinic visits weigh on her."]})
        self.assertEqual(status, 200)
        self.assertTrue(data["landed"])
        self.assertIn("her clinic visits weigh on her.",
                      study_lib.learned_file_path(self.lib).read_text(
                          encoding="utf-8"))
        status, data = self._req("GET", "/api/subjects")
        clinic = [s for s in data["subjects"]
                  if s["key"] == "clinic"][0]
        self.assertEqual(clinic["removals"][0]["lines"][0]["back"], True)

    def test_e_withheld_when_the_proof_is_not_there(self):
        """THE GATE, DRIVEN FROM THE SERVE SIDE: flip the persisted proof
        off and § E must vanish whole — the sentence AND the lines. The
        failure direction is her sentence unsaid, never her sentence
        lying."""
        self._seed_aside_with_removal()
        kept = study_lib.load_kept_back(self.lib)["removals"]
        kept[0]["proof"] = False
        study_lib.save_kept_back(self.lib, kept)
        status, data = self._req("GET", "/api/subjects")
        self.assertEqual(status, 200)
        self.assertNotIn("removed", data["words"])
        clinic = [s for s in data["subjects"]
                  if s["key"] == "clinic"][0]
        self.assertEqual(clinic["removals"], [])

    def test_e_withheld_when_the_kept_entry_stops_holding(self):
        """`nothing is lost` compares CONTENT: a kept entry whose
        before-image no longer matches its own recorded digest is not
        holding what it claims, and § E may not say so."""
        self._seed_aside_with_removal()
        kept = study_lib.load_kept_back(self.lib)["removals"]
        kept[0]["before_text"] = kept[0]["before_text"] + "drifted"
        study_lib.save_kept_back(self.lib, kept)
        status, data = self._req("GET", "/api/subjects")
        self.assertNotIn("removed", data["words"])


class ClearingJobRowTest(unittest.TestCase):
    """R-16 and her § I words: the clearing pass's row (the F6 sitting)."""

    def test_her_two_room_words_byte_for_byte(self):
        name, sentence = server.JOB_ROOM_WORDS["subject_clearing"]
        self.assertEqual(name, HER_CLEARING_NAME,
                         "her § I name drifted — it ships as she took it")
        self.assertEqual(sentence, HER_CLEARING_SENTENCE,
                         "her § I sentence drifted — it ships as she "
                         "took it")

    def test_the_rows_operational_values(self):
        """⚠ The tier is HERS (R-16 — the cheaper reader, named with its
        price in the option she took); the retries are the merge row's
        reason (a re-ask re-reads nothing of hers and costs a fraction
        of a cent — NOT the once-pass money case)."""
        row = librarian_call.JOBS["subject_clearing"]
        self.assertEqual(row["tier"], "cheap-cloud",
                         "the tier is hers — R-16 named the cheaper "
                         "reader; moving it is overruling her")
        self.assertEqual(row["retries"], 2)
        self.assertTrue(row["permitted_local"])
        self.assertEqual(row["max_tokens"], 2000,
                         "a SPEND, stated by value in the row's comment")

    def test_the_schema_carries_no_free_text_about_her(self):
        """⛔ R-11's unasked-portrait discipline, again: the answer is
        line INDICES and nothing else. A `why` slot would be a second
        portrait arriving unasked."""
        schema = json.loads(librarian_call.JOBS["subject_clearing"]
                            ["schema"])
        self.assertEqual(sorted(schema["properties"]), ["lines"])
        self.assertIs(schema["additionalProperties"], False)
        self.assertEqual(schema["properties"]["lines"]["items"]["type"],
                         "integer")


class ClearingPayloadTest(unittest.TestCase):
    """§ I's first promise: `going through its own notebook` — the
    payload is the notebook the room itself wrote plus the subject's
    model-written names, AND NOTHING ELSE."""

    NOTEBOOK = ("she loves the sea.",
                "her clinic visits weigh on her.",
                "she knits through the winter.")
    SUBJECT = {"key": "clinic-key", "name": "her clinic",
               "origin": "noticed", "status": "aside",
               "item_ids": ["it-000777"],
               "merged_from": ["clinic visits", "身体与诊所"]}

    def _lib(self, tmp):
        os.makedirs(os.path.join(tmp, "librarian"), exist_ok=True)
        text = study_lib.LEARNED_HEADER_RETIRED \
            + "\n".join(self.NOTEBOOK) + "\n"
        study_lib.learned_file_path(tmp).write_text(
            text, encoding="utf-8")
        return text

    def test_payload_is_notebook_and_names_only(self):
        """The item id in the subject entry is a CANARY: it stands right
        beside the names in the entry, and the § I promise is that it
        never rides."""
        with tempfile.TemporaryDirectory() as tmp:
            self._lib(tmp)
            payload, index_map = server.build_clearing_payload(
                tmp, dict(self.SUBJECT))
            for ln in self.NOTEBOOK:
                self.assertIn(ln, payload)
            for name in ("her clinic", "clinic-key", "clinic visits",
                         "身体与诊所"):
                self.assertIn(name, payload)
            self.assertNotIn("it-000777", payload,
                             "an item id rode the clearing payload — "
                             "her § I sentence is now a broken promise")
            doc = json.loads(payload)
            self.assertEqual(sorted(doc), ["notebook", "subject"])
            self.assertEqual(sorted(doc["subject"]), ["names"])
            for row in doc["notebook"]:
                self.assertEqual(sorted(row), ["i", "line"])

    def test_header_and_blank_lines_never_ride(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._lib(tmp)
            payload, index_map = server.build_clearing_payload(
                tmp, dict(self.SUBJECT))
            self.assertNotIn("what the room learned", payload,
                             "the header's own lines are chrome, not "
                             "learned lines")
            for ln in index_map.values():
                self.assertTrue(ln.strip())

    def test_indices_map_to_exact_file_lines(self):
        """The removal engine demands byte-for-byte lines; an index that
        maps to anything but the file's own line at that position would
        make the engine refuse (best case) or remove the wrong line."""
        with tempfile.TemporaryDirectory() as tmp:
            text = self._lib(tmp)
            _, index_map = server.build_clearing_payload(
                tmp, dict(self.SUBJECT))
            file_lines = text.split("\n")
            for i, ln in index_map.items():
                self.assertEqual(file_lines[i], ln)

    def test_no_notebook_refuses(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(server.ClearingRefused):
                server.build_clearing_payload(tmp, dict(self.SUBJECT))


class ClearingRunTest(unittest.TestCase):
    """R-16 through the seam boundary, the reader stubbed at
    `server.record_call` — and HONEST ABOUT ARRIVALS (#138): `cleared`
    only ever reports the engine having run and proved."""

    def _lib(self, tmp):
        os.makedirs(os.path.join(tmp, "librarian"), exist_ok=True)
        text = study_lib.LEARNED_HEADER_RETIRED + "\n".join(
            ClearingPayloadTest.NOTEBOOK) + "\n"
        study_lib.learned_file_path(tmp).write_text(
            text, encoding="utf-8")
        return text

    def _run(self, tmp, canned):
        real = server.record_call
        seen = {}

        def stub(job, payload_text, routing):
            seen["job"] = job
            seen["payload"] = payload_text
            return canned

        server.record_call = stub
        try:
            out = server.run_subject_clearing(
                tmp, dict(ClearingPayloadTest.SUBJECT), routing=None)
        finally:
            server.record_call = real
        self.assertEqual(seen.get("job"), "subject_clearing",
                         "the run never reached the seam stub")
        return out

    def _clinic_index(self, tmp):
        _, index_map = server.build_clearing_payload(
            tmp, dict(ClearingPayloadTest.SUBJECT))
        return [i for i, ln in index_map.items() if "clinic" in ln][0]

    def test_a_good_answer_clears_kept_first_and_proved(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._lib(tmp)
            i = self._clinic_index(tmp)
            out = self._run(tmp, {"ok": True,
                                  "structured": {"lines": [i]}})
            self.assertTrue(out["cleared"])
            removal = out["removal"]
            self.assertTrue(removal["nothing_is_lost"])
            self.assertEqual(removal["removed_lines"],
                             ["her clinic visits weigh on her."])
            on_disk = study_lib.learned_file_path(tmp).read_text(
                encoding="utf-8")
            self.assertNotIn("clinic", on_disk)
            kept = study_lib.load_kept_back(tmp)["removals"]
            self.assertEqual(len(kept), 1)
            self.assertEqual(kept[0]["subject"], "clinic-key")
            self.assertIs(kept[0]["proof"], True,
                          "the proof was not persisted — § E has nothing "
                          "to render over at serve time")

    def test_bad_and_duplicate_indices_dropped_and_counted(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._lib(tmp)
            i = self._clinic_index(tmp)
            out = self._run(tmp, {"ok": True, "structured":
                                  {"lines": [i, i, 9999]}})
            self.assertTrue(out["cleared"])
            self.assertEqual(out["dropped_bad_index"], 2,
                             "an invented or doubled index must be "
                             "dropped AND counted out loud")

    def test_an_empty_answer_clears_nothing_and_says_so(self):
        with tempfile.TemporaryDirectory() as tmp:
            before = self._lib(tmp)
            out = self._run(tmp, {"ok": True,
                                  "structured": {"lines": []}})
            self.assertFalse(out["cleared"])
            self.assertTrue(out["nothing_found"])
            self.assertEqual(study_lib.learned_file_path(tmp).read_text(
                encoding="utf-8"), before)
            self.assertEqual(study_lib.load_kept_back(tmp)["removals"],
                             [])

    def test_a_failed_call_lands_nothing_and_is_named(self):
        with tempfile.TemporaryDirectory() as tmp:
            before = self._lib(tmp)
            out = self._run(tmp, {"ok": False,
                                  "failure": "provider_down"})
            self.assertFalse(out["cleared"])
            self.assertIn("provider_down", out["failure"])
            self.assertEqual(study_lib.learned_file_path(tmp).read_text(
                encoding="utf-8"), before,
                "a failed call still edited the notebook")


class PutBackTest(unittest.TestCase):
    """Her § E `put any of it back` and § I `so you can put it back` —
    LINE GRAIN (R-17's note: `any of it` at removal grain only would
    make both sentences overclaim). All-or-refuse, refusing over her
    later edits exactly as the whole undo refuses."""

    LINES = SubjectRemovalTest.LINES

    def _lib(self, tmp):
        os.makedirs(os.path.join(tmp, "librarian"), exist_ok=True)
        text = study_lib.LEARNED_HEADER_RETIRED \
            + "\n".join(self.LINES) + "\n"
        study_lib.learned_file_path(tmp).write_text(
            text, encoding="utf-8")
        return text

    def _removed_both(self, tmp):
        return study_lib.apply_subject_removal(
            tmp, "s",
            ["her clinic visits weigh on her.", "she loves the sea."],
            now_ms=7)

    def test_one_line_back_at_its_original_place(self):
        with tempfile.TemporaryDirectory() as tmp:
            before = self._lib(tmp)
            out = self._removed_both(tmp)
            back = study_lib.put_back_lines(
                tmp, out["ms"], ["her clinic visits weigh on her."])
            self.assertTrue(back["landed"])
            self.assertEqual(back["still_removed"],
                             ["she loves the sea.",
                              "she loves the sea."])
            expected = before.replace(
                study_lib.LEARNED_HEADER_RETIRED,
                study_lib.LEARNED_HEADER, 1)
            expected = "\n".join(
                ln for ln in expected.split("\n")
                if ln != "she loves the sea.")
            self.assertEqual(
                study_lib.learned_file_path(tmp).read_text(
                    encoding="utf-8"), expected,
                "the line did not come back at its own place")

    def test_every_line_back_restores_her_words_not_the_old_header(self):
        """Putting everything back returns every WORD the removal took;
        the header that stopped lying stays — it was never hers and
        putting the retired sentence back would make the file lie."""
        with tempfile.TemporaryDirectory() as tmp:
            before = self._lib(tmp)
            out = self._removed_both(tmp)
            study_lib.put_back_lines(
                tmp, out["ms"],
                ["her clinic visits weigh on her.", "she loves the sea."])
            expected = before.replace(
                study_lib.LEARNED_HEADER_RETIRED,
                study_lib.LEARNED_HEADER, 1)
            self.assertEqual(
                study_lib.learned_file_path(tmp).read_text(
                    encoding="utf-8"), expected)

    def test_a_stranger_line_refuses_the_whole_put_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._lib(tmp)
            out = self._removed_both(tmp)
            p = study_lib.learned_file_path(tmp)
            mid = p.read_text(encoding="utf-8")
            with self.assertRaises(study_lib.SubjectRemovalRefused):
                study_lib.put_back_lines(
                    tmp, out["ms"],
                    ["she loves the sea.", "never taken out"])
            self.assertEqual(p.read_text(encoding="utf-8"), mid,
                             "a refused put-back still edited the file")

    def test_a_line_already_back_refuses(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._lib(tmp)
            out = self._removed_both(tmp)
            study_lib.put_back_lines(
                tmp, out["ms"], ["her clinic visits weigh on her."])
            with self.assertRaises(study_lib.SubjectRemovalRefused):
                study_lib.put_back_lines(
                    tmp, out["ms"], ["her clinic visits weigh on her."])

    def test_refused_over_her_later_edit(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._lib(tmp)
            out = self._removed_both(tmp)
            p = study_lib.learned_file_path(tmp)
            hers = p.read_text(encoding="utf-8") + "a line SHE added.\n"
            p.write_text(hers, encoding="utf-8")
            with self.assertRaises(study_lib.SubjectRemovalRefused):
                study_lib.put_back_lines(
                    tmp, out["ms"], ["she loves the sea."])
            self.assertEqual(p.read_text(encoding="utf-8"), hers,
                             "the put-back wrote over her own hand")

    def test_unknown_stamp_and_whole_undone_refuse(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._lib(tmp)
            out = self._removed_both(tmp)
            with self.assertRaises(study_lib.SubjectRemovalRefused):
                study_lib.put_back_lines(tmp, 999, ["she loves the sea."])
            study_lib.undo_subject_removal(tmp, out["ms"])
            with self.assertRaises(study_lib.SubjectRemovalRefused):
                study_lib.put_back_lines(
                    tmp, out["ms"], ["she loves the sea."])


class NewWordsPinTest(unittest.TestCase):
    """§ J and § K ride SUBJECT_WORDS byte-for-byte."""

    def test_her_sentences_byte_for_byte(self):
        self.assertEqual(server.SUBJECT_WORDS["empty_named"],
                         HER_EMPTY_NAMED,
                         "her § J sentence drifted")
        self.assertEqual(server.SUBJECT_WORDS["clearing_failed"],
                         HER_CLEARING_FAILED,
                         "her § K sentence drifted")


class NeedsRetryTest(unittest.TestCase):
    """R-20's one spelling: retry only a clearing that NEVER landed."""

    def test_the_truth_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, "librarian"), exist_ok=True)
            aside = {"key": "k", "status": "aside"}
            self.assertTrue(
                server.clearing_needs_retry(tmp, dict(aside)),
                "an aside subject with no record at all owes a retry")
            self.assertTrue(
                server.clearing_needs_retry(
                    tmp, dict(aside, clearing={"state": "failed"})),
                "a failed clearing owes a retry — that is R-20")
            self.assertFalse(
                server.clearing_needs_retry(
                    tmp, dict(aside,
                              clearing={"state": "nothing_found"})),
                "nothing-found is an ANSWER — retrying it spends her "
                "money to re-hear what the room already holds")
            self.assertFalse(
                server.clearing_needs_retry(tmp, {"key": "k",
                                                  "status": "proposed"}),
                "only an aside subject can owe a clearing")
            self.assertFalse(server.clearing_needs_retry(tmp, None))

    def test_a_kept_entry_means_it_landed_even_undone(self):
        """A removal she UNDID is not a failure — the clearing landed,
        she changed her mind, and a retry would re-remove what she just
        put back."""
        with tempfile.TemporaryDirectory() as tmp:
            os.makedirs(os.path.join(tmp, "librarian"), exist_ok=True)
            study_lib.save_kept_back(tmp, [
                {"subject": "k", "ms": 1, "removed_lines": ["x"],
                 "undone": True}])
            self.assertFalse(
                server.clearing_needs_retry(
                    tmp, {"key": "k", "status": "aside"}))


class ResumeAndRetryRoutesTest(unittest.TestCase):
    """R-18 (turning back on), R-19 (declined stay hers to change),
    R-20 (the page-visit retry) and § J's serve — over the real server,
    the SubjectRoutesTest harness shape."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = os.path.join(self._tmp.name, "library")
        os.makedirs(self.lib)
        self.httpd = server.create_server(Path(self.lib), 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(
            target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)
        self._tmp.cleanup()

    def _req(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port,
                                          timeout=30)
        try:
            if body is not None:
                conn.request(method, path,
                             json.dumps(body).encode("utf-8"),
                             {"Content-Type": "application/json"})
            else:
                conn.request(method, path)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read() or b"{}")
        finally:
            conn.close()

    def _seed(self):
        rows = [make_item(self.lib, 1, state="blessed", body="sea."),
                make_item(self.lib, 2, state="blessed", body="clinic.")]
        store = make_store(self.lib, rows)
        study_lib.save_store(self.lib, store)
        study_lib.save_subjects(self.lib, [
            {"key": "clinic", "name": "her clinic", "origin": "noticed",
             "item_ids": [rows[1]["id"]], "status": "proposed", "ms": 1,
             "chunks": [0]},
            {"key": "sea", "name": "the sea", "origin": "noticed",
             "item_ids": [rows[0]["id"]], "status": "proposed", "ms": 1,
             "chunks": [0]},
        ])
        return rows

    def test_resume_unmarks_and_never_touches_the_notebook(self):
        """R-18: the marks come off and the librarian may read again;
        the notebook and the kept-back store are byte-untouched — the
        two are separate controls BY HER WORD."""
        rows = self._seed()
        os.makedirs(os.path.join(self.lib, "librarian"), exist_ok=True)
        notebook = study_lib.LEARNED_HEADER + "a surviving line.\n"
        study_lib.learned_file_path(self.lib).write_text(
            notebook, encoding="utf-8")
        self._req("POST", "/api/subjects/rule",
                  {"key": "clinic", "verdict": "aside"})
        store = study_lib.load_store(self.lib)
        self.assertEqual(store["items"][rows[1]["id"]]["aside"],
                         ["clinic"])
        status, data = self._req("POST", "/api/subjects/rule",
                                 {"key": "clinic", "verdict": "resume"})
        self.assertEqual(status, 200)
        self.assertEqual(data["unmarked"], 1)
        store = study_lib.load_store(self.lib)
        item = store["items"][rows[1]["id"]]
        self.assertNotIn("aside", item,
                         "the mark stayed — the librarian is still "
                         "fenced off a subject she turned back on")
        self.assertFalse(study_lib._librarian_fenced(item, []))
        entries = study_lib.load_subjects(self.lib)["subjects"]
        clinic = [e for e in entries if e["key"] == "clinic"][0]
        self.assertEqual(clinic["status"], "resumed")
        self.assertTrue(clinic["ever_aside"])
        self.assertEqual(
            study_lib.learned_file_path(self.lib).read_text(
                encoding="utf-8"), notebook,
            "resume touched the notebook — R-18 keeps them separate")

    def test_resume_refused_on_a_subject_not_aside(self):
        self._seed()
        status, _ = self._req("POST", "/api/subjects/rule",
                              {"key": "clinic", "verdict": "resume"})
        self.assertEqual(status, 400)

    def test_c_is_never_first_time_again_after_a_resume(self):
        """R-18's mechanical note: § C is said once EVER. Turning her
        only aside subject back on must not make the room treat the
        next set-aside as her first."""
        self._seed()
        self._req("POST", "/api/subjects/rule",
                  {"key": "clinic", "verdict": "aside"})
        self._req("POST", "/api/subjects/rule",
                  {"key": "clinic", "verdict": "resume"})
        status, data = self._req("POST", "/api/subjects/rule",
                                 {"key": "sea", "verdict": "aside"})
        self.assertEqual(status, 200)
        self.assertFalse(data.get("say_reassurance", False),
                         "§ C said twice — ever_aside did not survive "
                         "the resume")
        status, data = self._req("GET", "/api/subjects")
        self.assertFalse(data["first_time"])

    def test_j_rides_and_k_rides_only_over_a_real_failure(self):
        """§ J always (an ordinary moment); § K only when some clearing
        actually failed to land — never over nothing-found (R-20)."""
        self._seed()
        status, data = self._req("GET", "/api/subjects")
        self.assertEqual(data["words"]["empty_named"], HER_EMPTY_NAMED)
        self.assertNotIn("clearing_failed", data["words"],
                         "§ K rode with no failure behind it")
        entries = study_lib.load_subjects(self.lib)["subjects"]
        for e in entries:
            if e["key"] == "clinic":
                e["status"] = "aside"
                e["ever_aside"] = True
                e["clearing"] = {"state": "failed", "ms": 1}
        study_lib.save_subjects(self.lib, entries)
        status, data = self._req("GET", "/api/subjects")
        self.assertEqual(data["words"]["clearing_failed"],
                         HER_CLEARING_FAILED)
        clinic = [s for s in data["subjects"]
                  if s["key"] == "clinic"][0]
        self.assertTrue(clinic["clearing_needs_retry"])
        for e in entries:
            if e["key"] == "clinic":
                e["clearing"] = {"state": "nothing_found", "ms": 1}
        study_lib.save_subjects(self.lib, entries)
        status, data = self._req("GET", "/api/subjects")
        self.assertNotIn("clearing_failed", data["words"])
        clinic = [s for s in data["subjects"]
                  if s["key"] == "clinic"][0]
        self.assertFalse(clinic["clearing_needs_retry"])

    def test_clear_route_refuses_outside_r20_and_lands_inside_it(self):
        """The retry route: 400 when nothing is owed; a real re-run —
        the reader stubbed at the module seam — when a failed clearing
        stands. The stub also proves the harness never reaches a real
        provider from this test."""
        self._seed()
        status, _ = self._req("POST", "/api/subjects/clear",
                              {"key": "clinic"})
        self.assertEqual(status, 400,
                         "a subject not aside took a retry")
        os.makedirs(os.path.join(self.lib, "librarian"), exist_ok=True)
        study_lib.learned_file_path(self.lib).write_text(
            study_lib.LEARNED_HEADER_RETIRED +
            "her clinic visits weigh on her.\n", encoding="utf-8")
        entries = study_lib.load_subjects(self.lib)["subjects"]
        for e in entries:
            if e["key"] == "clinic":
                e["status"] = "aside"
                e["ever_aside"] = True
                e["clearing"] = {"state": "failed", "ms": 1}
        study_lib.save_subjects(self.lib, entries)
        _, index_map = server.build_clearing_payload(
            self.lib, {"key": "clinic", "name": "her clinic"})
        idx = list(index_map)[0]
        real = server.record_call

        def stub(job, payload_text, routing):
            return {"ok": True, "structured": {"lines": [idx]}}

        server.record_call = stub
        try:
            status, data = self._req("POST", "/api/subjects/clear",
                                     {"key": "clinic"})
        finally:
            server.record_call = real
        self.assertEqual(status, 200)
        self.assertTrue(data["cleared"])
        entries = study_lib.load_subjects(self.lib)["subjects"]
        clinic = [e for e in entries if e["key"] == "clinic"][0]
        self.assertEqual(clinic["clearing"]["state"], "cleared")
        status, _ = self._req("POST", "/api/subjects/clear",
                              {"key": "clinic"})
        self.assertEqual(status, 400,
                         "a landed clearing took a second retry — "
                         "kept-back is the landed record and it stands")

    def test_re_aside_after_a_landed_clearing_never_reads_again(self):
        """The same one spelling gates the rule route: a subject turned
        off and asided AGAIN already has its kept-back record — a second
        reading would spend her money to re-hear it, and could re-remove
        a line she has since put back (overruling her § E ruling). The
        seam stub RAISES, so a reach would fail loudly, not silently."""
        self._seed()
        os.makedirs(os.path.join(self.lib, "librarian"), exist_ok=True)
        study_lib.learned_file_path(self.lib).write_text(
            study_lib.LEARNED_HEADER_RETIRED +
            "her clinic visits weigh on her.\n", encoding="utf-8")
        study_lib.save_kept_back(self.lib, [
            {"subject": "clinic", "ms": 5, "removed_lines": ["x"],
             "before_text": "x", "before_sha256": "", "undone": False,
             "proof": True}])
        real = server.record_call

        def bomb(job, payload_text, routing):
            raise AssertionError("the seam was reached — a landed "
                                 "clearing was re-bought")

        server.record_call = bomb
        try:
            self._req("POST", "/api/subjects/rule",
                      {"key": "clinic", "verdict": "aside"})
            self._req("POST", "/api/subjects/rule",
                      {"key": "clinic", "verdict": "resume"})
            status, data = self._req("POST", "/api/subjects/rule",
                                     {"key": "clinic",
                                      "verdict": "aside"})
        finally:
            server.record_call = real
        self.assertEqual(status, 200)
        self.assertNotIn("clearing", data,
                         "the re-aside claimed a clearing outcome it "
                         "never owed")


if __name__ == "__main__":
    unittest.main(verbosity=1)
