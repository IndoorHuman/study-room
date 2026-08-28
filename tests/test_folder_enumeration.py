#!/usr/bin/env python3
"""The wire contract for the private-folder picker's enumeration (26.96-27).

⛔ WRITTEN BEFORE THE ENUMERATION EXISTS, so its central cases are seen RED
first. The owner ruled (D-A, 2026-08-22, TIER 2 — she chose a written option,
she wrote no prose) that the picker offers EVERY FOLDER IN HER VAULT, AT ANY
DEPTH. The shipped `/api/adapter/vault-folders` route answers TOP-LEVEL names
only, so it does not serve that ruling and a wider listing member is owed.

WHAT THIS FILE PROVES, and why each case earns its place:

  1. DEPTH. A folder nested three deep is offered. The shipped route cannot
     satisfy this, which is why reuse was refused and recorded rather than
     assumed.
  2. NAMES ONLY ON THE WIRE. The serialised answer is searched for a path
     separator AND for every segment of the vault root's own path; both
     searches find nothing, and the searched payload's LENGTH is printed so
     the search is visibly not vacuous. This is what keeps her home directory
     off the wire while the picker still emits a path from the vault root:
     each entry crosses as a LIST OF WHOLE SEGMENTS and the client joins them.
  3. HIDDEN DIRECTORIES ABSENT. `.obsidian/` is never user content.
  4. SYMLINKS REFUSED. A symbolic link to a directory is never descended
     into, inherited from the shipped walker rather than restated here.
  5. THE OFFERED SET IS EXACTLY THE LITERAL SET THE FIXTURE BUILT — a name
     appearing that `setUp` never built, or a name it built going missing,
     turns case 5 red. The count is printed BESIDE the count expected. ⛔ No
     ratio without its numerator.
     ⚠ THIS ROW USED TO CLAIM THE FENCE-REACHABILITY PROPERTY, AND THE CLAIM
     WAS FALSE. Case 5 re-called the shipped predicate with the SAME
     construction the production filter uses, so the equality was tautological
     and the case COULD NOT FAIL. A mutation proved it: `_fence_can_act`
     replaced by `return True` left it green. ⛔ THE REAL GATE for *nothing
     unfenceable is offered* is
     `test_an_injected_unfenceable_name_is_filtered_on_the_server`, which
     injects a name the fence cannot act on and demands the answer drop it —
     and it is the only case here that reddens under that mutant. On an honest
     tree the shipped walker never descends a symbolic link, so nothing
     unfenceable ever enters the enumeration and the filter is never
     exercised. The measured live examples are `assets` and `tokens` — both
     symlinks at her vault's top level, both on the shipped route's answer
     today, and the fence can act on NEITHER
     (`26.96-30-MEASUREMENTS.md` § 3).
  6. A VAULT THE ROOM COULD NOT READ **AT ALL** IS NAMED IN PLAIN WORDS
     rather than answered as a zero-length list standing for a read that
     succeeded. ⚠ UNTIL 26.96-31 THIS CASE WAS MIS-NAMED: it drove a MISSING
     vault, caught by a check that predates this phase, so the failure it
     advertised had never been driven. It now drives a `chmod 000` vault, and
     carries its own readable positive control in the same case.
  6b. A VAULT THAT IS NOT THERE is named in plain words. This is the drive
     case 6 used to do, kept under a name that says what it really is.
  6c. A VAULT THE ROOM COULD READ ONLY **IN PART** — ⛔ NOW A VERDICT, AND IT
     IS HERS. She ruled it on 2026-08-23 at the blocking stop of `26.96-34`,
     question 2 (⛔ TIER 2 — approved as shown: an agent wrote the question and
     the option labels, she picked one, she typed no prose): the room offers
     `Offer nothing until it can read all of it`. ⚠ This case used to be a
     MEASUREMENT that asserted only *does not raise* and said in as many words
     that the state was un-ruled; `26.96-31` wrote down in advance that her
     ruling would FLIP it. It has flipped. ⛔ Making the partial case answer a
     shorter list again is HERS, not a repair.
  8. ⛔ THE DOCSTRING'S CLAIM AGAINST THE BEHAVIOUR IT DESCRIBES. Each of the
     two public members on this path carries ONE machine-readable
     `DOC-BEHAVIOUR-MARK` line, and this case lifts both FROM DISK and drives
     the same path end to end — discriminator, raise, `_ADAPTER_COLLECT_
     ERRORS`, route mapping, status code — printing `stated=` and `driven=`
     for each. ⛔ IT EXISTS BECAUSE BOTH DOCSTRINGS WENT STALE INSIDE ONE
     ROUND: `26.96-31` wrote paragraphs that were true when they landed,
     `26.96-34` widened the discriminator on her ruling, and at `3c78940` both
     public members asserted the OPPOSITE of the shipped behaviour and
     declared her TIER 2 ruling un-taken — twenty lines above a private
     comment reserving the reversal to her. ⛔ A promise in a docstring is no
     more a gate than a count in a comment. ⚠ WHAT IT DOES NOT HOLD, said
     rather than implied: the prose AROUND the marker, and any claim in a
     docstring carrying no marker. Filed at
     `.planning/todos/pending/2026-08-22-doc-behaviour-mark-reach.md`.
  9. ⛔ WHAT AN IMPORT LEAVES BEHIND WHEN A FOLDER WILL NOT OPEN. `collect()`
     is driven against a vault with one unopenable folder and the skip bag is
     read BY VALUE. Her ruling of 2026-08-23 (`26.96-37` Q2, ⛔ TIER 2) was
     *count it and tell you*; the counting is what this case gates. ⛔ THE
     SENTENCE THAT TELLS HER DOES NOT EXIST AND IS HERS — nothing here may be
     read as standing in for it.
  7. NO SECOND DIRECTORY WALK. A labelled SOURCE gate: the listing member's
     own text is read and asserted to contain no traversal of its own — the
     shipped walker is the only traversal, so the hidden-directory pruning and
     the two independent symlink refusals are INHERITED and cannot drift.

⛔ Nothing here reads or writes the owner's real library or her real vault.
Every fixture is synthetic, built under the system temp directory, and removed
in tearDown.

⛔ THE VERDICTS ARE READ OFF THE PRODUCT, never re-expressed here — and this
paragraph used to break its own rule. It offered case 5 as the example, on the
ground that the case ASKS the shipped fence predicate
(`study_lib._origin_under_roster`) rather than re-implementing it. ⛔ ASKING
THE SHIPPED PREDICATE WITH THE SAME CONSTRUCTION THE PRODUCTION FILTER USES IS
NOT INDEPENDENCE, IT IS A MIRROR: the equality was tautological and the case
could not fail. Tenth recorded instance of this project's signature defect.
Case 5 now asserts a LITERAL set instead, and the gate for *nothing
unfenceable is offered* is
`test_an_injected_unfenceable_name_is_filtered_on_the_server`.
"""

import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, __file__.rsplit("/", 2)[0])

import server                               # noqa: E402
import study_lib                            # noqa: E402
from adapters import obsidian_vault as OV   # noqa: E402


# The nested fixture, by value. ⛔ NESTED ON PURPOSE: a top-level fixture
# passes the depth case and the path-not-leaf case either way, so it can never
# fail them and proves nothing about either.
NESTED = ("Clippings", "journal", "chatgpt")


def _touch(path, text="# a note\n"):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def _mode_took(directory):
    """True when a mode change really blocks THIS process, with the reason.

    ⛔ A MUTANT THAT NEVER APPLIED READS EXACTLY LIKE A GATE THAT DOES NOT
    HOLD. That lesson has already cost this project a false SURVIVED verdict,
    so every case here that lowers a mode asks this before reading a verdict,
    and skips with a named reason rather than passing when it did not take."""
    try:
        list(os.scandir(str(directory)))
    except OSError as e:
        return True, type(e).__name__
    return False, "the directory was still readable"


# ---------------------------------------------------------------------------
# CASE 8'S APPARATUS — the docstring claim, and the behaviour it describes.
# ---------------------------------------------------------------------------
# ⛔ A PROMISE IN A DOCSTRING IS NOT A GATE, ANY MORE THAN A COUNT IN A COMMENT
# IS. Both docstrings on this path went stale INSIDE ONE ROUND: `26.96-31`
# wrote paragraphs that were true when they landed, `26.96-34` widened the
# discriminator on her ruling, and neither paragraph was revisited — so at
# `3c78940` the PUBLIC members both asserted the opposite of the shipped
# behaviour AND declared her TIER 2 ruling un-taken, twenty lines above a
# private comment reserving the reversal to her.
#
# ⛔ THE CURE IS THE SAME ONE THIS PROJECT KEEPS RE-LEARNING: give the claim a
# machine-readable form and DRIVE the behaviour it describes, in the same run,
# printing both sides. Nothing below reads a docstring's prose and pronounces
# it correct — that would certify whatever an agent last typed.
_DOC_MARK_RE = re.compile(r"DOC-BEHAVIOUR-MARK:[ \t]+(\S+)[ \t]+(\S+)[ \t]*$")

#: The CLOSED vocabulary, per file. ⛔ A claim outside it is a NAMED failure
#: rather than an unknown that quietly passes: an unrecognised token is how a
#: marker gets edited into something no drive can contradict.
_DOC_MARK_CLAIMS = {
    "adapters/obsidian_vault.py": ("raises", "returns_shorter_list"),
    "server.py": ("http_400", "http_200_partial"),
}

#: Her record, read from the planning repo AT RUN TIME. ⛔ OUTSIDE THIS REPO
#: ON PURPOSE — an expectation that can be edited from inside the tree it
#: gates is not an expectation. Same idiom as `tests/test_roster_pane.cjs`.
PHASE_DIR = (Path(os.path.expanduser("~"))
             / "Library/Mobile Documents/iCloud~md~obsidian/Documents"
             / "Project Tracker/Project Tracker/Claude Project"
             / "Obsidian Visual House/.planning/phases"
             / "26.96-the-roster-pane-the-manage-gaps-f9-exposed-added-"
               "2026-07-31")

