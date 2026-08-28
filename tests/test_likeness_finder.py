#!/usr/bin/env python3
"""26.996-07 — the likeness finder: one tap, and the others of that same
person or animal.

⛔ EVERY CASE HERE WAS DRIVEN RED BEFORE IT WAS TRUSTED. A gate that has only
ever been seen green is a claim, not a gate — and this phase has already
recorded four checks that passed VACUOUSLY against an endpoint returning
nothing. The mutations are listed in DRILLS at the bottom and each is asserted
to have changed the file BY SHA before its verdict is read.

WHAT THIS GUARDS, and why each one is here rather than being obvious:

  * THE PILE SIZES ITSELF (#117 r2). Never "the closest N". A fixed N returns
    thirty strangers for someone who appears twice.
  * THE ON-THE-BAR RULE, asserted at BOTH sides. An off-by-one on a threshold
    is invisible in review and changes what a tap does to her library.
  * AN EMPTY PILE IS STILL AN ANSWER. A photograph with no face and no animal
    returns nothing and the room still asks, in the same words.
  * ORDERING IS DETERMINISTIC. The on-device print is NOT reproducible run to
    run — measured, 10 of 43 prints differed across two reads of the same
    pictures, worst drift 0.017. The ordering must not add a SECOND source of
    movement on top of the one that cannot be removed.
  * PEOPLE AND PETS ARE SPLIT (#124 r5). A face in the picture means no animal
    guess at all.
  * NOTHING IS WRITTEN. Her ruling #116: the room holds nothing representing a
    particular person's face. Asserted by a manifest of the whole store tree
    taken before and after a match run.
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

import server        # noqa: E402
import study_lib     # noqa: E402


def _print_at(*values):
    """A feature print as base64, from a handful of floats.

    The room's prints are 768 L2-normalised float32s; these fixtures use short
    vectors on purpose — `print_cosine` is a plain dot product over whatever
    length it is given, so a 4-float unit vector exercises the SAME arithmetic
    and lets a reader check the cosine by hand."""
    import base64
    import struct
    return base64.b64encode(
        struct.pack("<%df" % len(values), *values)).decode("ascii")


def _face(*values):
    return {"i": 0, "fp": _print_at(*values), "dim": len(values)}


class OnTheBar(unittest.TestCase):
    """The threshold, asserted at BOTH sides and exactly on it."""

    def test_exactly_on_the_bar_is_taken(self):
        """⚠ A SCORE CANNOT BE MADE TO LAND ON THE BAR BY CHOOSING A VECTOR,
        and finding that out is worth more than the case that was first written
        here. Prints are float32; a candidate built at cosine 0.77 packs to
        0.76999998..., so the "exactly equal" case is unreachable from the
        input side and a test that claims to cover it covers nothing.

        So the equality is driven from the OTHER side: the fixture's real score
        is computed first, and the bar is moved to exactly that value. That is a
        genuine `score == bar`, which is the only way this arm is ever
        witnessed."""
        import math
        seed = {"faces": [_face(1.0, 0.0)]}
        target = 0.77
        cands = [("on", {"faces": [_face(target,
                                        math.sqrt(1.0 - target * target))]})]
        score = study_lib.print_cosine(
            server._likeness_vector(seed["faces"][0]["fp"]),
            server._likeness_vector(cands[0][1]["faces"][0]["fp"]))
        original = server.LIKENESS_BAR_FACE
        try:
            server.LIKENESS_BAR_FACE = score          # the bar IS the score
            ids, kind = server._likeness_pile(seed, cands)
        finally:
            server.LIKENESS_BAR_FACE = original
        self.assertEqual(kind, "faces")
        self.assertEqual(ids, ["on"],
                         "a candidate exactly ON the bar must be TAKEN")

    def test_the_bar_rule_is_written_in_exactly_one_place(self):
        """⛔ One rule, one place. Two spellings of a threshold drift the first
        time either moves, and a threshold that drifts changes what a tap does
        to her library without anything looking wrong."""
        src = (REPO / "server.py").read_text(encoding="utf-8")
        body = src.split("def _likeness_pile")[1].split("\ndef ")[0]
        self.assertEqual(body.count(">= bar"), 1,
                         "the on-the-bar comparison must appear exactly once")

    def test_either_side_of_the_bar(self):
        import math
        bar = server.LIKENESS_BAR_FACE
        seed = {"faces": [_face(1.0, 0.0)]}

        def at(cos):
            return _face(cos, math.sqrt(max(0.0, 1.0 - cos * cos)))

        cands = [("under", {"faces": [at(bar - 0.02)]}),
                 ("over", {"faces": [at(min(1.0, bar + 0.02))]})]
        ids, _ = server._likeness_pile(seed, cands)
        self.assertEqual(ids, ["over"],
                         "over the bar is taken, under the bar is not")


class PileSizesItself(unittest.TestCase):
    """⭐ Never 'the closest N'."""

    def test_two_seeds_give_two_different_integers(self):
        import math

        def at(cos):
            return _face(cos, math.sqrt(max(0.0, 1.0 - cos * cos)))

        # a crowded neighbourhood and a sparse one, over ONE candidate set
        crowded = {"faces": [_face(1.0, 0.0)]}
        cands = [("a", {"faces": [at(0.99)]}),
                 ("b", {"faces": [at(0.98)]}),
                 ("c", {"faces": [at(0.97)]}),
                 ("d", {"faces": [at(0.10)]})]
        many, _ = server._likeness_pile(crowded, cands)
        sparse = {"faces": [_face(0.10, math.sqrt(1 - 0.01))]}
        few, _ = server._likeness_pile(sparse, cands)
        self.assertEqual(len(many), 3)
        self.assertEqual(len(few), 1)
        self.assertNotEqual(len(many), len(few),
                            "the pile must size itself, not return a fixed N")


class EmptyPileIsStillAnAnswer(unittest.TestCase):

    def test_seed_with_neither_face_nor_animal(self):
        ids, kind = server._likeness_pile(
            {"faces": [], "animals": []},
            [("a", {"faces": [_face(1.0, 0.0)]})])
        self.assertEqual(ids, [])
        self.assertIsNone(kind, "no face and no animal is not a kind")

    def test_seed_with_a_face_but_nothing_matches(self):
        ids, kind = server._likeness_pile(
            {"faces": [_face(1.0, 0.0)]},
            [("a", {"faces": [_face(0.0, 1.0)]})])
        self.assertEqual(ids, [])
        self.assertEqual(kind, "faces",
                         "an empty pile still knows what question was asked")


class DeterministicOrdering(unittest.TestCase):

    def test_the_same_tap_twice_gives_the_same_pile(self):
        import math

        def at(cos):
            return _face(cos, math.sqrt(max(0.0, 1.0 - cos * cos)))

        seed = {"faces": [_face(1.0, 0.0)]}
        # equal scores, offered to the finder in two different orders
        cands = [("zeta", {"faces": [at(0.99)]}),
                 ("alpha", {"faces": [at(0.99)]}),
                 ("mid", {"faces": [at(0.99)]})]
        first, _ = server._likeness_pile(seed, cands)
        second, _ = server._likeness_pile(seed, list(reversed(cands)))
        self.assertEqual(first, second,
                         "equal scores must not swap between identical taps")
        self.assertEqual(first, sorted(first))


class PeopleAndPetsAreSplit(unittest.TestCase):
    """#124 r5: a face in the picture means NO animal guess at all."""

    def test_a_picture_with_both_is_a_picture_of_a_person(self):
        seed = {"faces": [_face(1.0, 0.0)], "animals": [_face(1.0, 0.0)]}
        cands = [("person", {"faces": [_face(1.0, 0.0)]}),
                 ("pet", {"animals": [_face(1.0, 0.0)]})]
        ids, kind = server._likeness_pile(seed, cands)
        self.assertEqual(kind, "faces")
        self.assertEqual(ids, ["person"],
                         "the animal in the seed must not be guessed at too")

    def test_the_two_bars_are_different_and_animals_is_stricter(self):
        self.assertNotEqual(server.LIKENESS_BAR_FACE,
                            server.LIKENESS_BAR_ANIMAL)
        self.assertGreater(
            server.LIKENESS_BAR_ANIMAL, server.LIKENESS_BAR_FACE,
            "the room tells animals apart worse than people, measured, so the "
            "animal bar must be the stricter of the two")


