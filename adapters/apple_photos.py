"""Apple Photos export front-end (Phase 26.65, ADP-02).

Twin to adapters/apple_notes.py: turns Apple Photos into a folder the shipped
importer already ingests (D-03). Enumerate photo localIdentifiers via
osascript, then for each genuinely-new one export a JPEG rendition
(`export using originals false`) into a staging dir under a SERVER-generated
`<uuid>.jpg`. study_lib.import_folder does the rest, so photos land as
`unseen` with every solved edge case (dedup, unseen-state, honest ETA) reused
from upstream (law 2, D-04, SRM-08).

Design constraints held here:
  - ZERO new runtime deps (law 8): osascript (a macOS built-in) + stdlib only.
    NO third-party photo-library package of any kind, no image/EXIF library —
    the RESEARCH removed the one such package on law-8 grounds (T-26.65-SC).
  - A collect runs ONLY on an explicit user gesture (law 1, D-01) — this module
    has no clock/interval/poll construct of any kind.
  - JPEG, never originals (Pitfall 1): `using originals false` renders the
    current/edited photo to JPEG (HEIC->JPEG). `using originals true` would
    emit HEIC, which the importer skips + counts — importing zero photos.
  - Per-item loop, never a single bulk export (Pitfall 5 anti-pattern): honest
    per-item progress, a single failing asset is isolated (skip-and-continue),
    and a server-generated `<uuid>.jpg` per item guarantees unique staged names
    (a bulk export reuses source filenames and collides — two IMG_0001.jpg).
  - The AppleScript is built from module-level CONSTANTS only; a photo id and
    the staging path are passed as osascript ARGUMENTS, never interpolated into
    the script source (T-26.65-08). subprocess uses an argument list with
    shell=False (injection-safe).
  - Staging filenames are SERVER-generated (uuid4) — never a source filename,
    so a stem can never carry a collision or a traversal (T-26.65-09).

Photos are image-native (law 4, verbatim): the rendition IS the content, so
nothing is filtered, cropped, or decorated on the way in.

WHERE PHOTOS IS ASKED TO WRITE (26.65-07, D-14 — the located-cause correction)
------------------------------------------------------------------------------
On 2026-08-11 an import walked the bar 1 -> 14,016 and brought in NOTHING, at
rc 0 with empty stderr. Photos.app is sandboxed: it is only permitted to write
into certain locations, and a scratch directory under the OS temp root is not
one of them. It does not refuse. It returns success and writes no file.

**The recorded diagnosis named the WRONG LINE, and a fix applied where it
pointed would have changed nothing while looking like it should have worked.**
`D-14` and the DEV-JOURNAL located the fault at the ROUTE's staging directory
(`server.handle_adapter_collect`, `tempfile.mkdtemp(prefix="studyroom-collect-")`).
**That directory is never the one Photos is asked to write to.** `_export_one`
below creates its OWN per-item directory and passes THAT to `_EXPORT_SCRIPT`;
the produced file is only afterwards `shutil.move`d into the route's staging by
python, which has no sandbox restriction at all. The conclusion (the
destination is the fault) was right; the location was wrong. **The operative
directory is the per-item one created in `_export_one`, and that is what the
export root below relocates.** The route's staging directory deliberately STAYS
WHERE IT IS — `mark_origin`'s lexical prefix match depends on its per-collect
freshness, and anything that makes it reusable across collects breaks
`from_source` tagging silently.

Measured on the owner's Mac 2026-08-11, one photo, destination the only
variable, through this module's UNMODIFIED `_EXPORT_SCRIPT`:

    OS temp dir (what shipped)   rc 0, stderr empty, files produced 0
    ~/Pictures/<derived>         rc 0, stderr empty, files produced 1 (.jpeg)
    ~/Downloads/<derived>        rc 0, stderr empty, files produced 0

So the export root is derived under the user's Pictures directory. It is
DERIVED from the signed-in account's home directory — never a spelled path
(D-19: a repair that honoured its prohibition to the letter still leaked a
home path into a file that would ship) — and deliberately NOT from ``Path.home()``
when ``$HOME`` has been swapped (26.997 P3: a throwaway measure ``HOME`` under
``/tmp`` made Photos write to ``/tmp/…/Pictures/…``, which returned rc 0 with
zero files for ~11k ids while real ``~/Pictures/StudyRoom-import`` landed
13,475). **There is deliberately NO fallback to a temporary directory
when the export root cannot be created or written — a silent fallback would
restore this defect exactly.** It raises, fatally, and exports nothing.

WHY A ZERO IS NOW LOUD (the second, worse defect)
-------------------------------------------------
A total failure and a finished job used to look identical from outside: every
failed asset was swallowed by a bare `except ... pass` with NO counter, while
`progress_cb` fired once per ATTEMPTED item (correct, and what law 6 needs for
an honest N-of-M on a long import) — so the bar completed at 14,016 of 14,016
and the job reported success with zero collected. Skips are now counted BY
REASON, and three outcomes are held apart deliberately:

    total == 0                  nothing new to bring in. NORMAL. Silent, never
                                raises — a candle re-pull must keep law 3's
                                silence on zero.
    total > 0, exported == 0    THE DEFECT. Raises FATAL, so the shipped route
                                leaves the ledger unwritten, `connected_sources`
                                un-appended and `ok: True` unreported.
    0 < exported < total        an HONEST PARTIAL. Neither raises nor hides;
                                the skip counts ride out in `stats`.

WHAT A VIDEO IS, AND WHAT IT IS NOT (26.65-08)
----------------------------------------------
A skipped video is NONE of those three. It is not a photo that failed, and a
run that brings in 13,425 pictures and leaves 594 videos where they are is a
SUCCESS, not a partial — nothing went wrong, and the room did everything it
can currently do. So `video` is its own skip bucket, it is subtracted out of
the total-failure test above, and the client excludes it from the count of
what could not be brought in. The one thing said out loud is a fact about the
room (it shows pictures and writing, not video yet), never a fault of hers —
law 3, reward presence, never punish absence.
"""
import atexit
import os
import pwd
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path

