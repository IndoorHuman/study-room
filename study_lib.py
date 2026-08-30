#!/usr/bin/env python3
"""
study_lib.py — the headless library trunk for the Study Room.

This module owns every items.json write and every import-walk guarantee in
ONE place, so the HTTP server (server.py, Plan 22-02), standalone scripts,
and future import adapters (Phase 25) all share a single implementation:

  * atomic_write_bytes    — crash-safe same-dir-temp + os.replace write primitive
  * is_icloud_placeholder — un-downloaded iCloud stub detection
  * normalize_text_bytes  — CRLF/CR -> LF fold for text hashing (D-08)
  * hash_item             — content-hash item ids (16-hex id + full sha256)
  * classify_path         — extension -> kind per the walking-rules table
  * walk_source           — skip-with-counts import walker (never silent)
  * extract_image_refs    — image references in a note body (22-uat):
                            Obsidian wikilinks ![[name.ext]] / ![[n|alias]]
                            and markdown images ![alt](path), %-decoded
  * scan_attachments      — partition walked images into attachments
                            (linked from a note, or named with a note's
                            stem + "_" filename prefix) vs standalone
                            candidates; NFC/case-folded matching
  * import_folder         — walk -> hash -> copy -> dedup -> atomic persist;
                            attachments are copied WITH their note, recorded
                            on its entry, never cataloged as items
  * ADAPTERS / detect_adapter / scan_source — the import-source registry
                            (25-02, D-02): detect/convert rows for
                            chatgpt-export, claude-export, obsidian-vault,
                            and folder-drop (always last). Adding a source is
                            a pure adapter change — downstream room code
                            never sees source-specific logic. Export
                            conversations become "synth" units written
                            through the same hash -> dedup -> atomic core,
                            verbatim, with the export's OWN timestamps
  * new_store / load_store / save_store — items.json schema v2 lifecycle;
                            corrupt stores are REFUSED, never reinitialized
  * migrate_store         — one-time schema v1 -> v2 backfill (Phase 23);
                            idempotent; the caller owns locking + backup
  * detect_screenshot     — screenshot heuristics (D-05): filename patterns
                            (incl. 截屏/截图), the IMG_*.png iOS rule, and
                            an exact device-resolution confirm
  * png_dims / jpeg_dims  — stdlib struct header parsers (bytes -> (w, h))
  * stamp_facets          — derived-facet stamping (D-05): year, folder,
                            the 'screenshots' tag — at import and migration
  * validate_state_change — the 5-state enum + retired dig-out rule (SRM-01)
  * validate_source_path  — source folder validation before any walk
  * room_config_dir       — the room's own two files under the user's home
    settings_file_path      (#28, 26.93-04): settings.json, shareable by
    keys_file_path          design, and keys.json, a credential at mode 0600
    ensure_room_config_dir  inside a 0700 directory. Both derived from the home
                            directory and never spelled. keys_file_path is the
                            path _librarian_fenced refuses
  * build_librarian_payload — the librarian fence (26-01, SRM-13): the ONE
                            byte source for the agent subprocess. Fenced
                            items (never_show / retired / trigger-flagged /
                            active-filter-matched) are absent ENTIRELY —
                            no id, no title, no metadata — under every
                            scope; bodies are capped with a visible count;
                            _matches_active_filter mirrors core.js
                            matchesFilter for parity
  * librarian_batches     — slice a build_librarian_payload return into
                            ordered, self-contained batch texts (26-02):
                            metadata rows in fixed-size groups, bodies
                            greedily packed under a per-batch byte budget
  * load_suggestions      — the librarian's visible notebook
    merge_suggestions       (librarian/suggestions.json, 26-02): fail-open
                            read, per-id shallow merge, per-run record
                            keyed by started_ms, every write atomic

Design contract (ported from the house's palace_lib.py discipline):
  - Pure functions. Every function that needs the library takes its root as
    an explicit argument. There is NO module-level root, NO Path.cwd() at
    import time, NO HTTP/socket imports, NO main() — `import study_lib`
    binds no socket, performs no I/O, and produces no output. pathlib
    everywhere (D-04); never changes the working directory; no
    machine-specific paths.
  - Stdlib only. Zero dependencies (D-01/D-03).
  - The store is sacred (D-06): every write goes through atomic_write_bytes;
    a corrupt items.json raises StoreCorruptError — the caller must refuse
    to proceed rather than overwrite user judgments (blessing history is
    sacred; never auto-reinitialize).
"""
import base64
import hashlib
import json
import math
import os
import re
import shutil
import struct
import tempfile
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

# ---------------------------------------------------------------------------
# Constants (the walking-rules table, RESEARCH Pattern 6)
# ---------------------------------------------------------------------------

TEXT_EXTS = {".md", ".markdown", ".txt"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
SKIP_EXTS = {".heic", ".heif"}  # skip + count: renders only in Safari 17+

MAX_TEXT_BYTES = 2 * 1024 * 1024    # a 2 MB "note" is an export artifact
MAX_IMAGE_BYTES = 25 * 1024 * 1024  # larger images stall the reader

# The five item states (SRM-01). Exactly these — the server validates every
# browser-supplied state string against this enum before writing.
VALID_STATES = ("unseen", "blessed", "never_show", "resting", "retired")

SCHEMA_VERSION = 3

# 26.4-06 (D-26/D-29): the ONE folder that carries reflection-insights — the
# journal-reflection ritual's outputs under Claude's observation/. The folder
# facet (Path(origin_path).parent.name) equals this for a reflection; it is
# necessary but NOT sufficient (the Dream Symbol Dictionary sits here with no
# reflects: key — Pitfall 4), so is_reflection ANDs it with the reflects facet.
REFLECTION_FOLDER = "Journal analysis"

# The sensitive-folder roster the whole-vault import fences by default
# (26.4-01, D-05). Stored as vault-relative TOP-LEVEL segment strings —
# _origin_under_roster matches an item when its first vault-relative path
# segment equals a roster entry's first segment (D-08). Items born under
# any of these enter the store trigger-flagged, so the shipped fence
# (_librarian_fenced) excludes them from every librarian payload ENTIRELY.
# These are the plain-words folders the import screen lists before any read
# (the rawest-writing folder was the Phase-15 WoZ finding — the run declined
# rawest writing). The list is user-editable: it is seeded here, materialized
# into meta.fenced_roster, and adjusted through add_roster_folder /
# remove_roster_folder (D-06/D-07).
# 26.91-39 (A-27) — ⚠ THESE ARE INVENTED EXAMPLES, AND THEY ARE ALSO A LIVE
# FENCE. Until wave 39 this list held the OWNER's four real folder names, which
# meant the shipped source published them AND that a store carrying no
# fenced_roster key was fenced by this list directly. Renaming it alone would
# therefore have switched a real fence OFF — measured, then DRIVEN over the real
# store: "her four real folders still hidden?" read False. The owner's own list
# now lives in her settings (meta.fenced_roster, written 2026-08-11) and
# _active_roster prefers it, so this list is what it always claimed to be: the
# example a FRESH store starts from.
#   THE THREE SHAPES BELOW ARE LOAD-BEARING AND A REPLACEMENT MUST KEEP THEM:
#   one MULTI-WORD term, one carrying an AMPERSAND, and one SINGLE word that is
#   a strict prefix of a longer ordinary word ("Journal" / "Journals"). The last
#   is what keeps the recorded prefix-collision case alive — a search for
#   `Journal` must NOT be satisfied by a folder called `Journals` — and
#   tests/lib/leak-scan.cjs's word-boundary rules exist for exactly these.
# ⛔ `Journal` IS NOT AN INVENTED EXAMPLE AND MUST NOT BE RENAMED AWAY AGAIN.
#   docs/adr/0001 (accepted) and launch-map #10 decision 6 both rule it stays:
#   it is the ONLY seeded entry the shipped Mansfield demo vault trips, and the
#   launch demo's central beat — the room declining to read the diary until the
#   visitor allows it — exists only while it is here. Wave 39 renamed it to
#   "Memoir" ten hours AFTER that ruling and silently deleted the beat: measured
#   2026-08-17 on the demo vault, 0 of 476 notes were held back instead of 206.
#   It also still satisfies the single-word shape above, so a future replacement
#   wave gains nothing by touching it. The other three ARE invented examples.
DEFAULT_FENCED_ROSTER = ["Journal", "personnel notes",
                         "billing & insurance notes", "appraisal record"]


# ---------------------------------------------------------------------------
# The room's own config directory (#28, Plan 26.93-04)
# ---------------------------------------------------------------------------
# Three files live here: `settings.json` (which model fills which tier — not
# secret, and shareable on purpose), `keys.json` (a credential, mode 0600,
# inside a 0700 directory), and `library.json` (which folder is the library —
# D-08 / #147: must survive replacing the app folder). ⚠ ALL DERIVED FROM THE
# HOME DIRECTORY, NEVER SPELLED: no absolute path naming a user appears
# anywhere in this repo.
# ⚠ NOT under the repo root (the old `library.local.json` home was): a key and
# the library pointer have to survive re-cloning / folder-replace, and nothing
# a `git add -f` can reach may ever hold a key.
#
# ⚠ WHY THE DERIVATION IS HERE RATHER THAN IN `librarian_call`, WHICH OWNS THE
# FILES: `_librarian_fenced` below has to be able to NAME the keys file in
# order to refuse it. A fence that could only name it when some other module
# happened to have been imported first would be a fence with an import order in
# it. (26.99-05: the call record, further down this file, is off-limits for its
# own reasons and is named by the same predicate — so the rule generalised
# rather than stayed a special case.)
# `librarian_call.keys_path()` is the accessor; this is the derivation, and
# it is computed on every call rather than at import so the value can never be
# a stale copy of a home directory that has since changed.
ROOM_CONFIG_DIR_NAME = ".study-room"
SETTINGS_FILE_NAME = "settings.json"
KEYS_FILE_NAME = "keys.json"
LIBRARY_POINTER_NAME = "library.json"
# Publish-only stamp at the app/stage root (D-03 / map #145). Absent in the
# private checkout; present only after the release ritual writes it into the
# staged tree. One line `YYYY-MM-DD`. Manage + librarian share read_release_stamp.
RELEASE_DATE_NAME = "RELEASE_DATE"
WHATS_NEW_NAME = "WHATS_NEW.md"
LAST_RUN_VERSION_NAME = "last_run_version"
# Publish-only latest pointer at the app/stage root (UPD-07). Shipped beside
# RELEASE_DATE; copied into ~/.study-room/latest_release_date by update_room.
LATEST_RELEASE_DATE_NAME = "LATEST_RELEASE_DATE"
LAST_LATEST_RELEASE_NAME = "latest_release_date"


def room_config_dir():
    """The room's config directory under the user's home. Pure: builds a path,
    touches nothing."""
    return Path.home() / ROOM_CONFIG_DIR_NAME


def settings_file_path():
    """Her fills, addresses and timeouts. Nothing secret is ever written
    here — that split is what lets this file be pasted into a bug report."""
    return room_config_dir() / SETTINGS_FILE_NAME


def keys_file_path():
    """The one file a key is written to, and the one path the librarian fence
    refuses below."""
    return room_config_dir() / KEYS_FILE_NAME


def library_pointer_path():
    """`library.json` in the room's config directory — which folder is the
    library (D-08 / map #147).

    Sibling of settings and keys so replacing the app folder does not
    factory-reset the pointer. Pure path math, recomputed on every call so
    it can never be a stale copy of a home directory that has since changed.
    """
    return room_config_dir() / LIBRARY_POINTER_NAME


def last_run_version_path():
    """Remembered stamped date under settings home (D-09 / map #148).

    Sibling of settings/keys/library pointer so folder-replace updates keep
    the quiet-line memory. Pure path math.
    """
    return room_config_dir() / LAST_RUN_VERSION_NAME


def latest_release_date_path():
    """Shipped-latest pointer under settings home (UPD-09 / map #145).

    Sibling of last_run_version so folder-replace keeps the offline latest
    stamp the behind prompt compares against. Pure path math.
    """
    return room_config_dir() / LAST_LATEST_RELEASE_NAME


def read_release_stamp(repo_root):
    """Read the publish-only RELEASE_DATE stamp, or None when absent (D-03).

    One reader for Manage and the librarian local version answer. The private
    checkout never tracks this file; released/staged trees carry one line
    `YYYY-MM-DD`. Empty or unreadable → None (dev silence).
    """
    path = Path(repo_root) / RELEASE_DATE_NAME
    if not path.is_file():
        return None
    try:
        line = path.read_text(encoding="utf-8").strip().splitlines()
    except OSError:
        return None
    if not line:
        return None
    stamp = line[0].strip()
    return stamp or None


def read_last_run_version():
    """Remembered stamped date from settings home, or None (D-09 / #148)."""
    path = last_run_version_path()
    if not path.is_file():
        return None
    try:
        line = path.read_text(encoding="utf-8").strip().splitlines()
    except OSError:
        return None
    if not line:
        return None
    remembered = line[0].strip()
    return remembered or None


def remember_release_stamp(stamp):
    """Persist last-run when a stamp is present (even on silent downgrade).

    Missing stamp (dev tree) leaves remembered untouched — folder-replace
    silence must not wipe a prior released memory.
    """
    if not stamp:
        return
    ensure_room_config_dir()
    path = last_run_version_path()
    path.write_text(str(stamp).strip() + "\n", encoding="utf-8")


def compute_show_whats_new(stamp, remembered):
    """Quiet-line truth table (D-09 / map #148).

    Show once when stamp is present, remembered exists, and stamp is a
    real upgrade (lexicographically newer YYYY-MM-DD). Silent on first
    run, missing stamp, same stamp, and downgrade / going-back.
    """
    if not stamp:
        return False
    if not remembered:
        return False
    if stamp == remembered:
        return False
    if stamp < remembered:
        return False
    return stamp > remembered


def read_latest_release_date():
    """Shipped-latest pointer from settings home, or None (UPD-09).

    Local files only — no network. Absent or unreadable → None.
    """
    path = latest_release_date_path()
    if not path.is_file():
        return None
    try:
        line = path.read_text(encoding="utf-8").strip().splitlines()
    except OSError:
        return None
    if not line:
        return None
    latest = line[0].strip()
    return latest or None


def write_latest_release_date(stamp):
    """Persist the shipped-latest pointer under settings home (UPD-09).

    Written by update_room --sync-latest-only or a full folder replace —
    the running app never phones home to discover versions.
    """
    if not stamp:
        return
    ensure_room_config_dir()
    path = latest_release_date_path()
    path.write_text(str(stamp).strip() + "\n", encoding="utf-8")


def compute_show_update_prompt(local_stamp, latest_stamp):
    """Behind-latest prompt truth table (UPD-09).

    True only when both stamps are present and local_stamp is lexicographically
    older than latest_stamp (YYYY-MM-DD). False when equal, local is newer,
    or either stamp is missing. Orthogonal to compute_show_whats_new — a
    separate policy table; never merge the two truth tables.
    """
    if not local_stamp or not latest_stamp:
        return False
    if local_stamp >= latest_stamp:
        return False
    return local_stamp < latest_stamp


def ensure_room_config_dir():
    """Create the config directory when it is missing, at mode 0700.

    ⚠ The mode is set EXPLICITLY rather than passed to mkdir: mkdir's mode is
    filtered through the process umask, so a room that asked for 0700 could
    quietly ship 0755 and would then be claiming a protection it was not
    providing. Idempotent — an existing directory is left in place and only its
    mode is re-asserted."""
    d = room_config_dir()
    d.mkdir(parents=True, exist_ok=True)
    os.chmod(str(d), 0o700)
    return d


class StoreCorruptError(Exception):
    """items.json exists but is unreadable or has the wrong schema_version.

    Callers must REFUSE to proceed (refuse-to-start for the server) rather
    than write a fresh empty store over user judgments — blessing history is
    sacred and is never auto-reinitialized (RESEARCH Pitfall 5).
    """


# ---------------------------------------------------------------------------
# Ported helpers (verbatim from the house's palace_lib.py)
# ---------------------------------------------------------------------------

def atomic_write_bytes(target, data: bytes):
    """Write `data` to `target` atomically so an interrupted write can never
    corrupt an irreplaceable note (FND-02, D-04).

    The temp file is created in the SAME directory as the target — critical so
    os.replace performs an atomic same-filesystem rename. A temp in /tmp would
    degrade os.replace to a non-atomic cross-filesystem copy and can spawn
    iCloud `note 2.md` conflict copies. On any exception the temp is removed and
    the original error re-raised, leaving the original target untouched.
    """
    d = os.path.dirname(os.path.abspath(target)) or '.'
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.tmp-', suffix='.swap')  # SAME dir = same filesystem
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, target)            # atomic same-fs rename; crash leaves original intact
    except Exception:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


def is_icloud_placeholder(path) -> bool:
    """Return True if `path` is an un-downloaded iCloud placeholder stub:
    either a hidden sibling `.<name>.icloud` exists (the evicted-file marker)
    OR the path itself is a zero-size regular file. Never raises on OSError
    (returns False). Skip + count — never trigger an iCloud download.
    """
    p = Path(path)
    sibling = p.parent / ('.' + p.name + '.icloud')   # evicted file -> hidden zero-size stub
    if sibling.exists():
        return True
    try:
        return p.exists() and p.is_file() and p.stat().st_size == 0
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Hashing (D-08: content-addressed item identity)
# ---------------------------------------------------------------------------

def normalize_text_bytes(data: bytes) -> bytes:
    """Fold CRLF and bare CR to LF so the same note exported on Windows and
    Mac hashes to the same id (the exact D-08 dedup case). Decode UTF-8 with
    errors='replace' so malformed bytes never crash an import."""
    text = data.decode("utf-8", errors="replace")
    return text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")


def hash_item(path, kind: str):
    """Return (id16, full_sha256_hex) for the file at `path`.

    Text kinds are line-ending-normalized before hashing; image bytes are
    hashed raw. The id is the first 16 hex chars (64 bits — collision odds
    negligible even at 100k items); the full hash is stored alongside for
    prefix-collision disambiguation.
    """
    data = Path(path).read_bytes()
    if kind == "text":
        data = normalize_text_bytes(data)
    full = hashlib.sha256(data).hexdigest()
    return full[:16], full


def classify_path(path) -> str:
    """Classify a candidate file by extension per the walking-rules table:
    'text' | 'image' | 'heic' (skip + count) | 'unknown' (skip + count)."""
    ext = Path(path).suffix.lower()
    if ext in TEXT_EXTS:
        return "text"
    if ext in IMAGE_EXTS:
        return "image"
    if ext in SKIP_EXTS:
        return "heic"
    return "unknown"


def stat_dates(st):
    """Return (created_ms, saved_ms) integer epoch ms from a stat result.

    created = st_birthtime when the platform provides it (macOS); falls back
    to st_mtime on platforms without birthtime (Linux — D-04). saved is
    always st_mtime. Durable metadata, never wall-clock guesses.
    """
    saved_ms = int(st.st_mtime * 1000)
    birth = getattr(st, "st_birthtime", None)
    created_ms = int(birth * 1000) if birth is not None else saved_ms
    return created_ms, saved_ms


# ---------------------------------------------------------------------------
# Screenshot detection + derived facets (Phase 23, D-05)
# ---------------------------------------------------------------------------

# Screenshot filename spellings (optional internal space) plus the Chinese
# vendor terms — compiled once, case-insensitive, matched anywhere in the
# name (RESEARCH Pattern 7).
_SCREENSHOT_NAME_RE = re.compile(
    r"(?:screen\s?shot|screenshot|截屏|截图)", re.IGNORECASE)
# The iOS heuristic: cameras save HEIC/JPEG — a camera-roll-named PNG
# (stem = IMG_ + digits) is near-certainly a screen capture.
_IOS_PNG_STEM_RE = re.compile(r"IMG_\d+", re.IGNORECASE)

# Common device screen sizes for the dimension confirm — tunable data;
# filename patterns fire first, so a miss here degrades gracefully.
_SCREEN_SIZES = (
    (750, 1334), (828, 1792), (1080, 1920), (1080, 2340), (1125, 2436),
    (1170, 2532), (1179, 2556), (1284, 2778), (1290, 2796), (1920, 1080),
    (2560, 1440), (2880, 1800), (3024, 1964), (3456, 2234),
)
# Both orientations of every size.
SCREEN_RESOLUTIONS = frozenset(_SCREEN_SIZES) | frozenset(
    (h, w) for w, h in _SCREEN_SIZES)

# Detection reads only the header region — never a whole image.
_DETECT_HEAD_BYTES = 65536


def png_dims(data: bytes):
    """PNG: 8-byte signature, 4-byte length, b'IHDR', then width/height
    as big-endian uint32 at bytes 16..24. [CITED: W3C PNG spec, IHDR chunk]
    Returns (width, height) or None — pure bytes-in / value-out."""
    if len(data) < 24 or data[:8] != b'\x89PNG\r\n\x1a\n' \
            or data[12:16] != b'IHDR':
        return None
    return struct.unpack('>II', data[16:24])


def jpeg_dims(data: bytes):
    """JPEG: scan markers for an SOFn frame header; height/width are
    big-endian uint16 at offsets 5..9 of the segment.
    Returns (width, height) or None — pure bytes-in / value-out."""
    if data[:2] != b'\xff\xd8':
        return None
    i = 2
    while i + 9 < len(data):
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                      0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            h, w = struct.unpack('>HH', data[i + 5:i + 9])
            return w, h
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        i += 2 + struct.unpack('>H', data[i + 2:i + 4])[0]
    return None


def detect_screenshot(name, data) -> bool:
    """True when an image looks like a screen capture (D-05), signals in
    precedence order — the name-only signals never need bytes:
      1. filename patterns (screenshot spellings + 截屏/截图)
      2. the iOS rule: a .png whose stem is IMG_ + digits
      3. dimension confirm: exact PNG/JPEG header size on the device table
         (either orientation)
    Detection errs INCLUSIVE: a false positive only over-excludes while the
    'no screenshots' filter is active, and is revisable in the manage view;
    a false negative would slip past an active filter — the safety failure.
    Pure: no wall-clock, no locale, no filesystem reads."""
    name = str(name)
    if _SCREENSHOT_NAME_RE.search(name):
        return True
    p = Path(name)
    if p.suffix.lower() == ".png" and _IOS_PNG_STEM_RE.fullmatch(p.stem):
        return True
    dims = png_dims(data)
    if dims is None:
        dims = jpeg_dims(data)
    return dims is not None and tuple(dims) in SCREEN_RESOLUTIONS


def _read_head(path, limit=_DETECT_HEAD_BYTES) -> bytes:
    """At most the first `limit` bytes of `path`; b'' when unreadable.
    Image headers sit at the front — detection never needs a whole file."""
    try:
        with open(path, "rb") as f:
            return f.read(limit)
    except OSError:
        return b""


def _snapshot_path(store_dir, item):
    """The resolved path of `item`'s snapshot under `store_dir`, or None when
    there is no readable one.

    JAIL (26-01 review H1), SPELLED ONCE: `library_path` is DATA, not a
    trusted path — a hand-edited or malformed store entry carrying an absolute
    path or a `../` traversal must never pull an arbitrary local file into a
    cloud payload, and must never become the left-hand side of a comparison
    that decides whether somebody's words changed. The resolved snapshot has
    to live under `store_dir` or there is no snapshot as far as this room is
    concerned.

    ⚠ EXTRACTED FROM `_read_body_capped`, which spelled this jail inline until
    #58's refresh needed the same jail to read the words the room last saw. A
    second spelling of a fence is the defect class this codebase keeps finding
    in itself (`merge_refusal_why` says the same thing about its own), so the
    two snapshot readers share this one. `vision_path_list` keeps its own,
    STRICTER jail (the resolved path must sit under <root>/items/) — that one
    is not a duplicate of this, it is a tighter rule with its own test.

    Never raises, never writes."""
    root = Path(store_dir).resolve()
    try:
        path = (root / str(item.get("library_path") or "")).resolve()
    except (OSError, ValueError):
        return None
    if root not in path.parents:
        return None          # outside the library: refused
    return path


def _snapshot_bytes(store_dir, item):
    """The whole of `item`'s snapshot as bytes, or None when it is missing,
    unreadable, or jailed. Never raises, never writes.

    The snapshot is what the room last saw of a note, which is what makes it
    the only honest left-hand side for "did the words change, or only the
    whitespace?" (#94 ruling 2, asked from #58's refresh)."""
    path = _snapshot_path(store_dir, item)
    if path is None:
        return None
    try:
        return path.read_bytes()
    except OSError:
        return None


def stamp_facets(item, data=b"") -> dict:
    """Stamp the derived facets (D-05) onto `item` IN PLACE and return it:

      year   — int(datetime.fromtimestamp(created_ms / 1000).year), server-
               LOCAL time: "from 2023" means the user's own year, and core's
               matching stays a pure integer compare (no Date construction
               in the browser — RESEARCH Pitfall 6)
      folder — the immediate parent directory name of origin_path (stable,
               backfillable for every existing item)
      tags   — the literal 'screenshots' appended to image items whose
               title/header bytes match detect_screenshot; NEVER appended
               twice (RESEARCH Pitfall 8 idempotence)

    Deterministic: the same item + bytes always stamp the same facets, so
    re-stamping is safe. Used by import_folder for new items and by
    migrate_store for the v1 backfill — one implementation, two callers.

    ⚠ AMENDED BY #58 RULING 2, 2026-08-14: STAMPED ONCE PER **VERSION**, NOT
    ONCE PER ITEM. This docstring used to say facets were stamped once, on a
    new item only, and that an existing item's facets were never rewritten.
    That was true while an edited file became a different item; now that a
    refresh keeps the item's id (`refresh_item`), the facets are the room's
    own guesses about a file that has changed underneath them, and re-deriving
    them is the point. The `folder` facet moves when a note moves; the
    `screenshots` tag is re-confirmed from the current bytes. `year` in
    practice does not move, because `refresh_item` deliberately leaves
    `created_ms` alone — see the trap recorded there."""
    item["year"] = int(
        datetime.fromtimestamp(item["created_ms"] / 1000).year)
    item["folder"] = Path(item["origin_path"]).parent.name
    if item.get("type") == "image" and \
            detect_screenshot(item.get("title", ""), data):
        tags = item.setdefault("tags", [])
        if "screenshots" not in tags:
            tags.append("screenshots")
    return item


# ---------------------------------------------------------------------------
# ---- the reflection predicate (26.4-06, D-26/D-29) ------------------------
# "Reflections ARE the insights." is_reflection identifies the journal-
# reflection ritual's outputs — essay-length syntheses under Claude's
# observation/Journal analysis/ that carry a reflects: frontmatter key. It is
# the ONE filter the redefined 26.4 shelf/reader/consent stand on. Pure and
# fence-AGNOSTIC: it reads already-stamped facets only (no filesystem I/O),
# and _librarian_fenced still applies the fence separately (a reflection may
# also be independently fenced). NEVER surface HR/health/weekly analysis
# (Pitfall 2) — a sibling folder fails the folder check; the Dream Symbol
# Dictionary fails the reflects check (Pitfall 4).
# ---------------------------------------------------------------------------

def is_reflection(item) -> bool:
    """True iff `item` is a reflection-insight: an obsidian-vault item whose
    folder facet is REFLECTION_FOLDER AND which carries a truthy reflects
    facet. Pure; fail-closed (a non-dict, a missing key, or None → False),
    never raises."""
    if not isinstance(item, dict):
        return False
    return (item.get("source") == "obsidian-vault"
            and item.get("folder") == REFLECTION_FOLDER
            and bool(item.get("reflects")))


# The reflects facet is stamped at import from the item's TEXT frontmatter
# (folder is pure path math with no file read, so it can never yield reflects).
# _FRONTMATTER_MAX bounds the block read: any real YAML frontmatter is a few
# lines; this cap covers the whole `---`...`---` block without slurping a large
# body, and the scan stops at the closing fence regardless.
_FRONTMATTER_MAX = 65536


def _frontmatter_has_reflects(text_bytes) -> bool:
    """True iff `text_bytes` OPENS with a `---` YAML frontmatter fence and that
    block carries a top-level `reflects:` key. Presence of the key — not its
    value — is the discriminator (the real reflections carry a `reflects:`
    block list; the Dream Symbol Dictionary carries no such key). Scans the
    FULL frontmatter block up to the closing `---`/`...` line, not a fixed
    head. Pure; fail-closed (b'' / non-bytes / undecodable / no fence → False),
    never raises."""
    if not text_bytes:
        return False
    try:
        text = bytes(text_bytes).decode("utf-8", errors="replace")
    except (TypeError, ValueError):
        return False
    if text and ord(text[0]) == 0xFEFF:   # strip a leading BOM
        text = text[1:]
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return False
    for line in lines[1:]:
        stripped = line.strip()
        if stripped in ("---", "..."):
            break                       # closing fence — stop
        # a top-level key has NO leading indentation; nested list items
        # (`  - "..."`) and comments are skipped by the anchored match
        m = re.match(r"^([A-Za-z0-9_][\w-]*)\s*:", line)
        if m and m.group(1) == "reflects":
            return True
    return False


def _read_frontmatter_block(path) -> bytes:
    """Read from the start of `path` far enough to cover the whole YAML
    frontmatter block: the opening `---` line plus every line up to and
    including the closing fence (or _FRONTMATTER_MAX bytes, whichever comes
    first). Returns only what was read — never the whole body of a large note.
    b'' when unreadable or when the file does not open with a fence."""
    try:
        chunks = []
        with open(path, "rb") as f:
            first = f.readline()
            if first.lstrip(b"\xef\xbb\xbf").strip() != b"---":
                return b""              # no frontmatter; nothing to scan
            chunks.append(first)
            read = len(first)
            for line in f:
                chunks.append(line)
                read += len(line)
                if line.strip() in (b"---", b"..."):
                    break
                if read > _FRONTMATTER_MAX:
                    break
        return b"".join(chunks)
    except OSError:
        return b""


# ---------------------------------------------------------------------------
# Import walker (SRM-02 — skip WITH counts, never silently)
# ---------------------------------------------------------------------------

def walk_source(src_root, onerror=None):
    """Walk `src_root` and return (candidates, skips).

    candidates: list of (Path, kind) for importable files, deterministic order.
    skips: per-reason counts — {'hidden', 'symlink', 'icloud', 'heic',
    'oversize', 'unknown': {ext: n}}. Rules (RESEARCH Pattern 6):
      - hidden names (leading dot) skipped; hidden DIRS pruned silently
        (never user content: .obsidian/, .git/, .DS_Store)
      - symlinks never followed (os.walk followlinks=False AND a per-entry
        is_symlink check)
      - iCloud placeholders checked BEFORE hashing — a zero-byte stub would
        collide every placeholder onto one content-hash id
      - .heic/.heif skipped + counted (no cross-browser rendering)
      - text > MAX_TEXT_BYTES and images > MAX_IMAGE_BYTES skipped + counted
      - unknown extensions counted by extension (fail-visible, not silent)
      - `onerror`, when given, is handed the walker's own error for a
        directory it could not read, so a caller can tell a vault it
        could not read AT ALL from one it read in part. ⛔ THE DEFAULT
        `None` IS EXACTLY THE SHIPPED POSTURE (such errors ignored), so
        every existing caller is behaviourally byte-unchanged.
    """
    src = Path(src_root)
    candidates = []
    skips = {"hidden": 0, "symlink": 0, "icloud": 0, "heic": 0,
             "oversize": 0, "unknown": {}}
    for root, dirs, files in os.walk(src, followlinks=False,
                                     onerror=onerror):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for name in sorted(files):
            p = Path(root) / name
            if name.startswith("."):
                skips["hidden"] += 1
                continue
            if p.is_symlink():
                skips["symlink"] += 1
                continue
            if is_icloud_placeholder(p):
                skips["icloud"] += 1
                continue
            kind = classify_path(p)
            if kind == "heic":
                skips["heic"] += 1
                continue
            if kind == "unknown":
                ext = p.suffix.lower() or "(no extension)"
                skips["unknown"][ext] = skips["unknown"].get(ext, 0) + 1
                continue
            try:
                size = p.stat().st_size
            except OSError:
                skips["unknown"][p.suffix.lower() or "(no extension)"] = \
                    skips["unknown"].get(p.suffix.lower() or "(no extension)", 0) + 1
                continue
            limit = MAX_TEXT_BYTES if kind == "text" else MAX_IMAGE_BYTES
            if size > limit:
                skips["oversize"] += 1
                continue
            candidates.append((p, kind))
    return candidates, skips


# ---------------------------------------------------------------------------
# Attachments (22-uat, the owner 2026-07-15): a picture that belongs to a note
# travels WITH the note — copied into the library so the note can render it
# later, recorded on the note's entry, but never cataloged as a standalone
# item. A blessing pass over a clipped-notes folder must never deal those
# picture fragments out one by one. Two rules claim a picture:
#   1. body reference — the note embeds it (wikilink / markdown image)
#   2. filename convention — the vault saves clipped-post screenshots as
#      <note stem>_<n>_<author>_来自小红书网页版.jpg next to <note stem>.md,
#      and the body often embeds only SOME of them; a sibling image whose
#      name starts with a scanned note's stem + "_" is that note's
#      attachment even when unreferenced.
# Every name comparison is case-insensitive and Unicode-NFC-normalized on
# both sides — macOS filesystems hand back NFD names for CJK/quote
# characters like “” and ｜, while note bodies and note filenames may carry
# NFC; without folding both to one form those names never match.
# ---------------------------------------------------------------------------

# Obsidian image wikilink: ![[name.ext]] or ![[name.ext|alias]].
_WIKILINK_IMG_RE = re.compile(r"!\[\[\s*([^\]\[|]+?)\s*(?:\|[^\]]*)?\]\]")
# Markdown image: ![alt](path) — optional "title" after the path; the path
# may be %-encoded (Obsidian writes name%20with%20space.jpg).
_MD_IMG_RE = re.compile(r"!\[[^\]]*\]\(\s*<?([^)<>\s]+)>?(?:\s+[\"'][^)]*)?\s*\)")

# The Obsidian xiaohongshu web-clipper stamps every saved attachment with this
# literal suffix ("from the xiaohongshu web version"). It is folded (NFC +
# lowercase, a no-op for CJK) to match _match_name'd image basenames. A real
# standalone photo never carries it, so it marks an image as provably an
# attachment even when its parent note was never saved (scan_attachments r5).
CLIPPER_ATTACHMENT_MARK = "来自小红书网页版"


def _match_name(name: str) -> str:
    """The one folding used for every attachment-name comparison:
    NFC-normalize, then lowercase. Both sides of every match (image file
    names, note stems, body-reference targets) pass through here so an NFD
    filesystem name still matches an NFC note title (and vice versa)."""
    return unicodedata.normalize("NFC", name).lower()


def _ref_basename(target: str) -> str:
    """Normalize one raw reference target to a folded (_match_name) basename,
    or '' when the target is not a local image (web URLs, non-image
    extensions). Vault attachments sit next to their note, so matching is by
    basename."""
    target = target.strip()
    if not target or "://" in target:
        return ""   # a web reference never captures a local picture
    name = _match_name(Path(target.replace("\\", "/")).name.strip())
    if Path(name).suffix in IMAGE_EXTS:
        return name
    return ""


def extract_image_refs(body: str):
    """Return the set of folded (_match_name) image basenames referenced from
    a note body, via Obsidian wikilinks and markdown images. Markdown paths
    are %-decoded; wikilink targets are taken literally (Obsidian never
    encodes them)."""
    refs = set()
    for m in _WIKILINK_IMG_RE.finditer(body):
        name = _ref_basename(m.group(1))
        if name:
            refs.add(name)
    for m in _MD_IMG_RE.finditer(body):
        name = _ref_basename(unquote(m.group(1)))
        if name:
            refs.add(name)
    return refs


def scan_attachments(candidates):
    """Partition a walk's image candidates into attachments vs standalone.

    Three rules, in precedence order (all name comparisons via _match_name —
    case-insensitive, NFC-normalized on both sides):
      1. body reference — reads every text candidate's body and matches its
         image references (by basename) against the walked image candidates
      2. filename convention — an image NOT already claimed by rule 1 whose
         basename starts with a scanned note's stem + "_" (stem = filename
         without extension) belongs to that note; when several stems prefix
         the same name the LONGEST stem wins, ties broken lexicographically
         by note path — deterministic, never claimed twice.
      3. resource pack (25-05 UAT) — an image still unclaimed that lives in
         a STRICT subfolder of a directory holding exactly one note attaches
         to that note (one .md beside subfolders of pack images, referenced
         by nothing). An image sitting beside notes in the same directory is
         never pack-claimed — a loose photo next to notes stays a photo. A
         directory with several notes is ambiguous: the upward walk stops
         and the image stays standalone. The walk never leaves the scanned
         tree (bounded by the candidates' common root).
    Returns (note_refs, attached):
      note_refs: {note Path: sorted list of matched folded basenames} — only
                 notes that own at least one attachment appear
      attached:  set of image Paths that belong to a note (never items)
    An unreadable note contributes no body references (fail-open: its
    pictures stay standalone rather than vanishing) but its stem still
    claims prefix-named siblings — no body read is needed for rule 2."""
    image_names = {}
    for p, kind in candidates:
        if kind == "image":
            image_names.setdefault(_match_name(p.name), []).append(p)
    note_refs = {}
    attached = set()
    for p, kind in candidates:
        if kind != "text":
            continue
        try:
            body = p.read_bytes().decode("utf-8", errors="replace")
        except OSError:
            continue
        refs = extract_image_refs(body)
        matched = set(r for r in refs if r in image_names)
        # 26-05 UAT (the owner): a clipper (xiaohongshu -> Obsidian) writes an
        # embed as <note-stem>_<n>_<original>.jpg while the picture imported
        # under its bare <original>.jpg — reference and file share only the
        # trailing segment, so the direct match above (and rule 2, which needs
        # the FILE to carry the stem) both miss it and the photo leaks as its
        # own card. Reconcile by note identity: a body reference that BEGINS
        # with this note's own stem and ENDS with a candidate image's exact
        # basename on a separator boundary claims that image for this note.
        # The stem anchor keeps it from over-claiming a short shared tail.
        stem = _match_name(p.stem)
        if stem:
            for r in refs:
                if r in image_names or not r.startswith(stem):
                    continue
                for cand_name in image_names:
                    if cand_name == r or not r.endswith(cand_name):
                        continue
                    # the clipper prefix separator is always '_'
                    # (<note-stem>_<n>_<original>); requiring it keeps a short
                    # tail from matching mid-token inside a longer name.
                    if r[:-len(cand_name)][-1:] != "_":
                        continue
                    matched.add(cand_name)
        if matched:
            matched = sorted(matched)
            note_refs[p] = matched
            for name in matched:
                attached.update(image_names[name])

    # Rule 2 — filename convention. Longest stem first so nested stems
    # ("post" vs "post_extra") resolve to the most specific note; the path
    # tiebreak keeps equal stems (same title in two folders) deterministic.
    stems = sorted(((_match_name(p.stem), p) for p, kind in candidates
                    if kind == "text" and p.stem),
                   key=lambda sp: (-len(sp[0]), str(sp[1])))
    if stems:
        for name, paths in image_names.items():
            unclaimed = [p for p in paths if p not in attached]
            if not unclaimed:
                continue   # body references claim first — never re-claimed
            owner = next((note for stem, note in stems
                          if name.startswith(stem + "_")), None)
            if owner is None:
                continue   # no matching stem: stays a standalone item
            refs = note_refs.setdefault(owner, [])
            if name not in refs:
                refs.append(name)
            attached.update(unclaimed)

    # Rule 3 — resource packs. Walk from the image's grandparent upward:
    # the first level holding exactly ONE note claims the image; a level
    # holding several notes is ambiguous and ends the walk; an image whose
    # own directory holds any note is never pack-claimed (rules 1/2 are
    # the only same-directory pairings).
    notes_by_dir = {}
    for p, kind in candidates:
        if kind == "text":
            notes_by_dir.setdefault(p.parent, []).append(p)
    if notes_by_dir:
        try:
            walk_root = Path(os.path.commonpath(
                [str(p) for p, _ in candidates]))
        except ValueError:
            walk_root = None
        if walk_root is not None:
            for name, paths in image_names.items():
                for img in paths:
                    if img in attached or img.parent in notes_by_dir:
                        continue
                    if img.parent == walk_root:
                        continue   # no strict ancestor inside the scan
                    owner = None
                    cur = img.parent.parent
                    while True:
                        here = notes_by_dir.get(cur, [])
                        if len(here) == 1:
                            owner = here[0]
                            break
                        if len(here) > 1 or cur == walk_root \
                                or cur == cur.parent:
                            break
                        cur = cur.parent
                    if owner is not None:
                        refs = note_refs.setdefault(owner, [])
                        if name not in refs:
                            refs.append(name)
                        attached.add(img)

    # Rule 4 (26-05 UAT) — iCloud conflict-copy twins. Syncing leaves
    # `photo.jpg` beside `photo 1.jpg`; a note embeds ONE of them, so
    # the other imported as a standalone card of the same picture. A
    # still-unclaimed image whose name differs from an ATTACHED image
    # only by that trailing " N" belongs to the same note.
    if attached:
        attached_keys = {}
        for a in attached:
            attached_keys.setdefault(_match_name(a.name), a)
        for name, paths in image_names.items():
            for img in paths:
                if img in attached:
                    continue
                stem, ext = os.path.splitext(img.name)
                twin_names = []
                m = re.match(r"^(.*?) \d+$", stem)
                if m:
                    twin_names.append(m.group(1) + ext)   # copy -> original
                twin_names += ["%s %d%s" % (stem, n, ext)
                               for n in range(1, 6)]      # original -> copy
                for tw in twin_names:
                    owner_img = attached_keys.get(_match_name(tw))
                    if owner_img is None:
                        continue
                    owner = next((note for note, refs in note_refs.items()
                                  if _match_name(owner_img.name) in refs),
                                 None)
                    if owner is None:
                        continue
                    refs = note_refs.setdefault(owner, [])
                    if name not in refs:
                        refs.append(name)
                    attached.add(img)
                    break

    # Rule 5 (26-05 UAT, the owner) — orphaned clipper attachments. The Obsidian
    # xiaohongshu web-clipper names every attachment "..._来自小红书网页版.<ext>"
    # ("from the xiaohongshu web version"); an unambiguous marker a real
    # standalone photo never carries. When the parent NOTE was never saved to
    # the vault (only its pictures were), rules 1–4 find no owner and the piece
    # would otherwise import as a context-less standalone card. Such an image
    # is provably an attachment, not a photo, so it is excluded from catalog
    # items even with no note to fold into (it simply does not import). It is
    # added to `attached` (import skips attached images as items and copies
    # only note-owned ones, so an ownerless entry is dropped, not cataloged).
    for name, paths in image_names.items():
        if CLIPPER_ATTACHMENT_MARK not in name:
            continue
        for img in paths:
            attached.add(img)   # no note_refs entry: excluded, never copied

    for note in note_refs:
        note_refs[note] = sorted(note_refs[note])
    return note_refs, attached


# ---------------------------------------------------------------------------
# Store lifecycle (items.json schema v2 — D-06: one store, atomic, sacred)
# ---------------------------------------------------------------------------

def _store_path(library_root) -> Path:
    return Path(library_root) / "items.json"


def new_store(library_root) -> dict:
    """A fresh, empty schema-v2 store dict (NOT written to disk)."""
    return {
        "schema_version": SCHEMA_VERSION,
        "meta": {
            "library_root": str(library_root),
            "consolidation": None,
            "habit_anchor": None,
            "habit_anchor_asked": False,
            "cycle": {"number": 1, "shown_ids": []},
            "current_shelf": None,
            "last_import_report": None,
            "filters": [],
            "cover_offers": {},
            "current_cover": None,
            "incidents": [],
            # 26.4-01 additive-optional meta (RESEARCH Open Q3 — no schema
            # bump; a store loaded WITHOUT these keys behaves identically to
            # a fresh one via the absent-defaults every reader applies):
            #   last_visit_ms          — the previous visit's open stamp;
            #                            None = first visit (whole archive is
            #                            "now"). SILENT machinery — never
            #                            rendered, never returned to a
            #                            surface (law 3). Updated by plan 02.
            #   fenced_roster          — the sensitive-folder roster the
            #                            born-flag stamps against (D-05).
            #   sync_comments_enabled  — the append-to-vault opt-in, OFF by
            #                            default (D-11); a scoped disclosed
            #                            exception, wired by a later plan.
            "last_visit_ms": None,
            "fenced_roster": list(DEFAULT_FENCED_ROSTER),
            "sync_comments_enabled": False,
        },
        "items": {},
    }


def load_store(library_root) -> dict:
    """Load and validate items.json. Raises StoreCorruptError on unparseable
    JSON or a wrong schema_version — it must NEVER return a fresh empty store
    when the file exists but is unreadable (blessing history is sacred).
    Raises FileNotFoundError when the store does not exist at all.
    """
    path = _store_path(library_root)
    if not path.exists():
        raise FileNotFoundError(f"no items.json at {path}")
    try:
        store = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as e:
        raise StoreCorruptError(
            f"items.json is unreadable ({e}). Refusing to touch it — "
            f"your judgments are preserved in the file as-is; repair or "
            f"restore it by hand before continuing.") from e
    if not isinstance(store, dict) or store.get("schema_version") != SCHEMA_VERSION:
        raise StoreCorruptError(
            f"items.json has schema_version "
            f"{store.get('schema_version') if isinstance(store, dict) else '?'} "
            f"(expected {SCHEMA_VERSION}). Refusing to reinitialize.")
    return store


def save_store(library_root, store) -> None:
    """Persist the store atomically. indent=1 + ensure_ascii=False keeps the
    file greppable and hand-inspectable (D-06)."""
    data = json.dumps(store, ensure_ascii=False, indent=1).encode("utf-8")
    atomic_write_bytes(str(_store_path(library_root)), data)


# ONLY_EVER_ADD (D-05 / map #144): durable store fields are additive-only.
# New keys and facets may be added. Removing or renaming a field that an
# older room still reads is forbidden without a deliberate
# tools/compat_bank + tools/compat_check change AND her release note.
# There is NO routine rewrite migrator — migrate_store only fills missing
# keys and bumps schema_version upward. Fail-closed on unknown/corrupt
# schema stays intact (load_store refuses the wrong version).
ONLY_EVER_ADD = True  # named token so rg / suites find this writer site


def migrate_store(store, library_root) -> dict:
    """Migrate a raw store dict UP TO the current SCHEMA_VERSION IN PLACE;
    return it. Steps CHAIN — a v1 store runs v1->2 then falls through to
    v2->3 in one call; a v2 store (today's live store) enters the v2->3 step
    directly. It must NOT early-return on a non-v1 store (26.4-06 — the false
    premise the old guard encoded).

    v1 -> v2 delta (Phase 23), all additive:
      meta  — filters: [] · cover_offers: {} · current_cover: None ·
              incidents: []
      items — year (int) + folder (str) + the 'screenshots' tag where
              detection fires on an image item's title + snapshot header
              bytes (read from library_path, first 64 KB)

    v2 -> v3 delta (26.4-06, D-26/D-29):
      items — the reflects facet backfilled for every TEXT item by reading its
              snapshot (library_path) frontmatter and stamping reflects=True
              when a top-level reflects: key is present. Set only when truthy
              (the predicate treats a missing key as falsy) so a non-reflection
              item stays byte-unchanged.

    Idempotent: a store already at (or newer than) SCHEMA_VERSION is returned
    untouched, meta keys are only filled when missing, the screenshots tag is
    never appended twice, and reflects is only ever set True on a present key —
    so a second pass is a byte-equal no-op (RESEARCH Pitfall 8).

    Reads the RAW dict it is given — it must NOT go through load_store, which
    accepts only the current SCHEMA_VERSION. The caller owns the WRITE_LOCK,
    the one-time version-suffixed backup (items.json.v{n}.bak) BEFORE the first
    migrated write, and the atomic save (server startup — SRM-05)."""
    if not isinstance(store, dict):
        return store
    version = store.get("schema_version")
    if not isinstance(version, int) or version >= SCHEMA_VERSION:
        return store            # already current, or unknown/newer → no-op
    lib = Path(library_root)
    # --- v1 -> v2: additive meta + facet stamp ---
    if version == 1:
        meta = store.setdefault("meta", {})
        meta.setdefault("filters", [])
        meta.setdefault("cover_offers", {})
        meta.setdefault("current_cover", None)
        meta.setdefault("incidents", [])
        for item in store.get("items", {}).values():
            head = b""
            if item.get("type") == "image":
                head = _read_head(lib / item.get("library_path", ""))
            stamp_facets(item, head)
        store["schema_version"] = 2
        version = 2
    # --- v2 -> v3: backfill the reflects facet from snapshot frontmatter ---
    if version == 2:
        for item in store.get("items", {}).values():
            if item.get("type") == "text":
                block = _read_frontmatter_block(
                    lib / item.get("library_path", ""))
                if _frontmatter_has_reflects(block):
                    item["reflects"] = True
        store["schema_version"] = 3
        version = 3
    return store


# ---------------------------------------------------------------------------
# ---- import adapters (25-02, D-02) ----
# Adding a source is a pure adapter change: the ADAPTERS registry below is
# the ONLY home for source-specific logic. Each row is
# (name, source_label, detect, iter_units):
#   detect(src) -> bool          — cheap, order matters, first match wins;
#                                  folder-drop is always-true and stays LAST
#   iter_units(src, skips)       — a generator of units; anything it cannot
#                                  read is counted into `skips` (fail-visible,
#                                  the walk_source posture — never a crash,
#                                  never a silent partial). Two unit shapes:
#     ("file",  path, kind)                        — an on-disk file; flows
#                                                    through the existing
#                                                    copy2 snapshot path
#     ("synth", rel_name, data, created_ms, title) — content materialized
#                                                    from an export; written
#                                                    into items/ through the
#                                                    same normalize -> hash ->
#                                                    dedup -> atomic core
# Downstream (states, shelf, reader, containers) never sees any of this:
# every unit becomes an ordinary item. Both export schemas are community-
# documented (MEDIUM confidence); the checked-in fixtures under
# tests/fixtures/ are the Wave-0 stand-in until real exports are verified.
# ---------------------------------------------------------------------------

# An export file over this cap is refused BEFORE parsing, in plain words —
# a deliberate, generous read cap owned by the adapters (walk_source's
# MAX_TEXT_BYTES is for single notes; conversations.json is read on purpose).
MAX_EXPORT_BYTES = 512 * 1024 * 1024


def _count_skip(skips, key, n=1):
    """Increment a per-reason counter in the report's skipped dict."""
    skips[key] = skips.get(key, 0) + n


def _read_export(src, skips):
    """Load src/conversations.json under MAX_EXPORT_BYTES.

    Returns the parsed conversation list, or None after writing a
    plain-words entry into `skips['export-refused']` — an unreadable export
    imports nothing and says why, never a stack trace."""
    cj = Path(src) / "conversations.json"
    try:
        size = cj.stat().st_size
    except OSError:
        skips["export-refused"] = (
            "the export's conversations.json could not be read.")
        return None
    if size > MAX_EXPORT_BYTES:
        mb = max(1, size // (1024 * 1024))
        skips["export-refused"] = (
            f"this export file is too large to read — {mb} MB; "
            "split it and try again.")
        return None
    try:
        data = json.loads(cj.read_bytes())
    except (ValueError, OSError):
        skips["export-refused"] = (
            "the export's conversations.json could not be read as JSON.")
        return None
    if not isinstance(data, list):
        skips["export-refused"] = (
            "the export's conversations.json is not a list of conversations.")
        return None
    return data


def _export_discriminator(src):
    """'mapping' | 'chat_messages' | None for src/conversations.json.

    iCloud placeholders are checked FIRST (detection must never trigger a
    download). A file over MAX_EXPORT_BYTES is still claimed by sniffing its
    head bytes, so the plain-words refusal in _read_export surfaces instead
    of a silent fall-through to folder-drop."""
    cj = Path(src) / "conversations.json"
    try:
        if not cj.is_file() or is_icloud_placeholder(cj):
            return None
        size = cj.stat().st_size
    except OSError:
        return None
    if size > MAX_EXPORT_BYTES:
        head = _read_head(cj)
        if b'"mapping"' in head:
            return "mapping"
        if b'"chat_messages"' in head:
            return "chat_messages"
        return None
    try:
        data = json.loads(cj.read_bytes())
    except (ValueError, OSError):
        return None
    if isinstance(data, list) and data and isinstance(data[0], dict):
        if "mapping" in data[0]:
            return "mapping"
        if "chat_messages" in data[0]:
            return "chat_messages"
    return None


def _detect_chatgpt(src) -> bool:
    return _export_discriminator(src) == "mapping"


def _detect_claude(src) -> bool:
    return _export_discriminator(src) == "chat_messages"


def _detect_obsidian(src) -> bool:
    return (Path(src) / ".obsidian").is_dir()


def _conversation_markdown(title, blocks) -> bytes:
    """One markdown item per conversation: '# <title>', then each message as
    a role-labeled block with its text VERBATIM under the label (law 4 —
    verbatim & undecorated; the labels are structure, never rewording)."""
    parts = ["# " + title + "\n"]
    for label, text in blocks:
        parts.append("\n" + label + "\n\n" + text + "\n")
    return "".join(parts).encode("utf-8")


def _iter_chatgpt(src, skips):
    """Units from a ChatGPT export. The canonical thread of a conversation
    is the walk current_node -> parent -> ... -> root, then reversed —
    NEVER a create_time sort: edited threads branch, and sorting would
    interleave abandoned branches into the kept one. Every conversation
    converts inside its own try/except: a malformed one is counted into
    skips['unreadable-conversations'] and the rest still import."""
    src = Path(src)
    convs = _read_export(src, skips)
    if convs is None:
        return
    for index, conv in enumerate(convs):
        try:
            title = str(conv.get("title") or "").strip() \
                or "untitled conversation"
            created_ms = int(float(conv["create_time"]) * 1000)
            mapping = conv["mapping"]
            node_id = conv["current_node"]
            chain = []
            seen = set()
            while node_id is not None and node_id in mapping \
                    and node_id not in seen:
                seen.add(node_id)
                node = mapping[node_id]
                chain.append(node)
                node_id = node.get("parent")
            chain.reverse()
            blocks = []
            for node in chain:
                msg = node.get("message")
                if not isinstance(msg, dict):
                    continue        # null root / structural shells
                role = (msg.get("author") or {}).get("role")
                if role not in ("user", "assistant"):
                    continue        # system / tool turns are never content
                if (msg.get("metadata") or {}).get(
                        "is_visually_hidden_from_conversation"):
                    continue        # hidden bookkeeping turns
                content = msg.get("content") or {}
                if content.get("content_type") != "text":
                    _count_skip(skips, "non-text-parts")
                    continue        # counted, never silently dropped
                texts = []
                for part in (content.get("parts") or []):
                    if isinstance(part, str):
                        texts.append(part)
                    else:
                        _count_skip(skips, "non-text-parts")
                text = "\n".join(t for t in texts if t)
                if not text:
                    continue
                label = "**me**" if role == "user" else "**assistant**"
                blocks.append((label, text))
            if not blocks:
                _count_skip(skips, "empty-conversations")
                continue            # never written as an empty item
            yield ("synth", f"conversations.json:{index}",
                   _conversation_markdown(title, blocks), created_ms, title)
        except Exception:
            _count_skip(skips, "unreadable-conversations")


def _iter_claude(src, skips):
    """Units from a Claude export. chat_messages is already linear — no
    tree walk (the ChatGPT walk's mirror mistake). created_at is ISO-8601
    with a trailing 'Z': datetime.fromisoformat rejects that suffix before
    python 3.11, so the 'Z' is folded to '+00:00' first — durable across
    the system python versions this app may meet. Same tolerant
    per-conversation posture as the ChatGPT iterator."""
    src = Path(src)
    convs = _read_export(src, skips)
    if convs is None:
        return
    for index, conv in enumerate(convs):
        try:
            title = str(conv.get("name") or "").strip() \
                or "untitled conversation"
            stamp = str(conv["created_at"]).replace("Z", "+00:00")
            created_ms = int(
                datetime.fromisoformat(stamp).timestamp() * 1000)
            blocks = []
            for msg in conv["chat_messages"]:
                sender = msg.get("sender")
                if sender not in ("human", "assistant"):
                    continue
                text = msg.get("text")
                if not isinstance(text, str) or not text:
                    # newer exports carry content blocks instead of a
                    # top-level text field — join the text blocks, count
                    # any other block type out loud
                    pieces = []
                    for block in (msg.get("content") or []):
                        if isinstance(block, dict) \
                                and block.get("type") == "text" \
                                and isinstance(block.get("text"), str):
                            pieces.append(block["text"])
                        else:
                            _count_skip(skips, "non-text-parts")
                    text = "\n".join(p for p in pieces if p)
                if not text:
                    continue
                label = "**me**" if sender == "human" else "**assistant**"
                blocks.append((label, text))
            if not blocks:
                _count_skip(skips, "empty-conversations")
                continue            # never written as an empty item
            yield ("synth", f"conversations.json:{index}",
                   _conversation_markdown(title, blocks), created_ms, title)
        except Exception:
            _count_skip(skips, "unreadable-conversations")


def _iter_folder(src, skips):
    """The existing walk expressed as units — file units flow through the
    unchanged copy2 snapshot path; the walker's per-reason skip counts
    carry straight into the report."""
    candidates, walk_skips = walk_source(src)
    skips.update(walk_skips)
    for path, kind in candidates:
        yield ("file", path, kind)


def _iter_obsidian(src, skips):
    """An Obsidian vault is the folder walk with its own source label —
    the walker already prunes hidden dirs, so .obsidian/ (and .trash/)
    content never leaks in."""
    yield from _iter_folder(src, skips)


# Order matters: the first matching detect wins, and folder-drop is the
# always-true fallback — it stays LAST.
ADAPTERS = (
    ("chatgpt-export", "ai-chat-export", _detect_chatgpt, _iter_chatgpt),
    ("claude-export", "ai-chat-export", _detect_claude, _iter_claude),
    ("obsidian-vault", "obsidian-vault", _detect_obsidian, _iter_obsidian),
    ("folder-drop", "folder-drop", lambda p: True, _iter_folder),
)


def _pick_adapter(src):
    """(name, source_label, iter_units) for the first matching ADAPTERS
    row — total: the folder-drop detect is always true."""
    for name, label, detect, iter_units in ADAPTERS:
        if detect(src):
            return name, label, iter_units
    name, label, _, iter_units = ADAPTERS[-1]   # unreachable belt-and-braces
    return name, label, iter_units


def detect_adapter(src):
    """(adapter name, source label) for `src` — the pure helper the server
    wiring uses. First matching row of ADAPTERS wins."""
    name, label, _ = _pick_adapter(Path(src))
    return name, label


def scan_source(src):
    """A dry-run look at `src` for the import screen — pure, reads only.

    Returns the established scan counts dict {'text', 'image', 'attached',
    'total', 'skipped'} PLUS 'adapter' and 'source_label', and — for the
    export adapters — 'conversations', the honest denominator a later plan's
    progress readout divides by."""
    src = Path(src)
    name, label, _ = _pick_adapter(src)
    if label == "ai-chat-export":
        skips = {}
        convs = _read_export(src, skips)
        n = len(convs) if convs is not None else 0
        return {"adapter": name, "source_label": label,
                "conversations": n, "text": n, "image": 0,
                "attached": 0, "total": n, "skipped": skips}
    candidates, skips = walk_source(src)
    _, attached = scan_attachments(candidates)
    text = sum(1 for _, kind in candidates if kind == "text")
    image = sum(1 for p, kind in candidates
                if kind == "image" and p not in attached)
    return {"adapter": name, "source_label": label, "text": text,
            "image": image, "attached": len(attached),
            "total": text + image, "skipped": skips}


# ---------------------------------------------------------------------------
# Import (D-05: copy snapshots, never touch originals; D-08: dedup no-op)
# ---------------------------------------------------------------------------

def _unique_id(full_hash: str, items: dict) -> str:
    """Return the shortest id prefix (>=16 hex) of `full_hash` that either is
    unused or already maps to this exact content (the dedup case). On a
    prefix collision with a DIFFERENT full hash, extend with more hex chars."""
    for n in range(16, len(full_hash) + 1):
        cand = full_hash[:n]
        existing = items.get(cand)
        if existing is None or existing["content_hash"] == full_hash:
            return cand
    return full_hash  # unreachable in practice: the full hash is unique


# ---------------------------------------------------------------------------
# ---- #58: THE IDENTITY WIRE -----------------------------------------------
#
# ⚠ AN ITEM'S ID IS THE PREFIX OF A CONTENT HASH, SO UNTIL THIS EXISTED EVERY
# EDIT MADE A NEW ITEM. `hash_item` over a whitespace-only change —
# "Hello. World.\n" -> "Hello.\nWorld.\n" — returns a completely different id.
# A note the person had blessed therefore re-entered on the next import as
# brand new and unseen, with the blessing stranded on a copy the room would
# never surface again.
#
# MEASURED, NOT FEARED. Her live library already held 32 origin paths carrying
# more than one item (65 items) from two imports 3.5 days apart, and 24 of
# those doubles carried a stranded blessing. The folded-title inheritance held
# for `never_show`, `retired` and `trigger` — zero mismatches across all 32 —
# so `blessed` is precisely the judgement nothing protected. The shipped
# readability tidy-up then made the fork reachable in bulk: one approval
# touches ~490 notes on her vault, against notes ticked one at a time before.
#
# ⛔ THE OBVIOUS NARROW FIX DOES NOT WORK, recorded here so nobody spends a
# session on it: updating the stored `content_hash` in place achieves nothing,
# because a re-import recomputes the hash, derives a NEW id from it, finds
# nothing at that key, and creates a second item anyway.
#
# ✅ THE FIX IS A DIFFERENT KEY (#58 ruling 1). An item is keyed by WHERE THE
# FILE LIVES — `origin_path` — falling back to WHAT IT IS CALLED, the folded
# filename, which is the same fold `_inherit_judgment` and the attachment
# matcher already use. ⚠ The lookup runs BEFORE the hash-derived branch, or a
# note refreshed once forks on the very next import: after a refresh its id no
# longer matches its own hash prefix, which is fine, but only if the path
# lookup is what runs first.
#
# ⚠ IDENTITY DOES NOT SURVIVE A RENAME, AND THAT IS CONSCIOUSLY ACCEPTED
# (ruling 5, taken against a stated recommendation to accept it). The fallback
# rescues a MOVE — path gone, name intact — while a rename breaks both legs at
# once, so a renamed note is a new note. Her reasoning: a wrong join loses a
# note outright, a missed one only makes a double, and healing is the net.
# ⚠ The accepted cost is bigger than lost history: a HAND-SET HIDING dies with
# the title, because the folded-name match is the only thing that could have
# carried it. Her folder-derived fence survives (a renamed journal entry is
# still under Journal/, so `born_trigger` re-fences it on the way in).
# ⛔ Do not "improve" this by chasing renames by content trace or opening
# lines. She was shown that consequence and took the gap anyway.
#
# ⚠ A REFRESHED ITEM KEEPS ITS ID, and that is what keeps this a small change
# rather than a re-keying of the whole room. `content_hash` is read in exactly
# ONE place in shipped code (`_unique_id`, and only while allocating an id for
# a NEW item); nothing anywhere asserts that an id is a prefix of its hash —
# six existing suites use `content_hash: item_id * 4`, which is not a hash of
# anything, and are green; and the snapshot path is f"items/{item_id}{suffix}",
# so a stable id keeps the snapshot, the reading store, the decorations, the
# blessings and the comments all pointing at what they pointed at before.
# ---------------------------------------------------------------------------


def refresh_item(item, path, kind, library_root, born_trigger=False,
                 origin_path=None) -> dict:
    """Re-derive what the ROOM worked out about `item` from the file now at
    `path`, keeping everything THE PERSON said about it (#58 ruling 2).

    Mutates `item` in place. Returns {'changed', 'words_changed'} — `changed`
    is whether the stored record moved at all, `words_changed` is whether the
    note's actual words moved (see below), which is a different question.

    CARRIED, because she said it: `state` (and with it blessed / never_show /
    retired / resting), `last_opened_ms`, `resting_until_ms`, `history`,
    `merged_from`, `attachments`, and any tags already on the item. Her
    reasoning in effect: *a tidy-up you asked for should not cost you a
    blessing* — and the same holds for editing your own note in Obsidian.

    RE-DERIVED, because the room guessed it: `content_hash`, the snapshot,
    `origin_path`, `title`, `saved_ms`, `reflects`, and the facets.

    ⚠ THE FENCE RATCHETS ONLY (ruling 2, #51's sticky-True, and the sole
    exemption from "re-derive what the room worked out"). A refresh may RAISE
    `trigger` and never lower it. Safe by inspection: `trigger` has four
    writers — the roster-born stamp, title inheritance, the roster-add sweep,
    and the person's own hide — and content changing underneath a note can
    reach none of them, so keeping whatever is already there is the only
    honest move.

    ⚠⚠ `created_ms` IS DELIBERATELY NOT RE-DERIVED, AND THIS IS A TRAP RATHER
    THAN A PREFERENCE. `created_ms` comes from `st_birthtime`, and every write
    path in this codebase is an atomic temp-write-then-rename — so a tidied
    note is a NEW inode whose birthtime is the moment the tidy-up ran.
    Re-deriving it would move `created_ms`, and with it the `year` facet that
    her "nothing from 2023" filter reads, to TODAY for every note one tap
    touched. The birth of a note is a fact about the note; bytes changing
    underneath it is not a new birth. `saved_ms` (mtime) IS re-derived,
    because when a file was last saved is exactly what it claims to be.

    ⚠ THE SNAPSHOT IS RE-TAKEN AT THE SAME PATH. `library_path` is
    items/<id><suffix> and the id does not move, so nothing that points at a
    snapshot has to be told anything. This is the amendment that turns
    `stamp_facets`' and CONTEXT.md's stamped-once rule into
    stamped-once-per-VERSION.

    ⚠ `origin_path`, when given, is what gets RECORDED while `path` is what
    gets READ (26.97-03). They differ for exactly one caller: a
    structure-preserving scratch copy, where the bytes live in the scratch
    area but the note's real home — the thing her comment write-back jails on
    and the room's identity index is built from — is the file in her vault.
    Omitting it records `path`, which is byte-identical to the behaviour every
    existing caller had.

    Never raises on a missing or unreadable file — the caller has already
    walked to it, and a file that vanished between the walk and here leaves
    the item exactly as it was."""
    lib = Path(library_root)
    p = Path(path)
    changed = False
    words_changed = False
    try:
        _id16, full = hash_item(p, kind)
    except OSError:
        return {"changed": False, "words_changed": False}
    if item.get("content_hash") != full:
        # #94 ruling 2 says a verdict about a note dies with the note's words,
        # and ruling 7 says the tidy-up's whitespace is NOT such a change.
        # Answering that needs the words the room last saw, which is what the
        # snapshot IS. ⚠ `_readability_same_words` is the tidy-up's own
        # run-time write gate, CALLED and never re-spelled: #94 ruling 7
        # noticed that the staleness test and the tidy-up's safety test are
        # the same test, and a second spelling of a predicate is the defect
        # class that has already cost this project twice.
        words_changed = True
        if kind == "text":
            old = _snapshot_bytes(lib, item)
            if old is not None:
                try:
                    words_changed = not _readability_same_words(
                        old, p.read_bytes())
                except OSError:
                    words_changed = True
        library_path = item.get("library_path") \
            or f"items/{item.get('id')}{p.suffix.lower()}"
        target = lib / library_path
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, target)      # the snapshot, re-taken in place
        except OSError:
            return {"changed": False, "words_changed": False}
        item["content_hash"] = full
        item["library_path"] = library_path
        changed = True
    recorded_origin = str(origin_path) if origin_path is not None else str(p)
    if recorded_origin != item.get("origin_path"):
        item["origin_path"] = recorded_origin   # this is what makes a MOVE a move
        changed = True
    if p.name != item.get("title"):
        item["title"] = p.name
        changed = True
    try:
        _created_ms, saved_ms = stat_dates(p.stat())
    except OSError:
        saved_ms = item.get("saved_ms")
    if saved_ms != item.get("saved_ms"):
        item["saved_ms"] = saved_ms
        changed = True
    if born_trigger and not item.get("trigger"):
        item["trigger"] = True           # the ratchet: raise, never lower
        changed = True
    if not changed:
        # ⚠ NOTHING MOVED, SO NOTHING IS RE-DERIVED — an unchanged file is
        # still the total no-op D-08 promises, down to items.json being
        # byte-equal after the second import (pinned in tests/test_import.py).
        # "Stamped once per VERSION" means re-stamped when the version
        # changes, not re-stamped every time anybody walks past. Re-stamping
        # here would also quietly overwrite a facet somebody had revised by
        # hand on an item whose file never moved.
        return {"changed": False, "words_changed": False}
    had_reflects = item.get("reflects") is True
    now_reflects = kind == "text" and _frontmatter_has_reflects(
        _read_frontmatter_block(p))
    if now_reflects:
        item["reflects"] = True
    else:
        item.pop("reflects", None)       # the key left the note: so does this
    head = _read_head(p) if kind == "image" else b""
    stamp_facets(item, head)
    return {"changed": True, "words_changed": words_changed}


def import_folder(src_root, library_root, consolidation=None,
                  progress_cb=None, vault_root=None, roster=None,
                  superseded_cb=None, staged_from=None,
                  should_stop=None) -> dict:
    """Import a source folder into the app-owned library (SRM-02, SRM-08).

    detect adapter -> units -> hash -> persist, one atomic save at the end:
      - the first matching ADAPTERS row owns the source (D-02): "file" units
        flow through the copy2 snapshot path exactly as before; "synth"
        units (conversations materialized from an AI-chat export) are
        normalized, hashed, deduped, and written to items/<id>.md via
        atomic_write_bytes — the name is ALWAYS server-generated, never
        derived from export content (path-traversal fence)
      - every item's source is the adapter's label (folder-drop |
        obsidian-vault | ai-chat-export)
      - creates the library layout (items/ dir; items.json only if absent —
        an existing corrupt store raises StoreCorruptError, never overwritten)
      - copies NEW file items with shutil.copy2 (preserves mtime) to
        items/<id><suffix>; originals are never modified (D-05)
      - re-import of an UNCHANGED file is a dedup no-op: state,
        last_opened_ms, and history all survive untouched (D-08)
      - ⚠ re-import of a CHANGED file is a REFRESH, not a new item (#58
        rulings 1/2, 2026-08-14). This docstring used to say facets were
        never rewritten on existing items; that was true while an edited file
        became a different item, and it is now wrong. An item is looked up by
        `origin_path`, falling back to its folded filename when the old path
        is gone (a move); the item KEEPS ITS ID, everything the person said
        about it carries over, and only what the room worked out for itself —
        content_hash, snapshot, title, saved_ms, reflects, facets — is
        re-derived. Facets are stamped once per VERSION. See `refresh_item`
        for what carries, what is re-derived, and why `created_ms` is not.
      - ⚠ identity does not survive a RENAME, consciously accepted (ruling 5)
      - every double the store already holds at one origin path is JOINED
        first (`heal_origin_doubles`), the copy the person judged surviving,
        counted out loud in the report as `joined`
      - every NEW item is facet-stamped (D-05): year (int, server-local from
        created_ms), folder (immediate parent dir name of origin_path), and
        the literal 'screenshots' tag on image items whose name or header
        bytes match the detection heuristics
      - synth items carry created_ms/saved_ms from the export's OWN
        timestamps, never stat(); a conversation whose bytes exceed
        MAX_TEXT_BYTES is skipped-with-count, never truncated (law 4)
      - images a note links to OR that carry a note's stem as a filename
        prefix (22-uat, see scan_attachments) are ATTACHMENTS: copied to
        attachments/<note_id>/<basename> and recorded on the note's entry
        (item['attachments']), never cataloged as items; copies and records
        are idempotent on re-import
      - progress_cb, when given, is called once per processed unit with
        (done, total) — purely additive; omitting it changes nothing
      - should_stop, when given, is called once per processed unit with no
        arguments; if it raises, the import aborts (26.997 cooperative
        stop). Omitting it changes nothing.
      - superseded_cb, when given, is called ONCE at the end with the sorted
        list of ids whose MATERIAL moved: a note whose words changed (never
        one where only whitespace moved, #94 ruling 7) or a picture whose
        bytes changed at all. ⚠ Everything the room DERIVED from one of these
        items is now a statement about a version that no longer exists — the
        shelf verdict about a note's words, the Vision reading of a photograph
        — which is #58 ruling 2 ("only what the room worked out for itself is
        re-derived") reaching past items.json. ⚠ It is a callback rather than
        a list of paths because this module owns items.json AND NOTHING ELSE:
        the notebook and the readings each live behind their own lock in the
        server, and the discipline tests/test_import.py already pins for the
        decoration store is the same one here
      - ⚠ `staged_from`, when given, names the TRUE source root that
        `src_root` is a STRUCTURE-PRESERVING scratch copy of (26.97-03,
        implementing `26.97-DECISIONS.md` DECISION 1 = `keep-the-shape`).
        Three things then read `staged_from` instead of `src_root`: which
        adapter owns the source (so a scratch copy of a vault is recognised
        as a VAULT import and the roster branch actually runs), the vault
        root the fence resolves against, and the origin recorded on every
        item. Bytes are still read out of `src_root`, where they are; only
        the RECORDED origin is rebased. That is what stops roughly nine
        hundred notes ending up remembering a scratch directory that has
        been deleted — which would break her comment write-back, the room's
        memory of which note is which, and the `folder` facet the reflections
        predicate stands on. The units iterator still walks `src_root`.
        ⚠ ADDITIVE: omitted, every one of these reads `src_root` exactly as
        before, so existing callers are byte-identical.
      - stores the consolidation answer into meta.consolidation when provided
        (D-09 Q1 storage seam) and meta.last_import_report = the report
      - persists ONCE at the end via save_store (atomic)

    Returns the report: {'imported', 'deduped', 'refreshed', 'joined',
    'join_refused', 'inherited', 'attached', 'skipped': per-reason counts}.
    Plus 'finished_ms' — the server's epoch-ms wall clock at the moment
    this import finished (26.97-06).
    """
    src = Path(src_root)
    lib = Path(library_root)
    lib.mkdir(parents=True, exist_ok=True)
    items_dir = lib / "items"
    items_dir.mkdir(exist_ok=True)

    if _store_path(lib).exists():
        store = load_store(lib)   # StoreCorruptError propagates: refuse
    else:
        store = new_store(lib)

    # 26.97-03: the scratch-copy rebase. `stage_base` is where the bytes are;
    # `true_base` is where the notes actually live. Both None for every
    # ordinary import, and every read below then falls through to `src`.
    stage_base = Path(src_root) if staged_from is not None else None
    true_base = Path(staged_from) if staged_from is not None else None
    identity_root = true_base if true_base is not None else src

    def _origin_of(p):
        """The origin to RECORD for a file found at `p`. Identity when this is
        not a scratch copy; otherwise the same vault-relative position under
        the true source root. Fails SAFE to `p` for anything outside the
        scratch area rather than inventing a path."""
        if true_base is None:
            return Path(p)
        try:
            return true_base / Path(p).relative_to(stage_base)
        except ValueError:
            return Path(p)

    # ⚠ The LABEL and the vault identity come from the true root; the units
    # iterator is still handed `src`, which is where the bytes are.
    adapter_name, source_label, iter_units = _pick_adapter(identity_root)
    # 26.4-01 (D-05/D-08): the whole-vault born-flag. Only an obsidian-vault
    # import fences by roster (origin_path is vault-relative there); the
    # roster in force is the confirmed one in meta (the import screen writes
    # edits through add/remove BEFORE it fires the import), defaulting to the
    # shipped roster on a fresh store. vault_root defaults to the folder
    # being imported (whole-vault import targets the vault root).
    is_vault = source_label == "obsidian-vault"
    if vault_root is None:
        vault_root = str(identity_root)
    active_roster = _active_roster(store, roster)
    skips = {"hidden": 0, "symlink": 0, "icloud": 0, "heic": 0,
             "oversize": 0, "unknown": {}}
    units = list(iter_units(src, skips))
    candidates = [(u[1], u[2]) for u in units if u[0] == "file"]
    note_refs, attached = scan_attachments(candidates)
    report = {"imported": 0, "deduped": 0, "refreshed": 0, "joined": 0,
              "join_refused": 0, "attached": len(attached),
              "inherited": 0, "skipped": skips}

    # #58 ruling 3, and it runs BEFORE the walk so that a path holding two
    # items holds exactly one by the time this import reaches it. Over the
    # WHOLE store rather than only the walked paths: a double is a double
    # whether or not this import happens to touch it, and her call was the
    # same one she made about the frozen verdicts — fix what is already
    # stuck, do not merely stop making more.
    _healed = heal_origin_doubles(store, lib)
    report["joined"] = _healed["joined"]
    report["join_refused"] = _healed["refused"]

    # 26-05 UAT (P0 fix): a judgment attaches to the THING, not its bytes.
    # Content-hash dedup means an EDITED copy of a note the user marked
    # never_show / retired / trigger-flagged re-enters as a fresh unseen
    # card — the exact ambush those states exist to prevent (found live:
    # a re-import resurrected all three of the owner's judged items).
    # Folded-title identity; err-toward-holding-back; counted out loud.
    judged_by_title = {}
    for _it in store["items"].values():
        if (_it.get("state") in ("never_show", "retired")
                or _it.get("trigger") is True):
            _key = _match_name(str(_it.get("title") or ""))
            if _key:
                judged_by_title.setdefault(_key, _it)

    # ---- 26.97 (T-26.97-10 / REVIEW CR-02): THE ORPHAN LEG ---------------
    #
    # ⚠⚠ THIS OVERTURNS #58 RULING 5, ON THE OWNER'S EXPLICIT RE-ASK
    # (2026-08-19). The folded-title leg above carries a judgement across a
    # rename ONLY while the name is the thing that stayed still. A rename AND
    # an edit in one sitting — which is what a rename in Obsidian actually
    # looks like — moves the path AND the name AND the bytes, so every key
    # misses and the mint below runs: a note she said NEVER TO SHOW HER comes
    # back as a fresh `unseen` card in the blessing pile.
    #
    # Ruling 5 accepted that, and its reasoning was sound: "a wrong join loses
    # a note outright, a missed join only makes a double, and healing is the
    # net." ⛔ THAT REASONING IS FALSE FOR A JUDGED NOTE, because for a hidden
    # one a double is not a double — it is a leak, and law 5 calls a
    # never-list leak absolute. It was ruled when this could only fire on a
    # deliberate whole-vault re-import; Phase 26.97 put the same walk behind a
    # CANDLE TAP, unattended. Measured on her library at the re-ask: 78 items
    # never_show/retired, 74 outside any folder she keeps private, 18 of those
    # reachable by a vault re-pull.
    #
    # The join is deliberately the narrowest one that closes it: a judged item
    # whose FILE IS GONE FROM DISK, in the SAME parent directory, of the SAME
    # kind. It is the module's own stated posture — err toward holding back.
    #
    # ⛔ ONE ORPHAN IS CLAIMABLE ONCE. Without that, a folder that ever held a
    # hidden note would silently hide everything she added to it afterwards,
    # forever — a far worse defect than the one being fixed, and the reason
    # the anti-swallow case is driven.
    #
    # ⛔ never_show / retired / trigger ONLY. A blessed note renamed-and-edited
    # is still a new unseen note, exactly as ruling 5 decided, and that is
    # pinned by a test that must stay able to go red.
    _JUDGED_STRICTNESS = {"retired": 2, "never_show": 1}
    judged_orphans_by_dir = {}
    for _it in store["items"].values():
        if not (_it.get("state") in ("never_show", "retired")
                or _it.get("trigger") is True):
            continue
        _o = _it.get("origin_path")
        if not isinstance(_o, str) or not _o:
            continue
        _p = Path(_o)
        if not _p.is_absolute():
            continue          # the room's own writing is never an orphan
        try:
            if _p.exists():
                continue      # its file is still there: nothing vanished
        except OSError:
            continue          # fail closed: unreadable is not "gone"
        judged_orphans_by_dir.setdefault(str(_p.parent), []).append(_it)
    orphans_claimed = set()

    def _orphan_twin(item):
        """The judged item this newly-minted file most likely IS, or None.

        Reached ONLY when the folded-title leg missed. Same directory, same
        kind, file already gone; the strictest state wins when a directory
        lost more than one. Pure apart from the existence checks taken above."""
        try:
            parent = str(Path(str(item.get("origin_path") or "")).parent)
        except (OSError, ValueError):
            return None
        best = None
        for cand in judged_orphans_by_dir.get(parent, ()):
            if str(cand.get("id")) in orphans_claimed:
                continue
            if cand.get("type") != item.get("type"):
                continue
            if (best is None
                    or _JUDGED_STRICTNESS.get(str(cand.get("state")), 0)
                    > _JUDGED_STRICTNESS.get(str(best.get("state")), 0)):
                best = cand
        return best

    def _inherit_judgment(item):
        twin = judged_by_title.get(_match_name(item["title"]))
        if twin is None:
            # the orphan leg — a rename-and-edit, which the title leg cannot see
            twin = _orphan_twin(item)
            if twin is not None:
                orphans_claimed.add(str(twin.get("id")))
        if twin is None:
            return item
        if twin.get("state") in ("never_show", "retired"):
            item["state"] = twin["state"]
        item["trigger"] = bool(twin.get("trigger")) or item["trigger"]
        item["history"][0]["to"] = item["state"]
        item["history"][0]["via"] = "import-inherited-judgment"
        report["inherited"] += 1
        return item

    # ---- #58 ruling 1: THE RECONCILIATION INDEX --------------------------
    # Two legs, consulted in this order and never the other way round.
    #
    # ⚠ ONLY AN ITEM THAT CAME FROM A FILE ON DISK IS IN EITHER LEG, and the
    # two exclusions are the same sentence twice. A thing that may never be
    # RECOGNISED must not be CLAIMABLE either: both these kinds carry a
    # `title` with no extension, so leaving them in the name leg lets a file
    # called `<that title>` refresh them with its own words.
    #
    #   * a materialized conversation — it cannot be reconciled at all (see
    #     the synth branch below: its origin_path is a POSITION in an export
    #     file, not an identity).
    #   * a note the ROOM made, whose origin_path is `items/<id>.md`,
    #     relative and inside the library. `validate_source_path` resolves
    #     every real import to an absolute path, so requiring one costs a
    #     genuine file nothing and keeps the room's own writing out.
    #
    # Rare either way, and rarity is not the standard: a wrong join is the one
    # mistake ruling 5 refused to risk.
    by_origin = {}
    by_folded_name = {}
    for _it in store["items"].values():
        if _it.get("source") == "ai-chat-export":
            continue
        if not Path(str(_it.get("origin_path") or "")).is_absolute():
            continue
        _o = _it.get("origin_path")
        if isinstance(_o, str) and _o:
            by_origin.setdefault(_o, _it)
        _n = _match_name(str(_it.get("title") or ""))
        if _n:
            by_folded_name.setdefault(_n, []).append(_it)
    claimed = set()      # item ids already recognised during THIS walk

    def _reconcile(path):
        """The existing item this file IS, or None if the room cannot tell.

        Leg 1 is `origin_path` — where the file lives — and it is exact.

        Leg 2 is the folded filename, and it fires ONLY when the old path is
        gone. ⚠ THAT CONDITION IS NOT IN THE RULING AND IT IS NOT AN ATTEMPT
        TO CHASE RENAMES; it is what stops the fallback swallowing a
        stranger. Taken bare, "match by filename" joins two different notes
        both called `index.md` in two different folders — and a wrong join
        loses a note OUTRIGHT, which is the exact harm she weighed in ruling
        5 when she chose to accept the rename gap ("a missed join only makes
        a double, and healing is the net"). A move means the old path is not
        there any more, so requiring that is the difference between
        recognising a move and eating somebody's new note.

        Two more refusals for the same reason: an ambiguous folded name (two
        items already share it) yields None, and an item already recognised
        earlier in this same walk is never claimed twice. When the room
        cannot tell, it makes a second item — the cheaper mistake, ruled."""
        found = by_origin.get(str(path))
        if found is not None:
            return found
        twins = by_folded_name.get(_match_name(path.name)) or []
        if len(twins) != 1:
            return None
        twin = twins[0]
        if str(twin.get("id")) in claimed:
            return None
        old = twin.get("origin_path")
        if not isinstance(old, str) or not old:
            return None
        try:
            if Path(old).exists():
                return None       # both copies are here: two notes, not a move
        except OSError:
            return None
        return twin

    now_ms = int(time.time() * 1000)
    total = len(units)
    done = 0
    superseded = set()   # ids whose MATERIAL moved — see superseded_cb above

    note_ids = {}   # note Path -> item id (new or deduped) for attachments
    for unit in units:
        if unit[0] == "file":
            _, path, kind = unit
            if kind == "image" and path in attached:
                pass   # travels with its note below; never a catalog item
            else:
                # ⚠ THE RECONCILIATION IS CONSULTED FIRST, BEFORE THE HASH.
                # After one refresh an item's id no longer matches its own
                # content-hash prefix — which is fine, and is only fine
                # because this lookup runs before the hash-derived branch. Put
                # the hash first and every refreshed note forks on the very
                # next import.
                origin = _origin_of(path)
                existing = _reconcile(origin)
                if existing is not None:
                    item_id = str(existing.get("id"))
                    claimed.add(item_id)
                    born_trigger = is_vault and _origin_under_roster(
                        str(origin), vault_root, active_roster)
                    res = refresh_item(existing, path, kind, lib,
                                       born_trigger=born_trigger,
                                       origin_path=str(origin))
                    # a MOVE lands the item at a path leg 1 has never seen;
                    # record it so a second file at the same path in this same
                    # walk cannot claim it again
                    by_origin.setdefault(str(origin), existing)
                    if kind == "text":
                        note_ids[path] = item_id
                    if res["changed"]:
                        report["refreshed"] += 1
                    else:
                        report["deduped"] += 1   # byte-identical: D-08 no-op
                    if res["words_changed"]:
                        superseded.add(item_id)
                    # the unit bump is repeated here rather than re-indenting
                    # the whole create path under an `else`: `continue` skips
                    # the loop's own bump at the bottom, and a refreshed unit
                    # is a processed unit like any other — a progress bar that
                    # stalled on a re-import would be lying about the work.
                    done += 1
                    if should_stop is not None:
                        should_stop()
                    if progress_cb is not None:
                        progress_cb(done, total)
                    continue
                id16, full = hash_item(path, kind)
                item_id = _unique_id(full, store["items"])
                if kind == "text":
                    note_ids[path] = item_id
                if item_id in store["items"]:
                    # no-op: never reset state/history (D-08). Reached when
                    # two DIFFERENT files hold identical bytes — the original
                    # dedup case — since a re-import of the same file is a
                    # refresh above.
                    report["deduped"] += 1
                else:
                    suffix = path.suffix.lower()
                    library_path = f"items/{item_id}{suffix}"
                    # snapshot; original untouched
                    shutil.copy2(path, lib / library_path)

                    created_ms, saved_ms = stat_dates(path.stat())
                    # 26.4-01 (D-05): a roster-matched origin is born
                    # trigger-flagged so the shipped fence excludes it
                    # entirely — no id, no title, no metadata reaches the
                    # librarian (SRM-13). Only obsidian-vault imports fence
                    # by roster.
                    born_trigger = is_vault and _origin_under_roster(
                        str(origin), vault_root, active_roster)
                    item = {
                        "id": item_id,
                        "content_hash": full,
                        "source": source_label,
                        "origin_path": str(origin),
                        "library_path": library_path,
                        "type": kind,
                        "title": path.name,
                        "created_ms": created_ms,
                        "saved_ms": saved_ms,
                        "imported_ms": now_ms,
                        "last_opened_ms": None,
                        "state": "unseen",
                        "resting_until_ms": None,
                        "tags": [],
                        "trigger": born_trigger,
                        "history": [{
                            "at": datetime.now().astimezone().isoformat(
                                timespec="seconds"),
                            "from": None,
                            "to": "unseen",
                            "via": "import",
                        }],
                    }
                    # D-05: every new item is facet-stamped (year / folder /
                    # detected 'screenshots' tag); detection reads only the
                    # file's header bytes.
                    head = _read_head(path) if kind == "image" else b""
                    # 26.4-06 (D-26/D-29): the reflects facet is stamped from
                    # the TEXT frontmatter — folder alone (pure path math) can
                    # never yield it. Read the whole frontmatter block from
                    # disk (NOT the image-only head) and set reflects only when
                    # the top-level key is present.
                    if kind == "text" and _frontmatter_has_reflects(
                            _read_frontmatter_block(path)):
                        item["reflects"] = True
                    store["items"][item_id] = _inherit_judgment(stamp_facets(item, head))
                    report["imported"] += 1
        else:
            _, rel_name, data, created_ms, title = unit
            data = normalize_text_bytes(data)
            if len(data) > MAX_TEXT_BYTES:
                # never truncated: a conversation the reader could not hold
                # is skipped out loud (law 4 — verbatim or not at all)
                _count_skip(skips, "conversation-too-large")
            else:
                # ⛔ A SYNTH UNIT IS DELIBERATELY *NOT* RECONCILED, and the
                # reason is measured rather than argued. A conversation's
                # `origin_path` is `conversations.json:<index>` — its ORDINAL
                # POSITION IN THE EXPORT FILE, not anything about the
                # conversation. Exports come out most-recent-first, so one new
                # chat shifts every index by one, and keying identity on that
                # path joins an item to WHOEVER NOW SITS AT ITS NUMBER.
                #
                # ⚠ REPRODUCED before this was written: bless "Knitting
                # plans" at index 0, re-export with one new chat in front,
                # re-import — the blessed item comes back holding a
                # conversation she has never seen, STILL BLESSED, and goes
                # straight to the shelf. That is the ambush law 5 exists to
                # prevent, and the fork this whole ticket is about is the
                # cheaper harm by a wide margin.
                #
                # ⚠ IT IS ALSO WHAT RULING 1 ACTUALLY SAYS. The key is where
                # the file LIVES, falling back to what it is CALLED; a
                # materialized conversation has neither — no file on this
                # machine, and a title two strangers may share. When the room
                # cannot tell, it makes a second item: the cheaper mistake,
                # already ruled at ruling 5 for renames. So a grown
                # conversation still forks, exactly as IMPORT-GUIDE.md already
                # describes it, and nothing here is a regression from what
                # shipped.
                #
                # ⛔ DO NOT "FIX" THIS BY MATCHING ON THE TITLE — that is the
                # rename gap's wrong join wearing a different hat. The only
                # sound key is the export's own conversation id, which is a
                # different unit shape, a store migration for every existing
                # synth item, and its own ticket.
                full = hashlib.sha256(data).hexdigest()
                item_id = _unique_id(full, store["items"])
                if item_id in store["items"]:
                    # no-op: never reset state/history (D-08)
                    report["deduped"] += 1
                else:
                    # the name is server-generated, NEVER from export
                    # content — a hostile title cannot steer the write path
                    library_path = f"items/{item_id}.md"
                    atomic_write_bytes(str(lib / library_path), data)
                    # 26.4-01 (D-05): synth items carry an in-vault
                    # origin_path (src / rel_name); the same born-flag rule
                    # applies (obsidian-vault only — export sources never
                    # match, so this stays False for ai-chat-export).
                    born_trigger = is_vault and _origin_under_roster(
                        str(_origin_of(src / rel_name)), vault_root,
                        active_roster)
                    item = {
                        "id": item_id,
                        "content_hash": full,
                        "source": source_label,
                        "origin_path": str(_origin_of(src / rel_name)),
                        "library_path": library_path,
                        "type": "text",
                        "title": title,
                        "created_ms": created_ms,
                        "saved_ms": created_ms,
                        "imported_ms": now_ms,
                        "last_opened_ms": None,
                        "state": "unseen",
                        "resting_until_ms": None,
                        "tags": [],
                        "trigger": born_trigger,
                        "history": [{
                            "at": datetime.now().astimezone().isoformat(
                                timespec="seconds"),
                            "from": None,
                            "to": "unseen",
                            "via": "import",
                        }],
                    }
                    # 26.4-06 (D-26/D-29): the synth bytes already hold the
                    # item's frontmatter in memory — stamp reflects from them
                    # (no extra file read). export sources never carry a
                    # reflects: key, so this stays False for ai-chat-export.
                    if _frontmatter_has_reflects(data):
                        item["reflects"] = True
                    store["items"][item_id] = _inherit_judgment(stamp_facets(item))
                    report["imported"] += 1
        done += 1
        if should_stop is not None:
            should_stop()
        if progress_cb is not None:
            progress_cb(done, total)   # once per processed unit

    # Copy each note's attachments alongside it and record them on the
    # note's entry. Idempotent: an existing copy is kept as-is, an already
    # recorded path is never re-appended — so re-import is a no-op here too.
    by_name = {}
    for p in attached:
        by_name.setdefault(_match_name(p.name), []).append(p)
    for note_path, refs in note_refs.items():
        item = store["items"].get(note_ids.get(note_path))
        if item is None:
            continue   # the note itself was not importable
        att_list = item.setdefault("attachments", [])
        for ref in refs:
            for img in sorted(by_name.get(ref, [])):
                rel = f"attachments/{item['id']}/{img.name}"
                target = lib / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                if not target.exists():
                    shutil.copy2(img, target)   # snapshot; original untouched
                if rel not in att_list:
                    att_list.append(rel)

    if consolidation is not None:
        store["meta"]["consolidation"] = consolidation
    # 26.4-01 (D-07/D-08): remember the vault root a whole-vault import came
    # from so a LATER roster-add can flag its already-imported items
    # retroactively. Not a browser-writable meta key — the store owns it.
    if is_vault:
        # ⚠ THE TRUE ROOT, never the scratch copy (26.97-03). A later
        # roster-add stamps already-imported items by resolving their origins
        # against this; pointing it at a deleted scratch directory would make
        # every one of those resolutions fail closed.
        store["meta"]["vault_root"] = str(Path(identity_root).resolve())
    # 26.97-06: WHEN THIS IMPORT FINISHED, taken on the SERVER, here, at
    # the moment the run is done — then carried out on the single atomic
    # save below. Epoch milliseconds, the same idiom the walk already uses
    # for `now_ms` above and the adapter ledger uses for `last_run_ms`.
    # ⛔ NEVER compute this in the browser. A clock read when the line is
    #    painted is the CURRENT time, not the import time, and it would
    #    make every stale report read as if it had just happened.
    # ⛔ It says WHEN THE IMPORT RAN. It is never a measure of how long it
    #    has been since she was last here — that is law 3, not formatting.
    report["finished_ms"] = int(time.time() * 1000)
    store["meta"]["last_import_report"] = report
    save_store(lib, store)   # persist ONCE, atomically
    # ⚠ AFTER the store is committed, never before. The notebook is a
    # different file with a different lock, and an import that succeeded must
    # not be undone by anything that happens to a librarian guess. The
    # callback's contract is that it never raises (see `expire_suggestions`),
    # so this is not wrapped in a swallow that would hide a real failure.
    if superseded_cb is not None and superseded:
        superseded_cb(sorted(superseded))
    return report


# ---------------------------------------------------------------------------
# Validation (server-side trust boundaries — the browser is never trusted)
# ---------------------------------------------------------------------------

def validate_state_change(store, change):
    """Validate a state-change request against the store (SRM-01).

    `change` is {'id', 'to', 'via'}. Returns an error string, or None when
    the change is acceptable. Rules:
      - `to` must be one of the five VALID_STATES
      - the item id must exist
      - leaving 'retired' requires via == 'management-dig-out' (the user must
        dig it out deliberately from the management view); every other
        revision between the other four states is ordinary and allowed —
        every judgment is revisable forever.

    The server (Plan 22-02) calls this before EVERY write; it never trusts
    browser state strings.
    """
    to = change.get("to")
    if to not in VALID_STATES:
        return f"unknown state: {to!r} (valid: {', '.join(VALID_STATES)})"
    item = store["items"].get(change.get("id"))
    if item is None:
        return f"unknown item id: {change.get('id')!r}"
    if item["state"] == "retired" and to != "retired" \
            and change.get("via") != "management-dig-out":
        return ("item is retired — leaving 'retired' requires the deliberate "
                "management dig-out (via='management-dig-out')")
    # CR-01 fence (law 5): reactions belong to surfaced items only. A
    # reaction on never_show would quietly un-never it (resting resurfaces
    # ~90 days later); on unseen it would bypass blessing. Mirrors
    # core.js reactionAllowed — the server never trusts the browser.
    via = change.get("via") or ""
    if via.startswith("reaction:") and item["state"] not in ("blessed",
                                                             "resting"):
        return (f"reactions are for surfaced items — a {item['state']!r} "
                "item is judged from the manage view, never the reaction "
                "line (law 5)")
    return None


def validate_source_path(raw, library_root) -> Path:
    """Validate a user-supplied source folder path before any walk.

    Expands '~', resolves symlinks, and raises ValueError unless the result
    is an existing directory that is neither the filesystem root nor the
    library root (nor anything inside the library — importing the library
    into itself would loop). Returns the resolved Path on success.
    """
    p = Path(str(raw)).expanduser()
    try:
        p = p.resolve(strict=True)
    except (OSError, RuntimeError) as e:
        raise ValueError(f"path does not exist: {raw}") from e
    if not p.is_dir():
        raise ValueError(f"not a folder: {p}")
    if p == Path(p.anchor):
        raise ValueError("refusing to import the filesystem root")
    lib = Path(library_root).expanduser().resolve()
    if p == lib or lib in p.parents:
        raise ValueError("the source folder cannot be the library itself "
                         "(or anything inside it)")
    return p


def refuse_library_path(raw, repo_root):
    """Return a machine-facing refusal code when `raw` is not a safe library
    path, else None (D-08 / UPD-02 / map #147).

    After expanduser the path must be absolute. The resolved location must
    not equal `repo_root` or sit under it — parking the library inside the
    replaceable app folder is the #143 grief path. Truthy = refuse; None =
    allowed. Does not create directories.
    """
    if raw is None or not isinstance(raw, str) or not str(raw).strip():
        return "library_path_refused"
    p = Path(str(raw)).expanduser()
    if not p.is_absolute():
        return "library_path_refused"
    try:
        resolved = p.resolve()
    except (OSError, RuntimeError):
        resolved = p
    try:
        root = Path(repo_root).resolve()
    except (OSError, RuntimeError):
        root = Path(repo_root)
    if resolved == root or root in resolved.parents:
        return "library_path_refused"
    return None


# ---------------------------------------------------------------------------
# ---- the sensitive-folder roster (26.4-01, SRM-08/SRM-13, D-05/D-07/D-08) --
# The whole-vault import fences sensitive folders NOT with a second byte
# path but by stamping trigger=True at ingest for roster-matched origins, so
# the SHIPPED fence (_librarian_fenced) excludes them everywhere with zero
# new fence code. _origin_under_roster is the pure D-08 predicate; the
# add/remove operations own the D-07 safe asymmetry (add is retroactive,
# remove is future-only).
# ---------------------------------------------------------------------------

def _origin_under_roster(origin_path, vault_root, roster) -> bool:
    """True when `origin_path`'s FIRST vault-relative path segment equals a
    roster entry's first segment (D-08 top-level prefix match, import
    source = obsidian-vault). Resolves origin_path relative to vault_root.

    Fail-closed to False on any ValueError / OSError / out-of-root path or a
    missing argument — a path that cannot be placed under the vault must
    never be treated as fenced-or-not by guesswork, and (critically) an
    error here must never fail-OPEN the fence: born-flagging is additive
    (a False here just means the item is not born-flagged BY THE ROSTER; the
    other exclusion classes still apply). Pure: no I/O beyond path resolve,
    no mutation."""
    if not origin_path or not vault_root:
        return False
    try:
        rel = Path(str(origin_path)).resolve().relative_to(
            Path(str(vault_root)).resolve())
    except (ValueError, OSError, RuntimeError):
        return False
    parts = rel.parts
    if not parts:
        return False
    folded = [p.casefold() for p in parts]
    for entry in (roster or []):
        seg = roster_segments(entry)
        # ⚠ CAPITALS IGNORED (owner ruling 2026-08-19) -- see roster_segments.
        # Whole segments still, never a prefix: `Journal` may not catch
        # `Journal analysis`.
        if seg and folded[:len(seg)] == [x.casefold() for x in seg]:
            return True
    return False


def roster_segments(entry) -> list:
    """One roster entry as its list of folded path segments, or [] when it
    names nothing.

    ⚠ THE ONE SPELLING OF WHAT A ROSTER ENTRY MEANS, and it exists because
    there are THREE matchers and they must not drift: this predicate (the
    import's born-flag and the retroactive stamp), the client's wikilink
    de-linkifier, and the client's library-path linker. The rule they share:
    an entry names a FOLDER, and a file is under it when the file's path
    begins with that folder's whole segments.

    ⚠ SEGMENT-WISE AND WHOLE, NEVER A STRING PREFIX. `Journal` must not catch
    `Journal analysis` — that is a real folder in the owner's vault holding
    the room's own writing about her diary, and a substring match would fence
    it by accident. Comparing lists of whole segments is what makes
    `Clippings/journal` and `Clippings/journalism` different places.

    ⚠ AMENDED 2026-08-14 (owner's ruling): an entry may now name a folder
    INSIDE another folder. It used to be read as its first segment alone, so
    `Clippings/journal/chatgpt` would have fenced the whole of `Clippings` —
    1,921 things on her vault instead of the 344 she asked for, including 62
    she had blessed. A privacy control that quietly covers five times what it
    says is worse than one that cannot express the request at all.

    ⚠ CASE WAS DELIBERATELY LEFT ALONE HERE UNTIL 2026-08-19, when the owner
    ruled it out. The old note read: "folding here would silently WIDEN the
    fence for every existing entry, and a fence that changes what it covers as
    a side effect of an unrelated fix is the thing this whole ticket is
    about." That reasoning was right about side effects and is preserved
    below; it was wrong to conclude that exact matching was therefore safe.

    ⚠ AMENDED 2026-08-19 (OWNER RULING). CAPITALS ARE NOW IGNORED. This used
    to compare segments case-EXACTLY, and the reason was sound and is still
    respected: folding WIDENS the fence for every existing entry, and a fence
    that changes what it covers as a side effect of an unrelated fix is the
    harm these rules exist to prevent. What changed is that it stopped being a
    side effect. `/gsd-secure-phase` proved that writing `journal` when the
    folder is `Journal` left the folder SILENTLY UNFENCED, on both ways into
    the room, with every check green. She was shown that directly and chose
    folding over refusing, because folding can only ever make MORE private,
    never less.
    ⛔ SEGMENT-WISE AND WHOLE STILL GOVERNS, and folding must never soften it
    into a substring test: `Journal` may not catch `Journal analysis`, a real
    folder in her vault holding the room's own writing about her diary.
    ⚠ The two client matchers already folded to lower case, so this ALIGNS the
    three rather than adding a fourth behaviour.

    Measured on her live library at the ruling: 2,824 vault items, 580
    correctly fenced, 0 under a private folder but unfenced -- so no
    retroactive restamp was owed. Pure."""
    out = []
    for piece in str(entry or "").replace("\\", "/").split("/"):
        seg = piece.strip()
        if seg and seg not in (".", ".."):
            out.append(seg)
    return out


def _active_roster(store, roster=None) -> list:
    """The roster in force: an explicit `roster` argument wins; otherwise
    the store's meta.fenced_roster if PRESENT (even an explicit empty list —
    the user may have cleared it), else the shipped default. Distinguishing
    absent (→ default, 'behaves like fresh') from empty (→ [], a deliberate
    clear) is why this is a presence check, not `or`."""
    if roster is not None:
        return list(roster)
    meta = store.get("meta") or {}
    if "fenced_roster" in meta and isinstance(meta["fenced_roster"], list):
        return list(meta["fenced_roster"])
    return list(DEFAULT_FENCED_ROSTER)


def add_roster_folder(store, folder, vault_root=None, flagged_ids=None) -> int:
    """D-07 ADD (retroactive). Add `folder` to meta.fenced_roster (dedup,
    materializing the default if the key was absent) AND stamp trigger=True
    on every ALREADY-IMPORTED item whose origin sits under it — closing the
    retroactive gap (RESEARCH Pitfall 2: a folder added to the roster whose
    older items still surface is a fence hole exactly where the user asked
    for privacy). vault_root defaults to meta.vault_root (stamped by the
    whole-vault import); without one, the folder is added to the roster
    (future imports flagged) but nothing is retroactively flagged — never a
    silent wrong flag. Mutates `store` in place; the caller owns the lock and
    the atomic save. Returns the count newly flagged.

    ⚠ `flagged_ids`, when a list is passed, is FILLED with the ids this call
    newly fenced (D-05/V10). This is the SECOND door a photograph becomes
    fenced through, and it is the one that fences in BULK: a folder she has
    just declared private must not keep the readings the room already took
    off its pictures. The ids come back rather than the unlink happening here
    because the caller owns both the atomic save and the cache lock, and the
    forget has to run AFTER the save commits."""
    meta = store.setdefault("meta", {})
    roster = _active_roster(store)
    folder = str(folder).strip()
    if folder and folder not in roster:
        roster.append(folder)
    meta["fenced_roster"] = roster
    if vault_root is None:
        vault_root = meta.get("vault_root")
    flagged = 0
    if vault_root and folder:
        when = datetime.now().astimezone().isoformat(timespec="seconds")
        for it in store.get("items", {}).values():
            if it.get("trigger") is True:
                continue  # already fenced — never re-stamp, never double-log
            if _origin_under_roster(it.get("origin_path", ""),
                                    vault_root, [folder]):
                it["trigger"] = True
                # the flag rides a same-state history line (the /api/state
                # trigger-overlay convention): the state is untouched, the
                # judgment is recorded (D-08).
                it.setdefault("history", []).append({
                    "at": when,
                    "from": it.get("state"),
                    "to": it.get("state"),
                    "via": "roster-add-retroactive",
                })
                flagged += 1
                if flagged_ids is not None:
                    flagged_ids.append(it.get("id"))
    return flagged


def remove_roster_folder(store, folder) -> None:
    """D-07 REMOVE (future-only). Drop `folder` from meta.fenced_roster so it
    no longer born-flags FUTURE imports — but leave every already-flagged
    item flagged. Un-fencing is always a deliberate per-item release (through
    the user's own /api/state tap), never a bulk exposure: the same
    directional safety as never-list integrity (easy to protect, deliberate
    to expose). Mutates `store` in place; the caller owns the lock and save."""
    meta = store.setdefault("meta", {})
    roster = _active_roster(store)
    folder = str(folder).strip()
    meta["fenced_roster"] = [r for r in roster if r != folder]
    # existing item trigger flags are DELIBERATELY untouched (D-07).


# ---------------------------------------------------------------------------
# ---- the vault writers (26.4-05 + 26.7-04) --------------------------------
# The TWO disclosed byte paths into the user's live, iCloud-synced vault —
# each treated as safety-critical, each behind its OWN default-OFF gate flag
# with its OWN proof suite (26.7-04 assumption-delta decision: add-alongside,
# deliberately; a THIRD writer is what would force a shared abstraction):
#   append_comment            — APPEND-ONLY into an existing origin .md
#                               (26.4-05, D-09..D-12; gate:
#                               sync_comments_enabled)
#   write_reflection_to_vault — NEW-FILE-ONLY into Claude's observation/
#                               Journal analysis/ (26.7-04, D-06; gate:
#                               reflection_writeback_enabled) — the SECOND
#                               disclosed vault writer
# Both build ONLY on the shipped primitives (atomic_write_bytes +
# is_icloud_placeholder + a validate_source_path-style jail); append_comment
# NEVER open().write()s and NEVER re-serializes the file as text, so every
# byte ABOVE the appended `## Comments` section is preserved BY CONSTRUCTION
# — the original bytes are sliced and concatenated, never decoded, so no
# CRLF / trailing-whitespace / frontmatter round-trip can slip in (RESEARCH
# Pitfall 3); write_reflection_to_vault never reads or opens ANY existing
# file at all. sync_eligible_target is the pure gate the server consults
# BEFORE ever calling the comment writer: with the switch OFF (default), or
# a non-vault item, the writer is never reached and the vault is not touched
# at all (D-11 zero-mutation). The reflection writer's gate check lives in
# the server's close route (the flag must be EXACTLY True).
# ---------------------------------------------------------------------------

COMMENT_SECTION = b"## Comments"


def _comments_heading_offset(data):
    """Byte offset of the start of a line that is exactly `## Comments`
    (a bare trailing \\r for a CRLF file is allowed), or None. Pure byte scan
    — the body is never decoded, so nothing can normalize a line ending or an
    encoding on the way past."""
    n = len(COMMENT_SECTION)
    i = data.find(COMMENT_SECTION)
    while i != -1:
        at_line_start = (i == 0 or data[i - 1:i] == b"\n")
        after = data[i + n:i + n + 1]
        at_line_end = after in (b"", b"\n", b"\r")
        if at_line_start and at_line_end:
            return i
        i = data.find(COMMENT_SECTION, i + 1)
    return None


def _comments_section_end(data, head_off):
    """The byte offset at which the `## Comments` section ENDS — the start of
    the next `# `/`## ` heading after `head_off`, or len(data) when the section
    runs to EOF. A mid-file `## Comments` (a note that also carries, say, a
    `## Related` block below it) gets the entry at ITS OWN end, before the next
    heading — while every byte above still stays untouched, because the insert
    is a pure byte-slice."""
    nl = data.find(b"\n", head_off)
    if nl == -1:
        return len(data)                 # the heading is the file's last line
    n = len(data)
    j = nl + 1
    while j < n:
        end = data.find(b"\n", j)
        line = data[j:(end if end != -1 else n)]
        if line.startswith(b"## ") or line.startswith(b"# "):
            return j                     # the next sibling/parent heading
        if end == -1:
            break
        j = end + 1
    return n


def append_comment(vault_root, origin_path, comment_text, ts_iso):
    """Append ONE timestamped comment under `## Comments` in an origin .md,
    with every byte above that section byte-identical. Returns True on a
    write, or False (NO write) when the target is ineligible or an iCloud
    placeholder.

    Safety (this is the ONLY new writer into the user's vault):
      * JAIL — a real .md whose RESOLVED path is strictly under vault_root;
        anything else (a non-.md, a ``..`` traversal, an absolute escape, a
        symlink out of the vault, the root itself, a missing argument)
        returns False with no write.
      * iCLOUD — an un-downloaded placeholder returns False (never triggers a
        download).
      * APPEND-ONLY — the entry is added at the END of the `## Comments`
        section; a file with no such section gets the SECTION appended ONCE
        (never a body edit). The bytes above are sliced, never decoded.
      * ATOMIC — the write goes through atomic_write_bytes (same-dir temp +
        os.replace), iCloud-safe against an interrupted write.

    The comment is emitted as a single markdown list item; any newline inside
    comment_text is folded to a space so a multiline note can never inject a
    second `## ` heading and fragment the section."""
    if not vault_root or not origin_path:
        return False
    try:
        root = Path(str(vault_root)).resolve()
        target = Path(str(origin_path)).resolve()
    except (OSError, RuntimeError, ValueError):
        return False
    if target.suffix.lower() != ".md":
        return False                     # jail: .md only
    if root not in target.parents:
        return False                     # jail: strictly under the vault root
    if is_icloud_placeholder(target):
        return False                     # never trigger an iCloud download
    try:
        original = target.read_bytes()
    except OSError:
        return False
    one_line = " ".join(str(comment_text).splitlines()).strip()
    body = ("- " + str(ts_iso) + ": " + one_line).encode("utf-8")
    head_off = _comments_heading_offset(original)
    if head_off is None:
        # create the section ONCE at EOF; every original byte is preserved as
        # a strict prefix — only a separator + the new section are ADDED.
        if original == b"" or original.endswith(b"\n\n"):
            sep = b""
        elif original.endswith(b"\n"):
            sep = b"\n"
        else:
            sep = b"\n\n"
        new = original + sep + COMMENT_SECTION + b"\n" + body + b"\n"
    else:
        end = _comments_section_end(original, head_off)
        lead = b"" if (end == 0 or original[end - 1:end] == b"\n") else b"\n"
        new = original[:end] + lead + body + b"\n" + original[end:]
    atomic_write_bytes(str(target), new)
    return True


def sync_eligible_target(meta, item):
    """Return (vault_root, origin_path) when a comment on `item` MAY append to
    the vault, else None — the pure gate the server checks before touching the
    writer (D-10/D-11):
      * meta.sync_comments_enabled must be EXACTLY True (default/absent => OFF
        => None => zero vault mutation);
      * the item's source must be 'obsidian-vault' (D-10: every other source —
        photos, ai-chat-export, folder-drop non-vault — stays local-only, and
        the comment box is identical either way, no extra label);
      * a vault_root (stamped at whole-vault import) and the item's
        origin_path must both be present.
    The authoritative .md-under-root + iCloud jail lives in append_comment;
    this is only the cheap pre-check. Pure: no I/O."""
    if not isinstance(meta, dict) or meta.get("sync_comments_enabled") is not True:
        return None
    if not isinstance(item, dict) or item.get("source") != "obsidian-vault":
        return None
    vault_root = meta.get("vault_root")
    origin_path = item.get("origin_path")
    if not vault_root or not origin_path:
        return None
    return (str(vault_root), str(origin_path))


# 26.7-04 (D-06): the fixed write-back home — the ONE folder the second
# disclosed writer may ever create a file in. The journal-reflection
# ritual's own output folder, so a written-back reflection is idiomatic
# with the ritual's notes (and, on a later whole-vault import, satisfies
# is_reflection like any other ritual output).
REFLECTION_WRITEBACK_DIR = ("Claude's observation", "Journal analysis")


def _yaml_quote(value):
    """One double-quoted YAML scalar: backslash + quote escaped, newlines
    folded to spaces (a title/path can never fragment the frontmatter).
    Pure."""
    flat = " ".join(str(value).splitlines())
    return '"' + flat.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _reflection_frontmatter(title, text, reflects_paths, day):
    """The write-back file's frontmatter block (26.7-04, D-06) — the
    journal-reflection ritual's own convention (SKILL step 5 / the vault's
    v3 schema): title, description, type: note, domain: life, topic,
    status: processed, format: essay, source: personal, tags, date,
    date_clipped, and reflects: listing the quoted vault-relative source
    paths. Pure string composition; no I/O."""
    desc = ""
    for line in str(text or "").splitlines():
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        desc = t[:180]
        break
    topic = re.sub(r"[^a-z0-9]+", "-", str(title or "").lower()).strip("-")
    lines = ["---",
             "title: " + _yaml_quote(title),
             "description: " + _yaml_quote(desc),
             "type: note",
             "domain: life",
             "topic: " + (topic or "reflection"),
             "status: processed",
             "format: essay",
             "source: personal",
             "tags:",
             "  - journal-reflection",
             "date: " + day,
             "date_clipped: " + day]
    paths = [p for p in (reflects_paths or []) if isinstance(p, str) and p]
    if paths:
        lines.append("reflects:")
        for p in paths:
            lines.append("  - " + _yaml_quote(p))
    else:
        lines.append("reflects: []")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def write_reflection_to_vault(vault_root, title, text, reflects_paths,
                              when_ms):
    """Write ONE NEW reflection .md into the vault's Claude's observation/
    Journal analysis/ folder — the SECOND disclosed vault writer (26.7-04,
    D-06), append_comment's new-file-only twin. Returns the written file's
    vault-relative path (str), or None (NO write) when refused.

    Safety (new-file-only BY CONSTRUCTION — this writer can never edit a
    byte the user already has):
      * JAIL — the target is built ONLY from the fixed folder + the title
        + the date; the RESOLVED path must sit DIRECTLY inside
        Claude's observation/Journal analysis/ under vault_root and end in
        .md — a title carrying a separator, a ``..`` traversal, or an
        absolute path resolves elsewhere and is refused with no write.
      * EXISTING VAULT ONLY — a missing vault root or a missing target
        folder is a quiet refusal (an offline/evicted iCloud vault, or a
        vault that never ran the ritual): this writer creates files, never
        folders.
      * NEW-FILE-ONLY — an existing target name uniquifies with a counter
        suffix (`<name> 2.md`, `<name> 3.md`, …); an existing file is
        NEVER opened, read, or written.
      * iCLOUD — an un-downloaded placeholder for the final name is a
        refusal (never trigger a download, never race an evicted file).
      * ATOMIC — the one write goes through atomic_write_bytes (same-dir
        temp + os.replace), iCloud-safe against an interrupted write."""
    if not vault_root or not isinstance(title, str) or not title.strip():
        return None
    if not isinstance(text, str) or not text.strip():
        return None
    try:
        root = Path(str(vault_root)).resolve()
        when = int(when_ms)
    except (OSError, RuntimeError, ValueError, TypeError):
        return None
    if not root.is_dir():
        return None
    target_dir = root / REFLECTION_WRITEBACK_DIR[0] / REFLECTION_WRITEBACK_DIR[1]
    try:
        target_dir_resolved = target_dir.resolve()
    except (OSError, RuntimeError, ValueError):
        return None
    if not target_dir_resolved.is_dir():
        return None
    day = datetime.fromtimestamp(when / 1000).strftime("%Y-%m-%d")
    base = f"{title.strip()} {day}"

    def _candidate(name):
        try:
            resolved = (target_dir / name).resolve()
        except (OSError, RuntimeError, ValueError):
            return None
        if resolved.parent != target_dir_resolved:
            return None                  # jail: traversal/absolute refused
        if resolved.suffix.lower() != ".md":
            return None                  # jail: .md only
        return resolved

    final = _candidate(f"{base}.md")
    if final is None:
        return None
    n = 1
    while final.exists():
        n += 1
        if n > 200:
            return None                  # runaway names: refuse, never loop
        final = _candidate(f"{base} {n}.md")
        if final is None:
            return None
    if is_icloud_placeholder(final):
        return None                      # never trigger an iCloud download
    body = _reflection_frontmatter(title.strip(), text, reflects_paths, day) \
        + str(text)
    if not body.endswith("\n"):
        body += "\n"
    atomic_write_bytes(str(final), body.encode("utf-8"))
    return str(final.relative_to(root))


# ---------------------------------------------------------------------------
# ---- collect-time processing: normalize + v3-lite frontmatter (27-01) ------
# The FOURTH disclosed writer — annotates the ROOM's own `items/<id>.md`
# copies only (Seam B). NEVER touches the user's source folder. NEVER calls
# run_librarian_call (rules-only, D-18). In-process Python only — no skill
# subprocess (Pitfall 1). Body word-sequence stays byte-identical after
# whitespace collapse (D-19 / law 4); wall reformatting = line breaks only.
# ---------------------------------------------------------------------------

_RELATED_TAIL_RE = re.compile(
    r"\n##[ \t]+Related\b[^\n]*\n[\s\S]*\Z"
)


def _split_md_frontmatter(md_text):
    """Return (fm_block_or_None, body). Unclosed opening fence → no FM."""
    text = str(md_text or "")
    if not text.startswith("---"):
        return None, text
    end = text.find("\n---", 3)
    if end == -1:
        return None, text
    nl = text.find("\n", end + 1)
    if nl == -1:
        return text, ""
    return text[: nl + 1], text[nl + 1 :]


def _strip_trailing_related(body):
    """Drop a trailing `## Related` scaffolding block if present."""
    text = str(body or "")
    return _RELATED_TAIL_RE.sub("", text)


def _looks_like_wall(body):
    """True when the body is essentially one undifferentiated block."""
    text = str(body or "")
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return False
    if len(lines) <= 2 and len(text) >= 200:
        return True
    return any(len(ln) > 500 for ln in lines)


def _normalize_wall_body(body):
    """Insert paragraph breaks after sentence endings for wall shapes.

    Adds whitespace / line breaks ONLY — never rewords (D-19). Non-wall
    bodies are returned unchanged so structured notes stay byte-identical
    including their existing line breaks.
    """
    text = str(body or "")
    if not _looks_like_wall(text):
        return text
    # Period / ! / ? then spaces then a sentence-start (Latin capital or
    # common opening quote). Swap the spaces for a blank line — word
    # sequence (whitespace-collapsed) stays identical.
    out = re.sub(
        r'([.!?])[ \t]+([A-Z"“‘«])',
        r"\1\n\n\2",
        text,
    )
    if out and not out.endswith("\n"):
        out += "\n"
    return out


def _rules_extract_title(body, *, title=None, filename_stem=None):
    """Rules-first title: stored title → first `#` heading → filename stem."""
    if isinstance(title, str) and title.strip():
        t = title.strip()
        lower = t.lower()
        if lower.endswith((".md", ".markdown", ".txt")):
            t = Path(t).stem
        if t.strip():
            return t.strip()
    for line in str(body or "").splitlines():
        s = line.strip()
        if s.startswith("#"):
            h = s.lstrip("#").strip()
            if h:
                return h
    if isinstance(filename_stem, str) and filename_stem.strip():
        return filename_stem.strip()
    for line in str(body or "").splitlines():
        s = line.strip()
        if s and not s.startswith("#"):
            return s[:80]
    return "note"


def _rules_extract_description(body):
    """First non-heading non-empty line, ≤180 chars (mirrors reflection)."""
    for line in str(body or "").splitlines():
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        return t[:180]
    return ""


def _rules_topic(title):
    topic = re.sub(r"[^a-z0-9]+", "-", str(title or "").lower()).strip("-")
    return topic or "note"


def _v3lite_frontmatter(title, description, topic, day):
    """Generic v3-lite YAML block — pure string composition, no I/O.

    ONLY: title/description/type: note/topic/status/format/source/tags/
    date/date_clipped. NO recipe fields, NO taxonomy leaf, NO domain,
    NO reflects (D-17 minimal cut).
    """
    lines = [
        "---",
        "title: " + _yaml_quote(title),
        "description: " + _yaml_quote(description),
        "type: note",
        "topic: " + (topic or "note"),
        "status: processed",
        "format: prose",
        "source: personal",
        "tags: []",
        "date: " + day,
        "date_clipped: " + day,
        "---",
    ]
    return "\n".join(lines) + "\n\n"


def process_item_markdown(md_text, *, title=None, filename_stem=None, day=None):
    """Normalize + stamp a single v3-lite frontmatter block onto md text.

    Repairs stale frontmatter in place (never stacks a second block). Wall
    bodies gain line breaks only. Body word-sequence (whitespace-collapsed)
    stays byte-identical to the input body. Rules-only — does NOT call
    run_librarian_call.
    """
    if day is None:
        day = datetime.now().strftime("%Y-%m-%d")
    _old_fm, body = _split_md_frontmatter(md_text)
    body = _strip_trailing_related(body)
    body = _normalize_wall_body(body)
    derived = _rules_extract_title(
        body, title=title, filename_stem=filename_stem)
    desc = _rules_extract_description(body)
    topic = _rules_topic(derived)
    fm = _v3lite_frontmatter(derived, desc, topic, day)
    out = fm + body
    if not out.endswith("\n"):
        out += "\n"
    return out


def write_processed_frontmatter(library_root, item_id):
    """Stamp v3-lite frontmatter onto the room's `items/<id>.md` copy.

    JAIL — resolved path must sit DIRECTLY inside `items/` under the library
    root; a traversal / absolute / nested escape raises and writes nothing.
    NEVER touches the user's source folder. NEVER calls run_librarian_call.
    """
    if not library_root:
        raise ValueError("write_processed_frontmatter: library_root required")
    if not isinstance(item_id, str) or not item_id.strip():
        raise ValueError("write_processed_frontmatter: item_id required")
    iid = item_id.strip()
    if "/" in iid or "\\" in iid or iid in (".", "..") or ".." in iid:
        raise ValueError(
            "write_processed_frontmatter: item_id must be a bare server id")
    lib = Path(str(library_root)).resolve()
    items_dir = (lib / "items").resolve()
    target = (items_dir / (iid + ".md")).resolve()
    if target.parent != items_dir:
        raise ValueError(
            "write_processed_frontmatter: resolved path escapes items/ jail")
    if not target.is_file():
        raise FileNotFoundError(
            "write_processed_frontmatter: missing items/" + iid + ".md")
    if is_icloud_placeholder(target):
        raise OSError(
            "write_processed_frontmatter: refusing iCloud placeholder")
    title = None
    try:
        store = load_store(lib)
        it = (store.get("items") or {}).get(iid)
        if isinstance(it, dict) and it.get("title"):
            title = it.get("title")
    except (OSError, FileNotFoundError, ValueError, TypeError, KeyError):
        title = None
    stem = Path(str(title or iid)).stem
    text = target.read_text(encoding="utf-8")
    new = process_item_markdown(text, title=title, filename_stem=stem)
    atomic_write_bytes(str(target), new.encode("utf-8"))
    return str(target)


# ---------------------------------------------------------------------------
# ---- tier-1 cleaning: the in-place frontmatter writer (26.85-02) -----------
# The THIRD disclosed vault writer, and the FIRST that edits a block the user
# already has. append_comment adds below the body; write_reflection_to_vault
# only ever creates a new file; this one reaches into an existing note. The
# discipline, in one sentence: ONLY the (small) frontmatter block is ever
# decoded — the body is sliced as raw bytes and re-concatenated verbatim
# (append_comment's rule, study_lib:1763) — the write lands through
# atomic_write_bytes (same-dir temp + os.replace), and os.utime puts the
# pre-write mtime back so cleaning never bumps "last edited" and never
# poisons what the house resurfaces (D-02 / D-03 / D-10).
#
# The logic is ported from the house's palace_lib.write_frontmatter
# (_split_frontmatter boundary, the edit-minimum emitter, _emit_kv's
# list->YAML block) with ONE deliberate upgrade: palace_lib does
# read_text(utf-8), which round-trips the whole body through str and breaks
# on odd encodings. Here the body never becomes a str at all.
# ---------------------------------------------------------------------------

_UTF8_BOM = b"\xef\xbb\xbf"

# A TOP-LEVEL frontmatter key line (ASCII key chars only) — mirrors
# palace_lib._FM_KEY_RE. An indented list item (`  - letters`) or a wrapped
# continuation line does NOT match, which is exactly what lets the emitter
# consume a replaced key's old block whole instead of doubling it.
_CLEAN_FM_KEY_RE = re.compile(r"^([A-Za-z0-9_][A-Za-z0-9_-]*)[ \t]*:")

# The legacy Web-Clipper date keys and where each folds to — the vault's own
# documented 2026-06-21 repair (palace_lib._DATE_KEYS convention). The true
# ORIGINAL publication date lived in `published` while `created` was merely
# the clip date, so folding published->date also corrects the ~70 notes whose
# `date` was simply the wrong day. Both legacy keys are then REMOVED.
_CLEAN_DATE_FOLDS = (("published", "date"), ("created", "date_clipped"))

# Provenance keys the writer must never prune. Enforced BY OMISSION: they are
# never named in the updates dict, so the edit-minimum emitter copies their
# raw lines byte-for-byte. Listed here for the reader; the machine proof is
# tests/test_cleaning_writer.py::test_author_and_url_are_kept.
_CLEAN_KEEP_KEYS = ("author", "authors", "url")


def _clean_split_fm_bytes(data: bytes):
    """Return (bom, fm_bytes, body_bytes) for a raw note's bytes.

    `fm_bytes` is the frontmatter block INCLUDING both `---` fences and the
    closing fence's own line terminator (b"" when the note carries no block);
    `body_bytes` is every byte after it, sliced raw and NEVER decoded. `bom`
    is a leading UTF-8 BOM held aside so it survives byte-for-byte at offset 0
    (the user's editor put it there; re-encoding it away is a Law-4 violation).

    The fence boundary is deliberately the SAME arithmetic the test helper
    `_body_after_frontmatter` and palace_lib._split_frontmatter use
    (find(b"\\n---") from offset 3, then that line's own newline), so the
    writer and every reader agree on where the block ends. A file that opens
    with `---` but never closes the fence is treated as having NO frontmatter
    — the conservative read: nothing is parsed, the whole file is body.
    """
    bom = _UTF8_BOM if data.startswith(_UTF8_BOM) else b""
    rest = data[len(bom):]
    if rest.startswith(b"---"):
        end = rest.find(b"\n---", 3)
        if end != -1:
            nl = rest.find(b"\n", end + 1)
            if nl != -1:
                return bom, rest[:nl + 1], rest[nl + 1:]
            return bom, rest, b""       # closing fence is the last line, no NL
    return bom, b"", rest


def _clean_fm_lines(fm_bytes):
    """Return (open_fence, inner_lines, close_fence, eol) for a block.

    Each element keeps its own line terminator so an untouched line can be
    re-emitted byte-for-byte. The block is decoded with `surrogateescape` so
    even a non-UTF-8 byte inside the frontmatter round-trips exactly on
    re-encode — the block is the ONLY part of the file that is ever decoded.
    `eol` is taken from the opening fence, so a CRLF note keeps CRLF.
    ("", [], "", "\\n") for a malformed/absent block.
    """
    if not fm_bytes:
        return "", [], "", "\n"
    text = fm_bytes.decode("utf-8", "surrogateescape")
    segs = text.split("\n")
    lines = [seg + "\n" for seg in segs[:-1]]
    if segs[-1]:
        lines.append(segs[-1])          # a final line with no terminator
    if len(lines) < 2:
        return "", [], "", "\n"
    eol = "\r\n" if lines[0].endswith("\r\n") else "\n"
    return lines[0], lines[1:-1], lines[-1], eol


def _clean_line_key(text):
    """The top-level key a frontmatter line introduces, else None."""
    m = _CLEAN_FM_KEY_RE.match(text)
    return m.group(1) if m else None


def _clean_bare(line):
    """One frontmatter line with its terminator (and a CR) stripped."""
    return line.rstrip("\n").rstrip("\r")


def _clean_unquote(raw):
    """A YAML scalar's plain value: surrounding single/double quotes removed
    and their escapes undone, so a value emitted by _clean_scalar parses back
    to exactly what went in (which is what makes the idempotency guard
    exact). Pure."""
    s = raw.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        inner = s[1:-1]
        if s[0] == '"':
            return inner.replace('\\"', '"').replace("\\\\", "\\")
        return inner.replace("''", "'")
    return s


def _clean_flow_list(raw):
    """Parse an inline `[a, b]` sequence (the `tags: []` shape the stale
    Web-Clipper block uses) into a list of scalars. Pure."""
    body = raw.strip()[1:-1].strip()
    if not body:
        return []
    return [_clean_unquote(part) for part in body.split(",") if part.strip()]


def _clean_parse_fm(inner_lines):
    """Return {key: scalar-str | [str]} for a block's top-level keys.

    Deliberately a small hand-rolled reader (the zero-dependency law — no
    PyYAML anywhere in this repo) covering exactly the shapes real vault
    frontmatter uses: bare scalars, quoted scalars, `key: []` flow lists, and
    `key:` + indented `  - item` block lists. Anything else lands as a scalar
    string, which is harmless because an untouched key is never re-serialized.
    Pure: operates on already-decoded block lines only.
    """
    out = {}
    n = len(inner_lines)
    i = 0
    while i < n:
        text = _clean_bare(inner_lines[i])
        key = _clean_line_key(text)
        if key is None:
            i += 1
            continue
        rest = text.split(":", 1)[1].strip() if ":" in text else ""
        # gather this key's continuation lines (indented list items / wraps)
        j = i + 1
        items = []
        while j < n:
            nxt = _clean_bare(inner_lines[j])
            if _clean_line_key(nxt) is not None or nxt.strip() == "":
                break
            stripped = nxt.strip()
            if stripped.startswith("- "):
                items.append(_clean_unquote(stripped[2:]))
            elif stripped == "-":
                items.append("")
            j += 1
        if rest.startswith("[") and rest.endswith("]"):
            out[key] = _clean_flow_list(rest)
        elif rest == "" and items:
            out[key] = items
        else:
            out[key] = _clean_unquote(rest)
        i = j
    return out


def _clean_needs_quote(text):
    """True when a scalar must be double-quoted to stay valid YAML (empty,
    padded, opening with an indicator character, or carrying a `: ` / ` #`
    that would re-parse as structure). Pure."""
    if text == "" or text != text.strip():
        return True
    if text[0] in "-?:,[]{}#&*!|>'\"%@`":
        return True
    return ": " in text or text.endswith(":") or " #" in text


def _clean_scalar(value):
    """One frontmatter scalar for a CHANGED/NEW key: newlines folded to
    spaces (a value can never fragment the block into a second fence) and
    quoted only when it has to be — the vault's predominant bare style.
    Reuses _yaml_quote so the escaping rule has ONE home. Pure."""
    text = " ".join(str(value).splitlines())
    return _yaml_quote(text) if _clean_needs_quote(text) else text


def _clean_emit_kv(key, value, eol):
    """The line(s) for ONE changed/new key (palace_lib._emit_kv's shape): a
    list/tuple becomes a YAML block sequence (`key:` then `  - item`), an
    empty list stays `key: []`, everything else is a single scalar line.
    Only ever used for keys the caller explicitly changed — an untouched
    key's raw line is COPIED, never routed here, which is what keeps a
    re-run byte-identical. Pure."""
    if isinstance(value, (list, tuple)):
        if not value:
            return [key + ": []" + eol]
        lines = [key + ":" + eol]
        for item in value:
            lines.append("  - " + _clean_scalar(item) + eol)
        return lines
    return [key + ": " + _clean_scalar(value) + eol]


def _clean_same(current, proposed):
    """True when the block already carries `proposed` for that key — the
    idempotency guard's comparison. Compared in PARSED form (which is
    exactly the serialized form round-tripped, because _clean_scalar and
    _clean_unquote are inverses), so a second run with identical labels
    proposes nothing at all. Pure."""
    if isinstance(proposed, (list, tuple)):
        if not isinstance(current, (list, tuple)):
            return False
        return [str(x) for x in current] == [str(x) for x in proposed]
    if isinstance(current, (list, tuple)):
        return False
    return str(current).strip() == str(proposed).strip()


def _clean_date_fold_updates(existing):
    """The legacy-date fold, and NOTHING else: {canonical: value, legacy:
    None} for whichever of `_CLEAN_DATE_FOLDS` the block actually carries.
    `existing` is a parsed frontmatter mapping. Pure.

    ⚠ EXTRACTED SO THERE IS ONE SPELLING OF THE RULE, not two. It was inline
    in reconcile_frontmatter_updates while the labelling pass was the only
    caller. The date repair now also has to be PREVIEWED before it lands
    (product law 9, #88's ruling) and previewed by the same rule that writes,
    or the screen she approves and the bytes that reach her file are two
    different decisions — the exact mistake the readability preview avoids by
    routing through `sentenceBreaksOnly` for both. Both callers now come here.

    ⛔ IT IS DELIBERATELY NOT `reconcile_frontmatter_updates(fm, {})`. That
    would work TODAY only because the empty proposal's tag union happens to be
    dropped by the idempotency guard — a correctness that lives two steps away
    from the call and would break silently the day either half moved. The date
    repair must not depend on the label reconcile's leftovers, and after #95
    there is no label reconcile caller left to keep them honest."""
    updates = {}
    for legacy, canonical in _CLEAN_DATE_FOLDS:
        if legacy not in existing:
            continue
        value = existing[legacy]
        if isinstance(value, (list, tuple)):
            value = value[0] if value else ""
        if str(value).strip():
            updates[canonical] = str(value).strip()
        updates[legacy] = None          # removal — never left behind
    return updates


def date_repair_updates(fm_bytes):
    """The date repair's updates dict for one note's raw frontmatter bytes,
    or {} when the note carries neither legacy key. No model, no proposal, no
    clock, no I/O — her own data moved between two keys (#87 ruling 2).

    The same idempotency guard the label reconcile applies: an update whose
    value the block already carries is dropped, and a removal is kept only for
    a key that is actually present. So a note already repaired yields {}, and
    its caller writes zero bytes and logs nothing.

    Fail-soft: unusable bytes yield {}, never an exception."""
    try:
        raw = bytes(fm_bytes) if fm_bytes else b""
    except (TypeError, ValueError):
        return {}
    _open, inner, _close, _eol = _clean_fm_lines(raw)
    existing = _clean_parse_fm(inner)
    guarded = {}
    for key, value in _clean_date_fold_updates(existing).items():
        if value is None:
            if key in existing:
                guarded[key] = None
            continue
        if key in existing and _clean_same(existing[key], value):
            continue
        guarded[key] = value
    return guarded


def date_repair_preview(fm_bytes):
    """(before_text, after_text) for the date repair on one note's raw
    frontmatter block, or None when the repair would change nothing.

    Both halves are the WHOLE block, fences included, decoded for display —
    what product law 9's "every change is shown before it lands" needs for an
    edit that happens above the body and is therefore invisible in the
    readability preview's before-and-after panes.

    ⚠ IT EMITS THROUGH `_clean_emit_fm`, the same edit-minimum emitter the
    write uses, so the after-text is the bytes that would actually land rather
    than a rendering of them. Pure. Returns None on unusable or undecodable
    bytes — a block the room cannot show is a block it must not repair
    silently, and the caller drops the note from the run."""
    updates = date_repair_updates(fm_bytes)
    if not updates:
        return None
    try:
        raw = bytes(fm_bytes) if fm_bytes else b""
        after = _clean_emit_fm(raw, updates)
        return raw.decode("utf-8"), after.decode("utf-8")
    except (TypeError, ValueError, UnicodeDecodeError):
        return None


def reconcile_frontmatter_updates(fm_bytes, proposal):
    """The pure reconcile POLICY: given a note's raw frontmatter block bytes
    and a classifier proposal, return the updates dict the emitter applies.
    A value of None means REMOVE that key. No I/O, no clock — unit-testable
    in isolation, and the whole reason "reconcile, never stack" is a policy
    decision rather than an emitter accident (D-02 / D-03).

    proposal: {"id", "room", "tags": [str], "type": str|None,
               "title": str|None, "unsure": bool}

    The rules, in the order they are applied (which is also the order new
    keys land in the block):

      1. FOLD the legacy Web-Clipper dates and remove them — `published`'s
         value becomes the true `date`, `created`'s becomes `date_clipped`,
         and both legacy keys are set to None (removal). This is the vault's
         own documented repair, applied in place: the block is never
         prepended with a second one.
      2. FILL a blank title only. An absent or empty/whitespace `title` is
         set from the proposal; a title the user already wrote is NEVER
         replaced by a machine guess.
      3. UNION tags, the owner's own order first, deduped, stable.
      4. ADD `room` (seeds the house's room mapping) and `type` when the
         proposal names one.
      5. KEEP provenance (`author` / `authors` / `url`) by simply never
         mentioning it — the emitter copies unmentioned lines verbatim.
      6. IDEMPOTENCY GUARD: drop any update whose value the block already
         carries, so a re-run with identical labels returns {} and the
         caller writes zero bytes and logs zero ledger entries.

    Fail-soft: a non-dict proposal or unusable bytes yield {} (no updates =>
    no write), never an exception.
    """
    if not isinstance(proposal, dict):
        return {}
    try:
        raw = bytes(fm_bytes) if fm_bytes else b""
    except (TypeError, ValueError):
        return {}
    _open, inner, _close, _eol = _clean_fm_lines(raw)
    existing = _clean_parse_fm(inner)
    updates = {}

    # 1. fold the legacy Web-Clipper dates, then remove the legacy keys
    updates.update(_clean_date_fold_updates(existing))

    # 2. fill a BLANK title only (never overwrite the user's own)
    title = proposal.get("title")
    if isinstance(title, str) and title.strip():
        current = existing.get("title", "")
        if isinstance(current, (list, tuple)):
            current = " ".join(str(x) for x in current)
        if not str(current).strip():
            updates["title"] = title.strip()

    # 3. tag union — the user's existing order stays in front
    prior = existing.get("tags", [])
    if isinstance(prior, str):
        prior = [prior] if prior.strip() else []
    merged = []
    for tag in list(prior) + list(proposal.get("tags") or []):
        text = str(tag).strip()
        if text and text not in merged:
            merged.append(text)
    if merged:
        updates["tags"] = merged

    # 4. the filing labels themselves
    room = proposal.get("room")
    if isinstance(room, str) and room.strip():
        updates["room"] = room.strip()
    ptype = proposal.get("type")
    if isinstance(ptype, str) and ptype.strip():
        updates["type"] = ptype.strip()

    # 6. the idempotency guard (5 is enforced by omission — see docstring)
    guarded = {}
    for key, value in updates.items():
        if value is None:
            if key in existing:         # only remove what is actually there
                guarded[key] = None
            continue
        if key in existing and _clean_same(existing[key], value):
            continue
        guarded[key] = value
    return guarded


def _clean_emit_fm(fm_bytes, updates):
    """Return the NEW frontmatter block bytes (fences included) for
    `updates`, edit-minimum (palace_lib.write_frontmatter's strategy):

      * a key NOT in `updates` has its raw line copied byte-for-byte;
      * a changed key is re-serialized IN PLACE, and its old continuation
        lines are consumed so a replaced block list can never double;
      * a None-valued key is dropped entirely (the legacy-date removal);
      * a genuinely-new key is appended just ABOVE the closing fence.

    Because unchanged lines are copied rather than re-serialized, and because
    the existing fences are reused rather than re-created, the result is a
    RECONCILED block — exactly one fence pair, never a second stacked block
    (the failure a naive "prepend fresh frontmatter" writer produces). A note
    with no block at all gets one fresh pair. Pure: bytes in, bytes out.
    """
    open_fence, inner, close_fence, eol = _clean_fm_lines(fm_bytes)
    if not open_fence:                  # no (usable) block: make ONE fresh pair
        open_fence, close_fence, eol, inner = "---\n", "---\n", "\n", []

    existing_keys = set()
    for line in inner:
        key = _clean_line_key(_clean_bare(line))
        if key:
            existing_keys.add(key)

    # genuinely-new keys, in the policy's own order, appended above the fence
    tail = []
    for key, value in updates.items():
        if key not in existing_keys and value is not None:
            tail.extend(_clean_emit_kv(key, value, eol))

    out = []
    i = 0
    n = len(inner)
    while i < n:
        line = inner[i]
        key = _clean_line_key(_clean_bare(line))
        if key is not None and key in updates:
            j = i + 1               # consume this key's old continuation lines
            while j < n:
                nxt = _clean_bare(inner[j])
                if _clean_line_key(nxt) is not None or nxt.strip() == "":
                    break
                j += 1
            value = updates[key]
            if value is not None:
                out.extend(_clean_emit_kv(key, value, eol))
            # value is None -> emit nothing: the key and its block are removed
            i = j
            continue
        out.append(line)
        i += 1
    out.extend(tail)
    return (open_fence + "".join(out) + close_fence).encode("utf-8",
                                                            "surrogateescape")


def _clean_jail(origin_path):
    """Resolve and jail ONE cleaning target. Returns the resolved Path, or
    None (which every caller turns into a zero-byte refusal).

    This is append_comment's proven per-file jail (study_lib:1749-1783) minus
    the shared vault_root, because the cleaning tier is jailed PER approved
    origin_path instead: a folder-drop import stamps no meta.vault_root at
    all (study_lib:1476), so a vault_root gate would exclude every
    folder-dropped library. Containment therefore lives in the approved batch
    (see apply_cleaning_frontmatter), and this function enforces the rest:

      * .md ONLY — a non-markdown target is refused outright;
      * RESOLVED — `..` traversal and symlink escape are resolved away before
        any comparison, so a hostile string cannot alias an approved path;
      * MUST EXIST as a regular file — a refused apply never creates a file;
      * NEVER an iCloud placeholder — writing one would trigger a download
        and could race the real bytes.
    """
    if not origin_path:
        return None
    try:
        target = Path(str(origin_path)).resolve()
    except (OSError, RuntimeError, ValueError, TypeError):
        return None
    if target.suffix.lower() != ".md":
        return None                     # jail: .md only
    try:
        if not target.is_file():
            return None                 # missing / not a regular file
    except OSError:
        return None
    if is_icloud_placeholder(target):
        return None                     # never trigger an iCloud download
    return target


def apply_cleaning_frontmatter(origin_path, proposal, *, approved=None,
                               restore_mtime=True):
    """Reconcile ONE note's frontmatter block in place. Returns a change-log
    record on success, or None (with ZERO bytes written) on any refusal.

    This is the app's first in-place edit of a file that was already living
    in the user's archive, so every guarantee below is machine-proven by
    tests/test_cleaning_writer.py:

      * BODY BYTE-IDENTITY (D-02, product law 4) — the body is sliced as raw
        bytes and re-concatenated verbatim. It is never decoded, never
        re-encoded, never normalized: CRLF stays CRLF, a missing final
        newline stays missing, a UTF-8 BOM stays at offset 0, and a multi-KB
        wall of text is never re-wrapped. "Adds filing labels, never touches
        your words" is literally true.
      * THE JAIL (D-03/D-05) — `approved` is the user-approved batch as
        {item_id: origin_path}. When it is not None the call is REFUSED
        unless proposal["id"] is a key AND the resolved origin_path IS that
        id's resolved approved path. One parameter mechanizes id-membership
        (a hallucinated or unticked id can never reach a file) and the
        path/traversal jail together — and it works for folder-drop imports
        that have no meta.vault_root. `approved={}` refuses everything
        (fail-closed).
      * RECONCILE, NEVER STACK — see reconcile_frontmatter_updates and
        _clean_emit_fm: exactly one fence pair, legacy dates folded AND
        removed, provenance kept, a real title never overwritten.
      * IDEMPOTENT — no updates (or byte-identical output) means no write at
        all and changed=False, which is the signal telling the caller to
        append ZERO change-log entries.
      * mtime RESTORED (D-10) — the pre-write st_mtime is put back with
        os.utime, because the house's resurfacing reads mtime and a bumped
        stamp would make every cleaned note look freshly written. Pass
        restore_mtime=False to let the write's own stamp stand.
        st_birthtime is deliberately NOT restored (non-portable); the durable
        date_clipped the reconcile stamps is what protects "date added".
      * ATOMIC — the one write goes through atomic_write_bytes (same-dir temp
        + fsync + os.replace), so a crash mid-write leaves the original note
        completely intact.

    Record: {"id": str|None, "origin_path": str, "old_fm": bytes,
             "new_fm": bytes, "old_mtime": float, "changed": bool}
    `old_fm`/`new_fm` include their fences and are b"" when there was no
    block — they plus `old_mtime` are exactly what restore_frontmatter_block
    needs for one-tap undo.
    """
    if not isinstance(proposal, dict):
        return None
    target = _clean_jail(origin_path)
    if target is None:
        return None

    item_id = proposal.get("id")
    if approved is not None:
        # the approved batch IS the jail: id-membership AND path-membership
        if not isinstance(approved, dict) or item_id is None:
            return None
        try:
            if item_id not in approved:
                return None
            allowed = approved[item_id]
        except TypeError:               # an unhashable id is simply not a key
            return None
        if not allowed:
            return None
        try:
            if Path(str(allowed)).resolve() != target:
                return None            # an approved id may only write its own path
        except (OSError, RuntimeError, ValueError, TypeError):
            return None

    try:
        original = target.read_bytes()
        st = target.stat()             # captured BEFORE the write (D-10)
    except OSError:
        return None

    bom, fm_bytes, body = _clean_split_fm_bytes(original)
    record = {"id": item_id if isinstance(item_id, str) else None,
              "origin_path": str(target),
              "old_fm": fm_bytes,
              "new_fm": fm_bytes,
              "old_mtime": st.st_mtime,
              "changed": False}

    updates = reconcile_frontmatter_updates(fm_bytes, proposal)
    if not updates:
        return record                  # idempotent no-op: zero bytes written
    new_fm = _clean_emit_fm(fm_bytes, updates)
    new_data = bom + new_fm + body     # body rides through verbatim
    if new_data == original:
        return record                  # belt-and-braces byte no-op

    atomic_write_bytes(str(target), new_data)
    if restore_mtime:
        try:                           # ns form so the restore is exact
            os.utime(target, ns=(st.st_atime_ns, st.st_mtime_ns))
        except (OSError, AttributeError, TypeError, ValueError):
            try:
                os.utime(target, (st.st_atime, st.st_mtime))
            except OSError:
                pass
    record["new_fm"] = new_fm
    record["changed"] = True
    return record


def _readability_same_words(a: bytes, b: bytes) -> bool:
    """THE INVARIANT, spelled once (#89 as corrected by #90).

    True when `a` and `b` differ in whitespace ALONE — every other character
    survives, in its original order. `bytes.split()` with no argument splits on
    runs of ASCII whitespace and drops them; joining the pieces with a single
    space therefore normalizes spacing and preserves everything else, so two
    bodies that differ only in where their line breaks fall compare equal and
    two that differ by so much as one deleted arrow do not.

    ⚠ WHY IT IS WHITESPACE-ONLY AND NOT INSERT-ONLY. #89 recorded the promise
    as "insert-only, newlines only" and #90 corrected it: the break SWAPS the
    space after a full stop for a newline rather than adding one beside it, so
    a strict insertion test fails on a change that lost nothing at all.

    ⚠ WHY IT IS DONE ON BYTES. The caller is about to write bytes. Decoding
    first would mean this function could raise on the exact input most worth
    refusing — a note whose encoding is not what anybody assumed — and a
    refusal that arrives as an exception is not the same thing as a refusal.

    ⚠⚠ AMENDED 2026-08-15, AND THE REASON IS A WHOLE LANGUAGE. `a.split() ==
    b.split()` says "the same chunks in the same order", which reads as "the
    same words" ONLY in a language that puts spaces between its words. Chinese
    does not. A break inserted after 。 lands inside a chunk and splits it, so
    the test called it a change of words on a note where not one character had
    moved — measured on the owner's real vault: 41,645 non-space characters
    before and after, identical, refused. **52 of her notes could not be
    tidied at all, and they are the ones with the worst walls in them.**
    A safety test that cannot be satisfied by a correct change is not
    protecting her, it is excluding her writing.

    THE RULE, STATED PROPERLY: whitespace may be ADDED or RE-SPELLED, never
    REMOVED, and no other character may change in any way. Two conditions,
    both necessary:

      1. every non-whitespace character survives, in order — the chunks
         CONCATENATE to the same bytes;
      2. every gap that existed still exists — `b`'s chunks REFINE `a`'s, so
         each of `a`'s chunks is made of one or more whole chunks of `b`.

    ⚠ CONDITION 2 IS WHAT KEEPS THIS STRICT, and dropping it is the obvious
    wrong simplification: without it, `New York` -> `NewYork` passes (the
    letters all survive in order) and the room would be allowed to close a gap
    between two English words. Condition 1 alone is NOT this invariant.
    Together they permit exactly the change the tidy-up makes — a gap appears,
    or a space becomes a newline — in any language.

    Still refuses, unchanged: a deleted arrow, a reordering, a word merged
    into its neighbour, and every non-whitespace edit of any size."""
    try:
        chunks_a, chunks_b = a.split(), b.split()
    except (AttributeError, TypeError):
        return False
    if b"".join(chunks_a) != b"".join(chunks_b):
        return False        # condition 1: something other than space moved
    i = 0
    for chunk in chunks_a:
        taken = b""
        while len(taken) < len(chunk):
            if i >= len(chunks_b):
                return False
            taken += chunks_b[i]
            i += 1
        if taken != chunk:
            return False    # condition 2: a gap that existed is gone
    return i == len(chunks_b)


def apply_readability_body(origin_path, new_body, *, approved=None,
                           restore_mtime=True, repair_dates=False):
    """Write ONE note's body back with its sentence breaks laid out, and —
    when `repair_dates` is on — fold its legacy Web-Clipper dates in the SAME
    write. Returns a change-log record on success, or None (with ZERO bytes
    written) on any refusal.

    ⚠ THIS IS THE FIRST TIME THE ROOM EDITS INSIDE SOMEBODY'S OWN WRITING.
    Everything the app wrote before this went above the `---` fence, in labels
    the person did not type. The owner ruled it in at #88 and narrowed it at
    #90 to sentence breaks alone. Product law 9 governs it.

    It is deliberately the same shape as apply_cleaning_frontmatter — same
    jail, same approved-batch membership test, same atomic write, same mtime
    restore, same idempotent no-op — so a reader who has understood one has
    understood both. The one thing it adds is the reason it is allowed to
    exist:

      * THE RUN-TIME SELF-CHECK (#89, fail-closed). The body about to be
        written must differ from the body on disk in WHITESPACE ONLY, checked
        against the actual bytes at the actual moment of writing. If it does
        not, the write is refused and nothing happens.

        ⚠ THIS REPLACES A STRONGER-SOUNDING GUARANTEE WITH AN ACTUALLY
        STRONGER ONE. apply_cleaning_frontmatter's body byte-identity is
        proven by tests — it is a promise about code that was checked once, on
        the machine of whoever ran the suite. This is checked on the person's
        own bytes, on their own machine, every single time. A bug introduced
        into the layout rule tomorrow cannot get past it, and neither can a
        client that sends a body the layout rule never produced: the caller is
        NOT TRUSTED to have run the right transform, because the check is
        derived from what is on disk rather than from what was asked for.

        That is what makes LIBRARIAN.md's "every word you saved is there, in
        the order you saved it" literally true of the body for the first time.

    `new_body` is the proposed body TEXT (str) or bytes — what
    StudyCore.sentenceBreaksOnly returned for this note.

    ⚠ THE FRONTMATTER BLOCK IS UNTOUCHED UNLESS `repair_dates` SAYS OTHERWISE,
    and with it off this function is byte-for-byte what it always was: the
    block is sliced off, held, and put back verbatim. With it ON, the ONLY
    edit it may make up there is `date_repair_updates` — her own values moved
    between two keys and the two legacy keys removed. It can neither invent a
    key nor take a guessed one, because no proposal reaches it.

    Record: {"id": str|None, "origin_path": str, "old_body": bytes,
             "old_fm": bytes, "old_mtime": float,
             "body_changed": bool, "fm_changed": bool, "changed": bool}
    `old_body` plus `old_mtime` are exactly what restore_body_bytes needs for
    the one tap back — which #86 ruling 2 made load-bearing rather than
    optional, because approving a whole run off three examples is only
    reasonable if being wrong is cheap.

    ⚠⚠ `body_changed` / `fm_changed` ARE NOT COSMETIC, and a reader must not
    "simplify" them away. The change log used to tell a body write from a
    label write BY THE PRESENCE OF `old_body`, because the two writers were
    disjoint and a note could only ever be one or the other. This function
    breaks that: one note, one write, BOTH halves. `old_body` and `old_fm` are
    now always captured, so presence no longer decides anything — these two
    flags are what say which halves actually moved, and therefore which
    restores the undo may run. ⛔ Getting that wrong is not a cosmetic bug: an
    `old_fm` of b"" means "this note had no block, remove the one it has now",
    so an undo that reached the frontmatter restore for a body-only write
    would DELETE the note's whole block.
    """
    target = _clean_jail(origin_path)
    if target is None:
        return None

    item_id = None
    if isinstance(new_body, dict):      # never the shape; fail closed loudly
        return None
    if approved is not None:
        # the approved batch IS the jail, exactly as for the frontmatter
        # writer. The scope screen (#86) hands down a batch of {id: path}, and
        # a note that is not in it can no more be written than a traversal
        # string could.
        if not isinstance(approved, dict):
            return None
        matched = None
        for key, allowed in approved.items():
            if not allowed:
                continue
            try:
                if Path(str(allowed)).resolve() == target:
                    matched = key
                    break
            except (OSError, RuntimeError, ValueError, TypeError):
                continue
        if matched is None:
            return None                # an unapproved path writes nothing
        item_id = matched if isinstance(matched, str) else None

    try:
        original = target.read_bytes()
        st = target.stat()             # captured BEFORE the write (D-10)
    except OSError:
        return None

    bom, fm_bytes, body = _clean_split_fm_bytes(original)
    record = {"id": item_id,
              "origin_path": str(target),
              "old_body": body,
              "old_fm": fm_bytes,
              "old_mtime": st.st_mtime,
              "body_changed": False,
              "fm_changed": False,
              "changed": False}

    if isinstance(new_body, bytes):
        proposed = new_body
    else:
        try:
            proposed = str(new_body).encode("utf-8")
        except (UnicodeEncodeError, TypeError, ValueError):
            return None

    if proposed != body:
        # ⚠ THE GATE. Everything around it is bookkeeping; this is the line
        # that makes the feature safe to ship.
        if not _readability_same_words(body, proposed):
            return None                # refused: zero bytes written
        record["body_changed"] = True

    # ⚠ THE DATE REPAIR RIDES THIS WRITE — #88's ruling, wired 2026-08-17 on
    # the owner's instruction. It moves `published` -> `date` and `created` ->
    # `date_clipped` in her OWN data: no model, no guess, no send.
    #
    # ⛔ IT IS THE SAME ATOMIC WRITE, NOT A SECOND ONE, and that is the whole
    # design. Two writes would mean two change-log entries for one note in one
    # run, and the log keeps ONE undo target per file — so the second would
    # overwrite the first and one of the two changes would become
    # untakeable-back. Product law 9 says every change is exactly reversible,
    # and "exactly" is doing work: a run that half-undoes is worse than one
    # that does not offer undo at all, because it is offered and believed.
    #
    # ⚠ AND IT IS OFF BY DEFAULT. The frontmatter writer's own callers (and
    # the four suites that prove body byte-identity) must keep getting a
    # body-only write, so this cannot be a silent widening of every caller.
    new_fm = fm_bytes
    if repair_dates:
        fm_updates = date_repair_updates(fm_bytes)
        if fm_updates:
            emitted = _clean_emit_fm(fm_bytes, fm_updates)
            if emitted != fm_bytes:
                new_fm = emitted
                record["fm_changed"] = True

    new_data = bom + new_fm + proposed
    if new_data == original:
        # a byte no-op is not a change, whatever the halves above decided
        record["body_changed"] = False
        record["fm_changed"] = False
        return record                  # belt-and-braces byte no-op

    atomic_write_bytes(str(target), new_data)
    if restore_mtime:
        try:                           # ns form so the restore is exact
            os.utime(target, ns=(st.st_atime_ns, st.st_mtime_ns))
        except (OSError, AttributeError, TypeError, ValueError):
            try:
                os.utime(target, (st.st_atime, st.st_mtime))
            except OSError:
                pass
    record["changed"] = True
    return record


def restore_body_bytes(origin_path, old_body, old_mtime):
    """The one tap back for a body write (#86 ruling 2, #89 ruling 2): put the
    captured prior body back, byte for byte, and restore the prior mtime.
    Returns True when it wrote, False when it did not.

    The exact counterpart of restore_frontmatter_block, and it obeys the same
    jail — so an undo can no more escape to an unapproved path, a non-.md file
    or an iCloud placeholder than the apply could. The frontmatter block
    currently on the file is kept as it is: undoing a readability pass must not
    also undo a label the person edited since, and the two writers were kept
    disjoint precisely so that this is expressible.

    False means NO write: the jail refused, the file is unreadable, or the file
    already matches — which makes undo-of-undo idempotent instead of stamping a
    stale body over newer state.
    """
    target = _clean_jail(origin_path)
    if target is None:
        return False
    try:
        block = bytes(old_body) if old_body else b""
    except (TypeError, ValueError):
        return False
    try:
        current = target.read_bytes()
        st = target.stat()
    except OSError:
        return False

    bom, fm_bytes, body = _clean_split_fm_bytes(current)
    # ⚠ THE SAME GATE, FACING THE OTHER WAY. An undo is still a write into
    # somebody's writing, so it earns the same refusal: if what is on disk now
    # differs from the captured body by more than whitespace, the person (or
    # another tool) has edited this note since, and restoring would silently
    # discard that. Rather than guess, do nothing.
    if not _readability_same_words(body, block):
        return False
    new_data = bom + fm_bytes + block
    if new_data == current:
        return False                   # undo-of-undo: already restored
    atomic_write_bytes(str(target), new_data)
    if old_mtime is not None:
        try:
            os.utime(target, (st.st_atime, float(old_mtime)))
        except (OSError, TypeError, ValueError):
            pass
    return True


def restore_frontmatter_block(origin_path, old_fm, old_mtime):
    """One-tap undo (D-10): put a captured prior frontmatter block back,
    byte for byte, and restore the note's prior mtime. Returns True when it
    wrote, False when it did not.

    Takes the SAME byte-sliced atomic path as apply_cleaning_frontmatter and
    obeys the SAME jail — so an undo can no more escape to an unapproved
    path, a non-.md file, or an iCloud placeholder than the apply could.
    `old_fm == b""` removes the block ENTIRELY (the note had none before, so
    undo must not leave an empty pair of fences behind), and the body bytes
    below the block are never touched either way.

    False means NO write: the jail refused, the file is unreadable, or the
    file already matches — which makes undo-of-undo idempotent instead of
    re-applying a stale block over newer state.
    """
    target = _clean_jail(origin_path)
    if target is None:
        return False
    try:
        block = bytes(old_fm) if old_fm else b""
    except (TypeError, ValueError):
        return False
    try:
        current = target.read_bytes()
        st = target.stat()
    except OSError:
        return False

    bom, _fm, body = _clean_split_fm_bytes(current)
    new_data = bom + block + body
    if new_data == current:
        return False                   # undo-of-undo: already restored
    atomic_write_bytes(str(target), new_data)
    if old_mtime is not None:
        try:
            os.utime(target, (st.st_atime, float(old_mtime)))
        except (OSError, TypeError, ValueError):
            pass
    return True


# ---------------------------------------------------------------------------
# ---- the reflection session file (26.7-02, D-03/D-04/D-11) -----------------
# librarian/session.json is the candle session's ONE visible home: the
# working draft, its name and coda, the serialized pool it grew from,
# (⛔ 26.995-06, D-05: and NO question — a question the librarian wants to
# ask lives inside the draft now; a file written before that change keeps
# its stale key, which is simply never read),
# the consent fact, and (later plans) the chat turns — plain JSON under the
# VISIBLE librarian folder, so deleting librarian/ remains the factory
# reset. The suggestions.json discipline applies whole: fail-open reads (a
# missing or hand-edited-off-shape file is simply no session), atomic
# writes through atomic_write_bytes, and serialization under the server's
# own small session lock (never WRITE_LOCK, never LIBRARIAN_LOCK) — these
# helpers do the IO only; the caller owns the lock.
# ---------------------------------------------------------------------------


def session_file_path(library_root):
    """librarian/session.json under the library root. Pure path math."""
    return Path(library_root) / "librarian" / "session.json"


def load_session_file(library_root):
    """The session document as a dict, or None — FAIL-OPEN: a missing,
    unreadable, or off-shape file reads as no session at all (the
    _load_insights posture). Never raises."""
    try:
        data = json.loads(
            session_file_path(library_root).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def save_session_file(library_root, doc):
    """Atomically rewrite librarian/session.json. The caller holds the
    server's session lock; this helper does the write only — a crash
    mid-write leaves the prior file intact (never a torn session)."""
    d = Path(library_root) / "librarian"
    d.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(
        str(session_file_path(library_root)),
        json.dumps(doc, ensure_ascii=False, indent=1).encode("utf-8"))


# ---------------------------------------------------------------------------
# ---- the blessings ledger (26.8-02, D-11) ---------------------------------
# librarian/blessings.json is the walk's memory: one entry per blessing —
# {item_id, ms, why, author} — a record of welcomed things only (D-15),
# the file the blessings notebook reads. It joins the session/insights
# file family whole: plain JSON under the VISIBLE librarian folder
# (deleting librarian/ stays the factory reset), fail-open reads, atomic
# writes, and serialization under the server's own small blessings lock
# (never WRITE_LOCK, never LIBRARIAN_LOCK) — these helpers do the IO
# only; the caller owns the lock. `ms` is an epoch-ms int, the item
# stamps' own format — never a third timestamp parse site.
# ---------------------------------------------------------------------------


def blessings_file_path(library_root):
    """librarian/blessings.json under the library root. Pure path math."""
    return Path(library_root) / "librarian" / "blessings.json"


def load_blessings(library_root):
    """{'blessings': [...]} — FAIL-OPEN: a missing, unreadable, or
    off-shape file reads as the empty wrapper (the _load_insights
    posture). Never raises."""
    try:
        data = json.loads(
            blessings_file_path(library_root).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"blessings": []}
    entries = data.get("blessings") if isinstance(data, dict) else None
    return {"blessings": entries if isinstance(entries, list) else []}


def save_blessings(library_root, entries):
    """Atomically rewrite librarian/blessings.json. The caller holds the
    server's blessings lock; this helper does the write only — a crash
    mid-write leaves the prior ledger intact (never a torn entry)."""
    d = Path(library_root) / "librarian"
    d.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(
        str(blessings_file_path(library_root)),
        json.dumps({"blessings": list(entries)}, ensure_ascii=False,
                   indent=1).encode("utf-8"))


# ---------------------------------------------------------------------------
# ---- the two subject stores (26.9985, R-6 / R-9 / R-12) -------------------
# librarian/subjects.json — what the finding pass FOUND, plus her rulings on
# it: one entry per subject {key, name, origin ('noticed'|'named'), item_ids,
# status ('proposed'|'aside'|'declined'), ms}. R-9's whole point lives here:
# the reading happened ONCE, what it found is KEPT, so a thing she said no
# to can be raised again without a page being read or a penny spent again.
#
# librarian/kept_back.json — every line a subject removal took out of
# librarian/learned.md, verbatim, one entry per removal {subject, lines, ms,
# undone}. R-6's ruling: "keep what it took, so I can change my mind" — and
# § E's `nothing is lost` is a load-bearing promise that RENDERS ONLY when
# this store provably holds every removed line (the copy record's own gate).
#
# ⛔⛔ BOTH ARE OFF-LIMITS TO THE LIBRARIAN, AND THAT PROPERTY IS FORCED BY
# HER OWN EXISTING FENCE RATHER THAN CHOSEN (R-6): each file is, by
# construction, the most concentrated collection of exactly the material she
# asked to be hidden. `_names_off_limits_path` holds both names — CALLED,
# never re-spelled — and, because R-12 put them INSIDE the library root
# (with the librarian's other things, so deleting librarian/ remains the
# factory reset, taking her undo store with it — a cost she was shown and
# took), the predicate matches them by TAIL in relative spellings too.
#
# ⚠ R-12's stated cost, recorded where the files are made: the lines she
# hid do not outlive the folder she wiped.
#
# File family: the session/blessings discipline whole — plain JSON under the
# VISIBLE librarian folder, fail-open reads, atomic writes; the caller owns
# whatever lock serializes it.
# ---------------------------------------------------------------------------

SUBJECTS_STORE_TAIL = "librarian/subjects.json"
KEPT_BACK_STORE_TAIL = "librarian/kept_back.json"
# 26.996-10: the desk card's ask record and permanent quiet answer.
# Same neighbourhood as subjects / not-relevant — never the file that is
# sent. Matched by tail so a relative spelling cannot ride a payload.
ASIDE_ASKED_STORE_TAIL = "librarian/aside-asked.json"
ASIDE_QUIET_STORE_TAIL = "librarian/aside-quiet.json"


def subjects_file_path(library_root):
    """librarian/subjects.json under the library root. Pure path math."""
    return Path(library_root) / "librarian" / "subjects.json"


def load_subjects(library_root):
    """{'subjects': [...]} — FAIL-OPEN: a missing, unreadable, or off-shape
    file reads as the empty wrapper. Never raises."""
    try:
        data = json.loads(
            subjects_file_path(library_root).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"subjects": []}
    entries = data.get("subjects") if isinstance(data, dict) else None
    return {"subjects": entries if isinstance(entries, list) else []}


def save_subjects(library_root, entries):
    """Atomically rewrite librarian/subjects.json. IO only; the caller owns
    the lock and every judgement about what the entries say."""
    d = Path(library_root) / "librarian"
    d.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(
        str(subjects_file_path(library_root)),
        json.dumps({"subjects": list(entries)}, ensure_ascii=False,
                   indent=1).encode("utf-8"))


# ---------------------------------------------------------------------------
# ---- the learned file's second writer (26.9985, R-3 / R-4 / R-5 / R-6) ----
# librarian/learned.md was built (26.998) to be written ONCE and thereafter
# only ever by her; `setup_pass_trial.keep()` refuses a second setup pass on
# exactly that ground. R-3 ("Backward too — take it out of what's kept") and
# R-4 ("Take it out anyway, and show me") give the room ONE legitimate second
# writer: a SUBJECT REMOVAL. The refusal is not deleted — it learns the
# difference structurally: `keep()` still refuses every second setup pass,
# and the only other door, `apply_subject_removal` below, can only DELETE
# lines that already stand in the file. It cannot write a fresh portrait, so
# it cannot be a second setup pass wearing a different name.
#
# ⛔⛔ R-5 BOUNDS THIS PERMISSION TO ONE NAMED FILE. It reaches
# `librarian/learned.md` and NOTHING else in the house — not her vault, not
# her notes, not her journal, not any other librarian file, not by analogy,
# not by convenience. Product law 9 is UNAMENDED and stays unamended; the
# ledger records why this is not, literally, a law-9 override (the file is
# not in her vault and the room wrote it) and why in spirit it plainly is.
#
# ⛔ R-6 / § E ORDER OF OPERATIONS, AND IT IS LOAD-BEARING: the kept-back
# copy is WRITTEN AND RE-READ BEFORE learned.md is touched. A crash between
# the two leaves a copy beside an unedited file — never an edited file with
# no way back. `nothing is lost` (§ E) is HER sentence and it is a GATE: the
# return's `nothing_is_lost` flag is computed by re-reading both files after
# the edit, and a surface may render her § E words ONLY on that flag.
# ---------------------------------------------------------------------------

LEARNED_NAME = "learned.md"

# ⛔ AN AGENT'S WORDING, AND IT SAYS SO — modelled on identity.md's header,
# replaced the moment she writes her own. ⚠ THE 26.998 WORDING IS RETIRED:
# it said "the room only ever reads this file; it does not write it again on
# its own", which R-3/R-4 made false. The retired text is kept below so the
# first subject removal can recognise the old header verbatim and swap it —
# an agent's comment replaced by an agent's comment, the one substitution
# the rulings ledger names as replaceable.
LEARNED_HEADER_RETIRED = (
    "# what the room learned from your own writing\n"
    "\n"
    "<!-- read once, from your diary and the notes you marked as your own.\n"
    "     yours to edit or delete. the room only ever reads this file; it\n"
    "     does not write it again on its own. -->\n"
    "\n")

LEARNED_HEADER = (
    "# what the room learned from your own writing\n"
    "\n"
    "<!-- read once, from your diary and the notes you marked as your own.\n"
    "     yours to edit or delete. the room never adds to this file on its\n"
    "     own. the one edit it may make: when you set a subject aside, it\n"
    "     takes the lines about that subject out — it shows you what it\n"
    "     took, keeps what it took, and can put any of it back. -->\n"
    "\n")


def learned_file_path(library_root):
    """The ONE spelling of where the learned file lives (R-12: under
    librarian/, her ruling). `tools/setup_pass_trial.py` and `server.py`
    both resolve through here — a second spelling is how the R-5 bound
    quietly stops being checked."""
    return Path(library_root) / "librarian" / LEARNED_NAME


class SubjectRemovalRefused(Exception):
    """A removal that cannot be done EXACTLY as asked is not done at all.
    Never a warning: a partial removal shown to her as whole would make
    her § E sentence lie at the moment she is told to trust it."""


def apply_subject_removal(library_root, subject, lines, now_ms):
    """Take the lines about a set-aside subject out of what the room keeps
    about her (R-3), including lines she may have edited (R-4 — and show
    her: the return carries every removed line for the § E surface), with
    every removed line kept first (R-6).

    `lines` are EXACT whole lines, byte-for-byte as they stand in the
    file. Every requested line must be present or the whole removal is
    refused — a removal that silently skipped a line would show her less
    than it claims. Every occurrence of a requested line is removed and
    every removed occurrence is recorded.

    Returns {ok, nothing_is_lost, removed_lines, ms, header_swapped,
    path}. `nothing_is_lost` is § E's gate, computed by RE-READING the
    kept-back store and the learned file after the write — never assumed
    from the code having run."""
    path = learned_file_path(library_root)
    try:
        before_text = path.read_text(encoding="utf-8")
    except OSError:
        raise SubjectRemovalRefused(
            "there is nothing to remove from — the room has not learned "
            "anything yet, or the file is unreadable")
    requested = []
    for ln in (lines or []):
        if not isinstance(ln, str) or not ln.strip():
            raise SubjectRemovalRefused(
                "a removal line must be a real line of text")
        if ln not in requested:
            requested.append(ln)
    if not requested:
        raise SubjectRemovalRefused("nothing was asked to be removed")

    file_lines = before_text.split("\n")
    present = set(file_lines)
    missing = [ln for ln in requested if ln not in present]
    if missing:
        raise SubjectRemovalRefused(
            "%d of the %d lines are not in the file exactly as asked — "
            "removing the rest would show her a removal that did less "
            "than it claims" % (len(missing), len(requested)))

    removed, surviving = [], []
    wanted = set(requested)
    for ln in file_lines:
        if ln in wanted:
            removed.append(ln)
        else:
            surviving.append(ln)
    after_text = "\n".join(surviving)
    header_swapped = False
    if LEARNED_HEADER_RETIRED in after_text:
        after_text = after_text.replace(
            LEARNED_HEADER_RETIRED, LEARNED_HEADER, 1)
        header_swapped = True

    before_sha = hashlib.sha256(before_text.encode("utf-8")).hexdigest()
    after_sha = hashlib.sha256(after_text.encode("utf-8")).hexdigest()
    ms = int(now_ms)

    # ⛔ THE COPY LANDS FIRST (R-6). A crash after this write and before the
    # next leaves the kept-back entry beside an UNEDITED file.
    entries = load_kept_back(library_root)["removals"]
    entries.append({
        "subject": str(subject),
        "ms": ms,
        "removed_lines": list(removed),
        "before_sha256": before_sha,
        "before_text": before_text,
        "after_sha256": after_sha,
        "header_swapped": header_swapped,
        "undone": False,
    })
    save_kept_back(library_root, entries)
    atomic_write_bytes(str(path), after_text.encode("utf-8"))

    # ---- § E's PROOF — re-read both files; never trust the write --------
    after_entries = load_kept_back(library_root)["removals"]
    kept = None
    for rec in after_entries:
        if isinstance(rec, dict) and rec.get("ms") == ms \
                and rec.get("subject") == str(subject):
            kept = rec
    on_disk = path.read_text(encoding="utf-8")
    nothing_is_lost = (
        kept is not None
        and kept.get("removed_lines") == removed
        and kept.get("before_text") == before_text
        and hashlib.sha256(
            on_disk.encode("utf-8")).hexdigest() == after_sha
        and all(ln not in on_disk.split("\n") for ln in requested))
    # ⛔ THE PROOF IS PERSISTED ONTO THE KEPT ENTRY (26.9985 R-17): the § E
    # surface serves a removal LATER, and the render gate must ride the
    # proof that was actually computed — never re-assumed at serve time. A
    # crash between the learned write and this save leaves an entry with no
    # `proof`, and an entry with no proof NEVER renders § E: the failure
    # direction is her sentence staying unsaid, not her sentence lying.
    if kept is not None:
        kept["proof"] = bool(nothing_is_lost)
        save_kept_back(library_root, after_entries)
    return {"ok": True, "nothing_is_lost": nothing_is_lost,
            "removed_lines": list(removed), "ms": ms,
            "header_swapped": header_swapped, "path": str(path)}


def undo_subject_removal(library_root, ms):
    """Put back what a removal took (R-6: "keep what it took, so I can
    change my mind") — BYTE-EXACT, by restoring the kept before-image, and
    ONLY while the file still stands exactly as the removal left it. If
    she has edited since, restoring the image would erase her own hand —
    the one thing this whole family exists to protect — so the undo is
    refused and the kept lines stay available for her to place herself."""
    entries = load_kept_back(library_root)["removals"]
    target = None
    for rec in entries:
        if isinstance(rec, dict) and rec.get("ms") == ms:
            target = rec
    if target is None:
        raise SubjectRemovalRefused("no removal by that stamp is kept")
    if target.get("undone"):
        raise SubjectRemovalRefused("that removal is already undone")
    path = learned_file_path(library_root)
    try:
        current = path.read_text(encoding="utf-8")
    except OSError:
        raise SubjectRemovalRefused("the learned file is unreadable")
    current_sha = hashlib.sha256(current.encode("utf-8")).hexdigest()
    if current_sha != target.get("after_sha256"):
        raise SubjectRemovalRefused(
            "the file has changed since this removal — putting the old "
            "text back would erase her own later edits, so the kept "
            "lines are handed back to her instead")
    atomic_write_bytes(
        str(path), str(target.get("before_text", "")).encode("utf-8"))
    target["undone"] = True
    save_kept_back(library_root, entries)
    return {"ok": True, "ms": ms,
            "restored_lines": list(target.get("removed_lines") or [])}


def _reconstruct_after_removal(target, still_removed):
    """The learned file as a removal leaves it, recomputed from the kept
    before-image with `still_removed` line-texts held out. One spelling,
    used both to VERIFY the file has not drifted and to WRITE the next
    state — so a put-back can never 'verify' one shape and write another."""
    before_lines = str(target.get("before_text", "")).split("\n")
    text = "\n".join(ln for ln in before_lines if ln not in still_removed)
    if target.get("header_swapped") and LEARNED_HEADER_RETIRED in text:
        text = text.replace(LEARNED_HEADER_RETIRED, LEARNED_HEADER, 1)
    return text


def put_back_lines(library_root, ms, lines):
    """Put back SOME of what a removal took — line grain (26.9985 R-17 /
    § I). Her § E sentence says *"put any of it back"* and her § I
    sentence says *"so you can put it back"*: `any of it` is line grain,
    and the whole-removal undo alone would make both sentences overclaim.

    Every requested line must be one this removal took and not already
    back, or the whole put-back is refused (the removal engine's own
    all-or-refuse discipline — a partial put-back shown as whole would
    lie the same way a partial removal would). A put-back restores EVERY
    occurrence the removal took of that line, at its original place,
    reconstructed from the kept before-image.

    ⛔ REFUSES OVER HER LATER EDITS, exactly as the whole undo refuses:
    the file must stand exactly as the removal chain left it, or writing
    the reconstruction would erase her own hand."""
    entries = load_kept_back(library_root)["removals"]
    target = None
    for rec in entries:
        if isinstance(rec, dict) and rec.get("ms") == ms:
            target = rec
    if target is None:
        raise SubjectRemovalRefused("no removal by that stamp is kept")
    if target.get("undone"):
        raise SubjectRemovalRefused(
            "that removal is already back in whole")
    requested = []
    for ln in (lines or []):
        if not isinstance(ln, str) or not ln.strip():
            raise SubjectRemovalRefused(
                "a put-back line must be a real line of text")
        if ln not in requested:
            requested.append(ln)
    if not requested:
        raise SubjectRemovalRefused("nothing was asked to be put back")
    removed_texts = [ln for ln in (target.get("removed_lines") or [])
                     if isinstance(ln, str)]
    already_back = set(
        ln for ln in (target.get("put_back") or []) if isinstance(ln, str))
    still_removed = set(removed_texts) - already_back
    strangers = [ln for ln in requested if ln not in still_removed]
    if strangers:
        raise SubjectRemovalRefused(
            "%d of the %d lines are not ones this removal still holds — "
            "putting back the rest would show her a put-back that did "
            "less than it claims" % (len(strangers), len(requested)))

    path = learned_file_path(library_root)
    try:
        current = path.read_text(encoding="utf-8")
    except OSError:
        raise SubjectRemovalRefused("the learned file is unreadable")
    if current != _reconstruct_after_removal(target, still_removed):
        raise SubjectRemovalRefused(
            "the file has changed since this removal — writing the old "
            "lines back in would erase her own later edits, so the kept "
            "lines stay hers to place herself")

    after = _reconstruct_after_removal(
        target, still_removed - set(requested))
    atomic_write_bytes(str(path), after.encode("utf-8"))
    target["put_back"] = [ln for ln in removed_texts
                          if ln in already_back or ln in set(requested)]
    save_kept_back(library_root, entries)
    # ---- proved the same way the removal is proved: by re-reading -------
    on_disk = path.read_text(encoding="utf-8").split("\n")
    landed = all(ln in on_disk for ln in requested)
    return {"ok": True, "ms": ms, "put_back": list(requested),
            "landed": landed,
            "still_removed": [ln for ln in removed_texts
                              if ln in (still_removed - set(requested))]}


def kept_back_file_path(library_root):
    """librarian/kept_back.json under the library root. Pure path math."""
    return Path(library_root) / "librarian" / "kept_back.json"


def load_kept_back(library_root):
    """{'removals': [...]} — FAIL-OPEN, the family shape. Never raises.
    ⚠ A caller about to render § E's `nothing is lost` must NOT treat the
    empty wrapper as proof of anything — a missing file and an empty store
    read identically here, and the § E gate compares CONTENT, not shape."""
    try:
        data = json.loads(
            kept_back_file_path(library_root).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"removals": []}
    entries = data.get("removals") if isinstance(data, dict) else None
    return {"removals": entries if isinstance(entries, list) else []}


def save_kept_back(library_root, entries):
    """Atomically rewrite librarian/kept_back.json. IO only."""
    d = Path(library_root) / "librarian"
    d.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(
        str(kept_back_file_path(library_root)),
        json.dumps({"removals": list(entries)}, ensure_ascii=False,
                   indent=1).encode("utf-8"))


# ---------------------------------------------------------------------------
# ---- the decoration store (26.9-03, D-23 — DECIDED BY THE OWNER) ----------
# <library_root>/decorations.json holds what she MADE: the marks, pictures
# and hand-written lines she placed on the blessings notebook's pages.
#
# IT IS A SIBLING OF librarian/, NOT A CHILD OF IT, AND THAT IS THE WHOLE
# POINT OF THIS BLOCK. D-23 was rated one-way and taken to the owner as a
# checkpoint; she chose `sibling` and framed it as a TIER assignment rather
# than a tidiness trade-off:
#
#   * the library ROOT is the IRREPLACEABLE tier — it holds items.json, the
#     law-5 file, and now this;
#   * librarian/ is the REBUILDABLE tier, and _librarian_dir's own docstring
#     in server.py states that DELETING IT IS THE LIBRARIAN'S FACTORY RESET.
#
# Handmade work belongs in the durable tier. `rm -rf librarian/` is a
# documented, supported operation and it MUST leave her decorating intact.
# Putting this file inside librarian/ would put her scrapbooking one rm -rf
# behind a supported operation, and unlike every other file under there it
# cannot be regenerated from anything — the librarian's memory rebuilds; a
# line she wrote in her own hand does not.
#
# DO NOT MOVE THIS FILE FOR CONSISTENCY WITH blessings.json. The
# inconsistency is deliberate and is the feature. Its machine-checkable form
# is the factory-reset group in tests/test_server_smoke.py, which removes
# librarian/ recursively and reads the decorations back — it was driven RED
# against an inside-librarian path, so it can actually fail.
#
# Everything ELSE here is the blessings/session family copied whole and is
# location-agnostic: fail-open reads (a missing, unreadable or hand-edited
# off-shape file is simply no decorations), atomic writes through
# atomic_write_bytes, the hand-openable indent, and serialization under the
# server's own small decorations lock (never WRITE_LOCK, never
# LIBRARIAN_LOCK, never _LIBRARIAN_FILES_LOCK) — these helpers do the IO
# only; the caller owns the lock.
# ---------------------------------------------------------------------------


def decorations_file_path(library_root):
    """<library_root>/decorations.json — a SIBLING of librarian/, never a
    child of it (D-23, owner-decided). Pure path math."""
    return Path(library_root) / "decorations.json"


def load_decorations(library_root):
    """{'version': 1, 'days': {...}} — FAIL-OPEN: a missing, unreadable, or
    off-shape file reads as the empty wrapper (the load_blessings /
    _load_insights posture). Never raises."""
    try:
        data = json.loads(
            decorations_file_path(library_root).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"version": 1, "days": {}}
    days = data.get("days") if isinstance(data, dict) else None
    return {"version": 1, "days": days if isinstance(days, dict) else {}}


def save_decorations(library_root, days):
    """Atomically rewrite <library_root>/decorations.json. The caller holds
    the server's decorations lock; this helper does the write only — a crash
    mid-write leaves the prior file intact (never a torn record).

    Byte-stable by construction: sort_keys puts the day map in one order
    regardless of insertion order, so saving the same input twice produces
    identical bytes. The library root is created if absent — the decoration
    store must never fail to write because a fresh library has no directory
    yet, and unlike librarian/ nothing else guarantees it exists here."""
    d = Path(library_root)
    d.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(
        str(decorations_file_path(library_root)),
        json.dumps({"version": 1, "days": dict(days)}, ensure_ascii=False,
                   indent=1, sort_keys=True).encode("utf-8"))


# ---------------------------------------------------------------------------
# ---- the Vision cache (26.94-02, D-05/D-11 — the THIRD tier) --------------
# <library_root>/vision/ holds what the MACHINE DERIVED from her pictures:
# the text it read off them, what it thinks they are pictures of, how many
# faces are in them, and a 768-float print that tells near-duplicates apart.
# One <id>.json and one <id>.fp per photograph.
#
# IT IS A SIBLING OF librarian/, NOT A CHILD OF IT, AND THAT IS THE WHOLE
# POINT OF THIS BLOCK. It is the same tier argument the decoration store
# above settled, arriving from the opposite direction:
#
#   * the library ROOT is the IRREPLACEABLE tier;
#   * librarian/ is the REBUILDABLE tier, and _librarian_dir's own docstring
#     in server.py states that DELETING IT IS THE LIBRARIAN'S FACTORY RESET;
#   * this is a THIRD tier — REGENERABLE by re-running the import pass, and
#     by nothing else.
#
# D-05 says her names and this cache "must not share a lifetime or a delete
# path". `rm -rf librarian/` is a documented, supported operation, so putting
# the cache inside it would share both. And the requirement runs the other
# way too: a fenced photograph's text MUST NOT EXIST (law 5), so clearing one
# photograph's reading has to be two `unlink` calls that touch nothing else —
# which is why this is one file per photograph rather than one blob. Measured
# 2026-08-13: un-writing one print costs 0.7 ms here against 22 ms for a
# packed blob and 108 ms for a JSON sidecar, and both of those momentarily
# materialise 13,605 innocent records to remove one.
#
# DO NOT MOVE THIS DIRECTORY FOR CONSISTENCY WITH librarian/. The
# inconsistency is deliberate and is the feature. Its machine-checkable form
# is the factory-reset group in tests/test_server_smoke.py, extended in plan
# 04 and driven RED against an inside-librarian/ path, so it can actually
# fail; the sibling relationship itself is asserted (never assumed) in
# tests/test_vision_program.py.
#
# ⚠ NEVER IN items.json. 13,606 prints is 41.8 MB into a 15 MB file that is
# read whole and written whole under WRITE_LOCK, and a per-photograph fence
# delete would become a full rewrite of the file holding her judgements.
#
# The helpers here do the IO only; the caller owns the lock (the server's own
# small _VISION_LOCK — never WRITE_LOCK, never LIBRARIAN_LOCK, and never
# _LIBRARIAN_FILES_LOCK, for the reason spelled at server.py's decoration
# lock: the files it guards are not librarian files at all).
# ---------------------------------------------------------------------------

VISION_DIR_NAME = "vision"
# Measured on all 3,748 probe rows and not taken on trust: elementCount 768,
# elementType float32, base64-decoded length exactly 3,072 bytes. The vectors
# are L2-normalised (median norm 1.0001), which is what makes
# cos = 1 - d^2/2 the exact conversion for a returned DISTANCE.
VISION_PRINT_DIM = 768
VISION_PRINT_BYTES = 3072


def vision_dir_path(library_root):
    """<library_root>/vision/ — a SIBLING of librarian/, never a child of it
    (D-05/D-11). Pure path math."""
    return Path(library_root) / VISION_DIR_NAME


def vision_entry_path(library_root, item_id):
    """<library_root>/vision/<id>.json — what was read off one picture."""
    return vision_dir_path(library_root) / (str(item_id) + ".json")


def vision_print_path(library_root, item_id):
    """<library_root>/vision/<id>.fp — 3,072 RAW bytes, never base64, never
    inline in the JSON, never in items.json."""
    return vision_dir_path(library_root) / (str(item_id) + ".fp")


def vision_program_fingerprint(program_path):
    """sha256 of the reading program's own source bytes.

    This is what makes D-10's order — fix the language, re-read every
    picture, THEN write the notes — a precondition the code checks rather
    than a convention in a document. Every cache entry carries it, and the
    note pass refuses any photograph whose entry names a different one. It
    also makes a future re-run correct by construction: change one character
    of the program and every entry is stale, so the note pass refuses until
    Vision has run again.
    """
    return hashlib.sha256(Path(program_path).read_bytes()).hexdigest()


def vision_row_refusal(row):
    """The reason this row must not be cached, or None if it may be. PURE.

    ONE implementation with two callers by design: the pass counts refusals
    BY REASON with it, and the writer below refuses with it, so the cache
    cannot be poisoned by a second caller that validated less. The precision
    edge is the whole point — a print that is not exactly 768 float32s is not
    a print, and a consumer that accepted a short one would compute
    similarities against padding.
    """
    if not isinstance(row, dict):
        return "unparseable"
    if row.get("error"):
        return "error"
    if not isinstance(row.get("path"), str) or not row.get("path"):
        return "unparseable"
    if row.get("dim") != VISION_PRINT_DIM:
        return "bad_dim"
    try:
        raw = base64.b64decode(row.get("fp") or "", validate=True)
    except (ValueError, TypeError):
        return "bad_fp_len"
    if len(raw) != VISION_PRINT_BYTES:
        return "bad_fp_len"
    return None


def vision_write_entry(library_root, item_id, row, program_fp, read_ms=None):
    """Cache one picture's reading: <id>.fp then <id>.json. Returns the entry.

    ⚠ THE ORDER OF THE TWO WRITES IS DELIBERATE. The .json is what every
    later gate reads to decide "this picture has been read"; the .fp is the
    payload. Writing the print FIRST means an interrupted run leaves at worst
    an orphan print with no entry, which the next pass simply overwrites.
    The other order would leave an entry promising a print that is not there.

    ⚠ `text` is NFC-normalised and the file is written with
    ensure_ascii=False as UTF-8, so a Chinese character round-trips
    byte-identically out of Vision and back — this pass exists because 87% of
    her screenshots had their Chinese destroyed once already.

    `read_ms` is WHEN the picture was read (epoch milliseconds, the
    created_ms/started_ms convention), not how long it took.
    """
    reason = vision_row_refusal(row)
    if reason is not None:
        raise ValueError("this row must not be cached: " + reason)
    raw = base64.b64decode(row["fp"], validate=True)
    d = vision_dir_path(library_root)
    d.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(str(vision_print_path(library_root, item_id)), raw)
    entry = {
        "text": unicodedata.normalize("NFC", row.get("text") or ""),
        "themes": list(row.get("themes") or []),
        "faces": int(row.get("faces") or 0),
        "dim": int(row["dim"]),
        "lang": str(row.get("lang") or ""),
        "program_fp": str(program_fp),
        "read_ms": int(time.time() * 1000) if read_ms is None else int(read_ms),
    }
    atomic_write_bytes(
        str(vision_entry_path(library_root, item_id)),
        json.dumps(entry, ensure_ascii=False, indent=1,
                   sort_keys=True).encode("utf-8"))
    return entry


def vision_read_entry(library_root, item_id):
    """One picture's cached reading, or None — FAIL-OPEN, never raises.

    A missing, unreadable, truncated or off-shape file reads as "not read
    yet", the _ledger.load posture. That composes with the fingerprint gate
    rather than fighting it: a fail-open read returns nothing, so the note
    pass's counted gate comes up short and REFUSES LOUDLY, where a
    fail-closed read would have raised somewhere upstream and a fail-quiet
    one would have let the pass proceed on a picture nobody had read.
    """
    try:
        data = json.loads(
            vision_entry_path(library_root, item_id).read_text("utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not data.get("program_fp"):
        return None
    return data


def vision_forget(library_root, item_id) -> int:
    """Un-write ONE photograph's reading. Returns how many files went.

    ⚠ THIS IS HOW A JUDGEMENT SHE MAKES REACHES THE DISK AS AN ABSENCE.
    `vision_path_list` keeps the reader away from a photograph that was
    ALREADY fenced; this covers the other half, which is the one that happens
    in real use — she reads a picture, then decides she never wants to see it
    again. Without this, D-05's "must not exist" would hold only for pictures
    she happened to judge in the right order.

    ⚠ THE ORDER IS THE MIRROR OF THE WRITER'S, AND FOR ONE EXTRA REASON.
    `vision_write_entry` writes the .fp first so an interrupted write leaves
    at worst an orphan print with no entry; this unlinks the .json first so an
    interrupted removal leaves at worst the same thing. The extra reason is
    that the .json is where the WORDS OFF HER PICTURE are, so it is the file
    that has to stop existing first — the .fp is a 768-float vector and
    carries no text at all.

    ⚠ FAIL-OPEN ON ABSENCE, NEVER ON PRESENCE. A missing file is a no-op (the
    _ledger.load posture), which is what makes this idempotent and therefore
    safe to call after a transition has already committed. Any OTHER OSError
    propagates and is meant to: a cache entry that REFUSES to be removed is a
    fence failure, and a fence failure must be loud.

    These helpers do the IO only; the caller owns the lock (the server's own
    small _VISION_LOCK — study_lib holds no locks anywhere, exactly as the
    decorations block beside it says of itself).

    ⚠ ONE RESIDUAL WINDOW, NAMED RATHER THAN PAPERED OVER: a row already in
    flight from a running pass can land AFTER this forget. Idempotency makes
    write-then-forget always end in an absence; it does not make
    forget-then-write do so. Closing that belongs to whoever runs the pass —
    by re-deriving the fence once the run ends (26.94-06/07) — and it is
    asserted in both orders in tests/test_vision_fence.py so the window is on
    the record rather than in a summary nobody re-reads.
    """
    removed = 0
    for path in (vision_entry_path(library_root, item_id),
                 vision_print_path(library_root, item_id)):
        try:
            path.unlink()
        except FileNotFoundError:
            continue
        removed += 1
    return removed


def vision_path_list(store, library_root):
    """(targets, report) — the photographs the on-device reader MAY open.

    ⚠ THIS IS WHERE THE FENCE LIVES FOR THIS WHOLE PHASE, AND IT LIVES HERE
    RATHER THAN OVER THE ROWS ON PURPOSE (D-05). The requirement is not "a
    never-shown photograph's reading is filtered out of the answer" — it is
    that the reading MUST NOT EXIST. The only way to make that true is that
    the program is never handed the path, so it never opens the file, so
    there is nothing to un-write. Filtering afterwards would leave the bytes
    on disk between the read and the filter, and a crash in between would
    leave them there for good.

    `targets` is a list of (item_id, path) PAIRS, ascending by item id, ready
    to hand straight to server.run_vision_pass. ⚠ PAIRS AND NOT BARE PATHS:
    the reader runs eight pictures at a time so its rows come back in
    arbitrary order, and any caller that had to recover the id from position —
    or from the filename — would file one photograph's reading under another
    photograph's id, silently, over her own pictures (26.94-02's finding).
    Handing back the pairing removes the opportunity rather than documenting
    it away.

    `report` is counted BY REASON — {eligible, fenced, jailed, bad_name,
    missing_file} — the adapters/apple_photos.py discipline in its own words:
    14,016 consecutive failures and one failure used to be recorded
    identically, which is to say not at all.

    THE ORDER OF THE STEPS IS LOAD-BEARING:
      1. type == "image" — a note is not a photograph and never enters any
         count here;
      2. the FENCE, _librarian_fenced, CALLED and never copied (see below);
      3. the JAIL — the resolved snapshot must live under <root>/items/;
      4. no newline or carriage return in the resolved path;
      5. the file exists on disk;
      6. sort ascending by item id.

    ⚠ THE FENCE RUNS AT STEP 2 — BEFORE THE SORT AND BEFORE THE EXISTENCE
    CHECK — so that no later step can re-admit an item it excluded. An
    ordering rule, a retry, or a "put the missing ones back" kindness added at
    step 5 or 6 can only ever shrink the list, never grow it.

    ⚠ `_librarian_fenced` IS CALLED, NEVER RE-IMPLEMENTED — the
    derive_identity_anchors discipline. Its union carries FIVE classes (a
    missing item, an unknown state, never_show/retired, the trigger overlay,
    and the keys-file path class) plus the active-filter match, and a copy
    would drift from it the first time one moved. Law 5 calls a drift in the
    never-list a P0, so the copy is not a style question. Two independent
    instruments hold this: tests/test_no_push.cjs asserts the call is here by
    reading the source, and tests/test_vision_fence.py drives the real
    derivation and asserts the fenced ids are absent.

    ⚠ `library_path` IS DATA, NOT A TRUSTED PATH — the same jail
    _read_body_capped states in its own words, and the same shape (resolve,
    then require the resolved path to sit under the store's own items
    directory). Without it, a hand-edited or malformed row carrying `../` or
    an absolute path turns the spawned reader into a file-read primitive
    driven by store data. Refusals are counted and never read.

    Pure apart from the existence check; never writes, never raises.
    """
    root = Path(library_root).resolve()
    items_dir = root / "items"
    filters = (store.get("meta") or {}).get("filters") or []
    report = {"eligible": 0, "fenced": 0, "jailed": 0, "bad_name": 0,
              "missing_file": 0}
    targets = []
    for item in (store.get("items") or {}).values():
        if not isinstance(item, dict) or item.get("type") != "image":
            continue
        if _librarian_fenced(item, filters):
            report["fenced"] += 1
            continue
        try:
            path = (root / str(item.get("library_path") or "")).resolve()
        except (OSError, ValueError):
            report["jailed"] += 1
            continue
        if items_dir not in path.parents:
            report["jailed"] += 1
            continue
        text = str(path)
        if "\n" in text or "\r" in text:
            # the stdin protocol is newline-delimited: one such name would
            # arrive at the reader as TWO paths
            report["bad_name"] += 1
            continue
        if not path.is_file():
            report["missing_file"] += 1
            continue
        targets.append((str(item.get("id")), text))
    targets.sort(key=lambda t: t[0])
    report["eligible"] = len(targets)
    return targets, report


def place_path_list(store, library_root):
    """(paths, report) — the photographs the LOCATION probe may open.

    A sibling of `vision_path_list`, and deliberately a sibling rather than a
    parameter on it: that reader PERSISTS what it reads, and a coordinate may
    never be persisted. Two programs, two contracts, one discipline.

    ⚠ THE FENCE LIVES HERE FOR THE SAME REASON IT LIVES THERE. The requirement
    is not "a never-shown photograph's location is filtered out of the answer"
    — it is that THE READING MUST NOT EXIST. The only way to make that true is
    that the program is never handed the path, so it never opens the file. Her
    private photographs' locations are therefore never read at all, rather than
    read and discarded.

    THE SIX ORDERED STEPS, copied whole because the ORDER is what holds:
      1. type == "image";
      2. the FENCE, _librarian_fenced, CALLED and never copied;
      3. the JAIL — the resolved snapshot must live under <root>/items/;
      4. no newline or carriage return in the resolved path;
      5. the file exists on disk;
      6. sort ascending by item id.

    ⚠ THE FENCE RUNS AT STEP 2 — before the sort and before the existence
    check — so no later step can re-admit an item it excluded.

    ⛔ ONE DIFFERENCE FROM ITS SIBLING, AND IT IS THE WHOLE POINT: this returns
    (item_id, path) pairs too, but its caller must never write a row of the
    answer down. The pairing exists so a coordinate can be matched to the
    photograph it came from IN MEMORY, for exactly as long as one answer takes.

    Pure apart from the existence check; never writes, never raises."""
    root = Path(library_root).resolve()
    items_dir = root / "items"
    filters = (store.get("meta") or {}).get("filters") or []
    report = {"eligible": 0, "fenced": 0, "jailed": 0, "bad_name": 0,
              "missing_file": 0}
    targets = []
    for item in (store.get("items") or {}).values():
        if not isinstance(item, dict) or item.get("type") != "image":
            continue
        if _librarian_fenced(item, filters):
            report["fenced"] += 1
            continue
        try:
            path = (root / str(item.get("library_path") or "")).resolve()
        except (OSError, ValueError):
            report["jailed"] += 1
            continue
        if items_dir not in path.parents:
            report["jailed"] += 1
            continue
        text = str(path)
        if "\n" in text or "\r" in text:
            report["bad_name"] += 1
            continue
        if not path.is_file():
            report["missing_file"] += 1
            continue
        targets.append((str(item.get("id")), text))
    targets.sort(key=lambda t: t[0])
    report["eligible"] = len(targets)
    return targets, report


def vision_fenced_ids(store):
    """Every photograph the fence excludes RIGHT NOW, ascending by id.

    ⚠ THIS EXISTS TO CLOSE THE forget-then-write WINDOW A3 (26.94-04 named it
    and deliberately did not discharge it). `vision_forget` being idempotent
    makes write-then-forget always end in an absence; it does NOT make
    forget-then-write end in one, because a row already in flight from a
    running pass can land AFTER the forget. The remedy A3 names is to
    RE-DERIVE THE FENCE ONCE THE RUN ENDS and forget anything that became
    fenced while the pass was in flight — which needs the list of ids that are
    fenced now, against a store read fresh from disk rather than the snapshot
    the run started from.

    ⚠ THE SAME PREDICATE, CALLED, NEVER COPIED — for the same reason
    `vision_path_list` says at length one screen up. A second hand-rolled
    idea of "fenced" here would be a second thing to drift, and this one runs
    at the exact moment the first one's answer has gone stale.

    Restricted to `type == "image"` to match step 1 of the derivation: nothing
    else has ever had a Vision reading, so a wider sweep would only be a
    longer loop over guaranteed no-ops.

    Pure — reads the store dict and nothing else. The un-writing is the
    caller's, through vision_forget, under the server's own _VISION_LOCK.
    """
    filters = (store.get("meta") or {}).get("filters") or []
    ids = []
    for item in (store.get("items") or {}).values():
        if not isinstance(item, dict) or item.get("type") != "image":
            continue
        if _librarian_fenced(item, filters):
            ids.append(str(item.get("id")))
    ids.sort()
    return ids


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# THE TRUE MADE-ON DATE (26.998-03) — DERIVED BESIDE THE STORED ONE
#
# She asked for the time frame to be reckoned from when a thing was MADE and
# explicitly not from when it arrived.
#
# ⛔⛔ NOTHING HERE OVERWRITES A STORED STAMP. `created_ms` feeds the boundary
# that decides what the room treats as NEW since her last sitting. Moving it
# would silently change what she is shown — things she has already seen coming
# back, or things she has not seen never arriving. The true date is added
# BESIDE it, under its own keys, and a gate asserts the stored stamps are
# byte-identical afterwards.
#
# ⛔ ABSENCE IS A RESULT AND A GUESS IS NOT. An item with no honest source
# carries NO derived date. Not the arrival date, not a neighbour's, not the
# other items in its folder. A plausible date is worse than no date, because
# nothing downstream can tell the two apart.
#
# ⚠⚠ THE FIELD THAT LOOKS RIGHT AND IS WRONG, and the reason this reads
# frontmatter by an ALLOW-LIST rather than by pattern. On the owner's real
# vault the most common date in a note's own header is `date:`, and it is THE
# ARTICLE'S OWN PUBLICATION DATE — measured read-only 2026-08-23: 1,463 notes
# carry one, with years running back to 1990, sitting beside a separate
# `date_clipped:` that is when she actually saved it. Reading `date:` as a
# made-on date would have put a confident, plausible, WRONG date on all 1,463.
# ⛔ `date` IS DELIBERATELY NOT IN THE ALLOW-LIST. Do not add it.
#
# ⚠ AND THE PREMISE THIS WAS BUILT ON WAS RE-MEASURED AND ONLY PARTLY HELD.
# ⛔ THESE FIGURES ARE A MEASUREMENT taken read-only against the owner's live
# library on 2026-08-23; NO GATE DERIVES THEM and nothing re-checks them:
# 2,148 of her 2,488 readable written notes still have their ORIGINAL file on
# disk, and every one of those originals carries a 2026 birth date MATCHING
# the store. The room copied the filesystem faithfully; there is no truer date
# for those items anywhere it may honestly read. Her own fields (`created`,
# `date_clipped`) also say 2026 throughout, so they CONFIRM rather than
# correct. The one source that actually yields a truer date is HER OWN FILING.
# ---------------------------------------------------------------------------

# Where a derived date came from. ⚠ These strings are NOT front-facing copy:
# nothing she reads is drawn from them. They exist so a later reader can tell a
# date read out of her own filing from one read out of a file's own header.
MADE_ON_FROM_FILING = "her filing"
MADE_ON_FROM_HEADER = "the note's own header"
MADE_ON_FROM_ALREADY_REAL = "already real"

# ⛔ AN ALLOW-LIST, NEVER A PATTERN, and `date` is excluded ON PURPOSE — see the
# note above. These are the two fields that mean "when this note came to be" in
# her vault's own vocabulary. Order is preference, most direct first.
MADE_ON_HEADER_FIELDS = ("created", "date_clipped")

_MADE_ON_YM = re.compile(r"(20[12]\d)[-_. /]?(0[1-9]|1[0-2])(?![0-9])")
_MADE_ON_QUOTE = "[\"']?"


def _made_on_ms(year, month, day=1):
    """Epoch ms for a calendar date, UTC. Fail-closed to None on a date that
    does not exist, so a malformed header can never become a confident
    stamp."""
    try:
        return int(datetime(int(year), int(month), int(day),
                            tzinfo=timezone.utc).timestamp() * 1000)
    except (ValueError, OverflowError, OSError):
        return None


def _made_on_from_filing(item):
    """(ms, precision) read out of the name SHE filed it under, or None.

    Folder first, then title, then the origin path — most deliberate naming
    first. A year-and-month gives MONTH precision and SAYS SO; nothing here
    invents a day, and a month rendered as its first day must never be read as
    a day-accurate date."""
    for field in ("folder", "title", "origin_path"):
        match = _MADE_ON_YM.search(str(item.get(field) or ""))
        if match:
            ms = _made_on_ms(match.group(1), match.group(2))
            if ms is not None:
                return ms, "month"
    return None


def _made_on_from_header(text):
    """(ms, precision) read out of the note's OWN frontmatter, or None.

    ⛔ ALLOW-LIST ONLY. A field not in `MADE_ON_HEADER_FIELDS` is not read, and
    `date` is excluded deliberately — on her real vault it is the article's
    publication date, not hers."""
    # ⚠⚠ BYTES **OR** TEXT, AND THIS IS A FIX. The first version tested
    # `str(text).startswith("---")`, which is TRUE for a str and FALSE for the
    # bytes every other frontmatter reader in this module hands around —
    # `str(b"---\n")` is `"b\'---\\n\'"`. Wired to `_read_frontmatter_block`
    # (bytes, like `_frontmatter_has_reflects` takes) it silently returned None
    # for EVERY item: the header source contributed 0 of 16,211 on the owner's
    # real library while every unit test stayed green, because the tests hand
    # it str. ⛔ Decode first, exactly as the reflects reader does.
    if isinstance(text, (bytes, bytearray)):
        try:
            text = bytes(text).decode("utf-8", errors="replace")
        except (TypeError, ValueError):
            return None
    if not isinstance(text, str) or not text.startswith("---"):
        return None
    head = text.split("\n---", 1)[0]
    for field in MADE_ON_HEADER_FIELDS:
        match = re.search(
            r"(?m)^" + field + r"\s*:\s*" + _MADE_ON_QUOTE
            + r"(\d{4})-(\d{2})(?:-(\d{2}))?", head)
        if not match:
            continue
        day = match.group(3)
        ms = _made_on_ms(match.group(1), match.group(2), day or 1)
        if ms is None:
            continue
        return ms, ("day" if day else "month")
    return None


def _made_on_already_real(item):
    """(ms, precision) when the stored stamp is ALREADY the real one.

    True for anything that came in through the photo library: the exported copy
    carries the picture's own date, and a screenshot the room turned into
    writing inherits it. ⛔ This carries the stored value through UNCHANGED; it
    never recomputes it."""
    if str(item.get("from_source") or "") != "apple-photos":
        return None
    stored = item.get("created_ms")
    if not isinstance(stored, int):
        return None
    return stored, "day"


def derive_made_on(store, header_reader=None, filters=None):
    """Add a TRUE made-on date beside the stored one. Mutates `store` in place;
    returns the counted report.

    `header_reader(item_id)` returns that item's frontmatter text or None.
    It is a parameter rather than file I/O here so this stays pure and
    testable, exactly as the screenshot re-derivation's cache reader is.

    ⛔ THE FENCE IS CALLED, NEVER COPIED. A fenced item is not considered, not
    written to, and does not appear in the report — the existing exclusions run
    first and are not forked.

    ⛔ NOTHING STORED IS OVERWRITTEN. `created_ms` and `saved_ms` are read and
    never assigned.

    ⛔ A DISAGREEMENT IS RECORDED, NEVER RESOLVED. When her filing and the
    note's own header give different dates, which is the more direct is NOT
    obvious from the record — so the item is left WITHOUT a derived date,
    `made_on_conflict` is stamped so a later reader can see it, and it is
    counted. That is a finding for the owner, not a judgement for an agent.

    Report: {ok, by_source, no_source, conflicted, fenced, reported_ids}.
    Every count is DERIVED by this run. ⚠ Idempotent: a second pass over a
    settled store is a byte-equal no-op."""
    meta = store.get("meta") or {}
    active = filters if filters is not None else (meta.get("filters") or [])
    report = {"ok": True,
              "by_source": {MADE_ON_FROM_FILING: 0,
                            MADE_ON_FROM_HEADER: 0,
                            MADE_ON_FROM_ALREADY_REAL: 0},
              "no_source": 0, "conflicted": 0, "fenced": 0,
              "reported_ids": []}
    for item in (store.get("items") or {}).values():
        if not isinstance(item, dict):
            continue
        if _librarian_fenced(item, active):
            report["fenced"] += 1
            continue                    # 1. the absolute fence, FIRST
        item_id = str(item.get("id"))
        report["reported_ids"].append(item_id)

        real = _made_on_already_real(item)
        if real is not None:
            item["made_on_ms"], item["made_on_precision"] = real
            item["made_on_from"] = MADE_ON_FROM_ALREADY_REAL
            item.pop("made_on_conflict", None)
            report["by_source"][MADE_ON_FROM_ALREADY_REAL] += 1
            continue

        filing = _made_on_from_filing(item)
        header = _made_on_from_header(
            header_reader(item_id) if header_reader else None)

        if filing and header and filing[0] != header[0]:
            # ⛔ NOT RESOLVED HERE. See the docstring.
            item.pop("made_on_ms", None)
            item.pop("made_on_from", None)
            item.pop("made_on_precision", None)
            item["made_on_conflict"] = True
            report["conflicted"] += 1
            continue
        item.pop("made_on_conflict", None)

        chosen, source = None, None
        if header:
            chosen, source = header, MADE_ON_FROM_HEADER
        elif filing:
            chosen, source = filing, MADE_ON_FROM_FILING
        if chosen is None:
            # ⛔ NO DATE. Not a fallback, not the arrival stamp, not a guess.
            item.pop("made_on_ms", None)
            item.pop("made_on_from", None)
            item.pop("made_on_precision", None)
            report["no_source"] += 1
            continue
        item["made_on_ms"], item["made_on_precision"] = chosen
        item["made_on_from"] = source
        report["by_source"][source] += 1
    return report


# ---------------------------------------------------------------------------
# THE STRETCH SHE NAMES (26.998-04) — RECKONED FROM THE TRUE MADE-ON DATE
#
# ⛔⛔ WHAT SHE RULED, AND WHAT SHE DID NOT.
#
# Beat 3, WRITTEN BY HER — not chosen from any list an agent offered:
#   "I think when the librarian is asking for reflection gives the option
#    about if the user wants the most recent reflection or if the user has a
#    time frmae"
# Beat 3b, chosen from an offered set:  "I type it in the moment"
#
# ⭐ SO THERE ARE TWO CHOICES, NOT THREE FIXED SCALES, and the reach is a value
# SHE SUPPLIES AT THE MOMENT SHE IS ASKED.
# ⛔⛔ THERE IS NO DEFAULT SPAN HERE AND NO AGENT MAY ADD ONE — not as a default
# argument, not as an example, not as a constant "that will be replaced". She
# said "these x months" and the letter is HERS. `span_ms=None` does not mean
# "some sensible reach"; it means SHE DID NOT ASK FOR ONE, and the room behaves
# exactly as it does today.
#
# ⛔ HER RULING ON WHAT THE ROOM CANNOT DATE (T-3): "Leave them out, and tell
# me". So a stretch sets undated items aside AND REPORTS HOW MANY, because the
# telling is half of what she asked for. ⚠ That was a GAP in her own beat-3
# ruling and it was ASKED of her rather than filled in by an agent.
#
# ⛔ RECKONED FROM THE TRUE MADE-ON DATE, NEVER THE STORED STAMP. She ruled
# explicitly against the arrival date, and 26.998-03 established the stored
# stamp IS the arrival date for her writing — every one of her written notes
# carries this year. A reach read off the stored stamp would return everything.
#
# ⛔ NO WEIGHT, RATIO, THRESHOLD, TIE-BREAK OR ORDERING VALUE. A stretch is a
# reach she named, not a score. What weighs more inside it is still undesigned
# and still hers.
# ---------------------------------------------------------------------------


def reflection_window(store, span_ms=None, now_ms=None, filters=None):
    """Which items a reflection may be built from, given the reach SHE typed.

    `span_ms` is the stretch she asked for, in milliseconds, or None when she
    did not ask for one. ⛔ None is NOT a default reach — it is her other
    choice, and it returns exactly what the room returns today.

    ⛔ THE FENCE IS CALLED, NEVER COPIED. The existing exclusions run FIRST and
    are not forked, so anything she has set aside stays set aside under every
    reach, including no reach at all.

    ⛔ PURE. Reads the store and mutates nothing — asking for a stretch may
    never change her library.

    Returns {ids, outside, set_aside_undated, fenced}:
      ids                 the set that survived, by identity
      outside             carried a true date, but outside the reach
      set_aside_undated   ⛔ HER T-3 RULING: left out because the room cannot
                          honestly date them — REPORTED so she can be told
      fenced              never considered, never reported individually
    """
    meta = store.get("meta") or {}
    active = filters if filters is not None else (meta.get("filters") or [])
    report = {"ids": set(), "outside": 0, "set_aside_undated": 0, "fenced": 0}
    edge = None
    if span_ms is not None:
        base = now_ms if now_ms is not None else int(time.time() * 1000)
        edge = int(base) - int(span_ms)
    for item in (store.get("items") or {}).values():
        if not isinstance(item, dict):
            continue
        if _librarian_fenced(item, active):
            report["fenced"] += 1
            continue                    # 1. the absolute fence, FIRST
        item_id = str(item.get("id"))
        if edge is None:
            # She did not ask for a stretch. ⛔ Nothing is set aside — her T-3
            # ruling is about a stretch, and widening it here would be an
            # agent deciding something she was never asked.
            report["ids"].add(item_id)
            continue
        made = item.get("made_on_ms")
        if not isinstance(made, int):
            # ⛔ HER RULING, NOT A DEFAULT: leave them out, and tell me.
            report["set_aside_undated"] += 1
            continue
        if made >= edge:
            report["ids"].add(item_id)
        else:
            report["outside"] += 1
    return report


# ---------------------------------------------------------------------------
# THE MARK SHE ALREADY PUTS ON HER OWN WRITING (26.998-05) — CARRIED ACROSS
#
# ⛔⛔ HER ROUTE, CHOSEN AT BEAT 2 AND HELD WITH THE REACH SHOWN.
#   beat 2  — what her own writing IS:   "My prose plus short notes I typed"
#   beat 2b — how the room should know:  "Carry across the mark I already use"
#
# ⛔ NO SECOND ROUTE IS ADDED BESIDE IT. It reaches very little today and that
# was MEASURED AND PUT TO HER before anything was built on it.
# ⛔ THESE FIGURES ARE A MEASUREMENT taken read-only against her live library
# and her vault on disk on 2026-08-23; NO GATE DERIVES THEM: of the 625 vault
# notes the room may read, EIGHT carry the mark, two carry it turned off, and
# 615 say nothing either way. Across her whole vault on disk — 2,664 files,
# private ones included — 29 carry it at all. Shown that, she ruled:
# "Yes — build it, it grows as I mark".
#
# ⛔⛔ THE MARK IS THREE-VALUED AND THAT IS THE WHOLE POINT.
#     set true   -> hers
#     set false  -> she said it is NOT hers
#     absent     -> ⛔ UNKNOWN; the room says NOTHING about the item.
# A wrong mark on her own writing is worse than no mark, because the entire
# point of her ask is that a reflection is built from HER words.
#
# ⚠ THE ITEMS MOST LIKELY TO CARRY THE MARK SIT BEHIND HER PRIVATE LIST AND
# ARE DELIBERATELY NOT OPENED. They are not read, not judged, and NOT COUNTED
# AS REACHED — the unmeasured remainder stays unmeasured.
#
# ⛔ NO WEIGHT, RATIO, THRESHOLD OR ORDERING VALUE. This produces a signal.
# What it is worth is her ranking, and her ranking is not numbers.
# ---------------------------------------------------------------------------

# The key she writes in her own notes. ⚠ Named once; a second spelling of a
# signal is the defect class this codebase keeps finding.
HANDWRITTEN_KEY = "handwritten"
_HANDWRITTEN_TRUE = ("true", "yes")
_HANDWRITTEN_FALSE = ("false", "no")


def _frontmatter_handwritten(text_bytes):
    """True / False / None from a note's own frontmatter — THREE-VALUED.

    None means she said nothing, and the room must say nothing back. Scans the
    full frontmatter block to the closing fence, exactly as the `reflects:`
    reader does. Pure; fail-closed to None on anything unreadable, never
    raises. ⛔ An unrecognised value is None, not False: a value this function
    does not understand is not her saying no."""
    if not text_bytes:
        return None
    try:
        text = bytes(text_bytes).decode("utf-8", errors="replace")
    except (TypeError, ValueError):
        return None
    if text and ord(text[0]) == 0xFEFF:
        text = text[1:]
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    for line in lines[1:]:
        stripped = line.strip()
        if stripped in ("---", "..."):
            break                       # closing fence — stop
        match = re.match(r"^([A-Za-z0-9_][\w-]*)\s*:\s*(.*)$", line)
        if not match or match.group(1) != HANDWRITTEN_KEY:
            continue
        value = match.group(2).strip().strip('"').strip("'").lower()
        if value in _HANDWRITTEN_TRUE:
            return True
        if value in _HANDWRITTEN_FALSE:
            return False
        return None                     # ⛔ not understood is not "no"
    return None


def derive_handwritten(store, header_reader, filters=None):
    """Carry her own hand-written mark into the room. Mutates `store` in
    place; returns the counted report.

    `header_reader(item_id)` returns that item's frontmatter BYTES, or b''. It
    is a parameter rather than file I/O here so this stays pure and testable.

    ⛔ THE FENCE IS CALLED, NEVER COPIED. A fenced item is not read, not
    judged, not written to, and NOT counted as reached.

    ⛔ SHE CAN WITHDRAW A MARK. When the mark is gone from a note the room
    stops claiming anything about it — a stale claim that a clipped article is
    her own writing is exactly the wrong mark this route exists to avoid.

    ⛔ NOTHING STORED MOVES. States, tags and both date stamps are read and
    never assigned.

    Report: {ok, marked_hers, marked_not_hers, unknown, fenced}. Every count is
    DERIVED by this run. ⚠ Idempotent."""
    meta = store.get("meta") or {}
    active = filters if filters is not None else (meta.get("filters") or [])
    report = {"ok": True, "marked_hers": 0, "marked_not_hers": 0,
              "unknown": 0, "fenced": 0}
    for item in (store.get("items") or {}).values():
        if not isinstance(item, dict):
            continue
        if _librarian_fenced(item, active):
            report["fenced"] += 1
            continue                    # 1. the absolute fence, FIRST
        verdict = _frontmatter_handwritten(
            header_reader(str(item.get("id"))) if header_reader else None)
        if verdict is None:
            # ⛔ SHE SAID NOTHING. The room says nothing back, and any claim
            # it used to hold is dropped rather than left to go stale.
            item.pop(HANDWRITTEN_KEY, None)
            report["unknown"] += 1
            continue
        item[HANDWRITTEN_KEY] = verdict
        if verdict:
            report["marked_hers"] += 1
        else:
            report["marked_not_hers"] += 1
    return report


# ---------------------------------------------------------------------------
# THE TIER SHE RANKED FIRST (26.998-06)
#
# ⛔⛔ HER BEAT-1 RULING, chosen from an offered set after she was told the
# forward-only consequence for the first time:  "Bring back the ones set aside"
#
# ⛔⛔ THAT IS WHAT SHE WANTS THE TIER TO BE. IT IS NOT AN INSTRUCTION TO ANY
# AGENT. Nothing here touches her private list and nothing here releases
# anything: release is ONE TAP AT A TIME, BY HER, through the shipped per-item
# release — the same directional safety that makes removing a folder reach
# forward only. ⛔ No ticket, plan, script or migration may do it for her.
#
# ⛔ SO THE TIER IS EMPTY TODAY, AND THE EMPTINESS IS REPORTED RATHER THAN
# HIDDEN — `still_held_back` is a DERIVED count, not a claim in a comment.
# ⛔ THIS FIGURE IS A MEASUREMENT taken read-only against her live library on
# 2026-08-23 and no gate derives it: her `Journal` folder holds 30 items and
# every one is held back, so the tier the room may build from holds ZERO. It
# fills as she releases them and as she writes new entries.
# ⛔ That is a fact about her own ruling, NOT a problem with a suggested fix.
#
# ⛔ THE EVIDENCE IS THE PLACE SHE FILED IT — never tone, never contents, never
# shape. Inferring a diary from how a note reads is exactly the guess this
# phase exists to keep out of an agent's hands.
#
# ⚠ WHOLE SEGMENTS, NEVER A PREFIX, and this is not a style note: `Journal`
# must not catch `Journal analysis`, a real folder in her vault holding the
# room's OWN writing about her diary. A substring test would file Claude's
# words as hers — the exact inversion of what she asked for. This reuses
# `roster_segments`, the one spelling of what a folder entry means, rather
# than adding a fourth matcher.
#
# ⛔ NO WEIGHT, RATIO, THRESHOLD OR ORDERING VALUE. Her ranking put the journal
# first; what "first" means numerically is not an agent's to decide, and it is
# not needed to tell a journal entry apart from her other writing.
# ---------------------------------------------------------------------------

# The folder she keeps her diary in. ⚠ Named once. This is NOT read off her
# private list: that list is a PRIVACY control and happens to name this folder
# today, but conflating "she keeps this private" with "this is her diary"
# would make either one silently redefine the other.
JOURNAL_FOLDER = "Journal"


# ---------------------------------------------------------------------------
# 26.998-07: HER RANKING, AS A TIER NUMBER. ⛔ THE ORDER IS HERS AND IS QUOTED
# RATHER THAN PARAPHRASED (26.998-WEIGHTING.md § W-8, § W-9, both WRITTEN BY
# HER with nothing offered):
#
#     "It is a strict order for now"
#     "Clippings ranks the same as the screenshot"
#     "Because both of them = things I am interested and I maybe check them
#      out later"
#
#     1  her journal
#     2  her other hand-written things
#     3  photographs she took
#     4  screenshots AND clippings          (tied)
#
# ⛔⛔ NO AGENT MAY ADD A TIER, A WEIGHT WITHIN A TIER, A RATIO OR A THRESHOLD.
# The phase goal forbids it twice and the ordering above is the whole of what
# she ruled. This function REPORTS her order; it does not extend it.
#
# ⭐ HER OWN PRINCIPLE, in her words, is what makes tier 4 a tie rather than
# two tiers: a clipping and a screenshot are the same KIND OF THING to her —
# *things I am interested and I maybe check them out later* — as against her
# own life and voice above them. ⚠ That is a reading of her sentence and is
# marked as one; it may not be applied to a case she has not ruled on.
#
# ⚠ UNMARKED WRITING IS TIER 4, and that is HER ruling rather than a fallback:
# tier 2 is *her other hand-written things*, which her beat-2b answer defined
# as the mark she already uses. Prose she has not marked is not in her top
# two, and on her live library that is ~2,471 items — the bulk of what a
# reflection is actually built from.
REFLECTION_TIER_JOURNAL = 1
REFLECTION_TIER_HANDWRITTEN = 2
REFLECTION_TIER_PHOTOGRAPH = 3
REFLECTION_TIER_SAVED = 4


def reflection_tier(item, journal_ids=()):
    """Where one item sits in HER ranking. Pure: reads, never writes.

    `journal_ids` is the set `journal_tier` derived — passed in rather than
    re-derived here, so there is exactly ONE spelling of "is this her
    journal" in the room and this function cannot drift from it.

    ⛔ THE HAND-WRITTEN MARK IS THREE-VALUED AND ONLY `True` IS TIER 2.
    `False` is *she said it is NOT hers*; ABSENT is *unknown, and the room
    says nothing*. Treating absent as tier 2 would file a clipped article as
    her own writing, which is the exact inversion of what she asked for.

    ⚠ A missing/None mark reads as tier 4 for text — see the block above:
    that is her ruling, not a fail-open.
    """
    if str(item.get("id") or "") in journal_ids:
        return REFLECTION_TIER_JOURNAL
    if item.get("handwritten") is True:
        return REFLECTION_TIER_HANDWRITTEN
    if (item.get("type") != "text"
            and SCREENSHOT_TAG not in (item.get("tags") or [])):
        return REFLECTION_TIER_PHOTOGRAPH
    return REFLECTION_TIER_SAVED


def journal_tier(store, filters=None):
    """Which items are her journal AND may actually be material today.

    ⛔ PURE. Reads the store and mutates nothing — asking about the tier may
    never release, unflag or touch anything she has set aside.

    Returns {ids, still_held_back, not_journal, no_evidence}:
      ids               her journal entries that SHE has released
      still_held_back   ⛔ hers, set aside, and staying that way — reported so
                        the emptiness of the tier she ranked first is visible
      not_journal       her other writing, and the room's writing ABOUT her
                        diary, which is not her diary
      no_evidence       ⛔ no folder of hers to read, so the room says NOTHING

    ⭐ WIRED 2026-08-23 (26.998-07). Its production caller is the reflection
    start path in `server.py`, which calls it on the throwaway snapshot right
    after `derive_handwritten`. ⛔ NEITHER SIGNAL REACHES THE MODEL: they order
    the pool and nothing else.

    ⛔⛔ THE PARAGRAPH THIS REPLACES SAID NOTHING CALLED IT, AND WENT ON SAYING
    SO FOR A DAY AFTER A CALLER LANDED. It is kept in outline because the
    failure is the point: this phase shipped two BUILT-BUT-NEVER-CALLED defects
    that every green suite passed, recorded the absence here so it could not
    read as an oversight — and then let the record go stale the moment the
    absence stopped being true. ⚠ An absence that is recorded and then silently
    outdated is the same defect wearing the record's own clothes. Corrected
    2026-08-24 after re-verification caught it.

    ⚠ AND THE FENCE IS CHECKED LAST HERE, UNLIKE ITS THREE SIBLINGS, ON
    PURPOSE. `derive_made_on`, `reflection_window` and `derive_handwritten`
    all screen first and `continue`; this one classifies by FOLDER first so
    that a set-aside journal entry can be counted into `still_held_back`
    rather than vanishing — the emptiness of her first-ranked tier is the
    thing the caller most needs to see. ⛔ A fenced item still cannot enter
    `ids`. ⭐ THE RE-READ THIS DEMANDED ON WIRING WAS DONE, 2026-08-24, and the
    ordering holds: the fence is consulted before `ids.add`, a fenced journal
    entry is counted into `still_held_back` and is never released, and removing
    that fence check drives `tests/test_journal_tier.py` RED. ⛔ The instruction
    stays in place for the NEXT wiring; it is answered, not retired.
    """
    meta = store.get("meta") or {}
    active = filters if filters is not None else (meta.get("filters") or [])
    vault_root = meta.get("vault_root")
    want = [s.casefold() for s in roster_segments(JOURNAL_FOLDER)]
    report = {"ids": set(), "still_held_back": 0, "not_journal": 0,
              "no_evidence": 0}
    for item in (store.get("items") or {}).values():
        if not isinstance(item, dict):
            continue
        origin = item.get("origin_path")
        rel = None
        if origin and vault_root:
            try:
                rel = Path(str(origin)).resolve().relative_to(
                    Path(str(vault_root)).resolve()).parts
            except (ValueError, OSError, RuntimeError):
                rel = None
        if not rel:
            # ⛔ NO EVIDENCE. Folder names exist only for what came from her
            # vault; the rest arrived under generated bucket names. The room
            # says nothing rather than guessing.
            report["no_evidence"] += 1
            continue
        folded = [p.casefold() for p in rel]
        if folded[:len(want)] != want:
            report["not_journal"] += 1
            continue
        if _librarian_fenced(item, active):
            # ⛔ HERS, SET ASIDE, AND STAYING THAT WAY. Counted so the
            # emptiness is visible; never released here.
            report["still_held_back"] += 1
            continue
        report["ids"].add(str(item.get("id")))
    return report


# ---- the screenshot re-derivation (26.94-05, D-07) ------------------------
#
# ⚠⚠ THIS IS A SEPARATE ONE-SHOT PASS AND IT IS NEVER CALLED FROM
# `stamp_facets`. Two callers depend on that function's promise — the one its
# own migration docstring makes, that "the screenshots tag is never appended
# twice ... so a second pass is a byte-equal no-op" — and this re-derivation
# REMOVES the tag from photographs that are not screenshots (16 of them on the
# real library). A removal inside `stamp_facets` would break the promise for
# `import_folder` and `migrate_store` both, and the migration's idempotence
# tests would go red for the right reason at the wrong time. So the tag's
# birthplace is left exactly as it is and the correction lives out here.
#
# WHY A RE-DERIVATION AT ALL, IN NUMBERS.
#
# ⚠⚠ EVERY FIGURE IN THIS PARAGRAPH IS A MEASUREMENT TAKEN BY PLAN 26.94-08
# AGAINST THE OWNER'S REAL LIBRARY AS IT STOOD THEN. ⛔ NONE OF THEM IS DERIVED
# BY ANY GATE AND NOTHING RE-CHECKS THEM — a count in a comment is not a gate,
# and this codebase has been bitten by exactly that. No date is recorded for
# them here and none is invented. Treat them as historical, and re-derive
# before quoting any of them to anyone.
#
# The shipped tag covers 2,676 of 3,748 true screenshots and 16 of those 2,676
# are not screenshots — a 29.0% under-count. The cause is measurable rather
# than mysterious: 13,419 of the
# 13,606 image items came out of Apple Photos named `<32-hex-uuid>.jpeg`, and
# the export destroys the original filename and re-encodes to JPEG. Of
# `detect_screenshot`'s three signals, the filename patterns can never fire
# and the IMG_*.png rule can never fire, so only the exact dimension table
# survives.
#
# ⚠⚠ AND IT IS DOWNSTREAM OF THE VISION PASS, NOT UPSTREAM OF IT. Test 2 IS
# Vision's own `screenshot` label, so a re-derivation run before the pictures
# have been read gets test 1 alone — 2,753, still 27% short. The order is:
# read every photograph -> re-derive the tag -> group -> write the notes.
# The counted gate below is what makes that order a precondition the code
# CHECKS rather than a convention in a document; nothing in the shipped code
# enforces it today, since `migrate_store` gates on schema version and not on
# derivation.
# ---------------------------------------------------------------------------

# The literal `stamp_facets` appends, named once here for the correction's own
# use. ⚠ It deliberately does NOT replace the literal inside `stamp_facets` —
# that function must stay byte-identical for its two callers.
SCREENSHOT_TAG = "screenshots"
# Test 2, exactly: Vision's own classification label.
VISION_SCREENSHOT_LABEL = "screenshot"

# The pass this correction STANDS ON, named once so the report can say it.
#
# ⚠⚠ WHY THE REPORT HAS TO NAME IT (26.998-02). Test 2 IS this pass's own
# label, so a correction produced BEFORE the pictures have been read is a
# materially short answer that has exactly the same shape as a whole one — the
# same keys, a smaller number — and nothing in the report distinguished them.
# The comment above puts the short answer at 27% under. `depends_on` names what
# a reader has to run; `complete` says whether this particular run was standing
# on it. Both are DERIVED by the run, never quoted.
REDETECT_DEPENDS_ON = "Vision reading"

_EXIF_MAGIC = b"Exif\x00\x00"
_TIFF_MODEL_TAG = 0x0110        # [CITED: TIFF 6.0 / Exif 2.3 — IFD0 `Model`]


def _tiff_model(tiff: bytes):
    """The `Model` string out of a TIFF header's IFD0, or None.

    [CITED: TIFF 6.0 §2 Image File Directory] byte order ('II' little / 'MM'
    big), the 42 magic, then a 4-byte offset to IFD0. IFD0 is a 2-byte entry
    count followed by 12-byte entries: tag(2) type(2) count(4) value-or-
    offset(4). An ASCII value longer than four bytes does not fit in the
    entry, so the last field is an offset FROM THE TIFF HEADER rather than the
    string itself — reading it as the string is the classic mis-parse.

    Pure: no wall-clock, no locale, no filesystem reads."""
    if len(tiff) < 8:
        return None
    if tiff[:2] == b"II":
        end = "<"
    elif tiff[:2] == b"MM":
        end = ">"
    else:
        return None
    if struct.unpack(end + "H", tiff[2:4])[0] != 42:
        return None
    off = struct.unpack(end + "I", tiff[4:8])[0]
    if off + 2 > len(tiff):
        return None
    count = struct.unpack(end + "H", tiff[off:off + 2])[0]
    for k in range(count):
        e = off + 2 + k * 12
        if e + 12 > len(tiff):
            return None
        tag, typ, cnt = struct.unpack(end + "HHI", tiff[e:e + 8])
        value = tiff[e + 8:e + 12]
        if tag != _TIFF_MODEL_TAG or typ != 2:
            continue
        if cnt <= 4:
            raw = value[:cnt]
        else:
            voff = struct.unpack(end + "I", value)[0]
            raw = tiff[voff:voff + cnt]
        text = raw.split(b"\x00", 1)[0].decode("ascii", "ignore").strip()
        return text or None
    return None


def camera_model(data: bytes):
    """The camera `Model` an image's Exif names, or None when there is none.

    [CITED: Exif 2.3] Exif rides in a JPEG APP1 segment (marker 0xFFE1) whose
    payload begins with 'Exif\\x00\\x00' and continues with a TIFF header. PNG
    has no such segment in any file this room writes, so a PNG answers None —
    which is the ANSWER THIS FUNCTION IS FOR, not a failure: "no camera model"
    is half of test 1.

    ⚠ ERRS THE SAME WAY `detect_screenshot` DOES — INCLUSIVE. A header this
    cannot parse reads as "no camera model", which can only ever make MORE
    photographs pass test 1. D-07's whole finding is that the shipped
    derivation under-counts by 29%, so erring toward inclusion errs toward the
    correction rather than against it; and test 2 is an independent second
    signal either way.

    The bytes are the FIRST 64 KB of the file (`_read_head`), which is where
    Exif lives; a truncated segment reads as None on the same rule.
    Pure: no wall-clock, no locale, no filesystem reads."""
    if data[:2] != b"\xff\xd8":
        return None
    i, n = 2, len(data)
    while i + 4 <= n:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        if marker in (0xD9, 0xDA):
            return None         # end of image / start of scan — Exif is past
        seg_len = struct.unpack(">H", data[i + 2:i + 4])[0]
        if seg_len < 2:
            return None
        payload = data[i + 4:i + 2 + seg_len]
        if marker == 0xE1 and payload[:6] == _EXIF_MAGIC:
            return _tiff_model(payload[6:])
        i += 2 + seg_len
    return None


def _screen_capture_signal(path) -> bool:
    """TEST 1, whole: no camera `Model` in the file AND exact device-screen
    dimensions (`SCREEN_RESOLUTIONS`, 14 sizes x both orientations).

    ⚠ THE TWO HALVES ARE ANDed AND BOTH ARE LOAD-BEARING. Dimensions alone
    would catch a photograph that happens to be exactly 1179x2556; the camera
    model is what says a lens was involved. `png_dims`/`jpeg_dims` and
    `SCREEN_RESOLUTIONS` are REUSED and never re-derived — a second copy of
    the size table is a second thing to keep correct.

    A seam by design: this is the name the suite patches to reproduce "test 1
    was dropped", which on the real library is the 2,753-vs-3,748 shortfall."""
    head = _read_head(path)
    if not head:
        return False
    if camera_model(head):
        return False
    dims = png_dims(head)
    if dims is None:
        dims = jpeg_dims(head)
    return dims is not None and tuple(dims) in SCREEN_RESOLUTIONS


def _vision_themes(entry):
    """TEST 2's read: the labels Vision put on one photograph. PURE, and
    fail-closed — a missing, unparseable or off-shape entry has no themes,
    so it simply fails test 2 rather than raising inside a pass over
    thirteen thousand pictures.

    A seam by design: patching this to return nothing is exactly the state
    'the Vision pass has not run yet', which is the sequencing mistake."""
    if not isinstance(entry, dict):
        return ()
    themes = entry.get("themes")
    if not isinstance(themes, (list, tuple)):
        return ()
    return tuple(str(t) for t in themes)


def _vision_entry_is_current(entry, program_fp) -> bool:
    """True iff this cache entry was written by the program now running.

    ⚠ PRESENCE IS NOT CURRENCY, and the difference is the entire point. A
    cache full of entries the OLD program wrote is a cache that looks
    complete, and a gate that checked only for presence would wave through
    every one of them — which is how the language defect ends up baked into
    roughly 3,575 notes she then reads as her own words."""
    return (isinstance(entry, dict) and bool(program_fp)
            and entry.get("program_fp") == program_fp)


def _tag_screenshot(item) -> bool:
    """Append the tag if absent; True when it was actually added. Never twice
    — the same idempotence `stamp_facets` promises, kept here too so the two
    can be run in either order without a duplicate."""
    tags = item.setdefault("tags", [])
    if SCREENSHOT_TAG in tags:
        return False
    tags.append(SCREENSHOT_TAG)
    return True


def _untag_screenshot(item) -> bool:
    """Remove the tag if present; True when it was actually removed.

    ⚠ IN PLACE, on the SAME list object, rather than by rebinding a filtered
    copy: `stamp_facets` handed that list out through `setdefault` and the
    store is a live dict, so replacing it would leave any holder of the old
    list looking at a tag this pass just decided was wrong.

    A seam by design: patching this to a no-op reproduces the comfortable
    mistake — a re-derivation that only ever ADDS, and therefore never has to
    argue with `stamp_facets`, and therefore leaves all 16 false positives."""
    tags = item.get("tags")
    if not isinstance(tags, list) or SCREENSHOT_TAG not in tags:
        return False
    while SCREENSHOT_TAG in tags:
        tags.remove(SCREENSHOT_TAG)
    return True


def redetect_screenshots(store, library_root, cache_reader, program_fp):
    """Re-derive the `screenshots` tag as TEST 1 UNION TEST 2. Returns the
    counted report; mutates `store` IN PLACE.

      test 1 — no camera `Model` in the file AND exact device-screen
               dimensions (`_screen_capture_signal`)
      test 2 — Vision's own `screenshot` label in the cache entry's themes

    `cache_reader(item_id)` returns that photograph's cached reading or None.
    `program_fp` is the fingerprint of the reading program NOW RUNNING
    (`vision_program_fingerprint`), and it is a parameter rather than
    something derived here because the program's path is the server's to know
    and this module imports nothing from it.

    ⚠ THE COUNTED GATE COMES FIRST, BEFORE A SINGLE TAG IS TOUCHED. Every
    non-fenced photograph must carry a cache entry written by THIS program.
    On a shortfall the pass returns
    {ok: False, why: "<n> of <m> photographs have no current Vision reading —
    the note pass would run on stale text"} and changes nothing at all.

    ⚠ THE CANDIDATE SET IS `vision_path_list`'s, WHICH MEANS THE FENCE IS
    CALLED AND NEVER COPIED. A fenced photograph is therefore not counted, not
    tagged and not UNtagged — the pass cannot act on evidence it refuses to
    gather. That is deliberate and it is the strong reading of law 5: a
    never-shown photograph carrying the tag today keeps it, because deciding
    otherwise would mean deciding something about a picture nobody may open.

    ⚠ ITEMS ARE MATCHED BY IDENTITY, never by position in any list.

    Report: {ok, why, complete, depends_on, eligible, union, test1_only,
    test2_only, both, added, removed, refused}.

    ⚠ `complete` IS NOT A SECOND SPELLING OF `ok`, and the difference is the
    whole point of the field. `ok` says whether the pass ACTED. `complete` says
    whether it was standing on everything it depends on — `depends_on` names
    that. A run that refuses reports complete=False, and a reader who sees the
    familiar key-set can no longer mistake a short answer for a whole one.

    ⚠ NO LOCK AND NO FILE WRITE — the `migrate_store` contract in its own
    words: the caller owns the WRITE_LOCK and the atomic save. This reads
    image headers and mutates the dict it was handed; nothing else."""
    targets, _path_report = vision_path_list(store, library_root)
    report = {"ok": False, "why": None, "complete": False,
              "depends_on": REDETECT_DEPENDS_ON, "eligible": len(targets),
              "union": 0, "test1_only": 0, "test2_only": 0, "both": 0,
              "added": 0, "removed": 0, "refused": 0}

    entries = {}
    stale = 0
    for item_id, _path in targets:
        entry = cache_reader(item_id)
        if _vision_entry_is_current(entry, program_fp):
            entries[item_id] = entry
        else:
            stale += 1
    if stale:
        report["refused"] = stale
        report["why"] = (
            str(stale) + " of " + str(len(targets)) + " photographs have no "
            "current Vision reading — the note pass would run on stale text")
        return report

    by_id = {}
    for item in (store.get("items") or {}).values():
        if isinstance(item, dict):
            by_id[str(item.get("id"))] = item

    test1, test2 = set(), set()
    for item_id, path in targets:
        if _screen_capture_signal(path):
            test1.add(item_id)
        if VISION_SCREENSHOT_LABEL in _vision_themes(entries.get(item_id)):
            test2.add(item_id)
    union = test1 | test2

    for item_id, _path in targets:
        item = by_id.get(item_id)
        if item is None:
            continue
        if item_id in union:
            if _tag_screenshot(item):
                report["added"] += 1
        elif _untag_screenshot(item):
            report["removed"] += 1

    # ⚠ complete=True is reached ONLY here — past the counted gate, which has
    # already proved every eligible photograph carries a reading written by
    # THIS program. It is set from the path taken, not from a flag anyone
    # passed in.
    report.update(ok=True, complete=True, union=len(union),
                  both=len(test1 & test2),
                  test1_only=len(test1 - test2),
                  test2_only=len(test2 - test1))
    return report


# ---------------------------------------------------------------------------
# ---- the clean: chrome-stripping and the note predicate (26.94-05, D-09) --
#
# "A failed clean produces no note." That sentence is only testable once two
# things are settled, and both are settled HERE rather than left to whoever
# writes the pass:
#
#   WHAT COMES OFF. Deterministic screen chrome — the status-bar clock, the
#   battery reading, the radio label, the bar affordances — by REGULAR
#   EXPRESSION ONLY. No model, no judgement (#40 D-02): the moment a model
#   decides what is chrome, "the same picture always yields the same note"
#   stops being true, and law 4 lives on that being true.
#
#   ⚠ WHOSE CHARACTERS "30 CHARACTERS" MEANS. Three units were candidates and
#   only one is defensible:
#     * BYTES would make the threshold roughly three times stricter for
#       Chinese than for English (one CJK character is 3 UTF-8 bytes) — which
#       is the exact asymmetry this phase exists to remove. 87% of her
#       screenshots had their Chinese destroyed once already by a language
#       configuration nobody had questioned; a byte threshold would quietly do
#       it again in a different way.
#     * GRAPHEME CLUSTERS are the linguistically correct unit and need a
#       package, which law 8 forbids.
#     * CODE POINTS is the unit the MEASUREMENT was taken in — "median 333
#       characters", "median 319 after stripping" were produced by Python
#       len() on a str — so the threshold and the evidence for it are in the
#       same unit. That is the only way 30 means the same thing to both
#       languages.
#   NFC normalisation is applied before the count because Vision may return
#   decomposed forms and a decomposed string has MORE code points than its
#   composed equal: 29 decomposed e-acute is 58 raw and 29 after NFC.
#
# ⚠ A4 — THESE PATTERNS ARE NOT #40's. Measured with the research's own
# patterns, 167 of 3,748 (4.5%) fell below the threshold against the ticket's
# 173 (5%). The SHAPE is confirmed; the exact number will differ with any
# pattern set, so 173 is APPROXIMATE and no gate may pin it.
# ---------------------------------------------------------------------------

CLEAN_MIN_CHARS = 30

# ---- the clock and battery rules are HEAD-ONLY (owner ruling 2026-08-14) ----
#
# ⚠ THESE TWO WERE TAKING FAR MORE OF HER WORDS THAN OF THE SCREEN. Measured
# over all 13,453 of her readings:
#
#   clock    9,250 matches, 70% of them past the first 60 characters. The
#            sampled mid-text ones are her WORK SHIFT TIMES —
#            "10:45a Unavail 1:00p-10:00p 5:00a-2:00p" — shredded into
#            fragments by a rule meant for a status bar.
#   battery  1,369 matches, 44% past the first 60 characters: "20% off
#            Everything Else", "蛋白质含量80%-90%", "椰子油60%+棕榈油20%".
#
# CR-03 dropped both AFFORDANCE rule-lists for the same reason and recorded
# these two as an open question for the owner rather than settling them. She
# settled it: strip them at the START OF A SCREEN and nowhere else.
#
# ⚠ 60 IS MEASURED, NOT CHOSEN. Against the independent signal of a
# carrier/wifi label sitting within 45 characters of the match — rules that
# were never in question — a 60-character head catches 96.6% of confirmed
# clock bars and 85.9% of confirmed battery bars, while leaving 6,495 clock
# and 599 battery matches in the body of her notes alone. Wider buys almost
# nothing (90 chars: 97.5% / 86.3%) and costs more of her words.
#
# ⚠ WHY A HEAD WINDOW WORKS HERE AND A LINE ANCHOR DOES NOT. 0 of 13,453
# readings contains a newline, so there are no lines to anchor to — an
# earlier proposal to anchor at the first/last LINE was measured as a no-op.
# A screenshot has ONE status bar and it is at the top, so the top of the
# reading is the honest place to look.
#
# ⚠ THIS IS NOT A CLAIM THAT ALL CHROME IS CAUGHT. A bar further into a
# reading survives, and that is the trade she took: she would rather read a
# stray "88%" than lose an afternoon's shift times.
CHROME_HEAD_CHARS = 60
_HEAD_ONLY_RULES = frozenset(("clock", "battery"))

# Tunable data beside the function, the SCREEN_RESOLUTIONS shape. Each row is
# (name, pattern) so a failure — or a future tuning session — can name which
# rule ate which words instead of pointing at an index.
_CHROME_RULES = (
    # the status-bar clock, 12- or 24-hour, with or without seconds and an
    # am/pm marker. The look-around keeps it off a version string like 26.5.1
    # and off a longer digit run.
    ("clock", r"(?<![\d:])\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?"
              r"(?![\d:])"),
    # the battery reading
    ("battery", r"(?<!\d)\d{1,3}\s?%"),
    # the radio label
    ("radio", r"\b(?:LTE|VoLTE|5G|4G|3G|Wi-?Fi|WIFI)\b"),
    # its Chinese equivalents
    ("carrier_zh", r"中国移动|中国联通|中国电信|无线局域网"),
    # battery/signal/status glyphs: arrows, technical, geometric shapes,
    # miscellaneous symbols, and the private-use area vendor icons live in
    # ⚠ WRITTEN AS ESCAPES, NEVER AS LITERAL GLYPHS. A character class
    # of invisible symbols is unreadable in a diff, and one stray edit
    # inside it would be undetectable by eye.
    ("glyphs", "[\\u2190-\\u21ff\\u2300-\\u23ff\\u25a0-\\u25ff"
               "\\u2b00-\\u2bff\\ue000-\\uf8ff]"),
    # ⚠⚠ THE BAR AFFORDANCES ARE GONE, AND THEY ARE NOT COMING BACK AS A
    # SHORTER LIST. (CR-03, 2026-08-14.)
    #
    # This file already stated the right principle one comment above where it
    # used to sit — "every word added here is a word that stops reaching her
    # notes, so words that carry meaning in ordinary prose (Search, Share,
    # Settings) are left in on purpose" — and then shipped
    #     ("affordance",    r"\b(?:Cancel|Done|Back|Edit|More|Menu)\b"),
    #     ("affordance_zh", r"取消|完成|返回|编辑|更多"),
    # anyway. Every one of those eleven tokens IS a word that carries meaning
    # in ordinary prose. The principle was correct and the list contradicted
    # it; the list is what changed.
    #
    # ⚠ MEASURED, NOT ARGUED. Over her own library, 3,067 minted notes
    # reproduced byte-for-byte from vision/<id>.json, these two rules had
    # deleted 1,789 characters out of 506 notes (16.50%). Per token, by
    # occurrence in the notes' own OCR text:
    #     Back 62 · More 76 · Edit 36 · Menu 35 · Done 14 · Cancel 7
    #     更多 123 · 编辑 122 · 完成 102 · 返回 58 · 取消 18
    # Not one token was clean, which is why no surviving subset was chosen.
    # Examples, all hers: `Black Coffee with More So` (a menu board) ·
    # `30-Day Money-Back Guarantee` · `Edit-Test loops` ·
    # `节目组想完成一位过世老人的遗愿` · `吸引更多人想和你做朋友` ·
    # `轻触此处来返回通话`.
    #
    # ⚠ AND CHINESE CANNOT BE FENCED THIS WAY AT ALL. There is no `\b` in
    # Chinese, so 编辑 fired INSIDE 编辑器 ("editor") and left a bare 器. An
    # English token at least had a word boundary to hide behind. This phase
    # exists because 87% of her Chinese was destroyed once, and 完成 / 更多 are
    # among the most common words in ordinary written Chinese.
    #
    # ⚠ LAW 4 HAS NO SIZE THRESHOLD, AND THAT IS THE WHOLE RULING HERE.
    # Leaving a piece of chrome IN is a lesser harm than deleting one of her
    # words — a surviving bar label is visible, legible as chrome, and costs
    # her a glance; a deleted word is silent and gone. The trade is recorded
    # as a VALUE in tests/fixtures/screenshot_notes/clean_cases.json, where
    # `pure_chrome_only` now cleans to "Done" instead of "".
    #
    # ⚠ WHAT WAS REJECTED, AND ON WHAT EVIDENCE. The review proposed anchoring
    # these rules to the FIRST AND LAST LINE of the OCR text. Measured over all
    # 13,453 entries of her vision cache, ZERO contain a newline — macOS Vision
    # returns the text without line breaks — so `text.split("\n")` yields one
    # element, the index set collapses to (0,), and the whole string is
    # stripped exactly as before. That change is a no-op on her data that
    # looks like a fix, which is worse than no fix. A character-offset window
    # was measured too and also refused: 42.4% of `clock` matches and 48.7% of
    # `battery` matches fall in the MIDDLE of the string, because the reader
    # concatenates several screens' worth of bar into one line — so a head/tail
    # window would keep genuine chrome and still not protect her `90%` Steam
    # review scores or her `AHA 30% • BHA 2%` product labels. `clock` and
    # `battery` are therefore LEFT EXACTLY AS THEY ARE and recorded as an open
    # question for the owner; they are not this fix's to settle.
)
SCREEN_CHROME_PATTERNS = tuple(
    (name, re.compile(pattern, re.IGNORECASE if name == "radio" else 0))
    for name, pattern in _CHROME_RULES)
_WHITESPACE_RE = re.compile(r"\s+")

# ⚠⚠ A FROZEN HISTORICAL ARTEFACT. NOT A RULE SET. NEVER STRIP WITH THIS.
#
# These are the two rules exactly as they shipped before CR-03, kept for ONE
# purpose: `repair_notes` has to be able to reproduce what the buggy pass
# actually wrote, so it can tell a note it may safely rewrite from a note
# somebody has touched since. Recognising the old output is the entire
# safety property of the repair, and it cannot be recovered later — once the
# notes are rewritten there is nothing left to compare against.
#
# It is spelled out here rather than reconstructed from git history because a
# repair that reads its own safety predicate out of a version-control log is a
# repair nobody can test. Nothing but `_strip_chrome_as_minted` may read it,
# and `strip_chrome` must never grow a branch that reaches it.
_CHROME_RULES_BEFORE_CR03 = _CHROME_RULES + (
    ("affordance", r"\b(?:Cancel|Done|Back|Edit|More|Menu)\b"),
    ("affordance_zh", r"取消|完成|返回|编辑|更多"),
)
_SCREEN_CHROME_PATTERNS_BEFORE_CR03 = tuple(
    (name, re.compile(pattern, re.IGNORECASE if name == "radio" else 0))
    for name, pattern in _CHROME_RULES_BEFORE_CR03)


def strip_chrome(text) -> str:
    """The words on a screenshot with the SCREEN's own furniture removed.

    Regular expressions only, applied in `SCREEN_CHROME_PATTERNS` order, then
    whitespace collapsed to single spaces and the result stripped. A non-str
    reads as the empty string rather than raising — fail-closed, so a caller
    joining rows can never turn a missing reading into prose.

    Pure: no wall-clock, no locale, no filesystem reads. (The sentence is
    `detect_screenshot`'s, verbatim, because it is the same contract: a note's
    text must not depend on WHEN or WHERE it was written.)"""
    if not isinstance(text, str):
        return ""
    for name, pattern in SCREEN_CHROME_PATTERNS:
        if name in _HEAD_ONLY_RULES:
            # ⚠ THE HEAD ONLY, ON HER RULING OF 2026-08-14. See the constant.
            head = pattern.sub(" ", text[:CHROME_HEAD_CHARS])
            text = head + text[CHROME_HEAD_CHARS:]
            continue
        text = pattern.sub(" ", text)
    return _WHITESPACE_RE.sub(" ", text).strip()


def _ocr_text(row):
    """The text out of an OCR row, or None when there is none to have.

    Accepts the row shape the reader emits OR a bare string. ⚠ AN `error` KEY
    BEATS ANY TEXT BESIDE IT: the error is the program's own verdict on the
    read, and text alongside it is whatever was salvaged before the failure —
    putting that into her library as prose is exactly the failure D-09's
    fail-closed property is for."""
    if isinstance(row, str):
        return row
    if isinstance(row, dict):
        if row.get("error"):
            return None
        text = row.get("text")
        return text if isinstance(text, str) else None
    return None


def clean_ok(row) -> bool:
    """True iff this reading is worth a note: at least CLEAN_MIN_CHARS
    UNICODE CODE POINTS over the NFC-normalised, chrome-stripped, stripped
    string.

    A False here means NO NOTE AT ALL. The picture stays an item of
    `type: "image"`, keeps its `screenshots` tag, and is not moved to
    `attachments/` — D-09's "the picture is all there is".

    ⚠ PER SHOT, NEVER PER GROUP. In a five-shot burst where two clean and
    three do not, the note carries the two and the three stay pictures. #40
    does not settle this; resolving it per shot keeps the failure local and
    keeps the leftovers legible as what they are.

    Pure: no wall-clock, no locale, no filesystem reads."""
    text = _ocr_text(row)
    if text is None:
        return False
    cleaned = unicodedata.normalize("NFC", strip_chrome(text)).strip()
    return len(cleaned) >= CLEAN_MIN_CHARS


# ---------------------------------------------------------------------------
# ---- burst grouping: several screenshots are often ONE note (26.94-05, D-08)
#
# 19% of her screenshots — 700 of 3,748, in 247 groups — are a scroll of one
# page rather than several things. The rule below joins them.
#
# ⚠⚠ THE TIME WINDOW IS THE RULE; THE SIMILARITY IS THE RAIL. Say it out loud
# because the shape of the code invites the opposite reading. THE WINDOW SWEEP
# (groups produced over the 3,748):
#
#     10 s -> 190   15 s -> 230   [20 s -> 246]   30 s -> 265   60 s -> 292
#
# W = 20,000 ms because it reproduces the ticket's count (246 against its 247)
# and because it is the LARGEST window that still excludes the one documented
# false group. THE THRESHOLD SWEEP (links cut by T at W = 20 s, out of 496):
#
#     0.00 -> 0   [0.50 -> 4 (0.8%)]   0.60 -> 16   0.70 -> 51 (10.3%)
#     0.80 -> 131 (26.4%)
#
# T = 0.50 because it sits at roughly the 3rd percentile of true-burst
# similarity and cuts 4 links in 496 — it removes only pairs that are unlike
# by any standard, so it FAILS TOWARD MERGING, which is D-08's ruling: a wrong
# merge is visible and splittable, a wrong split is invisible. T = 0.70 would
# cut 10% of real bursts and is a fail-toward-SPLITTING threshold in disguise.
#
# ⚠ THE HONEST SENTENCE, NOT SOFTENED: at a merge-favouring threshold the
# similarity gate is NEARLY INERT. Random pairs sit at cosine p50 0.626,
# comfortably above 0.50, so T rejects almost nothing the clock let through.
# It is a cheap principled floor that stops a black screen riding a
# three-second gap next to a photograph — a RAIL. It is not the thing that
# makes grouping correct.
#
# ⚠⚠ THE NAMED REGRESSION CASE, AND WHY NO THRESHOLD COULD HAVE SAVED IT.
# #40's one documented false group is `WRNS Studio` then `BccI Construction`,
# 27 s apart at cosine 0.872. The p50 cosine of TRUE consecutive bursts is
# 0.888 — so 0.872 is essentially the median of the thing the rule is trying
# to keep. A threshold high enough to cut this pair would cut more than half
# of every real burst. Only the clock excludes it (27 > 20; at W = 30 s it
# merges). The pair is reproduced at those two numbers in
# tests/fixtures/screenshot_notes/burst_cases.json.
#
# ⚠ ASSUMPTION A5, RECORDED AND NOT DISCHARGED: NO PRECISION OR RECALL EXISTS
# FOR THIS RULE AND NONE CAN BE PRODUCED FROM EXISTING DATA. The 247 groups
# are a rule's OUTPUT, not labels, so validating against them is circular. The
# owner's manual read of six sampled groups (five correct, one wrong) is the
# only ground truth and it is not recorded per item anywhere reachable. No
# document, comment or test in this repo may claim a measured precision or
# recall for burst grouping. The safety net is the split affordance, not a
# figure.
# ---------------------------------------------------------------------------

# Tunable data beside the function, the SCREEN_RESOLUTIONS shape. Both numbers
# came out of the sweeps above; neither was chosen to look discriminating.
BURST_WINDOW_MS = 20_000
BURST_COS_FLOOR = 0.50


def cosine_from_distance(d) -> float:
    """The cosine two feature prints have, given the DISTANCE between them.

        cos(a, b) = 1 - d^2 / 2

    [CITED: the identity for L2-normalised vectors — |a-b|^2 = 2 - 2(a.b).]
    VERIFIED on this library rather than assumed: the prints are L2-normalised
    (median norm 1.0001, min 0.9994, max 1.0013 over 200 vectors), and on a
    real pair the directly computed cosine was 0.7829 against 1 - d^2/2 =
    0.7822, the gap being float32 rounding inside Vision's own arithmetic.

    ⚠⚠ `1 - distance` IS THE WRONG FORM, and it is wrong in the worst way:
    plausible-looking, silent, and directionally correct. `computeDistance`
    on VNGenerateImageFeaturePrintRequest returns a DISTANCE, so inverting it
    linearly compresses exactly the range that separates a burst from a pair
    of unrelated pictures — at the measured burst p50 distance of 0.471 the
    two forms differ by 0.36, which is most of the useful scale.

    Computed in float64 from float32 inputs, with NO rounding step before the
    comparison against BURST_COS_FLOOR: a `round(x, 2)` anywhere in this path
    would promote 0.4999 to 0.50 and merge a pair the rule says to split.
    Pure: no wall-clock, no locale, no filesystem reads."""
    d = float(d)
    return 1.0 - d * d / 2.0


def _as_vector(v):
    """One feature print as a tuple of floats, from either shape it arrives
    in: the 3,072 RAW bytes the cache stores (768 little-endian float32), or
    an already-unpacked sequence. Raises on anything else — the caller
    catches, so that one malformed row splits a pair rather than stopping a
    pass over thirteen thousand pictures."""
    if isinstance(v, (bytes, bytearray, memoryview)):
        raw = bytes(v)
        if len(raw) % 4:
            raise ValueError("a feature print is a whole number of float32s")
        return struct.unpack("<" + str(len(raw) // 4) + "f", raw)
    return tuple(float(x) for x in v)


def print_cosine(a, b) -> float:
    """The cosine of two feature prints, as a DOT PRODUCT in float64.

    ⚠ A PLAIN DOT PRODUCT IS THE COSINE HERE, and that is a measured property
    of this data rather than an assumption: the prints come back L2-normalised
    (median norm 1.0001). A caller holding a DISTANCE instead of the vectors
    uses `cosine_from_distance`, which is the same quantity by the identity
    recorded there.

    Raises on unusable input (mismatched lengths, a wrong type) rather than
    returning a number that would silently be compared against the floor.
    Pure: no wall-clock, no locale, no filesystem reads."""
    va, vb = _as_vector(a), _as_vector(b)
    if len(va) != len(vb) or not va:
        raise ValueError("two feature prints of different lengths are not "
                         "comparable")
    return math.fsum(x * y for x, y in zip(va, vb))


def group_bursts(items, prints):
    """The screenshots that belong to one note, grouped.

    Two screenshots join the same note iff their `created_ms` differ by
    <= BURST_WINDOW_MS **AND** the cosine of their feature prints is
    >= BURST_COS_FLOOR. Grouping is TRANSITIVE along consecutive pairs, which
    is what makes a long scroll one note rather than a chain of pairs: three
    shots at 12 s then 13 s share a note although the first and last are 25 s
    apart.

    `items` is any iterable of rows carrying `id` and `created_ms`; `prints`
    maps an item id to its feature print (raw bytes or a float sequence).
    Returns a list of groups, each a list of ids, ORDERED ascending by
    `created_ms` with ties broken lexicographically on id — so the answer is
    stable across runs and independent of the order the items arrived in.

    ⚠ A MISSING OR MALFORMED PRINT SPLITS, which is the ONE place this rule
    fails toward splitting and it is deliberate. D-08's "fail toward merging"
    is about UNCERTAIN evidence; a missing print is not uncertain evidence, it
    is a picture nobody read — and `redetect_screenshots`' counted fingerprint
    gate refuses the whole pass before this function can see one. Reaching
    that branch means an invariant already broke, and merging two photographs
    on the strength of a vector nobody has is worse than leaving them apart.
    It never raises: one bad row must not stop a pass over thirteen thousand
    pictures.

    Zero screenshots is zero groups. One screenshot is one group of one — and
    it needs no print, because there is no pair to judge.

    Pure: no wall-clock, no locale, no filesystem reads."""
    rows = []
    for item in items or ():
        if not isinstance(item, dict):
            continue
        rows.append((int(item.get("created_ms") or 0), str(item.get("id"))))
    rows.sort()
    groups = []
    for index, (created_ms, item_id) in enumerate(rows):
        if index == 0:
            groups.append([item_id])
            continue
        prev_ms, prev_id = rows[index - 1]
        linked = (created_ms - prev_ms) <= BURST_WINDOW_MS
        if linked:
            try:
                linked = print_cosine(prints[prev_id],
                                      prints[item_id]) >= BURST_COS_FLOOR
            except (KeyError, TypeError, ValueError, struct.error):
                linked = False
        if linked:
            groups[-1].append(item_id)
        else:
            groups.append([item_id])
    return groups


# ---------------------------------------------------------------------------
# ---- the note pass: who may become a note, and how one leaves the store ---
# (26.94-07, D-06/D-08/D-09/D-14)
#
# ⚠⚠ THIS BLOCK CONTAINS THE FIRST ITEM-REMOVAL PATH THIS CODEBASE HAS EVER
# HAD, and that is the largest piece of unprecedented surface in the phase.
# D-14 is the owner's ruling and it is Shape 1: the screenshot ITSELF becomes
# the note. Its `type` goes image -> text, its `library_path` repoints at a
# newly written items/<id>.md, and the original .jpeg moves to
# attachments/<id>/. `id`, `state`, `history` and `created_ms` survive
# untouched — which is what makes D-09's "a note inherits the screenshot's
# state" FREE AND UNFALSIFIABLE rather than a copy that can drift, and what
# stops #40 D-10's warning biting: a blessed screenshot's note must not
# quietly demote itself back into the unjudged pile and ask her to judge it
# twice.
#
# The cost is arithmetic: a burst of five shots collapses to ONE item, so four
# must leave the store. Before this block there was no way to do that, and
# `grep -nE 'del\s+store\["items"\]'` over this file returned — and must go on
# returning — nothing. A bare delete would take `history` with it, and history
# is her judgement record.
#
# ⚠ REMOVAL REACHES TWO FILES BEYOND THE STORE, AND THEY ARE NOT PARALLEL.
# Both are keyed by item id, and the difference is LIFETIME, not tidiness:
#
#   * decorations.json is a library-root SIBLING in the IRREPLACEABLE tier,
#     and the block above `decorations_file_path` says so in as many words —
#     "DO NOT MOVE THIS FILE FOR CONSISTENCY WITH blessings.json. The
#     inconsistency is deliberate and is the feature."
#   * blessings.json resolves INSIDE librarian/, so it shares that folder's
#     documented FACTORY-RESET lifetime (rm -rf librarian/), and
#     `load_blessings` FAILS OPEN to an empty wrapper.
#
# THE ANSWER HERE IS TO REFUSE RATHER THAN TO MUTATE. Nothing in this block
# writes either file. A screenshot that is blessed, or that sits on a notebook
# page, is excluded from the pass up front by `note_pass_candidates` and
# refused again by `retire_merged_item` as a backstop — which removes the
# multi-file mutation, and with it Pitfall 8's orphaned reference, entirely.
# ---------------------------------------------------------------------------


class MergeRefused(Exception):
    """`retire_merged_item` was asked to remove an item it must not remove.

    A refusal, never a mutation: the store is exactly as it was. It is raised
    rather than returned because it can only be reached when a caller has
    already skipped `note_pass_candidates`' own exclusions — i.e. when an
    invariant has broken, and the pass must stop rather than quietly do
    something smaller than it was asked to."""


def blessed_ledger_ids(library_root) -> frozenset:
    """Every item id named in librarian/blessings.json. FAIL-OPEN.

    ⚠ HALF OF A PREDICATE, NEVER A PREDICATE ON ITS OWN — see `is_blessed`.
    This reads a file inside librarian/, which `rm -rf` is the documented
    factory reset for, and `load_blessings` returns the empty wrapper for a
    missing file without raising. So an empty answer here means EITHER "she
    has blessed nothing" OR "the librarian was reset", and the two are
    indistinguishable from this side. That ambiguity is exactly why nothing
    keys a refusal on this answer alone."""
    ids = set()
    for entry in (load_blessings(library_root).get("blessings") or ()):
        if isinstance(entry, dict) and entry.get("item_id"):
            ids.add(str(entry["item_id"]))
    return frozenset(ids)


def placed_item_ids(library_root) -> frozenset:
    """Every item id a decoration points at — `days[*]["items"][*]["ref"]`.

    ⚠ PITFALL 8, ENUMERATED BEFORE THE RUN RATHER THAN DISCOVERED AFTER IT.
    `pickPickerImages` is one-way by its own comment (core.js:500-504): "from
    here on every stored image reference re-resolves through the fence on
    every render, and a narrower picker would orphan already-placed pictures
    pointing at items it can no longer reach." A screenshot she has already
    pasted onto a notebook page therefore becomes an ORPHANED REFERENCE the
    moment its `type` flips. The cheapest safe answer is to leave those
    screenshots alone and say how many there were, which is what the pass
    does.

    FAIL-OPEN through `load_decorations`, which never raises: a missing or
    hand-edited file reads as no placements. That is the shipped posture and
    it is safe HERE because an empty answer only ever makes the pass do MORE
    work on pictures nobody placed — the store's own `type` and `state` are
    what actually gate the flip."""
    refs = set()
    for page in (load_decorations(library_root).get("days") or {}).values():
        if not isinstance(page, dict):
            continue
        for entry in (page.get("items") or ()):
            if isinstance(entry, dict) and isinstance(entry.get("ref"), str):
                if entry["ref"]:
                    refs.add(entry["ref"])
    return frozenset(refs)


def is_blessed(item, blessed_file_ids) -> bool:
    """True iff she has welcomed this item — the UNION of two predicates.

        state == "blessed"   OR   id in blessings.json

    ⚠⚠ IT IS A UNION AND NOT A LOOKUP, AND D-14 RECORDS WHY, MEASURED AGAINST
    HER REAL STORE RATHER THAN REASONED ABOUT. Two reasons, and either half
    alone is a trap:

    1. THE TWO PREDICATES GENUINELY DIVERGE IN HER DATA. blessings.json holds
       six entries and NOT ONE of them is a photograph, while TWO items
       carrying the `screenshots` tag have `state == "blessed"` and appear in
       neither file; one ledger entry names an item whose state is not
       "blessed" at all. A file-keyed refusal therefore lets state-blessed
       screenshots through the flip — and `pickAlbumItems` (core.js:467-473)
       filters `state === 'blessed' && it.type === 'image'`, so a flipped one
       LEAVES HER ALBUM WITHOUT A WORD. That silent loss is the exact class
       #40 D-10 and D-14 exist to prevent.

    2. `load_blessings` FAILS OPEN AND THE FILE LIVES INSIDE librarian/. The
       documented factory reset is `rm -rf librarian/`, after which a
       file-keyed refusal reads an empty wrapper, protects nothing, and still
       reports success. The `state` half survives the reset because it lives
       in items.json.

    ⚠ ONE DEFINITION, TWO CALL SITES, NEVER RE-DERIVED: `note_pass_candidates`
    uses it as its filter and `retire_merged_item` uses it as its refusal. A
    second idea of "blessed" would be a second thing to drift, and the drift
    is silent by construction.

    ⚠ THE COUNT IS DERIVED AT RUN TIME AND PINNED NOWHERE. No gate in this
    codebase compares the number of blessed screenshots against a constant: it
    is a fact about her library on the day the pass runs, and the halves
    disagreeing is the EXPECTED observation, never a fault to reconcile.

    Pure: no wall-clock, no locale, no filesystem reads — the ledger is read
    once by the caller, through `blessed_ledger_ids`."""
    if not isinstance(item, dict):
        return False
    if item.get("state") == "blessed":
        return True
    return str(item.get("id")) in (blessed_file_ids or ())


def merge_refusal_why(store, retired_id, blessed_ids, placed_ids):
    """Why this item must not be merged away, or None if it may be.

    ⚠ CR-04. THE PREDICATE LIVES HERE SO IT CAN BE ASKED **BEFORE** ANY FILE
    IS WRITTEN, and `retire_merged_item` raises out of this same function
    rather than carrying a second copy of the test. A copied fence is the
    defect this codebase keeps finding in itself: two spellings of one rule
    drift, and the one that drifts is the one nobody reads.

    Asking is free and mutates nothing, which is the whole point — the refusal
    used to be discoverable only by attempting the removal, and by then the
    note and the attachment copies were already on disk."""
    retired = (store.get("items") or {}).get(retired_id)
    if retired is None:
        return None                       # already retired — a no-op
    if is_blessed(retired, blessed_ids):
        return ("a blessed screenshot is never merged away — it would leave "
                "the album with nothing said about it")
    if str(retired_id) in (placed_ids or ()):
        return ("a screenshot already placed on a notebook page is never "
                "merged away — the page's picture would point at an item "
                "that is gone")
    return None


def retire_merged_item(store, retired_id, survivor_id,
                       blessed_ids, placed_ids) -> dict:
    """Remove one burst member from the store, KEEPING ITS WHOLE RECORD.

    ⚠ THIS IS THE FIRST ITEM-REMOVAL PATH IN THIS CODEBASE, and it is written
    the long way round on purpose. A five-shot burst becomes one note, so four
    items have to leave `store["items"]` — and the obvious way to do that, a
    bare delete of the store entry, would take `history` with it. ⚠ THAT
    PHRASE IS DELIBERATELY NOT SPELLED AS CODE HERE: the acceptance grep for
    this plan is a RAW `grep -nE` over this file, and prose is not exempt from
    it (26.94-02 hit the mirror image of this, where docstring prose tripped a
    comment-stripped grep). History is the
    record of every judgement she has made about that picture; the store's own
    header calls the judgements sacred and `load_store` refuses to
    reinitialise over them for the same reason. So the retired item's whole
    record travels into the survivor's `merged_from` list FIRST, and the
    survivor is the only place it can be found afterwards.

    `merged_from` carries `id`, `created_ms`, `state`, `title`, the PRE-MOVE
    `library_path` and the full `history` list — the pre-move path because
    that is the name the file had when she last saw it, and 26.94-01's
    rollback removes new files BY SET DIFFERENCE against the restored store's
    paths rather than by a clock.

    ⚠ TWO REFUSALS, AND THE REASON FOR EACH IS AT THE SITE. Removal reaches
    two files beyond the store — blessings.json and decorations.json, both
    keyed by item id — and this function REFUSES rather than mutating two more
    files under two more locks:

      * `is_blessed` — the UNION, see above. Flipping a blessed screenshot
        would remove it from her album in silence.
      * a PLACEMENT — Pitfall 8. A screenshot already on a notebook page
        becomes an orphaned reference the moment its type flips, because the
        picker pool is one-way by its own comment.

    `note_pass_candidates` applies both exclusions up front, so reaching a
    refusal here means an invariant already broke: it raises `MergeRefused`
    and mutates NOTHING, not even the survivor's `merged_from`.

    Idempotent: an id already retired is simply not in `store["items"]`, and
    the call returns the store unchanged rather than appending a second
    record for it.

    ⚠ NO LOCK AND NO FILE WRITE — the `migrate_store` contract in its own
    words. It mutates the dict it was handed and returns it; the caller owns
    the WRITE_LOCK, the backup and `save_store`."""
    items = store.get("items") or {}
    retired = items.get(retired_id)
    if retired is None:
        return store                      # already retired — a no-op
    why = merge_refusal_why(store, retired_id, blessed_ids, placed_ids)
    if why is not None:
        raise MergeRefused(why)
    survivor = items.get(survivor_id)
    if survivor is None:
        raise MergeRefused(
            "the surviving note is not in the store, so there is nowhere to "
            "keep the retired item's record")
    record = {
        "id": str(retired.get("id")),
        "created_ms": retired.get("created_ms"),
        "state": retired.get("state"),
        "title": retired.get("title"),
        "library_path": retired.get("library_path"),
        "history": list(retired.get("history") or []),
    }
    merged = survivor.setdefault("merged_from", [])
    if not any(isinstance(r, dict) and r.get("id") == record["id"]
               for r in merged):
        merged.append(record)
    # ⚠ THE REMOVAL IS LAST AND IT IS NEVER A BARE `del`: the record is
    # already inside the survivor by the time this line runs, so an
    # interruption between the two leaves a duplicate record and never a lost
    # one. `pop` rather than `del` so the source instrument in
    # tests/test_screenshot_notes.py can assert the bare form appears nowhere.
    items.pop(retired_id, None)
    return store


def _judgement_rank(item, blessed_ids) -> int:
    """How much of HER is on this item — the survivor ranking for #58 ruling
    3. Higher wins.

    ⚠ THE ORDER IS THE RULING, not a preference. The survivor is the item the
    PERSON judged, because the fork's whole harm was that her judgement
    stranded on the copy the room stopped surfacing. `blessed` sits at the top
    because it is the judgement the folded-title inheritance never carried —
    the 24 stranded blessings this ticket measured are all in this band — and
    because `merge_refusal_why` refuses to retire a blessed item anyway, so
    keeping it as the survivor is the only direction the shipped machinery
    permits as well as the truthful one.

    Below that: the protective states (`never_show` / `retired`), then
    `resting` (blessed-but-sleeping is still a judgement she made), then
    merely having opened it, then nothing. Pure."""
    if is_blessed(item, blessed_ids):
        return 4
    state = item.get("state")
    if state in ("never_show", "retired"):
        return 3
    if state == "resting":
        return 2
    if item.get("last_opened_ms"):
        return 1
    return 0


def heal_origin_doubles(store, library_root) -> dict:
    """Join every origin path that already holds more than one item, keeping
    the copy the person judged (#58 ruling 3). Returns {'joined', 'refused'}.

    Mutates `store` in place; takes no lock and writes no file of its own —
    the `retire_merged_item` contract, whose caller owns the save.

    ⚠ NO NEW MERGE MACHINERY, and that is a ruling rather than a shortcut.
    `retire_merged_item` already folds the whole retired record into the
    survivor's `merged_from` BEFORE removing anything, and already raises
    `MergeRefused` rather than retire something blessed or something already
    placed on a notebook page. Those refusals are what make "the judged copy
    survives" the only direction the tree permits — the truthful answer and
    the one that does not fight the existing refusal are the same answer. A
    refusal here is COUNTED and the double is left alone; it is not an error,
    and the next import will try again and refuse again, idempotently.

    ⚠ THE LOSER'S SNAPSHOT FILE IS NOT DELETED. `retire_merged_item` writes no
    files by design, and 26.94-01's rollback removes new files by SET
    DIFFERENCE against a restored store's paths — a deletion here would be a
    file the rollback could never put back. An orphaned snapshot under items/
    costs disk and nothing else.

    Deterministic: paths in sorted order, ids sorted, ties broken by earliest
    `imported_ms` then by id, so two runs over the same store make the same
    choices."""
    items = store.get("items") or {}
    groups = {}
    for item in items.values():
        if not isinstance(item, dict):
            continue
        origin = item.get("origin_path")
        item_id = item.get("id")
        if isinstance(origin, str) and origin and item_id is not None:
            groups.setdefault(origin, []).append(str(item_id))
    doubled = {o: ids for o, ids in groups.items() if len(ids) > 1}
    report = {"joined": 0, "refused": 0}
    if not doubled:
        return report        # the common case reads neither ledger at all
    blessed_ids = blessed_ledger_ids(library_root)
    placed_ids = placed_item_ids(library_root)
    for origin in sorted(doubled):
        ids = sorted(doubled[origin])
        ids.sort(key=lambda i: (-_judgement_rank(items[i], blessed_ids),
                                items[i].get("imported_ms") or 0, i))
        survivor_id = ids[0]
        for loser_id in ids[1:]:
            try:
                retire_merged_item(store, loser_id, survivor_id,
                                   blessed_ids, placed_ids)
            except MergeRefused:
                report["refused"] += 1
                continue
            report["joined"] += 1
    return report


def note_pass_candidates(store, library_root):
    """(candidates, report) — the screenshots that MAY become notes.

    `candidates` is a list of item ids, ascending. `report` counts every
    exclusion BY REASON, because the difference between three screenshots
    skipped and three hundred is the difference between a rounding error and
    a defect, and a pass that says only "3,083 notes written" cannot tell
    them apart:

        {screenshots, already_text, fenced, placed, blessed,
         blessed_by_state, blessed_by_file, blessed_by_both,
         unreachable, eligible}

    They SUM: `screenshots == already_text + fenced + placed + blessed +
    unreachable + eligible`, asserted in the suite rather than commented, so
    a reason that silently swallowed items would show up as arithmetic.

    THE ORDER OF THE STEPS IS LOAD-BEARING, `vision_path_list`'s discipline:

      1. the `screenshots` tag — the population. Re-derived by
         `redetect_screenshots`, which is DOWNSTREAM of the Vision pass.
      2. `type == "image"` — an already-flipped item is no longer a
         photograph, which is what makes a second pass a no-op (SRM-11).
      3. the FENCE, `_librarian_fenced`, CALLED and never copied. A fenced
         screenshot yields zero notes, zero .md and zero files under
         attachments/ (V12) — the pass cannot act on evidence it refuses to
         gather.
      4. a PLACEMENT — Pitfall 8, enumerated from decorations.json BEFORE the
         run and counted out loud.
      5. `is_blessed` — the UNION, split three ways in the report so the
         divergence D-14 measured is visible rather than averaged away.
      6. REACHABLE — the snapshot must actually be in `vision_path_list`'s
         answer, which is where the jail (the resolved path must sit under
         <root>/items/) and the existence check live. A path that failed
         either is counted `unreachable` and never opened.

    ⚠ THE BLESSED COUNT IS DERIVED HERE AND COMPARED AGAINST NO CONSTANT. It
    travels into D-15's halt packet as three numbers — the state half, the
    file half, and their overlap — and a disagreement between them is the
    expected finding, not something to reconcile.

    Reads the store, the two ledgers and the snapshots' existence; writes
    nothing, takes no lock, never raises."""
    targets, _path_report = vision_path_list(store, library_root)
    reachable = {item_id for item_id, _p in targets}
    blessed_ids = blessed_ledger_ids(library_root)
    placed_ids = placed_item_ids(library_root)
    filters = (store.get("meta") or {}).get("filters") or []
    report = {"screenshots": 0, "already_text": 0, "fenced": 0, "placed": 0,
              "blessed": 0, "blessed_by_state": 0, "blessed_by_file": 0,
              "blessed_by_both": 0, "unreachable": 0, "eligible": 0}
    candidates = []
    for item in (store.get("items") or {}).values():
        if not isinstance(item, dict):
            continue
        if SCREENSHOT_TAG not in (item.get("tags") or ()):
            continue
        report["screenshots"] += 1
        item_id = str(item.get("id"))
        if item.get("type") != "image":
            report["already_text"] += 1
            continue
        if _librarian_fenced(item, filters):
            report["fenced"] += 1
            continue
        if item_id in placed_ids:
            report["placed"] += 1
            continue
        if is_blessed(item, blessed_ids):
            by_state = item.get("state") == "blessed"
            by_file = item_id in blessed_ids
            report["blessed"] += 1
            report["blessed_by_state"] += 1 if by_state else 0
            report["blessed_by_file"] += 1 if by_file else 0
            report["blessed_by_both"] += 1 if (by_state and by_file) else 0
            continue
        if item_id not in reachable:
            report["unreachable"] += 1
            continue
        candidates.append(item_id)
    candidates.sort()
    report["eligible"] = len(candidates)
    return candidates, report


def note_pass_gate(store, library_root, cache_reader, program_fp):
    """{ok, why, photographs, current, missing} — the COUNTED gate, stated by
    value, that stands in front of the whole note pass.

    ⚠ THIS IS WHAT MAKES D-10's ORDER BINDING RATHER THAN PROCEDURAL. The
    order is: fix the language configuration -> re-run Vision over all 13,606
    -> run the note pass ONCE. Running it on stale text would bake the
    language defect into roughly 3,575 notes she then reads as her own words.
    ⚠ AND NOTHING IN THE SHIPPED CODE ENFORCED THAT ORDER BEFORE THIS
    FUNCTION: `migrate_store` chains on SCHEMA VERSION, not on derivation, and
    would happily run a note pass over stale text at schema 3.

    The gate is `count(entries carrying the RUNNING program's fingerprint) ==
    count(non-fenced photographs)`, and it is `==` rather than "nearly all of
    them" on purpose. It also makes a future re-run correct by construction:
    change one character of the reading program and every entry goes stale at
    once, so the note pass refuses until Vision has run again.

    ⚠ PRESENCE IS NOT CURRENCY — `_vision_entry_is_current`, not a `is not
    None` check. A cache full of entries the OLD program wrote is a cache that
    looks complete.

    A refusal changes nothing at all. Reads the store and the cache; writes
    nothing, takes no lock, never raises."""
    targets, _report = vision_path_list(store, library_root)
    missing = 0
    for item_id, _path in targets:
        if not _vision_entry_is_current(cache_reader(item_id), program_fp):
            missing += 1
    gate = {"ok": not missing, "why": None, "photographs": len(targets),
            "current": len(targets) - missing, "missing": missing}
    if missing:
        gate["why"] = (
            str(missing) + " of " + str(len(targets)) + " photographs have "
            "no current Vision reading — the note pass would run on stale "
            "text")
    return gate


# ⚠ HER RULING, 2026-08-13, VERBATIM: `Nothing — a rule or a blank line`.
#
# 26.94-08's halt packet §6 escalated the section heading to her at its
# measured scale — 3,443 headings across 3,067 notes, and 2,983 of the 3,201
# groups are SINGLE SHOTS where a separator separates nothing. She chose this
# over keeping the hex item id (what 26.94-07 shipped) and over using the
# shot's own timestamp, on law 4's "verbatim & undecorated": a single-shot
# note should then carry no furniture at all.
#
# ⚠ THE RULE RATHER THAN THE BARE BLANK LINE, and this is the executor's pick
# inside the two her ruling allows, recorded rather than assumed. Her words
# are read off a SCREEN and already carry blank lines of their own, so a bare
# blank line between two shots is indistinguishable from a paragraph break
# inside one shot — and D-08 fails toward merging precisely because "a wrong
# merge is visible in the note and splittable". An invisible boundary takes
# that back, and the 18-shot scroll in her library becomes one wall. The rule
# renders as a single <hr>, which is the shape the room ALREADY uses for the
# quiet separator before a note's trailing pictures (app.js ATTACHMENT_SEP —
# "one soft rule, no caption, no chrome"), and it carries nobody's word.
#
# ⚠⚠ THE BLANK LINE ON EITHER SIDE IS LOAD-BEARING, NOT TIDINESS. Measured
# against the room's own renderer (vendor/marked.umd.js, 2026-08-14):
# `her last line\n---\n` renders as `<h2>her last line</h2>` — a SETEXT
# HEADING promoting the last line of HER words into a heading the machine
# invented out of her text, which is the exact thing her ruling forbids. With
# the blank lines it renders `<p>…</p><hr><p>…</p>`. Pinned by
# tests/test_screenshot_notes.py NoteShapeTest.
_NOTE_SHOT_SEPARATOR = "\n\n---\n\n"


def _note_section_bytes(store, library_root, cleaned):
    """The minted note's bytes: her shots' words, joined by one rule.

    ⚠ LAW 4, VERBATIM AND UNDECORATED, AND NOW IN ITS STRONGEST FORM. There is
    no title, no frontmatter, no summary, no rewording, no heading, no
    timestamp, no ordinal, no item id, and NO SENTENCE THE MACHINE INVENTED
    about what the note "is". A single-shot note is the shot's cleaned text
    and one closing newline — nothing at all beyond her own words. See the
    ruling recorded above the separator constant.

    ⚠ `from_source` IS NOT RENDERED. Every Apple-Photos item carries it and
    the room has never shown provenance anywhere; this must not become the
    first surface that does.

    UTF-8 out of the NFC-normalised cleaned text, so a Chinese character
    round-trips byte-identically from Vision through vision/<id>.json into
    items/<id>.md — which is the whole point of the phase."""
    texts = [text for _item_id, text in cleaned]
    return (_NOTE_SHOT_SEPARATOR.join(texts) + "\n").encode("utf-8")


def _move_snapshot_to_attachments(library_root, survivor_id, source_rel):
    """copy2 -> sha256 identity -> unlink. Returns the recorded relative path.

    ⚠ NOT `os.replace`, AND THE REASON IS THE ONLY REASON THAT MATTERS HERE. A
    rename is atomic and faster, but copy-verify-unlink FAILS TOWARD KEEPING
    THE ORIGINAL: if anything goes wrong the .jpeg is still in items/ and the
    store still points at it. The thing being moved is the only copy of one of
    her photographs, and §H-2's tier-2 backup exists precisely because this is
    the destructive half of the pass.

    The shape is the importer's, at `study_lib.py:1525-1544`, kept
    deliberately: `attachments/<id>/<basename>`, `mkdir(parents=True,
    exist_ok=True)`, `if not target.exists()` idempotence. ⚠ WHAT IS NEW IS
    THAT THE ATTACHMENT WAS AN ITEM — the importer's contract says attachments
    are "never cataloged as items", and D-14 is the ruling that this one used
    to be one.

    ⚠ THE UNLINK IS SEPARATE AND IS THE CALLER'S, ON PURPOSE: every member of
    a group is copied and verified BEFORE anything is written or unlinked, so
    a verification failure leaves the store, the note and the originals all
    untouched. Returns (rel, source_path) and raises nothing — a mismatch
    returns None so the caller can count it.
    """
    root = Path(library_root)
    source = root / source_rel
    rel = "attachments/" + str(survivor_id) + "/" + source.name
    target = root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        shutil.copy2(str(source), str(target))
    if (hashlib.sha256(target.read_bytes()).hexdigest()
            != hashlib.sha256(source.read_bytes()).hexdigest()):
        return None
    return rel


def mint_screenshot_note(store, library_root, group, cache_reader,
                         program_fp, blessed_ids=None, placed_ids=None):
    """One burst becomes ONE note — D-14 Shape 1, the owner's ruling.

    `group` is the item ids of one burst (`group_bursts`' output). The order
    it arrives in does not matter: the members are sorted here by ascending
    `created_ms` with a lexicographic id tie-break, so two runs over the same
    library produce byte-identical note bytes.

    THE STEPS, AND THE ORDER IS LOAD-BEARING:

      1. ⚠ THE FINGERPRINT REFUSAL, FIRST. Any member whose cache entry is
         missing or was written by a different program refuses the WHOLE
         group and changes nothing — dropping one member quietly would be a
         merge decision made on evidence nobody has.
      2. THE CLEAN, PER SHOT. In a five-shot burst where two clean and three
         do not, the note carries two sections and the three stay pictures
         keeping `type: "image"` and the `screenshots` tag. No cleaned member
         at all means NO NOTE: the picture is all there is (D-09).
      3. THE SURVIVOR is the FIRST CLEANED member by that order — first
         cleaned rather than merely first, because a shot with no note cannot
         be the note.
      4. COPY AND VERIFY every cleaned member's snapshot into
         `attachments/<survivor>/`. Nothing is written or unlinked until all
         of them have verified.
      5. WRITE `items/<survivor>.md` through `atomic_write_bytes`. ⚠ THE NAME
         IS ALWAYS SERVER-GENERATED FROM THE ITEM ID, NEVER DERIVED FROM OCR
         TEXT — the path-traversal fence at `study_lib.py:1309-1312`, which
         matters more here than at import because the content is text a
         machine read off a picture.
      6. THE FLIP: `type` image -> text, `library_path` -> items/<id>.md,
         the attachments recorded. ⚠ `id`, `state`, `history` and
         `created_ms` ARE NOT TOUCHED. That is what makes "a note inherits
         the screenshot's state" free and unfalsifiable, and it is why
         #40 D-10's warning cannot bite.
      7. THE RETIRE: every other cleaned member through `retire_merged_item`,
         which keeps its whole record in the survivor's `merged_from`.
      8. THE UNLINK, LAST, once the store no longer names the originals.

    ⚠ CR-04: STEP 4 IS NOW PRECEDED BY THE MERGE REFUSAL, asked through
    `merge_refusal_why` while nothing has been written yet. `blessed_ids` and
    `placed_ids` arrive from the caller so the whole pass answers from one
    reading of the two ledgers; passing None reads them here, which is a
    convenience for a single-group caller and not what the pass does.

    ⚠ THE TYPE FLIP IS THE WHOLE MECHANISM AND `core.js` NEEDS NO CHANGE.
    `pickAlbumItems` (core.js:468-469) and `pickPickerImages` (core.js:509-511)
    both key on `type === 'image'`, so an item whose type stops being 'image'
    leaves the album and the offer pool with nothing else done to it (D-06).

    Report: {ok, why, minted, sections, moved, retired, refused, no_note,
    move_failed, merge_refused, survivor}. `refused` is the fingerprint
    refusal and `merge_refused` is D-14's; they stay separate because one
    means the readings are stale and the other means she has welcomed or
    placed a picture, and those need different answers from whoever reads it.

    ⚠ NO LOCK AND NO STORE WRITE — the `migrate_store` contract. It mutates
    the dict it was handed and moves files; the caller owns the WRITE_LOCK and
    `save_store`, and takes them in tight blocks around load / mutate / save,
    never across the file moves."""
    report = {"ok": False, "why": None, "minted": 0, "sections": 0,
              "moved": 0, "retired": 0, "refused": 0, "no_note": 0,
              "move_failed": 0, "merge_refused": 0, "survivor": None}
    # ⚠ CR-04. THE LEDGERS ARE THE CALLER'S, READ ONCE FOR THE WHOLE PASS.
    # Reading them here, per group, gave a 3,201-group run 3,201 different
    # ideas of what "blessed" and "placed" meant — each at a different wall
    # clock from `note_pass_candidates`' single read, which is what selected
    # the population in the first place. A bless landing mid-run then reached
    # a refusal whose own docstring said it "means an invariant already
    # broke". It did not: it meant the pass had changed its mind halfway
    # through. Reading None here is the convenience for a single-group caller
    # and is NOT what the pass does.
    if blessed_ids is None:
        blessed_ids = blessed_ledger_ids(library_root)
    if placed_ids is None:
        placed_ids = placed_item_ids(library_root)
    items = store.get("items") or {}
    rows = []
    for item_id in (group or ()):
        item = items.get(item_id)
        if isinstance(item, dict):
            rows.append((int(item.get("created_ms") or 0), str(item_id)))
    rows.sort()
    if not rows:
        return report

    for _ms, item_id in rows:
        if not _vision_entry_is_current(cache_reader(item_id), program_fp):
            report["refused"] = len(rows)
            report["why"] = (
                "a photograph in this group has no current Vision reading — "
                "the note would carry text an older program produced")
            return report

    cleaned = []
    for _ms, item_id in rows:
        row = cache_reader(item_id)
        if clean_ok(row):
            text = unicodedata.normalize(
                "NFC", strip_chrome(_ocr_text(row))).strip()
            cleaned.append((item_id, text))
        else:
            report["no_note"] += 1
    if not cleaned:
        report["why"] = "no shot in this group cleaned — the picture is all "\
                        "there is"
        return report

    survivor_id = cleaned[0][0]
    report["survivor"] = survivor_id

    # ⚠⚠ CR-04. THE MERGE REFUSAL IS EVALUATED **BEFORE ANYTHING TOUCHES
    # DISK**, AND THAT ORDERING IS THE WHOLE FIX.
    #
    # It used to be discovered inside the retire loop — after every cleaned
    # member's snapshot had been copied into attachments/, after
    # items/<survivor>.md had been written, and after the survivor had been
    # flipped in memory. `MergeRefused` then travelled up through
    # `run_note_pass` and `run_note_pass_cli`, neither of which caught it, so
    # a one-way pass over her library died with a traceback and `save()` never
    # ran: the note and the attachment copies stayed on disk as ORPHANS that
    # no store row named, and every earlier group's mutations went with it.
    #
    # Asked here, a refusal costs nothing and leaves nothing behind. The
    # group is counted and skipped, the store is untouched, and not one byte
    # was written for it. A refusal is still a refusal — D-14 is right that a
    # blessed or placed screenshot must not be merged away — it just no longer
    # takes the run down to say so.
    for item_id, _text in cleaned[1:]:
        why = merge_refusal_why(store, item_id, blessed_ids, placed_ids)
        if why is not None:
            report["merge_refused"] = 1
            report["why"] = why
            return report

    moves = []
    for item_id, _text in cleaned:
        source_rel = str(items[item_id].get("library_path") or "")
        rel = _move_snapshot_to_attachments(library_root, survivor_id,
                                            source_rel)
        if rel is None:
            report["move_failed"] += 1
            report["why"] = (
                "a snapshot did not arrive intact in attachments/ — nothing "
                "was written and the original is untouched")
            return report
        moves.append((item_id, source_rel, rel))

    atomic_write_bytes(
        str(Path(library_root) / "items" / (str(survivor_id) + ".md")),
        _note_section_bytes(store, library_root, cleaned))

    survivor = items[survivor_id]
    survivor["type"] = "text"
    survivor["library_path"] = "items/" + str(survivor_id) + ".md"
    att_list = survivor.setdefault("attachments", [])
    for _item_id, _source_rel, rel in moves:
        if rel not in att_list:
            att_list.append(rel)

    for item_id, _text in cleaned[1:]:
        retire_merged_item(store, item_id, survivor_id, blessed_ids,
                           placed_ids)
        report["retired"] += 1

    for _item_id, source_rel, _rel in moves:
        try:
            (Path(library_root) / source_rel).unlink()
        except FileNotFoundError:
            pass
        report["moved"] += 1

    report.update(ok=True, minted=1, sections=len(cleaned))
    return report


def run_note_pass(store, library_root, cache_reader, print_reader,
                  program_fp, save_cb=None):
    """{ok, why, report} — the WHOLE note pass over one library.

    gate -> candidates -> group -> mint, with ONE report counted by reason:
    the candidate report's {screenshots, already_text, fenced, placed,
    blessed, blessed_by_state, blessed_by_file, blessed_by_both, unreachable,
    eligible} plus {groups, notes, sections, moved, retired, no_note,
    refused, move_failed, merge_refused, mint_failed, mint_failed_why}.

    ⚠ CR-04: ONE GROUP'S FAILURE IS ONE COUNTED LINE, NEVER THE RUN. A group
    that refuses (`merge_refused`) or that hits the filesystem badly
    (`mint_failed`) is skipped and the pass CONTINUES with every remaining
    group; the run still returns ok, and the counts say what was left behind.
    Before this, either one raised through this function and through
    `run_note_pass_cli` untouched, ending a one-way pass over her library in a
    traceback with `save()` unreached — so the current group's note and
    attachment copies were orphaned on disk and every earlier group's store
    mutations were thrown away. `mint_failed_why` carries the last such
    reason as one plain line, which is the posture `run_vision_stage` already
    names: "one plain-words line, never a traceback".

    ⚠ `save_cb` IS CALLED AFTER EVERY MINTED NOTE, NOT ONCE AT THE END. The
    file moves have already happened by then, and a run interrupted at note
    two thousand must not throw away two thousand groups' worth of store
    mutations for files that are no longer where the store says they are.
    The callback is where the caller takes `WRITE_LOCK` and calls
    `save_store`; this function takes no lock and writes no store file.

    ⚠ THE BLESSED SPLIT TRAVELS OUT IN THE REPORT — the state half, the file
    half and their overlap, DERIVED at run time and compared against no
    constant. It is what D-15's halt packet shows her.

    ⚠⚠ THE `screenshots` TAG IS RE-DERIVED INTO THE STORE AND HANDED TO
    `save_cb` **BEFORE A SINGLE CANDIDATE IS SELECTED**, and that ordering is
    the whole reason this step lives here rather than in the CLI. 26.94-08
    computed the re-derivation and reported it as a number without writing it
    (its deviation 2), and `note_pass_candidates` picks its population from
    the tag IN THE STORE — so run against the unwritten tag the pass would
    have found 2,676 of her screenshots instead of 3,608 and **927 would
    silently never have become notes, with nothing reporting an error.** A
    re-derivation saved only at the END would be one interrupted run away from
    a store whose notes and whose tags disagree.

    ⚠ AND IT HAPPENS ONLY AFTER THE GATE PASSES. Re-deriving on a store the
    pass is about to refuse would write a derivation drawn from text the gate
    has just called stale; a refusal still changes nothing at all.

    ⚠ A6, RECORDED NOT DISCHARGED: "~3,083 notes" is arithmetic over verified
    counts (3,575 - 738 + 246) that assumes every burst member cleans and no
    burst is wholly fenced. It is close but not exact and NO GATE PINS IT —
    what comes back below is the real number."""
    gate = note_pass_gate(store, library_root, cache_reader, program_fp)

    def _shaped(counted, redetect=None):
        counted.update({"groups": 0, "notes": 0, "sections": 0, "moved": 0,
                        "retired": 0, "no_note": 0, "refused": 0,
                        "move_failed": 0, "merge_refused": 0,
                        "mint_failed": 0, "mint_failed_why": None,
                        "photographs": gate["photographs"],
                        "current": gate["current"],
                        "missing": gate["missing"],
                        "redetect_union": (redetect or {}).get("union", 0),
                        "redetect_added": (redetect or {}).get("added", 0),
                        "redetect_removed": (redetect or {}).get("removed", 0)}
                       )
        return counted

    if not gate["ok"]:
        _c, report = note_pass_candidates(store, library_root)
        return {"ok": False, "why": gate["why"], "report": _shaped(report)}

    redetect = redetect_screenshots(store, library_root, cache_reader,
                                    program_fp)
    if not redetect["ok"]:
        _c, report = note_pass_candidates(store, library_root)
        return {"ok": False, "why": redetect["why"],
                "report": _shaped(report, redetect)}
    if save_cb is not None:
        save_cb()

    candidates, report = note_pass_candidates(store, library_root)
    report = _shaped(report, redetect)

    items = store.get("items") or {}
    prints = {}
    for item_id in candidates:
        raw = print_reader(item_id)
        if raw is not None:
            prints[item_id] = raw
    groups = group_bursts([items[i] for i in candidates if i in items],
                          prints)
    report["groups"] = len(groups)
    # ⚠ CR-04. ONE READ OF EACH LEDGER FOR THE WHOLE PASS, taken here and
    # handed down, so the pass has ONE idea of "blessed" and "placed" for its
    # whole duration instead of one per group. That REMOVES the race rather
    # than handling it: `note_pass_candidates` selected the population against
    # its own single read a moment ago, and mint now answers from the same
    # facts instead of re-reading the files 3,201 times at 3,201 clocks.
    blessed_ids = blessed_ledger_ids(library_root)
    placed_ids = placed_item_ids(library_root)
    for group in groups:
        # ⚠ AND A NET UNDER THE WHOLE MINT, because the ordering fix above can
        # only close the refusal this pass knows about. `shutil.copy2`,
        # `atomic_write_bytes` and the unlink loop all reach the filesystem,
        # and an OSError out of any of them — a full disk, a permission
        # change, a disconnected volume — used to end the run by traceback
        # with the earlier groups' store mutations unsaved. One group's bad
        # luck is now one counted line, and the pass keeps its work.
        try:
            one = mint_screenshot_note(store, library_root, group,
                                       cache_reader, program_fp,
                                       blessed_ids, placed_ids)
        except (MergeRefused, OSError) as e:
            report["mint_failed"] += 1
            report["mint_failed_why"] = str(e)   # one line, never a trace
            continue
        for key in ("sections", "moved", "retired", "no_note", "refused",
                    "move_failed", "merge_refused"):
            report[key] += one[key]
        if one["ok"]:
            report["notes"] += 1
            if save_cb is not None:
                save_cb()
    return {"ok": True, "why": None, "report": report}


# ---------------------------------------------------------------------------
# ---- `repair_notes` — putting back the words CR-03 deleted -----------------
#
# ⚠⚠ DRY RUN BY DEFAULT. `apply` DEFAULTS TO FALSE AND THE CALLER MUST SAY SO.
# The un-stripped text survives in vision/<id>.json and the picture survives in
# attachments/, so the damage IS repairable — but a note is what she reads, and
# rewriting one is the same class of one-way door the note pass itself is.
#
# ⚠ THE REFUSAL IS THE POINT, NOT THE REWRITE. A note is only ever rewritten if
# what is on disk is BYTE-IDENTICAL to what the buggy rules produced from the
# cache. Anything else — a note she edited, a note whose members' readings have
# since changed, a note this function simply cannot reproduce — is REFUSED and
# counted, never overwritten. The predicate cannot tell "she edited it" from
# "the reproduction is wrong", and it does not need to: both answers are the
# same answer, which is don't touch it.
# ---------------------------------------------------------------------------


def _strip_chrome_as_minted(text) -> str:
    """`strip_chrome` EXACTLY as it behaved before CR-03 — the buggy answer.

    Used only to recognise the buggy pass's own output. Never to produce a
    note: everything this returns is a string with her words missing out of
    the middle of it."""
    if not isinstance(text, str):
        return ""
    for _name, pattern in _SCREEN_CHROME_PATTERNS_BEFORE_CR03:
        text = pattern.sub(" ", text)
    return _WHITESPACE_RE.sub(" ", text).strip()


def _strip_chrome_before_head_window(text) -> str:
    """`strip_chrome` EXACTLY as it behaved between the CR-03 repair and the
    2026-08-14 head-window ruling — every rule applied to the WHOLE reading.

    ⚠ THIS IS THE SHAPE HER NOTES ARE ACTUALLY IN. `_strip_chrome_as_minted`
    is frozen at the PRE-CR-03 rules, which is right for the notes the pass
    first wrote — but 506 of them were rewritten by `--repair-notes` on
    2026-08-14, and every one of the 3,067 was minted with clock and battery
    applied globally. A repair that recognised only the pre-CR-03 shape would
    refuse the very notes it exists to mend, and would report that refusal as
    "you edited these", which is worse than doing nothing.

    Like its sibling: used ONLY to recognise a previous pass's own output,
    never to produce a note."""
    if not isinstance(text, str):
        return ""
    for _name, pattern in SCREEN_CHROME_PATTERNS:
        text = pattern.sub(" ", text)
    return _WHITESPACE_RE.sub(" ", text).strip()


def minted_note_members(store, item_id):
    """The item ids that made this note, in the order `mint_screenshot_note`
    used: ascending `created_ms` with a lexicographic id tie-break.

    ⚠ THE MERGED MEMBERS ARE NOT IN `items` ANY MORE — `retire_merged_item`
    moved each one's whole record into the survivor's `merged_from`, so their
    `created_ms` has to come from THAT record. Reading it off `items` returns
    a default of 0 for every member, which sorts them all to the front and
    silently reorders any multi-shot note. Measured: with the member stamps
    read correctly, all 3,067 of her minted notes reproduce byte-for-byte;
    read off `items`, 205 of them do not."""
    items = store.get("items") or {}
    survivor = items.get(item_id)
    if not isinstance(survivor, dict):
        return []
    rows = [(int(survivor.get("created_ms") or 0), str(item_id))]
    for record in (survivor.get("merged_from") or ()):
        if isinstance(record, dict) and record.get("id"):
            rows.append((int(record.get("created_ms") or 0),
                         str(record["id"])))
    rows.sort()
    return [member for _ms, member in rows]


def minted_note_ids(store):
    """Every item that looks like a note this pass minted: `type: "text"`,
    a `library_path` under items/ ending .md, and at least one attachment
    filed under its OWN id.

    Deliberately a WIDE net — an ordinary text note that happens to match is
    caught here and then refused downstream for failing to reproduce, which is
    the safe direction. A narrow net that missed a damaged note would leave
    her words deleted with nothing reporting it."""
    out = []
    for item_id, item in sorted((store.get("items") or {}).items()):
        if not isinstance(item, dict) or item.get("type") != "text":
            continue
        path = str(item.get("library_path") or "")
        if not (path.startswith("items/") and path.endswith(".md")):
            continue
        prefix = "attachments/" + str(item_id) + "/"
        if any(str(a).startswith(prefix)
               for a in (item.get("attachments") or ())):
            out.append(str(item_id))
    return out


def repair_notes(store, library_root, cache_reader, apply=False):
    """{ok, why, report} — put back the words the pre-CR-03 rules deleted.

    ⚠ `apply` DEFAULTS TO FALSE. With it false NOTHING is written and the
    report is a projection of what a real run would do. That is the whole
    contract of this function and the reason it exists in this shape.

    Per note: rebuild the bytes from the cache twice — once with the rules as
    they are NOW (`wanted`) and once with the rules as they were when the pass
    ran (`as_minted`) — and compare `as_minted` against what is on disk.

      disk != as_minted   -> REFUSED. Not ours to rewrite.
      wanted == disk      -> unchanged. Nothing to put back.
      otherwise           -> damaged; rewritten only when `apply` is true.

    Counted by reason: {examined, not_minted, unreadable, unchanged, damaged,
    repaired, refused_edited, chars_restored}. `damaged` is the projection and
    `repaired` is what was actually written — they are equal after an applied
    run and `repaired` is 0 after a dry one, which is how a reader tells the
    two apart without being told.

    ⚠ NO LOCK AND NO STORE WRITE, the `mint_screenshot_note` contract: this
    rewrites note BODIES only. No item's `type`, `library_path`, `attachments`
    or `merged_from` is touched, nothing is unlinked, and nothing moves — so
    a repair interrupted half way leaves a library whose store is still true.
    """
    report = {"examined": 0, "not_minted": 0, "unreadable": 0, "unchanged": 0,
              "damaged": 0, "repaired": 0, "refused_edited": 0,
              "chars_restored": 0}
    root = Path(library_root)
    for item_id in minted_note_ids(store):
        report["examined"] += 1
        members = minted_note_members(store, item_id)
        # ⚠ THE SURVIVOR'S OWN READING IS WHAT SAYS THIS IS ONE OF OURS. An
        # ordinary text note that happens to carry an attachment under its own
        # id — 710 of hers do — has no vision entry at all, and is not this
        # function's business. A MEMBER missing one is a different answer: the
        # note IS ours and cannot be reproduced, so it is refused, not skipped.
        if not members or _ocr_text(cache_reader(item_id)) is None:
            report["not_minted"] += 1
            continue
        wanted_sections, minted_sections, readable = [], [], True
        prior_sections = []
        for member in members:
            text = _ocr_text(cache_reader(member))
            if text is None:
                readable = False
                break
            for sections, stripper in ((wanted_sections, strip_chrome),
                                       (minted_sections,
                                        _strip_chrome_as_minted),
                                       (prior_sections,
                                        _strip_chrome_before_head_window)):
                cleaned = unicodedata.normalize("NFC", stripper(text)).strip()
                if len(cleaned) >= CLEAN_MIN_CHARS:
                    sections.append((member, cleaned))
        if (not readable or not minted_sections or not wanted_sections
                or not prior_sections):
            report["unreadable"] += 1
            continue
        note_path = root / "items" / (str(item_id) + ".md")
        try:
            on_disk = note_path.read_bytes()
        except OSError:
            report["unreadable"] += 1
            continue
        # ⚠ EITHER PRIOR SHAPE COUNTS AS OURS, AND BOTH ARE NEEDED. A note may
        # be sitting in the shape the pass first minted it in, OR in the shape
        # the 2026-08-14 CR-03 repair left it in — 506 of hers are the latter.
        # Recognising only one would refuse half the library and call it
        # "you edited these".
        ours = (_note_section_bytes(store, library_root, minted_sections),
                _note_section_bytes(store, library_root, prior_sections))
        if on_disk not in ours:
            report["refused_edited"] += 1
            continue
        wanted = _note_section_bytes(store, library_root, wanted_sections)
        if wanted == on_disk:
            report["unchanged"] += 1
            continue
        report["damaged"] += 1
        report["chars_restored"] += (len(wanted.decode("utf-8"))
                                     - len(on_disk.decode("utf-8")))
        if apply:
            atomic_write_bytes(str(note_path), wanted)
            report["repaired"] += 1
    return {"ok": True, "why": None, "report": report}


# ---------------------------------------------------------------------------
# ---- the variation ledger (26.87-10, D-14/D-27) ---------------------------
# librarian/reflections.json is THE CALL'S MEMORY, and it exists because the
# call has none of its own: the essay is one-shot and hermetic, and its
# working directory is removed on the way out — so the librarian re-derives
# the same house style every sitting and CANNOT NOTICE IT IS REPEATING
# ITSELF. "Don't repeat yourself" is therefore unenforceable as an
# instruction and has to arrive as DATA. This file is that data.
#
# It joins the session / blessings / identity family whole: plain JSON under
# the VISIBLE librarian folder (deleting librarian/ stays the factory reset),
# fail-open reads, atomic writes, a hand-openable indent, and serialization
# under the server's own small reflections lock (never WRITE_LOCK, never
# LIBRARIAN_LOCK) — these helpers do the IO only; the caller owns the lock.
#
# One record per DRAFT THAT LANDED: {title, shape, outcome, model, ms}.
# `ms` is an epoch-ms int — the item stamps' own format, never a third
# timestamp parse site. `shape` is a token from the closed vocabulary below,
# never a sentence: the openings are the one dimension deliberately left
# ungated, and showing the model a fluent prior opening is the exact
# anchoring channel this whole design removes (D-27).
#
# TWO DESIGN POINTS A READER WOULD OTHERWISE TRIP OVER, which is why the
# file states the first of them in its own one-line header too:
#
#   1. IT RECORDS PASSED DRAFTS AS WELL AS SAVED ONES. A title she saw twice
#      is a repeat whether or not she kept the first one, so "all prior
#      titles" is deliberately LARGER than "all books on the shelf". The
#      outcome field says which is which; nothing reads it as a filter.
#   2. THE READ IS CAPPED at REFLECTION_TITLE_CAP newest titles, and the
#      arithmetic is written down rather than assumed.
# ---------------------------------------------------------------------------

# THE ARITHMETIC, written down because a ledger with no cap constant
# anywhere near it is the warning sign: a spine title is trimmed to 60
# characters upstream (_reflection_book_title), so 200 titles is at most
# 200 x ~64 bytes of JSON ~= 13 KB — tens of kilobytes worst case, about 3%
# of REFLECTION_DOC_BUDGET (400 KB) and negligible beside one sitting's
# pool. It is cheap at twenty sessions and it would NOT be cheap at two
# thousand, which is the whole reason the number exists at all. At one
# sitting a day, 200 titles is over six months of memory.
REFLECTION_TITLE_CAP = 200

# The file's own one-line header, so the surprising half of the design is
# legible to whoever opens the file rather than only to whoever reads this
# module.
REFLECTIONS_FILE_NOTE = "derived, not authored. one record per draft that landed — passed drafts as well as saved ones, because a title you saw twice is a repeat either way. safe to edit or delete; it starts over."  # noqa: E501


def reflections_file_path(library_root):
    """librarian/reflections.json under the library root. Pure path math."""
    return Path(library_root) / "librarian" / "reflections.json"


def load_reflections(library_root):
    """{'reflections': [...]} — FAIL-OPEN: a missing, unreadable, or
    off-shape file reads as the empty wrapper (the load_blessings posture).
    A file of random bytes reads as the empty wrapper too. Never raises."""
    try:
        data = json.loads(
            reflections_file_path(library_root).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"reflections": []}
    entries = data.get("reflections") if isinstance(data, dict) else None
    return {"reflections": entries if isinstance(entries, list) else []}


def save_reflections(library_root, entries):
    """Atomically rewrite librarian/reflections.json. The caller holds the
    server's reflections lock; this helper does the write only — a crash
    mid-write leaves the prior ledger intact (never a torn record). The
    one-space indent and the leading note keep the file hand-openable."""
    d = Path(library_root) / "librarian"
    d.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(
        str(reflections_file_path(library_root)),
        json.dumps({"note": REFLECTIONS_FILE_NOTE,
                    "reflections": list(entries)},
                   ensure_ascii=False, indent=1).encode("utf-8"))


def reflection_memory(library_root, cap=REFLECTION_TITLE_CAP):
    """The prior sittings' memory the per-turn document carries:
    {"titles": [...], "shapes": [...]} — newest first, deduped, titles
    capped at `cap`. Fail-open throughout: an absent or damaged ledger is
    simply no memory, and no memory can only ever UNDER-reject.

    CLOSED SESSIONS ONLY, and this is the load-bearing rule. A record whose
    `outcome` is still None belongs to the session that is open right now:
    its draft is ONE essay being revised, not a repeat, so feeding its own
    title back would make every refine turn re-litigate its title
    mid-conversation — exactly when she is trying to add a detail. A record
    left unstamped by a crash therefore never counts as prior either, which
    is the same direction of failure and the safe one."""
    titles = []
    shapes = []
    entries = load_reflections(library_root)["reflections"]
    for rec in reversed(entries):          # newest first
        if not isinstance(rec, dict) or rec.get("outcome") is None:
            continue
        title = str(rec.get("title") or "").strip()
        if title and title not in titles and len(titles) < cap:
            titles.append(title)
        shape = str(rec.get("shape") or "").strip()
        if shape in OPENING_SHAPE_TOKENS and shape not in shapes:
            shapes.append(shape)
    return {"titles": titles, "shapes": shapes}


# ---------------------------------------------------------------------------
# ---- her sentences from the sittings she passed on (26.995-10, D-19…D-27) -
# librarian/your-sentences.json is THE LIBRARIAN'S MEMORY OF HER, and it is a
# memory of HER rather than of its own writing: "the librarian's memory should
# get to know user better and better over the time" (D-19, her words). Her
# priority order is hers too — her comments and reactions FIRST, because that
# is her talking; which reflections landed second; the room's own essays last
# and the first thing to cut.
#
# ⛔ WHY THE FILE HAS TO EXIST AT ALL, and it is a mechanism rather than a
# preference: on a PASS her entire chat transcript is destroyed when
# librarian/session.json is unlinked at close. Before this there was NO place
# a passed sitting's words survived — she could tell the room its writing
# missed and by the time the candle went out the room had forgotten she spoke.
#
# It joins the session / blessings / identity / variation family whole: plain
# JSON under the VISIBLE librarian folder (deleting librarian/ stays the
# factory reset), fail-open reads, atomic writes, a hand-openable indent, and
# serialization under the server's own small lock — never WRITE_LOCK and never
# LIBRARIAN_LOCK. These helpers do the IO only; the caller owns the lock.
#
# One entry per thing she typed: {text, about, ms}. `text` is HER SENTENCE,
# verbatim. `about` is the name of the reflection it is anchored to. `ms` is
# an epoch-ms int — the item stamps' own format, never a third timestamp
# parse site.
#
# ⛔⛔ NO CATEGORY IS EVER STORED, AND THAT IS THE HARD RULE HERE (D-26). "The
# writing missed" versus "the material was wrong" were an agent's two boxes,
# not hers, and she ruled that nothing files her reaction into a box. No
# label, no rating, no sentiment, no length, no derived field of any kind sits
# beside her sentence. Her own sentences reach the writing VERBATIM AND
# UNSORTED. ⛔ And the memory is DERIVED, NEVER COMPOSED: it holds what she
# typed, and it never asks a model to summarise it — a composed memory
# inherits the unchecked no-invention floor AND THE FAILURE COMPOUNDS, because
# an invented memory does not spoil one reflection, it writes every reflection
# after it.
#
# ⛔ THE REJECTED ESSAY IS NOT KEPT (D-25) — only her sentence and the name it
# is anchored to. And only from a sitting she PASSED on: on a sitting she
# saved, her addition already survives inside the reflection.
# ---------------------------------------------------------------------------

# THE ARITHMETIC, written down because a store with no cap constant anywhere
# near it is the warning sign. One entry is one thing she typed, plus a name
# and a stamp. A chat turn is bounded only by the 1 MB request body cap, so
# the honest worst case is not small — but what she actually types is a
# sentence or two: at ~200 bytes an entry, 60 entries is ~12 KB of JSON, about
# 3% of REFLECTION_DOC_BUDGET (400 KB) and negligible beside one sitting's
# pool. It is cheap at sixty and it would NOT be cheap at six thousand, which
# is the whole reason the number exists at all. A passed sitting is rarer than
# a sitting; at one pass a week, 60 entries is over a year of her taste in
# prose.
#
# ⚠ IT IS A KEEP-THE-NEWEST BOUND, NEVER AN AGE RULE. D-21 splits the fade
# deliberately: the memory of her LIFE fades, but her sentences about the
# room's writing do not fade on a clock — the room looks at the newest handful
# and she may delete any. A taste in prose is steadier than a mood. ⛔ Do not
# write a clock into this file.
HER_SENTENCES_CAP = 60

# The file's own one-line header, so the surprising half of the design is
# legible to whoever opens the file rather than only to whoever reads this
# module.
#
# ⛔⛔ THIS SENTENCE IS THE OWNER'S, CHOSEN 2026-08-18 FROM FOUR CANDIDATES
# (26.995-COPY.md § C-8), AND IT IS APPLIED VERBATIM. She reads it when she
# opens the file, so it is hers; an agent may apply her words and may never
# choose them. She was shown the sibling file's own note as the register and
# chose to match its shape. ⛔ Do not swap "not authored" for "not composed" —
# the sibling files reading alike is the point. ⛔ Do not trim "nothing is
# sorted, labelled or scored" — that clause is D-26 in her own register and is
# the one a later reader is likeliest to cut as redundant. Pinned
# byte-for-byte by tests/test_reflection_memory.py against her lines re-typed
# there, never imported from here.
HER_SENTENCES_FILE_NOTE = "derived, not authored. your own sentences from sittings you passed on, kept whole and in the order you typed them — nothing is sorted, labelled or scored. safe to edit or delete; it starts over."  # noqa: E501

# ---------------------------------------------------------------------------
# WHAT THE ROOM SAYS ABOUT DELETING THE LIBRARIAN'S MEMORY.
#
# ⛔⛔ ALSO THE OWNER'S, CHOSEN 2026-08-18 FROM FOUR STANCES (26.995-COPY.md
# § C-1), APPLIED VERBATIM, LINE BREAKS INCLUDED. The reset was previously
# offered as free and it no longer is: D-20 puts the memory in the folder she
# can open and edit, which means deleting that folder destroys it, and she
# accepted that cost when she ruled. The copy the app shows was written when
# the folder held nothing but the room's own bookkeeping. It now holds HER
# SENTENCES.
#
# ⛔ THE CLAUSE ORDER IS THE CHOICE, not a style. Read/change/delete first and
# the reset second is D-20's "visible and editable, no hidden state" said in
# her own register, and it makes deleting read as one option among three
# rather than a red button. She was shown a candidate that led with the cost
# and did not pick it. An agent must not reorder this to warn first, and must
# not append a consequence clause to make the cost louder.
#
# ⚠ NO SURFACE RENDERS THIS YET, and that is stated rather than left to be
# discovered: the room has no reset control today — the factory reset is the
# documented `rm -rf librarian/`. This constant is the SINGLE SOURCE of that
# sentence so that whoever builds the surface applies her words instead of
# composing their own. ⛔ If you are that person: use this literal.
LIBRARIAN_MEMORY_RESET_COPY = (
    "this is the librarian's memory of you, in plain files\n"
    "you can read, change, or delete.\n"
    "deleting all of it is how you start it over.")


def her_sentences_file_path(library_root):
    """librarian/your-sentences.json under the library root. Pure path math.

    ⚠ The name is the one SHE would read in her own folder, not the one the
    module thinks in — this file is opened by hand and that is the whole of
    D-20."""
    return Path(library_root) / "librarian" / "your-sentences.json"


def load_her_sentences(library_root):
    """{'sentences': [...]} — FAIL-OPEN: a missing, unreadable, or off-shape
    file reads as the empty wrapper (the load_reflections posture). A file of
    random bytes reads as the empty wrapper too. Never raises.

    A damaged memory is NO memory, never an error: this store may not cost
    her a sitting, and no memory can only ever UNDER-say."""
    try:
        data = json.loads(
            her_sentences_file_path(library_root).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"sentences": []}
    entries = data.get("sentences") if isinstance(data, dict) else None
    return {"sentences": entries if isinstance(entries, list) else []}


def save_her_sentences(library_root, entries):
    """Atomically rewrite librarian/your-sentences.json, keeping the NEWEST
    HER_SENTENCES_CAP entries. The caller holds the server's own small lock;
    this helper does the write only — a crash mid-write leaves the prior file
    intact (never a torn record). The one-space indent and the leading note
    keep the file hand-openable, editable and deletable.

    ⚠ The trim is `[-CAP:]` — the OLDEST are what fall off. Slicing the other
    way would keep the oldest and silently freeze her memory at whatever she
    said first."""
    d = Path(library_root) / "librarian"
    d.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(
        str(her_sentences_file_path(library_root)),
        json.dumps({"note": HER_SENTENCES_FILE_NOTE,
                    "sentences": list(entries)[-HER_SENTENCES_CAP:]},
                   ensure_ascii=False, indent=1).encode("utf-8"))


def her_sentences_memory(library_root, cap=HER_SENTENCES_CAP):
    """{'sentences': [...]} — NEWEST FIRST, capped at `cap`. Fail-open
    throughout: an absent or damaged store is simply no memory.

    ⛔ ORDERING RIDES ON FILE ORDER, NOT ON THE STAMP, and that is deliberate.
    One passed sitting writes every one of her turns under ONE stamp, so
    equal-millisecond entries are the normal case rather than a corner: they
    must come back in the order she typed them, newest written first.
    `reversed(entries)` is what carries that. A later reader that sorted on
    `ms` would silently reverse every such pair and nothing else in the system
    would notice — which is why it is stated here and asserted against a
    hand-built pair in tests/test_reflection_memory.py.

    ⛔ Nothing here measures age (D-21). A sentence is dropped by the cap or
    by her deleting it, and by nothing else."""
    out = []
    for rec in reversed(load_her_sentences(library_root)["sentences"]):
        if not isinstance(rec, dict):
            continue
        if len(out) >= cap:
            break
        out.append(rec)
    return {"sentences": out}


# ---------------------------------------------------------------------------
# ---- the opening-shape vocabulary (26.87-10, D-27/D-35.1) -----------------
# A DATA TABLE plus a pure function over it, and that shape is a HARD
# REQUIREMENT rather than a preference. The derivation is needed in TWO
# places — the app writing the ledger, and tests/eval_reflection.py
# generating a run — and the harness MAY NOT IMPORT the app: its contract is
# text-only extraction, and a *function* cannot be lifted as text the way a
# constant can. Without a shared table plus an equivalence assertion the
# harness is free to measure something the product does not ship, which is
# the SE-0 failure repeated on a new surface. tests/test_eval_harness.py
# feeds a fixed table of openings to both derivations and asserts identical
# tokens.
#
# THE ACCEPTED COST, recorded rather than discovered later: five tokens is a
# LOSSY description and will sometimes describe her essays crudely. That is
# the trade, taken deliberately over the alternative — showing the model its
# own prior opening SENTENCES, which is a proven anchoring channel and the
# very mechanism that put one heading on every book (26.7 UAT).
#
# Rows are tried IN ORDER and the first hit wins; a line matching nothing is
# the plain declarative default. Three modes only, so a second
# implementation has nothing to interpret:
#   "starts"  the folded line begins with the marker
#   "ends"    the folded line ends with the marker
#   "word"    the folded line IS the marker or begins with it plus a space
#             (ascii word-boundary; CJK markers use "starts" instead)
# ---------------------------------------------------------------------------

OPENING_SHAPE_DEFAULT = "claim-first"
OPENING_SHAPE_TOKENS = ("quote-first", "question-first", "scene-first",
                        "object-first", "claim-first")
OPENING_SHAPE_TABLE = (
    ("quote-first", "starts", ('"', "“", "‘", "「", "『",
                               "《")),
    ("question-first", "ends", ("?", "？")),
    ("scene-first", "starts", ("那天", "昨天",
                               "去年")),
    ("scene-first", "word", ("when", "on", "in", "at", "last", "before",
                             "after", "outside", "one")),
    ("object-first", "starts", ("这", "那")),
    ("object-first", "word", ("the", "a", "an", "this", "these", "your",
                              "her", "his", "its", "there")),
)


def derive_opening_shape(line):
    """One opening LINE reduced to a token of OPENING_SHAPE_TOKENS over
    OPENING_SHAPE_TABLE. PURE: no I/O, no clock, no store. An empty or
    unmatched line is OPENING_SHAPE_DEFAULT."""
    text = " ".join(str(line or "").split())
    if not text:
        return OPENING_SHAPE_DEFAULT
    low = text.lower()
    for token, mode, markers in OPENING_SHAPE_TABLE:
        for marker in markers:
            if mode == "starts" and low.startswith(marker):
                return token
            if mode == "ends" and low.endswith(marker):
                return token
            if mode == "word" and (low == marker
                                   or low.startswith(marker + " ")):
                return token
    return OPENING_SHAPE_DEFAULT


def reflection_opening_line(draft):
    """The essay's opening LINE: the first non-empty line that is not the
    markdown heading carrying its title (the title is the ledger's own
    separate field). Pure; '' when the draft has no body line."""
    for raw in str(draft or "").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        return line
    return ""


def add_generated_reflection(library_root, title, text):
    """Materialize one session-generated reflection as a REAL store item
    (26.7-04, RESEARCH A5 fallback route: a small dedicated writer through
    the same normalize → hash → dedup → atomic core the synth adapter units
    use — still single-writer, still atomic). The caller holds WRITE_LOCK.

    The item carries source "librarian" — NEVER obsidian-vault — so
    is_reflection's precision (fought for in 26.4-06) stays unpolluted; the
    book's kind:"reflection" discriminator is what shelves it. The snapshot
    name is server-generated from the content hash (the path-traversal
    fence), and origin_path is the item's library-relative path — there is
    no vault origin. Dedup is the RSF-06 idempotency edge: the same bytes
    re-saved mint the SAME id, so a re-save is a no-op returning the
    existing item and a re-promote can never duplicate a book.

    Returns the item dict (new or deduped)."""
    lib = Path(library_root)
    lib.mkdir(parents=True, exist_ok=True)
    (lib / "items").mkdir(exist_ok=True)
    if _store_path(lib).exists():
        store = load_store(lib)          # StoreCorruptError propagates
    else:
        store = new_store(lib)
    data = normalize_text_bytes(str(text).encode("utf-8"))
    full = hashlib.sha256(data).hexdigest()
    item_id = _unique_id(full, store["items"])
    if item_id in store["items"]:
        return store["items"][item_id]   # dedup: never a second item
    library_path = f"items/{item_id}.md"
    atomic_write_bytes(str(lib / library_path), data)
    now_ms = int(time.time() * 1000)
    item = {
        "id": item_id,
        "content_hash": full,
        "source": "librarian",
        "origin_path": library_path,
        "library_path": library_path,
        "type": "text",
        "title": str(title or "a reflection"),
        "created_ms": now_ms,
        "saved_ms": now_ms,
        "imported_ms": now_ms,
        "last_opened_ms": None,
        "state": "unseen",
        "resting_until_ms": None,
        "tags": [],
        "trigger": False,
        "history": [{
            "at": datetime.now().astimezone().isoformat(
                timespec="seconds"),
            "from": None,
            "to": "unseen",
            "via": "session-save",
        }],
    }
    if _frontmatter_has_reflects(data):
        item["reflects"] = True
    store["items"][item_id] = stamp_facets(item)
    save_store(lib, store)
    return item


# ---------------------------------------------------------------------------
# ---- librarian fence (26-01, SRM-13) ----
# build_librarian_payload is the ONLY source of bytes the librarian's agent
# subprocess may ever receive (AI-SPEC "THE FENCE"). The librarian runs when
# you ask, reads only what this builder hands it, and never touches the
# store. Exclusions are TOTAL: a fenced item contributes no id, no title,
# no metadata row — under every scope, consent or not. The matching below
# mirrors core.js itemExcluded / matchesFilter exactly (same facets, same
# compares); parity is proven by the shared fixtures in
# tests/test_librarian_fence.py.
# ---------------------------------------------------------------------------

LIBRARIAN_BODY_CAP = 8192   # 8 KB per item body (D-03) — capped WITH a count
# 26.7-uat (beat-1 finding): ONE sitting's reflection document must fit
# the model's window. 400K chars sits comfortably inside a 200K-token
# context with the prompt+schema riding alongside; overflow sheds rows
# OLDEST-out, every drop counted in counts["pool-capped"] (fail-visible,
# never silent truncation). Reflection scope only.
REFLECTION_DOC_BUDGET = 400_000

# ⛔⛔ 26.998-07 — HER PHOTO SLICE. CHOSEN FROM AN OFFERED SET, 2026-08-23,
# after she was shown what her own two prior rulings did on her real library.
#
# The chain, and every link is hers: her strict order put photographs THIRD,
# above clippings — and driven on her library that handed 95% of the document
# to photo titles carrying no words, shedding 10,874 rows that had words. She
# ruled *words first, photos fill what is left*. Driven again, there was NEVER
# anything left, so her photographs vanished from reflections entirely. Shown
# that, she ruled *keep a small space for photos*, and then chose its size.
#
# ⚠ THE NUMBER IS HERS. It was put to her as three sizes with what each COSTS
# in readable material stated plainly (about 12, 68 and 270 pieces of writing
# out of ~600), and she took the smallest. ⛔ No agent may raise, lower or
# "tune" it. A later reader who finds 50 arbitrary is looking at a figure that
# was chosen against a stated cost, not guessed.
#
# ⚠ It is a CEILING ON WHAT SURVIVES THE CUT, not a floor on what is admitted:
# a sitting with fewer than 50 new photographs keeps all of them and reserves
# nothing, and one with none is unaffected entirely.
REFLECTION_PHOTO_SLICE = 50

# 26.87-06 (D-10/D-11/D-24): the heaviness TRIPWIRE — ban-list DATA in the
# NO_PUSH_VOCAB / CLINICAL_CLAIM_VOCAB shape (lowercase substrings, matched
# case-insensitively). It is the FALLBACK half of _reflection_heavy: the
# stored SORT shelf label comes first and wins both ways; only an item the
# librarian never labelled falls through to these words.
#
# WHAT MAY SHIP HERE, AND WHY THE RULE IS ABSOLUTE (D-24). Only GENERIC
# AFFECT AND WEIGHT terms — English and Chinese words for grief, mourning,
# despair, breakdown, burnout, panic, relapse, hospitalisation, diagnosis,
# therapy and insomnia. EXCLUDED, absolutely: any institution name, any
# legal or immigration process, any medical-record type, any specific work
# or job title. Two reasons, and both are load-bearing:
#   1. Product — those strings are simply WRONG for any other user. A term
#      list built out of one person's life does not generalize; a list of
#      generic affect words plus HER OWN roster (below) does.
#   2. Publish — a later phase ships a sanitized tester repo behind a
#      personal-marker grep gate, and this repo's own all-history gate has
#      already caught that class of leak TWICE. A term tuple in source is a
#      publish-gate surface, not private scratch.
# The institutional half is therefore NOT written here: it is derived AT
# RUNTIME from the user's own fenced-roster folder names (_active_roster),
# lowercased — strictly better product AND it keeps the gate clean.
#
# DELIBERATELY SHORT AND CONSERVATIVE. An over-broad list starves the pool,
# and the stored label — not this tuple — is the primary signal. The
# SPECIFIC MEMBERSHIP BELOW IS A SEED THE OWNER MUST READ AND APPROVE: it
# is a list of words about her hardest material, and no one else can
# approve it. Known over-breadth to rule on at that review: a roster entry
# like "Journal" matches the surfaceable "Journal analysis" folder facet as
# a substring, which would read every reflection note as heavy. The roster
# half is the plan's own D-24 design; the collision is a membership
# question for the owner, not a code question.
REFLECTION_HEAVY_TERMS = (
    "grief", "grieving", "mourning", "funeral", "despair",
    "breakdown", "burnout", "panic", "relapse", "insomnia",
    "hospitalis", "hospitaliz", "diagnos", "therapy",
    # OWNER-APPROVED ADDITION 2026-07-30, at the UAT term-list review. She
    # named the two English terms; the Chinese pair rides along because the
    # tuple is bilingual by design and a term that fires only in English
    # would read her zh material as lighter than her en material.
    "anxiety", "depression",
    "悲伤", "哀悼", "绝望", "崩溃", "倦怠",
    "恐慌", "复发", "住院", "诊断", "失眠",
    "焦虑", "抑郁",
)

# 26.87-06 (D-13, SE-7): the bounded all-heavy reach-back's own ceiling.
# Three rows, no more — see pass C below for why a reach-back is bounded
# three separate ways and counted out loud.
REFLECTION_REACHBACK_CAP = 3

LIBRARIAN_SCOPES = ("presort", "note", "reflection")

# 26.4-01 (D-08): the since-last-visit "now" threshold sentinel. The note
# scope's `recent` marker is computed ONLY when the caller hands a threshold
# in — and a caller MUST be able to pass None to mean "first visit, the
# whole archive is now" WITHOUT that colliding with "no marker requested".
# A distinct default sentinel keeps the two apart: absent (the default) =>
# no marker key at all; an explicit value (int OR None) => the marker rides.
_NO_THRESHOLD = object()

# 26.7-01 (D-11): the reflection session's pool boundary reuses the exact
# same absent/None/int discipline through the sentinel above: absent (the
# default) => no marker filtering at all; explicit None => first session,
# the whole allowed archive is the pool; an explicit int => the strict->
# filter in the reflection branch below.


def _comment_stamp_ms(at):
    """Epoch-ms int from one comment's ISO-8601 `at` stamp, or None when
    the stamp does not parse — FAIL-CLOSED: an unparseable or non-string
    stamp reads as OLD (it can never pull an item into the reflection
    pool), never as new (26.7 RESEARCH Pitfall 4: item stamps are epoch-ms
    ints, comment stamps are ISO strings — this is the one normalization
    point). Offset-bearing stamps normalize through their own zone; a
    naive stamp reads in server-local time (the same clock that wrote it).
    Pure."""
    if not isinstance(at, str) or not at:
        return None
    try:
        dt = datetime.fromisoformat(at)
        return int(round(dt.timestamp() * 1000))
    except (ValueError, OverflowError, OSError):
        return None


def _reflection_stamp_ms(item):
    """The reflection pool's newest-activity stamp: max(created_ms,
    saved_ms, newest parsed comment-ms) as an int, or 0 when nothing is
    usable. The _item_save_stamp definition extended with the item's own
    comments (D-33: a fresh comment IS new activity); an unparseable
    comment stamp contributes nothing (fail-closed, never new). Pure."""
    stamp = 0
    for v in (item.get("created_ms"), item.get("saved_ms")):
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            stamp = max(stamp, int(v))
    for c in (item.get("comments") or []):
        if isinstance(c, dict):
            ms = _comment_stamp_ms(c.get("at"))
            if ms is not None:
                stamp = max(stamp, ms)
    return stamp


def _reflection_heaviness_haystack(item):
    """The three surfaces the tripwire is allowed to read — title, folder
    facet and tags — joined and lowercased. NEVER a body: a body scan makes
    heaviness depend on one incidental word deep in a long note, which is
    both wrong and unstable (the same note reads differently after an edit
    far from its subject). Pure."""
    parts = [str(item.get("title") or ""), str(item.get("folder") or "")]
    parts.extend(str(t) for t in (item.get("tags") or []))
    return " ".join(parts).lower()


def _reflection_roster_prose(item):
    """The PROSE surfaces a roster term may match as a substring — title and
    tags, and deliberately NOT the folder facet.

    Same three surfaces as the tripwire haystack minus one, because the
    folder facet is a discrete stored value the roster compares WHOLE (see
    _reflection_heavy). Kept as its own function rather than a flag on the
    haystack so the shipped-term path cannot accidentally inherit the
    narrowing: those stems are SUPPOSED to match a folder as a substring.
    Pure."""
    parts = [str(item.get("title") or "")]
    parts.extend(str(t) for t in (item.get("tags") or []))
    return " ".join(parts).lower()


def _reflection_heavy(item, shelf=None, roster_terms=()):
    """True when one item counts as HEAVY for the one-heavy-item cap
    (D-10/D-11). PURE: no I/O, no body read, no store access.

    Two signals, in a fixed order:

      1. The stored SORT shelf label, resolved by the CALLER from the
         librarian's notebook. A label of "heavy" makes the item heavy.
         ⚠ NO OTHER LABEL DECIDES ANYTHING — see the #70 amendment below.
      2. The tripwire, which every item that the label did not already make
         heavy falls through to, whether it carries a label or not. It
         matches case-insensitively as substrings over the title, the
         folder facet and the tags (never the body) — any shipped
         REFLECTION_HEAVY_TERMS entry, or any `roster_terms` entry the
         caller derived at runtime from the user's own fenced roster
         (D-24: the institutional half never ships as source).

    An unsorted store therefore gets the same protection as a sorted one:
    the cap can never depend on the librarian having run.

    ⚠⚠ AMENDED BY #70 RULING 2, BUILT 2026-08-15: A LABEL MAY ADD HEAVY AND
    MAY NEVER REMOVE IT. The docstring above used to say the label was
    "TRUSTED BOTH WAYS", and that second way was the defect: any real label
    — `joyful`, `receipts`, and even `unsure`, which is the sort DECLINING TO
    DECIDE — switched the tripwire off entirely, so a note whose own words
    carry a grief term lost its protection to a guess. Measured on her real
    library the day this was built: TEN of her notes, three called joyful,
    four receipts, three unsure.

    ⚠ WHAT THE HARM IS, EXACTLY, because it is not a leak: law 5 still holds
    and the fence is a separate mechanism. The only caller is the reflection
    pool's ONE-HEAVY-ITEM CAP, so the cost of a wrong `False` is that a
    session hands her several heavy things at once instead of one — the
    ambush the cap exists to prevent.

    ⚠ THE ASYMMETRY IS THE RULING, not caution for its own sake: a stuck
    `heavy` costs her a note that stays in the one-per-session lane, and a
    wrongly un-heavied one costs her an afternoon. It is the same add-only
    shape the fence and the verdict merge already have — the third protective
    mechanism on this map to land on it."""
    if isinstance(shelf, str) and shelf.strip() \
            and shelf.strip().lower() == "heavy":
        return True                 # the label may ADD heavy...
    # ...and never remove it: an item with any other label, or none, still
    # gets the tripwire read over its own words.
    hay = _reflection_heaviness_haystack(item)
    if not hay.strip():
        return False
    for term in REFLECTION_HEAVY_TERMS:
        if term and term in hay:
            return True
    # 26.87 UAT — THE ROSTER HALF MATCHES DIFFERENTLY FROM THE SHIPPED HALF,
    # and the asymmetry is the point.
    #
    # REFLECTION_HEAVY_TERMS are generic affect words chosen to read as
    # substrings: "grief" SHOULD match a folder named "grief-work", and
    # "diagnos" SHOULD match "diagnosis" and "diagnosed" alike. That is why
    # they are stems.
    #
    # Roster terms are not chosen at all — they are whatever the user named
    # her own folders, and folder names are short, common, and frequently
    # prefixes of each other. Matched as substrings against the folder facet,
    # a roster entry "Journal" makes the DELIBERATELY SURFACEABLE
    # "Journal analysis" read heavy, and she never said anything about it:
    # she fenced one folder and silently caught its neighbour.
    #
    # So the folder facet is compared WHOLE — it is a discrete stored value,
    # not prose, exactly as _reflection_anchor_match already treats it — while
    # title and tags keep the substring path, because those ARE prose and a
    # roster word appearing inside a title is a real signal.
    folder = str(item.get("folder") or "").strip().lower()
    prose = _reflection_roster_prose(item)
    for term in (roster_terms or ()):
        # 26.96-29 (her D-C ruling, 2026-08-22 -- TIER 2, chosen from
        # agent-written labels: "Also fix the two things behind it").
        # ⛔ THE SHIPPED SPELLING, RE-JOINED -- never a normaliser written
        # here. This used to be `str(term).strip().lower()`, straight off the
        # raw roster entry. The comparison two lines below is WHOLE against
        # the folder facet, so an entry carrying a stray separator produced
        # the term `journal/`, which equals no folder -- and this guard, the
        # one that stops a single sitting handing her several hard things at
        # once, quietly stopped recognising that folder of hers. A character
        # most people would think harmless switched off an ambush guard.
        #
        # roster_segments IS the one spelling of what a roster entry means
        # and three matchers are already pinned to it; re-joining ITS pieces
        # normalises the separator and NOTHING ELSE -- a nested entry's term
        # comes back byte-identical to what it was. Proved by enumeration,
        # before and after, in tests/test_roster_entry_shape.py.
        #
        # ⛔ NOTHING IS TRIMMED WHERE SHE TYPES. Her C2 ruling of 2026-08-20
        # stands: the entry is stored verbatim, because a change that
        # silently alters what an existing entry covers is the harm these
        # rules exist to prevent.
        #
        # ⛔⛔ AND IT LIVES HERE RATHER THAN AT THE CALLER FOR A REASON THE
        # RECORD SHOULD KEEP. The first version normalised the caller's
        # `_roster_terms` derivation inside `build_librarian_payload` -- and
        # `test_stage_public.py`'s D-12 gate went red, because that
        # function's source slice is PINNED BY SHA256. The gate was right and
        # the answer was to move the repair, not the pin: this is the guard
        # that reads the term, every caller passing raw entries is fixed by
        # it, and `build_librarian_payload` stays byte-identical to its
        # recorded baseline so no waiver is spent and nothing else riding
        # behind that gate is silently waived with it.
        folded = "/".join(roster_segments(term)).lower()
        if not folded:
            continue
        if folded == folder:
            return True
        if folded in prose:
            return True
    return False


def _reflection_anchor_match(item, anchors):
    """True when one item matches at least one identity anchor — the ONLY
    thing the bounded reach-back (pass C) may admit. PURE.

    SCHEMA NOTE (26.87-06 settling 26.87-01's flagged guess): `anchors` is
    a mapping {"topics": [...], "tags": [...], "folders": [...]} —
    `folders` compared against the folder facet case-folded and WHOLE (the
    facet is a discrete stored value, not prose), `tags` against the item's
    own tags case-folded and whole, and `topics` as free-form slugs matched
    as substrings across title + folder + tags. Anything falsy (the default)
    matches NOTHING, which is what keeps the reach-back inert by default.

    SETTLED (26.87-08, which owns derive_identity_anchors): the shape above
    is KEPT VERBATIM and this matcher is UNCHANGED. The derivation extends
    the mapping ADDITIVELY — it adds `themes`, `folder_rows`, `phrases`,
    `evidence` and `thin` for the page and for the D-32 floor gate, and this
    function simply never reads them. Three reasons the additive route won
    over a reshape: (a) the three match lists already say exactly what a
    matcher needs and nothing it does not; (b) the ten ReflectionHeavyCapTest
    cases are a shipped contract now, not a draft, and a reshape would have
    put them at risk for no behavioural gain; (c) the pinned BEHAVIOUR —
    anchors give the reach-back something legal to admit — is preserved by
    construction when the matcher does not change at all. The 26.87-08
    derivation fills `folders` with the top folder facets, `tags` with the
    derived theme tokens (the precise whole-compare path) and `topics` with
    free-form `topic` slugs only (the substring path stays narrow on
    purpose: a short theme token matched as a substring would start reading
    TITLES, and no title may ever behave like a derived token)."""
    if not isinstance(anchors, dict):
        return False
    folder = str(item.get("folder") or "").strip().lower()
    tags = {str(t).strip().lower() for t in (item.get("tags") or [])}
    for entry in (anchors.get("folders") or ()):
        folded = str(entry or "").strip().lower()
        if folded and folded == folder:
            return True
    for entry in (anchors.get("tags") or ()):
        folded = str(entry or "").strip().lower()
        if folded and folded in tags:
            return True
    hay = _reflection_heaviness_haystack(item)
    for entry in (anchors.get("topics") or ()):
        folded = str(entry or "").strip().lower()
        if folded and folded in hay:
            return True
    return False


# ---------------------------------------------------------------------------
# ---- identity anchors: constants + pure predicates -------------------------
# (26.87-08, D-06/D-07/D-08/D-30/D-32, SRM-13)
#
# The half of the journal-reflection discipline this room genuinely lacked:
# IDENTITY CALIBRATION. Built as DETERMINISTIC CODE OUTPUT, never librarian
# prose — zero model calls, zero new fence surface, unit-testable without a
# model, and, the decisive reason, it CANNOT HALLUCINATE A SELF FOR HER,
# which is adjacent to the reflection prompt's existing ban on re-captioning
# what an item meant.
#
# The four signals (D-07) and ONLY these four:
#   1. own-voice authorship, inferred from the item's ORIGIN PATH   x3
#   2. her own verbatim comments on an item                          x3
#   3. blessed state                                                 x2
#   4. a `glad` reaction                                             x2
# A not_really reaction is an ABSENCE and is never a signal, and neither is
# the resting state (law 3 bars the app from reasoning about absence). The
# x3/x2 split is HER Phase 15 prior — authorship/own-voice was the #1 spark
# axis (D2/D14) — not a universal constant (VALIDATION A4).
#
# WHAT IS EXCLUDED, and why each exclusion is its own rule:
#   * Anything the SHIPPED fence predicate excludes (never_show, retired,
#     trigger-marked, or matched by an active filter) contributes nothing —
#     and the derivation CALLS _librarian_fenced rather than re-implementing
#     it. One implementation, because a second one drifts and drift is a
#     leak.
#   * Items the app itself wrote (source == "librarian", and the vault's own
#     reflection-insight notes) contribute NOTHING to any signal (SE-11), or
#     the room starts deriving her identity from its own prose.
#   * A THEME TOKEN comes from tags, the folder facet and the `topic` slug —
#     NEVER a title and NEVER a body — so a fenced item's title cannot leak
#     in through a near-duplicate.
# ---------------------------------------------------------------------------

# The weights (D-07). Per ITEM per signal, never per tap and never per
# comment: a chatty item or a re-tapped glad must not be able to talk the
# floor down on its own.
IDENTITY_WEIGHT_OWN_VOICE = 3
IDENTITY_WEIGHT_COMMENT = 3
IDENTITY_WEIGHT_BLESSED = 2
IDENTITY_WEIGHT_GLAD = 2

# D-32 (AI-SPEC Finding B): the EVIDENCE FLOOR, in weighted signal points.
# THE ARITHMETIC, written out because the number is the whole argument:
#   * a fresh vault, or a store right after the librarian/ factory reset,
#     scores 0 x anything = 0
#   * the tester with four blessings and nothing else scores
#     4 items x IDENTITY_WEIGHT_BLESSED (2) = 8
# 12 sits above both, so both land BELOW the floor — and that four-blessing
# tester is precisely the case Finding B names. 12 is also reachable by
# ordinary use without ceremony: two own-voice items she commented on
# (2 x (3 + 3)) clears it, as does one blessed own-voice item she commented
# on and reacted glad to (3 + 3 + 2 + 2 = 10) plus any one more signal.
#
# BOUND TO WEIGHTED EVIDENCE COUNT ONLY. Never days elapsed, never a count
# of items she "should" have blessed. Both of those would be an absence
# surface wearing a threshold, and law 3 forbids the app to reason about
# absence at all. Nothing about this floor is EVER surfaced in the app: no
# banner, no "still learning" state, no meter, no percentage, no count, no
# nudge — a "still getting to know you" surface is a progress meter on her
# self. The only visible difference is that the essay writes less, and that
# is content, not chrome.
IDENTITY_EVIDENCE_FLOOR = 12

# The page's caps (D-08, RESEARCH Discretion #4). These are the reason the
# page is BOUNDED BY CONSTRUCTION and needs no scroll or truncation design:
# 8 themes + 5 folders + 6 phrases of at most 200 chars is ~1.2 KB, which is
# negligible against REFLECTION_DOC_BUDGET and small enough that no single
# phrase can crowd an essay.
IDENTITY_THEME_CAP = 8
IDENTITY_FOLDER_CAP = 5
IDENTITY_PHRASE_CAP = 6
IDENTITY_PHRASE_MAX = 200

# D-30, signal 4 — THE CROSS-LANGUAGE LITERAL. A glad tap is written by
# core.js applyReaction as a SAME-STATE transition carrying this exact via
# string (core.js: `applyTransition(item, item.state, 'reaction:glad', ...)`,
# pinned byte-for-byte in tests/test_core.cjs), and the ONLY shipped reader
# of it is JavaScript: app.js manageStatCounts compares
# `via === 'reaction:glad'`. This constant MIRRORS that literal rather than
# inventing a second spelling, and IdentityAnchorTest asserts the two
# readers agree on the whole token set — two independent readers of the same
# client-written marker otherwise drift silently, and a drifted reader here
# would quietly stop counting a whole signal. The marker rides through the
# server client-supplied and unvalidated, so every read below tolerates a
# missing history list, a missing via, and an unknown via value.
IDENTITY_GLAD_VIA = "reaction:glad"

# D-07 signal 1 (RESEARCH A4, an ASSUMPTION recorded as one): there is no
# author field on an item, so authorship is inferred from the one
# deterministic thing an item does carry — its ORIGIN PATH. A user whose
# folders are named differently gets no own-voice weighting from this seed
# at all, which is exactly why the weight function ALSO treats any item
# carrying her own comment as own-voice-adjacent: a comment IS her voice,
# and that softens the seed's dependence on one person's folder naming.
# Matched WHOLE and case-folded against every segment of origin_path and
# against the stored folder facet — never as a substring, so "notes" can
# never claim "footnotes". Generic names only: like every other shipped term
# tuple this is a publish-gate surface, so no employer, no institution, no
# medical or legal vocabulary lives here.
OWN_VOICE_FOLDERS = (
    "journal", "journals", "diary", "diaries",
    "notes", "my notes", "reading notes",
    "reading notes and casual writing",
    "writing", "writing ideas", "drafts", "essays",
    "random ideas", "personal kb",
)


def _identity_self_authored(item) -> bool:
    """True when the APP wrote this item, not her (SE-11). Two classes:

      1. source == "librarian" — a session-generated reflection materialized
         by add_generated_reflection.
      2. is_reflection() — the vault's journal-reflection outputs. Those are
         a machine's prose about her, filed under her vault; counting them
         would let the room read its own observations back as her voice.

    Excluded from EVERY signal, not merely from the own-voice one: theme
    tokens, blessed weight and glad weight alike. Pure, fail-closed on a
    non-dict."""
    if not isinstance(item, dict):
        return True
    return item.get("source") == "librarian" or is_reflection(item)


def _identity_own_voice(item) -> bool:
    """True when the item's ORIGIN PATH says she wrote it (D-07 signal 1) —
    any path segment, or the stored folder facet, equal (case-folded, WHOLE)
    to an OWN_VOICE_FOLDERS seed entry. Pure path math: no file read, no
    store access, no clock."""
    if not isinstance(item, dict):
        return False
    seeds = {s for s in OWN_VOICE_FOLDERS}
    folder = str(item.get("folder") or "").strip().lower()
    if folder and folder in seeds:
        return True
    origin = str(item.get("origin_path") or "")
    if not origin:
        return False
    # split by hand rather than through Path: origin_path is DATA (it may
    # carry either separator, and it is never resolved or opened here), and
    # a plain split keeps this predicate pure path MATH with no filesystem
    # semantics behind it at all.
    for part in origin.replace("\\", "/").split("/"):
        seg = part.strip().lower()
        if seg and seg in seeds:
            return True
    return False


def _identity_own_voice_adjacent(item, comments=None) -> bool:
    """Own-voice by path OR by the fact that she wrote a comment on it —
    RESEARCH A4's own mitigation, applied in the one place both the weight
    and the pool lean read it so the two can never disagree. Pure."""
    if comments is None:
        comments = _item_comments(item) if isinstance(item, dict) else []
    return bool(comments) or _identity_own_voice(item)


def _identity_glad(item) -> bool:
    """True when the item's history carries at least one glad tap (D-30).
    Reads IDENTITY_GLAD_VIA only — a not_really or never_again entry is
    never a signal (D-07, law 3: an absence is not evidence). Tolerant by
    construction: a missing or non-list history, a non-dict entry, a missing
    via and an unknown via value all read as 'no glad', never as an error —
    the marker arrives client-supplied and unvalidated. Pure."""
    if not isinstance(item, dict):
        return False
    history = item.get("history")
    if not isinstance(history, list):
        return False
    for entry in history:
        if isinstance(entry, dict) and entry.get("via") == IDENTITY_GLAD_VIA:
            return True
    return False


def _identity_item_weight(item, comments=None) -> int:
    """One item's weighted evidence: the sum of whichever of the four D-07
    signals it carries, and 0 when it carries none (an unjudged, uncommented
    item is not evidence about her — it is just a file). Deliberately silent
    about not_really and resting: those are absences, and absence is never
    weighed. Pure; the CALLER applies the fence and the SE-11 exclusion
    first."""
    if not isinstance(item, dict):
        return 0
    if comments is None:
        comments = _item_comments(item)
    weight = 0
    if _identity_own_voice_adjacent(item, comments):
        weight += IDENTITY_WEIGHT_OWN_VOICE
    if comments:
        weight += IDENTITY_WEIGHT_COMMENT
    if item.get("state") == "blessed":
        weight += IDENTITY_WEIGHT_BLESSED
    if _identity_glad(item):
        weight += IDENTITY_WEIGHT_GLAD
    return weight


# 26.87 UAT F1 (owner-approved 2026-07-31). A token that names WHEN a file
# arrived, or WHERE the machinery put it, is not a thing the room noticed
# about her. Before this filter her page's eight themes were six ChatGPT-
# archive month folders, one import-staging directory, and exactly one real
# subject — a page titled "what the room has noticed about you" answering
# "2024-11", which reads as filename pattern-matching rather than attention.
#
# WHY A FILTER AND NOT A HIGHER FLOOR. IDENTITY_EVIDENCE_FLOOR guards against
# THIN evidence. Her evidence count is 1315 against a floor of 12, so the
# floor was never going to fire; the failure mode here is ABUNDANT BUT
# MEANINGLESS evidence, which no threshold on quantity can detect. The two
# gates are orthogonal and both are needed.
#
# THE FENCE IS UNTOUCHED AND THIS IS NOT A SAFETY CHANGE. Nothing leaked;
# _librarian_fenced and the SE-11 exclusion already ran before any token
# reaches here. This narrows RELEVANCE only, and it narrows — it can never
# admit a token the fence excluded.
#
# `evidence` is deliberately NOT affected: evidence counts ITEMS (weighted by
# her own signals), and an item with a date-shaped tag is still an item she
# blessed or commented on. Filtering the LABEL must not rewrite the count, or
# the floor would start meaning something different than it does elsewhere.
_IDENTITY_DATE_TOKEN = re.compile(r"^\d{4}(?:[-_/]\d{1,2}){0,2}$")
# Directory names the STORE ITSELF creates. They are facts about this app's
# layout, never about her: `items` is the store's own item directory, and
# `studyroom-collect-*` is a per-run import staging directory (322 items in
# her live library carry it), so its name is literally a random run id.
_IDENTITY_ARTIFACT_TOKENS = frozenset((
    "items", "attachments", "untitled", "(root)", ".obsidian",
))
_IDENTITY_ARTIFACT_PREFIX = "studyroom-collect-"


def _identity_meaningless_token(label) -> bool:
    """True when a derived label says WHEN a file arrived or WHERE the
    machinery filed it, rather than anything about her (F1).

    Deliberately NARROW: date shapes, this app's own directory names, and
    nothing else. It never inspects meaning, never scores a token, and never
    consults a stop-word list of ordinary English — a filter that started
    judging which of HER subjects were interesting would be the sentiment
    verdict law 2 forbids. Pure."""
    text = str(label or "").strip().lower()
    if not text:
        return True
    if _IDENTITY_DATE_TOKEN.match(text):
        return True
    if text in _IDENTITY_ARTIFACT_TOKENS:
        return True
    return text.startswith(_IDENTITY_ARTIFACT_PREFIX)


def _identity_theme_tokens(item):
    """The theme tokens one item may contribute: the SHIPPED structural
    derivation _insight_theme_keys (its tags plus its stored folder facet —
    reused, never re-implemented, so themes and the fence never disagree
    about what folder an item is from) PLUS its `topic` slug when the store
    carries one.

    NEVER A TITLE AND NEVER A BODY. That is the T-27-18 mitigation in one
    line: a fenced item's title cannot reach this file through a surviving
    near-duplicate, because no title ever becomes a token in the first
    place. Pure."""
    keys = list(_insight_theme_keys(item))
    topic = str(item.get("topic") or "").strip()
    if topic and topic not in keys:
        keys.append(topic)
    return keys


def identity_anchors_active(anchors) -> bool:
    """True when an anchor set may STEER anything — the D-32 gate, in one
    predicate so the pool lean (pass A here) and the prompt injection
    (26.87-10) can never gate differently.

    Two conditions, both required: the set records weighted evidence AT OR
    ABOVE IDENTITY_EVIDENCE_FLOOR, and it actually carries an anchor. A set
    with NO recorded evidence reads as unknown and therefore as inactive —
    fail-closed, the same err-toward-holding-back posture the fence takes on
    an unknown state. Pure."""
    if not isinstance(anchors, dict):
        return False
    evidence = anchors.get("evidence")
    if isinstance(evidence, bool) or not isinstance(evidence, int):
        return False
    if evidence < IDENTITY_EVIDENCE_FLOOR:
        return False
    return any(anchors.get(k) for k in ("topics", "tags", "folders"))


def _item_comments(item):
    """One item's comments serialized for a reflection payload row — each
    entry reduced to exactly {'at', 'text'} (no other field ever rides);
    an item without comments carries an empty list, never a missing key
    (D-33: her own comments are the insight fuel the pool exists to
    carry). Pure: copies, never mutates."""
    comments = []
    for c in (item.get("comments") or []):
        if isinstance(c, dict):
            comments.append({"at": c.get("at"), "text": c.get("text")})
    return comments


def _matches_active_filter(item, filters):
    """True when `item` matches ANY entry of an active meta.filters list —
    the python port of core.js matchesFilter (core.js:149-161, one strict
    compare per facet) folded over the list the way itemExcluded folds it
    (core.js:174-178, union semantics). Facets: source / type / year /
    folder / tag — exactly the ALLOWED_FACETS the server validates
    fail-closed at the write, so stored values are always a str or an int
    (a string-typed year therefore never matches an int year, the ===
    parity). An unknown facet matches nothing — none can enter the store.
    Pure: no I/O, no mutation."""
    for f in (filters or []):
        if not isinstance(f, dict):
            continue
        facet = f.get("facet")
        value = f.get("value")
        if facet == "source":
            if item.get("source") == value:
                return True
        elif facet == "type":
            if item.get("type") == value:
                return True
        elif facet == "year":
            if item.get("year") == value:
                return True
        elif facet == "folder":
            if item.get("folder") == value:
                return True
        elif facet == "tag":
            if value in (item.get("tags") or []):
                return True
    return False


def _names_off_limits_path(raw):
    """True when a store row's path names a file the librarian may never read.

    ⚠ TWO FILES ARE OFF-LIMITS TODAY, and both live in the room's own config
    directory: the KEYS file (26.93-04, #28) and the CALL RECORD (26.99-05).
    This is a natural extension of the fence rather than a new kind of rule —
    the fence's whole job is to name what is off-limits inside the archive, and
    the file holding a credential is off-limits the same way a never-shown item
    is. (Map ticket #32 — what the fence PROMISES now there is no subprocess —
    is open and downstream. This names refusals; it does not answer #32.)

    ⚠ WHY THE CALL RECORD JOINS, written here because a refusal without a
    reason is a rule the next reader deletes. That file is the evidence D-02
    asks the room to keep of what it sent to a model. A payload that could
    carry it would make the evidence part of the thing it is evidence about:
    the reader of a leak would find, inside the leak, the room's own account of
    the leak. Its contents look harmless — six small numeric-and-name fields
    per line, no item id, no title, no path (law 5 / L-06) — and that is beside
    the point. The refusal is about what the file is FOR.
    WHAT WOULD OVERTURN IT: the owner saying so. Nothing else; not a feature
    that would find the record convenient, and not a narrower scope that
    promises to read only the dull fields.

    ⚠ THE THIRD FILE IN THAT DIRECTORY IS DELIBERATELY NOT HERE. `settings.json`
    holds which model fills which tier; its own docstring says nothing secret is
    ever written there and that the split is what lets it be pasted into a bug
    report. A fence that widened to it would be refusing a file for being
    NEARBY, and `tests/test_librarian_fence.py` pins the set at exactly two of
    the three.

    A store-RELATIVE path cannot name either one: `_read_body_capped` already
    jails those under the library root and counts a refusal out loud, and the
    owner's 2026-08-16 ruling put the call record OUTSIDE that root, beside the
    keys file, rather than under `librarian/`. So the cheap absolute-path test
    below is still not an optimisation with a hole in it — it is the whole of
    the case that can reach outside the archive at all. ⚠ That sentence is now
    load-bearing for two files instead of one: a future decision to move the
    record inside a library would put `librarian/<name>` back in reach as a
    relative spelling this test cannot see, and closing it would belong HERE or
    in `_librarian_fenced`'s path class — ⛔ never by weakening the jail, which
    exists for a larger reason than this file.

    ⚠ TWO MORE FILES JOINED IN 26.9985, AND THEY BROKE THE ABSOLUTE-ONLY
    SHAPE ON PURPOSE — exactly the widening this docstring's own warning
    reserved a place for ("closing it would belong HERE"). The two subject
    stores, `librarian/subjects.json` (what the finding pass FOUND, kept so
    a no can be re-asked without reading or spending again — R-9) and
    `librarian/kept_back.json` (every line a removal took, kept so a removal
    can be undone — R-6), live INSIDE the library root by her R-12 ruling —
    so a store row CAN name them relatively, and the jail keeps such a
    spelling perfectly readable. ⛔ THE REFUSAL IS FORCED, NOT CHOSEN (R-6):
    each store is, by construction, the most concentrated collection of
    exactly the material she asked the librarian to stop reading — a
    librarian that could read either would defeat the feature in one step.
    They are therefore matched by TAIL, in both relative and absolute
    spellings, ahead of the absolute-only screen the two config-dir files
    still use. WHAT WOULD OVERTURN IT: the owner saying so. Nothing else.

    ⚠ 26.996-10 ADDED TWO MORE mouths in the same folder: the desk card's
    ask record and its permanent quiet answer. Same forced refusal — each
    names a subject she set aside. The trap this phase names is four
    lookalike plain files beside the one that IS sent; these two join the
    off-limits set, never that sent neighbour.

    ⚠ Compared as TEXT, after `~` expansion and `..` normalisation, never
    through `Path.resolve()`: resolving touches the filesystem, and a predicate
    that runs once per item over a sixteen-thousand-item store must not. Both
    targets are rebuilt on every call for the same reason the accessors are —
    a cached path is a stale copy of a home directory that has since changed.
    """
    if not isinstance(raw, str) or not raw:
        return False
    try:
        candidate = os.path.normcase(
            os.path.normpath(os.path.expanduser(raw)))
    except (TypeError, ValueError):
        return True   # an unreadable shape is held back, never handed over
    # 26.9985: the two in-library subject stores, matched by tail so the
    # relative spelling the jail would happily resolve is refused too.
    tail = candidate.replace(os.sep, "/")
    for name in (SUBJECTS_STORE_TAIL, KEPT_BACK_STORE_TAIL,
                 ASIDE_ASKED_STORE_TAIL, ASIDE_QUIET_STORE_TAIL):
        if tail == name or tail.endswith("/" + name):
            return True
    if not (raw.startswith("~") or os.path.isabs(raw)):
        return False
    try:
        targets = [os.path.normcase(os.path.normpath(str(p)))
                   for p in (keys_file_path(), call_record_path())]
    except (TypeError, ValueError):
        return True   # an unreadable shape is held back, never handed over
    return candidate in targets


def _librarian_fenced(item, filters):
    """The exclusion classes, union semantics — core.js itemExcluded
    (core.js:168-179) ported: the never_show / retired states, the trigger
    overlay, and an active filter match, plus the path class 26.93-04
    added below (the keys file, joined by the call record in 26.99-05 —
    `_names_off_limits_path` holds both names), plus the 26.9985 `aside`
    class — ⛔ the ONE class deliberately NOT in core.js: a set-aside
    subject hides from the librarian, never from her (R-10; the arm's own
    comment below carries the ruling). Any ONE class fences the item out
    of the payload ENTIRELY — no id, no title, no metadata — because
    titles are content fragments, and "never readable" is only bulletproof
    when the item does not exist in the payload at all (SRM-13 criterion
    3, the err-toward-holding-back reading). A missing/null item is fenced
    (the itemExcluded null guard, fail-closed)."""
    if not item:
        return True
    # 26-01 review M3: an UNKNOWN state is fenced, not included — a
    # future state name or a malformed entry defaults to held back
    # (err-toward-holding-back), never to riding a cloud payload.
    if item.get("state") not in VALID_STATES:
        return True
    if item.get("state") in ("never_show", "retired"):
        return True
    if item.get("trigger") is True:
        return True
    # 26.9985 (R-10): THE FIFTH CLASS, AND IT IS DELIBERATELY ASYMMETRIC.
    # `aside` marks an item as belonging to a subject she set aside — hidden
    # from the LIBRARIAN, not from her. Her ruling, verbatim from the ledger:
    # "Hide them from the librarian, not from me", over the folder shape
    # (hidden from her too) and over choosing each time. So this arm exists
    # HERE and must NEVER be ported into core.js `itemExcluded` — every
    # existing class hides from both sides, which is exactly what she ruled
    # against, and `tests/test_subject_aside.cjs` drives the shipped
    # `itemExcluded`/`guardSurface` to prove an aside item still reaches her
    # own shelf. ⚠ A future "keep the port in sync" tidy-up that copies this
    # arm across is overruling her.
    #
    # The field is written only when SHE confirms a set-aside (R-1: the
    # librarian proposes, nothing is set aside unless she says so) and holds
    # the subject keys it came from, so turning one subject off cannot
    # un-hide another's items. Any truthy value fences — a malformed shape
    # errs toward holding back, the same direction as the unknown-state arm.
    if item.get("aside"):
        return True
    # 26.93-04 (#28) and 26.99-05 (L-07): the keys file and the call record are
    # off-limits to the librarian, and a store row pointing at either — hand-
    # edited, or a future adapter's mistake — is fenced entirely, exactly as a
    # never-shown item is. Both path fields are checked because either one is
    # enough to name a file. The predicate holds the names and the reasons.
    if (_names_off_limits_path(item.get("library_path"))
            or _names_off_limits_path(item.get("origin_path"))):
        return True
    return _matches_active_filter(item, filters)


def _read_body_capped(store_dir, item, cap=LIBRARIAN_BODY_CAP):
    """(text, was_capped) — at most the first `cap` bytes of the item's
    snapshot under `store_dir`, decoded UTF-8 with errors='replace'.
    Returns (None, False) when the snapshot is unreadable so the caller
    can count it out loud (the walk_source fail-visible posture). Never
    raises, never writes.

    JAIL (26-01 review H1): library_path is DATA, not a trusted path — a
    hand-edited or malformed store entry carrying an absolute path or
    ../ traversal must never pull an arbitrary local file into a cloud
    payload. The resolved snapshot must live under store_dir or it is
    treated as unreadable (counted, never read). ⚠ The jail itself now lives
    in `_snapshot_path` and is CALLED here rather than spelled here — #58
    needed the same fence for the words comparison, and two spellings of one
    fence drift."""
    path = _snapshot_path(store_dir, item)
    if path is None:
        return None, False   # outside the library: refused, counted
    try:
        size = path.stat().st_size
        with open(path, "rb") as f:
            data = f.read(cap)
    except OSError:
        return None, False
    return data.decode("utf-8", errors="replace"), size > cap


# ---------------------------------------------------------------------------
# ---- the EVENING LINE — what stands out about tonight's pool --------------
# ---- (26.995-04, D-14 / D-35 / D-38) --------------------------------------
#
# D-14: THE MATERIAL PICKS. Today the room is handed a pool and no account of
# what KIND of evening it is, so it writes the same essay whether the pool
# holds three things or twenty-four. This is the sentence that tells it, and
# D-35 extends the same ruling to length — an evening holding twenty-four
# things may still get four sentences.
#
# A DATA TABLE plus a pure function over it, copying OPENING_SHAPE_TABLE's
# form for the reason stated at that table: a derivation needed in more than
# one place must be a CONSTANT, because a constant can be lifted as text and a
# function cannot. Rows are read IN ORDER; a fact that has already spoken is
# skipped, so a later edit that overlapped two thresholds on one fact still
# cannot make the room say the same thing twice.
#
# ⛔ ONLY WHAT IS NOTABLE. A fact is spoken only when it crosses a threshold.
# When nothing crosses, the derivation returns NOTHING AT ALL — not an empty
# string, not a sentence saying nothing stands out — and the caller then omits
# the document key ENTIRELY. That is D-14's "an unremarkable evening gets NO
# sentence at all", and it is the same shape as the shipped evidence floor,
# where _reflection_identity_block answers None and the turn document carries
# no anchors key at all. The absence IS the instruction.
#
# ⛔ ONE PLAIN SENTENCE, IN THE ROOM'S OWN REGISTER — never a labelled list of
# fields. A labelled list reads as data and invites a report ABOUT the data,
# which is the exact failure her three blind verdicts named ("an AI just
# analyzing a pile of files"). None of the fact names below ever reaches her.
#
# ⛔ PURE, AND THE SIGNATURE IS THE FENCE. derive_evening_line takes THE POOL
# AND NOTHING ELSE — no store, no library root, no store directory, no item
# list. 26.995-RESEARCH names the hazard exactly: the shelf-label resolver at
# the SAME route reads UNFENCED data, and copying that habit here would put
# unfenced material into the reflection document. build_librarian_payload is
# the one audited fence builder, the pool it returns is already fenced, and
# this reads that and stops. It counts rows and characters; it reports no
# title and no body text.
#
# ⚠ THE NUMBERS. The five below marked HERS were ruled by the owner on
# 2026-08-19 — and they were THE AGENT'S PROPOSAL, which she was told before
# she ruled. They have NOT been measured against her real evenings. If the
# Evening line reads wrong in use, the numbers are the first thing to suspect,
# not the code.
#
# ⚠⚠ AND ONE OF THEM IS NOT HERS AT ALL. D-14 names four facts and supplies
# thresholds for only THREE; "how much of it is her own writing" arrived with
# no number. EVENING_OWN_WRITING_PERCENT below is the agent's proposal, NOT
# ruled by her and NOT YET SEEN BY HER. It is named as such here and in
# 26.995-04-SUMMARY.md so it reaches the end-of-phase verification as an open
# question rather than as a decision made quietly.
#
# ⚠ WHAT THE POOL CAN AND CANNOT SEE, said out loud rather than left to be
# discovered. A pool BODY row carries only (id, title, text, comments) plus
# the emphasis flags — it carries NO created_ms and NO source. So:
#   * the time spread reads every date the pool actually carries (a meta row's
#     created_ms, and any comment stamp that parses) and needs two dated rows
#     before it will speak at all. On a pool that is all bodies with no
#     comments there are no dates, and the fact stays silent rather than
#     guessing.
#   * "her own writing" reads the ONE own-voice signal a pool row carries —
#     that she wrote a comment on it — through _identity_own_voice_adjacent
#     itself rather than a second copy of it, so the two can never disagree.
#     On a pool row the path half of that predicate finds no folder and no
#     origin, and degrades to exactly "does this row carry a comment of hers".
# ⛔ Widening either of these by adding created_ms or source to a body row is
# a change to what crosses the fence, not a tidy-up. It is not done here.
#
# ⛔ FOUR FACTS, NOT FIVE. Photographs-versus-writing was deliberately held
# out by the owner as its own decision — do not add a fifth row.
#
# ⛔⛔ WHY THIS BLOCK SITS *ABOVE* build_librarian_payload AND MUST STAY THERE.
# It reads the builder's output, so below it is where it belongs to a reader —
# and below it is exactly where it may not go. tests/test_stage_public.py's
# D-12 pin hashes the builder's SOURCE SLICE, and that slice is taken from its
# `def` line to the NEXT TOP-LEVEL `def`, which means it includes every
# trailing comment in the gap after the function. This block was first written
# into that gap and turned the pin red on a function it had not touched a byte
# of. The pin was RIGHT and was not re-baselined: the slice is byte-identical
# to the recorded baseline with the block up here. Moving it back down is a
# one-line change that reopens a red nobody would be able to diagnose from the
# message.
# ---------------------------------------------------------------------------

EVENING_FEW_PIECES = 4              # hers, 2026-08-19 (the agent's proposal)
EVENING_MANY_PIECES = 20            # hers, 2026-08-19 (the agent's proposal)
EVENING_TIGHT_DAYS = 45             # hers, 2026-08-19 (the agent's proposal)
EVENING_WIDE_DAYS = 365             # hers, 2026-08-19 (the agent's proposal)
EVENING_DOMINANT_PERCENT = 60       # hers, 2026-08-19 (the agent's proposal)
# ⚠⚠ THE AGENT'S NUMBER — NOT HERS, AND NOT YET SEEN BY HER. See the block
# above: D-14 supplied no threshold for this fact.
EVENING_OWN_WRITING_PERCENT = 50

# (fact, direction, threshold, wording). "at-most" and "at-least" are both
# INCLUSIVE at their own boundary — every one of them is a ruling, and the
# comparison below is integer arithmetic on both sides so an inclusive
# boundary can never become a rounding artifact (the 26.995-03 lesson).
EVENING_NOTABLE_TABLE = (
    ("pieces", "at-most", EVENING_FEW_PIECES,
     "there is not much here tonight — {pieces}"),
    # ⛔ PINNED VERBATIM BY D-38: plan 07's short example is written to be
    # seen answering THIS sentence. Rewording it silently orphans that
    # example, which is the whole reason this task lands before the prompt.
    ("pieces", "at-least", EVENING_MANY_PIECES,
     "there is a lot here — {pieces}"),
    ("days", "at-most", EVENING_TIGHT_DAYS,
     "it is all from about the same stretch of time"),
    ("days", "at-least", EVENING_WIDE_DAYS,
     "it reaches back across the years"),
    ("own-writing", "at-least", EVENING_OWN_WRITING_PERCENT,
     "most of it is your own writing"),
    ("dominant", "at-least", EVENING_DOMINANT_PERCENT,
     "one piece is most of what there is to read"),
)

_EVENING_DAY_MS = 86400000


def _evening_rows(pool):
    """Every usable row of a pool — bodies and meta rows together, because
    "how many pieces" means pieces, not pieces the room could read. FAIL
    CLOSED: anything that is not a dict of lists of dicts contributes
    nothing, and nothing here ever raises. Pure."""
    if not isinstance(pool, dict):
        return []
    rows = []
    for key in ("bodies", "meta_rows"):
        seq = pool.get(key)
        if isinstance(seq, list):
            rows.extend(r for r in seq if isinstance(r, dict))
    return rows


def _evening_row_comments(row):
    """One row's comment dicts. Pure, fail-closed."""
    seq = row.get("comments")
    return [c for c in seq if isinstance(c, dict)] \
        if isinstance(seq, list) else []


def _evening_row_text_len(row):
    """How much there is to READ in one row, in CHARACTERS: its body text
    (meta rows have none) plus the text of her comments on it.

    CHARACTERS, NOT WORDS, and deliberately: this pool carries CJK, where
    words are not separable by whitespace at all — the same denominator
    problem 26.995-03's address check had to abstain on. A character count
    is the honest unit here and it is the same unit on both sides of the
    share, so the ratio means the same thing whatever she saved. Pure."""
    n = 0
    text = row.get("text")
    if isinstance(text, str):
        n += len(text)
    for c in _evening_row_comments(row):
        if isinstance(c.get("text"), str):
            n += len(c["text"])
    return n


def _evening_row_dates_ms(row):
    """Every epoch-ms date ONE POOL ROW carries: its created_ms when it has
    one (meta rows do; body rows do not), plus every comment stamp that
    parses. An unparseable stamp contributes nothing — fail-closed, exactly
    as _reflection_stamp_ms treats one. Pure."""
    out = []
    created = row.get("created_ms")
    if isinstance(created, (int, float)) and not isinstance(created, bool):
        out.append(int(created))
    for c in _evening_row_comments(row):
        ms = _comment_stamp_ms(c.get("at"))
        if ms is not None:
            out.append(ms)
    return out


def evening_measures(pool):
    """The four facts as NUMBERS, before any of them is judged notable.

    Returns {} for a pool with no rows. A fact the pool cannot answer is
    ABSENT from the mapping rather than present as a zero — a zero is a
    measurement and an absence is not, and confusing the two is how a fact
    about the pool's SHAPE gets reported as a fact about her material.

    Share facts ride as an exact (numerator, denominator) PAIR rather than a
    computed percentage, so the comparison against a ruled threshold stays
    integer arithmetic on both sides. Pure."""
    rows = _evening_rows(pool)
    if not rows:
        return {}
    measures = {"pieces": len(rows)}

    # DOMINANCE IS A COMPARISON, and a comparison needs something to compare
    # against. ⛔ Found by this plan's own one-item control, which is what a
    # control is for: on a pool of exactly ONE row that row necessarily holds
    # 100% of the text, so a share test alone would have the room announce
    # that one piece is most of what there is to read on an evening holding
    # one piece — a fact about the pool's SHAPE dressed up as a fact about her
    # material. Two rows minimum, the same rule and the same reason as the two
    # dated rows the spread needs below.
    lengths = [_evening_row_text_len(r) for r in rows]
    total = sum(lengths)
    if len(rows) >= 2 and total > 0:
        measures["dominant"] = (max(lengths), total)

    own = sum(1 for r in rows
              if _identity_own_voice_adjacent(
                  r, comments=_evening_row_comments(r)))
    measures["own-writing"] = (own, len(rows))

    dated = [d for d in (_evening_row_dates_ms(r) for r in rows) if d]
    if len(dated) >= 2:
        flat = [ms for ds in dated for ms in ds]
        measures["days"] = (max(flat) - min(flat)) // _EVENING_DAY_MS

    return measures


def _evening_pieces(n):
    """"1 piece" / "n pieces" — the room does not write "1 pieces"."""
    return "1 piece" if n == 1 else "%d pieces" % n


def derive_evening_line(pool):
    """ONE plain sentence naming only what stands out about tonight's pool,
    or None when nothing does (D-14).

    PURE, and it takes THE POOL AND NOTHING ELSE — see the block above: the
    signature is the fence. No store, no library root, no notebook, no clock,
    no I/O. It counts rows and characters and reports no title and no body
    text. Never raises: every bad input answers None."""
    measures = evening_measures(pool)
    if not measures:
        return None
    spoken = set()
    parts = []
    for fact, direction, threshold, wording in EVENING_NOTABLE_TABLE:
        if fact in spoken or fact not in measures:
            continue
        value = measures[fact]
        if isinstance(value, tuple):
            num, den = value
            fires = (num * 100 >= threshold * den) if direction == "at-least" \
                else (num * 100 <= threshold * den)
        else:
            fires = (value >= threshold) if direction == "at-least" \
                else (value <= threshold)
        if not fires:
            continue
        spoken.add(fact)
        parts.append(wording.format(
            pieces=_evening_pieces(measures["pieces"])))
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0] + "."
    return ", ".join(parts[:-1]) + ", and " + parts[-1] + "."


def build_librarian_payload(store, scope, consent=False, store_dir=None,
                            now_ms=_NO_THRESHOLD,
                            session_marker=_NO_THRESHOLD,
                            spotlight_ids=(), why_wanted_ids=(),
                            shelves=None, anchors=None, journal_ids=None):
    """The ONE byte source for the librarian's agent subprocess (SRM-13).

    TOTAL EXCLUSION RULE: items whose state is never_show or retired,
    items carrying the trigger overlay, and items matching an active
    meta.filters entry are absent ENTIRELY from the return — no id, no
    title, no metadata row — under EVERY scope and consent combination.
    Consent widens UNJUDGED bodies only; the fenced classes never widen
    (D-02's local-line made mechanical: those items stay on this machine,
    not even their titles are handed over).

    Scopes (AI-SPEC "THE FENCE"):
      presort               — blessed text bodies (capped) + metadata-only
                              rows for every other surviving item, EXCEPT
                              unseen items carrying the Plan 26.65-01
                              from_source=='apple-notes' marker: their
                              title is the note's own first line, so the
                              whole row is withheld until blessed
                              (26.65-04, T-26.65-12, law 5)
      presort, consent=True — adds unseen text bodies (the per-run consent
                              card's full run), unseen Apple-Notes items
                              included; resting stays metadata-only
      note                  — blessed text bodies and NOTHING else: zero
                              metadata rows for any other state
      reflection            — 26.7-01 (D-11/D-33, RSF-06/SRM-11): the
                              session pool. The SAME body/row semantics as
                              presort (blessed bodies by default; consent
                              widens unjudged bodies exactly as presort
                              does, D-17; unseen Apple-Notes rows withheld
                              until blessed, law 5) — each row
                              ADDITIONALLY carries the item's own comments
                              (an empty list when it has none, never a
                              missing key), and the pool is bounded by
                              `session_marker`: absent => no marker
                              filtering; None => first session, the whole
                              allowed archive; an int => only items whose
                              newest of (created_ms, saved_ms, newest
                              parsed comment-ms) is STRICTLY GREATER than
                              the marker (a stamp EXACTLY equal to the
                              marker is OLD — SRM-11 adjacency). A comment
                              `at` stamp that fails ISO parsing is OLD,
                              never new (fail-closed). The exclusion and
                              title-shadow screens above run FIRST,
                              unchanged — the fence is extended, never
                              forked. The marker itself is silent
                              machinery: never echoed into any payload
                              field (law 3).

    Bodies come only from text items — image snapshot bytes are never
    decoded into a prompt. Each body is capped at LIBRARIAN_BODY_CAP bytes
    WITH a visible count (D-03) — never a silent cut; an unreadable
    snapshot is counted too and the item falls back to a metadata row
    (presort) or is skipped (note). Metadata rows carry exactly
    (id, title, source, type, created_ms, tags).

    `store_dir` defaults to the store's own meta.library_root; the server
    passes its live root explicitly. Returns {"meta_rows": [...],
    "bodies": [...], "counts": {"bodies-capped": n,
    "bodies-unreadable": n}}. Pure: reads item snapshots from disk, writes
    nothing, never mutates `store`. An unknown scope raises ValueError —
    fail-closed, a mistyped scope must never widen the payload.

    26-03 / 26.4-01: under scope="note", when the caller supplies `now_ms`,
    each body carries a `recent` FLAG so the note prompt can connect the
    present writing to older saves. As of 26.4-01 (D-08, RESEARCH Pitfall 1)
    "now" is SINCE LAST VISIT, not a fixed ~30-day window: the caller passes
    `now_ms` = the PREVIOUS visit's `last_visit_ms` threshold; recent is True
    when it is None (first visit → the whole archive is "now" → the first
    cross-archive connections) and otherwise when the item's newest of
    (created_ms, saved_ms) is STRICTLY GREATER THAN the threshold. A boolean
    marker only: last_visit_ms is silent machinery — never a date echoed
    back, never returned in any payload field, never rendered (law 3). The
    fence above it is unchanged.

    26.8-03 (D-03/D-04/D-10): under scope="reflection" the caller may
    hand `spotlight_ids` (ids she blessed in this session's walk) and
    `why_wanted_ids` (ids whose why she asked the librarian to write).
    Each surviving row whose id is in a set gains the matching boolean
    flag — `blessed_now` / `why_wanted` — exactly the way the note
    scope emits `recent`: builder-emitted, so the flags ride inside
    every recorded-stdin fence scan. EMPHASIS, NEVER GATE: the flags
    never filter, reorder, or admit a row — pool membership with the
    params handed is provably byte-identical to the pool without them
    (the fence and marker screens above ran first, so a fenced id in
    either set flags nothing). Sets empty (the default, and every
    non-reflection scope) emit no flag keys at all — a nothing-blessed
    session's payload is byte-identical to the 26.7 shape.

    26.87-06 (D-10..D-13, D-24, SRM-11 criterion 4): under
    scope="reflection" two further passes run between the admit loop and
    the shipped budget pass.

      `shelves` — the CALLER-RESOLVED {id: shelf-label} map. The labels
      live only in the librarian's suggestions notebook, which this
      builder has never read and still does not read: resolving them here
      would put new file I/O inside the one audited fence. The route
      resolves them exactly the way it already resolves the session
      marker and the spotlight ids. load_suggestions is fail-open by
      design, so a missing / truncated / hand-edited notebook arrives as
      an EMPTY mapping and the cap degrades to the tripwire alone — never
      raising, and never quietly ceasing to protect the sitting. None (the
      default) is a store with no notebook, not a store with no cap.

      `anchors` — the identity anchor set (26.87-08, derive_identity_anchors).
      None (the default) admits NOTHING through the reach-back AND leaves
      pass A inert, so every shipped call site keeps its current behaviour
      byte-for-byte.

    Pass A (the identity lean, D-09/D-32, 26.87-08): when the document must
    be narrowed, the rows shed FIRST are the ones matching no identity
    anchor, so what survives leans toward who she is — deterministically,
    with zero model calls. GATED ON THE EVIDENCE FLOOR: below
    IDENTITY_EVIDENCE_FLOOR (and with the default anchors=None) the pass is
    SKIPPED ENTIRELY and the pool is byte-identical to shipped behaviour.
    Every leaned-away row is counted in counts["identity-leaned"].

    Pass B (the cap, D-10): AT MOST ONE HEAVY ROW is HANDED to the model.
    Enforced HERE, at pool build, because the model cannot violate a cap
    on material it was never given — a bias is a suggestion to a model, a
    cap is a rule you can test. Every held-back row is counted in
    counts["heavy-capped"].

    Pass C (the bounded reach-back, D-13/SE-7): when EVERY eligible row was
    heavy and the cap would leave a single row, up to
    REFLECTION_REACHBACK_CAP identity-anchored rows from BEFORE the marker
    are re-admitted, counted in counts["reach-back"], so an all-heavy
    sitting still has enough to write from.

    All three count keys are declared even when zero, and all three are
    ABSENT from the presort and note payloads — those stay byte-identical to
    their shipped shapes with or without a shelves/anchors argument."""
    if scope not in LIBRARIAN_SCOPES:
        raise ValueError(f"unknown librarian scope: {scope!r} "
                         f"(valid: {', '.join(LIBRARIAN_SCOPES)})")
    meta = store.get("meta") or {}
    filters = meta.get("filters") or []
    root = store_dir if store_dir is not None \
        else meta.get("library_root", "")
    allowed = [it for it in store.get("items", {}).values()
               if not _librarian_fenced(it, filters)]
    # 26-05 UAT (P0, found on the real store): a surviving item whose
    # folded TITLE equals a fenced item's title is that fenced note's
    # shadow (a re-imported edited copy) — its title string reaching the
    # cloud IS the fenced title reaching the cloud. Held back entirely,
    # counted out loud. Import-side judgment inheritance is the root fix;
    # this screen is the fence's own defense in depth.
    fenced_title_keys = {
        _match_name(str(it.get("title") or ""))
        for it in store.get("items", {}).values()
        if _librarian_fenced(it, filters) and it.get("title")}
    fenced_title_keys.discard("")
    shadowed = [it for it in allowed
                if _match_name(str(it.get("title") or ""))
                in fenced_title_keys]
    allowed = [it for it in allowed if it not in shadowed]
    allowed.sort(key=lambda it: str(it.get("id", "")))
    out = {"meta_rows": [], "bodies": [],
           "counts": {"bodies-capped": 0, "bodies-unreadable": 0,
                      "title-shadowed": len(shadowed)}}

    def add_body(it, recent=None, comments=None):
        """Read + append one capped body; False when unreadable. The
        optional `recent` value (note scope, 26-03) rides as a boolean
        flag only — never a date, never content. The optional `comments`
        list (reflection scope, 26.7-01) rides exactly as handed in —
        the D-33 insight fuel, present on every reflection row."""
        text, capped = _read_body_capped(root, it)
        if text is None:
            out["counts"]["bodies-unreadable"] += 1
            return False
        if capped:
            out["counts"]["bodies-capped"] += 1
        entry = {"id": it.get("id"),
                 "title": it.get("title"),
                 "text": text}
        if recent is not None:
            entry["recent"] = recent
        if comments is not None:
            entry["comments"] = comments
        out["bodies"].append(entry)
        return True

    # 26.7-uat (beat-1 finding): reflection rows are tracked (stamp, id,
    # row, list-name) so an overflowing document can shed OLDEST-out
    # after the loop — reflection only; the presort/note payloads stay
    # byte-identical to their shipped shapes (26.7-01 pin).
    _pool_rows = []
    # 26.87-06: the heavy-cap / reach-back state, reflection-scope only.
    # `_heavy_ids` is COLLECTED during the loop but ACTED ON after it (see
    # pass B); `_reachback` holds the rows the marker screen — and only the
    # marker screen — held back, so pass C can never reach past the
    # exclusion, title-shadow or law-5 screens that ran before it.
    _heavy_ids = set()
    _reachback = []
    _all_eligible_heavy = True
    _shelves = shelves if isinstance(shelves, dict) else {}
    # 26.87-08 pass A: the ids of admitted rows matching NO identity anchor,
    # collected during the loop and acted on after it. `_anchors_active` is
    # the D-32 floor gate resolved ONCE — below the floor (or with the
    # shipped default anchors=None) it is False and pass A never runs at
    # all, which is what makes the pool byte-identical to shipped behaviour.
    _unanchored_ids = set()
    _anchors_active = (scope == "reflection"
                       and identity_anchors_active(anchors))
    _roster_terms = ()
    # 26.998-07: HER RANKING'S tier-1 membership, resolved ONCE. ⛔ Passed in
    # by the caller rather than derived here — `journal_tier` is the single
    # spelling of "is this her journal" and calling it from inside this
    # function would put a second store sweep on the hot path AND make the
    # payload builder depend on a derivation the caller may already have run.
    # ⚠ None means the caller did not resolve it: every item then falls
    # through tier 1, which is the SHIPPED shape (no tiering existed before
    # today) rather than a wrong answer dressed as a right one.
    _journal_ids = set(str(i) for i in (journal_ids or ()))
    if scope == "reflection":
        out["counts"]["pool-capped"] = 0
        # 26.998-07: what HER RANKING shed, reported whether or not anything
        # was shed — a key that appears only when non-zero makes "nothing was
        # left out" and "this build cannot tell you" the same shape.
        out["counts"]["ranking-shed"] = 0
        # D-24: the institutional half of the tripwire, derived at RUNTIME
        # from the user's own fenced-roster folder names — never shipped as
        # source. _active_roster reads meta only (no file I/O).
        _roster_terms = tuple(str(f or "").strip().lower()
                              for f in _active_roster(store))
    # 26.8-03: the walk's spotlight sets, resolved once — reflection
    # rows only (the presort/note payloads stay byte-identical).
    _spotlight = set(spotlight_ids or ())
    _why_wanted = set(why_wanted_ids or ())

    def _flag_row(entry):
        """Attach the 26.8-03 emphasis flags to one surviving
        reflection row — additive keys only, never a filter."""
        if entry.get("id") in _spotlight:
            entry["blessed_now"] = True
        if entry.get("id") in _why_wanted:
            entry["why_wanted"] = True

    def _admit_reflection(it):
        """Build and append ONE reflection row for `it` — the shipped
        body-or-metadata admit logic, factored out so 26.87-06's reach-back
        (pass C) produces rows byte-identical in shape to the loop's own
        rather than a second, drifting copy. Every screen (exclusion,
        title-shadow, marker, law-5) has already run on `it` before it
        reaches here; this function admits, it never decides."""
        state = it.get("state")
        is_text = it.get("type") == "text"
        # 26.995-09 (D-23/D-24): THE TWO PILES, AND THIS IS THE WHOLE OF THE
        # LIVE CHANGE. A note she wrote on a PHOTOGRAPH is something she said
        # about her life — material, and it rides. A note she wrote on a
        # REFLECTION is something she said about the room's WRITING, and
        # carrying it here as material is how the room comes to reflect on its
        # own prose. The SHIPPED self-authored predicate decides, called and
        # never re-implemented: it already unions both classes (the room's own
        # minted items and the vault-side reflection notes), and a second
        # source test would be a second definition of "the room's own".
        # ⚠ THE NOTE IS NOT DESTROYED — it stops being MATERIAL here and
        # belongs to the other pile (D-25). Notes on reflections are EXEMPT
        # from that pile's passed-only filter, because a note can only exist
        # on a reflection she KEPT; applying the filter to both piles would
        # leave the note pile empty by construction.
        #
        # 26.995-09 (D-20) rides on the SAME predicate call, deliberately: one
        # decision about who wrote this item, used for both the comment guard
        # above and the marker below, so the two can never disagree.
        room_wrote = _identity_self_authored(it)
        comments = [] if room_wrote else _item_comments(it)
        wants_body = is_text and (state == "blessed" or
                                  (consent and state == "unseen"))
        if wants_body and add_body(it, comments=comments):
            # 26.995-09 (D-20): THE ROOM'S OWN PROSE IS MARKED AS ITS OWN,
            # and this closes a LIVE GAP verified three ways. A saved
            # reflection is minted with source "librarian" and state
            # "unseen"; nothing promotes it to blessed; and the branch just
            # above reads an unseen TEXT item's FULL BODY when consent is
            # given. A body row carries NO source key at all. So WITHOUT
            # consent a past reflection appeared as a labelled meta row, and
            # WITH consent it appeared as an UNLABELLED body row,
            # indistinguishable from her own writing — the room reading its
            # own prose back as hers at the exact moment she gave the widest
            # permission.
            # ⛔ LAW 4 GOVERNS THE BODY: verbatim and undecorated. This is a
            # KEY BESIDE the text, never a prefix, a wrapper or an annotation
            # ON it, and a case asserts the marked row's text is
            # byte-identical to the item's snapshot.
            # ⛔ It changes what the row SAYS about an item, never which
            # items enter — a label is not a filter.
            if room_wrote:
                out["bodies"][-1]["room_wrote_this"] = True
            _flag_row(out["bodies"][-1])
            _pool_rows.append((reflection_tier(it, _journal_ids),
                               _reflection_stamp_ms(it),
                               it.get("id") or "",
                               out["bodies"][-1], "bodies"))
            return
        _meta_row = {
            "id": it.get("id"),
            "title": it.get("title"),
            "source": it.get("source"),
            "type": it.get("type"),
            "created_ms": it.get("created_ms"),
            "tags": list(it.get("tags") or []),
            "comments": comments,
        }
        _flag_row(_meta_row)
        out["meta_rows"].append(_meta_row)
        _pool_rows.append((reflection_tier(it, _journal_ids),
                           _reflection_stamp_ms(it),
                           it.get("id") or "", _meta_row, "meta_rows"))

    for it in allowed:
        state = it.get("state")
        is_text = it.get("type") == "text"
        if scope == "note":
            # blessed bodies + nothing else — no rows for other states.
            # 26.4-01 (D-08, Pitfall 1): the recent marker is SINCE LAST
            # VISIT, fence-respecting by construction (only allowed items
            # ever reach this loop). `now_ms` IS the previous visit's
            # last_visit_ms threshold — the builder never reads a wall clock
            # and never computes "the current time": recent is True on the
            # first visit (threshold None → whole archive is "now") and
            # otherwise iff the item's newest save stamp is STRICTLY GREATER
            # than the threshold. The marker rides only when the caller hands
            # a threshold in; the builder itself stays clock-free.
            if is_text and state == "blessed":
                recent = None
                if now_ms is not _NO_THRESHOLD:
                    if now_ms is None:
                        # first visit: no previous stamp → the whole archive
                        # is "now" (the first cross-archive connections).
                        recent = True
                    else:
                        stamp = 0
                        for v in (it.get("created_ms"), it.get("saved_ms")):
                            if isinstance(v, (int, float)) and \
                                    not isinstance(v, bool):
                                stamp = max(stamp, v)
                        # strictly greater: saved AFTER the previous visit.
                        recent = bool(stamp and stamp > now_ms)
                add_body(it, recent=recent)
            continue
        if scope == "reflection":
            # 26.7-01 (D-11/D-33, RSF-06/SRM-11): the session pool —
            # computed THROUGH this one audited builder, never beside it.
            # The exclusion + title-shadow screens already ran above; the
            # marker filter runs strictly AFTER them (the 26.7-PATTERNS
            # placement rule). Strict >: a stamp EXACTLY equal to the
            # marker is OLD (already reflected on); one ms later is new.
            if session_marker is not _NO_THRESHOLD \
                    and session_marker is not None \
                    and _reflection_stamp_ms(it) <= session_marker:
                # 26.87-06 pass C's ONLY candidate source. The item cleared
                # the exclusion and title-shadow screens above; the MARKER
                # (and only the marker) held it back. Law 5 still applies —
                # an unblessed Apple-Notes row is withheld here exactly as
                # below, so the reach-back can never widen the allowed set.
                if not (not consent and state == "unseen"
                        and it.get("from_source") == "apple-notes"):
                    _reachback.append(it)
                continue
            # law 5 (26.65-04): an unblessed Apple-Notes row is withheld
            # from the non-consent pool exactly as in the presort scope —
            # its title is the note's own sensitive first line.
            if (not consent and state == "unseen"
                    and it.get("from_source") == "apple-notes"):
                continue
            # 26.87-06 (D-10/D-11): heaviness is RECORDED here and acted on
            # after the loop. Admit order is id-sorted, so an admit-time cap
            # would keep an ARBITRARY heavy row; the post-loop pass keeps
            # the NEWEST one, mirroring the budget pass's own invariant.
            if _reflection_heavy(it, _shelves.get(it.get("id")),
                                 _roster_terms):
                _heavy_ids.add(it.get("id") or "")
            else:
                _all_eligible_heavy = False
            # 26.87-08 (D-09): anchor-matching is RECORDED here and acted on
            # after the loop, exactly like heaviness above. A row is anchored
            # when it matches a theme/tag/folder anchor OR is her own voice;
            # everything else is a pass-A candidate. Nothing is decided here.
            if _anchors_active and not (
                    _reflection_anchor_match(it, anchors)
                    or _identity_own_voice_adjacent(it)):
                _unanchored_ids.add(it.get("id") or "")
            _admit_reflection(it)
            continue
        # scope == "presort"
        # 26.65-04 (T-26.65-12, law 5 — Pitfall 6): an Apple-Notes item
        # still unseen is withheld ENTIRELY from the DEFAULT (non-consent)
        # presort payload — no id, no title, no row. Plan 01 derives the
        # staged filename from the note's own first line and import_folder
        # sets title = path.name, so an unblessed Notes title IS that
        # sensitive first line; the shipped fence withheld only unseen
        # BODIES, still emitting the row. Keyed on the from_source marker
        # (imported notes are source=='folder-drop', so source can never
        # key this); the marker itself is never emitted in any row. The
        # row returns when the user blesses the item, and the shipped
        # per-run consent path below widens it exactly like any other
        # unseen text — no new consent surface. The absolute classes
        # (never_show/retired/trigger/filters) were fenced FIRST, above.
        if (not consent and state == "unseen"
                and it.get("from_source") == "apple-notes"):
            continue
        wants_body = is_text and (state == "blessed" or
                                  (consent and state == "unseen"))
        if wants_body and add_body(it):
            continue
        out["meta_rows"].append({
            "id": it.get("id"),
            "title": it.get("title"),
            "source": it.get("source"),
            "type": it.get("type"),
            "created_ms": it.get("created_ms"),
            "tags": list(it.get("tags") or []),
        })

    if scope == "reflection":
        # -------------------------------------------------------------
        # 26.87-08 PASS A — the deterministic identity lean (D-09/D-32).
        #
        # THE ORDER OF THE FOUR PASSES IS LOAD-BEARING and is stated here
        # because three passes plus a shipped fourth is exactly the kind of
        # block a later edit reorders by accident:
        #   A. the LEAN shapes the candidate set — which material the
        #      sitting is about;
        #   B. the CAP bounds what is heavy WITHIN that set;
        #   C. the REACH-BACK fills a starved pool from the same anchors;
        #   D. the shipped BUDGET pass runs LAST, because it is the only one
        #      that may shrink the finished document and its invariants must
        #      be evaluated against the FINAL set.
        #
        # WHY THIS IS CODE AND NOT PROMPT, in her own framing: a bias is a
        # suggestion to a model and a cap is a rule you can test, so
        # calibration living only in the prompt would be a hope. The pool
        # half is testable with zero model calls, which is why it exists
        # here at all — law 2 also holds by construction, because the
        # deterministic rules own selection and the model never does.
        #
        # WHEN IT FIRES: only when the candidate set MUST be narrowed —
        # i.e. the serialized document does not fit REFLECTION_DOC_BUDGET
        # and something is going to be shed regardless. Then the rows shed
        # first are the ones matching NO identity anchor, oldest-out, so
        # what survives leans toward who she is. It PREFERS, it never
        # admits: every row it can touch already cleared the exclusion,
        # title-shadow and marker screens, because the fence runs first,
        # always.
        #
        # WHEN IT DOES NOT FIRE: below the evidence floor, or with the
        # shipped default anchors=None, `_anchors_active` is False and this
        # entire pass is SKIPPED — the pool falls back to shipped behaviour
        # byte-for-byte. That is the pool half of D-32, and it is what stops
        # a three-signal portrait from steering what she is shown.
        #
        # Five idioms are copied verbatim from the budget pass below, for
        # the same reasons pass B copied them: the stamp-then-id tuple sort,
        # the caught ValueError + continue on removal, the never-starve
        # guard, one count increment per drop, and this scope wrapper.
        out["counts"]["identity-leaned"] = 0
        if _anchors_active and _unanchored_ids:
            _total = len(json.dumps(out, ensure_ascii=False))
            if _total > REFLECTION_DOC_BUDGET:
                # ⚠ 26.998-07: the row tuple gained HER TIER at the FRONT,
                # so every index here moved by one. Written out rather than
                # left implicit — a silently shifted index is a gate that
                # keeps passing while reading the wrong field.
                _loose = [r for r in _pool_rows if r[2] in _unanchored_ids]
                for _tier, _stamp, _rid, _row, _kind in sorted(
                        _loose, key=lambda r: (r[1], r[2])):
                    if _total <= REFLECTION_DOC_BUDGET:
                        break
                    if len(out["meta_rows"]) + len(out["bodies"]) <= 1:
                        break
                    try:
                        out[_kind].remove(_row)
                    except ValueError:
                        continue
                    _total -= len(json.dumps(_row, ensure_ascii=False)) + 1
                    # in-place (slice assign, never a rebind): the admit
                    # closure and passes B/C read this same list.
                    _pool_rows[:] = [r for r in _pool_rows
                                     if r[2] is not _row]
                    # a leaned-away row is no longer in the pool, so it can
                    # no longer be the heavy row the cap counts.
                    _heavy_ids.discard(_rid)
                    out["counts"]["identity-leaned"] += 1

        # -------------------------------------------------------------
        # 26.87-06 PASS B — the one-heavy-item cap (D-10/D-11/D-12).
        #
        # AT MOST ONE HEAVY ROW is handed to the model, ever. This lives
        # in the pool builder rather than the prompt for the project's own
        # reason: a bias is a suggestion to a model, a cap is a rule you
        # can test — and the model cannot violate a cap on material it was
        # never given. It is scoped per SESSION POOL: the pool is built
        # once and re-sent byte-identically on every refine turn, so this
        # one enforcement point covers every essay and every turn in that
        # session (D-12).
        #
        # POST-LOOP, never at admit time: admit order is id-sorted, so an
        # admit-time cap would keep an arbitrary heavy row. Here the drops
        # run OLDEST-out over the same stamp-then-id tuple sort the budget
        # pass uses, so the NEWEST heavy row is the survivor — the budget
        # pass's own invariant, deliberately mirrored rather than invented.
        # Five idioms are copied verbatim from that pass: the tuple sort,
        # the caught ValueError + continue on removal, the never-starve
        # guard, one count increment per drop, and this scope wrapper (so
        # presort and note never run the pass at all).
        #
        # THE HONEST LABEL, recorded here because a future reader will
        # otherwise cite this code as practice: "at most one" is a
        # defensible PROXY for a judgment this app structurally cannot
        # make. Titration and window-of-tolerance in the literature are
        # LIVE judgments with continuous feedback from the person in the
        # room, and nobody prescribes a count. This is a product decision.
        # It is NOT a clinical standard.
        out["counts"]["heavy-capped"] = 0
        out["counts"]["reach-back"] = 0
        if len(_heavy_ids) > 1:
            _heavy_rows = [r for r in _pool_rows if r[2] in _heavy_ids]
            for _tier, _stamp, _rid, _row, _kind in sorted(
                    _heavy_rows, key=lambda r: (r[1], r[2])):
                if len(_heavy_ids) <= 1:
                    break
                if len(out["meta_rows"]) + len(out["bodies"]) <= 1:
                    break
                try:
                    out[_kind].remove(_row)
                except ValueError:
                    continue
                _heavy_ids.discard(_rid)
                # in-place (slice assign, never a rebind): _admit_reflection
                # closes over this list and pass C appends to it below.
                _pool_rows[:] = [r for r in _pool_rows if r[3] is not _row]
                out["counts"]["heavy-capped"] += 1

        # -------------------------------------------------------------
        # 26.87-06 PASS C — the bounded all-heavy reach-back (D-13, SE-7).
        #
        # A STARVATION REMEDY, NOT A WIDENING. When everything new is
        # heavy, the sitting must not be one heavy item and silence — one
        # heavy row rides, and identity-anchored material from further back
        # fills the page. Three bounds are the whole design:
        #
        #   1. WHEN it fires — only when every eligible row in the
        #      marker-bounded pool was heavy AND the cap left a single row.
        #      Anything less is the normal case and this stays inert.
        #   2. WHAT it may admit — only rows matching an identity anchor
        #      handed through `anchors`. That is what makes it a reach for
        #      joy rather than an archive sweep, and it is why the
        #      parameter defaults to None: with no anchors, nothing is
        #      admitted and shipped behaviour is unchanged. Candidates were
        #      collected AFTER the exclusion, title-shadow and law-5
        #      screens and were held back by the MARKER alone. That order
        #      is load-bearing: the reflection marker is the ONLY thing
        #      preventing already-reflected material from re-surfacing, so
        #      an unbounded reach-back hands her the same material a second
        #      time — the exact failure the marker and the first-session
        #      window were introduced to prevent.
        #   3. HOW MANY, and visibly — at most REFLECTION_REACHBACK_CAP,
        #      each one counted in counts["reach-back"] so the whole
        #      mechanism is fail-visible rather than a silent widening.
        #
        # THE TONAL RISK HAS NO TEST (D-34). A green pass here does NOT
        # prove the reach-back reads as COMPANY rather than as changing the
        # subject. Comfort laid over unacknowledged difficulty increases
        # shame and withdrawal rather than reducing it, particularly with
        # trauma histories and neurodivergence. That is a copy requirement
        # and an owner-verdict beat, not something this pass can establish.
        #
        # THE RECORDED LIMIT (D-33), WITH NOTHING BUILT. Nothing in this
        # system can notice a SUSTAINED all-heavy stretch: the cap is
        # per-session-pool and a per-day ledger was refused on purpose, so
        # the app's behaviour during her worst month is architecturally
        # identical to its behaviour during her best — and this reach-back
        # reaches furthest into the past exactly when the present is
        # hardest. This is NOT an argument for mood inference, symptom
        # tracking, crisis detection, or any user-facing surface; that
        # would be a mood dashboard through the back door. The only
        # observation carried forward is that both count keys above are
        # local, dev-side, non-telemetry per-session numbers already inside
        # the laws. BUILT THIS PHASE: NOTHING.
        if (_all_eligible_heavy and _heavy_ids
                and len(out["meta_rows"]) + len(out["bodies"]) == 1):
            _candidates = [it for it in _reachback
                           if _reflection_anchor_match(it, anchors)]
            # newest-first, id-tiebroken — the same deterministic tuple
            # ordering as the two passes above, read in reverse so the
            # reach goes to the nearest anchored material first.
            _candidates.sort(key=lambda it: (_reflection_stamp_ms(it),
                                             str(it.get("id") or "")),
                             reverse=True)
            for it in _candidates[:REFLECTION_REACHBACK_CAP]:
                _admit_reflection(it)
                out["counts"]["reach-back"] += 1

        # 26.7-uat (beat-1 finding): the budget pass — every drop counted.
        # The last surviving row is never dropped: an over-tight budget must
        # never masquerade as the D-10 nothing-new state. The running
        # total over-estimates what remains (separator accounting errs
        # toward one extra drop), so the returned document always fits.
        #
        # ⛔⛔ 26.998-07 — THE DROP ORDER IS NOW HERS. Until today this shed
        # OLDEST-OUT, and that was A RULE SHE NEVER CHOSE: measured on her
        # real library on 2026-08-23 it shed 11,847 rows by age, so her own
        # writing could be dropped for being old while a screenshot survived
        # for being new. Her ruling (§ W-8, § W-9, both WRITTEN BY HER) is a
        # STRICT ORDER, so the cut now comes off THE BOTTOM OF HER RANKING:
        # tier 4 first, then 3, then 2, and her journal last of all.
        #
        # ⚠ THE WITHIN-TIER TIEBREAK IS THE SHIPPED ONE, UNCHANGED AND
        # DELIBERATELY SO. She ruled on the ORDER BETWEEN her four kinds and
        # said nothing about order within one; `(stamp, id)` is what shipped
        # and it stays, because inventing a within-tier rule here would be
        # an agent assigning exactly what the phase goal forbids. ⛔ Do not
        # "improve" it.
        #
        # ⚠ `-tier` rather than a reversed sort: descending by tier, then
        # ASCENDING by stamp inside it. A blanket `reverse=True` would also
        # flip the tiebreak and start shedding the NEWEST of a tier, which
        # is neither the shipped behaviour nor anything she ruled.
        #
        # ⛔⛔ AND WORDS COME BEFORE WORDLESS — HER AMENDMENT, 2026-08-23,
        # made after being shown what her strict order actually did. Her
        # ranking puts photographs THIRD, above clippings; but a photograph
        # carries NO WORDS the librarian can read, only a title. Driven on
        # her real library, the strict order therefore handed 95% of the
        # document to photo titles and shed 10,874 rows that DID have words.
        # Her ruling, chosen from an offered set: *words first, photos fill
        # what is left*.
        #
        # ⚠ IT USES THE ROOM'S OWN EXISTING DISTINCTION rather than a new
        # one: a `bodies` row carries text, a `meta_rows` row is a title and
        # a date. Wordless rows are shed FIRST, and HER tier order applies
        # inside each group — so her ranking still decides everything, it
        # just decides among things of the same kind.
        # ⛔ This does NOT re-rank her four kinds. `reflection_tier` is
        # untouched and still reports her order exactly as she gave it.
        #
        # ⭐ HER PHOTO SLICE, and it is the ONLY thing that outranks
        # words-first. Wordless rows are shed first — but the newest
        # REFLECTION_PHOTO_SLICE photographs are held back from that shed, so
        # the librarian always knows roughly what she photographed even when
        # there is a great deal of writing. ⚠ NEWEST, because the shipped
        # tiebreak sheds oldest-first and its survivors are the newest; that
        # is the existing rule read straight, not a new one.
        # ⛔ PHOTOGRAPHS ONLY (her tier 3). A screenshot that never earned a
        # body is also a wordless row, and letting those into the slice would
        # spend her photo space on the pile she ranked last.
        _protected = set()
        for _r in sorted([r for r in _pool_rows
                          if r[4] == "meta_rows"
                          and r[0] == REFLECTION_TIER_PHOTOGRAPH],
                         key=lambda r: (r[1], r[2]), reverse=True
                         )[:REFLECTION_PHOTO_SLICE]:
            _protected.add(id(_r[3]))
        total = len(json.dumps(out, ensure_ascii=False))
        if total > REFLECTION_DOC_BUDGET:
            for _tier, _stamp, _rid, _row, _kind in sorted(
                    _pool_rows,
                    key=lambda r: (2 if id(r[3]) in _protected
                                   else (0 if r[4] == "meta_rows" else 1),
                                   -r[0], r[1], r[2])):
                if total <= REFLECTION_DOC_BUDGET:
                    break
                if len(out["meta_rows"]) + len(out["bodies"]) <= 1:
                    break
                try:
                    out[_kind].remove(_row)
                except ValueError:
                    continue
                total -= len(json.dumps(_row, ensure_ascii=False)) + 1
                out["counts"]["pool-capped"] += 1
                # ⛔ 26.998-07, HER W-2 RULING — *leave out, AND TELL ME*.
                # This is the number her G-1 sentence would carry, and it is
                # counted SEPARATELY from the undated count her T-4 sentence
                # already covers: *I could not date it* and *I judged it
                # worth less than something else* are two different facts
                # and one number cannot carry both.
                # ⚠ Her top tier is counted too. A sitting so over-budget
                # that it sheds her own journal is exactly the case she
                # would most want told, so this counts EVERY drop rather
                # than only the bottom tiers.
                out["counts"]["ranking-shed"] += 1
    # ⛔⛔ HER RULING, 2026-08-24 — THE JOURNAL OPENS THE REFLECTION.
    # Verbatim, VOLUNTEERED after reading a real reflection on her real
    # library: *"I want the reflection can mention about journal the first
    # since the journal is the most important material"*. Asked what "first"
    # meant, she chose `Open on it — it's the first thing I read`, and asked
    # what happens in a week with no journal entry she chose that it falls to
    # *the next thing in her own order*. ⚠ Both of those were CHOSEN FROM AN
    # OFFERED SET; the ruling and its reason are hers and were volunteered.
    #
    # ⛔⛔ AND SHE RULED HOW IT MAY BE DONE. The model cannot tell which rows
    # are her journal — no tier, mark or journal key reaches any row, and the
    # prompt never names a journal. Offered three ways, she chose
    # `Order them first, don't label`: the pool is HANDED OVER in her order,
    # and the room still never states what anything is.
    #
    # ⚠⚠ THE HONEST CAVEAT, RECORDED RATHER THAN SMOOTHED: POSITION IS ITSELF
    # A WEAK SIGNAL. Nothing is labelled and nothing is stated, which is what
    # she chose — but a reader could infer that the leading rows are special.
    # ⛔ That is strictly less than telling it, and it is NOT a promise
    # quietly traded: she was offered the labelling option and refused it.
    #
    # ⛔ ORDER ONLY — MEMBERSHIP IS UNTOUCHED. The sort runs AFTER the shed on
    # exactly the rows that survived it; no row enters, leaves or changes.
    # Every fence exclusion above still stands, and `sort` is STABLE, so
    # within a tier the existing order is preserved untouched — no second
    # ordering rule is introduced anywhere.
    if scope == "reflection":
        _tier_of = {}
        for _r in _pool_rows:
            _tier_of[id(_r[3])] = _r[0]
        for _key in ("bodies", "meta_rows"):
            _rows = out.get(_key)
            if isinstance(_rows, list):
                _rows.sort(key=lambda _row: _tier_of.get(
                    id(_row), REFLECTION_TIER_SAVED))
    return out


# ---------------------------------------------------------------------------
# ---- librarian/identity.md — the derived identity page (26.87-08, D-06) ----
#
# The identity page joins the librarian file family WHOLE — a pure path
# helper, a fail-open loader, and an atomic writer, named and shaped exactly
# like the session and blessings triples above, with the same four
# properties:
#
#   1. a PLAIN FILE under the VISIBLE librarian/ folder, so deleting that
#      folder stays the factory reset — and deleting it simply re-derives
#      (D-06: the room's picture of her is a file she can open, correct, or
#      throw away);
#   2. FAIL-OPEN reads — a missing, unreadable, or hand-edited-off-shape
#      file yields the empty anchor set and NEVER raises;
#   3. ATOMIC writes through atomic_write_bytes;
#   4. the CALLER owns the lock — these helpers do the IO only.
#
# TWO WAYS IT DIFFERS FROM ITS SIBLINGS, both deliberate:
#
#   * It is MARKDOWN, not JSON, because D-06 requires plain readable and
#     editable and notebook.md establishes markdown as the human-facing
#     member of this family. It copies the notebook's posture including its
#     SWALLOWED WRITE FAILURE: a derived profile must never block the room.
#   * It REWRITES rather than appends. The notebook accretes because it is a
#     diary; this page is a DERIVATION, and a derivation that accreted would
#     stop being true.
#
# A NEW COMBINATION FOR THIS REPO, recorded because it has no precedent
# here: the markdown member is append-only human prose today, and every
# derived member is JSON. A DERIVED-MARKDOWN file read back through a
# TOLERANT PARSER is the one shape in this codebase with nothing to borrow
# from — which is why its round trip (derive, hand-edit, re-read, re-derive)
# gets its own test, IdentityAnchorTest, rather than borrowing one.
#
# NO MODEL CALL ANYWHERE IN THE DERIVATION. It is deterministic code output,
# so it adds zero new fence surface and cannot hallucinate a self for her.
#
# NO USER-FACING COPY ON THIS SURFACE beyond the page itself: an unparseable
# hand-edited line is DROPPED, not an error (the fail-open posture applied
# PER LINE), and an unreadable file is simply an empty anchor set. There is
# nothing here to tell her about, so nothing is told.
# ---------------------------------------------------------------------------

IDENTITY_PAGE_TITLE = "# what the room has noticed about you"

# The page's own header comment states its contract to the reader who opens
# it: derived rather than authored, safe to edit or delete because it
# re-derives, and the never-from-a-fenced-item promise in plain words.
IDENTITY_PAGE_NOTE = (
    "<!-- derived, not authored. safe to edit or delete; it re-derives.\n"
    "     nothing here ever comes from a never-show, retired, or\n"
    "     trigger-marked item. -->")

IDENTITY_THEMES_HEADING = "## themes"
IDENTITY_FOLDERS_HEADING = "## your folders"
IDENTITY_WORDS_HEADING = "## your own words"

# D-32, the BELOW-THE-FLOOR page. Byte-exact from the UI-SPEC, and every
# clause is load-bearing:
#   * "there isn't much here yet" — a fact about the ROOM, D-32's own
#     wording, kept verbatim.
#   * "the room hasn't seen enough" — the subject is the room's seeing,
#     never her giving. NEVER "you haven't given me enough", never "once
#     you've blessed a few more", never a count of what is missing: that
#     would be a quota AND an absence surface in one line.
#   * "so it isn't going to guess" — states the safety plainly. This is the
#     sentence that makes the short page read as INTEGRITY rather than as
#     failure.
#   * "fills in on its own as you use the room" — no task, no instruction,
#     no invitation to do work. She is not being asked for anything (law 3).
# It carries NO SECTION HEADINGS: an empty section list reads as a checklist
# of what she has not produced. TWO NEAR-MISSES were caught while this was
# drafted and must not creep back — a "still getting to know you" line,
# which makes her a work in progress, and a "bless a few more things and
# this will fill in" line, which is a quota and a task on the surface with
# the least right to either.
IDENTITY_THIN_BODY = (
    "there isn't much here yet. the room hasn't seen enough of your library\n"
    "to say anything about you that would be true, so it isn't going to\n"
    "guess. this page fills in on its own as you use the room.")

# The tolerant per-line grammar. A line that does not match is DROPPED —
# never an error, never a repair attempt. Both patterns are anchored and
# carry their own signal count, so the page round-trips exactly.
_IDENTITY_ROW_RE = re.compile(r"^-\s+(.+?)\s+\((\d+)\s+signals?\)$")
_IDENTITY_QUOTE_RE = re.compile(r'^>\s+"(.*)"\s+\((\d+)\s+signals?\)$')


def identity_file_path(library_root):
    """librarian/identity.md under the library root. Pure path math — no
    I/O of any kind, not even an existence check."""
    return Path(library_root) / "librarian" / "identity.md"


def _identity_empty_anchors():
    """The empty anchor set: matches nothing, steers nothing, and reports
    itself thin. Every fail-open path returns exactly this."""
    return {"topics": [], "tags": [], "folders": [],
            "themes": [], "folder_rows": [], "phrases": [],
            "evidence": 0, "thin": True}


def _identity_signal_count(n) -> str:
    """'1 signal' / 'N signals'. A SINGLE-SIGNAL ANCHOR NEVER RENDERS A
    PLURAL COUNT — the smallest possible tell that the page is
    machine-written rather than noticed."""
    return "1 signal" if n == 1 else "%d signals" % n


def _identity_top(counts, cap):
    """The top `cap` entries of a {label: weight} map as
    [{'label', 'signals'}], most-evidenced first and ALPHABETICAL within a
    tie — deterministic, so the same store renders the same page twice.
    Pure."""
    rows = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"label": label, "signals": weight}
            for label, weight in rows[:cap]]


def _identity_phrase(text):
    """One comment reduced to a single verbatim line of at most
    IDENTITY_PHRASE_MAX characters: whitespace collapsed (the page is
    line-oriented, so an embedded newline would split one phrase into two
    unparseable lines) and hard-cut at the cap with nothing appended — an
    ellipsis would be a character she did not write. Returns '' when there
    is nothing usable. Pure."""
    if not isinstance(text, str):
        return ""
    flat = " ".join(text.split())
    return flat[:IDENTITY_PHRASE_MAX]


def derive_identity_anchors(store, filters=None):
    """The identity anchor set derived from the store's own signals (D-06,
    D-07, D-08, D-32). PURE: no I/O, no clock, no model call, no mutation of
    `store`.

    THE FENCE IS REUSED, NEVER RE-IMPLEMENTED. Every item passes the shipped
    _librarian_fenced predicate first, so nothing never-show, retired,
    trigger-marked, or excluded by an active filter can contribute a single
    token — one implementation, because a second one drifts and drift is a
    leak (T-27-18). Her own comments are read through the shipped
    _item_comments, and theme tokens through the shipped
    _insight_theme_keys, for the same reason. `filters` defaults to the
    store's own meta.filters; a caller may pass an explicit list.

    Items the APP wrote are excluded from EVERY signal (_identity_self_
    authored, SE-11), or the room begins deriving her identity from its own
    prose.

    THE RETURN SHAPE — the 26.87-06 matcher schema KEPT VERBATIM and
    extended ADDITIVELY, so _reflection_anchor_match needed no change at all
    and the ten shipped ReflectionHeavyCapTest cases stand untouched:

      topics       free-form `topic` slugs (matched as SUBSTRINGS)
      tags         the derived theme tokens (matched WHOLE against tags)
      folders      the top folder facets   (matched WHOLE against folder)
      themes       [{'label','signals'}] <= IDENTITY_THEME_CAP, for the page
      folder_rows  [{'label','signals'}] <= IDENTITY_FOLDER_CAP
      phrases      [{'label','signals'}] <= IDENTITY_PHRASE_CAP, her own
                   verbatim words, newest first, <= IDENTITY_PHRASE_MAX chars
      evidence     the TOTAL WEIGHTED EVIDENCE COUNT
      thin         evidence < IDENTITY_EVIDENCE_FLOOR

    BELOW THE FLOOR (D-32) the three match lists and all three page sections
    come back EMPTY, and `thin` is True. That is the whole gate made
    structural rather than remembered: an empty anchor set matches nothing,
    so the anchors cannot ride into a prompt, the reach-back stays inert,
    and identity_anchors_active is False so the pool lean is skipped. The
    page is STILL WRITTEN — it simply says plainly that the room does not
    know much yet."""
    if not isinstance(store, dict):
        return _identity_empty_anchors()
    meta = store.get("meta") or {}
    if filters is None:
        filters = meta.get("filters") or []
    theme_counts = {}
    folder_counts = {}
    topic_tokens = set()
    phrases = []
    evidence = 0
    for it in (store.get("items") or {}).values():
        if not isinstance(it, dict):
            continue
        if _librarian_fenced(it, filters):
            continue          # the SHIPPED fence, called not copied
        if _identity_self_authored(it):
            continue          # SE-11: never the room's own prose
        comments = _item_comments(it)
        weight = _identity_item_weight(it, comments)
        if weight <= 0:
            continue          # no signal is not evidence; it is just a file
        evidence += weight
        # F1: `evidence` is stamped BEFORE the label filter and is never
        # reduced by it — an item with a date-shaped tag is still an item she
        # blessed or commented on. The filter narrows what the room may SAY
        # it noticed, never how much it noticed.
        for token in _identity_theme_tokens(it):
            label = str(token).strip()
            if label and not _identity_meaningless_token(label):
                theme_counts[label] = theme_counts.get(label, 0) + weight
        topic = str(it.get("topic") or "").strip()
        if topic and not _identity_meaningless_token(topic):
            topic_tokens.add(topic)
        folder = str(it.get("folder") or "").strip()
        if folder and not _identity_meaningless_token(folder):
            folder_counts[folder] = folder_counts.get(folder, 0) + weight
        for c in comments:
            phrase = _identity_phrase(c.get("text"))
            if phrase:
                # an unparseable comment stamp reads as OLDEST, never
                # newest — the _comment_stamp_ms fail-closed posture.
                phrases.append(
                    (_comment_stamp_ms(c.get("at")) or 0, phrase, weight))
    if evidence < IDENTITY_EVIDENCE_FLOOR:
        thin = _identity_empty_anchors()
        thin["evidence"] = evidence
        return thin
    themes = _identity_top(theme_counts, IDENTITY_THEME_CAP)
    folders = _identity_top(folder_counts, IDENTITY_FOLDER_CAP)
    phrases.sort(key=lambda p: (-p[0], p[1]))
    phrase_rows = []
    seen = set()
    for _stamp, text, weight in phrases:
        if text in seen:
            continue
        seen.add(text)
        phrase_rows.append({"label": text, "signals": weight})
        if len(phrase_rows) >= IDENTITY_PHRASE_CAP:
            break
    return {
        "topics": [r["label"] for r in themes
                   if r["label"] in topic_tokens],
        "tags": [r["label"] for r in themes],
        "folders": [r["label"] for r in folders],
        "themes": themes,
        "folder_rows": folders,
        "phrases": phrase_rows,
        "evidence": evidence,
        "thin": False,
    }


def render_identity_page(anchors) -> str:
    """The page as text. PURE — no I/O, so the copy is unit-testable byte
    for byte without touching a disk.

    Above the floor: three sections in a FIXED ORDER, each line carrying its
    own signal count. A SECTION WITH ZERO ENTRIES IS OMITTED ENTIRELY — no
    heading, no placeholder, no "none yet" — because a bare heading with
    nothing under it is an absence with a label on it.

    Below the floor: the byte-exact honest page, with NO section headings at
    all. OVERFLOW is impossible by construction: the caps and the phrase
    length limit mean the page cannot grow without bound, so there is no
    scroll and no truncation case to design."""
    lines = [IDENTITY_PAGE_TITLE, "", IDENTITY_PAGE_NOTE]
    if not isinstance(anchors, dict) or anchors.get("thin"):
        lines.extend(["", IDENTITY_THIN_BODY])
        return "\n".join(lines) + "\n"
    sections = ((IDENTITY_THEMES_HEADING, anchors.get("themes"), False),
                (IDENTITY_FOLDERS_HEADING, anchors.get("folder_rows"),
                 False),
                (IDENTITY_WORDS_HEADING, anchors.get("phrases"), True))
    for heading, rows, quoted in sections:
        clean = [r for r in (rows or [])
                 if isinstance(r, dict) and str(r.get("label") or "").strip()]
        if not clean:
            continue          # omitted entirely, heading and all
        lines.extend(["", heading])
        for r in clean:
            label = str(r.get("label")).strip()
            n = r.get("signals")
            if isinstance(n, bool) or not isinstance(n, int) or n < 1:
                n = 1
            count = _identity_signal_count(n)
            if quoted:
                lines.append('> "%s" (%s)' % (label, count))
            else:
                lines.append("- %s (%s)" % (label, count))
    return "\n".join(lines) + "\n"


def save_identity_file(library_root, anchors) -> str:
    """Rewrite librarian/identity.md from `anchors` and return the text
    written. Creates the librarian directory if absent, writes atomically,
    and SWALLOWS a failed write the way append_notebook does — a derived
    profile must never block the room. The caller owns the lock."""
    text = render_identity_page(anchors)
    path = identity_file_path(library_root)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_bytes(str(path), text.encode("utf-8"))
    except OSError:
        pass   # a derived page must never block the room
    return text


def load_identity_anchors(library_root):
    """The anchor set read back off disk, or the empty set — FAIL-OPEN: a
    missing, unreadable, or hand-edited-off-shape file reads as no anchors
    at all and NEVER raises. TOLERANT PER LINE: a line that no longer parses
    is DROPPED and the surrounding lines still load, which is the fail-open
    posture applied at line granularity. The caps are re-applied on read, so
    a hand-edit cannot grow the page past its bound.

    TWO DELIBERATE NARROWINGS, both fail-closed:

      * `topics` comes back EMPTY. The file cannot record which tokens were
        free-form topic slugs, and topics match as SUBSTRINGS across title +
        folder + tags — so guessing would let a hand-edited page reach
        further (and into TITLES) than the derivation ever would. Parsed
        theme labels are returned as `tags`, the precise whole-compare path.
      * `evidence` comes back as exactly IDENTITY_EVIDENCE_FLOOR when any
        section parsed, and 0 when none did. The per-token counts on the
        page are not a store total and reconstructing one from them would be
        arithmetic the file never claimed. What the file CAN say honestly is
        binary, and it says it structurally: below the floor the page
        carries no sections at all, so A PAGE WITH SECTIONS IS A PAGE THAT
        WAS WRITTEN ABOVE THE FLOOR. The derivation remains the authority on
        the floor for anything that steers."""
    try:
        text = identity_file_path(library_root).read_text(encoding="utf-8")
    except (OSError, ValueError):
        return _identity_empty_anchors()   # includes UnicodeDecodeError
    section = None
    rows = {"themes": [], "folders": [], "phrases": []}
    caps = {"themes": IDENTITY_THEME_CAP, "folders": IDENTITY_FOLDER_CAP,
            "phrases": IDENTITY_PHRASE_CAP}
    for raw in text.split("\n"):
        line = raw.strip()
        if line == IDENTITY_THEMES_HEADING:
            section = "themes"
            continue
        if line == IDENTITY_FOLDERS_HEADING:
            section = "folders"
            continue
        if line == IDENTITY_WORDS_HEADING:
            section = "phrases"
            continue
        if line.startswith("#"):
            section = None      # any other heading closes the section
            continue
        if section is None or not line:
            continue
        pattern = _IDENTITY_QUOTE_RE if section == "phrases" \
            else _IDENTITY_ROW_RE
        m = pattern.match(line)
        if not m:
            continue            # dropped, not an error
        label = m.group(1).strip()
        if not label or len(rows[section]) >= caps[section]:
            continue
        rows[section].append({"label": label, "signals": int(m.group(2))})
    out = _identity_empty_anchors()
    if not (rows["themes"] or rows["folders"] or rows["phrases"]):
        return out
    out["themes"] = rows["themes"]
    out["folder_rows"] = rows["folders"]
    out["phrases"] = rows["phrases"]
    out["tags"] = [r["label"] for r in rows["themes"]]
    out["folders"] = [r["label"] for r in rows["folders"]]
    out["evidence"] = IDENTITY_EVIDENCE_FLOOR
    out["thin"] = False
    return out


# ---------------------------------------------------------------------------
# ---- the tidy-up's fence: which notes a readability run may touch ----------
# (26.85-03 / 26.95-05, D-07/D-08/D-09)
#
# ⛔⛔ THE PAYLOAD BUILDER THIS SECTION WAS BUILT AROUND IS DELETED
# (2026-08-17, #95). `build_cleaning_payload` was the ONLY source of bytes the
# labelling classifier could receive, and the labelling classifier is gone —
# so nothing here builds a payload for a model any more. ⚠ THE TIDY-UP SENDS
# NOTHING TO ANY MODEL AT ALL (#89): what remains below decides which of HER
# notes a readability run may touch, and the bytes it returns go to her own
# screen.
#
# THE EXCLUSION ORDER SURVIVES ITS BUILDER, and it is still load-bearing
# (26.85-RESEARCH Pitfall 4):
#   1. _librarian_fenced FIRST — never_show / retired / trigger-flagged /
#      active-filter-matched items are absent ENTIRELY, whatever the caller
#      asked for. The shipped fence is absolute (product law 5); a scope
#      choice can never widen it.
#   2. THEN the scope — one folder, or the whole vault (#86 ruling 2: the
#      tidy-up speaks in PLACES, never in a list of her filenames).
#   3. THEN the note itself, read from disk, capped and counted out loud.
#
# ⚠ ITS PROPERTY SUITE WENT WITH THE BUILDER. `tests/test_cleaning_fence.py`
# was a randomized property sweep over the deleted payload; the fence on the
# path that remains is driven by case instead —
# `test_an_unknown_or_fenced_id_writes_nothing_and_is_counted` in
# tests/test_server_smoke.py, which holds it at the read AND at the write.
# Said out loud because it is the one real loss in that deletion.
# ---------------------------------------------------------------------------

def _clean_writable_origin(item) -> bool:
    """True when the item names an `.md` origin this tier could actually
    write. The payload never carries an item the writer would refuse anyway
    (_clean_jail is `.md`-only), because sending it would spend egress on a
    note that can never be cleaned — D-09's minimization read. Pure: no
    filesystem touch (the real jail runs at write time)."""
    return str(item.get("origin_path") or "").lower().endswith(".md")


def readability_scopes(store):
    """The list of PLACES the tidy-up may be pointed at (#86 ruling 2).

    Returns [{"folder": str, "notes": int}, ...] sorted by folder name — a
    short list of places, NEVER a list of files. The owner ruled the per-note
    tick out at #86: what she looks at before a byte is written is THE CHANGE
    (the three worst notes, before and after), not a list of names she has no
    way to judge.

    The fence comes first, as it does everywhere in this tier, so a
    never-show / retired / trigger-marked / filtered note contributes not even
    to a COUNT. A count is a leak too: "37 notes" against a folder the person
    asked never to see is still the room saying something about it.

    Pure: reads the store only, touches no file, mutates nothing."""
    meta = store.get("meta") or {}
    filters = meta.get("filters") or []
    counts = {}
    for item in (store.get("items") or {}).values():
        if _librarian_fenced(item, filters):
            continue                        # 1. the absolute fence, FIRST
        if item.get("type") != "text":
            continue
        if not _clean_writable_origin(item):
            continue
        folder = item.get("folder")
        label = folder if isinstance(folder, str) and folder else ""
        counts[label] = counts.get(label, 0) + 1
    return [{"folder": key, "notes": counts[key]} for key in sorted(counts)]


def build_readability_targets(store, scope, limit=None, offset=0):
    """The notes one readability run may touch, with the bytes it would
    rewrite. Returns {"targets": [{"id","title","folder","origin_path",
    "body","dates_before","dates_after"}], "total": n, "unreadable": n}.

    `dates_before` / `dates_after` are the note's WHOLE frontmatter block
    before and after the date repair, or both None when it needs none.

    `scope` is a folder name, or None for the whole vault. It is a PLACE, and
    that is the whole vocabulary — there is deliberately no id list parameter,
    because #86 replaced the per-file tick and a builder that still accepted
    one would let it back in through the back door.

    ⚠ IT READS THE VAULT FILE, NOT THE SNAPSHOT, and that is the difference
    from the deleted label payload builder. That pass sent an EXCERPT to a
    model and
    a capped snapshot read is right for it. This pass rewrites the person's own
    file, so the bytes it lays out must be the bytes that are actually there —
    a snapshot that has drifted would produce a preview of a note that no
    longer exists, and then a write the run-time gate would (correctly) refuse.

    EXCLUSION IS TOTAL AND ORDERED, the discipline at the head of this
    section:
    _librarian_fenced first, then the scope, then text-only, then a writable
    `.md` origin, then a readable file. A note excluded at any step contributes
    no id, no title, no path and no bytes.

    `unreadable` counts the notes in scope whose file could not be read at all.
    ⚠ It is RETURNED rather than swallowed because product law 9 ends "every
    note the room declines to touch is counted and said out loud", and #63's
    still-owed debt on the pre-sort is exactly this number going unreported.

    Pure: reads files, writes nothing, never mutates `store`."""
    meta = store.get("meta") or {}
    filters = meta.get("filters") or []
    want = scope if isinstance(scope, str) and scope else None
    allowed = []
    for item in (store.get("items") or {}).values():
        if _librarian_fenced(item, filters):
            continue                        # 1. the absolute fence, FIRST
        if want is not None and item.get("folder") != want:
            continue                        # 2. outside the chosen place
        if item.get("type") != "text":
            continue
        if not _clean_writable_origin(item):
            continue
        allowed.append(item)
    allowed.sort(key=lambda it: str(it.get("id", "")))
    total = len(allowed)
    start = max(0, int(offset or 0))
    window = allowed[start:] if limit is None else \
        allowed[start:start + max(0, int(limit))]
    targets = []
    unreadable = 0
    for item in window:
        target = _clean_jail(item.get("origin_path"))
        if target is None:
            unreadable += 1
            continue
        try:
            raw = target.read_bytes()
        except OSError:
            unreadable += 1
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            unreadable += 1                 # not ours to guess at
            continue
        _bom, _fm, body = _clean_split_fm_bytes(raw)
        try:
            body_text = body.decode("utf-8")
        except UnicodeDecodeError:
            unreadable += 1
            continue
        del text
        # ⚠ THE DATE REPAIR'S BEFORE-AND-AFTER, CARRIED HERE (#88's ruling,
        # wired 2026-08-17). Product law 9 ends "every change is shown before
        # it lands", and this change happens ABOVE the body — so it is
        # invisible in the readability panes and would land unseen if this
        # route stayed silent about it. `None` means this note's dates need
        # nothing, which is also how the client knows not to send it for a
        # repair it does not need.
        #
        # ⛔ COMPUTED BY THE WRITER'S OWN RULE, never a second one: the
        # preview and the write both go through `date_repair_updates` +
        # `_clean_emit_fm`. This is the same discipline the body half keeps by
        # routing the preview and the write through `sentenceBreaksOnly`.
        dates = date_repair_preview(_fm)
        targets.append({"id": item.get("id"),
                        "title": item.get("title"),
                        "folder": item.get("folder"),
                        "origin_path": str(target),
                        "body": body_text,
                        "dates_before": dates[0] if dates else None,
                        "dates_after": dates[1] if dates else None})
    return {"targets": targets, "total": total, "unreadable": unreadable}


# ---------------------------------------------------------------------------
# ---- the cleaning proposals notebook (26.85-03) ----------------------------
# librarian/cleaning-proposals.json — the same VISIBLE-notebook contract the
# suggestions file has (D-05): a plain file under the library root the user
# can open, read, edit, or delete. Deliberately a small fork of
# load_suggestions / merge_suggestions rather than a reuse: the map key is
# `proposals` (these are filing labels awaiting the user's tick, not
# verdicts), and refactoring the shipped, four-suite-covered notebook merge
# to share a key parameter would put the librarian's own memory at risk for
# a cosmetic saving.
# ---------------------------------------------------------------------------


def load_cleaning_proposals(path):
    """The cleaning notebook, or the empty shape {'runs': [],
    'proposals': {}, 'headings': {}} when the file is missing, unreadable,
    or hand-edited off-shape (fail-open: cleaning forgets rather than ever
    blocking the room). Never raises, never writes.

    Shape: runs = [{started_ms, auth, cost_usd, stopped_why?}] (one record
    per run); proposals = {id: {room?, tags?, type?, unsure, title?, batch,
    at, applied?}}; headings = {id: {heading, anchor, batch?, at?}}.

    26.88-05 — WHY THE THIRD KEY IS READ HERE AND NOT ONLY BY ITS OWN
    LOADER. merge_cleaning_proposals rewrites the WHOLE notebook from this
    return after every batch. A loader that dropped `headings` would
    therefore erase every heading the same run had just written, one batch
    later — silently. So the sibling map is carried through this read even
    though nothing in the label path ever looks at it. The label proposal
    RECORD is untouched: this is a third top-level key beside `proposals`,
    never a field inside it."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"runs": [], "proposals": {}, "headings": {}}
    if not isinstance(data, dict):
        return {"runs": [], "proposals": {}, "headings": {}}
    runs = data.get("runs")
    proposals = data.get("proposals")
    return {"runs": runs if isinstance(runs, list) else [],
            "proposals": proposals if isinstance(proposals, dict) else {},
            "headings": _cleaning_headings_of(data)}


def merge_cleaning_proposals(path, new_proposals, run_record=None):
    """Load, merge, and atomically rewrite the cleaning notebook; return
    the merged dict. Per-id SHALLOW merge, so a later apply stamp never
    erases the labels it applied. `run_record` (matched by started_ms)
    replaces its own earlier snapshot or appends, so the worker can
    re-merge after EVERY batch and a killed run still leaves a truthful
    record behind (kill-safe, resumable). The caller owns any locking; this
    is one load -> merge -> atomic write and touches no other file."""
    path = Path(path)
    data = load_cleaning_proposals(path)
    for item_id, fields in (new_proposals or {}).items():
        if not isinstance(fields, dict):
            continue
        record = data["proposals"].get(str(item_id))
        if not isinstance(record, dict):
            record = {}
        record.update(fields)
        data["proposals"][str(item_id)] = record
    if isinstance(run_record, dict):
        stamp = run_record.get("started_ms")
        replaced = False
        for i, run in enumerate(data["runs"]):
            if isinstance(run, dict) and run.get("started_ms") == stamp:
                data["runs"][i] = dict(run_record)
                replaced = True
                break
        if not replaced:
            data["runs"].append(dict(run_record))
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(str(path), json.dumps(
        data, ensure_ascii=False, indent=1).encode("utf-8"))
    return data


# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# ---- the notebook's sibling headings key (26.88-05, kept for her data) ------
#
# ⛔⛔ THE SECTION-HEADING PROPOSAL MACHINERY WAS DELETED HERE (#95). What
# stood here was the closed heading roster, the script test that chose its
# Chinese or English half, the anchor-uniqueness check and the record builder
# — every one of them a guard on a MODEL's answer, and the model job they
# guarded (`heading_proposals`) is gone. #89 deferred headings and shipped
# the line-break pass instead, which needs no roster because it names nothing.
#
# ⚠ WHAT SURVIVES, AND WHY IT IS ONE FUNCTION AND NOT A FEATURE: her real
# notebook carries a `headings` key with a record in it from a run on
# 2026-08-01, and the loader below preserves that key rather than dropping it
# on the next write. Deleting a person's data is not a deletion this ruling
# asked for. ⚠ Nothing READS the key any more — the display side lives in
# core.js and is fed by a route that no longer exists — so a heading pass
# returning would re-wire a reader, not re-derive her file.
# ---------------------------------------------------------------------------


def _cleaning_headings_of(data):
    """The notebook's sibling headings map, normalized — the ONE definition
    of "where the headings live", so the loader that preserves the key and
    the loader that reads it can never drift apart. Pure."""
    if not isinstance(data, dict):
        return {}
    headings = data.get("headings")
    return headings if isinstance(headings, dict) else {}


# ---------------------------------------------------------------------------
# ---- the cleaning change-log (26.85-04, D-10) ------------------------------
# librarian/cleaning-log.json is what makes the tidy-up REVERSIBLE, and it
# joins the visible-notebook family whole (D-05): a plain JSON file under the
# library root the user can open, read, or delete — never a hidden dotdir,
# never inside items.json. One entry per file the apply route actually
# changed, carrying the FULL pre-write frontmatter block, the post-write
# block, and the pre-write mtime — exactly the three things
# restore_frontmatter_block needs for one-tap undo (RESEARCH Pitfall 7).
#
# ⚠⚠ WHAT IS IN HERE, CORRECTED 2026-08-15 (her ask): THE NOTE'S OWN WORDS.
# This block used to promise "no body byte, ever … never a note's words
# (T-26.85-log)", and that was true only while the tidy-up wrote frontmatter.
# 26.95-05 gave it a BODY writer, so every record of a readability run carries
# `old_body_b64` — the whole previous body of one of her notes, verbatim,
# because that is what putting a run back restores. On her real library the
# file reached 16.8 MB of which 99% was her own writing.
#
# So the honest statement is the opposite of the old one: A LEAKED OR SHARED
# LOG IS A LEAK OF HER NOTES, not of filing labels and dates. Two consequences
# already ride on it — this file leaves the published bundle, and deleting
# `librarian/` is no longer free (it is where every way back lives, and her
# blessings sit beside it).
#
# 26.95-23 bounds the hoard rather than the disclosure: the copies from runs
# older than the newest few are released at the end of a run.
#
# The blocks are BYTES and JSON has no bytes, so they ride base64 (stdlib,
# zero-dependency law). The framing lives here, in one place, so no caller
# has to know: merge_cleaning_log takes the writer's record verbatim
# (old_fm/new_fm as bytes) and undo_cleaning_batch hands bytes back.
# b"" round-trips as "" and stays MEANINGFUL — it is how undo removes a
# block the note never had.
#
# Entries are appended per FILE, immediately after each write (the
# suggestions-notebook discipline): a run killed halfway leaves every file
# it already touched undoable. The caller owns the lock; these helpers do
# the load -> merge -> atomic write only.
# ---------------------------------------------------------------------------


def cleaning_log_path(library_root):
    """librarian/cleaning-log.json under the library root — the VISIBLE
    folder (deleting librarian/ stays the factory reset). Pure path math."""
    return Path(library_root) / "librarian" / "cleaning-log.json"


def load_cleaning_log(path):
    """{'batches': [...]} — FAIL-OPEN: a missing, unreadable, or
    hand-edited-off-shape file reads as the empty wrapper (the
    load_cleaning_proposals posture). Never raises, never writes.

    Shape: batches = [{started_ms, undone_ms|None,
                       files: [{id, origin_path, old_fm_b64, new_fm_b64,
                                old_mtime, at}]}] — newest LAST."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"batches": []}
    if not isinstance(data, dict):
        return {"batches": []}
    batches = data.get("batches")
    if not isinstance(batches, list):
        return {"batches": []}
    clean = []
    for batch in batches:
        if not isinstance(batch, dict):
            continue
        files = batch.get("files")
        entry = dict(batch)
        entry["files"] = [f for f in files if isinstance(f, dict)] \
            if isinstance(files, list) else []
        clean.append(entry)
    return {"batches": clean}


def _clean_log_b64(raw):
    """bytes -> a base64 ASCII string (b"" -> ""). Never raises."""
    try:
        return base64.b64encode(bytes(raw or b"")).decode("ascii")
    except (TypeError, ValueError):
        return ""


def _clean_log_unb64(text):
    """A base64 string -> bytes ("" or junk -> b""). Never raises: a
    hand-mangled entry restores nothing rather than half a block."""
    if not text:
        return b""
    try:
        return base64.b64decode(str(text), validate=True)
    except (TypeError, ValueError):
        return b""


def merge_cleaning_log(path, batch_ms, records=None, *, undone_ms=None):
    """Load, append, and atomically rewrite the change-log; return the
    merged doc.

    `records` is a list of apply_cleaning_frontmatter return records
    (`old_fm`/`new_fm` as BYTES) — each is appended to the batch keyed by
    `batch_ms`, which is created on first use. A record whose `changed` is
    not True is IGNORED: an idempotent no-op wrote zero bytes, so logging it
    would offer an undo of nothing (D-02/Pitfall 6). Re-appending the same
    origin_path within a batch replaces the earlier entry, so the batch
    keeps ONE undo target per file (its oldest `old_fm` is the one that
    matters — the first write is what the file must go back to).

    `undone_ms` stamps the batch as already restored, which is what makes
    undo-of-undo answer 0 instead of re-applying a stale block.

    One load -> merge -> atomic write, touching no other file. The caller
    owns any locking."""
    path = Path(path)
    data = load_cleaning_log(path)
    batch = None
    for candidate in data["batches"]:
        if candidate.get("started_ms") == batch_ms:
            batch = candidate
            break
    if batch is None:
        batch = {"started_ms": batch_ms, "undone_ms": None, "files": []}
        data["batches"].append(batch)
    for record in (records or []):
        if not isinstance(record, dict) or record.get("changed") is not True:
            continue                    # a byte no-op has nothing to undo
        origin = str(record.get("origin_path") or "")
        if not origin:
            continue
        # ⚠⚠ WHICH HALVES REALLY MOVED, and it is no longer decidable from
        # presence. Until 2026-08-17 the two writers were disjoint: a label
        # record carried `old_fm` and no `old_body`, a body record the
        # reverse, so PRESENCE told them apart and `undo_cleaning_batch` read
        # it that way. `apply_readability_body(repair_dates=True)` writes BOTH
        # halves of one note in one write and captures both, so presence now
        # says only "this was captured", never "this changed". The flags say
        # which changed, and only a changed half is stored — an unchanged half
        # stores "" so the undo cannot reach a restore it must not run.
        #
        # ⛔ THE FAILURE THIS PREVENTS IS A DESTROYED NOTE, not a wrong count:
        # `old_fm == b""` MEANS "the note had no block, remove the one it has
        # now", so an undo that ran the frontmatter restore for a write that
        # never touched the frontmatter would delete her whole block.
        #
        # ⚠ A RECORD WITHOUT THE FLAGS IS A LEGACY ONE and keeps the old
        # meaning exactly — `apply_cleaning_frontmatter`'s records have no
        # flags, and neither does anything already written into a log file on
        # her disk. Never infer a flag's absence as False.
        has_flags = "body_changed" in record or "fm_changed" in record
        if has_flags:
            body_moved = record.get("body_changed") is True
            fm_moved = record.get("fm_changed") is True
        else:
            body_moved = record.get("old_body") is not None
            fm_moved = not body_moved
        entry = {"id": record.get("id"),
                 "origin_path": origin,
                 "old_fm_b64": (_clean_log_b64(record.get("old_fm"))
                                if fm_moved else ""),
                 "new_fm_b64": _clean_log_b64(record.get("new_fm")),
                 # 26.95-05 (#86 ruling 2): the readability pass's undo target.
                 # ⚠ THIS IS THE REAL COST THE OWNER WAS SHOWN AND ACCEPTED: a
                 # label undo keeps the small block it changed, a body undo
                 # keeps the WHOLE PRIOR BODY of every note touched. Approving
                 # a run off three examples is only reasonable if being wrong
                 # is cheap, and this is what cheap costs.
                 "old_body_b64": (_clean_log_b64(record.get("old_body"))
                                  if body_moved else ""),
                 # the explicit half-marker the presence test can no longer be
                 # (see above). Written always; read defensively.
                 "fm_changed": bool(fm_moved),
                 "old_mtime": record.get("old_mtime"),
                 "at": int(time.time() * 1000)}
        prior = None
        for i, existing in enumerate(batch["files"]):
            if existing.get("origin_path") == origin:
                prior = i
                break
        if prior is None:
            batch["files"].append(entry)
        else:
            # keep the FIRST captured old_fm/old_body/old_mtime: that is the
            # state the file must return to, not an intermediate one.
            #
            # ⚠ PER FIELD, AND ONLY WHERE THE EARLIER RECORD ACTUALLY HELD
            # ONE. Taking the prior entry's value unconditionally was right
            # while a batch was all-labels or all-bodies; it silently DROPS a
            # half now. A run that laid a note out and then repaired its dates
            # would keep the prior entry's empty `old_fm_b64` and the date
            # change would become untakeable-back — the reversibility promise
            # failing quietly, on the half nobody was looking at.
            older = batch["files"][prior]
            if older.get("old_fm_b64"):
                entry["old_fm_b64"] = older["old_fm_b64"]
                entry["fm_changed"] = True
            if older.get("old_body_b64"):
                entry["old_body_b64"] = older["old_body_b64"]
            entry["old_mtime"] = older.get("old_mtime")
            batch["files"][prior] = entry
    if undone_ms is not None:
        batch["undone_ms"] = undone_ms
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(str(path), json.dumps(
        data, ensure_ascii=False, indent=1).encode("utf-8"))
    return data


CLEANING_RUNS_KEPT = 3


def release_cleaning_copies(path, keep=CLEANING_RUNS_KEPT):
    """Let go of the stored copies from runs older than the newest `keep`.
    Returns {'runs', 'notes', 'bytes'} — what was released. Writes the log.

    ⚠ WHAT THIS IS FOR. Taking a tidy-up back means restoring the note's
    previous body, so the room keeps a verbatim copy of every note it has
    changed. On her real library that reached 16.8 MB — 99% of that file, her
    own writing, held forever. Her call 2026-08-15: keep the recent runs, let
    the older copies go.

    ⚠⚠ WHOLE RECORDS ARE DELETED, NEVER BLANKED, AND THE DIFFERENCE IS A
    DESTROYED NOTE. `undo_cleaning_batch` tells a body record from a LABEL
    record BY THE PRESENCE OF THE BODY, and an emptied `old_body_b64` is
    falsy — so a blanked record reads as a label record, whose `old_fm` of
    b"" means "this note had no frontmatter block, remove the one it has
    now". Blanking would arm a frontmatter wipe across every released note.
    `expire_suggestions` reached the same rule from the other end (*delete,
    never blank*), and it is the precedent this follows.

    ⚠ THE BATCH ITSELF STAYS, drained: `{started_ms, undone_ms, files: []}`.
    An empty batch is already skipped by the default undo pick, already
    answers "nothing to put back" when named, and already drops off the runs
    list — so nothing downstream needs to learn a new shape.

    ⚠ AGE IS COUNTED IN RUNS, NOT DAYS, AND THAT IS LAW 3. A clock-based
    release would quietly delete her way back while she was away — the room's
    state would have got worse for an absence, which is the one thing it may
    never do. Runs only advance when she runs one, so nothing is lost by not
    visiting.

    ⚠ AN UNDONE RUN IS RELEASED LIKE ANY OTHER: it has already been put back,
    so its copies protect nothing. Never raises; a log it cannot read is no
    runs and no release."""
    data = load_cleaning_log(path)
    batches = data.get("batches") or []
    keep = max(0, int(keep))
    released = {"runs": 0, "notes": 0, "bytes": 0}
    if len(batches) <= keep:
        return released
    for batch in batches[:len(batches) - keep] if keep else batches:
        files = batch.get("files") or []
        if not files:
            continue
        released["runs"] += 1
        released["notes"] += len(files)
        released["bytes"] += sum(
            len(str(f.get("old_body_b64") or "")) for f in files)
        batch["files"] = []          # the record goes, not its contents
    if released["runs"]:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_bytes(str(p), json.dumps(
            data, ensure_ascii=False, indent=1).encode("utf-8"))
    return released


def cleaning_runs(path, limit=5):
    """The recent tidy-up runs, newest first: [{batch, at, notes, undone}].

    ⚠ THIS EXISTS BECAUSE THE UNDO WAS UNREACHABLE. "One tap back" lived
    only in the page the run happened on — the batch id was client state, so
    a reload lost it and no surface ever offered another way in. The room was
    keeping a verbatim copy of every note it had changed (16.8 MB of her own
    writing on her real library, 99% of that file) for an undo she could not
    get to. Either the copies go or they become reachable; she chose
    reachable, 2026-08-15.

    ⚠ COUNTS ONLY, NEVER PATHS OR TITLES. The log holds an origin_path per
    file and this returns none of them: a list of what the room changed is a
    list of her notes, and the surfaces that may name a note are the ones
    that go through the fence. A count needs no fence and can leak nothing.

    `notes` is how many files the run really wrote — the length of its own
    record — so a batch drained by a release reads 0 and the surface can say
    so rather than offering a button that would restore nothing.

    Pure read, fail-open through `load_cleaning_log`: an unreadable or
    hand-edited log is no runs, never an error. Never writes."""
    data = load_cleaning_log(path)
    out = []
    for batch in reversed(data["batches"]):
        started = batch.get("started_ms")
        if not isinstance(started, int) or isinstance(started, bool):
            continue
        files = batch.get("files") or []
        out.append({
            "batch": started,
            "at": started,
            "notes": len(files),
            "undone": batch.get("undone_ms") is not None,
        })
        if limit and len(out) >= limit:
            break
    return out


def undo_cleaning_batch(path, batch_ms=None):
    """(batch_ms, [{id, origin_path, old_fm, fm_changed, old_body,
    old_mtime}]) for one batch — the NAMED one, or the newest not-yet-undone
    batch when `batch_ms` is None. `(None, [])` when there is nothing to undo,
    which is what makes a second undo a no-op rather than a double restore.

    The returned `old_fm` values are BYTES (base64 decoded here, so no
    caller carries the framing) and `b""` is meaningful — it means the note
    had no frontmatter block before, and restore_frontmatter_block removes
    the block entirely.

    ⛔ WHICH IS EXACTLY WHY `fm_changed` EXISTS AND MUST BE OBEYED. b"" is
    also what an entry whose frontmatter never moved decodes to, and the two
    readings are opposite: one says "remove her block", the other says "leave
    it alone". A caller that restores frontmatter without consulting this flag
    will delete the whole block of every note in a body-only run. Since
    2026-08-17 one note can carry BOTH halves, so the old exclusive
    presence test is gone — see merge_cleaning_log.

    Pure read: never writes, never raises."""
    data = load_cleaning_log(path)
    chosen = None
    for batch in reversed(data["batches"]):
        if batch_ms is None:
            if batch.get("undone_ms") is None and batch.get("files"):
                # an empty batch is skipped, never "chosen and restores 0" —
                # otherwise one no-op batch would shadow the real one behind
                # it forever
                chosen = batch
                break
        elif batch.get("started_ms") == batch_ms:
            chosen = batch
            break
    if chosen is None:
        return None, []
    out = []
    for entry in chosen.get("files") or []:
        origin = str(entry.get("origin_path") or "")
        if not origin:
            continue
        mtime = entry.get("old_mtime")
        # 26.95-05: `old_body` is None on a label batch and BYTES on a
        # readability batch, which is how the undo route tells the two apart
        # without a `kind` field anybody could get wrong. b"" is deliberately
        # not None: an empty prior body is a real state to return to.
        raw_body = entry.get("old_body_b64")
        # ⚠ `fm_changed` IS READ DEFENSIVELY, and the fallback is the OLD
        # RULE. Entries already sitting in a log file on her disk predate the
        # flag; for those, a body entry has no frontmatter half and a label
        # entry is all frontmatter — exactly what the exclusive presence test
        # meant — so an absent flag reproduces the shipped behaviour byte for
        # byte. ⛔ `entry.get("fm_changed") is True` alone would silently strip
        # the undo off every label batch already written.
        flag = entry.get("fm_changed")
        fm_changed = (bool(flag) if isinstance(flag, bool)
                      else not raw_body)
        out.append({"id": entry.get("id"), "origin_path": origin,
                    "old_fm": _clean_log_unb64(entry.get("old_fm_b64")),
                    "fm_changed": fm_changed,
                    "old_body": (_clean_log_unb64(raw_body)
                                 if raw_body else None),
                    "old_mtime": mtime if isinstance(mtime, (int, float))
                    and not isinstance(mtime, bool) else None})
    return chosen.get("started_ms"), out


# ---------------------------------------------------------------------------
# ---- 26.99-03 (D-01, D-02, D-21): the call record -------------------------
#
# ⚠ WHAT THIS FILE IS. One line per librarian call — when, what job, who
# answered, and the two token counts that call reported. Read one way it is
# a bill. Read the other it is EVERYTHING THIS APP HAS EVER SENT, AND TO
# WHOM, and that second reading is the only thing in the room that answers
# "has my privacy been kept" with evidence rather than a promise (D-02).
#
# ⚠ TOKENS, NEVER MONEY (D-01). A stored figure in a currency is a rate
# table's snapshot wearing a fact's clothes: rates move, and history cannot
# be re-valued if only the currency was kept. Counts can be, forever.
#
# ⛔ NO ITEM ID, NO TITLE, NO PATH (law 5, L-06). A record that named the
# things it sent would put never-list material into the one place it would
# be most damaging — the place somebody opens BECAUSE she has been told it
# is the honest one. `cleaning_runs` reached the same rule from the other
# end (*counts only, never a path or a title*), and it is the precedent
# this follows rather than a fresh judgement.
#
# ⚠ WHY IT SITS IN THE ROOM'S OWN CONFIG DIRECTORY AND NOT UNDER
# `librarian/`, WHERE EVERY OTHER NOTEBOOK LIVES. The owner's ruling,
# 2026-08-16, taken as a ONE-WAY DOOR because moving the file afterwards
# strands the records already written: the reader looks in the new place,
# answers empty, and the evidence D-02 exists to provide is silently gone.
# D-02's own words are *the custody shape #28 chose for the key file*, and
# that is this directory; `--setup` can already reach it while it cannot
# reach a library root. The cost she was shown and accepted: deleting
# `librarian/` is a factory reset that leaves this file behind.
# ⚠ AND IT LEAVES A SHIPPED SAFETY PIN ALONE. `tests/test_stage_public.py`
# holds her real `librarian/` folder at a fixed corpus with exactly two
# volatile members, and its own assertion says a THIRD must be noticed
# rather than accommodated. What would overturn this: her saying so.
#
# APPEND-ONLY, AND NOT RELEASED (D-21). The cleaning log lets its old
# copies go because it holds verbatim copies of her notes; this file holds
# six small fields per line and no content of hers at all, so there is
# nothing here to let go of. ⚠ Releasing EVIDENCE is a different act from
# bounding a hoard.
#
# The caller owns any locking; these two do the load -> merge -> atomic
# write only, exactly as the cleaning-log trio above does.
# ---------------------------------------------------------------------------

CALL_RECORD_NAME = "call-record.json"


def call_record_path():
    """`call-record.json` in the room's own config directory, beside the
    keys file — the custody shape named in the block above.

    ⚠ IT TAKES NO LIBRARY ROOT, and that absence is the ruling made
    structural rather than written down: a parameter naming a library
    would be a second place the answer could come from, and one of them
    would eventually be a library. Pure path math, recomputed on every
    call so it can never be a stale copy of a home directory that has
    since changed."""
    return room_config_dir() / CALL_RECORD_NAME


def load_call_record(path):
    """{'calls': [...]} — FAIL-OPEN: a missing, unreadable, or
    hand-edited-off-shape file reads as the empty wrapper, exactly as
    `load_cleaning_log` does. Never raises, never writes.

    ⚠ THE FAIL-OPEN READ IS WHAT MAKES DELETION HONEST. This file is hers
    to open, edit and delete (#28's custody), and after she deletes it the
    reader must answer *nothing here* rather than an error — otherwise the
    room would punish her for taking the one action it offered her.

    Shape: calls = [{at, job, provider, model, input_tokens,
    output_tokens}] — oldest FIRST, in the order they were written."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"calls": []}
    if not isinstance(data, dict):
        return {"calls": []}
    calls = data.get("calls")
    if not isinstance(calls, list):
        return {"calls": []}
    return {"calls": [c for c in calls if isinstance(c, dict)]}


def empty_call_record(path):
    """Leave the record EMPTY rather than gone — 26.99955 UAT G-…-10, her
    ruling of 2026-08-26. Returns True when a file was emptied, False when
    there was nothing there to empty.

    ⛔⛔ THIS REVERSES A WRITTEN RULE, AND THE REVERSAL IS HERS. The route
    that calls this used to unlink the whole file, and it argued for that at
    length: *delete, never blank*, on the precedent of
    `release_cleaning_copies` and `expire_suggestions`. ⭐ THAT ARGUMENT IS
    ABOUT A LINE, NOT ABOUT THE FILE — a call kept with its fields emptied
    still reads as evidence, and says the room sent something it cannot
    name. Nothing here keeps a hollowed line: the list goes to zero
    entries. What survives is the CONTAINER, which claims nothing about any
    call that was ever made.

    ⚠ ABSENCE STAYS ABSENCE. A record that was never written is not created
    here — the room does not manufacture an evidence file she never
    generated, and a second press still answers exactly as calmly as the
    first.

    ⚠ THE CALLER OWNS THE LOCKING, exactly as `merge_call_record` does, and
    the write is the same atomic one: a torn write on iCloud-adjacent
    storage is a named known hazard, and this file is the one the room
    offers as proof.

    ⚠ AN HONEST LIMIT, WRITTEN DOWN RATHER THAN GLOSSED: emptying does NOT
    by itself make the clear undoable. The lines are gone from disk either
    way; what this changes is that the record now has a lifetime instead of
    disappearing, which is the thing a later undo would need to hang on.
    ⛔ Do not record this as "undo is built"."""
    path = Path(path)
    if not path.exists():
        return False
    atomic_write_bytes(str(path), json.dumps(
        {"calls": []}, ensure_ascii=False, indent=1).encode("utf-8"))
    return True


def merge_call_record(path, records):
    """Load, append, and atomically rewrite the call record; return the
    merged document.

    APPEND-ONLY (D-21): nothing here removes, rewrites or trims an earlier
    line, and there is no retention rule of any kind. A bound would have to
    be argued on its own terms, and the argument the cleaning log used
    (verbatim copies of her notes, 16.8 MB of them) does not exist here.

    One load -> merge -> atomic write via `atomic_write_bytes`, touching no
    other file — a torn write on iCloud-adjacent storage is a named known
    hazard. The caller owns any locking."""
    path = Path(path)
    data = load_call_record(path)
    for record in (records or []):
        if not isinstance(record, dict):
            continue
        data["calls"].append(dict(record))
    parent = path.parent
    if parent == room_config_dir():
        # ⚠ 0700, ASSERTED RATHER THAN INHERITED — and this is not
        # fussiness. This directory holds the keys file. `mkdir`'s mode is
        # filtered through the process umask, so a bare mkdir here could
        # quietly create the directory a credential lives in at 0755 and
        # the room would be claiming a protection it was not providing.
        ensure_room_config_dir()
    else:
        parent.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(str(path), json.dumps(
        data, ensure_ascii=False, indent=1).encode("utf-8"))
    return data


# ---------------------------------------------------------------------------
# ---- 26.4-02 deterministic insights (a)-(c), SRM-09/SRM-12, D-15/16/17/19 --
# Three PURE store reads that describe the archive back to the user in plain
# facts — and produce the SAME numbers whether or not the librarian ever
# ran, because they read only the store (never a suggestion, proposal, book,
# notebook, visit stamp, or wall clock). Every one filters through the SAME
# exclusion predicate the payload builder uses (_librarian_fenced with
# meta.filters), so a fenced / never_show / retired / trigger-flagged /
# filter-matched item contributes to NO count (D-19: one definition of who
# is excluded, shared by an insight count and a payload exclusion). The
# surface for these numbers (books / a Manage fallback) is plan 26.4-04;
# here they are data only.
# ---------------------------------------------------------------------------

# Meteorological season by month of the item's OWN save stamp — a portrait
# of what was SAVED over time, never a visit/attendance/absence/streak read
# (D-17, law 3). December buckets with the calendar year it falls in (zero
# interpretation: a plain date bucket, not a spanning-winter judgment).
_SEASON_BY_MONTH = {12: "winter", 1: "winter", 2: "winter",
                    3: "spring", 4: "spring", 5: "spring",
                    6: "summer", 7: "summer", 8: "summer",
                    9: "autumn", 10: "autumn", 11: "autumn"}


def _insight_theme_keys(item):
    """The theme keys one item belongs to (D-16): each of its tags PLUS its
    stored `folder` facet — the SAME structural field the librarian fence's
    'folder' filter matches on, so themes and the fence never disagree about
    what folder an item is from. Purely structural, zero interpretation: no
    sentiment, no topic-modelling, just the tags and the source folder the
    item already carries. An item may belong to several themes. Pure."""
    keys = []
    for t in (item.get("tags") or []):
        t = str(t).strip()
        if t and t not in keys:
            keys.append(t)
    folder = str(item.get("folder") or "").strip()
    if folder and folder not in keys:
        keys.append(folder)
    return keys


def _item_save_stamp(item):
    """The item's newest save stamp = max(created_ms, saved_ms) as an int,
    or 0 when neither is a usable number. The SAME stamp definition the
    since-last-visit 'recent' marker uses (build_librarian_payload), so a
    season bucket and a recent flag read one clock: the item's own, never
    the wall clock. Pure."""
    stamp = 0
    for v in (item.get("created_ms"), item.get("saved_ms")):
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            stamp = max(stamp, int(v))
    return stamp


def _item_season(item):
    """'<year> <season>' from the item's OWN save stamp (server-local, the
    stamp_facets year convention), or None when the item carries no usable
    date. Reads the item's stamp ONLY — never a visit, room_entries,
    last_visit_ms, or the current time (D-17, law 3). Pure."""
    stamp = _item_save_stamp(item)
    if stamp <= 0:
        return None
    dt = datetime.fromtimestamp(stamp / 1000)
    return f"{dt.year} {_SEASON_BY_MONTH[dt.month]}"


def insight_never_opened(store):
    """(a) The count of non-fenced items never opened — last_opened_ms is
    None (D-15). A pure store read: fence-respecting, identical with the
    librarian on or off. Never raises."""
    meta = store.get("meta") or {}
    filters = meta.get("filters") or []
    return sum(1 for it in (store.get("items") or {}).values()
               if isinstance(it, dict)
               and not _librarian_fenced(it, filters)
               and it.get("last_opened_ms") is None)


def insight_themes(store):
    """(b) {theme: count} over non-fenced items (D-16), theme = each tag
    plus the item's source folder (see _insight_theme_keys). An item counts
    once per theme it belongs to. Purely structural, fence-respecting,
    identical whether or not the librarian ran. Never raises."""
    meta = store.get("meta") or {}
    filters = meta.get("filters") or []
    counts = {}
    for it in (store.get("items") or {}).values():
        if not isinstance(it, dict) or _librarian_fenced(it, filters):
            continue
        for key in _insight_theme_keys(it):
            counts[key] = counts.get(key, 0) + 1
    return counts


def insight_seasons(store):
    """(c) {theme: {season: count}} over non-fenced items (D-17): a portrait
    of what was SAVED over time, grouped by (theme, season) where the season
    comes from the item's OWN created_ms/saved_ms — NEVER visits, absence,
    streaks, or day-counts (law 3). Items without a usable save date are
    skipped. Fence-respecting and identical with the librarian on or off:
    the same numbers fall out because nothing here reads a visit stamp or a
    wall clock. Never raises."""
    meta = store.get("meta") or {}
    filters = meta.get("filters") or []
    out = {}
    for it in (store.get("items") or {}).values():
        if not isinstance(it, dict) or _librarian_fenced(it, filters):
            continue
        season = _item_season(it)
        if season is None:
            continue
        for theme in _insight_theme_keys(it):
            bucket = out.setdefault(theme, {})
            bucket[season] = bucket.get(season, 0) + 1
    return out


# ---------------------------------------------------------------------------
# ---- 26-02 pre-sort batching + the librarian's notebook ----
# librarian_batches slices a build_librarian_payload return into ordered,
# self-contained batch texts (compact JSON, instruction-free — the system
# prompt carries every instruction; the batch text is data only).
# load_suggestions / merge_suggestions own librarian/suggestions.json — a
# VISIBLE, hand-editable notebook beside the store, never inside items.json
# (D-05): a missing or damaged file reads as empty (fail-open — deleting
# librarian/ is a factory reset), and every write goes through
# atomic_write_bytes. Nothing here ever touches item state or meta: the
# librarian proposes, only the user's own tap through /api/state disposes
# (law 2/7).
# ---------------------------------------------------------------------------

# ⚠ A BATCH IS BOUNDED TWICE, AND THE TWO BOUNDS GUARD DIFFERENT ENDS OF THE
# CALL (map #83, 2026-08-14). The byte budget protects what goes IN — it is
# what #63 sized against the local model's declared window. The item counts
# protect what comes BACK: the answer is one verdict per item, so its length
# scales with the item COUNT and knows nothing about bytes. Bounding only the
# bytes is what shipped, and it failed like this:
#
#   150,000 B packs 18 notes when every note fills the 8 KB cap — but 41+ when
#   a person's notes are short. Measured, the pre-sort answer runs
#   `≈ 116 + 35 x N` output tokens for bodies and `≈ 34 + 21 x N` for rows,
#   against `import_presort`'s max_tokens of 1500. So a batch of 55 short
#   notes asks for ~2,000 tokens, comes back `truncated`, is never retried
#   (correctly — a re-ask reproduces it), and `_presort_worker` STOPS THE
#   WHOLE RUN. Five runs out of five sorted ZERO of 60 notes.
#
# ⚠ THE FAILURE WAS THEREFORE A FUNCTION OF HOW SHORT SOMEONE'S NOTES WERE — a
# vault of long essays survived where a vault of daily entries died, and
# nothing in the code or the copy knew that. The item bounds below sit ~40%
# under the fitted cap, which is the headroom the measured run-to-run variance
# needs (a 50-row answer measured 1,444 once and 947 another time on identical
# input: `unsure` is a short answer and a real verdict with a `why` is not, so
# the batches that overflow are the ones the model sorted CONFIDENTLY).
#
# ⚠ 25 -> 18 AFTER THE FIX WAS VERIFIED LIVE, which is the point of verifying:
# at 25 bodies the answer measured 1,119-1,349 against the 1,500 cap — 90% of
# it — where the fit had predicted ~990. A `why` runs longer on some notes than
# the linear fit knows, and a 50-item answer has been seen to vary 947 -> 1,444
# on IDENTICAL input. 90% is not headroom, it is the same defect with a smaller
# batch. 18 is also the number the byte budget already produces when every note
# fills the 8 KB cap, so the two bounds now agree at the hard end instead of
# disagreeing by 3x. The extra call costs ~180 prompt tokens; the batch it
# replaces was costing the entire run.
#
# The cap itself is deliberately NOT touched: it is an owner-approved value,
# and with these bounds nothing reaches it.
LIBRARIAN_METADATA_BATCH = 40        # metadata rows per batch (D-03, #83)
LIBRARIAN_BODY_BUDGET = 150_000      # body-text bytes per batch (D-03)
LIBRARIAN_BODY_ITEMS = 18            # bodies per batch — the OUTPUT bound (#83)


def librarian_batches(payload, metadata_batch=LIBRARIAN_METADATA_BATCH,
                      body_budget=LIBRARIAN_BODY_BUDGET,
                      body_items=LIBRARIAN_BODY_ITEMS):
    """Slice a build_librarian_payload return into ordered batches.

    Returns [{'ids': [...], 'text': '<compact json>'}, ...]:
      - metadata rows in fixed-size groups of `metadata_batch`, each
        batch text = {"meta_rows": [...]}
      - bodies greedily packed so a batch stays under BOTH `body_budget`
        (summed body-text bytes, the input bound) AND `body_items` (the
        output bound — see the note above this function), each batch text
        = {"bodies": [...]}; a single body over the budget still ships
        alone (the 8 KB per-item cap upstream makes that a guard, not a
        path)
    Deterministic: input order is preserved and the same payload always
    yields the same batches. Pure — no I/O, no mutation of `payload`.
    The 'ids' list is the server's MEMBERSHIP whitelist for that batch:
    a verdict naming any other id is dropped fail-visible."""
    batches = []
    rows = list(payload.get("meta_rows") or [])
    for start in range(0, len(rows), metadata_batch):
        chunk = rows[start:start + metadata_batch]
        batches.append({
            "ids": [r.get("id") for r in chunk],
            "text": json.dumps({"meta_rows": chunk}, ensure_ascii=False,
                               separators=(",", ":")),
        })

    def body_batch(group):
        return {
            "ids": [b.get("id") for b in group],
            "text": json.dumps({"bodies": group}, ensure_ascii=False,
                               separators=(",", ":")),
        }

    group, used = [], 0
    for body in (payload.get("bodies") or []):
        size = len(str(body.get("text") or "").encode("utf-8"))
        # whichever bound trips FIRST closes the batch: bytes guard the
        # request, the count guards the answer (#83).
        if group and (used + size > body_budget or len(group) >= body_items):
            batches.append(body_batch(group))
            group, used = [], 0
        group.append(body)
        used += size
    if group:
        batches.append(body_batch(group))
    return batches


def load_suggestions(path):
    """The librarian's notebook, or the empty shape
    {'runs': [], 'verdicts': {}} when the file is missing, unreadable, or
    hand-edited off-shape (fail-open: the librarian forgets rather than
    ever blocking the room). Never raises, never writes.

    Shape: runs = [{started_ms, consent, auth, cost_usd, stopped_why?}]
    (one record per run — the consent fact lives HERE and nowhere else,
    per-run, never a reusable grant); verdicts = {id: {shelf, why, batch,
    at, acked?, user_took?}}."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"runs": [], "verdicts": {}}
    if not isinstance(data, dict):
        return {"runs": [], "verdicts": {}}
    runs = data.get("runs")
    verdicts = data.get("verdicts")
    return {"runs": runs if isinstance(runs, list) else [],
            "verdicts": verdicts if isinstance(verdicts, dict) else {}}


def merge_suggestions(path, new_verdicts, run_record=None):
    """Load, merge, and atomically rewrite the notebook; return the
    merged dict.

    Per-id SHALLOW merge: fields in new_verdicts[id] update the existing
    record — an ack stamp never erases the shelf or the why. run_record
    (matched by started_ms) replaces its own earlier snapshot or appends,
    so the worker can re-merge after EVERY batch and a killed run still
    leaves a truthful record behind (kill-safe, resumable). The caller
    owns any locking; this function is one load -> merge -> atomic write
    and touches no other file."""
    path = Path(path)
    data = load_suggestions(path)
    for item_id, fields in (new_verdicts or {}).items():
        if not isinstance(fields, dict):
            continue
        record = data["verdicts"].get(str(item_id))
        if not isinstance(record, dict):
            record = {}
        record.update(fields)
        data["verdicts"][str(item_id)] = record
    if isinstance(run_record, dict):
        stamp = run_record.get("started_ms")
        replaced = False
        for i, run in enumerate(data["runs"]):
            if isinstance(run, dict) and run.get("started_ms") == stamp:
                data["runs"][i] = dict(run_record)
                replaced = True
                break
        if not replaced:
            data["runs"].append(dict(run_record))
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_bytes(str(path), json.dumps(
        data, ensure_ascii=False, indent=1).encode("utf-8"))
    return data


def expire_suggestions(path, item_ids) -> int:
    """Drop the room's own guess about notes whose WORDS changed (#94 ruling
    2, reached from #58's refresh). Returns how many records were dropped.

    ⚠ THE RECORD IS DELETED, NOT BLANKED, and the difference is load-bearing.
    The pre-sort skips ids that already appear in this notebook, so blanking
    the `shelf` would take the card off the review surface AND keep the note
    frozen out of every future run — invisible and unsortable at once. A
    deleted record simply means the room has not looked at this note yet,
    which after its words changed is the truth.

    ⚠ AN ACKED RECORD IS NEVER TOUCHED. #94 ruling 5 — *what she answered
    stays answered; a re-run never re-offers a note she has already acked* —
    is #58 ruling 2 in the notebook: her answer is hers, the shelf guess is
    the room's. This drops the room's half and leaves hers alone.

    ⚠ ONLY the ids handed in, and only those the caller decided were REWORDED.
    A whitespace-only change is not a change of words (#94 ruling 7), so a
    tidy-up run must reach this function with an empty list and re-sort
    nothing — otherwise tidying a vault costs ten hours of re-reading notes
    whose words are byte-identical.

    FAIL-OPEN, never raises: an unreadable or hand-edited notebook reads as
    the empty shape (`load_suggestions`) and a write that cannot happen leaves
    a stale guess, which is the smaller harm and the shipped posture. The
    caller owns any locking."""
    ids = {str(i) for i in (item_ids or ())}
    if not ids:
        return 0
    try:
        data = load_suggestions(path)
        dropped = 0
        for item_id in ids:
            record = data["verdicts"].get(item_id)
            if not isinstance(record, dict):
                continue
            if record.get("acked") is True:
                continue          # hers, not the room's
            del data["verdicts"][item_id]
            dropped += 1
        if dropped:
            p = Path(path)
            p.parent.mkdir(parents=True, exist_ok=True)
            atomic_write_bytes(str(p), json.dumps(
                data, ensure_ascii=False, indent=1).encode("utf-8"))
        return dropped
    except (OSError, ValueError, TypeError):
        return 0


# ---------------------------------------------------------------------------
# ---- 26-03 the librarian's notebook digest (SRM-12) ----
# notebook_digest turns the suggestions notebook into a few plain lines —
# aggregate counts and shelf words ONLY, never an item id, title, or body
# byte: this is sanctioned non-builder stdin class (1) of exactly two
# (AI-SPEC checker W2; the other is the dismissed-topics list, composed
# server-side). append_notebook keeps librarian/notebook.md — the
# librarian's learning, literally readable (D-05): plain lines the user
# can open, edit, or delete; a missing or unreadable file reads as an
# empty memory, never an error.
# ---------------------------------------------------------------------------

# 26-03 fixed-window constant. As of 26.4-01 (D-08) the note scope's "now"
# is SINCE LAST VISIT, not this fixed window — the constant is retained (no
# scope reads it now) but is no longer the recent definition for note scope.
LIBRARIAN_RECENT_MS = 30 * 24 * 60 * 60 * 1000   # ~30 days (26-03, retained)


def notebook_digest(suggestions):
    """A few plain lines about the sorting so far, computed from a
    load_suggestions return. Counts and shelf words only — no item id,
    title, or body byte can appear here by construction, which is what
    lets these lines ride the agent stdin as one of the two sanctioned
    content-free classes. Returns [] when nothing has been sorted.
    Pure — no I/O, no clock."""
    verdicts = (suggestions or {}).get("verdicts") or {}
    counts = {"joyful": 0, "receipts": 0, "heavy": 0, "unsure": 0}
    kept = {"blessed": 0, "never_show": 0, "skipped": 0}
    answered = 0
    for record in verdicts.values():
        if not isinstance(record, dict):
            continue
        shelf = record.get("shelf")
        if shelf in counts:
            counts[shelf] += 1
        if record.get("acked") is True:
            answered += 1
            took = record.get("user_took")
            if took in kept:
                kept[took] += 1
    if sum(counts.values()) == 0:
        return []
    lines = ["the sort so far: %d joyful, %d receipts, %d heavy, "
             "%d unsure." % (counts["joyful"], counts["receipts"],
                             counts["heavy"], counts["unsure"])]
    if answered:
        lines.append("of %d answered: %d kept for the shelf, %d set "
                     "aside unshown, %d left in the pile." %
                     (answered, kept["blessed"], kept["never_show"],
                      kept["skipped"]))
    return lines


def append_notebook(path, lines):
    """Append plain lines to the librarian's readable notebook file via
    the same atomic write everything else uses. Fail-open read: a
    missing or unreadable notebook simply starts over; a failed write
    is swallowed — the notebook is a diary, never a gate. Returns the
    written text (or the existing text when there was nothing to
    add)."""
    path = Path(path)
    try:
        existing = path.read_text(encoding="utf-8")
    except OSError:
        existing = ""
    if not lines:
        return existing
    body = existing
    if body and not body.endswith("\n"):
        body += "\n"
    body += "\n".join(str(line) for line in lines) + "\n"
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write_bytes(str(path), body.encode("utf-8"))
    except OSError:
        pass   # a diary write must never block the room
    return body