# ---------------------------------------------------------------------------
# THE CITED-RULING GATE — A SET DERIVED FROM WHAT IS ACTUALLY CITED (26.96-53).
# ---------------------------------------------------------------------------
# ⛔⛔ WHAT THIS REPLACED, AND WHY IT HAD TO GO. Until `26.96-53` this was a
# SINGLE SCALAR — `RULING_HEADING = "###" + " RULING S"` — asserted at exactly
# one hit inside the doc-mark case. It was genuinely fail-closed for that one
# ruling while citations of OTHER rulings sat in the very same files under no
# gate at all. ⛔ A CHECK SCOPED TO ONE REASON SILENTLY WAIVES EVERYTHING ELSE
# RIDING ON IT, and the waiver is invisible precisely because the one reason
# it does hold keeps reporting green. Round 5 found it (`26.96-VERIFICATION-
# ROUND5.md` gap 5), round 6 re-promoted it (`26.96-VERIFICATION.md` gap 5),
# and it was in NEITHER open-items record until this plan.
#
# ⛔ DRIVEN BEFORE THE FIX, AND THE STARTING STATE RECORDED: with the scalar in
# place, renaming an UNGATED ruling's heading in a SCRATCH COPY of her record
# left the whole suite GREEN — `Ran 14 tests`, `OK`, rc=0 — twice, for two
# different ungated rulings.
#
# ⚠ THE FIRST SPELLING OF THE WHOLE-HEADING CONTROL WAS A BARE SUBSTRING TEST
# AND THE ARM THAT SHOULD FAIL PROVED IT WORTHLESS: renaming a heading to one
# that CONTAINS the old name left the gate green. That discipline is kept for
# EVERY ruling in the set below — the ruling token must be terminated by
# whitespace or end-of-line, never glued to more identifier characters.


class _BrokenInstrument(Exception):
    """The check refuses to draw a verdict, rather than drawing a green one.

    ⛔ RAISED, NEVER SWALLOWED. Every condition that would make the gate
    measure NOTHING — an empty derived set, a scope that lost a file, two
    derivations that disagree — arrives here and stops the check by name. A
    gate that goes green by having nothing to look at is this project's
    most-recorded failure mode; this class is the refusal to be one."""


#: PASS A — a whole-text regular expression. `\s+` deliberately spans
#: newlines, so a citation wrapped across two lines is still seen here.
#: The `(?![\w-])` is the WHOLE-TOKEN discipline: a ruling glued to more
#: identifier characters is a different name and is not this citation.
_RULING_CITE_RE = re.compile(r"\bRULING\s+([A-Z])(?![\w-])")

#: The heading form, built per ruling id. ⛔ WHOLE HEADING, NEVER SUBSTRING.
#: Heading level and letter case are tolerated because her record spells its
#: own ruling headings both ways (`###` + upper for most, `##` + title case
#: for one); what is NOT tolerated is the token running on, which is the
#: exact failure the first spelling of this control walked straight past.
_RULING_HEADING_TEMPLATE = r"^#{1,6}[ \t]+RULING[ \t]+%s(?=[ \t]|$)"

#: ⛔ THE BOUND ON WHAT COUNTS AS A CITATION, STATED WITH ITS REASON RATHER
#: THAN LEFT TO BE INFERRED: only a ruling named by a SINGLE CAPITAL LETTER is
#: in scope, because that is the form `26.96-DECISIONS.md` gives its own
#: ruling headings (N, O, P … X). Other ruling references living in these
#: files — numbered map rulings, `T-3`-style ids, the bare English word —
#: belong to OTHER records that this gate does not read, and gating them
#: against this record would manufacture failures rather than find them.

#: The modules whose files are under gate, keyed by the SAME labels the
#: doc-mark vocabulary uses. ⛔ THE SCOPE IS DERIVED FROM `_DOC_MARK_CLAIMS`,
#: never typed a second time: a file that enters or leaves the doc-mark
#: vocabulary without entering or leaving here is a NAMED failure below, not a
#: quiet subtraction from what gets scanned.
_GATED_MODULES = {"adapters/obsidian_vault.py": OV, "server.py": server}


def _cites_pass_a(text):
    """Every ruling citation in `text` as (ruling_id, line_number).

    Shape: one regular expression over the WHOLE text."""
    return [(m.group(1), text.count("\n", 0, m.start()) + 1)
            for m in _RULING_CITE_RE.finditer(text)]


def _head_run(token):
    """The first run of identifier characters in `token`, and the character
    that ends it (or `""` at end of token). Leading punctuation is stepped
    over first.

    ⚠ THE LEADING-PUNCTUATION STEP WAS NOT HERE WHEN THIS PASS WAS FIRST
    WRITTEN, AND THE CROSS-PASS CAUGHT IT: pass B could not see a citation
    that opened with a bracket or a quote and came up THREE SHORT out of
    sixteen, while every count it printed looked clean. ⛔ That is the
    narrowed lift this arm exists to make loud, found by the arm itself on its
    first real run rather than by reading the code."""
    i = 0
    while i < len(token) and not (token[i].isalnum() or token[i] == "_"):
        i += 1
    j = i
    while j < len(token) and (token[j].isalnum() or token[j] == "_"):
        j += 1
    return token[i:j], (token[j] if j < len(token) else "")


def _cites_pass_b(text):
    """The same set, derived a DIFFERENT WAY — line by line, by whitespace
    tokenisation and leading-identifier-run extraction, with no regular
    expression anywhere.

    ⛔ THIS IS THE NARROWED-LIFT ARM AND IT IS THE REASON THIS PAIR EXISTS. A
    scrape that comes up SHORT — one spelling it cannot see, one shape it does
    not expect — would produce a gate that passes CONFIDENTLY over an ungated
    citation, which is precisely the defect this whole check was written to
    end, reproduced by its own fix. A failed lift is loud; a NARROWED lift
    prints a clean count. Two differently-shaped derivations that must agree
    is what makes a narrowing loud."""
    out = []
    for lineno, line in enumerate(text.splitlines(), 1):
        toks = line.split()
        for i, tok in enumerate(toks):
            head, after = _head_run(tok)
            if head != "RULING" or after in ("'", "-"):
                continue
            if i + 1 >= len(toks):
                continue
            nxt, nxt_after = _head_run(toks[i + 1])
            if len(nxt) == 1 and "A" <= nxt <= "Z" and nxt_after != "-":
                out.append((nxt, lineno))
    return out


def _ruling_heading_hits(record_text, ruling_id):
    """Every WHOLE heading in her record naming `ruling_id`, verbatim."""
    pattern = _RULING_HEADING_TEMPLATE % (re.escape(ruling_id),)
    return [m.group(0).strip() for m in
            re.finditer(pattern, record_text, re.MULTILINE | re.IGNORECASE)]


def _files_under_gate():
    """The scanned scope, DERIVED. Returns [(label, Path), ...].

    ⛔ A FILE THAT SILENTLY LEAVES THE SCOPE IS A NAMED FAILURE, not a quiet
    subtraction — every path is asserted to exist and to be readable here,
    before anything is scanned."""
    if set(_GATED_MODULES) != set(_DOC_MARK_CLAIMS):
        raise _BrokenInstrument(
            "⛔ BROKEN INSTRUMENT: the doc-mark vocabulary %r and the gated "
            "modules %r name different files, so the citation scrape would "
            "scan a scope nobody chose"
            % (sorted(_DOC_MARK_CLAIMS), sorted(_GATED_MODULES)))
    out = [(label, Path(_GATED_MODULES[label].__file__).resolve())
           for label in sorted(_DOC_MARK_CLAIMS)]
    # ⛔ AND THIS FILE ITSELF. Round 5 measured the ungated citations across
    # THREE files, and this test file is the third: its own prose cites her
    # rulings too, and a gate that exempts the file it lives in is a gate with
    # a hole exactly where an agent types.
    out.append(("tests/" + Path(__file__).name, Path(__file__).resolve()))
    for label, path in out:
        if not path.is_file() or not os.access(str(path), os.R_OK):
            raise _BrokenInstrument(
                "⛔ BROKEN INSTRUMENT: %s (%s) is not a readable file, so the "
                "citation scrape would come up short WITHOUT SAYING SO"
                % (label, path))
    return out


def _cited_ruling_verdict(scope, record_text):
    """The whole cited-ruling derivation, in one place, for one record.

    Returns a dict of everything measured. Raises `_BrokenInstrument` rather
    than returning a verdict whenever the derivation cannot be trusted."""
    per_file, hits_a, hits_b = [], [], []
    for label, path in scope:
        text = path.read_text(encoding="utf-8")
        a = _cites_pass_a(text)
        b = _cites_pass_b(text)
        per_file.append({"label": label, "chars": len(text),
                         "pass_a": a, "pass_b": b})
        hits_a.extend([(label,) + h for h in a])
        hits_b.extend([(label,) + h for h in b])
    if hits_a != hits_b:
        only_a = [h for h in hits_a if h not in hits_b]
        only_b = [h for h in hits_b if h not in hits_a]
        raise _BrokenInstrument(
            "⛔ BROKEN INSTRUMENT: the two citation derivations disagree. "
            "Pass A found %d, pass B found %d; only-A=%r only-B=%r. One of "
            "them has come up SHORT, and a short scrape gates fewer rulings "
            "than are really cited while still reporting a clean count — the "
            "very defect this check exists to end"
            % (len(hits_a), len(hits_b), only_a, only_b))
    derived = sorted({h[1] for h in hits_a})
    if not derived:
        raise _BrokenInstrument(
            "⛔ BROKEN INSTRUMENT: the derived ruling set is EMPTY over %d "
            "file(s) totalling %d characters. A scrape that finds no citation "
            "at all gates NOTHING and would report clean; no verdict is drawn "
            "from it" % (len(per_file), sum(f["chars"] for f in per_file)))
    resolved, unresolved = {}, []
    for rid in derived:
        found = _ruling_heading_hits(record_text, rid)
        resolved[rid] = found
        if len(found) != 1:
            unresolved.append(rid)
    return {"scope": [lbl for lbl, _ in scope], "per_file": per_file,
            "derived": derived, "resolved": resolved,
            "unresolved": unresolved, "citations": hits_a,
            "record_chars": len(record_text)}


def _record_path():
    return PHASE_DIR / "26.96-DECISIONS.md"


def _lift_doc_marks(path):
    """Every `DOC-BEHAVIOUR-MARK: <subject> <claim>` line in `path`, as
    (line number, subject, claim), lifted FROM DISK.

    ⛔ FROM DISK, never from an imported docstring object: a marker deleted
    from the file but still present in a stale `.pyc` would read as a marker
    that holds."""
    out = []
    text = Path(path).read_text(encoding="utf-8")
    for lineno, line in enumerate(text.splitlines(), 1):
        m = _DOC_MARK_RE.search(line)
        if m:
            out.append((lineno, m.group(1), m.group(2)))
    return out


class _RulingRecorderStub:
    """The narrowest object `StudyHandler.handle_vault_folder_paths` really
    needs, recording what the route decided instead of writing a socket.

    ⛔ NO HTTP AND NO SERVER. The route is driven as a plain method so the
    thing under test is its own mapping — adapter raise -> `_ADAPTER_COLLECT_
    ERRORS` -> a status code — and not a transport that could answer for it.
    ⛔ The error TYPES are imported from `server` at run time and never
    re-typed here; a tuple typed into a test agrees with any drift in the
    shipped one."""

    class _Server(object):
        def __init__(self, library_root):
            self.library_root = str(library_root)

    def __init__(self, library_root):
        self.server = self._Server(library_root)
        self.recorded = []

    def json_error(self, code, msg):
        self.recorded.append(("json_error", code, msg))

    def json_response(self, data, code=200):
        self.recorded.append(("json_response", code, data))

    def last(self):
        return self.recorded[-1] if self.recorded else (None, None, None)


