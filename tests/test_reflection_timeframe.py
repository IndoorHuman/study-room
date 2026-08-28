#!/usr/bin/env python3
"""tests/test_reflection_timeframe.py — the stretch she names, reckoned from
the TRUE made-on date (26.998-04).

Standalone `unittest`, house convention, bare invocation exits 0/1 (law 8).

⛔⛔ WHAT SHE RULED, AND WHY THIS SUITE IS SHAPED THE WAY IT IS.

Her beat-3 answer, verbatim and written by her — not chosen from any list:

    I think when the librarian is asking for reflection gives the option about
    if the user wants the most recent reflection or if the user has a time
    frmae

And her beat-3b answer, chosen from an offered set:

    I type it in the moment

⭐ SO THERE ARE TWO CHOICES, NOT THREE SCALES, and the stretch is a value SHE
SUPPLIES AT THE MOMENT. ⛔ THERE IS NO DEFAULT SPAN ANYWHERE IN THIS SUITE OR
IN THE CODE IT GUARDS, and no agent may add one — not as a default argument,
not as an example, not as a constant "that will be replaced". A case here
passes a span because SHE would have typed one; the code never invents it.

⛔ HER RULING ON WHAT THE ROOM CANNOT DATE (T-3, chosen from an offered set):

    Leave them out, and tell me

So a stretch sets undated things aside AND REPORTS HOW MANY, because she has to
be told. ⚠ That was a gap in her own beat-3 ruling and it was ASKED, not
defaulted.

⛔ NO WEIGHT, RATIO, THRESHOLD, TIE-BREAK OR ORDERING VALUE EXISTS HERE. A
stretch is a reach she names, not a score.
"""

import os
import sys
import copy
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import study_lib                                        # noqa: E402

DAY = 86400000
MONTH = DAY * 30
NOW = 1787000000000


class WindowBase(unittest.TestCase):
    """True made-on dates deliberately spanning several years, with an item on
    each side of every edge a case uses."""

    def setUp(self):
        self.store = {"schema_version": 3, "meta": {}, "items": {}}
        self.add("today", made=NOW - DAY)
        self.add("last_month", made=NOW - MONTH)
        self.add("half_year", made=NOW - MONTH * 6)
        self.add("last_year", made=NOW - MONTH * 14)
        self.add("years_ago", made=NOW - MONTH * 60)
        self.add("undated", made=None)
        self.add("undated_two", made=None)
        self.add("private", made=NOW - DAY, trigger=True)
        self.add("hidden", made=NOW - DAY, state="never_show")

    def add(self, item_id, made, trigger=False, state="blessed"):
        item = {
            "id": item_id, "source": "folder-drop", "type": "text",
            "origin_path": "/vault/x/" + item_id + ".md",
            "library_path": "items/" + item_id + ".md",
            "title": item_id, "folder": "x", "state": state,
            "trigger": trigger, "tags": [], "created_ms": NOW,
            "saved_ms": NOW, "history": [],
        }
        if made is not None:
            item["made_on_ms"] = made
            item["made_on_precision"] = "day"
            item["made_on_from"] = study_lib.MADE_ON_FROM_HEADER
        self.store["items"][item_id] = item

    def window(self, span_ms=None):
        return study_lib.reflection_window(self.store, span_ms=span_ms,
                                           now_ms=NOW)


class TracerTest(WindowBase):
    """Task 2 — one stretch, end to end, with both controls."""

    def test_a_stretch_she_names_returns_a_strictly_smaller_SET(self):
        everything = self.window()["ids"]
        narrowed = self.window(span_ms=MONTH * 3)["ids"]
        self.assertTrue(
            narrowed < everything,
            "the stretch did not narrow anything — it returned "
            + str(len(narrowed)) + " of " + str(len(everything)))
        self.assertIn("today", narrowed)
        self.assertIn("last_month", narrowed)
        self.assertNotIn("half_year", narrowed,
                         "an item made outside the stretch is still material")
        self.assertNotIn("years_ago", narrowed)

    def test_NO_DEFAULT_SPAN_EXISTS_when_the_caller_names_none(self):
        """⛔⛔ THE ONE PROHIBITION OF THIS PLAN, AND THE MUTATION DRILL HAD TO
        FORCE THIS CASE INTO EXISTENCE. Every other case passes a reach
        explicitly, so a default argument quietly appearing in the signature
        was never exercised and the mutant SURVIVED. This calls it the way a
        caller who was given NO reach by her would call it — with nothing —
        and proves the room does not invent one.

        She said "these x months". The letter is HERS."""
        import inspect
        sig = inspect.signature(study_lib.reflection_window)
        self.assertIsNone(
            sig.parameters["span_ms"].default,
            "⛔ A DEFAULT REACH APPEARED IN THE SIGNATURE. She types the "
            "stretch in the moment; no agent may choose one for her.")
        bare = study_lib.reflection_window(self.store, now_ms=NOW)
        self.assertEqual(
            bare["ids"], self.window()["ids"],
            "calling it with no reach behaved differently from her own "
            "'stay recent' choice, so something was filled in")
        self.assertEqual(bare["outside"], 0,
                         "⛔ something was excluded by a reach SHE NEVER "
                         "NAMED")
        self.assertEqual(bare["set_aside_undated"], 0)

    def test_the_control_no_stretch_returns_what_it_returns_today(self):
        """⛔ THE KNOWN-NEGATIVE. She ruled two choices, and 'stay recent' is
        the room as it already is. A stretch that leaks into the no-stretch
        path dies here."""
        report = self.window()
        self.assertEqual(
            report["ids"],
            {"today", "last_month", "half_year", "last_year", "years_ago",
             "undated", "undated_two"},
            "asking for no stretch changed what the room returns")
        self.assertEqual(report["set_aside_undated"], 0,
                         "nothing may be set aside when she did not ask for "
                         "a stretch")
        self.assertEqual(report["outside"], 0)

    def test_a_held_back_item_stays_held_back_under_every_reach(self):
        for span in (None, MONTH, MONTH * 6, MONTH * 120):
            ids = self.window(span_ms=span)["ids"]
            self.assertNotIn("private", ids,
                             "an item behind her private list became "
                             "material under a stretch")
            self.assertNotIn("hidden", ids,
                             "an item she set aside came back")


