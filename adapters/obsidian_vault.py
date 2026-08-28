"""Obsidian vault front-end (Phase 26.97, ADP-03 / SRM-08).

Turns her Obsidian vault into a folder the shipped importer already ingests
(D-03): walk the vault with the SHIPPED walker, copy the genuinely-new notes
into a staging directory **keeping her folder shape**, and hand that directory
to `study_lib.import_folder`. The importer does the rest, so notes land as
`unseen` with every solved edge case reused from upstream (law 2, D-04).

THE STAGING SHAPE IS HER RULING, NOT A PREFERENCE. `26.97-DECISIONS.md`
DECISION 1 = **`keep-the-shape`**, taken live with the owner on 2026-08-17.
The scratch copy preserves the vault-relative structure, which is what makes
the privacy fence keep working WITHOUT being modified: the fence keys on a
note's first vault-relative path segment, and that segment survives the copy.
The `folder` facet and `is_reflection()` are repaired by the same change --
that was the deciding argument she was given, and it is why a fence-only
repair was rejected. She was told this is the bigger build and chose it
anyway. Do not re-open it as "could we just do the flat one, it's smaller".

THE NAMED COST OF THAT RULING, carried here as a build obligation: a note must
not end up remembering a scratch directory that is deleted afterwards. Her
comment write-back jails on the vault root, the room's identity index is built
from the origin, and the folder facet is derived from its parent -- so an
origin left in the scratch area is data-loss grade on every note already in
the room. The resolution lives in `study_lib.import_folder`'s `staged_from`
parameter: the importer is handed the TRUE source root this scratch copy was
made from, and records each note's origin at its real vault path while reading
its bytes out of the scratch copy.

THE FETCH MEMORY IS ALSO HERS, AND IT IS A SEPARATE RULING.
`26.97-DECISIONS.md` DECISION 2 = **`where-plus-fingerprint`**, taken live with
the owner on 2026-08-17 in the same sitting as DECISION 1. What this module
remembers about a note it has already fetched is WHERE THE NOTE LIVES AND A
FINGERPRINT OF WHAT IS IN IT -- see `_stable_id`. Edit a note and the room
treats it as new work to fetch while STILL recognising it as the same note, so
everything she had said about it is kept.

⛔ NEVER `where-it-lives`. That option was put to her AS A TRAP rather than as
an equal: edit a note and the room says "I already have that one" and never
looks at it again -- her edit never arrives, the room reports success, and
every check still passes. It is the one failure in this phase that hides, and
it is why the shape was put to her rather than decided.

⚠ THE COST SHE ACCEPTED WHEN SHE CHOSE IT: the memory grows a little every
time she edits something, because the old fingerprint stays on the list. ⛔ Do
not "optimise" that away by dropping old fingerprints. Dropping them is an
unasked design change, and the growth is the trade she took knowingly.

TWO MECHANISMS, AND COLLAPSING THEM IS HOW THIS GOES WRONG. They answer
different questions, both are needed, and neither substitutes for the other:

  * THE FETCH MEMORY -- `_stable_id` here plus `adapters/_ledger.py` -- stops
    the ADAPTER handing over a note it has already handed over. It is about
    work not being done twice.
  * THE NOTE'S ORIGIN -- the reconciliation inside `study_lib.import_folder`
    -- stops the IMPORTER minting a second item for a note the room already
    holds. It is about her judgements not being stranded on a copy.

  A room with only the first would re-mint every note it re-fetched as a fresh
  unjudged card, which is a never-list leak and law 5 calls that absolute. A
  room with only the second would be correct and slow. The pair is the design.

⚠ THE CALLER COMMITS THE FETCH MEMORY, carried verbatim from the shipped
collect contract rather than paraphrased away: the caller commits what was
fetched AFTER the import succeeds, never the adapter and never before, so a
failed import does not lose what it fetched. `collect` below never writes it.

⛔ `adapters/_ledger.py` IS REUSED WHOLE AND IS NEVER FORKED. Its atomic write,
its fail-open empty default and its create-its-own-directory-on-first-write
behaviour are load-bearing elsewhere -- the last one is exactly what makes "a
refusal writes no fetch memory" observable on the filesystem in 26.97-04.
Nothing here writes that file directly or re-implements any part of it.

⚠ THE DRIVEN PROOF, because a green suite is not evidence for a failure this
quiet: `tests/test_obsidian_vault.py::VaultLiveness` reddens the edited-note
case under the `where-it-lives` shape (OBSIDIAN_VAULT_TRAP_KEY=1) and reddens
the two never-list cases under a planted duplicate mint
(OBSIDIAN_VAULT_DUP_MINT=1), with the unchanged-vault control green in the
same run and each planted path proven to have been executed.

Design constraints held here:
  - ZERO new runtime dependencies (law 8): the Python stdlib only.
  - The directory walk is NOT hand-rolled. `study_lib.walk_source` is called,
    so hidden directories are pruned (.obsidian/ and .trash/ never leak in),
    symlinks are refused two independent ways, an iCloud placeholder is
    detected BEFORE anything hashes it (a zero-byte stub would otherwise
    collide every placeholder onto one identity), and the per-reason skip
    counts ride out in `stats`.
  - The exclusion is applied WHERE FILES ARE ENUMERATED, before anything is
    staged, read or hashed. It is a storage-tier guarantee, not a filter
    applied at import time or at render time: a note from a folder she keeps
    private never enters the scratch area at all.
  - Folder matching reuses `study_lib.roster_segments`, the ONE shipped
    spelling of what a folder entry means, rather than adding a fourth
    matcher. Segment-wise and whole: `Journal` never catches `Journals`.

WHERE THIS MODULE DELIBERATELY DIVERGES FROM THE TWO SHIPPED ADAPTERS, said
plainly because they disagree with each other and a third implementation must
choose rather than inherit by accident:

  1. THE ERROR CLASS IS ON THE PHOTOS SHAPE, NOT THE NOTES SHAPE. Notes'
     `NotesCollectError` carries a message only; Photos' `PhotosCollectError`
     carries `fatal` and `reason`. This collector needs per-reason skip
     counters, and the route reads those semantics to decide whether to
     retract an unproven connection, so Photos' shape is the right one.
  2. `mark_origin` MATCHES ON A DIFFERENT BASIS. Both shipped adapters test
     whether an item's origin is lexically inside the scratch directory. Here
     the origin is deliberately the TRUE vault path, so that test would match
     nothing. This one rebuilds the set of true origins the collect actually
     produced and matches membership in that set. Given a scratch directory
     but no vault root it falls back to the shipped lexical test, so the
     two-argument call shape the route uses still works.
  3. `_under` IS A THIRD COPY, not a shared helper. Sharing it would mean
     editing two shipped modules that suites pin, for a four-line lexical
     path test, inside a plan whose blast radius is deliberately three files.
     A third copy is defensible; an UNEXPLAINED third copy is not, which is
     why this paragraph exists.
"""
import os
import shutil
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import study_lib  # noqa: E402

