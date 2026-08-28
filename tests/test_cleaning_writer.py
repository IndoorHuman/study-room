#!/usr/bin/env python3
"""
tests/test_cleaning_writer.py — the tier-1 cleaning writer's held-out
invariants (Phase 26.85, Plan 01, Wave 0).

RED-FIRST BY DESIGN. Nothing in study_lib satisfies this suite yet; it
fails on the missing symbols below and that failure IS the Wave 0
deliverable. Do NOT stub, shim, or soften anything to make it pass —
Wave 2 (26.85-02) builds the writer against this contract.

WHY THIS SUITE EXISTS
The cleaning tier makes the app's FIRST in-place edit of a file that was
already living in the user's vault (D-03). The consent line it ships
under — "adds filing labels, never touches your words" — is only
literally true if a machine proves it, byte for byte, before any code
ships. Three of these invariants are irreversible-harm surfaces:

  * body byte-identity (D-02 / product law 4) — one changed byte of her
    prose is a P0 and a broken promise;
  * mtime-restore (D-10) — the house's resurfacing reads mtime, so a
    bumped stamp makes every cleaned note look freshly edited and
    poisons what surfaces;
  * id-membership (D-05) — a hallucinated or out-of-approved id must
    never be able to reach a file the user did not tick.

THE WAVE 2 CONTRACT (study_lib — exact names, exact shapes)

  apply_cleaning_frontmatter(origin_path, proposal, *, approved=None,
                             restore_mtime=True) -> dict | None
      Reconciles the note's frontmatter block in place. The BODY is
      sliced as raw bytes and re-concatenated verbatim — never decoded,
      never normalized (the append_comment discipline, study_lib:1763).

      proposal: {"id": <item id>, "room": str, "tags": [str],
                 "type": str|None, "title": str|None, "unsure": bool}
      approved: the user-approved batch as {item_id: origin_path}. When
                it is not None the call is REFUSED unless
                proposal["id"] is a key AND the resolved origin_path is
                the resolved approved[id] path (D-05: id-membership and
                path-membership, "never trust the client").

      Returns None on ANY refusal (jail, non-.md, missing file, iCloud
      placeholder, unknown id, wrong path) and writes zero bytes.
      Returns a change-log record on a successful call:
        {"id": str|None, "origin_path": str,
         "old_fm": bytes,   # the pre-write block INCLUDING its fences
                            # (b"" when the file had no frontmatter)
         "new_fm": bytes,   # the post-write block, same convention
         "old_mtime": float,# the PRE-write st_mtime
         "changed": bool}   # False on an idempotent no-op — the caller
                            # appends a ledger entry only when True

  reconcile_frontmatter_updates(fm_bytes, proposal) -> dict
      Pure policy, no I/O. Reads the raw frontmatter block bytes and
      returns the update dict the emitter applies; a value of None means
      REMOVE that key. Folds `published` -> `date` and `created` ->
      `date_clipped` and removes both; fills a blank/absent `title`
      only; unions tags (existing order first); adds `room` and `type`;
      KEEPS `author`/`url` by simply never mentioning them. The
      idempotency guard drops any key whose serialized value already
      matches, so a re-run with identical labels returns {}.

  restore_frontmatter_block(origin_path, old_fm, old_mtime) -> bool
      One-tap undo (D-10). Replaces the current block with `old_fm`
      bytes (b"" removes the block entirely), leaves the body bytes
      untouched, restores mtime. True when it wrote; False when the file
      already matches (undo-of-undo is idempotent) or the jail refused.

FIXTURES ARE INLINE BYTES. Nothing here reads ~/mansfield-raw-holdout at
run time — the stale-frontmatter block below is embedded verbatim from
that holdout's note-copy.md (including the trailing space after
`title:`), so the suite is hermetic and the fixture can never drift out
from under it.

Stdlib only (unittest + tempfile) — the zero-dependency law.

Coverage (26.85-01 Task 1):
  1. body byte-identity  — LF, CRLF, no-trailing-newline, UTF-8-BOM,
                           multi-KB wall-of-text, and a file with NO
                           frontmatter at all: the bytes below the
                           frontmatter block are byte-identical before
                           and after (D-02, law 4).
  2. reconcile not stack — the 4-key stale block gains exactly ONE fence
                           pair; published/created fold into
                           date/date_clipped and are REMOVED; author and
                           url survive; tags populate; room + type
                           arrive; a blank title fills (D-02/D-03).
  3. mtime-restore       — os.stat().st_mtime is unchanged by an apply
                           (D-10).
  4. idempotency         — a second apply with identical labels is a
                           byte no-op and reports changed=False, so zero
                           new change-log entries are written (D-02).
  5. undo round-trip     — apply then restore returns the file to its
                           pre-apply bytes AND mtime; undo-of-undo is
                           refused/idempotent (D-10).
  6. id-membership       — a proposal whose id is not in the approved
                           batch touches no file (D-05).
  7. jail                — non-.md, a path outside the approved set, a
                           `..` traversal, a missing file, and an iCloud
                           placeholder are each refused with zero bytes
                           written.
"""
import base64
import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

# study_lib.py is a plain module at the repo root — the same shim the
# other python suites use, so the runner's cwd never matters.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import study_lib  # noqa: E402


# ---------------------------------------------------------------------------
# byte helpers
# ---------------------------------------------------------------------------

_BOM = b"\xef\xbb\xbf"


def _body_after_frontmatter(raw: bytes) -> bytes:
    """The bytes strictly BELOW the frontmatter block — the RESEARCH
    §Code Examples helper (ported from test_comment_syncback.py:95-114),
    extended for a leading UTF-8 BOM so a BOM-prefixed vault file is
    comparable too. Returns the whole input when there is no block."""
    data = raw[len(_BOM):] if raw.startswith(_BOM) else raw
    if data.startswith(b"---"):
        end = data.find(b"\n---", 3)
        if end != -1:
            nl = data.find(b"\n", end + 1)
            return data[nl + 1:] if nl != -1 else b""
    return data


def _fence_count(raw: bytes) -> int:
    """How many line-anchored `---` fence lines the WHOLE file carries.
    Exactly one frontmatter block == 2. A stacked second block (the
    Pitfall-3 failure) shows up here as 4 — the 'reconcile, never stack'
    assertion in plain bytes."""
    data = raw[len(_BOM):] if raw.startswith(_BOM) else raw
    return sum(1 for line in data.split(b"\n")
               if line.rstrip(b"\r") == b"---")


# ---------------------------------------------------------------------------
# inline byte fixtures — the seven variants, no on-disk fixture anywhere
# ---------------------------------------------------------------------------

# The holdout's stale-frontmatter block, verbatim (note the trailing space
# after `title:` — it is in the real file and must survive a byte compare).
STALE_FM = (
    b"---\n"
    b"title: \n"
    b"author: Katherine Mansfield\n"
    b"url: https://archive.org/details/lettersofkatheri0001jmid_j0g9\n"
    b"created: 2026-07-14\n"
    b"published: 2026-07-14\n"
    b"tags: []\n"
    b"---\n"
)

# A short public-domain excerpt of the letter the holdout carries — one
# dense paragraph, the real shape of an un-processed clip.
LETTER_BODY = (
    b"\nWrite me a letter when you feel inclined to \xe2\x80\x94 will you? "
    b"I am staying here for a while instead of at the rooms in London. "
    b"The nights are full of stars and little moons and big Zeppelins "
    b"\xe2\x80\x94 very exciting. But England feels far far away "
    b"\xe2\x80\x94 just a little island with a cloud resting on it.\n"
)

# A multi-KB wall of text: one unbroken paragraph, the 'wall' holdout
# shape. Tier-1 must add labels and leave every byte of this alone — it
# never reformats (law 4; body reformatting is tier-2/3).
WALL_SENTENCE = (
    b"She kept returning to the same small table by the window, and the "
    b"paragraph kept running on without a break the way a clipped post "
    b"runs on, one thought crowding the next until nothing can be "
    b"skimmed. ")
WALL_BODY = b"\n" + WALL_SENTENCE * 40 + b"\n"

PLAIN_FM = b"---\ntitle: A real title\ntags:\n  - letters\n---\n"

ITEM_ID = "a1b2c3d4e5f60718"

PROPOSAL = {
    "id": ITEM_ID,
    "room": "letters",
    "tags": ["letters", "mansfield"],
    "type": "note",
    "title": "Letter to Ottoline Morrell",
    "unsure": False,
}