# The stable source label + ledger key. A photo's localIdentifier/UUID
# survives re-export, which is what the candle re-pull dedups on (ADP-03) —
# JPEG re-renders produce different bytes, so byte-hash dedup alone cannot.
SOURCE = "apple-photos"

# osascript timeout (seconds). A hung Photos/AppleEvents call surfaces as a
# calm retryable error, never an indefinite hang.
_OSASCRIPT_TIMEOUT = 300

# Staged renditions we accept as-is; anything else is normalized to .jpg. HEIC
# must never appear here (Pitfall 1) — if it does, the item is skipped, not
# renamed (renaming HEIC bytes to .jpg would import an unshowable file).
_ACCEPT_SUFFIXES = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
_HEIC_SUFFIXES = {".heic", ".heif"}

# Video renditions, held apart for EXACTLY the same reason as HEIC and skipped
# by the same non-fatal path (26.65-08). A Photos library is not photos-only:
# hers holds 14,019 items, of which 594 are video (516 .mov + 78 .mp4),
# re-measured read-only 2026-08-11. Every one of them used to fall past the
# HEIC guard to the normalize line below and be RENAMED to .jpg — video bytes
# under a photo's name, which the shipped importer accepts as an image and
# which nothing can ever draw. Driven on her real `sd1505184554_2.mp4` through
# this very function before the guard landed: staged suffix .jpg, 2,447,695
# bytes, first bytes 00 00 00 14 "ftyp" — an ISO media file wearing .jpg, with
# a still-image control in the same run staging real JPEG bytes.
#
# 2.4 MB is well under MAX_IMAGE_BYTES, so the importer's size ceiling never
# catches these; they arrive whole and unshowable. At her scale that is about
# one item in 23 that will not render — and law 2 says only she judges what is
# worth keeping, which is impossible for an item that will not display.
_VIDEO_SUFFIXES = {".mov", ".mp4", ".m4v", ".avi", ".3gp", ".mpg", ".mpeg",
                   ".mkv", ".wmv"}

# --- OVERSIZE: make it smaller rather than refuse it (26.65-09) -------------
#
# Her ruling, 2026-08-11, verbatim: "Resize oversize ones instead." Chosen over
# raising MAX_IMAGE_BYTES to 32 MB (which was recommended to her), over leaving
# it and counting the skips honestly, and over doing both. MAX_IMAGE_BYTES is
# deliberately NOT touched by this module.
#
# She was right, and measurement is why. The recommendation rested on ORIGINAL
# sizes in Photos, but the ceiling applies to the EXPORTED RENDITION, and the
# two barely relate: her three largest still originals (29.1 MB GIF, 25.3 MB
# PNG, 25.1 MB GIF) export to 0.8 MB, 14.2 MB and 0.6 MB. Yet in the 5-photo
# trial of 26.65-07 one rendition WAS refused as oversize. Renditions can
# exceed the cap, and which ones cannot be known without exporting them, so any
# fixed higher number is a bet. Shrinking the few that come out over is not.
#
# THIS AMENDS PRODUCT LAW 4 ("verbatim & undecorated"), and the amendment is
# recorded in CLAUDE.md in her name and dated, in the same form laws 7 and 8
# already carry. Its whole scope: downscaling a photo THAT WOULD OTHERWISE NOT
# ARRIVE AT ALL. It permits nothing else. No crop, no filter, no recolour, no
# re-encode for taste, and NOTHING WHATSOEVER happens to a file that fits --
# a rendition at or under the ceiling is never opened, never copied, never
# handed to sips, and reaches staging byte-for-byte as Photos produced it.
#
# `sips` is a macOS built-in, the same class of dependency as the `osascript`
# this module already shells out to, so law 8 (zero new runtime deps) holds.
# CORRECTION, measured 2026-08-11: it is sometimes said that sips is "already
# used elsewhere in this project". It is NOT -- a whole-repo search returns
# zero files, and the only occurrence anywhere is a researcher's hand-check of
# a PNG parser in 23-PATTERNS.md. This is its first appearance in shipped
# code, justified by "ships with macOS", not by precedent. No third-party
# image library, ever: the RESEARCH removed the one such package on exactly
# these grounds (T-26.65-SC).
_SIPS_TIMEOUT = 120

# Bounded, and bounded on purpose: a photo that will not fit after this many
# reductions is SKIPPED AND COUNTED, never staged broken and never looped over
# forever. Four attempts take a 27.5 MB rendition well past a tenth of its
# original edge, so reaching the give-up path means something genuinely odd.
_RESIZE_ATTEMPTS = 4

# Each further attempt takes the longest edge to this fraction of the last.
_RESIZE_BACKOFF = 0.75

# The first target edge aims slightly UNDER the ceiling rather than exactly at
# it, because file size does not scale perfectly with area. Landing on the
# first attempt is the common case; the backoff exists for when it does not.
_RESIZE_HEADROOM = 0.92

