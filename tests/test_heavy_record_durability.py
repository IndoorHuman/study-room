#!/usr/bin/env python3
"""26.996-07 task 3 — the record re-runs quietly and undo ends it completely.

Inherited from plan 04's discipline: seeds that no longer resolve are
reported, not silently skipped; taking one named thing back removes its
record entirely with no tombstone.
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server            # noqa: E402
import study_lib         # noqa: E402


def _item(iid, state="blessed"):
    return {"id": iid, "content_hash": iid * 4, "source": "photos",
            "origin_path": "/tmp/staged/%s.jpg" % iid,
            "library_path": "items/%s.jpg" % iid, "type": "image",
            "title": iid, "created_ms": 1700000000000,
            "saved_ms": 1700000000000, "imported_ms": 1700000000000,
            "last_opened_ms": None, "state": state,
            "resting_until_ms": None, "tags": []}


class ImportRerunDurabilityTest(unittest.TestCase):
    """#115: import re-checks aside subjects; missing seeds are reported."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "items"), exist_ok=True)
        os.makedirs(os.path.join(self.root, "librarian"), exist_ok=True)
        self.good = "aaaa111122223333"
        self.gone = "bbbb222233334444"
        items = {self.good: _item(self.good)}
        with open(os.path.join(self.root, "items.json"), "w",
                  encoding="utf-8") as fh:
            json.dump({"schema_version": 3,
                       "meta": {"library_root": self.root, "filters": []},
                       "items": items}, fh)
        subjects = [{"key": "named-test", "name": "test", "origin": "named",
                     "item_ids": [self.good, self.gone], "status": "aside",
                     "heavy_routing": "someone", "ever_aside": True,
                     "ms": 1, "chunks": []}]
        with open(os.path.join(self.root, "librarian", "subjects.json"),
                  "w", encoding="utf-8") as fh:
            json.dump({"subjects": subjects}, fh)

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_seed_that_no_longer_resolves_is_reported(self):
        out = server._quiet_rerun_subjects_on_import(self.root)
        self.assertIn(self.gone, out["unresolved"],
                      "a missing seed must be reported, not silently skipped")


class ForgetSetAsideTest(unittest.TestCase):
    """Undo removes exactly one entry — whole set back, no tombstone."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "items"), exist_ok=True)
        os.makedirs(os.path.join(self.root, "librarian"), exist_ok=True)
        self.a = "aaaa111122223333"
        self.b = "bbbb222233334444"
        items = {self.a: _item(self.a), self.b: _item(self.b)}
        items[self.a]["aside"] = ["named-one"]
        items[self.b]["aside"] = ["named-two"]
        with open(os.path.join(self.root, "items.json"), "w",
                  encoding="utf-8") as fh:
            json.dump({"schema_version": 3,
                       "meta": {"library_root": self.root, "filters": []},
                       "items": items}, fh)
        subjects = [
            {"key": "named-one", "name": "one", "origin": "named",
             "item_ids": [self.a], "status": "aside", "ms": 1, "chunks": []},
            {"key": "named-two", "name": "two", "origin": "named",
             "item_ids": [self.b], "status": "aside", "ms": 1, "chunks": []},
        ]
        with open(os.path.join(self.root, "librarian", "subjects.json"),
                  "w", encoding="utf-8") as fh:
            json.dump({"subjects": subjects}, fh)

    def tearDown(self):
        self.tmp.cleanup()

    def test_forget_returns_whole_set_and_drops_one_entry(self):
        before = study_lib.load_subjects(self.root)["subjects"]
        self.assertEqual(len(before), 2)
        out = server._forget_set_aside(self.root, "named-one")
        self.assertEqual(out["returned"], [self.a])
        after = study_lib.load_subjects(self.root)["subjects"]
        self.assertEqual(len(after), 1)
        self.assertEqual(after[0]["key"], "named-two")
        store = study_lib.load_store(self.root)
        self.assertNotIn("aside", store["items"][self.a])
        self.assertEqual(store["items"][self.b]["aside"], ["named-two"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