def write_note(path: Path, raw: bytes, age_days: float = 30.0) -> float:
    """Write a fixture and back-date its mtime so an accidental bump is
    unmistakable. Returns the stamped mtime."""
    path.write_bytes(raw)
    stamp = time.time() - age_days * 86400.0
    os.utime(path, (stamp, stamp))
    return path.stat().st_mtime


def approved_for(path: Path, item_id: str = ITEM_ID) -> dict:
    """The user-approved batch the route would hand the writer: exactly
    one id bound to exactly one on-disk path."""
    return {item_id: str(path)}


# ---------------------------------------------------------------------------
# 1. body byte-identity across every fixture variant (D-02, law 4)
# ---------------------------------------------------------------------------

class TestBodyByteIdentity(unittest.TestCase):
    """Every byte below the frontmatter block survives an apply
    unchanged. This is the machine form of the consent line: "adds
    filing labels, never touches your words"."""

    def _apply(self, raw, name="note.md"):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / name
            write_note(note, raw)
            record = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            self.assertIsNotNone(
                record, "an approved, on-disk .md must accept the apply")
            after = note.read_bytes()
            self.assertEqual(_body_after_frontmatter(after),
                             _body_after_frontmatter(raw),
                             "every body byte must be identical (law 4)")
            self.assertNotEqual(after, raw,
                                "the frontmatter really was written — a "
                                "no-op here would make the body compare "
                                "vacuous")
            return after

    def test_lf_body(self):
        after = self._apply(PLAIN_FM + b"# Title\n\nbody line one.\n")
        self.assertIn(b"room: ", after, "the label landed")

    def test_crlf_body(self):
        # a Windows-exported note: \r\n must never fold to \n on the way
        # through the writer
        raw = (b"---\r\ntitle: A real title\r\ntags: []\r\n---\r\n"
               b"\r\n# Title\r\n\r\nbody line.\r\n")
        after = self._apply(raw)
        self.assertIn(b"\r\n\r\nbody line.\r\n", after,
                      "the CRLF body bytes ride through untouched")

    def test_no_trailing_newline_body(self):
        self._apply(PLAIN_FM + b"a note with no final newline")

    def test_utf8_bom_file(self):
        raw = _BOM + PLAIN_FM + b"\nbody after a BOM.\n"
        after = self._apply(raw)
        self.assertTrue(after.startswith(_BOM),
                        "the BOM stays exactly where the user's editor "
                        "put it — never re-encoded away")

    def test_wall_of_text_body(self):
        raw = STALE_FM + WALL_BODY
        self.assertGreater(len(WALL_BODY), 2048,
                           "sanity: the wall fixture really is multi-KB")
        after = self._apply(raw)
        self.assertIn(WALL_SENTENCE * 2, after,
                      "the wall is never re-wrapped or split — tier-1 "
                      "writes metadata only (law 4)")

    def test_no_frontmatter_at_all(self):
        raw = b"# Just a body\n\nno frontmatter here at all.\n"
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "bare.md"
            write_note(note, raw)
            record = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            self.assertIsNotNone(record)
            self.assertEqual(record["old_fm"], b"",
                             "no prior block => an empty old_fm in the "
                             "ledger record")
            after = note.read_bytes()
            self.assertEqual(_body_after_frontmatter(after), raw,
                             "the whole original file becomes the body, "
                             "byte for byte")
            self.assertEqual(_fence_count(after), 2,
                             "exactly one fence pair is created")

    def test_cjk_body_survives(self):
        raw = PLAIN_FM + "\n一页手记，记忆的盒子。\n".encode("utf-8")
        self._apply(raw)


# ---------------------------------------------------------------------------
# 2. reconcile, never stack — the stale-frontmatter case (D-02/D-03)
# ---------------------------------------------------------------------------