# ⛔ LAW 1 (pull-only) BINDS THIS FILE AND THE LINT PROVES IT.
# Every collect fires from her own tap -- the candle in the room, or the
# button in onboarding. This module carries no clock, no interval, no timer,
# no watcher and no poll loop of any kind, and tests/test_no_daemon.py scans
# the whole adapter directory by glob, so this file is in its set by filename
# without anybody remembering to add it.
#
# ⚠ The forbidden identifiers that gate names live ONLY in that gate's own
# set. This module states the law in `#` comment lines rather than in a
# docstring on purpose: the gate strips `#` lines and does NOT strip
# docstrings, so naming a forbidden construct in prose above would pin a
# permanent red on a sentence that states the rule being enforced.

# The stable source label AND the ledger key. ⛔ This is the EXISTING vault
# source string, unchanged: `study_lib.is_reflection` keys on it, and renaming
# it would empty her reflections shelf.
SOURCE = "obsidian-vault"


class VaultCollectError(Exception):
    """A collect could not read the vault -- carries a plain, retryable
    message (never a traceback).

    `fatal` distinguishes a collect-level failure (no vault root recorded, the
    vault directory is gone) from a single-note skip the caller may count and
    carry on past. `reason` is the per-reason bucket a NON-fatal failure
    counts into (`unreadable` | `other`), or a named collect-level reason on a
    fatal one. This is the Photos shape, chosen deliberately -- see the module
    docstring, divergence 1."""

    def __init__(self, message, fatal=True, reason="other"):
        super().__init__(message)
        self.fatal = fatal
        self.reason = reason


def _under(child, parent):
    """True if `child` is lexically inside (or equal to) `parent`. Purely
    lexical (normpath+abspath, no resolve/stat) so it holds even after the
    scratch directory is deleted -- it matches against the store's origin_path
    strings, not the filesystem. Third copy; see the module docstring,
    divergence 3."""
    parent = os.path.normpath(os.path.abspath(parent))
    child = os.path.normpath(os.path.abspath(child))
    return child == parent or child.startswith(parent + os.sep)


