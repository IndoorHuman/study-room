#!/usr/bin/env python3
"""Shared osascript mock for the Apple Notes adapter suites (Phase 26.65).

The Notes adapter reaches Notes.app through ONE subprocess seam,
`adapters.apple_notes._run_osascript(script, *args)`. Unit tests must never
touch a live Notes library or trip the macOS Automation (AppleEvents) consent
prompt, so this fixture supplies canned note enumerations + HTML bodies and a
drop-in replacement for that single seam.

The real seam returns a plain string (osascript stdout):
  - the ENUMERATE call passes NO extra args and returns one line per note,
    tab-delimited `<id>\t<folder>`;
  - the EXPORT call passes the note id as the first argument and returns that
    note's raw HTML body.

`make_fake_run_osascript` mirrors exactly that contract, distinguishing the
two calls by whether an argument was supplied — so the fake stays decoupled
from the exact AppleScript constant strings.

Stdlib only (unittest.mock) — honours the zero-dependency law (law 8).
"""
from unittest import mock

# Canned note enumeration the adapter's enumerate step yields, each with the
# raw HTML body the export step returns. Bodies deliberately carry headings
# and lists so the HTML->Markdown conversion is exercised, and the notes span
# two folders so exclude_folders can be tested.
SAMPLE_NOTES = [
    {
        "id": "x-coredata://F1A/ICNote/p1",
        "folder": "Notes",
        "body": ("<div><h1>Grocery list</h1></div>"
                 "<div>things worth remembering</div>"
                 "<ul><li>apples</li><li>fresh bread</li></ul>"),
    },
    {
        "id": "x-coredata://F1A/ICNote/p2",
        "folder": "Notes",
        "body": ("<div>Morning pages</div>"
                 "<div>a quiet start to the day &amp; a cup of tea</div>"),
    },
    {
        "id": "x-coredata://F1A/ICNote/p3",
        "folder": "Recipes",
        "body": ("<div><h2>Tomato soup</h2></div>"
                 "<div>simmer slowly</div>"
                 "<ul><li>tomatoes</li><li>basil</li></ul>"),
    },
]


def enumerate_payload(notes=None):
    """The tab-delimited `<id>\t<folder>` stdout the enumerate script emits."""
    notes = SAMPLE_NOTES if notes is None else notes
    return "".join("{}\t{}\n".format(n["id"], n["folder"]) for n in notes)


def bodies(notes=None):
    """A {note-id: raw-HTML-body} map, keyed exactly like the export step."""
    notes = SAMPLE_NOTES if notes is None else notes
    return {n["id"]: n["body"] for n in notes}


def make_fake_run_osascript(notes=None):
    """A stand-in for `apple_notes._run_osascript(script, *args)`.

    Enumerate calls pass no extra args -> the tab-delimited enumeration.
    Export calls pass the note id as the first arg -> that note's HTML body.
    """
    notes = SAMPLE_NOTES if notes is None else notes
    body_map = bodies(notes)
    payload = enumerate_payload(notes)

    def fake(script, *args):
        if args:                       # export: first arg is the note id
            return body_map.get(args[0], "")
        return payload                 # enumerate: no per-note argument

    return fake


def patch_osascript(adapter_module, notes=None):
    """A context manager patching the adapter's single osascript seam."""
    return mock.patch.object(adapter_module, "_run_osascript",
                             side_effect=make_fake_run_osascript(notes))


# ---------------------------------------------------------------------------
# Apple Photos (Phase 26.65, Plan 03 — ADP-02).
#
# The Photos adapter reaches Photos.app through the SAME one-seam shape,
# `adapters.apple_photos._run_osascript(script, *args)`. Two calls:
#   - ENUMERATE passes NO extra args and returns one localIdentifier per line;
#   - EXPORT passes (media-id, dest-dir POSIX path) and, like Photos itself,
#     DROPS a rendered JPEG into that dest dir (returning no useful stdout).
# The fake distinguishes the two by arg count, exactly as the Notes fake does,
# and writes a real (non-empty, unique-per-id) JPEG blob so the shipped
# importer classifies it as an image and the content-hash stays distinct.
# Stdlib only (law 8): no Pillow, no image lib — bytes are enough because the
# importer classifies by extension, never by decoding.
# ---------------------------------------------------------------------------
from pathlib import Path as _Path  # noqa: E402

# JPEG start-of-image marker; the importer keys on the `.jpg` extension, so a
# short valid-prefixed blob is a sufficient stand-in for a real rendition.
_JPEG_SOI = b"\xff\xd8\xff"
_JPEG_EOI = b"\xff\xd9"

# Canned Photos enumeration. localIdentifiers are the real PhotoKit shape
# (`<UUID>/L0/001`) — note the `/`, which is exactly why the staged filename
# must be SERVER-generated, never derived from the id (T-26.65-09).
SAMPLE_PHOTOS = [
    {"id": "5B0B1E2A-1111-4A00-9000-000000000001/L0/001"},
    {"id": "5B0B1E2A-2222-4A00-9000-000000000002/L0/001"},
    {"id": "5B0B1E2A-3333-4A00-9000-000000000003/L0/001"},
]


def photo_enumerate_payload(photos=None):
    """The newline-delimited localIdentifier stdout the enumerate script emits."""
    photos = SAMPLE_PHOTOS if photos is None else photos
    return "".join("{}\n".format(p["id"]) for p in photos)


def _tiny_jpeg(seed):
    """A minimal, non-empty JPEG blob, unique per `seed` so two photos never
    collapse onto one content-hash (distinct `unseen` cards)."""
    return _JPEG_SOI + b"studyroom-mock-photo:" + seed.encode("utf-8") + _JPEG_EOI


def make_fake_run_photos_osascript(photos=None, drop_name="IMG_0001.jpg"):
    """A stand-in for `apple_photos._run_osascript(script, *args)`.

    Enumerate calls pass no extra args -> the newline localIdentifier list.
    Export calls pass (media-id, dest-dir) -> a JPEG is written into dest-dir
    (mimicking Photos' own export, which reuses the original filename — every
    item drops the SAME `IMG_0001.jpg`, so the adapter's per-item rename to a
    server-generated <uuid>.jpg is what actually prevents collisions).
    """
    photos = SAMPLE_PHOTOS if photos is None else photos
    payload = photo_enumerate_payload(photos)

    def fake(script, *args):
        if len(args) >= 2:                    # export: (media-id, dest-dir)
            media_id, dest_dir = args[0], args[1]
            out = _Path(dest_dir) / drop_name
            out.write_bytes(_tiny_jpeg(media_id))
            return ""
        return payload                        # enumerate: no per-item args

    return fake


def patch_photos_osascript(adapter_module, photos=None, drop_name="IMG_0001.jpg"):
    """A context manager patching the Photos adapter's single osascript seam.
    Entered as `with patch_photos_osascript(mod) as m:`; `m.call_args_list`
    then proves the per-item export loop (one export call per new id)."""
    return mock.patch.object(
        adapter_module, "_run_osascript",
        side_effect=make_fake_run_photos_osascript(photos, drop_name))
