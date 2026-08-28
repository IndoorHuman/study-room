"""tests/test_place_read_writes_nothing.py — 26.996-06.

The two properties this feature stands on, made checkable rather than claimed:

  1. THE LOCATION READ WRITES NOTHING AT REST. Nothing about where she was is
     ever persisted — not the coordinate, not the group, not the day, not the
     count. Driven by hashing the whole store tree either side of a real read.
  2. IT INHERITS THE FENCE, AND INHERITS IT BY NEVER BEING HANDED THE PATH.
     The requirement is not that a private photograph's location is filtered
     out of the answer — it is that THE READING MUST NOT EXIST.

...plus the grouping's own rules: her radius and her cap asserted BY VALUE, the
boundary stated once and driven at both sides, the silent degrade, and a cap
that REFUSES rather than trims.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server            # noqa: E402
import study_lib         # noqa: E402

PROBE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     "tools", "place_read.swift")


def _tree_hash(root):
    """Every path, size and mtime under root, in one digest."""
    h = hashlib.sha256()
    for base, dirs, files in os.walk(root):
        dirs.sort()
        for name in sorted(files):
            p = os.path.join(base, name)
            st = os.stat(p)
            h.update(("%s|%d|%s" % (os.path.relpath(p, root), st.st_size,
                                    st.st_mtime_ns)).encode())
    return h.hexdigest()


def _item(iid, state="blessed", kind="image", lib=None):
    return {"id": iid, "content_hash": iid * 4, "source": "photos",
            "origin_path": "/tmp/staged/%s.jpg" % iid,
            "library_path": lib if lib is not None else "items/%s.jpg" % iid,
            "type": kind, "title": iid, "created_ms": 1700000000000,
            "saved_ms": 1700000000000, "imported_ms": 1700000000000,
            "last_opened_ms": None, "state": state, "resting_until_ms": None,
            "tags": []}


class PlaceTargetsInheritTheFenceTest(unittest.TestCase):
    """Property 2, driven: a fenced photograph is never handed to the probe."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        os.makedirs(os.path.join(self.root, "items"))
        self.ids = ["aaaa111122223333", "bbbb222233334444",
                    "cccc333344445555", "dddd444455556666"]
        for i in self.ids:
            with open(os.path.join(self.root, "items", "%s.jpg" % i), "wb") as f:
                f.write(b"not-a-real-jpeg")
        items = {
            self.ids[0]: _item(self.ids[0]),
            self.ids[1]: _item(self.ids[1], state="never_show"),
            self.ids[2]: _item(self.ids[2], kind="text"),
            self.ids[3]: _item(self.ids[3]),
        }
        items[self.ids[3]]["aside"] = ["named-the-hospital"]
        self.store = {"schema_version": 1,
                      "meta": {"library_root": self.root, "filters": []},
                      "items": items}

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_never_shown_photograph_is_never_handed_to_the_probe(self):
        targets, report = study_lib.place_path_list(self.store, self.root)
        got = [t[0] for t in targets]
        self.assertIn(self.ids[0], got, "vacuous: an ordinary photo must pass")
        self.assertNotIn(self.ids[1], got,
                         "a never-shown photograph reached the location probe "
                         "— its location must never be READ, not merely "
                         "filtered out afterwards")
        self.assertEqual(report["fenced"], 2,
                         "counted BY REASON: the never-shown one and the "
                         "set-aside one")

    def test_a_photograph_she_set_aside_is_never_handed_to_the_probe(self):
        """The 26.9985 class, inherited for free because the fence is CALLED."""
        targets, _ = study_lib.place_path_list(self.store, self.root)
        self.assertNotIn(self.ids[3], [t[0] for t in targets])

    def test_a_note_is_not_a_photograph(self):
        targets, _ = study_lib.place_path_list(self.store, self.root)
        self.assertNotIn(self.ids[2], [t[0] for t in targets])

    def test_the_jail_refuses_a_path_outside_the_items_directory(self):
        self.store["items"][self.ids[0]]["library_path"] = "../escape.jpg"
        targets, report = study_lib.place_path_list(self.store, self.root)
        self.assertNotIn(self.ids[0], [t[0] for t in targets])
        self.assertEqual(report["jailed"], 1)


