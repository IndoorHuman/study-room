#!/usr/bin/env python3
"""tests/test_handwritten_signal.py — the mark SHE already puts on her own
writing, carried across (26.998-05).

Standalone `unittest`, house convention, bare invocation exits 0/1 (law 8).

⛔⛔ HER ROUTE, CHOSEN AT BEAT 2 AND HELD AT PLAN 05 WITH THE REACH SHOWN.

Beat 2, what counts as her own writing (chosen from an offered set):
    My prose plus short notes I typed
Beat 2b, how the room should know (chosen from an offered set):
    Carry across the mark I already use

⛔ THE ROUTE IS HERS AND NO SECOND ROUTE IS ADDED BESIDE IT. It reaches very
little today and that was MEASURED AND PUT TO HER before anything was built:
of the 625 vault notes the room may read, EIGHT carry the mark, two carry it
turned off, and 615 say nothing either way. Across her whole vault on disk —
2,664 files, private ones included — only 29 carry it at all. Shown that, she
ruled: "Yes — build it, it grows as I mark".

⛔ THE MARK IS THREE-VALUED AND THAT IS THE WHOLE POINT.
    set true    -> hers
    set false   -> she said it is NOT hers
    absent      -> ⛔ UNKNOWN. The room says NOTHING about the item.
A wrong mark on her own writing is worse than no mark, because the entire
point is that a reflection is built from her words.

⛔ NO WEIGHT, RATIO, THRESHOLD OR ORDERING VALUE. This produces a signal. What
it is worth is her ranking, and her ranking is not numbers.
"""

import os
import sys
import copy
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import study_lib                                        # noqa: E402


class HandwrittenBase(unittest.TestCase):

    def setUp(self):
        self.headers = {}
        self.store = {"schema_version": 3, "meta": {}, "items": {}}
        self.add("hers")
        self.headers["hers"] = b"---\ntitle: a note\nhandwritten: true\n---\n"
        self.add("not_hers")
        self.headers["not_hers"] = b"---\nhandwritten: false\n---\n"
        self.add("silent")
        self.headers["silent"] = b"---\ntitle: clipped\ntype: article\n---\n"
        self.add("no_header")
        self.headers["no_header"] = b""
        self.add("odd_value")
        self.headers["odd_value"] = b"---\nhandwritten: maybe\n---\n"
        self.add("private", trigger=True)
        self.headers["private"] = b"---\nhandwritten: true\n---\n"
        self.add("photo", kind="image")
        self.headers["photo"] = b""

    def add(self, item_id, trigger=False, kind="text"):
        self.store["items"][item_id] = {
            "id": item_id, "source": "obsidian-vault", "type": kind,
            "origin_path": "/vault/x/" + item_id + ".md",
            "library_path": "items/" + item_id + ".md",
            "title": item_id, "folder": "x", "state": "blessed",
            "trigger": trigger, "tags": [], "created_ms": 1,
            "saved_ms": 1, "history": [],
        }

    def reader(self, item_id):
        return self.headers.get(item_id, b"")

    def run_it(self):
        return study_lib.derive_handwritten(self.store, self.reader)


class TracerTest(HandwrittenBase):

    def test_a_note_she_marked_is_carried_across(self):
        report = self.run_it()
        self.assertIs(self.store["items"]["hers"]["handwritten"], True)
        self.assertEqual(report["marked_hers"], 1)

    def test_a_note_she_marked_NOT_hers_is_recorded_as_not_hers(self):
        """⛔ NOT the same as unknown. She said something about this item."""
        self.run_it()
        self.assertIs(self.store["items"]["not_hers"]["handwritten"], False)

    def test_an_unmarked_note_is_left_UNKNOWN_and_never_assumed(self):
        """⛔ THE CASE THE WHOLE ROUTE RESTS ON. 615 of her 625 readable vault
        notes are shaped like this. The room must say NOTHING about them."""
        report = self.run_it()
        for item_id in ("silent", "no_header"):
            self.assertNotIn(
                "handwritten", self.store["items"][item_id],
                "⛔ the room decided something about a note SHE never marked "
                "— a wrong mark on her own writing is worse than none")
        self.assertEqual(report["unknown"], 4,
                         "the items the route cannot judge are not counted")

    def test_a_value_the_reader_does_not_understand_is_UNKNOWN_not_a_NO(self):
        """⛔ THE CASE THE MUTATION DRILL FORCED INTO EXISTENCE. No fixture
        carried an unrecognised value, so reading one as "not hers" changed
        nothing observable and the mutant SURVIVED. A value the room does not
        understand is NOT her saying no — she said something it cannot read,
        which is not the same as a denial."""
        self.run_it()
        self.assertNotIn(
            "handwritten", self.store["items"]["odd_value"],
            "an unreadable value was turned into a verdict about her writing")


class BoundsTest(HandwrittenBase):

    def test_an_item_behind_her_private_list_is_untouched_and_unreported(self):
        """⛔ AND ITS MARK IS NOT COUNTED AS REACHED. The items most likely to
        carry the mark sit behind her list and were deliberately not opened;
        the unmeasured remainder stays unmeasured."""
        before = copy.deepcopy(self.store["items"]["private"])
        report = self.run_it()
        self.assertEqual(self.store["items"]["private"], before,
                         "⛔ an item behind her private list was TOUCHED")
        self.assertEqual(report["fenced"], 1)
        self.assertEqual(report["marked_hers"], 1,
                         "a fenced item was counted as reached")

    def test_the_counts_that_would_move_if_the_route_over_reached(self):
        report = self.run_it()
        self.assertEqual(report["marked_hers"], 1)
        self.assertEqual(report["marked_not_hers"], 1)
        self.assertEqual(report["unknown"], 4)
        self.assertEqual(report["fenced"], 1)
        self.assertEqual(
            report["marked_hers"] + report["marked_not_hers"]
            + report["unknown"] + report["fenced"],
            len(self.store["items"]),
            "the report does not account for every item in the room")

    def test_running_it_twice_changes_nothing(self):
        self.run_it()
        settled = copy.deepcopy(self.store)
        self.run_it()
        self.assertEqual(self.store, settled)

    def test_no_stored_stamp_or_state_moved(self):
        before = {i: (it.get("created_ms"), it.get("saved_ms"),
                      it.get("state"), tuple(it.get("tags") or []))
                  for i, it in self.store["items"].items()}
        self.run_it()
        after = {i: (it.get("created_ms"), it.get("saved_ms"),
                     it.get("state"), tuple(it.get("tags") or []))
                 for i, it in self.store["items"].items()}
        self.assertEqual(after, before, "the route changed her library")

    def test_a_mark_that_is_withdrawn_is_withdrawn_from_the_room_too(self):
        """She can un-mark a note. The room must follow her, not keep a stale
        claim that a clipped article is her own writing."""
        self.run_it()
        self.assertIs(self.store["items"]["hers"]["handwritten"], True)
        self.headers["hers"] = b"---\ntitle: a note\n---\n"
        self.run_it()
        self.assertNotIn(
            "handwritten", self.store["items"]["hers"],
            "the room kept claiming a note was hers after she removed the "
            "mark")


if __name__ == "__main__":
    unittest.main()