def _vault_root(library_root=None, vault_root=None):
    """The vault this room reads, as a Path.

    An explicit `vault_root` wins. Otherwise it is read from the store at
    `library_root` -- `meta.vault_root`, which a whole-vault import records
    and which the store owns (it is not browser-writable). Raises a fatal
    VaultCollectError when there is no vault to read, because a collect that
    guessed a directory would be reading somebody's folder uninvited."""
    if vault_root:
        root = Path(str(vault_root))
    else:
        if not library_root:
            raise VaultCollectError(
                "The room doesn't know where your vault is yet.",
                fatal=True, reason="no_vault_root")
        try:
            store = study_lib.load_store(str(library_root))
        except Exception as e:      # a corrupt store is not a vault problem
            raise VaultCollectError(
                "The room couldn't read its own library just now.",
                fatal=True, reason="no_vault_root") from e
        raw = (store.get("meta") or {}).get("vault_root")
        if not raw:
            raise VaultCollectError(
                "The room doesn't know where your vault is yet -- bring your "
                "vault in once and it will remember.",
                fatal=True, reason="no_vault_root")
        root = Path(str(raw))
    if not root.is_dir():
        raise VaultCollectError(
            VAULT_MISSING_MESSAGE, fatal=True, reason="vault_missing")
    return root


#: The plain words for a vault the room cannot place, named ONCE
#: (T-26.97-22 / T-26.97-37, /gsd-secure-phase 2026-08-19). The server used to
#: recover this sentence by calling `_vault_root` with a fabricated path and
#: reading the exception -- clever, but it made user-visible copy depend on an
#: exception path in another module, and it returned the EMPTY STRING if that
#: path ever stopped raising, handing her a blank error. A name cannot go
#: blank.
VAULT_MISSING_MESSAGE = "The room couldn't find your vault where it last saw it."


def _exclusion_segments(exclude_folders):
    """The exclusion list as lists of whole path segments, via the ONE shipped
    spelling of what a folder entry means (`study_lib.roster_segments`).
    Segment-wise and whole, never a string prefix."""
    out = []
    for entry in (exclude_folders or ()):
        seg = study_lib.roster_segments(entry)
        if seg:
            out.append(seg)
    return out


def _excluded(rel_parts, segments):
    """True when this vault-relative path begins with an excluded folder's
    whole segments.

    ⚠ CAPITALS IGNORED, 2026-08-19, to stay with `_origin_under_roster` under
    the owner's ruling. The three matchers must not drift, and folding only
    one of them would be a drift: a folder she kept OUT of the room would come
    in whenever the spelling of its capitals differed. Folding here can only
    ever keep MORE out, never less."""
    folded = [p.casefold() for p in rel_parts]
    for seg in segments:
        if folded[:len(seg)] == [x.casefold() for x in seg]:
            return True
    return False


def _stable_id(rel_posix, path, kind):
    """This note's fetch-memory id: WHERE IT LIVES plus a fingerprint of what
    is in it (`26.97-DECISIONS.md` DECISION 2 = `where-plus-fingerprint`).

    Where-alone is the trap she was shown and rejected: edit a note and the
    room would say "I already have that one" and never look again, her edit
    would never arrive, and every check would still pass.

    ⚠ THE DRIVEN PROOF NOW EXISTS AND IT IS NOT IN THIS FILE. Plan 26.97-05
    owns the fetch memory and measured this function rather than assuming it:
    the ruled shape was already in place here, so the required red could only
    come from an instrument, and it does. `VaultLiveness` in
    tests/test_obsidian_vault.py replaces THIS FUNCTION with the
    `where-it-lives` shape from inside the collect flow and the edited-note
    case reddens -- her edit never reaches the store, staging comes back
    empty, and the unchanged-vault control passes in the same run.

    ⛔ The fingerprint is the WHOLE hash, not the sixteen-character id the
    importer uses for a filename. `hash_item` returns both; taking the short
    one would still be `where-plus-fingerprint` in shape, but it would narrow
    the fingerprint for no gain."""
    try:
        _id16, full = study_lib.hash_item(path, kind)
    except OSError as e:
        raise VaultCollectError(
            "One note couldn't be read just now.",
            fatal=False, reason="unreadable") from e
    return "%s@%s" % (rel_posix, full[:16])


def list_folders(library_root=None, vault_root=None):
    """Sorted top-level folder names in her vault, for the exclusion picker
    (consumed by plan 26.97-08).

    ⛔ ONLY FOLDER NAMES LEAVE THIS FUNCTION. No note title, no body, no file
    path. Hidden directories are omitted -- they are never user content.

    ⚠ It takes an argument where the Notes one takes none, and the difference
    is honest rather than accidental: Apple Notes is a single global library
    the OS can be asked about, while a vault is a directory this room has to
    be told about. It reads the same `meta.vault_root` the collect does."""
    root = _vault_root(library_root, vault_root)
    names = set()
    try:
        for entry in root.iterdir():
            if entry.is_dir() and not entry.name.startswith("."):
                names.add(entry.name)
    except OSError as e:
        raise VaultCollectError(
            "The room couldn't read your vault just now.",
            fatal=True, reason="vault_missing") from e
    return sorted(names)


