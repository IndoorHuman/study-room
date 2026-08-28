#!/usr/bin/env python3
"""tests/test_made_on_date.py — the TRUE made-on date, derived beside the
stored one (26.998-03).

Standalone `unittest` in the house convention: no runner, no package, nothing
installed (law 8). Bare invocation exits 0/1.

⛔⛔ WHAT THIS SUITE IS GUARDING, AND WHY IT IS SHAPED THIS WAY.

She asked for the time frame to be reckoned from when a thing was MADE and
explicitly not from when it arrived. The room stores a date on every item. For
her photographs it is real. For her writing the stored date is the moment the
file landed on this machine.

⚠⚠ THE PLAN'S OWN PREMISE WAS RE-MEASURED AND IT IS ONLY PARTLY TRUE, so this
suite guards what is actually derivable rather than what was hoped for:

  * 2,148 of her 2,488 readable written notes still have their ORIGINAL file
    on disk, and every one of those originals carries a 2026 birth date that
    MATCHES the store exactly. The room copied the filesystem faithfully. For
    those items there is no truer date anywhere the room may honestly read.
  * The most common date in her notes' own headers is `date:`, and on her real
    vault THAT IS THE ARTICLE'S OWN PUBLICATION DATE, not when she made the
    note — 1990, 1991, 2000, 2004 among them, beside a separate `date_clipped:`
    that is when she actually saved it. ⛔ Reading `date:` as a made-on date
    would have produced a plausible, confident, WRONG date on 1,463 items.
    That is the single worst outcome available here and this suite forbids it.
  * The fields that ARE hers — `created:`, `date_clipped:` — say 2026 on every
    item that carries them, so they CONFIRM the stored date and correct
    nothing.

⭐ SO THE ONE SOURCE THAT ACTUALLY YIELDS A DIFFERENT AND TRUER DATE IS HER OWN
FILING: a year-and-month she wrote into a folder name, a title or a path.

⛔ ABSENCE IS A RESULT. An item with no honest source carries NO derived date.
Not the arrival date, not a neighbour's, not the folder's other items.

⛔ NOTHING STORED IS EVER OVERWRITTEN. The stored made-on stamp feeds the
boundary that decides what the room treats as new since the last sitting;
moving it would silently change what she is shown.
"""

import os
import sys
import json
import copy
import hashlib
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import study_lib                                        # noqa: E402


def _ms(year, month, day=1):
    import datetime
    return int(datetime.datetime(year, month, day,
                                 tzinfo=datetime.timezone.utc).timestamp()
               * 1000)