class UndatedTest(WindowBase):
    """Her T-3 ruling: Leave them out, and tell me."""

    def test_a_stretch_sets_undated_things_aside_AND_reports_how_many(self):
        report = self.window(span_ms=MONTH * 3)
        self.assertNotIn("undated", report["ids"])
        self.assertNotIn("undated_two", report["ids"])
        self.assertEqual(
            report["set_aside_undated"], 2,
            "her ruling was 'leave them out, AND TELL ME' — the room cannot "
            "tell her anything if the count is not reported")

    def test_undated_things_behave_identically_under_every_stretch(self):
        for span in (MONTH, MONTH * 6, MONTH * 120):
            report = self.window(span_ms=span)
            self.assertEqual(report["set_aside_undated"], 2)
            self.assertNotIn("undated", report["ids"])

    def test_no_stretch_keeps_them_since_she_ruled_only_on_a_stretch(self):
        report = self.window()
        self.assertIn("undated", report["ids"])
        self.assertIn("undated_two", report["ids"])


class NestingTest(WindowBase):
    """Task 3 — sets, never counts."""

    def test_a_longer_reach_CONTAINS_a_shorter_one(self):
        """⚠ SETS, NOT COUNTS. Two different sets of the same size is exactly
        the failure a count cannot see."""
        short = self.window(span_ms=MONTH * 3)["ids"]
        mid = self.window(span_ms=MONTH * 9)["ids"]
        long = self.window(span_ms=MONTH * 24)["ids"]
        self.assertTrue(short <= mid, "a longer reach LOST something a "
                                      "shorter one had")
        self.assertTrue(mid <= long)
        self.assertTrue(short < long,
                        "the reaches do not actually differ, so this "
                        "instrument proves nothing")

    def test_every_stretch_returns_strictly_fewer_than_no_stretch(self):
        everything = self.window()["ids"]
        for span in (MONTH * 3, MONTH * 9, MONTH * 24):
            self.assertTrue(self.window(span_ms=span)["ids"] < everything)

    def test_the_counts_that_would_move_if_a_stretch_over_reached(self):
        report = self.window(span_ms=MONTH * 9)
        self.assertEqual(len(report["ids"]), 3)
        self.assertEqual(report["outside"], 2)
        self.assertEqual(report["set_aside_undated"], 2)
        self.assertEqual(report["fenced"], 2)
        self.assertEqual(
            len(report["ids"]) + report["outside"]
            + report["set_aside_undated"] + report["fenced"],
            len(self.store["items"]),
            "the report does not account for every item in the room")

    def test_the_reckoning_uses_the_TRUE_date_not_the_stored_stamp(self):
        """⛔ SHE RULED EXPLICITLY AGAINST THE ARRIVAL DATE, and plan 03
        established the stored stamp IS the arrival date for her writing.
        Every item here carries the same stored stamp, so a reckoning that
        read it would return all of them."""
        stored = {i["created_ms"] for i in self.store["items"].values()}
        self.assertEqual(len(stored), 1,
                         "this fixture cannot tell the two dates apart")
        narrowed = self.window(span_ms=MONTH * 3)["ids"]
        self.assertNotEqual(
            len(narrowed), 7,
            "the stretch reckoned from the STORED stamp — every item shares "
            "it, so nothing was narrowed")

    def test_the_window_changes_nothing_in_the_room(self):
        before = copy.deepcopy(self.store)
        self.window(span_ms=MONTH * 3)
        self.assertEqual(self.store, before,
                         "asking for a stretch CHANGED her library")


if __name__ == "__main__":
    unittest.main()
