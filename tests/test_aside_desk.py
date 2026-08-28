# -*- coding: utf-8 -*-
"""26.996-10 — local aside desk card: empty, one-ask, hold-back, off-wire."""
from __future__ import annotations

import hashlib
import inspect
import json
import os
import tempfile
import unittest
from unittest import mock

import server
import study_lib


def _write_subjects(lib, entries):
    os.makedirs(os.path.join(lib, "librarian"), exist_ok=True)
    study_lib.save_subjects(lib, entries)


class AsideDeskComposeTest(unittest.TestCase):
    def test_empty_sentence_means_no_card(self):
        with tempfile.TemporaryDirectory() as lib:
            _write_subjects(lib, [{
                "key": "k1", "name": "FINDABLE-NAME-XYZ",
                "status": "aside", "ms": 1_700_000_000_000,
                "item_ids": [], "origin": "named",
            }])
            with mock.patch.object(server, "ASIDE_DESK_SENTENCE", ""):
                self.assertIsNone(server._compose_aside_desk(lib))

    def test_hold_back_leaves_ask_unspent(self):
        """Zero or many aside subjects → hold-back; ask file unchanged."""
        with tempfile.TemporaryDirectory() as lib:
            _write_subjects(lib, [])
            before = hashlib.sha256(
                json.dumps(server._load_aside_asked(lib)).encode()).hexdigest()
            with mock.patch.object(server, "ASIDE_DESK_SENTENCE",
                                   "what you wrote at the end of {when}"):
                self.assertIsNone(server._compose_aside_desk(lib))
            after = hashlib.sha256(
                json.dumps(server._load_aside_asked(lib)).encode()).hexdigest()
            self.assertEqual(before, after)

            _write_subjects(lib, [
                {"key": "a", "name": "A", "status": "aside", "ms": 1,
                 "item_ids": [], "origin": "named"},
                {"key": "b", "name": "B", "status": "aside", "ms": 2,
                 "item_ids": [], "origin": "named"},
            ])
            with mock.patch.object(server, "ASIDE_DESK_SENTENCE",
                                   "what you wrote at the end of {when}"):
                self.assertIsNone(server._compose_aside_desk(lib))
            self.assertEqual(
                server._load_aside_asked(lib), [],
                "hold-back must not spend the ask")

    def test_one_ask_ever_and_name_never_in_text(self):
        with tempfile.TemporaryDirectory() as lib:
            name = "FINDABLE-NAME-XYZ"
            _write_subjects(lib, [{
                "key": "k1", "name": name, "status": "aside",
                "ms": 1_700_000_000_000, "item_ids": [], "origin": "named",
            }])
            with mock.patch.object(server, "ASIDE_DESK_SENTENCE",
                                   "what you wrote at the end of {when}"):
                card = server._compose_aside_desk(lib)
                self.assertIsNotNone(card)
                self.assertNotIn(name, card["text"])
                self.assertNotIn(name[:4], card["text"])
                server._record_aside_asked(lib, card["subject_key"])
                self.assertIsNone(server._compose_aside_desk(lib),
                                  "second compose after ask spends to 0")

    def test_quiet_is_separate_from_asked(self):
        with tempfile.TemporaryDirectory() as lib:
            _write_subjects(lib, [{
                "key": "k1", "name": "X", "status": "aside",
                "ms": 1_700_000_000_000, "item_ids": [], "origin": "named",
            }])
            server._record_aside_quiet(lib, "k1")
            with mock.patch.object(server, "ASIDE_DESK_SENTENCE",
                                   "what you wrote at the end of {when}"):
                self.assertIsNone(server._compose_aside_desk(lib))
            self.assertEqual(server._load_aside_asked(lib), [])

    def test_fail_open_four_ways(self):
        with tempfile.TemporaryDirectory() as lib:
            # absent
            self.assertEqual(server._load_aside_asked(lib), [])
            self.assertEqual(server._load_aside_quiet(lib), [])
            d = os.path.join(lib, "librarian")
            os.makedirs(d, exist_ok=True)
            # empty
            with open(os.path.join(d, "aside-asked.json"), "w") as f:
                f.write("")
            self.assertEqual(server._load_aside_asked(lib), [])
            # invalid json
            with open(os.path.join(d, "aside-asked.json"), "w") as f:
                f.write("{")
            self.assertEqual(server._load_aside_asked(lib), [])
            # wrong shape
            with open(os.path.join(d, "aside-asked.json"), "w") as f:
                f.write(json.dumps({"nope": 1}))
            self.assertEqual(server._load_aside_asked(lib), [])

    def test_hold_back_and_ask_spent_are_separate_conditions(self):
        src = inspect.getsource(server._compose_aside_desk)
        self.assertIn("len(aside) != 1", src)
        self.assertIn("_load_aside_asked", src)
        self.assertNotEqual(
            src.find("len(aside) != 1"),
            src.find("_load_aside_asked"))

    def test_writers_do_not_take_the_lock(self):
        for fn in (server._record_aside_asked, server._record_aside_quiet):
            src = inspect.getsource(fn)
            self.assertNotIn("_LIBRARIAN_FILES_LOCK", src)
            self.assertNotIn("with ", src.split("atomic_write_bytes")[0]
                             if "atomic_write_bytes" in src else src)

    def test_quiet_path_never_touches_sent_neighbour(self):
        quiet = inspect.getsource(server.StudyHandler.handle_aside_desk_quiet)
        writer = inspect.getsource(server._record_aside_quiet)
        self.assertNotIn("dismissed", quiet)
        self.assertNotIn("_load_dismissed", quiet)
        self.assertNotIn("handle_librarian_dismiss", quiet)
        self.assertNotIn("dismissed.json", writer)
        self.assertIn("aside-quiet.json", writer)


class AsideDeskOffWireTest(unittest.TestCase):
    """One payload-builder scan covering all aside record loaders."""

    FORBIDDEN = (
        "_load_aside_asked", "_load_aside_quiet",
        "aside-asked.json", "aside-quiet.json",
        "load_subjects", "load_kept_back",
    )

    def test_builders_name_none_of_the_aside_records(self):
        builders = [
            study_lib.build_librarian_payload,
            server._compose_note_stdin,
        ]
        for builder in builders:
            src = inspect.getsource(builder)
            for token in self.FORBIDDEN:
                if token in ("load_subjects", "load_kept_back"):
                    # subjects loaders are also banned from builders
                    pass
                self.assertNotIn(
                    token, src,
                    f"{builder.__name__} must not name {token}")

    def test_driven_payload_holds_neither_name_nor_ask(self):
        from tests.test_librarian_fence import make_item, make_store, payload_blob
        with tempfile.TemporaryDirectory() as lib:
            name = "FINDABLE-NAME-XYZ"
            os.makedirs(os.path.join(lib, "librarian"), exist_ok=True)
            study_lib.save_subjects(lib, [{
                "key": "k1", "name": name, "status": "aside",
                "ms": 1, "item_ids": [], "origin": "named",
            }])
            server._record_aside_asked(lib, "k1")
            server._record_aside_quiet(lib, "k1")
            item = make_item(lib, 1, state="blessed", body="ordinary note")
            store = make_store(lib, [item])
            payload, blob = payload_blob(store, "presort", False)
            stdin = server._compose_note_stdin(payload, lib)
            for hay in (blob, stdin):
                self.assertNotIn(name, hay)
                self.assertNotIn("aside-asked", hay)
                self.assertNotIn("aside-quiet", hay)


if __name__ == "__main__":
    unittest.main()