def _drive_route(library_root):
    """Drive the real route against a recorder and return the stub."""
    stub = _RulingRecorderStub(library_root)
    server.StudyHandler.handle_vault_folder_paths(stub)
    return stub


def _claim_for_status(code):
    """The route's driven outcome IN THE MARKER'S OWN VOCABULARY.

    ⛔ NOT A BOOLEAN. A boolean cannot disagree with a marker that names the
    wrong shape; only a value drawn from the same closed vocabulary can."""
    return {400: "http_400", 200: "http_200_partial"}.get(code)


def _drive_partial_read(vault, library_root, folder="Journal"):
    """ONE folder unopenable inside an otherwise readable vault, driven TWICE
    in the SAME window: through the adapter's public listing member, and
    through the route's own mapping onto a status code.

    Returns a plain dict. ⛔ `took` is answered by the file's own `_mode_took`
    BEFORE any outcome is recorded, and the mode bits are restored in a
    `finally` — a drill that never applied reads exactly like a gate that does
    not hold, and that has already cost this project a false verdict."""
    target = Path(vault) / folder
    rec = {"took": False, "why": "", "adapter_claim": None,
           "adapter_error": None, "adapter_answer": None,
           "server_claim": None, "server_code": None, "recorded": []}
    os.chmod(str(target), 0o000)
    try:
        rec["took"], rec["why"] = _mode_took(target)
        if not rec["took"]:
            return rec
        try:
            rec["adapter_answer"] = OV.list_folder_paths(vault_root=str(vault))
            rec["adapter_claim"] = "returns_shorter_list"
        except OV.VaultCollectError as e:
            rec["adapter_error"] = e
            rec["adapter_claim"] = "raises"
        stub = _drive_route(library_root)
        rec["recorded"] = list(stub.recorded)
        rec["server_code"] = stub.last()[1]
        rec["server_claim"] = _claim_for_status(rec["server_code"])
    finally:
        os.chmod(str(target), 0o755)
    return rec


# ---------------------------------------------------------------------------
# CASE 10'S APPARATUS — the walker's error hook, captured and driven (26.96-53).
# ---------------------------------------------------------------------------
# ⛔ WHY THIS EXISTS. `26.96-43` gave the walk-error callback a safety posture
# and STATED IT THREE TIMES in the source: it FAILS TOWARD NOT COUNTING. An
# error whose path is absent, empty, of the wrong type, or outside the vault
# root is not counted, because the code takes the answer that invents nothing
# until she rules. ⛔ NO TEST ASSERTED IT. The round-6 verifier mutated the
# branch to count instead and the whole suite returned `Ran 14 tests, OK` —
# the mutant walked past every arm.
#
# ⛔ WHAT THE MUTANT DOES, WHICH IS WHY THIS DOOR IS WORTH WATCHING: a
# filename-less walker error becomes an `unreadable` count in the very bag
# `server.py` copies WHOLE into the progress report the browser polls. That is
# the `CR-01` failure mode — a number the room shows her that was never
# derived from anything she can see — re-entering through the one door nothing
# watched.
#
# ⛔ THE HOOK IS THE SHIPPED ONE. Nothing here re-implements the callback: the
# real closure, with the real `root` and the real exclusion segments, is
# captured as `collect()` hands it to the walker, then fed errors and its
# effect read back out of the real bag `collect()` returns.


class _FeedWalkErrors(object):
    """Capture the `onerror` hook `collect()` hands the walker, feed it a list
    of errors, then let the real walk proceed.

    ⛔ THE REAL WALK STILL RUNS. A wrapper that answered for the walker would
    make every figure below a figure about the wrapper."""

    def __init__(self, errors):
        self.errors = errors
        self.captured = []

    def __enter__(self):
        self._real = OV.study_lib.walk_source
        real, errors, captured = self._real, self.errors, self.captured

        def wrapper(src_root, onerror=None):
            captured.append(onerror)
            if onerror is not None:
                for err in errors:
                    onerror(err)
            return real(src_root, onerror=onerror)

        OV.study_lib.walk_source = wrapper
        return self

    def __exit__(self, *exc):
        OV.study_lib.walk_source = self._real
        return False


class _ErrorWithNoFilename(Exception):
    """A walker error carrying no `filename` attribute at all."""


def _walk_error(filename):
    """An `OSError` shaped like the one `os.walk` hands `onerror`."""
    err = OSError(13, "Permission denied")
    err.filename = filename
    return err