def _folder_segments_from_walk(root):
    """Every folder in `root`, at any depth, as a set of whole-segment tuples
    relative to `root`.

    ⛔ NO TRAVERSAL IS WRITTEN HERE. The folders are the PARENTS of the files
    the SHIPPED walker already found, plus every ancestor of those parents. A
    second walk would be a second thing to drift from the guards
    `study_lib.walk_source` already carries -- hidden directories pruned,
    symlinks refused two independent ways, iCloud placeholders detected -- and
    those guards are the reason a symlinked folder like her real `assets` never
    reaches the picker at all.

    ⚠ THE HONEST COST, STATED RATHER THAN HIDDEN: a folder holding no
    importable file anywhere beneath it does not appear. Nothing in the room
    can ever come from such a folder, so a row for it would protect nothing
    today -- but if she later drops a note into it, it appears then, and the
    fence has always matched on the entry rather than on this list.

    ⛔ A VAULT THIS COULD NOT READ IN FULL RAISES RATHER THAN ANSWERING A
    SHORTER SET. The discriminator is the shipped walker's own error channel:
    ANY error reported while walking her vault. Two of her rulings meet here
    and both are ⛔ TIER 2 -- an agent wrote the question and the option
    labels and she picked one; she typed no prose at either stop:

      * a vault the room could not read **AT ALL** -- her `26.96-KNOWN-
        LIMITATIONS.md` § 11 ruling, *if the room could not read your vault at
        all, it says nothing*, built by `26.96-31`.
      * a vault the room could read only **IN PART** -- her ruling of
        2026-08-23 at `26.96-34` question 2. She was asked *when the room can
        read most of your vault but cannot open one folder, what should it
        offer you?* and chose `Offer nothing until it can read all of it`,
        with the cost in front of her: *one folder unavailable for a moment
        empties the whole list for that visit, with nothing said. Your vault
        is very large and on iCloud, so that will happen.*

    ⛔ SO A PARTIAL READ NOW BEHAVES EXACTLY AS A WHOLE FAILURE DOES, and
    that is a DECISION rather than a simplification. Until 2026-08-23 a folder
    the room could not open was simply absent from the answer and nothing was
    said -- the *quietly shorter list* this phase's contract calls worse than
    no list at all.

    ⛔ AND THE ROOM SAYS NOTHING TO HER WHEN IT HAPPENS. That silence is
    hers, taken with option B's own cost line in front of her. ⛔ No sentence
    exists for this state and none may be added without asking her.

    ⛔ THE RAISE CARRIES THE SAME FIXED WORDS AND THE SAME reason AS THE
    WHOLLY-UNREADABLE CASE, DELIBERATELY. Minting a second message would be an
    agent writing front-facing copy for a state she was never shown, and she
    was NOT asked whether the two states should be tellable apart afterwards.
    Nothing here reaches her eyes in any case: the client fails closed into the
    deliberate silence and says nothing at all."""
    # ⛔ THE ERROR IS COUNTED AND DISCARDED, NEVER CARRIED. The shipped
    # walker's error channel hands back an error object that carries a real
    # path inside her vault. Nothing derived from it may reach a message,
    # a log line, a record or a raised cause -- so this callback keeps no part
    # of it, formats nothing, and appends a bare marker instead.
    errors = []

    def _note_unreadable(_err):
        errors.append(1)

    candidates, _skips = study_lib.walk_source(str(root),
                                               onerror=_note_unreadable)
    root_path = Path(str(root))
    out = set()
    for path, _kind in candidates:
        try:
            rel = Path(path).relative_to(root_path)
        except ValueError:
            continue            # outside the vault: not ours to offer
        parts = rel.parts[:-1]  # the file's own folder, from the vault root
        for i in range(1, len(parts) + 1):
            out.add(parts[:i])
    # ⛔ THE DISCRIMINATOR, AND BOTH BRANCHES READ IT, so neither is dead
    # code. ANY error reported while walking her vault means the room could
    # not read all of it, and the answer is NOTHING rather than a shorter list
    # standing for *the read succeeded*. The message carries no interpolation
    # and no cause, because both would name her filesystem.
    #
    # ⛔⛔ THIS CONDITION USED TO READ `if errors and not out:` -- an error
    # reported WITH readable folders still in the result answered the shorter
    # list and said nothing. ⛔ THAT WAS NOT AN OVERSIGHT AND WIDENING IT WAS
    # NOT A REPAIR: `26.96-31` deliberately left it, wrote down that changing
    # what she is OFFERED is a ruling rather than a repair, and routed it to
    # her. She ruled it on 2026-08-23 (`26.96-34` question 2, ⛔ TIER 2):
    # `Offer nothing until it can read all of it`.
    #
    # ⛔ NARROWING IT BACK IS HERS TOO. Do not "improve" this in either
    # direction, and do not add a flag, a key, a return-shape change or a log
    # line for it -- those are shapes she has not been shown.
    if errors:
        raise VaultCollectError(
            "The room couldn't read your vault just now.",
            fatal=True, reason="vault_unreadable")
    return out