# The one directory name we create under the user's Pictures folder. NOT
# dot-prefixed on purpose: the shipped importer skips dotfiles, so a hidden
# name here would make every rendition invisible to it (`skipped.hidden`).
_EXPORT_ROOT_DIRNAME = "StudyRoom-import"

# The stable token the client keys its third error branch on. Both existing
# client branches would LIE about this failure: the permission branch would
# send her to a setting that is already correct, and the fallback reads
# "Couldn't reach Photos just now" — false, since Photos was reached and
# answered. Pinned on both sides (adapters + tests/test_adapter_sources.cjs).
TOTAL_FAILURE_TOKEN = "none of your photos came back"

_TOTAL_FAILURE_MSG = (
    "The Photos app answered, but " + TOTAL_FAILURE_TOKEN + " — nothing in "
    "your room was changed. Nothing was lost; you can try the candle again.")


def _account_home():
    """The signed-in user's home directory — derived, never spelled (D-19).

    ``Path.home()`` follows ``$HOME``, which throwaway measure harnesses swap
    under ``/tmp/…``; Photos.app only writes renditions into the real account
    ``~/Pictures/…`` tree (26.997 P3). Passwd is the account home regardless
    of a swapped ``HOME``."""
    return Path(pwd.getpwuid(os.getuid()).pw_dir)


def _export_root_parent():
    """The directory Photos will actually write into, DERIVED from the account
    home — never a spelled path (D-19). Returns the PARENT container only; the
    per-run root is an `mkdtemp` inside it, so two collects can never share one
    and freshness is guaranteed by mkdtemp rather than by a name."""
    return _account_home() / "Pictures" / _EXPORT_ROOT_DIRNAME


# --- AppleScript, built from CONSTANTS only (no photo id ever enters) --------
#
# Enumerate: one localIdentifier per line. No filename/date/content is read
# here, so nothing sensitive enters the enumeration transport.
_ENUMERATE_SCRIPT = (
    # Bulk enumeration (26.65-06 live-UAT fix): the per-item repeat issued
    # one Apple event PER photo and never finished on the owner's real
    # 13,977-item library (export stuck at 0/0 until the timeout). `id of
    # media items` is ONE bulk event returning the whole list — the join
    # happens OUTSIDE the tell block (inside it, "text item delimiters"
    # resolves against Photos and errors -10006). Live-verified: 13,977
    # ids in ~0.9s.
    'tell application "Photos"\n'
    '  set idList to id of media items\n'
    'end tell\n'
    "set AppleScript's text item delimiters to linefeed\n"
    'return (idList as text)\n'
)

# --- RECOGNISE FIRST, NEVER COPY (her ruling 2026-08-25) ---------------------
#
# ⛔ HER RULING, 04:03, confirmed from an offered set minutes later: `Yes —
# recognize first, never copy` (record:
# 26.995-OWNER-RULING-2026-08-25-skip-new-videos-and-the-candle-says-so.md).
# Until this, the room discovered a video by EXPORTING IT IN FULL and then
# setting it aside — measured that same night at 1.37 GB streamed for one
# video that the ~2-minute AppleEvent reply window then killed anyway, so for
# her largest videos the old door was not slow, it was CLOSED FOR EVER.
#
# ONE bulk event for ids, one for filenames, joined OUTSIDE the tell block
# (the same -10006 shape as the enumeration above), split by a marker line of
# ours that no filename can span (filenames cannot contain linefeeds).
#
# ⚠ FILENAMES STAY IN THIS PROCESS. They are read for this one decision,
# matched against _VIDEO_SUFFIXES, and discarded — never stored, never staged,
# never sent anywhere. The enumeration script above still reads ids alone;
# its comment stays true of it.
_CLASSIFY_SPLIT = "===STUDYROOM-KIND-SPLIT==="
_CLASSIFY_SCRIPT = (
    'tell application "Photos"\n'
    '  set idList to id of media items\n'
    '  set nameList to filename of media items\n'
    'end tell\n'
    "set AppleScript's text item delimiters to linefeed\n"
    'return (idList as text) & linefeed & "' + _CLASSIFY_SPLIT + '" & '
    'linefeed & (nameList as text)\n'
)


def _video_ids_by_filename(fresh):
    """The subset of `fresh` whose Photos filename carries a video extension —
    recognised by ASKING, never by copying (her ruling 2026-08-25).

    ⚠ FAIL-OPEN BY CONSTRUCTION: any trouble at all — the query erroring, the
    marker missing, the two lists disagreeing in length, an id absent from the
    map — classifies NOTHING and returns the empty set, and the export-side
    video guard in _export_one catches what slips through exactly as before.
    A photograph can therefore only ever be set aside by this path if Photos
    itself names it with a video extension."""
    if not fresh:
        return set()
    try:
        raw = _run_osascript(_CLASSIFY_SCRIPT)
        if not isinstance(raw, str) or _CLASSIFY_SPLIT not in raw:
            return set()
        id_half, name_half = raw.split(_CLASSIFY_SPLIT, 1)
        ids = [ln.strip() for ln in id_half.splitlines() if ln.strip()]
        names = [ln for ln in name_half.splitlines() if ln.strip()]
        if not ids or len(ids) != len(names):
            return set()
        by_id = dict(zip(ids, names))
        out = set()
        for media_id in fresh:
            name = by_id.get(media_id)
            if name and Path(name.strip().lower()).suffix in _VIDEO_SUFFIXES:
                out.add(media_id)
        return out
    except Exception:
        return set()


