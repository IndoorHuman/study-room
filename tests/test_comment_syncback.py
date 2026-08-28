#!/usr/bin/env python3
"""
tests/test_comment_syncback.py — the byte-untouched comment sync-back proof
(Phase 26.4, Plan 05, Wave 0).

append_comment is THE ONE new byte path into the user's live, iCloud-synced
Obsidian vault, so it is machine-tested exactly like never-list integrity: a
single failing byte above the appended `## Comments` section is a P0. This
suite is the held-out invariant the objective names (D-12) and joins the
shipped gate.

Stdlib only (unittest + tempfile) — the zero-dependency law. Every fixture is
built in a fresh TemporaryDirectory; nothing on disk is a binary fixture.

Coverage (26.4-05 Task 1 + Task 2):

  Task 1 — append_comment (study_lib.append_comment)
    1. section CREATED once when absent — the original bytes are a strict,
       byte-identical prefix of the result; a second append does NOT create a
       second `## Comments` heading (append-only, one section).
    2. byte-untouched ABOVE across fixtures — LF, CRLF, no-trailing-newline,
       and an existing MID-FILE `## Comments` (with a `## Related` block after
       it): every byte above the section is byte-identical after the append,
       and the trailing section is never re-serialized.
    3. JAIL — a path OUTSIDE the vault root and a NON-.md path are refused
       (return False), with the file's bytes left exactly as they were; a
       `..` traversal / absolute escape is refused too.
    4. iCLOUD — an un-downloaded placeholder (a `.<name>.icloud` sibling) is
       skipped (return False, no write), never triggering a download.

  Task 2 — the guarded gate (study_lib.sync_eligible_target) + persistence
    5. sync OFF (default/absent flag) => None => the writer is never reached
       => zero vault bytes change.
    6. sync ON + eligible (source obsidian-vault, .md under the vault root)
       => a target => append writes.
    7. sync ON + INELIGIBLE (a non-vault source, or a missing vault_root)
       => None => the comment stays local-only, no vault write, no error.
"""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import study_lib  # noqa: E402


def _heading_count(data):
    """How many times `## Comments` appears as a heading line (line-anchored),
    so 'created once' can be asserted directly on bytes."""
    n = 0
    i = data.find(study_lib.COMMENT_SECTION)
    L = len(study_lib.COMMENT_SECTION)
    while i != -1:
        at_start = (i == 0 or data[i - 1:i] == b"\n")
        after = data[i + L:i + L + 1]
        if at_start and after in (b"", b"\n", b"\r"):
            n += 1
        i = data.find(study_lib.COMMENT_SECTION, i + 1)
    return n


class TestSectionCreatedOnce(unittest.TestCase):
    def test_created_once_prefix_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            note = root / "note.md"
            original = b"# A note\n\nsome body text.\n"
            note.write_bytes(original)

            ok = study_lib.append_comment(
                str(root), str(note), "first thought", "2026-07-22T10:00:00-07:00")
            self.assertTrue(ok, "an in-root .md must accept the append")
            after1 = note.read_bytes()
            # the whole original is an unmodified prefix of the result
            self.assertTrue(after1.startswith(original),
                            "every original byte must survive as a prefix")
            self.assertEqual(_heading_count(after1), 1, "section created once")
            self.assertIn(b"- 2026-07-22T10:00:00-07:00: first thought", after1)

            # a SECOND append reuses the one section — never a duplicate
            ok2 = study_lib.append_comment(
                str(root), str(note), "second thought",
                "2026-07-22T11:00:00-07:00")
            self.assertTrue(ok2)
            after2 = note.read_bytes()
            self.assertTrue(after2.startswith(after1),
                            "the second append leaves the first bytes intact")
            self.assertEqual(_heading_count(after2), 1,
                             "still exactly one ## Comments section")
            self.assertIn(b"- 2026-07-22T11:00:00-07:00: second thought", after2)


