#!/usr/bin/env python3
"""
Startup-migration proof (Phase 26.4, Plan 06 — T-26.4-34/35, SRM-05).

The v3 SCHEMA_VERSION bump would leave the LIVE schema_version==2 store
rejected by load_store (study_lib.py:727, `!= SCHEMA_VERSION`) unless the
server's startup migration is generalized to migrate ANY store with
schema_version < SCHEMA_VERSION. Without that, both server startup AND the
whole-vault import (import_folder calls load_store first) would raise
StoreCorruptError on the un-migrated v2 store.

This suite is the machine proof that server._migrate_if_needed takes a live
v2 store to v3 without StoreCorruptError, that load_store then ACCEPTS it,
that the reflects facet is backfilled from snapshot frontmatter, and that a
version-suffixed pre-migration backup (items.json.v2.bak) is written holding
the original v2 bytes.

Stdlib only (unittest + tempfile). No live store, no socket, no port —
_migrate_if_needed takes WRITE_LOCK itself and touches only the temp library.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import study_lib  # noqa: E402
import server  # noqa: E402  — a plain import binds no socket


REFLECTS_FRONTMATTER = (
    "---\n"
    "title: \"The Boundary Has a Name Now\"\n"
    "type: note\n"
    "source: personal\n"
    "reflects:\n"
    "  - \"Memoir/Memoir 26 July 15.md\"\n"
    "  - \"Memoir/日记 26年7月14日.md\"\n"
    "---\n"
    "\n"
    "The 7/15 entry marks a shift...\n"
)

PLAIN_FRONTMATTER = (            # same folder, NO reflects: key — the dictionary
    "---\n"
    "title: \"Dream Symbol Dictionary 梦境意象词典\"\n"
    "type: note\n"
    "source: personal\n"
    "---\n"
    "\n"
    "A reference dictionary, not a reflection.\n"
)


def _v2_item(item_id, library_path, reflects_seed=False):
    """A schema-v2-shaped obsidian-vault TEXT item under Journal analysis.
    The v2 store carries NO reflects facet — the migration must backfill it."""
    return {
        "id": item_id,
        "content_hash": item_id * 4,
        "source": "obsidian-vault",
        "origin_path": f"/vault/Claude's observation/Journal analysis/{item_id}.md",
        "library_path": library_path,
        "type": "text",
        "title": f"{item_id}.md",
        "created_ms": 1700000000000,
        "saved_ms": 1700000000000,
        "imported_ms": 1700000000000,
        "last_opened_ms": None,
        "state": "unseen",
        "resting_until_ms": None,
        "tags": [],
        "trigger": False,
        "year": 2023,
        "folder": "Journal analysis",
        "history": [],
    }


class StartupMigrationV2toV3Test(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name) / "library"
        (self.root / "items").mkdir(parents=True)
        # two obsidian-vault text items in Journal analysis: one whose
        # snapshot carries a reflects: key, one that does not
        (self.root / "items" / "aaaa000000000001.md").write_text(
            REFLECTS_FRONTMATTER, encoding="utf-8")
        (self.root / "items" / "bbbb000000000002.md").write_text(
            PLAIN_FRONTMATTER, encoding="utf-8")
        self.refl_id = "aaaa000000000001"
        self.plain_id = "bbbb000000000002"
        store = {
            "schema_version": 2,
            "meta": study_lib.new_store(self.root)["meta"],
            "items": {
                self.refl_id: _v2_item(
                    self.refl_id, "items/aaaa000000000001.md"),
                self.plain_id: _v2_item(
                    self.plain_id, "items/bbbb000000000002.md"),
            },
        }
        # the meta from new_store is v3-shaped but additive — a v2 store may
        # legitimately carry it; schema_version is what gates the migration
        store["schema_version"] = 2
        self.store_path = self.root / "items.json"
        self.store_path.write_text(
            json.dumps(store, ensure_ascii=False, indent=1), encoding="utf-8")
        self.original_v2_bytes = self.store_path.read_bytes()

    def tearDown(self):
        self._tmp.cleanup()

    def test_v2_store_reaches_v3_and_load_store_accepts(self):
        # (a) the migration runs without raising and bumps the version
        server._migrate_if_needed(self.root)
        on_disk = json.loads(self.store_path.read_text(encoding="utf-8"))
        self.assertEqual(on_disk["schema_version"], 3,
                         "the live v2 store is migrated to v3 at startup")

        # (b) load_store now ACCEPTS it (no StoreCorruptError)
        loaded = study_lib.load_store(self.root)
        self.assertEqual(loaded["schema_version"], 3)

        # (c) reflects is backfilled; is_reflection agrees
        refl = loaded["items"][self.refl_id]
        plain = loaded["items"][self.plain_id]
        self.assertTrue(refl.get("reflects"),
                        "the reflects-bearing item is stamped at v2->3")
        self.assertTrue(study_lib.is_reflection(refl),
                        "the backfilled item satisfies is_reflection")
        self.assertFalse(plain.get("reflects"),
                         "the dictionary (no reflects key) stays unstamped")
        self.assertFalse(study_lib.is_reflection(plain),
                         "the dictionary is not a reflection")

        # (d) a version-suffixed pre-migration backup holds the v2 bytes
        backup = self.store_path.with_name("items.json.v2.bak")
        self.assertTrue(backup.exists(),
                        "a pre-v3 backup items.json.v2.bak is written")
        self.assertEqual(backup.read_bytes(), self.original_v2_bytes,
                         "the backup holds the ORIGINAL v2 bytes, unchanged")

    def test_migration_is_idempotent_second_start_is_noop(self):
        server._migrate_if_needed(self.root)
        after_first = self.store_path.read_bytes()
        backup_after_first = (
            self.store_path.with_name("items.json.v2.bak").read_bytes())
        # a second startup finds a v3 store — no rewrite, no clobbered backup
        server._migrate_if_needed(self.root)
        self.assertEqual(self.store_path.read_bytes(), after_first,
                         "a v3 store is a no-op on the next start")
        self.assertEqual(
            self.store_path.with_name("items.json.v2.bak").read_bytes(),
            backup_after_first,
            "repeated starts never clobber the true pre-migration backup")


if __name__ == "__main__":
    unittest.main(verbosity=1)