# Export ONE photo (argv item 1 = its id) as a JPEG rendition into the dest
# folder (argv item 2). BOTH are ARGUMENTS — never formatted into the script —
# so a hostile id or path can never inject AppleScript (T-26.65-08). Photos
# names the file itself; the caller renames it to a server-generated name.
_EXPORT_SCRIPT = (
    'on run argv\n'
    '  set mediaId to item 1 of argv\n'
    '  set destPath to item 2 of argv\n'
    '  tell application "Photos"\n'
    '    set theItem to media item id mediaId\n'
    '    export {theItem} to (POSIX file destPath) using originals false\n'
    '  end tell\n'
    'end run\n'
)


class PhotosCollectError(Exception):
    """A collect could not reach Photos — carries a plain, retryable message
    (never a traceback). `fatal` distinguishes a collect-level failure (missing
    binary, timeout, Automation not yet approved) that must stop the whole run
    from a single-asset export failure that is skipped-and-counted.

    `reason` is the per-reason skip bucket a NON-fatal failure counts into
    (`no_file` | `heic` | `video` | `other`), or `total_failure` on the one fatal error
    that means "N were attempted and none came back" — the route reads that to
    decide whether to retract an unproven `connected_sources` entry."""

    def __init__(self, message, fatal=True, reason="other"):
        super().__init__(message)
        self.fatal = fatal
        self.reason = reason


# ---------------------------------------------------------------------------
# ⛔ A STOPPED ROOM STOPS READING HER PHOTOGRAPHS (26.995-29, G-26.995-6/B-12)
# ---------------------------------------------------------------------------
# On the evening of 2026-08-21 the room's server was killed and the osascript
# child it had started SURVIVED, was reparented to the system (ppid 1), and
# went on reaching into her REAL Photos library one photograph at a time until
# somebody killed it by hand. She closed the room; the room kept reading her
# photographs. Nothing told her, and nothing offered her a way to stop it.
#
# WHY THE OLD SHAPE COULD NOT HELP ITSELF. The room's collect worker is a
# DAEMON thread, and a daemon thread dies with the process — but the child
# PROCESS it started does not, and nothing on any platform ties a child's life
# to its parent's by default. `subprocess.run` hands no one outside the call a
# handle on the running child, so at the moment the room stopped there was
# nothing anywhere that COULD have stopped it. It was not an oversight in a
# teardown; there was no teardown to overlook.
#
# WHAT THIS DOES. Every child this module starts is held in a registry while
# it runs and dropped the instant it finishes, and the interpreter's own exit
# handler stops whatever is still in it.
#
# ⛔⛔ WHAT IS COVERED AND WHAT IS NOT — said plainly, because a comment that
# credits coverage it does not have is worse than no comment at all:
#
#   COVERED      Ctrl+C at the terminal. The room's own KeyboardInterrupt path
#                returns from main(), and the interpreter runs its exit
#                handlers on the way out.
#   COVERED      a polite termination signal, and a closed terminal — but ONLY
#                because `server.install_shutdown_signal_handlers` turns those
#                into an ordinary shutdown. Without that call they are not
#                covered, and this module cannot install it (a signal handler
#                may only be set from the main thread).
#   COVERED      any other ordinary end of the process: a return from main,
#                sys.exit, an unhandled exception.
#   NOT COVERED  ⛔ A HARD KILL — `kill -9`, a force-quit, a power cut. NOTHING
#                can catch one; there is no handler for it on any platform. A
#                room stopped that way WILL still leave a child behind reading
#                her photographs. This module does not claim otherwise, and
#                nothing that reads it may claim otherwise on its behalf.
#   NOT COVERED  a child started by some other part of the room. This registry
#                holds only the children THIS module starts.

# How long a stopping room waits for a child to go quietly before it insists.
_TEARDOWN_GRACE = 2.0

# The children this module has running right now. A `set` of Popen objects,
# added at spawn and discarded in a `finally`, so a finished child is never
# signalled and the registry cannot grow across a long import.
_LIVE_CHILDREN = set()
_LIVE_CHILDREN_LOCK = threading.Lock()
_TEARDOWN_ARMED = False


def _snapshot_children():
    """A copy of the registry that CANNOT hang the room's exit.

    The lock is taken with a timeout on purpose: this runs from the
    interpreter's exit handler, and a teardown that blocked for ever because a
    worker thread was frozen holding the lock would turn "the room is slow to
    close" into "the room will not close" — a second defect on the way to
    fixing the first."""
    got = _LIVE_CHILDREN_LOCK.acquire(timeout=1.0)
    try:
        return list(_LIVE_CHILDREN)
    except RuntimeError:
        return []
    finally:
        if got:
            _LIVE_CHILDREN_LOCK.release()


def _arm_teardown_once():
    """Register the exit handler the FIRST time this module starts a child.

    Deliberately lazy rather than at import: importing this module changes
    nothing about the process that imports it, and a room that never reaches
    Photos registers nothing at all."""
    global _TEARDOWN_ARMED
    got = _LIVE_CHILDREN_LOCK.acquire(timeout=1.0)
    try:
        if _TEARDOWN_ARMED:
            return
        _TEARDOWN_ARMED = True
    finally:
        if got:
            _LIVE_CHILDREN_LOCK.release()
    atexit.register(terminate_live_children)


def _finished(proc):
    """Whether a child is over. Never raises: an unreadable child is treated
    as finished so a teardown cannot get stuck on one."""
    try:
        return proc.poll() is not None
    except Exception:
        return True


