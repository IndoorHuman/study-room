#!/usr/bin/env python3
"""tests/test_journal_tier.py — the tier she ranked FIRST (26.998-06).

Standalone `unittest`, house convention, bare invocation exits 0/1 (law 8).

⛔⛔ WHAT SHE RULED, AND WHAT THIS PLAN IS THEREFORE ALLOWED TO DO.

Beat 1, chosen from an offered set, after she was told the forward-only
consequence for the first time:

    Bring back the ones set aside

⛔⛔ THAT IS A STATEMENT OF WHAT SHE WANTS THE TIER TO BE. IT IS NOT AN
INSTRUCTION TO ANY AGENT, AND NOTHING HERE ACTS ON HER PRIVATE LIST. Release
is one tap at a time, by her, through the shipped per-item release — the same
directional safety that makes removing a folder reach forward only. ⛔ No test
here releases, unflags or bulk-returns anything.

⛔ SO THE TIER IS EMPTY TODAY AND THAT IS REPORTED, NOT HIDDEN. Measured
read-only against her live library 2026-08-23: her `Journal` folder holds 30
items and every one of them is held back, so the tier the room can build from
holds ZERO. It fills only as she releases them, one tap each, and as she
writes new entries. ⛔ That is a fact about her own ruling, not a problem with
a suggested fix, and no agent may propose opening her list.

⛔ THE EVIDENCE IS THE PLACE SHE FILED IT — never tone, never contents, never
shape. And whole segments, never a prefix: `Journal` must not catch
`Journal analysis`, a real folder holding the room's writing ABOUT her diary.

⛔ NO WEIGHT, RATIO, THRESHOLD OR ORDERING VALUE. Her ranking put the journal
first; what "first" means numerically is not an agent's to decide and is not
needed to tell a journal entry apart.
"""

import os
import sys
import copy
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import study_lib                                        # noqa: E402

VAULT = "/vault"


class JournalTierBase(unittest.TestCase):

    def setUp(self):
        self.store = {"schema_version": 3,
                      "meta": {"vault_root": VAULT}, "items": {}}
        # ⛔ every real journal entry of hers is HELD BACK today
        self.add("held", "Journal/2026-08-01.md", trigger=True)
        self.add("held_two", "Journal/2026-08-02.md", trigger=True)
        # one she has released herself, by her own tap
        self.add("released", "Journal/2026-08-03.md", trigger=False)
        # ⚠ the room's writing ABOUT her diary — NOT her journal
        self.add("about", "Journal analysis/2026-08-01.md")
        # her other writing
        self.add("other", "Reading notes/a.md")
        # something that arrived under a generated bucket, no folder of hers
        self.add("bucket", None, folder="studyroom-collect-1")

    def add(self, item_id, rel, trigger=False, folder=None):
        self.store["items"][item_id] = {
            "id": item_id, "source": "obsidian-vault", "type": "text",
            "origin_path": (VAULT + "/" + rel) if rel
                           else "/var/f/studyroom-collect-1/" + item_id,
            "library_path": "items/" + item_id + ".md",
            "title": item_id, "folder": folder or "x", "state": "blessed",
            "trigger": trigger, "tags": [], "created_ms": 1, "saved_ms": 1,
            "history": [],
        }

    def tier(self):
        return study_lib.journal_tier(self.store)


class TierTest(JournalTierBase):

    def test_the_tier_holds_only_what_she_has_released_herself(self):
        report = self.tier()
        self.assertEqual(report["ids"], {"released"},
                         "the tier is not exactly what she has released")

    def test_everything_she_set_aside_stays_out_and_is_counted(self):
        """⛔ AND STAYS SET ASIDE. Nothing here releases anything."""
        before = copy.deepcopy(self.store)
        report = self.tier()
        self.assertNotIn("held", report["ids"])
        self.assertNotIn("held_two", report["ids"])
        self.assertEqual(report["still_held_back"], 2,
                         "the emptiness is not reported, so nobody can see "
                         "why the tier she ranked first is empty")
        self.assertEqual(self.store, before,
                         "⛔ THE TIER RELEASED OR TOUCHED SOMETHING")

    def test_the_writing_ABOUT_her_diary_is_not_her_diary(self):
        """⛔ WHOLE SEGMENTS, NEVER A PREFIX. `Journal analysis` holds the
        room's own writing about her journal — a substring test would file
        Claude's words as hers, which is the exact inversion of what she
        asked for."""
        report = self.tier()
        self.assertNotIn("about", report["ids"],
                         "the room's writing ABOUT her diary was counted as "
                         "her diary")

    def test_her_other_writing_is_not_swept_in(self):
        self.assertNotIn("other", self.tier()["ids"])

    def test_an_item_with_no_folder_of_hers_says_NOTHING(self):
        """⛔ WHERE THE EVIDENCE IS MISSING THE ROOM IS SILENT. Folder names
        exist only for what came from her vault; most of her library arrived
        under two generated bucket names."""
        report = self.tier()
        self.assertNotIn("bucket", report["ids"])
        self.assertEqual(report["no_evidence"], 1)

    def test_the_counts_account_for_every_item(self):
        report = self.tier()
        self.assertEqual(
            len(report["ids"]) + report["still_held_back"]
            + report["not_journal"] + report["no_evidence"],
            len(self.store["items"]))

    def test_the_known_negative_an_all_held_back_room_yields_an_empty_tier(
            self):
        """⛔ MUST SURVIVE. This is her library as it actually stands today:
        every journal entry held back, so the tier she ranked FIRST is empty.
        A tier that quietly includes held-back items dies here."""
        for item_id in ("released",):
            self.store["items"][item_id]["trigger"] = True
        report = self.tier()
        self.assertEqual(report["ids"], set(),
                         "an item she has NOT released reached the tier")
        self.assertEqual(report["still_held_back"], 3)


if __name__ == "__main__":
    unittest.main()
