#!/usr/bin/env python3
"""
The reflection-predicate precision suite (Phase 26.4, Plan 06 — D-26/D-29,
SRM-08/SRM-09/SRM-13).

study_lib.is_reflection(item) is the ONE pure predicate the redefined 26.4
stands on: "reflections ARE the insights." Everything downstream (the consent
gate, the diegetic shelf, the reader) filters on it. If it OVER-matches, the
Claude's-observation siblings (weekly-synthesis / career / health / the
ai-weekly-newsletter) or the raw journal would reach the shelf — a P0 privacy
leak (Pitfall 2). If it UNDER-matches, the shelf is empty.

The empirically-required identity (verified 2026-07-22 against the real vault's
Claude's observation/Journal analysis/ folder):

    source == "obsidian-vault"  AND
    folder == "Journal analysis"  AND
    a truthy reflects facet

folder alone is necessary but NOT sufficient — the Dream Symbol Dictionary sits
in the SAME folder with NO reflects: key and must be excluded (Pitfall 4). And
the reflects key alone is not sufficient either — only the Journal-analysis
folder carries reflection-insights.

This suite defines the contract BEFORE study_lib.is_reflection exists, so on
first run it fails (ImportError / AttributeError) — the intended RED state.

Stdlib only (unittest) — the zero-dependency law (D-01/D-03). Every item dict
is built inline; the real vault is never read.
"""
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import study_lib  # noqa: E402


def item(**over):
    """A minimal store-item dict with the facets is_reflection reads. Only
    source / folder / reflects matter to the predicate; the rest is realistic
    filler so a stray extra read would still find a plausible shape."""
    base = {
        "id": "00000000deadbeef",
        "source": "obsidian-vault",
        "folder": "Journal analysis",
        "reflects": True,
        "type": "text",
        "state": "unseen",
        "title": "some reflection.md",
    }
    base.update(over)
    return base


class IsReflectionTest(unittest.TestCase):

    # -- group 1: the real reflection (folder + reflects + obsidian-vault) --

    def test_journal_analysis_with_reflects_is_a_reflection(self):
        self.assertTrue(study_lib.is_reflection(item()),
                        "an obsidian-vault Journal-analysis item carrying a "
                        "truthy reflects facet IS a reflection")

    # -- group 2: same folder, NO reflects (the Dream Symbol Dictionary) ----

    def test_journal_analysis_without_reflects_is_not(self):
        no_key = item()
        del no_key["reflects"]
        self.assertFalse(study_lib.is_reflection(no_key),
                         "the Dream Symbol Dictionary sits in Memoir "
                         "analysis with NO reflects key — not a reflection")
        self.assertFalse(study_lib.is_reflection(item(reflects=False)),
                         "an explicit falsy reflects is not a reflection")
        self.assertFalse(study_lib.is_reflection(item(reflects="")),
                         "an empty-string reflects is falsy → not a reflection")

    # -- group 3: Claude's-observation SIBLINGS (Pitfall 2) -----------------

    def test_observation_siblings_never_reflect(self):
        for sibling in ("weekly-synthesis", "career", "health",
                        "ai-weekly-newsletter", "project-research",
                        "ai-skills-learning"):
            self.assertFalse(
                study_lib.is_reflection(item(folder=sibling)),
                f"a {sibling} analysis is NOT a reflection even with a "
                f"reflects facet — wrong folder (Pitfall 2, never surface "
                f"HR/health/weekly analysis)")

    # -- group 4: raw Memoir/ is never a reflection-insight ----------------

    def test_raw_journal_is_never_a_reflection(self):
        self.assertFalse(study_lib.is_reflection(item(folder="Memoir")),
                         "a raw Memoir/ item with reflects present is still "
                         "not a reflection-insight")
        no_key = item(folder="Memoir")
        del no_key["reflects"]
        self.assertFalse(study_lib.is_reflection(no_key),
                         "a raw Memoir/ item without reflects is not one "
                         "either")

    # -- group 5: non-obsidian-vault sources --------------------------------

    def test_non_vault_sources_never_reflect(self):
        for src in ("folder-drop", "ai-chat-export", "photos"):
            self.assertFalse(
                study_lib.is_reflection(item(source=src)),
                f"a {src} item is never a reflection even filed under "
                f"Journal analysis with a reflects facet")
        # an image item filed the same way is likewise not a reflection
        self.assertFalse(
            study_lib.is_reflection(item(source="folder-drop", type="image")),
            "a photo is not a reflection")

    # -- group 6: fail-closed on garbage (pure, never raises) ---------------

    def test_fail_closed_on_bad_input(self):
        for bad in (None, "not a dict", 42, [], object(),
                    {}, {"source": "obsidian-vault"},
                    {"folder": "Journal analysis"},
                    {"reflects": True}):
            try:
                result = study_lib.is_reflection(bad)
            except Exception as e:   # noqa: BLE001 — the point is it must NOT
                self.fail(f"is_reflection raised on {bad!r}: {e!r}")
            self.assertFalse(result,
                             f"is_reflection must fail closed on {bad!r}")