def terminate_live_children(grace=None):
    """Stop every child this module still has running; return how many were
    still alive when asked.

    Runs from the interpreter's exit handler, so it fires on every ordinary
    end of the room. Safe to call at any other time and safe to call twice.
    ⛔ It never raises: a teardown that threw on the way out would leave the
    room in a worse state than the defect it exists to fix."""
    if grace is None:
        grace = _TEARDOWN_GRACE
    procs = _snapshot_children()
    stopped = 0
    for proc in procs:
        try:
            if proc.poll() is not None:
                continue
            stopped += 1
            proc.terminate()
        except Exception:
            pass
    # ⚠ BOUNDED BY A DEADLINE, AND DELIBERATELY NOT A `while True`. Law 1
    # forbids a poll construct in an adapter and `tests/test_no_daemon.py`
    # enforces it by name; it caught the first shape of this loop. This one
    # cannot outlive `grace`, and it only ever runs while the room is already
    # on its way out.
    deadline = time.monotonic() + max(0.0, grace)
    for proc in procs:
        while not _finished(proc) and time.monotonic() < deadline:
            time.sleep(0.02)
        if not _finished(proc):
            # It would not go quietly. ⛔ Her photographs are the most
            # sensitive surface in this product: a room she has closed does
            # not get to go on reading them because a child ignored a polite
            # request.
            try:
                proc.kill()
            except Exception:
                pass
    return stopped


def _run_tracked(cmd, timeout):
    """`subprocess.run(cmd, capture_output=True, text=True, timeout=timeout,
    check=False)` with the running child held where a stopping room can reach
    it.

    ⛔ THE CONTRACT OF THE CALL IT REPLACES IS UNCHANGED, on purpose: an
    argument LIST with shell=False (nothing is ever shell-interpolated), text
    output, a CompletedProcess back, and `subprocess.TimeoutExpired` raised —
    after the child is killed and drained, exactly as `subprocess.run` does —
    when it overruns. So a hung Photos call still surfaces as the same calm,
    retryable error it always did. The single difference is that between spawn
    and exit the child is in `_LIVE_CHILDREN` instead of being unreachable
    inside `subprocess.run`."""
    _arm_teardown_once()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True)
    got = _LIVE_CHILDREN_LOCK.acquire(timeout=1.0)
    try:
        _LIVE_CHILDREN.add(proc)
    finally:
        if got:
            _LIVE_CHILDREN_LOCK.release()
    try:
        try:
            out, err = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            try:
                proc.communicate()
            except Exception:
                pass
            raise
        return subprocess.CompletedProcess(cmd, proc.returncode, out, err)
    finally:
        got = _LIVE_CHILDREN_LOCK.acquire(timeout=1.0)
        try:
            _LIVE_CHILDREN.discard(proc)
        finally:
            if got:
                _LIVE_CHILDREN_LOCK.release()


def _run_osascript(script, *args):
    """The ONE osascript seam (the single point unit tests patch). Runs
    `osascript -e <script> [arg ...]` with an argument list and shell=False —
    a photo id or path passed as an arg is never shell- or script-interpolated.
    Returns stdout as text; a missing binary, a timeout, or an AppleEvents
    authorization failure (-1743) raises a FATAL PhotosCollectError; any other
    non-zero exit raises a NON-fatal one (a single asset the caller may skip)."""
    cmd = ["osascript", "-e", script]
    cmd.extend(args)
    try:
        proc = _run_tracked(cmd, _OSASCRIPT_TIMEOUT)
    except FileNotFoundError as e:
        raise PhotosCollectError(
            "osascript isn't available on this computer, so the room can't "
            "reach Photos.", fatal=True) from e
    except subprocess.TimeoutExpired as e:
        raise PhotosCollectError(
            "Reaching Photos took too long — try the candle again.",
            fatal=True) from e
    if proc.returncode != 0:
        err = (proc.stderr or "").strip()
        if "-1743" in err:
            raise PhotosCollectError(
                "macOS hasn't allowed the room to reach Photos yet. Approve "
                "the one-time prompt (it names your terminal app), then try "
                "the candle again.", fatal=True)
        raise PhotosCollectError(
            "The room couldn't bring in one photo just now.", fatal=False)
    return proc.stdout


def _enumerate_photo_ids():
    """[localIdentifier, ...] for every photo, via the enumerate seam."""
    raw = _run_osascript(_ENUMERATE_SCRIPT)
    ids = []
    for line in (raw or "").splitlines():
        line = line.strip().rstrip("\r")
        if line:
            ids.append(line)
    return ids


def _sips(*args):
    """The ONE sips seam (the single point unit tests watch). Argument list,
    shell=False -- a path is never shell-interpolated. Returns the completed
    process, or None when sips is unavailable or takes too long; the caller
    treats None as "could not shrink it", which skips-and-counts rather than
    crashing. Nothing on this path is fatal: a machine without sips imports
    every photo that fits and honestly skips the ones that do not."""
    try:
        # 26.995-29: through the tracked spawn, for the same reason and with
        # the same contract — a `sips` child holds a rendition of one of her
        # photographs open, so it must die with the room too.
        return _run_tracked(["sips", *args], _SIPS_TIMEOUT)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None


