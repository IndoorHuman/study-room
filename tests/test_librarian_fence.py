#!/usr/bin/env python3
"""
The librarian fence property suite (Phase 26, Plan 01 — SRM-13).

study_lib.build_librarian_payload is the ONLY source of bytes the
librarian's agent subprocess may ever receive. This suite is layer ONE of
the three-layer machine test (property here, static choke-point pins in
tests/test_no_push.cjs, the fake-claude stub end-to-end proof in
tests/test_server_smoke.py) — gutting the fence must fail at least two
independent suites.

Covered behaviors (26-01 Task 1):

  1. total exclusion   — items whose state is never_show or retired, items
                         carrying the trigger overlay, and items matching an
                         active meta.filters entry are absent ENTIRELY from
                         the payload — no id, no title, no metadata — under
                         EVERY scope × consent combination. Sentinel bodies
                         (FENCE-SENTINEL-<id>) and sentinel titles
                         (FENCE-TITLE-<id>) prove absence byte-wise.
  2. consent widens unjudged ONLY — unseen bodies are absent at
                         consent=False and present at consent=True under
                         scope=presort; never_show bodies are absent under
                         both; resting stays metadata-only under both.
  3. blessed present   — blessed text bodies ride the presort payload by
                         default; scope=note emits blessed bodies and
                         NOTHING else (zero metadata rows for other states).
  4. body cap          — a blessed body over 8 KB arrives truncated to its
                         first 8 KB and the return carries a visible
                         'bodies-capped' count — never a silent cut (D-03).
  5. randomized property — N >= 50 generated stores with random states,
                         trigger flags, filters, and CJK bodies: no fenced
                         byte in the payload, ever. The fenced predicate is
                         a HAND-ROLLED independent mirror of core.js
                         itemExcluded — deliberately not a call into
                         study_lib, so a bug in the fence cannot hide
                         itself here (the guardSurface pattern).
  6. filter parity     — study_lib._matches_active_filter excludes exactly
                         the items core.js matchesFilter/itemExcluded would
                         (core.js:149-179): one strict compare per facet
                         (source/type/year/folder/tag), unknown facets match
                         nothing, string-typed years never match int years.
                         Expected sets are hand-derived and documented at
                         each assertion.
  7. purity            — build_librarian_payload reads snapshots but writes
                         nothing: the store dict is unmutated and the
                         library dir's file set is unchanged after every
                         scope × consent call.

26.7-01 extension (RSF-06/SRM-11): the "reflection" scope — the candle
session's pool — joins behaviors 1, 5, and 7 through ALL_COMBOS (total
sentinel exclusion, the randomized hand-rolled mirror, purity), and gains
its own classes below: ReflectionScopeTest (the D-11 strict-> marker
boundary, fail-closed comment-ISO parsing, comments serialization,
id-sorted stable rows, sentinel absence across consent × marker),
ValidateReflectionTest (the fail-closed output contract), and
ReflectionEnvelopeStubTest (the hermetic reflection envelope + the
recorded-REQUEST model pin — see the 26.93-07 note below).

26.7-03 extension (T-26.7-09): RefineTurnFenceTest — an END-TO-END
sentinel case over the live routes: a sentinel-seeded store drives a
full session start plus one chat-refine turn through the real server
(hermetic stub, FAKE_CLAUDE_LOG recording), and the fence bytes are
proven absent from EVERY recorded stdin (generation AND refine — the
stateless re-send makes the whole model-visible context scannable each
turn) and from librarian/session.json's bytes on disk.

26.93-07 REPAIR — WHAT MOVED UNDER THIS SUITE, AND WHAT DID NOT.

The librarian stopped being a subprocess. There is no `claude` program on
PATH to point at, no argv to record, and no per-process availability probe
to reset; `librarian_call.call_librarian(job, payload_text, routing)` is
the one function that carries store bytes to a model, over HTTP.

⚠ EVERY SENTINEL AND LEAK CLAIM IN THIS FILE TRANSLATED WORD FOR WORD, and
that is not luck. The recording seam still writes a `stdin` key and it
still holds the whole per-turn document — it is now the user message out of
the built request rather than a pipe's contents — so "no fenced byte
reaches the model" is asserted over exactly the same bytes, at a strictly
earlier moment: after the app has decided everything, BEFORE a socket
exists. The five classes that drove the old seam were rebuilt on
`test_server_smoke.fake_claude_env`, which additionally swaps HOME so no
tier here can resolve to a company or reach the owner's real key.

⚠ TWO CLAIMS DIED RATHER THAN TRANSLATING, and both are named where they
were deleted: the `--no-session-persistence` argv pin (it died WITH the
subprocess — `librarian_call.py`'s own shipped prose says the guarantee is
vacuous on the Messages API, which keeps no conversation object a later
call can read back), and the `--model` argv pin (it died with D-01: a
caller may no longer name a model at all). The second was REPLACED, under
its own name, by a stronger and genuinely different fact — the recorded
request BODY names the routing fill's model, asserted by value.

The drill at the bottom of this file drives the rewritten claims RED once
against unmutated controls counted in the same run.

Stdlib only (unittest + tempfile) — the zero-dependency law (D-01/D-03).
Every scenario builds its store inside a fresh TemporaryDirectory; nothing
here ever touches real user data (the live store at ~/StudyRoom is never
referenced).
"""
import copy
import http.client
import inspect
import json
import os
import random
import re
import sys
import tempfile
import threading
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path

# study_lib.py is a plain module at the repo root — same shim as the other
# python suites so the runner's cwd never matters.
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
# ...and the tests directory itself, so the recording seam below resolves.
_TESTS_DIR = _REPO_ROOT / "tests"
if str(_TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(_TESTS_DIR))

import study_lib  # noqa: E402
import server  # noqa: E402  — importable proof: a plain import binds no socket
import librarian_call as L  # noqa: E402  — the seam this fence now guards
from adapters import apple_notes  # noqa: E402  — the 26.65-04 marker seam

# ⚠⚠ THE PATH STUB IS GONE (26.93-07), AND SO IS THE PROGRAM IT NAMED.
# `FAKE_CLAUDE_DIR` / `FAKE_CLAUDE` stood here so a hermetic `claude` could be
# prepended to PATH and the availability probe re-resolved to it. PATH decides
# nothing about the librarian any more — who answers is resolved from her
# settings file and the presence of a key — so the constants are deleted rather
# than left pointing at a seam that no longer selects anything.
#
# ⚠ THE HERMETIC GUARANTEE IS NOT WEAKENED BY THAT; IT IS TIGHTENED, and it now
# lives in ONE imported helper instead of in five hand-rolled setUp blocks.
# `fake_claude_env` swaps HOME to a fresh temp root (so `key_present` answers
# False for both companies and every tier resolves to her own machine — the
# owner's real key is unreachable), pops the two key names and the three fill
# names, replaces `librarian_call._transport` with a recorder that opens
# nothing, and replaces `librarian_call._sleep`. It restores all four on exit.
#
# ⚠ IT IS IMPORTED, NEVER COPIED. Two copies of a hermetic guard drift, and the
# half that drifts is the half that quietly starts spending money.
#
# `no_cached_probe` is the named no-op standing where the per-process
# availability reset stood; its own docstring in the smoke suite says why
# it is one function rather than two dozen deleted lines.
from test_server_smoke import (  # noqa: E402
    REAL_ROOM_DIR, REAL_ROOM_DIR_EXISTED, fake_claude_env, no_cached_probe)

FENCE_BODY = "FENCE-SENTINEL"
FENCE_TITLE = "FENCE-TITLE"


# ---------------------------------------------------------------------------
# store builders — synthetic stores in temp dirs, the test_import convention
# ---------------------------------------------------------------------------

def make_item(lib, i, state="unseen", trigger=False, body="", title=None,
              type_="text", source="folder-drop", year=2021,
              folder="notes", tags=None):
    """One store item dict + its on-disk snapshot under <lib>/items/.

    Text items get `body` written as their .md snapshot; image items get a
    few non-text bytes (the fence must never read image bytes into a
    payload). Ids are 16-hex like the real store's content-hash prefixes."""
    lib = Path(lib)
    item_id = format(0x1000 + i, "016x")
    suffix = ".md" if type_ == "text" else ".png"
    library_path = f"items/{item_id}{suffix}"
    (lib / "items").mkdir(parents=True, exist_ok=True)
    if type_ == "text":
        (lib / library_path).write_text(body, encoding="utf-8")
    else:
        (lib / library_path).write_bytes(b"\x89PNG-not-text-bytes")
    return {
        "id": item_id,
        "content_hash": item_id * 4,
        "source": source,
        "origin_path": f"/src/{folder}/unit-{i}{suffix}",
        "library_path": library_path,
        "type": type_,
        "title": title if title is not None else f"note-{i}{suffix}",
        "created_ms": 1700000000000 + i,
        "saved_ms": 1700000000000 + i,
        "imported_ms": 1700000000000 + i,
        "last_opened_ms": None,
        "state": state,
        "resting_until_ms": None,
        "tags": list(tags or []),
        "trigger": trigger,
        "year": year,
        "folder": folder,
        "history": [],
    }


def make_store(lib, items, filters=None):
    """A schema-v2 store dict over `items`, with meta.filters set. Built in
    memory over the temp lib — never persisted (the builder reads only the
    dict plus the items/ snapshots)."""
    store = study_lib.new_store(lib)
    store["meta"]["filters"] = list(filters or [])
    for it in items:
        store["items"][it["id"]] = it
    return store


def payload_blob(store, scope, consent):
    """The serialized payload — the byte view every absence assertion
    scans, exactly what a caller hands `call_librarian` as its payload
    text (26.93-07: the same bytes, one seam later)."""
    payload = study_lib.build_librarian_payload(store, scope,
                                                consent=consent)
    return payload, json.dumps(payload, ensure_ascii=False)


ALL_COMBOS = tuple((scope, consent)
                   for scope in ("presort", "note", "reflection")
                   for consent in (False, True))

# A valid synthetic essay for the 26.7-01 output-contract tests — invented
# text, never real vault material. 26.87-10 note: it still ends in the old
# 'Use:' label, and it STAYS VALID — the label was always a prompt nudge with
# no gate behind it, so an essay carrying one is not rejected by anything.
# What changed is that the prompt no longer mandates the shape.
#
# ⚠⚠ 26.995-03 FIXTURE REPAIR (D-18 / D-03), AND IT IS NOT A CONVENIENCE.
# Every third-person reference here now speaks to her. This fixture was
# written entirely ABOUT her — "she kept returning", "in her own time", "held
# open for herself", "the way her hands" — and said "you" ZERO times in 127
# words. That is not a near-miss on a new gate; it is the exact failure mode
# D-18 exists to catch, in #18's own words: *the collapse this map feared is
# what happens when the writing turns to talking ABOUT her*. So the fixture
# was not adjusted to clear a threshold — it was an ILLEGAL reflection under
# the guarantee this phase ships, standing in for a legal one in nineteen
# cases, and the repair is to make it what it always claimed to be.
# ⛔ Nothing else moved: not one assertion, not one case, not the length, not
# the 'Use:' ending (26.995-03 task 4 owned that separately). The word count is
# unchanged at 127; only the person is.
#
# ⚠⚠ 26.995-25 SECOND REPAIR, AND IT IS HER RULING RATHER THAN AN AGENT'S
# TIDY-UP. This fixture ended "Use: cast on the small swatch tonight and let
# it be enough." — a chore. On 2026-08-21 that exact sentence was quoted to
# her VERBATIM, and she was told plainly that under the wide reading of #17
# row 7 the essay this project holds up as its own model of good writing
# would be thrown away and written again. She chose the wide reading anyway,
# verbatim: "Any ending that points you toward doing something is out, gentle
# or not. The knitting essay really should be written again, and the example
# gets replaced." (26.995-COPY.md § C-4 continuation beat 2.)
#
# ⛔ ONLY THE CLOSING SENTENCE MOVED. Not the person, not the length, not one
# quoted line of hers, not one assertion and not one case. The word count is
# STILL 127 — the old ending was twelve words and the new one is twelve — and
# the essay still ends on one of the three legal shapes the shipped prompt
# names: a line of hers, with nothing after it. Address words went 5 -> 6,
# which moves the density UP; it passed the floor before and passes it now.
# ⛔ It was NOT edited to fit a rule an agent read into her ruling; it was
# edited because she ruled it should be, in the option she selected.
GOOD_ESSAY = (
    'you kept returning to the loom this week. "the selvedge finally '
    'held" sits beside "i frogged the whole sleeve and started over" — '
    "the same steady hand in both lines, patience arriving as a practice "
    "rather than a mood. the saved pattern pages and the two comments on "
    "the sweater notes carry one thread: making something slowly, on "
    "purpose, in your own time. the older pages you blessed about reading "
    "in the evening rhyme with it — a quiet corner held open for "
    "yourself, stitch by stitch, page by page. the thread is not speed "
    "and not finish lines; it is the returning itself, the way your hands "
    "keep choosing the same small table by the window.\n\n"
    "\"i frogged the whole sleeve and started over,\" you wrote, and "
    "stopped.")


# 26.995-01 (D-02(c), D-35, D-36): THE SHORT SHAPE, and it is a fixture with a
# measured size rather than "something short" — 380 characters, three
# sentences, one noticing and then it stops. It is exactly the reflection the
# deleted 400-character floor rejected and regenerated, which is why D-02(c)
# had been unbuildable since the day it was ruled. Its length is asserted BY
# VALUE at every site that uses it, so a later edit to the prose cannot quietly
# make the case about a different size than the one it claims to be about.
SHORT_REFLECTION = (
    "the milk keeps turning up. you left it out again on tuesday and again "
    "on friday, and both times it was still sitting there on the counter "
    "when you came back down in the morning to put the kettle on and stand "
    "at the window for a while. it is still there this evening, and you "
    "have stopped moving it back again, which is its own quieter kind of "
    "answer to the week that you have had.")


# ---------------------------------------------------------------------------
# 1-4 + 7: the deterministic behaviors
# ---------------------------------------------------------------------------

class FenceBehaviorTest(unittest.TestCase):

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def fenced_fixture(self):
        """One store holding every fenced class (sentinel bodies + titles)
        plus three allowed items. Returns (store, fenced_items)."""
        def fenced(i, **kw):
            item_id = format(0x1000 + i, "016x")
            return make_item(self.lib, i,
                             body=f"{FENCE_BODY}-{item_id} 私密的手记",
                             title=f"{FENCE_TITLE}-{item_id}.md", **kw)

        f1 = fenced(1, state="never_show")
        f2 = fenced(2, state="retired")
        f3 = fenced(3, state="blessed", trigger=True)
        f4 = fenced(4, state="blessed", tags=["heavy-box"])
        f5 = fenced(5, state="unseen", year=2019)
        a6 = make_item(self.lib, 6, state="blessed",
                       body="SAFE-BLESSED-BODY 安全的手记")
        a7 = make_item(self.lib, 7, state="unseen",
                       body="SAFE-UNSEEN-BODY 未判定")
        a8 = make_item(self.lib, 8, state="resting",
                       body="SAFE-RESTING-BODY 休眠中")
        store = make_store(self.lib, [f1, f2, f3, f4, f5, a6, a7, a8],
                           filters=[{"facet": "tag", "value": "heavy-box"},
                                    {"facet": "year", "value": 2019}])
        return store, [f1, f2, f3, f4, f5]

    # -- 1. total exclusion under every scope × consent ---------------------

    def test_total_exclusion_every_scope_and_consent(self):
        store, fenced_items = self.fenced_fixture()
        for scope, consent in ALL_COMBOS:
            _, blob = payload_blob(store, scope, consent)
            for it in fenced_items:
                self.assertNotIn(f"{FENCE_BODY}-{it['id']}", blob,
                                 f"fenced body leaked at {scope}/{consent}")
                self.assertNotIn(f"{FENCE_TITLE}-{it['id']}", blob,
                                 f"fenced title leaked at {scope}/{consent}")
                self.assertNotIn(it["id"], blob,
                                 f"fenced id leaked at {scope}/{consent}")

    # -- 2. consent widens unjudged only -------------------------------------

    def test_consent_widens_unjudged_bodies_only(self):
        store, _ = self.fenced_fixture()
        # consent=False: unseen body absent, its metadata row present
        payload, blob = payload_blob(store, "presort", False)
        self.assertNotIn("SAFE-UNSEEN-BODY", blob)
        unseen_id = format(0x1000 + 7, "016x")
        self.assertIn(unseen_id, blob,
                      "the surviving unseen item rides as metadata")
        # consent=True: unseen body present now — the per-run full run
        payload, blob = payload_blob(store, "presort", True)
        self.assertIn("SAFE-UNSEEN-BODY", blob)
        self.assertNotIn(FENCE_BODY, blob,
                         "the fenced classes never widen (SRM-13)")
        # resting stays metadata-only under BOTH consents
        for consent in (False, True):
            _, blob = payload_blob(store, "presort", consent)
            self.assertNotIn("SAFE-RESTING-BODY", blob,
                             "resting is metadata-only, consent or not")
            self.assertIn(format(0x1000 + 8, "016x"), blob,
                          "the resting item's metadata row survives")

    # -- 3. blessed present; note scope = blessed bodies + nothing ----------

    def test_blessed_present_and_note_scope_is_blessed_only(self):
        store, _ = self.fenced_fixture()
        payload, blob = payload_blob(store, "presort", False)
        self.assertIn("SAFE-BLESSED-BODY", blob,
                      "blessed bodies ride the default presort payload")
        for consent in (False, True):
            payload, blob = payload_blob(store, "note", consent)
            self.assertIn("SAFE-BLESSED-BODY", blob)
            self.assertEqual(payload["meta_rows"], [],
                             "a note payload holds NO metadata rows")
            blessed_id = format(0x1000 + 6, "016x")
            self.assertEqual([b["id"] for b in payload["bodies"]],
                             [blessed_id],
                             "note scope = blessed bodies and nothing else")
            for other in (7, 8):
                self.assertNotIn(format(0x1000 + other, "016x"), blob,
                                 "unseen/resting are absent from a note "
                                 "payload entirely")

    # -- 4. the 8 KB body cap is accounted, never silent ---------------------

    def test_body_cap_truncates_with_visible_count(self):
        big = make_item(self.lib, 1, state="blessed", body="a" * 10000)
        small = make_item(self.lib, 2, state="blessed", body="small body")
        store = make_store(self.lib, [big, small])
        payload = study_lib.build_librarian_payload(store, "presort")
        by_id = {b["id"]: b for b in payload["bodies"]}
        self.assertEqual(by_id[big["id"]]["text"], "a" * 8192,
                         "truncated to the first LIBRARIAN_BODY_CAP bytes")
        self.assertEqual(by_id[small["id"]]["text"], "small body",
                         "an under-cap body arrives whole")
        self.assertEqual(payload["counts"]["bodies-capped"], 1,
                         "the cut is counted out loud — never silent")

    def test_body_cap_constant_is_8k(self):
        self.assertEqual(study_lib.LIBRARIAN_BODY_CAP, 8192)

    # -- 7. purity: reads only, never writes, never mutates ------------------

    def test_builder_is_pure(self):
        store, _ = self.fenced_fixture()
        snapshot = copy.deepcopy(store)
        files_before = sorted(str(p) for p in self.lib.rglob("*"))
        for scope, consent in ALL_COMBOS:
            study_lib.build_librarian_payload(store, scope, consent=consent)
        self.assertEqual(store, snapshot,
                         "the builder never mutates the store dict")
        self.assertEqual(sorted(str(p) for p in self.lib.rglob("*")),
                         files_before,
                         "the builder never writes anything")
        self.assertFalse((self.lib / "items.json").exists(),
                         "no store file is ever created by a build")

    def test_unknown_scope_refused_fail_closed(self):
        store, _ = self.fenced_fixture()
        with self.assertRaises(ValueError):
            study_lib.build_librarian_payload(store, "everything")

    def test_image_bodies_never_read(self):
        # a blessed IMAGE item rides as metadata only — picture bytes have
        # no place in a prompt, so the snapshot is never decoded into text
        pic = make_item(self.lib, 1, state="blessed", type_="image")
        store = make_store(self.lib, [pic])
        payload, blob = payload_blob(store, "presort", True)
        self.assertEqual(payload["bodies"], [])
        self.assertIn(pic["id"], blob, "the image item's metadata survives")

    def test_meta_rows_carry_exactly_the_six_fields(self):
        it = make_item(self.lib, 1, state="unseen", body="x",
                       tags=["screenshots"])
        store = make_store(self.lib, [it])
        payload = study_lib.build_librarian_payload(store, "presort")
        (row,) = payload["meta_rows"]
        self.assertEqual(set(row),
                         {"id", "title", "source", "type", "created_ms",
                          "tags"},
                         "metadata rows carry exactly (id, title, source, "
                         "type, created_ms, tags) — origin_path and the "
                         "rest never ride")


# ---------------------------------------------------------------------------
# 5. randomized property — the test_surface_property analog in python
# ---------------------------------------------------------------------------

# The hand-rolled fenced predicate: an INDEPENDENT mirror of core.js
# itemExcluded (core.js:168-179) + matchesFilter (core.js:149-161).
# Deliberately not a call into study_lib — a bug in the fence cannot
# hide itself here.

def _mirror_matches(item, f):
    if f["facet"] == "source":
        return item["source"] == f["value"]
    if f["facet"] == "type":
        return item["type"] == f["value"]
    if f["facet"] == "year":
        return item["year"] == f["value"]
    if f["facet"] == "folder":
        return item["folder"] == f["value"]
    if f["facet"] == "tag":
        return f["value"] in item["tags"]
    return False


def _mirror_fenced(item, filters):
    if item["state"] in ("never_show", "retired"):
        return True
    if item["trigger"] is True:
        return True
    return any(_mirror_matches(item, f) for f in filters)


class FenceRandomizedPropertyTest(unittest.TestCase):

    N_STORES = 50
    ITEMS_PER_STORE = 16

    STATES = ("unseen", "blessed", "never_show", "resting", "retired")
    SOURCES = ("folder-drop", "obsidian-vault", "ai-chat-export")
    FOLDERS = ("notes", "letters", "heavy-box", "相册")
    FILTER_POOL = (
        {"facet": "tag", "value": "screenshots"},
        {"facet": "year", "value": 2019},
        {"facet": "folder", "value": "heavy-box"},
        {"facet": "source", "value": "ai-chat-export"},
        {"facet": "type", "value": "image"},
    )

    def test_no_fenced_byte_ever(self):
        rng = random.Random(2601)
        with tempfile.TemporaryDirectory() as tmp:
            for n in range(self.N_STORES):
                lib = Path(tmp) / f"store-{n}"
                lib.mkdir()
                filters = rng.sample(self.FILTER_POOL,
                                     rng.randint(0, 2))
                items = []
                for i in range(self.ITEMS_PER_STORE):
                    spec = {
                        "state": rng.choice(self.STATES),
                        "trigger": rng.random() < 0.2,
                        "type_": "image" if rng.random() < 0.2 else "text",
                        "source": rng.choice(self.SOURCES),
                        "year": rng.randint(2018, 2024),
                        "folder": rng.choice(self.FOLDERS),
                        "tags": (["screenshots"]
                                 if rng.random() < 0.25 else []),
                    }
                    probe = dict(spec)
                    probe["type"] = probe.pop("type_")
                    is_fenced = _mirror_fenced(
                        {"state": probe["state"],
                         "trigger": probe["trigger"],
                         "type": probe["type"],
                         "source": probe["source"],
                         "year": probe["year"],
                         "folder": probe["folder"],
                         "tags": probe["tags"]}, filters)
                    item_id = format(0x1000 + i, "016x")
                    mark = (f"{FENCE_BODY}-{item_id}" if is_fenced
                            else f"SAFE-{item_id}")
                    body = f"记忆的盒子 {mark} 一页手记"
                    title = (f"{FENCE_TITLE}-{item_id}-截图.md" if is_fenced
                             else f"note-{i}.md")
                    items.append(make_item(lib, i, body=body, title=title,
                                           **spec))
                store = make_store(lib, items, filters=filters)
                for scope, consent in ALL_COMBOS:
                    _, blob = payload_blob(store, scope, consent)
                    for it in items:
                        fenced = _mirror_fenced(it, filters)
                        ctx = (f"store {n}, item {it['id']}, "
                               f"{scope}/{consent}")
                        if fenced:
                            self.assertNotIn(f"{FENCE_BODY}-{it['id']}",
                                             blob, f"body leak: {ctx}")
                            self.assertNotIn(f"{FENCE_TITLE}-{it['id']}",
                                             blob, f"title leak: {ctx}")
                            self.assertNotIn(it["id"], blob,
                                             f"id leak: {ctx}")
                        elif scope in ("presort", "reflection"):
                            # 26.7-01: with no marker handed in, the
                            # reflection pool shares presort's body/row
                            # semantics — the mirror extends unchanged
                            self.assertIn(it["id"], blob,
                                          f"allowed item vanished: {ctx}")
                            if it["type"] == "text" and \
                                    it["state"] == "blessed":
                                self.assertIn(f"SAFE-{it['id']}", blob,
                                              f"blessed body missing: "
                                              f"{ctx}")
                            if it["type"] == "text" and \
                                    it["state"] == "unseen":
                                self.assertEqual(
                                    f"SAFE-{it['id']}" in blob, consent,
                                    f"unseen body vs consent: {ctx}")
                        else:  # note scope
                            in_note = (it["type"] == "text" and
                                       it["state"] == "blessed")
                            self.assertEqual(it["id"] in blob, in_note,
                                             f"note scope roster: {ctx}")


# ---------------------------------------------------------------------------
# 6. core.js parity fixtures — hand-derived expected sets, documented
# ---------------------------------------------------------------------------

class FilterParityTest(unittest.TestCase):
    """study_lib._matches_active_filter must exclude exactly the items
    core.js itemExcluded would, facet by facet (core.js:149-161: one
    strict === compare per facet; tag via indexOf; unknown facets match
    nothing). Each row below documents the hand-derived expectation."""

    ITEMS = {
        # name: (source, type, year, folder, tags)
        "chat": ("ai-chat-export", "text", 2019, "letters", []),
        "shot": ("folder-drop", "image", 2021, "notes", ["screenshots"]),
        "note": ("obsidian-vault", "text", 2021, "heavy-box", []),
        "strv": ("folder-drop", "text", "2019", "notes", []),  # corrupt
        #        string-typed year: core.js `item.year === 2019` is false
        #        for "2019" — python must agree ("2019" == 2019 is False)
    }

    def item(self, name):
        source, type_, year, folder, tags = self.ITEMS[name]
        return {"id": name, "source": source, "type": type_, "year": year,
                "folder": folder, "tags": list(tags)}

    def matched_names(self, filters):
        return sorted(name for name in self.ITEMS
                      if study_lib._matches_active_filter(self.item(name),
                                                          filters))

    def test_source_facet(self):
        # expected: only "chat" carries source ai-chat-export
        self.assertEqual(
            self.matched_names([{"facet": "source",
                                 "value": "ai-chat-export"}]),
            ["chat"])

    def test_type_facet(self):
        # expected: only "shot" is an image
        self.assertEqual(
            self.matched_names([{"facet": "type", "value": "image"}]),
            ["shot"])

    def test_year_facet_strict_int(self):
        # expected: only "chat" has int year 2019; "strv" carries the
        # STRING "2019" and must NOT match (=== parity)
        self.assertEqual(
            self.matched_names([{"facet": "year", "value": 2019}]),
            ["chat"])

    def test_folder_facet(self):
        # expected: only "note" lives in heavy-box
        self.assertEqual(
            self.matched_names([{"facet": "folder",
                                 "value": "heavy-box"}]),
            ["note"])

    def test_tag_facet(self):
        # expected: only "shot" carries the screenshots tag
        self.assertEqual(
            self.matched_names([{"facet": "tag",
                                 "value": "screenshots"}]),
            ["shot"])

    def test_union_semantics(self):
        # expected: source hits "chat", tag hits "shot" — union of both;
        # any ONE match excludes, exactly like one (core.js:174-178)
        self.assertEqual(
            self.matched_names([
                {"facet": "source", "value": "ai-chat-export"},
                {"facet": "tag", "value": "screenshots"}]),
            ["chat", "shot"])

    def test_unknown_facet_matches_nothing(self):
        # expected: core.js:159-160 — an unknown facet matches nothing
        # (the server refused it at the write; none can enter the store)
        self.assertEqual(
            self.matched_names([{"facet": "mood", "value": "x"}]),
            [])

    def test_empty_filters_match_nothing(self):
        self.assertEqual(self.matched_names([]), [])
        self.assertEqual(self.matched_names(None), [])


class ReviewHardeningTest(unittest.TestCase):
    """26-01 adversarial review (H1 + M3): the two data sources the fence
    must not trust — library_path (a store FIELD, not a path grant) and
    the state enum (unknown values default to fenced, never included)."""

    def test_h1_library_path_is_jailed_to_the_store_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            (lib / "items").mkdir(parents=True)
            outside = Path(tmp) / "outside-secret.txt"
            outside.write_text("OUTSIDE-SENTINEL: never in a payload")
            escapee_abs = make_item(lib, 1, state="blessed", body="x")
            escapee_abs["library_path"] = str(outside)
            escapee_rel = make_item(lib, 2, state="blessed", body="y")
            escapee_rel["library_path"] = "../outside-secret.txt"
            honest = make_item(lib, 3, state="blessed",
                               body="an honest body")
            store = make_store(lib, [escapee_abs, escapee_rel, honest])
            store["meta"]["library_root"] = str(lib)
            for scope, consent in ALL_COMBOS:
                payload, blob = payload_blob(store, scope, consent)
                self.assertNotIn("OUTSIDE-SENTINEL", blob,
                                 "an out-of-store library_path must "
                                 "never be read into a payload")
            payload, _ = payload_blob(store, "presort", False)
            self.assertGreaterEqual(
                payload["counts"]["bodies-unreadable"], 2,
                "the two jailed escapes are counted out loud")

    def test_m3_unknown_state_is_fenced_not_included(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            (lib / "items").mkdir(parents=True)
            weird = make_item(lib, 1, title="FENCE-TITLE-weird")
            weird["state"] = "someday-maybe"
            malformed = make_item(lib, 2, title="FENCE-TITLE-malformed")
            malformed["state"] = None
            fine = make_item(lib, 3, state="unseen",
                             title="a plain note")
            store = make_store(lib, [weird, malformed, fine])
            for scope, consent in ALL_COMBOS:
                _, blob = payload_blob(store, scope, consent)
                self.assertNotIn("FENCE-TITLE-weird", blob)
                self.assertNotIn(weird["id"], blob)
                self.assertNotIn("FENCE-TITLE-malformed", blob)
                self.assertNotIn(malformed["id"], blob)


class NoteScopeSentinelTest(unittest.TestCase):
    """26-03 additive extension (SRM-12 criterion 4 is absolute): the
    note scope against sentinel-bodied UNSEEN items — consent means
    nothing to a note (the scope ignores it by design), so unseen
    sentinels must be absent under BOTH consent values while blessed
    bodies ride; and the 26-03 recent marker is a boolean flag only,
    present only when the caller hands a clock value."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def test_note_scope_unseen_sentinels_absent_even_with_consent(self):
        blessed = make_item(self.lib, 1, state="blessed",
                            body="SAFE-BLESSED-BODY 安全的手记")
        unseen = make_item(self.lib, 2, state="unseen",
                           body="UNSEEN-SENTINEL-BODY 未判定的手记")
        fenced = make_item(self.lib, 3, state="never_show",
                           body=f"{FENCE_BODY}-note-scope 私密的手记",
                           title=f"{FENCE_TITLE}-note-scope.md")
        store = make_store(self.lib, [blessed, unseen, fenced])
        for consent in (False, True):
            payload, blob = payload_blob(store, "note", consent)
            self.assertIn("SAFE-BLESSED-BODY", blob,
                          "the blessed body rides the note payload")
            self.assertNotIn("UNSEEN-SENTINEL-BODY", blob,
                             "an unseen body never rides a note — "
                             "consent widens presort only, never note "
                             f"(consent={consent})")
            self.assertNotIn(unseen["id"], blob,
                             "the unseen item is absent from a note "
                             "payload entirely — not even metadata")
            self.assertNotIn(FENCE_BODY, blob)
            self.assertNotIn(FENCE_TITLE, blob)
            self.assertNotIn(fenced["id"], blob)
            self.assertEqual(payload["meta_rows"], [],
                             "a note payload holds NO metadata rows")

    def test_note_recent_marker_is_a_flag_only(self):
        # 26.4-01 (D-08): "now" is SINCE LAST VISIT — the passed now_ms is the
        # PREVIOUS visit's threshold, and recent is a save STRICTLY AFTER it.
        last_visit = 1700000000000 + 100 * 24 * 60 * 60 * 1000
        fresh = make_item(self.lib, 1, state="blessed",
                          body="a fresh page")
        fresh["created_ms"] = last_visit + 24 * 60 * 60 * 1000   # after visit
        fresh["saved_ms"] = fresh["created_ms"]
        old = make_item(self.lib, 2, state="blessed",
                        body="an old page")
        old["created_ms"] = last_visit - 30 * 24 * 60 * 60 * 1000  # before
        old["saved_ms"] = old["created_ms"]
        store = make_store(self.lib, [fresh, old])
        payload = study_lib.build_librarian_payload(store, "note",
                                                    now_ms=last_visit)
        by_id = {b["id"]: b for b in payload["bodies"]}
        self.assertIs(by_id[fresh["id"]]["recent"], True,
                      "a save after the last visit flags recent")
        self.assertIs(by_id[old["id"]]["recent"], False,
                      "a save before the last visit is not-recent — a flag, "
                      "never a date echoed back")
        for body in payload["bodies"]:
            self.assertEqual(set(body),
                             {"id", "title", "text", "recent"},
                             "the marker adds ONE boolean key, nothing "
                             "else")
        # without a threshold value the marker is absent — the builder
        # itself stays clock-free (D-02's spirit at the library layer)
        plain = study_lib.build_librarian_payload(store, "note")
        for body in plain["bodies"]:
            self.assertNotIn("recent", body,
                             "no threshold handed in, no marker")


class TitleShadowTest(unittest.TestCase):
    """26-05 UAT (P0, found on the REAL store): a re-imported edited copy
    of a judged note survives the item-level fence with the SAME title —
    and that title string reaching the cloud IS the fenced title reaching
    the cloud. The builder holds shadows back entirely and counts them."""

    def test_surviving_twin_of_a_fenced_title_is_held_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "library"
            lib.mkdir()
            fenced = make_item(lib, 1, state="retired",
                               title=f"{FENCE_TITLE}-twin.md",
                               body="the judged original")
            shadow = make_item(lib, 2, state="unseen",
                               title=f"{FENCE_TITLE}-twin.md",
                               body="the edited re-import")
            plain = make_item(lib, 3, state="unseen",
                              title="an unrelated note.md")
            store = make_store(lib, [fenced, shadow, plain])
            for scope, consent in ALL_COMBOS:
                payload, blob = payload_blob(store, scope, consent)
                self.assertNotIn(f"{FENCE_TITLE}-twin", blob,
                                 "the shared title must never ride any "
                                 "payload, on any item")
                self.assertNotIn(shadow["id"], blob,
                                 "the shadow item is held back entirely")
                self.assertEqual(payload["counts"]["title-shadowed"], 1,
                                 "held back out loud, never silently")
            payload, blob = payload_blob(store, "presort", False)
            self.assertIn(plain["id"], blob,
                          "unrelated items still flow")


class BornFlagRosterFenceTest(unittest.TestCase):
    """26.4-01 (SRM-13, D-05): an item BORN trigger-flagged by the sensitive-
    folder roster at whole-vault import must be absent from every librarian
    payload ENTIRELY — no id, no title, no body — even when the user later
    blesses it. This is the born-flag → shipped-fence proof end to end: the
    roster works THROUGH _librarian_fenced with zero new fence code."""

    def _make_vault(self, root, files):
        (root / ".obsidian").mkdir(parents=True)
        (root / ".obsidian" / "app.json").write_text("{}", encoding="utf-8")
        for rel, data in files.items():
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        return root

    def test_born_flagged_journal_never_reaches_any_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = self._make_vault(Path(tmp) / "vault", {
                "Journal/diary.md":
                    "SECRET-JOURNAL-BODY 最私密的手记\n".encode("utf-8"),
                "notes/soup.md":
                    "OPEN-NOTES-BODY 一碗汤\n".encode("utf-8"),
            })
            lib = Path(tmp) / "library"
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)

            journal = [it for it in store["items"].values()
                       if it["title"] == "diary.md"][0]
            soup = [it for it in store["items"].values()
                    if it["title"] == "soup.md"][0]
            self.assertTrue(journal["trigger"],
                            "the journal item is born trigger-flagged")
            # the user later BLESSES both — the fence must still exclude the
            # born-flagged journal (trigger overrides a blessed state)
            journal["state"] = "blessed"
            soup["state"] = "blessed"

            for scope, consent in ALL_COMBOS:
                payload = study_lib.build_librarian_payload(
                    store, scope, consent=consent, store_dir=str(lib))
                blob = json.dumps(payload, ensure_ascii=False)
                self.assertNotIn("SECRET-JOURNAL-BODY", blob,
                                 f"born-flagged body leaked at {scope}")
                self.assertNotIn("diary.md", blob,
                                 f"born-flagged title leaked at {scope}")
                self.assertNotIn(journal["id"], blob,
                                 f"born-flagged id leaked at {scope}")
            # the non-fenced blessed item DOES ride the default presort/ note
            presort = study_lib.build_librarian_payload(
                store, "presort", store_dir=str(lib))
            self.assertIn("OPEN-NOTES-BODY",
                          json.dumps(presort, ensure_ascii=False),
                          "the open blessed item still flows")


class JournalFencedJournalAnalysisSurfacesTest(unittest.TestCase):
    """26.4-06 (SRM-13, D-29 — the redefinition's load-bearing claim): raw
    Journal/ stays fenced from EVERY librarian payload while a Claude's
    observation/Journal analysis/ reflection is NOT fenced by the roster and
    CAN surface. This is the 'reflections ARE the insights, and the fence
    still holds' proof end to end, driven through the real whole-vault import
    (the born-flag path) — the exact opposition the redefinition rests on.

    Additive: it weakens no existing fence assertion; it only proves the two
    sibling folders are treated oppositely."""

    def _make_vault(self, root, files):
        (root / ".obsidian").mkdir(parents=True)
        (root / ".obsidian" / "app.json").write_text("{}", encoding="utf-8")
        for rel, data in files.items():
            p = root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        return root

    def test_journal_fenced_while_journal_analysis_surfaces(self):
        reflection = (
            "---\n"
            "title: \"The Boundary Has a Name Now\"\n"
            "type: note\n"
            "source: personal\n"
            "reflects:\n"
            "  - \"Journal/Journal 26 July 15.md\"\n"
            "---\n"
            "\n"
            "OPEN-REFLECTION-BODY 关于边界的手记\n"
        )
        with tempfile.TemporaryDirectory() as tmp:
            vault = self._make_vault(Path(tmp) / "vault", {
                "Journal/diary.md":
                    "SECRET-JOURNAL-BODY 最私密的手记\n".encode("utf-8"),
                "Claude's observation/Journal analysis/reflection.md":
                    reflection.encode("utf-8"),
            })
            lib = Path(tmp) / "library"
            study_lib.import_folder(vault, lib)
            store = study_lib.load_store(lib)

            journal = [it for it in store["items"].values()
                       if it["title"] == "diary.md"][0]
            refl = [it for it in store["items"].values()
                    if it["title"] == "reflection.md"][0]

            # the raw journal is born trigger-flagged (roster fences Journal/);
            # the Journal analysis/ reflection is NOT on the roster and IS a
            # reflection (reflects stamped from its own frontmatter at import)
            self.assertTrue(journal["trigger"],
                            "the raw Journal/ item is born fenced")
            self.assertFalse(refl["trigger"],
                             "Claude's observation/Journal analysis/ is NOT "
                             "on the fenced roster")
            self.assertEqual(refl["folder"], "Journal analysis")
            self.assertTrue(study_lib.is_reflection(refl),
                            "the reflection satisfies is_reflection")

            # the user blesses BOTH — the fence must STILL exclude the journal
            # ENTIRELY (trigger overrides a blessed state), on every payload
            journal["state"] = "blessed"
            refl["state"] = "blessed"
            for scope, consent in ALL_COMBOS:
                payload = study_lib.build_librarian_payload(
                    store, scope, consent=consent, store_dir=str(lib))
                blob = json.dumps(payload, ensure_ascii=False)
                self.assertNotIn("SECRET-JOURNAL-BODY", blob,
                                 f"raw journal body leaked at {scope}")
                self.assertNotIn("diary.md", blob,
                                 f"raw journal title leaked at {scope}")
                self.assertNotIn(journal["id"], blob,
                                 f"raw journal id leaked at {scope}")

            # ...while the Journal analysis/ reflection surfaces: its blessed
            # body rides the default presort payload (D-29 — surfaceable)
            presort = json.dumps(study_lib.build_librarian_payload(
                store, "presort", store_dir=str(lib)), ensure_ascii=False)
            self.assertIn("OPEN-REFLECTION-BODY", presort,
                          "the Journal analysis/ reflection is NOT fenced by "
                          "the roster — it can surface (D-29)")
            self.assertIn(refl["id"], presort,
                          "the reflection's id rides the payload")


class SinceLastVisitNowTest(unittest.TestCase):
    """26.4-01 (D-08, Pitfall 1): the note-scope `recent` flag is SINCE LAST
    VISIT, not a fixed ~30-day window. The caller passes now_ms = the PREVIOUS
    visit's last_visit_ms threshold: None (first visit) makes every non-fenced
    blessed item recent; otherwise recent iff the newest save stamp is
    STRICTLY GREATER than the threshold. last_visit_ms never appears in any
    returned field (silent machinery, law 3)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def _store_with_before_and_after(self, last_visit):
        before = make_item(self.lib, 1, state="blessed", body="an older page")
        before["created_ms"] = last_visit - 5 * 24 * 60 * 60 * 1000
        before["saved_ms"] = before["created_ms"]
        after = make_item(self.lib, 2, state="blessed", body="a new page")
        after["created_ms"] = last_visit + 5 * 24 * 60 * 60 * 1000
        after["saved_ms"] = after["created_ms"]
        return make_store(self.lib, [before, after]), before, after

    def test_before_last_visit_not_recent_after_is_recent(self):
        last_visit = 1700000000000
        store, before, after = self._store_with_before_and_after(last_visit)
        payload = study_lib.build_librarian_payload(
            store, "note", now_ms=last_visit)
        by_id = {b["id"]: b for b in payload["bodies"]}
        self.assertIs(by_id[before["id"]]["recent"], False,
                      "a save BEFORE the last visit is not recent")
        self.assertIs(by_id[after["id"]]["recent"], True,
                      "a save AFTER the last visit is recent (strictly >)")

    def test_first_visit_none_makes_everything_recent(self):
        last_visit = 1700000000000
        store, before, after = self._store_with_before_and_after(last_visit)
        # first visit: the threshold is None → the whole archive is "now"
        payload = study_lib.build_librarian_payload(
            store, "note", now_ms=None)
        for body in payload["bodies"]:
            self.assertIs(body["recent"], True,
                          "on the first visit every blessed item is recent")

    def test_last_visit_ms_never_appears_in_the_payload(self):
        last_visit = 1782172800000
        store, _, _ = self._store_with_before_and_after(last_visit)
        payload = study_lib.build_librarian_payload(
            store, "note", now_ms=last_visit)
        blob = json.dumps(payload, ensure_ascii=False)
        self.assertNotIn(str(last_visit), blob,
                         "the threshold is silent machinery — never echoed "
                         "back into any payload field (law 3)")
        # each body carries the ONE boolean marker and nothing date-shaped
        for body in payload["bodies"]:
            self.assertEqual(set(body), {"id", "title", "text", "recent"})

    def test_no_threshold_handed_in_means_no_marker(self):
        # the builder stays clock-free: with NO now_ms argument the marker is
        # absent entirely (distinct from a first-visit None, which marks all
        # recent) — the sentinel keeps the two apart.
        blessed = make_item(self.lib, 1, state="blessed", body="a page")
        store = make_store(self.lib, [blessed])
        payload = study_lib.build_librarian_payload(store, "note")
        for body in payload["bodies"]:
            self.assertNotIn("recent", body,
                             "no threshold handed in, no marker")


# ---------------------------------------------------------------------------
# 26.4-02 Task 1: the deterministic insight selectors (a)-(c), D-15/16/17/19
# ---------------------------------------------------------------------------

class InsightSelectorTest(unittest.TestCase):
    """The three deterministic insights are pure, fence-respecting store
    reads whose numbers are identical with the librarian on or off, and
    seasons reads only the item's OWN save dates — never a visit, absence,
    or wall clock (law 3, SC5)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def _fenced_and_allowed(self):
        """Every fenced class (never_show / retired / trigger / filter-tag /
        filter-year), all filed under 'secret', plus three allowed items in
        real themes. Returns (store, fenced_items)."""
        f1 = make_item(self.lib, 1, state="never_show", folder="secret",
                       tags=["x"])
        f2 = make_item(self.lib, 2, state="retired", folder="secret",
                       tags=["x"])
        f3 = make_item(self.lib, 3, state="blessed", trigger=True,
                       folder="secret", tags=["x"])
        f4 = make_item(self.lib, 4, state="blessed", folder="secret",
                       tags=["heavy-box"])
        f5 = make_item(self.lib, 5, state="blessed", folder="secret",
                       year=2019, tags=["x"])
        a6 = make_item(self.lib, 6, state="blessed", folder="knitting",
                       tags=["scarf"])
        a7 = make_item(self.lib, 7, state="unseen", folder="recipes",
                       tags=["chinese"])
        a8 = make_item(self.lib, 8, state="resting", folder="knitting",
                       tags=["scarf"])
        store = make_store(
            self.lib, [f1, f2, f3, f4, f5, a6, a7, a8],
            filters=[{"facet": "tag", "value": "heavy-box"},
                     {"facet": "year", "value": 2019}])
        return store, [f1, f2, f3, f4, f5]

    def test_fenced_items_absent_from_every_count(self):
        store, _ = self._fenced_and_allowed()
        # only the three allowed items (a6, a7, a8) ever count
        self.assertEqual(study_lib.insight_never_opened(store), 3,
                         "the five fenced items never count as unopened")
        themes = study_lib.insight_themes(store)
        for absent in ("secret", "heavy-box", "x"):
            self.assertNotIn(absent, themes,
                             f"a fenced-only theme leaked: {absent}")
        self.assertEqual(themes.get("knitting"), 2, "a6 + a8")
        self.assertEqual(themes.get("scarf"), 2)
        self.assertEqual(themes.get("recipes"), 1)
        self.assertEqual(themes.get("chinese"), 1)
        seasons = study_lib.insight_seasons(store)
        self.assertNotIn("secret", seasons)
        self.assertNotIn("heavy-box", seasons)
        self.assertIn("knitting", seasons)

    def test_never_opened_counts_only_unopened_nonfenced(self):
        a1 = make_item(self.lib, 1, state="blessed")            # unopened
        a2 = make_item(self.lib, 2, state="blessed")
        a2["last_opened_ms"] = 1700000000000                    # opened
        f3 = make_item(self.lib, 3, state="never_show")         # fenced
        store = make_store(self.lib, [a1, a2, f3])
        self.assertEqual(study_lib.insight_never_opened(store), 1,
                         "only the unopened, non-fenced item counts")

    def test_seasons_read_only_item_save_dates(self):
        jan = int(datetime(2023, 1, 15).timestamp() * 1000)
        jul = int(datetime(2023, 7, 15).timestamp() * 1000)
        a1 = make_item(self.lib, 1, state="blessed", folder="reading",
                       tags=["books"])
        a1["created_ms"] = jan
        a1["saved_ms"] = jan
        a2 = make_item(self.lib, 2, state="blessed", folder="reading",
                       tags=["books"])
        a2["created_ms"] = jul
        a2["saved_ms"] = jul
        store = make_store(self.lib, [a1, a2])
        seasons = study_lib.insight_seasons(store)
        self.assertEqual(seasons["reading"],
                         {"2023 winter": 1, "2023 summer": 1},
                         "seasons bucket by the item's own save month")
        self.assertEqual(seasons["books"],
                         {"2023 winter": 1, "2023 summer": 1})
        # a visit clock changes NOTHING — seasons never read a visit stamp
        # or the current time (law 3, D-17).
        store["meta"]["last_visit_ms"] = int(time.time() * 1000)
        self.assertEqual(study_lib.insight_seasons(store), seasons,
                         "a visit stamp must not move a single season count")

    def test_numbers_identical_with_librarian_on_or_off(self):
        a1 = make_item(self.lib, 1, state="blessed", folder="knitting",
                       tags=["scarf"])
        a2 = make_item(self.lib, 2, state="unseen", folder="recipes",
                       tags=["chinese"])
        store = make_store(self.lib, [a1, a2])
        before = (study_lib.insight_never_opened(store),
                  study_lib.insight_themes(store),
                  study_lib.insight_seasons(store))
        # "the librarian ran": drop a suggestions notebook, an insights
        # proposal stack, and a books store beside the library — none of
        # which the deterministic selectors ever read (SC5)
        libdir = self.lib / "librarian"
        libdir.mkdir(parents=True, exist_ok=True)
        (libdir / "suggestions.json").write_text(json.dumps(
            {"runs": [{"started_ms": 1}],
             "verdicts": {a1["id"]: {"shelf": "joyful"}}}),
            encoding="utf-8")
        (libdir / "insights.json").write_text(json.dumps(
            {"proposals": [{"id": "p", "title": "t",
                            "connected_ids": [a1["id"]], "why": "w"}]}),
            encoding="utf-8")
        (libdir / "books.json").write_text(json.dumps(
            {"books": [{"id": "p", "title": "t",
                        "connected_ids": [a1["id"]], "why": "w",
                        "allowed_ts": 1}]}), encoding="utf-8")
        after = (study_lib.insight_never_opened(store),
                 study_lib.insight_themes(store),
                 study_lib.insight_seasons(store))
        self.assertEqual(before, after,
                         "the deterministic insights read the store only — "
                         "identical whether or not the librarian ran")


# ---------------------------------------------------------------------------
# 26.4-02 Task 3: the connection post-check, driven end-to-end through the
# recording seam (T-26.4-05/06 + the consent gate)
# ---------------------------------------------------------------------------

class ConnectionPostCheckTest(unittest.TestCase):
    """server._generate_librarian_connections runs the fourth agent call
    through the hermetic stub and post-checks every connection BEFORE any
    byte is saved: a hallucinated id, a fenced-title substring, and the
    no-push vocabulary each drop the whole connection + count it; a clean
    connection becomes a PROPOSAL in insights.json; generation NEVER writes
    books.json (the consent gate)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()
        # 26.93-07: the hand-rolled PATH swap and the probe reset are replaced
        # by the ONE imported guard. It is entered here rather than per test
        # because `_generate_librarian_connections` resolves nothing itself —
        # the routing handed to it below must be resolved under the swapped
        # home too, or a run on the owner's machine would find her real key.
        self.log = Path(self._tmp.name) / "fake.log"
        self._env = fake_claude_env(self.log)
        self._env.__enter__()
        self.addCleanup(self._env.__exit__, None, None, None)
        no_cached_probe()

    def _routing(self):
        """Who fills each tier, resolved exactly as the handler resolves it —
        under the swapped home, so `connections` (a cheap-cloud row) finds no
        key anywhere and falls to her own machine, where the recorder answers.
        26.93-06 (D-04/D-10): the generator never resolves this itself, so the
        caller must, and a test that skipped it would be driving a path
        production does not have."""
        return server.resolve_librarian_routing()

    def _payload_and_ids(self, items):
        store = make_store(self.lib, items)
        payload = study_lib.build_librarian_payload(
            store, "note", store_dir=self.lib, now_ms=None)
        return store, payload, [b["id"] for b in payload["bodies"]]

    def test_a_clean_connection_becomes_a_proposal(self):
        b1 = make_item(self.lib, 1, state="blessed", body="knitting notes")
        b2 = make_item(self.lib, 2, state="blessed", body="a scarf plan")
        store, payload, sent_ids = self._payload_and_ids([b1, b2])
        conn = [{"title": "the making thread", "connected_ids": sent_ids,
                 "why": "both are about making something by hand"}]
        os.environ["FAKE_CLAUDE_CONNECTIONS"] = json.dumps(conn)
        no_cached_probe()
        outcome = server._generate_librarian_connections(
            str(self.lib), payload, sent_ids, server._fenced_titles(store),
            self._routing())
        self.assertTrue(outcome["ok"])
        self.assertEqual(outcome["generated"], 1)
        proposals = server._load_insights(str(self.lib))["proposals"]
        self.assertEqual(len(proposals), 1)
        p = proposals[0]
        self.assertEqual(set(p), {"id", "title", "connected_ids", "why"})
        self.assertEqual(p["connected_ids"], sent_ids)
        self.assertFalse(server._books_path(str(self.lib)).exists(),
                         "generation never writes the book store (consent "
                         "gate)")

    def test_fenced_title_substring_is_dropped_and_counted(self):
        fid = format(0x1000 + 1, "016x")
        fenced = make_item(self.lib, 1, state="never_show",
                           title=f"FENCE-TITLE-{fid}.md", body="secret")
        b2 = make_item(self.lib, 2, state="blessed", body="a page")
        b3 = make_item(self.lib, 3, state="blessed", body="another page")
        store = make_store(self.lib, [fenced, b2, b3])
        payload = study_lib.build_librarian_payload(
            store, "note", store_dir=self.lib, now_ms=None)
        sent_ids = [b["id"] for b in payload["bodies"]]
        # the fenced title never rides the payload (the fence itself)
        self.assertNotIn(f"FENCE-TITLE-{fid}",
                         json.dumps(payload, ensure_ascii=False))
        # ...but the model names it anyway, over ALLOWED ids — the
        # belt-and-suspenders post-check catches the title-shadow leak
        conn = [{"title": "a warm thread", "connected_ids": sent_ids,
                 "why": f"this echoes FENCE-TITLE-{fid} from before"}]
        os.environ["FAKE_CLAUDE_CONNECTIONS"] = json.dumps(conn)
        no_cached_probe()
        outcome = server._generate_librarian_connections(
            str(self.lib), payload, sent_ids, server._fenced_titles(store),
            self._routing())
        self.assertTrue(outcome["ok"])
        self.assertEqual(outcome["generated"], 0,
                         "a connection naming a fenced title is dropped")
        self.assertEqual(outcome["dropped_fenced_title"], 1)
        self.assertEqual(server._load_insights(str(self.lib))["proposals"],
                         [], "nothing reached the proposal stack")
        self.assertFalse(server._books_path(str(self.lib)).exists())

    def test_connected_id_outside_the_sent_batch_is_dropped(self):
        b1 = make_item(self.lib, 1, state="blessed", body="a page")
        store = make_store(self.lib, [b1])
        payload = study_lib.build_librarian_payload(
            store, "note", store_dir=self.lib, now_ms=None)
        sent_ids = [b["id"] for b in payload["bodies"]]
        conn = [{"title": "x", "connected_ids": sent_ids + ["deadbeefdead"],
                 "why": "a hallucinated id rides along"}]
        os.environ["FAKE_CLAUDE_CONNECTIONS"] = json.dumps(conn)
        no_cached_probe()
        outcome = server._generate_librarian_connections(
            str(self.lib), payload, sent_ids, server._fenced_titles(store),
            self._routing())
        self.assertEqual(outcome["generated"], 0)
        self.assertEqual(outcome["dropped_unknown_id"], 1,
                         "any id outside the sent batch drops the whole "
                         "connection")

    def test_no_push_vocabulary_is_dropped_and_counted(self):
        b1 = make_item(self.lib, 1, state="blessed", body="a page")
        b2 = make_item(self.lib, 2, state="blessed", body="another page")
        store = make_store(self.lib, [b1, b2])
        payload = study_lib.build_librarian_payload(
            store, "note", store_dir=self.lib, now_ms=None)
        sent_ids = [b["id"] for b in payload["bodies"]]
        conn = [{"title": "a thread", "connected_ids": sent_ids,
                 "why": "you were away so long, come back to these"}]
        os.environ["FAKE_CLAUDE_CONNECTIONS"] = json.dumps(conn)
        no_cached_probe()
        outcome = server._generate_librarian_connections(
            str(self.lib), payload, sent_ids, server._fenced_titles(store),
            self._routing())
        self.assertEqual(outcome["generated"], 0)
        self.assertEqual(outcome["dropped_no_push"], 1,
                         "absence/nagging framing never survives (law 3)")
        # 26.93-07, ADDITIVE AND ITS OWN CLAIM: the post-check dropped this
        # connection, and the recorded request proves the drop happened AFTER a
        # real call through the shipped seam rather than before one. Without it
        # a generator that never called anything would satisfy every assertion
        # above — the same vacuity the smoke suite's positive control guards.
        rec = json.loads(self.log.read_text(encoding="utf-8"))
        self.assertIn("a page", rec["stdin"],
                      "the note-scope payload really did ride the request — "
                      "the drop above is a post-check verdict, not a call "
                      "that never happened")


class AppleNotesUnseenTitleFenceTest(unittest.TestCase):
    """26.65-04 (T-26.65-12, law 5 — Pitfall 6): Plan 01 derives a staged
    note's filename from the note's own first line and import_folder sets
    title = path.name, so an unblessed Apple-Notes item's TITLE is its
    sensitive first line. The shipped fence withholds unseen BODIES but
    still emits the metadata row — this class proves the whole row (id,
    title, everything) is withheld from the DEFAULT (non-consent) presort
    scope for items carrying the Plan 01 from_source=='apple-notes' marker
    while state=='unseen'; blessing restores the row; the shipped per-run
    consent path widens it exactly like any other unseen text; the
    never_show/retired/trigger classes stay absolutely fenced FIRST; and a
    re-imported judged twin re-inherits its judgment.

    Every item is built through the REAL staging -> import_folder ->
    mark_origin path — never a hand-forged source=='apple-notes' item,
    which production never creates (imported notes are
    source=='folder-drop'; the fence must key on the from_source marker)."""

    # the path-safe stem IS the note's sensitive first line (Plan 01)
    SENSITIVE = "NOTES-TITLE-SENTINEL-裁员那天想说的话"

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def _collect_like(self, stem, body, staging_name="staging"):
        """Reproduce a real collect: stage a .md whose name is the note's
        first line, run the SHIPPED importer, then stamp the Plan 01
        marker — exactly the server worker's sequence."""
        staging = Path(self._tmp.name) / staging_name
        staging.mkdir(parents=True, exist_ok=True)
        (staging / (stem + ".md")).write_text(body, encoding="utf-8")
        report = study_lib.import_folder(staging, self.lib)
        store = study_lib.load_store(self.lib)
        marked = apple_notes.mark_origin(store, str(staging))
        return store, report, marked

    def _items_by_title(self, store, title):
        return [it for it in store["items"].values()
                if it.get("title") == title]

    def _blob(self, store, scope, consent):
        payload = study_lib.build_librarian_payload(
            store, scope, consent=consent, store_dir=str(self.lib))
        return payload, json.dumps(payload, ensure_ascii=False)

    def test_marker_and_shape_come_from_the_real_import_path(self):
        store, report, marked = self._collect_like(
            self.SENSITIVE, "一页手记 the note body")
        self.assertEqual(report["imported"], 1)
        self.assertEqual(marked, 1, "mark_origin stamps THIS collect's item")
        (it,) = self._items_by_title(store, self.SENSITIVE + ".md")
        self.assertEqual(it["source"], "folder-drop",
                         "an imported note keeps the importer's label — "
                         "which is exactly why the fence keys on the marker")
        self.assertEqual(it["from_source"], "apple-notes")
        self.assertEqual(it["state"], "unseen")

    def test_unseen_notes_title_withheld_from_default_scope(self):
        store, _, _ = self._collect_like(
            self.SENSITIVE, "SAFE-NOTES-BODY 未判定的手记")
        (it,) = self._items_by_title(store, self.SENSITIVE + ".md")
        # DEFAULT (non-consent) presort: NO row at all — no id, no title
        payload, blob = self._blob(store, "presort", False)
        self.assertNotIn(self.SENSITIVE, blob,
                         "the unblessed Notes title (its own first line) "
                         "must never reach the default scope")
        self.assertNotIn(it["id"], blob,
                         "the whole meta row is withheld — not just the "
                         "body, not just the title")
        # the marker field itself is never emitted, in any payload
        self.assertNotIn("from_source", blob)
        # the shipped per-run consent path (the disclosed 'this sends
        # unreviewed content to Claude' run) widens it like any unseen text
        payload, blob = self._blob(store, "presort", True)
        self.assertIn(self.SENSITIVE, blob,
                      "consent=True presort reads unjudged notes — the "
                      "shipped gate, no new consent surface")
        self.assertIn("SAFE-NOTES-BODY", blob)
        self.assertNotIn("from_source", blob)
        # note scope stays blessed-bodies-only under BOTH consents
        for consent in (False, True):
            _, blob = self._blob(store, "note", consent)
            self.assertNotIn(self.SENSITIVE, blob)
            self.assertNotIn(it["id"], blob)
        # 26.7-01: the reflection pool honors the SAME law-5 withholding —
        # an unblessed Notes row (its title IS the sensitive first line)
        # is absent from the non-consent pool and widens under the
        # shipped per-session consent exactly like presort
        payload, blob = self._blob(store, "reflection", False)
        self.assertNotIn(self.SENSITIVE, blob,
                         "the unblessed Notes title never reaches the "
                         "default reflection pool (law 5)")
        self.assertNotIn(it["id"], blob)
        payload, blob = self._blob(store, "reflection", True)
        self.assertIn(self.SENSITIVE, blob,
                      "consent widens the reflection pool exactly as "
                      "presort — no new consent surface")

    def test_blessing_restores_the_row(self):
        store, _, _ = self._collect_like(
            self.SENSITIVE, "SAFE-NOTES-BODY 被祝福的手记")
        (it,) = self._items_by_title(store, self.SENSITIVE + ".md")
        it["state"] = "blessed"
        payload, blob = self._blob(store, "presort", False)
        self.assertIn(self.SENSITIVE, blob,
                      "blessing un-fences the row — the title returns to "
                      "the default scope")
        self.assertIn(it["id"], blob)
        self.assertIn("SAFE-NOTES-BODY", blob,
                      "a blessed text body rides the default presort")
        self.assertNotIn("from_source", blob,
                         "the marker never rides, blessed or not")

    def test_judged_marked_note_stays_absolutely_fenced(self):
        # never_show / retired / the trigger overlay each fence the marked
        # note under EVERY scope x consent — the absolute classes run FIRST
        for judgment in ("never_show", "retired", "trigger"):
            with self.subTest(judgment=judgment):
                store, _, _ = self._collect_like(
                    self.SENSITIVE, "私密的手记 " + judgment,
                    staging_name="staging-" + judgment)
                (it,) = self._items_by_title(
                    store, self.SENSITIVE + ".md")
                if judgment == "trigger":
                    it["trigger"] = True
                else:
                    it["state"] = judgment
                for scope, consent in ALL_COMBOS:
                    _, blob = self._blob(store, scope, consent)
                    self.assertNotIn(
                        self.SENSITIVE, blob,
                        f"a {judgment} Notes title leaked at "
                        f"{scope}/{consent} — law 5 is absolute")
                    self.assertNotIn(it["id"], blob)
                # a fresh temp lib per subTest run
                self.tearDown()
                self.setUp()

    def test_adapter_reimport_reinherits_judgment(self):
        # the user judges the original never_show; the judgment must attach
        # to the THING — a later collect staging an EDITED twin (same first
        # line -> same title, different bytes -> a NEW item) re-inherits it
        # through the SHIPPED import_folder inheritance, unchanged (D-03)
        store1, _, _ = self._collect_like(
            self.SENSITIVE, "the original note", "staging-one")
        (orig,) = self._items_by_title(store1, self.SENSITIVE + ".md")
        orig["state"] = "never_show"
        study_lib.save_store(self.lib, store1)
        store2, report2, marked2 = self._collect_like(
            self.SENSITIVE, "the EDITED twin of the note", "staging-two")
        self.assertEqual(report2["inherited"], 1,
                         "the shipped judged-title inheritance covers "
                         "adapter-staged items — stamped in the report")
        twins = self._items_by_title(store2, self.SENSITIVE + ".md")
        self.assertEqual(len(twins), 2, "the edited twin is a NEW item")
        twin = [t for t in twins if t["id"] != orig["id"]][0]
        self.assertEqual(twin["state"], "never_show",
                         "the twin re-inherits the judgment at import")
        self.assertEqual(twin["from_source"], "apple-notes",
                         "the fresh collect marked its own staged item")
        for scope, consent in ALL_COMBOS:
            _, blob = self._blob(store2, scope, consent)
            self.assertNotIn(self.SENSITIVE, blob,
                             f"the judged title leaked at {scope}/{consent}")
            self.assertNotIn(orig["id"], blob)
            self.assertNotIn(twin["id"], blob)


# ---------------------------------------------------------------------------
# 26.7-01 Task 1: the "reflection" fence scope — the D-11 pool predicate,
# fail-closed comment-ISO parsing, comments serialization, stable ordering
# ---------------------------------------------------------------------------

class ReflectionScopeTest(unittest.TestCase):
    """26.7-01 (RSF-06/SRM-11, D-11/D-33): the candle session's pool is
    computable ONLY through the audited builder — same fence, same shadow
    screen, plus a strict-> session-marker boundary (a stamp EXACTLY equal
    to the marker is OLD, one ms later is new), fail-closed ISO->epoch-ms
    comment normalization (unparseable => old, never new), comments on
    every row (empty list, never a missing key), and id-sorted stable
    serialization (the identical pool re-sends identically each turn)."""

    M = 1700000000000   # a whole-second epoch-ms marker

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    @staticmethod
    def _iso(ms):
        """An offset-bearing ISO-8601 stamp for the given epoch ms."""
        return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat()

    def test_reflection_registered_and_unknown_scope_still_raises(self):
        self.assertIn("reflection", study_lib.LIBRARIAN_SCOPES)
        store = make_store(self.lib, [make_item(self.lib, 1)])
        with self.assertRaises(ValueError):
            study_lib.build_librarian_payload(store, "everything")

    def test_marker_none_first_session_is_the_whole_allowed_archive(self):
        blessed = make_item(self.lib, 1, state="blessed",
                            body="SAFE-BLESSED-BODY 安全的手记")
        unseen = make_item(self.lib, 2, state="unseen", body="unjudged")
        resting = make_item(self.lib, 3, state="resting", body="asleep")
        fenced = make_item(self.lib, 4, state="never_show",
                           body=f"{FENCE_BODY}-first 私密的手记",
                           title=f"{FENCE_TITLE}-first.md")
        store = make_store(self.lib, [blessed, unseen, resting, fenced])
        payload = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None)
        blob = json.dumps(payload, ensure_ascii=False)
        for it in (blessed, unseen, resting):
            self.assertIn(it["id"], blob,
                          "first session (marker None) = the WHOLE "
                          "allowed archive — never empty, never an error")
        self.assertIn("SAFE-BLESSED-BODY", blob,
                      "blessed bodies ride the reflection pool")
        self.assertNotIn(FENCE_BODY, blob)
        self.assertNotIn(FENCE_TITLE, blob)
        self.assertNotIn(fenced["id"], blob,
                         "the fence runs FIRST — a first-session pool is "
                         "still fenced")

    def test_strict_marker_boundary_created_saved_and_comment(self):
        M = self.M
        eq_created = make_item(self.lib, 1, state="blessed", body="p1")
        eq_created["created_ms"] = M
        eq_created["saved_ms"] = M - 10_000
        plus_created = make_item(self.lib, 2, state="blessed", body="p2")
        plus_created["created_ms"] = M + 1
        plus_created["saved_ms"] = M - 10_000
        eq_saved = make_item(self.lib, 3, state="blessed", body="p3")
        eq_saved["created_ms"] = M - 10_000
        eq_saved["saved_ms"] = M
        plus_saved = make_item(self.lib, 4, state="blessed", body="p4")
        plus_saved["created_ms"] = M - 10_000
        plus_saved["saved_ms"] = M + 1
        eq_comment = make_item(self.lib, 5, state="blessed", body="p5")
        eq_comment["created_ms"] = eq_comment["saved_ms"] = M - 100_000
        eq_comment["comments"] = [{"at": self._iso(M), "text": "老的评论"}]
        plus_comment = make_item(self.lib, 6, state="blessed", body="p6")
        plus_comment["created_ms"] = plus_comment["saved_ms"] = M - 100_000
        plus_comment["comments"] = [{"at": self._iso(M + 1),
                                     "text": "新的评论"}]
        store = make_store(self.lib, [eq_created, plus_created, eq_saved,
                                      plus_saved, eq_comment, plus_comment])
        payload = study_lib.build_librarian_payload(
            store, "reflection", session_marker=M)
        got = {b["id"] for b in payload["bodies"]}
        for included in (plus_created, plus_saved, plus_comment):
            self.assertIn(included["id"], got,
                          "a stamp at marker+1 is NEW (strict >)")
        for excluded in (eq_created, eq_saved, eq_comment):
            self.assertNotIn(excluded["id"], got,
                             "a stamp EXACTLY at the marker is OLD — "
                             "already reflected on (SRM-11 adjacency)")
        self.assertEqual(payload["meta_rows"], [],
                         "every item here is blessed text — an excluded "
                         "item is absent entirely, never a meta row")

    def test_unparseable_comment_at_is_old_never_new(self):
        M = self.M
        garbled = make_item(self.lib, 1, state="blessed", body="g")
        garbled["created_ms"] = garbled["saved_ms"] = M - 100_000
        garbled["comments"] = [{"at": "not-a-date", "text": "x"},
                               {"at": 12345, "text": "y"},
                               {"at": None, "text": "z"}]
        valid = make_item(self.lib, 2, state="blessed", body="v")
        valid["created_ms"] = valid["saved_ms"] = M - 100_000
        valid["comments"] = [{"at": self._iso(M + 60_000),
                              "text": "counts"}]
        store = make_store(self.lib, [garbled, valid])
        payload = study_lib.build_librarian_payload(
            store, "reflection", session_marker=M)
        got = {b["id"] for b in payload["bodies"]}
        self.assertNotIn(garbled["id"], got,
                         "an unparseable comment stamp reads as OLD — "
                         "fail-closed, it never admits an item")
        self.assertIn(valid["id"], got,
                      "a valid offset-bearing ISO stamp normalizes to "
                      "epoch ms and counts")

    def test_rows_carry_comments_and_default_to_empty_list(self):
        commented = make_item(self.lib, 1, state="blessed", body="a page")
        commented["comments"] = [{"at": self._iso(self.M),
                                  "text": "回头看真好"}]
        bare = make_item(self.lib, 2, state="blessed", body="another")
        meta_only = make_item(self.lib, 3, state="unseen", body="unjudged")
        store = make_store(self.lib, [commented, bare, meta_only])
        payload = study_lib.build_librarian_payload(store, "reflection")
        by_id = {b["id"]: b for b in payload["bodies"]}
        self.assertEqual(by_id[commented["id"]]["comments"],
                         [{"at": self._iso(self.M), "text": "回头看真好"}],
                         "each pool row carries its comments — the D-33 "
                         "insight fuel")
        self.assertEqual(by_id[bare["id"]]["comments"], [],
                         "no comments = an empty list, never a missing "
                         "key")
        (row,) = payload["meta_rows"]
        self.assertEqual(row["id"], meta_only["id"])
        self.assertEqual(row["comments"], [])
        self.assertEqual(set(row),
                         {"id", "title", "source", "type", "created_ms",
                          "tags", "comments"},
                         "a reflection meta row = the six presort fields "
                         "+ comments")
        for body in (by_id[commented["id"]], by_id[bare["id"]]):
            self.assertEqual(set(body),
                             {"id", "title", "text", "comments"})

    def test_rows_are_id_sorted_and_stable_across_calls(self):
        items = [make_item(self.lib, i, state="blessed", body=f"page {i}")
                 for i in (5, 3, 9, 1)]
        store = make_store(self.lib, items)   # inserted 5, 3, 9, 1
        payload = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None)
        ids = [b["id"] for b in payload["bodies"]]
        self.assertEqual(ids, sorted(ids), "pool rows are id-sorted")
        again = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None)
        self.assertEqual(payload, again,
                         "the identical serialized pool is what every "
                         "later turn re-sends (stable prefix)")

    def test_sentinels_absent_under_every_consent_and_marker_combo(self):
        def fenced(i, **kw):
            item_id = format(0x1000 + i, "016x")
            return make_item(self.lib, i,
                             body=f"{FENCE_BODY}-{item_id} 私密的手记",
                             title=f"{FENCE_TITLE}-{item_id}.md", **kw)
        f1 = fenced(1, state="never_show")
        f2 = fenced(2, state="retired")
        f3 = fenced(3, state="blessed", trigger=True)
        f4 = fenced(4, state="blessed", tags=["heavy-box"])
        # a fenced item's COMMENTS are fenced with it — seed a sentinel
        f1["comments"] = [{"at": self._iso(self.M + 5_000),
                           "text": f"{FENCE_BODY}-comment"}]
        a5 = make_item(self.lib, 5, state="blessed", body="SAFE-BLESSED")
        a6 = make_item(self.lib, 6, state="unseen", body="SAFE-UNSEEN")
        store = make_store(self.lib, [f1, f2, f3, f4, a5, a6],
                           filters=[{"facet": "tag", "value": "heavy-box"}])
        markers = (study_lib._NO_THRESHOLD, None, 0, self.M, 2 ** 62)
        for consent in (False, True):
            for marker in markers:
                if marker is study_lib._NO_THRESHOLD:
                    payload = study_lib.build_librarian_payload(
                        store, "reflection", consent=consent)
                else:
                    payload = study_lib.build_librarian_payload(
                        store, "reflection", consent=consent,
                        session_marker=marker)
                blob = json.dumps(payload, ensure_ascii=False)
                ctx = f"consent={consent}, marker={marker!r}"
                self.assertNotIn(FENCE_BODY, blob, f"body leak: {ctx}")
                self.assertNotIn(FENCE_TITLE, blob, f"title leak: {ctx}")
                for it in (f1, f2, f3, f4):
                    self.assertNotIn(it["id"], blob, f"id leak: {ctx}")


# ---------------------------------------------------------------------------
# 26.7-01 Task 2: the fail-closed reflection output contract
# ---------------------------------------------------------------------------

class ValidateReflectionTest(unittest.TestCase):
    """server.validate_reflection — the content half of the two-layer
    output contract (AI-SPEC §4b): fail-closed shape/fence/no-push/
    clinical/length screens over EVERY generated field; a dismissed-topic
    question is STRIPPED while the draft is kept (the file always wins).
    `why` is always a category token, never content."""

    def test_meta_narration_rejected_fail_closed(self):
        # 26.7-uat (beat-1 finding): the live CLI once put its own work
        # report into the reflection field — "Wrote the essay from
        # verbatim material found across the pool … bypassing … the
        # heaviest material …" — process narration that NAMES exactly
        # what the essay quietly holds back. It must never render.
        narration = ("Wrote the essay from verbatim material found "
                     "across the pool, focusing on a hands/voice thread "
                     "- bypassing the large volume of other content per "
                     "the instruction to bias toward joy anchors.")
        ok, cleaned, why = server.validate_reflection(
            {"reflection": narration, "coda": None, "question": None},
            [], [])
        self.assertFalse(ok)
        self.assertIsNone(cleaned)
        self.assertEqual(why, "meta_narration")
        # the anchored process verb alone trips it, floor-independent
        short = "Drafted one reflection weaving the three loom notes."
        ok2, _, why2 = server.validate_reflection(
            {"reflection": short, "coda": None, "question": None},
            [], [])
        self.assertFalse(ok2)
        self.assertEqual(why2, "meta_narration")
        # prompt-mechanics vocabulary mid-essay trips it too
        leaky = GOOD_ESSAY + " the handed pool held more."
        ok3, _, why3 = server.validate_reflection(
            {"reflection": leaky, "coda": None, "question": None},
            [], [])
        self.assertFalse(ok3)
        self.assertEqual(why3, "meta_narration")
        # a genuine essay is untouched by the screen
        ok4, cleaned4, _ = server.validate_reflection(
            {"reflection": GOOD_ESSAY, "coda": None, "question": None},
            [], [])
        self.assertTrue(ok4, "GOOD_ESSAY must never trip the "
                        "narration screen")

    def test_generic_single_token_fenced_titles_never_screen(self):
        # 26.7-uat (beat-1 finding): the live corpus carried fenced
        # notes titled "about" and "CLAUDE" — lone short latin tokens.
        # Every English essay says "about"; her essays quote Claude
        # constantly — so NO genuine essay could ever pass. The items
        # themselves are already absent from every payload; a lone
        # generic token cannot evidence a leak. The corpus keeps only
        # DISTINCTIVE titles: multi-word, CJK-bearing, or long enough
        # to be a name.
        tmp = tempfile.TemporaryDirectory()
        try:
            lib = Path(tmp.name) / "library"
            lib.mkdir()
            f_about = make_item(lib, 1, state="never_show",
                                body="x", title="About.md")
            f_claude = make_item(lib, 2, state="never_show",
                                 body="x", title="CLAUDE.md")
            f_pearl = make_item(lib, 3, state="never_show", body="x",
                                title="the pearl story from "
                                      "grandmother.md")
            f_diary = make_item(lib, 4, state="never_show", body="x",
                                title="日记 26年5月5日.md")
            store = make_store(lib, [f_about, f_claude, f_pearl,
                                     f_diary])
            corpus = server._fenced_titles(store)
            self.assertNotIn("about", corpus)
            self.assertNotIn("claude", corpus)
            self.assertIn("the pearl story from grandmother", corpus)
            self.assertTrue(any("日记" in t for t in corpus),
                            "CJK titles stay fully screened")
            chatty = GOOD_ESSAY + \
                ' you wrote "claude helped me sort it" and that is ' \
                'what this is about.'
            ok, _, _ = server.validate_reflection(
                {"reflection": chatty, "coda": None, "question": None},
                corpus, [])
            self.assertTrue(ok, "an essay saying about/claude must "
                            "never trip the screen")
            leaky = GOOD_ESSAY + \
                " next to the pearl story from grandmother it sits."
            ok2, _, why2 = server.validate_reflection(
                {"reflection": leaky, "coda": None, "question": None},
                corpus, [])
            self.assertFalse(ok2)
            self.assertEqual(why2, "fenced_title")
        finally:
            tmp.cleanup()

    def test_quoted_spans_exempt_from_voice_screens(self):
        # 26.7-uat (beat-1 finding, third of the class): the essay
        # QUOTES her verbatim by design (laws 2/4) — her own prose says
        # "don't forget" and names her therapy vocabulary, and the live
        # run rejected two good essays as no_push. Quoted spans are HER
        # words: exempt. The librarian's OWN unquoted voice still
        # passes the full strict lists.
        quoted = GOOD_ESSAY + \
            ' you wrote "don\'t forget to come back to this, it\'s ' \
            'been years ago now" and, later, "my therapist called it ' \
            'a coping mechanism."'
        ok, _, _ = server.validate_reflection(
            {"reflection": quoted, "coda": None, "question": None},
            [], [])
        self.assertTrue(ok, "HER quoted words must never trip the "
                        "no-push or clinical screens")
        cjk = GOOD_ESSAY + ' 你写过「别忘了 come back，it\'s been so long」。'
        ok_cjk, _, _ = server.validate_reflection(
            {"reflection": cjk, "coda": None, "question": None}, [], [])
        self.assertTrue(ok_cjk, "CJK corner-quoted words are exempt too")
        pushy = GOOD_ESSAY + \
            " it's been three weeks since you last opened any of this."
        ok2, _, why2 = server.validate_reflection(
            {"reflection": pushy, "coda": None, "question": None},
            [], [])
        self.assertFalse(ok2)
        self.assertEqual(why2, "no_push",
                         "the librarian's OWN absence-copy still rejects")
        clinical = GOOD_ESSAY + \
            " this reads like a coping mechanism you should examine."
        ok3, _, why3 = server.validate_reflection(
            {"reflection": clinical, "coda": None, "question": None},
            [], [])
        self.assertFalse(ok3)
        self.assertEqual(why3, "clinical_claim",
                         "the librarian's OWN clinical voice still "
                         "rejects")

    def test_prompt_pins_the_writing_into_the_structured_field(self):
        # 26.7-uat: the prompt names the ONE surviving channel — the
        # structured call's reflection field carries the complete writing
        # itself, never a summary or report of work.
        #
        # 26.995-07 CONSCIOUS PIN EDIT — 2026-08-19, D-01. The pin used to
        # assert "complete ESSAY itself". The word `essay` is a SHAPE word
        # and D-01 rules that a reflection may take any shape, so every
        # occurrence naming the artefact left the prompt. ⛔ THE CLAIM IS
        # UNCHANGED AND UNWEAKENED: the structured field still carries the
        # whole thing top to bottom, never a summary. Only the noun moved,
        # and the inverse assertion below is what stops the shape word
        # creeping back into the one clause that describes the channel.
        low = server.LIBRARIAN_REFLECT_PROMPT.lower()
        self.assertIn("complete writing itself", low)
        self.assertIn("never a summary", low)
        self.assertNotIn("complete essay itself", low,
                         "the shape word is GONE from the channel clause — "
                         "a prompt that calls the artefact an essay teaches "
                         "the essay shape in the same breath as it says any "
                         "shape is allowed")

    def test_prompt_demands_a_name_of_its_own_and_no_heading(self):
        # 26.7-uat (owner finding): every saved book came back spined
        # "the thread" — the model copied the skeleton example's heading
        # verbatim, and _reflection_book_title lifted the first heading as
        # the spine. The prompt had to demand a title of this essay's own
        # and mark the example heading as never-to-reuse.
        #
        # 26.87-10 CONSCIOUS PIN EDIT (D-16, T-26.87-15) pluralised the
        # heading clause when one skeleton became three.
        #
        # ⛔ 26.995-07 CONSCIOUS PIN EDIT — 2026-08-19, D-04 + D-06, AND IT
        # IS A REVERSAL OF THE MECHANISM, NEVER OF THE GUARANTEE. Her ruling
        # deletes the REQUIRED '## ' heading from the prompt outright. That
        # was safe to do only because 26.995-05 had already landed D-06: the
        # reflection NAMES ITSELF, as its own separate answer, so the name
        # no longer comes from the first heading and a headingless letter
        # can no longer be named by its greeting.
        #
        # ⛔ THE THING THIS PIN HAS ALWAYS PROTECTED SURVIVES INTACT: every
        # reflection still gets a short name OF ITS OWN, drawn from this
        # pool, never reused. It is asserted below against the `name` field
        # instead of against a markdown heading. The three inverse
        # assertions are what stop the retired demand creeping back — a
        # prompt that re-requires a heading re-creates the deadlock D-43
        # exists to prevent.
        #
        # ⚠ WHAT THIS PIN DOES NOT AND MUST NOT ASSERT: whether the shipped
        # EXAMPLES carry a heading. They do — `All three keep a title`, her
        # verbatim ruling, 26.995-05 task 1 — and that is a decision about
        # what the examples DEMONSTRATE, never about what the rule REQUIRES.
        # tests/test_reflection_shape.py owns the examples.
        low = server.LIBRARIAN_REFLECT_PROMPT.lower()
        self.assertIn("a short name of its own in the 'name' field", low,
                      "the demand for a name of this reflection's own "
                      "survives the loosening — it moved from the heading "
                      "to the field the model now answers with")
        self.assertIn("drawn from what this pool actually holds", low,
                      "and it is still drawn from THIS pool, which is what "
                      "stops one name being reused across evenings")
        self.assertIn("never reuse a name it lists", low,
                      "the variation block's exclusion now points at the "
                      "NAME (D-06), not at a heading")
        self.assertNotIn("open the essay with one '## ' heading", low,
                         "THE INVERSE ASSERTION: the REQUIRED heading is "
                         "deleted (D-04) and must not creep back — with the "
                         "name still falling back to the first line, a "
                         "re-required heading is how the letter shape "
                         "deadlocks again")
        self.assertNotIn("title of its own", low,
                         "and the retired wording with it — a second demand "
                         "for a title, beside the name field, is two "
                         "answers to one question")
        self.assertNotIn("never reuse any of the example headings", low,
                         "the never-reuse-a-heading demand goes with the "
                         "heading demand: forbidding the reuse of a thing "
                         "the prompt no longer requires is rule text "
                         "pointing at nothing")
        # ⛔ AND THE HALF THAT MAKES THIS A MOVE RATHER THAN A DELETION. The
        # retired `never repeat a title across essays` sentence was only the
        # SOFT half of the across-evenings demand; the hard half has always
        # been the machine gate, and it now reads the name (26.995-05).
        # Without this assertion the three assertNotIns above would pass
        # just as happily for a prompt that dropped the demand AND a server
        # that dropped the gate.
        self.assertTrue(
            callable(getattr(server, "_reflection_title_reused", None)),
            "the HARD half of the across-evenings demand is still "
            "machine-enforced — deleting the prompt's soft ask while the "
            "gate also went is the loosening this pin exists to prevent")

    def test_contract_constants(self):
        # 2026-07-30 conscious pin edit (owner call): the essay tier moved
        # sonnet -> opus on her own CLI comparison. The essay is ONE call
        # per session, so the quality/cost trade is nothing like the
        # per-note tiers — which is exactly why those stay haiku and are
        # pinned separately below.
        #
        # 2026-07-30 conscious pin edit #2 (26.87-01, D-19): the env read
        # is now VALIDATED through _allowed_model, so the old assertion —
        # `os.environ.get(...) or "opus"` — breaks outright on an illegal
        # value: the left side would be the illegal string while the right
        # side is the fail-closed default. The pin states the NEW truth
        # (the validated read) rather than being deleted to go green.
        self.assertEqual(
            server._allowed_model(os.environ.get("LIBRARIAN_REFLECT_MODEL")),
            server.LIBRARIAN_REFLECT_MODEL,
            "the reflect model must be the VALIDATED env override, else opus")
        self.assertEqual(
            server._allowed_model(os.environ.get("LIBRARIAN_NOTE_MODEL")),
            server.LIBRARIAN_NOTE_MODEL,
            "the note model must be the VALIDATED env override, else opus")
        # The inverse pin: whatever the ambient environment says, what
        # actually reaches the argv is always an allowed alias. Without
        # this, an unvalidated read could creep back and the two
        # assertions above would still pass.
        self.assertIn(server.LIBRARIAN_REFLECT_MODEL, server.VOICE_MODELS)
        self.assertIn(server.LIBRARIAN_NOTE_MODEL, server.VOICE_MODELS)
        self.assertEqual(server.LIBRARIAN_VOICE_MODEL_DEFAULT, "opus")
        # the bulk tiers are NOT quality tiers and must not drift upward:
        # one call per NOTE, not per session (D-07 cost discipline).
        self.assertEqual(server.LIBRARIAN_SORT_MODEL, "haiku")
        # ⛔ `CLEAN_MODEL` LEFT THIS BLOCK 2026-08-17. It named the model the
        # labelling classifier ran on, and #95 deleted that job — the shipped
        # tidy-up asks no model anything, so it has no tier to pin. Asserted
        # as absent instead: a bulk tier arriving again must arrive with a
        # job, and this block is where its ceiling is held.
        self.assertFalse(
            hasattr(server, "CLEAN_MODEL"),
            "CLEAN_MODEL is back — the tidy-up sends nothing to any model "
            "(#89), so a model tier for it is a number nothing can keep "
            "honest")
        # 26.87-09: the PARKED connection tier joins the pinned block. It
        # was pinned by no test at all until now, so a phase that touched
        # the five-tier block could have moved it in silence. Not
        # user-settable either — only the voice tier is.
        self.assertEqual(server.LIBRARIAN_CONNECT_MODEL, "sonnet")
        # ---- 26.87-09 (D-18/D-19, T-26.87-12): the allow-list TABLE -----
        # The narrowing versus the CLI's own wider alias set is
        # DELIBERATE, and this table is what stops a future reader from
        # "helpfully" widening it: a pinned model id and a fourth alias
        # are both refused, by name.
        # ⚠⚠ THIS TUPLE MOVED 2026-08-26 AND IT WAS NOT RE-BASELINED TO CLEAR
        # A RED. `sonnet` left the picker on HER RULING (26.99955 UAT, G-…-04).
        # The finding was that her pick reached NO CALL — 26.93-06 took
        # `voice_model` off the call path and the card went on naming her
        # choice — and the fix makes the pick choose the fill of the tier that
        # serves reflections and desk notes. That turned the third alias from
        # a harmless spare word into a live route to a model NO TIER'S
        # ALLOW-LIST HELD and no live provider had ever answered, whose first
        # real use would have been one of her own reflections. She was told
        # that in those terms and chose "Offer the two it has run".
        # ⛔ Everything this block is FOR is unchanged: the narrowing versus
        # the vendor's wider alias set still holds, and the illegal-value rows
        # below still refuse a pinned model id and a fourth alias by name.
        # ⭐⭐ THE PIN IS NOW PER PROVIDER — 26.99955 UAT G-…-OPENAI, her
        # ruling of 2026-08-27. A room whose librarian answers from OpenAI
        # gets a picker too, so the storable set is no longer one provider's
        # roster and a flat equality here would say the narrowing had been
        # abandoned when it has only been repeated.
        # ⛔ WHAT THIS BLOCK IS FOR IS UNCHANGED, and it is asserted harder:
        # each provider's roster is pinned EXACTLY, so the narrowing versus
        # each vendor's wider alias set still holds on both sides, and the
        # union is pinned to the literal so neither can grow alone.
        self.assertEqual(server.VOICE_MODELS_BY_PROVIDER["anthropic"],
                         ("opus", "sonnet", "haiku"))
        self.assertEqual(server.VOICE_MODELS_BY_PROVIDER["openai"],
                         ("sol", "terra", "luna"))
        self.assertEqual(
            server.VOICE_MODELS,
            ("opus", "sonnet", "haiku", "sol", "terra", "luna"),
            "the storable set is not exactly the two rosters — an alias that "
            "can be stored but is offered to nobody, or offered and never "
            "storable, is a button that lies in one direction or the other")
        for legal in server.VOICE_MODELS:
            self.assertIsNone(
                server.validate_voice_model({"voice_model": legal}),
                "every allow-list member is accepted at the write")
        for illegal in ("fable", "gpt-9", "claude-opus-4-1-20250805",
                        "OPUS", "", None, True, 3, ["opus"]):
            err = server.validate_voice_model({"voice_model": illegal})
            self.assertIsInstance(
                err, str,
                "a pinned model id, a fourth alias, or any non-member is "
                "refused at the write: %r" % (illegal,))
            self.assertNotIn("voice_model", err,
                             "the refusal speaks plain words — a meta key "
                             "name never reaches a user-facing string")
        self.assertIsNone(server.validate_voice_model({}),
                          "an ABSENT key means the default — no migration, "
                          "no schema bump")
        # the key is reachable by ASKING as well as by picking (D-17), and
        # it is in the model-proposable set BY NAME rather than by index.
        self.assertIn("voice_model", server.CONFIGURABLE_KEYS)
        self.assertIn("voice_model", server.MODEL_PROPOSABLE_KEYS)
        self.assertIn("voice_model", server._CONFIG_KEY_VALIDATORS,
                      "without a LIVE validator entry every voice_model "
                      "change is silently DROPPED and the ask channel "
                      "cannot reach the key at all")
        # META_KEYS took the new key ABOVE its closing member — a shipped
        # test (tests/test_candle_repull.cjs) pins that member as last.
        self.assertEqual(server.META_KEYS[-1], "connected_sources")
        self.assertIn("voice_model", server.META_KEYS)
        schema = json.loads(server.REFLECTION_SCHEMA_JSON)
        # 26.8-03 conscious pin edit: the optional whys map joins the
        # contract shape (D-10); required stays exactly ["reflection"].
        # 26.995-05 CONSCIOUS PIN EDIT — 2026-08-19, D-06 (with D-43's
        # build-order law and D-04's heading deletion behind it). Owner
        # ruling: `All three keep a title` (the heading question, put to
        # her before any prompt text existed). THE NEW TRUTH: a reflection
        # names itself as its OWN answer, so `name` joins the contract
        # shape — and it joins as an OPTIONAL property, which is the whole
        # back-compat route: `required` stays exactly ["reflection"] so
        # every session file, book and ledger record already on her disk is
        # still a valid answer, read through _reflection_name's fallback.
        # THE INVERSE ASSERTION that stops the old form creeping back: the
        # name must NOT be required, and it must NOT be nullable — absence
        # is the one spelling of "no name of my own", and a second spelling
        # is how a fail-closed shape check quietly becomes a fallback.
        # 26.995-06 task 1a CONSCIOUS PIN EDIT — 2026-08-18, D-05 (owner
        # ruling, option `a-short-said-field`). THE NEW TRUTH: the
        # librarian answers a refine turn IN ITS OWN WORDS, so `said`
        # joins the contract shape. ⚠ A FIELD RETURNS TO A WIRE THAT IS
        # LOSING ONE IN THE SAME PLAN, and the option's own con said so:
        # the wire grows rather than shrinks. It joins OPTIONAL and
        # NULLABLE — a generation turn has no change to report, and the
        # `coda` shape is what that means here. THE INVERSE ASSERTION
        # below: it must NOT be required, because required would make
        # every answer already on her disk invalid.
        # 26.995-06 task 2 CONSCIOUS PIN EDIT — 2026-08-19, D-05. THE NEW
        # TRUTH: the question property is GONE. A question the librarian
        # wants to ask arrives INSIDE the writing, not as a footer under
        # it. ⛔ AND THE QUESTION CAP WENT WITH THE FIELD: the single
        # nullable slot was what structurally capped a reflection at one
        # question, #17 lifted that cap, and this removal is how the cap
        # goes. Structural and intended — not an uncapped surface someone
        # later "fixes".
        # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13. THE SET READ
        # `{"reflection", "name", "said", "coda", "whys"}`, AND IT WAS
        # CORRECT WHEN IT WAS WRITTEN. THE NEW TRUTH: the `coda` property is
        # GONE. It carried the model's own naming of what she added in
        # conversation, and the room appended it to the saved body under a
        # fixed heading.
        #
        # HER RULING: the label goes, and the librarian weaves what she
        # added into the writing itself — so her addition survives in HER
        # words rather than as the room's summary under a heading.
        # 26.995-07 deleted the instruction that asked for the field; this
        # is the field leaving the wire, one wave later.
        #
        # ⚠ A FIELD NOBODY PRINTS IS A FIELD NOBODY CHECKS: once both
        # producers of the label are gone, nothing renders it and the
        # reference derivation reads the draft alone, so its only remaining
        # job would be to carry something no surface reads.
        self.assertEqual(set(schema["properties"]),
                         {"reflection", "name", "said", "whys"})
        self.assertNotIn("question", schema["properties"],
                         "THE INVERSE ASSERTION: the field must not creep "
                         "back. Its return would re-cap the questions AND "
                         "put the footer back under the writing")
        self.assertNotIn("coda", schema["properties"],
                         "THE INVERSE ASSERTION: the coda field must not "
                         "creep back either. Its return would put the "
                         "labelled footer back under the writing — one "
                         "mandated shape is one shape to copy, and a "
                         "footer the room's own code appended was more "
                         "fixed than anything the librarian was producing")
        self.assertEqual(schema["required"], ["reflection"])
        self.assertNotIn("name", schema["required"],
                         "the name is OPTIONAL — a pre-change answer must "
                         "stay valid, and the eval harness pins this list "
                         "by value")
        self.assertEqual(schema["properties"]["name"]["type"], "string",
                         "a PLAIN string: no null (absence is the one "
                         "spelling of no-name) and no object node (every "
                         "object node must close, or Anthropic answers "
                         "400 on every call)")
        self.assertNotIn("said", schema["required"],
                         "the reply is OPTIONAL — a generation turn has "
                         "nothing to report, and every answer already on "
                         "her disk carries no reply at all")
        self.assertEqual(schema["properties"]["said"]["type"],
                         ["string", "null"],
                         # ⚠ 26.995-12: the comparison used to read "nullable
                         # like `coda`". `coda` is gone, so the shape is
                         # stated on its own terms rather than by pointing
                         # at a field a reader can no longer look up.
                         "NULLABLE, and NOT a plain string like `name`: "
                         "'no reply' is a legitimate answer here, not a "
                         "failure to answer")
        self.assertIs(schema["additionalProperties"], False)
        # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13. This line read
        # `self.assertEqual(schema["properties"]["coda"]["type"],
        # ["string", "null"])` and it pinned real shipped behaviour. With
        # the property gone there is no type to pin; the absence is asserted
        # above, with the creep-back reason on it.
        # 26.995-06 task 2: the prompt now tells the model to ask inside
        # the writing, and says out loud there is no separate field and no
        # fixed number of them (#17 lifted the cap).
        #
        # 26.995-07 CONSCIOUS PIN EDIT — 2026-08-19, D-01: the literal read
        # "ask it INSIDE the essay" one day ago. ⚠ ONLY THE SHAPE WORD
        # MOVED — the claim, that a question belongs inside the prose and
        # has no field and no cap, is stated below word for word.
        self.assertIn("ask it INSIDE the writing",
                      server.LIBRARIAN_REFLECT_PROMPT,
                      "the question moved into the writing (D-05)")
        self.assertIn("no separate field for a question and no fixed "
                      "number of them",
                      server.LIBRARIAN_REFLECT_PROMPT,
                      "and the uncapped licence is still said out loud — "
                      "#17 lifted the cap and nothing bounds the count")
        self.assertNotIn("'question' field",
                         server.LIBRARIAN_REFLECT_PROMPT,
                         "THE INVERSE ASSERTION: the prompt must not name "
                         "a field that no longer exists — an instruction "
                         "to fill a missing slot is how the footer comes "
                         "back")
        # 26.87-10 CONSCIOUS PIN EDIT (D-16): the closing rule used to name
        # a FIXED LABEL ("a final line that starts 'Use:'") and this pin
        # asserted the literal. The prompt then named the INTENT instead.
        #
        # ⛔⛔ 26.995-07 CONSCIOUS PIN EDIT — 2026-08-19, D-07 + D-09, AND
        # THIS ONE IS A DELETION OF THE INTENT ITSELF, NOT ANOTHER
        # SOFTENING. Her ruling: *nothing has to end a reflection; some
        # reflections simply stop.* The whole closing clause goes,
        # NEVER-REPEAT HALF INCLUDED — a prohibition on repeating a closing
        # move presupposes a closing move, so it could not be left behind
        # without re-asserting the thing it modified.
        #
        # ⛔ D-09 IS WHY THE PROMPT IS NOT SIMPLY SILENT HERE. Silence is
        # exactly how this problem was made: with no instruction the model
        # falls back to its trained habit and its trained habit is the tidy
        # takeaway. So one short POSITIVE line replaces the clause, and it
        # is asserted below rather than assumed.
        #
        # ⚠ AND THE HONEST HALF, RECORDED WHERE A READER WILL MEET IT: the
        # deleted instruction is the one 26.995-03's halted task 4 would
        # have policed. That task's no-advice check was never built and its
        # owner decision is still owed. This change removes the instruction
        # the check was aimed at; it does NOT resolve the decision, and no
        # stub or workaround was written in its place.
        self.assertIn("nothing has to end it",
                      server.LIBRARIAN_REFLECT_PROMPT,
                      "D-09's ONE SHORT POSITIVE LINE — never silence, "
                      "because silence returns the model to the tidy "
                      "takeaway it was trained on")
        self.assertIn("some reflections simply stop",
                      server.LIBRARIAN_REFLECT_PROMPT,
                      "and it says so in her own ruling's words")
        self.assertIn("homework wearing a question mark is still homework",
                      server.LIBRARIAN_REFLECT_PROMPT,
                      "D-11's boundary is rule text now: a closing question "
                      "that WONDERS is legal, one that names a chore is not")
        self.assertNotIn("carry the thread forward",
                         server.LIBRARIAN_REFLECT_PROMPT,
                         "THE INVERSE ASSERTION: the mandated forward move "
                         "is GONE and must not creep back — it is the exact "
                         "ending 16 of 17 measured essays produced, and an "
                         "instruction to produce it is the loudest thing in "
                         "the prompt")
        self.assertNotIn("never the same closing move twice",
                         server.LIBRARIAN_REFLECT_PROMPT,
                         "including the NEVER-REPEAT half, which presupposes "
                         "a closing move and would smuggle the requirement "
                         "back in as a prohibition")
        self.assertNotIn("never a fixed label",
                         server.LIBRARIAN_REFLECT_PROMPT,
                         "and the label caveat that only ever modified the "
                         "closing move — rule text pointing at a deleted "
                         "clause reads as the clause still being there")
        self.assertNotIn("Use:", server.LIBRARIAN_REFLECT_PROMPT,
                         "the fixed closing label is GONE and must not "
                         "creep back — one mandated shape is one shape to "
                         "copy (the three labelled negative fixtures still "
                         "carry it, and stay valid as REJECTED exemplars)")

    def test_shape_rejections(self):
        # 26.995-06 task 2 CONSCIOUS PIN EDIT — 2026-08-19, D-05: the last
        # row was `{"reflection": GOOD_ESSAY, "question": ["x"]}`. With the
        # property gone that row is a STRANGER KEY, which the validator
        # ignores by design rather than refuses — so asserting a rejection
        # there would pin the wrong thing. The stranger's fate is asserted
        # by name in test_a_stranger_question_key_goes_nowhere; the row
        # itself moves to `said`, which is the field that took its place on
        # the wire.
        # 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13: the row
        # `{"reflection": GOOD_ESSAY, "coda": 5}` stood here, and it was
        # correct while `coda` was on the wire — an off-shape value in a
        # NAMED property is a rejection. With the property gone that row is
        # a STRANGER KEY, which the validator ignores by design rather than
        # refuses, so asserting a rejection there would pin the wrong thing.
        # The stranger's fate is asserted by name in
        # test_a_stranger_coda_key_goes_nowhere; `said` already covers the
        # off-shape-value claim this row was making.
        for bad in (None, [], "text", {}, {"reflection": 42},
                    {"reflection": "   "},
                    {"reflection": GOOD_ESSAY, "said": ["x"]}):
            ok, cleaned, why = server.validate_reflection(bad, [], [])
            self.assertFalse(ok, f"accepted bad shape: {bad!r}")
            self.assertIsNone(cleaned)
            self.assertEqual(why, "shape")

    def test_fenced_title_in_any_field_rejects(self):
        fenced_titles = ["fence-title-secret-note"]
        cases = (
            {"reflection": GOOD_ESSAY + " fence-title-secret-note"},
            # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13: the row
            # `{"reflection": GOOD_ESSAY, "coda": "…fence-title-secret-note"}`
            # stood here, and it pinned real shipped behaviour — the fence
            # bound the coda exactly as it bound every other generated
            # field. The field is gone from the wire, so there is no such
            # generated text to screen. ⛔ NOTHING IS LOOSENED: `said` below
            # keeps the "ANY field" claim honest, and what she added now
            # rides INSIDE the reflection, where the first row screens it.
            # 26.995-06 task 2: the question field is gone; `said` is the
            # generated field that took its place on the wire, and the
            # fence binds it exactly the same way.
            {"reflection": GOOD_ESSAY,
             "said": "kept fence-title-secret-note where it was."},
        )
        for structured in cases:
            ok, cleaned, why = server.validate_reflection(
                structured, fenced_titles, [])
            self.assertFalse(ok)
            self.assertIsNone(cleaned)
            self.assertEqual(why, "fenced_title",
                             "a fenced title in ANY field rejects")

    def test_no_push_vocabulary_rejects(self):
        ok, cleaned, why = server.validate_reflection(
            {"reflection": GOOD_ESSAY + " while you were away"}, [], [])
        self.assertFalse(ok)
        self.assertEqual(why, "no_push", "law-3 backstop over the essay")

    def test_clinical_claim_in_any_field_rejects(self):
        cases = (
            {"reflection": GOOD_ESSAY +
             " this reads like part of your healing."},
            # 26.995-06 task 2: `said` replaces the removed question row.
            {"reflection": GOOD_ESSAY,
             "said": "wove in the trauma response you named."},
            # ⛔ 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13: the row
            # `{"reflection": GOOD_ESSAY, "coda": "…coping mechanism…"}`
            # stood here and pinned real shipped behaviour. The field left
            # the wire; the clinical screen still binds every generated
            # field that remains, which is what the two rows above assert.
            # What she added is inside the reflection now, and the first row
            # is the one that screens it there.
        )
        for structured in cases:
            ok, cleaned, why = server.validate_reflection(
                structured, [], [])
            self.assertFalse(ok)
            self.assertIsNone(cleaned)
            self.assertEqual(why, "clinical_claim",
                             "the deterministic role-boundary screen "
                             "(AI-SPEC dims 6/7 code halves)")

    def test_length_floor_and_ceiling(self):
        """⚠⚠ INVERTED-CASE, 2026-08-19 (26.995-01, D-36 / D-02(c)) — THE
        INVERSION IS THE POINT, and this case is kept rather than deleted
        precisely so the inversion is legible in one place.

        THIS CASE USED TO ASSERT `why == "length_floor"` FOR "a nice line."
        and it passed, every run, for a year. That green was the defect: the
        400-character floor rejected and REGENERATED exactly the reflection
        D-02(c) legalised — *a few sentences about one noticing, and then it
        stops* — so #18 had been unbuildable since the day it was ruled, and
        nobody noticed because the room never goes that short unprompted
        (shortest measured essay: 325 words).

        D-36's ruling is that the floor GOES as a length rule and NOTHING
        replaces it. What it was reaching for — catch a reflection cut off
        mid-thought — already exists at the transport, for all three
        providers, ahead of any parse, and the unmutated control for that
        lives in `ReflectionTruncationControlTest` below and in
        `tests/test_session_flow.py`.

        ⛔ A LATER READER MUST NOT RESTORE A CLAIM THIS PASS CANNOT MAKE.
        There is no minimum length any more, at any number. If a short draft
        ever needs refusing again it is a CONTENT judgement with a content
        gate, never a character count — a count is what took D-02(c) out of
        the product without anybody deciding to.

        The CEILING half below is untouched and stays green: it is derived
        from the transport budget (D-36 leaves it exactly alone)."""
        # (a) the short shape — the arm that was red before the deletion.
        self.assertEqual(len(SHORT_REFLECTION), 380,
                         "the fixture IS the size claim — 380 characters, "
                         "the shape the 400 floor used to reject")
        self.assertEqual(SHORT_REFLECTION.count("."), 3,
                         "three sentences: one noticing, and then it stops")
        ok, cleaned, why = server.validate_reflection(
            {"reflection": SHORT_REFLECTION}, [], [])
        self.assertTrue(ok, "a three-sentence reflection is legal now — "
                            "D-02(c), and the floor that refused it is gone")
        self.assertIsNone(why, "and it is not merely tolerated with a "
                               "category token attached")
        self.assertEqual(cleaned["reflection"], SHORT_REFLECTION,
                         "it survives the validator BYTE FOR BYTE")
        # ⚠⚠ 26.995-03 CONSCIOUS FIXTURE EDIT (D-18), AND THE CLAIM IS
        # UNCHANGED. Arms (b) and (c) below used to read "a nice line." and
        # "a" * size — drafts that never address her at all. 26.995-03 built
        # the address floor D-18 ruled, so those two now reject on
        # `address_floor`: NOT on their length, which is the only thing this
        # case has ever been about. The fixtures therefore say "you" and
        # nothing else about them moves — (c) is still EXACTLY 399 and 400
        # characters, still differing from each other in nothing but size.
        # ⛔ THE DISTINCTION IS THE WHOLE REPAIR AND MUST NOT BE FLATTENED: a
        # one-liner is legal, a one-liner that never turns toward her is not,
        # and neither fact is a length rule. If a later reader finds this case
        # red, the question to ask is which token came back — `length_floor`
        # would mean D-36 was undone, `address_floor` means the fixture stopped
        # being a reflection.
        #
        # (b) the one-liner this case used to refuse. It passes now, and that
        # is the deletion stated in its strongest form rather than hidden.
        ok, _, why = server.validate_reflection(
            {"reflection": "you kept a nice line."}, [], [])
        self.assertTrue(ok, "the old floor's own fixture — nothing measures "
                            "length from below any more")
        self.assertIsNone(why)
        # (c) 400 and 399 — the number the deleted constant sat on. BOTH
        # pass, so the boundary is not a boundary; a floor moved to some
        # smaller literal would fail here rather than pass quietly.
        for size in (399, 400):
            draft = "you " + "a" * (size - 4)
            self.assertEqual(len(draft), size,
                             "the arm's whole claim is its SIZE, so the "
                             "fixture must be exactly %d characters" % size)
            ok, _, why = server.validate_reflection(
                {"reflection": draft}, [], [])
            self.assertTrue(ok, "%d characters must pass — 400 was the old "
                                "boundary and there is no boundary now"
                                % size)
            self.assertIsNone(why)
        # (d) the DELETED NAME, pinned absent. The re-entry risk is not
        # hypothetical: a later caller adding a floor back — anywhere, at any
        # number — takes D-02(c) out of the product again, silently, because
        # a regenerated draft looks like the model choosing a longer shape.
        self.assertFalse(
            hasattr(server, "LIBRARIAN_REFLECTION_FLOOR"),
            "LIBRARIAN_REFLECTION_FLOOR is back — a minimum length is how "
            "the short reflection D-02(c) legalised gets rejected and "
            "regenerated without anybody deciding to")
        # (e) THE UNMUTATED CONTROL, in the same case: the ceiling half is
        # untouched by the deletion and still refuses.
        too_long = "a" * (server.LIBRARIAN_REFLECTION_CEILING + 1)
        ok, cleaned, why = server.validate_reflection(
            {"reflection": too_long}, [], [])
        self.assertFalse(ok)
        self.assertEqual(why, "length_ceiling")

    def test_dismissed_topic_rejects_the_whole_draft(self):
        """⚠⚠ INVERTED-CASE — 2026-08-19 (26.995-06 task 2, D-05). Kept
        rather than deleted precisely so the inversion is legible in one
        place.

        THIS CASE USED TO ASSERT `why == "question_stripped"` AND THAT THE
        DRAFT SURVIVED. It was the whole enforcement of floor row 14 — *a
        topic she has dismissed never returns* — and it worked by emptying
        the question slot before she ever saw it.

        HER RULING behind the change: D-05 moves a question the librarian
        wants to ask INTO the writing. CONTEXT settles the consequence in
        its own words — *move them anyway and pay the regeneration*. THE
        NEW TRUTH: there is no slot left to empty, so the screen keeps its
        detection and changes its disposition — the whole draft is thrown
        away with its own token and written again.

        ⛔ NO ATTEMPT IS MADE TO EXCISE A QUESTION FROM INSIDE THE PROSE.
        That would be a rewrite of the librarian's own writing to make it
        pass a gate; the honest form is to discard it and write it again.

        ⬜ AND ONE PART OF THIS IS AN AGENT'S READING, NOT HERS, so a later
        reader knows which is which: the screen runs over the UNQUOTED
        remainder, on the shipped precedent that the librarian-VOICE
        screens exempt her quoted words (laws 2/4). Arm (b) is that
        decision, driven. Without it an essay that quotes her own note
        naming the topic would be refused twice and the sitting would die
        — and the pool those notes come from is exactly where the topic
        lives. ⚠ SHE MAY CORRECT THIS; flipping arm (b) is the whole
        change if she does."""
        # (a) the librarian's OWN prose returns to it -> the draft goes.
        returning = {"reflection": GOOD_ESSAY + "\n\nthe layoffs thread "
                                                "runs under all of this "
                                                "for you too.",
                     "coda": None}
        ok, cleaned, why = server.validate_reflection(
            returning, [], ["layoffs"])
        self.assertFalse(ok, "a draft that returns to a dismissed topic is "
                             "thrown away WHOLE — there is no slot left to "
                             "empty")
        self.assertIsNone(cleaned)
        self.assertEqual(why, "dismissed_topic",
                         "a rejection with its own token, fail-visible, "
                         "category only — never the draft")
        # ⛔ THE INVERSE ASSERTION that stops the old form creeping back:
        # the strip token is gone and nothing in this module produces it.
        self.assertNotEqual(why, "question_stripped",
                            "the strip-and-keep disposition is GONE — a "
                            "kept draft here would be floor row 14 "
                            "silently unenforced")
        # (b) her OWN WORDS, quoted verbatim, naming the same topic — hers,
        # and the essay stands. This is the agent's reading flagged above.
        quoting = {"reflection": GOOD_ESSAY + "\n\nyou wrote \"i am done "
                                              "with the layoffs thread\" "
                                              "and you left it there.",
                   "coda": None}
        ok2, cleaned2, why2 = server.validate_reflection(
            quoting, [], ["layoffs"])
        self.assertTrue(ok2, "her own quoted words naming the topic are "
                             "HERS — the screen reads the librarian's "
                             "voice, exactly as no-push and clinical do")
        self.assertIsNone(why2)
        # (c) THE UNMUTATED CONTROL: the same returning draft, with nothing
        # dismissed, passes. Without it arm (a) passes against a validator
        # that refuses that draft for some other reason entirely.
        ok3, cleaned3, why3 = server.validate_reflection(
            returning, [], [])
        self.assertTrue(ok3, "nothing dismissed, nothing rejected — "
                             "otherwise arm (a) proves nothing about the "
                             "dismissed list")
        self.assertIsNone(why3)

    def test_a_short_or_mid_word_dismissed_topic_does_not_kill_every_sitting(
            self):
        """⛔⛔ THE CASE THE SEVEN-CHARACTER "layoffs" ABOVE COULD NOT REACH,
        and its absence is the whole reason this shipped.

        26.995-06 kept the DETECTION and changed only the DISPOSITION. That is
        backwards: the detection was sized for one short question sentence
        where a hit emptied a slot, and it now runs over a 2,000-word essay
        where a hit discards the draft and buys a second Opus call. And the
        needle had no floor and no boundary.

        ⚠ HOW THIS WAS DRIVEN RED, measured against the shipped validator
        before the fix:

            dismissed='work' -> ok=False why=dismissed_topic
            dismissed='the'  -> ok=False why=dismissed_topic
            dismissed='a'    -> ok=False why=dismissed_topic

        `_reflection_turn_doc` carries no `dismissed` key and the prompt never
        mentions dismissals, so the model is never told; the retry re-sends
        the document byte-identical. One dismissed topic of "the" therefore
        failed BOTH attempts on EVERY tap, forever, ending each sitting on the
        generic error line at two paid calls — and the only diagnostic was a
        category token in a job snapshot she never sees. Every existing arm
        used a long distinctive topic, so nothing was red.

        ⚠ THIS CASE DELIBERATELY USES THE NEEDLES THAT BROKE IT — 'a', 'the',
        and a mid-word 'work' — rather than another long one."""
        # (a) SUB-THRESHOLD NEEDLES. Below the sibling's shipped noise
        # threshold the screen abstains, exactly as `_names_fenced_title`
        # has abstained on short titles since 26.4.
        for needle in ("a", "the", "an", "it"):
            ok, cleaned, why = server.validate_reflection(
                {"reflection": GOOD_ESSAY}, [], [needle])
            self.assertTrue(
                ok,
                "⛔ a %r-character dismissal made EVERY draft fail BOTH "
                "attempts, forever, at two Opus calls a tap: %r"
                % (len(needle), why))
            self.assertIsNone(why)
        # (b) MID-WORD NOISE at or above the threshold. "work" inside
        # network/homework/framework is not a return to the topic.
        midword = (GOOD_ESSAY + "\n\nthe network of small rooms you keep is "
                                "a homework of its own, and you framework it "
                                "every evening without noticing.")
        ok, cleaned, why = server.validate_reflection(
            midword_doc := {"reflection": midword}, [], ["work"])
        self.assertTrue(
            ok, "a needle buried inside longer words is noise, not a topic "
                "returning: " + repr(why))
        # (c) ⛔ THE ARM THAT MUST STILL FAIL, and without it (a) and (b)
        # would pass against a screen that had simply been deleted. The topic
        # really returning, as its own word, is still the whole draft gone.
        returning = {"reflection": GOOD_ESSAY + "\n\nthe work of the week "
                                                "runs under all of this."}
        ok, cleaned, why = server.validate_reflection(returning, [], ["work"])
        self.assertFalse(
            ok, "floor row 14 is NOT loosened — a dismissed topic really "
                "returning still costs the whole draft")
        self.assertEqual(why, "dismissed_topic")
        self.assertIsNone(cleaned)
        # (d) AND MORPHOLOGY IS STILL CAUGHT. A full \\b…\\b word boundary
        # would let a dismissal of "layoff" sail past "layoffs" — a LOOSENING
        # of floor row 14 dressed up as a fix. The boundary is leading-only
        # for exactly this reason, and this is the arm that pins it.
        plural = {"reflection": GOOD_ESSAY + "\n\nthe layoffs thread runs "
                                             "under all of this for you too."}
        ok, cleaned, why = server.validate_reflection(plural, [], ["layoff"])
        self.assertFalse(
            ok, "dismissing 'layoff' must still catch 'layoffs' — a full "
                "word boundary here would quietly weaken the screen")
        self.assertEqual(why, "dismissed_topic")
        # (e) ⛔⛔ AND HER CHINESE DISMISSALS SURVIVE THE FIX UNCHANGED. Han,
        # kana, Hangul and full-width text has no word boundaries and a real
        # topic there is TWO characters, so both new screens are exempted for
        # it — otherwise this fix would have silently DELETED every dismissal
        # she writes in 中文, on a corpus the prompt asks the librarian to
        # quote back in mixed 中文/English. Measured before AND after.
        cjk = {"reflection": GOOD_ESSAY + "\n\n你写下我的工作很累，"
                                          "那句话就留在这里。"}
        ok, cleaned, why = server.validate_reflection(cjk, [], ["工作"])
        self.assertFalse(
            ok, "a two-character Chinese dismissal still rejects the draft — "
                "the threshold and the boundary are countable-script only")
        self.assertEqual(why, "dismissed_topic")
        # (f) THE UNMUTATED CONTROL: every draft above, with NOTHING
        # dismissed, passes. Without it the `assertTrue` arms could be
        # measuring a validator that accepts anything.
        for doc in (midword_doc, returning, plural, cjk):
            ok, cleaned, why = server.validate_reflection(doc, [], [])
            self.assertTrue(
                ok, "nothing dismissed, nothing rejected — otherwise the "
                    "arms above prove nothing about the dismissed list: "
                    + repr(why))
            self.assertIsNone(why)

    def test_a_stranger_question_key_goes_nowhere(self):
        """⚠ THE CLOSED-PROPERTIES FLAG LIVES ON THE SCHEMA, NOT ON THE
        VALIDATOR. The validator reads named keys and ignores strangers, so
        a fixture that kept emitting a question would pass silently and
        prove nothing. This says out loud what happens to one: it is
        ignored as content, and it never reaches `cleaned`."""
        ok, cleaned, why = server.validate_reflection(
            {"reflection": GOOD_ESSAY,
             "question": "does the swatch idea feel right?"}, [], [])
        self.assertTrue(ok, "a stranger key is not a rejection — the "
                            "validator reads named keys")
        self.assertNotIn("question", cleaned,
                         "and it goes NOWHERE: no consumer downstream ever "
                         "sees it, so a question can only reach her inside "
                         "the writing")

    def test_a_stranger_coda_key_goes_nowhere(self):
        """⛔⛔ 26.995-12 (D-13), AND THIS IS RESEARCH PITFALL 9 STATED AS A
        CASE. The closed-properties flag lives on the SCHEMA, never on the
        validator, which reads named keys and ignores strangers — so a
        harness that KEPT emitting `coda` after this change would sail
        straight through and every test built on it would prove nothing.

        This says out loud what happens to one: it is ignored as content and
        never reaches `cleaned`. ⚠ An off-SHAPE value is ignored too, which
        is the half that changed — while the property existed, `coda: 5` was
        a rejection; now it is simply a stranger. Both are asserted, because
        the difference between them is exactly what a reader would otherwise
        have to guess."""
        for stranger in ("you added the bit about the window seat.", 5):
            with self.subTest(coda=stranger):
                ok, cleaned, why = server.validate_reflection(
                    {"reflection": GOOD_ESSAY, "coda": stranger}, [], [])
                self.assertTrue(ok, "a stranger key is not a rejection — "
                                    "the validator reads named keys")
                self.assertIsNone(why)
                self.assertNotIn(
                    "coda", cleaned,
                    "and it goes NOWHERE: no consumer downstream ever sees "
                    "it, so what she added can only reach her woven inside "
                    "the writing")

    def test_clean_draft_passes(self):
        # 26.995-06 task 2 CONSCIOUS PIN EDIT — 2026-08-19, D-05. The case
        # was `test_clean_draft_passes_with_question_kept` and its fixture
        # carried a question the pin expected back on `cleaned`. THE NEW
        # TRUTH: no question property exists on the wire, so there is
        # nothing to keep; the question a reflection wants to ask now
        # arrives inside the writing. The stranger-key half of the old
        # claim moved to test_a_stranger_question_key_goes_nowhere, which
        # asserts it goes nowhere rather than that it comes back.
        # 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13: this fixture
        # carried `"coda": "you added the bit about the window seat."` and
        # the exact-dict compare below expected it back on `cleaned`. THE
        # NEW TRUTH: no coda property exists on the wire, so there is
        # nothing to keep. What she added arrives woven INSIDE the
        # reflection. The stranger-key half of the old claim is asserted by
        # name in test_a_stranger_coda_key_goes_nowhere.
        structured = {"reflection": GOOD_ESSAY}
        ok, cleaned, why = server.validate_reflection(
            structured, ["fence-title-secret-note"], ["layoffs"])
        self.assertTrue(ok)
        self.assertIsNone(why)
        # 26.995-05 CONSCIOUS PIN EDIT — 2026-08-19, D-06 (owner ruling
        # `All three keep a title`, the heading question). THE NEW TRUTH:
        # `cleaned` carries the reflection's RESOLVED NAME, always a
        # non-empty string. This answer supplied none, so the value here is
        # the READ-TIME FALLBACK — the old derivation, on a draft with no
        # heading, which is its first non-empty line. Stated by value
        # rather than re-derived, so the fallback's own behaviour is
        # visible in the pin instead of hiding inside a helper call.
        # THE INVERSE ASSERTION below: the key can never be absent and can
        # never be empty, because six consumers downstream read it and one
        # of them builds a filename.
        # 26.995-06 task 1a CONSCIOUS PIN EDIT — 2026-08-18, D-05 (owner
        # ruling `a-short-said-field`). THE NEW TRUTH: `cleaned` always
        # carries a `said` key — the room's spoken reply for this turn, or
        # None when it had nothing to report. This answer supplied none, so
        # the value here is None and the caller falls back to the
        # acknowledgment. Stated by value, in an EXACT-DICT compare, so a
        # field silently added or lost fails right here.
        self.assertEqual(cleaned,
                         {"reflection": GOOD_ESSAY,
                          "name": "you kept returning to the loom this "
                                  "week. \"the selvedge fina",
                          "said": None})
        self.assertNotIn("question", cleaned,
                         "no question rides `cleaned` any more — the "
                         "exact-dict compare above already says so, and "
                         "this says WHY, so a later reader does not put "
                         "the key back to be tidy")
        self.assertIn("said", cleaned,
                      "the key is never absent — a consumer that has to "
                      "guess whether the validator looked is a consumer "
                      "that will guess wrong")
        self.assertTrue(cleaned["name"],
                        "the name is NEVER absent and NEVER empty — the "
                        "write-back filename is built from it")

    # -- 26.87-01 Task 3 (RED): D-15's exact-title reject -------------------
    # Landed RED-FIRST: `prior_titles` is a keyword validate_reflection does
    # not carry yet and `title_reuse` is a category token it cannot yet
    # return — plan 26.87-10 turns these green. 26.7-uat's owner finding is
    # the reason the reject exists at all: every saved book came back spined
    # "the thread", because the model copied the skeleton example's heading
    # and _reflection_book_title lifts the first heading as the spine. The
    # prompt's "title of its own" nudge (pinned above) is the soft half;
    # this is the hard one. ONE notion of "title" throughout — the expected
    # value is always server._reflection_book_title(draft), never a second
    # hand-rolled idea of what a title is.

    def test_exact_title_reuse_rejects_case_and_space_folded(self):
        draft = "# the thread\n\n" + GOOD_ESSAY
        title = server._reflection_book_title(draft)
        self.assertEqual(title, "the thread",
                         "the spine title is the draft's first heading — "
                         "the shipped notion, reused verbatim here")
        # the prior collection is the D-14 record's titles, handed in as
        # data: the same title, differently cased and padded, is the SAME
        # title. Exact-match after folding — never a fuzzy near-match
        # (D-15 hard-rejects reuse; opening VARIATION stays a nudge).
        for prior in ("the thread", "The Thread", "  THE THREAD  ",
                      "the  thread"):
            ok, cleaned, why = server.validate_reflection(
                {"reflection": draft, "coda": None, "question": None},
                [], [], prior_titles=[prior])
            self.assertFalse(ok, f"reused title accepted: {prior!r}")
            self.assertIsNone(cleaned)
            self.assertEqual(why, "title_reuse")

    def test_title_reuse_reason_is_a_category_token_never_the_title(self):
        # validate_reflection's own docstring is explicit: `why` is a
        # category token for the fail-visible counter, NEVER the content —
        # a rejected draft may quote pool text and is never logged. The
        # title is lifted from the draft, so it is exactly that content.
        draft = "# 私密的手记 the pearl story\n\n" + GOOD_ESSAY
        title = server._reflection_book_title(draft)
        ok, cleaned, why = server.validate_reflection(
            {"reflection": draft, "coda": None, "question": None},
            [], [], prior_titles=[title])
        self.assertFalse(ok)
        self.assertIsNone(cleaned)
        self.assertEqual(why, "title_reuse",
                         "the category token ALONE — no title, no draft "
                         "text, nothing that could be logged")
        self.assertNotIn(title, why)
        self.assertNotIn(title.lower(), why.lower())
        self.assertNotIn("pearl", why.lower())

    def test_fresh_title_and_empty_prior_list_never_reject(self):
        fresh = "# the small table by the window\n\n" + GOOD_ESSAY
        prior = server._reflection_book_title("# the thread\n\n" + GOOD_ESSAY)
        ok, cleaned, why = server.validate_reflection(
            {"reflection": fresh, "coda": None, "question": None},
            [], [], prior_titles=[prior])
        self.assertTrue(ok, "a title of its own passes the same predicate")
        self.assertIsNone(why)
        self.assertEqual(cleaned["reflection"], fresh)
        # an empty record (the first-ever reflection) can never reject —
        # nothing has been titled yet, so nothing can be a reuse.
        for empty in ([], (), None):
            ok2, cleaned2, why2 = server.validate_reflection(
                {"reflection": "# the thread\n\n" + GOOD_ESSAY,
                 "coda": None, "question": None},
                [], [], prior_titles=empty)
            self.assertTrue(ok2, f"empty prior record rejected: {empty!r}")
            self.assertIsNone(why2)
            self.assertIsNotNone(cleaned2)

    def test_new_prose_surfaces_pass_the_clinical_screen(self):
        # 26.87-10 (D-35.3): the screen that keeps the librarian out of
        # clinical territory is run over BOTH prose surfaces this phase
        # changed, in the same commit that changed them — loosening a
        # prompt must not blur the line the product deliberately sits on.
        # BOTH RESULTS ARE RECORDED, including the one that trips.
        prompt = server.LIBRARIAN_REFLECT_PROMPT
        prohibition = "no clinical or diagnostic language"
        self.assertIn(prohibition, prompt,
                      "the role boundary is still stated in the prompt")
        # Result 1, recorded honestly: the prompt DOES trip its own screen,
        # for exactly one reason — it NAMES the vocabulary it forbids. That
        # is the prohibition clause and nothing else, which is what the
        # second assertion proves.
        self.assertTrue(server._names_clinical_claim(prompt),
                        "the prompt trips the screen only because it names "
                        "what it bans — recorded, never hidden")
        self.assertFalse(
            server._names_clinical_claim(prompt.replace(prohibition, "")),
            "every OTHER clause — including the three loosened skeletons "
            "and their closing moves — is clean of clinical vocabulary")
        # Result 2: the 26.87-05 capability-gap refusal, clean outright.
        self.assertFalse(
            server._names_clinical_claim(server.CONFIG_NOT_A_CAPABILITY_MSG),
            "the capability-gap line carries no clinical vocabulary")
        self.assertFalse(
            server._names_no_push(server.CONFIG_NOT_A_CAPABILITY_MSG),
            "and none of the law-3 absence vocabulary either")


# ---------------------------------------------------------------------------
# 26.995-06 task 1a: THE SPOKEN REPLY (D-05; owner ruling 2026-08-18,
# option `a-short-said-field`)
# ---------------------------------------------------------------------------


class SpokenReplyTest(unittest.TestCase):
    """The librarian answers a refine turn IN ITS OWN WORDS — a short line
    it returns per turn, separate from the reflection and from any
    question. HER RULING, 2026-08-18 (26.995-COPY § C-2), chosen over one
    fixed line, a small rotated set, and saying nothing at all.

    ⛔ THE COLLISION THIS CLASS EXISTS TO DRIVE, AND IT IS WHY THE CLASS
    EXISTS RATHER THAN A SINGLE HAPPY-PATH ASSERTION. The reply is, BY
    CONSTRUCTION, the librarian describing what it just did —
    `_reads_as_process_narration` refuses a REFLECTION for exactly that.
    If the reply were swept into that screen "for consistency", every
    refine turn would be refused and regenerated, at a paid call each,
    and it would surface as the MODEL misbehaving rather than as a screen
    aimed at the wrong text. So the screen stays on the reflection, and
    this is proven BY DRIVING IT rather than by reading the code: a reply
    that the screen would refuse still completes, and — in the SAME case
    — a reflection carrying those same words is still refused. That
    second half is the unmutated control: if it ever goes green the
    screen has been weakened, which is the real risk of this change.

    RED, driven against HEAD (`git stash`-free: the suite was run against
    the pre-change tree) before a line of the implementation existed:

        KeyError: 'said'
        AssertionError: False is not true : the fixture must actually
                        trip the screen

    ⚠ THE PROHIBITION THAT GOVERNS THIS FEATURE: an agent chose no
    wording here. She chose a MECHANISM — the model writes the reply per
    turn — so what must never appear is a fixed phrasing, a rotated set,
    or a template. The strings below are TEST FIXTURES and reach no
    surface; the only shipped sentence on this path is
    LIBRARIAN_REFINE_ACK, which is the pre-existing fallback and is
    unchanged."""

    # A reply that trips the narration screen when handed to it directly.
    # It has to be a reply the room might plausibly write, or the case
    # proves something about an absurd string instead of about the field.
    NARRATION_REPLY = ("wrote the ferry into the middle — it changed "
                       "where the whole thing lands.")
    PLAIN_REPLY = "the ferry's in there now, near the top."

    def test_a_reply_that_trips_the_narration_screen_still_completes(self):
        # (a) THE FIXTURE'S OWN NON-VACUITY, asserted first: this string
        # really would be refused if it were scanned. Without this line a
        # benign string would pass either way and the case would prove
        # nothing at all.
        self.assertTrue(
            server._reads_as_process_narration(self.NARRATION_REPLY),
            "the fixture must actually trip the screen, or the rest of "
            "this case is vacuous")
        ok, cleaned, why = server.validate_reflection(
            {"reflection": GOOD_ESSAY, "said": self.NARRATION_REPLY},
            [], [])
        self.assertTrue(ok,
                        "the reply is NOT scanned by the reflection's "
                        "narration screen — it exists to describe what "
                        "just changed, which that screen refuses by "
                        "design")
        self.assertIsNone(why)
        self.assertEqual(cleaned["said"], self.NARRATION_REPLY,
                         "and it reaches the caller intact, so the chat "
                         "can speak it")
        # (b) ⛔ THE UNMUTATED CONTROL, deliberately in the SAME case so a
        # future reader cannot delete one half without seeing the other:
        # the screen still guards the REFLECTION, at the same words.
        ok2, cleaned2, why2 = server.validate_reflection(
            {"reflection": self.NARRATION_REPLY}, [], [])
        self.assertFalse(ok2, "the narration screen has been WEAKENED — a "
                              "reflection that reads as a work report must "
                              "still be refused")
        self.assertIsNone(cleaned2)
        self.assertEqual(why2, "meta_narration")

    def test_the_reply_is_scanned_like_every_other_generated_field(self):
        """It is kept out of the reflection's PROSE screens and out of
        nothing else. The fence and law 3 still bind it: it names nothing
        fenced, and it references no absence or elapsed time."""
        cases = (
            (["fence-title-secret-note"],
             "kept the fence-title-secret-note line where it was.",
             "fenced_title"),
            ([], "put back what you wrote while you were away.",
             "no_push"),
            ([], "named the coping mechanism you described.",
             "clinical_claim"),
        )
        for fenced, said, token in cases:
            ok, cleaned, why = server.validate_reflection(
                {"reflection": GOOD_ESSAY, "said": said}, fenced, [])
            self.assertFalse(ok, f"accepted a reply that must reject: "
                                 f"{said!r}")
            self.assertIsNone(cleaned)
            self.assertEqual(why, token, f"wrong token for {said!r}")
        # ⛔ THE UNMUTATED CONTROL: one benign reply, same draft, same
        # fenced list, passes all three screens. Without it every
        # assertion above passes against a validator that refuses every
        # reply there is.
        ok, cleaned, why = server.validate_reflection(
            {"reflection": GOOD_ESSAY, "said": self.PLAIN_REPLY},
            ["fence-title-secret-note"], [])
        self.assertTrue(ok, "the control reply must pass — otherwise the "
                            "three rejections above prove nothing")
        self.assertIsNone(why)
        self.assertEqual(cleaned["said"], self.PLAIN_REPLY)

    def test_an_off_shape_reply_is_a_shape_rejection(self):
        for bad in (5, [], {}, True, 1.5):
            ok, cleaned, why = server.validate_reflection(
                {"reflection": GOOD_ESSAY, "said": bad}, [], [])
            self.assertFalse(ok, f"accepted said={bad!r}")
            self.assertIsNone(cleaned)
            self.assertEqual(why, "shape")

    def test_absent_or_empty_resolves_to_nothing_never_to_a_blank_line(self):
        """⚠ THIS FIELD'S 'nothing' IS NOT THE NAME'S 'nothing', and the
        difference is deliberate. `name` is fail-closed on a present-but-
        blank value because absence there is the ONE spelling of "no name
        of my own" and a second spelling would turn a shape check into a
        fallback. Here the fallback IS the design — a generation turn has
        no change to report, and a turn whose reply is missing or empty
        must show the acknowledgment rather than a blank librarian line —
        so this field takes `coda`'s nullable shape, not `name`'s."""
        for value in (None, "", "   ", "\n\t "):
            structured = {"reflection": GOOD_ESSAY, "said": value}
            ok, cleaned, why = server.validate_reflection(
                structured, [], [])
            self.assertTrue(ok, f"said={value!r} must be accepted, not "
                                f"refused")
            self.assertIsNone(cleaned["said"],
                              f"said={value!r} must resolve to nothing, so "
                              f"the caller falls back rather than showing "
                              f"an empty line")
        # absent entirely — everything already on her disk, and every
        # generation turn
        ok, cleaned, why = server.validate_reflection(
            {"reflection": GOOD_ESSAY}, [], [])
        self.assertTrue(ok)
        self.assertIn("said", cleaned,
                      "the key is always present, so no consumer has to "
                      "guess whether it looked")
        self.assertIsNone(cleaned["said"])
        # ⛔ THE UNMUTATED CONTROL: a real reply is CARRIED, never
        # flattened. Without it every assertion above passes against a
        # validator that answers None for every reply there is.
        ok, cleaned, why = server.validate_reflection(
            {"reflection": GOOD_ESSAY, "said": self.PLAIN_REPLY}, [], [])
        self.assertTrue(ok)
        self.assertEqual(cleaned["said"], self.PLAIN_REPLY)


# ---------------------------------------------------------------------------
# 26.87-10: the variation ledger, the shape tokens, the recorded model, and
# the per-turn document's assembly (D-14 / D-26 / D-27 / D-28.2 / D-32)
# ---------------------------------------------------------------------------


class VariationLedgerTest(unittest.TestCase):
    """librarian/reflections.json is the call's MEMORY — the file that makes
    "don't repeat yourself" enforceable as DATA rather than as an
    instruction a stateless call cannot act on."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def _write_raw(self, data):
        d = self.lib / "librarian"
        d.mkdir(parents=True, exist_ok=True)
        path = d / "reflections.json"
        if isinstance(data, bytes):
            path.write_bytes(data)
        else:
            path.write_text(data, encoding="utf-8")

    def test_load_is_fail_open_in_every_direction(self):
        self.assertEqual(study_lib.load_reflections("/nonexistent"),
                         {"reflections": []},
                         "a missing ledger is an empty history, never an "
                         "error")
        self._write_raw(b"\x00\x01 not json at all \xff\xfe")
        self.assertEqual(study_lib.load_reflections(self.lib),
                         {"reflections": []},
                         "a file of random bytes reads as empty")
        self._write_raw('{"reflections": "not a list"}')
        self.assertEqual(study_lib.load_reflections(self.lib),
                         {"reflections": []}, "off-shape reads as empty")
        self._write_raw('["a bare list"]')
        self.assertEqual(study_lib.load_reflections(self.lib),
                         {"reflections": []}, "a bare list reads as empty")

    def test_cap_is_a_named_constant_and_the_file_states_its_own_rule(self):
        self.assertIsInstance(study_lib.REFLECTION_TITLE_CAP, int)
        self.assertGreater(study_lib.REFLECTION_TITLE_CAP, 0,
                           "the read is capped at a STATED number — a "
                           "ledger with no cap constant near it is the "
                           "warning sign")
        study_lib.save_reflections(self.lib, [])
        raw = json.loads((self.lib / "librarian" / "reflections.json")
                         .read_text(encoding="utf-8"))
        self.assertIn("passed drafts as well as saved ones", raw["note"],
                      "the file's own one-line header states the "
                      "surprising half of the design")
        self.assertEqual(raw["reflections"], [])

    def test_memory_is_closed_sessions_only_newest_first_and_deduped(self):
        study_lib.save_reflections(self.lib, [
            {"title": "the thread", "shape": "quote-first",
             "outcome": "saved", "model": "claude-opus-4-5", "ms": 1},
            {"title": "the thread", "shape": "quote-first",
             "outcome": "passed", "model": None, "ms": 2},
            {"title": "small repairs", "shape": "scene-first",
             "outcome": "passed", "model": None, "ms": 3},
            {"title": "the open one", "shape": "claim-first",
             "outcome": None, "model": None, "ms": 4},
        ])
        memory = study_lib.reflection_memory(self.lib)
        self.assertEqual(memory["titles"], ["small repairs", "the thread"],
                         "newest first, deduped — and a PASSED draft counts "
                         "exactly like a saved one")
        self.assertNotIn("the open one", memory["titles"],
                         "an UNSTAMPED record belongs to the session open "
                         "right now: its draft is one essay being revised, "
                         "not a repeat, and feeding its own title back "
                         "would make refine turns re-litigate the title")
        self.assertEqual(memory["shapes"], ["scene-first", "quote-first"])

    def test_memory_read_is_capped(self):
        study_lib.save_reflections(self.lib, [
            {"title": "title-%d" % i, "shape": "claim-first",
             "outcome": "saved", "model": None, "ms": i}
            for i in range(study_lib.REFLECTION_TITLE_CAP + 25)])
        titles = study_lib.reflection_memory(self.lib)["titles"]
        self.assertEqual(len(titles), study_lib.REFLECTION_TITLE_CAP)
        self.assertEqual(titles[0],
                         "title-%d" % (study_lib.REFLECTION_TITLE_CAP + 24),
                         "the cap keeps the NEWEST titles")

    def test_shape_derivation_is_a_pure_fold_over_the_table(self):
        cases = {
            '"the loom finally clicked," you wrote.': "quote-first",
            "「别忘了」你写过。": "quote-first",
            "what were you keeping it for?": "question-first",
            "when the light went out, you kept going.": "scene-first",
            "那天下午你把线收好了。": "scene-first",
            "the loom finally clicked.": "object-first",
            "这一页你写了三次。": "object-first",
            "you wrote it twice, and then again.": "claim-first",
            "": "claim-first",
        }
        for line, token in cases.items():
            self.assertEqual(study_lib.derive_opening_shape(line), token,
                             "opening %r" % (line,))
            self.assertIn(token, study_lib.OPENING_SHAPE_TOKENS)
        self.assertEqual(len(study_lib.OPENING_SHAPE_TOKENS), 5,
                         "a small CLOSED vocabulary — lossy on purpose, "
                         "taken over showing the model a prior opening "
                         "SENTENCE (a proven anchoring channel)")

    def test_opening_line_skips_the_title_heading(self):
        draft = "# the thread\n\n\"the loom clicked,\" you wrote."
        self.assertEqual(study_lib.reflection_opening_line(draft),
                         '"the loom clicked," you wrote.')
        self.assertEqual(
            study_lib.derive_opening_shape(
                study_lib.reflection_opening_line(draft)),
            "quote-first")

    def test_recorded_model_reads_the_measured_key_path(self):
        # 26.87-03, the owner-approved real-CLI dry run: there is NO
        # top-level `model` key; the path is modelUsage, a dict KEYED BY
        # THE MODEL ID whose value carries the stable canonicalModel.
        envelope = {"modelUsage": {
            "claude-haiku-4-5-20251001": {
                "inputTokens": 10, "canonicalModel": "claude-haiku-4-5"}}}
        self.assertEqual(server._envelope_model(envelope),
                         "claude-haiku-4-5")
        self.assertEqual(
            server._envelope_model(
                {"modelUsage": {"claude-haiku-4-5-20251001": {}}}),
            "claude-haiku-4-5-20251001",
            "no canonicalModel: the dated key itself is the honest record")
        for blind in ({}, {"modelUsage": {}}, {"modelUsage": None},
                      {"modelUsage": []}, {"model": "opus"},
                      {"modelUsage": {"a": {}, "b": {}}}, None, "x"):
            self.assertIsNone(server._envelope_model(blind),
                              "fails open to a NULL record rather than "
                              "guessing: %r" % (blind,))


class ReflectionDocumentAssemblyTest(unittest.TestCase):
    """The per-turn document: pool-first key order, the memory as DATA, and
    the anchors gated by the evidence floor (D-26/D-27/D-32)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def _commented(self, i, **kw):
        it = make_item(self.lib, i, state="blessed", folder="journal",
                       tags=["loom"], body="b", **kw)
        it["comments"] = [{"at": "2026-07-20T09:00:00+00:00",
                           "text": "i kept the selvedge even"}]
        return it

    def test_new_key_sits_AFTER_the_pool_key(self):
        variation = {"vary_your_entry_point": "…", "shapes_used_lately": [],
                     "titles_already_used": []}
        doc = server._reflection_turn_doc({"bodies": []}, variation, None,
                                          draft=None, chat=[])
        self.assertEqual(list(doc), ["pool", "variation", "draft", "chat"],
                         "the serialized key sequence puts the memory AFTER "
                         "the pool — the stable cache prefix")
        blob = json.dumps(doc, ensure_ascii=False)
        self.assertTrue(blob.startswith('{"pool":'),
                        "pool-FIRST survives the addition")
        with_identity = server._reflection_turn_doc(
            {"bodies": []}, variation, {"themes": ["loom"]}, None, [])
        self.assertEqual(list(with_identity),
                         ["pool", "variation", "identity", "draft", "chat"])
        # 26.995-04 (D-14): the Evening line joins the same order — EXTENDING
        # this pin rather than adding a second one, because two cases pinning
        # one key order are two things to keep in step and one of them will
        # eventually be the stale one.
        with_evening = server._reflection_turn_doc(
            {"bodies": []}, variation, {"themes": ["loom"]}, None, [],
            evening="there is a lot here — 24 pieces.")
        self.assertEqual(
            list(with_evening),
            ["pool", "evening", "variation", "identity", "draft", "chat"],
            "the Evening line sits immediately after the pool; the pool is "
            "still the stable cache prefix")
        # 26.995-11 (D-19/D-20): the memory joins the SAME pin, extending it
        # for the same reason 26.995-04 gave — two cases pinning one key order
        # are two things to keep in step and one of them is eventually stale.
        with_memory = server._reflection_turn_doc(
            {"bodies": []}, variation, {"themes": ["loom"]}, None, [],
            evening="there is a lot here — 24 pieces.",
            memory={"her_own_sentences": [{"text": "it missed",
                                           "about": "the ferry"}],
                    "reflections_that_landed": [],
                    "its_own_writing": []})
        self.assertEqual(
            list(with_memory),
            ["pool", "evening", "memory", "variation", "identity", "draft",
             "chat"],
            "⛔ THE MEMORY SITS AFTER THE POOL. The key order is a deliberate "
            "STABLE CACHE PREFIX: a key ahead of the pool changes that prefix "
            "on every turn and pays full uncached input on every refine — a "
            "correctness-neutral change that quietly multiplies the phase's "
            "cost. It sits after the Evening line too, which is an account OF "
            "the pool and belongs beside it")
        self.assertTrue(
            json.dumps(with_memory, ensure_ascii=False).startswith(
                '{"pool":'),
            "pool-FIRST survives the memory's addition")
        self.assertNotIn(
            "memory",
            server._reflection_turn_doc({"bodies": []}, variation, None, None,
                                        [], memory=None),
            "⛔ and BELOW THE EVIDENCE FLOOR THE KEY IS ABSENT, not empty and "
            "not null — the room is told NOTHING rather than told that it "
            "remembers nothing about her. The absence IS the instruction, the "
            "shipped identity-block precedent this copies by name")
        self.assertEqual(
            list(server._reflection_turn_doc(
                {"bodies": []}, variation, {"themes": ["loom"]}, None, [],
                evening="there is a lot here — 24 pieces.", memory=None)),
            ["pool", "evening", "variation", "identity", "draft", "chat"],
            "and the rest of the order is exactly what it was before this "
            "plan — a silent memory changes nothing about her document")
        self.assertEqual(
            list(server._reflection_turn_doc(
                {"bodies": []}, variation, None, None, [], evening=None)),
            ["pool", "variation", "draft", "chat"],
            "and with no line the document is byte-identical to the shipped "
            "shape — the addition costs a silent evening nothing at all")

    def test_the_ledger_still_writes_the_token_the_document_no_longer_reads(
            self):
        """⛔⛔ INVERTED IN PLACE 2026-08-19 (26.995-07, D-15 + D-16), AND
        THE INVERSION IS THE WHOLE POINT.

        This case was `test_the_memory_rides_as_tokens_and_titles_never_a_
        sentence`. It asserted that the derived opening TOKEN rides in the
        per-turn document (`assertIn("scene-first", blob)`) and that the
        variation block LEADS with the positive `vary_your_entry_point`
        frame. D-15 deletes both: the vary-your-entry-point sentence AND the
        `shapes_used_lately` list it depended on, in one change, because
        deleting one without the other leaves either a sentence pointing at
        nothing or data nobody reads.

        ⛔ WHY THE DELETION WAS CHEAP, and why it is not a loss: every
        opening matching none of the five markers collapses into the
        `claim-first` default — INCLUDING the letter greeting #18 legalised
        — and the token list had no recency window and no cap: it said
        "lately" and meant EVER.

        ⛔⛔ AND THIS CASE IS NOW THE CONTROL THAT SEPARATES A DELETION FROM
        AN AMPUTATION. D-16 keeps the LEDGER recording the opening token,
        unread — it is free, and it is the only way anyone will ever be able
        to check whether shapes actually spread out. So the assertion below
        is in TWO directions in ONE case: the token is still DERIVED AND
        WRITTEN, and it is NO LONGER IN THE DOCUMENT. Without the first half
        the second would pass just as happily for a change that ripped the
        whole recording out."""
        opening = "in the same chair, three of these were written."
        token = study_lib.derive_opening_shape(opening)
        self.assertEqual(token, "scene-first",
                         "the derivation itself is untouched and still "
                         "answers by value — a mutant that made it return "
                         "None would make every assertion below vacuous")
        study_lib.save_reflections(self.lib, [
            {"title": "the window seat",
             "shape": token,
             "outcome": "saved", "model": None, "ms": 1}])
        # HALF ONE — D-16: the WRITE survived the READ's deletion. The
        # ledger on disk still carries the token, and the memory reader
        # still computes it.
        on_disk = study_lib.load_reflections(self.lib)["reflections"]
        self.assertEqual(on_disk[0]["shape"], "scene-first",
                         "the LEDGER still records the opening token "
                         "(D-16) — only the emission stopped")
        self.assertEqual(
            study_lib.reflection_memory(self.lib)["shapes"], ["scene-first"],
            "and study_lib.reflection_memory still COMPUTES the token "
            "list: the reader was not deleted, its one consumer was")
        # HALF TWO — D-15: nothing about openings reaches the model.
        variation = server._reflection_variation(self.lib)
        blob = json.dumps(
            server._reflection_turn_doc({"bodies": []}, variation, None,
                                        None, []),
            ensure_ascii=False)
        self.assertIn("the window seat", blob,
                      "prior NAMES ride verbatim — bounded, observable, "
                      "and deterministically rejected downstream")
        self.assertNotIn("scene-first", blob,
                         "THE INVERSE ASSERTION: the opening token is GONE "
                         "from the document (D-15). The room is given no "
                         "instruction about openings at all, and that is "
                         "the ruling rather than an omission")
        self.assertNotIn(opening, blob,
                         "no fluent prior opening SENTENCE is ever in the "
                         "model's context — there is nothing to copy")
        self.assertEqual(list(variation), ["titles_already_used"],
                         "ONE key by value: the vary-your-entry-point "
                         "sentence and the token list went together, and a "
                         "count asserted by value is what catches either "
                         "half creeping back alone")
        self.assertNotIn("shape you have not been opening",
                         server.LIBRARIAN_REFLECT_PROMPT,
                         "and the sentence that depended on them is gone "
                         "from the prompt in the SAME change — a coupled "
                         "deletion lands together or it does not land")

    def test_anchors_present_above_the_floor_and_absent_below_it(self):
        thin = make_store(self.lib, [make_item(self.lib, 1, state="blessed",
                                               body="b")])
        thin_anchors = study_lib.derive_identity_anchors(thin)
        self.assertIsNone(server._reflection_identity_block(thin_anchors),
                          "below the evidence floor the block is None, so "
                          "the caller omits the key ENTIRELY (D-32)")
        rich = make_store(self.lib, [self._commented(2), self._commented(3),
                                     self._commented(4)])
        rich_anchors = study_lib.derive_identity_anchors(rich)
        block = server._reflection_identity_block(rich_anchors)
        self.assertIsNotNone(block, "above the floor the anchors ride")
        self.assertTrue(block["themes"])
        doc_below = server._reflection_turn_doc(
            {"bodies": []}, {"titles_already_used": []},
            server._reflection_identity_block(thin_anchors), None, [])
        self.assertNotIn("identity", doc_below,
                         "the anchors key is ABSENT from the document, not "
                         "present-and-empty")
        doc_above = server._reflection_turn_doc(
            {"bodies": []}, {"titles_already_used": []}, block, None, [])
        self.assertIn("identity", doc_above)

    def test_missing_suggestions_file_yields_an_empty_label_map(self):
        labels = server._resolved_shelf_labels(self.lib)
        self.assertEqual(labels, {},
                         "load_suggestions is fail-open, so a deleted "
                         "librarian folder yields NO labels — the "
                         "first-run case the tripwire exists for")
        store = make_store(self.lib, [make_item(self.lib, 1, state="blessed",
                                                body="b")])
        payload = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None, shelves=labels,
            anchors=None)
        self.assertEqual(payload["counts"].get("heavy-capped"), 0,
                         "the payload still builds and the cap stays "
                         "declared — fail-visible means always visible")


class HerMemoryReadTimeFenceTest(unittest.TestCase):
    """26.995-11 (T-26.995-02): THE SECOND FENCE OBLIGATION OF THE PHASE, and
    the one nobody was watching.

    ⛔ HER STORED SENTENCES HAVE NEVER PASSED THROUGH ANY FENCE PREDICATE.
    Everything else that reaches a prompt is built by the ONE audited pool
    builder every other case in this file exercises. Her chat is not: plan 10
    wrote it straight to disk from the session file, and plan 11 reads it back
    into the reflection document. Her own words are trusted as HERS, and that
    is precisely the reason — she can perfectly well type the name of a note
    she has since marked never-show, and reading it back would carry that
    title into a cloud payload through the one path no screen had run on.
    Law 5 makes that a P0.

    ⚠ HOW THESE WERE DRIVEN RED, stated before them rather than claimed after:
    the block shipped in 26.995-11 task 1 with NO screen at all, and the
    unscreened read was run and observed — the fenced title reached the block
    and the run is recorded in task 2's commit body. Every case below then
    went from that state to green. The unmutated control is the whole rest of
    this suite, which this class does not touch.

    ⛔ These cases build the fenced-title corpus with the SHIPPED
    `server._fenced_titles`, never a hand-written list, so what they screen
    against is exactly what the validator is given."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.lib = Path(self._tmp.name) / "library"
        (self.lib / "items").mkdir(parents=True)

    def _store_with_fenced_note(self):
        """A store holding ONE never-show note whose title is distinctive
        enough to clear the fence's own noise threshold."""
        fenced = make_item(self.lib, 1, state="never_show", body=FENCE_BODY,
                           title=FENCE_TITLE + "-HER-MEMORY.md")
        ordinary = make_item(self.lib, 2, state="blessed", body="b")
        return make_store(self.lib, [fenced, ordinary])

    def test_her_own_sentence_naming_a_fenced_title_is_held_back(self):
        store = self._store_with_fenced_note()
        titles = server._fenced_titles(store)
        self.assertTrue(
            titles,
            "the corpus is non-empty, or every assertion below would be "
            "vacuous — the instrument is checked before its reading is")
        study_lib.save_her_sentences(self.lib, [
            {"text": "the loom bit landed", "about": "the loom", "ms": 1},
            {"text": "it read like " + FENCE_TITLE + "-HER-MEMORY read",
             "about": "the loom", "ms": 1},
            {"text": "the ferry bit did not", "about": "the loom", "ms": 1}])
        block = server._reflection_her_memory(self.lib, store, titles)
        self.assertEqual(
            len(block["her_own_sentences"]), 2,
            "the SURVIVING count by value — the other two sentences of hers "
            "are untouched. A screen that emptied the block would fail here")
        self.assertNotIn(
            FENCE_TITLE, json.dumps(block, ensure_ascii=False),
            "and the EXCLUDED one by value: the fenced note's title is "
            "nowhere in the serialized block. ⛔ This is the read T-26.995-02 "
            "names, and it is screened against the SAME list the validator "
            "gets, resolved at the same route off the same snapshot")

    def test_the_memory_read_calls_the_shipped_predicate(self):
        """⛔ CALLED, NEVER RE-IMPLEMENTED. A second title test would be a
        second definition of what "names a fenced title" means, and the two
        would drift — the substring case this fence family fought for is
        exactly the kind of thing a second implementation loses."""
        src = inspect.getsource(server._reflection_her_memory)
        self.assertIn(
            "_names_fenced_title(", src,
            "the memory read calls the shipped predicate by name")
        self.assertNotIn(
            ".lower() in ", src,
            "and does NOT roll its own case-folded substring test beside it")

    def test_an_unresolvable_fenced_list_yields_no_memory(self):
        """⛔ FAIL CLOSED, and the direction is the assertion. An
        unresolvable list must never read as 'nothing is fenced'."""
        store = self._store_with_fenced_note()
        study_lib.save_her_sentences(self.lib, [
            {"text": "the loom bit landed", "about": "the loom", "ms": 1},
            {"text": "the ferry bit did not", "about": "the loom", "ms": 1}])
        self.assertIsNone(
            server._reflection_her_memory(self.lib, store, None),
            "no list, no memory — a memory is never worth a leak")
        self.assertIsNotNone(
            server._reflection_her_memory(
                self.lib, store, server._fenced_titles(store)),
            "⛔ THE OTHER SIDE: with the list resolved the memory rides, so "
            "fail-closed is distinguishable from a builder that never "
            "returns anything at all")


class EveningLineTest(unittest.TestCase):
    """26.995-04 (D-14 / D-35 / D-38): the EVENING LINE — one plain sentence
    naming only what stands out about tonight's pool, and NOTHING AT ALL on an
    unremarkable evening.

    ⚠ HOW EVERY CASE HERE WAS DRIVEN RED, stated before any of them was
    written. The whole class was authored against a `study_lib` that had no
    `derive_evening_line` at all — 26.995-RESEARCH verified by exhaustive grep
    that no Evening line existed anywhere in `server.py` or `study_lib.py`, so
    on the pre-change tree every case below errors with
    `AttributeError: module 'study_lib' has no attribute
    'derive_evening_line'`. That is this repo's own intended red for a contract
    written before its code, and the commit body records the run.

    ⚠ THE UNMUTATED CONTROL is
    `test_evening_unremarkable_pool_is_silent_the_unmutated_control`: a pool
    crossing NO threshold must answer None. Without it every threshold case
    below would pass just as happily against a derivation that emitted a
    sentence unconditionally — the always-True failure mode, which is exactly
    as fatal as always-False and is the one a one-directional suite misses.

    ⚠ EVERY COUNT IS HAND-COMPUTED HERE, from arithmetic this suite states,
    and never read back out of the production function. Row counts are built
    from an explicit list whose length is asserted BY VALUE in the same case;
    day spreads are exact whole multiples of `_DAY_MS`; text shares are built
    from strings whose lengths are asserted BY VALUE before they are used.

    ⛔ THE THRESHOLDS ARE INCLUSIVE AT THEIR OWN BOUNDARY and both sides of
    every one of them is driven in the same case — 4 and 5, 20 and 19, 45 and
    46, 365 and 364, 60% and 59%, and the agent's own 50% and 40%."""

    _DAY_MS = 86400000

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    # -- hand-built pools. Deliberately plain dicts: the whole point of the
    # derivation is that it reads the pool structure and NOTHING else, so the
    # cases hand it a structure and no store, no library root, no notebook.

    def _body(self, i, text="x", comments=()):
        return {"id": "b%d" % i, "title": "title %d" % i, "text": text,
                "comments": [dict(c) for c in comments]}

    def _meta(self, i, created_ms=None, comments=()):
        return {"id": "m%d" % i, "title": "title %d" % i,
                "source": "obsidian-vault", "type": "text",
                "created_ms": created_ms, "tags": [],
                "comments": [dict(c) for c in comments]}

    def _pool(self, bodies=(), meta_rows=()):
        return {"meta_rows": list(meta_rows), "bodies": list(bodies),
                "counts": {"bodies-capped": 0, "bodies-unreadable": 0}}

    def _plain_rows(self, n):
        """n bodies of exactly one character each and no comments: no dates,
        no own writing, and a text share of 1/n per row — so the ONLY fact
        such a pool can ever fire is the piece count."""
        rows = [self._body(i, text="x") for i in range(n)]
        self.assertEqual(len(rows), n, "the case builds the count it claims")
        return rows

    # -- fact 1: how many pieces --------------------------------------------

    def test_evening_piece_count_fires_at_four_and_at_twenty_by_value(self):
        four = self._plain_rows(4)
        five = self._plain_rows(5)
        nineteen = self._plain_rows(19)
        twenty = self._plain_rows(20)

        thin = study_lib.derive_evening_line(self._pool(bodies=four))
        self.assertIsNotNone(thin, "4 pieces is notable — the threshold is "
                                   "INCLUSIVE at its own boundary")
        self.assertIn("4 pieces", thin)
        self.assertIsNone(
            study_lib.derive_evening_line(self._pool(bodies=five)),
            "5 pieces is the far side of the same threshold and nothing else "
            "in this pool is notable, so the room is told nothing at all")

        heavy = study_lib.derive_evening_line(self._pool(bodies=twenty))
        self.assertIsNotNone(heavy, "20 pieces is notable, inclusively")
        # ⛔ THE HEAVY WORDING IS PINNED VERBATIM. 26.995-CONTEXT D-38 quotes
        # this sentence as the thing the short example (plan 07) must be seen
        # answering; an example written against a paraphrase answers nothing.
        self.assertIn("there is a lot here — 20 pieces", heavy)
        self.assertIsNone(
            study_lib.derive_evening_line(self._pool(bodies=nineteen)),
            "19 pieces is the far side of the heavy threshold")

    # -- fact 2: how spread out in time -------------------------------------

    def _dated_pool(self, days_apart):
        """Ten rows — deliberately BETWEEN the two piece thresholds, so the
        count fact cannot fire and the spread is the only thing under test —
        two of which carry a date exactly `days_apart` whole days apart."""
        base = 1_700_000_000_000
        rows = [self._meta(0, created_ms=base),
                self._meta(1, created_ms=base + days_apart * self._DAY_MS)]
        rows += [self._meta(i) for i in range(2, 10)]
        self.assertEqual(len(rows), 10,
                         "between 4 and 20: the piece count stays silent")
        return self._pool(meta_rows=rows)

    def test_evening_time_spread_fires_at_45_and_365_and_not_a_day_past(self):
        tight = study_lib.derive_evening_line(self._dated_pool(45))
        self.assertIsNotNone(tight, "45 days apart is notable, inclusively")
        self.assertIn("the same stretch of time", tight)
        self.assertIsNone(study_lib.derive_evening_line(self._dated_pool(46)),
                          "46 days is the far side of the tight threshold")

        wide = study_lib.derive_evening_line(self._dated_pool(365))
        self.assertIsNotNone(wide, "365 days apart is notable, inclusively")
        self.assertIn("reaches back across the years", wide)
        self.assertIsNone(study_lib.derive_evening_line(self._dated_pool(364)),
                          "364 days is the far side of the wide threshold")

        # a spread needs TWO points. One dated row cannot answer the question,
        # and answering it anyway would make every single-dated evening report
        # a spread of zero days — a fact about the pool's shape dressed up as
        # a fact about her material.
        one_dated = [self._meta(0, created_ms=1_700_000_000_000)]
        one_dated += [self._meta(i) for i in range(1, 10)]
        self.assertEqual(len(one_dated), 10)
        self.assertIsNone(
            study_lib.derive_evening_line(self._pool(meta_rows=one_dated)),
            "one date is not a spread — fail-closed, the fact stays silent")

    # -- fact 3: how much of it is her own writing --------------------------

    def test_evening_own_writing_share_fires_at_the_agents_number(self):
        # ⚠ 50% IS THE AGENT'S NUMBER AND SHE HAS NOT SEEN IT. D-14 names four
        # facts and supplies thresholds for only three; this one arrived with
        # no number. It is pinned here so it is VISIBLE and movable, never so
        # it reads as ruled. See 26.995-04-SUMMARY.md.
        self.assertEqual(study_lib.EVENING_OWN_WRITING_PERCENT, 50,
                         "the agent's proposed share, pinned by value so a "
                         "later owner ruling is a deliberate edit")
        # `at: None` is a stamp that cannot parse, so these comments carry NO
        # date — which keeps the spread fact silent and exercises the
        # fail-closed date read in the same breath.
        hers = ({"at": None, "text": "i kept the selvedge even"},)

        def pool(own):
            rows = [self._body(i, text="x", comments=hers)
                    for i in range(own)]
            rows += [self._body(i, text="x") for i in range(own, 10)]
            self.assertEqual(len(rows), 10)
            return self._pool(bodies=rows)

        half = study_lib.derive_evening_line(pool(5))
        self.assertIsNotNone(half, "5 of 10 is 50% — notable, inclusively")
        self.assertIn("your own writing", half)
        self.assertIsNone(study_lib.derive_evening_line(pool(4)),
                          "4 of 10 is 40% — the far side of the threshold")

    # -- fact 4: whether one piece dominates --------------------------------

    def test_evening_dominance_fires_at_sixty_percent_and_not_at_fifty_nine(
            self):
        def pool(big_len):
            big = "b" * big_len
            small = "s" * (100 - big_len)
            self.assertEqual(len(big) + len(small), 100,
                             "the case states its own denominator")
            rows = [self._body(0, text=big), self._body(1, text=small)]
            rows += [self._body(i, text="") for i in range(2, 10)]
            self.assertEqual(len(rows), 10,
                             "between 4 and 20: the piece count stays silent")
            return self._pool(bodies=rows)

        dominated = study_lib.derive_evening_line(pool(60))
        self.assertIsNotNone(dominated,
                             "60% of the pool's text in one row is notable, "
                             "inclusively")
        self.assertIn("one piece is most of what there is to read", dominated)
        self.assertIsNone(study_lib.derive_evening_line(pool(59)),
                          "59% is the far side of the same threshold")

    # -- the unmutated control ----------------------------------------------

    def test_evening_unremarkable_pool_is_silent_the_unmutated_control(self):
        """⛔ THE CONTROL FOR EVERY CASE ABOVE. Ten one-character rows: no
        date anywhere, no comment anywhere, no row holding more than a tenth
        of the text. Nothing crosses anything, so the room is told NOTHING —
        not an empty string, and not a sentence saying nothing stands out."""
        line = study_lib.derive_evening_line(
            self._pool(bodies=self._plain_rows(10)))
        self.assertIsNone(line,
                          "an unremarkable evening gets NO sentence at all "
                          "(D-14) — got %r" % (line,))
        self.assertNotEqual(line, "",
                            "ABSENT, never present-and-empty: the caller "
                            "omits the key on None and an empty string would "
                            "still emit it")

    # -- the register -------------------------------------------------------

    def test_evening_line_is_one_plain_sentence_never_a_labelled_list(self):
        """A labelled list of fields reads as DATA and invites a report ABOUT
        the data — the exact failure her three blind verdicts named ('an AI
        just analyzing a pile of files'). Driven on the richest pool this
        derivation can produce, where all four facts fire at once."""
        hers = ({"at": "2024-01-01T09:00:00+00:00",
                 "text": "i kept the selvedge even"},)
        base = 1_700_000_000_000
        rows = [self._body(0, text="b" * 600, comments=hers),
                self._body(1, text="s" * 400, comments=hers)]
        rows += [self._meta(i, created_ms=base + i * 40 * self._DAY_MS,
                            comments=hers) for i in range(2, 24)]
        self.assertEqual(len(rows), 24, "a heavy evening, stated by value")
        line = study_lib.derive_evening_line(
            self._pool(bodies=rows[:2], meta_rows=rows[2:]))
        self.assertIsNotNone(line, "the richest pool must say something")

        self.assertNotIn(":", line,
                         "NEVER a labelled list — no field-name-colon shape "
                         "anywhere in the sentence: %r" % (line,))
        self.assertEqual(line.count("."), 1,
                         "ONE plain sentence, one full stop: %r" % (line,))
        self.assertTrue(line.endswith("."), "it ends like a sentence")
        self.assertEqual(line, line.lstrip(),
                         "no leading whitespace to betray a joined list")
        for machinery in ("pieces:", "days", "own-writing", "dominant",
                          "percent", "count", "meta_rows", "bodies"):
            self.assertNotIn(machinery, line,
                             "no internal fact name reaches her room: %r "
                             "in %r" % (machinery, line))

    # -- purity -------------------------------------------------------------

    def test_evening_derivation_takes_the_pool_and_nothing_else(self):
        """T-26.995-01. The adjacent shelf-label resolver at the SAME route
        reads UNFENCED data; copying that habit here would put unfenced
        material into the reflection document. The fence is the one audited
        builder, the pool it produces is already fenced, and the Evening line
        reads that and stops."""
        params = list(
            inspect.signature(study_lib.derive_evening_line).parameters)
        self.assertEqual(params, ["pool"],
                         "the signature IS the fence here: it takes the pool "
                         "and nothing else — got %r" % (params,))
        for reachy in ("store", "library_root", "store_dir", "items",
                       "anchors", "shelves"):
            self.assertNotIn(reachy, params)
        # and it answers from a plain dict with nothing else in the world.
        self.assertIsNotNone(
            study_lib.derive_evening_line(
                self._pool(bodies=self._plain_rows(2))),
            "a hand-built dict, no store, no root, no notebook — and it "
            "still answers")

    def test_evening_derivation_fails_closed_on_garbage_and_never_raises(self):
        for bad in (None, "not a dict", 42, [], object(), {},
                    {"bodies": None, "meta_rows": None},
                    {"bodies": [None, 7, "x"], "meta_rows": "nope"},
                    {"bodies": [], "meta_rows": []}):
            try:
                result = study_lib.derive_evening_line(bad)
            except Exception as e:   # noqa: BLE001 — the point is it must NOT
                self.fail("derive_evening_line raised on %r: %r" % (bad, e))
            self.assertIsNone(result,
                              "must fail closed to silence on %r" % (bad,))

    # -- the document -------------------------------------------------------

    def test_evening_key_absent_when_nothing_stands_out_present_after_pool(
            self):
        """⛔ ABSENT, NEVER PRESENT-AND-NULL. On an unremarkable evening the
        room is told NOTHING, rather than told that nothing stands out — the
        shipped shape of the identity block below its evidence floor, where
        the docstring says the absence is itself the instruction.

        ⚠ DRIVEN RED IN BOTH DIRECTIONS, and the commit body records the run:
        the assembler was probed with the key emitted as an EMPTY STRING
        instead of omitted, and `assertNotIn` failed. That is the whole of
        D-14's ruling — the distinction between absent and empty."""
        variation = {"vary_your_entry_point": "…", "shapes_used_lately": [],
                     "titles_already_used": []}
        silent = server._reflection_turn_doc(
            {"bodies": []}, variation, None, None, [], evening=None)
        self.assertNotIn("evening", silent,
                         "no Evening line means NO KEY — not a null, not an "
                         "empty string: %r" % (list(silent),))
        self.assertEqual(list(silent)[0], "pool",
                         "and the pool is still first")

        line = "there is a lot here — 24 pieces."
        spoken = server._reflection_turn_doc(
            {"bodies": []}, variation, None, None, [], evening=line)
        self.assertEqual(list(spoken)[:2], ["pool", "evening"],
                         "when there IS a line it sits IMMEDIATELY after the "
                         "pool — the stable cache prefix is the pool key and "
                         "nothing may go ahead of it: %r" % (list(spoken),))
        self.assertEqual(spoken["evening"], line, "handed down verbatim")
        blob = json.dumps(spoken, ensure_ascii=False)
        self.assertTrue(blob.startswith('{"pool":'),
                        "pool-FIRST survives this addition too")

    def test_evening_line_is_resolved_at_the_route_never_in_a_worker(self):
        """The shipped division of labour in this file: the ROUTE resolves,
        the worker receives. A worker holds no store lock and reads no store
        state, and computing the line there — or inside the fence builder —
        would be a second place the document's shape is decided."""
        for worker in (server._reflection_worker, server._refine_worker):
            params = list(inspect.signature(worker).parameters)
            self.assertIn("evening", params,
                          "%s receives the line as a PARAMETER" % worker.__name__)
            self.assertNotIn(
                "derive_evening_line", inspect.getsource(worker),
                "%s must not compute the line itself" % worker.__name__)
        for handler in (server.StudyHandler.handle_librarian_session_start,
                        server.StudyHandler.handle_librarian_refine):
            self.assertIn("derive_evening_line", inspect.getsource(handler),
                          "%s is where it IS resolved" % handler.__name__)
        # and the fence builder is not where it happens either.
        self.assertNotIn(
            "derive_evening_line",
            inspect.getsource(study_lib.build_librarian_payload),
            "the one audited fence builder gains no new job")

    # -- the controls (26.995-04 task 3) ------------------------------------

    def test_evening_pool_of_exactly_one_still_writes(self):
        """⛔ CONTROL. The Evening line changes what the room is TOLD, never
        WHETHER it writes. A one-item evening is the empty-and-single-element
        edge, authored as a truth on this plan rather than left to be
        discovered — and it is driven through the REAL fence builder, not a
        hand-built dict, so a pool of one is a pool the product can produce."""
        store = make_store(self.lib, [make_item(self.lib, 1, state="blessed",
                                                body="the loom hums")])
        pool = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None, anchors=None)
        rows = len(pool["bodies"]) + len(pool["meta_rows"])
        self.assertEqual(rows, 1, "exactly one piece, stated BY VALUE")

        line = study_lib.derive_evening_line(pool)
        self.assertEqual(line, "there is not much here tonight — 1 piece.",
                         "and the room does not write '1 pieces'")
        # ⛔ THIS CONTROL FOUND A REAL DEFECT AND THE ASSERTION ABOVE IS WHERE
        # IT SURFACED. A pool of one row holds 100% of its own text, so a bare
        # share test had the room announce that one piece was most of what
        # there was to read on an evening holding one piece. Dominance is a
        # COMPARISON and now needs two rows, the same rule the spread already
        # applied to dates. Pinned here by its own name so the repair cannot
        # be undone silently.
        self.assertNotIn("dominant", study_lib.evening_measures(pool),
                         "a one-row pool cannot answer 'does one piece "
                         "dominate' — the fact is ABSENT, not 100%")
        self.assertIn("dominant", study_lib.evening_measures(
            self._pool(bodies=[self._body(0, text="aa"),
                               self._body(1, text="b")])),
            "and two rows CAN answer it — the unmutated other side, so the "
            "repair above is a narrowing and not a deletion")

        doc = server._reflection_turn_doc(pool, None, None, None, [],
                                          evening=line)
        self.assertEqual(list(doc)[:2], ["pool", "evening"])
        blob = json.dumps(doc, ensure_ascii=False)
        self.assertTrue(blob.startswith('{"pool":'))
        self.assertIn("the loom hums", blob,
                      "the one item's body still rides — a document IS "
                      "produced for a pool of one")

    def test_evening_derivation_reports_no_title_and_no_body_text(self):
        """⛔ CONTROL, AND THE ARM THAT SHOULD FAIL if someone later
        'improves' the Evening line by looking at CONTENT. The derivation
        counts rows and characters and nothing else; it neither inspects nor
        reports what a row says.

        The pool is hand-built and carries a title and a body that WOULD be
        fenced if the fence saw them, so a derivation that reported either
        would be reporting exactly the class law 5 calls a P0."""
        secret_title = FENCE_TITLE + "-EVENING"
        secret_body = FENCE_BODY + "-EVENING"
        secret_comment = FENCE_BODY + "-COMMENT"
        rows = [{"id": "b0", "title": secret_title, "text": secret_body,
                 "comments": [{"at": None, "text": secret_comment}]}]
        rows += [{"id": "b%d" % i, "title": secret_title, "text": "x",
                  "comments": []} for i in range(1, 4)]
        self.assertEqual(len(rows), 4, "4 pieces: the count fact WILL fire")
        line = study_lib.derive_evening_line(self._pool(bodies=rows))
        self.assertIsNotNone(line, "the derivation does speak here — a "
                                   "silent answer would prove nothing")
        for secret in (secret_title, secret_body, secret_comment,
                       FENCE_TITLE, FENCE_BODY, "b0"):
            self.assertNotIn(secret, line,
                             "the Evening line reports no title, no body "
                             "text, no comment text and no id: %r in %r"
                             % (secret, line))


class ReflectionLedgerWorkerTest(unittest.TestCase):
    """The ledger is written by the WORKER PATH, through the recording
    seam — the append is a real consequence of a draft landing, not a
    helper the app never calls."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()
        # 26.93-07: PATH swap + probe reset -> the one imported guard.
        #
        # ⚠ THE TWO SHELL MODEL NAMES ARE NO LONGER SAVED AND CLEARED
        # HERE, AND THE REASON IS NARROW — read it before copying it.
        # They were cleared so a developer's exported alias could not
        # steer the argv this worker produced; D-01 removed the argv and
        # a caller's ability to name a model, so that reason is spent.
        # ⚠ THAT IS NOT A GENERAL LICENCE TO STOP CLEARING THEM.
        # `resolve_voice_model` still READS both names, and
        # ReflectionEnvelopeStubTest below asserts on what it returns —
        # so that class clears them and puts them back, and its setUp
        # says why. This class may skip it for one specific reason: it
        # never calls that resolver and never sets either name. It hands
        # `voice_model` to the worker as a literal argument.
        self.log = Path(self._tmp.name) / "fake.log"
        self._env = fake_claude_env(self.log)
        self._env.__enter__()
        self.addCleanup(self._env.__exit__, None, None, None)
        no_cached_probe()

    def test_a_landed_draft_is_recorded_and_a_passed_one_becomes_prior(self):
        draft = "# the small table\n\n" + GOOD_ESSAY
        os.environ["FAKE_CLAUDE_REFLECTION"] = json.dumps(
            {"reflection": draft, "coda": None, "question": None},
            ensure_ascii=False)
        no_cached_probe()
        # 26.93-05 (D-04/D-10): `routing` is the eleventh parameter and it is
        # HANDLER-resolved. The worker holds no store lock and reads no store,
        # so it may not resolve who is answering itself — which is exactly why
        # it has to arrive here, already decided, from the caller.
        server._reflection_worker(
            {"meta_rows": [], "bodies": [], "counts": {}}, [], [], True,
            1700000000000, str(self.lib), (),
            server.LIBRARIAN_VOICE_MODEL_DEFAULT,
            {"titles_already_used": [], "shapes_used_lately": []}, None,
            server.resolve_librarian_routing())
        entries = study_lib.load_reflections(self.lib)["reflections"]
        self.assertEqual(len(entries), 1, f"no ledger record: {entries}")
        record = entries[0]
        self.assertEqual(record["title"],
                         server._reflection_book_title(draft),
                         "ONE notion of title — the shipped helper, so the "
                         "spine, the spread and the ledger agree")
        self.assertIn(record["shape"], study_lib.OPENING_SHAPE_TOKENS)
        self.assertIsNone(record["outcome"],
                          "the outcome is stamped at CLOSE, not here")
        self.assertIsInstance(record["ms"], int)
        # an open session is never prior to itself
        self.assertEqual(study_lib.reflection_memory(self.lib)["titles"], [])
        # she PASSES — letting go is free, and the title is still a repeat
        server._stamp_reflection_outcome(str(self.lib), "passed")
        titles = study_lib.reflection_memory(self.lib)["titles"]
        self.assertEqual(titles, ["the small table"],
                         "a PASSED draft produces a prior title: a title "
                         "she saw twice is a repeat either way")
        ok, cleaned, why = server.validate_reflection(
            {"reflection": "# The Small  Table\n\n" + GOOD_ESSAY,
             "coda": None, "question": None},
            [], [], prior_titles=titles)
        self.assertFalse(ok, "the memory feeds the shipped gate")
        self.assertIsNone(cleaned)
        self.assertEqual(why, "title_reuse")

    def test_the_ledger_write_takes_neither_store_lock(self):
        # The invariant that lets a worker append straight after its call:
        # a librarian file is not the store. Both store locks are free
        # while the append runs, and the append must not need either.
        self.assertTrue(server.WRITE_LOCK.acquire(timeout=5))
        self.assertTrue(server.LIBRARIAN_LOCK.acquire(timeout=5))
        try:
            server._append_reflection_record(str(self.lib),
                                             "# held\n\nbody line.")
            server._stamp_reflection_outcome(str(self.lib), "saved")
        finally:
            server.LIBRARIAN_LOCK.release()
            server.WRITE_LOCK.release()
        self.assertEqual(
            study_lib.reflection_memory(self.lib)["titles"], ["held"],
            "the ledger wrote with BOTH store locks held elsewhere — it "
            "never reaches for either")


# ---------------------------------------------------------------------------
# 26.7-01 Task 3: the hermetic reflection envelope + the recorded REQUEST
# (26.93-07: the recorded ARGV is gone — see the class docstring)
# ---------------------------------------------------------------------------

class ReflectionEnvelopeStubTest(unittest.TestCase):
    """The recording seam answers a reflection call with a schema-shaped
    {reflection, coda, question} envelope and records what the app actually
    SENT (the refine-turn scans in Plan 03 ride this seam); the recorded
    request BODY names the routing fill's model, asserted BY VALUE; the whole
    per-turn document rides the user message verbatim; the bad variant is
    rejected fail-closed by validate_reflection.

    26.93-07, WHAT HAPPENED TO THE TWO ARGV PINS THIS CLASS USED TO CARRY.
    There is no argv. Both pins are DELETED, each where it stood, each naming
    what killed it — and one of them is replaced by a stronger claim under its
    own name. Neither deletion was made to go green: the persistence pin's
    guarantee is stated as vacuous in shipped prose, and the model pin's
    subject (a caller naming a model) no longer exists to be pinned."""

    # ⚠ TAKEN FROM THE FUNCTION UNDER TEST, NOT RE-TYPED, and that is not a
    # violation of the house rule that an allow-list must be an explicit
    # literal — the opposite concern applies. An allow-list decides what is
    # PERMITTED, so it must be edited to change and a derivation would hide a
    # membership change. This is HYGIENE: it decides what gets cleaned, and it
    # is wrong exactly when it stops matching what the resolver reads. A third
    # name added to `resolve_voice_model` must be cleaned the day it lands,
    # not the day someone notices a suite going red out of order.
    VOICE_ENV_NAMES = tuple(server.VOICE_MODEL_ENV_NAMES)

    @staticmethod
    def _restore_env(saved):
        for name, value in saved.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.log = Path(self._tmp.name) / "fake.log"

        # ⚠⚠ THE SHELL IS AN ARGUMENT TO THESE CASES, NOT AMBIENT NOISE, and
        # that is the whole reason a suite about the FENCE clears a
        # voice-model environment variable. `resolve_voice_model` is a pure
        # function of two inputs — the shell and her stored pick — and D-01
        # did nothing to that: it removed the argv and a caller's ability to
        # NAME a model, but the function still READS the shell. So a value
        # one case exports is an input the next case is handed.
        #
        # ⚠ THIS BLOCK WAS DELETED ONCE, 26.93-07, on the true-but-irrelevant
        # grounds that the argv it used to protect no longer exists. The
        # illegal-alias case ran first (methods run alphabetically), left
        # `gpt-9-ultra-max` behind, and the STORED-path case three later
        # answered ('opus', 'env_rejected') instead of ('haiku', 'stored').
        # The argv died; the read did not. Naming that here so the next
        # reader who notices "the argv is gone, why is this cleared?" finds
        # the answer at the line rather than at a failure 200 lines away.
        #
        # ⚠ AND IT IS RESTORED ON THE WAY OUT, NOT MERELY CLEARED ON THE WAY
        # IN. `ValidateReflectionTest.test_contract_constants` compares
        # `_allowed_model(os.environ.get("LIBRARIAN_REFLECT_MODEL"))` against
        # a constant bound at IMPORT, and this module's classes run
        # alphabetically, so that pin runs after this class. A LEGAL alias
        # escaping from here turns it red for a reason nothing at the failure
        # site could explain. The general rule, which does not depend on the
        # ordering staying what it is today: a suite that leaves a shell
        # variable behind has made its neighbours' results depend on when
        # they ran.
        saved_voice = {name: os.environ.get(name)
                       for name in self.VOICE_ENV_NAMES}
        self.addCleanup(self._restore_env, saved_voice)
        for name in self.VOICE_ENV_NAMES:
            os.environ.pop(name, None)

        self._env = fake_claude_env(self.log)
        self._env.__enter__()
        self.addCleanup(self._env.__exit__, None, None, None)
        no_cached_probe()

    # -- the seam, spelled once ---------------------------------------------

    def _turn_doc(self):
        return json.dumps({"pool": {"meta_rows": [], "bodies": [],
                                    "counts": {}},
                           "draft": None, "chat": []}, ensure_ascii=False)

    def _call(self, doc):
        """One reflection call through the SHIPPED seam.

        ⚠ A CALLER NAMES A JOB AND NOTHING ELSE (D-01). There is no schema
        argument, no prompt argument and no model argument to pass — which is
        precisely why the argv pins below could not be translated: they pinned
        a decision the caller is no longer allowed to make."""
        return L.call_librarian("reflection", doc,
                                server.resolve_librarian_routing())

    def _record(self):
        return json.loads(self.log.read_text(encoding="utf-8"))

    @staticmethod
    def _travelled(rec):
        """Everything in the record that would have gone down the socket: the
        user message, the built body, the address. ⚠ Deliberately NOT the whole
        record — `env_keys` is the recorder's own note about the process, never
        part of the request."""
        return (str(rec.get("stdin") or "")
                + json.dumps(rec.get("body") or {}, ensure_ascii=False)
                + str(rec.get("url") or ""))

    def test_reflection_envelope_and_the_recorded_request(self):
        # 26.995-06 task 2 CONSCIOUS PIN EDIT — 2026-08-19, D-05. The stub
        # answered {reflection, coda, question} and this pin said so by
        # value. THE NEW TRUTH: no question field exists on the wire, so
        # the stub stops emitting one — a stub that kept emitting a removed
        # field would pass silently (the closed-properties flag lives on
        # the SCHEMA, not on validate_reflection) and every test built on
        # it would prove nothing. Still an EXACT-SET compare, which is the
        # property worth keeping.
        os.environ["FAKE_CLAUDE_REFLECTION"] = json.dumps(
            {"reflection": GOOD_ESSAY, "coda": None},
            ensure_ascii=False)
        no_cached_probe()
        doc = self._turn_doc()
        result = self._call(doc)
        self.assertTrue(result["ok"])
        structured = result["structured"]
        self.assertEqual(set(structured), {"reflection", "coda"},
                         "the stub answers the exact contract shape")
        self.assertNotIn("question", structured,
                         "THE INVERSE ASSERTION: a removed field must not "
                         "creep back through the stub, where it would pass "
                         "unnoticed")
        ok, cleaned, why = server.validate_reflection(structured, [], [])
        self.assertTrue(ok)
        self.assertEqual(cleaned["reflection"], GOOD_ESSAY)
        rec = self._record()
        self.assertIn('"pool"', rec["stdin"],
                      "the whole per-turn document rides the recorded "
                      "stdin — the fence family scans it there")

        # ⚠ THE 26.7-01 PERSISTENCE PIN IS DELETED HERE, AND DIED WITH THE
        # SUBPROCESS RATHER THAN WITH THIS SUITE. It asserted
        # `--no-session-persistence` on every argv and the absence of
        # --resume / --continue / --session-id. There is no argv, and the
        # guarantee it bought is now structural: `librarian_call.py`'s own
        # shipped prose says it plainly — "no session persistence, is vacuous
        # here too, because the Messages API keeps no conversation object a
        # later call can read back". A flag cannot be pinned onto a request
        # shape that has nowhere to put it, and inventing a stand-in
        # assertion so the line count stayed level would be theatre.
        #
        # WHAT REPLACES IT IS A DIFFERENT CLAIM WITH ITS OWN NAME, and it is
        # the LIVE half of the same design (AI-SPEC §4 stateless re-send):
        # because nothing is kept anywhere, the whole conversation has to
        # travel every turn — so the payload must arrive verbatim, with no
        # wrapper sentence, no prefix and no suffix. That is checkable, and
        # every fence scan in this file depends on it: a wrapper would mean
        # the bytes scanned are not the bytes sent.
        self.assertEqual(rec["stdin"], doc,
                         "the per-turn document reached the model BYTE FOR "
                         "BYTE — a wrapper sentence anywhere breaks the one "
                         "guarantee the fence makes about what is sent")

    def test_bad_reflection_envelope_is_rejected_fail_closed(self):
        os.environ["FAKE_CLAUDE_REFLECTION_BAD"] = "1"
        no_cached_probe()
        result = self._call("{}")
        # ANTI-VACUITY, AND IT MATTERS MORE NOW THAN IT DID: the readers in
        # `librarian_call` do not re-validate the answer against the job's
        # schema — they parse it and hand it up. So the call SUCCEEDS and the
        # shape gate below is the only thing standing between an off-contract
        # object and a rendered reflection. Without this line the case would
        # also pass if nothing had answered at all.
        self.assertTrue(result["ok"],
                        "the call itself succeeded — this case must reject on "
                        "SHAPE, never pass because the seam failed")
        ok, cleaned, why = server.validate_reflection(
            result.get("structured"), [], [])
        self.assertFalse(ok)
        self.assertIsNone(cleaned)
        self.assertEqual(why, "shape",
                         "a schema-violating envelope never renders")

    def test_an_illegal_shell_alias_falls_closed_and_never_travels(self):
        # 26.87-09 (criterion 3, D-19, T-26.87-03), SPLIT IN TWO BY 26.93-07.
        #
        # THE PURE-FUNCTION HALF SURVIVES UNCHANGED and is the half that was
        # always about the hole: before 26.87-01 both voice-tier env reads
        # passed through unvalidated, so an arbitrary shell string reached the
        # model flag. `resolve_voice_model` is still the gate, still
        # fail-closed, and still reports a refusal as its own source token.
        illegal = "gpt-9-ultra-max"
        os.environ["LIBRARIAN_REFLECT_MODEL"] = illegal
        os.environ["FAKE_CLAUDE_REFLECTION"] = json.dumps(
            {"reflection": GOOD_ESSAY, "coda": None, "question": None},
            ensure_ascii=False)
        no_cached_probe()

        alias, source = server.resolve_voice_model({})
        self.assertEqual(alias, server.LIBRARIAN_VOICE_MODEL_DEFAULT,
                         "an unknown shell alias falls closed to the "
                         "default, never through")
        self.assertEqual(source, server.VOICE_SOURCE_ENV_REJECTED,
                         "fail-closed is correct; invisible is not — the "
                         "refusal gets its own source token so the pane "
                         "can say so without a log")

        # ⚠ THE ARGV HALF IS DELETED, AND IT DIED WITH D-01 — NOT WITH THE
        # SUBPROCESS. It read `--model`'s VALUE out of the record and asserted
        # it was the legal default. A caller may no longer name a model at
        # all: `call_librarian` takes a job and a frozen routing, and the
        # `alias` resolved above is never handed to it. There is no flag whose
        # value could be wrong, so the assertion has no subject.
        result = self._call(self._turn_doc())
        self.assertTrue(result["ok"])
        rec = self._record()

        # THE REPLACEMENT, AND IT IS A NEW CLAIM WEARING ITS OWN NAME (never
        # the retired pin's): the request BODY names the model the ROUTING
        # chose, read by value out of the record rather than trusted from the
        # resolver's return. Under the swapped home no cloud key exists, so
        # every tier resolves to her own machine and the expected value is the
        # local fill's tag — deliberately NOT a voice alias, which is what
        # makes this a different fact rather than the old one re-spelled.
        expected_model = L.LOCAL_FILL[1]
        self.assertNotIn(
            expected_model, server.VOICE_MODELS,
            "the expected value must not be a voice alias, or this assertion "
            "could be satisfied by exactly the leak it exists to catch")
        self.assertEqual(
            (rec.get("body") or {}).get("model"), expected_model,
            "the recorded body names the routing fill's model, BY VALUE — "
            "never by presence, and never an alias a shell supplied")

        # TRANSLATED AND STRICTLY WIDER than the argv scan it replaces: the
        # illegal string is absent from the whole travelling request, not
        # merely from a flag list.
        self.assertNotIn(illegal, self._travelled(rec),
                         "the illegal shell string appears NOWHERE in the "
                         "request that would have gone down the socket")

    def test_stored_pick_and_legal_env_both_still_resolve(self):
        # The other half of the same fact, and it is the COMPATIBILITY
        # half: fail-closed must not mean fail-useless. A legal shell
        # override still works unchanged and BEATS the stored pick (the
        # promise 26.87-01 made to a shell that already works today); with
        # no shell value at all her stored pick is what writes.
        os.environ["FAKE_CLAUDE_REFLECTION"] = json.dumps(
            {"reflection": GOOD_ESSAY, "coda": None, "question": None},
            ensure_ascii=False)
        no_cached_probe()

        stored = {"voice_model": "haiku"}
        alias, source = server.resolve_voice_model(stored)
        self.assertEqual((alias, source),
                         ("haiku", server.VOICE_SOURCE_STORED))

        # ⚠ THE LEGAL SHELL VALUE WAS `sonnet` UNTIL 2026-08-26 AND IS NOW
        # `opus`, and the swap is a consequence of her ruling rather than a
        # gate edited until it passed. 26.99955's UAT (G-…-04) found that her
        # pick reached no call at all; the fix is that it now chooses the fill
        # of the tier her card is about, and she ruled that the picker offer
        # only the two readers the room has actually run. `sonnet` therefore
        # left VOICE_MODELS, so it is no longer a LEGAL shell value and cannot
        # demonstrate the legal-override half. `opus` is legal, differs from
        # the stored pick, and so still proves the two facts this case is
        # about: the shell wins, and it is validated.
        os.environ["LIBRARIAN_REFLECT_MODEL"] = "opus"
        alias, source = server.resolve_voice_model(stored)
        self.assertEqual((alias, source),
                         ("opus", server.VOICE_SOURCE_ENV),
                         "a legal shell override still works, and still "
                         "wins — it is only validated now")

        # ⚠ AND HERE IS WHAT 26.93-07 ACTUALLY CHANGED, stated as its own
        # claim rather than left implied by a deleted argv pin: a LEGAL alias
        # wins the resolver and still does not decide who answers. `sonnet`
        # was resolved a line ago; the request names the routing fill. The old
        # assertion `argv[--model + 1] == "sonnet"` is therefore not merely
        # untranslatable, it is now FALSE in substance — which is exactly the
        # kind of pin that has to be replaced deliberately rather than edited
        # until it passes.
        result = self._call(self._turn_doc())
        self.assertTrue(result["ok"])
        rec = self._record()
        self.assertEqual(
            (rec.get("body") or {}).get("model"), L.LOCAL_FILL[1],
            "who answers is the ROUTING's answer, not the voice alias's — "
            "the alias survives for the essay's voice, and reaches the wire "
            "nowhere")
        # ⚠ ASSERTED OVER THE MODEL FIELD, NOT OVER THE WHOLE REQUEST, and the
        # narrowing is deliberate rather than lazy: the body carries the job's
        # system prompt verbatim, which is English prose about writing, so a
        # blanket substring scan for a word like "sonnet" would be measuring
        # the prompt's vocabulary instead of the routing's decision. The field
        # that decides who answers is the field this checks.
        self.assertNotIn(
            (rec.get("body") or {}).get("model"), server.VOICE_MODELS,
            "no voice alias reaches the wire in the model field — only a "
            "tier's fill can put a name there")


# ---------------------------------------------------------------------------
# 26.7-03 Task 3: the fence over the refine turn — every recorded stdin +
# the session file's bytes on disk (T-26.7-09)
# ---------------------------------------------------------------------------


class RefineTurnFenceTest(unittest.TestCase):
    """A sentinel-seeded store drives a REAL session start plus one
    chat-refine turn over the live routes (a ThreadingHTTPServer on an
    ephemeral port, the hermetic echo stub recording to
    FAKE_CLAUDE_LOG). The AI-SPEC §4 stateless-re-send payoff, proven:
    the WHOLE model-visible context flows through the choke point's
    recorded stdin on the generation turn AND on the refine turn, so
    FENCE-SENTINEL / FENCE-TITLE bytes (a fenced item's body, title,
    comment, and id) must be absent from BOTH records — and from
    librarian/session.json's raw bytes on disk (the held-draft posture
    inherits the same scan)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()
        self.log = Path(self._tmp.name) / "fake.log"
        # ⚠⚠ THE GUARD IS ENTERED BEFORE THE SERVER IS CREATED, AND THAT
        # ORDERING IS LOAD-BEARING (26.93-07). This class starts a real
        # ThreadingHTTPServer and the librarian runs on ITS OWN daemon
        # threads, so a guard scoped to the request would leave the worker
        # outside it. `fake_claude_env` swaps process-wide state — HOME, the
        # key and fill names, `librarian_call._transport` — so every thread
        # this server spawns inherits it. Without the swap the reflection row
        # resolves to a company on the owner's real key and this suite spends
        # her money writing a real essay where a canned string was expected.
        #
        # echo mode: the drafts are BUILT from the handed payload, so the scan
        # runs over a live conversation, never a canned constant.
        self._env = fake_claude_env(
            self.log, extra={"FAKE_CLAUDE_REFLECTION_ECHO": "1"})
        self._env.__enter__()
        self.addCleanup(self._env.__exit__, None, None, None)
        with server.LIBRARIAN_LOCK:
            server.LIBRARIAN_JOB.update(state="idle", total=0, done=0,
                                        cost_usd=0.0, auth=None,
                                        message=None,
                                        unknown_id_verdicts=0,
                                        started_ms=0, stage=None,
                                        rejected_drafts=0,
                                        rejected_why=None)
        no_cached_probe()
        self.httpd = server.create_server(self.lib, 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever,
                                       daemon=True)
        self.thread.start()

    def tearDown(self):
        # ⚠ THE SERVER STOPS FIRST, WHILE THE SWAP IS STILL IN PLACE. The
        # cleanups registered in setUp run after this method, so no worker
        # thread can outlive the guard and reach a real transport on the way
        # out.
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)

    def request_json(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port,
                                          timeout=30)
        try:
            if body is not None:
                conn.request(method, path,
                             json.dumps(body).encode("utf-8"),
                             {"Content-Type": "application/json"})
            else:
                conn.request(method, path)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read())
        finally:
            conn.close()

    def wait_job(self, timeout=20.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            _, snap = self.request_json("GET", "/api/librarian/progress")
            if snap["state"] in ("done", "stopped", "paused", "error"):
                return snap
            time.sleep(0.01)
        self.fail("the librarian job never finished")

    def _assert_sentinel_clean(self, blob, where, fenced_ids):
        self.assertNotIn(FENCE_BODY, blob, f"body sentinel in {where}")
        self.assertNotIn(FENCE_TITLE, blob, f"title sentinel in {where}")
        for fid in fenced_ids:
            self.assertNotIn(fid, blob, f"fenced id in {where}")

    def test_refine_stdin_and_session_file_sentinel_clean(self):
        def fenced(i, **kw):
            item_id = format(0x1000 + i, "016x")
            return make_item(self.lib, i,
                             body=f"{FENCE_BODY}-{item_id} 私密的手记",
                             title=f"{FENCE_TITLE}-{item_id}.md", **kw)
        f1 = fenced(1, state="never_show")
        f2 = fenced(2, state="retired")
        f3 = fenced(3, state="blessed", trigger=True)
        # a fenced item's COMMENTS are fenced with it — sentinel seeded
        f1["comments"] = [{"at": "2026-07-20T09:00:00+00:00",
                           "text": f"{FENCE_BODY}-comment"}]
        a4 = make_item(self.lib, 4, state="blessed",
                       body="SAFE-BLESSED-BODY 安全的手记")
        a5 = make_item(self.lib, 5, state="unseen", body="SAFE-UNSEEN")
        # 26.7-uat: the route windows a first session to the recent
        # past — seed stamps ride one hour back so the pool is live.
        fresh_ms = int(time.time() * 1000) - 3600 * 1000
        for _it in (f1, f2, f3, a4, a5):
            _it["created_ms"] = _it["saved_ms"] = fresh_ms
            _it["imported_ms"] = fresh_ms
        store = make_store(self.lib, [f1, f2, f3, a4, a5])
        store["meta"]["librarian_enabled"] = True
        study_lib.save_store(self.lib, store)
        fenced_ids = [f1["id"], f2["id"], f3["id"]]
        # 1) the session's generation turn
        status, data = self.request_json(
            "POST", "/api/librarian/session", {"consent": True})
        self.assertEqual(status, 200, f"start refused: {data}")
        self.assertIs(data.get("running"), True, data)
        snap = self.wait_job()
        self.assertEqual(snap["state"], "done", f"errored: {snap}")
        rec1 = json.loads(self.log.read_text(encoding="utf-8"))
        self._assert_sentinel_clean(rec1["stdin"],
                                    "the generation stdin", fenced_ids)
        self.assertIn("SAFE-BLESSED-BODY", rec1["stdin"],
                      "the allowed pool DID ride — the scan is not "
                      "vacuous")
        # 2) one refine turn — the whole model-visible context, again
        status, data = self.request_json(
            "POST", "/api/librarian/refine",
            {"text": "one more thing about the loom"})
        self.assertEqual(status, 200, f"refine refused: {data}")
        self.assertIs(data.get("running"), True, data)
        snap = self.wait_job()
        self.assertEqual(snap["state"], "done", f"errored: {snap}")
        rec2 = json.loads(self.log.read_text(encoding="utf-8"))
        doc = json.loads(rec2["stdin"])
        self.assertEqual(doc["chat"][-1],
                         {"who": "user",
                          "text": "one more thing about the loom"},
                         "this record IS the refine turn's stdin")
        self._assert_sentinel_clean(rec2["stdin"],
                                    "the refine stdin", fenced_ids)
        # 3) the session file's bytes on disk (the held-draft posture)
        raw = (self.lib / "librarian" / "session.json").read_text(
            encoding="utf-8")
        self._assert_sentinel_clean(raw, "librarian/session.json",
                                    fenced_ids)
        sess = json.loads(raw)
        self.assertEqual(sess["state"], "active")
        self.assertIn("one more thing about the loom", sess["draft"],
                      "her turn is woven in — the scan ran over a LIVE "
                      "conversation, never an empty file")


class ReflectionTruncationControlTest(unittest.TestCase):
    """26.995-01 (D-36, D-02(c)) — THE DELETION'S UNMUTATED CONTROL, and the
    short shape proven DELIVERED rather than merely accepted.

    ⚠ WHY THIS CLASS EXISTS AT ALL. `LIBRARIAN_REFLECTION_FLOOR` was deleted
    in the same commit, and a floor deletion is exactly the kind of change
    that can take a real protection with it while every remaining case stays
    green. The protection D-36 KEEPS is *catch a reflection cut off
    mid-thought* — and it is not in `validate_reflection` and never was: all
    three provider adapters read the model's own stop/done/finish reason
    BEFORE any parse and answer `failure="truncated"` with `ok=False` and
    `structured=None`, so a cut-off draft is destroyed at the seam and the
    validator is never reached. The generation worker then writes the lost
    essay again exactly once (map #50 / #68 ruling 2, her words: *"yes, once,
    quietly"*).

    So this class drives BOTH halves in the same run:
      (a) the seam itself, so the failure token and the empty payload are
          asserted where they are produced;
      (b) the whole worker, so `lost_drafts` is read BY VALUE off the live
          job rather than reasoned about;
      (c) the 380-character reflection all the way to the bytes the page
          renders — the deletion's positive claim, which a passing validator
          alone does not make.

    ⛔ (c) IS NOT A DUPLICATE OF THE VALIDATOR CASE. `validate_reflection`
    returning ok=True proves the draft was ACCEPTED. It does not prove it was
    DELIVERED — a short draft could still be dropped by the worker, lost on
    the session write, or trimmed on the read the view loads from. Those are
    the three places between the model's answer and the page she reads, and
    each one is asserted here on the same 380 characters."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()
        self.log = Path(self._tmp.name) / "fake.log"

    def _enter_env(self, extra):
        # ⚠ THE GUARD IS ENTERED BEFORE THE SERVER IS CREATED — the same
        # ordering RefineTurnFenceTest documents at length: the librarian runs
        # on the server's own daemon threads, and only a process-wide swap
        # reaches them. Without it the reflection row resolves to a company on
        # the owner's real key and this suite spends her money.
        env = fake_claude_env(self.log, extra=extra)
        env.__enter__()
        self.addCleanup(env.__exit__, None, None, None)
        no_cached_probe()

    def _start_server(self):
        with server.LIBRARIAN_LOCK:
            server.LIBRARIAN_JOB.update(state="idle", total=0, done=0,
                                        cost_usd=0.0, auth=None,
                                        message=None,
                                        unknown_id_verdicts=0,
                                        started_ms=0, stage=None,
                                        rejected_drafts=0,
                                        rejected_why=None,
                                        lost_drafts=0)
        self.httpd = server.create_server(self.lib, 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever,
                                       daemon=True)
        self.thread.start()
        self.addCleanup(self._stop_server)

    def _stop_server(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)

    def _seed(self):
        fresh_ms = int(time.time() * 1000) - 3600 * 1000
        items = [make_item(self.lib, 1, state="blessed",
                           body="SAFE-BLESSED-BODY 安全的手记 the loom again"),
                 make_item(self.lib, 2, state="blessed",
                           body="SAFE-SECOND-BODY the window seat"),
                 make_item(self.lib, 3, state="unseen", body="SAFE-UNSEEN")]
        for it in items:
            it["created_ms"] = it["saved_ms"] = it["imported_ms"] = fresh_ms
        store = make_store(self.lib, items)
        store["meta"]["librarian_enabled"] = True
        study_lib.save_store(self.lib, store)

    def request_json(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=30)
        try:
            if body is not None:
                conn.request(method, path, json.dumps(body).encode("utf-8"),
                             {"Content-Type": "application/json"})
            else:
                conn.request(method, path)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read())
        finally:
            conn.close()

    def wait_job(self, timeout=20.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            _, snap = self.request_json("GET", "/api/librarian/progress")
            if snap["state"] in ("done", "stopped", "paused", "error"):
                return snap
            time.sleep(0.01)
        self.fail("the librarian job never finished")

    # -- (a) the seam, where the cut-off is actually caught ------------------

    def test_a_cut_off_answer_dies_at_the_seam_and_never_reaches_the_validator(self):
        """⛔ THE ARM THAT MUST NOT HAVE MOVED. If the floor deletion had
        removed the mid-thought protection, this is where it would show —
        and it is asserted at the seam rather than downstream, because
        downstream cannot tell a destroyed answer from a refused request."""
        self._enter_env({"FAKE_CLAUDE_TRUNCATE_FIRST": "9"})
        doc = json.dumps({"pool": {"meta_rows": [], "bodies": [],
                                   "counts": {}},
                          "draft": None, "chat": []}, ensure_ascii=False)
        result = L.call_librarian("reflection", doc,
                                  server.resolve_librarian_routing())
        self.assertIs(result["ok"], False,
                      "a cut-off answer is not a successful call")
        self.assertEqual(result["failure"], "truncated",
                         "the transport's own token for an essay the size "
                         "limit destroyed — the ONE thing D-36 keeps")
        self.assertIsNone(result["structured"],
                          "and it carries NO payload, which is why "
                          "validate_reflection is never reached: the "
                          "worker's `if not result.get('ok')` fires first")
        self.assertEqual(server.REFLECTION_REASK_FAILURES, ("truncated",),
                         "the re-ask set is exactly this token — the "
                         "protection and its remedy are still wired to "
                         "each other")

    # -- (b) the worker, and the counter read BY VALUE ----------------------

    def test_a_lost_draft_still_raises_the_counter_by_exactly_one(self):
        """The unmutated control run WHOLE: one destroyed answer, one
        re-ask, and the sitting still lands. `lost_drafts` is read off the
        live job BY VALUE — a boolean here would pass for a worker that
        counted every attempt, or none."""
        self._enter_env(self.reflection_toggle(GOOD_ESSAY,
                                               {"FAKE_CLAUDE_TRUNCATE_FIRST":
                                                "1"}))
        self._seed()
        self._start_server()
        status, data = self.request_json(
            "POST", "/api/librarian/session", {"consent": True})
        self.assertEqual(status, 200, f"start refused: {data}")
        snap = self.wait_job()
        self.assertEqual(snap["state"], "done",
                         f"the second go must LAND — her ruling is that she "
                         f"gets the essay: {snap}")
        self.assertEqual(snap["lost_drafts"], 1,
                         "EXACTLY one, by value: the destroyed answer is "
                         "counted fail-visible and the re-ask is not")
        self.assertEqual(snap["rejected_drafts"], 0,
                         "a lost draft never reached the content gate, so "
                         "it is not a rejection — the two counters must "
                         "never stand in for each other")

    @staticmethod
    def reflection_toggle(draft, extra=None):
        toggles = {"FAKE_CLAUDE_REFLECTION": json.dumps(
            {"reflection": draft, "coda": None, "question": None},
            ensure_ascii=False)}
        if extra:
            toggles.update(extra)
        return toggles

    # -- (c) the short shape, delivered ------------------------------------

    def test_a_380_character_reflection_reaches_the_page_unchanged(self):
        """D-02(c) end to end. Before this plan the worker would have
        REJECTED this draft on the floor and regenerated — which is why the
        shape had been unbuildable since the day it was ruled, and why the
        proof has to run past the validator rather than stop at it.

        ⚠ THE LAST ASSERTION IS THE ONE THAT MATTERS. `app.js` renders
        `SESSION.draft` through `sessionOpenSpread` — the read-whole view —
        and `SESSION.draft` is filled from exactly the bytes
        `GET /api/librarian/session` answers with. So asserting those bytes
        are the fixture BYTE FOR BYTE is asserting what she reads."""
        self.assertEqual(len(SHORT_REFLECTION), 380,
                         "the size claim, restated at the site that uses it")
        self._enter_env(self.reflection_toggle(SHORT_REFLECTION))
        self._seed()
        self._start_server()
        status, data = self.request_json(
            "POST", "/api/librarian/session", {"consent": True})
        self.assertEqual(status, 200, f"start refused: {data}")
        snap = self.wait_job()
        self.assertEqual(snap["state"], "done",
                         f"a three-sentence reflection must SURVIVE the "
                         f"worker, not merely the validator: {snap}")
        self.assertEqual(snap["rejected_drafts"], 0,
                         "and it must not have been rejected and rewritten "
                         "on the way — that is the exact failure D-36 names")
        # 1) it landed on disk
        sess = json.loads((self.lib / "librarian" / "session.json")
                          .read_text(encoding="utf-8"))
        self.assertEqual(sess["state"], "active")
        self.assertEqual(sess["draft"], SHORT_REFLECTION,
                         "the session file holds the short draft BYTE FOR "
                         "BYTE — nothing padded it, nothing regenerated it")
        # 2) and it comes back over the read the view loads from
        status, read = self.request_json("GET", "/api/librarian/session")
        self.assertEqual(status, 200)
        self.assertEqual(read["state"], "active")
        self.assertEqual(read["draft"], SHORT_REFLECTION,
                         "these are the bytes `SESSION.draft` is filled "
                         "from, and the read-whole view renders them "
                         "verbatim — so this IS what she reads")
        self.assertEqual(len(read["draft"]), 380,
                         "asserted by value at the far end too: a trim "
                         "anywhere on the path would land here")


class ReflectionPoolBudgetTest(unittest.TestCase):
    """26.7-uat (beat-1 finding, owner-directed): ONE sitting's document
    must FIT the model's window. The reflection payload carries an
    overall character budget (REFLECTION_DOC_BUDGET); overflow drops
    rows OLDEST-out (stamp then id — deterministic), each drop counted
    fail-visible in counts['pool-capped'] (never silent truncation),
    the newest row never dropped, and the fence entirely untouched."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()
        self._budget = study_lib.REFLECTION_DOC_BUDGET

    def tearDown(self):
        study_lib.REFLECTION_DOC_BUDGET = self._budget
        self._tmp.cleanup()

    def _stamped(self, i, ms, **kw):
        it = make_item(self.lib, i, state="blessed",
                       body=kw.pop("body", "B" * 3000), **kw)
        it["created_ms"] = it["saved_ms"] = it["imported_ms"] = ms
        return it

    def test_counts_key_present_and_zero_within_budget(self):
        store = make_store(self.lib, [self._stamped(1, 1700000000000,
                                                    body="small")])
        p = study_lib.build_librarian_payload(store, "reflection",
                                              session_marker=None)
        self.assertEqual(p["counts"].get("pool-capped"), 0,
                         "the cap is declared even when nothing is "
                         "dropped — fail-visible means always visible")

    def test_presort_and_note_counts_unchanged(self):
        # the budget is a REFLECTION concern: the presort/note payloads
        # stay byte-identical to their shipped shapes (26.7-01 pin).
        store = make_store(self.lib, [self._stamped(1, 1700000000000)])
        for scope in ("presort", "note"):
            p = study_lib.build_librarian_payload(store, scope)
            self.assertNotIn("pool-capped", p["counts"],
                             f"{scope} counts must not grow a key")

    def test_overflow_drops_oldest_first_and_counts_every_drop(self):
        items = [self._stamped(i, 1700000000000 + i * 1000)
                 for i in range(1, 9)]
        store = make_store(self.lib, items)
        study_lib.REFLECTION_DOC_BUDGET = 12000
        p = study_lib.build_librarian_payload(store, "reflection",
                                              session_marker=None)
        blob = json.dumps(p, ensure_ascii=False)
        self.assertLessEqual(len(blob), 12000,
                             "the returned document fits the budget")
        kept = set()
        for row in p["bodies"] + p["meta_rows"]:
            kept.add(row["id"])
        self.assertIn(items[-1]["id"], kept,
                      "the NEWEST row always survives the cap")
        self.assertNotIn(items[0]["id"], kept,
                         "the OLDEST row is the first one out")
        self.assertEqual(p["counts"]["pool-capped"], 8 - len(kept),
                         "every dropped row is counted, none silently")

    def test_single_row_never_dropped_to_empty(self):
        # a budget tighter than one row still returns that row — an
        # over-tight cap must never masquerade as D-10 nothing-new.
        it = self._stamped(1, 1700000000000)
        store = make_store(self.lib, [it])
        study_lib.REFLECTION_DOC_BUDGET = 10
        p = study_lib.build_librarian_payload(store, "reflection",
                                              session_marker=None)
        self.assertEqual(len(p["bodies"]) + len(p["meta_rows"]), 1)
        self.assertEqual(p["counts"]["pool-capped"], 0)

    def test_fence_holds_under_the_budget_pass(self):
        fenced = make_item(self.lib, 99, state="never_show",
                           body=f"{FENCE_BODY}-budget 私密的手记",
                           title=f"{FENCE_TITLE}-budget.md")
        items = [self._stamped(i, 1700000000000 + i * 1000)
                 for i in range(1, 5)]
        store = make_store(self.lib, items + [fenced])
        study_lib.REFLECTION_DOC_BUDGET = 9000
        p = study_lib.build_librarian_payload(store, "reflection",
                                              session_marker=None)
        blob = json.dumps(p, ensure_ascii=False)
        self.assertNotIn(fenced["id"], blob)
        self.assertNotIn(FENCE_TITLE, blob)
        self.assertNotIn(FENCE_BODY, blob)


# ---------------------------------------------------------------------------
# 26.87-01 Task 3 (RED): the one-heavy-item cap (D-10..D-13) — pinned here
# BEFORE a line of pool code exists. Every call below hands `shelves=` (and
# the all-heavy case `anchors=`), two keywords build_librarian_payload does
# not carry yet; that TypeError IS this task's deliverable, and plan
# 26.87-06 turns it green. Landed RED-FIRST for the same reason 26.8-03's
# whys contract was: a contract written after the code can pass vacuously.
# ---------------------------------------------------------------------------

# The D-11 tripwire term this suite pins. 26.87-06 owns the shipped list
# (study_lib.REFLECTION_HEAVY_TERMS, RESEARCH Discovery 3); "grief" is a
# GENERIC AFFECT term — the only class D-24 admits alongside the user's own
# roster names. Never a word lifted from her vocabulary.
HEAVY_TERM = "grief"

# A small identity anchor set (D-06/D-08: deterministic structured anchors
# derived from store signals, never librarian prose). Plan 26.87-08 owns the
# shipped 8/5/6 shape and weights (Discovery 4); what this suite pins is the
# BEHAVIOUR that anchors give the bounded reach-back something legal to
# admit — not the schema, which is that plan's to settle.
ANCHORS = {"topics": ["loom", "knitting"],
           "tags": ["making"],
           "folders": ["loom"]}


class ReflectionHeavyCapTest(unittest.TestCase):
    """D-34, stated plainly and NOT to be written up as anything more: "at
    most one heavy item" is a defensible PROXY for a judgment this app
    structurally cannot make — titration and window-of-tolerance in the
    literature are live judgments with continuous feedback, and nobody
    prescribes a count — so it is a product decision, never a clinical
    standard."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def _item(self, i, ms, state="blessed", **kw):
        """One blessed text item with a controlled stamp — the
        ReflectionPoolBudgetTest._stamped fixture, bodies kept small so the
        shipped REFLECTION_DOC_BUDGET pass never fires and can never be
        mistaken for this one."""
        it = make_item(self.lib, i, state=state,
                       body=kw.pop("body", f"body-{i} 手记 " + "b" * 200),
                       **kw)
        it["created_ms"] = it["saved_ms"] = it["imported_ms"] = ms
        return it

    def _pool_ids(self, payload):
        """Every id the handed document actually carries — bodies and
        metadata rows alike. EVERY assertion in this class reads the
        PAYLOAD; none reads generated essay prose (there is none to read at
        pool-build time, and a cap proven against model output would not be
        a cap at all)."""
        return [row["id"] for row in payload["bodies"] + payload["meta_rows"]]

    # -- (i) the stored SORT label ------------------------------------------

    def test_five_labelled_heavy_keep_one_and_count_four(self):
        items = [self._item(i, 1700000000000 + i * 1000)
                 for i in range(1, 6)]
        store = make_store(self.lib, items)
        shelves = {it["id"]: "heavy" for it in items}
        p = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            shelves=shelves)
        heavy_ids = {it["id"] for it in items}
        kept = [i for i in self._pool_ids(p) if i in heavy_ids]
        self.assertEqual(len(kept), 1,
                         "one sitting carries at most ONE heavy item "
                         "(D-10, enforced at pool build — not left to the "
                         "prompt to remember)")
        self.assertEqual(kept[0], items[-1]["id"],
                         "the NEWEST row always survives the cap")
        self.assertEqual(p["counts"]["heavy-capped"], 4,
                         "every held-back row is counted, none silently")

    # -- (ii) the tripwire fallback -----------------------------------------

    def test_five_unlabelled_tripwire_matches_cap_the_same(self):
        self.assertIn(HEAVY_TERM, study_lib.REFLECTION_HEAVY_TERMS,
                      "the term this suite pins must BE a shipped tripwire "
                      "term, or every case below is vacuous")
        # title, tags, and folder are three separate surfaces (SE-3: the
        # heavy label is caller-resolved, not on the item) — each one alone
        # must trip the fallback.
        items = [
            self._item(1, 1700000001000,
                       title=f"{HEAVY_TERM} and the long winter.md"),
            self._item(2, 1700000002000, tags=[HEAVY_TERM]),
            self._item(3, 1700000003000, folder=HEAVY_TERM),
            self._item(4, 1700000004000,
                       title=f"a note about {HEAVY_TERM}.md"),
            self._item(5, 1700000005000, tags=["late", HEAVY_TERM]),
        ]
        store = make_store(self.lib, items)
        p = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            shelves={})
        ids = {it["id"] for it in items}
        kept = [i for i in self._pool_ids(p) if i in ids]
        self.assertEqual(len(kept), 1,
                         "an UNSORTED store gets the same protection — the "
                         "cap can never depend on the librarian having run")
        self.assertEqual(kept[0], items[-1]["id"],
                         "the NEWEST row always survives the cap")
        self.assertEqual(p["counts"]["heavy-capped"], 4)

    # -- (iii) both sources at once -----------------------------------------

    def test_mixed_labelled_and_unlabelled_cap_together(self):
        labelled = [self._item(i, 1700000000000 + i * 1000)
                    for i in range(1, 4)]
        unlabelled = [
            self._item(4, 1700000004000, tags=[HEAVY_TERM]),
            self._item(5, 1700000005000,
                       title=f"the {HEAVY_TERM} box.md"),
        ]
        store = make_store(self.lib, labelled + unlabelled)
        shelves = {it["id"]: "heavy" for it in labelled}
        p = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            shelves=shelves)
        ids = {it["id"] for it in labelled + unlabelled}
        kept = [i for i in self._pool_ids(p) if i in ids]
        self.assertEqual(len(kept), 1,
                         "ONE cap over ONE heavy set — the two sources are "
                         "not two budgets")
        self.assertEqual(kept[0], unlabelled[-1]["id"],
                         "the NEWEST row always survives the cap")
        self.assertEqual(p["counts"]["heavy-capped"], 4)

    # -- (iv) the stored label is trusted BOTH ways -------------------------

    def test_stored_label_is_trusted_in_both_directions(self):
        # D-11: the stored SORT label comes FIRST and the tripwire is only
        # a fallback — so a joyful item whose words happen to carry a
        # tripwire term is joyful. A word about grief in a joyful note is
        # not the same thing as a heavy note, and the librarian's own
        # verdict (which she confirmed) outranks a substring match.
        joyful = self._item(
            1, 1700000001000,
            title=f"the {HEAVY_TERM} we knitted through, and after.md",
            tags=[HEAVY_TERM])
        plain = [self._item(i, 1700000000000 + i * 1000)
                 for i in range(2, 5)]
        store = make_store(self.lib, [joyful] + plain)
        p = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            shelves={joyful["id"]: "joyful"})
        self.assertIn(joyful["id"], self._pool_ids(p),
                      "a labelled-joyful row is NOT heavy, whatever its "
                      "title says")
        self.assertEqual(p["counts"]["heavy-capped"], 0)
        # and the other direction: a labelled-heavy row with no tripwire
        # term anywhere in it IS heavy. ⚠ That direction is the ONLY one the
        # label still decides — #70 ruling 2 took the other away, because a
        # guess of `joyful` was switching the tripwire off (see
        # test_the_label_may_add_heavy_and_may_never_remove_it).
        heavy = [self._item(i, 1700000010000 + i * 1000)
                 for i in range(5, 8)]
        store2 = make_store(self.lib, heavy)
        p2 = study_lib.build_librarian_payload(
            store2, "reflection", store_dir=self.lib, session_marker=None,
            shelves={it["id"]: "heavy" for it in heavy})
        self.assertEqual(p2["counts"]["heavy-capped"], 2,
                         "no tripwire term in sight — the LABEL made them "
                         "heavy")

    # -- (v) the all-heavy sitting ------------------------------------------

    def test_all_heavy_pool_keeps_one_and_reaches_back(self):
        # D-13: when everything new is heavy, the sitting is not one heavy
        # item and silence. One heavy row rides, and the identity anchors
        # admit a bounded reach-back into already-seen material (SE-7: the
        # reach-back CAN re-admit what a past sitting already reflected on
        # — that is the point, not a bug) so the document still has enough
        # to write from.
        marker = 1700000500000
        new = [self._item(i, marker + i * 1000) for i in range(1, 5)]
        old = [self._item(20 + i, marker - 100000 - i * 1000,
                          tags=["making"], folder="loom")
               for i in range(1, 4)]
        store = make_store(self.lib, new + old)
        shelves = {it["id"]: "heavy" for it in new}
        shelves.update({it["id"]: "joyful" for it in old})
        p = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=marker,
            shelves=shelves, anchors=ANCHORS)
        ids = self._pool_ids(p)
        new_ids = {it["id"] for it in new}
        old_ids = {it["id"] for it in old}
        self.assertEqual(len([i for i in ids if i in new_ids]), 1,
                         "one heavy row, even when heavy is all there is")
        self.assertEqual(p["counts"]["heavy-capped"], 3)
        reached = [i for i in ids if i in old_ids]
        self.assertGreaterEqual(len(reached), 1,
                                "the anchors admitted something — an "
                                "all-heavy sitting is never one row alone")
        self.assertGreater(p["counts"]["reach-back"], 0,
                           "the reach-back is counted out loud, exactly "
                           "like every other pool move")
        self.assertEqual(p["counts"]["reach-back"], len(reached),
                         "the count IS the number of re-admitted rows — "
                         "bounded, and the bound is visible")
        material = sum(len(str(b.get("text") or "")) for b in p["bodies"])
        # 26.995-01: this used to read `server.LIBRARIAN_REFLECTION_FLOOR`,
        # which D-36 deleted. The number below is a LITERAL written here on
        # purpose — the claim this line makes is about the POOL (an
        # all-heavy sitting still hands the model real material to write
        # from), and it never depended on the validator's rule. 400 is kept
        # as the literal because it is the size this case was calibrated
        # against; it is this suite's own yardstick now, and moving it is a
        # decision about this fixture rather than about what a reflection
        # may be.
        self.assertGreater(material, 400,
                           "the document still carries more than 400 "
                           "characters of material — a pool too thin to "
                           "write from is a CAP failure, and this case is "
                           "about the cap")

    # -- (vi) present-and-zero ----------------------------------------------

    def test_counts_keys_present_and_zero_when_nothing_capped(self):
        # the ReflectionPoolBudgetTest idiom, verbatim in spirit: a
        # fail-visible count is declared even when it is zero, so a reader
        # can tell "nothing was held back" from "this build has no cap".
        store = make_store(self.lib, [self._item(1, 1700000000000)])
        p = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            shelves={})
        self.assertEqual(p["counts"].get("heavy-capped"), 0,
                         "the cap is declared even when nothing is held "
                         "back — fail-visible means always visible")
        self.assertEqual(p["counts"].get("reach-back"), 0,
                         "same rule for the reach-back: declared at zero, "
                         "never an absent key")

    # -- (vii) the keys stay OUT of the other scopes ------------------------

    def test_presort_and_note_counts_unchanged(self):
        # the heavy cap is a REFLECTION concern: the presort/note payloads
        # stay byte-identical to their shipped shapes (the 26.7-01 pin).
        # The shelves map is handed to BOTH here on purpose — a map
        # arriving at the wrong scope must change nothing at all.
        items = [self._item(i, 1700000000000 + i * 1000)
                 for i in range(1, 6)]
        store = make_store(self.lib, items)
        shelves = {it["id"]: "heavy" for it in items}
        for scope in ("presort", "note"):
            p = study_lib.build_librarian_payload(
                store, scope, store_dir=self.lib, shelves=shelves)
            self.assertNotIn("heavy-capped", p["counts"],
                             f"{scope} counts must not grow a key")
            self.assertNotIn("reach-back", p["counts"],
                             f"{scope} counts must not grow a key")
            plain = study_lib.build_librarian_payload(
                store, scope, store_dir=self.lib)
            self.assertEqual(json.dumps(p, ensure_ascii=False),
                             json.dumps(plain, ensure_ascii=False),
                             f"{scope} is byte-identical with and without "
                             f"the shelves map")

    # -- (viii) the fence still holds ---------------------------------------

    def test_fence_holds_under_the_heavy_cap_pass(self):
        fenced = make_item(self.lib, 99, state="never_show",
                           body=f"{FENCE_BODY}-heavy 私密的手记",
                           title=f"{FENCE_TITLE}-heavy.md")
        items = [self._item(i, 1700000000000 + i * 1000)
                 for i in range(1, 5)]
        store = make_store(self.lib, items + [fenced])
        # the fenced id is even LABELLED — a shelves entry is caller data
        # and can never re-admit what the fence already removed (law 5:
        # the exclusion runs first and is absolute).
        shelves = {it["id"]: "heavy" for it in items}
        shelves[fenced["id"]] = "joyful"
        p = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            shelves=shelves, anchors=ANCHORS)
        blob = json.dumps(p, ensure_ascii=False)
        self.assertNotIn(fenced["id"], blob, "fenced id leaked")
        self.assertNotIn(FENCE_TITLE, blob, "fenced title leaked")
        self.assertNotIn(FENCE_BODY, blob, "fenced body leaked")

    # -- (ix) determinism ---------------------------------------------------

    def test_same_store_built_twice_is_byte_identical(self):
        def build():
            items = [self._item(i, 1700000000000 + i * 1000)
                     for i in range(1, 6)]
            items += [self._item(6, 1700000006000, tags=[HEAVY_TERM]),
                      self._item(7, 1700000007000, folder=HEAVY_TERM)]
            store = make_store(self.lib, items)
            shelves = {it["id"]: "heavy" for it in items[:3]}
            shelves.update({it["id"]: "joyful" for it in items[3:5]})
            return study_lib.build_librarian_payload(
                store, "reflection", store_dir=self.lib,
                session_marker=None, shelves=shelves, anchors=ANCHORS)
        first = json.dumps(build(), ensure_ascii=False)
        second = json.dumps(build(), ensure_ascii=False)
        self.assertEqual(first, second,
                         "the cap is deterministic — which heavy row "
                         "survives is a RULE, never a sample. Two sittings "
                         "over the same archive must be answerable the "
                         "same way twice.")

    # -- (x) the notebook is fail-open --------------------------------------

    def test_missing_or_corrupt_suggestions_degrades_to_tripwire_only(self):
        # the shelves map is built by the CALLER from the librarian's
        # notebook, and load_suggestions is fail-open by design (it forgets
        # rather than ever blocking the room). A notebook that is missing,
        # truncated mid-write, or hand-edited to nonsense must therefore
        # leave the cap standing on the tripwire alone — never raise, and
        # never quietly stop protecting the sitting.
        items = [self._item(i, 1700000000000 + i * 1000,
                            tags=[HEAVY_TERM])
                 for i in range(1, 6)]
        store = make_store(self.lib, items)
        path = server._suggestions_path(self.lib)
        path.parent.mkdir(parents=True, exist_ok=True)
        for raw in (None, "", "{not json at all", '["a list"]',
                    '{"verdicts": "not a map"}'):
            if raw is None:
                path.unlink(missing_ok=True)
            else:
                path.write_text(raw, encoding="utf-8")
            book = study_lib.load_suggestions(path)
            shelves = {k: (v or {}).get("shelf")
                       for k, v in book["verdicts"].items()}
            self.assertEqual(shelves, {},
                             f"a broken notebook yields no labels: {raw!r}")
            p = study_lib.build_librarian_payload(
                store, "reflection", store_dir=self.lib,
                session_marker=None, shelves=shelves)
            ids = {it["id"] for it in items}
            self.assertEqual(
                len([i for i in self._pool_ids(p) if i in ids]), 1,
                f"tripwire-only cap must still hold: {raw!r}")
            self.assertEqual(p["counts"]["heavy-capped"], 4)
        # and the keyword's own absent-default is the same fail-open shape
        p2 = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            shelves=None)
        self.assertEqual(p2["counts"]["heavy-capped"], 4,
                         "shelves=None is a store with no notebook, not a "
                         "store with no cap")


# ---------------------------------------------------------------------------
# 26.87-08: the identity anchors (D-06/D-07/D-08/D-30/D-32, SRM-13) — the
# derived identity page, its four signals and their weights, every exclusion
# class, the evidence floor, the cross-language glad-marker agreement, and
# the deterministic pool lean that is SKIPPED below the floor.
#
# Every assertion here runs with ZERO model calls: the derivation is
# deterministic code output, which is the whole reason it exists in this
# form — it cannot hallucinate a self for her, and it is testable without a
# model or a network.
# ---------------------------------------------------------------------------

# A second, INDEPENDENT copy of the below-the-floor page (UI-SPEC S5). Typed
# out here rather than imported so the pin is a real one: if the shipped
# copy drifts by a byte — a "still getting to know you" line creeping in, a
# quota sentence, a heading — this fails.
THIN_PAGE = """# what the room has noticed about you

<!-- derived, not authored. safe to edit or delete; it re-derives.
     nothing here ever comes from a never-show, retired, or
     trigger-marked item. -->

there isn't much here yet. the room hasn't seen enough of your library
to say anything about you that would be true, so it isn't going to
guess. this page fills in on its own as you use the room.
"""


class IdentityAnchorTest(unittest.TestCase):
    """D-32, stated plainly: the fence prevents LEAKS, not FABRICATION.
    Nothing shipped catches a confident essay about an identity assembled
    from three signals, which is why the evidence floor is new here — and
    why below it the anchors are structurally empty rather than merely
    unused."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()
        self._budget = study_lib.REFLECTION_DOC_BUDGET

    def tearDown(self):
        study_lib.REFLECTION_DOC_BUDGET = self._budget
        self._tmp.cleanup()

    # -- fixtures ------------------------------------------------------------

    def _item(self, i, **kw):
        """One item with the four signals switchable. `folder` defaults to a
        NEUTRAL name on purpose: make_item's own default is "notes", which
        is an OWN_VOICE_FOLDERS seed entry, and a fixture that was silently
        own-voice would make every weight case wrong by three."""
        comments = kw.pop("comments", None)
        glad = kw.pop("glad", False)
        origin = kw.pop("origin_path", None)
        kw.setdefault("folder", "clips")
        it = make_item(self.lib, i, **kw)
        if origin is not None:
            it["origin_path"] = origin
        if comments:
            it["comments"] = [{"at": at, "text": text}
                              for at, text in comments]
        if glad:
            it["history"].append({"at": "2026-07-01T10:00:00-07:00",
                                  "from": it["state"], "to": it["state"],
                                  "via": study_lib.IDENTITY_GLAD_VIA})
        return it

    def _evidence(self, items, filters=None):
        store = make_store(self.lib, items, filters=filters)
        return study_lib.derive_identity_anchors(store)

    def _rich_store(self):
        """A store comfortably ABOVE the floor: ten blessed items with their
        own tag and folder, three of them commented on."""
        items = []
        for i in range(1, 11):
            kw = {"state": "blessed", "folder": "shelf-%d" % i,
                  "tags": ["theme-%d" % i]}
            if i <= 3:
                kw["comments"] = [("2026-07-0%dT09:00:00" % i,
                                   "her own words %d" % i)]
            items.append(self._item(i, **kw))
        return make_store(self.lib, items)

    # -- Task 1: the file family --------------------------------------------

    def test_the_three_helpers_exist_and_the_path_does_no_io(self):
        for name in ("identity_file_path", "derive_identity_anchors",
                     "load_identity_anchors"):
            self.assertTrue(callable(getattr(study_lib, name, None)),
                            "missing study_lib.%s" % name)
        path = study_lib.identity_file_path(self.lib)
        self.assertEqual(path, self.lib / "librarian" / "identity.md")
        self.assertFalse(path.exists(),
                         "the path helper is pure path math — it must not "
                         "create, touch, or stat anything into existence")
        self.assertFalse((self.lib / "librarian").exists())

    def test_the_written_page_states_its_own_contract(self):
        page = study_lib.render_identity_page(
            study_lib.derive_identity_anchors(self._rich_store()))
        self.assertIn("derived, not authored", page,
                      "the page must say it is derived, never authored")
        self.assertIn("safe to edit or delete; it re-derives", page,
                      "hers to correct or throw away (D-06)")
        self.assertIn("nothing here ever comes from a never-show, retired, "
                      "or", page)
        self.assertIn("trigger-marked item.", page,
                      "the never-from-a-fenced-item promise, in plain words")

    def test_write_creates_the_directory_and_swallows_a_failed_write(self):
        anchors = study_lib.derive_identity_anchors(self._rich_store())
        self.assertFalse((self.lib / "librarian").exists())
        text = study_lib.save_identity_file(self.lib, anchors)
        path = study_lib.identity_file_path(self.lib)
        self.assertTrue(path.exists(), "a missing parent is created")
        self.assertEqual(path.read_text(encoding="utf-8"), text)
        if os.name == "posix" and os.geteuid() != 0:
            ro = Path(self._tmp.name) / "readonly"
            ro.mkdir()
            os.chmod(ro, 0o500)
            try:
                out = study_lib.save_identity_file(ro, anchors)
                self.assertEqual(out, text,
                                 "the write is SWALLOWED and the caller "
                                 "continues — a derived profile must never "
                                 "block the room")
                self.assertFalse(
                    study_lib.identity_file_path(ro).exists())
            finally:
                os.chmod(ro, 0o700)

    def test_load_is_fail_open_on_missing_garbage_and_mangled(self):
        empty = study_lib.load_identity_anchors(self.lib)
        self.assertEqual(empty["evidence"], 0)
        self.assertTrue(empty["thin"])
        self.assertEqual(empty["tags"], [])

        path = study_lib.identity_file_path(self.lib)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"\x80\x81\xfe\xff not utf-8 at all \x00")
        garbage = study_lib.load_identity_anchors(self.lib)
        self.assertEqual(garbage, empty,
                         "random bytes read as no anchors, never as a raise")

        anchors = study_lib.derive_identity_anchors(self._rich_store())
        written = study_lib.save_identity_file(self.lib, anchors)
        lines = written.split("\n")
        head = lines.index(study_lib.IDENTITY_THEMES_HEADING)
        theme_lines = []
        for i in range(head + 1, len(lines)):
            if not lines[i].startswith("- "):
                break
            theme_lines.append(i)
        self.assertGreaterEqual(len(theme_lines), 3,
                                "need neighbours to prove they survive")
        victim = theme_lines[len(theme_lines) // 2]
        mangled_label = lines[victim][2:].rsplit(" (", 1)[0]
        lines[victim] = "- this line was hand-mangled and no longer parses"
        path.write_text("\n".join(lines), encoding="utf-8")
        after = study_lib.load_identity_anchors(self.lib)
        labels = [r["label"] for r in after["themes"]]
        self.assertNotIn(mangled_label, labels,
                         "the unparseable line is DROPPED, not an error")
        self.assertEqual(len(labels), len(theme_lines) - 1,
                         "exactly one line lost; the surrounding lines "
                         "still load")
        self.assertTrue(after["folders"],
                        "and the sections AFTER the mangled line still load")

    def test_the_round_trip_survives_derive_write_read_rerender(self):
        store = self._rich_store()
        anchors = study_lib.derive_identity_anchors(store)
        written = study_lib.save_identity_file(self.lib, anchors)
        reread = study_lib.load_identity_anchors(self.lib)
        self.assertEqual(study_lib.render_identity_page(reread), written,
                         "derive -> write -> read -> render is a fixed "
                         "point: the tolerant parser reads back exactly "
                         "what the generator wrote")
        again = study_lib.derive_identity_anchors(store)
        self.assertEqual(study_lib.render_identity_page(again), written,
                         "and re-deriving the same store re-writes the same "
                         "page — deleting the file loses nothing")

    def test_a_section_with_zero_entries_is_omitted_entirely(self):
        anchors = {"topics": [], "tags": [], "folders": ["loom"],
                   "themes": [],
                   "folder_rows": [{"label": "loom", "signals": 4}],
                   "phrases": [], "evidence": 40, "thin": False}
        page = study_lib.render_identity_page(anchors)
        self.assertNotIn(study_lib.IDENTITY_THEMES_HEADING, page,
                         "a bare heading with nothing under it is an "
                         "absence with a label on it")
        self.assertNotIn(study_lib.IDENTITY_WORDS_HEADING, page)
        self.assertNotIn("none yet", page)
        self.assertIn(study_lib.IDENTITY_FOLDERS_HEADING, page)

    # -- Task 2: the four signals, the weights, the floor --------------------

    def test_the_four_signals_and_their_weights(self):
        cases = (
            ("blessed alone", self._item(1, state="blessed"), 2),
            ("own-voice alone", self._item(2, folder="journal"), 3),
            ("blessed + glad", self._item(3, state="blessed", glad=True), 4),
            ("a comment (own-voice-adjacent too)",
             self._item(4, comments=[("2026-07-01T09:00:00", "hi")]), 6),
            ("all four at once",
             self._item(5, state="blessed", glad=True, folder="journal",
                        comments=[("2026-07-01T09:00:00", "hi")]), 10),
        )
        for label, item, expected in cases:
            got = self._evidence([item])["evidence"]
            self.assertEqual(got, expected,
                             "%s should weigh %d, got %d" %
                             (label, expected, got))

    def test_absence_is_never_a_signal(self):
        resting = self._item(1, state="resting")
        resting["history"].append({"at": "2026-07-01T10:00:00-07:00",
                                   "from": "blessed", "to": "resting",
                                   "via": "reaction:not_really"})
        self.assertEqual(self._evidence([resting])["evidence"], 0,
                         "a not_really reaction and the resting state are "
                         "an ABSENCE — law 3 bars the app from reasoning "
                         "about absence, so neither is ever a signal")
        unseen = self._item(2)
        self.assertEqual(self._evidence([unseen])["evidence"], 0,
                         "an unjudged, uncommented file is not evidence "
                         "about her")

    def test_every_exclusion_class_contributes_zero(self):
        def loaded(i, **kw):
            # a MAXIMAL item: blessed + glad + own-voice + her own comment.
            # It would weigh 10 if it were not excluded, so a zero here can
            # only come from the exclusion under test.
            base = dict(state="blessed", glad=True, folder="journal",
                        tags=["sentinel-theme"],
                        comments=[("2026-07-01T09:00:00", "spoken")])
            base.update(kw)
            return self._item(i, **base)
        cases = (
            ("never_show", [loaded(1, state="never_show")], None),
            ("retired", [loaded(2, state="retired")], None),
            ("trigger-marked", [loaded(3, trigger=True)], None),
            ("excluded by an active filter", [loaded(4)],
             [{"facet": "folder", "value": "journal"}]),
        )
        for label, items, filters in cases:
            anchors = self._evidence(items, filters=filters)
            self.assertEqual(anchors["evidence"], 0,
                             "%s must contribute nothing" % label)
            blob = json.dumps(anchors, ensure_ascii=False)
            self.assertNotIn("sentinel-theme", blob,
                             "%s must not contribute a token either" % label)

    def test_the_apps_own_prose_is_never_evidence_about_her(self):
        own = self._item(1, state="blessed", glad=True, source="librarian",
                         tags=["librarian-theme"],
                         comments=[("2026-07-01T09:00:00", "its own words")])
        self.assertEqual(self._evidence([own])["evidence"], 0,
                         "source == 'librarian' is the app's own reflection "
                         "(SE-11) — the room must never derive her identity "
                         "from its own prose")
        reflection = self._item(2, state="blessed", glad=True,
                                source="obsidian-vault",
                                folder=study_lib.REFLECTION_FOLDER,
                                tags=["reflection-theme"])
        reflection["reflects"] = True
        self.assertTrue(study_lib.is_reflection(reflection))
        self.assertEqual(self._evidence([reflection])["evidence"], 0,
                         "the vault's reflection-insight notes are a "
                         "machine's prose about her, not her voice")

    def test_no_title_and_no_body_ever_becomes_a_theme_token(self):
        it = self._item(1, state="blessed", glad=True, folder="loom",
                        tags=["knitting"],
                        title="SENTINELTITLE the long winter.md",
                        body="SENTINELBODY and more prose",
                        comments=[("2026-07-01T09:00:00", "the loom clicked")])
        # two more blessed rows so the store clears the floor and the
        # assertions below are made against a REAL derived anchor set
        # rather than the (always empty) thin one.
        company = [self._item(i, state="blessed", folder="loom",
                              tags=["knitting"]) for i in (2, 3)]
        anchors = self._evidence([it] + company)
        blob = json.dumps(anchors, ensure_ascii=False)
        self.assertNotIn("SENTINELTITLE", blob,
                         "a title never becomes a token — that is what "
                         "stops a fenced item's title reaching this file "
                         "through a surviving near-duplicate (T-27-18)")
        self.assertNotIn("SENTINELBODY", blob, "a body never becomes a token")
        self.assertIn("knitting", anchors["tags"])
        self.assertIn("loom", anchors["folders"])

    def test_the_floor_is_twelve_and_the_arithmetic_is_recorded(self):
        self.assertEqual(study_lib.IDENTITY_EVIDENCE_FLOOR, 12)
        src = (_REPO_ROOT / "study_lib.py").read_text(encoding="utf-8")
        self.assertIn("4 items x IDENTITY_WEIGHT_BLESSED (2) = 8", src,
                      "the constant's comment must show the four-blessing "
                      "arithmetic — the number IS the argument")
        fresh = study_lib.derive_identity_anchors(make_store(self.lib, []))
        self.assertEqual(fresh["evidence"], 0)
        self.assertTrue(fresh["thin"], "a fresh vault scores zero")
        four = self._evidence([self._item(i, state="blessed")
                               for i in range(1, 5)])
        self.assertEqual(four["evidence"], 8,
                         "the four-blessing tester scores eight — the case "
                         "AI-SPEC Finding B names")
        self.assertTrue(four["thin"], "eight lands BELOW the floor")
        for key in ("topics", "tags", "folders", "themes", "folder_rows",
                    "phrases"):
            self.assertEqual(four[key], [],
                             "below the floor the anchors are structurally "
                             "EMPTY, so they cannot ride into a prompt")
        self.assertFalse(study_lib.identity_anchors_active(four))

    def test_the_thin_page_is_byte_exact_and_asks_nothing(self):
        four = self._evidence([self._item(i, state="blessed")
                               for i in range(1, 5)])
        page = study_lib.render_identity_page(four)
        self.assertEqual(page, THIN_PAGE,
                         "the below-the-floor page is byte-exact — every "
                         "clause is load-bearing")
        self.assertNotIn("## ", page,
                         "no section headings: an empty section list reads "
                         "as a checklist of what she has not produced")
        self.assertFalse(any(ch.isdigit() for ch in page),
                         "no count, no percentage, no evidence number — a "
                         "meter on her self is what this page refuses to be")
        for near_miss in ("still getting to know you", "bless a few more",
                          "you haven't", "not enough", "keep going"):
            self.assertNotIn(near_miss, page)
        # the file is STILL WRITTEN below the floor.
        study_lib.save_identity_file(self.lib, four)
        self.assertEqual(
            study_lib.identity_file_path(self.lib).read_text(
                encoding="utf-8"), THIN_PAGE)

    def test_the_floor_never_reaches_the_client(self):
        for name in ("app.js", "index.html"):
            src = (_REPO_ROOT / name).read_text(encoding="utf-8")
            self.assertNotIn("IDENTITY_EVIDENCE_FLOOR", src)
            self.assertNotIn("identity.md", src,
                             "nothing renders differently in the app below "
                             "the floor: no banner, no 'still learning' "
                             "state, no meter, no nudge")

    def test_above_the_floor_three_sections_with_the_caps_applied(self):
        items = []
        for i in range(1, 13):
            items.append(self._item(
                i, state="blessed", glad=True, folder="shelf-%02d" % i,
                tags=["theme-%02d" % i],
                comments=[("2026-07-%02dT09:00:00" % i,
                           "phrase %02d " % i + "x" * 400)]))
        anchors = self._evidence(items)
        self.assertFalse(anchors["thin"])
        self.assertEqual(len(anchors["themes"]), study_lib.IDENTITY_THEME_CAP)
        self.assertEqual(len(anchors["folder_rows"]),
                         study_lib.IDENTITY_FOLDER_CAP)
        self.assertEqual(len(anchors["phrases"]),
                         study_lib.IDENTITY_PHRASE_CAP)
        for row in anchors["phrases"]:
            self.assertLessEqual(len(row["label"]),
                                 study_lib.IDENTITY_PHRASE_MAX)
        page = study_lib.render_identity_page(anchors)
        for heading in (study_lib.IDENTITY_THEMES_HEADING,
                        study_lib.IDENTITY_FOLDERS_HEADING,
                        study_lib.IDENTITY_WORDS_HEADING):
            self.assertIn(heading, page)
        for line in page.split("\n"):
            if line.startswith("- ") or line.startswith("> "):
                self.assertRegex(line, r"\((?:1 signal|\d+ signals)\)$",
                                 "every line carries its signal count")

    def test_a_single_signal_anchor_never_renders_a_plural_count(self):
        one = {"topics": [], "tags": ["a"], "folders": [],
               "themes": [{"label": "a", "signals": 1},
                          {"label": "b", "signals": 2}],
               "folder_rows": [], "phrases": [], "evidence": 40,
               "thin": False}
        page = study_lib.render_identity_page(one)
        self.assertIn("- a (1 signal)", page,
                      "the smallest possible tell that the page is "
                      "machine-written rather than noticed")
        self.assertIn("- b (2 signals)", page)

    def test_the_derivation_makes_no_model_call(self):
        src = (_REPO_ROOT / "study_lib.py").read_text(encoding="utf-8")
        start = src.index("def derive_identity_anchors(")
        end = src.index("\ndef ", start)
        body = src[start:end].lower()
        # 26.93-07: `call_librarian` in place of the deleted seam's name. The
        # claim is UNCHANGED and is now strictly stronger, because the token
        # named here is the ONLY route from store bytes to a model left in the
        # tree — naming it is naming all of them.
        for token in ("subprocess", "call_librarian", "popen", "requests",
                      "urllib"):
            self.assertNotIn(token, body,
                             "the derivation is deterministic code output: "
                             "zero model calls, zero new fence surface")

    # -- D-30: the cross-language glad-marker agreement ---------------------

    def test_the_glad_marker_agrees_with_the_shipped_javascript_readers(self):
        """The glad transition is WRITTEN by core.js and the ONLY shipped
        counter of it is app.js manageStatCounts — JavaScript, both of them.
        This python reader is the second reader of the same client-supplied
        literal, and two independent readers of one literal drift silently:
        a drifted reader here would simply stop counting a whole signal, and
        nothing else in the system would notice. So the agreement is
        asserted, not assumed."""
        app = (_REPO_ROOT / "app.js").read_text(encoding="utf-8")
        core = (_REPO_ROOT / "core.js").read_text(encoding="utf-8")
        pin = (_REPO_ROOT / "tests" / "test_core.cjs").read_text(
            encoding="utf-8")
        start = app.index("function manageStatCounts()")
        body = app[start:app.index("\n  }", start)]
        js_vias = set(re.findall(r"via === '([^']+)'", body))
        self.assertEqual(
            js_vias, {"opened", "reaction:glad", "reaction:never_again"},
            "the JS counter's whole token set is pinned here: if it grows a "
            "SECOND glad marker, this python reader would silently go blind "
            "to it, so the set must be re-read deliberately")
        self.assertIn(study_lib.IDENTITY_GLAD_VIA, js_vias,
                      "the python literal must BE one of the tokens the "
                      "shipped JS counter compares against")
        self.assertIn("'%s'" % study_lib.IDENTITY_GLAD_VIA, core,
                      "core.js is the WRITER of the marker — mirrored "
                      "byte-for-byte, never re-spelled")
        self.assertIn("via: '%s'" % study_lib.IDENTITY_GLAD_VIA, pin,
                      "and the shipped test_core.cjs pin on the glad "
                      "history entry names the same literal")
        # the reader itself tolerates everything the marker can arrive as:
        # it rides through the server client-supplied and unvalidated.
        for history in (None, [], "not a list", [None], [{"via": None}],
                        [{"via": "reaction:unknown_future"}], [{}], [42]):
            item = self._item(1, state="unseen")
            item["history"] = history
            self.assertEqual(
                study_lib.derive_identity_anchors(
                    make_store(self.lib, [item]))["evidence"], 0,
                "a missing / malformed / unknown marker reads as no glad, "
                "never as an error: %r" % (history,))

    # -- Task 3: pass A, the deterministic pool lean -------------------------

    def _lean_store(self):
        """Eight blessed rows whose bodies overflow a deliberately small
        budget. The ANCHORED rows are the OLDEST on purpose: the shipped
        budget pass sheds oldest-out, so without the lean they are exactly
        the rows that would be lost. That is what makes this case
        discriminating rather than decorative."""
        items = []
        for i in range(1, 5):
            it = self._item(i, state="blessed", folder="loom",
                            tags=["making"], body="A" * 3000)
            it["created_ms"] = it["saved_ms"] = 1700000000000 + i * 1000
            items.append(it)
        for i in range(5, 9):
            it = self._item(i, state="blessed", folder="clips",
                            tags=["misc"], body="B" * 3000)
            it["created_ms"] = it["saved_ms"] = 1700000000000 + i * 1000
            items.append(it)
        return make_store(self.lib, items), items

    ACTIVE_ANCHORS = {"topics": [], "tags": ["making"], "folders": ["loom"],
                      "evidence": 40, "thin": False}

    def _pool_ids(self, payload):
        return [row["id"] for row in payload["bodies"] + payload["meta_rows"]]

    def test_above_the_floor_the_lean_narrows_toward_anchored_rows(self):
        store, items = self._lean_store()
        anchored = {it["id"] for it in items[:4]}
        study_lib.REFLECTION_DOC_BUDGET = 12000
        leaned = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            anchors=self.ACTIVE_ANCHORS)
        plain = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None)
        kept = set(self._pool_ids(leaned))
        self.assertGreater(leaned["counts"]["identity-leaned"], 0,
                           "every leaned-away row is counted out loud")
        self.assertGreater(len(kept & anchored),
                           len(set(self._pool_ids(plain)) & anchored),
                           "the pool narrows TOWARD the anchored rows — "
                           "shipped behaviour would have shed them first, "
                           "because they are the oldest")
        self.assertLessEqual(len(json.dumps(leaned, ensure_ascii=False)),
                             12000, "the leaned document still fits")
        twice = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            anchors=self.ACTIVE_ANCHORS)
        self.assertEqual(json.dumps(leaned, ensure_ascii=False),
                         json.dumps(twice, ensure_ascii=False),
                         "the lean is deterministic — the same store twice "
                         "yields byte-identical payloads")

    def test_below_the_floor_the_pool_is_byte_identical_to_shipped(self):
        store, _items = self._lean_store()
        thin = self._evidence([self._item(90 + i, state="blessed")
                               for i in range(1, 5)])
        self.assertTrue(thin["thin"], "the four-blessing store is thin")
        study_lib.REFLECTION_DOC_BUDGET = 12000
        variants = []
        for anchors in (None, thin,
                        {"topics": [], "tags": [], "folders": []}):
            variants.append(json.dumps(
                study_lib.build_librarian_payload(
                    store, "reflection", store_dir=self.lib,
                    session_marker=None, anchors=anchors),
                ensure_ascii=False))
        self.assertEqual(variants[0], variants[1],
                         "below the floor the lean is SKIPPED and the pool "
                         "falls back to shipped behaviour byte-for-byte")
        self.assertEqual(variants[0], variants[2],
                         "and an empty anchor set is the same fixture")
        self.assertEqual(json.loads(variants[0])["counts"]["identity-leaned"],
                         0, "declared at zero, never an absent key")
        active = json.dumps(study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            anchors=self.ACTIVE_ANCHORS), ensure_ascii=False)
        self.assertNotEqual(variants[0], active,
                            "and the case is not vacuous: an ACTIVE anchor "
                            "set on the same store changes the pool")

    def test_an_anchor_set_with_no_recorded_evidence_is_inactive(self):
        # the 26.87-06 fixture shape carries no `evidence` key. Unknown
        # evidence reads as INACTIVE — fail-closed, the same
        # err-toward-holding-back posture the fence takes on an unknown
        # state — which is also why the ten heavy-cap cases are untouched.
        self.assertFalse(study_lib.identity_anchors_active(ANCHORS))
        self.assertFalse(study_lib.identity_anchors_active(None))
        self.assertFalse(study_lib.identity_anchors_active(
            {"tags": ["making"], "evidence": 11}))
        self.assertTrue(study_lib.identity_anchors_active(
            {"tags": ["making"], "evidence": 12}))
        self.assertFalse(study_lib.identity_anchors_active(
            {"tags": [], "topics": [], "folders": [], "evidence": 99}))

    def test_the_fence_holds_under_the_lean(self):
        store, _items = self._lean_store()
        fenced = make_item(self.lib, 99, state="never_show",
                           body=f"{FENCE_BODY}-lean 私密的手记",
                           title=f"{FENCE_TITLE}-lean.md")
        store["items"][fenced["id"]] = fenced
        study_lib.REFLECTION_DOC_BUDGET = 12000
        p = study_lib.build_librarian_payload(
            store, "reflection", store_dir=self.lib, session_marker=None,
            anchors=self.ACTIVE_ANCHORS)
        blob = json.dumps(p, ensure_ascii=False)
        self.assertNotIn(fenced["id"], blob, "fenced id leaked")
        self.assertNotIn(FENCE_TITLE, blob, "fenced title leaked")
        self.assertNotIn(FENCE_BODY, blob, "fenced body leaked")

    def test_presort_and_note_never_grow_the_lean_key(self):
        store, _items = self._lean_store()
        for scope in ("presort", "note"):
            p = study_lib.build_librarian_payload(
                store, scope, store_dir=self.lib,
                anchors=self.ACTIVE_ANCHORS)
            self.assertNotIn("identity-leaned", p["counts"],
                             "%s counts must not grow a key" % scope)
            plain = study_lib.build_librarian_payload(
                store, scope, store_dir=self.lib)
            self.assertEqual(json.dumps(p, ensure_ascii=False),
                             json.dumps(plain, ensure_ascii=False),
                             "%s is byte-identical with and without the "
                             "anchors" % scope)

    def test_the_four_passes_appear_in_order_in_the_source(self):
        src = (_REPO_ROOT / "study_lib.py").read_text(encoding="utf-8")
        lean = src.index("26.87-08 PASS A")
        cap = src.index("26.87-06 PASS B")
        reach = src.index("26.87-06 PASS C")
        # ⚠ 26.998-07: this anchor USED to read "the budget pass — oldest-out".
        # It was updated because the behaviour it named genuinely changed by
        # THE OWNER'S RULING — the cut now comes off the bottom of her own
        # ranking, not off the oldest. ⛔ The ASSERTION below is untouched:
        # what this case protects is the ORDER of the four passes, and that
        # order is unchanged. A stale anchor here fails the run rather than
        # passing silently, which is why it was caught the moment the comment
        # moved — that is the case working, not the case being in the way.
        budget = src.index("the budget pass — every drop counted")
        self.assertLess(lean, cap, "the lean shapes the candidate set first")
        self.assertLess(cap, reach, "then the cap bounds what is heavy")
        self.assertLess(reach, budget,
                        "and the shipped budget pass runs LAST — it is the "
                        "only one that may shrink the finished document, so "
                        "its invariants must see the final set")

    # -- UAT F1: the meaningless-token filter (owner-approved 2026-07-31) ----

    def test_date_shaped_and_artifact_tokens_are_refused(self):
        """The predicate itself, at its edges. NARROW BY DESIGN: it must
        catch when-and-where tokens and MUST NOT touch her subjects."""
        for label in ("2024", "2024-11", "2024-11-05", "2026-3", "2024_11",
                      "2024/11", "items", "Items", "  ITEMS  ",
                      "attachments", "untitled", "(root)", ".obsidian",
                      "studyroom-collect-k2ks84n7", "", "   ", None):
            self.assertTrue(
                study_lib._identity_meaningless_token(label),
                "should be refused as a when/where token: %r" % (label,))
        # HER SUBJECTS SURVIVE — including the awkward ones. A filter that
        # ate these would be worse than the noise it removes.
        for label in ("emotional-management", "literature", "e-books",
                      "Personal KB", "Reading notes and casual writing",
                      "nanjing", "pixel-art", "2024 in review",
                      "20th-century", "item", "collect",
                      "studyroom", "读书笔记"):
            self.assertFalse(
                study_lib._identity_meaningless_token(label),
                "must NOT be refused — this is a subject: %r" % (label,))

    def test_the_filter_narrows_the_page_but_never_the_evidence(self):
        """The F1 invariant in one test: date/artifact tokens leave the
        page, her real subject stays, and `evidence` is UNCHANGED — because
        an item with a date-shaped tag is still an item she blessed."""
        items = []
        for i in range(1, 11):
            # every item carries BOTH a date-shaped tag and a real one, so
            # the two cannot be separated by which items were counted.
            items.append(self._item(
                i, state="blessed", folder="2024-11",
                tags=["2024-11", "emotional-management"],
                comments=[("2026-07-0%d T09:00:00" % (i % 9 + 1),
                           "her own words %d" % i)]))
        got = self._evidence(items)
        labels = [t["label"] for t in got["themes"]]
        self.assertIn("emotional-management", labels)
        self.assertNotIn("2024-11", labels)
        self.assertNotIn("2024-11", [f["label"] for f in got["folder_rows"]])
        self.assertNotIn("2024-11", got["folders"])
        self.assertNotIn("2024-11", got["tags"])
        # NEGATIVE CONTROL on the evidence half: the same store with the
        # filter neutered must report the SAME evidence count. If filtering
        # ever starts reducing evidence, the floor silently changes meaning.
        real = study_lib._identity_meaningless_token
        try:
            study_lib._identity_meaningless_token = lambda label: False
            unfiltered = self._evidence(items)
        finally:
            study_lib._identity_meaningless_token = real
        self.assertEqual(got["evidence"], unfiltered["evidence"],
                         "the label filter must never move the evidence "
                         "count — it narrows what the room SAYS, not what "
                         "it counted")
        # ...and the control must actually bite, or the assertion above is
        # vacuous: unfiltered, the date token DOES reach the page.
        self.assertIn("2024-11", [t["label"] for t in unfiltered["themes"]],
                      "negative control did not land — if the date token is "
                      "absent even unfiltered, this test proves nothing")


# ---------------------------------------------------------------------------
# 26.8-03: the whys contract (D-10) — optional schema field, fail-closed
# strip-unrequested, surviving values inside the field scans, spotlight
# row flags that provably never gate, and the draft-land ledger upgrade.
# Landed RED-FIRST (Pitfall 2): the stub's whys pass-through precedes any
# server whys support, so none of these can pass vacuously.
# ---------------------------------------------------------------------------

WHY_A = "a" * 16
WHY_C = "c" * 16
WHY_D = "d" * 16
GOOD_WHY = "she kept the selvedge even — a steady hand 她自己的话"


def whys_wire(pairs):
    """The WIRE shape a model answers in (#68 ruling 1): a LIST of
    {id, reason} objects. Written as a helper so these tests state the
    id/reason pairs they are about and never re-spell the envelope —
    and so the one place the wire shape is built in this file is the
    one place a future shape change edits."""
    return [{"id": k, "reason": v} for k, v in pairs]


class WhysContractTest(unittest.TestCase):
    """26.8-03 (D-10): REFLECTION_SCHEMA_JSON gains `whys` as an OPTIONAL
    property; validate_reflection strips fail-closed (the
    question_stripped move: draft kept, ok True, fail-visible category
    "whys_stripped") and surviving why values join the fields tuple for
    the fenced-title / no-push / clinical scans.

    ⚠ AMENDED by map #50 / #68 ruling 1: the wire shape is a LIST OF
    {id, reason} PAIRS, not a map. The map spelling was refused outright
    by Anthropic (`additionalProperties: object` is not supported), which
    killed the generation turn AND every refine turn on any Anthropic key
    — the whole candle session. Every behaviour below is unchanged; only
    the envelope the entries arrive in is different, and
    validate_reflection still hands back the same map."""

    def test_schema_gains_optional_whys(self):
        schema = json.loads(server.REFLECTION_SCHEMA_JSON)
        # 26.995-05 CONSCIOUS PIN EDIT — 2026-08-19, D-06: `name` joined
        # the shape (see test_contract_constants for the full reason and
        # the owner ruling). This case is still about WHYS; the property
        # set moves because it is an exact-set compare, which is the
        # property worth keeping.
        # 26.995-06 task 1a CONSCIOUS PIN EDIT — 2026-08-18, D-05 (owner
        # ruling `a-short-said-field`): `said` joins the shape for the same
        # kind of reason and by the same rule — the compare stays EXACT,
        # this case stays about whys, and the set moves deliberately.
        # 26.995-06 task 2 CONSCIOUS PIN EDIT — 2026-08-19, D-05: the
        # question property LEAVES the shape (see test_contract_constants
        # for the ruling and for the cap that went with it). Exact-set
        # compare kept; this case is still about whys.
        # 26.995-12 CONSCIOUS PIN EDIT — 2026-08-20, D-13: the `coda`
        # property LEAVES the shape (see test_contract_constants for the
        # ruling and for the label that went with it). Exact-set compare
        # kept; this case is still about whys.
        self.assertEqual(set(schema["properties"]),
                         {"reflection", "name", "said", "whys"},
                         "the whys property joins the contract shape")
        self.assertEqual(schema["required"], ["reflection"],
                         "whys is OPTIONAL — the eval pin's required "
                         "list stays exactly ['reflection']")
        whys = schema["properties"]["whys"]
        self.assertEqual(whys["type"], ["array", "null"],
                         "#68 ruling 1: a LIST of pairs — the map "
                         "spelling is the one Anthropic refuses")
        item = whys["items"]
        self.assertEqual(set(item["properties"]), {"id", "reason"})
        self.assertEqual(sorted(item["required"]), ["id", "reason"])
        self.assertIs(item["additionalProperties"], False,
                      "every object in this schema closes — an OPEN "
                      "additionalProperties anywhere is the 400")
        self.assertIs(schema["additionalProperties"], False)

    def test_requested_whys_pass_through_verbatim(self):
        structured = {"reflection": GOOD_ESSAY, "coda": None,
                      "question": None,
                      "whys": whys_wire([(WHY_A, GOOD_WHY)])}
        ok, cleaned, why = server.validate_reflection(
            structured, [], [], why_wanted_ids=(WHY_A,))
        self.assertTrue(ok)
        self.assertIsNone(why, "a fully-requested list strips nothing")
        self.assertEqual(cleaned["whys"], {WHY_A: GOOD_WHY},
                         "requested whys survive validation verbatim, "
                         "and land as the MAP every reader downstream "
                         "already speaks")
        self.assertEqual(cleaned["reflection"], GOOD_ESSAY)

    def test_unrequested_nonstring_and_empty_entries_strip(self):
        structured = {"reflection": GOOD_ESSAY,
                      "whys": whys_wire([(WHY_A, GOOD_WHY),
                                         ("b" * 16, "never asked for"),
                                         (WHY_C, 42),
                                         (WHY_D, "   ")])}
        ok, cleaned, why = server.validate_reflection(
            structured, [], [],
            why_wanted_ids=(WHY_A, WHY_C, WHY_D))
        self.assertTrue(ok, "the draft is KEPT — the strip is never a "
                            "rejection (the question_stripped move)")
        self.assertEqual(why, "whys_stripped",
                         "fail-visible category, never the content")
        self.assertEqual(cleaned["whys"], {WHY_A: GOOD_WHY},
                         "outside-the-set / non-string / empty entries "
                         "all strip; the good entry survives")

    def test_malformed_entries_strip_and_the_draft_is_kept(self):
        """A list can carry junk a map could not: entries that are not
        objects at all, and entries missing either half of the pair.
        Each strips alone — the draft never falls with them."""
        structured = {"reflection": GOOD_ESSAY,
                      "whys": [{"id": WHY_A, "reason": GOOD_WHY},
                               "a bare string",
                               42,
                               None,
                               {"reason": "no id at all"},
                               {"id": WHY_C}]}
        ok, cleaned, why = server.validate_reflection(
            structured, [], [], why_wanted_ids=(WHY_A, WHY_C))
        self.assertTrue(ok, "draft kept — a malformed entry is surplus "
                            "content, never a rejection")
        self.assertEqual(why, "whys_stripped")
        self.assertEqual(cleaned["whys"], {WHY_A: GOOD_WHY})

    def test_a_repeated_id_keeps_the_first_reason(self):
        """A list can say the same id twice where a map structurally
        could not. FIRST WINS: letting a later entry overwrite an
        earlier one would make the answer's own ordering decide what
        she keeps."""
        structured = {"reflection": GOOD_ESSAY,
                      "whys": whys_wire([(WHY_A, GOOD_WHY),
                                         (WHY_A, "a second, later go")])}
        ok, cleaned, why = server.validate_reflection(
            structured, [], [], why_wanted_ids=(WHY_A,))
        self.assertTrue(ok, "draft kept")
        self.assertEqual(why, "whys_stripped",
                         "the surplus entry is fail-visible")
        self.assertEqual(cleaned["whys"], {WHY_A: GOOD_WHY},
                         "the FIRST reason survives the repeat")

    def test_whys_when_nothing_requested_strip_whole(self):
        structured = {"reflection": GOOD_ESSAY,
                      "whys": whys_wire([(WHY_A, "uninvited")])}
        ok, cleaned, why = server.validate_reflection(structured, [], [])
        self.assertTrue(ok, "draft kept")
        self.assertEqual(why, "whys_stripped")
        self.assertNotIn("whys", cleaned,
                         "entries arriving when nothing was requested "
                         "strip WHOLE — no key persists")

    def test_non_list_whys_strips_whole_draft_kept(self):
        """⚠ THE OLD MAP SHAPE LANDS HERE NOW, and that is the point:
        the map is the spelling this schema can no longer ask for, so a
        model that answers in one has answered off-contract."""
        for bad in ("a string", 42, {WHY_A: GOOD_WHY}, {}):
            ok, cleaned, why = server.validate_reflection(
                {"reflection": GOOD_ESSAY, "whys": bad}, [], [],
                why_wanted_ids=(WHY_A,))
            self.assertTrue(ok, f"draft kept for whys={bad!r}")
            self.assertEqual(why, "whys_stripped")
            self.assertNotIn("whys", cleaned)

    def test_null_whys_is_simply_absent(self):
        ok, cleaned, why = server.validate_reflection(
            {"reflection": GOOD_ESSAY, "whys": None}, [], [],
            why_wanted_ids=(WHY_A,))
        self.assertTrue(ok)
        self.assertIsNone(why, "an explicit null is the schema's own "
                               "absent — nothing to strip")
        self.assertNotIn("whys", cleaned)

    def test_empty_list_is_simply_absent(self):
        ok, cleaned, why = server.validate_reflection(
            {"reflection": GOOD_ESSAY, "whys": []}, [], [],
            why_wanted_ids=(WHY_A,))
        self.assertTrue(ok)
        self.assertIsNone(why, "an empty list answered nothing and "
                               "stripped nothing")
        self.assertNotIn("whys", cleaned,
                         "never an invented empty map")

    def test_surviving_whys_join_the_field_scans(self):
        cases = (
            ([(WHY_A, GOOD_WHY + " next to fence-title-secret-note")],
             "fenced_title", ["fence-title-secret-note"]),
            ([(WHY_A, "it's been three weeks since you last opened "
                      "any of this.")], "no_push", []),
            ([(WHY_A, "this reads like a coping mechanism.")],
             "clinical_claim", []),
        )
        for pairs, expect, corpus in cases:
            ok, cleaned, why = server.validate_reflection(
                {"reflection": GOOD_ESSAY, "whys": whys_wire(pairs)},
                corpus, [], why_wanted_ids=(WHY_A,))
            self.assertFalse(ok, f"a surviving why value must hit the "
                                 f"{expect} scan")
            self.assertIsNone(cleaned)
            self.assertEqual(why, expect)

    def test_her_quoted_words_in_a_why_stay_exempt(self):
        reason = ('you wrote "don\'t forget to come back to '
                  'this" — kept in your own words.')
        ok, cleaned, why = server.validate_reflection(
            {"reflection": GOOD_ESSAY,
             "whys": whys_wire([(WHY_A, reason)])}, [], [],
            why_wanted_ids=(WHY_A,))
        self.assertTrue(ok, "HER quoted words inside a why never trip "
                            "the voice screens (laws 2/4)")
        self.assertEqual(cleaned["whys"], {WHY_A: reason})


class WhysMembershipInvarianceTest(unittest.TestCase):
    """26.8-03 (D-03/D-04): blessed_now / why_wanted are EMPHASIS, never
    gate — pool membership, order, and every non-flag byte provably
    identical with flags on vs off; flags land only on flagged rows; a
    fenced id handed as a flag admits nothing."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    @staticmethod
    def _strip_flags(payload):
        out = copy.deepcopy(payload)
        for key in ("bodies", "meta_rows"):
            for row in out[key]:
                row.pop("blessed_now", None)
                row.pop("why_wanted", None)
        return out

    def test_flags_never_change_membership_or_order(self):
        a = make_item(self.lib, 1, state="blessed", body="page a")
        b = make_item(self.lib, 2, state="blessed", body="page b")
        img = make_item(self.lib, 3, state="blessed", type_="image")
        unseen = make_item(self.lib, 4, state="unseen", body="unjudged")
        fenced = make_item(self.lib, 5, state="never_show",
                           body=f"{FENCE_BODY}-inv 私密的手记",
                           title=f"{FENCE_TITLE}-inv.md")
        store = make_store(self.lib, [a, b, img, unseen, fenced])
        base = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None)
        flagged = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None,
            spotlight_ids=(a["id"], img["id"]),
            why_wanted_ids=(a["id"],))
        self.assertEqual(self._strip_flags(flagged), base,
                         "flags on vs off: byte-identical pools once "
                         "the flags themselves are removed — emphasis, "
                         "never gate (D-03/D-04)")
        by_id = {r["id"]: r for r in
                 flagged["bodies"] + flagged["meta_rows"]}
        self.assertIs(by_id[a["id"]].get("blessed_now"), True)
        self.assertIs(by_id[a["id"]].get("why_wanted"), True)
        self.assertIs(by_id[img["id"]].get("blessed_now"), True,
                      "a blessed IMAGE rides as a meta row — its flag "
                      "lands on that row")
        self.assertNotIn("why_wanted", by_id[img["id"]])
        for rid in (b["id"], unseen["id"]):
            self.assertNotIn("blessed_now", by_id[rid])
            self.assertNotIn("why_wanted", by_id[rid])

    def test_no_flags_means_no_flag_keys_anywhere(self):
        a = make_item(self.lib, 1, state="blessed", body="page a")
        store = make_store(self.lib, [a])
        p = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None)
        blob = json.dumps(p, ensure_ascii=False)
        self.assertNotIn("blessed_now", blob,
                         "a nothing-blessed session's payload is "
                         "byte-identical to 26.7 — no flag keys at all")
        self.assertNotIn("why_wanted", blob)

    def test_fenced_id_flag_admits_nothing(self):
        a = make_item(self.lib, 1, state="blessed", body="page a")
        fenced = make_item(self.lib, 2, state="never_show",
                           body=f"{FENCE_BODY}-adm 私密的手记",
                           title=f"{FENCE_TITLE}-adm.md")
        store = make_store(self.lib, [a, fenced])
        base = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None)
        p = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None,
            spotlight_ids=(fenced["id"],),
            why_wanted_ids=(fenced["id"],))
        self.assertEqual(p, base,
                         "a fenced id handed as a flag changes NOTHING "
                         "— the fence ran first, no row exists to flag")
        self.assertNotIn(fenced["id"],
                         json.dumps(p, ensure_ascii=False))


class WhysSessionEndToEndTest(unittest.TestCase):
    """26.8-03 end-to-end over the live routes (the RefineTurnFenceTest
    harness): the walk field on the session POST validates fail-closed,
    requested whys persist into session.json and complete the ledger at
    draft-land (author 'user' never overwritten), unrequested whys strip
    fail-visible, a fenced title inside a why value rejects the whole
    draft, and every surface — recorded stdin, session.json,
    blessings.json — stays sentinel-clean."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()
        self.log = Path(self._tmp.name) / "fake.log"
        # 26.93-07: the RefineTurnFenceTest harness, and the same ordering
        # rule for the same reason — the guard is entered BEFORE the server
        # exists, so the librarian's own daemon threads run inside it. Neither
        # canned-answer toggle is set here: `fake_claude_env` pops both, and
        # each case sets FAKE_CLAUDE_REFLECTION to the envelope it needs.
        self._env = fake_claude_env(self.log)
        self._env.__enter__()
        self.addCleanup(self._env.__exit__, None, None, None)
        with server.LIBRARIAN_LOCK:
            server.LIBRARIAN_JOB.update(state="idle", total=0, done=0,
                                        cost_usd=0.0, auth=None,
                                        message=None,
                                        unknown_id_verdicts=0,
                                        started_ms=0, stage=None,
                                        rejected_drafts=0,
                                        rejected_why=None)
        no_cached_probe()
        self.httpd = server.create_server(self.lib, 0)
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever,
                                       daemon=True)
        self.thread.start()

    def tearDown(self):
        # The server stops while the swap is still in place; the guard's own
        # restore is a registered cleanup and runs after this.
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=5)

    def request_json(self, method, path, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port,
                                          timeout=30)
        try:
            if body is not None:
                conn.request(method, path,
                             json.dumps(body,
                                        ensure_ascii=False).encode(
                                 "utf-8"),
                             {"Content-Type": "application/json"})
            else:
                conn.request(method, path)
            resp = conn.getresponse()
            return resp.status, json.loads(resp.read())
        finally:
            conn.close()

    def wait_job(self, timeout=20.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            _, snap = self.request_json("GET", "/api/librarian/progress")
            if snap["state"] in ("done", "stopped", "paused", "error"):
                return snap
            time.sleep(0.01)
        self.fail("the librarian job never finished")

    def _fresh(self, it):
        fresh_ms = int(time.time() * 1000) - 3600 * 1000
        it["created_ms"] = it["saved_ms"] = fresh_ms
        it["imported_ms"] = fresh_ms
        return it

    def _seed(self):
        """Two blessed text items + one fenced sentinel item, live
        stamps, librarian on. Returns (a, b, fenced)."""
        a = self._fresh(make_item(self.lib, 1, state="blessed",
                                  body="SAFE-BLESSED-A 安全的手记"))
        b = self._fresh(make_item(self.lib, 2, state="blessed",
                                  body="SAFE-BLESSED-B"))
        fenced = self._fresh(make_item(
            self.lib, 3, state="never_show",
            body=f"{FENCE_BODY}-e2e 私密的手记",
            title=f"{FENCE_TITLE}-e2e-0000001003.md"))
        store = make_store(self.lib, [a, b, fenced])
        store["meta"]["librarian_enabled"] = True
        study_lib.save_store(self.lib, store)
        return a, b, fenced

    def _assert_sentinel_clean(self, blob, where, fenced_ids):
        self.assertNotIn(FENCE_BODY, blob, f"body sentinel in {where}")
        self.assertNotIn(FENCE_TITLE, blob, f"title sentinel in {where}")
        for fid in fenced_ids:
            self.assertNotIn(fid, blob, f"fenced id in {where}")

    def test_whys_persist_ledger_upgrades_and_user_words_win(self):
        a, b, fenced = self._seed()
        librarian_why = "the selvedge line held — her own steady hand"
        # the ledger BEFORE the session: a's librarian-door default entry
        # (upgradable), a's OLDER user entry (untouchable), b's user
        # entry (untouchable; b's why is never requested anyway).
        user_a = {"item_id": a["id"], "ms": 500,
                  "why": "我自己写的 — my words", "author": "user"}
        default_a = {"item_id": a["id"], "ms": 1000,
                     "why": "felt blessed after reading it",
                     "author": "default"}
        user_b = {"item_id": b["id"], "ms": 2000,
                  "why": "kept in her words", "author": "user"}
        study_lib.save_blessings(self.lib, [user_a, default_a, user_b])
        os.environ["FAKE_CLAUDE_REFLECTION"] = json.dumps(
            {"reflection": GOOD_ESSAY, "coda": None, "question": None,
             # #68 ruling 1: the WIRE shape is a list of {id, reason}
             # pairs — see whys_wire / REFLECTION_SCHEMA_JSON.
             "whys": whys_wire(
                 [(a["id"], librarian_why),
                  (b["id"], "uninvited — b was never requested")])},
            ensure_ascii=False)
        no_cached_probe()
        bogus = "beef" * 4
        status, data = self.request_json(
            "POST", "/api/librarian/session",
            {"consent": False,
             "walk": {"blessed": [a["id"], b["id"], bogus],
                      "why_wanted": [a["id"]]}})
        self.assertEqual(status, 200, f"start refused: {data}")
        self.assertIs(data.get("running"), True, data)
        snap = self.wait_job()
        self.assertEqual(snap["state"], "done", f"errored: {snap}")
        self.assertEqual(snap.get("unknown_id_verdicts"), 1,
                         "the bogus walk id was dropped AND counted "
                         "(the unknown_id_verdicts idiom)")
        self.assertEqual(snap.get("rejected_why"), "whys_stripped",
                         "b's unrequested why stripped fail-visible")
        # session.json: the validated whys map + the requested set
        raw = (self.lib / "librarian" / "session.json").read_text(
            encoding="utf-8")
        doc = json.loads(raw)
        self.assertEqual(doc.get("whys"), {a["id"]: librarian_why},
                         "requested whys persist beside draft/coda/"
                         "question; unrequested stripped")
        self.assertEqual(doc.get("why_wanted"), [a["id"]],
                         "the cleaned request set persists for the "
                         "refine turns' own validation")
        # the recorded stdin: flags ride the pool rows (builder-emitted)
        rec = json.loads(self.log.read_text(encoding="utf-8"))
        pool = json.loads(rec["stdin"])["pool"]
        rows = {r["id"]: r for r in pool["bodies"] + pool["meta_rows"]}
        self.assertIs(rows[a["id"]].get("blessed_now"), True)
        self.assertIs(rows[a["id"]].get("why_wanted"), True)
        self.assertIs(rows[b["id"]].get("blessed_now"), True)
        self.assertNotIn("why_wanted", rows[b["id"]])
        # the draft-land ledger upgrade — under _BLESSINGS_LOCK alone
        entries = study_lib.load_blessings(self.lib)["blessings"]
        by_key = {(e["item_id"], e["ms"]): e for e in entries}
        upgraded = by_key[(a["id"], 1000)]
        self.assertEqual(upgraded["why"], librarian_why,
                         "a's newest NON-user entry upgraded at "
                         "draft-land")
        self.assertEqual(upgraded["author"], "librarian")
        self.assertEqual(by_key[(a["id"], 500)], user_a,
                         "her own words are NEVER overwritten by any "
                         "upgrade path")
        self.assertEqual(by_key[(b["id"], 2000)], user_b,
                         "an unrequested id upgrades nothing")
        # every surface sentinel-clean
        fenced_ids = [fenced["id"]]
        self._assert_sentinel_clean(rec["stdin"],
                                    "the generation stdin", fenced_ids)
        self._assert_sentinel_clean(raw, "librarian/session.json",
                                    fenced_ids)
        ledger_raw = (self.lib / "librarian" /
                      "blessings.json").read_text(encoding="utf-8")
        self._assert_sentinel_clean(ledger_raw,
                                    "librarian/blessings.json",
                                    fenced_ids)

    def test_fenced_title_inside_a_why_rejects_the_whole_draft(self):
        a, b, fenced = self._seed()
        default_a = {"item_id": a["id"], "ms": 1000,
                     "why": "felt blessed after reading it",
                     "author": "default"}
        study_lib.save_blessings(self.lib, [default_a])
        os.environ["FAKE_CLAUDE_REFLECTION"] = json.dumps(
            {"reflection": GOOD_ESSAY, "coda": None, "question": None,
             "whys": whys_wire(
                 [(a["id"], "it sits beside " + fenced["title"])])},
            ensure_ascii=False)
        no_cached_probe()
        status, data = self.request_json(
            "POST", "/api/librarian/session",
            {"consent": False,
             "walk": {"blessed": [a["id"]],
                      "why_wanted": [a["id"]]}})
        self.assertEqual(status, 200, f"start refused: {data}")
        snap = self.wait_job()
        self.assertEqual(snap["state"], "error",
                         "a fenced title inside a why value rejects "
                         "the WHOLE draft fail-closed")
        self.assertEqual(snap.get("rejected_why"), "fenced_title")
        self.assertFalse(
            (self.lib / "librarian" / "session.json").exists(),
            "no session file persists from a rejected draft")
        entries = study_lib.load_blessings(self.lib)["blessings"]
        self.assertEqual(entries, [default_a],
                         "a rejected draft upgrades NOTHING — the "
                         "ledger is byte-untouched")

    def test_resume_ignores_a_walk_field(self):
        a, b, fenced = self._seed()
        # a held OFFERED session file — the resume target
        held = {"state": "offered", "consented": False,
                "pool": {"meta_rows": [], "bodies": [], "counts": {}},
                "draft": GOOD_ESSAY, "coda": None, "question": None,
                "chat": [], "created_ms": 1}
        study_lib.save_session_file(self.lib, held)
        status, data = self.request_json(
            "POST", "/api/librarian/session",
            {"intent": "resume",
             "walk": {"blessed": [a["id"]],
                      "why_wanted": [a["id"]]}})
        self.assertEqual(status, 200, f"resume refused: {data}")
        self.assertIs(data.get("resumed"), True)
        doc = study_lib.load_session_file(self.lib)
        self.assertNotIn("why_wanted", doc,
                         "a resume body's stray walk field is IGNORED "
                         "— the held pool is frozen (26.7-05)")


class RosterOverBreadthTest(unittest.TestCase):
    """26.87 UAT, owner-approved 2026-07-31. The heaviness tripwire's
    institutional half is DERIVED from her own fenced-roster folder names
    (D-24 — that vocabulary must never ship as source). Matched as
    substrings against the folder facet, a roster entry "Journal" made the
    deliberately-surfaceable "Journal analysis" folder read heavy: she
    fenced one folder and silently caught its neighbour.

    Inert when it landed — her roster was empty — which is precisely why it
    was the safe moment to fix it."""

    def _item(self, **kw):
        it = {"title": "", "folder": "", "tags": []}
        it.update(kw)
        return it

    def test_a_roster_term_no_longer_catches_a_neighbouring_folder(self):
        neighbour = self._item(folder="Journal analysis", title="a note")
        self.assertFalse(
            study_lib._reflection_heavy(neighbour, None, ("Journal",)),
            "'Journal analysis' is a DIFFERENT folder from 'Journal' — "
            "fencing one must never quietly reclassify the other")

    def test_the_fenced_folder_itself_still_reads_heavy(self):
        """The narrowing must not disarm the roster — that would be a worse
        bug than the over-breadth, and in the unsafe direction."""
        for folder in ("Journal", "journal", "  JOURNAL  "):
            self.assertTrue(
                study_lib._reflection_heavy(
                    self._item(folder=folder), None, ("Journal",)),
                "the roster folder itself must still count: %r" % folder)

    def test_roster_terms_still_match_titles_and_tags_as_substrings(self):
        """Title and tags are PROSE, so a roster word appearing inside them
        is a real signal and keeps the substring path."""
        self.assertTrue(study_lib._reflection_heavy(
            self._item(title="my journal entry for tuesday"), None,
            ("journal",)))
        self.assertTrue(study_lib._reflection_heavy(
            self._item(tags=["journal-2024"]), None, ("journal",)))

    def test_the_shipped_stems_did_not_inherit_the_narrowing(self):
        """REFLECTION_HEAVY_TERMS are stems CHOSEN to match as substrings —
        'diagnos' must still catch 'diagnosis', including in a folder name.
        Narrowing them too would have starved the cap."""
        self.assertTrue(study_lib._reflection_heavy(
            self._item(folder="diagnosis-paperwork")),
            "a shipped stem must still match a folder as a SUBSTRING")
        self.assertTrue(study_lib._reflection_heavy(
            self._item(folder="grief-work")))

    def test_negative_control_the_old_shape_did_collide(self):
        """If the substring path never caught the neighbour to begin with,
        the first test proves nothing. Reproduce the OLD comparison and
        assert it DOES collide."""
        neighbour = self._item(folder="Journal analysis")
        hay = study_lib._reflection_heaviness_haystack(neighbour)
        self.assertIn("journal", hay,
                      "control did not land — under the old whole-haystack "
                      "substring match this item WAS caught, which is the "
                      "collision being fixed")

    def test_the_label_may_add_heavy_and_may_never_remove_it(self):
        """⚠ AMENDED BY #70 RULING 2 (built 2026-08-15), and this test used to
        assert the DEFECT: "a real label is trusted both ways".

        Trusting it the second way meant any label — `joyful`, `receipts`, or
        `unsure`, which is the sort DECLINING TO DECIDE — switched off the
        tripwire that reads a note's own words. Ten of the owner's notes had
        lost their protection to a guess when this was built.

        The label may now only ADD heaviness. A note whose own words carry a
        tripwire term keeps its protection whatever the sort called it."""
        it = self._item(folder="Journal")
        for guess in ("joyful", "receipts", "unsure"):
            self.assertTrue(
                study_lib._reflection_heavy(it, guess, ("Journal",)),
                "a guess of %r may not cancel the tripwire" % guess)
        self.assertTrue(study_lib._reflection_heavy(it, "heavy", ()))
        # and with nothing of its own to trip, a light label still reads light
        plain = self._item(folder="recipes")
        self.assertFalse(study_lib._reflection_heavy(plain, "joyful", ()))
        self.assertTrue(study_lib._reflection_heavy(plain, "heavy", ()))


class UnsupportedSourceAskTest(unittest.TestCase):
    """26.87 UAT F7. Asked to CONNECT a source she does not have, the room
    proposed DISCONNECTING the only one she does — a legal-but-wrong value
    that no downstream validator can catch, because `apple-notes` is a real
    ADAPTER_SOURCES member and `[]` is a real connected_sources.

    The cause was never the model: connected_sources is not in
    MODEL_PROPOSABLE_KEYS, so the model correctly emitted nothing. The bad
    value was minted by _config_pick's single-candidate fallback, which read
    "nothing to guess between" off the candidate COUNT and never asked
    whether her sentence had pointed somewhere else entirely."""

    ONE_SOURCE = ["apple-notes"]

    def _pick(self, text, candidates=None, foreign=None):
        return server._config_pick(
            self.ONE_SOURCE if candidates is None else candidates,
            text, server._config_source_words,
            server._CONFIG_UNSUPPORTED_SOURCE_WORDS if foreign is None
            else foreign)

    # -- the bug itself, and the proof the old shape really did misfire -----

    def test_naming_an_unsupported_source_never_picks_the_one_she_has(self):
        for text in ("sync with obsidian", "connect my obsidian vault",
                     "can you pull from notion", "add evernote",
                     "sync my kindle highlights"):
            self.assertIsNone(
                self._pick(text),
                "naming a source the app does not have must resolve to "
                "NOTHING — never to the one source she does have: %r" % text)

    def test_negative_control_the_old_fallback_did_misfire(self):
        """Without the foreign-word guard the SAME sentence returns
        apple-notes. If this ever stops being true the test above is
        vacuous and proves nothing about the fix."""
        self.assertEqual(
            self._pick("sync with obsidian", foreign=()), "apple-notes",
            "control did not land — the single-candidate fallback is "
            "supposed to misfire without the guard")

    def test_the_fallback_still_works_when_she_names_no_source_at_all(self):
        """The guard is NARROW. The fallback's real job — she said
        'disconnect that' with exactly one thing it could mean — survives."""
        for text in ("disconnect that", "turn that off", "stop that one"):
            self.assertEqual(self._pick(text), "apple-notes", text)

    def test_naming_the_source_she_does_have_still_resolves(self):
        for text in ("disconnect apple notes", "stop syncing notes"):
            self.assertEqual(self._pick(text), "apple-notes", text)

    def test_ambiguity_between_two_of_her_own_is_still_refused(self):
        both = ["apple-notes", "apple-photos"]
        self.assertIsNone(
            self._pick("disconnect notes and photos", candidates=both),
            "guessing between two of her own settings stays a refusal")

    # -- the verdict: capability gap, NOT a trip to Manage ------------------

    def test_an_unsupported_source_reads_as_a_capability_gap(self):
        """manage_only would be a LIE: Manage cannot connect Obsidian
        either — no adapter exists — so pointing her there sends her
        hunting a panel for a control that is not in it."""
        self.assertEqual(
            server._config_disposition([], "connected_sources", True),
            "not_a_capability")
        self.assertEqual(
            server._config_disposition([], "connected_sources", False),
            "manage_only",
            "a source the app DOES support but she has not connected is "
            "genuinely Manage's job — that line stays true")

    def test_the_unsupported_flag_can_never_mask_something_doable(self):
        """Order matters: a real validated change wins over everything.

        ⚠ NARROWED 2026-08-21 by 26.96-14 (G-26.96-A), and the case keeps its
        name so what it used to say is not hidden.

        OLD EXPECTATION: `_config_disposition([{key: 'cleaning_enabled'}],
        'connected_sources', unsupported=True)` returned `configurable`.
        NEW EXPECTATION: it returns `not_a_capability`.

        WHY IT MOVED — HER RULING O of 2026-08-21, TIER 2 (approved as shown,
        chosen from three options put to her after she reproduced the defect
        on her own machine): a request naming ONE thing may not be answered
        with a switch that changes her whole library. `connected_sources` is a
        VALUE TOPIC and `cleaning_enabled` is not its key, so this line was
        asserting exactly the cross-key shape her ruling narrows — on a
        different value topic from the one she typed. ⛔ Not a weakening: the
        old expectation is the DEFECT, written down.

        WHAT THE CASE STILL PROVES, and it is why it is narrowed rather than
        deleted: ORDER. The verdict here is `not_a_capability` and not
        `manage_only`, because the unsupported-source branch sits above the
        manage-only branch — so the flag still reaches its own branch, which
        is the ordering fact this case was written for. The un-narrowed half
        of that fact lives on in
        `test_a_real_change_still_wins_over_the_no_redirect_rule` and in
        `ValueTopicKeyPairingTest`'s three controls, where a change that DOES
        name its topic's own key still wins the first branch."""
        change = [{"key": "cleaning_enabled", "to": False, "says": ""}]
        self.assertEqual(
            server._config_disposition(change, "connected_sources", True),
            "not_a_capability")
        # ...and a change that names THIS topic's own key still wins the
        # first branch, so the narrowing is scoped to the mismatch and the
        # ordering claim above is not vacuous.
        own = [{"key": "connected_sources", "to": [], "says": ""}]
        self.assertEqual(
            server._config_disposition(own, "connected_sources", True),
            "configurable")

    def test_the_flag_is_read_off_her_sentence_and_is_pure(self):
        self.assertTrue(
            server._config_names_unsupported_source("sync with obsidian"))
        self.assertFalse(
            server._config_names_unsupported_source("disconnect apple notes"))
        self.assertFalse(server._config_names_unsupported_source(""))
        self.assertFalse(server._config_names_unsupported_source(None))

    def test_obsidian_is_listed_and_that_is_load_bearing(self):
        """878 items in the live library carry source obsidian-vault from a
        ONE-TIME import, so the room holds vault content with no adapter to
        keep it current. Removing this entry is a promise the adapter
        exists."""
        self.assertIn("obsidian", server._CONFIG_UNSUPPORTED_SOURCE_WORDS)
        for word in server._CONFIG_UNSUPPORTED_SOURCE_WORDS:
            self.assertNotIn(
                word, server.ADAPTER_SOURCES,
                "%r is listed as unsupported but IS a shipped adapter — the "
                "two lists must never overlap or a real source becomes "
                "unreachable through the chat" % word)


class ManagePointingCopyTest(unittest.TestCase):
    """CONSCIOUS PIN EDIT, same day, twice — and the second edit is the
    interesting one.

    MORNING (owner): 'manage sounds confusing — be more specific, like going
    back to the main page and press "manage your library"'. So both lines were
    made to name the button. This class pinned that.

    EVENING (F9): building the owner's follow-up — *if the librarian cannot do
    it, teach the user how* — required auditing where each topic's control
    actually lives, and **four of the six manage-only topics have no control in
    Manage at all**: the roster editor is on the import screen, the librarian's
    name exists only in onboarding, habit_anchor is a one-time card D-09 says
    never returns, and onboarding is over.

    So the SHARED literal must name NO destination — a shared line cannot name
    a place that is right for two topics and wrong for four — and the route
    moved client-side, per topic, emitted only where one genuinely exists.

    The morning's instinct was right and is NOT abandoned: `too_many` still
    names the button, because that branch means "several real settings at
    once", which Manage genuinely does own. Only the six-topic line gave it
    up."""

    BUTTON = "manage your library"

    def test_the_shared_manage_only_line_names_NO_destination(self):
        """THE NEW TRUTH, with the inverse assertion so the morning's wording
        cannot creep back: this line is shared by six topics and is right
        about the destination for only two."""
        line = server.CONFIG_MANAGE_ONLY_MSG.lower()
        self.assertNotIn(
            self.BUTTON, line,
            "CONFIG_MANAGE_ONLY_MSG must NOT name Manage — it answers for "
            "roster (import screen), librarian_name (onboarding only) and "
            "habit_anchor (a card D-09 says never returns) as well, and "
            "sending her to hunt a control that is not there is the F7 "
            "failure in copy instead of in code")
        for word in ("under", "in the room", "->"):
            self.assertNotIn(word, line,
                             "no destination language belongs in the shared "
                             "literal: found %r" % word)
        self.assertTrue(line.strip(), "it must still SAY something")

    def test_too_many_still_names_the_button(self):
        """KEPT from the morning edit, deliberately. `too_many` means several
        real settings at once — Manage genuinely does own that."""
        self.assertIn(self.BUTTON, server.CONFIG_TOO_MANY_MSG.lower())

    def test_the_button_really_says_that(self):
        """Still load-bearing for too_many: copy may never name a label the
        button does not carry."""
        html = (_REPO_ROOT / "index.html").read_text(encoding="utf-8")
        idx = html.find('id="room-manage-link"')
        self.assertNotEqual(idx, -1, "the room's manage entry point is gone")
        self.assertIn(self.BUTTON, html[idx:idx + 200].lower(),
                      "the copy names a label the button no longer carries")

    def test_the_capability_gap_line_still_names_no_door_inside_the_app(self):
        """Unchanged and deliberately so: unmapped owns the miss and points
        nowhere, because handing her a tool when the room simply failed to
        parse her sentence is the 'you're on your own' misfire."""
        self.assertNotIn(self.BUTTON, server.CONFIG_UNMAPPED_MSG.lower())

    # -- F9: the name must never be redirected to a place it does not live --

    def test_librarian_name_never_reaches_the_manage_only_branch(self):
        """The chat is the ONLY route to the name after onboarding, so a
        redirect sends her AWAY from the one thing that could work. The
        retry line is the truthful answer."""
        self.assertIn("librarian_name", server.NO_REDIRECT_TOPICS)
        self.assertEqual(
            server._config_disposition([], "librarian_name"), "unmapped",
            "an unreadable name must ask her to say it another way, never "
            "send her to Manage — there is no name control in Manage")
        # ...and the ones that DO have a home still go there.
        for topic in ("filters", "connected_sources"):
            self.assertEqual(server._config_disposition([], topic),
                             "manage_only", topic)

    def test_a_real_change_still_wins_over_the_no_redirect_rule(self):
        """Order: NO_REDIRECT_TOPICS sits below the changes branch, so it can
        never mask something the room can actually do."""
        change = [{"key": "librarian_name", "to": "ines", "says": ""}]
        self.assertEqual(
            server._config_disposition(change, "librarian_name"),
            "configurable")

    def test_the_topic_rides_to_the_client(self):
        """The client can only name a route if it is told the topic. It is a
        fixed enum member, so it carries no content."""
        src = (_REPO_ROOT / "server.py").read_text(encoding="utf-8")
        idx = src.index("def handle_librarian_ask_progress")
        body = src[idx:idx + 2000]
        self.assertIn('"topic": job["topic"]', body,
                      "the ask readout must carry the topic or the client "
                      "cannot tell filters from the roster and will either "
                      "stay silent everywhere or guess")


class SurfaceSuggestionsDispositionTest(unittest.TestCase):
    """26.91 D-07 (2026-08-07) — THE DISPOSITION MOVE'S FENCE HALF.

    `surface_content` sat in NOT_A_CAPABILITY until this phase, so asking the
    librarian to set something out answered "that's past what i can change."
    26.91-04 retired the reading book — the last surface rendering the
    librarian's proposal cohort — so law 7 would otherwise have had no
    proposing path at all. This class holds the SERVER half of the fix.

    ANTI-VACUITY, stated: every assertion here DRIVES the shipped function.
    None reads server.py as text except the two that deliberately measure a
    source property (purity, and the message table's byte-identity), and both
    of those carry their own positive control. The one that matters most —
    build_config_ask_doc emitting no item — is driven with a REAL sentence
    against a REAL meta and asserted over the produced document, because
    26.9's law-5 audit found a body-comparison test that was vacuous purely
    because the payload it compared carried no body field at all.
    """

    # The four sentinel classes, in the shape the shipped .cjs fence uses:
    # if any of these reaches the ask document the fence has a hole.
    ITEM_ID = "FENCE-ITEM-ID-9f2a"
    ITEM_TITLE = "FENCE-ITEM-TITLE-the afternoon it rained"
    ITEM_BODY = "FENCE-ITEM-BODY-the whole paragraph she wrote"
    ROSTER_FOLDER = "FENCE-ROSTER-FOLDER-record"
    FILTER_VALUE = "FENCE-FILTER-VALUE-screenshots"

    def test_surface_content_dispositions_to_surface_suggestions(self):
        self.assertEqual(
            server._config_disposition([], "surface_content"),
            "surface_suggestions",
            "asking the librarian to set something out must reach its own "
            "branch — anything else and law 7 has no proposing surface")

    def test_a_real_change_still_wins_over_the_new_branch(self):
        """⛔⛔ THE EXPECTATION IS INVERTED BY 26.96-19, ON THE OWNER'S RULING,
        AND THIS CASE IS THE HONEST RECORD OF WHAT THAT COST.

        OLD EXPECTATION (26.91 D-07): *"ORDER IS THE DESIGN. First match wins,
        so a branch inserted above the changes test would mask something the
        room can actually do."* A cleaning switch proposed under topic
        `surface_content` returned `configurable` — the room did the thing it
        could do, whatever topic the model named.

        NEW EXPECTATION: it returns `surface_suggestions`. `surface_content`
        owns no key, so the pairing refuses the change and the cascade falls
        through to the surface branch.

        ⛔ THE OLD RULE IS RETIRED, NOT SATISFIED BY A TECHNICALITY. A
        validated change no longer beats every refusal. She ruled this on
        2026-08-21 having been shown the measurement — 49 of 56 topic/key
        combinations change answer, and in every one the room stops doing
        something it CAN do — and having twice previously ruled the opposite.
        It was the last thing keeping the phase blocked.

        ⚠ What D-07 still owns is untouched and is asserted below: the surface
        branch sits ABOVE NOT_A_CAPABILITY, so `surface_content` reaches its
        own verdict rather than the retired refusal. That was D-07's actual
        subject; the first-branch supremacy was the part that moved."""
        change = [{"key": "cleaning_enabled", "to": False, "says": ""}]
        self.assertEqual(
            server._config_disposition(change, "surface_content"),
            "surface_suggestions")
        # ⛔ D-07's real property, unchanged and asserted here so the inversion
        # above cannot be read as having loosened it: the topic still reaches
        # the SURFACE branch and never the capability refusal.
        self.assertNotEqual(
            server._config_disposition(change, "surface_content"),
            "not_a_capability")

    def test_the_move_is_a_measured_fact_not_a_description(self):
        self.assertNotIn("surface_content", server.NOT_A_CAPABILITY)
        self.assertIn("surface_content", server.SURFACE_TOPICS)
        self.assertIn("surface_content", server.ASK_TOPICS)
        # BY VALUE, both of them. A floor cannot notice a topic leaving.
        #
        # ⚠ 26.95-34 (D-16) MOVED IT AGAIN, 5 -> 4: `blessing_batch_size` left
        # NOT_A_CAPABILITY when the blessing pass's size became a real,
        # validated, bounded meta key. The count is re-pointed rather than
        # relaxed, and it stays a LITERAL for the reason D-07 wrote it as one:
        # "one fewer than before" is not a pin, and a third topic leaving
        # unnoticed has to be a failure rather than a silent shrink.
        self.assertEqual(len(server.NOT_A_CAPABILITY), 4)
        self.assertEqual(len(server.SURFACE_TOPICS), 1)

    def test_every_other_topic_kept_the_verdict_it_had(self):
        """The blast radius, driven rather than reasoned about: the assertion
        names every verdict BY VALUE so a topic slipping across is a failure
        and not a shrug.

        ⚠ TWO TOPICS HAVE MOVED, EACH BY ITS OWN RULING, AND THE GUARD IS
        UNCHANGED IN STRENGTH. 26.91 D-07 moved `surface_content` out to its
        own branch. 26.95-34 D-16 moved `blessing_batch_size` — and it left
        ASK_TOPICS entirely rather than taking a branch, so it falls through
        to `unmapped`.

        ⚠ THAT IS THE SHIPPED PATTERN, NOT A GAP, and `voice_model` is the
        precedent: it is model-proposable and has never had a topic of its
        own either. A key of this kind is reached through a VALIDATED CHANGE,
        which wins the cascade's FIRST branch whatever topic the model named,
        so the topic vocabulary is simply not how it travels.
        `voice_model` is pinned below beside it, so the precedent is asserted
        rather than merely described — if the shape ever stops holding, both
        rows go red together.

        ⛔ The guard is NOT weakened: every row is still a literal verdict,
        and a THIRD topic changing verdict still fails here."""
        expected = {
            "body_formatting": "not_a_capability",
            "full_archive_review": "not_a_capability",
            "per_tier_models": "not_a_capability",
            "room_lighting": "not_a_capability",
            # 26.95-34 (D-16): out of NOT_A_CAPABILITY and out of ASK_TOPICS,
            # on the voice_model precedent pinned on the next line.
            "blessing_batch_size": "unmapped",
            "voice_model": "unmapped",
            "habit_anchor": "manage_only",
            "onboarding": "manage_only",
            "filters": "manage_only",
            "connected_sources": "manage_only",
            "roster": "manage_only",
            "librarian_name": "unmapped",
            "other": "unmapped",
        }
        for topic, verdict in expected.items():
            self.assertEqual(
                server._config_disposition([], topic), verdict,
                "%r changed verdict — 26.91 D-07 moved surface_content and "
                "26.95-34 D-16 moved blessing_batch_size, and NOTHING ELSE "
                "was supposed to move" % topic)
        # ...and the two that moved are still REACHABLE the way their own
        # rulings say they are: through a validated change, which wins the
        # cascade's first branch whatever topic came back with it. Without
        # this, "unmapped" above would be indistinguishable from the key
        # having quietly become unreachable.
        for key in ("blessing_batch_size", "voice_model",
                    "display_fence_open"):
            self.assertEqual(
                server._config_disposition(
                    [{"key": key, "to": None, "says": ""}], "other"),
                "configurable",
                "%r is topic-less by design, so a validated change is the "
                "ONLY way it is reached — if that stops winning the first "
                "branch the key is unreachable, not merely unmapped" % key)

    def test_the_capability_gap_literal_is_byte_unchanged(self):
        """Only WHICH TOPICS REACH IT moved. The literal itself is the
        phase's riskiest string and this plan did not touch it."""
        self.assertEqual(
            server.CONFIG_REFUSAL_MSGS["not_a_capability"],
            server.CONFIG_NOT_A_CAPABILITY_MSG)
        self.assertEqual(
            server.CONFIG_NOT_A_CAPABILITY_MSG,
            "that's past what i can change. something like an ai coding "
            "assistant in your terminal could build it, if that's a door "
            "you like opening.")
        # ...and it still fires for a topic that genuinely IS past the app.
        self.assertEqual(
            server.CONFIG_REFUSAL_MSGS[
                server._config_disposition([], "room_lighting")],
            server.CONFIG_NOT_A_CAPABILITY_MSG,
            "the branch is not merely unchanged, it is still REACHED — a "
            "literal nothing routes to is a literal nobody would notice "
            "breaking")

    def test_the_server_composes_no_reply_for_the_new_branch(self):
        """The table is TOTAL over the cascade's verdicts, and this entry is
        None ON PURPOSE: the server does not know the cohort and must not
        learn it. A sentence here is the first step toward the server
        describing items it never saw."""
        self.assertIn("surface_suggestions", server.CONFIG_REFUSAL_MSGS)
        self.assertIsNone(server.CONFIG_REFUSAL_MSGS["surface_suggestions"])
        self.assertIn("surface_suggestions",
                      server.CONFIG_NON_REFUSAL_DISPOSITIONS)
        self.assertIn("configurable", server.CONFIG_NON_REFUSAL_DISPOSITIONS)
        # every verdict the cascade can produce has a row in the table
        produced = {server._config_disposition([], t)
                    for t in server.ASK_TOPICS}
        produced.add(server._config_disposition(
            [{"key": "cleaning_enabled", "to": False, "says": ""}], "other"))
        for verdict in produced:
            if verdict == "configurable":
                continue
            self.assertIn(
                verdict, server.CONFIG_REFUSAL_MSGS,
                "%r is a verdict the cascade produces with no row in the "
                "message table — it would fall through .get() silently and "
                "read as an accident rather than a decision" % verdict)

    def test_the_ask_document_still_carries_no_item(self):
        """THE ONE THAT MATTERS. Driven with a REAL surfacing sentence
        against a meta deliberately poisoned with all five sentinel classes,
        and asserted over the produced document — never reasoned about.

        The 26.9 precedent is exact: a body-comparison test there was vacuous
        because the payload carried no body field, so it could never fail."""
        meta = {
            "librarian_enabled": True,
            "cleaning_enabled": True,
            "cleaning_writeback_enabled": False,
            "sync_comments_enabled": False,
            "reflection_writeback_enabled": True,
            "consolidation": False,
            "voice_model": "sonnet",
            # the poison: none of this may cross
            "fenced_roster": [self.ROSTER_FOLDER],
            "filters": [{"facet": "tag", "value": self.FILTER_VALUE}],
            "connected_sources": ["apple-notes"],
            "librarian_name": "Ines",
        }
        sentence = "anything for me?"
        doc = server.build_config_ask_doc(meta, sentence)
        for sentinel in (self.ITEM_ID, self.ITEM_TITLE, self.ITEM_BODY,
                         self.ROSTER_FOLDER, self.FILTER_VALUE):
            self.assertNotIn(
                sentinel, doc,
                "build_config_ask_doc leaked %r — the ask carries her "
                "sentence and configurable KEY NAMES, and D-07 added "
                "nothing to it. Routing the reply through the already-gated "
                "selectLibrarianSuggestions is safe BECAUSE this stays "
                "true" % sentinel)
        # POSITIVE CONTROLS. Without these the assertions above would pass
        # just as well on an empty string.
        self.assertIn(sentence, doc,
                      "her own sentence is missing from the document — then "
                      "the leak assertions above are checking nothing")
        self.assertIn("cleaning_enabled", doc,
                      "the key NAMES are missing from the document — then "
                      "the leak assertions above are checking nothing")
        parsed = json.loads(doc)
        self.assertEqual(sorted(parsed.keys()), ["ask", "settings"],
                         "the ask document grew a third top-level field: %r"
                         % sorted(parsed.keys()))
        self.assertEqual(len(parsed["settings"]),
                         len(server.MODEL_PROPOSABLE_KEYS))
        for row in parsed["settings"]:
            # #105 (2026-08-25): the device class is the ONE row that
            # carries no `now` — the server does not know a device-kept
            # value and must not invent one. Fewer fields, never more:
            # the seam only ever narrows here.
            if row["key"] in server._CONFIG_DEVICE_KEYS:
                self.assertEqual(sorted(row.keys()), ["key", "type"])
            else:
                self.assertEqual(sorted(row.keys()), ["key", "now", "type"])

    def test_the_cascade_is_still_pure(self):
        """Same arguments, same verdict — asserted by DRIVING it many times
        over the whole vocabulary, and by measuring the body for the store,
        file and clock tokens that would break the contract."""
        first = [server._config_disposition([], t) for t in server.ASK_TOPICS]
        for _ in range(3):
            self.assertEqual(
                [server._config_disposition([], t) for t in server.ASK_TOPICS],
                first)
        src = inspect.getsource(server._config_disposition)
        # 26.93-07: `call_librarian(` in place of the deleted seam's name —
        # the same "no model call" claim, at the only boundary that is left.
        for token in ("load_store(", "save_store(", "call_librarian(",
                      "open(", "time.", "datetime", "json.load", "random."):
            self.assertNotIn(
                token, src,
                "_config_disposition carries %r — PURE BY CONTRACT means no "
                "store read, no model call, no file and no clock, and the "
                "D-07 branch must not have spent that" % token)
        # POSITIVE CONTROL for the scan: it can find a token when one is there
        self.assertIn("open(", "with open(path) as fh: pass")


class AskCascadeMirrorAgreesTest(unittest.TestCase):
    """26.91-05 — THE MIRROR MUST NOT LAG THE THING IT MIRRORS.

    tests/eval_reflection.py rebuilds ASK_TOPICS and re-implements the
    disposition cascade, because the shipped ones are EXPRESSIONS a text
    reader cannot honestly lift. Nothing compared the two, so the mirror
    could drift and keep reporting a verdict the server does not give — a
    gate that cannot go red, in the shape this project keeps finding.

    It HAD drifted, and by two separate commits. F9 (2026-07-31) added
    NO_REDIRECT_TOPICS to the shipped cascade and the mirror never got it, so
    it answered `manage_only` for librarian_name while the server answered
    `unmapped` — silently, for a week. D-07 would have added a second lag on
    top. Both were found by DRIVING both cascades over every topic rather
    than reading either, which is why this class exists.
    """

    def _mirror(self):
        sys.path.insert(0, str(_REPO_ROOT / "tests"))
        import eval_reflection  # noqa: E402
        return eval_reflection

    def test_the_mirror_rebuilds_the_same_topic_vocabulary(self):
        mirror = self._mirror()
        sets = mirror._ask_topic_sets()
        self.assertEqual(
            tuple(sets["all"]), tuple(server.ASK_TOPICS),
            "the mirrored ASK_TOPICS is not the shipped one — the advisory "
            "instrument would score the model against a vocabulary the "
            "server does not use")

    def test_the_mirror_gives_the_same_verdict_for_every_topic(self):
        mirror = self._mirror()
        sets = mirror._ask_topic_sets()
        change = [{"key": "cleaning_enabled", "to": False, "says": ""}]
        # POSITIVE CONTROL FIRST: an empty vocabulary would satisfy the loop.
        self.assertGreaterEqual(
            len(server.ASK_TOPICS), 18,
            "fewer topics than the shipped vocabulary carries — the "
            "comparison below would be over almost nothing")
        for topic in server.ASK_TOPICS:
            self.assertEqual(
                mirror._ask_disposition([], topic, sets),
                server._config_disposition([], topic),
                "the mirror and the server disagree on %r with no validated "
                "change" % topic)
            self.assertEqual(
                mirror._ask_disposition(change, topic, sets),
                server._config_disposition(change, topic),
                "the mirror and the server disagree on %r WITH a validated "
                "change — the changes branch must win in both" % topic)
        # ...and the loop must have exercised more than one verdict, or an
        # all-unmapped mirror would agree with an all-unmapped server.
        verdicts = {server._config_disposition([], t)
                    for t in server.ASK_TOPICS}
        self.assertGreaterEqual(
            len(verdicts), 4,
            "only %d distinct verdicts were produced across the whole "
            "vocabulary — the agreement above is close to trivial"
            % len(verdicts))
        self.assertIn("surface_suggestions", verdicts)


class ValueTopicKeyPairingTest(unittest.TestCase):
    """26.96-14 (G-26.96-A) — A VALUE TOPIC MAY ONLY RESOLVE TO A CHANGE ON
    ITS OWN KEY.

    HER RULING O, 2026-08-21. She typed `can you hide my Journal folder from
    yourself` — ONE folder — and the room answered with a card offering to
    stop the librarian reading her WHOLE library. She reproduced it on her
    own machine. Her ruling: when she names one folder and the room cannot do
    it from the chat, it answers exactly as it already does for her other
    three sentences — the existing route line — and offers NO SWITCH AT ALL.

    ⚠ TIER 2 — APPROVED AS SHOWN. It was option 1 of three put to her after
    she reproduced the defect herself, each with its cost named. ⛔ No
    document may describe it as a behaviour she specified cold.

    ⛔ NOTHING ABOUT THE COPY IS A DEFECT. The card's present-tense wording
    was checked at that sitting and deliberately NOT reported — it is the
    shipped 26.87 register. The defect is the SCOPE of what is offered.

    THE RED THIS CLASS WAS WRITTEN AGAINST, driven at 0b96a29 before a byte
    moved and costing no model call: `_config_disposition` returned
    `configurable` for a `librarian_enabled` change on EVERY ONE of the four
    value topics, because its first branch was a bare test of the change list
    with no check that the change had anything to do with the topic.

    ⛔ EVERY CROSS-KEY VERDICT BELOW IS PINNED BY NAME, never merely as
    not-the-configurable-one. That weaker assertion is satisfied by three
    different strings, and it is exactly what would hide the fourth topic
    doing something else — which it does.
    """

    CROSS = [{"key": "librarian_enabled", "to": False, "says": ""}]

    # ⛔ MEASURED, NOT PREDICTED. Driven at 0b96a29 in a clean archive with an
    # empty change list (every branch below the first reads only the topic, so
    # an empty list reaches exactly the branches a failed pairing reaches),
    # and re-driven here with a real cross-key change after the fix.
    CROSS_VERDICT = {
        "filters": "manage_only",
        "connected_sources": "manage_only",
        "roster": "manage_only",
        # ⚠ NOT manage_only, and NOT a defect introduced here. F9's ruling of
        # 2026-07-31 puts librarian_name in NO_REDIRECT_TOPICS, which sits
        # ABOVE the manage-only branch: the name exists only in onboarding, so
        # after onboarding the chat is the only route there is and a redirect
        # to Manage would send her away from the one thing that could have
        # worked. ⛔ HER RULING O NEVER REACHED THIS TOPIC — a sentence naming
        # a folder classifies to roster, filters or connected_sources, never
        # to the librarian's name. The pairing extends here as a general
        # guard; the answer it falls through to is F9's, not hers. The switch
        # is gone on all four; only three of them are routed.
        "librarian_name": "unmapped",
    }

    def test_the_defect_she_reproduced_no_longer_offers_the_switch(self):
        """THE DETERMINISTIC RED, and the reason this class exists. A
        librarian-wide change carried on topic `roster` must not return the
        configurable verdict — that verdict is what mints the card offering
        to stop the librarian reading her whole library."""
        self.assertEqual(
            server._config_disposition(self.CROSS, "roster"), "manage_only",
            "a sentence naming ONE folder was answered with a switch over "
            "her whole library — her Ruling O of 2026-08-21 (tier 2)")

    def test_the_shipped_removal_path_still_wins(self):
        """THE CONTROL THAT REFUSES A FIX WHICH SIMPLY STOPS PROPOSING. A
        roster ask that DOES resolve to a fenced_roster change must still
        mint the card she has always been able to get."""
        own = [{"key": "fenced_roster", "to": None, "value": "Journal",
                "says": ""}]
        self.assertEqual(
            server._config_disposition(own, "roster"), "configurable")

    def test_all_four_value_topics_driven_both_directions(self):
        """⛔ Filters and connected sources are DRIVEN here, never recorded
        as clear: the verification measured all four returning `configurable`
        on a cross-key change, and forbade calling either one clean."""
        for topic in server.VALUE_TOPICS:
            own = [{"key": server.VALUE_TOPIC_KEYS[topic], "to": None,
                    "says": ""}]
            self.assertEqual(
                server._config_disposition(own, topic), "configurable",
                "%r stopped being reachable through its OWN key — the "
                "pairing is meant to narrow the cross-key case, not to "
                "close the topic" % topic)
            self.assertEqual(
                server._config_disposition(self.CROSS, topic),
                self.CROSS_VERDICT[topic],
                "%r returned the wrong verdict for a change on a key that is "
                "not its own" % topic)
            self.assertNotEqual(
                server._config_disposition(self.CROSS, topic), "configurable",
                "%r STILL OFFERS THE SWITCH" % topic)

    def test_the_fourth_topic_answers_differently_and_that_is_f9s_decision(
            self):
        """F9 (2026-07-31), and it is written beside the tuple in the source:
        the librarian's name exists ONLY in onboarding, so after onboarding
        the chat is the only route there is, and a redirect to Manage sends
        her away from the one thing that could have worked.

        ⛔ Her Ruling O never reached this topic. A sentence naming a folder
        classifies to roster, filters or connected_sources. So the switch is
        gone here too, but the sentence that replaces it is the retry line
        with no route — F9's answer, not hers, and this case says so rather
        than folding it into the roster claim."""
        self.assertIn("librarian_name", server.NO_REDIRECT_TOPICS)
        self.assertEqual(
            server._config_disposition(self.CROSS, "librarian_name"),
            "unmapped")
        # ...and the other three DO reach the branch that carries her route.
        for topic in ("roster", "filters", "connected_sources"):
            self.assertEqual(
                server._config_disposition(self.CROSS, topic), "manage_only",
                topic)

    def test_the_pairing_covers_the_value_topics_by_value(self):
        """The invariant that stops this defect being inherited in silence: a
        fifth value topic joining the tuple without a permitted key becomes a
        FAILURE rather than a topic that quietly accepts any change. Both
        sides are read from the module — a re-typed literal list would only
        pin what someone remembered."""
        self.assertEqual(set(server.VALUE_TOPIC_KEYS),
                         set(server.VALUE_TOPICS))
        self.assertEqual(set(self.CROSS_VERDICT), set(server.VALUE_TOPICS),
                         "this class stopped covering the whole tuple")

    # ⛔ 26.96-23 (review IN-05, 2026-08-22): THE DERIVATION PIN IS DRIVEN
    # NOW, AND THE ONE IT REPLACED IS DESCRIBED HERE RATHER THAN DELETED IN
    # SILENCE. It read `inspect.getsource(server._resolve_value_change)` and
    # asserted the substring '"key": "<paired key>"' appeared SOMEWHERE in
    # that whole function, then failed with *"%r is paired to %r but no
    # branch of _resolve_value_change ever returns that key"* — a PER-TOPIC
    # claim a whole-function substring search cannot make. Every one of the
    # four keys appears somewhere in that function, so the pin could not tell
    # a correct pairing from a permuted one.
    #
    # ⛔ MEASURED, NOT ASSERTED. Permuting `filters` <-> `connected_sources`
    # in VALUE_TOPIC_KEYS (server.py md5 fcb4c1b1… -> 49e632b8…, asserted
    # moved) left the old pin GREEN, and left the whole nine-case
    # ValueTopicKeyPairingTest class GREEN with it. The two suite failures
    # that permutation did produce came from the literal-table pin in
    # TopicKeyPairingReachesEveryKeyedTopicTest and from
    # UnsupportedSourceAskTest — neither of which claims to derive from the
    # resolver. This case is what makes that failure message true.
    #
    # The by-value table pin above stays: the two catch different things.
    # That one refuses a topic tuple that grew without a key; this one
    # refuses a key that the resolver never actually produces for its topic.

    # Contexts that make each branch of `_resolve_value_change` RESOLVE. Each
    # is her own sentence plus the snapshot that branch reads, and nothing
    # else — the resolver is pure, so this is its whole world. ⛔ Only the
    # ctx is typed; the EXPECTATION is read from the module, so a permuted
    # map cannot be satisfied by a permuted fixture.
    RESOLVING_CTX = {
        "librarian_name": {"text": 'call yourself "ines"', "name": "wren"},
        "filters": {"text": "stop hiding screenshots",
                    "filters": [{"facet": "tag", "value": "screenshots"}]},
        "connected_sources": {"text": "disconnect apple notes",
                              "sources": ["apple-notes", "photos"]},
        "roster": {"text": "let the librarian read Journal again",
                   "roster": ["Journal", "personnel notes"]},
    }

    def test_the_mapping_is_derived_from_the_resolver_it_mirrors(self):
        """Every paired topic is DRIVEN through `_resolve_value_change`, and
        the key on the answer that resolver actually returns is compared to
        the key this map pairs that topic to. The roster row is the one that
        matters, being the only place where the topic and the key differ.

        ⚠ WHAT THIS CASE CHECKS, STATED SO THE FAILURE MESSAGE CANNOT PROMISE
        MORE: for each topic, ONE resolving context reaches ONE branch and
        that branch's returned `key` equals the paired key. It does not
        enumerate the branches, and it says nothing about contexts that
        resolve to None — those are driven elsewhere (tests/
        test_roster_retroactive.py drives the roster's refusal direction)."""
        self.assertEqual(
            set(self.RESOLVING_CTX), set(server.VALUE_TOPIC_KEYS),
            "a value topic gained or lost a pairing and this case stopped "
            "driving the whole map — add its resolving context rather than "
            "letting the loop skip it")
        for topic, key in server.VALUE_TOPIC_KEYS.items():
            got = server._resolve_value_change(topic, self.RESOLVING_CTX[topic])
            # ⛔ THE ANTI-VACUITY ARM. A resolver that returned None for
            # everything would satisfy no assertion below and would satisfy
            # this one loudly instead of quietly passing over an empty loop.
            self.assertIsNotNone(
                got,
                "%r resolved to NOTHING on a context written to make its "
                "branch fire, so the pairing below was never driven" % topic)
            self.assertEqual(
                got["key"], key,
                "topic %r is paired to key %r, but driven on a resolving "
                "context `_resolve_value_change` returned key %r"
                % (topic, key, got["key"]))
        self.assertEqual(server.VALUE_TOPIC_KEYS["roster"], "fenced_roster",
                         "the roster topic resolves to the fence key, not to "
                         "a key of its own name — that gap is where the "
                         "defect lived")

    # -- the controls: the shapes the pairing must NOT touch ----------------
    #
    # ⚠ A control that is only green because nobody wrote it down is not a
    # control. If any of these three goes red the fix is too broad — stop and
    # report; do NOT adjust the case.

    def test_control_a_matching_key_on_its_own_topic_is_untouched(self):
        """The narrowest control: the pairing must only ever refuse a
        MISMATCH. A name change carried on topic `librarian_name` matches,
        so it still wins the first branch even though that topic is in
        NO_REDIRECT_TOPICS."""
        change = [{"key": "librarian_name", "to": "ines", "says": ""}]
        self.assertEqual(
            server._config_disposition(change, "librarian_name"),
            "configurable")

    def test_control_a_non_value_topic_may_still_carry_any_key(self):
        """⛔⛔ INVERTED BY 26.96-19 ON THE OWNER'S RULING. This case was
        flagged by review WR-12 as *"a check that certifies the untreated
        half"*, and it is the one the review predicted would go red.

        OLD EXPECTATION (26.96-14): a cross-key change on any non-value topic
        must win the first branch, because *"the pairing is scoped to the
        value tuple and nothing else."* ⛔ That rationale outlived its truth
        twice — 26.96-17 widened the pairing to the keyed topics and left this
        case standing with its claim intact (WR-12 half-addressed), and
        26.96-19 widened it to the whole vocabulary.

        NEW EXPECTATION: `surface_content` owns no key, so the change is
        refused and the cascade falls to that topic's own branch.

        ⚠ The name is kept deliberately. Deleting or renaming a case to clear
        a red is prohibited on this phase (T-26.96-53), and a reader looking
        for WR-12 must find it here."""
        change = [{"key": "cleaning_enabled", "to": False, "says": ""}]
        self.assertNotIn("surface_content", server.VALUE_TOPIC_KEYS)
        self.assertEqual(server.TOPIC_KEYS["surface_content"], ())
        self.assertEqual(
            server._config_disposition(change, "surface_content"),
            "surface_suggestions")

    def test_control_the_topic_less_keys_stay_reachable(self):
        """`voice_model` and `blessing_batch_size` have no topic of their own
        and ride topic `other`, so a validated change is the ONLY way either
        is reached. If the pairing caught them they would be unreachable
        rather than merely unmapped."""
        self.assertNotIn("other", server.VALUE_TOPIC_KEYS)
        for key in ("voice_model", "blessing_batch_size",
                    "display_fence_open"):
            self.assertEqual(
                server._config_disposition(
                    [{"key": key, "to": None, "says": ""}], "other"),
                "configurable", key)


# ---------------------------------------------------------------------------
# 26.96-17 (CR-04, security pass 2 / T-26.96-50) — THE PAIRING REACHES EVERY
# TOPIC THAT HAS A KEY OF ITS OWN, NOT ONLY THE FOUR VALUE TOPICS.
# ---------------------------------------------------------------------------
# WHY THIS EXISTS. 26.96-14 built the topic-key pairing and scoped it to
# VALUE_TOPICS. The security re-run drove the real ASK_TOPICS tuple and
# measured the reach: FOUR topics guarded, FOURTEEN still answering
# `configurable` for a `librarian_enabled` change. So the whole-library switch
# card was still mintable — her Ruling O is unconditional ("and offers NO
# SWITCH AT ALL") and the implementation had made it conditional on the model
# picking one of four labels.
#
# ⛔ THE ROWS ARE DERIVED BY READING THE WRITER, NEVER TYPED FROM THE REVIEW.
# The review's own sketch paired topic `cleaning_writeback` with key
# `reflection_writeback_enabled`. THAT IS WRONG AND WAS CAUGHT BY READING THE
# SOURCE: `validate_cleaning_writeback_enabled` was DELETED by the owner on
# 2026-08-17 and the key is off CONFIGURABLE_KEYS, so that row would have let
# an ask about the TIDY-UP writing back be answered with a change to whether
# REFLECTIONS write back — a different feature, on the same surface this pass
# exists to keep honest. `cleaning_writeback` has NO key and is paired to the
# EMPTY tuple, which fails every change and falls through.
#
# ⛔ SCOPE, STATED SO IT IS NOT READ AS WIDER. Only topics that have a key of
# their own are paired. The keyless topics — habit_anchor, onboarding, the four
# NOT_A_CAPABILITY members, surface_content and `other` — are left EXACTLY as
# they were, because narrowing them would change which sentence she reads on
# asks this defect was never about, and `other` is the shipped route by which
# voice_model and blessing_batch_size are reached at all.
class TopicKeyPairingReachesEveryKeyedTopicTest(unittest.TestCase):
    """⛔ RED BEFORE THE FIX. Every case below was driven against the
    committed bytes first and 5 of the 6 keyed configurable topics returned
    `configurable` on a cross-key change."""

    CROSS = [{"key": "librarian_enabled", "to": False, "says": ""}]
    # A cross-key change on a keyed CONFIGURABLE topic falls out of the first
    # branch and lands on the retry line: none of these topics is in
    # SURFACE_TOPICS, NOT_A_CAPABILITY, NO_REDIRECT_TOPICS, MANAGE_ONLY_TOPICS
    # or VALUE_TOPICS, so the cascade runs to its final `return "unmapped"`.
    # ⛔ Pinned BY NAME per topic rather than as "not configurable" — the
    # weaker assertion is satisfied by five different strings and is the shape
    # that hid a real answer in 26.96-14's first draft (T-26.96-55).
    CONFIGURABLE_CROSS_VERDICT = {
        "librarian": "configurable",   # its OWN key — the pairing MATCHES
        "cleaning": "unmapped",
        "cleaning_writeback": "unmapped",
        "comments_sync": "unmapped",
        "reflection_writeback": "unmapped",
        "consolidation": "unmapped",
    }

    def test_every_keyed_configurable_topic_refuses_a_cross_key_change(self):
        """The defect, driven topic by topic. `librarian` is in the table as
        the honest control: `librarian_enabled` IS its own key, so it matches
        and must still be offered — the review named that residue a
        classifier problem rather than a cascade one, and the pairing must
        not pretend to fix it."""
        self.assertEqual(set(self.CONFIGURABLE_CROSS_VERDICT),
                         set(server.CONFIGURABLE_TOPICS),
                         "this class stopped covering the whole tuple")
        for topic, expected in self.CONFIGURABLE_CROSS_VERDICT.items():
            self.assertEqual(
                server._config_disposition(self.CROSS, topic), expected,
                "%r returned the wrong verdict for a change on a key that is "
                "not its own" % topic)

    def test_each_keyed_topic_is_still_reachable_through_its_own_key(self):
        """The pairing narrows the MISMATCH; it must never close a topic.
        Driven from the module's own table so a row that stops working is a
        failure rather than a case nobody updated."""
        for topic, keys in server.TOPIC_KEYS.items():
            for key in keys:
                own = [{"key": key, "to": None, "says": ""}]
                self.assertEqual(
                    server._config_disposition(own, topic), "configurable",
                    "%r stopped being reachable through its own key %r"
                    % (topic, key))

    def test_the_topic_with_no_key_of_its_own_refuses_every_change(self):
        """`cleaning_writeback` is the row the review got wrong. Its switch
        was DELETED by the owner on 2026-08-17, so it has no key at all — and
        an empty tuple is a different statement from an absent row: absent
        means unguarded, empty means nothing pairs. Driven on the deleted
        key's own name AND on the neighbouring feature's key, because pairing
        it to that neighbour is exactly the mistake being refused."""
        self.assertEqual(server.TOPIC_KEYS["cleaning_writeback"], ())
        self.assertNotIn("cleaning_writeback_enabled",
                         server._CONFIG_KEY_VALIDATORS)
        for key in ("cleaning_writeback_enabled",
                    "reflection_writeback_enabled", "cleaning_enabled"):
            self.assertEqual(
                server._config_disposition(
                    [{"key": key, "to": False, "says": ""}],
                    "cleaning_writeback"),
                "unmapped", key)

    def test_the_table_covers_every_topic_that_has_a_key(self):
        """⚠ NARROWED 26.96-18 — and named as a PROXY rather than left to
        read as the invariant its title suggests.

        It does NOT prove "nothing outside the table has a writable key" —
        that is a claim about eight keyless topics this table deliberately
        does not reach. What it proves is the membership the fix intends:
        both tuples plus `other`, which joined on her ruling of 2026-08-21.
        Both sides read from the module, so a fifth value topic or a seventh
        configurable one becomes a failure rather than a silent inheritance;
        the VALUES are pinned separately by the literal above, because this
        case is satisfied by any self-consistent table.

        ⛔ WIDENED AGAIN 26.96-19, and it is no longer a proxy: on her ruling
        the table covers the WHOLE vocabulary, so this now states the real
        invariant — every topic the model may name is paired, and a topic
        added to any of the five tuples is guarded the moment it joins."""
        self.assertEqual(set(server.TOPIC_KEYS), set(server.ASK_TOPICS))

    # ⛔⛔ THE ROW-LEVEL PIN, AND THE FALSE CREDIT THAT PRECEDED IT.
    #
    # 26.96-17 shipped `test_every_paired_key_is_a_key_the_room_can_actually_
    # write` with a docstring calling it "THE ROW-LEVEL GATE, and the one that
    # would have caught the review's bad row", and the commit message repeated
    # the claim. ⛔ IT IS FALSE, AND IT WAS DRIVEN FALSE: with
    # `cleaning_writeback` re-paired to `reflection_writeback_enabled` — the
    # review's exact bad row, proven applied and semantically live — that case
    # returns rc=0. It only ever rejected an INVENTED key. A misroute to a
    # REAL key sails through it, and 20 of the 37 possible wrong-key
    # assignments survived the entire 251-test suite.
    #
    # ⚠ THIS IS THE PROJECT'S RECURRING DEFECT LANDING INSIDE THE FIX WRITTEN
    # TO CLOSE IT — a check that confirms a mechanism is well-formed without
    # confirming it catches what it names, credited in a docstring and in a
    # commit message. It is recorded here rather than quietly repaired,
    # because the credit is what made nobody look.
    #
    # The old case KEEPS ITS NAME and keeps doing its real job, with the claim
    # corrected to what it actually proves. The pin that does the job it was
    # credited with is the LITERAL table below it.
    def test_every_paired_key_is_a_key_the_room_can_actually_write(self):
        """⚠ NARROWED 26.96-18 — this is a PROXY, not the row-level gate.

        OLD CLAIM (26.96-17): "the one that would have caught the review's bad
        row." DRIVEN FALSE — the review's bad row returns rc=0 here.

        WHAT IT ACTUALLY PROVES: a paired key is either a live proposable key
        (it has a validator the write path runs) or one of the four
        server-resolved value keys. That rejects an INVENTED key and nothing
        else. A row misrouted to another real key is caught by
        `test_each_row_is_the_key_that_topic_actually_governs` below, and only
        there."""
        value_keys = set(server.VALUE_TOPIC_KEYS.values())
        writable = set(server._CONFIG_KEY_VALIDATORS) | value_keys
        for topic, keys in server.TOPIC_KEYS.items():
            for key in keys:
                self.assertIn(
                    key, writable,
                    "%r is paired to %r, which no validator and no value "
                    "branch can write" % (topic, key))

    # ⛔ A LITERAL, TYPED FROM THE WRITER — NOT READ FROM THE MODULE. Every
    # other row assertion in this class iterates `server.TOPIC_KEYS` and is
    # therefore satisfied by ANY self-consistent table, including a wrong one.
    # This one is the independent statement of what each row must be, so a
    # misroute to a real key goes red. Derivations, one per row:
    #   librarian/cleaning/comments_sync/reflection_writeback/consolidation
    #     -> _CONFIG_KEY_VALIDATORS, the live write-path validators
    #   cleaning_writeback -> () because its validator was DELETED 2026-08-17
    #   other -> the keys that have no topic of their own (voice_model and
    #     blessing_batch_size since 26.96-18; display_fence_open joined
    #     2026-08-25 on #105 — the device-resolved key, reached the way
    #     voice_model is: a validated change through `other`, never a topic)
    #   the four value rows -> _resolve_value_change, branch by branch
    EXPECTED_ROWS = {
        "filters": ("filters",),
        "connected_sources": ("connected_sources",),
        "roster": ("fenced_roster",),
        "librarian_name": ("librarian_name",),
        "librarian": ("librarian_enabled",),
        "cleaning": ("cleaning_enabled",),
        "cleaning_writeback": (),
        "comments_sync": ("sync_comments_enabled",),
        "reflection_writeback": ("reflection_writeback_enabled",),
        "consolidation": ("consolidation",),
        "other": ("voice_model", "blessing_batch_size",
                  "display_fence_open"),
        # 26.96-19, her ruling: the eight that own no key. Empty means every
        # change under them is refused and the cascade falls to their own
        # branch. ⛔ Listed one per line rather than derived, so that a topic
        # which SHOULD have gained a key cannot arrive here silently as ().
        "habit_anchor": (),
        "onboarding": (),
        "body_formatting": (),
        "full_archive_review": (),
        "per_tier_models": (),
        "room_lighting": (),
        "surface_content": (),
    }

    def test_each_row_is_the_key_that_topic_actually_governs(self):
        """The pin the class was missing. Compared BY VALUE against a literal
        typed from the writer — so re-pointing any row at another real key
        goes red, which is the case that survived before this existed."""
        self.assertEqual(dict(server.TOPIC_KEYS), self.EXPECTED_ROWS)

    def test_no_two_topics_claim_the_same_key(self):
        """The specific shape of the review's bad row: two topics pointing at
        one key. It means an ask about one feature can be answered by changing
        another, and it is invisible to every membership check."""
        seen = {}
        for topic, keys in server.TOPIC_KEYS.items():
            for key in keys:
                self.assertNotIn(
                    key, seen,
                    "%r and %r both claim %r — an ask about one would be "
                    "answered by changing the other" % (topic, seen.get(key),
                                                        key))
                seen[key] = topic

    def test_the_value_half_is_derived_from_the_existing_table_not_retyped(
            self):
        """26.96-14's four rows are not copied here. TOPIC_KEYS is BUILT from
        VALUE_TOPIC_KEYS, so the older pin and the wider one cannot drift."""
        for topic, key in server.VALUE_TOPIC_KEYS.items():
            self.assertEqual(server.TOPIC_KEYS[topic], (key,), topic)

    # -- the controls: what this widening must NOT touch ---------------------

    def test_control_a_topic_with_no_key_of_its_own_carries_any_key(self):
        """⛔⛔ INVERTED TWICE, AND BOTH PRIOR CLAIMS ARE KEPT.

        ORIGINAL (26.96-14): a cross-key change on any NON-VALUE topic must
        win the first branch — *"the pairing is scoped to the value tuple and
        nothing else."*

        26.96-17: narrowed to "a topic with NO KEY OF ITS OWN is untouched by
        the pairing", because the original rationale was a green pin standing
        over the untreated half of CR-04.

        26.96-19, HER RULING: a topic with no key of its own now refuses every
        change. The narrowing above is retired with the behaviour it
        described. ⛔ The case keeps its name — see T-26.96-53 — even though
        the name now describes the opposite of what it asserts, because a
        reader tracing WR-12 or CR-04 must land here and read the whole
        sequence rather than find a tidy case with no history."""
        change = [{"key": "cleaning_enabled", "to": False, "says": ""}]
        self.assertEqual(server.TOPIC_KEYS["surface_content"], ())
        self.assertEqual(
            server._config_disposition(change, "surface_content"),
            "surface_suggestions")

    def test_control_the_topic_less_keys_stay_reachable(self):
        """⚠ THE EXPECTATION CHANGED ON PURPOSE, 26.96-18, and the old one is
        kept rather than deleted.

        OLD EXPECTATION (26.96-17): `other` is deliberately ABSENT from the
        table, because pairing it would make `voice_model` and
        `blessing_batch_size` unreachable — they have no topic of their own
        and `other` is their only door.

        ⛔ THAT REASONING WAS MEASURED ONLY AGAINST THE EMPTY TUPLE, and on
        that basis the owner was told the door "cannot be closed". It was
        FALSE: pairing `other` to exactly those two keys closes the switch
        card and keeps both keys reachable. She re-ruled it closed once the
        premise was corrected.

        NEW EXPECTATION: `other` is PAIRED, and the two keys still arrive —
        which is what this case has always really been protecting.

        #105 (2026-08-25): `display_fence_open` is the third topic-less key
        on the same door — device-resolved, so a validated change through
        `other` is the only way the chat reaches it, exactly like the two
        that preceded it."""
        self.assertEqual(server.TOPIC_KEYS["other"],
                         ("voice_model", "blessing_batch_size",
                          "display_fence_open"))
        for key in ("voice_model", "blessing_batch_size",
                    "display_fence_open"):
            self.assertEqual(
                server._config_disposition(
                    [{"key": key, "to": None, "says": ""}], "other"),
                "configurable", key)

    def test_the_likeliest_misfiling_door_no_longer_mints_the_switch(self):
        """⛔ HER RULING, DRIVEN. CONFIG_PROMPT tells the model to answer with
        topic `other` when "nothing in the handed list matches what she asked
        for" — and nothing in the handed list matches a one-folder ask. So
        `other` carrying the librarian switch was the likeliest live path to
        the card her Ruling O forbids, and it is now shut without costing the
        two keys above."""
        self.assertEqual(
            server._config_disposition(self.CROSS, "other"), "unmapped")

    def test_control_the_keyless_topics_are_left_exactly_as_they_were(self):
        """⛔⛔ THE NAME IS NOW FALSE AND IS KEPT ANYWAY. They were NOT left as
        they were — 26.96-19 closed them on the owner's ruling. Renaming this
        to match would erase the two sittings where she ruled the other way,
        and T-26.96-53 forbids clearing a red by renaming a case.

        OLD EXPECTATION (26.96-17, twice ruled): these own no key, so the
        pairing has nothing to read and a cross-key change still wins the
        first branch. Recorded then as a named OPEN item, not as fixed.

        NEW EXPECTATION (26.96-19): each is paired to the empty tuple, so a
        change under it is refused and the cascade falls to that topic's own
        branch — manage-only for the two Manage owns, the capability line for
        the four the app cannot do, the surface branch for `surface_content`.

        ⛔ WHAT SHE ACCEPTED TO GET HERE, in her own decision and not
        softened: 49 of 56 topic/key combinations change answer, and in every
        one the room stops doing something it CAN do. She was shown that
        measurement three times and reversed on the third."""
        expected = {}
        for topic in server.MANAGE_ONLY_TOPICS:
            expected[topic] = "manage_only"
        for topic in server.NOT_A_CAPABILITY:
            expected[topic] = "not_a_capability"
        for topic in server.SURFACE_TOPICS:
            expected[topic] = "surface_suggestions"
        # POSITIVE CONTROL: an empty mapping would satisfy the loop below.
        self.assertGreaterEqual(len(expected), 7)
        for topic, verdict in expected.items():
            self.assertEqual(server.TOPIC_KEYS[topic], (), topic)
            self.assertEqual(
                server._config_disposition(self.CROSS, topic), verdict, topic)

    def test_the_one_door_that_remains_is_the_switchs_own_topic(self):
        """⛔ THE HONEST RESIDUE, ASSERTED SO IT IS NOT MISTAKEN FOR ZERO.
        Exactly one topic still resolves a `librarian_enabled` change to
        `configurable`: `librarian` itself, where the key IS its own and the
        pairing has no mismatch to see. If the model files a one-folder
        sentence under `librarian`, she still gets the whole-library switch.

        That is a CLASSIFIER problem, not a cascade one — but ⛔ NOT an
        impossible one: `_config_disposition` already takes a sentence-derived
        argument, so a second sentence-derived signal is available by this
        function's own precedent. Not built, not designed, not ruled on."""
        doors = [t for t in server.ASK_TOPICS
                 if server._config_disposition(self.CROSS, t) == "configurable"]
        self.assertEqual(doors, ["librarian"])


# ---------------------------------------------------------------------------
# 26.96-17 (CR-05, security pass 2 / T-26.96-51) — A FENCE REQUEST IS ANSWERED
# AS A FENCE REQUEST EVEN WHEN HER SENTENCE NAMES HER VAULT.
# ---------------------------------------------------------------------------
# HER RULING, 2026-08-21, chosen from two options with each cost shown: the
# fence request ignores the word. Option 2 — dropping "vault" and "obsidian"
# from _CONFIG_UNSUPPORTED_SOURCE_WORDS altogether — was put to her beside its
# cost and REFUSED: that list exists because there is no Obsidian adapter, and
# removing the words would send a genuine "connect my vault" ask to Manage to
# hunt for a control that is not there (26.87 UAT F7, the defect the list was
# added to fix).
#
# ⛔ NO NEW SENTENCE. Both sentences already ship. What changes is which one a
# fence request reaches.
class FenceRequestSurvivesHerOwnWordForHerLibraryTest(unittest.TestCase):
    """⛔ RED BEFORE THE FIX: her literal sentence returned
    `not_a_capability`, which speaks CONFIG_NOT_A_CAPABILITY_MSG — *"that's
    past what i can change… an ai coding assistant in your terminal could
    build it"* — for a request the private-folders pane exists to serve."""

    # ⛔ PINNED BY THE SENTENCE, NOT BY A BOOLEAN. The interaction being fixed
    # is between the unsupported-source reader and the cascade, so the case
    # drives BOTH rather than passing `unsupported=True` by hand.
    HERS = 'can you hide my Journal folder in my vault from yourself'
    HERS_PLAIN = 'can you hide my Journal folder from yourself'
    HERS_OBSIDIAN = 'stop reading my obsidian Journal folder'

    def _drive(self, sentence, topic, changes):
        return server._config_disposition(
            changes, topic, server._config_names_unsupported_source(sentence))

    def test_her_sentence_reaches_her_ruled_route_line_with_the_word_in_it(
            self):
        """The whole finding, driven end to end on all three shapes her
        sentence takes: naming her vault must not turn a fence request into a
        capability refusal."""
        for sentence in (self.HERS, self.HERS_OBSIDIAN):
            self.assertTrue(
                server._config_names_unsupported_source(sentence),
                "the precondition stopped holding — this case would pass "
                "vacuously: %r" % sentence)
            for changes in ([], [{"key": "librarian_enabled", "to": False,
                                  "says": ""}]):
                self.assertEqual(
                    self._drive(sentence, "roster", changes), "manage_only",
                    "%r on changes=%r" % (sentence, changes))

    def test_the_plain_phrasing_is_unchanged(self):
        """The sentence without the word was already right and must stay
        byte-for-byte the same answer — this fix may not move it."""
        self.assertFalse(
            server._config_names_unsupported_source(self.HERS_PLAIN))
        self.assertEqual(
            self._drive(self.HERS_PLAIN, "roster", []), "manage_only")

    def test_control_a_genuine_connect_ask_still_gets_the_honest_answer(self):
        """⛔ THE COST SHE REFUSED, PINNED SO IT CANNOT BE PAID BY ACCIDENT.
        There is no Obsidian adapter. A connect ask must still reach the
        capability-gap line — if this goes red, someone has taken option 2
        after she chose option 1."""
        self.assertEqual(
            self._drive('can you connect my obsidian vault so it stays '
                        'current', "connected_sources", []),
            "not_a_capability")

    def test_control_the_words_are_still_on_the_list(self):
        """The fix is a narrowing of WHERE the flag applies, never a deletion
        of the flag. Both words stay, and the reader still reports them."""
        for word in ("vault", "obsidian"):
            self.assertIn(word, server._CONFIG_UNSUPPORTED_SOURCE_WORDS)

    def test_control_the_other_value_topics_keep_the_capability_line(self):
        """Scope control, and an honest one: only `roster` is exempted,
        because only the roster's destination — the private-folders pane —
        is a place that certainly exists for a sentence naming her vault.
        ⚠ `filters` naming her vault still lands on the capability line; that
        is recorded as untreated, not as decided-correct."""
        for topic in ("filters", "connected_sources", "librarian_name"):
            self.assertEqual(
                self._drive(self.HERS, topic, []), "not_a_capability", topic)


# ---------------------------------------------------------------------------
# 26.99-05 (L-07) — THE CALL RECORD'S READ STATUS, STATED RATHER THAN INFERRED
# ---------------------------------------------------------------------------
# ⚠ THE POINT OF THIS CLASS IS THAT THE ANSWER IS WRITTEN DOWN AT ALL. A new
# file under a person's control has its read status decided by whichever code
# path reaches it first, unless somebody states it — and the precedent in this
# repo cuts BOTH ways. The keys file is refused (26.93-04). `cleaning-log.json`,
# which holds verbatim copies of her notes and sits inside the library, is NOT.
# So "may the librarian read the record of what the librarian sent?" is a
# decision, not a consequence, and this is where the decision is recorded.
#
# THE ANSWER IS NO, AND THE REASON IS THE FILE'S ROLE. The record is the
# evidence D-02 asks the room to keep of what it sent to a model. A payload
# that could carry it would make the evidence part of the thing it is evidence
# about: the reader of a leak would find, inside the leak, the room's own
# account of the leak. That is the keys file's argument wearing a different
# suit — a file whose whole job is to be ABOUT the calls must never ride one.
#
# ⚠ WHAT WOULD OVERTURN IT: the owner saying so. Nothing else. Not a feature
# that would find the record convenient, and not a scope that "only" wants the
# six numeric fields — the refusal is about what the file is for, not how big
# it is or how dull its contents look.
#
# ⚠ AND THE SPELLINGS THAT ARE *NOT* REFUSED ARE ASSERTED TOO, DELIBERATELY.
# The owner's 2026-08-16 ruling put this file in the room's own config
# directory rather than under `librarian/`, which puts it OUTSIDE the library
# root. A store row can therefore only name it ABSOLUTELY, and the shipped
# predicate's own claim — "the cheap absolute-path test below is not an
# optimisation with a hole in it" — is true here rather than hopeful. The four
# relative spellings below are what makes that a measurement instead of a
# promise: none of them can reach this file, because `_snapshot_path`'s jail
# keeps every relative path under the library root. Had the ruling gone the
# other way, `librarian/<name>` WOULD have been a hole, and this class would
# have had to close it in the fence rather than assert it shut.
# ---------------------------------------------------------------------------

EXPECTED_RECORD_REFUSED_SPELLINGS = 6
EXPECTED_RECORD_UNREACHABLE_SPELLINGS = 4
EXPECTED_OFF_LIMITS_CONFIG_FILES = 2


def record_refused_spellings():
    """Every ABSOLUTE spelling of the call record a store row could carry.

    ⚠ ASSEMBLED FROM THE SHIPPED CONSTANTS, never typed. A literal here would
    be a second place the path is written, and the second place is always the
    one that goes stale."""
    home = str(Path.home())
    d = study_lib.ROOM_CONFIG_DIR_NAME
    n = study_lib.CALL_RECORD_NAME
    return [
        ("the plain absolute path the writer itself uses",
         str(study_lib.call_record_path())),
        ("the `~` spelling, which expanduser resolves", "~/" + d + "/" + n),
        ("a `.` segment, which normpath collapses", home + "/./" + d + "/" + n),
        ("a `..` bounce through the directory itself",
         home + "/" + d + "/../" + d + "/" + n),
        ("a doubled separator", home + "//" + d + "/" + n),
        ("`~` and `..` together — both normalisations in one path",
         "~/" + d + "/../" + d + "/" + n),
    ]


def record_unreachable_spellings():
    """RELATIVE spellings a store row could carry. None of them may reach the
    record: the predicate declines them (it is absolute-only by design) and
    the snapshot jail keeps them under the library root."""
    d = study_lib.ROOM_CONFIG_DIR_NAME
    n = study_lib.CALL_RECORD_NAME
    return [
        ("the bare file name", n),
        ("the config directory, spelled relatively", d + "/" + n),
        ("the spelling option A would have created, under `librarian/`",
         "librarian/" + n),
        ("an escape attempt out of the library", "../../" + d + "/" + n),
    ]


# ---------------------------------------------------------------------------
# ---- 26.995-05 (D-06/D-43): THE REFLECTION'S NAME IS ITS OWN ANSWER --------
#
# ⚠ WHY THESE CASES EXIST, because a contract written after its code reads as
# a description rather than a requirement. Today a reflection's name is
# DERIVED: the draft's first markdown heading, else its first non-empty line.
# D-04 deletes the required heading, so every letter would be named by its
# greeting — the second letter opening "Dear one," folds to the same name as
# the first, the reuse gate rejects it, the regeneration produces the same
# greeting, and the sitting dies with the error message, AT THE COST OF A
# WHOLE SECOND ESSAY CALL. CONTEXT's own words: as things stand the letter
# shape cannot ship at all.
#
# The letter fixtures below are the deadlock, written down. Against the
# derivation they are all one title; against a name of the answer's own they
# are three.
#
# ⚠ THE ANTI-MIRROR RULE APPLIES TO EVERY CASE HERE. The folding table
# asserts hand-written EXPECTED LITERALS, never
# `_fold_title(a) == _fold_title(b)` —
# folding both sides with the production function proves only that the
# function is deterministic, which is the defect class this project has now
# recorded eleven times.

# Three letters that open IDENTICALLY. The body is GOOD_ESSAY — the repo's
# canonical valid reflection — so every other gate (no-push, clinical,
# narration, ceiling, address floor) passes and the ONLY thing these cases can
# be about is the name.
LETTER_OPENING = "Dear one,"
LETTER_A = LETTER_OPENING + "\n\n" + GOOD_ESSAY
LETTER_B = LETTER_OPENING + "\n\n" + GOOD_ESSAY + "\n\nthe hinge again."
LETTER_C = LETTER_OPENING + "\n\n" + GOOD_ESSAY + "\n\nthe window seat."
NAME_A = "on returning to the same walk"
NAME_B = "the hinge, again"
NAME_C = "the window seat"

# The folding rule, as HAND-WRITTEN pairs of (input, expected folded literal).
# Nothing in this table is produced by calling the production function.
FOLD_TABLE = (
    ("the thread", "the thread"),
    ("The Thread", "the thread"),
    ("THE THREAD", "the thread"),
    ("  the thread  ", "the thread"),
    ("the  thread", "the thread"),
    ("the\tthread", "the thread"),
    ("the\nthread", "the thread"),
    # U+3000 IDEOGRAPHIC SPACE is Unicode whitespace, so str.split() collapses
    # it exactly like an ASCII space. Measured, not assumed.
    ("the　thread", "the thread"),
    # casefold(), not lower(): the German sharp s folds to two letters.
    ("Straße", "strasse"),
    # ⛔ WHAT THE RULE DOES NOT DO — each of these keeps its own
    # identity, and the list is the honest half of the docstring's claim.
    ("the thread.", "the thread."),          # punctuation is NOT stripped
    ("the-thread", "the-thread"),            # a hyphen is not a space
    ("the threads", "the threads"),          # no stemming
    ("thread", "thread"),                    # no substring match
    # full-width is NOT folded — casefold() leaves compatibility forms be
    ("ＴＨＥ ＴＨＲＥＡＤ", "ｔｈｅ ｔｈｒｅａｄ"),
    ("", ""),
    ("   ", ""),
)


class ReflectionNameTest(unittest.TestCase):
    """26.995-05 (D-06): the name is a separate answer, and every consumer
    reads that ONE name — the reuse gate, the ledger, the store item, the
    book and the vault write-back filename.

    ⛔ LANDED RED-FIRST. Against HEAD, `validate_reflection` carries no
    notion of a name at all: `cleaned` has no "name" key (KeyError) and the
    reuse gate re-derives from the draft, so the two letters below fold to
    one title and BOTH are rejected."""

    # ---- the deadlock D-04 would have shipped ---------------------------

    def test_two_letters_opening_the_same_way_are_not_a_repeat(self):
        """THE HEADLINE TRUTH. Two letters that both open "Dear one," but
        carry different names both pass.

        ⛔ THE UNMUTATED CONTROL IS THE THIRD ARM: two drafts carrying the
        SAME name still reject. Without it this case would pass just as
        happily against a gate that had been deleted rather than re-aimed."""
        # the prior record already holds the greeting — which is exactly
        # what the OLD derivation would have written into it.
        priors = [LETTER_OPENING, NAME_A]
        ok_b, cleaned_b, why_b = server.validate_reflection(
            {"reflection": LETTER_B, "name": NAME_B,
             "coda": None, "question": None},
            [], [], prior_titles=priors)
        self.assertTrue(
            ok_b, "a letter is named by its ANSWER, never by its greeting: "
                  "why=%r" % (why_b,))
        self.assertEqual(cleaned_b["name"], NAME_B)
        ok_c, cleaned_c, why_c = server.validate_reflection(
            {"reflection": LETTER_C, "name": NAME_C,
             "coda": None, "question": None},
            [], [], prior_titles=priors)
        self.assertTrue(ok_c, "and so is the next one: why=%r" % (why_c,))
        self.assertEqual(cleaned_c["name"], NAME_C)
        # THE CONTROL — the gate is re-aimed, not disabled.
        ok_a, cleaned_a, why_a = server.validate_reflection(
            {"reflection": LETTER_A, "name": NAME_A,
             "coda": None, "question": None},
            [], [], prior_titles=priors)
        self.assertFalse(ok_a, "a REPEATED NAME is still a repeat")
        self.assertIsNone(cleaned_a)
        self.assertEqual(why_a, "title_reuse")

    def test_the_gate_compares_the_name_never_the_first_heading(self):
        """The name and the heading disagree ON PURPOSE, so the two arms
        below are exact inverses of what HEAD does."""
        draft = "## the thread\n\n" + GOOD_ESSAY
        self.assertEqual(
            server._reflection_book_title(draft), "the thread",
            "the OLD derivation still reads the heading — unchanged, and "
            "still the read-time fallback")
        ok, cleaned, why = server.validate_reflection(
            {"reflection": draft, "name": "the small table by the window",
             "coda": None, "question": None},
            [], [], prior_titles=["the thread"])
        self.assertTrue(
            ok, "the HEADING matching a prior is not a repeat — the name is "
                "what was already used: why=%r" % (why,))
        self.assertEqual(cleaned["name"], "the small table by the window")
        ok2, cleaned2, why2 = server.validate_reflection(
            {"reflection": draft, "name": "the small table by the window",
             "coda": None, "question": None},
            [], [], prior_titles=["The Small Table  By The Window"])
        self.assertFalse(ok2, "and the NAME matching a prior is")
        self.assertIsNone(cleaned2)
        self.assertEqual(why2, "title_reuse")

    # ---- the folding rule, stated and asserted by value -----------------

    def test_the_folding_rule_against_hand_written_pairs(self):
        """⛔ EVERY EXPECTED VALUE BELOW IS HAND-WRITTEN. The production
        function is called on ONE side only."""
        self.assertEqual(len(FOLD_TABLE), 16,
                         "the folding table's size, by value — a row that "
                         "vanishes must fail here rather than shrink in "
                         "silence")
        for raw, expected in FOLD_TABLE:
            self.assertEqual(
                server._fold_title(raw), expected,
                "_fold_title(%r) must be exactly %r — the rule its "
                "docstring states" % (raw, expected))
        # what the table MEANS, read off the hand-written literals alone.
        same = [r for r, e in FOLD_TABLE if e == "the thread"]
        self.assertEqual(len(same), 8,
                         "eight hand-written spellings of ONE title")
        different = [r for r, e in FOLD_TABLE
                     if e not in ("the thread", "")]
        self.assertEqual(len(different), 6,
                         "six that are NOT that title — without these the "
                         "table would pass against a fold returning a "
                         "constant")

    def test_the_folding_rule_is_what_the_reuse_gate_uses(self):
        """The docstring's rule and the gate's behaviour are the same rule,
        driven through the shipped entry point rather than asserted twice."""
        for spelling in ("the hinge, again", "The Hinge, Again",
                         "  THE  HINGE,   AGAIN  ", "the hinge,\tagain"):
            ok, _c, why = server.validate_reflection(
                {"reflection": LETTER_B, "name": NAME_B,
                 "coda": None, "question": None},
                [], [], prior_titles=[spelling])
            self.assertFalse(ok, "folded-equal prior accepted: %r"
                                 % (spelling,))
            self.assertEqual(why, "title_reuse")
        # THE CONTROL — a prior the rule says is a DIFFERENT title.
        for spelling in ("the hinge again", "the-hinge, again",
                         "the hinges, again"):
            ok, cleaned, why = server.validate_reflection(
                {"reflection": LETTER_B, "name": NAME_B,
                 "coda": None, "question": None},
                [], [], prior_titles=[spelling])
            self.assertTrue(ok, "a DIFFERENT title rejected: %r why=%r"
                                % (spelling, why))
            self.assertEqual(cleaned["name"], NAME_B)

    # ---- everything already on her disk still opens ---------------------

    def test_an_answer_with_no_name_field_still_gets_one(self):
        """⛔ THE BACK-COMPAT ROUTE, and it is the whole reason the old
        derivation is kept rather than deleted: a session file or a book
        saved before this change has no name field and never will."""
        draft = "## the thread\n\n" + GOOD_ESSAY
        ok, cleaned, why = server.validate_reflection(
            {"reflection": draft, "coda": None, "question": None},
            [], [], prior_titles=[])
        self.assertTrue(ok, "an answer with NO name key is valid: %r"
                            % (why,))
        self.assertEqual(cleaned["name"], "the thread",
                         "the fallback IS the old derivation — one rule, "
                         "not a second one that could drift")
        # and the fallback feeds the gate exactly like a supplied name
        ok2, cleaned2, why2 = server.validate_reflection(
            {"reflection": draft, "coda": None, "question": None},
            [], [], prior_titles=["The  Thread"])
        self.assertFalse(ok2)
        self.assertIsNone(cleaned2)
        self.assertEqual(why2, "title_reuse")

    def test_a_headingless_answer_with_no_name_falls_back_twice_over(self):
        """The second and third rungs of the old derivation survive too."""
        ok, cleaned, _why = server.validate_reflection(
            {"reflection": LETTER_A, "coda": None, "question": None},
            [], [], prior_titles=[])
        self.assertTrue(ok)
        self.assertEqual(cleaned["name"], LETTER_OPENING,
                         "no heading -> the first non-empty line, exactly "
                         "as before — THIS IS THE DEADLOCK, preserved as "
                         "the fallback and no longer the rule")

    # ---- fail-closed on a NEW answer -----------------------------------

    def test_a_name_that_is_not_a_non_empty_string_is_a_shape_reject(self):
        """A malformed name is a SHAPE rejection, never a silent fallback.

        ⚠ `None` lands here on purpose: the wire schema asks for a string
        and does not permit null, so a null is an off-contract answer — the
        same fail-closed move a map-shaped `whys` gets. ABSENCE is the one
        spelling that means "no name of its own", and it is handled above."""
        for bad in (None, 42, True, [], {}, "", "   ", b"x", 0.5):
            ok, cleaned, why = server.validate_reflection(
                {"reflection": LETTER_A, "name": bad,
                 "coda": None, "question": None},
                [], [], prior_titles=[])
            self.assertFalse(ok, "name=%r accepted" % (bad,))
            self.assertIsNone(cleaned)
            self.assertEqual(why, "shape", "name=%r" % (bad,))
        # THE CONTROL — one good name, same draft, everything else equal.
        ok, cleaned, why = server.validate_reflection(
            {"reflection": LETTER_A, "name": NAME_A,
             "coda": None, "question": None},
            [], [], prior_titles=[])
        self.assertTrue(ok, "the control must pass: %r" % (why,))
        self.assertEqual(cleaned["name"], NAME_A)

    # ---- the name is a GENERATED FIELD and is scanned like one ----------

    def test_the_name_joins_every_generated_field_scan(self):
        """⛔ RULE 2, AND IT IS A REAL HOLE THIS PLAN OPENS. Until now the
        title was LIFTED OUT OF THE DRAFT, so scanning the draft scanned the
        title. A name of its own is independent text that reaches the
        ledger, the store item, the book, the vault frontmatter AND a
        filename on her disk — unscanned, it is a fence leak with a
        filesystem on the other side of it."""
        fenced = "fence-title-secret-note"
        ok, cleaned, why = server.validate_reflection(
            {"reflection": GOOD_ESSAY, "name": "on " + fenced,
             "coda": None, "question": None},
            [fenced], [], prior_titles=[])
        self.assertFalse(ok, "a fenced item's title inside the NAME")
        self.assertIsNone(cleaned)
        self.assertEqual(why, "fenced_title")
        ok2, cleaned2, why2 = server.validate_reflection(
            {"reflection": GOOD_ESSAY, "name": "your trauma response",
             "coda": None, "question": None},
            [], [], prior_titles=[])
        self.assertFalse(ok2, "clinical vocabulary inside the NAME")
        self.assertIsNone(cleaned2)
        self.assertEqual(why2, "clinical_claim")
        # THE CONTROL — the same three scans, one benign name.
        ok3, cleaned3, why3 = server.validate_reflection(
            {"reflection": GOOD_ESSAY, "name": NAME_C,
             "coda": None, "question": None},
            [fenced], [], prior_titles=[])
        self.assertTrue(ok3, "a benign name passes all three: %r" % (why3,))
        self.assertEqual(cleaned3["name"], NAME_C)

    # ---- the name is chrome, and chrome is bounded ----------------------

    def test_a_supplied_name_is_flattened_and_spine_trimmed(self):
        """The name reaches a YAML scalar and a filename, so it is bounded
        exactly like the derived title always was: whitespace flattened to
        single spaces, trimmed to 60 characters. ONE rule for both, because
        there is now ONE name."""
        long_name = "a " + ("very " * 40) + "long name"
        ok, cleaned, _why = server.validate_reflection(
            {"reflection": GOOD_ESSAY, "name": long_name,
             "coda": None, "question": None},
            [], [], prior_titles=[])
        self.assertTrue(ok)
        self.assertEqual(server.REFLECTION_NAME_CHARS, 60,
                         "the spine bound, by value")
        self.assertEqual(len(cleaned["name"]), 60,
                         "trimmed at the spine bound — the same number the "
                         "derived title has always used, and ONE number "
                         "rather than two free to drift apart")
        self.assertTrue(long_name.startswith(cleaned["name"]),
                        "a trim, never a rewrite")
        ok2, cleaned2, _w2 = server.validate_reflection(
            {"reflection": GOOD_ESSAY,
             "name": "  the window\n seat  ",
             "coda": None, "question": None},
            [], [], prior_titles=[])
        self.assertTrue(ok2)
        self.assertEqual(cleaned2["name"], "the window seat",
                         "a newline in a name can never fragment the "
                         "frontmatter or the filename")

    # ---- one name, six uses --------------------------------------------

    def test_the_resolver_is_one_function_and_both_rungs_are_reachable(self):
        """`_reflection_name` is the ONE place the two routes meet — the
        supplied answer and the read-time fallback. Asserted by value on
        both rungs so neither can be quietly removed."""
        self.assertEqual(
            server._reflection_name(NAME_A, LETTER_A), NAME_A,
            "a supplied name wins")
        self.assertEqual(
            server._reflection_name(None, "## the thread\n\nbody."),
            "the thread", "no name -> the heading")
        self.assertEqual(
            server._reflection_name(None, LETTER_A), LETTER_OPENING,
            "no name and no heading -> the first non-empty line")
        self.assertEqual(
            server._reflection_name(None, ""), "a reflection",
            "and the literal last resort, unchanged")
        self.assertEqual(
            server._reflection_name("   ", "## the thread\n\nbody."),
            "the thread",
            "a blank name is not a name — READ-TIME tolerance, fail-open; "
            "the fail-CLOSED half lives in validate_reflection, on a new "
            "answer, and the two are different jobs")


class ReflectionNameLedgerTest(unittest.TestCase):
    """The name reaches the D-14 ledger — one name, not a second derivation
    sitting beside it."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir(parents=True)

    def test_the_ledger_records_the_supplied_name_not_the_heading(self):
        draft = "## the thread\n\n" + GOOD_ESSAY
        server._append_reflection_record(str(self.lib), draft,
                                         name=NAME_A)
        entries = study_lib.load_reflections(str(self.lib))["reflections"]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["title"], NAME_A,
                         "the ledger's title IS the name — the value the "
                         "reuse gate will compare against next time")

    def test_a_record_with_no_name_still_records_the_old_derivation(self):
        """The ledger keeps working for any caller that has not been given
        a name — fail-open, never a raise (its own stated contract)."""
        server._append_reflection_record(str(self.lib),
                                         "## the thread\n\nbody.")
        entries = study_lib.load_reflections(str(self.lib))["reflections"]
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["title"], "the thread")


class CallRecordOffLimitsTest(unittest.TestCase):
    """L-07: the record file's read status, pinned in both spellings."""

    def test_every_absolute_spelling_of_the_record_is_refused(self):
        spellings = record_refused_spellings()
        self.assertEqual(
            len(spellings), EXPECTED_RECORD_REFUSED_SPELLINGS,
            "the examined spellings are counted BY VALUE — a case list that "
            "shrinks silently proves less than it did yesterday and says so "
            "in the same green tick")
        for why, raw in spellings:
            self.assertTrue(
                study_lib._names_off_limits_path(raw),
                "the librarian may read the record of what the librarian "
                "sent, via " + why + " — L-07 says that answer must be "
                "stated and pinned, and the answer is NO")

    def test_the_keys_file_is_still_refused_beside_it(self):
        # The regression half. A refusal set that GAINED a member must not
        # have quietly lost one; 26.93-04's case, restated where the second
        # member joins so the two can never drift apart.
        self.assertTrue(
            study_lib._names_off_limits_path(str(study_lib.keys_file_path())),
            "the keys file stopped being off-limits while a second name was "
            "being added beside it")

    def test_exactly_two_of_the_rooms_three_config_files_are_off_limits(self):
        verdicts = {
            "keys": study_lib._names_off_limits_path(
                str(study_lib.keys_file_path())),
            "record": study_lib._names_off_limits_path(
                str(study_lib.call_record_path())),
            "settings": study_lib._names_off_limits_path(
                str(study_lib.settings_file_path())),
        }
        self.assertEqual(
            sum(1 for v in verdicts.values() if v),
            EXPECTED_OFF_LIMITS_CONFIG_FILES,
            "the refusal set's size, BY VALUE — measured: " + repr(verdicts))
        self.assertFalse(
            verdicts["settings"],
            "the settings file is deliberately NOT refused. Its own docstring "
            "says nothing secret is ever written there, and that the split is "
            "what lets the file be pasted into a bug report. A fence that "
            "widened to it would be refusing a file for being NEARBY, which "
            "is how a fence turns into a mood")

    def test_a_store_row_naming_the_record_is_fenced_by_either_field(self):
        record = str(study_lib.call_record_path())
        for field in ("library_path", "origin_path"):
            item = {"id": "aa01", "state": "blessed", field: record}
            self.assertTrue(
                study_lib._librarian_fenced(item, []),
                "a store row naming the record file in `" + field + "` "
                "survived the fence — either field alone is enough to name a "
                "file, which is why both are checked")
        # ...and the control, so the two cases above are not passing on a
        # fence that has started refusing everything.
        self.assertFalse(
            study_lib._librarian_fenced(
                {"id": "aa02", "state": "blessed",
                 "library_path": "items/aa02.md"}, []),
            "an ordinary blessed row was fenced too — then the refusals "
            "above prove nothing about the record file")

    def test_no_relative_spelling_can_reach_the_record(self):
        spellings = record_unreachable_spellings()
        self.assertEqual(len(spellings),
                         EXPECTED_RECORD_UNREACHABLE_SPELLINGS,
                         "counted BY VALUE, same reason as above")
        real = os.path.realpath(str(study_lib.call_record_path()))
        jailed = 0
        with tempfile.TemporaryDirectory() as tmp:
            lib = Path(tmp) / "Library"
            (lib / "items").mkdir(parents=True)
            for why, raw in spellings:
                # 1. the predicate declines it — absolute-only, by design.
                self.assertFalse(
                    study_lib._names_off_limits_path(raw),
                    "the predicate answered on a RELATIVE path (" + why +
                    ") — that is not what its own prose says it does, and a "
                    "quietly widened predicate is a second rule nobody wrote "
                    "down")
                # 2. ...and it could not reach the file anyway: the jail.
                resolved = study_lib._snapshot_path(
                    str(lib), {"library_path": raw})
                if resolved is None:
                    jailed += 1
                    continue
                self.assertNotEqual(
                    os.path.realpath(str(resolved)), real,
                    "a library-relative spelling resolved to the real record "
                    "file (" + why + ") — this is exactly the hole the "
                    "owner's directory ruling avoided, and it is back")
        self.assertGreater(
            jailed, 0,
            "not one spelling was turned away by the jail, so the second "
            "half of this case proved nothing about the jail")

    def test_the_refusal_would_be_red_without_the_record_in_the_set(self):
        """The in-memory drill. ⚠ A REFUSAL NEVER SEEN RED IS NOT EVIDENCE.

        `before` is the predicate as it stood BEFORE this plan — one file
        off-limits, the keys file, hand-rolled here rather than called so a
        bug in the shipped set cannot hide inside its own mirror. It must
        ADMIT the record; the shipped set must REFUSE it. If those two ever
        agree, the refusal this plan added is not load-bearing and every case
        above is passing for a reason nobody chose."""
        def before(raw):
            if not isinstance(raw, str) or not raw:
                return False
            if not (raw.startswith("~") or os.path.isabs(raw)):
                return False
            candidate = os.path.normpath(os.path.expanduser(raw))
            target = os.path.normpath(str(study_lib.keys_file_path()))
            return os.path.normcase(candidate) == os.path.normcase(target)

        record = str(study_lib.call_record_path())
        self.assertFalse(
            before(record),
            "the mirror of the OLD one-file refusal set already refuses the "
            "record — then this plan changed nothing")
        self.assertTrue(
            study_lib._names_off_limits_path(record),
            "the shipped predicate and the pre-plan mirror agree about the "
            "record file, so 26.99-05's refusal is doing no work")
        self.assertTrue(
            before(str(study_lib.keys_file_path())),
            "the mirror lost the keys file as well — it is supposed to "
            "differ from the shipped set in EXACTLY one name")


# ---------------------------------------------------------------------------
# 26.995-09 (D-23 / D-24 / D-20) — THE TWO PILES, AND THE ROOM'S OWN PROSE
# LABELLED WHEREVER IT ENTERS THE POOL.
#
# D-23: a note she wrote on a photograph is something she said about her life.
# A note she wrote on a reflection is something she said about the ROOM'S
# WRITING. They are never read the same way. Before this class the pool
# builder rode every comment into the next reflection's material with no
# discrimination at all — a reflection's comment arrived exactly like a
# photograph's, and the room began reflecting on its own prose.
#
# D-20: a saved reflection is minted with source "librarian" and state
# "unseen"; nothing promotes it to blessed; and the admit path reads an unseen
# TEXT item's FULL BODY when consent is given. A body row carries no `source`
# key at all. So without consent a past reflection appeared as a labelled meta
# row, and WITH consent it appeared as an unlabelled body row indistinguishable
# from her own writing — the room reading its own prose back as hers at the
# exact moment she gave the widest permission.
#
# ⚠ THE KEY NAME IS WRITTEN AS A LITERAL ON BOTH SIDES, DELIBERATELY. A shared
# constant would let a rename move the code and the assertion together and pass,
# which is this project's signature defect (a check that pins the wrong thing as
# correct). Two literals cannot drift silently: renaming one turns this class
# red.
# ---------------------------------------------------------------------------

class TwoPilesTest(unittest.TestCase):
    """The pool separates her notes about her life from her notes about the
    room's writing, and labels the room's own prose on the row that carries
    it. Narrowing and labelling only — nothing here widens the pool."""

    STAMP = "2026-08-19T20:00:00+00:00"
    HER_BODY = "HER-OWN-WRITING the loom again on tuesday 手记"
    ROOM_BODY = "ROOM-OWN-PROSE you kept returning to the loom this week"
    PHOTO_NOTE = "PHOTO-COMMENT-HERS the light that afternoon"
    REFLECTION_NOTE = "REFLECTION-COMMENT-HERS this one landed"

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.lib = Path(self._tmp.name) / "library"
        self.lib.mkdir()

    def tearDown(self):
        self._tmp.cleanup()

    def _photograph(self, i=1, state="blessed"):
        """A photograph she commented on — an image item, so it can only ever
        arrive as a meta row, comments and all."""
        it = make_item(self.lib, i, state=state, type_="image",
                       title=f"an afternoon-{i}.png", folder="photos")
        it["comments"] = [{"at": self.STAMP, "text": self.PHOTO_NOTE}]
        return it

    def _vault_reflection(self, i=2, state="blessed"):
        """The vault-side twin: a journal-reflection output under the
        reflection folder carrying a reflects facet — is_reflection's half of
        the shipped self-authored predicate."""
        it = make_item(self.lib, i, state=state, body=self.ROOM_BODY,
                       source="obsidian-vault",
                       folder=study_lib.REFLECTION_FOLDER,
                       title=f"a reflection-{i}.md")
        it["reflects"] = True
        it["comments"] = [{"at": self.STAMP, "text": self.REFLECTION_NOTE}]
        return it

    def _minted_reflection(self, i=3, state="unseen"):
        """The room's own half: exactly what add_generated_reflection mints —
        source "librarian", state "unseen", a real text snapshot."""
        it = make_item(self.lib, i, state=state, body=self.ROOM_BODY,
                       source="librarian", folder="items",
                       title="a reflection")
        it["origin_path"] = it["library_path"]
        return it

    def _hers(self, i=4, state="blessed"):
        it = make_item(self.lib, i, state=state, body=self.HER_BODY,
                       source="obsidian-vault", folder="journal",
                       title=f"an evening-{i}.md")
        return it

    @staticmethod
    def _rows(payload):
        """Every pool row keyed by id — bodies and meta rows together, so a
        case can assert about a row without first knowing which list it
        landed in."""
        return {r["id"]: r
                for r in list(payload["bodies"]) + list(payload["meta_rows"])}

    # -- task 1: the two piles ------------------------------------------

    def test_pool_keeps_a_note_on_a_photograph_and_drops_one_on_a_reflection(
            self):
        """⛔ THE HARM, NAMED: a note she wrote ABOUT THE ROOM'S WRITING is not
        material about her life, and reading it as material is how the room
        comes to reflect on its own prose. Both rows are asserted in ONE case,
        BY VALUE — a length of 1 on the photograph's and an empty list on the
        reflection's, never a truthiness check."""
        photo = self._photograph()
        reflection = self._vault_reflection()
        store = make_store(self.lib, [photo, reflection])
        payload = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None)
        rows = self._rows(payload)
        self.assertIn(photo["id"], rows,
                      "the photograph still reaches the pool — this plan "
                      "narrows what a ROW CARRIES, never which items enter")
        self.assertIn(reflection["id"], rows,
                      "the reflection itself still reaches the pool; it is "
                      "the NOTE ON IT that leaves, not the reflection")
        self.assertEqual(
            len(rows[photo["id"]]["comments"]), 1,
            "a note she wrote on a photograph is something she said about "
            "her LIFE — it is material and it must still arrive")
        self.assertEqual(
            rows[reflection["id"]]["comments"], [],
            "a note she wrote on a reflection is something she said about "
            "the ROOM'S WRITING — carrying it as material is how the room "
            "comes to reflect on its own prose")

    def test_pool_bytes_carry_her_photograph_note_and_not_her_reflection_note(
            self):
        """The same claim one layer out, over the serialized bytes a caller
        actually hands the seam — a row-shape assertion alone would not catch
        the note riding in through some other key."""
        photo = self._photograph()
        reflection = self._vault_reflection()
        store = make_store(self.lib, [photo, reflection])
        payload = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None)
        blob = json.dumps(payload, ensure_ascii=False)
        self.assertIn(self.PHOTO_NOTE, blob,
                      "her note about her own things reaches the model")
        self.assertNotIn(self.REFLECTION_NOTE, blob,
                         "her note about the room's writing does not")

    def test_pool_uses_the_shipped_self_authored_predicate_not_a_second_one(
            self):
        """⛔ ONE definition of 'the room's own'. A second source test would be
        a second definition, and this repo's recorded anti-pattern is two
        derivations of one value."""
        src = inspect.getsource(study_lib.build_librarian_payload)
        self.assertIn("_identity_self_authored", src,
                      "the shipped predicate is CALLED inside the builder — "
                      "never re-implemented beside it")

    def test_pool_drops_the_note_on_a_minted_reflection_too(self):
        """The predicate unions two classes and BOTH must be covered: the
        vault-side twin above, and the room's own minted item here. A guard
        keyed on is_reflection alone would pass the case above and leak here."""
        mine = self._minted_reflection(state="blessed")
        mine["comments"] = [{"at": self.STAMP, "text": self.REFLECTION_NOTE}]
        store = make_store(self.lib, [mine])
        payload = study_lib.build_librarian_payload(
            store, "reflection", session_marker=None)
        rows = self._rows(payload)
        self.assertEqual(
            rows[mine["id"]]["comments"], [],
            "source == 'librarian' is the OTHER half of the shipped "
            "predicate — a note on the room's own minted reflection is a "
            "note about the room's writing just the same")

    # -- task 2: the room's own prose, labelled on the row ---------------

    def test_a_consented_past_reflection_arrives_marked_as_the_rooms_own(self):
        """⛔ THE LIVE GAP, VERIFIED THREE WAYS: a saved reflection is minted
        with source 'librarian' and state 'unseen'; nothing promotes it to
        blessed; and the admit path reads an unseen text item's FULL BODY when
        consent is given. A body row carries NO source key. So without consent
        a past reflection appeared as a labelled meta row, and WITH consent it
        appeared as an UNLABELLED body row indistinguishable from her own
        writing — at the exact moment she gave the widest permission.

        The count is asserted BY VALUE, so a marker applied to EVERYTHING
        fails just as loudly as one applied to nothing."""
        hers = self._hers()
        mine = self._minted_reflection()
        store = make_store(self.lib, [hers, mine])
        payload = study_lib.build_librarian_payload(
            store, "reflection", consent=True, session_marker=None)
        bodies = {b["id"]: b for b in payload["bodies"]}
        self.assertEqual(
            sorted(bodies), sorted([hers["id"], mine["id"]]),
            "both arrive as BODY rows on a consented sitting — the setup "
            "this case is about, not an accident of state")
        marked = [b for b in payload["bodies"] if b.get("room_wrote_this")]
        self.assertEqual(
            len(marked), 1,
            "EXACTLY ONE body row is the room's own prose. A marker on "
            "everything is as wrong as a marker on nothing, which is why "
            "this is a count and not a truthiness check")
        self.assertEqual(
            marked[0]["id"], mine["id"],
            "the marked row is the room's own reflection, not her writing")
        self.assertNotIn(
            "room_wrote_this", bodies[hers["id"]],
            "her own writing is never labelled as the room's — the marker "
            "says who WROTE the row, and mislabelling her is the same harm "
            "pointed the other way")

    def test_the_marked_rows_text_is_byte_identical_to_the_item_body(self):
        """Law 4 governs the body: verbatim and undecorated. The marker is a
        KEY BESIDE the text, never a prefix, a wrapper or an annotation ON it."""
        mine = self._minted_reflection()
        store = make_store(self.lib, [mine])
        payload = study_lib.build_librarian_payload(
            store, "reflection", consent=True, session_marker=None)
        row = payload["bodies"][0]
        self.assertTrue(row.get("room_wrote_this"),
                        "the row under test is the marked one")
        on_disk = (self.lib / mine["library_path"]).read_bytes()
        self.assertEqual(
            row["text"].encode("utf-8"), on_disk,
            "the marked row's text is BYTE-IDENTICAL to the item's body — "
            "the marker did not decorate the content")

    def test_without_consent_the_same_reflection_is_an_already_labelled_meta_row(
            self):
        """The unmutated control, and it must be UNCHANGED. Without consent the
        same reflection is held to a meta row, which ALREADY carries its
        source — so the row was labelled all along and only the consented body
        row was not. Nothing here widens or narrows what enters the pool."""
        mine = self._minted_reflection()
        store = make_store(self.lib, [mine])
        payload = study_lib.build_librarian_payload(
            store, "reflection", consent=False, session_marker=None)
        self.assertEqual(
            payload["bodies"], [],
            "an unseen text item without consent yields NO body row")
        self.assertEqual(
            len(payload["meta_rows"]), 1,
            "it is held to exactly one meta row — the shipped behaviour")
        meta = payload["meta_rows"][0]
        self.assertEqual(
            meta["source"], "librarian",
            "the meta row was ALREADY labelled by its source key; this is "
            "the arm that never needed the marker, and it did not move")
        self.assertNotIn(
            "room_wrote_this", meta,
            "the marker is added to BODY rows only — the meta row's own "
            "source key is its label, and two labels would be two "
            "derivations of one value")

    def test_the_marker_does_not_widen_the_pool_same_ids_either_way(self):
        """⛔ NARROWING AND LABELLING ONLY. The change says something new about
        a row; it may never change WHICH rows there are. Driven against the
        full mixed store, consent on and off."""
        items = [self._hers(), self._minted_reflection(),
                 self._vault_reflection(), self._photograph()]
        for consent in (False, True):
            with self.subTest(consent=consent):
                store = make_store(self.lib, items)
                payload = study_lib.build_librarian_payload(
                    store, "reflection", consent=consent, session_marker=None)
                got = sorted(self._rows(payload))
                self.assertEqual(
                    got, sorted(it["id"] for it in items),
                    "every item still reaches the pool, marked or not — a "
                    "label is not a filter")

    # -- task 3: the controls -------------------------------------------

    def _anchor_arms(self, n=3):
        """The SAME three items twice: once as the room's own prose, once as
        hers. Everything else — blessed state, one comment each, the same
        topic, tag and comment words — is held identical, so the ONLY thing
        that differs between the arms is who wrote them."""
        rooms, hers = [], []
        for k in range(n):
            r = make_item(self.lib, 10 + k, state="blessed",
                          body=self.ROOM_BODY,
                          source="obsidian-vault",
                          folder=study_lib.REFLECTION_FOLDER,
                          tags=["loom"], title=f"a reflection-{k}.md")
            r["reflects"] = True
            r["topic"] = "weaving"
            r["comments"] = [{"at": self.STAMP, "text": self.REFLECTION_NOTE}]
            rooms.append(r)
            h = make_item(self.lib, 20 + k, state="blessed",
                          body=self.HER_BODY,
                          source="obsidian-vault", folder="journal",
                          tags=["loom"], title=f"an evening-{k}.md")
            h["topic"] = "weaving"
            h["comments"] = [{"at": self.STAMP, "text": self.REFLECTION_NOTE}]
            hers.append(h)
        return rooms, hers

    def test_the_rooms_own_prose_contributes_zero_to_every_identity_signal(
            self):
        """⛔ D-24's OTHER HALF WAS ALREADY DONE, AND THIS MAKES IT A MACHINE
        FACT RATHER THAN A READING OF A DOCSTRING. The identity-anchor
        derivation skips past every self-authored item BEFORE its comments are
        read, so a reflection's comment has never reached an identity signal —
        which is why D-24 removes a signal from the POOL only and removes
        nothing from the anchors.

        THE ARM THAT SHOULD DIFFER runs alongside: the same three items marked
        as HERS produce real evidence and real page sections. Without it a
        derivation that returned nothing for everybody would pass just as
        happily, which is this project's signature defect."""
        rooms, hers = self._anchor_arms()
        room_anchors = study_lib.derive_identity_anchors(
            make_store(self.lib, rooms))
        her_anchors = study_lib.derive_identity_anchors(
            make_store(self.lib, hers))

        self.assertEqual(
            room_anchors["evidence"], 0,
            "the room's own prose is worth ZERO evidence — or the room "
            "begins deriving her identity from its own writing")
        for key in ("topics", "tags", "folders", "themes", "folder_rows",
                    "phrases"):
            self.assertEqual(
                list(room_anchors[key]), [],
                f"'{key}' must be EMPTY on a store of nothing but the "
                "room's own prose")
        self.assertTrue(room_anchors["thin"],
                        "no evidence at all reads as thin")

        # -- the arm that should differ, by value ------------------------
        # 3 items x (own-voice 3 + comment 3 + blessed 2 + glad 0) = 24.
        self.assertEqual(
            her_anchors["evidence"], 24,
            "her three commented, blessed notes are worth 24 — asserted BY "
            "VALUE so a derivation that quietly stopped weighing anything "
            "cannot pass the zero above")
        self.assertFalse(her_anchors["thin"],
                         "24 clears the evidence floor of 12")
        self.assertNotEqual(list(her_anchors["phrases"]), [],
                            "her own words reach the page — the control is "
                            "not vacuous")
        self.assertIn("weaving", list(her_anchors["topics"]),
                      "her topic reaches the anchors")

    def test_the_commented_item_weighting_is_six_of_ten_and_additive(self):
        """The corrected figure, pinned in the SOURCE CONSTANTS rather than in
        prose, so the retired multiplier claim cannot resurface. A commented
        item scores SIX of a possible TEN, ADDITIVELY across TWO of the four
        signals — a comment is her voice (own-voice) AND a comment."""
        self.assertEqual(
            [study_lib.IDENTITY_WEIGHT_OWN_VOICE,
             study_lib.IDENTITY_WEIGHT_COMMENT,
             study_lib.IDENTITY_WEIGHT_BLESSED,
             study_lib.IDENTITY_WEIGHT_GLAD],
            [3, 3, 2, 2],
            "the four signal weights, by value — they sum to the possible 10")
        commented = make_item(self.lib, 30, state="unseen", body="x",
                              source="obsidian-vault", folder="clippings")
        commented["comments"] = [{"at": self.STAMP, "text": "one note"}]
        self.assertEqual(
            study_lib._identity_item_weight(commented), 6,
            "SIX of ten, additively across two of four signals — never a "
            "multiplier")
        bare = make_item(self.lib, 31, state="unseen", body="x",
                         source="obsidian-vault", folder="clippings")
        self.assertEqual(
            study_lib._identity_item_weight(bare), 0,
            "the arm that should differ: an unjudged, uncommented item is "
            "not evidence about her — it is just a file")

    def test_the_pool_lean_still_reads_a_reflections_comment_RECORDED_NOT_BLESSED(
            self):
        """⛔⛔ A THIRD CONSUMER RESEARCH DID NOT NAME, RECORDED HERE RATHER
        THAN ABSORBED. The plan's grep says the comment reducer has one live
        consumer beside the pool — the identity-anchor derivation, which never
        sees a reflection's comments. It has a THIRD, indirect one: the pass-A
        anchor lean inside this same reflection loop calls
        _identity_own_voice_adjacent on the ITEM with no comments argument, so
        it reads the item's own comments through _item_comments' default.

        A commented reflection is therefore STILL treated as 'her voice' by
        the lean, and so is never dropped as unanchored. That is 26.995-04's
        notion of 'hers' — 'a piece she has left a comment on' — still
        applying to the room's own prose, and it DISAGREES with this plan's
        notion of 'hers'.

        ⚠ THIS CASE RECORDS THAT BEHAVIOUR; IT DOES NOT BLESS IT. The lean
        reads the ITEM, not the pool row, so this plan did not change it, and
        changing it was not this plan's to decide. A later plan that resolves
        the disagreement will turn this case red and read this docstring —
        which is the point of pinning it."""
        reflection = self._vault_reflection()
        self.assertTrue(
            study_lib._identity_self_authored(reflection),
            "the item under test IS the room's own prose")
        self.assertTrue(
            study_lib._identity_own_voice_adjacent(reflection),
            "and the lean's predicate STILL calls it her voice, because it "
            "carries a comment — the disagreement, as a machine fact")
        reflection_without = self._vault_reflection(i=5)
        reflection_without["comments"] = []
        self.assertFalse(
            study_lib._identity_own_voice_adjacent(reflection_without),
            "the arm that should differ: without a comment the same "
            "reflection is not own-voice, so the assertion above is about "
            "the COMMENT and not about the predicate answering True to "
            "everything")


# ---------------------------------------------------------------------------
# ⚠⚠ A GATE NEVER SEEN RED IS NOT EVIDENCE, AND THE INSTRUMENT UNDER THIS FILE
# IS NEW (26.93-07). The leak proof used to read a recorded subprocess argv; it
# now reads a recorded HTTP request. The CLAIMS are the same ones — no fenced
# byte reaches the model — but the thing that measures them was rebuilt, and
# roughly thirty defects of this project's class have landed INSIDE the
# measuring instrument rather than in the code under test: a checker in a shell
# variable that never ran while three of four cases printed "RED, as required";
# a mutation harness that aborted at its first catch and reported one failure
# where there were four.
#
# So the claims live in a FUNCTION that can be driven over in-memory
# copies with one thing wrong each, the unmutated controls are counted in the
# SAME run, the loop never exits early on a catch, and both totals are
# asserted BY VALUE against the literals below.
#
# ⚠ THE SEVENTH MUTATION IS THE POSITIVE CONTROL'S OWN RED. A record with no
# allowed content at all must be caught — otherwise every absence claim above
# it would pass just as well on an empty string, which is the exact shape of
# vacuity this project keeps finding in its own gates.
# ---------------------------------------------------------------------------

EXPECTED_MUTATIONS = 7
EXPECTED_CONTROLS = 2

# The one allowed body in the drill's store. Named once so the positive control
# and the fixture can never drift apart into a check of nothing.
DRILL_SAFE_BODY = "SAFE-BLESSED-BODY"


def fence_record_violations(rec, payload_text, fenced_ids, expected_model):
    """Every claim this file's five seam classes make about ONE recorded
    request, as a list of failures. Empty means all of them held."""
    bad = []
    stdin = str(rec.get("stdin") or "")
    # Everything else that would have travelled. The recorder's `env_keys` is
    # its own note about the process and is deliberately not scanned.
    whole = (json.dumps(rec.get("body") or {}, ensure_ascii=False)
             + str(rec.get("url") or ""))

    # THE POSITIVE CONTROL, FIRST. Without it every absence claim below passes
    # just as well on an empty request.
    if DRILL_SAFE_BODY not in stdin:
        bad.append("the allowed blessed body never reached the request — the "
                   "absence claims below would be checking nothing")

    if FENCE_BODY in stdin or FENCE_BODY in whole:
        bad.append("a fenced body sentinel reached the model")
    if FENCE_TITLE in stdin or FENCE_TITLE in whole:
        bad.append("a fenced title sentinel reached the model")
    for item_id in (fenced_ids or ()):
        if item_id and (item_id in stdin or item_id in whole):
            bad.append("a fenced id reached the model")

    # The stateless-re-send claim, and the reason every scan above is
    # meaningful: the bytes scanned ARE the bytes sent, with no wrapper.
    if stdin != payload_text:
        bad.append("the payload did not reach the model verbatim — a wrapper "
                   "sentence anywhere breaks the one guarantee the fence "
                   "makes about what is sent")

    # The replacement for the retired recorded-argv model pin, read BY VALUE.
    if (rec.get("body") or {}).get("model") != expected_model:
        bad.append("the recorded body names a model other than the routing "
                   "fill's — asserted by value, never by presence")

    if rec.get("had_auth"):
        bad.append("a credential was attached to a call to her own machine, "
                   "which needs none")
    return bad


def drill_measure():
    """One REAL fence build and one REAL call through the shipped seam,
    recorded. Hermetic and free: the home is swapped, so every tier resolves to
    her own machine and no socket is opened at all."""
    with tempfile.TemporaryDirectory() as tmp:
        lib = Path(tmp) / "library"
        lib.mkdir()

        def fenced(i, **kw):
            item_id = format(0x1000 + i, "016x")
            return make_item(lib, i,
                             body=f"{FENCE_BODY}-{item_id} 私密的手记",
                             title=f"{FENCE_TITLE}-{item_id}.md", **kw)

        f1 = fenced(1, state="never_show")
        f2 = fenced(2, state="retired")
        f3 = fenced(3, state="blessed", trigger=True)
        allowed = make_item(lib, 4, state="blessed",
                            body=DRILL_SAFE_BODY + " 安全的手记")
        store = make_store(lib, [f1, f2, f3, allowed])
        fenced_ids = [f1["id"], f2["id"], f3["id"]]
        # THE REAL BUILDER, not a hand-written document: the drill measures the
        # fence and the seam together, which is the only pairing that matters.
        pool = study_lib.build_librarian_payload(
            store, "reflection", store_dir=str(lib), session_marker=None)
        payload_text = json.dumps({"pool": pool, "draft": None, "chat": []},
                                  ensure_ascii=False)
        log = Path(tmp) / "drill-log.json"
        with fake_claude_env(log):
            no_cached_probe()
            L.call_librarian("reflection", payload_text,
                             server.resolve_librarian_routing())
        rec = json.loads(log.read_text(encoding="utf-8"))
    return rec, payload_text, fenced_ids


def run_drill():
    rec, payload_text, fenced_ids = drill_measure()
    model = L.LOCAL_FILL[1]
    url = "http://127.0.0.1:11434/api/chat"

    controls = 0
    # Control 1 — the REAL recorded request, judged clean.
    if fence_record_violations(rec, payload_text, fenced_ids, model) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the real recorded request")
    # Control 2 — an independently fabricated clean copy. Two controls that
    # were the same call twice would only prove the call is deterministic.
    clean_text = DRILL_SAFE_BODY + " and nothing fenced"
    clean = {"stdin": clean_text, "url": url,
             "body": {"model": model,
                      "messages": [{"role": "user", "content": clean_text}]},
             "had_auth": False}
    if fence_record_violations(clean, clean_text, fenced_ids, model) == []:
        controls += 1
    else:
        print("  DRILL CONTROL RED: the fabricated clean copy")

    # THE SEVEN ARE THE SEVEN WAYS THIS PARTICULAR FENCE REALISTICALLY FAILS,
    # not seven arbitrary edits.
    def with_stdin(text):
        mutated = json.loads(json.dumps(rec))
        mutated["stdin"] = text
        mutated["body"]["messages"] = [{"role": "user", "content": text}]
        return mutated

    leaked_body = with_stdin(payload_text + " " + FENCE_BODY + "-99")
    leaked_title = with_stdin(payload_text + " " + FENCE_TITLE + "-99.md")
    leaked_id = with_stdin(payload_text + " " + fenced_ids[0])
    wrapped = with_stdin("Please reflect on the following. " + payload_text)
    wrong_model = json.loads(json.dumps(rec))
    wrong_model["body"]["model"] = "claude-opus-5"
    credentialled = json.loads(json.dumps(rec))
    credentialled["had_auth"] = True
    # ⚠ EVERYTHING ELSE ABOUT THIS ONE IS CLEAN — it even rides verbatim, so
    # only the positive control can catch it. That is what makes it a test OF
    # the control rather than another leak case.
    contentless = {"stdin": "", "url": url,
                   "body": {"model": model,
                            "messages": [{"role": "user", "content": ""}]},
                   "had_auth": False}

    mutations = [
        ("a fenced body sentinel rides the request", leaked_body,
         payload_text),
        ("a fenced title sentinel rides the request", leaked_title,
         payload_text),
        ("a fenced id rides the request", leaked_id, payload_text),
        ("a wrapper sentence is prepended to the payload", wrapped,
         payload_text),
        ("the body names a model the routing never chose", wrong_model,
         payload_text),
        ("a credential is attached to a local call", credentialled,
         payload_text),
        ("the request carries no allowed content at all", contentless, ""),
    ]

    caught = 0
    for name, mutated, sent in mutations:
        if fence_record_violations(mutated, sent, fenced_ids, model):
            caught += 1
        else:
            # ⚠ NEVER EXIT EARLY ON A CATCH. A harness that stopped at its
            # first miss once reported one failure where there were four.
            print("  DRILL MISS: " + name + " was not caught")
    return caught, len(mutations), controls


def main():
    suite = unittest.defaultTestLoader.loadTestsFromModule(
        sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=1).run(suite)

    caught, total, controls = run_drill()
    print("DRILL %d/%d mutations caught, %d controls green"
          % (caught, total, controls))

    # 26.99-05 (L-07): the record file's read status, counted out loud so the
    # answer is visible in the run rather than only inside an assertion.
    print("OFF-LIMITS %d absolute spellings refused, %d relative spellings "
          "unreachable, %d of the room's 3 config files"
          % (len(record_refused_spellings()),
             len(record_unreachable_spellings()),
             EXPECTED_OFF_LIMITS_CONFIG_FILES))

    # ⚠ THE LAST WORD: the real config directory is exactly as this suite found
    # it. It holds a real credential, and only `--setup`, run by the owner, may
    # create or change it. Every class above swaps HOME; this is the check that
    # the swap never leaked.
    untouched = os.path.exists(REAL_ROOM_DIR) == REAL_ROOM_DIR_EXISTED
    if not untouched:
        print("REAL CONFIG DIRECTORY CHANGED — this suite must never do that")

    ok = (result.wasSuccessful()
          and caught == total == EXPECTED_MUTATIONS
          and controls == EXPECTED_CONTROLS
          and untouched)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