def _fence_can_act(root, parts):
    """True when the SHIPPED fence predicate really reaches this folder.

    ⛔ THE PREDICATE IS ASKED, NEVER RE-IMPLEMENTED. A test -- or a filter --
    that re-expresses the match agrees with any defect in the shipped one, and
    that trap has landed on this project nine recorded times. This asks
    `study_lib._origin_under_roster` the same question the import's born-flag
    and the retroactive stamp ask: given this entry, is a thing living at this
    path fenced?

    ⚠ WHAT IT REALLY EXCLUDES, measured on her own vault: `assets` and
    `tokens`, two symbolic links at her vault's top level that resolve into a
    different place inside the same vault. Both are offered by the shipped
    top-level route today and the fence can act on NEITHER
    (`26.96-30-MEASUREMENTS.md` § 3). ⛔ A row that looks like protection and
    protects nothing is the defect the picker exists to end."""
    entry = "/".join(parts)
    probe = Path(str(root)).joinpath(*parts)
    return study_lib._origin_under_roster(str(probe), str(root), [entry])


def list_folder_paths(library_root=None, vault_root=None):
    """EVERY folder in her vault, at any depth, as sorted lists of whole path
    segments -- the source her D-A ruling names (owner sitting 2026-08-22,
    ⛔ TIER 2: an orchestrator wrote the option label and she chose it; she
    wrote no prose).

    ⛔ ONLY FOLDER NAMES LEAVE THIS FUNCTION. No note id, no note title, no
    body, and NO FULL FILESYSTEM PATH. Each entry is a LIST OF SEGMENTS and
    never a joined string, so the serialised answer carries no path separator
    at all and no segment of her home directory can ride in on one. The path
    the fence acts on is joined on her own machine, by the client.

    ⛔ THE SHIPPED ROUTE IS NOT REUSED, AND THAT IS THE MEASURED OUTCOME
    RATHER THAN AN OMISSION. `list_folders` answers TOP-LEVEL names only (17
    on her vault); her ruling is the whole tree (194). A route that answered
    a seventeenth of what she chose would be the picker quietly narrowing her
    own decision.

    ⛔ EVERY OFFERED NAME IS ONE THE FENCE CAN ACT ON, filtered HERE, on the
    server. A client-side filter would be a second rule to drift from this
    one, on the room's strongest privacy control.

    ⛔ A VAULT THE ROOM COULD NOT READ **AT ALL** RAISES `VaultCollectError`
    with the adapter's own plain words -- never a zero-length list standing
    for a read that succeeded. A privacy list that quietly shrinks to nothing
    is worse than no list at all, because the page then speaks about her vault
    on the strength of the room's own failure.

    ⛔ A VAULT THE ROOM COULD READ ONLY **IN PART** IS REFUSED EXACTLY AS A
    VAULT IT COULD NOT READ AT ALL IS REFUSED, and the paragraph above is the
    whole of what happens. The discriminator in `_folder_segments_from_walk`
    fires on ANY error the shipped walker reports; this member propagates that
    refusal untouched; `server._ADAPTER_COLLECT_ERRORS` maps it; and the route
    answers 400 carrying the adapter's own plain fixed words. ⛔ Driven end to
    end -- discriminator to status code -- in `tests/test_folder_enumeration.py`
    case 8, which prints what this docstring claims beside what the code does,
    by value, on every run.

    ⛔ IT IS HER DECISION AND IT IS TAKEN. RULING S of 2026-08-23, at
    `26.96-34` question 2 -- ⛔ TIER 2, APPROVED AS SHOWN: an agent wrote the
    question and the option labels, she picked one, and she typed no prose.
    She was asked *when the room can read most of your vault but cannot open
    one folder, what should it offer you?* and chose `Offer nothing until it
    can read all of it`, with that option's own cost in front of her: *one
    folder unavailable for a moment empties the whole list for that visit,
    with nothing said. Your vault is very large and on iCloud, so that will
    happen.* ⛔ THE SILENCE IS PART OF WHAT SHE CHOSE, not a gap nobody got
    to. No sentence exists for this state and none may be written without
    asking her.

    ⛔ THE TWO UNREADABLE SHAPES ARE DELIBERATELY INDISTINGUISHABLE ON THE
    WIRE, AND THE CLIENT FAILS CLOSED AND **SILENT** INTO BOTH. That is a
    decision rather than an oversight: a page that could tell them apart would
    be speaking about her vault on the strength of the room's own failure to
    look, which is the thing the refusal exists to prevent. ⛔ She was not
    asked whether the two should be tellable apart afterwards, so the same
    fixed words and the same `reason` are reused and no second message is
    minted.

    ⛔ REVERSING THIS IS HERS TOO, AND THIS PARAGRAPH IS NOT AN OPENING TO IT.
    The reasoning and the reservation live on the discriminator itself: read
    `_folder_segments_from_walk`'s comment ending `NARROWING IT BACK IS HERS
    TOO` before touching anything here. ⛔ An agent may not narrow it in
    either direction. If a sentence in this docstring would be easier to write
    were the code different, that sentence is wrong, not the code -- which is
    exactly how the paragraph that stood here became false.

    ⚠ WHAT THE MARK BELOW HOLDS AND WHAT IT DOES NOT, WRITTEN DOWN RATHER
    THAN IMPLIED. Case 8 lifts that one line from this file ON DISK and
    compares it against this member driven on a partly-unreadable vault, so
    the CLAIM cannot go stale the way the paragraph it replaced did. ⛔ It
    does not read the prose around it, and it reaches no claim in this
    docstring that carries no mark. That reach question has ONE filed home --
    `.planning/todos/pending/2026-08-22-doc-behaviour-mark-reach.md` -- so a
    later widening lands in one place, and this sentence is not a licence to
    trust the rest of this paragraph more than a reader trusts prose.

    DOC-BEHAVIOUR-MARK: partial_read raises
    """
    root = _vault_root(library_root, vault_root)
    # ⛔ NO `except OSError` WRAPPER HERE. The raise now happens inside the
    # listing member, where the discriminator lives, so a wrapper here would
    # be unreachable -- dead code reading as a live guard.
    segments = _folder_segments_from_walk(root)
    return [list(parts) for parts in sorted(segments)
            if _fence_can_act(root, parts)]


