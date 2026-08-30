"""Bundled agent skills install — hermetic, temp HOME only.

Run: HOME="$(mktemp -d)" python3 tests/test_install_agent_skills.py
"""

import os
import shutil
import sys
import tempfile
import unittest
import unittest.mock
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tools"))

import install_agent_skills as ias  # noqa: E402


class InstallAgentSkillsTest(unittest.TestCase):

    def test_bundled_visualroom_update_exists_in_repo(self):
        skill = REPO_ROOT / "skills" / "visualroom-update" / "SKILL.md"
        self.assertTrue(skill.is_file(),
                        "visualroom-update skill must ship in the app folder")

    def test_installs_into_agent_roots(self):
        prior = os.environ.get("HOME")
        tmp = tempfile.mkdtemp(prefix="studyroom-skill-install-")
        os.environ["HOME"] = tmp
        try:
            # Reload module paths that use Path.home()
            roots = tuple(Path(tmp) / p.parts[-2] / p.parts[-1]
                          for p in ias.AGENT_SKILL_ROOTS)
            with unittest.mock.patch.object(ias, "AGENT_SKILL_ROOTS", roots):
                code = ias.install_all(REPO_ROOT, dry_run=False)
            self.assertEqual(code, 0)
            dest = Path(tmp) / ".cursor" / "skills" / "visualroom-update"
            self.assertTrue((dest / "SKILL.md").is_file())
            text = (dest / "SKILL.md").read_text(encoding="utf-8")
            self.assertIn("visualroom-update", text)
            self.assertIn("update_room.py", text)
        finally:
            if prior is None:
                os.environ.pop("HOME", None)
            else:
                os.environ["HOME"] = prior
            shutil.rmtree(tmp, ignore_errors=True)

    def test_refuses_when_skills_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            empty = Path(tmp) / "no-skills"
            empty.mkdir()
            self.assertEqual(ias.install_all(empty), 1)


if __name__ == "__main__":
    unittest.main()