def _longest_edge(path):
    """The longer of the image's two pixel dimensions, or None if sips cannot
    read it. Read from sips rather than parsed here, so no image-format
    knowledge (and no image library) enters this module."""
    proc = _sips("-g", "pixelWidth", "-g", "pixelHeight", str(path))
    if proc is None or proc.returncode != 0:
        return None
    dims = []
    for line in (proc.stdout or "").splitlines():
        line = line.strip()
        for key in ("pixelWidth:", "pixelHeight:"):
            if line.startswith(key):
                try:
                    dims.append(int(line[len(key):].strip()))
                except ValueError:
                    return None
    if len(dims) != 2 or min(dims) <= 0:
        return None
    return max(dims)


def _shrink_to_fit(src, limit):
    """Make `src` small enough to fit under `limit`, PRESERVING ASPECT RATIO,
    and return the path of the smaller file -- or None if it could not be done
    within `_RESIZE_ATTEMPTS`, in which case the caller skips and counts it.

    `--resampleHeightWidthMax` is the aspect-preserving flag: it sets the
    LONGER edge and scales the other to match, so nothing is ever cropped or
    stretched. The output is written beside the source INSIDE the per-item
    throwaway directory, so the `finally` in `_export_one` removes it whether
    this succeeds or not, and the original rendition is never overwritten.

    The caller has already established that `src` is over the limit. This
    function is NEVER reached for a photo that fits."""
    longest = _longest_edge(src)
    if not longest:
        return None
    try:
        size = src.stat().st_size
    except OSError:
        return None
    # Bytes track area, so the edge scales with the square root of the ratio
    # we need -- one attempt usually lands it; the backoff covers the rest.
    target = int(longest * ((float(limit) / float(size)) ** 0.5)
                 * _RESIZE_HEADROOM)
    out = src.with_name("studyroom-smaller" + src.suffix)
    for _ in range(_RESIZE_ATTEMPTS):
        target = max(1, min(target, longest - 1))
        proc = _sips("--resampleHeightWidthMax", str(target),
                     str(src), "--out", str(out))
        if proc is None or proc.returncode != 0 or not out.exists():
            return None
        if out.stat().st_size <= limit:
            return out
        target = int(target * _RESIZE_BACKOFF)
    return None


