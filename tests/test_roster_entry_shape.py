#!/usr/bin/env python3
"""26.96-22 (T-26.96-64) — WHAT A ROSTER ENTRY HAS TO LOOK LIKE TO FENCE
ANYTHING, DRIVEN ON A NESTED FIXTURE.

⛔ THIS IS THE CONTRACT THE PICKER'S EMITTED STRING WILL BE MEASURED AGAINST.
No picker exists yet, and that is exactly why this file is written now: while
the property is still cheap to prove, with nothing in the tree to confuse a
plant with real work. When a folder picker is built, the string it puts into
the roster must satisfy every case below, or the row it produces looks like
protection and protects nothing.

⛔⛔ A NESTED FIXTURE IS THE ONLY ONE THAT CAN FAIL, AND THE FILE PROVES THAT
RATHER THAN ASSERTING IT. A TOP-LEVEL folder is fenced whether the entry is
emitted as a full vault-relative path or as a bare leaf name — the two
spellings are the same string — so a top-level fixture is green under a matcher
that reads only the last segment AND under one that reads the whole path.
`test_a_top_level_fixture_cannot_fail` measures precisely that, in the same
run, so the choice of a nested fixture is evidence and not a preference.

⛔ THE MATCHER IS DRIVEN, NEVER RE-IMPLEMENTED. `study_lib.roster_segments` is
THE ONE SPELLING of what an entry means and three matchers are already pinned
to it; a fourth spelling written here is how the second belt broke. Every case
below calls the shipped `_origin_under_roster` / `roster_segments` directly.

⚠ THE FENCE MATCHES WHOLE SEGMENTS FROM THE VAULT ROOT, NEVER A STRING PREFIX.
`Clippings/journal` may not catch `Clippings/journalism`, and `Journal` may not
catch `Journal analysis` — a real folder in the owner's vault holding the
room's own writing about her diary.

⚠ CAPITALS ARE IGNORED BY OWNER RULING OF 2026-08-19, and this file pins that
ruling rather than re-deriving it. The case exists so that a later change
cannot quietly re-introduce a case trap and then pin it as correct.

⚠ THE TRAILING-SLASH CASES ARE RECORDED AS BEHAVIOUR, NOT AS A DEFECT. Under
owner ruling C2 the entry is stored VERBATIM — `add_roster_folder` strips
surrounding whitespace and nothing else — so an entry with a trailing slash
sits in her list with the slash on it while fencing identically at the matcher.
This file measures both halves and asks nobody to change either.

⛔ NOTHING HERE READS OR WRITES ANY REAL LIBRARY. Every drive is against a
synthetic vault in a temporary directory that is torn down. No filesystem path
belonging to a person is written into this file — the fixture idiom is
`tests/test_roster_retroactive.py`'s (a `tempfile.TemporaryDirectory`, a
stamped vault root, real files on disk), reused rather than reinvented; the
server half of that idiom is deliberately NOT reused, because the contract
under test is a PURE predicate and a real HTTP server would add a thread this
file has no question about.
"""

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import study_lib  # noqa: E402

# The nested folder she wants private, and the sibling whose name SHARES ITS
# PREFIX. ⛔ The sibling is what makes a string-prefix matcher visible: with
# only the target present, a prefix test and a segment test agree on every
# path in the fixture and the case would pass under both.
PARENT = "Clippings"
TARGET = "journal"
SIBLING = "journalism"

# Every note in the synthetic vault, vault-relative. ⛔ Counted rather than
# described: each case below states how many of these it flags BY VALUE, so a
# matcher that flagged everything and a matcher that flagged nothing are
# different verdicts rather than the same silence.
NOTES = [
    PARENT + "/" + TARGET + "/note.md",       # the nested target
    PARENT + "/" + SIBLING + "/other.md",     # the prefix-sharing sibling
    PARENT + "/loose.md",                     # directly in the parent
    "Notes/plain.md",                         # outside the parent entirely
]
FIXTURE_SIZE = len(NOTES)


