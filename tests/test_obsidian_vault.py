#!/usr/bin/env python3
"""The TRACER proof for phase 26.97: one fenced vault note, collected end to
end (plan 26.97-03).

WHAT THIS FILE PROVES, and it is written BEFORE the collector exists so that
its central case is seen RED first:

  1. a note under a rostered folder, collected through the vault adapter and
     imported, comes back BORN TRIGGER-FLAGGED
  2. the same note through the whole-vault import path comes back flagged in
     the SAME run -- the unmutated control
  3. a note under a NON-rostered folder comes back unflagged in both paths --
     the negative control, so the fence is not flagging indiscriminately
  4. after the collect a note's recorded origin resolves to a file that EXISTS
     and sits underneath the vault root recorded in the store
  5. a note under the reflections folder still satisfies the shipped
     reflections predicate after a collect
  6. a note under an excluded folder never reaches the staging area at all

HOW A VERDICT IS READ, said once because it is the thing that makes this file
evidence rather than decoration: every verdict is read off the STORED ITEM
that `study_lib.import_folder` produced, or off `study_lib.is_reflection`.
Nothing here re-expresses the roster match. A test that re-implements a
predicate agrees with a defect in the shipped one, and that trap has landed on
this project roughly thirty times -- including inside the first draft of
tests/test_vault_fence_staging.py's own tripwire.

THE TWO SHAPES, AND THE ONE SWITCH BETWEEN THEM. `_collect_and_import` runs
the vault adapter when `adapters/obsidian_vault.py` is importable, and
otherwise falls back to `_flat_collect` -- the FLAT staging shape every shipped
adapter uses today. That fallback is not a convenience: it is the instrument.

  * Before the collector exists it drives the fence case RED against the
    current shipped shape. That red IS the phase's central finding, reproduced
    by instrument rather than quoted.
  * After the collector exists, setting OBSIDIAN_VAULT_FORCE_FLAT=1 forces the
    same fallback back on and the fence case must redden AGAIN, with the
    whole-vault control green in the same run. A green that has never been
    shown red is not evidence.

EVERY PATH GETS ITS OWN LIBRARY ROOT, and this is load-bearing rather than
tidy. `import_folder` inherits a judgment across items that share a folded
TITLE (the 26-05 UAT fix): run the control into the same library first and the
adapter path's note would inherit trigger=True from it and pass for entirely
the wrong reason.

Nothing here reads or writes the owner's real library or her real vault. Every
fixture is synthetic, built in a temp directory, and removed in tearDown.

WHAT PLAN 26.97-05 ADDED, and why each case is here rather than implied by
the six above. This half is about LIVENESS -- that new and changed notes
arrive on their own -- and about the mirror risk, that a re-collect disturbs
nothing she has already judged:

  7.  a second collect over an UNCHANGED vault is a TRUE no-op: nothing is
      staged, nothing is imported, and the stored item count is the SAME
      INTEGER as before
  8.  one genuinely new note raises the stored count by EXACTLY ONE
  9.  an EDITED note comes back as the SAME item with the edit present --
      one item before, one item after, the same identity string, new words
  10. the three judgements she can make (blessed / kept-but-never-shown /
      retired) all survive a re-collect of the very notes carrying them
  11. no note she has judged is re-minted as a fresh unjudged card
  12. a note under an excluded folder never reaches the scratch area, on the
      first collect OR on any later one

THE CALLER SHAPE IS REPRODUCED, NOT INVENTED. `_VaultSession` does what
server.py's collect worker does and in the same order: collect into a fresh
scratch directory, import it with `staged_from` set to the true vault root,
and ONLY THEN commit the exported ids to the shared per-source ledger. That
order is the shipped invariant -- a failed import must not lose what it
fetched -- and getting it wrong here would make every liveness case in this
file a statement about a shape nothing ships.

THE TWO PLANTS, BOTH ENVIRONMENT-GATED AND BOTH OFF BY DEFAULT. A green that
has never been shown red is not evidence, and the failure these cases guard
is SILENT: a room that quietly withholds her edits looks exactly like a room
where nothing has changed.

  * OBSIDIAN_VAULT_TRAP_KEY=1 -- THE LIVENESS PLANT. It forces the fetch
    memory into the `where-it-lives` shape, which `26.97-DECISIONS.md`
    DECISION 2 names to her AS A TRAP: edit a note and the room says "I
    already have that one" and never looks again. Case 9 must go RED under
    it, with case 7 (the unchanged-vault control) green in the same run. It
    is planted INSIDE the collect flow -- the adapter's own id function is
    replaced for the duration of the call -- not by mutating a fixture
    afterwards, and it counts its own invocations so the drill can prove the
    mutated path was actually executed.
  * OBSIDIAN_VAULT_DUP_MINT=1 -- THE SAFETY PLANT. On every collect after the
    first it hands the importer a sibling root, so the re-collected note is
    reconciled against nothing and is MINTED AS A SECOND ITEM. Cases 10 and
    11 must go RED under it. That is the never-list leak this project treats
    as a P0: sixteen kept-but-never-shown notes and two retired ones coming
    back as fresh unjudged cards.

⛔ NEITHER PLANT MAY BE LEFT ON. Both default to off, and the twelve cases are
green with neither set.

Stdlib only (unittest) -- zero-dependency law (law 8).
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

# The roster this proof fences by, passed EXPLICITLY to import_folder so the
# case never depends on the shipped default list or on a store's saved one.
ROSTER = ["Journal", "personnel notes"]

# The folder she keeps out. Named here, honored where files are ENUMERATED.
EXCLUDED = "Private stuff"

# The re-drill switch. Set to "1" to force the flat staging shape back on even
# when the real collector exists -- see the module docstring.
FORCE_FLAT = os.environ.get("OBSIDIAN_VAULT_FORCE_FLAT") == "1"


def _adapter():
    """The shipped vault adapter, or None when it does not exist yet (or when
    the re-drill has forced the flat shape back on)."""
    if FORCE_FLAT:
        return None
    try:
        from adapters import obsidian_vault
    except ImportError:
        return None
    return obsidian_vault


def _staged_files(staging):
    """Every file under `staging`, as vault-relative-looking POSIX strings.
    Hidden entries are included deliberately: this is a census of what
    actually landed, not a re-application of any rule."""
    out = []
    for path in sorted(Path(staging).rglob("*")):
        if path.is_file():
            out.append(path.relative_to(staging).as_posix())
    return sorted(out)


def _flat_collect(vault, staging, exclude_folders=()):
    """THE SHIPPED SHAPE, reproduced: walk the source and copy every file into
    the staging directory FLAT, with no folder structure at all -- exactly
    what adapters/apple_notes.py and adapters/apple_photos.py do today.

    The exclusion is applied here, where files are enumerated, so that this
    fallback differs from the real collector in EXACTLY ONE respect: the shape
    of the staged path. If it also leaked excluded notes, a red could be
    attributed to the wrong cause."""
    staging = Path(staging)
    staging.mkdir(parents=True, exist_ok=True)
    segs = [study_lib.roster_segments(e) for e in (exclude_folders or ())]
    segs = [s for s in segs if s]
    candidates, _skips = study_lib.walk_source(str(vault))
    for path, _kind in candidates:
        rel = Path(path).relative_to(vault).parts
        if any(list(rel[:len(s)]) == s for s in segs):
            continue
        target = staging / Path(path).name
        n = 2
        while target.exists():
            target = staging / ("%s-%d%s" % (target.stem, n, target.suffix))
            n += 1
        shutil.copy2(path, target)
    return _staged_files(staging)


class VaultTracer(unittest.TestCase):

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="obsidian-vault-tracer-"))
        self.vault = self.tmp / "Obsidian Vault"
        self.build_vault()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # -- the fixture ------------------------------------------------------

    #: (vault-relative folder, filename, body) for every note in the fixture.
    NOTES = (
        ("Journal", "2026-08-18.md", "# today\n\nnothing yet.\n"),
        ("Clippings", "a clipping.md", "# a clipping\n\nsaved.\n"),
        (os.path.join("Claude's observation", "Journal analysis"),
         "a reflection.md",
         "---\nreflects:\n  - Journal/2026-08-18.md\n---\n\nwhat I noticed.\n"),
        (EXCLUDED, "kept out.md", "she kept this folder private.\n"),
    )

    ROSTERED = "2026-08-18.md"
    NON_ROSTERED = "a clipping.md"
    REFLECTION = "a reflection.md"
    KEPT_OUT = "kept out.md"

    def build_vault(self):
        """A synthetic Obsidian vault: the marker directory, one note under a
        rostered folder, one under an ordinary folder, one under the
        reflections folder carrying a reflects: key, and one under the folder
        she keeps private."""
        for folder, name, body in self.NOTES:
            (self.vault / folder).mkdir(parents=True, exist_ok=True)
            (self.vault / folder / name).write_text(body, encoding="utf-8")
        (self.vault / ".obsidian").mkdir(parents=True, exist_ok=True)
        (self.vault / ".obsidian" / "app.json").write_text("{}", "utf-8")

    def new_library(self, name):
        """A fresh library root whose store already remembers the vault --
        which is the real sequence: a whole-vault import records
        meta.vault_root, and a later collect is what this phase adds."""
        lib = self.tmp / name
        lib.mkdir(parents=True, exist_ok=True)
        store = study_lib.new_store(str(lib))
        store["meta"]["vault_root"] = str(self.vault)
        study_lib.save_store(str(lib), store)
        return lib

    # -- the two paths ----------------------------------------------------

    def collect_and_import(self, lib_name, exclude=(EXCLUDED,)):
        """THE ADAPTER PATH: collect into a scratch area, then import it.
        Returns (store, staged_relpaths, report)."""
        lib = self.new_library(lib_name)
        staging = self.tmp / (lib_name + "-staging")
        mod = _adapter()
        if mod is None:
            staged = _flat_collect(self.vault, staging, exclude)
            report = study_lib.import_folder(
                str(staging), str(lib), roster=list(ROSTER))
        else:
            mod.collect(str(lib), str(staging), exclude_folders=exclude)
            staged = _staged_files(staging)
            report = study_lib.import_folder(
                str(staging), str(lib), roster=list(ROSTER),
                staged_from=str(self.vault))
        return study_lib.load_store(str(lib)), staged, report

    def whole_vault_import(self, lib_name):
        """THE CONTROL PATH: the shipped whole-vault import, unmutated.
        Returns (store, report)."""
        lib = self.new_library(lib_name)
        report = study_lib.import_folder(
            str(self.vault), str(lib), roster=list(ROSTER))
        return study_lib.load_store(str(lib)), report

    # -- reading verdicts off the STORED item -----------------------------

    def item_titled(self, store, title):
        found = [it for it in store["items"].values()
                 if it.get("title") == title]
        self.assertEqual(
            len(found), 1,
            "expected exactly one stored item titled %r, found %d (%s)"
            % (title, len(found),
               sorted(it.get("title") for it in store["items"].values())))
        return found[0]

    # -- the cases --------------------------------------------------------

    def test_fence_survives_adapter_collect(self):
        store, staged, report = self.collect_and_import("library-adapter")
        self.assertEqual(
            report["imported"], 3,
            "the plant was never reached: the import brought in %d item(s), "
            "not the three notes outside the excluded folder (%s)"
            % (report["imported"], staged))
        self.assertIn(
            self.ROSTERED, [Path(p).name for p in staged],
            "the rostered note was never staged, so this case would be "
            "asserting on an import that never saw it (staged: %s)" % staged)
        item = self.item_titled(store, self.ROSTERED)
        self.assertIs(
            item.get("trigger"), True,
            "a note under a rostered folder came back UNFENCED through the "
            "adapter path. Her Journal/, personnel notes/ and medical notes are "
            "what is behind this assertion -- an unfenced item is readable "
            "by the disclosed cloud model (SRM-13, law 5)")

    def test_fence_whole_vault_control(self):
        store, report = self.whole_vault_import("library-control")
        self.assertEqual(
            report["imported"], 4,
            "the control import brought in %d item(s), not the four notes in "
            "the fixture -- the control never ran" % report["imported"])
        item = self.item_titled(store, self.ROSTERED)
        self.assertIs(
            item.get("trigger"), True,
            "the whole-vault fence itself is broken. Every other case in "
            "this file is moot until this one passes")

    def test_non_rostered_note_is_not_flagged_in_either_path(self):
        """The negative control. A fence that flagged EVERY note would satisfy
        a positive-only assertion, so the ordinary note must come back
        unflagged through both paths in this same run."""
        adapter_store, _staged, _r = self.collect_and_import(
            "library-neg-adapter")
        control_store, _r2 = self.whole_vault_import("library-neg-control")
        for label, store in (("adapter", adapter_store),
                             ("whole-vault", control_store)):
            item = self.item_titled(store, self.NON_ROSTERED)
            self.assertIs(
                item.get("trigger"), False,
                "the %s path flagged an ORDINARY note. A fence that flags "
                "everything is not a fence" % label)

    def test_origin_still_resolves_after_a_collect(self):
        """A6, the named cost of her `keep-the-shape` ruling. A stored origin
        left pointing into a scratch directory that is deleted afterwards
        breaks her comment write-back and the room's memory of which note is
        which -- on every note already in the room."""
        store, _staged, _report = self.collect_and_import("library-origin")
        vault_root = store["meta"].get("vault_root")
        self.assertTrue(vault_root, "the store lost its vault root")
        for title in (self.ROSTERED, self.NON_ROSTERED, self.REFLECTION):
            item = self.item_titled(store, title)
            origin = Path(str(item.get("origin_path")))
            self.assertTrue(
                origin.exists(),
                "%s: the recorded origin %s does not exist -- a scratch "
                "directory that has already been deleted looks exactly like "
                "this" % (title, origin))
            self.assertEqual(
                Path(os.path.commonpath(
                    [str(origin.resolve()),
                     str(Path(vault_root).resolve())])),
                Path(vault_root).resolve(),
                "%s: the recorded origin %s does not sit underneath the "
                "vault root the store remembers (%s)"
                % (title, origin, vault_root))

    def test_reflection_survives_a_collect(self):
        """The third casualty the roadmap never named. The folder facet is
        derived from the origin's parent directory name and is re-stamped once
        per VERSION, so a flat collect rewrites it on already-imported notes
        too -- and the shipped reflections predicate requires that facet."""
        store, _staged, _report = self.collect_and_import("library-reflect")
        item = self.item_titled(store, self.REFLECTION)
        self.assertTrue(
            study_lib.is_reflection(item),
            "the reflections shelf empties: after a collect this note is no "
            "longer a reflection (source=%r folder=%r reflects=%r)"
            % (item.get("source"), item.get("folder"), item.get("reflects")))
        ordinary = self.item_titled(store, self.NON_ROSTERED)
        self.assertFalse(
            study_lib.is_reflection(ordinary),
            "an ordinary clipping is being read as a reflection -- a "
            "predicate that returns true unconditionally would pass the "
            "assertion above")

    def test_excluded_folder_never_reaches_the_staging_area(self):
        """The exclusion is a storage-tier guarantee applied where files are
        ENUMERATED, never a filter applied at import time or at render time.
        Counted BY VALUE, and with the rostered note named as present, so an
        empty staging area cannot satisfy this vacuously."""
        store, staged, _report = self.collect_and_import("library-exclude")
        names = [Path(p).name for p in staged]
        self.assertEqual(
            len(staged), 3,
            "expected exactly three staged files, found %d: %s"
            % (len(staged), staged))
        for present in (self.ROSTERED, self.NON_ROSTERED, self.REFLECTION):
            self.assertIn(present, names,
                          "%s never reached staging (staged: %s)"
                          % (present, staged))
        self.assertNotIn(
            self.KEPT_OUT, names,
            "a note from the folder she kept private reached the scratch "
            "area (staged: %s)" % staged)
        self.assertEqual(
            [it for it in store["items"].values()
             if it.get("title") == self.KEPT_OUT], [],
            "a note from the folder she kept private reached the STORE")


# ===========================================================================
# PLAN 26.97-05 -- THE LIVENESS AND SAFETY PROOFS
# ===========================================================================
# Everything below this line belongs to plan 26.97-05. It is APPENDED rather
# than woven in: the six tracer cases above are plan 26.97-03's evidence and
# rewriting them would destroy that record.
#
# ⛔ NO CHURN FIGURE APPEARS ANYWHERE BELOW, in code or in a comment. How much
# of her vault has changed is a function of how long it has been since her
# last import, never a property of her vault -- the roadmap's own figure moved
# from twelve percent to zero in five days. Every count asserted here is a
# count of THIS FILE'S OWN synthetic fixture.
#
# ⛔ EVERY COUNT IS AN INTEGER EQUALITY (assertEqual on two ints) or a string
# equality on an identity. There is no assertTrue(len(x)) anywhere: a
# non-empty collection is not a count, and "it grew" is not "it grew by one".

#: THE LIVENESS PLANT. Forces the fetch memory into the `where-it-lives` shape
#: DECISION 2 names to her as a trap. Off unless explicitly set.
TRAP_KEY = os.environ.get("OBSIDIAN_VAULT_TRAP_KEY") == "1"

#: THE SAFETY PLANT. Forces the importer to see a re-collected note as a
#: different note, so it is minted as a second item. Off unless set.
DUP_MINT = os.environ.get("OBSIDIAN_VAULT_DUP_MINT") == "1"

#: How many times each planted path was actually EXECUTED. A mutation nobody
#: reached proves nothing, so every drill asserts on these by value.
PLANT_REACHED = {"trap_key": 0, "dup_mint": 0}


def _trap_key_stable_id(rel_posix, path, kind):
    """`where-it-lives`: the note's location and NOTHING ELSE.

    This is the option `26.97-DECISIONS.md` DECISION 2 put to the owner as a
    TRAP rather than as an equal -- edit a note and the room says "I already
    have that one" and never looks again, her edit never arrives, the room
    reports success and every check stays green. Reproduced here by
    instrument so the case that guards against it is shown capable of
    failing."""
    PLANT_REACHED["trap_key"] += 1
    return rel_posix


class _VaultSession:
    """One room connected to one vault, driven the way server.py drives it.

    ⚠ THE ORDER IS THE SHIPPED INVARIANT AND IS COPIED, NOT INVENTED: collect
    into a fresh scratch directory, hand that directory to the importer with
    `staged_from` set to the TRUE vault root, and commit the exported ids to
    the shared per-source ledger ONLY AFTER the import returns. The caller
    commits the fetch memory, never the adapter, and never before the import
    succeeds -- so a failed import does not lose what it fetched.

    The scratch directory is deleted after every collect, which is also what
    ships. A case that left it lying about would be testing a world where the
    recorded origins happen to still resolve."""

    def __init__(self, tmp, lib, vault, exclude=(EXCLUDED,), name="session"):
        self.tmp = Path(tmp)
        self.lib = Path(lib)
        self.vault = Path(vault)
        self.exclude = tuple(exclude)
        self.name = name
        self.runs = 0
        self._twin = None

    def _twin_root(self):
        """A sibling root carrying the vault marker, used ONLY by the safety
        plant. Handing the importer this instead of the real vault root means
        the re-collected note reconciles against nothing -- leg 1 misses
        because the origin is new, leg 2 refuses because the original file is
        still there -- and the importer mints a second item. That is exactly
        the duplicate-mint failure the never-list cases exist to catch."""
        if self._twin is None:
            twin = self.tmp / (self.name + "-twin-root")
            (twin / ".obsidian").mkdir(parents=True, exist_ok=True)
            self._twin = twin
        return self._twin

    def collect(self):
        """One tap of her collect control. Returns (exported_ids, staged_rel,
        import_report)."""
        from adapters import _ledger
        from adapters import obsidian_vault as mod

        self.runs += 1
        staging = self.tmp / ("%s-staging-%d" % (self.name, self.runs))

        # THE LIVENESS PLANT LIVES HERE, INSIDE THE COLLECT FLOW. The adapter's
        # own id function is swapped for the duration of the call, so the
        # trap shape is what the ledger compare actually sees. It is not a
        # fixture mutated afterwards -- that would prove nothing about how the
        # room decides what to fetch.
        original = mod._stable_id
        if TRAP_KEY:
            mod._stable_id = _trap_key_stable_id
        try:
            exported = mod.collect(str(self.lib), str(staging),
                                   exclude_folders=self.exclude)
        finally:
            mod._stable_id = original
        # ⚠ A MUTATION NOBODY REACHED PROVES NOTHING. This tripwire fires only
        # when the plant is on and the planted function was never called --
        # i.e. when a "red" would be attributable to something other than the
        # trap shape.
        if TRAP_KEY and PLANT_REACHED["trap_key"] < 1:
            raise AssertionError(
                "OBSIDIAN_VAULT_TRAP_KEY is set but the planted id function "
                "was never called -- this drill is measuring nothing")

        staged = _staged_files(staging)

        # THE SAFETY PLANT LIVES HERE, on every collect after the first.
        true_root = self.vault
        if DUP_MINT and self.runs > 1:
            true_root = self._twin_root()
            PLANT_REACHED["dup_mint"] += 1
            if not Path(true_root, ".obsidian").is_dir():
                raise AssertionError(
                    "the safety plant's sibling root lost its vault marker, "
                    "so the import would change SOURCE as well as identity "
                    "and the red would not be attributable to the mint")

        report = study_lib.import_folder(
            str(staging), str(self.lib), roster=list(ROSTER),
            staged_from=str(true_root))

        # ⚠ AFTER the import, never before -- see the class docstring.
        ledger = _ledger.load(str(self.lib), mod.SOURCE)
        have = set(ledger.get("exported_ids", []))
        have.update(exported)
        ledger["exported_ids"] = sorted(have)
        _ledger.save(str(self.lib), mod.SOURCE, ledger)

        shutil.rmtree(staging, ignore_errors=True)
        return exported, staged, report


class VaultLiveness(unittest.TestCase):
    """New and changed notes arrive on their own, and nothing she has judged
    is disturbed.

    ⚠ THIS CLASS USES THE ADAPTER DIRECTLY rather than through `_adapter()`,
    and the difference is deliberate. `_adapter()` returns None under
    OBSIDIAN_VAULT_FORCE_FLAT=1, which is plan 26.97-03's re-drill switch;
    routing these cases through it would make plan 03's drill run twelve
    cases against a shape that has no fetch memory at all and report reds that
    belong to neither plan."""

    #: (vault-relative folder, filename, body). Seven notes; six of them
    #: outside the folder she keeps private.
    NOTES = (
        ("Journal", "2026-08-18.md", "# today\n\nnothing yet.\n"),
        ("Clippings", "a clipping.md", "# a clipping\n\nsaved.\n"),
        (os.path.join("Claude's observation", "Journal analysis"),
         "a reflection.md",
         "---\nreflects:\n  - Journal/2026-08-18.md\n---\n\nwhat I noticed.\n"),
        ("Notes", "to bless.md", "# to bless\n\nkeep this one.\n"),
        ("Notes", "to hide.md", "# to hide\n\nnever show this.\n"),
        ("Notes", "to retire.md", "# to retire\n\ndone with this.\n"),
        (EXCLUDED, "kept out.md", "she kept this folder private.\n"),
    )

    #: The six that are not behind the exclusion, by value.
    STAGED_ON_FIRST_COLLECT = 6

    EDITED = "2026-08-18.md"
    BLESSED = "to bless.md"
    HIDDEN = "to hide.md"
    RETIRED = "to retire.md"
    KEPT_OUT = "kept out.md"

    #: The words the edit puts into the note. Read back off the STORED
    #: snapshot, never off the file on disk -- the question is whether her
    #: edit reached the room, not whether she typed it.
    EDIT_MARK = "the edit arrived and the room can see it"

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="obsidian-vault-liveness-"))
        self.vault = self.tmp / "Obsidian Vault"
        for folder, name, body in self.NOTES:
            (self.vault / folder).mkdir(parents=True, exist_ok=True)
            (self.vault / folder / name).write_text(body, encoding="utf-8")
        (self.vault / ".obsidian").mkdir(parents=True, exist_ok=True)
        (self.vault / ".obsidian" / "app.json").write_text("{}", "utf-8")
        PLANT_REACHED["trap_key"] = 0
        PLANT_REACHED["dup_mint"] = 0

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    # -- the room -----------------------------------------------------------

    def session(self, name):
        lib = self.tmp / name
        lib.mkdir(parents=True, exist_ok=True)
        store = study_lib.new_store(str(lib))
        store["meta"]["vault_root"] = str(self.vault)
        study_lib.save_store(str(lib), store)
        return _VaultSession(self.tmp, lib, self.vault, name=name)

    # -- reading verdicts off the STORED items ------------------------------

    def store_of(self, session):
        return study_lib.load_store(str(session.lib))

    def total(self, store):
        """The stored item count, as an int."""
        return len(store["items"])

    def in_state(self, store, state):
        """How many stored items are in `state`, as an int."""
        return len([it for it in store["items"].values()
                    if it.get("state") == state])

    def one_titled(self, store, title):
        found = [it for it in store["items"].values()
                 if it.get("title") == title]
        self.assertEqual(
            len(found), 1,
            "expected exactly ONE stored item titled %r, found %d (%s)"
            % (title, len(found),
               sorted(str(it.get("title")) for it in store["items"].values())))
        return found[0]

    def stored_words(self, session, item):
        """The words the ROOM holds for this item -- its own snapshot under the
        library root, not the file in the vault."""
        return (session.lib / str(item.get("library_path"))).read_text("utf-8")

    def judge(self, session, title, state):
        """Her judgement, landed on the stored item the way the room lands
        it: on the THING, by id, saved atomically."""
        store = self.store_of(session)
        item = self.one_titled(store, title)
        item["state"] = state
        study_lib.save_store(str(session.lib), store)
        return str(item["id"])

    def edit(self, folder, name, extra):
        path = self.vault / folder / name
        path.write_text(path.read_text("utf-8") + "\n" + extra + "\n",
                        encoding="utf-8")

    # -- the cases ----------------------------------------------------------

    def test_unchanged_vault_is_a_noop_control(self):
        s = self.session("library-noop")
        _exported, staged, _report = s.collect()
        self.assertEqual(
            len(staged), self.STAGED_ON_FIRST_COLLECT,
            "the first collect staged %d file(s), not the %d notes outside "
            "the excluded folder -- nothing below this line would mean "
            "anything (%s)"
            % (len(staged), self.STAGED_ON_FIRST_COLLECT, staged))
        before = self.total(self.store_of(s))
        self.assertEqual(
            before, self.STAGED_ON_FIRST_COLLECT,
            "the first collect stored %d item(s), not %d"
            % (before, self.STAGED_ON_FIRST_COLLECT))

        exported2, staged2, report2 = s.collect()
        after = self.total(self.store_of(s))

        self.assertEqual(
            len(exported2), 0,
            "a second collect over an UNCHANGED vault handed over %d note(s) "
            "-- it is meant to hand over none (%s)"
            % (len(exported2), exported2))
        self.assertEqual(
            staged2, [],
            "a second collect over an UNCHANGED vault copied %s into the "
            "scratch area" % (staged2,))
        self.assertEqual(
            report2["imported"], 0,
            "a second collect over an UNCHANGED vault imported %d item(s)"
            % report2["imported"])
        self.assertEqual(
            after, before,
            "the stored item count moved from %d to %d over an UNCHANGED "
            "vault -- the re-collect forked something" % (before, after))

    def test_a_new_note_raises_the_count_by_exactly_one(self):
        """Not "the count grew". Exactly one, as an integer, so a collect that
        re-minted everything it already had would fail here."""
        s = self.session("library-new-note")
        s.collect()
        before = self.total(self.store_of(s))

        (self.vault / "Clippings" / "a second clipping.md").write_text(
            "# a second clipping\n\nsaved later.\n", encoding="utf-8")
        _exported, staged, report = s.collect()

        self.assertEqual(
            len(staged), 1,
            "the second collect staged %d file(s), not the one genuinely new "
            "note (%s)" % (len(staged), staged))
        self.assertEqual(
            report["imported"], 1,
            "the second collect imported %d item(s), not one"
            % report["imported"])
        self.assertEqual(
            self.total(self.store_of(s)), before + 1,
            "one new note took the stored count from %d to %d"
            % (before, self.total(self.store_of(s))))

    def test_edited_note_same_identity_new_words(self):
        s = self.session("library-edit")
        s.collect()
        store_before = self.store_of(s)
        count_before = self.total(store_before)
        item_before = self.one_titled(store_before, self.EDITED)
        identity_before = str(item_before["id"])
        self.assertNotIn(
            self.EDIT_MARK, self.stored_words(s, item_before),
            "the fixture already contains the edit mark before the edit -- "
            "this case would pass without the room doing anything")

        self.edit("Journal", self.EDITED, self.EDIT_MARK)
        _exported, staged, _report = s.collect()

        store_after = self.store_of(s)
        count_after = self.total(store_after)
        item_after = self.one_titled(store_after, self.EDITED)

        self.assertEqual(
            count_after, count_before,
            "editing one note took the stored count from %d to %d -- her "
            "edit forked a SECOND copy, and every blessing, comment and "
            "judgement she made is stranded on the first one"
            % (count_before, count_after))
        self.assertEqual(
            str(item_after["id"]), identity_before,
            "the edited note came back with a DIFFERENT identity (%s, was "
            "%s) -- the room no longer knows it is the same note"
            % (item_after["id"], identity_before))
        self.assertIn(
            self.EDIT_MARK, self.stored_words(s, item_after),
            "HER EDIT NEVER ARRIVED. The room still holds the words the note "
            "had before she changed it, and it reported success. This is the "
            "`where-it-lives` failure DECISION 2 was taken to prevent: the "
            "room says \"I already have that one\" and never looks again, "
            "which is indistinguishable from nothing having changed. "
            "(staged this run: %s)" % (staged,))

    def test_every_judgement_survives_a_recollect(self):
        """Blessed, kept-but-never-shown and retired, all three carried on
        notes that are then EDITED -- so the re-collect genuinely re-stages
        them. A collect that staged nothing would leave every count where it
        was and pass for the wrong reason, which is why the staged count is
        asserted by value first."""
        s = self.session("library-judgements")
        s.collect()
        blessed_id = self.judge(s, self.BLESSED, "blessed")
        hidden_id = self.judge(s, self.HIDDEN, "never_show")
        retired_id = self.judge(s, self.RETIRED, "retired")

        store_before = self.store_of(s)
        total_before = self.total(store_before)
        blessed_before = self.in_state(store_before, "blessed")
        hidden_before = self.in_state(store_before, "never_show")
        retired_before = self.in_state(store_before, "retired")
        self.assertEqual([blessed_before, hidden_before, retired_before],
                         [1, 1, 1],
                         "the fixture did not land the three judgements")

        for name in (self.BLESSED, self.HIDDEN, self.RETIRED):
            self.edit("Notes", name, "she edited this after judging it.")
        _exported, staged, _report = s.collect()

        self.assertEqual(
            len(staged), 3,
            "the re-collect staged %d file(s), not the three EDITED notes -- "
            "a collect that brought nothing back would leave every count "
            "below unchanged and pass vacuously (%s)" % (len(staged), staged))

        store_after = self.store_of(s)
        self.assertEqual(
            self.total(store_after), total_before,
            "the stored item count moved from %d to %d across a re-collect "
            "of three notes she had judged" % (total_before,
                                               self.total(store_after)))
        self.assertEqual(
            self.in_state(store_after, "blessed"), blessed_before,
            "the blessed count moved from %d to %d"
            % (blessed_before, self.in_state(store_after, "blessed")))
        self.assertEqual(
            self.in_state(store_after, "never_show"), hidden_before,
            "the kept-but-never-shown count moved from %d to %d -- law 5 "
            "calls a never-list leak absolute"
            % (hidden_before, self.in_state(store_after, "never_show")))
        self.assertEqual(
            self.in_state(store_after, "retired"), retired_before,
            "the retired count moved from %d to %d"
            % (retired_before, self.in_state(store_after, "retired")))

        for title, was_id, state in ((self.BLESSED, blessed_id, "blessed"),
                                     (self.HIDDEN, hidden_id, "never_show"),
                                     (self.RETIRED, retired_id, "retired")):
            item = self.one_titled(store_after, title)
            self.assertEqual(
                str(item["id"]), was_id,
                "%s came back as a different item (%s, was %s)"
                % (title, item["id"], was_id))
            self.assertEqual(
                item.get("state"), state,
                "%s lost her judgement across a re-collect: it is %r, she "
                "left it %r" % (title, item.get("state"), state))

    def test_no_judged_note_is_re_minted_as_a_fresh_card(self):
        """The P0. A kept-but-never-shown or retired note coming back as a
        fresh unjudged card is a never-list leak: the room would surface it
        and the librarian could read it. Counted by value on the unjudged
        state, and checked by NAME on each judged note."""
        s = self.session("library-remint")
        s.collect()
        self.judge(s, self.BLESSED, "blessed")
        self.judge(s, self.HIDDEN, "never_show")
        self.judge(s, self.RETIRED, "retired")

        store_before = self.store_of(s)
        unjudged_before = self.in_state(store_before, "unseen")
        self.assertEqual(
            unjudged_before, self.STAGED_ON_FIRST_COLLECT - 3,
            "the fixture left %d unjudged item(s), expected %d"
            % (unjudged_before, self.STAGED_ON_FIRST_COLLECT - 3))

        for name in (self.BLESSED, self.HIDDEN, self.RETIRED):
            self.edit("Notes", name, "edited after she judged it.")
        s.collect()

        store_after = self.store_of(s)
        self.assertEqual(
            self.in_state(store_after, "unseen"), unjudged_before,
            "the unjudged count moved from %d to %d across a re-collect of "
            "three notes she had already judged. A judged note that comes "
            "back as a fresh card is a never-list leak (law 5)"
            % (unjudged_before, self.in_state(store_after, "unseen")))
        for title in (self.BLESSED, self.HIDDEN, self.RETIRED):
            item = self.one_titled(store_after, title)
            self.assertNotEqual(
                item.get("state"), "unseen",
                "%s came back UNJUDGED after a re-collect" % title)

    def test_excluded_folder_never_reaches_staging_across_a_recollect(self):
        """The exclusion is applied where files are ENUMERATED, so it holds on
        every collect and not only the first. Asserted by counting the staged
        set and by naming what is in it."""
        s = self.session("library-exclude-live")
        _exported, staged, _report = s.collect()
        names = sorted(Path(p).name for p in staged)
        self.assertEqual(
            names,
            sorted(name for folder, name, _b in self.NOTES
                   if folder != EXCLUDED),
            "the first collect staged the wrong set: %s" % (staged,))
        self.assertNotIn(self.KEPT_OUT, names,
                         "a note from the folder she kept private reached "
                         "the scratch area on the first collect")

        # one new note behind the exclusion, one in front of it
        (self.vault / EXCLUDED / "also kept out.md").write_text(
            "also private.\n", encoding="utf-8")
        (self.vault / "Clippings" / "a later clipping.md").write_text(
            "# a later clipping\n\nsaved later.\n", encoding="utf-8")
        self.edit(EXCLUDED, self.KEPT_OUT, "she edited the private note too.")

        _exported2, staged2, _report2 = s.collect()
        self.assertEqual(
            staged2, ["Clippings/a later clipping.md"],
            "the second collect staged %s -- exactly one note was outside "
            "the excluded folder, and an edited private note must not be "
            "treated as new work either" % (staged2,))
        self.assertEqual(
            [it for it in self.store_of(s)["items"].values()
             if str(it.get("title")).startswith(("kept out", "also kept"))],
            [],
            "a note from the folder she kept private reached the STORE")



class KeptOutCountNeverCrossesTheWire(unittest.TestCase):
    """T-26.97-38, /gsd-secure-phase 2026-08-19.

    Law 3 and law 7: the number of notes she kept out is never counted back
    at her. The picker's own rule says so in as many words. But `collect` put
    that count into the SAME bag as the failure reasons, and that bag is
    copied whole into the progress payload the browser polls -- so the count
    was one widened guard away from being rendered as a sentence about her
    private folders, with a promise that the room would retry them.

    The fix keeps it out of the bag. This case drives the real collect and
    reads the real stats dict."""

    def test_the_stats_bag_carries_no_count_of_what_she_kept_out(self):
        import tempfile
        from pathlib import Path as _P
        from adapters import obsidian_vault as _ov

        base = _P(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, str(base), True)
        vault = base / "Vault"
        (vault / ".obsidian").mkdir(parents=True)
        (vault / "Journal").mkdir()
        (vault / "Notes").mkdir()
        (vault / "Journal" / "private.md").write_text("private", "utf-8")
        (vault / "Notes" / "ordinary.md").write_text("ordinary", "utf-8")
        library = base / "library"
        library.mkdir()
        staging = base / "staging"
        staging.mkdir()

        stats = {}
        _ov.collect(str(library), str(staging), vault_root=str(vault),
                    exclude_folders=["Journal"], stats=stats)

        skipped = stats.get("skipped") or {}
        self.assertNotIn(
            "excluded", skipped,
            "the count of notes she kept out is in the same bag as the "
            "failure reasons, and that bag crosses the wire to the browser. "
            "One widened guard away from a sentence counting her private "
            "folders back at her -- and promising to retry them. Bag: %r"
            % (skipped,))

        # ...and nothing anywhere in the payload equals that count either,
        # so this cannot be satisfied by renaming the key.
        import json as _json
        blob = _json.dumps(stats, sort_keys=True, default=str)
        self.assertNotIn(
            '"excluded"', blob,
            "an excluded-count key survives somewhere in the stats payload: "
            "%s" % blob)

    def test_the_genuine_skip_reasons_still_reach_the_stats(self):
        """THE CONTROL. Removing the count must not empty the per-reason bag
        -- that bag is T-26.97-06's evidence that placeholders and unreadable
        files are reported rather than silently dropped. A fix that deleted
        the whole bag would pass the case above while destroying it."""
        import tempfile
        from pathlib import Path as _P
        from adapters import obsidian_vault as _ov

        base = _P(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, str(base), True)
        vault = base / "Vault"
        (vault / ".obsidian").mkdir(parents=True)
        (vault / "Notes").mkdir()
        (vault / "Notes" / "ordinary.md").write_text("ordinary", "utf-8")
        library = base / "library"
        library.mkdir()
        staging = base / "staging"
        staging.mkdir()

        stats = {}
        _ov.collect(str(library), str(staging), vault_root=str(vault),
                    exclude_folders=[], stats=stats)
        self.assertIn("skipped", stats,
                      "the per-reason bag is gone from the stats entirely")
        self.assertIsInstance(stats["skipped"], dict,
                              "the per-reason bag is no longer a mapping")
        self.assertEqual(stats.get("staged"), 1,
                         "the control collect staged %r, not the one "
                         "ordinary note" % (stats.get("staged"),))


if __name__ == "__main__":
    unittest.main()
