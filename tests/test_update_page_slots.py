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
    "OWNER_COPY_UPDATE_NEWEST_DATE",
    "OWNER_COPY_UPDATE_WHATS_NEW",
    "OWNER_COPY_UPDATE_DOWNLOAD",
    "OWNER_COPY_UPDATE_STEPS",
    "OWNER_COPY_UPDATE_REPLACE_WARNING",
    "OWNER_COPY_UPDATE_GOING_BACK",
)

OWNER_COPY_UPDATE_NEWEST_DATE = ""
OWNER_COPY_UPDATE_WHATS_NEW = ""
OWNER_COPY_UPDATE_DOWNLOAD = (
    "Download the latest release from GitHub and unzip it.")
OWNER_COPY_UPDATE_STEPS = (
    "1. Quit the Study Room.\n"
    "2. Replace the old app folder with the new one.\n"
    "3. Open the Study Room again. Your library folder is unchanged.")
OWNER_COPY_UPDATE_REPLACE_WARNING = (
    "Only replace the app folder. Do not delete or move your library folder.")
OWNER_COPY_UPDATE_GOING_BACK = (
    "If something goes wrong, quit and open the previous app folder again. "
    "Your library is still where you left it.")

UPDATE_SECTION_BEGIN = "<!-- BEGIN UPDATE SECTION -->"
UPDATE_SECTION_END = "<!-- END UPDATE SECTION -->"


class UpdatePageSlotsContract(unittest.TestCase):
    """UPD-10: structure slots present; owner copy pinned; no updater talk."""

    def test_owner_copy_slots_pin_sitting(self):
        self.assertEqual(OWNER_COPY_UPDATE_NEWEST_DATE, "")
        self.assertEqual(OWNER_COPY_UPDATE_WHATS_NEW, "")
        for name in (
                "OWNER_COPY_UPDATE_DOWNLOAD",
                "OWNER_COPY_UPDATE_STEPS",
                "OWNER_COPY_UPDATE_REPLACE_WARNING",
                "OWNER_COPY_UPDATE_GOING_BACK"):
            self.assertTrue(globals()[name], name + " must carry owner copy")

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