def collect(library_root, staging_dir, exclude_folders=(), progress_cb=None,
            stats=None, vault_root=None):
    """Copy genuinely-new vault notes into `staging_dir`, KEEPING HER FOLDER
    SHAPE, and return the list of collected ids.

    ⚠ THE LEDGER IS THE CALLER'S TO COMMIT, and this is the shipped invariant
    kept verbatim: the caller commits the fetch memory AFTER the import
    succeeds, never before, so a failed import does not lose what it fetched.
    This function never writes the ledger.

    The walk is `study_lib.walk_source`, so hidden directories are pruned,
    symlinks are refused two independent ways, an iCloud placeholder is
    detected before anything hashes it, and oversize/unknown files are skipped
    with counts. The exclusion is applied to the walker's output BEFORE any
    note is read, hashed or copied -- a note from a folder she keeps private
    never enters the scratch area.

    `progress_cb(done, total)` is called once per staged note.
    `stats`, when a dict is passed in, is filled with `attempted`, `staged`
    and the per-reason `skipped` counts, so the room can report an honest
    N-of-M readout and say out loud what it left behind (law 6, SRM-02).

    ⛔ A FOLDER THE ROOM COULD NOT OPEN IS COUNTED INTO THAT BAG, under her
    RULING U of 2026-08-23 (`26.96-37` question 2, ⛔ TIER 2). ⛔ ONLY THE
    COUNTING HALF EXISTS: the sentence that tells her about it is OWED TO HER
    at a candidate sitting and no agent may write it.

    ⛔ THE TRADE, BOTH HALVES OF IT. WHAT THE TALLY LUMPS: the count joins the
    `unreadable` reason this function already mints, so an unopenable FOLDER
    and an unreadable NOTE are one number -- see the block above the walk for
    why that is her decision rather than a shortcut. ⛔ AND WHAT IT
    DELIBERATELY DOES NOT COUNT: a folder SHE KEPT PRIVATE. The exclusion is
    consulted BEFORE the count, so a fenced folder that happens to be
    unopenable leaves the bag exactly as a fenced-and-readable folder does.
    Nothing behind it was ever coming in, so the import lost nothing; and a
    count of it would be a number derived from her fenced list, in a bag that
    is copied WHOLE into the progress report the browser polls.

    ⚠ THE TALLY WAS THREE-WAY AND SAID IT WAS TWO-WAY, AND THAT IS WHY THIS
    PARAGRAPH EXISTS. Until `26.96-43` the third member was her own fenced
    folder, disclosed nowhere. It is now not counted at all, and the two
    remaining members are the two named above.

    The caller hands `staging_dir` to `study_lib.import_folder` with
    `staged_from=<the vault root>` -- that is what keeps each note's recorded
    origin pointing at the real file in her vault rather than at a scratch
    directory that is about to be deleted.
    """
    from adapters import _ledger

    root = _vault_root(library_root, vault_root)
    staging = Path(staging_dir)
    staging.mkdir(parents=True, exist_ok=True)

    segments = _exclusion_segments(exclude_folders)
    # ⛔⛔ A FOLDER THE ROOM COULD NOT OPEN IS COUNTED. HER RULING, 2026-08-23,
    # VERBATIM: **"Count it and tell you"** -- RULING U, at the blocking
    # sitting of `26.96-37`, question 2. ⛔ TIER 2, APPROVED AS SHOWN: an agent
    # wrote the question and the option labels, she picked one, and she typed
    # no prose.
    #
    # ⛔⛔ ONLY THE COUNTING HALF IS BUILT HERE, AND THE OTHER HALF IS OWED TO
    # HER. Option B's own cost line said the sentence that tells her is a
    # separate sitting, and she took the option with that in front of her.
    # ⛔ NO SENTENCE EXISTS FOR THIS STATE, none was shown to her, and no agent
    # may write one. Do not "finish the job" by adding a line to the readout.
    #
    # WHAT THIS COSTS HER TODAY, MEASURED BEFORE SHE WAS ASKED AND SHOWN TO
    # HER (`26.96-37-MEASUREMENTS.md` § A): ten notes existed, three of them
    # inside a folder the room could not open; SEVEN were staged, `attempted`
    # read SEVEN, the whole skip bag came back with every count zero and no
    # exception. The readout said *7 of 7* over an import that had silently
    # lost three notes.
    #
    # ⛔ THE TRADE, STATED RATHER THAN HIDDEN: the count JOINS the reason key
    # this function already mints below, so a folder that could not be OPENED
    # and a note that could not be READ become ONE NUMBER. ⛔ If that number is
    # ever rendered, the two are INDISTINGUISHABLE. That is deliberate: she was
    # explicitly NOT asked whether the two should be tellable apart (RULING U,
    # *what she was not asked*, item 3), and minting a second key would be an
    # agent taking that decision for her.
    #
    # ⛔ AND THE OTHER HALF OF THE TRADE, WHICH THIS COMMENT USED TO LEAVE OUT:
    # WHAT THE TALLY DOES NOT COUNT. A folder SHE KEPT PRIVATE is not counted,
    # even when the room could not open it. ⚠ AMENDED BY `26.96-43`: as first
    # written the tally was THREE-way -- an unopenable folder, an unreadable
    # note, AND a fenced folder that happened to be unopenable -- while this
    # comment, the docstring above and her own register all said two. She was
    # never asked about the third. The callback below now consults the
    # exclusion before it counts, so the trade is two-way again and the two
    # members are the ones named in the paragraph above.
    #
    # ⚠ AND WHAT IT IS WORTH TODAY, MEASURED: NOTHING SHE CAN SEE.
    # `26.96-37-MEASUREMENTS.md` § B drove the after-import readout with this
    # exact key and it returned ZERO LINES -- three times, including on the
    # real bag shape this function hands over -- while a positive control in
    # the same run returned a real sentence. The room now KNOWS; she is still
    # not told, and that gap is hers to close.
    #
    # ⛔ `study_lib.walk_source` IS NOT EDITED. Its `onerror=None` default is
    # the shipped posture and it is what keeps every other caller byte-
    # unchanged (`26.96-31` truth 4). The parameter already exists; this
    # passes it. No new key, no changed default, no new parameter.
    #
    # ⛔ THE ERROR IS READ, COMPARED AND DROPPED -- NEVER CARRIED. The walker's
    # error object carries a real path inside her vault, and the skip bag is
    # copied WHOLE into the progress report the browser polls, so nothing
    # derived from that error may reach a message, a log line or a record.
    # ⚠ AMENDED BY `26.96-43`, because the difference is one a reader must be
    # told about: this callback used to keep no part of the error AT ALL, and
    # it now RESOLVES the error's path in order to DISCARD it. The resolved
    # value is compared against her exclusion and goes out of scope with the
    # frame; nothing is formatted, logged, stored or returned, and what is
    # appended is still a bare marker -- the same posture
    # `_folder_segments_from_walk` takes, for the same reason.
    unopenable = []

    # ⛔⛔ THE EXCLUSION IS CONSULTED BEFORE THE ERROR IS COUNTED. A folder SHE
    # KEPT PRIVATE that could not be opened is NOT an import loss: nothing
    # behind it was ever coming in, so nothing was lost -- and a count of it
    # would be a number derived from her fenced list sitting in the bag the
    # browser polls, which is the very thing the kept-out-count rule below
    # refuses, for law 3 and law 7 rather than for tidiness. Her RULING U is
    # framed entirely around notes that never arrive.
    # ⚠ `segments` is the list ALREADY computed above for this call, and the
    # matcher is `_excluded` and nothing else. Three matchers for what a
    # folder entry means already live in this file; a fourth spelling here is
    # how they would begin to drift.
    #
    # ⛔ IT FAILS TOWARD NOT COUNTING, AND THE REASON BELONGS HERE. An error
    # whose path is absent, empty, or does not resolve under the vault root is
    # not counted. Whether a fenced-and-unopenable folder should be counted AT
    # ALL may be HERS rather than an agent's -- she was explicitly not asked,
    # and RULING U records that she was not -- so until she rules, the code
    # takes the answer that invents nothing. The question is filed as possibly
    # hers, not settled here.
    def _note_unopenable_folder(err):
        try:
            rel = Path(getattr(err, "filename", "") or "").relative_to(root)
        except (ValueError, TypeError):
            return           # not ours to place: fail toward not counting
        if _excluded(rel.parts, segments):
            return           # hers, kept private: it was never coming in
        unopenable.append(1)

    candidates, skips = study_lib.walk_source(
        str(root), onerror=_note_unopenable_folder)
    if unopenable:
        skips["unreadable"] = skips.get("unreadable", 0) + len(unopenable)

    # ⚠ THE EXCLUSION LIVES HERE, at enumeration, and nowhere else. Everything
    # below this loop -- the fingerprint, the ledger compare, the copy -- only
    # ever sees notes she has not kept out.
    kept = []
    excluded = 0
    for path, kind in candidates:
        try:
            rel = Path(path).relative_to(root)
        except ValueError:
            continue          # outside the vault: not ours to bring in
        if _excluded(rel.parts, segments):
            excluded += 1
            continue
        kept.append((path, kind, rel))
    # ⛔ THE KEPT-OUT COUNT DOES NOT GO IN THE SKIP BAG, and this is law 3 and
    # law 7, not tidiness (T-26.97-38, /gsd-secure-phase 2026-08-19). That bag
    # is copied WHOLE into the progress report the browser polls, and the only
    # thing that kept the number off her screen was an unrelated guard in a
    # different function -- one that five sibling guards were widened this
    # phase. Rendered, it would have counted her private folders back at her
    # AND promised the room would try them again next time. The picker's own
    # rule is that no count is ever rendered: not of what she kept out, not of
    # what comes in, not in a confirmation.
    # ⚠ The genuine skip REASONS stay in the bag -- placeholders and
    # unreadable files are reported, never silently dropped (T-26.97-06).
    # `excluded` is deliberately not one of them: a folder she chose to keep
    # out is not a failure, and does not belong beside the failures.
    del excluded

    ledger = _ledger.load(library_root, SOURCE)
    ids_in_order = []
    by_id = {}
    unreadable = 0
    for path, kind, rel in kept:
        try:
            note_id = _stable_id(rel.as_posix(), path, kind)
        except VaultCollectError as e:
            if e.fatal:
                raise
            unreadable += 1
            continue
        ids_in_order.append(note_id)
        by_id[note_id] = (path, rel)
    if unreadable:
        skips["unreadable"] = skips.get("unreadable", 0) + unreadable

    fresh = _ledger.new_ids(ledger, ids_in_order)
    total = len(fresh)
    collected = []
    for i, note_id in enumerate(fresh, 1):
        path, rel = by_id[note_id]
        target = staging / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(path, target)   # snapshot; original untouched
        except OSError:
            skips["unreadable"] = skips.get("unreadable", 0) + 1
            continue
        collected.append(note_id)
        if progress_cb is not None:
            progress_cb(i, total)

    if stats is not None:
        stats["attempted"] = len(ids_in_order)
        stats["staged"] = len(collected)
        stats["skipped"] = dict(skips)
    return collected