class TestByteUntouchedAbove(unittest.TestCase):
    def _prefix_above(self, data):
        """The bytes strictly above a `## Comments` heading, or the whole
        file when there is none yet (the created case appends at/after EOF)."""
        off = study_lib._comments_heading_offset(data)
        return data if off is None else data[:off]

    def _assert_above_identical(self, root, original):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "n.md"
            note.write_bytes(original)
            above = self._prefix_above(original)
            ok = study_lib.append_comment(
                str(tmp), str(note), "margin note", "2026-07-22T09:30:00Z")
            self.assertTrue(ok)
            after = note.read_bytes()
            self.assertEqual(after[:len(above)], above,
                             "every byte above the section must be identical")
            # the section (new or pre-existing) holds the entry
            self.assertIn(b"- 2026-07-22T09:30:00Z: margin note", after)
            self.assertEqual(_heading_count(after), 1)
            return after

    def test_lf_file(self):
        self._assert_above_identical(None, b"# Title\n\nbody line one.\n")

    def test_crlf_file(self):
        # a Windows-exported note: the \r\n prefix must be preserved BYTE for
        # byte (no LF fold on the way past — the Pitfall-3 case)
        self._assert_above_identical(None, b"# Title\r\n\r\nbody line.\r\n")

    def test_no_trailing_newline(self):
        self._assert_above_identical(None, b"a note with no final newline")

    def test_existing_midfile_section(self):
        # a vault note where `## Comments` sits BEFORE a `## Related` block:
        # the entry lands inside the Comments section, everything above stays
        # byte-identical, and Related survives untouched below.
        original = (b"---\ntitle: x\n---\n\n# Body\n\nprose.\n\n"
                    b"## Comments\n- 2026-01-01T00:00:00Z: an older note\n\n"
                    b"## Related\n- [[Something]]\n")
        after = self._assert_above_identical(None, original)
        self.assertIn(b"## Related\n- [[Something]]\n", after,
                      "the section below Comments is untouched")
        # the new entry precedes the Related heading (inside the section)
        self.assertLess(after.index(b"margin note"), after.index(b"## Related"))
        self.assertIn(b"an older note", after)


class TestJail(unittest.TestCase):
    def test_out_of_root_refused(self):
        with tempfile.TemporaryDirectory() as vault, \
                tempfile.TemporaryDirectory() as outside:
            note = Path(outside) / "secret.md"
            original = b"# outside the vault\n"
            note.write_bytes(original)
            ok = study_lib.append_comment(
                str(vault), str(note), "nope", "2026-07-22T00:00:00Z")
            self.assertFalse(ok, "a path outside the vault root is refused")
            self.assertEqual(note.read_bytes(), original,
                             "an out-of-root file is never written")

    def test_non_md_refused(self):
        with tempfile.TemporaryDirectory() as vault:
            f = Path(vault) / "note.txt"
            original = b"not markdown\n"
            f.write_bytes(original)
            ok = study_lib.append_comment(
                str(vault), str(f), "nope", "2026-07-22T00:00:00Z")
            self.assertFalse(ok, "a non-.md target is refused")
            self.assertEqual(f.read_bytes(), original)

    def test_traversal_refused(self):
        with tempfile.TemporaryDirectory() as vault, \
                tempfile.TemporaryDirectory() as outside:
            note = Path(outside) / "escape.md"
            note.write_bytes(b"# escape\n")
            # an origin_path that RESOLVES out of the vault via ..
            traversal = str(Path(vault) / ".." /
                            Path(outside).name / "escape.md")
            ok = study_lib.append_comment(
                str(vault), traversal, "nope", "2026-07-22T00:00:00Z")
            self.assertFalse(ok, "a .. traversal out of the vault is refused")

    def test_missing_args_refused(self):
        self.assertFalse(study_lib.append_comment("", "x.md", "t", "ts"))
        self.assertFalse(study_lib.append_comment("root", "", "t", "ts"))


class TestICloudPlaceholder(unittest.TestCase):
    def test_placeholder_skipped(self):
        with tempfile.TemporaryDirectory() as vault:
            note = Path(vault) / "note.md"
            original = b"# a real body\n"
            note.write_bytes(original)
            # the evicted-file marker: a hidden .<name>.icloud sibling makes
            # is_icloud_placeholder True even though the .md has bytes
            (Path(vault) / (".note.md.icloud")).write_bytes(b"")
            self.assertTrue(study_lib.is_icloud_placeholder(note),
                            "sanity: the sibling marker flags a placeholder")
            ok = study_lib.append_comment(
                str(vault), str(note), "nope", "2026-07-22T00:00:00Z")
            self.assertFalse(ok, "an iCloud placeholder is never written")
            self.assertEqual(note.read_bytes(), original,
                             "a placeholder's bytes are never touched")


