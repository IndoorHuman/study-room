"""Apple Notes export front-end (Phase 26.65, ADP-01).

Turns Apple Notes into a folder the shipped importer already ingests (D-03):
enumerate note ids + folders via osascript, export each body HTML through the
stdlib `html.parser`, and write a path-safe `.md` per note into a staging dir.
study_lib.import_folder does the rest, so notes land as `unseen` with every
solved edge case (dedup, unseen-state, fence inheritance, honest ETA) reused
from upstream (law 2, D-04, SRM-08).

Design constraints held here:
  - ZERO new runtime deps (law 8): osascript (a macOS built-in) + stdlib only.
  - A collect runs ONLY on an explicit user gesture (law 1, D-01) — this module
    has no clock/interval/poll construct of any kind.
  - The AppleScript is built from module-level CONSTANTS only; a note id is
    passed as an osascript ARGUMENT, never interpolated into the script source
    (T-26.65-01, tampering/elevation). subprocess uses an argument list with
    shell=False (T-26.65-02, injection).
  - Staging filenames are SERVER-generated from the note's own first line, then
    path-sanitized (separators + traversal stripped) so a stem can never escape
    staging (T-26.65-03, path traversal). The stem stays human-recognizable so
    the imported note reads as itself in the room; because import_folder sets
    item.title = path.name, that title can carry the note's sensitive first
    line — path-safe but NOT content-safe, which is exactly why Plan 04 adds
    the unseen-Notes-title librarian fence. The on-disk library file is still
    the content-hash id, so the title is display-only.

Text-first for the demo (RESEARCH Pitfall 4): note bodies convert to Markdown;
inline attachment fidelity is a labeled stretch and MUST NOT block the demo.
"""
import os
import subprocess
from html.parser import HTMLParser
from pathlib import Path

# The stable source label + ledger key. Notes' `id of note` (an x-coredata URL)
# survives re-export, which is what the candle re-pull dedups on (ADP-03).
SOURCE = "apple-notes"

# osascript timeout (seconds). A hung Notes/AppleEvents call surfaces as a
# calm retryable error, never an indefinite hang.
_OSASCRIPT_TIMEOUT = 120


# --- AppleScript, built from CONSTANTS only (no note content ever enters) ----
#
# Enumerate: one line per note, tab-delimited `<id>\t<folder>`. The id is the
# stable ledger key; the folder feeds exclude_folders. No note body/title is
# read here, so nothing sensitive enters the enumeration transport.
_ENUMERATE_SCRIPT = (
    # Per-FOLDER enumeration (26.65-06 live-UAT fix): the flat all-notes loop
    # died with -1700 on the real library — `name of container of n` cannot
    # coerce through the item reference chain Notes hands back. The folder
    # name is read from the folder itself (the proven _LIST_FOLDERS_SCRIPT
    # pattern) and `id of notes of f` is ONE Apple event per folder (a list),
    # not one per note — live-verified 350 notes in ~0.2s.
    'tell application "Notes"\n'
    '  set out to ""\n'
    '  repeat with f in folders\n'
    '    set fname to name of f as text\n'
    '    set idList to id of notes of f\n'
    '    repeat with i in idList\n'
    '      set out to out & (i as text) & tab & fname & linefeed\n'
    '    end repeat\n'
    '  end repeat\n'
    '  return out\n'
    'end tell\n'
)

# List the Notes folder names for the exclusion picker (Plan 04). A constant
# script with NO argument: no note content, no user text, and no folder name
# ever enters the script source (T-26.65-14) — the exclude compare happens
# python-side in collect(), against these enumerated names.
_LIST_FOLDERS_SCRIPT = (
    'tell application "Notes"\n'
    '  set out to ""\n'
    '  repeat with f in folders\n'
    '    set out to out & (name of f as text) & linefeed\n'
    '  end repeat\n'
    '  return out\n'
    'end tell\n'
)