class FolderEnumerationWire(unittest.TestCase):
    """One synthetic vault, built once per case, torn down after."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="folder-enum-")
        self.vault = Path(self.tmp) / "vault"
        # depth 1..3, each level carrying a real importable note so the
        # shipped walker really reaches it
        _touch(self.vault / "Clippings" / "top.md")
        _touch(self.vault / "Clippings" / "journal" / "mid.md")
        _touch(self.vault / "Clippings" / "journal" / "chatgpt" / "deep.md")
        _touch(self.vault / "Journal" / "diary.md")
        # hidden: never user content
        _touch(self.vault / ".obsidian" / "workspace.md")
        # a symbolic link to a real directory elsewhere in the same vault --
        # the shape of her real `assets` and `tokens`
        os.symlink(str(self.vault / "Journal"), str(self.vault / "shortcut"))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def answer(self):
        return OV.list_folder_paths(vault_root=str(self.vault))

    # -- 1 -----------------------------------------------------------------
    def test_a_folder_three_deep_is_offered(self):
        got = self.answer()
        print("  [depth] offered=%d %s" % (len(got), json.dumps(got[:8])))
        self.assertIn(list(NESTED), got,
                      "her D-A ruling is EVERY folder at ANY depth; the "
                      "nested folder is absent from the answer")
        self.assertIn(["Clippings"], got)
        self.assertIn(["Clippings", "journal"], got)

    # -- 2 -----------------------------------------------------------------
    def test_the_wire_carries_names_only(self):
        # ⛔ THE SEARCH IS OVER THE DATA, NOT THE ENVELOPE, and the reason is a
        # real finding this case produced on its first RED run rather than a
        # convenience. On macOS `tempfile` builds fixtures under
        # `/var/folders/…`, so the vault root's own segments include the
        # literal word `folders` -- which is also the name of THIS ROUTE'S
        # OWN KEY. Searching the envelope therefore reddened on a key an agent
        # typed, not on anything of hers that crossed. ⛔ The gate is NOT
        # widened to let that word through: it is pointed at the payload the
        # contract is actually about, where a leaked segment would still be
        # caught. The separator search below keeps the whole envelope.
        data = json.dumps(self.answer(), ensure_ascii=False)
        payload = json.dumps({"ok": True, "folders": self.answer()},
                             ensure_ascii=False)
        # ⛔ PRINTED SO THE SEARCH IS VISIBLY NOT VACUOUS. A search over an
        # empty payload finds nothing too.
        print("  [wire] payload_len=%d data_len=%d" % (len(payload), len(data)))
        self.assertGreater(len(data), 20,
                           "the folder payload is too small to have carried "
                           "the fixture")
        self.assertGreater(len(payload), 40,
                           "the searched payload is too small to have "
                           "carried the fixture -- the two searches below "
                           "would be passes over nothing")
        self.assertNotIn("/", payload,
                         "a path separator crossed the wire: entries must "
                         "cross as lists of WHOLE SEGMENTS, never joined")
        self.assertNotIn("\\", payload)
        for seg in Path(self.vault).resolve().parts:
            if seg in ("/", ""):
                continue
            self.assertNotIn(seg, data,
                             "a segment of the vault root's own path (%r) "
                             "crossed the wire -- that names her home "
                             "directory" % seg)

    # -- 3 -----------------------------------------------------------------
    def test_hidden_directories_are_absent(self):
        got = self.answer()
        for entry in got:
            self.assertFalse(any(s.startswith(".") for s in entry),
                             "a hidden directory reached the picker: %r"
                             % (entry,))

    # -- 4 -----------------------------------------------------------------
    def test_a_symlinked_directory_is_never_offered(self):
        """⚠ IT PASSES FOR A REASON ITS MESSAGE USED TO GET WRONG, and the
        message now names the real one.

        `shortcut` is absent because THE SHIPPED WALKER NEVER DESCENDS A
        SYMBOLIC LINK: no importable file is ever found beneath it, so it
        never becomes any candidate's parent and never enters the enumeration
        at all. The fence filter never even sees the name. The old message
        credited the fence, which does not act here.

        ⛔ THE FIXTURE IS NOT CHANGED TO MAKE THE OLD REASON TRUE. Authoring a
        stronger claim than the code supports is the defect this correction
        exists to end, not a way to close it."""
        got = self.answer()
        self.assertNotIn(["shortcut"], got,
                         "a symbolic link was offered. It is absent because "
                         "NOTHING IMPORTABLE WAS FOUND BENEATH IT -- the "
                         "shipped walker does not descend a symbolic link -- "
                         "and NOT because the fence refused it: on an honest "
                         "tree the fence filter never sees this name at all")

    # -- 5 -----------------------------------------------------------------
    def test_the_offered_set_is_exactly_the_literal_set_the_fixture_built(self):
        """⚠ THIS CASE USED TO MIRROR THE PRODUCTION FILTER AND COULD NOT FAIL.

        It re-called `study_lib._origin_under_roster` with the SAME entry and
        probe construction `_fence_can_act` uses, so the equality was
        tautological. The review proved it by mutation: `_fence_can_act`'s
        body replaced by `return True` left this case GREEN while the
        neighbouring injection case went RED -- and the mutation was asserted
        to have moved the file before the verdict was read. ⛔ THE PROJECT'S
        SIGNATURE DEFECT, TENTH RECORDED INSTANCE.

        ⛔ IT NOW ASSERTS AGAINST A LITERAL SET KNOWABLE FROM `setUp` ALONE --
        something the production filter does not compute. A literal
        expectation cannot agree with a defect in the predicate.

        ⚠ IT IS NOT THE GATE FOR FENCE-REACHABILITY AND IS NO LONGER OFFERED
        AS ONE. On an honest tree the shipped walker never descends a symbolic
        link, so nothing unfenceable ever enters the enumeration and the
        filter is never exercised at all;
        `test_an_injected_unfenceable_name_is_filtered_on_the_server` is that
        property's real gate. What THIS case gates is the offered set itself:
        a name appearing that `setUp` never built, or a name it built going
        missing."""
        got = self.answer()
        # ⛔ THE EXPECTATION IS A LITERAL, READ OFF `setUp` BY HAND. Every
        # entry below is a folder the fixture really builds, with a real
        # importable note in it; `.obsidian` is absent because it is hidden
        # and `shortcut` is absent because nothing importable lies beneath it.
        expected = [["Clippings"],
                    ["Clippings", "journal"],
                    ["Clippings", "journal", "chatgpt"],
                    ["Journal"]]
        # ⛔ THE COUNT PRINTED BESIDE ITS NUMERATOR. No figure without the
        # thing it is a figure of.
        print("  [offered] offered=%d expected=%d %s"
              % (len(got), len(expected), json.dumps(got)))
        self.assertEqual(
            got, expected,
            "the offered set is not the set the fixture built. Either a name "
            "`setUp` never created reached the picker, or a folder it did "
            "create went missing -- and on the room's strongest privacy "
            "control a list that quietly shrinks is worse than no list")
        self.assertNotIn(["shortcut"], got,
                         "the symbolic link reached the picker")

    def test_an_injected_unfenceable_name_is_filtered_on_the_server(self):
        """⛔ THE FILTER IS DRIVEN, NOT ASSUMED. The shipped walker never
        descends a symlink, so on an honest tree the filter is never exercised
        and a deleted filter would read exactly like a filter that holds. This
        case injects a non-actionable name into the enumeration's own source
        and demands the answer drop it."""
        real = OV._folder_segments_from_walk

        def injected(root):
            out = real(root)
            out.add(("shortcut",))
            return out

        OV._folder_segments_from_walk = injected
        try:
            got = self.answer()
        finally:
            OV._folder_segments_from_walk = real
        print("  [inject] offered=%d shortcut_present=%s"
              % (len(got), ["shortcut"] in got))
        self.assertGreater(len(got), 0, "nothing was offered at all")
        self.assertNotIn(["shortcut"], got,
                         "a name the fence cannot act on survived into the "
                         "picker's answer. A row that looks like protection "
                         "and protects nothing is the defect the picker "
                         "exists to end")

    # -- 6 -----------------------------------------------------------------
    def test_a_vault_it_could_not_read_at_all_is_named_in_plain_words(self):
        """⛔ THE CASE NAMED FOR AN UNREADABLE VAULT NOW DRIVES ONE.

        Until 26.96-31 this name drove a MISSING vault -- caught by the
        adapter's own vault-root directory check, a path that PREDATES this
        phase -- so the failure the name advertised had never been driven at
        all, and a wholly unreadable vault quietly answered a zero-length list
        that travelled as *the read succeeded*. The missing-vault drive is not
        lost: it is kept in the case below, under a name that says what it is.
        """
        # ⛔ THE POSITIVE CONTROL LIVES IN THIS SAME CASE. Without it a fixture
        # that silently built nothing would make the raise-assertion below
        # pass for the wrong reason -- this project has recorded bare
        # zero-assertions passing vacuously because the query root was wrong.
        before = self.answer()
        print("  [wholly/control] readable_before=%d %s"
              % (len(before), json.dumps(before)))
        self.assertIn(["Journal"], before,
                      "the fixture built nothing readable, so the raise "
                      "asserted below would hold for the wrong reason")
        self.assertIn(["Clippings"], before,
                      "the fixture built nothing readable, so the raise "
                      "asserted below would hold for the wrong reason")

        os.chmod(str(self.vault), 0o000)
        try:
            took, why = _mode_took(self.vault)
            print("  [wholly/chmod] took=%s (%s)" % (took, why))
            if not took:
                self.skipTest(
                    "chmod 000 does not block this process (%s) -- running as "
                    "root, or a filesystem that ignores the mode. ⛔ SKIPPED "
                    "RATHER THAN PASSED: a mutation that never applied reads "
                    "exactly like a gate that does not hold" % why)
            with self.assertRaises(OV.VaultCollectError) as caught:
                self.answer()
            said = str(caught.exception)
            print("  [wholly] said=%r reason=%r"
                  % (said, caught.exception.reason))
            self.assertTrue(said.strip(),
                            "a vault the room could not read AT ALL said "
                            "nothing -- a zero-length list is standing for a "
                            "read that succeeded, and the page will speak "
                            "about her vault on the strength of the room's "
                            "own failure to look")
            self.assertNotIn(str(self.vault), said,
                             "the plain words named the path -- a message "
                             "that names her filesystem is the disclosure "
                             "this route exists to avoid")
            self.assertNotIn(self.tmp, said,
                             "the plain words named the fixture's own "
                             "directory, which stands for her home directory")
            self.assertNotIn("Traceback", said)
        finally:
            # ⛔ RESTORED HERE, NOT LEFT TO tearDown. `shutil.rmtree` runs with
            # ignore_errors=True, so a directory left at 000 leaks a temp tree
            # AND hides the leak.
            os.chmod(str(self.vault), 0o755)

    # -- 6b ----------------------------------------------------------------
    def test_a_vault_that_is_not_there_is_named_in_plain_words(self):
        """⚠ THIS IS THE DRIVE THE CASE ABOVE USED TO DO, KEPT AND HONESTLY
        NAMED. A directory that is not there is caught by the adapter's own
        vault-root check, which predates this phase. It is NOT the
        wholly-unreadable path, and the file no longer claims it is."""
        missing = str(Path(self.tmp) / "gone")
        with self.assertRaises(OV.VaultCollectError) as caught:
            OV.list_folder_paths(vault_root=missing)
        said = str(caught.exception)
        print("  [missing] said=%r reason=%r"
              % (said, caught.exception.reason))
        self.assertTrue(said.strip(), "a vault that is not there said nothing")
        self.assertNotIn(missing, said,
                         "the plain words named the path -- a message that "
                         "names her filesystem is the disclosure this route "
                         "exists to avoid")
        self.assertNotIn("Traceback", said)

    # -- 6c ----------------------------------------------------------------
    def test_a_vault_it_could_read_only_in_part_offers_nothing(self):
        """⛔⛔ A VERDICT, AND IT IS HERS. She ruled this on 2026-08-23 at the
        blocking stop of `26.96-34`, question 2, ⛔ TIER 2 — approved as shown:
        an agent wrote the question and the option labels and she picked one;
        she typed no prose.

            Q: "When the room can read most of your vault but cannot open one
                folder, what should it offer you?"
            SHE CHOSE: `Offer nothing until it can read all of it`
            The cost she was shown: "one folder unavailable for a moment
            empties the whole list for that visit, with nothing said. Your
            vault is very large and on iCloud, so that will happen."

        ⚠ THIS CASE USED TO BE A MEASUREMENT AND SAID SO. It asserted only that
        the partial case did NOT raise, printed the shorter list, and recorded
        the state as UN-RULED and routed to her stop. ⛔ It is no longer open:
        the assertion has FLIPPED, which `26.96-31` wrote down in advance as
        the expected consequence of exactly this ruling.

        ⛔ A FUTURE CHANGE THAT MAKES THE PARTIAL CASE ANSWER A SHORTER LIST
        AGAIN MUST GO THROUGH HER. It is not a repair and it is not an
        optimisation: it changes what she is offered on the room's strongest
        privacy control, and a list that quietly shrank is what this phase's
        contract calls worse than no list at all.

        ⛔ AND IT SAYS NOTHING TO HER WHEN IT HAPPENS. That silence is her
        decision — option B's own cost line — not a gap nobody has got to."""
        # Fixture integrity, not an endorsement: `Journal` must be readable
        # BEFORE the mode drops, or the raise asserted below would hold for the
        # wrong reason.
        before = self.answer()
        self.assertIn(["Journal"], before,
                      "the fixture never built a readable `Journal`, so the "
                      "raise asserted below would hold for the wrong reason")
        self.assertIn(["Clippings"], before,
                      "the fixture never built a readable `Clippings`, so the "
                      "raise asserted below would hold for the wrong reason")
        target = self.vault / "Journal"
        os.chmod(str(target), 0o000)
        try:
            took, why = _mode_took(target)
            print("  [partial/chmod] took=%s (%s)" % (took, why))
            if not took:
                self.skipTest(
                    "chmod 000 does not block this process (%s) -- running as "
                    "root, or a filesystem that ignores the mode. ⛔ SKIPPED "
                    "RATHER THAN PASSED" % why)
            raised = None
            got = None
            try:
                got = self.answer()
            except OV.VaultCollectError as e:
                raised = e
            # ⛔ THE DRIVE, BY VALUE, WITH ITS NUMERATOR BESIDE IT. The control
            # is printed so a run in which the fixture built nothing is VISIBLE
            # rather than inferred.
            print("  [partial] control=%d %s"
                  % (len(before), json.dumps(before)))
            print("  [partial] answer=%s"
                  % (json.dumps(got) if got is not None else "<raised>"))
            self.assertIsNotNone(
                raised,
                "⛔ A PARTIALLY UNREADABLE VAULT ANSWERED A SHORTER LIST "
                "INSTEAD OF RAISING. She ruled on 2026-08-23 (26.96-34 "
                "question 2, TIER 2) that the room offers NOTHING until it "
                "can read the whole vault. It answered %r instead -- and a "
                "list that quietly shrank is the one outcome her ruling "
                "exists to prevent." % (got,))
            said = str(raised)
            print("  [partial] said=%r reason=%r" % (said, raised.reason))
            self.assertTrue(said.strip(),
                            "the raise carried no words at all")
            # ⛔ 26.96-31'S NO-PATH ASSERTION, RE-RUN BY VALUE ON THE NEW ARM.
            # `os.walk` hands the error callback an OSError whose filename is a
            # path INSIDE her vault. Nothing derived from it may ride out on
            # this message.
            self.assertNotIn(str(self.vault), said,
                             "the plain words named the path -- a message "
                             "that names her filesystem is the disclosure "
                             "this route exists to avoid")
            self.assertNotIn(self.tmp, said,
                             "the plain words named the fixture's own "
                             "directory, which stands for her home directory")
            self.assertNotIn("Journal", said,
                             "the plain words named the folder it could not "
                             "open -- a folder NAME out of her vault is the "
                             "same disclosure as a path")
            self.assertNotIn("Traceback", said)
        finally:
            os.chmod(str(target), 0o755)

    # -- 8 -----------------------------------------------------------------
    def library_remembering_the_vault(self):
        """A library whose store already remembers this fixture vault -- the
        real sequence the route depends on. ⛔ The library sits BESIDE the
        vault, never inside it: `study_lib.validate_source_path` refuses a
        source that lives under the library."""
        library = Path(self.tmp) / "library"
        library.mkdir(parents=True, exist_ok=True)
        store = study_lib.new_store(str(library))
        store["meta"]["vault_root"] = str(self.vault)
        study_lib.save_store(str(library), store)
        return library

    def test_every_ruling_cited_in_the_files_under_gate_is_in_her_record(self):
        """⛔ THE CITED-RULING GATE, KEYED BY A SET DERIVED FROM WHAT IS
        ACTUALLY CITED — not by a scalar naming one ruling.

        ⛔ WHY THIS EXISTS. The check that stood here was fail-closed for ONE
        ruling and asserted at exactly one hit, while citations of OTHER
        rulings sat in the very same files under no gate at all. A gate waived
        for one reason silently waives everything else riding on it, and the
        waiver is invisible because the one reason it does hold keeps
        reporting green. Driven before the fix, twice, on two different
        ungated rulings: renaming the heading in a SCRATCH COPY of her record
        left the whole suite green.

        ⛔ HER RECORD IS READ AND NEVER WRITTEN. It is read from the planning
        repo at run time, OUTSIDE this tree on purpose — an expectation that
        can be edited from inside the tree it gates is not an expectation —
        and every mutation drill this gate has ever been put through ran on a
        COPY, with the real file's diff asserted empty by value afterwards.

        ⛔ WHAT THIS DOES **NOT** HOLD, said rather than implied. It gates that
        a cited ruling EXISTS as a whole heading in her record. It does not
        read, quote, summarise or assert anything about the SENTENCES those
        rulings are about — several of which are owed to her and may not be
        written by any agent. Heading names in, heading names out."""
        record = _record_path()
        self.assertTrue(
            record.is_file(),
            "⛔ her record is not readable at %s -- this gate has no "
            "expectation and must not invent one" % (record,))
        record_text = record.read_text(encoding="utf-8")
        scope = _files_under_gate()

        # ⛔ THE SCOPE AND THE FINDINGS, PRINTED BY VALUE ON EVERY RUN, RED OR
        # GREEN, PER FILE. A printed figure is what lets a reader see the
        # scrape stop working WITHOUT an assertion having to fail.
        verdict = _cited_ruling_verdict(scope, record_text)
        for f in verdict["per_file"]:
            print("  [cited/scope] %s chars=%d citations=%d by_id=%s"
                  % (f["label"], f["chars"], len(f["pass_a"]),
                     json.dumps(dict((rid, [ln for r, ln in f["pass_a"]
                                            if r == rid])
                                     for rid in sorted(set(
                                         r for r, _ in f["pass_a"]))),
                                sort_keys=True)))
        print("  [cited/derived] set=%r total_citations=%d record_chars=%d"
              % (verdict["derived"], len(verdict["citations"]),
                 verdict["record_chars"]))
        for rid in verdict["derived"]:
            print("  [cited/heading] %r -> %r"
                  % (rid, verdict["resolved"][rid]))

        # -- ARM 1: the derivation cannot come up EMPTY in silence -----------
        # ⛔ DRIVEN, not merely written: a scope holding a file with no
        # citation at all must make the check REFUSE, never pass.
        blank = Path(self.tmp) / "no-citations.txt"
        blank.write_text("a file that names no ruling of hers at all\n",
                         encoding="utf-8")
        with self.assertRaises(_BrokenInstrument) as vac:
            _cited_ruling_verdict([("scratch/blank", blank)], record_text)
        print("  [cited/anti-vacuity] refused=%r"
              % (str(vac.exception).splitlines()[0][:120],))
        self.assertIn("EMPTY", str(vac.exception),
                      "an empty derived set must refuse BY NAME, so a reader "
                      "cannot mistake the refusal for a pass")

        # -- ARM 2: a NARROWED lift is as loud as a failed one ---------------
        # ⛔ THE ARM THIS WHOLE FIX TURNS ON. A scrape that comes up SHORT
        # would gate fewer rulings than are cited while still printing a clean
        # count. Driven with a citation only ONE of the two passes can see: a
        # wrapped one, which the whole-text pass reads across the newline and
        # the line-bound pass cannot.
        wrapped = Path(self.tmp) / "wrapped-citation.txt"
        wrapped.write_text("%s\n    %s is cited across a line break\n"
                           % ("RUL" "ING", "Z"), encoding="utf-8")
        seen_a = _cites_pass_a(wrapped.read_text(encoding="utf-8"))
        seen_b = _cites_pass_b(wrapped.read_text(encoding="utf-8"))
        print("  [cited/cross-pass] wrapped fixture pass_a=%r pass_b=%r"
              % (seen_a, seen_b))
        self.assertNotEqual(
            seen_a, seen_b,
            "the disagreement fixture did not actually make the two passes "
            "disagree, so the arm below would pass for the wrong reason")
        with self.assertRaises(_BrokenInstrument) as dis:
            _cited_ruling_verdict([("scratch/wrapped", wrapped)], record_text)
        print("  [cited/cross-pass] refused=%r"
              % (str(dis.exception).splitlines()[0][:120],))
        self.assertIn("disagree", str(dis.exception),
                      "a disagreement between the two derivations must be a "
                      "NAMED broken instrument that stops the check")

        # -- THE VERDICT ----------------------------------------------------
        # ⛔ A CITATION WITH NO MATCHING WHOLE HEADING IS A NAMED FAILURE
        # IDENTIFYING THE RULING AND THE FILE THAT CITES IT. ⛔ Nothing is
        # removed from the derived set to make this run green — that single
        # move would make the whole gate false.
        if verdict["unresolved"]:
            named = []
            for rid in verdict["unresolved"]:
                where = ["%s:%d" % (lbl, ln)
                         for lbl, r, ln in verdict["citations"] if r == rid]
                named.append("%r cited at %s -> %d whole headings"
                             % (rid, ", ".join(where),
                                len(verdict["resolved"][rid])))
            self.fail(
                "⛔ A RULING CITED IN THE FILES UNDER GATE DOES NOT RESOLVE "
                "TO EXACTLY ONE WHOLE HEADING IN HER RECORD (%s). %s. ⛔ The "
                "citation is not removed from the derived set to clear this: "
                "a gate that drops what it cannot satisfy is the waiver this "
                "check was written to end"
                % (record, "; ".join(named)))

        # -- ARM 3: the whole-heading discipline, kept ----------------------
        # ⛔ A RENAME THAT **CONTAINS** THE ORIGINAL MUST NOT RESOLVE. The
        # first spelling of this control was a bare substring test and driving
        # exactly this rename proved it worthless. Driven here on a scratch
        # copy of the record text held IN MEMORY — her file is never written.
        # ⛔ RUN AFTER THE VERDICT ON PURPOSE: every figure below is a
        # difference between a resolving record and a renamed one, and the
        # verdict above is what guarantees the first half of that pair.
        # ⛔ LENGTHS, NEVER WHOLE TEXTS, IN EVERY MESSAGE HERE: a failed
        # comparison of two 100,000-character records buries the one sentence
        # a reader needs under the record itself.
        for rid in verdict["derived"]:
            before = len(_ruling_heading_hits(record_text, rid))
            renamed = re.sub(_RULING_HEADING_TEMPLATE % (re.escape(rid),),
                             lambda m: m.group(0) + "-RENAMED",
                             record_text, flags=re.MULTILINE | re.IGNORECASE)
            self.assertNotEqual(
                len(renamed), len(record_text),
                "the scratch rename of %r changed nothing (%d headings found "
                "before it), so the arm below would hold for the wrong reason"
                % (rid, before))
            after = _ruling_heading_hits(renamed, rid)
            print("  [cited/rename] %r whole_heading_hits before=%d "
                  "after-renaming-to-a-heading-that-CONTAINS-it=%d"
                  % (rid, before, len(after)))
            self.assertEqual(
                before, 1,
                "the unrenamed record does not resolve %r exactly once (%d), "
                "so the zero below says nothing" % (rid, before))
            self.assertEqual(
                len(after), 0,
                "⛔ SUBSTRING FAILURE MODE REINTRODUCED: %r still resolves "
                "(%d) after its heading was renamed to one that CONTAINS it. "
                "That is the exact defect a driven rename found the first "
                "time this control was written" % (rid, len(after)))

    def test_the_docstrings_claim_what_the_code_is_driven_to_do(self):
        """⛔ THE CLAIM IS COMPARED AGAINST THE BEHAVIOUR IT DESCRIBES, IN ONE
        RUN, END TO END — discriminator, raise, error tuple, route mapping,
        status code — with both sides printed BY VALUE.

        ⛔ WHY THIS EXISTS. At `3c78940` both of these docstrings asserted that
        a partly-unreadable vault still answers with the folders it could read,
        and both declared the question UN-RULED and the owner's. Driven, the
        adapter refuses and the route answers 400, and the ruling was taken on
        2026-08-23. Prose went stale inside one round while every gate stayed
        green, because nothing anywhere compared the prose to the product.

        ⛔ AND WHAT THIS DOES **NOT** HOLD, said here rather than implied: it
        gates the MARKER. The prose around the marker is still prose, and a
        claim in a docstring that carries no marker is not reached at all. The
        reach question has one filed home --
        `.planning/todos/pending/2026-08-22-doc-behaviour-mark-reach.md` -- so
        a later widening lands in one place. ⛔ A gate credited with more than
        it does is the defect class this round is closing twice over."""
        adapter_path = Path(OV.__file__)
        server_path = Path(server.__file__)
        files = [("adapters/obsidian_vault.py", adapter_path),
                 ("server.py", server_path)]

        # -- the claims, lifted from disk, each one NAMED when it is wrong ---
        stated = {}
        for label, path in files:
            marks = _lift_doc_marks(path)
            print("  [doc-mark] %s marks=%r" % (label, marks))
            self.assertEqual(
                len(marks), 1,
                "⛔ %s carries %d DOC-BEHAVIOUR-MARK lines, expected exactly "
                "1. An ABSENT marker leaves the claim ungated; a SECOND "
                "marker is one rule with two spellings, which is how a gate "
                "goes blind. Found: %r" % (label, len(marks), marks))
            lineno, subject, claim = marks[0]
            self.assertEqual(
                subject, "partial_read",
                "⛔ %s line %d marks the subject %r; this gate drives "
                "`partial_read` and nothing else, so a marker about another "
                "subject is ungated by construction"
                % (label, lineno, subject))
            self.assertIn(
                claim, _DOC_MARK_CLAIMS[label],
                "⛔ %s line %d claims %r, which is not in this file's closed "
                "vocabulary %r. An unrecognised token is how a marker gets "
                "edited into something no drive can contradict"
                % (label, lineno, claim, _DOC_MARK_CLAIMS[label]))
            stated[label] = claim

        # -- EVERY ruling these files cite really exists ---------------------
        # ⚠ WIDENED BY `26.96-53` FROM ONE SCALAR TO A DERIVED SET. What used
        # to stand here asserted a single hand-typed heading and nothing else;
        # the full derivation, its cross-pass, its anti-vacuity refusal and
        # its by-value figures now live in
        # `test_every_ruling_cited_in_the_files_under_gate_is_in_her_record`.
        # ⛔ THE ONE-LINE CALL IS KEPT HERE ON PURPOSE: this case credits the
        # docstrings with citing a real ruling, so it must not be able to pass
        # while a ruling they cite is missing from her record.
        record = _record_path()
        self.assertTrue(
            record.is_file(),
            "⛔ her record is not readable at %s -- this gate has no "
            "expectation and must not invent one" % (record,))
        verdict = _cited_ruling_verdict(
            _files_under_gate(), record.read_text(encoding="utf-8"))
        print("  [ruling] record_chars=%d derived=%r unresolved=%r"
              % (verdict["record_chars"], verdict["derived"],
                 verdict["unresolved"]))
        self.assertEqual(
            verdict["unresolved"], [],
            "⛔ a ruling these docstrings' files cite (%r) is not in her "
            "record at %s as a WHOLE HEADING. A ruling credited in a "
            "docstring that is not in the record is exactly the shape this "
            "round is closing -- a gate credited in a comment does not mean "
            "it exists" % (verdict["unresolved"], record))

        library = self.library_remembering_the_vault()

        # -- POSITIVE CONTROL: a wholly-readable vault -----------------------
        # ⛔ WITHOUT THIS, `driven=raises` would be vacuously true of every
        # input and the comparison below would prove nothing.
        readable = self.answer()
        control = _drive_route(library)
        print("  [control/readable] offered=%d route=%r code=%r"
              % (len(readable), control.last()[0], control.last()[1]))
        self.assertGreater(len(readable), 0,
                           "the wholly-readable control offered nothing, so "
                           "the refusal driven below would hold for the wrong "
                           "reason")
        self.assertEqual(control.last()[0], "json_response",
                         "the wholly-readable control did not answer at all")
        self.assertEqual(control.last()[1], 200,
                         "the wholly-readable control did not answer 200, so "
                         "a 400 below would not distinguish anything")

        # -- the drive -------------------------------------------------------
        rec = _drive_partial_read(self.vault, library)
        print("  [mode-took] took=%s (%s)" % (rec["took"], rec["why"]))
        if not rec["took"]:
            self.skipTest(
                "chmod 000 does not block this process (%s) -- running as "
                "root, or a filesystem that ignores the mode. ⛔ SKIPPED "
                "RATHER THAN PASSED: a drill that never applied reads exactly "
                "like a gate that does not hold" % rec["why"])

        # ⛔ THE ERROR TUPLE IS THE SHIPPED ONE, ASKED AT RUN TIME.
        if rec["adapter_error"] is not None:
            self.assertIsInstance(
                rec["adapter_error"], server._ADAPTER_COLLECT_ERRORS,
                "the adapter raised something the route's own except arm does "
                "not catch, so the status code below is not the mapping this "
                "path really has")

        driven = {"adapters/obsidian_vault.py": rec["adapter_claim"],
                  "server.py": rec["server_claim"]}

        # ⛔ BOTH SIDES PRINTED, ALWAYS. Never "they match".
        for label, _path in files:
            print("  [claim-vs-drive] %s stated=%s driven=%s"
                  % (label, stated[label], driven[label]))
        print("  [route] recorded=%r code=%r"
              % (rec["recorded"][-1][0] if rec["recorded"] else None,
                 rec["server_code"]))
        print("  [adapter] answer=%s said=%r"
              % (json.dumps(rec["adapter_answer"])
                 if rec["adapter_answer"] is not None else "<raised>",
                 str(rec["adapter_error"]) if rec["adapter_error"] else ""))

        # ⛔ BOTH COMPARISONS ARE MADE BEFORE EITHER IS REPORTED. An
        # `assertEqual` per file stops at the first, so a mutation that moves
        # BOTH sides would be reported as a defect in one file -- and a reader
        # would fix that one and re-run into the second. The violations are
        # collected and named together.
        violations = []
        if driven["adapters/obsidian_vault.py"] != stated[
                "adapters/obsidian_vault.py"]:
            violations.append(
                "⛔ `adapters/obsidian_vault.py`'s DOC-BEHAVIOUR-MARK says the "
                "partly-unreadable vault %r; driven end to end it %r. The "
                "docstring describes a behaviour the code does not have."
                % (stated["adapters/obsidian_vault.py"],
                   driven["adapters/obsidian_vault.py"]))
        if driven["server.py"] != stated["server.py"]:
            violations.append(
                "⛔ `server.py`'s DOC-BEHAVIOUR-MARK says the route answers %r "
                "on a partly-unreadable vault; driven through its own mapping "
                "it answered %r (status %r). The docstring describes a "
                "behaviour the route does not have."
                % (stated["server.py"], driven["server.py"],
                   rec["server_code"]))
        self.assertEqual(violations, [], "\n".join(violations))

        # -- T-26.96-88: nothing on the wire names her filesystem ------------
        body = rec["recorded"][-1][2] if rec["recorded"] else ""
        body = body if isinstance(body, str) else json.dumps(body)
        print("  [wire/refusal] body=%r" % (body,))
        self.assertTrue(body.strip(), "the refusal carried no words at all")
        self.assertNotIn("/", body,
                         "the refusal body carries a path separator -- a "
                         "message that names her filesystem is the disclosure "
                         "this route exists to avoid")
        self.assertNotIn(self.tmp, body)
        self.assertNotIn("Journal", body,
                         "the refusal body names the folder it could not "
                         "open -- a folder NAME out of her vault is the same "
                         "disclosure as a path")

    # -- 9 -----------------------------------------------------------------
    def test_an_import_counts_a_folder_it_could_not_open(self):
        """⛔ HER RULING, 2026-08-23, VERBATIM: **"Count it and tell you"** --
        RULING U, at the blocking sitting of `26.96-37`, question 2. ⛔ TIER 2,
        APPROVED AS SHOWN: an agent wrote the question and the option labels,
        she picked one, and she typed no prose.

        ⛔⛔ THIS CASE GATES THE COUNTING HALF ONLY, AND THE OTHER HALF IS
        OWED TO HER. Option B's own cost line said the wording is a separate
        sitting and she took the option with that in front of her. ⛔ NO
        SENTENCE EXISTS FOR THIS STATE, none was shown to her, and nothing in
        this case may be read as standing in for one.

        WHAT SHE WAS MEASURED AND SHOWN BEFORE SHE CHOSE (`26.96-37-
        MEASUREMENTS.md` § A, driven on a synthetic vault at `3c78940`): ten
        notes existed, three of them inside a folder the room could not open;
        **seven** were staged, `attempted` read **seven**, the whole skip bag
        came back with every count zero and no exception, and the folder's
        three notes were lost without a trace. ⛔ The readout said *7 of 7*
        over an import that silently lost three notes.

        ⛔ THE TRADE THIS FIX MAKES, STATED RATHER THAN HIDDEN. The count
        joins the reason key `collect()` ALREADY mints, so a folder that could
        not be OPENED and a note that could not be READ become one number. If
        that number is ever rendered, the two are indistinguishable. Minting a
        second key would be an agent deciding a distinction she was explicitly
        NOT asked about (RULING U, *what she was not asked*, item 3).

        ⚠ AND WHAT IT IS WORTH TODAY, MEASURED, NOT ASSUMED: nothing. She was
        told so before she chose. `26.96-37-MEASUREMENTS.md` § B drove the
        after-import readout with this exact key and it returned **zero
        lines**, three times, including on the real bag shape `collect()`
        hands over -- while a positive control in the same run returned a real
        sentence. The room now KNOWS; she is still not told."""
        # ⛔ CONTAINMENT ASSERTED BEFORE ANY ARM RUNS, and printed by value
        # (the idiom `26.96-42` established for the node harness). No fixture
        # on this path may ever be pointed at a real vault.
        _vault_real = Path(self.vault).resolve()
        _tmp_real = Path(tempfile.gettempdir()).resolve()
        print("  [import/containment] vault=%s tmp=%s" % (_vault_real, _tmp_real))
        self.assertTrue(
            _vault_real == _tmp_real or _tmp_real in _vault_real.parents,
            "⛔ THE SYNTHETIC VAULT IS NOT UNDER THE OS TEMP DIRECTORY (%s vs "
            "%s) -- refusing to lower a mode bit or drive an import anywhere "
            "else" % (_vault_real, _tmp_real))

        library = self.library_remembering_the_vault()
        staging_ok = Path(self.tmp) / "staging-control"
        staging_bad = Path(self.tmp) / "staging-partial"
        staging_fenced_ok = Path(self.tmp) / "staging-fenced-readable"
        staging_fenced_bad = Path(self.tmp) / "staging-fenced-unopenable"
        staging_other_fence = Path(self.tmp) / "staging-other-fence"

        # ⛔ THE POSITIVE CONTROL FIRST, in the same case. Without it a
        # fixture that staged nothing would make the rise asserted below
        # unreadable -- a count that went from absent to 1 on a vault that
        # imported nothing proves nothing about an import.
        control = {}
        got = OV.collect(str(library), str(staging_ok), stats=control,
                         vault_root=str(self.vault))
        control_unreadable = (control.get("skipped") or {}).get("unreadable", 0)
        print("  [import/control] staged=%d attempted=%d unreadable=%r bag=%s"
              % (len(got), control["attempted"], control_unreadable,
                 json.dumps(control["skipped"], sort_keys=True)))
        self.assertGreater(len(got), 0,
                           "the wholly-readable control staged nothing, so "
                           "the count asserted below would be a figure about "
                           "an import that never happened")
        self.assertEqual(control_unreadable, 0,
                         "the wholly-readable control already reports an "
                         "unreadable thing, so a rise below would not be "
                         "attributable to the unopenable folder")

        target = self.vault / "Journal"
        # ⛔ THE FOLDER THE ROOM CANNOT OPEN REALLY HOLDS SOMETHING. A count
        # of an EMPTY unopenable folder would be true and worthless: what her
        # ruling is about is notes that never arrive.
        lost = sorted(p.name for p in target.iterdir() if p.is_file())
        os.chmod(str(target), 0o000)
        try:
            took, why = _mode_took(target)
            print("  [import/chmod] took=%s (%s) notes_behind_it=%r"
                  % (took, why, lost))
            if not took:
                self.skipTest(
                    "chmod 000 does not block this process (%s) -- running as "
                    "root, or a filesystem that ignores the mode. ⛔ SKIPPED "
                    "RATHER THAN PASSED: a drill that never applied reads "
                    "exactly like a gate that does not hold" % why)
            self.assertGreater(len(lost), 0,
                               "the unopenable folder held no notes, so this "
                               "case would gate a loss that never happened")
            stats = {}
            staged = OV.collect(str(library), str(staging_bad), stats=stats,
                                vault_root=str(self.vault))
        finally:
            os.chmod(str(target), 0o755)
        # ⛔ THE RESTORATION IS ASSERTED, NOT ASSUMED. A mode bit left down
        # would make every arm after this one measure the wrong vault.
        _back, _why = _mode_took(target)
        print("  [import/restore] arm='unopenable, not fenced' still_blocked=%r (%s)"
              % (_back, _why))
        self.assertFalse(_back, "the mode bits were not restored (%s)" % _why)

        bag = stats.get("skipped") or {}
        unreadable = bag.get("unreadable", 0)
        # ⛔ EVERY FIGURE PRINTED BESIDE ITS NUMERATOR. No count without the
        # thing it is a count of.
        print("  [import/partial] staged=%d attempted=%d unopenable_folders=1 "
              "unreadable=%r" % (len(staged), stats["attempted"], unreadable))
        print("  [import/partial] bag BY VALUE: %s"
              % json.dumps(bag, sort_keys=True))
        self.assertEqual(
            unreadable, 1,
            "⛔ AN IMPORT LOST THE FACT THAT A FOLDER WOULD NOT OPEN. One "
            "folder was unopenable and %r notes behind it never arrived, yet "
            "the skip bag reports %r for that reason. She ruled on 2026-08-23 "
            "(RULING U, `26.96-37` question 2, TIER 2) that the room must "
            "COUNT it. Bag by value: %s"
            % (len(lost), unreadable, json.dumps(bag, sort_keys=True)))
        # ⛔ THE LOSS IS REAL, RE-ASSERTED HERE SO THE COUNT IS NOT A COUNT OF
        # NOTHING: the notes behind the folder did not reach staging.
        for name in lost:
            self.assertFalse(
                (staging_bad / "Journal" / name).exists(),
                "the fixture did not actually lose %r, so the count above is "
                "about a folder that was read after all" % name)

        # ==================================================================
        # ⛔ ARMS 3, 4 AND 5 -- A FOLDER SHE KEPT PRIVATE IS NOT AN IMPORT
        # LOSS. Added by `26.96-43` closing `26.96-VERIFICATION.md` gap 3 /
        # `26.96-REVIEW.md` CR-01, both of which reproduced the defect
        # independently on four arms.
        #
        # ⛔ WHY THIS BELONGS IN THIS CASE AND NOT A NEW ONE: the arm that
        # matters asserts a ZERO, and a zero is only readable beside a one
        # taken by the same instrument in the same run. Arm 2 above is that
        # one. Split into a separate case, a fixture that silently stopped
        # producing walk errors at all would make arm 4 pass for the wrong
        # reason and nothing would say so.
        # ==================================================================

        # -- ARM 3: readable AND FENCED. The baseline the fenced-and-
        # unopenable arm is compared against. Its `staged`/`attempted` are
        # what "the import lost nothing" MEANS for a fenced folder: the
        # folder was never coming in, so the figures must not move when it
        # also happens to be unopenable.
        fenced_ok = {}
        got_fenced_ok = OV.collect(str(library), str(staging_fenced_ok),
                                   exclude_folders=["Journal"],
                                   stats=fenced_ok,
                                   vault_root=str(self.vault))
        fenced_ok_unreadable = (fenced_ok.get("skipped") or {}).get(
            "unreadable", 0)
        print("  [import/fenced-readable] staged=%d attempted=%d unreadable=%r "
              "bag=%s" % (len(got_fenced_ok), fenced_ok["attempted"],
                          fenced_ok_unreadable,
                          json.dumps(fenced_ok["skipped"], sort_keys=True)))
        self.assertGreater(
            len(got_fenced_ok), 0,
            "the fenced-and-readable baseline staged nothing, so the "
            "equalities asserted below would be equalities between two "
            "imports that never happened")
        self.assertEqual(
            fenced_ok_unreadable, 0,
            "the fenced-and-readable baseline already reports an unreadable "
            "thing, so the zero asserted below would not be attributable to "
            "the fix")

        # -- ARM 4: unopenable AND FENCED. ⛔ THE GATE THIS PLAN EXISTS FOR.
        # A folder she kept private that could not be opened is NOT a loss --
        # it was never coming in -- and a count of it is a number derived
        # from her fenced list, in the bag `server.py` copies WHOLE into the
        # progress payload the browser polls.
        os.chmod(str(target), 0o000)
        try:
            took_f, why_f = _mode_took(target)
            print("  [import/chmod-fenced] took=%s (%s)" % (took_f, why_f))
            if not took_f:
                self.skipTest(
                    "chmod 000 does not block this process (%s) -- ⛔ SKIPPED "
                    "RATHER THAN PASSED: a drill that never applied reads "
                    "exactly like a gate that does not hold" % why_f)
            fenced_bad = {}
            got_fenced_bad = OV.collect(str(library), str(staging_fenced_bad),
                                        exclude_folders=["Journal"],
                                        stats=fenced_bad,
                                        vault_root=str(self.vault))
        finally:
            os.chmod(str(target), 0o755)
        _back4, _why4 = _mode_took(target)
        print("  [import/restore] arm='unopenable AND fenced' still_blocked=%r "
              "(%s)" % (_back4, _why4))
        self.assertFalse(_back4,
                         "the mode bits were not restored (%s)" % _why4)

        fenced_bad_bag = fenced_bad.get("skipped") or {}
        fenced_bad_unreadable = fenced_bad_bag.get("unreadable", 0)
        print("  [import/fenced-unopenable] staged=%d attempted=%d "
              "unreadable=%r" % (len(got_fenced_bad),
                                 fenced_bad["attempted"],
                                 fenced_bad_unreadable))
        print("  [import/fenced-unopenable] bag BY VALUE: %s"
              % json.dumps(fenced_bad_bag, sort_keys=True))
        self.assertEqual(
            fenced_bad_unreadable, 0,
            "⛔ THE ROOM COUNTED A FOLDER SHE KEPT PRIVATE AS AN IMPORT LOSS. "
            "'Journal' was in `exclude_folders`, so nothing behind it was "
            "ever coming in and the import lost NOTHING -- yet the skip bag "
            "reports %r for the reason an unreadable NOTE mints, and "
            "`server.py` copies that bag whole into the progress payload the "
            "browser polls. Her RULING U is about notes that never arrive. "
            "Compare arm 2 above, which reports 1 for a real loss. Bag by "
            "value: %s" % (fenced_bad_unreadable,
                           json.dumps(fenced_bad_bag, sort_keys=True)))
        # ⛔ THE ZERO MUST MEAN "NOTHING WAS LOST", NOT "NOTHING WAS
        # IMPORTED". A fix that simply stopped importing would satisfy the
        # count alone; these two equalities are what make the zero mean what
        # it says.
        self.assertEqual(
            len(got_fenced_bad), len(got_fenced_ok),
            "the fenced-and-unopenable arm staged %d where the fenced-and-"
            "readable baseline staged %d -- the zero above would then be a "
            "zero about an import that lost something else"
            % (len(got_fenced_bad), len(got_fenced_ok)))
        self.assertEqual(
            fenced_bad["attempted"], fenced_ok["attempted"],
            "the fenced-and-unopenable arm attempted %d where the fenced-and-"
            "readable baseline attempted %d"
            % (fenced_bad["attempted"], fenced_ok["attempted"]))

        # -- ARM 5: unopenable, and a DIFFERENT folder fenced. ⛔ THE
        # ANTI-MIRROR CONTROL FOR THE FIX ITSELF. Arms 1-4 are all satisfied
        # by a "fix" that stops counting whenever `exclude_folders` is
        # non-empty at all. This arm fails against that fix and passes only
        # when the exclusion is consulted AGAINST THE ERROR'S OWN PATH.
        os.chmod(str(target), 0o000)
        try:
            took_o, why_o = _mode_took(target)
            print("  [import/chmod-other-fence] took=%s (%s)" % (took_o, why_o))
            if not took_o:
                self.skipTest(
                    "chmod 000 does not block this process (%s) -- ⛔ SKIPPED "
                    "RATHER THAN PASSED" % why_o)
            other = {}
            got_other = OV.collect(
                str(library), str(staging_other_fence),
                exclude_folders=["Clippings/journal/chatgpt"],
                stats=other, vault_root=str(self.vault))
        finally:
            os.chmod(str(target), 0o755)
        _back5, _why5 = _mode_took(target)
        print("  [import/restore] arm='unopenable, OTHER folder fenced' "
              "still_blocked=%r (%s)" % (_back5, _why5))
        self.assertFalse(_back5,
                         "the mode bits were not restored (%s)" % _why5)

        other_bag = other.get("skipped") or {}
        other_unreadable = other_bag.get("unreadable", 0)
        print("  [import/unopenable-other-fenced] staged=%d attempted=%d "
              "unreadable=%r bag=%s"
              % (len(got_other), other["attempted"], other_unreadable,
                 json.dumps(other_bag, sort_keys=True)))
        self.assertEqual(
            other_unreadable, 1,
            "⛔ THE EXCLUSION IS BEING CONSULTED AS A FLAG RATHER THAN AS A "
            "PATH. 'Journal' could not be opened and 'Journal' was NOT "
            "fenced -- only an unrelated folder was -- so this is a real "
            "loss and her RULING U says count it. The bag reports %r. A fix "
            "that returns early whenever anything at all is fenced passes "
            "every other arm in this case and fails here. Bag by value: %s"
            % (other_unreadable, json.dumps(other_bag, sort_keys=True)))

    # -- 7 -----------------------------------------------------------------
    def test_the_callback_fails_toward_not_counting(self):
        """⛔ THE SAFETY POSTURE THE SOURCE STATES THREE TIMES, ASSERTED ONCE.

        `26.96-43` wrote it into the adapter in three places — an error whose
        path is absent, empty, of the wrong type, or outside the vault root is
        NOT counted, because the code takes the answer that invents nothing
        until she rules — and no test held it. The round-6 verifier changed
        the branch to count instead and the suite returned `Ran 14 tests, OK`.

        ⛔ WHY IT MATTERS, NOT JUST THAT IT DIFFERS. Under that mutant a
        filename-less walker error becomes an `unreadable` count in the bag
        `server.py` copies WHOLE into the progress report the browser polls.
        That number would be shown to her without anything behind it.

        ⛔ THREE ARMS, ONE CASE, ON PURPOSE. The arm that matters asserts a
        ZERO, and a zero is unreadable unless the same instrument produces a
        ONE in the same run. Arm B is that one. Arm C is a SECOND zero that
        belongs to a DIFFERENT sentence — `26.96-43`'s rule that a folder she
        kept private is not an import loss — kept beside it so a future reader
        cannot mistake one for the other and attribute a regression to the
        wrong ruling.

        ⛔ WHAT THIS DOES **NOT** TOUCH. `adapters/obsidian_vault.py` is not
        edited by the plan that added this case. The docstring sentence
        `WR-04` names is open by her routing, is not amended, and nothing here
        may be read as resolving it."""
        _vault_real = Path(self.vault).resolve()
        _tmp_real = Path(tempfile.gettempdir()).resolve()
        print("  [posture/containment] vault=%s tmp=%s" % (_vault_real, _tmp_real))
        self.assertTrue(
            _vault_real == _tmp_real or _tmp_real in _vault_real.parents,
            "⛔ THE SYNTHETIC VAULT IS NOT UNDER THE OS TEMP DIRECTORY (%s vs "
            "%s)" % (_vault_real, _tmp_real))

        library = self.library_remembering_the_vault()
        # ⛔ THE VAULT IS WHOLLY READABLE IN EVERY ARM BELOW, so the real walk
        # produces NO errors of its own and every count read back is
        # attributable to the errors this case fed in and to nothing else.

        # -- ARM A: the unplaceable errors that really reach the branch ------
        # ⛔ THE FOUR KINDS THE ROUND-6 VERIFIER IDENTIFIED AS REACHABLE IN
        # PRODUCTION: no filename at all, a `None` filename, a `bytes`
        # filename (TypeError), and a real path OUTSIDE her vault root
        # (ValueError).
        unplaceable = [
            ("no filename attribute", _ErrorWithNoFilename("walk failed")),
            ("filename None", _walk_error(None)),
            ("filename bytes", _walk_error(b"/somewhere/else")),
            ("filename outside the vault root",
             _walk_error(str(Path(self.tmp) / "not-the-vault" / "Deep"))),
        ]
        staging_a = Path(self.tmp) / "staging-posture-unplaceable"
        stats_a = {}
        with _FeedWalkErrors([e for _, e in unplaceable]) as fed_a:
            staged_a = OV.collect(str(library), str(staging_a), stats=stats_a,
                                  vault_root=str(self.vault))
        bag_a = stats_a.get("skipped") or {}
        print("  [posture/hook] captured=%r errors_fed=%d kinds=%r"
              % (fed_a.captured[0] is not None, len(unplaceable),
                 [k for k, _ in unplaceable]))
        print("  [posture/unplaceable] staged=%d attempted=%d "
              "unreadable_key_present=%r unreadable=%r"
              % (len(staged_a), stats_a["attempted"],
                 "unreadable" in bag_a, bag_a.get("unreadable")))
        print("  [posture/unplaceable] bag BY VALUE: %s"
              % json.dumps(bag_a, sort_keys=True))
        # ⛔ THE HOOK WAS REALLY HANDED OVER. A drill that never reached the
        # callback reads exactly like a callback that holds.
        self.assertEqual(len(fed_a.captured), 1,
                         "the walker was not called exactly once, so the "
                         "errors below may not have reached the shipped hook")
        self.assertIsNotNone(fed_a.captured[0],
                             "`collect()` handed the walker no error hook, so "
                             "nothing below drove the shipped callback")
        self.assertGreater(len(staged_a), 0,
                           "the wholly-readable vault staged nothing, so the "
                           "zero asserted below is a figure about an import "
                           "that never happened")
        # ⛔ THE BAG IS NOT EMPTY, so the key check below is not a truthiness
        # test that an empty dict would satisfy for the wrong reason.
        self.assertGreater(len(bag_a), 0,
                           "the skip bag came back empty, so an absent key "
                           "proves nothing about the callback")
        posture = (
            "⛔ THE CALLBACK FAILED TOWARD **COUNTING**. %d error(s) it could "
            "not place under the vault root (%r) moved the counter to %r. "
            "`26.96-43` states three times in the source that it fails toward "
            "NOT counting: an error whose path is absent, empty, of the wrong "
            "type or outside the root is not counted, because the code takes "
            "the answer that invents nothing until she rules. ⛔ WHY THIS "
            "MATTERS AND NOT JUST THAT A NUMBER DIFFERS: this counter lands "
            "in the `unreadable` reason of the skip bag that `server.py` "
            "copies WHOLE into the progress report the browser polls, so she "
            "would be shown a count with nothing behind it. Bag by value: %s"
            % (len(unplaceable), [k for k, _ in unplaceable],
               bag_a.get("unreadable"), json.dumps(bag_a, sort_keys=True)))
        # ⛔ THE KEY'S ABSENCE ASSERTED EXPLICITLY, and its value too — never a
        # truthiness check, which passes on an empty bag for the wrong reason.
        self.assertNotIn("unreadable", bag_a, posture)
        self.assertEqual(bag_a.get("unreadable", 0), 0, posture)

        # -- ARM B: THE POSITIVE CONTROL, in the same case -------------------
        # ⛔ WITHOUT THIS THE ZERO ABOVE ASSERTS NOTHING. A counter that never
        # moves for ANY input satisfies every zero in this case, and that is
        # the vacuous pass this project has recorded before.
        staging_b = Path(self.tmp) / "staging-posture-placeable"
        stats_b = {}
        with _FeedWalkErrors([_walk_error(str(self.vault / "Clippings"))]):
            staged_b = OV.collect(str(library), str(staging_b), stats=stats_b,
                                  vault_root=str(self.vault))
        bag_b = stats_b.get("skipped") or {}
        print("  [posture/control-placeable-unfenced] staged=%d unreadable=%r "
              "bag=%s" % (len(staged_b), bag_b.get("unreadable"),
                          json.dumps(bag_b, sort_keys=True)))
        self.assertEqual(
            bag_b.get("unreadable"), 1,
            "⛔ THE POSITIVE CONTROL DID NOT FIRE: a placeable, unfenced "
            "error left the counter at %r, so the same instrument produced no "
            "ONE and the zero in arm A is unreadable. Bag by value: %s"
            % (bag_b.get("unreadable"), json.dumps(bag_b, sort_keys=True)))

        # -- ARM C: placeable but FENCED -- a DIFFERENT sentence's zero ------
        # ⛔ THIS ZERO BELONGS TO `26.96-43`: a folder SHE KEPT PRIVATE is not
        # an import loss, because nothing behind it was ever coming in and a
        # count of it would be a number derived from her fenced list sitting
        # in the bag the browser polls. ⛔ ARM A's zero belongs to the
        # fails-toward-not-counting posture. Two zeroes, two sentences; kept
        # in one case so a regression is attributable to the right one.
        staging_c = Path(self.tmp) / "staging-posture-fenced"
        stats_c = {}
        with _FeedWalkErrors([_walk_error(str(self.vault / "Journal"))]):
            staged_c = OV.collect(str(library), str(staging_c),
                                  exclude_folders=["Journal"], stats=stats_c,
                                  vault_root=str(self.vault))
        bag_c = stats_c.get("skipped") or {}
        print("  [posture/control-placeable-fenced] staged=%d unreadable=%r "
              "bag=%s" % (len(staged_c), bag_c.get("unreadable"),
                          json.dumps(bag_c, sort_keys=True)))
        self.assertNotIn(
            "unreadable", bag_c,
            "⛔ A FOLDER SHE KEPT PRIVATE WAS COUNTED AS AN IMPORT LOSS "
            "(%r). That is `26.96-43`'s sentence, NOT the "
            "fails-toward-not-counting posture arm A gates: the exclusion is "
            "consulted BEFORE the count, so a number derived from her fenced "
            "list never reaches the bag the browser polls. Bag by value: %s"
            % (bag_c.get("unreadable"), json.dumps(bag_c, sort_keys=True)))

    def test_no_second_directory_walk_is_written(self):
        """⚠ LABELLED A SOURCE GATE, and never presented as behavioural proof.
        It reads the text of the listing member. It is here because a
        traversal written inside the member would satisfy every behavioural
        case above while quietly dropping the shipped walker's guards."""
        import inspect
        src = inspect.getsource(OV.list_folder_paths) + \
            inspect.getsource(OV._folder_segments_from_walk)
        self.assertIn("walk_source", src,
                      "the listing member does not name the shipped walker")
        for banned in ("os.walk", "iterdir", "rglob", "scandir", "os.listdir"):
            self.assertNotIn(banned, src,
                             "⚠ SOURCE GATE: the listing member writes its "
                             "own traversal (%s). A second walk is a second "
                             "thing to drift from the hidden-directory "
                             "pruning and the two symlink refusals the "
                             "shipped walker already carries" % banned)