class MadeOnBase(unittest.TestCase):
    """One fixture holding every shape the derivation has to face."""

    def setUp(self):
        self.headers = {}
        self.store = {"schema_version": 3, "meta": {}, "items": {}}
        # 1. a note SHE filed under a month, whose stored date disagrees
        self.add("filed", folder="2024-02", title="a note.md",
                 created_ms=_ms(2026, 8))
        # 2. a note carrying a date in its OWN header, hers
        self.add("headed", folder="Reading notes", title="read.md",
                 created_ms=_ms(2026, 8))
        self.headers["headed"] = "---\ncreated: 2025-03-14\n---\n"
        # 3. ⛔ THE TRAP: a clipping whose `date:` is the ARTICLE'S date and
        #    whose `date_clipped:` is when SHE saved it.
        self.add("clipping", folder="Clippings", title="essay.md",
                 created_ms=_ms(2026, 7))
        self.headers["clipping"] = (
            "---\ntitle: an essay\ndate: 2005-01-01\n"
            "date_clipped: 2026-07-03\n---\n")
        # 3b. ⛔⛔ THE TRAP IN ITS UNDILUTED FORM, and the case that actually
        #     kills the mutant: a clipping carrying `date:` and NOTHING ELSE.
        #     Measured on her real vault 2026-08-23: 27 notes are shaped like
        #     this and one of them carries a pre-2026 `date:`. With
        #     `date_clipped:` present the allow-list order hides the danger —
        #     this item is the one that exposes it.
        self.add("bare_date", folder="Clippings", title="tags.md",
                 created_ms=_ms(2026, 6))
        self.headers["bare_date"] = (
            "---\ntitle: cat block tags\ndate: 2025-01-01\n---\n")
        # 4. a photograph whose stored date is ALREADY real
        self.add("photo", folder="studyroom-collect-1", title="p.jpeg",
                 created_ms=_ms(2017, 6), kind="image",
                 from_source="apple-photos")
        # 5. an item nothing can reach
        self.add("orphan", folder="studyroom-collect-1", title="x.md",
                 created_ms=_ms(2026, 5))
        # 6. ⛔ behind her private list — never touched, never reported
        self.add("private", folder="Journal", title="2024-02 entry.md",
                 created_ms=_ms(2026, 4), trigger=True)
        self.headers["private"] = "---\ncreated: 2024-02-02\n---\n"
        # 7. two sources that DISAGREE
        self.add("conflict", folder="2024-11", title="c.md",
                 created_ms=_ms(2026, 3))
        self.headers["conflict"] = "---\ncreated: 2021-09-09\n---\n"

    def add(self, item_id, folder, title, created_ms, kind="text",
            trigger=False, from_source=None):
        item = {
            "id": item_id, "source": "folder-drop", "type": kind,
            "origin_path": "/vault/" + folder + "/" + title,
            "library_path": "items/" + item_id + ".md",
            "title": title, "folder": folder, "state": "unseen",
            "trigger": trigger, "tags": [], "created_ms": created_ms,
            "saved_ms": created_ms, "history": [],
        }
        if from_source:
            item["from_source"] = from_source
        self.store["items"][item_id] = item

    def header_reader(self, item_id):
        """The frontmatter the derivation is handed: text or None, no IO."""
        return self.headers.get(item_id)

    def run_derivation(self, store=None):
        return study_lib.derive_made_on(store if store is not None
                                        else self.store, self.header_reader)

    def stamps(self, store=None):
        s = store if store is not None else self.store
        return {i: (it.get("created_ms"), it.get("saved_ms"))
                for i, it in s["items"].items()}

    def fixture_hash(self, store=None):
        s = store if store is not None else self.store
        return hashlib.sha256(
            json.dumps(s, sort_keys=True).encode("utf-8")).hexdigest()


class TracerTest(MadeOnBase):
    """Task 1 — ONE note she filed by month, end to end, with both controls."""

    def test_a_note_she_filed_by_month_gets_its_real_date(self):
        report = self.run_derivation()
        item = self.store["items"]["filed"]
        self.assertIn("made_on_ms", item,
                      "the note she filed under a month carries no derived "
                      "date at all")
        self.assertEqual(item["made_on_ms"], _ms(2024, 2),
                         "the derived date is not the month SHE filed it "
                         "under")
        self.assertEqual(item["made_on_from"], study_lib.MADE_ON_FROM_FILING,
                         "the derived date does not say where it came from")
        self.assertEqual(item["made_on_precision"], "month",
                         "a month-precision date that does not say so reads "
                         "as a day-accurate one")
        self.assertTrue(report["ok"])

    def test_the_control_photograph_is_untouched_and_not_worsened(self):
        """A photograph's stored date is ALREADY real. It must not be
        overwritten and must not be re-derived into something worse."""
        before = self.store["items"]["photo"]["created_ms"]
        self.run_derivation()
        item = self.store["items"]["photo"]
        self.assertEqual(item["created_ms"], before,
                         "a photograph's already-real stored date MOVED")
        self.assertEqual(item.get("made_on_ms"), before,
                         "the photograph's real date was not carried through")
        self.assertEqual(item.get("made_on_from"),
                         study_lib.MADE_ON_FROM_ALREADY_REAL)

    def test_the_control_orphan_carries_nothing_rather_than_a_guess(self):
        self.run_derivation()
        item = self.store["items"]["orphan"]
        self.assertNotIn("made_on_ms", item,
                         "⛔ an item with no honest source was GIVEN a date — "
                         "a plausible date is worse than none, because "
                         "nothing downstream can tell them apart")
        self.assertNotIn("made_on_from", item)

    def test_the_tracer_moved_no_stored_stamp(self):
        before = self.stamps()
        self.run_derivation()
        self.assertEqual(self.stamps(), before,
                         "⛔ a stored stamp MOVED — the boundary that decides "
                         "what the room treats as new reads that stamp")