class RosterEntryShapeTest(unittest.TestCase):
    """A synthetic vault on disk, because `_origin_under_roster` resolves both
    paths before it compares them and a purely notional path would be
    measuring `Path.resolve` rather than the fence."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        # ⚠ RESOLVED, not merely joined: on this platform the temporary
        # directory is itself a symlink, and an unresolved root makes
        # `relative_to` raise — which the matcher fails CLOSED on, so every
        # case would go green for the wrong reason.
        self.vault = (Path(self._tmp.name) / "entry-shape-vault-root").resolve()
        self.paths = []
        for rel in NOTES:
            p = self.vault / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b"# a note\n")
            self.paths.append(p)
        # The fixture is only evidence if it is really on disk and really
        # nested two segments deep.
        self.assertEqual(len(self.paths), FIXTURE_SIZE)
        for p in self.paths:
            self.assertTrue(p.exists(), p)
        nested = Path(NOTES[0])
        self.assertEqual(len(nested.parts), 3, nested.parts)

    # -- helpers -------------------------------------------------------------

    def flagged(self, entry):
        """The vault-relative paths one roster entry fences, driven through the
        SHIPPED predicate. ⛔ Returns the names, never a count: a bare count
        cannot say WHICH thing a matcher caught, and the sibling case is
        entirely about which."""
        out = []
        for rel, p in zip(NOTES, self.paths):
            if study_lib._origin_under_roster(p, self.vault, [entry]):
                out.append(rel)
        return out

    # -- 1. A BARE LEAF NAME FENCES NOTHING ----------------------------------
    #
    # This is the case the picker can fail. A control that hands back the
    # folder's DISPLAY name — which is what a picker's UI naturally has to
    # hand — writes `journal` into her list. The row then reads exactly like
    # protection, and protects nothing at all.

    def test_a_leaf_name_fences_nothing_nested(self):
        got = self.flagged(TARGET)
        self.assertEqual(
            got, [],
            "the bare leaf name %r fenced %d of %d notes (%r). A roster entry "
            "names a folder FROM THE VAULT ROOT; a leaf name matches the "
            "first segment of nothing, so the row sits in her list looking "
            "like a fence and covering no file." % (
                TARGET, len(got), FIXTURE_SIZE, got))

    # -- 2. THE FULL VAULT-RELATIVE PATH DOES --------------------------------

    def test_the_vault_relative_path_fences_the_nested_folder(self):
        entry = PARENT + "/" + TARGET
        got = self.flagged(entry)
        self.assertEqual(
            got, [NOTES[0]],
            "%r fenced %r; expected exactly the one nested note out of %d. "
            "This is the positive control for case 1 — without it, 'a leaf "
            "name fences nothing' would also be satisfied by a matcher that "
            "fenced nothing at all." % (entry, got, FIXTURE_SIZE))

    # -- 3. SEGMENT-WISE AND WHOLE, NEVER A STRING PREFIX --------------------
    #
    # ⛔ THE DANGEROUS DIRECTION IS THE ONE MEASURED HERE. `Clippings/journal`
    # is a STRING PREFIX of `Clippings/journalism/other.md`, so a matcher built
    # on `startswith` fences a folder she never named — and it does so
    # silently, in the direction of covering MORE than she asked for, which is
    # the failure the 2026-08-14 amendment already had to correct once (an
    # entry read as its first segment alone fenced 1,921 things instead of
    # 344, including 62 she had blessed).

    def test_a_sibling_prefix_is_not_caught(self):
        entry = PARENT + "/" + TARGET
        got = self.flagged(entry)
        self.assertNotIn(
            NOTES[1], got,
            "%r caught the note inside %r. The entry is a STRING PREFIX of "
            "that sibling's path, so a prefix test passes here and a "
            "segment-wise test does not — and the cost of the prefix test is "
            "a folder fenced that she never named. Flagged: %r" % (
                entry, PARENT + "/" + SIBLING, got))
        # And the other direction, in the same case: naming the sibling must
        # not reach the target either.
        sib = self.flagged(PARENT + "/" + SIBLING)
        self.assertEqual(
            sib, [NOTES[1]],
            "naming %r flagged %r; expected exactly the sibling's own note. "
            "Without this half, 'the sibling is not caught' would be "
            "satisfied by a matcher that caught nothing." % (
                PARENT + "/" + SIBLING, sib))

    # -- 4. CAPITALS ARE IGNORED (OWNER RULING, 2026-08-19) ------------------
    #
    # ⚠ PINNED, NOT DERIVED. She was shown that writing `journal` when the
    # folder is `Journal` left the folder SILENTLY UNFENCED on both ways into
    # the room, with every check green, and chose folding over refusing —
    # because folding can only ever make MORE private, never less. This case
    # exists so a later change cannot quietly take that back and then pin the
    # taking-back as correct.
    # ⛔ It does NOT loosen case 3: the entry below still names WHOLE segments.

    def test_capitals_are_ignored_by_owner_ruling(self):
        entry = PARENT.upper() + "/" + TARGET.capitalize()
        self.assertNotEqual(entry, PARENT + "/" + TARGET,
                            "the fixture must differ in case or this case is "
                            "driving the same string twice")
        got = self.flagged(entry)
        self.assertEqual(
            got, [NOTES[0]],
            "%r fenced %r; expected the same one note the exactly-cased entry "
            "fences. Capitals are ignored by owner ruling of 2026-08-19." % (
                entry, got))
        # ⛔ AND THE RULING DID NOT WIDEN THE MATCH INTO A SUBSTRING TEST.
        # Driven in the SAME case, because a fold implemented as a lowercase
        # `in` test would satisfy the assertion above and break case 3.
        self.assertNotIn(NOTES[1], got,
                         "the case-folded entry reached the prefix-sharing "
                         "sibling — folding was implemented as a substring "
                         "test, which the ruling explicitly does not permit")

    # -- 5. A TRAILING SLASH: RECORDED AS IT BEHAVES -------------------------
    #
    # ⛔ NOT A DEFECT REPORT AND NOT A REQUEST. Two separate facts, measured:
    # the FENCE is unaffected by a trailing slash, and the ENTRY is kept
    # VERBATIM in her list (owner ruling C2 — `add_roster_folder` strips
    # surrounding whitespace and nothing else). A picker that emits a trailing
    # slash therefore fences correctly and shows her a slash; both halves are
    # written down here so neither is a surprise later.

    def test_a_trailing_slash_is_recorded_as_it_behaves(self):
        plain = PARENT + "/" + TARGET
        slashed = plain + "/"
        self.assertEqual(
            self.flagged(slashed), self.flagged(plain),
            "a trailing slash changed what the entry fences")
        self.assertEqual(
            study_lib.roster_segments(slashed),
            study_lib.roster_segments(plain),
            "a trailing slash changed the entry's segments")
        # THE VERBATIM HALF. The store keeps the string she gave it.
        store = {"meta": {"fenced_roster": []}, "items": {}}
        study_lib.add_roster_folder(store, slashed)
        self.assertEqual(
            store["meta"]["fenced_roster"], [slashed],
            "the entry was normalised on the way into her list. It is stored "
            "VERBATIM under owner ruling C2 — recorded here as behaviour, not "
            "asked to change.")

    # -- 6. WHY THE FIXTURE IS NESTED — MEASURED, NOT ASSERTED ---------------
    #
    # ⛔ THE CASE THAT JUSTIFIES EVERY CASE ABOVE. At the TOP LEVEL the bare
    # leaf name and the full vault-relative path are the SAME STRING, so both
    # spellings fence identically and case 1 cannot fail. A file built on a
    # top-level fixture would run, go green, and prove nothing — which is this
    # project's signature defect living inside the measuring instrument.

    def test_a_top_level_fixture_cannot_fail(self):
        top = "Notes"                      # NOTES[3] lives directly under it
        self.assertEqual(study_lib.roster_segments(top), [top])
        self.assertEqual(
            self.flagged(top), [NOTES[3]],
            "the top-level folder did not fence its own note, so this "
            "measurement is about something else")
        # The bare leaf name of a top-level folder IS its vault-relative path.
        self.assertEqual(
            top, Path(top).name,
            "the fixture chosen for this measurement is not top-level")
        # ⛔ Contrast, in the same case: the nested target's leaf name is NOT
        # its vault-relative path, which is the whole reason case 1 can fail.
        self.assertNotEqual(
            TARGET, PARENT + "/" + TARGET,
            "the nested target's leaf name equals its path — the fixture "
            "stopped being nested and case 1 can no longer fail")



# ---------------------------------------------------------------------------
# 26.96-29 (D-C, her ruling of 2026-08-22) — THE TWO SURFACES BEHIND THE FENCE
# ---------------------------------------------------------------------------
#
# ⛔ HER RULING, VERBATIM FROM `26.96-DECISIONS.md` § *Round 3*, D-C:
#
#     "Also fix the two things behind it"
#
# ⛔ TIER 2 — APPROVED AS SHOWN. An orchestrator wrote the question and the
# option labels and she picked one; she typed no prose. Nothing here may be
# described as a sentence she wrote cold.
#
# ⛔ HER C2 RULING OF 20 AUGUST IS UNTOUCHED AND ITS COST SENTENCE STANDS:
# *"trimming the slash would also change what her existing entries cover."*
# So NOTHING is trimmed at the add field, the entry is still stored verbatim
# (case 5 above pins that), and the repair lives entirely in the two surfaces
# that read the entry.
#
# ⛔⛔ WHAT THESE CASES ARE ABOUT. The FENCE already tolerates a stray
# separator — `roster_segments` splits on it and drops the empty piece, which
# case 5 measures. Two surfaces BEHIND the fence did not: each re-derived its
# own value from the RAW entry string instead of from the shipped spelling,
# so a character most people would think harmless switched them off in
# silence.
#
#   1. app.js `collectFencedBasenames` — the BARE-NAME BELT. It builds a
#      regular expression per roster folder to harvest the basenames of notes
#      written with that folder in front of them, so a bare `[[note name]]`
#      in a reflection's Related tail cannot become a live door. Built from
#      `Journal/` the pattern needed a DOUBLED separator in the text and
#      matched nothing at all.
#   2. study_lib's one-heavy-item guard — the roster half of the tripwire.
#      Its terms were a strip-and-lower of the raw entry, and the roster half
#      compares the folder facet WHOLE, so `journal/` equalled no folder and
#      the guard stopped recognising her folder.
#
# ⛔ A FOURTH SPELLING OF WHAT AN ENTRY MEANS IS HOW THE SECOND BELT BROKE IN
# THE FIRST PLACE. Neither surface gets a normaliser of its own: each is
# routed through the shipped spelling — `rosterSegments` on the client,
# `roster_segments` on the server — and re-joins that spelling's own pieces.
# Re-joining is what makes this the SEPARATOR AND NOTHING ELSE: a nested
# entry's derived value comes back byte-identical to what it was.

_NODE_BELT_DRIVER = r"""
'use strict';
const fs = require('fs');
const appSrc = fs.readFileSync(process.argv[2], 'utf8');
function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  if (start === -1) { throw new Error(name + ' is not defined in app.js'); }
  let i = src.indexOf('{', start); let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  if (depth !== 0) { throw new Error(name + "'s braces do not balance"); }
  return src.slice(start, i);
}
// ⚠ LIFT THE RULE, NOT JUST THE VERDICT. `rosterSegments` is the client's own
// spelling of what an entry means and `collectFencedBasenames` now turns on
// it, so a harness lifting only the caller would throw rather than quietly
// harvest nothing — which is the failure mode this whole file exists about.
const LIFTS = ['rosterSegments', 'reflectionActiveRoster',
               'collectFencedBasenames'];
