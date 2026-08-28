#!/usr/bin/env python3
"""
study_lib.py unit tests (Phase 22, Plan 01 — the import/library engine).

study_lib.py is the Study Room's headless library trunk: it owns every
items.json write and every import-walk guarantee in ONE place, so the HTTP
server (Plan 22-02) and future adapters share a single implementation. Like
the house's palace_lib.py, it is a plain underscore module — the very first
test is a plain `import study_lib`, which IS the importability proof
(binds no socket, performs no I/O at import time).

This suite covers (SRM-02, D-04/D-05/D-06/D-08):

  1. walker/classify   — a mixed corpus imports exactly the md/txt/png/jpg
                         files; HEIC, hidden, zero-byte, iCloud-placeholder,
                         oversized, unknown-extension, and symlink entries are
                         skipped WITH per-reason counts, never silently.
  2. originals intact  — D-05: import copies (shutil.copy2 snapshots under
                         <library>/items/<id><ext>); source bytes untouched.
  3. content-hash IDs  — D-08: same bytes → same 16-hex id; CRLF and LF text
                         variants hash identically (line endings normalized
                         before hashing for text; image bytes hashed raw);
                         full 64-hex hash stored in content_hash.
  4. dedup no-op       — D-08: re-import never resets state, last_opened_ms,
                         or history (blessed stays blessed).
  5. atomic write      — D-06: a crash between temp-write and rename leaves
                         the previous items.json intact; no temp files leak.
  6. store integrity   — load_store raises StoreCorruptError on truncated
                         JSON and wrong schema_version; it NEVER hands back a
                         fresh empty store when the file exists but is
                         unreadable (blessing history is sacred).
  7. state validation  — validate_state_change rejects unknown states,
                         guards transitions out of "retired" behind
                         via == "management-dig-out", accepts ordinary
                         revisions between the other four states (SRM-01).
  8. path validation   — validate_source_path expands ~, resolves symlinks,
                         rejects non-existent paths, files, the library root
                         (and anything inside it), and the filesystem root.
  9. dates             — D-04: created_ms falls back to st_mtime when
                         st_birthtime is unavailable; saved_ms = st_mtime;
                         both integer epoch ms.
 10. attachments       — 22-uat: a picture a note links to (Obsidian
                         wikilink ![[name.ext]] / ![[name.ext|alias]] or
                         markdown ![alt](name.ext), %-encoded or not) is an
                         ATTACHMENT: copied into the library with its note,
                         recorded on the note's entry, never cataloged as a
                         standalone item. Unreferenced pictures import
                         exactly as before; re-import stays idempotent.
 11. prefix rule       — 22-uat: a sibling image named
                         <note stem>_<n>_<author>_... is that note's
                         attachment by filename convention even when the
                         body never embeds it (the vault's clipped-post
                         screenshots). Matching is case-insensitive and
                         NFC-normalized on both sides (macOS hands back NFD
                         names); body references claim first; the longest
                         matching stem wins deterministically; nothing is
                         ever copied twice.
 12. migration         — Phase 23 (SRM-05): migrate_store fills the four
                         new meta keys and backfills year/folder/
                         screenshots idempotently; load_store refuses v1
                         AND v3; create_server migrates a v1 store once
                         with a one-time items.json.v1.bak backup that is
                         never clobbered; unknown/newer versions are never
                         rewritten.
 13. detection         — Phase 23 (D-05): screenshot filename patterns
                         (incl. 截屏/截图 and the IMG_*.png iOS rule) fire
                         without bytes; png_dims / jpeg_dims decode
                         struct-built headers and return None on garbage;
                         the device-size table confirms both orientations.
 14. facet stamping    — Phase 23 (D-05): import stamps year (int) /
                         folder / the 'screenshots' tag on new items;
                         re-import neither doubles the tag nor rewrites
                         facets on deduped items.
 15. adapters          — Phase 25 (SRM-08, D-02): the ADAPTERS registry
                         picks the first matching detect (chatgpt-export /
                         claude-export / obsidian-vault / folder-drop last);
                         ChatGPT conversations convert via the canonical
                         current_node -> parent walk (never a create_time
                         sort); Claude chat_messages convert linearly with
                         the ISO-Z shim; converted items are VERBATIM
                         role-labeled markdown with created_ms from the
                         export's own stamps; malformed conversations are
                         skipped WITH counts; oversized conversations are
                         skipped, never truncated; an over-cap export file
                         is refused in plain words; synth item names are
                         server-generated (a hostile title never steers the
                         write path); dedup survives re-import; the
                         progress_cb seam fires once per processed unit and
                         changes nothing when absent.

Stdlib only (unittest + tempfile + mock) — honours the zero-dependency law
(D-01/D-03). Every scenario builds its corpus inside a fresh
tempfile.TemporaryDirectory(); no on-disk binary fixtures — the 1x1 PNG is
written from an embedded base64 constant, and the migration/detection image
headers are built inline with struct; file ages are controlled with
os.utime. Nothing ever touches real user data (the live-store migration is
proven at UAT, never here).
"""
import base64
import json
import os
import re
import shutil
import struct
import sys
import tempfile
import unicodedata
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

# study_lib.py is a plain (underscore) module at the repo root. Adding the
# repo root to sys.path lets a plain `import study_lib` resolve regardless of
# the cwd the test runner was invoked from — and the import itself proves the
# library binds no socket and performs no I/O at import time.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import server  # noqa: E402  — for the startup-migration tests (Test 12)
import study_lib  # noqa: E402  — the importability proof

# A valid 1x1 transparent PNG, embedded so no binary fixture lives on disk.
PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
    "AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def build_corpus(src: Path) -> dict:
    """Build the mixed import corpus of Test 1 inside `src`. Returns a map of
    logical-name -> Path for the files the tests reference later."""
    paths = {}

    # -- the 5 importable files (2 md, 1 txt, 1 png, 1 jpg) --
    p = src / "note-lf.md"
    p.write_bytes(b"# Note one\nline two\n")
    paths["note_lf"] = p

    p = src / "note-crlf.md"  # saved with CRLF line endings (different content)
    p.write_bytes(b"# Note two\r\nwindows line endings\r\n")
    paths["note_crlf"] = p

    sub = src / "sub"
    sub.mkdir()
    p = sub / "plain.txt"  # in a subdirectory — proves recursion
    p.write_bytes(b"a plain text note\n")
    paths["plain_txt"] = p

    p = src / "tiny.png"
    p.write_bytes(PNG_1x1)
    paths["tiny_png"] = p

    p = src / "photo.jpg"
    p.write_bytes(PNG_1x1 + b"jpg-variant")  # distinct bytes from tiny.png
    paths["photo_jpg"] = p

    # -- the skipped files --
    (src / "pic.heic").write_bytes(b"heic-bytes")            # heic -> skip
    (src / ".hidden.md").write_bytes(b"# hidden\n")          # hidden dotfile
    (src / "empty.md").write_bytes(b"")                      # zero-byte file
    (src / "data.foo").write_bytes(b"mystery")               # unknown extension

    big = src / "big.md"                                     # text > 2 MB (sparse)
    with open(big, "wb") as f:
        f.seek(study_lib.MAX_TEXT_BYTES)
        f.write(b"x")

    os.symlink(paths["plain_txt"], src / "link.txt")         # symlink to a text file

    # iCloud placeholder pair: zero-size file + hidden `.<name>.icloud` sibling
    (src / "evicted.jpg").write_bytes(b"")
    (src / ".evicted.jpg.icloud").write_bytes(b"plist-stub")

    return paths


class TestWalkerClassify(unittest.TestCase):
    """Test 1 — walker rules: exactly 5 imports, per-reason skip counts."""

    def test_mixed_corpus_import_and_skip_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            build_corpus(src)

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["imported"], 5,
                             "exactly 5 items import: 2 md + 1 txt + 1 png + 1 jpg")
            store = study_lib.load_store(lib)
            self.assertEqual(len(store["items"]), 5)

            skipped = report["skipped"]
            self.assertEqual(skipped["heic"], 1, "heic counted, not silent")
            self.assertGreaterEqual(skipped["hidden"], 1, "hidden dotfiles counted")
            self.assertEqual(skipped["icloud"], 2,
                             "zero-byte file + evicted iCloud stub counted")
            self.assertEqual(skipped["oversize"], 1, "oversized text counted")
            self.assertEqual(skipped["unknown"], {".foo": 1},
                             "unknown extensions counted by extension")
            self.assertEqual(skipped["symlink"], 1, "symlink skipped, never followed")

            # types classified per the walking-rules table
            types = sorted(i["type"] for i in store["items"].values())
            self.assertEqual(types, ["image", "image", "text", "text", "text"])

            # the report is persisted for the UI (meta.last_import_report)
            self.assertEqual(store["meta"]["last_import_report"], report)