# Export ONE note's body HTML, keyed by the note id passed as argv item 1. The
# id is an ARGUMENT — never formatted into the script — so a hostile note can
# never inject AppleScript (T-26.65-01).
_EXPORT_SCRIPT = (
    'on run argv\n'
    '  set noteId to item 1 of argv\n'
    '  tell application "Notes"\n'
    '    return body of note id noteId\n'
    '  end tell\n'
    'end run\n'
)


class NotesCollectError(Exception):
    """A collect could not reach Notes — carries a plain, retryable message
    (never a traceback). The route turns it into an EXPORT_JOB error line."""


class _Notes2Text(HTMLParser):
    """Convert a Notes body (HTML) to readable Markdown with the stdlib parser
    only (law 8 — no markdownify/html2text). Structural mapping only; law 4
    binds DISPLAY, and the imported artifact is the converted note (never
    summarized or reworded — only structurally converted from HTML)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._out = []

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "p", "div", "tr"):
            self._out.append("\n")
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._out.append("\n\n## ")
        elif tag == "li":
            self._out.append("\n- ")

    def handle_endtag(self, tag):
        if tag in ("p", "div", "ul", "ol", "tr",
                   "h1", "h2", "h3", "h4", "h5", "h6"):
            self._out.append("\n")

    def handle_data(self, data):
        self._out.append(data)

    def text(self):
        raw = "".join(self._out)
        # collapse runs of blank lines to at most one, trim each line's tail
        lines = [ln.rstrip() for ln in raw.splitlines()]
        cleaned = []
        blank = False
        for ln in lines:
            if ln.strip() == "":
                if not blank and cleaned:
                    cleaned.append("")
                blank = True
            else:
                cleaned.append(ln)
                blank = False
        return "\n".join(cleaned).strip() + "\n"


def _html_to_markdown(html):
    """Body HTML -> Markdown string (stdlib only)."""
    parser = _Notes2Text()
    parser.feed(html or "")
    parser.close()
    return parser.text()


def _first_line(markdown):
    """The note's human title = its first non-empty line, with any leading
    Markdown heading/list markers peeled off."""
    for ln in markdown.splitlines():
        s = ln.strip().lstrip("#").strip().lstrip("-").strip()
        if s:
            return s
    return ""


def _safe_stem(title, fallback="note"):
    """A path-safe, human-recognizable filename stem derived from the note's
    first line. Strips path separators and `..` traversal so the stem can never
    escape staging; it is NOT content-scrubbed (the note stays itself)."""
    stem = (title or "").replace("/", " ").replace("\\", " ")
    stem = stem.replace("\x00", "").replace("..", ".")
    # no leading/trailing dots or spaces (no hidden files, no traversal tail)
    stem = stem.strip().strip(".").strip()
    stem = stem[:80].strip().strip(".").strip()
    return stem or fallback


def _unique_target(staging, stem):
    """A `<stem>.md` path in staging, disambiguated with a numeric suffix so
    two notes sharing a title never overwrite each other."""
    target = staging / (stem + ".md")
    n = 2
    while target.exists():
        target = staging / ("{}-{}.md".format(stem, n))
        n += 1
    return target


def _run_osascript(script, *args):
    """The ONE osascript seam (the single point unit tests patch). Runs
    `osascript -e <script> [arg ...]` with an argument list and shell=False —
    a note id passed as an arg is never shell- or script-interpolated. Returns
    stdout as text; a non-zero exit or an AppleEvents authorization failure
    (-1743) raises NotesCollectError with a plain, retryable message."""
    cmd = ["osascript", "-e", script]
    cmd.extend(args)
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=_OSASCRIPT_TIMEOUT, check=False)
    except FileNotFoundError as e:
        raise NotesCollectError(
            "osascript isn't available on this computer, so the room can't "
            "reach Notes.") from e
    except subprocess.TimeoutExpired as e:
        raise NotesCollectError(
            "Reaching Notes took too long. Try the candle again.") from e
    if proc.returncode != 0:
        err = (proc.stderr or "").strip()
        if "-1743" in err:
            raise NotesCollectError(
                "macOS hasn't allowed the room to reach Notes yet. Approve "
                "the one-time prompt (it names your terminal app), then try "
                "the candle again.")
        raise NotesCollectError(
            "The room couldn't reach Notes just now. Try the candle again.")
    return proc.stdout


def _enumerate_notes():
    """[{id, folder}, ...] for every note, via the enumerate seam."""
    raw = _run_osascript(_ENUMERATE_SCRIPT)
    notes = []
    for line in (raw or "").splitlines():
        line = line.rstrip("\r")
        if not line.strip():
            continue
        parts = line.split("\t")
        note_id = parts[0].strip()
        folder = parts[1].strip() if len(parts) > 1 else ""
        if note_id:
            notes.append({"id": note_id, "folder": folder})
    return notes


def _export_note_body(note_id):
    """The raw HTML body for one note id, via the export seam."""
    return _run_osascript(_EXPORT_SCRIPT, note_id)


def list_folders():
    """Sorted unique Notes folder names for the exclusion picker (Plan 04).

    Runs the constant folder-list script through the ONE seam with NO
    argument — nothing user-typed can ride into the script (T-26.65-14).
    Only names are read: no note id, title, or body enters this transport.
    NotesCollectError propagates with its plain, retryable message."""
    raw = _run_osascript(_LIST_FOLDERS_SCRIPT)
    names = {ln.strip() for ln in (raw or "").splitlines() if ln.strip()}
    return sorted(names)


def collect(library_root, staging_dir, exclude_folders=(), progress_cb=None):
    """Export genuinely-new Apple Notes into `staging_dir` as `.md` files and
    return the list of exported note ids (the caller commits them to the ledger
    AFTER import succeeds — never before, so a failed import doesn't lose them).

    Drops ids already in the ledger AND notes whose folder is in
    exclude_folders (honored here; wired to the UI in Plan 04). Each remaining
    note's body HTML is converted to Markdown and written to a path-safe
    `<stem>.md` in staging. progress_cb(done, total) is called once per note.
    No `.html` file is ever written (it would be a silent importer skip).
    """
    from adapters import _ledger

    ledger = _ledger.load(library_root, SOURCE)
    exclude = set(exclude_folders or ())
    notes = _enumerate_notes()
    ids_in_order = [n["id"] for n in notes
                    if n.get("folder", "") not in exclude]
    fresh = set(_ledger.new_ids(ledger, ids_in_order))
    pending = [n for n in notes
               if n["id"] in fresh and n.get("folder", "") not in exclude]

    staging = Path(staging_dir)
    staging.mkdir(parents=True, exist_ok=True)
    total = len(pending)
    exported = []
    for i, note in enumerate(pending, 1):
        note_id = note["id"]
        markdown = _html_to_markdown(_export_note_body(note_id))
        stem = _safe_stem(_first_line(markdown))
        _unique_target(staging, stem).write_text(markdown, encoding="utf-8")
        exported.append(note_id)
        if progress_cb is not None:
            progress_cb(i, total)
    return exported


def _under(child, parent):
    """True if `child` path is lexically inside (or equal to) `parent`. Purely
    lexical (normpath+abspath, no resolve/stat) so it holds even after the
    staging dir is deleted — it matches against the store's origin_path strings,
    not the filesystem."""
    parent = os.path.normpath(os.path.abspath(parent))
    child = os.path.normpath(os.path.abspath(child))
    return child == parent or child.startswith(parent + os.sep)


def mark_origin(store, staging_dir):
    """Stamp `from_source='apple-notes'` on every store item whose origin_path
    resolves under `staging_dir`, and return the count marked.

    This is the D-03-safe way to tag THIS collect's genuinely-new items without
    forking import_folder (which returns no new-item ids): import_folder records
    origin_path=str(staged_path), and each collect uses a fresh mkdtemp, so only
    this collect's items resolve under staging_dir. The marker is additive and
    idempotent; it never touches source (stays 'folder-drop'), title, or state,
    and `from_source` is never emitted in the librarian payload — it is the
    field Plan 04's unseen-Notes-title fence keys on.
    """
    marked = 0
    for item in store.get("items", {}).values():
        origin = item.get("origin_path")
        if origin and _under(origin, staging_dir):
            item["from_source"] = SOURCE
            marked += 1
    return marked
