"""tests/test_picture_door.py — 26.996 NEW-01.

The fourth answer reached from a PHOTOGRAPH, and the one property the whole
phase turns on: it writes into the memory she already has and creates no
second one.

⛔ WHY THIS SUITE EXISTS. An earlier plan for this phase would have built a
parallel record with its own match rule, its own route and its own reversal,
for a job phase 26.9985 had already shipped. That was stopped before it landed.
These cases are what a re-introduction of that second record fails: every one
of them reads the SHIPPED store, and a door that wrote anywhere else would go
red here rather than quietly working.

Her rulings of 2026-08-26, each pinned by a case below:
  R-1  one named thing, two ways in — words and pictures reach the same thing
  R-4  a second naming joins quietly, and the room says nothing back
  #112 no name, nothing happens at all
  #114 her blessing survives, because nothing about the item is changed
"""
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server            # noqa: E402
import study_lib         # noqa: E402

PORT = 8976
PHOTOS = ["aaaa111122223333", "bbbb222233334444", "cccc333344445555"]
HIDDEN = "dddd444455556666"


def _item(iid, state="blessed", title=None):
    return {"id": iid, "content_hash": iid * 4, "source": "photos",
            "origin_path": "/tmp/staged/%s.jpg" % (iid * 2),
            "library_path": "items/%s.jpg" % iid, "type": "image",
            "title": title or iid, "created_ms": 1700000000000,
            "saved_ms": 1700000000000, "imported_ms": 1700000000000,
            "last_opened_ms": None, "state": state,
            "resting_until_ms": None, "tags": []}


class PictureDoorTest(unittest.TestCase):
    """Driven against a real server over a temporary library — never asserted
    from source. A door that only looked right in the source is exactly what
    this phase already caught once."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = cls.tmp.name
        os.makedirs(os.path.join(cls.root, "items"), exist_ok=True)
        items = {i: _item(i) for i in PHOTOS}
        items[HIDDEN] = _item(HIDDEN, state="never_show", title="hidden")
        with open(os.path.join(cls.root, "items.json"), "w",
                  encoding="utf-8") as fh:
            json.dump({"schema_version": 1,
                       "meta": {"library_root": cls.root, "filters": []},
                       "items": items}, fh, indent=1)
        cls.httpd = server.create_server(cls.root, PORT, config_path=None)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        time.sleep(0.6)
        cls.base = "http://127.0.0.1:%d" % PORT

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.tmp.cleanup()

    # -- helpers ----------------------------------------------------------
    def post(self, path, obj):
        req = urllib.request.Request(
            self.base + path, data=json.dumps(obj).encode(),
            headers={"Content-Type": "application/json", "Origin": self.base})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode() or "{}")

    def subjects(self):
        p = os.path.join(self.root, "librarian", "subjects.json")
        if not os.path.exists(p):
            return []
        with open(p, encoding="utf-8") as fh:
            return json.load(fh)["subjects"]

    def item(self, iid):
        with open(os.path.join(self.root, "items.json"), encoding="utf-8") as f:
            return json.load(f)["items"][iid]

    # -- the cases --------------------------------------------------------
    def test_01_the_picture_door_writes_into_the_shipped_memory(self):
        """R-1: it joins the memory she already has, and creates no other."""
        status, body = self.post("/api/subjects/picture",
                                 {"id": PHOTOS[1], "name": "the hospital",
                                  "routing": "someone"})
        self.assertEqual(status, 200)
        self.assertTrue(body.get("ok"))
        self.assertTrue(body.get("likeness_needed"),
                        "first naming with someone ticked needs the ask route")
        self.assertFalse(body.get("repeat_naming"))
        subs = self.subjects()
        self.assertEqual(len(subs), 1, "exactly one named thing")
        self.assertEqual(subs[0]["name"], "the hospital")
        self.assertEqual(subs[0]["origin"], "named")
        self.assertEqual(subs[0]["status"], "aside")
        self.assertEqual(subs[0]["item_ids"], [PHOTOS[1]],
                         "the photograph is the named thing's first member — "
                         "no shipped writer had ever added one")
        # ⛔ and NOTHING was written anywhere else in the librarian folder
        names = sorted(os.listdir(os.path.join(self.root, "librarian")))
        self.assertEqual(names, ["subjects.json"],
                         "a SECOND record appeared beside the shipped one — "
                         "that is the duplication this phase was stopped for")

    def test_02_the_librarian_stops_bringing_it_and_her_blessing_survives(self):
        row = self.item(PHOTOS[1])
        self.assertEqual(row["aside"], [self.subjects()[0]["key"]])
        self.assertEqual(row["state"], "blessed",
                         "#114: her blessing survives, because nothing about "
                         "the item was changed to restore")
        self.assertTrue(study_lib._librarian_fenced(row, []),
                        "the librarian must stop bringing it")
        self.assertFalse(study_lib._librarian_fenced(self.item(PHOTOS[0]), []),
                         "vacuous: it must still bring the others")

    def test_03_a_second_naming_joins_quietly(self):
        """R-4/R-8: no ask, no count, no sweep on a repeat naming."""
        status, body = self.post("/api/subjects/picture",
                                 {"id": PHOTOS[2], "name": "  THE HOSPITAL ",
                                  "routing": "someone"})
        self.assertEqual(status, 200)
        self.assertTrue(body.get("repeat_naming"))
        self.assertFalse(body.get("likeness_needed"))
        subs = self.subjects()
        self.assertEqual(len(subs), 1,
                         "the same name spelled differently made a SECOND "
                         "named thing")
        self.assertEqual(sorted(subs[0]["item_ids"]),
                         sorted([PHOTOS[1], PHOTOS[2]]))

    def test_04_idempotent_by_identity(self):
        before = len(self.subjects()[0]["item_ids"])
        self.post("/api/subjects/picture",
                  {"id": PHOTOS[2], "name": "the hospital",
                   "routing": "someone"})
        self.assertEqual(len(self.subjects()[0]["item_ids"]), before,
                         "the same picture named the same thing twice must "
                         "leave one member, never two")

    def test_05_an_unknown_id_and_a_hidden_one_refuse_identically(self):
        """Two different messages would let this route answer whether a
        never-shown item exists under an id — a law-5 leak wearing an error."""
        a = self.post("/api/subjects/picture",
                      {"id": "nosuchid", "name": "x", "routing": "someone"})
        b = self.post("/api/subjects/picture",
                      {"id": HIDDEN, "name": "x", "routing": "someone"})
        self.assertEqual(a, b)
        self.assertEqual(a[0], 400)

    def test_06_no_name_nothing_happens(self):
        """#112 ruling 1, held by her against the case that breaks it."""
        before = json.dumps(self.subjects(), sort_keys=True)
        status, _ = self.post("/api/subjects/picture",
                              {"id": PHOTOS[0], "name": "   "})
        self.assertEqual(status, 400)
        self.assertEqual(json.dumps(self.subjects(), sort_keys=True), before,
                         "a nameless answer wrote something")

    def test_07_her_own_words_door_reaches_the_same_named_thing(self):
        """R-1 from the other side: the two ways in are ONE thing."""
        status, body = self.post("/api/subjects/name", {"text": "the hospital"})
        self.assertEqual(status, 200)
        self.assertEqual(body.get("keys"), [self.subjects()[0]["key"]],
                         "her words door made or found a DIFFERENT thing than "
                         "her picture door — the two ways in have split")


if __name__ == "__main__":
    unittest.main(verbosity=2)