class TestOriginalsUntouched(unittest.TestCase):
    """Test 2 — D-05: import copies; every source byte identical afterwards."""

    def test_source_bytes_identical_and_snapshots_in_library(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            build_corpus(src)

            before = {}
            for p in sorted(src.rglob("*")):
                if p.is_file() and not p.is_symlink():
                    before[p] = p.read_bytes()

            study_lib.import_folder(src, lib)

            for p, data in before.items():
                self.assertEqual(p.read_bytes(), data,
                                 f"source file modified by import: {p.name}")

            store = study_lib.load_store(lib)
            for item in store["items"].values():
                snap = lib / item["library_path"]
                self.assertTrue(snap.is_file(),
                                f"snapshot copy missing: {item['library_path']}")
                self.assertTrue(item["library_path"].startswith("items/"),
                                "snapshots live under <library>/items/")
                self.assertTrue(snap.name.startswith(item["id"]),
                                "snapshot named <id><ext>")


class TestContentHashIds(unittest.TestCase):
    """Test 3 — D-08: content-addressed ids; CRLF folds to LF for text."""

    def test_same_bytes_same_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            a = Path(tmp) / "a.md"
            b = Path(tmp) / "b.md"
            a.write_bytes(b"# same\ncontent\n")
            b.write_bytes(b"# same\ncontent\n")
            id_a, full_a = study_lib.hash_item(a, "text")
            id_b, full_b = study_lib.hash_item(b, "text")
            self.assertEqual(id_a, id_b)
            self.assertEqual(full_a, full_b)
            self.assertRegex(id_a, r"^[0-9a-f]{16}$")
            self.assertRegex(full_a, r"^[0-9a-f]{64}$")

    def test_crlf_variant_hashes_to_same_id_as_lf(self):
        with tempfile.TemporaryDirectory() as tmp:
            lf = Path(tmp) / "lf.md"
            crlf = Path(tmp) / "crlf.md"
            cr = Path(tmp) / "cr.md"
            lf.write_bytes(b"# note\nline two\n")
            crlf.write_bytes(b"# note\r\nline two\r\n")
            cr.write_bytes(b"# note\rline two\r")
            id_lf, _ = study_lib.hash_item(lf, "text")
            id_crlf, _ = study_lib.hash_item(crlf, "text")
            id_cr, _ = study_lib.hash_item(cr, "text")
            self.assertEqual(id_lf, id_crlf,
                             "CRLF variant of an LF note hashes to the SAME id")
            self.assertEqual(id_lf, id_cr, "bare-CR variant also folds to LF")

    def test_image_bytes_hashed_raw_and_different_content_differs(self):
        with tempfile.TemporaryDirectory() as tmp:
            img1 = Path(tmp) / "one.png"
            img2 = Path(tmp) / "two.png"
            img1.write_bytes(PNG_1x1)
            img2.write_bytes(PNG_1x1 + b"altered")
            id1, _ = study_lib.hash_item(img1, "image")
            id2, _ = study_lib.hash_item(img2, "image")
            self.assertNotEqual(id1, id2, "different content -> different id")

    def test_full_hash_stored_in_content_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "one.md").write_bytes(b"# one\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            for item in store["items"].values():
                self.assertRegex(item["content_hash"], r"^[0-9a-f]{64}$")
                self.assertEqual(item["id"], item["content_hash"][:16])


class TestDedupNoOp(unittest.TestCase):
    """Test 4 — D-08: re-import is a no-op; judgments and history survive."""

    def test_second_import_dedups_and_preserves_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            build_corpus(src)

            report1 = study_lib.import_folder(src, lib)
            self.assertEqual(report1["imported"], 5)
            self.assertEqual(report1["deduped"], 0)

            # user judges one item between the two imports
            store = study_lib.load_store(lib)
            some_id = sorted(store["items"])[0]
            store["items"][some_id]["state"] = "blessed"
            store["items"][some_id]["last_opened_ms"] = 1782172800000
            store["items"][some_id]["history"].append(
                {"at": "2026-07-15T12:00:00-07:00",
                 "from": "unseen", "to": "blessed", "via": "blessing"})
            study_lib.save_store(lib, store)

            report2 = study_lib.import_folder(src, lib)
            self.assertEqual(report2["imported"], 0, "nothing new to import")
            self.assertEqual(report2["deduped"], 5, "all 5 reported as deduped")

            store2 = study_lib.load_store(lib)
            item = store2["items"][some_id]
            self.assertEqual(item["state"], "blessed",
                             "re-import must NOT reset state")
            self.assertEqual(item["last_opened_ms"], 1782172800000,
                             "re-import must NOT reset last_opened_ms")
            self.assertEqual(len(item["history"]), 2,
                             "re-import must NOT truncate history")

    def test_crlf_variant_of_imported_lf_note_dedups(self):
        with tempfile.TemporaryDirectory() as tmp:
            src1 = Path(tmp) / "src1"
            src2 = Path(tmp) / "src2"
            lib = Path(tmp) / "library"
            src1.mkdir()
            src2.mkdir()
            (src1 / "note.md").write_bytes(b"# note\nline two\n")
            (src2 / "note.md").write_bytes(b"# note\r\nline two\r\n")  # CRLF twin

            r1 = study_lib.import_folder(src1, lib)
            r2 = study_lib.import_folder(src2, lib)
            self.assertEqual(r1["imported"], 1)
            self.assertEqual(r2["imported"], 0)
            self.assertEqual(r2["deduped"], 1,
                             "CRLF text variant dedups against the LF original")
            self.assertEqual(len(study_lib.load_store(lib)["items"]), 1)


class TestAtomicWrite(unittest.TestCase):
    """Test 5 — D-06: an interrupted write leaves the previous store intact."""

    def test_crash_between_temp_write_and_rename_keeps_old_store(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            lib.mkdir()
            store = study_lib.new_store(lib)
            study_lib.save_store(lib, store)
            original = (lib / "items.json").read_bytes()

            store["meta"]["consolidation"] = True
            with mock.patch("study_lib.os.replace",
                            side_effect=OSError("simulated crash")):
                with self.assertRaises(OSError):
                    study_lib.save_store(lib, store)

            self.assertEqual((lib / "items.json").read_bytes(), original,
                             "previous store intact after interrupted write")
            strays = [p.name for p in lib.iterdir()
                      if p.name.startswith(".tmp-")]
            self.assertEqual(strays, [], "no temp files leak on the failure path")


class TestStoreIntegrity(unittest.TestCase):
    """Test 6 — corrupt stores are refused, never silently reinitialized."""

    def test_truncated_json_raises_store_corrupt(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            lib.mkdir()
            study_lib.save_store(lib, study_lib.new_store(lib))
            data = (lib / "items.json").read_bytes()
            (lib / "items.json").write_bytes(data[: len(data) // 2])  # torn write
            with self.assertRaises(study_lib.StoreCorruptError):
                study_lib.load_store(lib)

    def test_wrong_schema_version_raises_store_corrupt(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            lib.mkdir()
            bad = {"schema_version": 99, "meta": {}, "items": {}}
            (lib / "items.json").write_text(json.dumps(bad), encoding="utf-8")
            with self.assertRaises(study_lib.StoreCorruptError):
                study_lib.load_store(lib)

    def test_never_returns_fresh_store_for_unreadable_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            lib.mkdir()
            (lib / "items.json").write_text("not json at all", encoding="utf-8")
            try:
                result = study_lib.load_store(lib)
            except study_lib.StoreCorruptError:
                return  # correct: refuse, never reinitialize
            self.fail(f"load_store returned {result!r} for an unreadable store "
                      "— it must raise StoreCorruptError (blessing history is sacred)")


class TestStateChangeValidation(unittest.TestCase):
    """Test 7 — SRM-01: every judgment revisable; retired needs the dig-out."""

    def _store_with(self, item_id, state):
        store = study_lib.new_store("/tmp/lib")
        store["items"][item_id] = {
            "id": item_id, "content_hash": "0" * 64, "source": "folder-drop",
            "origin_path": "/x/note.md", "library_path": f"items/{item_id}.md",
            "type": "text", "title": "note.md", "created_ms": 1, "saved_ms": 1,
            "imported_ms": 1, "last_opened_ms": None, "state": state,
            "resting_until_ms": None, "tags": [], "trigger": False,
            "history": [],
        }
        return store

    def test_valid_states_are_exactly_the_five(self):
        self.assertEqual(set(study_lib.VALID_STATES),
                         {"unseen", "blessed", "never_show", "resting", "retired"})

    def test_rejects_unknown_state_names(self):
        store = self._store_with("a" * 16, "unseen")
        err = study_lib.validate_state_change(
            store, {"id": "a" * 16, "to": "banished", "via": "reaction"})
        self.assertIsNotNone(err, "unknown state name must be rejected")

    def test_rejects_missing_item_id(self):
        store = self._store_with("a" * 16, "unseen")
        err = study_lib.validate_state_change(
            store, {"id": "f" * 16, "to": "blessed", "via": "blessing"})
        self.assertIsNotNone(err, "unknown item id must be rejected")

    def test_leaving_retired_requires_management_dig_out(self):
        store = self._store_with("a" * 16, "retired")
        err = study_lib.validate_state_change(
            store, {"id": "a" * 16, "to": "blessed", "via": "reaction"})
        self.assertIsNotNone(err, "leaving retired without the dig-out is rejected")
        ok = study_lib.validate_state_change(
            store, {"id": "a" * 16, "to": "blessed", "via": "management-dig-out"})
        self.assertIsNone(ok, "the management dig-out may leave retired")

    def test_ordinary_revisions_between_other_states_accepted(self):
        transitions = [
            ("unseen", "blessed"), ("unseen", "never_show"),
            ("blessed", "resting"), ("blessed", "never_show"),
            ("resting", "blessed"), ("never_show", "blessed"),
            ("blessed", "retired"),
        ]
        for frm, to in transitions:
            store = self._store_with("a" * 16, frm)
            err = study_lib.validate_state_change(
                store, {"id": "a" * 16, "to": to, "via": "reaction"})
            self.assertIsNone(err, f"{frm} -> {to} must be an ordinary revision")


class TestPathValidation(unittest.TestCase):
    """Test 8 — source paths are validated before any walk."""

    def test_expands_home(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "src").mkdir()
            lib = Path(tmp) / "library"
            with mock.patch.dict(os.environ, {"HOME": tmp}):
                resolved = study_lib.validate_source_path("~/src", lib)
            self.assertEqual(Path(resolved), (Path(tmp) / "src").resolve())

    def test_resolves_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            real = Path(tmp) / "real"
            real.mkdir()
            link = Path(tmp) / "link"
            os.symlink(real, link)
            lib = Path(tmp) / "library"
            resolved = study_lib.validate_source_path(str(link), lib)
            self.assertEqual(Path(resolved), real.resolve())

    def test_rejects_nonexistent_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                study_lib.validate_source_path(
                    str(Path(tmp) / "nope"), Path(tmp) / "library")

    def test_rejects_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "file.md"
            f.write_text("hi")
            with self.assertRaises(ValueError):
                study_lib.validate_source_path(str(f), Path(tmp) / "library")

    def test_rejects_library_root_and_paths_inside_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            inner = lib / "items"
            inner.mkdir(parents=True)
            with self.assertRaises(ValueError):
                study_lib.validate_source_path(str(lib), lib)
            with self.assertRaises(ValueError):
                study_lib.validate_source_path(str(inner), lib)

    def test_rejects_filesystem_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                study_lib.validate_source_path("/", Path(tmp) / "library")


class TestDates(unittest.TestCase):
    """Test 9 — D-04: durable date metadata, integer epoch ms, Linux fallback."""

    def test_created_falls_back_to_mtime_without_birthtime(self):
        class FakeStat:  # a Linux-style stat result: no st_birthtime attribute
            st_mtime = 1650000000.5

        created_ms, saved_ms = study_lib.stat_dates(FakeStat())
        self.assertEqual(saved_ms, 1650000000500)
        self.assertEqual(created_ms, 1650000000500,
                         "created_ms falls back to st_mtime without st_birthtime")
        self.assertIsInstance(created_ms, int)
        self.assertIsInstance(saved_ms, int)

    def test_birthtime_used_when_available(self):
        class FakeStat:
            st_birthtime = 1600000000.0
            st_mtime = 1650000000.0

        created_ms, saved_ms = study_lib.stat_dates(FakeStat())
        self.assertEqual(created_ms, 1600000000000)
        self.assertEqual(saved_ms, 1650000000000)

    def test_imported_items_carry_integer_epoch_ms_dates(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            note = src / "old-note.md"
            note.write_bytes(b"# an old note\n")
            old_s = 1650000000  # 2022-04-15 — controlled with os.utime
            os.utime(note, (old_s, old_s))

            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            self.assertEqual(item["saved_ms"], old_s * 1000,
                             "saved_ms = st_mtime in epoch ms")
            self.assertIsInstance(item["saved_ms"], int)
            self.assertIsInstance(item["created_ms"], int)
            self.assertIsInstance(item["imported_ms"], int)


class TestAttachments(unittest.TestCase):
    """Test 10 — 22-uat (the owner, 2026-07-15): pictures already linked from a
    note travel WITH the note. The vault convention is a picture sitting next
    to the .md that embeds it; a blessing pass must never deal those picture
    fragments out one by one. Linked pictures are copied into the library (so
    the note can render them in a later phase) and recorded on the owning
    note's entry, but they never become catalog items — never on the shelf,
    never in the pile, never in blessing."""

    def test_wikilink_image_is_attachment_not_item(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "clip.md").write_bytes(
                b"# a saved post\n\nsome words worth keeping\n\n![[shot.jpg]]\n")
            (src / "shot.jpg").write_bytes(PNG_1x1 + b"jpg-shot")
            (src / "loose.png").write_bytes(PNG_1x1)

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["imported"], 2,
                             "the note and the loose picture import; the "
                             "linked picture never becomes an item")
            self.assertEqual(report["attached"], 1,
                             "the linked picture is counted as attached")

            store = study_lib.load_store(lib)
            titles = sorted(i["title"] for i in store["items"].values())
            self.assertEqual(titles, ["clip.md", "loose.png"],
                             "shot.jpg must not appear in the catalog")

            (note,) = [i for i in store["items"].values()
                       if i["title"] == "clip.md"]
            self.assertEqual(len(note["attachments"]), 1,
                             "the note's entry records its attachment")
            rel = note["attachments"][0]
            self.assertEqual(Path(rel).name, "shot.jpg")
            self.assertTrue(rel.startswith("attachments/"),
                            "attachment copies live under <library>/attachments/")
            copied = lib / rel
            self.assertTrue(copied.is_file(),
                            "the linked picture IS copied into the library")
            self.assertEqual(copied.read_bytes(),
                             (src / "shot.jpg").read_bytes())

    def test_alias_and_urlencoded_markdown_forms_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "clip.md").write_bytes(
                b"![[shot.png|a kinder name]]\n\n"
                b"![screen](name%20with%20space.jpg)\n")
            (src / "shot.png").write_bytes(PNG_1x1)
            (src / "name with space.jpg").write_bytes(PNG_1x1 + b"jpg")

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["imported"], 1, "only the note is an item")
            self.assertEqual(report["attached"], 2,
                             "the aliased wikilink AND the %-encoded markdown "
                             "image are both detected")

            store = study_lib.load_store(lib)
            (note,) = store["items"].values()
            self.assertEqual(note["title"], "clip.md")
            names = sorted(Path(rel).name for rel in note["attachments"])
            self.assertEqual(names, ["name with space.jpg", "shot.png"])
            for rel in note["attachments"]:
                self.assertTrue((lib / rel).is_file(),
                                f"attachment copy missing: {rel}")

    def test_unreferenced_image_stays_standalone(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "clip.md").write_bytes(b"# just words, no pictures\n")
            (src / "photo.jpg").write_bytes(PNG_1x1 + b"jpg")

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["imported"], 2,
                             "an unreferenced picture imports exactly as before")
            self.assertEqual(report["attached"], 0)
            store = study_lib.load_store(lib)
            types = sorted(i["type"] for i in store["items"].values())
            self.assertEqual(types, ["image", "text"])

    def test_remote_reference_never_captures_a_local_picture(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "clip.md").write_bytes(
                b"![web](https://example.com/pic.jpg)\n")
            (src / "pic.jpg").write_bytes(PNG_1x1 + b"jpg")

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["attached"], 0,
                             "a web reference must not capture a local twin")
            self.assertEqual(report["imported"], 2,
                             "the local pic.jpg stays a standalone item")

    def test_reimport_is_idempotent_and_preserves_judgments(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "clip.md").write_bytes(b"a post\n\n![[shot.jpg]]\n")
            (src / "shot.jpg").write_bytes(PNG_1x1 + b"jpg-shot")

            report1 = study_lib.import_folder(src, lib)
            self.assertEqual(report1["imported"], 1)
            self.assertEqual(report1["attached"], 1)

            # the user blesses the note between the two imports
            store = study_lib.load_store(lib)
            (note_id,) = store["items"]
            store["items"][note_id]["state"] = "blessed"
            store["items"][note_id]["history"].append(
                {"at": "2026-07-15T12:00:00-07:00",
                 "from": "unseen", "to": "blessed", "via": "blessing"})
            study_lib.save_store(lib, store)

            report2 = study_lib.import_folder(src, lib)
            self.assertEqual(report2["imported"], 0)
            self.assertEqual(report2["deduped"], 1, "the note dedups")

            store2 = study_lib.load_store(lib)
            note = store2["items"][note_id]
            self.assertEqual(note["state"], "blessed",
                             "re-import must NOT reset the judgment")
            self.assertEqual(len(note["history"]), 2)
            self.assertEqual(len(note["attachments"]), 1,
                             "re-import must NOT duplicate attachment records")
            att_dir = lib / "attachments" / note_id
            copies = [p for p in att_dir.iterdir() if p.is_file()]
            self.assertEqual(len(copies), 1,
                             "re-import must NOT duplicate attachment copies")

    def test_scan_attachments_partitions_the_walk(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            src.mkdir()
            (src / "clip.md").write_bytes(b"a post\n\n![[shot.jpg]]\n")
            (src / "shot.jpg").write_bytes(PNG_1x1 + b"jpg-shot")
            (src / "loose.png").write_bytes(PNG_1x1)

            candidates, _ = study_lib.walk_source(src)
            note_refs, attached = study_lib.scan_attachments(candidates)

            self.assertEqual({p.name for p in attached}, {"shot.jpg"})
            standalone = [p.name for p, kind in candidates
                          if kind == "image" and p not in attached]
            self.assertEqual(standalone, ["loose.png"],
                             "the unreferenced picture stays standalone")
            self.assertEqual([p.name for p in note_refs], ["clip.md"])
            self.assertEqual(note_refs[src / "clip.md"], ["shot.jpg"])


class TestPrefixAttachments(unittest.TestCase):
    """Test 11 — 22-uat (the owner, 2026-07-15): the vault stores clipped-post
    screenshots as `<note title>_<n>_<author>_来自小红书网页版.jpg` next to
    `<note title>.md`, but the note body often embeds only SOME of them
    (`_1` and `_5` referenced, `_2/_3/_4` not). The unreferenced siblings
    must not import as standalone items and pollute blessing with meaningless
    fragments: an image whose basename starts with a scanned note's stem +
    "_" is that note's ATTACHMENT, exactly like a body-referenced image.
    Comparison is case-insensitive and Unicode-NFC-normalized on BOTH sides —
    macOS filesystems return NFD names for CJK/quote characters like “” and
    ｜. Body references claim first; among prefix candidates the longest
    matching stem wins (ties lexicographic); nothing is ever copied twice."""

    def test_prefix_named_siblings_attach_without_body_reference(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            stem = "赛博功德箱｜好运来"   # CJK + fullwidth ｜, the real convention
            (src / f"{stem}.md").write_bytes(
                "# 好运\n\n只有文字，正文没有嵌入任何图片\n".encode("utf-8"))
            img1 = f"{stem}_1_玲玲_来自小红书网页版.jpg"
            img2 = f"{stem}_2_玲玲_来自小红书网页版.jpg"
            (src / img1).write_bytes(PNG_1x1 + b"jpg-1")
            (src / img2).write_bytes(PNG_1x1 + b"jpg-2")

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["imported"], 1,
                             "only the note is an item; the prefix-named "
                             "screenshots never enter the catalog")
            self.assertEqual(report["attached"], 2,
                             "prefix-matched pictures count as attached")

            store = study_lib.load_store(lib)
            (note,) = store["items"].values()
            self.assertEqual(note["title"], f"{stem}.md")
            names = sorted(Path(rel).name for rel in note["attachments"])
            self.assertEqual(names, sorted([img1, img2]))
            for rel in note["attachments"]:
                self.assertTrue(rel.startswith("attachments/"))
                self.assertTrue((lib / rel).is_file(),
                                f"attachment copy missing: {rel}")

            # re-import is a no-op (requirement: idempotency unchanged)
            report2 = study_lib.import_folder(src, lib)
            self.assertEqual(report2["imported"], 0)
            self.assertEqual(report2["deduped"], 1)
            store2 = study_lib.load_store(lib)
            (note2,) = store2["items"].values()
            self.assertEqual(len(note2["attachments"]), 2,
                             "re-import must NOT duplicate attachment records")
            att_dir = lib / "attachments" / note2["id"]
            copies = [p for p in att_dir.iterdir() if p.is_file()]
            self.assertEqual(len(copies), 2,
                             "re-import must NOT duplicate attachment copies")

    def test_partial_body_reference_attaches_both_ways(self):
        # The real-corpus shape: the body embeds _1 but not _2 — the first
        # travels by the body-reference rule, the second by the prefix rule,
        # and BOTH end on the same note's entry.
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "post.md").write_bytes(
                b"words worth keeping\n\n![[post_1_author.jpg]]\n")
            (src / "post_1_author.jpg").write_bytes(PNG_1x1 + b"jpg-1")
            (src / "post_2_author.jpg").write_bytes(PNG_1x1 + b"jpg-2")

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["imported"], 1, "only the note is an item")
            self.assertEqual(report["attached"], 2,
                             "_1 by body reference AND _2 by prefix")
            store = study_lib.load_store(lib)
            (note,) = store["items"].values()
            names = sorted(Path(rel).name for rel in note["attachments"])
            self.assertEqual(names, ["post_1_author.jpg", "post_2_author.jpg"])

    def test_nfd_image_name_matches_nfc_note_stem(self):
        # macOS filesystems return NFD names; the note file may sit on disk
        # in NFC while the sibling screenshot comes back NFD (or vice versa).
        # The match must survive the mix.
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            stem = "café手册｜“社恐”补充剂"   # CJK + ｜ + curly quotes + é
            nfc_stem = unicodedata.normalize("NFC", stem)
            nfd_stem = unicodedata.normalize("NFD", stem)
            self.assertNotEqual(nfc_stem.encode(), nfd_stem.encode(),
                                "sanity: the two forms differ byte-wise")
            (src / f"{nfc_stem}.md").write_bytes("正文\n".encode("utf-8"))
            img = f"{nfd_stem}_1_作者_来自小红书网页版.jpg"
            (src / img).write_bytes(PNG_1x1 + b"jpg-nfd")

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["imported"], 1,
                             "the NFD-named screenshot must not import as a "
                             "standalone item")
            self.assertEqual(report["attached"], 1,
                             "NFD image name matches the NFC note stem")
            store = study_lib.load_store(lib)
            (note,) = store["items"].values()
            self.assertEqual(len(note["attachments"]), 1)
            self.assertTrue((lib / note["attachments"][0]).is_file())

    def test_no_matching_stem_stays_standalone(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "post.md").write_bytes(b"just words\n")
            (src / "unrelated_1_foo.jpg").write_bytes(PNG_1x1 + b"jpg-a")
            (src / "postscript_1.jpg").write_bytes(PNG_1x1 + b"jpg-b")
            (src / "post.jpg").write_bytes(PNG_1x1 + b"jpg-c")

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["attached"], 0,
                             "no stem prefixes these names: 'postscript_1' "
                             "is not 'post_' + anything, and bare 'post.jpg' "
                             "lacks the '_' separator")
            self.assertEqual(report["imported"], 4,
                             "note + all three pictures import standalone")

    def test_longest_matching_stem_wins_and_never_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "post.md").write_bytes(b"the short-stem note\n")
            (src / "post_extra.md").write_bytes(b"the long-stem note\n")
            # both "post_" and "post_extra_" prefix this name
            (src / "post_extra_1_author.jpg").write_bytes(PNG_1x1 + b"jpg-x")

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["imported"], 2, "both notes are items")
            self.assertEqual(report["attached"], 1)
            store = study_lib.load_store(lib)
            by_title = {i["title"]: i for i in store["items"].values()}
            long_note = by_title["post_extra.md"]
            short_note = by_title["post.md"]
            self.assertEqual(
                [Path(r).name for r in long_note["attachments"]],
                ["post_extra_1_author.jpg"],
                "the longest matching stem owns the picture")
            self.assertEqual(short_note.get("attachments", []), [],
                             "the shorter stem never also claims it")
            copies = [p for p in (lib / "attachments").rglob("*.jpg")]
            self.assertEqual(len(copies), 1,
                             "the picture is copied exactly once")

    def test_quote_twin_stems_attach_only_the_exact_match(self):
        # The vault's real duplicate pair: curly vs straight quotes — same
        # length, still DIFFERENT strings after NFC. The screenshot named
        # with curly quotes belongs to the curly-quote note only.
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            curly = "ASD 应该了解的“社恐”补充剂"
            straight = 'ASD 应该了解的"社恐"补充剂'
            (src / f"{curly}.md").write_bytes("curly body\n".encode("utf-8"))
            (src / f"{straight}.md").write_bytes(
                "straight body\n".encode("utf-8"))
            img = f"{curly}_2_作者_来自小红书网页版.jpg"
            (src / img).write_bytes(PNG_1x1 + b"jpg-q")

            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["imported"], 2)
            self.assertEqual(report["attached"], 1)
            store = study_lib.load_store(lib)
            by_title = {i["title"]: i for i in store["items"].values()}
            self.assertEqual(
                [Path(r).name for r in by_title[f"{curly}.md"]["attachments"]],
                [img])
            self.assertEqual(
                by_title[f"{straight}.md"].get("attachments", []), [],
                "the straight-quote twin never claims the curly-named shot")
            copies = [p for p in (lib / "attachments").rglob("*.jpg")]
            self.assertEqual(len(copies), 1)