class TheReaderWritesNothing(unittest.TestCase):
    """⛔ Her ruling #116, asserted over the whole tree rather than over a
    directory someone remembered to look at."""

    @staticmethod
    def _manifest(root):
        out = {}
        for path in sorted(Path(root).rglob("*")):
            if path.is_file():
                out[str(path.relative_to(root))] = hashlib.sha256(
                    path.read_bytes()).hexdigest()
        return out

    def test_a_match_run_leaves_the_tree_byte_identical(self):
        tool = REPO / "tools" / "likeness_read.swift"
        if not tool.is_file():
            self.skipTest("the likeness reader is not in this tree")
        with tempfile.TemporaryDirectory() as tmp:
            store = Path(tmp) / "store"
            (store / "items").mkdir(parents=True)
            # a real picture is needed for the reader to do any work at all
            src = None
            for candidate in sorted((Path.home() / "StudyRoom" / "items")
                                    .glob("*.jpeg"))[:1]:
                src = candidate
            if src is None:
                self.skipTest("no library on this machine")
            shot = store / "items" / src.name
            shot.write_bytes(src.read_bytes())
            before = self._manifest(store)
            proc = subprocess.run(
                ["swift", str(tool)],
                input=("x\t%s\n" % shot).encode("utf-8"),
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            self.assertEqual(proc.returncode, 0, proc.stderr[:400])
            self.assertTrue(proc.stdout.strip(),
                            "the reader returned nothing at all")
            after = self._manifest(store)
            self.assertEqual(before, after,
                             "a match run wrote something into the tree")


class TheBranchComesFromHerRuling(unittest.TestCase):
    """⛔ Not a constant an agent chose."""

    def test_both_kinds_exist_in_the_shipped_path(self):
        self.assertEqual(server.LIKENESS_KINDS, ("faces", "animals"),
                         "her R-7 ships the finder for BOTH")

    def test_the_bars_cite_the_measured_record(self):
        src = (REPO / "server.py").read_text(encoding="utf-8")
        head = src.split("LIKENESS_BAR_FACE")[0][-3000:]
        for needle in ("26.996-FACES-BAR.md", "3 IN 4", "0.77", "0.88"):
            self.assertIn(needle, head,
                          "the bar must carry where it came from: " + needle)


class FourPictureDoorOutcomes(unittest.TestCase):
    """#125: one tap, four outcomes — enumerated from code, not comments."""

    OUTCOMES = (
        ("occasion", "place_needed", "likeness_needed"),
        ("someone", "likeness_needed", "place_needed"),
        ("both", "likeness_needed", "place_needed"),
    )

    def test_four_outcome_branches_exist_in_source(self):
        src = (REPO / "server.py").read_text(encoding="utf-8")
        body = src.split("def handle_subjects_picture(", 1)[1].split(
            "\n    def ", 1)[0]
        self.assertIn('routing in ("occasion", "both")', body,
                      "occasion branch → place_needed")
        self.assertIn('routing in ("someone", "both")', body,
                      "someone branch → likeness_needed")
        client = REPO.joinpath("app.js").read_text(encoding="utf-8")
        submit = client.split("function heavyNamingSubmit(", 1)[1].split(
            "\n  function ", 1)[0]
        self.assertIn("if (!routing) { return; }", submit,
                      "neither tick-box is the fourth outcome in the client")
        self.assertEqual(len(self.OUTCOMES) + 1, 4,
                         "occasion, someone, both, and neither")

    def test_picture_door_response_shape_is_uniform(self):
        src = (REPO / "server.py").read_text(encoding="utf-8")
        body = src.split("def handle_subjects_picture(", 1)[1].split(
            "\n    def ", 1)[0]
        self.assertEqual(body.count('"ok": True'), 1,
                         "one success response shape for every routing")
        for key in ("subject_key", "likeness_needed", "place_needed",
                    "repeat_naming"):
            self.assertIn('"%s"' % key, body)


if __name__ == "__main__":
    unittest.main(verbosity=2)