# ===========================================================================
# PLAN 26.97-05 -- THE REFLECTIONS SURVIVE A COLLECT, COUNTED BY VALUE
# ===========================================================================
# Everything above this line is Phase 26.4's precision suite, which asks what
# the PREDICATE says about a dict handed to it. This case asks a different
# question, and it is the one the vault adapter can get wrong: after a real
# collect-and-import, how many of the stored items still satisfy that
# predicate?
#
# WHY IT IS NOT IMPLIED BY THE CASES ABOVE. `is_reflection` reads the `folder`
# facet, the facet is derived from the parent directory of the note's recorded
# ORIGIN, and #58 made facets stamped once per VERSION rather than once per
# item -- so a re-collect RE-STAMPS `folder` on notes that were already in the
# room. A collect that flattened her folder shape, or that recorded an origin
# inside a scratch directory, would re-stamp `folder` to something else and
# empty her reflections shelf silently. The predicate itself would still be
# perfect. (T-26.97-18.)
#
# ⛔ THE COUNT IS AN INTEGER EQUALITY. Never assertTrue(len(...)): a shelf with
# one reflection left on it out of two is a shelf that lost one.

_REFLECTIONS_DIR = os.path.join("Claude's observation",
                                study_lib.REFLECTION_FOLDER)

#: (vault-relative folder, filename, body, is_a_reflection)
_VAULT_FIXTURE = (
    (_REFLECTIONS_DIR, "a reflection.md",
     "---\nreflects:\n  - Journal/2026-08-18.md\n---\n\nwhat I noticed.\n",
     True),
    (_REFLECTIONS_DIR, "another reflection.md",
     "---\nreflects:\n  - Journal/2026-08-11.md\n---\n\nand this too.\n",
     True),
    # the Dream Symbol Dictionary shape: SAME folder, no reflects key
    (_REFLECTIONS_DIR, "dream symbols.md",
     "# dream symbols\n\na dictionary, not a reflection.\n", False),
    # a Claude's-observation SIBLING carrying a reflects key (Pitfall 2)
    (os.path.join("Claude's observation", "health"), "a health analysis.md",
     "---\nreflects:\n  - Journal/2026-08-01.md\n---\n\nheavy.\n", False),
    ("Journal", "2026-08-18.md", "# today\n\nnothing yet.\n", False),
)

#: How many of the fixture's notes are reflections. Two, by construction --
#: and a case that only ever asserted "more than zero" would pass while one of
#: them fell off her shelf.
_REFLECTIONS_IN_FIXTURE = 2