def _export_one(media_id, staging, export_root):
    """Export ONE photo as JPEG into `staging` under a server-generated
    `<uuid>.jpg`, and return that path. Photos writes into a fresh per-item
    temp dir under its OWN filename; we then move the single produced file to a
    unique server-generated name (never the source filename — T-26.65-09), so
    the same IMG_0001.jpg from two photos never overwrites. Raises a non-fatal
    PhotosCollectError when the export produced nothing, a HEIC (Pitfall 1) or
    a VIDEO (26.65-08), so the caller skips-and-counts that one asset without
    failing the batch. **A non-image is NEVER renamed to .jpg** — that rename
    is what put video bytes into the library as unshowable pictures.

    **`export_root` is THE operative directory of this whole module** — the one
    Photos is actually handed, and the one the 26.65-07 fix relocates. The
    per-item dir is an `mkdtemp` INSIDE it, so mkdtemp's freshness guarantee is
    kept while the location becomes somewhere Photos is permitted to write. It
    is removed in a `finally` on success AND failure, so exactly one rendition
    of hers exists outside the room at a time, for the instant between export
    and move (T-26.65-23).

    Returns `(staged_path, was_resized)`. THE GUARD ORDER IS LOAD-BEARING and
    is asserted by the suite, not assumed: `no_file` -> `heic` -> `video` ->
    `oversize` -> normalize -> move. A video is skipped before the resizer can
    ever see it, so `sips` is never handed something that is not a picture."""
    tmp = tempfile.mkdtemp(prefix="studyroom-photo-", dir=str(export_root))
    try:
        _run_osascript(_EXPORT_SCRIPT, media_id, tmp)
        produced = [p for p in Path(tmp).iterdir()
                    if p.is_file() and not p.name.startswith(".")]
        if not produced:
            raise PhotosCollectError(
                "one photo could not be brought in", fatal=False,
                reason="no_file")
        src = produced[0]
        suffix = src.suffix.lower()
        if suffix in _HEIC_SUFFIXES:
            # `using originals false` should never emit HEIC; if it does, the
            # importer would skip it anyway — drop it out loud, never rename.
            raise PhotosCollectError(
                "one photo came back in a format the room can't show yet",
                fatal=False, reason="heic")
        if suffix in _VIDEO_SUFFIXES:
            # 26.65-08: a video, skipped HONESTLY under its own reason. The
            # room shows pictures and writing, not video yet — so this asset
            # is dropped out loud rather than renamed into a broken picture.
            # NON-fatal and NOT a failure: it stays out of the ledger, so if
            # video ever ships a later pull brings it in with nothing lost.
            raise PhotosCollectError(
                "one item is a video, which the room doesn't show yet",
                fatal=False, reason="video")
        # 26.65-09, AFTER the video guard on purpose (see the ordering note in
        # the docstring): a video is skipped above and is NEVER handed to the
        # resizer. Only a genuine still picture reaches this line.
        #
        # The ceiling is READ from study_lib rather than copied, so the number
        # the importer will judge this file by and the number we shrink to are
        # the same number by construction. Imported lazily, mirroring the
        # `from adapters import _ledger` convention in `collect` below.
        from study_lib import MAX_IMAGE_BYTES
        resized = False
        if src.stat().st_size > MAX_IMAGE_BYTES:
            smaller = _shrink_to_fit(src, MAX_IMAGE_BYTES)
            if smaller is None:
                # Bounded attempts exhausted, or sips unavailable. It is NOT
                # staged anyway: a file the importer will refuse would arrive
                # as nothing at all, which is the defect this fixes. Skipped
                # and counted, out of the ledger, so a later pull retries it.
                raise PhotosCollectError(
                    "one picture was too large for the room to take in",
                    fatal=False, reason="oversize")
            src = smaller
            resized = True
        if suffix not in _ACCEPT_SUFFIXES:
            suffix = ".jpg"
        target = Path(staging) / (uuid.uuid4().hex + suffix)
        shutil.move(str(src), str(target))
        return target, resized
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def collect(library_root, staging_dir, progress_cb=None, stats=None,
            export_root=None):
    """Export genuinely-new Apple Photos into `staging_dir` as `<uuid>.jpg`
    files and return the list of exported localIdentifiers (the caller commits
    them to the ledger AFTER import succeeds — never before, so a failed import
    doesn't lose them).

    Drops ids already in the ledger, then exports each remaining photo's JPEG
    rendition per-item (honest progress, single-asset isolation). progress_cb
    (done, total) is called once per attempted item — including skips — so the
    N-of-M readout stays honest on a large first import (law 6). A fatal export
    error (Automation not approved, timeout, missing binary) propagates; a
    single unexportable asset is skipped-and-counted, never fatal.

    `stats`, when a dict is passed in, is filled with `attempted`, `exported`,
    the per-reason `skipped` counts and `resized`, so the caller can report an
    honest partial. It is filled BEFORE the total-failure raise, so the numbers
    survive the error path too. `resized` sits BESIDE `skipped`, never inside
    it — a resized photo arrived, and counting it among the skips would make
    the room tell her it could not bring in a picture she is looking at.

    A RUN THAT BRINGS IN N PHOTOS, SOME OF THEM RESIZED, IS A SUCCESS, NOT A
    PARTIAL (26.65-09). The three outcomes below sort *what came back*; a
    resized photo came back. Nothing was skipped, nothing failed, and the only
    thing to say is the calm fact that a few were made smaller so they would
    fit. It maps to `partial` only if something ELSE was genuinely skipped.

    `export_root` overrides the derived Pictures container (tests pass a temp
    dir so a suite run never writes into the user's real Pictures folder).

    THE THREE OUTCOMES, held deliberately apart (see the module header):
      total == 0                -> returns [] silently. Never raises. A candle
                                   re-pull on a fully-imported library is
                                   NORMAL, and law 3 requires silence on it.
      total > 0, exported == 0  -> raises FATAL. The shipped route then leaves
                                   the ledger unwritten, `connected_sources`
                                   un-appended and `ok: True` unreported.
      0 < exported < total      -> returns normally, skip counts in `stats`.
    """
    from adapters import _ledger

    ledger = _ledger.load(library_root, SOURCE)
    all_ids = _enumerate_photo_ids()
    fresh = _ledger.new_ids(ledger, all_ids)

    staging = Path(staging_dir)
    staging.mkdir(parents=True, exist_ok=True)
    total = len(fresh)
    exported = []
    skipped = {"no_file": 0, "heic": 0, "video": 0, "oversize": 0, "other": 0}
    # ⛔ HER RULING 2026-08-24: `Remember it's seen a video`. ONLY videos go in
    # here. A transient failure — Photos wedged, a missing file, an oversize
    # rendition — must STILL stay out of every list, so a later pull retries it
    # and a photograph of hers can never be silently dropped. That distinction
    # is the whole safety of this change.
    set_aside = []

    # 26.65-09. `resized` is a SIBLING of `skipped`, never a member of it, and
    # the placement is load-bearing rather than tidy. The client's
    # `adapterPartialLine` sums every key of `skipped` except `video` into the
    # sentence "N pictures couldn't be brought in this time". A resized photo
    # IS IN HER ROOM. Counted inside `skipped` it would make the room say that
    # sentence about pictures she can open right now -- the same class of loud
    # falsehood 26.65-08 found when it fixed video. The give-up case is a real
    # failure and DOES belong in `skipped` (as `oversize`), where the shipped
    # partial line already counts it correctly with no change at all.
    tally = {"resized": 0, "set_aside_recorded": 0, "set_aside_unrecorded": 0}

    def _record(n_exported):
        if stats is not None:
            stats["attempted"] = total
            stats["exported"] = n_exported
            stats["skipped"] = dict(skipped)
            stats["resized"] = tally["resized"]
            # ⚠ REPORTED, so "the room remembered" and "the room could not
            # write it down" are never the same silence.
            stats["set_aside_recorded"] = tally["set_aside_recorded"]
            stats["set_aside_unrecorded"] = tally["set_aside_unrecorded"]

    # A legitimate zero costs nothing and touches nothing: with no photo to
    # export there is no reason to create a directory in the user's Pictures
    # folder, so the whole export-root lifecycle is skipped on this path.
    if total == 0:
        _record(0)
        return exported

    # ⛔ HER RULING 2026-08-25: RECOGNISE FIRST, NEVER COPY. A video is set
    # aside the moment Photos names it, without ever being exported — see
    # _video_ids_by_filename above for the whole posture (fail-open, the
    # export-side guard retained as the belt to this braces).
    pre_videos = _video_ids_by_filename(fresh)

    # And a queue that is ALL recognised videos touches her Pictures folder
    # not at all — the same courtesy the legitimate zero above already gets.
    need_export = any(m not in pre_videos for m in fresh)
    parent = None
    run_root = None
    if need_export:
        parent = Path(export_root) if export_root is not None \
            else _export_root_parent()
        try:
            parent.mkdir(parents=True, exist_ok=True)
            run_root = tempfile.mkdtemp(prefix="studyroom-run-",
                                        dir=str(parent))
        except OSError as e:
            # DELIBERATELY NO FALLBACK TO A TEMPORARY DIRECTORY. Photos cannot
            # write into the OS temp root — falling back there would restore
            # the 2026-08-11 defect exactly, silently, while looking like it
            # worked.
            raise PhotosCollectError(
                "The room couldn't make a place for your photos to arrive "
                "in. Nothing was changed.", fatal=True,
                reason="no_export_root") from e

    try:
        for i, media_id in enumerate(fresh, 1):
            # Recognised as a video by its name: set aside, counted, honest
            # progress tick — and NEVER handed to the exporter (her ruling).
            if media_id in pre_videos:
                skipped["video"] += 1
                set_aside.append(media_id)
                if progress_cb is not None:
                    progress_cb(i, total)
                continue
            try:
                _staged, was_resized = _export_one(
                    media_id, staging, run_root)
                exported.append(media_id)
                if was_resized:
                    # it ARRIVED. Never a skip, never a failure.
                    tally["resized"] += 1
            except PhotosCollectError as e:
                if e.fatal:
                    raise
                # a single asset failed — skip-and-continue; it stays out of
                # the ledger so a later re-pull retries it (never silently
                # lost). It is now COUNTED BY REASON: 14,016 consecutive
                # failures and one failure used to be recorded identically,
                # which is to say not at all.
                bucket = e.reason if e.reason in skipped else "other"
                skipped[bucket] += 1
                # ⛔ VIDEOS ONLY. Everything else is a FAILURE and keeps the
                # shipped retry posture: it stays out of both lists so a later
                # pull brings it in, never silently lost.
                if bucket == "video":
                    set_aside.append(media_id)
            if progress_cb is not None:
                progress_cb(i, total)
    finally:
        # An all-recognised-videos run created neither of these (need_export
        # False above), so there is nothing to remove and nothing is touched.
        if run_root is not None:
            shutil.rmtree(run_root, ignore_errors=True)
        # remove OUR container too, but ONLY if it is empty — never the user's
        # Pictures folder, and never a container another collect is using.
        if parent is not None:
            try:
                parent.rmdir()
            except OSError:
                pass

    # ⛔⛔ WRITTEN HERE, BEFORE THE TOTAL-FAILURE RAISE BELOW, AND ON PURPOSE.
    # An all-video run and a run that also hit failures BOTH have videos to
    # record, and the second one raises. Recording after the raise would leave
    # exactly the case she hit — hundreds of videos re-attempted for ever —
    # unfixed on the path it actually happened on.
    #
    # ⚠ IT DOES NOT WAIT FOR THE IMPORT, and that is correct rather than
    # careless: the exported ids wait because a failed import must not lose
    # them from the next pull. A SET-ASIDE item is never imported at all, so
    # there is nothing for an import to lose.
    #
    # ⚠ FAIL-VISIBLE, NEVER SILENT: a ledger that cannot be written is counted
    # into stats so the room can see it, rather than quietly restoring the
    # every-visit defect.
    if set_aside:
        try:
            _l = _ledger.load(library_root, SOURCE)
            keep = set(_l.get("set_aside_ids") or [])
            keep.update(set_aside)
            _l["set_aside_ids"] = sorted(keep)
            _ledger.save(library_root, SOURCE, _l)
            tally["set_aside_recorded"] = len(set_aside)
        except (OSError, ValueError):
            tally["set_aside_unrecorded"] = len(set_aside)

    _record(len(exported))
    if not exported and (total - skipped["video"]) > 0:
        # N were attempted and none came back. This is the defect, and it must
        # never again be mistakable for a finished job.
        #
        # 26.65-08: a VIDEO is subtracted out of that N first, because a video
        # is not a photo that failed. A re-pull that finds only new videos
        # attempts them, skips them all, and exports zero — and the old test
        # (`exported == 0`) would have raised and told her "none of your
        # pictures came back", which is FALSE: nothing failed, and there were
        # no pictures to bring. The discriminator is therefore "was anything
        # attempted that WASN'T a video". An all-video run returns normally
        # and silently, exactly like the nothing-new zero above it — the
        # video count still rides out in `stats` so the room can say the one
        # calm true thing about what it does and does not show.
        raise PhotosCollectError(_TOTAL_FAILURE_MSG, fatal=True,
                                 reason="total_failure")
    return exported


def _under(child, parent):
    """True if `child` path is lexically inside (or equal to) `parent`. Purely
    lexical (normpath+abspath, no resolve/stat) so it holds even after the
    staging dir is deleted — it matches against stored origin_path strings."""
    parent = os.path.normpath(os.path.abspath(parent))
    child = os.path.normpath(os.path.abspath(child))
    return child == parent or child.startswith(parent + os.sep)


def mark_origin(store, staging_dir):
    """Stamp `from_source='apple-photos'` on every store item whose origin_path
    resolves under `staging_dir`, and return the count marked.

    The D-03-safe way to tag THIS collect's genuinely-new items without forking
    import_folder: import_folder records origin_path=str(staged_path), and each
    collect uses a fresh mkdtemp, so only this collect's items resolve under
    staging_dir. The marker is additive and idempotent; it never touches source
    (stays 'folder-drop'), title, or state.
    """
    marked = 0
    for item in store.get("items", {}).values():
        origin = item.get("origin_path")
        if origin and _under(origin, staging_dir):
            item["from_source"] = SOURCE
            marked += 1
    return marked
