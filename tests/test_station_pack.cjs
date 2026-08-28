/*
 * tests/test_station_pack.cjs — the album/journal station pure pagination
 * cores (Plan 26.5-04, D-11/D-13).
 *
 * Zero-dep node (assert/fs/path only), path-independent via __dirname.
 * packAlbumPages(items, slotsPerPage) and packJournalToc(items,
 * titlesPerPage) are PURE functions inside app.js — no DOM, no clock, no
 * store access — lifted by brace-matching (app.js is a browser IIFE that
 * touches `document` at load, so it can't be require()'d under node); the
 * repo's text-extraction idiom (mirrors test_view_stack.cjs /
 * test_display_fence.cjs). The lift factory injects NOTHING: a free
 * variable in either function is itself a failure (purity by construction).
 *
 * Behaviors covered:
 *   1. ALBUM PACK SHAPE (D-11) — packAlbumPages returns an array of
 *      two-page spreads; each spread holds at most slotsPerPage*2 entries
 *      of {itemId, title, dateLine, page:'left'|'right', slot:0..per-1};
 *      the first slotsPerPage entries of a spread sit on the left page,
 *      the next on the right; slots count 0..per-1 per page.
 *   2. STABLE ORDER — input order is preserved exactly across pages and
 *      spreads (itemIds read back in input order).
 *   3. EMPTY INPUT — [] in, [] out: no placeholder pages, no padding
 *      entries (law 3 adjacent: nothing renders for nothing).
 *   4. STRUCTURAL KEY GUARANTEE (D-13 / law 5) — no entry of EITHER
 *      function's output carries any key beyond the allowed set
 *      {itemId, title, dateLine, slot, page}: a content/body/excerpt
 *      field is impossible by construction, not just unused.
 *   5. JOURNAL TOC PAGES (D-13) — packJournalToc pages hold at most
 *      titlesPerPage rows; entry rows are {itemId, title, dateLine}
 *      ONLY — titles (the safe recall handle) and dates, never body
 *      content; CJK titles pass through verbatim (no transform of her
 *      words). 26.5-09 UAT F13: heading rows are {heading} ONLY, and a
 *      heading's value is structurally a date label (MM/DD/YYYY) or
 *      'earlier' — never content. 26.5-09 UAT F15 (手帐 pages): every
 *      page OPENS with its group's heading — a long group repeats the
 *      same date line on each follow-on page (the quiet continuation
 *      marker, no new copy vocabulary).
 *   6. DATE LINE — dateLine derives from saved_ms || created_ms ||
 *      imported_ms as a plain YYYY-MM-DD; a dateless item gets ''.
 *   7. INPUT PURITY — neither function mutates its input list or the
 *      items inside it.
 *   8. BLESSING-DAY GROUPING (26.5-09 UAT F13) — journal rows group by
 *      the LOCAL calendar day of the item's LATEST history hop with
 *      to:'blessed' (offset-aware ISO 'at'); groups run newest day
 *      first, notes within a day newest blessing first; items with no
 *      blessing hop close the book under one final 'earlier' group in
 *      input order; heading rows consume line slots (the page math
 *      stays honest); no empty group can exist by construction (law 3).
 *   9. DATE-PER-PAGE EXCLUSIVITY (26.5-09 UAT F15) — each date OWNS its
 *      page(s): a new date group ALWAYS starts a fresh page; a single
 *      date's entries may span multiple pages, each re-opening with the
 *      byte-identical date heading; two different dates NEVER share a
 *      page; the 'earlier' fallback group obeys the same rule; no page
 *      is ever heading-only (a heading always stands over ≥1 entry).
 *
 * Prints one OK line and exits 0 on success; exits 1 on the first throw.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// Lift a top-level `function name(...) { ... }` verbatim from source by
// brace-matching from the signature to the matching close brace.
function extractFn(src, name) {
  const sig = 'function ' + name + '(';
  const start = src.indexOf(sig);
  assert.notStrictEqual(start, -1,
    name + ' must be defined in app.js — not found');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  assert.ok(depth === 0, name + "'s braces must balance");
  return src.slice(start, i);
}

// Lift a top-level `var name = <literal>;` verbatim, by brace-matching for
// object literals and to the line end otherwise. Throws when the name is
// absent, which is what 26.91-04's suite 13 asserts for the retired symbols.
// (Moved here 26.91-04 from the rewritten suite 14, which used to own it.)
function extractVar(src, name) {
  const sig = 'var ' + name + ' =';
  const start = src.indexOf(sig);
  assert.notStrictEqual(start, -1,
    name + ' must be declared in app.js — not found');
  const brace = src.indexOf('{', start);
  const semi = src.indexOf(';', start);
  if (brace === -1 || brace > semi) {
    return src.slice(start, semi + 1);
  }
  let i = brace;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; }
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  assert.ok(depth === 0, name + "'s braces must balance");
  return src.slice(start, i) + ';';
}

// The lift injects NOTHING — both cores must be free-var-clean (no DOM,
// no clock, no ROOM/SHELF/StudyCore reads): purity by construction.
function loadPack(name) {
  // eslint-disable-next-line no-new-func
  return new Function(extractFn(appSrc, name) + '\nreturn ' + name + ';')();
}

const packAlbumPages = loadPack('packAlbumPages');
const packJournalToc = loadPack('packJournalToc');

// ---- fixtures ---------------------------------------------------------------

// CJK titles included deliberately: her words pass through verbatim.
function fixtureItems(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 'item-' + String(i).padStart(2, '0'),
      title: i % 2 === 0 ? '手帐 第' + i + '页 · notes' : 'note ' + i,
      type: i % 2 === 0 ? 'image' : 'text',
      state: 'blessed',
      saved_ms: Date.UTC(2026, 0, 1 + i),
      // a body-ish field ON THE INPUT — the structural guarantee below
      // asserts it can never leak into the pack output.
      body: 'PRIVATE CONTENT ' + i,
      comments: [{ at: '2026-07-01T00:00:00Z', text: 'hers ' + i }]
    });
  }
  return out;
}

const ALLOWED_KEYS = ['itemId', 'title', 'dateLine', 'slot', 'page'];

// `headings`, when supplied, is the CLOSED set of heading strings the
// caller's pack may emit. Omitted (the four shipped call sites), the
// check is packJournalToc's own vocabulary, byte-unchanged: an
// MM/DD/YYYY blessing-day label or 'earlier'. 26.9-01 passes the two
// provenance labels instead — packSessionReading has no date heading and
// no 'earlier' bucket at all, so it needs its own closed set rather than
// a widened shared one.
function assertAllowedKeys(entry, where, headings) {
  // 26.5-09 UAT F13: a journal HEADING row is {heading} alone, and its
  // value is structurally a date label or 'earlier' — content cannot
  // ride a heading any more than it can ride an entry.
  if ('heading' in entry) {
    assert.deepStrictEqual(Object.keys(entry), ['heading'], where +
      " heading row must carry the single key 'heading' (D-13, law 5)");
    if (headings) {
      assert.ok(headings.indexOf(entry.heading) !== -1, where +
        ' heading must be one of the closed provenance set ' +
        JSON.stringify(headings) + ", got '" + entry.heading + "'");
      return;
    }
    assert.ok(entry.heading === 'earlier' ||
      /^\d{2}\/\d{2}\/\d{4}$/.test(entry.heading), where +
      " heading must be an MM/DD/YYYY label or 'earlier', got '" +
      entry.heading + "'");
    return;
  }
  Object.keys(entry).forEach(function (k) {
    assert.ok(ALLOWED_KEYS.indexOf(k) !== -1, where +
      " entry carries forbidden key '" + k + "' — the pack output may " +
      'never grow a content/body/excerpt field (D-13, law 5)');
  });
}

// ---- 1+2. album pack shape + stable order -----------------------------------

(function () {
  const items = fixtureItems(7);
  const spreads = packAlbumPages(items, 3);
  assert.strictEqual(spreads.length, 2,
    '7 items at 3/page pack into 2 two-page spreads (6 + 1)');
  assert.strictEqual(spreads[0].length, 6, 'first spread holds 6');
  assert.strictEqual(spreads[1].length, 1, 'second spread holds the rest');
  // left page first, slots 0..2, then the right page.
  const pages = spreads[0].map(function (e) { return e.page; });
  assert.deepStrictEqual(pages,
    ['left', 'left', 'left', 'right', 'right', 'right'],
    'first 3 entries sit on the left page, next 3 on the right');
  const slots = spreads[0].map(function (e) { return e.slot; });
  assert.deepStrictEqual(slots, [0, 1, 2, 0, 1, 2],
    'slots count 0..2 per page');
  assert.strictEqual(spreads[1][0].page, 'left',
    'the overflow entry starts the next spread on the left page');
  assert.strictEqual(spreads[1][0].slot, 0, 'at slot 0');
  // stable order: itemIds read back in input order across the spreads.
  const ids = [];
  spreads.forEach(function (s) {
    s.forEach(function (e) { ids.push(e.itemId); });
  });
  assert.deepStrictEqual(ids, items.map(function (it) { return it.id; }),
    'input order is preserved exactly');
  // CJK titles verbatim.
  assert.strictEqual(spreads[0][0].title, items[0].title,
    'titles pass through verbatim (CJK included)');
})();

// ---- 3. empty input ----------------------------------------------------------

(function () {
  assert.deepStrictEqual(packAlbumPages([], 3), [],
    'empty album input packs to an empty array — no placeholder pages');
  assert.deepStrictEqual(packJournalToc([], 8), [],
    'empty journal input packs to an empty array');
})();

// ---- 4. structural key guarantee (both functions) -----------------------------

(function () {
  const items = fixtureItems(9);
  packAlbumPages(items, 3).forEach(function (spread) {
    spread.forEach(function (e) { assertAllowedKeys(e, 'packAlbumPages'); });
  });
  packJournalToc(items, 4).forEach(function (page) {
    page.forEach(function (e) {
      assertAllowedKeys(e, 'packJournalToc');
      // the TOC never carries slot/page geometry either — titles and
      // dates only, positioned by the painter.
      assert.ok(!('slot' in e) && !('page' in e),
        'packJournalToc entries are {itemId, title, dateLine} only');
    });
  });
})();

// ---- 5. journal TOC pages ------------------------------------------------------

(function () {
  // fixture items carry NO history → all fall into the ONE 'earlier'
  // group. F15 (手帐 pages): the group owns its pages — EVERY page
  // opens with the 'earlier' heading (a follow-on page's repeated
  // heading IS the quiet continuation marker), so 10 entries at
  // 4 rows/page carry 3 entries each: 4 pages of [4, 4, 4, 2].
  const items = fixtureItems(10);
  const pages = packJournalToc(items, 4);
  assert.strictEqual(pages.length, 4,
    '10 entries + the repeated heading at 4 rows/page → 4 pages');
  assert.deepStrictEqual(
    pages.map(function (p) { return p.length; }), [4, 4, 4, 2],
    'each page opens with its heading and fills with entries; the ' +
    'last takes the rest');
  pages.forEach(function (p, i) {
    assert.deepStrictEqual(p[0], { heading: 'earlier' },
      'page ' + i + " re-opens with the group's own heading (the " +
      'continuation marker is the date line again — no new copy)');
    p.slice(1).forEach(function (e) {
      assert.ok(!e.heading,
        'exactly ONE heading per page — a page never mixes groups');
    });
  });
  const ids = [];
  pages.forEach(function (p) {
    p.forEach(function (e) { if (!e.heading) { ids.push(e.itemId); } });
  });
  assert.deepStrictEqual(ids, items.map(function (it) { return it.id; }),
    'within the earlier group the order is the input order across pages');
  assert.strictEqual(pages[0][1].title, items[0].title,
    'CJK titles verbatim in the TOC');
})();

// ---- 6. date line ---------------------------------------------------------------

(function () {
  // row 0 is the 'earlier' heading (no history on these fixtures); the
  // dated entries follow it in input order.
  const dated = packJournalToc([
    { id: 'a', title: 't', saved_ms: Date.UTC(2026, 6, 22) },
    { id: 'b', title: 'u', created_ms: Date.UTC(2025, 11, 31) },
    { id: 'c', title: 'v' }
  ], 8)[0];
  assert.strictEqual(dated[1].dateLine, '2026-07-22',
    'dateLine is the plain YYYY-MM-DD of saved_ms');
  assert.strictEqual(dated[2].dateLine, '2025-12-31',
    'created_ms stands in when saved_ms is missing');
  assert.strictEqual(dated[3].dateLine, '',
    "a dateless item gets '' — never an invented date");
})();

// ---- 7. input purity --------------------------------------------------------------

(function () {
  const items = fixtureItems(5);
  const snapshot = JSON.stringify(items);
  packAlbumPages(items, 3);
  packJournalToc(items, 4);
  assert.strictEqual(JSON.stringify(items), snapshot,
    'neither pack function mutates its input');
})();

// ---- 8. blessing-day grouping (26.5-09 UAT F13) --------------------------------

(function () {
  // Mirror of the pack's own local-day reading — the pin asserts
  // grouping/order against labels computed the same offset-aware way,
  // so the suite holds in any machine timezone.
  function localLabel(iso) {
    const d = new Date(Date.parse(iso));
    const two = function (n) { return (n < 10 ? '0' : '') + n; };
    return two(d.getMonth() + 1) + '/' + two(d.getDate()) + '/' +
      d.getFullYear();
  }
  function hop(at, to) { return { at: at, from: 'unseen', to: to, via: 'test' }; }
  // Distinct DAYS sit >72h apart so they never merge in any timezone;
  // the two newest blessings sit 2h apart and share a local day almost
  // everywhere (the rare midnight-straddling offset is handled below).
  const T_NEW_LATE = '2026-07-21T10:00:00-07:00';
  const T_NEW_EARLY = '2026-07-21T08:00:00-07:00';
  const T_OLD = '2026-07-14T09:00:00-07:00';
  const T_STALE = '2026-06-01T12:00:00-07:00';
  const items = [
    // input order scrambled on purpose: b (older day) first, the
    // history-less and never-blessed strays interleaved.
    { id: 'b', title: 'older day', history: [hop(T_OLD, 'blessed')] },
    { id: 'd', title: 'no history at all' },
    { id: 'a', title: 'newest day, later hour',
      // the LATEST blessed hop wins — the stale one is superseded.
      history: [hop(T_STALE, 'blessed'), hop(T_NEW_LATE, 'blessed')] },
    { id: 'e', title: 'never blessed',
      history: [hop(T_OLD, 'never_show')] },
    { id: 'c', title: 'newest day, earlier hour',
      history: [hop(T_NEW_EARLY, 'blessed')] }
  ];
  const snapshot = JSON.stringify(items);
  const rows = [];
  packJournalToc(items, 8).forEach(function (p) {
    p.forEach(function (r) { rows.push(r); });
  });
  // shape (in the vast majority of timezones, where the two 07/21
  // blessings share a local day): [newest-day heading, a, c,
  // older-day heading, b, earlier heading, d, e] — 8 rows. In an
  // offset where local midnight falls between the two hops they split
  // into two adjacent newest-first day groups; both orders satisfy the
  // same pins: newest day first, newest blessing first within a day.
  const sameDay = localLabel(T_NEW_LATE) === localLabel(T_NEW_EARLY);
  const expected = sameDay
    ? [localLabel(T_NEW_LATE), 'a', 'c', localLabel(T_OLD), 'b',
      'earlier', 'd', 'e']
    : [localLabel(T_NEW_LATE), 'a', localLabel(T_NEW_EARLY), 'c',
      localLabel(T_OLD), 'b', 'earlier', 'd', 'e'];
  assert.deepStrictEqual(rows.map(function (r) {
    return r.heading || r.itemId;
  }), expected,
    'groups run newest blessed day first, notes within a day newest ' +
    "blessing first, and the blessing-less strays close under 'earlier' " +
    'in input order');
  rows.forEach(function (r) { assertAllowedKeys(r, 'packJournalToc'); });
  assert.strictEqual(JSON.stringify(items), snapshot,
    'grouping never mutates the input items (history included)');
  // law 3 structural check: every heading is immediately followed by at
  // least one entry — an empty date group is impossible.
  rows.forEach(function (r, i) {
    if (r.heading) {
      assert.ok(rows[i + 1] && !rows[i + 1].heading,
        'no heading may stand over an empty group (law 3)');
    }
  });
  // F15 (手帐): dates never share a page — chunk the expected row
  // stream by its headings, then page each group ALONE at 3 rows/page
  // (its heading + 2 entries, the heading repeating on follow-on
  // pages). The full page shape is pinned, not just the lengths.
  const paged = packJournalToc(items, 3);
  const groups = [];
  expected.forEach(function (tok) {
    if (tok === 'earlier' || /^\d{2}\/\d{2}\/\d{4}$/.test(tok)) {
      groups.push({ label: tok, ids: [] });
    } else {
      groups[groups.length - 1].ids.push(tok);
    }
  });
  const wantPages = [];
  groups.forEach(function (g) {
    for (let i = 0; i < g.ids.length; i += 2) {
      wantPages.push([g.label].concat(g.ids.slice(i, i + 2)));
    }
  });
  assert.deepStrictEqual(paged.map(function (p) {
    return p.map(function (r) { return r.heading || r.itemId; });
  }), wantPages,
    'each date owns its page(s): a new date opens a fresh page, a ' +
    'long day repeats its heading, two dates never share a page');
})();

// ---- 9. F15: 手帐 date-per-page exclusivity ------------------------------------

(function () {
  function localLabel(iso) {
    const d = new Date(Date.parse(iso));
    const two = function (n) { return (n < 10 ? '0' : '') + n; };
    return two(d.getMonth() + 1) + '/' + two(d.getDate()) + '/' +
      d.getFullYear();
  }
  function hop(at) {
    return { at: at, from: 'unseen', to: 'blessed', via: 'test' };
  }
  // one busy day (5 notes → 3 pages at 3 rows/page), one small day
  // (1 note), and two blessing-less strays ('earlier'). Days sit >72h
  // apart so they never merge in any machine timezone.
  const DAY_A = '2026-07-20T12:00:00-07:00';
  const DAY_B = '2026-07-10T12:00:00-07:00';
  const items = [];
  for (let i = 0; i < 5; i++) {
    items.push({ id: 'a' + i, title: 'busy ' + i, history: [hop(DAY_A)] });
  }
  items.push({ id: 'b0', title: 'small day', history: [hop(DAY_B)] });
  items.push({ id: 's0', title: 'stray' });
  items.push({ id: 's1', title: 'stray too' });
  const pages = packJournalToc(items, 3); // heading + 2 entries per page
  const A = localLabel(DAY_A);
  const B = localLabel(DAY_B);
  // the whole book shape: the busy day owns THREE pages (its heading
  // repeated byte-identically — the continuation is the date line
  // again), the small day one, 'earlier' one — never a shared page.
  assert.deepStrictEqual(pages.map(function (p) {
    return p.map(function (r) { return r.heading || r.itemId; });
  }), [
    [A, 'a0', 'a1'], [A, 'a2', 'a3'], [A, 'a4'],
    [B, 'b0'],
    ['earlier', 's0', 's1']
  ], 'a multi-page date repeats its own heading; a new date and the ' +
    "'earlier' fallback each start a fresh page; no page mixes groups");
  // structural exclusivity, independent of the fixture shape: every
  // page opens with exactly ONE heading and is never heading-only.
  pages.forEach(function (p, i) {
    assert.ok(p.length >= 2 && p.length <= 3,
      'page ' + i + ' carries its heading and 1-2 entries');
    assert.ok('heading' in p[0], 'page ' + i + ' opens with its heading');
    p.slice(1).forEach(function (r) {
      assert.ok(!('heading' in r),
        'page ' + i + ' holds a single date — two headings can never ' +
        'share a page');
    });
    p.forEach(function (r) { assertAllowedKeys(r, 'packJournalToc'); });
  });
})();

// ---- 10. THE STATION SET (26.8-04, Open Q4 decision of record) ----------------

// The blessings notebook is a station — a DELIBERATE extension of the
// renderStation painter registry and the origin-objects map (its own
// painter; the desk object is its camera origin because the notebook
// seats on the desk). 26.8.1-02 (D-B) retired the journal station, so
// this became a FOUR-station set. 26.9-01 (D-18/D-22, 2026-08-04)
// restored it as the READING DOOR — a FIVE-station set.
//
// PINS MOVED 26.91-04 (D-06, 2026-08-07): 5 -> 4, deliberately. The owner
// retired the reading book, so the set is FOUR again — the same four
// 26.8.1-02 D-B left behind. This pin freezes it: a fifth station must
// extend this list consciously, and a dropped or renamed station fails
// loudly here. The count is taken from `wanted.length`, never a literal, so
// the roster and the count can never disagree. (packJournalToc stays a KEPT
// pure core — its TOC pagination is still exercised by suite 5 above.)
//
// The `journal: 'room-obj-journal'` origin REQUIREMENT 26.9-01 wrote is
// RE-INVERTED below into an absence assertion, with the arc stated. Same
// assertion site, opposite direction, nothing deleted.

(function () {
  const reg = appSrc.match(/var painters = \{[\s\S]*?\};/);
  assert.ok(reg, 'renderStation must declare its painters registry');
  const wanted = [
    'shelf: renderShelfStation',
    'desk: renderDeskStation',
    'album: renderAlbumStation',
    'notebook: renderNotebookStation'
  ];
  assert.strictEqual(wanted.length, 4,
    'the station roster is pinned BY VALUE at 4 — it is consumed by a bare ' +
    '.forEach below, so a vanished entry would drop an assertion silently');
  wanted.forEach(function (line) {
    assert.ok(reg[0].indexOf(line) !== -1,
      "the painter registry must carry '" + line + "' (the four-" +
      'station set, Open Q4 + 26.91 D-06)');
  });
  const names = reg[0].match(/render\w+Station/g) || [];
  assert.strictEqual(names.length, wanted.length,
    'the station set holds exactly ' + wanted.length + ' painters — a ' +
    'fifth station must extend this pin deliberately');
  const origins = appSrc.match(/var STATION_ORIGIN_OBJECTS = \{[\s\S]*?\};/);
  assert.ok(origins, 'the origin-objects map must be declared');
  assert.ok(origins[0].indexOf("notebook: 'room-obj-desk'") !== -1,
    'the notebook station pushes the camera into the desk object — ' +
    'the notebook seats on the desk (D-15)');
  // RE-INVERTED 26.91-04 (D-06, 2026-08-07). 26.9-01 D-18 REQUIRED this
  // origin key ("the reading door pushes into its OWN object — the reading
  // book seats on the bench, not on the desk"); D-06 retired the object, so
  // the key must be ABSENT. The arc is stated, not erased.
  assert.strictEqual(origins[0].indexOf("journal: 'room-obj-journal'"), -1,
    'STATION_ORIGIN_OBJECTS must NOT carry the reading door\'s origin key ' +
    "— journal: 'room-obj-journal' was a REQUIREMENT under 26.9 D-18 and " +
    'is a BAN under 26.91 D-06 (the object it names no longer exists)');
  const originKeys = (origins[0].match(/^\s{4}\w+:/gm) || []).length;
  assert.strictEqual(originKeys, wanted.length,
    'STATION_ORIGIN_OBJECTS holds exactly ' + wanted.length + ' entries ' +
    '— it moves with the painter registry or one of them is stale');
})();

// ---- 11. packSessionReading — the reading door's pack -----------------------
// ---- REWRITTEN 26.91-04 (D-06, 2026-08-07) as G-A3: behaviour -> ABSENCE ----
//
// DISPOSITION: rewritten, not deleted. 26.9-01 authored this section to
// exercise packSessionReading's behaviour — heading set by equality, dedupe,
// silent fence drop, honest page math, input purity. 26.91 D-06 retired the
// reading book and the packer with it, so there is no behaviour left to
// exercise. The section keeps its number and its header and now asserts the
// packer's ABSENCE, which is the only true thing left to say about it.
//
// A test that pinned behaviour the owner later changed gets REWRITTEN, never
// deleted. Deleting suites 11-14 would have removed ~590 lines of the sweep
// and left the node total looking healthy while coverage of a whole surface
// silently vanished — a deletion-shaped fix indistinguishable from losing
// coverage, which is exactly what a by-value sweep total exists to catch.
//
// G-A3 READS THE EVALUATED MODULE, NEVER FILE TEXT. `loadPack` lifts a
// function out of app.js by name and evaluates it; a source grep would be
// satisfied by a comment, and this file's own header names the packer.

const CORE = require('../core.js');
const STUDY = CORE.StudyCore || CORE;
const READING_HEADINGS = ['the librarian set these out', 'new in the room'];

(function testG_A3_packerIsGoneFromTheEvaluatedModule() {
  // The lift is DRIVEN first: it must still succeed for a packer that IS
  // there, or "throws" below would prove nothing about the retired one.
  let liveOk = false;
  try {
    liveOk = typeof loadPack('packJournalToc') === 'function';
  } catch (e) { liveOk = false; }
  assert.ok(liveOk,
    'loadPack must still lift a SURVIVING packer (packJournalToc) — ' +
    'otherwise the absence assertion below is satisfied by a broken lifter ' +
    'rather than by the removal, which is an instrument that cannot go red');

  let result = 'lifted';
  try {
    const lifted = loadPack('packSessionReading');
    result = (lifted === null || lifted === undefined) ? 'null' : 'lifted';
  } catch (e) {
    result = 'threw';
  }
  assert.notStrictEqual(result, 'lifted',
    "loadPack('packSessionReading') still returns a function — the reading " +
    "door's packer must be gone from app.js (26.91 D-06). Read from the " +
    'EVALUATED lift, never from file text.');

  // The core half of G-A3: the selector is gone from the EVALUATED export
  // table, and the survivor D-07 depends on is untouched.
  assert.strictEqual(typeof STUDY.pickSessionReading, 'undefined',
    'StudyCore.pickSessionReading must be undefined on the evaluated ' +
    'export — 26.91 D-06 removed the reading door\'s gated selector');
  assert.strictEqual(typeof STUDY.selectLibrarianSuggestions, 'function',
    'StudyCore.selectLibrarianSuggestions must SURVIVE untouched — it is ' +
    "D-07's carrier in plan 05, and NOT the `suggested` line that lived " +
    'inside the removed selector. This is the pin that stops a removal ' +
    'from taking the proposing path down with it (law 7).');
  assert.strictEqual(typeof STUDY.countPileByType, 'function',
    'and countPileByType, its unrelated neighbour, is untouched too');
})();

// ---- 12. a FULLY GUARDED-OUT cohort leaves no trace -------------------------
// ---- REWRITTEN 26.91-04 (D-06, 2026-08-07) ---------------------------------
//
// DISPOSITION: rewritten, not deleted. 26.9-02 authored this section to prove
// a fully fenced cohort emitted no heading — a law-5 property of the retired
// packer. With the packer gone the property has no subject.
//
// What the section asserts NOW is the reason it existed: THE TWO PROVENANCE
// HEADINGS MUST NOT RENDER ANYWHERE. They were the only strings that named
// the reading door in rendered copy, and a heading leaking from some other
// surface would resurrect exactly the read D-06 removed. Comment-stripped,
// because app.js's own retirement notes discuss this surface.

(function testG_A3_headingVocabularyIsGone() {
  const appCode = appSrc.split('\n')
    .map(function (l) { return l.replace(/^(\s*)\/\/.*$/, '$1'); })
    .join('\n');
  assert.ok(/var ROOM_OBJECT_IDS/.test(appCode),
    'the comment stripper must keep live code — it did not');
  assert.strictEqual(READING_HEADINGS.length, 2,
    'the retired heading vocabulary is pinned BY VALUE at 2');
  READING_HEADINGS.forEach(function (h) {
    assert.ok(('x ' + h + ' y').indexOf(h) !== -1,
      'the exact-literal matcher for ' + JSON.stringify(h) + ' cannot ' +
      'match a fixture that contains it — the ban below cannot go red');
    assert.strictEqual(appCode.indexOf(h), -1,
      'app.js still carries the retired provenance heading ' +
      JSON.stringify(h) + ' in live code — 26.91 D-06 retired the surface ' +
      'that rendered it');
  });
  // The near-miss the librarian legitimately ships must stay untouched.
  // Verified in source 2026-08-07: app.js says `set out for you` twice.
  assert.ok(appCode.split('set out for you').length - 1 >= 2,
    'app.js must still ship the librarian\'s `set out for you` copy — the ' +
    'ban above is on the EXACT retired literals and must never be ' +
    'broadened to `set out`, which would fail correct, working code');
})();

// ---- 13. the THREE-STATE render predicate ----------------------------------
// ---- REWRITTEN 26.91-04 (D-06, 2026-08-07) ---------------------------------
//
// DISPOSITION: rewritten, not deleted. 26.9-02 authored this section as a
// lifted-DOM harness that ran renderJournalStation and paintJournalPage over
// a fake element tree to tell `pending` from `empty` from `rows`. Both
// painters were removed by D-06, so the harness has nothing to lift.
//
// The section now asserts the removal took BOTH painters and every symbol the
// harness lifted alongside them — the "nothing left dead" half of a clean
// removal, which no other suite checks by name. extractFn/extractVar throw on
// a missing symbol, so the assertion is that each lift FAILS.

(function testG_A3_stationSymbolsAreAllGone() {
  const GONE = [
    { kind: 'fn', name: 'renderJournalStation' },
    { kind: 'fn', name: 'paintJournalPage' },
    { kind: 'var', name: 'SESSION_READING_PER_PAGE' },
    { kind: 'var', name: 'STATION_JOURNAL_GEOM' },
    { kind: 'var', name: 'JOURNAL_EMPTY_LINE' },
    { kind: 'var', name: 'JOURNAL_EMPTY_LINE_FALLBACK' }
  ];
  assert.strictEqual(GONE.length, 6,
    'the retired-symbol roster is pinned BY VALUE at 6 — it is consumed by ' +
    'a bare .forEach, so a dropped entry would drop an assertion silently');

  // DRIVE THE LIFTERS: each must still succeed on a SURVIVING symbol of the
  // same kind, or "it threw" below is evidence of a broken lifter, not of a
  // removal. This is the p === n trap in its lifter form.
  assert.ok(typeof extractFn(appSrc, 'renderNotebookStation') === 'string',
    'extractFn must still lift a surviving painter (renderNotebookStation)');
  assert.ok(typeof extractVar(appSrc, 'STATION_NOTEBOOK_GEOM') === 'string',
    'extractVar must still lift a surviving table (STATION_NOTEBOOK_GEOM)');

  GONE.forEach(function (sym) {
    let lifted = true;
    try {
      if (sym.kind === 'fn') { extractFn(appSrc, sym.name); }
      else { extractVar(appSrc, sym.name); }
    } catch (e) {
      lifted = false;
    }
    assert.strictEqual(lifted, false,
      'app.js still declares `' + sym.name + '` — the reading door was ' +
      'removed WHOLE by 26.91 D-06: no painter, no geometry table, no ' +
      'empty-state copy and no page size survive into the freeze');
  });
})();

// ---- 14. the pinned empty-state copy and its shared slot -------------------
// ---- REWRITTEN 26.91-04 (D-06, 2026-08-07) — the SURVIVING half ------------
//
// DISPOSITION: rewritten, not deleted. 26.9-02 authored this section to pin
// the reading book's two empty-state lines by length and to pin its `empty`
// slot deep-equal to the SHIPPED notebook `invite` slot — the two were the
// same box, on purpose, so a fork would fail loudly.
//
// The reading book's half is gone. THE NOTEBOOK'S HALF IS NOT, and this is
// the blast-radius question a removal has to answer: a removal that took the
// notebook's invite slot with it — or moved it — would break a surface this
// plan never meant to touch. That is what the section asserts now, by the
// SAME evalVar extraction it always used, and a second, independent home for
// the same fact is tests/test_diegetic_wiring.cjs group 16d (different
// extraction method, on purpose, so the two cannot both be fooled alike).
//
// The day-formatter call-site pin that sat beside it is rewritten with it:
// the formatter it named was handed to the removed selector, but the COUNT
// of day-shaped formatters in app.js is a live, unrelated fact and stays.

(function testG_A3_notebookInviteSlotSurvives() {
  const evalVar = (name) =>
    // eslint-disable-next-line no-new-func
    new Function(extractVar(appSrc, name) + '\nreturn ' + name + ';')();

  const ng = evalVar('STATION_NOTEBOOK_GEOM');
  assert.deepStrictEqual(ng.invite, { x: 96, y: 92, w: 192, h: 32 },
    'STATION_NOTEBOOK_GEOM.invite is the shipped box BY VALUE — retiring ' +
    'the reading book must not move or take the box the two surfaces ' +
    'shared. This is the blast-radius pin for the removal.');

  // The shipped notebook invite copy is untouched by a removal elsewhere.
  const invite = extractFn(appSrc, 'renderNotebookStation');
  assert.ok(typeof invite === 'string' && invite.length > 0,
    'the notebook painter survives — it is the single book now');

  // UNRELATED AND DELIBERATELY UNCHANGED: app.js declares exactly TWO
  // day-shaped formatters. 26.9-02 pinned this beside the reading door's
  // call site; the call site is gone but the fact is live, and narrowing or
  // dropping a neighbouring guard to accommodate a removal is forbidden.
  assert.strictEqual(
    (appSrc.match(/function\s+\w*[Dd]ay(Label|Key)\s*\(/g) || []).length, 2,
    'app.js declares exactly TWO day-shaped formatters — blessingDayLabel ' +
    'and blessingMonthKey. 26.91-04 introduced neither a third nor a variant.');
})();

console.log('test_station_pack OK (album spread shape, stable order, ' +
  'empty input, structural key guarantee, journal TOC date-per-page ' +
  '手帐 pagination + blessing-day grouping, date line, input purity, ' +
  'FOUR-station set pins + the re-inverted origin ban, 26.91-04 G-A3: ' +
  'the reading door\'s packer + selector + painters + geometry + copy are ' +
  'gone from the EVALUATED module, selectLibrarianSuggestions survives, ' +
  'and the notebook\'s shared invite slot is untouched)');