class ReflectionsSurviveACollect(unittest.TestCase):
    """The shelf still has the same number of things on it after a collect.

    Nothing here reads the owner's real library or her real vault: the whole
    fixture is built in a temp directory and removed in tearDown."""

    def setUp(self):
        try:
            from adapters import obsidian_vault      # noqa: F401
        except ImportError:                          # pragma: no cover
            self.skipTest("the vault adapter does not exist yet")
        self.tmp = Path(tempfile.mkdtemp(prefix="reflections-collect-"))
        self.vault = self.tmp / "Obsidian Vault"
        for folder, name, body, _is_r in _VAULT_FIXTURE:
            (self.vault / folder).mkdir(parents=True, exist_ok=True)
            (self.vault / folder / name).write_text(body, encoding="utf-8")
        (self.vault / ".obsidian").mkdir(parents=True, exist_ok=True)
        (self.vault / ".obsidian" / "app.json").write_text("{}", "utf-8")
        self.lib = self.tmp / "library"
        self.lib.mkdir(parents=True, exist_ok=True)
        store = study_lib.new_store(str(self.lib))
        store["meta"]["vault_root"] = str(self.vault)
        study_lib.save_store(str(self.lib), store)
        self.runs = 0

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def collect(self):
        """One tap of her collect control, in server.py's order: collect into
        a fresh scratch directory, import it with `staged_from` set to the
        TRUE vault root, and commit the fetch memory ONLY after the import
        returns. Returns the number of files staged, as an int."""
        from adapters import _ledger, obsidian_vault
        self.runs += 1
        staging = self.tmp / ("staging-%d" % self.runs)
        exported = obsidian_vault.collect(str(self.lib), str(staging))
        staged = len([q for q in staging.rglob("*") if q.is_file()])
        study_lib.import_folder(str(staging), str(self.lib),
                                staged_from=str(self.vault))
        ledger = _ledger.load(str(self.lib), obsidian_vault.SOURCE)
        have = set(ledger.get("exported_ids", []))
        have.update(exported)
        ledger["exported_ids"] = sorted(have)
        _ledger.save(str(self.lib), obsidian_vault.SOURCE, ledger)
        shutil.rmtree(staging, ignore_errors=True)
        return staged

    def surviving_reflections(self):
        """How many STORED items still satisfy the shipped predicate, as an
        int. Read off `study_lib.is_reflection` -- never re-expressed here. A
        test that re-implements a predicate agrees with a defect in it."""
        store = study_lib.load_store(str(self.lib))
        return len([it for it in store["items"].values()
                    if study_lib.is_reflection(it)])

    def test_reflections_survive_a_collect_and_a_recollect(self):
        staged = self.collect()
        self.assertEqual(
            staged, len(_VAULT_FIXTURE),
            "the collect staged %d file(s), not the %d notes in the fixture "
            "-- every count below would be about an import that never "
            "happened" % (staged, len(_VAULT_FIXTURE)))
        after_first = self.surviving_reflections()
        self.assertEqual(
            after_first, _REFLECTIONS_IN_FIXTURE,
            "after a collect the room holds %d reflection(s), not the %d in "
            "her vault -- the shelf lost something (T-26.97-18)"
            % (after_first, _REFLECTIONS_IN_FIXTURE))

        # she edits one of them, and the room fetches it again -- which is
        # what RE-STAMPS the folder facet on a note already in the room
        note = self.vault / _REFLECTIONS_DIR / "a reflection.md"
        note.write_text(note.read_text("utf-8") + "\nand one more thing.\n",
                        encoding="utf-8")
        restaged = self.collect()
        self.assertEqual(
            restaged, 1,
            "the re-collect staged %d file(s), not the one edited note"
            % restaged)
        self.assertEqual(
            self.surviving_reflections(), _REFLECTIONS_IN_FIXTURE,
            "the reflections count moved from %d to %d after a re-collect "
            "re-stamped the folder facet"
            % (_REFLECTIONS_IN_FIXTURE, self.surviving_reflections()))


if __name__ == "__main__":
    unittest.main(verbosity=1)