const src = LIFTS.map(function (n) { return extractFn(appSrc, n); }).join('\n');
const cases = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const out = {};
cases.forEach(function (c) {
  const room = { meta: { fenced_roster: [c.entry] } };
  const fn = new Function('REFLECTION_FENCED_ROSTER', 'ROOM',
    src + '\nreturn collectFencedBasenames;')([], room);
  out[c.key] = Object.keys(fn(c.md)).sort();
});
process.stdout.write(JSON.stringify(out));
"""


def _drive_bare_name_belt(cases):
    """Harvest the bare names app.js's OWN `collectFencedBasenames` finds, one
    roster entry per case, by lifting it out of `app.js` and running it under
    node.

    ⛔ NEVER RE-IMPLEMENTED HERE. A python copy of that regular expression
    would be a fifth spelling of the very rule this file exists to keep
    single, and it would go green against itself while the shipped belt
    stayed broken — this project's signature defect living inside the
    measuring instrument.

    ⛔ A MISSING `node` IS A LOUD FAILURE, NEVER A SKIP. A skipped case
    reports the same green as a passing one, and half of what these cases
    assert lives in the client."""
    payload = [{"key": k, "entry": e, "md": md} for k, e, md in cases]
    with tempfile.TemporaryDirectory() as td:
        drv = Path(td) / "belt.cjs"
        drv.write_text(_NODE_BELT_DRIVER, "utf-8")
        arg = Path(td) / "cases.json"
        arg.write_text(json.dumps(payload), "utf-8")
        try:
            res = subprocess.run(
                ["node", str(drv), str(_REPO_ROOT / "app.js"), str(arg)],
                capture_output=True, text=True, timeout=120)
        except (OSError, subprocess.SubprocessError) as exc:
            raise AssertionError(
                "the bare-name belt could not be driven at all (%r). ⛔ This "
                "is a FAILURE, not a skip: the client half of this contract "
                "would otherwise report the same green as a passing run."
                % (exc,))
    if res.returncode != 0:
        raise AssertionError(
            "the node driver exited %d and therefore proved nothing.\n"
            "stderr:\n%s" % (res.returncode, res.stderr[-4000:]))
    return json.loads(res.stdout)


def _belt_corpus(folder):
    """A reflection body carrying two notes written with `folder` in front of
    them — the shape the belt harvests basenames out of."""
    return ("some writing about the week\n"
            "[[%s/a private note.md|a private note]]\n"
            "and also [[%s/second one.md]]\n" % (folder, folder))


def _heavy_cap_fired(entry, folder_facet):
    """1 when the one-heavy-item cap fired for `folder_facet` under a roster
    holding exactly `entry`, 0 when the guard did not recognise it.

    ⛔ DRIVEN THROUGH THE SHIPPED `build_librarian_payload`, so the term
    derivation really executes — a test that re-typed that derivation would
    pin whatever the derivation currently does, including the defect.

    ⛔ The two rows carry NO tags and neutral titles, so neither the shipped
    generic-term half nor the roster half's prose-substring path can supply
    the signal instead: the only way the cap can fire is the roster term
    equalling the folder facet WHOLE."""
    items = {}
    for n in (1, 2):
        items["%016x" % n] = {
            "id": "%016x" % n,
            "source": "obsidian-vault",
            "type": "text",
            "state": "blessed",
            "title": "a note %d.md" % n,
            "tags": [],
            "folder": folder_facet,
            "saved_at_ms": 1_000_000 + n,
        }
    store = {"meta": {"fenced_roster": [entry]}, "items": items}
    payload = study_lib.build_librarian_payload(store, "reflection")
    return payload["counts"]["heavy-capped"]


class RosterEntryStraySeparatorTest(unittest.TestCase):
    """D-C: a stray separator stops switching off the two surfaces behind the
    fence, and NOTHING ELSE MOVES."""

    # -- 7. THE BARE-NAME BELT ----------------------------------------------

    def test_a_stray_separator_no_longer_switches_off_the_bare_name_belt(self):
        plain = PARENT + "/" + TARGET
        cases = [
            ("plain", plain, _belt_corpus(plain)),
            ("trailing", plain + "/", _belt_corpus(plain)),
            ("doubled", plain + "//", _belt_corpus(plain)),
            ("leading", "/" + plain, _belt_corpus(plain)),
            ("backslash", plain.replace("/", "\\"), _belt_corpus(plain)),
        ]
        got = _drive_bare_name_belt(cases)
        # The positive control FIRST: without it, "the slashed spelling
        # harvests what the plain one harvests" is satisfied by a belt that
        # harvests nothing at all under either spelling.
        self.assertEqual(
            got["plain"], ["a private note", "second one"],
            "the plain entry harvested %r; the belt is not doing its job at "
            "all, so nothing below this line means anything" % (got["plain"],))
        for key in ("trailing", "doubled", "leading", "backslash"):
            self.assertEqual(
                got[key], got["plain"],
                "the %s spelling harvested %r where the plain spelling "
                "harvested %r. A stray separator silently switched the "
                "bare-name belt off — the belt that exists because a bare "
                "note name is exactly how a private thing slips through."
                % (key, got[key], got["plain"]))

    # -- 8. THE ONE-HEAVY-ITEM GUARD ----------------------------------------

    def test_a_stray_separator_no_longer_switches_off_the_heavy_guard(self):
        plain = PARENT + "/" + TARGET
        base = _heavy_cap_fired(plain, plain)
        self.assertEqual(
            base, 1,
            "the plain entry did not make the guard recognise the folder "
            "(heavy-capped=%r). This is the positive control; without it "
            "every equality below is satisfied by a guard that never fires."
            % (base,))
        for spelling in (plain + "/", plain + "//", "/" + plain,
                         plain.replace("/", "\\")):
            got = _heavy_cap_fired(spelling, plain)
            self.assertEqual(
                got, base,
                "with the roster entry spelled %r the one-heavy-item cap "
                "fired %r time(s) where the plain spelling fired %r. A stray "
                "separator turned off the guard against handing her several "
                "hard things in one sitting." % (spelling, got, base))

    # -- 9. THE SEPARATOR AND NOTHING ELSE ----------------------------------
    #
    # ⛔ THE CASE THIS CHANGE LIVES OR DIES BY. Normalising a separator must
    # leave a NESTED entry meaning exactly what it meant — neither more nor
    # less. The dangerous direction is MORE: a derivation that collapsed a
    # nested entry to its leaf, or that loosened into a substring test, would
    # make `Clippings/journal` reach `Clippings/journalism`, a folder she
    # never named. Both surfaces are driven against the prefix-sharing
    # sibling, in the same case as the positive control.

    def test_a_nested_entry_still_means_exactly_what_it_meant(self):
        nested = PARENT + "/" + TARGET
        sibling = PARENT + "/" + SIBLING
        got = _drive_bare_name_belt([
            ("target", nested, _belt_corpus(nested)),
            ("sibling-text", nested, _belt_corpus(sibling)),
            ("leaf-only", TARGET, _belt_corpus(nested)),
        ])
        self.assertEqual(
            got["target"], ["a private note", "second one"],
            "the nested entry stopped harvesting its own folder's notes")
        self.assertEqual(
            got["sibling-text"], [],
            "%r harvested %r out of writing that only ever names %r. The "
            "derivation widened past the separator into a prefix or a leaf "
            "match, and it now reaches a folder she never named."
            % (nested, got["sibling-text"], sibling))
        # ⚠⚠ A MEASURED FINDING, PINNED RATHER THAN "FIXED" — AND THE
        # DIRECTION IS WHY. The belt's pattern is UNANCHORED, so a bare leaf
        # name harvests out of writing that names the folder's full path:
        # `journal` reaches `Clippings/journal/a private note.md`. That is
        # the OPPOSITE of case 1 above, where a bare leaf name fences
        # nothing — the belt and the fence genuinely do disagree, and this
        # case says so out loud instead of leaving a later reader to assume
        # they agree.
        # ⛔ IT IS NOT NARROWED HERE. `collectFencedBasenames`'s own comment
        # records the rule: harvesting MORE only ever de-links MORE, so a
        # wider belt can never leak, while a narrower one can. This repair is
        # the separator and nothing else, and narrowing the belt's reach
        # would be exactly the "something else". Pinned so that a later
        # change cannot quietly narrow it either.
        self.assertEqual(
            got["leaf-only"], ["a private note", "second one"],
            "the bare leaf name %r harvested %r where the shipped belt "
            "harvests both notes. Its pattern is deliberately unanchored and "
            "fail-safe in the de-linking direction; narrowing it is not this "
            "repair's business." % (TARGET, got["leaf-only"]))
        # And the same question of the heavy guard: the sibling's folder
        # facet must not become heavy because the target was fenced.
        self.assertEqual(
            _heavy_cap_fired(nested, nested), 1,
            "the nested entry stopped making its own folder read heavy")
        self.assertEqual(
            _heavy_cap_fired(nested, sibling), 0,
            "fencing %r made %r read heavy. The roster half compares the "
            "folder facet WHOLE precisely so that a fenced folder cannot "
            "silently catch its neighbour." % (nested, sibling))

    # -- 10. WHAT IS STORED IS STILL UNCHANGED (her C2 ruling) --------------
    #
    # ⛔ Case 5 above already pins the verbatim store. This one re-asks it
    # from the other end: after routing both surfaces through the shipped
    # spelling, an add of a slashed entry still puts the slash in her list.
    # Her C2 ruling exists so that nothing silently alters what her existing
    # entries cover, and its cost sentence was read back to her verbatim on
    # 22 August: "trimming the slash would also change what her existing
    # entries cover."

    def test_the_repair_did_not_reach_the_add_field(self):
        slashed = PARENT + "/" + TARGET + "/"
        store = {"meta": {"fenced_roster": []}, "items": {}}
        study_lib.add_roster_folder(store, slashed)
        self.assertEqual(
            store["meta"]["fenced_roster"], [slashed],
            "the entry was normalised on the way into her list. ⛔ Her C2 "
            "ruling of 2026-08-20 forbids that: the repair is the two "
            "surfaces that READ the entry, never the field she types into.")

if __name__ == "__main__":
    unittest.main()