def mark_origin(store, staging_dir, vault_root=None):
    """Stamp `from_source='obsidian-vault'` on every store item this collect
    brought in, and return the count marked.

    ⚠ THE MATCH BASIS DIVERGES FROM BOTH SHIPPED ADAPTERS, on purpose (module
    docstring, divergence 2). They ask whether an item's origin is lexically
    inside the scratch directory; here the origin is deliberately the TRUE
    vault path, so that question would answer no for every item. This one
    walks the scratch directory, rebuilds the true origin each staged file
    corresponds to, and marks membership in that set -- which is still exactly
    "this collect's items" and nothing wider.

    Without a vault root it falls back to the shipped lexical test, so the
    two-argument call shape the route uses keeps working.

    The marker is additive and idempotent: it never touches `source`, `title`
    or `state`, and `from_source` is never emitted in the librarian payload."""
    staging = Path(staging_dir)
    origins = None
    if vault_root:
        base = Path(str(vault_root))
        origins = set()
        for path in staging.rglob("*"):
            if path.is_file():
                origins.add(os.path.normpath(os.path.abspath(
                    str(base / path.relative_to(staging)))))
    marked = 0
    for item in store.get("items", {}).values():
        origin = item.get("origin_path")
        if not origin:
            continue
        if origins is None:
            hit = _under(origin, str(staging))
        else:
            hit = os.path.normpath(os.path.abspath(str(origin))) in origins
        if hit:
            item["from_source"] = SOURCE
            marked += 1
    return marked