class HeaderReaderShapeTest(MadeOnBase):
    """⛔⛔ THE DEFECT THIS SUITE MISSED THE FIRST TIME, AND HOW IT MISSED IT.

    Every case here hands the reader a `str`. The real wiring hands it the
    BYTES that `_read_frontmatter_block` returns — the same shape every other
    frontmatter reader in the module takes. `str(b"---\\n")` does not start
    with `---`, so the header source silently returned None for EVERY item:
    it reached 0 of 16,211 on the owner's real library while all fourteen
    cases stayed green.

    ⛔ A FIXTURE SHAPE THAT DOES NOT MATCH THE CALLER IS A GREEN TEST OVER A
    DEAD BRANCH. These cases drive BOTH shapes."""

    def test_bytes_frontmatter_is_read_exactly_like_text(self):
        as_text = study_lib._made_on_from_header(
            "---\ncreated: 2025-03-14\n---\n")
        as_bytes = study_lib._made_on_from_header(
            b"---\ncreated: 2025-03-14\n---\n")
        self.assertIsNotNone(as_text, "the str form stopped working")
        self.assertEqual(
            as_bytes, as_text,
            "⛔ bytes frontmatter read differently from the same text — the "
            "real caller hands BYTES, so this is the live path")

    def test_the_whole_derivation_works_when_the_reader_hands_bytes(self):
        self.headers = {k: (v.encode("utf-8") if isinstance(v, str) else v)
                        for k, v in self.headers.items()}
        report = self.run_derivation()
        self.assertEqual(
            report["by_source"][study_lib.MADE_ON_FROM_HEADER], 2,
            "the header source reached nothing when handed bytes — this is "
            "exactly how it reached 0 of 16,211 in the real room")
        self.assertEqual(self.store["items"]["headed"]["made_on_ms"],
                         _ms(2025, 3, 14))

    def test_the_articles_date_is_still_refused_when_handed_bytes(self):
        self.headers = {k: (v.encode("utf-8") if isinstance(v, str) else v)
                        for k, v in self.headers.items()}
        self.run_derivation()
        self.assertNotIn("made_on_ms", self.store["items"]["bare_date"],
                         "the allow-list stopped holding on the bytes path")


class SourcesTest(MadeOnBase):
    """Task 2 — every source the room can honestly read, and its reach."""

    def test_a_date_she_wrote_in_the_note_itself_is_read_and_named(self):
        self.run_derivation()
        item = self.store["items"]["headed"]
        self.assertEqual(item["made_on_ms"], _ms(2025, 3, 14))
        self.assertEqual(item["made_on_from"], study_lib.MADE_ON_FROM_HEADER)
        self.assertEqual(item["made_on_precision"], "day")

    def test_the_articles_own_date_is_refused_and_hers_is_used(self):
        """⛔⛔ THE CASE THIS WHOLE SUITE EXISTS FOR. `date:` on her real vault
        is the ARTICLE'S publication date. Reading it as a made-on date would
        put a confident 2005 on a note she wrote in 2026."""
        self.run_derivation()
        item = self.store["items"]["clipping"]
        self.assertNotEqual(
            item.get("made_on_ms"), _ms(2005, 1, 1),
            "⛔ the ARTICLE'S publication date was read as the date SHE made "
            "the note — this is the plausible-and-wrong outcome")
        self.assertEqual(item["made_on_ms"], _ms(2026, 7, 3),
                         "the date she actually saved it was not used")
        self.assertEqual(item["made_on_from"], study_lib.MADE_ON_FROM_HEADER)

    def test_a_note_carrying_only_the_articles_date_gets_NO_date(self):
        """⛔⛔ THE CASE THE MUTATION DRILL FORCED INTO EXISTENCE. The first
        version of this suite trapped `date:` only on an item that ALSO
        carried `date_clipped:`, so the allow-list's ORDER hid the defect and
        adding `date` to the allow-list changed nothing observable — the
        mutant SURVIVED. An item carrying `date:` ALONE is the one that
        exposes it: the article's year must reach nothing."""
        self.run_derivation()
        item = self.store["items"]["bare_date"]
        self.assertNotEqual(
            item.get("made_on_ms"), _ms(2025, 1, 1),
            "⛔ the ARTICLE'S publication date became her made-on date")
        self.assertNotIn(
            "made_on_ms", item,
            "an item whose only header date belongs to somebody else must "
            "carry NO date at all, not a plausible one")
        self.assertEqual(item.get("made_on_from"), None)

    def test_two_sources_that_disagree_leave_no_date_and_are_counted(self):
        """⛔ NOT SILENTLY RESOLVED. Which of her filing and her header is the
        more direct is NOT obvious from the record, so the item carries
        nothing and the disagreement is reported for her."""
        report = self.run_derivation()
        item = self.store["items"]["conflict"]
        self.assertNotIn("made_on_ms", item,
                         "a disagreement between two sources was resolved "
                         "silently by an agent")
        self.assertTrue(item.get("made_on_conflict"),
                        "the disagreement was not recorded on the item")
        self.assertEqual(report["conflicted"], 1)

    def test_the_reach_of_each_source_is_reported_from_a_derived_count(self):
        report = self.run_derivation()
        self.assertEqual(report["by_source"][study_lib.MADE_ON_FROM_FILING], 1)
        self.assertEqual(report["by_source"][study_lib.MADE_ON_FROM_HEADER], 2)
        self.assertEqual(report["no_source"], 2,
                         "the bare-`date:` clipping and the orphan must BOTH "
                         "be counted as reached by nothing")
        self.assertEqual(
            report["by_source"][study_lib.MADE_ON_FROM_ALREADY_REAL], 1)

        self.assertEqual(report["fenced"], 1)
        self.assertEqual(
            sum(report["by_source"].values())
            + report["no_source"] + report["conflicted"],
            len(self.store["items"]) - report["fenced"],
            "the report does not account for every item it considered")

    def test_running_it_twice_changes_nothing(self):
        self.run_derivation()
        settled = self.fixture_hash()
        self.run_derivation()
        self.assertEqual(self.fixture_hash(), settled,
                         "a second run over a settled store moved something")