class PickerStringActsOnTheServerFence(unittest.TestCase):
    """⛔ V3's SECOND SURFACE, DRIVEN — not asserted syntactically.

    A string that merely LOOKS like a path proves nothing. The value the picker
    emits is fed to `study_lib._reflection_heavy` -- the server-side surface
    that reads roster terms -- ON THE NESTED FIXTURE, and it is asserted to ACT
    on it, with the verdict printed BY VALUE.

    ⚠ The client-side half of V3, `collectFencedBasenames`, is driven in
    tests/test_roster_pane.cjs (`pickerFenceActs`) in the same plan and on the
    same fixture. ⛔ Recorded here so a reader does not conclude it was
    dropped.

    ⛔ THIS LANDS HERE AND NOT IN PLAN 26.96-29, whose first task runs only if
    her D-C ruling admitted it. A property that rides on a decision she has not
    made is a property nothing holds."""

    PICKED = "/".join(NESTED)          # Clippings/journal/chatgpt

    def test_the_emitted_string_makes_a_thing_in_that_folder_heavy(self):
        item = {"title": "a plain note", "folder": self.PICKED, "tags": []}
        verdict = study_lib._reflection_heavy(item, None, (self.PICKED,))
        print("  [heavy] entry=%r folder=%r verdict=%r"
              % (self.PICKED, item["folder"], verdict))
        self.assertTrue(verdict,
                        "the server-side surface did not act on the string "
                        "the picker emits: a thing living in the folder she "
                        "just made private is not read as hers to protect")

    def test_the_control_a_neighbouring_folder_is_untouched(self):
        """⛔ THE ARM THAT MUST NOT FIRE, in the same file. Without it a
        predicate that answered True for everything would satisfy the case
        above and prove nothing. `Journal` may not catch `Journal analysis`,
        and the same rule holds one level down."""
        item = {"title": "a plain note",
                "folder": "Clippings/journal/chatgpt-notes", "tags": []}
        verdict = study_lib._reflection_heavy(item, None, (self.PICKED,))
        print("  [heavy/control] entry=%r folder=%r verdict=%r"
              % (self.PICKED, item["folder"], verdict))
        self.assertFalse(verdict,
                         "the picker's entry reached a NEIGHBOURING folder "
                         "that merely begins with the same characters -- an "
                         "entry that quietly covers more than it says is the "
                         "harm this rule exists to prevent")


if __name__ == "__main__":
    unittest.main(verbosity=2)