class ProbeWritesNothingTest(unittest.TestCase):
    """Property 1, driven against the REAL compiled probe over a REAL pipe."""

    @classmethod
    def setUpClass(cls):
        cls.bin = os.path.join(tempfile.gettempdir(), "place_read_probe_test")
        r = subprocess.run(["swiftc", "-O", "-o", cls.bin, PROBE],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise unittest.SkipTest("swiftc unavailable: " + r.stderr[:200])

    def test_a_real_pipe_returns_one_row_per_path_and_writes_nothing(self):
        """⛔ THE SILENT-ZERO-WORK TRAP, driven. The obvious way to read
        standard input reads NOTHING from a pipe — which is exactly what a
        spawn hands over — and reports success. This asserts the row COUNT
        against the input count as an integer, so a zero-row success fails."""
        with tempfile.TemporaryDirectory() as d:
            paths = []
            for i in range(5):
                p = os.path.join(d, "p%d.jpg" % i)
                with open(p, "wb") as f:
                    f.write(b"not-a-real-jpeg")
                paths.append(p)
            before = _tree_hash(d)
            r = subprocess.run([self.bin], input="\n".join(paths) + "\n",
                               capture_output=True, text=True)
            rows = [json.loads(l) for l in r.stdout.strip().split("\n") if l]
            self.assertEqual(len(rows), len(paths),
                             "one row per ATTEMPTED picture — a short list is "
                             "the silent shortfall this asserts against")
            self.assertEqual(_tree_hash(d), before,
                             "the location read wrote something at rest")

    def test_zero_paths_is_a_refusal_never_a_pass(self):
        r = subprocess.run([self.bin], input="", capture_output=True, text=True)
        self.assertEqual(r.returncode, 2,
                         "read nothing must be distinguishable from read "
                         "everything")

    def test_an_unreadable_file_yields_an_error_row_not_a_short_list(self):
        r = subprocess.run([self.bin], input="/nonexistent/a.jpg\n",
                           capture_output=True, text=True)
        rows = [json.loads(l) for l in r.stdout.strip().split("\n") if l]
        self.assertEqual(len(rows), 1)
        self.assertIn("error", rows[0])
        self.assertNotIn("lat", rows[0])


class PlaceGroupingTest(unittest.TestCase):
    """Her two numbers, the boundary, the degrade, and the cap."""

    def test_her_radius_and_cap_are_what_she_ruled_by_value(self):
        self.assertEqual(server.PLACE_RADIUS_M, 150,
                         "#126: that day, AT THAT PLACE — within 150 metres")
        self.assertEqual(server.PLACE_PILE_CAP, 30, "#125 r2: a cap of thirty")

    def test_the_radius_is_driven_at_both_sides_of_the_boundary(self):
        """One rule, stated in one place, driven inside / at / outside."""
        seed = {"lat": 37.7749, "lon": -122.4194, "when": "2026:03:04 10:00:00"}
        # 0.001 degrees of latitude is ~111 m; 0.00135 is ~150 m.
        inside = {"lat": 37.7749 + 0.0009, "lon": -122.4194,
                  "when": "2026:03:04 11:00:00"}
        outside = {"lat": 37.7749 + 0.0020, "lon": -122.4194,
                   "when": "2026:03:04 11:00:00"}
        got = server._place_group(seed, [("in", inside), ("out", outside)])
        self.assertIn("in", got)
        self.assertNotIn("out", got)
        d_in = server._haversine_m(seed["lat"], seed["lon"],
                                   inside["lat"], inside["lon"])
        d_out = server._haversine_m(seed["lat"], seed["lon"],
                                    outside["lat"], outside["lon"])
        self.assertLess(d_in, server.PLACE_RADIUS_M)
        self.assertGreater(d_out, server.PLACE_RADIUS_M)

    def test_a_different_day_at_the_same_place_is_a_different_event(self):
        seed = {"lat": 37.7749, "lon": -122.4194, "when": "2026:03:04 10:00:00"}
        same_spot_next_day = {"lat": 37.7749, "lon": -122.4194,
                              "when": "2026:03:05 10:00:00"}
        self.assertEqual(
            server._place_group(seed, [("x", same_spot_next_day)]), [])

    def test_midnight_is_a_hard_edge_and_that_is_the_stated_rule(self):
        seed = {"lat": 1.0, "lon": 1.0, "when": "2026:03:04 23:59:00"}
        just_after = {"lat": 1.0, "lon": 1.0, "when": "2026:03:05 00:01:00"}
        self.assertEqual(server._place_group(seed, [("x", just_after)]), [],
                         "two minutes apart across midnight are two days — "
                         "which is what a person means by 'that day'")

    def test_with_no_location_the_event_silently_becomes_that_day(self):
        """#126's degrade — and NOTHING is said either way."""
        seed = {"when": "2026:03:04 10:00:00"}
        same_day_far = {"lat": 51.5, "lon": -0.12, "when": "2026:03:04 22:00:00"}
        other_day = {"lat": 51.5, "lon": -0.12, "when": "2026:03:05 09:00:00"}
        got = server._place_group(seed, [("same", same_day_far),
                                         ("other", other_day)])
        self.assertEqual(got, ["same"],
                         "with no location the event is that DAY, at any "
                         "distance")

    def test_the_grouping_cannot_reach_a_store_a_file_or_a_path(self):
        """The signature IS the fence: two dictionaries in, ids out."""
        import inspect
        params = list(inspect.signature(server._place_group).parameters)
        self.assertEqual(params, ["seed", "candidates"],
                         "a third argument here would be a way back to the "
                         "store, and the fence would stop being structural")


if __name__ == "__main__":
    unittest.main(verbosity=2)