class NonDestructiveTest(MadeOnBase):
    """Task 3 — nothing stored moved, and the boundary still means what it
    meant."""

    def marker_set(self, marker):
        payload = study_lib.build_librarian_payload(
            self.store, "reflection", store_dir=None, session_marker=marker)
        out = set()
        for key in ("meta_rows", "bodies"):
            for row in (payload.get(key) or []):
                out.add(str(row.get("id")))
        return out

    def test_every_stored_stamp_is_byte_identical_by_value(self):
        before = self.stamps()
        self.run_derivation()
        after = self.stamps()
        self.assertEqual(after, before,
                         "⛔ a stored date MOVED")
        for item_id, (c, s) in before.items():
            self.assertEqual(self.store["items"][item_id]["created_ms"], c)
            self.assertEqual(self.store["items"][item_id]["saved_ms"], s)

    def test_the_boundary_returns_the_identical_SET_not_merely_the_same_size(
            self):
        """⚠ Two different sets of the same size is exactly the failure a
        count cannot see, so this compares the sets themselves."""
        marker = _ms(2026, 6)
        before = self.marker_set(marker)
        self.assertTrue(before, "the boundary returned nothing before the "
                               "derivation, so this instrument is blind")
        self.run_derivation()
        after = self.marker_set(marker)
        self.assertEqual(after, before,
                         "the set of items the room treats as new CHANGED")

    def test_an_item_behind_her_private_list_is_untouched_and_unreported(self):
        before = copy.deepcopy(self.store["items"]["private"])
        report = self.run_derivation()
        self.assertEqual(self.store["items"]["private"], before,
                         "⛔ an item behind her private list was TOUCHED")
        self.assertNotIn("made_on_ms", self.store["items"]["private"])
        self.assertEqual(report["fenced"], 1)
        self.assertNotIn("private", report.get("reported_ids", []),
                         "a fenced item appeared in the derivation's report")

    def test_the_known_negative_a_settled_store_survives(self):
        """⛔ MUST SURVIVE. A derivation that always writes something, or a
        gate that always finds a change, dies here."""
        self.run_derivation()
        settled = copy.deepcopy(self.store)
        report = self.run_derivation()
        self.assertEqual(self.store, settled,
                         "a settled store was changed by a second run")
        self.assertTrue(report["ok"])


if __name__ == "__main__":
    unittest.main()
