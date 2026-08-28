#!/usr/bin/env python3
"""UPD-06 / map #144 — both-direction compat bank; no skip switch.

Throwaway sample trees only — never her live library, never a live key
import. Release-time bank: tools/compat_bank/. Suite-local fence copy:
tests/fixtures/compat_bank/README.md.

Contracts (D-04 / D-05):
  - forward: current migrate_store / loaders accept every older banked sample
  - backward: newest sample's emitted keys ⊆ freeze_manifest
  - no force/skip/ignore CLI flag on the compat check
  - fixtures never point at ~/StudyRoom or import live keys

Run: `python3 tests/test_compat_bank.py`
"""

from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

FIXTURE_BANK = REPO_ROOT / "tests" / "fixtures" / "compat_bank"
TOOLS_BANK = REPO_ROOT / "tools" / "compat_bank"
COMPAT_CHECK = REPO_ROOT / "tools" / "compat_check.py"

DATE_DIR_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class CompatBankContract(unittest.TestCase):
    """UPD-06 / D-05: both-direction bank + absence of force/skip."""

    def test_fixture_readme_forbids_live_library(self):
        readme = FIXTURE_BANK / "README.md"
        self.assertTrue(readme.is_file(), "fixtures/compat_bank/README.md missing")
        text = readme.read_text(encoding="utf-8").lower()
        self.assertIn("throwaway", text)
        self.assertIn("never", text)
        # README must name the live-library / live-key fences explicitly.
        self.assertIn("studyroom", text.replace(" ", "").replace("~/", ""))
        self.assertTrue(
            "live key" in text or "keys.json" in text,
            "README must forbid live-key import")

    def test_tools_bank_readme_throwaway_only(self):
        readme = TOOLS_BANK / "README.md"
        self.assertTrue(
            readme.is_file(),
            "NOT_YET: tools/compat_bank/README.md (throwaway-only fence)")
        text = readme.read_text(encoding="utf-8").lower()
        self.assertIn("throwaway", text)
        self.assertTrue(
            "studyroom" in text.replace(" ", "").replace("~/", "")
            or "~/studyroom" in text.replace(" ", ""),
            "tools bank README must forbid live library path")
        self.assertTrue(
            "live key" in text or "keys.json" in text,
            "tools bank README must forbid live-key import")

    def test_compat_check_module_or_cli_exists(self):
        self.assertTrue(
            COMPAT_CHECK.is_file(),
            "NOT_YET: tools/compat_check.py — both-direction check, "
            "no force/skip flag (map #144 / D-05)")
        self.assertTrue(
            TOOLS_BANK.is_dir(),
            "NOT_YET: tools/compat_bank/ samples")
        src = COMPAT_CHECK.read_text(encoding="utf-8")
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, ast.arg):
                name = node.arg.lower()
                if name in ("skip", "force", "skip_compat", "force_compat",
                            "ignore"):
                    self.fail(
                        "compat/release CLI must not expose a skip/force "
                        "flag (D-05); found arg %r in %s" % (
                            node.arg, COMPAT_CHECK))

    def test_no_force_skip_in_argparse_help(self):
        self.assertTrue(COMPAT_CHECK.is_file(), "compat_check.py missing")
        env = dict(os.environ)
        # Never let incidental settings touch her real HOME.
        with tempfile.TemporaryDirectory(prefix="compat-bank-home-") as tmp:
            env["HOME"] = tmp
            proc = subprocess.run(
                [sys.executable, str(COMPAT_CHECK), "--help"],
                cwd=str(REPO_ROOT),
                env=env,
                capture_output=True,
                text=True,
                check=False)
        help_text = (proc.stdout + proc.stderr).lower()
        for banned in ("--force", "--skip", "--ignore"):
            self.assertNotIn(
                banned, help_text,
                "compat_check must not advertise %s (D-05)" % banned)
        # Unknown skip-ish flags must error, not be silently accepted.
        with tempfile.TemporaryDirectory(prefix="compat-bank-home-") as tmp:
            env["HOME"] = tmp
            bad = subprocess.run(
                [sys.executable, str(COMPAT_CHECK), "--force"],
                cwd=str(REPO_ROOT),
                env=env,
                capture_output=True,
                text=True,
                check=False)
        self.assertNotEqual(
            bad.returncode, 0,
            "passing --force must fail (no skip switch)")

    def test_no_live_key_import_in_this_suite(self):
        # Structural honesty via AST: no import of a keys module, no Call to
        # load_keys / getenv of a paid-key env name. Docstrings may name fences.
        me = Path(__file__).read_text(encoding="utf-8")
        tree = ast.parse(me)
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                names = []
                if isinstance(node, ast.Import):
                    names = [a.name for a in node.names]
                else:
                    names = [node.module or ""] + [a.name for a in node.names]
                for n in names:
                    if n and n.split(".")[0] == "keys":
                        self.fail("suite must not import a keys module")
            if isinstance(node, ast.Call):
                fn = node.func
                if isinstance(fn, ast.Name) and fn.id == "load_keys":
                    self.fail("suite must not call load_keys")
                if isinstance(fn, ast.Attribute) and fn.attr == "load_keys":
                    self.fail("suite must not call load_keys")

    def test_only_ever_add_rule_at_writer_sites(self):
        """D-05 / #144: ONLY_EVER_ADD must sit at migrate_store + META_KEYS."""
        lib_src = (REPO_ROOT / "study_lib.py").read_text(encoding="utf-8")
        srv_src = (REPO_ROOT / "server.py").read_text(encoding="utf-8")
        token = re.compile(
            r"ONLY_EVER_ADD|only-ever-add|ONLY-EVER-ADD", re.IGNORECASE)

        mig = lib_src.find("\ndef migrate_store(")
        self.assertGreaterEqual(
            mig, 0, "migrate_store definition missing in study_lib.py")
        window = lib_src[max(0, mig - 1200):mig + 200]
        self.assertTrue(
            token.search(window),
            "ONLY_EVER_ADD / only-ever-add rule comment must sit "
            "immediately above migrate_store (D-05)")

        meta = srv_src.find("\nMETA_KEYS = ")
        self.assertGreaterEqual(
            meta, 0, "META_KEYS definition missing in server.py")
        window = srv_src[max(0, meta - 800):meta + 200]
        self.assertTrue(
            token.search(window),
            "ONLY_EVER_ADD / only-ever-add rule comment must sit "
            "beside META_KEYS / settings writers (D-05)")

    def test_bank_has_freeze_manifest_and_two_dated_samples(self):
        self.assertTrue(
            TOOLS_BANK.is_dir(),
            "NOT_YET: tools/compat_bank/")
        manifest = TOOLS_BANK / "freeze_manifest.json"
        self.assertTrue(
            manifest.is_file(),
            "NOT_YET: tools/compat_bank/freeze_manifest.json")
        data = json.loads(manifest.read_text(encoding="utf-8"))
        self.assertIsInstance(data, dict)
        self.assertIn("store_keys", data)
        self.assertIn("meta_keys", data)
        dated = sorted(
            p.name for p in TOOLS_BANK.iterdir()
            if p.is_dir() and DATE_DIR_RE.match(p.name))
        self.assertGreaterEqual(
            len(dated), 2,
            "NOT_YET: need ≥2 dated synthetic sample dirs under "
            "tools/compat_bank/ (got %r)" % dated)
        for name in dated:
            sample = TOOLS_BANK / name
            store = sample / "items.json"
            settings = sample / "settings.json"
            self.assertTrue(
                store.is_file() or settings.is_file(),
                "%s must hold items.json and/or settings.json" % name)

    def test_compat_check_exits_zero_on_seeded_bank(self):
        self.assertTrue(COMPAT_CHECK.is_file(), "compat_check.py missing")
        with tempfile.TemporaryDirectory(prefix="compat-bank-home-") as tmp:
            env = dict(os.environ)
            env["HOME"] = tmp
            proc = subprocess.run(
                [sys.executable, str(COMPAT_CHECK)],
                cwd=str(REPO_ROOT),
                env=env,
                capture_output=True,
                text=True,
                check=False)
        self.assertEqual(
            proc.returncode, 0,
            "compat_check must exit 0 on seeded bank; stdout=%r stderr=%r"
            % (proc.stdout, proc.stderr))

    def test_both_directions_driven(self):
        """Forward + backward are real assertions, not prose (D-04)."""
        self.assertTrue(COMPAT_CHECK.is_file(), "compat_check.py missing")
        # Import the check module under a throwaway HOME.
        with tempfile.TemporaryDirectory(prefix="compat-bank-home-") as tmp:
            prior = os.environ.get("HOME")
            os.environ["HOME"] = tmp
            try:
                # Fresh import each run so HOME swap is visible if needed.
                import importlib
                sys.path.insert(0, str(REPO_ROOT / "tools"))
                if "compat_check" in sys.modules:
                    mod = importlib.reload(sys.modules["compat_check"])
                else:
                    import compat_check as mod  # noqa: E402
                forward_errs = mod.check_forward(TOOLS_BANK)
                backward_errs = mod.check_backward(TOOLS_BANK)
            finally:
                if prior is None:
                    os.environ.pop("HOME", None)
                else:
                    os.environ["HOME"] = prior
        self.assertEqual(
            forward_errs, [],
            "forward check failed (new code must read old samples): %s"
            % forward_errs)
        self.assertEqual(
            backward_errs, [],
            "backward check failed (new sample keys ⊆ freeze_manifest): %s"
            % backward_errs)

    def test_removing_freeze_key_fails_backward(self):
        """Planting a freeze-manifest removal must fail the check (D-05)."""
        self.assertTrue(COMPAT_CHECK.is_file(), "compat_check.py missing")
        with tempfile.TemporaryDirectory(prefix="compat-bank-home-") as tmp:
            prior = os.environ.get("HOME")
            os.environ["HOME"] = tmp
            try:
                import importlib
                import copy
                sys.path.insert(0, str(REPO_ROOT / "tools"))
                if "compat_check" in sys.modules:
                    mod = importlib.reload(sys.modules["compat_check"])
                else:
                    import compat_check as mod  # noqa: E402
                bank = Path(tmp) / "bank"
                # Copy real bank into temp, then drop a key the newest sample
                # still emits.
                import shutil
                shutil.copytree(TOOLS_BANK, bank)
                manifest_path = bank / "freeze_manifest.json"
                manifest = json.loads(
                    manifest_path.read_text(encoding="utf-8"))
                # Prefer dropping a meta key known to be on the newest sample.
                dates = sorted(
                    p.name for p in bank.iterdir()
                    if p.is_dir() and DATE_DIR_RE.match(p.name))
                self.assertGreaterEqual(len(dates), 1)
                newest = bank / dates[-1] / "items.json"
                if newest.is_file():
                    store = json.loads(newest.read_text(encoding="utf-8"))
                    meta_keys = list((store.get("meta") or {}).keys())
                    drop = None
                    for k in meta_keys:
                        if k in manifest.get("meta_keys", []):
                            drop = k
                            break
                    self.assertIsNotNone(
                        drop, "newest sample meta keys must intersect "
                        "freeze_manifest.meta_keys")
                    mangled = copy.deepcopy(manifest)
                    mangled["meta_keys"] = [
                        k for k in mangled["meta_keys"] if k != drop]
                    manifest_path.write_text(
                        json.dumps(mangled, indent=2) + "\n",
                        encoding="utf-8")
                    errs = mod.check_backward(bank)
                    self.assertTrue(
                        errs,
                        "removing freeze key %r must fail backward check"
                        % drop)
                else:
                    self.fail("newest sample missing items.json")
            finally:
                if prior is None:
                    os.environ.pop("HOME", None)
                else:
                    os.environ["HOME"] = prior


if __name__ == "__main__":
    unittest.main()
