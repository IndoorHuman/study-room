#!/usr/bin/env python3
"""UPD-10 / map #146 — public front-page update section structure slots.

Pins REQUIRED CONTENT SLOTS with owner sitting copy (D-07 / D-10 / plan 06).

Run: `python3 tests/test_update_page_slots.py`
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

SLOT_MARKERS = (
    "OWNER_COPY_UPDATE_CONSENT_CLAUSE",
    "OWNER_COPY_UPDATE_NEWEST_DATE",
    "OWNER_COPY_UPDATE_WHATS_NEW",
    "OWNER_COPY_UPDATE_DOWNLOAD",
    "OWNER_COPY_UPDATE_STEPS",
    "OWNER_COPY_UPDATE_REPLACE_WARNING",
    "OWNER_COPY_UPDATE_GOING_BACK",
)

# 26.9997-06 (D-18): the consent clause slot. The value below is HERS,
# adopted verbatim at the 2026-08-30 sitting; pinned here and in README.md
# together. It must never contain the two gated substrings
# ("check for updates", "auto-update").
OWNER_COPY_UPDATE_CONSENT_CLAUSE = (
    "If you say yes to the room's one question, the room asks GitHub once a day\n"
    "whether a newer version exists. That request carries nothing of yours. You can\n"
    "change your answer any time on the Manage screen. If you say no, or never\n"
    "answer, the room makes no request at all, and the steps below still work.")
OWNER_COPY_UPDATE_NEWEST_DATE = ""
OWNER_COPY_UPDATE_WHATS_NEW = ""
OWNER_COPY_UPDATE_DOWNLOAD = (
    "Download the latest release from GitHub and unzip it.")
# Re-pinned 26.9997-05 to the README's reworded steps (26.9996-09 terminal
# UX), which the old three-line pin had drifted from (deferred item D-02-C).
OWNER_COPY_UPDATE_STEPS = (
    "1. Quit the Study Room (`Ctrl+C` in the terminal running "
    "`python3 server.py`).\n"
    "2. Replace the app folder (not your library folder):\n"
    "\n"
    "   ```bash\n"
    "   python3 tools/update_room.py --source ~/Downloads/study-room "
    "--dest ~/study-room\n"
    "   ```\n"
    "\n"
    "3. Start again: `python3 server.py`")
OWNER_COPY_UPDATE_REPLACE_WARNING = (
    "Only replace the app folder. Do not delete or move your library folder.")
# Re-pinned 26.9997-05 to the README's backup-folder wording (D-02-C).
OWNER_COPY_UPDATE_GOING_BACK = (
    "If something goes wrong, quit and open your backup folder\n"
    "(`study-room.update-backup-…`) or the previous app folder. Your library is\n"
    "still where you left it.")

UPDATE_SECTION_BEGIN = "<!-- BEGIN UPDATE SECTION -->"
UPDATE_SECTION_END = "<!-- END UPDATE SECTION -->"


class UpdatePageSlotsContract(unittest.TestCase):
    """UPD-10: structure slots present; owner copy pinned; no updater talk."""

    def test_owner_copy_slots_pin_sitting(self):
        self.assertEqual(OWNER_COPY_UPDATE_NEWEST_DATE, "")
        self.assertEqual(OWNER_COPY_UPDATE_WHATS_NEW, "")
        for name in (
                "OWNER_COPY_UPDATE_CONSENT_CLAUSE",
                "OWNER_COPY_UPDATE_DOWNLOAD",
                "OWNER_COPY_UPDATE_STEPS",
                "OWNER_COPY_UPDATE_REPLACE_WARNING",
                "OWNER_COPY_UPDATE_GOING_BACK"):
            self.assertTrue(globals()[name], name + " must carry owner copy")
        # A stand-in clause carrying either gated substring would trip the
        # README gate below by construction; refuse it at the pin too.
        lowered_clause = OWNER_COPY_UPDATE_CONSENT_CLAUSE.lower()
        self.assertNotIn("check for updates", lowered_clause)
        self.assertNotIn("auto-update", lowered_clause)

    def test_readme_carries_all_slot_markers(self):
        readme = REPO_ROOT / "README.md"
        self.assertTrue(readme.is_file())
        text = readme.read_text(encoding="utf-8")
        lowered = text.lower()
        if "check for updates" in lowered or "auto-update" in lowered:
            self.fail("front page must not invite an in-app updater")
        for marker in SLOT_MARKERS:
            self.assertIn(
                marker, text,
                "README update section must pin marker %r (map #146 / UPD-10)"
                % marker)
        self.assertIn(UPDATE_SECTION_BEGIN, text)
        self.assertIn(UPDATE_SECTION_END, text)
        for slot in (
                OWNER_COPY_UPDATE_CONSENT_CLAUSE,
                OWNER_COPY_UPDATE_DOWNLOAD,
                OWNER_COPY_UPDATE_STEPS,
                OWNER_COPY_UPDATE_REPLACE_WARNING,
                OWNER_COPY_UPDATE_GOING_BACK):
            self.assertIn(slot, text, "README must carry owner copy for slot")

    def test_readme_must_not_warn_empty_room(self):
        readme = REPO_ROOT / "README.md"
        text = readme.read_text(encoding="utf-8").lower()
        for forbidden in ("empty room", "re-choose", "choose your folder again"):
            self.assertNotIn(
                forbidden, text,
                "README must not warn about empty room / re-choose folder")

    def test_release_public_syncs_update_section(self):
        release_cli = REPO_ROOT / "tools" / "release_public.py"
        self.assertTrue(release_cli.is_file())
        src = release_cli.read_text(encoding="utf-8")
        self.assertIn("sync_update_section", src)
        self.assertIn("OWNER_COPY_UPDATE_NEWEST_DATE", src)
        self.assertIn("OWNER_COPY_UPDATE_WHATS_NEW", src)


if __name__ == "__main__":
    unittest.main()