class TestModuleDiscipline(unittest.TestCase):
    """Module-level contract checks the plan pins down."""

    def test_constants(self):
        self.assertEqual(study_lib.MAX_TEXT_BYTES, 2 * 1024 * 1024)
        self.assertEqual(study_lib.MAX_IMAGE_BYTES, 25 * 1024 * 1024)
        self.assertEqual(study_lib.TEXT_EXTS, {".md", ".markdown", ".txt"})
        self.assertEqual(study_lib.IMAGE_EXTS,
                         {".png", ".jpg", ".jpeg", ".gif", ".webp"})

    def test_no_chdir_and_no_mac_only_paths(self):
        src = (Path(study_lib.__file__)).read_text(encoding="utf-8")
        self.assertNotIn("os.chdir", src, "study_lib must never chdir (D-04)")
        self.assertNotIn("/Users/", src, "study_lib must carry no Mac-only paths")

    def test_history_seeded_on_import(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "one.md").write_bytes(b"# one\n")
            study_lib.import_folder(src, lib, consolidation=True)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            self.assertEqual(item["state"], "unseen")
            self.assertEqual(item["source"], "folder-drop")
            self.assertEqual(item["title"], "one.md")
            self.assertEqual(item["tags"], [])
            self.assertIs(item["trigger"], False)
            self.assertEqual(len(item["history"]), 1)
            entry = item["history"][0]
            self.assertIsNone(entry["from"])
            self.assertEqual(entry["to"], "unseen")
            self.assertEqual(entry["via"], "import")
            # ISO-8601 local timestamp with an offset
            self.assertRegex(entry["at"],
                             r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$")
            # D-09 Q1 storage seam — a BOOL, never a string: the server
            # boundary validates the tri-state (true/false/null) on both
            # write paths (24-03, RV-2), so the store never canonizes a
            # non-bool value
            self.assertIs(store["meta"]["consolidation"], True,
                          "the Q1 answer stores as the bool itself")


# ---------------------------------------------------------------------------
# Phase 23 fixtures — struct-built image headers (no binary files on disk)
# and the hand-written schema_version-1 store (RESEARCH Wave 0 gap list).
# ---------------------------------------------------------------------------

# 2023-07-01T12:00:00Z — mid-year, so the server-local year is 2023 in every
# real timezone (no year-boundary flakiness).
CREATED_2023 = 1688212800000


def png_header(width, height):
    """A minimal PNG IHDR header built with struct — enough for png_dims."""
    return (b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" +
            struct.pack(">II", width, height))


def jpeg_header(width, height):
    """A minimal JPEG SOI + SOF0 frame header built with struct — enough
    for jpeg_dims (length 17 = 2 length bytes + precision + dims + 3
    components x 3 bytes)."""
    return (b"\xff\xd8" + b"\xff\xc0" + struct.pack(">H", 17) + b"\x08" +
            struct.pack(">HH", height, width) +
            b"\x03\x01\x22\x00\x02\x11\x01\x03\x11\x01")


def v1_item(item_id, title, kind, origin_path, created_ms):
    """A hand-written schema-v1 item — the exact pre-Phase-23 shape
    (no year, no folder)."""
    return {
        "id": item_id,
        "content_hash": item_id * 4,
        "source": "folder-drop",
        "origin_path": origin_path,
        "library_path": f"items/{item_id}{Path(title).suffix}",
        "type": kind,
        "title": title,
        "created_ms": created_ms,
        "saved_ms": created_ms,
        "imported_ms": created_ms,
        "last_opened_ms": None,
        "state": "unseen",
        "resting_until_ms": None,
        "tags": [],
        "trigger": False,
        "history": [],
    }


def v1_store(lib, items):
    """A hand-written schema_version-1 store dict (the migration fixture)."""
    return {
        "schema_version": 1,
        "meta": {
            "library_root": str(lib),
            "consolidation": None,
            "habit_anchor": None,
            "habit_anchor_asked": False,
            "cycle": {"number": 1, "shown_ids": []},
            "current_shelf": None,
            "last_import_report": None,
        },
        "items": {i["id"]: i for i in items},
    }


class TestMigration(unittest.TestCase):
    """Test 12 — SRM-05: schema v1 -> v2 migrates once, backed up,
    idempotent, refusal-preserving. Temp libraries only — the live
    ~/StudyRoom store is proven at UAT (plan 23-05), never here."""

    def _v1_fixture(self, lib):
        """Four v1 items: a note, a filename-detected screenshot, a
        dimension-detected screen-size PNG (its snapshot bytes live in the
        library), and a plain photo that must NOT gain the tag."""
        lib.mkdir(parents=True, exist_ok=True)
        (lib / "items").mkdir(exist_ok=True)
        note = v1_item("a" * 16, "note.md", "text",
                       "/somewhere/vault/notes/note.md", CREATED_2023)
        shot = v1_item("b" * 16, "Screenshot 2023-05-01.png", "image",
                       "/somewhere/vault/pics/Screenshot 2023-05-01.png",
                       CREATED_2023)
        neutral = v1_item("c" * 16, "photo.png", "image",
                          "/somewhere/vault/pics/photo.png", CREATED_2023)
        sunset = v1_item("d" * 16, "sunset.jpg", "image",
                         "/somewhere/vault/pics/sunset.jpg", CREATED_2023)
        # snapshot bytes: the neutral-named image is screen-sized (the
        # migration must read the library snapshot to find that out);
        # sunset carries an off-table 1x1
        (lib / neutral["library_path"]).write_bytes(png_header(1170, 2532))
        (lib / sunset["library_path"]).write_bytes(PNG_1x1)
        return v1_store(lib, [note, shot, neutral, sunset])

    def test_migrate_fills_meta_and_stamps_facets(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            store = self._v1_fixture(lib)

            migrated = study_lib.migrate_store(store, lib)

            # 26.4-06: migrate_store now CHAINS v1->2->3 in one call
            self.assertEqual(migrated["schema_version"], 3)
            meta = migrated["meta"]
            self.assertEqual(meta["filters"], [])
            self.assertEqual(meta["cover_offers"], {})
            self.assertIsNone(meta["current_cover"])
            self.assertEqual(meta["incidents"], [])

            expected_year = datetime.fromtimestamp(
                CREATED_2023 / 1000).year
            for item in migrated["items"].values():
                self.assertIsInstance(item["year"], int)
                self.assertEqual(item["year"], expected_year,
                                 "year backfilled from created_ms")
                self.assertIsInstance(item["folder"], str)

            by_title = {i["title"]: i for i in migrated["items"].values()}
            self.assertEqual(by_title["note.md"]["folder"], "notes",
                             "folder = immediate parent dir of origin_path")
            self.assertEqual(
                by_title["Screenshot 2023-05-01.png"]["folder"], "pics")
            self.assertEqual(
                by_title["Screenshot 2023-05-01.png"]["tags"],
                ["screenshots"], "filename detection backfills the tag")
            self.assertEqual(by_title["photo.png"]["tags"], ["screenshots"],
                             "dimension detection reads the snapshot bytes")
            self.assertEqual(by_title["sunset.jpg"]["tags"], [],
                             "an off-table plain photo gains no tag")
            self.assertEqual(by_title["note.md"]["tags"], [],
                             "text items never get the tag")

    def test_migration_idempotent_and_never_double_tags(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            store = self._v1_fixture(lib)
            # an image already carrying the tag must not gain a second copy
            store["items"]["b" * 16]["tags"] = ["screenshots"]

            once = study_lib.migrate_store(store, lib)
            first = json.dumps(once, sort_keys=True)
            twice = study_lib.migrate_store(once, lib)

            self.assertEqual(json.dumps(twice, sort_keys=True), first,
                             "migrating an already-migrated store is a "
                             "byte-equal no-op")
            self.assertEqual(once["items"]["b" * 16]["tags"],
                             ["screenshots"],
                             "the screenshots tag is never appended twice")

    def test_load_store_refuses_older_and_newer(self):
        # 26.4-06: current is v3, so load_store accepts ONLY v3 — an older
        # store (v1/v2, migrated separately at startup, never loaded raw) and
        # a newer/unknown store (v4) both refuse.
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            lib.mkdir()
            for version in (1, 2, 4):
                bad = {"schema_version": version, "meta": {}, "items": {}}
                (lib / "items.json").write_text(json.dumps(bad),
                                                encoding="utf-8")
                with self.assertRaises(study_lib.StoreCorruptError,
                                       msg=f"version {version} must refuse"):
                    study_lib.load_store(lib)

    def test_create_server_migrates_with_one_time_backup(self):
        # The backup-integrity test — a mandatory row in 23-VALIDATION.md.
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            store = self._v1_fixture(lib)
            store_path = lib / "items.json"
            store_path.write_text(
                json.dumps(store, ensure_ascii=False, indent=1),
                encoding="utf-8")
            original = store_path.read_bytes()

            httpd = server.create_server(lib, 0)
            httpd.server_close()

            bak = lib / "items.json.v1.bak"
            self.assertTrue(bak.is_file(),
                            "the backup exists after the migrated start")
            self.assertEqual(bak.read_bytes(), original,
                             "the backup IS the pre-migration bytes")
            migrated = json.loads(store_path.read_text(encoding="utf-8"))
            self.assertEqual(migrated["schema_version"], 3)
            for item in migrated["items"].values():
                self.assertIsInstance(item["year"], int)
                self.assertIsInstance(item["folder"], str)
            after_first = store_path.read_bytes()

            # a second startup changes NOTHING: byte-equal items.json,
            # untouched backup (idempotence at the file level)
            httpd2 = server.create_server(lib, 0)
            httpd2.server_close()
            self.assertEqual(store_path.read_bytes(), after_first,
                             "a second start leaves items.json byte-equal")
            self.assertEqual(bak.read_bytes(), original,
                             "a second start never touches the backup")

    def test_backup_is_never_clobbered(self):
        # Even if a v1 store reappears next to an existing backup, the .bak
        # keeps the TRUE pre-migration state — it is written once, ever.
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            store = self._v1_fixture(lib)
            (lib / "items.json").write_text(json.dumps(store),
                                            encoding="utf-8")
            bak = lib / "items.json.v1.bak"
            sentinel = b'{"the": "true pre-migration state"}'
            bak.write_bytes(sentinel)

            httpd = server.create_server(lib, 0)
            httpd.server_close()

            self.assertEqual(bak.read_bytes(), sentinel,
                             "an existing backup is never overwritten")
            migrated = json.loads(
                (lib / "items.json").read_text(encoding="utf-8"))
            self.assertEqual(migrated["schema_version"], 3,
                             "the store still migrates")

    def test_create_server_refuses_newer_version_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            lib.mkdir()
            newer = json.dumps({"schema_version": 4, "meta": {},
                                "items": {}}).encode("utf-8")
            (lib / "items.json").write_bytes(newer)
            with self.assertRaises(study_lib.StoreCorruptError):
                server.create_server(lib, 0)
            self.assertEqual((lib / "items.json").read_bytes(), newer,
                             "an unknown/newer store is never rewritten")
            self.assertFalse((lib / "items.json.v4.bak").exists(),
                             "no backup for a store that never migrates")


class TestScreenshotDetection(unittest.TestCase):
    """Test 13 — D-05: deterministic screenshot detection. Parsers are pure
    bytes-in / value-out; every fixture is built inline with struct."""

    def test_filename_patterns_fire_without_bytes(self):
        for name in ("Screenshot 2023-01-01.png",
                     "Screen Shot 2022-05-01 at 09.15.00.png",
                     "screenshot (4).png",
                     "截图_20230101.jpg",
                     "截屏2024-02-02.png",
                     "IMG_0042.PNG",
                     "IMG_7.png"):
            self.assertTrue(study_lib.detect_screenshot(name, b""), name)

    def test_neutral_names_do_not_fire_without_bytes(self):
        for name in ("sunset.jpg", "IMG_0042.jpg", "IMG_.png",
                     "IMGABC.png", "drawing.png", "note.md"):
            self.assertFalse(study_lib.detect_screenshot(name, b""), name)

    def test_png_dims_decodes_and_rejects(self):
        self.assertEqual(study_lib.png_dims(png_header(1179, 2556)),
                         (1179, 2556))
        self.assertIsNone(study_lib.png_dims(b""))
        self.assertIsNone(study_lib.png_dims(b"not a png at all"))
        self.assertIsNone(study_lib.png_dims(b"\xff\xd8\xff\xc0"))

    def test_jpeg_dims_decodes_and_rejects(self):
        self.assertEqual(study_lib.jpeg_dims(jpeg_header(1080, 1920)),
                         (1080, 1920))
        # an APP0 (JFIF) segment before the frame header is stepped over
        app0 = (b"\xff\xe0" + struct.pack(">H", 16) +
                b"JFIF\x00\x01\x02\x00\x00\x01\x00\x01\x00\x00")
        with_app0 = b"\xff\xd8" + app0 + jpeg_header(1080, 1920)[2:]
        self.assertEqual(study_lib.jpeg_dims(with_app0), (1080, 1920))
        self.assertIsNone(study_lib.jpeg_dims(b""))
        self.assertIsNone(study_lib.jpeg_dims(png_header(4, 4)))
        self.assertIsNone(study_lib.jpeg_dims(b"\xff\xd8\x00\x00\x00"))

    def test_dimension_confirm_matches_table_both_orientations(self):
        self.assertTrue(study_lib.detect_screenshot(
            "photo.png", png_header(1170, 2532)))
        self.assertTrue(study_lib.detect_screenshot(
            "photo.png", png_header(2532, 1170)),
            "the transposed orientation also matches")
        self.assertTrue(study_lib.detect_screenshot(
            "pic.jpg", jpeg_header(1920, 1080)))
        self.assertFalse(study_lib.detect_screenshot(
            "photo.png", png_header(640, 481)),
            "an off-table size with a neutral name does not fire")


class TestFacetStamping(unittest.TestCase):
    """Test 14 — D-05: import stamps year/folder/screenshots on NEW items;
    the dedup path never rewrites facets on existing items (the D-08
    dedup-preserves-state rule extends to facets)."""

    def test_import_stamps_year_folder_and_tag(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            sub = src / "clips"
            sub.mkdir(parents=True)
            (sub / "note.md").write_bytes(b"# words\n")
            (sub / "Screenshot 2023-06-01.png").write_bytes(PNG_1x1)
            (sub / "holiday.jpg").write_bytes(PNG_1x1 + b"jpg")

            study_lib.import_folder(src, lib)

            store = study_lib.load_store(lib)
            by_title = {i["title"]: i for i in store["items"].values()}
            for item in store["items"].values():
                self.assertIsInstance(item["year"], int)
                self.assertNotIsInstance(item["year"], bool)
                self.assertEqual(
                    item["year"],
                    datetime.fromtimestamp(item["created_ms"] / 1000).year,
                    "year is stamped from created_ms, server-local")
                self.assertEqual(item["folder"], "clips",
                                 "folder = the immediate parent dir name")
            self.assertEqual(
                by_title["Screenshot 2023-06-01.png"]["tags"],
                ["screenshots"])
            self.assertEqual(by_title["holiday.jpg"]["tags"], [])
            self.assertEqual(by_title["note.md"]["tags"], [])

    def test_reimport_neither_doubles_tags_nor_rewrites_facets(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "Screenshot 2023-06-01.png").write_bytes(PNG_1x1)
            (src / "note.md").write_bytes(b"# words\n")

            study_lib.import_folder(src, lib)
            store1 = study_lib.load_store(lib)
            # hand-revise a facet between imports — dedup must preserve it
            shot_id = next(i for i, it in store1["items"].items()
                           if it["type"] == "image")
            store1["items"][shot_id]["year"] = 1999
            study_lib.save_store(lib, store1)

            report2 = study_lib.import_folder(src, lib)

            self.assertEqual(report2["imported"], 0)
            self.assertEqual(report2["deduped"], 2)
            store2 = study_lib.load_store(lib)
            self.assertEqual(store2["items"][shot_id]["tags"],
                             ["screenshots"],
                             "the tag is never doubled on re-import")
            self.assertEqual(store2["items"][shot_id]["year"], 1999,
                             "dedup never rewrites facets on existing items")
            self.assertEqual(
                json.dumps(store1["items"], sort_keys=True),
                json.dumps(store2["items"], sort_keys=True),
                "items are byte-equal after the second import")


# ---------------------------------------------------------------------------
# Phase 25 fixtures — the Wave-0 synthetic exports (SRM-08, D-02). Both
# schemas are MEDIUM-confidence community shapes; real-export verification
# is deferred by design to the phase-gate UAT. Tests copy the checked-in
# fixture dirs into temp source dirs so nothing ever imports from the repo.
# ---------------------------------------------------------------------------

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

# The byte-exact conversion of the chatgpt fixture's linear conversation A —
# title heading + alternating role-labeled blocks, message text VERBATIM.
CHATGPT_A_BODY = (
    "# tea kettle notes\n"
    "\n**me**\n\nhow do I descale a kettle?\n"
    "\n**assistant**\n\nUse vinegar and water, then rinse well.\n"
    "\n**me**\n\nthanks, that worked\n")

# The byte-exact conversion of the claude fixture's conversation A.
CLAUDE_A_BODY = (
    "# garden planning\n"
    "\n**me**\n\nwhat grows well in partial shade?\n"
    "\n**assistant**\n\nHostas, ferns, and hellebores all do well.\n")


def copy_fixture(name, dst):
    """Copy tests/fixtures/<name> into `dst` (a temp source dir)."""
    shutil.copytree(FIXTURES_DIR / name, dst)
    return Path(dst)


def linear_chatgpt_conv(title, text, create_time=1700000000.0):
    """A minimal single-turn ChatGPT-shape conversation for built-in-place
    export corpora (caps / safety tests)."""
    return {
        "title": title,
        "create_time": create_time,
        "update_time": create_time,
        "current_node": "n2",
        "mapping": {
            "n1": {"id": "n1", "parent": None, "children": ["n2"],
                   "message": None},
            "n2": {"id": "n2", "parent": "n1", "children": [],
                   "message": {
                       "author": {"role": "user"},
                       "create_time": create_time,
                       "content": {"content_type": "text",
                                   "parts": [text]}}},
        },
    }


def write_chatgpt_export(dst, conversations):
    """Write a ChatGPT-shape export dir at `dst`."""
    dst = Path(dst)
    dst.mkdir(parents=True, exist_ok=True)
    (dst / "conversations.json").write_text(
        json.dumps(conversations, ensure_ascii=False), encoding="utf-8")
    return dst


class TestAdapterDetection(unittest.TestCase):
    """Test 15.1 — detection precedence is the ADAPTERS tuple order;
    folder-drop is the always-true fallback and stays last."""

    def test_registry_shape_and_folder_drop_last(self):
        names = [row[0] for row in study_lib.ADAPTERS]
        self.assertEqual(names, ["chatgpt-export", "claude-export",
                                 "obsidian-vault", "folder-drop"])
        labels = {row[0]: row[1] for row in study_lib.ADAPTERS}
        self.assertEqual(labels["chatgpt-export"], "ai-chat-export")
        self.assertEqual(labels["claude-export"], "ai-chat-export")
        self.assertEqual(labels["obsidian-vault"], "obsidian-vault")
        self.assertEqual(labels["folder-drop"], "folder-drop")

    def test_obsidian_dir_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "vault"
            (src / ".obsidian").mkdir(parents=True)
            (src / "note.md").write_bytes(b"# a note\n")
            self.assertEqual(study_lib.detect_adapter(src),
                             ("obsidian-vault", "obsidian-vault"))

    def test_chatgpt_export_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = copy_fixture("chatgpt_export", Path(tmp) / "source")
            self.assertEqual(study_lib.detect_adapter(src),
                             ("chatgpt-export", "ai-chat-export"))

    def test_claude_export_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = copy_fixture("claude_export", Path(tmp) / "source")
            self.assertEqual(study_lib.detect_adapter(src),
                             ("claude-export", "ai-chat-export"))

    def test_plain_folder_falls_through_to_folder_drop(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            src.mkdir()
            (src / "note.md").write_bytes(b"# words\n")
            self.assertEqual(study_lib.detect_adapter(src),
                             ("folder-drop", "folder-drop"))

    def test_both_obsidian_and_chatgpt_export_resolves_to_chatgpt_by_tuple_order(self):
        # A dir carrying BOTH markers resolves by ADAPTERS order: the
        # chatgpt-export row sits before obsidian-vault, so it wins.
        with tempfile.TemporaryDirectory() as tmp:
            src = copy_fixture("chatgpt_export", Path(tmp) / "source")
            (src / ".obsidian").mkdir()
            self.assertEqual(study_lib.detect_adapter(src),
                             ("chatgpt-export", "ai-chat-export"))

    def test_scan_source_reports_conversation_count_for_exports(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = copy_fixture("chatgpt_export", Path(tmp) / "source")
            scan = study_lib.scan_source(src)
            self.assertEqual(scan["adapter"], "chatgpt-export")
            self.assertEqual(scan["source_label"], "ai-chat-export")
            self.assertEqual(scan["conversations"], 2,
                             "the honest denominator for big-import progress")
            self.assertEqual(scan["total"], 2)

    def test_scan_source_plain_folder_matches_walk_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            src.mkdir()
            (src / "a.md").write_bytes(b"# a\n")
            (src / "b.md").write_bytes(b"# b\n")
            (src / "pic.png").write_bytes(PNG_1x1)
            (src / "data.foo").write_bytes(b"mystery")
            scan = study_lib.scan_source(src)
            self.assertEqual(scan["adapter"], "folder-drop")
            self.assertEqual(scan["text"], 2)
            self.assertEqual(scan["image"], 1)
            self.assertEqual(scan["attached"], 0)
            self.assertEqual(scan["total"], 3)
            self.assertEqual(scan["skipped"]["unknown"], {".foo": 1})
            self.assertNotIn("conversations", scan,
                             "a plain folder has no conversation count")


class TestChatGPTConversion(unittest.TestCase):
    """Test 15.2 — the canonical current_node walk, verbatim role blocks,
    export timestamps, and non-text skip counts."""

    def _import_fixture(self, tmp):
        src = copy_fixture("chatgpt_export", Path(tmp) / "source")
        lib = Path(tmp) / "library"
        report = study_lib.import_folder(src, lib)
        store = study_lib.load_store(lib)
        return report, store, lib

    def test_item_count_source_label_and_type(self):
        with tempfile.TemporaryDirectory() as tmp:
            report, store, _ = self._import_fixture(tmp)
            self.assertEqual(report["imported"], 2,
                             "both fixture conversations convert to items")
            self.assertEqual(report["skipped"].get("unreadable-conversations",
                                                   0), 0)
            for item in store["items"].values():
                self.assertEqual(item["source"], "ai-chat-export")
                self.assertEqual(item["type"], "text")

    def test_linear_conversation_body_is_byte_verbatim(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, store, lib = self._import_fixture(tmp)
            by_title = {i["title"]: i for i in store["items"].values()}
            item = by_title["tea kettle notes"]
            body = (lib / item["library_path"]).read_bytes()
            self.assertEqual(body, CHATGPT_A_BODY.encode("utf-8"),
                             "role-labeled blocks with message text VERBATIM")

    def test_branched_walk_keeps_only_current_branch(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, store, lib = self._import_fixture(tmp)
            by_title = {i["title"]: i for i in store["items"].values()}
            item = by_title["pottery glaze question"]
            body = (lib / item["library_path"]).read_text(encoding="utf-8")
            self.assertIn("second, kept question about pottery glaze", body)
            self.assertIn("the glaze needs a second firing", body)
            self.assertNotIn("ABANDONED-BRANCH-MARKER", body,
                             "the abandoned branch's text appears nowhere — "
                             "the walk follows current_node -> parent, never "
                             "a create_time sort")
            self.assertNotIn("abandoned first draft", body)

    def test_non_text_parts_counted_not_silently_dropped(self):
        with tempfile.TemporaryDirectory() as tmp:
            report, _, _ = self._import_fixture(tmp)
            self.assertEqual(report["skipped"].get("non-text-parts", 0), 2,
                             "one code-turn + one non-string part, counted")

    def test_created_ms_from_export_stamp_never_stat(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, store, _ = self._import_fixture(tmp)
            by_title = {i["title"]: i for i in store["items"].values()}
            self.assertEqual(by_title["tea kettle notes"]["created_ms"],
                             int(1710000000.0 * 1000))
            self.assertEqual(by_title["tea kettle notes"]["saved_ms"],
                             int(1710000000.0 * 1000))
            self.assertEqual(by_title["pottery glaze question"]["created_ms"],
                             int(1712000000.5 * 1000))


class TestClaudeConversion(unittest.TestCase):
    """Test 15.3 — linear chat_messages, content-blocks fallback, the ISO-Z
    shim, and the tolerant per-conversation skip."""

    def _import_fixture(self, tmp):
        src = copy_fixture("claude_export", Path(tmp) / "source")
        lib = Path(tmp) / "library"
        report = study_lib.import_folder(src, lib)
        store = study_lib.load_store(lib)
        return report, store, lib

    def test_plain_text_messages_convert_byte_verbatim(self):
        with tempfile.TemporaryDirectory() as tmp:
            report, store, lib = self._import_fixture(tmp)
            self.assertEqual(report["imported"], 2)
            by_title = {i["title"]: i for i in store["items"].values()}
            item = by_title["garden planning"]
            self.assertEqual(item["source"], "ai-chat-export")
            body = (lib / item["library_path"]).read_bytes()
            self.assertEqual(body, CLAUDE_A_BODY.encode("utf-8"))

    def test_content_blocks_messages_convert(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, store, lib = self._import_fixture(tmp)
            by_title = {i["title"]: i for i in store["items"].values()}
            item = by_title["content blocks shape"]
            body = (lib / item["library_path"]).read_text(encoding="utf-8")
            self.assertIn("block-form question about bread", body)
            self.assertIn("block-form answer: let the dough rest", body)

    def test_malformed_conversation_skipped_with_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            report, store, _ = self._import_fixture(tmp)
            self.assertEqual(report["skipped"]["unreadable-conversations"], 1,
                             "the entry with no chat_messages is counted out "
                             "loud; the other conversations still import")
            self.assertEqual(len(store["items"]), 2)

    def test_created_ms_matches_iso_z_stamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, store, _ = self._import_fixture(tmp)
            by_title = {i["title"]: i for i in store["items"].values()}
            expected = int(datetime.fromisoformat(
                "2025-03-01T10:00:00+00:00").timestamp() * 1000)
            self.assertEqual(by_title["garden planning"]["created_ms"],
                             expected)
            self.assertEqual(by_title["garden planning"]["saved_ms"],
                             expected)


class TestAdapterDedup(unittest.TestCase):
    """Test 15.4 — D-08 content-hash identity: re-importing the same export
    is a dedup no-op with zero new items."""

    def test_chatgpt_reimport_dedups_with_zero_new_items(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = copy_fixture("chatgpt_export", Path(tmp) / "source")
            lib = Path(tmp) / "library"
            report1 = study_lib.import_folder(src, lib)
            report2 = study_lib.import_folder(src, lib)
            self.assertEqual(report1["imported"], 2)
            self.assertEqual(report2["imported"], 0)
            self.assertEqual(report2["deduped"], report1["imported"],
                             "second report deduped == first imported count")
            self.assertEqual(len(study_lib.load_store(lib)["items"]), 2)

    def test_claude_reimport_dedups_with_zero_new_items(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = copy_fixture("claude_export", Path(tmp) / "source")
            lib = Path(tmp) / "library"
            report1 = study_lib.import_folder(src, lib)
            report2 = study_lib.import_folder(src, lib)
            self.assertEqual(report1["imported"], 2)
            self.assertEqual(report2["imported"], 0)
            self.assertEqual(report2["deduped"], 2)
            self.assertEqual(len(study_lib.load_store(lib)["items"]), 2)


class TestAdapterCaps(unittest.TestCase):
    """Test 15.5 — the verbatim law under size pressure: an oversized
    conversation is skipped-with-count (never truncated); an over-cap export
    file is refused in plain words before parsing."""

    def test_oversized_conversation_skipped_never_truncated(self):
        with tempfile.TemporaryDirectory() as tmp:
            big_text = "x" * (study_lib.MAX_TEXT_BYTES + 100)
            src = write_chatgpt_export(
                Path(tmp) / "source",
                [linear_chatgpt_conv("too big to hold", big_text)])
            lib = Path(tmp) / "library"
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 0)
            self.assertEqual(report["skipped"]["conversation-too-large"], 1)
            md_files = list((lib / "items").glob("*"))
            self.assertEqual(md_files, [],
                             "no items/ file is written for a skipped "
                             "conversation — never a truncated one")

    def test_over_cap_export_refused_in_plain_words(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = write_chatgpt_export(
                Path(tmp) / "source",
                [linear_chatgpt_conv("padding", "y" * 4096)])
            lib = Path(tmp) / "library"
            with mock.patch.object(study_lib, "MAX_EXPORT_BYTES", 1024):
                report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 0, "nothing imports")
            msg = report["skipped"]["export-refused"]
            self.assertIsInstance(msg, str)
            self.assertIn("too large", msg,
                          "the refusal is plain words, not a stack trace")
            self.assertEqual(list((lib / "items").glob("*")), [])


class TestSynthPlacement(unittest.TestCase):
    """Test 15.6 — synth item names are server-generated items/<hash>.md;
    nothing in the write path ever derives from export content."""

    def test_synth_items_live_at_server_generated_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = copy_fixture("chatgpt_export", Path(tmp) / "source")
            lib = Path(tmp) / "library"
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            for item in store["items"].values():
                self.assertRegex(item["library_path"],
                                 r"^items/[0-9a-f]{16,64}\.md$")
                self.assertEqual(item["id"], item["content_hash"][:16])

    def test_hostile_title_never_steers_the_write_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = write_chatgpt_export(
                Path(tmp) / "source",
                [linear_chatgpt_conv("../../escape", "plain words")])
            lib = Path(tmp) / "library"
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 1)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            self.assertEqual(item["title"], "../../escape",
                             "the title is stored as data, verbatim")
            self.assertRegex(item["library_path"],
                             r"^items/[0-9a-f]{16,64}\.md$")
            self.assertNotIn("..", item["library_path"])
            resolved = (lib / item["library_path"]).resolve()
            self.assertTrue(str(resolved).startswith(
                str(lib.resolve()) + os.sep),
                "the written file is contained inside the library")
            self.assertTrue(resolved.is_file())


class TestProgressSeam(unittest.TestCase):
    """Test 15.7 — import_folder(progress_cb=fn) fires once per processed
    unit with (done, total); omitting the param changes nothing."""

    def test_called_once_per_unit_with_fixed_total(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            src.mkdir()
            (src / "a.md").write_bytes(b"# a\n")
            (src / "b.md").write_bytes(b"# b\n")
            (src / "pic.png").write_bytes(PNG_1x1)
            lib = Path(tmp) / "library"
            calls = []
            study_lib.import_folder(
                src, lib, progress_cb=lambda done, total:
                calls.append((done, total)))
            self.assertEqual([d for d, _ in calls], [1, 2, 3],
                             "done increases monotonically, once per unit")
            self.assertEqual({t for _, t in calls}, {3}, "total is fixed")

    def test_called_once_per_export_unit(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = copy_fixture("chatgpt_export", Path(tmp) / "source")
            lib = Path(tmp) / "library"
            calls = []
            study_lib.import_folder(
                src, lib, progress_cb=lambda done, total:
                calls.append((done, total)))
            self.assertEqual(calls, [(1, 2), (2, 2)],
                             "one call per conversation unit")

    def test_omitting_the_param_changes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            src.mkdir()
            (src / "a.md").write_bytes(b"# a\n")
            (src / "pic.png").write_bytes(PNG_1x1)
            lib_with = Path(tmp) / "lib-with"
            lib_without = Path(tmp) / "lib-without"
            report_with = study_lib.import_folder(
                src, lib_with, progress_cb=lambda done, total: None)
            report_without = study_lib.import_folder(src, lib_without)
            # 26.97-06: the finish time is a WALL CLOCK reading, so two
            # runs a millisecond apart legitimately differ on it.
            # Compare every OTHER field by value, then assert both runs
            # recorded one — narrowing the claim rather than dropping it
            # keeps what this seam actually asserts.
            volatile = "finished_ms"
            self.assertEqual(
                {k: v for k, v in report_with.items() if k != volatile},
                {k: v for k, v in report_without.items() if k != volatile},
                "the progress seam is purely additive: every non-clock "
                "field is identical either way")
            self.assertIsInstance(report_with.get(volatile), int,
                                  "the run WITH the seam recorded no "
                                  "finish time")
            self.assertIsInstance(report_without.get(volatile), int,
                                  "the run WITHOUT the seam recorded no "
                                  "finish time")
            self.assertEqual(
                sorted(study_lib.load_store(lib_with)["items"]),
                sorted(study_lib.load_store(lib_without)["items"]),
                "identical items either way — the seam is purely additive")


class TestObsidianAdapter(unittest.TestCase):
    """Test 15.8 — an Obsidian vault imports through the folder walk with
    the obsidian-vault label; hidden content (.obsidian/, .trash/) is
    excluded by the walker's existing pruning."""

    def test_vault_imports_with_obsidian_label_and_hidden_pruned(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "vault"
            (src / ".obsidian").mkdir(parents=True)
            (src / ".obsidian" / "app.json").write_text("{}",
                                                        encoding="utf-8")
            (src / ".trash").mkdir()
            (src / ".trash" / "secret.md").write_bytes(b"# never imported\n")
            (src / "note1.md").write_bytes(b"# note one\n")
            daily = src / "daily"
            daily.mkdir()
            (daily / "note2.md").write_bytes(b"# note two\n")

            lib = Path(tmp) / "library"
            report = study_lib.import_folder(src, lib)

            self.assertEqual(report["imported"], 2,
                             "the two notes import; hidden dirs never leak")
            store = study_lib.load_store(lib)
            titles = sorted(i["title"] for i in store["items"].values())
            self.assertEqual(titles, ["note1.md", "note2.md"])
            for item in store["items"].values():
                self.assertEqual(item["source"], "obsidian-vault")


class TestPackAttachments(unittest.TestCase):
    """Test 16 — 25-05 UAT (the owner, 2026-07-19): the vault keeps resource
    packs — ONE note beside subfolders full of pack images referenced by
    nothing (an art pack's preview JPGs, a mind-map pack's PNG exports).
    Those pictures belong to the note; importing them as standalone items
    floods the pile with meaningless blessing cards. Rule 3: an image still
    unclaimed by body reference or stem prefix attaches to the nearest
    strict ancestor directory holding exactly one note. An image BESIDE
    notes stays a photo; a level with several notes is ambiguous and ends
    the walk; the walk never leaves the scanned tree."""

    def test_pack_subfolder_images_attach_to_the_single_note(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            (src / "pack" / "deep").mkdir(parents=True)
            (src / "美术资料.md").write_bytes(
                "# 资料\n\n正文没有嵌入任何图片\n".encode("utf-8"))
            (src / "pack" / "preview-1.jpg").write_bytes(PNG_1x1 + b"p1")
            (src / "pack" / "deep" / "preview-2.png").write_bytes(
                PNG_1x1 + b"p2")

            candidates, _ = study_lib.walk_source(src)
            note_refs, attached = study_lib.scan_attachments(candidates)
            self.assertEqual({p.name for p in attached},
                             {"preview-1.jpg", "preview-2.png"})
            self.assertEqual([p.name for p in note_refs], ["美术资料.md"])

            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 1,
                             "only the note is an item; pack pictures "
                             "never enter the catalog")
            self.assertEqual(report["attached"], 2)
            store = study_lib.load_store(lib)
            (note,) = store["items"].values()
            self.assertEqual(len(note["attachments"]), 2)

    def test_image_beside_notes_is_never_pack_claimed(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            src.mkdir()
            (src / "note.md").write_bytes(b"no references\n")
            (src / "loose.jpg").write_bytes(PNG_1x1 + b"loose")

            candidates, _ = study_lib.walk_source(src)
            _, attached = study_lib.scan_attachments(candidates)
            self.assertEqual(attached, set(),
                             "a loose photo next to notes stays a photo")

    def test_several_notes_at_a_level_is_ambiguous_and_stays_standalone(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            (src / "pack").mkdir(parents=True)
            (src / "a.md").write_bytes(b"one\n")
            (src / "b.md").write_bytes(b"two\n")
            (src / "pack" / "img.jpg").write_bytes(PNG_1x1 + b"amb")

            candidates, _ = study_lib.walk_source(src)
            _, attached = study_lib.scan_attachments(candidates)
            self.assertEqual(attached, set(),
                             "two notes at the claiming level: ambiguous, "
                             "the image stays standalone")

    def test_nearest_single_note_wins_over_a_higher_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            (src / "sub" / "pack").mkdir(parents=True)
            (src / "top.md").write_bytes(b"top note\n")
            (src / "sub" / "inner.md").write_bytes(b"inner note\n")
            (src / "sub" / "pack" / "img.jpg").write_bytes(PNG_1x1 + b"n")

            candidates, _ = study_lib.walk_source(src)
            note_refs, attached = study_lib.scan_attachments(candidates)
            self.assertEqual({p.name for p in attached}, {"img.jpg"})
            self.assertEqual([p.name for p in note_refs], ["inner.md"],
                             "the nearest ancestor's single note claims "
                             "the pack image, not the root note")

    def test_body_reference_claims_before_the_pack_rule(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            (src / "pack").mkdir(parents=True)
            (src / "owner.md").write_bytes(b"see ![[img.jpg]]\n")
            (src / "pack" / "unrelated.md").write_bytes(b"quiet\n")
            (src / "pack" / "img.jpg").write_bytes(PNG_1x1 + b"ref")

            candidates, _ = study_lib.walk_source(src)
            note_refs, attached = study_lib.scan_attachments(candidates)
            self.assertEqual({p.name for p in attached}, {"img.jpg"})
            self.assertEqual([p.name for p in note_refs], ["owner.md"],
                             "a body reference outranks the pack rule")


class TestJudgmentInheritance(unittest.TestCase):
    """Test 17 — 26-05 UAT (P0, found live): content-hash dedup let an
    EDITED copy of a judged note re-enter as a fresh unseen card — the
    re-import ambush the never_show/retired states exist to prevent. A
    new item whose folded title matches an existing never_show / retired
    / trigger-flagged item inherits that judgment at import, counted
    out loud in the report.

    ⚠ NARROWED BY #58 (2026-08-14), AND THE TWO TESTS BELOW WERE REWRITTEN
    RATHER THAN DELETED. The inheritance was a rescue for a fork this
    codebase could not stop; the identity wire stops the fork, so an EDIT
    in place no longer produces a twin to inherit anything and these tests
    now assert the stronger outcome — one item, still judged, new words.
    ⚠ The mechanism is NOT dead: it is the only thing that carries a
    judgement across a RENAME, which #58 ruling 5 consciously does not
    reconcile, and that is what the third test here now covers.
    ⚠ It is also still the ONLY rescue for `never_show` / `retired` /
    `trigger` on a rename — and NOT for `blessed`, which is exactly the gap
    #58 measured (24 stranded blessings in her live library)."""

    def test_an_edited_judged_note_stays_one_retired_item(self):
        # ⚠ THIS TEST USED TO ASSERT THE FORK. It read: imported == 1,
        # inherited == 1, TWO twins both retired. #58 ruling 1 overturned it —
        # the note is recognised by where it lives, keeps its id, and the
        # second copy never exists. Kept at the same scenario so the overturn
        # is legible instead of silent.
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            note = src / "a hard evening.md"
            note.write_bytes("the original words\n".encode())
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["state"] = "retired"
            first_id = item["id"]
            study_lib.save_store(lib, store)

            note.write_bytes("the SAME note, edited later\n".encode())
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 0,
                             "new bytes at a known path are a refresh, "
                             "never a new item")
            self.assertEqual(report["refreshed"], 1)
            self.assertEqual(report["inherited"], 0,
                             "nothing was born, so nothing inherited")
            store = study_lib.load_store(lib)
            self.assertEqual(list(store["items"]), [first_id],
                             "one item, and it kept its id")
            self.assertEqual(store["items"][first_id]["state"], "retired",
                             "the judgment attaches to the thing, not its "
                             "bytes")
            self.assertEqual(
                (lib / store["items"][first_id]["library_path"])
                .read_bytes(), "the SAME note, edited later\n".encode(),
                "and the snapshot holds the words that are there now")

    def test_an_edited_flagged_note_keeps_its_flag_without_forking(self):
        # ⚠ ALSO REWRITTEN — it used to assert inherited == 1 across two
        # items. The fence still ends up True; it gets there by being carried
        # rather than by being re-inherited (#58 ruling 2's ratchet).
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            note = src / "flagged memory.md"
            note.write_bytes(b"v1\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["trigger"] = True
            study_lib.save_store(lib, store)

            note.write_bytes(b"v2 edited\n")
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["refreshed"], 1)
            store = study_lib.load_store(lib)
            self.assertEqual(len(store["items"]), 1)
            for t in store["items"].values():
                self.assertTrue(t["trigger"],
                                "a hand-set fence is never lowered by a "
                                "refresh")

    def test_a_second_copy_of_a_judged_note_still_inherits(self):
        # THE MECHANISM'S REMAINING REASON TO EXIST, and it is NOT the rename
        # (see TestRenameGapAccepted — a rename breaks the folded title, so
        # the inheritance cannot see it either). What it still catches is a
        # SECOND COPY: same name, different folder, and the judged original
        # still sitting where it always was. The reconciliation deliberately
        # refuses that — both files are here, so they are two notes, not a
        # move — and the new one is born hidden rather than born unseen.
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            (src / "keep").mkdir(parents=True)
            (src / "keep" / "a hard evening.md").write_bytes(b"v1\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["state"] = "never_show"
            study_lib.save_store(lib, store)

            (src / "copy").mkdir()
            (src / "copy" / "a hard evening.md").write_bytes(b"v2 edited\n")
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 1,
                             "the original is still on disk, so this is a "
                             "second note and never a move")
            self.assertEqual(report["inherited"], 1,
                             "the inheritance is counted out loud")
            store = study_lib.load_store(lib)
            self.assertEqual(len(store["items"]), 2)
            for it in store["items"].values():
                self.assertEqual(it["state"], "never_show")
            born = [i for i in store["items"].values()
                    if i["folder"] == "copy"][0]
            self.assertEqual(born["history"][0]["via"],
                             "import-inherited-judgment",
                             "the birth record says WHY it was born hidden")

    def test_unjudged_titles_do_not_inherit(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "plain.md").write_bytes(b"v1\n")
            study_lib.import_folder(src, lib)
            (src / "plain.md").write_bytes(b"v2\n")
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["inherited"], 0,
                             "a blessed/unseen twin inherits nothing — "
                             "only the protective judgments carry")


class TestIdentityWire(unittest.TestCase):
    """Test 19 — #58 (2026-08-14): an item is keyed by WHERE THE FILE LIVES,
    falling back to WHAT IT IS CALLED, and it keeps its id across an edit.

    The defect these cover, reproduced end to end before the fix: import ->
    bless -> tidy-up -> re-import left TWO items — the blessed one, and a new
    unseen one at the same origin_path — because an item's id is the prefix of
    its content hash and a whitespace-only edit changes that hash completely.
    Her live library already held 32 such forked paths and 24 stranded
    blessings before anything was built."""

    def _one_note(self, tmp, body=b"the original words\n", name="note.md"):
        src = Path(tmp) / "source"
        lib = Path(tmp) / "library"
        src.mkdir(exist_ok=True)
        (src / name).write_bytes(body)
        study_lib.import_folder(src, lib)
        return src, lib

    def test_a_tidied_note_keeps_its_id_its_blessing_and_gains_the_words(self):
        # THE REPRODUCTION, INVERTED. The tidy-up's own write path is used
        # rather than a hand-written file, so what is asserted is the real
        # shipped route and not an approximation of it.
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._one_note(
                tmp, b"Hello. World. This is one long wall of text.\n")
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["state"] = "blessed"
            item["last_opened_ms"] = 4242
            item["resting_until_ms"] = 99
            first_id = item["id"]
            study_lib.save_store(lib, store)

            note = src / "note.md"
            rec = study_lib.apply_readability_body(
                str(note),
                "Hello.\nWorld. This is one long wall of text.\n",
                approved={first_id: str(note)})
            self.assertIsNotNone(rec, "the shipped write must actually write")

            report = study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            self.assertEqual(list(store["items"]), [first_id],
                             "ONE item, and it is the one she blessed")
            kept = store["items"][first_id]
            self.assertEqual(kept["state"], "blessed")
            self.assertEqual(kept["last_opened_ms"], 4242)
            self.assertEqual(kept["resting_until_ms"], 99)
            self.assertEqual(report["refreshed"], 1)
            self.assertEqual(report["imported"], 0)
            self.assertEqual(kept["content_hash"],
                             study_lib.hash_item(note, "text")[1],
                             "the stored hash is the file that is there now")
            self.assertEqual((lib / kept["library_path"]).read_bytes(),
                             note.read_bytes(),
                             "and the snapshot was re-taken, in place")

    def test_a_hand_edit_outside_the_app_reconciles_the_same_way(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._one_note(tmp)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["state"] = "blessed"
            first_id = item["id"]
            study_lib.save_store(lib, store)

            (src / "note.md").write_bytes(
                b"the original words\nand a paragraph she added in Obsidian\n")
            report = study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            self.assertEqual(list(store["items"]), [first_id])
            self.assertEqual(store["items"][first_id]["state"], "blessed")
            self.assertEqual(report["refreshed"], 1)

    def test_an_unchanged_file_is_still_a_total_no_op(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._one_note(tmp)
            before = (Path(lib) / "items.json").read_bytes()
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["deduped"], 1)
            self.assertEqual(report["refreshed"], 0)
            after = json.loads(
                (Path(lib) / "items.json").read_text(encoding="utf-8"))
            self.assertEqual(json.loads(before.decode())["items"],
                             after["items"],
                             "D-08 still holds: nothing moved, nothing "
                             "re-derived")

    def test_a_move_reconciles_by_the_folded_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._one_note(tmp)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["state"] = "blessed"
            first_id = item["id"]
            study_lib.save_store(lib, store)

            (src / "moved").mkdir()
            (src / "note.md").rename(src / "moved" / "note.md")
            report = study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            self.assertEqual(list(store["items"]), [first_id],
                             "path gone, name intact: that is a move")
            self.assertEqual(store["items"][first_id]["state"], "blessed")
            self.assertEqual(store["items"][first_id]["origin_path"],
                             str(src / "moved" / "note.md"))
            self.assertEqual(store["items"][first_id]["folder"], "moved",
                             "the folder facet is re-derived — it is the "
                             "room's own guess, and the note moved")
            self.assertEqual(report["refreshed"], 1)

    def test_a_second_copy_never_swallows_the_first(self):
        # ⚠ THE FALLBACK'S DANGEROUS CASE, PINNED. "Match by filename" taken
        # bare would join two different notes both called note.md — and a
        # WRONG join loses a note outright, which is the harm she weighed when
        # she accepted the rename gap. The old path still existing is what
        # separates a move from a stranger.
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._one_note(tmp)
            (src / "elsewhere").mkdir()
            (src / "elsewhere" / "note.md").write_bytes(
                b"a completely different note that happens to share a name\n")
            report = study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            self.assertEqual(len(store["items"]), 2,
                             "two files on disk are two notes")
            self.assertEqual(report["imported"], 1)
            self.assertEqual(report["refreshed"], 0)

    def test_an_ambiguous_folded_name_makes_a_second_item(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            (src / "a").mkdir(parents=True)
            (src / "b").mkdir()
            (src / "a" / "note.md").write_bytes(b"one\n")
            (src / "b" / "note.md").write_bytes(b"two\n")
            study_lib.import_folder(src, lib)
            shutil.rmtree(src / "a")
            shutil.rmtree(src / "b")
            (src / "c").mkdir()
            (src / "c" / "note.md").write_bytes(b"three\n")

            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 1,
                             "two items already share the folded name, so "
                             "the room cannot tell which one moved")
            self.assertEqual(report["refreshed"], 0)
            self.assertEqual(len(study_lib.load_store(lib)["items"]), 3)

    def test_the_fence_ratchets_and_never_lowers(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._one_note(tmp)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["trigger"] = True          # her own hide, by hand
            study_lib.save_store(lib, store)

            (src / "note.md").write_bytes(b"edited, and nowhere near a roster\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            self.assertTrue(item["trigger"],
                            "#51's sticky-True: a refresh may raise the "
                            "fence, never lower it")

    def test_created_ms_survives_a_rewrite_that_changes_the_inode(self):
        # ⚠ THE TRAP THIS BUILD FOUND. Every write path here is an atomic
        # temp-write-and-rename, so a tidied note is a NEW inode whose
        # st_birthtime is now. Re-deriving created_ms would move every tidied
        # note's date — and the `year` facet her filters read — to today.
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._one_note(tmp)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            # mid-year and server-LOCAL, the way stamp_facets reads it — a
            # 1 January fixture lands in the previous year west of UTC
            born = int(datetime(1999, 6, 15, 12).timestamp() * 1000)
            item["created_ms"] = born
            item["year"] = 1999
            study_lib.save_store(lib, store)

            study_lib.atomic_write_bytes(str(src / "note.md"),
                                         b"rewritten through a rename\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            self.assertEqual(item["created_ms"], born,
                             "the birth of a note is not the birth of an "
                             "inode")
            self.assertEqual(item["year"], 1999)

    def test_reflects_is_re_derived_when_the_key_leaves_the_note(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._one_note(
                tmp, b"---\nreflects: [a note]\n---\nbody\n")
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            self.assertTrue(item.get("reflects"))

            (src / "note.md").write_bytes(b"---\ntitle: plain\n---\nbody\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            self.assertNotIn("reflects", item,
                             "a facet is the room's guess about the bytes "
                             "that are there now")


class TestRenameGapAccepted(unittest.TestCase):
    """#58 ruling 5 — the rename gap, ASSERTED AS ACCEPTED rather than left
    untested.

    A rename breaks both legs of the key at once (the path is gone AND the
    name changed), so a renamed note is a new note. She was shown the full
    consequence — that this also costs a HAND-SET HIDING, because the folded
    title is the only thing that could have carried it — and took it anyway,
    against a stated recommendation to accept: a wrong join loses a note
    outright, a missed join only makes a double, and healing is the net.

    ⛔ These tests exist so that "improving" this shows up as a red suite and
    a conversation, not as a silently better-looking import.

    ⚠ A rename whose BYTES do not move is a different case and is absorbed by
    the shipped content-hash dedup (D-08) — same bytes, same id, a no-op. That
    predates this ticket and is asserted below so the two are not confused: a
    rename only loses the note when the words moved too, which is exactly what
    a rename-and-edit in Obsidian looks like."""

    def test_a_rename_alone_is_still_the_shipped_content_dedup(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "old name.md").write_bytes(b"words\n")
            study_lib.import_folder(src, lib)
            (src / "old name.md").rename(src / "new name.md")
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 0)
            self.assertEqual(report["deduped"], 1,
                             "identical bytes hash to the identical id, "
                             "whatever the file is called (D-08)")

    def test_a_renamed_and_edited_note_becomes_a_new_item(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "old name.md").write_bytes(b"words\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["state"] = "blessed"
            study_lib.save_store(lib, store)

            (src / "old name.md").rename(src / "new name.md")
            (src / "new name.md").write_bytes(b"words, and a new line\n")
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 1,
                             "ACCEPTED: a renamed note is a new note")
            store = study_lib.load_store(lib)
            self.assertEqual(len(store["items"]), 2)
            born = [i for i in store["items"].values()
                    if i["title"] == "new name.md"][0]
            self.assertEqual(born["state"], "unseen",
                             "ACCEPTED COST: the blessing stays on the copy "
                             "that no longer has a file")

    def test_a_rename_costs_a_hand_set_hiding(self):
        # ⚠ THE STATED, ACCEPTED COST. The folder-derived fence survives a
        # rename (a renamed journal entry is still under Journal/, so
        # born_trigger re-fences it); a HAND-SET hide does not, because the
        # folded title is the only thing carrying it and the title is what
        # changed. Pinned so the cost stays visible.
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "old name.md").write_bytes(b"words\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["trigger"] = True
            study_lib.save_store(lib, store)

            (src / "old name.md").rename(src / "new name.md")
            (src / "new name.md").write_bytes(b"words, and a new line\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            born = [i for i in store["items"].values()
                    if i["title"] == "new name.md"][0]
            # ⚠⚠ FLIPPED 2026-08-19. This assertion used to be assertFalse
            # and its own message said a green True means "#58 ruling 5 needs
            # re-asking". It was re-asked and SHE CLOSED THE GAP for judged
            # notes (T-26.97-10 / REVIEW CR-02) — see
            # TestRenameGapClosedForJudgedNotes at the foot of this file for
            # the reasoning, the measurement and the narrowness cases. The
            # scenario is kept identical so the overturn is legible rather
            # than silent, exactly as #58 kept its own predecessors.
            self.assertTrue(born["trigger"],
                            "CLOSED 2026-08-19 on her re-ask: a hand-set "
                            "hiding now travels a rename-and-edit, because "
                            "liveness put this walk behind a candle tap")


    # -- the sentence the room now says out loud ---------------------------
    #
    # ⚠ IMPORT-GUIDE.md's "renaming a note" footnote is the owner's approved
    # disclosure of this gap (2026-08-15). A promise in prose that nothing
    # checks is a hope, and this one was WRONG on its first draft: it said a
    # rename loses the note, and running it showed a rename ALONE is the
    # shipped content dedup and loses nothing. Each clause it ended up making
    # is a case here, so the guide cannot drift from the room.

    def _vault(self, tmp):
        vault = Path(tmp) / "vault"
        (vault / ".obsidian").mkdir(parents=True)   # so it detects as a vault
        (vault / "Journal").mkdir()
        (vault / "notes").mkdir()
        lib = Path(tmp) / "library"
        lib.mkdir()
        return vault, lib

    def test_the_guide_moving_a_note_keeps_what_she_said(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, lib = self._vault(tmp)
            note = vault / "notes" / "a walk.md"
            note.write_bytes(b"the walk\n")
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["state"] = "blessed"
            item["last_opened_ms"] = 99
            kept = item["id"]
            study_lib.save_store(lib, store)

            (vault / "elsewhere").mkdir()
            shutil.move(str(note), str(vault / "elsewhere" / "a walk.md"))
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)
            self.assertEqual(list(store["items"]), [kept])
            self.assertEqual(store["items"][kept]["state"], "blessed")
            self.assertEqual(store["items"][kept]["last_opened_ms"], 99)

    def test_the_guide_renaming_without_editing_keeps_what_she_said(self):
        # ⚠ THE CLAUSE THE FIRST DRAFT GOT WRONG. A rename with the words
        # untouched is the shipped content dedup: same bytes, same id, and
        # every judgement rides through.
        with tempfile.TemporaryDirectory() as tmp:
            vault, lib = self._vault(tmp)
            note = vault / "notes" / "old.md"
            note.write_bytes(b"a thought\n")
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["state"] = "never_show"
            study_lib.save_store(lib, store)

            note.rename(vault / "notes" / "new.md")
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)
            self.assertEqual(len(store["items"]), 1, "still ONE note")
            self.assertEqual(
                list(store["items"].values())[0]["state"], "never_show",
                "and it is still hidden — a rename alone costs nothing")

    def test_the_guide_a_new_name_and_new_words_arrives_as_a_second_note(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, lib = self._vault(tmp)
            note = vault / "notes" / "old.md"
            note.write_bytes(b"a thought\n")
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["state"] = "never_show"
            hidden = item["id"]
            study_lib.save_store(lib, store)

            note.rename(vault / "notes" / "new.md")
            (vault / "notes" / "new.md").write_bytes(b"a thought, and more\n")
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)
            self.assertEqual(len(store["items"]), 2, "a SECOND note arrives")
            self.assertEqual(store["items"][hidden]["state"], "never_show",
                             "the original stays exactly as she left it — "
                             "nothing she said is lost")
            fresh = [i for i in store["items"].values() if i["id"] != hidden]
            # ⚠⚠ FLIPPED 2026-08-19, SAME RE-ASK AS ABOVE. The second note
            # still ARRIVES (ruling 5's identity call is untouched — the room
            # genuinely cannot tell it is the same file), but it arrives
            # HELD BACK rather than unseen.
            # ⛔⛔ IMPORT-GUIDE.md's "renaming a note" bullet is now FALSE on
            # its second half: it still tells her "the new copy is not hidden,
            # and the manage view is where to hide it too." That sentence is
            # HER approved wording (2026-08-15) and an agent may not rewrite
            # it. It is OWED COPY, routed to her — see
            # 26.97-SECURITY.md § Owed copy.
            self.assertEqual(fresh[0]["state"], "never_show",
                             "the new copy is HELD BACK now — a judged note "
                             "does not come back unseen because she renamed "
                             "and edited it")

    def test_the_guide_a_private_folder_is_not_affected(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, lib = self._vault(tmp)
            note = vault / "Journal" / "day one.md"
            note.write_bytes(b"diary\n")
            study_lib.import_folder(vault, lib, roster=["Journal"])
            store = study_lib.load_store(lib)
            self.assertTrue(all(i.get("trigger") is True
                                for i in store["items"].values()))

            note.rename(vault / "Journal" / "day two.md")
            (vault / "Journal" / "day two.md").write_bytes(b"diary, more\n")
            study_lib.import_folder(vault, lib, roster=["Journal"])
            store = study_lib.load_store(lib)
            self.assertEqual(len(store["items"]), 2)
            self.assertTrue(
                all(i.get("trigger") is True for i in store["items"].values()),
                "⚠ EVERY copy stays private however it is named — this is the "
                "one half of the gap the folder fence closes, and the guide "
                "promises it")


class TestHealingTheDoubles(unittest.TestCase):
    """#58 ruling 3 — the doubles already in a library are JOINED, the copy
    the person judged surviving, counted out loud.

    ⚠ No new merge machinery: `retire_merged_item` already folds the retired
    record into the survivor's `merged_from` before removing anything, and
    already refuses to retire something blessed or something placed on a
    notebook page. Keeping the judged copy is therefore both the truthful
    direction and the only one the tree permits."""

    def _forked(self, tmp, judged_state="blessed"):
        """A library holding exactly the fork this ticket measured: two items
        at one origin_path, one judged and one unseen."""
        src = Path(tmp) / "source"
        lib = Path(tmp) / "library"
        src.mkdir()
        (src / "note.md").write_bytes(b"v1\n")
        study_lib.import_folder(src, lib)
        store = study_lib.load_store(lib)
        (old,) = store["items"].values()
        old["state"] = judged_state
        old_id = old["id"]
        twin = dict(old)
        twin["id"] = "f" * 16
        twin["state"] = "unseen"
        twin["content_hash"] = "f" * 64
        twin["library_path"] = "items/" + twin["id"] + ".md"
        twin["imported_ms"] = (old.get("imported_ms") or 0) + 1000
        store["items"][twin["id"]] = twin
        study_lib.save_store(lib, store)
        return src, lib, old_id, twin["id"]

    def test_the_judged_copy_survives_and_the_join_is_counted(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib, old_id, twin_id = self._forked(tmp)
            (src / "note.md").write_bytes(b"v2, tidied\n")
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["joined"], 1,
                             "never silent — this is a sentence to her")
            store = study_lib.load_store(lib)
            self.assertEqual(list(store["items"]), [old_id],
                             "the copy she judged is the survivor")
            kept = store["items"][old_id]
            self.assertEqual(kept["state"], "blessed")
            self.assertEqual((lib / kept["library_path"]).read_bytes(),
                             b"v2, tidied\n",
                             "the current words are poured into it")
            self.assertEqual(
                [r["id"] for r in kept["merged_from"]], [twin_id],
                "the retired item's whole record travels first")

    def test_a_hidden_copy_outranks_an_unseen_one_too(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib, old_id, _twin = self._forked(tmp,
                                                   judged_state="never_show")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            self.assertEqual(list(store["items"]), [old_id])
            self.assertEqual(store["items"][old_id]["state"], "never_show")

    def test_two_blessed_copies_are_left_alone_and_counted(self):
        # `merge_refusal_why` refuses to retire a blessed item, and that
        # refusal is honoured rather than worked around: the double stays and
        # is counted. Idempotent — the next import refuses again.
        with tempfile.TemporaryDirectory() as tmp:
            src, lib, old_id, twin_id = self._forked(tmp)
            store = study_lib.load_store(lib)
            store["items"][twin_id]["state"] = "blessed"
            study_lib.save_store(lib, store)
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["joined"], 0)
            self.assertEqual(report["join_refused"], 1)
            self.assertEqual(len(study_lib.load_store(lib)["items"]), 2)

    def test_healing_runs_over_the_whole_store_not_only_the_walk(self):
        # her call on the frozen verdicts, applied here: fix what is already
        # stuck, do not merely stop making more. A double at a path this
        # import never touches is still a double.
        with tempfile.TemporaryDirectory() as tmp:
            _src, lib, old_id, _twin = self._forked(tmp)
            other = Path(tmp) / "other"
            other.mkdir()
            (other / "unrelated.md").write_bytes(b"nothing to do with it\n")
            report = study_lib.import_folder(other, lib)
            self.assertEqual(report["joined"], 1)
            store = study_lib.load_store(lib)
            self.assertIn(old_id, store["items"])


class TestVerdictStaleness(unittest.TestCase):
    """#94 ruling 2 reaching its consumer through #58's refresh: a shelf
    verdict is the ROOM's guess about a note's WORDS, so it dies with them —
    and ruling 7, that the tidy-up's whitespace is not such a change."""

    def _library(self, tmp, body):
        src = Path(tmp) / "source"
        lib = Path(tmp) / "library"
        src.mkdir()
        (src / "note.md").write_bytes(body)
        study_lib.import_folder(src, lib)
        store = study_lib.load_store(lib)
        (item,) = store["items"].values()
        return src, lib, item["id"]

    def test_whitespace_alone_never_expires_a_verdict(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib, item_id = self._library(
                tmp, b"Hello. World. A wall of text with no breaks.\n")
            sugg = Path(lib) / "librarian" / "suggestions.json"
            study_lib.merge_suggestions(sugg, {item_id: {"shelf": "joyful",
                                                         "why": "warm"}})
            seen = []
            (src / "note.md").write_bytes(
                b"Hello.\nWorld. A wall of text with no breaks.\n")
            report = study_lib.import_folder(src, lib,
                                             superseded_cb=seen.append)
            self.assertEqual(report["refreshed"], 1)
            self.assertEqual(seen, [],
                             "the tidy-up's own invariant IS the staleness "
                             "test — no words moved, so nothing expires")
            self.assertEqual(
                study_lib.load_suggestions(sugg)["verdicts"][item_id][
                    "shelf"], "joyful")

    def test_changed_words_expire_the_room_s_guess(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib, item_id = self._library(tmp, b"the original words\n")
            sugg = Path(lib) / "librarian" / "suggestions.json"
            study_lib.merge_suggestions(sugg, {item_id: {"shelf": "joyful",
                                                         "why": "warm"}})
            (src / "note.md").write_bytes(b"something else entirely\n")
            study_lib.import_folder(
                src, lib,
                superseded_cb=lambda ids: study_lib.expire_suggestions(sugg,
                                                                     ids))
            self.assertNotIn(item_id,
                             study_lib.load_suggestions(sugg)["verdicts"],
                             "the record is DELETED, not blanked — a blanked "
                             "one would be invisible and unsortable at once")

    def test_what_she_answered_stays_answered(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib, item_id = self._library(tmp, b"the original words\n")
            sugg = Path(lib) / "librarian" / "suggestions.json"
            study_lib.merge_suggestions(sugg, {item_id: {
                "shelf": "joyful", "acked": True, "user_took": "blessed"}})
            (src / "note.md").write_bytes(b"something else entirely\n")
            study_lib.import_folder(
                src, lib,
                superseded_cb=lambda ids: study_lib.expire_suggestions(sugg,
                                                                     ids))
            record = study_lib.load_suggestions(sugg)["verdicts"][item_id]
            self.assertEqual(record["user_took"], "blessed",
                             "#94 ruling 5 — her answer outranks a fresh "
                             "guess, and it is hers, not the room's")


class TestConversationsAreNotReconciled(unittest.TestCase):
    """#58 ruling 1, applied to a source that has no files: a materialized
    conversation is NEVER joined by its origin path.

    ⚠ THIS IS A GUARD, NOT AN OMISSION, AND IT WAS BUILT WRONG FIRST. A
    conversation's origin_path is `conversations.json:<index>` — its ORDINAL
    POSITION IN THE EXPORT, not anything about the conversation. Exports come
    out most-recent-first, so one new chat shifts every index by one. Keying
    identity on that path joined an item to whoever now sat at its number:
    reproduced live, a blessed conversation came back holding a chat she had
    never seen, STILL BLESSED, on its way to the shelf.

    A grown conversation therefore still forks, exactly as IMPORT-GUIDE.md
    already tells her it does. Ruling 1's key is where a file LIVES falling
    back to what it is CALLED, and a conversation has neither — so the room
    cannot tell, and the ruled answer when it cannot tell is a second item."""

    def _export(self, tmp, convs):
        src = write_chatgpt_export(Path(tmp) / "export", convs)
        lib = Path(tmp) / "lib"
        lib.mkdir(exist_ok=True)
        return src, lib

    def test_a_new_chat_at_the_front_never_takes_another_s_place(self):
        knit = linear_chatgpt_conv("Knitting plans", "the wool she loves")
        docs = linear_chatgpt_conv("Doctor notes", "the appointment")
        fresh = linear_chatgpt_conv("A new chat", "she has never seen this")
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._export(tmp, [knit, docs])
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            blessed = [i for i in store["items"].values()
                       if i["title"] == "Knitting plans"][0]
            blessed["state"] = "blessed"
            blessed_id = blessed["id"]
            study_lib.save_store(lib, store)

            # the same folder, re-exported: every index has shifted by one
            write_chatgpt_export(src, [fresh, knit, docs])
            report = study_lib.import_folder(src, lib)

            store = study_lib.load_store(lib)
            kept = store["items"][blessed_id]
            self.assertEqual(
                kept["title"], "Knitting plans",
                "the conversation she blessed is STILL the conversation she "
                "blessed — an index is not an identity")
            self.assertEqual(kept["state"], "blessed")
            self.assertEqual(report["refreshed"], 0,
                             "nothing here may be refreshed: the room cannot "
                             "tell one conversation from another")
            self.assertEqual(report["imported"], 1, "only the new chat is new")
            self.assertEqual(report["deduped"], 2,
                             "and the two unchanged ones are the shipped "
                             "content dedup, untouched by this ticket")

    def test_a_note_can_never_claim_a_conversation_by_its_name(self):
        # the other direction, and the reason conversations are kept out of
        # BOTH legs: a chat titled `recipes.md` and a note called `recipes.md`
        # fold to the same string, and the move leg only asks whether the old
        # path is gone — which for a conversation it always is.
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._export(
                tmp, [linear_chatgpt_conv("recipes.md", "what we ate")])
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (chat,) = store["items"].values()
            chat_id = chat["id"]

            folder = Path(tmp) / "notes"
            folder.mkdir()
            (folder / "recipes.md").write_bytes(b"her own recipe note\n")
            report = study_lib.import_folder(folder, lib)

            store = study_lib.load_store(lib)
            self.assertEqual(report["imported"], 1)
            self.assertEqual(report["refreshed"], 0)
            self.assertEqual(store["items"][chat_id]["title"], "recipes.md")
            self.assertEqual(
                (lib / store["items"][chat_id]["library_path"]).read_bytes()
                .count(b"her own recipe note"), 0,
                "a note's words never land inside a conversation")

    def test_a_note_the_room_wrote_is_not_claimable_either(self):
        # the same guard, second kind: a minted note's origin_path is
        # `items/<id>.md` — relative, and inside the library. It never came
        # from a file of hers, so no file of hers may become it.
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "notes"
            folder.mkdir()
            (folder / "seed.md").write_bytes(b"seed\n")
            lib = Path(tmp) / "lib"
            lib.mkdir()
            study_lib.import_folder(folder, lib)
            store = study_lib.load_store(lib)
            minted_id = "fae9c49f70dcffd5"
            store["items"][minted_id] = {
                "id": minted_id, "content_hash": "0" * 64,
                "source": "librarian",
                "origin_path": f"items/{minted_id}.md",
                "library_path": f"items/{minted_id}.md",
                # ⚠ the title is spelled WITH the extension on purpose: the
                # folded name is the whole file name, so a title without one
                # could never collide and the test would pass for the wrong
                # reason. A minted title is whatever the model wrote.
                "type": "text", "title": "the tinker's hands.md",
                "created_ms": 1, "saved_ms": 1, "imported_ms": 1,
                "last_opened_ms": None, "state": "blessed",
                "resting_until_ms": None, "tags": [], "trigger": False,
                "history": [],
            }
            study_lib.save_store(lib, store)

            (folder / "the tinker's hands.md").write_bytes(b"not the gift\n")
            report = study_lib.import_folder(folder, lib)

            store = study_lib.load_store(lib)
            self.assertEqual(report["refreshed"], 0)
            self.assertEqual(store["items"][minted_id]["title"],
                             "the tinker's hands.md")
            self.assertEqual(store["items"][minted_id]["content_hash"],
                             "0" * 64,
                             "the room's own gift is not overwritten by a "
                             "file that happens to share its name")

    def test_a_grown_conversation_still_forks_as_the_guide_says(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._export(
                tmp, [linear_chatgpt_conv("Knitting plans", "the wool")])
            study_lib.import_folder(src, lib)
            write_chatgpt_export(src, [linear_chatgpt_conv(
                "Knitting plans", "the wool, and how the sleeve went")])
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 1)
            self.assertEqual(report["refreshed"], 0)
            self.assertEqual(len(study_lib.load_store(lib)["items"]), 2,
                             "the fork this ticket removes for FILES is "
                             "deliberately kept for conversations — the "
                             "cheaper mistake, and what the guide promises")


class TestConflictCopyTwins(unittest.TestCase):
    """Test 18 — 26-05 UAT (the owner, found live in the blessing walk):
    iCloud sync leaves `photo.jpg` beside `photo 1.jpg`. A note embeds
    ONE of them, so the twin imported as a standalone card showing the
    same picture with no context. A still-unclaimed image differing from
    an attached one only by that trailing \" N\" rides with the same
    note."""

    def test_conflict_twin_of_an_attached_image_attaches_too(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            (src / "note.md").write_bytes("see ![[photo 1.jpg]]\n".encode())
            (src / "photo 1.jpg").write_bytes(PNG_1x1 + b"copy")
            (src / "photo.jpg").write_bytes(PNG_1x1 + b"original")
            (src / "unrelated.jpg").write_bytes(PNG_1x1 + b"loose")

            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["attached"], 2,
                             "both twins ride with the note")
            store = study_lib.load_store(lib)
            titles = sorted(i["title"] for i in store["items"].values())
            self.assertEqual(titles, ["note.md", "unrelated.jpg"],
                             "a genuinely loose photo is still an item; "
                             "the conflict twin is not")

    def test_original_to_copy_direction_also_attaches(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            src.mkdir()
            (src / "note.md").write_bytes("see ![[photo.jpg]]\n".encode())
            (src / "photo.jpg").write_bytes(PNG_1x1 + b"original")
            (src / "photo 2.jpg").write_bytes(PNG_1x1 + b"copy2")

            candidates, _ = study_lib.walk_source(src)
            _, attached = study_lib.scan_attachments(candidates)
            self.assertEqual({p.name for p in attached},
                             {"photo.jpg", "photo 2.jpg"})

    def test_unrelated_numbered_names_do_not_merge(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            src.mkdir()
            (src / "note.md").write_bytes("see ![[chart.jpg]]\n".encode())
            (src / "chart.jpg").write_bytes(PNG_1x1 + b"a")
            (src / "diagram 1.jpg").write_bytes(PNG_1x1 + b"b")

            candidates, _ = study_lib.walk_source(src)
            _, attached = study_lib.scan_attachments(candidates)
            self.assertEqual({p.name for p in attached}, {"chart.jpg"},
                             "a different stem is a different picture")

    # 26-05 UAT (the owner): a video post's cover is embedded as
    # <note-stem>_<n>_<timestamp>.jpg but the file imported bare
    # <timestamp>.jpg — reference and file share only the tail, so the direct
    # match and rule 2 both miss it. The stem-anchored suffix reconcile folds
    # it; a bare photo the note never references must stay standalone.
    def test_stem_prefixed_embed_over_bare_file_folds(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            src.mkdir()
            (src / "日本邻居奶奶祖传味玉.md").write_bytes(
                "溏心蛋\n\n![[日本邻居奶奶祖传味玉_1_2026-04-27_13-16-11.jpg]]\n"
                .encode("utf-8"))
            (src / "2026-04-27_13-16-11.jpg").write_bytes(PNG_1x1 + b"egg")
            (src / "unrelated.jpg").write_bytes(PNG_1x1 + b"loose")

            candidates, _ = study_lib.walk_source(src)
            note_refs, attached = study_lib.scan_attachments(candidates)
            self.assertEqual({p.name for p in attached},
                             {"2026-04-27_13-16-11.jpg"},
                             "the prefixed embed claims its bare-named file")
            self.assertEqual([p.name for p in note_refs],
                             ["日本邻居奶奶祖传味玉.md"])

    # Rule 5 — a clipper fragment (…_来自小红书网页版.jpg) whose parent note was
    # never saved is provably an attachment, not a photo: excluded from items
    # even with no note to fold into (it simply does not import).
    def test_orphan_clipper_fragment_is_excluded_from_items(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            frag = "让 Codex 变成 UI_UX 设计师_1_一枚设计狮_来自小红书网页版.jpg"
            (src / frag).write_bytes(PNG_1x1 + b"frag")

            candidates, _ = study_lib.walk_source(src)
            _, attached = study_lib.scan_attachments(candidates)
            self.assertEqual({p.name for p in attached}, {frag},
                             "an ownerless clipper fragment is not a photo")

            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 0,
                             "the fragment never enters the catalog")
            self.assertEqual(list(study_lib.load_store(lib)["items"]), [])

    # …but the SAME clipper naming still folds normally when its parent note
    # is present (rule 2 owns it) — rule 5 only catches the ownerless case.
    def test_clipper_fragment_with_its_note_still_folds(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            src.mkdir()
            att = "boho blocks blanket_1_木棉花_来自小红书网页版.jpg"
            (src / "boho blocks blanket.md").write_bytes(
                ("![[" + att + "]]").encode("utf-8"))
            (src / att).write_bytes(PNG_1x1 + b"boho")

            candidates, _ = study_lib.walk_source(src)
            note_refs, attached = study_lib.scan_attachments(candidates)
            self.assertEqual({p.name for p in attached}, {att})
            self.assertEqual([p.name for p in note_refs],
                             ["boho blocks blanket.md"])


def _make_vault(root: Path, files):
    """Build an Obsidian vault at `root` (an .obsidian dir makes the adapter
    pick obsidian-vault) with the given {relative_path: bytes} files. Returns
    root."""
    (root / ".obsidian").mkdir(parents=True)
    (root / ".obsidian" / "app.json").write_text("{}", encoding="utf-8")
    for rel, data in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
    return root


class TestOriginUnderRoster(unittest.TestCase):
    """26.4-01 (D-08): the pure path-prefix predicate, fail-closed.

    ⚠ It was the TOP-LEVEL-segment predicate until 2026-08-14; a roster entry
    may now name a folder inside another folder (owner's ruling). The match is
    segment-wise and WHOLE — never a string prefix."""

    def test_first_segment_equality_matches(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp) / "vault"
            (vault / "Journal").mkdir(parents=True)
            origin = vault / "Journal" / "2026-01.md"
            origin.write_bytes(b"x")
            self.assertTrue(study_lib._origin_under_roster(
                str(origin), str(vault), ["Journal"]))
            # a deeper file under the top-level folder still matches on its
            # FIRST segment
            deep = vault / "Journal" / "2026" / "jan.md"
            deep.parent.mkdir(parents=True, exist_ok=True)
            deep.write_bytes(b"y")
            self.assertTrue(study_lib._origin_under_roster(
                str(deep), str(vault), ["Journal"]))

    def test_non_matching_folder_is_false(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp) / "vault"
            (vault / "notes").mkdir(parents=True)
            origin = vault / "notes" / "a.md"
            origin.write_bytes(b"x")
            self.assertFalse(study_lib._origin_under_roster(
                str(origin), str(vault), ["Journal", "personnel notes"]))

    def test_a_roster_entry_may_name_a_folder_inside_a_folder(self):
        # ⚠ AMENDED 2026-08-14 BY THE OWNER, and this test used to assert the
        # opposite: a sub-path entry was read as its FIRST SEGMENT ONLY. On
        # her real vault that meant asking for `Clippings/journal/chatgpt` to
        # be private would have fenced the whole of `Clippings` — 1,921 things
        # instead of 344, including 62 she had blessed. A privacy control that
        # quietly covers five times what it says is worse than one that cannot
        # express the request at all.
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp) / "vault"
            (vault / "personnel notes" / "warnings").mkdir(parents=True)
            (vault / "personnel notes" / "kudos").mkdir(parents=True)
            inside = vault / "personnel notes" / "warnings" / "w.md"
            inside.write_bytes(b"x")
            sibling = vault / "personnel notes" / "kudos" / "k.md"
            sibling.write_bytes(b"x")

            self.assertTrue(study_lib._origin_under_roster(
                str(inside), str(vault), ["personnel notes/warnings"]))
            self.assertFalse(
                study_lib._origin_under_roster(
                    str(sibling), str(vault), ["personnel notes/warnings"]),
                "a sibling folder is NOT inside the one she named — this is "
                "the whole point of the amendment")
            # the parent still fences everything under it, unchanged
            self.assertTrue(study_lib._origin_under_roster(
                str(sibling), str(vault), ["personnel notes"]))
            self.assertTrue(study_lib._origin_under_roster(
                str(inside), str(vault), ["personnel notes/"]))

    def test_a_roster_entry_matches_whole_segments_never_substrings(self):
        # ⚠ THE NEAR-MISS THAT IS REAL ON HER VAULT: `Journal` is private and
        # `Journal analysis` holds the room's own writing ABOUT her diary. A
        # string-prefix match would fence the second by accident, and the
        # nested rule must not introduce that on the way past.
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp) / "vault"
            (vault / "Journal analysis").mkdir(parents=True)
            (vault / "Clippings" / "journalism").mkdir(parents=True)
            note = vault / "Journal analysis" / "a.md"
            note.write_bytes(b"x")
            self.assertFalse(study_lib._origin_under_roster(
                str(note), str(vault), ["Journal"]))
            other = vault / "Clippings" / "journalism" / "b.md"
            other.write_bytes(b"x")
            self.assertFalse(
                study_lib._origin_under_roster(
                    str(other), str(vault), ["Clippings/journal"]),
                "`Clippings/journal` and `Clippings/journalism` are two "
                "different places")

    def test_roster_segments_is_the_one_spelling(self):
        self.assertEqual(study_lib.roster_segments("a/b/c"), ["a", "b", "c"])
        self.assertEqual(study_lib.roster_segments("/a//b/"), ["a", "b"])
        self.assertEqual(study_lib.roster_segments("a\\b"), ["a", "b"])
        self.assertEqual(study_lib.roster_segments("  a / b "), ["a", "b"])
        self.assertEqual(study_lib.roster_segments("../a"), ["a"])
        for empty in ("", "   ", "/", None, "."):
            self.assertEqual(study_lib.roster_segments(empty), [],
                             "an entry naming nothing fences nothing")
        # case is left alone on this side, deliberately: folding here would
        # silently WIDEN every existing entry's reach
        self.assertEqual(study_lib.roster_segments("Journal"), ["Journal"])

    def test_out_of_root_and_bad_args_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp) / "vault"
            vault.mkdir()
            outside = Path(tmp) / "elsewhere" / "x.md"
            # a path NOT under the vault root → False (relative_to raises)
            self.assertFalse(study_lib._origin_under_roster(
                str(outside), str(vault), ["Journal"]))
            # missing arguments → False, never a crash, never fail-open
            self.assertFalse(study_lib._origin_under_roster(
                "", str(vault), ["Journal"]))
            self.assertFalse(study_lib._origin_under_roster(
                str(vault / "a.md"), "", ["Journal"]))
            self.assertFalse(study_lib._origin_under_roster(
                str(vault / "a.md"), str(vault), []))


class TestBornFlagRoster(unittest.TestCase):
    """26.4-01 (D-05/D-07): whole-vault import stamps trigger=True for
    roster-matched origins and False otherwise; adding a folder retroactively
    flags existing items; removing a folder leaves existing flags intact."""

    def _titles_by_trigger(self, store):
        flagged, clear = set(), set()
        for it in store["items"].values():
            (flagged if it.get("trigger") else clear).add(it["title"])
        return flagged, clear

    def test_whole_vault_import_born_flags_roster_matches(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = _make_vault(Path(tmp) / "vault", {
                "Journal/diary.md": b"# a raw evening\n",
                "notes/recipe.md": b"# a bright soup\n",
                "personnel notes/warning.md": b"# the letter\n",
            })
            lib = Path(tmp) / "library"
            report = study_lib.import_folder(vault, lib)
            self.assertEqual(report["imported"], 3)
            store = study_lib.load_store(lib)
            flagged, clear = self._titles_by_trigger(store)
            # default roster fences Journal + personnel notes; notes stays open
            self.assertEqual(flagged, {"diary.md", "warning.md"},
                             "roster-matched origins are born trigger-flagged")
            self.assertEqual(clear, {"recipe.md"},
                             "a non-roster origin is born trigger=False")
            # the vault root is remembered for a later retroactive add (D-07)
            self.assertEqual(
                store["meta"]["vault_root"], str(vault.resolve()),
                "the whole-vault import remembers its vault root")

    def test_folder_drop_source_never_born_flags(self):
        # a plain folder (no .obsidian) is source folder-drop — the roster
        # fences by vault-relative origin, which only obsidian-vault carries,
        # so a "Journal" subfolder in a folder-drop is NOT born-flagged.
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "drop"
            (src / "Journal").mkdir(parents=True)
            (src / "Journal" / "note.md").write_bytes(b"# hello\n")
            lib = Path(tmp) / "library"
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            self.assertIs(item["trigger"], False,
                          "folder-drop never born-flags by roster (D-08)")

    def test_adding_a_folder_retroactively_flags_existing_items(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = _make_vault(Path(tmp) / "vault", {
                "letters/home.md": b"# a letter home\n",
                "notes/soup.md": b"# a bright soup\n",
            })
            lib = Path(tmp) / "library"
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)
            # neither is in the default roster, so both import trigger=False
            self.assertEqual(self._titles_by_trigger(store)[0], set())

            # add "letters" — retroactive over already-imported items, using
            # the vault_root the import remembered (no explicit arg)
            flagged = study_lib.add_roster_folder(store, "letters")
            self.assertEqual(flagged, 1, "one existing item newly flagged")
            self.assertIn("letters", store["meta"]["fenced_roster"])
            flagged_titles, clear = self._titles_by_trigger(store)
            self.assertEqual(flagged_titles, {"home.md"},
                             "the letters item is retroactively flagged")
            self.assertEqual(clear, {"soup.md"}, "the notes item stays open")
            # the retroactive flag is recorded WHY (a same-state history line)
            letter = [it for it in store["items"].values()
                      if it["title"] == "home.md"][0]
            self.assertEqual(letter["history"][-1]["via"],
                             "roster-add-retroactive")

    def test_removing_a_folder_is_future_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = _make_vault(Path(tmp) / "vault", {
                "Journal/one.md": b"# entry one\n",
            })
            lib = Path(tmp) / "library"
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)
            # born-flagged by the default roster (Journal)
            self.assertTrue(next(iter(store["items"].values()))["trigger"])

            # remove Journal — the roster loses it, but the existing flag STAYS
            study_lib.remove_roster_folder(store, "Journal")
            self.assertNotIn("Journal", store["meta"]["fenced_roster"])
            self.assertTrue(
                next(iter(store["items"].values()))["trigger"],
                "already-flagged items stay flagged (D-07 safe asymmetry)")
            study_lib.save_store(lib, store)

            # a FUTURE import of a NEW journal file is no longer born-flagged
            (vault / "Journal" / "two.md").write_bytes(b"# entry two\n")
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)
            two = [it for it in store["items"].values()
                   if it["title"] == "two.md"][0]
            self.assertIs(two["trigger"], False,
                          "removal only stops flagging future imports")
            one = [it for it in store["items"].values()
                   if it["title"] == "one.md"][0]
            self.assertTrue(one["trigger"],
                            "the original stays flagged after the removal")

    def test_new_store_seeds_the_three_additive_meta_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = study_lib.new_store(Path(tmp) / "lib")
            meta = store["meta"]
            self.assertEqual(meta["fenced_roster"],
                             study_lib.DEFAULT_FENCED_ROSTER)
            self.assertIsNone(meta["last_visit_ms"])
            self.assertIs(meta["sync_comments_enabled"], False)

    def test_store_missing_the_new_keys_behaves_like_fresh(self):
        # a store loaded WITHOUT the additive keys must fence by the shipped
        # default roster exactly as a fresh one does (absent = default).
        with tempfile.TemporaryDirectory() as tmp:
            vault = _make_vault(Path(tmp) / "vault", {
                "Journal/x.md": b"# private\n",
                "notes/y.md": b"# open\n",
            })
            lib = Path(tmp) / "library"
            # seed a store with NO fenced_roster / last_visit_ms keys
            legacy = study_lib.new_store(lib)
            for k in ("fenced_roster", "last_visit_ms",
                      "sync_comments_enabled"):
                legacy["meta"].pop(k, None)
            lib.mkdir(parents=True, exist_ok=True)
            (lib / "items").mkdir(exist_ok=True)
            study_lib.save_store(lib, legacy)

            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)
            flagged = {it["title"] for it in store["items"].values()
                       if it.get("trigger")}
            self.assertEqual(flagged, {"x.md"},
                             "absent roster falls back to the shipped default")


class TestImportLeavesDecorationsAlone(unittest.TestCase):
    """26.9-03 (D-23) — the import path and the decoration store are
    strangers, and the library root is now shared ground between them.

    Before D-23 the import walker had the library root essentially to
    itself: items.json plus the snapshot tree. decorations.json now lives
    there too, as a SIBLING of librarian/ (owner-decided 2026-08-04). That
    is the right home — the root is the irreplaceable tier — but it does
    put a hand-made file directly in the path of a routine, repeatable
    operation, so the no-op has to be asserted rather than assumed.

    D-08 already says a re-import is a no-op for STATE. This says it is a
    no-op for the things she MADE, which is a stronger claim about a file
    the import code has never heard of."""

    def _decorate(self, lib):
        study_lib.save_decorations(lib, {"08/04/2026": {
            "reset": False,
            "items": [{"page": "abc123", "kind": "text",
                       "x": 40, "y": 90, "text": "光线很好"}]}})
        return study_lib.decorations_file_path(lib).read_bytes()

    def test_reimport_leaves_the_decorations_file_byte_identical(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            build_corpus(src)

            study_lib.import_folder(src, lib)
            before = self._decorate(lib)

            # a full second pass over the same corpus — the D-08 no-op
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["imported"], 0, "nothing new")

            after = study_lib.decorations_file_path(lib).read_bytes()
            self.assertEqual(after, before,
                             "a re-import must leave decorations.json "
                             "BYTE-IDENTICAL — asserted on the bytes, not "
                             "on 'the file still exists'")
            self.assertEqual(
                study_lib.load_decorations(lib)["days"]["08/04/2026"]
                ["items"][0]["text"], "光线很好",
                "and her own words come back as she typed them")

    def test_a_first_import_into_an_already_decorated_library(self):
        # the order that actually breaks things if anything does: she
        # decorates, THEN imports for the first time into that root. The
        # importer creates items.json beside a file it has never heard of.
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            src.mkdir()
            lib.mkdir()
            build_corpus(src)

            before = self._decorate(lib)
            study_lib.import_folder(src, lib)
            self.assertEqual(
                study_lib.decorations_file_path(lib).read_bytes(), before,
                "importing INTO a decorated library leaves the "
                "decorations untouched")
            self.assertTrue(study_lib._store_path(lib).exists(),
                            "and the import still did its own job")

    def test_the_importer_never_names_the_decoration_store(self):
        # the architectural half: import_folder has no business knowing
        # this file exists. A byte-identity assertion says the two do not
        # collide TODAY; this says they cannot start to.
        src = Path(study_lib.__file__).read_text(encoding="utf-8")
        start = src.index("\ndef import_folder(")
        rest = src[start + 1:]
        nxt = re.search(r"\n(?=(def |class |@))", rest)
        body = rest[:nxt.start()] if nxt else rest
        self.assertGreater(len(body), 500,
                           "the extracted import_folder body must be "
                           "substantial — a negative check over an empty "
                           "region proves nothing")
        for token in ("decorations", "decorations.json",
                      "load_decorations", "save_decorations",
                      "decorations_file_path"):
            self.assertNotIn(token, body,
                             f"import_folder must never name '{token}' — "
                             f"the importer and the decoration store share "
                             f"a directory and nothing else")


# ---------------------------------------------------------------------------
# 26.97-06 — the server-side finished-timestamp on the last-import report
# ---------------------------------------------------------------------------
# `time` is not in this module's import block; the five cases below are the
# only readers of it, so it is imported beside them rather than above.
import time  # noqa: E402


# The report's key set AT HEAD, pinned BY VALUE (names and count), measured by
# running an import against the shipped code before this field existed. The
# key-set case below compares against this so a rename or a drop is caught
# here rather than discovered later by a screen that stopped rendering.
HEAD_REPORT_KEYS = {
    "attached", "deduped", "imported", "inherited",
    "join_refused", "joined", "refreshed", "skipped",
}


class TestImportFinishedTimestamp(unittest.TestCase):
    """26.97-06 — the last-import report carries a SERVER-SIDE finish time.

    ⛔ The obvious client-side fix is the defect: a clock read in the browser
    when the line is painted is the CURRENT time, not the import time, and it
    would make every stale report read as if it had just happened. The window
    case below is what excludes that — it brackets the import with two
    readings taken here, so a value sourced from anywhere other than the run
    itself falls outside and fails.

    ⚠ The value says WHEN THE IMPORT RAN. It is never how long it has been
    since she was last here (law 3).
    """

    @staticmethod
    def _import_once(tmp, name="source", lib_name="library", body=b"# a\n"):
        """Run one import into `tmp`/<lib_name> from a fresh source folder.
        Returns (report, lib_path)."""
        src = Path(tmp) / name
        lib = Path(tmp) / lib_name
        src.mkdir(exist_ok=True)
        (src / "note.md").write_bytes(body)
        return study_lib.import_folder(src, lib), lib

    @staticmethod
    def _stored_report(lib):
        """The report as it comes BACK OFF DISK — not the dictionary the
        import returned. A field that exists only in the returned dictionary
        never reaches her screen."""
        return study_lib.load_store(lib)["meta"]["last_import_report"]

    def test_finished_timestamp_inside_run_window(self):
        with tempfile.TemporaryDirectory() as tmp:
            # ⚠ THE BRACKET. Two readings taken HERE, one on each side of the
            # import. A value read at paint time — or from anywhere other
            # than this run — lands outside and fails.
            before_ms = int(time.time() * 1000)
            report, lib = self._import_once(tmp)
            after_ms = int(time.time() * 1000)

            stored = self._stored_report(lib)
            self.assertIn("finished_ms", stored,
                          "the stored report must carry the server's finish "
                          "time; without it the room cannot say when")
            value = stored.get("finished_ms")
            self.assertIsInstance(value, int,
                                  "epoch milliseconds, the same idiom the "
                                  "importer and the ledger already use")
            self.assertGreaterEqual(
                value, before_ms,
                "the finish time is earlier than the reading taken just "
                "BEFORE the import — it did not come from this run")
            self.assertLessEqual(
                value, after_ms,
                "the finish time is later than the reading taken just AFTER "
                "the import — it did not come from this run")

    def test_stored_report_carries_a_finished_timestamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            _report, lib = self._import_once(tmp)
            stored = self._stored_report(lib)
            self.assertIn("finished_ms", stored,
                          "after an import the STORED report carries a "
                          "finished-timestamp")

    def test_finished_timestamp_survives_the_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            report, lib = self._import_once(tmp)
            # Reload from disk rather than reading the returned dictionary:
            # the value must ride out on the single atomic save, not be
            # recomputed on read.
            stored_value = self._stored_report(lib).get("finished_ms")
            self.assertIsInstance(
                stored_value, int,
                "the finish time must come back off disk unchanged; a value "
                "that lives only in the returned dictionary never reaches "
                "her screen")
            self.assertEqual(
                stored_value, report.get("finished_ms"),
                "the stored value and the returned value are the same fact — "
                "nothing recomputes it on read")

    def test_two_imports_produce_a_later_second_timestamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            self._import_once(tmp)
            first = self._stored_report(Path(tmp) / "library").get("finished_ms")
            time.sleep(0.05)   # a real gap, so the two readings differ
            self._import_once(tmp, name="source2")
            second = self._stored_report(Path(tmp) / "library").get("finished_ms")

            self.assertIsInstance(first, int, "first run recorded no finish time")
            self.assertIsInstance(second, int,
                                  "the SECOND run recorded no finish time — a "
                                  "first-run-only value is not a finish time")
            self.assertGreater(
                second, first,
                "the second import's finish time must be the later one; a "
                "constant would pass every other case and fail here")

    def test_report_key_set_grows_by_exactly_the_stamp(self):
        with tempfile.TemporaryDirectory() as tmp:
            report, lib = self._import_once(tmp)
            expected = HEAD_REPORT_KEYS | {"finished_ms"}

            self.assertEqual(
                set(report.keys()), expected,
                "add-alongside: every key that already rode in the report "
                "keeps its name, and exactly one is added")
            self.assertEqual(
                len(report), len(HEAD_REPORT_KEYS) + 1,
                "the key COUNT grew by exactly one — by value, not by "
                "eyeballing the diff")
            self.assertEqual(
                set(self._stored_report(lib).keys()), expected,
                "the stored report has the same shape as the returned one")


if __name__ == "__main__":
    unittest.main()


class TestRenameGapClosedForJudgedNotes(unittest.TestCase):
    """26.97 security remediation (T-26.97-10 / REVIEW CR-02) — the
    rename-and-edit gap is CLOSED for a note she has judged, and left exactly
    as it was for every other note.

    ⚠⚠ THIS OVERTURNS #58 RULING 5, ON THE OWNER'S EXPLICIT RE-ASK
    (2026-08-19). `TestRenameGapAccepted` above says in as many words that
    closing this needs the ruling re-asked; it was, and she ruled to close it.
    What changed since the original ruling is NOT the mechanism but its
    TRIGGER: before Phase 26.97 a rename-and-edit only re-entered the room on
    a deliberate whole-vault re-import, which is a thing she chooses. Liveness
    put the same walk behind a candle tap, unattended, on a vault of ~3,000
    notes. Measured on her live library at the time of the ruling: 78 items
    marked never_show/retired, 74 of them outside any folder she keeps
    private, 18 of those reachable by a vault re-pull.

    ⛔ THE CLOSURE IS DELIBERATELY NARROW, and the narrowness is the ruling.
    Ruling 5's reasoning — "a wrong join loses a note outright, a missed join
    only makes a double, and healing is the net" — is SOUND for an ordinary
    note and FALSE for a judged one, because for a hidden note a double is not
    a double, it is a leak (law 5, absolute). So only never_show / retired /
    trigger travel this leg. A blessed note renamed-and-edited is still a new
    unseen note, exactly as ruling 5 decided, and the test below pins that.

    The join is: a judged item whose file is GONE from disk, in the SAME
    parent directory, of the SAME kind. One orphan may be claimed once, so a
    single deleted hidden note can hold back at most one new note — never a
    directory that silently swallows everything added to it afterwards."""

    def _judged_note(self, tmp, state=None, trigger=False):
        src = Path(tmp) / "source"
        lib = Path(tmp) / "library"
        src.mkdir()
        (src / "complaint.md").write_bytes(b"the words she hid\n")
        study_lib.import_folder(src, lib)
        store = study_lib.load_store(lib)
        (item,) = store["items"].values()
        if state:
            item["state"] = state
        item["trigger"] = trigger
        study_lib.save_store(lib, store)
        return src, lib

    def _rename_and_edit(self, src):
        (src / "complaint.md").rename(src / "complaint-2026.md")
        (src / "complaint-2026.md").write_bytes(b"the words she hid, edited\n")

    def test_a_renamed_and_edited_never_show_note_does_not_come_back_unseen(self):
        # THE P0. Law 5 calls a never-list leak absolute.
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._judged_note(tmp, state="never_show")
            self._rename_and_edit(src)
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            born = [i for i in store["items"].values()
                    if i["title"] == "complaint-2026.md"]
            self.assertEqual(len(born), 1, "the renamed file did arrive")
            self.assertEqual(
                born[0]["state"], "never_show",
                "a note she said never to show her must not return as a "
                "fresh unseen card because she renamed and edited it")
            self.assertNotIn(
                "unseen", [born[0]["state"]],
                "belt and braces: the mint's default state must not survive")

    def test_a_renamed_and_edited_retired_note_stays_retired(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._judged_note(tmp, state="retired")
            self._rename_and_edit(src)
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            born = [i for i in store["items"].values()
                    if i["title"] == "complaint-2026.md"][0]
            self.assertEqual(born["state"], "retired")

    def test_a_hand_set_hiding_now_survives_a_rename_and_edit(self):
        # ⚠ THE DIRECT REVERSAL of TestRenameGapAccepted
        # .test_a_rename_costs_a_hand_set_hiding, which asserted False here
        # and said in its own message that a green True means the ruling needs
        # re-asking. It was re-asked on 2026-08-19 and she closed the gap.
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._judged_note(tmp, trigger=True)
            self._rename_and_edit(src)
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            born = [i for i in store["items"].values()
                    if i["title"] == "complaint-2026.md"][0]
            self.assertTrue(born["trigger"],
                            "the hand-set fence travels the rename now")

    def test_the_report_counts_the_rescue_out_loud(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._judged_note(tmp, state="never_show")
            self._rename_and_edit(src)
            report = study_lib.import_folder(src, lib)
            self.assertEqual(report["inherited"], 1,
                             "a rescue is never silent")

    # ---- the narrowness, pinned from three directions --------------------

    def test_a_blessed_note_is_still_a_new_note_ruling_5_stands(self):
        # ⛔ MUST STAY RED-ABLE. If this ever goes green as 'blessed', the
        # closure widened past what she ruled and #58 ruling 5 was overturned
        # a second time WITHOUT being asked.
        #
        # ⚠⚠ THE STATE ASSERTION ALONE WAS NOT ENOUGH, AND A MUTATION DRILL
        # IS WHAT PROVED IT (2026-08-19). Widening the ORPHAN INDEX to include
        # blessed items left this test GREEN, because the values guard inside
        # _inherit_judgment stopped the state from moving — so the index could
        # silently grow past her ruling with the whole suite green. That is
        # this project's recurring defect class (a check that pins the wrong
        # thing) caught for once by driving a mutant rather than by reading.
        # The two assertions below close it: a blessed orphan must not be
        # CLAIMED AT ALL, and claiming is observable in the report and in the
        # history line even when the state does not move.
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._judged_note(tmp, state="blessed")
            self._rename_and_edit(src)
            report = study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            born = [i for i in store["items"].values()
                    if i["title"] == "complaint-2026.md"][0]
            self.assertEqual(born["state"], "unseen",
                             "ruling 5 still governs an unjudged note")
            self.assertEqual(report["inherited"], 0,
                             "a blessed note is not a judged note and must "
                             "never be CLAIMED by the orphan leg")
            self.assertEqual(born["history"][0]["via"], "import",
                             "nothing was inherited, so the history must not "
                             "say it was")

    def test_a_hidden_note_whose_file_still_exists_claims_nothing(self):
        # The orphan condition is REAL absence, not merely a name that moved.
        # Two notes side by side must never be joined.
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._judged_note(tmp, state="never_show")
            (src / "a different note.md").write_bytes(b"a genuinely new note\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            born = [i for i in store["items"].values()
                    if i["title"] == "a different note.md"][0]
            self.assertEqual(born["state"], "unseen",
                             "the hidden note's own file is still on disk, so "
                             "nothing vanished and nothing may be claimed")

    def test_one_orphan_holds_back_at_most_one_note(self):
        # ⛔ THE ANTI-SWALLOW CASE. A folder that once held a hidden note must
        # not hide everything she ever puts in it afterwards.
        with tempfile.TemporaryDirectory() as tmp:
            src, lib = self._judged_note(tmp, state="never_show")
            (src / "complaint.md").unlink()
            (src / "new one.md").write_bytes(b"first new note\n")
            (src / "new two.md").write_bytes(b"second new note\n")
            (src / "new three.md").write_bytes(b"third new note\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            states = sorted(i["state"] for i in store["items"].values()
                            if i["title"].startswith("new "))
            self.assertEqual(
                states, ["never_show", "unseen", "unseen"],
                "exactly one new note may be held back by one orphan; the "
                "rest arrive normally")

    def test_a_hidden_note_in_another_folder_claims_nothing(self):
        # The join is SAME-DIRECTORY. A vanished hidden note in folder A must
        # never hold back a new note in folder B.
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "source"
            lib = Path(tmp) / "library"
            (src / "a").mkdir(parents=True)
            (src / "b").mkdir()
            (src / "a" / "complaint.md").write_bytes(b"hidden words\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            (item,) = store["items"].values()
            item["state"] = "never_show"
            study_lib.save_store(lib, store)
            (src / "a" / "complaint.md").unlink()
            (src / "b" / "unrelated.md").write_bytes(b"a note in another folder\n")
            study_lib.import_folder(src, lib)
            store = study_lib.load_store(lib)
            born = [i for i in store["items"].values()
                    if i["title"] == "unrelated.md"][0]
            self.assertEqual(born["state"], "unseen",
                             "a vanished hidden note fences its own folder "
                             "only")
