#!/usr/bin/env python3
"""UPD-07 / UPD-08 / map #145 — one release ritual CLI stops on failures.

Wave 0 Nyquist scaffold (26.9996-01). Product CLI: tools/release_public.py
(D-06). Stops loud on:
  - missing WHATS_NEW.md note
  - failed stage_public
  - failed compat bank check

Stamp+note are RELEASE_ARTIFACT_REQUIRED on the post-injection staged tree
only — never added to stage_public.REQUIRED (UPD-07).

⛔ No live key. No push. No touch of her library.

Run: `python3 tests/test_release_public.py`
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))
sys.path.insert(0, str(REPO_ROOT / "tools"))

RELEASE_CLI = REPO_ROOT / "tools" / "release_public.py"
WHATS_NEW_NAME = "WHATS_NEW.md"
RELEASE_DATE_NAME = "RELEASE_DATE"
LATEST_RELEASE_DATE_NAME = "LATEST_RELEASE_DATE"
OWNER_COPY_WHATS_NEW = (
    "Updates replace the app folder only. Your library stays in its own "
    "folder, outside the app.")


class ReleasePublicContract(unittest.TestCase):
    """UPD-08: release stops on missing note / failed stage / failed compat."""

    def test_release_cli_exists(self):
        if not RELEASE_CLI.is_file():
            self.fail(
                "NOT_YET: tools/release_public.py — one ritual CLI that "
                "stops on missing note / failed stage / failed compat "
                "(map #145 / D-06 / UPD-08)")

    def test_release_cli_documents_stop_conditions(self):
        if not RELEASE_CLI.is_file():
            self.fail("NOT_YET: tools/release_public.py")
        src = RELEASE_CLI.read_text(encoding="utf-8")
        for needle in (WHATS_NEW_NAME, "stage_public", "compat"):
            self.assertIn(
                needle, src,
                "release_public.py must name stop condition involving %r"
                % needle)

    def test_stamp_not_in_stage_public_required(self):
        stage = REPO_ROOT / "tools" / "stage_public.py"
        self.assertTrue(stage.is_file())
        src = stage.read_text(encoding="utf-8")
        required_block = re.search(
            r"REQUIRED\s*=\s*\[(.*?)\]", src, re.DOTALL)
        self.assertIsNotNone(required_block, "REQUIRED list not found")
        block = required_block.group(1)
        self.assertNotIn(RELEASE_DATE_NAME, block,
                         "RELEASE_DATE must not join stage_public.REQUIRED")
        self.assertNotIn(LATEST_RELEASE_DATE_NAME, block,
                         "LATEST_RELEASE_DATE must not join stage_public.REQUIRED")
        self.assertNotIn(WHATS_NEW_NAME, block,
                         "WHATS_NEW.md must not join stage_public.REQUIRED")
        self.assertEqual(
            OWNER_COPY_WHATS_NEW,
            "Updates replace the app folder only. Your library stays in its "
            "own folder, outside the app.")
        whats_new = REPO_ROOT / WHATS_NEW_NAME
        self.assertTrue(whats_new.is_file(), "WHATS_NEW.md must exist after sitting")
        self.assertIn(OWNER_COPY_WHATS_NEW.strip(), whats_new.read_text(encoding="utf-8"))

    def test_no_compat_skip_flag_in_source(self):
        if not RELEASE_CLI.is_file():
            self.fail("NOT_YET: tools/release_public.py")
        src = RELEASE_CLI.read_text(encoding="utf-8")
        self.assertIsNone(
            re.search(
                r"add_argument.*(force|skip).*compat|compat.*skip",
                src, re.I),
            "release_public must not offer a compat skip flag (D-05)")

    def test_release_artifact_constants_in_cli(self):
        if not RELEASE_CLI.is_file():
            self.fail("NOT_YET: tools/release_public.py")
        src = RELEASE_CLI.read_text(encoding="utf-8")
        for needle in (
                "RELEASE_ARTIFACT", RELEASE_DATE_NAME,
                LATEST_RELEASE_DATE_NAME, WHATS_NEW_NAME):
            self.assertIn(needle, src,
                          "post-injection gate must reference %r" % needle)


class ReleaseArtifactGate(unittest.TestCase):
    """UPD-07: stamp+note enforced on post-injection staged tree only."""

    def setUp(self):
        if not RELEASE_CLI.is_file():
            self.skipTest("NOT_YET: tools/release_public.py")
        import release_public  # noqa: E402
        self.rp = release_public

    def test_missing_both_release_artifacts(self):
        with tempfile.TemporaryDirectory() as td:
            missing = self.rp.missing_release_artifacts(Path(td))
            self.assertEqual(len(missing), 3)
            joined = "\n".join(missing)
            self.assertIn(RELEASE_DATE_NAME, joined)
            self.assertIn(LATEST_RELEASE_DATE_NAME, joined)
            self.assertIn(WHATS_NEW_NAME, joined)

    def test_present_both_release_artifacts(self):
        with tempfile.TemporaryDirectory() as td:
            stage = Path(td)
            (stage / RELEASE_DATE_NAME).write_text("2026-08-27\n",
                                                   encoding="utf-8")
            (stage / LATEST_RELEASE_DATE_NAME).write_text("2026-08-27\n",
                                                          encoding="utf-8")
            (stage / WHATS_NEW_NAME).write_text("fixture note\n",
                                                encoding="utf-8")
            self.assertEqual(self.rp.missing_release_artifacts(stage), [])


class WhatsNewRefusal(unittest.TestCase):
    """UPD-08: refuse missing or empty note — never draft."""

    def setUp(self):
        if not RELEASE_CLI.is_file():
            self.skipTest("NOT_YET: tools/release_public.py")
        import release_public  # noqa: E402
        self.rp = release_public

    def test_refuses_missing_note(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            err = self.rp.whats_new_refusal(repo)
            self.assertIsNotNone(err)

    def test_refuses_empty_note(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            (repo / WHATS_NEW_NAME).write_text("", encoding="utf-8")
            self.assertIsNotNone(self.rp.whats_new_refusal(repo))

    def test_refuses_whitespace_only_note(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            (repo / WHATS_NEW_NAME).write_text("   \n\t\n", encoding="utf-8")
            self.assertIsNotNone(self.rp.whats_new_refusal(repo))

    def test_accepts_non_empty_note(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            (repo / WHATS_NEW_NAME).write_text("owner note\n",
                                                encoding="utf-8")
            self.assertIsNone(self.rp.whats_new_refusal(repo))


class ReleasePublicIntegration(unittest.TestCase):
    """End-to-end ritual on tempfile note; stops before public repo."""

    def test_as_test_ritual_with_note_file(self):
        if not RELEASE_CLI.is_file():
            self.fail("NOT_YET: tools/release_public.py")
        note = tempfile.NamedTemporaryFile(
            mode="w", suffix=".md", delete=False, encoding="utf-8")
        try:
            note.write("suite fixture note for release gate\n")
            note.close()
            stage_parent = tempfile.mkdtemp(prefix="studyroom-release-stage-")
            try:
                result = subprocess.run(
                    [sys.executable, str(RELEASE_CLI),
                     "--as-test",
                     "--note-file", note.name,
                     "--out", stage_parent],
                    cwd=str(REPO_ROOT),
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                self.assertEqual(
                    result.returncode, 0,
                    "stdout:\n%s\nstderr:\n%s" % (
                        result.stdout, result.stderr))
                stage = Path(stage_parent)
                self.assertTrue((stage / RELEASE_DATE_NAME).is_file())
                self.assertTrue((stage / LATEST_RELEASE_DATE_NAME).is_file())
                self.assertTrue((stage / WHATS_NEW_NAME).is_file())
                release_stamp = (
                    stage / RELEASE_DATE_NAME).read_text(encoding="utf-8").strip()
                latest_stamp = (
                    stage / LATEST_RELEASE_DATE_NAME).read_text(
                        encoding="utf-8").strip()
                self.assertEqual(release_stamp, latest_stamp)
                self.assertIn("as-test", result.stdout.lower())
            finally:
                shutil.rmtree(stage_parent, ignore_errors=True)
        finally:
            os.unlink(note.name)

    def test_compat_failure_exits_nonzero(self):
        if not RELEASE_CLI.is_file():
            self.fail("NOT_YET: tools/release_public.py")
        note = tempfile.NamedTemporaryFile(
            mode="w", suffix=".md", delete=False, encoding="utf-8")
        broken_bank = tempfile.mkdtemp(prefix="studyroom-broken-bank-")
        try:
            note.write("compat gate must fail on this bank\n")
            note.close()
            stage_parent = tempfile.mkdtemp(prefix="studyroom-release-fail-")
            try:
                result = subprocess.run(
                    [sys.executable, str(RELEASE_CLI),
                     "--as-test",
                     "--note-file", note.name,
                     "--out", stage_parent,
                     "--bank", broken_bank],
                    cwd=str(REPO_ROOT),
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                self.assertNotEqual(result.returncode, 0)
                combined = result.stdout + result.stderr
                self.assertRegex(
                    combined, r"(?i)compat", "compat failure must be loud")
            finally:
                shutil.rmtree(stage_parent, ignore_errors=True)
        finally:
            os.unlink(note.name)
            shutil.rmtree(broken_bank, ignore_errors=True)

    def test_missing_note_file_exits_nonzero(self):
        if not RELEASE_CLI.is_file():
            self.fail("NOT_YET: tools/release_public.py")
        whats_new = REPO_ROOT / WHATS_NEW_NAME
        backup = None
        if whats_new.is_file():
            backup = whats_new.with_suffix(".md.bak-suite")
            whats_new.rename(backup)
        stage_parent = tempfile.mkdtemp(prefix="studyroom-release-nonote-")
        try:
            result = subprocess.run(
                [sys.executable, str(RELEASE_CLI),
                 "--as-test",
                 "--out", stage_parent],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                timeout=120,
            )
            self.assertNotEqual(result.returncode, 0)
            combined = result.stdout + result.stderr
            self.assertIn(WHATS_NEW_NAME, combined)
        finally:
            shutil.rmtree(stage_parent, ignore_errors=True)
            if backup is not None and backup.is_file():
                backup.rename(whats_new)


if __name__ == "__main__":
    unittest.main()