class TestSyncGate(unittest.TestCase):
    """study_lib.sync_eligible_target — the pure gate the server checks
    before it ever reaches the writer (Task 2)."""

    def _item(self, **over):
        base = {"id": "abc", "source": "obsidian-vault",
                "origin_path": "/vault/Notes/x.md"}
        base.update(over)
        return base

    def test_off_is_none(self):
        # default/absent flag => OFF => None => zero vault mutation
        self.assertIsNone(study_lib.sync_eligible_target(
            {"vault_root": "/vault"}, self._item()))
        self.assertIsNone(study_lib.sync_eligible_target(
            {"vault_root": "/vault", "sync_comments_enabled": False},
            self._item()))
        # a truthy-but-not-True value must NOT open the gate (fail-closed)
        self.assertIsNone(study_lib.sync_eligible_target(
            {"vault_root": "/vault", "sync_comments_enabled": 1},
            self._item()))

    def test_on_and_eligible(self):
        meta = {"vault_root": "/vault", "sync_comments_enabled": True}
        target = study_lib.sync_eligible_target(meta, self._item())
        self.assertEqual(target, ("/vault", "/vault/Notes/x.md"))

    def test_on_but_ineligible_source(self):
        meta = {"vault_root": "/vault", "sync_comments_enabled": True}
        self.assertIsNone(study_lib.sync_eligible_target(
            meta, self._item(source="photos")),
            "a non-vault source stays local-only (D-10)")

    def test_on_but_no_vault_root(self):
        meta = {"sync_comments_enabled": True}
        self.assertIsNone(study_lib.sync_eligible_target(meta, self._item()),
                          "no stamped vault_root => no sync target")


class TestGuardedPersistenceEndToEnd(unittest.TestCase):
    """The Task-2 done criteria at the gate+writer level, without HTTP:
    sync OFF mutates zero vault bytes; sync ON + eligible appends; sync ON +
    ineligible stays local-only."""

    def test_off_zero_vault_mutation(self):
        with tempfile.TemporaryDirectory() as vault:
            note = Path(vault) / "Notes"
            note.mkdir()
            f = note / "x.md"
            original = b"# journalled\n"
            f.write_bytes(original)
            item = {"id": "i", "source": "obsidian-vault",
                    "origin_path": str(f)}
            meta = {"vault_root": vault, "sync_comments_enabled": False}
            target = study_lib.sync_eligible_target(meta, item)
            self.assertIsNone(target)
            # the server would NOT call the writer — prove the bytes are still
            # exactly as saved
            self.assertEqual(f.read_bytes(), original,
                             "sync OFF => zero vault mutation")

    def test_on_eligible_appends(self):
        with tempfile.TemporaryDirectory() as vault:
            f = Path(vault) / "x.md"
            f.write_bytes(b"# body\n")
            item = {"id": "i", "source": "obsidian-vault",
                    "origin_path": str(f)}
            meta = {"vault_root": vault, "sync_comments_enabled": True}
            target = study_lib.sync_eligible_target(meta, item)
            self.assertIsNotNone(target)
            ok = study_lib.append_comment(
                target[0], target[1], "a thought", "2026-07-22T12:00:00Z")
            self.assertTrue(ok)
            self.assertIn(b"## Comments", f.read_bytes())
            self.assertIn(b"a thought", f.read_bytes())

    def test_on_ineligible_local_only(self):
        with tempfile.TemporaryDirectory() as vault:
            f = Path(vault) / "x.md"
            original = b"# body\n"
            f.write_bytes(original)
            item = {"id": "i", "source": "photos", "origin_path": str(f)}
            meta = {"vault_root": vault, "sync_comments_enabled": True}
            self.assertIsNone(study_lib.sync_eligible_target(meta, item))
            self.assertEqual(f.read_bytes(), original,
                             "an ineligible item never writes to the vault")


if __name__ == "__main__":
    unittest.main(verbosity=2)