class TestStaleFrontmatterReconcile(unittest.TestCase):
    """The holdout's four stale-frontmatter files carry an empty title
    and the legacy Web-Clipper quartet (author/url/created/published)
    plus `tags: []`. The writer must REPAIR that block in place — the
    exact rule the real vault documented on 2026-06-21 — never prepend a
    second one."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.note = Path(self._tmp.name) / "note-copy.md"
        self.before_mtime = write_note(self.note, STALE_FM + LETTER_BODY)
        self.record = study_lib.apply_cleaning_frontmatter(
            str(self.note), PROPOSAL, approved=approved_for(self.note))
        self.after = self.note.read_bytes()

    def tearDown(self):
        self._tmp.cleanup()

    def test_apply_succeeded(self):
        self.assertIsNotNone(self.record)
        self.assertIs(self.record["changed"], True)

    def test_exactly_one_fence_pair(self):
        self.assertEqual(_fence_count(self.after), 2,
                         "reconciled in place — a stacked second block "
                         "would show four fence lines (Pitfall 3)")

    def test_published_folded_into_date_and_removed(self):
        self.assertIn(b"\ndate: 2026-07-14", self.after,
                      "published's value becomes the true `date`")
        self.assertNotIn(b"\npublished:", self.after,
                         "the legacy key is folded out, not left behind")

    def test_created_folded_into_date_clipped_and_removed(self):
        self.assertIn(b"\ndate_clipped: 2026-07-14", self.after,
                      "created's value becomes `date_clipped`")
        self.assertNotIn(b"\ncreated:", self.after,
                         "the legacy key is folded out, not left behind")

    def test_author_and_url_are_kept(self):
        self.assertIn(b"author: Katherine Mansfield", self.after,
                      "provenance survives — the writer only ever adds "
                      "and folds; it never prunes the user's own keys")
        self.assertIn(
            b"url: https://archive.org/details/"
            b"lettersofkatheri0001jmid_j0g9", self.after)

    def test_tags_populated_from_labels(self):
        self.assertNotIn(b"tags: []", self.after,
                         "the empty list is replaced by real labels")
        for tag in PROPOSAL["tags"]:
            self.assertIn(tag.encode("utf-8"), self.after)

    def test_room_and_type_added(self):
        self.assertIn(b"room: ", self.after, "room: seeds the house's "
                                             "room-mapping (D-08)")
        self.assertIn(b"type: ", self.after)

    def test_blank_title_filled(self):
        self.assertIn(PROPOSAL["title"].encode("utf-8"), self.after,
                      "an EMPTY title is filled from the proposal")

    def test_body_byte_identical(self):
        self.assertEqual(_body_after_frontmatter(self.after), LETTER_BODY,
                         "the letter's own words are untouched")

    def test_a_real_title_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "titled.md"
            write_note(note, PLAIN_FM + LETTER_BODY)
            study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            after = note.read_bytes()
            self.assertIn(b"title: A real title", after,
                          "a title the user already wrote is never "
                          "replaced by a machine guess")
            self.assertNotIn(PROPOSAL["title"].encode("utf-8"), after)


# ---------------------------------------------------------------------------
# 2b. the pure reconcile policy, tested directly
# ---------------------------------------------------------------------------

class TestReconcilePolicyIsPure(unittest.TestCase):
    """reconcile_frontmatter_updates is pure policy over the raw block
    bytes: no disk, no clock. A value of None in the returned dict means
    REMOVE the key."""

    def test_folds_legacy_dates_and_keeps_provenance(self):
        updates = study_lib.reconcile_frontmatter_updates(STALE_FM,
                                                          PROPOSAL)
        self.assertEqual(updates.get("date"), "2026-07-14")
        self.assertIsNone(updates.get("published", "MISSING"),
                          "published is removed (None), not rewritten")
        self.assertEqual(updates.get("date_clipped"), "2026-07-14")
        self.assertIsNone(updates.get("created", "MISSING"),
                          "created is removed (None), not rewritten")
        self.assertNotIn("author", updates,
                         "author is KEPT by never being mentioned")
        self.assertNotIn("url", updates,
                         "url is KEPT by never being mentioned")
        self.assertEqual(updates.get("room"), PROPOSAL["room"])
        self.assertEqual(updates.get("title"), PROPOSAL["title"])

    def test_tag_union_preserves_existing_order_first(self):
        fm = b"---\ntitle: t\ntags:\n  - letters\n  - 1915\n---\n"
        updates = study_lib.reconcile_frontmatter_updates(fm, PROPOSAL)
        self.assertEqual(updates.get("tags"),
                         ["letters", "1915", "mansfield"],
                         "the union is a dedup that keeps the user's own "
                         "order in front")

    def test_idempotency_guard_drops_already_matching_keys(self):
        # the block a first clean run would have left behind
        cleaned = (b"---\n"
                   b"title: Letter to Ottoline Morrell\n"
                   b"author: Katherine Mansfield\n"
                   b"url: https://archive.org/x\n"
                   b"date: 2026-07-14\n"
                   b"date_clipped: 2026-07-14\n"
                   b"tags:\n  - letters\n  - mansfield\n"
                   b"room: letters\n"
                   b"type: note\n"
                   b"---\n")
        self.assertEqual(
            study_lib.reconcile_frontmatter_updates(cleaned, PROPOSAL),
            {},
            "a re-run with identical labels proposes NOTHING — the "
            "byte-no-op guarantee starts here")

    def test_no_frontmatter_yields_the_full_label_set(self):
        updates = study_lib.reconcile_frontmatter_updates(b"", PROPOSAL)
        for key in ("title", "room", "tags", "type"):
            self.assertIn(key, updates)
        for key in ("published", "created"):
            self.assertNotIn(key, updates,
                             "nothing to fold => no removal keys")


# ---------------------------------------------------------------------------
# 3. mtime-restore (D-10) — the resurfacing-pollution guard
# ---------------------------------------------------------------------------

class TestMtimeRestore(unittest.TestCase):

    def test_mtime_unchanged_after_apply(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            before = write_note(note, STALE_FM + LETTER_BODY, age_days=90)
            record = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            self.assertIsNotNone(record)
            after = note.read_bytes()
            self.assertNotEqual(after, STALE_FM + LETTER_BODY,
                                "sanity: a write really happened")
            self.assertAlmostEqual(
                note.stat().st_mtime, before, places=3,
                msg="cleaning must NOT bump 'last edited' — the house's "
                    "resurfacing reads mtime, and a bump makes every "
                    "cleaned note look freshly written (D-10)")
            self.assertAlmostEqual(record["old_mtime"], before, places=3,
                                   msg="the ledger records the PRE-write "
                                       "mtime so undo can restore it")

    def test_restore_mtime_false_is_honoured(self):
        # the caller may opt out explicitly; the default is ON
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            before = write_note(note, STALE_FM + LETTER_BODY, age_days=90)
            study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note),
                restore_mtime=False)
            self.assertGreater(note.stat().st_mtime, before,
                               "with the flag off the write's own stamp "
                               "stands — proving the default did real work")


# ---------------------------------------------------------------------------
# 4. idempotency (D-02) — a second identical run is a byte no-op
# ---------------------------------------------------------------------------

class TestIdempotency(unittest.TestCase):

    def test_second_apply_is_a_byte_noop_with_no_log_entry(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            write_note(note, STALE_FM + LETTER_BODY)
            first = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            self.assertIs(first["changed"], True)
            once = note.read_bytes()
            mtime_once = note.stat().st_mtime

            second = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            self.assertIsNotNone(second,
                                 "a no-op is a success, not a refusal")
            self.assertIs(second["changed"], False,
                          "changed=False is what tells the caller to "
                          "append ZERO new change-log entries")
            self.assertEqual(note.read_bytes(), once,
                             "the second run changes not one byte")
            self.assertAlmostEqual(note.stat().st_mtime, mtime_once,
                                   places=3)
            self.assertEqual(second["old_fm"], second["new_fm"],
                             "nothing moved, so the record's before and "
                             "after blocks are the same bytes")

    def test_third_run_still_stable(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            write_note(note, STALE_FM + WALL_BODY)
            for _ in range(3):
                study_lib.apply_cleaning_frontmatter(
                    str(note), PROPOSAL, approved=approved_for(note))
            settled = note.read_bytes()
            study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            self.assertEqual(note.read_bytes(), settled)
            self.assertEqual(_fence_count(settled), 2,
                             "repeated runs never accumulate blocks")


# ---------------------------------------------------------------------------
# 5. undo round-trip (D-10)
# ---------------------------------------------------------------------------

class TestUndoRoundTrip(unittest.TestCase):

    def _round_trip(self, raw):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            before_mtime = write_note(note, raw, age_days=45)
            record = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            self.assertIsNotNone(record)
            self.assertNotEqual(note.read_bytes(), raw)

            ok = study_lib.restore_frontmatter_block(
                str(note), record["old_fm"], record["old_mtime"])
            self.assertIs(ok, True, "the undo wrote")
            self.assertEqual(note.read_bytes(), raw,
                             "one tap returns the file to its exact "
                             "pre-apply bytes (D-10)")
            self.assertAlmostEqual(note.stat().st_mtime, before_mtime,
                                   places=3,
                                   msg="undo restores mtime too")

            again = study_lib.restore_frontmatter_block(
                str(note), record["old_fm"], record["old_mtime"])
            self.assertIs(again, False,
                          "undo-of-undo is refused/idempotent — it never "
                          "writes a second time")
            self.assertEqual(note.read_bytes(), raw)

    def test_stale_block_round_trip(self):
        self._round_trip(STALE_FM + LETTER_BODY)

    def test_crlf_round_trip(self):
        self._round_trip(b"---\r\ntitle: t\r\ntags: []\r\n---\r\n"
                         b"\r\nbody.\r\n")

    def test_bom_round_trip(self):
        self._round_trip(_BOM + PLAIN_FM + b"\nbody after a BOM.\n")

    def test_no_frontmatter_round_trip_removes_the_block(self):
        # old_fm is b"" — undo must take the whole block back out, not
        # leave an empty pair of fences behind
        raw = b"# Just a body\n\nno frontmatter here at all.\n"
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "bare.md"
            write_note(note, raw)
            record = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            self.assertEqual(record["old_fm"], b"")
            study_lib.restore_frontmatter_block(
                str(note), record["old_fm"], record["old_mtime"])
            self.assertEqual(note.read_bytes(), raw)
            self.assertEqual(_fence_count(note.read_bytes()), 0)


# ---------------------------------------------------------------------------
# 6. id-membership (D-05) — a hallucinated id can never drive a write
# ---------------------------------------------------------------------------

class TestIdMembership(unittest.TestCase):
    """The model's output is untrusted DATA. An id the user never
    approved must not reach any file — the Pitfall-5 surface."""

    def test_unknown_id_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            raw = STALE_FM + LETTER_BODY
            before_mtime = write_note(note, raw)
            rogue = dict(PROPOSAL, id="f" * 16)
            out = study_lib.apply_cleaning_frontmatter(
                str(note), rogue, approved=approved_for(note))
            self.assertIsNone(out, "an out-of-batch id is refused")
            self.assertEqual(note.read_bytes(), raw,
                             "not one byte is written for an id the user "
                             "never ticked")
            self.assertAlmostEqual(note.stat().st_mtime, before_mtime,
                                   places=3)

    def test_empty_approved_set_refuses_everything(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            raw = STALE_FM + LETTER_BODY
            write_note(note, raw)
            self.assertIsNone(study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved={}))
            self.assertEqual(note.read_bytes(), raw,
                             "nothing approved => nothing written "
                             "(fail-closed)")

    def test_missing_id_on_the_proposal_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            raw = STALE_FM + LETTER_BODY
            write_note(note, raw)
            headless = {k: v for k, v in PROPOSAL.items() if k != "id"}
            self.assertIsNone(study_lib.apply_cleaning_frontmatter(
                str(note), headless, approved=approved_for(note)))
            self.assertEqual(note.read_bytes(), raw)


# ---------------------------------------------------------------------------
# 7. the per-file jail (D-03) — the append_comment discipline, per path
# ---------------------------------------------------------------------------

class TestJail(unittest.TestCase):
    """Copied in shape from test_comment_syncback.py's TestJail. The
    cleaning writer jails per approved origin_path (RESEARCH Open Q1): a
    folder-drop import has no stamped vault_root, so containment is the
    approved batch itself."""

    def test_non_md_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "note.txt"
            raw = b"not markdown\n"
            write_note(f, raw)
            self.assertIsNone(study_lib.apply_cleaning_frontmatter(
                str(f), PROPOSAL, approved=approved_for(f)),
                "a non-.md target is refused even when approved")
            self.assertEqual(f.read_bytes(), raw)

    def test_path_outside_the_approved_set_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            approved_note = Path(tmp) / "approved.md"
            other = Path(tmp) / "other.md"
            write_note(approved_note, PLAIN_FM + b"\nyes.\n")
            other_raw = PLAIN_FM + b"\nnever asked for.\n"
            write_note(other, other_raw)
            # the id was approved, but bound to a DIFFERENT path
            self.assertIsNone(study_lib.apply_cleaning_frontmatter(
                str(other), PROPOSAL,
                approved=approved_for(approved_note)),
                "the approved id may only ever write its own approved "
                "path — never a substituted one")
            self.assertEqual(other.read_bytes(), other_raw)

    def test_traversal_refused(self):
        with tempfile.TemporaryDirectory() as inside, \
                tempfile.TemporaryDirectory() as outside:
            approved_note = Path(inside) / "approved.md"
            write_note(approved_note, PLAIN_FM + b"\nyes.\n")
            escapee = Path(outside) / "escape.md"
            escape_raw = PLAIN_FM + b"\noutside.\n"
            write_note(escapee, escape_raw)
            traversal = str(Path(inside) / ".." /
                            Path(outside).name / "escape.md")
            self.assertIsNone(study_lib.apply_cleaning_frontmatter(
                traversal, PROPOSAL,
                approved=approved_for(approved_note)),
                "a `..` string that RESOLVES out of the approved path "
                "is refused")
            self.assertEqual(escapee.read_bytes(), escape_raw)

    def test_missing_file_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ghost = Path(tmp) / "not-here.md"
            self.assertIsNone(study_lib.apply_cleaning_frontmatter(
                str(ghost), PROPOSAL, approved=approved_for(ghost)))
            self.assertFalse(ghost.exists(),
                             "a refused apply never creates a file")

    def test_missing_args_refused(self):
        self.assertIsNone(study_lib.apply_cleaning_frontmatter(
            "", PROPOSAL, approved={ITEM_ID: ""}))
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            raw = PLAIN_FM + b"\nbody.\n"
            write_note(note, raw)
            self.assertIsNone(study_lib.apply_cleaning_frontmatter(
                str(note), None, approved=approved_for(note)))
            self.assertEqual(note.read_bytes(), raw)


class TestICloudPlaceholder(unittest.TestCase):
    """An un-downloaded iCloud file must never be touched — writing one
    would trigger a download and could clobber the real bytes."""

    def test_placeholder_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            raw = STALE_FM + LETTER_BODY
            write_note(note, raw)
            (Path(tmp) / ".note.md.icloud").write_bytes(b"")
            self.assertTrue(study_lib.is_icloud_placeholder(note),
                            "sanity: the sibling marker flags it")
            self.assertIsNone(study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note)))
            self.assertEqual(note.read_bytes(), raw,
                             "a placeholder's bytes are never touched")

    def test_undo_also_skips_a_placeholder(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            raw = STALE_FM + LETTER_BODY
            write_note(note, raw)
            record = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            self.assertIsNotNone(record)
            cleaned = note.read_bytes()
            (Path(tmp) / ".note.md.icloud").write_bytes(b"")
            self.assertIs(study_lib.restore_frontmatter_block(
                str(note), record["old_fm"], record["old_mtime"]), False,
                "undo obeys the same jail as the writer")
            self.assertEqual(note.read_bytes(), cleaned)


# ---------------------------------------------------------------------------
# GAP-1 (closed 2026-07-29; the BEHAVIOUR re-decided by the owner mid-UAT,
# 2026-07-30): the title is never drawn from a note's text
# ---------------------------------------------------------------------------
# The 26.85-06 copy-truth audit closed GAP-1 by covering a body-derived
# title — the one label in this tier that could be lifted out of the owner's
# own writing, and the sole reason the disclosure had to hedge. During the
# 26.85 UAT the owner changed the behaviour instead of the words:
#
#   "if there's no title, just grabbing the first 80 characters sounds too
#    off, maybe just giving a default title like note #1, journal #1"
#
# — and, offered the refinement, chose the note's own FILENAME first. So the
# rule this suite now pins, in order:
#
#   1. a title the owner already wrote is never touched (that half is
#      unchanged — TestAGuessNeverReplacesAWrittenTitle below);
#   2. otherwise the note's own filename, the `.md` dropped — the owner's
#      own label FOR the file, never a line out OF it;
#   3. otherwise a numbered default ("note #4821"), and only then.
#
# A note's text is never read for a title again. That is what makes the
# disclosure simple instead of apologetic: nothing from your writing is
# copied into the `---` block, full stop. The sentinel test is the
# load-bearing one — it proves a distinctive phrase sitting in a body cannot
# reach a title by ANY path.

class TestNoTitleIsEverDrawnFromABody(unittest.TestCase):
    """The promise the whole change exists to make — now kept by ABSENCE.

    ⚠ REWRITTEN 2026-08-17. Two cases here drove `derive_cleaning_titles`
    over planted sentinel bodies and asserted no word of a body reached a
    title. That function is deleted (#95, with the labelling pass it fed),
    so the promise no longer needs driving: there is no title derivation in
    the tree at all. What is left is the guard that MATTERS — that neither
    deriver comes back quietly — because the failure this class exists to
    prevent is a later caller re-enabling a body read, and that failure is
    reachable again the moment either name reappears.
    """

    def test_neither_title_deriving_function_exists(self):
        for gone in ("derive_note_title", "derive_cleaning_titles"):
            with self.subTest(name=gone):
                self.assertFalse(
                    hasattr(study_lib, gone),
                    gone + " is a callable again — it read note bodies to "
                    "choose a title, and a later caller can quietly "
                    "re-enable it")


# ⛔ THREE CLASSES WERE DELETED HERE 2026-08-17 — the filename title, the
# numbered default, and derive_cleaning_titles. They tested the TITLE a label
# proposal carried, and #87 found a title could never be written at all (the
# label schema did not permit one, so the fill-a-blank-title rule was
# unreachable code); #95 ruled the labelling pass out and the deletion landed.
# ⚠ WHAT SURVIVES ABOVE AND BELOW IS THE WRITER, AND IT IS STILL TESTED: body
# byte-identity, the reconcile, the jail, the mtime, idempotency, undo, and
# "a guess never replaces a written title" all stand. The writer itself is
# kept deliberately — the DATE REPAIR lives inside its reconcile (#87/#88) —
# so its contract is still worth pinning even with no caller today.


class TestAGuessNeverReplacesAWrittenTitle(unittest.TestCase):
    """The other half of the disclosed sentence — enforced at the reconcile
    boundary, which is the only place a title reaches a file."""

    def test_existing_title_survives_a_different_guess(self):
        out = study_lib.reconcile_frontmatter_updates(
            PLAIN_FM, dict(PROPOSAL, title="a derived guess"))
        self.assertEqual(out.get("title", "A real title"), "A real title",
                         "a title the user wrote is never overwritten")

    def test_blank_title_is_the_only_one_filled(self):
        out = study_lib.reconcile_frontmatter_updates(
            STALE_FM, dict(PROPOSAL, title="a derived guess"))
        self.assertEqual(out["title"], "a derived guess",
                         "a BLANK title is the one case a guess may fill")

    def test_whitespace_only_title_counts_as_blank(self):
        fm = b"---\ntitle: \"   \"\ntags: []\n---\n"
        out = study_lib.reconcile_frontmatter_updates(
            fm, dict(PROPOSAL, title="a derived guess"))
        self.assertEqual(out["title"], "a derived guess")

    def test_end_to_end_on_disk_a_written_title_is_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            write_note(note, PLAIN_FM + LETTER_BODY)
            study_lib.apply_cleaning_frontmatter(
                str(note), dict(PROPOSAL, title="a derived guess"),
                approved=approved_for(note))
            raw = note.read_bytes()
            self.assertIn(b"title: A real title", raw)
            self.assertNotIn(b"a derived guess", raw)


# ---------------------------------------------------------------------------
# GAP-3 (closed 2026-07-29, owner-authorized): never moves, renames,
# creates or deletes a file
# ---------------------------------------------------------------------------
# LIBRARIAN.md: "it never moves a file and never renames one." That was only
# covered incidentally (other cases happen to read the same path back), so
# it gets its own explicit directory-level assertion. Scoped at the writer
# rather than the route because the writer is the ONLY component that ever
# touches a vault path — a route-level listing would test the same single
# call one layer further away.

class TestNeverMovesAFile(unittest.TestCase):

    @staticmethod
    def _listing(root: Path):
        """Every path under root, resolved — so a rename, a move into a
        subdirectory, a stray temp file left behind, or a deletion all show
        up as a difference."""
        return sorted(str(p.resolve()) for p in root.rglob("*"))

    def test_apply_leaves_the_directory_identical(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "sub").mkdir()
            note = root / "note.md"
            write_note(note, STALE_FM + LETTER_BODY)
            write_note(root / "sub" / "neighbour.md", PLAIN_FM + LETTER_BODY)
            before = self._listing(root)

            record = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            self.assertIsNotNone(record, "the write must have happened")
            self.assertTrue(record["changed"])

            self.assertEqual(
                self._listing(root), before,
                "no rename, no move, no new file, no deletion — and no "
                "atomic-write temp file left behind")

    def test_undo_leaves_the_directory_identical(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            note = root / "note.md"
            write_note(note, STALE_FM + LETTER_BODY)
            record = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            before = self._listing(root)

            self.assertIs(study_lib.restore_frontmatter_block(
                str(note), record["old_fm"], record["old_mtime"]), True)

            self.assertEqual(self._listing(root), before,
                             "undo restores bytes in place, it never moves")

    def test_a_refused_write_creates_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            note = root / "note.md"
            write_note(note, STALE_FM + LETTER_BODY)
            before = self._listing(root)

            # An id absent from the approved batch: refused.
            self.assertIsNone(study_lib.apply_cleaning_frontmatter(
                str(note), dict(PROPOSAL, id="ffffffffffffffff"),
                approved=approved_for(note)))
            # A path outside the approved batch: refused.
            self.assertIsNone(study_lib.apply_cleaning_frontmatter(
                str(root / "absent.md"), PROPOSAL,
                approved=approved_for(note)))

            self.assertEqual(self._listing(root), before,
                             "a refusal writes zero bytes AND creates no file")


# ---------------------------------------------------------------------------
# 9. the readability body writer (26.95-04; #88 / #89 / #90)
#
# ⚠ EVERYTHING ABOVE THIS LINE PROVES THE BODY WAS NOT TOUCHED. This section
# proves the one case where it IS — the owner ruled at #88 that the tidy-up
# may write sentence breaks into the file itself, and at #90 that it may write
# NOTHING ELSE. The guarantee changes shape rather than weakening: body
# byte-identity is a promise about code, checked once by this suite on
# whoever's machine ran it; the whitespace-only gate is checked against the
# person's own bytes at the moment of every write. These cases prove the gate
# refuses, which is the half that keeps a note safe.
# ---------------------------------------------------------------------------

# The same wall, laid out at its own full stops — what
# StudyCore.sentenceBreaksOnly returns. Whitespace differs; nothing else does.
WALL_LAID_OUT = b"\n" + (WALL_SENTENCE.rstrip() + b"\n\n") * 40


class TestReleasingOldCopies(unittest.TestCase):
    """26.95-23 — the room lets go of the copies from older runs.

    Taking a tidy-up back means restoring the note's previous body, so the
    room keeps a verbatim copy of every note it changes. On her real library
    that reached 16.8 MB, 99% of that file, her own writing kept forever. Her
    call: keep the recent runs, release the older copies."""

    def _log(self, tmp, runs):
        path = Path(tmp) / "cleaning-log.json"
        batches = []
        for started, n in runs:
            batches.append({
                "started_ms": started, "undone_ms": None,
                "files": [{"id": "i%d%d" % (started, k),
                           "origin_path": "/v/n%d.md" % k,
                           "old_fm_b64": "", "new_fm_b64": "",
                           "old_body_b64": base64.b64encode(
                               b"body " * 200).decode("ascii"),
                           "old_mtime": 1.0, "at": started}
                          for k in range(n)],
            })
        path.write_text(json.dumps({"batches": batches}), encoding="utf-8")
        return path

    def test_the_newest_runs_are_kept_and_older_copies_go(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._log(tmp, [(1, 5), (2, 4), (3, 3), (4, 2), (5, 1)])
            out = study_lib.release_cleaning_copies(path, keep=3)
            self.assertEqual(out["runs"], 2)
            self.assertEqual(out["notes"], 9)
            self.assertGreater(out["bytes"], 0)
            data = json.loads(path.read_text())
            kept = [len(b["files"]) for b in data["batches"]]
            self.assertEqual(kept, [0, 0, 3, 2, 1],
                             "the three newest runs keep their copies")

    def test_the_drained_batch_stays_and_undoes_to_nothing(self):
        # ⚠ the batch record is not removed — an empty one is already skipped
        # by the default pick and already answers "nothing to put back" when
        # named, so nothing downstream learns a new shape.
        with tempfile.TemporaryDirectory() as tmp:
            path = self._log(tmp, [(1, 2), (2, 1)])
            study_lib.release_cleaning_copies(path, keep=1)
            data = json.loads(path.read_text())
            self.assertEqual([b["started_ms"] for b in data["batches"]],
                             [1, 2])
            chosen, entries = study_lib.undo_cleaning_batch(path, 1)
            self.assertEqual((chosen, entries), (1, []))
            newest, entries2 = study_lib.undo_cleaning_batch(path)
            self.assertEqual(newest, 2, "and the kept run is still the "
                                        "default way back")
            self.assertEqual(len(entries2), 1)

    def test_a_released_run_leaves_the_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._log(tmp, [(1, 2), (2, 1)])
            study_lib.release_cleaning_copies(path, keep=1)
            rows = study_lib.cleaning_runs(path)
            self.assertEqual([r["notes"] for r in rows], [1, 0],
                             "a drained run reads 0, so the surface can stop "
                             "offering a button that would restore nothing")

    def test_a_copy_is_DELETED_never_blanked(self):
        # ⚠⚠ THE TRAP THIS WHOLE FUNCTION IS WRITTEN AROUND, AND IT DESTROYS
        # A NOTE. undo_cleaning_batch tells a body record from a LABEL record
        # BY THE PRESENCE OF THE BODY. An emptied old_body_b64 is falsy, so a
        # blanked record reads as a label record — whose old_fm of b"" means
        # "this note had no frontmatter block, remove the one it has now".
        # Blanking would arm a frontmatter wipe across every released note.
        with tempfile.TemporaryDirectory() as tmp:
            path = self._log(tmp, [(1, 2), (2, 1)])
            study_lib.release_cleaning_copies(path, keep=1)
            data = json.loads(path.read_text())
            self.assertEqual(data["batches"][0]["files"], [],
                             "the RECORDS are gone, not their contents")
            for batch in data["batches"]:
                for entry in batch["files"]:
                    self.assertTrue(entry.get("old_body_b64"),
                                    "no surviving record may carry an empty "
                                    "body — that is the label-record shape")
            # and the released batch hands the undo route nothing to act on
            _c, entries = study_lib.undo_cleaning_batch(path, 1)
            self.assertEqual(entries, [])

    def test_nothing_to_release_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self._log(tmp, [(1, 2), (2, 1)])
            before = path.read_bytes()
            out = study_lib.release_cleaning_copies(path, keep=5)
            self.assertEqual(out, {"runs": 0, "notes": 0, "bytes": 0})
            self.assertEqual(path.read_bytes(), before,
                             "a no-op release does not rewrite the file")

    def test_an_unreadable_log_releases_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "cleaning-log.json"
            path.write_text("{not json", encoding="utf-8")
            self.assertEqual(study_lib.release_cleaning_copies(path),
                             {"runs": 0, "notes": 0, "bytes": 0})


class TestReadabilityBodyWriter(unittest.TestCase):

    def _note(self, tmp, raw=None):
        note = Path(tmp) / "note.md"
        mtime = write_note(note, PLAIN_FM + (WALL_BODY if raw is None else raw))
        return note, mtime

    def test_whitespace_only_change_is_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            note, mtime = self._note(tmp)
            rec = study_lib.apply_readability_body(
                str(note), WALL_LAID_OUT, approved=approved_for(note))
            self.assertIsNotNone(rec)
            self.assertTrue(rec["changed"])
            after = note.read_bytes()
            _bom, fm, body = study_lib._clean_split_fm_bytes(after)
            self.assertEqual(fm, PLAIN_FM,
                             "the frontmatter block rides through untouched — "
                             "a body write must never also rewrite a label")
            self.assertEqual(body.split(), WALL_BODY.split(),
                             "every non-whitespace byte survives, in order")
            self.assertNotEqual(body, WALL_BODY,
                                "sanity: it really did change the spacing")
            self.assertAlmostEqual(note.stat().st_mtime, mtime, places=3,
                                   msg="mtime restored (D-10) — a tidied note "
                                       "must not look freshly written")

    def test_a_deleted_character_writes_zero_bytes(self):
        # THE CASE THIS WHOLE SECTION EXISTS FOR. Measured on the owner's real
        # vault, two notes lost characters this way before the layout rule was
        # narrowed: an arrow deleted from a numbered line, and a 📌 replaced
        # by `##`. The layout rule was fixed — and this gate is what means a
        # future regression in it cannot reach her files anyway.
        with tempfile.TemporaryDirectory() as tmp:
            note, mtime = self._note(tmp)
            before = note.read_bytes()
            mangled = WALL_LAID_OUT.replace(b"window,", b"window", 1)
            self.assertIsNone(study_lib.apply_readability_body(
                str(note), mangled, approved=approved_for(note)),
                "a body missing one comma is REFUSED")
            self.assertEqual(note.read_bytes(), before,
                             "and the refusal wrote zero bytes")
            self.assertAlmostEqual(note.stat().st_mtime, mtime, places=3)

    def test_an_added_word_writes_zero_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            note, _ = self._note(tmp)
            before = note.read_bytes()
            for label, mangled in (
                ("a summary", WALL_LAID_OUT + b"\nIn short: she was tired.\n"),
                ("a heading", b"\n## The window\n" + WALL_LAID_OUT),
                ("a bullet", WALL_LAID_OUT.replace(b"She kept", b"- She kept")),
            ):
                self.assertIsNone(study_lib.apply_readability_body(
                    str(note), mangled, approved=approved_for(note)),
                    "%s is not whitespace, so it is REFUSED" % label)
                self.assertEqual(note.read_bytes(), before,
                                 "%s wrote zero bytes" % label)

    # -- the invariant itself, in every language ---------------------------
    #
    # ⚠ IT USED TO EXCLUDE A WHOLE LANGUAGE. The gate asked "the same chunks
    # in the same order", which means "the same words" only where words are
    # separated by spaces. Chinese does not do that, so a break inserted after
    # 。 SPLITS a chunk and the gate called it a change of words — measured on
    # the owner's real vault: 41,645 non-space characters identical on both
    # sides, refused. 52 of her notes could not be tidied at all, and they hold
    # her worst walls. A safety test a correct change cannot satisfy is not
    # protecting her, it is excluding her writing.

    def test_a_new_gap_in_a_language_without_spaces_is_allowed(self):
        han = "他人。我最近读了一本书。".encode("utf-8")
        broken = "他人。\n我最近读了一本书。".encode("utf-8")
        self.assertTrue(study_lib._readability_same_words(han, broken))
        with tempfile.TemporaryDirectory() as tmp:
            note, mtime = self._note(tmp, han)
            rec = study_lib.apply_readability_body(
                str(note), broken, approved=approved_for(note))
            self.assertIsNotNone(rec, "her Chinese notes are writable")
            _bom, _fm, body = study_lib._clean_split_fm_bytes(note.read_bytes())
            self.assertEqual(b"".join(body.split()), b"".join(han.split()),
                             "and not one character moved")

    def test_closing_a_gap_between_two_words_is_still_refused(self):
        # ⚠ THE WRONG SIMPLIFICATION, PINNED. "every non-whitespace byte
        # survives in order" alone would accept this: the letters are all
        # there, in order, and a space between two English words is gone. The
        # second half of the invariant — every gap that existed still exists —
        # is the only thing standing between her and that write.
        self.assertFalse(study_lib._readability_same_words(
            b"New York", b"NewYork"))
        self.assertFalse(study_lib._readability_same_words(
            b"a b c", b"a bc"), "one gap closed among several is still one")
        with tempfile.TemporaryDirectory() as tmp:
            note, _ = self._note(tmp, b"a walk through New York in May.\n")
            before = note.read_bytes()
            self.assertIsNone(study_lib.apply_readability_body(
                str(note), b"a walk through NewYork in May.\n",
                approved=approved_for(note)))
            self.assertEqual(note.read_bytes(), before,
                             "and the refusal wrote zero bytes")

    def test_the_invariant_in_one_table(self):
        allowed = (
            (b"Hello. World.", b"Hello.\nWorld.", "a space becomes a break"),
            (b"a b", b"a\n\nb", "a gap widens"),
            (b"abc", b"ab c", "a gap appears mid-chunk (the Chinese shape)"),
            (b"", b"", "nothing at all"),
            (b"   ", b"\n", "whitespace on both sides"),
        )
        refused = (
            (b"New York", b"NewYork", "a gap closes"),
            (b"one two", b"two one", "reordered"),
            (b"a -> b", b"a b", "a deleted arrow"),
            (b"a b", b"a b more", "a word added"),
            (b"a", b"", "everything deleted"),
        )
        for a, b, why in allowed:
            self.assertTrue(study_lib._readability_same_words(a, b), why)
        for a, b, why in refused:
            self.assertFalse(study_lib._readability_same_words(a, b), why)

    def test_the_caller_is_not_trusted(self):
        # The gate is derived from what is ON DISK, not from what the caller
        # says it did. A client that sends a wholly different body — however
        # confidently — cannot write it.
        with tempfile.TemporaryDirectory() as tmp:
            note, _ = self._note(tmp)
            before = note.read_bytes()
            self.assertIsNone(study_lib.apply_readability_body(
                str(note), b"\nSomething else entirely.\n",
                approved=approved_for(note)))
            self.assertEqual(note.read_bytes(), before)

    def test_idempotent_and_jailed(self):
        with tempfile.TemporaryDirectory() as tmp:
            note, _ = self._note(tmp)
            rec = study_lib.apply_readability_body(
                str(note), WALL_BODY, approved=approved_for(note))
            self.assertIsNotNone(rec)
            self.assertFalse(rec["changed"],
                             "an unchanged body writes nothing and says so")
            # outside the approved batch
            other = Path(tmp) / "other.md"
            write_note(other, PLAIN_FM + WALL_BODY)
            self.assertIsNone(study_lib.apply_readability_body(
                str(other), WALL_LAID_OUT, approved=approved_for(note)),
                "an unapproved path writes nothing")
            # not markdown
            txt = Path(tmp) / "note.txt"
            write_note(txt, PLAIN_FM + WALL_BODY)
            self.assertIsNone(study_lib.apply_readability_body(
                str(txt), WALL_LAID_OUT, approved={ITEM_ID: str(txt)}),
                "the .md jail holds for the body writer too")

    def test_undo_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            note, mtime = self._note(tmp)
            before = note.read_bytes()
            rec = study_lib.apply_readability_body(
                str(note), WALL_LAID_OUT, approved=approved_for(note))
            self.assertTrue(rec["changed"])
            self.assertNotEqual(note.read_bytes(), before)
            self.assertTrue(study_lib.restore_body_bytes(
                str(note), rec["old_body"], rec["old_mtime"]))
            self.assertEqual(note.read_bytes(), before,
                             "one tap back returns the note byte for byte — "
                             "#86 made this load-bearing, because approving a "
                             "whole run off three examples is only reasonable "
                             "if being wrong is cheap")
            self.assertAlmostEqual(note.stat().st_mtime, mtime, places=3)
            self.assertFalse(study_lib.restore_body_bytes(
                str(note), rec["old_body"], rec["old_mtime"]),
                "undo-of-undo is idempotent, not a re-write")

    def test_the_log_keeps_the_two_undo_kinds_apart(self):
        # ⚠ THE HAZARD THIS PINS. `old_fm == b""` tells
        # restore_frontmatter_block "this note had no block before — remove
        # the one it has now". A body entry stores no old_fm and so decodes to
        # b"" as well. Any undo path that falls through from a body restore to
        # a frontmatter restore therefore DELETES the note's whole frontmatter
        # block. The record shape must decide, exclusively.
        with tempfile.TemporaryDirectory() as tmp:
            note, _ = self._note(tmp)
            log = Path(tmp) / "cleaning-log.json"
            body_rec = study_lib.apply_readability_body(
                str(note), WALL_LAID_OUT, approved=approved_for(note))
            study_lib.merge_cleaning_log(log, 1000, [body_rec])
            _batch, entries = study_lib.undo_cleaning_batch(log, 1000)
            self.assertEqual(len(entries), 1)
            self.assertIsNotNone(entries[0]["old_body"],
                                 "a body write is recognisable as one")
            self.assertEqual(entries[0]["old_fm"], b"",
                             "and carries no frontmatter — which is exactly "
                             "the value that would erase the block if the "
                             "wrong restore ran")

            fm_rec = study_lib.apply_cleaning_frontmatter(
                str(note), PROPOSAL, approved=approved_for(note))
            study_lib.merge_cleaning_log(log, 2000, [fm_rec])
            _batch, entries = study_lib.undo_cleaning_batch(log, 2000)
            self.assertEqual(len(entries), 1)
            self.assertIsNone(entries[0]["old_body"],
                              "a label write carries no body, so the undo "
                              "route runs the frontmatter restore for it")

    def test_undo_refuses_when_the_note_moved_on(self):
        with tempfile.TemporaryDirectory() as tmp:
            note, _ = self._note(tmp)
            rec = study_lib.apply_readability_body(
                str(note), WALL_LAID_OUT, approved=approved_for(note))
            self.assertTrue(rec["changed"])
            # she edits the note in Obsidian afterwards
            edited = note.read_bytes() + b"\nA thought I had later.\n"
            note.write_bytes(edited)
            self.assertFalse(study_lib.restore_body_bytes(
                str(note), rec["old_body"], rec["old_mtime"]),
                "undo refuses rather than silently discarding what she wrote "
                "after the run")
            self.assertEqual(note.read_bytes(), edited)


# ---------------------------------------------------------------------------
# THE DATE REPAIR, RIDING THE READABILITY WRITE (#88's ruling, wired
# 2026-08-17 on the owner's instruction).
#
# ⚠ WHAT MADE THIS DANGEROUS ENOUGH TO EARN ITS OWN SECTION. Until now the
# two writers were DISJOINT — a note was either a label write or a body write
# — and the whole undo path leaned on that: the change log told them apart by
# whether an entry carried `old_body`. One note can now be both, in one write,
# and `old_fm == b""` MEANS "remove this note's whole frontmatter block". So a
# half-marker that is wrong in the permissive direction does not produce a
# wrong count; it produces a note with its frontmatter deleted and an undo
# that says it succeeded.
#
# ⛔ EVERY TEST BELOW WAS DRIVEN RED BEFORE IT WAS GREEN — by writing the
# fixture wrong, by removing the flag, and (for the legacy half) by asserting
# the new default instead of the old one. This project's recorded trap is a
# test that MIRRORS the code and so pins the defect as correct; the only cure
# is running the gate and reading what it prints.
# ---------------------------------------------------------------------------


class TestDateRepairIsPure(unittest.TestCase):
    """`date_repair_updates` / `date_repair_preview` — no model, no clock, no
    I/O, and no dependence on the retired label reconcile."""

    def test_it_folds_both_legacy_keys_and_removes_them(self):
        got = study_lib.date_repair_updates(STALE_FM)
        self.assertEqual(got, {"date": "2026-07-14", "published": None,
                               "date_clipped": "2026-07-14", "created": None},
                         "published -> date, created -> date_clipped, and "
                         "BOTH legacy keys removed (#87 ruling 2)")

    def test_it_touches_nothing_else_in_the_block(self):
        got = study_lib.date_repair_updates(STALE_FM)
        for forbidden in ("title", "tags", "room", "type", "author", "url"):
            self.assertNotIn(forbidden, got,
                             f"the date repair proposed {forbidden!r} — it "
                             f"moves dates and nothing else")

    def test_it_is_not_the_label_reconcile_with_an_empty_proposal(self):
        # ⛔ THE REGRESSION THIS EXISTS FOR, AND IT IS NOT HYPOTHETICAL. The
        # fold used to live inside `reconcile_frontmatter_updates`, which also
        # unions tags. Routing the repair through that function with an empty
        # proposal LOOKS equivalent — on most blocks it is, because the
        # idempotency guard drops a union that matches what is already there.
        #
        # ⚠ MEASURED 2026-08-17, ON TWO SHAPES WHERE IT IS NOT EQUIVALENT, and
        # both are ordinary things to have written in a vault. On each, the
        # label reconcile would edit her tags during what she approved as a
        # DATE repair — silently, and outside anything the preview showed her.
        #
        # ⚠ This test was added because a mutation drill caught nothing: the
        # first version of it asserted the right thing against a fixture too
        # tame to tell the two apart, which is this project's recorded trap
        # (a test that mirrors the code) arriving from a third direction.
        for label, fm, leaked in (
            ("a single string tag becomes a list",
             b"---\ntags: alpha\npublished: 2024-01-01\n---\n",
             ["alpha"]),
            ("two of the same tag are silently deduped",
             b"---\ntags: [a, a, b]\npublished: 2024-01-01\n---\n",
             ["a", "b"]),
        ):
            repair = study_lib.date_repair_updates(fm)
            self.assertEqual(repair, {"date": "2024-01-01", "published": None},
                             f"{label}: the repair must move the date and "
                             f"leave her tags exactly as she wrote them")
            self.assertEqual(
                study_lib.reconcile_frontmatter_updates(fm, {}).get("tags"),
                leaked,
                f"premise: {label} — the label reconcile really would rewrite "
                f"them, which is why this is a separate function and not a "
                f"call to that one with an empty proposal")

    def test_a_note_with_no_legacy_keys_yields_nothing(self):
        self.assertEqual(study_lib.date_repair_updates(PLAIN_FM), {})
        self.assertIsNone(study_lib.date_repair_preview(PLAIN_FM))

    def test_it_is_idempotent(self):
        before, after = study_lib.date_repair_preview(STALE_FM)
        self.assertNotEqual(before, after)
        self.assertEqual(study_lib.date_repair_updates(after.encode("utf-8")),
                         {}, "a note already repaired asks for nothing, so a "
                             "second run writes zero bytes")
        self.assertIsNone(
            study_lib.date_repair_preview(after.encode("utf-8")))

    def test_the_preview_is_what_would_actually_land(self):
        # The screen she approves and the bytes that reach her file must be
        # ONE decision (product law 9). This pins them equal by construction:
        # the preview's after-text is compared against a real write.
        before, after = study_lib.date_repair_preview(STALE_FM)
        self.assertEqual(before, STALE_FM.decode("utf-8"))
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            write_note(note, STALE_FM + LETTER_BODY)
            rec = study_lib.apply_readability_body(
                str(note), LETTER_BODY, approved=approved_for(note),
                repair_dates=True)
            self.assertIsNotNone(rec)
            _bom, fm, _body = study_lib._clean_split_fm_bytes(note.read_bytes())
            self.assertEqual(fm.decode("utf-8"), after,
                             "the preview promised bytes the write did not "
                             "produce — she approved a different change")

    def test_unusable_bytes_fail_soft(self):
        for bad in (None, b"", b"not a block at all\n", 17, object()):
            self.assertEqual(study_lib.date_repair_updates(bad), {})
            self.assertIsNone(study_lib.date_repair_preview(bad))


class TestDateRepairRidesTheBodyWrite(unittest.TestCase):

    def test_it_is_off_unless_asked_for(self):
        # ⛔ THE DEFAULT IS LOAD-BEARING: `apply_readability_body` has other
        # callers and four suites proving it leaves the block alone.
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            write_note(note, STALE_FM + WALL_BODY)
            rec = study_lib.apply_readability_body(
                str(note), WALL_LAID_OUT, approved=approved_for(note))
            self.assertTrue(rec["changed"])
            self.assertFalse(rec["fm_changed"])
            _bom, fm, _b = study_lib._clean_split_fm_bytes(note.read_bytes())
            self.assertEqual(fm, STALE_FM,
                             "without repair_dates the block is byte-identical")

    def test_both_halves_land_in_ONE_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            mtime = write_note(note, STALE_FM + WALL_BODY)
            rec = study_lib.apply_readability_body(
                str(note), WALL_LAID_OUT, approved=approved_for(note),
                repair_dates=True)
            self.assertTrue(rec["changed"])
            self.assertTrue(rec["body_changed"])
            self.assertTrue(rec["fm_changed"])
            _bom, fm, body = study_lib._clean_split_fm_bytes(note.read_bytes())
            self.assertNotIn(b"published:", fm)
            self.assertNotIn(b"created:", fm)
            self.assertIn(b"date: 2026-07-14", fm)
            self.assertIn(b"date_clipped: 2026-07-14", fm)
            self.assertIn(b"author: Katherine Mansfield", fm,
                          "provenance is kept by omission, as it always was")
            self.assertEqual(body.split(), WALL_BODY.split(),
                             "HER WRITING: every non-whitespace byte survives "
                             "in order, even while the block above it changed")
            self.assertAlmostEqual(note.stat().st_mtime, mtime, places=3)

    def test_a_note_that_only_needs_its_dates_keeps_its_body_byte_for_byte(self):
        # The case the wiring exists for: a note that reads perfectly well but
        # carries the wrong date. Before 2026-08-17 the client dropped it and
        # its repair never happened.
        calm = b"\na short note.\n\nit already reads well.\n"
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            write_note(note, STALE_FM + calm)
            rec = study_lib.apply_readability_body(
                str(note), calm, approved=approved_for(note),
                repair_dates=True)
            self.assertTrue(rec["changed"])
            self.assertFalse(rec["body_changed"], "its body did not move")
            self.assertTrue(rec["fm_changed"])
            _bom, _fm, body = study_lib._clean_split_fm_bytes(note.read_bytes())
            self.assertEqual(body, calm, "byte for byte, not merely word for "
                                         "word")

    def test_the_gate_still_refuses_a_mangled_body_and_writes_no_dates(self):
        # ⚠ THE REFUSAL MUST BE TOTAL. A run that refused the body but went
        # ahead with the dates would half-apply a change she never approved,
        # and the log would carry no body half to take back.
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            write_note(note, STALE_FM + WALL_BODY)
            before = note.read_bytes()
            mangled = WALL_LAID_OUT.replace(b"window,", b"window", 1)
            self.assertIsNone(study_lib.apply_readability_body(
                str(note), mangled, approved=approved_for(note),
                repair_dates=True))
            self.assertEqual(note.read_bytes(), before,
                             "zero bytes — including the dates it would "
                             "otherwise have been happy to fold")

    def test_the_jail_still_binds_the_date_half(self):
        with tempfile.TemporaryDirectory() as tmp:
            note = Path(tmp) / "note.md"
            write_note(note, STALE_FM + WALL_BODY)
            before = note.read_bytes()
            self.assertIsNone(study_lib.apply_readability_body(
                str(note), WALL_LAID_OUT, approved={}, repair_dates=True))
            self.assertEqual(note.read_bytes(), before)


class TestOneTapBackTakesBothHalves(unittest.TestCase):

    def _run_and_log(self, tmp, raw, proposed):
        note = Path(tmp) / "note.md"
        write_note(note, raw)
        original = note.read_bytes()
        log = Path(tmp) / "log.json"
        rec = study_lib.apply_readability_body(
            str(note), proposed, approved=approved_for(note),
            repair_dates=True)
        study_lib.merge_cleaning_log(log, 999, [rec])
        return note, original, log

    def _undo(self, log, note):
        _batch, entries = study_lib.undo_cleaning_batch(log, 999)
        did = False
        for entry in entries:
            if entry.get("old_body") is not None:
                did = study_lib.restore_body_bytes(
                    entry["origin_path"], entry["old_body"],
                    entry["old_mtime"]) or did
            if entry.get("fm_changed"):
                did = study_lib.restore_frontmatter_block(
                    entry["origin_path"], entry["old_fm"],
                    entry["old_mtime"]) or did
        return did, entries

    def test_a_note_with_both_changes_goes_all_the_way_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            note, original, log = self._run_and_log(
                tmp, STALE_FM + WALL_BODY, WALL_LAID_OUT)
            self.assertNotEqual(note.read_bytes(), original)
            did, entries = self._undo(log, note)
            self.assertTrue(did)
            self.assertTrue(entries[0]["fm_changed"])
            self.assertIsNotNone(entries[0]["old_body"])
            self.assertEqual(note.read_bytes(), original,
                             "byte-identical — 'you can take the whole run "
                             "back' has to mean the WHOLE note, not the half "
                             "the log happened to notice")

    def test_a_body_only_run_never_reaches_the_frontmatter_restore(self):
        # ⛔⛔ THE DESTROYED-NOTE GUARD. A body entry's `old_fm` decodes to
        # b"", and b"" tells restore_frontmatter_block to REMOVE the block. If
        # the undo consulted presence instead of the flag, this test's note
        # would come back with no frontmatter at all and the undo would report
        # success.
        with tempfile.TemporaryDirectory() as tmp:
            note, original, log = self._run_and_log(
                tmp, PLAIN_FM + WALL_BODY, WALL_LAID_OUT)
            _batch, entries = study_lib.undo_cleaning_batch(log, 999)
            self.assertFalse(entries[0]["fm_changed"],
                             "nothing moved up there, so nothing may be "
                             "restored up there")
            did, _ = self._undo(log, note)
            self.assertTrue(did)
            after = note.read_bytes()
            self.assertEqual(after, original)
            _bom, fm, _b = study_lib._clean_split_fm_bytes(after)
            self.assertEqual(fm, PLAIN_FM,
                             "her frontmatter block is still there — this is "
                             "the assertion that catches a deleted block")

    def test_a_dates_only_run_puts_the_block_back(self):
        calm = b"\na short note.\n\nit already reads well.\n"
        with tempfile.TemporaryDirectory() as tmp:
            note, original, log = self._run_and_log(
                tmp, STALE_FM + calm, calm)
            self.assertNotEqual(note.read_bytes(), original)
            did, entries = self._undo(log, note)
            self.assertTrue(did)
            self.assertTrue(entries[0]["fm_changed"])
            self.assertIsNone(entries[0]["old_body"],
                              "its body never moved, so the log carries no "
                              "body copy for it — that is the storage saving, "
                              "not an oversight")
            self.assertEqual(note.read_bytes(), original)


class TestLegacyLogEntriesKeepTheirOldMeaning(unittest.TestCase):
    """⚠ HER MACHINE ALREADY HAS A CHANGE LOG, written before `fm_changed`
    existed. An absent flag must reproduce the shipped exclusive behaviour
    exactly — `entry.get("fm_changed") is True` alone would silently strip the
    undo off every label batch she has ever made."""

    def _entry(self, **over):
        row = {"id": "x", "origin_path": "/nowhere/n.md", "old_fm_b64": "",
               "new_fm_b64": "", "old_body_b64": "", "old_mtime": None,
               "at": 1}
        row.update(over)
        return {"schema": 1, "batches": [{"started_ms": 7, "undone_ms": None,
                                          "files": [row]}]}

    def _read(self, tmp, doc):
        log = Path(tmp) / "log.json"
        log.write_text(json.dumps(doc), encoding="utf-8")
        _batch, entries = study_lib.undo_cleaning_batch(log, 7)
        return entries[0]

    def test_a_legacy_label_entry_still_restores_frontmatter(self):
        with tempfile.TemporaryDirectory() as tmp:
            entry = self._read(tmp, self._entry(
                old_fm_b64=study_lib._clean_log_b64(PLAIN_FM)))
            self.assertTrue(entry["fm_changed"],
                            "no flag + no body == a label entry, exactly as "
                            "the presence test used to decide")
            self.assertIsNone(entry["old_body"])

    def test_a_legacy_body_entry_still_leaves_frontmatter_alone(self):
        with tempfile.TemporaryDirectory() as tmp:
            entry = self._read(tmp, self._entry(
                old_body_b64=study_lib._clean_log_b64(b"\nold\n")))
            self.assertFalse(entry["fm_changed"])
            self.assertIsNotNone(entry["old_body"])

    def test_a_new_entry_is_believed_over_the_fallback(self):
        with tempfile.TemporaryDirectory() as tmp:
            entry = self._read(tmp, self._entry(
                old_body_b64=study_lib._clean_log_b64(b"\nold\n"),
                old_fm_b64=study_lib._clean_log_b64(PLAIN_FM),
                fm_changed=True))
            self.assertTrue(entry["fm_changed"],
                            "both halves moved, and the fallback would have "
                            "guessed False")


class TestTwoRecordsForOneNoteKeepBothHalves(unittest.TestCase):
    """The change log keeps ONE undo target per file. When a run somehow
    writes a note twice, the merged entry must keep the FIRST captured copy of
    EACH half — the old code took both from the earlier entry, which dropped
    whichever half the earlier one did not have."""

    def test_a_body_record_then_a_label_record_keeps_both(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "log.json"
            path = str(Path(tmp) / "n.md")
            study_lib.merge_cleaning_log(log, 5, [{
                "id": "x", "origin_path": path, "old_body": b"\nfirst body\n",
                "old_fm": b"", "old_mtime": 1.0,
                "body_changed": True, "fm_changed": False, "changed": True}])
            study_lib.merge_cleaning_log(log, 5, [{
                "id": "x", "origin_path": path, "old_body": b"\nsecond\n",
                "old_fm": PLAIN_FM, "old_mtime": 2.0,
                "body_changed": False, "fm_changed": True, "changed": True}])
            _b, entries = study_lib.undo_cleaning_batch(log, 5)
            self.assertEqual(len(entries), 1, "one undo target per file")
            self.assertEqual(entries[0]["old_body"], b"\nfirst body\n",
                             "the FIRST body — the state the file returns to")
            self.assertTrue(entries[0]["fm_changed"])
            self.assertEqual(entries[0]["old_fm"], PLAIN_FM,
                             "and the frontmatter half is not dropped just "
                             "because the earlier record had none")
            self.assertEqual(entries[0]["old_mtime"], 1.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
